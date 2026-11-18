#!/usr/bin/env node
// RETE DI SICUREZZA PER IL RIORDINO DEI PRESIDI (Erika, 18/11): prova "a fotografia".
// Esegue gli scenari dei presidi con un cliente di prova (import di estintori, manichette, naspi, porte;
// reimport; scheda del presidio; modifica e salvataggio; vista cartelle, tabella e scadenze; nuovo
// controllo) e confronta il risultato con test/fotografie/presidi.json. La data del browser è fissa
// (18/11/2026), id e orari sono tolti: la fotografia cambia solo se cambia il comportamento.
// SOLO DATABASE LOCALE. Uso: cd test && node presidi-fotografia.spec.js
//   FOTOGRAFIA=nuova node presidi-fotografia.spec.js   → rifà la fotografia (solo con il codice di riferimento)
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
// Data del browser fissa al 18/11/2026 (il tempo scorre da lì): fotografia uguale ogni giorno
const DATA_FISSA_JS = `(() => { const D = Date, fisso = D.parse('2026-11-18T10:00:00'), avvio = D.now();
  class DF extends D { constructor(...a) { if (a.length) super(...a); else super(fisso + (D.now() - avvio)); } static now() { return fisso + (D.now() - avvio); } }
  window.Date = DF; })();`;
const CHROME = CONF.SMOKE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CARTELLA_OUT = CONF.PROM_DOWNLOAD || CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-presidi-fotografia');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA PROM';
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
  await page.evaluateOnNewDocument(DATA_FISSA_JS);
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





async function sessioneCome(browser, url, u, largo) {
  const s = await apriSito(browser, url);
  await s.page.setViewport({ width: largo, height: 900 });
  await login(s, u);
  return s;
}

const FOTO = path.join(TEST, 'fotografie', 'presidi.json');
const CLIENTE = 'RIORDINO PRESIDI PROVA SRL';
function pulisci() {
  const cli = psql("select string_agg(id::text, ',') from public.clienti where ragione_sociale = " + q(CLIENTE));
  if (!cli) return;
  const lista = cli.split(',').map(q).join(',');
  psql("delete from public.ordini_lavoro where cliente_id in (" + lista + ")");
  psql("delete from public.schede_manichette where impianto_id in (select id from public.impianti where cliente_id in (" + lista + "))");
  psql("delete from public.schede_presidi where impianto_id in (select id from public.impianti where cliente_id in (" + lista + "))");
  psql("update public.impianti set sostituito_da = null where sostituito_da in (select id from public.impianti where cliente_id in (" + lista + "))");
  psql("delete from public.impianti where cliente_id in (" + lista + ")");
  psql("delete from public.sedi_cliente where cliente_id in (" + lista + ")");
  psql("delete from public.clienti where id in (" + lista + ")");
}
// Toglie id, orari e numeri che cambiano a ogni giro
function norm(x) {
  return JSON.parse(JSON.stringify(x, (k, v) => {
    if (/^(id|impianto_id|cliente_id|sede_id|creato_da|aggiornato_da|eliminato_da|registrato_da|eseguito_da|tecnico_id|sostituito_da|odl_id|origine_id|token|chiave_import)$/.test(k)) return v == null ? v : '<id>';
    if (/(_il|_at)$/.test(k) && v) return '<ora>';
    if (typeof v === 'string') return v.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>').replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*(Z|[+-]\d{2}:?\d{2})?/g, '<ora>').replace(/\s+/g, ' ').trim();
    return v;
  }));
}
function righeDb() {
  const cli = q(psql("select id from public.clienti where ragione_sociale = " + q(CLIENTE)));
  const imp = psql("select coalesce(json_agg(to_jsonb(i) order by i.tipo, i.matricola, i.numero_progressivo), '[]') from public.impianti i where i.cliente_id = " + cli);
  const sp = psql("select coalesce(json_agg(to_jsonb(s) - 'dati' || jsonb_build_object('matricola', i.matricola, 'n_dati', (select count(*) from jsonb_object_keys(coalesce(s.dati, '{}'::jsonb)))) order by i.matricola, s.anno, s.mese), '[]') from public.schede_presidi s join public.impianti i on i.id = s.impianto_id where i.cliente_id = " + cli);
  const sm = psql("select coalesce(json_agg(to_jsonb(s) || jsonb_build_object('matricola', i.matricola) order by i.matricola, s.data_intervento), '[]') from public.schede_manichette s join public.impianti i on i.id = s.impianto_id where i.cliente_id = " + cli);
  return norm({ impianti: JSON.parse(imp), schede_presidi: JSON.parse(sp), schede_manichette: JSON.parse(sm) });
}

const CSV = {
  estintore: 'cliente;tipo;matricola;numero_progressivo;ubicazione;marca;modello;data_verifica;stato;anno_pross_ric;anno_scadenza_collaudo;manutenzione_mese;note\n' +
    CLIENTE + ';estintore;EST-001;1;Ingresso;Bettati;P6;2026-03-10;ok;;;;\n' +
    CLIENTE + ';estintore;EST-002;2;Magazzino;Bettati;CO2 5;2026-03-10;anomalia;;;;manometro basso\n' +
    CLIENTE + ';estintore;EST-003;3;Ufficio;Pastorelli;P9;;;2028;2031;marzo;anagrafica\n' +
    CLIENTE + ';estintore;;4;Scala;;;;;;;;matricola mancante\n',
  manichetta: 'cliente;tipo;matricola;numero_progressivo;ubicazione;anno_scadenza;stato_documento;data_verifica;stato\n' +
    CLIENTE + ';manichetta;MAN-001;1;Corridoio;2031;Collaudata;2026-03-12;ok\n' +
    CLIENTE + ';manichetta;MAN-002;2;Cortile;20X1;;2026-03-12;ok\n',
  naspo: 'cliente;tipo;matricola;numero_progressivo;ubicazione;anno_scadenza;data_verifica;stato\n' +
    CLIENTE + ';naspo;NAS-001;1;Piano terra;2030;2026-03-15;ok\n' +
    CLIENTE + ';naspo;NAS-002;2;Primo piano;;;\n',
  porte: 'cliente;tipo;matricola;numero_progressivo;ubicazione;data_verifica;stato;periodicita_mesi\n' +
    CLIENTE + ';porta_rei;REI-001;1;Locale tecnico;2026-04-01;ok;6\n' +
    CLIENTE + ';uscita_emergenza;USC-001;2;Uscita nord;2026-04-01;anomalia;6\n'
};

async function importa(s, tipo, ciclo, testo, conferma) {
  await s.page.evaluate(() => apriImportPresidi());
  await attendiQuiete(s.stato, 800);
  const cli = psql("select id from public.clienti where ragione_sociale = " + q(CLIENTE));
  const sede = psql("select id from public.sedi_cliente where cliente_id = " + q(cli) + " order by nome limit 1");
  await s.page.evaluate(async (cli, sede, tipo, ciclo) => {
    const c = ge('import-presidi-cliente'); c.value = cli; c.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 600));
    const sd = ge('import-presidi-sede'); sd.value = sede; sd.dispatchEvent(new Event('change'));
    const t = ge('import-presidi-tipo'); t.value = tipo; t.dispatchEvent(new Event('change'));
    ge('import-presidi-anno').value = '2026'; ge('import-presidi-anno').dispatchEvent(new Event('change'));
    ge('import-presidi-ciclo').value = ciclo; ge('import-presidi-ciclo').dispatchEvent(new Event('change'));
  }, cli, sede, tipo, ciclo);
  await attendiQuiete(s.stato, 500);
  await s.page.evaluate(async testo => {
    await leggiFileImportPresidi({ files: [new File([testo], 'prova.csv', { type: 'text/csv' })], value: '' });
  }, testo);
  await attendiQuiete(s.stato, 800);
  const anteprima = await s.page.evaluate(() => ({
    riepilogo: ge('import-presidi-riepilogo').textContent,
    conferma: !ge('import-presidi-conferma').disabled,
    righe: righeImportPresidi.map(r => ({ riga: r.numeroRiga, valido: r.valido, azione: r.azione, messaggio: r.messaggio, payload: r.payload || null }))
  }));
  if (conferma) {
    await s.page.evaluate(async () => { await confermaImportPresidi(); });
    await attendiQuiete(s.stato, 1500);
  }
  await s.page.evaluate(() => closeM('m-import-presidi'));
  return norm(anteprima);
}
async function testoDi(s, sel) {
  return norm(await s.page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent : null; }, sel));
}
function confronta(a, b, via, diff) {
  if (diff.length > 40) return;
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) === !Array.isArray(b)) {
    const chiavi = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of chiavi) confronta(a[k], b[k], via + (Array.isArray(a) ? '[' + k + ']' : '.' + k), diff);
    return;
  }
  diff.push(via + ': prima ' + JSON.stringify(a).slice(0, 160) + ' / ora ' + JSON.stringify(b).slice(0, 160));
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  pulisci();
  const cliId = psql("insert into public.clienti (ragione_sociale, stato) values (" + q(CLIENTE) + ", 'attivo') returning id").split('\n')[0];
  psql("insert into public.sedi_cliente (cliente_id, nome, tipo, via, citta) values (" + q(cliId) + ", 'Sede prova', 'operativa', 'Via Prova 1', 'Pisa')");
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const tit = utenti.find(u => u.ruolo === 'titolare'), tec = utenti.find(u => u.ruolo === 'tecnico');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 120000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  const foto = {};
  try {
    const s = await sessioneCome(browser, url, tit, 1280); sessioni.push(s);
    await s.page.evaluate(() => gotoPage('presidi'));
    await attendiQuiete(s.stato, 1500);
    // 1. import
    foto.import_estintori = await importa(s, 'estintore', 'gennaio_luglio', CSV.estintore, true);
    foto.import_manichette = await importa(s, 'manichetta', 'gennaio_luglio', CSV.manichetta, true);
    foto.import_naspi = await importa(s, 'naspo', 'febbraio_agosto', CSV.naspo, true);
    foto.import_porte = await importa(s, 'porte', 'febbraio_agosto', CSV.porte, true);
    foto.db_dopo_import = righeDb();
    foto.reimport_estintori = await importa(s, 'estintore', 'gennaio_luglio', CSV.estintore, false);
    foto.import_tipo_sbagliato = await importa(s, 'naspo', 'gennaio_luglio', CSV.estintore, false);
    righe.push('import: estintori, manichette, naspi, porte, reimport e tipo sbagliato');
    // 2. viste della pagina
    await s.page.evaluate(nome => { gotoPage('presidi'); }, CLIENTE);
    await attendiQuiete(s.stato, 1500);
    await s.page.evaluate(nome => { ge('psearch').value = nome; filterP(); }, CLIENTE);
    await attendiQuiete(s.stato, 1500);
    foto.vista_cartelle = await testoDi(s, '#pcards');
    foto.vista_tabella = await testoDi(s, '#tc-pt');
    foto.vista_scadenze = await testoDi(s, '#tc-ps');
    righe.push('viste: cartelle, tabella, scadenze');
    // 3. schede dei presidi
    const ids = psql("select string_agg(id::text || ':' || matricola, ',' order by matricola) from public.impianti where cliente_id = " + q(cliId) + " and matricola in ('EST-001','MAN-001','NAS-002','REI-001')").split(',');
    foto.schede = {};
    for (const x of ids) {
      const [id, mat] = x.split(':');
      await s.page.evaluate(async id => { await apriSchedaPresidio(id); }, id);
      await attendiQuiete(s.stato, 1200);
      foto.schede[mat] = await testoDi(s, '#msp-contenuto');
      await s.page.evaluate(() => closeM('m-scheda-presidio'));
    }
    righe.push('schede: ' + Object.keys(foto.schede).join(', '));
    // 4. modifica e salvataggio (estintore e manichetta)
    foto.modifica = {};
    for (const mat of ['EST-002', 'MAN-001']) {
      const id = psql("select id from public.impianti where cliente_id = " + q(cliId) + " and matricola = " + q(mat));
      await s.page.evaluate(id => { editP(id); }, id);
      await attendiQuiete(s.stato, 1000);
      const campi = await s.page.evaluate(() => Array.from(document.querySelectorAll('#m-presidio input, #m-presidio select, #m-presidio textarea'))
        .filter(e => e.id && e.offsetParent !== null).map(e => e.id + '=' + (e.type === 'checkbox' ? e.checked : e.value)));
      await s.page.evaluate(() => { const u = ['me5', 'mm3', 'mp3'].map(ge).find(e => e && e.offsetParent !== null); if (u) u.value = u.value + ' (modificata)'; else window.__senzaUbicazione = true; });
      await s.page.evaluate(async () => { await saveP(); });
      await attendiQuiete(s.stato, 1500);
      const esitoSalva = await s.page.evaluate(() => ({ toast: ge('toast').textContent, aperta: ge('m-presidio').classList.contains('on') }));
      await s.page.evaluate(() => closeM('m-presidio'));
      foto.modifica[mat] = norm({ campi, esito: esitoSalva, dopo: JSON.parse(psql("select to_jsonb(i) from public.impianti i where id = " + q(id))) });
    }
    righe.push('modifica e salvataggio: EST-002, MAN-001');
    // 4b. storico: modifica e salvataggio della scheda semestrale, registra scheda già caricata
    foto.storico = {};
    const campiStorico = () => s.page.evaluate(() => Array.from(document.querySelectorAll('#storico-presidio input, #storico-presidio select, #storico-presidio textarea'))
      .filter(e => e.id).map(e => e.id + '=' + (e.type === 'checkbox' ? e.checked : e.value) + (e.readOnly ? ' (sola lettura)' : '')));
    for (const mat of ['MAN-001', 'REI-001', 'EST-001']) {
      const id = psql("select id from public.impianti where cliente_id = " + q(cliId) + " and matricola = " + q(mat));
      await s.page.evaluate(async id => { await apriSchedaPresidio(id); }, id);
      await attendiQuiete(s.stato, 1200);
      const r = { prima: await testoDi(s, '#storico-presidio') };
      const aperto = await s.page.evaluate(() => { if (!storicoPresidi.schede.length) return false; apriEditorSchedaPresidio(0, false); return true; });
      if (aperto) {
        await attendi(300);
        r.editor = norm(await campiStorico());
        await s.page.evaluate(() => {
          const n = ge('sp-note'); if (n) n.value = (n.value || '') + ' (storico)';
          const d = ge('sp-data'); if (d) { d.value = '2026-05-02'; d.dispatchEvent(new Event('input')); }
        });
        r.editor_dopo_data = norm(await campiStorico());
        await s.page.evaluate(async () => { await salvaSchedaPresidio(0, false); });
        await attendiQuiete(s.stato, 1500);
        r.toast = await s.page.evaluate(() => ge('toast').textContent);
        r.dopo = await testoDi(s, '#storico-presidio');
      }
      await s.page.evaluate(() => closeM('m-scheda-presidio'));
      foto.storico[mat] = r;
    }
    for (const mat of ['EST-003', 'MAN-001']) {
      const id = psql("select id from public.impianti where cliente_id = " + q(cliId) + " and matricola = " + q(mat));
      await s.page.evaluate(async id => { await apriSchedaPresidio(id); }, id);
      await attendiQuiete(s.stato, 1200);
      await s.page.evaluate(async () => { await registraSchedaGiaCaricata(); });
      await attendiQuiete(s.stato, 1500);
      foto.storico['registra_' + mat] = { toast: await s.page.evaluate(() => ge('toast').textContent), dopo: await testoDi(s, '#storico-presidio') };
      await s.page.evaluate(() => closeM('m-scheda-presidio'));
    }
    foto.db_dopo_storico = righeDb();
    righe.push('storico: modifica schede di MAN-001, REI-001, EST-001; registra scheda già caricata');
    // 5. nuovo presidio dalla finestra vuota (campi proposti)
    await s.page.evaluate(() => { resetPF(); openM('m-presidio'); });
    await attendi(400);
    foto.nuovo_presidio_campi = norm(await s.page.evaluate(() => Array.from(document.querySelectorAll('#m-presidio input, #m-presidio select, #m-presidio textarea'))
      .filter(e => e.id && e.offsetParent !== null).map(e => e.id + '=' + (e.type === 'checkbox' ? e.checked : e.value))));
    await s.page.evaluate(() => closeM('m-presidio'));
    // 6. nuovo controllo (finestra) su EST-001
    const est1 = psql("select id from public.impianti where cliente_id = " + q(cliId) + " and matricola = 'EST-001'");
    if (await s.page.evaluate(() => typeof eseguiNuovoControllo === 'function')) {
      await s.page.evaluate(async id => { try { await eseguiNuovoControllo(id); } catch (e) { window.__ncErr = e.message; } }, est1);
      await attendiQuiete(s.stato, 1200);
      foto.nuovo_controllo = await testoDi(s, '#nc-contenuto');
      await s.page.evaluate(() => { const m = ge('m-nuovo-controllo'); if (m) m.classList.remove('on'); });
    }
    foto.db_finale = righeDb();
    await chiudi(s);
    // 7. tecnico (sola lettura) a 390 px
    const t = await sessioneCome(browser, url, tec, 390); sessioni.push(t);
    await t.page.evaluate(() => gotoPage('presidi'));
    await attendiQuiete(t.stato, 1500);
    await t.page.evaluate(nome => { ge('psearch').value = nome; filterP(); }, CLIENTE);
    await attendiQuiete(t.stato, 1500);
    foto.tecnico_bottoni = await t.page.evaluate(() => Array.from(document.querySelectorAll('#pg-presidi button')).filter(b => b.offsetParent !== null).map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).sort());
    foto.tecnico_cartelle = await testoDi(t, '#pcards');
    righe.push('tecnico: bottoni e cartelle in sola lettura');
    // 8. Esegui intervento (tecnico, 390 px): passo Presidi, lavoro in corso, modifica di un presidio e ritorno
    const sede1 = psql("select id from public.sedi_cliente where cliente_id = " + q(cliId) + " limit 1");
    psql("insert into public.ordini_lavoro (cliente_id, sede_id, tecnico_id, tipo, stato, data_pianificata) values (" + q(cliId) + ", " + q(sede1) + ", " + q(tec.id) + ", 'ordinario_programmato', 'pianificato', current_date)");
    await t.page.evaluate(() => gotoPage('tecnico'));
    await attendiQuiete(t.stato, 2500);
    const scelto = await t.page.evaluate(id => { const sel = ge('tc1'); if (!sel || ![...sel.options].some(o => o.value === id)) return false; sel.value = id; sel.dispatchEvent(new Event('change')); return true; }, cliId);
    foto.esegui = { cliente_nella_tendina: scelto };
    if (scelto) {
      await attendiQuiete(t.stato, 1500);
      await t.page.evaluate(() => { ge('tc2').value = 'ordinario_chiamata'; });
      await t.page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Apri schede manutenzione ordinaria/.test(b.textContent)).click());
      await attendiQuiete(t.stato, 3000);
      const passo = () => t.page.evaluate(() => ({
        passo: ge('ts3') ? ge('ts3').classList.contains('on') : null,
        presidi: (ge('pcl') || {}).textContent || '',
        spunte: Array.from(document.querySelectorAll('#pcl input[type=checkbox][id^="upd-"]')).map(c => c.checked),
        stati: Array.from(document.querySelectorAll('#pcl [id^="stato-"]')).map(e => e.value),
        note: Array.from(document.querySelectorAll('#pcl [id^="note-"]')).map(e => e.value)
      }));
      foto.esegui.passo_presidi = norm(await passo());
      // lavoro in corso sul primo presidio
      await t.page.evaluate(() => {
        const cb = document.querySelector('#pcl input[type=checkbox][id^="upd-"]'); if (!cb) return;
        cb.checked = true; cb.dispatchEvent(new Event('change')); cb.dispatchEvent(new Event('click'));
        const pid = cb.id.slice(4);
        if (ge('stato-' + pid)) ge('stato-' + pid).value = 'anomalia';
        if (ge('note-' + pid)) ge('note-' + pid).value = 'nota di prova';
      });
      // modifica di un altro presidio dalla finestra
      const altro = psql("select id from public.impianti where cliente_id = " + q(cliId) + " and matricola = 'REI-001'");
      await t.page.evaluate(id => { editP(id); }, altro);
      await attendiQuiete(t.stato, 800);
      await t.page.evaluate(() => { const u = ['me5', 'mm3', 'mp3'].map(ge).find(e => e && e.offsetParent !== null); if (u) u.value = u.value + ' (dal passo)'; });
      await t.page.evaluate(async () => { await saveP(); });
      await attendiQuiete(t.stato, 2500);
      foto.esegui.salvataggio = norm(await t.page.evaluate(() => ({ toast: ge('toast').textContent, aperta: ge('m-presidio').classList.contains('on') })));
      await t.page.evaluate(() => closeM('m-presidio'));
      foto.esegui.dopo = norm(await passo());
      foto.esegui.rei = norm(JSON.parse(psql("select json_build_object('ubicazione', ubicazione) from public.impianti where id = " + q(altro))));
      righe.push('Esegui intervento: passo Presidi, lavoro in corso, modifica e ritorno');
    }
    for (const x of sessioni) if (x.stato.erroriJs.length) KO('errori JavaScript: ' + x.stato.erroriJs.join(' | '));
  } catch (e) {
    KO('interrotto: ' + e.message + ' ' + String(e.stack).split('\n').slice(1, 4).join(' '));
  } finally {
    for (const x of sessioni) { try { if (!x.chiuso) await x.contesto.close(); } catch (e) { /* chiuso */ } }
    await browser.close();
    srv.close();
    try { pulisci(); } catch (e) { console.error('pulizia: ' + e.message); }
  }
  fs.writeFileSync(path.join(CARTELLA_OUT, 'presidi-ora.json'), JSON.stringify(foto, null, 1));
  if (!fallimenti.length) {
    if (CONF.FOTOGRAFIA === 'nuova' || !fs.existsSync(FOTO)) {
      fs.mkdirSync(path.dirname(FOTO), { recursive: true });
      fs.writeFileSync(FOTO, JSON.stringify(foto, null, 1));
      righe.push('FOTOGRAFIA SALVATA in ' + FOTO + ' (' + Object.keys(foto).length + ' scenari)');
    } else {
      const diff = [];
      confronta(JSON.parse(fs.readFileSync(FOTO, 'utf8')), JSON.parse(JSON.stringify(foto)), 'foto', diff);
      if (diff.length) diff.forEach(d => KO('DIVERSO ' + d)); else righe.push('uguale alla fotografia (' + Object.keys(foto).length + ' scenari)');
    }
  }
  righe.forEach(r => console.log(r));
  console.log('Risultato di questo giro: ' + path.join(CARTELLA_OUT, 'presidi-ora.json'));
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
