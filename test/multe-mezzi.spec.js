#!/usr/bin/env node
// F17.13 mezzo fermo e multe (sql/129 + js/81), Chrome headless, SOLO DATABASE LOCALE.
// Fatto quando: una multa del 10/03 su un furgone che era nella squadra del tecnico X propone X
// come conducente e ha la scadenza del 09/05; la segreteria la registra dal box della squadra
// (390 px), la riga di Cosa tocca a me compare, l'addebito lo decide solo il titolare; il capo
// tecnico segna il furgone fermo e la squadra del giorno lo mostra con l'avviso; il tecnico è
// rifiutato dal database. Uso: cd test && node multe-mezzi.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.MULTE_DOWNLOAD || CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-multe-mezzi');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA MULTE';
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
  if (psql("select to_regprocedure('public.mezzi_multe_attive()') is not null") !== 't') fermati('sql/129 non eseguito nel database locale');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const seg = primo('segreteria'), tit = primo('titolare'), ct = primo('capo_tecnico'), tec = primo('tecnico');
  const comm = psql("select id from public.commesse where stato not in ('chiusa','annullata') order by creato_il limit 1");
  // dati di prova: furgone e squadra del 10/03/2026 con il tecnico X
  psql("insert into public.mezzi_attrezzature (nome, tipo, targa_matricola) values ('Furgone PROVA MULTE', 'mezzo', 'ZZ999ZZ')");
  const mezzo = psql("select id from public.mezzi_attrezzature where nome = 'Furgone PROVA MULTE'");
  psql("insert into public.commesse_squadra_giorni (commessa_id, data) values (" + q(comm) + ", '2026-03-10') on conflict do nothing");
  const giorno = psql("select id from public.commesse_squadra_giorni where commessa_id = " + q(comm) + " and data = '2026-03-10'");
  psql("insert into public.commesse_squadra_mezzi values (" + q(giorno) + ", " + q(mezzo) + ")");
  psql("insert into public.commesse_squadra_persone (giorno_id, utente_id) values (" + q(giorno) + ", " + q(tec.id) + ")");
  const nomeTec = [tec.nome, tec.cognome].filter(Boolean).join(' ');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    // 1. segreteria a 390 px
    let s = await sessioneCome(browser, url, seg, 390); sessioni.push(s);
    await apriCommessa(s, comm);
    await s.page.evaluate(() => { const t = [...document.querySelectorAll('button')].find(b => /Cantiere/.test(b.textContent) && b.offsetParent); if (t) t.click(); });
    await attendiQuiete(s.stato, 2000);
    const bottone = await s.page.$('[data-mezzi-multe-box]');
    if (!bottone) KO('segreteria: manca "🚐 Mezzi: fermo e multe" nel box della squadra');
    else { await bottone.click(); righe.push('segreteria (390 px): "🚐 Mezzi: fermo e multe" nel box della squadra'); }
    await attendiQuiete(s.stato, 1000);
    await s.page.evaluate(id => document.querySelector('button[data-mezzo-multe][onclick*="' + id + '"]').click(), mezzo);
    await attendiQuiete(s.stato, 1500);
    await s.page.evaluate(() => apriMulta(null));
    await s.page.evaluate(id => { ge('mlt-mezzo').value = id; ge('mlt-data').value = '2026-03-10'; ge('mlt-luogo').value = 'Pisa, via Aurelia'; ge('mlt-importo').value = '42,00'; }, mezzo);
    await s.page.evaluate(() => proponiConducenteMulta());
    await attendiQuiete(s.stato, 1000);
    const proposta = await s.page.evaluate(() => ({ testo: ge('mlt-proposto').innerText, scelto: ge('mlt-conducente').value, addebito: ge('mlt-addebito').disabled }));
    if (proposta.scelto !== tec.id || !proposta.testo.includes(nomeTec)) KO('conducente proposto: ' + JSON.stringify(proposta));
    else righe.push('multa del 10/03: proposto il tecnico ' + nomeTec + ' («' + proposta.testo.slice(0, 60) + '…»)');
    if (!proposta.addebito) KO('la segreteria può scegliere l\'addebito');
    await s.page.screenshot({ path: path.join(CARTELLA_OUT, 'segreteria-multa-390.png') });
    await s.page.evaluate(() => salvaMulta());
    await attendiQuiete(s.stato, 1500);
    const m1 = psql("select id || '|' || scadenza_comunicazione || '|' || coalesce(conducente_nome, '') || '|' || importo from public.mezzi_multe where mezzo_id = " + q(mezzo)).split('|');
    if (m1[1] !== '2026-05-09' || m1[3] !== '42.00') KO('multa salvata: ' + m1.join('|'));
    else righe.push('salvata: scadenza 09/05/2026, conducente ' + m1[2] + ', 42,00 €');
    const vista = await s.page.evaluate(() => ge('mlt-elenco').innerText);
    if (!/Comunicare il conducente entro il 09\/05\/2026/.test(vista)) KO('elenco: ' + vista.slice(0, 200));
    await chiudi(s);
    s = await sessioneCome(browser, url, seg, 390); sessioni.push(s);
    await attendiQuiete(s.stato, 3000);
    const tam = await s.page.evaluate(() => document.body.innerText);
    if (!/Multe: conducente da comunicare/.test(tam)) KO('Cosa tocca a me della segreteria senza la riga delle multe');
    else righe.push('Cosa tocca a me della segreteria: "Multe: conducente da comunicare"');
    await chiudi(s);
    // 2. titolare decide l'addebito
    s = await sessioneCome(browser, url, tit, 1280); sessioni.push(s);
    await s.page.evaluate(() => apriMulteMezzo(null));
    await attendiQuiete(s.stato, 1500);
    await s.page.evaluate(id => { apriMulta(id); ge('mlt-addebito').value = 'conducente'; ge('mlt-comunicato').value = '2026-03-20'; }, m1[0]);
    await s.page.evaluate(() => salvaMulta());
    await attendiQuiete(s.stato, 1500);
    const add = psql("select coalesce(addebito, '') || '|' || coalesce(addebito_da_nome, '') from public.mezzi_multe where id = " + q(m1[0]));
    if (!add.startsWith('conducente|') || add.endsWith('|')) KO('addebito del titolare: ' + add); else righe.push('titolare: addebito al conducente (' + add.split('|')[1] + ')');
    await chiudi(s);
    // 3. capo tecnico: fermo e squadra del giorno
    s = await sessioneCome(browser, url, ct, 390); sessioni.push(s);
    await apriCommessa(s, comm);
    await s.page.evaluate(() => apriElencoMezzi());
    await attendiQuiete(s.stato, 800);
    await s.page.evaluate(id => apriFermoMezzo(id), mezzo);
    await s.page.evaluate(() => { ge('mzf-causa').value = 'In officina: frizione'; if (ge('mzf-stato-box').style.display !== 'none') ge('mzf-stato').value = 'fuori_uso'; });
    await s.page.evaluate(() => salvaFermoMezzo(false));
    await attendiQuiete(s.stato, 1500);
    const fermo = psql("select coalesce(fermo_causa, '') from public.mezzi_attrezzature where id = " + q(mezzo));
    const elenco = await s.page.evaluate(() => ge('mza-elenco').innerText);
    if (fermo !== 'In officina: frizione' || !/(Fermo|Fuori uso) dal/.test(elenco)) KO('fermo: ' + fermo + ' / ' + elenco.slice(0, 200));
    else righe.push('capo tecnico (390 px): furgone segnato fermo «In officina: frizione»');
    await s.page.evaluate(() => { closeM('m-mezzi-attrezzature'); apriGiornoSquadra(); });
    await attendiQuiete(s.stato, 1500);
    const sq = await s.page.evaluate(id => { const el = document.querySelector('#m-squadra-giorno .sq-scelta[data-id="' + id + '"]'); return el ? el.innerText : null; }, mezzo);
    if (!sq || !/(Fermo|Fuori uso) dal/.test(sq)) KO('squadra del giorno senza avviso del fermo: ' + sq); else righe.push('squadra del giorno: il furgone ha l\'avviso «' + sq.split('\n').find(x => /Fermo|Fuori uso/.test(x)) + '»');
    await s.page.screenshot({ path: path.join(CARTELLA_OUT, 'capo-tecnico-squadra-fermo-390.png') });
    await chiudi(s);
    // 4. console: tecnico rifiutato, segreteria che decide l'addebito rifiutata
    try { await rest('/mezzi_multe', tokenDi(tec), { metodo: 'POST', corpo: { mezzo_id: mezzo, data_infrazione: '2026-03-10' } }); KO('il tecnico ha registrato una multa da console'); }
    catch (e) { righe.push('console del tecnico: rifiutata (' + e.message.slice(0, 60) + ')'); }
    try { await rest('/mezzi_multe?id=eq.' + m1[0], tokenDi(seg), { metodo: 'PATCH', corpo: { addebito: 'azienda' } }); KO('la segreteria ha cambiato l\'addebito da console'); }
    catch (e) { righe.push('console della segreteria sull\'addebito: rifiutata (' + e.message.slice(0, 60) + ')'); }
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
      psql("alter table public.mezzi_multe disable trigger trg_registro_azioni");
      psql("delete from public.mezzi_multe where mezzo_id = " + q(mezzo));
      psql("alter table public.mezzi_multe enable trigger trg_registro_azioni");
      psql("delete from public.commesse_squadra_mezzi where mezzo_id = " + q(mezzo));
      psql("delete from public.commesse_squadra_persone where giorno_id = " + q(giorno));
      psql("delete from public.commesse_squadra_giorni where id = " + q(giorno));
      psql("alter table public.mezzi_attrezzature disable trigger trg_registro_azioni");
      psql("delete from public.mezzi_attrezzature where id = " + q(mezzo));
      psql("alter table public.mezzi_attrezzature enable trigger trg_registro_azioni");
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
