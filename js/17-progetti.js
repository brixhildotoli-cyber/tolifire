// ── PROGETTI TECNICI CLIENTE ─────────────────────────────────

let allegatiProgettoDati = [];
let salvataggioProgettoInCorso = false;
let urlAnteprimaProgetto = [];

// Elenco dei file scelti nella finestra del progetto: con js/70 si sommano,
// restano sul telefono con la bozza e hanno la ✖; senza, quelli degli input
function fileSceltiFinestraProgetto(campo) {
  if (typeof fileSceltiProgetto === 'function') {
    if (typeof prendiFileSceltiProgetto === 'function') prendiFileSceltiProgetto();
    return fileSceltiProgetto(campo);
  }
  const obbligatori = Array.from(ge('mp-file').files || []);
  const extra = Array.from(ge('mp-file-extra').files || []);
  if (campo === 'obbligatori') return obbligatori;
  if (campo === 'extra') return extra;
  return [...obbligatori, ...extra];
}

function anteprimaFileProgetto() {
  const box = ge('mp-file-selezionati');
  if (!box) return;

  urlAnteprimaProgetto.forEach(function(url) {
    URL.revokeObjectURL(url);
  });
  urlAnteprimaProgetto = [];

  const conElenco = typeof elencoFileSceltiProgetto === 'function';
  if (conElenco && typeof prendiFileSceltiProgetto === 'function') prendiFileSceltiProgetto();
  const voci = conElenco
    ? elencoFileSceltiProgetto()
    : fileSceltiFinestraProgetto().map(function(file) { return { id: '', file: file }; });

  if (!voci.length) {
    box.innerHTML = '';
    return;
  }

  const riprese = conElenco && typeof FOTO_BOZZA !== 'undefined' ? (FOTO_BOZZA.riprese || 0) : 0;
  const sulTelefono = conElenco && voci.some(function(x) { return x.sulTelefono; });

  box.innerHTML = `
    <div style="font-size:12px;font-weight:700;margin-bottom:6px">
      File pronti da caricare (${voci.length})
    </div>
    ${riprese ? `<div class="al2 i" id="mp-file-ripresi" style="font-size:12px;margin:0 0 6px">
      📱 ${riprese === 1 ? 'Ho ripreso 1 file scelto' : 'Ho ripreso ' + riprese + ' file scelti'} prima e tenuti sul telefono: premi Salva per caricarli.
    </div>` : ''}
    ${voci.map(function(voce) {
      const file = voce.file;
      const immagine = (file.type || '').startsWith('image/');
      const url = URL.createObjectURL(file);
      urlAnteprimaProgetto.push(url);

      return `
        <div class="mp-file-scelto" data-file-scelto="${esc(voce.id || '')}" style="display:flex;align-items:center;gap:9px;padding:8px 10px;margin-top:6px;background:var(--bg);border-radius:var(--rs)">
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
              ${(file.size / 1024 / 1024).toFixed(2)} MB${voce.campo === 'extra' ? ' · facoltativo' : ''}${voce.sulTelefono ? ' · 📱 sul telefono' : ''}
            </div>
          </div>

          <a class="btn sm" href="${url}" target="_blank" rel="noopener">
            Apri
          </a>
          ${voce.id ? `<button type="button" class="btn sm" title="Togli questo file" aria-label="Togli ${esc(file.name)}"
            onclick="togliFileSceltoProgetto('${esc(voce.id)}')">✖</button>` : ''}
        </div>
      `;
    }).join('')}
    ${sulTelefono ? `<div style="font-size:11px;color:var(--m);margin-top:6px">
      📱 I file scelti restano su questo telefono finché non premi Salva (anche se la pagina si ricarica).
    </div>` : ''}
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

  // F15.9: video mp4 e mov (solo con sql/82-foto-video e il suo -VINCOLO, js/56)
  if (typeof videoProgettoAmmesso === 'function' && videoProgettoAmmesso()) {
    tipiAmmessi.push('video/mp4', 'video/quicktime');
    estensioniAmmesse.push('mp4', 'mov');
  }

  const estensione = file.name.split('.').pop().toLowerCase();

  return tipiAmmessi.includes(file.type) ||
    estensioniAmmesse.includes(estensione);
}

// F15.9: limite per file (video 50 MB, il resto 10 MB) e testo del formato
function limiteFileProgettoSito(file) {
  return typeof limiteFileProgetto === 'function' ? limiteFileProgetto(file) : 10 * 1024 * 1024;
}

function testoFormatiProgetto() {
  return 'PDF, JPG/JPEG, PNG o DWG' +
    (typeof videoProgettoAmmesso === 'function' && videoProgettoAmmesso() ? ' (video MP4 o MOV fino a 50 MB)' : '');
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
  ricordaPosizionePagina();
  const lista = ge('cd-progetti-lista');

  if (!clienteId || !lista) return;
  const richiestaId = ++richiestaProgettiCliente;
  const clienteRichiestoId = clienteId;

  lista.innerHTML = '<div class="load">Caricamento...</div>';

  // F15.13: con le regole di smistamento attive un solo "Invia il progetto" (js/67)
  if (typeof verificaRegoleSmistamentoDisponibili === 'function') await verificaRegoleSmistamentoDisponibili();

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
      inviato_a_commerciale: 'Inviato ad Acquisti',
      in_verifica_tecnica: 'In verifica tecnica',
      in_valutazione: 'In valutazione',
      pronto_per_preventivo: 'Pronto per preventivo',
      approvato: 'Approvato',
      archiviato: 'Archiviato'
      
    }[p.stato] || p.stato;
    const smistamento = progettoConSmistamento();
    const inviaSmistamento = smistamento && ['bozza', 'da_integrare'].includes(p.stato);
    const richiediVerifica = !smistamento && ['bozza', 'da_integrare'].includes(p.stato);
    // F15.13: con lo smistamento il rappresentante non sposta da solo un progetto
    // già verificato (sql/83 lo rifiuta): è già in "Da preventivare" di Acquisti
    const inviaCommerciale = smistamento
      ? p.stato === 'pronto_per_preventivo' && ROLE !== 'rappresentante'
      : ['bozza', 'da_integrare', 'pronto_per_preventivo'].includes(p.stato);
    const avvisoSoglia = (smistamento ? inviaSmistamento : inviaCommerciale) && progettoSopraSoglia(p);

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
      (avvisoSoglia
        ? '<div class="al2 w" style="margin-top:10px">⚠️ ' +
            esc(testoAvvisoSoglia(p)) +
          '</div>'
        : '') +
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
      '📤 Invia ad Acquisti' +
    '</button>'
  : '') +

(inviaSmistamento
  ? '<button class="btn sm p" onclick="inviaProgettoConSmistamento(\'' + p.id + '\')">' +
      '📤 Invia il progetto' +
    '</button>'
  : '') +

  '<button class="btn sm" style="color:var(--r)" onclick="eliminaProgetto(\'' + p.id + '\')">' +
    '🗑 Elimina' +
  '</button>' +
'</div>' +
    '</div>';
  }).join('');
}

// ── Bozza automatica del progetto (nel browser) ─────────────────────
// Il testo scritto nella finestra del progetto si salva da solo in questo
// browser mentre si scrive: se la sessione scade o la finestra si chiude,
// riaprendo lo stesso progetto (o "Nuovo progetto" sullo stesso cliente)
// il testo torna. Si cancella quando il progetto viene salvato. Le foto e i
// file scelti li tiene sul telefono js/70 (stessa chiave della bozza).
const CAMPI_BOZZA_PROGETTO = ['mp-titolo', 'mp-tipologia', 'mp-descrizione', 'mp-materiali', 'mp-importo', 'mp-fonte-rilievo'];
let chiaveBozzaProgettoAperta = null;
let timerBozzaProgetto = null;

function chiaveBozzaProgetto(progettoId, clienteId) {
  return 'bozza_progetto_' + (ME?.id || 'anonimo') + '_' + (progettoId || ('nuovo_' + (clienteId || '')));
}

function leggiBozzaProgetto(chiave) {
  try {
    const testo = localStorage.getItem(chiave);
    return testo ? JSON.parse(testo) : null;
  } catch (e) {
    return null;
  }
}

function salvaBozzaProgettoLocale() {
  if (!chiaveBozzaProgettoAperta) return;
  const valori = {};
  let qualcosaScritto = false;
  CAMPI_BOZZA_PROGETTO.forEach(function(id) {
    const el = ge(id);
    if (!el) return;
    valori[id] = el.value;
    if (String(el.value || '').trim()) qualcosaScritto = true;
  });
  try {
    if (qualcosaScritto) {
      localStorage.setItem(chiaveBozzaProgettoAperta, JSON.stringify({ valori: valori, salvata_il: Date.now() }));
      const nota = ge('mp-bozza-nota');
      if (nota && nota.dataset.ripresa !== '1') {
        nota.style.display = 'block';
        nota.innerHTML = '💾 Bozza salvata in automatico alle ' +
          new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      }
    }
  } catch (e) { /* spazio pieno o navigazione privata: si prosegue senza bozza */ }
}

function pianificaBozzaProgetto() {
  clearTimeout(timerBozzaProgetto);
  timerBozzaProgetto = setTimeout(salvaBozzaProgettoLocale, 800);
}

function cancellaBozzaProgetto(chiave) {
  try { localStorage.removeItem(chiave || chiaveBozzaProgettoAperta); } catch (e) {}
}

function scartaBozzaProgetto() {
  if (!confirm('Scartare il testo ripreso dalla bozza?')) return;
  const chiave = chiaveBozzaProgettoAperta;
  cancellaBozzaProgetto(chiave);
  closeM('m-progetto');
  const id = v('mp-id');
  if (id) modificaProgetto(id); else apriNuovoProgetto();
}

// Chiamata all'apertura della finestra, dopo aver riempito i campi
function preparaBozzaProgetto(progettoId) {
  chiaveBozzaProgettoAperta = chiaveBozzaProgetto(progettoId, currentCliId);

  let nota = ge('mp-bozza-nota');
  if (!nota) {
    const mh = document.querySelector('#m-progetto .mh');
    if (mh) {
      nota = document.createElement('div');
      nota.id = 'mp-bozza-nota';
      nota.className = 'al2 i';
      nota.style.cssText = 'display:none;margin:0 0 10px;font-size:12px';
      mh.insertAdjacentElement('afterend', nota);
    }
  }
  if (nota) { nota.style.display = 'none'; nota.innerHTML = ''; nota.dataset.ripresa = ''; }

  CAMPI_BOZZA_PROGETTO.forEach(function(id) {
    const el = ge(id);
    if (el && !el.dataset.bozzaAgganciata) {
      el.addEventListener('input', pianificaBozzaProgetto);
      el.addEventListener('change', pianificaBozzaProgetto);
      el.dataset.bozzaAgganciata = '1';
    }
  });

  const bozza = leggiBozzaProgetto(chiaveBozzaProgettoAperta);
  if (!bozza || !bozza.valori) return;

  CAMPI_BOZZA_PROGETTO.forEach(function(id) {
    const el = ge(id);
    if (el && bozza.valori[id] !== undefined) el.value = bozza.valori[id];
  });
  if (typeof aggiornaAvvisoImportoProgetto === 'function') aggiornaAvvisoImportoProgetto();

  if (nota) {
    const quando = new Date(bozza.salvata_il || Date.now());
    nota.dataset.ripresa = '1';
    nota.style.display = 'block';
    nota.innerHTML = '💾 Ho ripreso il testo non salvato del ' +
      esc(quando.toLocaleDateString('it-IT')) + ' alle ' +
      esc(quando.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })) +
      '. Controllalo e premi Salva. ' +
      (typeof apriFotoBozzaProgetto === 'function' ? '' : 'Gli allegati vanno riselezionati. ') +
      '<a href="#" onclick="scartaBozzaProgetto();return false">Scarta</a>';
  }
}

// Apertura della finestra: elenco dei file scelti di questa bozza (js/70:
// anche quelli tenuti sul telefono prima di un ricaricamento della pagina)
async function apriFileSceltiFinestraProgetto(progettoId) {
  if (typeof apriFotoBozzaProgetto === 'function') {
    try { await apriFotoBozzaProgetto(chiaveBozzaProgetto(progettoId, currentCliId)); return; } catch (e) { console.warn('Foto della bozza:', e && e.message); }
  }
  anteprimaFileProgetto();
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
  await apriFileSceltiFinestraProgetto(null);

  await mostraImportoProgetto(null);
  await mostraFonteRilievoProgetto(null);
  await caricaAllegatiProgetto(null);
  preparaBozzaProgetto(null);

  openM('m-progetto');
  if (typeof preparaInputVideoProgetto === 'function') preparaInputVideoProgetto(); // F15.9
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
  await apriFileSceltiFinestraProgetto(id);

  await mostraImportoProgetto(progetto);
  await mostraFonteRilievoProgetto(progetto);
  await caricaAllegatiProgetto(id);
  preparaBozzaProgetto(id);

  openM('m-progetto');
  if (typeof preparaInputVideoProgetto === 'function') preparaInputVideoProgetto(); // F15.9
}

// Il caricamento dei file si è fermato a metà (rete, errore di un file):
// il progetto c'è già. Messaggio con i file salvati e quelli che restano;
// quelli rimasti restano scelti (e, con js/70, sul telefono). Un progetto
// NUOVO resta aperto come "Modifica": premendo di nuovo Salva si caricano
// solo i file rimasti, senza creare un secondo progetto.
async function caricamentoProgettoFermato(id, progettoId, rimasti, salvati, saltati, errore) {
  if (!id && progettoId) {
    ge('mp-id').value = progettoId;
    ge('mp-titolo-modal').textContent = 'Modifica progetto tecnico';
    const nuova = chiaveBozzaProgetto(progettoId, currentCliId);
    if (typeof spostaFotoBozzaProgetto === 'function') {
      await spostaFotoBozzaProgetto(chiaveBozzaProgetto(null, currentCliId), nuova);
    }
    chiaveBozzaProgettoAperta = nuova;
    try { await loadProgettiCliente(currentCliId); } catch (e) { /* si riprova dopo */ }
  }
  anteprimaFileProgetto();
  const sulTelefono = typeof fotoBozzaSulTelefono === 'function' && fotoBozzaSulTelefono();
  const righe = [
    (!id ? 'Il progetto è stato creato, ' : 'Le modifiche sono salvate, ') + 'ma il caricamento dei file si è fermato.',
    '',
    'Motivo: ' + (errore || 'errore sconosciuto'),
    '',
    'Salvati (' + salvati.length + '):' + (salvati.length ? '\n- ' + salvati.join('\n- ') : ' nessuno'),
    '',
    'Non salvati (' + rimasti.length + '):\n- ' + rimasti.map(function(f) { return f.name; }).join('\n- '),
    '',
    'I file non salvati restano scelti nella finestra' + (sulTelefono ? ' e su questo telefono' : '') +
      ': premi di nuovo Salva per caricarli (toglili con ✖ se uno non va bene).'
  ];
  if (saltati.length) righe.push('', 'Non caricati perché già tra i file del progetto:\n- ' + saltati.join('\n- '));
  toast('Caricamento dei file fermato: ' + rimasti.length + ' da rifare', 'err');
  alert(righe.join('\n'));
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

    const filesObbligatori = fileSceltiFinestraProgetto('obbligatori');
    const filesExtra = fileSceltiFinestraProgetto('extra');
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

    if (typeof verificaFotoVideoDisponibile === 'function') await verificaFotoVideoDisponibile(); // F15.9

    if (files.some(function(file) { return !fileProgettoValido(file); })) {
      toast('Formato non valido: carica solo ' + testoFormatiProgetto(), 'err');
      return;
    }

    // Le foto oltre 1,2 MB si rimpiccioliscono al caricamento (F15.9): qui
    // si fermano solo i video oltre 50 MB e gli altri file oltre 10 MB
    if (files.some(function(file) {
      return file.size > limiteFileProgettoSito(file) && !/^image\/(jpeg|png)$/i.test(file.type || '');
    })) {
      toast('Un file supera il limite (video 50 MB, altri file 10 MB)', 'err');
      return;
    }

    // La bozza si salva subito, così con la sessione scaduta il testo non si perde
    salvaBozzaProgettoLocale();

    let { data: authData, error: authError } = await db.auth.getUser();

    if (authError || !authData?.user) {
      // Sessione scaduta: si prova a rinnovarla prima di arrendersi
      const rinnovo = await db.auth.refreshSession();
      if (!rinnovo.error && rinnovo.data?.user) {
        authData = { user: rinnovo.data.user };
        authError = null;
      }
    }

    if (authError || !authData?.user) {
      toast('La sessione è scaduta: il testo è salvato in bozza. Rientra e riapri il progetto per continuare.', 'err');
      return;
    }

const authUserId = authData.user.id;
    // "Entra come" (F14.18): il progetto e i file sono della persona
    // impersonata (le policy chiedono rappresentante_id = utente_effettivo()
    // e caricato_da = get_mio_utente_id()); il percorso nello Storage resta
    // dell'utente vero (la regola dello Storage guarda auth.uid()).
    const idPersona = (typeof ENTRA_COME !== 'undefined' && ENTRA_COME && ME && ME.id) ? ME.id : authUserId;

    const payload = {
      titolo: titolo,
      tipologia: tipologia,
      descrizione_tecnica: descrizione,
      materiali_note: v('mp-materiali').trim() || null
    };

    // F3.3: importo stimato (solo se la colonna esiste, sql/21) e solo se
    // il campo era visibile: se all'apertura il controllo era fallito
    // (campo nascosto e vuoto) non si deve cancellare l'importo già salvato.
    const boxImporto = ge('mp-importo-box');
    if (boxImporto && boxImporto.style.display !== 'none' &&
        await controllaColonnaImportoProgetto()) {
      const testoImporto = String(v('mp-importo')).trim().replace(',', '.');

      if (testoImporto === '') {
        payload.importo_stimato = null;
      } else {
        const importo = Number(testoImporto);

        if (!isFinite(importo) || importo < 0) {
          toast('Importo stimato non valido: usa un numero positivo', 'err');
          ge('mp-importo').focus();
          return;
        }

        payload.importo_stimato = Math.round(importo * 100) / 100;
      }
    }

    // F15.5: fonte del rilievo (solo con sql/79 e se il campo era attivo)
    const selFonte = ge('mp-fonte-rilievo');
    const boxFonte = ge('mp-fonte-rilievo-box');
    if (boxFonte && boxFonte.style.display !== 'none' && selFonte && !selFonte.disabled) {
      payload.fonte_rilievo = selFonte.value || null;
    }

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
      // F15.17: lo stesso cliente ha già un progetto aperto negli ultimi 90
      // giorni? Solo un avviso con la scelta: mai un blocco.
      const sceltaDoppione = await controllaProgettoDoppione(currentCliId);
      if (sceltaDoppione && sceltaDoppione.scelta === 'annulla') return;
      if (sceltaDoppione && sceltaDoppione.scelta === 'apri') {
        closeM('m-progetto');
        await openProgettoDetail(sceltaDoppione.id);
        return;
      }

      payload.cliente_id = currentCliId;
      payload.rappresentante_id = idPersona;
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
      // Il progetto ora esiste: la bozza del "nuovo" non deve ricrearlo una seconda volta
      cancellaBozzaProgetto(chiaveBozzaProgetto(null, currentCliId));
      // Le foto passano SUBITO sotto il progetto creato: se la pagina muore
      // durante il caricamento tornano riaprendo questo progetto, non con
      // "+ Nuovo progetto" (che ne creerebbe un secondo)
      if (typeof spostaFotoBozzaProgetto === 'function') {
        try { await spostaFotoBozzaProgetto(chiaveBozzaProgetto(null, currentCliId), chiaveBozzaProgetto(progettoId, currentCliId)); } catch (e) { console.warn('Foto della bozza:', e && e.message); }
      }
      chiaveBozzaProgettoAperta = chiaveBozzaProgetto(progettoId, currentCliId);
      if (sceltaDoppione && sceltaDoppione.scelta === 'crea') {
        await registraDoppioneProgetto(progettoId, sceltaDoppione); // F15.17
      }
    }

  // F15.9 (js/56 caricaFileNelProgetto): foto rimpicciolite, impronta del
  // file con sql/82-foto-video; la stessa foto già nel progetto si salta.
  // js/70: ogni file arrivato (o già nel progetto) esce dal telefono; se il
  // caricamento si ferma a metà si dice cosa è salvato e cosa resta, e le
  // foto rimaste restano scelte (e sul telefono) per il prossimo "Salva".
  const fileSaltati = [];
  const fileSalvati = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let caricato;
    try {
      caricato = await caricaFileNelProgetto(progettoId, authUserId, file, idPersona !== authUserId ? { caricatoDa: idPersona } : {});
    } catch (e) {
      caricato = { errore: file.name + ': ' + ((e && e.message) || String(e)) };
    }
    if (!caricato) caricato = { errore: file.name + ': caricamento non riuscito' };
    if (caricato.doppione) {
      fileSaltati.push(caricato.errore);
      if (typeof fileProgettoArrivato === 'function') await fileProgettoArrivato(file);
      continue;
    }
    if (!caricato.alleg) {
      await caricamentoProgettoFermato(id, progettoId, files.slice(i), fileSalvati, fileSaltati, caricato.errore);
      return;
    }
    fileSalvati.push(file.name);
    if (typeof fileProgettoArrivato === 'function') await fileProgettoArrivato(file);
  }
  if (fileSaltati.length) alert('Non caricati (già tra i file del progetto):\n\n- ' + fileSaltati.join('\n- '));

    if (typeof svuotaFotoBozzaProgetto === 'function') {
      // Le foto del "nuovo progetto" solo se questo era il nuovo progetto
      if (!id) await svuotaFotoBozzaProgetto(chiaveBozzaProgetto(null, currentCliId));
      await svuotaFotoBozzaProgetto(chiaveBozzaProgetto(id || progettoId, currentCliId));
    }
    cancellaBozzaProgetto(chiaveBozzaProgetto(id || null, currentCliId));
    chiaveBozzaProgettoAperta = null;
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
  // F15.13: con le regole di smistamento attive decide il gestionale (js/67, sql/83)
  if (typeof verificaRegoleSmistamentoDisponibili === 'function' && await verificaRegoleSmistamentoDisponibili(true)) {
    return inviaProgettoConSmistamento(progettoId);
  }
  // F15.5: fonte del rilievo e fonti dei dati normativi (js/56, sql/79).
  // sql/261: i tre controlli qui sotto NON fermano il rappresentante (anche
  // "Entra come"): per lui solo l'allegato, come prima del 06/11
  if (typeof controllaFontiPrimaDellInvio === 'function' && !(await controllaFontiPrimaDellInvio(progettoId))) {
    return;
  }
  // F15.8: dati che servono al prezzo (D2: solo quelli), js/56 e sql/82
  if (typeof controllaDatiPrimaDellInvio === 'function' && !(await controllaDatiPrimaDellInvio(progettoId))) {
    return;
  }
  // F15.9: foto e video richiesti dal catalogo, js/56 e sql/82-foto-video
  if (typeof controllaFotoVideoPrimaDellInvio === 'function' && !(await controllaFotoVideoPrimaDellInvio(progettoId))) {
    return;
  }

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

  // sql/259 + sql/261: per il rappresentante, dopo la conferma, la fonte del
  // rilievo ("Sopralluogo TOLI") se manca; nessun altro controllo delle schede
  if (typeof preparaInvioRappresentante === 'function' && !(await preparaInvioRappresentante(progettoId))) {
    return;
  }

  const { error } = await db
    .from('progetti_tecnici')
    .update({
      stato: 'in_verifica_tecnica'
    })
    .eq('id', progettoId);

  if (error) {
    // senza sql/261 il database ferma ancora il rappresentante per le schede
    const bloccato = typeof messaggioInvioBloccatoRappresentante === 'function' && messaggioInvioBloccatoRappresentante(error);
    if (bloccato) {
      alert(bloccato);
      return;
    }
    toast('Errore invio: ' + error.message, 'err');
    return;
  }

  toast('Progetto inviato all’ufficio tecnico', 'ok');

  await loadProgettiCliente(currentCliId);
  await loadPaginaProgetti();
}

// ── F3.3 — SOGLIA "LAVORO GRANDE": AVVISO, NESSUN BLOCCO ─────
// F15.13 (T2): con le regole di smistamento attive (sql/83) la soglia è la
// regola "Lavoro grande": il progetto va all'ingegnere da solo e l'avviso lo
// dice; con la regola spenta niente avviso. Senza regole come prima.
// Soglia: impostazioni.soglia_lavoro_grande (sql/20, letta da loadImp in
// IMPOSTAZIONI). Importo: progetti_tecnici.importo_stimato (sql/21).
// Decisione del 26/10: decide il rappresentante se mandare il progetto
// all'ingegnere. Sopra soglia compare solo un avviso giallo; "Invia al
// commerciale" resta sempre possibile. Con importo o soglia vuoti, o senza
// la colonna importo_stimato, nessun avviso.
let colonnaImportoProgetto = null; // null = non ancora controllato

async function controllaColonnaImportoProgetto() {
  if (colonnaImportoProgetto !== null) return colonnaImportoProgetto;

  const { error } = await db
    .from('progetti_tecnici')
    .select('importo_stimato')
    .limit(1);

  if (!error) {
    colonnaImportoProgetto = true;
  } else if (
    error.code === '42703' ||
    /importo_stimato/.test(error.message || '')
  ) {
    colonnaImportoProgetto = false;
  } else {
    return false; // errore di rete: si riprova la prossima volta
  }

  return colonnaImportoProgetto;
}

function sogliaLavoroGrande() {
  // F14.2: funzione unica delle regole (stesso valore di
  // impostazioni.soglia_lavoro_grande); lo smistamento T2 la legge da qui
  if (typeof leggiRegolaSubito === 'function') return leggiRegolaSubito('soglia_lavoro_grande');
  if (typeof IMPOSTAZIONI === 'undefined' || !IMPOSTAZIONI) return null;
  const soglia = IMPOSTAZIONI.soglia_lavoro_grande;
  if (soglia === null || soglia === undefined || soglia === '') return null;
  const numero = Number(soglia);
  return isFinite(numero) ? numero : null;
}

function formatoEuroSoglia(importo) {
  return Number(importo).toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' €';
}

// true: le regole di smistamento sono attive (js/67) e i due invii di prima non ci sono
function progettoConSmistamento() {
  return typeof smistamentoAttivoSubito === 'function' && smistamentoAttivoSubito();
}

function sogliaAvvisoProgetto() {
  if (progettoConSmistamento()) {
    return regolaImportoSmistamentoAttiva() ? sogliaRegolaImportoSmistamento() : null;
  }
  return sogliaLavoroGrande();
}

function importoSopraSoglia(importo) {
  const soglia = sogliaAvvisoProgetto();
  if (soglia === null) return false;
  if (importo === null || importo === undefined || importo === '') return false;
  const numero = Number(importo);
  return isFinite(numero) && numero > soglia;
}

// true se l'importo stimato del progetto supera la soglia (solo avviso).
function progettoSopraSoglia(progetto) {
  return !!progetto && importoSopraSoglia(progetto.importo_stimato);
}

function testoAvvisoSoglia(progetto) {
  return 'Lavoro grande (importo stimato ' +
    formatoEuroSoglia(progetto.importo_stimato) +
    ', soglia ' + formatoEuroSoglia(sogliaAvvisoProgetto()) +
    (progettoConSmistamento()
      ? '): con lo smistamento automatico tutto il progetto va all’ingegnere.'
      : '): valuta l’invio all’ingegnere (Invia a ufficio tecnico).');
}

// Nota sotto il campo "Importo stimato" nel modal: avviso giallo se
// l'importo scritto supera la soglia (si aggiorna mentre si scrive).
function aggiornaAvvisoImportoProgetto() {
  const nota = ge('mp-importo-nota');
  if (!nota) return;

  const testo = String(v('mp-importo')).trim().replace(',', '.');

  if (importoSopraSoglia(testo)) {
    nota.className = 'al2 w';
    nota.style.color = '';
    nota.textContent = '⚠️ ' +
      testoAvvisoSoglia({ importo_stimato: Number(testo) });
    return;
  }

  const soglia = sogliaAvvisoProgetto();
  nota.className = '';
  nota.style.color = 'var(--m)';
  nota.textContent = soglia === null
    ? ''
    : 'Sopra ' + formatoEuroSoglia(soglia) +
      (progettoConSmistamento()
        ? ' è un lavoro grande: il progetto andrà all’ingegnere.'
        : ' è un lavoro grande: valuta l’invio all’ingegnere.');
}

// Campo "Importo stimato" nel modal del progetto: visibile solo se la
// colonna esiste (sql/21).
async function mostraImportoProgetto(progetto) {
  const box = ge('mp-importo-box');
  const campo = ge('mp-importo');
  if (!box || !campo) return;

  const presente = await controllaColonnaImportoProgetto();
  box.style.display = presente ? 'block' : 'none';
  campo.value =
    presente && progetto &&
    progetto.importo_stimato !== null &&
    progetto.importo_stimato !== undefined
      ? progetto.importo_stimato
      : '';

  aggiornaAvvisoImportoProgetto();
}

// F15.5: campo "Fonte del rilievo" nel modal del progetto, solo con sql/79
// (js/56 verificaFontiDatiDisponibili). Lo scrivono rappresentante,
// ingegnere e titolare; gli altri ruoli lo vedono in sola lettura.
async function mostraFonteRilievoProgetto(progetto) {
  const box = ge('mp-fonte-rilievo-box');
  const campo = ge('mp-fonte-rilievo');
  if (!box || !campo) return;
  const attive = typeof verificaFontiDatiDisponibili === 'function' && await verificaFontiDatiDisponibili();
  // sql/259 (richiesta di Erika dell'11/11): al rappresentante (anche "Entra
  // come") il campo non si mostra e non si manda: all'invio vale "Sopralluogo
  // TOLI" (la mette il database con sql/259, prima il sito dopo la conferma
  // dell'invio: js/56 preparaInvioRappresentante). Ingegnere e titolare come prima.
  box.style.display = attive && ROLE !== 'rappresentante' ? 'block' : 'none';
  campo.value = attive && progetto && progetto.fonte_rilievo ? progetto.fonte_rilievo : '';
  campo.disabled = !['rappresentante', 'ingegnere', 'titolare'].includes(ROLE);
  aggiornaNotaFonteRilievoProgetto();
}

function aggiornaNotaFonteRilievoProgetto() {
  const nota = ge('mp-fonte-rilievo-nota');
  if (!nota) return;
  const valore = v('mp-fonte-rilievo');
  nota.textContent = valore === 'misure_dichiarate'
    ? 'Foto e video non obbligatori. Nel preventivo per il cliente comparirà: «' +
      (typeof TESTO_MISURE_DICHIARATE !== 'undefined' ? TESTO_MISURE_DICHIARATE : 'Misure fornite dal committente, da verificare prima dell’ordine.') + '»'
    : (valore ? '' : 'Da dove vengono le misure: senza, il progetto non si invia.');
}

async function inviaProgettoAlCommerciale(progettoId) {
  // F15.13: con le regole di smistamento attive, da bozza o da integrare decide
  // il gestionale (js/67, sql/83); da "pronto per il preventivo" come prima
  if (typeof verificaRegoleSmistamentoDisponibili === 'function' && await verificaRegoleSmistamentoDisponibili(true)) {
    const { data: attuale } = await db.from('progetti_tecnici').select('stato').eq('id', progettoId).maybeSingle();
    if (!attuale || ['bozza', 'da_integrare'].includes(attuale.stato)) return inviaProgettoConSmistamento(progettoId);
    if (ROLE === 'rappresentante' && attuale.stato === 'pronto_per_preventivo') {
      toast('Il progetto è già verificato: lo trova Acquisti in "Da preventivare".');
      return;
    }
  }
  // F15.5: fonte del rilievo e fonti dei dati normativi (js/56, sql/79)
  // (solo l'invio da bozza o da integrare: dopo la verifica dell'ingegnere no).
  // sql/261: i tre controlli NON fermano il rappresentante (anche "Entra come")
  if (typeof controllaFontiPrimaDellInvio === 'function') {
    const { data: attuale } = await db.from('progetti_tecnici').select('stato').eq('id', progettoId).maybeSingle();
    if ((!attuale || ['bozza', 'da_integrare'].includes(attuale.stato)) &&
        !(await controllaFontiPrimaDellInvio(progettoId))) {
      return;
    }
  }
  // F15.8: dati che servono al prezzo (D2: solo quelli; solo da bozza o da integrare), js/56 e sql/82
  if (typeof controllaDatiPrimaDellInvio === 'function') {
    const { data: attuale } = await db.from('progetti_tecnici').select('stato').eq('id', progettoId).maybeSingle();
    if ((!attuale || ['bozza', 'da_integrare'].includes(attuale.stato)) &&
        !(await controllaDatiPrimaDellInvio(progettoId))) {
      return;
    }
  }
  // F15.9: foto e video richiesti dal catalogo (solo da bozza o da integrare), js/56 e sql/82-foto-video
  if (typeof controllaFotoVideoPrimaDellInvio === 'function') {
    const { data: attuale } = await db.from('progetti_tecnici').select('stato').eq('id', progettoId).maybeSingle();
    if ((!attuale || ['bozza', 'da_integrare'].includes(attuale.stato)) &&
        !(await controllaFotoVideoPrimaDellInvio(progettoId))) {
      return;
    }
  }

  if (!confirm('Inviare il progetto ad Acquisti per il preventivo?')) {
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

  // sql/259 + sql/261: per il rappresentante, dopo la conferma, la fonte del
  // rilievo ("Sopralluogo TOLI") se manca; nessun altro controllo delle schede
  if (typeof preparaInvioRappresentante === 'function' && !(await preparaInvioRappresentante(progettoId))) {
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
    // senza sql/261 il database ferma ancora il rappresentante per le schede
    const bloccato = typeof messaggioInvioBloccatoRappresentante === 'function' && messaggioInvioBloccatoRappresentante(error);
    if (bloccato) {
      alert(bloccato);
      return;
    }
    toast('Errore invio: ' + error.message, 'err');
    return;
  }

  toast('Progetto inviato ad Acquisti', 'ok');
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

  // F15.13: con le regole di smistamento attive un solo "Invia il progetto" (js/67)
  if (typeof verificaRegoleSmistamentoDisponibili === 'function') await verificaRegoleSmistamentoDisponibili();

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
    titolo: 'Inviati ad Acquisti',
    etichetta: 'Inviato ad Acquisti',
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

    const smistamento = progettoConSmistamento();
    const puoInviareSmistamento =
      smistamento && (p.stato === 'bozza' || p.stato === 'da_integrare');

    const puoRichiedereVerifica =
      !smistamento && (p.stato === 'bozza' || p.stato === 'da_integrare');

    const puoInviareCommerciale = smistamento
      ? p.stato === 'pronto_per_preventivo' && ROLE !== 'rappresentante'
      : p.stato === 'bozza' ||
        p.stato === 'da_integrare' ||
        p.stato === 'pronto_per_preventivo';

    const avvisoSoglia = (smistamento ? puoInviareSmistamento : puoInviareCommerciale) && progettoSopraSoglia(p);

    const nota = p.nota_integrazione || p.nota_verifica_tecnica;

    const autoreNota =
      p.integrazione_richiesta_da === 'commerciale'
        ? 'Nota di Acquisti'
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

        ${avvisoSoglia ? `
          <div class="al2 w" style="margin:10px 0">
            ⚠️ ${esc(testoAvvisoSoglia(p))}
          </div>
        ` : ''}

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
              📤 Invia ad Acquisti
            </button>
          ` : ''}

          ${puoInviareSmistamento ? `
            <button
              class="btn sm p"
              onclick="inviaProgettoConSmistamento('${p.id}')"
            >
              📤 Invia il progetto
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

  // F15.13: con lo smistamento automatico (js/67, sql/83) arrivano anche i
  // progetti ancora dall'ingegnere con qualche scheda verde, e la lista va in
  // ordine di arrivo (il primo arrivato in cima)
  const smistamento = typeof verificaRegoleSmistamentoDisponibili === 'function' &&
    await verificaRegoleSmistamentoDisponibili();
  const statiLista = ['inviato_a_commerciale', 'pronto_per_preventivo', 'in_preventivazione'];
  if (smistamento) statiLista.push('in_verifica_tecnica');

  const { data: datiProgetti, error } = await db
    .from('progetti_tecnici')
    .select(`
      id,
      titolo,
      tipologia,
      descrizione_tecnica,
      nota_verifica_tecnica,
      creato_il,
      aggiornato_il,
      stato,
      cliente_id,
      rappresentante_id,
      clienti(ragione_sociale)
    `)
.in('stato', statiLista)
    .order('creato_il', { ascending: false });
  let data = datiProgetti;

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
      .select('id, numero, stato, progetto_tecnico_id')
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

  // F15.13: schede smistate dei progetti in elenco (Acquisti legge solo le verdi)
  const smistamentoPerProgetto = {};
  const schedeGialleProgetto = {};   // progetto in verifica con schede ancora all'ingegnere
  if (smistamento && idsProgetti.length) {
    for (let i = 0; i < idsProgetti.length; i += 100) {
      const { data: righeSchede } = await db
        .from('progetti_tecnici_schede')
        .select('progetto_tecnico_id, famiglia, numero, stato_smistamento, smistamento_il')
        .in('progetto_tecnico_id', idsProgetti.slice(i, i + 100))
        .not('stato_smistamento', 'is', null);
      (righeSchede || []).forEach(function(r) {
        (smistamentoPerProgetto[r.progetto_tecnico_id] = smistamentoPerProgetto[r.progetto_tecnico_id] || []).push(r);
      });
    }
    data = (data || []).filter(function(p) {
      if (p.stato !== 'in_verifica_tecnica') return true;
      return (smistamentoPerProgetto[p.id] || []).some(function(r) {
        return ['acquisti', 'verificata'].includes(r.stato_smistamento);
      });
    });
    // in ordine di arrivo: quando le schede sono arrivate ad Acquisti (o, senza, l'ultimo cambio)
    const arrivo = function(p) {
      const verdi = (smistamentoPerProgetto[p.id] || []).filter(function(r) { return r.smistamento_il; })
        .map(function(r) { return new Date(r.smistamento_il).getTime(); });
      return verdi.length ? Math.min.apply(null, verdi) : new Date(p.aggiornato_il || p.creato_il).getTime();
    };
    data.sort(function(a, b) { return arrivo(a) - arrivo(b); });
    // le gialle Acquisti non le legge: chiede allo smistamento (RPC di sql/83)
    if (typeof progettoConSchedeIngegnere === 'function') {
      await Promise.all(data.filter(function(p) { return p.stato === 'in_verifica_tecnica'; }).map(async function(p) {
        schedeGialleProgetto[p.id] = await progettoConSchedeIngegnere(p.id);
      }));
    }
  }

  // Un progetto con preventivo esce dalla lista, tranne quando il
  // preventivo è ancora in bozza e il progetto è stato rimandato indietro
  // (di nuovo inviato al commerciale o pronto): si riprende la bozza.
  const preventivoPerProgetto = {};
  preventiviCollegati.forEach(function(preventivo) {
    if (preventivo.progetto_tecnico_id) preventivoPerProgetto[preventivo.progetto_tecnico_id] = preventivo;
  });

  const progettiDaPreventivare = (data || []).filter(function(progetto) {
    const preventivo = preventivoPerProgetto[progetto.id];
    if (!preventivo) return true;
    return preventivo.stato === 'bozza' &&
      ['inviato_a_commerciale', 'pronto_per_preventivo', 'in_verifica_tecnica'].includes(progetto.stato);
  });

  if (!progettiDaPreventivare.length) {
    box.innerHTML =
      '<div class="empty">🎉 Nessun progetto da preventivare al momento.</div>';
    return;
  }

  box.innerHTML = progettiDaPreventivare.map(function(p) {
    const cliente = p.clienti?.ragione_sociale || 'Cliente non disponibile';
    const bozzaRipresa = preventivoPerProgetto[p.id] || null;
    const inLavorazione = !!bozzaRipresa;
    const dataInvio = p.creato_il
      ? new Date(p.creato_il).toLocaleDateString('it-IT')
      : '';
    // F15.13: famiglie per Acquisti e famiglie ancora dall'ingegnere
    const schedeSmistate = smistamentoPerProgetto[p.id] || [];
    const nomeFam = function(r) {
      return (typeof etichettaFamigliaTecnica === 'function' ? etichettaFamigliaTecnica(r.famiglia) : r.famiglia) +
        (r.numero > 1 ? ' ' + r.numero : '');
    };
    const verdi = schedeSmistate.filter(function(r) { return ['acquisti', 'verificata'].includes(r.stato_smistamento); });
    const ancoraIngegnere = p.stato === 'in_verifica_tecnica' && !!schedeGialleProgetto[p.id];
    const htmlSmistamento = smistamento && (verdi.length || ancoraIngegnere) ? `
          <div class="al2 ${ancoraIngegnere ? 'w' : 'i'}" style="margin-top:10px">
            <b>🚦 Per te:</b> ${esc(verdi.map(nomeFam).join(', ') || '—')}
            ${ancoraIngegnere ? '<br>🟡 Altre schede sono ancora dall’ingegnere: le vedi quando le ha verificate (ti arriva l’avviso 🔔). Il preventivo resta uno solo.' : ''}
          </div>` : '';

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
  ${inLavorazione ? 'Preventivo n. ' + esc(bozzaRipresa.numero) + ' in bozza' : 'Da preventivare'}
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

        ${htmlSmistamento}

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

  ${ancoraIngegnere ? '' : `<button
    class="btn sm"
    style="color:#b45309"
    onclick="apriIntegrazioneCommerciale('${p.id}')"
  >
    ↩ Richiedi integrazione
  </button>`}

<button
  class="btn sm p"
  onclick="avviaPreventivo('${p.id}')"
>
  ${inLavorazione ? '🧾 Riprendi preventivo' : '🧾 Avvia preventivo'}
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
      integrazione_letta_rappresentante_il: null,
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


// F2.3 — finestra per il titolare quando ci sono più commerciali attivi.
// Predefinito: il commerciale dell'ultimo preventivo creato tra quelli
// in elenco; altrimenti il primo in ordine alfabetico.
async function apriSceltaCommercialePreventivo(progettoId, commerciali) {
  const ids = commerciali.map(function(c) { return c.id; });
  let predefinitoId = commerciali[0].id;

  // Predefinito: il commerciale con più preventivi (quello che lavora
  // davvero), non l'ultimo usato: un preventivo di prova fatto con il
  // profilo di prova non deve diventare la scelta proposta.
  const { data: usati } = await db
    .from('preventivi')
    .select('commerciale_id')
    .in('commerciale_id', ids)
    .limit(1000);

  const conteggi = {};
  (usati || []).forEach(function(p) {
    if (p.commerciale_id) conteggi[p.commerciale_id] = (conteggi[p.commerciale_id] || 0) + 1;
  });
  ids.forEach(function(id) {
    if ((conteggi[id] || 0) > (conteggi[predefinitoId] || 0)) predefinitoId = id;
  });

  let finestra = ge('m-scegli-commerciale');
  if (!finestra) {
    finestra = document.createElement('div');
    finestra.className = 'mbg';
    finestra.id = 'm-scegli-commerciale';
    document.body.appendChild(finestra);
  }

  finestra.innerHTML = `
    <div class="modal" style="max-width:420px">
      <button class="x" onclick="closeM('m-scegli-commerciale')">×</button>
      <h3>A chi di Acquisti assegnare il preventivo?</h3>
      <input type="hidden" id="msc-progetto-id" value="${esc(progettoId)}">
      <div class="f">
        <label>Persona di Acquisti *</label>
        <select id="msc-commerciale">
          ${commerciali.map(function(c) {
            const nome = ((c.nome || '') + ' ' + (c.cognome || '')).trim() || 'Senza nome';
            return '<option value="' + esc(c.id) + '"' +
              (c.id === predefinitoId ? ' selected' : '') + '>' +
              esc(nome) + '</option>';
          }).join('')}
        </select>
      </div>
      <div class="ma">
        <button class="btn" onclick="closeM('m-scegli-commerciale')">Annulla</button>
        <button class="btn p" id="msc-conferma" onclick="confermaCommercialePreventivo()">Avvia preventivo</button>
      </div>
    </div>
  `;

  openM('m-scegli-commerciale');
}

async function confermaCommercialePreventivo() {
  const progettoId = v('msc-progetto-id');
  const commercialeId = v('msc-commerciale');

  if (!progettoId || !commercialeId) {
    toast('Scegli una persona di Acquisti', 'err');
    return;
  }

  const bottone = ge('msc-conferma');
  if (bottone) bottone.disabled = true;

  closeM('m-scegli-commerciale');
  await avviaPreventivo(progettoId, commercialeId);

  if (bottone) bottone.disabled = false;
}

// Evita due bozze dallo stesso progetto con un doppio clic veloce:
// finché un avvio è in corso, gli altri clic sullo stesso progetto sono ignorati.
const _avvioPreventivoInCorso = new Set();
async function avviaPreventivo(progettoId, commercialeScelto) {
  if (_avvioPreventivoInCorso.has(progettoId)) return;
  _avvioPreventivoInCorso.add(progettoId);
  try {
    return await _avviaPreventivo(progettoId, commercialeScelto);
  } finally {
    _avvioPreventivoInCorso.delete(progettoId);
  }
}

async function _avviaPreventivo(progettoId, commercialeScelto) {
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

  // F15.13: progetto smistato con famiglie verdi mentre l'ingegnere ha ancora
  // le gialle (in verifica tecnica): il preventivo nasce, il progetto resta
  // all'ingegnere (non passa "in preventivazione").
  const { data: statoProgetto } = await db
    .from('progetti_tecnici').select('stato').eq('id', progettoId).maybeSingle();
  const progettoAncoraDallIngegnere = !!statoProgetto && statoProgetto.stato === 'in_verifica_tecnica';

  // Se il preventivo esiste già, il progetto non deve più restare
  // nella lista "Da preventivare".
  if (esistente && progettoAncoraDallIngegnere) {
    toast('Ripreso il preventivo n. ' + esistente.numero + ' (l’ingegnere ha ancora alcune schede)', 'ok');
    gotoPage(paginaPreventivi);
    if (typeof openPreventivoDetail === 'function') await openPreventivoDetail(esistente.id);
    return;
  }

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
      'Ripreso il preventivo n. ' + esistente.numero,
      'ok'
    );

    gotoPage(paginaPreventivi);
    if (typeof openPreventivoDetail === 'function') await openPreventivoDetail(esistente.id);
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

  let commercialeDestinatarioId = ME.id;

  if (ROLE === 'titolare') {
    // F2.3 — solo commerciali attivi: con uno si usa quello, con più
    // di uno sceglie il titolare (finestra m-scegli-commerciale).
    if (commercialeScelto) {
      commercialeDestinatarioId = commercialeScelto;
    } else {
      const { data: commerciali, error: erroreCommerciali } = await db
        .from('utenti')
        .select('id, nome, cognome')
        .eq('ruolo', 'commerciale')
        .eq('attivo', true)
        .order('cognome')
        .order('nome');

      if (erroreCommerciali) {
        toast(
          'Errore lettura utenti di Acquisti: ' + erroreCommerciali.message,
          'err'
        );
        return;
      }

      if (!commerciali || !commerciali.length) {
        toast(
          'Nessuna persona di Acquisti attiva: serve almeno un utente attivo con ruolo Acquisti per avviare il preventivo.',
          'err'
        );
        return;
      }

      if (commerciali.length > 1) {
        await apriSceltaCommercialePreventivo(progettoId, commerciali);
        return;
      }

      commercialeDestinatarioId = commerciali[0].id;
    }
  }

  const { data: preventivo, error: erroreCreazione } = await db
    .from('preventivi')
    .insert({
      cliente_id: progetto.cliente_id,
      // F2.3 — se avvia il titolare, il preventivo va al commerciale trovato
      // sopra (prima veniva salvato il titolare come commerciale)
      commerciale_id: commercialeDestinatarioId,
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

  const { data: progettoAggiornato, error: erroreStato } = progettoAncoraDallIngegnere
    ? { data: [{ id: progettoId }], error: null }
    : await db
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
  ricordaPosizionePagina();

  const bozzeBox = ge('preventivi-lista');
  const attesaBox = ge('preventivi-attesa-lista');
  const inviatiBox = ge('preventivi-inviati-lista');
  const chiusiBox = ge('preventivi-chiusi-lista');
  const rinviatiBox = ge('preventivi-progetti-rinviati');

  if (!bozzeBox || !attesaBox || !inviatiBox || !chiusiBox || !rinviatiBox) {
    return;
  }

  [bozzeBox, attesaBox, inviatiBox, chiusiBox, rinviatiBox]
    .forEach(function(box) {
      box.innerHTML = '<div class="load">Caricamento...</div>';
    });

  const { data, error } = await db
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
      creato_il,
      aggiornato_il,
      clienti(ragione_sociale)
    `)
    .eq('commerciale_id', ME.id)
    .order('numero', { ascending: false });

  if (error) {
    const messaggio = `
      <div class="al2 e">
        Errore caricamento preventivi: ${esc(error.message)}
      </div>
    `;

    [bozzeBox, attesaBox, inviatiBox, chiusiBox, rinviatiBox]
      .forEach(function(box) {
        box.innerHTML = messaggio;
      });

    return;
  }

  const preventivi = data || [];

  const stati = {
    bozza: { testo: 'Bozza', classe: 'bblue' },
    approvato: { testo: 'Approvato dal titolare', classe: 'bok' },
    in_attesa_approvazione: { testo: 'In attesa del titolare', classe: 'bwarn' },
    inviato_a_rappresentante: { testo: 'Inviato al rappresentante', classe: 'bok' },
    inviato: { testo: 'Inviato al cliente', classe: 'bok' },
    in_attesa_anticipo: { testo: 'Accettato, in attesa anticipo', classe: 'bwarn' },
    accettato: { testo: 'Accettato', classe: 'bok' },
    rifiutato: { testo: 'Rifiutato', classe: 'berr' },
    scaduto: { testo: 'Scaduto', classe: 'bgray' }
  };

  function card(preventivo) {
    const info = stati[preventivo.stato] || {
      testo: preventivo.stato || 'Stato non definito',
      classe: 'bgray'
    };

    const cliente =
      preventivo.clienti?.ragione_sociale || 'Cliente non disponibile';

    const totale = Number(preventivo.totale_imponibile || 0)
      .toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR'
      });

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

          <span class="bx ${info.classe}">
            ${esc(info.testo)}
          </span>
        </div>

        <div style="font-size:13px;margin-top:10px">
          Totale imponibile: <b>${esc(totale)}</b>
        </div>

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

  function mostra(box, elementi, messaggioVuoto) {
    box.innerHTML = elementi.length
      ? elementi.map(card).join('')
      : `<div class="empty">${messaggioVuoto}</div>`;
  }

  const bozze = preventivi.filter(function(p) {
    return ['bozza', 'approvato'].includes(p.stato) || !p.stato;
  });

  const attesa = preventivi.filter(function(p) {
    return p.stato === 'in_attesa_approvazione';
  });

  const inviati = preventivi.filter(function(p) {
    return ['inviato_a_rappresentante', 'inviato'].includes(p.stato);
  });

  const chiusi = preventivi.filter(function(p) {
    return ['in_attesa_anticipo', 'accettato', 'rifiutato', 'scaduto'].includes(p.stato);
  });

  mostra(bozzeBox, bozze, 'Nessuna bozza da completare.');
  mostra(attesaBox, attesa, 'Nessun preventivo in attesa del titolare.');
  mostra(inviatiBox, inviati, 'Nessun preventivo inviato.');
  mostra(chiusiBox, chiusi, 'Nessun preventivo nello storico.');

  const progettiIds = preventivi
    .map(function(p) { return p.progetto_tecnico_id; })
    .filter(Boolean);

  if (!progettiIds.length) {
    rinviatiBox.innerHTML =
      '<div class="empty">Nessun progetto rinviato per modifiche.</div>';
    return;
  }

  const { data: progettiRinviati, error: erroreProgetti } = await db
    .from('progetti_tecnici')
    .select('id,titolo,tipologia,stato,aggiornato_il,clienti(ragione_sociale)')
    .in('id', progettiIds)
    .in('stato', ['da_integrare', 'in_verifica_tecnica'])
    .order('aggiornato_il', { ascending: false });

  if (erroreProgetti) {
    rinviatiBox.innerHTML =
      `<div class="al2 e">Errore caricamento progetti: ${esc(erroreProgetti.message)}</div>`;
    return;
  }

  rinviatiBox.innerHTML = progettiRinviati?.length
    ? progettiRinviati.map(function(progetto) {
        const stato = progetto.stato === 'in_verifica_tecnica'
          ? 'In verifica tecnica'
          : 'Rinviato per integrazione';

        return `
          <div class="card" style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;gap:10px">
              <div>
                <div style="font-size:14px;font-weight:700">
                  ${esc(progetto.titolo || 'Progetto tecnico')}
                </div>

                <div style="font-size:12px;color:var(--m);margin-top:3px">
                  ${esc(progetto.clienti?.ragione_sociale || 'Cliente')}
                  · ${esc(progetto.tipologia || 'Progetto tecnico')}
                </div>
              </div>

              <span class="bx bwarn">${stato}</span>
            </div>

            <div style="margin-top:12px">
              <button
                class="btn sm"
                onclick="openProgettoDetail('${progetto.id}')"
              >
                Apri progetto
              </button>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="empty">Nessun progetto rinviato per modifiche.</div>';
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
  ricordaPosizionePagina();
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
  ricordaPosizionePagina();
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
  ricordaPosizionePagina();
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
  ripristinaPosizionePagina();
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
  ricordaPosizionePagina();
    const paginaAttuale = document
    .querySelector('.page.on')
    ?.id
    ?.replace('pg-', '');

  if (paginaAttuale && paginaAttuale !== 'progetto-detail') {
    paginaPrecedenteProgetto = paginaAttuale;
  }
  if (typeof verificaRegoleSmistamentoDisponibili === 'function') await verificaRegoleSmistamentoDisponibili(); // F15.13
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
    inviato_a_commerciale: 'Inviato ad Acquisti',
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
      ${'importo_stimato' in progetto ? ir(
        'Importo stimato',
        progetto.importo_stimato !== null
          ? formatoEuroSoglia(progetto.importo_stimato)
          : null
      ) : ''}
      ${'fonte_rilievo' in progetto && typeof etichettaFonteRilievo === 'function' && ROLE !== 'rappresentante' ? ir(
        'Fonte del rilievo',
        progetto.fonte_rilievo
          ? etichettaFonteRilievo(progetto.fonte_rilievo) +
            (progetto.fonte_rilievo === 'misure_dichiarate' ? ' (da verificare prima dell’ordine)' : '')
          : 'Da indicare'
      ) : ''}
    </div>

    <div id="pd-attesa-urgenza"></div>

    ${(progettoConSmistamento() ? ['bozza', 'da_integrare'] : ['bozza', 'da_integrare', 'pronto_per_preventivo'])
        .includes(progetto.stato) && progettoSopraSoglia(progetto) ? `
      <div class="al2 w" style="margin-bottom:16px">
        ⚠️ ${esc(testoAvvisoSoglia(progetto))}
      </div>
    ` : ''}

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

  // F15.19: urgenza (sql/89) e giorni di attesa in verifica tecnica (js/16)
  if (typeof mostraAttesaUrgenzaProgetto === 'function') await mostraAttesaUrgenzaProgetto(progetto, 'pd-attesa-urgenza');

  // F14.16: intestazione, "Cosa puoi fare", Collegati e Storico (js/63).
  if (typeof caricaSchedaOggetto === 'function') await caricaSchedaOggetto('progetto', progetto, 'pd-scheda-oggetto');

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
    // 11/11: una sola richiesta per tutti i file, link tenuti in memoria (js/01)
    const linkAllegati = await firmaFileInBlocco(
      'progetti-tecnici',
      allegati.map(function(a) { return a.storage_path; }),
      3600
    );
    const fileConLink = allegati.map(function(allegato) {
      return { ...allegato, url: linkAllegati[allegato.storage_path] || null };
    });

   ge('pd-file-content').innerHTML = `
  <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
    <button
      class="btn sm p"
      onclick="scaricaTuttiAllegatiProgetto('${progetto.id}')"
    >
      ⬇ Scarica tutto (${allegati.length})
    </button>
  </div>

  ${fileConLink.map(function(file) {
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
   }).join('')}
`;
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
        allegato_aggiunto: '📎',
        doppione_confermato: '⚠️' // F15.17
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
              ${utente?.ruolo ? ' · ' + esc(etichettaRuolo(utente.ruolo)) : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  const nota = progetto.nota_integrazione || progetto.nota_verifica_tecnica;
  const autore = progetto.integrazione_richiesta_da === 'commerciale'
    ? 'Nota di Acquisti'
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

  // F14.15: domande sul progetto (js/62, attive con sql/70)
  if (typeof caricaDomandeRecord === 'function') await caricaDomandeRecord('progetti_tecnici', progetto.id, 'pd-domande');
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


async function scaricaTuttiAllegatiProgetto(progettoId) {
  const { data: allegati, error } = await db
    .from('progetti_tecnici_allegati')
    .select('nome_file,storage_path')
    .eq('progetto_id', progettoId)
    .order('caricato_il', { ascending: false });

  if (error || !allegati?.length) {
    toast('Nessun file disponibile da scaricare', 'err');
    return;
  }

  toast('Preparazione di ' + allegati.length + ' download...', 'ok');

  for (const file of allegati) {
    const { data } = await firmaFile('progetti-tecnici', file.storage_path, 300, {
        download: file.nome_file
      });

    if (!data?.signedUrl) continue;

    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.download = file.nome_file;
    document.body.appendChild(link);
    link.click();
    link.remove();

    await new Promise(function(resolve) {
      setTimeout(resolve, 350);
    });
  }

  toast('Download avviati', 'ok');
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
  ricordaPosizionePagina();
  const box = ge('pd-schede-content');

  if (!box) return;

  box.innerHTML =
    '<div class="load">Caricamento rilievi tecnici...</div>';

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select(`
      *,
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
    // F15.13: per Acquisti le schede ancora dall'ingegnere non si leggono: il riquadro le elenca
    if (typeof aggiungiRiquadroSmistamento === 'function') await aggiungiRiquadroSmistamento(box, progettoId);
    return;
  }

  if (typeof aggiungiRiquadroSmistamento === 'function') {
    // F15.13: dopo il disegno delle schede (sotto), riquadro "🚦 Smistamento" in cima
    setTimeout(function() { aggiungiRiquadroSmistamento(box, progettoId); }, 0);
  }

  box.innerHTML = ordinaSchedeRilievo(data).map(function(scheda, indice, schede) {
    const modificataCommerciale = schedaHaDatiCommerciali(scheda);
    const datiVisualizzati = datiSchedaDaMostrare(scheda);

    const campi = Object.entries(datiVisualizzati).filter(function(entry) {
      const valore = entry[1];

      return campoSchedaDaElencare(entry[0]) &&
        valore !== null &&
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
              📝 ${esc(titoloSchedaRilievo(scheda, schede))}
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
                    ✏️ Copia di Acquisti utilizzata per la richiesta fornitori
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
                    '${scheda.famiglia}',
                    '${scheda.id}'
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
                        ${esc(etichettaCampoTecnico(entry[0], scheda.famiglia))}
                      </div>

                      <div style="font-size:13px;font-weight:600;white-space:pre-wrap;overflow-wrap:anywhere">
                        ${esc(valoreSchedaTecnica(entry[1], entry[0], scheda.famiglia))}
                      </div>
                      ${typeof htmlFonteDatoScheda === 'function' ? htmlFonteDatoScheda(scheda, entry[0]) : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            `
            : '<div class="empty">La scheda non contiene dati.</div>'
        }

        <div id="pd-posizioni-${scheda.id}" style="margin-top:12px"></div>
      </div>
    `;
  }).join('');

  // F15.2 (js/66, sql/76): posizioni P-xx di ogni scheda (nulla senza sql/76)
  if (typeof disegnaPosizioniProgetto === 'function') {
    await disegnaPosizioniProgetto(progettoId, ordinaSchedeRilievo(data));
  }
}

// schedaId: la scheda precisa (con sql/48 ci possono essere più schede
// dello stesso tipo). Senza schedaId si apre la scheda del tipo, come prima.
async function apriModificaSchedaCommerciale(progettoId, famiglia, schedaId) {
  ricordaPosizionePagina();
 if (!['commerciale', 'titolare'].includes(ROLE)) {
  toast('Solo Acquisti o il titolare possono modificare la copia', 'err');
  return;
}

  let query = db
    .from('progetti_tecnici_schede')
    .select('*')
    .eq('progetto_tecnico_id', progettoId);

  query = schedaId
    ? query.eq('id', schedaId)
    : query.eq('famiglia', famiglia).order('creato_il', { ascending: true }).limit(1);

  const { data: scheda, error } = await query.maybeSingle();

  if (error || !scheda) {
    toast(
      'Errore apertura scheda: ' +
      (error?.message || 'scheda non trovata'),
      'err'
    );
    return;
  }

  // La finestra non è una scheda dell'ingegnere: niente barra delle schede.
  schedaRilievoAperta = null;

  // Quante schede dello stesso tipo (solo con sql/48), per il titolo.
  let quanteStesse = 1;
  if (scheda.numero !== undefined && scheda.numero !== null) {
    const { count } = await db
      .from('progetti_tecnici_schede')
      .select('id', { count: 'exact', head: true })
      .eq('progetto_tecnico_id', progettoId)
      .eq('famiglia', scheda.famiglia);
    quanteStesse = count || 1;
  }

  const datiDaModificare = datiSchedaDaMostrare(scheda);
  const campi = Object.entries(datiDaModificare).filter(function(entry) {
    return campoSchedaDaElencare(entry[0]);
  });

  const box = ge('mrt-content');

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          ✏️ Copia di Acquisti — ${esc(titoloSchedaRilievo(scheda, null, quanteStesse))}
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
            <label>${esc(etichettaCampoTecnico(chiave, scheda.famiglia))}</label>
            <textarea
              id="msc-campo-${indice}"
              rows="2"
            >${esc(valore !== null && typeof valore === 'object' ? valoreSchedaTecnica(valore) : String(valore ?? ''))}</textarea>
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
        Salva copia di Acquisti
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
  toast('Copia di Acquisti salvata', 'ok');

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
  ricordaPosizionePagina();
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
  // Prima restavano le anteprime dell'ultima finestra aperta (file non più scelti)
  await apriFileSceltiFinestraProgetto(progetto.id);

  await mostraImportoProgetto(progetto);
  await mostraFonteRilievoProgetto(progetto);
  await caricaAllegatiProgetto(progetto.id);
  preparaBozzaProgetto(progetto.id);

  openM('m-progetto');
  if (typeof preparaInputVideoProgetto === 'function') preparaInputVideoProgetto(); // F15.9
}

async function apriVerificaTecnica(progettoId) {
  ricordaPosizionePagina();
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

  // Schede di rilievo salvate per tipo (solo con sql/48, js/18)
  if (typeof aggiornaRiepilogoSchedeVerifica === 'function') {
    await aggiornaRiepilogoSchedeVerifica(progetto.id);
  }

  // F15.13: quali schede sono all'ingegnere e quali già ad Acquisti (js/67)
  if (typeof aggiungiRiquadroSmistamento === 'function') {
    await aggiungiRiquadroSmistamento(ge('mvt-riepilogo'), progetto.id);
  }

  openM('m-verifica-tecnica');
  if (typeof preparaInputVideoProgetto === 'function') preparaInputVideoProgetto(); // F15.9
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
      : 'Progetto inviato ad Acquisti',
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

  if (typeof verificaFotoVideoDisponibile === 'function') await verificaFotoVideoDisponibile(); // F15.9

  if (files.some(file => !fileProgettoValido(file))) {
    throw new Error('Puoi caricare solo ' + testoFormatiProgetto());
  }

  if (files.some(file => file.size > limiteFileProgettoSito(file) && !/^image\/(jpeg|png)$/i.test(file.type || ''))) {
    throw new Error('Un file supera il limite (video 50 MB, altri file 10 MB)');
  }

  const { data: authData, error: authError } = await db.auth.getUser();

  if (authError || !authData.user) {
    throw new Error('Sessione non valida');
  }

  const utenteId = authData.user.id;

  // F15.9 (js/56 caricaFileNelProgetto): foto rimpicciolite, impronta del file
  for (const file of files) {
    const caricato = await caricaFileNelProgetto(progettoId, utenteId, file, {});
    if (!caricato.alleg) throw new Error(caricato.errore);
  }
}

// ── F15.17: controllo dei progetti doppi (solo avviso, mai blocco) ─────
// Alla creazione di un progetto NUOVO (rappresentante e titolare): se lo
// stesso cliente ha un progetto non archiviato creato negli ultimi 90 giorni
// la finestra m-progetto-doppione lo mostra con "📂 Apri quello che c'è" o
// "➕ Crea comunque" con il motivo. Con sql/87 l'elenco comprende anche i
// progetti degli altri rappresentanti (RPC progetti_simili_cliente) e il
// motivo si salva nella cronologia (registra_doppione_progetto, che avvisa il
// titolare se il progetto che c'era è di un altro rappresentante). Senza
// sql/87: solo i progetti che chi crea già legge, motivo non salvato.
// La sede non conta: il progetto non ha la sede (nasce sulla commessa).
const DOPPIONI_PROGETTO = { sql: null, giorni: 90 };

function erroreRpcDoppioniMancante(error) {
  if (!error) return false;
  return ['PGRST202', '42883'].includes(error.code) ||
    /could not find the function|progetti_simili_cliente.*does not exist/i.test(String(error.message || ''));
}

async function leggiProgettiSimiliCliente(clienteId) {
  if (DOPPIONI_PROGETTO.sql !== false) {
    const { data, error } = await db.rpc('progetti_simili_cliente', { p_cliente: clienteId });
    if (!error) { DOPPIONI_PROGETTO.sql = true; return data || []; }
    if (!erroreRpcDoppioniMancante(error)) return null; // errore: nessun avviso, si salva come prima
    DOPPIONI_PROGETTO.sql = false;
  }
  const dal = new Date(Date.now() - DOPPIONI_PROGETTO.giorni * 86400000).toISOString();
  const { data, error } = await db
    .from('progetti_tecnici')
    .select('id, titolo, tipologia, stato, creato_il, rappresentante_id')
    .eq('cliente_id', clienteId)
    .neq('stato', 'archiviato')
    .gte('creato_il', dal)
    .order('creato_il', { ascending: false })
    .limit(20);
  if (error) return null;
  return (data || []).map(function(p) {
    const mio = !!(typeof ME !== 'undefined' && ME && p.rappresentante_id === ME.id);
    return Object.assign({}, p, { mio: mio, apribile: true, rappresentante_nome: mio ? null : '' });
  });
}

// Risultato: null = nessun avviso (si salva), { scelta: 'apri', id },
// { scelta: 'crea', esistente, motivo }, { scelta: 'annulla' }
async function controllaProgettoDoppione(clienteId) {
  if (!clienteId || !['rappresentante', 'titolare'].includes(ROLE)) return null;
  if (!ge('m-progetto-doppione')) return null;
  let simili = null;
  try { simili = await leggiProgettiSimiliCliente(clienteId); } catch (e) { simili = null; }
  if (!simili || !simili.length) return null;

  const statoLeggibile = {
    bozza: 'Bozza', da_integrare: 'Integrazione richiesta', inviato_a_commerciale: 'Inviato ad Acquisti',
    in_verifica_tecnica: 'In verifica tecnica', in_valutazione: 'In valutazione',
    pronto_per_preventivo: 'Pronto per preventivo', in_preventivazione: 'In preventivazione', approvato: 'Approvato'
  };
  // per "Crea comunque" si collega prima un progetto di un altro rappresentante (lo sa il titolare)
  const esistente = simili.find(function(p) { return !p.mio; }) || simili[0];

  ge('pdp-titolo').textContent = simili.length === 1
    ? '⚠️ Questo cliente ha già un progetto aperto'
    : '⚠️ Questo cliente ha già ' + simili.length + ' progetti aperti';
  ge('pdp-elenco').innerHTML = simili.map(function(p) {
    const chi = p.mio ? 'tuo' : (p.rappresentante_nome ? 'di ' + p.rappresentante_nome : 'di un altro rappresentante');
    const quando = p.creato_il ? new Date(p.creato_il).toLocaleDateString('it-IT') : '';
    return '<div class="card" style="margin-bottom:8px;padding:10px">' +
      '<div style="font-weight:600">' + esc(p.titolo || 'Progetto senza titolo') + '</div>' +
      '<div style="font-size:12px;color:var(--m);margin:2px 0 6px">' +
        esc([p.tipologia, statoLeggibile[p.stato] || p.stato, quando ? 'creato il ' + quando : '', chi].filter(Boolean).join(' · ')) +
      '</div>' +
      (p.apribile
        ? '<button class="btn sm" type="button" data-pdp-apri="' + esc(p.id) + '">📂 Apri quello che c\'è</button>'
        : '<div style="font-size:12px;color:var(--m)">È di un altro rappresentante: non lo puoi aprire. Se crei comunque il progetto, il titolare ne viene informato.</div>') +
      '</div>';
  }).join('');
  ge('pdp-nota-sql').style.display = DOPPIONI_PROGETTO.sql === false ? 'block' : 'none';
  ge('pdp-motivo').value = '';

  return new Promise(function(resolve) {
    const finestra = ge('m-progetto-doppione');
    let finito = false;
    const osserva = new MutationObserver(function() {
      if (!finestra.classList.contains('on')) chiudi({ scelta: 'annulla' });
    });
    function chiudi(esito) {
      if (finito) return;
      finito = true;
      osserva.disconnect();
      ge('pdp-crea').onclick = null;
      closeM('m-progetto-doppione');
      resolve(esito);
    }
    ge('pdp-elenco').querySelectorAll('[data-pdp-apri]').forEach(function(b) {
      b.onclick = function() { chiudi({ scelta: 'apri', id: b.getAttribute('data-pdp-apri') }); };
    });
    ge('pdp-crea').onclick = function() {
      const motivo = String(ge('pdp-motivo').value || '').trim();
      if (motivo.length < 3) {
        toast('Scrivi il motivo per cui serve un progetto nuovo', 'err');
        ge('pdp-motivo').focus();
        return;
      }
      chiudi({ scelta: 'crea', esistente: esistente.id, motivo: motivo.slice(0, 500) });
    };
    openM('m-progetto-doppione');
    osserva.observe(finestra, { attributes: true, attributeFilter: ['class'] });
    setTimeout(function() { const m = ge('pdp-motivo'); if (m) m.focus(); }, 50);
  });
}

// Dopo l'insert: motivo nella cronologia (e avviso al titolare) con sql/87.
// Un errore qui non ferma nulla: il progetto è già salvato.
async function registraDoppioneProgetto(progettoId, scelta) {
  if (!progettoId || !scelta || DOPPIONI_PROGETTO.sql !== true) return;
  try {
    const { error } = await db.rpc('registra_doppione_progetto', {
      p_progetto: progettoId, p_esistente: scelta.esistente, p_motivo: scelta.motivo
    });
    if (error) toast('Progetto salvato, ma il motivo non si è salvato: ' + error.message, 'info');
  } catch (e) {
    toast('Progetto salvato, ma il motivo non si è salvato', 'info');
  }
}
