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

${cardEsitoPreventivo(preventivo)}

${['commerciale', 'titolare'].includes(ROLE) && preventivo.stato === 'bozza' && preventivo.progetto_tecnico_id ? `
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

// ── Rimanda indietro un preventivo avviato (ancora in bozza) ─────────
// Commerciale o titolare, dal riepilogo. Il preventivo resta in bozza con
// le sue voci; cambia solo lo stato del progetto tecnico:
//   da_preventivare → inviato_a_commerciale (torna nella lista "Da preventivare")
//   rappresentante  → da_integrare, con nota (come "Richiedi integrazione")
//   ingegnere       → in_verifica_tecnica, con nota
// Quando il progetto torna in "Da preventivare" la lista mostra
// "Riprendi preventivo" (js/17 loadProgettiDaPreventivare).
function apriRimandaPreventivoAvviato() {
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

function etichettaCampoTecnico(campo) {
  const etichette = {
    tipo_intervento: 'Tipo di intervento',
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

// ── Schede di rilievo multiple (richiesta di Erika del 29/10, sql/48) ──
// Con sql/48 un progetto può avere più schede dello stesso tipo (colonna
// progetti_tecnici_schede.numero: "Porte REI – scheda 2", per esempio una
// per piano). In cima a ogni scheda dell'ingegnere c'è la barra
// "Scheda 1 | Scheda 2 | … | + Nuova scheda" e il campo facoltativo
// "Nome / riferimento" (salvato in dati.nome_scheda, non in una colonna).
// Senza sql/48 tutto come prima: una scheda per tipo, nessuna barra.
// Nessun campo obbligatorio (decisione di Erika del 28/10).
let schedeMultipleDisponibili = null; // null = non ancora verificato
// Scheda aperta nella finestra m-rilievo-tecnico (contesto progetto):
// { progettoId, famiglia, numero, elenco (schede salvate; null senza
//   sql/48), bozze ({ numero: { dati, nome, nuova } } non salvate),
//   nomeOriginale, modificata (il tab aperto è stato toccato) }
let schedaRilievoAperta = null;

async function verificaSchedeMultipleDisponibili() {
  if (schedeMultipleDisponibili !== null) return schedeMultipleDisponibili;

  const { error } = await db
    .from('progetti_tecnici_schede')
    .select('numero')
    .limit(1);

  if (!error) {
    schedeMultipleDisponibili = true;
  } else if (error.code === '42703' || /numero/i.test(error.message || '')) {
    schedeMultipleDisponibili = false;
  } else {
    return false;
  }
  return schedeMultipleDisponibili;
}

// true solo dopo la verifica e con sql/48 eseguito.
function schedeMultipleAttive() {
  return schedeMultipleDisponibili === true;
}

// Titolo di una scheda nelle liste e nei PDF: "Porte e portoni REI" se è
// l'unica del suo tipo, "Porte e portoni REI – scheda 2 (Piano terra)"
// se ce ne sono più. quanteStesse (facoltativo) sostituisce il conteggio
// fatto sull'elenco.
function titoloSchedaRilievo(scheda, schede, quanteStesse) {
  const base = etichettaFamigliaTecnica(scheda.famiglia);
  const numero = Number(scheda.numero) || 1;
  const stesse = quanteStesse !== undefined
    ? quanteStesse
    : (schede || []).filter(function(s) { return s.famiglia === scheda.famiglia; }).length;

  let titolo = (stesse > 1 || numero > 1)
    ? base + ' – scheda ' + numero
    : base;

  const nome = String(scheda.nome_scheda || (scheda.dati && scheda.dati.nome_scheda) || '').trim();
  if (nome) titolo += ' (' + nome + ')';

  return titolo;
}

// Il nome della scheda va nel titolo, non tra i campi.
function campoSchedaDaElencare(chiave) {
  return chiave !== 'nome_scheda';
}

// Con sql/48: tipi nell'ordine di oggi (il più recente prima), dentro lo
// stesso tipo per numero. Senza sql/48 l'ordine resta quello ricevuto.
function ordinaSchedeRilievo(schede) {
  const lista = (schede || []).slice();
  if (!lista.some(function(s) { return s.numero !== undefined && s.numero !== null; })) {
    return lista;
  }

  const ordineFamiglie = [];
  lista.forEach(function(s) {
    if (!ordineFamiglie.includes(s.famiglia)) ordineFamiglie.push(s.famiglia);
  });

  return lista.sort(function(a, b) {
    return (ordineFamiglie.indexOf(a.famiglia) - ordineFamiglie.indexOf(b.famiglia)) ||
      ((Number(a.numero) || 1) - (Number(b.numero) || 1));
  });
}

// Legge la scheda da aprire (contesto progetto). numeroRichiesto vuoto =
// la prima scheda salvata del tipo (o la 1, nuova). Restituisce
// { dati } oppure { error }.
// Con sql/48 funziona come le tab di un file Excel (decisione di Erika
// del 29/10): le modifiche di ogni tab restano in memoria (bozze) finché
// non si preme "Salva", che salva tutte le schede modificate del tipo.
// Le bozze restano finché si lavora sullo stesso progetto e tipo; le
// funzioni apriScheda*Ingegnere ripartono da zero.
async function leggiSchedaRilievo(famiglia, numeroRichiesto) {
  const progettoId = currentRilievoProgettoId;
  const box = ge('mrt-content');
  const precedente = schedaRilievoAperta;

  if (box) {
    box.oninput = segnaSchedaRilievoModificata;
    box.onchange = segnaSchedaRilievoModificata;
  }

  if (!(await verificaSchedeMultipleDisponibili())) {
    const { data, error } = await db
      .from('progetti_tecnici_schede')
      .select('dati')
      .eq('progetto_tecnico_id', progettoId)
      .eq('famiglia', famiglia)
      .maybeSingle();

    if (error) return { error: error };

    schedaRilievoAperta = {
      progettoId: progettoId,
      famiglia: famiglia,
      numero: 1,
      elenco: null,
      bozze: {},
      nomeOriginale: String((data && data.dati && data.dati.nome_scheda) || ''),
      modificata: false
    };
    return { dati: (data && data.dati) || {} };
  }

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('id,numero,dati,aggiornato_il')
    .eq('progetto_tecnico_id', progettoId)
    .eq('famiglia', famiglia)
    .order('numero', { ascending: true });

  if (error) return { error: error };

  const elenco = data || [];
  const bozze = (precedente && precedente.elenco &&
    precedente.progettoId === progettoId && precedente.famiglia === famiglia)
    ? precedente.bozze
    : {};

  const numeriBozze = Object.keys(bozze).map(Number).sort(function(a, b) { return a - b; });
  const numero = Number(numeroRichiesto) ||
    (elenco.length ? Number(elenco[0].numero) : (numeriBozze[0] || 1));

  const salvata = elenco.find(function(s) { return Number(s.numero) === numero; }) || null;
  const bozza = bozze[numero] || null;

  schedaRilievoAperta = {
    progettoId: progettoId,
    famiglia: famiglia,
    numero: numero,
    elenco: elenco,
    bozze: bozze,
    nomeOriginale: String((salvata && salvata.dati && salvata.dati.nome_scheda) || ''),
    modificata: false
  };

  return {
    dati: bozza ? Object.assign({}, bozza.dati) : ((salvata && salvata.dati) || {})
  };
}

function segnaSchedaRilievoModificata() {
  const s = schedaRilievoAperta;
  if (!s) return;
  s.modificata = true;

  // Pallino sul tab appena si scrive
  const tab = ge('rsm-tab-' + s.numero);
  if (tab && !tab.querySelector('.rsm-pallino')) {
    tab.insertAdjacentHTML('afterbegin', '<span class="rsm-pallino" title="Modifiche non salvate" style="color:#EF9F27">● </span>');
  }
}

function rigaSalvataSchedaRilievo(numero) {
  const s = schedaRilievoAperta;
  return (s && s.elenco || []).find(function(x) { return Number(x.numero) === Number(numero); }) || null;
}

// Funzione che legge il modulo aperto, per tipo di scheda.
function datiFormSchedaRilievo(famiglia) {
  switch (famiglia) {
    case 'rilevazione_incendi': return datiFormSchedaRilevazioneIncendi();
    case 'porte_rei': return datiFormSchedaPorteRei();
    case 'estintori': return datiFormSchedaEstintori();
    case 'compartimentazione': return datiFormSchedaCompartimentazione();
    case 'vernice_intumescente': return datiFormSchedaVerniceIntumescente();
    case 'impianti_spegnimento': return datiFormSchedaImpiantiSpegnimento();
    case 'coppelle': return datiFormSchedaCoppelle();
  }
  return {};
}

// Mette in memoria quello che è scritto nel tab aperto (se modificato).
function memorizzaTabSchedaRilievo() {
  const s = schedaRilievoAperta;
  if (!s || !s.elenco || !s.modificata) return;

  const salvata = rigaSalvataSchedaRilievo(s.numero);
  s.bozze[s.numero] = {
    dati: datiFormSchedaRilievo(s.famiglia),
    nome: String(v('rsm-nome') || '').trim(),
    nuova: !salvata
  };
  s.modificata = false;
}

// Numeri dei tab con modifiche non salvate (compreso quello aperto).
function schedeRilievoNonSalvate() {
  const s = schedaRilievoAperta;
  if (!s || !s.elenco) return [];

  const numeri = Object.keys(s.bozze).map(Number);
  if (s.modificata && !numeri.includes(s.numero)) numeri.push(s.numero);
  return numeri.sort(function(a, b) { return a - b; });
}

// Prima di chiudere la scheda: con modifiche non salvate chiede conferma
// (solo con sql/48; senza, come prima, si chiude e basta).
function confermaChiusuraSchedeRilievo() {
  const s = schedaRilievoAperta;
  const nonSalvate = schedeRilievoNonSalvate();

  if (!nonSalvate.length) return true;

  const ok = confirm(
    (nonSalvate.length === 1
      ? 'La scheda ' + nonSalvate[0] + ' ha modifiche non salvate'
      : 'Le schede ' + nonSalvate.join(', ') + ' hanno modifiche non salvate') +
    ': chiudendo si perdono.\n\nChiudere senza salvare?'
  );

  if (ok && s) {
    s.bozze = {};
    s.modificata = false;
  }
  return ok;
}

// ✕ e clic fuori dalla finestra: stessa conferma (fase di cattura, prima
// dei gestori di closeM e del ✕).
(function() {
  const finestra = ge('m-rilievo-tecnico');
  if (!finestra || finestra._controlloSchedeRilievo) return;

  finestra._controlloSchedeRilievo = true;
  finestra.addEventListener('click', function(e) {
    const chiude = e.target === finestra ||
      (e.target.closest && e.target.closest('.mh .mx'));
    if (!chiude) return;
    if (!confermaChiusuraSchedeRilievo()) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
})();

function puoEliminareSchedaRilievo() {
  const s = schedaRilievoAperta;
  return !!(s && s.elenco && ['ingegnere', 'titolare'].includes(ROLE));
}

// Barra in cima alla scheda: "Scheda 1 | Scheda 2 | … | + Nuova scheda",
// nome/riferimento ed eliminazione. Vuota senza sql/48.
function htmlBarraSchedeRilievo() {
  const s = schedaRilievoAperta;
  if (!s || !s.elenco) return '';

  const numeri = s.elenco.map(function(x) { return Number(x.numero); });
  Object.keys(s.bozze).map(Number).forEach(function(n) {
    if (!numeri.includes(n)) numeri.push(n);
  });
  if (!numeri.includes(s.numero)) numeri.push(s.numero);
  numeri.sort(function(a, b) { return a - b; });

  function nomeTab(n) {
    const bozza = s.bozze[n];
    if (bozza) return String(bozza.nome || '');
    const riga = rigaSalvataSchedaRilievo(n);
    return String((riga && riga.dati && riga.dati.nome_scheda) || '');
  }

  const attuale = rigaSalvataSchedaRilievo(s.numero);
  const nomeAttuale = nomeTab(s.numero);

  const tab = numeri.map(function(n) {
    const riga = rigaSalvataSchedaRilievo(n);
    const nome = nomeTab(n);
    const attiva = n === s.numero;
    const nonSalvata = !!s.bozze[n];
    const nomeBreve = nome.length > 18 ? nome.slice(0, 17) + '…' : nome;

    return `
      <button
        type="button"
        class="tab${attiva ? ' on' : ''}"
        id="rsm-tab-${n}"
        ${attiva ? 'aria-current="true"' : ''}
        title="${esc((nome || ('Scheda ' + n)) + (nonSalvata ? ' — modifiche non salvate' : ''))}"
        style="line-height:1.25;text-align:left"
        onclick="cambiaSchedaRilievo(${n})"
      >
        ${nonSalvata ? '<span class="rsm-pallino" style="color:#EF9F27">● </span>' : ''}Scheda ${n}${riga ? '' : ' (nuova)'}
        ${nomeBreve ? `<br><span style="font-size:11px;color:var(--m)">${esc(nomeBreve)}</span>` : ''}
      </button>
    `;
  }).join('');

  const pulsanteNuova = numeri.length >= 99
    ? ''
    : `
      <button
        type="button"
        class="tab"
        id="rsm-tab-nuova"
        style="color:var(--g);font-weight:600"
        onclick="nuovaSchedaRilievo()"
      >
        + Nuova scheda
      </button>
    `;

  const salvataggio = attuale && attuale.aggiornato_il
    ? 'Ultimo salvataggio: ' + new Date(attuale.aggiornato_il).toLocaleString('it-IT')
    : 'Scheda nuova: si crea con "Salva", con le stesse voci delle altre.';

  return `
    <div class="tabs" id="rsm-barra" role="tablist" aria-label="Schede di questo tipo" style="margin-bottom:6px">
      ${tab}
      ${pulsanteNuova}
    </div>

    <div style="font-size:12px;color:var(--m);margin-bottom:10px">
      Passa da una scheda all’altra senza perdere quello che hai scritto:
      <b>Salva</b> salva tutte le schede con il pallino <span style="color:#EF9F27">●</span>.
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="f" style="margin-bottom:6px">
        <label for="rsm-nome">
          Nome / riferimento della scheda
          <span style="font-weight:400;color:var(--m)">(facoltativo)</span>
        </label>
        <input
          type="text"
          id="rsm-nome"
          maxlength="80"
          value="${esc(nomeAttuale)}"
          placeholder="Es. Piano terra, porte del magazzino"
        >
      </div>

      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
        <div style="font-size:12px;color:var(--m)">${esc(salvataggio)}</div>
        ${
          puoEliminareSchedaRilievo()
            ? `
              <button type="button" class="btn sm warn" id="rsm-elimina" onclick="eliminaSchedaRilievo()">
                🗑 Elimina scheda ${s.numero}
              </button>
            `
            : ''
        }
      </div>
    </div>
  `;
}

// Apre la scheda del tipo indicato (numero vuoto = la prima).
async function apriFamigliaSchedaRilievo(famiglia, numero) {
  switch (famiglia) {
    case 'rilevazione_incendi':
      contestoSchedaRilevazione = 'progetto';
      return apriSchedaRilevazioneIncendi(numero);
    case 'porte_rei': return apriSchedaPorteRei(numero);
    case 'estintori': return apriSchedaEstintori(numero);
    case 'compartimentazione': return apriSchedaCompartimentazione(numero);
    case 'vernice_intumescente': return apriSchedaVerniceIntumescente(numero);
    case 'impianti_spegnimento': return apriSchedaImpiantiSpegnimento(numero);
    case 'coppelle': return apriSchedaCoppelle(numero);
  }
}

// Cambio di tab: quello che è scritto resta in memoria, nessuna conferma.
async function cambiaSchedaRilievo(numero) {
  const s = schedaRilievoAperta;
  if (!s || Number(numero) === s.numero) return;

  memorizzaTabSchedaRilievo();
  await apriFamigliaSchedaRilievo(s.famiglia, Number(numero));
}

// Nuova scheda dello stesso tipo, vuota, numero = massimo + 1.
async function nuovaSchedaRilievo() {
  const s = schedaRilievoAperta;
  if (!s || !s.elenco) return;

  memorizzaTabSchedaRilievo();

  // La scheda aperta, nuova e mai toccata, resta tra i tab.
  if (!rigaSalvataSchedaRilievo(s.numero) && !s.bozze[s.numero]) {
    s.bozze[s.numero] = { dati: {}, nome: '', nuova: true };
  }

  const massimo = Math.max(
    0,
    s.numero,
    ...s.elenco.map(function(x) { return Number(x.numero) || 0; }),
    ...Object.keys(s.bozze).map(Number)
  );

  if (massimo >= 99) {
    toast('Si possono creare al massimo 99 schede dello stesso tipo', 'err');
    return;
  }

  s.bozze[massimo + 1] = { dati: {}, nome: '', nuova: true };
  await apriFamigliaSchedaRilievo(s.famiglia, massimo + 1);
  const campoNome = ge('rsm-nome');
  if (campoNome) campoNome.focus();
}

// Salva. Senza sql/48: la scheda del tipo, come prima. Con sql/48: TUTTE
// le schede del tipo con modifiche non salvate (quella aperta compresa),
// ognuna per (progetto, tipo, numero); le nuove si inseriscono (se nel
// frattempo qualcuno ha preso lo stesso numero, prendono il successivo).
// riga = la riga della scheda aperta: per le altre si usano gli stessi
// campi (stato, compilato_da...) con i loro dati.
// Restituisce { error, salvate }.
async function salvaRigaSchedaRilievo(riga) {
  const s = schedaRilievoAperta;
  const multiple = schedeMultipleAttive() && s && s.elenco && s.famiglia === riga.famiglia;

  if (!multiple) {
    if (s && s.nomeOriginale && riga.dati && !riga.dati.nome_scheda) {
      riga.dati.nome_scheda = s.nomeOriginale;
    }
    return db
      .from('progetti_tecnici_schede')
      .upsert(riga, { onConflict: 'progetto_tecnico_id,famiglia' });
  }

  // La scheda aperta si salva sempre (come prima), le altre se modificate.
  s.bozze[s.numero] = {
    dati: riga.dati,
    nome: String(v('rsm-nome') || '').trim(),
    nuova: !rigaSalvataSchedaRilievo(s.numero)
  };
  s.modificata = false;

  const numeri = Object.keys(s.bozze).map(Number).sort(function(a, b) { return a - b; });
  let salvate = 0;

  for (const numero of numeri) {
    const bozza = s.bozze[numero];
    const dati = Object.assign({}, bozza.dati);
    if (bozza.nome) {
      dati.nome_scheda = bozza.nome;
    } else {
      delete dati.nome_scheda;
    }

    const rigaScheda = Object.assign({}, riga, { dati: dati, numero: numero });
    let risultato;

    if (!bozza.nuova) {
      risultato = await db
        .from('progetti_tecnici_schede')
        .upsert(rigaScheda, { onConflict: 'progetto_tecnico_id,famiglia,numero' });
    } else {
      for (let tentativo = 0; tentativo < 3; tentativo++) {
        risultato = await db.from('progetti_tecnici_schede').insert(rigaScheda);
        if (!risultato.error || risultato.error.code !== '23505') break;

        // Numero preso nel frattempo da un altro: il primo libero.
        const { data: ultima } = await db
          .from('progetti_tecnici_schede')
          .select('numero')
          .eq('progetto_tecnico_id', riga.progetto_tecnico_id)
          .eq('famiglia', riga.famiglia)
          .order('numero', { ascending: false })
          .limit(1)
          .maybeSingle();

        const libero = Math.max(
          Number(ultima && ultima.numero) || 0,
          ...Object.keys(s.bozze).map(Number)
        ) + 1;
        if (s.numero === rigaScheda.numero) s.numero = libero;
        rigaScheda.numero = libero;
      }
    }

    if (risultato.error) {
      // Le schede già salvate escono dalle bozze, le altre restano.
      if (salvate) await apriFamigliaSchedaRilievo(s.famiglia, s.numero);
      return { error: risultato.error, salvate: salvate };
    }

    delete s.bozze[numero];
    salvate++;
  }

  return { error: null, salvate: salvate };
}

// Dopo il salvataggio: con sql/48 la scheda resta aperta (si vede nella
// barra e si può creare la successiva), senza sql/48 si chiude come prima.
async function dopoSalvataggioSchedaRilievo(messaggio, salvate) {
  const s = schedaRilievoAperta;

  if (schedeMultipleAttive() && s && s.elenco) {
    await apriFamigliaSchedaRilievo(s.famiglia, s.numero);
    toast(
      salvate > 1
        ? messaggio.replace(/^Scheda /, 'Schede ').replace(/ salvata$/, ' salvate') + ': ' + salvate
        : messaggio + ' (scheda ' + s.numero + ')',
      'ok'
    );
    aggiornaRiepilogoSchedeVerifica();
    return;
  }

  toast(messaggio, 'ok');
  closeM('m-rilievo-tecnico');
}

// Elimina la scheda aperta, come un foglio di Excel (decisione di Erika
// del 29/10): qualsiasi scheda, anche la 1, in qualsiasi momento; solo
// ingegnere, titolare e informatico, con conferma. Se era l'unica, quel
// tipo resta senza schede. Una scheda nuova mai salvata si toglie solo
// dalla memoria. Lo impone anche il database (RPC elimina_scheda_rilievo).
async function eliminaSchedaRilievo() {
  const s = schedaRilievoAperta;
  if (!puoEliminareSchedaRilievo()) return;

  const salvata = rigaSalvataSchedaRilievo(s.numero);
  const nomeScritto = String(v('rsm-nome') || '').trim();
  const nome = nomeScritto ? ' (' + nomeScritto + ')' : '';
  const ok = confirm(
    'Eliminare ' + etichettaFamigliaTecnica(s.famiglia) + ' – scheda ' + s.numero + nome + '?\n\n' +
    (salvata
      ? 'I dati di questa scheda si perdono e non si possono recuperare. '
      : 'La scheda non è mai stata salvata: si toglie e basta. ') +
    'Le altre schede restano.'
  );
  if (!ok) return;

  if (salvata) {
    const { error } = await db.rpc('elimina_scheda_rilievo', { p_scheda_id: salvata.id });

    if (error) {
      toast('Errore eliminazione scheda: ' + error.message, 'err');
      return;
    }
  }

  const numeroEliminato = s.numero;
  delete s.bozze[numeroEliminato];
  s.modificata = false;
  s.elenco = s.elenco.filter(function(x) { return Number(x.numero) !== numeroEliminato; });

  // Si apre la prima scheda rimasta (salvata o in memoria); se non ne
  // resta nessuna, la scheda 1 vuota (nuova).
  const rimaste = s.elenco.map(function(x) { return Number(x.numero); })
    .concat(Object.keys(s.bozze).map(Number))
    .sort(function(a, b) { return a - b; });

  await apriFamigliaSchedaRilievo(s.famiglia, rimaste.length ? rimaste[0] : 1);
  toast(
    'Scheda ' + numeroEliminato + ' eliminata' +
    (rimaste.length ? '' : ': questo tipo non ha più schede salvate'),
    'ok'
  );
  aggiornaRiepilogoSchedeVerifica();
}

// Riepilogo delle schede salvate nella finestra "Verifica tecnica"
// (solo con sql/48): quante schede per tipo.
async function aggiornaRiepilogoSchedeVerifica(progettoId) {
  const id = progettoId || v('mvt-id');
  const pulsante = document.querySelector(
    '#m-verifica-tecnica [onclick^="apriSchedaRilevazioneIngegnere"]'
  );
  let box = ge('mvt-schede-riepilogo');

  if (!pulsante || !id || !(await verificaSchedeMultipleDisponibili())) {
    if (box) box.remove();
    return;
  }

  if (!box) {
    box = document.createElement('div');
    box.id = 'mvt-schede-riepilogo';
    box.style.cssText = 'font-size:12px;color:var(--m);margin-top:10px';
    pulsante.parentElement.insertAdjacentElement('afterend', box);
  }

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('famiglia,numero')
    .eq('progetto_tecnico_id', id);

  if (error) {
    box.textContent = '';
    return;
  }

  const conteggio = {};
  (data || []).forEach(function(s) {
    conteggio[s.famiglia] = (conteggio[s.famiglia] || 0) + 1;
  });

  const voci = Object.keys(conteggio).map(function(famiglia) {
    const n = conteggio[famiglia];
    return esc(etichettaFamigliaTecnica(famiglia)) + ': ' + n + (n === 1 ? ' scheda' : ' schede');
  });

  box.innerHTML = voci.length
    ? '<b>Schede salvate</b> — ' + voci.join(' · ') +
      '<br>Per un’altra scheda dello stesso tipo (es. un altro piano) apri la scheda e usa “+ Nuova scheda”.'
    : 'Nessuna scheda salvata. Ogni tipo può avere più schede (es. una per piano): apri la scheda e usa “+ Nuova scheda”.';
}

async function renderSchedePreventivo() {
  ricordaPosizionePagina();
  const box = ge('pvd-schede-content');

  if (!box || !currentPreventivoProgettoId) return;

  box.innerHTML =
    '<div class="load">Caricamento rilievi dell’ingegnere...</div>';

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('*')
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

    ${ordinaSchedeRilievo(data).map(function(scheda, indice, schede) {
      const modificataCommerciale = schedaHaDatiCommerciali(scheda);
      const datiVisualizzati = datiSchedaDaMostrare(scheda);

      const campi = Object.entries(datiVisualizzati)
        .filter(function(entry) {
          const valore = entry[1];
          return campoSchedaDaElencare(entry[0]) &&
            valore !== null &&
            valore !== undefined &&
            valore !== '';
        });

      return `
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px">
            <div>
              <div style="font-size:15px;font-weight:700">
                📝 ${esc(titoloSchedaRilievo(scheda, schede))}
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
                      '${scheda.famiglia}',
                      '${scheda.id}'
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
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero
  contestoSchedaRilevazione = 'progetto';

  openM('m-rilievo-tecnico');
  await apriSchedaRilevazioneIncendi();
}

function chiudiSchedaRilevazione() {
  if (!confermaChiusuraSchedeRilievo()) return;
   renderSchedePreventivo();
  if (contestoSchedaRilevazione === 'progetto') {
    closeM('m-rilievo-tecnico');
    return;
  }

  ripristinaPosizionePagina();
}

async function apriSchedaPorteReiIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaPorteRei();
}

function chiudiSchedaPorteRei() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
   renderSchedePreventivo();
}

async function apriSchedaPorteRei(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('porte_rei', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
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
        ${selectPreventivo('Tipo di intervento', 'pr-tipo-intervento', d.tipo_intervento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'fornitura_e_posa', label: 'Fornitura e posa' },
          { value: 'sostituzione', label: 'Sostituzione porta esistente' },
          { value: 'adeguamento', label: 'Adeguamento' },
          { value: 'manutenzione', label: 'Manutenzione' }
        ])}

        ${selectPreventivo('Resistenza al fuoco richiesta', 'pr-rei', d.rei || '', [
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
        ${selectPreventivo('Tipologia', 'pr-tipologia', d.tipologia || '', [
          { value: '', label: 'Seleziona' },
          { value: 'battente_singolo', label: 'Battente singolo' },
          { value: 'battente_doppio', label: 'Battente doppio' },
          { value: 'scorrevole', label: 'Scorrevole' },
          { value: 'portone', label: 'Portone' },
          { value: 'serranda', label: 'Serranda' },
          { value: 'altro', label: 'Altro' }
        ])}

        ${campoPreventivo('Quantità', 'pr-quantita', d.quantita, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Larghezza (cm)', 'pr-larghezza', d.larghezza, 'number', 'Es. 120')}
        ${campoPreventivo('Altezza (cm)', 'pr-altezza', d.altezza, 'number', 'Es. 210')}
      </div>

      <div class="fr">
        ${campoPreventivo('Colore / finitura', 'pr-colore', d.colore, 'text', 'Es. bianco RAL 9010')}

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
   renderSchedePreventivo();
}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaPorteRei() {
  return {
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
}

async function salvaSchedaPorteRei() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  const dati = datiFormSchedaPorteRei();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const riga = {
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'porte_rei',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  };

  const { error, salvate } = await salvaRigaSchedaRilievo(riga);

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda Porte REI salvata', salvate);
}


async function apriSchedaEstintoriIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaEstintori();
}

function chiudiSchedaEstintori() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
   renderSchedePreventivo();

}

async function apriSchedaEstintori(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('estintori', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
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
      ${selectPreventivo('Tipo di intervento', 'es-tipo-intervento', d.tipo_intervento || '', [
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
        ${campoPreventivo('Numero estintori esistenti', 'es-numero-esistenti', d.numero_esistenti, 'number')}
        ${campoPreventivo('Numero estintori da installare', 'es-numero-installare', d.numero_installare, 'number')}
      </div>

      <div class="fr">
        ${selectPreventivo('Tipologia', 'es-tipologia', d.tipologia || '', [
          { value: '', label: 'Seleziona' },
          { value: 'polvere', label: 'Polvere' },
          { value: 'co2', label: 'CO₂' },
          { value: 'schiuma', label: 'Schiuma' },
          { value: 'idrico', label: 'Idrico' },
          { value: 'altro', label: 'Altro' }
        ])}

        ${selectPreventivo('Peso o capacità', 'es-capacita', d.capacita || '', [
          { value: '', label: 'Seleziona' },
          { value: '2_kg', label: '2 kg' },
          { value: '4_kg', label: '4 kg' },
          { value: '6_kg', label: '6 kg' },
          { value: '9_kg', label: '9 kg' },
          { value: 'altro', label: 'Altro' }
        ])}
      </div>

      ${campoPreventivo(
        'Classe di spegnimento e capacità estinguente richiesta',
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
        'Posizionamento, altezza, accessibilità, distanze di copertura e aree protette',
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
   renderSchedePreventivo();
}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaEstintori() {
  return {
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
}

async function salvaSchedaEstintori() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  const dati = datiFormSchedaEstintori();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const { error, salvate } = await salvaRigaSchedaRilievo({
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'estintori',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda estintori salvata', salvate);
}

async function apriSchedaRilevazioneIncendi(numero) {
  ricordaPosizionePagina();
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

  // Dal progetto: schede multiple con sql/48 (barra in cima). Dal
  // preventivo (preventivi_schede_tecniche): una scheda, come prima.
  let lettura;

  if (usaProgetto) {
    lettura = await leggiSchedaRilievo('rilevazione_incendi', numero);
  } else {
    schedaRilievoAperta = null;
    const { data, error } = await db
      .from(tabella)
      .select('dati')
      .eq(colonnaId, riferimentoId)
      .eq('famiglia', 'rilevazione_incendi')
      .maybeSingle();
    lettura = error ? { error: error } : { dati: data?.dati || {} };
  }

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = (usaProgetto ? htmlBarraSchedeRilievo() : '') + `
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
        ${selectPreventivo('Tipo di intervento', 'ri-tipo-intervento', d.tipo_intervento || '', [
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
   renderSchedePreventivo();
}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaRilevazioneIncendi() {
  return {
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

  const dati = datiFormSchedaRilevazioneIncendi();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

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

const { error, salvate } = usaProgetto
  ? await salvaRigaSchedaRilievo(riga)
  : await db
    .from(tabella)
    .upsert(riga, { onConflict: 'preventivo_id,famiglia' });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

if (usaProgetto) {
  await dopoSalvataggioSchedaRilievo('Scheda rilevazione incendi salvata', salvate);
  return;
}

toast('Scheda rilevazione incendi salvata', 'ok');

await renderSchedePreventivo();
}

async function apriSchedaCompartimentazioneIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaCompartimentazione();
}

function chiudiSchedaCompartimentazione() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
   renderSchedePreventivo();
}

async function apriSchedaCompartimentazione(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('compartimentazione', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
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
      ${selectPreventivo('Intervento', 'cp-tipo-intervento', d.tipo_intervento || '', [
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
        ${selectPreventivo('Classe richiesta', 'cp-classe', d.classe || '', [
          { value: '', label: 'Seleziona' },
          { value: 'ei', label: 'EI' },
          { value: 'rei', label: 'REI' }
        ])}

        ${selectPreventivo('Minuti', 'cp-minuti', d.minuti || '', [
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
        ${campoPreventivo('Numero attraversamenti', 'cp-numero-attraversamenti', d.numero_attraversamenti, 'number')}

        ${selectPreventivo('Tipo attraversamento', 'cp-tipo-attraversamento', d.tipo_attraversamento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'cavi', label: 'Cavi' },
          { value: 'tubazioni_metalliche', label: 'Tubazioni metalliche' },
          { value: 'tubazioni_plastiche', label: 'Tubazioni plastiche' },
          { value: 'canaline', label: 'Canaline' },
          { value: 'misti', label: 'Misti' }
        ])}
      </div>

      <div class="fr">
        ${campoPreventivo('Dimensioni foro (mm)', 'cp-dimensioni-foro', d.dimensioni_foro, 'text', 'Es. 300 × 200')}
        ${campoPreventivo('Spessore parete o solaio (mm)', 'cp-spessore-supporto', d.spessore_supporto, 'number')}
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
          'Posizione attraversamenti',
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
        'Foto ravvicinate e foto di contesto',
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
   renderSchedePreventivo();
}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaCompartimentazione() {
  return {
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
}

async function salvaSchedaCompartimentazione() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  const dati = datiFormSchedaCompartimentazione();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const { error, salvate } = await salvaRigaSchedaRilievo({
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'compartimentazione',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda compartimentazione salvata', salvate);
}

async function apriSchedaVerniceIntumescenteIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaVerniceIntumescente();
}

function chiudiSchedaVerniceIntumescente() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
   renderSchedePreventivo();
}

async function apriSchedaVerniceIntumescente(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('vernice_intumescente', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
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
        ${selectPreventivo('Elemento da proteggere', 'vi-elemento', d.elemento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'pilastro', label: 'Pilastro' },
          { value: 'trave', label: 'Trave' },
          { value: 'solaio', label: 'Solaio' },
          { value: 'struttura_metallica', label: 'Struttura metallica' }
        ])}

        ${selectPreventivo('Classe R richiesta', 'vi-classe-r', d.classe_r || '', [
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
          'Tipo e dimensione profilo metallico',
          'vi-profilo',
          d.profilo,
          'text',
          'Es. HEA 200, IPE 160, tubolare 100×100'
        )}

        ${campoPreventivo('Numero elementi', 'vi-numero-elementi', d.numero_elementi, 'number')}
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
        'Foto, misure e dettagli dei profili',
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
   renderSchedePreventivo();

}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaVerniceIntumescente() {
  return {
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
}

async function salvaSchedaVerniceIntumescente() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  const dati = datiFormSchedaVerniceIntumescente();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const { error, salvate } = await salvaRigaSchedaRilievo({
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'vernice_intumescente',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda vernice intumescente salvata', salvate);
}


// ── Scheda "Coppelle" (protezione antincendio delle tubazioni) ───────
// Richiesta di Erika del 28/10: stessa struttura delle altre schede
// dell'ingegnere (tabella progetti_tecnici_schede, famiglia 'coppelle').
// Nessun campo obbligatorio.
async function apriSchedaCoppelleIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaCoppelle();
}

function chiudiSchedaCoppelle() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
  renderSchedePreventivo();
}

async function apriSchedaCoppelle(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('coppelle', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🔥 Coppelle
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Rilievo per la protezione antincendio delle tubazioni con coppelle.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaCoppelle()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Tubazioni da proteggere</div>

    <div class="card">
      ${selectPreventivo('Tipo di intervento', 'co-tipo-intervento', d.tipo_intervento || '', [
        { value: '', label: 'Seleziona' },
        { value: 'nuova_posa', label: 'Nuova posa' },
        { value: 'sostituzione', label: 'Sostituzione coppelle esistenti' },
        { value: 'integrazione', label: 'Integrazione / ripristino' }
      ])}

      <div class="fr">
        ${selectPreventivo('Materiale della tubazione', 'co-materiale-tubazione', d.materiale_tubazione || '', [
          { value: '', label: 'Seleziona' },
          { value: 'acciaio', label: 'Acciaio' },
          { value: 'rame', label: 'Rame' },
          { value: 'ghisa', label: 'Ghisa' },
          { value: 'plastica', label: 'Plastica (PVC, PE, PP)' },
          { value: 'multistrato', label: 'Multistrato' },
          { value: 'altro', label: 'Altro / da definire' }
        ])}

        ${selectPreventivo('Uso / fluido', 'co-uso-tubazione', d.uso_tubazione || '', [
          { value: '', label: 'Seleziona' },
          { value: 'acqua', label: 'Acqua (sanitaria / riscaldamento)' },
          { value: 'antincendio', label: 'Rete antincendio' },
          { value: 'gas', label: 'Gas' },
          { value: 'scarichi', label: 'Scarichi' },
          { value: 'vapore', label: 'Vapore / alta temperatura' },
          { value: 'altro', label: 'Altro' }
        ])}
      </div>

      <div class="fr">
        ${campoPreventivo('Diametro esterno tubazione (mm)', 'co-diametro', d.diametro, 'text', 'Es. 48, 60, 114 (anche più diametri)')}
        ${campoPreventivo('Lunghezza da rivestire (m)', 'co-lunghezza', d.lunghezza, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Numero di tratti / tubazioni', 'co-numero-tratti', d.numero_tratti, 'number')}
        ${campoPreventivo('Spessore coppella (mm)', 'co-spessore', d.spessore, 'text', 'Se richiesto o da certificato')}
      </div>
    </div>

    <div class="rap-section">2. Resistenza e reazione al fuoco</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Classe di resistenza al fuoco', 'co-classe-resistenza', d.classe_resistenza || '', [
          { value: '', label: 'Seleziona' },
          { value: 'EI 30', label: 'EI 30' },
          { value: 'EI 60', label: 'EI 60' },
          { value: 'EI 90', label: 'EI 90' },
          { value: 'EI 120', label: 'EI 120' },
          { value: 'EI 180', label: 'EI 180' },
          { value: 'altro', label: 'Altro / da definire' }
        ])}

        ${selectPreventivo('Reazione al fuoco richiesta', 'co-reazione-fuoco', d.reazione_fuoco || '', [
          { value: '', label: 'Seleziona' },
          { value: 'A1', label: 'A1' },
          { value: 'A2-s1,d0', label: 'A2-s1,d0' },
          { value: 'BL-s1,d0', label: 'BL-s1,d0' },
          { value: 'non_richiesta', label: 'Non richiesta' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      <div class="fr">
        ${selectPreventivo('Parete o solaio attraversato', 'co-supporto-attraversato', d.supporto_attraversato || '', [
          { value: '', label: 'Seleziona' },
          { value: 'nessuno', label: 'Nessun attraversamento' },
          { value: 'muratura', label: 'Parete in muratura / calcestruzzo' },
          { value: 'cartongesso', label: 'Parete in cartongesso' },
          { value: 'solaio', label: 'Solaio' },
          { value: 'misto', label: 'Più tipi' }
        ])}

        ${campoPreventivo('Numero di attraversamenti', 'co-numero-attraversamenti', d.numero_attraversamenti_coppelle, 'number')}
      </div>

      ${selectPreventivo('Finitura esterna', 'co-finitura', d.finitura || '', [
        { value: '', label: 'Seleziona' },
        { value: 'nessuna', label: 'Nessuna' },
        { value: 'alluminio', label: 'Alluminio' },
        { value: 'pvc', label: 'PVC' },
        { value: 'lamierino', label: 'Lamierino' },
        { value: 'altro', label: 'Altro' }
      ])}
    </div>

    <div class="rap-section">3. Ambiente, ostacoli e mezzi</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Ambiente', 'co-ambiente', d.ambiente || '', [
          { value: '', label: 'Seleziona' },
          { value: 'interno', label: 'Interno' },
          { value: 'esterno', label: 'Esterno' },
          { value: 'cavedio', label: 'Cavedio / vano tecnico' },
          { value: 'controsoffitto', label: 'Sopra controsoffitto' },
          { value: 'umidita', label: 'Umidità elevata' }
        ])}

        ${selectPreventivo('Altezza / mezzo di sollevamento', 'co-altezza-lavoro', d.altezza_lavoro || '', [
          { value: '', label: 'Seleziona' },
          { value: 'normale', label: 'Normale' },
          { value: 'trabattello', label: 'Trabattello' },
          { value: 'PLE', label: 'PLE' },
          { value: 'ponteggio', label: 'Ponteggio' }
        ])}
      </div>

      ${areaPreventivo(
        'Ostacoli e interferenze',
        'co-ostacoli',
        d.ostacoli,
        'Es. canaline, cavi, altri impianti, staffaggi, controsoffitti da aprire'
      )}

      ${areaPreventivo(
        'Accessibilità e vincoli di cantiere',
        'co-accessibilita',
        d.accessibilita
      )}
    </div>

    <div class="rap-section">4. Foto, certificazione e note</div>

    <div class="card">
      ${areaPreventivo(
        'Foto e misure delle tubazioni',
        'co-foto',
        d.foto,
        'Indica le foto caricate negli allegati tecnici.'
      )}

      ${areaPreventivo(
        'Certificazione e dichiarazione di corretta posa',
        'co-certificazione',
        d.certificazione
      )}

      ${areaPreventivo(
        'Note tecniche per il preventivo',
        'co-note-tecniche',
        d.note_tecniche
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaCoppelle()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaCoppelle()">
        Salva scheda coppelle
      </button>
    </div>
  `;
  renderSchedePreventivo();
}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaCoppelle() {
  return {
    tipo_intervento: v('co-tipo-intervento'),
    materiale_tubazione: v('co-materiale-tubazione'),
    uso_tubazione: v('co-uso-tubazione'),
    diametro: v('co-diametro'),
    lunghezza: v('co-lunghezza'),
    numero_tratti: v('co-numero-tratti'),
    spessore: v('co-spessore'),
    classe_resistenza: v('co-classe-resistenza'),
    reazione_fuoco: v('co-reazione-fuoco'),
    supporto_attraversato: v('co-supporto-attraversato'),
    numero_attraversamenti_coppelle: v('co-numero-attraversamenti'),
    finitura: v('co-finitura'),
    ambiente: v('co-ambiente'),
    altezza_lavoro: v('co-altezza-lavoro'),
    ostacoli: v('co-ostacoli'),
    accessibilita: v('co-accessibilita'),
    foto: v('co-foto'),
    certificazione: v('co-certificazione'),
    note_tecniche: v('co-note-tecniche')
  };
}

async function salvaSchedaCoppelle() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  const dati = datiFormSchedaCoppelle();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const { error, salvate } = await salvaRigaSchedaRilievo({
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'coppelle',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda coppelle salvata', salvate);
}

async function apriSchedaImpiantiSpegnimentoIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaImpiantiSpegnimento();
}

function chiudiSchedaImpiantiSpegnimento() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
   renderSchedePreventivo();

}

async function apriSchedaImpiantiSpegnimento(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('impianti_spegnimento', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
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
        ${selectPreventivo('Tipo impianto', 'is-tipo-impianto', d.tipo_impianto || '', [
          { value: '', label: 'Seleziona' },
          { value: 'idranti', label: 'Idranti' },
          { value: 'naspi', label: 'Naspi' },
          { value: 'sprinkler', label: 'Sprinkler' },
          { value: 'water_mist', label: 'Water mist' },
          { value: 'gas', label: 'Gas' },
          { value: 'schiuma', label: 'Schiuma' },
          { value: 'altro', label: 'Altro' }
        ])}

        ${selectPreventivo('Tipo intervento', 'is-tipo-intervento', d.tipo_intervento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'nuovo', label: 'Nuovo impianto' },
          { value: 'ampliamento', label: 'Ampliamento' },
          { value: 'adeguamento', label: 'Adeguamento' },
          { value: 'manutenzione', label: 'Manutenzione' }
        ])}
      </div>

      ${campoPreventivo(
        'Area o compartimento da proteggere',
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
        'Impianto esistente: marca, modello, anno, stato e documentazione',
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
          'Pressione disponibile',
          'is-pressione',
          d.pressione,
          'text',
          'Es. 4 bar'
        )}
      </div>

      <div class="fr">
        ${campoPreventivo(
          'Portata disponibile',
          'is-portata',
          d.portata,
          'text',
          'Es. 300 l/min'
        )}

        ${campoPreventivo(
          'Riserva idrica disponibile',
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
        'Foto locale pompe, rete, terminali e criticità',
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
   renderSchedePreventivo();

}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaImpiantiSpegnimento() {
  return {
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
}

async function salvaSchedaImpiantiSpegnimento() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  const dati = datiFormSchedaImpiantiSpegnimento();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const { error, salvate } = await salvaRigaSchedaRilievo({
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'impianti_spegnimento',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda impianti di spegnimento salvata', salvate);
}


async function renderFornitoriPreventivo() {
  ricordaPosizionePagina();
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
   renderSchedePreventivo();

}

async function apriSelettoreFornitoriPreventivo() {
  ricordaPosizionePagina();
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
   renderSchedePreventivo();

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
  ricordaPosizionePagina();
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
  // F4.3: dopo l'esito del cliente le voci non si cambiano (solo il titolare).
  if (vociPreventivoBloccate) {
    toast('Il cliente ha già dato l\'esito: le voci del preventivo non si cambiano più', 'err');
    return;
  }

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

  // Modifiche alle voci non ancora salvate: si salvano prima, altrimenti
  // il ricaricamento qui sotto le perderebbe.
  if (modificheVociNonSalvatePreventivo()) {
    const salvato = await salvaVociPreventivo();
    if (!salvato) {
      toast('Salva prima le voci del preventivo (tab Costi), poi usa la quotazione', 'err');
      return;
    }
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

  // Voce già creata da questa quotazione: si aggiorna (niente doppioni).
  // Niente .maybeSingle(): con due righe già presenti dava errore, la voce
  // risultava "non trovata" e se ne inseriva un'altra.
  const { data: vociQuotazione, error: erroreVoceEsistente } = await db
    .from('preventivi_voci')
    .select('id')
    .eq('preventivo_id', currentPreventivoId)
    .eq('preventivo_fornitore_id', selezioneId)
    .order('creato_il')
    .limit(1);

  if (erroreVoceEsistente) {
    toast('Errore controllo voce del fornitore: ' + erroreVoceEsistente.message, 'err');
    return;
  }

  const voceEsistente = (vociQuotazione || [])[0] || null;

  const datiVoce = {
    categoria: 'materiale',
    descrizione: descrizione,
    unita_misura: 'corpo',
    quantita: 1,
    costo_unitario: costo,
    prezzo_unitario: prezzoCliente,
    preventivo_fornitore_id: selezioneId,
    aggiornato_il: new Date().toISOString()
  };

  let risultato;

  if (voceEsistente) {
    risultato = await db
      .from('preventivi_voci')
      .update(datiVoce)
      .eq('id', voceEsistente.id);
  } else {
    // La voce nuova va in fondo, come ultima creata (prima ordinamento 0:
    // finiva in cima o in mezzo alle altre).
    const { data: ultima, error: erroreUltima } = await db
      .from('preventivi_voci')
      .select('ordinamento')
      .eq('preventivo_id', currentPreventivoId)
      .order('ordinamento', { ascending: false })
      .limit(1);

    if (erroreUltima) {
      toast('Errore lettura voci del preventivo: ' + erroreUltima.message, 'err');
      return;
    }

    const ordinamento = ultima && ultima.length
      ? numeroPreventivo(ultima[0].ordinamento) + 1
      : 0;

    risultato = await db
      .from('preventivi_voci')
      .insert({
        ...datiVoce,
        preventivo_id: currentPreventivoId,
        ordinamento: ordinamento
      });
  }

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
// F4.2: dati dell'anticipo nell'editor (solo con sql/24 eseguito).
let anticipoPreventivoEditor = {
  disponibile: false,
  bloccato: false,
  richiesto: null,
  tipo: 'percentuale',
  valore: ''
};
// F4.3: dopo l'esito del cliente (in attesa anticipo, accettato,
// rifiutato) voci e totale non si cambiano, tranne che per il titolare.
let esitoRegistratoEditorPreventivo = false;
let vociPreventivoBloccate = false;
let storicoUndoPreventivo = [];
let vociEliminatePreventivo = [];
let chiaveModificaPreventivo = '';
let timerModificaPreventivo = null;

// true se nell'editor delle voci ci sono modifiche non ancora salvate
// (ogni modifica lascia un punto di "Annulla"; il ricaricamento li azzera).
function modificheVociNonSalvatePreventivo() {
  return storicoUndoPreventivo.length > 0 || vociEliminatePreventivo.length > 0;
}

function registraStatoUndoPreventivo(chiave) {
  clearTimeout(timerModificaPreventivo);

  timerModificaPreventivo = setTimeout(function() {
    chiaveModificaPreventivo = '';
  }, 800);

  // Durante la stessa digitazione salva un solo punto di annullamento.
  if (chiave && chiave === chiaveModificaPreventivo) return;

  storicoUndoPreventivo.push({
    voci: JSON.parse(JSON.stringify(vociPreventivoDati)),
    eliminate: [...vociEliminatePreventivo]
  });

  if (storicoUndoPreventivo.length > 50) {
    storicoUndoPreventivo.shift();
  }

  chiaveModificaPreventivo = chiave || '';
}

function annullaUltimaModificaPreventivo() {
  const statoPrecedente = storicoUndoPreventivo.pop();

  if (!statoPrecedente) {
    toast('Non ci sono modifiche da annullare', 'err');
    return;
  }

  vociPreventivoDati = statoPrecedente.voci;
  vociEliminatePreventivo = statoPrecedente.eliminate;
  chiaveModificaPreventivo = '';

  disegnaVociPreventivo();
  toast('Ultima modifica annullata', 'ok');
}

document.addEventListener('keydown', function(evento) {
  const undo = (evento.metaKey || evento.ctrlKey) &&
    !evento.shiftKey &&
    evento.key.toLowerCase() === 'z';

  if (!undo) return;

  const box = ge('pvd-costi-content');

  // Funziona solo nella pagina Preventivo Cliente.
  if (!box || !box.contains(evento.target)) return;

  // Nei campi note resta attivo l'annulla nativo del browser.
  if (
    evento.target.id === 'pvv-note-cliente' ||
    evento.target.id === 'pvv-condizioni-pagamento'
  ) return;

  evento.preventDefault();
  annullaUltimaModificaPreventivo();
});

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
  if (costo <= 10000) return 45;
  if (costo <= 20000) return 35;
  if (costo <= 50000) return 30;
  if (costo <= 100000) return 25;

  return 25;
}

function costoTotaleFornituraPreventivo() {
  return vociPreventivoDati.reduce(function(totale, voce) {
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
registraStatoUndoPreventivo('ricarico-' + Date.now());
  vociPreventivoDati.forEach(function(voce) {
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
  registraStatoUndoPreventivo('campo-' + indice + '-' + campo);

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

      <button class="btn sm" onclick="annullaUltimaModificaPreventivo()">
  ↶ Annulla ultima modifica
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

${htmlAnticipoEditorPreventivo(vendita)}

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

  // F4.3: dopo l'esito del cliente l'editor è in sola lettura (non per il titolare).
  if (vociPreventivoBloccate) {
    bloccaEditorVociPreventivo(box);
  } else if (esitoRegistratoEditorPreventivo) {
    box.insertAdjacentHTML('afterbegin', `
      <div class="al2 w" style="margin-bottom:14px">
        Il cliente ha già dato l'esito di questo preventivo. Come titolare puoi
        ancora cambiare voci e totale: con un anticipo in percentuale cambia anche
        l'importo da fatturare.
      </div>
    `);
  }
}

// F4.3 ---------------------------------------------------------------
function impostaBloccoVociPreventivo(stato) {
  esitoRegistratoEditorPreventivo = STATI_ESITO_PREVENTIVO.includes(stato);
  vociPreventivoBloccate = esitoRegistratoEditorPreventivo && ROLE !== 'titolare';
}

// Sola lettura: campi disattivati, resta solo "Genera PDF cliente".
function bloccaEditorVociPreventivo(box) {
  box.querySelectorAll('input, select, textarea').forEach(function(campo) {
    campo.disabled = true;
  });

  box.querySelectorAll('button').forEach(function(bottone) {
    const azione = bottone.getAttribute('onclick') || '';
    if (/generaPreventivoClientePDF/.test(azione)) return;
    bottone.style.display = 'none';
  });

  box.insertAdjacentHTML('afterbegin', `
    <div class="al2 w" style="margin-bottom:14px">
      🔒 Il cliente ha già dato l'esito di questo preventivo: voci, totale e
      condizioni non si cambiano più. Per una correzione rivolgiti al titolare.
    </div>
  `);
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
  ricordaPosizionePagina();
  const puoGestire =
    ROLE === 'titolare' ||
    (ROLE === 'commerciale' && origine === 'commerciale');

  const titolo = origine === 'commerciale'
    ? '📄 Certificato del commerciale'
    : '📄 Certificato del titolare';

  const statoInvio = certificato.inviato_il
    ? `<span class="badge green">✓ Inviato all’ingegnere il ${formatoDataOraCertificato(certificato.inviato_il)}</span>`
    : `<span class="badge yellow">Da inviare all’ingegnere</span>`;

  // F2.3 — il commerciale (e il titolare) vede se l'ingegnere l'ha aperto
  const statoLettura = !certificato.inviato_il
    ? ''
    : certificato.letto_ingegnere_il
      ? ` <span class="badge green">👁 Letto dall’ingegnere il ${formatoDataOraCertificato(certificato.letto_ingegnere_il)}</span>`
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
          👁 Apri / scarica
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
        Puoi vedere e correggere i certificati del commerciale.
        I certificati del titolare restano riservati al titolare e all’ingegnere.
      </div>

      <h3 style="margin:16px 0 10px">
        Certificati del commerciale
      </h3>

      ${
        certificatiCommerciale.length
          ? certificatiCommerciale.map(function(certificato) {
              return cardCertificatoPreventivo(certificato, 'commerciale');
            }).join('')
          : '<div class="empty">Il commerciale non ha ancora caricato certificati.</div>'
      }

      <h3 style="margin:20px 0 10px">
        Certificati riservati del titolare
      </h3>

      ${caricatoreCertificatiPreventivo('titolare')}

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
      messaggio: 'Il certificato commerciale può essere creato solo dal commerciale'
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
  const input = ge(`certificato-file-${certificatoId}`);
  const file = input?.files?.[0];

  if (!file) {
    toast('Seleziona prima il PDF sostitutivo', 'err');
    return;
  }

  const risultato = await salvaCertificatoPreventivo(
    origine,
    file,
    certificatoId
  );

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

async function caricaNuoviCertificatiPreventivo(origine) {
  const input = ge(`certificati-file-nuovi-${origine}`);
  const fileDaCaricare = Array.from(input?.files || []);

  if (!fileDaCaricare.length) {
    toast('Seleziona almeno un PDF', 'err');
    return;
  }

  let caricati = 0;
  const errori = [];

  for (const file of fileDaCaricare) {
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

  const { data, error: erroreUrl } = await db.storage
    .from('certificati-preventivi')
    .createSignedUrl(certificato.storage_path, 300);

  if (erroreUrl || !data?.signedUrl) {
    toast(`Impossibile aprire il PDF: ${erroreUrl?.message || ''}`, 'err');
    return;
  }

  window.open(data.signedUrl, '_blank', 'noopener');

  // F2.3 — quando l'ingegnere apre il certificato si segna "letto
  // dall'ingegnere" (solo la prima volta). L'ingegnere non può modificare
  // preventivi_certificati: lo fa la RPC marca_certificato_letto_ingegnere
  // (sql/18). Se la RPC non c'è ancora, il PDF si apre lo stesso.
  if (ROLE === 'ingegnere' && !certificato.letto_ingegnere_il) {
    const { error: erroreLettura } = await db.rpc(
      'marca_certificato_letto_ingegnere',
      { p_certificato_id: certificatoId }
    );

    if (erroreLettura) {
      console.warn('Lettura certificato non registrata (serve sql/18):', erroreLettura.message);
    } else if (ge('certificati-ingegnere-lista')) {
      await loadCertificatiIngegnere();
    }
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
          <p><b>Origine:</b> ${certificato.origine === 'commerciale' ? 'Commerciale' : 'Titolare'}</p>
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

    const { data: preventivo } = await db
    .from('preventivi')
    .select(anticipoDisponibile
      ? 'note,condizioni_pagamento,stato,anticipo_richiesto,anticipo_tipo,anticipo_valore'
      : 'note,condizioni_pagamento,stato')
    .eq('id', currentPreventivoId)
    .single();

  // F4.3: stato aggiornato (l'esito può essere arrivato nel frattempo).
  if (preventivo) impostaBloccoVociPreventivo(preventivo.stato);

  notePreventivoCliente = preventivo?.note || '';

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
    unita_misura: 'pz',
    quantita: 1,
    costo_unitario: 0,
    prezzo_unitario: 0
  });

  disegnaVociPreventivo();
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

  // Le voci di questo salvataggio, nell'ordine a schermo (= ordine di
  // creazione: le voci nuove vanno sempre in fondo). Si fissa qui perché
  // durante il salvataggio la lista a schermo può ancora cambiare.
  const vociDaSalvare = vociPreventivoDati.slice();

  const totaleImponibile = vociDaSalvare.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'vendita');
  }, 0);

  const datiPreventivo = {
    totale_imponibile: totaleImponibile,
    note: notePreventivoCliente.trim() || null,
    condizioni_pagamento: condizioniPagamentoPreventivo.trim() || null,
    aggiornato_il: new Date().toISOString()
  };

  // F4.2: anticipo (solo con sql/24 e finché il cliente non ha risposto).
  // Si controlla PRIMA di scrivere le voci: prima le voci nuove venivano
  // inserite e poi il salvataggio si fermava sull'anticipo; con "Annulla"
  // tornavano senza id e il salvataggio dopo le inseriva una seconda volta.
  if (anticipoPreventivoEditor.disponibile && !anticipoPreventivoEditor.bloccato) {
    const anticipo = datiAnticipoValidi(
      anticipoPreventivoEditor.richiesto,
      anticipoPreventivoEditor.tipo,
      anticipoPreventivoEditor.valore,
      totaleImponibile,
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
      return false;
    }
  }

  const righe = [];
  vociDaSalvare.forEach(function(voce, indice) {
    if (voce.id) return;
    righe.push({
      preventivo_id: currentPreventivoId,
      categoria: voce.categoria,
      descrizione: String(voce.descrizione).trim(),
      unita_misura: voce.unita_misura || 'pz',
      quantita: numeroPreventivo(voce.quantita),
      costo_unitario: numeroPreventivo(voce.costo_unitario),
      prezzo_unitario: numeroPreventivo(voce.prezzo_unitario),
      ordinamento: indice
    });
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

async function generaPreventivoClientePDF() {
  const salvato = await salvaVociPreventivo();

  if (!salvato) return;

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
margin: {
  top: 18,
  right: margine,
  bottom: 82,
  left: margine
},

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

  if (y > 210) {
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
    totale_imponibile: totaleImponibile,
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
  toast('Solo commerciale o titolare possono inviare il preventivo', 'err');
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
    const { data: urlData, error: erroreUrl } = await db.storage
      .from('progetti-tecnici')
      .createSignedUrl(file.storage_path, 600);

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

  // Più schede dello stesso tipo (sql/48): "Porte e portoni REI – scheda 2"
  ordinaSchedeRilievo(schede).forEach(function(scheda, indice, elenco) {
      titolo(titoloSchedaRilievo(scheda, elenco));

     const campi = Object.entries(
  datiSchedaDaMostrare(scheda)
).filter(function(entry) {
        const valore = entry[1];

        // Le note interne per il calcolo non vanno al fornitore (decisione 28/10)
        if (entry[0] === 'note_calcolo') return false;
        if (!campoSchedaDaElencare(entry[0])) return false;

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
  ricordaPosizionePagina();
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
  ricordaPosizionePagina();
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
  ricordaPosizionePagina();
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
  ricordaPosizionePagina();
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
  const destinazione =
    paginaPrecedenteCliente &&
    canAccessPage(paginaPrecedenteCliente)
      ? paginaPrecedenteCliente
      : 'clienti';

  gotoPage(destinazione);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({
        top: scrollPrimaSchedaCliente,
        left: 0,
        behavior: 'auto'
      });
    });
  });
}

async function caricaCodaCommercialeTitolare() {
  ricordaPosizionePagina();
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
  ricordaPosizionePagina();
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
  ricordaPosizionePagina();
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


// =====================================================================
// F4.1 — ESITO DEL PREVENTIVO: accettato / rifiutato dal cliente
// Passo 5 del flusso della commessa: il rappresentante (o il titolare,
// mai obbligatorio) registra l'esito. Per accettare serve l'allegato
// (preventivo firmato o mail di approvazione), per rifiutare il motivo.
// Il database lo impone (sql/22: trigger trg_preventivi_esito e funzioni
// accetta_preventivo / rifiuta_preventivo). Senza sql/22 i bottoni non
// compaiono e il sito funziona come prima.
// =====================================================================

const STATI_ATTESA_ESITO_PREVENTIVO = ['inviato_a_rappresentante', 'inviato'];
// Stati con l'esito del cliente già registrato (F4.2: in_attesa_anticipo).
const STATI_ESITO_PREVENTIVO = ['in_attesa_anticipo', 'accettato', 'rifiutato'];
const ESITO_PREVENTIVO_MAX_MB = 15;
let esitoPreventivoDisponibile = null;

// true se sql/22 è stato eseguito (esiste la colonna dell'allegato).
async function verificaEsitoPreventivoDisponibile() {
  if (esitoPreventivoDisponibile !== null) return esitoPreventivoDisponibile;

  const { error } = await db
    .from('preventivi')
    .select('allegato_accettazione_path')
    .limit(1);

  if (!error) {
    esitoPreventivoDisponibile = true;
  } else if (/allegato_accettazione_path|column|colonna/i.test(error.message || '')) {
    esitoPreventivoDisponibile = false;
  } else {
    // Errore di rete o altro: non decidere ora, riprova la prossima volta.
    return false;
  }

  return esitoPreventivoDisponibile;
}

function puoRegistrareEsitoPreventivo() {
  return ROLE === 'rappresentante' || ROLE === 'titolare';
}

function bottoniEsitoPreventivo(preventivo) {
  if (!puoRegistrareEsitoPreventivo()) return '';
  if (!STATI_ATTESA_ESITO_PREVENTIVO.includes(preventivo.stato)) return '';

  const numero = esc(String(preventivo.numero || ''));

  return `
    <button
      class="btn sm p"
      onclick="apriEsitoPreventivo('${preventivo.id}', 'accettato', '${numero}')"
    >
      ✅ Accettato dal cliente
    </button>
    <button
      class="btn sm"
      style="color:var(--r)"
      onclick="apriEsitoPreventivo('${preventivo.id}', 'rifiutato', '${numero}')"
    >
      ❌ Rifiutato dal cliente
    </button>
  `;
}

function nomeChiHaRegistratoEsito(utenteId) {
  if (!utenteId) return '';
  if (ME && utenteId === ME.id) return 'te';
  const u = (UTENTI || []).find(function(x) { return x.id === utenteId; });
  return u ? ((u.nome || '') + ' ' + (u.cognome || '')).trim() : '';
}

function dataOraEsitoPreventivo(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Riepilogo dell'esito già registrato (accettato o rifiutato).
function riepilogoEsitoPreventivo(preventivo) {
  if (!STATI_ESITO_PREVENTIVO.includes(preventivo.stato)) return '';

  const attesaAnticipo = preventivo.stato === 'in_attesa_anticipo';
  const accettato = preventivo.stato === 'accettato' || attesaAnticipo;
  const quando = dataOraEsitoPreventivo(preventivo.esito_registrato_il);
  const chi = nomeChiHaRegistratoEsito(preventivo.esito_registrato_da);
  const dettaglio = [
    quando ? 'il ' + quando : '',
    chi ? 'da ' + chi : ''
  ].filter(Boolean).join(' ');

  return `
    <div class="al2 ${attesaAnticipo ? 'w' : (accettato ? 'ok' : 'e')}" style="margin-top:10px">
      <b>${attesaAnticipo
        ? '⏳ Accettato dal cliente · in attesa dell\'anticipo'
        : (accettato ? '✅ Accettato dal cliente' : '❌ Rifiutato dal cliente')}</b>
      ${dettaglio ? `<span style="font-size:12px"> · registrato ${esc(dettaglio)}</span>` : ''}
      ${accettato ? rigaAnticipoPreventivo(preventivo) : ''}
      ${htmlCommessaPreventivo(preventivo)}
      ${!accettato && preventivo.motivo_rifiuto ? `
        <div style="margin-top:6px;white-space:pre-wrap">Motivo: ${esc(preventivo.motivo_rifiuto)}</div>
      ` : ''}
      ${!accettato ? htmlFatturaAnticipoPreventivo(preventivo) : ''}
      ${accettato && preventivo.allegato_accettazione_path ? `
        <div style="margin-top:8px">
          <button
            class="btn sm"
            onclick="apriAllegatoPreventivoFornitore('${esc(preventivo.allegato_accettazione_path)}')"
          >
            📎 ${esc(preventivo.allegato_accettazione_nome || 'Allegato di accettazione')}
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// Card per la scheda del preventivo (titolare e commerciale).
function cardEsitoPreventivo(preventivo) {
  // Colonne di sql/22 assenti: niente card.
  if (!preventivo || !('allegato_accettazione_path' in preventivo)) return '';

  const inAttesa = STATI_ATTESA_ESITO_PREVENTIVO.includes(preventivo.stato);
  const esito = riepilogoEsitoPreventivo(preventivo);

  if (!inAttesa && !esito) return '';

  return `
    <div class="card" style="margin-top:16px;border-left:4px solid var(--b)">
      <div style="font-size:14px;font-weight:700">
        🤝 Esito del cliente
      </div>

      ${inAttesa ? `
        <div style="font-size:12px;color:var(--m);margin:6px 0 10px">
          In attesa della risposta del cliente. Di norma la registra il rappresentante.
          Per accettare serve il preventivo firmato o la mail di approvazione.
        </div>
        ${puoRegistrareEsitoPreventivo() ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${bottoniEsitoPreventivo(preventivo)}
          </div>
        ` : ''}
      ` : esito}
    </div>
  `;
}

async function apriEsitoPreventivo(preventivoId, esito, numero) {
  if (!puoRegistrareEsitoPreventivo()) {
    toast('Solo il rappresentante o il titolare possono registrare l\'esito', 'err');
    return;
  }

  const accetta = esito === 'accettato';

  ge('mep-preventivo-id').value = preventivoId;
  ge('mep-esito').value = esito;
  ge('mep-titolo').textContent = accetta
    ? '✅ Preventivo accettato dal cliente'
    : '❌ Preventivo rifiutato dal cliente';
  ge('mep-sottotitolo').textContent = numero
    ? 'Preventivo n. ' + numero
    : '';

  ge('mep-box-accettazione').style.display = accetta ? '' : 'none';
  ge('mep-box-rifiuto').style.display = accetta ? 'none' : '';
  ge('mep-allegato').value = '';
  ge('mep-motivo').value = '';

  const bottone = ge('mep-conferma');
  bottone.textContent = accetta ? '✅ Conferma accettazione' : '❌ Conferma rifiuto';
  bottone.className = accetta ? 'btn p' : 'btn warn';

  // F4.2: anticipo sì/no (precompilato con quanto indicato dal commerciale).
  await preparaAnticipoEsitoPreventivo(preventivoId, accetta);

  aggiornaBottoneEsitoPreventivo();
  openM('m-esito-preventivo');
}

// Il bottone di conferma resta bloccato finché manca l'allegato (o il motivo).
function aggiornaBottoneEsitoPreventivo() {
  const bottone = ge('mep-conferma');
  if (!bottone) return;

  const esito = v('mep-esito');
  const pronto = esito === 'accettato'
    ? !!ge('mep-allegato')?.files?.[0] && anticipoEsitoPronto()
    : v('mep-motivo').trim().length > 0;

  bottone.disabled = !pronto;
}

function messaggioErroreEsitoPreventivo(error) {
  const testo = error?.message || '';

  if (/3\.000/.test(testo)) {
    return 'Preventivo sopra 3.000 €: per ora l\'esito lo registra il titolare. Avvisalo.';
  }

  return testo || 'errore sconosciuto';
}

async function salvaEsitoPreventivo() {
  if (!puoRegistrareEsitoPreventivo()) return;

  const preventivoId = v('mep-preventivo-id');
  const esito = v('mep-esito');
  const bottone = ge('mep-conferma');

  if (!preventivoId || !['accettato', 'rifiutato'].includes(esito)) return;

  if (esito === 'rifiutato') {
    const motivo = v('mep-motivo').trim();

    if (!motivo) {
      toast('Scrivi il motivo del rifiuto', 'err');
      return;
    }

    bottone.disabled = true;

    const { error } = await db.rpc('rifiuta_preventivo', {
      p_preventivo_id: preventivoId,
      p_motivo: motivo
    });

    if (error) {
      bottone.disabled = false;
      toast('Rifiuto non registrato: ' + messaggioErroreEsitoPreventivo(error), 'err');
      return;
    }

    closeM('m-esito-preventivo');
    toast('Preventivo segnato come rifiutato', 'ok');
    await aggiornaDopoEsitoPreventivo(preventivoId);
    return;
  }

  // Accettazione: allegato obbligatorio.
  const file = ge('mep-allegato')?.files?.[0];

  if (!file) {
    toast('Allega il preventivo firmato o la mail di approvazione', 'err');
    aggiornaBottoneEsitoPreventivo();
    return;
  }

  if (file.size > ESITO_PREVENTIVO_MAX_MB * 1024 * 1024) {
    toast('L\'allegato supera il limite di ' + ESITO_PREVENTIVO_MAX_MB + ' MB', 'err');
    return;
  }

  const tipoAmmesso =
    file.type === 'application/pdf' ||
    /^image\//.test(file.type || '') ||
    file.type === 'message/rfc822' ||
    /\.(pdf|eml|msg|jpe?g|png|heic|webp)$/i.test(file.name);

  if (!tipoAmmesso) {
    toast('Allega un PDF, una foto o il file della mail (.eml / .msg)', 'err');
    return;
  }

  // F4.2: dati dell'anticipo (solo con sql/24 eseguito).
  const anticipo = datiAnticipoEsitoPreventivo();

  if (anticipo && anticipo.errore) {
    toast(anticipo.errore, 'err');
    return;
  }

  bottone.disabled = true;

  // Stesso schema di percorso degli altri caricamenti del bucket.
  const nomeSicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const percorso =
    preventivoId +
    '/accettazione/' +
    Date.now() +
    '_' +
    nomeSicuro;

  const { error: erroreUpload } = await db.storage
    .from('preventivi-documenti')
    .upload(percorso, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });

  if (erroreUpload) {
    bottone.disabled = false;
    toast('Errore caricamento allegato: ' + erroreUpload.message, 'err');
    return;
  }

  const parametriAccettazione = {
    p_preventivo_id: preventivoId,
    p_allegato_path: percorso,
    p_allegato_nome: file.name
  };

  if (anticipo) {
    parametriAccettazione.p_anticipo_richiesto = anticipo.richiesto;
    parametriAccettazione.p_anticipo_tipo = anticipo.tipo;
    parametriAccettazione.p_anticipo_valore = anticipo.valore;
  }

  const { data: nuovoStato, error } = await db.rpc('accetta_preventivo', parametriAccettazione);

  if (error) {
    await db.storage.from('preventivi-documenti').remove([percorso]);
    bottone.disabled = false;
    toast('Accettazione non registrata: ' + messaggioErroreEsitoPreventivo(error), 'err');
    return;
  }

  closeM('m-esito-preventivo');

  // F4.2: con l'anticipo il database restituisce 'in_attesa_anticipo'
  // e il preventivo compare alla segreteria in "Anticipi da fatturare".
  // F5.1: senza anticipo nasce subito la commessa (solo con sql/26).
  toast(
    nuovoStato === 'in_attesa_anticipo'
      ? 'Preventivo accettato: in attesa dell\'anticipo (passa alla segreteria per la fattura)'
      : 'Preventivo segnato come accettato' + await testoCommessaNata(preventivoId),
    'ok'
  );

  await aggiornaDopoEsitoPreventivo(preventivoId);
}

async function aggiornaDopoEsitoPreventivo(preventivoId) {
  // F5.3: sede o stato cambiati dalla pagina Commesse o dalla scheda
  // della commessa (js/26): si ricarica quella pagina.
  if (typeof aggiornaPagineCommesse === 'function' && await aggiornaPagineCommesse()) return;

  if (ROLE === 'rappresentante') {
    await loadPreventiviRappresentante();
    return;
  }

  if (currentPreventivoId === preventivoId && ge('pg-preventivo-detail')?.classList.contains('on')) {
    await openPreventivoDetail(preventivoId);
  }
}

// Elenco "Esiti registrati" nella pagina I miei preventivi del rappresentante.
async function htmlEsitiRegistratiRappresentante() {
  const anticipoDisponibile = await verificaAnticipoPreventivoDisponibile();
  // F4.3: fattura d'anticipo e accredito (solo con sql/25).
  const fatturaDisponibile = anticipoDisponibile && await verificaFatturaAnticipoDisponibile();

  const { data, error } = await db
    .from('preventivi')
    .select(`
      id,
      numero,
      stato,
      esito_registrato_il,
      esito_registrato_da,
      motivo_rifiuto,
      allegato_accettazione_path,
      allegato_accettazione_nome,
      ${anticipoDisponibile ? 'totale_imponibile, anticipo_richiesto, anticipo_tipo, anticipo_valore,' : ''}
      ${fatturaDisponibile ? COLONNE_FATTURA_ANTICIPO + ',' : ''}
      clienti!inner(ragione_sociale, rappresentante_id)
    `)
    .in('stato', STATI_ESITO_PREVENTIVO)
    .eq('clienti.rappresentante_id', ME.id)
    .not('esito_registrato_il', 'is', null)
    .order('esito_registrato_il', { ascending: false })
    .limit(20);

  if (error || !data?.length) return '';

  // F5.1: codice della commessa sui preventivi accettati (solo con sql/26).
  await aggiungiCommessaAiPreventivi(data);

  return `
    <div style="font-size:14px;font-weight:700;margin:22px 0 10px">
      Esiti registrati (ultimi 20)
    </div>
    ${data.map(function(preventivo) {
      return `
        <div class="card" style="margin-bottom:10px">
          <div style="font-size:14px;font-weight:700">
            Preventivo n. ${esc(String(preventivo.numero || '—'))}
          </div>
          <div style="font-size:13px;margin-top:2px">
            ${esc(preventivo.clienti?.ragione_sociale || 'Cliente')}
          </div>
          ${riepilogoEsitoPreventivo(preventivo)}
        </div>
      `;
    }).join('')}
  `;
}


// =====================================================================
// F4.2 — ANTICIPO DEL PREVENTIVO e lista "Anticipi da fatturare"
// Passi 5 e 6 del flusso della commessa. Il commerciale può indicare
// l'anticipo nel preventivo; il rappresentante lo conferma o lo corregge
// quando il cliente accetta. Con l'anticipo il preventivo va
// "in attesa anticipo" (sql/24) e compare alla segreteria: senza
// accredito la commessa non parte. Senza sql/24 nulla di questo compare.
// =====================================================================

let anticipoPreventivoDisponibile = null;
let anticipoEsitoAttivo = false;
let anticipoEsitoNonCaricato = false;
let anticipoEsitoTotale = 0;

// true se sql/24 è stato eseguito (esiste la colonna anticipo_richiesto).
async function verificaAnticipoPreventivoDisponibile() {
  if (anticipoPreventivoDisponibile !== null) return anticipoPreventivoDisponibile;

  const { error } = await db
    .from('preventivi')
    .select('anticipo_richiesto')
    .limit(1);

  if (!error) {
    anticipoPreventivoDisponibile = true;
  } else if (/anticipo_richiesto|column|colonna/i.test(error.message || '')) {
    anticipoPreventivoDisponibile = false;
  } else {
    // Errore di rete o altro: non decidere ora, riprova la prossima volta.
    return false;
  }

  return anticipoPreventivoDisponibile;
}

function numeroAnticipo(valore) {
  if (valore === null || valore === undefined) return NaN;
  const testo = String(valore).trim().replace(',', '.');
  return testo === '' ? NaN : Number(testo);
}

// Importo dell'anticipo in EUR, IVA esclusa.
function importoAnticipoPreventivo(tipo, valore, totaleImponibile) {
  const numero = numeroAnticipo(valore);
  if (!Number.isFinite(numero)) return 0;
  if (tipo === 'percentuale') {
    return Math.round(numeroPreventivo(totaleImponibile) * numero) / 100;
  }
  return numero;
}

function testoAnticipoPreventivo(tipo, valore, totaleImponibile) {
  const numero = numeroAnticipo(valore);
  if (!Number.isFinite(numero) || numero <= 0) return '';

  const importo = euroPreventivo(importoAnticipoPreventivo(tipo, valore, totaleImponibile));

  return tipo === 'percentuale'
    ? numero.toLocaleString('it-IT') + '% del totale imponibile = ' + importo + ' + IVA'
    : importo + ' + IVA';
}

// Riga "Anticipo: ..." nel riepilogo dell'esito (solo con sql/24).
function rigaAnticipoPreventivo(preventivo) {
  if (!preventivo || !('anticipo_richiesto' in preventivo)) return '';

  if (preventivo.anticipo_richiesto !== true) {
    return '<div style="margin-top:6px;font-size:12px">Senza anticipo</div>';
  }

  const testo = testoAnticipoPreventivo(
    preventivo.anticipo_tipo,
    preventivo.anticipo_valore,
    preventivo.totale_imponibile
  );

  return `
    <div style="margin-top:6px;font-size:13px">
      Anticipo: <b>${esc(testo || 'indicato')}</b>
      ${preventivo.stato === 'in_attesa_anticipo' ? `
        <div style="font-size:12px;margin-top:2px">
          La segreteria emette la fattura d'anticipo e verifica l'accredito:
          finché non è accreditato la commessa non parte.
        </div>
      ` : ''}
      ${htmlFatturaAnticipoPreventivo(preventivo)}
    </div>
  `;
}

// Controlla e normalizza i dati dell'anticipo.
// consentiNonIndicato: nell'editor del commerciale si può lasciare vuoto.
function datiAnticipoValidi(richiesto, tipo, valore, totaleImponibile, consentiNonIndicato) {
  if (richiesto === null || richiesto === undefined) {
    return consentiNonIndicato
      ? { richiesto: null, tipo: null, valore: null }
      : { errore: 'Indica se il cliente paga un anticipo (sì o no)' };
  }

  if (richiesto === false) {
    return { richiesto: false, tipo: null, valore: null };
  }

  if (!['percentuale', 'importo'].includes(tipo)) {
    return { errore: 'Indica se l\'anticipo è una percentuale o un importo' };
  }

  const numero = numeroAnticipo(valore);

  if (!Number.isFinite(numero) || numero <= 0) {
    return { errore: 'Indica il valore dell\'anticipo (maggiore di zero)' };
  }

  const arrotondato = Math.round(numero * 100) / 100;

  if (tipo === 'percentuale' && arrotondato > 100) {
    return { errore: 'La percentuale dell\'anticipo non può superare 100' };
  }

  if (tipo === 'importo' && arrotondato > numeroPreventivo(totaleImponibile)) {
    return {
      errore: 'L\'anticipo supera il totale imponibile del preventivo (' +
        euroPreventivo(totaleImponibile) + ')'
    };
  }

  return { richiesto: true, tipo: tipo, valore: arrotondato };
}

// ---- Editor del preventivo (commerciale / titolare) ----------------------

function htmlAnticipoEditorPreventivo(totaleImponibile) {
  const a = anticipoPreventivoEditor;
  if (!a.disponibile) return '';

  const intestazione = `
    <div style="font-size:14px;font-weight:700;margin-bottom:5px">
      💶 Anticipo
    </div>
  `;

  if (a.bloccato) {
    return `
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--b)">
        ${intestazione}
        <div style="font-size:13px">
          ${a.richiesto === true
            ? 'Anticipo: <b>' + esc(testoAnticipoPreventivo(a.tipo, a.valore, totaleImponibile)) + '</b>'
            : 'Senza anticipo'}
        </div>
        <div style="font-size:12px;color:var(--m);margin-top:4px">
          Fissato quando il cliente ha risposto: non si cambia più.
        </div>
      </div>
    `;
  }

  return `
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--b)">
      ${intestazione}

      <div style="font-size:12px;color:var(--m);margin-bottom:10px">
        Facoltativo. Il cliente paga un anticipo prima dei lavori? Se lo indichi
        qui, il rappresentante lo trova già compilato quando il cliente accetta
        (e può correggerlo). Per togliere l'anticipo scegli "Non indicato" (o
        "No") e salva: si può cambiare finché il cliente non ha risposto. Il
        testo delle modalità di pagamento qui sopra resta quello del PDF.
      </div>

      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:13px;margin-bottom:10px">
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
          <input
            type="radio"
            name="pvv-anticipo"
            value="nd"
            ${a.richiesto !== true && a.richiesto !== false ? 'checked' : ''}
            onchange="impostaAnticipoEditor('richiesto', null)"
          >
          Non indicato (lo decide il rappresentante)
        </label>
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
          <input
            type="radio"
            name="pvv-anticipo"
            value="no"
            ${a.richiesto === false ? 'checked' : ''}
            onchange="impostaAnticipoEditor('richiesto', false)"
          >
          No, senza anticipo
        </label>
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
          <input
            type="radio"
            name="pvv-anticipo"
            value="si"
            ${a.richiesto === true ? 'checked' : ''}
            onchange="impostaAnticipoEditor('richiesto', true)"
          >
          Sì, con anticipo
        </label>
      </div>

      <div id="pvv-anticipo-dettaglio" class="g2" style="display:${a.richiesto === true ? 'grid' : 'none'}">
        <div class="f">
          <label>Anticipo espresso in</label>
          <select onchange="impostaAnticipoEditor('tipo', this.value)">
            <option value="percentuale" ${a.tipo === 'percentuale' ? 'selected' : ''}>% del totale imponibile</option>
            <option value="importo" ${a.tipo === 'importo' ? 'selected' : ''}>Importo in € (IVA esclusa)</option>
          </select>
        </div>
        <div class="f">
          <label>Valore *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value="${esc(String(a.valore ?? ''))}"
            placeholder="Es. 30"
            oninput="impostaAnticipoEditor('valore', this.value)"
          >
        </div>
      </div>

      <div id="pvv-anticipo-calcolo" style="font-size:12px;color:var(--m)">
        ${a.richiesto === true ? esc(testoAnticipoPreventivo(a.tipo, a.valore, totaleImponibile)) : ''}
      </div>
    </div>
  `;
}

function impostaAnticipoEditor(campo, valore) {
  if (anticipoPreventivoEditor.bloccato) return;

  anticipoPreventivoEditor[campo] = valore;

  const dettaglio = ge('pvv-anticipo-dettaglio');
  if (dettaglio) {
    dettaglio.style.display = anticipoPreventivoEditor.richiesto === true ? 'grid' : 'none';
  }

  const calcolo = ge('pvv-anticipo-calcolo');
  if (calcolo) {
    const totale = vociPreventivoDati.reduce(function(somma, voce) {
      return somma + totaleVocePreventivo(voce, 'vendita');
    }, 0);

    calcolo.textContent = anticipoPreventivoEditor.richiesto === true
      ? testoAnticipoPreventivo(anticipoPreventivoEditor.tipo, anticipoPreventivoEditor.valore, totale)
      : '';
  }
}

// ---- Finestra "Accettato dal cliente" (rappresentante / titolare) --------

async function preparaAnticipoEsitoPreventivo(preventivoId, accetta) {
  const box = ge('mep-box-anticipo');
  anticipoEsitoAttivo = false;
  anticipoEsitoNonCaricato = false;
  anticipoEsitoTotale = 0;

  if (!box) return;
  box.style.display = 'none';

  document.querySelectorAll('input[name="mep-anticipo"]').forEach(function(radio) {
    radio.checked = false;
  });
  ge('mep-anticipo-tipo').value = 'percentuale';
  ge('mep-anticipo-valore').value = '';

  if (!accetta || !(await verificaAnticipoPreventivoDisponibile())) {
    aggiornaAnticipoEsitoPreventivo();
    return;
  }

  const { data: preventivo, error } = await db
    .from('preventivi')
    .select('totale_imponibile,anticipo_richiesto,anticipo_tipo,anticipo_valore')
    .eq('id', preventivoId)
    .single();

  if (error || !preventivo) {
    // Senza i dati non si può chiedere l'anticipo: conferma bloccata.
    anticipoEsitoNonCaricato = true;
    toast('Dati dell\'anticipo non caricati: chiudi e riapri la finestra', 'err');
    return;
  }

  anticipoEsitoAttivo = true;
  anticipoEsitoTotale = numeroPreventivo(preventivo.totale_imponibile);
  box.style.display = '';

  if (preventivo.anticipo_richiesto === true || preventivo.anticipo_richiesto === false) {
    const scelta = document.querySelector(
      'input[name="mep-anticipo"][value="' + (preventivo.anticipo_richiesto ? 'si' : 'no') + '"]'
    );
    if (scelta) scelta.checked = true;
  }

  if (preventivo.anticipo_tipo) ge('mep-anticipo-tipo').value = preventivo.anticipo_tipo;
  if (preventivo.anticipo_valore !== null && preventivo.anticipo_valore !== undefined) {
    ge('mep-anticipo-valore').value = preventivo.anticipo_valore;
  }

  ge('mep-anticipo-totale').textContent =
    'Totale imponibile del preventivo: ' + euroPreventivo(anticipoEsitoTotale);

  aggiornaAnticipoEsitoPreventivo();
}

function sceltaAnticipoEsito() {
  const scelta = document.querySelector('input[name="mep-anticipo"]:checked');
  if (!scelta) return null;
  return scelta.value === 'si';
}

function aggiornaAnticipoEsitoPreventivo() {
  const richiesto = sceltaAnticipoEsito();

  const dettaglio = ge('mep-anticipo-dettaglio');
  if (dettaglio) dettaglio.style.display = richiesto === true ? 'grid' : 'none';

  const avviso = ge('mep-anticipo-avviso');
  if (avviso) avviso.style.display = richiesto === true ? '' : 'none';

  const calcolo = ge('mep-anticipo-calcolo');
  if (calcolo) {
    calcolo.textContent = richiesto === true
      ? testoAnticipoPreventivo(v('mep-anticipo-tipo'), v('mep-anticipo-valore'), anticipoEsitoTotale)
      : '';
  }

  aggiornaBottoneEsitoPreventivo();
}

function datiAnticipoEsitoPreventivo() {
  if (anticipoEsitoNonCaricato) {
    return { errore: 'Dati dell\'anticipo non caricati: chiudi e riapri la finestra' };
  }
  if (!anticipoEsitoAttivo) return null;

  return datiAnticipoValidi(
    sceltaAnticipoEsito(),
    v('mep-anticipo-tipo'),
    v('mep-anticipo-valore'),
    anticipoEsitoTotale,
    false
  );
}

function anticipoEsitoPronto() {
  const anticipo = datiAnticipoEsitoPreventivo();
  return !anticipo || !anticipo.errore;
}

// ---- Dashboard segreteria: "Anticipi da fatturare" -----------------------

async function loadAnticipiDaFatturare() {
  const sezione = ge('seg-anticipi-sezione');
  const box = ge('seg-anticipi-lista');
  const kpi = ge('seg-k-anticipi');
  const kpiCard = ge('seg-k-anticipi-card');

  if (!box) return;

  if (!(await verificaAnticipoPreventivoDisponibile())) {
    if (sezione) sezione.style.display = 'none';
    if (kpiCard) kpiCard.style.display = 'none';
    return;
  }

  if (sezione) sezione.style.display = '';
  if (kpiCard) kpiCard.style.display = '';

  // F4.3: fattura d'anticipo e accredito (solo con sql/25).
  const fatturaDisponibile = await verificaFatturaAnticipoDisponibile();

  const { data, error } = await db
    .from('preventivi')
    .select(`
      id,
      numero,
      stato,
      tipo,
      totale_imponibile,
      iva_perc,
      condizioni_pagamento,
      anticipo_richiesto,
      anticipo_tipo,
      anticipo_valore,
      esito_registrato_il,
      esito_registrato_da,
      allegato_accettazione_path,
      allegato_accettazione_nome,
      ${fatturaDisponibile ? COLONNE_FATTURA_ANTICIPO + ',' : ''}
      clienti(ragione_sociale, rappresentante_id)
    `)
    .eq('stato', 'in_attesa_anticipo')
    .order('esito_registrato_il', { ascending: true });

  if (error) {
    if (kpi) kpi.textContent = '—';
    box.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Errore: ' + esc(error.message) + '</div></div>';
    return;
  }

  const anticipi = data || [];
  if (kpi) kpi.textContent = anticipi.length;

  if (!anticipi.length) {
    box.innerHTML = '<div class="rap-list-card"><div class="tit-empty">✅ Nessun anticipo da fatturare o da accreditare</div></div>';
    return;
  }

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  box.innerHTML = `
    <div class="al2 w" style="margin-bottom:10px">
      Preventivi accettati dal cliente con anticipo: emetti la fattura d'anticipo,
      registrala qui, poi segna l'accredito quando l'hai verificato sul conto.
      Senza accredito il preventivo non è approvato e la commessa non parte.
      Se il cliente non versa l'anticipo usa "Rifiuta: anticipo non versato".
      Dal più vecchio.
    </div>
  ` + anticipi.map(function(p) {
    const importo = importoAnticipoPreventivo(p.anticipo_tipo, p.anticipo_valore, p.totale_imponibile);
    const ivaPerc = Number(p.iva_perc ?? 22);
    const accettatoIl = p.esito_registrato_il ? new Date(p.esito_registrato_il) : null;
    let giorni = null;

    if (accettatoIl) {
      const giorno = new Date(accettatoIl);
      giorno.setHours(0, 0, 0, 0);
      giorni = Math.round((oggi - giorno) / 86400000);
    }

    const rappresentante = nomeChiHaRegistratoEsito(p.clienti?.rappresentante_id);
    const chi = nomeChiHaRegistratoEsito(p.esito_registrato_da);

    return `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #EF9F27">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="min-width:0">
            <div style="font-size:14px;font-weight:700">
              Preventivo n. ${esc(String(p.numero || '—'))}
              · ${esc(p.clienti?.ragione_sociale || 'Cliente')}
            </div>
            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${esc(p.tipo || 'Preventivo')}
              ${rappresentante ? ' · Rappresentante: ' + esc(rappresentante) : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start">
            ${fatturaDisponibile ? `
              <span class="bx ${p.anticipo_fattura_numero ? 'bblue' : 'bwarn'}">
                ${p.anticipo_fattura_numero ? 'Fatturato · attende accredito' : 'Da fatturare'}
              </span>
            ` : ''}
            <span class="bx bwarn">
              ${giorni === null ? 'In attesa' : (giorni === 0 ? 'Accettato oggi' : 'Da ' + giorni + (giorni === 1 ? ' giorno' : ' giorni'))}
            </span>
          </div>
        </div>

        <div class="g2" style="margin-top:10px">
          ${irHtmlPreventivo('Anticipo da fatturare (IVA esclusa)', '<b>' + esc(euroPreventivo(importo)) + '</b>')}
          ${irHtmlPreventivo('Con IVA ' + ivaPerc + '%', esc(euroPreventivo(Math.round(importo * (100 + ivaPerc)) / 100)))}
          ${irHtmlPreventivo('Come richiesto', esc(testoAnticipoPreventivo(p.anticipo_tipo, p.anticipo_valore, p.totale_imponibile) || '—'))}
          ${irHtmlPreventivo('Totale imponibile preventivo', esc(euroPreventivo(p.totale_imponibile)))}
        </div>

        ${p.condizioni_pagamento ? `
          <div style="font-size:12px;margin-top:8px;white-space:pre-wrap">
            <span style="color:var(--m)">Modalità di pagamento:</span> ${esc(p.condizioni_pagamento)}
          </div>
        ` : ''}

        <div style="font-size:12px;color:var(--m);margin-top:8px">
          Accettato ${accettatoIl ? 'il ' + esc(dataOraEsitoPreventivo(p.esito_registrato_il)) : ''}
          ${chi ? ' · registrato da ' + esc(chi) : ''}
        </div>

        ${htmlFatturaAnticipoPreventivo(p)}

        ${p.allegato_accettazione_path ? `
          <div style="margin-top:10px">
            <button
              class="btn sm"
              onclick="apriAllegatoPreventivoFornitore('${esc(p.allegato_accettazione_path)}')"
            >
              📎 ${esc(p.allegato_accettazione_nome || 'Preventivo firmato / mail di approvazione')}
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// =====================================================================
// F4.3 — FATTURA D'ANTICIPO E ACCREDITO VERIFICATO
// Passo 6 del flusso: la segreteria (o il titolare) registra la fattura
// d'anticipo emessa (numero, data, importo) e poi l'accredito verificato
// (data; chi = l'utente collegato). Con l'accredito il preventivo diventa
// 'accettato': via libera al rappresentante. Il database lo impone
// (sql/25: registra_fattura_anticipo, registra_accredito_anticipo e
// trigger trg_preventivi_esito). La fattura non va nella tabella fatture
// (modulo Fatture in costruzione): sul preventivo resta il riferimento.
// Senza sql/25 i bottoni non compaiono.
// =====================================================================

const COLONNE_FATTURA_ANTICIPO =
  'anticipo_fattura_numero, anticipo_fattura_data, anticipo_fattura_importo, ' +
  'anticipo_fattura_registrata_da, anticipo_fattura_registrata_il, ' +
  'anticipo_accredito_data, anticipo_accredito_verificato_da, anticipo_accredito_registrato_il';

let fatturaAnticipoDisponibile = null;
let anticipoSegreteriaTotale = 0;

// true se sql/25 è stato eseguito (esiste la colonna anticipo_fattura_numero).
async function verificaFatturaAnticipoDisponibile() {
  if (fatturaAnticipoDisponibile !== null) return fatturaAnticipoDisponibile;

  const { error } = await db
    .from('preventivi')
    .select('anticipo_fattura_numero')
    .limit(1);

  if (!error) {
    fatturaAnticipoDisponibile = true;
  } else if (/anticipo_fattura_numero|column|colonna/i.test(error.message || '')) {
    fatturaAnticipoDisponibile = false;
  } else {
    // Errore di rete o altro: non decidere ora, riprova la prossima volta.
    return false;
  }

  return fatturaAnticipoDisponibile;
}

function puoRegistrareAccreditoAnticipo() {
  return ROLE === 'segreteria' || ROLE === 'titolare';
}

// Fattura d'anticipo e accredito: riepilogo per tutti, bottoni solo per
// segreteria e titolare finché il preventivo è in attesa dell'anticipo.
function htmlFatturaAnticipoPreventivo(p) {
  if (!p || !('anticipo_fattura_numero' in p) || p.anticipo_richiesto !== true) return '';

  const fattura = !!p.anticipo_fattura_numero;
  const accredito = !!p.anticipo_accredito_data;
  const chiFattura = nomeChiHaRegistratoEsito(p.anticipo_fattura_registrata_da);
  const chiAccredito = nomeChiHaRegistratoEsito(p.anticipo_accredito_verificato_da);
  const puo = p.stato === 'in_attesa_anticipo' && puoRegistrareAccreditoAnticipo();

  // Rifiutato per anticipo non versato: resta solo il riferimento alla
  // fattura d'anticipo eventualmente registrata.
  if (p.stato === 'rifiutato') {
    if (!fattura) return '';
    return `
      <div style="margin-top:8px;font-size:12px;line-height:1.6">
        🧾 Fattura d'anticipo registrata prima del rifiuto:
        <b>n. ${esc(p.anticipo_fattura_numero)}</b> del ${esc(fd(p.anticipo_fattura_data))}
        · ${esc(euroPreventivo(p.anticipo_fattura_importo))} + IVA
        ${chiFattura ? ' · registrata da ' + esc(chiFattura) : ''}
      </div>
    `;
  }

  return `
    <div style="margin-top:8px;font-size:12px;line-height:1.6">
      <div>
        🧾 Fattura d'anticipo:
        ${fattura
          ? '<b>n. ' + esc(p.anticipo_fattura_numero) + '</b> del ' + esc(fd(p.anticipo_fattura_data)) +
            ' · ' + esc(euroPreventivo(p.anticipo_fattura_importo)) + ' + IVA' +
            (chiFattura ? ' · registrata da ' + esc(chiFattura) : '')
          : '<b>non ancora registrata</b>'}
      </div>
      <div>
        🏦 Accredito:
        ${accredito
          ? '<b>verificato</b> · accreditato il ' + esc(fd(p.anticipo_accredito_data)) +
            (chiAccredito ? ' · verificato da ' + esc(chiAccredito) : '')
          : '<b>non ancora verificato</b>'}
      </div>
    </div>
    ${puo ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn sm${fattura ? '' : ' p'}" onclick="apriAnticipoSegreteria('${p.id}', 'fattura')">
          ${fattura ? '✏️ Correggi fattura d\'anticipo' : '🧾 Registra fattura d\'anticipo'}
        </button>
        <button
          class="btn sm${fattura ? ' p' : ''}"
          ${fattura ? '' : 'disabled title="Registra prima la fattura d\'anticipo"'}
          onclick="apriAnticipoSegreteria('${p.id}', 'accredito')"
        >
          ✅ Accredito verificato
        </button>
        <button
          class="btn sm"
          style="color:var(--r)"
          onclick="apriRifiutoAnticipoNonVersato('${p.id}')"
        >
          ❌ Rifiuta: anticipo non versato
        </button>
      </div>
    ` : ''}
  `;
}

async function apriAnticipoSegreteria(preventivoId, modo) {
  if (!puoRegistrareAccreditoAnticipo()) {
    toast('Solo la segreteria o il titolare registrano fattura d\'anticipo e accredito', 'err');
    return;
  }

  if (!(await verificaFatturaAnticipoDisponibile())) {
    toast('Funzione non ancora attiva sul database (manca sql/25)', 'err');
    return;
  }

  const { data: p, error } = await db
    .from('preventivi')
    .select(`
      id,
      numero,
      stato,
      totale_imponibile,
      iva_perc,
      anticipo_richiesto,
      anticipo_tipo,
      anticipo_valore,
      ${COLONNE_FATTURA_ANTICIPO},
      clienti(ragione_sociale)
    `)
    .eq('id', preventivoId)
    .single();

  if (error || !p) {
    toast('Preventivo non caricato: ' + (error?.message || 'non trovato'), 'err');
    return;
  }

  if (p.stato !== 'in_attesa_anticipo') {
    toast('Il preventivo non è più in attesa dell\'anticipo', 'err');
    await aggiornaDopoAnticipoSegreteria(preventivoId);
    return;
  }

  if (modo === 'accredito' && !p.anticipo_fattura_numero) {
    toast('Registra prima la fattura d\'anticipo', 'err');
    return;
  }

  const fattura = modo === 'fattura';
  const atteso = importoAnticipoPreventivo(p.anticipo_tipo, p.anticipo_valore, p.totale_imponibile);
  const oggi = dataLocaleISO();

  anticipoSegreteriaTotale = numeroPreventivo(p.totale_imponibile);

  ge('mas-preventivo-id').value = p.id;
  ge('mas-modo').value = modo;
  ge('mas-titolo').textContent = fattura
    ? (p.anticipo_fattura_numero ? '✏️ Correggi la fattura d\'anticipo' : '🧾 Fattura d\'anticipo emessa')
    : '✅ Accredito dell\'anticipo verificato';
  ge('mas-sottotitolo').textContent =
    'Preventivo n. ' + (p.numero || '—') + ' · ' + (p.clienti?.ragione_sociale || 'Cliente');

  ge('mas-riepilogo').innerHTML = fattura
    ? 'Anticipo richiesto: <b>' + esc(testoAnticipoPreventivo(p.anticipo_tipo, p.anticipo_valore, p.totale_imponibile) || '—') +
      '</b><br>Totale imponibile del preventivo: ' + esc(euroPreventivo(p.totale_imponibile))
    : 'Fattura d\'anticipo <b>n. ' + esc(p.anticipo_fattura_numero) + '</b> del ' + esc(fd(p.anticipo_fattura_data)) +
      ': <b>' + esc(euroPreventivo(p.anticipo_fattura_importo)) + '</b> + IVA ' + Number(p.iva_perc ?? 22) + '%';

  ge('mas-box-fattura').style.display = fattura ? '' : 'none';
  ge('mas-box-accredito').style.display = fattura ? 'none' : '';

  ge('mas-fattura-numero').value = p.anticipo_fattura_numero || '';
  ge('mas-fattura-data').value = p.anticipo_fattura_data || oggi;
  ge('mas-fattura-data').max = oggi;
  ge('mas-fattura-importo').value = p.anticipo_fattura_importo ?? (Math.round(atteso * 100) / 100);
  ge('mas-fattura-importo').dataset.atteso = String(Math.round(atteso * 100) / 100);

  ge('mas-accredito-data').value = oggi;
  ge('mas-accredito-data').max = oggi;
  ge('mas-accredito-conferma').checked = false;

  const bottone = ge('mas-conferma');
  bottone.textContent = fattura ? '🧾 Salva fattura d\'anticipo' : '✅ Conferma accredito';

  aggiornaBottoneAnticipoSegreteria();
  openM('m-anticipo-segreteria');
}

// Controlla i dati della finestra: restituisce { errore } oppure i dati.
function datiAnticipoSegreteria() {
  const oggi = dataLocaleISO();

  if (v('mas-modo') === 'fattura') {
    const numero = v('mas-fattura-numero').trim();
    const data = v('mas-fattura-data');
    const importo = Math.round(numeroPreventivo(v('mas-fattura-importo')) * 100) / 100;

    if (!numero) return { errore: 'Indica il numero della fattura d\'anticipo' };
    if (!data) return { errore: 'Indica la data della fattura' };
    if (data > oggi) return { errore: 'La data della fattura non può essere nel futuro' };
    if (!(importo > 0)) return { errore: 'Indica l\'importo fatturato (maggiore di zero)' };
    if (importo > Math.round(anticipoSegreteriaTotale * 100) / 100) {
      return { errore: 'L\'importo supera il totale imponibile del preventivo (' + euroPreventivo(anticipoSegreteriaTotale) + ')' };
    }

    return { numero: numero, data: data, importo: importo };
  }

  const dataAccredito = v('mas-accredito-data');
  if (!dataAccredito) return { errore: 'Indica la data dell\'accredito' };
  if (dataAccredito > oggi) return { errore: 'La data dell\'accredito non può essere nel futuro' };
  if (!ge('mas-accredito-conferma')?.checked) {
    return { errore: 'Conferma di aver verificato l\'accredito sul conto' };
  }

  return { dataAccredito: dataAccredito };
}

function aggiornaBottoneAnticipoSegreteria() {
  const bottone = ge('mas-conferma');
  if (!bottone) return;

  const dati = datiAnticipoSegreteria();
  bottone.disabled = !!dati.errore;

  // Avviso (non blocca) se l'importo è diverso dall'anticipo richiesto.
  const avviso = ge('mas-fattura-avviso');
  if (avviso && v('mas-modo') === 'fattura') {
    const atteso = numeroPreventivo(ge('mas-fattura-importo')?.dataset.atteso);
    const importo = numeroPreventivo(v('mas-fattura-importo'));
    avviso.textContent = dati.errore
      ? dati.errore
      : (Math.abs(importo - atteso) >= 0.01
          ? '⚠️ Diverso dall\'anticipo richiesto (' + euroPreventivo(atteso) + '): controlla prima di salvare.'
          : 'Uguale all\'anticipo richiesto.');
  }
}

async function salvaAnticipoSegreteria() {
  if (!puoRegistrareAccreditoAnticipo()) return;

  const preventivoId = v('mas-preventivo-id');
  const modo = v('mas-modo');
  const bottone = ge('mas-conferma');
  const dati = datiAnticipoSegreteria();

  if (!preventivoId) return;

  if (dati.errore) {
    toast(dati.errore, 'err');
    return;
  }

  if (modo === 'accredito' && !confirm(
    'Confermi l\'accredito dell\'anticipo? Il preventivo diventa accettato e non si torna indietro.'
  )) {
    return;
  }

  bottone.disabled = true;

  const { error } = modo === 'fattura'
    ? await db.rpc('registra_fattura_anticipo', {
        p_preventivo_id: preventivoId,
        p_numero: dati.numero,
        p_data: dati.data,
        p_importo: dati.importo
      })
    : await db.rpc('registra_accredito_anticipo', {
        p_preventivo_id: preventivoId,
        p_data_accredito: dati.dataAccredito
      });

  if (error) {
    bottone.disabled = false;
    toast((modo === 'fattura' ? 'Fattura non registrata: ' : 'Accredito non registrato: ') + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-anticipo-segreteria');
  toast(
    modo === 'fattura'
      ? 'Fattura d\'anticipo registrata. Quando l\'anticipo arriva sul conto segna "Accredito verificato"'
      : 'Accredito registrato: preventivo accettato, via libera al rappresentante' + await testoCommessaNata(preventivoId),
    'ok'
  );

  await aggiornaDopoAnticipoSegreteria(preventivoId);
}

async function aggiornaDopoAnticipoSegreteria(preventivoId) {
  if (ROLE === 'segreteria' || ge('seg-anticipi-lista')?.offsetParent) {
    await loadAnticipiDaFatturare();
  }

  if (currentPreventivoId === preventivoId && ge('pg-preventivo-detail')?.classList.contains('on')) {
    await openPreventivoDetail(preventivoId);
  }
}

// ---- Cliente che non versa l'anticipo -----------------------------------
// Decisione di Erika del 26/10: un preventivo in attesa dell'anticipo può
// essere portato a 'rifiutato' solo dalla segreteria o dal titolare, con
// un motivo obbligatorio (sql/25: rifiuta_per_anticipo_non_versato). La
// fattura d'anticipo eventualmente registrata resta salvata.

const MOTIVO_ANTICIPO_NON_VERSATO = 'Anticipo non versato';

async function apriRifiutoAnticipoNonVersato(preventivoId) {
  if (!puoRegistrareAccreditoAnticipo()) {
    toast('Solo la segreteria o il titolare possono rifiutare per anticipo non versato', 'err');
    return;
  }

  if (!(await verificaFatturaAnticipoDisponibile())) {
    toast('Funzione non ancora attiva sul database (manca sql/25)', 'err');
    return;
  }

  const { data: p, error } = await db
    .from('preventivi')
    .select('id, numero, stato, anticipo_fattura_numero, anticipo_fattura_data, clienti(ragione_sociale)')
    .eq('id', preventivoId)
    .single();

  if (error || !p) {
    toast('Preventivo non caricato: ' + (error?.message || 'non trovato'), 'err');
    return;
  }

  if (p.stato !== 'in_attesa_anticipo') {
    toast('Il preventivo non è più in attesa dell\'anticipo', 'err');
    await aggiornaDopoAnticipoSegreteria(preventivoId);
    return;
  }

  ge('mra-preventivo-id').value = p.id;
  ge('mra-sottotitolo').textContent =
    'Preventivo n. ' + (p.numero || '—') + ' · ' + (p.clienti?.ragione_sociale || 'Cliente');
  ge('mra-fattura').innerHTML = p.anticipo_fattura_numero
    ? 'La fattura d\'anticipo <b>n. ' + esc(p.anticipo_fattura_numero) + '</b> del ' +
      esc(fd(p.anticipo_fattura_data)) + ' resta registrata sul preventivo: ' +
      'se va annullata, serve una nota di credito (fuori dal gestionale).'
    : 'Nessuna fattura d\'anticipo registrata.';
  ge('mra-motivo').value = MOTIVO_ANTICIPO_NON_VERSATO;
  ge('mra-conferma-check').checked = false;

  aggiornaBottoneRifiutoAnticipo();
  openM('m-rifiuto-anticipo');
}

function aggiornaBottoneRifiutoAnticipo() {
  const bottone = ge('mra-conferma');
  if (!bottone) return;
  bottone.disabled = !v('mra-motivo').trim() || !ge('mra-conferma-check')?.checked;
}

async function salvaRifiutoAnticipoNonVersato() {
  if (!puoRegistrareAccreditoAnticipo()) return;

  const preventivoId = v('mra-preventivo-id');
  const motivo = v('mra-motivo').trim();
  const bottone = ge('mra-conferma');

  if (!preventivoId) return;

  if (!motivo) {
    toast('Indica il motivo del rifiuto', 'err');
    return;
  }

  if (!ge('mra-conferma-check')?.checked) {
    toast('Conferma che il cliente non ha versato l\'anticipo', 'err');
    return;
  }

  if (!confirm('Confermi il rifiuto? Il preventivo diventa rifiutato e la commessa non parte.')) {
    return;
  }

  bottone.disabled = true;

  const { error } = await db.rpc('rifiuta_per_anticipo_non_versato', {
    p_preventivo_id: preventivoId,
    p_motivo: motivo
  });

  if (error) {
    bottone.disabled = false;
    toast('Rifiuto non registrato: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-rifiuto-anticipo');
  toast('Preventivo rifiutato: anticipo non versato', 'ok');

  await aggiornaDopoAnticipoSegreteria(preventivoId);
}


// =====================================================================
// F5.1 — COMMESSA nata dal preventivo accettato (sql/26-commesse).
// Passo 5 del flusso: quando il preventivo diventa 'accettato' (senza
// anticipo, oppure con l'accredito verificato dalla segreteria) il
// database crea da solo la commessa, con il codice ANNO-NUMERO
// (es. 2026-001). Nasce solo dai preventivi collegati a un progetto
// tecnico (lavoro straordinario/cantiere, non la manutenzione
// periodica). Qui si mostra il codice nel riepilogo dell'esito e si
// indica la sede del cantiere quando il cliente ne ha più d'una
// (titolare, segreteria, rappresentante: imposta_sede_commessa).
// Senza sql/26 nulla di questo compare.
// =====================================================================

const ETICHETTE_STATO_COMMESSA = {
  approvata: 'Approvata',
  materiali_ordinati: 'Materiali ordinati',
  in_preparazione: 'In preparazione',
  pronta: 'Pronta',
  in_corso: 'In corso',
  fine_lavori: 'Fine lavori',
  chiusa: 'Chiusa',
  annullata: 'Annullata'
};

let commesseDisponibili = null;

// true se sql/26 è stato eseguito (esiste la tabella commesse).
async function verificaCommesseDisponibili() {
  if (commesseDisponibili !== null) return commesseDisponibili;

  const { error } = await db
    .from('commesse')
    .select('id')
    .limit(1);

  if (!error) {
    commesseDisponibili = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /commesse/i.test(error.message || '')) {
    commesseDisponibili = false;
  } else {
    // Errore di rete o altro: non decidere ora, riprova la prossima volta.
    return false;
  }

  return commesseDisponibili;
}

// Commesse dei preventivi indicati: { id_preventivo: commessa }.
// null se le commesse non sono attive o la lettura non riesce.
async function caricaCommessePreventivi(idPreventivi) {
  const ids = (idPreventivi || []).filter(Boolean);
  if (!ids.length || !(await verificaCommesseDisponibili())) return null;

  const { data, error } = await db
    .from('commesse')
    .select('id, codice, stato, creato_il, cliente_id, sede_id, preventivo_id, sedi_cliente(nome, tipo, via, civico, citta)')
    .in('preventivo_id', ids);

  if (error) return null;

  const mappa = {};
  (data || []).forEach(function(commessa) {
    mappa[commessa.preventivo_id] = commessa;
  });
  return mappa;
}

// Aggiunge preventivo._commessa (oggetto, oppure null se manca) ai
// preventivi accettati dell'elenco. Senza sql/26 non tocca nulla.
async function aggiungiCommessaAiPreventivi(preventivi) {
  const accettati = (preventivi || []).filter(function(p) {
    return p && p.stato === 'accettato';
  });
  if (!accettati.length) return;

  const mappa = await caricaCommessePreventivi(accettati.map(function(p) { return p.id; }));
  if (!mappa) return;

  // F5.2: bottone "Stato e storico" solo con sql/28 (verifica in cache).
  await verificaStatiCommessaDisponibili();

  accettati.forEach(function(p) {
    p._commessa = mappa[p.id] || null;
  });

  // F8.5: il preventivo integrativo di un lavoro extra non ha una
  // commessa sua: resta nella commessa del lavoro extra (js/36, sql/38).
  const senzaCommessa = accettati.filter(function(p) { return !p._commessa; });
  if (senzaCommessa.length && typeof verificaLavoriExtraDisponibili === 'function' &&
      (await verificaLavoriExtraDisponibili())) {
    const { data: extra, error: erroreExtra } = await db
      .from('commesse_lavori_extra')
      .select('numero, preventivo_id, commesse(id, codice, stato, preventivo_id)')
      .in('preventivo_id', senzaCommessa.map(function(p) { return p.id; }));
    if (!erroreExtra) {
      (extra || []).forEach(function(r) {
        const p = senzaCommessa.find(function(x) { return x.id === r.preventivo_id; });
        if (p && r.commesse) p._lavoroExtra = { numero: r.numero, commessa: r.commesse };
      });
    }
  }
}

function puoImpostareSedeCommessa() {
  return ['titolare', 'segreteria', 'rappresentante'].includes(ROLE);
}

function testoSedeCommessa(sede) {
  if (!sede) return '';
  const indirizzo = [
    [sede.via, sede.civico].filter(Boolean).join(' '),
    sede.citta
  ].filter(Boolean).join(', ');
  return [sede.nome || sede.tipo, indirizzo].filter(Boolean).join(' · ');
}

// Riga "Commessa 2026-001" nel riepilogo dell'esito (solo accettati).
function htmlCommessaPreventivo(preventivo) {
  if (!preventivo || preventivo.stato !== 'accettato' || !('_commessa' in preventivo)) return '';

  const commessa = preventivo._commessa;

  if (!commessa && preventivo._lavoroExtra) {
    const le = preventivo._lavoroExtra;
    return `
      <div class="card" style="margin:10px 0 0;padding:10px 12px;color:var(--t)">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
          <div style="font-size:14px;font-weight:700">
            ➕ Preventivo integrativo: lavoro extra n. ${esc(le.numero)} della commessa ${esc(le.commessa.codice)}
          </div>
          <span class="bx ${classeStatoCommessa(le.commessa.stato)}">${esc(ETICHETTE_STATO_COMMESSA[le.commessa.stato] || le.commessa.stato)}</span>
        </div>
        <div style="font-size:12px;color:var(--m);margin-top:4px">
          Accettato: il lavoro extra si può eseguire nella stessa commessa (nessuna commessa nuova).
        </div>
        ${canAccessPage('commessa-detail') ? `
          <div style="margin-top:6px">
            <button class="btn sm" onclick="openCommessaDetail('${esc(le.commessa.id)}')">📂 Apri commessa ${esc(le.commessa.codice)}</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  if (!commessa) {
    return `
      <div style="margin-top:8px;font-size:12px;color:var(--m)">
        Nessuna commessa collegata (preventivo senza progetto tecnico o
        accettato prima dell'attivazione delle commesse).
      </div>
    `;
  }

  const nata = commessa.creato_il
    ? new Date(commessa.creato_il).toLocaleDateString('it-IT')
    : '';
  const sede = testoSedeCommessa(commessa.sedi_cliente);

  return `
    <div class="card" style="margin:10px 0 0;padding:10px 12px;color:var(--t)">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="font-size:14px;font-weight:700">
          📁 Commessa ${esc(commessa.codice)}
        </div>
        <span class="bx ${classeStatoCommessa(commessa.stato)}">${esc(ETICHETTE_STATO_COMMESSA[commessa.stato] || commessa.stato)}</span>
      </div>
      ${nata ? `<div style="font-size:12px;color:var(--m);margin-top:4px">Nata il ${esc(nata)}</div>` : ''}
      ${htmlProssimoPassoCommessa(commessa)}
      ${canAccessPage('commessa-detail') ? `
        <div style="margin-top:6px">
          <button class="btn sm" onclick="openCommessaDetail('${esc(commessa.id)}')">📂 Apri commessa e documenti</button>
        </div>
      ` : ''}
      <div id="commessa-sede-${esc(commessa.id)}" style="font-size:12px;margin-top:6px">
        Sede del cantiere: ${sede
          ? '<b>' + esc(sede) + '</b>'
          : '<b style="color:var(--a)">da indicare</b>'}
        ${puoImpostareSedeCommessa() && commessa.stato !== 'chiusa' && commessa.stato !== 'annullata' ? `
          <button
            class="btn sm"
            style="margin-left:6px"
            onclick="apriSceltaSedeCommessa('${esc(commessa.id)}', '${esc(commessa.cliente_id)}', '${esc(commessa.preventivo_id)}', '${esc(commessa.sede_id || '')}')"
          >
            ${sede ? 'Cambia sede' : 'Indica la sede'}
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

async function apriSceltaSedeCommessa(commessaId, clienteId, preventivoId, sedeAttuale) {
  // Lo stesso id c'è nel riepilogo del preventivo e nella scheda commessa: si prende quello della pagina aperta
  const box = document.querySelector('.page.on [id="commessa-sede-' + commessaId + '"]') || ge('commessa-sede-' + commessaId);
  if (!box) return;

  const { data: sedi, error } = await db.rpc('elenco_sedi_cliente', { p_cliente_id: clienteId });

  if (error) {
    toast('Errore caricamento sedi: ' + error.message, 'err');
    return;
  }

  if (!sedi?.length) {
    toast('Il cliente non ha sedi: aggiungila nella scheda cliente', 'err');
    return;
  }

  box.innerHTML = `
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">Sede del cantiere</div>
    <select id="commessa-sede-scelta-${esc(commessaId)}" style="max-width:100%">
      <option value="">— Scegli la sede —</option>
      ${sedi.map(function(sede) {
        return `<option value="${esc(sede.id)}" ${sede.id === sedeAttuale ? 'selected' : ''}>${esc(testoSedeCommessa(sede))}</option>`;
      }).join('')}
    </select>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn sm p" onclick="salvaSedeCommessa('${esc(commessaId)}', '${esc(preventivoId)}', this)">Salva sede</button>
      <button class="btn sm" onclick="aggiornaDopoEsitoPreventivo('${esc(preventivoId)}')">Annulla</button>
    </div>
  `;
}

async function salvaSedeCommessa(commessaId, preventivoId, bottone) {
  // La tendina giusta è quella accanto al bottone (può essercene una anche nella pagina nascosta del preventivo)
  const scelta = (bottone && bottone.closest('[id="commessa-sede-' + commessaId + '"]')?.querySelector('select'))
    || document.querySelector('.page.on [id="commessa-sede-scelta-' + commessaId + '"]');
  const sedeId = scelta ? scelta.value : v('commessa-sede-scelta-' + commessaId);

  if (!sedeId) {
    toast('Scegli la sede del cantiere', 'err');
    return;
  }

  if (bottone) bottone.disabled = true;

  const { data: codice, error } = await db.rpc('imposta_sede_commessa', {
    p_commessa_id: commessaId,
    p_sede_id: sedeId
  });

  if (error) {
    if (bottone) bottone.disabled = false;
    toast('Sede non salvata: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  toast('Sede della commessa ' + (codice || '') + ' salvata', 'ok');
  await aggiornaDopoEsitoPreventivo(preventivoId);
}

// Testo da aggiungere al messaggio dopo l'accettazione o l'accredito:
// " · nata la commessa 2026-001" (vuoto senza sql/26 o senza commessa).
async function testoCommessaNata(preventivoId) {
  const mappa = await caricaCommessePreventivi([preventivoId]);
  const commessa = mappa && mappa[preventivoId];
  return commessa ? ' · nata la commessa ' + commessa.codice : '';
}


// =====================================================================
// F5.2 — STATI DELLA COMMESSA e storico (sql/28-commesse-stati-storico).
// Gli stati si passano solo in ordine, uno alla volta, e ognuno lo segna
// il ruolo che nel flusso della commessa fa quel lavoro (o il titolare,
// che può tutto ma non è mai obbligato):
//   approvata → materiali ordinati   rappresentante (passo 7)
//   → in preparazione                capo tecnico   (passo 8)
//   → pronta                         segreteria     (passo 10, faldone)
//   → in corso → fine lavori         capo tecnico   (passo 11)
//   → chiusa                         segreteria     (passo 12)
// Solo il titolare riporta indietro (nota obbligatoria), annulla (motivo
// obbligatorio) e riattiva (torna allo stato di prima). Se il titolare
// riporta indietro il preventivo accettato la commessa diventa da sola
// 'annullata'; se il preventivo torna accettato si riattiva da sola.
// Lo storico (chi, quando, da quale stato a quale, nota) lo scrive il
// database (RPC cambia_stato_commessa). Senza sql/28 nulla compare.
// Pagina Commesse e scheda della commessa: js/26 (F5.3).
// =====================================================================

const ORDINE_STATI_COMMESSA = [
  'approvata', 'materiali_ordinati', 'in_preparazione', 'pronta',
  'in_corso', 'fine_lavori', 'chiusa'
];

// Chi segna il passaggio A quello stato (oltre al titolare).
const RUOLO_PASSO_COMMESSA = {
  materiali_ordinati: 'rappresentante',
  in_preparazione: 'capo_tecnico',
  pronta: 'segreteria',
  in_corso: 'capo_tecnico',
  fine_lavori: 'capo_tecnico',
  chiusa: 'segreteria'
};

const NOMI_RUOLO_PASSO_COMMESSA = {
  rappresentante: 'Rappresentante',
  capo_tecnico: 'Capo tecnico',
  segreteria: 'Segreteria',
  titolare: 'Titolare',
  commerciale: 'Commerciale'
};

// Cosa significa il passaggio, in parole semplici (passi del flusso).
const DESCRIZIONE_PASSO_COMMESSA = {
  materiali_ordinati: 'tutto ordinato, date di arrivo comunicate e documentazione girata al capo tecnico',
  in_preparazione: 'documenti esaminati, consumabili e noli mancanti chiesti agli acquisti',
  pronta: 'date di inizio fissate con il cliente, documenti pronti, faldone consegnato al capo tecnico',
  in_corso: 'cantiere iniziato',
  fine_lavori: 'lavori finiti, si passa alla segreteria',
  chiusa: 'corretta messa in opera verificata, fatture fatte, commessa chiusa'
};

function classeStatoCommessa(stato) {
  if (stato === 'chiusa') return 'bok';
  if (stato === 'annullata') return 'berr';
  if (stato === 'in_corso' || stato === 'fine_lavori') return 'bpur';
  return 'bblue';
}

function statoSuccessivoCommessa(stato) {
  const i = ORDINE_STATI_COMMESSA.indexOf(stato);
  if (i < 0 || i >= ORDINE_STATI_COMMESSA.length - 1) return null;
  return ORDINE_STATI_COMMESSA[i + 1];
}

// true se l'utente collegato segna il prossimo passo della commessa.
function toccaAMeCommessa(commessa) {
  const prossimo = statoSuccessivoCommessa(commessa && commessa.stato);
  return !!prossimo && RUOLO_PASSO_COMMESSA[prossimo] === ROLE;
}

let statiCommessaDisponibili = null;

// true se sql/28 è stato eseguito (esiste la tabella commesse_storico).
async function verificaStatiCommessaDisponibili() {
  if (statiCommessaDisponibili !== null) return statiCommessaDisponibili;
  if (!(await verificaCommesseDisponibili())) return false;

  const { error } = await db
    .from('commesse_storico')
    .select('id')
    .limit(1);

  if (!error) {
    statiCommessaDisponibili = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /commesse_storico/i.test(error.message || '')) {
    statiCommessaDisponibili = false;
  } else {
    return false;
  }

  return statiCommessaDisponibili;
}

// Riga "Prossimo passo" + bottone "Stato e storico" nel riepilogo della
// commessa. Il bottone c'è solo con sql/28 (verifica già fatta e in cache).
function htmlProssimoPassoCommessa(commessa) {
  if (!commessa || statiCommessaDisponibili !== true) return '';

  const prossimo = statoSuccessivoCommessa(commessa.stato);
  const chi = prossimo ? NOMI_RUOLO_PASSO_COMMESSA[RUOLO_PASSO_COMMESSA[prossimo]] : '';
  const testo = commessa.stato === 'annullata'
    ? 'Commessa annullata: solo il titolare può riattivarla'
    : (prossimo
      ? 'Prossimo passo: <b>' + esc(ETICHETTE_STATO_COMMESSA[prossimo]) + '</b> (lo segna: ' + esc(chi) + ')'
      : 'Commessa chiusa');

  return `
    <div style="font-size:12px;margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span>${testo}</span>
      <button class="btn sm${toccaAMeCommessa(commessa) ? ' p' : ''}" onclick="apriStatoCommessa('${esc(commessa.id)}', '${esc(commessa.preventivo_id || '')}')">
        Stato e storico
      </button>
    </div>
  `;
}

let commessaStatoAperta = null;

// Finestra "Stato della commessa": percorso degli stati, cambio di stato
// consentito al ruolo, storico dei passaggi.
async function apriStatoCommessa(commessaId, preventivoId) {
  if (!(await verificaStatiCommessaDisponibili())) {
    toast('Gli stati della commessa non sono ancora attivi (sql/28)', 'err');
    return;
  }

  const [rCommessa, rStorico] = await Promise.all([
    db.from('commesse')
      .select('id, codice, stato, titolo, preventivo_id, clienti(ragione_sociale), preventivi(stato)')
      .eq('id', commessaId)
      .maybeSingle(),
    db.from('commesse_storico')
      .select('id, da_stato, a_stato, tipo, nota, cambiato_da_nome, cambiato_da_ruolo, cambiato_il')
      .eq('commessa_id', commessaId)
      .order('cambiato_il', { ascending: false })
  ]);

  if (rCommessa.error || !rCommessa.data) {
    toast('Errore apertura commessa: ' + (rCommessa.error?.message || 'commessa non trovata'), 'err');
    return;
  }

  const commessa = rCommessa.data;
  const storico = rStorico.data || [];
  commessaStatoAperta = {
    id: commessa.id,
    codice: commessa.codice,
    stato: commessa.stato,
    preventivoId: preventivoId || commessa.preventivo_id || ''
  };

  ge('msc-titolo').textContent = '📁 Commessa ' + commessa.codice;
  ge('msc-sottotitolo').textContent = [commessa.clienti?.ragione_sociale, commessa.titolo]
    .filter(Boolean).join(' · ');
  ge('msc-percorso').innerHTML = htmlPercorsoStatiCommessa(commessa.stato);

  // Stati che l'utente può scegliere (il database ricontrolla tutto).
  const opzioni = [];
  const prossimo = statoSuccessivoCommessa(commessa.stato);

  if (commessa.stato === 'annullata') {
    const annullamento = storico.find(function(r) { return r.a_stato === 'annullata'; });
    const prima = (annullamento && annullamento.da_stato) || 'approvata';
    if (ROLE === 'titolare' && commessa.preventivi?.stato === 'accettato') {
      opzioni.push({ stato: prima, tipo: 'riattivazione', testo: '↺ Riattiva: torna a ' + ETICHETTE_STATO_COMMESSA[prima] });
    }
  } else {
    // F7.2: con sql/33 'pronta' si segna solo con "Faldone consegnato"
    // nella scheda della commessa (js/31; il database blocca il resto).
    const prontaDalFaldone = prossimo === 'pronta' &&
      typeof verificaFaldoneDisponibile === 'function' && (await verificaFaldoneDisponibile());
    // F9.2: con sql/39 'chiusa' si segna solo con "Chiudi la commessa"
    // nella scheda (js/38: dichiarazione e fattura finale; il database
    // blocca il resto).
    const chiusaDallaScheda = prossimo === 'chiusa' &&
      typeof verificaFatturaFinaleDisponibile === 'function' && (await verificaFatturaFinaleDisponibile());
    if (prossimo && !prontaDalFaldone && !chiusaDallaScheda && (ROLE === 'titolare' || RUOLO_PASSO_COMMESSA[prossimo] === ROLE)) {
      opzioni.push({ stato: prossimo, tipo: 'avanti', testo: '→ ' + ETICHETTE_STATO_COMMESSA[prossimo] });
    }
    if (ROLE === 'titolare') {
      ORDINE_STATI_COMMESSA
        .slice(0, ORDINE_STATI_COMMESSA.indexOf(commessa.stato))
        .reverse()
        .forEach(function(stato) {
          opzioni.push({ stato: stato, tipo: 'indietro', testo: '← Indietro a ' + ETICHETTE_STATO_COMMESSA[stato] });
        });
      opzioni.push({ stato: 'annullata', tipo: 'annullamento', testo: '✕ Annulla la commessa' });
    }
  }

  const box = ge('msc-cambio');
  const avvisoFaldone = (commessa.stato === 'in_preparazione' && typeof faldoneCommessaAttivo === 'function' &&
      faldoneCommessaAttivo() && (ROLE === 'titolare' || RUOLO_PASSO_COMMESSA.pronta === ROLE))
    ? '<div class="al2 i">"Pronta" si segna con <b>Faldone consegnato</b> nella scheda della commessa (box "Date dei lavori e faldone"): il gestionale controlla date, personale e documenti.' +
      (canAccessPage('commessa-detail') ? ` <button class="btn sm" onclick="closeM('m-stato-commessa');openCommessaDetail('${esc(commessa.id)}')">Apri la commessa</button>` : '') + '</div>'
    : '';
  const avvisoChiusura = (commessa.stato === 'fine_lavori' && typeof chiusuraCommessaAttiva === 'function' &&
      chiusuraCommessaAttiva() && (ROLE === 'titolare' || RUOLO_PASSO_COMMESSA.chiusa === ROLE))
    ? '<div class="al2 i">"Chiusa" si segna con <b>Chiudi la commessa</b> nella scheda della commessa (box "Fine lavori"): servono la dichiarazione di corretta messa in opera nella cartella Chiusura e la fattura finale.' +
      (canAccessPage('commessa-detail') ? ` <button class="btn sm" onclick="closeM('m-stato-commessa');openCommessaDetail('${esc(commessa.id)}')">Apri la commessa</button>` : '') + '</div>'
    : '';
  // F8.5: lavori extra ancora da decidere prima di "Fine lavori" o
  // "Chiusa" (js/36, solo con sql/38).
  const avvisoLavoriExtra = prossimo && typeof htmlAvvisoLavoriExtraCambioStato === 'function' &&
      (ROLE === 'titolare' || RUOLO_PASSO_COMMESSA[prossimo] === ROLE)
    ? await htmlAvvisoLavoriExtraCambioStato(commessa.id, prossimo)
    : '';
  if (opzioni.length) {
    box.innerHTML = avvisoLavoriExtra + avvisoFaldone + avvisoChiusura + `
      <div class="f">
        <label>Nuovo stato</label>
        <select id="msc-stato" onchange="aggiornaCambioStatoCommessa()">
          ${opzioni.map(function(o, i) {
            return `<option value="${esc(o.stato)}" data-tipo="${esc(o.tipo)}" ${i === 0 ? 'selected' : ''}>${esc(o.testo)}</option>`;
          }).join('')}
        </select>
      </div>
      <div id="msc-spiegazione" style="font-size:12px;color:var(--m);margin:-4px 0 8px"></div>
      <div class="f">
        <label id="msc-nota-label">Nota</label>
        <textarea id="msc-nota" rows="2" oninput="aggiornaCambioStatoCommessa()"></textarea>
      </div>
    `;
  } else {
    let motivo;
    if (commessa.stato === 'chiusa') {
      motivo = 'La commessa è chiusa.';
    } else if (commessa.stato === 'annullata') {
      motivo = ROLE === 'titolare'
        ? 'La commessa è annullata e il preventivo non è accettato: si riattiva da sola quando il preventivo torna accettato.'
        : 'La commessa è annullata: solo il titolare può riattivarla.';
    } else {
      motivo = 'Il prossimo passo (' + ETICHETTE_STATO_COMMESSA[prossimo] + ') lo segna: ' +
        NOMI_RUOLO_PASSO_COMMESSA[RUOLO_PASSO_COMMESSA[prossimo]] + ' (o il titolare).';
    }
    box.innerHTML = avvisoLavoriExtra + (avvisoFaldone || avvisoChiusura || ('<div class="al2 i">' + esc(motivo) + '</div>'));
  }

  ge('msc-conferma').style.display = opzioni.length ? '' : 'none';
  ge('msc-storico').innerHTML = htmlStoricoCommessa(storico);

  aggiornaCambioStatoCommessa();
  openM('m-stato-commessa');
}

function htmlPercorsoStatiCommessa(statoAttuale) {
  const iAttuale = ORDINE_STATI_COMMESSA.indexOf(statoAttuale);

  const passi = ORDINE_STATI_COMMESSA.map(function(stato, i) {
    const fatto = iAttuale >= 0 && i < iAttuale;
    const attuale = i === iAttuale;
    const stile = attuale
      ? 'background:var(--b);color:#fff;font-weight:700'
      : (fatto ? 'background:var(--gl);color:#085041' : 'background:var(--bg);color:var(--m)');
    return `<span style="padding:3px 8px;border-radius:12px;font-size:11px;${stile}">${fatto ? '✓ ' : ''}${esc(ETICHETTE_STATO_COMMESSA[stato])}</span>`;
  }).join('<span style="color:var(--m);font-size:11px">›</span>');

  return `
    <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">${passi}</div>
    ${statoAttuale === 'annullata' ? '<div class="al2 e" style="margin-top:8px">Commessa annullata</div>' : ''}
  `;
}

function htmlStoricoCommessa(storico) {
  if (!storico.length) {
    return '<div style="font-size:12px;color:var(--m)">Nessun passaggio registrato.</div>';
  }

  const titoli = {
    nascita: 'Nata',
    avanti: 'Avanti',
    indietro: 'Indietro',
    annullamento: 'Annullata',
    riattivazione: 'Riattivata'
  };

  return storico.map(function(r) {
    const chi = r.cambiato_da_nome
      ? r.cambiato_da_nome + (r.cambiato_da_ruolo ? ' (' + (NOMI_RUOLO_PASSO_COMMESSA[r.cambiato_da_ruolo] || r.cambiato_da_ruolo) + ')' : '')
      : 'automatico';
    const passaggio = r.da_stato
      ? (ETICHETTE_STATO_COMMESSA[r.da_stato] || r.da_stato) + ' → ' + (ETICHETTE_STATO_COMMESSA[r.a_stato] || r.a_stato)
      : (ETICHETTE_STATO_COMMESSA[r.a_stato] || r.a_stato);
    return `
      <div style="padding:6px 0;border-bottom:1px solid var(--bo);font-size:12px">
        <div><b>${esc(titoli[r.tipo] || r.tipo)}</b> · ${esc(passaggio)}</div>
        <div style="color:var(--m)">${esc(dataOraEsitoPreventivo(r.cambiato_il))} · ${esc(chi)}</div>
        ${r.nota ? `<div style="white-space:pre-wrap;margin-top:2px">${esc(r.nota)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function tipoCambioStatoCommessa() {
  const sel = ge('msc-stato');
  if (!sel || sel.selectedIndex < 0) return '';
  return sel.options[sel.selectedIndex].getAttribute('data-tipo') || '';
}

// Nota obbligatoria per indietro, annullamento e riattivazione.
function aggiornaCambioStatoCommessa() {
  const bottone = ge('msc-conferma');
  const sel = ge('msc-stato');
  if (!sel) {
    if (bottone) bottone.disabled = true;
    return;
  }

  const tipo = tipoCambioStatoCommessa();
  const notaObbligatoria = tipo !== 'avanti';
  const nota = (v('msc-nota') || '').trim();

  const etichetta = ge('msc-nota-label');
  if (etichetta) {
    etichetta.textContent = tipo === 'annullamento'
      ? 'Motivo dell\'annullamento *'
      : (notaObbligatoria ? 'Perché? *' : 'Nota (facoltativa)');
  }

  const spiegazione = ge('msc-spiegazione');
  if (spiegazione) {
    spiegazione.textContent = tipo === 'avanti'
      ? 'Vuol dire: ' + (DESCRIZIONE_PASSO_COMMESSA[sel.value] || '') + '.'
      : (tipo === 'annullamento'
        ? 'La commessa resta salvata con il suo codice e lo storico, ma non va più avanti.'
        : (tipo === 'riattivazione'
          ? 'La commessa torna nello stato che aveva prima dell\'annullamento.'
          : 'Solo il titolare riporta indietro una commessa.'));
  }

  if (bottone) bottone.disabled = notaObbligatoria && !nota;
}

async function salvaStatoCommessa() {
  if (!commessaStatoAperta) return;

  const stato = v('msc-stato');
  const tipo = tipoCambioStatoCommessa();
  const nota = (v('msc-nota') || '').trim();

  if (!stato) return;
  if (tipo !== 'avanti' && !nota) {
    toast(tipo === 'annullamento' ? 'Scrivi il motivo dell\'annullamento' : 'Scrivi perché', 'err');
    return;
  }

  const domanda = tipo === 'annullamento'
    ? 'Confermi l\'annullamento della commessa ' + commessaStatoAperta.codice + '?'
    : 'Confermi: commessa ' + commessaStatoAperta.codice + ' → ' + (ETICHETTE_STATO_COMMESSA[stato] || stato) + '?';
  if (!confirm(domanda)) return;

  const bottone = ge('msc-conferma');
  if (bottone) bottone.disabled = true;

  const { data: nuovoStato, error } = await db.rpc('cambia_stato_commessa', {
    p_commessa_id: commessaStatoAperta.id,
    p_stato: stato,
    p_nota: nota || null
  });

  if (error) {
    if (bottone) bottone.disabled = false;
    toast('Stato non cambiato: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  const codice = commessaStatoAperta.codice;
  const preventivoId = commessaStatoAperta.preventivoId;
  closeM('m-stato-commessa');
  toast('Commessa ' + codice + ': ' + (ETICHETTE_STATO_COMMESSA[nuovoStato] || nuovoStato), 'ok');

  if (preventivoId) {
    try { await aggiornaDopoEsitoPreventivo(preventivoId); } catch (e) { console.warn('aggiornaDopoEsitoPreventivo:', e); }
  }
  await caricaCommesseToccaAMe();
}

// Dashboard: "Commesse: tocca a te" per rappresentante, capo tecnico e
// segreteria (le commesse il cui prossimo passo è del loro ruolo; il
// rappresentante vede solo le sue, come la policy commesse_lettura).
const BOX_COMMESSE_TOCCA_A_ME = {
  rappresentante: 'rap-commesse-tocca',
  capo_tecnico: 'ct-commesse-tocca',
  segreteria: 'seg-commesse-tocca'
};

async function caricaCommesseToccaAMe() {
  const box = ge(BOX_COMMESSE_TOCCA_A_ME[ROLE] || '');
  if (!box) return;

  if (!(await verificaStatiCommessaDisponibili())) {
    box.innerHTML = '';
    return;
  }

  const stati = ORDINE_STATI_COMMESSA.filter(function(stato) {
    const prossimo = statoSuccessivoCommessa(stato);
    return prossimo && RUOLO_PASSO_COMMESSA[prossimo] === ROLE;
  });

  const { data, error } = await db
    .from('commesse')
    .select('id, codice, stato, titolo, preventivo_id, aggiornato_il, clienti(ragione_sociale)')
    .in('stato', stati)
    .order('anno', { ascending: true })
    .order('numero', { ascending: true });

  if (error || !data?.length) {
    if (error) console.warn('Commesse tocca a te:', error.message);
    box.innerHTML = '';
    return;
  }

  box.innerHTML = `
    <div class="tit-section">📁 Commesse: tocca a te (${data.length})</div>
    <div class="rap-list-card" style="margin-bottom:14px">
      ${data.map(function(c) {
        const prossimo = statoSuccessivoCommessa(c.stato);
        return `
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">
            <div style="min-width:0">
              <div style="font-weight:700">${esc(c.codice)} · ${esc(c.clienti?.ragione_sociale || '')}</div>
              <div style="font-size:12px;color:var(--m)">
                ${esc(c.titolo || '')}${c.titolo ? ' · ' : ''}ora: ${esc(ETICHETTE_STATO_COMMESSA[c.stato] || c.stato)}
                · da segnare: <b>${esc(ETICHETTE_STATO_COMMESSA[prossimo] || '')}</b>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${canAccessPage('commessa-detail') ? `<button class="btn sm" onclick="openCommessaDetail('${esc(c.id)}')">Apri</button>` : ''}
              <button class="btn sm p" onclick="apriStatoCommessa('${esc(c.id)}', '${esc(c.preventivo_id || '')}')">Cambia stato</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Un solo salvataggio di scheda di rilievo alla volta: con un doppio clic su
// "Salva" di una scheda nuova (sql/48) ne nascevano due uguali.
let salvataggioSchedaRilievoInCorso = false;
[
  'salvaSchedaPorteRei', 'salvaSchedaEstintori', 'salvaSchedaRilevazioneIncendi',
  'salvaSchedaCompartimentazione', 'salvaSchedaVerniceIntumescente',
  'salvaSchedaCoppelle', 'salvaSchedaImpiantiSpegnimento'
].forEach(function(nome) {
  const originale = window[nome];
  if (typeof originale !== 'function') return;
  window[nome] = async function() {
    if (salvataggioSchedaRilievoInCorso) return;
    salvataggioSchedaRilievoInCorso = true;
    try {
      return await originale.apply(this, arguments);
    } finally {
      salvataggioSchedaRilievoInCorso = false;
    }
  };
});
