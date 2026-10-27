// =====================================================================
// F7.2 — DATE DEI LAVORI E FALDONE della commessa (passo 10).
// La segreteria fissa con il cliente la data di inizio e la fine
// prevista; prepara il faldone: personale in cantiere (dipendenti e
// subappaltatori, sql/32), documenti richiesti, altre voci (POS, PSC o
// DUVRI, ...). Il gestionale segnala i documenti mancanti o scaduti alla
// data di inizio. "Faldone consegnato" porta la commessa a 'pronta'.
// Box cmd-faldone nella scheda della commessa (js/26).
// Tutto il controllo lo fa il database (sql/33, controllo_faldone_
// commessa e consegna_faldone_commessa): qui si mostra e basta. Il
// passaggio a 'pronta' con "Stato e storico" (js/18) non si fa più: il
// database lo blocca senza la consegna del faldone.
// Chi (sql/33):
//   date: segreteria e titolare (la segreteria finché la commessa non è
//     chiusa o annullata); le vedono tutti quelli che vedono la commessa;
//   faldone: lo leggono titolare, segreteria, capo tecnico; lo
//     modificano segreteria e titolare fino alla consegna, dopo solo il
//     titolare;
//   consegna: segreteria e titolare, con la commessa 'in preparazione' e
//     il faldone in regola; il titolare anche con problemi aperti, solo
//     scrivendo il motivo (consegna "forzata").
// Richiede sql/26, 28, 32 e 33. Senza sql/33 il box dice "non ancora
// attivo" e 'pronta' si segna come prima.
// =====================================================================

const RUOLI_LEGGONO_FALDONE = ['titolare', 'segreteria', 'capo_tecnico'];
const STATI_FALDONE_APERTO = ['approvata', 'materiali_ordinati', 'in_preparazione'];

const ETICHETTE_STATO_VOCE_FALDONE = {
  da_fare: 'Da fare',
  fatta: 'Fatto',
  non_necessaria: 'Non necessario'
};

let faldoneDisponibile = null;
let faldoneAperto = null;       // { commessa, stato (risposta di controllo_faldone_commessa) }
let utentiFaldoneElenco = [];
let subappaltatoriFaldoneElenco = [];

// ── Disponibilità di sql/33 ─────────────────────────────────────────
async function verificaFaldoneDisponibile() {
  if (faldoneDisponibile !== null) return faldoneDisponibile;
  if (!(await verificaCommesseDisponibili())) return false;

  const { error } = await db
    .from('commesse_faldone')
    .select('commessa_id')
    .limit(1);

  if (!error) {
    faldoneDisponibile = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /commesse_faldone/i.test(error.message || '')) {
    faldoneDisponibile = false;
  } else {
    return false;
  }
  return faldoneDisponibile;
}

// true solo dopo la verifica e con sql/33 eseguito (usata da js/18).
function faldoneCommessaAttivo() {
  return faldoneDisponibile === true;
}

// ── Chi può fare cosa (le stesse regole le impone il database) ──────
function puoFissareDateCommessa(commessa) {
  if (ROLE === 'titolare') return true;
  return ROLE === 'segreteria' && commessaAperta(commessa);
}

function puoModificareFaldone(commessa) {
  if (ROLE === 'titolare') return true;
  return ROLE === 'segreteria' && STATI_FALDONE_APERTO.includes(commessa.stato);
}

function puoConsegnareFaldone(commessa) {
  return ['titolare', 'segreteria'].includes(ROLE) && commessa.stato === 'in_preparazione';
}

// ── Piccoli aiuti ───────────────────────────────────────────────────
function nomeTipoDocumentoFaldone(codice) {
  const tipo = typeof tipoDocumentoTS === 'function' ? tipoDocumentoTS(codice) : null;
  return tipo ? tipo.nome : String(codice || '').replace(/_/g, ' ');
}

// "scadenza il …" se già passata, "scade il …, prima dell'inizio lavori" se futura
function testoScadenzaFaldone(dataScadenza) {
  if (dataScadenza && dataScadenza > dataLocaleISO()) return 'scade il ' + fd(dataScadenza) + ", prima dell'inizio lavori";
  return 'scadenza il ' + fd(dataScadenza) + ' (non più valido)';
}

function testoProblemaFaldone(p) {
  const tipo = p.tipo ? nomeTipoDocumentoFaldone(p.tipo) : '';
  switch (p.codice) {
    case 'data_inizio_mancante': return 'Data di inizio lavori non fissata';
    case 'data_fine_mancante': return 'Data di fine prevista non fissata';
    case 'nessuna_persona': return 'Nessun dipendente o subappaltatore nel faldone';
    case 'persona_non_attiva': return p.persona + ': non è più attivo, toglilo dal faldone';
    case 'documento_mancante': return p.persona + ': manca ' + tipo;
    case 'documento_scaduto': return p.persona + ': ' + tipo + ' — ' + testoScadenzaFaldone(p.data_scadenza);
    case 'documento_scade_durante': return p.persona + ': ' + tipo + ' scade il ' + fd(p.data_scadenza) + ', prima della fine prevista';
    case 'voce_da_fare': return 'Da fare: ' + (p.voce || '');
    default: return p.codice || '';
  }
}

function badgeRequisitoFaldone(r) {
  const nome = nomeTipoDocumentoFaldone(r.tipo);
  if (r.esito === 'mancante') return `<span class="bx berr" title="Manca">${esc(nome)}: manca</span>`;
  if (r.esito === 'scaduto') return `<span class="bx berr">${esc(nome)}: ${esc(testoScadenzaFaldone(r.data_scadenza))}</span>`;
  if (r.esito === 'scade_durante') return `<span class="bx bwarn">${esc(nome)}: scade il ${esc(fd(r.data_scadenza))}</span>`;
  return `<span class="bx bok">${esc(nome)}${r.data_scadenza ? ': fino al ' + esc(fd(r.data_scadenza)) : ': senza scadenza'}</span>`;
}

function testoDateLavori(d) {
  if (!d || !d.data_inizio) return '';
  return 'dal ' + fd(d.data_inizio) + (d.data_fine_prevista ? ' al ' + fd(d.data_fine_prevista) + ' (fine prevista)' : '');
}

// ── Box nella scheda della commessa ─────────────────────────────────
async function caricaFaldoneCommessa(commessa) {
  const box = ge('cmd-faldone');
  if (!box) return;
  box.innerHTML = '';
  faldoneAperto = null;

  const titolo = '<div style="font-size:14px;font-weight:700;margin-bottom:8px">🗂️ Date dei lavori e faldone</div>';

  if (!(await verificaFaldoneDisponibile())) {
    box.innerHTML = `<div class="card">${titolo}<div class="al2 i" style="margin:0">Le date dei lavori e la checklist del faldone non sono ancora attive.</div></div>`;
    return;
  }

  box.innerHTML = `<div class="card">${titolo}<div class="load">Caricamento...</div></div>`;

  // Chi non legge il faldone vede solo le date (sono sulla commessa).
  if (!RUOLI_LEGGONO_FALDONE.includes(ROLE)) {
    const { data, error } = await db
      .from('commesse')
      .select('data_inizio, data_fine_prevista')
      .eq('id', commessa.id)
      .maybeSingle();
    if (error) {
      box.innerHTML = `<div class="card">${titolo}<div class="al2 e" style="margin:0">Errore caricamento date: ${esc(error.message)}</div></div>`;
      return;
    }
    box.innerHTML = `
      <div class="card">
        ${titolo}
        <div style="font-size:13px">Lavori: ${data && data.data_inizio ? '<b>' + esc(testoDateLavori(data)) + '</b>' : '<span style="color:var(--m)">date non ancora fissate dalla segreteria</span>'}</div>
      </div>
    `;
    return;
  }

  const richieste = [db.rpc('controllo_faldone_commessa', { p_commessa_id: commessa.id })];
  if (puoModificareFaldone(commessa)) {
    richieste.push(
      db.from('utenti').select('id, nome, cognome, ruolo, attivo').order('nome'),
      db.from('subappaltatori').select('id, ragione_sociale, attivo').order('ragione_sociale')
    );
  }
  const [rStato, rUtenti, rSub] = await Promise.all(richieste);

  if (rStato.error || !rStato.data) {
    box.innerHTML = `<div class="card">${titolo}<div class="al2 e" style="margin:0">Errore caricamento faldone: ${esc(rStato.error?.message || 'nessun dato')}</div></div>`;
    return;
  }

  utentiFaldoneElenco = (rUtenti && !rUtenti.error ? rUtenti.data : []) || [];
  subappaltatoriFaldoneElenco = (rSub && !rSub.error ? rSub.data : []) || [];
  faldoneAperto = { commessa: commessa, stato: rStato.data };

  box.innerHTML = htmlFaldoneCommessa(commessa, rStato.data);
}

function htmlFaldoneCommessa(commessa, f) {
  const modifica = puoModificareFaldone(commessa);
  const problemi = f.problemi || [];
  const bloccanti = problemi.filter(function(p) { return p.blocca; });
  const avvisi = problemi.filter(function(p) { return !p.blocca; });
  const persone = f.persone || [];
  const voci = f.voci || [];

  // Date
  const date = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;margin-bottom:10px">
      <span>Lavori: ${f.data_inizio
        ? '<b>' + esc(testoDateLavori(f)) + '</b>'
        : '<b style="color:var(--a)">date da fissare con il cliente</b>'}</span>
      ${f.date_fissate_il ? `<span style="font-size:11px;color:var(--m)">(fissate${f.date_fissate_da_nome ? ' da ' + esc(f.date_fissate_da_nome) : ''} il ${esc(new Date(f.date_fissate_il).toLocaleDateString('it-IT'))})</span>` : ''}
      ${puoFissareDateCommessa(commessa) ? `<button class="btn sm${f.data_inizio ? '' : ' p'}" onclick="apriDateCommessa()">📅 ${f.data_inizio ? 'Cambia date' : 'Fissa le date'}</button>` : ''}
    </div>
  `;

  // Esito
  let esito;
  if (f.consegnato_il) {
    esito = `
      <div class="al2 ${f.consegnato_forzato ? 'w' : 'ok'}">
        <b>Faldone consegnato al capo tecnico</b> il ${esc(new Date(f.consegnato_il).toLocaleDateString('it-IT'))}${f.consegnato_da_nome ? ' da ' + esc(f.consegnato_da_nome) : ''}.
        ${f.consegnato_forzato ? '<div>Consegnato dal titolare con problemi aperti. Motivo: ' + esc(f.nota_consegna || '') + '</div>' : (f.nota_consegna ? '<div>Nota: ' + esc(f.nota_consegna) + '</div>' : '')}
        ${bloccanti.length ? '<div style="margin-top:4px">Oggi il faldone ha ' + bloccanti.length + (bloccanti.length === 1 ? ' problema' : ' problemi') + ': avvisa il capo tecnico.</div>' : ''}
      </div>
    `;
  } else if (bloccanti.length) {
    esito = `
      <div class="al2 e">
        <b>Prima di "pronta" (${bloccanti.length}):</b>
        ${bloccanti.map(function(p) { return '<div>→ ' + esc(testoProblemaFaldone(p)) + '</div>'; }).join('')}
      </div>
    `;
  } else {
    esito = `<div class="al2 ok"><b>Faldone in regola</b> alla data di inizio (${esc(fd(f.data_riferimento))}).</div>`;
  }
  const htmlAvvisi = avvisi.length ? `
    <div class="al2 w">
      ${avvisi.map(function(p) { return '<div>⚠️ ' + esc(testoProblemaFaldone(p)) + '</div>'; }).join('')}
    </div>
  ` : '';

  // Personale
  const giaDentro = {};
  persone.forEach(function(p) { giaDentro[p.utente_id || p.subappaltatore_id] = true; });
  const opzioniUtenti = utentiFaldoneElenco
    .filter(function(u) { return u.attivo !== false && !giaDentro[u.id]; })
    .sort(function(a, b) {
      const pa = ['tecnico', 'capo_tecnico'].includes(a.ruolo) ? 0 : 1;
      const pb = ['tecnico', 'capo_tecnico'].includes(b.ruolo) ? 0 : 1;
      return (pa - pb) || nomeDipendenteTS(a).localeCompare(nomeDipendenteTS(b));
    });
  const opzioniSub = subappaltatoriFaldoneElenco.filter(function(s) { return s.attivo !== false && !giaDentro[s.id]; });

  const personale = `
    <div style="font-size:13px;font-weight:700;margin:12px 0 4px">👷 Personale in cantiere (${persone.length})</div>
    ${persone.length ? persone.map(function(p) { return htmlPersonaFaldone(commessa, p, modifica); }).join('') : '<div style="font-size:12px;color:var(--m)">Nessuno: aggiungi i dipendenti e i subappaltatori che andranno in cantiere.</div>'}
    ${modifica ? `
      <div class="fr" style="margin-top:8px">
        <div class="f" style="display:flex;gap:6px;align-items:center">
          <select id="fald-nuovo-dipendente" style="flex:1">
            <option value="">+ Dipendente…</option>
            ${opzioniUtenti.map(function(u) { return `<option value="${esc(u.id)}">${esc(nomeDipendenteTS(u))} (${esc(etichettaRuolo(u.ruolo))})</option>`; }).join('')}
          </select>
          <button class="btn sm" onclick="aggiungiPersonaFaldone('dipendente')">Aggiungi</button>
        </div>
        <div class="f" style="display:flex;gap:6px;align-items:center">
          <select id="fald-nuovo-subappaltatore" style="flex:1">
            <option value="">+ Subappaltatore…</option>
            ${opzioniSub.map(function(s) { return `<option value="${esc(s.id)}">${esc(s.ragione_sociale)}</option>`; }).join('')}
          </select>
          <button class="btn sm" onclick="aggiungiPersonaFaldone('subappaltatore')">Aggiungi</button>
        </div>
      </div>
      ${!opzioniSub.length && !subappaltatoriFaldoneElenco.length ? '<div style="font-size:11px;color:var(--m)">Nessun subappaltatore in anagrafica: si inseriscono da Team e subappalti.</div>' : ''}
    ` : ''}
  `;

  // Documenti richiesti
  const elenco = function(tipi) { return (tipi || []).map(nomeTipoDocumentoFaldone).join(', ') || 'nessuno'; };
  const richiesti = `
    <div style="font-size:13px;font-weight:700;margin:12px 0 4px">📋 Documenti richiesti a chi va in cantiere</div>
    <div style="font-size:12px">
      <div><b>Dipendenti:</b> ${esc(elenco(f.tipi_obbligatori_dipendenti))}${(f.tipi_extra_dipendenti || []).length ? ' + <b>per questa commessa:</b> ' + esc(elenco(f.tipi_extra_dipendenti)) : ''}</div>
      <div><b>Subappaltatori:</b> ${esc(elenco(f.tipi_obbligatori_subappaltatori))}${(f.tipi_extra_subappaltatori || []).length ? ' + <b>per questa commessa:</b> ' + esc(elenco(f.tipi_extra_subappaltatori)) : ''}</div>
    </div>
    ${modifica ? '<button class="btn sm" style="margin-top:6px" onclick="apriRequisitiFaldone()">Documenti in più per questa commessa</button>' : ''}
  `;

  // Altre voci
  const htmlVoci = `
    <div style="font-size:13px;font-weight:700;margin:12px 0 4px">🗂️ Altri documenti del faldone</div>
    ${voci.map(function(vo) { return htmlVoceFaldone(vo, modifica); }).join('') || '<div style="font-size:12px;color:var(--m)">Nessuna voce.</div>'}
    ${modifica ? `
      <div style="display:flex;gap:6px;align-items:center;margin-top:8px">
        <input type="text" id="fald-nuova-voce" maxlength="200" placeholder="es. Verbale di sopralluogo congiunto" style="flex:1" onkeydown="if(event.key==='Enter')aggiungiVoceFaldone()">
        <button class="btn sm" onclick="aggiungiVoceFaldone()">Aggiungi voce</button>
      </div>
    ` : ''}
    <div style="font-size:11px;color:var(--m);margin-top:6px">I file (POS, copie dei documenti, elenco del personale…) vanno nella cartella "Faldone" dei documenti della commessa, qui sotto.</div>
  `;

  // Consegna
  let consegna = '';
  if (!f.consegnato_il && ['titolare', 'segreteria'].includes(ROLE)) {
    if (puoConsegnareFaldone(commessa)) {
      if (!bloccanti.length) {
        consegna = '<button class="btn p" onclick="apriConsegnaFaldone()">✅ Faldone consegnato al capo tecnico</button>';
      } else if (ROLE === 'titolare') {
        consegna = '<button class="btn" onclick="apriConsegnaFaldone()">Consegna comunque (titolare, con motivo)</button>';
      } else {
        consegna = '<button class="btn p" disabled>✅ Faldone consegnato al capo tecnico</button><div style="font-size:12px;color:var(--m);margin-top:4px">Si segna quando i problemi in rosso sono risolti.</div>';
      }
    } else if (STATI_FALDONE_APERTO.includes(commessa.stato)) {
      consegna = '<div style="font-size:12px;color:var(--m)">"Faldone consegnato" si segna quando la commessa è "in preparazione" (dopo il passo 8 del capo tecnico).</div>';
    }
  }

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <div style="font-size:14px;font-weight:700">🗂️ Date dei lavori e faldone</div>
        <button class="btn sm" onclick="ricaricaFaldoneCommessa()">↻ Aggiorna</button>
      </div>
      ${date}
      ${esito}
      ${htmlAvvisi}
      ${personale}
      ${richiesti}
      ${htmlVoci}
      ${consegna ? '<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--bo)">' + consegna + '</div>' : ''}
    </div>
  `;
}

function htmlPersonaFaldone(commessa, p, modifica) {
  const tipo = p.utente_id ? 'dipendente' : 'subappaltatore';
  const id = p.utente_id || p.subappaltatore_id;
  const chi = p.utente_id ? etichettaRuolo(p.ruolo) : 'Subappaltatore';
  return `
    <div style="padding:6px 0;border-bottom:1px solid var(--bo)">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="font-size:13px"><b>${esc(p.nome)}</b> <span style="font-size:11px;color:var(--m)">${esc(chi)}</span>${p.attivo === false ? ' <span class="bx berr">Non attivo</span>' : ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${canAccessPage('scheda-documenti') ? `<button class="btn sm" onclick="openSchedaDocumenti('${tipo}', '${esc(id)}')">Documenti</button>` : ''}
          ${modifica ? `<button class="btn sm" onclick="togliPersonaFaldone('${esc(p.id)}')">Togli</button>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${(p.requisiti || []).map(badgeRequisitoFaldone).join('')}</div>
    </div>
  `;
}

function htmlVoceFaldone(vo, modifica) {
  const classe = vo.stato === 'fatta' ? 'bok' : (vo.stato === 'non_necessaria' ? 'bgray' : 'bwarn');
  const comando = modifica ? `
    <select onchange="cambiaStatoVoceFaldone('${esc(vo.id)}', this.value)" style="width:auto">
      ${Object.keys(ETICHETTE_STATO_VOCE_FALDONE).map(function(s) {
        return `<option value="${s}" ${s === vo.stato ? 'selected' : ''}>${esc(ETICHETTE_STATO_VOCE_FALDONE[s])}</option>`;
      }).join('')}
    </select>
    ${vo.predefinita ? '' : `<button class="btn sm" onclick="togliVoceFaldone('${esc(vo.id)}')">Togli</button>`}
  ` : `<span class="bx ${classe}">${esc(ETICHETTE_STATO_VOCE_FALDONE[vo.stato] || vo.stato)}</span>`;
  return `
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:5px 0;border-bottom:1px solid var(--bo)">
      <div style="font-size:13px;min-width:0">${vo.stato === 'fatta' ? '✓ ' : ''}${esc(vo.descrizione)}
        ${vo.aggiornata_il && vo.stato !== 'da_fare' ? `<span style="font-size:11px;color:var(--m)">(${esc(vo.aggiornata_da_nome || '')} ${esc(new Date(vo.aggiornata_il).toLocaleDateString('it-IT'))})</span>` : ''}
      </div>
      <div style="display:flex;gap:6px;align-items:center">${comando}</div>
    </div>
  `;
}

async function ricaricaFaldoneCommessa() {
  const commessa = faldoneAperto && faldoneAperto.commessa;
  if (!commessa) return;
  // Lo stato della commessa può essere cambiato: si ricarica la scheda.
  if (commessaApertaId === commessa.id && typeof caricaSchedaCommessa === 'function') {
    await caricaSchedaCommessa(commessa.id);
  } else {
    await caricaFaldoneCommessa(commessa);
  }
}

// Chiama una funzione del database e, se va bene, ricarica il box.
async function eseguiFaldone(nome, parametri, messaggioOk) {
  const { error } = await db.rpc(nome, parametri);
  if (error) {
    toast('Non salvato: ' + (error.message || 'errore sconosciuto'), 'err');
    return false;
  }
  if (messaggioOk) toast(messaggioOk, 'ok');
  if (faldoneAperto) await caricaFaldoneCommessa(faldoneAperto.commessa);
  return true;
}

// ── Date ────────────────────────────────────────────────────────────
function apriDateCommessa() {
  if (!faldoneAperto) return;
  const f = faldoneAperto.stato;
  ge('fald-date-sottotitolo').textContent = 'Commessa ' + (faldoneAperto.commessa.codice || '') + ' · date concordate con il cliente';
  ge('fald-data-inizio').value = f.data_inizio || '';
  ge('fald-data-fine').value = f.data_fine_prevista || '';
  openM('m-date-commessa');
}

async function salvaDateCommessa() {
  if (!faldoneAperto) return;
  const inizio = v('fald-data-inizio');
  const fine = v('fald-data-fine');
  if (!inizio) { toast('Indica la data di inizio lavori', 'err'); return; }
  if (fine && fine < inizio) { toast('La fine prevista non può essere prima dell\'inizio', 'err'); return; }
  if (inizio < dataLocaleISO() && !confirm('La data di inizio è già passata. Confermi?')) return;

  const ok = await eseguiFaldone('imposta_date_commessa', {
    p_commessa_id: faldoneAperto.commessa.id,
    p_data_inizio: inizio,
    p_data_fine_prevista: fine || null
  }, 'Date dei lavori salvate');
  if (ok) closeM('m-date-commessa');
}

// ── Personale ───────────────────────────────────────────────────────
async function aggiungiPersonaFaldone(tipo) {
  if (!faldoneAperto) return;
  const id = v(tipo === 'dipendente' ? 'fald-nuovo-dipendente' : 'fald-nuovo-subappaltatore');
  if (!id) { toast(tipo === 'dipendente' ? 'Scegli il dipendente' : 'Scegli il subappaltatore', 'err'); return; }
  await eseguiFaldone('aggiungi_persona_faldone', {
    p_commessa_id: faldoneAperto.commessa.id,
    p_utente_id: tipo === 'dipendente' ? id : null,
    p_subappaltatore_id: tipo === 'subappaltatore' ? id : null
  }, 'Aggiunto al faldone');
}

async function togliPersonaFaldone(personaId) {
  const persona = faldoneAperto && (faldoneAperto.stato.persone || []).find(function(p) { return p.id === personaId; });
  const nome = persona ? persona.nome : '';
  if (!confirm('Togliere ' + (nome || 'questa persona') + ' dal faldone della commessa? I suoi documenti restano in Team e subappalti.')) return;
  await eseguiFaldone('togli_persona_faldone', { p_persona_id: personaId }, 'Tolto dal faldone');
}

// ── Documenti richiesti in più ─────────────────────────────────────
function apriRequisitiFaldone() {
  if (!faldoneAperto) return;
  const f = faldoneAperto.stato;
  const tipi = typeof TIPI_DOCUMENTO_TEAM_SUBAPPALTI !== 'undefined' ? TIPI_DOCUMENTO_TEAM_SUBAPPALTI : [];

  const caselle = function(gruppo, perAmmessi, obbligatori, scelti) {
    return tipi
      .filter(function(t) { return t.id !== 'altro' && perAmmessi.includes(t.per); })
      .map(function(t) {
        const fisso = obbligatori.includes(t.id);
        return `
          <label style="display:flex;gap:6px;align-items:flex-start;font-size:13px;margin:3px 0;${fisso ? 'color:var(--m)' : ''}">
            <input type="checkbox" class="${gruppo}" value="${esc(t.id)}" ${fisso || scelti.includes(t.id) ? 'checked' : ''} ${fisso ? 'disabled' : ''} style="width:auto;margin-top:2px">
            <span>${esc(t.nome)}${fisso ? ' (sempre richiesto)' : ''}</span>
          </label>
        `;
      }).join('');
  };

  ge('fald-req-dipendenti').innerHTML = caselle('fald-req-dip', ['persona'],
    f.tipi_obbligatori_dipendenti || [], f.tipi_extra_dipendenti || []);
  // Al subappaltatore si chiedono i documenti d'impresa e, se serve,
  // quelli dei suoi operai (es. PLE, lavori in quota).
  ge('fald-req-subappaltatori').innerHTML = caselle('fald-req-sub', ['impresa', 'persona'],
    f.tipi_obbligatori_subappaltatori || [], f.tipi_extra_subappaltatori || []);
  openM('m-requisiti-faldone');
}

async function salvaRequisitiFaldone() {
  if (!faldoneAperto) return;
  const scelti = function(classe) {
    return Array.from(document.querySelectorAll('#m-requisiti-faldone input.' + classe + ':checked:not(:disabled)'))
      .map(function(c) { return c.value; });
  };
  const ok = await eseguiFaldone('imposta_documenti_richiesti_faldone', {
    p_commessa_id: faldoneAperto.commessa.id,
    p_tipi_dipendenti: scelti('fald-req-dip'),
    p_tipi_subappaltatori: scelti('fald-req-sub')
  }, 'Documenti richiesti aggiornati');
  if (ok) closeM('m-requisiti-faldone');
}

// ── Altre voci ──────────────────────────────────────────────────────
async function aggiungiVoceFaldone() {
  if (!faldoneAperto) return;
  const descrizione = (v('fald-nuova-voce') || '').trim();
  if (!descrizione) { toast('Scrivi la voce del faldone', 'err'); return; }
  await eseguiFaldone('aggiungi_voce_faldone', {
    p_commessa_id: faldoneAperto.commessa.id,
    p_descrizione: descrizione
  }, 'Voce aggiunta');
}

async function cambiaStatoVoceFaldone(voceId, stato) {
  await eseguiFaldone('imposta_stato_voce_faldone', { p_voce_id: voceId, p_stato: stato }, null);
}

async function togliVoceFaldone(voceId) {
  if (!confirm('Togliere questa voce dal faldone?')) return;
  await eseguiFaldone('togli_voce_faldone', { p_voce_id: voceId }, 'Voce tolta');
}

// ── Consegna → pronta ───────────────────────────────────────────────
function apriConsegnaFaldone() {
  if (!faldoneAperto) return;
  const f = faldoneAperto.stato;
  const bloccanti = (f.problemi || []).filter(function(p) { return p.blocca; });
  const forzata = bloccanti.length > 0;

  if (forzata && ROLE !== 'titolare') {
    toast('Il faldone non è in regola: risolvi prima i problemi in rosso', 'err');
    return;
  }

  ge('fald-consegna-sottotitolo').textContent = 'Commessa ' + (faldoneAperto.commessa.codice || '') + ' → Pronta';
  ge('fald-consegna-problemi').innerHTML = forzata
    ? `<div class="al2 e"><b>Il faldone ha ${bloccanti.length} ${bloccanti.length === 1 ? 'problema' : 'problemi'}:</b>${bloccanti.map(function(p) { return '<div>→ ' + esc(testoProblemaFaldone(p)) + '</div>'; }).join('')}<div style="margin-top:4px">Come titolare puoi consegnarlo lo stesso: il motivo resta nello storico della commessa.</div></div>`
    : `<div class="al2 ok">Date fissate, personale con i documenti validi alla data di inizio, voci del faldone completate. La commessa passa a <b>Pronta</b> e il capo tecnico può avviare il cantiere.</div>`;
  ge('fald-consegna-nota-label').textContent = forzata ? 'Motivo della consegna con problemi aperti *' : 'Nota (facoltativa)';
  ge('fald-consegna-nota').value = '';
  ge('fald-consegna-conferma').textContent = forzata ? 'Consegna comunque' : 'Faldone consegnato';
  ge('fald-consegna-conferma').dataset.forzata = forzata ? '1' : '';
  ge('fald-consegna-conferma').disabled = false;
  openM('m-consegna-faldone');
}

async function salvaConsegnaFaldone() {
  if (!faldoneAperto) return;
  const bottone = ge('fald-consegna-conferma');
  const forzata = bottone && bottone.dataset.forzata === '1';
  const nota = (v('fald-consegna-nota') || '').trim();
  if (forzata && !nota) { toast('Scrivi il motivo', 'err'); return; }
  if (!confirm('Confermi: faldone consegnato al capo tecnico, commessa ' + (faldoneAperto.commessa.codice || '') + ' → Pronta?')) return;

  if (bottone) bottone.disabled = true;
  const commessa = faldoneAperto.commessa;
  const { error } = await db.rpc('consegna_faldone_commessa', {
    p_commessa_id: commessa.id,
    p_nota: nota || null
  });
  if (error) {
    if (bottone) bottone.disabled = false;
    toast('Faldone non consegnato: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-consegna-faldone');
  toast('Faldone consegnato: commessa ' + (commessa.codice || '') + ' pronta', 'ok');
  if (typeof caricaCommesseToccaAMe === 'function') await caricaCommesseToccaAMe();
  if (commessaApertaId === commessa.id && typeof caricaSchedaCommessa === 'function') {
    await caricaSchedaCommessa(commessa.id);
  }
}
