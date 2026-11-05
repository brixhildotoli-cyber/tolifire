#!/usr/bin/env node
// F14.16 - Stesse azioni da tutte le strade (Chrome headless, puppeteer-core).
//
// Lo stesso preventivo aperto da DASHBOARD, CLIENTE (riquadro "🔗 Collegati"
// della scheda cliente), RICERCA ("🔍 Cerca" della pagina Preventivi del
// ruolo) e AVVISO (campanella: "Apri" di un avviso sul preventivo) deve
// mostrare per lo stesso ruolo gli stessi pulsanti: l'elenco "Cosa puoi
// fare" (data-azione-scheda, js/63) e tutti i bottoni visibili della scheda.
// Per ogni ruolo con la scheda del preventivo (titolare, commerciale) si
// provano fino a 3 preventivi in stati diversi. In più: le schede di
// commessa, progetto e cliente si aprono con il riquadro comune e senza
// errori (titolare, commerciale, rappresentante, segreteria, capo tecnico).
//
// SOLO DATABASE LOCALE (test/locale/avvia-db-locale.sh): le richieste del
// sito verso Supabase non escono dal browser. Crea avvisi di prova
// (crea_avviso_prova, titolare) nel database locale.
//
// Uso: cd test && node scheda-oggetto.spec.js   (uscita 0 = TUTTO OK)
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
const CARTELLA_OUT = CONF.SMOKE_RISULTATI || path.join(os.tmpdir(), 'toli-scheda-oggetto');
const CORE = fs.readFileSync(path.join(SITO, 'js/01-core.js'), 'utf8');
const SU_PROD = (/const SU='([^']+)'/.exec(CORE) || [])[1];
const HOST_PROD = new URL(SU_PROD).host;
function fermati(msg) { console.error('TEST NON AVVIATO: ' + msg); process.exit(2); }
if (!CONF.SMOKE_REST_URL || !CONF.SMOKE_JWT_SECRET) fermati('database locale non avviato: zsh test/locale/avvia-db-locale.sh');
if (!['127.0.0.1', 'localhost'].includes(new URL(CONF.SMOKE_REST_URL).hostname)) fermati('SMOKE_REST_URL deve essere locale');
const LARGHEZZA = Number(CONF.SMOKE_LARGHEZZA || 1280);
const ETICHETTA = 'PROVA F14.16';
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
    ['accept', 'content-type', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile'].forEach(k => { if (h[k]) intest[k] = h[k]; });
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
const LISTA_PREVENTIVI = { titolare: 'preventivi-titolare', commerciale: 'preventivi' };
const RUOLI_PREVENTIVO = ['titolare', 'commerciale'];
const SOLO = (CONF.SMOKE_SOLO_RUOLI || '').split(',').map(x => x.trim()).filter(Boolean);
const RUOLI_SCHEDE = ['titolare', 'commerciale', 'rappresentante', 'segreteria', 'capo_tecnico'].filter(r => !SOLO.length || SOLO.includes(r));
const DEBUG = !!CONF.SMOKE_DEBUG;

// Pulsanti della scheda del preventivo com'è sullo schermo.
async function leggiSchedaPreventivo(page) {
  return page.evaluate(() => {
    const pg = document.getElementById('pg-preventivo-detail');
    const on = document.querySelector('.page.on');
    const vis = el => !!(el.offsetParent || el.getClientRects().length);
    return {
      pagina: on && on.id,
      id: typeof currentPreventivoId !== 'undefined' ? currentPreventivoId : null,
      azioni: [...pg.querySelectorAll('#pvd-scheda-oggetto [data-azione-scheda]')].map(b => b.dataset.azioneScheda),
      bottoni: [...pg.querySelectorAll('button')].filter(vis).map(b => b.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)
    };
  });
}

async function provaRuolo(browser, ruolo, utente, titolare, url) {
  const esito = { ruolo, fallimenti: [], righe: [] };
  const KO = m => esito.fallimenti.push(m);
  const contesto = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
  const stato = { inCorso: 0, deviate: new Set(), ultima: 0, erroriJs: [], console: [], rete: [], bloccate: [], caricamenti: [] };
  const page = await preparaPagina(contesto, stato);
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('lp')).display !== 'none', { timeout: 20000 });
    await page.type('#lem', utente.email);
    await page.type('#lpw', 'prova-locale');
    await page.click('#lbtn');
    await page.waitForFunction(() => typeof ROLE !== 'undefined' && ROLE && ME && document.querySelector('.page.on'), { timeout: 25000 });
    await attendiQuiete(stato, 800);
    const token = tokenDi(utente);

    if (RUOLI_PREVENTIVO.includes(ruolo)) {
      // Preventivi che il ruolo trova nella sua pagina Preventivi (ricerca).
      const lista = LISTA_PREVENTIVI[ruolo];
      await page.evaluate(l => gotoPage(l), lista);
      await attendiQuiete(stato, 800);
      const inLista = await page.evaluate(l => [...document.querySelectorAll('#pg-' + l + ' button[onclick]')]
        .map(b => (/(openPreventivoDetail|apriPreventivoTitolare)\(\s*'([0-9a-f-]{36})'/.exec(b.getAttribute('onclick')) || [])[2]).filter(Boolean), lista);
      const ids = [...new Set(inLista)];
      if (!ids.length) { KO('nessun preventivo nella pagina ' + lista); return esito; }
      const righe = await rest('/preventivi?select=id,numero,stato,cliente_id&id=in.(' + ids.join(',') + ')', token);
      const perStato = {};
      righe.forEach(r => { if (!perStato[r.stato]) perStato[r.stato] = r; });
      const scelti = Object.values(perStato).slice(0, 3);
      for (const p of scelti) {
        // Avviso di prova sul preventivo (lo crea il titolare per questo utente)
        const idAvviso = await rest('/rpc/crea_avviso_prova', tokenDi(titolare), { metodo: 'POST', corpo: {
          p_testo: 'PROVA F14.16 preventivo n. ' + p.numero, p_destinatario_id: utente.id, p_rif_tabella: 'preventivi', p_rif_id: p.id } });
        const strade = {
          dashboard: async () => {
            await page.evaluate(() => gotoPage(ROLE === 'rappresentante' ? 'dashboard-rapp' : 'dashboard'));
            await attendiQuiete(stato);
            // Dalla dashboard: il bottone, se c'è, altrimenti la stessa funzione dei bottoni "Apri".
            await page.evaluate(async id => {
              const b = [...document.querySelectorAll('.page.on button[onclick]')].find(x => (x.getAttribute('onclick') || '').includes(id));
              if (b) b.click(); else await openPreventivoDetail(id);
            }, p.id);
          },
          cliente: async () => {
            await page.evaluate(async id => { await openClienteDetail(id); }, p.cliente_id);
            await attendiQuiete(stato, 800);
            await page.waitForSelector('#cd-scheda-oggetto .so-col-griglia, #cd-scheda-oggetto .empty', { timeout: 15000 });
            const ok = await page.evaluate(id => {
              const b = document.querySelector('#cd-scheda-oggetto [data-collegato="preventivo:' + id + '"]');
              if (!b) return false;
              const det = b.closest('details.so-col-altre'); if (det) det.open = true;
              b.click(); return true;
            }, p.id);
            if (!ok) throw new Error('il preventivo non è tra i Collegati del cliente');
          },
          ricerca: async () => {
            await page.evaluate(l => gotoPage(l), lista);
            await attendiQuiete(stato, 800);
            await page.evaluate((l, n) => { const c = document.getElementById('cerca-prev-' + l); c.value = String(n); filtraPreventiviPagina(l); }, lista, p.numero);
            const ok = await page.evaluate((l, id) => {
              const b = [...document.querySelectorAll('#pg-' + l + ' button[onclick]')].find(x => (x.getAttribute('onclick') || '').includes(id) && (x.offsetParent || x.getClientRects().length));
              if (!b) return false; b.click(); return true;
            }, lista, p.id);
            if (!ok) throw new Error('il preventivo non si trova con "Cerca"');
          },
          avviso: async () => {
            await page.evaluate(() => gotoPage(ROLE === 'rappresentante' ? 'dashboard-rapp' : 'dashboard'));
            await attendiQuiete(stato);
            await page.evaluate(async id => { await apriRecordAvviso(id); }, idAvviso);
          }
        };
        const viste = {};
        for (const [nome, vai] of Object.entries(strade)) {
          const s0 = stato.erroriJs.length;
          const t0 = Date.now();
          try { await vai(); if (DEBUG) console.log('  ' + ruolo + ' n. ' + p.numero + ' ' + nome + ': ' + (Date.now() - t0) + ' ms'); } catch (e) { KO('preventivo n. ' + p.numero + ', strada ' + nome + ': ' + e.message); continue; }
          await attendiQuiete(stato, 800);
          try { await page.waitForSelector('#pg-preventivo-detail.on #pvd-scheda-oggetto .so-scheda', { timeout: 15000 }); } catch (e) { /* lo dice il controllo sotto */ }
          await attendiQuiete(stato, 500);
          const v = await leggiSchedaPreventivo(page);
          stato.erroriJs.slice(s0).forEach(e => KO('preventivo n. ' + p.numero + ', strada ' + nome + ': errore JavaScript: ' + e));
          if (v.pagina !== 'pg-preventivo-detail' || v.id !== p.id) { KO('preventivo n. ' + p.numero + ', strada ' + nome + ': scheda non aperta (' + v.pagina + ')'); continue; }
          // La barra dell'avviso (✓ Fatto) è fuori dalla scheda: non conta.
          viste[nome] = v;
        }
        // L'avviso di prova si annulla subito (massimo 20 aperti per sql/65).
        try { await rest('/rpc/annulla_avviso', tokenDi(titolare), { metodo: 'POST', corpo: { p_id: idAvviso, p_motivo: 'Prova F14.16 finita' } }); } catch (e) { /* resta aperto */ }
        const nomi = Object.keys(viste);
        if (nomi.length < 4) { KO('preventivo n. ' + p.numero + ': aperto solo da ' + nomi.join(', ')); continue; }
        const base = viste[nomi[0]];
        nomi.slice(1).forEach(n => {
          if (JSON.stringify(viste[n].azioni) !== JSON.stringify(base.azioni)) KO('preventivo n. ' + p.numero + ': azioni diverse da ' + nomi[0] + ' (' + base.azioni.join(', ') + ') e da ' + n + ' (' + viste[n].azioni.join(', ') + ')');
          if (JSON.stringify(viste[n].bottoni) !== JSON.stringify(base.bottoni)) {
            const a = base.bottoni.filter(x => !viste[n].bottoni.includes(x)), b = viste[n].bottoni.filter(x => !base.bottoni.includes(x));
            KO('preventivo n. ' + p.numero + ': bottoni della scheda diversi tra ' + nomi[0] + ' e ' + n + ' (solo in ' + nomi[0] + ': ' + a.join(' | ') + '; solo in ' + n + ': ' + b.join(' | ') + ')');
          }
        });
        esito.righe.push('preventivo n. ' + p.numero + ' (' + p.stato + '): 4 strade, azioni [' + base.azioni.join(', ') + '], ' + base.bottoni.length + ' bottoni');
      }
    }

    // Schede di commessa, progetto e cliente con il riquadro comune.
    const schede = [
      { pagina: 'commessa-detail', tabella: 'commesse', apri: 'openCommessaDetail', box: 'cmd-scheda-oggetto' },
      { pagina: 'progetto-detail', tabella: 'progetti_tecnici', apri: 'openProgettoDetail', box: 'pd-scheda-oggetto' },
      { pagina: 'cliente-detail', tabella: 'clienti', apri: 'openClienteDetail', box: 'cd-scheda-oggetto' }
    ];
    for (const sc of schede) {
      const s0 = stato.erroriJs.length;
      const r = await page.evaluate(async sc => {
        if (!canAccessPage(sc.pagina)) return { negata: true };
        let q = db.from(sc.tabella).select('id').limit(1);
        if (sc.tabella === 'commesse') q = db.from('commesse').select('id').order('numero', { ascending: false }).limit(1);
        // Cliente e progetto della commessa più recente (con più collegamenti).
        const { data: cm } = await db.from('commesse').select('cliente_id,progetto_tecnico_id').order('numero', { ascending: false }).limit(1);
        if (cm && cm[0] && sc.tabella === 'clienti') q = db.from('clienti').select('id').eq('id', cm[0].cliente_id);
        if (cm && cm[0] && sc.tabella === 'progetti_tecnici' && cm[0].progetto_tecnico_id) q = db.from('progetti_tecnici').select('id').eq('id', cm[0].progetto_tecnico_id);
        const { data } = await q;
        if (!data || !data.length) return { vuota: true };
        await window[sc.apri](data[0].id);
        return { id: data[0].id };
      }, sc);
      if (r.negata || r.vuota) continue;
      await attendiQuiete(stato, 800);
      try { await page.waitForSelector('#' + sc.box + ' .so-col-griglia, #' + sc.box + ' .so-riquadro .empty', { timeout: 15000 }); } catch (e) { KO(sc.pagina + ': riquadro Collegati non disegnato'); }
      // Storico: si apre e si carica.
      await page.evaluate(box => { const d = document.querySelector('#' + box + '-storico details'); if (d) d.open = true; }, sc.box);
      await attendiQuiete(stato, 600);
      const v = await page.evaluate(box => {
        const el = document.getElementById(box);
        return {
          gruppi: [...el.querySelectorAll('.so-col-gruppo')].map(g => g.dataset.fonte + ':' + g.querySelectorAll('.so-col-riga').length),
          azioni: [...el.querySelectorAll('[data-azione-scheda]')].map(b => b.dataset.azioneScheda),
          storico: (el.querySelector('.so-storico-corpo') || {}).innerText || ''
        };
      }, sc.box);
      stato.erroriJs.slice(s0).forEach(e => KO(sc.pagina + ': errore JavaScript: ' + e));
      esito.righe.push(sc.pagina + ': collegati [' + v.gruppi.join(', ') + '], azioni [' + v.azioni.join(', ') + '], storico ' + (v.storico.trim() ? v.storico.trim().split('\n').length + ' righe' : 'vuoto'));
    }
    // Facoltativo (SMOKE_SCHERMATE=1): schermata del preventivo accettato più
    // recente con lo Storico aperto, per controllare la grafica.
    if (CONF.SMOKE_SCHERMATE && RUOLI_PREVENTIVO.includes(ruolo)) {
      await page.evaluate(async () => {
        const { data } = await db.from('preventivi').select('id').eq('stato', 'accettato').order('numero', { ascending: false }).limit(1);
        if (data && data[0]) await openPreventivoDetail(data[0].id);
      });
      await attendiQuiete(stato, 800);
      await page.evaluate(() => { const d = document.querySelector('#pvd-scheda-oggetto-storico details'); if (d) d.open = true; });
      await attendiQuiete(stato, 800);
      await page.screenshot({ path: path.join(CARTELLA_OUT, 'preventivo-' + ruolo + '-' + LARGHEZZA + '.png'), fullPage: true });
    }
    stato.rete.filter(e => e.status >= 500 || /does not exist|could not find/i.test(e.msg)).forEach(e => KO('database: ' + e.metodo + ' ' + e.dove.split('?')[0] + ' → ' + e.status + ' ' + e.msg));
    stato.rete.filter(e => e.status < 500 && !/does not exist|could not find/i.test(e.msg)).forEach(e => esito.righe.push('avviso rete: ' + e.metodo + ' ' + e.dove.split('?')[0] + ' → ' + e.status + ' ' + e.msg));
  } catch (e) {
    KO('errore dello script: ' + e.message.split('\n')[0]);
    try { await page.screenshot({ path: path.join(CARTELLA_OUT, 'errore-' + ruolo + '.png') }); } catch (e2) { /* niente */ }
  } finally {
    try { await page.screenshot({ path: path.join(CARTELLA_OUT, 'ultima-' + ruolo + '.png'), fullPage: true }); } catch (e2) { /* niente */ }
    await contesto.close();
  }
  return esito;
}

(async () => {
  fs.mkdirSync(CARTELLA_OUT, { recursive: true });
  const srv = await avviaSito();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const utenti = await rest('/utenti?select=id,email,ruolo,attivo&attivo=eq.true&order=id', tokenServizio());
  BACK.perEmail = {}; BACK.perId = {};
  utenti.forEach(u => { BACK.perEmail[String(u.email).toLowerCase()] = u; BACK.perId[u.id] = u; });
  const clienti = await rest('/clienti?select=rappresentante_id&rappresentante_id=not.is.null', tokenServizio());
  const n = {}; clienti.forEach(c => { n[c.rappresentante_id] = (n[c.rappresentante_id] || 0) + 1; });
  const primo = r => utenti.filter(u => u.ruolo === r).sort((a, b) => (n[b.id] || 0) - (n[a.id] || 0))[0];
  const titolare = primo('titolare');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 90000, args: ['--no-first-run', '--disable-features=Translate'] });
  const esiti = [];
  for (const ruolo of RUOLI_SCHEDE) {
    const u = primo(ruolo);
    if (!u) { esiti.push({ ruolo, fallimenti: ['nessun utente'], righe: [] }); continue; }
    const e = await provaRuolo(browser, ruolo, u, titolare, url);
    esiti.push(e);
    console.log('\n' + (e.fallimenti.length ? '✗ ' : '✓ ') + ruolo);
    e.righe.forEach(r => console.log('    ' + r));
    e.fallimenti.forEach(f => console.log('    FALLITO  ' + f));
  }
  await browser.close(); srv.close();
  const ko = esiti.filter(e => e.fallimenti.length);
  console.log('\n' + (ko.length ? 'FALLITO: ' + ko.map(e => e.ruolo).join(', ') : 'TUTTO OK'));
  process.exit(ko.length ? 1 : 0);
})().catch(e => { console.error('TEST INTERROTTO: ' + e.stack); process.exit(2); });
