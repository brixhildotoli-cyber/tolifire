// ── F18.22 — ORDINE SOPRA L'OFFERTA DEL FORNITORE: SOLO AVVISO ──────────
// Decisione di Erika del 16/11: nessun blocco. Quando un ordine nato da
// un'offerta scelta (js/27) costa più dell'offerta oltre il 5%
// (SOGLIA_ORDINE_SOPRA_OFFERTA; per metterla nelle Regole serve un file SQL):
//   - nella finestra del nuovo ordine l'avviso giallo sotto il totale, mentre
//     si scrivono i prezzi;
//   - alla creazione una conferma ("l'ordine parte lo stesso"); Annulla torna
//     alla finestra;
//   - sulla riga dell'ordine (chi vede i prezzi d'acquisto) "⚠️ +N% sull'offerta";
//   - al titolare la riga di "Cosa tocca a me" con gli ordini ancora da
//     ricevere sopra l'offerta (spariscono quando arrivano o si annullano).
// Gli ordini liberi (js/80) non hanno un'offerta: non c'entrano. NESSUN SQL.

const SOGLIA_ORDINE_SOPRA_OFFERTA = 5;

function scartoSuOfferta(totale, offerto) {
  const o = Number(offerto), t = Number(totale);
  if (!(o > 0) || !isFinite(t)) return null;
  const perc = (t - o) / o * 100;
  return perc > SOGLIA_ORDINE_SOPRA_OFFERTA ? Math.round(perc * 10) / 10 : null;
}

function testoScartoOfferta(perc, totale, offerto) {
  return 'Il totale dell\'ordine (' + euroPreventivo(totale) + ') supera l\'offerta del fornitore (' + euroPreventivo(offerto) + ') del ' + String(perc).replace('.', ',') + '%.';
}

function aggiornaAvvisoSopraOfferta() {
  const box = ge('mof-voci');
  const off = typeof offertaNuovoOrdine !== 'undefined' ? offertaNuovoOrdine : null;
  if (!box) return;
  const vecchio = ge('mof-sopra-offerta');
  if (vecchio) vecchio.remove();
  if (!off || off.libero) return;
  const totale = totaleVociOrdine(vociNuovoOrdine);
  const perc = scartoSuOfferta(totale, off.prezzo_offerto);
  if (perc === null) return;
  box.insertAdjacentHTML('beforeend', '<div id="mof-sopra-offerta" class="al2 w" style="margin-top:8px">⚠️ ' +
    esc(testoScartoOfferta(perc, totale, off.prezzo_offerto)) + ' Controlla i prezzi: l\'ordine si può creare lo stesso e il titolare lo vedrà.</div>');
}

if (typeof renderVociNuovoOrdine === 'function') {
  const renderVociNuovoOrdineSenzaAvviso = renderVociNuovoOrdine;
  // eslint-disable-next-line no-global-assign
  renderVociNuovoOrdine = function() {
    const esito = renderVociNuovoOrdineSenzaAvviso.apply(this, arguments);
    aggiornaAvvisoSopraOfferta();
    return esito;
  };
}
if (typeof aggiornaVoceNuovoOrdine === 'function') {
  const aggiornaVoceNuovoOrdineSenzaAvviso = aggiornaVoceNuovoOrdine;
  // eslint-disable-next-line no-global-assign
  aggiornaVoceNuovoOrdine = function() {
    const esito = aggiornaVoceNuovoOrdineSenzaAvviso.apply(this, arguments);
    aggiornaAvvisoSopraOfferta();
    return esito;
  };
}

if (typeof salvaNuovoOrdineFornitore === 'function') {
  const salvaNuovoOrdineFornitoreSenzaAvviso = salvaNuovoOrdineFornitore;
  // eslint-disable-next-line no-global-assign
  salvaNuovoOrdineFornitore = async function() {
    const off = typeof offertaNuovoOrdine !== 'undefined' ? offertaNuovoOrdine : null;
    if (off && !off.libero) {
      const totale = totaleVociOrdine(vociNuovoOrdine);
      const perc = scartoSuOfferta(totale, off.prezzo_offerto);
      if (perc !== null && !confirm(testoScartoOfferta(perc, totale, off.prezzo_offerto) + '\n\nCreare l\'ordine lo stesso? Il titolare lo vedrà tra gli ordini sopra l\'offerta.')) return;
    }
    return salvaNuovoOrdineFornitoreSenzaAvviso.apply(this, arguments);
  };
}

// Riga dell'ordine: segno dell'aumento (solo chi vede i prezzi d'acquisto)
if (typeof caricaOrdiniCommessa === 'function') {
  const caricaOrdiniCommessaSenzaScarto = caricaOrdiniCommessa;
  // eslint-disable-next-line no-global-assign
  caricaOrdiniCommessa = async function() {
    const esito = await caricaOrdiniCommessaSenzaScarto.apply(this, arguments);
    try {
      if (typeof vedePrezziAcquisto === 'function' && !vedePrezziAcquisto()) return esito;
      const offerte = {};
      (offerteCommessaAperta || []).forEach(function(o) { offerte[o.id] = o.prezzo_offerto; });
      (ordiniCommessaAperta || []).forEach(function(o) {
        if (!o.preventivo_fornitore_id || o.stato === 'annullato') return;
        const perc = scartoSuOfferta(o.importo, offerte[o.preventivo_fornitore_id]);
        const riga = document.querySelector('#cmd-ordini [data-ordine-id="' + o.id + '"]');
        const titolo = riga && riga.querySelector('div[style*="font-weight:700"]');
        if (perc === null || !titolo || titolo.querySelector('[data-sopra-offerta]')) return;
        titolo.insertAdjacentHTML('beforeend', ' <span class="bx bwarn" data-sopra-offerta title="' + esc(testoScartoOfferta(perc, o.importo, offerte[o.preventivo_fornitore_id])) + '">⚠️ +' + String(perc).replace('.', ',') + '% sull\'offerta</span>');
      });
    } catch (e) { console.warn('Ordini sopra l\'offerta:', e); }
    return esito;
  };
}

// Cosa tocca a me del titolare: ordini ancora da ricevere sopra l'offerta
async function ordiniSopraOfferta() {
  const { data, error } = await db.from('ordini_fornitori')
    .select('id, commessa_id, importo, preventivo_fornitore_id, preventivi_fornitori(prezzo_offerto)')
    .in('stato', ['ordinato', 'confermato']).not('preventivo_fornitore_id', 'is', null).limit(500);
  if (error) { console.warn('Ordini sopra l\'offerta:', error.message); return null; }
  return (data || []).filter(function(o) { return scartoSuOfferta(o.importo, o.preventivi_fornitori && o.preventivi_fornitori.prezzo_offerto) !== null; });
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'ordini-sopra-offerta', ruoli: ['titolare'], icona: '⚠️', priorita: 33,
    titolo: 'Ordini ai fornitori sopra l\'offerta (oltre il ' + SOGLIA_ORDINE_SOPRA_OFFERTA + '%)',
    vai: function() { ordiniSopraOfferta().then(function(e) { if (e && e.length) { if (e.length > 1) toast('Apro la commessa del primo di ' + e.length + ' ordini', 'ok'); openCommessaDetail(e[0].commessa_id); } }); },
    conta: async function() { const e = await ordiniSopraOfferta(); return e === null ? null : e.length; }
  });
}
