// ── DASHBOARD PIÙ LEGGERE: SEZIONI VUOTE NASCOSTE (riordino del 17/11) ──
// Decisione di Erika: nelle dashboard le sezioni che dicono solo
// "✅ Nessun…" / "🎉 Nessuna…" / "✅ Tutti …" non compaiono (titolo e
// riquadro). Appena c'è qualcosa (o un errore, o "Caricamento…") ricompaiono.
// Una sezione con un bottone o un link (es. "🎉 Nessun sopralluogo aperto.
// + Nuovo", "Segna un'assenza") resta sempre: lì c'è un'azione.
// Non avvolge funzioni: guarda le pagine delle dashboard (MutationObserver)
// e, dopo ogni ridisegno, controlla i titoli di sezione (tit-section,
// ct-section-title, rap-section) e il riquadro che li segue.

const SEZIONI_VUOTE = {
  pagine: ['pg-dashboard', 'pg-dashboard-rapp'],
  titoli: '.tit-section, .ct-section-title, .rap-section',
  testoVuoto: /^\s*(✅|🎉)?\s*(Nessun[oa]?\b|Tutti (gli|i) )/,
  timer: null
};

function sezioneVuota(contenuto) {
  if (!contenuto || contenuto.matches(SEZIONI_VUOTE.titoli)) return false;
  if (contenuto.querySelector('button, a, input, select, textarea, canvas, img')) return false;
  const testo = (contenuto.textContent || '').replace(/\s+/g, ' ').trim();
  return testo.length > 0 && testo.length <= 160 && SEZIONI_VUOTE.testoVuoto.test(testo);
}

function nascondiSezione(el, si) {
  if (si) {
    if (el.dataset.vuotaNascosta === undefined) {
      el.dataset.vuotaNascosta = el.style.display || '';
      el.style.display = 'none';
    }
  } else if (el.dataset.vuotaNascosta !== undefined) {
    el.style.display = el.dataset.vuotaNascosta;
    delete el.dataset.vuotaNascosta;
  }
}

function aggiornaSezioniVuote() {
  SEZIONI_VUOTE.pagine.forEach(function(id) {
    const pg = ge(id);
    if (!pg) return;
    pg.querySelectorAll(SEZIONI_VUOTE.titoli).forEach(function(titolo) {
      const contenuto = titolo.nextElementSibling;
      const vuota = sezioneVuota(contenuto);
      nascondiSezione(titolo, vuota);
      if (contenuto && !contenuto.matches(SEZIONI_VUOTE.titoli)) nascondiSezione(contenuto, vuota);
    });
  });
}

function programmaSezioniVuote() {
  clearTimeout(SEZIONI_VUOTE.timer);
  SEZIONI_VUOTE.timer = setTimeout(aggiornaSezioniVuote, 120);
}

(function() {
  if (typeof MutationObserver !== 'function') return;
  const osservatore = new MutationObserver(programmaSezioniVuote);
  SEZIONI_VUOTE.pagine.forEach(function(id) {
    const pg = ge(id);
    if (pg) osservatore.observe(pg, { childList: true, subtree: true, characterData: true });
  });
})();
