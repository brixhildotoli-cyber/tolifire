// ── F18.24 Azioni inverse del titolare: annullo dell'accredito dell'anticipo
// (sql/150, scelte di Erika del 23/11) ─────────────────────────────────────
// Nel riquadro dell'anticipo del preventivo (js/18h htmlFatturaAnticipo-
// Preventivo chiama htmlAnnullaAccreditoAnticipo), solo per il titolare e solo
// su un preventivo accettato con l'accredito: "↩ Annulla l'accredito".
// La finestra mostra PRIMA cosa cambia (anteprima_annulla_accredito: commessa,
// pagamenti della fattura d'anticipo, ordini aperti a fornitori e
// subappaltatori, fatture già emesse) e chiede il motivo. Confermando
// (annulla_accredito_anticipo): commessa annullata, preventivo in attesa
// dell'anticipo, pagamenti annullati (la fattura torna da incassare),
// avvisi a rappresentante e segreteria. L'allegato di accettazione resta.
// Al nuovo accredito la stessa commessa si riattiva allo stato di prima.
// Senza sql/150 (preventivo_azioni_inverse_attive) il bottone non c'è.

let azioniInverseVerificate = null;

async function verificaAzioniInverseDisponibili() {
  if (azioniInverseVerificate !== null) return azioniInverseVerificate;
  try {
    const { data, error } = await db.rpc('preventivo_azioni_inverse_attive');
    azioniInverseVerificate = !error && data === true;
  } catch (e) {
    azioniInverseVerificate = false;
  }
  return azioniInverseVerificate;
}

// Segnaposto nel riquadro dell'anticipo: il bottone compare dopo il controllo
function htmlAnnullaAccreditoAnticipo(p) {
  if (ROLE !== 'titolare' || !p || p.stato !== 'accettato' || !p.anticipo_accredito_data) return '';
  setTimeout(mostraBottoniAnnullaAccredito, 0);
  return '<div data-annulla-accredito="' + esc(p.id) + '" style="margin-top:8px"></div>';
}

async function mostraBottoniAnnullaAccredito() {
  if (!(await verificaAzioniInverseDisponibili())) return;
  document.querySelectorAll('[data-annulla-accredito]').forEach(function(el) {
    if (el.dataset.pronto) return;
    el.dataset.pronto = '1';
    el.innerHTML = '<button type="button" class="btn sm" style="color:var(--r)" data-id="' + esc(el.dataset.annullaAccredito) +
      '" onclick="apriAnnullaAccredito(this.dataset.id)">↩ Annulla l\'accredito</button>';
  });
}

function finestraAnnullaAccredito(html) {
  let el = ge('m-annulla-accredito');
  if (!el) {
    el = document.createElement('div');
    el.className = 'mbg';
    el.id = 'm-annulla-accredito';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="modal" style="max-width:520px"><button class="x" onclick="closeM(\'m-annulla-accredito\')">×</button>' + html + '</div>';
  openM('m-annulla-accredito');
}

const NOMI_STATO_COMMESSA_ANNULLO = {
  approvata: 'Approvata', materiali_ordinati: 'Materiali ordinati', in_preparazione: 'Presa in carico', pronta: 'Pronta',
  in_corso: 'In corso', fine_lavori: 'Fine lavori', chiusa: 'Chiusa', annullata: 'Annullata'
};

function righeAnteprimaAnnullaAccredito(a) {
  const righe = [];
  if (a.commessa) {
    righe.push('La commessa <b>' + esc(a.commessa.codice) + '</b> (oggi «' + esc(NOMI_STATO_COMMESSA_ANNULLO[a.commessa.stato] || a.commessa.stato) +
      '») diventa <b>Annullata</b>: torna allo stato di prima quando l\'anticipo è di nuovo accreditato.');
  }
  righe.push('Il preventivo <b>' + esc(a.preventivo) + '</b> torna <b>in attesa dell\'anticipo</b>. L\'allegato di accettazione e la fattura d\'anticipo restano.');
  const pag = a.pagamenti || [];
  if (pag.length) {
    righe.push('Si annulla' + (pag.length === 1 ? ' il pagamento' : 'no ' + pag.length + ' pagamenti') + ' della fattura d\'anticipo (' +
      pag.map(function(x) { return esc(euroPreventivo(x.importo)) + ' del ' + esc(fd(x.data)); }).join(', ') + '): la fattura torna da incassare.');
  }
  const avvisi = [];
  if (a.ordini_fornitori_aperti) avvisi.push(a.ordini_fornitori_aperti + (a.ordini_fornitori_aperti === 1 ? ' ordine al fornitore aperto' : ' ordini ai fornitori aperti'));
  if (a.ordini_subappalto_emessi) avvisi.push(a.ordini_subappalto_emessi + (a.ordini_subappalto_emessi === 1 ? ' ordine al subappaltatore' : ' ordini ai subappaltatori'));
  if (a.fatture_commessa) avvisi.push(a.fatture_commessa + (a.fatture_commessa === 1 ? ' fattura già emessa' : ' fatture già emesse') + ' sulla commessa');
  return '<ul style="margin:0 0 8px 18px;padding:0;font-size:13px;line-height:1.5">' + righe.map(function(r) { return '<li>' + r + '</li>'; }).join('') + '</ul>' +
    (avvisi.length ? '<div class="al2 w" style="font-size:13px">⚠️ Restano come sono: ' + esc(avvisi.join(', ')) + '. Sentili tu se vanno fermati.</div>' : '') +
    '<div style="font-size:12px;color:var(--m);margin-top:6px">Avviso ' + (a.ha_rappresentante ? 'al rappresentante e ' : '') + 'alla segreteria.</div>';
}

async function apriAnnullaAccredito(preventivoId) {
  if (ROLE !== 'titolare') return;
  const { data, error } = await db.rpc('anteprima_annulla_accredito', { p_preventivo_id: preventivoId });
  if (error) { toast('Non letto: ' + error.message, 'err'); return; }
  const a = data || {};
  if (!a.si_puo) { toast(a.motivo_no || 'L\'accredito non si può annullare', 'err'); return; }
  finestraAnnullaAccredito('<h3>↩ Annulla l\'accredito dell\'anticipo</h3>' +
    '<div style="font-size:13px;margin-bottom:6px">Accredito del ' + esc(fd(a.accredito_data)) + (a.fattura_anticipo ? ' · fattura d\'anticipo n. ' + esc(a.fattura_anticipo) : '') + '. Cosa cambia:</div>' +
    righeAnteprimaAnnullaAccredito(a) +
    '<div class="f" style="margin-top:10px"><label>Motivo *</label><textarea id="maa-motivo" rows="2" maxlength="400" placeholder="Es. bonifico respinto dalla banca"></textarea></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeM(\'m-annulla-accredito\')">Lascia com\'è</button>' +
    '<button class="btn p" style="background:var(--r);border-color:var(--r)" id="maa-conferma" data-id="' + esc(preventivoId) + '" onclick="confermaAnnullaAccredito(this.dataset.id)">↩ Annulla l\'accredito</button></div>');
}

async function confermaAnnullaAccredito(preventivoId) {
  const motivo = v('maa-motivo').trim();
  if (motivo.length < 3) { toast('Scrivi il motivo', 'err'); return; }
  const btn = ge('maa-conferma');
  btn.disabled = true;
  const { data, error } = await db.rpc('annulla_accredito_anticipo', { p_preventivo_id: preventivoId, p_motivo: motivo });
  btn.disabled = false;
  if (error) { toast('Non annullato: ' + error.message, 'err'); return; }
  closeM('m-annulla-accredito');
  toast('Accredito annullato' + (data && data.commessa ? ': commessa ' + data.commessa + ' annullata' : '') + ' ✓', 'ok');
  // scheda del preventivo di nuovo, con lo stato nuovo (js/18)
  try { if (typeof openPreventivoDetail === 'function') await openPreventivoDetail(preventivoId); } catch (e) { console.warn('Scheda del preventivo:', e); }
}
