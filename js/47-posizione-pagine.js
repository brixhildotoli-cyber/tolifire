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
const cronologiaPagine = [];     // pagine visitate, l'ultima è quella aperta
let rimessaPosizioneAttiva = null;

function paginaApertaId() {
  const pagina = document.querySelector('.page.on');
  return pagina && pagina.id ? pagina.id.replace(/^pg-/, '') : null;
}

// Gesti con cui l'utente scorre davvero la pagina (un semplice tocco o
// clic mentre l'elenco si carica non fa perdere il punto).
const GESTI_SCORRIMENTO = ['wheel', 'touchmove', 'keydown'];

function fermaRimessaPosizione() {
  if (!rimessaPosizioneAttiva) return;
  clearInterval(rimessaPosizioneAttiva.timer);
  GESTI_SCORRIMENTO.forEach(function(evento) {
    window.removeEventListener(evento, fermaRimessaPosizione, true);
  });
  rimessaPosizioneAttiva = null;
}

// Rimette la pagina a "y" mentre l'elenco si carica.
function rimettiPosizionePagina(y) {
  fermaRimessaPosizione();
  if (!y || y < 5) return;

  const inizio = Date.now();
  let ferma = 0;
  const stato = { timer: null };
  rimessaPosizioneAttiva = stato;

  // Se l'utente scorre o tocca, la posizione non si forza più.
  GESTI_SCORRIMENTO.forEach(function(evento) {
    window.addEventListener(evento, fermaRimessaPosizione, { capture: true, passive: true });
  });

  stato.timer = setInterval(function() {
    if (rimessaPosizioneAttiva !== stato) return;
    const massimo = document.documentElement.scrollHeight - window.innerHeight;
    const obiettivo = Math.min(y, Math.max(0, massimo));
    if (Math.abs(window.scrollY - obiettivo) > 2) {
      window.scrollTo({ top: obiettivo, left: 0, behavior: 'auto' });
      ferma = 0;
    } else if (obiettivo >= y - 2) {
      // Arrivati al punto giusto: si aspetta un attimo che l'elenco finisca
      // di disegnarsi, poi ci si ferma.
      ferma++;
      if (ferma >= 4) fermaRimessaPosizione();
    }
    // Su rete lenta l'elenco può arrivare tardi (Commesse fa più letture):
    // finché la pagina è più corta del punto si aspetta fino a 10 secondi,
    // altrimenti ci si ferma dopo 3.
    const limite = massimo < y - 2 ? 10000 : 3000;
    if (Date.now() - inizio > limite) fermaRimessaPosizione();
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
    if (attuale) posizioniPagine[attuale] = window.scrollY || 0;

    // Si torna indietro se la pagina richiesta è quella da cui si era venuti.
    const indietro = attuale && attuale !== id &&
      cronologiaPagine.length >= 2 &&
      cronologiaPagine[cronologiaPagine.length - 2] === id;

    fermaRimessaPosizione();
    const risultato = gotoPagePrimaPosizione.apply(this, arguments);

    // gotoPage può rifiutare la pagina (permessi): si aggiorna la
    // cronologia solo se la pagina richiesta è davvero quella aperta.
    if (paginaApertaId() !== id) return risultato;

    if (indietro) {
      cronologiaPagine.pop();
      rimettiPosizionePagina(posizioniPagine[id]);
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
//   dettaglio (preventivo, commessa, cliente, progetto, fornitore) non si
//   possono riaprire senza sapere quale: si riparte dal loro elenco.
// ---------------------------------------------------------------------
let navigazioneDaBrowser = false;

function registraPaginaNelBrowser(id) {
  if (navigazioneDaBrowser || !window.history || !history.pushState) return;
  try {
    const stato = history.state;
    if (stato && stato.paginaGestionale === id) return;
    const url = location.pathname + location.search + '#' + id;
    if (!stato || !stato.paginaGestionale) history.replaceState({ paginaGestionale: id }, '', url);
    else history.pushState({ paginaGestionale: id }, '', url);
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

window.addEventListener('popstate', function(evento) {
  if (typeof ROLE === 'undefined' || !ROLE) return;
  // Una finestra aperta: la freccia la chiude e si resta sulla pagina.
  const finestre = document.querySelectorAll('.mbg.on');
  if (finestre.length) {
    finestre.forEach(function(m) { m.classList.remove('on'); });
    const attuale = paginaApertaId();
    if (attuale) {
      try { history.pushState({ paginaGestionale: attuale }, '', location.pathname + location.search + '#' + attuale); } catch (e) {}
    }
    return;
  }
  const id = evento.state && evento.state.paginaGestionale;
  if (!id || id === paginaApertaId()) return;
  const pagina = ge('pg-' + id) && canAccessPage(id) ? id : paginaDaRiaprire(id);
  if (!pagina) return;
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
      sessionStorage.setItem(CHIAVE_POSIZIONE_PDF, JSON.stringify({ pagina: pagina, y: window.scrollY || 0 }));
    }
  } catch (e) {}
  location.assign(url);
}

function rimettiPosizionePrimaDelPdf() {
  try {
    const salvata = JSON.parse(sessionStorage.getItem(CHIAVE_POSIZIONE_PDF) || 'null');
    sessionStorage.removeItem(CHIAVE_POSIZIONE_PDF);
    if (salvata && salvata.pagina === paginaApertaId()) rimettiPosizionePagina(salvata.y);
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

// Dopo il login: se l'indirizzo ha una pagina (#preventivi-rapp), si
// riparte da lì invece che dalla dashboard.
(function() {
  if (typeof boot !== 'function') return;
  const bootPrimaPagina = boot;
  boot = async function() {
    const richiesta = (location.hash || '').replace(/^#/, '');
    const risultato = await bootPrimaPagina.apply(this, arguments);
    const pagina = richiesta ? paginaDaRiaprire(richiesta) : null;
    if (pagina && pagina !== paginaApertaId()) {
      try { gotoPage(pagina); } catch (e) { console.warn('Riapertura pagina:', e); }
    } else {
      registraPaginaNelBrowser(paginaApertaId());
    }
    rimettiPosizionePrimaDelPdf();
    return risultato;
  };
})();
