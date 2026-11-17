// js/18f-richiesta-fornitore.js — richiesta di quotazione ai fornitori (allegati e PDF).
// Riordino del 17/11: era una parte di js/18-preventivi.js (righe 7977-8596),
// spostata così com'era. Si carica subito dopo il pezzo precedente (index.html).

async function selezionaTuttiAllegatiRichiesta(selezioneId) {
  const input = document.querySelectorAll(
    '[data-allegato-richiesta="' + selezioneId + '"]'
  );

  if (!input.length) {
    toast('Non ci sono file da selezionare', 'err');
    return;
  }

  input.forEach(function(file) {
    file.checked = true;
  });

  await salvaAllegatiRichiestaFornitore(selezioneId);
}

async function salvaAllegatiRichiestaFornitore(selezioneId) {
  const allegatiProgettoIds = Array.from(
    document.querySelectorAll(
      '[data-allegato-richiesta="' + selezioneId + '"]:checked'
    )
  ).map(function(input) {
    return input.value;
  });

  const { error } = await db
    .from('preventivi_fornitori')
    .update({
      allegati_progetto_ids: allegatiProgettoIds,
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId);

  if (error) {
    toast('Errore salvataggio allegati: ' + error.message, 'err');
    return;
  }

  toast('Allegati della richiesta salvati', 'ok');
  await renderFornitoriPreventivo();
}


async function segnaRichiestaFornitoreInviata(selezioneId) {
  const { error } = await db
    .from('preventivi_fornitori')
    .update({
      stato: 'richiesta_inviata',
      richiesta_inviata_il: new Date().toISOString(),
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId);

  if (error) {
    toast(
      'Errore aggiornamento stato richiesta: ' + error.message,
      'err'
    );
    return;
  }

  toast('Richiesta segnata come inviata', 'ok');
  await renderFornitoriPreventivo();
}

async function unisciPdfAllegatiRichiesta(doc, allegatiPdf) {
  if (!allegatiPdf.length) {
    return doc.output('blob');
  }

  await caricaLibreriaPDFLib();

  const PdfDocument = window.PDFLib.PDFDocument;
  const pdfFinale = await PdfDocument.load(
    doc.output('arraybuffer')
  );

  for (const file of allegatiPdf) {
    const { data: urlData, error: erroreUrl } = await firmaFile('progetti-tecnici', file.storage_path, 600);

    if (erroreUrl || !urlData?.signedUrl) {
      throw new Error(
        'PDF allegato non disponibile: ' + file.nome_file
      );
    }

    const risposta = await fetch(urlData.signedUrl);

    if (!risposta.ok) {
      throw new Error(
        'Non riesco a scaricare: ' + file.nome_file
      );
    }

    const pdfAllegato = await PdfDocument.load(
      await risposta.arrayBuffer()
    );

    const pagine = await pdfFinale.copyPages(
      pdfAllegato,
      pdfAllegato.getPageIndices()
    );

    pagine.forEach(function(pagina) {
      pdfFinale.addPage(pagina);
    });
  }

  return new Blob(
    [await pdfFinale.save()],
    { type: 'application/pdf' }
  );
}

function scaricaBlobRichiesta(blob, nomeFile) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = nomeFile;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(function() {
    URL.revokeObjectURL(url);
  }, 1000);
}

async function generaRichiestaQuotazionePDF(selezioneId) {
    const allegatiSelezionatiOra = Array.from(
    document.querySelectorAll(
      '[data-allegato-richiesta="' + selezioneId + '"]:checked'
    )
  ).map(function(input) {
    return input.value;
  });

  const { error: erroreSalvataggioAllegati } = await db
    .from('preventivi_fornitori')
    .update({
      allegati_progetto_ids: allegatiSelezionatiOra,
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId);

  if (erroreSalvataggioAllegati) {
    toast(
      'Errore salvataggio immagini selezionate: ' +
      erroreSalvataggioAllegati.message,
      'err'
    );
    return;
  }

 if (!(await preparaPDF())) return;

  const [
    selezioneRes,
    preventivoRes
  ] = await Promise.all([
    db
      .from('preventivi_fornitori')
      .select(`
        id,
        tipologia,
        richiesta_versione,
        note,
        allegati_progetto_ids,
        fornitori(
          ragione_sociale,
          email
        )
      `)
      .eq('id', selezioneId)
      .eq('preventivo_id', currentPreventivoId)
      .single(),

    db
      .from('preventivi')
      .select(`
        id,
        numero,
        progetto_tecnico_id,
        progetti_tecnici(
          tipologia,
           descrizione_tecnica,
  materiali_note
        )
      `)
      .eq('id', currentPreventivoId)
      .single()
  ]);

  if (selezioneRes.error || preventivoRes.error) {
    toast(
      'Errore caricamento dati richiesta: ' +
      (selezioneRes.error?.message || preventivoRes.error?.message),
      'err'
    );
    return;
  }

  const selezione = selezioneRes.data;
  const preventivo = preventivoRes.data;
  const fornitore = selezione.fornitori || {};
  const progetto = preventivo.progetti_tecnici || {};

  const { data: schede, error: erroreSchede } = await db
    .from('progetti_tecnici_schede')
    .select('*')
    .eq('progetto_tecnico_id', preventivo.progetto_tecnico_id)
    .neq('famiglia', 'comune') // F15.8: il blocco comune (contatti del cliente) non va al fornitore
    .order('aggiornato_il', { ascending: false });

  if (erroreSchede) {
    toast(
      'Errore caricamento rilievi tecnici: ' + erroreSchede.message,
      'err'
    );
    return;
  }

  // F16.9 (js/73): solo le schede spuntate per questo fornitore e le loro posizioni P-xx
  const schedeScelte = typeof schedeRichiestaFornitore === 'function'
    ? schedeRichiestaFornitore(selezioneId, schede || []) : (schede || []);
  const posizioniScelte = typeof posizioniRichiestaFornitore === 'function'
    ? await posizioniRichiestaFornitore(preventivo.progetto_tecnico_id, schedeScelte) : [];
  const entroRichiesta = typeof entroRichiestaFornitore === 'function' ? entroRichiestaFornitore(selezioneId) : '';
  const prezzoIndicativo = typeof richiestaFornitoreIndicativa === 'function' && richiestaFornitoreIndicativa(schedeScelte);

    const idsAllegati = Array.isArray(selezione.allegati_progetto_ids)
    ? selezione.allegati_progetto_ids
    : [];

  let fotoDaInserire = [];
let pdfDaInserire = [];

  if (idsAllegati.length) {
    const { data: allegati, error: erroreAllegati } = await db
      .from('progetti_tecnici_allegati')
      .select('id,nome_file,storage_path,mime_type')
      .eq('progetto_id', preventivo.progetto_tecnico_id)
      .in('id', idsAllegati);

    if (erroreAllegati) {
      toast(
        'Errore caricamento foto progetto: ' + erroreAllegati.message,
        'err'
      );
      return;
    }

    fotoDaInserire = (allegati || []).filter(function(file) {
      const tipo = String(file.mime_type || '').toLowerCase();
      const nome = String(file.nome_file || '').toLowerCase();

      return tipo.startsWith('image/') ||
        /\.(jpg|jpeg|png)$/i.test(nome);
    });
pdfDaInserire = (allegati || []).filter(function(file) {
  const tipo = String(file.mime_type || '').toLowerCase();
  const nome = String(file.nome_file || '').toLowerCase();

  return tipo === 'application/pdf' || nome.endsWith('.pdf');
});

  }

  const versione = Number(selezione.richiesta_versione || 0) + 1;

  const { jsPDF } = window.jspdf;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const larghezza = 210;
  const margine = 16;
  const larghezzaTesto = larghezza - (margine * 2);
  let y = 18;

  function nuovaPaginaSeServe(altezzaStimata) {
    if (y + altezzaStimata <= 280) return;

    doc.addPage();
    y = 18;
  }

  function testo(testoDaStampare, dimensione = 10, colore = [30, 30, 30]) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(dimensione);
    doc.setTextColor(...colore);

    const righe = doc.splitTextToSize(
      String(testoDaStampare || '—'),
      larghezzaTesto
    );

    nuovaPaginaSeServe(righe.length * 5 + 4);

    doc.text(righe, margine, y);
    y += righe.length * 5 + 4;
  }

  function titolo(testoTitolo) {
    nuovaPaginaSeServe(12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(8, 80, 65);
    doc.text(testoTitolo, margine, y);

    y += 8;
  }

    function blobInDataUrl(blob) {
    return new Promise(function(resolve, reject) {
      const lettore = new FileReader();

      lettore.onload = function() {
        resolve(lettore.result);
      };

      lettore.onerror = reject;
      lettore.readAsDataURL(blob);
    });
  }


  // Intestazione
  doc.setFillColor(8, 80, 65);
  doc.rect(0, 0, larghezza, 34, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('TOLI FIRE', margine, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Richiesta di quotazione tecnica', margine, 26);

  y = 45;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(20, 20, 20);
  doc.text('RICHIESTA QUOTAZIONE', margine, y);

  y += 8;

  testo(
    'Riferimento richiesta: RQ-' +
    preventivo.numero +
    '-V' +
    versione,
    10
  );

  testo(
    'Data richiesta: ' +
    new Date().toLocaleDateString('it-IT'),
    10
  );

  testo(
    'Destinatario: ' +
    (fornitore.ragione_sociale || 'Fornitore'),
    10
  );

  if (fornitore.email) {
    testo('Email destinatario: ' + fornitore.email, 10);
  }

  // F16.9 (js/73): scadenza della risposta e prezzo indicativo
  if (entroRichiesta) {
    doc.setFont('helvetica', 'bold');
    testo('Rispondere entro il: ' + entroRichiesta, 11, [8, 80, 65]);
  }
  if (prezzoIndicativo) {
    nuovaPaginaSeServe(16);
    doc.setFillColor(253, 236, 200);
    doc.setDrawColor(133, 79, 11);
    doc.rect(margine, y - 1, larghezzaTesto, 13, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(133, 79, 11);
    doc.text('PREZZO INDICATIVO', margine + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Alcuni dati sono ancora da confermare: la quotazione richiesta è indicativa.', margine + 3, y + 10);
    y += 17;
  }

  y += 4;

  titolo('Oggetto della richiesta');

  testo(
    'Tipologia: ' +
    (selezione.tipologia || progetto.tipologia || 'Da definire')
  );

  testo(
    'Si richiede quotazione per fornitura, disponibilità, tempi di consegna e condizioni applicabili.'
  );

  if (progetto.descrizione_tecnica) {
  titolo('Descrizione / studio tecnico');
  testo(progetto.descrizione_tecnica);
}

if (progetto.materiali_note) {
  titolo('Materiali e note del progetto');
  testo(progetto.materiali_note);
}

  if (schedeScelte.length) {
  titolo('Rilievi tecnici dell’ingegnere');

  // Più schede dello stesso tipo (sql/48): "Porte e portoni REI – scheda 2"
  // Il titolo usa tutte le schede del progetto (numerazione "scheda 2" invariata)
  const tutteLeSchede = ordinaSchedeRilievo(schede || []);
  ordinaSchedeRilievo(schedeScelte).forEach(function(scheda) {
      titolo(titoloSchedaRilievo(scheda, tutteLeSchede) +
        (scheda.dati && scheda.dati.tipo_richiesta === 'indicativa' ? ' (prezzo indicativo)' : ''));

     const campi = Object.entries(
  datiSchedaDaMostrare(scheda)
).filter(function(entry) {
        const valore = entry[1];

        // Le note interne per il calcolo non vanno al fornitore (decisione 28/10)
        if (entry[0] === 'note_calcolo') return false;
        if (!campoSchedaDaElencare(entry[0])) return false;
        // F16.9: niente campi 🎓 dell'ingegnere (salvo la copia di Acquisti)
        if (typeof campoInternoRichiestaFornitore === 'function' && campoInternoRichiestaFornitore(scheda, entry[0])) return false;

        return valore !== null &&
          valore !== undefined &&
          valore !== '';
      });

      if (!campi.length) {
        testo('Nessun dato tecnico compilato.');
      }

      campi.forEach(function(entry) {
        testo(
          etichettaCampoTecnico(entry[0], scheda.famiglia) +
          ': ' +
          valoreSchedaTecnica(entry[1], entry[0], scheda.famiglia),
          9
        );
      });

      // F16.9: posizioni P-xx della scheda
      if (typeof tabellaPosizioniRichiestaFornitore === 'function') {
        y = tabellaPosizioniRichiestaFornitore(doc, y, margine, scheda, posizioniScelte);
      }
    });
  }


  if (selezione.note) {
  titolo('Indicazioni aggiuntive');

  testo(
    selezione.note,
    10
  );
}

  // F16.9 (js/73): testi fissi della richiesta
  if (typeof TESTI_FISSI_RICHIESTA_FORNITORE !== 'undefined') {
    titolo('Condizioni della richiesta');
    TESTI_FISSI_RICHIESTA_FORNITORE.forEach(function(riga) { testo('- ' + riga, 9); });
    if (entroRichiesta) testo('- Inviare l’offerta entro il ' + entroRichiesta + '.', 9);
  }

  for (const foto of fotoDaInserire) {
    try {
      const { data: urlData, error: erroreUrl } = await firmaFile('progetti-tecnici', foto.storage_path, 3600);

      if (erroreUrl || !urlData?.signedUrl) {
        throw new Error('Foto non disponibile');
      }

      const risposta = await fetch(urlData.signedUrl);

      if (!risposta.ok) {
        throw new Error('Impossibile scaricare la foto');
      }

      const dataUrl = await blobInDataUrl(await risposta.blob());

      const nome = String(foto.nome_file || '').toLowerCase();
      const formato = (
        String(foto.mime_type || '').includes('png') ||
        nome.endsWith('.png')
      ) ? 'PNG' : 'JPEG';

      const proprieta = doc.getImageProperties(dataUrl);
      const larghezzaMassima = 178;
      const altezzaMassima = 238;

      const scala = Math.min(
        larghezzaMassima / proprieta.width,
        altezzaMassima / proprieta.height
      );

      const larghezzaFoto = proprieta.width * scala;
      const altezzaFoto = proprieta.height * scala;

      doc.addPage();
      y = 18;

      titolo('Foto allegata al rilievo');
      testo(foto.nome_file, 8, [90, 90, 90]);

      doc.addImage(
        dataUrl,
        formato,
        margine,
        y,
        larghezzaFoto,
        altezzaFoto
      );
    } catch (erroreFoto) {
      console.warn('Foto non inserita nel PDF:', foto.nome_file, erroreFoto);
    }
  }

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



  const nomeFornitore = String(
    fornitore.ragione_sociale || 'fornitore'
  )
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');

const nomeFileRichiesta =
  'Richiesta_quotazione_RQ-' +
  preventivo.numero +
  '-V' +
  versione +
  '_' +
  nomeFornitore +
  '.pdf';

let pdfFinale;

try {
  pdfFinale = await unisciPdfAllegatiRichiesta(
    doc,
    pdfDaInserire
  );
} catch (errorePdf) {
  toast(
    'Impossibile aggiungere il PDF allegato: ' +
    errorePdf.message,
    'err'
  );
  return;
}

scaricaBlobRichiesta(
  pdfFinale,
  nomeFileRichiesta
);

  const { error: erroreAggiornamento } = await db
    .from('preventivi_fornitori')
    .update({
      richiesta_versione: versione,
      richiesta_pdf_generato_il: new Date().toISOString(),
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId);

  if (erroreAggiornamento) {
    toast(
      'PDF scaricato, ma errore salvataggio versione: ' +
      erroreAggiornamento.message,
      'err'
    );
    return;
  }

  toast(
    'PDF richiesta quotazione v' + versione + ' generato',
    'ok'
  );

  await renderFornitoriPreventivo();
}
