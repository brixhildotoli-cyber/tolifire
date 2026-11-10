// ── F15.11 — App installabile offline con coda di invio ─────────────
// Nessun SQL: le righe nascono con l'id generato dal telefono
// (crypto.randomUUID), così rimandarle è un "upsert" e non crea doppioni.
//
// Cosa fa:
//  - registra il service worker sw.js?v=<versione> (la versione è il
//    numero ?v= che pubblica.sh mette agli script di index.html): cache
//    dell'app con il nome della versione, librerie CDN e dati già visti
//    (sw.js). Chiamato da js/19 all'avvio per tutti i ruoli; la stessa
//    registrazione serve alle notifiche di js/59 (stesso file, stesso
//    indirizzo: registraServiceWorker di js/01 usa indirizzoServiceWorker).
//  - apre il gestionale anche senza rete: all'accesso la riga dell'utente
//    si tiene sul telefono (localStorage "toli_offline_utente", solo chi
//    ha fatto il login, tolta con "Esci"); senza rete js/19 chiama
//    avvioSenzaRete e boot parte da lì. "Esci" svuota anche i dati in cache.
//  - CODA DI INVIO in IndexedDB ("toli-coda-offline", archivio "invii"):
//    * file della scheda di rilievo del motore (📷 Foto e video, 📜 fonte
//      del dato; caricaFileNelProgetto di js/56 avvolta, solo cartelle
//      CARTELLE_IN_CODA): id del file del progetto e percorso nello storage
//      generati sul telefono; il file resta nel telefono (ArrayBuffer);
//    * schede di rilievo (salvaRigaSchedaRilievo di js/18 avvolta): id della
//      scheda generato sul telefono per le schede nuove, quello di sempre
//      per le salvate; risalvare la stessa scheda senza rete sostituisce la
//      riga in coda (nessun doppione nemmeno nel telefono).
//    Si invia da sola quando torna la rete (evento online, ogni 45 s, al
//    rientro nell'app, dopo l'accesso), in ordine (prima i file, poi la
//    scheda che li usa), un telefono e una scheda del browser alla volta
//    (navigator.locks). Invio = upsert per id: un file già nello storage
//    (409) o una riga già presente (23505 con lo stesso id) contano come
//    inviati. Errori del database = riga "⚠️ non inviata" con il motivo,
//    "↻ Riprova" e "🗑️ Togli"; errori di rete = si riprova più tardi.
//  - "Non ancora inviato" visibile: pulsante 📤 N nel menu (📴 senza rete),
//    finestra m-coda-offline con l'elenco, 📤 sul tab della scheda e riga
//    in cima alla scheda di rilievo, barra "Senza rete".
//  - iPhone senza app installata: avviso "Installa l'app" (Safari cancella
//    i dati delle pagine non installate dopo 7 giorni senza uso).
// Non in coda (senza rete restano come prima, con un messaggio chiaro):
// posizioni P-xx e loro foto (js/66), file della finestra del progetto e
// della verifica tecnica (js/17), invio del progetto, preventivi e ogni
// altra pagina. La coda è pronta per altri tipi: registraTipoCodaOffline.
// Con "Entra come" la coda è spenta (si salverebbe come un altro).

const CODA = {
  db: null, invio: null, contatore: 0, tipi: {}, ultimo: [], avvioSenzaRete: false,
  ultimoSalvataggioInCoda: false, toastFile: null, fileNelGiro: 0, timer: null
};
const CODA_NOME_DB = 'toli-coda-offline';
const CODA_ARCHIVIO = 'invii';
const CHIAVE_UTENTE_OFFLINE = 'toli_offline_utente';
const CHIAVE_INSTALLA_OFFLINE = 'toli_installa_offline_';   // + utente: avviso chiuso il (ms)
const CACHE_DATI_OFFLINE = 'toli-dati';
const CARTELLE_IN_CODA = ['foto_video', 'fonti'];
const CODA_RIPROVA_MS = 45000;

// ── Versione del sito e service worker ──────────────────────────────
function versioneSito() {
  const s = document.querySelector('script[src*="js/19-init.js"]');
  const m = s && /[?&]v=([0-9]+)/.exec(s.getAttribute('src') || '');
  return m ? m[1] : '';
}
function indirizzoServiceWorker() {
  const v = versioneSito();
  return 'sw.js' + (v ? '?v=' + v : '');
}
// Da js/19 all'avvio (non nel portale clienti). Sul Mac (localhost,
// 127.0.0.1: prove e smoke test) solo con localStorage toli_sw_locale = 1:
// il service worker manderebbe le richieste di Supabase alla rete senza
// passare dalle deviazioni verso il database di prova dei test.
function registraServiceWorkerApp() {
  try { if (typeof PORTALE_TOKEN !== 'undefined' && PORTALE_TOKEN) return Promise.resolve(null); } catch (e) { /* niente */ }
  let locale = false;
  try { locale = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && localStorage.getItem('toli_sw_locale') !== '1'; } catch (e) { locale = false; }
  if (locale) return Promise.resolve(null);
  if (typeof registraServiceWorker !== 'function') return Promise.resolve(null);
  return registraServiceWorker();
}

// ── Rete ────────────────────────────────────────────────────────────
function senzaRete() { return navigator.onLine === false; }
function erroreDiRete(e) {
  if (!e) return false;
  if (senzaRete()) return true;
  const m = String((e && (e.message || e.details)) || e || '');
  return /Failed to fetch|Load failed|NetworkError|Network request failed|network error|fetch failed|ERR_INTERNET|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|The network connection was lost|Internet connection appears to be offline/i.test(m);
}
function erroreDiAccesso(e) {
  if (!e) return false;
  return ['PGRST301', 'PGRST302', 'PGRST303'].includes(e.code) || String(e.status || e.statusCode || '') === '401' ||
    /JWT expired|invalid JWT|not authenticated|Invalid Refresh Token/i.test(String(e.message || ''));
}
function nuovoIdCoda() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  const b = new Uint8Array(16);
  window.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b).map(function(x) { return x.toString(16).padStart(2, '0'); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}
function utenteCoda() {
  try { return (typeof ME_REALE !== 'undefined' && ME_REALE) ? ME_REALE : null; } catch (e) { return null; }
}
function codaOfflineAmmessa() {
  let come = null;
  try { come = typeof ENTRA_COME !== 'undefined' ? ENTRA_COME : null; } catch (e) { come = null; }
  return !!(utenteCoda() && !come && 'indexedDB' in window);
}

// ── IndexedDB ───────────────────────────────────────────────────────
function apriDbCoda() {
  if (CODA.db) return CODA.db;
  CODA.db = new Promise(function(ok, ko) {
    if (!('indexedDB' in window)) { ko(new Error('Questo browser non tiene i dati senza rete')); return; }
    const r = indexedDB.open(CODA_NOME_DB, 1);
    r.onupgradeneeded = function() {
      const d = r.result;
      if (!d.objectStoreNames.contains(CODA_ARCHIVIO)) d.createObjectStore(CODA_ARCHIVIO, { keyPath: 'id' });
    };
    r.onsuccess = function() { ok(r.result); };
    r.onerror = function() { ko(r.error); };
  });
  CODA.db.catch(function() { CODA.db = null; });
  return CODA.db;
}
async function operazioneCoda(modo, fn) {
  const d = await apriDbCoda();
  return new Promise(function(ok, ko) {
    const t = d.transaction(CODA_ARCHIVIO, modo);
    let esito;
    const req = fn(t.objectStore(CODA_ARCHIVIO));
    if (req) req.onsuccess = function() { esito = req.result; };
    t.oncomplete = function() { ok(esito); };
    t.onerror = function() { ko(t.error || (req && req.error)); };
    t.onabort = function() { ko(t.error || new Error('Salvataggio sul telefono annullato')); };
  });
}
async function codaTutti() {
  try { return (await operazioneCoda('readonly', function(s) { return s.getAll(); })) || []; } catch (e) { return []; }
}
function codaPrendi(id) { return operazioneCoda('readonly', function(s) { return s.get(id); }); }
function codaMetti(voce) { return operazioneCoda('readwrite', function(s) { return s.put(voce); }); }
function codaTogli(id) { return operazioneCoda('readwrite', function(s) { return s.delete(id); }); }
function ordineCoda() { CODA.contatore = (CODA.contatore + 1) % 1000; return Date.now() * 1000 + CODA.contatore; }
async function codaMie() {
  const u = utenteCoda();
  if (!u) return [];
  return (await codaTutti()).filter(function(x) { return x.utente_id === u.id; })
    .sort(function(a, b) { return a.ordine - b.ordine; });
}
function testoErroreCoda(e) {
  if (e && e.name === 'QuotaExceededError') return 'Spazio sul telefono finito: libera spazio o invia prima quello che è in attesa';
  return (e && e.message) || String(e || 'errore sconosciuto');
}

// Altri moduli (buono di lavoro, giornale...) possono aggiungere i loro tipi:
// registraTipoCodaOffline('tipo', { invia: async (voce) => {...}, icona, titolo: (voce) => '...' })
function registraTipoCodaOffline(tipo, def) { CODA.tipi[tipo] = def; }

// ── Utente e sessione sul telefono ──────────────────────────────────
function salvaUtenteOffline(ud) {
  try { if (ud && ud.id) localStorage.setItem(CHIAVE_UTENTE_OFFLINE, JSON.stringify(ud)); } catch (e) { /* spazio pieno: niente avvio senza rete */ }
}
function utenteOfflineSalvato() {
  try { const u = JSON.parse(localStorage.getItem(CHIAVE_UTENTE_OFFLINE) || 'null'); return u && u.id ? u : null; } catch (e) { return null; }
}
function chiaveSessioneAuth() {
  try { if (db && db.auth && db.auth.storageKey) return db.auth.storageKey; } catch (e) { /* niente */ }
  return 'sb-' + new URL(SU).hostname.split('.')[0] + '-auth-token';
}
// Utente di Supabase Auth salvato dal client (anche con il token scaduto)
function utenteAuthLocale() {
  try {
    const s = JSON.parse(localStorage.getItem(chiaveSessioneAuth()) || 'null');
    const u = s && (s.user || (s.currentSession && s.currentSession.user));
    return u && u.id ? u : null;
  } catch (e) { return null; }
}
async function svuotaCacheDatiOffline() {
  try { if ('caches' in window) await caches.delete(CACHE_DATI_OFFLINE); } catch (e) { /* niente */ }
}
// Supabase raggiungibile? (risposta qualunque = sì; nessuna risposta = no)
async function supabaseRaggiungibile() {
  if (senzaRete()) return false;
  try {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(function() { if (ctl) ctl.abort(); }, 5000);
    await fetch(SU + '/auth/v1/health', { headers: { apikey: SK }, cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    clearTimeout(t);
    return true;
  } catch (e) { return false; }
}

// Da js/19: sessione salvata ma la rete non risponde. idSessione = utente
// della sessione letta (vuoto se il token è scaduto e non si rinnova senza
// rete). Vero = gestionale aperto con l'utente salvato sul telefono.
async function avvioSenzaRete(idSessione) {
  const salvato = utenteOfflineSalvato();
  if (!salvato) return false;
  const auth = utenteAuthLocale();
  const id = idSessione || (auth && auth.id);
  if (!id || id !== salvato.id) return false;
  if (!idSessione && await supabaseRaggiungibile()) return false; // con la rete: si rientra
  CODA.avvioSenzaRete = true;
  try { await boot(salvato); } catch (e) { console.warn('Avvio senza rete:', e && e.message); }
  aggiornaBarraRete();
  return true;
}

// ── Avvolte: boot, Esci, getUser ────────────────────────────────────
if (typeof boot === 'function') {
  const bootSenzaCoda = boot;
  // eslint-disable-next-line no-global-assign
  boot = async function(ud) {
    const prima = utenteOfflineSalvato();
    // Un'altra persona su questo telefono: i dati in cache non sono suoi
    if (ud && ud.id && (!prima || prima.id !== ud.id)) await svuotaCacheDatiOffline();
    salvaUtenteOffline(ud);
    const avvio = bootSenzaCoda.apply(this, arguments);
    // Menu 📤 e barra "Senza rete" subito (ME_REALE è già messo), l'invio
    // solo a boot finito (con "Entra come" la coda resta spenta)
    try { preparaInterfacciaCoda(); } catch (e) { console.warn('Coda offline:', e && e.message); }
    try {
      return await avvio;
    } finally {
      // Anche se un caricamento fallisce (senza rete): la coda deve partire
      try { avviaCodaOffline(); } catch (e) { console.warn('Coda offline:', e && e.message); }
    }
  };
}

if (typeof doLogout === 'function') {
  const doLogoutSenzaCoda = doLogout;
  // eslint-disable-next-line no-global-assign
  doLogout = async function() {
    const n = (await codaMie()).length;
    if (n && !confirm('Ci sono ' + n + (n === 1 ? ' cosa salvata' : ' cose salvate') + ' sul telefono e non ancora inviate.\n\n' +
      'Se esci restano su questo telefono e partono quando rientri tu con la rete. Uscire lo stesso?')) return;
    // Senza rete l'uscita "vera" non arriva al server: si esce da questo telefono
    if (senzaRete() || !(await supabaseRaggiungibile())) {
      try { await db.auth.signOut({ scope: 'local' }); } catch (e) { /* niente */ }
    }
    try { localStorage.removeItem(CHIAVE_UTENTE_OFFLINE); } catch (e) { /* niente */ }
    await svuotaCacheDatiOffline();
    return doLogoutSenzaCoda.apply(this, arguments);
  };
}

// Senza rete supabase-js riprova ogni lettura 3 volte (circa 7 secondi)
// prima di dire che non va: in modalità aereo è inutile, si spegne finché
// la rete non torna (db.rest.retry: undefined = come sempre).
function aggiornaRitentativiDatabase() {
  try { if (typeof db !== 'undefined' && db && db.rest) db.rest.retry = senzaRete() ? false : undefined; } catch (e) { /* niente */ }
}
aggiornaRitentativiDatabase();
window.addEventListener('online', aggiornaRitentativiDatabase);
window.addEventListener('offline', aggiornaRitentativiDatabase);

// Senza rete (modalità aereo) getSession() con il token scaduto prova a
// rinnovarlo per 30 secondi prima di ogni lettura: si usa la sessione
// salvata così com'è (le letture arrivano subito al service worker, che
// risponde con i dati già visti). Con la rete si rinnova come sempre.
(function() {
  if (typeof db === 'undefined' || !db || !db.auth || typeof db.auth.getSession !== 'function') return;
  const getSessionConRete = db.auth.getSession.bind(db.auth);
  db.auth.getSession = async function() {
    if (senzaRete()) {
      try {
        const s = JSON.parse(localStorage.getItem(chiaveSessioneAuth()) || 'null');
        if (s && s.access_token && s.user && s.user.id) return { data: { session: s }, error: null };
      } catch (e) { /* si prova come sempre */ }
    }
    return getSessionConRete.apply(this, arguments);
  };
})();

// Senza rete getUser() (chiamata a /auth/v1/user) fallisce e i caricamenti
// dei file direbbero "Sessione scaduta": vale l'utente della sessione salvata,
// solo se è chi ha fatto l'accesso.
(function() {
  if (typeof db === 'undefined' || !db || !db.auth || typeof db.auth.getUser !== 'function') return;
  const getUserConRete = db.auth.getUser.bind(db.auth);
  db.auth.getUser = async function(jwt) {
    const locale = function() {
      const u = utenteAuthLocale(), me = utenteCoda();
      return u && me && u.id === me.id ? { data: { user: u }, error: null } : null;
    };
    if (!jwt && senzaRete()) { const x = locale(); if (x) return x; }
    const r = await getUserConRete(jwt);
    if (!jwt && r && r.error && erroreDiRete(r.error)) { const x = locale(); if (x) return x; }
    return r;
  };
})();

// ── File del progetto in coda ───────────────────────────────────────
function allegatoDaVoceCoda(voce) {
  return { id: voce.allegato_id, nome_file: voce.nome, storage_path: voce.percorso, mime_type: voce.tipo_mime, caricato_il: voce.creato_il, in_coda: true };
}

async function mettiFileInCoda(progettoId, uid, originale, opz) {
  if (typeof verificaFotoVideoDisponibile === 'function') { try { await verificaFotoVideoDisponibile(); } catch (e) { /* senza rete */ } }
  const prep = await preparaFileProgetto(originale);
  if (prep.errore) return { errore: prep.errore };
  const impronta = prep.impronta || (typeof improntaFileProgetto === 'function' ? await improntaFileProgetto(originale) : null);
  // La stessa foto già in attesa per questo progetto: come il doppione online
  if (impronta) {
    const gia = (await codaMie()).find(function(x) { return x.tipo === 'file_progetto' && x.progetto_id === progettoId && x.impronta === impronta; });
    if (gia) {
      return {
        doppione: allegatoDaVoceCoda(gia),
        errore: '«' + originale.name + '» è già tra i file in attesa di invio' + (gia.nome !== originale.name ? ' (come «' + gia.nome + '»)' : '') +
          ': la stessa foto non vale per due posizioni'
      };
    }
  }
  const id = nuovoIdCoda();
  const nome = (opz.prefisso || '') + String(prep.file.name || originale.name || 'file');
  const percorso = uid + '/' + progettoId + '/' + (opz.cartella ? opz.cartella + '/' : '') + id + '_' + nome.replace(/[^a-zA-Z0-9._-]/g, '_');
  const voce = {
    id: 'file:' + id, tipo: 'file_progetto', utente_id: utenteCoda().id, ordine: ordineCoda(),
    creato_il: new Date().toISOString(), stato: 'in_attesa', errore: '', tentativi: 0,
    progetto_id: progettoId, titolo_progetto: titoloProgettoCoda(progettoId), allegato_id: id, percorso: percorso, nome: nome,
    tipo_mime: prep.tipo, dimensione: prep.file.size, impronta: impronta || null, caricato_da: uid,
    cartella: opz.cartella || '', contenuto: await prep.file.arrayBuffer()
  };
  try { await codaMetti(voce); } catch (e) { return { errore: originale.name + ': non salvato sul telefono: ' + testoErroreCoda(e) }; }
  aggiornaBadgeCoda();
  avvisaFileInCoda();
  return { alleg: allegatoDaVoceCoda(voce), inCoda: true };
}

// Un solo messaggio per i file messi in coda insieme (dopo quello del modulo)
function avvisaFileInCoda() {
  CODA.fileNelGiro++;
  clearTimeout(CODA.toastFile);
  CODA.toastFile = setTimeout(function() {
    const n = CODA.fileNelGiro;
    CODA.fileNelGiro = 0;
    toast('📤 ' + (n === 1 ? '1 file resta' : n + ' file restano') + ' sul telefono (senza rete): ' +
      (n === 1 ? 'parte' : 'partono') + ' da solo quando torna la rete. Ricordati di salvare la scheda.', 'warn');
  }, 900);
}

function titoloProgettoCoda(progettoId) {
  try {
    if (typeof MOTORE_SCHEDE !== 'undefined' && MOTORE_SCHEDE.progetto && MOTORE_SCHEDE.progetto.id === progettoId) return MOTORE_SCHEDE.progetto.titolo || '';
  } catch (e) { /* niente */ }
  return '';
}

if (typeof caricaFileNelProgetto === 'function') {
  const caricaFileConRete = caricaFileNelProgetto;
  // eslint-disable-next-line no-global-assign
  caricaFileNelProgetto = async function(progettoId, uid, originale, opz) {
    opz = opz || {};
    const inCoda = codaOfflineAmmessa() && CARTELLE_IN_CODA.includes(opz.cartella) && typeof preparaFileProgetto === 'function';
    if (!inCoda) {
      if (senzaRete()) return { errore: (originale && originale.name ? originale.name + ': ' : '') + 'senza rete qui non si carica: riprova quando c’è campo (le foto e i file della scheda di rilievo invece restano sul telefono e partono da soli)' };
      return caricaFileConRete.apply(this, arguments);
    }
    if (!senzaRete()) {
      const r = await caricaFileConRete.apply(this, arguments);
      if (!(r && r.errore && !r.doppione && !r.alleg && erroreDiRete({ message: r.errore }))) return r;
    }
    return mettiFileInCoda(progettoId, uid, originale, opz);
  };
}

async function apriFileInCoda(allegatoId) {
  if (!allegatoId) return false;
  let voce = null;
  try { voce = await codaPrendi('file:' + allegatoId); } catch (e) { voce = null; }
  if (!voce || !voce.contenuto) return false;
  const url = URL.createObjectURL(new Blob([voce.contenuto], { type: voce.tipo_mime || 'application/octet-stream' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(function() { URL.revokeObjectURL(url); }, 120000);
  return true;
}

if (typeof apriFileFotoVideoMotore === 'function') {
  const apriFotoVideoConRete = apriFileFotoVideoMotore;
  // eslint-disable-next-line no-global-assign
  apriFileFotoVideoMotore = async function(id, i) {
    const a = (voceFotoVideoMotore(id).allegati || [])[i];
    if (a && await apriFileInCoda(a.allegato_id)) return;
    return apriFotoVideoConRete.apply(this, arguments);
  };
}
if (typeof apriFileFonteMotore === 'function') {
  const apriFonteConRete = apriFileFonteMotore;
  // eslint-disable-next-line no-global-assign
  apriFileFonteMotore = async function(codice) {
    const voce = (typeof MOTORE_SCHEDE !== 'undefined' && MOTORE_SCHEDE.fonti || {})[codice];
    if (voce && await apriFileInCoda(voce.allegato_id)) return;
    return apriFonteConRete.apply(this, arguments);
  };
}

function fileGiaNelloStorage(e) {
  return !!e && (String(e.statusCode || e.status || '') === '409' || /already exists|Duplicate/i.test(String(e.message || '')));
}

async function inviaFileProgettoCoda(voce) {
  if (typeof verificaFotoVideoDisponibile === 'function') await verificaFotoVideoDisponibile();
  const file = new Blob([voce.contenuto], { type: voce.tipo_mime || 'application/octet-stream' });
  const up = await db.storage.from('progetti-tecnici').upload(voce.percorso, file, { contentType: voce.tipo_mime, upsert: false });
  if (up.error && !fileGiaNelloStorage(up.error)) throw up.error;
  const riga = {
    id: voce.allegato_id, progetto_id: voce.progetto_id, nome_file: voce.nome, storage_path: voce.percorso,
    mime_type: voce.tipo_mime, dimensione: voce.dimensione, caricato_da: voce.caricato_da
  };
  if (voce.impronta && typeof fotoVideoAttivi === 'function' && fotoVideoAttivi()) riga.impronta = voce.impronta;
  const ins = await db.from('progetti_tecnici_allegati').insert(riga);
  if (!ins.error) return;
  if (ins.error.code === '23505') {
    const { data } = await db.from('progetti_tecnici_allegati').select('id').eq('id', voce.allegato_id).maybeSingle();
    if (data) return; // già arrivato (rimandato dopo un invio a metà)
  }
  if (!erroreDiRete(ins.error) && !erroreDiAccesso(ins.error)) {
    // Rifiutato (es. stessa foto già nel progetto): il file nello storage non serve
    try { await db.storage.from('progetti-tecnici').remove([voce.percorso]); } catch (e) { /* niente */ }
  }
  throw ins.error;
}
registraTipoCodaOffline('file_progetto', {
  icona: function(v) { return /^video\//.test(v.tipo_mime || '') ? '🎥' : (/^image\//.test(v.tipo_mime || '') ? '📷' : '📎'); },
  titolo: function(v) {
    return (v.cartella === 'fonti' ? 'File della fonte del dato' : 'Foto o file della scheda') + ': «' + v.nome + '»' +
      (v.dimensione ? ' (' + (v.dimensione / 1048576).toFixed(1).replace('.', ',') + ' MB)' : '');
  },
  invia: inviaFileProgettoCoda
});

// ── Schede di rilievo in coda ───────────────────────────────────────
function chiaveSchedaCoda(riga) {
  return riga.id ? 'scheda:' + riga.id : 'scheda:' + riga.progetto_tecnico_id + ':' + riga.famiglia;
}

async function metteSchedaInCoda(rigaScheda, multipla, descrizione) {
  const voce = {
    id: chiaveSchedaCoda(rigaScheda), tipo: 'scheda_rilievo', utente_id: utenteCoda().id, ordine: ordineCoda(),
    creato_il: new Date().toISOString(), stato: 'in_attesa', errore: '', tentativi: 0,
    progetto_id: rigaScheda.progetto_tecnico_id, titolo_progetto: titoloProgettoCoda(rigaScheda.progetto_tecnico_id),
    famiglia: rigaScheda.famiglia, numero: rigaScheda.numero || 1, descrizione: descrizione || '',
    multipla: !!multipla, riga: JSON.parse(JSON.stringify(rigaScheda))
  };
  await codaMetti(voce);
}

// Salvataggio senza rete: stesse regole di salvaRigaSchedaRilievo (js/18),
// ma le righe vanno nella coda e nell'elenco in memoria (la scheda resta
// aperta con i dati appena scritti). giaControllata = arriva dopo un
// tentativo con la rete (controlli e bozze già fatti da js/18).
async function salvaSchedaRilievoInCoda(riga, giaControllata) {
  const s = schedaRilievoAperta;
  const multiple = typeof schedeMultipleAttive === 'function' && schedeMultipleAttive() && s && s.elenco && s.famiglia === riga.famiglia;
  try {
    if (!multiple) {
      // Senza sql/48 (oggi non in produzione): una scheda per tipo
      if (typeof schedeMultipleDisponibili === 'undefined' || schedeMultipleDisponibili !== false) {
        return { error: { message: 'senza rete la scheda non si salva: aprila una volta con la rete, poi si può compilare anche senza' }, salvate: 0 };
      }
      if (s && s.nomeOriginale && riga.dati && !riga.dati.nome_scheda) riga.dati.nome_scheda = s.nomeOriginale;
      if (s && s.famiglia === riga.famiglia && s.datiOriginali) riga.dati = conservaDatiFuoriModulo(riga.dati, s.datiOriginali);
      if (!giaControllata && typeof controlloSchedeRilievoPrimaDelSalvataggio === 'function') {
        const fermo = controlloSchedeRilievoPrimaDelSalvataggio([{ famiglia: riga.famiglia, dati: riga.dati, prima: (s && s.famiglia === riga.famiglia && s.datiOriginali) || {} }]);
        if (fermo) return { error: fermo, salvate: 0 };
      }
      await metteSchedaInCoda(Object.assign({}, riga), false, etichettaSchedaCoda(riga.famiglia, 1, ''));
      if (s && s.famiglia === riga.famiglia) s.datiOriginali = riga.dati;
      CODA.ultimoSalvataggioInCoda = true;
      aggiornaBadgeCoda();
      return { error: null, salvate: 1, inCoda: true };
    }

    if (!giaControllata) {
      s.bozze[s.numero] = {
        dati: riga.dati,
        nome: String(v('rsm-nome') || '').trim(),
        nuova: !rigaSalvataSchedaRilievo(s.numero)
      };
      const numeriCtl = Object.keys(s.bozze).map(Number);
      if (typeof controlloSchedeRilievoPrimaDelSalvataggio === 'function') {
        const fermo = controlloSchedeRilievoPrimaDelSalvataggio(numeriCtl.map(function(numero) {
          const prima = rigaSalvataSchedaRilievo(numero);
          return {
            famiglia: riga.famiglia, numero: numero,
            dati: conservaDatiFuoriModulo(s.bozze[numero].dati, prima && prima.dati),
            prima: (prima && prima.dati) || {}
          };
        }));
        if (fermo) { s.modificata = true; return { error: fermo, salvate: 0 }; }
      }
    }
    s.modificata = false;

    const numeri = Object.keys(s.bozze).map(Number).sort(function(a, b) { return a - b; });
    let salvate = 0;
    for (const numero of numeri) {
      const bozza = s.bozze[numero];
      const prima = rigaSalvataSchedaRilievo(numero);
      const dati = conservaDatiFuoriModulo(bozza.dati, prima && prima.dati);
      if (bozza.nome) dati.nome_scheda = bozza.nome; else delete dati.nome_scheda;
      const id = (prima && prima.id) || nuovoIdCoda();
      const rigaScheda = Object.assign({}, riga, { id: id, dati: dati, numero: numero });
      await metteSchedaInCoda(rigaScheda, true, etichettaSchedaCoda(riga.famiglia, numero, bozza.nome));
      const nuova = { id: id, numero: numero, dati: dati, aggiornato_il: riga.aggiornato_il || new Date().toISOString(), in_coda: true };
      const i = s.elenco.findIndex(function(x) { return Number(x.numero) === numero; });
      if (i >= 0) s.elenco[i] = Object.assign({}, s.elenco[i], nuova); else s.elenco.push(nuova);
      delete s.bozze[numero];
      salvate++;
    }
    s.elenco.sort(function(a, b) { return Number(a.numero) - Number(b.numero); });
    CODA.ultimoSalvataggioInCoda = true;
    aggiornaBadgeCoda();
    return { error: null, salvate: salvate, inCoda: true };
  } catch (e) {
    if (s) s.modificata = true;
    return { error: { message: 'non salvata sul telefono: ' + testoErroreCoda(e) }, salvate: 0 };
  }
}

function etichettaSchedaCoda(famiglia, numero, nome) {
  const base = typeof etichettaFamigliaTecnica === 'function' ? etichettaFamigliaTecnica(famiglia) : famiglia;
  return base + ' – scheda ' + numero + (nome ? ' (' + nome + ')' : '');
}

if (typeof salvaRigaSchedaRilievo === 'function') {
  const salvaSchedaConRete = salvaRigaSchedaRilievo;
  // eslint-disable-next-line no-global-assign
  salvaRigaSchedaRilievo = async function(riga) {
    CODA.ultimoSalvataggioInCoda = false;
    if (!codaOfflineAmmessa() || !riga || !riga.progetto_tecnico_id) return salvaSchedaConRete.apply(this, arguments);
    if (!senzaRete()) {
      const r = await salvaSchedaConRete.apply(this, arguments);
      if (!r || !r.error || !erroreDiRete(r.error)) return r;
      return salvaSchedaRilievoInCoda(riga, true);
    }
    return salvaSchedaRilievoInCoda(riga, false);
  };
}

if (typeof dopoSalvataggioSchedaRilievo === 'function') {
  const dopoSalvataggioSenzaCoda = dopoSalvataggioSchedaRilievo;
  // eslint-disable-next-line no-global-assign
  dopoSalvataggioSchedaRilievo = async function() {
    const inCoda = CODA.ultimoSalvataggioInCoda;
    CODA.ultimoSalvataggioInCoda = false;
    const r = await dopoSalvataggioSenzaCoda.apply(this, arguments);
    if (inCoda) {
      toast('📤 Salvata sul telefono, non ancora inviata: parte da sola quando torna la rete', 'warn');
      decoraSchedaRilievoCoda();
    }
    return r;
  };
}

// Le schede in coda sopra quelle lette (o, senza rete, sopra quelle già in
// memoria): riaprendo il tab si vedono i dati salvati sul telefono.
async function sovrapponiCodaSchede(s) {
  if (!s || !s.elenco) return false;
  const coda = (await codaMie()).filter(function(x) {
    return x.tipo === 'scheda_rilievo' && x.multipla && x.progetto_id === s.progettoId && x.famiglia === s.famiglia;
  });
  if (!coda.length) {
    s.elenco.forEach(function(x) { delete x.in_coda; });
    return false;
  }
  coda.forEach(function(x) {
    const r = x.riga;
    const voce = { id: r.id, numero: r.numero, dati: r.dati, aggiornato_il: r.aggiornato_il, in_coda: true };
    const i = s.elenco.findIndex(function(y) { return y.id === r.id; });
    if (i >= 0) s.elenco[i] = Object.assign({}, s.elenco[i], voce);
    else if (!s.elenco.some(function(y) { return Number(y.numero) === Number(r.numero); })) s.elenco.push(voce);
  });
  s.elenco.sort(function(a, b) { return Number(a.numero) - Number(b.numero); });
  return true;
}

if (typeof leggiSchedaRilievo === 'function') {
  const leggiSchedaSenzaCoda = leggiSchedaRilievo;
  // eslint-disable-next-line no-global-assign
  leggiSchedaRilievo = async function(famiglia, numeroRichiesto) {
    const prec = schedaRilievoAperta;
    let r = await leggiSchedaSenzaCoda.apply(this, arguments);
    // Senza rete: si riparte da quello che c'era in memoria per lo stesso progetto e tipo
    if (r && r.error && erroreDiRete(r.error) && prec && prec.elenco &&
        prec.progettoId === currentRilievoProgettoId && prec.famiglia === famiglia) {
      const numero = Number(numeroRichiesto) || (prec.elenco.length ? Number(prec.elenco[0].numero) : 1);
      schedaRilievoAperta = {
        progettoId: prec.progettoId, famiglia: famiglia, numero: numero, elenco: prec.elenco, bozze: prec.bozze || {},
        nomeOriginale: '', modificata: false
      };
      r = { dati: {} };
    }
    const s = schedaRilievoAperta;
    if (r && !r.error && s && s.elenco && s.famiglia === famiglia && s.progettoId === currentRilievoProgettoId) {
      await sovrapponiCodaSchede(s);
      const salvata = s.elenco.find(function(x) { return Number(x.numero) === Number(s.numero); }) || null;
      const bozza = (s.bozze || {})[s.numero];
      s.nomeOriginale = String((salvata && salvata.dati && salvata.dati.nome_scheda) || '');
      r = { dati: bozza ? Object.assign({}, bozza.dati) : ((salvata && salvata.dati) || {}) };
    } else if (r && !r.error && s && !s.elenco && s.famiglia === famiglia) {
      // Senza sql/48: la scheda unica in coda
      const x = (await codaMie()).find(function(y) { return y.tipo === 'scheda_rilievo' && !y.multipla && y.progetto_id === s.progettoId && y.famiglia === famiglia; });
      if (x) { s.datiOriginali = x.riga.dati; r = { dati: x.riga.dati }; }
    }
    return r;
  };
}

async function inviaSchedaRilievoCoda(voce) {
  const riga = Object.assign({}, voce.riga);
  if (!voce.multipla) {
    const r = await db.from('progetti_tecnici_schede').upsert(riga, { onConflict: 'progetto_tecnico_id,famiglia' });
    if (r.error) throw r.error;
    return;
  }
  let r = null;
  for (let tentativo = 0; tentativo < 4; tentativo++) {
    // Upsert per id: rimandata dopo un invio a metà = la stessa riga
    r = await db.from('progetti_tecnici_schede').upsert(riga, { onConflict: 'id' });
    if (!r.error || r.error.code !== '23505') break;
    // Numero preso nel frattempo da un'altra scheda nuova: il primo libero
    const { data: ultima } = await db.from('progetti_tecnici_schede').select('numero')
      .eq('progetto_tecnico_id', riga.progetto_tecnico_id).eq('famiglia', riga.famiglia)
      .order('numero', { ascending: false }).limit(1).maybeSingle();
    riga.numero = (Number(ultima && ultima.numero) || 0) + 1;
  }
  if (r.error) throw r.error;
  if (riga.numero !== voce.riga.numero) {
    voce.avviso = 'arrivata come scheda ' + riga.numero + ' (la ' + voce.riga.numero + ' l’aveva già presa un altro)';
  }
}
registraTipoCodaOffline('scheda_rilievo', {
  icona: function() { return '📝'; },
  titolo: function(v) { return 'Scheda di rilievo: ' + (v.descrizione || etichettaSchedaCoda(v.famiglia, v.numero, '')); },
  invia: inviaSchedaRilievoCoda
});

// ── Invio ───────────────────────────────────────────────────────────
// soloErrori false = le righe in attesa; con riprova = anche quelle con errore
async function inviaCodaOffline(opz) {
  opz = opz || {};
  if (CODA.invio) return CODA.invio;
  CODA.invio = (async function() {
    if (!codaOfflineAmmessa()) return null;
    const giro = async function() { return giroInvioCoda(opz); };
    if (navigator.locks && typeof navigator.locks.request === 'function') {
      return navigator.locks.request('toli-coda-offline', { ifAvailable: true }, function(lock) { return lock ? giro() : null; });
    }
    return giro();
  })().finally(function() { CODA.invio = null; aggiornaBadgeCoda(); disegnaCodaOffline(); decoraSchedaRilievoCoda(); });
  return CODA.invio;
}

async function giroInvioCoda(opz) {
  let voci = await codaMie();
  if (opz.riprova) {
    for (const x of voci) if (x.stato === 'errore') { x.stato = 'in_attesa'; await codaMetti(x); }
  }
  voci = voci.filter(function(x) { return x.stato !== 'errore'; });
  if (!voci.length || senzaRete()) return { inviate: 0 };
  // Sessione valida (si rinnova qui se il token è scaduto mentre si era senza rete)
  const { data, error } = await db.auth.getSession();
  if (error && erroreDiRete(error)) return { inviate: 0 };
  if (!data || !data.session) { CODA.serveAccesso = true; return { inviate: 0, accesso: true }; }
  CODA.serveAccesso = false;
  let inviate = 0, errori = 0;
  const avvisi = [];
  for (const voce of voci) {
    const tipo = CODA.tipi[voce.tipo];
    if (!tipo) continue;
    try {
      await tipo.invia(voce);
      await codaTogli(voce.id);
      inviate++;
      if (voce.avviso) avvisi.push(voce.avviso);
    } catch (e) {
      if (erroreDiRete(e) || erroreDiAccesso(e)) {
        if (erroreDiAccesso(e)) CODA.serveAccesso = true;
        break; // si riprova più tardi, nello stesso ordine
      }
      voce.stato = 'errore';
      voce.errore = testoErroreInvioCoda(voce, e);
      voce.tentativi = (voce.tentativi || 0) + 1;
      voce.errore_il = new Date().toISOString();
      try { await codaMetti(voce); } catch (x) { /* niente */ }
      errori++;
    }
  }
  if (inviate || errori) {
    toast((inviate ? '📤 Inviate ' + inviate + (inviate === 1 ? ' cosa salvata' : ' cose salvate') + ' sul telefono' : '') +
      (avvisi.length ? ' (' + avvisi.join('; ') + ')' : '') +
      (errori ? (inviate ? '. ' : '') + '⚠️ ' + errori + ' non inviate: tocca 📤 nel menu' : ''), errori ? 'err' : 'ok');
    if (inviate) aggiornaPagineDopoInvio();
  }
  return { inviate: inviate, errori: errori };
}

function testoErroreInvioCoda(voce, e) {
  let t = '';
  if (voce.tipo === 'scheda_rilievo' && typeof testoErroreSchedaMotore === 'function') t = testoErroreSchedaMotore(e);
  else if (voce.tipo === 'file_progetto' && typeof testoErroreFileProgetto === 'function') t = testoErroreFileProgetto(e);
  return t || testoErroreCoda(e);
}

// Dopo l'invio: la scheda aperta e la scheda progetto rileggono dal database
function aggiornaPagineDopoInvio() {
  try {
    const s = schedaRilievoAperta;
    if (s && s.elenco && !s.modificata && !Object.keys(s.bozze || {}).length && ge('m-rilievo-tecnico') && ge('m-rilievo-tecnico').classList.contains('on')) {
      sovrapponiCodaSchede(s).then(decoraSchedaRilievoCoda);
    }
    if (typeof currentProgettoTecnicoId !== 'undefined' && currentProgettoTecnicoId && ge('pd-schede-content') &&
        typeof renderSchedeProgettoCommerciale === 'function' && !(ge('m-rilievo-tecnico') && ge('m-rilievo-tecnico').classList.contains('on'))) {
      renderSchedeProgettoCommerciale(currentProgettoTecnicoId).catch(function() {});
    }
  } catch (e) { /* niente */ }
}

function preparaInterfacciaCoda() {
  preparaBadgeCoda();
  aggiornaBarraRete();
  aggiornaBadgeCoda();
  if (CODA.ascolto) return;
  CODA.ascolto = true;
  window.addEventListener('online', function() {
    aggiornaBarraRete();
    setTimeout(function() { inviaCodaOffline(); }, 1500);
  });
  window.addEventListener('offline', function() { aggiornaBarraRete(); aggiornaBadgeCoda(); });
  document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'visible') inviaCodaOffline(); });
}

function avviaCodaOffline() {
  preparaInterfacciaCoda();
  if (CODA.avviata) { inviaCodaOffline(); return; }
  CODA.avviata = true;
  CODA.timer = setInterval(function() { if (!senzaRete()) inviaCodaOffline(); }, CODA_RIPROVA_MS);
  // Chi lavora fuori sede: il browser non cancelli da solo i dati del telefono
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function() {}); } catch (e) { /* niente */ }
  osservaSchedaRilievoCoda();
  aggiornaBadgeCoda();
  inviaCodaOffline();
  setTimeout(mostraAvvisoInstallaOffline, 2500);
}

// ── Menu, barra e finestra ──────────────────────────────────────────
function preparaBadgeCoda() {
  const nr = document.querySelector('#nav .nr');
  if (!nr || ge('nav-coda')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'nav-coda';
  b.className = 'nav-avvisi nav-coda';
  b.style.display = 'none';
  b.title = 'Salvato sul telefono, non ancora inviato';
  b.setAttribute('aria-label', 'Invii in attesa');
  b.onclick = function() { apriCodaOffline(); };
  nr.insertBefore(b, nr.firstChild);
}

async function aggiornaBadgeCoda() {
  const b = ge('nav-coda');
  if (!b) return;
  const voci = await codaMie();
  const errori = voci.filter(function(x) { return x.stato === 'errore'; }).length;
  if (!voci.length && !senzaRete()) { b.style.display = 'none'; return; }
  b.style.display = '';
  b.classList.toggle('urgenti', errori > 0);
  b.classList.toggle('con-avvisi', voci.length > 0);
  b.innerHTML = (senzaRete() ? '📴' : '📤') + '<span class="nav-avvisi-n">' + voci.length + '</span>';
  b.title = senzaRete() ? 'Senza rete' + (voci.length ? ': ' + voci.length + ' da inviare' : '') : voci.length + ' da inviare' + (errori ? ' (' + errori + ' con errore)' : '');
}

function aggiornaBarraRete() {
  let el = ge('coda-rete');
  if (!el) {
    if (!utenteCoda()) return;
    el = document.createElement('div');
    el.id = 'coda-rete';
    el.className = 'coda-rete';
    el.setAttribute('role', 'status');
    document.body.insertBefore(el, document.body.firstChild);
  }
  if (senzaRete()) {
    el.innerHTML = '📴 <b>Senza rete.</b> Schede di rilievo e loro foto si salvano sul telefono e partono da sole quando torna la rete. Il resto si vede com’era l’ultima volta.';
    el.style.display = 'block';
  } else if (CODA.avvioSenzaRete) {
    el.innerHTML = '✅ <b>La rete è tornata.</b> <button type="button" class="btn sm p" onclick="aggiornaDopoRete()">↻ Aggiorna i dati</button>';
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

async function aggiornaDopoRete() {
  await inviaCodaOffline();
  const resta = (await codaMie()).filter(function(x) { return x.stato !== 'errore'; }).length;
  if (resta) { toast('Prima finisce di inviare quello che è sul telefono: riprova tra poco', 'warn'); return; }
  location.reload();
}

function dataOraCoda(iso) {
  try { return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}

async function apriCodaOffline() {
  openM('m-coda-offline');
  await disegnaCodaOffline();
}

async function disegnaCodaOffline() {
  const box = ge('cof-elenco');
  if (!box || !(ge('m-coda-offline') && ge('m-coda-offline').classList.contains('on'))) return;
  const voci = await codaMie();
  const stato = ge('cof-stato');
  if (stato) {
    stato.className = 'al2 ' + (senzaRete() ? 'w' : 'i');
    stato.innerHTML = senzaRete()
      ? '📴 Senza rete: quello che vedi qui parte da solo quando torna la rete (non serve tenere aperta questa finestra).'
      : (CODA.serveAccesso ? '🔑 Per inviare serve rientrare: premi <b>Esci</b> e accedi di nuovo (quello che è qui non si perde).'
        : (voci.length ? 'Rete presente: l’invio parte da solo; puoi anche premere <b>📤 Invia ora</b>.' : '✓ Niente da inviare: tutto è arrivato.'));
  }
  const iphone = ge('cof-iphone');
  if (iphone) iphone.style.display = (dispositivoIOSCoda() && !appInstallataCoda()) ? '' : 'none';
  if (!voci.length) { box.innerHTML = '<div style="font-size:13px;color:var(--m)">Nessuna cosa in attesa di invio.</div>'; return; }
  box.innerHTML = voci.map(function(x) {
    const tipo = CODA.tipi[x.tipo] || {};
    const icona = tipo.icona ? tipo.icona(x) : '📦';
    const titolo = tipo.titolo ? tipo.titolo(x) : x.tipo;
    const errore = x.stato === 'errore';
    return '<div class="card" style="margin-bottom:8px;padding:10px 12px' + (errore ? ';border-left:4px solid var(--r)' : '') + '">' +
      '<div style="font-size:13px;font-weight:600;overflow-wrap:anywhere">' + icona + ' ' + esc(titolo) + '</div>' +
      '<div style="font-size:12px;color:var(--m);margin-top:2px">' + (x.titolo_progetto ? 'Progetto «' + esc(x.titolo_progetto) + '» · ' : '') +
        'salvato sul telefono il ' + esc(dataOraCoda(x.creato_il)) + '</div>' +
      (errore
        ? '<div style="font-size:12px;color:var(--r);margin-top:4px">⚠️ Non inviato: ' + esc(x.errore) + '</div>' +
          '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button type="button" class="btn sm p" onclick="riprovaCodaOffline()">↻ Riprova</button>' +
          '<button type="button" class="btn sm" onclick="togliVoceCodaOffline(\'' + esc(x.id) + '\')">🗑️ Togli</button></div>'
        : '<div style="font-size:12px;color:#b45309;margin-top:4px">⏳ Non ancora inviato</div>') +
      '</div>';
  }).join('');
}

async function riprovaCodaOffline() {
  if (senzaRete()) { toast('Senza rete: parte da solo quando torna', 'warn'); return; }
  await inviaCodaOffline({ riprova: true });
}

async function inviaOraCodaOffline() {
  if (senzaRete()) { toast('Senza rete: parte da solo quando torna', 'warn'); return; }
  const r = await inviaCodaOffline({ riprova: true });
  if (r && r.accesso) toast('Per inviare serve rientrare: Esci e accedi di nuovo', 'err');
  else if (!(await codaMie()).length) toast('✓ Tutto inviato', 'ok');
}

async function togliVoceCodaOffline(id) {
  const voce = await codaPrendi(id);
  if (!voce) return;
  const tipo = CODA.tipi[voce.tipo] || {};
  if (!confirm('Togliere «' + (tipo.titolo ? tipo.titolo(voce) : voce.tipo) + '» dal telefono?\n\nNon è arrivato al gestionale: togliendolo si perde.' +
    (voce.tipo === 'file_progetto' ? ' Se la scheda lo usa, salvala di nuovo senza questo file.' : ''))) return;
  await codaTogli(id);
  aggiornaBadgeCoda();
  disegnaCodaOffline();
  decoraSchedaRilievoCoda();
}

// 📤 sui tab della scheda di rilievo aperta e riga in cima
function decoraSchedaRilievoCoda() {
  const s = typeof schedaRilievoAperta !== 'undefined' ? schedaRilievoAperta : null;
  const box = ge('mrt-content');
  if (!box) return;
  const inCoda = (s && s.elenco ? s.elenco : []).filter(function(x) { return x.in_coda; }).map(function(x) { return Number(x.numero); });
  inCoda.forEach(function(n) {
    const tab = ge('rsm-tab-' + n);
    if (tab && !tab.querySelector('.coda-tab')) tab.insertAdjacentHTML('beforeend', ' <span class="coda-tab" title="Salvata sul telefono, non ancora inviata">📤</span>');
  });
  box.querySelectorAll('.coda-tab').forEach(function(el) {
    const n = Number(String((el.parentNode && el.parentNode.id) || '').replace('rsm-tab-', ''));
    if (!inCoda.includes(n)) el.remove();
  });
  let riga = ge('coda-scheda-avviso');
  const aperta = s && inCoda.includes(Number(s.numero));
  if (!aperta) { if (riga) riga.remove(); return; }
  if (!riga) {
    riga = document.createElement('div');
    riga.id = 'coda-scheda-avviso';
    riga.className = 'al2 w';
    riga.style.marginBottom = '10px';
    box.insertBefore(riga, box.firstChild);
  }
  riga.innerHTML = '📤 <b>Salvata sul telefono, non ancora inviata.</b> Parte da sola quando torna la rete (con le sue foto). <a href="#" onclick="apriCodaOffline();return false">Vedi cosa è in attesa</a>';
}

function osservaSchedaRilievoCoda() {
  const box = ge('mrt-content');
  if (!box || typeof MutationObserver !== 'function' || box.dataset.codaOsservata) return;
  box.dataset.codaOsservata = '1';
  let attesa = null;
  new MutationObserver(function() {
    clearTimeout(attesa);
    attesa = setTimeout(decoraSchedaRilievoCoda, 60);
  }).observe(box, { childList: true });
}

// ── iPhone: installa l'app ──────────────────────────────────────────
function dispositivoIOSCoda() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function appInstallataCoda() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
function mostraAvvisoInstallaOffline() {
  const u = utenteCoda();
  if (!u || !dispositivoIOSCoda() || appInstallataCoda()) return;
  const chiave = CHIAVE_INSTALLA_OFFLINE + u.id;
  try {
    const chiuso = Number(localStorage.getItem(chiave) || 0);
    if (chiuso && Date.now() - chiuso < 7 * 24 * 3600 * 1000) return;
  } catch (e) { /* niente */ }
  const invitoPush = ge('push-invito');
  if (invitoPush && invitoPush.style.display !== 'none') return; // c'è già l'invito delle notifiche
  let el = ge('coda-installa');
  if (!el) {
    el = document.createElement('div');
    el.id = 'coda-installa';
    el.className = 'push-invito';
    el.setAttribute('role', 'dialog');
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="pin-testo"><b>📲 Installa l’app sull’iPhone</b><br>Senza campo le schede di rilievo e le foto restano sul telefono e partono da sole quando torna la rete. ' +
    'Ma Safari <b>cancella i dati</b> delle pagine non installate dopo 7 giorni senza usarle, anche quelli non ancora inviati. ' +
    'Tocca <b>Condividi</b> ⬆️ in Safari → <b>Aggiungi alla schermata Home</b> e apri Toli Fire dall’icona.</div>' +
    '<div class="pin-azioni"><button type="button" class="btn sm p" onclick="chiudiAvvisoInstallaOffline()">Ho capito</button></div>';
  el.style.display = 'flex';
}
function chiudiAvvisoInstallaOffline() {
  const u = utenteCoda();
  try { if (u) localStorage.setItem(CHIAVE_INSTALLA_OFFLINE + u.id, String(Date.now())); } catch (e) { /* niente */ }
  const el = ge('coda-installa');
  if (el) el.style.display = 'none';
}
