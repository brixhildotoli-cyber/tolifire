// =====================================================================
// js/51-sostituzione-presidi.js — audit dei presidi PER SEDE e
// sostituzione di un presidio (decisioni di Toli del 02/11, risposta 17;
// sql/53-audit-per-sede-sostituzione-presidi).
//
// AUDIT PER SEDE: con sql/53 l'audit di un intervento controlla solo i
// presidi della sua sede (senza sede: la sede principale del cliente).
// L'elenco del passo Presidi (js/40 renderPresidiAudit) chiede quali
// presidi con la RPC ambito_audit_intervento (stessa regola del database,
// che blocca la chiusura). Gli audit fatti prima di sql/53 valgono per
// tutte le sedi.
//
// SOSTITUZIONE: bottone "🔁 Sostituito" accanto a ogni presidio
//   - al passo Presidi della scheda del tecnico (elenco normale e audit),
//     solo con un intervento scelto (il tecnico lo usa solo sul suo
//     intervento aperto: lo controlla il database);
//   - nella pagina Presidi e nella scheda cliente per titolare, capo
//     tecnico e segreteria (intervento facoltativo).
// Finestra m-sostituzione-presidio (id sost-): dati del vecchio, matricola
// e annata del nuovo (obbligatorie), marca, capacità (estintori, con
// sql/52), motivo (obbligatorio). RPC sostituisci_presidio: il vecchio
// esce dal registro con il riferimento al nuovo, il nuovo entra al suo
// posto con il controllo di oggi.
// Buono di lavoro (js/42): riga "Presidi sostituiti" (box dell'ufficio:
// da mettere nel DDT o in fattura; PDF: solo il fatto tecnico).
// Senza sql/53: nessun bottone, audit e buono come prima.
// =====================================================================

const RUOLI_SOSTITUZIONE_UFFICIO = ['titolare', 'capo_tecnico', 'segreteria'];

let sostituzionePresidiVerificata = null;
let sostituzioneInCorso = null;   // { presidio, odlId, daTecnico }
let salvataggioSostituzione = false;

// true se sql/53 è stato eseguito (colonna impianti.sostituito_da).
async function verificaSostituzionePresidiDisponibile() {
  if (sostituzionePresidiVerificata !== null) return sostituzionePresidiVerificata;
  const { error } = await db.from('impianti').select('sostituito_da').limit(1);
  if (!error) sostituzionePresidiVerificata = true;
  else if (error.code === '42703' || error.code === 'PGRST204' || /sostituito_da/i.test(error.message || '')) sostituzionePresidiVerificata = false;
  else return false; // errore di rete: si riprova la prossima volta
  return sostituzionePresidiVerificata;
}

function sostituzionePresidiAttiva() {
  return sostituzionePresidiVerificata === true;
}

// Il controllo parte appena l'utente entra (dashboard), così le pagine
// che disegnano i presidi sanno già se mostrare il bottone.
(function() {
  if (typeof loadDash !== 'function') return;
  const loadDashPrimaSostituzione = loadDash;
  loadDash = async function() {
    verificaSostituzionePresidiDisponibile().catch(function() {});
    return loadDashPrimaSostituzione.apply(this, arguments);
  };
})();

// Bottone per la pagina Presidi e la scheda cliente (js/07, js/09).
function bottoneSostituisciPresidio(id) {
  if (!sostituzionePresidiAttiva() || !RUOLI_SOSTITUZIONE_UFFICIO.includes(ROLE)) return '';
  return '<button class="btn sm" title="Sostituito con un presidio nuovo" onclick="apriSostituzionePresidio(\'' + esc(id) + '\', null)">🔁 Sostituito</button>';
}

(function() {
  if (typeof loadPresidi !== 'function') return;
  const loadPresidiPrimaSostituzione = loadPresidi;
  loadPresidi = async function() {
    try { await verificaSostituzionePresidiDisponibile(); } catch (e) {}
    return loadPresidiPrimaSostituzione.apply(this, arguments);
  };
})();

// ── Audit per sede: presidi dell'audit dell'intervento ─────────────────────
// Restituisce { presidi, sedeNome, tutte } o null (senza sql/53 o errore:
// l'elenco resta quello di tutto il cliente, come prima).
async function ambitoAuditPresidi(odlId, presidi) {
  if (!odlId || !(await verificaSostituzionePresidiDisponibile())) return null;
  const { data, error } = await db.rpc('ambito_audit_intervento', { p_odl_id: odlId });
  if (error || !data) { if (error) console.warn('Ambito audit:', error.message); return null; }
  const ids = new Set((data.presidi_ids || []).map(String));
  return {
    presidi: (presidi || []).filter(function(p) { return ids.has(String(p.id)); }),
    sedeNome: data.sede_nome || '',
    tutte: !!data.tutte_le_sedi
  };
}

// ── Passo Presidi del tecnico: bottone "🔁 Sostituito" ─────────────────────
function decoraSostituzionePassoPresidi() {
  if (!sostituzionePresidiAttiva()) return;
  const odlId = v('tc-odl');
  // Il tecnico sostituisce solo dentro un suo intervento; l'ufficio anche senza.
  if (!odlId && !RUOLI_SOSTITUZIONE_UFFICIO.includes(ROLE)) return;
  document.querySelectorAll('#pcl input[type=checkbox][id^="upd-"]').forEach(function(cb) {
    const pid = cb.dataset.pid || cb.id.slice(4);
    if (!pid || document.querySelector('[data-sost-pid="' + pid + '"]')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn sm';
    btn.style.fontSize = '11px';
    btn.textContent = '🔁 Sostituito';
    btn.title = 'Il presidio è stato sostituito con uno nuovo';
    btn.dataset.sostPid = pid;
    btn.onclick = function() { apriSostituzionePresidio(pid, odlId || null); };
    const box = cb.closest('[id^="aud-box-"]');
    if (box) {
      const riga = document.createElement('div');
      riga.style.cssText = 'margin-top:8px';
      riga.appendChild(btn);
      box.appendChild(riga);
    } else if (cb.parentElement) {
      cb.parentElement.appendChild(btn);
    }
  });
}

(function() {
  if (typeof loadPC !== 'function') return;
  const loadPCPrimaSostituzione = loadPC;
  loadPC = async function() {
    try { await verificaSostituzionePresidiDisponibile(); } catch (e) {}
    const r = await loadPCPrimaSostituzione.apply(this, arguments);
    try { decoraSostituzionePassoPresidi(); } catch (e) { console.warn('Bottone Sostituito:', e); }
    return r;
  };
})();

// ── Finestra della sostituzione ────────────────────────────────────────────
function descrizionePresidioSostituzione(p) {
  return tpl(p.tipo) + (p.matricola ? ' — matricola ' + p.matricola : '') +
    (p.ubicazione ? ' · ' + p.ubicazione : '') + (p.piano ? ' · piano ' + p.piano : '') +
    (p.locale ? ' · ' + p.locale : '') + (p.annata ? ' · annata ' + p.annata : '');
}

async function apriSostituzionePresidio(pid, odlId) {
  if (!(await verificaSostituzionePresidiDisponibile())) {
    toast('La sostituzione dei presidi non è ancora attiva (serve aggiornare il database)', 'err');
    return;
  }
  let p = (typeof PA !== 'undefined' ? PA : []).find(function(x) { return String(x.id) === String(pid); }) || null;
  if (!p) {
    const { data, error } = await db.from('impianti').select('*').eq('id', pid).maybeSingle();
    if (error || !data) { toast('Presidio non trovato' + (error ? ': ' + error.message : ''), 'err'); return; }
    p = data;
  }
  if (p.eliminato_il) { toast('Il presidio non è più nel registro', 'err'); return; }
  const daTecnico = !!(ge('pg-tecnico') && ge('pg-tecnico').classList.contains('on'));
  sostituzioneInCorso = { presidio: p, odlId: odlId || null, daTecnico: daTecnico };

  ge('sost-vecchio').textContent = descrizionePresidioSostituzione(p);
  ge('sost-matricola').value = '';
  ge('sost-annata').value = '';
  ge('sost-annata').max = String(new Date().getFullYear() + 1);
  ge('sost-marca').value = p.marca || '';
  ge('sost-motivo').value = '';
  ge('sost-motivo-altro').value = '';
  ge('sost-motivo-altro-box').style.display = 'none';
  ge('sost-intervento').textContent = odlId
    ? 'La sostituzione resta nel buono di lavoro dell\'intervento.'
    : 'Sostituzione registrata senza intervento (non compare in un buono di lavoro).';

  // Capacità: solo estintori e solo con la colonna di sql/52 (js/07).
  const boxCap = ge('sost-capacita-box');
  const conCapacita = p.tipo === 'estintore' && typeof capacitaEstintoriDisponibile === 'function' && (await capacitaEstintoriDisponibile());
  boxCap.style.display = conCapacita ? '' : 'none';
  if (conCapacita) {
    const sel = ge('sost-capacita');
    if (ge('me4') && sel.options.length <= 1) sel.innerHTML = ge('me4').innerHTML;
    sel.value = [...sel.options].some(function(o) { return o.value === (p.capacita || ''); }) ? (p.capacita || '') : '';
  }
  ge('sost-err').style.display = 'none';
  openM('m-sostituzione-presidio');
  setTimeout(function() { ge('sost-matricola').focus(); }, 50);
}

function cambiaMotivoSostituzione() {
  ge('sost-motivo-altro-box').style.display = v('sost-motivo') === 'altro' ? '' : 'none';
}

function erroreSostituzione(testo) {
  const el = ge('sost-err');
  el.textContent = testo;
  el.style.display = 'block';
}

async function salvaSostituzionePresidio() {
  if (salvataggioSostituzione || !sostituzioneInCorso) return;
  const c = sostituzioneInCorso;
  const matricola = v('sost-matricola').trim();
  const annata = typeof leggiAnnata === 'function' ? leggiAnnata(v('sost-annata')) : Number(v('sost-annata')) || null;
  let motivo = v('sost-motivo');
  if (motivo === 'altro') motivo = v('sost-motivo-altro').trim();
  if (!matricola) { erroreSostituzione('Scrivi la matricola del presidio nuovo.'); return; }
  if (annata === null) { erroreSostituzione('Scrivi l\'annata (anno di fabbricazione) del presidio nuovo.'); return; }
  if (annata === false) { erroreSostituzione(typeof testoErroreAnnata === 'function' ? testoErroreAnnata() : 'Annata non valida.'); return; }
  if (!motivo) { erroreSostituzione('Scegli o scrivi il motivo della sostituzione.'); return; }
  const capacita = ge('sost-capacita-box').style.display === 'none' ? null : (v('sost-capacita') || null);

  const btn = ge('sost-salva');
  salvataggioSostituzione = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio...'; }
  let r;
  try {
    r = await db.rpc('sostituisci_presidio', {
      p_presidio_id: c.presidio.id, p_odl_id: c.odlId, p_matricola: matricola, p_annata: annata,
      p_capacita: capacita, p_marca: v('sost-marca').trim() || null, p_motivo: motivo
    });
  } finally {
    salvataggioSostituzione = false;
    if (btn) { btn.disabled = false; btn.textContent = '🔁 Registra la sostituzione'; }
  }
  if (r.error) { erroreSostituzione('Sostituzione non registrata: ' + r.error.message); return; }
  const nuovoId = r.data && r.data.nuovo_id;
  closeM('m-sostituzione-presidio');
  toast('Sostituzione registrata ✓ Il presidio nuovo è nel registro al posto del vecchio.', 'ok');
  sostituzioneInCorso = null;

  if (c.daTecnico) {
    // Audit in corso: il presidio nuovo è già "trovato" con i suoi dati.
    if (typeof auditValori !== 'undefined' && typeof auditAttivoSuScheda === 'function' && auditAttivoSuScheda()) {
      delete auditValori[c.presidio.id];
      if (nuovoId) auditValori[nuovoId] = { esito: 'trovato', matricola: matricola, annata: String(annata), stato: 'ok', note: '' };
      await loadPC();
    } else {
      const lavoro = typeof leggiLavoroPassoPresidi === 'function' ? leggiLavoroPassoPresidi() : {};
      await loadPC();
      if (typeof rimettiLavoroPassoPresidi === 'function') rimettiLavoroPassoPresidi(lavoro);
    }
  } else {
    if (ge('pg-presidi') && ge('pg-presidi').classList.contains('on')) await loadPresidi();
    if (ge('pg-cliente-detail') && ge('pg-cliente-detail').classList.contains('on') && typeof currentCliId !== 'undefined' && currentCliId) {
      try { await openClienteDetail(currentCliId); } catch (e) { console.warn('Scheda cliente:', e); }
    }
  }
}

// ── Buono di lavoro (js/42) ───────────────────────────────────────────────
// Presidi sostituiti durante l'intervento: vecchio, nuovo, motivo.
async function leggiSostituzioniIntervento(odlId) {
  if (!odlId || !(await verificaSostituzionePresidiDisponibile())) return [];
  const { data, error } = await db.from('impianti')
    .select('id,tipo,matricola,ubicazione,piano,sostituito_motivo,sostituito_il,nuovo:impianti!impianti_sostituito_da_fkey(matricola,annata)')
    .eq('sostituito_odl_id', odlId)
    .order('sostituito_il', { ascending: true });
  if (error) { console.warn('Presidi sostituiti:', error.message); return []; }
  return data || [];
}

function testoSostituzione(x) {
  const nuovo = x.nuovo || {};
  return tpl(x.tipo).replace(/^\S+\s/, '') + (x.ubicazione ? ' (' + x.ubicazione + (x.piano ? ', piano ' + x.piano : '') + ')' : '') +
    ': matricola ' + (x.matricola || '—') + ' sostituita con ' + (nuovo.matricola || '—') +
    (nuovo.annata ? ' (annata ' + nuovo.annata + ')' : '') + (x.sostituito_motivo ? ' — ' + x.sostituito_motivo : '');
}

// true se l'audit dell'intervento è di una sola sede (il confronto con il
// contratto nel buono si fa allora sul registro di tutto il cliente).
async function auditSoloSedeBuono(odlId) {
  if (!odlId || !(await verificaSostituzionePresidiDisponibile())) return false;
  const { data, error } = await db.from('audit_presidi').select('tutte_le_sedi').eq('odl_id', odlId).maybeSingle();
  return !error && !!data && data.tutte_le_sedi === false;
}
