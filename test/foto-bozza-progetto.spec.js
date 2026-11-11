#!/usr/bin/env node
// Foto della bozza del progetto (richiesta di Erika dell'11/11, js/70 e
// js/17, NESSUN SQL). Chrome headless con puppeteer-core, SOLO DATABASE
// LOCALE (test/locale/avvia-db-locale.sh). Le regole di smistamento si
// spengono durante la prova (come in produzione dopo sql/260) e si
// riaccendono alla fine come erano.
//  0. browser nuovo (nessuna chiave sul telefono): 3 foto scelte IN UN COLPO
//     SOLO, ricaricamento, "Nuovo progetto": 3 anteprime (prima tornava solo
//     l'ultima: ogni foto creava la sua chiave); sul telefono niente nome
//     del file né chiave della bozza in chiaro (impronta SHA-256);
//  1. rappresentante a 390 px: nuovo progetto sul suo cliente, 3 foto scelte
//     una alla volta (2 nel campo obbligatorio, 1 negli "altri file"): si
//     sommano, 3 anteprime, 3 righe CIFRATE sul telefono (IndexedDB
//     toli-foto-bozze, nessun byte della foto in chiaro);
//  2. la pagina si ricarica (page.reload) prima di "Salva": riaperto "Nuovo
//     progetto" dello stesso cliente, testo e 3 foto ci sono con l'anteprima;
//     "Salva bozza" = 3 righe in progetti_tecnici_allegati, telefono vuoto;
//  3. ✖ su una foto scelta per sbaglio: tolta dall'elenco e dal telefono;
//  4. caricamento fermato a metà (lo Storage rifiuta la seconda foto):
//     messaggio con "Salvati (1)" e "Non salvati (2)", 1 riga nel database,
//     2 foto restano sul telefono, la finestra diventa "Modifica"; ricaricata
//     la pagina e riaperto il progetto le 2 foto ci sono; "Salva" = 3 righe,
//     un solo progetto, telefono vuoto;
//  5. "Esci" con una foto scelta: avviso, poi telefono vuoto (foto e chiave);
//  6. titolare "Entra come" rappresentante: crea il progetto con una foto,
//     rappresentante_id e caricato_da = il rappresentante (prima rifiutato).
// Alla fine si tolgono i progetti di prova.
// Uso: cd test && node foto-bozza-progetto.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-foto-bozza-progetto');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA FOTO BOZZA';
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
    if ((metodo === 'POST' || metodo === 'PUT') && m && !m[1]) {
      if (stato.rifiutaCaricamentoN && stato.caricamenti.length + 1 === stato.rifiutaCaricamentoN) { stato.rifiutati = (stato.rifiutati || 0) + 1; stato.rifiutaCaricamentoN = 0; return json(500, { statusCode: '500', error: 'prova', message: 'Caricamento rifiutato dalla prova' }); }
      stato.caricamenti.push(m[2]); return json(200, { Key: m[2], Id: crypto.randomUUID() });
    }
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
  const riga = psql("select c.id || '|' || u.id from public.clienti c join public.utenti u on u.id = c.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where c.eliminato_il is null order by c.creato_il limit 1");
  if (!riga) fermati('serve un cliente con un rappresentante attivo');
  const [clienteId, rapId] = riga.split('|');
  const regoleSpente = psql("select case when to_regclass('public.regole_smistamento') is null then '' else (select coalesce(string_agg(id::text, ','), '') from public.regole_smistamento where attiva) end");
  if (regoleSpente) psql('update public.regole_smistamento set attiva = false where id in (' + regoleSpente + ')');
  const marca = 'z' + Date.now();
  const titoli = [ETICHETTA + ' ' + marca + ' ricaricata', ETICHETTA + ' ' + marca + ' a meta', ETICHETTA + ' ' + marca + ' un colpo', ETICHETTA + ' ' + marca + ' entra come'];
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const rap = utenti.find(u => u.id === rapId);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  // 5 foto PNG diverse (stesso pixel, coda diversa dopo IEND) con un segno
  // riconoscibile per controllare che sul telefono non ci siano in chiaro
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const foto = [1, 2, 3, 4, 5].map(n => {
    const p = path.join(CARTELLA_OUT, 'foto' + n + '.png');
    fs.writeFileSync(p, Buffer.concat([PNG, Buffer.from('TOLIPROVAFOTO' + n + '-' + marca)]));
    return p;
  });
  const progettoDi = t => psql('select id from public.progetti_tecnici where titolo = ' + q(t));
  const contaProgetti = t => Number(psql('select count(*) from public.progetti_tecnici where titolo = ' + q(t)));
  const allegati = id => id ? psql('select coalesce(string_agg(nome_file, \',\' order by nome_file), \'\') from public.progetti_tecnici_allegati where progetto_id = ' + q(id)) : '';
  const telefono = s => s.page.evaluate(async () => {
    const tutte = await operazioneFotoBozza('foto', 'readonly', st => st.getAll());
    const chiavi = await operazioneFotoBozza('chiavi', 'readonly', st => st.getAll());
    const testi = tutte.map(r => new TextDecoder('latin1').decode(new Uint8Array(r.dati)));
    const nomi = await Promise.all(tutte.map(async r => { try { return spacchettaFotoBozza(await decifraLettura(await chiaveFotoBozza(), 'foto-bozza|' + r.id, r.iv, r.dati)).meta.nome; } catch (e) { return '?'; } }));
    const campiChiaro = tutte.some(r => 'nome' in r || 'tipo' in r || 'campo' in r || !/^[0-9a-f]{64}$/.test(String(r.bozza)));
    return { n: tutte.length, nomi: nomi.sort(), campiChiaro, chiaro: testi.some(t => t.includes('TOLIPROVA') || t.includes('PNG')),
      chiavi: chiavi.length, esportabile: chiavi.some(c => c.chiave && c.chiave.extractable) };
  });
  const anteprime = s => s.page.evaluate(() => ({
    img: document.querySelectorAll('#mp-file-selezionati img').length,
    righe: [...document.querySelectorAll('#mp-file-selezionati [data-file-scelto]')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
    x: document.querySelectorAll('#mp-file-selezionati [data-file-scelto] button').length,
    ripresi: (document.getElementById('mp-file-ripresi') || {}).textContent || ''
  }));
  async function scegli(s, idInput, file) {
    const input = await s.page.$('#' + idInput);
    await input.uploadFile(file);
    await s.page.evaluate(id => ge(id).dispatchEvent(new Event('change', { bubbles: true })), idInput);
    await attendiQuiete(s.stato, 300);
  }
  async function attendiTelefono(s, n) {
    for (let i = 0; i < 60; i++) { if ((await telefono(s)).n === n) return true; await attendi(150); }
    return false;
  }
  async function nuovo(s) {
    await s.page.evaluate(async id => { await openClienteDetail(id); }, clienteId);
    await attendiQuiete(s.stato, 900);
    await s.page.evaluate(async () => { await apriNuovoProgetto(); });
    await attendiQuiete(s.stato, 900);
  }
  async function compila(s, titolo) {
    await scrivi(s, 'mp-titolo', titolo);
    await s.page.evaluate(() => { const sel = ge('mp-tipologia'); sel.value = [...sel.options].find(o => o.value).value; sel.dispatchEvent(new Event('change')); });
    await scrivi(s, 'mp-descrizione', '3 porte REI 60 al piano terra, foto dei vani.');
    await attendi(1000); // bozza del testo (800 ms)
  }
  async function salva(s) {
    await s.page.evaluate(async () => { const __t = setInterval(() => { const m = document.getElementById('m-progetto-doppione'); if (m && m.classList.contains('on')) { ge('pdp-motivo').value = 'Prova automatica foto della bozza'; ge('pdp-crea').click(); } }, 100); try { await salvaProgetto(); } finally { clearInterval(__t); } });
    await attendiQuiete(s.stato, 1500);
  }
  async function ricarica(s) {
    await s.page.reload({ waitUntil: 'load', timeout: 60000 });
    await s.page.waitForFunction(() => typeof ROLE !== 'undefined' && ROLE && ME && document.querySelector('.page.on'), { timeout: 25000 });
    await attendiQuiete(s.stato, 1500);
  }

  try {
    // 0. browser nuovo, 3 foto in un colpo solo
    {
      const z = await apriSito(browser, url); sessioni.push(z);
      await z.page.setViewport({ width: 390, height: 844 });
      await login(z, rap);
      await nuovo(z);
      await compila(z, titoli[2]);
      const input = await z.page.$('#mp-file');
      await input.uploadFile(foto[0], foto[1], foto[2]);
      await z.page.evaluate(() => ge('mp-file').dispatchEvent(new Event('change', { bubbles: true })));
      await attendiQuiete(z.stato, 300);
      if (!(await attendiTelefono(z, 3))) KO('0: sul telefono non ci sono 3 foto: ' + JSON.stringify(await telefono(z)));
      const t0 = await telefono(z);
      if (t0.chiavi !== 1) KO('0: chiavi sul telefono: ' + t0.chiavi);
      if (t0.campiChiaro || t0.chiaro) KO('0: sul telefono nome, tipo o chiave della bozza in chiaro');
      await ricarica(z);
      z.stato.erroriToast = '';
      await nuovo(z);
      const a0 = await anteprime(z);
      const toast0 = await toastTesto(z);
      await z.page.screenshot({ path: path.join(CARTELLA_OUT, '0-un-colpo-dopo-ricarica-390.png') });
      if (a0.img !== 3) KO('0: 3 foto scelte insieme, dopo il ricaricamento ne tornano ' + a0.img + ' ' + toast0);
      else righe.push('0. browser nuovo, 3 foto scelte in un colpo solo: una sola chiave, sul telefono niente nome né bozza in chiaro; dopo il ricaricamento 3 anteprime (' + t0.nomi.join(', ') + ')');
      // pulizia: via le foto (non si salva)
      await z.page.evaluate(async () => { await svuotaTutteFotoBozza(); });
      await chiudi(z);
    }

    const r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);

    // 1. tre foto scelte una alla volta
    await nuovo(r);
    await compila(r, titoli[0]);
    await scegli(r, 'mp-file', foto[0]);
    await scegli(r, 'mp-file', foto[1]);
    await scegli(r, 'mp-file-extra', foto[2]);
    await scegli(r, 'mp-file', foto[1]); // la stessa due volte: non si ripete
    const a1 = await anteprime(r);
    if (a1.img !== 3) KO('1: anteprime ' + a1.img + ' invece di 3 (scegliendo di nuovo le foto si sostituiscono?) ' + a1.righe.join(' | '));
    if (!(await attendiTelefono(r, 3))) KO('1: sul telefono non ci sono 3 foto: ' + JSON.stringify(await telefono(r)));
    const t1 = await telefono(r);
    if (t1.chiaro) KO('1: sul telefono la foto è in chiaro');
    if (t1.esportabile) KO('1: la chiave del telefono è esportabile');
    await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-tre-foto-390.png') });
    if (a1.img === 3 && t1.n === 3 && !t1.chiaro) righe.push('1. 3 foto scelte una alla volta (la stessa due volte non si ripete): 3 anteprime con ✖, 3 righe cifrate sul telefono, chiave non esportabile');

    // 2. la pagina si ricarica prima di "Salva"
    await ricarica(r);
    await nuovo(r);
    const a2 = await anteprime(r);
    const testo2 = await valori(r, ['mp-titolo', 'mp-descrizione']);
    await r.page.screenshot({ path: path.join(CARTELLA_OUT, '2-dopo-ricarica-390.png') });
    if (a2.img !== 3) KO('2: dopo il ricaricamento le anteprime sono ' + a2.img + ': ' + a2.righe.join(' | '));
    if (!/ripreso 3 file/.test(a2.ripresi)) KO('2: manca la nota delle foto riprese: ' + a2.ripresi);
    if (testo2[0] !== titoli[0]) KO('2: il testo della bozza non è tornato: ' + testo2[0]);
    const nObbl = await r.page.evaluate(() => fileSceltiProgetto('obbligatori').length + '/' + fileSceltiProgetto('extra').length);
    if (nObbl !== '2/1') KO('2: foto riprese nei campi sbagliati: ' + nObbl);
    await salva(r);
    const id0 = progettoDi(titoli[0]);
    const al0 = allegati(id0);
    const t2 = await telefono(r);
    if (!id0) KO('2: progetto non salvato ' + await toastTesto(r));
    else if (al0.split(',').filter(Boolean).length !== 3) KO('2: righe in progetti_tecnici_allegati: ' + al0);
    if (t2.n !== 0) KO('2: dopo il salvataggio il telefono ha ancora ' + t2.n + ' foto');
    if (id0 && t2.n === 0 && a2.img === 3) righe.push('2. ricaricata la pagina: "Nuovo progetto" dello stesso cliente con testo e 3 foto (2 obbligatorie, 1 facoltativa) con l\'anteprima; Salva = 3 righe (' + al0 + '), telefono vuoto');

    // 3. ✖ su una foto scelta per sbaglio
    await nuovo(r);
    await compila(r, titoli[1]);
    await scegli(r, 'mp-file', foto[0]);
    await scegli(r, 'mp-file', foto[3]);
    await scegli(r, 'mp-file-extra', foto[4]);
    await scegli(r, 'mp-file-extra', foto[2]);
    await attendiTelefono(r, 4);
    await r.page.evaluate(() => { const b = [...document.querySelectorAll('#mp-file-selezionati [data-file-scelto]')].find(x => /foto3\.png/.test(x.textContent)); b.querySelector('button').click(); });
    await attendiQuiete(r.stato, 600);
    const a3 = await anteprime(r);
    const t3 = await telefono(r);
    if (a3.img !== 3 || a3.righe.some(x => /foto3\.png/.test(x))) KO('3: la ✖ non ha tolto la foto: ' + a3.righe.join(' | '));
    if (t3.n !== 3 || t3.nomi.includes('foto3.png')) KO('3: la foto tolta è ancora sul telefono: ' + t3.nomi.join(','));
    else righe.push('3. ✖ su una foto scelta per sbaglio: tolta dall\'elenco e dal telefono (restano ' + t3.nomi.join(', ') + ')');

    // 4. caricamento fermato a metà
    r.stato.caricamenti = [];
    r.stato.rifiutaCaricamentoN = 2;
    r.stato.dialoghi = [];
    await salva(r);
    const id1 = progettoDi(titoli[1]);
    const al1 = allegati(id1);
    const msg = r.stato.dialoghi.join(' / ');
    const t4 = await telefono(r);
    const finestra = await r.page.evaluate(() => ({ aperta: ge('m-progetto').classList.contains('on'), id: v('mp-id'), titolo: ge('mp-titolo-modal').textContent }));
    await r.page.screenshot({ path: path.join(CARTELLA_OUT, '4-fermato-a-meta-390.png') });
    if (!r.stato.rifiutati) KO('4: la prova non ha rifiutato il caricamento');
    if (!/Salvati \(1\)/.test(msg) || !/Non salvati \(2\)/.test(msg) || !/foto1\.png/.test(msg) || !/foto4\.png/.test(msg) || !/foto5\.png/.test(msg)) KO('4: messaggio senza salvati e rimasti: ' + msg.slice(0, 400));
    if (al1.split(',').filter(Boolean).length !== 1) KO('4: righe dopo il caricamento fermato: ' + al1);
    if (t4.n !== 2) KO('4: sul telefono restano ' + t4.n + ' foto invece di 2: ' + t4.nomi.join(','));
    if (!finestra.aperta || finestra.id !== id1 || !/Modifica/.test(finestra.titolo)) KO('4: la finestra non è diventata "Modifica" del progetto creato: ' + JSON.stringify(finestra));
    if (r.stato.rifiutati && t4.n === 2) righe.push('4. Storage rifiuta la 2a foto: messaggio "Salvati (1)" e "Non salvati (2)" con i nomi, 1 riga nel database, 2 foto restano sul telefono, finestra "Modifica progetto tecnico"');
    await ricarica(r);
    await r.page.evaluate(async id => { await apriProgettoDaElenco(id); }, id1);
    await attendiQuiete(r.stato, 1200);
    const a4 = await anteprime(r);
    if (a4.img !== 2) KO('4: riaperto il progetto le foto rimaste sono ' + a4.img + ': ' + a4.righe.join(' | '));
    await salva(r);
    const al1b = allegati(id1);
    const t4b = await telefono(r);
    if (al1b.split(',').filter(Boolean).length !== 3) KO('4: dopo il secondo Salva righe: ' + al1b);
    if (contaProgetti(titoli[1]) !== 1) KO('4: progetti con lo stesso titolo: ' + contaProgetti(titoli[1]));
    if (t4b.n !== 0) KO('4: dopo il secondo Salva il telefono ha ancora ' + t4b.n + ' foto');
    if (a4.img === 2 && t4b.n === 0 && al1b.split(',').filter(Boolean).length === 3) righe.push('   ricaricata la pagina e riaperto il progetto: le 2 foto rimaste ci sono; Salva = 3 righe (' + al1b + '), un solo progetto, telefono vuoto');

    // 5. "Esci" con una foto scelta
    await nuovo(r);
    await scegli(r, 'mp-file', foto[4]);
    await attendiTelefono(r, 1);
    r.stato.dialoghi = [];
    await r.page.evaluate(() => { doLogout(); });
    await r.page.waitForFunction(() => getComputedStyle(document.getElementById('lp')).display !== 'none', { timeout: 20000 }).catch(() => {});
    await attendiQuiete(r.stato, 1200);
    const t5 = await r.page.evaluate(async () => {
      const n = await operazioneFotoBozza('foto', 'readonly', st => st.count());
      const k = await operazioneFotoBozza('chiavi', 'readonly', st => st.count());
      return n + '/' + k;
    });
    if (!/foto scelta per un progetto/.test(r.stato.dialoghi.join(' '))) KO('5: "Esci" senza avviso delle foto scelte: ' + r.stato.dialoghi.join(' / '));
    if (t5 !== '0/0') KO('5: dopo "Esci" sul telefono foto/chiavi: ' + t5);
    else righe.push('5. "Esci" con una foto scelta: avviso, poi sul telefono 0 foto e 0 chiavi');

    // 6. titolare "Entra come" rappresentante
    const tit = utenti.find(u => u.ruolo === 'titolare');
    if (tit) {
      const e = await apriSito(browser, url); sessioni.push(e);
      await e.page.setViewport({ width: 390, height: 844 });
      await login(e, tit);
      await e.page.evaluate(id => { entraCome(id); }, rap.id);
      await e.page.waitForFunction(() => typeof ENTRA_COME !== 'undefined' && ENTRA_COME && ME && ROLE === 'rappresentante', { timeout: 30000 });
      await attendiQuiete(e.stato, 1500);
      await nuovo(e);
      await compila(e, titoli[3]);
      await scegli(e, 'mp-file', foto[4]);
      await salva(e);
      const id6 = progettoDi(titoli[3]);
      const chi = id6 ? psql('select p.rappresentante_id || \'|\' || coalesce(string_agg(a.caricato_da::text, \',\'), \'\') from public.progetti_tecnici p left join public.progetti_tecnici_allegati a on a.progetto_id = p.id where p.id = ' + q(id6) + ' group by p.rappresentante_id') : '';
      if (!id6) KO('6: "Entra come" rappresentante: progetto non creato ' + await toastTesto(e));
      else if (chi !== rap.id + '|' + rap.id) KO('6: rappresentante_id|caricato_da = ' + chi + ' invece di ' + rap.id);
      else righe.push('6. titolare "Entra come" rappresentante: progetto creato con la foto, rappresentante_id e caricato_da = il rappresentante');
    }

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(x => (x.status >= 500 || /does not exist|Could not find/i.test(x.msg)) &&
        !/schede_migrate_motore|invio_dopo_visita_attivo|sconto_rappresentante_attivo|progetti_simili_cliente|Caricamento rifiutato dalla prova/.test(x.dove + x.msg));
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
        psql("update public.avvisi set stato = 'annullato', chiuso_il = now(), esito = 'prova foto bozza' where tipo = 'progetto_doppione' and stato = 'aperto' and rif_id in (select id::text from public.progetti_tecnici where titolo = " + q(t) + ')');
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
