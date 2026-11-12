#!/usr/bin/env node
// F15.19 (versione ridotta, decisione di Erika del 12/11) - Coda
// dell'ingegnere: giorni di attesa, urgenza del titolare, riga del titolare
// "⏳ Progetti fermi dall'ingegnere". Chrome headless con puppeteer-core,
// SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh). Tre progetti di
// prova in verifica tecnica (A arrivato 5 giorni lavorativi fa, B oggi, C 2
// giorni lavorativi fa: data di ingresso scritta nella loro cronologia).
//  1. titolare: Verifiche tecniche in ordine di arrivo con "In attesa da N
//     giorni lavorativi"; "🚨 Segna urgente" su B → B in cima con il badge;
//     scheda progetto con badge e "Togli urgente"; riga ⏳ con lo stesso
//     numero calcolato dal database (giorni_lavorativi_tra di sql/63);
//  2. ingegnere a 390 px: badge, attesa, nessun bottone dell'urgenza,
//     "🔧 Gestisci verifica" come prima, riga "Verifiche tecniche aperte"
//     con "di cui N da più di 1 giorno lavorativo"; console rifiutata 42501;
//  3. Acquisti e segreteria: console rifiutata; titolare "come" ingegnere
//     (x-agito-come) rifiutato;
//  4. guide info-ing-30 e info-tit-36.
// CODA_SENZA_SQL=1: prova senza sql/89 (niente badge né bottone, attesa,
// ordine e riga del titolare sì, nessun errore).
// Alla fine i progetti di prova si tolgono.
// Uso: cd test && node coda-ingegnere-tempi.spec.js   (uscita 0 = TUTTO OK)
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const TEST = __dirname;
const REPO = path.resolve(TEST, '..');
const SITO = path.resolve(process.env.SMOKE_SITO_DIR || REPO);

function leggiEnv(file) {
  const p = path.isAbsolute(file) ? file : path.join(TEST, file);
  if (!fs.existsSync(p)) return {};
  const out = {};
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(r => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(r);
    if (m && !r.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return out;
}
const CONF = Object.assign({}, leggiEnv(process.env.SMOKE_ENV_FILE || '.smoke-locale.env'), process.env);
const CHROME = CONF.SMOKE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-coda-ingegnere');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.19';
const SK_PROD = null;
const BACK = { rest: CONF.SMOKE_REST_URL.replace(/\/$/, ''), segreto: CONF.SMOKE_JWT_SECRET };
// ── Token di prova (solo locale) ───────────────────────────────────────
const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function firma(payload) {
  const testa = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const corpo = b64u(JSON.stringify(payload));
  const f = crypto.createHmac('sha256', BACK.segreto).update(testa + '.' + corpo).digest();
  return testa + '.' + corpo + '.' + b64u(f);
}
function verifica(token) {
  const p = String(token || '').split('.');
  if (p.length !== 3) return null;
  const f = b64u(crypto.createHmac('sha256', BACK.segreto).update(p[0] + '.' + p[1]).digest());
  if (f !== p[2]) return null;
  try { return JSON.parse(Buffer.from(p[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); } catch (e) { return null; }
}
const ora = () => Math.floor(Date.now() / 1000);
const tokenAnon = () => firma({ role: 'anon', iss: 'smoke', iat: ora(), exp: ora() + 7200 });
const tokenServizio = () => firma({ role: 'service_role', iss: 'smoke', iat: ora(), exp: ora() + 7200 });
const utenteAuth = u => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() });
function sessione(u) {
  const access = firma({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, iss: 'smoke', iat: ora(), exp: ora() + 3600 });
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: ora() + 3600, refresh_token: 'smoke-' + u.id, user: utenteAuth(u) };
}

// ── Sito servito in locale (cartella del repository, solo lettura) ─────
const TIPI = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
function avviaSito() {
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(SITO, p));
      // Niente fuori dal sito e niente cartelle private (sql/, test/, .git)
      if (!file.startsWith(SITO + path.sep) || /^\/(sql|test|\.git|gestione-task|supabase)(\/|$)/.test(p) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end();
      }
      res.writeHead(200, { 'content-type': TIPI[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

async function rest(percorso, token, opzioni) {
  opzioni = opzioni || {};
  const r = await fetch(BACK.rest + percorso, { method: opzioni.metodo || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' }, opzioni.headers || {}), body: opzioni.corpo ? JSON.stringify(opzioni.corpo) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error('database locale: ' + r.status + ' ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}
const tokenDi = u => sessione(u).access_token;

// ── Instradamento delle richieste del sito (come smoke.spec.js) ────────
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range, content-profile, preference-applied' };
// Firme in blocco (createSignedUrls, 11/11): un link per percorso
function firmeInBloccoProva(bucket, corpo) {
  let paths = [];
  try { paths = JSON.parse(corpo || '{}').paths || []; } catch (e) { paths = []; }
  return paths.map(p => ({ path: p, signedURL: '/object/sign/' + bucket + '/' + p + '?token=smoke', error: null }));
}

function json(status, corpo) { return { status, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: corpo === undefined ? '' : JSON.stringify(corpo) }; }

async function rispostaLocale(req, url, stato) {
  const metodo = req.method();
  const p = url.pathname;
  const h = req.headers();
  if (metodo === 'OPTIONS') return { status: 204, headers: CORS, body: '' };
  if (p.startsWith('/rest/v1')) {
    const auth = (h.authorization || '').replace(/^Bearer\s+/i, '');
    const intest = {};
    // F14.18: anche x-agito-come (fetch personalizzato di js/01)
    ['accept', 'content-type', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile', 'x-agito-come'].forEach(k => { if (h[k]) intest[k] = h[k]; });
    if (h['x-agito-come']) { stato.agitoCome++; stato.agitoComeValori.add(h['x-agito-come']); }
    intest.authorization = 'Bearer ' + (verifica(auth) ? auth : tokenAnon());
    const corpo = ['GET', 'HEAD'].includes(metodo) ? undefined : req.postData();
    const r = await fetch(BACK.rest + p.slice('/rest/v1'.length) + url.search, { method: metodo, headers: intest, body: corpo });
    const testo = metodo === 'HEAD' ? '' : await r.text();
    const out = Object.assign({}, CORS);
    ['content-type', 'content-range', 'preference-applied'].forEach(k => { const x = r.headers.get(k); if (x) out[k] = x; });
    return { status: r.status, headers: out, body: testo };
  }
  if (p.startsWith('/auth/v1')) {
    if (p === '/auth/v1/token') {
      const tipo = url.searchParams.get('grant_type');
      const dati = JSON.parse(req.postData() || '{}');
      let u = null;
      if (tipo === 'password') u = BACK.perEmail[String(dati.email || '').toLowerCase()];
      if (tipo === 'refresh_token') u = BACK.perId[String(dati.refresh_token || '').replace(/^smoke-/, '')];
      if (!u || (tipo === 'password' && !dati.password)) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return json(200, sessione(u));
    }
    if (p === '/auth/v1/user') {
      const c = verifica((h.authorization || '').replace(/^Bearer\s+/i, ''));
      const u = c && BACK.perId[c.sub];
      return u ? json(200, utenteAuth(u)) : json(401, { msg: 'JWT non valido' });
    }
    if (p === '/auth/v1/logout') return { status: 204, headers: CORS, body: '' };
    return json(200, {});
  }
  if (p.startsWith('/storage/v1')) {
    // Locale: nessun file vero. I caricamenti riescono e si contano.
    const m = /^\/storage\/v1\/object\/(list|sign|public|authenticated|info)?\/?(.*)$/.exec(p);
    if (metodo === 'POST' && m && m[1] === 'list') return json(200, []);
    if (metodo === 'POST' && m && m[1] === 'sign') return json(200, m[2].includes('/') ? { signedURL: '/object/sign/' + m[2] + '?token=smoke' } : firmeInBloccoProva(m[2], req.postData()));
    if ((metodo === 'POST' || metodo === 'PUT') && m && !m[1]) { stato.caricamenti.push(m[2]); return json(200, { Key: m[2], Id: crypto.randomUUID() }); }
    if (metodo === 'DELETE') return json(200, []);
    return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found (smoke test locale)' });
  }
  if (p.startsWith('/functions/v1')) return json(200, {});
  return json(404, { message: 'smoke test: percorso non gestito ' + p });
}

async function preparaPagina(contesto, stato) {
  const page = await contesto.newPage();
  await page.setViewport({ width: LARGHEZZA, height: 900 });
  const cdp = await page.target().createCDPSession();
  fs.mkdirSync(path.join(CARTELLA_OUT, 'download'), { recursive: true });
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: path.join(CARTELLA_OUT, 'download') });
  await page.setRequestInterception(true);
  page.on('request', async req => {
    let url;
    try { url = new URL(req.url()); } catch (e) { return req.continue(); }
    const supabase = /(^|\.)supabase\.(co|in)$/.test(url.hostname);
    if (!supabase) return req.continue();
    // Ogni richiesta verso Supabase: deviata al database di prova o bloccata.
    if (url.host !== HOST_PROD) { stato.bloccate.push(url.host); return req.abort(); }
    if (false) {
      const h = Object.assign({}, req.headers());
      h.apikey = BACK.chiave;
      if (!h.authorization || h.authorization === 'Bearer ' + SK_PROD) h.authorization = 'Bearer ' + BACK.chiave;
      const nuovo = BACK.url + url.pathname + url.search;
      stato.deviate.add(req);
      return req.continue({ url: nuovo, headers: h });
    }
    stato.inCorso++;
    try {
      const x = await rispostaLocale(req, url, stato);
      if (x.status >= 400 && req.method() !== 'OPTIONS') registraErroreRete(stato, req.method(), url, x.status, x.body);
      await req.respond({ status: x.status, headers: x.headers, body: x.body });
    } catch (e) {
      registraErroreRete(stato, req.method(), url, 599, String(e.message));
      try { await req.respond(json(502, { message: 'smoke test: ' + e.message })); } catch (e2) { /* già chiusa */ }
    } finally { stato.inCorso--; stato.ultima = Date.now(); }
  });
  if (false) {
    const fine = r => { if (stato.deviate.delete(r)) stato.ultima = Date.now(); };
    page.on('requestfinished', r => { if (!stato.deviate.has(r)) return; fine(r); const s = r.response() && r.response().status(); if (s >= 400 && r.method() !== 'OPTIONS') registraErroreRete(stato, r.method(), new URL(r.url()), s, ''); });
    page.on('requestfailed', fine);
  }
  page.on('pageerror', e => stato.erroriJs.push(String(e.message).split('\n')[0].slice(0, 220)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return;
    stato.console.push(t.slice(0, 220));
  });
  page.on('dialog', d => {
    stato.dialoghi.push(d.message());
    if (stato.rifiutaConferma && d.type() === 'confirm') return d.dismiss();
    d.accept(d.type() === 'prompt' ? (d.defaultValue() || ETICHETTA) : undefined);
  });
  return page;
}

function registraErroreRete(stato, metodo, url, status, corpo) {
  let msg = '';
  try { const j = JSON.parse(corpo || '{}'); msg = j.message || j.msg || j.error_description || j.error || ''; } catch (e) { msg = String(corpo || '').slice(0, 120); }
  const dove = url.pathname.replace(/^\/(rest|auth|storage)\/v1/, '') + (url.pathname.includes('/rest/') ? '' : '');
  stato.rete.push({ metodo, dove, status, msg: String(msg).slice(0, 200) });
}

async function attendiQuiete(stato, minimo = 350, massimo = 15000) {
  const t0 = Date.now();
  await new Promise(r => setTimeout(r, minimo));
  while (Date.now() - t0 < massimo) {
    if (stato.inCorso <= 0 && stato.deviate.size === 0 && Date.now() - (stato.ultima || 0) > 400) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

// ── Prova ──────────────────────────────────────────────────────────────
const SOLO = (CONF.SMOKE_SOLO_RUOLI || 'commerciale').split(',').map(x => x.trim()).filter(Boolean);
const diProva = u => /(^|[^a-z])(prova|test|smoke)/i.test([u.nome, u.cognome, u.email].join(' '));

async function apriSito(browser, url) {
  const contesto = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const stato = { inCorso: 0, deviate: new Set(), ultima: 0, erroriJs: [], console: [], rete: [], bloccate: [], caricamenti: [], agitoCome: 0, agitoComeValori: new Set(), dialoghi: [] };
  const page = await preparaPagina(contesto, stato);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('lp')).display !== 'none', { timeout: 20000 });
  return { contesto, stato, page };
}
async function login(s, utente) {
  await s.page.type('#lem', utente.email);
  await s.page.type('#lpw', 'prova-locale');
  await s.page.click('#lbtn');
  await s.page.waitForFunction(() => typeof ROLE !== 'undefined' && ROLE && ME && document.querySelector('.page.on'), { timeout: 25000 });
  await attendiQuiete(s.stato, 1200);
}
// ── psql sul container locale (solo per preparare e controllare) ───────
const { spawnSync } = require('child_process');
const CONTAINER = CONF.SMOKE_DB_CONTAINER || 'toli-smoke-db';
function psql(sql) {
  const r = spawnSync(process.env.DOCKER || 'docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', sql],
    { encoding: 'utf8', env: Object.assign({}, process.env, { PATH: process.env.PATH + ':' + path.join(os.homedir(), '.docker/bin') }) });
  if (r.status !== 0) throw new Error('psql: ' + (r.stderr || r.stdout).trim().slice(0, 300));
  return r.stdout.trim();
}
const attendi = ms => new Promise(r => setTimeout(r, ms));


async function chiudi(s) { if (s.chiuso) return; s.chiuso = true; try { await s.contesto.close(); } catch (e) { /* già chiuso */ } }
const q = s => "'" + String(s).replace(/'/g, "''") + "'";

async function righeTAM(s, ruolo) {
  await s.page.evaluate(async () => { if (typeof toccaAMeTutteAperte !== 'undefined') toccaAMeTutteAperte = true; if (typeof caricaToccaAMe === 'function') await caricaToccaAMe(); });
  await attendiQuiete(s.stato, 1500);
  return s.page.evaluate(ruolo => [...document.querySelectorAll('#' + BOX_TOCCA_A_ME[ruolo] + ' .tam-riga')].map(b => ({
    id: b.dataset.fonte, urgente: b.classList.contains('urgente'),
    n: (b.querySelector('.tam-num') || {}).textContent, testo: b.innerText.replace(/\s+/g, ' ')
  })), ruolo);
}

(async () => {
  const righe = [];
  const fallimenti = [];
  const KO = m => fallimenti.push(m);
  const ok = m => righe.push('ok  ' + m);
  const SENZA = CONF.CODA_SENZA_SQL === '1';
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const con89 = psql("select to_regprocedure('public.urgente_progetti_attivo()') is not null") === 't';
  if (SENZA && con89) fermati('CODA_SENZA_SQL=1 ma sql/89 c\'è: esegui prima il ROLLBACK');
  if (!SENZA && !con89) fermati('sql/89 non c\'è sul database locale');
  const riga = psql("select c.id || '|' || c.rappresentante_id from public.clienti c join public.utenti u on u.id = c.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where c.eliminato_il is null order by c.id limit 1");
  const [cliId, rapId] = riga.split('|');
  psql("delete from public.progetti_tecnici where titolo like 'PROVA F15.19%'");
  const crea = (nome, gg) => {
    const id = psql("insert into public.progetti_tecnici (cliente_id, rappresentante_id, titolo, tipologia, descrizione_tecnica, stato) values (" +
      q(cliId) + ', ' + q(rapId) + ', ' + q('PROVA F15.19 ' + nome) + ", 'porte_rei', 'prova coda', 'bozza') returning id").split('\n')[0];
    psql("update public.progetti_tecnici set stato = 'in_verifica_tecnica' where id = " + q(id));
    // data di ingresso: gg giorni lavorativi fa alle 10 (ora italiana)
    psql("update public.progetti_tecnici_storico set creato_il = (public.aggiungi_gg_lav(current_date, -" + gg + ") + time '10:00') at time zone 'Europe/Rome' where progetto_id = " + q(id) + " and stato_successivo = 'in_verifica_tecnica'");
    psql("update public.progetti_tecnici set aggiornato_il = now() where id = " + q(id));
    return id;
  };
  const A = crea('A', 5), B = crea('B', 0), C = crea('C', 2);
  const fermiDb = () => Number(psql(
    "select count(*) from public.progetti_tecnici p cross join lateral (select coalesce((select s.creato_il from public.progetti_tecnici_storico s where s.progetto_id = p.id and s.stato_successivo = 'in_verifica_tecnica' and s.stato_precedente is distinct from 'in_verifica_tecnica' order by s.creato_il desc limit 1), p.aggiornato_il) as ingresso) i " +
    "where p.stato = 'in_verifica_tecnica' and public.giorni_lavorativi_tra((i.ingresso at time zone 'Europe/Rome')::date, (now() at time zone 'Europe/Rome')::date) > 1"));

  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const tit = utenti.find(u => u.ruolo === 'titolare');
  const ing = utenti.find(u => u.ruolo === 'ingegnere');
  const com = utenti.find(u => u.ruolo === 'commerciale');
  const seg = utenti.find(u => u.ruolo === 'segreteria');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const errori = (s, chi) => {
    const js = s.stato.erroriJs.concat(s.stato.console.filter(t => !/404|PGRST|Cosa tocca a me/.test(t)));
    const rete = s.stato.rete.filter(x => x.status >= 500 || /does not exist|could not find the .*column/i.test(x.msg));
    if (js.length || rete.length) KO(chi + ': errori ' + JSON.stringify(js.concat(rete)).slice(0, 400));
    else ok(chi + ': nessun errore JavaScript né 5xx');
  };
  const carte = s => s.page.evaluate(() => [...document.querySelectorAll('#verifiche-tecniche-lista .card')]
    .filter(c => /PROVA F15\.19/.test(c.innerText) && /Gestisci verifica/.test(c.innerText))
    .map(c => ({ testo: c.innerText.replace(/\s+/g, ' '), urgente: /🚨 Urgente/.test(c.innerText),
                 bottone: [...c.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /urgente/i.test(t)) })));
  const nome = t => (/PROVA F15\.19 ([ABC])/.exec(t) || [])[1];
  const consoleUrgente = async (s, id) => s.page.evaluate(async id => {
    const r = await db.from('progetti_tecnici').update({ urgente: false }).eq('id', id).select('id');
    return r.error ? r.error.code : (r.data || []).length;
  }, id);

  try {
    // 1. titolare
    let r = await apriSito(browser, url); sessioni.push(r);
    await login(r, tit);
    await r.page.evaluate(() => gotoPage('verifiche-tecniche'));
    await attendiQuiete(r.stato, 1500);
    let cc = await carte(r);
    const ordine0 = cc.map(c => nome(c.testo)).join('');
    if (ordine0 !== 'ACB') KO('1: ordine di arrivo atteso ACB, trovato ' + ordine0); else ok('1: ordine di arrivo A, C, B');
    const tA = cc.find(c => nome(c.testo) === 'A'), tB = cc.find(c => nome(c.testo) === 'B');
    if (!tA || !/In attesa da 5 giorni lavorativi/.test(tA.testo)) KO('1: attesa di A ' + (tA && tA.testo)); else ok('1: A "In attesa da 5 giorni lavorativi"');
    if (!tB || !/In attesa da meno di 1 giorno lavorativo/.test(tB.testo)) KO('1: attesa di B ' + (tB && tB.testo)); else ok('1: B "meno di 1 giorno lavorativo"');
    if (SENZA) {
      if (cc.some(c => c.bottone.length || c.urgente)) KO('1: senza sql/89 c\'è un bottone o un badge'); else ok('1: senza sql/89 niente bottone né badge');
    } else {
      if (!tB || tB.bottone[0] !== '🚨 Segna urgente') KO('1: bottone Segna urgente su B ' + JSON.stringify(tB && tB.bottone));
      await r.page.evaluate(() => { const c = [...document.querySelectorAll('#verifiche-tecniche-lista .card')].find(c => /PROVA F15\.19 B/.test(c.innerText)); [...c.querySelectorAll('button')].find(b => /Segna urgente/.test(b.textContent)).click(); });
      await attendiQuiete(r.stato, 1500);
      cc = await carte(r);
      const ordine1 = cc.map(c => nome(c.testo)).join('');
      if (ordine1 !== 'BAC' || !cc[0].urgente || cc[0].bottone[0] !== 'Togli urgente') KO('1: dopo Segna urgente atteso BAC con badge, trovato ' + ordine1 + ' ' + JSON.stringify(cc[0]));
      else ok('1: "🚨 Segna urgente" su B: B in cima con il badge e "Togli urgente"');
      const db1 = psql('select urgente from public.progetti_tecnici where id = ' + q(B));
      const reg = psql("select count(*) from public.registro_azioni where tabella = 'progetti_tecnici' and record_id = " + q(B) + " and campo = 'urgente' and utente_reale = " + q(tit.id));
      if (db1 !== 't' || reg !== '1') KO('1: database urgente ' + db1 + ' registro ' + reg); else ok('1: urgente nel database e nel registro delle azioni');
    }
    let tam = await righeTAM(r, 'titolare');
    let x = tam.find(t => t.id === 'verifiche-ferme-titolare');
    const nFermi = fermiDb();
    if (!x || Number(x.n) !== nFermi || !x.urgente || !/da più di 1 giorno lavorativo/.test(x.testo)) KO('1: riga ⏳ del titolare ' + JSON.stringify(x) + ' attesi ' + nFermi);
    else ok('1: riga del titolare "' + x.testo + '" (database ' + nFermi + ')');
    await r.page.evaluate(B => openProgettoDetail(B), B);
    await attendiQuiete(r.stato, 1500);
    const pd = await r.page.evaluate(() => (document.getElementById('pd-attesa-urgenza') || {}).innerText || '');
    if (!/In verifica tecnica: in attesa da meno di 1 giorno lavorativo/.test(pd) || (SENZA ? /urgente/i.test(pd) : !/🚨 Urgente/.test(pd) || !/Togli urgente/.test(pd))) KO('1: scheda progetto "' + pd + '"');
    else ok('1: scheda progetto "' + pd.replace(/\s+/g, ' ') + '"');
    await r.page.screenshot({ path: path.join(CARTELLA_OUT, 'titolare-scheda.png') });
    if (!SENZA) {
      // titolare "come" ingegnere (console del database con x-agito-come)
      let come = '';
      try { await rest('/progetti_tecnici?id=eq.' + B, tokenDi(tit), { metodo: 'PATCH', corpo: { urgente: false }, headers: { 'x-agito-come': ing.id } }); come = 'passato'; } catch (e) { come = e.message; }
      if (!/42501/.test(come)) KO('3: titolare come ingegnere non rifiutato: ' + come); else ok('3: titolare "come" ingegnere rifiutato (42501)');
    }
    await r.page.evaluate(async () => { gotoPage('info'); });
    await attendiQuiete(r.stato, 500);
    if (!(await r.page.evaluate(() => !!document.querySelector('#guida-titolare #info-tit-36')))) KO('guida info-tit-36 assente'); else ok('guida info-tit-36');
    errori(r, 'titolare');
    await chiudi(r);

    // 2. ingegnere a 390 px
    r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, ing);
    tam = await righeTAM(r, 'ingegnere');
    x = tam.find(t => t.id === 'verifiche-tecniche');
    if (!x || !/di cui \d+ da più di 1 giorno lavorativo/.test(x.testo) || (!SENZA && !/1 urgente/.test(x.testo))) KO('2: riga dell\'ingegnere ' + JSON.stringify(x));
    else ok('2: riga dell\'ingegnere "' + x.testo + '"');
    await r.page.evaluate(() => gotoPage('verifiche-tecniche'));
    await attendiQuiete(r.stato, 1500);
    cc = await carte(r);
    const ordine2 = cc.map(c => nome(c.testo)).join('');
    if (ordine2 !== (SENZA ? 'ACB' : 'BAC')) KO('2: ordine dell\'ingegnere ' + ordine2); else ok('2: ordine dell\'ingegnere ' + ordine2);
    if (cc.some(c => c.bottone.length)) KO('2: l\'ingegnere ha un bottone dell\'urgenza'); else ok('2: nessun bottone dell\'urgenza per l\'ingegnere');
    if (!SENZA && !cc[0].urgente) KO('2: badge 🚨 non visibile all\'ingegnere'); else if (!SENZA) ok('2: badge 🚨 Urgente visibile all\'ingegnere');
    if (!cc.every(c => /Gestisci verifica/.test(c.testo) && /In attesa da/.test(c.testo))) KO('2: Gestisci verifica o attesa mancanti'); else ok('2: "🔧 Gestisci verifica" e attesa su ogni progetto');
    await r.page.screenshot({ path: path.join(CARTELLA_OUT, 'ingegnere-390.png'), fullPage: true });
    if (!SENZA) {
      const c = await consoleUrgente(r, B);
      if (c !== '42501') KO('2: console dell\'ingegnere ' + c); else ok('2: console dell\'ingegnere rifiutata (42501)');
    }
    await r.page.evaluate(async () => { gotoPage('info'); });
    await attendiQuiete(r.stato, 500);
    if (!(await r.page.evaluate(() => !!document.querySelector('#guida-ingegnere #info-ing-30')))) KO('guida info-ing-30 assente'); else ok('guida info-ing-30');
    errori(r, 'ingegnere');
    await chiudi(r);

    // 3. Acquisti e segreteria (console)
    if (!SENZA) {
      for (const [u, ruolo] of [[com, 'Acquisti'], [seg, 'segreteria']]) {
        r = await apriSito(browser, url); sessioni.push(r);
        await login(r, u);
        const c = await consoleUrgente(r, B);
        if (c !== '42501') KO('3: console di ' + ruolo + ' ' + c); else ok('3: console di ' + ruolo + ' rifiutata (42501)');
        errori(r, ruolo);
        await chiudi(r);
      }
      if (psql('select urgente from public.progetti_tecnici where id = ' + q(B)) !== 't') KO('3: B non è più urgente'); else ok('3: B resta urgente');
    }
  } catch (e) {
    KO('eccezione: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
  } finally {
    for (const s of sessioni) await chiudi(s);
    try { await browser.close(); } catch (e) { /* già chiuso */ }
    srv.close();
    try { psql("delete from public.progetti_tecnici where titolo like 'PROVA F15.19%'"); } catch (e) { KO('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  fallimenti.forEach(x => console.log('FALLITO ' + x));
  console.log(fallimenti.length ? 'ESITO: FALLITO (' + fallimenti.length + ')' : 'ESITO: TUTTO OK' + (SENZA ? ' (senza sql/89)' : ''));
  process.exit(fallimenti.length ? 1 : 0);
})();
