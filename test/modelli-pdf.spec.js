#!/usr/bin/env node
// F16.7 - Motore unico dei PDF da modello (js/00 generaPdfDaModello, js/72,
// sql/98 modelli_pdf). Chrome headless con puppeteer-core, SOLO DATABASE
// LOCALE (test/locale/avvia-db-locale.sh, container toli-smoke-db).
// Il "fatto quando":
//  1. titolare: Impostazioni > "🧾 Modelli dei PDF", modello di prova con la
//     revisione; "🧪 PDF di prova" scarica un PDF con intestazione TOLI FIRE,
//     titolo, campi, tabella letta dal database, testi fissi, allegati,
//     firme e "Modello prova - rev. N" in fondo; impronta SHA-256 mostrata =
//     impronta del file scaricato;
//  2. il titolare cambia la premessa ("✏️ Cambia i testi", "💾 Salva i
//     testi"): revisione N+1 nel database, il PDF successivo riporta il testo
//     nuovo e "rev. N+1" (e non più il testo di prima);
//  3. Acquisti a 390 px: genera lo stesso PDF con il testo nuovo (lettura),
//     ma la console gli rifiuta salva_testi_modello_pdf e l'update diretto;
//     titolare "come" Acquisti rifiutato; Acquisti non ha il riquadro;
//  4. nessun errore JavaScript né del database.
// MODELLI_SENZA_SQL=1: prova senza sql/98 (riquadro "non ancora attivi", PDF
// di prova con i testi predefiniti del sito, nessun errore oltre al 404
// voluto della tabella).
// Alla fine il modello di prova torna come era (testi e revisione).
// I download vanno in MODELLI_PDF_DOWNLOAD (predefinita: $TMPDIR/toli-modelli-pdf).
// Uso: cd test && node modelli-pdf.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.MODELLI_PDF_DOWNLOAD || CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-modelli-pdf');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F16.7';
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
const q = s => "'" + String(s).replace(/'/g, "''") + "'";


async function chiudi(s) { if (s.chiuso) return; s.chiuso = true; try { await s.contesto.close(); } catch (e) { /* già chiuso */ } }

function attendiDownload(cartella, prima, ms) {
  return new Promise((ok, ko) => {
    const t0 = Date.now();
    const giro = () => {
      const nuovi = fs.readdirSync(cartella).filter(f => f.endsWith('.pdf') && !prima.includes(f));
      if (nuovi.length) return setTimeout(() => ok(nuovi[0]), 400);
      if (Date.now() - t0 > ms) return ko(new Error('nessun PDF scaricato'));
      setTimeout(giro, 200);
    };
    giro();
  });
}
async function scaricaCon(s, cartella, azione) {
  fs.readdirSync(cartella).filter(f => f.endsWith('.pdf')).forEach(f => fs.unlinkSync(path.join(cartella, f)));
  const prima = fs.readdirSync(cartella);
  await azione();
  const nome = await attendiDownload(cartella, prima, 20000);
  const buf = fs.readFileSync(path.join(cartella, nome));
  return { nome, buf, testo: buf.toString('latin1').replace(/\\/g, ''), impronta: crypto.createHash('sha256').update(buf).digest('hex') };
}
const SENZA = CONF.MODELLI_SENZA_SQL === '1';
const TESTO_PRIMA = 'Questo documento';

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const DOWNLOAD = path.join(CARTELLA_OUT, 'download');
  fs.mkdirSync(DOWNLOAD, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const presente = psql("select to_regclass('public.modelli_pdf') is not null") === 't';
  if (SENZA && presente) fermati('MODELLI_SENZA_SQL=1 ma sql/98 è nel database locale (eseguire prima il ROLLBACK)');
  if (!SENZA && !presente) fermati('sql/98 non eseguito nel database locale (o MODELLI_SENZA_SQL=1)');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const tit = primo('titolare'), com = primo('commerciale');
  if (!tit || !com) fermati('servono titolare e Acquisti attivi');

  // Stato del modello di prova prima della prova (si rimette alla fine)
  const salvato = presente ? psql("select row_to_json(m)::text from (select titolo, blocchi, revisione, aggiornato_da, aggiornato_da_nome, aggiornato_il from public.modelli_pdf where codice = 'prova') m") : '';
  if (presente && !salvato) fermati('manca il modello di prova (codice prova) in modelli_pdf');
  const token = 'TESTO-CAMBIATO-F167-' + Date.now().toString(36).toUpperCase();

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    // 1-2. Titolare
    const s = await apriSito(browser, url); sessioni.push(s);
    const cdp = await s.page.target().createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD });
    await login(s, tit);
    await s.page.evaluate(() => gotoPage('impostazioni'));
    await attendiQuiete(s.stato, 1500);
    await s.page.waitForFunction(() => { const x = document.getElementById('si-modelli-pdf-stato'); return x && x.textContent && !/Lettura/.test(x.textContent); }, { timeout: 15000 });
    const riquadro = await s.page.evaluate(() => ({ visibile: getComputedStyle(document.getElementById('si-modelli-pdf-card')).display !== 'none',
      stato: document.getElementById('si-modelli-pdf-stato').innerText, testo: document.getElementById('si-modelli-pdf-elenco').innerText }));
    await s.page.evaluate(() => document.getElementById('si-modelli-pdf-card').scrollIntoView());
    await s.page.screenshot({ path: path.join(CARTELLA_OUT, 'titolare-impostazioni' + (SENZA ? '-senza' : '') + '.png') });
    if (!riquadro.visibile) KO('titolare: riquadro "Modelli dei PDF" nascosto');
    if (SENZA) {
      if (!/non sono ancora attivi/.test(riquadro.stato)) KO('senza sql/98: il riquadro non dice "non ancora attivi": ' + riquadro.stato);
      else righe.push('senza sql/98: riquadro «' + riquadro.stato.slice(0, 80) + '…»');
      const pdf = await scaricaCon(s, DOWNLOAD, () => s.page.evaluate(() => provaPdfModello('prova')));
      const attesi = ['TOLI FIRE', 'DOCUMENTO DI PROVA', TESTO_PRIMA, 'Modello prova - testi predefiniti del sito', 'Codice', 'Il responsabile tecnico', 'Allegato di prova n. 1.pdf', 'Pagina 1 di'];
      const mancano = attesi.filter(x => !pdf.testo.includes(x));
      if (mancano.length) { KO('senza sql/98: PDF ' + pdf.nome + ' mancano: ' + mancano.join(' | ')); fs.writeFileSync(path.join(CARTELLA_OUT, 'senza-pdf.txt'), pdf.testo, 'latin1'); }
      else righe.push('senza sql/98: 🧪 PDF di prova → ' + pdf.nome + ' con i testi predefiniti (' + attesi.length + ' testi attesi)');
      const mostrata = await s.page.evaluate(() => (document.getElementById('si-modelli-pdf-ultimo') || {}).innerText || '');
      if (!mostrata.includes(pdf.impronta)) KO('senza sql/98: impronta mostrata diversa dal file: ' + mostrata);
      else righe.push('senza sql/98: impronta SHA-256 mostrata = file scaricato (' + pdf.impronta.slice(0, 16) + '…)');
    } else {
      const r0 = Number(psql("select revisione from public.modelli_pdf where codice = 'prova'"));
      if (!riquadro.testo.includes('rev. ' + r0)) KO('titolare: il riquadro non mostra rev. ' + r0 + ': ' + riquadro.testo);
      // PDF prima del cambio
      const prima = await scaricaCon(s, DOWNLOAD, () => s.page.click('[data-modello-pdf="prova"] button:nth-of-type(2)'));
      await attendiQuiete(s.stato, 500);
      const premessaPrima = JSON.parse(salvato).blocchi.find(b => b.chiave === 'premessa').testo;
      const attesi0 = ['TOLI FIRE', 'Modello prova - rev. ' + r0, 'Rev. ' + r0, 'Codice', 'prova', 'Il responsabile tecnico', 'Allegato di prova n. 1.pdf', 'Pagina 1 di', premessaPrima.slice(0, 30)];
      const manc0 = attesi0.filter(x => !prima.testo.includes(x));
      if (manc0.length) { KO('PDF prima del cambio ' + prima.nome + ' mancano: ' + manc0.join(' | ')); fs.writeFileSync(path.join(CARTELLA_OUT, 'prima-pdf.txt'), prima.testo, 'latin1'); }
      else righe.push('titolare: 🧪 PDF di prova → ' + prima.nome + ' con tabella dal database, testi fissi, allegati, firme e «Modello prova - rev. ' + r0 + '»');
      const mostrata0 = await s.page.evaluate(() => (document.getElementById('si-modelli-pdf-ultimo') || {}).innerText || '');
      if (!mostrata0.includes(prima.impronta)) KO('impronta mostrata diversa dal file: ' + mostrata0 + ' / ' + prima.impronta);
      else righe.push('titolare: impronta SHA-256 mostrata = impronta del file scaricato (' + prima.impronta.slice(0, 16) + '…)');
      // Cambio della premessa
      await s.page.click('[data-modello-pdf="prova"] button:nth-of-type(1)');
      await s.page.waitForSelector('#m-modello-pdf.on, #m-modello-pdf.open, #m-modello-pdf[style*="flex"]', { timeout: 5000 }).catch(() => {});
      await s.page.evaluate(t => { const a = document.querySelector('#mpdf-testi .mpdf-testo[data-chiave="premessa"]'); a.value = 'Premessa di prova: ' + t + '.'; }, token);
      await s.page.screenshot({ path: path.join(CARTELLA_OUT, 'titolare-modello.png') });
      await s.page.click('#mpdf-salva');
      await attendiQuiete(s.stato, 1200);
      const r1 = Number(psql("select revisione from public.modelli_pdf where codice = 'prova'"));
      const nelDb = psql("select blocchi -> 0 ->> 'testo' from public.modelli_pdf where codice = 'prova'");
      if (r1 !== r0 + 1 || !nelDb.includes(token)) KO('salvataggio: revisione ' + r1 + ' (attesa ' + (r0 + 1) + '), testo ' + nelDb);
      else righe.push('titolare: "💾 Salva i testi" → rev. ' + r1 + ' nel database con la premessa nuova');
      const intest = await s.page.evaluate(() => document.getElementById('mpdf-intestazione').innerText);
      if (!intest.includes('rev. ' + r1)) KO('finestra: intestazione senza rev. ' + r1 + ': ' + intest);
      // PDF dopo il cambio, dalla finestra
      const dopo = await scaricaCon(s, DOWNLOAD, () => s.page.click('#mpdf-prova'));
      const manc1 = [token, 'Modello prova - rev. ' + r1, 'Rev. ' + r1].filter(x => !dopo.testo.includes(x));
      if (manc1.length || dopo.testo.includes(premessaPrima.slice(0, 30))) { KO('PDF dopo il cambio ' + dopo.nome + ' mancano: ' + manc1.join(' | ') + (dopo.testo.includes(premessaPrima.slice(0, 30)) ? ' (c\'è ancora la premessa di prima)' : '')); fs.writeFileSync(path.join(CARTELLA_OUT, 'dopo-pdf.txt'), dopo.testo, 'latin1'); }
      else righe.push('titolare: PDF successivo ' + dopo.nome + ' con il testo nuovo e «rev. ' + r1 + '», senza la premessa di prima');
      const esitoFin = await s.page.evaluate(() => document.getElementById('mpdf-esito').innerText);
      if (!esitoFin.includes(dopo.impronta)) KO('finestra: impronta diversa dal file');
      if (dopo.impronta === prima.impronta) KO('impronta uguale prima e dopo il cambio');
      // Titolare "come" Acquisti: rifiutato dal database
      const come = await fetch(BACK.rest + '/rpc/salva_testi_modello_pdf', { method: 'POST', headers: { Authorization: 'Bearer ' + tokenDi(tit), 'Content-Type': 'application/json', 'x-agito-come': com.id },
        body: JSON.stringify({ p_codice: 'prova', p_titolo: 'X', p_testi: { premessa: 'come Acquisti' } }) });
      const comeT = await come.text();
      if (come.ok) KO('titolare "come" Acquisti: salva_testi_modello_pdf accettata ' + comeT);
      else righe.push('titolare "come" Acquisti: rifiutato dal database (' + come.status + ' ' + (JSON.parse(comeT).message || '') + ')');
      await chiudi(s);

      // 3. Acquisti a 390 px
      const a = await apriSito(browser, url); sessioni.push(a);
      await a.page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      const cdpA = await a.page.target().createCDPSession();
      await cdpA.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD });
      await login(a, com);
      const pagine = await a.page.evaluate(() => (PAGINE_RUOLO[ROLE] || []).includes('impostazioni'));
      if (pagine) KO('Acquisti ha la pagina Impostazioni');
      const pdfA = await scaricaCon(a, DOWNLOAD, () => a.page.evaluate(() => generaPdfDaModello('prova', {}, { scarica: true })));
      if (!pdfA.testo.includes(token) || !pdfA.testo.includes('rev. ' + r1)) KO('Acquisti: il PDF non riporta il testo nuovo e la rev. ' + r1);
      else righe.push('Acquisti a 390 px: generaPdfDaModello legge il modello e il PDF ha il testo nuovo e «rev. ' + r1 + '»');
      const console1 = await a.page.evaluate(async () => {
        const x = await db.rpc('salva_testi_modello_pdf', { p_codice: 'prova', p_titolo: 'Da Acquisti', p_testi: { premessa: 'scritto da Acquisti' } });
        const y = await db.from('modelli_pdf').update({ titolo: 'Da Acquisti' }).eq('codice', 'prova').select('id');
        return { rpc: x.error ? (x.error.code + ' ' + x.error.message) : 'ACCETTATA', update: y.error ? (y.error.code + ' ' + y.error.message) : 'righe ' + (y.data || []).length };
      });
      if (!/42501/.test(console1.rpc) || !/42501|permission/.test(console1.update)) KO('Acquisti dalla console: ' + JSON.stringify(console1));
      else righe.push('Acquisti dalla console: RPC rifiutata (' + console1.rpc + '), update diretto rifiutato (' + console1.update + ')');
      const r2 = Number(psql("select revisione from public.modelli_pdf where codice = 'prova'"));
      if (r2 !== r1) KO('dopo i rifiuti la revisione è cambiata: ' + r2);
      await a.page.screenshot({ path: path.join(CARTELLA_OUT, 'acquisti-390.png') });
      await chiudi(a);
    }
    for (const x of sessioni) {
      if (x.stato.erroriJs.length) KO('errori JavaScript: ' + x.stato.erroriJs.join(' | '));
      // 404 voluti: sconto_rappresentante_attivo (js/69 senza sql/258), modelli_pdf senza sql/98; 42501 voluti della console
      const rete = x.stato.rete.filter(r => !/sconto_rappresentante_attivo/.test(r.dove) && !(SENZA && /modelli_pdf/.test(r.dove))
        && !/salva_testi_modello_pdf|\/modelli_pdf/.test(r.dove) && (r.status >= 500 || /does not exist|Could not find/i.test(r.msg)));
      if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
      const r404 = x.stato.rete.filter(r => /modelli_pdf/.test(r.dove));
      if (SENZA) righe.push('senza sql/98: richieste a modelli_pdf in errore: ' + r404.length + ' (' + r404.map(r => r.status).join(', ') + ')');
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const x of sessioni) { try { if (!x.chiuso) await x.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    if (presente && salvato) {
      try {
        // Solo database locale: il modello di prova torna com'era (trigger spenti per la revisione)
        psql("set session_replication_role = replica; update public.modelli_pdf m set titolo = s.titolo, blocchi = s.blocchi, revisione = s.revisione, aggiornato_da = s.aggiornato_da, aggiornato_da_nome = s.aggiornato_da_nome, aggiornato_il = s.aggiornato_il from json_populate_record(null::public.modelli_pdf, " + q(salvato) + "::json) s where m.codice = 'prova'");
        const ora2 = psql("select row_to_json(m)::text from (select titolo, blocchi, revisione, aggiornato_da, aggiornato_da_nome, aggiornato_il from public.modelli_pdf where codice = 'prova') m");
        if (JSON.stringify(JSON.parse(ora2)) !== JSON.stringify(JSON.parse(salvato))) KO('modello di prova non tornato come prima');
      } catch (e) { KO('pulizia: ' + e.message); }
    }
  }
  righe.forEach(r => console.log(r));
  console.log('Download e schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
