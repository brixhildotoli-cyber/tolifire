// ── F14.6 — Service worker minimo: SOLO le notifiche degli avvisi urgenti
// (sql/66, Edge Function avvisi-urgenti). Nessuna cache, nessun "fetch":
// il sito si carica sempre dalla rete come prima (versioni ?v= di
// pubblica.sh invariate). Lo registra js/59 (registraServiceWorker di
// js/01) solo quando le notifiche sono configurate.
// Carico della notifica (JSON): { titolo, testo, url, tag, avviso_id, urgente }.

self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });

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
