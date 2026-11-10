// =====================================================================
// js/67-smistamento-famiglie.js — F15.13 Smistamento automatico per famiglia
// (decisione di Toli T2; database: sql/83-smistamento-automatico-famiglia).
//
// Con le regole di smistamento attive (almeno una regola accesa) il
// rappresentante non sceglie più tra "🔧 Invia a ufficio tecnico" e
// "📤 Invia ad Acquisti": c'è un solo "📤 Invia il progetto" e decide il
// gestionale scheda per scheda (famiglia = lavorazione): verdi ad Acquisti
// subito, gialle all'ingegnere. La soglia "lavoro grande" è una regola che
// manda tutto il progetto all'ingegnere.
// Senza sql/83 (o con tutte le regole spente) verificaRegoleSmistamentoDisponibili
// restituisce false e js/17 lavora come prima, senza errori.
//
// Funzioni usate da js/17 e js/18:
//   verificaRegoleSmistamentoDisponibili(forza) → true/false (cache 60 s)
//   smistamentoAttivoSubito()                   → ultimo valore letto
//   regolaImportoSmistamentoAttiva()            → la regola della soglia è accesa?
//   inviaProgettoConSmistamento(progettoId)     → bottone "📤 Invia il progetto"
//   leggiSmistamentoProgetto(progettoId)        → righe di smistamento_progetto
//   aggiungiRiquadroSmistamento(box, progettoId)→ riquadro "🚦 Smistamento"
// Impostazioni (solo titolare): riquadro si-smistamento-card,
// mostraRegoleSmistamentoImpostazioni (chiamata da loadImp di js/10),
// finestre m-regola-smistamento (id rgs-), m-anteprima-smistamento (ans-),
// m-registro-smistamento (rgr-).
// =====================================================================

const SMISTAMENTO = {
  presente: null,      // null = non ancora controllato; false = senza sql/83
  attivo: false,
  regole: [],          // tutte le regole (anche spente)
  letto_il: 0
};

const TIPI_REGOLA_SMISTAMENTO = {
  importo_progetto: 'Importo stimato del progetto sopra una soglia (tutto il progetto)',
  fuori_catalogo: 'Lavorazione fuori catalogo (spenta o non presente)',
  famiglia: 'Una lavorazione va sempre all’ingegnere',
  campo: 'Condizioni sui dati della scheda o di una posizione P-xx',
  numero_posizioni: 'Più di N posizioni P-xx nella scheda'
};

const OPERATORI_SMISTAMENTO = {
  uguale: 'è uno di (separati da virgola)',
  diverso: 'non è nessuno di',
  compilato: 'è compilato',
  vuoto: 'è vuoto (o non noto)',
  maggiore: 'è maggiore di',
  minore: 'è minore di',
  contiene: 'contiene il testo',
  diverso_da_campo: 'è diverso dal campo (codice)'
};

const ESITO_SMISTAMENTO = {
  acquisti: { testo: 'ad Acquisti', classe: 'bok', icona: '🟢' },
  ingegnere: { testo: 'all’ingegnere', classe: 'bwarn', icona: '🟡' },
  verificata: { testo: 'verificata dall’ingegnere, ad Acquisti', classe: 'bok', icona: '✅' }
};

function erroreFunzioneMancante(error) {
  if (!error) return false;
  const msg = String(error.message || '') + ' ' + String(error.details || '');
  return error.code === 'PGRST202' || error.code === '42883' || error.status === 404 ||
    /could not find the function|does not exist|schema cache/i.test(msg);
}

// Regole lette (cache 60 s). Restituisce true se sql/83 c'è E almeno una regola è attiva.
async function verificaRegoleSmistamentoDisponibili(forza) {
  if (SMISTAMENTO.presente === false && !forza) return false;
  if (!forza && SMISTAMENTO.presente !== null && Date.now() - SMISTAMENTO.letto_il < 60000) {
    return SMISTAMENTO.attivo;
  }
  try {
    const { data, error } = await db.from('regole_smistamento')
      .select('id, nome, descrizione, tipo, famiglia, condizioni, soglia, attiva, ordine, modificata_da_nome, modificata_il')
      .order('ordine').order('id');
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205' || /regole_smistamento/.test(error.message || '')) {
        SMISTAMENTO.presente = false;
        SMISTAMENTO.attivo = false;
        SMISTAMENTO.regole = [];
      }
      return SMISTAMENTO.attivo; // errore di rete: resta l'ultimo valore
    }
    SMISTAMENTO.presente = true;
    SMISTAMENTO.regole = data || [];
    SMISTAMENTO.attivo = SMISTAMENTO.regole.some(function(r) { return r.attiva; });
    SMISTAMENTO.letto_il = Date.now();
    return SMISTAMENTO.attivo;
  } catch (e) {
    return SMISTAMENTO.attivo;
  }
}

function smistamentoAttivoSubito() {
  return SMISTAMENTO.presente === true && SMISTAMENTO.attivo === true;
}

function regolaImportoSmistamentoAttiva() {
  return smistamentoAttivoSubito() && SMISTAMENTO.regole.some(function(r) {
    return r.attiva && r.tipo === 'importo_progetto';
  });
}

// Soglia della regola "lavoro grande" (vuota = soglia delle Regole, poi 30.000 €)
function sogliaRegolaImportoSmistamento() {
  const r = SMISTAMENTO.regole.find(function(x) { return x.attiva && x.tipo === 'importo_progetto'; });
  if (!r) return null;
  if (r.soglia !== null && r.soglia !== undefined && r.soglia !== '') return Number(r.soglia);
  const s = typeof sogliaLavoroGrande === 'function' ? sogliaLavoroGrande() : null;
  return s === null || s === undefined ? 30000 : s;
}

function etichettaSchedaSmistamento(r) {
  if (!r.famiglia && !r.scheda_id) return 'Progetto senza schede di rilievo';
  let t = r.lavorazione || (typeof etichettaFamigliaTecnica === 'function' ? etichettaFamigliaTecnica(r.famiglia) : r.famiglia);
  if (r.numero && r.numero > 1) t += ' – scheda ' + r.numero;
  if (r.nome_scheda) t += ' (' + r.nome_scheda + ')';
  return t;
}

// Testo dell'anteprima: una riga per scheda con la destinazione e i motivi
function testoAnteprimaSmistamento(righe) {
  return (righe || []).map(function(r) {
    const e = ESITO_SMISTAMENTO[r.esito] || { icona: '•', testo: r.esito };
    return e.icona + ' ' + etichettaSchedaSmistamento(r) + ' → ' + e.testo +
      (r.motivi && r.motivi.length ? '\n     perché: ' + r.motivi.join('; ') : '');
  }).join('\n');
}

// ── Invio del progetto (rappresentante e titolare) ──────────────────────
async function inviaProgettoConSmistamento(progettoId) {
  if (!(await verificaRegoleSmistamentoDisponibili(true))) {
    toast('Lo smistamento automatico non è attivo: riapri il progetto', 'err');
    if (typeof loadPaginaProgetti === 'function') loadPaginaProgetti();
    return;
  }
  // stessi controlli dei due invii di prima (js/56: fonti, dati del prezzo, foto e video)
  if (typeof controllaFontiPrimaDellInvio === 'function' && !(await controllaFontiPrimaDellInvio(progettoId))) return;
  if (typeof controllaDatiPrimaDellInvio === 'function' && !(await controllaDatiPrimaDellInvio(progettoId))) return;
  if (typeof controllaFotoVideoPrimaDellInvio === 'function' && !(await controllaFotoVideoPrimaDellInvio(progettoId))) return;

  const { data: allegati, error: erroreAllegati } = await db
    .from('progetti_tecnici_allegati').select('id').eq('progetto_id', progettoId).limit(1);
  if (erroreAllegati) { toast('Errore verifica allegati: ' + erroreAllegati.message, 'err'); return; }
  if (!allegati || !allegati.length) { toast('Non puoi inviare un progetto senza almeno un allegato', 'err'); return; }

  const { data: anteprima, error: erroreAnteprima } = await db.rpc('anteprima_smistamento', { p_progetto: progettoId });
  if (erroreAnteprima) { toast('Errore nello smistamento: ' + erroreAnteprima.message, 'err'); return; }
  const righe = anteprima || [];
  const gialle = righe.filter(function(r) { return r.esito === 'ingegnere'; }).length;
  const verdi = righe.filter(function(r) { return r.esito === 'acquisti' && r.scheda_id; }).length;
  const riepilogo = gialle === 0
    ? 'Tutte le schede vanno subito ad Acquisti per il preventivo.'
    : verdi === 0
      ? 'Il progetto va all’ingegnere per la verifica tecnica.'
      : verdi + (verdi === 1 ? ' scheda va' : ' schede vanno') + ' subito ad Acquisti, ' + gialle +
        (gialle === 1 ? ' va' : ' vanno') + ' all’ingegnere. Il preventivo resta uno solo.';
  if (!confirm('📤 Inviare il progetto?\n\nDove va ogni scheda (lo decide il gestionale con le regole di smistamento):\n\n' +
      testoAnteprimaSmistamento(righe) + '\n\n' + riepilogo + '\nDopo l’invio non sarà più una bozza.')) {
    return;
  }

  const { data, error } = await db.rpc('smista_progetto', { p_progetto: progettoId });
  if (error) {
    const testo = typeof testoErroreSchedaMotore === 'function' ? testoErroreSchedaMotore(error) : error.message;
    toast('Invio non riuscito: ' + testo, 'err');
    return;
  }
  toast(data && data.stato === 'inviato_a_commerciale'
    ? 'Progetto inviato ad Acquisti'
    : (data && data.verdi > 0 ? 'Progetto inviato: ' + data.verdi + ' ad Acquisti, ' + data.gialle + ' all’ingegnere' : 'Progetto inviato all’ingegnere'), 'ok');

  if (typeof currentCliId !== 'undefined' && currentCliId && typeof loadProgettiCliente === 'function') await loadProgettiCliente(currentCliId);
  if (typeof loadPaginaProgetti === 'function') await loadPaginaProgetti();
  if (typeof currentProgettoTecnicoId !== 'undefined' && currentProgettoTecnicoId === progettoId &&
      ge('pg-progetto-detail') && ge('pg-progetto-detail').classList.contains('on') &&
      typeof openProgettoDetail === 'function') {
    await openProgettoDetail(progettoId);
  }
}

// ── Stato dello smistamento di un progetto ──────────────────────────────
async function leggiSmistamentoProgetto(progettoId) {
  if (SMISTAMENTO.presente === false || !progettoId) return null;
  const { data, error } = await db.rpc('smistamento_progetto', { p_progetto: progettoId });
  if (error) {
    if (erroreFunzioneMancante(error)) SMISTAMENTO.presente = false;
    return null;
  }
  return data || [];
}

function htmlRigheSmistamento(righe) {
  return righe.map(function(r) {
    const e = ESITO_SMISTAMENTO[r.stato_smistamento] || null;
    return '<div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;margin:4px 0">' +
      (e ? '<span class="bx ' + e.classe + '">' + e.icona + ' ' + esc(e.testo) + '</span>'
         : '<span class="bx bgray">non smistata</span>') +
      '<span style="font-size:13px"><b>' + esc(etichettaSchedaSmistamento(r)) + '</b>' +
      (r.motivo ? '<br><span style="font-size:12px;color:var(--m)">' + esc(r.motivo) + '</span>' : '') +
      '</span></div>';
  }).join('');
}

// Riquadro "🚦 Smistamento" in cima a un elenco di schede (scheda progetto, preventivo)
async function aggiungiRiquadroSmistamento(box, progettoId) {
  if (!box || !progettoId || SMISTAMENTO.presente === false) return;
  const righe = await leggiSmistamentoProgetto(progettoId);
  if (!righe || !righe.some(function(r) { return r.stato_smistamento; })) return;
  const vecchio = box.querySelector('.smistamento-riquadro');
  if (vecchio) vecchio.remove();
  const gialle = righe.filter(function(r) { return r.stato_smistamento === 'ingegnere'; });
  const div = document.createElement('div');
  div.className = 'al2 i smistamento-riquadro';
  div.style.marginBottom = '14px';
  div.innerHTML = '<b>🚦 Smistamento automatico delle schede</b>' + htmlRigheSmistamento(righe) +
    (gialle.length && ROLE === 'commerciale'
      ? '<div style="font-size:12px;margin-top:6px">Le schede gialle le vedi quando l’ingegnere le ha verificate (ti arriva l’avviso 🔔). Il preventivo resta uno solo.</div>'
      : '');
  box.insertBefore(div, box.firstChild);
}

// ── Impostazioni: Regole di smistamento (solo titolare) ─────────────────
async function mostraRegoleSmistamentoImpostazioni() {
  const card = ge('si-smistamento-card');
  if (!card) return;
  if (ROLE !== 'titolare') { card.style.display = 'none'; return; }
  card.style.display = '';
  const stato = ge('si-smistamento-stato');
  const elenco = ge('si-smistamento-elenco');
  const azioni = ge('si-smistamento-azioni');
  await verificaRegoleSmistamentoDisponibili(true);
  if (!SMISTAMENTO.presente) {
    stato.className = 'al2 i';
    stato.textContent = 'Lo smistamento automatico non è ancora attivo: serve l’aggiornamento del database (sql/83). Intanto il rappresentante sceglie come oggi tra “Invia a ufficio tecnico” e “Invia ad Acquisti”.';
    elenco.innerHTML = '';
    azioni.style.display = 'none';
    return;
  }
  azioni.style.display = '';
  const attive = SMISTAMENTO.regole.filter(function(r) { return r.attiva; }).length;
  stato.className = attive ? 'al2 i' : 'al2 w';
  stato.innerHTML = attive
    ? '<b>' + attive + '</b> regole attive su ' + SMISTAMENTO.regole.length + ': i progetti si inviano con <b>📤 Invia il progetto</b> e decide il gestionale.'
    : 'Tutte le regole sono spente: il rappresentante sceglie come prima tra <b>🔧 Invia a ufficio tecnico</b> e <b>📤 Invia ad Acquisti</b>.';
  if (!SMISTAMENTO.regole.length) { elenco.innerHTML = '<div class="empty">Nessuna regola.</div>'; return; }
  elenco.innerHTML = SMISTAMENTO.regole.map(function(r) {
    return '<div class="card" style="margin:8px 0;padding:10px;' + (r.attiva ? '' : 'opacity:.65') + '">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start">' +
        '<div style="min-width:0;flex:1"><div style="font-weight:600;font-size:13px">' +
          (r.attiva ? '🟡 ' : '⏸ ') + esc(r.nome) + '</div>' +
          '<div style="font-size:12px;color:var(--m);margin-top:2px">' + esc(descrizioneRegolaSmistamento(r)) + '</div>' +
          (r.descrizione ? '<div style="font-size:12px;margin-top:2px">' + esc(r.descrizione) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button class="btn sm" type="button" onclick="apriRegolaSmistamento(' + r.id + ')">✏️ Modifica</button>' +
          (r.attiva
            ? '<button class="btn sm" type="button" onclick="cambiaAttivaRegolaSmistamento(' + r.id + ', false)">⏸ Disattiva</button>'
            : '<button class="btn sm" type="button" onclick="cambiaAttivaRegolaSmistamento(' + r.id + ', true)">▶️ Riattiva</button>') +
        '</div>' +
      '</div></div>';
  }).join('');
}

function nomeLavorazioneSmistamento(codice) {
  if (!codice) return '';
  if (typeof nomeLavorazioneCatalogo === 'function') {
    const n = nomeLavorazioneCatalogo(codice);
    if (n) return n;
  }
  return typeof etichettaFamigliaTecnica === 'function' ? etichettaFamigliaTecnica(codice) : codice;
}

function descrizioneRegolaSmistamento(r) {
  if (r.tipo === 'importo_progetto') {
    const s = r.soglia !== null && r.soglia !== undefined && r.soglia !== ''
      ? Number(r.soglia) : (typeof sogliaLavoroGrande === 'function' && sogliaLavoroGrande() !== null ? sogliaLavoroGrande() : 30000);
    return 'Importo stimato oltre ' + Number(s).toLocaleString('it-IT') + ' €' +
      (r.soglia === null || r.soglia === undefined || r.soglia === '' ? ' (soglia “lavoro grande” delle Regole)' : '') + ': tutto il progetto all’ingegnere';
  }
  if (r.tipo === 'fuori_catalogo') return 'Scheda di una lavorazione spenta o non nel catalogo';
  if (r.tipo === 'famiglia') return nomeLavorazioneSmistamento(r.famiglia) + ': sempre all’ingegnere';
  if (r.tipo === 'numero_posizioni') return nomeLavorazioneSmistamento(r.famiglia) + ': più di ' + r.soglia + ' posizioni P-xx';
  const cond = (r.condizioni || []).map(function(c) {
    return c.campo + ' ' + (OPERATORI_SMISTAMENTO[c.operatore] || c.operatore) + (c.valore ? ' «' + c.valore + '»' : '');
  }).join(' e ');
  return (r.famiglia ? nomeLavorazioneSmistamento(r.famiglia) : 'Ogni lavorazione') + ': ' + cond;
}

async function cambiaAttivaRegolaSmistamento(id, attiva) {
  const r = SMISTAMENTO.regole.find(function(x) { return x.id === id; });
  if (!r) return;
  let nota = '';
  if (!attiva) {
    nota = prompt('Disattivare «' + r.nome + '»? Le schede che questa regola mandava all’ingegnere andranno ad Acquisti.\n\nMotivo (facoltativo, resta nel registro):', '');
    if (nota === null) return;
  }
  const regola = datiRegolaSmistamento(r);
  regola.attiva = attiva;
  const { error } = await db.rpc('salva_regola_smistamento', { p_id: id, p_regola: regola, p_nota: nota || null });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast(attiva ? 'Regola riattivata' : 'Regola disattivata', 'ok');
  await mostraRegoleSmistamentoImpostazioni();
}

function datiRegolaSmistamento(r) {
  return {
    nome: r.nome, descrizione: r.descrizione || null, tipo: r.tipo, famiglia: r.famiglia || null,
    condizioni: r.condizioni || [], soglia: r.soglia === undefined ? null : r.soglia,
    attiva: r.attiva !== false, ordine: r.ordine === undefined || r.ordine === null ? 100 : r.ordine
  };
}

// ── Finestra della regola ──────────────────────────────────────────────
async function apriRegolaSmistamento(id) {
  if (ROLE !== 'titolare') { toast('Le regole di smistamento le cambia solo il titolare', 'err'); return; }
  if (typeof caricaCatalogoLavorazioni === 'function') {
    try { await caricaCatalogoLavorazioni(); } catch (e) { /* senza catalogo: codici scritti a mano */ }
  }
  const r = id ? SMISTAMENTO.regole.find(function(x) { return x.id === id; }) : null;
  ge('rgs-id').value = r ? r.id : '';
  ge('rgs-titolo').textContent = r ? '✏️ Modifica la regola' : '➕ Nuova regola di smistamento';
  ge('rgs-nome').value = r ? r.nome : '';
  ge('rgs-descrizione').value = r && r.descrizione ? r.descrizione : '';
  ge('rgs-tipo').innerHTML = Object.keys(TIPI_REGOLA_SMISTAMENTO).map(function(k) {
    return '<option value="' + k + '">' + esc(TIPI_REGOLA_SMISTAMENTO[k]) + '</option>';
  }).join('');
  ge('rgs-tipo').value = r ? r.tipo : 'campo';
  riempiLavorazioniRegolaSmistamento(r ? r.famiglia : '');
  ge('rgs-soglia').value = r && r.soglia !== null && r.soglia !== undefined ? String(r.soglia).replace('.', ',') : '';
  ge('rgs-attiva').checked = r ? r.attiva !== false : true;
  ge('rgs-ordine').value = r ? r.ordine : 100;
  ge('rgs-nota').value = '';
  ge('rgs-condizioni').innerHTML = '';
  ((r && r.condizioni) || []).forEach(function(c) { aggiungiCondizioneRegolaSmistamento(c); });
  if (!ge('rgs-condizioni').children.length) aggiungiCondizioneRegolaSmistamento();
  aggiornaTipoRegolaSmistamento();
  openM('m-regola-smistamento');
}

function lavorazioniCatalogoSmistamento() {
  if (typeof CATALOGO_LAV !== 'undefined' && CATALOGO_LAV && CATALOGO_LAV.disponibili) {
    return CATALOGO_LAV.lavorazioni.filter(function(l) { return l.codice !== 'comune'; });
  }
  return [];
}

function riempiLavorazioniRegolaSmistamento(scelta) {
  const lav = lavorazioniCatalogoSmistamento();
  let html = '<option value="">Ogni lavorazione</option>' + lav.map(function(l) {
    return '<option value="' + esc(l.codice) + '">' + esc(l.nome) + (l.attiva ? '' : ' (spenta)') + '</option>';
  }).join('');
  if (scelta && !lav.some(function(l) { return l.codice === scelta; })) {
    html += '<option value="' + esc(scelta) + '">' + esc(scelta) + '</option>';
  }
  ge('rgs-famiglia').innerHTML = html;
  ge('rgs-famiglia').value = scelta || '';
}

function campiLavorazioneSmistamento(codice) {
  const l = lavorazioniCatalogoSmistamento().find(function(x) { return x.codice === codice; });
  return l ? (l.lavorazioni_campi || []).filter(function(c) { return c.attivo !== false && c.tipo !== 'foto' && c.tipo !== 'elenco'; }) : [];
}

function aggiornaTipoRegolaSmistamento() {
  const tipo = v('rgs-tipo');
  ge('rgs-famiglia-box').style.display = ['famiglia', 'campo', 'numero_posizioni'].includes(tipo) ? '' : 'none';
  ge('rgs-soglia-box').style.display = ['importo_progetto', 'numero_posizioni'].includes(tipo) ? '' : 'none';
  ge('rgs-soglia-label').textContent = tipo === 'importo_progetto'
    ? 'Soglia in € (vuota = soglia “lavoro grande” delle Regole)'
    : 'Numero di posizioni oltre il quale va all’ingegnere';
  ge('rgs-condizioni-box').style.display = tipo === 'campo' ? '' : 'none';
  // i menu dei campi seguono la lavorazione scelta
  Array.from(ge('rgs-condizioni').children).forEach(function(riga) { riempiCampiCondizione(riga); });
}

function aggiungiCondizioneRegolaSmistamento(c) {
  const box = ge('rgs-condizioni');
  if (box.children.length >= 5) { toast('Al massimo 5 condizioni per regola', 'err'); return; }
  const riga = document.createElement('div');
  riga.className = 'rgs-cond';
  riga.style.cssText = 'display:flex;align-items:flex-end;gap:6px;flex-wrap:wrap;margin-bottom:6px;border-bottom:1px dashed #e5e7eb;padding-bottom:6px';
  riga.innerHTML =
    '<div class="f" style="min-width:140px;flex:1"><label>Campo</label><select class="rgs-c-campo" onchange="riempiValoriCondizione(this.closest(\'.rgs-cond\'))"></select>' +
      '<input class="rgs-c-campo-libero" placeholder="codice del campo" style="display:none;margin-top:4px"></div>' +
    '<div class="f" style="min-width:130px;flex:1"><label>Condizione</label><select class="rgs-c-op" onchange="riempiValoriCondizione(this.closest(\'.rgs-cond\'))">' +
      Object.keys(OPERATORI_SMISTAMENTO).map(function(k) { return '<option value="' + k + '">' + esc(OPERATORI_SMISTAMENTO[k]) + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="f" style="min-width:130px;flex:1"><label>Valore</label><input class="rgs-c-valore" maxlength="200" list="">' +
      '<datalist></datalist></div>' +
    '<button class="btn sm" type="button" style="flex:0 0 auto;margin-bottom:4px" title="Togli la condizione" onclick="this.closest(\'.rgs-cond\').remove()">✖</button>';
  box.appendChild(riga);
  riga.dataset.campo = c && c.campo ? c.campo : '';
  riempiCampiCondizione(riga);
  if (c) {
    riga.querySelector('.rgs-c-op').value = c.operatore || 'uguale';
    riga.querySelector('.rgs-c-valore').value = c.valore || '';
  }
  riempiValoriCondizione(riga);
}

function riempiCampiCondizione(riga) {
  const sel = riga.querySelector('.rgs-c-campo');
  const libero = riga.querySelector('.rgs-c-campo-libero');
  const attuale = sel.value || riga.dataset.campo || libero.value || '';
  const campi = campiLavorazioneSmistamento(v('rgs-famiglia'));
  let html = campi.map(function(c) {
    return '<option value="' + esc(c.codice) + '">' + esc(c.etichetta) + ' (' + esc(c.codice) + ')</option>';
  }).join('');
  html += '<option value="__libero">Altro campo (scrivi il codice)</option>';
  sel.innerHTML = html;
  if (attuale && campi.some(function(c) { return c.codice === attuale; })) {
    sel.value = attuale;
    libero.style.display = 'none';
  } else if (attuale || !campi.length) {
    sel.value = '__libero';
    libero.value = attuale && attuale !== '__libero' ? attuale : '';
    libero.style.display = '';
  }
  riga.dataset.campo = '';
}

// Per i menu del catalogo il valore si sceglie dall'elenco (codici del menu)
function riempiValoriCondizione(riga) {
  const sel = riga.querySelector('.rgs-c-campo');
  const libero = riga.querySelector('.rgs-c-campo-libero');
  libero.style.display = sel.value === '__libero' ? '' : 'none';
  const op = riga.querySelector('.rgs-c-op').value;
  const input = riga.querySelector('.rgs-c-valore');
  input.disabled = op === 'compilato' || op === 'vuoto';
  if (input.disabled) input.value = '';
  const campo = campiLavorazioneSmistamento(v('rgs-famiglia')).find(function(c) { return c.codice === sel.value; });
  const lista = riga.querySelector('datalist');
  const idLista = 'rgs-vl-' + Math.random().toString(36).slice(2, 8);
  lista.id = idLista;
  input.setAttribute('list', idLista);
  const valori = campo && Array.isArray(campo.valori_ammessi) ? campo.valori_ammessi : [];
  lista.innerHTML = valori.map(function(x) {
    return '<option value="' + esc(x.valore) + '">' + esc(x.etichetta || x.valore) + '</option>';
  }).join('');
  input.placeholder = valori.length ? 'es. ' + valori[0].valore : (op === 'maggiore' || op === 'minore' ? 'numero, es. 180' : '');
}

function regolaDallaFinestraSmistamento() {
  const tipo = v('rgs-tipo');
  const condizioni = tipo !== 'campo' ? [] : Array.from(document.querySelectorAll('#rgs-condizioni .rgs-cond')).map(function(riga) {
    const sel = riga.querySelector('.rgs-c-campo').value;
    const campo = sel === '__libero' ? riga.querySelector('.rgs-c-campo-libero').value.trim() : sel;
    return { campo: campo, operatore: riga.querySelector('.rgs-c-op').value, valore: riga.querySelector('.rgs-c-valore').value.trim() || null };
  });
  const id = v('rgs-id');
  const regola = {
    nome: v('rgs-nome').trim(),
    descrizione: v('rgs-descrizione').trim() || null,
    tipo: tipo,
    famiglia: ['famiglia', 'campo', 'numero_posizioni'].includes(tipo) ? (v('rgs-famiglia') || null) : null,
    condizioni: condizioni,
    soglia: ['importo_progetto', 'numero_posizioni'].includes(tipo) && String(v('rgs-soglia')).trim() !== ''
      ? String(v('rgs-soglia')).trim().replace(/\./g, '').replace(',', '.') : null,
    attiva: ge('rgs-attiva').checked,
    ordine: Number(v('rgs-ordine')) || 100
  };
  if (id) regola.id = Number(id);
  return regola;
}

async function salvaRegolaSmistamento() {
  const regola = regolaDallaFinestraSmistamento();
  if (regola.nome.length < 3) { toast('Scrivi il nome della regola (almeno 3 caratteri)', 'err'); return; }
  const id = regola.id || null;
  delete regola.id;
  const btn = ge('rgs-salva');
  if (btn) btn.disabled = true;
  try {
    const { error } = await db.rpc('salva_regola_smistamento', { p_id: id, p_regola: regola, p_nota: v('rgs-nota').trim() || null });
    if (error) { toast('Errore: ' + error.message, 'err'); return; }
    closeM('m-regola-smistamento');
    toast(id ? 'Regola salvata' : 'Regola aggiunta', 'ok');
    await mostraRegoleSmistamentoImpostazioni();
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Anteprima su un progetto di prova ───────────────────────────────────
// conRegola = true: prova la regola della finestra (non ancora salvata)
async function apriAnteprimaSmistamento(conRegola) {
  if (ROLE !== 'titolare') return;
  ge('ans-con-regola').value = conRegola ? '1' : '';
  ge('ans-regola-info').textContent = conRegola
    ? 'Prova della regola «' + (v('rgs-nome').trim() || 'senza nome') + '» come è scritta nella finestra (non è ancora salvata), insieme alle altre regole attive.'
    : 'Dove andrebbe ogni scheda con le regole attive adesso. Non cambia nulla: il progetto resta com’è.';
  ge('ans-esito').innerHTML = '';
  const sel = ge('ans-progetto');
  sel.innerHTML = '<option value="">Caricamento...</option>';
  openM('m-anteprima-smistamento');
  const { data, error } = await db.from('progetti_tecnici')
    .select('id, titolo, stato, importo_stimato, clienti(ragione_sociale)')
    .order('aggiornato_il', { ascending: false }).limit(200);
  if (error) { sel.innerHTML = '<option value="">Errore: ' + esc(error.message) + '</option>'; return; }
  const prova = (data || []).filter(function(p) { return /prova|test|smoke/i.test((p.titolo || '') + ' ' + (p.clienti?.ragione_sociale || '')); });
  const altri = (data || []).filter(function(p) { return prova.indexOf(p) < 0; });
  function opt(p) {
    return '<option value="' + p.id + '">' + esc((p.titolo || 'Progetto') + ' · ' + (p.clienti?.ragione_sociale || '') +
      (p.importo_stimato ? ' · ' + Number(p.importo_stimato).toLocaleString('it-IT') + ' €' : '')) + '</option>';
  }
  sel.innerHTML = '<option value="">Scegli un progetto...</option>' +
    (prova.length ? '<optgroup label="Progetti di prova">' + prova.map(opt).join('') + '</optgroup>' : '') +
    (altri.length ? '<optgroup label="Altri progetti (ultimi aggiornati)">' + altri.map(opt).join('') + '</optgroup>' : '');
}

async function eseguiAnteprimaSmistamento() {
  const progetto = v('ans-progetto');
  const box = ge('ans-esito');
  if (!progetto) { box.innerHTML = '<div class="al2 w">Scegli un progetto.</div>'; return; }
  box.innerHTML = '<div class="load">Calcolo...</div>';
  const args = { p_progetto: progetto };
  if (v('ans-con-regola')) args.p_regola_prova = regolaDallaFinestraSmistamento();
  const { data, error } = await db.rpc('anteprima_smistamento', args);
  if (error) { box.innerHTML = '<div class="al2 e">' + esc(error.message) + '</div>'; return; }
  const righe = data || [];
  const gialle = righe.filter(function(r) { return r.esito === 'ingegnere'; }).length;
  box.innerHTML = '<div style="font-size:13px;margin:8px 0"><b>' +
    (gialle === 0 ? 'Il progetto andrebbe ad Acquisti (tutte verdi).' : 'Il progetto andrebbe all’ingegnere (in verifica tecnica)' +
      (righe.some(function(r) { return r.esito === 'acquisti' && r.scheda_id; }) ? '; le schede verdi subito ad Acquisti.' : '.')) +
    '</b></div>' + htmlRigheSmistamento(righe.map(function(r) {
      return Object.assign({}, r, { stato_smistamento: r.esito, motivo: (r.motivi || []).join('; ') });
    }));
}

// ── Registro delle modifiche ──────────────────────────────────────────
async function apriRegistroSmistamento() {
  if (ROLE !== 'titolare') return;
  const box = ge('rgr-elenco');
  box.innerHTML = '<div class="load">Caricamento...</div>';
  openM('m-registro-smistamento');
  const { data, error } = await db.from('regole_smistamento_storico')
    .select('id, regola_id, azione, prima, dopo, nota, modificata_da_nome, modificata_da_ruolo, modificata_il')
    .order('modificata_il', { ascending: false }).limit(300);
  if (error) { box.innerHTML = '<div class="al2 e">' + esc(error.message) + '</div>'; return; }
  if (!data || !data.length) {
    box.innerHTML = '<div class="empty">Nessuna modifica: le regole sono quelle di partenza.</div>';
    return;
  }
  const AZ = { creata: '➕ Creata', modificata: '✏️ Modificata', disattivata: '⏸ Disattivata', riattivata: '▶️ Riattivata' };
  box.innerHTML = data.map(function(r) {
    const dopo = r.dopo || {};
    const cambi = r.prima && r.dopo ? Object.keys(dopo).filter(function(k) {
      return k !== 'id' && JSON.stringify(r.prima[k]) !== JSON.stringify(dopo[k]);
    }).map(function(k) {
      return esc(k) + ': ' + esc(valoreRegistroSmistamento(r.prima[k])) + ' → ' + esc(valoreRegistroSmistamento(dopo[k]));
    }) : [];
    const quando = new Date(r.modificata_il).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return '<div style="border-bottom:1px solid var(--b, #e5e7eb);padding:8px 0;font-size:13px">' +
      '<b>' + (AZ[r.azione] || esc(r.azione)) + '</b> «' + esc(dopo.nome || (r.prima && r.prima.nome) || ('regola ' + r.regola_id)) + '»' +
      '<div style="font-size:12px;color:var(--m)">' + esc(quando) + ' · ' + esc(r.modificata_da_nome || '—') + '</div>' +
      (cambi.length ? '<div style="font-size:12px;margin-top:3px">' + cambi.join('<br>') + '</div>' : '') +
      (r.nota ? '<div style="font-size:12px;margin-top:3px"><i>Motivo: ' + esc(r.nota) + '</i></div>' : '') +
      '</div>';
  }).join('');
}

function valoreRegistroSmistamento(x) {
  if (x === null || x === undefined || x === '') return '(vuoto)';
  if (typeof x === 'boolean') return x ? 'sì' : 'no';
  if (Array.isArray(x)) return x.map(function(c) { return c.campo + ' ' + c.operatore + (c.valore ? ' ' + c.valore : ''); }).join(' e ') || '(nessuna)';
  return String(x);
}

// Avviso "l'ingegnere ha verificato" (sql/83, trigger trg_progetti_tecnici_smistamento_dopo)
if (typeof TIPI_AVVISO !== 'undefined' && TIPI_AVVISO && !TIPI_AVVISO.smistamento_verificato) {
  TIPI_AVVISO.smistamento_verificato = { icona: '✅', nome: 'Schede verificate dall’ingegnere' };
}
