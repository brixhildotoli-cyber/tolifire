#!/usr/bin/env node
// F15.18 (versione ridotta, decisione di Erika dell'11/11) - Promemoria delle
// integrazioni: "Richiedi integrazione" resta com'è; il motore delle
// scadenze (sql/64, 65) manda il promemoria al rappresentante dopo 2 giorni
// lavorativi e l'avviso al titolare dopo 7 (giorni lavorativi con sql/88);
// js/46 li mostra in "Cosa tocca a me". Chrome headless con puppeteer-core,
// SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh). Le regole di
// smistamento si spengono durante la prova (come in produzione dopo sql/260)
// e si riaccendono alla fine come erano.
// "OROLOGIO DI PROVA": la scadenza di un progetto da integrare riparte con
// l'inizio N giorni lavorativi fa e gira il controllo orario.
//  1. +1 gg lav.: riga "Progetti da integrare" del rappresentante normale;
//  2. +3 gg lav.: riga rossa "di cui 1 da più di 2 giorni lavorativi" e
//     promemoria 🔔 (a 390 px);
//  3. +6 gg lav. (oltre 7 di calendario): con sql/88 niente avviso al
//     titolare per quel progetto, senza sql/88 sì (come prima);
//  4. +8 gg lav.: il titolare ha la riga "⏰ Integrazioni ferme dal
//     rappresentante" con lo stesso numero del database e l'avviso;
//  5. ingegnere e Acquisti: dashboard senza errori, guida aggiornata;
//     console (REST) di rappresentante, ingegnere, Acquisti: salva_regola e
//     update diretti di regole e scadenze rifiutati dal database.
// INTEGRAZIONI_SENZA_SQL=1: prova senza sql/88 (la riga del titolare conta
// i 7 giorni di calendario).
// Alla fine la scadenza del progetto riparte com'era (sincronizza_scadenze).
// Uso: cd test && node integrazioni-promemoria.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-integrazioni-promemoria');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA INTEGRAZIONE';
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

async function righeTAM(s, ruolo) {
  await s.page.evaluate(async () => { if (typeof caricaToccaAMe === 'function') await caricaToccaAMe(); });
  await attendiQuiete(s.stato, 1500);
  return s.page.evaluate(ruolo => [...document.querySelectorAll('#' + BOX_TOCCA_A_ME[ruolo] + ' .tam-riga')].map(b => ({
    id: b.dataset.fonte, urgente: b.classList.contains('urgente'),
    n: (b.querySelector('.tam-num') || {}).textContent, testo: b.innerText.replace(/\s+/g, ' ')
  })), ruolo);
}

(async () => {
  const righe = [];
  const fallimenti = [];
  const KO = m => fallimenti.push(m);
  const ok = m => righe.push('ok  ' + m);
  const SENZA = CONF.INTEGRAZIONI_SENZA_SQL === '1';
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const con88 = psql("select unita = 'giorni_lav' from public.regole where chiave = 'integrazione_avviso_titolare_gg'") === 't';
  if (SENZA && con88) fermati('INTEGRAZIONI_SENZA_SQL=1 ma sql/88 c\'è: esegui prima il ROLLBACK');
  if (!SENZA && !con88) fermati('sql/88 non c\'è sul database locale');
  const riga = psql("select p.id || '|' || u.id from public.progetti_tecnici p join public.utenti u on u.id = p.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo where p.stato = 'da_integrare' order by p.creato_il limit 1");
  if (!riga) fermati('serve un progetto da integrare con un rappresentante attivo');
  const [progId, rapId] = riga.split('|');
  const regoleSpente = psql("select case when to_regclass('public.regole_smistamento') is null then '' else (select coalesce(string_agg(id::text, ','), '') from public.regole_smistamento where attiva) end");
  if (regoleSpente) psql('update public.regole_smistamento set attiva = false where id in (' + regoleSpente + ')');
  // Tutti gli altri progetti da integrare di quel rappresentante: spostati
  // a "più di 2 gg" no; li contiamo dal database con la stessa regola di js/46.
  const orologio = gg => psql(
    "update public.scadenze set stato = 'chiusa', chiusa_il = now(), chiusa_motivo = 'prova F15.18' where regola_codice = 'integrazione_venditore' and oggetto_id = " + q(progId) + " and stato = 'aperta';" +
    "select public.apri_scadenza('integrazione_venditore', 'progetto_tecnico', " + q(progId) + ", 'Prova F15.18', " + q(rapId) + ", " +
    "(public.aggiungi_gg_lav(current_date, -" + gg + ") + (now() at time zone 'Europe/Rome')::time) at time zone 'Europe/Rome');" +
    'select public.genera_avvisi_scadenza();').split('\n')[0];
  const oltreRap = () => Number(psql("select count(distinct s.oggetto_id) from public.scadenze s join public.progetti_tecnici p on p.id::text = s.oggetto_id and p.stato = 'da_integrare' where s.regola_codice = 'integrazione_venditore' and s.stato = 'aperta' and not s.prova and s.destinatario_id = " + q(rapId) + ' and s.scade_il < now()'));
  const oltreTit = () => Number(psql("select count(distinct s.oggetto_id) from public.scadenze s join public.progetti_tecnici p on p.id::text = s.oggetto_id and p.stato = 'da_integrare' where s.regola_codice = 'integrazione_venditore' and s.stato = 'aperta' and not s.prova and s.risale_il < now()"));
  const daIntegrareRap = Number(psql("select count(*) from public.progetti_tecnici where stato = 'da_integrare' and rappresentante_id = " + q(rapId)));

  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const rap = utenti.find(u => u.id === rapId);
  const tit = utenti.find(u => u.ruolo === 'titolare');
  const ing = utenti.find(u => u.ruolo === 'ingegnere');
  const com = utenti.find(u => u.ruolo === 'commerciale');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const errori = (s, chi) => {
    const js = s.stato.erroriJs.concat(s.stato.console.filter(t => !/404|PGRST|Cosa tocca a me/.test(t)));
    const rete = s.stato.rete.filter(x => x.status >= 500);
    if (js.length || rete.length) KO(chi + ': errori ' + JSON.stringify(js.concat(rete)).slice(0, 400));
    else ok(chi + ': nessun errore JavaScript né 5xx');
  };

  try {
    // 1. +1 giorno lavorativo
    orologio(1);
    const altriRap = oltreRap();
    let r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);
    let tam = await righeTAM(r, 'rappresentante');
    let x = tam.find(t => t.id === 'progetti-da-integrare');
    if (!x || Number(x.n) !== daIntegrareRap) KO('1: riga Progetti da integrare assente o numero diverso ' + JSON.stringify(x));
    else if (altriRap === 0 && (x.urgente || /da più di/.test(x.testo))) KO('1: dopo 1 gg lav. la riga è già rossa ' + x.testo);
    else ok('1: +1 gg lav. "' + x.testo + '"' + (altriRap ? ' (altri ' + altriRap + ' progetti già oltre)' : ''));

    // 2. +3 giorni lavorativi: promemoria
    orologio(3);
    tam = await righeTAM(r, 'rappresentante');
    x = tam.find(t => t.id === 'progetti-da-integrare');
    const attesi = oltreRap();
    if (!x || !x.urgente || !new RegExp('di cui ' + attesi + ' da più di 2 giorni lavorativi').test(x.testo)) KO('2: riga rossa attesa con "di cui ' + attesi + '": ' + JSON.stringify(x));
    else ok('2: +3 gg lav. "' + x.testo + '"');
    const avvisoRap = await r.page.evaluate(async id => { const { data } = await db.rpc('miei_avvisi', { p_tutti: false, p_chiusi: false }); return (data || []).filter(a => a.tipo === 'scadenza' && a.rif_id === id).length; }, progId);
    if (avvisoRap !== 1) KO('2: promemoria 🔔 al rappresentante: ' + avvisoRap); else ok('2: promemoria 🔔 nella campanella del rappresentante');
    await r.page.screenshot({ path: path.join(CARTELLA_OUT, 'rappresentante-390.png') });
    // console del rappresentante: rifiuti del database
    const rifiuti = await r.page.evaluate(async () => {
      const a = await db.rpc('salva_regola', { p_chiave: 'integrazione_avviso_titolare_gg', p_valore: 30, p_nota: 'console' });
      const b = await db.from('regole').update({ unita: 'giorni' }).eq('chiave', 'integrazione_avviso_titolare_gg').select();
      const c = await db.from('scadenze').update({ risale_il: '2030-01-01T00:00:00Z' }).eq('regola_codice', 'integrazione_venditore').select();
      return [a.error ? a.error.code : 'ok', b.error ? b.error.code : (b.data || []).length, c.error ? c.error.code : (c.data || []).length];
    });
    if (rifiuti[0] === 'ok' || rifiuti[1] > 0 || rifiuti[2] > 0) KO('console del rappresentante non rifiutata ' + JSON.stringify(rifiuti));
    else ok('console del rappresentante rifiutata dal database ' + JSON.stringify(rifiuti));
    errori(r, 'rappresentante');
    await r.page.evaluate(async () => { gotoPage('info'); });
    await attendiQuiete(r.stato, 500);
    if (!(await r.page.evaluate(() => !!document.querySelector('#guida-rappresentante #info-rap-36')))) KO('guida info-rap-36 assente'); else ok('guida info-rap-36');
    await chiudi(r);

    // 3. +6 giorni lavorativi (più di 7 di calendario)
    orologio(6);
    const risalita6 = psql("select risalita_il is not null from public.scadenze where regola_codice = 'integrazione_venditore' and oggetto_id = " + q(progId) + " and stato = 'aperta'") === 't';
    if (SENZA ? !risalita6 : risalita6) KO('3: +6 gg lav. risalita ' + risalita6 + ' (attesa ' + SENZA + ')');
    else ok('3: +6 gg lav. avviso al titolare ' + (risalita6 ? 'già partito (7 giorni di calendario, senza sql/88)' : 'non ancora (7 giorni lavorativi)'));

    // 4. +8 giorni lavorativi: avviso al titolare
    orologio(8);
    const nTit = oltreTit();
    r = await apriSito(browser, url); sessioni.push(r);
    await login(r, tit);
    tam = await righeTAM(r, 'titolare');
    x = tam.find(t => t.id === 'integrazioni-ferme-titolare');
    const unita = SENZA ? '7 giorni:' : '7 giorni lavorativi';
    if (!x || Number(x.n) !== nTit || !x.urgente || x.testo.indexOf(unita) < 0) KO('4: riga del titolare ' + JSON.stringify(x) + ' attesi ' + nTit);
    else ok('4: +8 gg lav. "' + x.testo + '"');
    const avvisoTit = await r.page.evaluate(async id => { const { data } = await db.rpc('miei_avvisi', { p_tutti: false, p_chiusi: false }); return (data || []).filter(a => a.tipo === 'scadenza_risalita' && a.rif_id === id).length; }, progId);
    if (avvisoTit !== 1) KO('4: avviso 🔔 al titolare: ' + avvisoTit); else ok('4: avviso 🔔 nella campanella del titolare');
    await r.page.evaluate(() => vaiToccaAMe('integrazioni-ferme-titolare'));
    await attendiQuiete(r.stato, 1200);
    const pagina = await r.page.evaluate(() => (document.querySelector('.page.on') || {}).id);
    if (!/pg-progett/.test(pagina || '')) KO('4: la riga non apre i progetti: ' + pagina); else ok('4: la riga apre ' + pagina);
    await r.page.evaluate(async () => { gotoPage('info'); });
    await attendiQuiete(r.stato, 500);
    if (!(await r.page.evaluate(() => !!document.querySelector('#guida-titolare #info-tit-35')))) KO('guida info-tit-35 assente'); else ok('guida info-tit-35');
    errori(r, 'titolare');
    await chiudi(r);

    // 5. ingegnere e Acquisti
    for (const [u, ruolo, guida] of [[ing, 'ingegnere', 'info-ing-29'], [com, 'commerciale', 'info-com-24']]) {
      if (!u) { KO('manca un utente ' + ruolo); continue; }
      r = await apriSito(browser, url); sessioni.push(r);
      await r.page.setViewport({ width: 390, height: 844 });
      await login(r, u);
      const rif = await r.page.evaluate(async () => {
        const a = await db.rpc('salva_regola', { p_chiave: 'integrazione_venditore_gg', p_valore: 10, p_nota: 'console' });
        const b = await db.from('regole').update({ valore: 10 }).eq('chiave', 'integrazione_venditore_gg').select();
        const c = await db.from('scadenze').select('id').eq('regola_codice', 'integrazione_venditore');
        return [a.error ? a.error.code : 'ok', b.error ? b.error.code : (b.data || []).length, c.error ? c.error.code : (c.data || []).length];
      });
      if (rif[0] === 'ok' || rif[1] > 0 || rif[2] > 0) KO(ruolo + ': console non rifiutata ' + JSON.stringify(rif));
      else ok(ruolo + ': salva_regola e update rifiutati, nessuna scadenza letta ' + JSON.stringify(rif));
      await r.page.evaluate(async () => { gotoPage('info'); });
      await attendiQuiete(r.stato, 500);
      if (!(await r.page.evaluate(g => !!document.getElementById(g), guida))) KO('guida ' + guida + ' assente'); else ok('guida ' + guida);
      errori(r, ruolo);
      await chiudi(r);
    }
  } catch (e) {
    KO('eccezione: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | '));
  } finally {
    for (const s of sessioni) await chiudi(s);
    try { await browser.close(); } catch (e) { /* già chiuso */ }
    srv.close();
    // la scadenza del progetto riparte con il suo inizio vero
    try {
      psql("update public.scadenze set stato = 'chiusa', chiusa_il = now(), chiusa_motivo = 'prova F15.18 finita' where regola_codice = 'integrazione_venditore' and oggetto_id = " + q(progId) + " and stato = 'aperta'; select public.sincronizza_scadenze();");
    } catch (e) { KO('ripristino della scadenza: ' + e.message); }
    if (regoleSpente) { try { psql('update public.regole_smistamento set attiva = true where id in (' + regoleSpente + ')'); } catch (e) { KO('regole di smistamento non riaccese: ' + e.message); } }
  }
  righe.forEach(x => console.log(x));
  fallimenti.forEach(x => console.log('FALLITO ' + x));
  console.log(fallimenti.length ? 'ESITO: FALLITO (' + fallimenti.length + ')' : 'ESITO: TUTTO OK' + (SENZA ? ' (senza sql/88)' : ''));
  process.exit(fallimenti.length ? 1 : 0);
})();
