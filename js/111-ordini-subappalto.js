// ── F18.23 Ordini ai subappaltatori (sql/149, scelte di Erika del 20/11:
// "Ordine + SAL a percentuale scritta", ritenuta di partenza 5%) ──────────
// Riquadro "🤝 Ordini ai subappaltatori" nella scheda della commessa (js/26
// chiama caricaOrdiniSubappaltoCommessa, #cmd-subappalti):
//   - Acquisti (commerciale) e titolare fanno l'ordine a corpo: subappaltatore
//     (elenco_subappaltatori_ordine, perché Acquisti non legge l'anagrafica),
//     righe per lavorazione della commessa (o scritte a mano) con l'importo,
//     ritenuta %, materiali forniti da TOLI, note; PDF dell'ordine come js/27;
//   - registrano i SAL scrivendo la % CUMULATIVA: lordo = totale x % − SAL
//     precedenti, ritenuta, netto (calcolati dal database); al 100% l'ordine
//     si chiude; annullano solo un ordine senza SAL;
//   - la segreteria vede tutto con gli importi (per pagare), il capo tecnico
//     vede cosa fa il subappaltatore e a che punto è, SENZA importi.
// Senza sql/149 (ordini_subappalto_attivi) non compare nulla.

let ordiniSubappaltoVerificato = null;
let ordiniSubappaltoCommessa = null;   // { commessa, ordini, sal: { ordineId: [...] } }
let lavorazioniOrdineSubappalto = [];

const RUOLI_VEDONO_SUBAPPALTI = ['titolare', 'commerciale', 'segreteria', 'capo_tecnico'];
const RUOLI_FANNO_SUBAPPALTI = ['titolare', 'commerciale'];
const STATI_ORDINE_SUBAPPALTO = {
  emesso: { testo: 'Emesso', classe: 'bblue' },
  chiuso: { testo: '✅ Chiuso (SAL al 100%)', classe: 'bok' },
  annullato: { testo: 'Annullato', classe: 'bgray' }
};

async function verificaOrdiniSubappaltoDisponibili() {
  if (ordiniSubappaltoVerificato !== null) return ordiniSubappaltoVerificato;
  try {
    const { data, error } = await db.rpc('ordini_subappalto_attivi');
    ordiniSubappaltoVerificato = !error && data === true;
  } catch (e) {
    ordiniSubappaltoVerificato = false;
  }
  return ordiniSubappaltoVerificato;
}

function vedeImportiSubappalto() {
  return ROLE !== 'capo_tecnico';
}

function percentualeLeggibile(p) {
  return String(Number(p || 0)).replace('.', ',') + '%';
}

async function leggiOrdiniSubappaltoCommessa(commessaId) {
  const { data, error } = await db.rpc('ordini_subappalto_cantiere', { p_commessa_id: commessaId });
  if (error) return { ordini: [], sal: {}, errore: error.message };
  const ordini = Array.isArray(data) ? data : [];
  const sal = {};
  if (vedeImportiSubappalto() && ordini.length) {
    const r = await db.from('ordini_subappalto_sal')
      .select('id, ordine_id, numero, percentuale, importo_lordo, ritenuta, netto, data_sal, nota, creato_da_nome')
      .in('ordine_id', ordini.map(function(o) { return o.id; })).order('numero', { ascending: true });
    (r.data || []).forEach(function(s) { (sal[s.ordine_id] = sal[s.ordine_id] || []).push(s); });
  }
  return { ordini: ordini, sal: sal, errore: '' };
}

async function caricaOrdiniSubappaltoCommessa(commessa) {
  const box = ge('cmd-subappalti');
  if (!box) return;
  box.innerHTML = '';
  if (!commessa || !RUOLI_VEDONO_SUBAPPALTI.includes(ROLE) || !(await verificaOrdiniSubappaltoDisponibili())) return;
  const letti = await leggiOrdiniSubappaltoCommessa(commessa.id);
  if (typeof commessaApertaId !== 'undefined' && commessaApertaId && commessaApertaId !== commessa.id) return;
  ordiniSubappaltoCommessa = { commessa: commessa, ordini: letti.ordini, sal: letti.sal };
  const crea = RUOLI_FANNO_SUBAPPALTI.includes(ROLE) && (ROLE === 'titolare' || !['chiusa', 'annullata'].includes(commessa.stato));
  if (!letti.ordini.length && !crea && !letti.errore) return;
  box.innerHTML = '<div class="card">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">' +
      '<div style="font-size:14px;font-weight:700">🤝 Ordini ai subappaltatori (' + letti.ordini.filter(function(o) { return o.stato !== 'annullato'; }).length + ')</div>' +
      (crea ? '<button type="button" class="btn sm p" onclick="apriNuovoOrdineSubappalto()">+ Ordine al subappaltatore</button>' : '') +
    '</div>' +
    '<div style="font-size:12px;color:var(--m);margin-bottom:6px">' + (vedeImportiSubappalto()
      ? 'Lavoro a corpo per lavorazione, con la ritenuta. Il SAL si registra scrivendo la percentuale fatta in tutto.'
      : 'Cosa fa il subappaltatore e a che punto è (gli importi li vedono Acquisti, segreteria e titolare).') + '</div>' +
    (letti.errore ? '<div class="al2 e">Errore: ' + esc(letti.errore) + '</div>' : '') +
    (letti.ordini.length ? letti.ordini.map(htmlOrdineSubappalto).join('') : '<div class="empty" style="font-size:12px">Nessun ordine ai subappaltatori.</div>') +
    '</div>';
}

function htmlOrdineSubappalto(o) {
  const s = STATI_ORDINE_SUBAPPALTO[o.stato] || { testo: o.stato, classe: 'bgray' };
  const importi = vedeImportiSubappalto();
  const fa = RUOLI_FANNO_SUBAPPALTI.includes(ROLE) && o.stato === 'emesso';
  const sal = (ordiniSubappaltoCommessa && ordiniSubappaltoCommessa.sal[o.id]) || [];
  const perc = Number(o.percentuale_sal || 0);
  const totRitenuta = sal.reduce(function(t, x) { return t + Number(x.ritenuta || 0); }, 0);
  const totNetto = sal.reduce(function(t, x) { return t + Number(x.netto || 0); }, 0);
  return '<div style="padding:8px 0;border-top:0.5px solid var(--bo);font-size:13px">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">' +
      '<div style="min-width:0"><b>' + esc(o.codice) + '</b> · ' + esc(o.subappaltatore || '') +
        '<div style="font-size:12px;color:var(--m)">del ' + esc(fd(o.data_ordine)) +
          (importi && o.importo_totale != null ? ' · ' + esc(euroPreventivo(o.importo_totale)) + ' a corpo · ritenuta ' + esc(percentualeLeggibile(o.ritenuta_perc)) : '') + '</div>' +
      '</div>' +
      '<span class="bx ' + s.classe + '" style="flex-shrink:0">' + esc(s.testo) + '</span>' +
    '</div>' +
    '<div style="margin-top:4px">' + (o.righe || []).map(function(r) {
      return '<div style="font-size:12px">• ' + esc(r.descrizione) + (importi && r.importo != null ? ' — ' + esc(euroPreventivo(r.importo)) : '') + '</div>';
    }).join('') + '</div>' +
    (o.materiali_toli ? '<div style="font-size:12px;margin-top:2px"><b>Materiali di TOLI:</b> ' + esc(o.materiali_toli) + '</div>' : '') +
    (o.note ? '<div style="font-size:12px;color:var(--m);margin-top:2px">' + esc(o.note) + '</div>' : '') +
    (o.stato === 'annullato' && o.motivo_annullamento ? '<div style="font-size:12px;color:var(--m)">Motivo: ' + esc(o.motivo_annullamento) + '</div>' : '') +
    (o.stato !== 'annullato' ? '<div style="margin-top:6px"><div style="font-size:12px">Avanzamento SAL: <b>' + esc(percentualeLeggibile(perc)) + '</b></div>' +
      '<div style="height:6px;background:var(--bo);border-radius:3px;overflow:hidden;margin-top:2px"><div style="height:100%;width:' + Math.min(100, perc) + '%;background:var(--g)"></div></div></div>' : '') +
    (importi && sal.length ? '<div style="overflow-x:auto;margin-top:6px"><table style="width:100%;font-size:12px;border-collapse:collapse">' +
      '<tr style="color:var(--m);text-align:left"><th>SAL</th><th>Data</th><th>%</th><th style="text-align:right">Lordo</th><th style="text-align:right">Ritenuta</th><th style="text-align:right">Netto</th></tr>' +
      sal.map(function(x) {
        return '<tr style="border-top:0.5px solid var(--bo)"><td>' + x.numero + '</td><td>' + esc(fd(x.data_sal)) + '</td><td>' + esc(percentualeLeggibile(x.percentuale)) + '</td>' +
          '<td style="text-align:right">' + esc(euroPreventivo(x.importo_lordo)) + '</td><td style="text-align:right">' + esc(euroPreventivo(x.ritenuta)) + '</td>' +
          '<td style="text-align:right">' + esc(euroPreventivo(x.netto)) + '</td></tr>' +
          (x.nota ? '<tr><td></td><td colspan="5" style="color:var(--m)">' + esc(x.nota) + '</td></tr>' : '');
      }).join('') +
      '<tr style="border-top:0.5px solid var(--bo);font-weight:700"><td colspan="4">Totale</td><td style="text-align:right">' + esc(euroPreventivo(totRitenuta)) + '</td>' +
      '<td style="text-align:right">' + esc(euroPreventivo(totNetto)) + '</td></tr></table>' +
      '<div style="font-size:11px;color:var(--m)">Ritenuta trattenuta finora: ' + esc(euroPreventivo(totRitenuta)) + '</div></div>' : '') +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
      (fa ? '<button type="button" class="btn sm p" data-id="' + esc(o.id) + '" onclick="apriSalSubappalto(this.dataset.id)">+ SAL</button>' : '') +
      (importi ? '<button type="button" class="btn sm" data-id="' + esc(o.id) + '" onclick="creaPdfOrdineSubappalto(this.dataset.id)">📄 PDF</button>' : '') +
      (fa && !sal.length ? '<button type="button" class="btn sm" data-id="' + esc(o.id) + '" onclick="annullaOrdineSubappalto(this.dataset.id)">✕ Annulla</button>' : '') +
    '</div>' +
  '</div>';
}

function finestraOrdineSubappalto(html, larghezza) {
  let el = ge('m-ordine-subappalto');
  if (!el) {
    el = document.createElement('div');
    el.className = 'mbg';
    el.id = 'm-ordine-subappalto';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="modal" style="max-width:' + (larghezza || 560) + 'px"><button class="x" onclick="closeM(\'m-ordine-subappalto\')">×</button>' + html + '</div>';
  openM('m-ordine-subappalto');
}

async function apriNuovoOrdineSubappalto() {
  const m = ordiniSubappaltoCommessa;
  if (!m) return;
  const [rs, rl] = await Promise.all([
    db.rpc('elenco_subappaltatori_ordine'),
    db.from('commesse_lavorazioni').select('id, nome, quantita, unita_misura').eq('commessa_id', m.commessa.id).order('ordine', { ascending: true })
  ]);
  if (rs.error) { toast('Subappaltatori non letti: ' + rs.error.message, 'err'); return; }
  const subs = rs.data || [];
  if (!subs.length) { toast('Nessun subappaltatore attivo: la segreteria lo aggiunge in Team e subappalti', 'err'); return; }
  lavorazioniOrdineSubappalto = rl.error ? [] : (rl.data || []);
  finestraOrdineSubappalto('<h3>🤝 Ordine al subappaltatore</h3>' +
    '<div style="font-size:12px;color:var(--m);margin-bottom:8px">Commessa ' + esc(m.commessa.codice || '') + '. Lavoro a corpo: una riga per lavorazione con il suo importo.</div>' +
    '<div class="f"><label>Subappaltatore *</label><select id="mos-sub"><option value="">— scegli —</option>' +
      subs.map(function(s) { return '<option value="' + esc(s.id) + '">' + esc(s.ragione_sociale) + (s.lavorazioni ? ' — ' + esc(s.lavorazioni) : '') + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="f"><label>Lavorazioni a corpo *</label><div id="mos-righe"></div>' +
      '<button type="button" class="btn sm" onclick="aggiungiRigaOrdineSubappalto()">+ Riga</button>' +
      '<div style="font-size:13px;margin-top:6px">Totale: <b id="mos-totale">0,00 €</b></div></div>' +
    '<div class="fr"><div class="f"><label>Ritenuta % *</label><input type="text" id="mos-ritenuta" inputmode="decimal" value="5"></div>' +
      '<div class="f"><label>Data dell\'ordine</label><input type="date" id="mos-data" value="' + esc(dataLocaleISO()) + '"></div></div>' +
    '<div class="f"><label>Materiali forniti da TOLI</label><textarea id="mos-materiali" rows="2" maxlength="2000" placeholder="Es. porte, ferramenta e sigillanti li fornisce TOLI; il subappaltatore porta attrezzatura e minuteria"></textarea></div>' +
    '<div class="f"><label>Note</label><textarea id="mos-note" rows="2" maxlength="2000" placeholder="Tempi, condizioni di pagamento, sicurezza…"></textarea></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeM(\'m-ordine-subappalto\')">Annulla</button>' +
    '<button class="btn p" id="mos-salva" onclick="salvaNuovoOrdineSubappalto()">Crea l\'ordine</button></div>', 620);
  aggiungiRigaOrdineSubappalto();
}

function aggiungiRigaOrdineSubappalto() {
  const box = ge('mos-righe');
  if (!box) return;
  const riga = document.createElement('div');
  riga.className = 'mos-riga';
  riga.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap';
  riga.innerHTML = (lavorazioniOrdineSubappalto.length ? '<select class="mos-lav" style="flex:1 1 180px" onchange="sceltaLavorazioneOrdineSubappalto(this)"><option value="">Lavorazione scritta a mano</option>' +
      lavorazioniOrdineSubappalto.map(function(l) { return '<option value="' + esc(l.id) + '">' + esc(l.nome) + '</option>'; }).join('') + '</select>' : '') +
    '<input type="text" class="mos-descr" maxlength="300" placeholder="Descrizione della lavorazione" style="flex:2 1 200px">' +
    '<input type="text" class="mos-importo" inputmode="decimal" placeholder="Importo €" style="flex:0 1 110px" oninput="totaleOrdineSubappalto()">' +
    '<button type="button" class="btn sm" title="Togli la riga" onclick="this.parentNode.remove();totaleOrdineSubappalto()">✕</button>';
  box.appendChild(riga);
}

function sceltaLavorazioneOrdineSubappalto(sel) {
  const l = lavorazioniOrdineSubappalto.find(function(x) { return x.id === sel.value; });
  const descr = sel.parentNode.querySelector('.mos-descr');
  if (l && descr && !descr.value.trim()) {
    descr.value = l.nome + (l.quantita ? ' (' + String(Number(l.quantita)).replace('.', ',') + ' ' + (l.unita_misura || '') + ')' : '');
  }
}

function numeroScrittoSubappalto(testo) {
  const t = String(testo || '').trim().replace(/\s|€/g, '');
  if (!t) return NaN;
  return Number(t.indexOf(',') >= 0 ? t.replace(/\./g, '').replace(',', '.') : t);
}

function righeOrdineSubappalto() {
  return Array.from(document.querySelectorAll('#mos-righe .mos-riga')).map(function(r) {
    const lav = r.querySelector('.mos-lav');
    return { lavorazione_id: lav && lav.value ? lav.value : null, descrizione: r.querySelector('.mos-descr').value.trim(),
             importo: numeroScrittoSubappalto(r.querySelector('.mos-importo').value) };
  }).filter(function(r) { return r.descrizione || r.importo; });
}

function totaleOrdineSubappalto() {
  const tot = righeOrdineSubappalto().reduce(function(t, r) { return t + (r.importo > 0 ? r.importo : 0); }, 0);
  if (ge('mos-totale')) ge('mos-totale').textContent = euroPreventivo(tot);
}

async function salvaNuovoOrdineSubappalto() {
  const m = ordiniSubappaltoCommessa;
  if (!m) return;
  const righe = righeOrdineSubappalto();
  if (!v('mos-sub')) { toast('Scegli il subappaltatore', 'err'); return; }
  if (!righe.length) { toast('Scrivi almeno una lavorazione con l\'importo', 'err'); return; }
  if (righe.some(function(r) { return !r.descrizione || !(r.importo > 0); })) { toast('Ogni riga vuole descrizione e importo maggiore di zero', 'err'); return; }
  const ritenuta = numeroScrittoSubappalto(v('mos-ritenuta'));
  if (!(ritenuta >= 0 && ritenuta <= 30)) { toast('La ritenuta va da 0 a 30%', 'err'); return; }
  const btn = ge('mos-salva');
  btn.disabled = true;
  const { error } = await db.rpc('crea_ordine_subappalto', {
    p_commessa_id: m.commessa.id, p_subappaltatore_id: v('mos-sub'), p_righe: righe, p_ritenuta_perc: ritenuta,
    p_materiali_toli: v('mos-materiali').trim() || null, p_note: v('mos-note').trim() || null, p_data: v('mos-data') || null
  });
  btn.disabled = false;
  if (error) { toast('Ordine non creato: ' + error.message, 'err'); return; }
  closeM('m-ordine-subappalto');
  toast('Ordine al subappaltatore creato ✓', 'ok');
  await caricaOrdiniSubappaltoCommessa(m.commessa);
}

function ordineSubappaltoAperto(id) {
  return ordiniSubappaltoCommessa && ordiniSubappaltoCommessa.ordini.find(function(o) { return o.id === id; });
}

function apriSalSubappalto(id) {
  const o = ordineSubappaltoAperto(id);
  if (!o) return;
  const sal = ordiniSubappaltoCommessa.sal[id] || [];
  const prima = Number(o.percentuale_sal || 0);
  const lordoPrima = sal.reduce(function(t, x) { return t + Number(x.importo_lordo || 0); }, 0);
  finestraOrdineSubappalto('<h3>+ SAL ' + (sal.length + 1) + ' · ' + esc(o.codice) + '</h3>' +
    '<div style="font-size:13px;margin-bottom:8px">' + esc(o.subappaltatore || '') + ' · ' + esc(euroPreventivo(o.importo_totale)) + ' a corpo · ritenuta ' + esc(percentualeLeggibile(o.ritenuta_perc)) +
      '<div style="font-size:12px;color:var(--m)">SAL precedenti: ' + esc(percentualeLeggibile(prima)) + ' (' + esc(euroPreventivo(lordoPrima)) + ' lordi)</div></div>' +
    '<div class="fr"><div class="f"><label>Percentuale fatta IN TUTTO *</label><input type="text" id="msal-perc" inputmode="decimal" placeholder="Oltre il ' + esc(percentualeLeggibile(prima)) + ', al massimo 100" oninput="anteprimaSalSubappalto()"></div>' +
      '<div class="f"><label>Data del SAL</label><input type="date" id="msal-data" value="' + esc(dataLocaleISO()) + '"></div></div>' +
    '<div id="msal-anteprima" class="al2 i" style="font-size:13px">Scrivi la percentuale per vedere gli importi.</div>' +
    '<div class="f"><label>Nota</label><textarea id="msal-nota" rows="2" maxlength="1000" placeholder="Es. posate 12 porte su 24"></textarea></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeM(\'m-ordine-subappalto\')">Annulla</button>' +
    '<button class="btn p" id="msal-salva" data-id="' + esc(id) + '" onclick="salvaSalSubappalto(this.dataset.id)">Registra il SAL</button></div>', 480);
  ge('msal-anteprima').dataset.ordine = id;
}

// Stesso calcolo del database (registra_sal_subappalto): solo anteprima
function calcoloSalSubappalto(o, sal, perc) {
  const lordoPrima = sal.reduce(function(t, x) { return t + Number(x.importo_lordo || 0); }, 0);
  const lordo = Math.max(0, Math.round(Number(o.importo_totale) * perc) / 100 - lordoPrima);
  const ritenuta = Math.round(lordo * Number(o.ritenuta_perc)) / 100;
  return { lordo: lordo, ritenuta: ritenuta, netto: lordo - ritenuta };
}

function anteprimaSalSubappalto() {
  const box = ge('msal-anteprima');
  const o = box && ordineSubappaltoAperto(box.dataset.ordine);
  if (!o) return;
  const perc = numeroScrittoSubappalto(v('msal-perc'));
  const prima = Number(o.percentuale_sal || 0);
  if (!(perc > prima && perc <= 100)) { box.className = 'al2 w'; box.textContent = 'La percentuale va oltre il ' + percentualeLeggibile(prima) + ' e al massimo 100.'; return; }
  const c = calcoloSalSubappalto(o, ordiniSubappaltoCommessa.sal[o.id] || [], perc);
  box.className = 'al2 i';
  box.innerHTML = 'Lordo <b>' + esc(euroPreventivo(c.lordo)) + '</b> − ritenuta ' + esc(euroPreventivo(c.ritenuta)) + ' = netto da pagare <b>' + esc(euroPreventivo(c.netto)) + '</b>' +
    (perc === 100 ? '<div style="font-size:12px">Al 100% l\'ordine si chiude.</div>' : '');
}

async function salvaSalSubappalto(id) {
  const o = ordineSubappaltoAperto(id);
  if (!o) return;
  const perc = numeroScrittoSubappalto(v('msal-perc'));
  if (!(perc > Number(o.percentuale_sal || 0) && perc <= 100)) { toast('Percentuale non valida', 'err'); return; }
  const btn = ge('msal-salva');
  btn.disabled = true;
  const { error } = await db.rpc('registra_sal_subappalto', { p_ordine_id: id, p_percentuale: perc, p_data: v('msal-data') || null, p_nota: v('msal-nota').trim() || null });
  btn.disabled = false;
  if (error) { toast('SAL non registrato: ' + error.message, 'err'); return; }
  closeM('m-ordine-subappalto');
  toast('SAL registrato ✓', 'ok');
  await caricaOrdiniSubappaltoCommessa(ordiniSubappaltoCommessa.commessa);
}

async function annullaOrdineSubappalto(id) {
  const o = ordineSubappaltoAperto(id);
  if (!o) return;
  const motivo = prompt('Perché annulli l\'ordine ' + o.codice + '?');
  if (motivo === null) return;
  const { error } = await db.rpc('annulla_ordine_subappalto', { p_ordine_id: id, p_motivo: motivo });
  if (error) { toast('Non annullato: ' + error.message, 'err'); return; }
  toast('Ordine annullato ✓', 'ok');
  await caricaOrdiniSubappaltoCommessa(ordiniSubappaltoCommessa.commessa);
}

// PDF dell'ordine (come creaPdfOrdineFornitore di js/27), con i SAL se ci sono
async function creaPdfOrdineSubappalto(id) {
  if (!vedeImportiSubappalto()) return null;
  if (!(await preparaPDF())) return null;
  const { data: o, error } = await db.from('ordini_subappalto').select('*, commesse(codice)').eq('id', id).maybeSingle();
  if (error || !o) { toast('Ordine non trovato per il PDF' + (error ? ': ' + error.message : ''), 'err'); return null; }
  const sal = (ordiniSubappaltoCommessa && ordiniSubappaltoCommessa.sal[id]) || [];
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margine = 16, larghezza = 210, destra = larghezza - margine;

  doc.setFillColor(8, 80, 65);
  doc.rect(0, 0, larghezza, 34, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255, 255, 255);
  doc.text('TOLI FIRE', margine, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Via Bellatalla 62, Ospedaletto — 56121 Pisa', margine, 23);
  doc.text('P.IVA: 02490980501 — amministrazione@toli-fire.com', margine, 28);
  doc.setFontSize(10);
  doc.text('Ordine di subappalto', destra, 16, { align: 'right' });

  let y = 46;
  doc.setTextColor(25, 25, 25); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('ORDINE N. ' + o.codice, margine, y);
  doc.setFontSize(10);
  doc.text('Data: ' + fd(o.data_ordine), destra, y, { align: 'right' });
  if (o.stato === 'annullato') {
    doc.setTextColor(200, 30, 30); doc.setFontSize(13);
    doc.text('ORDINE ANNULLATO', destra, y + 7, { align: 'right' });
    doc.setTextColor(25, 25, 25);
  }

  y += 12;
  const colonnaDestra = 118;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('Spett.le subappaltatore', margine, y);
  doc.text('Riferimenti', colonnaDestra, y);
  doc.setFont('helvetica', 'normal');
  const sinistra = [o.subappaltatore_ragione_sociale, o.subappaltatore_partita_iva ? 'P.IVA ' + o.subappaltatore_partita_iva : '',
    o.subappaltatore_indirizzo, o.subappaltatore_referente ? 'Alla c.a. ' + o.subappaltatore_referente : '',
    o.subappaltatore_pec ? 'PEC: ' + o.subappaltatore_pec : '', o.subappaltatore_email ? 'Email: ' + o.subappaltatore_email : ''].filter(Boolean);
  const riferimenti = ['Commessa: ' + ((o.commesse && o.commesse.codice) || ''), 'Lavoro a corpo', 'Ritenuta a garanzia: ' + percentualeLeggibile(o.ritenuta_perc) + ' su ogni SAL'];
  let yS = y + 6, yD = y + 6;
  sinistra.forEach(function(r) { const p = doc.splitTextToSize(String(r), colonnaDestra - margine - 6); doc.text(p, margine, yS); yS += p.length * 5; });
  riferimenti.forEach(function(r) { const p = doc.splitTextToSize(String(r), destra - colonnaDestra); doc.text(p, colonnaDestra, yD); yD += p.length * 5; });
  y = Math.max(yS, yD) + 3;

  doc.autoTable({
    startY: y + 2,
    margin: { top: 18, right: margine, bottom: 30, left: margine },
    head: [['Lavorazione a corpo', 'Importo']],
    body: (o.righe || []).map(function(r) { return [r.descrizione || '—', euroPreventivo(r.importo)]; }),
    theme: 'grid',
    headStyles: { fillColor: [8, 80, 65], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 140 }, 1: { halign: 'right' } }
  });
  y = doc.lastAutoTable.finalY + 10;
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Totale a corpo (IVA esclusa): ' + euroPreventivo(o.importo_totale), destra, y, { align: 'right' });
  y += 10;

  doc.setFontSize(9);
  [['Materiali forniti da TOLI FIRE', o.materiali_toli], ['Note', o.note]].forEach(function(b) {
    if (!b[1]) return;
    const p = doc.splitTextToSize(b[1], destra - margine);
    if (y + p.length * 4.5 + 6 > 275) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.text(b[0], margine, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.text(p, margine, y); y += p.length * 4.5 + 4;
  });

  if (sal.length) {
    doc.autoTable({
      startY: y + 2,
      margin: { top: 18, right: margine, bottom: 30, left: margine },
      head: [['SAL', 'Data', '% in tutto', 'Lordo', 'Ritenuta', 'Netto']],
      body: sal.map(function(x) { return [String(x.numero), fd(x.data_sal), percentualeLeggibile(x.percentuale), euroPreventivo(x.importo_lordo), euroPreventivo(x.ritenuta), euroPreventivo(x.netto)]; }),
      theme: 'grid',
      headStyles: { fillColor: [8, 80, 65], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  const chiusura = doc.splitTextToSize('Vi preghiamo di restituire l\'ordine firmato per accettazione, indicando il numero ' + o.codice +
    ' sui documenti e sulle fatture. Ogni SAL viene pagato al netto della ritenuta a garanzia, svincolata a fine lavori.', destra - margine);
  if (y + chiusura.length * 4.5 + 24 > 280) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'normal');
  doc.text(chiusura, margine, y);
  y += chiusura.length * 4.5 + 10;
  doc.text('Per TOLI FIRE' + (o.creato_da_nome ? ': ' + o.creato_da_nome : ''), margine, y);
  doc.text('Per accettazione (timbro e firma)', destra, y, { align: 'right' });

  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text('Ordine di subappalto ' + o.codice + ' — pagina ' + p + ' di ' + pagine, destra, 290, { align: 'right' });
  }
  doc.save('Ordine-subappalto-' + String(o.codice).replace(/[^\w.-]+/g, '_') + '.pdf');
  return doc;
}
