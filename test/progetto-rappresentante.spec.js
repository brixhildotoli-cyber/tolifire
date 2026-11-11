#!/usr/bin/env node
// Progetto tecnico del rappresentante come prima del 06/11 (richiesta di
// Erika dell'11/11, con sql/259 e sql/260). Chrome headless con
// puppeteer-core, SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh).
// Le regole di smistamento si spengono durante la prova (come dopo sql/260)
// e si riaccendono alla fine.
// Il rappresentante a 390 px:
//  1. crea il progetto dalla scheda del cliente con titolo, tipologia,
//     descrizione e una foto: nella finestra NON c'è "Fonte del rilievo",
//     l'anteprima della foto scelta si vede;
//  2. nel tab "📝 Rilievi tecnici" NON ci sono "📝 Compila una scheda di
//     rilievo" né "📋 Blocco comune"; nella scheda progetto nessuna riga
//     "Fonte del rilievo"; tra gli allegati l'anteprima della foto;
//  3. ci sono i due bottoni "🔧 Invia a ufficio tecnico" e "📤 Invia ad
//     Acquisti": il primo progetto va all'ingegnere, un secondo progetto
//     ad Acquisti; la fonte del rilievo diventa "sopralluogo_toli" (se la
//     colonna c'è, sql/79), scritta solo DOPO la conferma dell'invio (con
//     "Annulla" resta vuota);
//  4. senza allegati il sito non invia ("Non puoi inviare un progetto senza
//     almeno un allegato"); la barra "🔍 Cerca" della pagina Progetti lascia
//     visibili solo le schede con le parole scritte;
//  5. sql/261: l'ingegnere ha una scheda porte REI senza foto, senza dati del
//     prezzo e con REI 60 senza fonte e fa "Richiedi integrazione" (finestra
//     Verifica tecnica, salva_esito_verifica); il rappresentante rinvia:
//     con sql/261 passa (all'ingegnere, poi di nuovo ad Acquisti) senza
//     nessun elenco; senza sql/261 resta da integrare con il solo messaggio
//     "Chiedi all'ingegnere di completare la scheda" (niente "📝 Compila la
//     scheda").
// Alla fine si tolgono i progetti di prova.
// Uso: cd test && node progetto-rappresentante.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-progetto-rappresentante');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA PROGETTO RAPP';
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
  page.on('dialog', d => {
    stato.dialoghi.push(d.message());
    if (stato.rifiutaConferma && d.type() === 'confirm') return d.dismiss();
    d.accept(d.type() === 'prompt' ? (d.defaultValue() || ETICHETTA) : undefined);
  });
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
// Dall'11/11 (richiesta di Erika, sql/259-260) il rappresentante non ha più
// "📝 Compila una scheda di rilievo" nel tab: il riquadro deve mancare. Le
// policy di sql/77 restano, quindi la prova del database apre la stessa
// scheda del motore con apriSchedaMotore (la strada del bottone).
async function apriMotore(s) {
  const rappresentante = await s.page.evaluate(() => ROLE === 'rappresentante');
  if (rappresentante) {
    await attendiQuiete(s.stato, 600);
    if (await s.page.evaluate(() => !!document.getElementById('msm-apri') || !!document.getElementById('msm-comune'))) {
      throw new Error('il rappresentante vede ancora "Compila una scheda di rilievo" o il blocco comune');
    }
    await s.page.evaluate(async () => { await apriSchedaMotore(currentProgettoTecnicoId, 'porte_rei'); });
  } else {
    await s.page.waitForSelector('#msm-apri-btn', { timeout: 10000 });
    await s.page.select('#msm-lavorazione', 'porte_rei');
    await s.page.click('#msm-apri-btn');
  }
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

(async () => {
  const righe = [];
  const fallimenti = [];
  const KO = m => fallimenti.push(m);
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const c79 = psql("select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'progetti_tecnici' and column_name = 'fonte_rilievo')") === 't';
  const riga = psql("select c.id || '|' || u.id from public.clienti c join public.utenti u on u.id = c.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where c.eliminato_il is null order by c.creato_il limit 1");
  if (!riga) fermati('serve un cliente con un rappresentante attivo');
  const [clienteId, rapId] = riga.split('|');
  const inizio = psql('select now()');
  const regoleSpente = psql("select case when to_regclass('public.regole_smistamento') is null then '' else (select coalesce(string_agg(id::text, ','), '') from public.regole_smistamento where attiva) end");
  if (regoleSpente) psql('update public.regole_smistamento set attiva = false where id in (' + regoleSpente + ')');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const rap = utenti.find(u => u.id === rapId);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const foto = path.join(CARTELLA_OUT, 'porta.png');
  fs.writeFileSync(foto, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const marca = 'z' + Date.now();   // parola che c'è solo nei titoli di questa prova
  const titoli = [ETICHETTA + ' ' + marca + ' ufficio tecnico', ETICHETTA + ' ' + marca + ' Acquisti', ETICHETTA + ' ' + marca + ' senzaallegati'];
  const con261 = psql("select coalesce((select prosrc like '%sql/261%' from pg_proc where oid = to_regprocedure('public.trg_progetti_tecnici_invio_completo()')), false)") === 't';
  const ing = utenti.find(u => u.ruolo === 'ingegnere');
  const statoDi = id => psql('select stato || \'|\' || ' + (c79 ? "coalesce(fonte_rilievo, '')" : "''") + ' from public.progetti_tecnici where id = ' + q(id));

  async function creaProgetto(r, titolo, n) {
    await r.page.evaluate(async id => { await openClienteDetail(id); }, clienteId);
    await attendiQuiete(r.stato, 900);
    await r.page.evaluate(async () => { await apriNuovoProgetto(); });
    await attendiQuiete(r.stato, 900);
    const box = await r.page.evaluate(() => { const b = document.getElementById('mp-fonte-rilievo-box'); return b ? getComputedStyle(b).display : 'assente'; });
    if (box !== 'none' && box !== 'assente') KO(n + ': nella finestra del progetto c\'è "Fonte del rilievo"');
    await scrivi(r, 'mp-titolo', titolo);
    await r.page.evaluate(() => { const sel = ge('mp-tipologia'); sel.value = [...sel.options].find(o => o.value).value; });
    await scrivi(r, 'mp-descrizione', '2 porte REI 60 battente singolo circa 90 x 210, accesso dal cortile 8-17.');
    const input = await r.page.$('#mp-file');
    await input.uploadFile(foto);
    await r.page.evaluate(() => ge('mp-file').dispatchEvent(new Event('change', { bubbles: true })));
    await attendiQuiete(r.stato, 400);
    const anteprime = await r.page.evaluate(() => document.querySelectorAll('#mp-file-selezionati img').length);
    if (!anteprime) KO(n + ': manca l\'anteprima della foto scelta nella finestra del progetto');
    await r.page.screenshot({ path: path.join(CARTELLA_OUT, n + '-finestra-progetto-390.png'), fullPage: false });
    // F15.17: se compare l'avviso del progetto doppio si crea comunque
    await r.page.evaluate(async () => { const __t = setInterval(() => { const m = document.getElementById('m-progetto-doppione'); if (m && m.classList.contains('on')) { ge('pdp-motivo').value = 'Prova automatica (F15.17)'; ge('pdp-crea').click(); } }, 100); try { await salvaProgetto(); } finally { clearInterval(__t); } });
    await attendiQuiete(r.stato, 1500);
    const id = psql('select id from public.progetti_tecnici where titolo = ' + q(titolo) + ' limit 1');
    if (!id) { KO(n + ': il progetto non risulta salvato ' + await toastTesto(r)); return null; }
    righe.push(n + '. progetto salvato (' + statoDi(id) + '), finestra senza "Fonte del rilievo", anteprime della foto: ' + anteprime);
    return id;
  }

  try {
    const r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);

    // 1-2. Primo progetto: all'ufficio tecnico ------------------------------
    const id1 = await creaProgetto(r, titoli[0], '1');
    if (id1) {
      await apriProgetto(r, id1);
      const tab = await r.page.evaluate(() => ({
        apri: !!document.getElementById('msm-apri'), comune: !!document.getElementById('msm-comune'),
        info: (document.getElementById('pd-info-content') || {}).innerText || '',
        img: document.querySelectorAll('#pd-file-content img').length,
        file: (document.getElementById('pd-file-content') || {}).innerText || ''
      }));
      if (tab.apri || tab.comune) KO('2: nel tab Rilievi tecnici c\'è ancora ' + (tab.apri ? '"Compila una scheda di rilievo"' : '"Blocco comune"'));
      else righe.push('2. tab Rilievi tecnici: niente "Compila una scheda di rilievo" né "Blocco comune"');
      if (/Fonte del rilievo/.test(tab.info)) KO('2: la scheda progetto mostra "Fonte del rilievo"');
      if (!/porta/.test(tab.file)) KO('2: tra gli allegati del progetto manca la foto: ' + tab.file.slice(0, 160));
      else righe.push('   allegati del progetto: la foto c\'è (elenco come prima: ' + tab.img + ' miniature, il riquadro allegati non ne ha mai avute)');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '2-scheda-progetto-390.png'), fullPage: true });

      await r.page.evaluate(async id => { await openClienteDetail(id); }, clienteId);
      await attendiQuiete(r.stato, 1200);
      await r.page.evaluate(() => { const t = [...document.querySelectorAll('.tab')].find(x => /Progetti tecnici/.test(x.textContent) && x.offsetParent); if (t) t.click(); });
      await attendiQuiete(r.stato, 900);
      const bottoni = await r.page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.textContent.trim()));
      const due = bottoni.some(b => /Invia a ufficio tecnico/.test(b)) && bottoni.some(b => /Invia ad Acquisti/.test(b));
      const uno = bottoni.some(b => /Invia il progetto/.test(b));
      if (!due || uno) KO('3: bottoni di invio ' + bottoni.filter(b => /Invia/.test(b)).join(', '));
      else righe.push('3. scheda cliente: "🔧 Invia a ufficio tecnico" e "📤 Invia ad Acquisti", niente "📤 Invia il progetto"');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '3-bottoni-390.png'), fullPage: true });

      // la fonte del rilievo si scrive solo dopo la conferma: con "Annulla" resta vuota
      r.stato.dialoghi = [];
      r.stato.rifiutaConferma = true;
      await r.page.evaluate(async id => { await inviaProgettoAUfficioTecnico(id); }, id1);
      await attendiQuiete(r.stato, 1000);
      r.stato.rifiutaConferma = false;
      const s0 = statoDi(id1);
      if (s0 !== 'bozza|') KO('3: con "Annulla" il progetto doveva restare in bozza senza fonte: ' + s0);
      else righe.push('   con "Annulla" alla conferma: ' + s0 + ' (fonte del rilievo non scritta)');

      r.stato.dialoghi = [];
      await r.page.evaluate(async id => { await inviaProgettoAUfficioTecnico(id); }, id1);
      await attendiQuiete(r.stato, 1500);
      const s1 = statoDi(id1);
      if (s1 !== 'in_verifica_tecnica|' + (c79 ? 'sopralluogo_toli' : '')) KO('3: invio all\'ufficio tecnico: ' + s1 + ' ' + testoDialoghi(r) + ' ' + await toastTesto(r));
      else righe.push('   "🔧 Invia a ufficio tecnico": ' + s1);
    }

    // 3. Secondo progetto: ad Acquisti ----------------------------------------
    const id2 = await creaProgetto(r, titoli[1], '4');
    if (id2) {
      r.stato.dialoghi = [];
      await r.page.evaluate(async id => { await inviaProgettoAlCommerciale(id); }, id2);
      await attendiQuiete(r.stato, 1500);
      const s2 = statoDi(id2);
      if (s2 !== 'inviato_a_commerciale|' + (c79 ? 'sopralluogo_toli' : '')) KO('4: invio ad Acquisti: ' + s2 + ' ' + testoDialoghi(r) + ' ' + await toastTesto(r));
      else righe.push('   "📤 Invia ad Acquisti": ' + s2);
    }

    // 4. Senza allegati il sito non invia ------------------------------------
    const id3 = await creaProgetto(r, titoli[2], '5');
    if (id3) {
      psql('delete from public.progetti_tecnici_allegati where progetto_id = ' + q(id3));
      r.stato.dialoghi = [];
      await r.page.evaluate(async id => { await inviaProgettoAlCommerciale(id); }, id3);
      await attendiQuiete(r.stato, 1200);
      const s3 = statoDi(id3);
      const t3 = await toastTesto(r);
      if (!/^bozza\|/.test(s3) || !/senza almeno un allegato/.test(t3)) KO('5: senza allegati doveva fermarsi: ' + s3 + ' ' + t3);
      else righe.push('5. senza allegati: fermato dal sito ("' + t3.trim() + '"), resta ' + s3);
    }

    // 4b. Barra "🔍 Cerca" della pagina Progetti -----------------------------
    {
      await r.page.evaluate(async () => { gotoPage('progetti'); if (typeof loadPaginaProgetti === 'function') await loadPaginaProgetti(); });
      await attendiQuiete(r.stato, 1500);
      const cerca = async testo => {
        await r.page.evaluate(t => { const c = ge('cerca-prev-progetti'); c.value = t; filtraPreventiviPagina('progetti'); }, testo);
        await attendi(300);
        return r.page.evaluate(() => {
          const vis = schedePaginaPreventivi(ge('pg-progetti')).filter(c => c.style.display !== 'none');
          return { n: vis.length, testi: vis.map(c => c.textContent), esito: (ge('cerca-prev-progetti-esito') || {}).textContent || '' };
        });
      };
      const tutti = await cerca(marca);
      const uno = await cerca(marca + ' senzaallegati');
      const nessuno = await cerca(marca + ' parolachenonce');
      await cerca('');
      const okTutti = tutti.n === 3 && tutti.testi.every(t => t.includes(marca));
      const okUno = uno.n === 1 && uno.testi[0].includes(titoli[2]);
      if (!okTutti || !okUno || nessuno.n !== 0) KO('5b: ricerca nella pagina Progetti: ' + JSON.stringify({ tutti: [tutti.n, tutti.esito], uno: [uno.n, uno.esito], nessuno: [nessuno.n, nessuno.esito] }));
      else righe.push('5b. 🔍 Cerca in Progetti: "' + marca + '" → ' + tutti.esito + '; con "senzaallegati" → ' + uno.esito + ' (solo quella scheda); parola inesistente → ' + nessuno.esito);
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '5b-cerca-progetti-390.png'), fullPage: false });
    }

    // 5. Ingegnere: scheda senza foto → Richiedi integrazione → rinvio ------
    if (id1 && ing) {
      psql("insert into public.progetti_tecnici_schede (progetto_tecnico_id, famiglia, numero, dati, stato) values (" + q(id1) +
        ", 'porte_rei', 1, '{\"tipo_richiesta\":\"definitiva\",\"rei\":\"rei_60\"}', 'bozza')");
      const e = await apriSito(browser, url); sessioni.push(e);
      await e.page.setViewport({ width: 390, height: 844 });
      await login(e, ing);
      await e.page.evaluate(async id => { await apriVerificaTecnica(id); }, id1);
      await attendiQuiete(e.stato, 1200);
      await e.page.evaluate(() => { ge('mvt-note').value = 'Manca la foto delle porte: rimandala con le misure'; });
      await e.page.evaluate(async () => { await salvaEsitoVerifica('da_integrare'); });
      await attendiQuiete(e.stato, 1500);
      const sI = statoDi(id1);
      if (!/^da_integrare\|/.test(sI)) KO('6: "Richiedi integrazione" dell\'ingegnere: ' + sI + ' ' + await toastTesto(e));
      else righe.push('6. ingegnere (scheda porte REI senza foto, prezzo e fonte): "Richiedi integrazione" → ' + sI);
      await chiudi(e);

      r.stato.dialoghi = [];
      await r.page.evaluate(async id => { await inviaProgettoAUfficioTecnico(id); }, id1);
      await attendiQuiete(r.stato, 1500);
      const sR = statoDi(id1);
      const dialoghi = testoDialoghi(r);
      if (/Compila la scheda/.test(dialoghi)) KO('7: al rappresentante si cita ancora "Compila la scheda": ' + dialoghi);
      if (con261) {
        if (!/^in_verifica_tecnica\|/.test(sR) || /non si può ancora inviare/.test(dialoghi)) KO('7: con sql/261 il rinvio doveva passare: ' + sR + ' ' + dialoghi + ' ' + await toastTesto(r));
        else righe.push('7. con sql/261: il rappresentante rinvia all\'ingegnere senza blocchi → ' + sR + ' (dialoghi: ' + dialoghi.slice(0, 90) + ')');
        psql('update public.progetti_tecnici set stato = \'da_integrare\' where id = ' + q(id1));
        r.stato.dialoghi = [];
        await r.page.evaluate(async id => { await inviaProgettoAlCommerciale(id); }, id1);
        await attendiQuiete(r.stato, 1500);
        const sA = statoDi(id1);
        if (!/^inviato_a_commerciale\|/.test(sA)) KO('7: con sql/261 il rinvio ad Acquisti doveva passare: ' + sA + ' ' + testoDialoghi(r) + ' ' + await toastTesto(r));
        else righe.push('   e da integrare ad Acquisti → ' + sA);
      } else {
        if (!/^da_integrare\|/.test(sR) || !/Chiedi all’ingegnere di completare la scheda/.test(dialoghi)) KO('7: senza sql/261 doveva fermarsi con "Chiedi all\'ingegnere": ' + sR + ' ' + dialoghi + ' ' + await toastTesto(r));
        else righe.push('7. senza sql/261: fermato dal database, messaggio al rappresentante: "' + dialoghi.split(' / ').pop().slice(0, 140) + '"');
      }
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '7-rinvio-390.png'), fullPage: false });
    } else if (!ing) KO('6: manca un ingegnere attivo');

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(x => (x.status >= 500 || /does not exist|Could not find/i.test(x.msg)) &&
        !/schede_migrate_motore|invio_dopo_visita_attivo|sconto_rappresentante_attivo|progetti_simili_cliente/.test(x.dove + x.msg) /* 404 voluti senza sql/80 e sql/85 */);
      if (rete.length) KO('errori del database: ' + rete.map(x => x.metodo + ' ' + x.dove + ' ' + x.status + ' ' + x.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    try { if (regoleSpente) psql('update public.regole_smistamento set attiva = true where id in (' + regoleSpente + ')'); } catch (e) { console.error('regole di smistamento: ' + e.message); }
    try {
      for (const t of titoli) {
        psql('delete from public.progetti_tecnici_allegati where progetto_id in (select id from public.progetti_tecnici where titolo = ' + q(t) + ')');
        psql('delete from public.progetti_tecnici_schede where progetto_tecnico_id in (select id from public.progetti_tecnici where titolo = ' + q(t) + ')');
        psql('delete from public.progetti_tecnici where titolo = ' + q(t));
      }
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
