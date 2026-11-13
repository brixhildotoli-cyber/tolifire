// ════════════════════════════════════════════════════════════════════════
// F16.7 — Modelli dei PDF (testi fissi in tabella, sql/98: modelli_pdf).
// Il generatore unico è in js/00 (generaPdfDaModello, intestazionePdfToli,
// piedePdfToli). Qui: lettura della tabella (leggiModelloPdf, usata dal
// generatore), il modello di PROVA e il riquadro di Impostazioni
// "🧾 Modelli dei PDF" (solo titolare, informatico compreso) per cambiare i
// testi fissi e fare un PDF di prova.
// REGOLA DI ERIKA (13/11): nessun PDF di prima legge questa tabella.
// Senza sql/98: la lettura risponde 404 (una volta, solo per il titolare in
// Impostazioni o per chi genera un PDF nuovo), il riquadro dice "non ancora
// attivo" e il PDF usa i testi predefiniti qui sotto.
// ════════════════════════════════════════════════════════════════════════
const MODELLI_PDF = { presente: null, righe: [], letto_il: 0 };

async function leggiModelliPdf(forza) {
  if (MODELLI_PDF.presente === false && !forza) return null;
  if (!forza && MODELLI_PDF.presente && Date.now() - MODELLI_PDF.letto_il < 60000) return MODELLI_PDF.righe;
  const { data, error } = await db.from('modelli_pdf')
    .select('id, codice, nome, descrizione, titolo, blocchi, revisione, attivo, aggiornato_da_nome, aggiornato_il')
    .order('codice');
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || /modelli_pdf/.test(error.message || '')) {
      MODELLI_PDF.presente = false;
      MODELLI_PDF.righe = [];
      return null;
    }
    throw new Error(error.message || 'Lettura dei modelli dei PDF non riuscita');
  }
  MODELLI_PDF.presente = true;
  MODELLI_PDF.righe = data || [];
  MODELLI_PDF.letto_il = Date.now();
  return MODELLI_PDF.righe;
}

async function verificaModelliPdfDisponibili(forza) {
  try { await leggiModelliPdf(forza); } catch (e) { /* rete: resta l'ultimo valore */ }
  return MODELLI_PDF.presente === true;
}

// Riga attiva della tabella per il generatore (null = testi predefiniti).
async function leggiModelloPdf(codice) {
  let righe = null;
  try { righe = await leggiModelliPdf(); } catch (e) { righe = MODELLI_PDF.presente ? MODELLI_PDF.righe : null; }
  return (righe || []).find(function(r) { return r.codice === codice && r.attivo !== false; }) || null;
}

// ── Modello di prova (testi predefiniti = quelli di sql/98) ──────────────
registraModelloPdf('prova', {
  nome: 'Documento di prova del motore dei PDF',
  titolo: 'DOCUMENTO DI PROVA',
  testi: {
    premessa: { etichetta: 'Premessa', testo: 'Questo documento è una prova del motore unico dei PDF di TOLI FIRE. Il testo di questo paragrafo è un testo fisso del modello: lo cambia il titolare da Impostazioni e il PDF successivo lo riporta con la revisione nuova.' },
    note_finali: { etichetta: 'Note finali', testo: 'Documento senza valore: non va consegnato al cliente.' }
  },
  sezioni: [
    { tipo: 'campi', titolo: 'Dati del documento', da: 'campi' },
    { tipo: 'testo', chiave: 'premessa' },
    { tipo: 'tabella', titolo: 'Modelli dei PDF (tabella letta dal database)', colonne: ['Codice', 'Nome', 'Revisione', 'Testi'], da: 'righe', vuota: 'Nessun modello.' },
    { tipo: 'allegati', titolo: 'Allegati elencati', da: 'allegati' },
    { tipo: 'testo', chiave: 'note_finali' },
    { tipo: 'firme', etichette: ['Il responsabile tecnico', 'Per presa visione'] }
  ],
  // "Tabella da query": i modelli dei PDF che il ruolo legge (senza sql/98
  // quelli del sito), così la prova legge davvero il database.
  leggiDati: async function(contesto, modello) {
    let righe = null;
    try { righe = await leggiModelliPdf(); } catch (e) { righe = null; }
    const tabella = righe
      ? righe.map(function(r) { return [r.codice, r.nome, 'rev. ' + r.revisione, (r.blocchi || []).length]; })
      : Object.keys(MODELLI_PDF_SITO).map(function(k) { const m = MODELLI_PDF_SITO[k]; return [k, m.nome || k, 'predefinito', Object.keys(m.testi || {}).length]; });
    const chi = (typeof ME !== 'undefined' && ME) ? ((ME.nome || '') + ' ' + (ME.cognome || '')).trim() : '';
    return {
      campi: [['Documento:', modello.titolo], ['Preparato da:', chi || '—'], ['Data:', new Date().toLocaleDateString('it-IT')],
        ['Revisione:', modello.revisione ? 'rev. ' + modello.revisione : 'testi predefiniti del sito (sql/98 non eseguito)']],
      righe: tabella,
      allegati: (contesto && contesto.allegati) || ['Allegato di prova n. 1.pdf', 'Allegato di prova n. 2.pdf']
    };
  },
  nomeFile: function(dati, modello) { return 'Prova_motore_PDF_rev_' + (modello.revisione || 'predefinita'); }
});

// ── Impostazioni > 🧾 Modelli dei PDF (solo titolare) ────────────────────
async function mostraModelliPdfImpostazioni() {
  const stato = ge('si-modelli-pdf-stato'), elenco = ge('si-modelli-pdf-elenco');
  if (!stato || !elenco) return;
  if (ROLE !== 'titolare') { const c = ge('si-modelli-pdf-card'); if (c) c.style.display = 'none'; return; }
  stato.textContent = 'Lettura dei modelli…';
  let righe = null;
  try { righe = await leggiModelliPdf(true); } catch (e) { stato.className = 'al2 w'; stato.textContent = '⚠️ ' + e.message; return; }
  if (!righe) {
    stato.className = 'al2 w';
    stato.innerHTML = 'I modelli dei PDF in tabella <b>non sono ancora attivi</b> (serve l\'aggiornamento del database, sql/98). Il PDF di prova esce con i testi predefiniti del sito.';
    elenco.innerHTML = Object.keys(MODELLI_PDF_SITO).map(function(k) {
      const m = MODELLI_PDF_SITO[k];
      return '<div class="card" style="margin:8px 0;padding:10px"><b>' + esc(m.nome || k) + '</b> <span style="color:var(--m);font-size:12px">(' + esc(k) + ', testi predefiniti)</span>' +
        '<div style="margin-top:6px"><button class="btn sm" type="button" onclick="provaPdfModello(\'' + esc(k) + '\')">🧪 PDF di prova</button></div></div>';
    }).join('');
    return;
  }
  stato.className = 'al2 i';
  stato.textContent = righe.length + (righe.length === 1 ? ' modello' : ' modelli') + '. Cambi solo titolo e testi fissi: tabelle e campi li riempie il gestionale. Ogni cambio alza la revisione e resta nel registro.';
  elenco.innerHTML = righe.map(function(r) {
    const del = r.aggiornato_da_nome ? ' · cambiato da ' + esc(r.aggiornato_da_nome) + ' il ' + esc(new Date(r.aggiornato_il).toLocaleDateString('it-IT')) : '';
    const prova = MODELLI_PDF_SITO[r.codice] ? '<button class="btn sm" type="button" onclick="provaPdfModello(\'' + esc(r.codice) + '\')">🧪 PDF di prova</button>' : '';
    return '<div class="card" style="margin:8px 0;padding:10px" data-modello-pdf="' + esc(r.codice) + '">' +
      '<b>' + esc(r.nome) + '</b>' + (r.attivo === false ? ' <span class="badge">non attivo</span>' : '') +
      '<div style="font-size:12px;color:var(--m)">' + esc(r.codice) + ' · <b>rev. ' + esc(r.revisione) + '</b>' + del + '</div>' +
      (r.descrizione ? '<div style="font-size:12px;margin-top:4px">' + esc(r.descrizione) + '</div>' : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><button class="btn p sm" type="button" onclick="apriModelloPdf(\'' + esc(r.codice) + '\')">✏️ Cambia i testi</button>' + prova + '</div></div>';
  }).join('');
}

function apriModelloPdf(codice) {
  const r = (MODELLI_PDF.righe || []).find(function(x) { return x.codice === codice; });
  if (!r) { toast('Modello non trovato: rileggi il riquadro', 'err'); return; }
  ge('mpdf-codice').value = r.codice;
  ge('mpdf-intestazione').textContent = r.nome + ' · rev. ' + r.revisione;
  ge('mpdf-titolo').value = r.titolo || '';
  ge('mpdf-testi').innerHTML = (r.blocchi || []).map(function(b) {
    return '<div class="f"><label>' + esc(b.etichetta) + '</label>' +
      '<textarea class="mpdf-testo" data-chiave="' + esc(b.chiave) + '" rows="5" maxlength="4000" style="width:100%">' + esc(b.testo || '') + '</textarea></div>';
  }).join('') || '<div style="color:var(--m);font-size:12px">Questo modello non ha testi fissi.</div>';
  ge('mpdf-esito').textContent = '';
  ge('mpdf-prova').style.display = MODELLI_PDF_SITO[r.codice] ? '' : 'none';
  openM('m-modello-pdf');
}

async function salvaModelloPdf() {
  const codice = v('mpdf-codice');
  const titolo = v('mpdf-titolo').trim();
  if (!titolo) { toast('Scrivi il titolo del documento', 'err'); return; }
  const testi = {};
  document.querySelectorAll('#mpdf-testi .mpdf-testo').forEach(function(t) { testi[t.dataset.chiave] = t.value; });
  const btn = ge('mpdf-salva');
  btn.disabled = true;
  try {
    const { data, error } = await db.rpc('salva_testi_modello_pdf', { p_codice: codice, p_titolo: titolo, p_testi: testi });
    if (error) throw new Error(error.message);
    toast(data && data.cambiato ? 'Testi salvati: ora il modello è alla rev. ' + data.revisione : 'Nessun cambio: resta la rev. ' + (data && data.revisione), 'ok');
    await mostraModelliPdfImpostazioni();
    const r = (MODELLI_PDF.righe || []).find(function(x) { return x.codice === codice; });
    if (r) ge('mpdf-intestazione').textContent = r.nome + ' · rev. ' + r.revisione;
  } catch (e) {
    toast('Salvataggio non riuscito: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

async function provaPdfModello(codice) {
  codice = codice || v('mpdf-codice') || 'prova';
  try {
    const esito = await generaPdfDaModello(codice, {}, { scarica: true });
    const testo = '📄 ' + esito.nomeFile + ' · ' + (esito.revisione ? 'rev. ' + esito.revisione : 'testi predefiniti') + ' · impronta SHA-256: ' + esito.impronta;
    const box = ge('mpdf-esito');
    if (box) box.textContent = testo;
    const st = ge('si-modelli-pdf-ultimo');
    if (st) { st.style.display = ''; st.textContent = testo; }
    toast('PDF di prova scaricato (' + (esito.revisione ? 'rev. ' + esito.revisione : 'testi predefiniti') + ')', 'ok');
    return esito;
  } catch (e) {
    toast('PDF non generato: ' + e.message, 'err');
    return null;
  }
}
