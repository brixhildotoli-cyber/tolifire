#!/usr/bin/env node
// F14.21 - Riassegnazione delle pratiche (js/10, sql/74), Chrome headless
// con puppeteer-core, SOLO DATABASE LOCALE con sql/74 eseguito
// (test/locale/avvia-db-locale.sh, poi sql/74 e il -REGISTRO-CANCELLAZIONI).
// Il "fatto quando" della task:
//  1. una persona in uscita (rappresentante di prova) ha 20 pratiche aperte
//     (8 clienti, 4 trattative, 4 progetti, 3 preventivi, 1 commessa);
//  2. il titolare in Impostazioni > Team la disattiva: il sito avvisa delle
//     pratiche, la persona risulta "Uscita da completare" (non completata)
//     e si apre la riassegnazione;
//  3. il titolare le sposta a un altro rappresentante in UNA operazione:
//     registro con 20 righe, la persona risulta "Uscita completata";
//  4. dal database (PostgREST, come dalla console del browser) segreteria,
//     rappresentante e titolare con "Entra come" segreteria sono rifiutati.
// Nessun errore JavaScript né del database. Schermate a 390 px nella
// cartella dei risultati ($TMPDIR/toli-riassegna).
// Uso: cd test && node riassegnazione-pratiche.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-riassegna');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F14.21';
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

// Persona in uscita con 20 pratiche aperte (dati nati senza trigger)
function preparaUscente(suffisso) {
  const sql = `
do $d$
declare v_da uuid := gen_random_uuid(); v_cli uuid[]; v_x uuid; v_prev uuid; i integer;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (v_da, 'authenticated', 'authenticated', 'prova74.uscente.${suffisso}@prova.invalid', now(), now());
  insert into public.utenti (id, nome, cognome, email, ruolo, attivo)
    values (v_da, 'Prova74', 'Uscente ${suffisso}', 'prova74.uscente.${suffisso}@prova.invalid', 'rappresentante', true);
  set local session_replication_role = replica;
  for i in 1..8 loop
    insert into public.clienti (ragione_sociale, rappresentante_id) values ('PROVA74 Cliente ' || i || ' ${suffisso}', v_da) returning id into v_x;
    v_cli := v_cli || v_x;
  end loop;
  for i in 1..4 loop
    insert into public.pipeline_crm (cliente_id, rappresentante_id, fase) values (v_cli[i], v_da, 'primo_contatto');
    insert into public.progetti_tecnici (cliente_id, rappresentante_id, titolo, tipologia, descrizione_tecnica, stato)
      values (v_cli[i], v_da, 'PROVA74 progetto ' || i, 'estintori', 'prova', 'bozza');
  end loop;
  for i in 1..3 loop
    insert into public.preventivi (cliente_id, rappresentante_id, stato, totale_imponibile) values (v_cli[i], v_da, 'bozza', 100);
  end loop;
  insert into public.progetti_tecnici (cliente_id, rappresentante_id, titolo, tipologia, descrizione_tecnica, stato)
    values (v_cli[8], v_da, 'PROVA74 progetto della commessa', 'estintori', 'prova', 'approvato') returning id into v_x;
  insert into public.preventivi (cliente_id, rappresentante_id, stato, totale_imponibile, progetto_tecnico_id)
    values (v_cli[8], v_da, 'accettato', 1000, v_x) returning id into v_prev;
  perform public.crea_commessa_per_preventivo(v_prev, now(), null, 'accettazione');
end $d$;`;
  psql(sql);
  return psql("select id from public.utenti where email = 'prova74.uscente." + suffisso + "@prova.invalid'");
}

async function rpcRifiutata(token, nome, corpo, intest) {
  const r = await fetch(BACK.rest + '/rpc/' + nome, { method: 'POST', headers: Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' }, intest || {}), body: JSON.stringify(corpo) });
  const t = await r.text();
  return { ok: r.ok, status: r.status, testo: t.slice(0, 200) };
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  if (psql("select to_regprocedure('public.riassegna_pratiche(uuid,uuid,text[],text)') is not null") !== 't') fermati('sql/74 non eseguito nel database locale');
  const suffisso = Date.now().toString(36);
  const uscenteId = preparaUscente(suffisso);
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r && !/prova74/.test(u.email)).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const tit = primo('titolare'), seg = primo('segreteria'), rap = primo('rappresentante');
  if (!tit || !seg || !rap) fermati('servono titolare, segreteria e rappresentante attivi');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    const conta = psql("select sum(n) from public.pratiche_aperte_di('" + uscenteId + "')");
    if (conta !== '20') KO('1: pratiche di prova ' + conta + ' invece di 20'); else righe.push('1. persona in uscita con 20 pratiche aperte');

    // 2. titolare: disattiva dal Team
    const t = await apriSito(browser, url); sessioni.push(t);
    await t.page.setViewport({ width: 390, height: 844 });
    await login(t, tit);
    await t.page.evaluate(() => gotoPage('impostazioni'));
    await attendiQuiete(t.stato, 1500);
    const stato1 = await t.page.evaluate(id => { const b = [...document.querySelectorAll('#teamlist tr')].find(r => r.innerHTML.indexOf(id) >= 0); return b ? b.innerText : ''; }, uscenteId);
    if (!/20 pratiche aperte/.test(stato1) || !/Riassegna/.test(stato1)) KO('2: riga Team senza pratiche o bottone: ' + stato1.slice(0, 200)); else righe.push('2. Team: "20 pratiche aperte" e "🔀 Riassegna"');
    await t.page.evaluate(id => toggleAttivoUtente(id, true), uscenteId);
    await attendiQuiete(t.stato, 1500);
    if (psql("select attivo from public.utenti where id = '" + uscenteId + "'") !== 'f') KO('2: persona non disattivata');
    const aperta = await t.page.evaluate(() => document.getElementById('m-riassegna-pratiche').classList.contains('on') || getComputedStyle(document.getElementById('m-riassegna-pratiche')).display !== 'none');
    if (!aperta) KO('2: la riassegnazione non si è aperta dopo la disattivazione');
    if (psql("select public.uscita_completata('" + uscenteId + "')") !== 'f') KO('2: uscita risulta completata con pratiche aperte');
    const stato2 = await t.page.evaluate(id => { const b = [...document.querySelectorAll('#teamlist tr')].find(r => r.innerHTML.indexOf(id) >= 0); return b ? b.innerText : ''; }, uscenteId);
    if (!/Uscita da completare/.test(stato2)) KO('2: la persona non risulta "Uscita da completare": ' + stato2.slice(0, 200)); else righe.push('   disattivata: "Uscita da completare" (non completata), riassegnazione aperta');
    const tipi = await t.page.evaluate(() => document.getElementById('rpr-tipi').innerText);
    if (!/Clienti:\s*8/.test(tipi) || !/Commesse aperte:\s*1/.test(tipi)) KO('2: tipi nella finestra: ' + tipi);

    // 3. sposta a un altro rappresentante
    await t.page.evaluate(id => { document.getElementById('rpr-a').value = id; anteprimaRiassegnaPratiche(); }, rap.id);
    const ant = await t.page.evaluate(() => document.getElementById('rpr-anteprima').innerText);
    if (!/Si spostano 20 pratiche/.test(ant)) KO('3: anteprima: ' + ant); 
    await t.page.screenshot({ path: path.join(CARTELLA_OUT, '1-titolare-riassegna-390.png') });
    await t.page.click('#rpr-sposta');
    await attendiQuiete(t.stato, 2000);
    const reg = psql("select r.totale || '|' || (select count(*) from public.riassegnazioni_pratiche_righe x where x.riassegnazione_id = r.id) || '|' || r.motivo from public.riassegnazioni_pratiche r where da_utente_id = '" + uscenteId + "' order by id desc limit 1");
    if (!/^20\|20\|Uscita di Prova74/.test(reg)) KO('3: registro: ' + reg); else righe.push('3. 20 pratiche spostate a ' + rap.nome + ' ' + rap.cognome + ' in una operazione, registro: ' + reg);
    if (psql("select public.uscita_completata('" + uscenteId + "')") !== 't') KO('3: uscita non completata dopo la riassegnazione');
    const stato3 = await t.page.evaluate(id => { const b = [...document.querySelectorAll('#teamlist tr')].find(r => r.innerHTML.indexOf(id) >= 0); return b ? b.innerText : ''; }, uscenteId);
    if (!/Uscita completata/.test(stato3)) KO('3: Team non dice "Uscita completata": ' + stato3.slice(0, 200)); else righe.push('   Team: "✓ Uscita completata"');
    const regPag = await t.page.evaluate(() => document.getElementById('rpr-registro').innerText);
    if (!/20/.test(regPag) || !/Uscita di Prova74/.test(regPag)) KO('3: registro nella finestra: ' + regPag.slice(0, 200));
    await t.page.evaluate(() => { const b = document.querySelector('#rpr-registro button'); if (b) b.click(); });
    await attendiQuiete(t.stato, 800);
    const righePag = await t.page.evaluate(() => document.querySelectorAll('#rpr-registro li').length);
    if (righePag !== 20) KO('3: "Cosa è stato spostato" mostra ' + righePag + ' righe');
    await t.page.screenshot({ path: path.join(CARTELLA_OUT, '2-titolare-registro-390.png') });
    await chiudi(t);

    // 4. rifiuti dal database (come da console)
    const corpo = { p_da: rap.id, p_a: tit.id, p_tipi: null, p_motivo: 'console' };
    const r1 = await rpcRifiutata(tokenDi(seg), 'riassegna_pratiche', corpo);
    const r2 = await rpcRifiutata(tokenDi(rap), 'riassegna_pratiche', corpo);
    const r3 = await rpcRifiutata(tokenDi(tit), 'riassegna_pratiche', corpo, { 'x-agito-come': seg.id });
    const r4 = await rpcRifiutata(tokenAnon(), 'riassegna_pratiche', corpo);
    [['segreteria', r1], ['rappresentante', r2], ['titolare come segreteria', r3], ['senza login', r4]].forEach(([chi, r]) => {
      if (r.ok) KO('4: ' + chi + ' NON rifiutato: ' + r.testo); else righe.push('4. ' + chi + ' rifiutato dal database: ' + r.status + ' ' + r.testo.slice(0, 90));
    });
    const r5 = await rest('/riassegnazioni_pratiche?select=id', tokenDi(seg));
    if (r5.length) KO('4: la segreteria legge il registro');

    for (const s of sessioni.filter(x => !x.chiuso)) await chiudi(s);
    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(r => r.status >= 500 || /does not exist|Could not find/i.test(r.msg));
      if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
  }
  righe.forEach(r => console.log(r));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
