// ── F18.3, versione scelta da Erika il 19/11/2026 (sql/132) ─────────────
// 1. Richiami del preventivo da far approvare (stato inviato_a_rappresentante):
//    il rappresentante del cliente li registra con l'esito
//    (registra_richiamo_preventivo). Va richiamato 7 giorni dopo che il
//    preventivo gli è arrivato pronto (inviato_a_rappresentante_il) e di nuovo
//    dopo 15 (se il primo richiamo è stato fatto prima dei 15 giorni); con
//    l'esito "richiamare il …" vale quella data. I miei preventivi (js/13
//    chiama caricaRichiamiRappresentante), Cosa tocca a me (js/46),
//    scheda del preventivo (js/18 chiama caricaRichiamiPreventivoScheda).
// 2. Accettazione con condizioni diverse (solo avviso): nella finestra
//    dell'esito "Accettato" (js/18h chiama preparaCondizioniDiverseEsito,
//    condizioniDiverseEsitoPronte, salvaCondizioniDiverseEsito) il
//    rappresentante scrive quali; l'accettazione va avanti come sempre, il
//    titolare le vede in Cosa tocca a me e segna "OK, visto".
// Senza sql/132 (richiami_preventivo_attivi) nulla compare: il sito resta come prima.

const ESITI_RICHIAMO = {
  ci_pensa: '🤔 Ci pensa',
  non_risponde: '📵 Non risponde',
  vuole_modifiche: '✏️ Vuole modifiche',
  richiamare: '📅 Richiamare più avanti',
  altro: '💬 Altro'
};
const GIORNI_PRIMO_RICHIAMO = 7;
const GIORNI_SECONDO_RICHIAMO = 15;
let richiamiPreventivoVerificati = null;
let richiamoInCorso = null;  // { preventivoId, numero }

async function verificaRichiamiPreventivoDisponibile() {
  if (richiamiPreventivoVerificati !== null) return richiamiPreventivoVerificati;
  try {
    const { data, error } = await db.rpc('richiami_preventivo_attivi');
    richiamiPreventivoVerificati = !error && data === true;
  } catch (e) {
    richiamiPreventivoVerificati = false;
  }
  return richiamiPreventivoVerificati;
}

// Richiami di più preventivi: { preventivo_id: [righe dal più recente] }
async function leggiRichiamiPreventivi(ids) {
  const perPreventivo = {};
  const elenco = (ids || []).filter(Boolean);
  for (let i = 0; i < elenco.length; i += 100) {
    const { data, error } = await db.from('preventivi_richiami')
      .select('preventivo_id,esito,nota,richiamare_il,registrato_da_nome,registrato_il')
      .in('preventivo_id', elenco.slice(i, i + 100))
      .order('registrato_il', { ascending: false });
    if (error) throw error;
    (data || []).forEach(function(r) { (perPreventivo[r.preventivo_id] = perPreventivo[r.preventivo_id] || []).push(r); });
  }
  return perPreventivo;
}

// Quando richiamare: null se non serve ora, altrimenti { testo }
function richiamoDovuto(inviatoIl, richiami) {
  if (!inviatoIl) return null;
  const oggi = dataLocaleISO();
  const inviato = String(inviatoIl).slice(0, 10);
  const giorni = giorniTraISO(inviato, oggi);
  const elenco = richiami || [];
  const ultimo = elenco[0];
  if (ultimo && ultimo.esito === 'richiamare' && ultimo.richiamare_il) {
    return ultimo.richiamare_il <= oggi ? { testo: '📞 Da richiamare: era previsto il ' + fd(ultimo.richiamare_il) } : null;
  }
  if (!elenco.length && giorni >= GIORNI_PRIMO_RICHIAMO) {
    return { testo: '📞 Da richiamare: pronto da ' + giorni + ' giorni, nessun richiamo' };
  }
  if (elenco.length === 1 && giorni >= GIORNI_SECONDO_RICHIAMO &&
      giorniTraISO(inviato, String(ultimo.registrato_il).slice(0, 10)) < GIORNI_SECONDO_RICHIAMO) {
    return { testo: '📞 Secondo richiamo: pronto da ' + giorni + ' giorni' };
  }
  return null;
}

function testoRichiamo(r) {
  return fd(String(r.registrato_il).slice(0, 10)) + ' ' + (ESITI_RICHIAMO[r.esito] || r.esito) +
    (r.esito === 'richiamare' && r.richiamare_il ? ' il ' + fd(r.richiamare_il) : '') +
    (r.nota ? ': ' + r.nota : '') + (r.registrato_da_nome ? ' (' + r.registrato_da_nome + ')' : '');
}

function htmlElencoRichiami(richiami, max) {
  const elenco = richiami || [];
  if (!elenco.length) return '';
  const mostra = elenco.slice(0, max || elenco.length);
  return '<div style="font-size:12px;color:var(--m);margin-top:6px">' +
    mostra.map(function(r) { return '<div style="overflow-wrap:anywhere">📞 ' + esc(testoRichiamo(r)) + '</div>'; }).join('') +
    (elenco.length > mostra.length ? '<div>… e altri ' + (elenco.length - mostra.length) + '</div>' : '') +
    '</div>';
}

// ── I miei preventivi (js/13): segnaposto .richiami-rapp[data-preventivo] ──
async function caricaRichiamiRappresentante(box) {
  if (!box || ROLE !== 'rappresentante' || !(await verificaRichiamiPreventivoDisponibile())) return;
  const posti = Array.from(box.querySelectorAll('.richiami-rapp[data-preventivo]'));
  if (!posti.length) return;
  let richiami;
  try { richiami = await leggiRichiamiPreventivi(posti.map(function(p) { return p.dataset.preventivo; })); }
  catch (e) { console.warn('Richiami dei preventivi:', e); return; }
  posti.forEach(function(p) {
    const id = p.dataset.preventivo;
    const elenco = richiami[id] || [];
    const dovuto = richiamoDovuto(p.dataset.inviato, elenco);
    p.innerHTML = (dovuto ? '<div style="margin-top:8px"><span class="bx bwarn">' + esc(dovuto.testo) + '</span></div>' : '') +
      htmlElencoRichiami(elenco, 3) +
      '<div style="margin-top:8px"><button type="button" class="btn sm" data-id="' + esc(id) + '" data-numero="' + esc(p.dataset.numero || '') + '" onclick="apriRichiamoPreventivo(this.dataset.id, this.dataset.numero)">📞 Registra richiamo</button></div>';
  });
}

function apriRichiamoPreventivo(preventivoId, numero) {
  richiamoInCorso = { preventivoId: preventivoId, numero: numero };
  let el = ge('m-richiamo-preventivo');
  if (!el) {
    el = document.createElement('div');
    el.className = 'mbg';
    el.id = 'm-richiamo-preventivo';
    document.body.appendChild(el);
  }
  const domani = aggiungiGiorniISO(dataLocaleISO(), 1);
  el.innerHTML = '<div class="modal" style="max-width:460px">' +
    '<button class="x" onclick="closeM(\'m-richiamo-preventivo\')">×</button>' +
    '<h3>📞 Registra richiamo</h3>' +
    '<div style="font-size:13px;color:var(--m);margin-bottom:10px">' + (numero ? 'Preventivo n. ' + esc(numero) : '') + '</div>' +
    '<div class="f"><label>Esito del richiamo *</label><select id="mrp-esito" onchange="aggiornaRichiamoPreventivo()">' +
      '<option value="">— Scegli —</option>' +
      Object.keys(ESITI_RICHIAMO).map(function(k) { return '<option value="' + k + '">' + ESITI_RICHIAMO[k] + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="f" id="mrp-data-box" style="display:none"><label>Richiamare il *</label><input type="date" id="mrp-data" min="' + domani + '" oninput="aggiornaRichiamoPreventivo()"></div>' +
    '<div class="f"><label id="mrp-nota-label">Nota</label><textarea id="mrp-nota" rows="2" maxlength="500" oninput="aggiornaRichiamoPreventivo()" placeholder="Cosa ha detto il cliente"></textarea></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
      '<button class="btn" onclick="closeM(\'m-richiamo-preventivo\')">Annulla</button>' +
      '<button class="btn p" id="mrp-salva" disabled onclick="salvaRichiamoPreventivo()">📞 Registra</button>' +
    '</div></div>';
  openM('m-richiamo-preventivo');
}

function aggiornaRichiamoPreventivo() {
  const esito = v('mrp-esito');
  const conData = esito === 'richiamare';
  const notaObbligatoria = esito === 'altro' || esito === 'vuole_modifiche';
  ge('mrp-data-box').style.display = conData ? '' : 'none';
  ge('mrp-nota-label').textContent = notaObbligatoria ? 'Nota *' : 'Nota';
  const pronto = !!esito && (!conData || (v('mrp-data') && v('mrp-data') > dataLocaleISO())) && (!notaObbligatoria || v('mrp-nota').trim());
  ge('mrp-salva').disabled = !pronto;
}

async function salvaRichiamoPreventivo() {
  const r = richiamoInCorso;
  if (!r) return;
  const btn = ge('mrp-salva');
  btn.disabled = true;
  const esito = v('mrp-esito');
  const { error } = await db.rpc('registra_richiamo_preventivo', {
    p_preventivo_id: r.preventivoId, p_esito: esito,
    p_nota: v('mrp-nota').trim() || null, p_richiamare_il: esito === 'richiamare' ? v('mrp-data') : null
  });
  if (error) { btn.disabled = false; toast('Richiamo non registrato: ' + error.message, 'err'); return; }
  closeM('m-richiamo-preventivo');
  toast('Richiamo registrato ✓', 'ok');
  richiamoInCorso = null;
  const box = ge('preventivi-rapp-lista');
  if (box) await caricaRichiamiRappresentante(box);
  if (typeof caricaToccaAMe === 'function') caricaToccaAMe().catch(function() {});
}

// ── Cosa tocca a me (js/46): preventivi da richiamare ──────────────────
async function preventiviDaRichiamare() {
  if (!(await verificaRichiamiPreventivoDisponibile())) return null;
  const { data, error } = await db.from('preventivi')
    .select('id, numero, inviato_a_rappresentante_il, clienti!inner(rappresentante_id)')
    .eq('stato', 'inviato_a_rappresentante').eq('clienti.rappresentante_id', ME.id).is('sostituito_da', null)
    .or('preventivo_cliente_pdf_path.not.is.null,pdf_esterno_titolare_path.not.is.null')
    .limit(2000);
  if (error) throw error;
  const richiami = await leggiRichiamiPreventivi((data || []).map(function(p) { return p.id; }));
  return (data || []).filter(function(p) { return richiamoDovuto(p.inviato_a_rappresentante_il, richiami[p.id]); });
}

// ── Condizioni diverse nell'esito "Accettato" (js/18h) ─────────────────
async function preparaCondizioniDiverseEsito(accetta) {
  const box = ge('mep-box-condizioni');
  if (!box) return;
  ge('mep-condizioni-diverse').checked = false;
  ge('mep-condizioni-testo').value = '';
  ge('mep-condizioni-testo-box').style.display = 'none';
  box.style.display = accetta && (await verificaRichiamiPreventivoDisponibile()) ? '' : 'none';
}

function cambiaCondizioniDiverseEsito() {
  ge('mep-condizioni-testo-box').style.display = ge('mep-condizioni-diverse').checked ? '' : 'none';
  if (typeof aggiornaBottoneEsitoPreventivo === 'function') aggiornaBottoneEsitoPreventivo();
}

function condizioniDiverseEsitoPronte() {
  const cb = ge('mep-condizioni-diverse');
  const box = ge('mep-box-condizioni');
  if (!cb || !box || box.style.display === 'none' || !cb.checked) return true;
  return v('mep-condizioni-testo').trim().length >= 3;
}

// Dopo accetta_preventivo: '' se niente da segnare, altrimenti il testo per il messaggio
async function salvaCondizioniDiverseEsito(preventivoId) {
  const cb = ge('mep-condizioni-diverse');
  const box = ge('mep-box-condizioni');
  if (!cb || !box || box.style.display === 'none' || !cb.checked) return '';
  const { error } = await db.rpc('segna_condizioni_diverse_preventivo', { p_preventivo_id: preventivoId, p_testo: v('mep-condizioni-testo').trim() });
  if (error) {
    toast('Preventivo accettato, ma le condizioni diverse non sono state salvate: ' + error.message + '. Scrivile al titolare.', 'err');
    return null;
  }
  return ' Condizioni diverse segnalate al titolare.';
}

// ── Titolare: condizioni da vedere ─────────────────────────────────────
async function condizioniDiverseDaVedere() {
  if (!(await verificaRichiamiPreventivoDisponibile())) return null;
  const { data, error } = await db.from('preventivi_condizioni_diverse')
    .select('preventivo_id, testo, segnalato_da_nome, segnalato_il, preventivi!inner(numero, clienti(ragione_sociale))')
    .is('visto_il', null).order('segnalato_il', { ascending: true }).limit(500);
  if (error) throw error;
  return data || [];
}

async function apriCondizioniDiverseTitolare() {
  let righe;
  try { righe = await condizioniDiverseDaVedere(); } catch (e) { toast('Non riesco a leggere le condizioni: ' + (e.message || e), 'err'); return; }
  let el = ge('m-condizioni-diverse');
  if (!el) {
    el = document.createElement('div');
    el.className = 'mbg';
    el.id = 'm-condizioni-diverse';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="modal" style="max-width:560px">' +
    '<button class="x" onclick="closeM(\'m-condizioni-diverse\')">×</button>' +
    '<h3>🤝 Preventivi accettati con condizioni diverse</h3>' +
    '<div class="al2 i" style="margin-bottom:10px;font-size:12px">L\'accettazione è già registrata: qui dai l\'OK (con una nota, se serve) o senti il rappresentante.</div>' +
    (!(righe || []).length ? '<div class="empty">Niente da vedere 🎉</div>' : righe.map(function(r) {
      const p = r.preventivi || {};
      return '<div class="card" style="margin-bottom:10px">' +
        '<div style="font-weight:700">Preventivo n. ' + esc(String(p.numero || '—')) + ' · ' + esc((p.clienti && p.clienti.ragione_sociale) || '') + '</div>' +
        '<div style="font-size:13px;margin-top:4px;overflow-wrap:anywhere">' + esc(r.testo) + '</div>' +
        '<div style="font-size:11px;color:var(--m);margin-top:4px">Segnalato da ' + esc(r.segnalato_da_nome || '—') + ' il ' + esc(fd(String(r.segnalato_il).slice(0, 10))) + '</div>' +
        '<div class="f" style="margin:8px 0 0"><input type="text" id="mcd-nota-' + esc(r.preventivo_id) + '" maxlength="500" placeholder="Nota (facoltativa)"></div>' +
        '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">' +
          '<button class="btn sm p" data-id="' + esc(r.preventivo_id) + '" onclick="vistaCondizioniDiverse(this.dataset.id)">✓ OK, visto</button>' +
          '<button class="btn sm" data-id="' + esc(r.preventivo_id) + '" onclick="closeM(\'m-condizioni-diverse\');openPreventivoDetail(this.dataset.id)">Apri il preventivo</button>' +
        '</div></div>';
    }).join('')) +
    '</div>';
  openM('m-condizioni-diverse');
}

async function vistaCondizioniDiverse(preventivoId) {
  const nota = v('mcd-nota-' + preventivoId).trim() || null;
  const { error } = await db.rpc('vista_condizioni_diverse_preventivo', { p_preventivo_id: preventivoId, p_nota: nota });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  toast('OK registrato ✓', 'ok');
  if (ge('m-condizioni-diverse') && ge('m-condizioni-diverse').classList.contains('on')) await apriCondizioniDiverseTitolare();
  const scheda = ge('pvd-richiami');
  if (scheda && scheda.dataset.preventivo === preventivoId) await caricaRichiamiPreventivoScheda({ id: preventivoId, stato: scheda.dataset.stato, inviato_a_rappresentante_il: scheda.dataset.inviato });
  if (typeof caricaToccaAMe === 'function') caricaToccaAMe().catch(function() {});
}

// ── Scheda del preventivo (js/18): richiami e condizioni diverse ────────
async function caricaRichiamiPreventivoScheda(preventivo) {
  const box = ge('pvd-richiami');
  if (!box) return;
  box.innerHTML = '';
  if (!preventivo || !preventivo.id || !(await verificaRichiamiPreventivoDisponibile())) return;
  box.dataset.preventivo = preventivo.id;
  box.dataset.stato = preventivo.stato || '';
  box.dataset.inviato = preventivo.inviato_a_rappresentante_il || '';
  let richiami = [], cond = null;
  try {
    const [rr, rc] = await Promise.all([
      leggiRichiamiPreventivi([preventivo.id]),
      db.from('preventivi_condizioni_diverse').select('testo,segnalato_da_nome,segnalato_il,visto_da_nome,visto_il,nota_titolare').eq('preventivo_id', preventivo.id).maybeSingle()
    ]);
    richiami = rr[preventivo.id] || [];
    cond = rc.data || null;
  } catch (e) { console.warn('Richiami del preventivo:', e); return; }
  if (box.dataset.preventivo !== preventivo.id) return;
  let html = '';
  if (cond) {
    html += '<div class="al2 ' + (cond.visto_il ? 'i' : 'w') + '" style="margin-top:8px;font-size:13px">' +
      '<b>🤝 Accettato con condizioni diverse:</b> ' + esc(cond.testo) +
      '<div style="font-size:11px;margin-top:4px">Segnalato da ' + esc(cond.segnalato_da_nome || '—') + ' il ' + esc(fd(String(cond.segnalato_il).slice(0, 10))) +
      (cond.visto_il ? ' · ✓ OK di ' + esc(cond.visto_da_nome || 'titolare') + ' il ' + esc(fd(String(cond.visto_il).slice(0, 10))) + (cond.nota_titolare ? ': ' + esc(cond.nota_titolare) : '') : ' · OK del titolare da dare') +
      '</div>' +
      (!cond.visto_il && ROLE === 'titolare'
        ? '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><input type="text" id="mcd-nota-' + esc(preventivo.id) + '" maxlength="500" placeholder="Nota (facoltativa)" style="flex:1;min-width:140px">' +
          '<button class="btn sm p" data-id="' + esc(preventivo.id) + '" onclick="vistaCondizioniDiverse(this.dataset.id)">✓ OK, visto</button></div>'
        : '') +
      '</div>';
  }
  const dovuto = preventivo.stato === 'inviato_a_rappresentante' ? richiamoDovuto(preventivo.inviato_a_rappresentante_il, richiami) : null;
  if (richiami.length || dovuto) {
    html += '<div style="margin-top:8px"><div style="font-size:12px;font-weight:600">📞 Richiami al cliente</div>' +
      (dovuto ? '<span class="bx bwarn" style="margin-top:4px">' + esc(dovuto.testo) + '</span>' : '') +
      htmlElencoRichiami(richiami) + '</div>';
  }
  box.innerHTML = html;
}
