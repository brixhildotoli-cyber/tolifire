// js/18-preventivi.js — scheda del preventivo, Rimanda indietro, campi e etichette delle schede tecniche.
// Riordino del 17/11: il resto del vecchio js/18 è in js/18a…18i (stesso ordine,
// codice spostato così com'era): 18a-schede-rilievo, 18b-fornitori-preventivo, 18c-voci-preventivo, 18d-certificati, 18e-salvataggio-pdf-cliente, 18f-richiesta-fornitore, 18g-lead-sito, 18h-esito-anticipo, 18i-commesse.

// MOSTRA PASSWORD 

function togglePasswordLogin() {
  const input = ge('lpw');
  const button = ge('toggle-password');

  if (!input || !button) return;

  const nascosta = input.type === 'password';
  input.type = nascosta ? 'text' : 'password';
  button.textContent = nascosta ? 'Nascondi' : 'Mostra';
}

let currentPreventivoId = null;
let currentPreventivoProgettoId = null;
let currentRilievoProgettoId = null;
let contestoSchedaRilevazione = 'preventivo';


function tornaDaPreventivo() {
  if (ROLE === 'titolare') {
    gotoPage('preventivi-titolare');
    return;
  }

  if (ROLE === 'commerciale') {
    gotoPage('preventivi');
    return;
  }

  if (ROLE === 'rappresentante') {
    gotoPage('preventivi-rapp');
    return;
  }

  gotoPage('dashboard');
}

async function openPreventivoDetail(preventivoId) {
  ricordaPosizionePagina();
  const { data: preventivo, error } = await db
    .from('preventivi')
    .select(`
      *,
      clienti(ragione_sociale),
      progetti_tecnici(
        id,
        titolo,
        tipologia,
        descrizione_tecnica,
        materiali_note,
        stato, 
        nota_verifica_tecnica,
  nota_integrazione,
  integrazione_richiesta_da
      )
    `)
    .eq('id', preventivoId)
    .single();

  if (error || !preventivo) {
    toast(
      'Errore apertura preventivo: ' +
      (error?.message || 'preventivo non trovato'),
      'err'
    );
    return;
  }

  // F5.1: commessa nata dal preventivo accettato (solo con sql/26).
  await aggiungiCommessaAiPreventivi([preventivo]);

  currentPreventivoId = preventivo.id;
  currentPreventivoProgettoId = preventivo.progetto_tecnico_id;
  impostaBloccoVociPreventivo(preventivo.stato);

  const progetto = preventivo.progetti_tecnici;
  const cliente = preventivo.clienti?.ragione_sociale || 'Cliente non disponibile';
  // F15.13: "Rimanda indietro" fermo solo se il progetto ha davvero schede
  // ancora all'ingegnere (gialle dello smistamento, sql/83); senza sql/83 o
  // senza schede gialle resta come prima
  const schedeAncoraIngegnere = preventivo.progetto_tecnico_id && progetto?.stato === 'in_verifica_tecnica' &&
    typeof progettoConSchedeIngegnere === 'function'
    ? await progettoConSchedeIngegnere(preventivo.progetto_tecnico_id) : false;

  ge('pvd-titolo').textContent = 'Preventivo n. ' + preventivo.numero;
  ge('pvd-sottotitolo').textContent =
    cliente + ' · ' + (preventivo.tipo || 'Preventivo');

  ge('pvd-stato').textContent = {
    bozza: 'Bozza',
    inviato: 'Inviato',
    inviato_a_rappresentante: 'Inviato al rappresentante',
    in_attesa_anticipo: 'Accettato, in attesa anticipo',
    accettato: 'Accettato',
    rifiutato: 'Rifiutato',
    scaduto: 'Scaduto'
  }[preventivo.stato] || preventivo.stato || 'Bozza';

  ge('pvd-riepilogo-content').innerHTML = `
    <div class="g2">
      ${ir('Cliente', cliente)}
      ${ir('Tipologia', preventivo.tipo || '—')}
      ${ir('Validità', preventivo.data_scadenza
        ? new Date(preventivo.data_scadenza + 'T00:00:00').toLocaleDateString('it-IT')
        : '—'
      )}
      ${ir('IVA', (preventivo.iva_perc ?? 22) + '%')}
    </div>

    <div class="card" style="margin-top:16px">
      <div style="font-size:14px;font-weight:700">
        📐 Progetto tecnico collegato
      </div>

      <div style="font-size:13px;margin-top:8px">
        ${esc(progetto?.titolo || 'Progetto non disponibile')}
      </div>

      <div style="font-size:12px;color:var(--m);margin-top:4px">
        ${esc(progetto?.tipologia || 'Tipologia non indicata')}
      </div>
    </div>

    ${preventivo.note ? `
      <div style="font-size:13px;font-weight:600;margin:18px 0 8px">
        Note commerciali
      </div>
      <div class="card" style="white-space:pre-wrap">
        ${esc(preventivo.note)}
      </div>
    ` : ''}

<div id="pvd-sconto"></div>

${cardEsitoPreventivo(preventivo)}

${['commerciale', 'titolare'].includes(ROLE) && preventivo.stato === 'bozza' && preventivo.progetto_tecnico_id &&
  schedeAncoraIngegnere ? `
  <div class="al2 i" style="margin-top:16px">
    ↩ <b>Rimanda indietro</b> non è disponibile: il progetto è ancora dall'ingegnere
    (${typeof smistamentoAttivoSubito === 'function' && smistamentoAttivoSubito()
      ? 'smistamento automatico: alcune schede sono in verifica tecnica'
      : 'alcune schede sono ancora in verifica tecnica'}). Torna disponibile
    quando l'ingegnere l'ha approvato. Per un dubbio usa <b>❓ Fai una domanda</b>.
  </div>
` : ''}

${['commerciale', 'titolare'].includes(ROLE) && preventivo.stato === 'bozza' && preventivo.progetto_tecnico_id &&
  !schedeAncoraIngegnere ? `
  <div class="card" style="margin-top:16px;border-left:4px solid #d97706">
    <div style="font-size:14px;font-weight:700">↩ Rimanda indietro il preventivo avviato</div>
    <div style="font-size:12px;color:var(--m);margin:6px 0 10px">
      Il preventivo resta in bozza. Il progetto torna in "Da preventivare",
      oppure va al rappresentante o all'ingegnere con una nota.
    </div>
    <button class="btn warn" onclick="apriRimandaPreventivoAvviato()">↩ Rimanda indietro</button>
  </div>
` : ''}

${ROLE === 'titolare' ? `
  <div class="card" style="margin-top:16px;border-left:4px solid var(--g)">
    <div style="font-size:14px;font-weight:700">
      📎 PDF esterno per il rappresentante
    </div>

    <div style="font-size:12px;color:var(--m);margin:6px 0 12px">
      Carica un PDF già ricevuto o creato esternamente. Il rappresentante vedrà solo questo file.
    </div>

    ${
      preventivo.pdf_esterno_titolare_nome
        ? `<div class="al2 ok" style="margin-bottom:12px">
            PDF attualmente pronto: <b>${esc(preventivo.pdf_esterno_titolare_nome)}</b>
          </div>`
        : ''
    }

    <input
      type="file"
      id="pvd-pdf-esterno-titolare"
      accept="application/pdf,.pdf"
      style="margin-bottom:10px"
    >

    <button
      class="btn p"
      onclick="caricaEInviaPdfEsternoTitolare()"
    >
      📤 Carica e invia PDF al rappresentante
    </button>

    ${preventivo.pdf_esterno_titolare_path ? `
  <button
    class="btn"
    style="margin-left:8px;color:var(--r)"
    onclick="ritiraPdfEsternoTitolare()"
  >
    🗑️ Ritira e cancella PDF inviato
  </button>
` : ''}

  </div>
` : ''}

    ${ROLE === 'titolare' && preventivo.stato === 'inviato_a_rappresentante' ? `
      <div class="card" style="margin-top:16px;border-left:4px solid #d97706">
        <div style="font-size:14px;font-weight:700">
          ↩ Rimanda ad Acquisti
        </div>

        <div style="font-size:12px;color:var(--m);margin:6px 0 10px">
          La nota è facoltativa. Acquisti potrà modificare il preventivo e rigenerare il PDF.
        </div>

        <textarea
          id="pvd-nota-rinvio-titolare"
          rows="3"
          placeholder="Es. Verifica il prezzo della posa, aggiungi una voce o modifica le condizioni..."
        ></textarea>

        <button
          class="btn warn"
          style="margin-top:10px"
          onclick="rimandaPreventivoAlCommerciale()"
        >
          ↩ Rimanda ad Acquisti
        </button>
      </div>
    ` : ''}
  `;

  const notaTecnica =
  progetto?.nota_verifica_tecnica ||
  progetto?.nota_integrazione ||
  '';

  ge('pvd-progetto-content').innerHTML = `
    <div class="g2" style="margin-bottom:16px">
      ${ir('Titolo', progetto?.titolo)}
      ${ir('Tipologia', progetto?.tipologia)}
      ${ir('Stato progetto', progetto?.stato)}
      ${ir('Cliente', cliente)}
    </div>

   ${notaTecnica ? `
  <div class="al2 i" style="margin-bottom:16px;white-space:pre-wrap">
    <b>🔧 Nota dell’ingegnere / modifiche richieste</b><br>
    ${esc(notaTecnica)}
  </div>
` : ''}


    <div class="card" style="white-space:pre-wrap">
      ${esc(progetto?.descrizione_tecnica || 'Nessuna descrizione disponibile.')}
    </div>

    ${progetto?.materiali_note ? `
      <div style="font-size:13px;font-weight:600;margin:18px 0 8px">
        Materiali o note ricevute
      </div>

      <div class="card" style="white-space:pre-wrap">
        ${esc(progetto.materiali_note)}
      </div>
    ` : ''}
  `;
  const { data: allegatiProgetto, error: erroreAllegatiProgetto } = await db
    .from('progetti_tecnici_allegati')
    .select('id,nome_file,storage_path,mime_type,dimensione,caricato_il')
    .eq('progetto_id', preventivo.progetto_tecnico_id)
    .order('caricato_il', { ascending: false });

  if (erroreAllegatiProgetto) {
    ge('pvd-progetto-content').innerHTML += `
      <div class="al2 e" style="margin-top:16px">
        Errore caricamento allegati progetto:
        ${esc(erroreAllegatiProgetto.message)}
      </div>
    `;
  } else if (!allegatiProgetto || !allegatiProgetto.length) {
    ge('pvd-progetto-content').innerHTML += `
      <div class="empty" style="margin-top:16px">
        Nessun file allegato al progetto tecnico.
      </div>
    `;
  } else {
    // 11/11: una sola richiesta per tutti i file, link tenuti in memoria (js/01)
    const linkAllegati = await firmaFileInBlocco(
      'progetti-tecnici',
      allegatiProgetto.map(function(f) { return f.storage_path; }),
      3600
    );
    const fileConLink = allegatiProgetto.map(function(file) {
      return { ...file, url: linkAllegati[file.storage_path] || null };
    });

    ge('pvd-progetto-content').innerHTML += `
      <div style="font-size:13px;font-weight:700;margin:18px 0 8px">
        📎 Allegati del progetto tecnico
      </div>

      ${fileConLink.map(function(file) {
        const dataCaricamento = file.caricato_il
          ? new Date(file.caricato_il).toLocaleString('it-IT')
          : 'Data non disponibile';

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
                  · ${esc(dataCaricamento)}
                </div>
              </div>

              ${
                file.url
                  ? `
                    <a
                      class="btn sm p"
                      href="${file.url}"
                      target="_blank"
                      rel="noopener"
                    >
                      Apri file
                    </a>
                  `
                  : `
                    <span style="font-size:12px;color:var(--r)">
                      File non disponibile
                    </span>
                  `
              }
            </div>
          </div>
        `;
      }).join('')}
    `;
  }
  await renderSchedePreventivo();
  await renderFornitoriPreventivo();
  await renderCostiPreventivo();
  await renderCertificatiPreventivo();
  // F14.15: domande sul preventivo (js/62, attive con sql/70)
  if (typeof caricaDomandeRecord === 'function') await caricaDomandeRecord('preventivi', preventivo.id, 'pvd-domande');
  // F14.16: intestazione, "Cosa puoi fare", Collegati e Storico (js/63):
  // le azioni dipendono solo da ruolo e stato, non da dove si arriva.
  if (typeof caricaSchedaOggetto === 'function') await caricaSchedaOggetto('preventivo', preventivo, 'pvd-scheda-oggetto');
  // sql/258: sconto del rappresentante (js/69; senza sql/258 non mostra nulla)
  if (typeof caricaScontoPreventivoDettaglio === 'function') caricaScontoPreventivoDettaglio(preventivo, 'pvd-sconto');
  gotoPage('preventivo-detail');
  
}

// ── Rimanda indietro un preventivo avviato (ancora in bozza) ─────────
// Commerciale o titolare, dal riepilogo. Il preventivo resta in bozza con
// le sue voci; cambia solo lo stato del progetto tecnico:
//   da_preventivare → inviato_a_commerciale (torna nella lista "Da preventivare")
//   rappresentante  → da_integrare, con nota (come "Richiedi integrazione")
//   ingegnere       → in_verifica_tecnica, con nota
// Quando il progetto torna in "Da preventivare" la lista mostra
// "Riprendi preventivo" (js/17 loadProgettiDaPreventivare).
async function apriRimandaPreventivoAvviato() {
  // F15.13: progetto ancora dall'ingegnere con schede gialle dello
  // smistamento (le verdi già ad Acquisti): non si rimanda indietro finché
  // non lo approva (lo rifiuta anche il database, sql/83)
  if (currentPreventivoId && typeof progettoConSchedeIngegnere === 'function') {
    const { data: prev } = await db.from('preventivi')
      .select('progetto_tecnico_id, progetti_tecnici(stato)').eq('id', currentPreventivoId).maybeSingle();
    if (prev && prev.progetti_tecnici && prev.progetti_tecnici.stato === 'in_verifica_tecnica' &&
        await progettoConSchedeIngegnere(prev.progetto_tecnico_id)) {
      toast('Il progetto è ancora dall’ingegnere (verifica tecnica): si rimanda indietro dopo la sua approvazione', 'err');
      return;
    }
  }
  ge('mrpa-destinazione').value = 'da_preventivare';
  ge('mrpa-nota').value = '';
  aggiornaFinestraRimandaPreventivo();
  openM('m-rimanda-preventivo-avviato');
}

function aggiornaFinestraRimandaPreventivo() {
  const conNota = v('mrpa-destinazione') !== 'da_preventivare';
  ge('mrpa-nota-label').textContent = conNota ? 'Nota / modifiche richieste *' : 'Nota (facoltativa)';
}

async function confermaRimandaPreventivoAvviato() {
  if (!['commerciale', 'titolare'].includes(ROLE)) return;
  const destinazione = v('mrpa-destinazione');
  const nota = v('mrpa-nota').trim();

  if (destinazione !== 'da_preventivare' && !nota) {
    toast('Scrivi la nota: cosa va modificato o integrato', 'err');
    ge('mrpa-nota').focus();
    return;
  }

  const { data: preventivo, error: erroreLettura } = await db
    .from('preventivi')
    .select('id, numero, stato, progetto_tecnico_id')
    .eq('id', currentPreventivoId)
    .single();

  if (erroreLettura || !preventivo) {
    toast('Impossibile leggere il preventivo: ' + (erroreLettura?.message || ''), 'err');
    return;
  }
  if (preventivo.stato !== 'bozza' || !preventivo.progetto_tecnico_id) {
    toast('Si rimanda indietro solo un preventivo ancora in bozza', 'err');
    return;
  }

  const nuovoStato = {
    da_preventivare: 'inviato_a_commerciale',
    rappresentante: 'da_integrare',
    ingegnere: 'in_verifica_tecnica'
  }[destinazione];

  const modifiche = {
    stato: nuovoStato,
    aggiornato_il: new Date().toISOString()
  };
  if (destinazione !== 'da_preventivare') {
    modifiche.nota_integrazione = nota;
    modifiche.integrazione_richiesta_da = ROLE;
    modifiche.integrazione_letta_rappresentante_il = null;
  }

  const bottone = ge('mrpa-conferma');
  if (bottone) bottone.disabled = true;

  const { data, error } = await db
    .from('progetti_tecnici')
    .update(modifiche)
    .eq('id', preventivo.progetto_tecnico_id)
    .in('stato', ['inviato_a_commerciale', 'pronto_per_preventivo', 'in_preventivazione'])
    .select('id');

  if (bottone) bottone.disabled = false;

  if (error || !data?.length) {
    toast('Rinvio non riuscito: ' + (error?.message || 'il progetto non è più in preventivazione'), 'err');
    return;
  }

  closeM('m-rimanda-preventivo-avviato');
  toast({
    da_preventivare: 'Progetto tornato in "Da preventivare": il preventivo n. ' + preventivo.numero + ' resta in bozza',
    rappresentante: 'Progetto rimandato al rappresentante con la nota',
    ingegnere: 'Progetto rimandato all’ingegnere con la nota'
  }[destinazione], 'ok');

  gotoPage('progetti-da-preventivare');
}

async function rimandaPreventivoAlCommerciale() {
  if (ROLE !== 'titolare') return;

  const nota = (
    ge('pvd-nota-rinvio-titolare')?.value || ''
  ).trim();

  if (!confirm(
    'Rimandare questo preventivo ad Acquisti per la revisione?'
  )) {
    return;
  }

  const { error } = await db.rpc(
    'rimanda_preventivo_al_commerciale',
    {
      p_preventivo_id: currentPreventivoId,
      p_nota: nota || null
    }
  );

  if (error) {
    toast('Errore durante il rinvio: ' + error.message, 'err');
    return;
  }

  toast('Preventivo rimandato ad Acquisti', 'ok');
  gotoPage('preventivi-titolare');
}

function campoPreventivo(label, id, valore = '', tipo = 'text', placeholder = '') {
  return `
    <div class="f">
      <label>${label}</label>
      <input
        type="${tipo}"
        id="${id}"
        value="${esc(String(valore || ''))}"
        placeholder="${esc(placeholder)}"
      >
    </div>
  `;
}

function areaPreventivo(label, id, valore = '', placeholder = '') {
  return `
    <div class="f">
      <label>${label}</label>
      <textarea
        id="${id}"
        rows="3"
        placeholder="${esc(placeholder)}"
      >${esc(String(valore || ''))}</textarea>
    </div>
  `;
}

function selectPreventivo(label, id, valore, opzioni) {
  // F15.1: etichetta e valori del menu dal catalogo lavorazioni (js/55, sql/75), se c'è
  if (typeof adattaMenuSchedaCatalogo === 'function') {
    const dalCatalogo = adattaMenuSchedaCatalogo(label, id, valore, opzioni);
    label = dalCatalogo.label;
    opzioni = dalCatalogo.opzioni;
  }
  // F15.3: "non noto" della richiesta indicativa (motore delle schede, js/56)
  opzioni = opzioni.map(function(o) {
    return o.value === 'non_noto' ? { value: o.value, label: '❓ Non noto (da chiedere al cliente)' } : o;
  });
  return `
    <div class="f">
      <label>${label}</label>
      <select id="${id}">
        ${opzioni.map(function(opzione) {
          return `
            <option
              value="${esc(opzione.value)}"
              ${valore === opzione.value ? 'selected' : ''}
            >
              ${esc(opzione.label)}
            </option>
          `;
        }).join('')}
      </select>
    </div>
  `;
}

function etichettaFamigliaTecnica(famiglia) {
  // F15.1: prima il nome nel catalogo lavorazioni (js/55, sql/75), poi l'elenco fisso
  const daCatalogo = typeof nomeLavorazioneCatalogo === 'function' ? nomeLavorazioneCatalogo(famiglia) : '';
  if (daCatalogo) return daCatalogo;

  const etichette = {
    comune: 'Blocco comune',
    porte_rei: 'Porte e portoni REI',
    manutenzione_porte_rei: 'Manutenzione porte REI / presidi',
    estintori: 'Estintori',
    compartimentazione: 'Compartimentazione',
    vernice_intumescente: 'Vernice intumescente',
    impianti_spegnimento: 'Impianti di spegnimento',
    progettazione: 'Progettazione',
    formazione: 'Formazione',
    rilevazione_incendi: 'Impianti di rilevazione incendi',
    coppelle: 'Coppelle'
  };

  return etichette[famiglia] ||
    String(famiglia || 'Scheda tecnica')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function(lettera) {
        return lettera.toUpperCase();
      });
}

// F15.6: con la famiglia della scheda (facoltativa) le lavorazioni migrate nel
// catalogo (sql/80, js/56) usano l'etichetta del campo, anche rinominato dal
// titolare: il codice (la chiave del dato) non cambia.
function etichettaCampoTecnico(campo, famiglia) {
  const daMigrazione = famiglia && typeof etichettaCampoFamigliaMigrata === 'function'
    ? etichettaCampoFamigliaMigrata(famiglia, campo) : '';
  if (daMigrazione) return daMigrazione;

  const etichette = {
    tipo_intervento: 'Tipo di intervento',
    pareti_cartongesso: 'Pareti in cartongesso',
    // Coppelle (protezione antincendio delle tubazioni)
    materiale_tubazione: 'Materiale della tubazione',
    uso_tubazione: 'Uso / fluido della tubazione',
    diametro: 'Diametro esterno tubazione (mm)',
    lunghezza: 'Lunghezza da rivestire (m)',
    numero_tratti: 'Numero di tratti / tubazioni',
    spessore: 'Spessore coppella (mm)',
    classe_resistenza: 'Classe di resistenza al fuoco',
    supporto_attraversato: 'Parete o solaio attraversato',
    numero_attraversamenti_coppelle: 'Numero di attraversamenti',
    reazione_fuoco: 'Reazione al fuoco richiesta',
    finitura: 'Finitura esterna',
    ostacoli: 'Ostacoli e interferenze',
    progetto_esistente: 'Progetto esistente fornito dal cliente',
    sorveglianza: 'Livello di sorveglianza',
    marca: 'Marca richiesta / impianto esistente',
    centrale_tipo: 'Tipo di centrale',
    loop: 'Numero loop',
    indirizzi_loop: 'Indirizzi per loop',
    margine_espansione: 'Margine di espansione',
    accessori_centrale: 'Accessori centrale',
    comandi_terzi: 'Comandi a terzi / moduli I-O',
    interfacce: 'Interfacce con impianti esistenti',
    rivelatori_ottici: 'Rivelatori ottici di fumo',
    rivelatori_termici: 'Rivelatori termici',
    rivelatori_speciali: 'Rivelatori speciali',
    barriere: 'Barriere lineari ottiche',
    barriere_portata: 'Portata barriere',
    vesda_unita: 'Unità ASD / VESDA',
    vesda_tubazione: 'Tubazione ASD / VESDA',
    vesda_fori: 'Fori ASD / VESDA',
    cavo_termosensibile: 'Cavo termosensibile',
    pulsanti_manuali: 'Pulsanti manuali',
    sirene: 'Pannelli ottico-acustici / sirene',
    cartellonistica: 'Targhe e cartellonistica',
    altezza: 'Altezza soffitto / note ambiente',
    atex: 'Presenza ATEX',
    superficie: 'Superficie',
    locali: 'Locali / compartimenti',
    struttura: 'Travi, controsoffitti e struttura',
    ambienti_gravosi: 'Ambienti gravosi / grado IP',
    cavo_schermato: 'Cavo schermato twistato',
    cavo_resistente: 'Cavo resistente al fuoco',
    posa: 'Tipo di posa',
    canalizzazioni_da: 'Canalizzazioni fornite da',
    sigillature: 'Sigillature compartimenti',
    altezza_lavoro: 'Altezza di lavoro',
    note_posa: 'Forature, ripristini e note posa',
    collaudo: 'Collaudo e chiusura',
    manutenzione: 'Dati manutenzione',
    note_calcolo: 'Note interne per il calcolo',
    // F15.3: dati scritti dal motore delle schede (js/56)
    tipo_richiesta: 'Tipo di richiesta',
    indirizzo_lavori: 'Indirizzo dei lavori',
    referente_lavori: 'Referente sul posto',
    telefono_referente: 'Telefono del referente'
  };

  // F15.3: le chiavi che non sono qui prendono il nome dal catalogo (js/56), se c'è
  const daCatalogo = !etichette[campo] && typeof etichettaCampoCatalogo === 'function' ? etichettaCampoCatalogo(campo) : '';

  return etichette[campo] || daCatalogo ||
    String(campo)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function(lettera) {
        return lettera.toUpperCase();
      });
}

// F15.6: con chiave e famiglia (facoltative) i valori dei menu delle lavorazioni
// migrate si leggono con l'etichetta del catalogo (js/56).
function valoreSchedaTecnica(valore, campo, famiglia) {
  if (valore === null || valore === undefined || valore === '') {
    return '—';
  }

  const daMigrazione = campo && famiglia && typeof valoreCampoFamigliaMigrata === 'function'
    ? valoreCampoFamigliaMigrata(famiglia, campo, valore) : '';
  if (daMigrazione) return daMigrazione;

  if (valore === 'si') return 'Sì';
  if (valore === 'no') return 'No';
  // F15.3: "non noto" della richiesta indicativa e numeri del motore delle schede (js/56)
  if (valore === 'non_noto') return 'Non noto (da chiedere al cliente)';
  if (typeof valore === 'number') return valore.toLocaleString('it-IT', { maximumFractionDigits: 3 });

  if (Array.isArray(valore)) {
    if (!valore.length) return '—';
    // Pareti in cartongesso della compartimentazione
    if (valore.every(function(r) { return r && typeof r === 'object' && ('larghezza' in r || 'angolo' in r); })) {
      return valore.map(testoPareteCartongesso).join('\n');
    }
    return valore.map(function(r) { return typeof r === 'object' ? JSON.stringify(r) : String(r); }).join('\n');
  }

  if (typeof valore === 'object') {
    return JSON.stringify(valore);
  }

  return String(valore)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, function(lettera) {
      return lettera.toUpperCase();
    });
}
