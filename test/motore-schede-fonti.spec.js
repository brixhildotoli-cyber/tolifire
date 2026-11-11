#!/usr/bin/env node
// F15.5 - Motore delle schede, parte 2: fonte del rilievo e fonte dei dati
// normativi (sql/79 + js/56, js/17, js/18). Chrome headless con
// puppeteer-core, SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh con
// sql/77, 78 e 79).
// Il "fatto quando" della task:
//  1. il rappresentante, a 390 px, compila una porta REI 60 senza fonte: la
//     scheda si salva, "🔧 Invia a ufficio tecnico" si ferma e dice cosa manca
//     (solo la fonte del dato: dall'11/11, sql/259, il rappresentante non vede
//     né sceglie la fonte del rilievo); dalla console l'invio è rifiutato
//     dal database;
//  2. per la Resistenza al fuoco "Come l'esistente" con la foto della
//     targhetta: salva e il progetto si invia, la fonte del rilievo diventa da
//     sola "sopralluogo_toli" (sito, e con sql/259 anche il database);
//  3. dalla console: il rappresentante non sceglie "ingegnere TOLI",
//     Acquisti (commerciale) non scrive la fonte del rilievo, il tecnico non
//     tocca nulla (ruoli non ammessi rifiutati dal database);
//  4. l'ingegnere sceglie "Definito dall'ingegnere TOLI": nome e data dal
//     database, la scheda del progetto mostra la fonte sotto il dato;
//  5. con le misure dichiarate il PDF del preventivo per il cliente contiene
//     "Misure fornite dal committente, da verificare prima dell'ordine",
//     con il sopralluogo no.
// Con FONTI_SENZA_SQL=1 (dopo il ROLLBACK di sql/79, con 77 e 78): niente
// fonti nel motore e nella finestra del progetto, il progetto si invia come
// prima, il PDF senza la frase, nessun errore.
// Alla fine (solo database locale) si tolgono schede e file di prova e il
// progetto torna com'era.
// Uso: cd test && node motore-schede-fonti.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-motore-schede-fonti');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.5';
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
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const SENZA = CONF.FONTI_SENZA_SQL === '1';
  if (psql("select to_regprocedure('public.motore_stesso_valore(jsonb, jsonb)') is not null") !== 't') fermati('sql/77 e 78 non eseguiti nel database locale');
  const c79 = psql("select to_regprocedure('public.fonti_mancanti_progetto(uuid)') is not null");
  if (!SENZA && c79 !== 't') fermati('sql/79 non eseguito nel database locale');
  if (SENZA && c79 === 't') fermati('FONTI_SENZA_SQL=1 ma sql/79 c\'è: eseguire prima il ROLLBACK di sql/79');
  const riga = psql("select p.id || '|' || p.stato || '|' || p.rappresentante_id from public.progetti_tecnici p join public.utenti u on u.id = p.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where p.stato = 'bozza' and not exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = p.id) order by p.creato_il limit 1");
  if (!riga) fermati('serve un progetto in bozza di un rappresentante senza schede');
  const [progettoId, statoPartenza, rapId] = riga.split('|');
  const inizio = psql('select now()');
  // F15.13 (sql/83): le regole di smistamento attive cambiano l'invio (le prova smistamento-famiglie.spec.js): qui spente, poi riaccese
  const regoleSpente = psql("select case when to_regclass('public.regole_smistamento') is null then '' else (select coalesce(string_agg(id::text, ','), '') from public.regole_smistamento where attiva) end");
  if (regoleSpente) psql('update public.regole_smistamento set attiva = false where id in (' + regoleSpente + ')');
  // F15.9: foto e video obbligatori (sql/82-foto-video) li prova foto-video.spec.js: qui spenti, poi riaccesi
  const docSpenti = psql("update public.lavorazioni_documenti set attivo = false where attivo returning id").split('\n').filter(x => /^\d+$/.test(x));
  // un allegato qualunque: senza, "Invia" si ferma prima (regola di js/17)
  psql("insert into public.progetti_tecnici_allegati (progetto_id, nome_file, storage_path, mime_type, dimensione, caricato_da) values (" +
    q(progettoId) + ", 'planimetria_prova.pdf', " + q(rapId + '/' + progettoId + '/planimetria_prova.pdf') + ", 'application/pdf', 1000, " + q(rapId) + ")");
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const ing = primo('ingegnere'), tec = primo('tecnico'), com = primo('commerciale'), tit = primo('titolare');
  const rap = utenti.find(u => u.id === rapId);
  if (!ing || !tec || !rap || !com || !tit) fermati('servono titolare, ingegnere, tecnico, commerciale e il rappresentante del progetto attivi');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const statoProgetto = () => psql('select stato from public.progetti_tecnici where id = ' + q(progettoId));
  const fonteRei = () => psql("select coalesce(dati->'fonti_normative'->'rei'->>'fonte', '') || '|' || coalesce(dati->'fonti_normative'->'rei'->>'allegato_nome', '') || '|' || coalesce(dati->'fonti_normative'->'rei'->>'da_nome', '') from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' and numero = 1");
  const foto = path.join(CARTELLA_OUT, 'targhetta.png');
  fs.writeFileSync(foto, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  try {
    // 1. Rappresentante a 390 px: porta REI 60 senza fonte ------------------
    const r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);
    // finestra del progetto: campo "Fonte del rilievo"
    await r.page.evaluate(async id => { await apriProgettoDaElenco(id); }, progettoId);
    await attendiQuiete(r.stato, 800);
    const boxModal = await r.page.evaluate(() => { const b = document.getElementById('mp-fonte-rilievo-box'); return b ? getComputedStyle(b).display : 'assente'; });
    // sql/259 (richiesta di Erika dell'11/11): al rappresentante il campo non si mostra mai
    if (boxModal !== 'none') KO('finestra del progetto: campo "Fonte del rilievo" visibile al rappresentante: ' + boxModal);
    else righe.push((SENZA ? 'senza sql/79: ' : '1. ') + 'finestra del progetto del rappresentante, campo Fonte del rilievo: nascosto');
    if (false) {
      await r.page.select('#mp-fonte-rilievo', 'documenti_cliente');
      const nota = await r.page.evaluate(() => { document.getElementById('mp-fonte-rilievo').value = 'misure_dichiarate'; aggiornaNotaFonteRilievoProgetto(); return document.getElementById('mp-fonte-rilievo-nota').textContent; });
      await r.page.select('#mp-fonte-rilievo', 'documenti_cliente');
      await r.page.evaluate(async () => { await salvaProgetto(); });
      await attendiQuiete(r.stato, 1500);
      const frM = psql('select coalesce(fonte_rilievo, \'\') from public.progetti_tecnici where id = ' + q(progettoId));
      if (frM !== 'documenti_cliente' || !/Misure fornite dal committente/.test(nota)) KO('1: finestra del progetto, fonte salvata ' + frM + ', nota ' + nota + ' ' + await toastTesto(r));
      else righe.push('   salvata dalla finestra del progetto: ' + frM + ' (nota per le misure dichiarate: "' + nota + '")');
      psql('update public.progetti_tecnici set fonte_rilievo = null where id = ' + q(progettoId));
    }
    await r.page.evaluate(() => closeM('m-progetto'));

    await apriProgetto(r, progettoId);
    const infoRap = await r.page.evaluate(() => (document.getElementById('pd-info-content') || {}).innerText || '');
    if (/Fonte del rilievo/.test(infoRap)) KO('1: la scheda del progetto mostra "Fonte del rilievo" al rappresentante');
    else righe.push('   scheda del progetto del rappresentante: nessuna riga "Fonte del rilievo"');
    await apriMotore(r);
    const quanti = await r.page.evaluate(() => ({ fonti: document.querySelectorAll('.msm-fonte').length, rilievo: !!document.getElementById('msm-fonte-rilievo'), rei: !!document.getElementById('msm-fonte-rei') }));
    if (SENZA ? (quanti.fonti || quanti.rilievo) : (!quanti.rei || quanti.rilievo)) KO('motore: riquadri delle fonti ' + JSON.stringify(quanti));
    else righe.push('   motore: ' + (SENZA ? 'nessun riquadro delle fonti' : 'niente "📐 Fonte del rilievo" per il rappresentante, "📜 Fonte del dato" sotto Resistenza al fuoco (' + quanti.fonti + ' campo normativo)'));
    await r.page.select('#msm-c-tipo_intervento', 'fornitura_e_posa');
    await r.page.select('#msm-c-rei', 'rei_60');
    await r.page.select('#msm-c-tipologia', 'battente_singolo');
    await scrivi(r, 'msm-c-quantita', '1');
    await scrivi(r, 'msm-c-larghezza', '90');
    await scrivi(r, 'msm-c-altezza', '210');
    await r.page.click('#msm-salva');
    await attendiQuiete(r.stato, 2200);
    const tSalva = await toastTesto(r);
    const salvata = psql("select dati->>'rei' from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' and numero = 1");
    if (salvata !== 'rei_60') KO('1: la scheda senza fonte non è salvata: ' + salvata + ' ' + tSalva);
    else righe.push('   porta REI 60 senza fonte: scheda salvata' + (SENZA ? '' : ', avviso "' + tSalva + '"'));
    if (!SENZA && !/Senza fonte/.test(tSalva)) KO('1: dopo il salvataggio manca l\'avviso "Senza fonte": ' + tSalva);
    await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-senza-fonte-390.png') });
    await r.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });

    if (SENZA) {
      r.stato.dialoghi = [];
      await r.page.evaluate(async id => { await inviaProgettoAUfficioTecnico(id); }, progettoId);
      await attendiQuiete(r.stato, 1200);
      if (statoProgetto() !== 'in_verifica_tecnica') KO('senza sql/79: il progetto non si invia come prima: ' + statoProgetto() + ' ' + testoDialoghi(r));
      else righe.push('   senza sql/79: "Invia a ufficio tecnico" invia come prima (in_verifica_tecnica)');
      psql("update public.progetti_tecnici set stato = 'bozza' where id = " + q(progettoId));
    } else {
      r.stato.dialoghi = [];
      await r.page.evaluate(async id => { await inviaProgettoAUfficioTecnico(id); }, progettoId);
      await attendiQuiete(r.stato, 1200);
      const d1 = testoDialoghi(r);
      if (statoProgetto() !== 'bozza' || /Fonte del rilievo/.test(d1) || !/Resistenza al fuoco richiesta: senza fonte/.test(d1)) KO('1: invio senza fonte del dato: stato ' + statoProgetto() + ', messaggio ' + d1);
      else righe.push('   "🔧 Invia a ufficio tecnico" si ferma: ' + d1.replace(/\n+/g, ' ').slice(0, 260));
      const cons = await r.page.evaluate(async id => {
        const x = await db.from('progetti_tecnici').update({ stato: 'in_verifica_tecnica' }).eq('id', id).select('id');
        return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO';
      }, progettoId);
      if (!/rifiutato: Invio bloccato/.test(cons)) KO('1: console del rappresentante, invio senza fonte: ' + cons);
      else righe.push('   console del rappresentante, invio diretto: ' + cons);

      // 2. Fonte del rilievo, "come l'esistente" con la foto ---------------------
      await apriMotore(r);
      await r.page.select('#msm-f-rei', 'dichiarato_cliente');
      await attendiQuiete(r.stato, 300);
      const btnModulo = await r.page.evaluate(() => [...document.querySelectorAll('#msm-fonte-rei button')].some(b => /Modulo da far firmare/.test(b.textContent)));
      await r.page.evaluate(async () => { await generaModuloDichiarazioneMotore(); });
      await attendiQuiete(r.stato, 1500);
      const tMod = await toastTesto(r);
      const scaricati = fs.existsSync(path.join(CARTELLA_OUT, 'download')) ? fs.readdirSync(path.join(CARTELLA_OUT, 'download')).filter(f => /^Dichiarazione_dati_/.test(f)) : [];
      if (!btnModulo || !/Modulo scaricato/.test(tMod) || !scaricati.length) KO('2: modulo di dichiarazione: bottone ' + btnModulo + ', avviso "' + tMod + '", file ' + scaricati.join(','));
      else righe.push('   "Dichiarato dal cliente": "📄 Modulo da far firmare" scarica ' + scaricati[0]);
      await r.page.select('#msm-f-rei', 'come_esistente');
      await attendiQuiete(r.stato, 300);
      const inp = await r.page.$('#msm-fonte-rei input[type=file]');
      await inp.uploadFile(foto);
      await attendiQuiete(r.stato, 2000);
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '2-come-esistente-390.png'), fullPage: false });
      await r.page.evaluate(() => { const e = document.getElementById('msm-fonte-rei'); if (e) e.scrollIntoView(); });
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '2-fonte-del-dato-390.png') });
      await r.page.click('#msm-salva');
      await attendiQuiete(r.stato, 2000);
      const f2 = fonteRei();
      const fr = psql('select coalesce(fonte_rilievo, \'\') from public.progetti_tecnici where id = ' + q(progettoId));
      if (fr !== '' || !/^come_esistente\|fonte_rei_/.test(f2)) KO('2: fonte del rilievo ' + fr + ', fonte di rei ' + f2 + ' ' + await toastTesto(r));
      else righe.push('2. fonte del rilievo ancora vuota (il rappresentante non la sceglie), Resistenza al fuoco: ' + f2);
      await r.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });
      r.stato.dialoghi = [];
      await r.page.evaluate(async id => { await inviaProgettoAUfficioTecnico(id); }, progettoId);
      await attendiQuiete(r.stato, 1500);
      const frInvio = psql('select coalesce(fonte_rilievo, \'\') from public.progetti_tecnici where id = ' + q(progettoId));
      if (statoProgetto() !== 'in_verifica_tecnica' || frInvio !== 'sopralluogo_toli') KO('2: con la foto della targhetta il progetto non si invia: ' + statoProgetto() + ', fonte ' + frInvio + ' ' + testoDialoghi(r));
      else righe.push('   con la foto della targhetta "🔧 Invia a ufficio tecnico" invia (in_verifica_tecnica), fonte del rilievo messa da sola: ' + frInvio);
      psql("update public.progetti_tecnici set stato = 'bozza' where id = " + q(progettoId));

      // 3. Console: ruoli e fonti non ammessi --------------------------------
      const c3 = await r.page.evaluate(async id => {
        const { data: s } = await db.from('progetti_tecnici_schede').select('id,dati').eq('progetto_tecnico_id', id).eq('famiglia', 'porte_rei').eq('numero', 1).single();
        const f = Object.assign({}, s.dati.fonti_normative, { rei: { fonte: 'ingegnere_toli' } });
        const x = await db.from('progetti_tecnici_schede').update({ dati: Object.assign({}, s.dati, { fonti_normative: f }) }).eq('id', s.id).select('id');
        return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO';
      }, progettoId);
      if (!/rifiutato: .*solo l.ingegnere/.test(c3)) KO('3: console del rappresentante, "ingegnere TOLI": ' + c3);
      else righe.push('3. console del rappresentante, fonte "ingegnere TOLI": ' + c3);
      // sql/259: invio diretto dalla console senza fonte del rilievo (fonte del dato a posto)
      const con259 = psql("select coalesce((select prosrc like '%sql/259%' from pg_proc where oid = to_regprocedure('public.trg_progetti_tecnici_fonti()')), false)") === 't';
      psql('update public.progetti_tecnici set fonte_rilievo = null where id = ' + q(progettoId));
      const c259 = await r.page.evaluate(async id => {
        const x = await db.from('progetti_tecnici').update({ stato: 'in_verifica_tecnica' }).eq('id', id).select('id');
        return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO (' + (x.data || []).length + ')';
      }, progettoId);
      const fr259 = psql('select coalesce(fonte_rilievo, \'\') from public.progetti_tecnici where id = ' + q(progettoId));
      if (con259 ? (!/RIUSCITO \(1\)/.test(c259) || fr259 !== 'sopralluogo_toli') : !/indica la fonte del rilievo/.test(c259)) KO('3: console del rappresentante, invio senza fonte del rilievo: ' + c259 + ', fonte ' + fr259);
      else righe.push('   console del rappresentante, invio senza fonte del rilievo: ' + c259 + (con259 ? ', fonte dal database: ' + fr259 : ' (senza sql/259 il database blocca: per questo la mette il sito)'));
      psql("update public.progetti_tecnici set stato = 'bozza', fonte_rilievo = 'sopralluogo_toli' where id = " + q(progettoId));
      await chiudi(r);

      const c = await apriSito(browser, url); sessioni.push(c);
      await login(c, com);
      const c4 = await c.page.evaluate(async id => {
        const x = await db.from('progetti_tecnici').update({ fonte_rilievo: 'misure_dichiarate' }).eq('id', id).select('id');
        return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO (' + (x.data || []).length + ')';
      }, progettoId);
      if (!/rifiutato: La fonte del rilievo la indicano/.test(c4)) KO('3: console di Acquisti, fonte del rilievo: ' + c4);
      else righe.push('   console di Acquisti (commerciale), fonte del rilievo: ' + c4);
      await chiudi(c);
      const t = await apriSito(browser, url); sessioni.push(t);
      await login(t, tec);
      const c5 = await t.page.evaluate(async id => {
        const x = await db.from('progetti_tecnici').update({ fonte_rilievo: 'misure_dichiarate' }).eq('id', id).select('id');
        return x.error ? 'rifiutato: ' + x.error.message : 'nessuna riga (' + (x.data || []).length + ')';
      }, progettoId);
      const frT = psql('select fonte_rilievo from public.progetti_tecnici where id = ' + q(progettoId));
      if (frT !== 'sopralluogo_toli') KO('3: il tecnico ha cambiato la fonte del rilievo: ' + c5);
      else righe.push('   console del tecnico: ' + c5 + ', fonte del rilievo invariata');
      await chiudi(t);

      // 4. Ingegnere: "Definito dall'ingegnere TOLI" ----------------------------
      psql("update public.progetti_tecnici set stato = 'in_verifica_tecnica' where id = " + q(progettoId));
      const g = await apriSito(browser, url); sessioni.push(g);
      await login(g, ing);
      await apriProgetto(g, progettoId);
      await apriMotore(g);
      await g.page.select('#msm-f-rei', 'ingegnere_toli');
      await g.page.click('#msm-salva');
      await attendiQuiete(g.stato, 2000);
      const f4 = fonteRei();
      if (!/^ingegnere_toli\|\|.+/.test(f4)) KO('4: fonte dell\'ingegnere: ' + f4 + ' ' + await toastTesto(g));
      else righe.push('4. ingegnere, "Definito dall\'ingegnere TOLI": ' + f4 + ' (nome dal database)');
      await g.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });
      await attendiQuiete(g.stato, 1200);
      const sotto = await g.page.evaluate(() => (document.getElementById('pd-schede-content') || {}).innerText || '');
      if (!/📜 Definito dall.ingegnere TOLI/.test(sotto)) KO('4: nella scheda del progetto manca la fonte sotto il dato');
      else righe.push('   scheda del progetto: "' + (sotto.match(/📜 Definito[^\n]*/) || [''])[0] + '"');
      const fonteInfo = await g.page.evaluate(() => (document.getElementById('pd-info-content') || {}).innerText || '');
      if (!/Fonte del rilievo\s*Sopralluogo TOLI/.test(fonteInfo)) KO('4: nella scheda del progetto manca "Fonte del rilievo": ' + fonteInfo.slice(0, 200));
      await g.page.screenshot({ path: path.join(CARTELLA_OUT, '4-ingegnere.png') });
      await chiudi(g);
    }

    // 5. PDF del preventivo per il cliente --------------------------------------
    const p = await apriSito(browser, url); sessioni.push(p);
    await login(p, tit);
    await p.page.evaluate(async id => { await apriProgettoDaElenco(id); }, progettoId);
    await attendiQuiete(p.stato, 800);
    const boxTit = await p.page.evaluate(() => { const b = document.getElementById('mp-fonte-rilievo-box'); return b ? getComputedStyle(b).display : 'assente'; });
    if (SENZA ? boxTit !== 'none' : boxTit === 'none') KO('titolare: campo "Fonte del rilievo" nella finestra del progetto ' + boxTit);
    else righe.push('   titolare: campo "Fonte del rilievo" nella finestra del progetto ' + (SENZA ? 'nascosto (senza sql/79)' : 'visibile'));
    await p.page.evaluate(() => closeM('m-progetto'));
    const pdfTesto = async fonte => {
      if (!SENZA) psql('update public.progetti_tecnici set fonte_rilievo = ' + (fonte ? q(fonte) : 'null') + ' where id = ' + q(progettoId));
      return p.page.evaluate(async id => {
        const r = await generaPreventivoClientePDF({
          preventivo: { id: '00000000-0000-0000-0000-000000000000', numero: 'PROVA-79', tipo: 'fornitura_e_posa', data_scadenza: null, iva_perc: 22,
            totale_imponibile: 100, note: '', condizioni_pagamento: 'Bonifico', progetto_tecnico_id: id, clienti: { ragione_sociale: 'Cliente di prova' } },
          voci: [{ descrizione: 'Porta REI 60', unita_misura: 'pz', quantita: 1, prezzo_unitario: 100, ordinamento: 1 }]
        });
        if (!r || !r.blob) return 'NESSUN PDF';
        return await r.blob.text();
      }, progettoId);
    };
    const conDich = await pdfTesto('misure_dichiarate');
    const conSopr = await pdfTesto('sopralluogo_toli');
    const ha = t => /Misure fornite dal committente, da verificare prima dell/.test(t);
    if (SENZA) {
      if (ha(conDich)) KO('senza sql/79 il PDF ha la frase delle misure dichiarate');
      else righe.push('   senza sql/79: PDF del cliente senza la frase, come prima');
    } else if (!ha(conDich) || ha(conSopr)) KO('5: PDF, frase con misure dichiarate ' + ha(conDich) + ', con sopralluogo ' + ha(conSopr));
    else righe.push('5. PDF del cliente: con "misure dichiarate" stampa "Misure fornite dal committente, da verificare prima dell\'ordine", con il sopralluogo no');
    await chiudi(p);

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(x => (x.status >= 500 || /does not exist|Could not find/i.test(x.msg) && !/schede_migrate_motore|invio_dopo_visita_attivo|sconto_rappresentante_attivo/.test(x.msg) /* F15.6 e F15.15: 404 voluti senza sql/80 e sql/85 */) &&
        !(SENZA && (/fonti_dati_attive/.test(x.dove) || /fonte_rilievo/.test(x.msg))));
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
      psql('update public.progetti_tecnici set stato = ' + q(statoPartenza) + (SENZA ? '' : ', fonte_rilievo = null') + ' where id = ' + q(progettoId));
      psql("delete from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and creato_il >= " + q(inizio));
      psql("delete from public.progetti_tecnici_allegati where progetto_id = " + q(progettoId) + " and caricato_il >= " + q(inizio));
      if (docSpenti.length) psql('update public.lavorazioni_documenti set attivo = true where id in (' + docSpenti.join(',') + ')');
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
