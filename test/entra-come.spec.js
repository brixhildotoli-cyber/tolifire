#!/usr/bin/env node
// F14.17 - "Entra come" (parte 1: interfaccia), Chrome headless, puppeteer-core.
// F14.18 - parte 2: le richieste "come" portano x-agito-come (id della
// persona, mai nel login diretto); con sql/71 nel database locale il banner
// dice "il database applica i limiti del ruolo" e le pagine devono essere
// UGUALI a quelle della persona (SMOKE_DIFFERENZE_OK=1 per solo segnalarle).
//
// Per ogni ruolo (predefinito: commerciale; SMOKE_SOLO_RUOLI=a,b per altri):
//  1. login DIRETTO come l'utente di prova del ruolo: menu, pagine permesse
//     e testo di ogni pagina del menu;
//  2. login come titolare, Impostazioni > "👁️ Entra come", scelta del ruolo
//     (proposto l'utente di prova): dopo il riavvio banner "Stai lavorando
//     come", ME/ROLE = la persona, ME_REALE/ROLE_REALE = titolare, stesso
//     menu e stesse pagine; testo delle pagine confrontato con il punto 1
//     (le differenze dovute alle sole regole del database sono di F14.18 e
//     si scrivono come "DIFFERENZA (database)");
//  3. "↩️ Esci" nel banner: di nuovo titolare, niente banner;
//  4. ricaricando mentre si è "come" si resta "come".
//
// SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh).
// Uso: cd test && node entra-come.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-entra-come');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F14.17';
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
// Menu, pagine permesse e testo delle pagine del menu (date e ore tolte).
async function leggiVista(s) {
  const base = await s.page.evaluate(() => ({
    me: ME && ME.id, role: ROLE, meReale: typeof ME_REALE !== 'undefined' && ME_REALE ? ME_REALE.id : null,
    roleReale: typeof ROLE_REALE !== 'undefined' ? ROLE_REALE : null,
    banner: (document.getElementById('entra-come-banner') && getComputedStyle(document.getElementById('entra-come-banner')).display !== 'none') ? document.getElementById('entra-come-banner').innerText.replace(/\s+/g, ' ').trim() : '',
    menu: [...document.querySelectorAll('#ntabs .nb')].map(b => b.innerText.replace(/\s+/g, ' ').trim()),
    pagine: (PAGINE_RUOLO[ROLE] || []).filter(p => canAccessPage(p)),
    voci: (NAV[ROLE] || NAV.tecnico).map(t => t.id)
  }));
  base.testi = {};
  for (const p of base.voci) {
    await s.page.evaluate(p => gotoPage(p), p);
    await attendiQuiete(s.stato, 900, 20000);
    base.testi[p] = await s.page.evaluate(() => {
      const on = document.querySelector('.page.on');
      return on ? on.innerText.replace(/\d{1,2}[:.]\d{2}(:\d{2})?/g, 'HH:MM').replace(/[ \t]+/g, ' ').trim() : '';
    });
  }
  return base;
}
function confronta(a, b, KO, righe) {
  if (JSON.stringify(a.menu) !== JSON.stringify(b.menu)) KO('menu diverso: diretto [' + a.menu.join(' | ') + '] / entra come [' + b.menu.join(' | ') + ']');
  if (JSON.stringify(a.pagine) !== JSON.stringify(b.pagine)) KO('pagine permesse diverse: ' + a.pagine.join(',') + ' / ' + b.pagine.join(','));
  for (const p of a.voci) {
    const ta = (a.testi[p] || '').split('\n').map(x => x.trim()).filter(Boolean);
    const tb = (b.testi[p] || '').split('\n').map(x => x.trim()).filter(Boolean);
    if (JSON.stringify(ta) === JSON.stringify(tb)) { righe.push('pagina ' + p + ': uguale (' + ta.length + ' righe)'); continue; }
    const solo1 = ta.filter(x => !tb.includes(x)), solo2 = tb.filter(x => !ta.includes(x));
    righe.push('DIFFERENZA pagina ' + p + ' (' + ta.length + ' / ' + tb.length + ' righe): solo diretto [' + solo1.slice(0, 6).join(' | ').slice(0, 400) + '] solo entra come [' + solo2.slice(0, 6).join(' | ').slice(0, 400) + ']');
  }
}

async function provaRuolo(browser, url, ruolo, persona, titolare) {
  const esito = { ruolo, fallimenti: [], righe: [] };
  const KO = m => esito.fallimenti.push(m);
  let a, b;
  try {
    // 1. Login diretto della persona
    a = await apriSito(browser, url);
    await login(a, persona);
    const diretto = await leggiVista(a);
    a.stato.erroriJs.forEach(e => KO('diretto: errore JavaScript: ' + e));
    // 2. Titolare → Impostazioni → Entra come (scelta per ruolo)
    b = await apriSito(browser, url);
    await login(b, titolare);
    await b.page.evaluate(() => gotoPage('impostazioni'));
    await attendiQuiete(b.stato, 900);
    await b.page.waitForFunction(() => { const c = document.getElementById('si-entra-come-card'); return c && c.style.display !== 'none' && document.getElementById('ec-ruolo').options.length > 1; }, { timeout: 15000 });
    await b.page.select('#ec-ruolo', ruolo);
    const proposto = await b.page.evaluate(() => document.getElementById('ec-utente').value);
    if (proposto !== persona.id) KO('scelto il ruolo, la persona proposta non è l\'utente di prova (' + proposto + ')');
    await b.page.select('#ec-utente', persona.id);
    await Promise.all([
      b.page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
      b.page.evaluate(() => entraComeScelto())
    ]);
    await b.page.waitForFunction(() => typeof ROLE !== 'undefined' && ROLE && ME && document.querySelector('.page.on'), { timeout: 25000 });
    await attendiQuiete(b.stato, 1200);
    const come = await leggiVista(b);
    if (come.me !== persona.id || come.role !== diretto.role) KO('dopo Entra come ME/ROLE non sono la persona (' + come.me + ', ' + come.role + ')');
    if (come.meReale !== titolare.id || come.roleReale !== 'titolare') KO('ME_REALE/ROLE_REALE non sono il titolare');
    if (!/Stai lavorando come/.test(come.banner)) KO('banner "Stai lavorando come" assente');
    else esito.righe.push('banner: ' + come.banner);
    // F14.18: richieste con x-agito-come = id della persona (mai nel login diretto)
    if (a.stato.agitoCome) KO('login diretto: ' + a.stato.agitoCome + ' richieste con x-agito-come');
    if (!b.stato.agitoCome) KO('entra come: nessuna richiesta con x-agito-come');
    else if ([...b.stato.agitoComeValori].some(x => x !== persona.id)) KO('x-agito-come diverso dall\'id della persona: ' + [...b.stato.agitoComeValori].join(', '));
    else esito.righe.push('x-agito-come = id della persona su ' + b.stato.agitoCome + ' richieste');
    const dbAttivo = /il database applica i limiti del ruolo/.test(come.banner);
    esito.righe.push('database: ' + (dbAttivo ? 'applica "Entra come" (sql/71)' : 'sql/71 non eseguito, risponde al titolare'));
    const righePrima = esito.righe.length;
    confronta(diretto, come, KO, esito.righe);
    // Con sql/71 il database risponde come la persona: le pagine sono uguali
    if (dbAttivo && process.env.SMOKE_DIFFERENZE_OK !== '1') esito.righe.slice(righePrima).filter(r => /^DIFFERENZA/.test(r)).forEach(r => KO('con sql/71 ' + r));
    // 4. Ricaricando si resta "come"
    await b.page.reload({ waitUntil: 'load' });
    await b.page.waitForFunction(() => typeof ROLE !== 'undefined' && ROLE && ME && document.querySelector('.page.on'), { timeout: 25000 });
    await attendiQuiete(b.stato, 800);
    const dopoRic = await b.page.evaluate(() => ({ me: ME.id, banner: !!document.getElementById('entra-come-banner') && getComputedStyle(document.getElementById('entra-come-banner')).display !== 'none' }));
    if (dopoRic.me !== persona.id || !dopoRic.banner) KO('ricaricando non si resta "come"');
    // Schermata a 390 px con il banner
    await b.page.setViewport({ width: 390, height: 844 });
    await b.page.screenshot({ path: path.join(CARTELLA_OUT, 'entra-come-' + ruolo + '-390.png') });
    await b.page.setViewport({ width: LARGHEZZA, height: 900 });
    // 3. Esci dal banner
    await Promise.all([
      b.page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }),
      b.page.click('#entra-come-banner button')
    ]);
    await b.page.waitForFunction(() => typeof ROLE !== 'undefined' && ROLE && ME && document.querySelector('.page.on'), { timeout: 25000 });
    await attendiQuiete(b.stato, 800);
    const fuori = await b.page.evaluate(() => ({ me: ME.id, role: ROLE, banner: !!document.getElementById('entra-come-banner') && getComputedStyle(document.getElementById('entra-come-banner')).display !== 'none', chiave: sessionStorage.getItem('toli_entra_come') }));
    if (fuori.me !== titolare.id || fuori.role !== 'titolare' || fuori.banner || fuori.chiave) KO('dopo "Esci" non si è tornati titolare: ' + JSON.stringify(fuori));
    else esito.righe.push('Esci: di nuovo titolare, niente banner');
    b.stato.erroriJs.forEach(e => KO('entra come: errore JavaScript: ' + e));
    [a, b].forEach(s => s.stato.rete.filter(e => e.status >= 500 || /does not exist|could not find/i.test(e.msg)).forEach(e => KO('database: ' + e.metodo + ' ' + e.dove.split('?')[0] + ' → ' + e.status + ' ' + e.msg)));
  } catch (e) {
    KO('errore dello script: ' + e.message.split('\n')[0]);
    try { if (b) await b.page.screenshot({ path: path.join(CARTELLA_OUT, 'errore-' + ruolo + '.png') }); } catch (e2) { /* niente */ }
  } finally {
    if (a) await a.contesto.close();
    if (b) await b.contesto.close();
  }
  return esito;
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const titolare = utenti.find(u => u.ruolo === 'titolare');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const esiti = [];
  for (const ruolo of SOLO) {
    const del = utenti.filter(u => u.ruolo === ruolo).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)));
    const u = del[0];
    if (!u) { esiti.push({ ruolo, fallimenti: ['nessun utente'], righe: [] }); continue; }
    const e = await provaRuolo(browser, url, ruolo, u, titolare);
    esiti.push(e);
    console.log('\n' + (e.fallimenti.length ? '✗ ' : '✓ ') + ruolo + ' (' + u.nome + ' ' + u.cognome + ')');
    e.righe.forEach(r => console.log('    ' + r));
    e.fallimenti.forEach(f => console.log('    FALLITO  ' + f));
  }
  await browser.close(); srv.close();
  const ko = esiti.filter(e => e.fallimenti.length);
  console.log('\n' + (ko.length ? 'FALLITO: ' + ko.map(e => e.ruolo).join(', ') : 'TUTTO OK'));
  process.exit(ko.length ? 1 : 0);
})().catch(e => { console.error('TEST INTERROTTO: ' + e.stack); process.exit(2); });
