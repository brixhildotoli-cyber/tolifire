#!/usr/bin/env node
// F15.12 - Dati in lettura sul telefono (js/57, sezione F15.12; js/01
// fetchDatabase; js/66 scriviPosizione). Chrome headless con puppeteer-core,
// SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh, sql/77-82 e
// 82-foto-video + -VINCOLO). Produzione mandata su una porta chiusa.
// C. Rappresentante a 390 px: apre con la rete un progetto con una scheda
//    porte REI; in modalità aereo (memoria del sito svuotata: tutto dal
//    telefono) riapre il progetto, "+ Aggiungi posizione" con il menu della
//    lavorazione, salva: nel database niente, 📤 Nuova nell'elenco; letture
//    cifrate (nessun testo in chiaro nell'archivio); tornata la rete la
//    posizione arriva UNA volta con il codice P-xx.
// D. Letture di 8 giorni fa: senza rete non rispondono più (e si cancellano).
// E. Tecnico: "📥 Tieni sul telefono" dei suoi attestati, senza rete Apri =
//    file dal telefono (blob) + apertura registrata; dopo 7 giorni non si
//    apre; RPC miei_giorni_cantiere senza rete come con la rete.
// F. Capo tecnico: scheda_cantiere_commessa e controllo_faldone_commessa
//    senza rete uguali a quelle con la rete; nuova sessione = chiave nuova,
//    le letture di prima non si aprono; Esci = archivio vuoto.
// Alla fine si tolgono posizioni, documento e campi di prova.
// Uso: cd test && node letture-offline.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-letture-offline');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.12';
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
const SESSIONI = {};
function sessione(u) {
  const access = firma({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, iss: 'smoke', iat: ora(), exp: ora() + 3600, session_id: SESSIONI[u.id] || (SESSIONI[u.id] = crypto.randomUUID()) });
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: ora() + 3600, refresh_token: 'smoke-' + u.id, user: utenteAuth(u) };
}

// ── Sito servito in locale (cartella del repository, solo lettura) ─────
const TIPI = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const SITO_STATO = { versione: null, spento: false, richieste: [], errore500: null };
function avviaSito() {
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      // Sito "spento" (senza rete): connessione chiusa senza risposta
      if (SITO_STATO.spento) { req.socket.destroy(); return; }
      SITO_STATO.richieste.push(req.url);
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      // Uno script che non si scarica (rete debole, errore del server)
      if (SITO_STATO.errore500 && p === SITO_STATO.errore500) { res.writeHead(500); return res.end('errore di prova'); }
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
    if (metodo === 'GET' && m && m[1] === 'sign') { stato.scaricati = (stato.scaricati || 0) + 1; return { status: 200, headers: Object.assign({ 'content-type': 'application/pdf' }, CORS), body: '%PDF-1.4 attestato di prova ' + m[2] }; }
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
    // Modalità aereo: anche le richieste intercettate non arrivano
    if (stato.senzaRete) return req.abort('internetdisconnected');
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
  return r.stdout.trim().split("\n").filter(x => !/^(INSERT|UPDATE|DELETE) /.test(x)).join("\n");
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

async function rete(s, c) { s.stato.senzaRete = !c; await s.page.setOfflineMode(!c); }
const REGOLA_DNS = '--host-resolver-rules=MAP ' + HOST_PROD + ' 127.0.0.1:9';
const lanciaChrome = () => puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-first-run', '--disable-features=Translate', REGOLA_DNS] });

// Sessione del browser con il service worker scavalcato (richieste al database locale)
async function nuovaSessione(browser, url, sessioni) {
  const contesto = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const stato = { inCorso: 0, deviate: new Set(), ultima: 0, erroriJs: [], console: [], rete: [], bloccate: [], caricamenti: [], agitoCome: 0, agitoComeValori: new Set(), dialoghi: [] };
  const page = await preparaPagina(contesto, stato);
  await page.setBypassServiceWorker(true);
  await page.setViewport({ width: 390, height: 844 });
  // window.open: si conta e non apre schede
  await page.evaluateOnNewDocument(() => { window.__aperti = []; window.open = function(u) { window.__aperti.push(String(u)); return null; }; });
  const s = { contesto, stato, page };
  sessioni.push(s);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('lp')).display !== 'none', { timeout: 20000 });
  return s;
}
// Archivio delle letture: righe e contenuto grezzo (per vedere che è cifrato)
const archivio = page => page.evaluate(async () => {
  const d = await apriDbLetture();
  const tutti = n => new Promise(ok => { const r = d.transaction(n).objectStore(n).getAll(); r.onsuccess = () => ok(r.result); });
  const letture = await tutti('letture'), attestati = await tutti('attestati'), aperture = await tutti('aperture'), chiavi = await tutti('chiavi');
  const testo = x => new TextDecoder('latin1').decode(new Uint8Array(x));
  return {
    letture: letture.length, attestati: attestati.length, aperture: aperture.length, chiavi: chiavi.length,
    chiaviHex: letture.every(x => /^[0-9a-f]{64}$/.test(x.k)),
    grezzo: letture.map(x => testo(x.dati)).join('\n') + attestati.map(x => testo(x.dati) + testo(x.meta)).join('\n'),
    esportabile: chiavi.map(x => x.chiave && x.chiave.extractable)
  };
});
const invecchia = (page, archivioNome, giorni) => page.evaluate(async (n, g) => {
  const d = await apriDbLetture();
  await new Promise((ok, ko) => {
    const t = d.transaction(n, 'readwrite'); const s = t.objectStore(n);
    const r = s.getAll(); r.onsuccess = () => { r.result.forEach(x => { x.salvato_il = Date.now() - g * 86400000; s.put(x); }); };
    t.oncomplete = ok; t.onerror = () => ko(t.error);
  });
}, archivioNome, giorni);
// Memoria del sito svuotata: le letture devono arrivare dal telefono
const svuotaMemoria = page => page.evaluate(() => {
  if (typeof CATALOGO_LAV !== 'undefined') { CATALOGO_LAV.lavorazioni = []; CATALOGO_LAV.letto = 0; CATALOGO_LAV.disponibili = null; }
  if (typeof POSIZIONI !== 'undefined') { POSIZIONI.progetti = {}; }
  LETTURE.posizioniRighe = {};
  gotoPage(ROLE === 'rappresentante' ? 'dashboard-rapp' : 'dashboard');
});

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  if (psql("select to_regprocedure('public.foto_video_mancanti_progetto(uuid)') is not null") !== 't') fermati('sql/82-foto-video non eseguito nel database locale');
  const riga = psql("select p.id || '|' || p.rappresentante_id || '|' || coalesce(p.titolo, '') from public.progetti_tecnici p join public.utenti u on u.id = p.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where p.stato = 'bozza' and not exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = p.id) and length(coalesce(p.titolo, '')) >= 6 order by p.creato_il limit 1");
  if (!riga) fermati('serve un progetto in bozza di un rappresentante senza schede');
  const [progettoId, rapId, titoloProgetto] = riga.split('|');
  const commessaId = psql("select id from public.commesse where stato not in ('chiusa', 'annullata') order by creato_il limit 1");
  if (!commessaId) fermati('serve una commessa aperta');
  const inizio = psql('select now()');
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const rap = utenti.find(u => u.id === rapId);
  const tec = utenti.find(u => u.ruolo === 'tecnico' && diProva(u)) || utenti.find(u => u.ruolo === 'tecnico');
  const ct = utenti.find(u => u.ruolo === 'capo_tecnico');
  // Dati di prova: scheda porte REI, un menu "per posizione", un attestato del tecnico
  const campoMenu = psql("select c.id || '|' || c.codice from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = 'porte_rei' and c.attivo and c.tipo = 'menu' and not c.per_posizione and not c.serve_al_prezzo and jsonb_array_length(coalesce(c.valori_ammessi, '[]')) >= 2 order by c.ordine limit 1");
  if (!campoMenu) fermati('manca un menu della porta REI nel catalogo');
  const [campoId, campoCodice] = campoMenu.split('|');
  const valoreMenu = psql("select valori_ammessi -> 1 ->> 'valore' from public.lavorazioni_campi where id = " + q(campoId));
  psql("update public.lavorazioni_campi set per_posizione = true where id = " + q(campoId));
  const schedaId = psql("insert into public.progetti_tecnici_schede (progetto_tecnico_id, famiglia, numero, dati) values (" + q(progettoId) + ", 'porte_rei', 1, '{\"nome_scheda\": \"Piano -1\"}') returning id");
  const docPercorso = 'dipendenti/' + tec.id + '/prova_f1512_ple.pdf';
  const docId = psql("insert into public.documenti_team_subappalti (utente_id, tipo, data_rilascio, data_scadenza, nome_file, storage_path, tipo_mime, dimensione, caricato_da, caricato_da_nome, caricato_da_ruolo) values (" +
    q(tec.id) + ", 'ple', current_date - 30, current_date + 300, 'prova_f1512_ple.pdf', " + q(docPercorso) + ", 'application/pdf', 40, " + q(tec.id) + ", 'Prova', 'titolare') returning id");
  const giornoId = psql("insert into public.commesse_squadra_giorni (commessa_id, data, orario, note) values (" + q(commessaId) + ", (now() at time zone 'Europe/Rome')::date, '07:30 ritrovo', " + q(ETICHETTA) + ") on conflict do nothing returning id");
  if (giornoId) psql("insert into public.commesse_squadra_persone (giorno_id, utente_id) values (" + q(giornoId) + ", " + q(tec.id) + ")");
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  let browser = null;
  const sessioni = [];
  const contaPosizioni = () => psql("select count(*) from public.progetti_tecnici_posizioni where scheda_id = " + q(schedaId));
  try {
    browser = await lanciaChrome();

    // ── C. Rappresentante ─────────────────────────────────────────────
    const r = await nuovaSessione(browser, url, sessioni);
    const page = r.page;
    await login(r, rap);
    await apriProgetto(r, progettoId);
    await page.waitForSelector('#pd-posizioni-' + schedaId + ' #pos-nuova-btn', { timeout: 15000 });
    await attendiQuiete(r.stato, 1500);
    const a1 = await archivio(page);
    if (!a1.letture || !a1.chiaviHex || a1.chiavi !== 1 || a1.esportabile.some(x => x !== false)) KO('C1: archivio delle letture: ' + JSON.stringify(Object.assign({}, a1, { grezzo: undefined })));
    else righe.push('C1. con la rete: ' + a1.letture + ' letture tenute sul telefono, chiave AES-GCM non esportabile (1 per sessione), chiavi dell\'archivio = impronte SHA-256');
    const inChiaro = [titoloProgetto, 'porte_rei', 'Piano -1', rap.email].filter(x => x && a1.grezzo.includes(x));
    if (inChiaro.length) KO('C1: testo in chiaro nell\'archivio: ' + inChiaro.join(', '));
    else righe.push('    nessun testo in chiaro nell\'archivio (titolo del progetto, "porte_rei", "Piano -1", email cercati nei byte)');

    await rete(r, false);
    await svuotaMemoria(page);
    await attendi(500);
    const t0 = Date.now();
    await apriProgetto(r, progettoId);
    const vistaOff = await page.evaluate(id => ({
      titolo: (document.querySelector('#pg-progetto-detail') || {}).innerText || '',
      bottone: !!document.querySelector('#pd-posizioni-' + id + ' #pos-nuova-btn'),
      barra: (document.getElementById('coda-rete') || {}).innerText || ''
    }), schedaId);
    if (!vistaOff.titolo.includes(titoloProgetto) || !vistaOff.bottone || !/Senza rete/.test(vistaOff.barra)) KO('C2: progetto senza rete: ' + JSON.stringify({ titolo: vistaOff.titolo.slice(0, 200), bottone: vistaOff.bottone, barra: vistaOff.barra }));
    else righe.push('C2. modalità aereo, memoria del sito svuotata: il progetto «' + titoloProgetto + '» si riapre dal telefono in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s con il tab Rilievi e "+ Aggiungi posizione"');
    await page.click('#pd-posizioni-' + schedaId + ' #pos-nuova-btn');
    await page.waitForFunction(() => document.getElementById('m-posizione').classList.contains('on'), { timeout: 10000 });
    const menu = await page.evaluate(c => { const e = document.getElementById('pos-c-' + c); return e ? [...e.options].map(o => o.value).filter(Boolean) : null; }, campoCodice);
    if (!menu || !menu.includes(valoreMenu)) KO('C3: menu della lavorazione nella posizione senza rete: ' + JSON.stringify(menu));
    else righe.push('C3. finestra della posizione senza rete con il menu «' + campoCodice + '» del catalogo (' + menu.length + ' voci)');
    await scrivi(r, 'pos-ubicazione', 'Corridoio piano -1 ' + ETICHETTA);
    await scrivi(r, 'pos-larghezza', '90');
    await scrivi(r, 'pos-altezza', '210');
    if (menu) await page.select('#pos-c-' + campoCodice, valoreMenu);
    await page.click('#pos-salva');
    await attendi(1500);
    const tPos = await toastTesto(r);
    const coda1 = await page.evaluate(async () => (await codaMie()).map(x => ({ tipo: x.tipo, nuova: x.nuova, id: x.posizione_id, dati: x.riga && x.riga.dati })));
    const elenco = await page.evaluate(id => (document.getElementById('pd-posizioni-' + id) || {}).innerText || '', schedaId);
    await page.screenshot({ path: path.join(CARTELLA_OUT, 'C4-posizione-senza-rete-390.png') });
    const pc = coda1.find(x => x.tipo === 'posizione');
    if (contaPosizioni() !== '0' || !pc || !pc.nuova || !pc.dati || pc.dati[campoCodice] !== valoreMenu || !/Nuova \(da inviare\)/.test(elenco) || !/Corridoio piano -1/.test(elenco))
      KO('C4: posizione senza rete: db ' + contaPosizioni() + ', coda ' + JSON.stringify(coda1) + ', elenco ' + elenco.slice(0, 300) + ', toast ' + tPos);
    else righe.push('C4. "💾 Salva" senza rete: posizione sul telefono (id ' + pc.id.slice(0, 8) + '…, ' + campoCodice + ' = ' + valoreMenu + '), nel database niente, nell\'elenco "📤 Nuova (da inviare)"; "' + tPos.slice(0, 70) + '…"');
    // Riaperta dall'elenco (letta dalla coda) e risalvata: sempre una riga in coda
    await page.evaluate(id => { const b = [...document.querySelectorAll('#pd-posizioni-' + id + ' button')].find(x => /Modifica/.test(x.textContent) && x.closest('.pos-riga') && /Nuova/.test(x.closest('.pos-riga').innerText)); if (b) b.click(); }, schedaId);
    await page.waitForFunction(() => document.getElementById('m-posizione').classList.contains('on'), { timeout: 10000 }).catch(() => {});
    const riap = await page.evaluate(() => ({ ubic: document.getElementById('pos-ubicazione').value, info: document.getElementById('pos-codice-info').textContent }));
    await scrivi(r, 'pos-altezza', '215');
    await page.click('#pos-salva');
    await attendi(1200);
    const coda2 = await page.evaluate(async () => (await codaMie()).filter(x => x.tipo === 'posizione').map(x => x.riga.dati.altezza));
    if (!/Corridoio/.test(riap.ubic) || !/Salvata sul telefono/.test(riap.info) || coda2.length !== 1 || coda2[0] !== 215) KO('C5: riaperta dalla coda: ' + JSON.stringify(riap) + ' coda ' + JSON.stringify(coda2));
    else righe.push('C5. riaperta senza rete dall\'elenco ("' + riap.info.slice(0, 45) + '…"), altezza 215 e risalvata: sempre 1 riga in coda');

    // Torna la rete: arriva una volta con il codice P-xx
    await rete(r, true);
    await page.waitForFunction(async () => (await codaMie()).length === 0, { timeout: 30000, polling: 500 }).catch(() => {});
    await attendiQuiete(r.stato, 1500);
    const arrivata = psql("select count(*) || '|' || string_agg(codice || ':' || (dati ->> 'altezza') || ':' || (dati ->> " + q(campoCodice) + ") || ':' || id, ',') from public.progetti_tecnici_posizioni where scheda_id = " + q(schedaId));
    const elencoDopo = await page.evaluate(id => (document.getElementById('pd-posizioni-' + id) || {}).innerText || '', schedaId);
    const tArr = await toastTesto(r);
    if (!new RegExp('^1\\|P-\\d+:215:' + valoreMenu + ':' + pc.id + '$').test(arrivata) || /da inviare/.test(elencoDopo)) KO('C6: dopo la rete: ' + arrivata + ' elenco ' + elencoDopo.slice(0, 200) + ' toast ' + tArr);
    else righe.push('C6. tornata la rete: 1 posizione arrivata (' + arrivata.split('|')[1].split(':')[0] + ', id del telefono, altezza 215, menu), elenco aggiornato; "' + tArr.slice(0, 70) + '"');
    // Rimandata la stessa riga: nessun doppione
    await page.evaluate(async (id, scheda, prog) => {
      await codaMetti({ id: 'posizione:' + id, tipo: 'posizione', utente_id: ME_REALE.id, ordine: Date.now() * 1000, creato_il: new Date().toISOString(), stato: 'in_attesa', errore: '', tentativi: 0, progetto_id: prog, scheda_id: scheda, famiglia: 'porte_rei', nuova: true, posizione_id: id, riga: { id: id, scheda_id: scheda, progetto_tecnico_id: prog, numero: 1, quantita: 1, ubicazione: 'doppione', dati: {} } });
      await inviaCodaOffline();
    }, pc.id, schedaId, progettoId);
    await attendiQuiete(r.stato, 800);
    const dopp = await page.evaluate(async () => (await codaMie()).length);
    if (contaPosizioni() !== '1' || dopp) KO('C7: rimandata la stessa posizione: ' + contaPosizioni() + ' righe, coda ' + dopp);
    else righe.push('C7. rimandata la stessa posizione (stesso id): ancora 1 riga nel database, coda vuota');

    // ── D. 7 giorni ───────────────────────────────────────────────────
    await attendi(1500);
    await rete(r, false);
    await svuotaMemoria(page);
    await attendi(400);
    await invecchia(page, 'letture', 8);
    const a2prima = await archivio(page);
    await page.evaluate(async id => { await openProgettoDetail(id); }, progettoId).catch(() => {});
    await attendi(2500);
    const scaduto = await page.evaluate(() => ({ pagina: (document.querySelector('.page.on') || {}).id, toast: (document.getElementById('toast') || {}).textContent || '' }));
    const a2 = await archivio(page);
    await page.screenshot({ path: path.join(CARTELLA_OUT, 'D1-letture-scadute-390.png') });
    if (scaduto.pagina === 'pg-progetto-detail' || !/Errore apertura progetto/.test(scaduto.toast) || a2.letture >= a2prima.letture) KO('D1: dopo 8 giorni senza rete: ' + JSON.stringify(scaduto) + ' archivio ' + a2.letture);
    else righe.push('D1. letture di 8 giorni fa: senza rete il progetto non si apre più ("' + scaduto.toast.slice(0, 50) + '…"); quelle lette e scadute si cancellano (archivio da ' + a2prima.letture + ' a ' + a2.letture + ')');
    await rete(r, true);
    await chiudi(r);

    // ── E. Tecnico: attestati ─────────────────────────────────────────
    const e = await nuovaSessione(browser, url, sessioni);
    await login(e, tec);
    await e.page.waitForFunction(() => document.querySelector('#tec-miei-documenti .att-telefono-btn'), { timeout: 15000 }).catch(() => {});
    const giorni = await e.page.evaluate(async () => { const d = new Date(); const x = dataLocaleISO(d); const { data, error } = await db.rpc('miei_giorni_cantiere', { p_dal: x, p_al: x }); return JSON.stringify(error ? { errore: error.message } : data); });
    await e.page.click('#tec-miei-documenti .att-telefono-btn');
    await e.page.waitForFunction(() => document.querySelector('#tec-miei-documenti .att-tel'), { timeout: 15000 }).catch(() => {});
    const riga1 = await e.page.evaluate(() => (document.querySelector('#tec-miei-documenti .att-telefono') || {}).innerText || '');
    const a3 = await archivio(e.page);
    if (a3.attestati !== 1 || !/1 di 1 sul telefono/.test(riga1) || a3.grezzo.includes('attestato di prova')) KO('E1: 📥 Tieni sul telefono: ' + riga1 + ' ' + JSON.stringify({ attestati: a3.attestati }));
    else righe.push('E1. tecnico: "📥 Tieni sul telefono" = 1 attestato cifrato sul telefono, 📱 su Apri, "' + riga1.slice(0, 80) + '"');
    await rete(e, false);
    await e.page.evaluate(() => { window.__aperti = []; });
    await e.page.evaluate(p => apriFileDocumentoTS(p), docPercorso);
    await attendi(800);
    const aperto = await e.page.evaluate(async () => {
      const u = window.__aperti[0] || '';
      let testo = '';
      if (u.startsWith('blob:')) testo = await (await fetch(u)).text();
      return { u: u.slice(0, 5), testo };
    });
    const giorniOff = await e.page.evaluate(async () => { const d = new Date(); const x = dataLocaleISO(d); const { data, error } = await db.rpc('miei_giorni_cantiere', { p_dal: x, p_al: x }); return JSON.stringify(error ? { errore: error.message } : data); });
    await e.page.evaluate(() => apriCodaOffline());
    await attendi(800);
    const fin = await e.page.evaluate(() => (document.getElementById('cof-telefono') || {}).innerText || '');
    await e.page.screenshot({ path: path.join(CARTELLA_OUT, 'E2-attestato-senza-rete-390.png') });
    const a4 = await archivio(e.page);
    if (aperto.u !== 'blob:' || !aperto.testo.includes('attestato di prova') || a4.aperture !== 1 || !/Aperture registrate/.test(fin) || !/senza rete/.test(fin)) KO('E2: attestato senza rete: ' + JSON.stringify(aperto) + ' aperture ' + a4.aperture + ' finestra ' + fin.slice(0, 300));
    else righe.push('E2. senza rete "Apri" = file dal telefono (blob, contenuto giusto), apertura registrata: "' + fin.split('\n').filter(x => /senza rete\)/.test(x))[0] + '"');
    if (giorniOff !== giorni || /errore/.test(giorni) || (giornoId && !giorni.includes('07:30 ritrovo'))) KO('E3: miei_giorni_cantiere senza rete ' + giorniOff.slice(0, 100) + ' con la rete ' + giorni.slice(0, 100));
    else righe.push('E3. RPC miei_giorni_cantiere (sql/35) senza rete = la risposta con la rete (cantiere di oggi con "07:30 ritrovo", ' + giorni.length + ' caratteri)');
    await e.page.evaluate(() => closeM('m-coda-offline'));
    await invecchia(e.page, 'attestati', 8);
    await e.page.evaluate(() => { window.__aperti = []; });
    await e.page.evaluate(p => apriFileDocumentoTS(p), docPercorso);
    await attendi(800);
    const t8 = await toastTesto(e);
    const aperti8 = await e.page.evaluate(() => window.__aperti.length);
    if (aperti8 || !/7 giorni/.test(t8)) KO('E4: attestato di 8 giorni fa: aperti ' + aperti8 + ' toast ' + t8);
    else righe.push('E4. attestato tenuto 8 giorni fa: non si apre più, "' + t8.slice(0, 80) + '…"');
    await rete(e, true);
    // Esci: archivio vuoto
    await e.page.evaluate(() => doLogout());
    await attendi(2500);
    const a5 = await e.page.evaluate(async () => {
      const d = await new Promise(ok => { const r = indexedDB.open('toli-letture-offline'); r.onsuccess = () => ok(r.result); });
      const n = s => new Promise(ok => { const r = d.transaction(s).objectStore(s).count(); r.onsuccess = () => ok(r.result); });
      return [await n('letture'), await n('attestati'), await n('aperture'), await n('chiavi')].join(',');
    });
    if (a5 !== '0,0,0,0') KO('E5: dopo Esci restano ' + a5 + ' (letture, attestati, aperture, chiavi)');
    else righe.push('E5. "Esci": letture, attestati, registro e chiave tolti dal telefono (0,0,0,0)');
    await chiudi(e);

    // ── F. Capo tecnico: cantiere e faldone ──────────────────────────
    const f = await nuovaSessione(browser, url, sessioni);
    await login(f, ct);
    const rpc = (nome) => f.page.evaluate(async (n, id) => { const { data, error } = await db.rpc(n, { p_commessa_id: id }); return JSON.stringify(error ? { errore: error.message } : data); }, nome, commessaId);
    const sc1 = await rpc('scheda_cantiere_commessa'), fa1 = await rpc('controllo_faldone_commessa');
    await attendiQuiete(f.stato, 800);
    await rete(f, false);
    const sc2 = await rpc('scheda_cantiere_commessa'), fa2 = await rpc('controllo_faldone_commessa');
    if (sc1 !== sc2 || fa1 !== fa2 || /errore/.test(sc1)) KO('F1: senza rete scheda cantiere ' + sc2.slice(0, 80) + ' / ' + sc1.slice(0, 80) + ', faldone ' + fa2.slice(0, 80) + ' / ' + fa1.slice(0, 80));
    else righe.push('F1. capo tecnico: scheda_cantiere_commessa (sql/34, ' + sc1.length + ' caratteri) e controllo_faldone_commessa senza rete = con la rete');
    // Nuova sessione (nuovo accesso, session_id diverso): la chiave cambia, le letture di prima no
    await f.page.evaluate(chiave => {
      const s = JSON.parse(localStorage.getItem(chiave));
      const p = s.access_token.split('.');
      const corpo = JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/')));
      corpo.session_id = 'sessione-nuova';
      p[1] = btoa(JSON.stringify(corpo)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
      s.access_token = p.join('.');
      localStorage.setItem(chiave, JSON.stringify(s));
    }, 'sb-' + HOST_PROD.split('.')[0] + '-auth-token');
    const sc3 = await rpc('scheda_cantiere_commessa');
    const a6 = await archivio(f.page);
    if (!/errore/.test(sc3) || a6.letture) KO('F2: con una sessione nuova le letture di prima: ' + sc3.slice(0, 80) + ' archivio ' + a6.letture);
    else righe.push('F2. nuova sessione (session_id diverso): chiave nuova, letture di prima cancellate, senza rete la scheda cantiere non risponde più');
    await rete(f, true);

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(x => x.status >= 500 || /does not exist|Could not find/i.test(x.msg));
      if (rete.length) KO('errori del database: ' + rete.map(x => x.metodo + ' ' + x.dove + ' ' + x.status + ' ' + x.msg).join(' | '));
      if (s.stato.bloccate.filter(h => h === HOST_PROD).length) KO('richieste verso la produzione');
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    if (browser) await browser.close();
    srv.close();
    try {
      psql("delete from public.progetti_tecnici_posizioni where scheda_id = " + q(schedaId));
      psql("delete from public.progetti_tecnici_schede where id = " + q(schedaId));
      psql("delete from public.documenti_team_subappalti where id = " + q(docId));
      if (giornoId) { psql("delete from public.commesse_squadra_persone where giorno_id = " + q(giornoId)); psql("delete from public.commesse_squadra_giorni where id = " + q(giornoId)); }
      psql("update public.lavorazioni_campi set per_posizione = false where id = " + q(campoId));
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
