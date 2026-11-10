#!/usr/bin/env node
// F14.9 - Smoke test automatico per ruolo (Chrome headless con puppeteer-core).
//
// Per ognuno dei 9 ruoli: login dal modulo del sito, controllo che
// PAGINE_RUOLO del sito sia uguale all'elenco atteso qui sotto (ATTESE),
// apertura di ogni pagina del ruolo (errori JavaScript, errori del database,
// pagina non aperta = FALLITO) e un salvataggio di prova per le pagine
// principali: cliente (segreteria e rappresentante), intervento (capo
// tecnico), progetto tecnico (rappresentante), preventivo (commerciale).
// I dati di prova si chiamano "SMOKE TEST <data e ora>".
//
// MAI CONTRO LA PRODUZIONE. Le richieste del sito verso Supabase non escono
// dal browser: le intercetta questo script e le manda al database di prova.
//   SMOKE_BACKEND=locale   (oggi) Postgres in Docker con il backup + PostgREST
//                          (test/locale/avvia-db-locale.sh); il login è
//                          simulato con token firmati dal segreto locale.
//   SMOKE_BACKEND=progetto (dopo F14.8) progetto Supabase di prova: si
//                          cambiano SOLO indirizzo e chiave pubblica in
//                          test/.smoke-progetto.env (modello:
//                          test/smoke-progetto.env.esempio) e le password
//                          degli utenti di prova in test/utenti-prova.json.
// Questi file sono esclusi da git: nel repository nessuna credenziale.
//
// Uso: cd test && npm install && npm run smoke   (vedi test/README.md)
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const TEST = __dirname;
const REPO = path.resolve(TEST, '..');
// Cartella del sito da provare: di solito il repository (SMOKE_SITO_DIR per
// provare una copia, es. con una pagina tolta di proposito).
const SITO = path.resolve(process.env.SMOKE_SITO_DIR || REPO);
const INIZIO = Date.now();

// ── Pagine attese per ruolo ────────────────────────────────────────────
// Copia di PAGINE_RUOLO (js/02-portale-navigazione.js) com'è oggi, con le
// pagine aggiunte dopo la definizione (titolare: F13.3; ingegnere: clienti
// e cliente-detail). Se si toglie o si aggiunge una pagina nel sito senza
// aggiornare questo elenco, il test FALLISCE: è voluto (pagina tolta per
// errore = un ruolo che non lavora più).
const ATTESE = {
  titolare: ['dashboard', 'calendario', 'piano-mensile', 'trattative', 'preventivi-titolare', 'preventivo-detail',
    'progetti-da-preventivare', 'presidi', 'workflow', 'interventi', 'clienti', 'documenti', 'fatture', 'catalogo',
    'impostazioni', 'cliente-detail', 'progetto-detail', 'fornitore-detail', 'tecnico', 'sopralluogo', 'commesse',
    'commessa-detail', 'team-subappalti', 'scheda-documenti', 'ore-cantiere', 'decisioni', 'info',
    'fornitori', 'progetti', 'verifiche-tecniche', 'preventivi'],
  capo_tecnico: ['dashboard', 'calendario', 'calendario-team', 'piano-mensile', 'presidi', 'interventi', 'tecnico',
    'clienti', 'documenti', 'cliente-detail', 'commesse', 'commessa-detail', 'team-subappalti', 'scheda-documenti',
    'ore-cantiere', 'info'],
  segreteria: ['dashboard', 'calendario', 'workflow', 'presidi', 'interventi', 'tecnico', 'clienti', 'documenti',
    'fatture', 'catalogo', 'cliente-detail', 'fornitore-detail', 'commesse', 'commessa-detail', 'team-subappalti',
    'scheda-documenti', 'info'],
  contabile: ['dashboard', 'workflow', 'fatture', 'documenti', 'catalogo', 'info'],
  tecnico: ['dashboard', 'calendario-tec', 'tecnico', 'presidi', 'documenti', 'info'],
  commerciale: ['dashboard', 'progetti-da-preventivare', 'preventivi', 'fornitori', 'fornitore-detail',
    'preventivo-detail', 'clienti', 'documenti', 'progetto-detail', 'fatture', 'catalogo', 'cliente-detail', 'info',
    'commesse', 'commessa-detail'],
  rappresentante: ['dashboard', 'dashboard-rapp', 'calendario-appuntamenti', 'clienti', 'progetti', 'presidi',
    'trattative', 'preventivi-rapp', 'cliente-detail', 'progetto-detail', 'catalogo', 'info', 'commesse',
    'commessa-detail'],
  ingegnere: ['dashboard', 'calendario-ingegnere', 'verifiche-tecniche', 'documenti', 'certificati-ingegnere',
    'progetto-detail', 'cliente-detail', 'info', 'clienti']
};
// L'informatico ha ROLE 'titolare' (js/01 boot): stesse pagine.
ATTESE.informatico = ATTESE.titolare;

// Ordine dei 9 utenti: chi crea i dati viene prima di chi li usa
// (segreteria: cliente → capo tecnico: intervento su quel cliente;
// rappresentante: progetto inviato → commerciale: preventivo su quel progetto).
const ORDINE_RUOLI = ['titolare', 'informatico', 'segreteria', 'capo_tecnico', 'contabile', 'tecnico',
  'rappresentante', 'commerciale', 'ingegnere'];

// Schede di dettaglio: si aprono con la loro funzione e un id visibile al ruolo.
const DETTAGLI = {
  'cliente-detail': { tabella: 'clienti', apri: 'openClienteDetail' },
  'progetto-detail': { tabella: 'progetti_tecnici', apri: 'openProgettoDetail' },
  'fornitore-detail': { tabella: 'fornitori', apri: 'openFornitoreDetail' },
  'preventivo-detail': { tabella: 'preventivi', apri: 'openPreventivoDetail' },
  'commessa-detail': { tabella: 'commesse', apri: 'openCommessaDetail' },
  'scheda-documenti': { proprio: true }
};

// ── Configurazione (variabili d'ambiente o file esclusi da git) ────────
function leggiEnv(file) {
  const p = path.join(TEST, file);
  if (!fs.existsSync(p)) return {};
  const out = {};
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(r => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(r);
    if (m && !r.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return out;
}
const BACKEND_RICHIESTO = process.env.SMOKE_BACKEND || leggiEnv('.smoke-progetto.env').SMOKE_BACKEND || 'locale';
const CONF = Object.assign({}, BACKEND_RICHIESTO === 'progetto' ? leggiEnv('.smoke-progetto.env') : leggiEnv('.smoke-locale.env'), process.env);
CONF.SMOKE_BACKEND = BACKEND_RICHIESTO;
const CHROME = CONF.SMOKE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const LIMITE_MS = Number(CONF.SMOKE_LIMITE_MINUTI || 10) * 60 * 1000;
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-smoke');
const SOLO = (CONF.SMOKE_SOLO_RUOLI || '').split(',').map(s => s.trim()).filter(Boolean);
const ETICHETTA = 'SMOKE TEST ' + new Date().toISOString().slice(0, 16).replace('T', ' ');

// Indirizzo e chiave di PRODUZIONE scritti nel sito (js/01-core.js): servono
// solo a riconoscere le richieste da deviare, non si usano mai per collegarsi.
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const SK_PROD = (/const SK='([^']+)'/.exec(CORE) || [])[1];
if (!SU_PROD) { console.error('Indirizzo Supabase non trovato in js/01-core.js'); process.exit(2); }
const HOST_PROD = new URL(SU_PROD).host;

function fermati(msg) { console.error('SMOKE TEST NON AVVIATO: ' + msg); process.exit(2); }

let BACK;
if (CONF.SMOKE_BACKEND === 'locale') {
  if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
  const u = new URL(CONF.SMOKE_REST_URL);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) fermati('SMOKE_REST_URL deve essere locale (127.0.0.1)');
  BACK = { tipo: 'locale', rest: CONF.SMOKE_REST_URL.replace(/\/$/, ''), segreto: CONF.SMOKE_JWT_SECRET };
} else if (CONF.SMOKE_BACKEND === 'progetto') {
  if (!CONF.SMOKE_SUPABASE_URL || !CONF.SMOKE_SUPABASE_ANON_KEY) fermati('mancano SMOKE_SUPABASE_URL e SMOKE_SUPABASE_ANON_KEY (test/.smoke-progetto.env)');
  const u = new URL(CONF.SMOKE_SUPABASE_URL);
  // Blocco di sicurezza: il progetto di prova non può essere la produzione.
  if (u.host === HOST_PROD || (SK_PROD && CONF.SMOKE_SUPABASE_ANON_KEY === SK_PROD)) fermati('SMOKE_SUPABASE_URL è la PRODUZIONE: serve il progetto di prova (F14.8)');
  const fileUtenti = CONF.SMOKE_UTENTI || path.join(TEST, 'utenti-prova.json');
  if (!fs.existsSync(fileUtenti)) fermati('manca ' + fileUtenti + ' (email e password degli utenti di prova, vedi README)');
  BACK = { tipo: 'progetto', url: u.origin, chiave: CONF.SMOKE_SUPABASE_ANON_KEY, utenti: JSON.parse(fs.readFileSync(fileUtenti, 'utf8')) };
} else fermati('SMOKE_BACKEND deve essere locale o progetto');

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

// ── Utenti di prova ────────────────────────────────────────────────────
async function restServizio(percorso) {
  const r = await fetch(BACK.rest + percorso, { headers: { Authorization: 'Bearer ' + tokenServizio(), Accept: 'application/json' } });
  if (!r.ok) throw new Error('database locale: ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}
async function utentiDiProva() {
  const out = {};
  if (BACK.tipo === 'progetto') {
    ORDINE_RUOLI.forEach(r => { if (BACK.utenti[r]) out[r] = { email: BACK.utenti[r].email, password: BACK.utenti[r].password }; });
    return out;
  }
  const utenti = await restServizio('/utenti?select=id,email,ruolo,attivo&order=id');
  const clienti = await restServizio('/clienti?select=rappresentante_id&rappresentante_id=not.is.null');
  const nClienti = {};
  clienti.forEach(c => { nClienti[c.rappresentante_id] = (nClienti[c.rappresentante_id] || 0) + 1; });
  BACK.perEmail = {}; BACK.perId = {};
  utenti.filter(u => u.attivo !== false).forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  ORDINE_RUOLI.forEach(r => {
    const tutti = utenti.filter(u => u.ruolo === r && u.attivo !== false);
    // Il rappresentante con più clienti (pagine con dati veri); gli altri: il primo.
    tutti.sort((a, b) => (nClienti[b.id] || 0) - (nClienti[a.id] || 0));
    if (tutti[0]) out[r] = { email: tutti[0].email, password: 'smoke-locale', id: tutti[0].id };
  });
  return out;
}

// ── Instradamento delle richieste del sito ─────────────────────────────
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range, content-profile, preference-applied' };
function json(status, corpo) { return { status, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: corpo === undefined ? '' : JSON.stringify(corpo) }; }

async function rispostaLocale(req, url, stato) {
  const metodo = req.method();
  const p = url.pathname;
  const h = req.headers();
  if (metodo === 'OPTIONS') return { status: 204, headers: CORS, body: '' };
  if (p.startsWith('/rest/v1')) {
    const auth = (h.authorization || '').replace(/^Bearer\s+/i, '');
    const intest = {};
    ['accept', 'content-type', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile'].forEach(k => { if (h[k]) intest[k] = h[k]; });
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
    if (metodo === 'POST' && m && m[1] === 'sign') return json(200, m[2].includes('/') ? { signedURL: '/object/sign/' + m[2] + '?token=smoke' } : []);
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
    if (BACK.tipo === 'progetto') {
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
  if (BACK.tipo === 'progetto') {
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
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? (d.defaultValue() || ETICHETTA) : undefined));
  return page;
}

function registraErroreRete(stato, metodo, url, status, corpo) {
  let msg = '';
  try { const j = JSON.parse(corpo || '{}'); msg = j.message || j.msg || j.error_description || j.error || ''; } catch (e) { msg = String(corpo || '').slice(0, 120); }
  const dove = url.pathname.replace(/^\/(rest|auth|storage)\/v1/, '') + (url.pathname.includes('/rest/') ? '' : '');
  stato.rete.push({ metodo, dove, status, msg: String(msg).slice(0, 200) });
}

// Attende che il sito non abbia più richieste al database in corso.
async function attendiQuiete(stato, minimo = 350, massimo = 15000) {
  const t0 = Date.now();
  await new Promise(r => setTimeout(r, minimo));
  while (Date.now() - t0 < massimo) {
    if (stato.inCorso <= 0 && stato.deviate.size === 0 && Date.now() - (stato.ultima || 0) > 400) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

// ── Prova di un utente ─────────────────────────────────────────────────
const condivisi = {}; // id dei dati creati da un ruolo e usati dal successivo

async function provaRuolo(browser, ruolo, credenziali, url) {
  const esito = { ruolo, fallimenti: [], avvisi: [], pagine: 0, salvataggi: [] };
  const KO = m => esito.fallimenti.push(m);
  const nuovoContesto = browser.createBrowserContext ? () => browser.createBrowserContext() : () => browser.createIncognitoBrowserContext();
  const contesto = await nuovoContesto();
  const stato = { inCorso: 0, deviate: new Set(), ultima: 0, erroriJs: [], console: [], rete: [], bloccate: [], caricamenti: [] };
  const page = await preparaPagina(contesto, stato);
  // Gli errori raccolti da "segno" in poi, divisi tra fallimenti e avvisi.
  const segno = () => ({ js: stato.erroriJs.length, rete: stato.rete.length, con: stato.console.length });
  function controllaDa(s, dove) {
    stato.erroriJs.slice(s.js).forEach(e => KO(dove + ': errore JavaScript: ' + e));
    stato.rete.slice(s.rete).forEach(e => {
      const t = dove + ': ' + e.metodo + ' ' + e.dove.split('?')[0] + ' → ' + e.status + (e.msg ? ' (' + e.msg + ')' : '');
      // 5xx = database o server rotti; 4xx: spesso controlli voluti del
      // sito (SQL non eseguito, permessi per ruolo): avviso, salvo i casi gravi.
      if (e.status >= 500 || /does not exist|could not find the .*column|syntax error|violates/i.test(e.msg)) KO(t); else esito.avvisi.push(t);
    });
    stato.console.slice(s.con).forEach(e => esito.avvisi.push(dove + ': console: ' + e));
  }
  try {
    // 1. Login dal modulo del sito
    let s = segno();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('lp')).display !== 'none', { timeout: 20000 });
    await page.type('#lem', credenziali.email);
    await page.type('#lpw', credenziali.password);
    await page.click('#lbtn');
    try {
      await page.waitForFunction(() => typeof ROLE !== 'undefined' && ROLE && ME && document.querySelector('.page.on'), { timeout: 25000 });
    } catch (e) {
      const errore = await page.evaluate(() => (document.getElementById('lerr') || {}).innerText || '');
      KO('login non riuscito' + (errore ? ': ' + errore.trim() : ''));
      return esito;
    }
    await attendiQuiete(stato, 800);
    const chi = await page.evaluate(() => ({ ruolo: ME.ruolo, role: ROLE, pagina: document.querySelector('.page.on').id }));
    if (chi.ruolo !== ruolo) KO('login: ruolo ' + chi.ruolo + ' invece di ' + ruolo);
    controllaDa(s, 'login');

    // 2. PAGINE_RUOLO del sito contro l'elenco atteso
    const delSito = await page.evaluate(() => (PAGINE_RUOLO[ROLE] || []).slice());
    const attese = ATTESE[ruolo];
    attese.filter(p => !delSito.includes(p)).forEach(p => KO('PAGINE_RUOLO: manca la pagina "' + p + '" (tolta dal sito?)'));
    delSito.filter(p => !attese.includes(p)).forEach(p => KO('PAGINE_RUOLO: pagina nuova "' + p + '": se è voluta aggiungila ad ATTESE in test/smoke.spec.js'));

    // 3. Apertura di ogni pagina attesa
    for (const p of attese) {
      s = segno();
      const det = DETTAGLI[p];
      let aperta;
      if (det) {
        aperta = await page.evaluate(async (p, det) => {
          if (!canAccessPage(p)) return { negata: true };
          if (det.proprio) { await openSchedaDocumenti('dipendente', ME.id); return { ok: true }; }
          const { data, error } = await db.from(det.tabella).select('id').limit(1);
          if (error) return { errore: error.message };
          if (!data || !data.length) return { vuota: true };
          await window[det.apri](data[0].id);
          return { ok: true };
        }, p, det);
      } else {
        aperta = await page.evaluate(p => { if (!canAccessPage(p)) return { negata: true }; gotoPage(p); return { ok: true }; }, p);
      }
      await attendiQuiete(stato);
      if (aperta.negata) { KO('pagina ' + p + ': accesso negato (canAccessPage)'); controllaDa(s, p); continue; }
      if (aperta.errore) KO('pagina ' + p + ': lettura per aprirla non riuscita: ' + aperta.errore);
      if (aperta.vuota) { esito.avvisi.push('pagina ' + p + ': nessun dato visibile al ruolo per aprire la scheda (solo accesso controllato)'); controllaDa(s, p); continue; }
      const vista = await page.evaluate(() => {
        const on = document.querySelector('.page.on');
        const t = document.getElementById('toast');
        const box = on ? [...on.querySelectorAll('.al2.e')].filter(x => x.offsetParent !== null).map(x => x.innerText.trim().slice(0, 160)) : [];
        return { id: on && on.id, toastErr: t && t.classList.contains('on') && t.classList.contains('err') ? t.textContent : '', box };
      });
      if (vista.id !== 'pg-' + p) KO('pagina ' + p + ': non si è aperta (aperta: ' + vista.id + ')');
      else esito.pagine++;
      if (vista.toastErr) KO('pagina ' + p + ': messaggio di errore "' + vista.toastErr + '"');
      vista.box.forEach(b => { if (/errore|error/i.test(b)) KO('pagina ' + p + ': riquadro di errore "' + b + '"'); });
      controllaDa(s, p);
    }

    // 4. Salvataggi di prova delle pagine principali
    for (const salva of SALVATAGGI[ruolo] || []) {
      s = segno();
      let r;
      try { r = await salva.fai(page, stato); } catch (e) { r = { errore: e.message }; }
      await attendiQuiete(stato);
      if (r && r.errore) KO('salvataggio ' + salva.nome + ': ' + r.errore);
      else esito.salvataggi.push(salva.nome);
      controllaDa(s, 'salvataggio ' + salva.nome);
    }
    if (stato.bloccate.length) KO('richieste a progetti Supabase non previsti bloccate: ' + [...new Set(stato.bloccate)].join(', '));
  } catch (e) {
    KO('errore dello script: ' + e.message.split('\n')[0]);
    try { await page.screenshot({ path: path.join(CARTELLA_OUT, 'errore-' + ruolo + '.png'), fullPage: false }); } catch (e2) { /* niente */ }
  } finally {
    if (esito.fallimenti.length) { try { await page.screenshot({ path: path.join(CARTELLA_OUT, 'fallito-' + ruolo + '.png') }); } catch (e) { /* niente */ } }
    await contesto.close();
  }
  return esito;
}

// ── Salvataggi per ruolo (stesse funzioni dei bottoni del sito) ────────
async function toastDopo(page) {
  return page.evaluate(() => { const t = document.getElementById('toast'); return { testo: t.textContent, err: t.classList.contains('err'), on: t.classList.contains('on') }; });
}
async function nuovoCliente(page, stato, nome) {
  await page.evaluate(() => { document.getElementById('toast').className = 'toast'; gotoPage('clienti'); });
  await attendiQuiete(stato);
  const r = await page.evaluate(async nome => {
    openNewCli();
    ge('mc1').value = nome; ge('mc3').value = 'Prova';
    ge('mc9').value = 'Creato dallo smoke test automatico (F14.9)';
    await saveCli();
    const { data, error } = await db.from('clienti').select('id').eq('ragione_sociale', nome).limit(1);
    if (error) return { errore: 'rilettura: ' + error.message };
    return data && data[0] ? { id: data[0].id } : { errore: 'il cliente non risulta salvato' };
  }, nome);
  const t = await toastDopo(page);
  if (!r.errore && t.err) return { errore: 'messaggio "' + t.testo + '"' };
  return r;
}
const SALVATAGGI = {
  segreteria: [{
    nome: 'cliente', fai: async (page, stato) => {
      const r = await nuovoCliente(page, stato, ETICHETTA + ' cliente segreteria');
      if (r.id) condivisi.clienteSegreteria = r.id;
      return r;
    }
  }],
  capo_tecnico: [{
    nome: 'intervento', fai: async (page, stato) => {
      await page.evaluate(() => { document.getElementById('toast').className = 'toast'; gotoPage('interventi'); });
      await attendiQuiete(stato);
      const nota = ETICHETTA + ' intervento';
      const r = await page.evaluate(async (cid, nota) => {
        await apriNuovoIntervento();
        if (!cid) { const { data } = await db.from('clienti').select('id').limit(1); cid = data && data[0] && data[0].id; }
        if (!cid) return { errore: 'nessun cliente visibile' };
        const sel = ge('mo1');
        if (![...sel.options].some(o => o.value === cid)) { const o = document.createElement('option'); o.value = cid; o.textContent = 'cliente di prova'; sel.appendChild(o); }
        sel.value = cid; if (typeof loadSediForOdl === 'function') await loadSediForOdl();
        ge('mo2').value = 'ordinario_chiamata';
        const d = new Date(); d.setDate(d.getDate() + 7); ge('mo3').value = dataLocaleISO(d);
        ge('mo6').value = nota;
        await saveOdl();
        const { data, error } = await db.from('ordini_lavoro').select('id,stato').eq('note_per_tecnico', nota).limit(1);
        if (error) return { errore: 'rilettura: ' + error.message };
        return data && data[0] ? { id: data[0].id } : { errore: 'l\'intervento non risulta salvato' };
      }, condivisi.clienteSegreteria || null, nota);
      const t = await toastDopo(page);
      if (!r.errore && t.err) return { errore: 'messaggio "' + t.testo + '"' };
      return r;
    }
  }],
  rappresentante: [{
    nome: 'cliente', fai: async (page, stato) => {
      const r = await nuovoCliente(page, stato, ETICHETTA + ' cliente rappresentante');
      if (r.id) condivisi.clienteRappresentante = r.id;
      return r;
    }
  }, {
    nome: 'progetto tecnico (e invio al commerciale)', fai: async (page, stato) => {
      if (!condivisi.clienteRappresentante) return { errore: 'manca il cliente del rappresentante' };
      await page.evaluate(async id => { document.getElementById('toast').className = 'toast'; await openClienteDetail(id); }, condivisi.clienteRappresentante);
      await attendiQuiete(stato);
      await page.evaluate(async () => { await apriNuovoProgetto(); });
      await attendiQuiete(stato);
      const titolo = ETICHETTA + ' progetto';
      await page.evaluate(t => {
        ge('mp-titolo').value = t;
        const sel = ge('mp-tipologia'); sel.value = [...sel.options].find(o => o.value).value;
        ge('mp-descrizione').value = 'Progetto creato dallo smoke test automatico (F14.9).';
        // F15.5 (sql/79): senza la fonte del rilievo il progetto non si invia
        const fonte = ge('mp-fonte-rilievo');
        if (fonte && ge('mp-fonte-rilievo-box') && ge('mp-fonte-rilievo-box').style.display !== 'none') fonte.value = 'sopralluogo_toli';
      }, titolo);
      const pdf = path.join(CARTELLA_OUT, 'allegato-prova.pdf');
      fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
      const input = await page.$('#mp-file');
      await input.uploadFile(pdf);
      await page.evaluate(() => ge('mp-file').dispatchEvent(new Event('change', { bubbles: true })));
      const r = await page.evaluate(async t => {
        await salvaProgetto();
        const { data, error } = await db.from('progetti_tecnici').select('id,stato').eq('titolo', t).limit(1);
        if (error) return { errore: 'rilettura: ' + error.message };
        if (!data || !data[0]) return { errore: 'il progetto non risulta salvato' };
        await inviaProgettoAlCommerciale(data[0].id);
        const { data: d2 } = await db.from('progetti_tecnici').select('stato').eq('id', data[0].id).single();
        // F15.13 (sql/83): con lo smistamento automatico un progetto senza schede va all'ingegnere
        const statoAtteso = typeof smistamentoAttivoSubito === 'function' && smistamentoAttivoSubito() ? 'in_verifica_tecnica' : 'inviato_a_commerciale';
        if (!d2 || d2.stato !== statoAtteso) return { errore: 'progetto salvato ma non inviato (stato ' + (d2 && d2.stato) + ', atteso ' + statoAtteso + ')' };
        return { id: data[0].id };
      }, titolo);
      if (r.id) condivisi.progetto = r.id;
      return r;
    }
  }],
  commerciale: [{
    nome: 'preventivo (con una voce)', fai: async (page, stato) => {
      if (!condivisi.progetto) return { errore: 'manca il progetto inviato dal rappresentante' };
      await page.evaluate(() => { document.getElementById('toast').className = 'toast'; gotoPage('progetti-da-preventivare'); });
      await attendiQuiete(stato);
      await page.evaluate(async id => { await avviaPreventivo(id); }, condivisi.progetto);
      await attendiQuiete(stato, 800);
      const r = await page.evaluate(async (id, voce) => {
        const { data, error } = await db.from('preventivi').select('id,stato').eq('progetto_tecnico_id', id).limit(1);
        if (error) return { errore: 'rilettura: ' + error.message };
        if (!data || !data[0]) return { errore: 'il preventivo non risulta creato' };
        // Come il commerciale: dall'elenco Preventivi apre la bozza appena creata.
        await openPreventivoDetail(data[0].id);
        if (currentPreventivoId !== data[0].id || typeof vociPreventivoDati === 'undefined') return { errore: 'scheda del preventivo non aperta' };
        aggiungiVocePreventivo();
        const v0 = vociPreventivoDati[vociPreventivoDati.length - 1];
        v0.descrizione = voce; v0.quantita = 1; v0.costo_unitario = 60; v0.prezzo_unitario = 100;
        const ok = await salvaVociPreventivo();
        if (!ok) return { errore: 'salvaVociPreventivo non riuscito' };
        const { data: voci } = await db.from('preventivi_voci').select('id').eq('preventivo_id', data[0].id).eq('descrizione', voce);
        return voci && voci.length ? { id: data[0].id } : { errore: 'la voce non risulta salvata' };
      }, condivisi.progetto, ETICHETTA + ' voce');
      const t = await toastDopo(page);
      if (!r.errore && t.err) return { errore: 'messaggio "' + t.testo + '"' };
      return r;
    }
  }]
};

// ── Avvio ──────────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const limite = setTimeout(() => { console.error('FALLITO: superati ' + (LIMITE_MS / 60000) + ' minuti'); process.exit(1); }, LIMITE_MS);
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  console.log('Smoke test TOLI Fire - database: ' + (BACK.tipo === 'locale' ? 'locale ' + BACK.rest : 'progetto di prova ' + BACK.url) + ' - sito: ' + url);
  console.log('Dati di prova: "' + ETICHETTA + '" - risultati in ' + CARTELLA_OUT);
  const utenti = await utentiDiProva();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run', '--disable-features=Translate'] });
  const esiti = [];
  for (const ruolo of ORDINE_RUOLI) {
    if (SOLO.length && !SOLO.includes(ruolo)) continue;
    const t0 = Date.now();
    if (!utenti[ruolo]) { esiti.push({ ruolo, fallimenti: ['nessun utente di prova per il ruolo'], avvisi: [], pagine: 0, salvataggi: [] }); console.log('\n✗ ' + ruolo + ': nessun utente di prova'); continue; }
    const e = await provaRuolo(browser, ruolo, utenti[ruolo], url);
    e.secondi = Math.round((Date.now() - t0) / 1000);
    esiti.push(e);
    console.log('\n' + (e.fallimenti.length ? '✗ ' : '✓ ') + ruolo + ': ' + e.pagine + '/' + ATTESE[ruolo].length + ' pagine aperte' +
      (e.salvataggi.length ? ', salvati: ' + e.salvataggi.join(', ') : '') + ' (' + e.secondi + ' s)');
    e.fallimenti.forEach(f => console.log('    FALLITO  ' + f));
    if (CONF.SMOKE_AVVISI !== 'no') [...new Set(e.avvisi)].slice(0, 15).forEach(a => console.log('    avviso   ' + a));
  }
  await browser.close();
  srv.close();
  clearTimeout(limite);
  const ko = esiti.filter(e => e.fallimenti.length);
  const durata = Math.round((Date.now() - INIZIO) / 1000);
  fs.writeFileSync(path.join(CARTELLA_OUT, 'risultato.json'), JSON.stringify({ quando: new Date().toISOString(), backend: BACK.tipo, durata_s: durata, esiti }, null, 2));
  console.log('\n' + (ko.length ? 'FALLITO: ' + ko.map(e => e.ruolo).join(', ') : 'TUTTO OK') + ' - ' + esiti.length + ' utenti in ' + Math.floor(durata / 60) + ' min ' + (durata % 60) + ' s');
  process.exit(ko.length ? 1 : 0);
})().catch(e => { console.error('SMOKE TEST INTERROTTO: ' + e.stack); process.exit(2); });
