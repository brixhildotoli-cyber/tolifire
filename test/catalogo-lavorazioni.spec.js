#!/usr/bin/env node
// F15.1 - Catalogo lavorazioni in tabella (js/55-catalogo-lavorazioni.js,
// sql/75), Chrome headless con puppeteer-core, SOLO DATABASE LOCALE con sql/75
// eseguito (test/locale/avvia-db-locale.sh, poi sql/75 e il suo
// -REGISTRO-CANCELLAZIONI). Il "fatto quando" della task:
//  1. il titolare, da Impostazioni > Catalogo lavorazioni, aggiunge un valore
//     al menu "Intervento" (tipo di servizio) della Compartimentazione e lo
//     vede subito nella scheda; cambia il nome di una lavorazione e
//     etichettaFamigliaTecnica lo legge dalla tabella; spegne e riaccende;
//  2. l'ingegnere, da Verifiche tecniche, aggiunge "EI 240" alle Coppelle e
//     lo vede nella scheda; non ha il bottone Attiva e il database gli
//     rifiuta l'attivazione anche dalla console;
//  3. il commerciale (ruolo non ammesso) dalla console: inserimento rifiutato,
//     modifica senza righe cambiate.
// Nessun errore JavaScript né del database. Schermate a 390 px nella cartella
// dei risultati ($TMPDIR/toli-catalogo-lavorazioni). Alla fine i valori del
// catalogo tornano quelli di partenza (update da psql, nessuna cancellazione).
// Uso: cd test && node catalogo-lavorazioni.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-catalogo-lavorazioni');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.1';
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

const VALORI_CAMPO = (lav, campo) => psql("select c.valori_ammessi::text from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = '" + lav + "' and c.codice = '" + campo + "'");
const ID_CAMPO = (lav, campo) => psql("select c.id from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = '" + lav + "' and c.codice = '" + campo + "'");

// Aggiunge un valore a un menu dalla finestra del catalogo
async function aggiungiValoreDallaPagina(s, lav, campo, valore) {
  await s.page.evaluate(lav => { document.getElementById('cl-scelta').value = lav; scegliLavorazioneCatalogo(); }, lav);
  await attendiQuiete(s.stato, 600);
  const id = ID_CAMPO(lav, campo);
  await s.page.evaluate(id => apriCampoLavorazione(Number(id)), id);
  await s.page.waitForFunction(() => document.getElementById('m-campo-lavorazione').classList.contains('on'), { timeout: 5000 });
  await s.page.type('#clc-nuovo-valore', valore);
  await s.page.keyboard.press('Enter');
  await s.page.click('#clc-salva');
  await attendiQuiete(s.stato, 1200);
}

// Opzioni di un menu della scheda di rilievo aperta come dall'ingegnere
async function opzioniScheda(s, progettoId, apri, idSelect) {
  await s.page.evaluate(async (progettoId, apri) => {
    let el = document.getElementById('mvt-id');
    if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.id = 'mvt-id'; document.body.appendChild(el); }
    el.value = progettoId;
    await window[apri]();
  }, progettoId, apri);
  await attendiQuiete(s.stato, 800);
  const opz = await s.page.evaluate(id => [...document.querySelectorAll('#' + id + ' option')].map(o => o.textContent.trim()), idSelect);
  await s.page.evaluate(() => { if (typeof schedaRilievoAperta !== 'undefined' && schedaRilievoAperta) schedaRilievoAperta.modificata = false; closeM('m-rilievo-tecnico'); });
  return opz;
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  if (psql("select to_regclass('public.lavorazioni') is not null") !== 't') fermati('sql/75 non eseguito nel database locale');
  const progettoId = psql('select id from public.progetti_tecnici order by id limit 1');
  if (!progettoId) fermati('serve almeno un progetto tecnico nel database locale');
  const partenza = {
    cp: VALORI_CAMPO('compartimentazione', 'tipo_intervento'),
    co: VALORI_CAMPO('coppelle', 'classe_resistenza'),
    nomeCo: psql("select nome from public.lavorazioni where codice = 'coppelle'")
  };
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const tit = primo('titolare'), ing = primo('ingegnere'), com = primo('commerciale');
  if (!tit || !ing || !com) fermati('servono titolare, ingegnere e commerciale attivi');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    // 1. titolare
    const t = await apriSito(browser, url); sessioni.push(t);
    await login(t, tit);
    await t.page.evaluate(() => gotoPage('impostazioni'));
    await attendiQuiete(t.stato, 1500);
    await t.page.waitForFunction(() => document.getElementById('si-catalogo-lav-apri') && document.getElementById('si-catalogo-lav-apri').style.display !== 'none', { timeout: 15000 });
    const riass = await t.page.evaluate(() => document.getElementById('si-catalogo-lav-stato').innerText);
    if (!/11/.test(riass)) KO('1: riquadro in Impostazioni senza le 11 lavorazioni: ' + riass);
    const prima = await opzioniScheda(t, progettoId, 'apriSchedaCompartimentazioneIngegnere', 'cp-tipo-intervento');
    if (prima.join('|') !== 'Seleziona|Sigillatura attraversamenti|Parete|Controsoffitto|Pavimento|Giunto') KO('1: menu della scheda diverso da quello di oggi: ' + prima.join('|'));
    else righe.push('1. scheda Compartimentazione, menu Intervento uguale a oggi (' + (prima.length - 1) + ' valori)');
    await t.page.click('#si-catalogo-lav-apri');
    await attendiQuiete(t.stato, 1000);
    await aggiungiValoreDallaPagina(t, 'compartimentazione', 'tipo_intervento', 'Sigillatura di canaline');
    if (!/Sigillatura di canaline/.test(VALORI_CAMPO('compartimentazione', 'tipo_intervento'))) KO('1: valore non salvato nel database');
    await t.page.setViewport({ width: 390, height: 844 });
    await t.page.screenshot({ path: path.join(CARTELLA_OUT, '1-titolare-catalogo-390.png') });
    await t.page.setViewport({ width: 1280, height: 900 });
    await t.page.evaluate(() => closeM('m-catalogo-lavorazioni'));
    const dopo = await opzioniScheda(t, progettoId, 'apriSchedaCompartimentazioneIngegnere', 'cp-tipo-intervento');
    if (dopo[dopo.length - 1] !== 'Sigillatura di canaline') KO('1: il valore nuovo non compare nella scheda: ' + dopo.join('|'));
    else righe.push('   il titolare aggiunge "Sigillatura di canaline" dalla pagina e lo vede subito nella scheda');
    const reg = psql("select count(*) from public.lavorazioni_registro where tabella = 'lavorazioni_campi' and utente_id = '" + tit.id + "' and azione = 'modificata'");
    if (reg === '0') KO('1: registro senza la modifica del titolare'); else righe.push('   registro: ' + reg + ' modifica del titolare');
    // nome dalla tabella
    await t.page.evaluate(async () => { await apriCatalogoLavorazioni('coppelle'); document.getElementById('cl-nome').value = 'Coppelle antincendio'; await salvaLavorazioneCatalogo(); });
    await attendiQuiete(t.stato, 1000);
    const etich = await t.page.evaluate(() => etichettaFamigliaTecnica('coppelle') + '|' + etichettaFamigliaTecnica('famiglia_sconosciuta'));
    if (etich !== 'Coppelle antincendio|Famiglia Sconosciuta') KO('1: etichettaFamigliaTecnica non legge la tabella: ' + etich);
    else righe.push('   etichettaFamigliaTecnica: prima la tabella ("Coppelle antincendio"), poi l\'elenco fisso');
    // spegne e riaccende
    await t.page.click('#cl-attiva-btn');
    await attendiQuiete(t.stato, 1000);
    await t.page.click('#cl-attiva-btn');
    await attendiQuiete(t.stato, 1000);
    const att = psql("select string_agg(azione, ',' order by id) from public.lavorazioni_registro where lavorazione_id = (select id from public.lavorazioni where codice = 'coppelle') and azione in ('attivata','disattivata')");
    if (att !== 'disattivata,attivata' || psql("select attiva from public.lavorazioni where codice = 'coppelle'") !== 't') KO('1: spegni/riaccendi del titolare non registrati: ' + att);
    else righe.push('   il titolare spegne e riaccende Coppelle (registro: disattivata, attivata)');
    await chiudi(t);

    // 2. ingegnere
    const g = await apriSito(browser, url); sessioni.push(g);
    await g.page.setViewport({ width: 390, height: 844 });
    await login(g, ing);
    await g.page.evaluate(() => gotoPage('verifiche-tecniche'));
    await attendiQuiete(g.stato, 1500);
    await g.page.waitForFunction(() => document.getElementById('vt-catalogo-btn').style.display !== 'none', { timeout: 10000 });
    await g.page.click('#vt-catalogo-btn');
    await attendiQuiete(g.stato, 1000);
    await aggiungiValoreDallaPagina(g, 'coppelle', 'classe_resistenza', 'EI 240');
    await g.page.screenshot({ path: path.join(CARTELLA_OUT, '2-ingegnere-catalogo-390.png') });
    if (await g.page.evaluate(() => !!document.getElementById('cl-attiva-btn'))) KO('2: l\'ingegnere vede il bottone Attiva');
    await g.page.evaluate(() => closeM('m-catalogo-lavorazioni'));
    const opzCo = await opzioniScheda(g, progettoId, 'apriSchedaCoppelleIngegnere', 'co-classe-resistenza');
    if (opzCo.indexOf('EI 240') < 0) KO('2: "EI 240" non compare nella scheda Coppelle: ' + opzCo.join('|'));
    else righe.push('2. l\'ingegnere aggiunge "EI 240" alle Coppelle e lo vede nella scheda');
    const console2 = await g.page.evaluate(async () => {
      const r = await db.from('lavorazioni').update({ attiva: false }).eq('codice', 'coppelle').select('id');
      return (r.error ? 'errore: ' + r.error.message : 'righe ' + (r.data || []).length);
    });
    if (!/Solo il titolare/.test(console2)) KO('2: attivazione dell\'ingegnere non rifiutata dal database: ' + console2);
    else righe.push('   console dell\'ingegnere: spegnere Coppelle → ' + console2);
    await chiudi(g);

    // 3. commerciale (ruolo non ammesso)
    const c = await apriSito(browser, url); sessioni.push(c);
    await login(c, com);
    const console3 = await c.page.evaluate(async () => {
      const l = await db.from('lavorazioni').select('id').eq('codice', 'compartimentazione').single();
      const ins = await db.from('lavorazioni_campi').insert({ lavorazione_id: l.data.id, codice: 'hack', etichetta: 'Hack', tipo: 'testo', uso_a_valle: 'prova' });
      const upd = await db.from('lavorazioni_campi').update({ etichetta: 'Hack' }).eq('lavorazione_id', l.data.id).select('id');
      const reg = await db.from('lavorazioni_registro').select('id');
      return [ins.error ? 'insert rifiutato: ' + ins.error.message : 'insert RIUSCITO',
              upd.error ? 'update: ' + upd.error.message : 'update righe ' + upd.data.length,
              reg.error ? 'registro: ' + reg.error.message : 'registro righe ' + reg.data.length].join(' | ');
    });
    if (!/insert rifiutato/.test(console3) || !/update righe 0/.test(console3) || !/registro righe 0/.test(console3)) KO('3: il commerciale non è stato fermato dal database: ' + console3);
    else righe.push('3. console del commerciale: ' + console3);
    if (await c.page.evaluate(() => { apriCatalogoLavorazioni(); return document.getElementById('m-catalogo-lavorazioni').classList.contains('on'); })) KO('3: il commerciale apre il catalogo');

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
    // Valori di partenza (update da psql, nessuna cancellazione; il registro resta)
    try {
      const q = s => "'" + String(s).replace(/'/g, "''") + "'";
      psql("update public.lavorazioni_campi c set valori_ammessi = " + q(partenza.cp) + "::jsonb from public.lavorazioni l where l.id = c.lavorazione_id and l.codice = 'compartimentazione' and c.codice = 'tipo_intervento';" +
           "update public.lavorazioni_campi c set valori_ammessi = " + q(partenza.co) + "::jsonb from public.lavorazioni l where l.id = c.lavorazione_id and l.codice = 'coppelle' and c.codice = 'classe_resistenza';" +
           "update public.lavorazioni set nome = " + q(partenza.nomeCo) + ", attiva = true where codice = 'coppelle'");
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
