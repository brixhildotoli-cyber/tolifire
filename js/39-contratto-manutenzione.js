// =====================================================================
// F10.1 — CONTRATTO DI MANUTENZIONE E RINNOVO (Fase 10, Service).
// Il contratto vive in clienti_periodicita (durata, inizio, fine, note,
// frequenze per tipo di presidio, js/08). Con sql/40:
//   - presidi previsti dal contratto per tipo (presidi_contratto, jsonb)
//     nella griglia "Frequenza controlli" (campi perio-n-<tipo>);
//   - preventivo del contratto (preventivo_id, stesso cliente; lo
//     collegano titolare e segreteria, che leggono i preventivi e
//     scrivono il contratto);
//   - esito del rinnovo (RPC registra_rinnovo_contratto): "Rinnovato"
//     (nuovo inizio, durata, nuova fine, preventivo del rinnovo) oppure
//     "Non rinnovato" (motivo obbligatorio); storico in
//     clienti_periodicita_rinnovi. Lo registrano titolare, segreteria,
//     capo tecnico (Responsabile Service) e il rappresentante per i suoi
//     clienti.
//   - promemoria: lista "Contratti in scadenza" (contratti attivi che
//     finiscono entro impostazioni.giorni_preavviso_rinnovo giorni,
//     predefinito 60, o già scaduti) nella dashboard del rappresentante
//     (suoi clienti), del titolare (tutti) e del capo tecnico. Con
//     l'esito il contratto esce dalla lista.
// Scelta (da confermare da Toli): il "Commerciale" della roadmap è il
// ruolo rappresentante (D1), il promemoria va al rappresentante del
// cliente. Il piano interventi NON si rigenera da solo dopo il rinnovo:
// la scheda lo suggerisce a titolare e capo tecnico.
// Senza sql/40: avviso "non ancora attivo" nella scheda, nessuna lista.
// Finestra m-rinnovo-contratto (id rnc-).
// =====================================================================

const RUOLI_ESITO_RINNOVO = ['titolare', 'segreteria', 'capo_tecnico', 'rappresentante'];
const RUOLI_PREVENTIVO_CONTRATTO = ['titolare', 'segreteria'];
const RUOLI_PIANO_INTERVENTI = ['titolare', 'capo_tecnico'];
const BOX_CONTRATTI_SCADENZA = {
  rappresentante: 'rap-contratti-scadenza',
  titolare: 'tit-contratti-scadenza',
  capo_tecnico: 'ct-contratti-scadenza'
};
const ETICHETTE_STATO_PREVENTIVO_CONTRATTO = {
  bozza: 'Bozza',
  in_attesa_approvazione: 'In attesa di approvazione',
  approvato: 'Approvato',
  inviato: 'Inviato al cliente',
  inviato_a_rappresentante: 'Inviato al rappresentante',
  in_attesa_anticipo: 'In attesa dell\'anticipo',
  accettato: 'Accettato',
  rifiutato: 'Rifiutato',
  scaduto: 'Scaduto'
};

let contrattoRinnovoDisponibile = null;
const colonnePeriodicitaVerificate = {};
let contrattoRinnovoAperto = null; // { cliId, ragione, perio, esito }
const contrattiScadenzaCache = {};

// true se sql/40 è stato eseguito (colonna contratto_stato).
async function verificaContrattoRinnovoDisponibile() {
  if (contrattoRinnovoDisponibile !== null) return contrattoRinnovoDisponibile;
  const { error } = await db.from('clienti_periodicita').select('contratto_stato').limit(1);
  if (!error) {
    contrattoRinnovoDisponibile = true;
  } else if (error.code === '42703' || error.code === 'PGRST204' || /contratto_stato/i.test(error.message || '')) {
    contrattoRinnovoDisponibile = false;
  } else {
    return false;
  }
  return contrattoRinnovoDisponibile;
}

function contrattoRinnovoAttivo() {
  return contrattoRinnovoDisponibile === true;
}

// Una colonna di clienti_periodicita esiste? (evacuatore_fumi: la
// griglia la chiede, ma la colonna arriva solo con sql/40).
async function colonnaPeriodicitaEsiste(colonna) {
  if (colonnePeriodicitaVerificate[colonna] !== undefined) return colonnePeriodicitaVerificate[colonna];
  const { error } = await db.from('clienti_periodicita').select(colonna).limit(1);
  if (!error) colonnePeriodicitaVerificate[colonna] = true;
  else if (error.code === '42703' || error.code === 'PGRST204') colonnePeriodicitaVerificate[colonna] = false;
  else return true; // errore diverso: non si toglie nulla
  return colonnePeriodicitaVerificate[colonna];
}

function giorniPreavvisoRinnovo() {
  const n = (typeof IMPOSTAZIONI !== 'undefined' && IMPOSTAZIONI) ? IMPOSTAZIONI.giorni_preavviso_rinnovo : null;
  return (n === null || n === undefined || !isFinite(Number(n))) ? 60 : Number(n);
}

function puoRegistrareRinnovo() {
  return RUOLI_ESITO_RINNOVO.includes(ROLE);
}

function puoCollegarePreventivoContratto() {
  return RUOLI_PREVENTIVO_CONTRATTO.includes(ROLE);
}

function oggiContrattoISO() {
  return dataLocaleISO(new Date());
}

function giorniTraISO(daIso, aIso) {
  const a = new Date(daIso + 'T00:00:00');
  const b = new Date(aIso + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function aggiungiGiorniISO(iso, giorni) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + giorni);
  return dataLocaleISO(d);
}

// Fine contratto = inizio + 1 anno (o 5) − 1 giorno, come calcolaFineContratto.
function fineContrattoDaInizio(inizioIso, durata) {
  if (!inizioIso) return '';
  const d = new Date(inizioIso + 'T00:00:00');
  d.setFullYear(d.getFullYear() + (durata === 'quinquennale' ? 5 : 1));
  d.setDate(d.getDate() - 1);
  return dataLocaleISO(d);
}

// Scadenza del contratto rispetto a oggi e al preavviso.
function scadenzaContratto(perio) {
  if (!perio || !perio.data_fine_contratto) return null;
  const giorni = giorniTraISO(oggiContrattoISO(), perio.data_fine_contratto);
  const preavviso = giorniPreavvisoRinnovo();
  let testo, classe;
  if (giorni < 0) {
    testo = 'Scaduto da ' + Math.abs(giorni) + (Math.abs(giorni) === 1 ? ' giorno' : ' giorni');
    classe = 'berr';
  } else if (giorni === 0) {
    testo = 'Scade oggi';
    classe = 'berr';
  } else {
    testo = 'Scade tra ' + giorni + (giorni === 1 ? ' giorno' : ' giorni');
    classe = giorni <= preavviso ? 'bwarn' : 'bok';
  }
  return { giorni: giorni, testo: testo, classe: classe, inScadenza: giorni <= preavviso };
}

function testoPresidiContratto(presidi) {
  if (!presidi || typeof presidi !== 'object') return '';
  return TIPI_PRESIDI
    .filter(function(t) { return Number(presidi[t]) > 0; })
    .map(function(t) { return Number(presidi[t]) + ' ' + tpl(t).replace(/^\S+\s/, '').toLowerCase(); })
    .join(', ');
}

function testoPreventivoContratto(p) {
  if (!p) return '';
  const parti = ['n. ' + (p.numero ?? '—')];
  if (p.data_emissione) parti.push('del ' + fd(p.data_emissione));
  if (p.stato) parti.push(ETICHETTE_STATO_PREVENTIVO_CONTRATTO[p.stato] || String(p.stato).replace(/_/g, ' '));
  if (p.totale_imponibile !== null && p.totale_imponibile !== undefined) {
    parti.push(Number(p.totale_imponibile).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) + ' + IVA');
  }
  return parti.join(' · ');
}

async function preventiviDelCliente(cliId) {
  const { data, error } = await db
    .from('preventivi')
    .select('id, numero, data_emissione, stato, totale_imponibile')
    .eq('cliente_id', cliId)
    .order('data_emissione', { ascending: false })
    .limit(100);
  if (error) {
    console.warn('Preventivi del cliente:', error.message);
    return [];
  }
  return data || [];
}

// ── Scheda cliente → Periodicità ────────────────────────────────────

// Campo "N. previsti dal contratto" sotto la frequenza di ogni tipo (js/08).
function htmlPresidiContrattoTipo(tipo, perio) {
  if (!contrattoRinnovoAttivo()) return '';
  const n = perio && perio.presidi_contratto ? perio.presidi_contratto[tipo] : null;
  return `<label for="perio-n-${tipo}" style="display:block;font-size:11px;color:var(--m);margin-top:8px">N. previsti dal contratto</label>
    <input type="number" id="perio-n-${tipo}" min="0" max="100000" step="1" inputmode="numeric" value="${n !== null && n !== undefined ? esc(String(n)) : ''}" placeholder="—" style="width:100%;font-size:13px">`;
}

// Chiamata da loadPeriodicitaCliente (js/08) dopo la griglia.
async function caricaContrattoManutenzione(cliId, perio) {
  const box = ge('perio-contratto-extra');
  if (!box) return;

  if (!contrattoRinnovoAttivo()) {
    box.innerHTML = '<div style="font-size:12px;color:var(--m);margin-top:6px">Presidi previsti, preventivo del contratto e rinnovo: non ancora attivi (aggiornamento del database in attesa).</div>';
    return;
  }

  perio = perio || {};
  let htmlPreventivo = '';
  if (puoCollegarePreventivoContratto()) {
    const preventivi = await preventiviDelCliente(cliId);
    const opzioni = preventivi.map(function(p) {
      return `<option value="${esc(p.id)}"${p.id === perio.preventivo_id ? ' selected' : ''}>${esc(testoPreventivoContratto(p))}</option>`;
    }).join('');
    htmlPreventivo = `<div class="f" style="margin-top:10px"><label for="perio-preventivo">Preventivo del contratto</label>
      <select id="perio-preventivo" style="width:100%">
        <option value="">— Nessun preventivo collegato —</option>${opzioni}
      </select>
      <div style="font-size:11px;color:var(--m);margin-top:4px">${preventivi.length ? 'Si salva con "Salva periodicità".' : 'Il cliente non ha ancora preventivi.'}</div></div>`;
  } else if (perio.preventivo_id) {
    const { data: p } = await db.from('preventivi').select('id, numero, data_emissione, stato, totale_imponibile').eq('id', perio.preventivo_id).maybeSingle();
    htmlPreventivo = `<div style="font-size:13px;margin-top:10px"><b>Preventivo del contratto:</b> ${p ? esc(testoPreventivoContratto(p)) : 'collegato (non visibile per il tuo ruolo)'}</div>`;
  }

  box.innerHTML = htmlPreventivo + '<div id="perio-rinnovo-box" style="margin-top:12px"></div>';
  await caricaRinnovoContrattoScheda(cliId, perio);
}

async function caricaRinnovoContrattoScheda(cliId, perio) {
  const box = ge('perio-rinnovo-box');
  if (!box) return;

  if (!perio || !perio.id) {
    box.innerHTML = '';
    return;
  }

  const { data: storico, error } = await db
    .from('clienti_periodicita_rinnovi')
    .select('*')
    .eq('cliente_id', cliId)
    .order('registrato_il', { ascending: false })
    .limit(20);
  if (error) console.warn('Storico rinnovi:', error.message);
  const righe = storico || [];
  const ultimo = righe[0] || null;

  let stato = '';
  const scad = scadenzaContratto(perio);
  if (perio.contratto_stato === 'non_rinnovato') {
    stato = `<div class="al2 e" style="margin-bottom:8px">❌ <b>Contratto non rinnovato</b>${ultimo && ultimo.esito === 'non_rinnovato' ? ': ' + esc(ultimo.motivo || '') + ' <span style="opacity:.8">(' + esc(ultimo.registrato_da_nome || '—') + ', ' + esc(new Date(ultimo.registrato_il).toLocaleDateString('it-IT')) + ')</span>' : ''}<br><span style="font-size:12px">Se il cliente ci ripensa registra "Rinnovato".</span></div>`;
  } else if (!perio.data_fine_contratto) {
    stato = '<div style="font-size:12px;color:var(--m);margin-bottom:8px">Imposta e salva le date del contratto per il promemoria del rinnovo.</div>';
  } else if (scad) {
    const classeBox = scad.giorni < 0 ? 'e' : scad.inScadenza ? 'w' : 'ok';
    stato = `<div class="al2 ${classeBox}" style="margin-bottom:8px">📅 <b>Fine contratto ${esc(fd(perio.data_fine_contratto))}</b> · ${esc(scad.testo)}${scad.inScadenza ? '<br><span style="font-size:12px">In scadenza (preavviso ' + giorniPreavvisoRinnovo() + ' giorni): senti il cliente e registra l\'esito del rinnovo.</span>' : ''}</div>`;
  }

  // Piano interventi generato prima dell'ultimo rinnovo: suggerimento.
  let avvisoPiano = '';
  if (ultimo && ultimo.esito === 'rinnovato' && perio.contratto_stato !== 'non_rinnovato'
      && (!perio.ultima_generazione || new Date(perio.ultima_generazione) < new Date(ultimo.registrato_il))) {
    avvisoPiano = `<div class="al2 i" style="margin-bottom:8px">🔄 Contratto rinnovato fino al ${esc(fd(perio.data_fine_contratto))}: ${perio.pianificazione_generata ? 'il piano interventi è stato generato prima del rinnovo.' : 'il piano interventi non è ancora generato.'} ${RUOLI_PIANO_INTERVENTI.includes(ROLE) ? 'Usa "Rigenera piano interventi" qui sotto per il nuovo periodo (i cicli già eseguiti restano).' : 'Avvisa il capo tecnico di generare il piano per il nuovo periodo.'}</div>`;
  }

  let bottoni = '';
  // Bottoni solo quando serve: contratto in scadenza (o scaduto) o non rinnovato.
  if (puoRegistrareRinnovo() && perio.data_fine_contratto
      && (perio.contratto_stato === 'non_rinnovato' || (scad && scad.inScadenza))) {
    bottoni = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button class="btn sm p" data-cli="${esc(cliId)}" onclick="apriRinnovoContratto(this.dataset.cli,'rinnovato')">✅ Rinnovato</button>
      ${perio.contratto_stato !== 'non_rinnovato' ? `<button class="btn sm" data-cli="${esc(cliId)}" onclick="apriRinnovoContratto(this.dataset.cli,'non_rinnovato')">❌ Non rinnovato</button>` : ''}
    </div>`;
  }

  const htmlStorico = righe.length ? `<details style="margin-top:4px"><summary style="cursor:pointer;font-size:12px;font-weight:600">Storico dei rinnovi (${righe.length})</summary>
    ${righe.map(function(r) {
      const quando = new Date(r.registrato_il).toLocaleDateString('it-IT');
      const chi = esc(r.registrato_da_nome || '—') + (r.registrato_da_ruolo ? ' (' + esc(etichettaRuoloContratto(r.registrato_da_ruolo)) + ')' : '');
      const cosa = r.esito === 'rinnovato'
        ? '✅ Rinnovato: ' + esc(fd(r.nuovo_inizio)) + ' → ' + esc(fd(r.nuova_fine)) + ' (' + esc(r.nuova_durata || '') + '; prima fino al ' + esc(fd(r.fine_precedente)) + ')'
        : '❌ Non rinnovato (fine ' + esc(fd(r.fine_precedente)) + '): ' + esc(r.motivo || '');
      return `<div style="font-size:12px;padding:6px 0;border-bottom:0.5px solid rgba(0,0,0,.06)">${cosa}${r.nota ? '<br><span style="color:var(--m)">Nota: ' + esc(r.nota) + '</span>' : ''}<br><span style="color:var(--m)">${esc(quando)} · ${chi}</span></div>`;
    }).join('')}</details>` : '';

  box.innerHTML = stato + avvisoPiano + bottoni + htmlStorico;
}

function etichettaRuoloContratto(ruolo) {
  if (typeof etichettaRuolo === 'function') return etichettaRuolo(ruolo);
  return String(ruolo || '').replace(/_/g, ' ');
}

// Chiamata da savePeriodicita (js/08) prima di salvare.
async function completaPayloadContratto(payload) {
  if (!(await colonnaPeriodicitaEsiste('evacuatore_fumi'))) delete payload.evacuatore_fumi;
  if (!contrattoRinnovoAttivo()) return true;

  const presidi = {};
  for (const t of TIPI_PRESIDI) {
    const el = ge('perio-n-' + t);
    if (!el) continue;
    const testo = String(el.value || '').trim();
    if (testo === '') continue;
    const n = Number(testo);
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      toast('Numero di presidi previsti non valido per ' + tpl(t) + ': intero da 0 a 100000', 'err');
      el.focus();
      return false;
    }
    presidi[t] = n;
  }
  payload.presidi_contratto = presidi;
  const sel = ge('perio-preventivo');
  if (sel && puoCollegarePreventivoContratto()) payload.preventivo_id = sel.value || null;
  return true;
}

// Apre la scheda cliente sul tab Periodicità (dalla dashboard).
async function apriContrattoCliente(cliId) {
  await openClienteDetail(cliId);
  const btn = document.querySelector('#pg-cliente-detail .tab[onclick*="cd-periodicita"]');
  if (btn) stab(btn, 'cd-periodicita');
}

// ── Finestra esito del rinnovo (m-rinnovo-contratto) ────────────────
async function apriRinnovoContratto(cliId, esito) {
  if (!puoRegistrareRinnovo()) {
    toast('Il tuo ruolo non registra l\'esito del rinnovo', 'err');
    return;
  }
  if (!(await verificaContrattoRinnovoDisponibile())) {
    toast('Il rinnovo dei contratti non è ancora attivo', 'err');
    return;
  }

  const { data: perio, error } = await db
    .from('clienti_periodicita')
    .select('*, clienti(ragione_sociale)')
    .eq('cliente_id', cliId)
    .maybeSingle();
  if (error || !perio) {
    toast('Contratto non trovato' + (error ? ': ' + error.message : ''), 'err');
    return;
  }
  if (!perio.data_fine_contratto) {
    toast('Imposta prima le date del contratto', 'err');
    return;
  }

  contrattoRinnovoAperto = { cliId: cliId, perio: perio, esito: esito };
  const rinnovato = esito === 'rinnovato';
  ge('rnc-titolo').textContent = rinnovato ? '✅ Contratto rinnovato' : '❌ Contratto non rinnovato';
  ge('rnc-sottotitolo').innerHTML = esc(perio.clienti?.ragione_sociale || 'Cliente') +
    ' · contratto ' + esc(perio.durata_contratto || 'annuale') + ' ' + esc(fd(perio.data_inizio_contratto)) + ' → ' + esc(fd(perio.data_fine_contratto));
  ge('rnc-box-rinnovato').style.display = rinnovato ? '' : 'none';
  ge('rnc-box-non-rinnovato').style.display = rinnovato ? 'none' : '';
  ge('rnc-conferma').textContent = rinnovato ? '✅ Registra il rinnovo' : '❌ Registra il mancato rinnovo';
  ge('rnc-motivo').value = '';
  ge('rnc-nota').value = '';

  if (rinnovato) {
    ge('rnc-durata').value = perio.durata_contratto === 'quinquennale' ? 'quinquennale' : 'annuale';
    ge('rnc-inizio').value = aggiungiGiorniISO(perio.data_fine_contratto, 1);
    ge('rnc-inizio').min = aggiungiGiorniISO(perio.data_fine_contratto, 1);
    ge('rnc-fine').value = fineContrattoDaInizio(ge('rnc-inizio').value, ge('rnc-durata').value);
    const boxPrev = ge('rnc-preventivo-box');
    const sel = ge('rnc-preventivo');
    sel.innerHTML = '<option value="">— Nessuno (resta quello del contratto) —</option>';
    boxPrev.style.display = 'none';
    if (ROLE !== 'capo_tecnico') {
      const preventivi = await preventiviDelCliente(cliId);
      if (preventivi.length) {
        sel.innerHTML += preventivi.map(function(p) {
          return `<option value="${esc(p.id)}">${esc(testoPreventivoContratto(p))}</option>`;
        }).join('');
        boxPrev.style.display = '';
      }
    }
  }
  aggiornaRinnovoContratto(false);
  openM('m-rinnovo-contratto');
}

// ricalcolaFine = true quando cambiano inizio o durata.
function aggiornaRinnovoContratto(ricalcolaFine) {
  const r = contrattoRinnovoAperto;
  if (!r) return;
  const btn = ge('rnc-conferma');
  const aiuto = ge('rnc-aiuto');
  if (r.esito === 'rinnovato') {
    if (ricalcolaFine) ge('rnc-fine').value = fineContrattoDaInizio(ge('rnc-inizio').value, ge('rnc-durata').value);
    const inizio = ge('rnc-inizio').value;
    const fine = ge('rnc-fine').value;
    let msg = '';
    if (!inizio) msg = 'Indica il nuovo inizio del contratto.';
    else if (inizio <= r.perio.data_fine_contratto) msg = 'Il nuovo inizio deve essere dopo il ' + fd(r.perio.data_fine_contratto) + '.';
    else if (!fine) msg = 'Indica la nuova fine del contratto.';
    else if (fine <= inizio) msg = 'La nuova fine deve essere dopo il nuovo inizio.';
    aiuto.textContent = msg || ('Nuovo periodo: ' + fd(inizio) + ' → ' + fd(fine) + '. Il piano interventi non si rigenera da solo.');
    aiuto.style.color = msg ? 'var(--r)' : 'var(--m)';
    btn.disabled = !!msg;
  } else {
    const ok = ge('rnc-motivo').value.trim().length > 0;
    aiuto.textContent = ok ? 'Il contratto esce dai contratti in scadenza. Lo storico resta.' : 'Il motivo è obbligatorio.';
    aiuto.style.color = ok ? 'var(--m)' : 'var(--r)';
    btn.disabled = !ok;
  }
}

async function salvaRinnovoContratto() {
  const r = contrattoRinnovoAperto;
  if (!r) return;
  const btn = ge('rnc-conferma');
  aggiornaRinnovoContratto(false);
  if (btn.disabled) return;

  const parametri = {
    p_cliente_id: r.cliId,
    p_esito: r.esito,
    p_nota: ge('rnc-nota').value.trim() || null
  };
  if (r.esito === 'rinnovato') {
    parametri.p_nuova_fine = ge('rnc-fine').value;
    parametri.p_nuova_durata = ge('rnc-durata').value;
    parametri.p_nuovo_inizio = ge('rnc-inizio').value;
    parametri.p_preventivo_id = ge('rnc-preventivo').value || null;
  } else {
    parametri.p_motivo = ge('rnc-motivo').value.trim();
  }

  btn.disabled = true;
  const testoBtn = btn.textContent;
  btn.textContent = '⏳ Salvataggio...';
  const { data, error } = await db.rpc('registra_rinnovo_contratto', parametri);
  btn.textContent = testoBtn;
  btn.disabled = false;
  if (error) {
    toast('Errore: ' + error.message, 'err');
    return;
  }

  closeM('m-rinnovo-contratto');
  contrattoRinnovoAperto = null;
  if (r.esito === 'rinnovato') {
    toast('✅ Rinnovo registrato: contratto fino al ' + fd(data?.data_fine_contratto) +
      (RUOLI_PIANO_INTERVENTI.includes(ROLE) ? '. Rigenera il piano interventi (Periodicità).' : '. Avvisa il capo tecnico per il piano interventi.'), 'ok');
  } else {
    toast('Mancato rinnovo registrato', 'ok');
  }

  if (ge('pg-cliente-detail')?.classList.contains('on') && typeof currentCliId !== 'undefined' && currentCliId === r.cliId) {
    await loadPeriodicitaCliente(r.cliId);
  }
  await caricaContrattiInScadenzaDashboard();
}

// ── Dashboard: Contratti in scadenza ────────────────────────────────
async function caricaContrattiInScadenzaDashboard() {
  const box = ge(BOX_CONTRATTI_SCADENZA[ROLE] || '');
  if (!box) return;

  if (!(await verificaContrattoRinnovoDisponibile())) {
    box.innerHTML = '';
    return;
  }

  const preavviso = giorniPreavvisoRinnovo();
  const limite = aggiungiGiorniISO(oggiContrattoISO(), preavviso);

  const { data, error } = await db
    .from('clienti_periodicita')
    .select('id, cliente_id, durata_contratto, data_inizio_contratto, data_fine_contratto, presidi_contratto, preventivo_id, contratto_stato, ' +
      'clienti(ragione_sociale, rappresentante_id, eliminato_il, referente_telefono, utenti!clienti_rappresentante_id_fkey(nome, cognome)), ' +
      'preventivi!clienti_periodicita_preventivo_id_fkey(numero)')
    .eq('contratto_stato', 'attivo')
    .not('data_fine_contratto', 'is', null)
    .lte('data_fine_contratto', limite)
    .order('data_fine_contratto', { ascending: true });

  if (error) {
    console.warn('Contratti in scadenza:', error.message);
    box.innerHTML = '';
    return;
  }

  let contratti = (data || []).filter(function(c) { return c.clienti && !c.clienti.eliminato_il; });
  if (ROLE === 'rappresentante') {
    contratti = contratti.filter(function(c) { return c.clienti.rappresentante_id === ME.id; });
  }
  contratti.forEach(function(c) { contrattiScadenzaCache[c.cliente_id] = c; });

  if (!contratti.length) {
    box.innerHTML = '';
    return;
  }

  const aiuti = {
    rappresentante: 'Contratti di manutenzione dei tuoi clienti che scadono entro ' + preavviso + ' giorni o già scaduti: senti il cliente e registra l\'esito del rinnovo. Con l\'esito il contratto esce dalla lista.',
    titolare: 'Contratti di manutenzione che scadono entro ' + preavviso + ' giorni (preavviso in Impostazioni) o già scaduti, senza esito del rinnovo. Li segue il rappresentante del cliente.',
    capo_tecnico: 'Contratti che scadono entro ' + preavviso + ' giorni o già scaduti: il rinnovo lo segue il rappresentante; dopo il rinnovo rigenera il piano interventi.'
  };

  const righe = contratti.map(function(c) {
    const scad = scadenzaContratto(c);
    const presidi = testoPresidiContratto(c.presidi_contratto);
    const rapp = c.clienti.utenti ? (c.clienti.utenti.nome || '') + ' ' + (c.clienti.utenti.cognome || '') : '';
    const dettagli = [
      'Fine ' + fd(c.data_fine_contratto),
      c.durata_contratto === 'quinquennale' ? 'quinquennale' : 'annuale'
    ];
    if (c.preventivi && c.preventivi.numero !== undefined && c.preventivi.numero !== null) dettagli.push('preventivo n. ' + c.preventivi.numero);
    const chi = ROLE === 'rappresentante' ? '' : (c.clienti.rappresentante_id
      ? '<div style="font-size:12px;color:var(--m)">Rappresentante: ' + esc(rapp.trim() || '—') + '</div>'
      : '<div style="font-size:12px;color:var(--r)">Cliente senza rappresentante</div>');
    return `<div style="padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start">
        <div style="font-weight:600;min-width:0;overflow-wrap:anywhere">${esc(c.clienti.ragione_sociale || 'Cliente')}</div>
        <span class="bx ${scad ? scad.classe : 'bgray'}">${esc(scad ? scad.testo : '—')}</span>
      </div>
      <div style="font-size:12px;color:var(--m);margin-top:2px">${esc(dettagli.join(' · '))}</div>
      ${presidi ? '<div style="font-size:12px;color:var(--m)">Previsti: ' + esc(presidi) + '</div>' : ''}
      ${chi}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        <button class="btn sm" data-cli="${esc(c.cliente_id)}" onclick="apriContrattoCliente(this.dataset.cli)">Apri contratto</button>
        ${puoRegistrareRinnovo() ? `<button class="btn sm p" data-cli="${esc(c.cliente_id)}" onclick="apriRinnovoContratto(this.dataset.cli,'rinnovato')">✅ Rinnovato</button>
        <button class="btn sm" data-cli="${esc(c.cliente_id)}" onclick="apriRinnovoContratto(this.dataset.cli,'non_rinnovato')">❌ Non rinnovato</button>` : ''}
      </div>
    </div>`;
  }).join('');

  box.innerHTML = `
    <div class="tit-section" style="margin-top:14px">📄 Contratti in scadenza (${contratti.length})</div>
    <div class="rap-list-card" style="margin-bottom:14px">
      <div style="font-size:12px;color:var(--m);margin-bottom:4px">${esc(aiuti[ROLE] || '')}</div>
      ${righe}
    </div>
  `;
}
