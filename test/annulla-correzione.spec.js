#!/usr/bin/env node
// F14.19 - "↩️ Annulla" e "✏️ Chiedi correzione" (js/64, sql/72), Chrome
// headless con puppeteer-core, SOLO DATABASE LOCALE con sql/72 eseguito
// (test/locale/avvia-db-locale.sh, poi sql/72 e il -REGISTRO-CANCELLAZIONI).
// Il "fatto quando" della task:
//  1. un tecnico di prova segna fatto un avviso e dalla campanella
//     ("Anche i chiusi") lo annulla da solo con "↩️ Annulla": l'avviso torna
//     aperto;
//  2. lo segna di nuovo fatto, il chiuso_il si porta indietro di 25 ore
//     (psql): il pulsante diventa "✏️ Chiedi correzione"; la richiesta con
//     il motivo arriva al capo tecnico come avviso con scadenza;
//  3. il capo tecnico apre l'avviso, "✏️ Gestisci la correzione",
//     "↩️ Annulla l'azione per lui": l'avviso torna aperto al tecnico, la
//     richiesta è "applicata", il tecnico riceve l'esito.
// Nessun errore JavaScript né del database. Schermate a 390 px nella
// cartella dei risultati ($TMPDIR/toli-annulla).
// Uso: cd test && node annulla-correzione.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-annulla');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F14.19';
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

async function apriAvvisiChiusi(s) {
  await s.page.evaluate(async () => { AVVISI.chiusi = true; await apriAvvisi(); });
  await attendiQuiete(s.stato, 800);
}
async function testoCard(s, id) {
  return s.page.evaluate(id => { const c = document.getElementById('avv-' + id); return c ? c.innerText.replace(/\s+/g, ' ').trim() : ''; }, id);
}
async function clicNellaCard(s, id, testo) {
  const ok = await s.page.evaluate((id, testo) => {
    const c = document.getElementById('avv-' + id);
    const b = c && [...c.querySelectorAll('button')].find(x => x.innerText.indexOf(testo) >= 0);
    if (!b) return false;
    b.click(); return true;
  }, id, testo);
  if (!ok) throw new Error('pulsante "' + testo + '" non trovato sull\'avviso ' + id + ': ' + await testoCard(s, id));
  await attendiQuiete(s.stato, 500);
}
async function segnaFatto(s, id) {
  await s.page.evaluate(async id => { await chiudiAvviso(id, 'fatto'); }, id);
  await s.page.click('#avc-conferma');
  await attendiQuiete(s.stato, 800);
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  if (psql("select to_regclass('public.annullamenti') is not null") !== 't') fermati('sql/72 non eseguito nel database locale');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const tecnico = utenti.filter(u => u.ruolo === 'tecnico').sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const capo = utenti.filter(u => u.ruolo === 'capo_tecnico').sort((x, y) => String(x.nome).localeCompare(String(y.nome)))[0];
  if (!tecnico || !capo) fermati('servono un tecnico e un capo tecnico attivi');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  let a = null, b = null;
  try {
    const idAvv = psql("select public.crea_avviso('scadenza', '" + ETICHETTA + ": controlla gli estintori del cliente', '" + tecnico.id + "'::uuid, null, null, null, now() + interval '1 day')");
    righe.push('avviso di prova n. ' + idAvv + ' a ' + tecnico.nome + ' ' + tecnico.cognome);
    // 1. tecnico: Fatto, poi Annulla da solo
    a = await apriSito(browser, url);
    await a.page.setViewport({ width: 390, height: 844 });
    await login(a, tecnico);
    await apriAvvisiChiusi(a);
    await segnaFatto(a, idAvv);
    if (psql('select stato from public.avvisi where id = ' + idAvv) !== 'fatto') KO('1: avviso non segnato fatto');
    await a.page.evaluate(() => disegnaAvvisi());
    await attendiQuiete(a.stato, 800);
    const t1 = await testoCard(a, idAvv);
    if (!/↩️ Annulla \(fino (alle|a domani alle|al )/.test(t1)) KO('1: dopo 5 minuti manca "↩️ Annulla (fino alle …)": ' + t1);
    await a.page.screenshot({ path: path.join(CARTELLA_OUT, '1-tecnico-annulla-390.png') });
    await clicNellaCard(a, idAvv, '↩️ Annulla');
    await a.page.type('#anl-motivo', 'premuto per sbaglio');
    await a.page.click('#anl-conferma');
    await attendiQuiete(a.stato, 1000);
    if (psql('select stato from public.avvisi where id = ' + idAvv) !== 'aperto') KO('1: dopo "Annulla" l\'avviso non è di nuovo aperto');
    else righe.push('1. tecnico: "↩️ Annulla" → avviso di nuovo aperto');
    // 2. dopo 24 ore: Chiedi correzione
    await segnaFatto(a, idAvv);
    psql("update public.avvisi set chiuso_il = now() - interval '25 hours' where id = " + idAvv);
    await a.page.evaluate(() => disegnaAvvisi());
    await attendiQuiete(a.stato, 800);
    const t2 = await testoCard(a, idAvv);
    if (!/✏️ Chiedi correzione/.test(t2) || /↩️ Annulla/.test(t2)) KO('2: dopo 25 ore il pulsante non è "✏️ Chiedi correzione": ' + t2);
    await clicNellaCard(a, idAvv, '✏️ Chiedi correzione');
    const finestra = await a.page.evaluate(() => document.getElementById('anl-testo').innerText);
    if (!/Capo tecnico/i.test(finestra)) KO('2: la finestra non dice che va al capo tecnico: ' + finestra);
    await a.page.type('#anl-motivo', 'Chiuso per sbaglio: il cliente era chiuso');
    await a.page.screenshot({ path: path.join(CARTELLA_OUT, '2-tecnico-chiedi-correzione-390.png') });
    await a.page.click('#anl-conferma');
    await attendiQuiete(a.stato, 1000);
    const rich = psql("select r.id || '|' || r.stato || '|' || coalesce(a.destinatario_ruolo, '') || '|' || (a.scadenza is not null) from public.annullamenti r join public.avvisi a on a.id = r.avviso_id where r.oggetto = 'avvisi' and r.record_id = '" + idAvv + "' and r.tipo = 'correzione' order by r.id desc limit 1");
    const [idRich, statoRich, destRich, conScad] = rich.split('|');
    if (statoRich !== 'aperta' || destRich !== 'capo_tecnico' || conScad !== 'true') KO('2: richiesta non arrivata al capo tecnico con la scadenza: ' + rich);
    else righe.push('2. dopo 24 h: "✏️ Chiedi correzione" → richiesta n. ' + idRich + ' al capo tecnico con scadenza');
    await a.page.evaluate(() => disegnaAvvisi());
    await attendiQuiete(a.stato, 800);
    if (!/Correzione chiesta a/.test(await testoCard(a, idAvv))) KO('2: manca "⏳ Correzione chiesta a …"');
    // 3. capo tecnico: annulla l'azione per lui
    b = await apriSito(browser, url);
    await login(b, capo);
    await b.page.evaluate(async () => { AVVISI.chiusi = false; await apriAvvisi(); });
    await attendiQuiete(b.stato, 800);
    const idAvvCapo = psql("select avviso_id from public.annullamenti where id = " + idRich);
    const t3 = await testoCard(b, idAvvCapo);
    if (!/Correzione chiesta da/.test(t3) || /✓ Fatto/.test(t3)) KO('3: avviso del capo tecnico non come atteso: ' + t3);
    await clicNellaCard(b, idAvvCapo, '✏️ Gestisci la correzione');
    await b.page.waitForFunction(() => /Annulla l'azione per lui/.test(document.getElementById('crz-azioni').innerText), { timeout: 10000 });
    await b.page.screenshot({ path: path.join(CARTELLA_OUT, '3-capo-tecnico-correzione.png') });
    await b.page.evaluate(() => { [...document.querySelectorAll('#crz-azioni button')].find(x => /Annulla l'azione per lui/.test(x.innerText)).click(); });
    await attendiQuiete(b.stato, 1200);
    if (psql('select stato from public.avvisi where id = ' + idAvv) !== 'aperto') KO('3: l\'avviso del tecnico non è di nuovo aperto');
    if (psql('select stato from public.annullamenti where id = ' + idRich) !== 'applicata') KO('3: la richiesta non è "applicata"');
    if (psql("select count(*) from public.avvisi where tipo = 'correzione_esito' and destinatario_id = '" + tecnico.id + "' and rif_id = '" + idRich + "'") !== '1') KO('3: esito non arrivato al tecnico');
    if (!fallimenti.length) righe.push('3. capo tecnico: "↩️ Annulla l\'azione per lui" → avviso aperto, esito al tecnico');
    [a, b].forEach(s => s.stato.erroriJs.forEach(e => KO('errore JavaScript: ' + e)));
    [a, b].forEach(s => s.stato.rete.filter(e => e.status >= 500 || /does not exist|could not find/i.test(e.msg)).forEach(e => KO('database: ' + e.metodo + ' ' + e.dove.split('?')[0] + ' → ' + e.status + ' ' + e.msg)));
  } catch (e) {
    KO('errore dello script: ' + e.message.split('\n')[0]);
    try { if (a) await a.page.screenshot({ path: path.join(CARTELLA_OUT, 'errore-tecnico.png') }); } catch (e2) { /* niente */ }
    try { if (b) await b.page.screenshot({ path: path.join(CARTELLA_OUT, 'errore-capo.png') }); } catch (e2) { /* niente */ }
  } finally {
    if (a) await a.contesto.close();
    if (b) await b.contesto.close();
  }
  await browser.close(); srv.close();
  righe.forEach(r => console.log('    ' + r));
  fallimenti.forEach(f => console.log('    FALLITO  ' + f));
  console.log('\n' + (fallimenti.length ? 'FALLITO' : 'TUTTO OK') + ' (schermate in ' + CARTELLA_OUT + ')');
  process.exit(fallimenti.length ? 1 : 0);
})().catch(e => { console.error('TEST INTERROTTO: ' + e.stack); process.exit(2); });
