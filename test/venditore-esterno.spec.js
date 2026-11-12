#!/usr/bin/env node
// F15.22 (decisione E2, approvata da Erika il 12/11 come sola etichetta) -
// Agente esterno / venditore interno. Chrome headless con puppeteer-core,
// SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh, poi sql/226).
//  1. rappresentante (venditore interno) a 390 px: menu, PAGINE_RUOLO,
//     clienti/progetti/preventivi/commesse/trattative letti dal sito;
//  2. titolare: Impostazioni > Team, etichetta "Venditore interno", bottone
//     "🏷️ Interno/esterno", partita IVA sbagliata fermata dal sito, poi
//     "Agente esterno" con "IT 012 345 678 90" → 01234567890 nel database e
//     "Agente esterno" nel Team; il registro delle azioni ha chi;
//  3. lo stesso rappresentante, ora esterno, a 390 px: tutto UGUALE al punto
//     1 (menu, pagine, conteggi, bottoni delle pagine Clienti e Progetti),
//     solo i suoi clienti; console: esterno e partita IVA 42501, telefono sì;
//  4. titolare "Entra come" il rappresentante: console 42501;
//  5. segreteria e Acquisti: console sulla propria riga 42501;
//  6. guide info-rap-37 e info-tit-38.
// VENDITORE_SENZA_SQL=1: senza sql/226 (Team come prima: niente etichetta né
// bottone, nessun errore).
// Alla fine il rappresentante torna interno senza partita IVA.
// Uso: cd test && node venditore-esterno.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-venditore-esterno');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.22';
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
  const SENZA = CONF.VENDITORE_SENZA_SQL === '1';
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const con226 = psql("select to_regprocedure('public.trg_utenti_esterno()') is not null") === 't';
  if (SENZA && con226) fermati('VENDITORE_SENZA_SQL=1 ma sql/226 c\'è: esegui prima il ROLLBACK');
  if (!SENZA && !con226) fermati('sql/226 non c\'è sul database locale');
  const rapId = psql("select c.rappresentante_id from public.clienti c join public.utenti u on u.id = c.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where c.eliminato_il is null group by 1 order by count(*) desc, 1 limit 1");
  if (!SENZA) psql('update public.utenti set esterno = false, partita_iva_venditore = null where id = ' + q(rapId));

  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const tit = utenti.find(u => u.ruolo === 'titolare');
  const com = utenti.find(u => u.ruolo === 'commerciale');
  const seg = utenti.find(u => u.ruolo === 'segreteria');
  const rap = BACK.perId[rapId];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const errori = (s, chi) => {
    const js = s.stato.erroriJs.concat(s.stato.console.filter(t => !/404|PGRST|Cosa tocca a me/.test(t)));
    const rete = s.stato.rete.filter(x => x.status >= 500 || /does not exist|could not find the .*column/i.test(x.msg));
    if (js.length || rete.length) KO(chi + ': errori ' + JSON.stringify(js.concat(rete)).slice(0, 400));
    else ok(chi + ': nessun errore JavaScript né 5xx');
  };
  const consoleUtente = (s, id, upd) => s.page.evaluate(async (id, upd) => {
    const r = await db.from('utenti').update(upd).eq('id', id).select('id');
    return r.error ? r.error.code : (r.data || []).length;
  }, id, upd);
  // quello che vede il rappresentante: menu, pagine, conteggi, bottoni
  const fotografia = async s => {
    const base = await s.page.evaluate(async () => {
      // i progetti di prova di altri test sullo stesso database locale non contano
      const conta = async (t, col) => { let x = db.from(t).select('id', { count: 'exact', head: true }); if (col) x = x.not(col, 'ilike', '%prova%').not(col, 'ilike', '%smoke%'); const r = await x; return r.error ? 'err ' + r.error.code : r.count; };
      return {
        ruolo: ROLE,
        pagine: (PAGINE_RUOLO.rappresentante || []).join(','),
        menu: [...document.querySelectorAll('#ntabs .nb')].map(b => b.textContent.replace(/\s+/g, ' ').trim()).join('|'),
        clienti: await conta('clienti'), progetti: await conta('progetti_tecnici', 'titolo'), preventivi: await conta('preventivi'),
        commesse: await conta('commesse'), trattative: await conta('pipeline_crm')
      };
    });
    for (const pg of ['clienti', 'progetti']) {
      await s.page.evaluate(pg => gotoPage(pg), pg);
      await attendiQuiete(s.stato, 1500);
      base['bottoni_' + pg] = await s.page.evaluate(pg => [...document.querySelectorAll('#pg-' + pg + ' button')].filter(b => b.offsetParent)
        .map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(t => t && !/PROVA|SMOKE/.test(t)).filter((t, i, a) => a.indexOf(t) === i).sort().join('|'), pg);
    }
    await s.page.evaluate(() => gotoPage('dashboard'));
    await attendiQuiete(s.stato, 800);
    return base;
  };

  try {
    // 1. rappresentante interno
    let r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);
    const prima = await fotografia(r);
    if (prima.ruolo !== 'rappresentante' || typeof prima.clienti !== 'number' || prima.clienti < 1) KO('1: dati del rappresentante ' + JSON.stringify(prima)); else ok('1: rappresentante interno: ' + prima.clienti + ' clienti, ' + prima.progetti + ' progetti, ' + prima.preventivi + ' preventivi, ' + prima.commesse + ' commesse, ' + prima.menu.split('|').length + ' voci di menu, ' + (prima.bottoni_clienti + '|' + prima.bottoni_progetti).split('|').length + ' bottoni');
    const visibiliDb = Number(psql('select count(*) from public.clienti where rappresentante_id = ' + q(rapId)));
    errori(r, 'rappresentante (interno)');
    await chiudi(r);

    // 2. titolare nel Team
    r = await apriSito(browser, url); sessioni.push(r);
    await login(r, tit);
    await r.page.evaluate(() => gotoPage('impostazioni'));
    await r.page.waitForFunction(() => document.querySelector('#teamlist table'), { timeout: 20000 });
    await attendiQuiete(r.stato, 1000);
    const riga = () => r.page.evaluate(id => {
      const tr = [...document.querySelectorAll('#teamlist tr')].find(x => [...x.querySelectorAll('button')].some(b => (b.getAttribute('onclick') || '').includes(id)));
      return tr ? { testo: tr.innerText.replace(/\s+/g, ' '), bottone: [...tr.querySelectorAll('button')].some(b => /Interno\/esterno/.test(b.textContent)) } : null;
    }, rapId);
    let rt = await riga();
    if (SENZA) {
      if (!rt || rt.bottone || /Venditore interno|Agente esterno/.test(rt.testo)) KO('2: senza sql/226 il Team è cambiato ' + JSON.stringify(rt)); else ok('2: senza sql/226 nessuna etichetta né bottone');
      const altri = await r.page.evaluate(() => /Venditore interno|Agente esterno|Interno\/esterno/.test(document.querySelector('#teamlist').innerText));
      if (altri) KO('2: etichetta senza sql/226'); else ok('2: Team come prima');
    } else {
      if (!rt || !rt.bottone || !/Venditore interno/.test(rt.testo)) KO('2: riga del Team ' + JSON.stringify(rt)); else ok('2: "Venditore interno" e "🏷️ Interno/esterno" sulla riga del rappresentante');
      const etichetteNonRapp = await r.page.evaluate(() => [...document.querySelectorAll('#teamlist tr')].filter(tr => !/Rappresentante/.test(tr.cells[1] ? tr.cells[1].innerText : '') && /Venditore interno|Agente esterno/.test(tr.innerText)).length);
      if (etichetteNonRapp) KO('2: etichetta su ' + etichetteNonRapp + ' utenti non rappresentanti'); else ok('2: etichetta solo sui rappresentanti');
      const regSql = "select count(*) from public.registro_azioni where tabella = 'utenti' and record_id = " + q(rapId) + " and campo = 'esterno' and utente_reale = " + q(tit.id);
      const reg0 = Number(psql(regSql));
      await r.page.evaluate(id => apriVenditoreEsterno(id), rapId);
      await r.page.waitForSelector('#m-venditore-esterno.on, #m-venditore-esterno.open', { timeout: 5000 }).catch(() => {});
      await r.page.click('#vde-esterno');
      await r.page.$eval('#vde-piva', el => { el.value = ''; });
      await r.page.type('#vde-piva', '0123456');
      await r.page.click('#vde-salva');
      await attendiQuiete(r.stato, 800);
      if (psql('select esterno from public.utenti where id = ' + q(rapId)) !== 'f') KO('2: salvato con la partita IVA corta'); else ok('2: partita IVA di 7 cifre fermata dal sito');
      await r.page.$eval('#vde-piva', el => { el.value = ''; });
      await r.page.type('#vde-piva', 'IT 012 345 678 90');
      await r.page.click('#vde-salva');
      await attendiQuiete(r.stato, 1500);
      const db1 = psql("select esterno || '|' || coalesce(partita_iva_venditore, '') from public.utenti where id = " + q(rapId));
      if (db1 !== 'true|01234567890') KO('2: database ' + db1); else ok('2: salvato agente esterno con P.IVA 01234567890');
      rt = await riga();
      if (!rt || !/Agente esterno/.test(rt.testo) || !/01234567890/.test(rt.testo)) KO('2: Team dopo il salvataggio ' + JSON.stringify(rt)); else ok('2: Team: "Agente esterno" e la partita IVA');
      const reg = Number(psql(regSql)) - reg0;
      if (reg !== 1) KO('2: registro delle azioni ' + reg); else ok('2: registro delle azioni con il titolare');
      await r.page.setViewport({ width: 390, height: 844 });
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, 'team-titolare-390.png'), fullPage: true });
    }
    await r.page.evaluate(() => gotoPage('info'));
    await attendiQuiete(r.stato, 500);
    if (!(await r.page.evaluate(() => !!document.querySelector('#guida-titolare #info-tit-38')))) KO('guida info-tit-38 assente'); else ok('guida info-tit-38');
    errori(r, 'titolare');
    await chiudi(r);

    // 3. rappresentante esterno
    r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);
    const dopo = await fotografia(r);
    const diversi = Object.keys(prima).filter(k => String(prima[k]) !== String(dopo[k]));
    if (diversi.length) KO('3: da esterno cambia ' + diversi.map(k => k + ': ' + prima[k] + ' → ' + dopo[k]).join('; ')); else ok('3: da ' + (SENZA ? 'interno' : 'agente esterno') + ' tutto uguale (menu, pagine, conteggi, tipi di bottoni di Clienti e Progetti)');
    if (dopo.clienti !== visibiliDb) KO('3: clienti visti ' + dopo.clienti + ', suoi ' + visibiliDb); else ok('3: vede solo i suoi ' + visibiliDb + ' clienti');
    if (!SENZA) {
      let c = await consoleUtente(r, rapId, { esterno: false });
      if (c !== '42501') KO('3: console esterno del rappresentante ' + c); else ok('3: console del rappresentante su esterno rifiutata (42501)');
      c = await consoleUtente(r, rapId, { partita_iva_venditore: '11111111111' });
      if (c !== '42501') KO('3: console partita IVA del rappresentante ' + c); else ok('3: console del rappresentante sulla partita IVA rifiutata (42501)');
      const tel = psql('select coalesce(telefono, \'\') from public.utenti where id = ' + q(rapId));
      c = await consoleUtente(r, rapId, { telefono: tel || null });
      if (c !== 1) KO('3: il rappresentante non salva più il telefono ' + c); else ok('3: il rappresentante cambia il suo telefono come prima');
    }
    await r.page.evaluate(() => gotoPage('info'));
    await attendiQuiete(r.stato, 500);
    if (!(await r.page.evaluate(() => !!document.querySelector('#guida-rappresentante #info-rap-37')))) KO('guida info-rap-37 assente'); else ok('guida info-rap-37');
    await r.page.screenshot({ path: path.join(CARTELLA_OUT, 'rappresentante-390.png'), fullPage: false });
    errori(r, 'rappresentante (esterno)');
    await chiudi(r);

    if (!SENZA) {
      // 4. titolare "come" il rappresentante
      r = await apriSito(browser, url); sessioni.push(r);
      await login(r, tit);
      await r.page.evaluate(id => { sessionStorage.setItem('toli_entra_come', id); location.reload(); }, rapId).catch(() => {});
      await r.page.waitForFunction(() => typeof ROLE !== 'undefined' && ROLE === 'rappresentante' && document.querySelector('.page.on'), { timeout: 25000 });
      await attendiQuiete(r.stato, 1500);
      const c = await consoleUtente(r, rapId, { esterno: false });
      if (c !== '42501' || !r.stato.agitoCome) KO('4: titolare come rappresentante ' + c + ' (x-agito-come ' + r.stato.agitoCome + ')'); else ok('4: titolare "Entra come" rappresentante rifiutato (42501)');
      await chiudi(r);

      // 5. segreteria e Acquisti
      for (const [u, nome] of [[seg, 'segreteria'], [com, 'Acquisti']]) {
        r = await apriSito(browser, url); sessioni.push(r);
        await login(r, u);
        const c1 = await consoleUtente(r, u.id, { esterno: true });
        const c2 = await consoleUtente(r, rapId, { esterno: false });
        if (c1 !== '42501' || c2 === 1) KO('5: console di ' + nome + ' ' + c1 + ' / ' + c2); else ok('5: console di ' + nome + ' rifiutata (propria riga 42501, riga del rappresentante ' + c2 + ')');
        errori(r, nome);
        await chiudi(r);
      }
      if (psql('select esterno from public.utenti where id = ' + q(rapId)) !== 't') KO('5: il rappresentante non è più esterno'); else ok('5: resta agente esterno');
    }
  } catch (e) {
    KO('eccezione: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
  } finally {
    for (const s of sessioni) await chiudi(s);
    try { await browser.close(); } catch (e) { /* già chiuso */ }
    srv.close();
    if (!SENZA) { try { psql('update public.utenti set esterno = false, partita_iva_venditore = null where id = ' + q(rapId)); } catch (e) { KO('pulizia: ' + e.message); } }
  }
  righe.forEach(x => console.log(x));
  fallimenti.forEach(x => console.log('FALLITO ' + x));
  console.log(fallimenti.length ? 'ESITO: FALLITO (' + fallimenti.length + ')' : 'ESITO: TUTTO OK' + (SENZA ? ' (senza sql/226)' : ''));
  process.exit(fallimenti.length ? 1 : 0);
})();
