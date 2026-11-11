// js/70-foto-bozza-progetto.js — Foto scelte nella finestra del progetto
// tecnico tenute sul telefono insieme alla bozza (richiesta di Erika
// dell'11/11, NESSUN SQL). Caricato dopo js/57 (cifratura e "Entra come").
//
// Il problema: sul telefono, aprendo la fotocamera o la galleria, iOS e
// Android con poca memoria a volte ricaricano la pagina; un tocco fuori dalla
// finestra la chiude; scegliere di nuovo dallo stesso campo SOSTITUIVA le
// foto già scelte. La bozza del testo (js/17) tornava, le foto no.
//
// Cosa fa: le foto e i file scelti in mp-file e mp-file-extra
//  - si sommano (scegliere di nuovo AGGIUNGE, non sostituisce; la stessa foto
//    due volte non si ripete) e ognuno ha la sua ✖ sulla miniatura;
//  - si tengono sul telefono in IndexedDB (toli-foto-bozze), CIFRATI con una
//    chiave AES-GCM non esportabile della persona (come le letture di
//    F15.12, ma legata alla persona e non alla sessione: un nuovo accesso
//    dopo la sessione scaduta non le perde), sotto la stessa chiave della
//    bozza del testo (chiaveBozzaProgetto: progetto, oppure "nuovo" del
//    cliente) scritta come impronta SHA-256; nome, tipo e campo del file sono
//    dentro la parte cifrata (in chiaro solo id casuale, persona, ordine, data);
//  - riaprendo la finestra dello stesso progetto (o "Nuovo progetto" dello
//    stesso cliente) ricompaiono con l'anteprima e contano come scelte;
//  - si tolgono dal telefono una per una appena arrivano nel progetto (o se
//    erano già tra i file del progetto); se il caricamento si ferma a metà
//    le altre restano per il prossimo "Salva";
//  - "Esci" e un'altra persona sul telefono le cancellano (svuotaCacheDatiOffline);
//    mai le foto di un'altra persona (righe con utente_id, filtro in lettura);
//    con "Entra come" niente telefono (solo in memoria, come prima);
//  - dopo 7 giorni si tolgono da sole.
// Senza IndexedDB o crypto.subtle: le foto restano solo in memoria (si
// sommano e hanno la ✖ lo stesso).
//
// Interfaccia per js/17:
//   prendiFileSceltiProgetto()        → sposta i file degli input nell'elenco
//   elencoFileSceltiProgetto()        → [{ id, campo, file, sulTelefono }]
//   fileSceltiProgetto(campo)         → File[] ('obbligatori' | 'extra' | tutti)
//   togliFileSceltoProgetto(id)       → ✖ sulla miniatura
//   apriFotoBozzaProgetto(chiave)     → all'apertura della finestra
//   fileProgettoArrivato(file)        → dopo il caricamento (o doppione)
//   spostaFotoBozzaProgetto(da, a)    → progetto nuovo creato, foto rimaste
//   svuotaFotoBozzaProgetto(chiave)   → salvataggio riuscito

const FOTO_BOZZA = { db: null, chiave: null, chiaveDi: '', inCreazione: null, inCreazioneDi: '', bozza: null, voci: [], apertura: 0, contatore: 0 };
const FOTO_BOZZA_NOME_DB = 'toli-foto-bozze';
const FOTO_BOZZA_VALIDE_MS = 7 * 24 * 3600 * 1000;
const FOTO_BOZZA_CAMPI = { 'mp-file': 'obbligatori', 'mp-file-extra': 'extra' };

function utenteFotoBozza() {
  try { return typeof utenteCoda === 'function' ? utenteCoda() : null; } catch (e) { return null; }
}
function fotoBozzaSulTelefono() {
  return !!(window.crypto && window.crypto.subtle && 'indexedDB' in window &&
    typeof codaOfflineAmmessa === 'function' && codaOfflineAmmessa() &&
    typeof cifraLettura === 'function' && typeof decifraLettura === 'function' && typeof improntaLettura === 'function');
}

// ── IndexedDB ───────────────────────────────────────────────────────
function apriDbFotoBozza() {
  if (FOTO_BOZZA.db) return FOTO_BOZZA.db;
  FOTO_BOZZA.db = new Promise(function(ok, ko) {
    const r = indexedDB.open(FOTO_BOZZA_NOME_DB, 2);
    r.onupgradeneeded = function() {
      const d = r.result;
      // Versione 1 (11/11, mai pubblicata): nome e bozza in chiaro, si rifà
      if (d.objectStoreNames.contains('foto') && r.oldVersion < 2) d.deleteObjectStore('foto');
      if (!d.objectStoreNames.contains('foto')) d.createObjectStore('foto', { keyPath: 'id' }).createIndex('per_bozza', 'bozza');
      if (!d.objectStoreNames.contains('chiavi')) d.createObjectStore('chiavi', { keyPath: 'utente_id' });
    };
    r.onsuccess = function() { ok(r.result); };
    r.onerror = function() { ko(r.error); };
  });
  FOTO_BOZZA.db.catch(function() { FOTO_BOZZA.db = null; });
  return FOTO_BOZZA.db;
}
async function operazioneFotoBozza(archivio, modo, fn) {
  const d = await apriDbFotoBozza();
  return new Promise(function(ok, ko) {
    const t = d.transaction(archivio, modo);
    let esito;
    const req = fn(t.objectStore(archivio));
    if (req) req.onsuccess = function() { esito = req.result; };
    t.oncomplete = function() { ok(esito); };
    t.onerror = function() { ko(t.error || (req && req.error)); };
    t.onabort = function() { ko(t.error || new Error('Salvataggio sul telefono annullato')); };
  });
}

// Chiave della persona (non esportabile): nasce alla prima foto, sparisce con "Esci"
// Una sola creazione alla volta (come LETTURE.inCreazione di js/57): più foto
// scelte insieme chiedono la chiave in parallelo e devono avere la STESSA
function chiaveFotoBozza() {
  const u = utenteFotoBozza();
  if (!u) return Promise.resolve(null);
  if (FOTO_BOZZA.chiave && FOTO_BOZZA.chiaveDi === u.id) return Promise.resolve(FOTO_BOZZA.chiave);
  if (FOTO_BOZZA.inCreazione && FOTO_BOZZA.inCreazioneDi === u.id) return FOTO_BOZZA.inCreazione;
  FOTO_BOZZA.inCreazioneDi = u.id;
  FOTO_BOZZA.inCreazione = (async function() {
    let rec = await operazioneFotoBozza('chiavi', 'readonly', function(s) { return s.get(u.id); });
    if (!rec || !rec.chiave) {
      // Un'altra persona prima: le sue foto e la sua chiave non servono più
      await operazioneFotoBozza('foto', 'readwrite', function(s) { return s.clear(); });
      const chiave = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      rec = { utente_id: u.id, chiave: chiave, creata_il: Date.now() };
      await operazioneFotoBozza('chiavi', 'readwrite', function(s) { s.clear(); return s.put(rec); });
    }
    return rec.chiave;
  })().then(function(k) { FOTO_BOZZA.chiave = k; FOTO_BOZZA.chiaveDi = u.id; return k; })
    .finally(function() { FOTO_BOZZA.inCreazione = null; FOTO_BOZZA.inCreazioneDi = ''; });
  return FOTO_BOZZA.inCreazione;
}

// Chiave della riga della bozza sul telefono: impronta SHA-256 (come F15.12),
// niente id di progetti o clienti in chiaro
async function bozzaCifrata(bozza) {
  const u = utenteFotoBozza();
  if (!bozza || !u || typeof improntaLettura !== 'function') return null;
  return improntaLettura('foto-bozza|' + u.id + '|' + bozza);
}

// Contenuto cifrato = 4 byte di lunghezza + JSON (nome, tipo, campo, data) + file
async function impacchettaFotoBozza(voce) {
  const meta = TESTO_CIFRA.encode(JSON.stringify({
    nome: voce.file.name, tipo: voce.file.type || '', campo: voce.campo, modificato: voce.file.lastModified || Date.now()
  }));
  const dati = new Uint8Array(await voce.file.arrayBuffer());
  const out = new Uint8Array(4 + meta.length + dati.length);
  new DataView(out.buffer).setUint32(0, meta.length);
  out.set(meta, 4);
  out.set(dati, 4 + meta.length);
  return out.buffer;
}
function spacchettaFotoBozza(buf) {
  const b = new Uint8Array(buf);
  const n = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0);
  const meta = JSON.parse(TESTO_DECIFRA.decode(b.subarray(4, 4 + n)));
  return { meta: meta, dati: b.slice(4 + n) };
}

async function metteFotoBozzaSulTelefono(voce) {
  if (!fotoBozzaSulTelefono() || !voce.bozza) return false;
  const u = utenteFotoBozza();
  try {
    const chiave = await chiaveFotoBozza();
    const bozza = await bozzaCifrata(voce.bozza);
    if (!chiave || !bozza) return false;
    const cif = await cifraLettura(chiave, 'foto-bozza|' + voce.id, await impacchettaFotoBozza(voce));
    await operazioneFotoBozza('foto', 'readwrite', function(s) {
      return s.put({ id: voce.id, utente_id: u.id, bozza: bozza, ordine: voce.ordine, salvata_il: Date.now(), iv: cif.iv, dati: cif.dati });
    });
    voce.sulTelefono = true;
    return true;
  } catch (e) {
    console.warn('Foto della bozza non tenuta sul telefono:', e && e.message);
    if (e && e.name === 'QuotaExceededError') toast('Spazio sul telefono finito: la foto resta scelta, ma se la pagina si ricarica va rimessa', 'warn');
    return false;
  }
}

async function togliFotoBozzaDalTelefono(id) {
  if (!('indexedDB' in window)) return;
  try { await operazioneFotoBozza('foto', 'readwrite', function(s) { return s.delete(id); }); } catch (e) { /* niente */ }
}

async function righeFotoBozza(bozza) {
  const u = utenteFotoBozza();
  if (!u || !('indexedDB' in window)) return [];
  let righe = [];
  try {
    const k = await bozzaCifrata(bozza);
    if (!k) return [];
    righe = (await operazioneFotoBozza('foto', 'readonly', function(s) { return s.index('per_bozza').getAll(k); })) || [];
  } catch (e) { return []; }
  return righe.filter(function(r) { return r.utente_id === u.id; });
}

// ── Elenco in memoria ───────────────────────────────────────────────
function nuovoIdFotoBozza() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  FOTO_BOZZA.contatore++;
  return 'f' + Date.now() + '_' + FOTO_BOZZA.contatore + '_' + Math.random().toString(36).slice(2);
}
function stessoFile(a, b) {
  return a.name === b.name && a.size === b.size && (a.lastModified || 0) === (b.lastModified || 0);
}

function elencoFileSceltiProgetto() {
  return FOTO_BOZZA.voci.slice().sort(function(a, b) {
    return (a.campo === b.campo ? 0 : (a.campo === 'obbligatori' ? -1 : 1)) || a.ordine - b.ordine;
  });
}
function fileSceltiProgetto(campo) {
  return elencoFileSceltiProgetto().filter(function(x) { return !campo || x.campo === campo; })
    .map(function(x) { return x.file; });
}

// I file appena scelti negli input passano nell'elenco (e sul telefono);
// l'input si svuota, così scegliere di nuovo AGGIUNGE
function prendiFileSceltiProgetto() {
  let doppi = 0;
  Object.keys(FOTO_BOZZA_CAMPI).forEach(function(idInput) {
    const el = ge(idInput);
    if (!el || !el.files || !el.files.length) return;
    const campo = FOTO_BOZZA_CAMPI[idInput];
    Array.from(el.files).forEach(function(file) {
      if (FOTO_BOZZA.voci.some(function(x) { return stessoFile(x.file, file); })) { doppi++; return; }
      const voce = { id: nuovoIdFotoBozza(), campo: campo, file: file, ordine: Date.now() * 100 + (FOTO_BOZZA.contatore++ % 100), bozza: FOTO_BOZZA.bozza, sulTelefono: false };
      FOTO_BOZZA.voci.push(voce);
      voce.salvataggio = metteFotoBozzaSulTelefono(voce);
      voce.salvataggio.then(function(ok) { if (ok) ridisegnaFileSceltiDopo(); });
    });
    try { el.value = ''; } catch (e) { /* niente */ }
  });
  if (doppi) toast(doppi === 1 ? 'Questo file era già tra quelli scelti' : doppi + ' file erano già tra quelli scelti', 'info');
}

// Dopo il salvataggio sul telefono: "📱 sul telefono" sulle miniature
function ridisegnaFileSceltiDopo() {
  clearTimeout(FOTO_BOZZA.timerDisegno);
  FOTO_BOZZA.timerDisegno = setTimeout(function() {
    const m = ge('m-progetto');
    if (m && m.classList.contains('on') && typeof anteprimaFileProgetto === 'function') anteprimaFileProgetto();
  }, 150);
}

async function togliFileSceltoProgetto(id) {
  const voce = FOTO_BOZZA.voci.find(function(x) { return x.id === id; });
  if (!voce) return;
  if (!confirm('Togliere «' + voce.file.name + '» dai file scelti?')) return;
  FOTO_BOZZA.voci = FOTO_BOZZA.voci.filter(function(x) { return x.id !== id; });
  try { await voce.salvataggio; } catch (e) { /* niente */ }
  await togliFotoBozzaDalTelefono(id);
  if (typeof anteprimaFileProgetto === 'function') anteprimaFileProgetto();
}

// Il file è arrivato nel progetto (o c'era già): fuori dall'elenco e dal telefono
async function fileProgettoArrivato(file) {
  const voce = FOTO_BOZZA.voci.find(function(x) { return x.file === file; });
  if (!voce) return;
  FOTO_BOZZA.voci = FOTO_BOZZA.voci.filter(function(x) { return x !== voce; });
  try { await voce.salvataggio; } catch (e) { /* niente */ }
  await togliFotoBozzaDalTelefono(voce.id);
}

// Progetto nuovo creato ma non tutte le foto sono arrivate: restano sotto il progetto
async function spostaFotoBozzaProgetto(da, a) {
  FOTO_BOZZA.bozza = a;
  for (const voce of FOTO_BOZZA.voci) {
    try { await voce.salvataggio; } catch (e) { /* niente */ }
    voce.bozza = a;
  }
  if (!('indexedDB' in window)) return;
  const nuova = await bozzaCifrata(a);
  for (const r of await righeFotoBozza(da)) {
    const resta = FOTO_BOZZA.voci.some(function(x) { return x.id === r.id; });
    try {
      await operazioneFotoBozza('foto', 'readwrite', function(s) {
        if (!resta || !nuova) return s.delete(r.id);
        r.bozza = nuova;
        return s.put(r);
      });
    } catch (e) { /* niente */ }
  }
}

async function svuotaFotoBozzaProgetto(chiave) {
  if (!chiave) return;
  if (FOTO_BOZZA.bozza === chiave) FOTO_BOZZA.voci = [];
  for (const r of await righeFotoBozza(chiave)) await togliFotoBozzaDalTelefono(r.id);
}

// All'apertura della finestra: elenco vuoto, poi le foto tenute sul telefono
// per questa bozza (anteprima subito vuota, poi con le foto riprese)
async function apriFotoBozzaProgetto(chiave) {
  const giro = ++FOTO_BOZZA.apertura;
  FOTO_BOZZA.bozza = chiave || null;
  FOTO_BOZZA.voci = [];
  FOTO_BOZZA.riprese = 0;
  if (typeof anteprimaFileProgetto === 'function') anteprimaFileProgetto();
  if (!chiave || !fotoBozzaSulTelefono()) return 0;
  const righe = (await righeFotoBozza(chiave)).sort(function(a, b) { return a.ordine - b.ordine; });
  if (!righe.length) return 0;
  let chiaveCif = null;
  try { chiaveCif = await chiaveFotoBozza(); } catch (e) { chiaveCif = null; }
  if (!chiaveCif) return 0; // telefono non leggibile ora: le foto restano dove sono
  const voci = [];
  let illeggibili = 0;
  for (const r of righe) {
    if (Date.now() - (r.salvata_il || 0) > FOTO_BOZZA_VALIDE_MS) { await togliFotoBozzaDalTelefono(r.id); continue; }
    try {
      const x = spacchettaFotoBozza(await decifraLettura(chiaveCif, 'foto-bozza|' + r.id, r.iv, r.dati));
      const file = new File([x.dati], x.meta.nome, { type: x.meta.tipo, lastModified: x.meta.modificato });
      voci.push({ id: r.id, campo: x.meta.campo === 'extra' ? 'extra' : 'obbligatori', file: file, ordine: r.ordine, bozza: chiave, sulTelefono: true, salvataggio: Promise.resolve(true) });
    } catch (e) {
      // Chiave cambiata o riga rovinata: la foto non si può più leggere (si dice)
      illeggibili++;
      console.warn('Foto della bozza illeggibile:', e && e.message);
      await togliFotoBozzaDalTelefono(r.id);
    }
  }
  if (illeggibili) {
    toast((illeggibili === 1 ? '1 foto scelta prima non si può più leggere' : illeggibili + ' foto scelte prima non si possono più leggere') +
      ' dal telefono: vanno scelte di nuovo', 'warn');
  }
  if (giro !== FOTO_BOZZA.apertura) return 0; // nel frattempo si è aperta un'altra finestra
  // Se nel frattempo si è scelto qualcosa, le riprese vanno prima
  FOTO_BOZZA.voci = voci.concat(FOTO_BOZZA.voci.filter(function(x) { return !voci.some(function(y) { return y.id === x.id; }); }));
  FOTO_BOZZA.riprese = voci.length;
  if (typeof anteprimaFileProgetto === 'function') anteprimaFileProgetto();
  return voci.length;
}

// ── Esci e un'altra persona: via foto e chiave ──────────────────────
async function svuotaTutteFotoBozza() {
  FOTO_BOZZA.voci = []; FOTO_BOZZA.chiave = null; FOTO_BOZZA.chiaveDi = '';
  if (!('indexedDB' in window)) return;
  for (const a of ['foto', 'chiavi']) {
    try { await operazioneFotoBozza(a, 'readwrite', function(s) { return s.clear(); }); } catch (e) { /* niente */ }
  }
}
async function contaFotoBozzaMie() {
  const u = utenteFotoBozza();
  if (!u || !('indexedDB' in window)) return 0;
  try {
    const tutte = (await operazioneFotoBozza('foto', 'readonly', function(s) { return s.getAll(); })) || [];
    return tutte.filter(function(r) { return r.utente_id === u.id; }).length;
  } catch (e) { return 0; }
}

if (typeof svuotaCacheDatiOffline === 'function') {
  const svuotaCacheSenzaFoto = svuotaCacheDatiOffline;
  // eslint-disable-next-line no-global-assign
  svuotaCacheDatiOffline = async function() {
    const r = await svuotaCacheSenzaFoto.apply(this, arguments);
    await svuotaTutteFotoBozza();
    return r;
  };
}

if (typeof doLogout === 'function') {
  const doLogoutConFoto = doLogout;
  // eslint-disable-next-line no-global-assign
  doLogout = async function() {
    const n = await contaFotoBozzaMie();
    if (n && !confirm((n === 1 ? 'C\'è 1 foto scelta' : 'Ci sono ' + n + ' foto scelte') +
      ' per un progetto tecnico non ancora salvato.\n\nUscendo si tolgono dal telefono. Uscire lo stesso?')) return;
    return doLogoutConFoto.apply(this, arguments);
  };
}

// Pulizia delle foto più vecchie di 7 giorni, poco dopo l'avvio
setTimeout(function() {
  if (!('indexedDB' in window)) return;
  operazioneFotoBozza('foto', 'readwrite', function(s) {
    const cur = s.openCursor();
    cur.onsuccess = function() {
      const c = cur.result;
      if (!c) return;
      if (Date.now() - (c.value.salvata_il || 0) > FOTO_BOZZA_VALIDE_MS) c.delete();
      c.continue();
    };
    return null;
  }).catch(function() { /* niente */ });
}, 6000);
