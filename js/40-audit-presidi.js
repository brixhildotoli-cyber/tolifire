// =====================================================================
// F10.2 — AUDIT DEI PRESIDI ALLA PRIMA MANUTENZIONE (Fase 10, Service).
// Con sql/41:
//   - annata dei presidi (impianti.annata, anno di fabbricazione) nella
//     finestra del presidio (campo mp-annata, tutti i tipi);
//   - intervento "prima manutenzione con audit" (ordini_lavoro.audit_presidi):
//     lo mette il database da solo al primo intervento di manutenzione
//     programmata di un cliente con contratto (mai una manutenzione
//     completata prima); titolare e capo tecnico lo mettono o lo tolgono
//     a mano dalla finestra dell'intervento (box mo-audit-presidi, RPC
//     imposta_audit_presidi_intervento, motivo obbligatorio per toglierlo);
//   - "Esegui intervento" del tecnico: al passo Presidi ogni presidio va
//     segnato "Trovato" (matricola e annata obbligatorie) o "Non trovato";
//     i presidi nuovi si aggiungono con "+ Aggiungi". Alla chiusura il
//     sito salva matricola e annata, registra l'audit (RPC
//     registra_audit_presidi) e poi chiude la scheda come sempre
//     (salvaInt di js/11). Il database rifiuta la chiusura se manca
//     qualcosa (trigger trg_ordini_lavoro_audit_presidi);
//   - differenze tra presidi trovati e contratto (presidi_contratto di
//     sql/40, contratto attuale) nel box "Audit presidi" delle dashboard
//     del capo tecnico (Responsabile Service), del rappresentante del
//     cliente (il "Commerciale", D1) e del titolare (RPC
//     audit_presidi_da_esaminare); "Esaminato" con nota facoltativa
//     (RPC segna_audit_presidi_esaminato).
// Le schede SENZA audit restano identiche: ogni funzione ridefinita qui
// chiama quella di prima se l'intervento scelto non ha l'audit.
// Senza sql/41: nessun campo annata, nessun audit, nessun box.
// Senza sql/40: l'audit funziona, il confronto con il contratto "non è
// ancora attivo".
// Id usati: mp-annata*, aud-*, mo-audit-*, tit-/ct-/rap-audit-presidi.
// =====================================================================

const RUOLI_IMPOSTA_AUDIT = ['titolare', 'capo_tecnico'];
const BOX_AUDIT_PRESIDI = {
  titolare: 'tit-audit-presidi',
  capo_tecnico: 'ct-audit-presidi',
  rappresentante: 'rap-audit-presidi'
};

let auditPresidiDisponibile = null;
let auditInCorso = null;        // { odlId, clienteId } intervento con audit scelto dal tecnico
let auditValori = {};           // pid -> { esito, matricola, annata, stato, note } scritti dal tecnico
let auditPresidiLista = [];     // presidi mostrati al passo Presidi
let salvataggioAudit = false;

// true se sql/41 è stato eseguito (colonna ordini_lavoro.audit_presidi).
async function verificaAuditPresidiDisponibile() {
  if (auditPresidiDisponibile !== null) return auditPresidiDisponibile;
  const { error } = await db.from('ordini_lavoro').select('audit_presidi').limit(1);
  if (!error) {
    auditPresidiDisponibile = true;
  } else if (error.code === '42703' || error.code === 'PGRST204' || /audit_presidi/i.test(error.message || '')) {
    auditPresidiDisponibile = false;
  } else {
    return false; // errore diverso (es. non ancora collegati): si riprova dopo
  }
  return auditPresidiDisponibile;
}

function auditPresidiAttivo() {
  return auditPresidiDisponibile === true;
}

function annoMassimoAnnata() {
  return new Date().getFullYear() + 1;
}

// Annata scritta valida? Restituisce il numero, null se vuota, false se non valida.
function leggiAnnata(testo) {
  const t = String(testo ?? '').trim();
  if (!t) return null;
  if (!/^\d{4}$/.test(t)) return false;
  const n = Number(t);
  if (n < 1900 || n > annoMassimoAnnata()) return false;
  return n;
}

function testoErroreAnnata() {
  return 'Annata non valida: anno di fabbricazione a 4 cifre, tra 1900 e ' + annoMassimoAnnata() + '.';
}

// ── Finestra del presidio: campo Annata ────────────────────────────────
async function aggiornaCampoAnnata() {
  const box = ge('mp-annata-box');
  if (!box) return;
  const ok = await verificaAuditPresidiDisponibile();
  box.style.display = ok ? '' : 'none';
}

// Usata da saveP (js/07 e js/22): {} senza sql/41, {annata} con sql/41,
// null se l'annata scritta non è valida (avviso già mostrato).
function datiAnnataPresidio() {
  if (!auditPresidiAttivo()) return {};
  const el = ge('mp-annata');
  if (!el) return {};
  const n = leggiAnnata(el.value);
  if (n === false) {
    toast(testoErroreAnnata(), 'err');
    return null;
  }
  return { annata: n };
}

const resetPFPrimaAudit = resetPF;
resetPF = function() {
  resetPFPrimaAudit.apply(this, arguments);
  const el = ge('mp-annata');
  if (el) el.value = '';
  aggiornaCampoAnnata().catch(function(e) { console.warn('aggiornaCampoAnnata:', e); });
};

const editPPrimaAudit = editP;
editP = function(id) {
  editPPrimaAudit.apply(this, arguments);
  const p = PA.find(function(r) { return r.id === id; });
  const el = ge('mp-annata');
  if (el) el.value = p && p.annata ? String(p.annata) : '';
};

// Spunte, stato e note già scritti al passo Presidi (chiave: id del presidio).
function leggiLavoroPassoPresidi() {
  const lavoro = {};
  document.querySelectorAll('#pcl input[type=checkbox][id^="upd-"]').forEach(function(cb) {
    const pid = cb.id.slice(4);
    lavoro[pid] = {
      spuntato: cb.checked,
      stato: ge('stato-' + pid) ? ge('stato-' + pid).value : null,
      note: ge('note-' + pid) ? ge('note-' + pid).value : null
    };
  });
  return lavoro;
}

function rimettiLavoroPassoPresidi(lavoro) {
  Object.keys(lavoro).forEach(function(pid) {
    const l = lavoro[pid];
    const cb = ge('upd-' + pid);
    if (!cb) return;
    cb.checked = l.spuntato;
    const det = ge('detail-' + pid);
    if (det) det.style.display = l.spuntato ? 'block' : 'none';
    if (l.stato !== null && ge('stato-' + pid)) ge('stato-' + pid).value = l.stato;
    if (l.note !== null && ge('note-' + pid)) ge('note-' + pid).value = l.note;
  });
}

// Dopo il salvataggio di un presidio dal passo Presidi del tecnico si
// ricarica l'elenco (si vede subito il presidio aggiunto o corretto)
// tenendo il lavoro già fatto: spunte, stato e note degli altri presidi.
// Con l'audit i valori restano in auditValori (renderPresidiAudit).
const savePPrimaAudit = saveP;
saveP = async function() {
  const sulPassoPresidi = ge('pg-tecnico') && ge('pg-tecnico').classList.contains('on') &&
    ge('ts3') && ge('ts3').classList.contains('on');
  const lavoro = sulPassoPresidi ? leggiLavoroPassoPresidi() : {};
  const r = await savePPrimaAudit.apply(this, arguments);
  const finestraChiusa = !(ge('m-presidio') && ge('m-presidio').classList.contains('on'));
  if (finestraChiusa && sulPassoPresidi) {
    try {
      const conAudit = auditAttivoSuScheda();
      await loadPC();
      if (!conAudit) rimettiLavoroPassoPresidi(lavoro);
    } catch (e) { console.warn('loadPC dopo il presidio:', e); }
  }
  return r;
};

// ── Tecnico: intervento con audit ───────────────────────────────────────
function auditAttivoSuScheda() {
  return !!(auditInCorso && v('tc-odl') === auditInCorso.odlId && v('tc1') === auditInCorso.clienteId);
}

function schedaImpossibilitata() {
  const cb = ge('tc-impossibilitato');
  return !!(cb && cb.checked);
}

function azzeraAuditInCorso() {
  auditInCorso = null;
  auditValori = {};
  auditPresidiLista = [];
}

function htmlAvvisoAuditTecnico() {
  return '<div id="tec-audit-avviso" style="background:var(--al);border-left:3px solid var(--a);border-radius:10px;padding:12px;font-size:13px;margin-bottom:10px">' +
    '<div style="font-size:11px;font-weight:700;color:var(--a);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">🔎 Prima manutenzione con audit</div>' +
    '<div>Al passo <strong>Presidi</strong> segna ogni presidio come <strong>trovato</strong> (con matricola e annata) o <strong>non trovato</strong>, e aggiungi quelli che trovi in più. Senza, la scheda non si chiude.</div>' +
    '</div>';
}

async function caricaAuditIntervento(odlId) {
  if (!(await verificaAuditPresidiDisponibile())) return;
  const { data, error } = await db.from('ordini_lavoro')
    .select('id,cliente_id,audit_presidi')
    .eq('id', odlId)
    .maybeSingle();
  if (error) { console.warn('Audit intervento:', error.message); return; }
  if (v('tc-odl') !== odlId) return;
  if (!data || !data.audit_presidi) { azzeraAuditInCorso(); return; }
  if (!auditInCorso || auditInCorso.odlId !== odlId) {
    auditValori = {};
    auditInCorso = { odlId: odlId, clienteId: data.cliente_id };
  }
  const info = ge('tec-odl-info');
  if (info) {
    const vecchio = ge('tec-audit-avviso');
    if (vecchio) vecchio.remove();
    info.insertAdjacentHTML('afterbegin', htmlAvvisoAuditTecnico());
    info.style.display = 'block';
  }
}

const preloadFromOdlPrimaAudit = preloadFromOdl;
preloadFromOdl = async function() {
  const odlId = v('tc-odl');
  if (!odlId || (auditInCorso && auditInCorso.odlId !== odlId)) azzeraAuditInCorso();
  const r = await preloadFromOdlPrimaAudit.apply(this, arguments);
  if (odlId && v('tc-odl') === odlId) {
    try { await caricaAuditIntervento(odlId); } catch (e) { console.warn('caricaAuditIntervento:', e); }
  }
  return r;
};

// Nella tendina "Intervento assegnato" gli interventi con audit hanno il segno 🔎.
const loadOdlTecnicoPrimaAudit = loadOdlTecnico;
loadOdlTecnico = async function() {
  const r = await loadOdlTecnicoPrimaAudit.apply(this, arguments);
  try {
    const sel = ge('tc-odl');
    if (!sel || !(await verificaAuditPresidiDisponibile())) return r;
    const ids = [...sel.options].map(function(o) { return o.value; }).filter(Boolean);
    if (!ids.length) return r;
    const { data, error } = await db.from('ordini_lavoro').select('id').in('id', ids).eq('audit_presidi', true);
    if (error) return r;
    const conAudit = new Set((data || []).map(function(o) { return o.id; }));
    [...sel.options].forEach(function(o) {
      if (conAudit.has(o.value) && o.textContent.indexOf('🔎') !== 0) o.textContent = '🔎 AUDIT · ' + o.textContent;
    });
  } catch (e) { console.warn('Segno audit negli interventi:', e); }
  return r;
};

// Passo Presidi: con l'audit si mostra l'elenco da compilare, altrimenti
// quello di sempre (loadPC di js/11).
const loadPCPrimaAudit = loadPC;
loadPC = async function() {
  if (auditAttivoSuScheda()) return renderPresidiAudit();
  return loadPCPrimaAudit.apply(this, arguments);
};

function etichettaSedeAudit(s) {
  if (!s) return 'Sede principale / non specificata';
  const ind = [s.via, s.civico].filter(Boolean).join(' ');
  return (s.tipo || 'Sede').toUpperCase() + (s.nome ? ' — ' + s.nome : '') + (ind ? ': ' + ind : '') + (s.citta ? ', ' + s.citta : '');
}

function valoreAudit(p) {
  if (!auditValori[p.id]) {
    auditValori[p.id] = {
      esito: '',
      matricola: p.matricola || '',
      annata: p.annata ? String(p.annata) : '',
      stato: ['ok', 'anomalia', 'fuori_servizio'].includes(p.stato) ? p.stato : 'ok',
      note: p.note || ''
    };
  }
  return auditValori[p.id];
}

async function renderPresidiAudit() {
  if (typeof ricordaPosizionePagina === 'function') ricordaPosizionePagina();
  const el = ge('pcl');
  if (!el || !auditInCorso) return;
  const cid = auditInCorso.clienteId;
  el.innerHTML = '<div class="load">Caricamento presidi da censire...</div>';
  let pp = null, perio = null, sedi = null;
  if (ROLE === 'tecnico') {
    const r = await db.rpc('parco_presidi_cliente', { p_cliente_id: cid });
    if (!r.error && r.data) { pp = r.data.impianti || []; perio = r.data.periodicita || null; sedi = r.data.sedi || []; }
  }
  if (!pp) {
    const [rp, rperio, rsedi] = await Promise.all([
      db.from('impianti').select('*').eq('cliente_id', cid).is('eliminato_il', null).order('tipo').order('matricola'),
      db.from('clienti_periodicita').select('*').eq('cliente_id', cid).maybeSingle(),
      db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').eq('cliente_id', cid)
    ]);
    if (rp.error) {
      el.innerHTML = '<div class="empty">Non riesco a caricare i presidi: ' + esc(rp.error.message) + '</div>';
      return;
    }
    pp = rp.data || []; perio = rperio.data || null; sedi = rsedi.data || [];
  }
  if (!auditAttivoSuScheda() || auditInCorso.clienteId !== cid) return;
  pp = pp.filter(function(p) { return !p.eliminato_il; });
  auditPresidiLista = pp;
  const sediMap = {};
  (sedi || []).forEach(function(s) { sediMap[s.id] = s; });
  const piuSedi = (sedi || []).length > 1;

  const intro = '<div style="background:var(--al);border-left:3px solid var(--a);border-radius:var(--rs);padding:10px;font-size:12px;margin-bottom:10px">' +
    '<strong style="color:var(--a)">🔎 Prima manutenzione con audit</strong><br>' +
    'Per ogni presidio scegli <strong>Trovato</strong> (matricola e annata obbligatorie) o <strong>Non trovato</strong>. ' +
    'Se trovi presidi che non sono in elenco aggiungili con <strong>+ Aggiungi</strong>. La scheda si chiude solo quando sono tutti compilati.' +
    '</div><div id="aud-contatore" style="font-size:12px;font-weight:600;margin-bottom:10px"></div>';

  if (!pp.length) {
    el.innerHTML = intro + '<div class="empty">Nessun presidio nel registro del cliente.<br>Aggiungi ogni presidio che trovi.<br>' +
      '<button class="btn p sm" style="margin-top:8px" onclick="apriAggiungiPresidioTec()">+ Aggiungi presidio</button></div>';
    aggiornaContatoreAudit();
    return;
  }

  const righe = pp.map(function(p) {
    const val = valoreAudit(p);
    const mesiTipo = perio && perio[p.tipo] ? PERIO_MESI[perio[p.tipo]] : null;
    const mesi = mesiTipo || p.periodicita_mesi || 0;
    const pid = esc(p.id);
    const sede = piuSedi || p.sede_id ? '<div style="font-size:11px;color:var(--m)">📍 ' + esc(etichettaSedeAudit(sediMap[p.sede_id])) + '</div>' : '';
    const opz = function(valore, testo) { return '<option value="' + valore + '"' + (val.esito === valore ? ' selected' : '') + '>' + testo + '</option>'; };
    const opzStato = function(valore, testo) { return '<option value="' + valore + '"' + (val.stato === valore ? ' selected' : '') + '>' + testo + '</option>'; };
    return '<div id="aud-box-' + pid + '" style="background:var(--bg);border-radius:var(--rs);padding:10px;margin-bottom:8px;border-left:3px solid var(--bo)">' +
      // Spunta nascosta letta da salvaInt (js/11): aggiorna ultima/prossima verifica dei presidi trovati.
      '<input type="checkbox" id="upd-' + pid + '" data-pid="' + pid + '" data-mesi="' + mesi + '" style="display:none"' + (val.esito === 'trovato' ? ' checked' : '') + '>' +
      '<div style="font-size:13px;font-weight:600;overflow-wrap:anywhere">' + esc(tpl(p.tipo)) + (p.ubicazione ? ' — ' + esc(p.ubicazione) : '') + (p.piano ? ' · Piano ' + esc(p.piano) : '') + '</div>' +
      '<div style="font-size:11px;color:var(--m)">Nel registro: matricola ' + esc(p.matricola || '—') + ' · annata ' + esc(p.annata || '—') + '</div>' +
      sede +
      '<div class="f" style="margin:8px 0 0"><label style="font-size:11px">Esito audit *</label>' +
        '<select id="aud-esito-' + pid + '" data-pid="' + pid + '" onchange="cambiaEsitoAudit(this.dataset.pid)" style="width:100%;font-size:14px">' +
          opz('', '— Da compilare —') + opz('trovato', '✅ Trovato e verificato') + opz('non_trovato', '❌ Non trovato sul posto') +
        '</select></div>' +
      '<div id="aud-dati-' + pid + '" style="display:' + (val.esito === 'trovato' ? 'block' : 'none') + ';margin-top:8px">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div class="f" style="margin:0"><label style="font-size:11px">Matricola *</label>' +
            '<input type="text" id="aud-mat-' + pid + '" data-pid="' + pid + '" value="' + esc(val.matricola) + '" oninput="scriviValoreAudit(this.dataset.pid)" autocomplete="off" style="font-size:14px"></div>' +
          '<div class="f" style="margin:0"><label style="font-size:11px">Annata *</label>' +
            '<input type="number" id="aud-anno-' + pid + '" data-pid="' + pid + '" value="' + esc(val.annata) + '" inputmode="numeric" min="1900" max="' + annoMassimoAnnata() + '" placeholder="Es. 2019" oninput="scriviValoreAudit(this.dataset.pid)" style="font-size:14px"></div>' +
        '</div>' +
        '<div class="f" style="margin:8px 0 0"><label style="font-size:11px">Stato dopo verifica</label>' +
          '<select id="stato-' + pid + '" data-pid="' + pid + '" onchange="scriviValoreAudit(this.dataset.pid)" style="width:100%;font-size:13px">' +
            opzStato('ok', '✅ OK / Conforme') + opzStato('anomalia', '⚠️ Anomalia rilevata') + opzStato('fuori_servizio', '🔴 Fuori servizio') +
          '</select></div>' +
        '<div class="f" style="margin:8px 0 0"><label style="font-size:11px">Note intervento</label>' +
          '<input type="text" id="note-' + pid + '" data-pid="' + pid + '" value="' + esc(val.note) + '" oninput="scriviValoreAudit(this.dataset.pid)" placeholder="Anomalie, ricambi..." style="font-size:13px"></div>' +
      '</div>' +
      '<div id="aud-err-' + pid + '" style="display:none;color:var(--r);font-size:12px;margin-top:6px"></div>' +
    '</div>';
  }).join('');

  el.innerHTML = intro + righe;
  pp.forEach(function(p) { coloraPresidioAudit(p.id); });
  aggiornaContatoreAudit();
}

function scriviValoreAudit(pid) {
  const val = auditValori[pid];
  if (!val) return;
  if (ge('aud-mat-' + pid)) val.matricola = ge('aud-mat-' + pid).value;
  if (ge('aud-anno-' + pid)) val.annata = ge('aud-anno-' + pid).value;
  if (ge('stato-' + pid)) val.stato = ge('stato-' + pid).value;
  if (ge('note-' + pid)) val.note = ge('note-' + pid).value;
  coloraPresidioAudit(pid);
  aggiornaContatoreAudit();
}

function cambiaEsitoAudit(pid) {
  const val = auditValori[pid];
  if (!val) return;
  val.esito = v('aud-esito-' + pid);
  const dati = ge('aud-dati-' + pid);
  if (dati) dati.style.display = val.esito === 'trovato' ? 'block' : 'none';
  const cb = ge('upd-' + pid);
  if (cb) cb.checked = val.esito === 'trovato';
  coloraPresidioAudit(pid);
  aggiornaContatoreAudit();
}

// Problema del singolo presidio ('' se a posto).
function problemaPresidioAudit(pid) {
  const val = auditValori[pid];
  if (!val || !val.esito) return 'Scegli se il presidio è stato trovato o no';
  if (val.esito === 'non_trovato') return '';
  if (!String(val.matricola || '').trim()) return 'Manca la matricola';
  const anno = leggiAnnata(val.annata);
  if (anno === null) return 'Manca l\'annata (anno di fabbricazione)';
  if (anno === false) return testoErroreAnnata();
  return '';
}

function coloraPresidioAudit(pid) {
  const box = ge('aud-box-' + pid);
  if (!box) return;
  const val = auditValori[pid] || {};
  const prob = problemaPresidioAudit(pid);
  box.style.borderLeftColor = !val.esito ? 'var(--bo)' : (prob ? 'var(--a)' : (val.esito === 'non_trovato' ? 'var(--r)' : 'var(--g)'));
  const err = ge('aud-err-' + pid);
  if (err) {
    const mostra = !!(val.esito && prob);
    err.style.display = mostra ? 'block' : 'none';
    err.textContent = mostra ? prob : '';
  }
}

function aggiornaContatoreAudit() {
  const el = ge('aud-contatore');
  if (!el) return;
  const tot = auditPresidiLista.length;
  const fatti = auditPresidiLista.filter(function(p) { return !problemaPresidioAudit(p.id); }).length;
  const nonTrovati = auditPresidiLista.filter(function(p) { return (auditValori[p.id] || {}).esito === 'non_trovato'; }).length;
  el.style.color = fatti === tot ? 'var(--g)' : 'var(--a)';
  el.textContent = tot
    ? 'Compilati ' + fatti + ' di ' + tot + (nonTrovati ? ' (non trovati: ' + nonTrovati + ')' : '') + (fatti === tot ? ' ✓' : '')
    : 'Nessun presidio nel registro';
}

// Controllo completo prima di andare avanti o di chiudere.
function controllaAuditScheda() {
  const modifiche = [], nonTrovati = [], trovati = [];
  for (const p of auditPresidiLista) {
    const prob = problemaPresidioAudit(p.id);
    if (prob) {
      return { ok: false, errore: tpl(p.tipo) + (p.ubicazione ? ' (' + p.ubicazione + ')' : '') + ': ' + prob, pid: p.id };
    }
    const val = auditValori[p.id];
    if (val.esito === 'non_trovato') { nonTrovati.push(p.id); continue; }
    trovati.push(p.id);
    const mat = String(val.matricola).trim();
    const anno = leggiAnnata(val.annata);
    if (mat !== String(p.matricola || '') || anno !== (p.annata || null)) modifiche.push({ pid: p.id, matricola: mat, annata: anno, tipo: p.tipo });
  }
  return { ok: true, modifiche: modifiche, nonTrovati: nonTrovati, trovati: trovati };
}

function mostraProblemaAudit(c) {
  toast(c.errore, 'err');
  if (c.pid) {
    const box = ge('aud-box-' + c.pid);
    const val = auditValori[c.pid];
    if (val && !val.esito && ge('aud-err-' + c.pid)) {
      ge('aud-err-' + c.pid).style.display = 'block';
      ge('aud-err-' + c.pid).textContent = c.errore.split(': ').slice(1).join(': ');
    }
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

const tnextPrimaAudit = tnext;
tnext = function(from) {
  if (from === 3 && auditAttivoSuScheda() && !schedaImpossibilitata()) {
    const c = controllaAuditScheda();
    if (!c.ok) { mostraProblemaAudit(c); return; }
  }
  return tnextPrimaAudit.apply(this, arguments);
};

// Riepilogo (passo Chiusura): riga dell'audit.
const buildRiepPrimaAudit = buildRiep;
buildRiep = function() {
  const r = buildRiepPrimaAudit.apply(this, arguments);
  const box = ge('triepilogo');
  if (box && auditAttivoSuScheda() && !schedaImpossibilitata()) {
    const tot = auditPresidiLista.length;
    const fatti = auditPresidiLista.filter(function(p) { return !problemaPresidioAudit(p.id); }).length;
    const nonTrovati = auditPresidiLista.filter(function(p) { return (auditValori[p.id] || {}).esito === 'non_trovato'; }).length;
    box.insertAdjacentHTML('beforeend',
      '<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px;margin-top:8px">' +
      '<span style="color:var(--m)">🔎 Audit presidi</span><strong style="color:' + (fatti === tot ? 'var(--g)' : 'var(--r)') + '">' +
      fatti + '/' + tot + ' compilati' + (nonTrovati ? ', ' + nonTrovati + ' non trovati' : '') + '</strong></div>');
  }
  return r;
};

function testoDifferenzeAudit(diff) {
  return (diff || []).map(function(d) {
    const delta = Number(d.trovati) - Number(d.previsti);
    return tpl(d.tipo).replace(/^\S+\s/, '') + ': trovati ' + d.trovati + ', previsti ' + d.previsti + ' (' + (delta > 0 ? '+' : '') + delta + ')';
  }).join('; ');
}

// Chiusura della scheda: con l'audit prima si salvano matricola e annata
// e si registra l'audit, poi si chiude come sempre (salvaInt di js/11).
const salvaIntPrimaAudit = salvaInt;
salvaInt = async function() {
  if (!auditAttivoSuScheda() || schedaImpossibilitata()) return salvaIntPrimaAudit.apply(this, arguments);
  if (salvataggioAudit) return;
  const c = controllaAuditScheda();
  if (!c.ok) { tnav(3); setTimeout(function() { mostraProblemaAudit(c); }, 300); return; }
  if (!c.trovati.length && !confirm('Non hai segnato nessun presidio come trovato. Confermi la chiusura dell\'audit?')) return;
  const btn = ge('savebtn');
  const odlId = auditInCorso.odlId;
  salvataggioAudit = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio audit...'; }
  let esito = null;
  try {
    for (const m of c.modifiche) {
      const r = await db.from('impianti').update({ matricola: m.matricola, annata: m.annata }).eq('id', m.pid).select('id');
      if (r.error) throw new Error(tpl(m.tipo) + ' ' + m.matricola + ': ' + r.error.message);
      if (!r.data || !r.data.length) throw new Error(tpl(m.tipo) + ' ' + m.matricola + ' non aggiornato (permessi)');
      const p = auditPresidiLista.find(function(x) { return x.id === m.pid; });
      if (p) { p.matricola = m.matricola; p.annata = m.annata; }
    }
    const rr = await db.rpc('registra_audit_presidi', { p_odl_id: odlId, p_non_trovati: c.nonTrovati });
    if (rr.error) throw new Error(rr.error.message);
    esito = rr.data || {};
  } catch (e) {
    toast('Audit non salvato: ' + e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Salva e chiudi intervento ✓'; }
    salvataggioAudit = false;
    return;
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Salva e chiudi intervento ✓'; }
  salvataggioAudit = false;
  await salvaIntPrimaAudit.apply(this, arguments);
  // salvaInt svuota "Intervento assegnato" solo se la scheda è stata chiusa.
  if (!v('tc-odl')) {
    azzeraAuditInCorso();
    let msg = '✅ Intervento salvato e audit dei presidi registrato.';
    if (!esito.confronto_disponibile) msg += ' Il confronto con il contratto non è ancora attivo.';
    else if (esito.differenze && esito.differenze.length) msg += ' Differenze con il contratto inviate al Responsabile Service e al rappresentante: ' + testoDifferenzeAudit(esito.differenze) + '.';
    else msg += ' Nessuna differenza con il contratto.';
    if (esito.non_trovati) msg += ' Presidi non trovati: ' + esito.non_trovati + '.';
    toast(msg, 'ok');
  }
};

// ── Finestra dell'intervento (m-odl): audit sì/no ────────────────────────
function nascondiBoxAuditOdl() {
  const box = ge('mo-audit-presidi');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

async function caricaBoxAuditOdl(odlId) {
  const box = ge('mo-audit-presidi');
  if (!box) return;
  nascondiBoxAuditOdl();
  if (!odlId || !(await verificaAuditPresidiDisponibile())) return;
  const { data: o, error } = await db.from('ordini_lavoro')
    .select('id,stato,audit_presidi,audit_presidi_il,audit_presidi_nota')
    .eq('id', odlId)
    .maybeSingle();
  if (error || !o) return;
  if ((ge('mcli-odl-id') || {}).value !== odlId) return;
  const puo = RUOLI_IMPOSTA_AUDIT.includes(ROLE) && o.stato !== 'completato';
  let html = '';
  if (o.audit_presidi) {
    html = '<div style="background:var(--al);border-left:3px solid var(--a);border-radius:var(--rs);padding:10px;font-size:12px">' +
      '<strong style="color:var(--a)">🔎 Prima manutenzione con audit dei presidi</strong><br>' +
      (o.stato === 'completato'
        ? 'Audit eseguito con la chiusura della scheda.'
        : 'Il tecnico deve segnare ogni presidio come trovato (con matricola e annata) o non trovato: senza, la scheda non si chiude.') +
      (o.audit_presidi_nota ? '<div style="color:var(--m);margin-top:4px">' + esc(o.audit_presidi_nota) + (o.audit_presidi_il ? ' · ' + esc(fd(String(o.audit_presidi_il).slice(0, 10))) : '') + '</div>' : '');
    if (puo) {
      html += '<div class="f" style="margin:8px 0 0"><label style="font-size:11px">Motivo per togliere l\'audit *</label>' +
        '<input type="text" id="mo-audit-nota" maxlength="1000" placeholder="Es. registro presidi già completo"></div>' +
        '<button type="button" class="btn sm" style="margin-top:6px" data-id="' + esc(o.id) + '" onclick="impostaAuditOdl(this.dataset.id,false)">Togli l\'audit</button>';
    }
    html += '</div>';
  } else if (puo) {
    html = '<div style="background:var(--bg);border-radius:var(--rs);padding:10px;font-size:12px">' +
      '<span style="color:var(--m)">Intervento senza audit dei presidi.</span> ' +
      '<button type="button" class="btn sm" style="margin-top:6px" data-id="' + esc(o.id) + '" onclick="impostaAuditOdl(this.dataset.id,true)">🔎 Segna come prima manutenzione con audit</button>' +
      '</div>';
  }
  if (!html) return;
  box.innerHTML = html;
  box.style.display = 'block';
}

async function impostaAuditOdl(odlId, audit) {
  if (!RUOLI_IMPOSTA_AUDIT.includes(ROLE)) { toast('L\'audit lo mettono o lo tolgono il titolare e il capo tecnico', 'err'); return; }
  const nota = audit ? null : v('mo-audit-nota').trim();
  if (!audit && !nota) { toast('Scrivi il motivo per cui togli l\'audit', 'err'); return; }
  const { error } = await db.rpc('imposta_audit_presidi_intervento', { p_odl_id: odlId, p_audit: audit, p_nota: nota });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast(audit ? 'Intervento segnato come prima manutenzione con audit ✓' : 'Audit tolto dall\'intervento ✓', 'ok');
  await caricaBoxAuditOdl(odlId);
}

const openEditOdlPrimaAudit = openEditOdl;
openEditOdl = async function(id) {
  nascondiBoxAuditOdl();
  const r = await openEditOdlPrimaAudit.apply(this, arguments);
  try { await caricaBoxAuditOdl(id); } catch (e) { console.warn('caricaBoxAuditOdl:', e); }
  return r;
};

const openMPrimaAudit = openM;
openM = function(id) {
  if (id === 'm-odl' && !((ge('mcli-odl-id') || {}).value)) nascondiBoxAuditOdl();
  return openMPrimaAudit.apply(this, arguments);
};

// ── Dashboard: differenze dell'audit ─────────────────────────────────────
function contrattoSenzaNumeri(contratto) {
  if (!contratto) return true;
  return !Object.keys(contratto).some(function(k) { return Number(contratto[k]) > 0; });
}

function testoTrovatiAudit(trovati) {
  return Object.keys(trovati || {}).sort().map(function(t) {
    return trovati[t] + ' ' + tpl(t).replace(/^\S+\s/, '');
  }).join(', ');
}

async function caricaAuditPresidiDashboard() {
  const box = ge(BOX_AUDIT_PRESIDI[ROLE] || '');
  if (!box) return;
  if (!(await verificaAuditPresidiDisponibile())) { box.innerHTML = ''; return; }
  const { data, error } = await db.rpc('audit_presidi_da_esaminare');
  if (error) { console.warn('Audit presidi:', error.message); box.innerHTML = ''; return; }
  const audit = Array.isArray(data) ? data : [];
  if (!audit.length) { box.innerHTML = ''; return; }

  const aiuti = {
    rappresentante: 'Presidi trovati dal tecnico alla prima manutenzione diversi da quelli del contratto dei tuoi clienti: concorda con il cliente l\'adeguamento del contratto (i numeri previsti li aggiornano segreteria o capo tecnico nella scheda del cliente, tab Periodicità). Quando coincidono la riga sparisce da sola; altrimenti segna "Esaminato".',
    capo_tecnico: 'Differenze tra i presidi trovati alla prima manutenzione e il contratto: il rappresentante concorda l\'adeguamento con il cliente, i numeri previsti si aggiornano nella scheda del cliente (tab Periodicità); i presidi non trovati vanno controllati nel registro.',
    titolare: 'Differenze tra i presidi trovati alla prima manutenzione e il contratto. Le seguono il Responsabile Service e il rappresentante del cliente.'
  };

  const righe = audit.map(function(a) {
    const id = esc(a.id);
    // chiave con l'id del box: id unici anche se più dashboard sono nella pagina
    const k = esc(box.id + '-' + a.id);
    const diff = Array.isArray(a.differenze) ? a.differenze : [];
    const nonTrovati = Array.isArray(a.presidi_non_trovati) ? a.presidi_non_trovati : [];
    let confronto;
    if (!a.confronto_disponibile) {
      confronto = '<div style="font-size:12px;color:var(--m)">Confronto con il contratto non ancora attivo. Trovati: ' + esc(testoTrovatiAudit(a.presidi_trovati) || 'nessuno') + '</div>';
    } else if (diff.length) {
      confronto = (contrattoSenzaNumeri(a.contratto_attuale) ? '<div style="font-size:12px;color:var(--a)">Il contratto non indica i presidi previsti.</div>' : '') +
        diff.map(function(d) {
          const delta = Number(d.trovati) - Number(d.previsti);
          return '<div style="font-size:12px;display:flex;justify-content:space-between;gap:8px;padding:2px 0">' +
            '<span>' + esc(tpl(d.tipo)) + '</span>' +
            '<span style="white-space:nowrap">trovati <strong>' + esc(d.trovati) + '</strong> · previsti ' + esc(d.previsti) +
            ' <span class="bx ' + (delta > 0 ? 'bwarn' : 'berr') + '">' + (delta > 0 ? '+' : '') + delta + '</span></span></div>';
        }).join('');
    } else {
      confronto = '<div style="font-size:12px;color:var(--g)">I numeri coincidono con il contratto.</div>';
    }
    const nt = nonTrovati.length
      ? '<div style="font-size:12px;color:var(--r);margin-top:4px;overflow-wrap:anywhere">Non trovati sul posto: ' +
        esc(nonTrovati.map(function(p) {
          return tpl(p.tipo).replace(/^\S+\s/, '') + (p.matricola ? ' ' + p.matricola : '') + (p.ubicazione ? ' (' + p.ubicazione + ')' : '');
        }).join('; ')) + '</div>'
      : '';
    const chi = ROLE === 'rappresentante' ? '' : (a.rappresentante_id
      ? '<div style="font-size:12px;color:var(--m)">Rappresentante: ' + esc(a.rappresentante_nome || '—') + '</div>'
      : '<div style="font-size:12px;color:var(--r)">Cliente senza rappresentante</div>');
    return '<div style="padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px">' +
      '<div style="font-weight:600;overflow-wrap:anywhere">' + esc(a.ragione_sociale || 'Cliente') + '</div>' +
      '<div style="font-size:12px;color:var(--m);margin-bottom:4px">Audit del ' + esc(fd(a.data_audit)) +
        (a.odl_numero ? ' · intervento n. ' + esc(a.odl_numero) : '') + (a.registrato_da_nome ? ' · ' + esc(a.registrato_da_nome) : '') + '</div>' +
      confronto + nt + chi +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
        '<button class="btn sm" data-cli="' + esc(a.cliente_id) + '" onclick="apriContrattoCliente(this.dataset.cli)">Apri contratto</button>' +
        '<button class="btn sm" data-k="' + k + '" onclick="mostraEsaminaAudit(this.dataset.k)">✓ Esaminato</button>' +
      '</div>' +
      '<div id="aud-es-' + k + '" style="display:none;margin-top:8px">' +
        '<div class="f" style="margin:0"><label style="font-size:11px">Nota (facoltativa)</label>' +
        '<input type="text" id="aud-es-nota-' + k + '" maxlength="1000" placeholder="Es. contratto adeguato, cliente avvisato"></div>' +
        '<button class="btn sm p" style="margin-top:6px" data-id="' + id + '" data-k="' + k + '" onclick="segnaAuditEsaminato(this.dataset.id,this.dataset.k)">Conferma: esaminato</button>' +
      '</div>' +
    '</div>';
  }).join('');

  box.innerHTML = '<div class="tit-section" style="margin-top:14px">🔎 Audit presidi: differenze con il contratto (' + audit.length + ')</div>' +
    '<div class="rap-list-card" style="margin-bottom:14px">' +
    '<div style="font-size:12px;color:var(--m);margin-bottom:4px">' + esc(aiuti[ROLE] || '') + '</div>' +
    righe + '</div>';
}

function mostraEsaminaAudit(k) {
  const el = ge('aud-es-' + k);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function segnaAuditEsaminato(id, k) {
  const nota = (ge('aud-es-nota-' + k) ? ge('aud-es-nota-' + k).value : '').trim();
  const { error } = await db.rpc('segna_audit_presidi_esaminato', { p_audit_id: id, p_nota: nota || null });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast('Audit segnato come esaminato ✓', 'ok');
  await caricaAuditPresidiDashboard();
}
