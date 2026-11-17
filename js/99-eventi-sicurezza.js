// ── F20.2 INFORTUNI E QUASI-INCIDENTI + F20.3 DANNI (sql/170) ────────────
// Decisioni di Erika del 17/11: registrano SOLO capo tecnico, segreteria e
// titolare; nessuna scadenza INAIL calcolata (la segreteria segna la data
// della denuncia); danni con denuncia all'assicurazione entro la regola
// sinistro_denuncia_gg (3 giorni), decisione del titolare, costo nel
// consuntivo.
//   - "🚨 Infortunio o danno" tra le azioni della commessa (js/63) e "+
//     Registra" nell'elenco: finestra m-evento-sicurezza (id evs-).
//   - Elenco e dettaglio: finestra m-eventi-sicurezza (id evl-): eventi aperti
//     e ultimi chiusi; nel dettaglio dati sanitari (titolare, segreteria),
//     decisione del danno (titolare), stato (titolare, segreteria).
//   - Commessa: riquadro cmd-eventi con gli eventi e il costo dei danni.
//   - Avviso urgente (creato dal database) con "🚨 Apri l'evento"; Cosa tocca
//     a me: eventi aperti, danni da decidere, denunce in scadenza.
// Senza sql/170 nessun bottone né riquadro.

const EVENTI_SIC = { attivo: null, aperto: null, commessa: null };
const RUOLI_EVENTI_SIC = ['titolare', 'segreteria', 'capo_tecnico'];
const TIPI_EVENTO_SIC = { infortunio: '🚑 Infortunio', quasi_incidente: '⚠️ Quasi-incidente', danno: '💥 Danno al cliente o a terzi' };
const STATI_EVENTO_SIC = { aperto: 'Aperto', in_gestione: 'In gestione', chiuso: 'Chiuso' };
const DECISIONI_DANNO = { da_decidere: 'Da decidere (titolare)', paghiamo_noi: 'Lo paghiamo noi', assicurazione: 'Denuncia all\'assicurazione', non_dovuto: 'Non dovuto' };

async function verificaEventiSicurezzaDisponibili() {
  if (EVENTI_SIC.attivo !== null) return EVENTI_SIC.attivo;
  if (!RUOLI_EVENTI_SIC.includes(ROLE)) { EVENTI_SIC.attivo = false; return false; }
  try {
    const { data, error } = await db.rpc('eventi_sicurezza_attivi');
    EVENTI_SIC.attivo = !error && data === true;
  } catch (e) { EVENTI_SIC.attivo = false; }
  return EVENTI_SIC.attivo;
}

function oraLocaleEvento(d) {
  const x = d || new Date();
  const z = function(n) { return String(n).padStart(2, '0'); };
  return x.getFullYear() + '-' + z(x.getMonth() + 1) + '-' + z(x.getDate()) + 'T' + z(x.getHours()) + ':' + z(x.getMinutes());
}

// ── Registrazione ───────────────────────────────────────────────────
async function apriNuovoEventoSicurezza(commessaId) {
  if (!(await verificaEventiSicurezzaDisponibili())) { toast('Registro di infortuni e danni non ancora attivo', 'err'); return; }
  EVENTI_SIC.commessa = commessaId || null;
  ge('evs-tipo').value = 'quasi_incidente';
  ge('evs-quando').value = oraLocaleEvento();
  ['evs-luogo', 'evs-descrizione', 'evs-esterno', 'evs-testimoni', 'evs-danneggiato'].forEach(function(id) { ge(id).value = ''; });
  const { data } = await db.from('utenti').select('id, nome, cognome, ruolo').eq('attivo', true).order('nome');
  ge('evs-persona').innerHTML = '<option value="">— nessuno / esterno —</option>' + (data || []).filter(function(u) { return u.ruolo !== 'informatico'; })
    .map(function(u) { return '<option value="' + esc(u.id) + '">' + esc([u.nome, u.cognome].filter(Boolean).join(' ')) + ' · ' + esc(etichettaRuolo(u.ruolo)) + '</option>'; }).join('');
  let dove = 'Senza commessa';
  if (commessaId) {
    const { data: c } = await db.from('commesse').select('codice, titolo').eq('id', commessaId).maybeSingle();
    if (c) dove = 'Commessa ' + c.codice + (c.titolo ? ' · ' + c.titolo : '');
  }
  ge('evs-dove').textContent = dove;
  cambiaTipoEventoSicurezza();
  openM('m-evento-sicurezza');
}

function cambiaTipoEventoSicurezza() {
  const t = ge('evs-tipo').value;
  ge('evs-danneggiato-box').style.display = t === 'danno' ? '' : 'none';
  ge('evs-persona-label').textContent = t === 'danno' ? 'Chi ha causato il danno (facoltativo)' : 'Persona coinvolta';
}

async function salvaEventoSicurezza() {
  const tipo = ge('evs-tipo').value;
  const descrizione = (ge('evs-descrizione').value || '').trim();
  if (descrizione.length < 3) { toast('Scrivi cosa è successo', 'err'); return; }
  const quando = ge('evs-quando').value ? new Date(ge('evs-quando').value).toISOString() : null;
  const b = ge('evs-salva'); if (b) b.disabled = true;
  const { error } = await db.rpc('registra_evento_sicurezza', {
    p_tipo: tipo, p_descrizione: descrizione, p_accaduto_il: quando, p_commessa_id: EVENTI_SIC.commessa, p_odl_id: null,
    p_luogo: ge('evs-luogo').value || null, p_persona_utente_id: ge('evs-persona').value || null,
    p_persona_esterna: ge('evs-esterno').value || null, p_testimoni: ge('evs-testimoni').value || null,
    p_danneggiato: tipo === 'danno' ? (ge('evs-danneggiato').value || null) : null
  });
  if (b) b.disabled = false;
  if (error) { toast('Non registrato: ' + error.message, 'err'); return; }
  closeM('m-evento-sicurezza');
  toast((TIPI_EVENTO_SIC[tipo] || 'Evento') + ' registrato: avvisati titolare, segreteria e capo tecnico', 'ok');
  if (typeof commessaApertaId !== 'undefined' && commessaApertaId && EVENTI_SIC.commessa === commessaApertaId) await caricaEventiCommessa(commessaApertaId);
  if (ge('m-eventi-sicurezza') && ge('m-eventi-sicurezza').classList.contains('on')) await disegnaElencoEventi();
}

// ── Elenco e dettaglio ──────────────────────────────────────────────
async function apriElencoEventiSicurezza() {
  if (!(await verificaEventiSicurezzaDisponibili())) return;
  EVENTI_SIC.aperto = null;
  await disegnaElencoEventi();
  openM('m-eventi-sicurezza');
}

function rigaEventoSic(e) {
  const oggi = dataLocaleISO(new Date());
  const scad = e.tipo === 'danno' && !e.denuncia_fatta_il && ['da_decidere', 'assicurazione'].includes(e.decisione) && e.denuncia_entro;
  return '<div data-evento-sic="' + esc(e.id) + '" style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">' +
    '<div style="min-width:0"><div style="font-weight:700;font-size:13px">' + esc(TIPI_EVENTO_SIC[e.tipo] || e.tipo) + ' <span class="bx ' + (e.stato === 'chiuso' ? 'bgray' : e.stato === 'aperto' ? 'berr' : 'bwarn') + '">' + esc(STATI_EVENTO_SIC[e.stato]) + '</span>' +
    (e.tipo === 'danno' ? ' <span class="bx bblue">' + esc(DECISIONI_DANNO[e.decisione] || '') + '</span>' : '') + '</div>' +
    '<div style="font-size:12px;color:var(--m)">' + esc(new Date(e.accaduto_il).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })) +
    (e.commesse && e.commesse.codice ? ' · commessa ' + esc(e.commesse.codice) : '') + ' · ' + esc(String(e.descrizione).slice(0, 120)) + '</div>' +
    (scad ? '<div style="font-size:12px;' + (e.denuncia_entro <= oggi ? 'color:var(--r)' : '') + '">📨 Denuncia all\'assicurazione entro il ' + esc(fd(e.denuncia_entro)) + '</div>' : '') + '</div>' +
    '<button class="btn sm" onclick="apriDettaglioEventoSicurezza(\'' + esc(e.id) + '\')">Apri</button></div>';
}

async function disegnaElencoEventi() {
  const box = ge('evl-contenuto');
  box.innerHTML = '<div class="load">Caricamento...</div>';
  const [ra, rc] = await Promise.all([
    db.from('eventi_sicurezza').select('*, commesse(codice)').neq('stato', 'chiuso').order('accaduto_il', { ascending: false }).limit(200),
    db.from('eventi_sicurezza').select('*, commesse(codice)').eq('stato', 'chiuso').order('chiuso_il', { ascending: false }).limit(20)
  ]);
  if (ra.error) { box.innerHTML = '<div class="al2 e">Errore: ' + esc(ra.error.message) + '</div>'; return; }
  box.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:6px"><button class="btn sm p" onclick="apriNuovoEventoSicurezza(null)">+ Registra</button></div>' +
    '<div style="font-size:13px;font-weight:700;margin:4px 0">Aperti (' + (ra.data || []).length + ')</div>' +
    ((ra.data || []).map(rigaEventoSic).join('') || '<div class="empty">Nessun evento aperto</div>') +
    ((rc.data || []).length ? '<details style="margin-top:8px"><summary style="font-size:13px;cursor:pointer">Ultimi chiusi (' + rc.data.length + ')</summary>' + rc.data.map(rigaEventoSic).join('') + '</details>' : '');
}

async function apriDettaglioEventoSicurezza(id) {
  if (!(await verificaEventiSicurezzaDisponibili())) return;
  const { data: e, error } = await db.from('eventi_sicurezza').select('*, commesse(codice, titolo), utenti!eventi_sicurezza_persona_utente_id_fkey(nome, cognome)').eq('id', id).maybeSingle();
  if (error || !e) { toast('Evento non trovato' + (error ? ': ' + error.message : ''), 'err'); return; }
  EVENTI_SIC.aperto = e;
  const gestisce = ['titolare', 'segreteria'].includes(ROLE);
  let san = null;
  if (e.tipo === 'infortunio' && gestisce) {
    const r = await db.from('eventi_sicurezza_sanitari').select('*').eq('evento_id', id).maybeSingle();
    san = r.data || null;
  }
  const persona = e.utenti ? [e.utenti.nome, e.utenti.cognome].filter(Boolean).join(' ') : '';
  const righe = [
    ['Quando', new Date(e.accaduto_il).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
    ['Commessa', e.commesse ? e.commesse.codice + (e.commesse.titolo ? ' · ' + e.commesse.titolo : '') : ''],
    ['Dove', e.luogo], ['Cosa è successo', e.descrizione], ['Persona', [persona, e.persona_esterna].filter(Boolean).join(' · ')],
    ['Testimoni', e.testimoni], ['Danneggiato', e.danneggiato],
    ['Registrato da', (e.registrato_da_nome || '') + ' il ' + new Date(e.registrato_il).toLocaleDateString('it-IT')]
  ].filter(function(r) { return r[1]; });
  let html = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><button class="btn sm" onclick="disegnaElencoEventi()">← Elenco</button>' +
    '<b>' + esc(TIPI_EVENTO_SIC[e.tipo]) + '</b> <span class="bx ' + (e.stato === 'chiuso' ? 'bgray' : 'bwarn') + '">' + esc(STATI_EVENTO_SIC[e.stato]) + '</span></div>' +
    righe.map(function(r) { return '<div style="font-size:13px;margin:2px 0;overflow-wrap:anywhere"><span style="color:var(--m)">' + esc(r[0]) + ':</span> ' + esc(r[1]) + '</div>'; }).join('');
  if (e.tipo === 'infortunio') {
    html += '<div class="card" style="margin-top:8px"><div style="font-size:13px;font-weight:700">🩺 Dati sanitari (riservati)</div>';
    if (gestisce) {
      html += '<div class="g2"><div class="f"><label>Prognosi (giorni)</label><input type="number" id="evd-prognosi" min="0" max="999" value="' + esc(san && san.prognosi_giorni != null ? san.prognosi_giorni : '') + '"></div>' +
        '<div class="f"><label>Denuncia INAIL fatta il</label><input type="date" id="evd-inail" value="' + esc(san && san.denuncia_inail_il ? san.denuncia_inail_il : '') + '"></div></div>' +
        '<div class="f"><label>Lesioni</label><input type="text" id="evd-lesioni" maxlength="1000" value="' + esc(san && san.lesioni ? san.lesioni : '') + '"></div>' +
        '<div class="f"><label>Nota</label><input type="text" id="evd-san-nota" maxlength="500" value="' + esc(san && san.nota ? san.nota : '') + '"></div>' +
        '<div style="font-size:12px;color:var(--m);margin-bottom:6px">Se la prognosi supera i 3 giorni la denuncia INAIL va fatta entro 2 giorni dal certificato: segna qui la data quando l\'hai fatta.</div>' +
        '<button class="btn sm p" onclick="salvaSanitariEvento()">💾 Salva i dati sanitari</button>';
    } else html += '<div style="font-size:12px;color:var(--m)">Li vedono solo titolare, segreteria e la persona infortunata.</div>';
    html += '</div>';
  }
  if (e.tipo === 'danno') {
    html += '<div class="card" style="margin-top:8px"><div style="font-size:13px;font-weight:700">💥 Gestione del danno</div>' +
      '<div style="font-size:13px">Denuncia all\'assicurazione entro il <b>' + esc(fd(e.denuncia_entro)) + '</b>' + (e.denuncia_fatta_il ? ' · fatta il ' + esc(fd(e.denuncia_fatta_il)) : '') + '</div>';
    if (ROLE === 'titolare') {
      html += '<div class="g2"><div class="f"><label>Decisione</label><select id="evd-decisione">' + Object.keys(DECISIONI_DANNO).map(function(k) { return '<option value="' + k + '"' + (k === e.decisione ? ' selected' : '') + '>' + esc(DECISIONI_DANNO[k]) + '</option>'; }).join('') + '</select></div>' +
        '<div class="f"><label>Costo (€)</label><input type="number" id="evd-costo" min="0" step="0.01" value="' + esc(e.costo != null ? e.costo : '') + '"></div></div>' +
        '<div class="g2"><div class="f"><label>Denuncia fatta il</label><input type="date" id="evd-denuncia" value="' + esc(e.denuncia_fatta_il || '') + '"></div>' +
        '<div class="f"><label>Nota</label><input type="text" id="evd-dec-nota" maxlength="500" value="' + esc(e.decisione_nota || '') + '"></div></div>' +
        '<button class="btn sm p" onclick="salvaDecisioneDanno()">💾 Salva la decisione</button>';
    } else {
      html += '<div style="font-size:13px;margin-top:4px">Decisione: <b>' + esc(DECISIONI_DANNO[e.decisione]) + '</b>' + (e.costo != null && typeof euroPreventivo === 'function' ? ' · costo ' + esc(euroPreventivo(e.costo)) : '') +
        (e.decisione_nota ? ' · ' + esc(e.decisione_nota) : '') + (e.deciso_da_nome ? ' <span style="color:var(--m)">(' + esc(e.deciso_da_nome) + ')</span>' : '') + '</div>';
    }
    html += '</div>';
  }
  if (gestisce) {
    html += '<div class="card" style="margin-top:8px"><div class="g2"><div class="f"><label>Stato</label><select id="evd-stato">' + Object.keys(STATI_EVENTO_SIC).map(function(k) { return '<option value="' + k + '"' + (k === e.stato ? ' selected' : '') + '>' + STATI_EVENTO_SIC[k] + '</option>'; }).join('') + '</select></div>' +
      '<div class="f"><label>Nota</label><input type="text" id="evd-stato-nota" maxlength="500" value="' + esc(e.nota_stato || '') + '"></div></div>' +
      '<button class="btn sm" onclick="salvaStatoEvento()">💾 Salva lo stato</button></div>';
  }
  ge('evl-contenuto').innerHTML = html;
  if (!ge('m-eventi-sicurezza').classList.contains('on')) openM('m-eventi-sicurezza');
}

async function salvaSanitariEvento() {
  const e = EVENTI_SIC.aperto; if (!e) return;
  const p = ge('evd-prognosi').value;
  const { error } = await db.rpc('aggiorna_sanitari_infortunio', { p_evento_id: e.id, p_prognosi_giorni: p === '' ? null : parseInt(p, 10), p_lesioni: ge('evd-lesioni').value || null, p_denuncia_inail_il: ge('evd-inail').value || null, p_nota: ge('evd-san-nota').value || null });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  toast('Dati sanitari salvati', 'ok');
  await apriDettaglioEventoSicurezza(e.id);
}

async function salvaDecisioneDanno() {
  const e = EVENTI_SIC.aperto; if (!e) return;
  const c = ge('evd-costo').value;
  const { error } = await db.rpc('decidi_danno', { p_evento_id: e.id, p_decisione: ge('evd-decisione').value, p_costo: c === '' ? null : Number(c), p_denuncia_fatta_il: ge('evd-denuncia').value || null, p_nota: ge('evd-dec-nota').value || null });
  if (error) { toast('Non salvata: ' + error.message, 'err'); return; }
  toast('Decisione salvata', 'ok');
  await apriDettaglioEventoSicurezza(e.id);
}

async function salvaStatoEvento() {
  const e = EVENTI_SIC.aperto; if (!e) return;
  const { error } = await db.rpc('cambia_stato_evento_sicurezza', { p_evento_id: e.id, p_stato: ge('evd-stato').value, p_nota: ge('evd-stato-nota').value || null });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  toast('Stato salvato', 'ok');
  await apriDettaglioEventoSicurezza(e.id);
}

// ── Commessa ────────────────────────────────────────────────────────
if (typeof registraAzioneScheda === 'function') {
  registraAzioneScheda('commessa', {
    codice: 'evento_sicurezza', etichetta: '🚨 Infortunio o danno', ruoli: RUOLI_EVENTI_SIC,
    quando: function() { return EVENTI_SIC.attivo === true; },
    esegui: function(c) { return apriNuovoEventoSicurezza(c.id); }
  });
}

async function caricaEventiCommessa(commessaId) {
  const box = ge('cmd-eventi');
  if (!box) return;
  box.innerHTML = '';
  if (!(await verificaEventiSicurezzaDisponibili())) return;
  const { data, error } = await db.from('eventi_sicurezza').select('*, commesse(codice)').eq('commessa_id', commessaId).order('accaduto_il', { ascending: false });
  if (error || !(data || []).length) return;
  const costo = data.filter(function(e) { return e.tipo === 'danno' && e.decisione === 'paghiamo_noi' && e.costo; }).reduce(function(t, e) { return t + Number(e.costo); }, 0);
  box.innerHTML = '<div class="card"><div style="font-size:14px;font-weight:700">🚨 Infortuni, quasi-incidenti e danni (' + data.length + ')</div>' +
    (costo && typeof euroPreventivo === 'function' ? '<div style="font-size:13px;margin-top:2px">Costo dei danni a nostro carico (nel consuntivo): <b>' + esc(euroPreventivo(costo)) + '</b></div>' : '') +
    data.map(rigaEventoSic).join('') + '</div>';
}

if (typeof caricaSchedaCommessa === 'function') {
  const caricaSchedaCommessaSenzaEventi = caricaSchedaCommessa;
  // eslint-disable-next-line no-global-assign
  caricaSchedaCommessa = async function(commessaId) {
    try { await verificaEventiSicurezzaDisponibili(); } catch (e) { /* senza */ }
    const esito = await caricaSchedaCommessaSenzaEventi.apply(this, arguments);
    try { await caricaEventiCommessa(commessaId); } catch (e) { console.warn('Eventi di sicurezza:', e); }
    return esito;
  };
}

// ── Avvisi e Cosa tocca a me ────────────────────────────────────────
if (typeof registraAzioneRapidaAvviso === 'function') {
  registraAzioneRapidaAvviso('evento_sicurezza', {
    etichetta: '🚨 Apri l\'evento',
    puo: function(a) { return !!a.rif_id && RUOLI_EVENTI_SIC.includes(ROLE); },
    fai: function(a) { closeM('m-avvisi'); return apriDettaglioEventoSicurezza(a.rif_id); }
  });
}

async function contaEventiSic(filtro) {
  if (!(await verificaEventiSicurezzaDisponibili())) return null;
  let q = db.from('eventi_sicurezza').select('id', { count: 'exact', head: true });
  q = filtro(q);
  const { count, error } = await q;
  return error ? null : (count || 0);
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'eventi-sicurezza-aperti', ruoli: RUOLI_EVENTI_SIC, icona: '🚨', priorita: 5,
    titolo: 'Infortuni, quasi-incidenti e danni aperti',
    vai: function() { apriElencoEventiSicurezza(); },
    conta: function() { return contaEventiSic(function(q) { return q.neq('stato', 'chiuso'); }); }
  });
  registraFonteToccaAMe({
    id: 'danni-da-decidere', ruoli: ['titolare'], icona: '💥', priorita: 6,
    titolo: 'Danni da decidere',
    vai: function() { apriElencoEventiSicurezza(); },
    conta: function() { return contaEventiSic(function(q) { return q.eq('tipo', 'danno').eq('decisione', 'da_decidere').neq('stato', 'chiuso'); }); }
  });
  registraFonteToccaAMe({
    id: 'denunce-sinistro', ruoli: ['titolare', 'segreteria'], icona: '📨', priorita: 7,
    titolo: 'Danni da denunciare all\'assicurazione (scadenza entro domani)',
    vai: function() { apriElencoEventiSicurezza(); },
    conta: function() {
      const domani = new Date(); domani.setDate(domani.getDate() + 1);
      return contaEventiSic(function(q) { return q.eq('tipo', 'danno').in('decisione', ['da_decidere', 'assicurazione']).is('denuncia_fatta_il', null).lte('denuncia_entro', dataLocaleISO(domani)).neq('stato', 'chiuso'); });
    }
  });
}
