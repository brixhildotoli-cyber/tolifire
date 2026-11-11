#!/usr/bin/env node
// F15.10 - Import del catalogo lavorazioni da un foglio Excel
// (js/55-catalogo-lavorazioni.js importaFoglioLavorazioni), Chrome headless con
// puppeteer-core, SOLO DATABASE LOCALE con sql/75 e successivi
// (test/locale/avvia-db-locale.sh). Il "fatto quando" della task:
//  1. l'ingegnere (390 px), da Verifiche tecniche > Catalogo lavorazioni,
//     scarica il modello; carica un foglio con errori (anteprima con le righe
//     sbagliate, "Importa" spento, nulla nel database); carica il foglio di
//     prova con 2 lavorazioni e 30 campi: anteprima, import senza errori, le 2
//     lavorazioni nascono SPENTE con 30 campi, registro a nome suo; di nuovo lo
//     stesso foglio = niente da aggiungere; apre le 2 schede nel motore;
//  2. il titolare attiva le 2 lavorazioni, che compaiono nel motore; un foglio
//     con 2 campi nuovi per una lavorazione ATTIVA li mette "tolti" (e uno con
//     un codice già esistente non cambia);
//  3. il commerciale (Acquisti) dalla console: insert rifiutato.
// Nessun errore JavaScript né del database. Le lavorazioni di prova restano nel
// database locale (codici con un suffisso: il registro non si cancella).
// Uso: cd test && node import-catalogo-lavorazioni.spec.js  (uscita 0 = TUTTO OK)
'use strict';

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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-import-catalogo');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.10';
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
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? (d.defaultValue() || ETICHETTA) : undefined));
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
  const stato = { inCorso: 0, deviate: new Set(), ultima: 0, erroriJs: [], console: [], rete: [], bloccate: [], caricamenti: [], agitoCome: 0, agitoComeValori: new Set() };
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



// ── Fogli di prova ─────────────────────────────────────────────────────
const SUFFISSO = Date.now().toString(36);
const LAV_A = 'sigill_f1510_' + SUFFISSO, LAV_B = 'cartong_f1510_' + SUFFISSO;
const TESTATA = ['Codice lavorazione', 'Nome lavorazione', 'Famiglia', 'Documento finale', 'Codice campo', 'Etichetta', 'Tipo', 'Unità', 'Valori menu', 'Minimo', 'Massimo', 'Chi lo compila', 'Normativo', 'Serve al prezzo', 'Per posizione', 'Uso a valle', 'Ordine'];
// [codice campo, etichetta, tipo, unità, valori, min, max, livello, normativo, prezzo, posizione, uso]
const CAMPI_A = [
  ['tipo_servizio', 'Tipo di servizio', 'menu', '', 'Sigillatura di canaline; Sigillatura di tubi; Sigillatura di cavi; Sigillatura mista', '', '', 'base', 'no', 'sì', 'no', 'Voce del preventivo'],
  ['classe_ei', 'Classe EI richiesta', 'menu', '', 'EI 60; EI 90; EI 120; EI 180', '', '', 'base', 'sì', 'sì', 'no', 'Scelta del prodotto certificato; dichiarazione di corretta posa'],
  ['numero_attraversamenti', 'Numero di attraversamenti', 'numero', 'pz', '', '1', '500', 'base', 'no', 'sì', 'no', 'Quantità per il preventivo'],
  ['tipo_parete', 'Tipo di parete attraversata', 'Menu', '', 'Muratura; Cartongesso; Calcestruzzo; Solaio', '', '', 'base', 'no', 'sì', 'no', 'Scelta del sistema certificato'],
  ['spessore_parete', 'Spessore della parete', 'numero', 'mm', '', '50', '1000', 'base', 'no', 'no', 'no', 'Verifica del rapporto di prova'],
  ['diametro_max', 'Diametro massimo del foro', 'numero', 'mm', '', '10', '600', 'base', 'no', 'no', 'no', 'Scelta del collare o della schiuma'],
  ['materiale_tubi', 'Materiale dei tubi', 'menu', '', 'Metallo; Plastica; Multistrato', '', '', 'base', 'no', 'no', 'no', 'Scelta del prodotto'],
  ['isolamento_tubi', 'Tubi isolati', 'sì/no', '', '', '', '', 'base', 'no', 'no', 'no', 'Scelta del prodotto'],
  ['altezza_lavoro', 'Altezza di lavoro', 'numero', 'm', '', '0,5', '20', 'base', 'no', 'no', 'no', 'Mezzi: trabattello o PLE'],
  ['ple', 'Serve la PLE', 'sì/no', '', '', '', '', 'base', 'no', 'no', 'no', 'Noli del cantiere'],
  ['accessibilita', 'Accessibilità', 'menu', '', 'Libera; Controsoffitto da aprire; Cavedio', '', '', 'base', 'no', 'no', 'no', 'Ore di posa'],
  ['ubicazione', 'Ubicazione', 'testo', '', '', '', '', 'base', 'no', 'no', 'sì', 'Elenco delle posizioni nella dichiarazione'],
  ['foto_attraversamento', 'Foto dell\'attraversamento', 'foto', '', '', '', '', 'base', 'no', 'no', 'sì', 'Dichiarazione di corretta posa'],
  ['rapporto_prova', 'Rapporto di prova di riferimento', 'testo', '', '', '', '', 'ingegnere', 'sì', 'no', 'no', 'Dichiarazione di corretta posa'],
  ['prodotto_previsto', 'Prodotto previsto', 'testo', '', '', '', '', 'ingegnere', 'no', 'no', 'no', 'Ordine ai fornitori'],
  ['note_posa', 'Note per la posa', 'testo', '', '', '', '', 'base', 'no', 'no', 'no', 'Scheda cantiere']
];
const CAMPI_B = [
  ['tipo_intervento', 'Tipo di intervento', 'menu', '', 'Parete nuova; Controparete; Controsoffitto; Rivestimento di trave', '', '', 'base', 'no', 'sì', 'no', 'Voce del preventivo'],
  ['classe_ei', 'Classe EI', 'menu', '', 'EI 30; EI 60; EI 90; EI 120', '', '', 'base', 'sì', 'sì', 'no', 'Scelta del sistema certificato'],
  ['superficie', 'Superficie', 'numero', 'm²', '', '0,5', '5000', 'base', 'no', 'sì', 'no', 'Quantità per il preventivo'],
  ['altezza', 'Altezza', 'numero', 'm', '', '1', '15', 'base', 'no', 'no', 'no', 'Scelta dei profili'],
  ['lastre_per_lato', 'Lastre per lato', 'menu', '', '1; 2; 3', '', '', 'base', 'no', 'no', 'no', 'Distinta dei materiali'],
  ['spessore_lastra', 'Spessore della lastra', 'menu', '', '12,5 mm; 15 mm; 25 mm', '', '', 'ingegnere', 'no', 'no', 'no', 'Distinta dei materiali'],
  ['isolante', 'Lana minerale nell\'intercapedine', 'sì/no', '', '', '', '', 'base', 'no', 'no', 'no', 'Distinta dei materiali'],
  ['porte_da_inserire', 'Porte da inserire nella parete', 'numero', 'pz', '', '0', '50', 'base', 'no', 'no', 'no', 'Voci delle porte REI'],
  ['angoli', 'Angoli', 'numero', 'pz', '', '0', '200', 'base', 'no', 'no', 'no', 'Paraspigoli'],
  ['finitura', 'Finitura', 'menu', '', 'Stuccata; Stuccata e pitturata; Grezza', '', '', 'base', 'no', 'no', 'no', 'Ore di posa'],
  ['piano', 'Piano', 'testo', '', '', '', '', 'base', 'no', 'no', 'sì', 'Scheda cantiere'],
  ['foto_vano', 'Foto del vano', 'foto', '', '', '', '', 'base', 'no', 'no', 'sì', 'Rilievo'],
  ['certificato_sistema', 'Certificato del sistema', 'testo', '', '', '', '', 'ingegnere', 'sì', 'no', 'no', 'Dichiarazione di corretta posa'],
  ['note_tecniche', 'Note tecniche', 'testo', '', '', '', '', 'ingegnere', 'no', 'no', 'no', 'Calcolo del preventivo']
];
function righeFoglio(codice, nome, famiglia, documento, campi) {
  return campi.map((c, i) => (i === 0 ? [codice, nome, famiglia, documento] : ['', '', '', '']).concat(c.slice(0, 11)).concat([c[11], '']));
}
const FOGLIO_BUONO = [TESTATA].concat(
  righeFoglio(LAV_A, 'Sigillature (prova F15.10)', 'compartimentazione', 'Dichiarazione di corretta posa in opera', CAMPI_A),
  righeFoglio(LAV_B, 'Cartongesso REI (prova F15.10)', 'compartimentazione', 'corretta posa', CAMPI_B));
const FOGLIO_ERRATO = [TESTATA,
  [LAV_A, 'Sigillature (prova F15.10)', 'compartimentazione', 'Documento inventato', 'tipo_servizio', 'Tipo di servizio', 'menu', '', '', '', '', 'base', 'no', 'sì', 'no', 'Voce del preventivo', ''],
  ['', '', '', '', 'diametro', 'Diametro', 'numero', 'mm', '', '600', '10', 'base', 'no', 'no', 'no', 'Scelta', ''],
  ['', '', '', '', 'colore', 'Colore', 'colore', '', '', '', '', 'base', 'no', 'no', 'no', '', ''],
  ['', '', '', '', 'nome_scheda', 'Nome', 'testo', '', '', '', '', 'base', 'forse', 'no', 'no', 'Scheda', '']];
// Per la lavorazione A (ATTIVA dopo il passo 2): 2 campi nuovi + 1 già esistente con un'etichetta diversa
const FOGLIO_AGGIUNTA = [TESTATA,
  [LAV_A, '', '', '', 'tempo_posa', 'Tempo di posa stimato', 'numero', 'h', '', '0,25', '200', 'ingegnere', 'no', 'no', 'no', 'Ore del cronoprogramma', ''],
  ['', '', '', '', 'sacchi_rifiuti', 'Rifiuti da portare via', 'sì/no', '', '', '', '', 'base', 'no', 'no', 'no', 'Smaltimento', ''],
  ['', '', '', '', 'tipo_servizio', 'ETICHETTA CAMBIATA', 'menu', '', 'Altro', '', '', 'base', 'no', 'sì', 'no', 'Voce del preventivo', '']];

async function fileFoglio(s, nome, righe) {
  const b64 = await s.page.evaluate(async righe => {
    await caricaLibreriaExcel();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(righe), 'Campi');
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }, righe);
  const p = path.join(CARTELLA_OUT, nome);
  fs.writeFileSync(p, Buffer.from(b64, 'base64'));
  return p;
}
async function caricaFoglio(s, file) {
  const inp = await s.page.$('#cl-import-file');
  await inp.uploadFile(file);
  await s.page.waitForFunction(() => document.getElementById('m-import-lavorazioni').classList.contains('on'), { timeout: 15000 });
  await attendiQuiete(s.stato, 500);
  return s.page.evaluate(() => ({ testo: document.getElementById('ilv-contenuto').innerText, spento: document.getElementById('ilv-importa').disabled }));
}
const contaCampi = (lav, filtro) => psql("select count(*) from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = '" + lav + "'" + (filtro || ''));
// Apre la scheda nel motore e conta i campi disegnati (msm-c-<codice>)
async function apriSchedaNelMotore(s, progettoId, lav) {
  const n = await s.page.evaluate(async (progettoId, lav) => {
    await apriSchedaMotore(progettoId, lav);
    await new Promise(r => setTimeout(r, 800));
    const box = document.getElementById('msm-motore');
    const aperta = document.getElementById('m-rilievo-tecnico').classList.contains('on');
    const campi = box ? box.querySelectorAll('[id^="msm-c-"]').length : -1;
    return { aperta, campi, attesi: campiSchedaMotore(lavorazioneCatalogo(lav)).length };
  }, progettoId, lav);
  await attendiQuiete(s.stato, 500);
  await s.page.evaluate(() => { if (typeof schedaRilievoAperta !== 'undefined' && schedaRilievoAperta) schedaRilievoAperta.modificata = false; closeM('m-rilievo-tecnico'); });
  return n;
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  if (psql("select to_regclass('public.lavorazioni') is not null") !== 't') fermati('sql/75 non eseguito nel database locale');
  const progettoId = psql('select id from public.progetti_tecnici order by id limit 1');
  if (!progettoId) fermati('serve almeno un progetto tecnico nel database locale');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const tit = primo('titolare'), ing = primo('ingegnere'), com = primo('commerciale');
  if (!tit || !ing || !com) fermati('servono titolare, ingegnere e commerciale attivi');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    // 1. ingegnere a 390 px
    const g = await apriSito(browser, url); sessioni.push(g);
    await g.page.setViewport({ width: 390, height: 844 });
    await login(g, ing);
    await g.page.evaluate(() => gotoPage('verifiche-tecniche'));
    await attendiQuiete(g.stato, 1500);
    await g.page.waitForFunction(() => document.getElementById('vt-catalogo-btn').style.display !== 'none', { timeout: 10000 });
    await g.page.click('#vt-catalogo-btn');
    await attendiQuiete(g.stato, 1000);
    // modello
    const modello = path.join(CARTELLA_OUT, 'download', 'Modello_catalogo_lavorazioni.xlsx');
    try { fs.unlinkSync(modello); } catch (e) { /* non c'era */ }
    await g.page.evaluate(() => scaricaModelloImportLav());
    for (let i = 0; i < 50 && !fs.existsSync(modello); i++) await attendi(100);
    if (!fs.existsSync(modello)) KO('1: il modello non si scarica');
    else {
      // il modello stesso si legge (3 righe d'esempio) senza errori di formato
      const prova = await caricaFoglio(g, modello);
      if (!/1 lavorazione \(1 nuova\), 3 campi da aggiungere/.test(prova.testo) || prova.spento) KO('1: anteprima del modello inattesa: ' + prova.testo.slice(0, 200));
      else righe.push('1. modello scaricato (' + fs.statSync(modello).size + ' byte): l\'anteprima lo legge, 1 lavorazione e 3 campi');
      await g.page.evaluate(() => closeM('m-import-lavorazioni'));
    }
    // foglio con errori
    const errato = await caricaFoglio(g, await fileFoglio(g, 'foglio-errato.xlsx', FOGLIO_ERRATO));
    const attesi = ['Riga 2: documento finale non riconosciuto', 'Riga 2: un menu ha almeno un valore', 'Riga 3: il minimo è più grande del massimo', 'Riga 4: tipo non valido', 'Riga 4: scrivi l’uso a valle', 'Riga 5: il codice "nome_scheda"', 'Riga 5: "Normativo": sì oppure no'];
    const mancano = attesi.filter(a => errato.testo.indexOf(a) < 0);
    if (mancano.length || !errato.spento) KO('1: errori del foglio sbagliato non tutti segnalati (' + mancano.join('; ') + ') o Importa acceso: ' + errato.testo.slice(0, 400));
    else righe.push('   foglio con 7 errori: anteprima con riga e motivo, "Importa" spento');
    await g.page.screenshot({ path: path.join(CARTELLA_OUT, '1-ingegnere-errori-390.png') });
    await g.page.evaluate(() => closeM('m-import-lavorazioni'));
    if (psql("select count(*) from public.lavorazioni where codice in ('" + LAV_A + "','" + LAV_B + "')") !== '0') KO('1: il foglio sbagliato ha scritto nel database');
    // foglio buono
    const buonoFile = await fileFoglio(g, 'foglio-prova-2-lavorazioni-30-campi.xlsx', FOGLIO_BUONO);
    const buono = await caricaFoglio(g, buonoFile);
    if (!/2 lavorazioni \(2 nuove\), 30 campi da aggiungere/.test(buono.testo) || buono.spento || /errore/i.test(buono.testo)) KO('1: anteprima del foglio di prova inattesa: ' + buono.testo.slice(0, 300));
    else righe.push('   foglio di prova: anteprima "2 lavorazioni (2 nuove), 30 campi da aggiungere", nessun errore');
    await g.page.screenshot({ path: path.join(CARTELLA_OUT, '1-ingegnere-anteprima-390.png') });
    await g.page.click('#ilv-importa');
    await attendiQuiete(g.stato, 1500);
    const statoDb = psql("select string_agg(codice || ':' || attiva || ':' || famiglia || ':' || coalesce(documento_finale, '-'), ',' order by codice) from public.lavorazioni where codice in ('" + LAV_A + "','" + LAV_B + "')");
    const nA = contaCampi(LAV_A), nB = contaCampi(LAV_B);
    const attesoDb = [LAV_B + ':false:compartimentazione:corretta_posa', LAV_A + ':false:compartimentazione:corretta_posa'].sort().join(',');
    if (statoDb !== attesoDb || nA !== '16' || nB !== '14') KO('1: import non riuscito: ' + statoDb + ' campi ' + nA + '/' + nB);
    else righe.push('   importate SPENTE: ' + LAV_A + ' (16 campi), ' + LAV_B + ' (14 campi)');
    const dett = psql("select count(*) filter (where c.serve_al_prezzo) || '/' || count(*) filter (where c.obbligatorio) || '/' || count(*) filter (where c.normativo) || '/' || count(*) filter (where c.livello = 'ingegnere') || '/' || count(*) filter (where c.per_posizione) || '/' || count(*) filter (where c.tipo = 'menu') || '/' || count(*) filter (where c.attivo) from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice in ('" + LAV_A + "','" + LAV_B + "')");
    if (dett !== '7/7/4/5/4/10/30') KO('1: dati dei campi diversi dal foglio (prezzo/obbl./normativi/ingegnere/posizione/menu/attivi): ' + dett);
    else righe.push('   campi: 7 servono al prezzo (= obbligatori), 4 normativi, 5 dell\'ingegnere, 4 per posizione, 10 menu, 30 attivi');
    const val = psql("select coalesce(c.valori_ammessi::text, 'null') || ' | ' || c.min_plausibile || '-' || c.max_plausibile from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = '" + LAV_A + "' and c.codice = 'altezza_lavoro'") +
      ' / ' + psql("select c.valori_ammessi::text from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = '" + LAV_B + "' and c.codice = 'spessore_lastra'");
    if (!/0\.5-20/.test(val) || !/"valore": "x_12_5_mm", "etichetta": "12,5 mm"/.test(val)) KO('1: numeri con la virgola o valori del menu sbagliati: ' + val);
    else righe.push('   0,5-20 m letto con la virgola; menu "12,5 mm" con valore x_12_5_mm');
    const reg = psql("select count(*) from public.lavorazioni_registro r join public.lavorazioni l on l.id = r.lavorazione_id where l.codice in ('" + LAV_A + "','" + LAV_B + "') and r.utente_id = '" + ing.id + "' and r.azione = 'creata'");
    if (reg !== '32') KO('1: registro: attese 32 righe "creata" dell\'ingegnere (2 lavorazioni + 30 campi), trovate ' + reg);
    else righe.push('   registro del catalogo: 32 righe "creata" a nome dell\'ingegnere');
    const aperta = await g.page.evaluate(() => document.getElementById('m-catalogo-lavorazioni').classList.contains('on') && document.getElementById('cl-scelta').value);
    if (aperta !== LAV_A) KO('1: dopo l\'import il catalogo non mostra la lavorazione importata: ' + aperta);
    // di nuovo lo stesso foglio
    const ancora = await caricaFoglio(g, buonoFile);
    if (!/0 campi da aggiungere, 30 già nel catalogo/.test(ancora.testo) || !ancora.spento) KO('1: secondo import dello stesso foglio inatteso: ' + ancora.testo.slice(0, 200));
    else righe.push('   stesso foglio di nuovo: "0 campi da aggiungere, 30 già nel catalogo", Importa spento');
    await g.page.evaluate(() => { closeM('m-import-lavorazioni'); closeM('m-catalogo-lavorazioni'); });
    for (const lav of [LAV_A, LAV_B]) {
      const sch = await apriSchedaNelMotore(g, progettoId, lav);
      if (!sch.aperta || sch.campi < sch.attesi || sch.attesi < 10) KO('1: scheda ' + lav + ' nel motore: ' + JSON.stringify(sch));
      else righe.push('   l\'ingegnere apre la scheda ' + lav + ' nel motore (spenta): ' + sch.campi + ' campi disegnati');
    }
    await g.page.screenshot({ path: path.join(CARTELLA_OUT, '1-ingegnere-dopo-390.png') });
    await chiudi(g);

    // 2. titolare
    const t = await apriSito(browser, url); sessioni.push(t);
    await login(t, tit);
    await t.page.evaluate(async (a, b) => {
      await apriCatalogoLavorazioni(a); await attivaLavorazioneCatalogo(true);
      await apriCatalogoLavorazioni(b); await attivaLavorazioneCatalogo(true);
    }, LAV_A, LAV_B);
    await attendiQuiete(t.stato, 1000);
    const nelMotore = await t.page.evaluate(async (a, b) => { await caricaCatalogoLavorazioni(true); const l = lavorazioniMotore().map(x => x.codice); return [l.includes(a), l.includes(b)].join(','); }, LAV_A, LAV_B);
    if (psql("select count(*) from public.lavorazioni where attiva and codice in ('" + LAV_A + "','" + LAV_B + "')") !== '2' || nelMotore !== 'true,true') KO('2: attivazione del titolare non riuscita: ' + nelMotore);
    else righe.push('2. il titolare attiva le 2 lavorazioni: compaiono nella scelta del motore');
    const schT = await apriSchedaNelMotore(t, progettoId, LAV_B);
    if (!schT.aperta || schT.campi < schT.attesi) KO('2: scheda ' + LAV_B + ' del titolare: ' + JSON.stringify(schT));
    else righe.push('   il titolare apre la scheda ' + LAV_B + ': ' + schT.campi + ' campi');
    await t.page.evaluate(a => apriCatalogoLavorazioni(a), LAV_A);
    await attendiQuiete(t.stato, 800);
    const agg = await caricaFoglio(t, await fileFoglio(t, 'foglio-aggiunta.xlsx', FOGLIO_AGGIUNTA));
    if (!/1 lavorazione \(0 nuove\), 2 campi da aggiungere, 1 già nel catalogo/.test(agg.testo) || !/\(tolto\)/.test(agg.testo) || agg.spento) KO('2: anteprima dell\'aggiunta inattesa: ' + agg.testo.slice(0, 300));
    await t.page.click('#ilv-importa');
    await attendiQuiete(t.stato, 1500);
    const tolti = contaCampi(LAV_A, " and c.codice in ('tempo_posa','sacchi_rifiuti') and not c.attivo");
    const intatto = psql("select c.etichetta from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = '" + LAV_A + "' and c.codice = 'tipo_servizio'");
    if (tolti !== '2' || intatto !== 'Tipo di servizio') KO('2: aggiunta a lavorazione attiva: tolti ' + tolti + ', campo esistente "' + intatto + '"');
    else righe.push('   2 campi aggiunti alla lavorazione ATTIVA arrivano "tolti"; il campo già esistente resta "Tipo di servizio"');
    await t.page.setViewport({ width: 1280, height: 900 });
    await t.page.screenshot({ path: path.join(CARTELLA_OUT, '2-titolare-catalogo.png') });
    await chiudi(t);

    // 3. commerciale (Acquisti)
    const c = await apriSito(browser, url); sessioni.push(c);
    await login(c, com);
    const console3 = await c.page.evaluate(async () => {
      const ins = await db.from('lavorazioni').insert({ codice: 'hack_f1510', nome: 'Hack', famiglia: 'hack', attiva: false });
      return ins.error ? 'insert rifiutato: ' + ins.error.message : 'insert RIUSCITO';
    });
    if (!/insert rifiutato/.test(console3)) KO('3: il commerciale crea una lavorazione: ' + console3);
    else righe.push('3. console di Acquisti: ' + console3);
    if (await c.page.evaluate(() => { scegliFoglioLavorazioni(); return document.getElementById('m-import-lavorazioni').classList.contains('on'); })) KO('3: Acquisti apre l\'import');

    for (const s of sessioni.filter(x => !x.chiuso)) await chiudi(s);
    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(r => r.status >= 500 || /does not exist|Could not find/i.test(r.msg) && !/schede_migrate_motore/.test(r.msg));
      if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
  }
  righe.forEach(r => console.log(r));
  console.log('Schermate e fogli: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
