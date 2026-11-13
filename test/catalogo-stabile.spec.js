#!/usr/bin/env node
// F16.2 - Import del catalogo prodotti SENZA cancellazione (js/14
// importaExcelCatalogo -> importaCatalogoSenzaCancellare), Chrome headless con
// puppeteer-core, SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh), con o
// senza sql/93 (CATALOGO_SENZA_SQL=1 = controlla che sql/93 NON ci sia).
// Il "fatto quando" della task:
//  1. il titolare importa dal bottone "📥 Importa listino" un Excel con tutto il
//     catalogo (oltre 1.300 righe, a blocchi di 50 nella fila di js/01) + un
//     prodotto con il prezzo nuovo, uno nuovo ripetuto due volte e una riga
//     senza codice: prima il report (confirm) dei codici ripetuti e vuoti;
//     stessi id per tutti, prezzo nuovo, prodotto nuovo una volta sola, il
//     prodotto tolto dal file resta con attivo = false (non cancellato), la
//     riga di DDT che punta al prodotto resta collegata;
//  2. secondo import dello stesso file: nessun id cambia;
//  3. "Annulla" sul report: il catalogo non cambia;
//  4. Acquisti (commerciale) dalla console: upsert rifiutato dal database,
//     update zero righe;
//  5. con sql/93: un prodotto usato in un DDT non si cancella nemmeno da
//     console del titolare.
// Alla fine il catalogo locale torna com'era (copia e ripristino con psql).
// Uso: cd test && node catalogo-stabile.spec.js  (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-catalogo-stabile');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F16.2';
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
    if (d.type() === 'confirm' && stato.rifiutaConfirm) return d.dismiss();
    return d.accept(d.type() === 'prompt' ? (d.defaultValue() || ETICHETTA) : undefined);
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
const SOLO = (CONF.SMOKE_SOLO_RUOLI || 'titolare').split(',').map(x => x.trim()).filter(Boolean);
const diProva = u => /(^|[^a-z])(prova|test|smoke)/i.test([u.nome, u.cognome, u.email].join(' '));

async function apriSito(browser, url) {
  const contesto = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const stato = { dialoghi: [], rifiutaConfirm: false, inCorso: 0, deviate: new Set(), ultima: 0, erroriJs: [], console: [], rete: [], bloccate: [], caricamenti: [], agitoCome: 0, agitoComeValori: new Set() };
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




// ── Prova F16.2 ────────────────────────────────────────────────────────
const SENZA_SQL = CONF.CATALOGO_SENZA_SQL === '1';
const COD_A = 'PROVA162-A', COD_B = 'PROVA162-B', COD_C = 'PROVA162-C', COD_D = 'PROVA162-D';
const idCatalogo = () => JSON.parse(psql("select coalesce(json_object_agg(codice, id), '{}') from public.prodotti_catalogo"));

// righe del foglio: un foglio per "foglio", prima i prodotti senza categoria,
// poi una riga di categoria e i suoi prodotti (formato letto da js/14)
function fogliDaProdotti(prodotti) {
  const perFoglio = {};
  prodotti.forEach(p => { const f = p.f || 'Catalogo'; (perFoglio[f] = perFoglio[f] || []).push(p); });
  const out = {};
  Object.keys(perFoglio).forEach(f => {
    const righe = [['CODICE', 'ARTICOLO', 'UM', 'PAG', 'LISTINO']];
    const lista = perFoglio[f].slice().sort((x, y) => (x.cat ? 1 : 0) - (y.cat ? 1 : 0) || String(x.cat || '').localeCompare(String(y.cat || '')));
    let cat = null;
    lista.forEach(p => {
      if (p.cat && p.cat !== cat) { righe.push([p.cat, null, null, null, null]); cat = p.cat; }
      righe.push([p.c, p.a, p.u, p.p, Number(p.l)]);
    });
    out[f] = righe;
  });
  return out;
}
async function fileExcel(s, nome, fogli) {
  const b64 = await s.page.evaluate(async fogli => {
    await caricaLibreriaExcel();
    const wb = XLSX.utils.book_new();
    Object.keys(fogli).forEach(f => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fogli[f]), f.slice(0, 31)));
    return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }, fogli);
  const p = path.join(CARTELLA_OUT, nome);
  fs.writeFileSync(p, Buffer.from(b64, 'base64'));
  return p;
}
async function importa(s, file) {
  await s.page.evaluate(() => { gotoPage('catalogo'); });
  await attendiQuiete(s.stato, 800);
  await s.page.click('#btn-import-excel');
  await s.page.waitForFunction(() => document.getElementById('m-import-catalogo').classList.contains('on'), { timeout: 8000 });
  await s.page.evaluate(() => { ge('import-sconto').value = '70'; aggiornaAnteprima(); });
  s.stato.dialoghi = [];
  // "Scegli file Excel →" apre la scelta del file: qui si dà il file all'input
  await s.page.evaluate(() => { ge('excel-file-input').click = function() {}; ge('catalogo-import-status').textContent = ''; ge('catalogo-import-bar').style.display = 'none'; });
  await s.page.click('#m-import-catalogo .btn.p');
  const t0 = Date.now();
  const inp = await s.page.$('#excel-file-input');
  await inp.uploadFile(file);
  await s.page.waitForFunction(() => /^(✅|⚠️|❌)/.test(ge('catalogo-import-status').textContent) ||
      (ge('catalogo-import-bar').style.display === 'none' && /^⏳/.test(ge('catalogo-import-status').textContent)),
    { timeout: 180000 });
  const testo = await s.page.evaluate(() => ge('catalogo-import-status').textContent);
  await attendiQuiete(s.stato, 800);
  return { testo, secondi: ((Date.now() - t0) / 1000).toFixed(1), dialoghi: s.stato.dialoghi.slice() };
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const con93 = psql("select count(*) from pg_indexes where indexname = 'prodotti_catalogo_codice_normalizzato_unico'") === '1';
  if (SENZA_SQL && con93) fermati('CATALOGO_SENZA_SQL=1 ma sql/93 è eseguito: prima il ROLLBACK');
  if (!SENZA_SQL && !con93) fermati('sql/93 non eseguito nel database locale (o CATALOGO_SENZA_SQL=1)');
  // copia del catalogo e della riga di DDT, ripristinate alla fine
  psql('drop table if exists public._prova_f162_catalogo; create table public._prova_f162_catalogo as select * from public.prodotti_catalogo');
  const rigaDdt = psql('select id || \'|\' || coalesce(prodotto_id::text, \'\') from public.ddt_righe order by id limit 1').split('|');
  if (!rigaDdt[0]) fermati('serve almeno una riga di ddt_righe');
  psql(`insert into public.prodotti_catalogo (codice, articolo, um, listino_base, prezzo_cliente, prezzo_non_cliente, prezzo_grandi_quantita, categoria, foglio)
        values ('${COD_A}', 'Estintore a polvere 6 kg 34A 233B C (prova F16.2)', 'NR', 100, 51, 55.5, 37.5, 'PROVA F16.2', 'Prova F16.2'),
               ('${COD_B}', 'Cartello segnaletico estintore (prova F16.2)', 'NR', 10, 5.1, 5.55, 3.75, 'PROVA F16.2', 'Prova F16.2'),
               ('${COD_C}', 'Prodotto tolto dal listino (prova F16.2)', 'NR', 20, 10.2, 11.1, 7.5, 'PROVA F16.2', 'Prova F16.2')`);
  const idA = psql(`select id from public.prodotti_catalogo where codice = '${COD_A}'`);
  psql(`update public.ddt_righe set prodotto_id = '${idA}' where id = '${rigaDdt[0]}'`);
  const prima = idCatalogo();
  const tutti = JSON.parse(psql("select json_agg(json_build_object('c', codice, 'a', articolo, 'u', um, 'p', pag_cat, 'l', listino_base, 'cat', categoria, 'f', foglio) order by codice) from public.prodotti_catalogo where attivo is not false"));
  const nelFile = tutti.filter(p => p.c !== COD_C).map(p => p.c === COD_A ? Object.assign({}, p, { l: 200 }) : p);
  nelFile.push({ c: COD_D, a: 'Manichetta UNI 45 20 m (prova F16.2)', u: 'NR', p: null, l: 50, cat: 'PROVA F16.2', f: 'Prova F16.2' });
  nelFile.push({ c: COD_D, a: 'Manichetta ripetuta (seconda riga, non si importa)', u: 'NR', p: null, l: 99, cat: 'PROVA F16.2', f: 'Prova F16.2' });
  const fogli = fogliDaProdotti(nelFile);
  fogli['Prova F16.2'].push([null, 'Riga con il prezzo ma senza codice', 'NR', null, 12]);

  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const tit = primo('titolare'), com = primo('commerciale');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    const t = await apriSito(browser, url); sessioni.push(t);
    await login(t, tit);
    const file = await fileExcel(t, 'listino-prova-f162.xlsx', fogli);
    // 1. primo import
    const i1 = await importa(t, file);
    const dopo1 = idCatalogo();
    const report = i1.dialoghi.join('\n');
    if (!/1 codici ripetuti/.test(report) || report.indexOf(COD_D + ' (2 righe)') < 0 || !/1 righe con il prezzo ma senza codice/.test(report)) KO('1: report dei codici ripetuti o vuoti mancante: ' + report.slice(0, 300));
    else righe.push('1. report prima dell\'import: "' + report.split('\n').filter(Boolean).slice(0, 4).join(' / ') + '"');
    if (!/^✅/.test(i1.testo)) KO('1: import non riuscito: ' + i1.testo);
    else righe.push('   import di ' + (nelFile.length - 1) + ' prodotti in ' + i1.secondi + ' s: ' + i1.testo);
    const cambiati = Object.keys(prima).filter(c => dopo1[c] !== prima[c]);
    if (cambiati.length) KO('1: id cambiati: ' + cambiati.slice(0, 5).join(', '));
    else righe.push('   ' + Object.keys(prima).length + ' prodotti di prima: tutti con lo stesso id');
    const statoA = psql(`select listino_base::numeric(10,2) || '|' || prezzo_cliente::numeric(10,2) || '|' || attivo from public.prodotti_catalogo where codice = '${COD_A}'`);
    if (statoA !== '200.00|102.00|true') KO('1: ' + COD_A + ' non aggiornato: ' + statoA); else righe.push('   ' + COD_A + ': listino 200, prezzo cliente 102,00 (stesso calcolo di prima)');
    const statoD = psql(`select count(*) || '|' || max(listino_base) || '|' || max(articolo) from public.prodotti_catalogo where upper(codice) = '${COD_D}'`);
    if (!/^1\|50\|Manichetta UNI 45/.test(statoD)) KO('1: ' + COD_D + ' inatteso: ' + statoD); else righe.push('   ' + COD_D + ' nuovo, una volta sola, dalla PRIMA riga del file');
    const statoC = psql(`select count(*) || '|' || bool_or(attivo) || '|' || max(id::text) from public.prodotti_catalogo where codice = '${COD_C}'`);
    if (statoC !== '1|false|' + prima[COD_C]) KO('1: ' + COD_C + ' (tolto dal file) inatteso: ' + statoC); else righe.push('   ' + COD_C + ' (non nel file): c\'è ancora, stesso id, attivo = false');
    const nonAttivi = psql('select count(*) from public.prodotti_catalogo where attivo is false');
    if (nonAttivi !== '1') KO('1: prodotti non attivi ' + nonAttivi + ' invece di 1');
    if (psql(`select prodotto_id from public.ddt_righe where id = '${rigaDdt[0]}'`) !== idA || !dopo1[COD_A]) KO('1: la riga del DDT non punta più al prodotto');
    else righe.push('   la riga di DDT punta ancora a ' + COD_A + ' (' + idA + ')');
    const vistoC = await t.page.evaluate(c => (ge('catalogo-content').innerText || '').indexOf(c) >= 0, COD_C);
    if (vistoC) KO('1: il prodotto non attivo compare ancora nella pagina Catalogo');
    await t.page.screenshot({ path: path.join(CARTELLA_OUT, '1-titolare-import.png') });
    // 2. secondo import dello stesso file
    const i2 = await importa(t, file);
    const dopo2 = idCatalogo();
    const diversi = Object.keys(dopo1).filter(c => dopo2[c] !== dopo1[c]).concat(Object.keys(dopo2).filter(c => !dopo1[c]));
    if (!/^✅/.test(i2.testo) || diversi.length) KO('2: secondo import: ' + i2.testo + ' / id diversi ' + diversi.slice(0, 5).join(', '));
    else righe.push('2. secondo import dello stesso file (' + i2.secondi + ' s): ' + Object.keys(dopo2).length + ' id identici; ' + i2.testo);
    // 3. Annulla sul report
    const aggA = psql(`select aggiornato_il from public.prodotti_catalogo where codice = '${COD_A}'`);
    t.stato.rifiutaConfirm = true;
    await importa(t, file).catch(() => null);
    await attendi(1500);
    t.stato.rifiutaConfirm = false;
    if (psql(`select aggiornato_il from public.prodotti_catalogo where codice = '${COD_A}'`) !== aggA) KO('3: con Annulla il catalogo è cambiato');
    else righe.push('3. "Annulla" sul report: nessun prodotto cambiato');
    // 5. cancellazione da console del titolare
    const canc = await t.page.evaluate(async id => { const r = await db.from('prodotti_catalogo').delete().eq('id', id).select('id'); return { err: r.error && (r.error.code + ' ' + r.error.message), n: (r.data || []).length }; }, idA);
    if (!SENZA_SQL) {
      if (!canc.err || !/23503/.test(canc.err)) KO('5: con sql/93 la cancellazione del prodotto usato nel DDT doveva essere rifiutata: ' + JSON.stringify(canc));
      else righe.push('5. console del titolare: cancellazione di ' + COD_A + ' (usato in un DDT) rifiutata: ' + canc.err);
    } else righe.push('5. senza sql/93 (come oggi in produzione) la console del titolare cancella ancora: ' + JSON.stringify(canc) + ' (il sito non cancella più)');
    if (t.stato.erroriJs.length) KO('errori JavaScript del titolare: ' + t.stato.erroriJs.join(' | '));
    const reteKo = t.stato.rete.filter(x => !/prodotti_catalogo/.test(x.dove) || x.metodo !== 'DELETE');
    if (reteKo.length) KO('richieste in errore del titolare: ' + JSON.stringify(reteKo.slice(0, 5)));
    await chiudi(t);
    // 4. Acquisti dalla console
    const c = await apriSito(browser, url); sessioni.push(c);
    await c.page.setViewport({ width: 390, height: 844 });
    await login(c, com);
    const r4 = await c.page.evaluate(async (cod, idA) => {
      const u = await db.from('prodotti_catalogo').upsert([{ codice: cod, articolo: 'Tentativo di Acquisti', listino_base: 1, prezzo_cliente: 3, prezzo_non_cliente: 3, prezzo_grandi_quantita: 3 }], { onConflict: 'codice' });
      const v = await db.from('prodotti_catalogo').update({ attivo: false }).eq('id', idA).select('id');
      return { upsert: u.error && (u.error.code + ' ' + u.error.message), update: (v.data || []).length, updErr: v.error && v.error.message };
    }, COD_B, idA);
    if (!r4.upsert || !/42501/.test(r4.upsert) || r4.update !== 0) KO('4: Acquisti non rifiutato: ' + JSON.stringify(r4));
    else righe.push('4. Acquisti (390 px) da console: upsert rifiutato (' + r4.upsert + '), messa non attivo 0 righe');
    if (psql(`select count(*) from public.prodotti_catalogo where codice in ('${COD_A}', '${COD_B}') and (attivo is false or articolo like 'Tentativo%')`) !== '0') KO('4: Acquisti ha cambiato il catalogo');
    if (c.stato.erroriJs.length) KO('errori JavaScript di Acquisti: ' + c.stato.erroriJs.join(' | '));
    await chiudi(c);
  } catch (e) {
    KO('eccezione: ' + (e.stack || e.message));
  } finally {
    for (const s of sessioni) await chiudi(s);
    await browser.close();
    srv.close();
    // ripristino del catalogo locale (editor: nessun limite)
    try {
      psql(`update public.ddt_righe set prodotto_id = ${rigaDdt[1] ? "'" + rigaDdt[1] + "'" : 'null'} where id = '${rigaDdt[0]}'`);
      psql("delete from public.prodotti_catalogo where categoria = 'PROVA F16.2' or upper(codice) like 'PROVA162-%'");
      psql(`update public.prodotti_catalogo p set articolo = c.articolo, um = c.um, pag_cat = c.pag_cat, listino_base = c.listino_base,
              prezzo_cliente = c.prezzo_cliente, prezzo_non_cliente = c.prezzo_non_cliente, prezzo_grandi_quantita = c.prezzo_grandi_quantita,
              categoria = c.categoria, foglio = c.foglio, attivo = c.attivo, aggiornato_il = c.aggiornato_il
            from public._prova_f162_catalogo c where c.id = p.id`);
      psql('drop table public._prova_f162_catalogo');
      righe.push('catalogo locale ripristinato (' + psql('select count(*) from public.prodotti_catalogo') + ' prodotti)');
    } catch (e) { KO('ripristino: ' + e.message); }
  }
  console.log(righe.join('\n'));
  if (fallimenti.length) { console.log('\nFALLITO:\n- ' + fallimenti.join('\n- ')); process.exit(1); }
  console.log('\nTUTTO OK' + (SENZA_SQL ? ' (senza sql/93)' : ' (con sql/93)'));
})();
