// ── F19.4 — PREAVVISO DEI CORSI E PIANO FORMAZIONE (sql/155) ─────────────
// Decisione di Erika del 16/11: preavviso separato per corsi e visite + piano
// formazione; SENZA l'incrocio con le commesse dei prossimi 90 giorni (serve
// F19.3) e senza il report del venerdì (non esiste).
//   - Preavviso: i documenti di PERSONA (corsi, patentini, visite: per =
//     'persona' nel catalogo) usano la regola preavviso_corsi_visite_gg (sql/62,
//     60 giorni, Impostazioni → Regole); quelli dell'impresa restano su
//     giorni_preavviso_documenti. Vale subito, anche senza sql/155.
//   - Tab "🎓 Piano formazione" in Team e subappalti: corsi e visite di
//     persona scaduti o in scadenza, con l'iscrizione al corso (data, ente) e
//     "📅 Iscrivi" per titolare e segreteria (finestra m-iscrizione-corso, id
//     isc-); il capo tecnico legge. Con sql/155.
//   - Cosa tocca a me: a ognuno i SUOI corsi o visite in scadenza; a
//     segreteria e titolare i corsi in scadenza senza iscrizione.

const PIANO_FORM = { attivo: null, iscrizioni: {} };

async function verificaPianoFormazioneDisponibile() {
  if (PIANO_FORM.attivo !== null) return PIANO_FORM.attivo;
  try {
    const { data, error } = await db.rpc('piano_formazione_attivo');
    PIANO_FORM.attivo = !error && data === true;
  } catch (e) { PIANO_FORM.attivo = false; }
  return PIANO_FORM.attivo;
}

function giorniPreavvisoCorsi() {
  const n = typeof leggiRegolaSubito === 'function' ? leggiRegolaSubito('preavviso_corsi_visite_gg') : null;
  return (n === null || n === undefined || !isFinite(Number(n))) ? 60 : Number(n);
}

function eDocumentoDiPersona(d) {
  const t = d && typeof tipoDocumentoTS === 'function' ? tipoDocumentoTS(d.tipo) : null;
  return !!(t && t.per === 'persona');
}

// Stato del documento: preavviso dei corsi per i documenti di persona
if (typeof statoDocumentoTeamSubappalti === 'function') {
  // eslint-disable-next-line no-global-assign
  statoDocumentoTeamSubappalti = function(d, allaData) {
    const rif = allaData || dataLocaleISO();
    if (!d.data_scadenza) return { codice: 'senza_scadenza', classe: 'bgray', testo: 'Senza scadenza' };
    const giorni = giorniTraISO(rif, d.data_scadenza);
    if (giorni < 0) return { codice: 'scaduto', classe: 'berr', testo: 'Scaduto da ' + Math.abs(giorni) + (Math.abs(giorni) === 1 ? ' giorno' : ' giorni') };
    const preavviso = eDocumentoDiPersona(d) ? giorniPreavvisoCorsi() : giorniPreavvisoDocumenti();
    if (giorni <= preavviso) return { codice: 'in_scadenza', classe: 'bwarn', testo: giorni === 0 ? 'Scade oggi' : 'Scade tra ' + giorni + (giorni === 1 ? ' giorno' : ' giorni') };
    return { codice: 'valido', classe: 'bok', testo: 'Valido' };
  };
}

// ── Tab "Piano formazione" ──────────────────────────────────────────
function righePianoFormazione() {
  if (typeof documentiDaSegnalareTS !== 'function') return [];
  return documentiDaSegnalareTS(documentiInVigoreTS, dipendentiElencoTS, subappaltatoriElenco)
    .filter(function(r) { return eDocumentoDiPersona(r.documento); });
}

async function renderPianoFormazione() {
  const box = ge('ts-piano-lista');
  if (!box) return;
  if (!(await verificaPianoFormazioneDisponibile())) {
    box.innerHTML = '<div class="al2 i">Il piano formazione si attiva con l\'aggiornamento del database. Le scadenze dei corsi sono già nella tab Scadenze, con il preavviso di ' + giorniPreavvisoCorsi() + ' giorni.</div>';
    return;
  }
  const righe = righePianoFormazione();
  const ids = righe.map(function(r) { return r.documento.id; });
  PIANO_FORM.iscrizioni = {};
  if (ids.length) {
    const { data } = await db.from('iscrizioni_corsi').select('documento_id, data_corso, ente, nota, stato, creato_da_nome').in('documento_id', ids).eq('stato', 'iscritto');
    (data || []).forEach(function(i) { PIANO_FORM.iscrizioni[i.documento_id] = i; });
  }
  const conta = ge('ts-piano-conta');
  const senza = righe.filter(function(r) { return !PIANO_FORM.iscrizioni[r.documento.id]; }).length;
  if (conta) conta.textContent = senza ? '(' + senza + ')' : '';
  const gestisce = typeof puoGestireTeamSubappalti === 'function' && puoGestireTeamSubappalti();
  const nota = '<div style="font-size:12px;color:var(--m);margin-bottom:8px">Corsi, patentini e visite delle persone scaduti o che scadono entro ' + giorniPreavvisoCorsi() +
    ' giorni (Impostazioni → Regole, "Preavviso scadenza di corsi e visite mediche"), con l\'iscrizione al corso di rinnovo.</div>';
  if (!righe.length) { box.innerHTML = nota + '<div class="al2 ok">Nessun corso o visita da rinnovare.</div>'; return; }
  box.innerHTML = nota + '<div class="rap-list-card">' + righe.map(function(r) {
    const d = r.documento;
    const stato = statoDocumentoTeamSubappalti(d);
    const isc = PIANO_FORM.iscrizioni[d.id];
    const persona = r.intestatario.tipo === 'dipendente' ? '👷 ' + r.intestatario.nome : '🏗️ ' + (d.riferito_a || '—') + ' (' + r.intestatario.nome + ')';
    return '<div data-piano-doc="' + esc(d.id) + '" style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">' +
      '<div style="min-width:0"><div style="font-weight:700">' + esc(persona) + ' <span class="bx ' + stato.classe + '">' + esc(stato.testo) + '</span></div>' +
      '<div style="font-size:12px;color:var(--m)">' + esc(nomeDocumentoTS(d)) + ' · scadenza ' + esc(fd(d.data_scadenza)) + '</div>' +
      '<div style="font-size:12px;margin-top:2px">' + (isc ? '📅 Iscritto al corso del <b>' + esc(fd(isc.data_corso)) + '</b>' + (isc.ente ? ' · ' + esc(isc.ente) : '') + (isc.nota ? ' · ' + esc(isc.nota) : '')
        : '<span style="color:var(--a)">Nessuna iscrizione al corso</span>') + '</div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' + (gestisce ? '<button class="btn sm' + (isc ? '' : ' p') + '" onclick="apriIscrizioneCorso(\'' + esc(d.id) + '\')">📅 ' + (isc ? 'Cambia' : 'Iscrivi') + '</button>' : '') +
      '<button class="btn sm" onclick="openSchedaDocumenti(\'' + esc(r.intestatario.tipo) + '\', \'' + esc(r.intestatario.id) + '\')">Apri</button></div></div>';
  }).join('') + '</div>';
}

if (typeof loadTeamSubappalti === 'function') {
  const loadTeamSubappaltiSenzaPiano = loadTeamSubappalti;
  // eslint-disable-next-line no-global-assign
  loadTeamSubappalti = async function() {
    try { if (typeof caricaRegole === 'function') await caricaRegole(false); } catch (e) { /* predefinito */ }
    const esito = await loadTeamSubappaltiSenzaPiano.apply(this, arguments);
    try { await renderPianoFormazione(); } catch (e) { console.warn('Piano formazione:', e); }
    return esito;
  };
}

// ── Iscrizione (titolare e segreteria) ──────────────────────────────
function apriIscrizioneCorso(documentoId) {
  const d = (documentiInVigoreTS || []).find(function(x) { return x.id === documentoId; });
  const isc = PIANO_FORM.iscrizioni[documentoId];
  ge('isc-id').value = documentoId;
  ge('isc-documento').textContent = d ? nomeDocumentoTS(d) + ' · scadenza ' + fd(d.data_scadenza) : '';
  ge('isc-data').value = isc ? isc.data_corso : '';
  ge('isc-ente').value = isc && isc.ente ? isc.ente : '';
  ge('isc-nota').value = isc && isc.nota ? isc.nota : '';
  ge('isc-annulla').style.display = isc ? '' : 'none';
  openM('m-iscrizione-corso');
}

async function salvaIscrizioneCorso() {
  const data = ge('isc-data').value;
  if (!data) { toast('Indica la data del corso', 'err'); return; }
  const { error } = await db.rpc('iscrivi_corso', { p_documento_id: ge('isc-id').value, p_data_corso: data, p_ente: ge('isc-ente').value || null, p_nota: ge('isc-nota').value || null });
  if (error) { toast('Iscrizione non salvata: ' + error.message, 'err'); return; }
  closeM('m-iscrizione-corso');
  toast('Iscrizione al corso salvata', 'ok');
  await renderPianoFormazione();
}

async function annullaIscrizioneCorso() {
  if (!confirm('Annullare l\'iscrizione a questo corso?')) return;
  const { error } = await db.rpc('annulla_iscrizione_corso', { p_documento_id: ge('isc-id').value, p_nota: ge('isc-nota').value || null });
  if (error) { toast('Non annullata: ' + error.message, 'err'); return; }
  closeM('m-iscrizione-corso');
  toast('Iscrizione annullata', 'ok');
  await renderPianoFormazione();
}

// ── Cosa tocca a me ─────────────────────────────────────────────────
async function mieiCorsiInScadenza() {
  if (!ME || !ME.id) return null;
  try { if (typeof caricaRegole === 'function') await caricaRegole(false); } catch (e) { /* predefinito */ }
  const { data, error } = await db.from('documenti_team_subappalti').select('id, tipo, descrizione, data_scadenza, utente_id')
    .eq('utente_id', ME.id).is('sostituito_da', null).not('data_scadenza', 'is', null);
  if (error) return null;
  return (data || []).filter(function(d) { const c = statoDocumentoTeamSubappalti(d).codice; return eDocumentoDiPersona(d) && (c === 'scaduto' || c === 'in_scadenza'); });
}

async function corsiSenzaIscrizione() {
  if (!(await verificaPianoFormazioneDisponibile())) return null;
  try { if (typeof caricaRegole === 'function') await caricaRegole(false); } catch (e) { /* predefinito */ }
  const [rd, ru, rs, ri] = await Promise.all([
    db.from('documenti_team_subappalti').select('id, tipo, utente_id, subappaltatore_id, riferito_a, data_scadenza, sostituito_da').is('sostituito_da', null).not('data_scadenza', 'is', null),
    db.from('utenti').select('id, nome, cognome, attivo'),
    db.from('subappaltatori').select('id, ragione_sociale, attivo'),
    db.from('iscrizioni_corsi').select('documento_id').eq('stato', 'iscritto')
  ]);
  if (rd.error || ru.error || rs.error || ri.error) return null;
  const iscritti = new Set((ri.data || []).map(function(i) { return i.documento_id; }));
  return documentiDaSegnalareTS(rd.data || [], ru.data || [], rs.data || [])
    .filter(function(r) { return eDocumentoDiPersona(r.documento) && !iscritti.has(r.documento.id); });
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'miei-corsi-scadenza', ruoli: ['titolare', 'segreteria', 'capo_tecnico', 'tecnico', 'commerciale', 'rappresentante', 'ingegnere', 'contabile'], icona: '🎓', priorita: 60,
    titolo: 'I tuoi corsi o visite in scadenza',
    vai: function() {
      mieiCorsiInScadenza().then(function(e) {
        if (!e || !e.length) return;
        toast(e.map(function(d) { return nomeDocumentoTS(d) + ': ' + statoDocumentoTeamSubappalti(d).testo.toLowerCase(); }).join(' · ') + '. Chiedi alla segreteria la data del corso.', 'ok');
      });
    },
    conta: async function() { const e = await mieiCorsiInScadenza(); return e === null ? null : e.length; }
  });
  registraFonteToccaAMe({
    id: 'corsi-senza-iscrizione', ruoli: ['titolare', 'segreteria'], icona: '📅', priorita: 45,
    titolo: 'Corsi e visite da rinnovare senza iscrizione',
    vai: function() {
      if (typeof gotoPage !== 'function') return;
      gotoPage('team-subappalti');
      setTimeout(function() { const b = [...document.querySelectorAll('#pg-team-subappalti .tab')].find(function(x) { return /Piano formazione/.test(x.textContent); }); if (b) b.click(); }, 600);
    },
    conta: async function() { const e = await corsiSenzaIscrizione(); return e === null ? null : e.length; }
  });
}

// Nota della tab Scadenze: i due preavvisi
if (typeof renderScadenzeTeamSubappalti === 'function') {
  const renderScadenzeSenzaPreavvisoCorsi = renderScadenzeTeamSubappalti;
  // eslint-disable-next-line no-global-assign
  renderScadenzeTeamSubappalti = function() {
    const esito = renderScadenzeSenzaPreavvisoCorsi.apply(this, arguments);
    const nota = document.querySelector('#ts-scadenze-lista > div');
    if (nota && /Documenti in vigore scaduti/.test(nota.textContent)) {
      nota.textContent = 'Documenti in vigore scaduti o in scadenza: corsi, patentini e visite entro ' + giorniPreavvisoCorsi() +
        ' giorni (Regole), documenti dell\'impresa entro ' + giorniPreavvisoDocumenti() + ' giorni (Soglie e tariffe). Dipendenti e subappaltatori non attivi esclusi.';
    }
    return esito;
  };
}
