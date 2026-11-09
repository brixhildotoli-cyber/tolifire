#!/usr/bin/env node
// F15.4 - Motore delle schede, parte 1b (sql/78 + js/56, js/18, js/66):
// protezioni, plausibilità, campi del prezzo. Chrome headless con
// puppeteer-core, SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh con
// sql/77 e 78).
// Il "fatto quando" della task:
//  1. il rappresentante, a 390 px, nel motore scrive "larghezza 1000 cm":
//     "💾 Salva scheda" non salva e dice quale dato ricontrollare; con 100 salva;
//  2. dalla CONSOLE il rappresentante non scrive larghezza 1000, un campo di
//     livello ingegnere (note_tecniche), la copia del commerciale, e una
//     posizione P-xx da 1000 cm: il database rifiuta (con il motivo);
//  3. l'ingegnere salva 400 cm dopo la conferma "fuori dal plausibile"; il
//     tecnico (ruolo non ammesso) è rifiutato; il commerciale scrive ancora la
//     sua copia della scheda;
//  4. gli obbligatori (*) sono i campi che servono al prezzo (serve_al_prezzo).
// Con MOTORE_PROTEZIONI_SENZA_SQL=1 (dopo il ROLLBACK di sql/78, con sql/77):
// il sito funziona come con il 77 (il sito ferma comunque 1000 cm, stelline
// dagli "obbligatori"), nessun errore; il database accetta la console (si
// verifica che la protezione sia proprio del 78).
// Alla fine (solo database locale) si tolgono schede e posizioni di prova.
// Uso: cd test && node motore-schede-protezioni.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-motore-schede-protezioni');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.4';
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

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const SENZA = CONF.MOTORE_PROTEZIONI_SENZA_SQL === '1';
  if (psql("select to_regprocedure('public.motore_schede_attivo()') is not null") !== 't') fermati('sql/77 non eseguito nel database locale');
  const c78 = psql("select to_regprocedure('public.motore_controlla_dati_rappresentante(text, jsonb, jsonb, numeric, numeric)') is not null");
  if (!SENZA && c78 !== 't') fermati('sql/78 non eseguito nel database locale');
  if (SENZA && c78 === 't') fermati('MOTORE_PROTEZIONI_SENZA_SQL=1 ma sql/78 c\'è: eseguire prima il ROLLBACK di sql/78');
  const riga = psql("select p.id || '|' || p.stato || '|' || p.rappresentante_id from public.progetti_tecnici p join public.utenti u on u.id = p.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where p.stato = 'bozza' and not exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = p.id and s.famiglia = 'porte_rei') order by p.creato_il limit 1");
  if (!riga) fermati('serve un progetto in bozza di un rappresentante senza scheda porte REI');
  const [progettoId, statoPartenza, rapId] = riga.split('|');
  const inizio = psql('select now()');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const ing = primo('ingegnere'), tec = primo('tecnico'), com = primo('commerciale');
  const rap = utenti.find(u => u.id === rapId);
  if (!ing || !tec || !rap || !com) fermati('servono ingegnere, tecnico, commerciale e il rappresentante del progetto attivi');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const leggiScheda = () => psql("select coalesce(dati->>'larghezza', '') || '|' || coalesce(dati->>'note_tecniche', '') || '|' || coalesce(dati_commerciali::text, '') from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' and numero = 1");
  try {
    // 1. Rappresentante a 390 px nel motore -------------------------------------
    const r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);
    await apriProgetto(r, progettoId);
    await apriMotore(r);
    const stelle = await r.page.evaluate(() => [...document.querySelectorAll('[data-campo-motore]')].filter(x => /\*/.test(x.querySelector('label').textContent)).map(x => x.dataset.campoMotore).sort().join(','));
    const prezzo = psql("select string_agg(c.codice, ',' order by c.codice) from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = 'porte_rei' and c.attivo and c.obbligatorio and not c.per_posizione and c.tipo <> 'foto'");
    if (stelle !== prezzo) KO('4: campi con * nel motore ' + stelle + ' invece di ' + prezzo);
    else righe.push('4. * solo sui campi che servono al prezzo: ' + stelle);
    if (!SENZA) {
      const dif = psql('select count(*) from public.lavorazioni_campi where obbligatorio <> serve_al_prezzo');
      if (dif !== '0') KO('4: obbligatorio diverso da serve_al_prezzo in ' + dif + ' campi');
    }
    await r.page.select('#msm-c-tipo_intervento', 'fornitura_e_posa');
    await r.page.select('#msm-c-rei', 'rei_60');
    await r.page.select('#msm-c-tipologia', 'battente_singolo');
    await scrivi(r, 'msm-c-quantita', '2');
    await scrivi(r, 'msm-c-larghezza', '1000');
    await scrivi(r, 'msm-c-altezza', '210');
    await r.page.click('#msm-salva');
    await attendiQuiete(r.stato, 900);
    const t1 = await toastTesto(r);
    const salvata1 = leggiScheda();
    if (!/Larghezza: 1000 cm è fuori dal plausibile \(60-300 cm\)/.test(t1) || salvata1) KO('1: larghezza 1000 nel motore: avviso "' + t1 + '", nel database "' + salvata1 + '"');
    else righe.push('1. rappresentante a 390 px, larghezza 1000: non salva, avviso "' + t1 + '"');
    await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-rappresentante-1000-390.png') });
    await scrivi(r, 'msm-c-larghezza', '100');
    await r.page.click('#msm-salva');
    await attendiQuiete(r.stato, 1500);
    const salvata2 = leggiScheda();
    if (!/^100\|/.test(salvata2)) KO('1: con 100 cm la scheda non è salvata: ' + salvata2);
    else righe.push('   corretto in 100 cm: salvata (' + salvata2 + ')');
    await r.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });

    // l'ingegnere scrive le sue note (dal database: è lui, ruolo vero)
    // ... e una larghezza da portone salvata come TESTO (come la scheda di js/18: "350")
    psql("update public.progetti_tecnici_schede set dati = dati || '{\"note_tecniche\":\"Controtelaio da verificare\",\"larghezza\":\"350\"}' where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' and numero = 1");

    // il rappresentante riapre e salva un altro dato: le note dell'ingegnere restano
    await apriMotore(r);
    const roNote = await r.page.evaluate(() => [document.getElementById('msm-c-note_tecniche').disabled, document.getElementById('msm-c-note_tecniche').value]);
    await scrivi(r, 'msm-c-colore', 'RAL 9010');
    await r.page.click('#msm-salva');
    await attendiQuiete(r.stato, 1500);
    const dopoColore = psql("select coalesce(dati->>'colore', '') || '|' || coalesce(dati->>'note_tecniche', '') || '|' || (dati->>'larghezza') from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' and numero = 1");
    if (!roNote[0] || dopoColore !== 'RAL 9010|Controtelaio da verificare|350') KO('1: con le note dell\'ingegnere e larghezza "350" in testo: sola lettura ' + roNote[0] + ', salvato ' + dopoColore + ' ' + await toastTesto(r));
    else righe.push('   note 🎓 dell\'ingegnere in sola lettura e larghezza "350" salvata come testo dall\'ingegnere: salvando il colore restano: ' + dopoColore);
    psql("update public.progetti_tecnici_schede set dati = dati || '{\"larghezza\":100}' where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' and numero = 1");
    await r.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });

    // 2. Console del rappresentante ---------------------------------------------
    const cons = await r.page.evaluate(async prog => {
      const out = {};
      const { data: s } = await db.from('progetti_tecnici_schede').select('id,dati').eq('progetto_tecnico_id', prog).eq('famiglia', 'porte_rei').eq('numero', 1).single();
      const prova = async (nome, campi) => {
        const r = await db.from('progetti_tecnici_schede').update(campi).eq('id', s.id).select('id');
        out[nome] = r.error ? 'rifiutato: ' + r.error.message : 'RIUSCITO (' + (r.data || []).length + ' righe)';
      };
      await prova('larghezza 1000', { dati: Object.assign({}, s.dati, { larghezza: 1000 }) });
      await prova('note tecniche', { dati: Object.assign({}, s.dati, { note_tecniche: 'Sconto 30%' }) });
      await prova('copia del commerciale', { dati_commerciali: { larghezza: '95' } });
      await prova('numero della scheda', { numero: 55 });
      if (/RIUSCITO/.test(out['numero della scheda'])) await db.from('progetti_tecnici_schede').update({ numero: 1 }).eq('id', s.id); // senza sql/78: si rimette
      const ins = await db.from('progetti_tecnici_schede').insert({ progetto_tecnico_id: prog, famiglia: 'porte_rei', numero: 54, dati: { quantita: 1, note_calcolo: 'margine 50%' }, compilato_da: ME.id });
      out['scheda nuova con note interne'] = ins.error ? 'rifiutato: ' + ins.error.message : 'RIUSCITO';
      const pos = await db.from('progetti_tecnici_posizioni').insert({ scheda_id: s.id, progetto_tecnico_id: prog, numero: 1, quantita: 1, dati: { larghezza: 1000, altezza: 210 } }).select('id');
      out['posizione 1000 cm'] = pos.error ? 'rifiutato: ' + pos.error.message : 'RIUSCITO';
      return out;
    }, progettoId);
    const attesiRifiuti = {
      'larghezza 1000': /fuori dal plausibile/, 'note tecniche': /lo compila l.ingegnere/, 'copia del commerciale': /copia del commerciale/,
      'numero della scheda': /non sposta una scheda/, 'scheda nuova con note interne': /Note interne per il calcolo/, 'posizione 1000 cm': /fuori dal plausibile/
    };
    Object.keys(attesiRifiuti).forEach(k => {
      if (SENZA) {
        if (k === 'posizione 1000 cm' || k === 'larghezza 1000' || k === 'note tecniche') {
          if (!/RIUSCITO/.test(cons[k])) KO('senza sql/78: la console del rappresentante "' + k + '" dovrebbe riuscire (la protezione è del 78): ' + cons[k]);
        }
      } else if (!attesiRifiuti[k].test(cons[k])) KO('2: console del rappresentante, ' + k + ': ' + cons[k]);
    });
    righe.push((SENZA ? 'senza sql/78, ' : '2. ') + 'console del rappresentante: ' + Object.keys(cons).map(k => k + ' → ' + cons[k]).join(' · '));
    if (!SENZA) {
      const intatta = leggiScheda();
      if (intatta !== '100|Controtelaio da verificare|') KO('2: dopo la console la scheda è cambiata: ' + intatta);
      else righe.push('   la scheda nel database è intatta: ' + intatta);
    }
    await chiudi(r);

    // 3. Ingegnere: 400 cm con conferma; tecnico; commerciale ---------------------
    const g = await apriSito(browser, url); sessioni.push(g);
    await login(g, ing);
    await apriProgetto(g, progettoId);
    await apriMotore(g);
    await scrivi(g, 'msm-c-larghezza', '400');
    await g.page.click('#msm-salva');
    await attendiQuiete(g.stato, 1500);
    const dl = g.stato.dialoghi.join(' / ');
    const lIng = psql("select dati->>'larghezza' from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' and numero = 1");
    if (!/Larghezza: 400 cm è fuori dal plausibile/.test(dl) || lIng !== '400') KO('3: ingegnere 400 cm: conferma "' + dl + '", salvato ' + lIng);
    else righe.push('3. l\'ingegnere salva 400 cm dopo la conferma: "' + dl.split('\n').filter(Boolean).slice(0, 2).join(' ') + '"');
    await g.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });
    await chiudi(g);

    const t = await apriSito(browser, url); sessioni.push(t);
    await login(t, tec);
    const c4 = await t.page.evaluate(async prog => {
      const ins = await db.from('progetti_tecnici_schede').insert({ progetto_tecnico_id: prog, famiglia: 'porte_rei', numero: 53, dati: { larghezza: 1000 } });
      return ins.error ? 'rifiutato: ' + ins.error.message : 'RIUSCITO';
    }, progettoId);
    if (!/rifiutato/.test(c4)) KO('3: console del tecnico: ' + c4);
    else righe.push('   console del tecnico (ruolo non ammesso): ' + c4);
    await chiudi(t);

    psql("update public.progetti_tecnici set stato = 'inviato_a_commerciale' where id = " + q(progettoId));
    const c = await apriSito(browser, url); sessioni.push(c);
    await login(c, com);
    const c5 = await c.page.evaluate(async prog => {
      const r = await db.from('progetti_tecnici_schede').update({ dati_commerciali: { larghezza: '95', note_tecniche: 'copia' }, ultima_modifica_commerciale_da: ME.id, ultima_modifica_commerciale_il: new Date().toISOString() })
        .eq('progetto_tecnico_id', prog).eq('famiglia', 'porte_rei').eq('numero', 1).select('id');
      return r.error ? 'rifiutato: ' + r.error.message : 'riuscito (' + r.data.length + ' riga)';
    }, progettoId);
    if (!/riuscito \(1 riga\)/.test(c5)) KO('3: il commerciale non scrive più la sua copia: ' + c5);
    else righe.push('   il commerciale scrive ancora la sua copia della scheda: ' + c5);
    await chiudi(c);

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(x => x.status >= 500 || /does not exist|Could not find/i.test(x.msg) && !/schede_migrate_motore/.test(x.msg) /* F15.6: 404 voluto senza sql/80 */);
      if (rete.length) KO('errori del database: ' + rete.map(x => x.metodo + ' ' + x.dove + ' ' + x.status + ' ' + x.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    try {
      psql('update public.progetti_tecnici set stato = ' + q(statoPartenza) + ' where id = ' + q(progettoId));
      psql("delete from public.progetti_tecnici_posizioni where progetto_tecnico_id = " + q(progettoId) + " and creata_il >= " + q(inizio));
      psql("delete from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' and creato_il >= " + q(inizio));
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
