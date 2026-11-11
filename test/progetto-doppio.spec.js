#!/usr/bin/env node
// F15.17 - Controllo dei progetti doppi (js/17 controllaProgettoDoppione,
// sql/87). Chrome headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh, poi sql/87). Le regole di smistamento si
// spengono durante la prova (come in produzione dopo sql/260) e si
// riaccendono alla fine come erano.
//  1. il cliente del rappresentante ha un progetto di un ALTRO rappresentante
//     di 5 giorni fa: il rappresentante, a 390 px, crea un progetto nuovo
//     (titolo, tipologia, descrizione, foto: finestra di sempre) e al "Salva
//     bozza" compare l'avviso con quel progetto (di chi è, senza "Apri");
//     senza motivo "Crea comunque" non va avanti, con il motivo il progetto
//     si crea (mai un blocco), il motivo è nella cronologia e il titolare ha
//     l'avviso "progetto_doppione";
//  2. secondo progetto nuovo: l'avviso elenca anche il suo, "📂 Apri quello
//     che c'è" apre quello e il nuovo NON si crea;
//  3. il titolare apre il progetto nuovo e legge il motivo nella Cronologia;
//  4. console: ingegnere e Acquisti rifiutati dal database.
// Con DOPPI_SENZA_SQL=1 (dopo il ROLLBACK di sql/87): l'avviso mostra solo
// il progetto suo, la nota "il motivo non si salva ancora", si crea, nessun
// errore.
// Alla fine si tolgono i progetti di prova.
// Uso: cd test && node progetto-doppio.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-progetto-doppio');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA DOPPIO';
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
  const SENZA = CONF.DOPPI_SENZA_SQL === '1';
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const con87 = psql("select to_regprocedure('public.progetti_simili_cliente(uuid, uuid)') is not null") === 't';
  if (SENZA && con87) fermati('DOPPI_SENZA_SQL=1 ma sql/87 c\'è: esegui prima il ROLLBACK');
  if (!SENZA && !con87) fermati('sql/87 non c\'è sul database locale');
  const riga = psql("select c.id || '|' || u.id from public.clienti c join public.utenti u on u.id = c.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where c.eliminato_il is null order by c.creato_il limit 1");
  if (!riga) fermati('serve un cliente con un rappresentante attivo');
  const [clienteId, rapId] = riga.split('|');
  const rap2Id = psql("select id from public.utenti where ruolo = 'rappresentante' and attivo and id <> " + "'" + rapId + "'" + ' order by id limit 1');
  if (!rap2Id) fermati('serve un secondo rappresentante attivo');
  const regoleSpente = psql("select case when to_regclass('public.regole_smistamento') is null then '' else (select coalesce(string_agg(id::text, ','), '') from public.regole_smistamento where attiva) end");
  if (regoleSpente) psql('update public.regole_smistamento set attiva = false where id in (' + regoleSpente + ')');
  const marca = 'z' + Date.now();
  const titoloAltro = ETICHETTA + ' ' + marca + ' porte magazzino';
  const titoli = [titoloAltro, ETICHETTA + ' ' + marca + ' estintori uffici', ETICHETTA + ' ' + marca + ' terzo'];
  const idAltro = psql('insert into public.progetti_tecnici (cliente_id, rappresentante_id, titolo, tipologia, descrizione_tecnica, stato, creato_il) values (' +
    q(clienteId) + ', ' + q(rap2Id) + ', ' + q(titoloAltro) + ", 'Porte REI / tagliafuoco', 'prova', 'bozza', now() - interval '5 days') returning id");
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const rap = utenti.find(u => u.id === rapId);
  const tit = utenti.find(u => u.ruolo === 'titolare');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const foto = path.join(CARTELLA_OUT, 'porta.png');
  fs.writeFileSync(foto, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const conta = t => Number(psql('select count(*) from public.progetti_tecnici where titolo = ' + q(t)));

  async function compila(r, titolo) {
    await r.page.evaluate(async id => { await openClienteDetail(id); }, clienteId);
    await attendiQuiete(r.stato, 900);
    await r.page.evaluate(async () => { await apriNuovoProgetto(); });
    await attendiQuiete(r.stato, 900);
    await scrivi(r, 'mp-titolo', titolo);
    await r.page.evaluate(() => { const sel = ge('mp-tipologia'); sel.value = 'Estintori'; });
    await scrivi(r, 'mp-descrizione', '6 estintori a polvere 6 kg negli uffici del primo piano.');
    const input = await r.page.$('#mp-file');
    await input.uploadFile(foto);
    await r.page.evaluate(() => ge('mp-file').dispatchEvent(new Event('change', { bubbles: true })));
    await attendiQuiete(r.stato, 400);
    // salvaProgetto aspetta la scelta: non si attende qui
    await r.page.evaluate(() => { window.__salva = salvaProgetto(); });
    await r.page.waitForFunction(() => document.getElementById('m-progetto-doppione').classList.contains('on') ||
      !document.getElementById('m-progetto').classList.contains('on'), { timeout: 15000 });
    await attendiQuiete(r.stato, 400);
    return r.page.evaluate(() => document.getElementById('m-progetto-doppione').classList.contains('on'));
  }
  const elenco = r => r.page.evaluate(() => ({
    testo: document.getElementById('pdp-elenco').innerText,
    apri: [...document.querySelectorAll('#pdp-elenco [data-pdp-apri]')].map(b => b.getAttribute('data-pdp-apri')),
    nota: getComputedStyle(document.getElementById('pdp-nota-sql')).display !== 'none',
    progettoAperto: document.getElementById('m-progetto').classList.contains('on')
  }));

  try {
    const r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);

    // 1. progetto di un altro rappresentante
    const avviso1 = await compila(r, titoli[1]);
    if (SENZA) {
      if (avviso1) KO('1 senza sql/87: il progetto dell\'altro rappresentante non doveva comparire');
      else righe.push('1. senza sql/87: nessun avviso per il progetto di un altro rappresentante (non lo legge)');
      await r.page.evaluate(async () => { await window.__salva; });
      await attendiQuiete(r.stato, 1200);
      if (conta(titoli[1]) !== 1) KO('1 senza sql/87: il progetto non si è creato');
    } else {
      if (!avviso1) KO('1: l\'avviso del progetto doppio non è comparso');
      const e = await elenco(r);
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-avviso-altro-rappresentante-390.png') });
      if (!e.testo.includes(titoloAltro)) KO('1: nell\'avviso manca il progetto che c\'era: ' + e.testo.slice(0, 200));
      if (e.apri.includes(idAltro)) KO('1: "Apri" sul progetto di un altro rappresentante');
      if (!/di un altro rappresentante: non lo puoi aprire/.test(e.testo)) KO('1: manca la spiegazione del progetto non apribile');
      if (!e.progettoAperto) KO('1: la finestra del progetto si è chiusa');
      // senza motivo non si va avanti
      await r.page.click('#pdp-crea');
      await attendiQuiete(r.stato, 300);
      if (conta(titoli[1]) !== 0 || !(await elenco(r)).progettoAperto) KO('1: senza motivo il progetto è partito');
      await scrivi(r, 'pdp-motivo', 'Estintori degli uffici, lavoro diverso dalle porte');
      await r.page.click('#pdp-crea');
      await r.page.evaluate(async () => { await window.__salva; });
      await attendiQuiete(r.stato, 1500);
      const id1 = psql('select id from public.progetti_tecnici where titolo = ' + q(titoli[1]));
      if (!id1) KO('1: "Crea comunque" non ha creato il progetto ' + await toastTesto(r));
      else {
        const storico = psql('select descrizione from public.progetti_tecnici_storico where progetto_id = ' + q(id1) + " and tipo_evento = 'doppione_confermato'");
        if (!/lavoro diverso dalle porte/.test(storico) || !storico.includes(titoloAltro)) KO('1: motivo non nella cronologia: ' + storico);
        const av = psql("select count(*) from public.avvisi where tipo = 'progetto_doppione' and destinatario_ruolo = 'titolare' and rif_id = " + q(id1));
        if (av !== '1') KO('1: avviso al titolare mancante (' + av + ')');
        righe.push('1. avviso con il progetto dell\'altro rappresentante (senza Apri); "Crea comunque" con il motivo: progetto creato, motivo nella cronologia, avviso al titolare');
      }
    }

    // 2. secondo progetto: c'è anche il suo, "Apri quello che c'è"
    const avviso2 = await compila(r, titoli[2]);
    if (!avviso2) KO('2: l\'avviso non è comparso con il progetto suo');
    else {
      const e = await elenco(r);
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '2-avviso-suo-390.png') });
      const id1 = psql('select id from public.progetti_tecnici where titolo = ' + q(titoli[1]));
      if (!e.apri.includes(id1)) KO('2: manca "Apri" sul progetto suo: ' + e.apri.join(','));
      if (SENZA && !e.nota) KO('2 senza sql/87: manca la nota "il motivo non si salva ancora"');
      if (!SENZA && e.nota) KO('2: con sql/87 c\'è la nota senza sql');
      await r.page.click('#pdp-elenco [data-pdp-apri="' + id1 + '"]');
      await r.page.evaluate(async () => { await window.__salva; });
      await attendiQuiete(r.stato, 1500);
      const aperto = await r.page.evaluate(() => (document.querySelector('.page.on') || {}).id + '|' + (typeof currentProgettoTecnicoId !== 'undefined' ? currentProgettoTecnicoId : ''));
      if (conta(titoli[2]) !== 0) KO('2: con "Apri quello che c\'è" il progetto nuovo si è creato lo stesso');
      if (!aperto.startsWith('pg-progetto-detail')) KO('2: non si è aperto il progetto che c\'era: ' + aperto);
      else righe.push('2. "📂 Apri quello che c\'è": aperto il progetto suo (' + aperto + '), il nuovo non si crea' + (SENZA ? '; nota "il motivo non si salva ancora"' : ''));
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '2-progetto-aperto-390.png') });
    }

    // 3. titolare: motivo nella cronologia
    if (!SENZA && tit) {
      const t = await apriSito(browser, url); sessioni.push(t);
      await login(t, tit);
      const id1 = psql('select id from public.progetti_tecnici where titolo = ' + q(titoli[1]));
      await t.page.evaluate(async id => { await openProgettoDetail(id); }, id1);
      await attendiQuiete(t.stato, 1500);
      const cron = await t.page.evaluate(() => (document.getElementById('pd-cronologia-content') || {}).textContent || '');
      if (!/lavoro diverso dalle porte/.test(cron)) KO('3: il titolare non legge il motivo nella cronologia: ' + cron.slice(0, 200));
      else righe.push('3. il titolare legge il motivo nella Cronologia del progetto nuovo');
      const mieiAvvisi = await rest('/rpc/miei_avvisi', tokenDi(tit), { metodo: 'POST', corpo: {} }).catch(e => null);
      if (mieiAvvisi && !mieiAvvisi.some(a => a.tipo === 'progetto_doppione' && a.rif_id === id1)) KO('3: miei_avvisi del titolare senza il progetto doppio');
      else if (mieiAvvisi) righe.push('   miei_avvisi del titolare: "Progetto doppio" presente');
    }

    // 4. console dei ruoli non ammessi
    if (!SENZA) {
      for (const ruolo of ['ingegnere', 'commerciale']) {
        const u = utenti.find(x => x.ruolo === ruolo);
        if (!u) { KO('4: manca un utente ' + ruolo); continue; }
        let errore = '';
        try { await rest('/rpc/progetti_simili_cliente', tokenDi(u), { metodo: 'POST', corpo: { p_cliente: clienteId } }); } catch (e) { errore = e.message; }
        if (!/solo del rappresentante e del titolare/.test(errore)) KO('4: ' + ruolo + ' non rifiutato: ' + errore);
        else righe.push('4. console ' + ruolo + ': rifiutato (' + errore.slice(0, 70) + ')');
      }
    }

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(x => (x.status >= 500 || /does not exist|Could not find/i.test(x.msg)) &&
        !/schede_migrate_motore|invio_dopo_visita_attivo|sconto_rappresentante_attivo|progetti_simili_cliente/.test(x.dove + x.msg));
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
        psql("update public.avvisi set stato = 'annullato', chiuso_il = now(), esito = 'prova F15.17' where tipo = 'progetto_doppione' and stato = 'aperto' and rif_id in (select id::text from public.progetti_tecnici where titolo = " + q(t) + ')');
        psql('delete from public.progetti_tecnici_allegati where progetto_id in (select id from public.progetti_tecnici where titolo = ' + q(t) + ')');
        psql('delete from public.progetti_tecnici where titolo = ' + q(t));
      }
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
