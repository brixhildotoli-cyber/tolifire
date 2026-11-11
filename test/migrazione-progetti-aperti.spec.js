#!/usr/bin/env node
// F15.14 - Migrazione dei progetti e preventivi aperti (sql/84, solo dati:
// stato_smistamento delle schede dei progetti già in lavorazione).
// Chrome headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh con sql/77-83; sql/84 NON eseguito: lo
// esegue la prova e alla fine esegue il suo ROLLBACK).
// Il "fatto quando" della task, lato sito:
//  1. senza sql/84 il sito funziona come prima: "Da preventivare" di Acquisti
//     e del titolare, conteggio di "Cosa tocca a me", nessun errore;
//  2. dopo sql/84 "Da preventivare" mostra GLI STESSI progetti nello STESSO
//     ordine (Acquisti e titolare) e lo stesso conteggio; stati e conteggi per
//     stato dei progetti invariati;
//  3. il titolare apre un progetto in verifica tecnica migrato: riquadro
//     "🚦 Smistamento" con 🟡 all'ingegnere e il motivo "Inviato prima dello
//     smistamento automatico";
//  4. console: Acquisti, ingegnere e titolare che cambiano lo stato dello
//     smistamento di una scheda migrata sono rifiutati dal database;
//  5. ROLLBACK di sql/84: schede di nuovo non smistate, elenco uguale.
// Uso: cd test && node migrazione-progetti-aperti.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-migrazione-progetti-aperti');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.14';
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

const MARCA = 'Inviato prima dello smistamento automatico';
const SQL84 = path.join(REPO, 'sql', '84-migrazione-progetti-preventivi-aperti.sql');
const SQL84_ROLLBACK = path.join(REPO, 'sql', '84-migrazione-progetti-preventivi-aperti-ROLLBACK.sql');
function psqlFile(file) {
  const env = Object.assign({}, process.env, { PATH: process.env.PATH + ':' + path.join(os.homedir(), '.docker/bin') });
  const dest = '/tmp/' + path.basename(file);
  let r = spawnSync(process.env.DOCKER || 'docker', ['cp', file, CONTAINER + ':' + dest], { encoding: 'utf8', env });
  if (r.status !== 0) throw new Error('docker cp: ' + (r.stderr || r.stdout).trim());
  r = spawnSync(process.env.DOCKER || 'docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', dest], { encoding: 'utf8', env });
  if (r.status !== 0) throw new Error(path.basename(file) + ': ' + (r.stderr || r.stdout).trim().slice(0, 400));
  return (r.stderr || '').split('\n').filter(x => /NOTICE/.test(x)).map(x => x.replace(/^.*NOTICE:\s*/, '')).join(' ');
}

// "Da preventivare" come lo vede l'utente: titoli delle carte in ordine + conteggio di "Cosa tocca a me"
async function elencoDaPreventivare(browser, url, utente, nome) {
  const s = await apriSito(browser, url);
  try {
    await login(s, utente);
    await s.page.evaluate(() => gotoPage('progetti-da-preventivare'));
    await attendiQuiete(s.stato, 1500);
    await s.page.waitForFunction(() => { const b = document.getElementById('progetti-da-preventivare-lista'); return b && !b.querySelector('.load'); }, { timeout: 20000 });
    const out = await s.page.evaluate(async () => {
      const carte = [...document.querySelectorAll('#progetti-da-preventivare-lista > .card')].map(c => {
        const t = c.querySelector('div[style*="font-size:15px"]');
        return (t ? t.textContent : c.textContent).trim().replace(/\s+/g, ' ');
      });
      const fonte = (typeof FONTI_TOCCA_A_ME !== 'undefined' ? FONTI_TOCCA_A_ME : []).find(f => f.id === 'progetti-da-preventivare');
      const conta = fonte && fonte.ruoli.includes(ROLE) ? await fonte.conta() : null;
      return { carte, conta };
    });
    await s.page.screenshot({ path: path.join(CARTELLA_OUT, nome + '.png'), fullPage: true });
    out.erroriJs = s.stato.erroriJs.slice();
    out.rete = s.stato.rete.filter(x => x.status >= 500 || /does not exist|Could not find/i.test(x.msg));
    return out;
  } finally { await chiudi(s); }
}

(async () => {
  const righe = [];
  const fallimenti = [];
  const KO = m => fallimenti.push(m);
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  if (psql("select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'progetti_tecnici_schede' and column_name = 'stato_smistamento'") !== '1') fermati('serve sql/83 sul database locale');
  if (psql("select count(*) from public.progetti_tecnici_schede where smistamento_motivo like " + q(MARCA + '%')) !== '0') fermati('sql/84 è già eseguito sul database locale: prima il suo ROLLBACK');
  if (psql('select count(*) from public.regole_smistamento where attiva') === '0') fermati('servono regole di smistamento attive (come in produzione)');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const com = utenti.find(u => u.ruolo === 'commerciale' && diProva(u)) || utenti.find(u => u.ruolo === 'commerciale');
  const tit = utenti.find(u => u.ruolo === 'titolare');
  const ing = utenti.find(u => u.ruolo === 'ingegnere');
  if (!com || !tit || !ing) fermati('servono commerciale, titolare e ingegnere attivi');
  const conteggi = () => psql("select string_agg(stato || ' ' || n, ', ' order by stato) from (select stato, count(*) n from public.progetti_tecnici group by stato) c");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  let eseguito = false;
  try {
    // 1. Senza sql/84 ------------------------------------------------------
    const conteggiPrima = conteggi();
    const comPrima = await elencoDaPreventivare(browser, url, com, '1-acquisti-senza-sql84');
    const titPrima = await elencoDaPreventivare(browser, url, tit, '1-titolare-senza-sql84');
    [comPrima, titPrima].forEach((x, i) => {
      if (x.erroriJs.length || x.rete.length) KO('1: errori senza sql/84 (' + (i ? 'titolare' : 'Acquisti') + '): ' + x.erroriJs.concat(x.rete.map(r => r.dove + ' ' + r.status + ' ' + r.msg)).join(' | '));
    });
    if (!comPrima.carte.length) KO('1: "Da preventivare" di Acquisti vuoto: il database locale non ha progetti da preventivare');
    righe.push('1. senza sql/84: "Da preventivare" Acquisti ' + comPrima.carte.length + ' progetti, titolare ' + titPrima.carte.length + ', "Cosa tocca a me" Acquisti ' + comPrima.conta + '; nessun errore');

    // 2. sql/84 --------------------------------------------------------------
    const avviso = psqlFile(SQL84);
    eseguito = true;
    righe.push('2. sql/84 eseguito: ' + avviso);
    const migrate = psql("select count(*) from public.progetti_tecnici_schede where smistamento_motivo like " + q(MARCA + '%'));
    if (migrate === '0') KO('2: nessuna scheda migrata (il database locale non ha progetti aperti con schede?)');
    if (conteggi() !== conteggiPrima) KO('2: conteggi per stato cambiati: ' + conteggiPrima + ' → ' + conteggi());
    else righe.push('   conteggi per stato invariati: ' + conteggiPrima);
    const comDopo = await elencoDaPreventivare(browser, url, com, '2-acquisti-dopo-sql84');
    const titDopo = await elencoDaPreventivare(browser, url, tit, '2-titolare-dopo-sql84');
    if (JSON.stringify(comDopo.carte) !== JSON.stringify(comPrima.carte)) KO('2: "Da preventivare" di Acquisti diverso:\n  prima ' + comPrima.carte.join(' | ') + '\n  dopo  ' + comDopo.carte.join(' | '));
    else righe.push('   "Da preventivare" di Acquisti: stessi ' + comDopo.carte.length + ' progetti nello stesso ordine');
    if (JSON.stringify(titDopo.carte) !== JSON.stringify(titPrima.carte)) KO('2: "Da preventivare" del titolare diverso');
    else righe.push('   "Da preventivare" del titolare: stessi ' + titDopo.carte.length + ' progetti nello stesso ordine');
    if (comDopo.conta !== comPrima.conta) KO('2: "Cosa tocca a me" di Acquisti ' + comPrima.conta + ' → ' + comDopo.conta);
    else righe.push('   "Cosa tocca a me" di Acquisti: ' + comDopo.conta + ' come prima');
    [comDopo, titDopo].forEach(x => { if (x.erroriJs.length || x.rete.length) KO('2: errori: ' + x.erroriJs.concat(x.rete.map(r => r.dove + ' ' + r.status + ' ' + r.msg)).join(' | ')); });

    // 3. Il titolare apre un progetto in verifica migrato --------------------
    const gialla = psql("select s.id || '|' || s.progetto_tecnico_id from public.progetti_tecnici_schede s join public.progetti_tecnici p on p.id = s.progetto_tecnico_id " +
      "where p.stato = 'in_verifica_tecnica' and s.stato_smistamento = 'ingegnere' and s.smistamento_motivo like " + q(MARCA + '%') + ' order by s.id limit 1');
    const verde = psql("select s.id from public.progetti_tecnici_schede s join public.progetti_tecnici p on p.id = s.progetto_tecnico_id " +
      "where p.stato in ('inviato_a_commerciale', 'in_preventivazione') and s.stato_smistamento in ('acquisti', 'verificata') and s.smistamento_motivo like " + q(MARCA + '%') + ' order by s.id limit 1');
    if (!gialla) KO('3: nessun progetto in verifica tecnica migrato nel database locale');
    else {
      const [schedaGialla, progettoGiallo] = gialla.split('|');
      const t = await apriSito(browser, url);
      try {
        await login(t, tit);
        await t.page.evaluate(async id => { await openProgettoDetail(id); }, progettoGiallo);
        await attendiQuiete(t.stato, 1200);
        await t.page.evaluate(() => { const x = [...document.querySelectorAll('#pg-progetto-detail .tab')].find(e => /Rilievi tecnici/.test(e.textContent)); if (x) x.click(); });
        await attendiQuiete(t.stato, 1500);
        const riq = await t.page.evaluate(() => { const r = document.querySelector('#pg-progetto-detail .smistamento-riquadro'); return r ? r.innerText : ''; });
        if (!/all’ingegnere/.test(riq) || !riq.includes(MARCA)) KO('3: riquadro dello smistamento del titolare: ' + riq.replace(/\s+/g, ' ').slice(0, 300));
        else righe.push('3. titolare, progetto in verifica migrato: ' + riq.replace(/\s+/g, ' ').slice(0, 200));
        await t.page.screenshot({ path: path.join(CARTELLA_OUT, '3-titolare-progetto-migrato.png'), fullPage: true });
        // 4. console del titolare
        const consTit = await t.page.evaluate(async id => {
          const x = await db.from('progetti_tecnici_schede').update({ stato_smistamento: 'acquisti' }).eq('id', id).select('id');
          return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO ' + JSON.stringify(x.data);
        }, schedaGialla);
        if (!/^rifiutato: Lo smistamento della scheda lo decide il gestionale/.test(consTit)) KO('4: console del titolare: ' + consTit);
        else righe.push('4. console del titolare (scheda gialla → verde): ' + consTit);
        if (t.stato.erroriJs.length) KO('3: errori JavaScript: ' + t.stato.erroriJs.join(' | '));
      } finally { await chiudi(t); }
      for (const [u, nome, id, valore] of [[com, 'Acquisti', schedaGialla, 'acquisti'], [com, 'Acquisti', verde, 'ingegnere'], [ing, 'ingegnere', schedaGialla, 'verificata']]) {
        if (!id) continue;
        const s = await apriSito(browser, url);
        try {
          await login(s, u);
          const c = await s.page.evaluate(async (id, valore) => {
            const x = await db.from('progetti_tecnici_schede').update({ stato_smistamento: valore }).eq('id', id).select('id');
            return x.error ? 'rifiutato: ' + x.error.message : (x.data && x.data.length ? 'RIUSCITO' : 'nessuna riga (non la legge)');
          }, id, valore);
          const ora = psql('select stato_smistamento from public.progetti_tecnici_schede where id = ' + q(id));
          if (/RIUSCITO/.test(c) || ora === valore) KO('4: console di ' + nome + ': ' + c + ' (ora ' + ora + ')');
          else righe.push('   console di ' + nome + ' (→ ' + valore + '): ' + c);
        } finally { await chiudi(s); }
      }
    }

    // 5. ROLLBACK ---------------------------------------------------------
    righe.push('5. ' + psqlFile(SQL84_ROLLBACK));
    eseguito = false;
    if (psql("select count(*) from public.progetti_tecnici_schede where smistamento_motivo like " + q(MARCA + '%')) !== '0') KO('5: dopo il ROLLBACK restano schede migrate');
    const comRb = await elencoDaPreventivare(browser, url, com, '5-acquisti-dopo-rollback');
    if (JSON.stringify(comRb.carte) !== JSON.stringify(comPrima.carte) || comRb.conta !== comPrima.conta) KO('5: "Da preventivare" dopo il ROLLBACK diverso');
    else righe.push('   dopo il ROLLBACK "Da preventivare" di Acquisti uguale a prima, nessun errore');
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    await browser.close();
    srv.close();
    if (eseguito) { try { psqlFile(SQL84_ROLLBACK); } catch (e) { console.error('pulizia: ' + e.message); } }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
