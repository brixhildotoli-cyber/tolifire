#!/usr/bin/env node
// sql/258 - Sconto del rappresentante sul preventivo (js/69, js/13, js/18).
// Chrome headless con puppeteer-core, SOLO DATABASE LOCALE
// (test/locale/avvia-db-locale.sh, poi sql/258 e il suo -REGISTRO-CANCELLAZIONI).
//  1. il rappresentante, a 390 px, in "I miei preventivi" applica l'1,5% senza
//     motivazione: totale 9.850 €, PDF rifatto con "Sconto 1,5%" (scaricato
//     nella cartella dei risultati, mai nei Download) e caricato in
//     <id>/cliente/;
//  2. 5%: senza motivazione il bottone resta spento, con la motivazione si
//     salva (9.500 € sul totale delle voci) e il PDF nuovo ha "Sconto 5%" e
//     "Imponibile scontato" ma NON la motivazione;
//  3. Acquisti e segreteria dalla console non leggono la motivazione e non
//     scontano; il rappresentante non cambia da console il totale né il PDF
//     per il cliente (correzioni A, B, C del controllo); il titolare la legge nella scheda del preventivo, Acquisti
//     nella scheda vede percentuale e totali ma non la motivazione.
// Con SCONTO_SENZA_SQL=1 (dopo il ROLLBACK di sql/258): nessun riquadro dello
// sconto, nessun errore.
// Alla fine (solo database locale) si tolgono preventivo e progetto di prova.
// Uso: cd test && node sconto-rappresentante.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-sconto-rappresentante');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA sql/258';
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

const MOTIVO = 'Cliente storico: la concorrenza offre 9.400 euro';
const pdfScaricati = () => {
  const d = path.join(CARTELLA_OUT, 'download');
  return fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.pdf$/i.test(f)).map(f => path.join(d, f)) : [];
};
async function attendiPdfNuovo(prima, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const nuovi = pdfScaricati().filter(f => !prima.includes(f) && fs.statSync(f).size > 0);
    if (nuovi.length) { await attendi(400); return nuovi[0]; }
    await attendi(200);
  }
  return null;
}
async function apriMieiPreventivi(s) {
  await s.page.evaluate(async () => { gotoPage('preventivi-rapp'); await loadPreventiviRappresentante(); });
  await attendiQuiete(s.stato, 1200);
}

(async () => {
  fs.mkdirSync(path.join(CARTELLA_OUT, 'download'), { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const SENZA = CONF.SCONTO_SENZA_SQL === '1';
  const c258 = psql("select to_regprocedure('public.applica_sconto_preventivo(uuid,numeric,text)') is not null");
  if (!SENZA && c258 !== 't') fermati('sql/258 non eseguito nel database locale');
  if (SENZA && c258 === 't') fermati('SCONTO_SENZA_SQL=1 ma sql/258 c\'è: eseguire prima il ROLLBACK di sql/258');

  const riga = psql("select c.id || '|' || c.rappresentante_id from public.clienti c join public.utenti u on u.id = c.rappresentante_id and u.ruolo = 'rappresentante' and u.attivo order by c.ragione_sociale limit 1");
  if (!riga) fermati('serve un cliente con un rappresentante attivo');
  const [clienteId, rapId] = riga.split('|');
  const comId = psql("select id from public.utenti where ruolo = 'commerciale' and attivo order by nome, id limit 1");
  const progettoId = psql("insert into public.progetti_tecnici (cliente_id, rappresentante_id, titolo, tipologia, descrizione_tecnica, stato) values (" +
    q(clienteId) + ", " + q(rapId) + ", " + q(ETICHETTA) + ", 'porte_rei', 'Prova dello sconto', 'in_preventivazione') returning id").split('\n')[0];
  const preventivoId = psql("insert into public.preventivi (cliente_id, commerciale_id, progetto_tecnico_id, stato, totale_imponibile, iva_perc, note, inviato_a_rappresentante_il, preventivo_cliente_pdf_path, preventivo_cliente_pdf_nome, preventivo_cliente_pdf_generato_il) values (" +
    q(clienteId) + ", " + q(comId) + ", " + q(progettoId) + ", 'inviato_a_rappresentante', 10000, 22, " + q(ETICHETTA) + ", now() - interval '1 hour', 'x/cliente/vecchio.pdf', 'vecchio.pdf', now() - interval '1 hour') returning id").split('\n')[0];
  psql("insert into public.preventivi_voci (preventivo_id, categoria, descrizione, unita_misura, quantita, costo_unitario, prezzo_unitario, ordinamento) values (" +
    q(preventivoId) + ", 'materiale', 'Porta REI 60 90x210', 'pz', 4, 600, 1000, 1), (" + q(preventivoId) + ", 'manodopera', 'Posa in opera', 'pz', 1, 3000, 6000, 2)");

  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const rap = BACK.perId[rapId];
  const com = BACK.perId[comId];
  const seg = utenti.find(u => u.ruolo === 'segreteria');
  const tit = utenti.find(u => u.ruolo === 'titolare');

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const statoDb = () => psql('select coalesce(sconto_perc, 0) || \'|\' || totale_imponibile from public.preventivi where id = ' + q(preventivoId));
  try {
    const r = await apriSito(browser, url); sessioni.push(r);
    await r.page.setViewport({ width: 390, height: 844 });
    await login(r, rap);
    await apriMieiPreventivi(r);
    const sel = '.sconto-rapp[data-preventivo="' + preventivoId + '"]';

    if (SENZA) {
      const vuoto = await r.page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.innerHTML.trim() : 'manca'; }, sel);
      if (vuoto !== '') KO('senza sql/258 il riquadro dello sconto non deve comparire: ' + vuoto.slice(0, 80));
      else righe.push('Senza sql/258: nessun riquadro dello sconto in "I miei preventivi"');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '0-senza-sql-390.png') });
    } else {
      // 1. 1,5% senza motivazione
      await r.page.waitForSelector(sel + ' button', { timeout: 10000 });
      const testo0 = await r.page.$eval(sel, e => e.textContent);
      if (!/10\.000,00/.test(testo0)) KO('1: il riquadro non mostra il totale 10.000: ' + testo0.replace(/\s+/g, ' '));
      await r.page.click(sel + ' button');
      await r.page.waitForSelector('#m-sconto-rappresentante.on, #m-sconto-rappresentante[style*="flex"], #m-sconto-rappresentante.open', { timeout: 5000 }).catch(() => {});
      await r.page.type('#scr-perc', '1,5');
      const ant1 = await r.page.$eval('#scr-anteprima', e => e.textContent);
      const spento1 = await r.page.$eval('#scr-salva', e => e.disabled);
      if (!/9\.?850,00/.test(ant1) || spento1) KO('1: anteprima 1,5% sbagliata o bottone spento: ' + ant1 + ' ' + spento1);
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '1-sconto-1,5-390.png') });
      let prima = pdfScaricati();
      await r.page.click('#scr-salva');
      await attendiQuiete(r.stato, 2500);
      const pdf1 = await attendiPdfNuovo(prima);
      const db1 = statoDb();
      if (db1 !== '1.5|9850.00' && db1 !== '1.50|9850.00' && db1 !== '1.5|9850') KO('1: nel database ' + db1 + ' (atteso 1,5% e 9.850)');
      const pdfTesto1 = pdf1 ? fs.readFileSync(pdf1, 'latin1') : '';
      if (!pdf1 || !/Sconto 1,5%/.test(pdfTesto1) || !/9\.?850,00/.test(pdfTesto1)) KO('1: PDF rifatto senza "Sconto 1,5%" o 9.850: ' + (pdf1 || 'nessun PDF'));
      const caricato1 = r.stato.caricamenti.find(x => x.includes(preventivoId + '/cliente/'));
      if (!caricato1) KO('1: PDF non caricato in <id>/cliente/: ' + r.stato.caricamenti.join(', '));
      const pdfDb1 = psql('select (preventivo_cliente_pdf_generato_il >= sconto_il)::text || \'|\' || preventivo_cliente_pdf_path from public.preventivi where id = ' + q(preventivoId));
      if (!/^true\|/.test(pdfDb1) || !pdfDb1.includes('/cliente/Preventivo_')) KO('1: PDF non registrato sul preventivo: ' + pdfDb1);
      if (!fallimenti.length) righe.push('1. rappresentante a 390 px: 1,5% senza motivazione → 9.850 € + IVA, PDF rifatto con "Sconto 1,5%" (' + path.basename(pdf1) + ') e registrato');

      // 2. 5%: motivazione obbligatoria
      await apriMieiPreventivi(r);
      await r.page.waitForSelector(sel + ' button', { timeout: 10000 });
      const testo1 = await r.page.$eval(sel, e => e.textContent);
      if (!/1,5%/.test(testo1) || /PDF non ha ancora/.test(testo1)) KO('2: dopo l\'1,5% il riquadro non torna: ' + testo1.replace(/\s+/g, ' '));
      await r.page.click(sel + ' button');
      await attendi(400);
      await r.page.evaluate(() => { ge('scr-perc').value = ''; ge('scr-motivo').value = ''; });
      await r.page.type('#scr-perc', '5');
      const spento2 = await r.page.$eval('#scr-salva', e => e.disabled);
      const etichetta2 = await r.page.$eval('#scr-motivo-etichetta', e => e.textContent);
      if (!spento2 || !/obbligatoria/.test(etichetta2)) KO('2: 5% senza motivazione: bottone non spento o etichetta senza "obbligatoria"');
      await r.page.type('#scr-motivo', MOTIVO);
      const ant2 = await r.page.$eval('#scr-anteprima', e => e.textContent);
      const spento2b = await r.page.$eval('#scr-salva', e => e.disabled);
      if (spento2b || !/9\.?500,00/.test(ant2)) KO('2: con la motivazione il bottone resta spento o anteprima sbagliata: ' + ant2);
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '2-sconto-5-motivazione-390.png') });
      prima = pdfScaricati();
      await r.page.click('#scr-salva');
      await attendiQuiete(r.stato, 2500);
      const pdf2 = await attendiPdfNuovo(prima);
      const db2 = statoDb();
      if (!/^5(\.0+)?\|9500(\.00)?$/.test(db2)) KO('2: nel database ' + db2 + ' (atteso 5% e 9.500)');
      const pdfTesto2 = pdf2 ? fs.readFileSync(pdf2, 'latin1') : '';
      if (!pdf2 || !/Sconto 5%/.test(pdfTesto2) || !/Imponibile scontato/.test(pdfTesto2) || !/9\.?500,00/.test(pdfTesto2)) KO('2: PDF senza "Sconto 5%" / "Imponibile scontato" / 9.500');
      if (/concorrenza/.test(pdfTesto2)) KO('2: la motivazione è nel PDF del cliente');
      const nRighe = psql('select count(*) || \'|\' || count(*) filter (where motivazione = ' + q(MOTIVO) + ') from public.preventivi_sconti where preventivo_id = ' + q(preventivoId));
      if (nRighe !== '2|1') KO('2: storico degli sconti ' + nRighe + ' (atteso 2|1)');
      await apriMieiPreventivi(r);
      const testo2 = await r.page.$eval(sel, e => e.textContent);
      if (!/La tua motivazione/.test(testo2) || !/concorrenza/.test(testo2)) KO('2: il rappresentante non rilegge la sua motivazione');
      await r.page.screenshot({ path: path.join(CARTELLA_OUT, '3-dopo-sconto-390.png') });
      righe.push('2. 5%: bottone spento senza motivazione; con la motivazione 9.500 € (sul totale delle voci), PDF con "Sconto 5%" e "Imponibile scontato", senza la motivazione');

      // 3. Console di Acquisti e segreteria
      for (const u of [com, seg]) {
        const letto = await rest('/preventivi_sconti?select=motivazione&preventivo_id=eq.' + preventivoId, tokenDi(u));
        if (letto.length) KO('3: ' + u.ruolo + ' legge la motivazione dalla console');
        let rifiutato = false;
        try { await rest('/rpc/applica_sconto_preventivo', tokenDi(u), { metodo: 'POST', corpo: { p_preventivo: preventivoId, p_sconto: 10, p_motivazione: 'console' } }); }
        catch (e) { rifiutato = /42501|non consentita/.test(e.message); }
        if (!rifiutato) KO('3: ' + u.ruolo + ' sconta dalla console');
        let diretto = false;
        try { await rest('/preventivi?id=eq.' + preventivoId, tokenDi(u), { metodo: 'PATCH', corpo: { sconto_perc: 30 }, headers: { Prefer: 'return=representation' } }); }
        catch (e) { diretto = true; }
        if (!diretto && statoDb().startsWith('30')) KO('3: ' + u.ruolo + ' cambia sconto_perc con un update diretto');
      }
      // 3b. Console del rappresentante (correzioni A, B, C): il totale e il PDF
      // per il cliente non si cambiano con un update diretto
      for (const [corpo, cosa] of [[{ totale_imponibile: 1000 }, 'totale 1.000'],
                                  [{ preventivo_cliente_pdf_generato_il: new Date(Date.now() + 86400000).toISOString() }, 'PDF collegato a mano']]) {
        let rif = false;
        try { await rest('/preventivi?id=eq.' + preventivoId, tokenDi(rap), { metodo: 'PATCH', corpo, headers: { Prefer: 'return=representation' } }); }
        catch (e) { rif = /42501|non si cambia a mano|non si collega a mano/.test(e.message); }
        if (!rif) KO('3b: il rappresentante dalla console: ' + cosa + ' non rifiutato');
      }
      if (!/^5(\.0+)?\|9500(\.00)?$/.test(statoDb())) KO('3b: dopo le prove del rappresentante ' + statoDb());
      if (!/^5(\.0+)?\|/.test(statoDb())) KO('3: lo sconto è cambiato dopo le prove da console: ' + statoDb());
      righe.push('3. console di Acquisti e segreteria: motivazione illeggibile, sconto rifiutato (RPC e update diretto); rappresentante: totale e PDF a mano rifiutati');

      // 4. Scheda del preventivo: titolare con la motivazione, Acquisti senza
      for (const [u, deve] of [[tit, true], [com, false]]) {
        const s = await apriSito(browser, url); sessioni.push(s);
        await login(s, u);
        await s.page.evaluate(async id => { await openPreventivoDetail(id); }, preventivoId);
        await attendiQuiete(s.stato, 1500);
        const box = await s.page.evaluate(() => (document.getElementById('pvd-sconto') || {}).textContent || '');
        if (!/Sconto 5%/.test(box) || !/10\.000,00/.test(box) || !/9\.?500,00/.test(box)) KO('4: ' + u.ruolo + ': riquadro dello sconto incompleto: ' + box.replace(/\s+/g, ' ').slice(0, 200));
        if (deve !== /concorrenza/.test(box)) KO('4: ' + u.ruolo + (deve ? ' non legge' : ' legge') + ' la motivazione nella scheda');
        await s.page.screenshot({ path: path.join(CARTELLA_OUT, '4-scheda-' + u.ruolo + '.png') });
        await chiudi(s);
      }
      righe.push('4. scheda del preventivo: il titolare legge percentuale, totali e motivazione; Acquisti percentuale e totali, senza motivazione');
    }

    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript (' + s.stato.erroriJs.join(' | ') + ')');
      const rete = s.stato.rete.filter(x => (x.status >= 500 || /does not exist|Could not find/i.test(x.msg)) &&
        !(SENZA && /sconto_rappresentante_attivo/.test(x.dove + x.msg)) && !/elenco_clienti_presidi_tecnico/.test(x.dove));
      if (rete.length) KO('errori del database: ' + rete.map(x => x.metodo + ' ' + x.dove + ' ' + x.status + ' ' + x.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    try {
      psql('delete from public.preventivi where id = ' + q(preventivoId));
      psql('delete from public.progetti_tecnici where id = ' + q(progettoId));
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(x => console.log(x));
  console.log('Schermate e PDF: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
