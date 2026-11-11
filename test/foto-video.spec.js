#!/usr/bin/env node
// F15.9 - Foto e video (sql/82-foto-video + js/56, js/17, js/66).
// Chrome headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh con sql/77-82 e 82-foto-video + -VINCOLO).
// Il "fatto quando" della task:
//  1. rappresentante a 390 px: la porta REI senza foto e video. Dall'11/11
//     (sql/261) il sito non lo ferma: con sql/261 parte (anche da console),
//     senza lo ferma il database con "Chiedi all'ingegnere di completare la
//     scheda"; nella scheda carica 2 foto e un video mp4
//     di 40 MB, salva: nel database le voci con l'impronta SHA-256;
//  2. la stessa foto su due posizioni P-xx è rifiutata (sito e database);
//  3. con foto e video il progetto si invia ad Acquisti; la console di
//     Acquisti che toglie le foto della scheda è rifiutata dal database;
//  4. ingegnere: "🚫 Video impossibile" con il motivo dalla lista, chi e quando
//     dal database; il progetto si invia.
// Con FOTO_VIDEO_SENZA_SQL=1 (dopo 82-foto-video-ROLLBACK.sql): nessun
// riquadro, file senza impronta come prima, nessun blocco, nessun errore.
// Alla fine (solo database locale) si tolgono schede, posizioni e file di
// prova e il progetto torna com'era.
// Uso: cd test && node foto-video.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-foto-video');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.9';
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


const fileFinto = (nome, byte, seme) => {
  const p = path.join(CARTELLA_OUT, nome);
  const b = Buffer.alloc(byte);
  crypto.createHash('sha256').update(String(seme)).digest().copy(b, 0);
  for (let i = 32; i < Math.min(byte, 4096); i++) b[i] = (i * 31 + seme) & 255;
  fs.writeFileSync(p, b);
  return p;
};
async function caricaNellaVoce(s, docId, file) {
  const input = await s.page.$('#msm-fv-' + docId + ' input[type=file]');
  if (!input) throw new Error('manca il caricamento della voce ' + docId);
  await input.uploadFile(file);
  await attendiQuiete(s.stato, 1500, 60000);
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const SENZA = CONF.FOTO_VIDEO_SENZA_SQL === '1';
  if (psql("select to_regprocedure('public.controlli_invio_progetto(uuid)') is not null") !== 't') fermati('sql/77-82 non eseguiti nel database locale');
  const c82 = psql("select to_regprocedure('public.foto_video_mancanti_progetto(uuid)') is not null");
  if (!SENZA && c82 !== 't') fermati('sql/82-foto-video non eseguito nel database locale');
  if (SENZA && c82 === 't') fermati('FOTO_VIDEO_SENZA_SQL=1 ma sql/82-foto-video c\'è: eseguire prima il ROLLBACK');
  if (!SENZA && psql('select public.foto_video_attivi()') !== 't') fermati('manca 82-foto-video-VINCOLO.sql nel database locale');
  const riga = psql("select p.id || '|' || p.stato || '|' || p.rappresentante_id || '|' || coalesce(p.fonte_rilievo, '') from public.progetti_tecnici p join public.utenti u on u.id = p.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where p.stato = 'bozza' and not exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = p.id) order by p.creato_il limit 1");
  if (!riga) fermati('serve un progetto in bozza di un rappresentante senza schede');
  const [progettoId, statoPartenza, rapId, fontePartenza] = riga.split('|');
  const inizio = psql('select now()');
  // F15.13 (sql/83): le regole di smistamento attive cambiano l'invio (le prova smistamento-famiglie.spec.js): qui spente, poi riaccese
  const regoleSpente = psql("select case when to_regclass('public.regole_smistamento') is null then '' else (select coalesce(string_agg(id::text, ','), '') from public.regole_smistamento where attiva) end");
  if (regoleSpente) psql('update public.regole_smistamento set attiva = false where id in (' + regoleSpente + ')');
  const docFoto = SENZA ? null : psql("select d.id from public.lavorazioni_documenti d join public.lavorazioni l on l.id = d.lavorazione_id where l.codice = 'porte_rei' and d.tipo = 'foto' and d.attivo order by d.ordine limit 1");
  const docVideo = SENZA ? null : psql("select d.id from public.lavorazioni_documenti d join public.lavorazioni l on l.id = d.lavorazione_id where l.codice = 'porte_rei' and d.tipo = 'video' and d.attivo order by d.ordine limit 1");
  // Partenza: fonte del rilievo, targhetta (fonte del dato), porta REI completa per il prezzo
  psql("update public.progetti_tecnici set fonte_rilievo = 'sopralluogo_toli' where id = " + q(progettoId));
  psql("insert into public.progetti_tecnici_allegati (progetto_id, nome_file, storage_path, mime_type, dimensione, caricato_da) values (" +
    q(progettoId) + ", 'planimetria_prova.pdf', " + q(rapId + '/' + progettoId + '/planimetria_prova.pdf') + ", 'application/pdf', 1000, " + q(rapId) + ")");
  const fotoId = psql("insert into public.progetti_tecnici_allegati (progetto_id, nome_file, storage_path, mime_type, dimensione, caricato_da) values (" +
    q(progettoId) + ", 'targhetta_prova.jpg', " + q(rapId + '/' + progettoId + '/fonti/targhetta_prova.jpg') + ", 'image/jpeg', 1000, " + q(rapId) + ") returning id").split('\n')[0];
  const base = { tipo_richiesta: 'definitiva', tipo_intervento: 'fornitura_e_posa', rei: 'rei_60', tipologia: 'battente_singolo', larghezza: 90, altezza: 210, quantita: 2,
    fonti_normative: { rei: { valore: 'rei_60', fonte: 'come_esistente', allegato_id: fotoId, allegato_nome: 'targhetta_prova.jpg' } } };
  const schedaId = psql("insert into public.progetti_tecnici_schede (progetto_tecnico_id, famiglia, numero, dati, stato, compilato_da) values (" +
    q(progettoId) + ", 'porte_rei', 1, " + q(JSON.stringify(base)) + "::jsonb, 'bozza', " + q(rapId) + ") returning id").split('\n')[0];
  const foto1 = fileFinto('foto1.jpg', 300 * 1024, 1);
  const foto2 = fileFinto('foto2.jpg', 200 * 1024, 2);
  const foto3 = fileFinto('foto3.jpg', 150 * 1024, 3);
  const video = fileFinto('video40.mp4', 40 * 1024 * 1024, 4);
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const rap = utenti.find(u => u.id === rapId);
  const com = utenti.find(u => u.ruolo === 'commerciale');
  const ing = utenti.find(u => u.ruolo === 'ingegnere');
  if (!rap || !com || !ing) fermati('servono il rappresentante del progetto, un commerciale e un ingegnere attivi');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 180000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const statoProgetto = () => psql('select stato from public.progetti_tecnici where id = ' + q(progettoId));
  try {
    const r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);
    await apriProgetto(r, progettoId);

    if (SENZA) {
      await apriMotore(r);
      if (await r.page.$('#msm-foto-video')) KO('senza sql/82-foto-video compare il riquadro Foto e video');
      else righe.push('senza sql/82-foto-video: nessun riquadro "📷 Foto e video" nella scheda');
      await chiudiScheda(r);
      // Un file dalla finestra del progetto: si carica come prima (senza impronta)
      await r.page.evaluate(async id => { await apriProgettoDaElenco(id); }, progettoId);
      await attendiQuiete(r.stato, 800);
      await r.page.evaluate(() => {
        if (!ge('mp-titolo').value) ge('mp-titolo').value = 'PROVA F15.9';
        const sel = ge('mp-tipologia'); if (!sel.value) sel.value = [...sel.options].find(o => o.value).value;
        if (!ge('mp-descrizione').value.trim()) ge('mp-descrizione').value = 'Prova F15.9 senza sql';
      });
      const input = await r.page.$('#mp-file-extra');
      await input.uploadFile(foto1);
      await r.page.evaluate(() => ge('mp-file-extra').dispatchEvent(new Event('change', { bubbles: true })));
      const acc = await r.page.evaluate(() => ge('mp-file').getAttribute('accept'));
      if (/mp4/.test(acc)) KO('senza sql/82-foto-video il campo accetta i video: ' + acc);
      // F15.17: se compare l'avviso del progetto doppio si crea comunque
    await r.page.evaluate(async () => { const __t = setInterval(() => { const m = document.getElementById('m-progetto-doppione'); if (m && m.classList.contains('on')) { ge('pdp-motivo').value = 'Prova automatica (F15.17)'; ge('pdp-crea').click(); } }, 100); try { await salvaProgetto(); } finally { clearInterval(__t); } });
      await attendiQuiete(r.stato, 2000);
      const n = psql("select count(*) from public.progetti_tecnici_allegati where progetto_id = " + q(progettoId) + " and nome_file = 'foto1.jpg'");
      if (n !== '1') KO('senza sql/82-foto-video: la foto dalla finestra del progetto non è salvata (' + n + ') ' + await toastTesto(r));
      else righe.push('   foto dalla finestra del progetto salvata come prima; il campo non propone i video');
      const d = await inviaE(r, 'inviaProgettoAlCommerciale', progettoId);
      if (statoProgetto() !== 'inviato_a_commerciale') KO('senza sql/82-foto-video il progetto non si invia: ' + d + ' ' + await toastTesto(r));
      else righe.push('   il progetto si invia senza foto né video (nessun blocco)');
    } else {
      // 1. Senza foto e video. sql/261 (richiesta di Erika dell'11/11): il sito
      // non ferma più il rappresentante; con sql/261 parte (anche dalla
      // console), senza sql/261 lo ferma il database e il sito dice solo
      // "chiedi all'ingegnere di completare la scheda"
      const con261 = psql("select coalesce((select prosrc like '%sql/261%' from pg_proc where oid = to_regprocedure('public.trg_progetti_tecnici_invio_completo()')), false)") === 't';
      const d0 = await inviaE(r, 'inviaProgettoAlCommerciale', progettoId);
      if (/mancano foto o video|Compila la scheda/.test(d0)) KO('1: al rappresentante il sito elenca ancora le foto o cita "Compila la scheda": ' + d0);
      if (con261) {
        if (statoProgetto() !== 'inviato_a_commerciale') KO('1: con sql/261 senza foto doveva partire: stato ' + statoProgetto() + ', messaggio ' + d0);
        else righe.push('1. con sql/261: senza foto e video "📤 Invia ad Acquisti" parte (inviato_a_commerciale)');
        psql("update public.progetti_tecnici set stato = 'bozza' where id = " + q(progettoId));
      } else if (statoProgetto() !== 'bozza' || !/Chiedi all’ingegnere di completare la scheda/.test(d0)) KO('1: senza foto: stato ' + statoProgetto() + ', messaggio ' + d0);
      else righe.push('1. senza sql/261: il database ferma l\'invio, il sito dice: ' + d0.split(' / ').pop().slice(0, 200));
      const cons = await r.page.evaluate(async id => {
        const x = await db.from('progetti_tecnici').update({ stato: 'inviato_a_commerciale' }).eq('id', id).select('id');
        return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO';
      }, progettoId);
      if (con261 ? cons !== 'RIUSCITO' : !/rifiutato: Invio bloccato, foto e video mancanti/.test(cons)) KO('1: console del rappresentante: ' + cons);
      else righe.push('   console del rappresentante: ' + cons.slice(0, 150) + (con261 ? ' (sql/261)' : ''));
      psql("update public.progetti_tecnici set stato = 'bozza' where id = " + q(progettoId));
      const senzaImpronta = await r.page.evaluate(async (id, uid) => {
        const x = await db.from('progetti_tecnici_allegati').insert({ progetto_id: id, nome_file: 'console.jpg', storage_path: uid + '/' + id + '/console.jpg', mime_type: 'image/jpeg', dimensione: 10, caricato_da: uid }).select('id');
        return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO';
      }, progettoId, rapId);
      if (!/rifiutato: Manca l.impronta/.test(senzaImpronta)) KO('1: file senza impronta da console: ' + senzaImpronta);
      else righe.push('   console: file senza impronta ' + senzaImpronta.slice(0, 90));

      // Foto e video nella scheda
      await apriMotore(r);
      const voci = await r.page.evaluate(() => [...document.querySelectorAll('#msm-foto-video .card')].map(x => x.innerText.split('\n')[0]));
      if (voci.length !== 2) KO('1: voci del riquadro Foto e video: ' + JSON.stringify(voci));
      await caricaNellaVoce(r, docFoto, foto1);
      await caricaNellaVoce(r, docFoto, foto2);
      const t0 = Date.now();
      await caricaNellaVoce(r, docVideo, video);
      const secVideo = ((Date.now() - t0) / 1000).toFixed(1);
      { const el = await r.page.$('#msm-foto-video'); if (el) { await el.scrollIntoView(); await el.screenshot({ path: path.join(CARTELLA_OUT, '1-foto-video-390.png') }); } }
      await r.page.click('#msm-salva');
      await attendiQuiete(r.stato, 2000);
      const dbVoci = psql("select jsonb_array_length(dati->'foto_video'->" + q(docFoto) + "->'allegati') || '|' || jsonb_array_length(dati->'foto_video'->" + q(docVideo) + "->'allegati') from public.progetti_tecnici_schede where id = " + q(schedaId));
      const dbVideo = psql("select a.dimensione || '|' || a.mime_type || '|' || length(a.impronta) from public.progetti_tecnici_allegati a where a.progetto_id = " + q(progettoId) + " and a.mime_type like 'video/%'");
      if (dbVoci !== '2|1' || dbVideo !== (40 * 1024 * 1024) + '|video/mp4|64') KO('1: salvataggio: voci ' + dbVoci + ', video ' + dbVideo + ' ' + await toastTesto(r));
      else righe.push('   2 foto e un video mp4 di 40 MB (impronta in ' + secVideo + ' s) salvati nella scheda; nel database: ' + dbVideo.replace(/\|/g, ', '));

      // 2. La stessa foto su due posizioni
      const pos = psql("insert into public.progetti_tecnici_posizioni (scheda_id, ubicazione, quantita, dati) values (" + q(schedaId) + ", 'Piano terra', 1, '{}'), (" + q(schedaId) + ", 'Piano primo', 1, '{}') returning id").split('\n');
      await r.page.evaluate(async () => { if (typeof disegnaPosizioniSchedaAperta === 'function') await disegnaPosizioniSchedaAperta(); });
      await attendiQuiete(r.stato, 800);
      const fotoPos = async (id, file) => {
        await r.page.evaluate(id => apriPosizione(id, 'rsm-posizioni'), id);
        await attendiQuiete(r.stato, 800);
        const inp = await r.page.$('#m-posizione input[type=file]');
        await inp.uploadFile(file);
        await attendiQuiete(r.stato, 1500);
        const t = await toastTesto(r);
        await r.page.evaluate(() => closeM('m-posizione'));
        return t;
      };
      const tA = await fotoPos(pos[0], foto1);
      const nA = psql('select jsonb_array_length(foto) from public.progetti_tecnici_posizioni where id = ' + q(pos[0]));
      if (nA !== '0' || !/già tra i file del progetto/.test(tA)) KO('2: foto 1 (già nella scheda) sulla P-01: ' + nA + ' foto, messaggio ' + tA);
      else righe.push('2. la foto 1 della scheda scelta di nuovo per la P-01: rifiutata ("' + tA.slice(0, 110) + '")');
      const tB = await fotoPos(pos[0], foto3);
      const tC = await fotoPos(pos[1], foto3);
      const nB = psql('select jsonb_array_length(foto) from public.progetti_tecnici_posizioni where id = ' + q(pos[0]));
      const nC = psql('select jsonb_array_length(foto) from public.progetti_tecnici_posizioni where id = ' + q(pos[1]));
      if (nB !== '1' || nC !== '0' || !/già tra i file del progetto/.test(tC)) KO('2: foto 3 sulla P-01 (' + nB + ', ' + tB + ') e sulla P-02 (' + nC + ', ' + tC + ')');
      else righe.push('   foto 3 sulla P-01 aggiunta, la stessa foto 3 sulla P-02 rifiutata');
      const consPos = await r.page.evaluate(async (p1, p2) => {
        const a = await db.from('progetti_tecnici_posizioni').select('foto').eq('id', p1).single();
        const x = await db.from('progetti_tecnici_posizioni').update({ foto: a.data.foto }).eq('id', p2).select('id');
        return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO';
      }, pos[0], pos[1]);
      if (!/rifiutato: La stessa foto non vale per due posizioni/.test(consPos)) KO('2: console, stessa foto su due posizioni: ' + consPos);
      else righe.push('   console: ' + consPos.slice(0, 140));

      // 3. Con foto e video si invia; Acquisti da console non toglie le foto
      await chiudiScheda(r);
      const d3 = await inviaE(r, 'inviaProgettoAlCommerciale', progettoId);
      if (statoProgetto() !== 'inviato_a_commerciale') KO('3: con foto e video il progetto non si invia: ' + d3 + ' ' + await toastTesto(r));
      else righe.push('3. con foto e video: inviato ad Acquisti');
      const a = await apriSito(browser, url); sessioni.push(a);
      await login(a, com);
      const consCom = await a.page.evaluate(async id => {
        const s = await db.from('progetti_tecnici_schede').select('id,dati').eq('id', id).single();
        if (s.error) return 'lettura: ' + s.error.message;
        const dati = Object.assign({}, s.data.dati, { foto_video: {} });
        const x = await db.from('progetti_tecnici_schede').update({ dati: dati }).eq('id', id).select('id');
        return x.error ? 'rifiutato: ' + x.error.message : 'RIUSCITO';
      }, schedaId);
      if (!/rifiutato: Foto e video della scheda/.test(consCom)) KO('3: console di Acquisti: ' + consCom);
      else righe.push('   console di Acquisti (commerciale) che toglie le foto: ' + consCom.slice(0, 120));
      await chiudi(a);

      // 4. Ingegnere: video impossibile con il motivo
      psql("update public.progetti_tecnici set stato = 'in_verifica_tecnica' where id = " + q(progettoId));
      psql("update public.progetti_tecnici_schede set dati = jsonb_set(dati, '{foto_video}', (dati->'foto_video') - " + q(docVideo) + ") where id = " + q(schedaId));
      const g = await apriSito(browser, url); sessioni.push(g);
      await g.page.setViewport({ width: 390, height: 844 });
      await login(g, ing);
      await apriProgetto(g, progettoId);
      await apriMotore(g);
      await g.page.select('#msm-fvm-' + docVideo, 'area_riservata');
      await scrivi(g, 'msm-fvn-' + docVideo, 'Reparto produzione, vietato filmare');
      { const el = await g.page.$('#msm-foto-video'); if (el) { await el.scrollIntoView(); await el.screenshot({ path: path.join(CARTELLA_OUT, '4-video-impossibile-390.png') }); } }
      await g.page.click('#msm-salva');
      await attendiQuiete(g.stato, 2000);
      const m = psql("select coalesce(dati->'foto_video'->" + q(docVideo) + "->'mancanza'->>'motivo','') || '|' || coalesce(dati->'foto_video'->" + q(docVideo) + "->'mancanza'->>'da','') || '|' || coalesce(dati->'foto_video'->" + q(docVideo) + "->'mancanza'->>'nota','') from public.progetti_tecnici_schede where id = " + q(schedaId));
      if (m !== 'area_riservata|' + ing.id + '|Reparto produzione, vietato filmare') KO('4: video impossibile: ' + m + ' ' + await toastTesto(g));
      else righe.push('4. ingegnere a 390 px: "🚫 Video impossibile: Area riservata" con la nota, chi = ingegnere (dal database)');
      const resta = psql('select count(*) from public.foto_video_mancanti_progetto(' + q(progettoId) + ')');
      if (resta !== '0') KO('4: con il motivo manca ancora qualcosa: ' + resta);
      psql("update public.progetti_tecnici set stato = 'bozza' where id = " + q(progettoId));
      const d4 = await inviaE(r, 'inviaProgettoAUfficioTecnico', progettoId);
      if (statoProgetto() !== 'in_verifica_tecnica') KO('4: con il motivo il rappresentante non invia: ' + d4);
      else righe.push('   con il motivo il rappresentante invia all\'ufficio tecnico');
    }

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(x => (x.status >= 500 || /does not exist|Could not find/i.test(x.msg)) &&
        !(SENZA && /foto_video_attivi/.test(x.dove + x.msg)) && !/invio_dopo_visita_attivo|sconto_rappresentante_attivo|progetti_simili_cliente/.test(x.dove + x.msg) /* F15.15 e sql/258: 404 voluti senza sql/85 e 258 */);
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
      psql('update public.progetti_tecnici set stato = ' + q(statoPartenza) + ', fonte_rilievo = ' + (fontePartenza ? q(fontePartenza) : 'null') + ' where id = ' + q(progettoId));
      psql("delete from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and creato_il >= " + q(inizio));
      psql("delete from public.progetti_tecnici_allegati where progetto_id = " + q(progettoId) + " and caricato_il >= " + q(inizio));
    } catch (e) { console.error('pulizia: ' + e.message); }
    try { fs.unlinkSync(video); } catch (e) { /* già tolto */ }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
