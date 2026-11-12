#!/usr/bin/env node
// "Quantità x UM" nelle voci del preventivo e campi numerici vuoti invece di
// "0,00" (richieste di Erika del 12/11, sql/265, js/18), Chrome headless con
// puppeteer-core, SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh,
// container toli-smoke-db). Il "fatto quando":
//  1. Acquisti apre la sua bozza (una voce con quantità 2 e prezzi a 0): i
//     campi "Costo unitario interno" e "Prezzo unitario cliente" sono VUOTI
//     (non "0,00"), la quantità mostra 2, "Totale cliente" della riga 0,00 €;
//     la voce nuova propone quantità 1 e prezzi vuoti; cancellando un campo
//     e uscendo (blur) resta vuoto, anche scrivendo 0;
//  2. CON sql/265: "Quantità (pz)" e accanto all'unità di misura "Quantità x
//     UM" (testo libero, nasce vuota); voce nuova m³, Quantità (pz) 3, prezzo
//     100, Quantità x UM "2,5": totale riga e imponibile 300 (nessun calcolo
//     sulla nuova), "💾 Salva preventivo" = nel database quantita 3,
//     prezzo 100, quantita_um '2,5', prezzi vuoti salvati a 0,
//     totale_imponibile 300;
//  3. PDF del cliente: colonne "Q.tà (pz)" e "Q.tà x UM": la voce nuova 3 e
//     2,5, la voce senza la colonna vuota; con dati esterni (js/69) anche;
//  4. SENZA sql/265 (rilevato da solo, o QUANTITA_UM_SENZA_SQL=1 per
//     pretenderlo): nessun campo "Quantità x UM", salvataggio senza la
//     colonna, PDF con le due colonne e "Q.tà x UM" vuota, nessuna richiesta
//     in errore.
// Alla fine il preventivo di prova si toglie (solo database locale).
// I download vanno in QUANTITA_UM_DOWNLOAD (predefinita: $TMPDIR/toli-voci-quantita-um).
// Uso: cd test && node voci-quantita-um.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.QUANTITA_UM_DOWNLOAD || path.join(os.tmpdir(), 'toli-voci-quantita-um');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA QUANTITA X UM';
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

function attendiDownload(cartella, prima, ms) {
  return new Promise((ok, ko) => {
    const t0 = Date.now();
    const giro = () => {
      const nuovi = fs.readdirSync(cartella).filter(f => f.endsWith('.pdf') && !prima.includes(f));
      if (nuovi.length) return setTimeout(() => ok(nuovi[0]), 400);
      if (Date.now() - t0 > ms) return ko(new Error('nessun PDF scaricato'));
      setTimeout(giro, 200);
    };
    giro();
  });
}
// Contenuto delle pagine del PDF (jsPDF non comprime): senza data di
// creazione, identificativo e nome del file, che cambiano a ogni PDF.
function contenutoPdf(testo) {
  return testo.split(/\r?\n/).filter(r => !/CreationDate|ModDate|^\/ID |Preventivo_\d+_Toli_Fire_\d+/.test(r))
    .map(r => r.replace(/generato il \d\d\/\d\d\/\d{4}, \d\d:\d\d:\d\d/, 'generato il <data>')).join('\n');
}
const indice = (testo, x) => testo.indexOf(x);

async function apriEditor(s, preventivoId) {
  await s.page.evaluate(async id => { await openPreventivoDetail(id); }, preventivoId);
  await attendiQuiete(s.stato, 1200);
  await s.page.evaluate(() => { const t = [...document.querySelectorAll('#pg-preventivo-detail .tab')].find(x => /pvd-costi/.test(x.getAttribute('onclick') || '')); if (t) t.click(); });
  await s.page.waitForSelector('#pvv-note-cliente', { timeout: 20000 });
  await attendiQuiete(s.stato, 600);
}
async function scrivi(s, sel, testo) {
  await s.page.evaluate((sel, testo) => { const el = document.querySelector(sel); el.value = testo; el.dispatchEvent(new Event('input', { bubbles: true })); }, sel, testo);
}
async function generaPdf(s, cartella) {
  const prima = fs.readdirSync(cartella);
  await s.page.evaluate(() => { const b = [...document.querySelectorAll('#pvd-costi-content button')].find(x => /generaPreventivoClientePDF/.test(x.getAttribute('onclick') || '')); b.click(); });
  const nome = await attendiDownload(cartella, prima, 25000);
  await attendiQuiete(s.stato, 600);
  return fs.readFileSync(path.join(cartella, nome)).toString('latin1').replace(/\\/g, '');
}


// Testi del PDF in ordine (jsPDF non comprime: "(testo) Tj").
function testiPdf(grezzo) {
  const out = [];
  const re = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let m;
  while ((m = re.exec(grezzo))) out.push(m[1].replace(/\\(.)/g, '$1').trim());
  return out;
}
async function generaPdfGrezzo(s, cartella) {
  const prima = fs.readdirSync(cartella);
  await s.page.evaluate(() => { const b = [...document.querySelectorAll('#pvd-costi-content button')].find(x => /generaPreventivoClientePDF/.test(x.getAttribute('onclick') || '')); b.click(); });
  const nome = await attendiDownload(cartella, prima, 25000);
  await attendiQuiete(s.stato, 600);
  return fs.readFileSync(path.join(cartella, nome)).toString('latin1');
}
const salva = s => s.page.evaluate(() => { const b = [...document.querySelectorAll('#pvd-costi-content button')].find(x => /salvaVociPreventivo/.test(x.getAttribute('onclick') || '')); b.click(); });
// valori dei campi della voce n (0, 1...)
const campiVoce = (s, n) => s.page.evaluate(n => {
  const card = [...document.querySelectorAll('#pvd-costi-content .card')].filter(c => /Voce \d+/.test(c.innerText))[n];
  if (!card) return null;
  const v = sel => { const el = card.querySelector(sel); return el ? el.value : null; };
  const etichette = [...card.querySelectorAll('label')].map(l => l.textContent.trim());
  return { quantita: v('.pvv-quantita'), costo: v('.pvv-costo'), prezzo: v('.pvv-prezzo'), qum: v('.pvv-quantita-um'),
    etichette, totaleRiga: (card.querySelector('[id^="pvv-vendita-riga-"]') || {}).textContent || '' };
}, n);
// scrive come l'utente: svuota, scrive, esce dal campo
async function scriviCampo(s, n, classe, testo) {
  await s.page.evaluate((n, classe) => {
    const card = [...document.querySelectorAll('#pvd-costi-content .card')].filter(c => /Voce \d+/.test(c.innerText))[n];
    const el = card.querySelector(classe); el.focus(); el.select();
  }, n, classe);
  await s.page.keyboard.press('Backspace');
  if (testo) await s.page.keyboard.type(testo);
  await s.page.evaluate(() => document.activeElement && document.activeElement.blur());
  await attendi(150);
}
const VOCE1 = 'VOCEQUM-1 Assistenza muraria';
const VOCE2 = 'VOCEQUM-2 Sigillatura EI 120';

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const DOWNLOAD = path.join(CARTELLA_OUT, 'download');
  fs.mkdirSync(DOWNLOAD, { recursive: true });
  fs.readdirSync(DOWNLOAD).filter(f => f.endsWith('.pdf')).forEach(f => fs.unlinkSync(path.join(DOWNLOAD, f)));
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const conSql = psql("select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'preventivi_voci' and column_name = 'quantita_um')") === 't';
  if (CONF.QUANTITA_UM_SENZA_SQL === '1' && conSql) fermati('QUANTITA_UM_SENZA_SQL=1 ma sql/265 è nel database locale (eseguire il -ROLLBACK)');
  righe.push(conSql ? 'database locale CON sql/265' : 'database locale SENZA sql/265');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const com = primo('commerciale');
  if (!com) fermati('serve un utente Acquisti attivo');

  const cliente = psql("select id || '|' || ragione_sociale from public.clienti where eliminato_il is null order by ragione_sociale limit 1").split('|');
  const prevId = psql("insert into public.preventivi (cliente_id, commerciale_id, stato, totale_imponibile, iva_perc) values (" + q(cliente[0]) + ", " + q(com.id) + ", 'bozza', 0, 22) returning id").split('\n')[0];
  psql("insert into public.preventivi_voci (preventivo_id, categoria, descrizione, unita_misura, quantita, costo_unitario, prezzo_unitario, ordinamento) values (" +
    q(prevId) + ", 'servizio', " + q(VOCE1) + ", 'pz', 2, 0, 0, 0)");
  righe.push('preparato: bozza di Acquisti (' + com.email + ') con una voce da 2 pz e prezzi a 0');

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  let s;
  try {
    s = await apriSito(browser, url);
    const cdp = await s.page.target().createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD });
    await login(s, com);
    await apriEditor(s, prevId);

    // 1. campi vuoti invece di 0,00
    let c1 = await campiVoce(s, 0);
    if (!c1 || c1.quantita !== '2' || c1.costo !== '' || c1.prezzo !== '') KO('voce con prezzi a 0: ' + JSON.stringify(c1));
    else righe.push('voce esistente: quantità "2", costo e prezzo vuoti (non "0,00")');
    if (!/0,00/.test(c1 && c1.totaleRiga || '')) KO('totale della riga senza 0,00: ' + (c1 && c1.totaleRiga));
    else righe.push('totale della riga: "' + c1.totaleRiga.replace(/\s/g, ' ') + '"');
    const etichetteOk = c1 && c1.etichette.includes('Quantità (pz)');
    if (!etichetteOk) KO('manca l\'etichetta "Quantità (pz)": ' + JSON.stringify(c1 && c1.etichette));
    const conCampo = c1 && c1.etichette.includes('Quantità x UM');
    if (conSql && (!conCampo || c1.qum !== '')) KO('con sql/265 manca "Quantità x UM" vuota: ' + JSON.stringify(c1));
    if (!conSql && (conCampo || c1.qum !== null)) KO('senza sql/265 il campo "Quantità x UM" non deve esserci');
    righe.push(conSql ? 'editor: "Quantità (pz)" e "Quantità x UM" (vuota)' : 'editor: "Quantità (pz)", nessun campo "Quantità x UM"');

    await scriviCampo(s, 0, '.pvv-prezzo', '12');
    await scriviCampo(s, 0, '.pvv-prezzo', '');
    c1 = await campiVoce(s, 0);
    if (c1.prezzo !== '') KO('prezzo cancellato: dopo l\'uscita dal campo «' + c1.prezzo + '»');
    await scriviCampo(s, 0, '.pvv-costo', '0');
    c1 = await campiVoce(s, 0);
    if (c1.costo !== '') KO('costo 0: dopo l\'uscita dal campo «' + c1.costo + '»');
    else righe.push('cancellato il prezzo e scritto 0 nel costo: dopo l\'uscita i campi restano vuoti');

    await s.page.evaluate(() => aggiungiVocePreventivo());
    await attendi(300);
    let c2 = await campiVoce(s, 1);
    if (!c2 || c2.quantita !== '1' || c2.costo !== '' || c2.prezzo !== '' || (conSql && c2.qum !== '')) KO('voce nuova: ' + JSON.stringify(c2));
    else righe.push('voce nuova: quantità 1, costo e prezzo vuoti' + (conSql ? ', Quantità x UM vuota' : ''));

    // 2. voce nuova: m³, 3 pz, 100 €, 2,5
    await s.page.evaluate(d => {
      const card = [...document.querySelectorAll('#pvd-costi-content .card')].filter(c => /Voce \d+/.test(c.innerText))[1];
      const txt = [...card.querySelectorAll('input[type="text"]')];
      const desc = txt.find(i => /Fornitura porta/.test(i.placeholder || ''));
      const um = txt.find(i => /pz, ora/.test(i.placeholder || ''));
      desc.value = d; desc.dispatchEvent(new Event('input', { bubbles: true }));
      um.value = 'm³'; um.dispatchEvent(new Event('input', { bubbles: true }));
    }, VOCE2);
    await scriviCampo(s, 1, '.pvv-quantita', '3');
    await scriviCampo(s, 1, '.pvv-prezzo', '100');
    if (conSql) await scriviCampo(s, 1, '.pvv-quantita-um', '2,5');
    c2 = await campiVoce(s, 1);
    if (conSql && c2.qum !== '2,5') KO('Quantità x UM scritta: «' + c2.qum + '»');
    if (!/300,00/.test(c2.totaleRiga)) KO('totale della riga ' + c2.totaleRiga + ' (atteso 300,00: 3 × 100, nessun calcolo su 2,5)');
    else righe.push('totale della riga 300,00 € (3 pz × 100 €; 2,5 non entra nel calcolo)');
    const imponibile = await s.page.evaluate(() => (document.getElementById('pvv-totale-vendita') || {}).textContent || '');
    if (!/300,00/.test(imponibile)) KO('imponibile ' + imponibile);
    await s.page.screenshot({ path: path.join(CARTELLA_OUT, 'editor-' + (conSql ? 'con' : 'senza') + '-sql265.png'), fullPage: false });

    await salva(s);
    await attendiQuiete(s.stato, 1200);
    const salvate = psql("select string_agg(descrizione || '|' || quantita::numeric(10,2) || '|' || costo_unitario::numeric(10,2) || '|' || prezzo_unitario::numeric(10,2)" +
      (conSql ? " || '|' || coalesce(quantita_um, '<null>')" : '') + ", ' ## ' order by ordinamento) || ' TOT ' || (select totale_imponibile::numeric(10,2) from public.preventivi where id = " + q(prevId) + ")" +
      " from public.preventivi_voci where preventivo_id = " + q(prevId));
    const attese = VOCE1 + '|2.00|0.00|0.00' + (conSql ? '|<null>' : '') + ' ## ' + VOCE2 + '|3.00|0.00|100.00' + (conSql ? '|2,5' : '') + ' TOT 300.00';
    if (salvate !== attese) KO('salvate: «' + salvate + '» attese «' + attese + '»');
    else righe.push('salvato: ' + salvate);

    // riaperto: stessi campi
    await apriEditor(s, prevId);
    c1 = await campiVoce(s, 0); c2 = await campiVoce(s, 1);
    if (c1.costo !== '' || c1.prezzo !== '' || c2.quantita !== '3' || c2.prezzo !== '100,00' || (conSql && c2.qum !== '2,5')) KO('riaperto: ' + JSON.stringify([c1, c2]));
    else righe.push('riaperto: prezzi a 0 vuoti, voce nuova 3 / 100,00' + (conSql ? ' / 2,5' : ''));

    // 3. PDF
    const pdf = testiPdf(await generaPdfGrezzo(s, DOWNLOAD));
    const iTesta = pdf.indexOf('Q.tà (pz)');
    if (iTesta < 0 || pdf[iTesta + 1] !== 'U.M.' || pdf[iTesta + 2] !== 'Q.tà x UM') KO('intestazione del PDF: ' + JSON.stringify(pdf.slice(Math.max(0, iTesta - 1), iTesta + 5)));
    else righe.push('PDF: colonne ' + pdf.slice(iTesta - 1, iTesta + 5).join(' | '));
    const i1 = pdf.indexOf(VOCE1), i2 = pdf.indexOf(VOCE2);
    const r1 = pdf.slice(i1 + 1, i1 + 4), r2 = pdf.slice(i2 + 1, i2 + 5);
    if (i1 < 0 || r1[0] !== '2' || r1[1] !== 'pz' || !/0,00/.test(r1[2])) KO('PDF, voce senza: ' + JSON.stringify(r1) + ' (attesa Q.tà x UM vuota)');
    else righe.push('PDF voce 1: ' + r1.join(' | ') + ' (Q.tà x UM vuota)');
    const attesaR2 = conSql ? ['3', 'm³', '2,5'] : ['3', 'm³'];
    if (i2 < 0 || attesaR2.some((x, k) => r2[k] !== x) || (!conSql && !/100,00/.test(r2[2]))) KO('PDF, voce nuova: ' + JSON.stringify(r2));
    else righe.push('PDF voce 2: ' + r2.join(' | '));

    // PDF con dati esterni (js/69 con dati_pdf_preventivo_cliente)
    const primaEsterno = fs.readdirSync(DOWNLOAD);
    const esterno = await s.page.evaluate(async () => {
      const r = await generaPreventivoClientePDF({ preventivo: { id: null, numero: 998, tipo: 'fornitura_e_posa', iva_perc: 22, totale_imponibile: 300,
        sconto_perc: 0, note: null, condizioni_pagamento: null, clienti: { ragione_sociale: 'Cliente esterno' } },
        voci: [{ descrizione: 'ESTERNA-1', unita_misura: 'm²', quantita: 3, quantita_um: '12 m²', prezzo_unitario: 100 },
               { descrizione: 'ESTERNA-2', unita_misura: 'pz', quantita: 1, prezzo_unitario: 10 }] });
      if (!r || !r.blob) return '';
      const b = new Uint8Array(await r.blob.arrayBuffer());
      let t = ''; for (let k = 0; k < b.length; k++) t += String.fromCharCode(b[k]);
      return t;
    });
    await attendiDownload(DOWNLOAD, primaEsterno, 20000).catch(() => null);
    const te = testiPdf(esterno);
    const e1 = te.indexOf('ESTERNA-1'), e2 = te.indexOf('ESTERNA-2');
    if (e1 < 0 || te[e1 + 3] !== '12 m²' || e2 < 0 || !/10,00/.test(te[e2 + 3])) KO('PDF con dati esterni: ' + JSON.stringify([te.slice(e1, e1 + 5), te.slice(e2, e2 + 5)]));
    else righe.push('PDF con dati esterni: "12 m²" stampato così com\'è, voce senza vuota');

    if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
    const rete = s.stato.rete.filter(r => !/sconto_rappresentante_attivo/.test(r.dove)
      && (r.status >= 500 || /does not exist|Could not find|quantita_um/i.test(r.msg) || (r.status >= 400 && /^\/preventivi/.test(r.dove))));
    if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
    else righe.push('nessuna richiesta in errore');
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    if (s) await chiudi(s);
    await browser.close();
    srv.close();
    try {
      psql("delete from public.preventivi_voci where preventivo_id = " + q(prevId));
      psql("delete from public.preventivi where id = " + q(prevId));
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Download e schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
