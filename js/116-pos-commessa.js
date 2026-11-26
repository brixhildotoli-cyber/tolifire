// ── F19.11 POS di commessa generato in automatico (sql/162) ────────────────
// Scelte di Erika del 24/11: il PDF si genera SEMPRE; se manca qualcosa ha
// "BOZZA NON VALIDATA" su ogni pagina e in prima pagina l'elenco di cosa
// manca (la finestra lo mostra prima); figure della sicurezza in Impostazioni
// (#si-sicurezza-card, solo titolare); lo generano segreteria, capo tecnico e
// titolare.
// Riquadro "🦺 POS di commessa" nella scheda della commessa (#cmd-pos, js/26
// chiama caricaPosCommessa): revisioni (numero, data, chi, bozza o completo,
// 📄 Apri) e "Genera il POS". Il POS mette insieme, senza scrivere a mano:
//   impresa e figure della sicurezza (impostazioni), cantiere (sede, referenti,
//   accessi, orari, note, date: commesse e js/32), lavorazioni (voci e schede
//   di rilievo: scheda_cantiere_commessa) con le schede rischi validate (sql/157),
//   personale del faldone (stato_faldone_commessa) con i corsi in vigore e i
//   corsi richiesti dalla commessa (js/95, sql/154), subappaltatori (faldone e
//   ordini di sql/149), mezzi della squadra.
// Il PDF va nella cartella "faldone" (registra_documento_commessa, sql/29) e la
// revisione si registra con l'impronta SHA-256 (registra_pos_commessa).
// Senza sql/162 (pos_commessa_attivo) riquadro e campi non compaiono.

let posCommessaVerificato = null;
let posCommessaAperta = null;   // { commessa, revisioni }
const RUOLI_POS_COMMESSA = ['titolare', 'segreteria', 'capo_tecnico'];

async function verificaPosCommessaDisponibile() {
  if (posCommessaVerificato !== null) return posCommessaVerificato;
  try {
    const { data, error } = await db.rpc('pos_commessa_attivo');
    posCommessaVerificato = !error && data === true;
  } catch (e) { posCommessaVerificato = false; }
  return posCommessaVerificato;
}

// ── Impostazioni: figure della sicurezza ──────────────────────────────
const CAMPI_FIGURE_SICUREZZA = [
  ['sicurezza_datore_lavoro', 'Datore di lavoro'], ['sicurezza_rspp_nome', 'RSPP'], ['sicurezza_rspp_telefono', 'Telefono RSPP'],
  ['sicurezza_medico_nome', 'Medico competente'], ['sicurezza_medico_telefono', 'Telefono del medico'], ['sicurezza_rls_nome', 'RLS']
];

async function mostraFigureSicurezzaImpostazioni() {
  const card = ge('si-sicurezza-card');
  if (!card) return;
  if (ROLE !== 'titolare' || typeof IMPOSTAZIONI === 'undefined' || !IMPOSTAZIONI || !('sicurezza_rspp_nome' in IMPOSTAZIONI)) { card.style.display = 'none'; return; }
  card.style.display = '';
  ge('si-sicurezza-campi').innerHTML = '<div class="g2">' + CAMPI_FIGURE_SICUREZZA.map(function(c) {
    return '<div class="f"><label>' + esc(c[1]) + '</label><input type="text" id="si-' + c[0] + '" maxlength="' + (/telefono/.test(c[0]) ? 40 : 150) + '" value="' + esc(IMPOSTAZIONI[c[0]] || '') + '"></div>';
  }).join('') + '</div>';
}

async function salvaFigureSicurezza() {
  const dati = {};
  CAMPI_FIGURE_SICUREZZA.forEach(function(c) { dati[c[0]] = (v('si-' + c[0]) || '').trim() || null; });
  const { data, error } = await db.from('impostazioni').update(dati).eq('id', 1).select('id');
  if (error || !data || !data.length) { toast('Non salvato: ' + (error ? error.message : 'permesso negato'), 'err'); return; }
  Object.assign(IMPOSTAZIONI, dati);
  toast('Figure della sicurezza salvate ✓', 'ok');
}

// ── Riquadro nella commessa ───────────────────────────────────────────
async function caricaPosCommessa(commessa) {
  const box = ge('cmd-pos');
  if (!box) return;
  box.innerHTML = '';
  if (!commessa || !RUOLI_POS_COMMESSA.includes(ROLE) || !(await verificaPosCommessaDisponibile())) return;
  const invio = await verificaPosInvioDisponibile();
  const { data, error } = await db.from('pos_commessa').select('id, revisione, nome_file, bozza, mancanze, generato_da_nome, generato_da_ruolo, generato_il, documento_id, commesse_documenti(storage_path)' +
      (invio ? ', ' + COLONNE_INVIO_POS : ''))
    .eq('commessa_id', commessa.id).order('revisione', { ascending: false });
  if (typeof commessaApertaId !== 'undefined' && commessaApertaId && commessaApertaId !== commessa.id) return;
  const revisioni = error ? [] : (data || []);
  posCommessaAperta = { commessa: commessa, revisioni: revisioni };
  const genera = ROLE === 'titolare' || !['chiusa', 'annullata'].includes(commessa.stato);
  box.innerHTML = '<div class="card">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">' +
      '<div style="font-size:14px;font-weight:700">🦺 POS di commessa' + (revisioni.length ? ' (rev. ' + revisioni[0].revisione + ')' : '') + '</div>' +
      (genera ? '<button type="button" class="btn sm p" onclick="apriGeneraPosCommessa()">🦺 Genera il POS</button>' : '') +
    '</div>' +
    (invio ? htmlAvvisoInvioPos(revisioni) : '') +
    '<div id="cmd-pos-aggiorna"></div>' +   // F19.15 (sql/166, js/118): POS da aggiornare
    '<div style="font-size:12px;color:var(--m);margin-bottom:6px">Il POS si compone da solo con impresa, cantiere, lavorazioni e schede rischi, personale con i corsi, subappaltatori e mezzi. Se manca qualcosa esce come BOZZA con l\'elenco. Il PDF va nel faldone.</div>' +
    (error ? '<div class="al2 e">Errore: ' + esc(error.message) + '</div>' : '') +
    (revisioni.length ? revisioni.map(function(r) {
      const path = r.commesse_documenti && r.commesse_documenti.storage_path;
      return '<div style="padding:6px 0;border-top:0.5px solid var(--bo);display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;font-size:13px">' +
        '<div style="min-width:0"><b>Revisione ' + r.revisione + '</b> · ' + esc(dataOraEsitoPosCommessa(r.generato_il)) + ' · ' + esc(r.generato_da_nome || '') +
          (r.bozza ? '<div style="font-size:12px;color:var(--a)">⚠️ Bozza: ' + esc((r.mancanze || []).length + ((r.mancanze || []).length === 1 ? ' cosa manca' : ' cose mancano')) + '</div>' : '<div style="font-size:12px;color:var(--g)">✅ Completo</div>') +
          // F19.13 (sql/164, js/117): approvazione del titolare e PDF firmato
          (path && r.documento_id ? '<div data-firma-doc="' + esc(r.documento_id) + '" data-firma-tipo="pos" data-firma-path="' + esc(path) + '" data-firma-cartella="faldone" data-firma-commessa="' + esc(commessa.id) + '" data-firma-bozza="' + (r.bozza ? '1' : '0') + '"></div>' : '') +
          // F19.14 (sql/165): invio ed esito del coordinatore
          (invio ? '<div data-pos-invio="' + esc(r.id) + '"></div>' : '') + '</div>' +
        (path ? '<button type="button" class="btn sm" data-path="' + esc(path) + '" onclick="scaricaDocumentoCommessa(this.dataset.path)">📄 Apri</button>' : '') +
      '</div>';
    }).join('') : '<div class="empty" style="font-size:12px">Nessun POS generato.</div>') +
    '</div>';  const firme = typeof arricchisciFirme === 'function' ? arricchisciFirme(box) : Promise.resolve();
  firme.then(function() { if (invio) disegnaInvioPos(box); }).catch(function(e) { console.warn('Firme del POS:', e); });
  if (revisioni.length && typeof caricaPosDaAggiornare === 'function') caricaPosDaAggiornare(commessa).catch(function(e) { console.warn('POS da aggiornare:', e); });
}

function dataOraEsitoPosCommessa(t) {
  if (!t) return '';
  const d = new Date(t);
  return d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// ── Dati del POS ──────────────────────────────────────────────────────
async function leggiDatiPosCommessa(commessa) {
  const colonneCantiere = typeof COLONNE_DATI_CANTIERE !== 'undefined' ? COLONNE_DATI_CANTIERE + ', ' : '';
  const [rComm, rImp, rScheda, rFald, rGiorni] = await Promise.all([
    db.from('commesse').select('id, codice, stato, cliente_id, sede_id, ' + colonneCantiere + 'data_inizio, data_fine_prevista, clienti(ragione_sociale, piva, indirizzo, citta)').eq('id', commessa.id).maybeSingle(),
    db.from('impostazioni').select('*').eq('id', 1).maybeSingle(),
    db.rpc('scheda_cantiere_commessa', { p_commessa_id: commessa.id }),
    db.rpc('stato_faldone_commessa', { p_commessa_id: commessa.id }),
    db.from('commesse_squadra_giorni').select('id, data, commesse_squadra_mezzi(mezzo_id, mezzi_attrezzature(nome, tipo, targa_matricola))').eq('commessa_id', commessa.id)
  ]);
  const c = rComm.data || {};
  const sede = c.sede_id ? (await db.from('sedi_cliente').select('nome, via, civico, cap, citta, provincia, zona').eq('id', c.sede_id).maybeSingle()).data : null;
  const scheda = rScheda.error ? {} : (rScheda.data || {});
  const famiglie = Array.from(new Set((scheda.schede_rilievo || []).map(function(s) { return s.famiglia; }).filter(Boolean)));
  const [rRischi, rLav] = await Promise.all([
    famiglie.length ? db.from('sicurezza_lavorazioni').select('lavorazione_codice, versione, contenuto, stato, rspp_nome, validata_il')
      .in('lavorazione_codice', famiglie).order('versione', { ascending: false }) : { data: [] },
    db.from('lavorazioni').select('codice, nome')
  ]);
  const nomiLav = {};
  (rLav.data || []).forEach(function(l) { nomiLav[l.codice] = l.nome; });
  const rischi = [];
  famiglie.forEach(function(f) {
    const s = (rRischi.data || []).find(function(x) { return x.lavorazione_codice === f; });
    rischi.push({ codice: f, nome: nomiLav[f] || f, scheda: s || null });
  });
  const persone = (rFald.error ? {} : (rFald.data || {})).persone || [];
  const idsU = persone.filter(function(p) { return p.utente_id; }).map(function(p) { return p.utente_id; });
  const idsS = persone.filter(function(p) { return p.subappaltatore_id; }).map(function(p) { return p.subappaltatore_id; });
  const filtroDoc = [idsU.length ? 'utente_id.in.(' + idsU.join(',') + ')' : '', idsS.length ? 'subappaltatore_id.in.(' + idsS.join(',') + ')' : ''].filter(Boolean).join(',');
  const rDoc = filtroDoc ? await db.from('documenti_team_subappalti').select('utente_id, subappaltatore_id, tipo, data_scadenza').is('sostituito_da', null).or(filtroDoc) : { data: [] };
  const oggi = dataLocaleISO();
  const documenti = (rDoc.data || []).filter(function(d) { return !d.data_scadenza || d.data_scadenza >= oggi; });
  if (typeof calcolaCorsiRichiestiCommessa === 'function') { try { await calcolaCorsiRichiestiCommessa(commessa); } catch (e) { /* senza corsi richiesti */ } }
  const richiesti = typeof SQUADRA_CORSI !== 'undefined' && SQUADRA_CORSI.commessaId === commessa.id ? SQUADRA_CORSI.richiesti : [];
  const ordiniSub = typeof verificaOrdiniSubappaltoDisponibili === 'function' && (await verificaOrdiniSubappaltoDisponibili())
    ? ((await db.rpc('ordini_subappalto_cantiere', { p_commessa_id: commessa.id })).data || []).filter(function(o) { return o.stato !== 'annullato'; }) : [];
  const mezzi = {};
  (rGiorni.data || []).forEach(function(g) {
    (g.commesse_squadra_mezzi || []).forEach(function(m) { if (m.mezzi_attrezzature) mezzi[m.mezzo_id] = m.mezzi_attrezzature; });
  });
  return { commessa: c, impresa: rImp.data || {}, sede: sede, lavorazioni: scheda.lavorazioni || [], rischi: rischi, persone: persone,
           documenti: documenti, richiesti: richiesti, ordiniSub: ordiniSub, mezzi: Object.values(mezzi) };
}

function nomeTipoCorsoPos(codice) {
  const t = typeof TIPI_DOCUMENTO_TEAM_SUBAPPALTI !== 'undefined' ? TIPI_DOCUMENTO_TEAM_SUBAPPALTI.find(function(x) { return x.id === codice; }) : null;
  return t ? t.nome : codice;
}

function corsiPersonaPos(dati, p) {
  return dati.documenti.filter(function(d) { return p.utente_id ? d.utente_id === p.utente_id : d.subappaltatore_id === p.subappaltatore_id; });
}

function mancanzePosCommessa(dati) {
  const m = [];
  const imp = dati.impresa;
  [['sicurezza_datore_lavoro', 'il datore di lavoro'], ['sicurezza_rspp_nome', 'l\'RSPP'], ['sicurezza_medico_nome', 'il medico competente'], ['sicurezza_rls_nome', 'l\'RLS']].forEach(function(f) {
    if (!String(imp[f[0]] || '').trim()) m.push('Figure della sicurezza: manca ' + f[1] + ' (Impostazioni)');
  });
  const c = dati.commessa;
  if (!dati.sede) m.push('Cantiere: manca la sede (indirizzo) della commessa');
  if ('cantiere_referente_nome' in c && (!String(c.cantiere_referente_nome || '').trim() || !String(c.cantiere_referente_telefono || '').trim())) m.push('Cantiere: manca il referente con il telefono (scheda Cantiere)');
  if (!c.data_inizio) m.push('Cantiere: manca la data di inizio dei lavori');
  if (!dati.lavorazioni.length) m.push('Lavorazioni: nessuna lavorazione nel preventivo');
  if (!dati.rischi.length) m.push('Schede rischi: nessuna scheda di rilievo con la lavorazione');
  dati.rischi.forEach(function(r) {
    if (!r.scheda) m.push('Scheda rischi mancante: ' + r.nome);
    else if (r.scheda.stato !== 'validata') m.push('Scheda rischi da validare dall\'RSPP: ' + r.nome + ' (versione ' + r.scheda.versione + ')');
  });
  if (!dati.persone.length) m.push('Personale: nessuna persona nel faldone');
  dati.persone.forEach(function(p) {
    const tipi = corsiPersonaPos(dati, p).map(function(d) { return d.tipo; });
    if (p.utente_id) ['formazione_lavoratori', 'idoneita_sanitaria'].forEach(function(t) { if (!tipi.includes(t)) m.push(p.nome + ': manca ' + nomeTipoCorsoPos(t)); });
    dati.richiesti.filter(function(r) { return !r.almenoUno && !tipi.includes(r.codice); }).forEach(function(r) { m.push(p.nome + ': manca ' + r.nome + ' richiesto dalla commessa'); });
  });
  dati.richiesti.filter(function(r) { return r.almenoUno; }).forEach(function(r) {
    if (dati.persone.length && !dati.persone.some(function(p) { return corsiPersonaPos(dati, p).some(function(d) { return d.tipo === r.codice; }); })) {
      m.push('Squadra: serve almeno uno con ' + r.nome);
    }
  });
  return m;
}

// ── Finestra e generazione ────────────────────────────────────────────
function finestraPosCommessa(html) {
  let el = ge('m-pos-commessa');
  if (!el) {
    el = document.createElement('div');
    el.className = 'mbg';
    el.id = 'm-pos-commessa';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="modal" style="max-width:600px"><button class="x" onclick="closeM(\'m-pos-commessa\')">×</button>' + html + '</div>';
  if (!el.classList.contains('on')) openM('m-pos-commessa');
}

async function apriGeneraPosCommessa() {
  const m = posCommessaAperta;
  if (!m) return;
  finestraPosCommessa('<h3>🦺 Genera il POS</h3><div class="load">Raccolgo i dati della commessa…</div>');
  let dati;
  try { dati = await leggiDatiPosCommessa(m.commessa); } catch (e) { finestraPosCommessa('<h3>🦺 Genera il POS</h3><div class="al2 e">Dati non letti: ' + esc(e.message || e) + '</div>'); return; }
  m.dati = dati;
  m.mancanze = mancanzePosCommessa(dati);
  const rev = m.revisioni.length ? m.revisioni[0].revisione + 1 : 0;
  finestraPosCommessa('<h3>🦺 Genera il POS · revisione ' + rev + '</h3>' +
    '<div style="font-size:13px;margin-bottom:8px">' + dati.lavorazioni.length + ' voci di lavoro, ' + dati.rischi.length + (dati.rischi.length === 1 ? ' scheda rischi' : ' schede rischi') + ', ' +
      dati.persone.length + (dati.persone.length === 1 ? ' persona' : ' persone') + ', ' + dati.ordiniSub.length + ' ordini ai subappaltatori, ' + dati.mezzi.length + ' mezzi.</div>' +
    (m.mancanze.length
      ? '<div class="al2 w" style="font-size:13px"><b>Manca qualcosa: il POS esce come «BOZZA NON VALIDATA»</b> con questo elenco in prima pagina.<ul style="margin:6px 0 0 18px;padding:0">' +
          m.mancanze.map(function(x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'
      : '<div class="al2 ok" style="font-size:13px">✅ Non manca niente: il POS è completo e va firmato.</div>') +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeM(\'m-pos-commessa\')">Annulla</button>' +
    '<button class="btn p" id="mpos-genera" onclick="generaPosCommessa()">🦺 Genera il PDF</button></div>');
}

async function impronta256Pos(blob) {
  const buf = await blob.arrayBuffer();
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function generaPosCommessa() {
  const m = posCommessaAperta;
  if (!m || !m.dati) return;
  const btn = ge('mpos-genera');
  if (btn) btn.disabled = true;
  try {
    const rev = m.revisioni.length ? m.revisioni[0].revisione + 1 : 0;
    const doc = await creaPdfPosCommessa(m.dati, m.mancanze, rev);
    if (!doc) return;
    const nomeFile = 'POS_' + String(m.dati.commessa.codice || 'commessa').replace(/[^0-9A-Za-z]+/g, '-') + '_rev' + rev + '.pdf';
    const blob = doc.output('blob');
    const path = m.commessa.id + '/faldone/' + Date.now() + '_' + nomeFile;
    const up = await db.storage.from('commesse-documenti').upload(path, blob, { upsert: false, contentType: 'application/pdf' });
    if (up.error) { toast('PDF non salvato: ' + up.error.message, 'err'); return; }
    const rd = await db.rpc('registra_documento_commessa', { p_commessa_id: m.commessa.id, p_cartella: 'faldone', p_storage_path: path, p_nome_file: nomeFile,
      p_nota: 'POS revisione ' + rev + (m.mancanze.length ? ' (bozza)' : '') });
    if (rd.error) { await db.storage.from('commesse-documenti').remove([path]); toast('PDF non salvato nel faldone: ' + rd.error.message, 'err'); return; }
    const rp = await db.rpc('registra_pos_commessa', { p_commessa_id: m.commessa.id, p_documento_id: rd.data, p_impronta: await impronta256Pos(blob), p_mancanze: m.mancanze });
    if (rp.error) { toast('Revisione non registrata: ' + rp.error.message, 'err'); return; }
    doc.save(nomeFile);
    closeM('m-pos-commessa');
    toast('POS revisione ' + rp.data + ' generato e salvato nel faldone ✓', 'ok');
    await caricaPosCommessa(m.commessa);
    if (typeof caricaDocumentiCommessa === 'function') caricaDocumentiCommessa(m.commessa).catch(function() {});
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── PDF ───────────────────────────────────────────────────────────────
async function creaPdfPosCommessa(dati, mancanze, rev) {
  if (!(await preparaPDF())) return null;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const M = 16, W = 210, D = W - M;
  const c = dati.commessa, imp = dati.impresa;
  const bozza = mancanze.length > 0;
  let y = 0;
  const verde = [8, 80, 65];
  const nuovaPagina = function() { doc.addPage(); y = 20; };
  const spazio = function(h) { if (y + h > 275) nuovaPagina(); };
  const titolo = function(t) {
    spazio(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(verde[0], verde[1], verde[2]);
    doc.text(t, M, y); y += 2; doc.setDrawColor(verde[0], verde[1], verde[2]); doc.line(M, y, D, y); y += 6;
    doc.setTextColor(25, 25, 25); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  };
  const riga = function(etichetta, valore) {
    const p = doc.splitTextToSize(String(valore || '—'), D - M - 48);
    spazio(p.length * 4.5 + 1);
    doc.setFont('helvetica', 'bold'); doc.text(etichetta, M, y);
    doc.setFont('helvetica', 'normal'); doc.text(p, M + 48, y); y += p.length * 4.5 + 1;
  };
  const tabella = function(testa, corpo, colonne) {
    doc.autoTable({ startY: y, margin: { top: 18, right: M, bottom: 22, left: M }, head: [testa], body: corpo.length ? corpo : [testa.map(function() { return '—'; })],
      theme: 'grid', headStyles: { fillColor: verde, textColor: [255, 255, 255], fontStyle: 'bold' }, styles: { fontSize: 8, cellPadding: 2.2 }, columnStyles: colonne || {} });
    y = doc.lastAutoTable.finalY + 6;
  };
  const elenco = function(voci) {
    (voci && voci.length ? voci : ['—']).forEach(function(x) { const p = doc.splitTextToSize('• ' + x, D - M - 4); spazio(p.length * 4.3); doc.text(p, M + 2, y); y += p.length * 4.3; });
    y += 2;
  };

  // Copertina
  doc.setFillColor(verde[0], verde[1], verde[2]); doc.rect(0, 0, W, 34, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255, 255, 255);
  doc.text(String(imp.ragione_sociale || 'TOLI FIRE').toUpperCase(), M, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text([imp.indirizzo, [imp.cap, imp.citta].filter(Boolean).join(' ')].filter(Boolean).join(' — ') || '', M, 23);
  doc.text(['P.IVA ' + (imp.piva || ''), imp.email || ''].filter(Boolean).join(' — '), M, 28);
  y = 52; doc.setTextColor(25, 25, 25); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('PIANO OPERATIVO DI SICUREZZA', W / 2, y, { align: 'center' }); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('ai sensi del D.Lgs. 81/2008, art. 89 e Allegato XV', W / 2, y, { align: 'center' }); y += 14;
  riga('Commessa', (c.codice || '') + (c.clienti && c.clienti.ragione_sociale ? ' — ' + c.clienti.ragione_sociale : ''));
  riga('Cantiere', indirizzoPosCommessa(dati.sede));
  riga('Revisione', rev + ' del ' + new Date().toLocaleDateString('it-IT'));
  riga('Stato', bozza ? 'BOZZA NON VALIDATA (vedi l\'elenco qui sotto)' : 'Completo: da firmare dal datore di lavoro');
  if (bozza) {
    y += 4; spazio(12);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(200, 30, 30); doc.text('Cosa manca prima di poter usare questo POS', M, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(25, 25, 25);
    elenco(mancanze);
  }

  // 1. Impresa
  nuovaPagina();
  titolo('1. Dati dell\'impresa esecutrice');
  riga('Ragione sociale', imp.ragione_sociale);
  riga('Sede', [imp.indirizzo, imp.cap, imp.citta].filter(Boolean).join(' '));
  riga('P.IVA', imp.piva);
  riga('Telefono / email', [imp.telefono, imp.email].filter(Boolean).join(' — '));
  riga('Datore di lavoro', imp.sicurezza_datore_lavoro);
  riga('RSPP', [imp.sicurezza_rspp_nome, imp.sicurezza_rspp_telefono].filter(Boolean).join(' — tel. '));
  riga('Medico competente', [imp.sicurezza_medico_nome, imp.sicurezza_medico_telefono].filter(Boolean).join(' — tel. '));
  riga('RLS', imp.sicurezza_rls_nome);
  const preposti = dati.persone.filter(function(p) { return corsiPersonaPos(dati, p).some(function(d) { return d.tipo === 'preposto'; }); }).map(function(p) { return p.nome; });
  const ps = dati.persone.filter(function(p) { return corsiPersonaPos(dati, p).some(function(d) { return d.tipo === 'primo_soccorso'; }); }).map(function(p) { return p.nome; });
  const ai = dati.persone.filter(function(p) { return corsiPersonaPos(dati, p).some(function(d) { return d.tipo === 'formazione_antincendio'; }); }).map(function(p) { return p.nome; });
  riga('Preposti in cantiere', preposti.join(', '));
  riga('Addetti primo soccorso', ps.join(', '));
  riga('Addetti antincendio', ai.join(', '));

  // 2. Cantiere
  y += 4; titolo('2. Cantiere');
  riga('Committente', c.clienti ? [c.clienti.ragione_sociale, c.clienti.piva ? 'P.IVA ' + c.clienti.piva : ''].filter(Boolean).join(' — ') : '');
  riga('Indirizzo', indirizzoPosCommessa(dati.sede));
  riga('Piano / zona', c.cantiere_piano_zona);
  riga('Date dei lavori', [c.data_inizio ? 'dal ' + fd(c.data_inizio) : '', c.data_fine_prevista ? 'al ' + fd(c.data_fine_prevista) : ''].filter(Boolean).join(' '));
  riga('Orari', c.cantiere_orari);
  riga('Accessi', c.cantiere_accessi);
  riga('Referente del cliente', [c.cantiere_referente_nome, c.cantiere_referente_ruolo, c.cantiere_referente_telefono].filter(Boolean).join(' — '));
  riga('Referente di riserva', [c.cantiere_riserva_nome, c.cantiere_riserva_ruolo, c.cantiere_riserva_telefono].filter(Boolean).join(' — '));
  riga('Note di sicurezza', c.cantiere_note_sicurezza);

  // 3. Lavorazioni
  y += 4; titolo('3. Lavorazioni');
  tabella(['Lavorazione', 'Quantità'], dati.lavorazioni.map(function(l) {
    return [l.descrizione || '—', [l.quantita != null ? String(l.quantita).replace('.', ',') : '', l.unita_misura || ''].filter(Boolean).join(' ')];
  }), { 1: { cellWidth: 30 } });

  // 4. Schede rischi
  titolo('4. Fasi di lavoro, rischi e misure di prevenzione');
  if (!dati.rischi.length) elenco(['Nessuna scheda di rilievo con la lavorazione.']);
  dati.rischi.forEach(function(r) {
    spazio(20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(r.nome, M, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const s = r.scheda;
    doc.text(!s ? 'Scheda rischi mancante' : (s.stato === 'validata' ? 'Scheda versione ' + s.versione + ', validata dall\'RSPP ' + (s.rspp_nome || '') + ' il ' + fd(s.validata_il)
      : 'Scheda versione ' + s.versione + ': BOZZA DA VALIDARE DALL\'RSPP'), M, y); y += 5;
    doc.setFontSize(9);
    if (!s) return;
    const ct = s.contenuto || {};
    doc.setFont('helvetica', 'bold'); spazio(6); doc.text('Fasi di lavoro', M, y); y += 4.5; doc.setFont('helvetica', 'normal'); elenco(ct.fasi);
    tabella(['Rischio', 'Misure di prevenzione e protezione'], (ct.rischi || []).map(function(x) { return [x.rischio, x.misure || '']; }), { 0: { cellWidth: 70 } });
    doc.setFont('helvetica', 'bold'); spazio(6); doc.text('DPI', M, y); y += 4.5; doc.setFont('helvetica', 'normal'); elenco(ct.dpi);
    doc.setFont('helvetica', 'bold'); spazio(6); doc.text('Attrezzature', M, y); y += 4.5; doc.setFont('helvetica', 'normal'); elenco(ct.attrezzature);
    doc.setFont('helvetica', 'bold'); spazio(6); doc.text('Sostanze e preparati (vedi le schede di sicurezza)', M, y); y += 4.5; doc.setFont('helvetica', 'normal'); elenco(ct.sostanze);
  });

  // 5. Personale
  titolo('5. Personale in cantiere e formazione');
  tabella(['Persona', 'Impresa / ruolo', 'Corsi e idoneità in vigore'], dati.persone.map(function(p) {
    return [p.nome || '—', p.utente_id ? (imp.ragione_sociale || 'TOLI FIRE') + (typeof etichettaRuolo === 'function' && p.ruolo ? ' — ' + etichettaRuolo(p.ruolo) : '') : 'Subappaltatore',
      corsiPersonaPos(dati, p).map(function(d) { return nomeTipoCorsoPos(d.tipo) + (d.data_scadenza ? ' (fino al ' + fd(d.data_scadenza) + ')' : ''); }).join('; ') || '—'];
  }), { 0: { cellWidth: 40 }, 1: { cellWidth: 42 } });
  if (dati.richiesti.length) { riga('Corsi richiesti dalla commessa', dati.richiesti.map(function(r) { return r.nome + (r.almenoUno ? ' (almeno uno in squadra)' : ' (ogni persona)'); }).join(', ')); y += 2; }

  // 6. Subappaltatori
  titolo('6. Imprese subappaltatrici');
  const nomiSub = Array.from(new Set(dati.persone.filter(function(p) { return p.subappaltatore_id; }).map(function(p) { return p.nome; })));
  tabella(['Impresa', 'Lavorazioni affidate'], dati.ordiniSub.map(function(o) { return [o.subappaltatore || '—', (o.righe || []).map(function(x) { return x.descrizione; }).join('; ')]; })
    .concat(nomiSub.filter(function(n) { return !dati.ordiniSub.some(function(o) { return o.subappaltatore === n; }); }).map(function(n) { return [n, '—']; })), { 0: { cellWidth: 60 } });

  // 7. Mezzi
  titolo('7. Macchine, mezzi e attrezzature');
  tabella(['Mezzo o attrezzatura', 'Tipo', 'Targa / matricola'], dati.mezzi.map(function(x) { return [x.nome || '—', x.tipo || '', x.targa_matricola || '']; }));

  // 8. Firme
  spazio(40); titolo('8. Firme');
  doc.text('Il datore di lavoro: ' + (imp.sicurezza_datore_lavoro || '______________________'), M, y); y += 14;
  doc.text('Firma ______________________________', M, y); y += 12;
  doc.text('L\'RSPP: ' + (imp.sicurezza_rspp_nome || '______________________') + '      Il RLS (per presa visione): ' + (imp.sicurezza_rls_nome || '__________________'), M, y);

  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p);
    if (bozza) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(46); doc.setTextColor(230, 140, 140);
      doc.text('BOZZA NON VALIDATA', W / 2, 165, { align: 'center', angle: 35 });
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text('POS commessa ' + (c.codice || '') + ' — revisione ' + rev + (bozza ? ' — BOZZA' : '') + ' — pagina ' + p + ' di ' + pagine, D, 290, { align: 'right' });
  }
  return doc;
}

function indirizzoPosCommessa(sede) {
  if (!sede) return '';
  return [sede.nome, [[sede.via, sede.civico].filter(Boolean).join(' '), sede.cap, sede.citta, sede.provincia ? '(' + sede.provincia + ')' : ''].filter(Boolean).join(' '), sede.zona]
    .filter(Boolean).join(' — ');
}

// ── F19.14 Invio del POS ed esito del coordinatore (sql/165) ────────────
// Scelte di Erika del 25/11: solo AVVISO per «Pronta» (qui e nel «Prossimo
// passo» di js/107); invio segnato a mano (a chi, come, quando) solo per una
// revisione firmata (sql/164); se inviato al coordinatore (CSE) si segna
// accettato o respinto con il motivo (respinto = si rigenera il POS); nel
// faldone "✓ POS controllato" per ogni subappaltatore.
let posInvioVerificato = null;
const COLONNE_INVIO_POS = 'invio_destinatario, invio_mezzo, inviato_il, invio_nota, inviato_da_nome, esito, esito_nota, esito_da_nome, esito_il';
const NOMI_INVIO_POS = { cliente: 'al cliente', cse: 'al coordinatore (CSE)', pec: 'PEC', email: 'email', a_mano: 'a mano' };

async function verificaPosInvioDisponibile() {
  if (posInvioVerificato !== null) return posInvioVerificato;
  try {
    const { data, error } = await db.rpc('pos_invio_attivo');
    posInvioVerificato = !error && data === true;
  } catch (e) { posInvioVerificato = false; }
  return posInvioVerificato;
}

// La revisione è a posto per il cantiere: inviata e (se al CSE) accettata
function posInviatoOk(r) {
  return !!(r && r.inviato_il && (r.invio_destinatario !== 'cse' || r.esito === 'accettato'));
}

function testoMancaPos(revisioni) {
  const r = revisioni[0];
  if (!r) return 'il POS (non ancora generato: riquadro «🦺 POS di commessa»)';
  if (r.esito === 'respinto') return 'il POS: la revisione ' + r.revisione + ' è stata respinta dal coordinatore, va rigenerata';
  if (r.inviato_il && r.invio_destinatario === 'cse') return 'l\'esito del coordinatore sul POS (revisione ' + r.revisione + ' inviata il ' + fd(r.inviato_il) + ')';
  return 'il POS firmato e inviato (revisione ' + r.revisione + ')';
}

function htmlAvvisoInvioPos(revisioni) {
  const r = revisioni[0];
  if (posInviatoOk(r)) {
    return '<div class="al2 ok" style="font-size:12px;margin:0 0 6px">✅ POS revisione ' + r.revisione + ' inviato ' + esc(NOMI_INVIO_POS[r.invio_destinatario] || '') + ' il ' + esc(fd(r.inviato_il)) +
      (r.esito === 'accettato' ? ', accettato' : '') + '.</div>';
  }
  return '<div class="al2 w" style="font-size:12px;margin:0 0 6px">⚠️ Manca ' + esc(testoMancaPos(revisioni)) + '. È un avviso: la commessa si può segnare «Pronta» lo stesso.</div>';
}

// Per js/107 ("Prossimo passo" verso Pronta): { pronto, testo } o null
async function statoPosPerPassiCommessa(commessaId) {
  if (!RUOLI_POS_COMMESSA.includes(ROLE) || !(await verificaPosCommessaDisponibile()) || !(await verificaPosInvioDisponibile())) return null;
  const { data, error } = await db.from('pos_commessa').select('revisione, ' + COLONNE_INVIO_POS).eq('commessa_id', commessaId).order('revisione', { ascending: false }).limit(1);
  if (error) return null;
  const rev = data || [];
  // F19.15 (js/118): cambiata dopo l'invio = POS da aggiornare
  const agg = posInviatoOk(rev[0]) && typeof leggiPosDaAggiornare === 'function' ? await leggiPosDaAggiornare(commessaId) : null;
  const nDiff = agg && agg.differenze ? agg.differenze.length : 0;
  if (nDiff) return { pronto: false, testo: 'il POS aggiornato: dopo l\'invio sono cambiate ' + nDiff + (nDiff === 1 ? ' cosa' : ' cose') + ' (riquadro «🦺 POS di commessa»)' };
  return { pronto: posInviatoOk(rev[0]), testo: testoMancaPos(rev) };
}

function disegnaInvioPos(box) {
  const m = posCommessaAperta;
  if (!m) return;
  const puo = ['titolare', 'segreteria'].includes(ROLE);
  box.querySelectorAll('[data-pos-invio]').forEach(function(el) {
    const r = m.revisioni.find(function(x) { return x.id === el.dataset.posInvio; });
    if (!r) return;
    const firma = typeof FIRME_DOCUMENTI !== 'undefined' ? FIRME_DOCUMENTI[r.documento_id] : null;
    let html = '';
    if (r.inviato_il) {
      html = '<div style="font-size:12px;margin-top:4px">📨 Inviato ' + esc(NOMI_INVIO_POS[r.invio_destinatario] || '') + ' per ' + esc(NOMI_INVIO_POS[r.invio_mezzo] || '') + ' il ' + esc(fd(r.inviato_il)) +
        (r.inviato_da_nome ? ' (' + esc(r.inviato_da_nome) + ')' : '') + (r.invio_nota ? ' · ' + esc(r.invio_nota) : '') + '</div>';
      if (r.esito) {
        html += '<div style="font-size:12px;color:' + (r.esito === 'accettato' ? 'var(--g)' : 'var(--r)') + '">' + (r.esito === 'accettato' ? '✅ Accettato dal coordinatore' : '✕ Respinto dal coordinatore: ' + esc(r.esito_nota || '') + ' — rigenera il POS') + '</div>';
      } else if (r.invio_destinatario === 'cse' && puo) {
        html += '<div style="display:flex;gap:6px;margin-top:4px"><button type="button" class="btn sm" data-id="' + esc(r.id) + '" onclick="esitoPosCommessa(this.dataset.id, \'accettato\')">✓ Accettato dal CSE</button>' +
          '<button type="button" class="btn sm" data-id="' + esc(r.id) + '" onclick="esitoPosCommessa(this.dataset.id, \'respinto\')">✕ Respinto</button></div>';
      }
    } else if (firma && firma.stato === 'firmato' && puo) {
      html = '<div style="margin-top:4px"><button type="button" class="btn sm p" data-id="' + esc(r.id) + '" onclick="apriInvioPosCommessa(this.dataset.id)">📨 Segna inviato</button></div>';
    }
    el.innerHTML = html;
  });
}

function apriInvioPosCommessa(id) {
  const r = posCommessaAperta && posCommessaAperta.revisioni.find(function(x) { return x.id === id; });
  if (!r) return;
  finestraPosCommessa('<h3>📨 POS revisione ' + r.revisione + ' inviato</h3>' +
    '<div class="fr"><div class="f"><label>A chi *</label><select id="mpi-dest"><option value="cliente">Al cliente (committente)</option><option value="cse">Al coordinatore per la sicurezza (CSE)</option></select></div>' +
    '<div class="f"><label>Come *</label><select id="mpi-mezzo"><option value="pec">PEC</option><option value="email">Email</option><option value="a_mano">A mano</option></select></div></div>' +
    '<div class="f"><label>Quando</label><input type="date" id="mpi-data" value="' + esc(dataLocaleISO()) + '" max="' + esc(dataLocaleISO()) + '"></div>' +
    '<div class="f"><label>Nota</label><input type="text" id="mpi-nota" maxlength="500" placeholder="Es. PEC al Geom. Rossi, protocollo…"></div>' +
    '<div style="font-size:12px;color:var(--m)">Se lo mandi al coordinatore, dopo segni se l\'ha accettato o respinto.</div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeM(\'m-pos-commessa\')">Annulla</button>' +
    '<button class="btn p" data-id="' + esc(id) + '" onclick="salvaInvioPosCommessa(this.dataset.id)">Segna inviato</button></div>');
}

async function salvaInvioPosCommessa(id) {
  const { error } = await db.rpc('segna_pos_inviato', { p_pos_id: id, p_destinatario: v('mpi-dest'), p_mezzo: v('mpi-mezzo'), p_data: v('mpi-data') || null, p_nota: (v('mpi-nota') || '').trim() || null });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  closeM('m-pos-commessa');
  toast('Invio del POS registrato ✓', 'ok');
  await aggiornaDopoInvioPos();
}

async function esitoPosCommessa(id, esito) {
  let nota = null;
  if (esito === 'respinto') {
    nota = prompt('Perché il coordinatore ha respinto il POS?');
    if (nota === null) return;
  } else if (!confirm('Il coordinatore ha accettato il POS?')) return;
  const { error } = await db.rpc('registra_esito_pos', { p_pos_id: id, p_esito: esito, p_nota: nota });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  toast(esito === 'accettato' ? 'POS accettato dal coordinatore ✓' : 'POS respinto: rigeneralo con le correzioni', 'ok');
  await aggiornaDopoInvioPos();
}

async function aggiornaDopoInvioPos() {
  const m = posCommessaAperta;
  if (!m) return;
  await caricaPosCommessa(m.commessa);
  if (typeof caricaSuggerimentoPassoCommessa === 'function') caricaSuggerimentoPassoCommessa(m.commessa).catch(function() {});
}

// ── POS dei subappaltatori controllato per la commessa (faldone, js/31) ──
async function caricaControlliPosSubappaltatori(commessa, box) {
  const posti = Array.from(box.querySelectorAll('[data-pos-sub]'));
  if (!posti.length || !(await verificaPosInvioDisponibile())) return;
  const { data, error } = await db.from('commesse_pos_subappaltatori').select('subappaltatore_id, controllato_da_nome, controllato_il, nota').eq('commessa_id', commessa.id);
  if (error) return;
  const puo = ['titolare', 'segreteria'].includes(ROLE);
  posti.forEach(function(el) {
    const c = (data || []).find(function(x) { return x.subappaltatore_id === el.dataset.posSub; });
    el.innerHTML = c
      ? '<div style="font-size:12px;color:var(--g);margin-top:4px">✓ POS controllato per questa commessa da ' + esc(c.controllato_da_nome || '') + ' il ' + esc(new Date(c.controllato_il).toLocaleDateString('it-IT')) + (c.nota ? ' · ' + esc(c.nota) : '') + '</div>'
      : '<div style="font-size:12px;color:var(--a);margin-top:4px">⚠️ POS del subappaltatore da controllare per questa commessa' +
        (puo ? ' <button type="button" class="btn sm" data-commessa="' + esc(commessa.id) + '" data-sub="' + esc(el.dataset.posSub) + '" onclick="segnaPosSubControllato(this)">✓ POS controllato</button>' : '') + '</div>';
  });
}

async function segnaPosSubControllato(btn) {
  const nota = prompt('Hai letto il POS del subappaltatore per questa commessa? Nota (facoltativa):', '');
  if (nota === null) return;
  const { error } = await db.rpc('segna_pos_subappaltatore_controllato', { p_commessa_id: btn.dataset.commessa, p_subappaltatore_id: btn.dataset.sub, p_nota: nota.trim() || null });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  toast('POS del subappaltatore controllato ✓', 'ok');
  const box = btn.closest('#cmd-faldone') || ge('cmd-faldone');
  if (faldoneAperto) await caricaControlliPosSubappaltatori(faldoneAperto.commessa, box);
}
