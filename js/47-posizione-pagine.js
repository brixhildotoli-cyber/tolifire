// =====================================================================
// js/47-posizione-pagine.js — tornare indietro senza perdere il punto
// ---------------------------------------------------------------------
// Richiesta di Erika (30/10): su una pagina con un elenco lungo (Progetti,
// Clienti, Preventivi, Commesse, Interventi...) si apre una scheda e,
// tornando indietro, la pagina deve ripartire dal punto in cui si era,
// non dalla prima scheda in cima.
//
// Come funziona, per tutte le pagine e senza toccare i singoli moduli:
// - a ogni cambio di pagina (gotoPage) si ricorda quanto era scorsa la
//   pagina che si lascia;
// - se la pagina in cui si arriva è quella da cui si era venuti (cioè si
//   torna indietro: bottone "←", "Torna", oppure il menu verso la pagina
//   appena precedente), la posizione ricordata viene rimessa;
// - gli elenchi si ricaricano dal database: la posizione si rimette man
//   mano che la pagina si allunga, per al massimo 3 secondi, e ci si ferma
//   subito se l'utente scorre o tocca lo schermo;
// - andando avanti (menu verso un'altra pagina, apertura di una scheda)
//   la pagina nuova parte dall'alto, come prima.
// Va caricato per ultimo prima di 19-init: avvolge gotoPage già avvolta
// dagli altri moduli (js/41, js/46).
// =====================================================================

const posizioniPagine = {};      // id pagina → scrollY quando la si è lasciata
const sezioniPagine = {};        // id pagina → sezioni (<details>) aperte quando la si è lasciata
const cronologiaPagine = [];     // pagine visitate, l'ultima è quella aperta
let rimessaPosizioneAttiva = null;

// La posizione la rimette il sito: il telefono non deve spostare la pagina
// per conto suo tornando indietro (segnalazione di Erika del 17/11).
try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}

function paginaApertaId() {
  const pagina = document.querySelector('.page.on');
  return pagina && pagina.id ? pagina.id.replace(/^pg-/, '') : null;
}

// ── Sezioni aperte (<details>) — segnalazione di Erika del 17/11 ──────
// Tornando indietro la pagina si ridisegna dal database con le sezioni
// chiuse: la pagina è più corta e il punto in cui si era non c'è più
// (si ripartiva dall'alto). Si ricorda quali sezioni erano aperte e si
// riaprono, man mano che la pagina si ridisegna, prima di rimettere il punto.
// Una sezione si riconosce dal riquadro con id che la contiene e dal titolo
// (senza i numeri, che cambiano: "Fermi (3)" = "Fermi (4)").
function chiaviSezioni(pagina) {
  const pg = pagina ? ge('pg-' + pagina) : null;
  if (!pg) return [];
  const viste = {};
  return Array.from(pg.querySelectorAll('details')).map(function(d) {
    const contenitore = d.parentElement ? d.parentElement.closest('[id]') : null;
    const titolo = d.querySelector('summary');
    // Le cartelle dei presidi hanno già un nome loro (data-cartella, js/09 e js/24)
    const nome = d.getAttribute('data-cartella') || d.getAttribute('data-cartella-scadenze');
    let chiave = (contenitore ? contenitore.id : '') + '|' + (nome ? 'c:' + nome :
      (titolo ? titolo.textContent : '').replace(/[0-9]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80));
    viste[chiave] = (viste[chiave] || 0) + 1;
    chiave += '#' + viste[chiave];
    return { d: d, chiave: chiave };
  });
}

function sezioniAperte(pagina) {
  return chiaviSezioni(pagina).filter(function(x) { return x.d.open; }).map(function(x) { return x.chiave; });
}

// Riapre le sezioni ricordate. Ogni sezione disegnata si riapre una volta
// sola (se l'utente poi la richiude, resta chiusa); se l'elenco si ridisegna
// di nuovo (alcune pagine lo disegnano due volte) si riaprono quelle nuove.
// Restituisce quante sezioni ricordate non ci sono ancora sulla pagina.
function riapriSezioni(pagina, stato) {
  if (!stato.sezioni || !stato.sezioni.length) return 0;
  const presenti = {};
  chiaviSezioni(pagina).forEach(function(x) {
    if (stato.sezioni.indexOf(x.chiave) < 0) return;
    presenti[x.chiave] = true;
    if (stato.viste.has(x.d)) return;
    stato.viste.add(x.d);
    if (!x.d.open) x.d.open = true;
  });
  return stato.sezioni.filter(function(k) { return !presenti[k]; }).length;
}

// Gesti con cui l'utente scorre davvero la pagina (un semplice tocco o
// clic mentre l'elenco si carica non fa perdere il punto).
const GESTI_SCORRIMENTO = ['wheel', 'touchmove', 'keydown'];

function fermaRimessaPosizione() {
  if (!rimessaPosizioneAttiva) return;
  clearInterval(rimessaPosizioneAttiva.timer);
  if (rimessaPosizioneAttiva.osservatore) rimessaPosizioneAttiva.osservatore.disconnect();
  GESTI_SCORRIMENTO.forEach(function(evento) {
    window.removeEventListener(evento, fermaRimessaPosizione, true);
  });
  rimessaPosizioneAttiva = null;
}

// Rimette la pagina a "y" mentre l'elenco si carica, riaprendo prima le
// sezioni che erano aperte.
function rimettiPosizionePagina(y, pagina, sezioni) {
  fermaRimessaPosizione();
  const conSezioni = !!(pagina && sezioni && sezioni.length);
  if ((!y || y < 5) && !conSezioni) return;
  y = y || 0;

  const inizio = Date.now();
  let ferma = 0;
  const stato = { timer: null, sezioni: conSezioni ? sezioni : [], viste: new WeakSet(), osservatore: null };
  rimessaPosizioneAttiva = stato;

  // Molte pagine restano un attimo com'erano e poi si ridisegnano quando
  // arrivano i dati (es. Presidi): ci si ferma solo quando le letture del
  // database sono finite (FILA_DB di js/01) e la pagina non cambia più.
  let ultimaModifica = Date.now();
  const pg = pagina ? ge('pg-' + pagina) : null;
  if (pg && typeof MutationObserver === 'function') {
    stato.osservatore = new MutationObserver(function() { ultimaModifica = Date.now(); });
    stato.osservatore.observe(pg, { childList: true, subtree: true });
  }
  const letture = function() {
    return typeof FILA_DB !== 'undefined' && FILA_DB ? (FILA_DB.inCorso || 0) + ((FILA_DB.attesa || []).length) : 0;
  };

  // Se l'utente scorre o tocca, la posizione non si forza più.
  GESTI_SCORRIMENTO.forEach(function(evento) {
    window.addEventListener(evento, fermaRimessaPosizione, { capture: true, passive: true });
  });

  stato.timer = setInterval(function() {
    if (rimessaPosizioneAttiva !== stato) return;
    const mancano = conSezioni ? riapriSezioni(pagina, stato) : 0;
    const massimo = document.documentElement.scrollHeight - window.innerHeight;
    const obiettivo = Math.min(y, Math.max(0, massimo));
    if (Math.abs(window.scrollY - obiettivo) > 2) {
      window.scrollTo({ top: obiettivo, left: 0, behavior: 'auto' });
      ferma = 0;
    } else if (obiettivo >= y - 2 && !mancano && !letture() && Date.now() - ultimaModifica > 400) {
      // Arrivati al punto giusto, dati arrivati e pagina ferma: si aspetta
      // un attimo, poi ci si ferma.
      ferma++;
      if (ferma >= 4) fermaRimessaPosizione();
    } else {
      ferma = 0;
    }
    // Su rete lenta l'elenco può arrivare tardi (Commesse fa più letture):
    // finché la pagina è più corta del punto o mancano sezioni si aspetta
    // fino a 10 secondi, altrimenti 3 secondi dall'ultima modifica della
    // pagina; in ogni caso non oltre 15 secondi.
    const adesso = Date.now();
    const limite = (massimo < y - 2 || mancano) ? 10000 : 3000;
    if (adesso - Math.max(inizio, ultimaModifica) > limite || adesso - inizio > 15000) fermaRimessaPosizione();
  }, 100);
}

// La vecchia pila di js/01 (ricordaPosizionePagina / ripristinaPosizionePagina)
// si riempiva senza svuotarsi e, aprendo il menu, riportava la pagina a una
// posizione vecchia. Ora la posizione la gestisce questo file: le due
// funzioni restano (molti moduli le chiamano) ma non fanno più nulla.
ricordaPosizionePagina = function() {};
ripristinaPosizionePagina = function() {};

// "← Preventivi" della scheda preventivo: se ci si è arrivati da un'altra
// pagina (commessa, cliente, dashboard) si torna lì, non all'elenco.
(function() {
  if (typeof tornaDaPreventivo !== 'function') return;
  const tornaDaPreventivoElenco = tornaDaPreventivo;
  tornaDaPreventivo = function() {
    const precedente = cronologiaPagine[cronologiaPagine.length - 2];
    if (paginaApertaId() === 'preventivo-detail' && precedente &&
        precedente !== 'preventivo-detail' && canAccessPage(precedente)) {
      gotoPage(precedente);
      return;
    }
    return tornaDaPreventivoElenco.apply(this, arguments);
  };
})();

(function() {
  if (typeof gotoPage !== 'function') return;
  const gotoPagePrimaPosizione = gotoPage;

  gotoPage = function(id) {
    const attuale = paginaApertaId();
    if (attuale) {
      posizioniPagine[attuale] = window.scrollY || 0;
      try { sezioniPagine[attuale] = sezioniAperte(attuale); } catch (e) { sezioniPagine[attuale] = []; }
    }

    // Si torna indietro se la pagina richiesta è quella da cui si era venuti,
    // oppure con la freccia del browser o del telefono (anche più passi indietro).
    const dalBrowser = navigazioneDaBrowser && attuale && attuale !== id;
    const indietro = dalBrowser || (attuale && attuale !== id &&
      cronologiaPagine.length >= 2 &&
      cronologiaPagine[cronologiaPagine.length - 2] === id);

    fermaRimessaPosizione();
    const risultato = gotoPagePrimaPosizione.apply(this, arguments);

    // gotoPage può rifiutare la pagina (permessi): si aggiorna la
    // cronologia solo se la pagina richiesta è davvero quella aperta.
    if (paginaApertaId() !== id) return risultato;

    if (indietro) {
      // Freccia del browser: si torna alla voce giusta anche se non è la penultima.
      const i = cronologiaPagine.lastIndexOf(id, cronologiaPagine.length - 2);
      if (i >= 0) cronologiaPagine.length = i + 1;
      else if (cronologiaPagine[cronologiaPagine.length - 1] !== id) cronologiaPagine.push(id);
      rimettiPosizionePagina(posizioniPagine[id], id, sezioniPagine[id]);
    } else if (cronologiaPagine[cronologiaPagine.length - 1] !== id) {
      if (attuale && cronologiaPagine.length === 0) cronologiaPagine.push(attuale);
      cronologiaPagine.push(id);
      if (cronologiaPagine.length > 50) cronologiaPagine.shift();
    }
    registraPaginaNelBrowser(id);
    return risultato;
  };
})();

// ---------------------------------------------------------------------
// Freccia "indietro" del browser e del telefono (richiesta di Erika del
// 02/11: dai Preventivi, tornando dal PDF, si finiva sulla dashboard).
// Prima il sito non scriveva nulla nella cronologia del browser: la
// freccia indietro usciva dal gestionale, che ripartiva dalla dashboard.
// Ora:
// - ogni cambio di pagina aggiunge una voce alla cronologia del browser
//   (indirizzo con #pagina, es. .../#preventivi-rapp);
// - la freccia indietro torna alla pagina di prima, nel punto in cui si
//   era (come il bottone "← Indietro"); se c'è una finestra aperta, la
//   prima freccia chiude solo la finestra;
// - se il sito si ricarica (es. tornando dal PDF sul telefono) riparte
//   dalla pagina dell'indirizzo invece che dalla dashboard; le schede di
//   dettaglio dal 04/11 hanno il loro indirizzo #/<oggetto>/<id> (F14.1,
//   in fondo al file) e si riaprono uguali; solo le voci vecchie senza id
//   (#preventivo-detail) ripartono dal loro elenco.
// ---------------------------------------------------------------------
let navigazioneDaBrowser = false;

// F14.1: indirizzo della scheda aperta (#/preventivo/<id>...). Lo prepara
// chi apre la scheda (funzioni open*Detail avvolte più sotto) e lo usa la
// prossima registrazione della sua pagina.
let rottaInApertura = null;      // { pagina, rotta } in attesa che la scheda si apra
let rottaMostrata = null;        // { pagina, rotta } della scheda sullo schermo
let sostituisciIndirizzo = false; // true: si sostituisce la voce della cronologia
let registrazioneSospesa = false; // true: l'indirizzo non si tocca (es. link di Supabase Auth)

function indirizzoPagina(id, rotta) {
  return location.pathname + location.search + '#' + (rotta || id);
}

function registraPaginaNelBrowser(id) {
  let rotta = null;
  if (rottaInApertura && rottaInApertura.pagina === id) {
    rotta = rottaInApertura.rotta;
    rottaInApertura = null;
  } else if (rottaMostrata && rottaMostrata.pagina === id) {
    rotta = rottaMostrata.rotta;   // la stessa scheda si è ricaricata
  }
  rottaMostrata = rotta ? { pagina: id, rotta: rotta } : null;
  if (navigazioneDaBrowser || registrazioneSospesa || !id || !window.history || !history.pushState) return;
  try {
    const stato = history.state;
    if (stato && stato.paginaGestionale === id && (stato.rotta || null) === rotta) return;
    const nuovo = { paginaGestionale: id };
    if (rotta) nuovo.rotta = rotta;
    if (sostituisciIndirizzo || !stato || !stato.paginaGestionale) history.replaceState(nuovo, '', indirizzoPagina(id, rotta));
    else history.pushState(nuovo, '', indirizzoPagina(id, rotta));
  } catch (e) {}
}

// Rimette nell'indirizzo la pagina (e la scheda) sullo schermo.
function allineaIndirizzoPagina(aggiungi) {
  const id = paginaApertaId();
  if (!id || registrazioneSospesa) return;
  const rotta = rottaMostrata && rottaMostrata.pagina === id ? rottaMostrata.rotta : null;
  const nuovo = { paginaGestionale: id };
  if (rotta) nuovo.rotta = rotta;
  try {
    if (aggiungi) history.pushState(nuovo, '', indirizzoPagina(id, rotta));
    else history.replaceState(nuovo, '', indirizzoPagina(id, rotta));
  } catch (e) {}
}

// Dove ripartire se il sito si ricarica su una scheda di dettaglio.
const ELENCO_DELLA_SCHEDA = {
  'preventivo-detail': { titolare: 'preventivi-titolare', commerciale: 'preventivi', rappresentante: 'preventivi-rapp' },
  'commessa-detail': 'commesse',
  'cliente-detail': 'clienti',
  'fornitore-detail': 'fornitori',
  'progetto-detail': { commerciale: 'progetti-da-preventivare', titolare: 'progetti-da-preventivare', rappresentante: 'progetti' },
  'scheda-documenti': 'team-subappalti'
};

function paginaDaRiaprire(id) {
  let pagina = id;
  const elenco = ELENCO_DELLA_SCHEDA[id];
  if (elenco) pagina = typeof elenco === 'string' ? elenco : (elenco[ROLE] || null);
  if (!pagina || !ge('pg-' + pagina) || typeof canAccessPage !== 'function' || !canAccessPage(pagina)) return null;
  return pagina;
}

window.addEventListener('popstate', async function(evento) {
  if (typeof ROLE === 'undefined' || !ROLE) return;
  // Una finestra aperta: la freccia la chiude e si resta sulla pagina.
  const finestre = document.querySelectorAll('.mbg.on');
  if (finestre.length) {
    finestre.forEach(function(m) { m.classList.remove('on'); });
    allineaIndirizzoPagina(true);
    return;
  }
  const stato = evento.state || {};
  // F14.1: voce con la scheda (#/preventivo/<id>): si riapre quella scheda.
  const richiesta = stato.rotta ? leggiRottaScheda(stato.rotta) : null;
  if (richiesta) {
    if (rottaMostrata && rottaMostrata.rotta === stato.rotta && paginaApertaId() === rottaMostrata.pagina) return;
    await apriRottaScheda(richiesta, { daBrowser: true });
    return;
  }
  // Indirizzo scritto a mano (#/preventivo/<id> senza voce salvata).
  const daIndirizzo = statoDaIndirizzo(location.hash);
  if (!stato.paginaGestionale && daIndirizzo && daIndirizzo.tipo === 'rotta') {
    await apriRottaScheda(daIndirizzo, { sostituisci: true });
    return;
  }
  const id = stato.paginaGestionale;
  if (!id || (id === paginaApertaId() && !rottaMostrata)) return;
  const pagina = ge('pg-' + id) && canAccessPage(id) ? id : paginaDaRiaprire(id);
  if (!pagina) {
    if (ge('pg-' + id)) toast('Non hai accesso a questa pagina: torni alla dashboard', 'err');
    vaiAllaDashboardDaIndirizzo();
    return;
  }
  navigazioneDaBrowser = true;
  try { gotoPage(pagina); } finally { navigazioneDaBrowser = false; }
});

// PDF dei preventivi nella STESSA scheda (richiesta di Erika del 03/11:
// "dal PDF aperto la freccia del browser deve tornare a Preventivi"). In una
// scheda nuova la freccia indietro non ha dove tornare; nella stessa scheda
// torna alla pagina del gestionale (#preventivi-rapp...), che riparte da lì
// e nel punto in cui si era (posizione salvata qui sotto).
const CHIAVE_POSIZIONE_PDF = 'toli_posizione_prima_del_pdf';

function apriPdfStessaScheda(url) {
  if (!url) return;
  try {
    const pagina = paginaApertaId();
    if (pagina) {
      registraPaginaNelBrowser(pagina);
      sessionStorage.setItem(CHIAVE_POSIZIONE_PDF, JSON.stringify({ pagina: pagina, y: window.scrollY || 0, sezioni: sezioniAperte(pagina) }));
    }
  } catch (e) {}
  location.assign(url);
}

function rimettiPosizionePrimaDelPdf() {
  try {
    const salvata = JSON.parse(sessionStorage.getItem(CHIAVE_POSIZIONE_PDF) || 'null');
    sessionStorage.removeItem(CHIAVE_POSIZIONE_PDF);
    if (salvata && salvata.pagina === paginaApertaId()) rimettiPosizionePagina(salvata.y, salvata.pagina, salvata.sezioni);
  } catch (e) {}
}

// Tornando dal PDF il browser a volte rimette la pagina com'era (senza
// ricaricarla): si aggiorna l'elenco dei preventivi del rappresentante
// (il PDF aperto lo segna come letto).
window.addEventListener('pageshow', function(evento) {
  if (!evento.persisted || typeof ROLE === 'undefined' || !ROLE) return;
  try { sessionStorage.removeItem(CHIAVE_POSIZIONE_PDF); } catch (e) {}
  if (paginaApertaId() === 'preventivi-rapp' && typeof loadPreventiviRappresentante === 'function') {
    loadPreventiviRappresentante();
  }
});

// ---------------------------------------------------------------------
// F14.1 — indirizzi delle schede: #/<oggetto>/<id>
// ---------------------------------------------------------------------
// Ogni scheda di dettaglio ha un indirizzo suo, uguale per tutti i link
// (anche quelli mandati per email): #/preventivo/<id>, #/commessa/<id>...
// - aprendo una scheda (bottone "Apri", collegamenti) l'indirizzo diventa
//   quello della scheda: il ricaricamento resta sulla stessa scheda e la
//   freccia indietro torna alla scheda di prima;
// - un link aperto da chi non è collegato porta al login e, dopo il login,
//   alla scheda (l'indirizzo resta nella barra finché non si entra);
// - scheda di una pagina non permessa al ruolo, o che il ruolo non legge:
//   messaggio "Non hai accesso" e si resta sulla dashboard;
// - i frammenti di Supabase Auth (#access_token=..., #error=...,
//   #type=recovery dei link di recupero password e degli inviti) non sono
//   indirizzi del gestionale: non si leggono e non si toccano;
// - il portale clienti resta su ?portale= (non passa da qui).
// Le schede che si aprono in una finestra (fattura, intervento) hanno solo
// l'indirizzo d'ingresso: aprono la loro pagina e la finestra; ricaricando
// si resta sulla pagina.
// Per una scheda nuova basta una riga in SCHEDE_CON_INDIRIZZO.
const SCHEDE_CON_INDIRIZZO = {
  preventivo: {
    nome: 'il preventivo',
    pagina: function() { return ROLE === 'rappresentante' ? 'preventivi-rapp' : 'preventivo-detail'; },
    funzione: 'openPreventivoDetail',
    apri: function(id) {
      if (ROLE === 'rappresentante') return apriPreventivoRappresentanteDaIndirizzo(id);
      return openPreventivoDetail(id);
    },
    finestra: function() { return ROLE === 'rappresentante'; }
  },
  commessa: { nome: 'la commessa', pagina: 'commessa-detail', funzione: 'openCommessaDetail', tabella: 'commesse' },
  cantiere: {
    nome: 'la commessa', pagina: 'commessa-detail', tabella: 'commesse',
    apri: function(id) {
      // Apre la commessa sulla scheda "🏗️ Cantiere" (js/32).
      if (typeof tabCommessaScelta !== 'undefined') tabCommessaScelta = { commessaId: id, tab: 'cantiere' };
      return openCommessaDetail(id);
    }
  },
  cliente: { nome: 'il cliente', pagina: 'cliente-detail', funzione: 'openClienteDetail', tabella: 'clienti' },
  progetto: { nome: 'il progetto', pagina: 'progetto-detail', funzione: 'openProgettoDetail' },
  fornitore: { nome: 'il fornitore', pagina: 'fornitore-detail', funzione: 'openFornitoreDetail' },
  persona: {
    nome: 'i documenti della persona', pagina: 'scheda-documenti', tabella: 'utenti',
    apri: function(id) { return openSchedaDocumenti('dipendente', id); }
  },
  subappaltatore: {
    nome: 'i documenti del subappaltatore', pagina: 'scheda-documenti', tabella: 'subappaltatori',
    apri: function(id) { return openSchedaDocumenti('subappaltatore', id); }
  },
  fattura: {
    nome: 'la fattura', pagina: 'fatture', finestra: true, idFinestra: 'm-fattura',
    apri: async function(id) { gotoPage('fatture'); if (typeof apriFattura === 'function') await apriFattura(id); }
  },
  intervento: {
    nome: "l'intervento", pagina: 'interventi', finestra: true, idFinestra: 'm-cal-edit',
    apri: async function(id) {
      gotoPage('interventi');
      // openOdlDetail (js/12) non restituisce la promessa: si aspetta la finestra.
      if (typeof apriEditOdlCal === 'function') await apriEditOdlCal(id);
      else if (typeof openOdlDetail === 'function') await openOdlDetail(id);
    }
  }
};

function paginaSchedaConIndirizzo(scheda) {
  return typeof scheda.pagina === 'function' ? scheda.pagina() : scheda.pagina;
}

function schedaInFinestra(scheda) {
  return typeof scheda.finestra === 'function' ? scheda.finestra() : !!scheda.finestra;
}

// Frammenti dei link di Supabase Auth (recupero password, inviti, errori).
function frammentoSupabaseAuth(hash) {
  return /(^|[#&])(access_token|refresh_token|error|error_code|error_description|type|token_hash|code)=/.test(String(hash || ''));
}

// "/preventivo/<id>" → { tipo: 'rotta', oggetto, id, rotta }.
function leggiRottaScheda(testo) {
  const m = /^\/?([a-z_]+)\/([A-Za-z0-9_-]{1,64})\/?$/.exec(String(testo || '').replace(/^#/, ''));
  if (!m) return null;
  return { tipo: 'rotta', oggetto: m[1], id: m[2], rotta: '/' + m[1] + '/' + m[2] };
}

// Cosa chiede l'indirizzo: una scheda, una pagina, un link di Supabase Auth.
function statoDaIndirizzo(hash) {
  const testo = String(hash || '').replace(/^#/, '');
  if (!testo) return null;
  if (frammentoSupabaseAuth(testo)) return { tipo: 'auth' };
  if (testo.charAt(0) === '/') return leggiRottaScheda(testo) || { tipo: 'sconosciuto' };
  if (/^[a-z0-9-]+$/.test(testo)) return { tipo: 'pagina', id: testo };
  return null;
}

function paginaDashboard() {
  return ROLE === 'rappresentante' ? 'dashboard-rapp' : 'dashboard';
}

function vaiAllaDashboardDaIndirizzo() {
  const dashboard = paginaDashboard();
  if (paginaApertaId() !== dashboard && canAccessPage(dashboard)) {
    navigazioneDaBrowser = true;
    try { gotoPage(dashboard); } finally { navigazioneDaBrowser = false; }
  }
  rottaMostrata = null;
  allineaIndirizzoPagina(false);
}

// Apre la scheda di un indirizzo. opzioni.daBrowser: freccia indietro o
// avanti (la voce della cronologia c'è già); opzioni.sostituisci: la voce
// attuale si sostituisce (ricaricamento) invece di aggiungerne una.
async function apriRottaScheda(richiesta, opzioni) {
  opzioni = opzioni || {};
  const scheda = SCHEDE_CON_INDIRIZZO[richiesta.oggetto];
  if (!scheda) {
    toast('Indirizzo non riconosciuto: torni alla dashboard', 'err');
    vaiAllaDashboardDaIndirizzo();
    return false;
  }
  const pagina = paginaSchedaConIndirizzo(scheda);
  if (!pagina || !ge('pg-' + pagina) || !canAccessPage(pagina)) {
    toast('Non hai accesso: con il tuo ruolo non puoi aprire ' + scheda.nome + ' di questo link. Sei sulla dashboard', 'err');
    vaiAllaDashboardDaIndirizzo();
    return false;
  }
  // Schede che si aprono prima di leggere i dati (commessa, cliente, scheda
  // documenti): si controlla prima che il database faccia leggere l'id
  // (RLS del ruolo). utenti la leggono tutti i collegati; subappaltatori
  // titolare, segreteria e capo tecnico, gli stessi della scheda documenti.
  if (scheda.tabella) {
    let leggibile = false;
    try {
      const r = await db.from(scheda.tabella).select('id').eq('id', richiesta.id).maybeSingle();
      leggibile = !r.error && !!r.data;
    } catch (e) { leggibile = false; }
    if (!leggibile) {
      toast('Non hai accesso: non puoi aprire ' + scheda.nome + ' di questo link, oppure non esiste più', 'err');
      vaiAllaDashboardDaIndirizzo();
      return false;
    }
  }
  const finestra = schedaInFinestra(scheda);
  const apri = scheda.apri || function(id) { return window[scheda.funzione](id); };
  if (opzioni.daBrowser) navigazioneDaBrowser = true;
  if (opzioni.sostituisci) sostituisciIndirizzo = true;
  try {
    await apri(richiesta.id);
  } catch (e) {
    console.warn('Apertura dal link:', e);
  } finally {
    navigazioneDaBrowser = false;
    sostituisciIndirizzo = false;
  }
  const paginaAperta = paginaApertaId() === pagina;
  const finestraAperta = !scheda.idFinestra || !!(ge(scheda.idFinestra) && ge(scheda.idFinestra).classList.contains('on'));
  const aperta = finestra
    ? paginaAperta && finestraAperta
    : paginaAperta && !!rottaMostrata && rottaMostrata.rotta.split('/')[2] === richiesta.id;
  if (!aperta) {
    // Il database non la fa leggere (permessi) o non esiste più.
    toast('Non hai accesso: non puoi aprire ' + scheda.nome + ' di questo link, oppure non esiste più', 'err');
    // Pagina della finestra aperta (es. Fatture): si resta lì.
    if (finestra && paginaAperta) allineaIndirizzoPagina(false);
    else vaiAllaDashboardDaIndirizzo();
    return false;
  }
  if (opzioni.daBrowser || finestra) allineaIndirizzoPagina(false);
  return true;
}

// Rappresentante: non ha la scheda del preventivo; il link porta a
// "I miei preventivi" con la ricerca sul numero del preventivo.
async function apriPreventivoRappresentanteDaIndirizzo(id) {
  const r = await db.from('preventivi').select('id,numero').eq('id', id).maybeSingle();
  if (r.error || !r.data) return;
  gotoPage('preventivi-rapp');
  const campo = ge('cerca-prev-preventivi-rapp');
  if (campo && r.data.numero != null) {
    campo.value = String(r.data.numero);
    if (typeof filtraPreventiviPagina === 'function') filtraPreventiviPagina('preventivi-rapp');
  }
  toast('Preventivo n. ' + r.data.numero + ': lo trovi qui sotto (se è in attesa dell\'esito)', 'ok');
}

// Le funzioni che aprono le schede preparano l'indirizzo della scheda: così
// ogni "Apri" scrive #/<oggetto>/<id>, da qualunque pagina venga.
Object.keys(SCHEDE_CON_INDIRIZZO).forEach(function(oggetto) {
  const scheda = SCHEDE_CON_INDIRIZZO[oggetto];
  const nome = scheda.funzione;
  if (!nome || typeof window[nome] !== 'function') return;
  const originale = window[nome];
  window[nome] = async function(id) {
    const pagina = paginaSchedaConIndirizzo(scheda);
    const attesa = (id && !schedaInFinestra(scheda) && /^[A-Za-z0-9_-]{1,64}$/.test(String(id)))
      ? { pagina: pagina, rotta: '/' + oggetto + '/' + id } : null;
    rottaInApertura = attesa;
    try {
      return await originale.apply(this, arguments);
    } finally {
      if (rottaInApertura === attesa) rottaInApertura = null;
    }
  };
});

// Commessa sul tab "🏗️ Cantiere" (js/32): l'indirizzo è #/cantiere/<id>,
// sul tab "Commessa e documenti" #/commessa/<id>; cambiando tab si
// sostituisce la voce attuale, così ricaricando o tornando indietro si
// riapre sullo stesso tab.
(function() {
  if (typeof mostraTabCommessa !== 'function') return;
  const mostraTabCommessaPrimaIndirizzo = mostraTabCommessa;
  mostraTabCommessa = function(tab) {
    const risultato = mostraTabCommessaPrimaIndirizzo.apply(this, arguments);
    try {
      if (paginaApertaId() === 'commessa-detail' && typeof commessaApertaId !== 'undefined' && commessaApertaId &&
          rottaMostrata && rottaMostrata.pagina === 'commessa-detail' &&
          rottaMostrata.rotta.split('/')[2] === String(commessaApertaId)) {
        const rotta = '/' + (tab === 'cantiere' ? 'cantiere' : 'commessa') + '/' + commessaApertaId;
        if (rotta !== rottaMostrata.rotta) {
          rottaMostrata = { pagina: 'commessa-detail', rotta: rotta };
          allineaIndirizzoPagina(false);
        }
      }
    } catch (e) {}
    return risultato;
  };
})();

// Scheda documenti di un dipendente o di un subappaltatore (js/30).
(function() {
  if (typeof openSchedaDocumenti !== 'function') return;
  const openSchedaDocumentiPrimaIndirizzo = openSchedaDocumenti;
  openSchedaDocumenti = async function(tipo, id) {
    const oggetto = tipo === 'subappaltatore' ? 'subappaltatore' : (tipo === 'dipendente' ? 'persona' : null);
    const attesa = oggetto && id && /^[A-Za-z0-9_-]{1,64}$/.test(String(id))
      ? { pagina: 'scheda-documenti', rotta: '/' + oggetto + '/' + id } : null;
    rottaInApertura = attesa;
    try {
      return await openSchedaDocumentiPrimaIndirizzo.apply(this, arguments);
    } finally {
      if (rottaInApertura === attesa) rottaInApertura = null;
    }
  };
})();

// Dopo il login: se l'indirizzo ha una scheda (#/preventivo/<id>) o una
// pagina (#preventivi-rapp), si riparte da lì invece che dalla dashboard.
// La dashboard si carica comunque per prima: dalla scheda aperta da un link
// la freccia indietro torna alla dashboard invece di uscire dal gestionale.
(function() {
  if (typeof boot !== 'function') return;
  const bootPrimaPagina = boot;
  boot = async function() {
    const richiesta = statoDaIndirizzo(location.hash);
    const statoPrima = window.history ? history.state : null;
    // Voce già del gestionale = ricaricamento: si sostituisce, non si aggiunge.
    const ricaricamento = !!(statoPrima && statoPrima.paginaGestionale);
    const auth = richiesta && richiesta.tipo === 'auth';
    rottaMostrata = null;
    if (auth) registrazioneSospesa = true; else sostituisciIndirizzo = true;
    // Ricaricando su una scheda o una pagina (es. tornando dal PDF) la
    // dashboard si carica per prima ma NON si vede: niente lampo della
    // dashboard prima della scheda (segnalazione di Erika del 12/11).
    const nascondi = !!(richiesta && (richiesta.tipo === 'rotta' || richiesta.tipo === 'pagina'));
    if (nascondi) nascondiPagineInApertura(true);
    let risultato;
    try {
      risultato = await bootPrimaPagina.apply(this, arguments);
      // La dashboard prende il posto della voce attuale della cronologia.
      registraPaginaNelBrowser(paginaApertaId());
    } finally {
      sostituisciIndirizzo = false;
      registrazioneSospesa = false;
    }
    // Link di Supabase Auth: l'indirizzo resta com'è finché non si cambia pagina.
    if (auth) return risultato;
    if (richiesta && (richiesta.tipo === 'rotta' || richiesta.tipo === 'sconosciuto')) {
      if (richiesta.tipo === 'sconosciuto') {
        toast('Indirizzo non riconosciuto: sei sulla dashboard', 'err');
      } else {
        await apriRottaScheda(richiesta, { sostituisci: ricaricamento });
      }
    } else if (richiesta && richiesta.tipo === 'pagina') {
      const pagina = paginaDaRiaprire(richiesta.id);
      if (pagina && pagina !== paginaApertaId()) {
        if (ricaricamento) sostituisciIndirizzo = true;
        try { gotoPage(pagina); } catch (e) { console.warn('Riapertura pagina:', e); }
        finally { sostituisciIndirizzo = false; }
      } else if (!pagina && ge('pg-' + richiesta.id) && richiesta.id !== paginaApertaId()) {
        toast('Non hai accesso a questa pagina: sei sulla dashboard', 'err');
      }
    }
    rimettiPosizionePrimaDelPdf();
    if (nascondi) nascondiPagineInApertura(false);
    return risultato;
  };
})();

// Pagine nascoste mentre si riapre la scheda dell'indirizzo; al massimo
// 15 secondi, poi si mostrano comunque (una lettura che non risponde).
let timerPagineInApertura = null;
function nascondiPagineInApertura(si) {
  clearTimeout(timerPagineInApertura);
  document.body.classList.toggle('pagine-in-apertura', !!si);
  if (si) timerPagineInApertura = setTimeout(function() { nascondiPagineInApertura(false); }, 15000);
}

// Già al caricamento del sito: con una scheda o una pagina nell'indirizzo
// la dashboard non compare nemmeno per un attimo prima di boot.
(function() {
  try {
    const r = statoDaIndirizzo(location.hash);
    if (r && (r.tipo === 'rotta' || r.tipo === 'pagina')) nascondiPagineInApertura(true);
  } catch (e) {}
})();
