#!/usr/bin/env node
// sql/257 + js/68 - Pagina Presidi in consultazione per il tecnico, Chrome
// headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh, poi sql/257).
//  1. il tecnico a 390 px apre 🧯 Presidi dal menu: niente "+ Nuovo presidio",
//     "Importa", "Modifica"; nota "tutti i clienti"; nel menu dei clienti c'è
//     un cliente dove NON ha interventi; apre la scheda di un suo presidio e
//     lo storico semestrale: "👁 Apri" in sola lettura, niente "Riporta";
//  2. dalla console: la riga del cliente (P.IVA), i documenti, i preventivi
//     di quel cliente restano chiusi; la modifica del presidio non cambia righe;
//  3. su un cliente dei suoi interventi (se c'è) "Riporta in una nuova
//     verifica" resta.
// PRESIDI_TECNICO_SENZA_SQL=1 (dopo il rollback di sql/257): la pagina si apre
// senza errori con la nota "serve l'aggiornamento del database" e il cliente
// non visibile non c'è.
// Schermate e download nella cartella dei risultati ($TMPDIR/toli-presidi-tecnico
// oppure SMOKE_RISULTATI).
// PRESIDI_TECNICO_EMAIL=<email>: un altro tecnico (es. uno con interventi, per la prova 3).
// Uso: cd test && node presidi-tecnico.spec.js   (uscita 0 = TUTTO OK)

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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-presidi-tecnico');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 390);
const ETICHETTA = 'PROVA sql/257';
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



const SENZA_SQL = CONF.PRESIDI_TECNICO_SENZA_SQL === '1';
const q = s => "'" + String(s).replace(/'/g, "''") + "'";

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const con257 = psql("select to_regprocedure('public.elenco_clienti_presidi_tecnico()') is not null") === 't';
  if (SENZA_SQL && con257) fermati('PRESIDI_TECNICO_SENZA_SQL=1 ma sql/257 è nel database locale');
  if (!SENZA_SQL && !con257) fermati('sql/257 non eseguito nel database locale');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const tec = CONF.PRESIDI_TECNICO_EMAIL ? BACK.perEmail[CONF.PRESIDI_TECNICO_EMAIL.toLowerCase()] : primo('tecnico');
  if (!tec) fermati('serve un tecnico attivo');
  const visibili = "(select o.cliente_id from public.ordini_lavoro o where (o.tecnico_id = " + q(tec.id) + " or o.creato_da = " + q(tec.id) + ") and o.eliminato_il is null " +
    "union select s.cliente_id from public.schede_lavoro s where s.tecnico_id = " + q(tec.id) + " and s.eliminato_il is null)";
  const conStorico = (fuori) => psql("select i.cliente_id || '|' || i.id || '|' || c.ragione_sociale from public.schede_presidi sp " +
    "join public.impianti i on i.id = sp.impianto_id and i.eliminato_il is null join public.clienti c on c.id = i.cliente_id and c.eliminato_il is null " +
    "where i.cliente_id " + (fuori ? 'not ' : '') + "in " + visibili + " and i.cliente_id is not null order by c.ragione_sociale, i.id limit 1");
  const [cliFuori, impFuori, nomeFuori] = (conStorico(true) || '||').split('|');
  const [cliDentro, impDentro] = (conStorico(false) || '||').split('|');
  if (!cliFuori) fermati('serve un cliente con storico dei presidi dove il tecnico non ha interventi');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    const t = await apriSito(browser, url); sessioni.push(t);
    await login(t, tec);
    const menu = await t.page.evaluate(() => [...document.querySelectorAll('#nav [onclick*="presidi"], #nav a, #nav button')].map(e => e.textContent.trim()).join('|'));
    if (!/Presidi/.test(menu)) KO('1: voce 🧯 Presidi assente dal menu del tecnico: ' + menu.slice(0, 200));
    await t.page.evaluate(() => gotoPage('presidi'));
    await attendiQuiete(t.stato, 2500, 30000);
    const pag = await t.page.evaluate(() => ({
      on: document.getElementById('pg-presidi').classList.contains('on'),
      nuovo: getComputedStyle(document.getElementById('btn-nuovo-presidio')).display,
      importa: getComputedStyle(document.getElementById('btn-import-presidi')).display,
      nota: document.getElementById('presidi-tec-nota').innerText,
      notaVisibile: getComputedStyle(document.getElementById('presidi-tec-nota')).display !== 'none',
      clienti: [...document.querySelectorAll('#pcli option')].map(o => o.value).filter(Boolean),
      modifica: [...document.querySelectorAll('#pcards button')].filter(b => /Modifica|Elimina|Sostituito|\+ Aggiungi/.test(b.textContent)).length,
      schede: document.querySelectorAll('#pcards button[onclick^="apriSchedaPresidio("]').length,
      larghezza: document.documentElement.scrollWidth
    }));
    await t.page.screenshot({ path: path.join(CARTELLA_OUT, (SENZA_SQL ? 'senza-sql-' : '') + '1-presidi-tecnico.png'), fullPage: false });
    if (!pag.on) KO('1: la pagina Presidi non si apre per il tecnico');
    if (pag.nuovo !== 'none' || pag.importa !== 'none') KO('1: "+ Nuovo presidio" o "Importa" visibili al tecnico');
    if (!pag.notaVisibile) KO('1: nota di consultazione assente');
    if (pag.modifica) KO('1: ' + pag.modifica + ' bottoni Modifica/Elimina/Sostituito/Aggiungi nelle schede');
    if (pag.larghezza > LARGHEZZA + 2) KO('1: pagina più larga dello schermo (' + pag.larghezza + ' px)');
    if (SENZA_SQL) {
      if (!/sql\/257/.test(pag.nota)) KO('senza sql: la nota non dice dell\'aggiornamento: ' + pag.nota);
      if (pag.clienti.includes(nomeFuori)) KO('senza sql: il cliente non visibile compare');
      righe.push('senza sql/257: pagina aperta, nota "' + pag.nota.slice(0, 70) + '...", ' + pag.clienti.length + ' clienti, ' + pag.schede + ' schede');
    } else {
      if (!/tutti i clienti/.test(pag.nota)) KO('1: nota senza "tutti i clienti": ' + pag.nota);
      if (!pag.clienti.includes(nomeFuori)) KO('1: il cliente "' + nomeFuori + '" (senza interventi del tecnico) non è nel menu dei clienti');
      righe.push('1. Presidi del tecnico a ' + LARGHEZZA + ' px: ' + pag.clienti.length + ' clienti nel menu (anche "' + nomeFuori + '"), nessun bottone di modifica');
      // filtro sul cliente e scheda del presidio con lo storico
      await t.page.evaluate(n => { const s = document.getElementById('pcli'); s.value = n; filterP(); }, nomeFuori);
      await attendiQuiete(t.stato, 1500);
      const nelFiltro = await t.page.evaluate(id => !!document.querySelector('#pcards button[onclick="apriSchedaPresidio(\'' + id + '\')"]'), impFuori);
      if (!nelFiltro) KO('1: filtrando il cliente il presidio con storico non è tra le schede');
      await t.page.screenshot({ path: path.join(CARTELLA_OUT, '2-filtro-cliente.png') });
      await t.page.evaluate(id => apriSchedaPresidio(id), impFuori);
      await t.page.waitForFunction(() => document.getElementById('storico-presidio') && /Schede semestrali|Storico interventi manichetta|Schede semestrali manichetta/.test(document.getElementById('storico-presidio').innerText), { timeout: 20000 });
      await attendiQuiete(t.stato, 800);
      const st = await t.page.evaluate(() => {
        const b = document.getElementById('storico-presidio');
        return { schede: b.querySelectorAll('.card').length, riporta: /Riporta in una nuova verifica|Riprendi per un nuovo intervento/.test(b.innerText),
                 apri: [...b.querySelectorAll('button')].filter(x => /^👁 Apri/.test(x.textContent.trim())).length,
                 cliente: document.getElementById('msp-contenuto').innerText };
      });
      if (!st.schede) KO('1: storico vuoto per il presidio del cliente non visibile');
      if (st.riporta) KO('1: "Riporta in una nuova verifica" sul cliente non visibile');
      if (!st.apri) KO('1: manca "👁 Apri" nello storico');
      if (st.cliente.indexOf(nomeFuori) < 0) KO('1: la scheda del presidio non mostra il nome del cliente');
      await t.page.screenshot({ path: path.join(CARTELLA_OUT, '3-scheda-storico.png') });
      await t.page.evaluate(() => [...document.querySelectorAll('#storico-presidio button')].find(x => /^👁 Apri/.test(x.textContent.trim())).click());
      await attendiQuiete(t.stato, 600);
      const ed = await t.page.evaluate(() => ({
        salva: !!document.getElementById('sp-salva') && getComputedStyle(document.getElementById('sp-salva')).display !== 'none',
        attivi: [...document.querySelectorAll('#storico-presidio input, #storico-presidio textarea, #storico-presidio select')].filter(e => !e.disabled).length
      }));
      if (ed.salva || ed.attivi) KO('1: la scheda dello storico si modifica (salva ' + ed.salva + ', campi attivi ' + ed.attivi + ')');
      await t.page.screenshot({ path: path.join(CARTELLA_OUT, '4-scheda-semestrale-sola-lettura.png') });
      righe.push('1. scheda e storico del cliente non visibile: ' + st.schede + ' schede, "👁 Apri" in sola lettura, niente Riporta');
      await t.page.evaluate(() => closeM('m-scheda-presidio'));

      // 2. console del tecnico
      const cons = await t.page.evaluate(async (cli, imp) => {
        const a = await db.from('clienti').select('id,piva,iban').eq('id', cli);
        const d = await db.from('documenti_cliente').select('id').eq('cliente_id', cli);
        const p = await db.from('preventivi').select('id').eq('cliente_id', cli);
        const u = await db.from('impianti').update({ note: 'PROVA sql/257' }).eq('id', imp).select('id');
        return { cliente: (a.data || []).length, documenti: (d.data || []).length, preventivi: (p.data || []).length, modificati: (u.data || []).length, erroreModifica: u.error && u.error.message };
      }, cliFuori, impFuori);
      if (cons.cliente || cons.documenti || cons.preventivi || cons.modificati) KO('2: console del tecnico: ' + JSON.stringify(cons));
      else righe.push('2. console del tecnico: riga del cliente, documenti, preventivi chiusi; modifica del presidio 0 righe');

      // 3. cliente dei suoi interventi: il riporto resta
      if (cliDentro) {
        await t.page.evaluate(id => apriSchedaPresidio(id), impDentro);
        await t.page.waitForFunction(() => document.getElementById('storico-presidio') && document.getElementById('storico-presidio').querySelectorAll('.card').length, { timeout: 20000 });
        await attendiQuiete(t.stato, 800);
        const r = await t.page.evaluate(() => /Riporta in una nuova verifica|Riprendi per un nuovo intervento/.test(document.getElementById('storico-presidio').innerText));
        if (!r) KO('3: sul cliente dei suoi interventi manca "Riporta in una nuova verifica"');
        else righe.push('3. cliente dei suoi interventi: "Riporta in una nuova verifica" c\'è');
        await t.page.evaluate(() => closeM('m-scheda-presidio'));
      } else righe.push('3. saltata: nessun cliente dei suoi interventi con storico');
    }

    for (const s of sessioni.filter(x => !x.chiuso)) await chiudi(s);
    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(r => (r.status >= 500 || /does not exist|Could not find/i.test(r.msg)) &&
        !/schede_migrate_motore/.test(r.msg) && !(SENZA_SQL && /elenco_clienti_presidi_tecnico/.test(r.dove + r.msg)));
      if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
  }
  righe.forEach(r => console.log(r));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
