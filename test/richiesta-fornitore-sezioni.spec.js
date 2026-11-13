#!/usr/bin/env node
// F16.9 PDF della richiesta al fornitore per sezione (js/73 + js/18
// generaRichiestaQuotazionePDF), Chrome headless con puppeteer-core, SOLO
// DATABASE LOCALE (test/locale/avvia-db-locale.sh, container toli-smoke-db).
// Il "fatto quando": un fornitore porte riceve solo le porte, senza note
// interne, con la scadenza.
//  1. Acquisti (a 390 px) e titolare aprono un preventivo con 2 schede porte
//     REI (la 2 indicativa) ed estintori, con posizioni P-xx sulla prima:
//     nel riquadro del fornitore "📑 Schede da mandare a questo fornitore" con
//     3 spunte tutte attive e "Rispondere entro il";
//  2. tolta la spunta degli estintori e messa la data, "📄 Genera PDF
//     richiesta" scarica un PDF con le due schede porte, la tabella delle
//     posizioni (P-01, P-02, misure), "Rispondere entro il: <data>",
//     "PREZZO INDICATIVO", "Condizioni della richiesta"; SENZA estintori, note
//     tecniche dell'ingegnere, note per il calcolo, posizione tolta;
//  3. le spunte restano dopo "Salva dati fornitore" (stessa pagina);
//  4. con tutte le spunte (come prima) ci sono anche gli estintori.
// Alla fine si tolgono schede, posizioni e fornitore di prova; le regole di
// smistamento tornano come erano.
// Uso: cd test && node richiesta-fornitore-sezioni.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.RQ_SEZIONI_DOWNLOAD || CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-richiesta-sezioni');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA RICHIESTA SEZIONI';
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


const SCHEDE = [
  { famiglia: 'porte_rei', numero: 1, dati: { nome_scheda: 'Piano terra', tipo_richiesta: 'definitiva', tipo_intervento: 'fornitura_e_posa', rei: 'rei_60',
    tipologia: 'battente_singolo', quantita: 2, larghezza: 90, altezza: 210, colore: 'RAL 9010', note_tecniche: 'NOTAINTERNA-PORTE1', note_calcolo: 'NOTACALCOLO-X' } },
  { famiglia: 'porte_rei', numero: 2, dati: { nome_scheda: 'Piano primo', tipo_richiesta: 'indicativa', tipo_intervento: 'fornitura_e_posa', rei: 'rei_120',
    tipologia: 'battente_singolo', quantita: 1, larghezza: 100, altezza: 215, note_tecniche: 'NOTAINTERNA-PORTE2' } },
  { famiglia: 'estintori', numero: 1, dati: { tipo_intervento: 'fornitura', numero_installare: 5, tipologia: 'polvere', capacita: '6_kg', note_tecniche: 'NOTAINTERNA-ESTINTORI' } }
];
const ENTRO = '2026-12-04', ENTRO_IT = '04/12/2026';
const ATTESI = ['RICHIESTA QUOTAZIONE', 'scheda 1 (Piano terra)', 'scheda 2 (Piano primo)', 'REI 60', 'REI 120', 'Posizioni (2)', 'P-01', 'P-02',
  'Corridoio nord', 'Uscita magazzino', '90 × 210 cm', 'Rispondere entro il: ' + ENTRO_IT, 'PREZZO INDICATIVO', '(prezzo indicativo)', 'Condizioni della richiesta',
  'Inviare l', ENTRO_IT];
const VIETATI = ['NOTAINTERNA', 'NOTACALCOLO', 'TOLTA-POSIZIONE', 'Estintori', 'Polvere'];

async function apriFornitori(s, preventivoId) {
  await s.page.evaluate(async id => { await openPreventivoDetail(id); }, preventivoId);
  await attendiQuiete(s.stato, 1200);
  await s.page.evaluate(() => { const t = [...document.querySelectorAll('#pg-preventivo-detail .tab')].find(x => /Fornitori/.test(x.textContent)); if (t) t.click(); });
  await attendiQuiete(s.stato, 800);
}
function attendiDownload(cartella, prima, ms) {
  return new Promise((ok, ko) => {
    const t0 = Date.now();
    const giro = () => {
      const nuovi = fs.readdirSync(cartella).filter(f => f.endsWith('.pdf') && !prima.includes(f));
      if (nuovi.length) return setTimeout(() => ok(nuovi[0]), 400);
      if (Date.now() - t0 > ms) return ko(new Error('nessun PDF scaricato'));
      setTimeout(giro, 200);
    };
    giro();
  });
}
async function generaPdf(s, cartella, sel) {
  fs.readdirSync(cartella).filter(f => f.endsWith('.pdf')).forEach(f => fs.unlinkSync(path.join(cartella, f)));
  const prima = fs.readdirSync(cartella);
  await s.page.evaluate(id => { document.querySelector('button[onclick="generaRichiestaQuotazionePDF(\'' + id + '\')"]').click(); }, sel);
  const nome = await attendiDownload(cartella, prima, 25000);
  await attendiQuiete(s.stato, 800);
  return { nome, testo: fs.readFileSync(path.join(cartella, nome)).toString('latin1').replace(/\\/g, '') };
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const DOWNLOAD = path.join(CARTELLA_OUT, 'download');
  fs.mkdirSync(DOWNLOAD, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  if (psql("select to_regclass('public.progetti_tecnici_posizioni') is not null") !== 't') fermati('sql/76 (posizioni) non eseguito nel database locale');
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const tit = primo('titolare'), com = primo('commerciale');
  if (!tit || !com) fermati('servono titolare e Acquisti attivi');

  // Un preventivo con progetto in preventivazione senza schede, senza fornitori, del commerciale di prova
  const candidati = psql("select pr.id || '|' || pr.numero || '|' || pr.progetto_tecnico_id from public.preventivi pr " +
    "where pr.progetto_tecnico_id is not null and pr.stato = 'bozza' and not exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = pr.progetto_tecnico_id) " +
    "and not exists (select 1 from public.progetti_tecnici_posizioni p where p.progetto_tecnico_id = pr.progetto_tecnico_id) " +
    "and not exists (select 1 from public.preventivi_fornitori f where f.preventivo_id = pr.id) " +
    "and exists (select 1 from public.progetti_tecnici pt where pt.id = pr.progetto_tecnico_id and pt.stato = 'in_preventivazione') order by pr.creato_il desc limit 40")
    .split('\n').filter(Boolean).map(r => { const x = r.split('|'); return { id: x[0], numero: x[1], progetto: x[2] }; });
  // Acquisti vede i fornitori solo dei preventivi che ha creato lui (policy di
  // preventivi_fornitori): il preventivo si intesta ad Acquisti di prova e alla fine torna com'era
  const prev = candidati[0] || null;
  let commercialePrima = null;
  if (prev) {
    commercialePrima = psql('select coalesce(commerciale_id::text, \'\') from public.preventivi where id = ' + q(prev.id));
    psql('update public.preventivi set commerciale_id = ' + q(com.id) + ' where id = ' + q(prev.id));
  }
  if (!prev) fermati('serve un preventivo in bozza con progetto in preventivazione senza schede, letto da Acquisti');
  const fornitore = psql('select id from public.fornitori order by ragione_sociale limit 1');
  if (!fornitore) fermati('serve un fornitore in anagrafica');

  const regolePrima = psql("select coalesce(string_agg(id || ':' || attiva, ',' order by id), '') from public.regole_smistamento");
  psql('update public.regole_smistamento set attiva = false where attiva');
  const inizio = psql('select now()');
  const ids = {};
  for (const sc of SCHEDE) {
    ids[sc.famiglia + sc.numero] = psql("insert into public.progetti_tecnici_schede (progetto_tecnico_id, famiglia, numero, dati, stato) values (" + q(prev.progetto) + ", " + q(sc.famiglia) + ", " + sc.numero + ", " + q(JSON.stringify(sc.dati)) + "::jsonb, 'bozza') returning id").split('\n')[0];
  }
  const posizione = (ubic, qta, dati) => psql("insert into public.progetti_tecnici_posizioni (progetto_tecnico_id, scheda_id, numero, ubicazione, quantita, dati) values (" + q(prev.progetto) + ", " + q(ids.porte_rei1) + ", 1, " + q(ubic) + ", " + qta + ", " + q(JSON.stringify(dati)) + "::jsonb) returning codice").split('\n')[0];
  posizione('Corridoio nord', 2, { larghezza: 90, altezza: 210 });
  posizione('Uscita magazzino', 1, { larghezza: 120, altezza: 215 });
  posizione('TOLTA-POSIZIONE', 1, { larghezza: 80, altezza: 200 });
  psql("update public.progetti_tecnici_posizioni set tolta = true where progetto_tecnico_id = " + q(prev.progetto) + " and ubicazione = 'TOLTA-POSIZIONE'");
  const sel = psql("insert into public.preventivi_fornitori (preventivo_id, fornitore_id, tipologia) values (" + q(prev.id) + ", " + q(fornitore) + ", 'Porte REI') returning id").split('\n')[0];
  righe.push('preparato: preventivo n. ' + prev.numero + ' con 2 schede porte REI (la 2 indicativa), estintori, posizioni P-01, P-02 e una tolta, un fornitore');

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    for (const [u, largo] of [[com, 390], [tit, 1280]]) {
      const s = await apriSito(browser, url); sessioni.push(s);
      await s.page.setViewport({ width: largo, height: 900 });
      const cdp = await s.page.target().createCDPSession();
      await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD });
      await login(s, u);
      await apriFornitori(s, prev.id);
      await s.page.waitForSelector('[data-rq-sezioni="' + sel + '"]', { timeout: 15000 }).catch(() => {});
      const riq = await s.page.evaluate(id => {
        const box = document.querySelector('[data-rq-sezioni="' + id + '"]');
        if (!box) return null;
        return { caselle: [...box.querySelectorAll('[data-rq-scheda]')].map(c => ({ v: c.value, on: c.checked, t: c.closest('label').innerText.trim() })), data: !!document.getElementById('rq-entro-' + id) };
      }, sel);
      if (!riq) { KO(u.ruolo + ': niente riquadro "Schede da mandare a questo fornitore"'); await chiudi(s); continue; }
      if (riq.caselle.length !== 3 || riq.caselle.some(c => !c.on) || !riq.data) KO(u.ruolo + ': riquadro ' + JSON.stringify(riq));
      else righe.push(u.ruolo + ' (' + largo + ' px): riquadro con 3 schede spuntate (' + riq.caselle.map(c => c.t).join(' / ') + ') e "Rispondere entro il"');
      // 2. tolgo gli estintori, metto la data, genero
      await s.page.evaluate((id, est, entro) => {
        const c = document.querySelector('[data-rq-scheda="' + id + '"][value="' + est + '"]'); c.checked = false; c.dispatchEvent(new Event('change'));
        const d = document.getElementById('rq-entro-' + id); d.value = entro; d.dispatchEvent(new Event('change'));
      }, sel, ids.estintori1, ENTRO);
      await s.page.screenshot({ path: path.join(CARTELLA_OUT, u.ruolo + '-riquadro.png'), fullPage: false });
      let pdf;
      try { pdf = await generaPdf(s, DOWNLOAD, sel); } catch (e) { KO(u.ruolo + ': ' + e.message); await chiudi(s); continue; }
      const mancano = ATTESI.filter(x => !pdf.testo.includes(x));
      const intrusi = VIETATI.filter(x => pdf.testo.includes(x));
      if (mancano.length || intrusi.length) {
        KO(u.ruolo + ': PDF ' + pdf.nome + (mancano.length ? ' mancano: ' + mancano.join(' | ') : '') + (intrusi.length ? ' NON dovrebbe avere: ' + intrusi.join(' | ') : ''));
        fs.writeFileSync(path.join(CARTELLA_OUT, u.ruolo + '-pdf.txt'), pdf.testo, 'latin1');
      } else righe.push(u.ruolo + ': ' + pdf.nome + ' solo porte (2 schede + P-01/P-02), entro il ' + ENTRO_IT + ', PREZZO INDICATIVO, condizioni; niente estintori, note interne, posizione tolta');
      // 3. le spunte restano dopo "Salva dati fornitore" (ricarica il riquadro)
      await s.page.evaluate(id => { document.querySelector('button[onclick="salvaDettagliFornitorePreventivo(\'' + id + '\')"]').click(); }, sel);
      await attendiQuiete(s.stato, 1500);
      const dopo = await s.page.evaluate((id, est) => {
        const c = document.querySelector('[data-rq-scheda="' + id + '"][value="' + est + '"]');
        return { est: c ? c.checked : null, entro: (document.getElementById('rq-entro-' + id) || {}).value };
      }, sel, ids.estintori1);
      if (dopo.est !== false || dopo.entro !== ENTRO) KO(u.ruolo + ': dopo Salva le scelte non restano ' + JSON.stringify(dopo));
      else righe.push(u.ruolo + ': dopo "Salva dati fornitore" estintori ancora tolti e data ancora ' + ENTRO_IT);
      // 4. di nuovo tutte spuntate: anche gli estintori (come prima)
      await s.page.evaluate((id, est) => { const c = document.querySelector('[data-rq-scheda="' + id + '"][value="' + est + '"]'); c.checked = true; c.dispatchEvent(new Event('change')); }, sel, ids.estintori1);
      const tutto = await generaPdf(s, DOWNLOAD, sel);
      if (!tutto.testo.includes('Estintori') || tutto.testo.includes('NOTAINTERNA')) KO(u.ruolo + ': con tutte le spunte: estintori ' + tutto.testo.includes('Estintori') + ', note interne ' + tutto.testo.includes('NOTAINTERNA'));
      else righe.push(u.ruolo + ': con tutte le spunte ci sono anche gli estintori, sempre senza note interne');
      await chiudi(s);
    }
    for (const s of sessioni) {
      if (s.stato.erroriJs.length) KO('errori JavaScript: ' + s.stato.erroriJs.join(' | '));
      const rete = s.stato.rete.filter(r => !/sconto_rappresentante_attivo|_attiv[oi]$|_attive$/.test(r.dove) && (r.status >= 500 || /does not exist|Could not find/i.test(r.msg)));
      if (rete.length) KO('errori del database: ' + rete.map(r => r.metodo + ' ' + r.dove + ' ' + r.status + ' ' + r.msg).join(' | '));
    }
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const s of sessioni) { try { if (!s.chiuso) await s.contesto.close(); } catch (e) { /* già chiuso */ } }
    await browser.close();
    srv.close();
    try {
      psql("delete from public.preventivi_fornitori where id = " + q(sel));
      psql('update public.preventivi set commerciale_id = ' + (commercialePrima ? q(commercialePrima) : 'null') + ' where id = ' + q(prev.id));
      psql("delete from public.progetti_tecnici_posizioni where progetto_tecnico_id = " + q(prev.progetto) + " and creata_il >= " + q(inizio));
      psql("delete from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(prev.progetto) + " and creato_il >= " + q(inizio));
    } catch (e) { console.error('pulizia: ' + e.message); }
    try {
      regolePrima.split(',').filter(Boolean).forEach(x => { const [id, a] = x.split(':'); psql('update public.regole_smistamento set attiva = ' + (a === 't' ? 'true' : 'false') + ' where id = ' + Number(id) + ' and attiva is distinct from ' + (a === 't')); });
    } catch (e) { console.error('pulizia regole: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Download e schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
