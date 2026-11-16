#!/usr/bin/env node
// F18.14 noli e attrezzature (sql/141 + js/83 + js/81), Chrome headless, SOLO DATABASE LOCALE.
// Un nolo che scade dopodomani compare al capo tecnico; proroga con motivo; scaduto compare ad
// Acquisti che lo segna restituito; il titolare toglie la restituzione sbagliata; un trapano
// segnato fuori uso (guasto dal cantiere) con persona e posto compare con l'avviso rosso nella
// squadra del giorno; tecnico e segreteria rifiutati dal database dove non possono.
// Uso: cd test && node noli-attrezzature.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.NOLI_DOWNLOAD || CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-noli-attrezzature');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA NOLI';
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


async function chiudi(s) { if (s.chiuso) return; s.chiuso = true; try { await s.contesto.close(); } catch (e) { /* già chiuso */ } }
const q = s => "'" + String(s).replace(/'/g, "''") + "'";





async function sessioneCome(browser, url, u, largo) {
  const s = await apriSito(browser, url);
  await s.page.setViewport({ width: largo, height: 900 });
  await login(s, u);
  return s;
}

async function apriCommessa(s, id) {
  await s.page.evaluate(async x => { await openCommessaDetail(x); }, id);
  await attendiQuiete(s.stato, 2500);
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  if (psql("select to_regprocedure('public.noli_restituzione_attiva()') is not null") !== 't') fermati('sql/141 non eseguito nel database locale');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const tit = primo('titolare'), seg = primo('segreteria'), ct = primo('capo_tecnico'), tec = primo('tecnico'), com = primo('commerciale');
  const comm = psql("select id from public.commesse where stato not in ('chiusa','annullata') order by creato_il limit 1");
  psql("insert into public.commesse_richieste_integrazione (commessa_id, numero, tipo, descrizione, unita_misura, serve_dal, nolo_fino_al, stato, arrivo_previsto, data_arrivo, richiesta_il) values (" + q(comm) + ", 9911, 'nolo', 'Piattaforma PLE 12 m PROVA NOLI', 'giorni', current_date - 10, current_date + 2, 'arrivata', current_date - 10, current_date - 10, now() - interval '12 days')");
  const nolo = psql("select id from public.commesse_richieste_integrazione where commessa_id = " + q(comm) + " and numero = 9911");
  psql("insert into public.mezzi_attrezzature (nome, tipo) values ('Trapano PROVA NOLI', 'attrezzatura')");
  const trapano = psql("select id from public.mezzi_attrezzature where nome = 'Trapano PROVA NOLI'");
  const nomeTec = [tec.nome, tec.cognome].filter(Boolean).join(' ');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const rigaNolo = s => s.page.evaluate(id => { const b = [...document.querySelectorAll('#cmd-richieste [data-nolo-restituzione] button, #cmd-richieste .bx')].find(x => x.closest('div[style*="border-bottom"]') && x.closest('div[style*="border-bottom"]').innerText.includes('PROVA NOLI')); const r = b && b.closest('div[style*="border-bottom"]'); return r ? r.innerText : ''; }, nolo);
  try {
    // 1. capo tecnico a 390 px: avviso e proroga
    let s = await sessioneCome(browser, url, ct, 390); sessioni.push(s);
    await attendiQuiete(s.stato, 3000);
    let t = await s.page.evaluate(() => document.body.innerText);
    if (!/Noli da restituire entro 2 giorni/.test(t)) KO('capo tecnico: manca la riga «Noli da restituire entro 2 giorni»'); else righe.push('capo tecnico (390 px): «Noli da restituire entro 2 giorni» in Cosa tocca a me');
    await apriCommessa(s, comm);
    let r = await rigaNolo(s);
    if (!/Da restituire entro il/.test(r)) KO('riga del nolo: ' + r.slice(0, 200)); else righe.push('riga del nolo: «Da restituire entro il …» con Restituito e Proroga');
    await s.page.evaluate(id => apriNolo(id, 'proroga'), nolo);
    await s.page.evaluate(() => { ge('nol-data').value = aggiungiGiorniNolo(dataLocaleISO(), 5); ge('nol-testo').value = 'Lavori in quota non finiti'; });
    await s.page.evaluate(() => salvaNolo());
    await attendiQuiete(s.stato, 2000);
    const p1 = psql("select (nolo_fino_al - current_date) || '|' || jsonb_array_length(proroghe) from public.commesse_richieste_integrazione where id = " + q(nolo));
    if (p1 !== '5|1') KO('proroga: ' + p1); else righe.push('📅 Proroga di 3 giorni con motivo: salvata con lo storico');
    const dett = await s.page.evaluate(() => (ge('cmd-richieste') || document.body).innerText);
    if (!/Prorogato .*Lavori in quota non finiti/.test(dett)) KO('dettagli senza la proroga');
    await s.page.screenshot({ path: path.join(CARTELLA_OUT, 'capo-tecnico-nolo-390.png') });
    // 2. trapano fuori uso, assegnato e posto
    await s.page.evaluate(() => apriElencoMezzi());
    await attendiQuiete(s.stato, 1500);
    await s.page.evaluate(id => apriFermoMezzo(id), trapano);
    await attendiQuiete(s.stato, 800);
    await s.page.evaluate(id => { ge('mzf-stato').value = 'fuori_uso'; cambiaStatoAttrezzatura(); ge('mzf-causa').value = 'Guasto segnalato dal cantiere'; ge('mzf-assegnata').value = id; ge('mzf-dove').value = 'Furgone Ducato'; }, tec.id);
    await s.page.screenshot({ path: path.join(CARTELLA_OUT, 'capo-tecnico-stato-trapano-390.png') });
    await s.page.evaluate(() => salvaFermoMezzo(false));
    await attendiQuiete(s.stato, 2000);
    const tr = psql("select stato || '|' || coalesce(fermo_causa,'') || '|' || coalesce(assegnata_a::text,'') || '|' || coalesce(dove,'') from public.mezzi_attrezzature where id = " + q(trapano)).split('|');
    if (tr[0] !== 'fuori_uso' || tr[2] !== tec.id || tr[3] !== 'Furgone Ducato') KO('trapano: ' + tr.join('|')); else righe.push('trapano: fuori uso «' + tr[1] + '», a ' + nomeTec + ', «Furgone Ducato»');
    const el = await s.page.evaluate(() => ge('mza-elenco').innerText);
    if (!/Fuori uso dal/.test(el) || !el.includes('Furgone Ducato')) KO('elenco attrezzature: ' + el.slice(0, 300)); else righe.push('elenco: «🛑 Fuori uso dal …» e «📍 Furgone Ducato»');
    await s.page.evaluate(() => { closeM('m-mezzi-attrezzature'); apriGiornoSquadra(); });
    await attendiQuiete(s.stato, 1500);
    const sq = await s.page.evaluate(id => { const e = document.querySelector('#m-squadra-giorno .sq-scelta[data-id="' + id + '"]'); return e ? e.innerText : ''; }, trapano);
    if (!/Fuori uso dal/.test(sq)) KO('squadra senza avviso: ' + sq); else righe.push('squadra del giorno: il trapano resta sceglibile con l\'avviso rosso');
    await chiudi(s);
    // 3. Acquisti: nolo scaduto, restituito
    psql("update public.commesse_richieste_integrazione set nolo_fino_al = current_date - 1 where id = " + q(nolo));
    s = await sessioneCome(browser, url, com, 1280); sessioni.push(s);
    await attendiQuiete(s.stato, 3000);
    t = await s.page.evaluate(() => document.body.innerText);
    if (!/Noli scaduti da restituire/.test(t)) KO('Acquisti: manca «Noli scaduti da restituire»'); else righe.push('Acquisti: «Noli scaduti da restituire» in Cosa tocca a me');
    await apriCommessa(s, comm);
    r = await rigaNolo(s);
    if (!/scaduto il/.test(r)) KO('riga del nolo scaduto: ' + r.slice(0, 200));
    await s.page.evaluate(id => apriNolo(id, 'restituito'), nolo);
    await s.page.evaluate(() => { ge('nol-testo').value = 'Ritirato dal noleggiatore'; });
    await s.page.evaluate(() => salvaNolo());
    await attendiQuiete(s.stato, 2000);
    const rest1 = psql("select coalesce(restituito_il::text,'') || '|' || coalesce(restituito_da_nome,'') from public.commesse_richieste_integrazione where id = " + q(nolo));
    if (!rest1.startsWith(psql('select current_date::text'))) KO('restituito: ' + rest1); else righe.push('Acquisti «↩️ Restituito»: oggi, da ' + rest1.split('|')[1]);
    r = await rigaNolo(s);
    if (!/Restituito il/.test(r)) KO('riga dopo la restituzione: ' + r.slice(0, 200));
    await chiudi(s);
    // 4. titolare toglie la restituzione
    s = await sessioneCome(browser, url, tit, 1280); sessioni.push(s);
    await apriCommessa(s, comm);
    await s.page.evaluate(id => togliRestituzioneNolo(id), nolo);
    await attendiQuiete(s.stato, 2000);
    const rest2 = psql("select coalesce(restituito_il::text,'') from public.commesse_richieste_integrazione where id = " + q(nolo));
    if (rest2 !== '') KO('il titolare non ha tolto la restituzione: ' + rest2); else righe.push('titolare «Togli (errore)»: il nolo torna da restituire');
    await chiudi(s);
    // 5. console
    try { await rest('/rpc/segna_nolo_restituito', tokenDi(tec), { metodo: 'POST', corpo: { p_richiesta_id: nolo } }); KO('il tecnico ha segnato il nolo restituito'); }
    catch (e) { righe.push('console del tecnico (restituito): rifiutata (' + e.message.slice(0, 50) + ')'); }
    try { await rest('/rpc/proroga_nolo', tokenDi(seg), { metodo: 'POST', corpo: { p_richiesta_id: nolo, p_fino_al: '2030-01-01', p_motivo: 'prova console' } }); KO('la segreteria ha prorogato il nolo'); }
    catch (e) { righe.push('console della segreteria (proroga): rifiutata (' + e.message.slice(0, 50) + ')'); }
    for (const x of sessioni) {
      if (x.stato.erroriJs.length) KO('errori JavaScript: ' + x.stato.erroriJs.join(' | '));
      const rete = x.stato.rete.filter(r => !/_attiv[oie]$|stati_fornitore_controlli|elimina_richiesta_acquisto/.test(r.dove) && (r.status >= 500 || /does not exist|Could not find/i.test(r.msg)));
      if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const x of sessioni) { try { if (!x.chiuso) await x.contesto.close(); } catch (e) { /* chiuso */ } }
    await browser.close();
    srv.close();
    try {
      psql("delete from public.commesse_richieste_integrazione where id = " + q(nolo));
      psql("alter table public.mezzi_attrezzature disable trigger trg_registro_azioni");
      psql("delete from public.mezzi_attrezzature where id = " + q(trapano));
      psql("alter table public.mezzi_attrezzature enable trigger trg_registro_azioni");
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
