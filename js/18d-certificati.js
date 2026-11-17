// js/18d-certificati.js — certificati del preventivo.
// Riordino del 17/11: era una parte di js/18-preventivi.js (righe 5491-6333),
// spostata così com'era. Si carica subito dopo il pezzo precedente (index.html).

function formatoDataOraCertificato(data) {
  if (!data) return '—';

  return new Date(data).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function cardCertificatoPreventivo(certificato, origine) {
  ricordaPosizionePagina();
  const puoGestire =
    ROLE === 'titolare' ||
    (ROLE === 'commerciale' && origine === 'commerciale');

  const titolo = origine === 'commerciale'
    ? '📄 Certificato di Acquisti'
    : '📄 Certificato del titolare';

  const statoInvio = certificato.inviato_il
    ? `<span class="badge green">✓ Inviato all’ingegnere il ${formatoDataOraCertificato(certificato.inviato_il)}</span>`
    : `<span class="badge yellow">Da inviare all’ingegnere</span>`;

  // F2.3 — il commerciale (e il titolare) vede se l'ingegnere l'ha aperto
  const statoLettura = !certificato.inviato_il
    ? ''
    : certificato.letto_ingegnere_il
      ? ` <span class="badge green">Letto dall’ingegnere il ${formatoDataOraCertificato(certificato.letto_ingegnere_il)}</span>`
      : ` <span class="badge yellow">Non ancora letto dall’ingegnere</span>`;

  const inputId = `certificato-file-${certificato.id}`;

  return `
    <div class="card" style="margin-bottom:14px">
      <b>${titolo}</b>

      <div style="margin-top:8px">
        ${statoInvio}${statoLettura}
      </div>

      <p style="margin:12px 0 4px">
        <b>File:</b> ${esc(certificato.nome_file)}
      </p>

      <p class="muted" style="margin:0">
        Caricato il ${formatoDataOraCertificato(certificato.caricato_il)}
      </p>

      <div class="actions" style="margin-top:12px">
        <button class="btn" onclick="apriCertificatoPreventivo('${certificato.id}')">
          Apri / scarica
        </button>

        ${puoGestire ? `
          <button
            class="btn primary"
            onclick="inviaCertificatoAllIngegnere('${certificato.id}')"
          >
            ${certificato.inviato_il
              ? '↻ Reinvia all’ingegnere'
              : '📨 Invia all’ingegnere'}
          </button>

          <input
            type="file"
            id="${inputId}"
            accept="application/pdf,.pdf"
            style="margin-top:10px"
          >

          <button
            class="btn"
            style="margin-top:10px"
            onclick="caricaCertificatoPreventivo('${origine}', '${certificato.id}')"
          >
            🔄 Sostituisci questo PDF
          </button>

          <button
            class="btn"
            style="margin-top:10px;color:var(--r)"
            onclick="eliminaCertificatoPreventivo('${certificato.id}')"
          >
            🗑️ Elimina
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function caricatoreCertificatiPreventivo(origine) {
  const puoCaricare =
    (ROLE === 'commerciale' && origine === 'commerciale') ||
    (ROLE === 'titolare' && origine === 'titolare');

  if (!puoCaricare) return '';

  return `
    <div class="card" style="margin-bottom:14px">
      <b>➕ Aggiungi certificati</b>

      <p class="muted" style="margin:8px 0">
        Puoi selezionare più PDF insieme.
      </p>

      <input
        type="file"
        id="certificati-file-nuovi-${origine}"
        accept="application/pdf,.pdf"
        multiple
      >

      <button
        class="btn primary"
        style="margin-top:10px"
        onclick="caricaNuoviCertificatiPreventivo('${origine}')"
      >
        📤 Carica certificati selezionati
      </button>
    </div>
  `;
}

async function renderCertificatiPreventivo() {
  const box = ge('pvd-certificati-content');
  if (!box || !currentPreventivoId) return;

  box.innerHTML = '<div class="load">Caricamento certificati...</div>';

  const { data, error } = await db
    .from('preventivi_certificati')
    .select('*')
    .eq('preventivo_id', currentPreventivoId)
    .order('caricato_il', { ascending: false });

  if (error) {
    box.innerHTML = `
      <div class="empty">
        Errore nel caricamento dei certificati: ${esc(error.message)}
      </div>
    `;
    return;
  }

  const certificatiCommerciale = (data || []).filter(function(certificato) {
    return certificato.origine === 'commerciale';
  });

  const certificatiTitolare = (data || []).filter(function(certificato) {
    return certificato.origine === 'titolare';
  });

  if (ROLE === 'commerciale') {
    box.innerHTML = `
      <div class="info">
        Puoi caricare più certificati PDF. Ogni file può essere inviato,
        reinviato o sostituito singolarmente.
      </div>

      ${caricatoreCertificatiPreventivo('commerciale')}

      ${bottoneEliminaTuttiCertificati('commerciale', certificatiCommerciale.length)}

      ${
        certificatiCommerciale.length
          ? certificatiCommerciale.map(function(certificato) {
              return cardCertificatoPreventivo(certificato, 'commerciale');
            }).join('')
          : '<div class="empty">Nessun certificato caricato.</div>'
      }
    `;
    return;
  }

  if (ROLE === 'titolare') {
    box.innerHTML = `
      <div class="info">
        Puoi vedere e correggere i certificati di Acquisti.
        I certificati del titolare restano riservati al titolare e all’ingegnere.
      </div>

      <h3 style="margin:16px 0 10px">
        Certificati di Acquisti
      </h3>

      ${bottoneEliminaTuttiCertificati('commerciale', certificatiCommerciale.length)}

      ${
        certificatiCommerciale.length
          ? certificatiCommerciale.map(function(certificato) {
              return cardCertificatoPreventivo(certificato, 'commerciale');
            }).join('')
          : '<div class="empty">Acquisti non ha ancora caricato certificati.</div>'
      }

      <h3 style="margin:20px 0 10px">
        Certificati riservati del titolare
      </h3>

      ${caricatoreCertificatiPreventivo('titolare')}

      ${bottoneEliminaTuttiCertificati('titolare', certificatiTitolare.length)}

      ${
        certificatiTitolare.length
          ? certificatiTitolare.map(function(certificato) {
              return cardCertificatoPreventivo(certificato, 'titolare');
            }).join('')
          : '<div class="empty">Nessun certificato del titolare.</div>'
      }
    `;
  }
}

async function salvaCertificatoPreventivo(origine, file, certificatoId) {
  const ePdf =
    file &&
    (
      file.type === 'application/pdf' ||
      /\.pdf$/i.test(file.name)
    );

  if (!ePdf) {
    return {
      ok: false,
      messaggio: 'Puoi caricare soltanto file PDF'
    };
  }

  const puoGestire =
    ROLE === 'titolare' ||
    (ROLE === 'commerciale' && origine === 'commerciale');

  if (!puoGestire) {
    return {
      ok: false,
      messaggio: 'Non hai i permessi per modificare questo certificato'
    };
  }

  const { data: utenteData } = await db.auth.getUser();
  const utente = utenteData?.user;

  if (!utente) {
    return {
      ok: false,
      messaggio: 'Sessione non valida. Effettua di nuovo l’accesso.'
    };
  }

  let esistente = null;

  if (certificatoId) {
    const { data, error } = await db
      .from('preventivi_certificati')
      .select('*')
      .eq('id', certificatoId)
      .eq('preventivo_id', currentPreventivoId)
      .single();

    if (error || !data) {
      return {
        ok: false,
        messaggio: 'Certificato da sostituire non trovato'
      };
    }

    esistente = data;
  }

  if (ROLE === 'titolare' && origine === 'commerciale' && !esistente) {
    return {
      ok: false,
      messaggio: 'Il certificato di Acquisti può essere creato solo da Acquisti'
    };
  }

  const { data: preventivo } = await db
    .from('preventivi')
    .select('numero, commerciale_id, clienti(ragione_sociale)')
    .eq('id', currentPreventivoId)
    .single();

  const nomeSicuro = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');

  const percorso =
    `${currentPreventivoId}/${origine}/${Date.now()}_${nomeSicuro}`;

  // F2.3 — Il certificato del commerciale resta intestato al commerciale:
  // quello già registrato; se manca, chi carica (se è il commerciale) oppure,
  // se sostituisce il titolare, il commerciale del preventivo (mai il titolare).
  const commercialeCertificato = origine === 'commerciale'
    ? (
        esistente?.commerciale_id ||
        (ROLE === 'commerciale' ? utente.id : (preventivo?.commerciale_id || null))
      )
    : null;

  const datiCertificato = {
    preventivo_id: currentPreventivoId,
    origine,
    commerciale_id: commercialeCertificato,
    preventivo_numero: preventivo?.numero || null,
    cliente_nome: preventivo?.clienti?.ragione_sociale || null,
    nome_file: file.name,
    storage_path: percorso,
    dimensione: file.size,
    caricato_da: utente.id,
    caricato_il: new Date().toISOString(),
    inviato_il: null,
    inviato_da: null,
    letto_ingegnere_il: null
  };

  // F2.3 — Ordine pensato per non perdere il certificato valido e per non
  // lasciare PDF orfani nel bucket. Il commerciale vede (e quindi può
  // cancellare) solo il file indicato nella riga del certificato
  // (certificati_storage_select): un PDF caricato prima di aggiornare la
  // riga, se qualcosa va storto, non lo potrebbe più togliere.
  //   1. copia del PDF vecchio (se la lettura fallisce ci si ferma: niente
  //      è stato toccato);
  //   2. cancellazione del PDF vecchio (se negata ci si ferma);
  //   3. riga aggiornata/creata con il percorso nuovo;
  //   4. caricamento del PDF nuovo.
  // A ogni errore si torna com'era (riga e PDF vecchio).
  let vecchioPdf = null;

  if (esistente?.storage_path) {
    const { data: scaricato, error: erroreLettura } = await db.storage
      .from('certificati-preventivi')
      .download(esistente.storage_path);

    if (erroreLettura && !fileNonTrovatoCertificato(erroreLettura)) {
      return {
        ok: false,
        messaggio: 'Impossibile leggere il PDF precedente: ' +
          (erroreLettura.message || 'errore sconosciuto') +
          '. Il certificato non è stato sostituito, riprova.'
      };
    }

    vecchioPdf = scaricato || null;

    if (vecchioPdf) {
      const { data: rimossi, error: erroreRimozione } = await db.storage
        .from('certificati-preventivi')
        .remove([esistente.storage_path]);

      if (erroreRimozione || !(rimossi || []).length) {
        return {
          ok: false,
          messaggio: 'Impossibile eliminare il PDF precedente: ' +
            (erroreRimozione?.message || 'permessi insufficienti') +
            '. Il certificato non è stato sostituito.'
        };
      }
    }
  }

  async function ripristinaVecchioPdf() {
    if (!vecchioPdf) return '';

    const { error: erroreRipristino } = await db.storage
      .from('certificati-preventivi')
      .upload(esistente.storage_path, vecchioPdf, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/pdf'
      });

    return erroreRipristino
      ? ' Attenzione: il PDF precedente non è stato ripristinato, ricarica il certificato.'
      : '';
  }

  let erroreSalvataggio = null;
  let idCertificato = esistente?.id || null;

  if (esistente) {
    const risposta = await db
      .from('preventivi_certificati')
      .update(datiCertificato)
      .eq('id', esistente.id)
      .select('id');

    erroreSalvataggio = risposta.error ||
      (!(risposta.data || []).length ? { message: 'permessi insufficienti' } : null);
  } else {
    const risposta = await db
      .from('preventivi_certificati')
      .insert(datiCertificato)
      .select('id')
      .single();

    erroreSalvataggio = risposta.error ||
      (!risposta.data ? { message: 'certificato non creato' } : null);
    idCertificato = risposta.data?.id || null;
  }

  if (erroreSalvataggio) {
    const ripristino = await ripristinaVecchioPdf();

    return {
      ok: false,
      messaggio: `Errore salvataggio certificato: ${erroreSalvataggio.message}.${ripristino}`
    };
  }

  const { error: erroreUpload } = await db.storage
    .from('certificati-preventivi')
    .upload(percorso, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'application/pdf'
    });

  if (erroreUpload) {
    // La riga torna com'era (o sparisce, se era nuova), poi il PDF vecchio.
    let erroreRiga;

    if (esistente) {
      const datiPrecedenti = {};

      Object.keys(datiCertificato).forEach(function(campo) {
        datiPrecedenti[campo] = esistente[campo] ?? null;
      });

      const risposta = await db
        .from('preventivi_certificati')
        .update(datiPrecedenti)
        .eq('id', esistente.id);

      erroreRiga = risposta.error;
    } else if (idCertificato) {
      const risposta = await db
        .from('preventivi_certificati')
        .delete()
        .eq('id', idCertificato);

      erroreRiga = risposta.error;
    }

    const ripristino = await ripristinaVecchioPdf();
    const avvisoRiga = erroreRiga
      ? ' Attenzione: il certificato è rimasto senza PDF, ricaricalo.'
      : '';

    return {
      ok: false,
      messaggio: `Errore caricamento PDF: ${erroreUpload.message}.${avvisoRiga}${ripristino}`
    };
  }

  return {
    ok: true,
    sostituito: !!esistente
  };
}

// F2.3 — l'errore di lettura dallo storage indica un file che non c'è
// (già sparito): in quel caso la sostituzione può procedere.
// Eliminare i certificati del preventivo (richiesta di Erika del 30/10):
// uno alla volta o tutti quelli di una sezione. Permessi già nel database
// (certificati_delete e certificati_storage_delete): titolare tutto,
// commerciale solo i suoi. Prima il PDF, poi la riga: senza la riga il
// commerciale non vedrebbe più il file e resterebbe orfano nel bucket.
function bottoneEliminaTuttiCertificati(origine, quanti) {
  const puoGestire =
    ROLE === 'titolare' ||
    (ROLE === 'commerciale' && origine === 'commerciale');

  if (!puoGestire || quanti < 1) return '';

  return `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn sm" style="color:var(--r)" onclick="eliminaTuttiCertificatiPreventivo('${origine}')">
        🗑️ Elimina tutti (${quanti})
      </button>
    </div>
  `;
}

async function eliminaRigaCertificatoPreventivo(certificato) {
  if (certificato.storage_path) {
    const { error: erroreFile } = await db.storage
      .from('certificati-preventivi')
      .remove([certificato.storage_path]);

    if (erroreFile && !fileNonTrovatoCertificato(erroreFile)) {
      return 'PDF non eliminato: ' + (erroreFile.message || 'errore sconosciuto');
    }
  }

  const { data, error } = await db
    .from('preventivi_certificati')
    .delete()
    .eq('id', certificato.id)
    .select('id');

  if (error) return error.message;
  if (!(data || []).length) return 'permessi insufficienti';
  return '';
}

async function eliminaCertificatoPreventivo(certificatoId) {
  const { data: certificato, error } = await db
    .from('preventivi_certificati')
    .select('id, nome_file, storage_path, inviato_il')
    .eq('id', certificatoId)
    .eq('preventivo_id', currentPreventivoId)
    .maybeSingle();

  if (error || !certificato) {
    toast('Certificato non trovato', 'err');
    return;
  }

  if (!confirm(
    'Eliminare il certificato "' + certificato.nome_file + '"?' +
    (certificato.inviato_il ? '\nL’ingegnere non lo vedrà più.' : '') +
    '\nL’operazione non si può annullare.'
  )) return;

  const problema = await eliminaRigaCertificatoPreventivo(certificato);

  if (problema) {
    toast('Errore eliminazione certificato: ' + problema, 'err');
  } else {
    toast('Certificato eliminato', 'ok');
  }

  await renderCertificatiPreventivo();
}

async function eliminaTuttiCertificatiPreventivo(origine) {
  const puoGestire =
    ROLE === 'titolare' ||
    (ROLE === 'commerciale' && origine === 'commerciale');

  if (!puoGestire || !currentPreventivoId) return;

  const { data, error } = await db
    .from('preventivi_certificati')
    .select('id, nome_file, storage_path')
    .eq('preventivo_id', currentPreventivoId)
    .eq('origine', origine);

  if (error) {
    toast('Errore lettura certificati: ' + error.message, 'err');
    return;
  }

  const certificati = data || [];
  if (!certificati.length) {
    toast('Nessun certificato da eliminare', 'warn');
    return;
  }

  const sezione = origine === 'commerciale'
    ? 'di Acquisti'
    : 'riservati del titolare';

  if (!confirm(
    'Eliminare TUTTI i ' + certificati.length + ' certificati ' + sezione +
    ' di questo preventivo?\nL’operazione non si può annullare.'
  )) return;

  let eliminati = 0;
  const problemi = [];

  for (const certificato of certificati) {
    const problema = await eliminaRigaCertificatoPreventivo(certificato);
    if (problema) problemi.push(certificato.nome_file + ': ' + problema);
    else eliminati++;
  }

  if (problemi.length) {
    toast(
      'Eliminati ' + eliminati + ' su ' + certificati.length +
      '. Non eliminati: ' + problemi.join('; '),
      'error'
    );
  } else {
    toast('Eliminati ' + eliminati + ' certificati', 'ok');
  }

  await renderCertificatiPreventivo();
}

function fileNonTrovatoCertificato(errore) {
  if (!errore) return false;

  const stato = String(
    errore.statusCode || errore.status || errore.originalError?.status || ''
  );

  return stato === '404' ||
    errore.error === 'not_found' ||
    /not.?found|non trovato/i.test(errore.message || '');
}

async function caricaCertificatoPreventivo(origine, certificatoId) {
  if (caricamentoCertificatiInCorso) {
    toast('Caricamento già in corso, attendi…', 'warn');
    return;
  }

  const input = ge(`certificato-file-${certificatoId}`);
  const file = input?.files?.[0];

  if (!file) {
    toast('Seleziona prima il PDF sostitutivo', 'err');
    return;
  }

  caricamentoCertificatiInCorso = true;
  let risultato;
  try {
    risultato = await salvaCertificatoPreventivo(
      origine,
      file,
      certificatoId
    );
  } finally {
    caricamentoCertificatiInCorso = false;
  }

  if (!risultato.ok) {
    toast(risultato.messaggio, 'err');
    return;
  }

  toast(
    'PDF sostituito. Ricordati di reinviarlo all’ingegnere.',
    'ok'
  );

  await renderCertificatiPreventivo();
}

// Un caricamento alla volta: senza questo blocco, ogni clic in più su
// "Carica certificati selezionati" durante l'invio ricaricava di nuovo tutti
// i PDF scelti (4 file e diversi clic = decine di certificati doppi).
let caricamentoCertificatiInCorso = false;

async function caricaNuoviCertificatiPreventivo(origine) {
  if (caricamentoCertificatiInCorso) {
    toast('Caricamento già in corso, attendi…', 'warn');
    return;
  }

  const input = ge(`certificati-file-nuovi-${origine}`);
  const fileDaCaricare = Array.from(input?.files || []);

  if (!fileDaCaricare.length) {
    toast('Seleziona almeno un PDF', 'err');
    return;
  }

  caricamentoCertificatiInCorso = true;
  const bottone = input?.parentElement?.querySelector('button');
  const testoBottone = bottone ? bottone.textContent : '';
  if (bottone) bottone.disabled = true;
  if (input) input.disabled = true;

  let caricati = 0;
  const errori = [];

  try {
    for (const [posizione, file] of fileDaCaricare.entries()) {
      if (bottone) {
        bottone.textContent =
          `⏳ Caricamento ${posizione + 1} di ${fileDaCaricare.length}…`;
      }

      const risultato = await salvaCertificatoPreventivo(
        origine,
        file,
        null
      );

      if (risultato.ok) {
        caricati++;
      } else {
        errori.push(`${file.name}: ${risultato.messaggio}`);
      }
    }
  } finally {
    caricamentoCertificatiInCorso = false;
    if (input) {
      input.value = '';
      input.disabled = false;
    }
    if (bottone) {
      bottone.disabled = false;
      bottone.textContent = testoBottone;
    }
  }

  if (errori.length) {
    toast(errori.join(' · '), 'err');
  }

  if (caricati) {
    toast(
      `${caricati} certificato${caricati === 1 ? '' : 'i'} caricato${caricati === 1 ? '' : 'i'}.`,
      'ok'
    );
  }

  await renderCertificatiPreventivo();
}

async function inviaCertificatoAllIngegnere(certificatoId) {
  const { data: utenteData } = await db.auth.getUser();
  const utente = utenteData?.user;

  if (!utente) {
    toast('Sessione non valida. Effettua di nuovo l’accesso.', 'err');
    return;
  }

  const { error } = await db
    .from('preventivi_certificati')
    .update({
      inviato_il: new Date().toISOString(),
      inviato_da: utente.id,
      letto_ingegnere_il: null
    })
    .eq('id', certificatoId);

  if (error) {
    toast(`Errore invio certificato: ${error.message}`, 'err');
    return;
  }

  toast('Certificato inviato all’ingegnere');
  await renderCertificatiPreventivo();
}

async function apriCertificatoPreventivo(certificatoId) {
  ricordaPosizionePagina();
  const { data: certificato, error } = await db
    .from('preventivi_certificati')
    .select('*')
    .eq('id', certificatoId)
    .single();

  if (error || !certificato) {
    toast('Certificato non disponibile', 'err');
    return;
  }

  const { data, error: erroreUrl } = await firmaFile('certificati-preventivi', certificato.storage_path, 300);

  if (erroreUrl || !data?.signedUrl) {
    toast(`Impossibile aprire il PDF: ${erroreUrl?.message || ''}`, 'err');
    return;
  }

  // F2.3 — quando l'ingegnere apre il certificato si segna "letto
  // dall'ingegnere" (solo la prima volta). L'ingegnere non può modificare
  // preventivi_certificati: lo fa la RPC marca_certificato_letto_ingegnere
  // (sql/18). Se la RPC non c'è ancora, il PDF si apre lo stesso.
  // Si segna PRIMA di aprire: il PDF si apre nella stessa scheda.
  if (ROLE === 'ingegnere' && !certificato.letto_ingegnere_il) {
    const { error: erroreLettura } = await db.rpc(
      'marca_certificato_letto_ingegnere',
      { p_certificato_id: certificatoId }
    );

    if (erroreLettura) {
      console.warn('Lettura certificato non registrata (serve sql/18):', erroreLettura.message);
    }
  }

  // Stessa scheda: la freccia indietro torna alla pagina di prima (js/47).
  if (typeof apriPdfStessaScheda === 'function') {
    apriPdfStessaScheda(data.signedUrl);
    return;
  }

  window.open(data.signedUrl, '_blank', 'noopener');
  if (ROLE === 'ingegnere' && ge('certificati-ingegnere-lista')) {
    await loadCertificatiIngegnere();
  }
}

async function loadCertificatiIngegnere() {
  ricordaPosizionePagina();
  const box = ge('certificati-ingegnere-lista');
  if (!box || ROLE !== 'ingegnere') return;

  box.innerHTML = '<div class="load">Caricamento certificati...</div>';

  const { data, error } = await db
    .from('preventivi_certificati')
    .select('*')
    .not('inviato_il', 'is', null)
    .order('inviato_il', { ascending: false });

  if (error) {
    box.innerHTML = `<div class="empty">Errore nel caricamento: ${esc(error.message)}</div>`;
    return;
  }

  if (!data?.length) {
    box.innerHTML = '<div class="empty">Nessun certificato ricevuto al momento.</div>';
    return;
  }

  box.innerHTML = `
    <div class="grid">
      ${data.map(certificato => `
        <div class="card">
          <h3>Preventivo n. ${certificato.preventivo_numero || '—'}</h3>
          <p><b>Cliente:</b> ${esc(certificato.cliente_nome || '—')}</p>
          <p><b>Origine:</b> ${certificato.origine === 'commerciale' ? 'Acquisti' : 'Titolare'}</p>
          <p><b>File:</b> ${esc(certificato.nome_file)}</p>
          <p class="muted">Inviato il ${formatoDataOraCertificato(certificato.inviato_il)}</p>
          ${certificato.letto_ingegnere_il
            ? `<p class="muted">Aperto da te il ${formatoDataOraCertificato(certificato.letto_ingegnere_il)}</p>`
            : '<p><span class="badge yellow">Nuovo</span></p>'}

          <button
            class="btn primary"
            onclick="apriCertificatoPreventivo('${certificato.id}')"
          >
            👁 Visualizza / scarica PDF
          </button>
        </div>
      `).join('')}
    </div>
  `;
}
