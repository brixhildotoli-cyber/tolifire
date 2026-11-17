// js/18e-salvataggio-pdf-cliente.js — costi, salvataggio delle voci, PDF del cliente, PDF esterno, eliminazione.
// Riordino del 17/11: era una parte di js/18-preventivi.js (righe 6334-7976),
// spostata così com'era. Si carica subito dopo il pezzo precedente (index.html).

async function renderCostiPreventivo() {
  const box = ge('pvd-costi-content');

  if (!box || !currentPreventivoId) return;

  box.innerHTML = '<div class="load">Caricamento voci...</div>';

  const { data, error } = await db
    .from('preventivi_voci')
    .select('*')
    .eq('preventivo_id', currentPreventivoId)
    .order('ordinamento')
    .order('creato_il');

  if (error) {
    box.innerHTML = `
      <div class="al2 e">
        Errore caricamento voci: ${esc(error.message)}
      </div>
    `;
    return;
  }

  // F4.2: i campi dell'anticipo solo se sql/24 è stato eseguito.
  const anticipoDisponibile = await verificaAnticipoPreventivoDisponibile();
  const oggettoNotaDisponibile = await verificaOggettoNotaPreventivoDisponibile();

    const { data: preventivo } = await db
    .from('preventivi')
    .select((anticipoDisponibile
      ? 'note,condizioni_pagamento,stato,sconto_perc,anticipo_richiesto,anticipo_tipo,anticipo_valore'
      : 'note,condizioni_pagamento,stato,sconto_perc')
      + (oggettoNotaDisponibile ? ',oggetto,nota_introduttiva' : '')
      + (computoPreventivoDisponibile === true ? ',computo_path,computo_nome,commerciale_id' : ''))
    .eq('id', currentPreventivoId)
    .single();

  // F4.3: stato aggiornato (l'esito può essere arrivato nel frattempo).
  if (preventivo) impostaBloccoVociPreventivo(preventivo.stato);

  notePreventivoCliente = preventivo?.note || '';
  oggettoNotaEditorDisponibile = oggettoNotaDisponibile && !!preventivo;
  oggettoPreventivoEditor = preventivo?.oggetto || '';
  notaIntroPreventivoEditor = preventivo?.nota_introduttiva || '';
  computoEditorPreventivo = {
    disponibile: computoPreventivoDisponibile === true && !!preventivo,
    path: preventivo?.computo_path || null,
    nome: preventivo?.computo_nome || null,
    commercialeId: preventivo?.commerciale_id || null,
    stato: preventivo?.stato || null
  };
  scontoPreventivoEditor = Number(preventivo?.sconto_perc || 0) > 0 ? Number(preventivo.sconto_perc) : 0;

  condizioniPagamentoPreventivo =
  preventivo?.condizioni_pagamento || '';

  anticipoPreventivoEditor = {
    disponibile: anticipoDisponibile && !!preventivo,
    bloccato: STATI_ESITO_PREVENTIVO.includes(preventivo?.stato),
    richiesto: preventivo?.anticipo_richiesto ?? null,
    tipo: preventivo?.anticipo_tipo || 'percentuale',
    valore: preventivo?.anticipo_valore ?? ''
  };

vociPreventivoDati = data || [];
// sql/265: le voci si leggono con select *: se la colonna c'è si vede lì,
// senza voci si guarda una voce che il ruolo legge (nessuna richiesta in errore).
// 12/11 (Erika): campo "Quantità x UM" tolto dal sito, si torna a una sola quantità
quantitaUmEditorDisponibile = false;
// F16.34 (js/76, sql/112): codice dell'ente nelle voci
if (typeof verificaCodiceClienteVociDisponibile === 'function') await verificaCodiceClienteVociDisponibile(vociPreventivoDati);
storicoUndoPreventivo = [];
vociEliminatePreventivo = [];
chiaveModificaPreventivo = '';
disegnaVociPreventivo();
}

function aggiungiVocePreventivo() {
  registraStatoUndoPreventivo('aggiungi-' + Date.now());
  vociPreventivoDati.push({
    id: null,
    // chiave interna (non va nel database): lega la voce nuova ai punti
    // di "Annulla" per dargli l'id quando viene inserita.
    _chiave: 'nuova-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    categoria: 'materiale',
    descrizione: '',
    unita_misura: '',
    quantita: 0,
    quantita_um: '',
    costo_unitario: 0,
    prezzo_unitario: 0
  });

  disegnaVociPreventivo();
}

// Bottoni in fondo all'editor (richiesta di Erika del 13/11): dopo il ridisegno
// la pagina resta sui bottoni in fondo, sotto la voce nuova
function restaSuiBottoniFondoPreventivo() {
  setTimeout(function() {
    const b = ge('pvv-bottoni-fondo');
    if (b) b.scrollIntoView({ block: 'center' });
  }, 50);
}

function rimuoviNuovaVocePreventivo(indice) {
  registraStatoUndoPreventivo('rimuovi-' + Date.now());
  vociPreventivoDati.splice(indice, 1);
  disegnaVociPreventivo();
}

function eliminaVocePreventivo(voceId) {
  const indice = vociPreventivoDati.findIndex(voce => voce.id === voceId);

  if (indice < 0) return;
  if (!confirm('Eliminare questa voce dal preventivo?')) return;

  registraStatoUndoPreventivo('elimina-' + Date.now());

  const [voceEliminata] = vociPreventivoDati.splice(indice, 1);

  if (
    voceEliminata.id &&
    !vociEliminatePreventivo.includes(voceEliminata.id)
  ) {
    vociEliminatePreventivo.push(voceEliminata.id);
  }

  disegnaVociPreventivo();
  toast('Voce rimossa. Salva il preventivo per confermare.', 'ok');
}

// Un solo salvataggio delle voci alla volta: con due clic ravvicinati su
// "Salva" (o "Salva" e subito "Genera PDF cliente") le voci nuove venivano
// inserite due volte e il totale del PDF raddoppiava.
let salvataggioVociInCorso = null;

async function salvaVociPreventivo() {
  if (salvataggioVociInCorso) return salvataggioVociInCorso;
  salvataggioVociInCorso = eseguiSalvataggioVociPreventivo();
  try {
    return await salvataggioVociInCorso;
  } finally {
    salvataggioVociInCorso = null;
  }
}

async function eseguiSalvataggioVociPreventivo() {
  // F4.3: dopo l'esito non si salva nulla (il PDF si rigenera dalle voci salvate).
  if (vociPreventivoBloccate) return true;

  const vociNonValide = vociPreventivoDati.some(function(voce) {
    return !String(voce.descrizione || '').trim();
  });

  if (vociNonValide) {
    toast('Inserisci una descrizione per ogni voce', 'err');
    return false;
  }

  // sql/265: "Quantità x UM" (testo libero, stesso limite del vincolo)
  if (quantitaUmEditorDisponibile && vociPreventivoDati.some(function(voce) {
    return testoQuantitaUmVoce(voce.quantita_um).length > QUANTITA_UM_VOCE_MAX;
  })) {
    toast('"Quantità x UM" è troppo lunga (al massimo ' + QUANTITA_UM_VOCE_MAX + ' caratteri)', 'err');
    return false;
  }

  // Le voci di questo salvataggio, nell'ordine a schermo (= ordine di
  // creazione: le voci nuove vanno sempre in fondo). Si fissa qui perché
  // durante il salvataggio la lista a schermo può ancora cambiare.
  const vociDaSalvare = vociPreventivoDati.slice();

  const totaleImponibile = vociDaSalvare.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'vendita');
  }, 0);

  // sql/258: con lo sconto l'anticipo si controlla sul totale scontato.
  const totaleScontatoVoci = importoScontatoPreventivo(totaleImponibile, scontoPreventivoEditor);
  const datiPreventivo = {
    totale_imponibile: await totaleDaScrivereConSconto(totaleImponibile, scontoPreventivoEditor),
    note: notePreventivoCliente.trim() || null,
    condizioni_pagamento: condizioniPagamentoPreventivo.trim() || null,
    aggiornato_il: new Date().toISOString()
  };

  // sql/264: oggetto e nota prima della tabella dei prezzi (solo se le
  // colonne ci sono; i limiti sono gli stessi dei vincoli del database).
  if (oggettoNotaEditorDisponibile) {
    const oggetto = String(oggettoPreventivoEditor || '').replace(/[\r\n]+/g, ' ').trim();
    const notaIntro = String(notaIntroPreventivoEditor || '').trim();
    if (oggetto.length > OGGETTO_PREVENTIVO_MAX) {
      toast('L\'oggetto è troppo lungo (al massimo ' + OGGETTO_PREVENTIVO_MAX + ' caratteri)', 'err');
      return false;
    }
    if (notaIntro.length > NOTA_INTRO_PREVENTIVO_MAX) {
      toast('La nota prima della tabella è troppo lunga (al massimo ' + NOTA_INTRO_PREVENTIVO_MAX + ' caratteri)', 'err');
      return false;
    }
    datiPreventivo.oggetto = oggetto || null;
    datiPreventivo.nota_introduttiva = notaIntro || null;
  }

  // F4.2: anticipo (solo con sql/24 e finché il cliente non ha risposto).
  // Si controlla PRIMA di scrivere le voci: prima le voci nuove venivano
  // inserite e poi il salvataggio si fermava sull'anticipo; con "Annulla"
  // tornavano senza id e il salvataggio dopo le inseriva una seconda volta.
  if (anticipoPreventivoEditor.disponibile && !anticipoPreventivoEditor.bloccato) {
    const anticipo = datiAnticipoValidi(
      anticipoPreventivoEditor.richiesto,
      anticipoPreventivoEditor.tipo,
      anticipoPreventivoEditor.valore,
      scontoPreventivoEditor > 0 ? totaleScontatoVoci : totaleImponibile,
      true
    );

    if (anticipo.errore) {
      toast(anticipo.errore + ' (oppure scegli "Non indicato")', 'err');
      return false;
    }

    datiPreventivo.anticipo_richiesto = anticipo.richiesto;
    datiPreventivo.anticipo_tipo = anticipo.tipo;
    datiPreventivo.anticipo_valore = anticipo.valore;
  }

  // Voci tolte con "Elimina": vanno cancellate davvero, altrimenti al
  // salvataggio successivo ricompaiono e finiscono nel PDF.
  if (vociEliminatePreventivo.length) {
    const idEliminati = vociEliminatePreventivo.slice();
    const { error: erroreElimina } = await db
      .from('preventivi_voci')
      .delete()
      .in('id', idEliminati)
      .eq('preventivo_id', currentPreventivoId);

    if (erroreElimina) {
      toast('Errore eliminazione voci: ' + erroreElimina.message, 'err');
      return false;
    }
    vociEliminatePreventivo = vociEliminatePreventivo.filter(function(id) {
      return !idEliminati.includes(id);
    });
    allineaStoricoUndoPreventivo(null, idEliminati);
  }

  // ordinamento = posizione della voce nella lista (esistenti e nuove):
  // al ricaricamento e nel PDF l'ordine resta quello a schermo.
  for (let indice = 0; indice < vociDaSalvare.length; indice++) {
    const voce = vociDaSalvare[indice];
    if (!voce.id) continue;

    const datiVoce = {
      categoria: voce.categoria,
      descrizione: String(voce.descrizione).trim(),
      unita_misura: voce.unita_misura || 'pz',
      quantita: numeroPreventivo(voce.quantita),
      costo_unitario: numeroPreventivo(voce.costo_unitario),
      prezzo_unitario: numeroPreventivo(voce.prezzo_unitario),
      ordinamento: indice,
      aggiornato_il: new Date().toISOString()
    };
    if (quantitaUmEditorDisponibile) datiVoce.quantita_um = testoQuantitaUmVoce(voce.quantita_um) || null;
    if (typeof codiceClienteVociDisponibile !== 'undefined' && codiceClienteVociDisponibile === true) datiVoce.codice_cliente = testoCodiceClienteVoce(voce.codice_cliente) || null; // F16.34, sql/112

    const { error } = await db
      .from('preventivi_voci')
      .update(datiVoce)
      .eq('id', voce.id)
      .eq('preventivo_id', currentPreventivoId);

    if (error) {
      toast('Errore salvataggio voce: ' + error.message, 'err');
      return false;
    }
  }

  const righe = [];
  vociDaSalvare.forEach(function(voce, indice) {
    if (voce.id) return;
    const riga = {
      preventivo_id: currentPreventivoId,
      categoria: voce.categoria,
      descrizione: String(voce.descrizione).trim(),
      unita_misura: voce.unita_misura || 'pz',
      quantita: numeroPreventivo(voce.quantita),
      costo_unitario: numeroPreventivo(voce.costo_unitario),
      prezzo_unitario: numeroPreventivo(voce.prezzo_unitario),
      ordinamento: indice
    };
    if (quantitaUmEditorDisponibile) riga.quantita_um = testoQuantitaUmVoce(voce.quantita_um) || null;
    if (typeof codiceClienteVociDisponibile !== 'undefined' && codiceClienteVociDisponibile === true) riga.codice_cliente = testoCodiceClienteVoce(voce.codice_cliente) || null; // F16.34, sql/112
    righe.push(riga);
  });

  if (righe.length) {
    const { data: inserite, error } = await db
      .from('preventivi_voci')
      .insert(righe)
      .select('id, ordinamento');

    if (error) {
      toast('Errore inserimento voci: ' + error.message, 'err');
      return false;
    }

    // Le voci appena inserite prendono subito il loro id (anche nei punti
    // di "Annulla"): un nuovo salvataggio le aggiorna invece di inserirle
    // di nuovo.
    const idNuovi = {};
    (inserite || []).forEach(function(riga) {
      const voce = vociDaSalvare[riga.ordinamento];
      if (voce && !voce.id) {
        voce.id = riga.id;
        if (voce._chiave) idNuovi[voce._chiave] = riga.id;
      }
    });
    allineaStoricoUndoPreventivo(idNuovi, null);
  }

  const { error: erroreTotale } = await db
    .from('preventivi')
    .update(datiPreventivo)
    .eq('id', currentPreventivoId);

  if (erroreTotale) {
    toast('Voci salvate, ma totale non aggiornato: ' + erroreTotale.message, 'err');
    return false;
  }

  toast('Voci e totale preventivo salvati', 'ok');
  await renderCostiPreventivo();
  return true;
}

// Dopo un salvataggio (anche fermato a metà) i punti di "Annulla" devono
// sapere cosa c'è ormai nel database:
// - idNuovi {chiave: id}: voci appena inserite, prendono il loro id;
// - idEliminati: voci cancellate davvero; se l'utente annulla
//   l'eliminazione tornano come voci nuove (si reinseriscono).
function allineaStoricoUndoPreventivo(idNuovi, idEliminati) {
  storicoUndoPreventivo.forEach(function(stato) {
    stato.voci.forEach(function(voce) {
      if (idNuovi && !voce.id && voce._chiave && idNuovi[voce._chiave]) {
        voce.id = idNuovi[voce._chiave];
      }
      if (idEliminati && voce.id && idEliminati.includes(voce.id)) {
        voce._chiave = 'ripristinata-' + voce.id;
        voce.id = null;
      }
    });
    if (idEliminati) {
      stato.eliminate = stato.eliminate.filter(function(id) {
        return !idEliminati.includes(id);
      });
    }
  });
}

// datiEsterni (js/53, preventivo integrativo del rappresentante):
// { preventivo, voci } già pronti; il PDF si scarica e la funzione
// restituisce { blob, nomeFile } senza salvare (lo salva js/53).
async function generaPreventivoClientePDF(datiEsterni) {
  if (datiEsterni && datiEsterni.preventivo) {
    if (!(await preparaPDF())) return null;
  } else {
    datiEsterni = null;
    const salvato = await salvaVociPreventivo();

    if (!salvato) return;

    if (!(await preparaPDF())) return;
  }

  // sql/264: oggetto e nota solo se le colonne ci sono (senza: 400 evitato)
  const conOggettoNota = !datiEsterni && await verificaOggettoNotaPreventivoDisponibile();
  // sql/265: "Quantità x UM" solo se la colonna c'è (senza: 400 evitato)
  const conQuantitaUm = false; // 12/11: colonna "Q.tà x UM" tolta dal PDF
  // F16.34 (js/76, sql/112): codice dell'ente nelle voci (colonna "Cod.")
  const conCodiceEnte = !datiEsterni && typeof verificaCodiceClienteVociDisponibile === 'function'
    ? await verificaCodiceClienteVociDisponibile() : false;
  // sql/264 (computo): solo se le colonne ci sono (con i dati esterni li
  // porta dati_pdf_preventivo_cliente)
  const conComputo = !datiEsterni && await verificaComputoPreventivoDisponibile();
  const [
    preventivoRes,
    vociRes
  ] = datiEsterni ? [{ data: datiEsterni.preventivo }, { data: datiEsterni.voci || [] }] : await Promise.all([
    db
      .from('preventivi')
      .select(`
        id,
        numero,
        tipo,
        data_scadenza,
        iva_perc,
        totale_imponibile,
        sconto_perc,
        note,
        condizioni_pagamento,
        progetto_tecnico_id,
        ${conOggettoNota ? 'oggetto,nota_introduttiva,' : ''}
        ${conComputo ? 'computo_path,computo_nome,' : ''}
        clienti(
          ragione_sociale,
          indirizzo,
          citta
        )
      `)
      .eq('id', currentPreventivoId)
      .single(),

    db
      .from('preventivi_voci')
      .select('descrizione,unita_misura,quantita,' + (conQuantitaUm ? 'quantita_um,' : '') + (conCodiceEnte ? 'codice_cliente,' : '') + 'prezzo_unitario,ordinamento')
      .eq('preventivo_id', currentPreventivoId)
      .order('ordinamento')
      .order('creato_il')
  ]);

  if (preventivoRes.error || vociRes.error) {
    toast(
      'Errore caricamento preventivo: ' +
      (preventivoRes.error?.message || vociRes.error?.message),
      'err'
    );
    return;
  }

  const preventivo = preventivoRes.data;
  const voci = vociRes.data || [];

  if (!voci.length) {
    toast('Salva almeno una voce prima di generare il PDF', 'err');
    return;
  }

  // sql/264: computo dell'ingegnere (Excel = tabella, PDF = immagini delle pagine).
  // Se non si legge il PDF non si genera: senza il computo sarebbe diverso
  // da quello che Acquisti ha preparato.
  let computo = null;
  if (preventivo.computo_path) {
    try {
      computo = await leggiComputoPerPdfPreventivo(preventivo.computo_path);
    } catch (e) {
      toast('PDF non generato: computo «' + (preventivo.computo_nome || preventivo.computo_path.split('/').pop()) + '» non disponibile, ' + e.message, 'err');
      return datiEsterni ? null : undefined;
    }
    if (computo.tipo === 'excel') {
      if (!computo.righe.length) toast('Il computo Excel è vuoto: nel PDF non c\'è la tabella', 'err');
      else if (computo.colonne > COMPUTO_AVVISO_COLONNE) toast('Il computo ha ' + computo.colonne + ' colonne: nel PDF il testo è molto piccolo, controlla che si legga', 'err');
      if (computo.righeTotali > COMPUTO_MAX_RIGHE) toast('Il computo ha ' + computo.righeTotali + ' righe: nel PDF vanno le prime ' + COMPUTO_MAX_RIGHE, 'err');
    }
  }

  const totaleImponibile = voci.reduce(function(totale, voce) {
    return totale +
      numeroPreventivo(voce.quantita) *
      numeroPreventivo(voce.prezzo_unitario);
  }, 0);

  // sql/258: sconto del rappresentante. totaleImponibile resta la somma delle
  // voci (si salva così: il database rimette lo sconto); nel PDF il cliente
  // legge totale delle voci, sconto e imponibile scontato (mai la motivazione).
  let scontoPerc = numeroPreventivo(preventivo.sconto_perc);
  if (preventivo.sconto_perc === undefined && preventivo.id) {
    const { data: scontoSalvato } = await db.from('preventivi').select('sconto_perc').eq('id', preventivo.id).maybeSingle();
    scontoPerc = numeroPreventivo(scontoSalvato?.sconto_perc);
  }
  if (!(scontoPerc > 0 && scontoPerc < 100)) scontoPerc = 0;
  const imponibilePdf = scontoPerc > 0
    ? importoScontatoPreventivo(totaleImponibile, scontoPerc)
    : totaleImponibile;

  const ivaPerc = Number(preventivo.iva_perc ?? 22);
  const totaleIva = imponibilePdf * (ivaPerc / 100);
  const totaleDocumento = imponibilePdf + totaleIva;
  const cliente = preventivo.clienti || {};

  // F15.5 (sql/79): con le misure dichiarate dal cliente la frase fissa nel PDF
  let misureDichiarate = false;
  if (preventivo.progetto_tecnico_id) {
    const { data: progettoFonte, error: erroreFonte } = await db
      .from('progetti_tecnici')
      .select('fonte_rilievo')
      .eq('id', preventivo.progetto_tecnico_id)
      .maybeSingle();
    // senza sql/79 la colonna non c'è: nessuna frase, come prima
    misureDichiarate = !erroreFonte && !!progettoFonte && progettoFonte.fonte_rilievo === 'misure_dichiarate';
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const margine = 16;
  const larghezza = 210;
  let y = 18;

  doc.setFillColor(8, 80, 65);
  doc.rect(0, 0, larghezza, 34, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('TOLI FIRE', margine, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Preventivo commerciale', margine, 26);

  y = 46;

  doc.setTextColor(25, 25, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('PREVENTIVO N. ' + preventivo.numero, margine, y);

  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  doc.text(
    'Data: ' + new Date().toLocaleDateString('it-IT'),
    margine,
    y
  );

  y += 6;

  if (preventivo.data_scadenza) {
    doc.text(
      'Validità: ' +
      new Date(
        preventivo.data_scadenza + 'T00:00:00'
      ).toLocaleDateString('it-IT'),
      margine,
      y
    );

    y += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Cliente', margine, y);

  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.text(cliente.ragione_sociale || 'Cliente', margine, y);

  y += 6;

  const indirizzoCliente = [
    cliente.indirizzo,
    cliente.citta
  ].filter(Boolean).join(' · ');

  if (indirizzoCliente) {
    doc.text(indirizzoCliente, margine, y);
    y += 8;
  }

  // sql/264: "Oggetto: ..." in grassetto e la nota, prima della tabella dei
  // prezzi; solo se compilati (senza i due campi il PDF è come prima).
  // sql/264: computo tra "Oggetto:" e la nota, nel flusso del preventivo:
  // Excel = tabella, PDF = pagine disegnate e ritagliate (12/11).
  if (computo) {
    y = scriviOggettoNotaPdfPreventivo(doc, preventivo, margine, y, function(yy) {
      return computo.tipo === 'pdf'
        ? scriviComputoPdfImmaginiPreventivo(doc, computo, margine, yy)
        : scriviComputoExcelPdfPreventivo(doc, computo, margine, yy);
    });
  } else {
    y = scriviOggettoNotaPdfPreventivo(doc, preventivo, margine, y);
  }

  const colonnaCodiceEnte = (voci || []).some(function(v) { return v && String(v.codice_cliente || '').trim(); });

  doc.autoTable({
margin: {
  top: 18,
  right: margine,
  bottom: 82,
  left: margine
},

    startY: y + 4,
    // F16.34: colonna "Cod." (codice dell'ente) solo se una voce ce l'ha
    head: [(colonnaCodiceEnte ? ['Cod.'] : []).concat([
      'Descrizione',
      'Q.tà',
      'U.M.',
      'Prezzo unit.',
      'Totale'
    ])],
    
    
    body: voci.map(function(voce) {
      const quantita = numeroPreventivo(voce.quantita);
      const prezzo = numeroPreventivo(voce.prezzo_unitario);

      return (colonnaCodiceEnte ? [voce.codice_cliente || ''] : []).concat([
        voce.descrizione || '—',
        String(quantita),
        voce.unita_misura || 'pz',
        euroPreventivo(prezzo),
        euroPreventivo(quantita * prezzo)
      ]);
    }),
    theme: 'grid',
    headStyles: {
      fillColor: [8, 80, 65],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 8,
      cellPadding: 3
    },
    columnStyles: colonnaCodiceEnte ? {
      // F16.34: con "Cod." la descrizione si stringe (178 mm in tutto)
      0: { cellWidth: 22 },
      1: { cellWidth: 56 },
      2: { halign: 'right', cellWidth: 16 },
      3: { cellWidth: 16 },
      4: { halign: 'right', cellWidth: 34 },
      5: { halign: 'right', cellWidth: 34 }
    } : {
      // 178 mm utili (A4 meno 16 mm per lato), come prima con una colonna in più
      0: { cellWidth: 72 },
      1: { halign: 'right', cellWidth: 18 },
      2: { cellWidth: 18 },
      3: { halign: 'right', cellWidth: 34 },
      4: { halign: 'right', cellWidth: 34 }
    }
    
  });

  y = doc.lastAutoTable.finalY + 12;

  if (y > 210) {
    doc.addPage();
    y = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  if (scontoPerc > 0) {
    doc.setFont('helvetica', 'normal');
    doc.text('Totale voci: ' + euroPreventivo(totaleImponibile), 194, y, { align: 'right' });
    y += 7;
    doc.text(
      'Sconto ' + String(scontoPerc).replace('.', ',') + '%: - ' + euroPreventivo(totaleImponibile - imponibilePdf),
      194, y, { align: 'right' }
    );
    y += 7;
    doc.setFont('helvetica', 'bold');
  }
  doc.text(
    (scontoPerc > 0 ? 'Imponibile scontato: ' : 'Imponibile: ') + euroPreventivo(imponibilePdf),
    194,
    y,
    { align: 'right' }
  );

  y += 7;

  doc.text(
    'IVA ' + ivaPerc + '%: ' + euroPreventivo(totaleIva),
    194,
    y,
    { align: 'right' }
  );

  y += 8;

  doc.setFontSize(14);
  doc.text(
    'Totale preventivo: ' + euroPreventivo(totaleDocumento),
    194,
    y,
    { align: 'right' }
  );

  y += 14;

  function sezione(titolo, testo) {
    if (!testo) return;

    if (y > 210) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(8, 80, 65);
    doc.text(titolo, margine, y);

    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);

    const righe = doc.splitTextToSize(testo, 178);

    if (y + righe.length * 5 > 215) {
      doc.addPage();
      y = 20;
    }

    doc.text(righe, margine, y);
    y += righe.length * 5 + 10;
  }

  if (misureDichiarate) {
    sezione(
      'Misure',
      'Misure fornite dal committente, da verificare prima dell’ordine.'
    );
  }

  sezione(
    'Modalità di pagamento',
    preventivo.condizioni_pagamento
  );

  sezione(
    'Note',
    preventivo.note
  );

const condizioniGenerali = String.raw`
1. OGGETTO E LIMITI DELLA PRESTAZIONE

Il presente preventivo comprende esclusivamente le forniture, le prestazioni, le lavorazioni, le quantità e le attività espressamente indicate nel documento e negli eventuali allegati richiamati. Qualsiasi attività, materiale, accessorio, lavorazione, collegamento, verifica, prova, certificazione, dichiarazione, relazione tecnica o adempimento non espressamente riportato si intende escluso dal prezzo e, ove richiesto o necessario, sarà oggetto di separata quotazione.

Le descrizioni sintetiche delle lavorazioni devono essere interpretate in relazione all’effettivo oggetto del preventivo e non comportano l’assunzione di obblighi ulteriori rispetto a quelli espressamente concordati e previsti dalla normativa applicabile.

2. ESCLUSIONI E LAVORAZIONI AGGIUNTIVE

Salvo espressa indicazione contraria, sono esclusi dal presente preventivo:

* opere murarie, demolizioni, ripristini edili, tinteggiature e finiture;
* opere elettriche, cablaggi, alimentazioni, collegamenti a quadri o centrali e predisposizioni impiantistiche non espressamente descritti;
* ponteggi, piattaforme aeree, mezzi di sollevamento, opere provvisionali e sistemi di accesso in quota;
* smontaggio, rimontaggio, spostamento o modifica di impianti, strutture, arredi e componenti esistenti;
* bonifica, rimozione o smaltimento di materiali pericolosi;
* progettazioni, calcoli, pratiche amministrative, autorizzazioni, asseverazioni, certificazioni e prestazioni professionali non espressamente indicate;
* interventi su impianti, componenti o opere eseguiti da terzi;
* qualsiasi ulteriore prestazione non espressamente inclusa.

Qualora, durante l’esecuzione, emergano lavorazioni ulteriori necessarie per completare l’intervento richiesto, ripristinare condizioni non conformi o affrontare circostanze non ragionevolmente rilevabili in fase di sopralluogo, Toli Fire ne darà comunicazione al cliente e formulerà, ove necessario, un’offerta integrativa. Le attività aggiuntive saranno eseguite previa approvazione del cliente, salvo gli interventi urgenti consentiti dalla legge o necessari per evitare un pericolo immediato, nei limiti delle autorizzazioni ricevute e della normativa applicabile.

3. SOPRALLUOGHI E CONDIZIONI ESISTENTI

Il preventivo è formulato sulla base delle informazioni ricevute, della documentazione disponibile e delle condizioni dei luoghi ragionevolmente verificabili al momento del sopralluogo, ove effettuato.

Eventuali difformità, impedimenti, vizi occulti, condizioni non accessibili, difetti strutturali, incompatibilità tecniche, carenze documentali o anomalie non rilevabili mediante le verifiche ordinarie potranno comportare la revisione delle modalità operative, dei tempi e dei corrispettivi.

Il sopralluogo non costituisce, di per sé, un’indagine distruttiva, una verifica integrale di tutte le opere esistenti o una certificazione generale di conformità dell’immobile e degli impianti.

4. MATERIALI, MODELLI, MARCHE E FINITURE

I prodotti saranno forniti secondo le caratteristiche tecniche, le quantità e le eventuali marche, i modelli e le finiture espressamente indicati nel preventivo.

In assenza di specifiche contrattuali, Toli Fire potrà proporre prodotti e soluzioni tecnicamente idonei all’impiego previsto, conformi ai requisiti normativi applicabili e compatibili con le condizioni rilevate, senza che sia automaticamente inclusa la fornitura di prodotti di fascia premium, finiture speciali, personalizzazioni estetiche o marchi specifici.

Eventuali sostituzioni di prodotto saranno effettuate nel rispetto della normativa applicabile e, quando incidano su caratteristiche essenziali concordate, previa approvazione del cliente.

Le richieste di variazione di marca, modello, colore, finitura, prestazione, accessorio o modalità di posa formulate dopo l’accettazione del preventivo potranno comportare una variazione del prezzo e dei tempi di consegna o di esecuzione.

5. PREZZI E PRESTAZIONI NON INCLUSE

I corrispettivi indicati si riferiscono esclusivamente alle prestazioni descritte nel preventivo. IVA e altri oneri saranno applicati secondo il regime fiscale e la normativa vigente.

Eventuali quantità aggiuntive, materiali supplementari, trasferte ulteriori, interventi fuori orario, accessi ripetuti non imputabili a Toli Fire, attese in cantiere, urgenze e lavorazioni non previste saranno valorizzati separatamente, ove dovuti, secondo accordi integrativi o listini preventivamente comunicati e accettati.

Nessuna prestazione ulteriore sarà addebitata unilateralmente al cliente al di fuori dei casi consentiti dalla legge o preventivamente concordati.

6. VALIDITÀ DEL PREVENTIVO

Il preventivo è valido fino alla data espressamente indicata. In mancanza di una data, la validità è di 30 giorni dalla data di emissione.

Decorso tale termine, prezzi, disponibilità dei materiali, condizioni di fornitura e tempi di esecuzione potranno essere riconfermati o aggiornati prima dell’accettazione.

Eventuali aumenti dei costi o variazioni sopravvenute dopo la conclusione del contratto saranno gestiti nei limiti consentiti dalla legge e dagli accordi applicabili.

7. ACCETTAZIONE E AVVIO DELLE ATTIVITÀ

L’accettazione del preventivo comporta l’approvazione dell’oggetto, dei prezzi, delle quantità, delle esclusioni e delle condizioni espressamente richiamate.

L’avvio delle attività è subordinato, ove applicabile, alla ricezione dell’accettazione, al pagamento dell’acconto concordato, alla disponibilità dei materiali, alla consegna della documentazione necessaria e alla predisposizione dei luoghi di lavoro.

Eventuali ordini, richieste o istruzioni impartiti da soggetti diversi dal referente autorizzato del cliente dovranno essere verificati prima di eseguire modifiche contrattuali o attività aggiuntive.

8. OBBLIGHI DEL CLIENTE E ACCESSIBILITÀ DEI LUOGHI

Il cliente si impegna a garantire, per le date concordate:

* accesso ai locali e alle aree interessate;
* disponibilità delle aree di lavoro e rimozione degli ostacoli;
* presenza di un referente autorizzato;
* disponibilità di alimentazioni, predisposizioni e servizi espressamente previsti a suo carico;
* comunicazione preventiva di rischi, interferenze, vincoli di accesso e procedure di sicurezza;
* consegna della documentazione tecnica e delle informazioni necessarie;
* ottenimento delle autorizzazioni e dei permessi posti a suo carico;
* coordinamento con le altre imprese e con il responsabile del sito, ove necessario.

Il cliente dovrà inoltre comunicare eventuali limitazioni operative, orari consentiti, procedure di ingresso, obblighi di registrazione, permessi di lavoro e prescrizioni particolari.

L’indisponibilità dei luoghi o la mancata predisposizione delle condizioni necessarie potrà comportare la riprogrammazione dell’intervento e l’addebito dei costi aggiuntivi documentabili e contrattualmente dovuti.

9. SICUREZZA, INTERFERENZE E SOSPENSIONE OPERATIVA

Toli Fire eseguirà le attività nel rispetto degli obblighi di sicurezza applicabili alla propria prestazione.

Qualora vengano rilevate condizioni di pericolo, interferenze non gestite, accessi non sicuri, assenza delle misure necessarie o situazioni incompatibili con l’esecuzione a regola d’arte, Toli Fire potrà sospendere le lavorazioni interessate nella misura necessaria a tutelare le persone e i beni, informando il cliente e coordinando la ripresa quando le condizioni risultino adeguate.

I ritardi e gli eventuali costi conseguenti saranno valutati in base alle cause, alle responsabilità effettive e agli accordi applicabili. Restano fermi gli obblighi inderogabili in materia di sicurezza e le responsabilità previste dalla legge.

10. TEMPI DI CONSEGNA ED ESECUZIONE

Le date e i tempi indicati sono riferiti alle condizioni operative e alle disponibilità conosciute al momento dell’offerta. Salvo espressa pattuizione scritta, non costituiscono termini essenziali né garanzie di completamento entro una data inderogabile.

I tempi potranno essere adeguati in presenza di ritardi di fornitori, indisponibilità dei prodotti, condizioni meteorologiche incompatibili con le lavorazioni, impedimenti di accesso, varianti richieste dal cliente, interferenze di terzi, sospensioni legittime o altri eventi non imputabili a Toli Fire.

Toli Fire comunicherà, per quanto ragionevolmente possibile, gli impedimenti rilevanti e la nuova previsione di esecuzione.

La presente clausola non esclude i rimedi spettanti al cliente nei casi previsti dalla legge.

11. VARIANTI E MODIFICHE IN CORSO D’OPERA

Qualsiasi modifica alle lavorazioni, alle quantità, ai prodotti, alle modalità di posa, alle caratteristiche estetiche o funzionali e alle tempistiche dovrà essere concordata tra le parti.

Le varianti potranno comportare adeguamenti del corrispettivo, dei tempi e delle modalità di esecuzione. Toli Fire sottoporrà al cliente una conferma scritta della modifica e dei relativi effetti economici, ove applicabile.

Le istruzioni verbali non comportano automaticamente l’inclusione di nuove prestazioni nel prezzo originario. Le richieste urgenti dovranno essere confermate per iscritto, fatti salvi gli interventi consentiti dalla legge.

12. RICHIESTE ESTETICHE E PREFERENZE DEL CLIENTE

Salvo specifica indicazione nel preventivo, la prestazione è finalizzata al risultato tecnico e funzionale concordato e non comprende lavorazioni aggiuntive volte a ottenere particolari risultati estetici, mimetizzazioni, allineamenti speciali, finiture personalizzate o uniformità con elementi preesistenti.

Le preferenze estetiche dovranno essere comunicate prima dell’accettazione e, se rilevanti per il prezzo o per la scelta dei materiali, dovranno risultare da una specifica descrizione scritta.

Eventuali richieste formulate dopo l’ordine o durante l’esecuzione saranno valutate come possibili varianti, con eventuali costi e tempi aggiuntivi. Resta fermo l’obbligo di rispettare le caratteristiche espressamente concordate e i requisiti normativi applicabili.

13. IMPIANTI E COMPONENTI PREESISTENTI

In caso di intervento su impianti, dispositivi o componenti preesistenti, Toli Fire risponde delle attività effettivamente affidate ed eseguite, nei limiti del contratto e della normativa applicabile.

Non si intendono inclusi la revisione generale, l’adeguamento integrale, la ricostruzione documentale o la certificazione complessiva dell’impianto, salvo espressa indicazione.

Difetti preesistenti, manomissioni, incompatibilità, componenti deteriorati, assenza di documentazione o interventi di terzi che incidano sul risultato saranno segnalati, ove rilevati. Gli eventuali interventi correttivi ulteriori saranno oggetto di valutazione e, quando necessario, di separata offerta.

La presente clausola non esonera Toli Fire dalle responsabilità relative alle proprie lavorazioni né dagli obblighi di segnalazione previsti dalla legge.

14. PROVE, COLLAUDI E VERIFICHE

Le prove funzionali, i controlli e le verifiche inclusi sono esclusivamente quelli espressamente indicati nel preventivo e quelli obbligatori per legge in relazione alla prestazione affidata.

Prove straordinarie, collaudi specialistici, verifiche di terze parti, prove distruttive, verifiche integrali dell’immobile, pratiche presso enti e ulteriori attività non comprese saranno quotati separatamente, quando richiesti o necessari.

L’esito delle prove sarà riferito alle condizioni riscontrate al momento dell’esecuzione e non costituisce garanzia di assenza di guasti futuri o di corretto funzionamento di componenti estranei all’intervento.

15. DOCUMENTAZIONE TECNICA E CERTIFICAZIONI

Toli Fire consegnerà la documentazione prevista dalla normativa applicabile e quella espressamente compresa nell’incarico, purché sussistano i presupposti tecnici e documentali per il suo rilascio.

Non sono incluse, salvo indicazione espressa, relazioni di professionisti esterni, progetti, asseverazioni, certificazioni di prodotti o opere di terzi, documenti non spettanti a Toli Fire o documentazione relativa a lavori precedenti non eseguiti dalla società.

Il rilascio di dichiarazioni, verbali e certificazioni è subordinato alla verifica dei requisiti applicabili e alla disponibilità delle informazioni necessarie. Nessun documento sarà emesso in assenza dei presupposti previsti dalla legge.

16. MANUTENZIONE DEI PRESIDI ANTINCENDIO

Gli interventi di manutenzione sono limitati ai dispositivi, alle quantità, alle attività e alle periodicità espressamente indicati nell’offerta o nel contratto.

Non si intendono compresi, salvo esplicita previsione, sostituzioni integrali, ricambi straordinari, riparazioni per danneggiamenti, adeguamenti normativi, interventi su dispositivi non censiti, manutenzioni di impianti di terzi o attività rese necessarie da uso improprio, manomissione, incuria o eventi accidentali.

Le anomalie riscontrate saranno segnalate al cliente e, ove necessario, sarà proposta la relativa attività correttiva.

Le attività manutentive non sostituiscono gli obblighi di gestione della sicurezza antincendio del cliente, né le verifiche, le attività e gli adempimenti che restano a carico dei soggetti individuati dalla normativa applicabile.

17. SOSTITUZIONI, RIPARAZIONI E MATERIALI DI CONSUMO

Ricambi, componenti, batterie, guarnizioni, accessori, ricariche, sostituzioni di dispositivi e materiali di consumo sono inclusi esclusivamente quando indicati nel preventivo o nel contratto di manutenzione.

Quando durante l’intervento emerga la necessità di sostituire un componente non incluso, Toli Fire ne comunicherà la necessità e il relativo costo prima dell’esecuzione, salvo le eccezioni legittimamente applicabili.

La sostituzione di un singolo componente non implica l’adeguamento o la sostituzione di tutte le parti correlate, se non espressamente concordati o imposti dalla normativa applicabile.

18. CORRISPETTIVI E MODALITÀ DI PAGAMENTO

Il cliente si impegna a effettuare i pagamenti secondo le scadenze e le modalità riportate nel preventivo o nella conferma d’ordine.

In caso di mancato o ritardato pagamento si applicheranno, ove ne ricorrano i presupposti, gli interessi moratori e gli ulteriori rimedi previsti dalla normativa applicabile, compresa quella sui ritardi di pagamento nelle transazioni commerciali.

Eventuali contestazioni dovranno essere comunicate tempestivamente e in modo circostanziato. Le contestazioni non giustificate non autorizzano automaticamente la sospensione del pagamento di somme dovute e non contestate, nei limiti consentiti dalla legge.

19. SOSPENSIONE PER INADEMPIMENTO

In caso di mancato pagamento, mancata collaborazione essenziale o grave inadempimento del cliente, Toli Fire potrà avvalersi dei rimedi previsti dalla legge e dal contratto, compresa, quando ne ricorrano i presupposti, la sospensione delle prestazioni future previa comunicazione scritta.

La sospensione sarà gestita tenendo conto degli obblighi di sicurezza, delle prestazioni già eseguite, dei materiali ordinati e delle disposizioni inderogabili applicabili.

La ripresa delle attività potrà richiedere la regolarizzazione delle somme scadute e la riprogrammazione degli interventi. Eventuali costi aggiuntivi dovranno essere giustificati e dovuti secondo gli accordi e la normativa applicabile.

20. IMPOSSIBILITÀ DI ESECUZIONE E ACCESSI A VUOTO

Qualora l’intervento non possa essere eseguito per cause imputabili al cliente, quali indisponibilità dei locali, assenza del referente, mancata autorizzazione all’accesso, aree non predisposte o mancata comunicazione di vincoli rilevanti, le parti concorderanno una nuova data.

Gli eventuali costi documentabili di trasferta, personale, mezzi, attese o riprogrammazione potranno essere addebitati quando previsti dal contratto, comunicati preventivamente o comunque dovuti in base alla legge.

La riprogrammazione non comporta l’automatica rinuncia di Toli Fire ai diritti derivanti dall’inadempimento del cliente.

21. SOSPENSIONE RICHIESTA DAL CLIENTE

La richiesta di sospensione o rinvio dei lavori dovrà essere comunicata per iscritto.

Le parti concorderanno gli effetti sulla programmazione, sulla disponibilità dei materiali, sulle consegne e sui costi già sostenuti o non recuperabili. Eventuali costi di smobilitazione, custodia, trasporto, riavvio o nuova programmazione saranno addebitabili nei limiti in cui siano documentati, contrattualmente previsti o altrimenti dovuti.

La sospensione non annulla automaticamente gli obblighi di pagamento relativi alle prestazioni già eseguite o ai materiali già forniti.

22. CONSEGNA E VERIFICA DELLE PRESTAZIONI

Al termine delle attività, il cliente è invitato a verificare le prestazioni eseguite e a segnalare per iscritto eventuali difformità specifiche, indicando le lavorazioni interessate.

La firma di verbali di intervento, rapportini o documenti di consegna attesta quanto effettivamente riportato nel documento sottoscritto e non comporta la rinuncia ai diritti inderogabili del cliente né esclude la responsabilità per vizi non immediatamente riconoscibili.

Eventuali osservazioni saranno esaminate da Toli Fire e gestite secondo il contratto e la normativa applicabile.

23. GARANZIA E DIFETTI DELLE PRESTAZIONI

Restano applicabili le garanzie e le responsabilità previste dalla legge in relazione alla natura del contratto, alla qualità di professionista o consumatore delle parti e alla tipologia di fornitura o lavorazione.

Le segnalazioni relative a difetti dovranno essere comunicate nei termini e con le modalità previsti dalla normativa applicabile.

Sono estranei alla garanzia per le prestazioni eseguite da Toli Fire i guasti effettivamente riconducibili a uso improprio, manomissioni, mancata manutenzione, interventi non autorizzati, danneggiamenti accidentali o cause esterne, nella misura in cui tali circostanze abbiano causato il difetto contestato.

Le garanzie eventualmente riconosciute dai produttori saranno applicate secondo le relative condizioni, senza pregiudizio per i diritti inderogabili spettanti al cliente nei confronti di Toli Fire.

24. RESPONSABILITÀ E LIMITI DELL’INCARICO

Ciascuna parte risponde degli obblighi di propria competenza e delle conseguenze dei propri inadempimenti secondo la legge.

Toli Fire non assume responsabilità per difetti preesistenti, attività svolte da terzi, manomissioni o modifiche estranee al proprio incarico, salvo che tali eventi siano causalmente riconducibili a condotte imputabili a Toli Fire.

Nessuna disposizione del presente preventivo esclude o limita responsabilità che non possano essere escluse o limitate per legge, né gli obblighi inderogabili relativi alla sicurezza, alla conformità delle prestazioni o alla tutela dei diritti del cliente.

25. OBBLIGHI DEL CLIENTE IN MATERIA DI SICUREZZA ANTINCENDIO

Il cliente resta responsabile degli obblighi che la normativa attribuisce al proprietario, al datore di lavoro, al gestore dell’attività o agli altri soggetti competenti, inclusi quelli relativi alla gestione della sicurezza antincendio, alla formazione, alle procedure di emergenza, alla tenuta della documentazione e alla disponibilità dei presidi.

Toli Fire svolge le attività affidate nei limiti dell’incarico accettato. L’acquisto, l’installazione o la manutenzione di singoli dispositivi non costituisce automaticamente attestazione di conformità complessiva dell’immobile, dell’attività o di tutti gli impianti presenti.

Eventuali ulteriori carenze rilevate durante l’intervento saranno comunicate al cliente, ove ragionevolmente identificabili nell’ambito della prestazione.

26. FORNITORI, DISPONIBILITÀ E APPROVVIGIONAMENTO

Le forniture sono soggette alla disponibilità dei prodotti e ai tempi di approvvigionamento comunicati dai produttori e distributori.

In caso di indisponibilità o ritardo, Toli Fire informerà il cliente e potrà proporre una nuova tempistica o, ove tecnicamente e contrattualmente ammissibile, una soluzione alternativa da sottoporre ad approvazione.

Non saranno effettuate sostituzioni che alterino caratteristiche essenziali concordate senza il consenso richiesto. Eventuali ritardi saranno gestiti secondo le disposizioni contrattuali e normative applicabili.

27. FORZA MAGGIORE E IMPEDIMENTI ESTERNI

In presenza di eventi straordinari non ragionevolmente controllabili dalla parte interessata, che impediscano o ritardino l’esecuzione, le parti coopereranno per individuare soluzioni ragionevoli, aggiornare la programmazione e limitare gli effetti dell’impedimento.

La parte interessata comunicherà l’evento e i suoi effetti non appena ragionevolmente possibile. Restano applicabili le regole di legge in materia di impossibilità della prestazione, ritardo, responsabilità e risoluzione del contratto.

28. COMUNICAZIONI E REFERENTI AUTORIZZATI

Le comunicazioni relative a varianti, approvazioni, sospensioni, contestazioni, prezzi aggiuntivi e modifiche dei tempi dovranno essere effettuate mediante i recapiti aziendali indicati nel preventivo o mediante altri canali scritti concordati.

Il cliente è tenuto a indicare i soggetti autorizzati a impartire istruzioni e approvare modifiche. Toli Fire potrà chiedere conferma al referente contrattuale quando riceva indicazioni da soggetti la cui autorità non risulti chiara.

29. TRATTAMENTO DEI DATI PERSONALI

I dati personali eventualmente raccolti saranno trattati per finalità connesse alla gestione del rapporto contrattuale, agli obblighi di legge e alle ulteriori finalità legittime indicate nell’informativa privacy di Toli Fire, nel rispetto della normativa applicabile.

30. DISPOSIZIONI FINALI

Le presenti condizioni si applicano nella misura in cui siano state rese disponibili al cliente prima della conclusione del contratto e siano state validamente accettate o incorporate nel rapporto contrattuale.

Eventuali deroghe o accordi particolari dovranno risultare da comunicazione scritta approvata dalle parti. In caso di contrasto, prevarranno le condizioni specifiche espressamente concordate, nei limiti consentiti dalla legge.

L’eventuale invalidità o inefficacia di una singola disposizione non comporterà automaticamente l’invalidità delle restanti disposizioni, purché queste possano conservare efficacia autonomamente.

Per quanto non espressamente disciplinato, si applicano le disposizioni della legge italiana.

31. APPROVAZIONE DEL PREVENTIVO

Il cliente dichiara di aver ricevuto e letto il preventivo, di averne compreso l’oggetto, le quantità, i prezzi, le esclusioni e le condizioni applicabili e di accettare le prestazioni espressamente indicate.
`;

function aggiungiCondizioniGeneraliPreventivo(testo) {
  const margineCondizioni = 15;
  const larghezzaTesto = larghezza - (margineCondizioni * 2);
  const fondoPagina = 215;

  let yCondizioni = 20;
  let paginaCondizioni = 0;

  function footerCondizioni() {
   // Il footer unico con articoli viene disegnato alla fine su tutte le pagine.
  }

 function nuovaPaginaCondizioni() {
  if (paginaCondizioni > 0) {
    footerCondizioni();
  }

  doc.addPage();
  paginaCondizioni++;

  if (paginaCondizioni === 1) {
    yCondizioni = 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(8, 80, 65);

    doc.text(
      'CONDIZIONI GENERALI DI FORNITURA, INSTALLAZIONE,',
      margineCondizioni,
      yCondizioni
    );

    yCondizioni += 5;

    doc.text(
      'MANUTENZIONE E LAVORI ANTINCENDIO',
      margineCondizioni,
      yCondizioni
    );

    yCondizioni += 9;
  } else {
    yCondizioni = 20;
  }
}

  function scriviBlocco(testoBlocco, titolo) {
    const righe = doc.splitTextToSize(testoBlocco, larghezzaTesto);
    const altezza = righe.length * (titolo ? 4.6 : 4.1) + 4;

    if (yCondizioni + altezza > fondoPagina) {
      nuovaPaginaCondizioni();
    }

    doc.setFont(
      'helvetica',
      titolo ? 'bold' : 'normal'
    );

    doc.setFontSize(titolo ? 9 : 8);
    doc.setTextColor(titolo ? 8 : 45, titolo ? 80 : 45, titolo ? 65 : 45);

    doc.text(righe, margineCondizioni, yCondizioni);
    yCondizioni += altezza;
  }

  nuovaPaginaCondizioni();

  testo.trim().split(/\n\s*\n/).forEach(function(blocco) {
    const righeOriginali = blocco
      .split('\n')
      .map(function(riga) {
        return riga.trim();
      })
      .filter(Boolean);

    if (!righeOriginali.length) return;

    const titolo = /^\d+\.\s+[A-ZÀ-Ú]/.test(righeOriginali[0]);

    if (righeOriginali.every(function(riga) {
      return riga.startsWith('* ');
    })) {
      righeOriginali.forEach(function(riga) {
        scriviBlocco('• ' + riga.slice(2), false);
      });
      return;
    }

    scriviBlocco(
      righeOriginali.join(' '),
      titolo
    );
  });

  footerCondizioni();
}

aggiungiCondizioniGeneraliPreventivo(condizioniGenerali);



  const clausoleSpecifiche = [
  'APPROVAZIONE SPECIFICA DELLE CLAUSOLE',
  'Ai sensi e per gli effetti degli articoli 1341 e 1342 del Codice civile, ove applicabili, il cliente dichiara di approvare specificamente le seguenti disposizioni delle Condizioni Generali:',
  '',
  '• Art. 2 — Esclusioni e lavorazioni aggiuntive.',
  '• Art. 3 — Sopralluoghi e condizioni esistenti.',
  '• Art. 4 — Materiali, modelli, marche e finiture.',
  '• Art. 6 — Validità del preventivo.',
  '• Art. 8 — Obblighi del cliente e accessibilità dei luoghi.',
  '• Art. 9 — Sicurezza, interferenze e sospensione operativa.',
  '• Art. 10 — Tempi di consegna ed esecuzione.',
  '• Art. 11 — Varianti e modifiche in corso d’opera.',
  '• Art. 18 — Corrispettivi e modalità di pagamento.',
  '• Art. 19 — Sospensione per inadempimento.',
  '• Art. 20 — Impossibilità di esecuzione e accessi a vuoto.',
  '• Art. 21 — Sospensione richiesta dal cliente.',
  '• Art. 22 — Consegna e verifica delle prestazioni.',
  '• Art. 23 — Garanzia e difetti delle prestazioni.',
  '• Art. 24 — Responsabilità e limiti dell’incarico.',
  '• Art. 26 — Fornitori, disponibilità e approvvigionamento.',
  '• Art. 27 — Forza maggiore e impedimenti esterni.'
].join('\n');

function disegnaFooterClausoleSuTutteLePagine() {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  doc.setTextColor(90, 90, 90);
  doc.setLineHeightFactor(1.05);

  const righeOriginali = clausoleSpecifiche
  .split('\n')
  .map(function(riga) {
    return riga.trim();
  })
  .filter(Boolean);

const titoloFooter = righeOriginali.shift();

const testoFooterCompatto = righeOriginali.join(' ');

const righeFooter = [
  titoloFooter,
  ...doc.splitTextToSize(
    testoFooterCompatto,
    larghezza - (margine * 2)
  )
];
  const altezzaRiga =
    (6.4 / doc.internal.scaleFactor) * 1.05;

  const yFooter =
    282 - ((righeFooter.length - 1) * altezzaRiga);

  const totalePagine = doc.getNumberOfPages();

  for (let pagina = 1; pagina <= totalePagine; pagina++) {
    doc.setPage(pagina);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(90, 90, 90);
    doc.setLineHeightFactor(1.05);

 doc.text(
  righeFooter,
  larghezza / 2,
  yFooter,
  { align: 'center' }
);

    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);

    doc.text(
      'Documento generato il ' +
      new Date().toLocaleString('it-IT') +
      ' — Toli Fire',
      larghezza / 2,
      290,
      { align: 'center' }
    );
  }
}

disegnaFooterClausoleSuTutteLePagine();

 const nomeFile = `Preventivo_${preventivo.numero}_Toli_Fire_${Date.now()}.pdf`;

  const pdfBlob = doc.output('blob');
  const scaricaPdf = function() { doc.save(nomeFile); };

  if (datiEsterni) {
    scaricaPdf();
    return { blob: pdfBlob, nomeFile: nomeFile };
  }

  const storagePath =
    currentPreventivoId +
    '/cliente/' +
    nomeFile;

  const { error: erroreUpload } = await db.storage
    .from('preventivi-documenti')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (erroreUpload) {
    toast(
      'PDF creato ma non salvato: ' + erroreUpload.message,
      'err'
    );
    return;
  }

  const datiPdf = {
    totale_imponibile: await totaleDaScrivereConSconto(totaleImponibile, scontoPerc),
    preventivo_cliente_pdf_path: storagePath,
    preventivo_cliente_pdf_nome: nomeFile,
    preventivo_cliente_pdf_generato_il: new Date().toISOString()
  };

  // F4.3: dopo l'esito il totale non si riscrive (lo cambia solo il titolare).
  if (vociPreventivoBloccate) delete datiPdf.totale_imponibile;

  const { error: erroreAggiornamento } = await db
    .from('preventivi')
    .update(datiPdf)
    .eq('id', currentPreventivoId);

  if (erroreAggiornamento) {
    toast(
      'PDF salvato, ma errore aggiornamento preventivo: ' +
      erroreAggiornamento.message,
      'err'
    );
    return;
  }

  scaricaPdf();

  toast('PDF cliente generato e salvato', 'ok');
}

async function caricaEInviaPdfEsternoTitolare() {
  if (ROLE !== 'titolare') {
    toast('Solo il titolare può caricare questo PDF', 'err');
    return;
  }

  var input = ge('pvd-pdf-esterno-titolare');
  var file = input?.files?.[0];

  if (!file) {
    toast('Seleziona prima un PDF dal computer', 'err');
    return;
  }

  var ePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (!ePdf) {
    toast('Puoi caricare solo file PDF', 'err');
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    toast('Il PDF supera il limite di 15 MB', 'err');
    return;
  }

  const { data: preventivo, error: errorePreventivo } = await db
    .from('preventivi')
    .select('id,numero,cliente_id,stato')
    .eq('id', currentPreventivoId)
    .single();

  if (errorePreventivo || !preventivo) {
    toast('Preventivo non trovato', 'err');
    return;
  }

  // F4.1: un preventivo con l'esito del cliente già registrato non si rimanda.
  if (STATI_ESITO_PREVENTIVO.includes(preventivo.stato)) {
    toast('Il cliente ha già dato l\'esito di questo preventivo: non si può rimandare', 'err');
    return;
  }

  const { data: cliente, error: erroreCliente } = await db
    .from('clienti')
    .select('rappresentante_id')
    .eq('id', preventivo.cliente_id)
    .single();

  if (erroreCliente || !cliente?.rappresentante_id) {
    toast('Il cliente non ha un rappresentante assegnato', 'err');
    return;
  }

  if (!confirm(
    'Caricare e inviare questo PDF al rappresentante? Vedrà solo il file selezionato.'
  )) {
    return;
  }

  var nomeSicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  var percorso = currentPreventivoId +
    '/titolare/' +
    Date.now() +
    '_' +
    nomeSicuro;

  const { error: erroreUpload } = await db.storage
    .from('preventivi-documenti')
    .upload(percorso, file, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (erroreUpload) {
    toast('Errore caricamento PDF: ' + erroreUpload.message, 'err');
    return;
  }

  const ora = new Date().toISOString();

  const { error: erroreSalvataggio } = await db
    .from('preventivi')
    .update({
      pdf_esterno_titolare_path: percorso,
      pdf_esterno_titolare_nome: file.name,
      pdf_esterno_titolare_caricato_il: ora,
      stato: 'inviato_a_rappresentante',
      inviato_a_rappresentante_il: ora,
      inviato_a_rappresentante_da: ME.id,
      letto_rappresentante_il: null,
      aggiornato_il: ora
    })
    .eq('id', currentPreventivoId);

  if (erroreSalvataggio) {
    await db.storage.from('preventivi-documenti').remove([percorso]);
    toast('PDF caricato ma non collegato: ' + erroreSalvataggio.message, 'err');
    return;
  }

  toast('PDF esterno inviato al rappresentante', 'ok');
  await openPreventivoDetail(currentPreventivoId);
}


async function ritiraPdfEsternoTitolare() {
  if (ROLE !== 'titolare') {
    toast('Solo il titolare può ritirare questo PDF', 'err');
    return;
  }

  const { data: preventivo, error: errorePreventivo } = await db
    .from('preventivi')
    .select('id, numero, pdf_esterno_titolare_path')
    .eq('id', currentPreventivoId)
    .single();

  if (errorePreventivo || !preventivo) {
    toast('Preventivo non trovato', 'err');
    return;
  }

  if (!preventivo.pdf_esterno_titolare_path) {
    toast('Non è presente un PDF esterno da ritirare', 'err');
    return;
  }

  if (!confirm(
    'Ritirare il PDF dal rappresentante e cancellarlo? Il preventivo resterà salvato.'
  )) {
    return;
  }

  const percorso = preventivo.pdf_esterno_titolare_path;

  const { error: erroreAggiornamento } = await db
    .from('preventivi')
    .update({
      pdf_esterno_titolare_path: null,
      pdf_esterno_titolare_nome: null,
      pdf_esterno_titolare_caricato_il: null,
      stato: 'bozza',
      inviato_a_rappresentante_il: null,
      inviato_a_rappresentante_da: null,
      letto_rappresentante_il: null,
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', currentPreventivoId);

  if (erroreAggiornamento) {
    toast('Errore nel ritiro del PDF: ' + erroreAggiornamento.message, 'err');
    return;
  }

  const { error: erroreFile } = await db.storage
    .from('preventivi-documenti')
    .remove([percorso]);

  if (erroreFile) {
    toast('PDF ritirato dal rappresentante, ma non eliminato dallo storage: ' + erroreFile.message, 'err');
  } else {
    toast('PDF ritirato e cancellato correttamente', 'ok');
  }

  await openPreventivoDetail(currentPreventivoId);
}

async function inviaPdfClienteATitolareERappresentante() {
  ricordaPosizionePagina();

  if (!['commerciale', 'titolare'].includes(ROLE)) {
  toast('Solo Acquisti o il titolare possono inviare il preventivo', 'err');
  return;
}

const { data: preventivo, error: errorePreventivo } = await db
  .from('preventivi')
  .select(`
  id,
  numero,
  cliente_id,
  stato,
  preventivo_cliente_pdf_path
`)
  .eq('id', currentPreventivoId)
  .single();

  if (errorePreventivo || !preventivo) {
    toast(
      'Errore caricamento preventivo: ' +
      (errorePreventivo?.message || 'preventivo non trovato'),
      'err'
    );
    return;
  }

  // F4.1: un preventivo con l'esito del cliente già registrato non si rimanda.
  if (STATI_ESITO_PREVENTIVO.includes(preventivo.stato)) {
    toast('Il cliente ha già dato l\'esito di questo preventivo: non si può rimandare', 'err');
    return;
  }

if (!preventivo.preventivo_cliente_pdf_path) {
  toast('Genera prima il PDF cliente e attendi la conferma di salvataggio', 'err');
  return;
}

if (!preventivo.cliente_id) {
  toast('Questo preventivo non è collegato a un cliente', 'err');
  return;
}

const { data: cliente, error: erroreCliente } = await db
  .from('clienti')
  .select('rappresentante_id')
  .eq('id', preventivo.cliente_id)
  .single();

if (erroreCliente) {
  toast('Errore caricamento cliente: ' + erroreCliente.message, 'err');
  return;
}

const rappresentanteId = cliente?.rappresentante_id || null;

if (!rappresentanteId) {
  toast(
    'Il cliente non ha un rappresentante assegnato. Assegnalo prima dalla sua scheda.',
    'err'
  );
  return;
}


  if (!confirm(
    'Inviare il PDF del preventivo n. ' + preventivo.numero +
    ' al titolare e al rappresentante? Il rappresentante potrà solo aprirlo e scaricarlo.'
  )) {
    return;
  }

  const ora = new Date().toISOString();

  const { error } = await db
    .from('preventivi')
    .update({
      stato: 'inviato_a_rappresentante',
      inviato_a_rappresentante_il: ora,
      inviato_a_rappresentante_da: ME.id,
      letto_rappresentante_il: null,
      inviato_a_titolare_il: ora,
      letto_titolare_il: null,
      aggiornato_il: ora
    })
    .eq('id', currentPreventivoId);

  if (error) {
    toast('Errore durante l’invio: ' + error.message, 'err');
    return;
  }

  toast('PDF inviato al titolare e al rappresentante', 'ok');
}


async function inviaPreventivoPerApprovazione(preventivoId) {
  if (!confirm(
    'Inviare il preventivo al titolare per approvazione? Dopo l’invio non potrai più modificarlo.'
  )) {
    return;
  }

  const { data: preventivo, error: errorePreventivo } = await db
    .from('preventivi')
    .select('id,stato,totale_imponibile')
    .eq('id', preventivoId)
    .eq('commerciale_id', ME.id)
    .single();

  if (errorePreventivo || !preventivo) {
    toast('Preventivo non trovato o non modificabile', 'err');
    return;
  }

  if (preventivo.stato !== 'bozza') {
    toast('Puoi inviare per approvazione solo una bozza', 'err');
    return;
  }

  const { count, error: erroreVoci } = await db
    .from('preventivi_voci')
    .select('id', { count: 'exact', head: true })
    .eq('preventivo_id', preventivoId);

  if (erroreVoci) {
    toast('Errore controllo voci: ' + erroreVoci.message, 'err');
    return;
  }

  if (!count || Number(preventivo.totale_imponibile || 0) <= 0) {
    toast('Inserisci e salva almeno una voce con un prezzo prima dell’invio', 'err');
    return;
  }

  const { error } = await db
    .from('preventivi')
    .update({
      stato: 'in_attesa_approvazione'
    })
    .eq('id', preventivoId)
    .eq('commerciale_id', ME.id);

  if (error) {
    toast('Errore invio per approvazione: ' + error.message, 'err');
    return;
  }

  toast('Preventivo inviato al titolare per approvazione', 'ok');

  if (currentPreventivoId === preventivoId) {
    await openPreventivoDetail(preventivoId);
  }

  await loadPreventivi();
}

async function eliminaPreventivo(preventivoId) {
  if (!confirm(
    'Eliminare definitivamente questa bozza? Verranno eliminate anche le voci e i fornitori collegati.'
  )) {
    return;
  }

  const { data: preventivo, error: erroreLettura } = await db
    .from('preventivi')
    .select('id,stato,progetto_tecnico_id')
    .eq('id', preventivoId)
    .eq('commerciale_id', ME.id)
    .single();

  if (erroreLettura || !preventivo) {
    toast('Preventivo non trovato', 'err');
    return;
  }

  if (preventivo.stato !== 'bozza') {
    toast('Puoi eliminare solo un preventivo in bozza', 'err');
    return;
  }

const { data: eliminati, error } = await db
  .from('preventivi')
  .delete()
  .eq('id', preventivoId)
  .eq('commerciale_id', ME.id)
  .eq('stato', 'bozza')
  .select('id');

if (error) {
  toast('Errore eliminazione preventivo: ' + error.message, 'err');
  return;
}

if (!eliminati || !eliminati.length) {
  toast(
    'Cancellazione bloccata: non hai il permesso oppure il preventivo non è più una bozza.',
    'err'
  );
  return;
}

  if (preventivo.progetto_tecnico_id) {
    await db
      .from('progetti_tecnici')
      .update({
        stato: 'inviato_a_commerciale'
      })
      .eq('id', preventivo.progetto_tecnico_id)
      .eq('stato', 'in_preventivazione');
  }

  toast('Bozza preventivo eliminata', 'ok');

  if (currentPreventivoId === preventivoId) {
    currentPreventivoId = null;
    currentPreventivoProgettoId = null;
    gotoPage('preventivi');
  }

  await loadPreventivi();
}
