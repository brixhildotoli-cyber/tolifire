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

function fermaRimessaPosizione() {
  if (!rimessaPosizioneAttiva) return;
  clearInterval(rimessaPosizioneAttiva.timer);
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function(evento) {
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
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function(evento) {
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
    if (Date.now() - inizio > 3000) fermaRimessaPosizione();
  }, 100);
}

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
    return risultato;
  };
})();
