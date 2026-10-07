// ── PROGETTI TECNICI CLIENTE ─────────────────────────────────

let allegatiProgettoDati = [];
let salvataggioProgettoInCorso = false;
let urlAnteprimaProgetto = [];

function anteprimaFileProgetto() {
  const box = ge('mp-file-selezionati');
  if (!box) return;

  urlAnteprimaProgetto.forEach(function(url) {
    URL.revokeObjectURL(url);
  });
  urlAnteprimaProgetto = [];

  const obbligatori = Array.from(ge('mp-file').files || []);
  const extra = Array.from(ge('mp-file-extra').files || []);
  const files = [...obbligatori, ...extra];

  if (!files.length) {
    box.innerHTML = '';
    return;
  }

  box.innerHTML = `
    <div style="font-size:12px;font-weight:700;margin-bottom:6px">
      File pronti da caricare (${files.length})
    </div>
    ${files.map(function(file) {
      const immagine = file.type.startsWith('image/');
      const url = URL.createObjectURL(file);
      urlAnteprimaProgetto.push(url);

      return `
        <div style="display:flex;align-items:center;gap:9px;padding:8px 10px;margin-top:6px;background:var(--bg);border-radius:var(--rs)">
          ${
            immagine
              ? `<a href="${url}" target="_blank" rel="noopener">
                   <img src="${url}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:6px">
                 </a>`
              : '<span style="font-size:22px">📄</span>'
          }

          <div style="min-width:0;flex:1">
            <div style="font-size:12px;font-weight:600;overflow-wrap:anywhere">
              ${esc(file.name)}
            </div>
            <div style="font-size:11px;color:var(--m)">
              ${(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>

          <a class="btn sm" href="${url}" target="_blank" rel="noopener">
            Apri
          </a>
        </div>
      `;
    }).join('')}
  `;
}


function fileProgettoValido(file) {
  if (!file) return false;

  const tipiAmmessi = [
    'application/pdf',
    'image/jpeg',
    'image/png'
  ];

  const estensioniAmmesse = ['pdf', 'jpg', 'jpeg', 'png', 'dwg'];

  const estensione = file.name.split('.').pop().toLowerCase();

  return tipiAmmessi.includes(file.type) ||
    estensioniAmmesse.includes(estensione);
}

async function caricaAllegatiProgetto(progettoId) {
  const box = ge('mp-allegati');

  if (!progettoId) {
    allegatiProgettoDati = [];

    if (box) {
      box.innerHTML =
        '<div class="al2 w">Per creare il progetto devi allegare almeno un PDF, JPG/JPEG o PNG.</div>';
    }

    return;
  }

  const { data, error } = await db
    .from('progetti_tecnici_allegati')
    .select('*')
    .eq('progetto_id', progettoId)
    .order('caricato_il', { ascending: false });

  if (error) {
    allegatiProgettoDati = [];

    if (box) {
      box.innerHTML =
        '<div class="al2 e">Errore nel caricamento allegati.</div>';
    }

    return;
  }

  allegatiProgettoDati = data || [];

  if (!box) return;

  if (!allegatiProgettoDati.length) {
    box.innerHTML =
      '<div class="al2 w">Questo progetto non ha ancora allegati: carica un PDF, JPG/JPEG o PNG prima di salvare.</div>';
    return;
  }

 var puoEliminare = ROLE === 'rappresentante' || ROLE === 'titolare';

box.innerHTML = allegatiProgettoDati.map(function(allegato) {
  return `
    <div style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      padding:8px 10px;
      margin-top:6px;
      background:var(--gl);
      border-radius:var(--rs);
      font-size:12px
    ">
      <div style="min-width:0;display:flex;align-items:center;gap:8px">
        <span>📎</span>
        <span style="font-weight:600;overflow-wrap:anywhere">
          ${esc(allegato.nome_file)}
        </span>
      </div>

      ${puoEliminare ? `
        <button
          class="btn sm"
          style="color:var(--r);flex-shrink:0"
          onclick="eliminaAllegatoProgetto('${allegato.id}')"
        >
          🗑️ Elimina
        </button>
      ` : ''}
    </div>
  `;
}).join('');
}

async function eliminaAllegatoProgetto(allegatoId) {
  if (ROLE !== 'rappresentante' && ROLE !== 'titolare') {
    toast('Non hai i permessi per eliminare questo allegato', 'err');
    return;
  }

  var allegato = allegatiProgettoDati.find(function(file) {
    return file.id === allegatoId;
  });

  if (!allegato) {
    toast('Allegato non trovato', 'err');
    return;
  }

  if (allegatiProgettoDati.length <= 1) {
    toast(
      'Il progetto deve contenere almeno un allegato. Carica prima un nuovo file, poi elimina quello vecchio.',
      'err'
    );
    return;
  }

  if (!confirm('Eliminare definitivamente "' + allegato.nome_file + '"?')) {
    return;
  }

  const { error: erroreRecord } = await db
    .from('progetti_tecnici_allegati')
    .delete()
    .eq('id', allegatoId);

  if (erroreRecord) {
    toast('Errore eliminazione allegato: ' + erroreRecord.message, 'err');
    return;
  }

  if (allegato.storage_path) {
    const { error: erroreFile } = await db.storage
      .from('progetti-tecnici')
      .remove([allegato.storage_path]);

    if (erroreFile) {
      console.warn(
        'Allegato rimosso dal progetto, ma file rimasto nel bucket:',
        erroreFile.message
      );
    }
  }

  toast('Foto/file eliminato dal progetto', 'ok');
  await caricaAllegatiProgetto(allegato.progetto_id);
}

async function loadProgettiCliente(clienteId) {
  const lista = ge('cd-progetti-lista');

  if (!clienteId || !lista) return;
  const richiestaId = ++richiestaProgettiCliente;
  const clienteRichiestoId = clienteId;

  lista.innerHTML = '<div class="load">Caricamento...</div>';

  const { data, error } = await db
    .from('progetti_tecnici')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('creato_il', { ascending: false });

    // Ignora la risposta se nel frattempo è stata aperta un'altra scheda cliente.
if (
  richiestaId !== richiestaProgettiCliente ||
  currentCliId !== clienteRichiestoId
) {
  return;
}

  if (error) {
    lista.innerHTML =
      '<div class="al2 e">Errore: ' + esc(error.message) + '</div>';
    return;
  }

  progettiClienteDati = data || [];

  if (!progettiClienteDati.length) {
    lista.innerHTML =
      '<div class="empty">Nessun progetto tecnico per questo cliente.</div>';
    return;
  }

  lista.innerHTML = progettiClienteDati.map(function(p) {
    const stato = {
      bozza: 'Bozza',
      inviato_a_commerciale: 'Inviato al commerciale',
      in_verifica_tecnica: 'In verifica tecnica',
      in_valutazione: 'In valutazione',
      pronto_per_preventivo: 'Pronto per preventivo',
      approvato: 'Approvato',
      archiviato: 'Archiviato'
      
    }[p.stato] || p.stato;
    const richiediVerifica = ['bozza', 'da_integrare'].includes(p.stato);
    const inviaCommerciale = [
    'bozza',
    'da_integrare',
    'pronto_per_preventivo'].includes(p.stato);

    return '<div class="card" style="margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
        '<div>' +
          '<div style="font-size:14px;font-weight:700">' +
            esc(p.titolo) +
          '</div>' +
          '<div style="font-size:12px;color:var(--m);margin-top:4px">' +
            esc(p.tipologia) +
            ' · Creato il ' +
            new Date(p.creato_il).toLocaleDateString('it-IT') +
          '</div>' +
        '</div>' +
        '<span class="bx bblue">' + esc(stato) + '</span>' +
      '</div>' +
      '<div style="font-size:13px;white-space:pre-wrap;margin-top:10px">' +
        esc(p.descrizione_tecnica) +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
 '<button class="btn sm" onclick="openProgettoDetail(\'' + p.id + '\')">' +
  'Apri' +
'</button>' +

'<button class="btn sm info" onclick="modificaProgetto(\'' + p.id + '\')">' +
  'Modifica' +
'</button>' +

(richiediVerifica
  ? '<button class="btn sm info" onclick="inviaProgettoAUfficioTecnico(\'' + p.id + '\')">' +
      '🔧 Invia a ufficio tecnico' +
    '</button>'
  : '') +

(inviaCommerciale
  ? '<button class="btn sm info" onclick="inviaProgettoAlCommerciale(\'' + p.id + '\')">' +
      '📤 Invia al commerciale' +
    '</button>'
  : '') +

  '<button class="btn sm" style="color:var(--r)" onclick="eliminaProgetto(\'' + p.id + '\')">' +
    '🗑 Elimina' +
  '</button>' +
'</div>' +
    '</div>';
  }).join('');
}

async function apriNuovoProgetto() {
  if (!currentCliId) {
    toast('Apri prima la scheda di un cliente', 'err');
    return;
  }

  ge('mp-id').value = '';
  ge('mp-titolo-modal').textContent = 'Nuovo progetto tecnico';
  ge('mp-titolo').value = '';
  ge('mp-tipologia').value = '';
  ge('mp-descrizione').value = '';
  ge('mp-materiali').value = '';
  ge('mp-file').value = '';
  ge('mp-file-extra').value = '';
  anteprimaFileProgetto();

  await caricaAllegatiProgetto(null);

  openM('m-progetto');
}

async function modificaProgetto(id) {
  const progetto = progettiClienteDati.find(function(p) {
    return p.id === id;
  });

  if (!progetto) {
    toast('Progetto non trovato', 'err');
    return;
  }

  ge('mp-id').value = progetto.id;
  ge('mp-titolo-modal').textContent = 'Modifica progetto tecnico';
  ge('mp-titolo').value = progetto.titolo || '';
  ge('mp-tipologia').value = progetto.tipologia || '';
  ge('mp-descrizione').value = progetto.descrizione_tecnica || '';
  ge('mp-materiali').value = progetto.materiali_note || '';
  ge('mp-file').value = '';
  ge('mp-file-extra').value = '';
  anteprimaFileProgetto();

  await caricaAllegatiProgetto(id);

  openM('m-progetto');
}

async function salvaProgetto() {
  if (salvataggioProgettoInCorso) {
    toast('Salvataggio già in corso…', 'info');
    return;
  }

  salvataggioProgettoInCorso = true;

  const btn = ge('mp-salva');
  const testoOriginale = btn ? btn.textContent : 'Salva bozza';

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Salvataggio…';
  }

  try {
    const id = v('mp-id');
    const titolo = v('mp-titolo').trim();
    const tipologia = v('mp-tipologia');
    const descrizione = v('mp-descrizione').trim();

    const filesObbligatori = Array.from(ge('mp-file').files || []);
    const filesExtra = Array.from(ge('mp-file-extra').files || []);
    const files = [...filesObbligatori, ...filesExtra];

    if (!titolo || !tipologia || !descrizione) {
      toast('Titolo, tipologia e descrizione sono obbligatori', 'err');
      return;
    }

    if (!id && filesObbligatori.length < 1) {
      toast('Devi selezionare almeno un allegato tecnico', 'err');
      return;
    }

    if (id && files.length === 0 && allegatiProgettoDati.length === 0) {
      toast('Devi allegare almeno un PDF, JPG/JPEG o PNG', 'err');
      return;
    }

    if (files.some(function(file) { return !fileProgettoValido(file); })) {
      toast('Formato non valido: carica solo PDF, JPG/JPEG, PNG o DWG', 'err');
      return;
    }

    if (files.some(function(file) { return file.size > 10 * 1024 * 1024; })) {
      toast('Un file supera il limite di 10 MB', 'err');
      return;
    }

    const { data: authData, error: authError } = await db.auth.getUser();

if (authError || !authData.user) {
  toast('Sessione utente non valida', 'err');
  return;
}

const authUserId = authData.user.id;

    const payload = {
      titolo: titolo,
      tipologia: tipologia,
      descrizione_tecnica: descrizione,
      materiali_note: v('mp-materiali').trim() || null
    };

    let progettoId = id;

    if (id) {
      const { data: progettoAttuale, error: erroreLettura } = await db
        .from('progetti_tecnici')
        .select('stato')
        .eq('id', id)
        .single();

      if (erroreLettura || !progettoAttuale) {
        toast('Impossibile leggere il progetto: ' + (erroreLettura?.message || ''), 'err');
        return;
      }

      if (progettoAttuale.stato === 'da_integrare') {
        payload.stato = 'bozza';
      }

      const { error } = await db
        .from('progetti_tecnici')
        .update(payload)
        .eq('id', id);

      if (error) {
        toast('Errore salvataggio: ' + error.message, 'err');
        return;
      }
    } else {
      payload.cliente_id = currentCliId;
      payload.rappresentante_id = authUserId;
      payload.stato = 'bozza';

      const { data, error } = await db
        .from('progetti_tecnici')
        .insert(payload)
        .select('id')
        .single();

      if (error || !data) {
        toast('Errore creazione progetto: ' + (error?.message || ''), 'err');
        return;
      }

      progettoId = data.id;
    }

  const utenteStorageId = authUserId;

    for (const file of files) {
  const nomeSicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

  const path =
    utenteStorageId + '/' +
    progettoId + '/' +
    Date.now() + '_' +
    nomeSicuro;

  const tipoFile = /\.dwg$/i.test(file.name)
    ? 'application/acad'
    : file.type;

  const { error: erroreUpload } = await db.storage
    .from('progetti-tecnici')
    .upload(path, file, {
      contentType: tipoFile,
      upsert: false
    });

  if (erroreUpload) {
    toast('Caricamento file non riuscito: ' + erroreUpload.message, 'err');
    return;
  }

  const { error: erroreAllegato } = await db
    .from('progetti_tecnici_allegati')
    .insert({
      progetto_id: progettoId,
      nome_file: file.name,
      storage_path: path,
      mime_type: tipoFile,
      dimensione: file.size,
      caricato_da: authUserId
    });

  if (erroreAllegato) {
    await db.storage.from('progetti-tecnici').remove([path]);
    toast('Errore salvataggio allegato: ' + erroreAllegato.message, 'err');
    return;
  }
}

    closeM('m-progetto');

    toast(
      id
        ? 'Modifiche e allegati salvati correttamente'
        : 'Progetto tecnico salvato correttamente',
      'ok'
    );

    await loadProgettiCliente(currentCliId);
    await loadPaginaProgetti();

  } finally {
    salvataggioProgettoInCorso = false;

    if (btn) {
      btn.disabled = false;
      btn.textContent = testoOriginale;
    }
  }
}

async function eliminaProgetto(progettoId) {
  if (ROLE !== 'titolare' && ROLE !== 'rappresentante') { 
    toast('Non hai i permessi per eliminare questo progetto tecnico', 'err');
    return;
  }

  const { count, error: errorePreventivi } = await db
    .from('preventivi')
    .select('id', { count: 'exact', head: true })
    .eq('progetto_tecnico_id', progettoId);

  if (errorePreventivi) {
    toast('Errore controllo preventivi: ' + errorePreventivi.message, 'err');
    return;
  }

  if (count > 0) {
    toast(
      'Questo progetto ha già un preventivo collegato. Elimina prima il preventivo.',
      'err'
    );
    return;
  }

  if (!confirm(
    'Eliminare definitivamente il progetto e tutti i suoi allegati?'
  )) {
    return;
  }

  const { data: allegati, error: erroreAllegati } = await db
    .from('progetti_tecnici_allegati')
    .select('storage_path')
    .eq('progetto_id', progettoId);

  if (erroreAllegati) {
    toast('Errore caricamento allegati: ' + erroreAllegati.message, 'err');
    return;
  }

  const { error: erroreProgetto } = await db
    .from('progetti_tecnici')
    .delete()
    .eq('id', progettoId);

  if (erroreProgetto) {
    toast('Errore eliminazione progetto: ' + erroreProgetto.message, 'err');
    return;
  }

  const percorsi = (allegati || [])
    .map(function(allegato) { return allegato.storage_path; })
    .filter(Boolean);

  if (percorsi.length) {
    const { error: erroreStorage } = await db.storage
      .from('progetti-tecnici')
      .remove(percorsi);

    if (erroreStorage) {
      console.warn(
        'Progetto eliminato, ma alcuni file sono rimasti nel bucket:',
        erroreStorage.message
      );
    }
  }

  toast('Progetto eliminato', 'ok');

  await loadProgettiDaPreventivare();

  if (currentCliId) {
    await loadProgettiCliente(currentCliId);
  }
}

async function inviaProgettoAUfficioTecnico(progettoId) {
  if (!confirm(
    'Inviare il progetto a ingegnere e titolare per la verifica tecnica? Dopo l’invio non sarà più una bozza.'
  )) {
    return;
  }

  const { data: allegati, error: erroreAllegati } = await db
    .from('progetti_tecnici_allegati')
    .select('id')
    .eq('progetto_id', progettoId);

  if (erroreAllegati) {
    toast('Errore verifica allegati: ' + erroreAllegati.message, 'err');
    return;
  }

  if (!allegati || allegati.length === 0) {
    toast('Non puoi inviare un progetto senza almeno un allegato', 'err');
    return;
  }

  const { error } = await db
    .from('progetti_tecnici')
    .update({
      stato: 'in_verifica_tecnica'
    })
    .eq('id', progettoId);

  if (error) {
    toast('Errore invio: ' + error.message, 'err');
    return;
  }

  toast('Progetto inviato all’ufficio tecnico', 'ok');

  await loadProgettiCliente(currentCliId);
  await loadPaginaProgetti();
}

async function inviaProgettoAlCommerciale(progettoId) {
  if (!confirm('Inviare il progetto al commerciale per il preventivo?')) {
    return;
  }

  const { data: allegati, error: erroreAllegati } = await db
    .from('progetti_tecnici_allegati')
    .select('id')
    .eq('progetto_id', progettoId);

  if (erroreAllegati || !allegati || allegati.length === 0) {
    toast('Non puoi inviare un progetto senza almeno un allegato', 'err');
    return;
  }

  const { error } = await db
    .from('progetti_tecnici')
    .update({
     stato: 'inviato_a_commerciale',
aggiornato_il: new Date().toISOString()
    })
    .eq('id', progettoId);

  if (error) {
    toast('Errore invio: ' + error.message, 'err');
    return;
  }

  toast('Progetto inviato al commerciale', 'ok');
  await loadProgettiCliente(currentCliId);
  await loadPaginaProgetti();
}

// ── PAGINA PROGETTI TECNICI ────────────────────────────────────
async function loadPaginaProgetti() {
  const box = ge('progetti-lista');

  if (!box) {
    console.error('Manca l’elemento HTML con id="progetti-lista"');
    return;
  }

  box.innerHTML = '<div class="load">Caricamento progetti...</div>';

  const { data, error } = await db
    .from('progetti_tecnici')
    .select('*, clienti(ragione_sociale)')
    .order('aggiornato_il', { ascending: false });

  if (error) {
    box.innerHTML =
      '<div class="al2 e">Errore nel caricamento: ' +
      esc(error.message) +
      '</div>';
    return;
  }

  if (!data?.length) {
    box.innerHTML =
      '<div class="empty">Nessun progetto tecnico creato.</div>';
    return;
  }

  const configurazioneStati = {
  bozza: {
    titolo: 'Bozze',
    etichetta: 'Bozza',
    classe: 'bblue'
  },

  in_verifica_tecnica: {
    titolo: 'In verifica tecnica',
    etichetta: 'In attesa della verifica tecnica',
    classe: 'berr'
  },

  da_integrare: {
    titolo: 'Progetti da integrare',
    etichetta: 'Da integrare',
    classe: 'bwarn'
  },

  pronto_per_preventivo: {
    titolo: 'Pronti per il preventivo',
    etichetta: 'Pronto per preventivo',
    classe: 'bok'
  },

  in_preventivazione: {
    titolo: 'Progetti in preventivazione',
    etichetta: 'In preventivazione',
    classe: 'bok'
  },

  inviato_a_commerciale: {
    titolo: 'Inviati al commerciale',
    etichetta: 'Inviato al commerciale',
    classe: 'bok'
  }
};

  const sezioni = [
  'bozza',
  'in_verifica_tecnica',
  'da_integrare',
  'in_preventivazione',
  'inviato_a_commerciale'
];

  function schedaProgetto(p) {
    const cliente = p.clienti?.ragione_sociale || 'Cliente non disponibile';

    const configurazione = configurazioneStati[p.stato] || {
      titolo: 'Altri progetti',
      etichetta: p.stato || 'Stato non definito',
      classe: 'bgray'
    };

    const puoRichiedereVerifica =
      p.stato === 'bozza' || p.stato === 'da_integrare';

    const puoInviareCommerciale =
      p.stato === 'bozza' ||
      p.stato === 'da_integrare' ||
      p.stato === 'pronto_per_preventivo';

    const nota = p.nota_integrazione || p.nota_verifica_tecnica;

    const autoreNota =
      p.integrazione_richiesta_da === 'commerciale'
        ? 'Nota del commerciale'
        : p.integrazione_richiesta_da === 'titolare'
          ? 'Nota del titolare'
          : 'Nota dell’ingegnere';

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div>
            <div style="font-size:14px;font-weight:700">
              ${esc(p.titolo || 'Progetto tecnico')}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${esc(cliente)} · ${esc(p.tipologia || 'Tipologia non indicata')}
            </div>
          </div>

          <span class="bx ${configurazione.classe}">
            ${esc(configurazione.etichetta)}
          </span>
        </div>

        <div style="font-size:13px;white-space:pre-wrap;margin-top:10px">
          ${esc(p.descrizione_tecnica || 'Nessuna descrizione inserita.')}
        </div>

        ${nota ? `
          <div class="al2 i" style="margin:10px 0">
            <b>🔧 ${esc(autoreNota)}</b><br>
            ${esc(nota)}
          </div>
        ` : ''}

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button
            class="btn sm"
            onclick="openProgettoDetail('${p.id}')"
          >
            Apri
          </button>

          <button
            class="btn sm info"
            onclick="apriProgettoDaElenco('${p.id}')"
          >
            Modifica
          </button>

          ${puoRichiedereVerifica ? `
            <button
              class="btn sm info"
              onclick="inviaProgettoAUfficioTecnico('${p.id}')"
            >
              🔧 Richiedi verifica tecnica
            </button>
          ` : ''}

          ${puoInviareCommerciale ? `
            <button
              class="btn sm info"
              onclick="inviaProgettoAlCommerciale('${p.id}')"
            >
              📤 Invia al commerciale
            </button>
          ` : ''}

          <button
            class="btn sm"
            style="color:var(--r)"
            onclick="eliminaProgetto('${p.id}')"
          >
            🗑 Elimina
          </button>
        </div>
      </div>
    `;
  }

  const sezioniCreate = new Set();

  box.innerHTML = sezioni.map(function(statoSezione) {
    const progetti = data.filter(function(p) {


      return p.stato === statoSezione;
    });

    if (!progetti.length) return '';

    sezioniCreate.add(statoSezione);

    const titolo = configurazioneStati[statoSezione].titolo;

    return `
      <div class="rap-section" style="margin-top:20px">
        ${esc(titolo)} <span style="color:var(--m)">(${progetti.length})</span>
      </div>

      ${progetti.map(schedaProgetto).join('')}
    `;
  }).join('');

  const altri = data.filter(function(p) {
    return ![
      'bozza',
      'da_integrare',
      'in_preventivazione',
      'in_verifica_tecnica',
      'inviato_a_commerciale'
    ].includes(p.stato);
  });

  if (altri.length) {
    box.innerHTML += `
      <div class="rap-section" style="margin-top:20px">
        Altri progetti <span style="color:var(--m)">(${altri.length})</span>
      </div>

      ${altri.map(schedaProgetto).join('')}
    `;
  }
}

async function loadProgettiDaPreventivare() {
  const box = ge('progetti-da-preventivare-lista');

  if (!box) return;

  box.innerHTML = '<div class="load">Caricamento progetti...</div>';

  const { data, error } = await db
    .from('progetti_tecnici')
    .select(`
      id,
      titolo,
      tipologia,
      descrizione_tecnica,
      nota_verifica_tecnica,
      creato_il,
      stato,
      cliente_id,
      rappresentante_id,
      clienti(ragione_sociale)
    `)
.in('stato', [
  'inviato_a_commerciale',
  'pronto_per_preventivo',
  'in_preventivazione'
])
    .order('creato_il', { ascending: false });

   if (error) {
    box.innerHTML =
      '<div class="al2 e">Errore nel caricamento: ' +
      esc(error.message) +
      '</div>';
    return;
  }

  const idsProgetti = (data || []).map(function(progetto) {
    return progetto.id;
  });

  let preventiviCollegati = [];

  if (idsProgetti.length) {
    const { data: righePreventivi, error: errorePreventivi } = await db
      .from('preventivi')
      .select('progetto_tecnico_id')
      .in('progetto_tecnico_id', idsProgetti);

    if (errorePreventivi) {
      box.innerHTML =
        '<div class="al2 e">Errore controllo preventivi: ' +
        esc(errorePreventivi.message) +
        '</div>';
      return;
    }

    preventiviCollegati = righePreventivi || [];
  }

  const progettiConPreventivo = new Set(
    preventiviCollegati
      .map(function(preventivo) {
        return preventivo.progetto_tecnico_id;
      })
      .filter(Boolean)
  );

  const progettiDaPreventivare = (data || []).filter(function(progetto) {
    return !progettiConPreventivo.has(progetto.id);
  });

  if (!progettiDaPreventivare.length) {
    box.innerHTML =
      '<div class="empty">🎉 Nessun progetto da preventivare al momento.</div>';
    return;
  }

  box.innerHTML = progettiDaPreventivare.map(function(p) {
    const cliente = p.clienti?.ragione_sociale || 'Cliente non disponibile';
    const inLavorazione = false;
    const dataInvio = p.creato_il
      ? new Date(p.creato_il).toLocaleDateString('it-IT')
      : '';

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div>
            <div style="font-size:15px;font-weight:700">
              ${esc(p.titolo)}
            </div>
            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${esc(cliente)} · ${esc(p.tipologia || 'Tipologia non indicata')}
            </div>
          </div>

          <span class="bx ${inLavorazione ? 'bok' : 'bblue'}">
  ${inLavorazione ? 'Preventivo in lavorazione' : 'Da preventivare'}
</span>
        </div>

        <div style="font-size:13px;white-space:pre-wrap;margin-top:10px">
          ${esc(p.descrizione_tecnica || 'Nessuna descrizione tecnica inserita.')}
        </div>

        ${p.nota_verifica_tecnica ? `
          <div class="al2 i" style="margin-top:10px">
            <b>🔧 Esito della verifica tecnica</b><br>
            ${esc(p.nota_verifica_tecnica)}
          </div>
        ` : ''}

        <div style="font-size:12px;color:var(--m);margin-top:10px">
          Ricevuto il ${esc(dataInvio)}
        </div>

   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
  <button
    class="btn sm"
    onclick="openProgettoDetail('${p.id}')"
  >
    📂 Apri progetto
  </button>

${!inLavorazione ? `
  <button
    class="btn sm"
    style="color:#b45309"
    onclick="apriIntegrazioneCommerciale('${p.id}')"
  >
    ↩ Richiedi integrazione
  </button>
` : ''}

<button
  class="btn sm p"
  onclick="avviaPreventivo('${p.id}')"
>
  ${inLavorazione ? '🧾 Apri preventivo' : '🧾 Avvia preventivo'}
</button>
${ROLE === 'titolare' ? `
  <button
    class="btn sm"
    style="color:var(--r)"
    onclick="eliminaProgetto('${p.id}')"
  >
    🗑️ Elimina progetto
  </button>
` : ''}
</div>
</div>
    `;
  }).join('');
}
function apriIntegrazioneCommerciale(progettoId) {
  ge('mic-progetto-id').value = progettoId;
  ge('mic-nota').value = '';
  openM('m-integrazione-commerciale');
}

async function inviaIntegrazioneCommerciale() {
  const progettoId = v('mic-progetto-id');
  const nota = v('mic-nota').trim();
  const destinatario = v('mic-destinatario');

  if (!nota) {
    toast('Scrivi le modifiche richieste', 'err');
    return;
  }

  const nuovoStato =
    destinatario === 'ingegnere'
      ? 'in_verifica_tecnica'
      : 'da_integrare';

  const { data, error } = await db
    .from('progetti_tecnici')
    .update({
      stato: nuovoStato,
      nota_integrazione: nota,
      integrazione_richiesta_da: ROLE, 
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', progettoId)
    .in('stato', [
  'inviato_a_commerciale',
  'pronto_per_preventivo',
  'in_preventivazione'
])
    .select('id');

  if (error || !data?.length) {
    toast(
      'Errore nel rinvio: ' +
      (error?.message || 'progetto non aggiornato'),
      'err'
    );
    return;
  }

  closeM('m-integrazione-commerciale');

  toast(
    destinatario === 'ingegnere'
      ? 'Progetto rimandato all’ingegnere'
      : 'Progetto rimandato al rappresentante',
    'ok'
  );

  await loadProgettiDaPreventivare();
}


async function avviaPreventivo(progettoId) {
  const paginaPreventivi =
    ROLE === 'titolare'
      ? 'preventivi-titolare'
      : 'preventivi';

  const { data: esistente, error: erroreEsistente } = await db
    .from('preventivi')
    .select('id, numero')
    .eq('progetto_tecnico_id', progettoId)
    .maybeSingle();

  if (erroreEsistente) {
    toast('Errore controllo preventivo: ' + erroreEsistente.message, 'err');
    return;
  }

  // Se il preventivo esiste già, il progetto non deve più restare
  // nella lista "Da preventivare".
  if (esistente) {
    const { error: erroreStato } = await db
      .from('progetti_tecnici')
      .update({
        stato: 'in_preventivazione',
        aggiornato_il: new Date().toISOString()
      })
      .eq('id', progettoId)
      .in('stato', [
        'inviato_a_commerciale',
        'pronto_per_preventivo', 
        'in_preventivazione'
      ]);

    if (erroreStato) {
      toast(
        'Errore spostamento progetto: ' + erroreStato.message,
        'err'
      );
      return;
    }

    toast(
      'Preventivo n. ' + esistente.numero + ' già presente',
      'ok'
    );

    gotoPage(paginaPreventivi);
    return;
  }

  const { data: progetto, error: erroreProgetto } = await db
    .from('progetti_tecnici')
    .select('id, cliente_id, rappresentante_id')
    .eq('id', progettoId)
    .single();

  if (erroreProgetto || !progetto) {
    toast(
      'Errore apertura progetto: ' +
      (erroreProgetto?.message || 'progetto non trovato'),
      'err'
    );
    return;
  }

  const scadenza = new Date();
  scadenza.setDate(scadenza.getDate() + 30);

  const { data: preventivo, error: erroreCreazione } = await db
    .from('preventivi')
    .insert({
      cliente_id: progetto.cliente_id,
      commerciale_id: ME.id,
      rappresentante_id: progetto.rappresentante_id || null,
      progetto_tecnico_id: progetto.id,
      tipo: 'fornitura_e_posa',
      origine: 'progetto_tecnico',
      data_scadenza: scadenza.toISOString().slice(0, 10),
      totale_imponibile: 0,
      sconto_perc: 0,
      iva_perc: 22,
      stato: 'bozza'
    })
    .select('id, numero')
    .single();

  if (erroreCreazione || !preventivo) {
    toast(
      'Errore creazione bozza: ' +
      (erroreCreazione?.message || 'preventivo non creato'),
      'err'
    );
    return;
  }

  const { data: progettoAggiornato, error: erroreStato } = await db
    .from('progetti_tecnici')
    .update({
      stato: 'in_preventivazione',
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', progettoId)
    .in('stato', [
      'inviato_a_commerciale',
      'pronto_per_preventivo', 
      'in_preventivazione'
    ])
    .select('id');

  if (erroreStato || !progettoAggiornato?.length) {
    // Elimina solo la bozza appena creata: evita preventivi scollegati.
    await db
      .from('preventivi')
      .delete()
      .eq('id', preventivo.id);

    toast(
      'Errore nel passaggio del progetto ai preventivi',
      'err'
    );
    return;
  }

  toast('Bozza preventivo n. ' + preventivo.numero + ' creata', 'ok');

  // Commerciale → Preventivi. Titolare → Preventivi da controllare.
  gotoPage(paginaPreventivi);
}

async function loadPreventivi() {
  const boxLista = ge('preventivi-lista');
  const boxInviati = ge('preventivi-inviati-lista');

  if (!boxLista || !boxInviati) return;

  boxLista.innerHTML = '<div class="load">Caricamento...</div>';
  boxInviati.innerHTML = '<div class="load">Caricamento...</div>';

  const { data: preventivi, error } = await db
    .from('preventivi')
    .select(`
      id,
      numero,
      cliente_id,
      progetto_tecnico_id,
      stato,
      tipo,
      data_scadenza,
      totale_imponibile,
      sconto_perc,
      iva_perc,
      creato_il,
      clienti(ragione_sociale)
    `)
    .eq('commerciale_id', ME.id)
    .order('creato_il', { ascending: false });

  if (error) {
    const messaggio = `
      <div class="al2 e">
        Errore caricamento preventivi: ${esc(error.message)}
      </div>
    `;

    boxLista.innerHTML = messaggio;
    boxInviati.innerHTML = '';
    return;
  }

  const bozze = (preventivi || []).filter(function(preventivo) {
    return preventivo.stato !== 'inviato_a_rappresentante';
  });

  const inviati = (preventivi || []).filter(function(preventivo) {
    return preventivo.stato === 'inviato_a_rappresentante';
  });

  function creaCardPreventivo(preventivo, inviato) {
    const cliente =
      preventivo.clienti?.ragione_sociale || 'Cliente non disponibile';

    const totale = Number(
      preventivo.totale_imponibile || 0
    ).toLocaleString('it-IT', {
      style: 'currency',
      currency: 'EUR'
    });

    const stato = inviato
      ? 'Inviato al rappresentante'
      : ({
          bozza: 'Bozza',
          in_attesa_approvazione: 'In attesa del titolare',
          approvato: 'Approvato dal titolare',
          inviato: 'Inviato al cliente',
          accettato: 'Accettato',
          rifiutato: 'Rifiutato',
          scaduto: 'Scaduto'
        }[preventivo.stato] || preventivo.stato || 'Bozza');

    return `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:10px">
          <div>
            <div style="font-size:14px;font-weight:700">
              Preventivo n. ${esc(String(preventivo.numero || '—'))}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${esc(cliente)} · ${esc(preventivo.tipo || 'Preventivo')}
            </div>
          </div>

          <span class="bx ${inviato ? 'bok' : 'bblue'}">
            ${esc(stato)}
          </span>
        </div>

        <div style="font-size:13px;margin-top:10px">
          Totale imponibile attuale: <b>${esc(totale)}</b>
        </div>

        ${preventivo.data_scadenza ? `
          <div style="font-size:12px;color:var(--m);margin-top:4px">
            Valido fino al ${esc(
              new Date(
                preventivo.data_scadenza + 'T00:00:00'
              ).toLocaleDateString('it-IT')
            )}
          </div>
        ` : ''}

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button
            class="btn sm p"
            onclick="openPreventivoDetail('${preventivo.id}')"
          >
            ${preventivo.stato === 'bozza'
              ? '✏️ Modifica bozza'
              : 'Apri preventivo'}
          </button>

          ${preventivo.stato === 'bozza' ? `
            <button
              class="btn sm"
              style="color:var(--r)"
              onclick="eliminaPreventivo('${preventivo.id}')"
            >
              🗑️ Elimina
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  boxLista.innerHTML = bozze.length
    ? bozze.map(function(preventivo) {
        return creaCardPreventivo(preventivo, false);
      }).join('')
    : '<div class="empty">Nessun preventivo da completare.</div>';

  boxInviati.innerHTML = inviati.length
    ? inviati.map(function(preventivo) {
        return creaCardPreventivo(preventivo, true);
      }).join('')
    : '<div class="empty">Nessun preventivo ancora inviato al rappresentante.</div>';
}

async function apriNuovoPreventivo(progettoId) {
  const { data: progetto, error } = await db
    .from('progetti_tecnici')
    .select(`
      id,
      titolo,
      tipologia,
      cliente_id,
      rappresentante_id,
      clienti(ragione_sociale)
    `)
    .eq('id', progettoId)
    .single();

  if (error || !progetto) {
    toast(
      'Errore apertura progetto: ' +
      (error?.message || 'progetto non trovato'),
      'err'
    );
    return;
  }

  const dataScadenza = new Date();
  dataScadenza.setDate(dataScadenza.getDate() + 30);

  ge('pv-progetto-id').value = progetto.id;
  ge('pv-cliente-id').value = progetto.cliente_id;
  ge('pv-rappresentante-id').value = progetto.rappresentante_id || '';
  ge('pv-tipo').value = 'fornitura_e_posa';
  ge('pv-scadenza').value = dataScadenza.toISOString().slice(0, 10);
  ge('pv-sconto').value = '0';
  ge('pv-iva').value = '22';
  ge('pv-note').value = '';

  ge('pv-riepilogo').innerHTML = `
    <b>${esc(progetto.titolo)}</b><br>
    ${esc(progetto.clienti?.ragione_sociale || 'Cliente non disponibile')}
    · ${esc(progetto.tipologia || 'Tipologia non indicata')}
  `;

  openM('m-nuovo-preventivo');
}

async function salvaNuovoPreventivo() {
  const progettoId = v('pv-progetto-id');
  const clienteId = v('pv-cliente-id');
  const rappresentanteId = v('pv-rappresentante-id') || null;
  const tipo = v('pv-tipo');
  const dataScadenza = v('pv-scadenza');
  const sconto = Number(v('pv-sconto') || 0);
  const iva = Number(v('pv-iva') || 22);
  const note = v('pv-note').trim() || null;

  if (!progettoId || !clienteId || !dataScadenza) {
    toast('Mancano progetto, cliente o data di validità', 'err');
    return;
  }

  if (sconto < 0 || sconto > 100 || iva < 0 || iva > 100) {
    toast('Sconto e IVA devono essere compresi tra 0 e 100', 'err');
    return;
  }

  const { data: esistenti, error: erroreControllo } = await db
    .from('preventivi')
    .select('id, numero')
    .eq('progetto_tecnico_id', progettoId)
    .limit(1);

  if (erroreControllo) {
    toast('Errore controllo preventivo: ' + erroreControllo.message, 'err');
    return;
  }

  if (esistenti && esistenti.length) {
    toast(
      'Esiste già il preventivo n. ' + esistenti[0].numero + ' per questo progetto',
      'err'
    );
    return;
  }

  const { data, error } = await db
    .from('preventivi')
    .insert({
      cliente_id: clienteId,
      commerciale_id: ME.id,
      rappresentante_id: rappresentanteId,
      progetto_tecnico_id: progettoId,
      tipo: tipo,
      origine: 'progetto_tecnico',
      data_scadenza: dataScadenza,
      totale_imponibile: 0,
      sconto_perc: sconto,
      iva_perc: iva,
      stato: 'bozza',
      note: note
    })
    .select('id, numero')
    .single();

  if (error) {
    toast('Errore creazione preventivo: ' + error.message, 'err');
    return;
  }
  const { error: erroreStatoProgetto } = await db
  .from('progetti_tecnici')
  .update({
    stato: 'in_preventivazione'
  })
  .eq('id', progettoId)
  .eq('stato', 'inviato_a_commerciale');

if (erroreStatoProgetto) {
  // La bozza era stata creata, ma non deve restare senza progetto associato.
  await db
    .from('preventivi')
    .delete()
    .eq('id', data.id);

  toast(
    'Errore nel passaggio del progetto ai preventivi: ' +
    (erroreStatoProgetto.message || 'progetto non aggiornato perché non era nello stato previsto'),
    'err'
  );
  return;
}

  closeM('m-nuovo-preventivo');
  toast('Bozza preventivo n. ' + data.numero + ' creata', 'ok');
  await loadPreventivi();
}

let selezioniFornitoriDati = [];

async function loadPreventivazione() {
  const box = ge('preventivazione-lista');
  if (!box) return;

  box.innerHTML = '<div class="load">Caricamento progetti...</div>';

  const risultati = await Promise.all([
    db
      .from('progetti_tecnici')
      .select(`
        id,
        titolo,
        tipologia,
        descrizione_tecnica,
        cliente_id,
        clienti(ragione_sociale)
      `)
      .eq('stato', 'in_preventivazione')
      .order('creato_il', { ascending: false }),

    db
      .from('progetti_tecnici_fornitori')
      .select(`
        progetto_tecnico_id,
        tipologia,
        stato,
        fornitori(ragione_sociale)
      `)
      .neq('stato', 'scartato')
  ]);

  const progettiRes = risultati[0];
  const selezioniRes = risultati[1];

  if (progettiRes.error || selezioniRes.error) {
    box.innerHTML =
      '<div class="al2 e">Errore caricamento: ' +
      esc(progettiRes.error?.message || selezioniRes.error?.message) +
      '</div>';
    return;
  }

  const selezioniPerProgetto = {};

  (selezioniRes.data || []).forEach(function(s) {
    if (!selezioniPerProgetto[s.progetto_tecnico_id]) {
      selezioniPerProgetto[s.progetto_tecnico_id] = [];
    }

    selezioniPerProgetto[s.progetto_tecnico_id].push(s);
  });

  const progetti = progettiRes.data || [];

  if (!progetti.length) {
    box.innerHTML =
      '<div class="empty">Nessun progetto in preventivazione.</div>';
    return;
  }

  box.innerHTML = progetti.map(function(p) {
    const cliente = p.clienti?.ragione_sociale || 'Cliente non disponibile';
    const selezioni = selezioniPerProgetto[p.id] || [];

    const fornitoriScelti = selezioni.length
      ? selezioni.map(function(s) {
          return `
            <span class="bx bblue">
              ${esc(s.tipologia)}: ${esc(s.fornitori?.ragione_sociale || 'Fornitore')}
            </span>
          `;
        }).join(' ')
      : '<span style="font-size:12px;color:var(--m)">Nessun fornitore selezionato.</span>';

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="font-size:15px;font-weight:700">
          ${esc(p.titolo)}
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          ${esc(cliente)} · ${esc(p.tipologia || 'Tipologia non indicata')}
        </div>

        ${p.descrizione_tecnica ? `
          <div style="font-size:13px;margin-top:10px;white-space:pre-wrap">
            ${esc(p.descrizione_tecnica)}
          </div>
        ` : ''}

        <div style="margin-top:12px">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px">
            Fornitori selezionati
          </div>

          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${fornitoriScelti}
          </div>
        </div>

        <button
          class="btn sm p"
          style="margin-top:14px"
          onclick="apriSelezioneFornitori('${p.id}')"
        >
          🏭 Gestisci fornitori
        </button>
      </div>
    `;
  }).join('');
}

async function apriSelezioneFornitori(progettoId) {
  const { data: progetto, error } = await db
    .from('progetti_tecnici')
    .select('id,titolo,tipologia,clienti(ragione_sociale)')
    .eq('id', progettoId)
    .single();

  if (error || !progetto) {
    toast(
      'Errore apertura progetto: ' +
      (error?.message || 'progetto non trovato'),
      'err'
    );
    return;
  }

  ge('sf-progetto-id').value = progetto.id;
  ge('sf-tipologia').value = progetto.tipologia || '';

  ge('sf-riepilogo').innerHTML = `
    <b>${esc(progetto.titolo)}</b><br>
    ${esc(progetto.clienti?.ragione_sociale || 'Cliente non disponibile')}
  `;

  openM('m-seleziona-fornitori');

  await caricaFornitoriSelezionati();
  await caricaFornitoriSelezionabili();
}

async function caricaFornitoriSelezionati() {
  const progettoId = v('sf-progetto-id');
  const box = ge('sf-selezionati');

  if (!progettoId || !box) return;

  const { data, error } = await db
    .from('progetti_tecnici_fornitori')
    .select(`
      id,
      fornitore_id,
      fornitore_tipologia_id,
      tipologia,
      stato,
      note,
      fornitori(ragione_sociale)
    `)
    .eq('progetto_tecnico_id', progettoId)
    .neq('stato', 'scartato')
    .order('tipologia');

  if (error) {
    box.innerHTML =
      '<div class="al2 e">Errore: ' + esc(error.message) + '</div>';
    return;
  }

  selezioniFornitoriDati = data || [];

  if (!selezioniFornitoriDati.length) {
    box.innerHTML =
      '<div class="empty">Nessun fornitore selezionato per ora.</div>';
    return;
  }

  box.innerHTML = selezioniFornitoriDati.map(function(s) {
    return `
      <div class="card" style="margin-bottom:8px;padding:12px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div>
            <b>${esc(s.fornitori?.ragione_sociale || 'Fornitore')}</b>
            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${esc(s.tipologia)} · ${esc(s.stato)}
            </div>
          </div>

          <button
            class="btn sm"
            style="color:var(--r)"
            onclick="rimuoviFornitoreDaProgetto('${s.id}')"
          >
            Rimuovi
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function caricaFornitoriSelezionabili() {
  const box = ge('sf-disponibili');
  const ricerca = v('sf-tipologia').trim();

  if (!box) return;

  box.innerHTML = '<div class="load">Ricerca fornitori...</div>';

  let query = db
    .from('fornitore_tipologie')
    .select('*, fornitori(*)')
    .eq('attivo', true)
    .order('tipologia');

  if (ricerca) {
    query = query.ilike('tipologia', '%' + ricerca + '%');
  }

  const { data, error } = await query;

  if (error) {
    box.innerHTML =
      '<div class="al2 e">Errore: ' + esc(error.message) + '</div>';
    return;
  }

const disponibili = (data || [])
  .filter(function(t) {
    return t.fornitori && t.fornitori.attivo !== false;
  })
  .sort(function(a, b) {
    return (a.fornitori?.ragione_sociale || '').localeCompare(
      b.fornitori?.ragione_sociale || '',
      'it',
      { sensitivity: 'base' }
    );
  });


  if (!disponibili.length) {
    box.innerHTML = ricerca
      ? '<div class="empty">Nessun fornitore trovato per questa tipologia.</div>'
      : '<div class="empty">Scrivi una tipologia per cercare i fornitori.</div>';
    return;
  }

  box.innerHTML = disponibili.map(function(t) {
    const giaScelto = selezioniFornitoriDati.some(function(s) {
      return (
        s.fornitore_id === t.fornitore_id &&
        s.tipologia.toLowerCase() === t.tipologia.toLowerCase()
      );
    });

  const limiteRaggiunto = selezioniFornitoriDati.length >= 2;

    return `
      <div class="card" style="margin-bottom:8px;padding:12px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div>
            <div style="font-size:14px;font-weight:700">
              ${esc(t.fornitori.ragione_sociale)}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${esc(t.tipologia)}
              ${t.pronta_consegna ? ' · pronta consegna ' + esc(t.pronta_consegna) : ''}
              ${t.tempi_consegna ? ' · consegna ' + esc(t.tempi_consegna) : ''}
            </div>
          </div>

          <button
            class="btn sm p"
            ${giaScelto || limiteRaggiunto ? 'disabled' : ''}
            onclick="selezionaFornitoreProgetto(
              '${t.fornitore_id}',
              '${t.id}',
              '${esc(t.tipologia)}'
            )"
          >
            ${giaScelto ? 'Selezionato' : limiteRaggiunto ? 'Limite raggiunto' : 'Seleziona'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function selezionaFornitoreProgetto(
  fornitoreId,
  fornitoreTipologiaId,
  tipologia
) {
  const progettoId = v('sf-progetto-id');

  const { error } = await db
    .from('progetti_tecnici_fornitori')
    .insert({
      progetto_tecnico_id: progettoId,
      fornitore_id: fornitoreId,
      fornitore_tipologia_id: fornitoreTipologiaId,
      tipologia: tipologia,
      stato: 'selezionato',
      selezionato_da: ME.id
    });

  if (error) {
    toast('Errore selezione fornitore: ' + error.message, 'err');
    return;
  }

  toast('Fornitore selezionato', 'ok');
  await caricaFornitoriSelezionati();
  await caricaFornitoriSelezionabili();
  await loadPreventivazione();
}

async function rimuoviFornitoreDaProgetto(selezioneId) {
  if (!confirm('Rimuovere questo fornitore dal progetto?')) return;

  const { error } = await db
    .from('progetti_tecnici_fornitori')
    .delete()
    .eq('id', selezioneId);

  if (error) {
    toast('Errore rimozione fornitore: ' + error.message, 'err');
    return;
  }

  toast('Fornitore rimosso', 'ok');
  await caricaFornitoriSelezionati();
  await caricaFornitoriSelezionabili();
  await loadPreventivazione();
}


let currentFornitoreId = null;

async function openFornitoreDetail(fornitoreId) {
  const { data: fornitore, error } = await db
    .from('fornitori')
    .select('*, fornitore_tipologie(*)')
    .eq('id', fornitoreId)
    .single();

  if (error || !fornitore) {
    toast(
      'Errore apertura fornitore: ' +
      (error?.message || 'fornitore non trovato'),
      'err'
    );
    return;
  }

  currentFornitoreId = fornitore.id;

  ge('fd-nome').textContent = fornitore.ragione_sociale || 'Fornitore';
  ge('fd-btn-modifica').style.display =
    ROLE === 'commerciale' || ROLE === 'titolare' ? '' : 'none';

  gotoPage('fornitore-detail');

  const pagina = ge('pg-fornitore-detail');

  pagina.querySelectorAll('.tab').forEach(function(tab, indice) {
    tab.classList.toggle('on', indice === 0);
  });

  pagina.querySelectorAll('.tc').forEach(function(tab, indice) {
    tab.classList.toggle('on', indice === 0);
  });

  ge('fd-anagrafica-content').innerHTML = `
    <div class="g2" style="margin-bottom:16px">
      ${ir('Ragione sociale', fornitore.ragione_sociale)}
      ${ir('Referente', fornitore.referente)}
      ${ir('Telefono', fornitore.telefono)}
      ${ir('Email', fornitore.email)}
      ${ir('Indirizzo', fornitore.indirizzo)}
      ${ir('Stato', fornitore.attivo === false ? 'Non attivo' : 'Attivo')}
    </div>
  `;

  const tipologie = fornitore.fornitore_tipologie || [];

  ge('fd-tipologie-content').innerHTML = !tipologie.length
    ? '<div class="empty">Nessuna tipologia o valutazione inserita.</div>'
    : `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
        ${tipologie.map(function(t) {
          return `
            <div class="pc">
              <div style="font-size:14px;font-weight:700;margin-bottom:10px">
                ${esc(t.tipologia || 'Tipologia')}
              </div>

              <div style="font-size:12px;display:flex;flex-direction:column;gap:6px">
                <div style="display:flex;justify-content:space-between;gap:8px">
                  <span style="color:var(--m)">Pronta consegna</span>
                  <span>${esc(t.pronta_consegna || '—')}</span>
                </div>

                <div style="display:flex;justify-content:space-between;gap:8px">
                  <span style="color:var(--m)">Tempi consegna</span>
                  <span>${esc(t.tempi_consegna || '—')}</span>
                </div>

                <div style="display:flex;justify-content:space-between;gap:8px">
                  <span style="color:var(--m)">Gestione ordine</span>
                  <span>${esc(t.gestione_ordine || '—')}</span>
                </div>

                <div style="display:flex;justify-content:space-between;gap:8px">
                  <span style="color:var(--m)">Varietà catalogo</span>
                  <span>${esc(t.varieta_catalogo || '—')}</span>
                </div>

                <div style="display:flex;justify-content:space-between;gap:8px">
                  <span style="color:var(--m)">Risposta preventivi</span>
                  <span>${esc(t.tempi_preventivo || '—')}</span>
                </div>
              </div>

              ${t.note ? `
                <div style="margin-top:12px;padding:10px;background:var(--bg);border-radius:var(--rs);font-size:12px">
                  ${esc(t.note)}
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;

  ge('fd-note-content').innerHTML = fornitore.note
    ? `
      <div class="card" style="white-space:pre-wrap">
        ${esc(fornitore.note)}
      </div>
    `
    : '<div class="empty">Nessuna nota generale sul fornitore.</div>';
}

function modificaFornitoreDaScheda() {
  if (!currentFornitoreId) return;
  apriFornitore(currentFornitoreId, true);
}

let fornitoriDati = [];



async function loadFornitori() {
  const box = ge('fornitori-lista');
  const btnNuovo = ge('btn-nuovo-fornitore');

  if (!box) return;

  if (btnNuovo) {
    btnNuovo.style.display =
      ROLE === 'commerciale' || ROLE === 'titolare' ? '' : 'none';
  }

  box.innerHTML = '<div class="load">Caricamento fornitori...</div>';

const { data, error } = await db
  .from('fornitori')
  .select('*, fornitore_tipologie(*)')
  .eq('attivo', true)
  .order('ragione_sociale', { ascending: true });

  if (error) {
    box.innerHTML =
      '<div class="al2 e">Errore nel caricamento: ' +
      esc(error.message) +
      '</div>';
    return;
  }

  fornitoriDati = data || [];
  renderFornitori(fornitoriDati);
}

function filtraFornitori(testo) {
  const ricerca = (testo || '').trim().toLowerCase();

  if (!ricerca) {
    renderFornitori(fornitoriDati);
    return;
  }

  const filtrati = fornitoriDati.filter(function(f) {
    const testata = [
      f.ragione_sociale,
      f.referente,
      f.telefono,
      f.email
    ].join(' ').toLowerCase();

    const tipologie = (f.fornitore_tipologie || [])
      .map(function(t) {
        return [
          t.tipologia,
          t.pronta_consegna,
          t.tempi_consegna,
          t.gestione_ordine,
          t.varieta_catalogo,
          t.tempi_preventivo
        ].join(' ');
      })
      .join(' ')
      .toLowerCase();

    return testata.includes(ricerca) || tipologie.includes(ricerca);
  });

  renderFornitori(filtrati);
}

function renderFornitori(lista) {
  const box = ge('fornitori-lista');
  if (!box) return;

  if (!lista.length) {
    box.innerHTML =
      '<div class="empty">Nessun fornitore inserito.</div>';
    return;
  }

  box.innerHTML = lista.map(function(f) {
    const tipologie = (f.fornitore_tipologie || [])
      .filter(function(t) { return t.attivo !== false; });

    const tagTipologie = tipologie.length
      ? tipologie.map(function(t) {
          return '<span class="bx bblue">' +
            esc(t.tipologia || 'Tipologia') +
            '</span>';
        }).join(' ')
      : '<span style="font-size:12px;color:var(--m)">Nessuna tipologia inserita</span>';

    const recap = tipologie.length
      ? tipologie.map(function(t) {
          const parti = [];

          if (t.pronta_consegna) {
            parti.push('Pronta consegna: ' + t.pronta_consegna);
          }

          if (t.tempi_consegna) {
            parti.push('Consegna: ' + t.tempi_consegna);
          }

          if (t.tempi_preventivo) {
            parti.push('Preventivi: ' + t.tempi_preventivo);
          }

          return parti.join(' · ');
        }).filter(Boolean).join('<br>')
      : '';

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div>
            <div style="font-size:15px;font-weight:700">
              ${esc(f.ragione_sociale)}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:4px">
              ${f.referente ? esc(f.referente) : 'Referente non indicato'}
              ${f.telefono ? ' · ' + esc(f.telefono) : ''}
              ${f.email ? ' · ' + esc(f.email) : ''}
            </div>
          </div>

          <span class="bx ${f.attivo === false ? 'bred' : 'bgreen'}">
            ${f.attivo === false ? 'Non attivo' : 'Attivo'}
          </span>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
          ${tagTipologie}
        </div>

        ${recap ? `
          <div style="font-size:12px;color:var(--m);margin-top:10px">
            ${recap}
          </div>
        ` : ''}

       <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
  <button
    class="btn sm"
    onclick="openFornitoreDetail('${f.id}')"
  >
    Scheda
  </button>

  ${(ROLE === 'commerciale' || ROLE === 'titolare') ? `
    <button
      class="btn sm info"
      onclick="apriFornitore('${f.id}', true)"
    >
      Modifica
    </button>
  ` : ''}

  ${ROLE === 'commerciale' ? `
  <button
    class="btn sm danger"
    onclick="eliminaFornitore('${f.id}')"
  >
    🗑 Elimina
  </button>
` : ''}
</div>
      </div>
    `;
  }).join('');
}

function openNuovoFornitore() {
  if (ROLE !== 'commerciale' && ROLE !== 'titolare') {
    toast('Non hai i permessi per aggiungere fornitori', 'err');
    return;
  }

  ge('mf-titolo').textContent = 'Nuovo fornitore';
  ge('mf-id').value = '';
  ge('mft-id').value = '';

  ge('mf-ragione-sociale').value = '';
  ge('mf-referente').value = '';
  ge('mf-telefono').value = '';
  ge('mf-email').value = '';
  ge('mf-indirizzo').value = '';
  ge('mf-note').value = '';

  ge('mft-tipologia').value = '';
  ge('mft-pronta-consegna').value = '';
  ge('mft-tempi-consegna').value = '';
  ge('mft-gestione-ordine').value = '';
  ge('mft-varieta-catalogo').value = '';
  ge('mft-tempi-preventivo').value = '';
  ge('mft-note').value = '';

  abilitaModificaFornitore(true);

  ge('mf-azioni').innerHTML = `
    <button class="btn" onclick="closeM('m-fornitore')">Annulla</button>
    <button class="btn p" onclick="salvaFornitore()">Salva fornitore</button>
  `;

  openM('m-fornitore');
}

async function apriFornitore(fornitoreId, modalitaModifica) {
  const { data: fornitore, error } = await db
    .from('fornitori')
    .select('*, fornitore_tipologie(*)')
    .eq('id', fornitoreId)
    .single();

  if (error || !fornitore) {
    toast(
      'Errore apertura fornitore: ' +
      (error?.message || 'fornitore non trovato'),
      'err'
    );
    return;
  }

  const tipo = (fornitore.fornitore_tipologie || [])[0] || {};

  ge('mf-titolo').textContent = fornitore.ragione_sociale;
  ge('mf-id').value = fornitore.id;
  ge('mft-id').value = tipo.id || '';

  ge('mf-ragione-sociale').value = fornitore.ragione_sociale || '';
  ge('mf-referente').value = fornitore.referente || '';
  ge('mf-telefono').value = fornitore.telefono || '';
  ge('mf-email').value = fornitore.email || '';
  ge('mf-indirizzo').value = fornitore.indirizzo || '';
  ge('mf-note').value = fornitore.note || '';

  ge('mft-tipologia').value = tipo.tipologia || '';
  ge('mft-pronta-consegna').value = tipo.pronta_consegna || '';
  ge('mft-tempi-consegna').value = tipo.tempi_consegna || '';
  ge('mft-gestione-ordine').value = tipo.gestione_ordine || '';
  ge('mft-varieta-catalogo').value = tipo.varieta_catalogo || '';
  ge('mft-tempi-preventivo').value = tipo.tempi_preventivo || '';
  ge('mft-note').value = tipo.note || '';

  const puoModificare =
  modalitaModifica === true &&
  (ROLE === 'commerciale' || ROLE === 'titolare');
  abilitaModificaFornitore(puoModificare);

  ge('mf-azioni').innerHTML = puoModificare
    ? `
      <button class="btn" onclick="closeM('m-fornitore')">Annulla</button>
      <button class="btn p" onclick="salvaFornitore()">Salva modifiche</button>
    `
    : `
      <button class="btn" onclick="closeM('m-fornitore')">Chiudi</button>
    `;

  openM('m-fornitore');
}

function abilitaModificaFornitore(abilitato) {
  [
    'mf-ragione-sociale',
    'mf-referente',
    'mf-telefono',
    'mf-email',
    'mf-indirizzo',
    'mf-note',
    'mft-tipologia',
    'mft-pronta-consegna',
    'mft-tempi-consegna',
    'mft-gestione-ordine',
    'mft-varieta-catalogo',
    'mft-tempi-preventivo',
    'mft-note'
  ].forEach(function(id) {
    const campo = ge(id);
    if (campo) campo.disabled = !abilitato;
  });
}

async function salvaFornitore() {
  const fornitoreId = v('mf-id');
  const tipoId = v('mft-id');

  const ragioneSociale = v('mf-ragione-sociale').trim();
  const tipologia = v('mft-tipologia').trim();

  if (!ragioneSociale || !tipologia) {
    toast('Ragione sociale e tipologia sono obbligatorie', 'err');
    return;
  }

  const datiFornitore = {
    ragione_sociale: ragioneSociale,
    referente: v('mf-referente').trim() || null,
    telefono: v('mf-telefono').trim() || null,
    email: v('mf-email').trim() || null,
    indirizzo: v('mf-indirizzo').trim() || null,
    note: v('mf-note').trim() || null,
    aggiornato_il: new Date().toISOString()
  };

  let idFinale = fornitoreId;

  if (fornitoreId) {
    const { error } = await db
      .from('fornitori')
      .update(datiFornitore)
      .eq('id', fornitoreId);

    if (error) {
      toast('Errore salvataggio fornitore: ' + error.message, 'err');
      return;
    }
  } else {
    datiFornitore.creato_da = ME.id;

    const { data, error } = await db
      .from('fornitori')
      .insert(datiFornitore)
      .select('id')
      .single();

    if (error) {
      toast('Errore creazione fornitore: ' + error.message, 'err');
      return;
    }

    idFinale = data.id;
  }

  const datiTipologia = {
    fornitore_id: idFinale,
    tipologia: tipologia,
    pronta_consegna: v('mft-pronta-consegna') || null,
    tempi_consegna: v('mft-tempi-consegna') || null,
    gestione_ordine: v('mft-gestione-ordine') || null,
    varieta_catalogo: v('mft-varieta-catalogo') || null,
    tempi_preventivo: v('mft-tempi-preventivo') || null,
    note: v('mft-note').trim() || null,
    aggiornato_il: new Date().toISOString()
  };

  const rispostaTipologia = tipoId
    ? await db
        .from('fornitore_tipologie')
        .update(datiTipologia)
        .eq('id', tipoId)
    : await db
        .from('fornitore_tipologie')
        .insert(datiTipologia);

  if (rispostaTipologia.error) {
    toast(
      'Fornitore salvato, ma errore nella tipologia: ' +
      rispostaTipologia.error.message,
      'err'
    );
    return;
  }

  closeM('m-fornitore');
  toast('Fornitore salvato', 'ok');
  await loadFornitori();
}


let currentProgettoTecnicoId = null;

function dimensioneFileProgetto(bytes) {
  if (!bytes) return 'Dimensione non disponibile';

  if (bytes < 1024 * 1024) {
    return Math.round(bytes / 1024) + ' KB';
  }

  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function openProgettoDetail(progettoId) {
    const paginaAttuale = document
    .querySelector('.page.on')
    ?.id
    ?.replace('pg-', '');

  if (paginaAttuale && paginaAttuale !== 'progetto-detail') {
    paginaPrecedenteProgetto = paginaAttuale;
  }
  const { data: progetto, error } = await db
    .from('progetti_tecnici')
    .select('*, clienti(ragione_sociale)')
    .eq('id', progettoId)
    .single();

  if (error || !progetto) {
    toast(
      'Errore apertura progetto: ' +
      (error?.message || 'progetto non trovato'),
      'err'
    );
    return;
  }

  currentProgettoTecnicoId = progetto.id;

  const stato = {
    bozza: 'Bozza',
    in_verifica_tecnica: 'In verifica tecnica',
    da_integrare: 'Integrazione richiesta',
    inviato_a_commerciale: 'Inviato al commerciale',
    in_preventivazione: 'In preventivazione'
  }[progetto.stato] || progetto.stato || '—';

  ge('pd-nome').textContent = progetto.titolo || 'Progetto tecnico';
  const btnModifica = ge('pd-btn-modifica');

if (btnModifica) {
  btnModifica.style.display =
    ROLE === 'rappresentante' ? '' : 'none';
}

  gotoPage('progetto-detail');

  const pagina = ge('pg-progetto-detail');

  pagina.querySelectorAll('.tab').forEach(function(tab, indice) {
    tab.classList.toggle('on', indice === 0);
  });

  pagina.querySelectorAll('.tc').forEach(function(tab, indice) {
    tab.classList.toggle('on', indice === 0);
  });

  ge('pd-info-content').innerHTML = `
    <div class="g2" style="margin-bottom:16px">
      ${ir('Cliente', progetto.clienti?.ragione_sociale)}
      ${ir('Tipologia', progetto.tipologia)}
      ${ir('Stato', stato)}
      ${ir(
        'Creato il',
        progetto.creato_il
          ? new Date(progetto.creato_il).toLocaleDateString('it-IT')
          : null
      )}
    </div>

    <div style="font-size:13px;font-weight:600;margin:16px 0 8px">
      Descrizione / studio tecnico
    </div>

    <div class="card" style="white-space:pre-wrap">
      ${esc(progetto.descrizione_tecnica || 'Nessuna descrizione inserita.')}
    </div>

    ${progetto.materiali_note ? `
      <div style="font-size:13px;font-weight:600;margin:16px 0 8px">
        Materiali necessari
      </div>

      <div class="card" style="white-space:pre-wrap">
        ${esc(progetto.materiali_note)}
      </div>
    ` : ''}
  `;

  const { data: allegati, error: erroreAllegati } = await db
    .from('progetti_tecnici_allegati')
    .select('id,nome_file,storage_path,mime_type,dimensione,caricato_il')
    .eq('progetto_id', progetto.id)
    .order('caricato_il', { ascending: false });

  if (erroreAllegati) {
    ge('pd-file-content').innerHTML =
      '<div class="al2 e">Errore caricamento file: ' +
      esc(erroreAllegati.message) +
      '</div>';
  } else if (!allegati || !allegati.length) {
    ge('pd-file-content').innerHTML =
      '<div class="empty">Nessun allegato disponibile.</div>';
  } else {
    const fileConLink = await Promise.all(
      allegati.map(async function(allegato) {
        const { data } = await db.storage
          .from('progetti-tecnici')
          .createSignedUrl(allegato.storage_path, 3600);

        return {
          ...allegato,
          url: data?.signedUrl || null
        };
      })
    );

    ge('pd-file-content').innerHTML = fileConLink.map(function(file) {
      return `
        <div class="card" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center">
            <div style="min-width:0">
              <div style="font-size:13px;font-weight:700;overflow-wrap:anywhere">
                📎 ${esc(file.nome_file)}
              </div>

              <div style="font-size:12px;color:var(--m);margin-top:4px">
                ${esc(file.mime_type || 'File')}
                · ${esc(dimensioneFileProgetto(file.dimensione))}
              </div>
            </div>

            ${file.url ? `
              <a
                class="btn sm p"
                href="${file.url}"
                target="_blank"
                rel="noopener"
              >
                Apri file
              </a>
            ` : `
              <span style="font-size:12px;color:var(--r)">
                File non disponibile
              </span>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  await renderSchedeProgettoCommerciale(progetto.id);
  const { data: cronologia, error: erroreCronologia } = await db
    .from('progetti_tecnici_storico')
    .select(`
      id,
      tipo_evento,
      descrizione,
      stato_precedente,
      stato_successivo,
      creato_il,
      utenti!progetti_tecnici_storico_eseguito_da_fkey(
        nome,
        cognome,
        ruolo
      )
    `)
    .eq('progetto_id', progetto.id)
    .order('creato_il', { ascending: false });

  if (erroreCronologia) {
    ge('pd-cronologia-content').innerHTML =
      '<div class="al2 e">Errore cronologia: ' +
      esc(erroreCronologia.message) +
      '</div>';
  } else if (!cronologia || !cronologia.length) {
    ge('pd-cronologia-content').innerHTML =
      '<div class="empty">Nessuna attività registrata per ora.</div>';
  } else {
    ge('pd-cronologia-content').innerHTML = cronologia.map(function(evento) {
      const utente = evento.utenti;
      const autore = utente
        ? [utente.nome, utente.cognome].filter(Boolean).join(' ')
        : 'Utente non disponibile';

      const dataOra = evento.creato_il
        ? new Date(evento.creato_il).toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '—';

      const icona = {
        progetto_creato: '✨',
        progetto_modificato: '✏️',
        stato_modificato: '📤',
        allegato_aggiunto: '📎'
      }[evento.tipo_evento] || '•';

      return `
        <div
          style="
            display:flex;
            gap:10px;
            padding:12px 0;
            border-bottom:1px solid var(--br)
          "
        >
          <div style="font-size:18px">${icona}</div>

          <div style="min-width:0">
            <div style="font-size:13px;font-weight:600">
              ${esc(evento.descrizione)}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${esc(dataOra)}
              · ${esc(autore)}
              ${utente?.ruolo ? ' · ' + esc(utente.ruolo) : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  const nota = progetto.nota_integrazione || progetto.nota_verifica_tecnica;
  const autore = progetto.integrazione_richiesta_da === 'commerciale'
    ? 'Nota del commerciale'
    : progetto.nota_verifica_tecnica
      ? 'Nota dell’ingegnere'
      : 'Note';

  ge('pd-verifica-content').innerHTML = nota
    ? `
      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px">
          🔧 ${esc(autore)}
        </div>

        <div style="white-space:pre-wrap">
          ${esc(nota)}
        </div>
      </div>
    `
    : '<div class="empty">Nessuna nota di verifica o integrazione.</div>';
}

function tornaDaSchedaProgetto() {
  const pagineConsentite = PAGINE_RUOLO[ROLE] || [];

  if (
    paginaPrecedenteProgetto &&
    paginaPrecedenteProgetto !== 'progetto-detail' &&
    pagineConsentite.includes(paginaPrecedenteProgetto)
  ) {
    gotoPage(paginaPrecedenteProgetto);
    return;
  }

  if (ROLE === 'commerciale' || ROLE === 'titolare') {
    gotoPage('progetti-da-preventivare');
    return;
  }

  if (ROLE === 'ingegnere') {
    gotoPage('verifiche-tecniche');
    return;
  }

  gotoPage('progetti');
}


function schedaHaDatiCommerciali(scheda) {
  const dati = scheda?.dati_commerciali;

  return !!dati &&
    Object.keys(dati).some(function(chiave) {
      return dati[chiave] !== null &&
        dati[chiave] !== undefined &&
        dati[chiave] !== '';
    });
}

function datiSchedaDaMostrare(scheda) {
  return schedaHaDatiCommerciali(scheda)
    ? scheda.dati_commerciali
    : (scheda.dati || {});
}

async function renderSchedeProgettoCommerciale(progettoId) {
  const box = ge('pd-schede-content');

  if (!box) return;

  box.innerHTML =
    '<div class="load">Caricamento rilievi tecnici...</div>';

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select(`
      id,
      famiglia,
      dati,
      dati_commerciali,
      stato,
      compilato_da,
      aggiornato_il,
      ultima_modifica_commerciale_il,
      utenti!progetti_tecnici_schede_compilato_da_fkey(
        nome,
        cognome
      )
    `)
    .eq('progetto_tecnico_id', progettoId)
    .order('aggiornato_il', { ascending: false });

  if (error) {
    box.innerHTML = `
      <div class="al2 e">
        Errore caricamento rilievi: ${esc(error.message)}
      </div>
    `;
    return;
  }

  if (!data || !data.length) {
    box.innerHTML = `
      <div class="empty">
        L’ingegnere non ha ancora compilato rilievi tecnici.
      </div>
    `;
    return;
  }

  box.innerHTML = data.map(function(scheda) {
    const modificataCommerciale = schedaHaDatiCommerciali(scheda);
    const datiVisualizzati = datiSchedaDaMostrare(scheda);

    const campi = Object.entries(datiVisualizzati).filter(function(entry) {
      const valore = entry[1];

      return valore !== null &&
        valore !== undefined &&
        valore !== '';
    });

    const compilatore = scheda.utenti
      ? [scheda.utenti.nome, scheda.utenti.cognome]
          .filter(Boolean)
          .join(' ')
      : 'Ingegnere';

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-size:15px;font-weight:700">
              📝 ${esc(etichettaFamigliaTecnica(scheda.famiglia))}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:4px">
              Compilata da ${esc(compilatore)}
              ${
                scheda.aggiornato_il
                  ? ' · aggiornata il ' +
                    new Date(scheda.aggiornato_il).toLocaleString('it-IT')
                  : ''
              }
            </div>

            ${
              modificataCommerciale
                ? `
                  <div style="font-size:12px;color:var(--o);margin-top:4px">
                    ✏️ Copia commerciale utilizzata per la richiesta fornitori
                  </div>
                `
                : ''
            }
          </div>

          ${
            ['commerciale', 'titolare'].includes(ROLE)
              ? `
                <button
                  class="btn sm p"
                  onclick="apriModificaSchedaCommerciale(
                    '${progettoId}',
                    '${scheda.famiglia}'
                  )"
                >
                  ✏️ Modifica copia
                </button>
              `
              : '<span class="bx bblue">Rilievo tecnico</span>'
          }
        </div>

        ${
          campi.length
            ? `
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px">
                ${campi.map(function(entry) {
                  return `
                    <div style="padding:9px;background:var(--bg);border-radius:var(--rs)">
                      <div style="font-size:11px;color:var(--m);margin-bottom:3px">
                        ${esc(etichettaCampoTecnico(entry[0]))}
                      </div>

                      <div style="font-size:13px;font-weight:600;white-space:pre-wrap;overflow-wrap:anywhere">
                        ${esc(valoreSchedaTecnica(entry[1]))}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `
            : '<div class="empty">La scheda non contiene dati.</div>'
        }
      </div>
    `;
  }).join('');
}

async function apriModificaSchedaCommerciale(progettoId, famiglia) {
 if (!['commerciale', 'titolare'].includes(ROLE)) {
  toast('Solo commerciale o titolare possono modificare la copia', 'err');
  return;
}

  const { data: scheda, error } = await db
    .from('progetti_tecnici_schede')
    .select('id,famiglia,dati,dati_commerciali')
    .eq('progetto_tecnico_id', progettoId)
    .eq('famiglia', famiglia)
    .single();

  if (error || !scheda) {
    toast(
      'Errore apertura scheda: ' +
      (error?.message || 'scheda non trovata'),
      'err'
    );
    return;
  }

  const datiDaModificare = datiSchedaDaMostrare(scheda);
  const campi = Object.entries(datiDaModificare);

  const box = ge('mrt-content');

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          ✏️ Copia commerciale — ${esc(etichettaFamigliaTecnica(famiglia))}
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          L’originale compilato dall’ingegnere non verrà modificato.
        </div>
      </div>

      <button class="btn sm" onclick="closeM('m-rilievo-tecnico')">
        ← Indietro
      </button>
    </div>

    <div class="al2 i">
      Le modifiche qui salvate saranno quelle riportate nel PDF anonimo
      destinato al fornitore.
    </div>

    <div class="card">
      ${campi.map(function(entry, indice) {
        const chiave = entry[0];
        const valore = entry[1];

        return `
          <div class="f">
            <label>${esc(etichettaCampoTecnico(chiave))}</label>
            <textarea
              id="msc-campo-${indice}"
              rows="2"
            >${esc(String(valore ?? ''))}</textarea>
          </div>
        `;
      }).join('')}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="closeM('m-rilievo-tecnico')">
        Annulla
      </button>

      <button
        class="btn p"
        onclick="salvaCopiaSchedaCommerciale(
          '${progettoId}',
          '${scheda.id}'
        )"
      >
        Salva copia commerciale
      </button>
    </div>
  `;

  window._campiCopiaCommerciale = campi.map(function(entry) {
    return entry[0];
  });

  openM('m-rilievo-tecnico');
}

async function salvaCopiaSchedaCommerciale(progettoId, schedaId) {
  const chiavi = window._campiCopiaCommerciale || {};

  const datiCommerciali = {};

  chiavi.forEach(function(chiave, indice) {
    datiCommerciali[chiave] = v('msc-campo-' + indice).trim();
  });

  const { error } = await db
    .from('progetti_tecnici_schede')
    .update({
      dati_commerciali: datiCommerciali,
      ultima_modifica_commerciale_da: ME.id,
      ultima_modifica_commerciale_il: new Date().toISOString()
    })
    .eq('id', schedaId)
    .eq('progetto_tecnico_id', progettoId);

  if (error) {
    toast('Errore salvataggio copia: ' + error.message, 'err');
    return;
  }

  closeM('m-rilievo-tecnico');
  toast('Copia commerciale salvata', 'ok');

  if (
  currentPreventivoProgettoId === progettoId &&
  ge('pg-preventivo-detail')?.classList.contains('on')
) {
  await renderSchedePreventivo();
} else {
  await renderSchedeProgettoCommerciale(progettoId);
}
}


function modificaProgettoDaScheda() {
  if (!currentProgettoTecnicoId) return;
  apriProgettoDaElenco(currentProgettoTecnicoId);
}

async function apriProgettoDaElenco(id) {
  const { data: progetto, error } = await db
    .from('progetti_tecnici')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !progetto) {
    toast(
      'Errore apertura progetto: ' +
      (error?.message || 'progetto non trovato'),
      'err'
    );
    return;
  }

  // Mantiene il cliente corretto per il successivo salvataggio.
  currentCliId = progetto.cliente_id;

  // Apre direttamente il modal, senza passare dalla lista cliente nascosta.
  ge('mp-id').value = progetto.id;
  ge('mp-titolo-modal').textContent = 'Modifica progetto tecnico';
  ge('mp-titolo').value = progetto.titolo || '';
  ge('mp-tipologia').value = progetto.tipologia || '';
  ge('mp-descrizione').value = progetto.descrizione_tecnica || '';
  ge('mp-materiali').value = progetto.materiali_note || '';
  ge('mp-file').value = '';
  ge('mp-file-extra').value = '';

  await caricaAllegatiProgetto(progetto.id);

  openM('m-progetto');
}

async function apriVerificaTecnica(progettoId) {
  const { data: progetto, error } = await db
    .from('progetti_tecnici')
    .select(`
      id,
      titolo,
      tipologia,
      descrizione_tecnica,
      nota_verifica_tecnica,
      clienti(ragione_sociale)
    `)
    .eq('id', progettoId)
    .single();

  if (error || !progetto) {
    toast('Errore apertura verifica: ' + (error?.message || ''), 'err');
    return;
  }

  ge('mvt-id').value = progetto.id;
  ge('mvt-note').value = progetto.nota_verifica_tecnica || '';

  ge('mvt-riepilogo').innerHTML = `
    <b>${esc(progetto.titolo)}</b><br>
    ${esc(progetto.clienti?.ragione_sociale || 'Cliente non disponibile')}
    · ${esc(progetto.tipologia || 'Progetto tecnico')}<br><br>
    ${esc(progetto.descrizione_tecnica || 'Nessuna descrizione disponibile')}
  `;
 const inputAllegati = ge('mvt-file');

if (inputAllegati) {
  inputAllegati.value = '';
}

if (ge('mvt-allegati')) {
  await caricaAllegatiVerifica(progetto.id);
}

  openM('m-verifica-tecnica');
}

async function salvaEsitoVerifica(nuovoStato) {
  const progettoId = v('mvt-id');
  const nota = v('mvt-note').trim();

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  try {
    await caricaAllegatiDaVerifica(progettoId);
  } catch (errore) {
    toast('Errore caricamento allegati: ' + errore.message, 'err');
    return;
  }

 const statoDaSalvare = nuovoStato;

  const { error } = await db.rpc('salva_esito_verifica', {
    p_progetto_id: progettoId,
    p_stato: statoDaSalvare,
    p_nota: nota || null
  });

  if (error) {
    toast('Errore salvataggio verifica: ' + error.message, 'err');
    return;
  }

  closeM('m-verifica-tecnica');

  toast(
    nuovoStato === 'da_integrare'
      ? 'Integrazione richiesta al rappresentante'
      : 'Progetto inviato al commerciale',
    'ok'
  );

  await loadVerificheTecniche();
  await loadDashIngegnere();
}

async function salvaBozzaVerifica() {
  const progettoId = v('mvt-id');
  const nota = v('mvt-note').trim() || null;

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  try {
    await caricaAllegatiDaVerifica(progettoId);
  } catch (errore) {
    toast('Errore caricamento allegati: ' + errore.message, 'err');
    return;
  }

const { error } = await db.rpc('salva_bozza_verifica', {
  p_progetto_id: progettoId,
  p_nota: nota
});

  if (error) {
    toast('Errore salvataggio bozza: ' + error.message, 'err');
    return;
  }

  const inputFile = ge('mvt-file');

  if (inputFile) {
    inputFile.value = '';
  }

  await caricaAllegatiVerifica(progettoId);

  toast('Bozza verifica salvata', 'ok');
}

async function caricaAllegatiVerifica(progettoId) {
  const box = ge('mvt-allegati');

  const { data, error } = await db
    .from('progetti_tecnici_allegati')
    .select('id,nome_file,caricato_il')
    .eq('progetto_id', progettoId)
    .order('caricato_il', { ascending: false });

  if (error) {
    box.innerHTML = '<div class="al2 e">Errore caricamento allegati.</div>';
    return;
  }

  if (!data?.length) {
    box.innerHTML = '<div style="font-size:12px;color:var(--m)">Nessun allegato disponibile.</div>';
    return;
  }

  box.innerHTML = `
    <div style="font-size:12px;font-weight:600;margin-bottom:6px">
      Allegati già presenti
    </div>
    ${data.map(a => `
      <div style="padding:7px 9px;background:var(--gl);border-radius:6px;margin-top:5px;font-size:12px">
        📎 ${esc(a.nome_file)}
      </div>
    `).join('')}
  `;
}

async function caricaAllegatiDaVerifica(progettoId) {
  const files = Array.from(ge('mvt-file').files || []);

  if (!files.length) return;

  if (files.some(file => !fileProgettoValido(file))) {
    throw new Error('Puoi caricare solo PDF, JPG/JPEG o PNG');
  }

  if (files.some(file => file.size > 10 * 1024 * 1024)) {
    throw new Error('Un file supera il limite di 10 MB');
  }

  const { data: authData, error: authError } = await db.auth.getUser();

  if (authError || !authData.user) {
    throw new Error('Sessione non valida');
  }

  const utenteId = authData.user.id;

  for (const file of files) {
    const nomeSicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    const path =
      utenteId + '/' +
      progettoId + '/' +
      Date.now() + '_' +
      nomeSicuro;

      const tipoFile = /\.dwg$/i.test(file.name)
  ? 'application/acad'
  : file.type;

    const { error: erroreUpload } = await db.storage
      .from('progetti-tecnici')
      .upload(path, file, {
        contentType: tipoFile,
        upsert: false
      });

    if (erroreUpload) throw erroreUpload;

    const { error: erroreAllegato } = await db
      .from('progetti_tecnici_allegati')
      .insert({
        progetto_id: progettoId,
        nome_file: file.name,
        storage_path: path,
        mime_type: tipoFile,
        dimensione: file.size,
        caricato_da: utenteId
      });

    if (erroreAllegato) {
      await db.storage.from('progetti-tecnici').remove([path]);
      throw erroreAllegato;
    }
  }
}
