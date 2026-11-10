// ── Service worker del gestionale ────────────────────────────────────
// F14.6 — notifiche degli avvisi urgenti (sql/66, Edge Function
// avvisi-urgenti): eventi "push" e "notificationclick" (invariati).
// F15.11 — app installabile che si apre anche senza rete:
//  - VERSIONE = il numero ?v= che pubblica.sh mette a script e style.css in
//    index.html. La pagina registra "sw.js?v=<versione>" (js/57
//    indirizzoServiceWorker): a ogni pubblicazione il service worker è un
//    altro indirizzo, si installa da solo e la cache dell'app ha il nome
//    della versione ("toli-app-<versione>"); le cache delle versioni vecchie
//    si cancellano all'attivazione. Nessun file vecchio dopo una
//    pubblicazione: index.html si prende SEMPRE prima dalla rete (dalla
//    cache solo senza rete) e gli script con ?v= sono file diversi per ogni
//    versione.
//  - Librerie dai CDN (supabase-js, jsPDF, autotable, pdf-lib, xlsx) nella
//    cache "toli-librerie-1": prese dalla cache, aggiornate in sottofondo.
//  - Dati di Supabase già visti (letture GET di /rest/v1 e le RPC di sola
//    lettura "..._attivo/_attivi/_attive", "schede_migrate_motore") nella
//    cache "toli-dati": prima la rete, la cache solo quando la rete manca.
//    Mai login, file (storage), scritture, "Entra come" (x-agito-come) e
//    portale (x-portale-token). La pagina svuota "toli-dati" a "Esci" e
//    quando sul telefono entra un'altra persona (js/57).
//  - Le cose salvate senza rete NON passano da qui: le tiene la coda in
//    IndexedDB di js/57 e le manda la pagina quando torna la rete.
// Carico della notifica (JSON): { titolo, testo, url, tag, avviso_id, urgente }.

const VERSIONE = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_APP = 'toli-app-' + VERSIONE;
const CACHE_LIBRERIE = 'toli-librerie-1';
const CACHE_DATI = 'toli-dati';
const LIBRERIE = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];
const HOST_LIBRERIE = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
const RPC_IN_CACHE = /\/rest\/v1\/rpc\/([a-z0-9_]+_attiv[oie]|schede_migrate_motore)$/;
const MASSIMO_DATI = 600;   // righe nella cache dei dati (le più vecchie escono)

function nellaScope(percorso) { return new URL(percorso, self.registration.scope).href; }
function suffissoVersione() { return VERSIONE === 'dev' ? '' : '?v=' + VERSIONE; }

// File dell'app letti da index.html (script js/... e style.css), con la
// versione di QUESTO service worker.
function fileDaIndice(html) {
  const nomi = new Set();
  const re = /(?:src|href)="((?:js\/[^"?]+\.js)|style\.css)(?:\?v=[0-9]+)?"/g;
  let m;
  while ((m = re.exec(html))) nomi.add(m[1]);
  return Array.from(nomi).map(function(n) { return nellaScope(n + suffissoVersione()); });
}

// Segno "cache incompleta": elenco dei file che all'installazione non sono
// arrivati (rete debole, errore del server). L'installazione NON si ferma
// (altrimenti "Attiva le notifiche" di js/59 aspetterebbe per sempre
// serviceWorker.ready): i file mancanti si riprendono alla prossima apertura
// del gestionale (completaCacheApp) e comunque al primo uso (fetch: cache,
// se manca la rete, poi si tiene). Sempre e solo file di QUESTA versione:
// niente file vecchi dopo una pubblicazione.
const SEGNO_INCOMPLETA = 'cache-incompleta';

async function segnaCacheApp(cache, mancanti) {
  const chiave = nellaScope(SEGNO_INCOMPLETA);
  if (mancanti.length) await cache.put(chiave, new Response(JSON.stringify(mancanti), { headers: { 'content-type': 'application/json' } }));
  else await cache.delete(chiave);
}

async function scaricaInCache(cache, elenco) {
  const mancanti = [];
  for (let i = 0; i < elenco.length; i += 8) {
    await Promise.all(elenco.slice(i, i + 8).map(async function(u) {
      try {
        const x = await fetch(u, { cache: 'reload' });
        if (x.ok) await cache.put(u, x); else mancanti.push(u);
      } catch (e) { mancanti.push(u); }
    }));
  }
  return mancanti;
}

async function preparaCacheApp() {
  const cache = await caches.open(CACHE_APP);
  let html = null;
  try {
    const r = await fetch(nellaScope('index.html'), { cache: 'reload' });
    if (r.ok) {
      html = await r.clone().text();
      // index.html si tiene come copia "senza rete" solo se è di questa versione
      if (VERSIONE === 'dev' || html.indexOf('?v=' + VERSIONE) >= 0) await cache.put(nellaScope('index.html'), r);
    }
  } catch (e) { html = null; }
  if (html === null) { await segnaCacheApp(cache, ['index.html']); return; }
  const elenco = fileDaIndice(html).concat([
    nellaScope('manifest.webmanifest'), nellaScope('assets/logo-192.png'), nellaScope('assets/logo-512.png')
  ]);
  await segnaCacheApp(cache, await scaricaInCache(cache, elenco));
}

// Riprende i file mancanti (una volta per avvio del service worker alla volta)
let completamento = null;
function completaCacheApp() {
  if (completamento) return completamento;
  completamento = (async function() {
    const cache = await caches.open(CACHE_APP);
    const segno = await cache.match(nellaScope(SEGNO_INCOMPLETA));
    if (!segno) return;
    let elenco = [];
    try { elenco = await segno.json(); } catch (e) { elenco = ['index.html']; }
    if (elenco.indexOf('index.html') >= 0) { await preparaCacheApp(); return; }
    const ancora = [];
    for (const u of elenco) { if (!(await cache.match(u))) ancora.push(u); }
    await segnaCacheApp(cache, await scaricaInCache(cache, ancora));
  })().catch(function() {}).finally(function() { completamento = null; });
  return completamento;
}

async function preparaCacheLibrerie() {
  const cache = await caches.open(CACHE_LIBRERIE);
  await Promise.all(LIBRERIE.map(async function(u) {
    try {
      if (await cache.match(u)) return;
      const r = await fetch(u, { mode: 'cors', credentials: 'omit' });
      if (r.ok) await cache.put(u, r);
    } catch (e) { /* si riprova al prossimo uso con la rete */ }
  }));
}

self.addEventListener('install', function(e) {
  e.waitUntil(Promise.all([preparaCacheApp(), preparaCacheLibrerie()]).then(function() { return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(nomi) {
    return Promise.all(nomi.filter(function(n) { return /^toli-app-/.test(n) && n !== CACHE_APP; })
      .map(function(n) { return caches.delete(n); }));
  }).then(function() { return self.clients.claim(); }).then(function() { completaCacheApp(); }));
});

// La pagina chiede: svuota i dati (Esci, altra persona) o dimmi la versione
self.addEventListener('message', function(e) {
  const d = e.data || {};
  if (d.tipo === 'svuota-dati') {
    e.waitUntil(caches.delete(CACHE_DATI).then(function() {
      if (e.source && e.source.postMessage) e.source.postMessage({ tipo: 'dati-svuotati' });
    }));
  } else if (d.tipo === 'versione' && e.source && e.source.postMessage) {
    e.source.postMessage({ tipo: 'versione', versione: VERSIONE, cache: CACHE_APP });
  }
});

// ── Richieste ───────────────────────────────────────────────────────
async function primaLaRete(req, nomeCache, chiave, conserva) {
  try {
    const r = await fetch(req);
    if (r && r.ok && conserva(r)) {
      const copia = r.clone();
      caches.open(nomeCache).then(function(c) { return c.put(chiave || req, copia); }).then(function() {
        if (nomeCache === CACHE_DATI) potaDati();
      }).catch(function() {});
    }
    return r;
  } catch (err) {
    const c = await caches.open(nomeCache);
    const x = await c.match(chiave || req);
    if (x) return x;
    throw err;
  }
}

let potature = 0;
async function potaDati() {
  if (++potature % 40) return;
  const c = await caches.open(CACHE_DATI);
  const chiavi = await c.keys();
  for (let i = 0; i < chiavi.length - MASSIMO_DATI; i++) await c.delete(chiavi[i]);
}

async function dallaCachePoiRete(req, nomeCache) {
  const c = await caches.open(nomeCache);
  const x = await c.match(req, { ignoreVary: true });
  if (x) {
    // Librerie: aggiornate in sottofondo (supabase-js@2 non ha il numero esatto)
    if (nomeCache === CACHE_LIBRERIE) {
      fetch(req.url, { mode: 'cors', credentials: 'omit' })
        .then(function(r) { if (r.ok) return c.put(req.url, r); }).catch(function() {});
    }
    return x;
  }
  const r = await fetch(req);
  if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()).catch(function() {});
  return r;
}

// Pagina del gestionale: rete, se manca la copia di index.html della versione
async function pagina(req) {
  try {
    const r = await fetch(req);
    if (r && r.ok) completaCacheApp(); // con la rete: si riprendono i file mancanti
    if (r && r.ok && !new URL(req.url).searchParams.get('portale')) {
      const copia = r.clone();
      copia.text().then(function(html) {
        if (VERSIONE === 'dev' || html.indexOf('?v=' + VERSIONE) >= 0) {
          return caches.open(CACHE_APP).then(function(c) {
            return c.put(nellaScope('index.html'), new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
          });
        }
      }).catch(function() {});
    }
    return r;
  } catch (err) {
    const c = await caches.open(CACHE_APP);
    const x = await c.match(nellaScope('index.html'));
    if (x) return x;
    const altra = await caches.match(nellaScope('index.html'));
    if (altra) return altra;
    throw err;
  }
}

// Chiave della cache dei dati: l'indirizzo + il tipo di risposta (single()
// chiede un oggetto, le altre un elenco) + il corpo per le RPC.
function chiaveDati(req, corpo) {
  const u = new URL(req.url);
  const acc = req.headers.get('accept') || '';
  if (/vnd\.pgrst/.test(acc)) u.searchParams.set('__accept', acc);
  if (corpo !== undefined) u.searchParams.set('__corpo', corpo);
  return new Request(u.href, { method: 'GET' });
}

function datiDaNonConservare(req) {
  return !!(req.headers.get('x-agito-come') || req.headers.get('x-portale-token'));
}

self.addEventListener('fetch', function(e) {
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch (x) { return; }

  // Stesso sito
  if (url.origin === self.location.origin) {
    if (req.method !== 'GET') return;
    if (/\/sw\.js$/.test(url.pathname)) return;
    if (req.mode === 'navigate') { e.respondWith(pagina(req)); return; }
    const versionato = url.searchParams.get('v');
    if (versionato && /\/(js\/[^/]+\.js|style\.css)$/.test(url.pathname)) {
      // File di una versione: sempre gli stessi, prima la cache di QUESTA
      // versione; un'altra versione si prende dalla rete senza tenerla
      e.respondWith(versionato === VERSIONE ? dallaCachePoiRete(req, CACHE_APP) : primaLaRete(req, CACHE_APP, null, function() { return false; }));
      return;
    }
    if (/\.(js|css|png|webmanifest|json|svg|ico)$/.test(url.pathname)) {
      e.respondWith(primaLaRete(req, CACHE_APP, null, function() { return true; }));
    }
    return;
  }

  // Librerie dei CDN
  if (HOST_LIBRERIE.indexOf(url.hostname) >= 0 && req.method === 'GET') {
    e.respondWith(dallaCachePoiRete(req, CACHE_LIBRERIE));
    return;
  }

  // Supabase: solo letture del database e RPC di sola lettura
  if (/\.supabase\.(co|in)$/.test(url.hostname) && url.pathname.indexOf('/rest/v1/') === 0) {
    if (datiDaNonConservare(req)) return;
    if (req.method === 'GET') {
      const chiave = chiaveDati(req);
      e.respondWith(primaLaRete(req, CACHE_DATI, chiave, function(r) { return r.status === 200; }));
      return;
    }
    if (req.method === 'POST' && RPC_IN_CACHE.test(url.pathname)) {
      e.respondWith(req.clone().text().then(function(corpo) {
        return primaLaRete(req, CACHE_DATI, chiaveDati(req, corpo || '{}'), function(r) { return r.status === 200; });
      }));
    }
  }
});

// ── F14.6 notifiche (invariato) ──────────────────────────────────────
self.addEventListener('push', function(e) {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { testo: e.data ? e.data.text() : '' }; }
  const titolo = d.titolo || 'TOLI Fire';
  e.waitUntil(self.registration.showNotification(titolo, {
    body: d.testo || 'Nuovo avviso nel gestionale',
    icon: 'assets/logo-192.png',
    badge: 'assets/logo-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: !!d.urgente,
    data: { url: d.url || '', avviso_id: d.avviso_id || null }
  }));
});

// Tocco sulla notifica: se il gestionale è già aperto lo porta davanti e
// apre l'avviso (#/avviso/<id>, js/58); altrimenti apre una finestra nuova.
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  const dati = e.notification.data || {};
  const base = self.registration.scope;
  const url = dati.avviso_id ? new URL('index.html#/avviso/' + dati.avviso_id, base).href
    : (dati.url ? new URL(dati.url, base).href : base);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(finestre) {
    for (const c of finestre) {
      if (c.url.indexOf(base) === 0 && 'focus' in c) {
        c.postMessage({ tipo: 'apri-avviso', avviso_id: dati.avviso_id || null });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
