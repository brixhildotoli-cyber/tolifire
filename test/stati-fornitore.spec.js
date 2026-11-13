#!/usr/bin/env node
// F16.11 ridotta (sql/100 + js/18): stati del fornitore con controlli.
// Chrome headless con puppeteer-core, SOLO DATABASE LOCALE.
// Il "fatto quando": non si segna «Risposta ricevuta» senza prezzo e PDF.
//  1. Acquisti (390 px) sul riquadro del fornitore: menu con "Il fornitore
//     non quota" e "Offerta scaduta" (solo con il -VINCOLO);
//  2. «Risposta ricevuta» senza prezzo: messaggio e stato invariato;
//  3. con il prezzo ma senza PDF: messaggio e stato invariato;
//  4. console di Acquisti e del titolare "come" Acquisti: rifiuto del database (solo con sql/100);
//  5. PDF caricato SENZA prezzo salvato: lo stato non cambia da solo;
//  6. prezzo salvato + PDF: «Risposta ricevuta» si salva;
//  7. "Il fornitore non quota": salvato, la riga resta nell'elenco.
// Con STATI_SENZA_SQL=1 (dopo il ROLLBACK di sql/100): niente stati nuovi nel
// menu, i punti 2, 3, 5, 6 uguali (controllo del sito), niente 4 e 7.
// Uso: cd test && node stati-fornitore.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.STATI_FORNITORE_DOWNLOAD || CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-stati-fornitore');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA STATI FORNITORE';
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
const q = s => "'" + String(s).replace(/'/g, "''") + "'";



const SENZA_SQL = CONF.STATI_SENZA_SQL === '1';
const statoDb = id => psql('select stato from public.preventivi_fornitori where id = ' + q(id));
async function apriFornitori(s, preventivoId) {
  await s.page.evaluate(async id => { await openPreventivoDetail(id); }, preventivoId);
  await attendiQuiete(s.stato, 1200);
  await s.page.evaluate(() => { const t = [...document.querySelectorAll('#pg-preventivo-detail .tab')].find(x => /Fornitori/.test(x.textContent)); if (t) t.click(); });
  await attendiQuiete(s.stato, 800);
}
async function salva(s, sel, stato, prezzo) {
  await s.page.evaluate((id, st, pr) => {
    document.getElementById('toast').textContent = '';
    document.getElementById('pvf-stato-' + id).value = st;
    if (pr !== null) document.getElementById('pvf-prezzo-' + id).value = pr;
    document.querySelector('button[onclick="salvaDettagliFornitorePreventivo(\'' + id + '\')"]').click();
  }, sel, stato, prezzo);
  await attendiQuiete(s.stato, 1200);
  return s.page.evaluate(() => document.getElementById('toast').textContent);
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const conSql = psql("select to_regprocedure('public.stati_fornitore_controlli()') is not null") === 't';
  if (!SENZA_SQL && !conSql) fermati('sql/100 non eseguito nel database locale (o usa STATI_SENZA_SQL=1)');
  if (SENZA_SQL && conSql) fermati('STATI_SENZA_SQL=1 ma sql/100 è nel database locale: esegui prima il ROLLBACK');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const tit = primo('titolare'), com = primo('commerciale');
  if (!tit || !com) fermati('servono titolare e Acquisti attivi');
  const prev = psql("select id from public.preventivi where stato = 'bozza' and not exists (select 1 from public.preventivi_fornitori f where f.preventivo_id = preventivi.id) order by creato_il desc limit 1");
  if (!prev) fermati('serve un preventivo in bozza senza fornitori');
  const commercialePrima = psql('select coalesce(commerciale_id::text, \'\') from public.preventivi where id = ' + q(prev));
  psql('update public.preventivi set commerciale_id = ' + q(com.id) + ' where id = ' + q(prev));
  // Database locale: l'utente di prova non è in auth.users (in produzione sì) e la riga del PDF
  // (caricato_da -> auth.users) non entrerebbe: si aggiunge e resta (solo locale)
  const authAggiunto = psql('select count(*) from auth.users where id = ' + q(com.id)) === '0';
  if (authAggiunto) psql('insert into auth.users (id, email) values (' + q(com.id) + ', ' + q(com.email) + ')');
  const fornitore = psql('select id from public.fornitori order by ragione_sociale limit 1');
  const sel = psql("insert into public.preventivi_fornitori (preventivo_id, fornitore_id, tipologia) values (" + q(prev) + ", " + q(fornitore) + ", 'Porte REI') returning id").split('\n')[0];
  const pdfProva = path.join(CARTELLA_OUT, 'offerta-prova.pdf');
  fs.writeFileSync(pdfProva, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  let s;
  try {
    s = await apriSito(browser, url);
    await s.page.setViewport({ width: 390, height: 900 });
    await login(s, com);
    await apriFornitori(s, prev);
    await s.page.waitForSelector('#pvf-stato-' + sel, { timeout: 15000 });
    // 1. menu
    const voci = await s.page.evaluate(id => [...document.getElementById('pvf-stato-' + id).options].map(o => o.value), sel);
    const nuovi = voci.includes('rifiutata') && voci.includes('scaduta');
    if (nuovi === SENZA_SQL) KO('menu degli stati: ' + voci.join(', '));
    else righe.push('menu: ' + voci.join(', '));
    // 2. senza prezzo
    let msg = await salva(s, sel, 'risposta_ricevuta', '');
    if (!/scrivi il prezzo/.test(msg) || statoDb(sel) !== 'da_contattare') KO('senza prezzo: «' + msg + '» stato ' + statoDb(sel));
    else righe.push('«Risposta ricevuta» senza prezzo: «' + msg + '», stato invariato');
    // 3. prezzo senza PDF
    msg = await salva(s, sel, 'risposta_ricevuta', '1250');
    if (!/carica il PDF/.test(msg) || statoDb(sel) !== 'da_contattare') KO('senza PDF: «' + msg + '» stato ' + statoDb(sel));
    else righe.push('con il prezzo ma senza PDF: «' + msg + '», stato invariato');
    // 4. console
    if (!SENZA_SQL) {
      for (const [chi, come] of [[com, null], [tit, com.id]]) {
        const r = await s.page.evaluate(async (id, comeId) => {
          const h = { apikey: SK, Authorization: 'Bearer ' + (await db.auth.getSession()).data.session.access_token, 'Content-Type': 'application/json', Prefer: 'return=representation' };
          if (comeId) h['x-agito-come'] = comeId;
          const r = await fetch(SU + '/rest/v1/preventivi_fornitori?id=eq.' + id, { method: 'PATCH', headers: h, body: JSON.stringify({ stato: 'risposta_ricevuta', prezzo_offerto: 1250 }) });
          return r.status + ' ' + (await r.text()).slice(0, 160);
        }, sel, come);
        if (chi === tit) { /* il titolare entra con la sessione di Acquisti in questa pagina: la prova "come" è nella PROVA SQL */ }
        if (!/22023|PDF/.test(r)) KO('console ' + (come ? 'titolare come Acquisti' : 'Acquisti') + ': ' + r);
        else righe.push('console ' + (come ? '(con x-agito-come)' : 'di Acquisti') + ': rifiutata (' + r.slice(0, 90) + '...)');
        break; // una sola prova da console in questa sessione (Acquisti)
      }
    }
    // 5. PDF senza prezzo salvato
    psql('update public.preventivi_fornitori set prezzo_offerto = null where id = ' + q(sel));
    await apriFornitori(s, prev);
    const caricaPdf = async () => {
      const input = await s.page.$('#pvf-file-ricevuto-' + sel);
      await input.uploadFile(pdfProva);
      await s.page.evaluate(id => { document.getElementById('toast').textContent = ''; return caricaPreventivoRicevutoFornitore(id); }, sel);
      await attendiQuiete(s.stato, 1200);
      return s.page.evaluate(() => document.getElementById('toast').textContent);
    };
    msg = await caricaPdf();
    if (statoDb(sel) !== 'da_contattare' || !/scrivi il prezzo/.test(msg)) KO('PDF senza prezzo: «' + msg + '» stato ' + statoDb(sel));
    else righe.push('PDF caricato senza prezzo: «' + msg + '», stato invariato');
    // 6. prezzo + PDF
    msg = await salva(s, sel, 'risposta_ricevuta', '1250');
    if (statoDb(sel) !== 'risposta_ricevuta') KO('prezzo e PDF: «' + msg + '» stato ' + statoDb(sel));
    else righe.push('prezzo 1250 e PDF: «Risposta ricevuta» salvata');
    await s.page.screenshot({ path: path.join(CARTELLA_OUT, 'acquisti-390.png'), fullPage: false });
    // 7. il fornitore non quota
    if (!SENZA_SQL) {
      msg = await salva(s, sel, 'rifiutata', null);
      const vede = await s.page.evaluate(id => !!document.getElementById('pvf-stato-' + id) && document.getElementById('pvf-stato-' + id).value, sel);
      if (statoDb(sel) !== 'rifiutata' || vede !== 'rifiutata') KO('non quota: stato ' + statoDb(sel) + ', nel riquadro ' + vede);
      else righe.push('"Il fornitore non quota": salvato e la riga resta nell\'elenco');
    }
    if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
    const rete = s.stato.rete.filter(r => !/sconto_rappresentante_attivo|_attiv[oie]$|stati_fornitore_controlli/.test(r.dove) && !/preventivi_fornitori\?id=eq/.test(r.dove) && (r.status >= 500 || /does not exist|Could not find/i.test(r.msg)));
    if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    try { if (s) await s.contesto.close(); } catch (e) { /* chiuso */ }
    await browser.close();
    srv.close();
    try {
      psql('delete from public.preventivi_fornitori_allegati where preventivo_fornitore_id = ' + q(sel));
      psql('delete from public.preventivi_fornitori where id = ' + q(sel));
      psql('update public.preventivi set commerciale_id = ' + (commercialePrima ? q(commercialePrima) : 'null') + ' where id = ' + q(prev));
      // l'utente aggiunto in auth.users resta (solo database locale): toglierlo cancellerebbe a catena la riga di utenti
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK' + (SENZA_SQL ? ' (senza sql/100)' : ''));
})();
