#!/usr/bin/env node
// F15.13 - Smistamento automatico per famiglia (sql/83 + js/67, js/17, js/18).
// Chrome headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh con sql/77-83).
// Il "fatto quando" della task:
//  1. il rappresentante (390 px) ha solo "📤 Invia il progetto": porte REI
//     standard + vernice intumescente → porte ad Acquisti, vernice
//     all'ingegnere; la console (invio diretto) è rifiutata dal database;
//  2. Acquisti trova il progetto in "Da preventivare" con le sole porte, non
//     legge la scheda della vernice, avvia il preventivo (il progetto resta
//     all'ingegnere); l'ingegnere approva e ad Acquisti arriva l'avviso;
//  3. un progetto da 35.000 € va tutto all'ingegnere, senza "Invia ad Acquisti";
//  4. il titolare: riquadro delle regole, anteprima su un progetto di prova,
//     regola nuova, Disattiva, registro;
//  5. con le regole spente il sito ha i due bottoni di prima;
//  6. con le regole spente (o senza sql/83) un preventivo il cui progetto è
//     in verifica tecnica senza schede gialle ha "↩ Rimanda indietro" come prima.
// Con SMISTAMENTO_SENZA_SQL=1 (dopo il ROLLBACK di sql/83): due bottoni come
// prima, riquadro "non ancora attivo", nessun errore.
// Uso: cd test && node smistamento-famiglie.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-smistamento-famiglie');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.13';
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


const toastTesto = s => s.page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');


const testoDialoghi = s => s.stato.dialoghi.join(' / ');

async function inviaE(s, funzione, progettoId) {
  s.stato.dialoghi = [];
  await s.page.evaluate(async (f, id) => { await window[f](id); }, funzione, progettoId);
  await attendiQuiete(s.stato, 1500);
  return testoDialoghi(s);
}
const testoPagina = (s, sel) => s.page.evaluate(sel => (document.querySelector(sel) || {}).innerText || '', sel);
async function cartaProgetto(s, progettoId) {
  return s.page.evaluate(id => {
    const b = [...document.querySelectorAll('#progetti-lista .card')].find(c => c.innerHTML.includes(id));
    return b ? b.innerText : '';
  }, progettoId);
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const SENZA = CONF.SMISTAMENTO_SENZA_SQL === '1';
  const c83 = psql("select to_regprocedure('public.smista_progetto(uuid)') is not null");
  if (!SENZA && c83 !== 't') fermati('sql/83 non eseguito nel database locale');
  if (SENZA && c83 === 't') fermati('SMISTAMENTO_SENZA_SQL=1 ma sql/83 c\'è: eseguire prima il ROLLBACK di sql/83');
  const riga = psql("select p.id || '|' || p.stato || '|' || p.rappresentante_id || '|' || coalesce(p.fonte_rilievo, '') || '|' || coalesce(p.importo_stimato::text, '') from public.progetti_tecnici p join public.utenti u on u.id = p.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where p.stato = 'bozza' and not exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = p.id) and not exists (select 1 from public.preventivi v where v.progetto_tecnico_id = p.id) order by p.creato_il limit 1");
  if (!riga) fermati('serve un progetto in bozza di un rappresentante senza schede né preventivi');
  const [progettoId, statoPartenza, rapId, fontePartenza, importoPartenza] = riga.split('|');
  const inizio = psql('select now()');
  const regolePartenza = SENZA ? [] : psql('select id || \':\' || attiva from public.regole_smistamento order by id').split('\n').filter(Boolean);
  const docSpenti = psql("update public.lavorazioni_documenti set attivo = false where attivo returning id").split('\n').filter(x => /^\d+$/.test(x));
  psql("update public.progetti_tecnici set fonte_rilievo = 'sopralluogo_toli', importo_stimato = 8000 where id = " + q(progettoId));
  psql("insert into public.progetti_tecnici_allegati (progetto_id, nome_file, storage_path, mime_type, dimensione, caricato_da) values (" +
    q(progettoId) + ", 'planimetria_prova.pdf', " + q(rapId + '/' + progettoId + '/planimetria_prova.pdf') + ", 'application/pdf', 1000, " + q(rapId) + ")");
  const fotoId = psql("insert into public.progetti_tecnici_allegati (progetto_id, nome_file, storage_path, mime_type, dimensione, caricato_da) values (" +
    q(progettoId) + ", 'targhetta_prova.jpg', " + q(rapId + '/' + progettoId + '/fonti/targhetta_prova.jpg') + ", 'image/jpeg', 1000, " + q(rapId) + ") returning id").split('\n')[0];
  const porte = { tipo_richiesta: 'definitiva', tipo_intervento: 'fornitura_e_posa', rei: 'rei_60', tipologia: 'battente_singolo', quantita: 3, larghezza: 90, altezza: 210,
    fonti_normative: { rei: { valore: 'rei_60', fonte: 'come_esistente', allegato_id: fotoId, allegato_nome: 'targhetta_prova.jpg' } } };
  const vernice = { tipo_richiesta: 'definitiva', elemento: 'trave', classe_r: 'r60', superficie: 40, note_supporto: 'TRAVI DEL SOPPALCO PROVA',
    fonti_normative: { classe_r: { valore: 'r60', fonte: 'come_esistente', allegato_id: fotoId, allegato_nome: 'targhetta_prova.jpg' } } };
  psql("insert into public.progetti_tecnici_schede (progetto_tecnico_id, famiglia, numero, dati, stato, compilato_da) values (" +
    q(progettoId) + ", 'porte_rei', 1, " + q(JSON.stringify(porte)) + "::jsonb, 'bozza', " + q(rapId) + "), (" +
    q(progettoId) + ", 'vernice_intumescente', 1, " + q(JSON.stringify(vernice)) + "::jsonb, 'bozza', " + q(rapId) + ")");
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const rap = utenti.find(u => u.id === rapId);
  const com = utenti.find(u => u.ruolo === 'commerciale' && diProva(u)) || utenti.find(u => u.ruolo === 'commerciale');
  const ing = utenti.find(u => u.ruolo === 'ingegnere');
  const tit = utenti.find(u => u.ruolo === 'titolare');
  if (!rap || !com || !ing || !tit) fermati('servono rappresentante del progetto, commerciale, ingegnere e titolare attivi');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const statoProgetto = () => psql('select stato from public.progetti_tecnici where id = ' + q(progettoId));
  const smist = () => psql("select string_agg(famiglia || '=' || coalesce(stato_smistamento, '-'), ',' order by famiglia) from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId));
  try {
    // 1. Rappresentante a 390 px -------------------------------------------
    const r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);
    await r.page.evaluate(() => gotoPage('progetti'));
    await attendiQuiete(r.stato, 1500);
    const carta = await cartaProgetto(r, progettoId);
    if (SENZA) {
      if (!/Invia ad Acquisti/.test(carta) || !/Richiedi verifica tecnica/.test(carta) || /Invia il progetto/.test(carta)) KO('senza sql/83: bottoni di prima attesi: ' + carta.replace(/\s+/g, ' ').slice(0, 300));
      else righe.push('senza sql/83: "🔧 Richiedi verifica tecnica" e "📤 Invia ad Acquisti" come prima, niente "Invia il progetto"');
    } else {
      if (!/Invia il progetto/.test(carta) || /Invia ad Acquisti/.test(carta) || /Richiedi verifica tecnica/.test(carta)) KO('1: bottoni del rappresentante: ' + carta.replace(/\s+/g, ' ').slice(0, 300));
      else righe.push('1. rappresentante a 390 px: solo "📤 Invia il progetto" (niente "Invia ad Acquisti" né "Richiedi verifica tecnica")');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-progetti-rappresentante-390.png'), fullPage: true });
      const cons = await r.page.evaluate(async id => {
        const x = await db.from('progetti_tecnici').update({ stato: 'inviato_a_commerciale' }).eq('id', id).select('id');
        return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO';
      }, progettoId);
      if (!/rifiutato: Con lo smistamento automatico attivo/.test(cons)) KO('1: console del rappresentante: ' + cons);
      else righe.push('   console del rappresentante (invio diretto ad Acquisti): ' + cons.slice(0, 120));
      const cons2 = await r.page.evaluate(async () => {
        const x = await db.rpc('salva_regola_smistamento', { p_id: null, p_regola: { nome: 'x prova', tipo: 'fuori_catalogo' } });
        return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO';
      });
      if (!/rifiutato/.test(cons2)) KO('1: il rappresentante salva una regola: ' + cons2);
      else righe.push('   console del rappresentante (salva una regola): ' + cons2.slice(0, 120));
      const d1 = await inviaE(r, 'inviaProgettoConSmistamento', progettoId);
      if (!/Porte e portoni REI → ad Acquisti/.test(d1) || !/Vernice intumescente → all’ingegnere/.test(d1)) KO('1: finestra di conferma: ' + d1);
      else righe.push('   conferma: ' + d1.split('\n').filter(x => /→|perché/.test(x)).map(x => x.trim()).join(' | '));
      if (statoProgetto() !== 'in_verifica_tecnica' || smist() !== 'porte_rei=acquisti,vernice_intumescente=ingegnere') KO('1: dopo l\'invio: ' + statoProgetto() + ' ' + smist() + ' ' + await toastTesto(r));
      else righe.push('   inviato: progetto in verifica tecnica, ' + smist());
    }
    await chiudi(r);

    if (!SENZA) {
      // 2. Acquisti -------------------------------------------------------
      const c = await apriSito(browser, url); sessioni.push(c);
      await login(c, com);
      await c.page.evaluate(() => gotoPage('progetti-da-preventivare'));
      await attendiQuiete(c.stato, 1500);
      const lista = await c.page.evaluate(id => {
        const b = [...document.querySelectorAll('#progetti-da-preventivare-lista .card')].find(x => x.innerHTML.includes(id));
        return b ? b.innerText : '';
      }, progettoId);
      if (!/Per te: Porte e portoni REI/.test(lista) || !/ancora dall’ingegnere/.test(lista) || /Richiedi integrazione/.test(lista)) KO('2: Da preventivare: ' + lista.replace(/\s+/g, ' ').slice(0, 300));
      else righe.push('2. Acquisti, Da preventivare: "🚦 Per te: Porte e portoni REI", "altre schede ancora dall’ingegnere", niente "Richiedi integrazione"');
      await c.page.screenshot({ path: path.join(CARTELLA_OUT, '2-da-preventivare.png'), fullPage: true });
      await c.page.evaluate(async id => { await openProgettoDetail(id); }, progettoId);
      await attendiQuiete(c.stato, 1200);
      await c.page.evaluate(() => { const t = [...document.querySelectorAll('#pg-progetto-detail .tab')].find(x => /Rilievi tecnici/.test(x.textContent)); if (t) t.click(); });
      await attendiQuiete(c.stato, 1500);
      const rilievi = await testoPagina(c, '#pd-schede-content');
      if (/SOPPALCO PROVA/i.test(rilievi) || !/Smistamento automatico/.test(rilievi) || !/all’ingegnere/.test(rilievi)) KO('2: rilievi visti da Acquisti: ' + rilievi.replace(/\s+/g, ' ').slice(0, 400));
      else righe.push('   scheda progetto (Rilievi tecnici): riquadro 🚦 con la vernice all’ingegnere, i dati della vernice NON si leggono');
      await c.page.screenshot({ path: path.join(CARTELLA_OUT, '2-rilievi-acquisti.png'), fullPage: true });
      const lettura = await c.page.evaluate(async id => {
        const x = await db.from('progetti_tecnici_schede').select('famiglia').eq('progetto_tecnico_id', id);
        return x.error ? 'errore ' + x.error.message : x.data.map(r => r.famiglia).join(',');
      }, progettoId);
      if (lettura !== 'porte_rei') KO('2: console di Acquisti legge: ' + lettura);
      else righe.push('   console di Acquisti: legge solo ' + lettura);
      await c.page.evaluate(async id => { await avviaPreventivo(id); }, progettoId);
      await attendiQuiete(c.stato, 2000);
      const prev = psql("select count(*) from public.preventivi where progetto_tecnico_id = " + q(progettoId));
      if (prev !== '1' || statoProgetto() !== 'in_verifica_tecnica') KO('2: avvia preventivo: preventivi ' + prev + ', stato ' + statoProgetto() + ' ' + await toastTesto(c));
      else righe.push('   🧾 Avvia preventivo: bozza creata, il progetto resta all’ingegnere (in verifica tecnica)');
      const idPrev = psql("select id from public.preventivi where progetto_tecnico_id = " + q(progettoId) + " limit 1");
      await c.page.evaluate(async id => { await openPreventivoDetail(id); }, idPrev);
      await attendiQuiete(c.stato, 1500);
      const rimanda = await c.page.evaluate(() => ({
        testo: (document.getElementById('pg-preventivo-detail') || document.body).innerText,
        bottone: [...document.querySelectorAll('button')].some(b => b.offsetParent && /↩ Rimanda indietro$/.test(b.textContent.trim()))
      }));
      if (rimanda.bottone || !/Rimanda indietro\s+non è disponibile/.test(rimanda.testo)) KO('2: preventivo con il progetto dall’ingegnere: bottone ' + rimanda.bottone);
      else righe.push('   preventivo in bozza: "↩ Rimanda indietro non è disponibile: il progetto è ancora dall’ingegnere", nessun bottone');
      await c.page.screenshot({ path: path.join(CARTELLA_OUT, '2-preventivo-rimanda.png'), fullPage: true });
      await chiudi(c);

      // Ingegnere --------------------------------------------------------
      const g = await apriSito(browser, url); sessioni.push(g);
      await login(g, ing);
      await g.page.evaluate(async id => { await apriVerificaTecnica(id); }, progettoId);
      await attendiQuiete(g.stato, 1500);
      const riep = await testoPagina(g, '#mvt-riepilogo');
      if (!/Vernice intumescente: spessori a calcolo interno/.test(riep)) KO('2: verifica tecnica: ' + riep.replace(/\s+/g, ' ').slice(0, 300));
      else righe.push('   ingegnere, Verifica tecnica: riquadro con "Vernice intumescente: spessori a calcolo interno"');
      await g.page.screenshot({ path: path.join(CARTELLA_OUT, '2-verifica-ingegnere.png') });
      await g.page.evaluate(async () => { await salvaEsitoVerifica('in_preventivazione'); });
      await attendiQuiete(g.stato, 1500);
      const avv = psql("select count(*) from public.avvisi where tipo = 'smistamento_verificato' and stato = 'aperto' and rif_id = " + q(progettoId) + " and destinatario_id = " + q(com.id));
      if (smist() !== 'porte_rei=acquisti,vernice_intumescente=verificata' || avv !== '1') KO('2: dopo l\'approvazione: ' + smist() + ', avvisi ' + avv);
      else righe.push('   approvato: ' + smist() + ', avviso 🔔 ad Acquisti');
      await chiudi(g);

      // 3. Progetto da 35.000 € ------------------------------------------
      psql("delete from public.preventivi where progetto_tecnico_id = " + q(progettoId));
      psql("delete from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'vernice_intumescente'");
      psql("update public.progetti_tecnici set stato = 'bozza', importo_stimato = 35000 where id = " + q(progettoId));
      const r3 = await apriSito(browser, url); sessioni.push(r3);
      await r3.page.setViewport({ width: 390, height: 844 });
      await login(r3, rap);
      await r3.page.evaluate(() => gotoPage('progetti'));
      await attendiQuiete(r3.stato, 1500);
      const carta3 = await cartaProgetto(r3, progettoId);
      if (/Invia ad Acquisti/.test(carta3) || !/tutto il progetto va all’ingegnere/.test(carta3)) KO('3: progetto da 35.000: ' + carta3.replace(/\s+/g, ' ').slice(0, 300));
      else righe.push('3. 35.000 €: niente "Invia ad Acquisti", avviso "con lo smistamento automatico tutto il progetto va all’ingegnere"');
      await r3.page.screenshot({ path: path.join(CARTELLA_OUT, '3-lavoro-grande-390.png'), fullPage: true });
      const d3 = await inviaE(r3, 'inviaProgettoConSmistamento', progettoId);
      if (statoProgetto() !== 'in_verifica_tecnica' || smist() !== 'porte_rei=ingegnere' || !/Lavoro grande/.test(d3)) KO('3: invio da 35.000: ' + statoProgetto() + ' ' + smist() + ' ' + d3);
      else righe.push('   inviato: tutto all’ingegnere (' + (d3.match(/perché: [^\n]*/) || [''])[0].trim() + ')');
      await chiudi(r3);
    }

    // 4. Titolare: Impostazioni ----------------------------------------------
    const t = await apriSito(browser, url); sessioni.push(t);
    await login(t, tit);
    await t.page.evaluate(() => gotoPage('impostazioni'));
    await attendiQuiete(t.stato, 2000);
    await t.page.waitForFunction(() => document.getElementById('si-smistamento-stato') && document.getElementById('si-smistamento-stato').textContent.trim() !== '', { timeout: 15000 });
    const card = await testoPagina(t, '#si-smistamento-card');
    if (SENZA) {
      if (!/non è ancora attivo/.test(card)) KO('senza sql/83: riquadro delle regole: ' + card.slice(0, 200));
      else righe.push('senza sql/83: Impostazioni, "🚦 Regole di smistamento" dice "non è ancora attivo"');
    } else {
      if (!/Lavoro grande/.test(card) || !/Vernice intumescente/.test(card) || !/3 regole attive su/.test(card)) KO('4: riquadro: ' + card.slice(0, 300));
      else righe.push('4. titolare, Impostazioni: riquadro delle regole (' + (card.match(/\d+ regole attive su \d+/) || [''])[0] + ')');
      await t.page.screenshot({ path: path.join(CARTELLA_OUT, '4-regole-titolare.png'), fullPage: true });
      // anteprima su un progetto di prova
      await t.page.evaluate(async () => { await apriAnteprimaSmistamento(false); });
      await attendiQuiete(t.stato, 1200);
      await t.page.select('#ans-progetto', progettoId);
      await t.page.evaluate(async () => { await eseguiAnteprimaSmistamento(); });
      await attendiQuiete(t.stato, 1000);
      const ant = await testoPagina(t, '#ans-esito');
      if (!/andrebbe all’ingegnere/.test(ant) || !/Lavoro grande/.test(ant)) KO('4: anteprima: ' + ant);
      else righe.push('   🧪 Anteprima: "' + ant.split('\n')[0] + '"');
      await t.page.evaluate(() => closeM('m-anteprima-smistamento'));
      // regola nuova
      await t.page.evaluate(async () => { await apriRegolaSmistamento(); });
      await attendiQuiete(t.stato, 800);
      await scrivi(t, 'rgs-nome', 'PROVA F15.13 vernice esterno');
      await t.page.select('#rgs-tipo', 'campo');
      await t.page.evaluate(() => aggiornaTipoRegolaSmistamento());
      await t.page.select('#rgs-famiglia', 'vernice_intumescente');
      await t.page.evaluate(() => aggiornaTipoRegolaSmistamento());
      const campi = await t.page.evaluate(() => [...document.querySelectorAll('#rgs-condizioni .rgs-c-campo option')].map(o => o.value));
      if (!campi.includes('ambiente')) KO('4: campi della vernice nella condizione: ' + campi.join(','));
      await t.page.select('#rgs-condizioni .rgs-c-campo', 'ambiente');
      await t.page.evaluate(() => riempiValoriCondizione(document.querySelector('#rgs-condizioni .rgs-cond')));
      await t.page.evaluate(() => { document.querySelector('#rgs-condizioni .rgs-c-valore').value = 'esterno'; });
      await t.page.screenshot({ path: path.join(CARTELLA_OUT, '4-regola-nuova.png') });
      await t.page.evaluate(async () => { await salvaRegolaSmistamento(); });
      await attendiQuiete(t.stato, 1500);
      const nuova = psql("select id || '|' || condizioni::text from public.regole_smistamento where nome = 'PROVA F15.13 vernice esterno' order by id desc limit 1");
      if (!/"campo": "ambiente"/.test(nuova) || !/"valore": "esterno"/.test(nuova)) KO('4: regola nuova: ' + nuova + ' ' + await toastTesto(t));
      else righe.push('   ➕ Aggiungi regola: salvata ' + nuova.split('|')[1]);
      const idNuova = Number(nuova.split('|')[0]);
      await t.page.evaluate(async id => { await cambiaAttivaRegolaSmistamento(id, false); }, idNuova);
      await attendiQuiete(t.stato, 1200);
      await t.page.evaluate(async () => { await apriRegistroSmistamento(); });
      await attendiQuiete(t.stato, 1200);
      const reg = await testoPagina(t, '#rgr-elenco');
      if (!/Disattivata/.test(reg) || !/Creata/.test(reg) || !/PROVA F15.13/.test(reg)) KO('4: registro: ' + reg.slice(0, 300));
      else righe.push('   ⏸ Disattiva e 📒 Registro: "Creata" e "Disattivata" con chi e quando');
      await t.page.screenshot({ path: path.join(CARTELLA_OUT, '4-registro.png') });
    }
    await chiudi(t);

    // 5. Regole spente: come prima ------------------------------------------
    if (!SENZA) {
      psql('update public.regole_smistamento set attiva = false');
      psql("update public.progetti_tecnici set stato = 'bozza', importo_stimato = 8000 where id = " + q(progettoId));
      const r5 = await apriSito(browser, url); sessioni.push(r5);
      await login(r5, rap);
      await r5.page.evaluate(() => gotoPage('progetti'));
      await attendiQuiete(r5.stato, 1500);
      const carta5 = await cartaProgetto(r5, progettoId);
      if (!/Invia ad Acquisti/.test(carta5) || !/Richiedi verifica tecnica/.test(carta5) || /Invia il progetto/.test(carta5)) KO('5: regole spente: ' + carta5.replace(/\s+/g, ' ').slice(0, 300));
      else righe.push('5. regole spente: di nuovo "🔧 Richiedi verifica tecnica" e "📤 Invia ad Acquisti"');
      const d5 = await inviaE(r5, 'inviaProgettoAlCommerciale', progettoId);
      if (statoProgetto() !== 'inviato_a_commerciale') KO('5: invio ad Acquisti con le regole spente: ' + statoProgetto() + ' ' + d5);
      else righe.push('   "📤 Invia ad Acquisti" come prima: inviato');
      await chiudi(r5);
    }

    // 6. Regole spente (o senza sql/83): preventivo in bozza con il progetto in
    //    verifica tecnica SENZA schede gialle → "↩ Rimanda indietro" c'è come prima
    {
      if (!SENZA) psql('update public.regole_smistamento set attiva = false');
      psql("update public.progetti_tecnici set stato = 'in_verifica_tecnica' where id = " + q(progettoId));
      const idPrev6 = psql("with x as (insert into public.preventivi (cliente_id, commerciale_id, rappresentante_id, progetto_tecnico_id, tipo, origine, totale_imponibile, sconto_perc, iva_perc, stato) " +
        "select cliente_id, " + q(com.id) + ", rappresentante_id, id, 'fornitura_e_posa', 'progetto_tecnico', 0, 0, 22, 'bozza' from public.progetti_tecnici where id = " + q(progettoId) + " returning id) select id from x");
      const c6 = await apriSito(browser, url); sessioni.push(c6);
      await login(c6, com);
      await c6.page.evaluate(async id => { await openPreventivoDetail(id); }, idPrev6);
      await attendiQuiete(c6.stato, 1500);
      const r6 = await c6.page.evaluate(() => ({
        testo: (document.getElementById('pg-preventivo-detail') || document.body).innerText,
        bottone: [...document.querySelectorAll('button')].some(b => b.offsetParent && /↩ Rimanda indietro$/.test(b.textContent.trim()))
      }));
      if (!r6.bottone || /non è disponibile/.test(r6.testo) || /smistamento automatico/i.test(r6.testo)) KO('6: regole spente, progetto in verifica: bottone ' + r6.bottone);
      else righe.push('6. ' + (SENZA ? 'senza sql/83' : 'regole spente') + ': preventivo con il progetto in verifica tecnica, "↩ Rimanda indietro" c’è come prima');
      await c6.page.screenshot({ path: path.join(CARTELLA_OUT, '6-rimanda-regole-spente.png'), fullPage: true });
      await chiudi(c6);
    }

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(x => (x.status >= 500 || /does not exist|Could not find/i.test(x.msg)) &&
        !(SENZA && /regole_smistamento|smistamento/.test(x.dove + x.msg)));
      if (rete.length) KO('errori del database: ' + rete.map(x => x.metodo + ' ' + x.dove + ' ' + x.status + ' ' + x.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    try {
      psql('delete from public.preventivi where progetto_tecnico_id = ' + q(progettoId) + ' and creato_il >= ' + q(inizio));
      psql('update public.progetti_tecnici set stato = ' + q(statoPartenza) + ', fonte_rilievo = ' + (fontePartenza ? q(fontePartenza) : 'null') +
        ', importo_stimato = ' + (importoPartenza ? importoPartenza : 'null') + ' where id = ' + q(progettoId));
      psql("delete from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and creato_il >= " + q(inizio));
      psql("delete from public.progetti_tecnici_allegati where progetto_id = " + q(progettoId) + " and caricato_il >= " + q(inizio));
      if (!SENZA) {
        // solo database locale: gli avvisi di prova si tolgono (la matrice dei permessi conta le righe vere)
        psql("delete from public.avvisi where tipo = 'smistamento_verificato' and rif_id = " + q(progettoId) + " and creato_il >= " + q(inizio));
        regolePartenza.forEach(x => { const [id, a] = x.split(':'); psql('update public.regole_smistamento set attiva = ' + (a === 't' || a === 'true') + ' where id = ' + id); });
        // solo database locale: la regola di prova si toglie con il suo registro
        // (il registro non si cancella dal sito: qui i trigger sono spenti per la sola pulizia)
        psql("set session_replication_role = replica; delete from public.regole_smistamento_storico where regola_id in (select id from public.regole_smistamento where nome like 'PROVA F15.13%'); delete from public.regole_smistamento where nome like 'PROVA F15.13%'");
      }
      if (docSpenti.length) psql('update public.lavorazioni_documenti set attivo = true where id in (' + docSpenti.join(',') + ')');
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
