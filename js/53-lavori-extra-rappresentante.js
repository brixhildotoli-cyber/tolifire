// =====================================================================
// js/53-lavori-extra-rappresentante.js — decisione di Toli del 02/11
// (risposta 24: "sì e sì"), con sql/56-lavori-extra-rappresentante.
//
// A) Lavori extra sotto 3.000 €: il preventivo integrativo lo prepara anche
//    il RAPPRESENTANTE del cliente. Nel box "➕ Lavori extra" della
//    commessa e nella dashboard del rappresentante (rap-lavori-extra), per
//    un lavoro extra "richiesto" c'è "🧾 Prepara io il preventivo (fino a
//    3.000 €)": editor semplice (finestra m-preventivo-extra-rapp, id per-)
//    con voci (descrizione, categoria, quantità, unità, PREZZO CLIENTE:
//    niente costi interni né margini), IVA, modalità di pagamento, note e
//    totale imponibile in anteprima. Scrive solo con le RPC di sql/56
//    (salva_preventivo_extra_rappresentante: sopra 3.000 € si ferma, il
//    database impone la regola). "📄 Salva, crea il PDF e mettilo tra i
//    miei preventivi": PDF per il cliente con generaPreventivoClientePDF di
//    js/18 (stesso modello), caricato in preventivi-documenti
//    <preventivo>/cliente/ (regola preventivi_documenti_cliente_rappresentante)
//    e invia_preventivo_extra_rappresentante: il preventivo va in "I miei
//    preventivi", dove si registra l'esito come sempre. "↩️ Lascia al
//    commerciale" toglie la bozza e rimanda il progetto al commerciale.
//    Il commerciale non ha più "Prepara/Riprendi il preventivo" sui lavori
//    preparati dal rappresentante (commesse_lavori_extra.preparato_da_
//    rappresentante) e non li conta tra i suoi da preparare.
// B) Importo della commessa: "Preventivo X + lavori extra accettati Y =
//    Totale Z" (imponibile, IVA esclusa) nel riepilogo della commessa, nella
//    pagina Commesse e nel tab Commesse della scheda cliente (js/26), con la
//    RPC importi_extra_commesse (anche per capo tecnico e rappresentante,
//    che non leggono tutti i preventivi). Senza lavori extra accettati
//    l'importo resta com'era.
// Senza sql/56 non compare nulla di nuovo.
// =====================================================================

let lavoriExtraRappDisponibili = null;
let importiExtraDisponibili = null;
let importiExtraCommesse = {};          // commessa id → { n, totale }
let preventivoExtraRappAperto = null;   // { lavoroId, preventivo, voci, ... }

async function verificaLavoriExtraRappDisponibili() {
  if (lavoriExtraRappDisponibili !== null) return lavoriExtraRappDisponibili;
  const { error } = await db.from('commesse_lavori_extra').select('preparato_da_rappresentante').limit(1);
  lavoriExtraRappDisponibili = !error;
  return lavoriExtraRappDisponibili;
}

// ── B) Importo della commessa con i lavori extra accettati ─────────────
async function caricaImportiExtraCommesse(ids) {
  const lista = (ids || []).filter(Boolean);
  if (!lista.length || importiExtraDisponibili === false) return;
  for (let i = 0; i < lista.length; i += 500) {
    const blocco = lista.slice(i, i + 500);
    const { data, error } = await db.rpc('importi_extra_commesse', { p_commesse: blocco });
    if (error) {
      // Funzione assente (sql/56 non eseguito) o ruolo senza commesse.
      if (['PGRST202', '42883'].includes(error.code)) importiExtraDisponibili = false;
      else console.warn('Importi lavori extra:', error.message);
      return;
    }
    importiExtraDisponibili = true;
    blocco.forEach(function(id) { delete importiExtraCommesse[id]; });
    (data || []).forEach(function(r) {
      importiExtraCommesse[r.commessa_id] = { n: r.n_extra || 0, totale: Number(r.totale_extra || 0) };
    });
  }
}

function importoExtraCommessa(c) {
  const x = c && importiExtraCommesse[c.id];
  return x && x.n > 0 ? x : null;
}

// Testo dell'importo (riepilogo e scheda cliente).
function testoImportoCommessa(c) {
  if (!c) return '';
  const base = c.importo_imponibile != null ? Number(c.importo_imponibile) : null;
  const x = importoExtraCommessa(c);
  if (!x) return base != null ? euroPreventivo(base) : '';
  const totale = (base || 0) + x.totale;
  return 'Preventivo ' + euroPreventivo(base || 0) + ' + lavori extra accettati (' + x.n + ') ' +
    euroPreventivo(x.totale) + ' = Totale ' + euroPreventivo(totale);
}

// Cella della pagina Commesse: il totale, sotto il dettaglio.
function htmlImportoCommessaElenco(c) {
  const base = c.importo_imponibile != null ? Number(c.importo_imponibile) : null;
  const x = importoExtraCommessa(c);
  if (!x) return base != null ? esc(euroPreventivo(base)) : '—';
  return '<b>' + esc(euroPreventivo((base || 0) + x.totale)) + '</b>' +
    '<div style="font-size:11px;color:var(--m);white-space:normal">' + esc(euroPreventivo(base || 0)) +
    ' + extra ' + esc(euroPreventivo(x.totale)) + '</div>';
}

// ── A) Chi vede cosa nei lavori extra ─────────────────────────────────
function rappresentantePuoPreparareExtra(commessa, r) {
  if (ROLE !== 'rappresentante' || lavoriExtraRappDisponibili !== true || !r) return false;
  if (!commessa || !commessaAperta(commessa)) return false;
  if (r.stato === 'richiesto' && !r.preventivo_id) return progettoLavoroExtraAlCommerciale(r);
  return r.preparato_da_rappresentante === true && r.stato === 'in_preventivo' &&
    ['bozza', 'inviato_a_rappresentante'].includes(r.preventivo_stato);
}

// Prima di disegnare i lavori extra serve sapere se sql/56 c'è.
(function() {
  ['caricaLavoriExtraCommessa', 'caricaLavoriExtraDashboard', 'caricaRiepilogoLavoriExtra'].forEach(function(nome) {
    if (typeof window[nome] !== 'function') return;
    const prima = window[nome];
    window[nome] = async function() {
      try { await verificaLavoriExtraRappDisponibili(); } catch (e) {}
      return prima.apply(this, arguments);
    };
  });

  // Il commerciale non prepara i lavori preparati dal rappresentante.
  if (typeof lavoroExtraDaPreparare === 'function') {
    const primaDaPreparare = lavoroExtraDaPreparare;
    lavoroExtraDaPreparare = function(r) {
      if (r && r.preparato_da_rappresentante === true) return false;
      return primaDaPreparare.apply(this, arguments);
    };
  }
  if (typeof puoPreparareLavoroExtra === 'function') {
    const primaPuoPreparare = puoPreparareLavoroExtra;
    puoPreparareLavoroExtra = function(commessa, r) {
      if (r && r.preparato_da_rappresentante === true) return false;
      return primaPuoPreparare.apply(this, arguments);
    };
  }
  if (typeof testoPreventivoLavoroExtra === 'function') {
    const primaTesto = testoPreventivoLavoroExtra;
    testoPreventivoLavoroExtra = function(r) {
      const testo = primaTesto.apply(this, arguments);
      if (r && r.preparato_da_rappresentante === true && r.preventivo_numero) {
        return testo.replace('preventivo integrativo n. ' + r.preventivo_numero,
          'preventivo integrativo n. ' + r.preventivo_numero + ' (preparato dal rappresentante)');
      }
      if (r && r.stato === 'richiesto' && !r.preventivo_numero && testo.indexOf('(commerciale)') >= 0 && lavoriExtraRappDisponibili === true) {
        return testo.replace('(commerciale)', '(commerciale, oppure il rappresentante fino a 3.000 €)');
      }
      return testo;
    };
  }
  if (typeof htmlLavoroExtra === 'function') {
    const primaHtml = htmlLavoroExtra;
    htmlLavoroExtra = function(commessa, r) {
      let html = primaHtml.apply(this, arguments);
      // Il commerciale non apre il preventivo del rappresentante: non ne
      // legge le voci (policy di preventivi_voci) e non lo deve cambiare.
      if (ROLE === 'commerciale' && r && r.preparato_da_rappresentante === true && r.preventivo_id) {
        html = html.replace('<button class="btn sm" onclick="openPreventivoDetail(\'' + esc(r.preventivo_id) + '\')">🧾 Preventivo n. ' + esc(r.preventivo_numero || '') + '</button>', '');
      }
      if (!rappresentantePuoPreparareExtra(commessa, r)) return html;
      const etichetta = r.preventivo_id ? '🧾 Riprendi il mio preventivo' : '🧾 Prepara io il preventivo (fino a 3.000 €)';
      const bottone = '<button class="btn sm p" onclick="apriPreventivoExtraRapp(\'' + esc(r.id) + '\')">' + etichetta + '</button>';
      // In testa ai bottoni del lavoro (o in un riquadro nuovo se non ce ne sono).
      const segno = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">';
      const i = html.indexOf(segno);
      if (i >= 0) return html.slice(0, i + segno.length) + bottone + html.slice(i + segno.length);
      const j = html.indexOf('<details style="margin-top:4px">');
      return j >= 0 ? html.slice(0, j) + segno + bottone + '</div>' + html.slice(j) : html;
    };
  }
})();

// ── Editor del rappresentante ─────────────────────────────────────────
const CATEGORIE_VOCE_EXTRA_RAPP = [
  { value: 'materiale', label: 'Materiale' },
  { value: 'manodopera', label: 'Manodopera' },
  { value: 'servizio', label: 'Servizio' },
  { value: 'nolo', label: 'Nolo' },
  { value: 'trasporto', label: 'Trasporto' },
  { value: 'altro', label: 'Altro' }
];

function htmlVociPreventivoExtraRapp(voci) {
  if (!voci.length) return '<div class="empty" style="padding:10px">Nessuna voce: premi "+ Aggiungi voce".</div>';
  return voci.map(function(v, i) {
    const campoNum = function(nome, valore, etichetta) {
      return '<div class="f"><label>' + etichetta + '</label><input type="text" inputmode="decimal" autocomplete="off" id="per-' + i + '-' + nome +
        '" value="' + esc(valore === null || valore === undefined || valore === '' ? '' : importoConVirgolaPreventivo(valore, nome === 'prezzo' ? 2 : 0)) +
        '" oninput="virgolaCampoImportoPreventivo(this); aggiornaTotalePreventivoExtraRapp()" onpaste="incollaImportoPreventivo(event, this)"></div>';
    };
    return '<div style="border:1px solid var(--bo);border-radius:var(--rs);padding:10px;margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<b style="font-size:13px">Voce ' + (i + 1) + '</b>' +
        '<button class="btn sm" style="color:var(--r)" onclick="togliVocePreventivoExtraRapp(' + i + ')">🗑️ Togli</button>' +
      '</div>' +
      '<div class="f"><label>Descrizione</label><input type="text" id="per-' + i + '-descrizione" value="' + esc(v.descrizione || '') + '" placeholder="Es. Porta REI 60 90×210 compresa posa"></div>' +
      '<div class="fr">' +
        '<div class="f"><label>Categoria</label><select id="per-' + i + '-categoria">' +
          CATEGORIE_VOCE_EXTRA_RAPP.map(function(c) { return '<option value="' + c.value + '"' + (c.value === (v.categoria || 'materiale') ? ' selected' : '') + '>' + c.label + '</option>'; }).join('') +
        '</select></div>' +
        campoNum('quantita', v.quantita, 'Quantità') +
        '<div class="f"><label>Unità</label><input type="text" id="per-' + i + '-unita" value="' + esc(v.unita_misura || 'pz') + '" placeholder="pz, h, ml..."></div>' +
        campoNum('prezzo', v.prezzo_unitario, 'Prezzo cliente (€)') +
      '</div>' +
    '</div>';
  }).join('');
}

function vociModuloPreventivoExtraRapp() {
  const voci = [];
  for (let i = 0; ge('per-' + i + '-descrizione'); i++) {
    const q = v('per-' + i + '-quantita').trim();
    const p = v('per-' + i + '-prezzo').trim();
    voci.push({
      descrizione: v('per-' + i + '-descrizione').trim(),
      categoria: v('per-' + i + '-categoria') || 'materiale',
      quantita: q ? leggiImportoPreventivo(q) : null,
      unita_misura: v('per-' + i + '-unita').trim() || 'pz',
      prezzo_unitario: p ? leggiImportoPreventivo(p) : null
    });
  }
  return voci;
}

function totalePreventivoExtraRapp(voci) {
  return Math.round(voci.reduce(function(t, x) {
    return t + Math.round((Number(x.quantita) || 0) * (Number(x.prezzo_unitario) || 0) * 100) / 100;
  }, 0) * 100) / 100;
}

function aggiornaTotalePreventivoExtraRapp() {
  const totale = totalePreventivoExtraRapp(vociModuloPreventivoExtraRapp());
  const box = ge('per-totale');
  const oltre = totale > 3000;
  if (box) {
    box.textContent = euroPreventivo(totale);
    box.style.color = oltre ? 'var(--r)' : '';
  }
  const avviso = ge('per-avviso');
  if (avviso) {
    avviso.innerHTML = oltre
      ? '<div class="al2 e">Il totale supera 3.000 €: questo preventivo integrativo lo prepara il commerciale. Premi <b>↩️ Lascia al commerciale</b> oppure riduci le voci.</div>'
      : '';
  }
  ['per-salva', 'per-invia'].forEach(function(id) { if (ge(id)) ge(id).disabled = oltre; });
  return totale;
}

function disegnaVociPreventivoExtraRapp(voci) {
  const box = ge('per-voci');
  if (box) box.innerHTML = htmlVociPreventivoExtraRapp(voci);
  aggiornaTotalePreventivoExtraRapp();
}

function aggiungiVocePreventivoExtraRapp() {
  const voci = vociModuloPreventivoExtraRapp();
  voci.push({ descrizione: '', categoria: 'materiale', quantita: 1, unita_misura: 'pz', prezzo_unitario: null });
  disegnaVociPreventivoExtraRapp(voci);
}

function togliVocePreventivoExtraRapp(indice) {
  const voci = vociModuloPreventivoExtraRapp();
  voci.splice(indice, 1);
  disegnaVociPreventivoExtraRapp(voci);
}

async function apriPreventivoExtraRapp(lavoroId) {
  if (!(await verificaLavoriExtraRappDisponibili())) {
    toast('Funzione non ancora attiva (serve aggiornare il database)', 'err');
    return;
  }
  const r = (typeof lavoriExtraCache !== 'undefined' && lavoriExtraCache[lavoroId]) || null;
  const { data, error } = await db.rpc('preventivo_extra_rappresentante', { p_lavoro_extra_id: lavoroId });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  if (!data.puo_preparare) { toast(data.motivo || 'Non puoi preparare questo preventivo', 'err'); return; }

  const p = data.preventivo;
  preventivoExtraRappAperto = { lavoroId: lavoroId, preventivo: p, lavoro: r };
  const commessa = r && r.commesse;
  ge('per-sottotitolo').textContent = [
    commessa && commessa.codice ? 'Commessa ' + commessa.codice : '',
    commessa && commessa.clienti && commessa.clienti.ragione_sociale,
    r ? 'Lavoro extra n. ' + r.numero + ': ' + r.descrizione : '',
    p ? 'Preventivo n. ' + p.numero + (p.stato === 'inviato_a_rappresentante' ? ' (già tra i tuoi preventivi: se lo cambi, ricrea il PDF)' : ' (bozza)') : ''
  ].filter(Boolean).join(' · ');
  ge('per-iva').value = String(p && p.iva_perc != null ? Number(p.iva_perc) : 22);
  ge('per-condizioni').value = (p && p.condizioni_pagamento) || '';
  ge('per-note').value = (p && p.note) || '';
  const voci = (data.voci || []).length ? data.voci : [{
    descrizione: r && r.descrizione ? r.descrizione : '', categoria: 'materiale', quantita: 1, unita_misura: 'pz', prezzo_unitario: null
  }];
  disegnaVociPreventivoExtraRapp(voci);
  openM('m-preventivo-extra-rapp');
}

// Da "I miei preventivi" (js/13): riapre l'editor del preventivo
// integrativo preparato dal rappresentante (si ritrova dal progetto).
async function apriPreventivoExtraRappDaProgetto(progettoId) {
  const { data, error } = await db.from('commesse_lavori_extra')
    .select('*, progetti_tecnici(stato), commesse(id, codice, stato, titolo, cliente_id, clienti(ragione_sociale))')
    .eq('progetto_tecnico_id', progettoId).maybeSingle();
  if (error || !data) { toast('Lavoro extra non trovato' + (error ? ': ' + error.message : ''), 'err'); return; }
  if (typeof lavoriExtraCache !== 'undefined') lavoriExtraCache[data.id] = data;
  await apriPreventivoExtraRapp(data.id);
}

function chiudiPreventivoExtraRapp() {
  closeM('m-preventivo-extra-rapp');
  preventivoExtraRappAperto = null;
}

let salvataggioPreventivoExtraRapp = false;

async function salvaPreventivoExtraRapp(conPdf) {
  const s = preventivoExtraRappAperto;
  if (!s || salvataggioPreventivoExtraRapp) return;
  const voci = vociModuloPreventivoExtraRapp();
  if (!voci.length) { toast('Inserisci almeno una voce', 'err'); return; }
  for (let i = 0; i < voci.length; i++) {
    if (!voci[i].descrizione) { toast('Voce ' + (i + 1) + ': scrivi la descrizione', 'err'); return; }
    if (!(voci[i].quantita > 0)) { toast('Voce ' + (i + 1) + ': quantità maggiore di 0', 'err'); return; }
    if (voci[i].prezzo_unitario === null || voci[i].prezzo_unitario < 0) { toast('Voce ' + (i + 1) + ': scrivi il prezzo per il cliente', 'err'); return; }
  }
  const totale = aggiornaTotalePreventivoExtraRapp();
  if (totale > 3000) { toast('Sopra 3.000 € il preventivo integrativo lo prepara il commerciale', 'err'); return; }
  if (totale <= 0) { toast('Il totale deve essere maggiore di zero', 'err'); return; }

  salvataggioPreventivoExtraRapp = true;
  ['per-salva', 'per-invia', 'per-lascia'].forEach(function(id) { if (ge(id)) ge(id).disabled = true; });
  try {
    const { data, error } = await db.rpc('salva_preventivo_extra_rappresentante', {
      p_lavoro_extra_id: s.lavoroId,
      p_voci: voci,
      p_iva_perc: Number(v('per-iva')),
      p_note: v('per-note'),
      p_condizioni_pagamento: v('per-condizioni')
    });
    if (error) { toast('Errore salvataggio: ' + error.message, 'err'); return; }
    const preventivoId = data.preventivo_id;

    if (!conPdf) {
      toast('Bozza del preventivo n. ' + data.numero + ' salvata', 'ok');
      chiudiPreventivoExtraRapp();
      await aggiornaDopoPreventivoExtraRapp();
      return;
    }

    // Dati per il PDF: preventivo appena salvato e cliente (letto da lui).
    const letto = await db.rpc('preventivo_extra_rappresentante', { p_lavoro_extra_id: s.lavoroId });
    if (letto.error || !letto.data.preventivo) { toast('Preventivo salvato, ma errore lettura per il PDF: ' + (letto.error ? letto.error.message : ''), 'err'); return; }
    const p = letto.data.preventivo;
    let cliente = { ragione_sociale: '' };
    let clienteId = s.lavoro && s.lavoro.commesse && s.lavoro.commesse.cliente_id;
    if (!clienteId && s.lavoro && s.lavoro.commessa_id) {
      const rcom = await db.from('commesse').select('cliente_id').eq('id', s.lavoro.commessa_id).maybeSingle();
      clienteId = rcom.data && rcom.data.cliente_id;
    }
    const rc = clienteId
      ? await db.from('clienti').select('ragione_sociale, indirizzo, citta').eq('id', clienteId).maybeSingle()
      : { data: null };
    if (rc.data) cliente = rc.data;
    else if (s.lavoro && s.lavoro.commesse && s.lavoro.commesse.clienti) cliente = s.lavoro.commesse.clienti;

    const pdf = await generaPreventivoClientePDF({
      preventivo: {
        id: p.id, numero: p.numero, tipo: 'fornitura_e_posa', data_scadenza: p.data_scadenza,
        iva_perc: p.iva_perc, totale_imponibile: p.totale_imponibile, note: p.note,
        condizioni_pagamento: p.condizioni_pagamento, clienti: cliente
      },
      voci: letto.data.voci || []
    });
    if (!pdf || !pdf.blob) { toast('Preventivo salvato, ma il PDF non è stato creato: riprova', 'err'); return; }

    const percorso = preventivoId + '/cliente/' + pdf.nomeFile;
    const up = await db.storage.from('preventivi-documenti').upload(percorso, pdf.blob, { contentType: 'application/pdf', upsert: false });
    if (up.error) { toast('PDF creato ma non salvato: ' + up.error.message, 'err'); return; }

    const inv = await db.rpc('invia_preventivo_extra_rappresentante', {
      p_preventivo_id: preventivoId, p_pdf_path: percorso, p_pdf_nome: pdf.nomeFile
    });
    if (inv.error) { toast('PDF salvato, ma errore invio: ' + inv.error.message, 'err'); return; }

    toast('Preventivo n. ' + p.numero + ' pronto: lo trovi in "I miei preventivi" per mandarlo al cliente e registrare l\'esito', 'ok');
    chiudiPreventivoExtraRapp();
    await aggiornaDopoPreventivoExtraRapp();
    if (ge('pg-preventivi-rapp')?.classList.contains('on') && typeof loadPreventiviRappresentante === 'function') await loadPreventiviRappresentante();
  } finally {
    salvataggioPreventivoExtraRapp = false;
    ['per-salva', 'per-invia', 'per-lascia'].forEach(function(id) { if (ge(id)) ge(id).disabled = false; });
    if (preventivoExtraRappAperto) aggiornaTotalePreventivoExtraRapp();
  }
}

async function lasciaPreventivoExtraRapp() {
  const s = preventivoExtraRappAperto;
  if (!s) return;
  if (!confirm('Lasciare questo preventivo integrativo al commerciale?' +
      (s.preventivo ? '\nLa tua bozza (preventivo n. ' + s.preventivo.numero + ') verrà cancellata.' : ''))) return;
  const { error } = await db.rpc('lascia_preventivo_extra_al_commerciale', { p_lavoro_extra_id: s.lavoroId });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast('Il preventivo integrativo lo prepara il commerciale', 'ok');
  chiudiPreventivoExtraRapp();
  await aggiornaDopoPreventivoExtraRapp();
}

async function aggiornaDopoPreventivoExtraRapp() {
  if (typeof aggiornaDopoLavoroExtra === 'function') {
    try { await aggiornaDopoLavoroExtra(); } catch (e) { console.warn(e); }
  }
}
