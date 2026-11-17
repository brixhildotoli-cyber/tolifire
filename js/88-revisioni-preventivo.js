// ── F18.2 — REVISIONI DEL PREVENTIVO PRIMA DELL'ESITO (sql/131) ──────────
// Decisioni di Erika del 16/11: "🔁 Nuova revisione" per Acquisti (autore) e
// titolare, solo con il preventivo inviato al rappresentante o al cliente.
// La revisione nasce in bozza con voci e condizioni copiate (numero nuovo,
// R+1); le offerte dei fornitori passano alla revisione (servono agli ordini
// dopo l'accettazione). Il preventivo di prima RESTA COM'È: riquadro
// "Sostituito dalla revisione R1", etichetta negli elenchi e conferma prima di
// registrarne l'esito (solo avviso). Sconto e PDF del cliente si rifanno sulla
// revisione. Senza sql/131 nessun bottone né riquadro (una RPC 404).

const REVISIONI = { attivo: true, mappa: {}, letto: 0 };

async function verificaRevisioniDisponibili() {
  if (REVISIONI.attivo !== null) return REVISIONI.attivo;
  try {
    const { data, error } = await db.rpc('revisioni_preventivo_attive');
    REVISIONI.attivo = !error && data === true;
  } catch (e) { REVISIONI.attivo = false; }
  return REVISIONI.attivo;
}

if (typeof registraAzioneScheda === 'function') {
  registraAzioneScheda('preventivo', {
    codice: 'nuova_revisione', etichetta: '🔁 Nuova revisione',
    ruoli: ['commerciale', 'titolare'], stati: ['inviato_a_rappresentante', 'inviato'],
    quando: function(p) { return ('revisione' in p) && !p.sostituito_da && (ROLE !== 'commerciale' || p.commerciale_id === ME.id); },
    esegui: function(p) { return nuovaRevisionePreventivo(p.id, p.revisione); }
  });
}

async function nuovaRevisionePreventivo(id, revisione) {
  const r = (Number(revisione) || 0) + 1;
  if (!confirm('Creare la revisione R' + r + '?\n\n• Nasce in bozza con le stesse voci e condizioni: cambi quello che serve e rifai il PDF per il cliente (lo sconto si rimette sulla revisione).\n• Le offerte dei fornitori passano alla revisione.\n• Questo preventivo resta com\'è, segnato "sostituito dalla revisione R' + r + '".')) return;
  const { data, error } = await db.rpc('nuova_revisione_preventivo', { p_preventivo: id });
  if (error || !data) { toast('Revisione non creata: ' + (error?.message || 'errore sconosciuto'), 'err'); return; }
  REVISIONI.letto = 0;
  toast('Revisione R' + r + ' creata in bozza', 'ok');
  if (typeof openPreventivoDetail === 'function') await openPreventivoDetail(data);
}

// Riquadro in cima alla scheda del preventivo
if (typeof openPreventivoDetail === 'function') {
  const openPreventivoDetailSenzaRevisioni = openPreventivoDetail;
  // eslint-disable-next-line no-global-assign
  openPreventivoDetail = async function(preventivoId) {
    const esito = await openPreventivoDetailSenzaRevisioni.apply(this, arguments);
    try {
      const vecchio = ge('pvd-revisione');
      if (vecchio) vecchio.remove();
      if (!(await verificaRevisioniDisponibili())) return esito;
      const { data: p } = await db.from('preventivi').select('id, numero, revisione, preventivo_padre_id, sostituito_da, sostituito_il, sostituito_da_nome').eq('id', preventivoId).maybeSingle();
      if (!p || (!p.sostituito_da && !p.revisione)) return esito;
      const ids = [p.sostituito_da, p.preventivo_padre_id].filter(Boolean);
      const { data: altri } = ids.length ? await db.from('preventivi').select('id, numero, revisione, stato').in('id', ids) : { data: [] };
      const trova = function(id) { return (altri || []).find(function(x) { return x.id === id; }); };
      let html = '';
      if (p.sostituito_da) {
        const n = trova(p.sostituito_da);
        html += '<div class="al2 w" style="margin:0 0 8px">🔁 <b>Sostituito dalla revisione R' + esc(String(n ? n.revisione : p.revisione + 1)) + '</b>' +
          (n ? ' (preventivo n. ' + esc(String(n.numero)) + ')' : '') + (p.sostituito_il ? ' il ' + esc(fd(String(p.sostituito_il).slice(0, 10))) : '') +
          (p.sostituito_da_nome ? ' da ' + esc(p.sostituito_da_nome) : '') + '. Questo preventivo resta com\'è: l\'esito del cliente si registra sulla revisione.' +
          (n ? ' <button class="btn sm" onclick="openPreventivoDetail(\'' + esc(n.id) + '\')">Apri la revisione</button>' : '') + '</div>';
      }
      if (p.revisione > 0) {
        const padre = trova(p.preventivo_padre_id);
        html += '<div class="al2 i" style="margin:0 0 8px">📄 <b>Revisione R' + esc(String(p.revisione)) + '</b>' +
          (padre ? ' del preventivo n. ' + esc(String(padre.numero)) + ' (R' + esc(String(padre.revisione)) + ')' : '') +
          (padre ? ' <button class="btn sm" onclick="openPreventivoDetail(\'' + esc(padre.id) + '\')">Apri R' + esc(String(padre.revisione)) + '</button>' : '') + '</div>';
      }
      const dove = ge('pvd-scheda-oggetto');
      if (dove && html) dove.insertAdjacentHTML('beforebegin', '<div id="pvd-revisione">' + html + '</div>');
    } catch (e) { console.warn('Revisioni del preventivo:', e); }
    return esito;
  };
}

// Esito su un preventivo sostituito: conferma (solo avviso)
if (typeof apriEsitoPreventivo === 'function') {
  const apriEsitoPreventivoSenzaRevisioni = apriEsitoPreventivo;
  // eslint-disable-next-line no-global-assign
  apriEsitoPreventivo = async function(preventivoId) {
    try {
      if (await verificaRevisioniDisponibili()) {
        const { data: p } = await db.from('preventivi').select('sostituito_da').eq('id', preventivoId).maybeSingle();
        if (p && p.sostituito_da) {
          const { data: n } = await db.from('preventivi').select('numero, revisione').eq('id', p.sostituito_da).maybeSingle();
          if (!confirm('Attenzione: questo preventivo è stato sostituito dalla revisione' + (n ? ' R' + n.revisione + ' (n. ' + n.numero + ')' : '') +
                       '. Di solito l\'esito si registra sulla revisione.\n\nRegistrarlo lo stesso su questo preventivo?')) return;
        }
      }
    } catch (e) { console.warn('Revisioni del preventivo:', e); }
    return apriEsitoPreventivoSenzaRevisioni.apply(this, arguments);
  };
}

// Etichette negli elenchi: "🔁 Sostituito da R1" e "R1" (id del preventivo
// negli attributi onclick o data-*)
async function caricaMappaRevisioni() {
  if (!(await verificaRevisioniDisponibili())) return false;
  if (REVISIONI.letto && Date.now() - REVISIONI.letto < 120000) return true;
  const { data, error } = await db.from('preventivi').select('id, numero, revisione, sostituito_da').or('revisione.gt.0,sostituito_da.not.is.null').limit(1000);
  if (error) return false;
  REVISIONI.mappa = {};
  const perId = {};
  (data || []).forEach(function(r) { perId[r.id] = r; });
  (data || []).forEach(function(r) {
    const figlio = r.sostituito_da ? perId[r.sostituito_da] : null;
    REVISIONI.mappa[r.id] = r.sostituito_da
      ? { testo: '🔁 Sostituito da R' + (figlio ? figlio.revisione : (r.revisione + 1)) + (figlio ? ' (n. ' + figlio.numero + ')' : ''), classe: 'bwarn' }
      : { testo: 'R' + r.revisione, classe: 'bblue' };
  });
  REVISIONI.letto = Date.now();
  return true;
}

function segnaRevisioniPagina() {
  const ids = Object.keys(REVISIONI.mappa);
  if (!ids.length) return;
  document.querySelectorAll('#pg-preventivi.on [onclick], #pg-preventivi-titolare.on [onclick], #pg-preventivi-rapp.on [onclick], #pg-progetti-da-preventivare.on [onclick], #pg-cliente-detail.on [onclick], #pg-preventivi-rapp.on [data-id]').forEach(function(el) {
    const testo = (el.getAttribute('onclick') || '') + ' ' + (el.getAttribute('data-id') || '');
    const id = ids.find(function(x) { return testo.indexOf(x) >= 0; });
    if (!id) return;
    const riga = el.closest('.card, tr, li, [style*="border-bottom"]') || el.parentElement;
    if (!riga || riga.querySelector('[data-revisione-badge]') || riga.closest('[data-revisione-segnato]')) return;
    riga.setAttribute('data-revisione-segnato', id);
    const r = REVISIONI.mappa[id];
    const dove = riga.tagName === 'TR' ? riga.querySelector('td') : riga;
    if (dove) dove.insertAdjacentHTML('afterbegin', '<span class="bx ' + r.classe + '" data-revisione-badge style="margin:0 4px 2px 0">' + esc(r.testo) + '</span>');
  });
}

document.addEventListener('DOMContentLoaded', function() {
  let attesa = null;
  new MutationObserver(function() {
    if (!REVISIONI.attivo || attesa) return;
    attesa = setTimeout(function() { attesa = null; caricaMappaRevisioni().then(function(ok) { if (ok) segnaRevisioniPagina(); }); }, 500);
  }).observe(document.body, { childList: true, subtree: true });
  setTimeout(function() { if (typeof ROLE !== 'undefined' && ROLE && ['titolare', 'commerciale', 'rappresentante'].includes(ROLE)) caricaMappaRevisioni(); }, 4000);
});
