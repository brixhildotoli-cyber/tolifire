#!/usr/bin/env node
// F15.8 - Blocco comune e controlli di invio (sql/82 + js/56, js/17).
// Chrome headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh con sql/77-82).
// Il "fatto quando" della task:
//  1. il rappresentante, a 390 px, compila il blocco comune (le 6 domande del
//     primo contatto, tutte facoltative) e lo ritrova nella scheda progetto;
//  2. una porta REI senza quantità (campo che serve al prezzo): dall'11/11
//     (sql/261) il sito non ferma più il rappresentante; con sql/261 parte
//     (anche dalla console), senza lo ferma il database e il sito dice solo
//     "Chiedi all'ingegnere di completare la scheda";
//  3. quantità "xx" e REI "Classe superiore / da definire": come il punto 2;
//  4. con la quantità scritta, e un campo facoltativo "da verificare ?", il
//     progetto si invia ad Acquisti.
// Con BLOCCO_COMUNE_SENZA_SQL=1 (dopo il ROLLBACK di sql/82): nessun
// riquadro del blocco comune, il rappresentante invia (dall'11/11 il sito non
// lo ferma, il database senza sql/82 nemmeno), nessun errore.
// Regole di smistamento spente durante la prova (come dopo sql/260).
// Alla fine (solo database locale) si tolgono schede e file di prova e il
// progetto torna com'era.
// Uso: cd test && node blocco-comune.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-blocco-comune');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.8';
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

async function inviaE(s, funzione, progettoId) {
  s.stato.dialoghi = [];
  await s.page.evaluate(async (f, id) => { await window[f](id); }, funzione, progettoId);
  await attendiQuiete(s.stato, 1500);
  return testoDialoghi(s);
}
const chiudiScheda = s => s.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const SENZA = CONF.BLOCCO_COMUNE_SENZA_SQL === '1';
  if (psql("select to_regprocedure('public.fonti_mancanti_progetto(uuid)') is not null") !== 't') fermati('sql/77-79 non eseguiti nel database locale');
  const c82 = psql("select to_regprocedure('public.controlli_invio_progetto(uuid)') is not null");
  if (!SENZA && c82 !== 't') fermati('sql/82 non eseguito nel database locale');
  if (SENZA && c82 === 't') fermati('BLOCCO_COMUNE_SENZA_SQL=1 ma sql/82 c\'è: eseguire prima il ROLLBACK di sql/82');
  const riga = psql("select p.id || '|' || p.stato || '|' || p.rappresentante_id || '|' || coalesce(p.fonte_rilievo, '') from public.progetti_tecnici p join public.utenti u on u.id = p.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where p.stato = 'bozza' and not exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = p.id) order by p.creato_il limit 1");
  if (!riga) fermati('serve un progetto in bozza di un rappresentante senza schede');
  const [progettoId, statoPartenza, rapId, fontePartenza] = riga.split('|');
  const inizio = psql('select now()');
  // F15.9: foto e video obbligatori (sql/82-foto-video) li prova foto-video.spec.js: qui spenti, poi riaccesi
  const docSpenti = psql("update public.lavorazioni_documenti set attivo = false where attivo returning id").split('\n').filter(x => /^\d+$/.test(x));
  // regole di smistamento spente come in produzione dopo sql/260 (i due bottoni), riaccese alla fine
  const regoleSpente = psql("select case when to_regclass('public.regole_smistamento') is null then '' else (select coalesce(string_agg(id::text, ','), '') from public.regole_smistamento where attiva) end");
  if (regoleSpente) psql('update public.regole_smistamento set attiva = false where id in (' + regoleSpente + ')');
  // sql/261 (richiesta di Erika dell'11/11): il sito non ferma più il
  // rappresentante; con sql/261 (o senza sql/82) nemmeno il database
  const con261 = psql("select coalesce((select prosrc like '%sql/261%' from pg_proc where oid = to_regprocedure('public.trg_progetti_tecnici_invio_completo()')), false)") === 't';
  const libero = SENZA || con261;
  // Allegato (regola di js/17), fonte del rilievo e foto della targhetta (sql/79): qui non si prova la fonte
  psql("update public.progetti_tecnici set fonte_rilievo = 'sopralluogo_toli' where id = " + q(progettoId));
  psql("insert into public.progetti_tecnici_allegati (progetto_id, nome_file, storage_path, mime_type, dimensione, caricato_da) values (" +
    q(progettoId) + ", 'planimetria_prova.pdf', " + q(rapId + '/' + progettoId + '/planimetria_prova.pdf') + ", 'application/pdf', 1000, " + q(rapId) + ")");
  const fotoId = psql("insert into public.progetti_tecnici_allegati (progetto_id, nome_file, storage_path, mime_type, dimensione, caricato_da) values (" +
    q(progettoId) + ", 'targhetta_prova.jpg', " + q(rapId + '/' + progettoId + '/fonti/targhetta_prova.jpg') + ", 'image/jpeg', 1000, " + q(rapId) + ") returning id").split('\n')[0];
  // Porta REI 60 con la fonte, SENZA quantità (campo che serve al prezzo)
  const base = { tipo_richiesta: 'definitiva', tipo_intervento: 'fornitura_e_posa', rei: 'rei_60', tipologia: 'battente_singolo', larghezza: 90, altezza: 210,
    fonti_normative: { rei: { valore: 'rei_60', fonte: 'come_esistente', allegato_id: fotoId, allegato_nome: 'targhetta_prova.jpg' } } };
  psql("insert into public.progetti_tecnici_schede (progetto_tecnico_id, famiglia, numero, dati, stato, compilato_da) values (" +
    q(progettoId) + ", 'porte_rei', 1, " + q(JSON.stringify(base)) + "::jsonb, 'bozza', " + q(rapId) + ")");
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const rap = utenti.find(u => u.id === rapId);
  if (!rap) fermati('serve il rappresentante del progetto attivo');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const statoProgetto = () => psql('select stato from public.progetti_tecnici where id = ' + q(progettoId));
  try {
    const r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);
    await apriProgetto(r, progettoId);

    // 1. Blocco comune ---------------------------------------------------------
    const riquadro = await r.page.evaluate(() => ({
      comune: !!document.getElementById('msm-comune'),
      nelMenu: [...document.querySelectorAll('#msm-lavorazione option')].some(o => o.value === 'comune')
    }));
    if (riquadro.nelMenu) KO('il blocco comune compare tra le lavorazioni da compilare');
    if (SENZA) {
      if (riquadro.comune) KO('senza sql/82 compare il riquadro del blocco comune');
      else righe.push('senza sql/82: nessun riquadro "📋 Blocco comune", nessuna voce "comune" nel menu delle lavorazioni');
    } else if (riquadro.comune) {
      // dall'11/11 (richiesta di Erika) il rappresentante non ha più il riquadro
      KO('1: il rappresentante vede ancora il riquadro "📋 Blocco comune"');
    } else {
      righe.push('1. il rappresentante non ha il riquadro "📋 Blocco comune" (11/11): la prova apre la scheda comune con apriSchedaMotore (policy di sql/77 invariate)');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-riquadro-390.png') });
      await r.page.evaluate(async id => { await apriSchedaMotore(id, 'comune', 1); }, progettoId);
      await r.page.waitForSelector('#msm-motore[data-famiglia="comune"]', { timeout: 10000 });
      await attendiQuiete(r.stato, 600);
      const forma = await r.page.evaluate(() => ({
        tab: !!document.getElementById('rsm-tab-nuova'), tipo: !!document.getElementById('msm-tipo-richiesta'),
        data: (document.getElementById('msm-c-entro_il') || {}).type, asterischi: document.querySelectorAll('#msm-motore b[style*="--r"]').length
      }));
      if (forma.tab || forma.tipo || forma.data !== 'date' || forma.asterischi) KO('1: forma del blocco comune ' + JSON.stringify(forma));
      else righe.push('1. blocco comune a 390 px: niente tab "+ Nuova scheda" né tipo di richiesta, "Entro quando" con il calendario, nessun campo obbligatorio');
      await scrivi(r, 'msm-referente', 'Mario Rossi');
      await scrivi(r, 'msm-telefono-referente', '+39 333 1234567');
      await scrivi(r, 'msm-c-chi_decide', 'Ing. Bianchi, direttore');
      await r.page.select('#msm-c-motivo_lavoro', 'richiesta_spontanea');
      await r.page.evaluate(() => { document.getElementById('msm-c-entro_il').value = '2026-12-15'; });
      await r.page.select('#msm-c-entro_motivo', 'scadenza_scia');
      await scrivi(r, 'msm-c-accessi', 'Badge in portineria');
      await scrivi(r, 'msm-c-orari', '8-12, da verificare');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-blocco-comune-390.png'), fullPage: true });
      await r.page.click('#msm-salva');
      await attendiQuiete(r.stato, 2000);
      const salvato = psql("select coalesce(dati->>'referente_lavori','') || '|' || coalesce(dati->>'motivo_lavoro','') || '|' || coalesce(dati->>'entro_il','') || '|' || coalesce(dati->>'orari','') from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'comune' and numero = 1");
      if (salvato !== 'Mario Rossi|richiesta_spontanea|2026-12-15|8-12, da verificare') KO('1: blocco comune salvato: ' + salvato + ' ' + await toastTesto(r));
      else righe.push('   salvato: ' + salvato);
      await chiudiScheda(r);
      await attendiQuiete(r.stato, 1500);
      const vista = await r.page.evaluate(() => ({
        schede: (document.getElementById('pd-schede-content') || {}).innerText || '',
        bottone: (document.getElementById('msm-comune-btn') || {}).textContent || ''
      }));
      if (!/Richiesta spontanea del cliente/.test(vista.schede) || !/15\/12\/2026/.test(vista.schede) || vista.bottone) {
        KO('1: scheda del progetto: ' + vista.bottone.trim() + ' / ' + vista.schede.slice(0, 300));
      } else righe.push('   scheda del progetto: "Richiesta spontanea del cliente", data 15/12/2026, bottone "' + vista.bottone.trim() + '"');
    }

    // 2. Quantità vuota (serve al prezzo): non si invia ------------------------
    // con sql/261 parte; senza lo ferma il database e il sito dice solo
    // "chiedi all'ingegnere di completare la scheda"
    const controllaInvio = (n, cosa, d, statoAtteso) => {
      if (/: manca|non basta|«xx»|Compila la scheda/.test(d)) KO(n + ': ' + cosa + ': al rappresentante il sito elenca ancora i dati o cita "Compila la scheda": ' + d);
      const st = statoProgetto();
      if (libero) {
        if (st !== statoAtteso) KO(n + ': ' + cosa + ': doveva partire (' + (SENZA ? 'senza sql/82' : 'sql/261') + '): stato ' + st + ', messaggio ' + d);
        else righe.push(n + '. ' + cosa + ': il rappresentante invia lo stesso (' + st + (SENZA ? ', senza sql/82' : ', sql/261') + ')');
        psql("update public.progetti_tecnici set stato = 'bozza' where id = " + q(progettoId));
      } else if (st !== 'bozza' || !/Chiedi all’ingegnere di completare la scheda/.test(d)) KO(n + ': ' + cosa + ': stato ' + st + ', messaggio ' + d);
      else righe.push(n + '. ' + cosa + ': senza sql/261 il database ferma l\'invio, il sito dice: ' + d.split(' / ').pop().slice(0, 160));
    };
    const d1 = await inviaE(r, 'inviaProgettoAlCommerciale', progettoId);
    controllaInvio('2', 'quantità vuota', d1, 'inviato_a_commerciale');
    const cons = await r.page.evaluate(async id => {
      const x = await db.from('progetti_tecnici').update({ stato: 'inviato_a_commerciale' }).eq('id', id).select('id');
      return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO';
    }, progettoId);
    if (libero) {
      if (cons !== 'RIUSCITO') KO((SENZA ? 'senza sql/82' : 'con sql/261') + ': la console doveva inviare (nessun blocco nel database per il rappresentante): ' + cons);
      else righe.push('   ' + (SENZA ? 'senza sql/82' : 'con sql/261') + ': il database non blocca il rappresentante');
      psql("update public.progetti_tecnici set stato = 'bozza' where id = " + q(progettoId));
    } else if (!/rifiutato: Invio bloccato, dati per il preventivo/.test(cons)) KO('2: console del rappresentante: ' + cons);
    else righe.push('   console del rappresentante, invio diretto: ' + cons.slice(0, 160));

    // 3. Quantità "xx" (scritta dall'ingegnere come testo) e "da definire" ------
    psql("update public.progetti_tecnici_schede set dati = dati || '{\"quantita\":\"xx\"}' where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei'");
    const d2 = await inviaE(r, 'inviaProgettoAUfficioTecnico', progettoId);
    controllaInvio('3', 'quantità "xx"', d2, 'in_verifica_tecnica');
    psql("update public.progetti_tecnici_schede set dati = dati || " + q(JSON.stringify({ quantita: 2, rei: 'classe_superiore', fonti_normative: { rei: { valore: 'classe_superiore', fonte: 'come_esistente', allegato_id: fotoId } } })) + "::jsonb where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei'");
    const d3 = await inviaE(r, 'inviaProgettoAlCommerciale', progettoId);
    controllaInvio('3', 'REI "Classe superiore / da definire"', d3, 'inviato_a_commerciale');
    psql("update public.progetti_tecnici_schede set dati = dati || " + q(JSON.stringify({ quantita: null, rei: 'rei_60', fonti_normative: base.fonti_normative })) + "::jsonb where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei'");

    // 4. Il rappresentante scrive la quantità; un facoltativo "da verificare": si invia
    await apriMotore(r);
    await scrivi(r, 'msm-c-quantita', '2');
    if (await r.page.$('#msm-c-note_vano')) await scrivi(r, 'msm-c-note_vano', 'da verificare ?');
    await r.page.click('#msm-salva');
    await attendiQuiete(r.stato, 2000);
    const q4 = psql("select coalesce(dati->>'quantita','') || '|' || coalesce(dati->>'note_vano','') from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei'");
    await chiudiScheda(r);
    const d4 = await inviaE(r, 'inviaProgettoAlCommerciale', progettoId);
    if (statoProgetto() !== 'inviato_a_commerciale') KO('4: con la quantità (' + q4 + ') il progetto non si invia: ' + statoProgetto() + ' ' + d4 + ' ' + await toastTesto(r));
    else righe.push('4. quantità 2 e note del vano "da verificare ?" (facoltativo): inviato ad Acquisti (' + q4 + ')');
    await r.page.screenshot({ path: path.join(CARTELLA_OUT, '4-inviato-390.png') });

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(x => (x.status >= 500 || /does not exist|Could not find/i.test(x.msg)) &&
        !(SENZA && /controlli_invio_progetto/.test(x.dove + x.msg)) && !/invio_dopo_visita_attivo|sconto_rappresentante_attivo/.test(x.dove + x.msg) /* F15.15, sql/258: 404 voluti */);
      if (rete.length) KO('errori del database: ' + rete.map(x => x.metodo + ' ' + x.dove + ' ' + x.status + ' ' + x.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    try {
      psql('update public.progetti_tecnici set stato = ' + q(statoPartenza) + ', fonte_rilievo = ' + (fontePartenza ? q(fontePartenza) : 'null') + ' where id = ' + q(progettoId));
      psql("delete from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and creato_il >= " + q(inizio));
      psql("delete from public.progetti_tecnici_allegati where progetto_id = " + q(progettoId) + " and caricato_il >= " + q(inizio));
      if (docSpenti.length) psql('update public.lavorazioni_documenti set attivo = true where id in (' + docSpenti.join(',') + ')');
      if (regoleSpente) psql('update public.regole_smistamento set attiva = true where id in (' + regoleSpente + ')');
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
