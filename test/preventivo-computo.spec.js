#!/usr/bin/env node
// Computo dell'ingegnere nel preventivo (richiesta di Erika del 12/11,
// sql/264 esteso, js/18), Chrome headless con puppeteer-core, SOLO DATABASE
// LOCALE (test/locale/avvia-db-locale.sh, container toli-smoke-db; lo Storage
// è finto: i file caricati dal sito restano in memoria del test).
// Il "fatto quando":
//  1. Acquisti apre la sua bozza (oggetto, nota, 2 voci): nel riquadro
//     "🏷️ Oggetto e nota iniziale", tra Oggetto e nota, "📐 Computo
//     (facoltativo)" con "📎 Carica Excel o PDF"; carica un Excel (generato
//     qui con la libreria xlsx: 3 colonne, intestazione e 5 righe di misure):
//     nel database computo_path = <id>/computo/<ora>_<nome>, computo_nome;
//  2. "Genera PDF cliente": la tabella del computo sta DOPO "Oggetto:" e
//     PRIMA della nota, prima della prima voce; numeri come li dà xlsx;
//  3. "🔁 Sostituisci" con un PDF come quello di Erika (A4 orizzontale, una
//     tabellina di 7 colonne x 7 righe in alto a sinistra, il resto bianco):
//     il file di prima si toglie dallo Storage; nel PDF finale NESSUNA
//     pagina a sé del computo (l'immagine solo sulla pagina 1, al massimo
//     una pagina in più per il contenuto che scorre): sulla pagina 1
//     "Oggetto:", l'immagine del computo (ritagliata, non più larga di 178 mm
//     né ingrandita), la nota e subito la tabella dei prezzi; piè di pagina
//     su tutte le pagine (12/11);
//  4. "✖ Togli": nel database vuoto, il PDF è uguale (contenuto delle pagine)
//     a quello senza computo;
//  5. il rappresentante, con lo sconto (sql/258, js/69 "Rifai il PDF"),
//     rifà il PDF con il computo PDF: l'immagine c'è, tra Oggetto e la
//     prima voce, nessuna pagina a sé;
//  6. SENZA sql/264 (rilevato da solo, o COMPUTO_SENZA_SQL=1): nessun
//     riquadro, PDF come prima, nessuna richiesta in errore.
// Alla fine il preventivo di prova si toglie (solo database locale).
// I download vanno in COMPUTO_DOWNLOAD (predefinita: $TMPDIR/toli-preventivo-computo).
// Uso: cd test && node preventivo-computo.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.COMPUTO_DOWNLOAD || path.join(os.tmpdir(), 'toli-preventivo-computo');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA COMPUTO';
const SK_PROD = null;
const FILE_PROVA = {};   // nome del file di prova → contenuto
const STORAGE = {};      // percorso caricato → contenuto
const STORAGE_PSQL = new Set(); // percorsi messi dal test con psql
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
    // Storage finto: i file caricati restano in memoria (FILE_PROVA), il
    // computo si scarica con lo stesso percorso; DELETE li toglie.
    const m = /^\/storage\/v1\/object\/(list|sign|public|authenticated|info)?\/?(.*)$/.exec(p);
    if (metodo === 'POST' && m && m[1] === 'list') return json(200, []);
    if (metodo === 'POST' && m && m[1] === 'sign') return json(200, m[2].includes('/') ? { signedURL: '/object/sign/' + m[2] + '?token=smoke' } : firmeInBloccoProva(m[2], req.postData()));
    if ((metodo === 'POST' || metodo === 'PUT') && m && !m[1]) {
      stato.caricamenti.push(m[2]);
      const nome = Object.keys(FILE_PROVA).find(n => m[2].endsWith('_' + n));
      if (nome) STORAGE[m[2]] = FILE_PROVA[nome];
      return json(200, { Key: m[2], Id: crypto.randomUUID() });
    }
    if (metodo === 'GET' && m && (!m[1] || m[1] === 'authenticated')) {
      const chiave = decodeURIComponent(m[2]);
      stato.scaricati.push(chiave);
      const nome = Object.keys(FILE_PROVA).find(n => chiave.endsWith('_' + n));
      const buf = STORAGE[chiave] || (nome && chiave.includes('/computo/') && STORAGE_PSQL.has(chiave) ? FILE_PROVA[nome] : null);
      if (buf) return { status: 200, headers: Object.assign({ 'content-type': 'application/octet-stream' }, CORS), body: buf };
      return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found (test locale)' });
    }
    if (metodo === 'DELETE') {
      let prefissi = [];
      try { prefissi = JSON.parse(req.postData() || '{}').prefixes || []; } catch (e) { prefissi = []; }
      const bucket = (m && m[2]) || '';
      prefissi.forEach(x => { stato.tolti.push(bucket + '/' + x); delete STORAGE[bucket + '/' + x]; });
      return json(200, []);
    }
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
  const stato = { inCorso: 0, deviate: new Set(), ultima: 0, erroriJs: [], console: [], rete: [], bloccate: [], caricamenti: [], scaricati: [], tolti: [], agitoCome: 0, agitoComeValori: new Set() };
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

const OGGETTO = 'Compartimentazione EI 120 al piano terra';
const NOTA = 'NOTAPROVA-COMPUTO come da computo allegato.';
const VOCE1 = 'VOCEPROVA-1';
const VOCE2 = 'VOCEPROVA-2';
const VOCI_ALTRE = ['VOCEPROVA-3', 'VOCEPROVA-4', 'VOCEPROVA-5', 'VOCEPROVA-6'];
const XLSX_NOME = 'Computo_misure.xlsx';
const PDF_NOME = 'Computo_ingegnere.pdf';
const CELLA = 'Parete corridoio nord';     // testo di una cella dell'Excel
// Computo PDF come quello di Erika: tabellina 7 x 7 in alto a sinistra
const COMPUTO_INTESTAZIONI = ['FATTORE', 'TIPOLOGIA', 'LARGHEZZA', 'ALTEZZA', 'LATI', 'LUNGHEZZA', 'SUP. ESPOSTA MQ'];

function attendiDownload(cartella, prima, ms) {
  return new Promise((ok, ko) => {
    const t0 = Date.now();
    const giro = () => {
      const nuovi = fs.readdirSync(cartella).filter(f => f.endsWith('.pdf') && !prima.includes(f));
      if (nuovi.length) return setTimeout(() => ok(nuovi[0]), 500);
      if (Date.now() - t0 > ms) return ko(new Error('nessun PDF scaricato'));
      setTimeout(giro, 200);
    };
    giro();
  });
}
function contenutoPdf(testo) {
  return testo.split(/\r?\n/).filter(r => !/CreationDate|ModDate|^\/ID |Preventivo_\d+_Toli_Fire_\d+/.test(r))
    .map(r => r.replace(/generato il \d\d\/\d\d\/\d{4}, \d\d:\d\d:\d\d/, 'generato il <data>')).join('\n');
}
async function apriEditor(s, preventivoId) {
  await s.page.evaluate(async id => { await openPreventivoDetail(id); }, preventivoId);
  await attendiQuiete(s.stato, 1200);
  await s.page.evaluate(() => { const t = [...document.querySelectorAll('#pg-preventivo-detail .tab')].find(x => /pvd-costi/.test(x.getAttribute('onclick') || '')); if (t) t.click(); });
  await s.page.waitForSelector('#pvv-note-cliente', { timeout: 20000 });
  await attendiQuiete(s.stato, 600);
}
async function generaPdf(s, cartella, azione) {
  const prima = fs.readdirSync(cartella);
  if (azione) await azione();
  else await s.page.evaluate(() => { const b = [...document.querySelectorAll('#pvd-costi-content button')].find(x => /generaPreventivoClientePDF/.test(x.getAttribute('onclick') || '')); b.click(); });
  const nome = await attendiDownload(cartella, prima, 30000);
  await attendiQuiete(s.stato, 600);
  return fs.readFileSync(path.join(cartella, nome));
}
const testoPdf = buf => buf.toString('latin1').replace(/\\/g, '');
// Solo il flusso dei contenuti della pagina (dove jsPDF scrive testo e "Do"
// delle immagini, in ordine di disegno)
function flussoPagina(t) {
  const m = t.match(/stream\r?\n[\s\S]*?endstream/g) || [];
  return m.filter(x => /\bTj\b|\bTJ\b|\bDo\b/.test(x)).join('\n');
}
// Larghezza e altezza in mm dell'immagine disegnata (matrice "a 0 0 d e f cm"
// prima di "/Ix Do", in punti PDF)
function misuraImmagine(t) {
  const m = /([\d.]+) 0 0 ([\d.]+) [\d.]+ [\d.]+ cm\s*\/[A-Za-z0-9]+ Do/.exec(flussoPagina(t));
  return m ? { l: Number(m[1]) * 25.4 / 72, a: Number(m[2]) * 25.4 / 72 } : null;
}
// Pagine del PDF (anche dopo pdf-lib): numero e testo di ogni pagina,
// ricavati nel browser con pdf-lib (una pagina per documento, senza
// flussi di oggetti, così il testo di jsPDF si legge com'è).
async function pagineDelPdf(s, buf) {
  return s.page.evaluate(async b64 => {
    await caricaLibreriaPDFLib();
    const P = window.PDFLib.PDFDocument;
    const byte = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const doc = await P.load(byte);
    const out = [];
    for (let i = 0; i < doc.getPageCount(); i++) {
      const uno = await P.create();
      const [pg] = await uno.copyPages(doc, [i]);
      uno.addPage(pg);
      const salvato = await uno.save({ useObjectStreams: false });
      let t = '';
      for (let k = 0; k < salvato.length; k++) t += String.fromCharCode(salvato[k]);
      out.push(t.replace(/\\/g, ''));
    }
    return out;
  }, buf.toString('base64'));
}
// File di prova creati nel browser: Excel con xlsx (3 colonne, 5 righe di
// misure) e PDF A4 orizzontale con la tabellina 7 x 7 (jsPDF + autoTable);
// restituisce i contenuti in base64.
async function creaFileProva(s) {
  return s.page.evaluate(async (cella, intestazioni) => {
    await caricaLibreriaExcel();
    await preparaPDF();
    const righe = [['Pos.', 'Descrizione', 'Misura (m²)'],
      ['1', cella, 12.5], ['2', 'Parete corridoio sud', 8.25], ['3', 'Cavedio impianti', 3],
      ['4', 'Vano scala', 21.4], ['5', 'Locale tecnico', 6.75], ['', '', ''], ['', '', '']];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(righe), 'Computo');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['FOGLIO-DUE-NON-STAMPATO']]), 'Altro');
    const xlsx = new Uint8Array(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }));
    const { jsPDF } = window.jspdf;
    const d = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    d.autoTable({
      startY: 12, margin: { left: 10 }, tableWidth: 150, theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.2 }, headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0] },
      head: [intestazioni],
      body: [['1,00', 'IPE 200', '0,10', '0,20', '4', '12,00', '28,80'], ['1,00', 'IPE 240', '0,12', '0,24', '4', '8,50', '24,48'],
        ['1,20', 'HEA 160', '0,16', '0,15', '3', '6,00', '11,16'], ['1,00', 'HEB 200', '0,20', '0,20', '4', '10,00', '32,00'],
        ['1,10', 'UPN 120', '0,06', '0,12', '3', '5,00', '4,95'], ['', '', '', '', '', 'TOTALE', '101,39']]
    });
    const pdf = new Uint8Array(d.output('arraybuffer'));
    const b64 = u => { let t = ''; for (let i = 0; i < u.length; i++) t += String.fromCharCode(u[i]); return btoa(t); };
    return { xlsx: b64(xlsx), pdf: b64(pdf) };
  }, CELLA, COMPUTO_INTESTAZIONI);
}
async function scegliFile(s, nome, b64, tipo) {
  await s.page.evaluate((nome, b64, tipo) => {
    const byte = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([byte], nome, { type: tipo }));
    const input = document.getElementById('pvv-computo-file');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, nome, b64, tipo);
  await attendiQuiete(s.stato, 1200);
}
const computoDb = id => psql("select coalesce(computo_path, '<null>') || '|' || coalesce(computo_nome, '<null>') from public.preventivi where id = " + q(id));

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const DOWNLOAD = path.join(CARTELLA_OUT, 'download');
  fs.mkdirSync(DOWNLOAD, { recursive: true });
  fs.readdirSync(DOWNLOAD).filter(f => f.endsWith('.pdf')).forEach(f => fs.unlinkSync(path.join(DOWNLOAD, f)));
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const conSql = psql("select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'preventivi' and column_name = 'computo_path')") === 't';
  const con258 = psql("select to_regprocedure('public.applica_sconto_preventivo(uuid,numeric,text)') is not null") === 't';
  const con265 = psql("select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'preventivi_voci' and column_name = 'quantita_um')") === 't';
  if (CONF.COMPUTO_SENZA_SQL === '1' && conSql) fermati('COMPUTO_SENZA_SQL=1 ma sql/264 è nel database locale (eseguire il -ROLLBACK)');
  righe.push((conSql ? 'database locale CON sql/264' : 'database locale SENZA sql/264') + (con265 ? ' e CON sql/265' : ''));
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const com = primo('commerciale');
  if (!com) fermati('serve un utente Acquisti attivo');
  const riga = psql("select c.id || '|' || c.rappresentante_id || '|' || c.ragione_sociale from public.clienti c join public.utenti u on u.id = c.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where c.eliminato_il is null order by c.ragione_sociale limit 1");
  if (!riga) fermati('serve un cliente con un rappresentante attivo');
  const [clienteId, rapId] = riga.split('|');
  const rap = BACK.perId[rapId];

  const prevId = psql("insert into public.preventivi (cliente_id, commerciale_id, stato, totale_imponibile, iva_perc) values (" + q(clienteId) + ", " + q(com.id) + ", 'bozza', 1300, 22) returning id").split('\n')[0];
  psql("insert into public.preventivi_voci (preventivo_id, categoria, descrizione, unita_misura, quantita, costo_unitario, prezzo_unitario, ordinamento) values (" +
    q(prevId) + ", 'materiale', " + q(VOCE1) + ", 'pz', 1, 600, 1000, 1), (" + q(prevId) + ", 'materiale', " + q(VOCE2) + ", 'pz', 2, 80, 150, 2)" +
    VOCI_ALTRE.map((v, i) => ", (" + q(prevId) + ", 'manodopera', " + q(v) + ", 'h', " + (i + 2) + ", 30, 45, " + (i + 3) + ")").join(''));
  if (conSql) psql("update public.preventivi set oggetto = " + q(OGGETTO) + ", nota_introduttiva = " + q(NOTA) + " where id = " + q(prevId));
  righe.push('preparato: bozza di Acquisti (' + com.email + ') con 6 voci' + (conSql ? ', oggetto e nota' : ''));

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 120000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    const s = await apriSito(browser, url); sessioni.push(s);
    const cdp = await s.page.target().createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD });
    await login(s, com);
    await apriEditor(s, prevId);
    const file = await creaFileProva(s);
    FILE_PROVA[XLSX_NOME] = Buffer.from(file.xlsx, 'base64');
    FILE_PROVA[PDF_NOME] = Buffer.from(file.pdf, 'base64');

    const pdfBase = await generaPdf(s, DOWNLOAD);
    const pagineBase = await pagineDelPdf(s, pdfBase);
    righe.push('PDF senza computo: ' + pagineBase.length + ' pagine');

    const riquadro = await s.page.evaluate(() => ({ box: !!document.getElementById('pvv-computo'), input: !!document.getElementById('pvv-computo-file'),
      testo: (document.getElementById('pvv-computo') || {}).innerText || '' }));
    if (!conSql) {
      if (riquadro.box) KO('senza sql/264 il riquadro del computo non deve comparire');
      else righe.push('senza sql/264: nessun "📐 Computo" nell\'editor');
      const pdf2 = await generaPdf(s, DOWNLOAD);
      if (contenutoPdf(testoPdf(pdf2)) !== contenutoPdf(testoPdf(pdfBase))) KO('senza sql/264 il PDF rigenerato è diverso');
      else righe.push('senza sql/264: PDF rigenerato uguale');
    } else {
      // ordine nell'editor: Oggetto, Computo, Nota
      const ordine = await s.page.evaluate(() => {
        const a = document.getElementById('pvv-oggetto'), b = document.getElementById('pvv-computo'), c = document.getElementById('pvv-nota-introduttiva');
        return !!(a && b && c && (a.compareDocumentPosition(b) & 4) && (b.compareDocumentPosition(c) & 4));
      });
      if (!riquadro.box || !riquadro.input || !/📐 Computo \(facoltativo\)/.test(riquadro.testo) || !/📎 Carica Excel o PDF/.test(riquadro.testo) || !ordine) {
        KO('riquadro del computo non trovato o fuori posto: ' + JSON.stringify({ riquadro, ordine }));
      } else {
        righe.push('editor di Acquisti: "📐 Computo (facoltativo)" tra Oggetto e Nota, con "📎 Carica Excel o PDF"');
        // 1. Excel
        await scegliFile(s, XLSX_NOME, file.xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const dopoXlsx = computoDb(prevId);
        const caricatoXlsx = s.stato.caricamenti.find(x => x.includes('/computo/') && x.endsWith('_' + XLSX_NOME));
        if (!caricatoXlsx || dopoXlsx !== caricatoXlsx.replace(/^preventivi-documenti\//, '') + '|' + XLSX_NOME || !dopoXlsx.startsWith(prevId + '/computo/')) KO('Excel: caricato ' + caricatoXlsx + ', database ' + dopoXlsx);
        else righe.push('Excel caricato in ' + dopoXlsx.split('|')[0].replace(prevId, '<id>') + ' e collegato (nome «' + XLSX_NOME + '»)');
        const testoBox = await s.page.evaluate(() => document.getElementById('pvv-computo').innerText);
        if (!/Computo_misure\.xlsx/.test(testoBox) || !/Sostituisci/.test(testoBox) || !/Togli/.test(testoBox)) KO('dopo il caricamento mancano nome, Sostituisci o Togli: ' + testoBox);

        const pdfX = testoPdf(await generaPdf(s, DOWNLOAD));
        const iO = pdfX.indexOf('Oggetto: ' + OGGETTO), iT = pdfX.indexOf('Computo'), iC = pdfX.indexOf(CELLA), iM = pdfX.indexOf('Misura (m'),
          iN = pdfX.indexOf(NOTA), iV = pdfX.indexOf(VOCE1), iNum = pdfX.indexOf('21.4'), iF2 = pdfX.indexOf('FOGLIO-DUE');
        const ordineX = { oggetto: iO, intestazione: iM, cella: iC, numero: iNum, nota: iN, voce: iV, foglio2: iF2 };
        if ([iO, iC, iM, iN, iV, iNum].some(x => x < 0) || iF2 >= 0 || !(iO < iM && iM < iC && iC < iN && iN < iV)) {
          KO('PDF con l\'Excel: ordine sbagliato ' + JSON.stringify(ordineX));
          fs.writeFileSync(path.join(CARTELLA_OUT, 'pdf-excel.txt'), pdfX, 'latin1');
        } else righe.push('PDF con l\'Excel: "Oggetto:" → tabella del computo (intestazione, 5 righe, 21.4) → nota → prima voce; il secondo foglio no');
        const righeTabella = ['Parete corridoio sud', 'Cavedio impianti', 'Vano scala', 'Locale tecnico'].every(t => pdfX.includes(t));
        if (!righeTabella) KO('PDF con l\'Excel: mancano righe del computo');

        // 2. Sostituisci con un PDF di 2 pagine
        const vecchio = dopoXlsx.split('|')[0];
        await scegliFile(s, PDF_NOME, file.pdf, 'application/pdf');
        const dopoPdf = computoDb(prevId);
        if (!dopoPdf.endsWith('_' + PDF_NOME + '|' + PDF_NOME)) KO('Sostituisci: database ' + dopoPdf);
        else righe.push('"🔁 Sostituisci" con il PDF: collegato il nuovo file');
        if (!s.stato.tolti.some(x => x.endsWith(vecchio))) KO('Sostituisci: il file Excel di prima non è stato tolto dallo Storage');
        else righe.push('il file Excel di prima tolto dallo Storage');
        const bufP = await generaPdf(s, DOWNLOAD);
        fs.writeFileSync(path.join(CARTELLA_OUT, 'preventivo-con-computo-pdf.pdf'), bufP);
        const pag = await pagineDelPdf(s, bufP);
        const p1 = pag[0] || '';
        const fl = flussoPagina(p1);
        const pO = fl.indexOf('Oggetto: ' + OGGETTO), pI = fl.search(/\/[A-Za-z0-9]+ Do\b/), pN = fl.indexOf(NOTA), pV = fl.indexOf(VOCE1);
        const img = misuraImmagine(p1);
        const vociP1 = [VOCE1, VOCE2].concat(VOCI_ALTRE).filter(v => p1.includes(v)).length;
        const esito = { pagine: pag.length, base: pagineBase.length, oggetto: pO, immagine: pI, nota: pN, voce: pV, immagini: pag.map(t => (flussoPagina(t).match(/\/[A-Za-z0-9]+ Do\b/g) || []).length), img, vociP1 };
        // nessuna pagina a sé: l'immagine solo sulla pagina 1, le pagine in più
        // solo per il contenuto che scorre (al massimo una), prezzi subito sotto
        if (!(pag.length <= pagineBase.length + 1 && pO >= 0 && pI > pO && pN > pI && pV > pN && vociP1 >= 1
              && esito.immagini[0] === 1 && esito.immagini.slice(1).every(n => n === 0)
              && img && img.l > 20 && img.l <= 178.5 && img.a < 60)) {
          KO('PDF con il computo PDF: ' + JSON.stringify(esito));
        } else {
          righe.push('PDF con il computo PDF: nessuna pagina a sé (' + pag.length + ' pagine, ' + pagineBase.length + ' senza computo: il resto scorre); pagina 1: "Oggetto:" → immagine del computo ritagliata (' +
            img.l.toFixed(0) + ' x ' + img.a.toFixed(0) + ' mm) → nota → tabella dei prezzi (' + vociP1 + ' voci su 6 nella pagina 1)');
        }
        const fondo = pag.every(t => /Documento generato il/.test(t));
        if (!fondo) KO('piè di pagina "Documento generato il ..." mancante su qualche pagina');
        else righe.push('piè di pagina "Documento generato il ..." su tutte le pagine');

        // 3. Togli
        const daTogliere = dopoPdf.split('|')[0];
        await s.page.evaluate(() => { const b = [...document.querySelectorAll('#pvv-computo button')].find(x => /togliComputoPreventivo/.test(x.getAttribute('onclick') || '')); b.click(); });
        await attendiQuiete(s.stato, 1200);
        if (computoDb(prevId) !== '<null>|<null>') KO('Togli: nel database ' + computoDb(prevId));
        else if (!s.stato.tolti.some(x => x.endsWith(daTogliere))) KO('Togli: il file non è stato tolto dallo Storage');
        else righe.push('"✖ Togli": collegamento vuoto e file tolto dallo Storage');
        const pdfT = await generaPdf(s, DOWNLOAD);
        if (contenutoPdf(testoPdf(pdfT)) !== contenutoPdf(testoPdf(pdfBase))) {
          KO('tolto il computo il PDF non è uguale a quello senza computo');
          fs.writeFileSync(path.join(CARTELLA_OUT, 'pdf-base.txt'), contenutoPdf(testoPdf(pdfBase)), 'latin1');
          fs.writeFileSync(path.join(CARTELLA_OUT, 'pdf-tolto.txt'), contenutoPdf(testoPdf(pdfT)), 'latin1');
        } else righe.push('senza computo il PDF è uguale a prima');
        await s.page.screenshot({ path: path.join(CARTELLA_OUT, 'editor-acquisti.png') });
      }
    }
    if (s.stato.erroriJs.length) KO('errori JavaScript (Acquisti): ' + s.stato.erroriJs.join(' | '));
    const reteA = s.stato.rete.filter(r => !/sconto_rappresentante_attivo/.test(r.dove)
      && (r.status >= 500 || /does not exist|Could not find|computo/i.test(r.msg) || (r.status >= 400 && /^\/preventivi\b/.test(r.dove))));
    if (reteA.length) KO('errori del database (Acquisti): ' + reteA.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
    await chiudi(s);

    // 4. rappresentante con lo sconto: rifà il PDF e il computo c'è
    if (conSql && con258) {
      const percorso = prevId + '/computo/1731400000000_' + PDF_NOME;
      STORAGE_PSQL.add('preventivi-documenti/' + percorso);
      psql("update public.preventivi set computo_path = " + q(percorso) + ", computo_nome = " + q(PDF_NOME) +
        ", stato = 'inviato_a_rappresentante', inviato_a_rappresentante_il = now() where id = " + q(prevId));
      const r = await apriSito(browser, url); sessioni.push(r);
      const cdp2 = await r.page.target().createCDPSession();
      await cdp2.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD });
      await r.page.setViewport({ width: 390, height: 844 });
      await login(r, rap);
      const sc = await r.page.evaluate(async id => {
        const x = await db.rpc('applica_sconto_preventivo', { p_preventivo: id, p_sconto: 5, p_motivazione: 'Prova del computo con lo sconto' });
        return x.error ? x.error.message : 'ok';
      }, prevId);
      if (sc !== 'ok') KO('sconto del rappresentante: ' + sc);
      const bufR = await generaPdf(r, DOWNLOAD, () => r.page.evaluate(async id => { await rifaiPdfScontoPreventivo(id); }, prevId));
      fs.writeFileSync(path.join(CARTELLA_OUT, 'preventivo-rappresentante-sconto.pdf'), bufR);
      const pagR = await pagineDelPdf(r, bufR);
      const flR = flussoPagina(pagR[0] || ''), tuttoR = pagR.join('\n');
      const iO = flR.indexOf('Oggetto: ' + OGGETTO), iI = flR.search(/\/[A-Za-z0-9]+ Do\b/), iV = flR.indexOf(VOCE1), iS = tuttoR.indexOf('Sconto 5%');
      if (iI < 0 || iS < 0 || !(iO < iI && iI < iV) || pagR.length > pagineBase.length + 1 || pagR.slice(1).some(t => /\/[A-Za-z0-9]+ Do\b/.test(flussoPagina(t)))) KO('PDF del rappresentante con lo sconto: ' + JSON.stringify({ oggetto: iO, immagine: iI, voce: iV, sconto: iS, pagine: pagR.length, base: pagineBase.length }));
      else righe.push('rappresentante (' + rap.email + ', 390 px): "Rifai il PDF" con lo sconto del 5% → immagine del computo PDF tra Oggetto e la prima voce, nessuna pagina a sé');
      if (!r.stato.scaricati.some(x => x.endsWith(percorso))) KO('il rappresentante non ha scaricato il computo');
      if (r.stato.erroriJs.length) KO('errori JavaScript (rappresentante): ' + r.stato.erroriJs.join(' | '));
      const reteR = r.stato.rete.filter(x => x.status >= 500 || /does not exist|Could not find|computo/i.test(x.msg));
      if (reteR.length) KO('errori del database (rappresentante): ' + reteR.map(x => x.metodo + ' ' + x.dove + ' ' + x.status + ' ' + x.msg).join(' | '));
      await chiudi(r);
    } else if (conSql) righe.push('sql/258 non presente: prova del rappresentante saltata');
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const x of sessioni) await chiudi(x);
    await browser.close();
    srv.close();
    try {
      if (psql("select to_regclass('public.preventivi_sconti') is not null") === 't') psql("delete from public.preventivi_sconti where preventivo_id = " + q(prevId));
      psql("delete from public.preventivi_voci where preventivo_id = " + q(prevId));
      psql("delete from public.preventivi where id = " + q(prevId));
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Download e schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
  process.exit(0);
})();
