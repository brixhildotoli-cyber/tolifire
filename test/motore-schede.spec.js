#!/usr/bin/env node
// F15.3 - Motore delle schede (js/56-motore-schede.js, sql/77), Chrome
// headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh, poi sql/77).
// Il "fatto quando" della task:
//  1. il rappresentante, a 390 px, sul suo progetto in bozza apre "📝 Compila
//     una scheda di rilievo" → Porte e portoni REI: menu chiusi (solo i valori
//     del catalogo), unità accanto ai numeri, "non noto" solo nella richiesta
//     indicativa, campo di livello ingegnere in sola lettura, indirizzo e
//     referente precompilati da sede e cliente; compila, crea la scheda 2 con
//     "+ Nuova scheda" passando da un tab all'altro, salva (tutte e due),
//     chiude, riapre: stessi dati;
//  2. la scheda progetto legge i dati (etichette e valori di js/18);
//  3. dalla console: il rappresentante su un progetto inviato all'ingegnere
//     e il tecnico (ruolo non ammesso) rifiutati dal database;
//  4. l'ingegnere apre la stessa scheda scritta a mano di js/18 (porte REI),
//     la vede compilata, salva: i dati del motore restano; nel motore il campo
//     di livello ingegnere per lui è modificabile.
// Nessun errore JavaScript né del database. Con MOTORE_SENZA_SQL=1 (dopo il
// ROLLBACK di sql/77): il rappresentante vede la scheda progetto come prima
// (nessun riquadro), l'ingegnere salva la scheda porte REI come prima.
// Alla fine (solo database locale) si tolgono le schede e la sede di prova e il
// progetto torna nel suo stato; il registro delle azioni resta (si contano
// solo le righe nuove).
// Uso: cd test && node motore-schede.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-motore-schede');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.3';
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

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const SENZA = CONF.MOTORE_SENZA_SQL === '1';
  const c77 = psql("select to_regprocedure('public.motore_schede_attivo()') is not null");
  if (!SENZA && c77 !== 't') fermati('sql/77 non eseguito nel database locale');
  if (SENZA && c77 === 't') fermati('MOTORE_SENZA_SQL=1 ma sql/77 c\'è: eseguire prima il ROLLBACK di sql/77');
  // Progetto in bozza di un rappresentante attivo, senza schede porte REI, con il referente del cliente
  const riga = psql("select p.id || '|' || p.stato || '|' || p.rappresentante_id || '|' || p.cliente_id || '|' || c.referente_nome from public.progetti_tecnici p join public.clienti c on c.id = p.cliente_id join public.utenti u on u.id = p.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where p.stato = 'bozza' and coalesce(c.referente_nome, '') <> '' and not exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = p.id and s.famiglia = 'porte_rei') order by p.creato_il limit 1");
  if (!riga) fermati('serve un progetto in bozza di un rappresentante, con il referente del cliente, senza scheda porte REI');
  const [progettoId, statoPartenza, rapId, clienteId, referente] = riga.split('|');
  const altro = psql("select p.id from public.progetti_tecnici p where p.rappresentante_id = " + q(rapId) + " and p.stato = 'in_verifica_tecnica' order by p.creato_il limit 1");
  const inizio = psql('select now()');
  // Sede principale di prova (solo locale, tolta alla fine)
  const sedeId = psql("insert into public.sedi_cliente (cliente_id, tipo, nome, via, civico, cap, citta, provincia, principale) values (" + q(clienteId) + ", 'operativa', 'Sede PROVA F15.3', 'Via Roma', '1', '56100', 'Pisa', 'PI', true) returning id").split('\n')[0];
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const ing = primo('ingegnere'), tec = primo('tecnico');
  const rap = utenti.find(u => u.id === rapId);
  if (!ing || !tec || !rap) fermati('servono ingegnere, tecnico e il rappresentante del progetto attivi');
  const regPrima = psql('select coalesce(max(id), 0) from public.registro_azioni');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    if (SENZA) {
      const r = await apriSito(browser, url); sessioni.push(r);
      await r.page.setViewport({ width: 390, height: 844 });
      await login(r, rap);
      await apriProgetto(r, progettoId);
      const card = await r.page.evaluate(() => !!document.getElementById('msm-apri'));
      const testo = await r.page.evaluate(() => (document.getElementById('pd-schede-content') || {}).innerText || '');
      if (card) KO('senza sql/77: il riquadro "Compila una scheda di rilievo" compare');
      else righe.push('senza sql/77: il rappresentante vede il tab Rilievi tecnici come prima (' + testo.trim().split('\n')[0].slice(0, 80) + '), nessun riquadro del motore');
      await chiudi(r);
      const g = await apriSito(browser, url); sessioni.push(g);
      await login(g, ing);
      await apriSchedaPorteMano(g, progettoId);
      await g.page.evaluate(() => { document.getElementById('pr-quantita').value = '3'; document.getElementById('pr-rei').value = 'rei_90'; });
      await g.page.evaluate(() => salvaSchedaPorteRei());
      await attendiQuiete(g.stato, 1200);
      const d = psql("select dati->>'quantita' || ',' || (dati->>'rei') from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' and numero = 1");
      if (d !== '3,rei_90') KO('senza sql/77: la scheda porte REI dell\'ingegnere non si salva come prima: ' + d);
      else righe.push('senza sql/77: l\'ingegnere salva la scheda porte REI scritta a mano come prima');
      await g.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });
    } else {
      // 1. rappresentante a 390 px ------------------------------------------------
      const r = await apriSito(browser, url); sessioni.push(r);
      await r.page.setViewport({ width: 390, height: 844 });
      await login(r, rap);
      await apriProgetto(r, progettoId);
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-rappresentante-rilievi-390.png') });
      await apriMotore(r);
      const pre = await valori(r, ['msm-tipo-richiesta', 'msm-sede', 'msm-indirizzo-lavori', 'msm-referente']);
      if (pre[0] !== 'definitiva' || pre[1] !== sedeId || !/Via Roma 1, 56100 Pisa \(PI\)/.test(pre[2]) || pre[3] !== referente) KO('1: precompilati: ' + JSON.stringify(pre));
      else righe.push('1. il rappresentante apre Porte e portoni REI dal tab Rilievi: definitiva, sede principale e indirizzo "' + pre[2] + '", referente "' + pre[3] + '" dal cliente');
      const menu = await r.page.evaluate(() => [...document.getElementById('msm-c-rei').options].map(o => o.value).join(','));
      if (menu !== ',rei_60,rei_90,rei_120,classe_superiore') KO('1: menu della resistenza al fuoco non chiuso sul catalogo: ' + menu);
      else righe.push('   menu chiusi: Resistenza al fuoco = solo i 4 valori del catalogo, niente "non noto" nella richiesta definitiva');
      const unita = await r.page.evaluate(() => ['larghezza', 'altezza', 'quantita', 'spessore_parete'].map(c => document.querySelector('[data-campo-motore="' + c + '"]').innerText.replace(/\s+/g, ' ').trim()).join(' | '));
      if (!/Larghezza \*.*cm/.test(unita) || !/Spessore parete.*mm/.test(unita) || !/Quantità \*.*pz/.test(unita)) KO('1: unità o obbligatori: ' + unita);
      else righe.push('   unità e obbligatori (D2): ' + unita);
      const ingRO = await r.page.evaluate(() => document.getElementById('msm-c-note_tecniche').disabled);
      if (!ingRO) KO('1: il campo di livello ingegnere non è in sola lettura per il rappresentante');
      else righe.push('   "Indicazioni per preventivo e posa" 🎓 in sola lettura per il rappresentante');
      await r.page.select('#msm-c-tipo_intervento', 'fornitura_e_posa');
      await r.page.select('#msm-c-rei', 'rei_60');
      await r.page.select('#msm-c-tipologia', 'battente_singolo');
      await scrivi(r, 'msm-c-quantita', '2');
      await scrivi(r, 'msm-c-larghezza', '92,5');
      await scrivi(r, 'msm-c-altezza', '210');
      await scrivi(r, 'rsm-nome', 'Piano terra');
      await r.page.select('#msm-tipo-richiesta', 'indicativa');
      await attendiQuiete(r.stato, 300);
      const nn = await r.page.evaluate(() => [...document.getElementById('msm-c-verso_apertura').options].some(o => o.value === 'non_noto') && !!document.getElementById('msm-nn-spessore_parete'));
      const tenuti = await valori(r, ['msm-c-larghezza', 'msm-c-rei']);
      if (!nn || tenuti[0] !== '92,5' || tenuti[1] !== 'rei_60') KO('1: richiesta indicativa: non noto ' + nn + ', dati tenuti ' + tenuti);
      else righe.push('   richiesta indicativa: compare "❓ Non noto" (menu e numeri), quello già scritto resta');
      await r.page.select('#msm-c-verso_apertura', 'non_noto');
      await r.page.click('#msm-nn-spessore_parete');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-rappresentante-scheda-390.png'), fullPage: true });
      // + Nuova scheda, poi torna alla 1 e di nuovo alla 2 (tab come Excel)
      await r.page.click('#rsm-tab-nuova');
      await r.page.waitForFunction(() => schedaRilievoAperta && schedaRilievoAperta.numero === 2 && document.getElementById('msm-motore'), { timeout: 8000 });
      await scrivi(r, 'msm-c-quantita', '1');
      await scrivi(r, 'rsm-nome', 'Piano primo');
      await r.page.click('#rsm-tab-1');
      await r.page.waitForFunction(() => schedaRilievoAperta && schedaRilievoAperta.numero === 1, { timeout: 8000 });
      const t1 = await valori(r, ['msm-c-larghezza', 'msm-c-verso_apertura', 'rsm-nome', 'msm-tipo-richiesta']);
      if (t1.join('|') !== '92,5|non_noto|Piano terra|indicativa') KO('1: tornando al tab 1: ' + t1);
      await r.page.click('#rsm-tab-2');
      await r.page.waitForFunction(() => schedaRilievoAperta && schedaRilievoAperta.numero === 2, { timeout: 8000 });
      const t2 = await valori(r, ['msm-c-quantita', 'rsm-nome']);
      if (t2.join('|') !== '1|Piano primo') KO('1: tornando al tab 2: ' + t2);
      else righe.push('   "+ Nuova scheda": scheda 2 (Piano primo); passando tra i tab quello che è scritto resta');
      await r.page.click('#msm-salva');
      await attendiQuiete(r.stato, 1500);
      const salvate = psql("select string_agg(numero || ':' || (dati->>'nome_scheda') || ':' || coalesce(dati->>'quantita', '') || ':' || coalesce(jsonb_typeof(dati->'larghezza'), '') || ':' || coalesce(dati->>'larghezza', '') || ':' || coalesce(dati->>'verso_apertura', '') || ':' || coalesce(dati->>'spessore_parete', '') || ':' || coalesce(dati->>'tipo_richiesta', '') || ':' || (compilato_da = " + q(rapId) + "), ' ; ' order by numero) from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei'");
      const attese = '1:Piano terra:2:number:92.5:non_noto:non_noto:indicativa:true ; 2:Piano primo:1:string::::definitiva:true';
      if (salvate !== attese) KO('1: salvate nel database: ' + salvate + ' (attese ' + attese + ')');
      else righe.push('   "💾 Salva scheda" salva le 2 schede: ' + salvate);
      // chiude e riapre
      await r.page.evaluate(() => chiudiSchedaMotore());
      await attendiQuiete(r.stato, 900);
      await apriMotore(r);
      const di = await valori(r, ['msm-tipo-richiesta', 'msm-c-tipo_intervento', 'msm-c-rei', 'msm-c-tipologia', 'msm-c-quantita', 'msm-c-larghezza', 'msm-c-altezza', 'msm-c-verso_apertura', 'rsm-nome', 'msm-indirizzo-lavori']);
      const nnSp = await r.page.evaluate(() => document.getElementById('msm-nn-spessore_parete').checked);
      if (di.slice(0, 9).join('|') !== 'indicativa|fornitura_e_posa|rei_60|battente_singolo|2|92,5|210|non_noto|Piano terra' || !nnSp) KO('1: riaperta: ' + di + ' non noto spessore ' + nnSp);
      else righe.push('   chiusa e riaperta: stessi dati (' + di.slice(1, 8).join(', ') + ', spessore "non noto", nome "Piano terra")');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-rappresentante-riaperta-390.png') });
      await r.page.evaluate(() => chiudiSchedaMotore());
      await attendiQuiete(r.stato, 900);
      // 2. lettura nella scheda progetto
      const vista = await r.page.evaluate(() => document.getElementById('pd-schede-content').innerText);
      const voci = ['Larghezza (cm)', '92,5', 'Non noto (da chiedere al cliente)', 'Indirizzo dei lavori', 'Referente sul posto', 'Tipo di richiesta', 'Porte e portoni REI – scheda 2 (Piano primo)'];
      const mancano = voci.filter(x => !vista.includes(x));
      if (mancano.length || /Sede Id/.test(vista)) KO('2: scheda progetto, mancano: ' + mancano.join(', ') + (/Sede Id/.test(vista) ? ' (e mostra Sede Id)' : ''));
      else righe.push('2. la scheda progetto legge i dati: ' + voci.join(' · '));
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '2-rappresentante-progetto-390.png') });
      // 3. console: progetto inviato all'ingegnere
      if (altro) {
        const cons = await r.page.evaluate(async prog => {
          const ins = await db.from('progetti_tecnici_schede').insert({ progetto_tecnico_id: prog, famiglia: 'porte_rei', numero: 98, dati: { quantita: 1 }, compilato_da: ME.id });
          return ins.error ? 'insert rifiutato: ' + ins.error.message : 'insert RIUSCITO';
        }, altro);
        if (!/insert rifiutato/.test(cons)) KO('3: console del rappresentante (progetto in verifica tecnica): ' + cons);
        else righe.push('3. console del rappresentante su un suo progetto in verifica tecnica: ' + cons);
        await apriProgetto(r, altro);
        if (await r.page.evaluate(() => !!document.getElementById('msm-apri'))) KO('3: il riquadro compare su un progetto in verifica tecnica');
        else righe.push('   sul progetto in verifica tecnica il riquadro "Compila una scheda di rilievo" non compare');
      }
      await chiudi(r);
      const t = await apriSito(browser, url); sessioni.push(t);
      await login(t, tec);
      const cons4 = await t.page.evaluate(async prog => {
        const ins = await db.from('progetti_tecnici_schede').insert({ progetto_tecnico_id: prog, famiglia: 'porte_rei', numero: 97, dati: {} });
        const att = await db.rpc('motore_schede_attivo');
        return (ins.error ? 'insert rifiutato: ' + ins.error.message : 'insert RIUSCITO') + ' | motore_schede_attivo ' + JSON.stringify(att.data);
      }, progettoId);
      if (!/insert rifiutato/.test(cons4)) KO('3: console del tecnico: ' + cons4);
      else righe.push('   console del tecnico (ruolo non ammesso): ' + cons4);
      await chiudi(t);

      // 4. ingegnere: scheda scritta a mano di js/18 e motore ----------------------
      const g = await apriSito(browser, url); sessioni.push(g);
      await login(g, ing);
      await apriSchedaPorteMano(g, progettoId);
      const mano = await valori(g, ['pr-quantita', 'pr-larghezza', 'pr-rei', 'pr-tipologia', 'rsm-nome']);
      if (mano.join('|') !== '2|92.5|rei_60|battente_singolo|Piano terra') KO('4: la scheda di js/18 non legge i dati del motore: ' + mano);
      else righe.push('4. l\'ingegnere apre la scheda Porte REI scritta a mano: ' + mano.join(', '));
      await scrivi(g, 'pr-note-tecniche', 'Controtelaio da verificare');
      await g.page.evaluate(() => salvaSchedaPorteRei());
      await attendiQuiete(g.stato, 1200);
      const dopo = psql("select (dati->>'note_tecniche') || '|' || (dati->>'indirizzo_lavori') || '|' || (dati->>'tipo_richiesta') || '|' || (dati->>'referente_lavori') || '|' || (dati ? 'sede_id') from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' and numero = 1");
      if (!/^Controtelaio da verificare\|Sede PROVA F15\.3 – Via Roma 1, 56100 Pisa \(PI\)\|indicativa\|.+\|true$/.test(dopo)) KO('4: dopo il salvataggio della scheda a mano: ' + dopo);
      else righe.push('   salva dalla scheda a mano: note salvate, i dati del motore restano (' + dopo + ')');
      await g.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });
      await apriProgetto(g, progettoId);
      await apriMotore(g);
      const ingW = await g.page.evaluate(() => [document.getElementById('msm-c-note_tecniche').disabled, document.getElementById('msm-c-note_tecniche').value]);
      if (ingW[0] || ingW[1] !== 'Controtelaio da verificare') KO('4: nel motore il campo dell\'ingegnere per lui: ' + ingW);
      else righe.push('   nel motore il campo 🎓 per l\'ingegnere è modificabile e mostra le sue note');
      await g.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });
      const reg = psql("select count(*) filter (where azione = 'inserimento') || ',' || count(*) filter (where azione = 'modifica') from public.registro_azioni where tabella = 'progetti_tecnici_schede' and id > " + regPrima);
      righe.push('   registro delle azioni (inserimenti, modifiche di campi): ' + reg);
    }

    for (const s of sessioni.filter(x => !x.chiuso)) await chiudi(s);
    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(r => r.status >= 500 || /does not exist|Could not find/i.test(r.msg) && !(SENZA && /motore_schede_attivo/.test(r.dove + r.msg)));
      if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    // Solo database locale: via schede e sede di prova, progetto nel suo stato
    try {
      psql('update public.progetti_tecnici set stato = ' + q(statoPartenza) + ' where id = ' + q(progettoId));
      psql("delete from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' and creato_il >= " + q(inizio));
      psql('delete from public.sedi_cliente where id = ' + q(sedeId));
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
