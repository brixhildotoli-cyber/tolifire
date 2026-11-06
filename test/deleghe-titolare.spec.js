#!/usr/bin/env node
// F14.20 - Deleghe del titolare (js/65, sql/73), Chrome headless con
// puppeteer-core, SOLO DATABASE LOCALE con sql/73 eseguito
// (test/locale/avvia-db-locale.sh, poi sql/73 e il -REGISTRO-CANCELLAZIONI).
// Il "fatto quando" della task:
//  1. il titolare, in Impostazioni > Deleghe, delega "Ratifica di una spesa"
//     fino a 150 € al commerciale (Acquisti); una decisione di prova da
//     120 € va al commerciale e NON al titolare; quella da 200 € al titolare;
//  2. il commerciale la trova nella campanella con "⚖️ Decidi" e la approva
//     con il motivo (registro: decisione_chiusa);
//  3. il titolare nomina il capo tecnico delegato generale fino a 5.000 €,
//     segna le ferie da oggi e crea uno sblocco del margine da 3.000 € fermo
//     da 1 giorno: passa al capo tecnico, che lo approva dalla campanella.
// Nessun errore JavaScript né del database. Schermate a 390 px nella
// cartella dei risultati ($TMPDIR/toli-deleghe).
// Uso: cd test && node deleghe-titolare.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-deleghe');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F14.20';
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


async function apriCampanella(s) {
  await s.page.evaluate(async () => { AVVISI.chiusi = false; await apriAvvisi(); });
  await attendiQuiete(s.stato, 800);
}
async function decidiDallaCampanella(s, id, motivo) {
  const ok = await s.page.evaluate(id => {
    const c = document.getElementById('avv-' + id);
    const b = c && [...c.querySelectorAll('button')].find(x => x.innerText.indexOf('⚖️ Decidi') >= 0);
    if (!b) return false;
    b.click(); return true;
  }, id);
  if (!ok) throw new Error('"⚖️ Decidi" non trovato sull\'avviso ' + id);
  await attendiQuiete(s.stato, 600);
  await s.page.type('#dec-m-motivo', motivo);
  await s.page.click('#dec-m-approva');
  await attendiQuiete(s.stato, 1000);
}
async function apriDeleghe(s) {
  await s.page.evaluate(() => gotoPage('impostazioni'));
  await attendiQuiete(s.stato, 1500);
  await s.page.waitForFunction(() => document.getElementById('si-deleghe-attivo') && document.getElementById('si-deleghe-attivo').style.display === 'block', { timeout: 15000 });
}
async function delega(s, tipo, chi, tetto) {
  await s.page.evaluate((tipo, chi, tetto) => {
    document.getElementById('dlg-chi-' + tipo).value = chi;
    const t = document.getElementById('dlg-tetto-' + tipo); if (t) t.value = tetto;
  }, tipo, chi, tetto);
  await s.page.evaluate(tipo => salvaDelegaTitolare(tipo), tipo);
  await attendiQuiete(s.stato, 1200);
}
async function provaDecisione(s, tipo, importo, vecchia) {
  await s.page.evaluate((tipo, importo, vecchia) => {
    document.getElementById('dlp-tipo').value = tipo;
    document.getElementById('dlp-importo').value = importo;
    document.getElementById('dlp-testo').value = 'prova F14.20 ' + importo;
    document.getElementById('dlp-vecchia').checked = !!vecchia;
  }, tipo, importo, vecchia);
  await s.page.click('#dlp-crea');
  await attendiQuiete(s.stato, 1200);
  return psql("select id || '|' || destinatario_ruolo || '|' || coalesce(destinatario_id::text, '') || '|' || urgente from public.avvisi where prova and testo like '%prova F14.20 " + importo + "%' order by id desc limit 1");
}
async function chiudi(s) { if (s.chiuso) return; s.chiuso = true; try { await s.contesto.close(); } catch (e) { /* già chiuso */ } }

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  if (psql("select to_regclass('public.deleghe_titolare') is not null") !== 't') fermati('sql/73 non eseguito nel database locale');
  if (psql("select count(*) from public.deleghe_titolare where revocata_il is null") !== '0' || psql("select count(*) from public.assenze_titolare where tolta_il is null") !== '0') fermati('ci sono già deleghe o assenze nel database locale: rifare il database');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const tit = primo('titolare'), com = primo('commerciale'), capo = primo('capo_tecnico');
  if (!tit || !com || !capo) fermati('servono titolare, commerciale e capo tecnico attivi');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    // 1. titolare: delega delle spese al commerciale
    const t = await apriSito(browser, url); sessioni.push(t);
    await login(t, tit);
    await apriDeleghe(t);
    await delega(t, 'ratifica_spesa', com.id, '150');
    const d1 = psql("select delegato_id || '|' || tetto_importo from public.deleghe_titolare where tipo = 'ratifica_spesa' and revocata_il is null");
    if (d1 !== com.id + '|150.00') KO('1: delega non salvata: ' + d1); else righe.push('1. delega spese fino a 150 € a ' + com.nome + ' ' + com.cognome);
    const p120 = (await provaDecisione(t, 'ratifica_spesa', '120', false)).split('|');
    if (p120[1] !== 'commerciale' || p120[2] !== com.id) KO('1: la spesa da 120 € non è andata al commerciale: ' + p120.join('|'));
    else righe.push('   spesa da 120 € → commerciale (non al titolare)');
    const p200 = (await provaDecisione(t, 'ratifica_spesa', '200', false)).split('|');
    if (p200[1] !== 'titolare') KO('1: la spesa da 200 € non è rimasta al titolare: ' + p200.join('|')); else righe.push('   spesa da 200 € → titolare');
    await t.page.setViewport({ width: 390, height: 844 });
    await t.page.evaluate(() => document.getElementById('si-deleghe-card').scrollIntoView());
    await t.page.screenshot({ path: path.join(CARTELLA_OUT, '1-titolare-deleghe-390.png') });
    await chiudi(t);

    // 2. commerciale: decide dalla campanella
    const c = await apriSito(browser, url); sessioni.push(c);
    await c.page.setViewport({ width: 390, height: 844 });
    await login(c, com);
    await apriCampanella(c);
    await c.page.screenshot({ path: path.join(CARTELLA_OUT, '2-commerciale-campanella-390.png') });
    await decidiDallaCampanella(c, p120[0], 'serviva per il cantiere');
    const e2 = psql("select stato || '|' || coalesce(esito, '') from public.avvisi where id = " + p120[0]);
    if (!/^fatto\|✅ Approvato: serviva/.test(e2)) KO('2: il commerciale non ha approvato: ' + e2); else righe.push('2. il commerciale approva da "⚖️ Decidi": ' + e2);
    if (psql("select count(*) from public.deleghe_registro where avviso_id = " + p120[0] + " and azione = 'decisione_chiusa'") !== '1') KO('2: registro decisione_chiusa mancante');
    await chiudi(c);

    // 3. delegato generale e ferie
    const t2 = await apriSito(browser, url); sessioni.push(t2);
    await login(t2, tit);
    await apriDeleghe(t2);
    await delega(t2, 'generale', capo.id, '5000');
    await t2.page.evaluate(() => { const o = dataLocaleISO(); const f = new Date(); f.setDate(f.getDate() + 7);
      document.getElementById('dla-dal').value = o; document.getElementById('dla-al').value = dataLocaleISO(f); document.getElementById('dla-nota').value = 'Ferie di prova'; });
    await t2.page.evaluate(() => segnaAssenzaTitolare());
    await attendiQuiete(t2.stato, 1200);
    if (psql("select count(*) from public.assenze_titolare where tolta_il is null") !== '1') KO('3: assenza non segnata');
    const p3000 = (await provaDecisione(t2, 'sblocco_margine', '3000', true)).split('|');
    if (p3000[1] !== 'capo_tecnico' || p3000[2] !== capo.id) KO('3: lo sblocco da 3.000 € non è passato al delegato generale: ' + p3000.join('|'));
    else righe.push('3. ferie + sblocco margine 3.000 € fermo da 1 giorno → ' + capo.nome + ' ' + capo.cognome);
    const p8000 = (await provaDecisione(t2, 'sblocco_margine', '8000', true)).split('|');
    if (p8000[1] !== 'titolare' || p8000[3] !== 'true') KO('3: lo sblocco da 8.000 € non è rimasto urgente al titolare: ' + p8000.join('|')); else righe.push('   sblocco 8.000 € (oltre il tetto) → titolare, urgente');
    await t2.page.evaluate(() => mostraDelegheImpostazioni());
    await attendiQuiete(t2.stato, 1000);
    const reg = await t2.page.evaluate(() => document.getElementById('si-deleghe-registro').innerText);
    if (!/Passata al delegato generale/.test(reg) || !/Oltre il tetto/.test(reg)) KO('3: il registro nella pagina non mostra passaggio e oltre tetto: ' + reg.slice(0, 200));
    await chiudi(t2);
    const k = await apriSito(browser, url); sessioni.push(k);
    await k.page.setViewport({ width: 390, height: 844 });
    await login(k, capo);
    await apriCampanella(k);
    await k.page.screenshot({ path: path.join(CARTELLA_OUT, '3-capo-tecnico-campanella-390.png') });
    await decidiDallaCampanella(k, p3000[0], 'cliente storico');
    const e3 = psql("select stato from public.avvisi where id = " + p3000[0]);
    if (e3 !== 'fatto') KO('3: il delegato generale non ha approvato: ' + e3); else righe.push('   il capo tecnico approva da "⚖️ Decidi"');
    const tamDel = await k.page.evaluate(() => (typeof DELEGHE !== 'undefined' ? DELEGHE.mie.map(d => d.tipo + '/' + d.modo).join(',') : ''));
    if (!/riporto_indietro_commessa\/assenza/.test(tamDel)) KO('3: il capo tecnico non ha in memoria le deleghe per assenza: ' + tamDel);

    for (const s of sessioni.filter(x => !x.chiuso)) await chiudi(s);
    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(r => r.status >= 500 || /does not exist|Could not find/i.test(r.msg));
      if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    // pulizia: deleghe revocate, assenze tolte, prove chiuse (nessuna cancellazione)
    try {
      psql("update public.deleghe_titolare set revocata_il = now(), motivo_revoca = 'fine " + ETICHETTA + "' where revocata_il is null; update public.assenze_titolare set tolta_il = now() where tolta_il is null; update public.avvisi set stato = 'annullato', esito = 'fine " + ETICHETTA + "', chiuso_il = now() where prova and stato = 'aperto' and testo like '%prova F14.20%'");
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
