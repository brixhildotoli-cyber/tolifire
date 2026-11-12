#!/usr/bin/env node
// F15.21 - Proposte di nuovi campi (sql/91). Chrome headless con
// puppeteer-core, SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh).
//  1. ingegnere a 390 px: catalogo porte REI con "➕ Aggiungi campo" come
//     prima e "➕ Proponi un campo"; due proposte (menu "Tipo di specchiatura"
//     e testo "Nota sul telaio"); scheda del motore di un progetto di prova
//     con il link "➕ Proponi un campo" che apre la finestra sulla porta REI;
//     console: approvazione e scrittura diretta rifiutate;
//  2. titolare: riga "📝 Proposte di campi da valutare" in Cosa tocca a me con
//     il numero del database, conteggio in Impostazioni, elenco; approva la
//     prima aggiungendo "Con griglia" (campo facoltativo, non serve al
//     prezzo, base, in fondo), rifiuta la seconda con il motivo;
//  3. ingegnere: il campo nuovo è in fondo alla scheda del motore (progetto
//     dopo), nel catalogo "✅ Approvata" e "✖ Rifiutata" con il motivo;
//  4. Acquisti e titolare "come" ingegnere: rifiutati dal database;
//  5. guide info-ing-32 e info-tit-37.
// PROPOSTE_SENZA_SQL=1: prova senza sql/91 (niente bottone, link né riga;
// "➕ Aggiungi campo" come prima; nessun errore).
// Alla fine proposte, campi e progetto di prova si tolgono.
// Uso: cd test && node proposte-campi.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-proposte-campi');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.21';
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
  const SENZA = CONF.PROPOSTE_SENZA_SQL === '1';
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const con91 = psql("select to_regclass('public.lavorazioni_proposte_campi') is not null") === 't';
  if (SENZA && con91) fermati('PROPOSTE_SENZA_SQL=1 ma sql/91 c\'è: esegui prima il ROLLBACK');
  if (!SENZA && !con91) fermati('sql/91 non c\'è sul database locale');
  const pulisci = () => {
    psql("delete from public.progetti_tecnici where titolo like 'PROVA F15.21%'");
    if (psql("select to_regclass('public.lavorazioni_proposte_campi') is not null") === 't') {
      psql("set session_replication_role = replica; delete from public.lavorazioni_proposte_campi where etichetta like 'PROVA F15.21%'");
    }
    psql("set session_replication_role = replica; delete from public.lavorazioni_campi where etichetta like 'PROVA F15.21%'");
  };
  pulisci();
  const riga = psql("select c.id || '|' || c.rappresentante_id from public.clienti c join public.utenti u on u.id = c.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where c.eliminato_il is null order by c.id limit 1");
  const [cliId, rapId] = riga.split('|');
  const progetto = psql("insert into public.progetti_tecnici (cliente_id, rappresentante_id, titolo, tipologia, descrizione_tecnica, stato) values (" +
    q(cliId) + ', ' + q(rapId) + ", 'PROVA F15.21 proposte di campi', 'porte_rei', 'prova', 'bozza') returning id").split('\n')[0];
  psql("update public.progetti_tecnici set stato = 'in_verifica_tecnica' where id = " + q(progetto));
  const maxOrdine = Number(psql("select max(c.ordine) from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = 'porte_rei'"));

  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const tit = utenti.find(u => u.ruolo === 'titolare');
  const ing = utenti.find(u => u.ruolo === 'ingegnere');
  const com = utenti.find(u => u.ruolo === 'commerciale');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const errori = (s, chi) => {
    const js = s.stato.erroriJs.concat(s.stato.console.filter(t => !/404|PGRST|Cosa tocca a me/.test(t)));
    const rete = s.stato.rete.filter(x => x.status >= 500 || /could not find the .*column/i.test(x.msg) || (/does not exist/i.test(x.msg) && !SENZA));
    if (js.length || rete.length) KO(chi + ': errori ' + JSON.stringify(js.concat(rete)).slice(0, 400));
    else ok(chi + ': nessun errore JavaScript né 5xx');
  };
  const catalogo = async s => {
    await s.page.evaluate(async () => { await apriCatalogoLavorazioni('porte_rei'); });
    await attendiQuiete(s.stato, 1500);
    return s.page.evaluate(() => ({
      aggiungi: [...document.querySelectorAll('#cl-contenuto button')].some(b => b.textContent.trim() === '➕ Aggiungi campo'),
      proponi: !!document.getElementById('cl-proponi-campo'),
      proposte: ((document.getElementById('cl-proposte') || {}).innerText || '').replace(/\s+/g, ' ')
    }));
  };
  const apriMotore = async s => {
    await s.page.evaluate(async id => { await apriSchedaMotore(id, 'porte_rei'); }, progetto);
    await attendiQuiete(s.stato, 1800);
  };
  const scriviProposta = async (s, d) => {
    await s.page.evaluate(d => {
      document.getElementById('pcl-etichetta').value = d.etichetta;
      document.getElementById('pcl-tipo').value = d.tipo; aggiornaTipoPropostaCampo();
      (d.valori || []).forEach(x => { document.getElementById('pcl-nuovo-valore').value = x; aggiungiValorePropostaCampo(); });
      document.getElementById('pcl-uso').value = d.uso;
      document.getElementById('pcl-nota').value = d.nota || '';
    }, d);
    await s.page.click('#pcl-invia');
    await attendiQuiete(s.stato, 1200);
  };

  try {
    // 1. ingegnere a 390 px
    let r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, ing);
    let cat = await catalogo(r);
    if (!cat.aggiungi) KO('1: "➕ Aggiungi campo" sparito dal catalogo'); else ok('1: "➕ Aggiungi campo" come prima');
    if (SENZA) {
      if (cat.proponi || cat.proposte) KO('1: senza sql/91 c\'è il bottone o il riquadro'); else ok('1: senza sql/91 niente "➕ Proponi un campo"');
      await r.page.evaluate(() => closeM('m-catalogo-lavorazioni'));
      await apriMotore(r);
      const link = await r.page.evaluate(() => !!document.getElementById('msm-proponi-campo') + '|' + !!document.getElementById('msm-campi'));
      if (link !== 'false|true') KO('1: motore senza sql/91 ' + link); else ok('1: scheda del motore senza il link, come prima');
      errori(r, 'ingegnere');
      await chiudi(r);
      r = await apriSito(browser, url); sessioni.push(r);
      await login(r, tit);
      const tam = await righeTAM(r, 'titolare');
      if (tam.some(t => t.id === 'proposte-campi-titolare')) KO('2: riga del titolare senza sql/91'); else ok('2: nessuna riga "Proposte di campi" senza sql/91');
      await r.page.evaluate(async () => { gotoPage('impostazioni'); });
      await attendiQuiete(r.stato, 2000);
      if (await r.page.evaluate(() => !!document.getElementById('si-proposte-campi'))) KO('2: conteggio in Impostazioni senza sql/91'); else ok('2: Impostazioni come prima');
      errori(r, 'titolare');
      await chiudi(r);
    } else {
      if (!cat.proponi) KO('1: bottone "➕ Proponi un campo" assente'); else ok('1: bottone "➕ Proponi un campo" sotto "➕ Aggiungi campo"');
      await r.page.click('#cl-proponi-campo');
      await attendiQuiete(r.stato, 600);
      const lav0 = await r.page.evaluate(() => document.getElementById('m-proposta-campo').classList.contains('on') && document.getElementById('pcl-lavorazione').value);
      if (lav0 !== 'porte_rei') KO('1: finestra della proposta ' + lav0); else ok('1: finestra della proposta sulla porta REI');
      // menu senza risposte: fermato dal sito
      await r.page.evaluate(() => { document.getElementById('pcl-etichetta').value = 'PROVA F15.21 vuoto'; document.getElementById('pcl-tipo').value = 'menu'; document.getElementById('pcl-uso').value = 'uso'; });
      await r.page.click('#pcl-invia');
      await attendiQuiete(r.stato, 600);
      if (Number(psql("select count(*) from public.lavorazioni_proposte_campi where etichetta like 'PROVA F15.21%'")) !== 0) KO('1: menu senza risposte inviato');
      else ok('1: menu senza risposte fermato dal sito');
      await scriviProposta(r, { etichetta: 'PROVA F15.21 Tipo di specchiatura', tipo: 'menu', valori: ['Cieca', 'Con vetro'], uso: 'Descrizione della porta nel preventivo', nota: 'Lo chiedono i clienti' });
      const p1 = psql("select id || '|' || stato || '|' || proposta_da || '|' || jsonb_array_length(valori_ammessi) from public.lavorazioni_proposte_campi where etichetta = 'PROVA F15.21 Tipo di specchiatura'");
      const [id1, st1, da1, nv1] = p1.split('|');
      if (st1 !== 'in_attesa' || da1 !== ing.id || nv1 !== '2') KO('1: proposta nel database ' + p1); else ok('1: proposta "Tipo di specchiatura" in attesa, 2 risposte, dell\'ingegnere');
      cat = await catalogo(r);
      if (!/In attesa del titolare/.test(cat.proposte)) KO('1: proposta non elencata nel catalogo ' + cat.proposte); else ok('1: nel catalogo "⏳ In attesa del titolare"');
      await r.page.evaluate(() => closeM('m-catalogo-lavorazioni'));
      // dalla scheda del motore
      await apriMotore(r);
      const haLink = await r.page.evaluate(() => !!document.querySelector('#msm-proponi-campo a'));
      if (!haLink) KO('1: link "➕ Proponi un campo" assente nel motore'); else ok('1: link "➕ Proponi un campo" nella scheda del motore');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, 'ingegnere-motore-390.png'), fullPage: true });
      await r.page.click('#msm-proponi-campo a');
      await attendiQuiete(r.stato, 600);
      const sopra = await r.page.evaluate(() => {
        const m = document.getElementById('m-proposta-campo');
        return m.classList.contains('on') && document.getElementById('pcl-lavorazione').value;
      });
      if (sopra !== 'porte_rei') KO('1: dal motore la finestra non si apre sulla porta REI ' + sopra); else ok('1: dal motore la finestra si apre sulla porta REI');
      await scriviProposta(r, { etichetta: 'PROVA F15.21 Nota sul telaio', tipo: 'testo', uso: 'Note per il fornitore' });
      const id2 = psql("select id from public.lavorazioni_proposte_campi where etichetta = 'PROVA F15.21 Nota sul telaio' and stato = 'in_attesa'");
      if (!id2) KO('1: seconda proposta dal motore non salvata'); else ok('1: seconda proposta inviata dalla scheda del motore');
      const modaleMotore = await r.page.evaluate(() => document.getElementById('m-rilievo-tecnico').classList.contains('on'));
      if (!modaleMotore) KO('1: la scheda del motore si è chiusa'); else ok('1: la scheda del motore resta aperta');
      // console dell'ingegnere
      const cons = await r.page.evaluate(async id => {
        const a = await db.rpc('approva_proposta_campo', { p_id: Number(id), p_etichetta: 'X', p_codice: 'x_prova', p_tipo: 'testo', p_unita: null, p_valori: null, p_uso: 'uso a valle', p_livello: 'base' });
        const b = await db.from('lavorazioni_proposte_campi').update({ stato: 'rifiutata' }).eq('id', id).select('id');
        return (a.error ? a.error.code : 'passato') + '|' + (b.error ? b.error.code : (b.data || []).length);
      }, id1);
      if (!/^42501\|42501$/.test(cons)) KO('1: console dell\'ingegnere ' + cons); else ok('1: console dell\'ingegnere: approvazione e update diretto rifiutati (42501)');
      errori(r, 'ingegnere');
      await chiudi(r);

      // 2. titolare
      r = await apriSito(browser, url); sessioni.push(r);
      await login(r, tit);
      let tam = await righeTAM(r, 'titolare');
      let x = tam.find(t => t.id === 'proposte-campi-titolare');
      const nDb = Number(psql("select count(*) from public.lavorazioni_proposte_campi where stato = 'in_attesa'"));
      if (!x || Number(x.n) !== nDb || !/Proposte di campi da valutare/.test(x.testo)) KO('2: riga del titolare ' + JSON.stringify(x) + ' attesi ' + nDb);
      else ok('2: riga "' + x.testo + '" (database ' + nDb + ')');
      await r.page.evaluate(async () => { gotoPage('impostazioni'); });
      await attendiQuiete(r.stato, 2500);
      const imp = await r.page.evaluate(() => ((document.getElementById('si-proposte-campi') || {}).innerText || '').replace(/\s+/g, ' '));
      if (!new RegExp(nDb + ' propost').test(imp)) KO('2: Impostazioni "' + imp + '"'); else ok('2: Impostazioni "' + imp + '"');
      await r.page.evaluate(async () => { await apriProposteCampi(); });
      await attendiQuiete(r.stato, 1200);
      await r.page.evaluate(id => { [...document.querySelectorAll('#pce-contenuto .pcl-riga')].find(d => d.dataset.proposta === String(id)).querySelector('button').click(); }, id1);
      await attendiQuiete(r.stato, 800);
      const fin = await r.page.evaluate(() => ({ on: document.getElementById('m-proposta-campo').classList.contains('on'),
        codice: document.getElementById('pcl-codice').value, approva: getComputedStyle(document.getElementById('pcl-approva')).display !== 'none',
        invia: getComputedStyle(document.getElementById('pcl-invia')).display === 'none', valori: document.querySelectorAll('#pcl-valori input').length }));
      if (!fin.on || !fin.approva || !fin.invia || fin.valori !== 2 || !/^prova_f15_21_tipo_di_specchiatura/.test(fin.codice)) KO('2: finestra di approvazione ' + JSON.stringify(fin));
      else ok('2: finestra di approvazione con codice ' + fin.codice + ' e 2 risposte');
      await r.page.evaluate(() => { document.getElementById('pcl-nuovo-valore').value = 'Con griglia'; aggiungiValorePropostaCampo(); document.getElementById('pcl-codice').value = 'tipo_specchiatura_prova'; document.getElementById('pcl-codice').dataset.toccato = '1'; });
      await r.page.click('#pcl-approva');
      await attendiQuiete(r.stato, 1500);
      const campo = psql("select c.codice || '|' || c.obbligatorio || '|' || c.serve_al_prezzo || '|' || c.livello || '|' || c.ordine || '|' || jsonb_array_length(c.valori_ammessi) || '|' || c.attivo " +
        "from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = 'porte_rei' and c.etichetta = 'PROVA F15.21 Tipo di specchiatura'");
      const atteso = 'tipo_specchiatura_prova|false|false|base|' + Math.min(maxOrdine + 10, 9999) + '|3|true';
      if (campo !== atteso) KO('2: campo nel catalogo ' + campo + ' atteso ' + atteso); else ok('2: campo approvato facoltativo, non serve al prezzo, base, in fondo, 3 risposte');
      const st = psql('select stato || \'|\' || codice_campo from public.lavorazioni_proposte_campi where id = ' + id1);
      if (st !== 'approvata|tipo_specchiatura_prova') KO('2: proposta ' + st); else ok('2: proposta approvata');
      // rifiuto della seconda
      await r.page.evaluate(async id => { await apriPropostaCampo('decidi', Number(id)); }, id2);
      await attendiQuiete(r.stato, 600);
      await r.page.click('#pcl-rifiuta');
      await attendiQuiete(r.stato, 600);
      if (psql('select stato from public.lavorazioni_proposte_campi where id = ' + id2) !== 'in_attesa') KO('2: rifiutata senza motivo'); else ok('2: rifiuto senza motivo fermato dal sito');
      await r.page.evaluate(() => { document.getElementById('pcl-motivo').value = 'C\'è già il campo Note'; });
      await r.page.click('#pcl-rifiuta');
      await attendiQuiete(r.stato, 1200);
      const st2 = psql('select stato || \'|\' || motivo_rifiuto from public.lavorazioni_proposte_campi where id = ' + id2);
      if (st2 !== 'rifiutata|C\'è già il campo Note') KO('2: rifiuto ' + st2); else ok('2: proposta rifiutata con il motivo');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, 'titolare-proposte.png') });
      await r.page.evaluate(() => closeM('m-proposte-campi'));
      tam = await righeTAM(r, 'titolare');
      x = tam.find(t => t.id === 'proposte-campi-titolare');
      if (x) KO('2: riga del titolare rimasta ' + JSON.stringify(x)); else ok('2: riga del titolare sparita (nessuna proposta in attesa)');
      // titolare "come" ingegnere
      let come = '';
      try { await rest('/rpc/rifiuta_proposta_campo', tokenDi(tit), { metodo: 'POST', corpo: { p_id: Number(id1), p_motivo: 'prova come' }, headers: { 'x-agito-come': ing.id } }); come = 'passato'; } catch (e) { come = e.message; }
      if (!/42501/.test(come)) KO('4: titolare come ingegnere non rifiutato: ' + come); else ok('4: titolare "come" ingegnere rifiutato (42501)');
      await r.page.evaluate(async () => { gotoPage('info'); });
      await attendiQuiete(r.stato, 500);
      if (!(await r.page.evaluate(() => !!document.querySelector('#guida-titolare #info-tit-37')))) KO('5: guida info-tit-37 assente'); else ok('5: guida info-tit-37');
      errori(r, 'titolare');
      await chiudi(r);

      // 3. ingegnere: il campo nuovo è in fondo alla scheda (progetto dopo)
      r = await apriSito(browser, url); sessioni.push(r);
      await r.page.setViewport({ width: 390, height: 844 });
      await login(r, ing);
      await apriMotore(r);
      const ultimo = await r.page.evaluate(() => {
        const el = document.getElementById('msm-c-tipo_specchiatura_prova');
        const tutti = [...document.querySelectorAll('#msm-campi [id^="msm-c-"]')].filter(e => !/-(nn|non-noto)$/.test(e.id)).map(e => e.id);
        return { c: !!el, opzioni: el ? [...el.options].map(o => o.textContent).join(',') : '', ultimo: tutti[tutti.length - 1], obbl: el ? /\*/.test((el.closest('.f') || {}).innerText || '') : null };
      });
      if (!ultimo.c || !/Cieca/.test(ultimo.opzioni) || !/Con griglia/.test(ultimo.opzioni) || ultimo.obbl) KO('3: campo nel motore ' + JSON.stringify(ultimo));
      else ok('3: "PROVA F15.21 Tipo di specchiatura" nella scheda del motore, senza *, risposte ' + ultimo.opzioni + ' (ultimo campo: ' + ultimo.ultimo + ')');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, 'ingegnere-campo-nuovo-390.png'), fullPage: true });
      await r.page.evaluate(() => closeM('m-rilievo-tecnico'));
      cat = await catalogo(r);
      if (!/Approvata/.test(cat.proposte) || !/Rifiutata/.test(cat.proposte) || !/C'è già il campo Note/.test(cat.proposte)) KO('3: esiti nel catalogo ' + cat.proposte);
      else ok('3: nel catalogo "✅ Approvata" e "✖ Rifiutata" con il motivo');
      await r.page.evaluate(async () => { closeM('m-catalogo-lavorazioni'); gotoPage('info'); });
      await attendiQuiete(r.stato, 500);
      if (!(await r.page.evaluate(() => !!document.querySelector('#guida-ingegnere #info-ing-32')))) KO('5: guida info-ing-32 assente'); else ok('5: guida info-ing-32');
      errori(r, 'ingegnere (dopo)');
      await chiudi(r);

      // 4. Acquisti (console)
      r = await apriSito(browser, url); sessioni.push(r);
      await login(r, com);
      const c4 = await r.page.evaluate(async () => {
        const a = await db.rpc('proponi_campo_lavorazione', { p_lavorazione: 'porte_rei', p_etichetta: 'PROVA F15.21 Acquisti', p_tipo: 'testo', p_unita: null, p_valori: null, p_uso: 'uso a valle', p_nota: null });
        const b = await db.from('lavorazioni_proposte_campi').select('id');
        return (a.error ? a.error.code : 'passato') + '|' + (b.error ? b.error.code : (b.data || []).length);
      });
      if (c4 !== '42501|0') KO('4: console di Acquisti ' + c4); else ok('4: Acquisti: proposta rifiutata (42501) e nessuna proposta letta');
      errori(r, 'Acquisti');
      await chiudi(r);
    }
  } catch (e) {
    KO('eccezione: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
  } finally {
    for (const s of sessioni) await chiudi(s);
    try { await browser.close(); } catch (e) { /* già chiuso */ }
    srv.close();
    try { pulisci(); } catch (e) { KO('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  fallimenti.forEach(x => console.log('FALLITO ' + x));
  console.log(fallimenti.length ? 'ESITO: FALLITO (' + fallimenti.length + ')' : 'ESITO: TUTTO OK' + (SENZA ? ' (senza sql/91)' : ''));
  process.exit(fallimenti.length ? 1 : 0);
})();
