// ── F19.16 Date di inizio e faldone: corsi richiesti (solo avviso) ───────
// Scelte di Erika del 26/11: i corsi richiesti dalla commessa (js/95,
// calcolaCorsiRichiestiCommessa: parole delle voci e lavorazioni delle
// schede) per le persone del faldone, alla data di inizio, sono un AVVISO
// nel riquadro «Date dei lavori e faldone» (#fald-corsi-avviso di js/31):
// non bloccano la consegna. I corsi già messi tra i documenti richiesti del
// faldone non si ripetono (li controlla il database e bloccano come oggi).
// Per un subappaltatore basta un documento del subappaltatore (anche di un suo
// operaio); per i corsi «basta uno» serve almeno una persona del faldone.
// Il resto di F19.16 è nel database (sql/167): avviso per chi è in squadra
// ma non nel faldone, D9 (corsi di legge e idoneità non si forzano).

async function avvisoCorsiFaldone(commessa, f) {
  const posto = ge('fald-corsi-avviso');
  if (!posto || !commessa || !f || f.consegnato_il) return;
  if (typeof calcolaCorsiRichiestiCommessa !== 'function') return;
  try { await calcolaCorsiRichiestiCommessa(commessa); } catch (e) { return; }
  if (typeof SQUADRA_CORSI === 'undefined' || SQUADRA_CORSI.commessaId !== commessa.id) return;
  const giaRichiesti = new Set([].concat(f.tipi_obbligatori_dipendenti || [], f.tipi_extra_dipendenti || [], f.tipi_obbligatori_subappaltatori || [], f.tipi_extra_subappaltatori || []));
  const corsi = SQUADRA_CORSI.richiesti.filter(function(c) { return c.per !== 'impresa' && !giaRichiesti.has(c.codice); });
  const persone = f.persone || [];
  if (!corsi.length || !persone.length) return;
  const idsU = persone.filter(function(p) { return p.utente_id; }).map(function(p) { return p.utente_id; });
  const idsS = persone.filter(function(p) { return p.subappaltatore_id; }).map(function(p) { return p.subappaltatore_id; });
  const filtro = [idsU.length ? 'utente_id.in.(' + idsU.join(',') + ')' : '', idsS.length ? 'subappaltatore_id.in.(' + idsS.join(',') + ')' : ''].filter(Boolean).join(',');
  const { data, error } = await db.from('documenti_team_subappalti').select('utente_id, subappaltatore_id, tipo, data_scadenza')
    .is('sostituito_da', null).in('tipo', corsi.map(function(c) { return c.codice; })).or(filtro);
  if (error) { console.warn('Corsi del faldone:', error.message); return; }
  const rif = f.data_riferimento || dataLocaleISO();
  const valido = function(p, codice) {
    return (data || []).some(function(d) {
      return d.tipo === codice && (p.utente_id ? d.utente_id === p.utente_id : d.subappaltatore_id === p.subappaltatore_id) && (!d.data_scadenza || d.data_scadenza >= rif);
    });
  };
  const righe = [];
  corsi.forEach(function(c) {
    const nome = c.nome + (c.legge ? ' (per legge)' : '');
    if (c.almenoUno) {
      if (!persone.some(function(p) { return valido(p, c.codice); })) righe.push('serve almeno uno con ' + nome);
      return;
    }
    const senza = persone.filter(function(p) { return !valido(p, c.codice); });
    if (senza.length) righe.push(nome + ': manca o scaduto a ' + senza.map(function(p) { return p.nome; }).join(', '));
  });
  if (document.getElementById('fald-corsi-avviso') !== posto || !righe.length) return;
  posto.innerHTML = '<div class="al2 w" data-corsi-faldone>🎓 <b>Corsi richiesti dalla commessa</b> alla data di inizio (' + esc(fd(rif)) + '):' +
    righe.map(function(r) { return '<div>⚠️ ' + esc(r) + '</div>'; }).join('') +
    '<div style="font-size:12px;margin-top:4px">È un avviso: non blocca la consegna. Per farli controllare aggiungili ai documenti richiesti del faldone.</div></div>';
}
