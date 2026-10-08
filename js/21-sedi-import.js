// Dopo 20-storico-presidi.js e prima di 19-init.js.
const importSediPresidi = {versione:0};
function invalidaImportPresidiSede() {
  importSediPresidi.versione++;
  righeImportPresidi = [];
  ge('import-presidi-file').value = '';
  ge('import-presidi-conferma').disabled = true;
  ge('import-presidi-righe').innerHTML = '';
  ge('import-presidi-riepilogo').textContent = 'Seleziona cliente e sede, poi carica il CSV.';
}
const apriImportPresidiPrimaSedi = apriImportPresidi;
apriImportPresidi = async function() {
  if (!gestisceStoricoPresidi()) { toast('Importazione riservata a titolare e capo tecnico.','err'); return; }
  apriImportPresidiPrimaSedi();
  if (!ge('import-presidi-destinazione')) {
    ge('import-presidi-file').parentElement.insertAdjacentHTML('beforebegin',`
      <div id="import-presidi-destinazione" class="card">
        <div class="f"><label>Cliente destinatario di tutto il CSV</label><select id="import-presidi-cliente"><option value="">Seleziona cliente...</option></select></div>
        <div class="f"><label>Sede destinataria di tutto il CSV</label><select id="import-presidi-sede" disabled><option value="">Seleziona prima il cliente...</option></select></div>
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
  invalidaImportPresidiSede();
  const versione = importSediPresidi.versione;
  const {data,error} = await db.from('clienti').select('id,ragione_sociale,piva').is('eliminato_il',null).order('ragione_sociale');
  if (versione !== importSediPresidi.versione) return;
  if (error) { toast('Errore clienti: '+error.message,'err'); return; }
  ge('import-presidi-cliente').innerHTML = '<option value="">Seleziona cliente...</option>'+(data || []).map(c => `<option value="${esc(c.id)}">${esc(c.ragione_sociale)}${c.piva ? ' · '+esc(c.piva) : ''}</option>`).join('');
  ge('import-presidi-cliente').disabled = false;
};
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
leggiFileImportPresidi = async function(input) {
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
};
preparaImportPresidi = preparaImportPresidiPerSede;

async function preparaImportPresidiPerSede(testo) {

    const annoManutenzione = Number.parseInt(
    v('import-presidi-anno'),
    10
  );

  const cicloManutenzione = v('import-presidi-ciclo');
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
    .select('id,cliente_id,sede_id,tipo,matricola,ubicazione')
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
      pulisciImportPresidi(ubicazione)
    ].join('|');

    if (righeViste.has(chiaveImport)) {
      risultato.messaggio =
        'Duplicato nel file: stessa matricola, cliente, tipologia e ubicazione';
      return risultato;
    }

    righeViste.add(chiaveImport);

    const trovati = presidiPerChiave[chiaveImport] || [];
    const senzaSede = (esistenti || []).filter(p => !p.sede_id && p.cliente_id === cliente.id && p.tipo === tipo &&
      pulisciImportPresidi(p.matricola) === pulisciImportPresidi(matricola) &&
      pulisciImportPresidi(p.ubicazione) === pulisciImportPresidi(ubicazione));
    if (!trovati.length && senzaSede.length) {
      risultato.messaggio = 'Presidio già presente senza sede: assegna prima la sede corretta dalla sua anagrafica, poi ricarica il CSV';
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

