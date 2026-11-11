#!/usr/bin/env node
// F15.15 (sql/85) - Invio del progetto entro 24 h dalla visita (js/16, js/17, js/46).
// Chrome headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh, poi sql/85 e il suo -VINCOLO).
//  1. il rappresentante, a 390 px, nel Calendario appuntamenti segna
//     "✅ Visita fatta" sulla visita del giorno lavorativo prima di oggi (ieri):
//     oggi in "Cosa tocca a me" ha "⏰ Progetti da inviare dopo la visita" (1);
//  2. crea il progetto dalla scheda del cliente: la finestra propone la visita,
//     il progetto nasce collegato; in bozza l'avviso resta (con il progetto);
//     progetto inviato (stato cambiato dall'editor) = riga sparita;
//  3. il titolare vede la visita di 2 giorni lavorativi fa senza progetto
//     (riga rossa, con il nome del rappresentante), non quella di ieri;
//  4. console: Acquisti e segreteria rifiutati dal database (42501), il
//     rappresentante non scrive "visita fatta" con un update diretto.
// Con INVIO_VISITA_SENZA_SQL=1 (dopo il ROLLBACK di sql/85): nessun bottone,
// nessuna riga, nessun campo nella finestra del progetto, nessun errore.
// Alla fine (solo database locale) si tolgono visite e progetto di prova (le
// righe del registro delle azioni del progetto restano: non si cancellano).
// Uso: cd test && node invio-dopo-visita.spec.js   (uscita 0 = TUTTO OK)

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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-invio-dopo-visita');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA sql/85';
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


// n-esimo giorno lavorativo prima di oggi (stessa regola del database)
function lavorativoPrima(n) {
  return psql("select d from (select ((now() at time zone 'Europe/Rome')::date - g) as d from generate_series(1, 30) g) x " +
    "where public.giorno_lavorativo(d) order by d desc offset " + (n - 1) + " limit 1");
}
async function caricaTAM(s) {
  await s.page.evaluate(async () => { gotoPage(ROLE === 'rappresentante' ? 'dashboard-rapp' : 'dashboard'); await caricaToccaAMe(); });
  await attendiQuiete(s.stato, 1200);
  return s.page.evaluate(() => {
    const b = document.querySelector('.tam-riga[data-fonte="invio-dopo-visita"]');
    return b ? { n: b.querySelector('.tam-num').textContent, urgente: b.classList.contains('urgente') } : null;
  });
}
async function rifiutato(promessa) {
  try { await promessa; return false; } catch (e) { return /42501/.test(e.message); }
}

(async () => {
  fs.mkdirSync(path.join(CARTELLA_OUT, 'download'), { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const SENZA = CONF.INVIO_VISITA_SENZA_SQL === '1';
  const c85 = psql("select to_regprocedure('public.invii_dopo_visita()') is not null");
  if (!SENZA && c85 !== 't') fermati('sql/85 non eseguito nel database locale');
  if (SENZA && c85 === 't') fermati('INVIO_VISITA_SENZA_SQL=1 ma sql/85 c\'è: eseguire prima il ROLLBACK di sql/85');

  const riga = psql("select c.id || '|' || c.rappresentante_id from public.clienti c join public.utenti u on u.id = c.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where c.eliminato_il is null order by c.ragione_sociale limit 1");
  if (!riga) fermati('serve un cliente con un rappresentante attivo');
  const [clienteId, rapId] = riga.split('|');
  const ieri = lavorativoPrima(1), dueFa = lavorativoPrima(2);
  const reg0 = Number(psql('select count(*) from public.registro_azioni'));
  const nuovaVisita = (titolo, giorno) => psql("insert into public.appuntamenti_commerciali (rappresentante_id, cliente_id, titolo, tipo, inizio, fine, stato, creato_da) values (" +
    q(rapId) + ", " + q(clienteId) + ", " + q(titolo) + ", 'visita', (" + q(giorno) + "::date + time '14:00') at time zone 'Europe/Rome', (" + q(giorno) + "::date + time '15:00') at time zone 'Europe/Rome', 'pianificato', " + q(rapId) + ") returning id").split('\n')[0];
  const visitaIeri = nuovaVisita(ETICHETTA + ' visita di ieri', ieri);
  const visitaDue = nuovaVisita(ETICHETTA + ' visita di due giorni fa', dueFa);
  if (!SENZA) {
    psql("set toli.visita_fatta = 'on'; update public.appuntamenti_commerciali set visita_fatta_il = (" + q(dueFa) + "::date + time '15:30') at time zone 'Europe/Rome', stato = 'completato' where id = " + q(visitaDue));
  }
  const fileProva = path.join(CARTELLA_OUT, 'rilievo-prova.png');
  fs.writeFileSync(fileProva, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  let progettoId = null;

  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const rap = BACK.perId[rapId];
  const com = utenti.find(u => u.ruolo === 'commerciale');
  const seg = utenti.find(u => u.ruolo === 'segreteria');
  const tit = utenti.find(u => u.ruolo === 'titolare');

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    const r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);
    // Calendario sul mese della visita di ieri
    await r.page.evaluate(async giorno => {
      appAnno = Number(giorno.slice(0, 4)); appMese = Number(giorno.slice(5, 7)) - 1;
      gotoPage('calendario-appuntamenti'); await loadAppuntamentiCommerciali();
    }, ieri);
    await attendiQuiete(r.stato, 1200);
    const bottone = 'button[onclick="apriVisitaFatta(\'' + visitaIeri + '\')"]';

    if (SENZA) {
      if (await r.page.$(bottone)) KO('senza sql/85 il bottone "✅ Visita fatta" non deve comparire');
      const tam = await caricaTAM(r);
      if (tam) KO('senza sql/85 la riga "Progetti da inviare dopo la visita" non deve comparire');
      await r.page.evaluate(async cli => { currentCliId = cli; await apriNuovoProgetto(); }, clienteId);
      await attendiQuiete(r.stato, 800);
      const vis = await r.page.$eval('#mp-visita-box', e => e.style.display);
      if (vis !== 'none') KO('senza sql/85 il campo "Visita da cui nasce il progetto" non deve comparire');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '0-senza-sql-390.png') });
      righe.push('Senza sql/85: nessun bottone "Visita fatta", nessuna riga in "Cosa tocca a me", nessun campo visita nel progetto');
    } else {
      // 1. Visita fatta ieri
      await r.page.waitForSelector(bottone, { timeout: 10000 });
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-calendario-390.png') });
      await r.page.click(bottone);
      await attendi(500);
      await r.page.evaluate(giorno => { ge('vf-quando').value = giorno + 'T15:00'; }, ieri);
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '2-visita-fatta-390.png') });
      await r.page.evaluate(() => salvaVisitaFatta(false));
      await attendiQuiete(r.stato, 1200);
      const db1 = psql('select (visita_fatta_il is not null)::text || \'|\' || stato || \'|\' || coalesce(visita_fatta_da::text, \'\') from public.appuntamenti_commerciali where id = ' + q(visitaIeri));
      if (db1 !== 'true|completato|' + rapId) KO('1: nel database ' + db1);
      const card = await r.page.evaluate(() => document.getElementById('app-lista').textContent);
      if (!/Visita fatta il/.test(card) || !/Progetto da creare e inviare/.test(card)) KO('1: elenco del calendario senza "Visita fatta il" / "Progetto da creare e inviare"');
      const tam1 = await caricaTAM(r);
      if (!tam1 || tam1.n !== '2') KO('1: "Cosa tocca a me" del rappresentante: ' + JSON.stringify(tam1) + ' (atteso 2: ieri e due giorni fa)');
      righe.push('1. rappresentante a 390 px: "✅ Visita fatta" sulla visita di ieri (' + ieri + ') → oggi "⏰ Progetti da inviare dopo la visita" = ' + (tam1 && tam1.n));
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '3-tocca-a-me-rappresentante-390.png') });

      // 2. Progetto dalla scheda del cliente, collegato alla visita
      await r.page.evaluate(async cli => { currentCliId = cli; await apriNuovoProgetto(); }, clienteId);
      await attendiQuiete(r.stato, 800);
      const proposta = await r.page.evaluate(() => ({ vis: ge('mp-visita-box').style.display, val: ge('mp-visita').value, testo: ge('mp-visita').selectedOptions[0] && ge('mp-visita').selectedOptions[0].textContent }));
      if (proposta.vis === 'none' || proposta.val !== visitaIeri) KO('2: la finestra non propone la visita di ieri: ' + JSON.stringify(proposta));
      await r.page.type('#mp-titolo', ETICHETTA + ' porte REI');
      await r.page.select('#mp-tipologia', 'Porte REI / tagliafuoco');
      await r.page.type('#mp-descrizione', 'Prova F15.15: 6 porte REI 60');
      const fonte = await r.page.$('#mp-fonte-rilievo');
      if (fonte && await r.page.$eval('#mp-fonte-rilievo-box', e => e.style.display !== 'none')) await r.page.select('#mp-fonte-rilievo', 'sopralluogo_toli');
      const input = await r.page.$('#mp-file');
      await input.uploadFile(fileProva);
      await r.page.evaluate(() => ge('mp-file').dispatchEvent(new Event('change', { bubbles: true })));
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '4-progetto-con-visita-390.png') });
      await r.page.evaluate(() => salvaProgetto());
      await attendiQuiete(r.stato, 2000);
      progettoId = psql('select id from public.progetti_tecnici where titolo = ' + q(ETICHETTA + ' porte REI') + ' order by creato_il desc limit 1');
      const collegato = progettoId ? psql('select coalesce(appuntamento_id::text, \'\') || \'|\' || stato from public.progetti_tecnici where id = ' + q(progettoId)) : '';
      if (collegato !== visitaIeri + '|bozza') KO('2: progetto non collegato alla visita: ' + collegato);
      const tam2 = await caricaTAM(r);
      if (!tam2 || tam2.n !== tam1.n) KO('2: con il progetto in bozza l\'avviso deve restare: ' + JSON.stringify(tam2));
      await r.page.evaluate(() => vaiToccaAMe('invio-dopo-visita'));
      await attendiQuiete(r.stato, 1000);
      const elenco = await r.page.evaluate(() => ge('iv-lista').textContent);
      if (!/Progetto in bozza/.test(elenco) || !elenco.includes(ETICHETTA + ' porte REI')) KO('2: l\'elenco non mostra il progetto in bozza');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '5-elenco-rappresentante-390.png') });
      await r.page.evaluate(() => closeM('m-invii-visita'));
      psql("update public.progetti_tecnici set stato = 'in_verifica_tecnica' where id = " + q(progettoId));
      const tam3 = await caricaTAM(r);
      if (tam3 && Number(tam3.n) !== Number(tam1.n) - 1) KO('2: progetto inviato: la visita di ieri doveva uscire: ' + JSON.stringify(tam3));
      righe.push('2. progetto creato con la visita proposta e collegata; in bozza l\'avviso resta con il progetto; inviato → la visita esce dall\'elenco');

      // 3. Titolare: solo la visita di 2 giorni lavorativi fa
      const t = await apriSito(browser, url); sessioni.push(t);
      await login(t, tit);
      const tamT = await caricaTAM(t);
      if (!tamT || !tamT.urgente) KO('3: titolare senza riga rossa: ' + JSON.stringify(tamT));
      await t.page.evaluate(() => vaiToccaAMe('invio-dopo-visita'));
      await attendiQuiete(t.stato, 1000);
      const elencoT = await t.page.evaluate(() => ge('iv-lista').textContent);
      if (!elencoT.includes(ETICHETTA + ' visita di due giorni fa') || elencoT.includes(ETICHETTA + ' visita di ieri')) KO('3: elenco del titolare sbagliato');
      const nome = [rap.nome, rap.cognome].filter(Boolean).join(' ');
      if (nome && !elencoT.includes(nome)) KO('3: elenco del titolare senza il nome del rappresentante');
      await t.page.screenshot({ path: path.join(CARTELLA_OUT, '6-elenco-titolare.png') });
      righe.push('3. titolare: riga rossa con la visita di 2 giorni lavorativi fa (' + dueFa + ', ' + nome + '), non quella di ieri');

      // 4. Console
      if (!await rifiutato(rest('/rpc/invii_dopo_visita', tokenDi(com), { metodo: 'POST', corpo: {} }))) KO('4: Acquisti legge invii_dopo_visita');
      if (!await rifiutato(rest('/rpc/segna_visita_fatta', tokenDi(seg), { metodo: 'POST', corpo: { p_appuntamento: visitaDue, p_quando: new Date().toISOString(), p_senza_progetto: null } }))) KO('4: segreteria segna la visita fatta');
      if (!await rifiutato(rest('/appuntamenti_commerciali?id=eq.' + visitaIeri, tokenDi(rap), { metodo: 'PATCH', corpo: { visita_fatta_il: null }, headers: { Prefer: 'return=representation' } }))) KO('4: il rappresentante cambia visita_fatta_il con un update diretto');
      if (!await rifiutato(rest('/progetti_tecnici?id=eq.' + progettoId, tokenDi(com), { metodo: 'PATCH', corpo: { appuntamento_id: visitaDue }, headers: { Prefer: 'return=representation' } }))) {
        const dopo = psql('select appuntamento_id from public.progetti_tecnici where id = ' + q(progettoId));
        if (dopo === visitaDue) KO('4: Acquisti cambia la visita del progetto');
      }
      righe.push('4. console: Acquisti e segreteria rifiutati (42501), update diretto di "visita fatta" del rappresentante rifiutato, Acquisti non collega');
    }

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript (' + s.stato.erroriJs.join(' | ') + ')');
      const rete = s.stato.rete.filter(x => (x.status >= 500 || /does not exist|Could not find/i.test(x.msg)) &&
        !(SENZA && /invio_dopo_visita_attivo/.test(x.dove + x.msg)) && !/elenco_clienti_presidi_tecnico|sconto_rappresentante_attivo/.test(x.dove + x.msg));
      if (rete.length) KO('errori del database: ' + rete.map(x => x.metodo + ' ' + x.dove + ' ' + x.status + ' ' + x.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    try {
      if (progettoId) psql('delete from public.progetti_tecnici where id = ' + q(progettoId));
      psql('delete from public.appuntamenti_commerciali where id in (' + q(visitaIeri) + ', ' + q(visitaDue) + ')');
      console.log('Righe nuove nel registro delle azioni (restano): ' + (Number(psql('select count(*) from public.registro_azioni')) - reg0));
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
