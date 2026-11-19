#!/usr/bin/env node
// Dati di fatturazione del cliente quando parte la commessa (Erika, 19/11), SOLO DATABASE LOCALE.
// Cliente con P.IVA ma senza indirizzo, SDI, PEC e modalità di pagamento, con un preventivo in attesa di
// anticipo. Segreteria: riga rossa in Cosa tocca a me e cliente in cima a "Clienti da completare" con
// 🚀; "✏️ Completa" apre la finestra del cliente con i campi giusti (prima erano spostati) sulla parte
// Fatturazione; finestra "Emetti fattura d'anticipo" con i dati del cliente, avviso giallo, "✏️ Modifica
// dati del cliente", salvataggio e riquadro aggiornato senza perdere l'importo scritto.
// Uso: cd test && node fatturazione-segreteria.spec.js
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
// Data del browser fissa al 18/11/2026 (il tempo scorre da lì): fotografia uguale ogni giorno
const DATA_FISSA_JS = `(() => { const D = Date, fisso = D.parse('2026-11-18T10:00:00'), avvio = D.now();
  class DF extends D { constructor(...a) { if (a.length) super(...a); else super(fisso + (D.now() - avvio)); } static now() { return fisso + (D.now() - avvio); } }
  window.Date = DF; })();`;
const CHROME = CONF.SMOKE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CARTELLA_OUT = CONF.PROM_DOWNLOAD || CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-fatturazione-segreteria');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA PROM';
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
  await page.evaluateOnNewDocument(DATA_FISSA_JS);
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

const CLIENTE = 'FATTURAZIONE SEGRETERIA PROVA SRL';
function pulisci() {
  const cli = psql("select string_agg(id::text, ',') from public.clienti where ragione_sociale = " + q(CLIENTE));
  if (!cli) return;
  const lista = cli.split(',').map(q).join(',');
  psql("set session_replication_role = replica; delete from public.preventivi where cliente_id in (" + lista + ")");
  psql("delete from public.sedi_cliente where cliente_id in (" + lista + ")");
  psql("delete from public.clienti where id in (" + lista + ")");
}
const testo = (s, sel) => s.page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);
const valori = (s, ids) => s.page.evaluate(ids => Object.fromEntries(ids.map(id => [id, (document.getElementById(id) || {}).value])), ids);
const salvaCliente = async s => { await s.page.evaluate(async () => { await saveCli(); }); await attendiQuiete(s.stato, 1500); };

(async () => {
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const OK = (cond, msg) => { if (cond) righe.push('ok: ' + msg); else KO(msg); };
  pulisci();
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const seg = utenti.find(u => u.ruolo === 'segreteria');
  const cliId = psql("insert into public.clienti (ragione_sociale, stato, piva, citta, referente_nome, referente_telefono, referente_email) values (" + q(CLIENTE) + ", 'attivo', '01234567890', 'Pisa', 'Mario Rossi', '3331234567', 'mario@example.com') returning id").split('\n')[0];
  const prevId = psql("insert into public.preventivi (cliente_id, stato, data_emissione, data_scadenza, totale_imponibile, iva_perc, preventivo_cliente_pdf_path) values (" + q(cliId) + ", 'inviato_a_rappresentante', '2026-11-01', '2026-12-01', 1000, 22, 'prova/p.pdf') returning id").split('\n')[0];
  psql("set session_replication_role = replica; update public.preventivi set stato = 'in_attesa_anticipo', anticipo_richiesto = true, anticipo_tipo = 'percentuale', anticipo_valore = 30, esito_registrato_il = now(), allegato_accettazione_path = id::text || '/accettazione/firmato.pdf' where id = " + q(prevId));
  const numero = psql("select numero from public.preventivi where id = " + q(prevId));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 120000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    const s = await sessioneCome(browser, url, seg, 1280); sessioni.push(s);
    await attendiQuiete(s.stato, 3000, 30000);
    // 1. Cosa tocca a me e lista dei clienti da completare
    await s.page.evaluate(() => { if (typeof mostraTutteToccaAMe === 'function') mostraTutteToccaAMe(true); });
    await attendi(300);
    const tam = await s.page.evaluate(() => { const e = document.querySelector('.page.on [data-fonte="anagrafiche-commesse"]'); return e ? e.className + ' | ' + e.textContent.replace(/\s+/g, ' ').trim() : ''; });
    OK(/urgente/.test(tam) && /Commesse che partono/.test(tam), 'Cosa tocca a me: "' + tam.slice(0, 140) + '"');
    const lista = await testo(s, '#seg-anag-lista');
    OK(lista.indexOf(CLIENTE) >= 0 && lista.indexOf(CLIENTE) < 40 && new RegExp('🚀 commessa che parte · preventivo n. ' + numero).test(lista) && /manca: indirizzo, CAP, città, SDI o PEC, mod\. pagamento/.test(lista), 'lista: in cima con 🚀 ⇒ "' + lista.slice(0, 200) + '"');
    // 2. "✏️ Completa": campi giusti, parte Fatturazione
    await s.page.evaluate(id => apriClienteSegreteria(id, true), cliId);
    await attendiQuiete(s.stato, 1200);
    const campi = await valori(s, ['mc1', 'mc2', 'mc3', 'mc4', 'mc5', 'mc6']);
    OK(campi.mc1 === CLIENTE && campi.mc2 === '01234567890' && campi.mc3 === 'Pisa' && campi.mc4 === 'Mario Rossi' && campi.mc5 === '3331234567' && campi.mc6 === 'mario@example.com', 'Completa: campi al posto giusto ' + JSON.stringify(campi));
    OK(await s.page.evaluate(() => ge('mct-fat').classList.contains('on')), 'Completa: aperta sulla parte Fatturazione');
    await s.page.evaluate(() => closeM('m-cli'));
    // 3. Finestra "Emetti fattura d'anticipo"
    const attiva = await s.page.evaluate(async () => typeof verificaFattureEmissione === 'function' && await verificaFattureEmissione());
    OK(attiva, 'emissione delle fatture attiva nel database locale');
    if (attiva) {
      await s.page.evaluate(async id => { await apriEmissioneAnticipo(id); }, prevId);
      await attendiQuiete(s.stato, 1500);
      const prima = await testo(s, '#mef-cliente');
      OK(/Mancano indirizzo, CAP, città, codice SDI o PEC: la fattura si emette lo stesso/.test(prima) && /P\.IVA 01234567890/.test(prima) && /Codice SDI manca/.test(prima) && /✏️ Modifica dati del cliente/.test(prima), 'finestra fattura: dati e avviso ⇒ "' + prima.slice(0, 220) + '"');
      await s.page.evaluate(() => { const i = ge('mef-importo'); i.value = '250,00'; i.dispatchEvent(new Event('input')); });
      await s.page.evaluate(async () => { await modificaClienteDaEmissione(); });
      await attendiQuiete(s.stato, 1200);
      OK(await s.page.evaluate(() => ge('m-cli').classList.contains('on') && ge('m-emetti-fattura').classList.contains('on') && ge('mct-fat').classList.contains('on')), 'Modifica dati del cliente: finestra del cliente sopra la fattura, sulla parte Fatturazione');
      await s.page.evaluate(() => {
        ge('mf2').value = 'Via Roma 10'; ge('mf3').value = '56100'; ge('mf4').value = 'Pisa'; ge('mf5').value = 'PI';
        ge('mf6').value = 'ABC1234'; ge('mf7').value = 'prova@pec.it'; ge('mf8').value = ge('mf8').options[1] ? ge('mf8').options[1].value : 'Bonifico';
      });
      await salvaCliente(s);
      await attendi(800);
      const dopo = await testo(s, '#mef-cliente');
      OK(!/Mancano/.test(dopo) && /Via Roma 10, 56100 Pisa \(PI\)/.test(dopo) && /Codice SDI ABC1234/.test(dopo) && /PEC prova@pec\.it/.test(dopo), 'riquadro aggiornato dopo il salvataggio ⇒ "' + dopo.slice(0, 200) + '"');
      OK(await s.page.evaluate(() => ge('m-emetti-fattura').classList.contains('on') && v('mef-importo') === '250,00'), 'la finestra della fattura resta aperta con l\'importo scritto');
      await s.page.evaluate(() => closeM('m-emetti-fattura'));
    }
    const db = JSON.parse(psql("select json_build_object('piva', piva, 'referente', referente_nome, 'telefono', referente_telefono, 'email', referente_email, 'citta', citta, 'indirizzo', indirizzo_fattura, 'sdi', codice_sdi, 'pec', pec) from public.clienti where id = " + q(cliId)));
    OK(db.piva === '01234567890' && db.referente === 'Mario Rossi' && db.telefono === '3331234567' && db.email === 'mario@example.com' && db.citta === 'Pisa' && (!attiva || (db.indirizzo === 'Via Roma 10' && db.sdi === 'ABC1234' && db.pec === 'prova@pec.it')), 'cliente nel database: ' + JSON.stringify(db));
    if (attiva) {
      await s.page.evaluate(async () => { await loadDash(); });
      await attendiQuiete(s.stato, 2500);
      OK(!(await testo(s, '#seg-anag-lista')).includes(CLIENTE), 'completati i dati, il cliente esce dalla lista');
    }
    if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const x of sessioni) { try { if (!x.chiuso) await x.contesto.close(); } catch (e) { /* chiuso */ } }
    await browser.close();
    srv.close();
    try { pulisci(); } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
