#!/usr/bin/env node
// F15.2 - Posizioni P-xx dentro le schede di rilievo (js/66-posizioni.js,
// sql/76), Chrome headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh, poi sql/76 e il suo -REGISTRO-CANCELLAZIONI).
// Il "fatto quando" della task:
//  1. l'ingegnere, nella scheda Porte REI di un progetto in preventivazione,
//     aggiunge P-01 (90 x 210 cm), la duplica 9 volte (P-01..P-10) e cambia
//     la misura della P-07 (120 cm): tutto dai bottoni, a 390 px;
//  2. il rappresentante del progetto vede le 10 posizioni nella scheda
//     progetto senza bottoni (progetto in preventivazione) e il database gli
//     rifiuta l'aggiunta dalla console; con il progetto "da integrare"
//     duplica da solo una posizione;
//  3. il commerciale le vede in sola lettura; dalla console inserimento
//     rifiutato e modifica senza righe cambiate;
//  4. il tecnico (ruolo non ammesso) dalla console: nessuna riga, inserimento
//     e duplica rifiutati.
// Nessun errore JavaScript né del database. Con POSIZIONI_SENZA_SQL=1 (dopo il
// ROLLBACK di sql/76): scheda e scheda progetto si aprono come prima, nessun
// riquadro delle posizioni, nessun errore.
// Alla fine le posizioni di prova si tolgono da psql (solo database locale) e
// il progetto torna nel suo stato; il registro delle azioni resta (si contano
// solo le righe nuove).
// Uso: cd test && node posizioni.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-posizioni');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.2';
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


async function chiudi(s) { if (s.chiuso) return; s.chiuso = true; try { await s.contesto.close(); } catch (e) { /* già chiuso */ } }
const q = s => "'" + String(s).replace(/'/g, "''") + "'";

async function apriSchedaPorte(s, progettoId) {
  await s.page.evaluate(async progettoId => {
    let el = document.getElementById('mvt-id');
    if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.id = 'mvt-id'; document.body.appendChild(el); }
    el.value = progettoId;
    await apriSchedaPorteReiIngegnere();
  }, progettoId);
  await attendiQuiete(s.stato, 900);
}
async function apriProgetto(s, progettoId) {
  await s.page.evaluate(async id => { await openProgettoDetail(id); }, progettoId);
  await attendiQuiete(s.stato, 1200);
  await s.page.evaluate(() => { const t = [...document.querySelectorAll('#pg-progetto-detail .tab')].find(x => /Rilievi tecnici/.test(x.textContent)); if (t) t.click(); });
  await attendiQuiete(s.stato, 500);
}
const testoPosizioni = (s, id) => s.page.evaluate(id => { const b = document.getElementById(id); return b ? b.innerText : null; }, id);

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const SENZA = CONF.POSIZIONI_SENZA_SQL === '1';
  const c76 = psql("select to_regclass('public.progetti_tecnici_posizioni') is not null");
  if (!SENZA && c76 !== 't') fermati('sql/76 non eseguito nel database locale');
  if (SENZA && c76 === 't') fermati('POSIZIONI_SENZA_SQL=1 ma la tabella c\'è: eseguire prima il ROLLBACK di sql/76');
  // Progetto in preventivazione (o inviato al commerciale) di un rappresentante attivo
  const riga = psql("select p.id || '|' || p.stato || '|' || p.rappresentante_id from public.progetti_tecnici p join public.utenti u on u.id = p.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where p.stato in ('in_preventivazione','inviato_a_commerciale') and exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = p.id) order by p.creato_il limit 1");
  if (!riga) fermati('serve un progetto in preventivazione con una scheda di rilievo');
  const [progettoId, statoPartenza, rapId] = riga.split('|');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const ing = primo('ingegnere'), com = primo('commerciale'), tec = primo('tecnico');
  const rap = utenti.find(u => u.id === rapId);
  if (!ing || !com || !tec || !rap) fermati('servono ingegnere, commerciale, tecnico e il rappresentante del progetto attivi');
  const regPrima = psql('select coalesce(max(id), 0) from public.registro_azioni');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  let base = 0;
  try {
    if (SENZA) {
      const g = await apriSito(browser, url); sessioni.push(g);
      await login(g, ing);
      await apriSchedaPorte(g, progettoId);
      const box = await testoPosizioni(g, 'rsm-posizioni');
      if (box !== null) KO('senza sql/76: la scheda mostra il riquadro delle posizioni: ' + box);
      else righe.push('senza sql/76: la scheda Porte REI si apre come prima, nessun riquadro delle posizioni');
      await g.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });
      await chiudi(g);
      const r = await apriSito(browser, url); sessioni.push(r);
      await login(r, rap);
      await apriProgetto(r, progettoId);
      const n = await r.page.evaluate(() => document.querySelectorAll('#pd-schede-content .card').length);
      const pos = await r.page.evaluate(() => [...document.querySelectorAll('[id^="pd-posizioni-"]')].map(x => x.innerText.trim()).filter(Boolean).length);
      if (!n) KO('senza sql/76: la scheda progetto non mostra le schede');
      else if (pos) KO('senza sql/76: la scheda progetto mostra posizioni');
      else righe.push('senza sql/76: il rappresentante vede le ' + n + ' schede del progetto come prima, nessuna posizione');
    } else {
      base = Number(psql('select coalesce(max(numero), 0) from public.progetti_tecnici_posizioni where progetto_tecnico_id = ' + q(progettoId)));
      const cod = n => 'P-' + String(base + n).padStart(2, '0');
      // 1. ingegnere, a 390 px
      const g = await apriSito(browser, url); sessioni.push(g);
      await g.page.setViewport({ width: 390, height: 844 });
      await login(g, ing);
      await apriSchedaPorte(g, progettoId);
      let porte = psql("select id from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' order by numero limit 1");
      if (!porte) {
        const avviso = await testoPosizioni(g, 'rsm-posizioni');
        if (!/Salva la scheda/.test(avviso || '')) KO('1: scheda nuova senza l\'avviso "Salva la scheda": ' + avviso);
        // F15.6 (sql/80): con la porte REI migrata il bottone apre il motore
        await g.page.evaluate(async () => {
          const motore = !!document.getElementById('msm-motore');
          const p = motore ? 'msm-c-' : 'pr-';
          document.getElementById(p + 'tipologia').value = 'battente_singolo'; document.getElementById(p + 'rei').value = 'rei_60'; document.getElementById('rsm-nome').value = 'Piano 1';
          if (motore) await salvaSchedaMotore(); else await salvaSchedaPorteRei();
        });
        await attendiQuiete(g.stato, 1200);
        porte = psql("select id from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'porte_rei' order by numero limit 1");
        if (!porte) throw new Error('scheda Porte REI non salvata');
        righe.push('1. l\'ingegnere salva la scheda Porte REI (Piano 1): prima del salvataggio "Salva la scheda per aggiungere le posizioni"');
      }
      await g.page.waitForSelector('#pos-nuova-btn', { timeout: 10000 });
      await g.page.click('#pos-nuova-btn');
      await g.page.waitForFunction(() => document.getElementById('m-posizione').classList.contains('on'), { timeout: 5000 });
      await g.page.type('#pos-ubicazione', 'Corridoio piano 1');
      await g.page.evaluate(() => { document.getElementById('pos-quantita').value = '1'; });
      await g.page.type('#pos-larghezza', '90');
      await g.page.type('#pos-altezza', '210');
      await g.page.click('#pos-salva');
      await attendiQuiete(g.stato, 900);
      const p01 = psql('select id from public.progetti_tecnici_posizioni where progetto_tecnico_id = ' + q(progettoId) + ' and numero = ' + (base + 1));
      if (!p01) throw new Error(cod(1) + ' non salvata');
      righe.push('   l\'ingegnere aggiunge ' + cod(1) + ' (Corridoio piano 1, 90 × 210 cm) dal bottone "+ Aggiungi posizione"');
      await g.page.click('#pos-duplica-' + p01);
      await g.page.waitForFunction(() => document.getElementById('m-posizione-duplica').classList.contains('on'), { timeout: 5000 });
      await g.page.evaluate(() => { document.getElementById('posd-copie').value = ''; });
      await g.page.type('#posd-copie', '9');
      await g.page.screenshot({ path: path.join(CARTELLA_OUT, '1-ingegnere-duplica-390.png') });
      const t0 = Date.now();
      await g.page.click('#posd-conferma');
      await attendiQuiete(g.stato, 900);
      const codici = psql("select string_agg(codice, ',' order by numero) from public.progetti_tecnici_posizioni where scheda_id = " + q(porte) + ' and numero > ' + base);
      const attesi = Array.from({ length: 10 }, (x, i) => cod(i + 1)).join(',');
      if (codici !== attesi) KO('1: dopo "Duplica" 9: ' + codici + ' (attesi ' + attesi + ')');
      else righe.push('   "⧉ Duplica" con 9 copie: ' + cod(1) + '..' + cod(10) + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
      const p07 = psql('select id from public.progetti_tecnici_posizioni where progetto_tecnico_id = ' + q(progettoId) + ' and numero = ' + (base + 7));
      await g.page.evaluate(id => apriPosizione(id, 'rsm-posizioni'), p07);
      await g.page.waitForFunction(() => document.getElementById('m-posizione').classList.contains('on'), { timeout: 5000 });
      await g.page.evaluate(() => { document.getElementById('pos-larghezza').value = ''; });
      await g.page.type('#pos-larghezza', '120');
      await g.page.screenshot({ path: path.join(CARTELLA_OUT, '1-ingegnere-P07-390.png') });
      await g.page.click('#pos-salva');
      await attendiQuiete(g.stato, 900);
      const larg = psql("select string_agg(codice || '=' || (dati->>'larghezza'), ',' order by numero) from public.progetti_tecnici_posizioni where scheda_id = " + q(porte) + ' and numero > ' + base);
      const larghe = larg.split(',').filter(x => /=120$/.test(x));
      if (larghe.length !== 1 || larghe[0] !== cod(7) + '=120' || larg.split(',').filter(x => /=90$/.test(x)).length !== 9) KO('1: misure dopo la modifica della P-07: ' + larg);
      else righe.push('   l\'ingegnere cambia la larghezza della ' + cod(7) + ' a 120 cm: le altre 9 restano 90');
      const elenco = await testoPosizioni(g, 'rsm-posizioni');
      if (!/Posizioni \(10\)/.test(elenco || '') || !(elenco || '').includes('120 × 210 cm')) KO('1: elenco nella scheda non aggiornato: ' + String(elenco).slice(0, 200));
      await g.page.screenshot({ path: path.join(CARTELLA_OUT, '1-ingegnere-elenco-390.png') });
      await g.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });
      const reg = psql("select count(*) filter (where azione = 'inserimento') || ',' || count(*) filter (where azione = 'modifica' and record_id = " + q(p07) + ") from public.registro_azioni where tabella = 'progetti_tecnici_posizioni' and id > " + regPrima);
      const [ins, mod] = reg.split(',').map(Number);
      if (ins < 10 || mod < 1) KO('1: registro delle azioni: ' + reg); else righe.push('   registro delle azioni: ' + ins + ' inserimenti, ' + mod + ' modifiche della ' + cod(7));
      await chiudi(g);

      // 2. rappresentante del progetto
      const r = await apriSito(browser, url); sessioni.push(r);
      await r.page.setViewport({ width: 390, height: 844 });
      await login(r, rap);
      await apriProgetto(r, progettoId);
      const vista = await testoPosizioni(r, 'pd-posizioni-' + porte);
      const bottoni = await r.page.evaluate(id => document.querySelectorAll('#pd-posizioni-' + id + ' button').length, porte);
      const apri = await r.page.evaluate(id => [...document.querySelectorAll('#pd-posizioni-' + id + ' button')].every(b => /Apri/.test(b.textContent)), porte);
      if (!/Posizioni \(10\)/.test(vista || '') || !apri) KO('2: il rappresentante (progetto in preventivazione): ' + String(vista).slice(0, 160) + ' bottoni ' + bottoni);
      else righe.push('2. il rappresentante vede le 10 posizioni nella scheda progetto, solo "👁 Apri" (progetto in preventivazione)');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '2-rappresentante-progetto-390.png'), fullPage: false });
      const cons2 = await r.page.evaluate(async (scheda, prog, id) => {
        const ins = await db.from('progetti_tecnici_posizioni').insert({ scheda_id: scheda, progetto_tecnico_id: prog, numero: 1 });
        const dup = await db.rpc('duplica_posizione', { p_posizione_id: id, p_copie: 1 });
        return [ins.error ? 'insert rifiutato: ' + ins.error.message : 'insert RIUSCITO', dup.error ? 'duplica rifiutata: ' + dup.error.message : 'duplica RIUSCITA'].join(' | ');
      }, porte, progettoId, p01);
      if (!/insert rifiutato/.test(cons2) || !/duplica rifiutata/.test(cons2)) KO('2: console del rappresentante: ' + cons2);
      else righe.push('   console del rappresentante: ' + cons2);
      psql("update public.progetti_tecnici set stato = 'da_integrare' where id = " + q(progettoId));
      await apriProgetto(r, progettoId);
      await r.page.waitForSelector('#pos-duplica-' + p01, { timeout: 8000 });
      await r.page.click('#pos-duplica-' + p01);
      await r.page.waitForFunction(() => document.getElementById('m-posizione-duplica').classList.contains('on'), { timeout: 5000 });
      await r.page.click('#posd-conferma');
      await attendiQuiete(r.stato, 900);
      const p11 = psql("select creata_da || ',' || codice from public.progetti_tecnici_posizioni where progetto_tecnico_id = " + q(progettoId) + ' and numero = ' + (base + 11));
      if (p11 !== rap.id + ',' + cod(11)) KO('2: duplica del rappresentante con il progetto da integrare: ' + p11);
      else righe.push('   con il progetto "da integrare" il rappresentante duplica da solo: nasce ' + cod(11) + ' a suo nome');
      psql('update public.progetti_tecnici set stato = ' + q(statoPartenza) + ' where id = ' + q(progettoId));
      await chiudi(r);

      // 3. commerciale
      const c = await apriSito(browser, url); sessioni.push(c);
      await login(c, com);
      await apriProgetto(c, progettoId);
      const vistaC = await testoPosizioni(c, 'pd-posizioni-' + porte);
      const btnC = await c.page.evaluate(id => [...document.querySelectorAll('#pd-posizioni-' + id + ' button')].filter(b => !/Apri/.test(b.textContent)).length, porte);
      if (!/Posizioni \(11\)/.test(vistaC || '') || btnC) KO('3: il commerciale: ' + String(vistaC).slice(0, 160) + ' bottoni di scrittura ' + btnC);
      else righe.push('3. il commerciale vede le 11 posizioni in sola lettura');
      const cons3 = await c.page.evaluate(async (scheda, prog, id) => {
        const ins = await db.from('progetti_tecnici_posizioni').insert({ scheda_id: scheda, progetto_tecnico_id: prog, numero: 1 });
        const upd = await db.from('progetti_tecnici_posizioni').update({ quantita: 9 }).eq('id', id).select('id');
        return [ins.error ? 'insert rifiutato: ' + ins.error.message : 'insert RIUSCITO', upd.error ? 'update: ' + upd.error.message : 'update righe ' + upd.data.length].join(' | ');
      }, porte, progettoId, p07);
      if (!/insert rifiutato/.test(cons3) || !/update righe 0/.test(cons3)) KO('3: console del commerciale: ' + cons3);
      else righe.push('   console del commerciale: ' + cons3);
      await chiudi(c);

      // 4. tecnico (ruolo non ammesso)
      const t = await apriSito(browser, url); sessioni.push(t);
      await login(t, tec);
      const cons4 = await t.page.evaluate(async (scheda, prog, id) => {
        const sel = await db.from('progetti_tecnici_posizioni').select('id');
        const ins = await db.from('progetti_tecnici_posizioni').insert({ scheda_id: scheda, progetto_tecnico_id: prog, numero: 1 });
        const dup = await db.rpc('duplica_posizione', { p_posizione_id: id, p_copie: 1 });
        return [sel.error ? 'lettura: ' + sel.error.message : 'lettura righe ' + sel.data.length,
                ins.error ? 'insert rifiutato: ' + ins.error.message : 'insert RIUSCITO',
                dup.error ? 'duplica rifiutata: ' + dup.error.message : 'duplica RIUSCITA'].join(' | ');
      }, porte, progettoId, p01);
      if (!/lettura righe 0/.test(cons4) || !/insert rifiutato/.test(cons4) || !/duplica rifiutata/.test(cons4)) KO('4: console del tecnico: ' + cons4);
      else righe.push('4. console del tecnico: ' + cons4);
    }

    for (const s of sessioni.filter(x => !x.chiuso)) await chiudi(s);
    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      // i rifiuti provati dalla console (4xx) sono voluti: contano solo 5xx e colonne/funzioni mancanti
      const rete = s.stato.rete.filter(r => r.status >= 500 || /does not exist|Could not find/i.test(r.msg) && !/schede_migrate_motore/.test(r.msg) /* F15.6: 404 voluto senza sql/80 */ && !(SENZA && /progetti_tecnici_posizioni/.test(r.dove + r.msg)));
      if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    // Solo database locale: via le posizioni di prova, progetto nel suo stato
    try {
      psql('update public.progetti_tecnici set stato = ' + q(statoPartenza) + ' where id = ' + q(progettoId));
      if (!SENZA) psql('delete from public.progetti_tecnici_posizioni where progetto_tecnico_id = ' + q(progettoId) + ' and numero > ' + base);
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
