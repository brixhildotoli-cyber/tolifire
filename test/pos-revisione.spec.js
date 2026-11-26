#!/usr/bin/env node
// F19.15 revisione del POS (sql/166 + js/118), SOLO DATABASE LOCALE con sql/162, 164, 165, 166. Commessa con la
// revisione 0 del POS firmata e inviata al cliente (subappaltatore nel faldone). Poi: subappaltatore tolto dal
// faldone, un tecnico in squadra (domani) che non è nel POS, un mezzo. Segreteria: «⚠️ POS da aggiornare» con
// l'elenco nel riquadro, «Prossimo passo» con «il POS aggiornato», riga in «Cosa tocca a me»; avviso dopo la squadra
// (solo avviso). Capo tecnico vede l'avviso. Con la revisione 1 resta solo il tecnico in squadra non nel faldone.
// Uso: cd test && node pos-revisione.spec.js

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
const CARTELLA_OUT = CONF.PROM_DOWNLOAD || CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-pos-invio');
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

const testo = (s, sel) => s.page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);

(async () => {
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const OK = (cond, msg) => { if (cond) righe.push('ok: ' + msg); else KO(msg); };
  if (psql("select to_regprocedure('public.pos_revisione_attiva()') is not null") !== 't') { console.log('TEST NON AVVIATO: manca sql/166 nel database locale'); process.exit(2); }
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const seg = utenti.find(u => u.ruolo === 'segreteria');
  const ct = utenti.find(u => u.ruolo === 'capo_tecnico');
  const tec = utenti.filter(u => u.ruolo === 'tecnico').sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))[0];
  const riga = psql("select id || '|' || stato from public.commesse where stato not in ('chiusa', 'annullata') order by creato_il limit 1").split('|');
  const comm = riga[0], statoPrima = riga[1];
  const id36 = t => (String(t).match(/[0-9a-f-]{36}/) || [''])[0];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 120000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  let sub = '', mezzo = '';
  try {
    psql("drop table if exists public._pr_fald, public._pr_giorni, public._pr_persone, public._pr_mezzi; set session_replication_role = replica;" +
      "create table public._pr_fald as select * from public.commesse_faldone_persone where commessa_id = " + q(comm) + ";" +
      "create table public._pr_giorni as select * from public.commesse_squadra_giorni where commessa_id = " + q(comm) + ";" +
      "create table public._pr_persone as select * from public.commesse_squadra_persone where giorno_id in (select id from public._pr_giorni);" +
      "create table public._pr_mezzi as select * from public.commesse_squadra_mezzi where giorno_id in (select id from public._pr_giorni);" +
      "delete from public.commesse_squadra_persone where giorno_id in (select id from public._pr_giorni); delete from public.commesse_squadra_mezzi where giorno_id in (select id from public._pr_giorni);" +
      "delete from public.commesse_squadra_giorni where commessa_id = " + q(comm) + "; delete from public.commesse_faldone_persone where commessa_id = " + q(comm));
    const d0 = id36(psql("set session_replication_role = replica; insert into public.commesse_documenti (commessa_id, cartella, nome_file, storage_path, caricato_da_nome) values (" + q(comm) + ", 'faldone', 'POS_PR_rev0.pdf', " + q(comm + '/faldone/POS_PR_rev0.pdf') + ", 'PROVA PR') returning id"));
    const d0f = id36(psql("set session_replication_role = replica; insert into public.commesse_documenti (commessa_id, cartella, nome_file, storage_path, caricato_da_nome) values (" + q(comm) + ", 'faldone', 'FIRMATO_POS_PR_rev0.pdf', " + q(comm + '/faldone/FIRMATO_POS_PR_rev0.pdf') + ", 'PROVA PR') returning id"));
    sub = id36(psql("set session_replication_role = replica; insert into public.subappaltatori (ragione_sociale) values ('PROVA PR Subappalti srl') returning id"));
    mezzo = id36(psql("set session_replication_role = replica; insert into public.mezzi_attrezzature (nome, targa_matricola) values ('PROVA PR Piattaforma', 'PR-166') returning id"));
    psql("set session_replication_role = replica; insert into public.commesse_faldone_persone (commessa_id, subappaltatore_id) values (" + q(comm) + ", " + q(sub) + ");" +
      "insert into public.pos_commessa (commessa_id, revisione, documento_id, nome_file, impronta_sha256, bozza, mancanze, generato_da_nome, invio_destinatario, invio_mezzo, inviato_il, inviato_da_nome) values (" + q(comm) + ", 0, " + q(d0) + ", 'POS_PR_rev0.pdf', repeat('a', 64), false, '[]', 'PROVA PR', 'cliente', 'pec', current_date, 'PROVA PR');" +
      "update public.pos_commessa set contenuto = public.pos_contenuto_commessa(commessa_id) where documento_id = " + q(d0) + ";" +
      "insert into public.documenti_firme (documento_id, commessa_id, tipo, impronta_sha256, dimensione, stato, approvato_da_nome, firmato_documento_id, firmato_formato, firmato_da_nome, firmato_il) values (" + q(d0) + ", " + q(comm) + ", 'pos', repeat('a', 64), 10, 'firmato', 'PROVA PR', " + q(d0f) + ", 'pades', 'PROVA PR', now());" +
      "update public.commesse set stato = 'in_preparazione' where id = " + q(comm));
    // la commessa cambia dopo l'invio
    psql("set session_replication_role = replica; delete from public.commesse_faldone_persone where commessa_id = " + q(comm) + ";" +
      "with g as (insert into public.commesse_squadra_giorni (commessa_id, data) values (" + q(comm) + ", current_date + 1) returning id)," +
      " p as (insert into public.commesse_squadra_persone (giorno_id, utente_id) select id, " + q(tec.id) + " from g returning giorno_id)" +
      " insert into public.commesse_squadra_mezzi (giorno_id, mezzo_id) select id, " + q(mezzo) + " from g");
    const nomeTec = ((tec.nome || '') + ' ' + (tec.cognome || '')).trim();

    const s = await sessioneCome(browser, url, seg, 1280); sessioni.push(s);
    await attendiQuiete(s.stato, 2500, 30000);
    const fonte = await s.page.evaluate(async () => { const f = FONTI_TOCCA_A_ME.find(x => x.id === 'pos-da-aggiornare'); return f ? await f.conta() : 'nessuna'; });
    OK(fonte === 1, '«Cosa tocca a me» della segreteria: 1 commessa con il POS da aggiornare ⇒ ' + fonte);
    await s.page.evaluate(async id => { await openCommessaDetail(id); }, comm);
    await attendiQuiete(s.stato, 4500);
    let box = await testo(s, '#cmd-pos');
    OK(/POS da aggiornare: dopo l'invio sono cambiate 3 cose rispetto alla revisione 0/.test(box), 'riquadro: «⚠️ POS da aggiornare … 3 cose … revisione 0» ⇒ "' + box.slice(0, 300) + '"');
    OK(/Subappaltatore tolto: PROVA PR Subappalti srl/.test(box) && /Mezzo aggiunto: PROVA PR Piattaforma \(PR-166\)/.test(box) &&
      new RegExp(nomeTec + ' è in squadra dal .* ma non è nel POS: aggiungilo al personale del faldone').test(box), 'elenco: subappaltatore tolto, mezzo aggiunto, tecnico in squadra non nel faldone');
    OK(/revisione 1/.test(box) && /non blocca niente/.test(box), 'invito a generare la revisione 1, solo avviso');
    const passo = await testo(s, '#cmd-suggerimento-passo');
    OK(/il POS aggiornato: dopo l'invio sono cambiate 3 cose/.test(passo), '«Prossimo passo»: «il POS aggiornato…» ⇒ "' + passo.slice(0, 200) + '"');
    await s.page.evaluate(async id => { await avvisoPosDopoSquadra({ id: id }); }, comm);
    await attendiQuiete(s.stato, 800);
    const t = await testo(s, '#toast');
    OK(new RegExp(nomeTec + ' non è nel POS inviato').test(t), 'dopo la squadra: avviso «… non è nel POS inviato» ⇒ "' + t + '"');
    if (s.stato.erroriJs.length) KO('segreteria: errori JavaScript: ' + s.stato.erroriJs.join(' | '));
    await chiudi(s);

    const c = await sessioneCome(browser, url, ct, 1280); sessioni.push(c);
    await attendiQuiete(c.stato, 2500, 30000);
    await c.page.evaluate(async id => { await openCommessaDetail(id); }, comm);
    await attendiQuiete(c.stato, 4500);
    box = await testo(c, '#cmd-pos');
    OK(/POS da aggiornare/.test(box), 'capo tecnico: vede «⚠️ POS da aggiornare»');
    const fonteCt = await c.page.evaluate(() => { const f = FONTI_TOCCA_A_ME.find(x => x.id === 'pos-da-aggiornare'); return f ? f.ruoli.includes(ROLE) : false; });
    OK(!fonteCt, 'capo tecnico: niente riga in «Cosa tocca a me»');
    if (c.stato.erroriJs.length) KO('capo tecnico: errori JavaScript: ' + c.stato.erroriJs.join(' | '));
    await chiudi(c);

    // revisione 1 generata: resta il tecnico in squadra che non è nel faldone
    psql("set session_replication_role = replica; insert into public.pos_commessa (commessa_id, revisione, nome_file, impronta_sha256, bozza, mancanze, generato_da_nome) values (" + q(comm) + ", 1, 'POS_PR_rev1.pdf', repeat('b', 64), false, '[]', 'PROVA PR');" +
      "update public.pos_commessa set contenuto = public.pos_contenuto_commessa(commessa_id) where commessa_id = " + q(comm) + " and revisione = 1");
    const dopo = psql("select jsonb_array_length(public.pos_differenze_commessa(" + q(comm) + ")->'differenze')");
    OK(dopo === '1', 'dopo la revisione 1: resta 1 differenza (il tecnico in squadra non nel faldone) ⇒ ' + dopo);
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const x of sessioni) { try { if (!x.chiuso) await x.contesto.close(); } catch (e) { /* chiuso */ } }
    await browser.close();
    srv.close();
    try {
      psql("set session_replication_role = replica;" +
        "delete from public.commesse_squadra_persone where giorno_id in (select id from public.commesse_squadra_giorni where commessa_id = " + q(comm) + ");" +
        "delete from public.commesse_squadra_mezzi where giorno_id in (select id from public.commesse_squadra_giorni where commessa_id = " + q(comm) + ");" +
        "delete from public.commesse_squadra_giorni where commessa_id = " + q(comm) + "; delete from public.commesse_faldone_persone where commessa_id = " + q(comm) + ";" +
        "insert into public.commesse_faldone_persone select * from public._pr_fald; insert into public.commesse_squadra_giorni select * from public._pr_giorni;" +
        "insert into public.commesse_squadra_persone select * from public._pr_persone; insert into public.commesse_squadra_mezzi select * from public._pr_mezzi;" +
        "drop table public._pr_fald, public._pr_giorni, public._pr_persone, public._pr_mezzi;" +
        "delete from public.mezzi_attrezzature where nome = 'PROVA PR Piattaforma'; delete from public.subappaltatori where ragione_sociale = 'PROVA PR Subappalti srl';" +
        "delete from public.documenti_firme where approvato_da_nome = 'PROVA PR'; delete from public.pos_commessa where generato_da_nome = 'PROVA PR'; delete from public.commesse_documenti where caricato_da_nome = 'PROVA PR'; update public.commesse set stato = " + q(statoPrima) + " where id = " + q(comm));
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
