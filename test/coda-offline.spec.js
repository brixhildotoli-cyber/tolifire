#!/usr/bin/env node
// F15.11 - App installabile offline con coda di invio (sw.js, js/57, js/19).
// Chrome headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh con sql/77-82 e 82-foto-video + -VINCOLO).
// Il nome del database di produzione è mandato su una porta chiusa
// (--host-resolver-rules): nessuna richiesta arriva mai alla produzione,
// nemmeno quelle del service worker.
// A. Service worker: cache "toli-app-<versione>" con tutti gli script di
//    index.html; sito spento (senza rete) = l'app si apre lo stesso, le
//    librerie PDF arrivano dalla cache, con l'utente salvato sul telefono si
//    entra fino alla dashboard; nuova versione (pubblica.sh) = nuovo service
//    worker, nuova cache, quella vecchia cancellata, script della versione
//    nuova.
// B. Coda (service worker scavalcato, richieste al database locale): il
//    rappresentante a 390 px apre la porta REI con la rete, va in modalità
//    aereo, carica 3 foto e salva la scheda: nel database niente, sul
//    telefono 4 cose "non ancora inviate" (📤 nel menu e sul tab); riaperta
//    la scheda senza rete i dati ci sono; tornata la rete arriva tutto UNA
//    volta (1 scheda con l'id del telefono e 3 file con l'impronta); rimandare
//    le stesse 4 righe non crea doppioni.
// Alla fine si tolgono schede e file di prova.
// Uso: cd test && node coda-offline.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-coda-offline');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.11';
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
const SITO_STATO = { versione: null, spento: false, richieste: [] };
function avviaSito() {
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      // Sito "spento" (senza rete): connessione chiusa senza risposta
      if (SITO_STATO.spento) { req.socket.destroy(); return; }
      SITO_STATO.richieste.push(req.url);
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if ((p === '/' || p === '/index.html') && SITO_STATO.versione) {
        const html = fs.readFileSync(path.join(SITO, 'index.html'), 'utf8').replace(/\?v=[0-9]+"/g, '?v=' + SITO_STATO.versione + '"');
        res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
        return res.end(html);
      }
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
  page.on('dialog', d => { stato.dialoghi.push(d.message()); d.accept(d.type() === 'prompt' ? (d.defaultValue() || ETICHETTA) : undefined); });
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

async function apriProgetto(s, progettoId) {
  await s.page.evaluate(async id => { await openProgettoDetail(id); }, progettoId);
  await attendiQuiete(s.stato, 1200);
  await s.page.evaluate(() => { const t = [...document.querySelectorAll('#pg-progetto-detail .tab')].find(x => /Rilievi tecnici/.test(x.textContent)); if (t) t.click(); });
  await attendiQuiete(s.stato, 600);
}
async function apriMotore(s) {
  await s.page.waitForSelector('#msm-apri-btn', { timeout: 10000 });
  await s.page.select('#msm-lavorazione', 'porte_rei');
  await s.page.click('#msm-apri-btn');
  await s.page.waitForSelector('#msm-motore', { timeout: 10000 });
  await attendiQuiete(s.stato, 600);
}
async function apriSchedaPorteMano(s, progettoId) {
  await s.page.evaluate(async progettoId => {
    let el = document.getElementById('mvt-id');
    if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.id = 'mvt-id'; document.body.appendChild(el); }
    el.value = progettoId;
    await apriSchedaPorteReiIngegnere();
  }, progettoId);
  await attendiQuiete(s.stato, 900);
}
const valori = (s, ids) => s.page.evaluate(ids => ids.map(id => { const e = document.getElementById(id); return e ? e.value : null; }), ids);
async function scrivi(s, id, testo) {
  await s.page.evaluate(id => { const e = document.getElementById(id); e.value = ''; }, id);
  await s.page.type('#' + id, testo);
}


const toastTesto = s => s.page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');


const testoDialoghi = s => s.stato.dialoghi.join(' / ');

async function inviaE(s, funzione, progettoId) {
  s.stato.dialoghi = [];
  await s.page.evaluate(async (f, id) => { await window[f](id); }, funzione, progettoId);
  await attendiQuiete(s.stato, 1500);
  return testoDialoghi(s);
}
const chiudiScheda = s => s.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });


const fileFinto = (nome, byte, seme) => {
  const p = path.join(CARTELLA_OUT, nome);
  const b = Buffer.alloc(byte);
  crypto.createHash('sha256').update(String(seme)).digest().copy(b, 0);
  for (let i = 32; i < Math.min(byte, 4096); i++) b[i] = (i * 31 + seme) & 255;
  fs.writeFileSync(p, b);
  return p;
};
async function caricaNellaVoce(s, docId, file) {
  const input = await s.page.$('#msm-fv-' + docId + ' input[type=file]');
  if (!input) throw new Error('manca il caricamento della voce ' + docId);
  await input.uploadFile(file);
  await attendiQuiete(s.stato, 1500, 60000);
}

const REGOLA_DNS = '--host-resolver-rules=MAP ' + HOST_PROD + ' 127.0.0.1:9';
const lanciaChrome = () => puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-first-run', '--disable-features=Translate', REGOLA_DNS] });
const cacheApp = page => page.evaluate(async () => {
  const nomi = await caches.keys();
  const out = { nomi: nomi.sort(), voci: {} };
  for (const n of nomi) out.voci[n] = (await (await caches.open(n)).keys()).map(r => r.url);
  return out;
});
async function attendiSw(page, versione) {
  await page.waitForFunction(async v => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!(r && r.active && /sw\.js\?v=/.test(r.active.scriptURL) && r.active.scriptURL.endsWith('v=' + v) && navigator.serviceWorker.controller &&
      (await caches.keys()).includes('toli-app-' + v));
  }, { timeout: 60000, polling: 300 }, versione);
}

async function provaServiceWorker(KO, righe, srv, utenteFinto) {
  const browser = await lanciaChrome();
  try {
    const contesto = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
    const page = await contesto.newPage();
    const errori = [];
    page.on('pageerror', e => errori.push(String(e.message).split('\n')[0]));
    await page.setViewport({ width: 390, height: 844 });
    // Sul Mac il service worker si registra solo con questa chiave (js/57)
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('toli_sw_locale', '1'); } catch (e) { /* niente */ } });
    const base = 'http://127.0.0.1:' + srv.address().port + '/';
    SITO_STATO.versione = '202611109901';
    await page.goto(base + 'index.html', { waitUntil: 'load', timeout: 60000 });
    await attendiSw(page, '202611109901');
    const c1 = await cacheApp(page);
    const scriptIndice = await page.evaluate(() => [...document.querySelectorAll('script[src^="js/"]')].map(s => s.src));
    const inCache = c1.voci['toli-app-202611109901'] || [];
    const mancano = scriptIndice.filter(u => !inCache.includes(u));
    if (mancano.length || !scriptIndice.length) KO('A1: script non nella cache della versione: ' + mancano.slice(0, 5).join(', '));
    else righe.push('A1. service worker sw.js?v=202611109901 attivo; cache toli-app-202611109901 con tutti i ' + scriptIndice.length + ' script di index.html, style.css e index.html; cache: ' + c1.nomi.join(', '));
    const lib = c1.voci['toli-librerie-1'] || [];
    if (lib.length < 5) KO('A1: librerie CDN in cache: ' + lib.length + ' ' + lib.join(', '));
    else righe.push('    librerie dei CDN in cache: ' + lib.length + ' (supabase-js, jsPDF, autotable, pdf-lib, xlsx)');

    // A2. Sito spento: l'app si apre lo stesso
    SITO_STATO.spento = true;
    errori.length = 0;
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('lp')).display !== 'none' && typeof boot === 'function', { timeout: 30000 });
    const pdf = await page.evaluate(async () => { try { await caricaLibreriePDF(); return !!(window.jspdf && window.jspdf.jsPDF); } catch (e) { return 'errore: ' + e.message; } });
    if (pdf !== true) KO('A2: jsPDF senza rete: ' + pdf);
    if (errori.length) KO('A2: errori JavaScript senza rete: ' + errori.join(' | '));
    else righe.push('A2. sito spento (senza rete): la pagina di accesso si apre dalla cache, nessun errore JavaScript; jsPDF dalla cache: ' + pdf);

    // A3. Senza rete con l'utente salvato sul telefono: si entra
    await page.evaluate((u, chiave) => {
      localStorage.setItem('toli_offline_utente', JSON.stringify(u));
      localStorage.setItem(chiave, JSON.stringify({ access_token: 'x.y.z', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 60, refresh_token: 'finto', user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email } }));
    }, utenteFinto, 'sb-' + HOST_PROD.split('.')[0] + '-auth-token');
    await page.setOfflineMode(true);
    errori.length = 0;
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    const t3 = Date.now();
    const entrato = await page.waitForFunction(() => typeof ROLE !== 'undefined' && ROLE && document.getElementById('app').style.display === 'block' && document.querySelector('#pg-dashboard-rapp.on'), { timeout: 60000 }).then(() => true, () => false);
    const sec3 = ((Date.now() - t3) / 1000).toFixed(1);
    await attendi(800);
    const visto = await page.evaluate(() => ({ ruolo: typeof ROLE !== 'undefined' ? ROLE : null, pagina: (document.querySelector('.page.on') || {}).id, barra: (document.getElementById('coda-rete') || {}).innerText || '', menu: (document.getElementById('nav-coda') || {}).innerText || '' }));
    await page.screenshot({ path: path.join(CARTELLA_OUT, 'A3-senza-rete-390.png') });
    if (!entrato || visto.ruolo !== 'rappresentante' || !/Senza rete/.test(visto.barra)) KO('A3: avvio senza rete: ' + JSON.stringify(visto) + ' errori ' + errori.join(' | '));
    else righe.push('A3. modalità aereo con l\'utente salvato: entra (' + visto.pagina + ' in ' + sec3 + ' s, ruolo ' + visto.ruolo + '), barra "' + visto.barra.slice(0, 60) + '…", menu ' + visto.menu.trim());
    await page.setOfflineMode(false);
    await page.evaluate(() => { localStorage.removeItem('toli_offline_utente'); Object.keys(localStorage).filter(k => /^sb-/.test(k)).forEach(k => localStorage.removeItem(k)); });

    // A4. Nuova pubblicazione: nuovo service worker, nuova cache, la vecchia via
    SITO_STATO.spento = false;
    SITO_STATO.versione = '202611109902';
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    await attendiSw(page, '202611109902');
    await page.waitForFunction(async () => !(await caches.keys()).includes('toli-app-202611109901'), { timeout: 20000, polling: 300 }).catch(() => {});
    const c2 = await cacheApp(page);
    const versioni = await page.evaluate(() => [...new Set([...document.querySelectorAll('script[src^="js/"]')].map(s => (/v=(\d+)/.exec(s.src) || [])[1]))]);
    if (c2.nomi.includes('toli-app-202611109901') || !c2.nomi.includes('toli-app-202611109902') || versioni.join() !== '202611109902') KO('A4: dopo la nuova versione: cache ' + c2.nomi.join(', ') + ', script ' + versioni.join());
    else righe.push('A4. nuova versione 202611109902: service worker nuovo, cache ' + c2.nomi.join(', ') + ' (la 202611109901 cancellata), pagina con gli script ?v=' + versioni.join());
    // La pagina ricaricata senza rete dopo l'aggiornamento è quella nuova
    SITO_STATO.spento = true;
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    const v3 = await page.evaluate(() => [...new Set([...document.querySelectorAll('script[src^="js/"]')].map(s => (/v=(\d+)/.exec(s.src) || [])[1]))].join());
    if (v3 !== '202611109902') KO('A4: senza rete dopo l\'aggiornamento la pagina è della versione ' + v3);
    else righe.push('    senza rete dopo l\'aggiornamento: index.html e script della versione 202611109902 (niente file vecchi)');
    const push = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.pushManager); });
    if (!push) KO('A5: registrazione senza pushManager');
    else righe.push('A5. stessa registrazione con pushManager per le notifiche di js/59 (sw.js ha ancora push e notificationclick)');
    SITO_STATO.spento = false;
    SITO_STATO.versione = null;
  } finally { await browser.close(); }
}

const leggiCoda = page => page.evaluate(async () => (await codaMie()).map(x => ({ id: x.id, tipo: x.tipo, stato: x.stato, errore: x.errore, allegato_id: x.allegato_id, riga_id: x.riga && x.riga.id })));

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  if (psql("select to_regprocedure('public.foto_video_mancanti_progetto(uuid)') is not null") !== 't') fermati('sql/82-foto-video non eseguito nel database locale');
  const riga = psql("select p.id || '|' || p.stato || '|' || p.rappresentante_id || '|' || coalesce(p.fonte_rilievo, '') from public.progetti_tecnici p join public.utenti u on u.id = p.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where p.stato = 'bozza' and not exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = p.id) order by p.creato_il limit 1");
  if (!riga) fermati('serve un progetto in bozza di un rappresentante senza schede');
  const [progettoId, statoPartenza, rapId, fontePartenza] = riga.split('|');
  const inizio = psql('select now()');
  const docFoto = psql("select d.id from public.lavorazioni_documenti d join public.lavorazioni l on l.id = d.lavorazione_id where l.codice = 'porte_rei' and d.tipo = 'foto' and d.attivo and not d.per_posizione order by d.ordine limit 1");
  if (!docFoto) fermati('manca la voce foto della porta REI nel catalogo (sql/82-foto-video)');
  psql("update public.progetti_tecnici set fonte_rilievo = 'sopralluogo_toli' where id = " + q(progettoId));
  const foto = [1, 2, 3].map(i => fileFinto('porta' + i + '.jpg', (100 + i * 50) * 1024, 100 + i));
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const rap = utenti.find(u => u.id === rapId);
  const conta = () => psql("select (select count(*) from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + ") || '|' || (select count(*) from public.progetti_tecnici_allegati where progetto_id = " + q(progettoId) + " and caricato_il >= " + q(inizio) + ")");
  let browser = null;
  const sessioni = [];
  try {
    await provaServiceWorker(KO, righe, srv, Object.assign({ attivo: true }, rap));

    browser = await lanciaChrome();
    const contesto = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
    const stato = { inCorso: 0, deviate: new Set(), ultima: 0, erroriJs: [], console: [], rete: [], bloccate: [], caricamenti: [], agitoCome: 0, agitoComeValori: new Set(), dialoghi: [] };
    const page = await preparaPagina(contesto, stato);
    await page.setBypassServiceWorker(true);
    const r = { contesto, stato, page };
    sessioni.push(r);
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('lp')).display !== 'none', { timeout: 20000 });
    await page.setViewport({ width: 390, height: 844 });
    await login(r, rap);
    await apriProgetto(r, progettoId);
    await apriMotore(r);

    // B1. Modalità aereo
    await page.setOfflineMode(true);
    await attendi(800);
    for (const f of foto) await caricaNellaVoce(r, docFoto, f);
    await attendi(1200);
    const tFile = await toastTesto(r);
    await page.evaluate(() => { const e = document.getElementById('msm-c-quantita'); if (e) { e.value = '2'; e.dispatchEvent(new Event('input', { bubbles: true })); } });
    await page.click('#msm-salva');
    await attendi(2500);
    const tSalva = await toastTesto(r);
    const coda1 = await leggiCoda(page);
    const vista = await page.evaluate(() => ({
      menu: (document.getElementById('nav-coda') || {}).innerText || '',
      tab: !!document.querySelector('#mrt-content .coda-tab'),
      riga: (document.getElementById('coda-scheda-avviso') || {}).innerText || '',
      barra: (document.getElementById('coda-rete') || {}).innerText || ''
    }));
    await page.evaluate(async () => { window.__copieCoda = await codaMie(); });
    await page.screenshot({ path: path.join(CARTELLA_OUT, 'B1-scheda-salvata-senza-rete-390.png') });
    const nFile = coda1.filter(x => x.tipo === 'file_progetto').length, nSchede = coda1.filter(x => x.tipo === 'scheda_rilievo').length;
    if (conta() !== '0|0') KO('B1: senza rete qualcosa è arrivato al database: ' + conta());
    if (nFile !== 3 || nSchede !== 1 || !/📴/.test(vista.menu) || !/4/.test(vista.menu) || !vista.tab || !/non ancora inviata/.test(vista.riga))
      KO('B1: coda ' + JSON.stringify(coda1) + ' vista ' + JSON.stringify(vista) + ' toast ' + tSalva);
    else righe.push('B1. modalità aereo a 390 px: 3 foto e la scheda salvate sul telefono (coda: ' + nFile + ' file + ' + nSchede + ' scheda), nel database niente; menu "' + vista.menu.trim() + '", 📤 sul tab, "' + vista.riga.slice(0, 50) + '…"; messaggi: "' + tFile.slice(0, 70) + '…" / "' + tSalva.slice(0, 70) + '…"');

    // B2. Riaperta senza rete: i dati ci sono
    await chiudiScheda(r);
    await apriMotore(r);
    const riaperta = await page.evaluate(id => ({
      quantita: (document.getElementById('msm-c-quantita') || {}).value,
      foto: ((MOTORE_SCHEDE.fotoVideo || {})[id] || { allegati: [] }).allegati.length
    }), String(docFoto));
    if (riaperta.quantita !== '2' || riaperta.foto !== 3) KO('B2: scheda riaperta senza rete: ' + JSON.stringify(riaperta));
    else righe.push('B2. chiusa e riaperta senza rete: quantità 2 e 3 foto ci sono ancora');
    await page.evaluate(() => apriCodaOffline());
    await attendi(500);
    const finestra = await page.evaluate(() => document.getElementById('cof-elenco').innerText);
    await page.screenshot({ path: path.join(CARTELLA_OUT, 'B2-da-inviare-390.png') });
    if ((finestra.match(/Non ancora inviato/g) || []).length !== 4) KO('B2: finestra "Da inviare": ' + finestra.slice(0, 300));
    else righe.push('    finestra "📤 Salvato sul telefono, da inviare": 4 righe "⏳ Non ancora inviato"');
    await page.evaluate(() => closeM('m-coda-offline'));

    // B3. Torna la rete: arriva tutto una volta
    await page.setOfflineMode(false);
    await page.waitForFunction(async () => (await codaMie()).length === 0, { timeout: 30000, polling: 500 }).catch(() => {});
    await attendiQuiete(stato, 1500);
    const idScheda = (coda1.find(x => x.tipo === 'scheda_rilievo') || {}).riga_id;
    const idFile = coda1.filter(x => x.tipo === 'file_progetto').map(x => x.allegato_id).sort();
    const dbScheda = psql("select id || '|' || (select string_agg(a ->> 'allegato_id', ',' order by a ->> 'allegato_id') from jsonb_array_elements(dati -> 'foto_video' -> " + q(docFoto) + " -> 'allegati') a) || '|' || coalesce(dati ->> 'quantita', '') from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId));
    const dbFile = psql("select string_agg(id::text || ':' || length(impronta), ',' order by id::text) from public.progetti_tecnici_allegati where progetto_id = " + q(progettoId) + " and caricato_il >= " + q(inizio));
    const caricati = stato.caricamenti.filter(p => idFile.some(id => p.includes(id))).length;
    const coda2 = await leggiCoda(page);
    if (conta() !== '1|3' || dbScheda !== idScheda + '|' + idFile.join(',') + '|2' || dbFile !== idFile.map(x => x + ':64').join(',') || coda2.length || caricati !== 3)
      KO('B3: dopo il ritorno della rete: conta ' + conta() + ', scheda ' + dbScheda + ' (attesa ' + idScheda + '|' + idFile.join(',') + '|2), file ' + dbFile + ', coda ' + JSON.stringify(coda2) + ', caricati nello storage ' + caricati + ' toast ' + await toastTesto(r));
    else righe.push('B3. tornata la rete: arrivati da soli 1 scheda (id del telefono ' + idScheda.slice(0, 8) + '…, quantità 2, le 3 foto) e 3 file con impronta SHA-256 (id del telefono), 3 caricamenti nello storage; coda vuota; "' + (await toastTesto(r)).slice(0, 60) + '"');

    // B4. Rimandate le stesse 4 righe (invio interrotto e ripetuto): nessun doppione
    const doppio = await page.evaluate(async () => {
      for (const x of window.__copieCoda) await codaMetti(x);
      await inviaCodaOffline();
      return (await codaMie()).map(x => x.id + ' ' + x.stato + ' ' + x.errore);
    });
    await attendiQuiete(stato, 1000);
    if (conta() !== '1|3' || doppio.length) KO('B4: rimandate le stesse righe: conta ' + conta() + ', coda ' + JSON.stringify(doppio));
    else righe.push('B4. rimandate le stesse 4 righe (upsert per id): ancora 1 scheda e 3 file, coda vuota');
    const menuFine = await page.evaluate(() => { const b = document.getElementById('nav-coda'); return b ? getComputedStyle(b).display : 'nessuno'; });
    if (menuFine !== 'none') KO('B4: il 📤 del menu resta visibile: ' + menuFine);

    // B5. Rifiutata dal database (la stessa foto con un altro id): resta con il motivo, si toglie
    const rifiuto = await page.evaluate(async () => {
      const x = Object.assign({}, window.__copieCoda.find(v => v.tipo === 'file_progetto'));
      const id = nuovoIdCoda();
      x.id = 'file:' + id; x.allegato_id = id; x.percorso = x.percorso.replace(/[0-9a-f-]{36}_/, id + '_');
      await codaMetti(x);
      await inviaCodaOffline();
      const resta = await codaMie();
      await apriCodaOffline();
      const testo = document.getElementById('cof-elenco').innerText;
      return { resta: resta.map(v => v.stato + ': ' + v.errore), testo: testo, menu: document.getElementById('nav-coda').className };
    });
    await page.screenshot({ path: path.join(CARTELLA_OUT, 'B5-non-inviata-390.png') });
    if (rifiuto.resta.length !== 1 || !/^errore: .*già tra i file del progetto/.test(rifiuto.resta[0]) || !/Riprova/.test(rifiuto.testo) || !/urgenti/.test(rifiuto.menu) || conta() !== '1|3')
      KO('B5: file rifiutato: ' + JSON.stringify(rifiuto) + ' conta ' + conta());
    else righe.push('B5. stessa foto con un altro id: il database la rifiuta, resta "⚠️ Non inviato: ' + rifiuto.resta[0].replace(/^errore: /, '').slice(0, 70) + '…" con ↻ Riprova e 🗑️ Togli, 📤 rosso nel menu');
    await page.evaluate(async () => { for (const v of await codaMie()) await codaTogli(v.id); closeM('m-coda-offline'); await aggiornaBadgeCoda(); });

    if (stato.erroriJs.length) KO('errori JavaScript: ' + stato.erroriJs.join(' | '));
    const rete = stato.rete.filter(x => (x.status >= 500 && !/già tra i file/.test(x.msg)) || /does not exist|Could not find/i.test(x.msg));
    if (rete.length) KO('errori del database: ' + rete.map(x => x.metodo + ' ' + x.dove + ' ' + x.status + ' ' + x.msg).join(' | '));
    const verso = stato.bloccate.filter(h => h === HOST_PROD);
    if (verso.length) KO('richieste verso la produzione: ' + verso.length);
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    if (browser) await browser.close();
    srv.close();
    try {
      psql('update public.progetti_tecnici set stato = ' + q(statoPartenza) + ', fonte_rilievo = ' + (fontePartenza ? q(fontePartenza) : 'null') + ' where id = ' + q(progettoId));
      psql("delete from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and creato_il >= " + q(inizio));
      psql("delete from public.progetti_tecnici_allegati where progetto_id = " + q(progettoId) + " and caricato_il >= " + q(inizio));
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
