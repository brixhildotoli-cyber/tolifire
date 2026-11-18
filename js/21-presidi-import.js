// =====================================================================
// js/21-presidi-import.js — IMPORT DEI PRESIDI DA FILE (CSV)
// Riordino del 18/11 (passo 2): tutto l'import in un file solo, ogni funzione
// scritta una volta. Prima era sparso in js/07 (finestra, lettura, anteprima),
// js/20 (conferma), js/21 (cliente, sede, tipologia) e js/22 (manichette,
// naspi, estintori) con 6 ritocchi a catena. Codice spostato così com'era.
// Flusso: apriImportPresidi → (cliente, sede, tipologia, anno, gruppo) →
// leggiFileImportPresidi → preparaImportPresidi (anteprima) → confermaImportPresidi.
// =====================================================================

// ── Righe, lettura del CSV e anteprima (da js/07) ─────────────────────

let righeImportPresidi = [];

function pulisciImportPresidi(valore) {
  return String(valore || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pulisciPivaImport(valore) {
  return String(valore || '').replace(/\D/g, '');
}

function leggiCsvImportPresidi(testo) {
  const primaRiga = testo.split(/\r?\n/)[0] || '';
  const separatore = primaRiga.includes(';') ? ';' : ',';

  const righe = [];
  let riga = [];
  let valore = '';
  let traVirgolette = false;

  for (let i = 0; i < testo.length; i++) {
    const carattere = testo[i];
    const successivo = testo[i + 1];

    if (carattere === '"') {
      if (traVirgolette && successivo === '"') {
        valore += '"';
        i++;
      } else {
        traVirgolette = !traVirgolette;
      }

      continue;
    }

    if (!traVirgolette && carattere === separatore) {
      riga.push(valore.trim());
      valore = '';
      continue;
    }

    if (!traVirgolette && (carattere === '\n' || carattere === '\r')) {
      if (carattere === '\r' && successivo === '\n') i++;

      riga.push(valore.trim());

      if (riga.some(function(cella) { return cella !== ''; })) {
        righe.push(riga);
      }

      riga = [];
      valore = '';
      continue;
    }

    valore += carattere;
  }

  riga.push(valore.trim());

  if (riga.some(function(cella) { return cella !== ''; })) {
    righe.push(riga);
  }

  return righe;
}

function dataImportPresidi(valore) {
  const data = String(valore || '').trim();

  if (!data) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return data;
  }

  const match = data.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);

  if (!match) return null;

  return [
    match[3],
    String(match[2]).padStart(2, '0'),
    String(match[1]).padStart(2, '0')
  ].join('-');
}

function tipoImportPresidio(valore) {
  const tipo = pulisciImportPresidi(valore);

  const mappa = {
    estintore: 'estintore',
    estintori: 'estintore',

    porta_rei: 'porta_rei',
    porte_rei: 'porta_rei',
    porta_tagliafuoco: 'porta_rei',
    porte_tagliafuoco: 'porta_rei',

    uscita_emergenza: 'uscita_emergenza',
    uscite_emergenza: 'uscita_emergenza',

    manichetta: 'manichetta',
    manichette: 'manichetta',

    idrante: 'idrante',
    idranti: 'idrante',

    naspo: 'naspo',
    naspi: 'naspo',

    luce_emergenza: 'luce_emergenza',
    luci_emergenza: 'luce_emergenza',

    evacuatore_fumi: 'evacuatore_fumi',
evacuatori_fumo: 'evacuatore_fumi',
evacuatore_di_fumo: 'evacuatore_fumi',
evacuatori_di_fumo: 'evacuatore_fumi',

    pompa_antincendio: 'pompa_antincendio',
    centrale_rivelazione: 'centrale_rivelazione',
    sprinkler: 'sprinkler'
    
  };

  return mappa[tipo] || '';
}

function elencoVociCsv(valore) {
  return String(valore || '')
    .split('|')
    .map(function(voce) {
      return voce.trim();
    })
    .filter(Boolean);
}

function statoDaEsitoCsv(esito) {
  const valore = pulisciImportPresidi(esito || '');

  if (!valore) return 'ok';

  if (['ok', 'anomalia', 'scaduto', 'fuori_servizio'].includes(valore)) {
    return valore;
  }

  if (
    valore.includes('non riallineabile') ||
    valore.includes('fuori servizio')
  ) {
    return 'fuori_servizio';
  }

  if (
    valore.includes('non conforme') ||
    valore.includes('non manutenzionata')
  ) {
    return 'anomalia';
  }

  return 'ok';
}

// Finestra vuota (prima era apriImportPresidi di js/07; la completa apriImportPresidi qui sotto).
function apriImportPresidiFinestra() {
  ricordaPosizionePagina();
  if (!['titolare', 'capo_tecnico', 'tecnico'].includes(ROLE)) {
    toast('Solo titolare e capo tecnico possono importare presidi', 'err');
    return;
  }

  righeImportPresidi = [];

  ge('import-presidi-file').value = '';
  ge('import-presidi-conferma').disabled = true;

  ge('import-presidi-riepilogo').textContent =
    'Nessun file selezionato.';

  ge('import-presidi-righe').innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty">Carica un file per vedere l’anteprima.</div>
      </td>
    </tr>
  `;
  ge('import-presidi-anno').value = new Date().getFullYear();

  openM('m-import-presidi');
}

function renderAnteprimaImportPresidi() {
  const valide = righeImportPresidi.filter(function(riga) {
    return riga.valido;
  });

  const errori = righeImportPresidi.filter(function(riga) {
    return !riga.valido;
  });

  const nuove = valide.filter(function(riga) {
    return riga.azione === 'Crea';
  });

  const aggiornamenti = valide.filter(function(riga) {
    return riga.azione === 'Aggiorna';
  });

  ge('import-presidi-riepilogo').innerHTML = `
    <b>${valide.length}</b> righe pronte:
    ${nuove.length} nuove,
    ${aggiornamenti.length} aggiornamenti,
    ${errori.length} con errore.
  `;

  ge('import-presidi-conferma').disabled = valide.length === 0;

  ge('import-presidi-righe').innerHTML = righeImportPresidi
    .slice(0, 100)
    .map(function(riga) {
      return `
        <tr>
          <td>${riga.numeroRiga}</td>
          <td>${esc(riga.cliente || '—')}</td>
          <td>${esc(riga.tipoNormale || riga.tipo || '—')}</td>
          <td>${esc(riga.matricolaNormale || riga.matricola || '—')}</td>
          <td>${esc(riga.azione || '—')}</td>
          <td style="color:${riga.valido ? 'var(--g)' : 'var(--r)'}">
            ${esc(riga.messaggio)}
          </td>
        </tr>
      `;
    })
    .join('');
}


// ── Cliente, sede e tipologia (da js/21) ──────────────────────────────

const importSediPresidi = {versione:0};
function invalidaImportPresidiSede() {
  importSediPresidi.versione++;
  righeImportPresidi = [];
  ge('import-presidi-file').value = '';
  ge('import-presidi-conferma').disabled = true;
  ge('import-presidi-righe').innerHTML = '';
  ge('import-presidi-riepilogo').textContent = 'Seleziona cliente e sede, poi carica il CSV.';
}
async function apriImportPresidi() {
  if (!gestisceStoricoPresidi()) { toast('Importazione riservata a titolare e capo tecnico.','err'); return; }
  apriImportPresidiFinestra();
  if (!ge('import-presidi-destinazione')) {
    ge('import-presidi-file').parentElement.insertAdjacentHTML('beforebegin',`
      <div id="import-presidi-destinazione" class="card">
        <div class="f"><label>Cliente destinatario di tutto il CSV</label><select id="import-presidi-cliente"><option value="">Seleziona cliente...</option></select></div>
        <div class="f"><label>Sede destinataria di tutto il CSV</label><select id="import-presidi-sede" disabled><option value="">Seleziona prima il cliente...</option></select></div>
        <div class="f">
  <label>Tipologia del CSV *</label>
  <select id="import-presidi-tipo">
    <option value="">Seleziona tipologia...</option>
    <option value="porte">Porte REI e/o uscite di emergenza</option>
    <option value="porta_rei">Solo porte REI</option>
    <option value="uscita_emergenza">Solo uscite di emergenza</option>
    <option value="estintore">Estintori</option>
    <option value="manichetta">Manichette</option>
    <option value="naspo">Naspi</option>
    <option value="evacuatore_fumi">Evacuatori fumo</option>
  </select>
  <div class="hint">
    Il CSV può contenere solo le tipologie compatibili con la scelta.
  </div>
</div>
        <div>Per i file di Pisa: GT Auto SRL → Ospedaletto. I presidi di Livorno rimangono separati.</div>
      </div>`);
    ge('import-presidi-cliente').addEventListener('change',caricaSediImportPresidi);
    ge('import-presidi-sede').addEventListener('change',invalidaImportPresidiSede);
    ['import-presidi-anno','import-presidi-ciclo'].forEach(id => ge(id).addEventListener('change',invalidaImportPresidiSede));
  }
  ge('import-presidi-cliente').innerHTML = '<option value="">Caricamento clienti...</option>';
  ge('import-presidi-cliente').disabled = true;
  ge('import-presidi-sede').innerHTML = '<option value="">Seleziona prima il cliente...</option>';
  ge('import-presidi-sede').disabled = true;
  ge('import-presidi-tipo').addEventListener(
  'change',
  invalidaImportPresidiSede
);
  invalidaImportPresidiSede();
  const versione = importSediPresidi.versione;
  const {data,error} = await db.from('clienti').select('id,ragione_sociale,piva').is('eliminato_il',null).order('ragione_sociale');
  if (versione !== importSediPresidi.versione) return;
  if (error) { toast('Errore clienti: '+error.message,'err'); return; }
  ge('import-presidi-cliente').innerHTML = '<option value="">Seleziona cliente...</option>'+(data || []).map(c => `<option value="${esc(c.id)}">${esc(c.ragione_sociale)}${c.piva ? ' · '+esc(c.piva) : ''}</option>`).join('');
  ge('import-presidi-cliente').disabled = false;
}
async function caricaSediImportPresidi() {
  invalidaImportPresidiSede();
  const versione = importSediPresidi.versione;
  const cliente = v('import-presidi-cliente');
  const select = ge('import-presidi-sede');
  select.disabled = true;
  select.innerHTML = '<option value="">Seleziona sede...</option>';
  if (!cliente) return;
  const {data,error} = await db.from('sedi_cliente').select('id,nome,tipo,via,civico,citta').eq('cliente_id',cliente).order('nome');
  if (versione !== importSediPresidi.versione) return;
  if (error) { toast('Errore sedi: '+error.message,'err'); return; }
  select.innerHTML += (data || []).map(s => `<option value="${esc(s.id)}">${esc([s.nome || s.tipo,[s.via,s.civico].filter(Boolean).join(' '),s.citta].filter(Boolean).join(' · '))}</option>`).join('');
  select.disabled = false;
  if (!data?.length) toast('Il cliente non ha sedi registrate: aggiungile nella sua anagrafica.','err');
}
// Lettura del file per gli import con il semestre (tutti tranne le sole manichette).
async function leggiFileImportPresidiSemestre(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!v('import-presidi-cliente') || !v('import-presidi-sede') || !v('import-presidi-ciclo')) {
    input.value = ''; toast('Seleziona cliente, sede e gruppo prima del CSV.','err'); return;
  }
  const anno = Number(v('import-presidi-anno'));
  if (!Number.isInteger(anno) || anno < 2020 || anno > 2100) { input.value='';toast('Anno non valido.','err');return; }
  const versione = importSediPresidi.versione;
  try {
    const testo = await file.text();
    if (versione !== importSediPresidi.versione) return;
    await preparaImportPresidi(testo);
  } catch(e) {toast('Errore lettura CSV: '+e.message,'err');}
}

async function preparaImportPresidiPerSede(testo) {

    const annoManutenzione = Number.parseInt(
    v('import-presidi-anno'),
    10
  );

  const cicloManutenzione = v('import-presidi-ciclo');
  const gruppoTipo = v('import-presidi-tipo');

const tipiAmmessiPerGruppo = {
  porte: ['porta_rei', 'uscita_emergenza'],
  porta_rei: ['porta_rei'],
  uscita_emergenza: ['uscita_emergenza'],
  estintore: ['estintore'],
  manichetta: ['manichetta'],
  naspo: ['naspo'],
  evacuatore_fumi: ['evacuatore_fumi'],
  idrante: ['idrante']
};

const tipiAmmessi = tipiAmmessiPerGruppo[gruppoTipo];

if (!tipiAmmessi) {
  toast('Seleziona la tipologia del CSV prima di caricare il file.', 'err');
  return;
}
  const clienteScelto = v('import-presidi-cliente');
  const sedeScelta = v('import-presidi-sede');
  const versione = importSediPresidi.versione;
  if (!clienteScelto || !sedeScelta) { toast('Seleziona cliente e sede prima del CSV.','err'); return; }
  const {data:sede,error:erroreSede} = await db.from('sedi_cliente').select('id,cliente_id').eq('id',sedeScelta).eq('cliente_id',clienteScelto).single();
  if (versione !== importSediPresidi.versione) return;
  if (erroreSede || !sede) { toast('La sede non appartiene al cliente selezionato.','err'); return; }
  const righeCsv = leggiCsvImportPresidi(testo);

  if (righeCsv.length < 2) {
    toast('Il file deve contenere intestazione e almeno una riga', 'err');
    return;
  }

  const intestazioni = righeCsv[0].map(pulisciImportPresidi);

  const obbligatorie = ['cliente', 'tipo', 'matricola'];
  const mancanti = obbligatorie.filter(function(nome) {
    return !intestazioni.includes(nome);
  });

  if (mancanti.length) {
    toast(
      'Colonne mancanti nel CSV: ' + mancanti.join(', '),
      'err'
    );
    return;
  }

  const datiCsv = righeCsv
    .slice(1)
    .map(function(celle, indice) {
      const riga = { numeroRiga: indice + 2 };

      intestazioni.forEach(function(intestazione, posizione) {
        riga[intestazione] = (celle[posizione] || '').trim();
      });

      return riga;
    })
    .filter(function(riga) {
      return Object.keys(riga).some(function(chiave) {
        return chiave !== 'numeroRiga' && riga[chiave];
      });
    });

  ge('import-presidi-riepilogo').textContent =
    'Controllo ' + datiCsv.length + ' righe...';

  const { data: clienti, error: erroreClienti } = await db
    .from('clienti')
    .select('id,ragione_sociale,piva')
    .is('eliminato_il', null);

  if (erroreClienti) {
    toast('Errore caricamento clienti: ' + erroreClienti.message, 'err');
    return;
  }

  const { data: esistenti, error: errorePresidi } = await db
    .from('impianti')
   .select('id,cliente_id,sede_id,tipo,matricola,ubicazione,numero_progressivo,modello')
    .is('eliminato_il', null);

  if (errorePresidi) {
    toast('Errore controllo presidi esistenti: ' + errorePresidi.message, 'err');
    return;
  }

  const presidiPerChiave = {};

  (esistenti || []).forEach(function(presidio) {
    const chiave = [
    presidio.cliente_id,
    presidio.sede_id || '',
    presidio.tipo,
    pulisciImportPresidi(presidio.matricola),
    pulisciImportPresidi(presidio.numero_progressivo),
    pulisciImportPresidi(presidio.ubicazione)
    ].join('|');

    if (!presidiPerChiave[chiave]) {
      presidiPerChiave[chiave] = [];
    }

    presidiPerChiave[chiave].push(presidio);
  });

  const righeViste = new Set();

  if (versione !== importSediPresidi.versione) return;
  righeImportPresidi = datiCsv.map(function(riga) {
    const clienteDaCercare = pulisciImportPresidi(riga.cliente);
    const pivaDaCercare = pulisciPivaImport(riga.piva_cliente);
    const tipo = tipoImportPresidio(riga.tipo);
    const matricola = String(riga.matricola || '').trim();
    const ubicazione = String(riga.ubicazione || '').trim();

    const risultato = {
      ...riga,
      tipoNormale: tipo,
      matricolaNormale: matricola,
      valido: false,
      azione: '',
      messaggio: '',
      clienteId: null,
      presidioEsistenteId: null,
      payload: null
    };

    if (!tipo || !matricola) {
      risultato.messaggio =
        'Tipo e matricola sono obbligatori';
      return risultato;
    }

    if (!tipiAmmessi.includes(tipo)) {
  risultato.messaggio =
    'La tipologia della riga non corrisponde al tipo scelto nel menu';
  return risultato;
}

  let clientiCompatibili = (clienti || []).filter(cliente => cliente.id === clienteScelto);

if (pivaDaCercare) {
  clientiCompatibili = clientiCompatibili.filter(function(cliente) {
    return pulisciPivaImport(cliente.piva) === pivaDaCercare;
  });
}

    if (clientiCompatibili.length === 0) {
      risultato.messaggio = 'Cliente non trovato';
      return risultato;
    }

    if (clientiCompatibili.length > 1) {
      risultato.messaggio =
        'Cliente ambiguo: aggiungi piva_cliente nel CSV';
      return risultato;
    }

    const cliente = clientiCompatibili[0];

    const chiaveImport = [
      cliente.id,
      sedeScelta,
      tipo,
      pulisciImportPresidi(matricola),
      pulisciImportPresidi(riga.numero_progressivo),
      pulisciImportPresidi(ubicazione)
    ].join('|');

       if (righeViste.has(chiaveImport)) {
      risultato.messaggio =
        'Duplicato nel file: stessa sede, matricola, numero progressivo, tipologia e ubicazione';
      return risultato;
    }

    righeViste.add(chiaveImport);

    const trovati = presidiPerChiave[chiaveImport] || [];
    const progressivo = pulisciImportPresidi(riga.numero_progressivo);

    const stessaIdentitaBase = (esistenti || []).filter(p =>
      p.cliente_id === cliente.id &&
      p.sede_id === sedeScelta &&
      p.tipo === tipo &&
      pulisciImportPresidi(p.matricola) === pulisciImportPresidi(matricola) &&
      pulisciImportPresidi(p.ubicazione) === pulisciImportPresidi(ubicazione)
    );

    if (
      !trovati.length &&
      stessaIdentitaBase.some(p =>
        !progressivo || !pulisciImportPresidi(p.numero_progressivo)
      )
    ) {
      risultato.messaggio =
        'Numero progressivo mancante nel CSV o in un presidio già presente: verifica prima l’abbinamento per evitare cloni';
      return risultato;
    }

    const senzaSede = (esistenti || []).filter(p =>
      !p.sede_id &&
      p.cliente_id === cliente.id &&
      p.tipo === tipo &&
      pulisciImportPresidi(p.matricola) === pulisciImportPresidi(matricola) &&
      pulisciImportPresidi(p.numero_progressivo) === progressivo &&
      pulisciImportPresidi(p.ubicazione) === pulisciImportPresidi(ubicazione)
    );

    if (!trovati.length && senzaSede.length) {
      risultato.messaggio =
        'Presidio già presente senza sede: assegna prima la sede corretta dalla sua anagrafica, poi ricarica il CSV';
      return risultato;
    }


    if (trovati.length > 1) {
      risultato.messaggio =
        'Esistono già più presidi uguali: non aggiorno automaticamente';
      return risultato;
    }

    const stato = statoDaEsitoCsv(
  riga.stato || riga.esito_verifica
);

const esitoVerifica = String(
  riga.esito_verifica || ''
).trim() || null;

const vociSi = elencoVociCsv(riga.voci_x_si);
const vociNo = elencoVociCsv(riga.voci_x_no);
const vociVuote = [
  ...elencoVociCsv(riga.voci_senza_x),
  ...elencoVociCsv(riga.voci_da_verificare),
  ...elencoVociCsv(riga.voci_x_vuote)
];

const paginaPdf = Number.parseInt(riga.pagina_pdf, 10);
    const statiValidi = ['ok', 'anomalia', 'scaduto', 'fuori_servizio'];

    if (!statiValidi.includes(stato)) {
      risultato.messaggio = 'Stato non valido';
      return risultato;
    }

    const ultimaVerifica = dataImportPresidi(
  riga.ultima_verifica || riga.data_verifica
);
    const prossimaVerifica = dataImportPresidi(riga.prossima_verifica);
    const scadenzaCollaudo = dataImportPresidi(riga.scadenza_collaudo);

    if (
      ultimaVerifica === null ||
      prossimaVerifica === null ||
      scadenzaCollaudo === null
    ) {
      risultato.messaggio =
        'Data non valida: usa gg/mm/aaaa oppure aaaa-mm-gg';
      return risultato;
    }

    const periodicita = Number.parseInt(riga.periodicita_mesi, 10);

    const payloadBase = {
      cliente_id: cliente.id,
      sede_id: sedeScelta,
      tipo: tipo,
      matricola: matricola,
      numero_progressivo: String(riga.numero_progressivo || '').trim() || null,
      anno_manutenzione: annoManutenzione,
      ciclo_manutenzione: cicloManutenzione,
      marca: riga.marca || null,
      modello: riga.modello || null,
      ubicazione: riga.ubicazione || null,
      piano: riga.piano || null,
      locale: riga.locale || null,
      data_ultimo_controllo: ultimaVerifica || null,
      data_prossimo_controllo: prossimaVerifica || null,
      data_scadenza_collaudo: scadenzaCollaudo || null,
      stato: stato,
      periodicita_mesi: Number.isFinite(periodicita) ? periodicita : 6,
      esito_verifica: esitoVerifica,
      voci_x_si: vociSi,
      voci_x_no: vociNo,
      voci_x_vuote: vociVuote,
      fonte_pdf: riga.fonte_pdf || null,
      pagina_pdf: Number.isInteger(paginaPdf) ? paginaPdf : null,
      note: riga.note || null
    };

    risultato.clienteId = cliente.id;
    risultato.payload = payloadBase;
    risultato.valido = true;

    if (trovati.length === 1) {
      risultato.azione = 'Aggiorna';
      risultato.presidioEsistenteId = trovati[0].id;
      risultato.messaggio = 'Presidio già presente';
    } else {
      risultato.azione = 'Crea';
      risultato.messaggio = 'Nuovo presidio';
    }

    return risultato;
  });

  righeImportPresidi.forEach(r => {
    if (!r.valido) return;
    r.azione = 'Scheda semestre';
    r.messaggio = r.presidioEsistenteId ? 'Presidio della sede già presente: aggiungo lo storico senza sovrascriverlo' : 'Nuovo presidio nella sede selezionata e relativa scheda';
  });
  renderAnteprimaImportPresidi();
}


// ── Conferma normale (da js/20) ───────────────────────────────────────

// Sostituisce la conferma CSV: gli impianti esistenti NON vengono aggiornati.
async function confermaImportPresidiNormale() {
  if (!gestisceStoricoPresidi()) { toast('Importazione riservata a titolare e capo tecnico.','err'); return; }
  const valide = righeImportPresidi.filter(r => r.valido);
  if (!valide.length) { toast('Nessuna riga valida.','err'); return; }
  const ciclo = valide[0].payload.ciclo_manutenzione;
  if (!['gennaio_luglio','febbraio_agosto'].includes(ciclo)) { toast('Ciclo non valido.','err'); return; }
  const mesi = ciclo === 'gennaio_luglio' ? [1,7] : [2,8];
  const suggerito = '1';
  const risposta = prompt(`Gruppo ${nomeCicloScheda(ciclo)}. Semestre di riferimento delle schede: 1 oppure 2. La data della verifica resta quella del CSV.`,suggerito);
  if (risposta === null) return;
  const semestre = Number(risposta);
  if (![1,2].includes(semestre)) { toast('Scegli semestre 1 oppure 2.','err'); return; }
  const mese = mesi[semestre - 1];
  const clienteDest = ge('import-presidi-cliente')?.selectedOptions?.[0]?.textContent || '';
  const sedeDest = ge('import-presidi-sede')?.selectedOptions?.[0]?.textContent || '';
  if (!confirm(`${clienteDest}${sedeDest ? ' → '+sedeDest : ''}\nImportare ${valide.length} schede nel ${semestre}° semestre, gruppo ${nomeCicloScheda(ciclo)}? I periodi già presenti verranno saltati, senza sovrascriverli.`)) return;
  const bottone = ge('import-presidi-conferma');
  if (bottone.disabled) return;
  bottone.disabled = true;
  let inserite = 0, saltate = 0;
  const errori = [];
  const creati = new Map();
  try {
    for (const r of valide) {
      try {
        let id = r.presidioEsistenteId;
                const chiave = JSON.stringify([
          r.payload.cliente_id,
          r.payload.sede_id || '',
          r.payload.tipo,
          pulisciImportPresidi(r.payload.matricola),
          pulisciImportPresidi(r.payload.numero_progressivo),
          pulisciImportPresidi(r.payload.ubicazione)
        ]);
        if (!id) id = creati.get(chiave);
        if (!id) {
          const {data,error} = await db.from('impianti').insert(r.payload).select('id').single();
          if (error) throw error;
          id = data.id; creati.set(chiave,id);
          // Consente di riprovare questa anteprima senza ricreare il presidio.
          r.presidioEsistenteId = id;
        }
        const {error} = await db.from('schede_presidi').insert({
          impianto_id:id, anno:Number(r.payload.anno_manutenzione), mese,
          ciclo:r.payload.ciclo_manutenzione, dati:r.payload
        });
        if (error?.code === '23505') { saltate++; continue; }
        if (error) throw error;
        inserite++;
      } catch (e) { errori.push(`Riga ${r.numeroRiga}: ${e.message}`); }
    }
    ge('import-presidi-riepilogo').textContent = `Schede inserite: ${inserite}. Periodi già presenti: ${saltate}. ${errori.join(' · ')}`;
    toast(errori.length ? 'Importazione con errori: leggi il riepilogo.' : 'Importazione completata.',errori.length ? 'err' : 'ok');
    await loadPresidi();
  } finally { bottone.disabled = false; }
}

// ── Manichette, naspi, estintori (da js/22) ───────────────────────────

// Anteprima dell'import: aggiustamenti per tipo dopo preparaImportPresidiPerSede.
// L'anno e i campi non compilati del CSV vengono conservati anche nello snapshot storico.
function sistemaManichetteImportPresidi() {
  righeImportPresidi.forEach(r => {
    if (!r.valido || r.payload?.tipo !== 'manichetta') return;
    try {
      r.payload.periodicita_mesi = null;
      r.payload.data_prossimo_controllo = null;
      delete r.payload.anno_manutenzione;delete r.payload.ciclo_manutenzione;
      r.payload.anno_scadenza = annoScadenzaManichetta(r.anno_scadenza);
      // Conserva lo stato descrittivo del documento nel campo testuale.
const statoDocumento = String(r.stato_documento || '').trim();

if (statoDocumento) {
  r.payload.esito_verifica = statoDocumento;
}
      if (r.payload.anno_scadenza && r.payload.data_scadenza_collaudo &&
          r.payload.anno_scadenza !== Number(r.payload.data_scadenza_collaudo.slice(0,4))) {
        throw new Error('Anno di scadenza e data collaudo non coincidono.');
      }
      if (!String(r.stato || '').trim() && !String(r.esito_verifica || '').trim()) r.payload.stato = null;
    } catch(e) { r.valido=false;r.messaggio=e.message; }
  });
}

// Lettura del file: le sole manichette non chiedono il semestre.
async function leggiFileImportPresidi(input) {
  const file = input.files?.[0];
  if (!file) return;
  const versione = importSediPresidi.versione;
  try {
    const testo = await file.text();
    if (versione !== importSediPresidi.versione) return;
    const csv = leggiCsvImportPresidi(testo);
    const indiceTipo = (csv[0] || []).findIndex(v => String(v).replace(/^\uFEFF/,'').trim().toLowerCase() === 'tipo');
    const righe = csv.slice(1).filter(r => r.some(v => String(v).trim()));
    const soloManichette = indiceTipo >= 0 && righe.length && righe.every(r => tipoImportPresidio(r[indiceTipo]) === 'manichetta');
    if (!soloManichette) return leggiFileImportPresidiSemestre(input);
    if (!v('import-presidi-cliente') || !v('import-presidi-sede')) {
      input.value='';toast('Seleziona cliente e sede. Per le manichette non serve il semestre.','err');return;
    }
    await preparaImportPresidi(testo);
  } catch(e) {toast('Errore CSV: '+e.message,'err');}
}

// Conferma delle manichette (schede_manichette, semestre di riferimento chiesto).
async function confermaManichetteImportPresidi() {
  const righe = righeImportPresidi.filter(r => r.valido);
  if (!righe.length) {toast('Nessuna riga valida.','err');return;}
  if (!righe.some(r => r.payload.tipo === 'manichetta')) return confermaImportPresidiNormale();
  if (!righe.every(r => r.payload.tipo === 'manichetta')) {toast('Importa le manichette in un CSV separato dagli altri presidi.','err');return;}
  if (!gestisceStoricoPresidi()) {toast('Importazione riservata a capo tecnico e titolare.','err');return;}
  const cliente = ge('import-presidi-cliente')?.selectedOptions?.[0]?.textContent || '';
  const sede = ge('import-presidi-sede')?.selectedOptions?.[0]?.textContent || '';
  const riferimento = chiediRiferimentoManichette();
  if (!riferimento) return;
 righe.forEach(function(r) {
  r.datiSchedaManichetta = {
    ...r.payload,
    ...riferimento
  };
});
  if (!confirm(`Importare ${righe.length} manichette in ${cliente} → ${sede}? Le scadenze restano individuali. Le schede verranno registrate nel semestre scelto.`)) return;
  const bottone = ge('import-presidi-conferma');
  if (bottone.disabled) return;
  bottone.disabled=true;
  let inserite=0,saltate=0;const errori=[];
  try {
    for (const r of righe) {
      try {
        let id=r.presidioEsistenteId;
        if (!id) {
          const {data,error}=await db.from('impianti').insert(r.payload).select('id').single();
          if (error) throw error;
          id=data.id;r.presidioEsistenteId=id;
        }
        const {error}=await db.from('schede_manichette').insert({
        impianto_id: id,
data_intervento: r.datiSchedaManichetta.data_ultimo_controllo || null,
chiave_import: 'csv:' + JSON.stringify(r.datiSchedaManichetta),
dati: r.datiSchedaManichetta
        });
        if (error?.code==='23505') {saltate++;continue;}
        if (error) throw error;
        inserite++;
      } catch(e) {errori.push(`Riga ${r.numeroRiga}: ${e.message}`);}
    }
    ge('import-presidi-riepilogo').textContent=`Schede inserite: ${inserite}; già presenti: ${saltate}. ${errori.join(' · ')}`;
    toast(errori.length ? 'Importazione con errori: leggi il riepilogo.' : 'Manichette importate nel semestre scelto.',errori.length ? 'err':'ok');
    await loadPresidi();
  } finally {bottone.disabled=false;}
}
// Naspi: anno di scadenza; senza manutenzione nel periodo "Non assegnato".
function sistemaNaspiImportPresidi() {
  righeImportPresidi.forEach(function(riga) {
    if (!riga.valido || riga.payload?.tipo !== 'naspo') return;

    const annoTesto = String(riga.anno_scadenza || '').trim();

    if (annoTesto && !/^\d{4}$/.test(annoTesto)) {
      riga.valido = false;
      riga.messaggio = 'Anno scadenza naspo non valido';
      return;
    }

    riga.payload.anno_scadenza = annoTesto
      ? Number(annoTesto)
      : null;

    const senzaControllo =
      !riga.payload.data_ultimo_controllo &&
      !String(riga.stato || '').trim() &&
      !String(riga.esito_verifica || '').trim();

    if (senzaControllo) {
      riga.payload.anno_manutenzione = null;
      riga.payload.ciclo_manutenzione = 'non_assegnato';
      riga.payload.periodicita_mesi = null;
      riga.payload.data_prossimo_controllo = null;
      riga.payload.stato = null;
      riga.azione = 'Naspo non assegnato';
      riga.messaggio =
        'Nessuna manutenzione indicata: inserito nel periodo Non assegnato';
    }
  });
}

// Conferma dei soli naspi "Non assegnato": solo anagrafica, nessuna scheda.
async function confermaNaspiNonAssegnatiImportPresidi() {
  const valide = righeImportPresidi.filter(function(riga) {
    return riga.valido;
  });

  const soloNaspiNonAssegnati =
    valide.length > 0 &&
    valide.every(function(riga) {
      return (
        riga.payload?.tipo === 'naspo' &&
        riga.payload?.ciclo_manutenzione === 'non_assegnato'
      );
    });

  if (!soloNaspiNonAssegnati) {
    return confermaManichetteImportPresidi();
  }

  if (!gestisceStoricoPresidi()) {
    toast('Importazione riservata a titolare e capo tecnico.', 'err');
    return;
  }

  if (!confirm(
    `Importare ${valide.length} naspi nel periodo Non assegnato?`
  )) {
    return;
  }

  const bottone = ge('import-presidi-conferma');
  bottone.disabled = true;

  let creati = 0;
  let giaPresenti = 0;
  const errori = [];

  for (const riga of valide) {
    try {
      if (riga.presidioEsistenteId) {
        giaPresenti++;
        continue;
      }

      const { error } = await db
        .from('impianti')
        .insert(riga.payload);

      if (error) throw error;

      creati++;
    } catch (errore) {
      errori.push(`Riga ${riga.numeroRiga}: ${errore.message}`);
    }
  }

  bottone.disabled = false;

  ge('import-presidi-riepilogo').textContent =
    `Naspi inseriti: ${creati}. ` +
    `Già presenti: ${giaPresenti}. ` +
    errori.join(' · ');

  if (!errori.length) {
    closeM('m-import-presidi');
    toast('Naspi importati nel periodo Non assegnato.', 'ok');
  } else {
    toast('Importazione completata con alcuni errori.', 'err');
  }

  await loadPresidi();

}
// ── Estintori: import nelle normali schede semestrali ──

function annoDaCsvEstintore(valore, etichetta) {
  const testo = String(valore || '').trim();

  if (!testo) return null;

  if (!/^\d{4}$/.test(testo)) {
    throw new Error(etichetta + ' non valido: usa un anno di quattro cifre');
  }

  return Number(testo);
}

// Estintori in sola anagrafica (anni di revisione/collaudo, mese): scheda semestre senza controllo.
function sistemaEstintoriImportPresidi() {
  righeImportPresidi.forEach(function(riga) {
    const eAnagraficaEstintore =
      riga.valido &&
      riga.payload?.tipo === 'estintore' &&
      (
        String(riga.anno_pross_ric || '').trim() ||
        String(riga.anno_scadenza_collaudo || '').trim() ||
        String(riga.manutenzione_mese || '').trim()
      ) &&
      !String(riga.data_verifica || riga.ultima_verifica || '').trim();

    if (!eAnagraficaEstintore) return;

    try {
      const annoRevisione = annoDaCsvEstintore(
        riga.anno_pross_ric,
        'Anno prossima revisione'
      );

      const annoCollaudo = annoDaCsvEstintore(
        riga.anno_scadenza_collaudo,
        'Anno scadenza collaudo'
      );

      const note = [
        riga.note || '',
        annoRevisione ? 'Prossima revisione: ' + annoRevisione : '',
        annoCollaudo ? 'Scadenza collaudo: ' + annoCollaudo : '',
        riga.targa ? 'Targa: ' + riga.targa : '',
        riga.manutenzione_mese
          ? 'Mese manutenzione indicato: ' + riga.manutenzione_mese
          : '',
        riga.origine_cliente
          ? 'Origine: ' + riga.origine_cliente
          : ''
      ].filter(Boolean).join(' · ');

      // Mantiene anno e gruppo semestrale scelti nell’import.
      riga.payload.anno_scadenza = annoCollaudo;
      riga.payload.data_scadenza_collaudo = null;
      riga.payload.data_ultimo_controllo = null;
      riga.payload.data_prossimo_controllo = null;
      riga.payload.periodicita_mesi = null;
      riga.payload.stato = null;
      riga.payload.esito_verifica = null;
      riga.payload.note = note || null;

      riga.azione = 'Scheda semestre';
      riga.messaggio =
        'Anagrafica estintore: nessun controllo registrato';
    } catch (errore) {
      riga.valido = false;
      riga.messaggio = errore.message;
    }
  });
}

// ── Le due funzioni chiamate dalla finestra (index.html) ─────────────
// Anteprima: righe del file controllate per la sede scelta, poi gli
// aggiustamenti per tipo, poi un solo ridisegno.
async function preparaImportPresidi(testo) {
  await preparaImportPresidiPerSede(testo);
  sistemaManichetteImportPresidi();
  sistemaNaspiImportPresidi();
  sistemaEstintoriImportPresidi();
  renderAnteprimaImportPresidi();
}

// Conferma: prima i naspi senza periodo, poi le manichette, altrimenti
// confermaImportPresidiNormale (schede semestrali, impianti esistenti non
// aggiornati).
async function confermaImportPresidi() {
  return confermaNaspiNonAssegnatiImportPresidi();
}
