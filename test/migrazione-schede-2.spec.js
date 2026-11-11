#!/usr/bin/env node
// F15.7 - Migrazione delle schede di compartimentazione (con le pareti in
// cartongesso), vernice intumescente, coppelle e impianti di spegnimento nel
// catalogo (sql/81, js/56 + js/18 + js/55), Chrome headless con
// puppeteer-core, SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh dal
// backup pre80: esegue 80 e 81).
// Il "fatto quando" della task:
//  1. i progetti ESISTENTI (le 11 coppelle e le 2 vernici del backup, salvate
//     dalle schede scritte a mano di js/18) e una scheda "di prima" per ognuna
//     delle 4 lavorazioni si aprono nel motore dai bottoni della verifica
//     tecnica con TUTTI i dati (msm-c-<chiave> con lo stesso valore; le pareti
//     in cartongesso nelle righe cp-par-*); avviso "Da ricompilare";
//  2. "👁 Modulo di prima" della compartimentazione in sola lettura (anche
//     "+ Aggiungi parete" e "🗑️ Togli" nascosti, salvataggio fermo);
//  3. l'ingegnere aggiunge una parete nel motore e salva: le pareti sono un
//     elenco di 2 righe, gli altri dati identici;
//  4. PDF per il fornitore: "Parete 1: 4,5 × 2,7 m (m²) · angolo interno ed
//     esterno: 2,7 m, n. 2" come prima; il titolare rinomina un campo delle
//     coppelle (codice fisso) e non cambia il tipo delle pareti;
//  5. console: Acquisti, rappresentante e tecnico non toccano il catalogo.
// Con MIGRAZIONE_SENZA_SQL=1 (dopo il ROLLBACK di sql/81): "🧱 Compila
// compartimentazione" apre la scheda di js/18 modificabile, si salva come
// prima e il PDF ha la stessa riga delle pareti.
// Alla fine (solo database locale) si tolgono le schede di prova e
// l'etichetta torna com'era.
// Uso: cd test && node migrazione-schede-2.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-migrazione-schede-2');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F15.7';
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

async function apriProgetto(s, progettoId) {
  await s.page.evaluate(async id => { await openProgettoDetail(id); }, progettoId);
  await attendiQuiete(s.stato, 1200);
  await s.page.evaluate(() => { const t = [...document.querySelectorAll('#pg-progetto-detail .tab')].find(x => /Rilievi tecnici/.test(x.textContent)); if (t) t.click(); });
  await attendiQuiete(s.stato, 600);
}
const valori = (s, ids) => s.page.evaluate(ids => ids.map(id => { const e = document.getElementById(id); return e ? e.value : null; }), ids);
async function scrivi(s, id, testo) {
  await s.page.evaluate(id => { const e = document.getElementById(id); e.value = ''; }, id);
  await s.page.type('#' + id, testo);
}

// Dati salvati come li salvavano le schede di js/18 (v(): numeri come testo)
const PARETI = [
  { unita: 'm²', larghezza: 4.5, altezza: 2.7, angolo: 'entrambi', misura_angolo: 2.7, quantita_angoli: 2 }
];
const RIGA_PARETE = 'Parete 1: 4,5 × 2,7 m (m²) · angolo interno ed esterno: 2,7 m, n. 2';
const DATI_VECCHI = {
  compartimentazione: { tipo_intervento: 'parete', classe: 'ei', minuti: '120', numero_attraversamenti: '6',
    tipo_attraversamento: 'cavi', dimensioni_foro: '300 × 200', spessore_supporto: '125', materiale_supporto: 'cartongesso',
    posizione: 'Piano primo, locale quadri', sistemi_presenti: 'Sacchetti intumescenti', riempimento_cavi: 'Canalina piena al 60%',
    ripristino: 'si', certificazione_sistema: 'EI 120 Promat', altezza_lavoro: 'trabattello', accessibilita: 'Locale occupato',
    foto: 'Foto 1-4 negli allegati', note_tecniche: 'Sistema da confermare', pareti_cartongesso: PARETI, nome_scheda: 'Piano primo' },
  vernice_intumescente: { elemento: 'trave', classe_r: 'r60', profilo: 'HEA 200', numero_elementi: '12', sviluppo_lineare: '48.5',
    superficie: '62', fattore_sezione: '180', stato_supporto: 'verniciato', preparazione: 'primer', note_supporto: 'Vecchia vernice',
    ambiente: 'interno', altezza_lavoro: 'ple', accessibilita: 'Magazzino con scaffali', ciclo: 'Primer + intumescente',
    colore: 'RAL 9010', requisito_estetico: 'A vista', foto: 'Foto travi', certificazione: 'Dichiarazione di posa', note_tecniche: 'Spessore da calcolare' },
  coppelle: { tipo_intervento: 'nuova_posa', materiale_tubazione: 'acciaio', uso_tubazione: 'antincendio', diametro: '2"',
    lunghezza: '0.2', numero_tratti: '3', spessore: '30', classe_resistenza: 'EI 60', reazione_fuoco: 'A1',
    supporto_attraversato: 'cartongesso', numero_attraversamenti_coppelle: '3', finitura: 'alluminio', ambiente: 'cavedio',
    altezza_lavoro: 'PLE', ostacoli: 'Canaline', accessibilita: 'Dal cavedio', foto: 'Foto tubazioni', certificazione: 'Certificato EI 60',
    note_tecniche: 'Coppelle certificate' },
  impianti_spegnimento: { tipo_impianto: 'idranti', tipo_intervento: 'ampliamento', area_protetta: 'Magazzino 1.200 mq',
    normativa: 'UNI 10779', impianto_esistente: 'Rete del 2004', alimentazione: 'gruppo_pompe', pressione: '4 bar',
    portata: '300 l/min', riserva: '20 mc', componenti: '4 idranti UNI 45', rete_esistente: 'Acciaio zincato DN65',
    percorsi_tubazioni: '120 ml a vista', compartimentazione: '2 attraversamenti', collegamenti: 'Centrale incendio',
    accessibilita: 'Locale pompe al piano terra', collaudi: 'Collaudo idraulico', foto: 'Foto locale pompe', note_tecniche: 'Verificare la riserva' }
};
const BOTTONI = {
  compartimentazione: 'apriSchedaCompartimentazioneIngegnere', vernice_intumescente: 'apriSchedaVerniceIntumescenteIngegnere',
  coppelle: 'apriSchedaCoppelleIngegnere', impianti_spegnimento: 'apriSchedaImpiantiSpegnimentoIngegnere'
};

async function apriDaVerifica(s, progettoId, famiglia) {
  await s.page.evaluate(async (progettoId, fn) => {
    let el = document.getElementById('mvt-id');
    if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.id = 'mvt-id'; document.body.appendChild(el); }
    el.value = progettoId;
    await window[fn]();
  }, progettoId, BOTTONI[famiglia]);
  await attendiQuiete(s.stato, 900);
}
async function chiudiScheda(s) {
  await s.page.evaluate(() => { if (schedaRilievoAperta) { schedaRilievoAperta.modificata = false; schedaRilievoAperta.bozze = {}; } closeM('m-rilievo-tecnico'); });
  await attendiQuiete(s.stato, 400);
}
// Confronto: ogni chiave salvata (tranne il nome) ha il suo campo del motore con lo stesso valore;
// le pareti nelle righe cp-par-<n>-*
function confrontaMotore(s, dati) {
  return s.page.evaluate(dati => {
    const diversi = [];
    Object.keys(dati).forEach(k => {
      if (k === 'nome_scheda') return;
      if (k === 'pareti_cartongesso') {
        const righe = typeof righeModuloPareteCartongesso === 'function' && document.getElementById('cp-pareti-righe') &&
          document.getElementById('msm-aggiungi-parete') ? righeModuloPareteCartongesso() : null;
        if (!righe) { diversi.push('pareti: righe mancanti nel motore'); return; }
        if (JSON.stringify(righe) !== JSON.stringify(dati[k])) diversi.push('pareti: ' + JSON.stringify(righe) + ' invece di ' + JSON.stringify(dati[k]));
        return;
      }
      const el = document.getElementById('msm-c-' + k);
      if (!el) { diversi.push(k + ': campo mancante'); return; }
      const atteso = dati[k] === null || dati[k] === undefined ? '' : String(dati[k]);
      const ok = el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || !/^-?\d+(\.\d+)?$/.test(atteso)
        ? el.value === atteso
        : numeroMotore(el.value) === Number(atteso);
      if (!ok) diversi.push(k + ': «' + el.value + '» invece di «' + atteso + '»');
    });
    return { diversi, nome: (document.getElementById('rsm-nome') || {}).value || '', ricompilare: !!document.getElementById('msm-da-ricompilare'),
             famiglia: (document.getElementById('msm-motore') || { dataset: {} }).dataset.famiglia || '' };
  }, dati);
}
// Righe delle pareti con le chiavi in ordine (jsonb le riordina)
const ordinaRighe = l => JSON.stringify(l.map(r => Object.keys(r).sort().reduce((o, k) => { o[k] = r[k]; return o; }, {})));
// Testo del PDF della richiesta al fornitore (WinAnsi: × e ² come byte singoli)
async function testoPdfFornitore(s, preventivoId, selezioneId) {
  return s.page.evaluate(async (prev, sel) => {
    currentPreventivoId = prev;
    let blob = null;
    // eslint-disable-next-line no-global-assign
    scaricaBlobRichiesta = function(b) { blob = b; };
    await generaRichiestaQuotazionePDF(sel);
    return blob ? new TextDecoder('latin1').decode(await blob.arrayBuffer()).replace(/\\/g, '') : 'NESSUN PDF';
  }, preventivoId, selezioneId);
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const fallimenti = [], righe = [];
  const KO = m => fallimenti.push(m);
  const SENZA = CONF.MIGRAZIONE_SENZA_SQL === '1';
  const c81 = psql("select to_regprocedure('public.schede_migrate_motore()') is not null and 'coppelle' = any(public.schede_migrate_motore())");
  if (psql("select to_regprocedure('public.motore_schede_attivo()') is not null") !== 't') fermati('sql/77 non eseguito nel database locale');
  if (!SENZA && c81 !== 't') fermati('sql/81 non eseguito nel database locale');
  if (SENZA && c81 === 't') fermati('MIGRAZIONE_SENZA_SQL=1 ma sql/81 c\'è: eseguire prima il ROLLBACK di sql/81');
  // Progetto con preventivo e richiesta al fornitore, senza schede
  const riga = psql("select p.id || '|' || pr.id || '|' || pf.id || '|' || coalesce(pf.richiesta_versione, 0) from public.preventivi_fornitori pf join public.preventivi pr on pr.id = pf.preventivo_id join public.progetti_tecnici p on p.id = pr.progetto_tecnico_id where not exists (select 1 from public.progetti_tecnici_schede s where s.progetto_tecnico_id = p.id) order by p.creato_il, pf.id limit 1");
  if (!riga) fermati('serve un progetto con preventivo e richiesta al fornitore, senza schede');
  const [progettoId, preventivoId, selezioneId, versionePrima] = riga.split('|');
  // Schede ESISTENTI del backup (salvate dalle schede di js/18)
  const esistenti = psql("select string_agg(progetto_tecnico_id || '#' || famiglia || '#' || numero || '#' || dati::text, '\n' order by famiglia, progetto_tecnico_id, numero) from public.progetti_tecnici_schede where famiglia in ('compartimentazione', 'vernice_intumescente', 'coppelle', 'impianti_spegnimento') and not (dati ? 'tipo_richiesta')")
    .split('\n').filter(Boolean).map(r => { const x = r.split('#'); return { progetto: x[0], famiglia: x[1], numero: Number(x[2]), dati: JSON.parse(x.slice(3).join('#')) }; });
  const inizio = psql('select now()');
  Object.keys(DATI_VECCHI).forEach(f => psql("insert into public.progetti_tecnici_schede (progetto_tecnico_id, famiglia, numero, dati, stato) values (" + q(progettoId) + ", " + q(f) + ", 1, " + q(JSON.stringify(DATI_VECCHI[f])) + "::jsonb, 'bozza')"));
  const campoId = SENZA ? '' : psql("select c.id || '|' || c.etichetta from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = 'coppelle' and c.codice = 'lunghezza'");
  const pareteId = SENZA ? '' : psql("select c.id from public.lavorazioni_campi c join public.lavorazioni l on l.id = c.lavorazione_id where l.codice = 'compartimentazione' and c.codice = 'pareti_cartongesso'");
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,nome,cognome,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((x, y) => (diProva(y) - diProva(x)) || String(x.nome).localeCompare(String(y.nome)))[0];
  const ing = primo('ingegnere'), tit = primo('titolare'), com = primo('commerciale'), tec = primo('tecnico'), rapp = primo('rappresentante');
  if (!ing || !tit || !com || !tec || !rapp) fermati('servono ingegnere, titolare, Acquisti, tecnico e rappresentante attivi');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const sessioni = [];
  try {
    const g = await apriSito(browser, url); sessioni.push(g);
    await login(g, ing);
    if (SENZA) {
      await apriDaVerifica(g, progettoId, 'compartimentazione');
      const st = await g.page.evaluate(() => ({ motore: !!document.getElementById('msm-motore'), ro: !!document.getElementById('msm-sola-lettura'),
        larg: (document.getElementById('cp-par-0-larghezza') || {}).value, dis: (document.getElementById('cp-par-0-larghezza') || {}).disabled,
        agg: [...document.querySelectorAll('#mrt-content button')].some(b => /aggiungiPareteCartongesso/.test(b.getAttribute('onclick') || '') && b.style.display !== 'none') }));
      if (st.motore || st.ro || st.larg !== '4,5' || st.dis || !st.agg) KO('senza sql/81: la compartimentazione di js/18 non è come prima: ' + JSON.stringify(st));
      await g.page.evaluate(() => { document.getElementById('cp-numero-attraversamenti').value = '8'; });
      await g.page.evaluate(() => salvaSchedaCompartimentazione());
      await attendiQuiete(g.stato, 1200);
      const d = JSON.parse(psql("select dati::text from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'compartimentazione'"));
      if (d.numero_attraversamenti !== '8' || ordinaRighe(d.pareti_cartongesso || []) !== ordinaRighe(PARETI)) KO('senza sql/81: la compartimentazione non si salva come prima: ' + JSON.stringify(d));
      else righe.push('senza sql/81: "🧱 Compila compartimentazione" apre la scheda di js/18 modificabile (parete 4,5), si salva come prima (8 attraversamenti, pareti uguali)');
      await chiudiScheda(g);
      await chiudi(g);
      const t0 = await apriSito(browser, url); sessioni.push(t0);
      await login(t0, tit);
      const pdf = await testoPdfFornitore(t0, preventivoId, selezioneId);
      if (!pdf.includes(RIGA_PARETE)) { KO('senza sql/81: PDF per il fornitore senza «' + RIGA_PARETE + '»'); fs.writeFileSync(path.join(CARTELLA_OUT, 'pdf.txt'), pdf, 'latin1'); }
      else righe.push('   PDF per il fornitore: «' + RIGA_PARETE + '»');
    } else {
      // 1. Schede esistenti del backup e schede "di prima" con tutte le chiavi ------
      let contate = 0;
      for (const e of esistenti) {
        await apriDaVerifica(g, e.progetto, e.famiglia);
        if (e.numero !== 1) {
          await g.page.click('#rsm-tab-' + e.numero);
          await g.page.waitForFunction(n => schedaRilievoAperta && schedaRilievoAperta.numero === n && document.getElementById('msm-motore'), { timeout: 8000 }, e.numero);
          await attendiQuiete(g.stato, 300);
        }
        const r = await confrontaMotore(g, e.dati);
        const conDati = Object.keys(e.dati).some(k => k !== 'nome_scheda' && e.dati[k] !== '' && e.dati[k] !== null);
        if (r.famiglia !== e.famiglia || r.diversi.length || r.nome !== String(e.dati.nome_scheda || '') || r.ricompilare !== conDati) KO('1: scheda esistente ' + e.famiglia + ' ' + e.numero + ': ' + JSON.stringify(r));
        else contate++;
        await chiudiScheda(g);
      }
      righe.push('1. schede esistenti del backup: ' + contate + ' su ' + esistenti.length + ' (' +
        Object.entries(esistenti.reduce((m, e) => { m[e.famiglia] = (m[e.famiglia] || 0) + 1; return m; }, {})).map(x => x[0] + ' ' + x[1]).join(', ') +
        ') si aprono nel motore con tutte le chiavi e lo stesso valore, avviso "Da ricompilare"');
      for (const f of Object.keys(DATI_VECCHI)) {
        await apriDaVerifica(g, progettoId, f);
        const r = await confrontaMotore(g, DATI_VECCHI[f]);
        if (r.famiglia !== f || r.diversi.length || r.nome !== String(DATI_VECCHI[f].nome_scheda || '') || !r.ricompilare) KO('1: ' + f + ' compilata con js/18: ' + JSON.stringify(r));
        else righe.push('   ' + f + ' compilata con la scheda di js/18 (' + Object.keys(DATI_VECCHI[f]).filter(k => k !== 'nome_scheda').length + ' dati' + (f === 'compartimentazione' ? ', pareti comprese' : '') + '): tutti nel motore con lo stesso valore');
        if (f !== 'compartimentazione') { await chiudiScheda(g); continue; }
        await g.page.screenshot({ path: path.join(CARTELLA_OUT, '1-ingegnere-compartimentazione-motore.png'), fullPage: true });
        const boxPareti = await g.page.$('[data-campo-motore="pareti_cartongesso"]');
        if (boxPareti) await boxPareti.screenshot({ path: path.join(CARTELLA_OUT, '1-pareti-nel-motore.png') });
        // 2. Modulo di prima in sola lettura -------------------------------------------
        await g.page.click('#msm-modulo-prima');
        await g.page.waitForSelector('#msm-sola-lettura', { timeout: 8000 });
        const ro = await g.page.evaluate(() => ({
          v: document.getElementById('cp-par-0-larghezza').value, dis: document.getElementById('cp-par-0-larghezza').disabled,
          tutti: [...document.getElementById('mrt-content').querySelectorAll('input,select,textarea')].every(x => x.disabled),
          bottoni: [...document.querySelectorAll('#mrt-content button')].filter(b => /salvaSchedaCompartimentazione|aggiungiPareteCartongesso|togliPareteCartongesso/.test(b.getAttribute('onclick') || '') && b.style.display !== 'none').length
        }));
        const prima = psql("select aggiornato_il from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'compartimentazione'");
        await g.page.evaluate(() => salvaSchedaCompartimentazione());
        await attendiQuiete(g.stato, 900);
        const dopo = psql("select aggiornato_il from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'compartimentazione'");
        if (ro.v !== '4,5' || !ro.dis || !ro.tutti || ro.bottoni || prima !== dopo) KO('2: modulo di prima: ' + JSON.stringify(ro) + ' salvata ' + (prima !== dopo));
        else righe.push('2. "👁 Modulo di prima": compartimentazione di js/18 con la parete 4,5, tutti i campi spenti, niente Salva, "+ Aggiungi parete" e "🗑️ Togli"; salvaSchedaCompartimentazione() non salva');
        await g.page.screenshot({ path: path.join(CARTELLA_OUT, '2-modulo-di-prima-sola-lettura.png'), fullPage: true });
        await g.page.click('#msm-torna-motore');
        await g.page.waitForSelector('#msm-motore', { timeout: 8000 });
        await attendiQuiete(g.stato, 300);
        // 3. Una parete in più dal motore, i dati di prima restano ---------------
        await g.page.click('#msm-aggiungi-parete');
        await attendiQuiete(g.stato, 200);
        const pallino = await g.page.evaluate(() => !!(schedaRilievoAperta && schedaRilievoAperta.modificata));
        await g.page.select('#cp-par-1-unita', 'ml');
        await scrivi(g, 'cp-par-1-larghezza', '3');
        await scrivi(g, 'cp-par-1-altezza', '2,7');
        await g.page.click('#msm-salva');
        await attendiQuiete(g.stato, 1500);
        const salv = JSON.parse(psql("select dati::text from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and famiglia = 'compartimentazione'"));
        const persi = Object.keys(DATI_VECCHI.compartimentazione).filter(k => k !== 'pareti_cartongesso' && JSON.stringify(salv[k]) !== JSON.stringify(DATI_VECCHI.compartimentazione[k]));
        const pareti = salv.pareti_cartongesso || [];
        const attese = PARETI.concat([{ unita: 'ml', larghezza: 3, altezza: 2.7, angolo: '', misura_angolo: null, quantita_angoli: null }]);
        if (!pallino || persi.length || ordinaRighe(pareti) !== ordinaRighe(attese) || salv.tipo_richiesta !== 'definitiva') KO('3: salvata dal motore, diversi: ' + persi.join(', ') + ' pallino ' + pallino + ' ' + JSON.stringify(salv));
        else righe.push('3. l\'ingegnere aggiunge una parete nel motore (tab segnato modificato) e salva: pareti = elenco di 2 righe, gli altri ' + (Object.keys(DATI_VECCHI.compartimentazione).length - 2) + ' dati identici ("125" resta "' + salv.spessore_supporto + '")');
        await chiudiScheda(g);
      }
      await chiudi(g);

      // 4. Titolare: PDF per il fornitore, rinomina di un campo, tipo delle pareti fisso --
      const t = await apriSito(browser, url); sessioni.push(t);
      await login(t, tit);
      const [idCampo] = campoId.split('|');
      const ren = await t.page.evaluate(async (id, idPareti) => {
        const a = await db.from('lavorazioni_campi').update({ etichetta: 'Metri di tubazione' }).eq('id', id).select('codice,etichetta');
        const b = await db.from('lavorazioni_campi').update({ codice: 'metri_tubo' }).eq('id', id).select('codice');
        const c = await db.from('lavorazioni_campi').update({ tipo: 'testo' }).eq('id', idPareti).select('tipo');
        await caricaCatalogoLavorazioni(true);
        return { a: a.error ? 'ERRORE ' + a.error.message : JSON.stringify(a.data), b: b.error ? 'rifiutato: ' + b.error.message : 'CODICE CAMBIATO ' + JSON.stringify(b.data),
                 c: c.error ? 'rifiutato: ' + c.error.message : 'TIPO CAMBIATO ' + JSON.stringify(c.data) };
      }, idCampo, pareteId);
      if (!/lunghezza.*Metri di tubazione/.test(ren.a) || !/rifiutato/.test(ren.b) || !/rifiutato.*tipo_check/.test(ren.c)) KO('4: rinomina ' + JSON.stringify(ren));
      else righe.push('4. il titolare rinomina "Lunghezza da rivestire" in "Metri di tubazione": ' + ren.a + '; cambio del codice ' + ren.b.slice(0, 70) + '; pareti in testo ' + ren.c.slice(0, 90));
      await apriProgetto(t, progettoId);
      const vista = await t.page.evaluate(() => document.getElementById('pd-schede-content').innerText);
      const voci = ['Metri di tubazione (m)', 'Pareti in cartongesso', RIGA_PARETE, 'Parete 2: 3 × 2,7 m (ml)', 'Superficie da trattare (m²)', 'Area o compartimento da proteggere'];
      const mancano = voci.filter(x => !vista.includes(x));
      if (mancano.length) KO('4: scheda progetto, mancano: ' + mancano.join(', '));
      else righe.push('   la scheda progetto: ' + voci.join(' · '));
      await t.page.screenshot({ path: path.join(CARTELLA_OUT, '4-titolare-scheda-progetto.png'), fullPage: true });
      const pdf = await testoPdfFornitore(t, preventivoId, selezioneId);
      const nelPdf = [RIGA_PARETE, 'Parete 2: 3 × 2,7 m (ml)', 'Metri di tubazione (m): 0,2', 'Diametro esterno tubazione (mm): 2"', 'Classe R richiesta: R60', 'Pressione disponibile: 4 Bar'] // come prima: valoreSchedaTecnica mette la maiuscola alle parole dei testi;
      const manca = nelPdf.filter(x => !pdf.includes(x));
      if (manca.length) { KO('4: PDF per il fornitore, mancano: ' + manca.join(' | ') + (pdf === 'NESSUN PDF' ? ' NESSUN PDF' : '')); fs.writeFileSync(path.join(CARTELLA_OUT, 'pdf.txt'), pdf, 'latin1'); }
      else righe.push('   PDF della richiesta al fornitore: ' + nelPdf.join(' · '));
      await chiudi(t);

      // 5. Console: ruoli non ammessi sul catalogo -------------------------------
      for (const u of [com, rapp, tec]) {
        const s = await apriSito(browser, url); sessioni.push(s);
        await login(s, u);
        const r = await s.page.evaluate(async id => {
          const a = await db.from('lavorazioni_campi').update({ etichetta: 'Rinominato da console' }).eq('id', id).select('id');
          return a.error ? 'rifiutato: ' + a.error.message : (a.data || []).length + ' righe';
        }, pareteId);
        if (!/rifiutato|^0 righe/.test(r)) KO('5: console di ' + u.ruolo + ': ' + r);
        else righe.push('5. console di ' + u.ruolo + ': rinomina delle pareti ' + r);
        await chiudi(s);
      }
      const et = psql('select etichetta || tipo from public.lavorazioni_campi where id = ' + pareteId);
      if (et !== 'Pareti in cartongessoelenco') KO('5: pareti cambiate da un ruolo non ammesso: ' + et);
    }

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
    // Solo database locale: via le schede di prova, etichetta e versione della richiesta come prima
    try {
      psql("delete from public.progetti_tecnici_schede where progetto_tecnico_id = " + q(progettoId) + " and creato_il >= " + q(inizio));
      psql('update public.preventivi_fornitori set richiesta_versione = ' + Number(versionePrima) + ' where id = ' + q(selezioneId));
      if (campoId) psql('update public.lavorazioni_campi set etichetta = ' + q(campoId.split('|').slice(1).join('|')) + ' where id = ' + campoId.split('|')[0]);
    } catch (e) { console.error('pulizia: ' + e.message); }
  }
  righe.forEach(r => console.log(r));
  console.log('Schermate: ' + CARTELLA_OUT);
  if (fallimenti.length) { fallimenti.forEach(f => console.log('FALLITO: ' + f)); console.log('FALLITO'); process.exit(1); }
  console.log('TUTTO OK');
})();
