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

  currentPreventivoId = preventivo.id;
  currentPreventivoProgettoId = preventivo.progetto_tecnico_id;

  const progetto = preventivo.progetti_tecnici;
  const cliente = preventivo.clienti?.ragione_sociale || 'Cliente non disponibile';

  ge('pvd-titolo').textContent = 'Preventivo n. ' + preventivo.numero;
  ge('pvd-sottotitolo').textContent =
    cliente + ' · ' + (preventivo.tipo || 'Preventivo');

  ge('pvd-stato').textContent = {
    bozza: 'Bozza',
    inviato: 'Inviato',
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
          ↩ Rimanda al commerciale
        </div>

        <div style="font-size:12px;color:var(--m);margin:6px 0 10px">
          La nota è facoltativa. Il commerciale potrà modificare il preventivo e rigenerare il PDF.
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
          ↩ Rimanda al commerciale
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
    const fileConLink = await Promise.all(
      allegatiProgetto.map(async function(file) {
        const { data } = await db.storage
          .from('progetti-tecnici')
          .createSignedUrl(file.storage_path, 3600);

        return {
          ...file,
          url: data?.signedUrl || null
        };
      })
    );

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
  gotoPage('preventivo-detail');
  
}

async function rimandaPreventivoAlCommerciale() {
  if (ROLE !== 'titolare') return;

  const nota = (
    ge('pvd-nota-rinvio-titolare')?.value || ''
  ).trim();

  if (!confirm(
    'Rimandare questo preventivo al commerciale per la revisione?'
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

  toast('Preventivo rimandato al commerciale', 'ok');
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
    rilevazione_incendi: 'Impianti di rilevazione incendi'
  };

  return etichette[famiglia] ||
    String(famiglia || 'Scheda tecnica')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function(lettera) {
        return lettera.toUpperCase();
      });
}

function etichettaCampoTecnico(campo) {
  const etichette = {
    tipo_intervento: 'Tipo di intervento',
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
    note_calcolo: 'Note interne per il calcolo'
  };

  return etichette[campo] ||
    String(campo)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function(lettera) {
        return lettera.toUpperCase();
      });
}

function valoreSchedaTecnica(valore) {
  if (valore === null || valore === undefined || valore === '') {
    return '—';
  }

  if (valore === 'si') return 'Sì';
  if (valore === 'no') return 'No';

  if (typeof valore === 'object') {
    return JSON.stringify(valore);
  }

  return String(valore)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, function(lettera) {
      return lettera.toUpperCase();
    });
}

async function renderSchedePreventivo() {
  const box = ge('pvd-schede-content');

  if (!box || !currentPreventivoProgettoId) return;

  box.innerHTML =
    '<div class="load">Caricamento rilievi dell’ingegnere...</div>';

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('id,famiglia,dati,dati_commerciali,stato,aggiornato_il')
    .eq('progetto_tecnico_id', currentPreventivoProgettoId)
    .order('aggiornato_il', { ascending: false });

  if (error) {
    box.innerHTML = `
      <div class="al2 e">
        Errore caricamento schede tecniche: ${esc(error.message)}
      </div>
    `;
    return;
  }

  if (!data || !data.length) {
    box.innerHTML = `
      <div class="empty">
        L’ingegnere non ha ancora compilato alcun rilievo tecnico.
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="al2 i" style="margin-bottom:14px">
      📝 I rilievi originali dell’ingegnere restano invariati.
      Il commerciale può modificare la copia destinata ai fornitori.
    </div>

    ${data.map(function(scheda) {
      const modificataCommerciale = schedaHaDatiCommerciali(scheda);
      const datiVisualizzati = datiSchedaDaMostrare(scheda);

      const campi = Object.entries(datiVisualizzati)
        .filter(function(entry) {
          const valore = entry[1];
          return valore !== null &&
            valore !== undefined &&
            valore !== '';
        });

      return `
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px">
            <div>
              <div style="font-size:15px;font-weight:700">
                📝 ${esc(etichettaFamigliaTecnica(scheda.famiglia))}
              </div>

              <div style="font-size:12px;color:var(--m);margin-top:4px">
                ${
                  scheda.aggiornato_il
                    ? 'Aggiornata il ' +
                      new Date(scheda.aggiornato_il).toLocaleString('it-IT')
                    : 'Data aggiornamento non disponibile'
                }
              </div>

              ${
                modificataCommerciale
                  ? `
                    <div style="font-size:12px;color:var(--o);margin-top:4px">
                      ✏️ Copia commerciale attiva
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
                      '${currentPreventivoProgettoId}',
                      '${scheda.famiglia}'
                    )"
                  >
                    ✏️ Modifica copia
                  </button>
                `
                : '<span class="bx bok">Solo lettura</span>'
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
              : '<div class="empty">La scheda non contiene ancora dati.</div>'
          }
        </div>
      `;
    }).join('')}
  `;
}

async function apriSchedaRilevazioneIngegnere() {
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  contestoSchedaRilevazione = 'progetto';

  openM('m-rilievo-tecnico');
  await apriSchedaRilevazioneIncendi();
}

function chiudiSchedaRilevazione() {
  if (contestoSchedaRilevazione === 'progetto') {
    closeM('m-rilievo-tecnico');
    return;
  }

  renderSchedePreventivo();
}

async function apriSchedaPorteReiIngegnere() {
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;

  openM('m-rilievo-tecnico');
  await apriSchedaPorteRei();
}

function chiudiSchedaPorteRei() {
  closeM('m-rilievo-tecnico');
}

async function apriSchedaPorteRei() {
  const box = ge('mrt-content');

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('dati')
    .eq('progetto_tecnico_id', currentRilievoProgettoId)
    .eq('famiglia', 'porte_rei')
    .maybeSingle();

  if (error) {
    toast('Errore apertura scheda: ' + error.message, 'err');
    return;
  }

  const d = data?.dati || {};

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🚪 Porte e portoni REI
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Fornitura e posa di porte tagliafuoco certificate.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaPorteRei()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Intervento richiesto</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipo di intervento *', 'pr-tipo-intervento', d.tipo_intervento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'fornitura_e_posa', label: 'Fornitura e posa' },
          { value: 'sostituzione', label: 'Sostituzione porta esistente' },
          { value: 'adeguamento', label: 'Adeguamento' },
          { value: 'manutenzione', label: 'Manutenzione' }
        ])}

        ${selectPreventivo('Resistenza al fuoco richiesta *', 'pr-rei', d.rei || '', [
          { value: '', label: 'Seleziona' },
          { value: 'rei_60', label: 'REI 60' },
          { value: 'rei_90', label: 'REI 90' },
          { value: 'rei_120', label: 'REI 120' },
          { value: 'classe_superiore', label: 'Classe superiore / da definire' }
        ])}
      </div>
    </div>

    <div class="rap-section">2. Dati della porta</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipologia *', 'pr-tipologia', d.tipologia || '', [
          { value: '', label: 'Seleziona' },
          { value: 'battente_singolo', label: 'Battente singolo' },
          { value: 'battente_doppio', label: 'Battente doppio' },
          { value: 'scorrevole', label: 'Scorrevole' },
          { value: 'portone', label: 'Portone' },
          { value: 'serranda', label: 'Serranda' },
          { value: 'altro', label: 'Altro' }
        ])}

        ${campoPreventivo('Quantità *', 'pr-quantita', d.quantita, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Larghezza (cm) *', 'pr-larghezza', d.larghezza, 'number', 'Es. 120')}
        ${campoPreventivo('Altezza (cm) *', 'pr-altezza', d.altezza, 'number', 'Es. 210')}
      </div>

      <div class="fr">
        ${campoPreventivo('Colore / finitura *', 'pr-colore', d.colore, 'text', 'Es. bianco RAL 9010')}

        ${selectPreventivo('Maniglione antipanico', 'pr-maniglione', d.maniglione || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>
    </div>

    <div class="rap-section">3. Vano e parete</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipo di parete', 'pr-parete', d.parete || '', [
          { value: '', label: 'Seleziona' },
          { value: 'muratura', label: 'Muratura' },
          { value: 'cemento_armato', label: 'Cemento armato' },
          { value: 'cartongesso', label: 'Cartongesso' },
          { value: 'altro', label: 'Altro / da verificare' }
        ])}

        ${campoPreventivo('Spessore parete (mm)', 'pr-spessore-parete', d.spessore_parete, 'number')}
      </div>

      <div class="fr">
        ${selectPreventivo('Verso di apertura', 'pr-verso-apertura', d.verso_apertura || '', [
          { value: '', label: 'Seleziona' },
          { value: 'interno', label: 'Verso interno' },
          { value: 'esterno', label: 'Verso esterno' },
          { value: 'destra', label: 'Destra' },
          { value: 'sinistra', label: 'Sinistra' },
          { value: 'da_verificare', label: 'Da verificare' }
        ])}

        ${selectPreventivo('Stato vano', 'pr-stato-vano', d.stato_vano || '', [
          { value: '', label: 'Seleziona' },
          { value: 'pronto', label: 'Pronto per posa' },
          { value: 'da_adeguare', label: 'Da adeguare' },
          { value: 'da_verificare', label: 'Da verificare' }
        ])}
      </div>

      ${areaPreventivo(
        'Note su vano, muratura, misure o criticità',
        'pr-note-vano',
        d.note_vano,
        'Indica eventuali difformità, opere murarie o verifiche necessarie.'
      )}
    </div>

    <div class="rap-section">4. Posa e logistica</div>

    <div class="card">
      <div class="fr">
        ${campoPreventivo('Piano / area di installazione', 'pr-piano', d.piano, 'text', 'Es. piano terra, magazzino')}
        ${selectPreventivo('Smontaggio e smaltimento porta esistente', 'pr-smaltimento', d.smaltimento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      ${areaPreventivo(
        'Accesso, trasporto, opere murarie/elettriche e difficoltà di posa',
        'pr-logistica',
        d.logistica,
        'Scale, ascensore, PLE, fasce orarie, ripristini, demolizioni...'
      )}
    </div>

    <div class="rap-section">5. Note tecniche</div>

    <div class="card">
      ${areaPreventivo(
        'Indicazioni per preventivo e posa',
        'pr-note-tecniche',
        d.note_tecniche,
        'Lavorazioni incluse, esclusioni, tempi, criticità e note interne.'
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaPorteRei()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaPorteRei()">
        Salva scheda Porte REI
      </button>
    </div>
  `;
}

async function salvaSchedaPorteRei() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  const dati = {
    tipo_intervento: v('pr-tipo-intervento'),
    rei: v('pr-rei'),
    tipologia: v('pr-tipologia'),
    quantita: v('pr-quantita'),
    larghezza: v('pr-larghezza'),
    altezza: v('pr-altezza'),
    colore: v('pr-colore'),
    maniglione: v('pr-maniglione'),
    parete: v('pr-parete'),
    spessore_parete: v('pr-spessore-parete'),
    verso_apertura: v('pr-verso-apertura'),
    stato_vano: v('pr-stato-vano'),
    note_vano: v('pr-note-vano'),
    piano: v('pr-piano'),
    smaltimento: v('pr-smaltimento'),
    logistica: v('pr-logistica'),
    note_tecniche: v('pr-note-tecniche')
  };

  if (
    !dati.tipo_intervento ||
    !dati.rei ||
    !dati.tipologia ||
    !dati.quantita ||
    !dati.larghezza ||
    !dati.altezza ||
    !dati.colore
  ) {
    toast(
      'Compila tipo intervento, REI, tipologia, quantità, larghezza, altezza e colore',
      'err'
    );
    return;
  }

  const riga = {
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'porte_rei',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  };

  const { error } = await db
    .from('progetti_tecnici_schede')
    .upsert(riga, {
      onConflict: 'progetto_tecnico_id,famiglia'
    });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  toast('Scheda Porte REI salvata', 'ok');
  closeM('m-rilievo-tecnico');
}


async function apriSchedaEstintoriIngegnere() {
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;

  openM('m-rilievo-tecnico');
  await apriSchedaEstintori();
}

function chiudiSchedaEstintori() {
  closeM('m-rilievo-tecnico');
}

async function apriSchedaEstintori() {
  const box = ge('mrt-content');

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('dati')
    .eq('progetto_tecnico_id', currentRilievoProgettoId)
    .eq('famiglia', 'estintori')
    .maybeSingle();

  if (error) {
    toast('Errore apertura scheda: ' + error.message, 'err');
    return;
  }

  const d = data?.dati || {};

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🧯 Estintori
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Rilievo per fornitura, sostituzione, manutenzione o adeguamento.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaEstintori()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Intervento</div>

    <div class="card">
      ${selectPreventivo('Tipo di intervento *', 'es-tipo-intervento', d.tipo_intervento || '', [
        { value: '', label: 'Seleziona' },
        { value: 'fornitura', label: 'Fornitura' },
        { value: 'sostituzione', label: 'Sostituzione' },
        { value: 'manutenzione', label: 'Manutenzione' },
        { value: 'adeguamento', label: 'Adeguamento' }
      ])}
    </div>

    <div class="rap-section">2. Estintori richiesti</div>

    <div class="card">
      <div class="fr">
        ${campoPreventivo('Numero estintori esistenti *', 'es-numero-esistenti', d.numero_esistenti, 'number')}
        ${campoPreventivo('Numero estintori da installare *', 'es-numero-installare', d.numero_installare, 'number')}
      </div>

      <div class="fr">
        ${selectPreventivo('Tipologia *', 'es-tipologia', d.tipologia || '', [
          { value: '', label: 'Seleziona' },
          { value: 'polvere', label: 'Polvere' },
          { value: 'co2', label: 'CO₂' },
          { value: 'schiuma', label: 'Schiuma' },
          { value: 'idrico', label: 'Idrico' },
          { value: 'altro', label: 'Altro' }
        ])}

        ${selectPreventivo('Peso o capacità *', 'es-capacita', d.capacita || '', [
          { value: '', label: 'Seleziona' },
          { value: '2_kg', label: '2 kg' },
          { value: '4_kg', label: '4 kg' },
          { value: '6_kg', label: '6 kg' },
          { value: '9_kg', label: '9 kg' },
          { value: 'altro', label: 'Altro' }
        ])}
      </div>

      ${campoPreventivo(
        'Classe di spegnimento e capacità estinguente richiesta *',
        'es-classe-spegnimento',
        d.classe_spegnimento,
        'text',
        'Es. 34A 233B C'
      )}
    </div>

    <div class="rap-section">3. Stato e posizionamento</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Stato estintori esistenti', 'es-stato-esistenti', d.stato_esistenti || '', [
          { value: '', label: 'Seleziona' },
          { value: 'validi', label: 'Validi' },
          { value: 'scaduti', label: 'Scaduti' },
          { value: 'da_revisionare', label: 'Da revisionare' },
          { value: 'da_sostituire', label: 'Da sostituire' }
        ])}

        ${selectPreventivo('Estintori carrellati necessari', 'es-carrellati', d.carrellati || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      ${areaPreventivo(
        'Posizionamento, altezza, accessibilità, distanze di copertura e aree protette *',
        'es-posizionamento',
        d.posizionamento,
        'Indica postazioni, distanze, ostacoli e criticità.'
      )}
    </div>

    <div class="rap-section">4. Accessori e documentazione</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Cartellonistica presente', 'es-cartellonistica', d.cartellonistica || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_integrare', label: 'Da integrare' }
        ])}

        ${selectPreventivo('Smaltimento estintori esistenti', 'es-smaltimento', d.smaltimento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      ${areaPreventivo(
        'Armadietti, piantane, cassette o supporti necessari',
        'es-supporti',
        d.supporti
      )}

      ${areaPreventivo(
        'Registro antincendio e cartellini manutentivi',
        'es-registro',
        d.registro,
        'Indica se presenti, da aggiornare o da predisporre.'
      )}
    </div>

    <div class="rap-section">5. Foto e note</div>

    <div class="card">
      ${areaPreventivo(
        'Foto postazioni caricate negli allegati',
        'es-foto-postazioni',
        d.foto_postazioni,
        'Es. Foto ingresso, magazzino, piano primo...'
      )}

      ${areaPreventivo(
        'Note tecniche per il preventivo',
        'es-note-tecniche',
        d.note_tecniche,
        'Criticità, lavorazioni incluse, esclusioni e indicazioni.'
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaEstintori()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaEstintori()">
        Salva scheda estintori
      </button>
    </div>
  `;
}

async function salvaSchedaEstintori() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  const dati = {
    tipo_intervento: v('es-tipo-intervento'),
    numero_esistenti: v('es-numero-esistenti'),
    numero_installare: v('es-numero-installare'),
    tipologia: v('es-tipologia'),
    capacita: v('es-capacita'),
    classe_spegnimento: v('es-classe-spegnimento'),
    stato_esistenti: v('es-stato-esistenti'),
    carrellati: v('es-carrellati'),
    posizionamento: v('es-posizionamento'),
    cartellonistica: v('es-cartellonistica'),
    smaltimento: v('es-smaltimento'),
    supporti: v('es-supporti'),
    registro: v('es-registro'),
    foto_postazioni: v('es-foto-postazioni'),
    note_tecniche: v('es-note-tecniche')
  };

  if (
    !dati.tipo_intervento ||
    !dati.numero_esistenti ||
    !dati.numero_installare ||
    !dati.tipologia ||
    !dati.capacita ||
    !dati.classe_spegnimento ||
    !dati.posizionamento
  ) {
    toast(
      'Compila intervento, quantità, tipologia, capacità, classe di spegnimento e posizionamento',
      'err'
    );
    return;
  }

  const { error } = await db
    .from('progetti_tecnici_schede')
    .upsert({
      progetto_tecnico_id: currentRilievoProgettoId,
      famiglia: 'estintori',
      dati: dati,
      stato: 'bozza',
      compilato_da: ME.id,
      aggiornato_il: new Date().toISOString()
    }, {
      onConflict: 'progetto_tecnico_id,famiglia'
    });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  toast('Scheda estintori salvata', 'ok');
  closeM('m-rilievo-tecnico');
}

async function apriSchedaRilevazioneIncendi() {
  const usaProgetto = contestoSchedaRilevazione === 'progetto';

  const box = usaProgetto
    ? ge('mrt-content')
    : ge('pvd-schede-content');

  const tabella = usaProgetto
    ? 'progetti_tecnici_schede'
    : 'preventivi_schede_tecniche';

  const colonnaId = usaProgetto
    ? 'progetto_tecnico_id'
    : 'preventivo_id';

  const riferimentoId = usaProgetto
    ? currentRilievoProgettoId
    : currentPreventivoId;

  const { data, error } = await db
    .from(tabella)
    .select('dati')
    .eq(colonnaId, riferimentoId)
    .eq('famiglia', 'rilevazione_incendi')
    .maybeSingle();

  if (error) {
    toast('Errore apertura scheda: ' + error.message, 'err');
    return;
  }

  const d = data?.dati || {};

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🚨 Rilevazione incendi
        </div>
        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Compila solo ciò che serve per questo impianto.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaRilevazione()">
        ← Schede
      </button>
    </div>

    <div class="rap-section">1. Tipo di intervento</div>
    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipo di intervento *', 'ri-tipo-intervento', d.tipo_intervento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'nuovo_impianto', label: 'Nuovo impianto' },
          { value: 'ampliamento', label: 'Ampliamento' },
          { value: 'adeguamento', label: 'Adeguamento' },
          { value: 'sostituzione_centrale', label: 'Sostituzione centrale' },
          { value: 'manutenzione', label: 'Manutenzione' }
        ])}

        ${selectPreventivo('Progetto esistente fornito dal cliente?', 'ri-progetto-esistente', d.progetto_esistente || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No — includere progettazione UNI 9795' }
        ])}
      </div>

      <div class="fr">
        ${selectPreventivo('Livello di sorveglianza', 'ri-sorveglianza', d.sorveglianza || '', [
          { value: '', label: 'Seleziona' },
          { value: 'totale', label: 'Totale' },
          { value: 'parziale', label: 'Parziale' },
          { value: 'locale', label: 'Locale' }
        ])}

        ${campoPreventivo('Marca richiesta / impianto esistente', 'ri-marca', d.marca, 'text', 'Es. Notifier, Inim, Bosch...')}
      </div>
    </div>

    <div class="rap-section">2. Centrale e architettura</div>
    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipo di centrale', 'ri-centrale-tipo', d.centrale_tipo || '', [
          { value: '', label: 'Seleziona' },
          { value: 'convenzionale', label: 'Convenzionale' },
          { value: 'analogica_indirizzata', label: 'Analogica indirizzata' },
          { value: 'wireless', label: 'Wireless' },
          { value: 'ibrida', label: 'Ibrida' }
        ])}

        ${campoPreventivo('Numero loop', 'ri-loop', d.loop, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Indirizzi per loop', 'ri-indirizzi-loop', d.indirizzi_loop, 'number')}
        ${campoPreventivo('Margine espansione (%)', 'ri-margine-espansione', d.margine_espansione, 'number', 'Es. 25')}
      </div>

      ${areaPreventivo(
        'Ripetitori, batterie, alimentatori, combinatore GSM, quadro sinottico o collegamenti esterni',
        'ri-accessori-centrale',
        d.accessori_centrale,
        'Indica quantità, autonomia 24h/72h, collegamento vigilanza/VVF...'
      )}

      ${areaPreventivo(
        'Comandi a terzi / moduli I-O',
        'ri-comandi-terzi',
        d.comandi_terzi,
        'Serrande, elettromagneti, EVAC, ascensori, gruppi elettrogeni, sgancio...'
      )}

      ${areaPreventivo(
        'Interfacce con impianti esistenti',
        'ri-interfacce',
        d.interfacce,
        'BMS, spegnimento, diffusione sonora, centrale esistente...'
      )}
    </div>

    <div class="rap-section">3. Campo — dispositivi e quantità</div>
    <div class="card">
      <div class="fr">
        ${campoPreventivo('Rivelatori ottici di fumo', 'ri-rivelatori-ottici', d.rivelatori_ottici, 'number')}
        ${campoPreventivo('Rivelatori termici / termovelocimetrici', 'ri-rivelatori-termici', d.rivelatori_termici, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Multicriterio / gas / fiamma UV-IR', 'ri-rivelatori-speciali', d.rivelatori_speciali, 'number')}
        ${campoPreventivo('Barriere lineari ottiche', 'ri-barriere', d.barriere, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Portata barriere (metri)', 'ri-barriere-portata', d.barriere_portata, 'number')}
        ${campoPreventivo('Unità ASD / VESDA', 'ri-vesda-unita', d.vesda_unita, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Tubazione ASD / VESDA (ml)', 'ri-vesda-tubazione', d.vesda_tubazione, 'number')}
        ${campoPreventivo('Fori ASD / VESDA', 'ri-vesda-fori', d.vesda_fori, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Cavo termosensibile (ml)', 'ri-cavo-termosensibile', d.cavo_termosensibile, 'number')}
        ${campoPreventivo('Pulsanti manuali', 'ri-pulsanti-manuali', d.pulsanti_manuali, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Pannelli ottico-acustici / sirene', 'ri-sirene', d.sirene, 'number')}
        ${campoPreventivo('Targhe e cartellonistica', 'ri-cartellonistica', d.cartellonistica, 'number')}
      </div>
    </div>

    <div class="rap-section">4. Ambiente e vincoli</div>
    <div class="card">
      <div class="fr">
        ${campoPreventivo('Altezza soffitto / note per ambiente', 'ri-altezza', d.altezza, 'text', 'Es. magazzino 8 m, uffici 3 m')}
        ${selectPreventivo('Presenza ATEX?', 'ri-atex', d.atex || '', [
          { value: '', label: 'Seleziona' },
          { value: 'no', label: 'No' },
          { value: 'si', label: 'Sì' }
        ])}
      </div>

      <div class="fr">
        ${campoPreventivo('Superficie totale (mq)', 'ri-superficie', d.superficie, 'number')}
        ${campoPreventivo('N. locali / compartimenti', 'ri-locali', d.locali, 'number')}
      </div>

      ${areaPreventivo(
        'Travi, controsoffitti, pavimenti flottanti o sorveglianza sopra/sotto',
        'ri-struttura',
        d.struttura
      )}

      ${areaPreventivo(
        'Ambienti gravosi e grado IP richiesto',
        'ri-ambienti-gravosi',
        d.ambienti_gravosi,
        'Polveri, vapori, cucine, box auto, celle frigo, esterni, tettoie...'
      )}
    </div>

    <div class="rap-section">5. Cablaggio e posa</div>
    <div class="card">
      <div class="fr">
        ${campoPreventivo('Cavo schermato twistato (ml)', 'ri-cavo-schermato', d.cavo_schermato, 'number')}
        ${campoPreventivo('Cavo resistente al fuoco FTG18M / PH30-PH120 (ml)', 'ri-cavo-resistente', d.cavo_resistente, 'number')}
      </div>

      <div class="fr">
        ${selectPreventivo('Tipo di posa', 'ri-posa', d.posa || '', [
          { value: '', label: 'Seleziona' },
          { value: 'canalina_esistente', label: 'Canalina esistente' },
          { value: 'nuova_canalina', label: 'Nuova canalina' },
          { value: 'tubo_rigido', label: 'Tubo rigido' },
          { value: 'corrugato', label: 'Tubo corrugato' },
          { value: 'battiscopa', label: 'Battiscopa' },
          { value: 'vista', label: 'A vista' }
        ])}

        ${selectPreventivo('Canalizzazioni fornite e posate da', 'ri-canalizzazioni-da', d.canalizzazioni_da || '', [
          { value: '', label: 'Seleziona' },
          { value: 'noi', label: 'Noi' },
          { value: 'elettricista_cliente', label: 'Elettricista del cliente' }
        ])}
      </div>

      <div class="fr">
        ${campoPreventivo('Sigillature compartimenti (n.)', 'ri-sigillature', d.sigillature, 'number')}
        ${selectPreventivo('Altezza di lavoro', 'ri-altezza-lavoro', d.altezza_lavoro || '', [
          { value: '', label: 'Normale' },
          { value: 'trabattello', label: 'Trabattello' },
          { value: 'ple', label: 'PLE' }
        ])}
      </div>

      ${areaPreventivo(
        'Forature, ripristini estetici, pitturazione e altre note di posa',
        'ri-note-posa',
        d.note_posa
      )}
    </div>

    <div class="rap-section">6. Collaudo e manutenzione</div>
    <div class="card">
      ${areaPreventivo(
        'Collaudo, programmazione, prove fumo, comandi asserviti, documentazione e formazione',
        'ri-collaudo',
        d.collaudo,
        'Indica attività incluse e particolarità.'
      )}

      ${areaPreventivo(
        'Se manutenzione: consistenza impianto esistente, batterie, periodicità, reperibilità e durata contratto',
        'ri-manutenzione',
        d.manutenzione,
        'Centrali, loop, punti, marca/modello, batterie, sedi, ricambi obsoleti...'
      )}

      ${areaPreventivo(
        'Note interne per il calcolo',
        'ri-note-calcolo',
        d.note_calcolo,
        'Tempi stimati, numero squadre, giornate, margine suggerito...'
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaRilevazione()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaRilevazioneIncendi()">
        Salva scheda rilevazione
      </button>
    </div>
  `;
}

async function salvaSchedaRilevazioneIncendi() {
  const usaProgetto = contestoSchedaRilevazione === 'progetto';

  const riferimentoId = usaProgetto
    ? currentRilievoProgettoId
    : currentPreventivoId;

  if (!riferimentoId) {
    toast(
      usaProgetto
        ? 'Progetto tecnico non selezionato'
        : 'Preventivo non selezionato',
      'err'
    );
    return;
  }

  const dati = {
    tipo_intervento: v('ri-tipo-intervento'),
    progetto_esistente: v('ri-progetto-esistente'),
    sorveglianza: v('ri-sorveglianza'),
    marca: v('ri-marca'),
    centrale_tipo: v('ri-centrale-tipo'),
    loop: v('ri-loop'),
    indirizzi_loop: v('ri-indirizzi-loop'),
    margine_espansione: v('ri-margine-espansione'),
    accessori_centrale: v('ri-accessori-centrale'),
    comandi_terzi: v('ri-comandi-terzi'),
    interfacce: v('ri-interfacce'),
    rivelatori_ottici: v('ri-rivelatori-ottici'),
    rivelatori_termici: v('ri-rivelatori-termici'),
    rivelatori_speciali: v('ri-rivelatori-speciali'),
    barriere: v('ri-barriere'),
    barriere_portata: v('ri-barriere-portata'),
    vesda_unita: v('ri-vesda-unita'),
    vesda_tubazione: v('ri-vesda-tubazione'),
    vesda_fori: v('ri-vesda-fori'),
    cavo_termosensibile: v('ri-cavo-termosensibile'),
    pulsanti_manuali: v('ri-pulsanti-manuali'),
    sirene: v('ri-sirene'),
    cartellonistica: v('ri-cartellonistica'),
    altezza: v('ri-altezza'),
    atex: v('ri-atex'),
    superficie: v('ri-superficie'),
    locali: v('ri-locali'),
    struttura: v('ri-struttura'),
    ambienti_gravosi: v('ri-ambienti-gravosi'),
    cavo_schermato: v('ri-cavo-schermato'),
    cavo_resistente: v('ri-cavo-resistente'),
    posa: v('ri-posa'),
    canalizzazioni_da: v('ri-canalizzazioni-da'),
    sigillature: v('ri-sigillature'),
    altezza_lavoro: v('ri-altezza-lavoro'),
    note_posa: v('ri-note-posa'),
    collaudo: v('ri-collaudo'),
    manutenzione: v('ri-manutenzione'),
    note_calcolo: v('ri-note-calcolo')
  };

  if (!dati.tipo_intervento) {
    toast('Seleziona almeno il tipo di intervento', 'err');
    return;
  }

 const tabella = usaProgetto
  ? 'progetti_tecnici_schede'
  : 'preventivi_schede_tecniche';

const riga = usaProgetto
  ? {
      progetto_tecnico_id: riferimentoId,
      famiglia: 'rilevazione_incendi',
      dati: dati,
      aggiornato_il: new Date().toISOString()
    }
  : {
      preventivo_id: riferimentoId,
      famiglia: 'rilevazione_incendi',
      dati: dati,
      aggiornato_il: new Date().toISOString()
    };

if (usaProgetto && ROLE === 'ingegnere') {
  riga.stato = 'bozza';
  riga.compilato_da = ME.id;
}

if (usaProgetto && ROLE === 'commerciale') {
  riga.ultima_modifica_commerciale_da = ME.id;
  riga.ultima_modifica_commerciale_il =
    new Date().toISOString();
}

const { error } = await db
  .from(tabella)
  .upsert(
    riga,
    {
      onConflict: usaProgetto
        ? 'progetto_tecnico_id,famiglia'
        : 'preventivo_id,famiglia'
    }
  );

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

 toast('Scheda rilevazione incendi salvata', 'ok');

if (usaProgetto) {
  closeM('m-rilievo-tecnico');
  return;
}

await renderSchedePreventivo();
}

async function apriSchedaCompartimentazioneIngegnere() {
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;

  openM('m-rilievo-tecnico');
  await apriSchedaCompartimentazione();
}

function chiudiSchedaCompartimentazione() {
  closeM('m-rilievo-tecnico');
}

async function apriSchedaCompartimentazione() {
  const box = ge('mrt-content');

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('dati')
    .eq('progetto_tecnico_id', currentRilievoProgettoId)
    .eq('famiglia', 'compartimentazione')
    .maybeSingle();

  if (error) {
    toast('Errore apertura scheda: ' + error.message, 'err');
    return;
  }

  const d = data?.dati || {};

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🧱 Compartimentazione
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Rilievo di attraversamenti, sigillature e ripristini antincendio.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaCompartimentazione()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Tipo di intervento</div>

    <div class="card">
      ${selectPreventivo('Intervento *', 'cp-tipo-intervento', d.tipo_intervento || '', [
        { value: '', label: 'Seleziona' },
        { value: 'sigillatura_attraversamenti', label: 'Sigillatura attraversamenti' },
        { value: 'parete', label: 'Parete' },
        { value: 'controsoffitto', label: 'Controsoffitto' },
        { value: 'pavimento', label: 'Pavimento' },
        { value: 'giunto', label: 'Giunto' }
      ])}
    </div>

    <div class="rap-section">2. Resistenza al fuoco richiesta</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Classe richiesta *', 'cp-classe', d.classe || '', [
          { value: '', label: 'Seleziona' },
          { value: 'ei', label: 'EI' },
          { value: 'rei', label: 'REI' }
        ])}

        ${selectPreventivo('Minuti *', 'cp-minuti', d.minuti || '', [
          { value: '', label: 'Seleziona' },
          { value: '30', label: '30 minuti' },
          { value: '60', label: '60 minuti' },
          { value: '90', label: '90 minuti' },
          { value: '120', label: '120 minuti' },
          { value: 'superiore', label: 'Classe superiore / da definire' }
        ])}
      </div>
    </div>

    <div class="rap-section">3. Attraversamenti e supporto</div>

    <div class="card">
      <div class="fr">
        ${campoPreventivo('Numero attraversamenti *', 'cp-numero-attraversamenti', d.numero_attraversamenti, 'number')}

        ${selectPreventivo('Tipo attraversamento *', 'cp-tipo-attraversamento', d.tipo_attraversamento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'cavi', label: 'Cavi' },
          { value: 'tubazioni_metalliche', label: 'Tubazioni metalliche' },
          { value: 'tubazioni_plastiche', label: 'Tubazioni plastiche' },
          { value: 'canaline', label: 'Canaline' },
          { value: 'misti', label: 'Misti' }
        ])}
      </div>

      <div class="fr">
        ${campoPreventivo('Dimensioni foro (mm) *', 'cp-dimensioni-foro', d.dimensioni_foro, 'text', 'Es. 300 × 200')}
        ${campoPreventivo('Spessore parete o solaio (mm) *', 'cp-spessore-supporto', d.spessore_supporto, 'number')}
      </div>

      <div class="fr">
        ${selectPreventivo('Materiale supporto', 'cp-materiale-supporto', d.materiale_supporto || '', [
          { value: '', label: 'Seleziona' },
          { value: 'laterizio', label: 'Laterizio' },
          { value: 'cartongesso', label: 'Cartongesso' },
          { value: 'calcestruzzo', label: 'Calcestruzzo' },
          { value: 'altro', label: 'Altro' }
        ])}

        ${campoPreventivo(
          'Posizione attraversamenti *',
          'cp-posizione',
          d.posizione,
          'text',
          'Es. piano primo, locale quadri, parete nord'
        )}
      </div>
    </div>

    <div class="rap-section">4. Sistema di sigillatura</div>

    <div class="card">
      ${areaPreventivo(
        'Isolamento, collari, manicotti, sacchetti o cuscini intumescenti',
        'cp-sistemi-presenti',
        d.sistemi_presenti
      )}

      <div class="fr">
        ${campoPreventivo(
          'Fattore di riempimento cavi / spazio disponibile',
          'cp-riempimento-cavi',
          d.riempimento_cavi,
          'text',
          'Es. canalina piena al 60%, spazio libero...'
        )}

        ${selectPreventivo('Necessità ripristino parete o controsoffitto', 'cp-ripristino', d.ripristino || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      ${areaPreventivo(
        'Certificazione richiesta e sistema scelto',
        'cp-certificazione-sistema',
        d.certificazione_sistema,
        'Es. certificazione EI 120, sistema Hilti / Promat / altro.'
      )}
    </div>

    <div class="rap-section">5. Accesso, foto e note</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Altezza di lavoro', 'cp-altezza-lavoro', d.altezza_lavoro || '', [
          { value: '', label: 'Seleziona' },
          { value: 'normale', label: 'Normale' },
          { value: 'trabattello', label: 'Trabattello' },
          { value: 'ple', label: 'PLE' },
          { value: 'da_verificare', label: 'Da verificare' }
        ])}

        ${campoPreventivo('Accessibilità', 'cp-accessibilita', d.accessibilita, 'text', 'Es. libera, limitata, locale occupato')}
      </div>

      ${areaPreventivo(
        'Foto ravvicinate e foto di contesto *',
        'cp-foto',
        d.foto,
        'Indica le foto caricate negli allegati tecnici.'
      )}

      ${areaPreventivo(
        'Note tecniche per il preventivo',
        'cp-note-tecniche',
        d.note_tecniche
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaCompartimentazione()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaCompartimentazione()">
        Salva scheda compartimentazione
      </button>
    </div>
  `;
}

async function salvaSchedaCompartimentazione() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  const dati = {
    tipo_intervento: v('cp-tipo-intervento'),
    classe: v('cp-classe'),
    minuti: v('cp-minuti'),
    numero_attraversamenti: v('cp-numero-attraversamenti'),
    tipo_attraversamento: v('cp-tipo-attraversamento'),
    dimensioni_foro: v('cp-dimensioni-foro'),
    spessore_supporto: v('cp-spessore-supporto'),
    materiale_supporto: v('cp-materiale-supporto'),
    posizione: v('cp-posizione'),
    sistemi_presenti: v('cp-sistemi-presenti'),
    riempimento_cavi: v('cp-riempimento-cavi'),
    ripristino: v('cp-ripristino'),
    certificazione_sistema: v('cp-certificazione-sistema'),
    altezza_lavoro: v('cp-altezza-lavoro'),
    accessibilita: v('cp-accessibilita'),
    foto: v('cp-foto'),
    note_tecniche: v('cp-note-tecniche')
  };

  if (
    !dati.tipo_intervento ||
    !dati.classe ||
    !dati.minuti ||
    !dati.numero_attraversamenti ||
    !dati.tipo_attraversamento ||
    !dati.dimensioni_foro ||
    !dati.spessore_supporto ||
    !dati.posizione ||
    !dati.foto
  ) {
    toast(
      'Compila intervento, classe, minuti, attraversamenti, dimensioni, spessore, posizione e foto',
      'err'
    );
    return;
  }

  const { error } = await db
    .from('progetti_tecnici_schede')
    .upsert({
      progetto_tecnico_id: currentRilievoProgettoId,
      famiglia: 'compartimentazione',
      dati: dati,
      stato: 'bozza',
      compilato_da: ME.id,
      aggiornato_il: new Date().toISOString()
    }, {
      onConflict: 'progetto_tecnico_id,famiglia'
    });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  toast('Scheda compartimentazione salvata', 'ok');
  closeM('m-rilievo-tecnico');
}

async function apriSchedaVerniceIntumescenteIngegnere() {
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;

  openM('m-rilievo-tecnico');
  await apriSchedaVerniceIntumescente();
}

function chiudiSchedaVerniceIntumescente() {
  closeM('m-rilievo-tecnico');
}

async function apriSchedaVerniceIntumescente() {
  const box = ge('mrt-content');

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('dati')
    .eq('progetto_tecnico_id', currentRilievoProgettoId)
    .eq('famiglia', 'vernice_intumescente')
    .maybeSingle();

  if (error) {
    toast('Errore apertura scheda: ' + error.message, 'err');
    return;
  }

  const d = data?.dati || {};

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🎨 Vernice intumescente
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Rilievo per protezione passiva di strutture metalliche.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaVerniceIntumescente()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Elementi da proteggere</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Elemento da proteggere *', 'vi-elemento', d.elemento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'pilastro', label: 'Pilastro' },
          { value: 'trave', label: 'Trave' },
          { value: 'solaio', label: 'Solaio' },
          { value: 'struttura_metallica', label: 'Struttura metallica' }
        ])}

        ${selectPreventivo('Classe R richiesta *', 'vi-classe-r', d.classe_r || '', [
          { value: '', label: 'Seleziona' },
          { value: 'r30', label: 'R30' },
          { value: 'r60', label: 'R60' },
          { value: 'r90', label: 'R90' },
          { value: 'r120', label: 'R120' },
          { value: 'altro', label: 'Altro / da definire' }
        ])}
      </div>

      <div class="fr">
        ${campoPreventivo(
          'Tipo e dimensione profilo metallico *',
          'vi-profilo',
          d.profilo,
          'text',
          'Es. HEA 200, IPE 160, tubolare 100×100'
        )}

        ${campoPreventivo('Numero elementi *', 'vi-numero-elementi', d.numero_elementi, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo(
          'Sviluppo lineare (m)',
          'vi-sviluppo-lineare',
          d.sviluppo_lineare,
          'number'
        )}

        ${campoPreventivo(
          'Superficie da trattare (mq)',
          'vi-superficie',
          d.superficie,
          'number'
        )}
      </div>

      ${campoPreventivo(
        'Fattore di sezione S/V o A/V',
        'vi-fattore-sezione',
        d.fattore_sezione,
        'text',
        'Se disponibile'
      )}
    </div>

    <div class="rap-section">2. Stato e preparazione supporto</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Stato del supporto', 'vi-stato-supporto', d.stato_supporto || '', [
          { value: '', label: 'Seleziona' },
          { value: 'zincato', label: 'Zincato' },
          { value: 'verniciato', label: 'Verniciato' },
          { value: 'ossidato', label: 'Ossidato' },
          { value: 'da_preparare', label: 'Da preparare' }
        ])}

        ${selectPreventivo('Preparazione richiesta', 'vi-preparazione', d.preparazione || '', [
          { value: '', label: 'Seleziona' },
          { value: 'pulizia', label: 'Pulizia' },
          { value: 'sabbiatura', label: 'Sabbiatura' },
          { value: 'primer', label: 'Primer' },
          { value: 'trattamento_ruggine', label: 'Trattamento ruggine' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      ${areaPreventivo(
        'Note su supporto, ossidazione, vecchie vernici o preparazioni particolari',
        'vi-note-supporto',
        d.note_supporto
      )}
    </div>

    <div class="rap-section">3. Ambiente e posa</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Condizioni ambientali', 'vi-ambiente', d.ambiente || '', [
          { value: '', label: 'Seleziona' },
          { value: 'interno', label: 'Interno' },
          { value: 'esterno', label: 'Esterno' },
          { value: 'umidita', label: 'Umidità elevata' },
          { value: 'temperatura_critica', label: 'Temperatura critica' }
        ])}

        ${selectPreventivo('Altezza / mezzo di sollevamento', 'vi-altezza-lavoro', d.altezza_lavoro || '', [
          { value: '', label: 'Seleziona' },
          { value: 'normale', label: 'Normale' },
          { value: 'trabattello', label: 'Trabattello' },
          { value: 'ple', label: 'PLE' },
          { value: 'ponteggio', label: 'Ponteggio' }
        ])}
      </div>

      ${areaPreventivo(
        'Accessibilità, ostacoli e vincoli di cantiere',
        'vi-accessibilita',
        d.accessibilita
      )}
    </div>

    <div class="rap-section">4. Ciclo e finitura</div>

    <div class="card">
      ${areaPreventivo(
        'Ciclo richiesto: primer, intumescente, finitura',
        'vi-ciclo',
        d.ciclo,
        'Indica prodotti o ciclo richiesto, se già definito.'
      )}

      <div class="fr">
        ${campoPreventivo(
          'Colore finale / RAL',
          'vi-colore',
          d.colore,
          'text',
          'Es. RAL 9010'
        )}

        ${campoPreventivo(
          'Requisito estetico',
          'vi-requisito-estetico',
          d.requisito_estetico,
          'text',
          'Es. finitura liscia, ambiente a vista'
        )}
      </div>
    </div>

    <div class="rap-section">5. Foto, certificazione e note</div>

    <div class="card">
      ${areaPreventivo(
        'Foto, misure e dettagli dei profili *',
        'vi-foto',
        d.foto,
        'Indica le foto caricate negli allegati tecnici.'
      )}

      ${areaPreventivo(
        'Certificazione e dichiarazione di corretta posa',
        'vi-certificazione',
        d.certificazione
      )}

      ${areaPreventivo(
        'Note tecniche per il preventivo',
        'vi-note-tecniche',
        d.note_tecniche
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaVerniceIntumescente()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaVerniceIntumescente()">
        Salva scheda vernice intumescente
      </button>
    </div>
  `;
}

async function salvaSchedaVerniceIntumescente() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  const dati = {
    elemento: v('vi-elemento'),
    classe_r: v('vi-classe-r'),
    profilo: v('vi-profilo'),
    numero_elementi: v('vi-numero-elementi'),
    sviluppo_lineare: v('vi-sviluppo-lineare'),
    superficie: v('vi-superficie'),
    fattore_sezione: v('vi-fattore-sezione'),
    stato_supporto: v('vi-stato-supporto'),
    preparazione: v('vi-preparazione'),
    note_supporto: v('vi-note-supporto'),
    ambiente: v('vi-ambiente'),
    altezza_lavoro: v('vi-altezza-lavoro'),
    accessibilita: v('vi-accessibilita'),
    ciclo: v('vi-ciclo'),
    colore: v('vi-colore'),
    requisito_estetico: v('vi-requisito-estetico'),
    foto: v('vi-foto'),
    certificazione: v('vi-certificazione'),
    note_tecniche: v('vi-note-tecniche')
  };

  if (
    !dati.elemento ||
    !dati.classe_r ||
    !dati.profilo ||
    !dati.numero_elementi ||
    (!dati.sviluppo_lineare && !dati.superficie) ||
    !dati.foto
  ) {
    toast(
      'Compila elemento, classe R, profilo, quantità, sviluppo o superficie e foto',
      'err'
    );
    return;
  }

  const { error } = await db
    .from('progetti_tecnici_schede')
    .upsert({
      progetto_tecnico_id: currentRilievoProgettoId,
      famiglia: 'vernice_intumescente',
      dati: dati,
      stato: 'bozza',
      compilato_da: ME.id,
      aggiornato_il: new Date().toISOString()
    }, {
      onConflict: 'progetto_tecnico_id,famiglia'
    });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  toast('Scheda vernice intumescente salvata', 'ok');
  closeM('m-rilievo-tecnico');
}


async function apriSchedaImpiantiSpegnimentoIngegnere() {
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;

  openM('m-rilievo-tecnico');
  await apriSchedaImpiantiSpegnimento();
}

function chiudiSchedaImpiantiSpegnimento() {
  closeM('m-rilievo-tecnico');
}

async function apriSchedaImpiantiSpegnimento() {
  const box = ge('mrt-content');

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('dati')
    .eq('progetto_tecnico_id', currentRilievoProgettoId)
    .eq('famiglia', 'impianti_spegnimento')
    .maybeSingle();

  if (error) {
    toast('Errore apertura scheda: ' + error.message, 'err');
    return;
  }

  const d = data?.dati || {};

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          💧 Impianti di spegnimento
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Rilievo per impianti idrici e sistemi di spegnimento speciali.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaImpiantiSpegnimento()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Impianto e intervento</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipo impianto *', 'is-tipo-impianto', d.tipo_impianto || '', [
          { value: '', label: 'Seleziona' },
          { value: 'idranti', label: 'Idranti' },
          { value: 'naspi', label: 'Naspi' },
          { value: 'sprinkler', label: 'Sprinkler' },
          { value: 'water_mist', label: 'Water mist' },
          { value: 'gas', label: 'Gas' },
          { value: 'schiuma', label: 'Schiuma' },
          { value: 'altro', label: 'Altro' }
        ])}

        ${selectPreventivo('Tipo intervento *', 'is-tipo-intervento', d.tipo_intervento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'nuovo', label: 'Nuovo impianto' },
          { value: 'ampliamento', label: 'Ampliamento' },
          { value: 'adeguamento', label: 'Adeguamento' },
          { value: 'manutenzione', label: 'Manutenzione' }
        ])}
      </div>

      ${campoPreventivo(
        'Area o compartimento da proteggere *',
        'is-area-protetta',
        d.area_protetta,
        'text',
        'Es. magazzino 1.200 mq, locale tecnico, piano terra'
      )}

      ${campoPreventivo(
        'Normativa o livello prestazionale richiesto',
        'is-normativa',
        d.normativa,
        'text',
        'Es. UNI 10779, UNI EN 12845, livello di pericolo...'
      )}
    </div>

    <div class="rap-section">2. Impianto esistente e alimentazione</div>

    <div class="card">
      ${areaPreventivo(
        'Impianto esistente: marca, modello, anno, stato e documentazione *',
        'is-impianto-esistente',
        d.impianto_esistente,
        'Indica anche se assente o non documentato.'
      )}

      <div class="fr">
        ${selectPreventivo('Alimentazione idrica disponibile', 'is-alimentazione', d.alimentazione || '', [
          { value: '', label: 'Seleziona' },
          { value: 'acquedotto', label: 'Acquedotto' },
          { value: 'serbatoio', label: 'Serbatoio' },
          { value: 'gruppo_pompe', label: 'Gruppo pompe' },
          { value: 'altro', label: 'Altro / da verificare' }
        ])}

        ${campoPreventivo(
          'Pressione disponibile *',
          'is-pressione',
          d.pressione,
          'text',
          'Es. 4 bar'
        )}
      </div>

      <div class="fr">
        ${campoPreventivo(
          'Portata disponibile *',
          'is-portata',
          d.portata,
          'text',
          'Es. 300 l/min'
        )}

        ${campoPreventivo(
          'Riserva idrica disponibile *',
          'is-riserva',
          d.riserva,
          'text',
          'Es. 20 mc'
        )}
      </div>
    </div>

    <div class="rap-section">3. Rete e componenti</div>

    <div class="card">
      ${areaPreventivo(
        'Numero e tipo componenti',
        'is-componenti',
        d.componenti,
        'Idranti, naspi, sprinkler, valvole, stazioni, attacchi VV.F...'
      )}

      <div class="fr">
        ${campoPreventivo(
          'Rete esistente e materiale tubazioni',
          'is-rete-esistente',
          d.rete_esistente,
          'text',
          'Es. acciaio zincato DN65, PEAD...'
        )}

        ${campoPreventivo(
          'Percorsi, lunghezze e posa tubazioni',
          'is-percorsi-tubazioni',
          d.percorsi_tubazioni,
          'text',
          'Es. 120 ml a vista in quota'
        )}
      </div>

      ${areaPreventivo(
        'Attraversamenti e opere di compartimentazione correlate',
        'is-compartimentazione',
        d.compartimentazione
      )}

      ${areaPreventivo(
        'Collegamenti a centrale incendio, allarmi o supervisione',
        'is-collegamenti',
        d.collegamenti
      )}
    </div>

    <div class="rap-section">4. Manutenzione, prove e documenti</div>

    <div class="card">
      ${areaPreventivo(
        'Accessibilità per manutenzione e prove',
        'is-accessibilita',
        d.accessibilita
      )}

      ${areaPreventivo(
        'Collaudi richiesti: idraulico, funzionale, certificazioni',
        'is-collaudi',
        d.collaudi
      )}
    </div>

    <div class="rap-section">5. Foto e note</div>

    <div class="card">
      ${areaPreventivo(
        'Foto locale pompe, rete, terminali e criticità *',
        'is-foto',
        d.foto,
        'Indica le foto caricate negli allegati tecnici.'
      )}

      ${areaPreventivo(
        'Note tecniche per il preventivo',
        'is-note-tecniche',
        d.note_tecniche
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaImpiantiSpegnimento()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaImpiantiSpegnimento()">
        Salva scheda impianti di spegnimento
      </button>
    </div>
  `;
}

async function salvaSchedaImpiantiSpegnimento() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  const dati = {
    tipo_impianto: v('is-tipo-impianto'),
    tipo_intervento: v('is-tipo-intervento'),
    area_protetta: v('is-area-protetta'),
    normativa: v('is-normativa'),
    impianto_esistente: v('is-impianto-esistente'),
    alimentazione: v('is-alimentazione'),
    pressione: v('is-pressione'),
    portata: v('is-portata'),
    riserva: v('is-riserva'),
    componenti: v('is-componenti'),
    rete_esistente: v('is-rete-esistente'),
    percorsi_tubazioni: v('is-percorsi-tubazioni'),
    compartimentazione: v('is-compartimentazione'),
    collegamenti: v('is-collegamenti'),
    accessibilita: v('is-accessibilita'),
    collaudi: v('is-collaudi'),
    foto: v('is-foto'),
    note_tecniche: v('is-note-tecniche')
  };

  if (
    !dati.tipo_impianto ||
    !dati.tipo_intervento ||
    !dati.area_protetta ||
    !dati.impianto_esistente ||
    !dati.pressione ||
    !dati.portata ||
    !dati.riserva ||
    !dati.foto
  ) {
    toast(
      'Compila impianto, intervento, area, dati esistenti, pressione, portata, riserva e foto',
      'err'
    );
    return;
  }

  const { error } = await db
    .from('progetti_tecnici_schede')
    .upsert({
      progetto_tecnico_id: currentRilievoProgettoId,
      famiglia: 'impianti_spegnimento',
      dati: dati,
      stato: 'bozza',
      compilato_da: ME.id,
      aggiornato_il: new Date().toISOString()
    }, {
      onConflict: 'progetto_tecnico_id,famiglia'
    });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  toast('Scheda impianti di spegnimento salvata', 'ok');
  closeM('m-rilievo-tecnico');
}


async function renderFornitoriPreventivo() {
  const box = ge('pvd-fornitori-content');

  if (!box || !currentPreventivoId) return;

  box.innerHTML = '<div class="load">Caricamento fornitori...</div>';

  const { data, error } = await db
    .from('preventivi_fornitori')
    .select(`
      id,
      tipologia,
      stato,
      prezzo_offerto,
      tempi_consegna_proposti,
      note,
      allegati_progetto_ids,
      fornitori(
        ragione_sociale,
        telefono,
        email
      ),
      fornitore_tipologie(
        pronta_consegna,
        tempi_consegna,
        gestione_ordine,
        varieta_catalogo,
        tempi_preventivo
      )
    `)
    .eq('preventivo_id', currentPreventivoId)
    .neq('stato', 'scartato')
    .order('creato_il');

  if (error) {
    box.innerHTML =
      '<div class="al2 e">Errore caricamento fornitori: ' +
      esc(error.message) +
      '</div>';
    return;
  }

  const fornitori = data || [];

    const idsFornitori = fornitori.map(function(fornitore) {
    return fornitore.id;
  });

  const allegatiPerFornitore = {};

  if (idsFornitori.length) {
    const { data: allegatiRicevuti, error: erroreAllegatiRicevuti } = await db
      .from('preventivi_fornitori_allegati')
      .select('id,preventivo_fornitore_id,nome_file,storage_path,mime_type,dimensione,caricato_il')
      .in('preventivo_fornitore_id', idsFornitori)
      .order('caricato_il', { ascending: false });

    if (!erroreAllegatiRicevuti) {
      (allegatiRicevuti || []).forEach(function(allegato) {
        if (!allegatiPerFornitore[allegato.preventivo_fornitore_id]) {
          allegatiPerFornitore[allegato.preventivo_fornitore_id] = [];
        }

        allegatiPerFornitore[allegato.preventivo_fornitore_id].push(allegato);
      });
    }
  }

    const { data: preventivoAllegati } = await db
    .from('preventivi')
    .select('progetto_tecnico_id')
    .eq('id', currentPreventivoId)
    .single();

  let allegatiProgetto = [];

  if (preventivoAllegati?.progetto_tecnico_id) {
    const { data: fileProgetto, error: erroreFile } = await db
      .from('progetti_tecnici_allegati')
      .select('id,nome_file,mime_type,dimensione')
      .eq('progetto_id', preventivoAllegati.progetto_tecnico_id)
      .order('caricato_il', { ascending: false });

    if (!erroreFile) allegatiProgetto = fileProgetto || [];
  }


  box.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div>
          <div style="font-size:15px;font-weight:700">
            🏭 Fornitori del preventivo
          </div>

          <div style="font-size:12px;color:var(--m);margin-top:4px">
            Scegli e confronta fino a due fornitori.
          </div>
        </div>

        <span class="bx bblue">${fornitori.length} / 2</span>
      </div>

      <button
        class="btn sm p"
        style="margin-top:14px"
        ${fornitori.length >= 2 ? 'disabled' : ''}
        onclick="apriSelettoreFornitoriPreventivo()"
      >
        🏭 ${fornitori.length ? 'Aggiungi fornitore' : 'Seleziona fornitori'}
      </button>
    </div>

    ${!fornitori.length ? `
      <div class="empty" style="margin-top:12px">
        Nessun fornitore selezionato per questo preventivo.
      </div>
    ` : fornitori.map(function(s) {
      const f = s.fornitori || {};
const t = s.fornitore_tipologie || {};

const preventiviRicevuti = allegatiPerFornitore[s.id] || [];

const bloccoPreventivoRicevuto = `
  <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--b)">
    <div style="font-size:13px;font-weight:700">
      📩 Preventivo ricevuto dal fornitore
    </div>

    <div style="font-size:12px;color:var(--m);margin:4px 0 10px">
      Carica il PDF ricevuto via email e inserisci sopra importo e tempi proposti.
    </div>

    <input
      id="pvf-file-ricevuto-${s.id}"
      type="file"
      accept="application/pdf,.pdf"
      style="font-size:12px;max-width:100%"
    >

    <button
      class="btn sm p"
      style="margin:8px 0 4px"
      onclick="caricaPreventivoRicevutoFornitore('${s.id}')"
    >
      📎 Carica PDF ricevuto
    </button>

    ${
      !preventiviRicevuti.length
        ? `
          <div style="font-size:12px;color:var(--m);margin-top:6px">
            Nessun preventivo del fornitore caricato.
          </div>
        `
        : preventiviRicevuti.map(function(file) {
            return `
              <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px;font-size:12px">
                <span style="overflow-wrap:anywhere">
                  📄 ${esc(file.nome_file)}
                </span>

                <button
                  class="btn sm"
                  onclick="apriAllegatoPreventivoFornitore('${file.storage_path}')"
                >
                  Apri
                </button>
              </div>
            `;
          }).join('')
    }

    <button
  class="btn sm p"
  style="margin-top:12px"
  onclick="salvaAllegatiRichiestaFornitore('${s.id}')"
>
  Salva allegati selezionati
</button>

  </div>
`;

const allegatiSelezionati = Array.isArray(s.allegati_progetto_ids)
  ? s.allegati_progetto_ids
  : [];

const bloccoAllegati = !allegatiProgetto.length
  ? `
      <div style="font-size:12px;color:var(--m);margin-top:14px">
        Nessun allegato presente nel progetto tecnico.
      </div>
    `
  : `
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--b)">
        <div style="font-size:13px;font-weight:700">
          📎 Allegati da inserire nel PDF
        </div>

      <div style="
  display:flex;
  justify-content:space-between;
  gap:10px;
  align-items:center;
  margin:4px 0 10px
">
  <div style="font-size:12px;color:var(--m)">
    Seleziona solo foto e documenti che possono essere inviati al fornitore.
  </div>

  <button
    type="button"
    class="btn sm"
    onclick="selezionaTuttiAllegatiRichiesta('${s.id}')"
  >
    ☑ Seleziona tutti
  </button>
</div>

        ${allegatiProgetto.map(function(file) {
          const selezionato = allegatiSelezionati.includes(file.id);

          return `
            <label style="display:flex;gap:8px;align-items:center;padding:7px 0;font-size:12px">
              <input
                type="checkbox"
                data-allegato-richiesta="${s.id}"
                value="${file.id}"
                ${selezionato ? 'checked' : ''}
              >
              <span>
                📎 ${esc(file.nome_file)}
                <span style="color:var(--m)">
                  · ${esc(file.mime_type || 'File')}
                  · ${esc(dimensioneFileProgetto(file.dimensione))}
                </span>
              </span>
            </label>
          `;
        }).join('')}

          <button
    class="btn sm p"
    onclick="salvaDettagliFornitorePreventivo('${s.id}')"
  >
    Salva dati fornitore
  </button>

  <button
    class="btn sm info"
    onclick="generaRichiestaQuotazionePDF('${s.id}')"
  >
    📄 ${
      s.richiesta_versione > 0
        ? 'Rigenera PDF richiesta'
        : 'Genera PDF richiesta'
    }
  </button>

      </div>
    `;

      return `
        <div class="card" style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <div>
              <div style="font-size:15px;font-weight:700">
                ${esc(f.ragione_sociale || 'Fornitore')}
              </div>

              <div style="font-size:12px;color:var(--m);margin-top:4px">
                ${esc(s.tipologia || 'Tipologia non indicata')}
              </div>
            </div>

            <button
              class="btn sm"
              style="color:var(--r)"
              onclick="rimuoviFornitorePreventivo('${s.id}')"
            >
              Rimuovi
            </button>
          </div>

          <div class="g2" style="margin-top:14px">
            ${ir('Pronta consegna', t.pronta_consegna || '—')}
            ${ir('Tempi abituali', t.tempi_consegna || '—')}
            ${ir('Gestione ordine', t.gestione_ordine || '—')}
            ${ir('Risposta preventivi', t.tempi_preventivo || '—')}
          </div>

          <div class="fr" style="margin-top:14px">
            <div class="f">
              <label>Stato</label>
              <select id="pvf-stato-${s.id}">
                <option value="da_contattare" ${s.stato === 'da_contattare' ? 'selected' : ''}>Da contattare</option>
                <option value="richiesta_inviata" ${s.stato === 'richiesta_inviata' ? 'selected' : ''}>Richiesta inviata</option>
                <option value="risposta_ricevuta" ${s.stato === 'risposta_ricevuta' ? 'selected' : ''}>Risposta ricevuta</option>
                <option value="da_rivedere" ${s.stato === 'da_rivedere' ? 'selected' : ''}>
  Da rivedere
</option>

<option value="rifiutata" ${s.stato === 'rifiutata' ? 'selected' : ''}>
  Quotazione rifiutata
</option>
                <option value="selezionato" ${s.stato === 'selezionato' ? 'selected' : ''}>Scelto per il preventivo</option>
              </select>
            </div>

            <div class="f">
              <label>Prezzo offerto (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                id="pvf-prezzo-${s.id}"
                value="${s.prezzo_offerto ?? ''}"
              >
            </div>
          </div>

          <div class="fr">
            <div class="f">
              <label>Tempi proposti</label>
              <input
                type="text"
                id="pvf-consegna-${s.id}"
                value="${esc(s.tempi_consegna_proposti || '')}"
                placeholder="Es. 10 giorni lavorativi"
              >
            </div>

            <div class="f">
              <label>Note della richiesta / modifiche commerciali</label>
              <input
                type="text"
                id="pvf-note-${s.id}"
                value="${esc(s.note || '')}"
                placeholder="Indicazioni aggiuntive, varianti, quantità o richieste per il fornitore..."
              >
            </div>
          </div>
${bloccoAllegati}
${bloccoPreventivoRicevuto}

         <div
  style="
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    align-items:center;
    margin-top:4px
  "
>
${
  (
    s.stato === 'risposta_ricevuta' ||
    s.stato === 'selezionato'
  ) && Number(s.prezzo_offerto) > 0
    ? `
      <button
        class="btn sm info"
        onclick="usaQuotazioneFornitoreNelPreventivo('${s.id}')"
      >
        📥 Usa nel preventivo cliente
      </button>
    `
    : `
      <span style="font-size:12px;color:var(--m)">
        Salva prima prezzo e stato “Risposta ricevuta”.
      </span>
    `
}


  ${
    s.richiesta_versione > 0 &&
    s.stato !== 'richiesta_inviata'
      ? `
        <button
          class="btn sm"
          onclick="segnaRichiestaFornitoreInviata('${s.id}')"
        >
          📤 Segna come inviata
        </button>
      `
      : ''
  }
</div>

${
  s.richiesta_versione > 0
    ? `
      <div style="font-size:12px;color:var(--m);margin-top:10px">
        📄 Richiesta PDF v${s.richiesta_versione}
        ${
          s.richiesta_pdf_generato_il
            ? ' · generata il ' +
              new Date(s.richiesta_pdf_generato_il).toLocaleString('it-IT')
            : ''
        }
        ${
          s.richiesta_inviata_il
            ? ' · inviata il ' +
              new Date(s.richiesta_inviata_il).toLocaleString('it-IT')
            : ''
        }
      </div>
    `
    : ''
}

          ${(f.telefono || f.email) ? `
            <div style="font-size:12px;color:var(--m);margin-top:12px">
              ${f.telefono ? '☎ ' + esc(f.telefono) : ''}
              ${f.telefono && f.email ? ' · ' : ''}
              ${f.email ? '✉ ' + esc(f.email) : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('')}
  `;
}

async function apriSelettoreFornitoriPreventivo() {
  const box = ge('pvd-fornitori-content');

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:14px">
      <div>
        <div style="font-size:16px;font-weight:700">🏭 Seleziona fornitori</div>
        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Massimo due fornitori per questo preventivo.
        </div>
      </div>

      <button class="btn sm" onclick="renderFornitoriPreventivo()">
        ← Indietro
      </button>
    </div>

    <div class="card">
      <div class="f">
        <label>Cerca per tipologia</label>
        <input
          id="pvf-ricerca"
          type="text"
          placeholder="Es. porte, estintori, rilevazione incendi..."
          oninput="caricaFornitoriCandidatiPreventivo()"
        >
      </div>
    </div>

    <div id="pvf-candidati" style="margin-top:12px">
      <div class="load">Caricamento fornitori...</div>
    </div>
  `;

  await caricaFornitoriCandidatiPreventivo();
}

async function caricaFornitoriCandidatiPreventivo() {
  const box = ge('pvf-candidati');
  const ricerca = (v('pvf-ricerca') || '').trim();

  if (!box) return;

  const risultati = await Promise.all([
    db
      .from('preventivi_fornitori')
      .select('fornitore_id')
      .eq('preventivo_id', currentPreventivoId)
      .neq('stato', 'scartato'),

    ricerca
      ? db
          .from('fornitore_tipologie')
          .select('*, fornitori(*)')
          .eq('attivo', true)
          .ilike('tipologia', '%' + ricerca + '%')
          .order('tipologia')
      : db
          .from('fornitore_tipologie')
          .select('*, fornitori(*)')
          .eq('attivo', true)
          .order('tipologia')
          .limit(30)
  ]);

  const selezionatiRes = risultati[0];
  const candidatiRes = risultati[1];

  if (selezionatiRes.error || candidatiRes.error) {
    box.innerHTML =
      '<div class="al2 e">Errore caricamento: ' +
      esc(selezionatiRes.error?.message || candidatiRes.error?.message) +
      '</div>';
    return;
  }

  const giaSelezionati = selezionatiRes.data || [];
const candidati = (candidatiRes.data || [])
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

  if (!candidati.length) {
    box.innerHTML = `
      <div class="empty">
        ${ricerca
          ? 'Nessun fornitore trovato per questa tipologia.'
          : 'Inserisci una tipologia per restringere la ricerca.'
        }
      </div>
    `;
    return;
  }

  box.innerHTML = candidati.map(function(t) {
    const giaScelto = giaSelezionati.some(function(s) {
      return s.fornitore_id === t.fornitore_id;
    });

    const limiteRaggiunto = giaSelezionati.length >= 2;

    return `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div>
            <div style="font-size:15px;font-weight:700">
              ${esc(t.fornitori.ragione_sociale)}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:4px">
              ${esc(t.tipologia)}
              ${t.pronta_consegna ? ' · pronta consegna: ' + esc(t.pronta_consegna) : ''}
              ${t.tempi_consegna ? ' · consegna: ' + esc(t.tempi_consegna) : ''}
            </div>
          </div>

          <button
            class="btn sm p"
            ${giaScelto || limiteRaggiunto ? 'disabled' : ''}
            onclick="selezionaFornitorePreventivo('${t.fornitore_id}','${t.id}')"
          >
            ${giaScelto
              ? 'Già selezionato'
              : limiteRaggiunto
                ? 'Limite raggiunto'
                : 'Seleziona'
            }
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function selezionaFornitorePreventivo(fornitoreId, tipologiaId) {
  const { data: selezionati, error: erroreControllo } = await db
    .from('preventivi_fornitori')
    .select('id')
    .eq('preventivo_id', currentPreventivoId)
    .neq('stato', 'scartato');

  if (erroreControllo) {
    toast('Errore controllo fornitori: ' + erroreControllo.message, 'err');
    return;
  }

  if ((selezionati || []).length >= 2) {
    toast('Puoi selezionare al massimo due fornitori', 'err');
    return;
  }

  const { data: tipologia, error: erroreTipologia } = await db
    .from('fornitore_tipologie')
    .select('tipologia')
    .eq('id', tipologiaId)
    .single();

  if (erroreTipologia || !tipologia) {
    toast('Tipologia fornitore non trovata', 'err');
    return;
  }

  const { error } = await db
    .from('preventivi_fornitori')
    .insert({
      preventivo_id: currentPreventivoId,
      fornitore_id: fornitoreId,
      fornitore_tipologia_id: tipologiaId,
      tipologia: tipologia.tipologia,
      stato: 'da_contattare'
    });

  if (error) {
    toast('Errore selezione fornitore: ' + error.message, 'err');
    return;
  }

  toast('Fornitore aggiunto al preventivo', 'ok');

  if ((selezionati || []).length + 1 >= 2) {
    await renderFornitoriPreventivo();
  } else {
    await apriSelettoreFornitoriPreventivo();
  }
}

async function caricaPreventivoRicevutoFornitore(selezioneId) {
  const input = ge('pvf-file-ricevuto-' + selezioneId);
  const file = input?.files?.[0];

  if (!file) {
    toast('Seleziona il PDF ricevuto dal fornitore', 'err');
    return;
  }

  const nome = String(file.name || '').toLowerCase();

  if (
    file.type !== 'application/pdf' &&
    !nome.endsWith('.pdf')
  ) {
    toast('Puoi caricare solo file PDF', 'err');
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    toast('Il PDF supera il limite di 15 MB', 'err');
    return;
  }

  const { data: authData, error: erroreAuth } = await db.auth.getUser();

  if (erroreAuth || !authData?.user) {
    toast('Sessione non valida', 'err');
    return;
  }

  const nomeSicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

  const storagePath =
    currentPreventivoId +
    '/fornitori/' +
    selezioneId +
    '/' +
    Date.now() +
    '_' +
    nomeSicuro;

  const { error: erroreUpload } = await db.storage
    .from('preventivi-documenti')
    .upload(storagePath, file, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (erroreUpload) {
    toast('Errore caricamento PDF: ' + erroreUpload.message, 'err');
    return;
  }

  const { error: erroreInserimento } = await db
    .from('preventivi_fornitori_allegati')
    .insert({
      preventivo_fornitore_id: selezioneId,
      nome_file: file.name,
      storage_path: storagePath,
      mime_type: file.type || 'application/pdf',
      dimensione: file.size,
      caricato_da: authData.user.id
    });

  if (erroreInserimento) {
    await db.storage
      .from('preventivi-documenti')
      .remove([storagePath]);

    toast(
      'PDF caricato ma non registrato: ' + erroreInserimento.message,
      'err'
    );
    return;
  }

  await db
    .from('preventivi_fornitori')
    .update({
      stato: 'risposta_ricevuta',
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId);

  toast('Preventivo del fornitore caricato', 'ok');
  await renderFornitoriPreventivo();
}

async function apriAllegatoPreventivoFornitore(storagePath) {
  const { data, error } = await db.storage
    .from('preventivi-documenti')
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    toast(
      'Impossibile aprire il PDF: ' +
      (error?.message || 'file non disponibile'),
      'err'
    );
    return;
  }

  window.open(data.signedUrl, '_blank', 'noopener');
}

async function salvaDettagliFornitorePreventivo(selezioneId) {
  const prezzo = v('pvf-prezzo-' + selezioneId);

  const { error } = await db
    .from('preventivi_fornitori')
    .update({
      stato: v('pvf-stato-' + selezioneId),
      prezzo_offerto: prezzo === '' ? null : Number(prezzo),
      tempi_consegna_proposti: v('pvf-consegna-' + selezioneId).trim() || null,
      note: v('pvf-note-' + selezioneId).trim() || null,
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId);

  if (error) {
    toast('Errore salvataggio fornitore: ' + error.message, 'err');
    return;
  }

  toast('Dati fornitore salvati', 'ok');
  await renderFornitoriPreventivo();
}

async function rimuoviFornitorePreventivo(selezioneId) {
  if (!confirm('Rimuovere questo fornitore dal preventivo?')) return;

  const { error } = await db
    .from('preventivi_fornitori')
    .delete()
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId);

  if (error) {
    toast('Errore rimozione fornitore: ' + error.message, 'err');
    return;
  }

  toast('Fornitore rimosso dal preventivo', 'ok');
  await renderFornitoriPreventivo();
}

async function usaQuotazioneFornitoreNelPreventivo(selezioneId) {
  const { data: selezione, error: erroreSelezione } = await db
    .from('preventivi_fornitori')
    .select(`
      id,
      prezzo_offerto,
      tipologia,
      fornitori(ragione_sociale)
    `)
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId)
    .single();

  if (erroreSelezione || !selezione) {
    toast('Quotazione fornitore non trovata', 'err');
    return;
  }

  const costo = numeroPreventivo(selezione.prezzo_offerto);

  if (costo <= 0) {
    toast('Inserisci prima il prezzo ricevuto dal fornitore', 'err');
    return;
  }

  const percentuale = ricaricoFornituraDaCosto(costo);
  const prezzoCliente = Math.round(
    costo * (1 + percentuale / 100) * 100
  ) / 100;

  const nomeFornitore =
    selezione.fornitori?.ragione_sociale || 'Fornitore';

  const descrizione =
    'Fornitura ' +
    (selezione.tipologia || 'tecnica') +
    ' — ' +
    nomeFornitore;

  const { data: voceEsistente } = await db
    .from('preventivi_voci')
    .select('id')
    .eq('preventivo_id', currentPreventivoId)
    .eq('preventivo_fornitore_id', selezioneId)
    .maybeSingle();

  const datiVoce = {
    categoria: 'materiale',
    descrizione: descrizione,
    unita_misura: 'corpo',
    quantita: 1,
    costo_unitario: costo,
    prezzo_unitario: prezzoCliente,
    fornitore_preventivo_id: selezioneId,
    aggiornato_il: new Date().toISOString()
  };

  const risultato = voceEsistente
    ? await db
        .from('preventivi_voci')
        .update(datiVoce)
        .eq('id', voceEsistente.id)
    : await db
        .from('preventivi_voci')
        .insert({
          ...datiVoce,
          preventivo_id: currentPreventivoId,
          ordinamento: 0
        });

  if (risultato.error) {
    toast(
      'Errore inserimento costo fornitore: ' + risultato.error.message,
      'err'
    );
    return;
  }

  await db
    .from('preventivi_fornitori')
    .update({
      stato: 'selezionato',
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', selezioneId);

  toast(
    'Quotazione inserita: ricarico automatico ' +
    percentuale +
    '%',
    'ok'
  );

  await renderCostiPreventivo();

  const tab = document.querySelector(
    '.tab[onclick*="pvd-costi"]'
  );

  if (tab) stab(tab, 'pvd-costi');
}


let vociPreventivoDati = [];
let notePreventivoCliente = '';
let condizioniPagamentoPreventivo = '';

function numeroPreventivo(valore) {
  const numero = Number(valore);
  return Number.isFinite(numero) ? numero : 0;
}

function euroPreventivo(valore) {
  return numeroPreventivo(valore).toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR'
  });
}

function irHtmlPreventivo(etichetta, contenuto) {
  return `
    <div style="padding:8px;background:var(--bg);border-radius:var(--rs)">
      <div style="font-size:11px;color:var(--m);margin-bottom:2px">
        ${esc(etichetta)}
      </div>
      <div style="font-size:13px;font-weight:500">
        ${contenuto}
      </div>
    </div>
  `;
}

function totaleVocePreventivo(voce, tipo) {
  const quantita = numeroPreventivo(voce.quantita);

  if (tipo === 'costo') {
    return quantita * numeroPreventivo(voce.costo_unitario);
  }

  return quantita * numeroPreventivo(voce.prezzo_unitario);
}

function ricaricoFornituraDaCosto(costoFornitura) {
  const costo = numeroPreventivo(costoFornitura);

  if (costo <= 3000) return 70;
  if (costo <= 10000) return 50;
  if (costo <= 20000) return 45;
  if (costo <= 50000) return 35;
  if (costo <= 100000) return 30;

  return 25;
}

function costoTotaleFornituraPreventivo() {
  return vociPreventivoDati
    .filter(function(voce) {
      return voce.categoria === 'materiale';
    })
    .reduce(function(totale, voce) {
      return totale + totaleVocePreventivo(voce, 'costo');
    }, 0);
}

function applicaRicaricoFornitura() {
  const costoFornitura = costoTotaleFornituraPreventivo();

  if (costoFornitura <= 0) {
    toast('Inserisci prima il costo dei materiali forniti', 'err');
    return;
  }

  const percentuale = ricaricoFornituraDaCosto(costoFornitura);
  const moltiplicatore = 1 + (percentuale / 100);

  vociPreventivoDati.forEach(function(voce) {
    if (voce.categoria !== 'materiale') return;

    voce.prezzo_unitario = Math.round(
      numeroPreventivo(voce.costo_unitario) * moltiplicatore * 100
    ) / 100;
  });

  disegnaVociPreventivo();

  toast(
    'Ricarico del ' + percentuale +
    '% applicato alla fornitura di ' +
    euroPreventivo(costoFornitura),
    'ok'
  );
}

function aggiornaRiepilogoVociPreventivo() {
  const costo = vociPreventivoDati.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'costo');
  }, 0);

  const vendita = vociPreventivoDati.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'vendita');
  }, 0);

  const margine = vendita - costo;
  const marginePerc = vendita > 0 ? (margine / vendita) * 100 : 0;

  const costoEl = ge('pvv-totale-costo');
  const venditaEl = ge('pvv-totale-vendita');
  const margineEl = ge('pvv-totale-margine');
  const marginePercEl = ge('pvv-totale-margine-perc');

  if (costoEl) costoEl.textContent = euroPreventivo(costo);
  if (venditaEl) venditaEl.textContent = euroPreventivo(vendita);
  if (margineEl) margineEl.textContent = euroPreventivo(margine);
  if (marginePercEl) marginePercEl.textContent = marginePerc.toFixed(1) + '%';
}

function aggiornaCampoVocePreventivo(indice, campo, valore) {
  if (!vociPreventivoDati[indice]) return;

  const campiNumerici = [
    'quantita',
    'costo_unitario',
    'prezzo_unitario'
  ];

  vociPreventivoDati[indice][campo] =
    campiNumerici.includes(campo)
      ? numeroPreventivo(valore)
      : valore;

  const voce = vociPreventivoDati[indice];

  const costoRiga = ge('pvv-costo-riga-' + indice);
  const venditaRiga = ge('pvv-vendita-riga-' + indice);
  const margineRiga = ge('pvv-margine-riga-' + indice);

  const costo = totaleVocePreventivo(voce, 'costo');
  const vendita = totaleVocePreventivo(voce, 'vendita');
  const margine = vendita - costo;

  if (costoRiga) costoRiga.textContent = euroPreventivo(costo);
  if (venditaRiga) venditaRiga.textContent = euroPreventivo(vendita);
  if (margineRiga) margineRiga.textContent = euroPreventivo(margine);

  aggiornaRiepilogoVociPreventivo();
}

function disegnaVociPreventivo() {
  const box = ge('pvd-costi-content');
  if (!box) return;

  const costo = vociPreventivoDati.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'costo');
  }, 0);

  const vendita = vociPreventivoDati.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'vendita');
  }, 0);

  const margine = vendita - costo;
  const marginePerc = vendita > 0 ? (margine / vendita) * 100 : 0;

    const costoFornitura = costoTotaleFornituraPreventivo();
  const ricaricoFornitura = costoFornitura > 0
    ? ricaricoFornituraDaCosto(costoFornitura)
    : null;


  box.innerHTML = `
    <div class="al2 i" style="margin-bottom:14px">
      Inserisci materiali, lavorazioni e servizi. I costi sono interni;
      il prezzo cliente determina imponibile e margine preliminare.
    </div>


    <div class="g2" style="margin-bottom:16px">
      ${ir('Costo totale interno', euroPreventivo(costo))}
      ${ir('Imponibile cliente', euroPreventivo(vendita))}
      ${ir('Margine preliminare', euroPreventivo(margine))}
      ${ir('Margine percentuale', marginePerc.toFixed(1) + '%')}
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn sm p" onclick="aggiungiVocePreventivo()">
        + Aggiungi voce
      </button>

      <button
  class="btn sm info"
  onclick="applicaRicaricoFornitura()"
>
  📈 Applica ricarico fornitura
  ${ricaricoFornitura !== null ? '(' + ricaricoFornitura + '%)' : ''}
</button>

    </div>

    ${
      !vociPreventivoDati.length
        ? `<div class="empty">
            Nessuna voce inserita. Aggiungi materiale, manodopera o un servizio.
          </div>`
        : vociPreventivoDati.map(function(voce, indice) {
            const costoRiga = totaleVocePreventivo(voce, 'costo');
            const venditaRiga = totaleVocePreventivo(voce, 'vendita');
            const margineRiga = venditaRiga - costoRiga;

            return `
              <div class="card" style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px">
                  <div style="font-size:14px;font-weight:700">
                    Voce ${indice + 1}
                  </div>

                  ${
                    voce.id
                      ? `<button class="btn sm" style="color:var(--r)" onclick="eliminaVocePreventivo('${voce.id}')">Elimina</button>`
                      : `<button class="btn sm" style="color:var(--r)" onclick="rimuoviNuovaVocePreventivo(${indice})">Elimina</button>`
                  }
                </div>

                <div class="fr">
                  <div class="f">
                    <label>Categoria</label>
                    <select onchange="aggiornaCampoVocePreventivo(${indice}, 'categoria', this.value)">
                      <option value="materiale" ${voce.categoria === 'materiale' ? 'selected' : ''}>Materiale</option>
                      <option value="manodopera" ${voce.categoria === 'manodopera' ? 'selected' : ''}>Manodopera</option>
                      <option value="nolo" ${voce.categoria === 'nolo' ? 'selected' : ''}>Nolo</option>
                      <option value="trasporto" ${voce.categoria === 'trasporto' ? 'selected' : ''}>Trasporto</option>
                      <option value="servizio" ${voce.categoria === 'servizio' ? 'selected' : ''}>Servizio</option>
                      <option value="altro" ${voce.categoria === 'altro' ? 'selected' : ''}>Altro</option>
                    </select>
                  </div>

                  <div class="f">
                    <label>Unità di misura</label>
                    <input
                      type="text"
                      value="${esc(voce.unita_misura || 'pz')}"
                      placeholder="pz, ora, ml..."
                      oninput="aggiornaCampoVocePreventivo(${indice}, 'unita_misura', this.value)"
                    >
                  </div>
                </div>

                <div class="f">
                  <label>Descrizione *</label>
                  <input
                    type="text"
                    value="${esc(voce.descrizione || '')}"
                    placeholder="Es. Fornitura porta REI 120 completa di posa"
                    oninput="aggiornaCampoVocePreventivo(${indice}, 'descrizione', this.value)"
                  >
                </div>

                <div class="fr">
                  <div class="f">
                    <label>Quantità</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value="${numeroPreventivo(voce.quantita)}"
                      oninput="aggiornaCampoVocePreventivo(${indice}, 'quantita', this.value)"
                    >
                  </div>

                  <div class="f">
                    <label>Costo unitario interno (€)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value="${numeroPreventivo(voce.costo_unitario)}"
                      oninput="aggiornaCampoVocePreventivo(${indice}, 'costo_unitario', this.value)"
                    >
                  </div>
                </div>

                <div class="f">
                  <label>Prezzo unitario cliente (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value="${numeroPreventivo(voce.prezzo_unitario)}"
                    oninput="aggiornaCampoVocePreventivo(${indice}, 'prezzo_unitario', this.value)"
                  >
                </div>

                <div class="g2">
                  ${irHtmlPreventivo('Costo riga', `<span id="pvv-costo-riga-${indice}">${euroPreventivo(costoRiga)}</span>`)}
                  ${irHtmlPreventivo('Totale cliente', `<span id="pvv-vendita-riga-${indice}">${euroPreventivo(venditaRiga)}</span>`)}
                  ${irHtmlPreventivo('Margine riga', `<span id="pvv-margine-riga-${indice}">${euroPreventivo(margineRiga)}</span>`)}
                  ${irHtmlPreventivo('Margine %', venditaRiga > 0 ? ((margineRiga / venditaRiga) * 100).toFixed(1) + '%' : '—')}
                </div>
              </div>
            `;
          }).join('')
    }

    <div class="card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
        <div>
          <div style="font-size:15px;font-weight:700">Totali provvisori</div>
          <div style="font-size:12px;color:var(--m);margin-top:4px">
            Il titolare potrà applicare sconti e validare l’offerta in seguito.
          </div>
        </div>

</div>

        <div style="text-align:right">
          <div style="font-size:12px;color:var(--m)">Imponibile cliente</div>
          <div id="pvv-totale-vendita" style="font-size:20px;font-weight:700">
            ${euroPreventivo(vendita)}
          </div>
        </div>
      </div>

      <div class="g2" style="margin-top:14px">
        ${irHtmlPreventivo('Costo totale interno', `<span id="pvv-totale-costo">${euroPreventivo(costo)}</span>`)}
        ${irHtmlPreventivo('Margine preliminare', `<span id="pvv-totale-margine">${euroPreventivo(margine)}</span>`)}
        ${irHtmlPreventivo('Margine percentuale', `<span id="pvv-totale-margine-perc">${marginePerc.toFixed(1)}%</span>`)}
      </div>

      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--b)">
  <div style="font-size:14px;font-weight:700;margin-bottom:5px">
    💳 Modalità di pagamento
  </div>

  <div style="font-size:12px;color:var(--m);margin-bottom:10px">
    Facoltative. Verranno riportate nel preventivo cliente.
  </div>

  <textarea
    id="pvv-condizioni-pagamento"
    rows="2"
    placeholder="Es. 50% all'ordine e saldo a fine lavori; bonifico bancario a 30 giorni..."
    oninput="condizioniPagamentoPreventivo = this.value"
  >${esc(condizioniPagamentoPreventivo)}</textarea>
</div>

      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--b)">
  <div style="font-size:14px;font-weight:700;margin-bottom:5px">
    📝 Note aggiuntive per il cliente
  </div>

  <div style="font-size:12px;color:var(--m);margin-bottom:10px">
    Facoltative. Inserisci qui condizioni, precisazioni o attività aggiuntive.
  </div>

  <textarea
    id="pvv-note-cliente"
    rows="4"
    placeholder="Es. Sono esclusi lavori edili, tempi soggetti a sopralluogo, condizioni di pagamento..."
    oninput="notePreventivoCliente = this.value"
  >${esc(notePreventivoCliente)}</textarea>
</div>


 <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px;padding-top:14px;border-top:1px solid var(--b)">
  <button
    class="btn p"
    ${vociPreventivoDati.length ? '' : 'disabled'}
    onclick="salvaVociPreventivo()"
  >
    💾 Salva preventivo
  </button>

  <button
    class="btn info"
    ${vociPreventivoDati.length ? '' : 'disabled'}
    onclick="generaPreventivoClientePDF()"
  >
    📄 Genera PDF cliente
  </button>

  <button
  class="btn warn"
  onclick="inviaPdfClienteATitolareERappresentante()"
>
  📤 Invia a titolare e rappresentante
</button>

  <button
  class="btn"
  style="color:var(--r)"
  onclick="eliminaPreventivo(currentPreventivoId)"
>
  🗑️ Elimina preventivo
</button>

    </div>
  `;
}

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
  const puoGestire =
    ROLE === 'titolare' ||
    (ROLE === 'commerciale' && origine === 'commerciale');

  const titolo = origine === 'commerciale'
    ? '📄 Certificato del commerciale'
    : '📄 Certificato del titolare';

  if (!certificato) {
    if (origine === 'commerciale' && ROLE === 'titolare') {
      return `
        <div class="card" style="margin-bottom:14px">
          <b>${titolo}</b>
          <p class="muted" style="margin-top:8px">
            Il commerciale non ha ancora caricato un certificato.
          </p>
        </div>
      `;
    }

    return `
      <div class="card" style="margin-bottom:14px">
        <b>${titolo}</b>
        <p class="muted" style="margin-top:8px">Nessun PDF caricato.</p>

        ${puoGestire ? `
          <input
            type="file"
            id="certificato-file-${origine}"
            accept="application/pdf"
            style="margin-top:10px"
          >

          <button
            class="btn primary"
            style="margin-top:10px"
            onclick="caricaCertificatoPreventivo('${origine}')"
          >
            📤 Carica PDF
          </button>
        ` : ''}
      </div>
    `;
  }

  const statoInvio = certificato.inviato_il
    ? `<span class="badge green">✓ Inviato all’ingegnere il ${formatoDataOraCertificato(certificato.inviato_il)}</span>`
    : `<span class="badge yellow">Da inviare all’ingegnere</span>`;

  return `
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:start">
        <div>
          <b>${titolo}</b>
          <div style="margin-top:8px">${statoInvio}</div>
        </div>
      </div>

      <p style="margin:12px 0 4px"><b>File:</b> ${esc(certificato.nome_file)}</p>
      <p class="muted" style="margin:0">
        Caricato il ${formatoDataOraCertificato(certificato.caricato_il)}
      </p>

      <div class="actions" style="margin-top:12px">
        <button class="btn" onclick="apriCertificatoPreventivo('${certificato.id}')">
          👁 Apri / scarica
        </button>

        ${puoGestire ? `
          <button
            class="btn primary"
            onclick="inviaCertificatoAllIngegnere('${certificato.id}')"
          >
            ${certificato.inviato_il ? '↻ Reinvia all’ingegnere' : '📨 Invia all’ingegnere'}
          </button>

          <input
            type="file"
            id="certificato-file-${origine}"
            accept="application/pdf"
            style="margin-top:10px"
          >

          <button
            class="btn"
            style="margin-top:10px"
            onclick="caricaCertificatoPreventivo('${origine}')"
          >
            🔄 Sostituisci PDF
          </button>
        ` : ''}
      </div>
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
    .order('origine');

  if (error) {
    box.innerHTML = `<div class="empty">Errore nel caricamento dei certificati: ${esc(error.message)}</div>`;
    return;
  }

  const commerciale = (data || []).find(x => x.origine === 'commerciale');
  const titolare = (data || []).find(x => x.origine === 'titolare');

  if (ROLE === 'commerciale') {
    box.innerHTML = `
      <div class="info">
        Carica il certificato del preventivo e invialo direttamente all’ingegnere.
        Se sostituisci il PDF, dovrai poi reinviarlo.
      </div>
      ${cardCertificatoPreventivo(commerciale, 'commerciale')}
    `;
    return;
  }

  if (ROLE === 'titolare') {
    box.innerHTML = `
      <div class="info">
        Puoi vedere e correggere il certificato del commerciale.
        Il tuo certificato riservato non sarà invece visibile al commerciale.
      </div>

      ${cardCertificatoPreventivo(commerciale, 'commerciale')}
      ${cardCertificatoPreventivo(titolare, 'titolare')}
    `;
  }
}

async function caricaCertificatoPreventivo(origine) {
  const input = ge(`certificato-file-${origine}`);
  const file = input?.files?.[0];

  if (!file) {
    toast('Seleziona prima un PDF', 'err');
    return;
  }

  if (file.type !== 'application/pdf') {
    toast('Puoi caricare soltanto file PDF', 'err');
    return;
  }

  const puoGestire =
    ROLE === 'titolare' ||
    (ROLE === 'commerciale' && origine === 'commerciale');

  if (!puoGestire) {
    toast('Non hai i permessi per modificare questo certificato', 'err');
    return;
  }

  const { data: utenteData } = await db.auth.getUser();
  const utente = utenteData?.user;

  if (!utente) {
    toast('Sessione non valida. Effettua di nuovo l’accesso.', 'err');
    return;
  }

  const { data: esistente, error: erroreEsistente } = await db
    .from('preventivi_certificati')
    .select('*')
    .eq('preventivo_id', currentPreventivoId)
    .eq('origine', origine)
    .maybeSingle();

  if (erroreEsistente) {
    toast(`Errore lettura certificato: ${erroreEsistente.message}`, 'err');
    return;
  }

  if (ROLE === 'titolare' && origine === 'commerciale' && !esistente) {
    toast('Il certificato commerciale può essere creato solo dal commerciale', 'err');
    return;
  }

  const conferma = esistente
    ? confirm('Vuoi sostituire il PDF attuale? Il nuovo file dovrà essere reinviato all’ingegnere.')
    : true;

  if (!conferma) return;

  const { data: preventivo } = await db
    .from('preventivi')
    .select('numero, clienti(ragione_sociale)')
    .eq('id', currentPreventivoId)
    .single();

  const nomeSicuro = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');

  const percorso = `${currentPreventivoId}/${origine}/${Date.now()}_${nomeSicuro}`;

  const { error: erroreUpload } = await db.storage
    .from('certificati-preventivi')
    .upload(percorso, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'application/pdf'
    });

  if (erroreUpload) {
    toast(`Errore caricamento PDF: ${erroreUpload.message}`, 'err');
    return;
  }

  const datiCertificato = {
    preventivo_id: currentPreventivoId,
    origine,
    commerciale_id: origine === 'commerciale'
      ? (esistente?.commerciale_id || utente.id)
      : null,
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

  let erroreSalvataggio;

  if (esistente) {
    const risposta = await db
      .from('preventivi_certificati')
      .update(datiCertificato)
      .eq('id', esistente.id);

    erroreSalvataggio = risposta.error;
  } else {
    const risposta = await db
      .from('preventivi_certificati')
      .insert(datiCertificato);

    erroreSalvataggio = risposta.error;
  }

  if (erroreSalvataggio) {
    toast(`Errore salvataggio certificato: ${erroreSalvataggio.message}`, 'err');
    return;
  }

  if (esistente?.storage_path) {
    await db.storage
      .from('certificati-preventivi')
      .remove([esistente.storage_path]);
  }

  toast(esistente ? 'PDF sostituito. Ricordati di reinviarlo all’ingegnere.' : 'Certificato caricato');
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
  const { data: certificato, error } = await db
    .from('preventivi_certificati')
    .select('*')
    .eq('id', certificatoId)
    .single();

  if (error || !certificato) {
    toast('Certificato non disponibile', 'err');
    return;
  }

  const { data, error: erroreUrl } = await db.storage
    .from('certificati-preventivi')
    .createSignedUrl(certificato.storage_path, 300);

  if (erroreUrl || !data?.signedUrl) {
    toast(`Impossibile aprire il PDF: ${erroreUrl?.message || ''}`, 'err');
    return;
  }

  window.open(data.signedUrl, '_blank', 'noopener');
}

async function loadCertificatiIngegnere() {
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
          <p><b>Origine:</b> ${certificato.origine === 'commerciale' ? 'Commerciale' : 'Titolare'}</p>
          <p><b>File:</b> ${esc(certificato.nome_file)}</p>
          <p class="muted">Inviato il ${formatoDataOraCertificato(certificato.inviato_il)}</p>

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

    const { data: preventivo } = await db
    .from('preventivi')
    .select('note,condizioni_pagamento')
    .eq('id', currentPreventivoId)
    .single();

  notePreventivoCliente = preventivo?.note || '';

  condizioniPagamentoPreventivo =
  preventivo?.condizioni_pagamento || '';

  vociPreventivoDati = data || [];
  disegnaVociPreventivo();
}

function aggiungiVocePreventivo() {
  vociPreventivoDati.push({
    id: null,
    categoria: 'materiale',
    descrizione: '',
    unita_misura: 'pz',
    quantita: 1,
    costo_unitario: 0,
    prezzo_unitario: 0
  });

  disegnaVociPreventivo();
}

function rimuoviNuovaVocePreventivo(indice) {
  vociPreventivoDati.splice(indice, 1);
  disegnaVociPreventivo();
}

async function eliminaVocePreventivo(voceId) {
  if (!confirm('Eliminare questa voce dal preventivo?')) return;

  const { error } = await db
    .from('preventivi_voci')
    .delete()
    .eq('id', voceId)
    .eq('preventivo_id', currentPreventivoId);

  if (error) {
    toast('Errore eliminazione voce: ' + error.message, 'err');
    return;
  }

  toast('Voce eliminata', 'ok');
  await renderCostiPreventivo();
}

async function salvaVociPreventivo() {
  const vociNonValide = vociPreventivoDati.some(function(voce) {
    return !String(voce.descrizione || '').trim();
  });

  if (vociNonValide) {
    toast('Inserisci una descrizione per ogni voce', 'err');
    return;
  }

  const vociEsistenti = vociPreventivoDati.filter(function(voce) {
    return voce.id;
  });

  const vociNuove = vociPreventivoDati.filter(function(voce) {
    return !voce.id;
  });

  for (let indice = 0; indice < vociEsistenti.length; indice++) {
    const voce = vociEsistenti[indice];

    const { error } = await db
      .from('preventivi_voci')
      .update({
        categoria: voce.categoria,
        descrizione: String(voce.descrizione).trim(),
        unita_misura: voce.unita_misura || 'pz',
        quantita: numeroPreventivo(voce.quantita),
        costo_unitario: numeroPreventivo(voce.costo_unitario),
        prezzo_unitario: numeroPreventivo(voce.prezzo_unitario),
        ordinamento: indice,
        aggiornato_il: new Date().toISOString()
      })
      .eq('id', voce.id)
      .eq('preventivo_id', currentPreventivoId);

    if (error) {
      toast('Errore salvataggio voce: ' + error.message, 'err');
      return;
    }
  }

  if (vociNuove.length) {
    const righe = vociNuove.map(function(voce, indice) {
      return {
        preventivo_id: currentPreventivoId,
        categoria: voce.categoria,
        descrizione: String(voce.descrizione).trim(),
        unita_misura: voce.unita_misura || 'pz',
        quantita: numeroPreventivo(voce.quantita),
        costo_unitario: numeroPreventivo(voce.costo_unitario),
        prezzo_unitario: numeroPreventivo(voce.prezzo_unitario),
        ordinamento: vociEsistenti.length + indice
      };
    });

    const { error } = await db
      .from('preventivi_voci')
      .insert(righe);

    if (error) {
      toast('Errore inserimento voci: ' + error.message, 'err');
      return;
    }
  }

  const totaleImponibile = vociPreventivoDati.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'vendita');
  }, 0);

  const { error: erroreTotale } = await db
    .from('preventivi')
    .update({
      totale_imponibile: totaleImponibile,
      note: notePreventivoCliente.trim() || null,
      condizioni_pagamento: condizioniPagamentoPreventivo.trim() || null,
      aggiornato_il: new Date().toISOString()
      
    })
    .eq('id', currentPreventivoId);

  if (erroreTotale) {
    toast('Voci salvate, ma totale non aggiornato: ' + erroreTotale.message, 'err');
    return;
  }

  toast('Voci e totale preventivo salvati', 'ok');
  await renderCostiPreventivo();
}

async function generaPreventivoClientePDF() {
if (!(await preparaPDF())) return;

  const [
    preventivoRes,
    vociRes
  ] = await Promise.all([
    db
      .from('preventivi')
      .select(`
        id,
        numero,
        tipo,
        data_scadenza,
        iva_perc,
        totale_imponibile,
        note,
        condizioni_pagamento,
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
      .select('descrizione,unita_misura,quantita,prezzo_unitario,ordinamento')
      .eq('preventivo_id', currentPreventivoId)
      .order('ordinamento')
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

  const totaleImponibile = voci.reduce(function(totale, voce) {
    return totale +
      numeroPreventivo(voce.quantita) *
      numeroPreventivo(voce.prezzo_unitario);
  }, 0);

  const ivaPerc = Number(preventivo.iva_perc ?? 22);
  const totaleIva = totaleImponibile * (ivaPerc / 100);
  const totaleDocumento = totaleImponibile + totaleIva;
  const cliente = preventivo.clienti || {};

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

  doc.autoTable({
    startY: y + 4,
    head: [[
      'Descrizione',
      'Q.tà',
      'U.M.',
      'Prezzo unit.',
      'Totale'
    ]],
    body: voci.map(function(voce) {
      const quantita = numeroPreventivo(voce.quantita);
      const prezzo = numeroPreventivo(voce.prezzo_unitario);

      return [
        voce.descrizione || '—',
        String(quantita),
        voce.unita_misura || 'pz',
        euroPreventivo(prezzo),
        euroPreventivo(quantita * prezzo)
      ];
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
    columnStyles: {
      0: { cellWidth: 72 },
      1: { halign: 'right', cellWidth: 18 },
      2: { cellWidth: 18 },
      3: { halign: 'right', cellWidth: 34 },
      4: { halign: 'right', cellWidth: 34 }
    }
  });

  y = doc.lastAutoTable.finalY + 12;

  if (y > 245) {
    doc.addPage();
    y = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(
    'Imponibile: ' + euroPreventivo(totaleImponibile),
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

    if (y > 255) {
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

    if (y + righe.length * 5 > 280) {
      doc.addPage();
      y = 20;
    }

    doc.text(righe, margine, y);
    y += righe.length * 5 + 10;
  }

  sezione(
    'Modalità di pagamento',
    preventivo.condizioni_pagamento
  );

  sezione(
    'Note',
    preventivo.note
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

 const nomeFile = `Preventivo_${preventivo.numero}_Toli_Fire_${Date.now()}.pdf`;

  const pdfBlob = doc.output('blob');

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

  const { error: erroreAggiornamento } = await db
    .from('preventivi')
    .update({
      totale_imponibile: totaleImponibile,
      preventivo_cliente_pdf_path: storagePath,
      preventivo_cliente_pdf_nome: nomeFile,
      preventivo_cliente_pdf_generato_il: new Date().toISOString()
    })
    .eq('id', currentPreventivoId);

  if (erroreAggiornamento) {
    toast(
      'PDF salvato, ma errore aggiornamento preventivo: ' +
      erroreAggiornamento.message,
      'err'
    );
    return;
  }

  doc.save(nomeFile);

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
    .select('id,numero,cliente_id')
    .eq('id', currentPreventivoId)
    .single();

  if (errorePreventivo || !preventivo) {
    toast('Preventivo non trovato', 'err');
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

  if (!['commerciale', 'titolare'].includes(ROLE)) {
  toast('Solo commerciale o titolare possono inviare il preventivo', 'err');
  return;
}

const { data: preventivo, error: errorePreventivo } = await db
  .from('preventivi')
  .select(`
  id,
  numero,
  cliente_id,
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
    .select('famiglia,dati,dati_commerciali,aggiornato_il')
    .eq('progetto_tecnico_id', preventivo.progetto_tecnico_id)
    .order('aggiornato_il', { ascending: false });

  if (erroreSchede) {
    toast(
      'Errore caricamento rilievi tecnici: ' + erroreSchede.message,
      'err'
    );
    return;
  }

    const idsAllegati = Array.isArray(selezione.allegati_progetto_ids)
    ? selezione.allegati_progetto_ids
    : [];

  let fotoDaInserire = [];

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

  if (schede && schede.length) {
  titolo('Rilievi tecnici dell’ingegnere');

  schede.forEach(function(scheda) {
      titolo(etichettaFamigliaTecnica(scheda.famiglia));

     const campi = Object.entries(
  datiSchedaDaMostrare(scheda)
).filter(function(entry) {
        const valore = entry[1];

        return valore !== null &&
          valore !== undefined &&
          valore !== '';
      });

      if (!campi.length) {
        testo('Nessun dato tecnico compilato.');
        return;
      }

      campi.forEach(function(entry) {
        testo(
          etichettaCampoTecnico(entry[0]) +
          ': ' +
          valoreSchedaTecnica(entry[1]),
          9
        );
      });
    });
  }


  if (selezione.note) {
  titolo('Indicazioni aggiuntive');

  testo(
    selezione.note,
    10
  );
}

  for (const foto of fotoDaInserire) {
    try {
      const { data: urlData, error: erroreUrl } = await db.storage
        .from('progetti-tecnici')
        .createSignedUrl(foto.storage_path, 3600);

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

  doc.save(
    'Richiesta_quotazione_RQ-' +
    preventivo.numero +
    '-V' +
    versione +
    '_' +
    nomeFornitore +
    '.pdf'
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

let leadSitoCache = [];

function leadSitoEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function leadSitoData(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function nomeUtenteLeadSito(id) {
  if (!id) return "Non assegnata";

  const utente = (UTENTI || []).find((u) => u.id === id);

  return utente
    ? (utente.nome || utente.email || "Utente")
    : "Utente non disponibile";
}

function montaLeadSitoTitolare() {
  if (ROLE !== "titolare") return;

  const tabs = document.querySelector("#pg-trattative .tabs");

  if (!tabs || document.getElementById("tab-lead-sito")) return;

  tabs.insertAdjacentHTML(
    "beforeend",
    `
      <button
        class="tab"
        id="tab-lead-sito"
        onclick="stab(this,'tr-sito'); loadLeadSito()"
      >
        📥 Lead dal sito
      </button>
    `,
  );

  tabs.insertAdjacentHTML(
    "afterend",
    `
      <div class="tc" id="tr-sito">
        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:12px;
            margin:12px 0;
          "
        >
          <div>
            <b>Richieste ricevute dal sito</b>
            <div class="muted">
              Google Ads, form delle pagine servizio, UTM e GCLID.
            </div>
          </div>

          <button class="btn" onclick="loadLeadSito()">↻ Aggiorna</button>
        </div>

        <div id="lead-sito-lista">Apri questa tab per caricare le lead.</div>
      </div>
    `,
  );
}

async function loadLeadSito() {
  if (ROLE !== "titolare") return;

  const contenitore = document.getElementById("lead-sito-lista");

  if (!contenitore) return;

  contenitore.innerHTML = "Caricamento lead dal sito...";

  const { data, error } = await db
    .from("lead_sito")
    .select("*")
    .order("creato_il", { ascending: false });

  if (error) {
    contenitore.innerHTML = `
      <div class="alert err">
        Errore caricamento lead sito: ${leadSitoEsc(error.message)}
      </div>
    `;
    return;
  }

  leadSitoCache = data || [];

  if (!leadSitoCache.length) {
    contenitore.innerHTML = `
      <div class="empty">
        Nessuna lead ricevuta dal sito.
      </div>
    `;
    return;
  }

  const assegnatari = [
    ME,
    ...(UTENTI || []).filter(
      (u) => u.ruolo === "rappresentante" && u.id !== ME.id && u.attivo !== false,
    ),
  ];

  contenitore.innerHTML = leadSitoCache.map((lead) => {
    const assegnata = Boolean(lead.assegnato_a);
    const convertita = lead.stato_commerciale === "convertito";
    const nonQualificata = lead.stato_commerciale === "non_qualificato";

    const opzioniAssegnatario = assegnatari.map((utente) => `
      <option
        value="${utente.id}"
        ${lead.assegnato_a === utente.id ? "selected" : ""}
      >
        ${leadSitoEsc(
          utente.id === ME.id
            ? `${utente.nome || utente.email} (titolare)`
            : utente.nome || utente.email,
        )}
      </option>
    `).join("");

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px">
          <div>
            <b>${leadSitoEsc(lead.azienda || lead.nome || "Lead sito")}</b>
            <div class="muted">
              ${leadSitoEsc(lead.codice)} · ${leadSitoData(lead.creato_il)}
            </div>
          </div>

          <span class="badge ${
            convertita ? "ok" : nonQualificata ? "err" : "info"
          }">
            ${leadSitoEsc(lead.stato_commerciale || "da_qualificare")}
          </span>
        </div>

        <div style="margin-top:10px">
          <div><b>Referente:</b> ${leadSitoEsc(lead.nome || "—")}</div>
          <div><b>Email:</b> ${leadSitoEsc(lead.email || "—")}</div>
          <div><b>Telefono:</b> ${leadSitoEsc(lead.telefono || "—")}</div>
          <div><b>Servizio:</b> ${leadSitoEsc(lead.servizio_richiesto || "—")}</div>
          <div><b>Pagina:</b> ${leadSitoEsc(lead.pagina_provenienza || "—")}</div>
          <div><b>Fonte rilevata:</b> ${leadSitoEsc(lead.fonte_rilevata || "sconosciuta")}</div>
          <div><b>GCLID:</b> ${leadSitoEsc(lead.gclid || "non disponibile")}</div>
          <div><b>Messaggio:</b> ${leadSitoEsc(lead.messaggio || "—")}</div>
        </div>

        <div style="margin-top:12px">
          <label>Assegna a</label>
          <select id="assegna-lead-${lead.id}" ${convertita || nonQualificata ? "disabled" : ""}>
            <option value="">— scegli assegnatario —</option>
            ${opzioniAssegnatario}
          </select>
        </div>

        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          ${
            !convertita && !nonQualificata
              ? `
              <button
  class="btn p"
  onclick="assegnaEInviaLeadSito('${lead.id}')"
>
  📨 Assegna e invia
</button>

                <button
                  class="btn p"
                  onclick="convertiLeadSito('${lead.id}')"
                  ${assegnata ? "" : "disabled"}
                >
                  ✓ Converti in prospect
                </button>

                <button
                  class="btn danger"
                  onclick="nonQualificareLeadSito('${lead.id}')"
                >
                  ✕ Non qualificata
                </button>
              `
              : ""
          }
        </div>

        ${
          assegnata
            ? `
              <div class="muted" style="margin-top:8px">
                Assegnata a: ${leadSitoEsc(nomeUtenteLeadSito(lead.assegnato_a))}
              </div>
            `
            : ""
        }
      </div>
    `;
  }).join("");
}

async function salvaAssegnazioneLeadSito(leadId) {
  const select = document.getElementById(`assegna-lead-${leadId}`);
  const assegnatoA = select?.value;

  if (!assegnatoA) {
    alert("Scegli prima il titolare o un rappresentante.");
    return;
  }

  const { error } = await db
    .from("lead_sito")
    .update({
      assegnato_a: assegnatoA,
      assegnato_il: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    alert(`Errore assegnazione: ${error.message}`);
    return;
  }

  await loadLeadSito();
}

async function convertiLeadSito(leadId) {
  const lead = leadSitoCache.find((item) => item.id === leadId);

  if (!lead) {
    alert("Lead non trovata. Aggiorna la pagina.");
    return;
  }

  if (!lead.assegnato_a) {
    alert("Prima assegna la lead al titolare o a un rappresentante.");
    return;
  }

  if (!confirm(
    "Convertire questa lead in prospect? Verranno creati cliente e trattativa CRM.",
  )) {
    return;
  }

  const ragioneSociale = lead.azienda?.trim()
    || lead.nome?.trim()
    || `Lead sito ${lead.codice}`;

  const nota = [
    `Lead sito: ${lead.codice}`,
    `Pagina: ${lead.pagina_provenienza || "—"}`,
    `Fonte rilevata: ${lead.fonte_rilevata || "sconosciuta"}`,
    `Fonte dichiarata: ${lead.fonte_dichiarata || "—"}`,
    `GCLID: ${lead.gclid || "—"}`,
    lead.messaggio ? `Messaggio: ${lead.messaggio}` : "",
  ].filter(Boolean).join("\n");

  const { data: cliente, error: erroreCliente } = await db
    .from("clienti")
    .insert({
      ragione_sociale: ragioneSociale,
      referente_nome: lead.nome || null,
      referente_email: lead.email || null,
      referente_telefono: lead.telefono || null,
      stato: "prospect",
      rappresentante_id: lead.assegnato_a,
      note_commerciali: nota,
    })
    .select()
    .single();

  if (erroreCliente) {
    alert(`Errore creazione prospect: ${erroreCliente.message}`);
    return;
  }

  const { data: pipeline, error: errorePipeline } = await db
    .from("pipeline_crm")
    .insert({
      cliente_id: cliente.id,
      rappresentante_id: lead.assegnato_a,
      fase: "primo_contatto",
      fonte_lead: "sito_web",
      dettaglio_fonte: `Lead sito ${lead.codice} · ${lead.pagina_provenienza || "pagina non disponibile"}`,
      servizio_richiesto: lead.servizio_richiesto || null,
      note_trattativa: nota,
    })
    .select()
    .single();

  if (errorePipeline) {
    alert(
      `Il prospect è stato creato, ma manca la trattativa: ${errorePipeline.message}`,
    );
    return;
  }

  const { error: erroreLead } = await db
    .from("lead_sito")
    .update({
      stato_commerciale: "convertito",
      cliente_id: cliente.id,
      pipeline_id: pipeline.id,
      qualificato_il: new Date().toISOString(),
      qualificato_da: ME.id,
    })
    .eq("id", lead.id);

  if (erroreLead) {
    alert(
      `Prospect e trattativa creati, ma stato lead non aggiornato: ${erroreLead.message}`,
    );
    return;
  }

  alert("Lead convertita in prospect e assegnata correttamente.");
  await loadLeadSito();
}

async function nonQualificareLeadSito(leadId) {
  if (!confirm("Segnare questa lead come non qualificata?")) return;

  const { error } = await db
    .from("lead_sito")
    .update({
      stato_commerciale: "non_qualificato",
      qualificato_il: new Date().toISOString(),
      qualificato_da: ME.id,
    })
    .eq("id", leadId);

  if (error) {
    alert(`Errore aggiornamento lead: ${error.message}`);
    return;
  }

  await loadLeadSito();
}

async function caricaAvvisiLeadAssegnate() {
  if (ROLE !== "rappresentante") return;

  let box = ge("rap-lead-assegnate");

  // Crea il punto sotto “Nuovo sopralluogo” se non esiste già.
  if (!box) {
    const pulsanteSopralluogo = document.querySelector(
      "#pg-dashboard-rapp .rap-primary",
    );

    if (!pulsanteSopralluogo) return;

    pulsanteSopralluogo.insertAdjacentHTML(
      "afterend",
      `<div id="rap-lead-assegnate"></div>`,
    );

    box = ge("rap-lead-assegnate");
  }

  const { data: lead, error } = await db
    .from("pipeline_crm")
    .select(`
      id,
      servizio_richiesto,
      fase,
      aggiornato_il,
      clienti(ragione_sociale)
    `)
    .eq("rappresentante_id", ME.id)
    .eq("fonte_lead", "sito_web")
    .eq("fase", "primo_contatto")
    .is("letto_rappresentante_il", null)
    .order("aggiornato_il", { ascending: false });

  if (error || !lead?.length) {
    box.innerHTML = "";
    return;
  }

  const numero = lead.length;
  const testo = numero === 1
    ? "Hai 1 nuova lead da contattare"
    : `Hai ${numero} nuove lead da contattare`;

  box.innerHTML = `
    <button
      class="rap-primary"
      style="background:#b91c1c;margin-top:14px"
      onclick="apriLeadAssegnateDaDashboardRapp()"
    >
      <span class="ico">🔴</span>

      <span class="body">
        <span class="title">${testo}</span>
        <span class="sub">
          Lead assegnate dal titolare. Apri Lead e trattative per gestirle.
        </span>
      </span>

      <span class="chev">›</span>
    </button>
  `;
}

function toggleLeadAssegnateRapp() {
  const dettaglio = ge("rap-lead-assegnate-dettaglio");

  if (!dettaglio) return;

  dettaglio.style.display =
    dettaglio.style.display === "none" ? "block" : "none";
}

function leadAvvisoEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function leadAvvisoData(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function assegnaEInviaLeadSito(leadId) {
  const select = document.getElementById(`assegna-lead-${leadId}`);
  const assegnatoA = select?.value;

  if (!assegnatoA) {
    alert("Scegli prima il rappresentante a cui inviare la lead.");
    return;
  }

  const lead = leadSitoCache.find((item) => item.id === leadId);

  if (!lead) {
    alert("Lead non trovata. Aggiorna la pagina.");
    return;
  }

  if (!confirm(
    "Assegnare la lead e crearla subito nelle Lead e trattative del rappresentante?",
  )) {
    return;
  }

  const { error } = await db
    .from("lead_sito")
    .update({
      assegnato_a: assegnatoA,
      assegnato_il: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    alert(`Errore assegnazione: ${error.message}`);
    return;
  }

  lead.assegnato_a = assegnatoA;

  await convertiLeadSito(leadId);
}


async function caricaAvvisoLeadSitoTitolare() {
  if (ROLE !== "titolare") return;

  let box = ge("tit-avviso-lead-sito");

  if (!box) {
    const saluto = document.querySelector("#dash-titolare .tit-greet");

    if (!saluto) return;

    saluto.insertAdjacentHTML(
      "afterend",
      `<div id="tit-avviso-lead-sito"></div>`,
    );

    box = ge("tit-avviso-lead-sito");
  }

 const { count, error } = await db
  .from("lead_sito")
  .select("id", { count: "exact", head: true })
  .in("stato_commerciale", ["da_qualificare", "contattato"])
  .is("letto_titolare_il", null);

  if (error || !count) {
    box.innerHTML = "";
    return;
  }

  const testo = count === 1
    ? "Hai 1 nuova lead dal sito"
    : `Hai ${count} nuove lead dal sito`;

  box.innerHTML = `
    <button
      class="rap-primary"
      style="background:#b91c1c;margin:14px 0"
      onclick="apriLeadSitoDaDashboardTitolare()"
    >
      <span class="ico">🔴</span>

      <span class="body">
        <span class="title">${testo}</span>
        <span class="sub">
          Richieste ricevute da moduli sito, Google Ads e pagine servizio.
        </span>
      </span>

      <span class="chev">›</span>
    </button>
  `;
}

async function apriLeadSitoDaDashboardTitolare() {
  const box = ge("tit-avviso-lead-sito");

  // La nasconde subito graficamente.
  if (box) box.innerHTML = "";

  // Segna come lette tutte le lead sito ancora da lavorare.
  const { error } = await db
    .from("lead_sito")
    .update({
      letto_titolare_il: new Date().toISOString(),
    })
    .in("stato_commerciale", ["da_qualificare", "contattato"])
    .is("letto_titolare_il", null);

  if (error) {
    console.error("Errore lettura notifiche lead sito:", error.message);
  }

  gotoPage("trattative");

  setTimeout(function () {
    montaLeadSitoTitolare();

    const tab = ge("tab-lead-sito");

    if (tab) {
      stab(tab, "tr-sito");
      loadLeadSito();
    }
  }, 150);
}

async function eliminaFornitore(fornitoreId) {
  if (ROLE !== 'commerciale') {
    toast('Non hai i permessi per eliminare fornitori', 'err');
    return;
  }

  const fornitore = fornitoriDati.find(function(f) {
    return f.id === fornitoreId;
  });

  const nome = fornitore?.ragione_sociale || 'questo fornitore';

  const conferma = confirm(
    `Vuoi davvero eliminare "${nome}"?\n\n` +
    'Il fornitore non comparirà più nelle selezioni future. ' +
    'I collegamenti ai preventivi già creati saranno mantenuti.'
  );

  if (!conferma) return;

  const { error } = await db
    .from('fornitori')
    .update({ attivo: false })
    .eq('id', fornitoreId);

  if (error) {
    toast(`Errore eliminazione fornitore: ${error.message}`, 'err');
    return;
  }

  toast('Fornitore eliminato correttamente', 'ok');
  await loadFornitori();
}

function tornaDaSchedaCliente() {
  if (
    paginaPrecedenteCliente &&
    canAccessPage(paginaPrecedenteCliente)
  ) {
    gotoPage(paginaPrecedenteCliente);
    return;
  }

  gotoPage('clienti');
}

async function caricaCodaCommercialeTitolare() {
  if (ROLE !== 'titolare') return;

  let sezione = ge('tit-coda-commerciale');

  if (!sezione) {
    const barraPeriodo = document.querySelector(
      '#dash-titolare .tit-period-bar'
    );

    if (!barraPeriodo) return;

    barraPeriodo.insertAdjacentHTML(
      'afterend',
      `<div id="tit-coda-commerciale"></div>`
    );

    sezione = ge('tit-coda-commerciale');
  }

  sezione.innerHTML = `
    <div class="tit-section" style="margin-top:22px">
      🎯 Lead e sviluppo commerciale
    </div>

    <div class="kpi-grid">
      <div class="kpi-card clickable info" onclick="gotoPage('trattative')">
        <div class="kpi-icon">🎯</div>
        <div class="kpi-num" id="tit-k-lead-nuovi">—</div>
        <div class="kpi-label">Nuovi lead</div>
      </div>

      <div
        class="kpi-card clickable attention"
        onclick="apriLeadSitoDaDashboardTitolare()"
      >
        <div class="kpi-icon">📥</div>
        <div class="kpi-num" id="tit-k-lead-sito">—</div>
        <div class="kpi-label">Lead dal sito</div>
      </div>

      <div
        class="kpi-card clickable warn"
        onclick="apriSopralluoghiDaDashboardTitolare()"
      >
        <div class="kpi-icon">🔎</div>
        <div class="kpi-num" id="tit-k-sopralluoghi">—</div>
        <div class="kpi-label">Sopralluoghi aperti</div>
      </div>

      <div class="kpi-card clickable success" onclick="gotoPage('trattative')">
        <div class="kpi-icon">👥</div>
        <div class="kpi-num" id="tit-k-prospect">—</div>
        <div class="kpi-label">Clienti prospect</div>
      </div>
    </div>
  `;

  const [
    leadNuoviRes,
    leadSitoRes,
    sopralluoghiRes,
    prospectRes
  ] = await Promise.all([
    db
      .from('pipeline_crm')
      .select('id', { count: 'exact', head: true })
      .eq('fase', 'primo_contatto'),

    db
      .from('lead_sito')
      .select('id', { count: 'exact', head: true })
      .in('stato_commerciale', ['da_qualificare', 'contattato']),

    db
      .from('sopralluoghi')
      .select('id', { count: 'exact', head: true })
      .is('odl_creato_id', null),

    db
      .from('clienti')
      .select('id', { count: 'exact', head: true })
      .eq('stato', 'prospect')
      .is('eliminato_il', null)
  ]);

  ge('tit-k-lead-nuovi').textContent =
    leadNuoviRes.error ? '—' : (leadNuoviRes.count || 0);

  ge('tit-k-lead-sito').textContent =
    leadSitoRes.error ? '—' : (leadSitoRes.count || 0);

  ge('tit-k-sopralluoghi').textContent =
    sopralluoghiRes.error ? '—' : (sopralluoghiRes.count || 0);

  ge('tit-k-prospect').textContent =
    prospectRes.error ? '—' : (prospectRes.count || 0);
}

function apriSopralluoghiDaDashboardTitolare() {
  gotoPage('trattative');

  setTimeout(function() {
    const tabSopralluoghi = document.querySelector(
      '#pg-trattative .tabs .tab:nth-child(2)'
    );

    if (tabSopralluoghi) {
      stab(tabSopralluoghi, 'tr-s');
      loadSopralluoghiList();
    }
  }, 150);
}

async function apriLeadAssegnateDaDashboardRapp() {
  const box = ge("rap-lead-assegnate");

  // Sparisce subito dalla dashboard.
  if (box) box.innerHTML = "";

  // Segna come letti gli avvisi del solo rappresentante connesso.
  const { error } = await db
    .from("pipeline_crm")
    .update({
      letto_rappresentante_il: new Date().toISOString(),
    })
    .eq("rappresentante_id", ME.id)
    .eq("fonte_lead", "sito_web")
    .eq("fase", "primo_contatto")
    .is("letto_rappresentante_il", null);

  if (error) {
    console.error(
      "Errore lettura notifiche lead assegnate:",
      error.message
    );
  }

  gotoPage("trattative");
}

