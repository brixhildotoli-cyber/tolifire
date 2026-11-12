#!/usr/bin/env node
// Campi nuovi di vernice intumescente e porte REI (sql/263, richiesta di
// Erika del 12/11), Chrome headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh, container toli-smoke-db).
// Il "fatto quando":
//  1. l'ingegnere a 390 px, su un progetto in verifica tecnica, apre il motore
//     della vernice intumescente: ci sono "Materiale del supporto", "Cosa si
//     protegge", "Rivestimento", Capriata nel menu Elemento, Legno grezzo nello
//     stato del supporto, l'etichetta nuova del profilo; superficie senza "*"
//     da sola ma con "(basta uno ...)";
//  2. senza nessuno dei tre (numero di elementi, sviluppo lineare, superficie)
//     dopo il salvataggio "Per il preventivo mancano ... Quantità" e il
//     controllo prima dell'invio lo ferma con "Indica almeno uno tra ...";
//  3. compila legno, capriata e SOLO il numero degli elementi, salva: niente
//     "mancano", il controllo prima dell'invio passa, "invia" ad Acquisti
//     (salva_esito_verifica) senza blocco; la scheda progetto mostra etichette
//     e valori nuovi;
//  4. una porta REI con sgancio Sì, collegata Sì e funzionamento Automatica:
//     Acquisti la vede nel preventivo, nella sua copia e nel PDF delle schede
//     tecniche (js/71) con etichette e valori leggibili, come la vernice.
// Con CAMPI_SENZA_SQL=1 (dopo il ROLLBACK di sql/263): nel motore niente campi
// nuovi, superficie con "*" come prima, nessun errore.
// Le regole di smistamento si spengono durante la prova e tornano come erano;
// alla fine schede di prova tolte e progetto nel suo stato.
// Uso: cd test && node campi-vernice-porte-rei.spec.js   (uscita 0 = TUTTO OK)
'use strict';
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
const CARTELLA_OUT = CONF.CAMPI_VERNICE_DOWNLOAD || CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-campi-vernice-porte-rei');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA CAMPI 263';
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
const q = s => "'" + String(s).replace(/'/g, "''") + "'";

const MSG = 'Indica almeno uno tra numero di elementi, sviluppo lineare e superficie';
const PORTA = { tipo_richiesta: 'definitiva', tipo_intervento: 'fornitura_e_posa', rei: 'rei_60', tipologia: 'battente_singolo', quantita: 1,
  larghezza: 90, altezza: 210, funzionamento: 'automatica', dispositivo_sgancio: 'si', collegato_rilevazione: 'si' };

async function apriProgetto(s, progettoId) {
  await s.page.evaluate(async id => { await openProgettoDetail(id); }, progettoId);
  await attendiQuiete(s.stato, 1200);
  await s.page.evaluate(() => { const t = [...document.querySelectorAll('#pg-progetto-detail .tab')].find(x => /Rilievi tecnici/.test(x.textContent)); if (t) t.click(); });
  await attendiQuiete(s.stato, 800);
}
async function apriVernice(s) {
  await s.page.waitForSelector('#msm-apri-btn', { timeout: 10000 });
  await s.page.select('#msm-lavorazione', 'vernice_intumescente');
  await s.page.click('#msm-apri-btn');
  await s.page.waitForSelector('#msm-motore', { timeout: 10000 });
  await attendiQuiete(s.stato, 700);
}
async function apriPreventivo(s, preventivoId) {
  await s.page.evaluate(async id => { await openPreventivoDetail(id); }, preventivoId);
  await attendiQuiete(s.stato, 1200);
  await s.page.evaluate(() => { const t = [...document.querySelectorAll('#pg-preventivo-detail .tab')].find(x => /Rilievi dell/.test(x.textContent)); if (t) t.click(); });
  await attendiQuiete(s.stato, 900);
}
const opzioni = (s, id) => s.page.evaluate(id => { const e = document.getElementById(id); return e ? [...e.options].map(o => o.value) : null; }, id);
const etichetta = (s, codice) => s.page.evaluate(c => { const e = document.querySelector('[data-campo-motore="' + c + '"] label') || (document.getElementById('msm-c-' + c) || {}).closest?.('.f')?.querySelector('label'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, codice);
async function scrivi(s, id, testo) {
  await s.page.evaluate(id => { const e = document.getElementById(id); e.value = ''; }, id);
  await s.page.type('#' + id, testo);
}
// Registra i toast e gli alert della pagina
async function registraMessaggi(s) {
  s.stato.dialoghi = [];
  s.page.on('dialog', d => s.stato.dialoghi.push(d.message()));
  await s.page.evaluate(() => {
    window.__toast = [];
    const t = window.toast;
    window.toast = function(m, tipo) { window.__toast.push(String(m)); return t.apply(this, arguments); };
  });
}
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

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const DOWNLOAD = path.join(CARTELLA_OUT, 'download');
  fs.mkdirSync(DOWNLOAD, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const SENZA = CONF.CAMPI_SENZA_SQL === '1';
  const c263 = psql("select prosrc like '%sql/263%' from pg_proc where oid = 'public.controlli_invio_progetto(uuid)'::regprocedure");
  if (!SENZA && c263 !== 't') fermati('sql/263 non eseguito nel database locale');
  if (SENZA && c263 === 't') fermati('CAMPI_SENZA_SQL=1 ma sql/263 c\'è: eseguire prima il ROLLBACK di sql/263');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const ing = primo('ingegnere'), com = primo('commerciale');
  if (!ing || !com) fermati('servono ingegnere e Acquisti attivi');

  // Preventivo con progetto senza schede né posizioni (come pdf-schede-tecniche)
  const candidati = psql("select pr.id || '|' || pr.numero || '|' || pr.progetto_tecnico_id || '|' || pt.stato from public.preventivi pr join public.progetti_tecnici pt on pt.id = pr.progetto_tecnico_id " +
    "where not exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = pr.progetto_tecnico_id) " +
    "and not exists (select 1 from public.progetti_tecnici_posizioni p where p.progetto_tecnico_id = pr.progetto_tecnico_id) " +
    "and not exists (select 1 from public.preventivi p2 where p2.progetto_tecnico_id = pr.progetto_tecnico_id and p2.id <> pr.id) " +
    "and pt.stato = 'in_preventivazione' order by pr.creato_il desc limit 40")
    .split('\n').filter(Boolean).map(r => { const x = r.split('|'); return { id: x[0], numero: x[1], progetto: x[2], stato: x[3] }; });
  let scelto = null;
  for (const c of candidati) {
    const r = await rest('/preventivi?select=id&id=eq.' + c.id, tokenDi(com));
    if (r && r.length) { scelto = c; break; }
  }
  if (!scelto) fermati('serve un preventivo con progetto in preventivazione senza schede, letto da Acquisti');
  const progetto = scelto.progetto;

  const regolePrima = psql("select coalesce(string_agg(id || ':' || attiva, ',' order by id), '') from public.regole_smistamento");
  psql('update public.regole_smistamento set attiva = false where attiva');
  const inizio = psql('select now()');
  // l'ingegnere lavora sul progetto in verifica tecnica
  psql("update public.progetti_tecnici set stato = 'in_verifica_tecnica' where id = " + q(progetto));

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    // 1-3. Ingegnere a 390 px ------------------------------------------------
    const g = await apriSito(browser, url); sessioni.push(g);
    await g.page.setViewport({ width: 390, height: 844 });
    await login(g, ing);
    await registraMessaggi(g);
    await apriProgetto(g, progetto);
    await apriVernice(g);
    await g.page.screenshot({ path: path.join(CARTELLA_OUT, '1-ingegnere-vernice-390.png'), fullPage: true });
    const nuovi = await g.page.evaluate(() => ['materiale_supporto', 'tipo_protezione', 'rivestimento'].map(c => !!document.getElementById('msm-c-' + c)));
    const supSola = await etichetta(g, 'superficie');
    if (SENZA) {
      if (nuovi.some(Boolean)) KO('senza sql/263: nel motore ci sono campi nuovi ' + nuovi);
      if (!/\*/.test(supSola || '') || /basta uno/.test(supSola || '')) KO('senza sql/263: superficie deve avere "*" come prima: ' + supSola);
      const el = await opzioni(g, 'msm-c-elemento');
      if (!el || el.includes('capriata')) KO('senza sql/263: menu elemento ' + el);
      if (!fallimenti.length) righe.push('senza sql/263: nel motore niente campi nuovi, niente Capriata, superficie con "*" come prima («' + supSola + '»)');
    } else {
      if (!nuovi.every(Boolean)) KO('1: mancano campi nuovi nel motore ' + nuovi);
      const ordine = await g.page.evaluate(() => [...document.querySelectorAll('#msm-motore [id^="msm-c-"]')].map(e => e.id.replace('msm-c-', '')).slice(0, 5).join(','));
      if (ordine !== 'materiale_supporto,tipo_protezione,elemento,rivestimento,classe_r') KO('1: ordine dei primi campi ' + ordine);
      const mat = await opzioni(g, 'msm-c-materiale_supporto');
      const el = await opzioni(g, 'msm-c-elemento');
      const st = await opzioni(g, 'msm-c-stato_supporto');
      const riv = await opzioni(g, 'msm-c-rivestimento');
      if (!mat || !mat.includes('legno') || !el || el[el.length - 1] !== 'capriata' || !el.includes('pilastro') || !st || !st.includes('legno_grezzo') || !st.includes('zincato') || !riv || !riv.includes('infisso')) {
        KO('1: menu ' + JSON.stringify({ mat, el, st, riv }));
      }
      const prof = await etichetta(g, 'profilo');
      if (!/Tipo e dimensione della sezione \(metallo o legno\)/.test(prof || '')) KO('1: etichetta del profilo ' + prof);
      const n = await etichetta(g, 'numero_elementi');
      if (!/basta uno/.test(supSola || '') || !/basta uno/.test(n || '')) KO('1: segno "basta uno" su superficie/numero elementi: ' + supSola + ' / ' + n);
      if (!fallimenti.length) righe.push('1. ingegnere a 390 px: motore vernice con Materiale del supporto, Cosa si protegge, Rivestimento, Capriata in fondo all\'elemento, legno e calcestruzzo nello stato del supporto, profilo «' + prof + '», superficie «' + supSola + '»');
    }

    // 2. salvataggio senza nessuno dei tre
    await g.page.select('#msm-tipo-richiesta', 'definitiva');
    await attendiQuiete(g.stato, 500);
    if (!SENZA) await g.page.select('#msm-c-materiale_supporto', 'legno');
    await g.page.select('#msm-c-elemento', SENZA ? 'trave' : 'capriata');
    await g.page.select('#msm-c-classe_r', 'r60');
    if (!SENZA) await g.page.select('#msm-c-stato_supporto', 'legno_grezzo');
    await g.page.evaluate(() => { window.__toast = []; });
    await g.page.click('#msm-salva');
    await attendiQuiete(g.stato, 2600);
    const t1 = await g.page.evaluate(() => window.__toast.join(' || '));
    if (!/salvat/i.test(t1)) KO('2: salvataggio: ' + t1);
    const attesoMancano = SENZA ? /Per il preventivo mancano[^|]*Superficie da trattare/ : /Per il preventivo mancano[^|]*Quantità \(numero di elementi, sviluppo lineare o superficie\)/;
    if (!attesoMancano.test(t1)) KO('2: dopo il salvataggio senza quantità: ' + t1);
    g.stato.dialoghi.length = 0;
    const ok1 = await g.page.evaluate(async id => controllaDatiPrimaDellInvio(id), progetto);
    const al1 = g.stato.dialoghi.join(' || ');
    if (ok1 || !(SENZA ? /Superficie da trattare/ : new RegExp(MSG)).test(al1)) KO('2: controllo prima dell\'invio senza quantità: ' + ok1 + ' ' + al1);
    else righe.push('2. senza quantità: «' + (t1.match(/Per il preventivo mancano[^.]*\./) || [''])[0] + '» e l\'invio si ferma (' + (SENZA ? 'Superficie da trattare' : MSG) + ')');

    // 3. solo il numero degli elementi
    await g.page.evaluate(() => { window.__toast = []; });
    await scrivi(g, 'msm-c-numero_elementi', '4');
    await g.page.click('#msm-salva');
    await attendiQuiete(g.stato, 2600);
    const t2 = await g.page.evaluate(() => window.__toast.join(' || '));
    const dati = JSON.parse(psql("select dati::text from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progetto) + " and famiglia = 'vernice_intumescente'") || '{}');
    g.stato.dialoghi.length = 0;
    const ok2 = await g.page.evaluate(async id => controllaDatiPrimaDellInvio(id), progetto);
    if (SENZA) {
      if (ok2 || !/Superficie da trattare/.test(t2)) KO('senza sql/263: con il solo numero degli elementi la superficie resta obbligatoria come prima: ' + ok2 + ' ' + t2);
      else righe.push('senza sql/263: con il solo numero degli elementi la superficie resta obbligatoria (come prima)');
    } else {
      if (/Per il preventivo mancano/.test(t2)) KO('3: dopo il salvataggio con il numero degli elementi: ' + t2);
      if (dati.materiale_supporto !== 'legno' || dati.elemento !== 'capriata' || Number(dati.numero_elementi) !== 4 || dati.stato_supporto !== 'legno_grezzo') KO('3: dati salvati ' + JSON.stringify(dati));
      if (!ok2) KO('3: controllo prima dell\'invio con il numero degli elementi: ' + g.stato.dialoghi.join(' | '));
      const inv = await g.page.evaluate(async id => { const r = await db.rpc('salva_esito_verifica', { p_progetto_id: id, p_stato: 'in_preventivazione', p_nota: null }); return r.error ? r.error.message : 'ok'; }, progetto).catch(e => String(e));
      const st = psql("select stato from public.progetti_tecnici where id = " + q(progetto));
      if (st !== 'in_preventivazione') KO('3: invio ad Acquisti dell\'ingegnere: ' + inv + ' (stato ' + st + ')');
      await apriProgetto(g, progetto);
      const pd = await g.page.evaluate(() => (document.getElementById('pd-schede-content') || {}).innerText || '');
      const mancaPd = ['Materiale del supporto', 'Legno', 'Capriata', 'Legno grezzo'].filter(x => !pd.includes(x));
      if (mancaPd.length) KO('3: scheda progetto senza ' + mancaPd.join(', '));
      await g.page.screenshot({ path: path.join(CARTELLA_OUT, '3-ingegnere-progetto-390.png'), fullPage: true });
      if (!fallimenti.length) righe.push('3. legno, capriata e solo il numero degli elementi (4): salvata senza "mancano", controllo passato, inviata ad Acquisti (' + st + '); scheda progetto con Materiale del supporto: Legno, Capriata, Legno grezzo');
    }

    // 4. Porta REI e PDF delle schede (Acquisti) -------------------------------
    if (!SENZA) {
      psql("update public.progetti_tecnici set stato = 'in_preventivazione' where id = " + q(progetto));
      const portaId = psql("insert into public.progetti_tecnici_schede (progetto_tecnico_id, famiglia, numero, dati, stato) values (" + q(progetto) + ", 'porte_rei', 1, " + q(JSON.stringify(PORTA)) + "::jsonb, 'bozza') returning id").split('\n')[0];
      const a = await apriSito(browser, url); sessioni.push(a);
      const cdp = await a.page.target().createCDPSession();
      await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD });
      await login(a, com);
      await apriPreventivo(a, scelto.id);
      const pv = await a.page.evaluate(() => (document.getElementById('pvd-schede-content') || {}).innerText || '');
      const attesiPv = ['Funzionamento', 'Automatica', 'Dispositivo di sgancio (elettromagnete)', 'Collegato all\'impianto di rilevazione incendi', 'Materiale del supporto', 'Capriata'];
      const mancaPv = attesiPv.filter(x => !pv.includes(x));
      if (mancaPv.length) KO('4: preventivo senza ' + mancaPv.join(', '));
      else righe.push('4. Acquisti, preventivo n. ' + scelto.numero + ': porta REI con Funzionamento Automatica, sgancio e rilevazione Sì; vernice con Materiale del supporto e Capriata');
      const btn = await a.page.$('#pvd-pdf-schede-btn');
      if (!btn) KO('4: niente bottone del PDF delle schede');
      else {
        fs.readdirSync(DOWNLOAD).filter(f => f.endsWith('.pdf')).forEach(f => fs.unlinkSync(path.join(DOWNLOAD, f)));
        const prima = fs.readdirSync(DOWNLOAD);
        await btn.click();
        const nome = await attendiDownload(DOWNLOAD, prima, 20000);
        const testo = fs.readFileSync(path.join(DOWNLOAD, nome)).toString('latin1').replace(/\\/g, '');
        const attesiPdf = ['Dispositivo di sgancio (elettromagnete)', 'Sì', 'Collegato all', 'impianto di rilevazione incendi', 'Funzionamento', 'Automatica',
          'Materiale del supporto', 'Legno', 'Capriata', 'Numero elementi', 'Legno grezzo'];
        const mancaPdf = attesiPdf.filter(x => !testo.includes(x));
        if (mancaPdf.length) { KO('4: PDF ' + nome + ' senza ' + mancaPdf.join(' | ')); fs.writeFileSync(path.join(CARTELLA_OUT, 'pdf.txt'), testo, 'latin1'); }
        else righe.push('4. PDF delle schede ' + nome + ': ' + attesiPdf.join(', '));
      }
      // copia di Acquisti
      await a.page.evaluate(async (p, id) => { await apriModificaSchedaCommerciale(p, 'porte_rei', id); }, progetto, portaId);
      await attendiQuiete(a.stato, 900);
      const copia = await a.page.evaluate(() => (document.getElementById('m-rilievo-tecnico') || {}).innerText || '');
      const mancaCopia = ['Funzionamento', 'Dispositivo di sgancio (elettromagnete)', 'Collegato all\'impianto di rilevazione incendi'].filter(x => !copia.includes(x));
      if (mancaCopia.length) KO('4: copia di Acquisti senza ' + mancaCopia.join(', '));
      else righe.push('4. copia di Acquisti: Funzionamento, Dispositivo di sgancio (elettromagnete), Collegato all\'impianto di rilevazione incendi');
      await a.page.screenshot({ path: path.join(CARTELLA_OUT, '4-acquisti-copia.png') });
    }

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(r => !/sconto_rappresentante_attivo/.test(r.dove) && (r.status >= 500 || /does not exist|Could not find/i.test(r.msg)));
      if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    try {
      psql("delete from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progetto) + " and creato_il >= " + q(inizio));
      psql("update public.progetti_tecnici set stato = " + q(scelto.stato) + " where id = " + q(progetto));
    } catch (e) { console.error('pulizia: ' + e.message); }
    try {
      regolePrima.split(',').filter(Boolean).forEach(x => { const [id, a] = x.split(':'); psql('update public.regole_smistamento set attiva = ' + (a === 't' ? 'true' : 'false') + ' where id = ' + Number(id) + ' and attiva is distinct from ' + (a === 't')); });
    } catch (e) { console.error('pulizia regole: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Download e schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
