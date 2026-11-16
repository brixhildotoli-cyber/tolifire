// ── STATO DEI PAGAMENTI DEL CLIENTE (sql/270, richiesta di Erika del 16/11) ──
// Le fatture vere si fanno fuori dal gestionale: segreteria e titolare segnano
// a mano il cliente 🟡 "Pagamenti in ritardo" (si interviene ma avvisando la
// segreteria) o 🔴 "Non intervenire" (prima deve pagare), con il motivo.
// SOLO AVVISO (decisione di Erika): niente blocchi nella pianificazione.
//   - Scheda cliente: riquadro con stato, motivo, chi e quando; per segreteria
//     e titolare "💶 Stato dei pagamenti" (finestra m-stato-pagamenti, id spg-).
//   - Ovunque: un controllore della pagina cerca negli attributi (onclick,
//     data-*) l'id di un cliente segnato o di un suo intervento APERTO e mette
//     il badge sulla riga (dashboard, Piano mensile, ripartenza dei controlli,
//     appuntamenti, calendari, interventi del tecnico).
//   - Finestra dell'intervento (cliente mo1) ed "Esegui intervento" (tc1,
//     tc-odl): banner sotto la scelta.
//   - Cosa tocca a me di capo tecnico e segreteria: "Interventi aperti di
//     clienti da non contattare".
// Dati dalla RPC stato_pagamenti_clienti (anche per il tecnico, che non legge
// la riga del cliente: solo flag e motivo, nessun importo). Senza sql/270
// nulla compare (una chiamata 404).

const PAGAMENTI = { attivo: null, clienti: {}, odl: {}, letto: 0, inLettura: null };
const RUOLI_VEDONO_PAGAMENTI = ['titolare', 'segreteria', 'capo_tecnico', 'tecnico', 'rappresentante', 'commerciale', 'contabile'];
const RUOLI_SEGNANO_PAGAMENTI = ['titolare', 'segreteria'];
const STATI_PAGAMENTI = {
  ritardo: { icona: '🟡', testo: 'Pagamenti in ritardo', classe: 'bwarn', consiglio: 'si interviene, ma avvisa la segreteria prima di contattarlo' },
  bloccato: { icona: '🔴', testo: 'Non intervenire', classe: 'berr', consiglio: 'non contattarlo per le manutenzioni: prima deve pagare' }
};
const RE_UUID_PAGAMENTI = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

async function caricaStatoPagamenti(forza) {
  if (!RUOLI_VEDONO_PAGAMENTI.includes(ROLE) || PAGAMENTI.attivo === false) return false;
  if (!forza && PAGAMENTI.letto && Date.now() - PAGAMENTI.letto < 300000) return true;
  if (PAGAMENTI.inLettura) return PAGAMENTI.inLettura;
  PAGAMENTI.inLettura = (async function() {
    try {
      const { data, error } = await db.rpc('stato_pagamenti_clienti');
      if (error) {
        if (error.code === 'PGRST202' || /Could not find/.test(error.message || '')) PAGAMENTI.attivo = false;
        else console.warn('Stato dei pagamenti:', error.message);
        return false;
      }
      PAGAMENTI.attivo = true;
      PAGAMENTI.clienti = {}; PAGAMENTI.odl = {};
      (data || []).forEach(function(r) {
        PAGAMENTI.clienti[r.cliente_id] = r;
        (r.odl_ids || []).forEach(function(id) { PAGAMENTI.odl[id] = r.cliente_id; });
      });
      PAGAMENTI.letto = Date.now();
      document.querySelectorAll('[data-pag-badge]').forEach(function(el) { el.remove(); });
      document.querySelectorAll('[data-pag-segnato]').forEach(function(el) { el.removeAttribute('data-pag-segnato'); });
      segnaPagamentiPagina();
      return true;
    } catch (e) { return false; } finally { PAGAMENTI.inLettura = null; }
  })();
  return PAGAMENTI.inLettura;
}

function statoPagamentiCliente(id) { return id ? PAGAMENTI.clienti[id] || null : null; }

function titoloPagamenti(r) {
  return (r.nota || '') + (r.da_nome ? ' — segnato da ' + r.da_nome + (r.il ? ' il ' + fd(String(r.il).slice(0, 10)) : '') : '');
}

function htmlBadgePagamenti(r) {
  const s = STATI_PAGAMENTI[r.stato];
  if (!s) return '';
  return '<span class="bx ' + s.classe + '" data-pag-badge title="' + esc(titoloPagamenti(r)) + '" style="margin:0 4px 2px 0;cursor:help;white-space:nowrap">' + s.icona + ' ' + esc(s.testo) + '</span>';
}

function htmlBannerPagamenti(r) {
  const s = STATI_PAGAMENTI[r.stato];
  if (!s) return '';
  return '<div data-pag-badge class="al2 ' + (r.stato === 'bloccato' ? 'e' : 'w') + '" style="margin:6px 0">' + s.icona + ' <b>' + esc(s.testo) + '</b>: ' + esc(s.consiglio) + '.' +
    (r.nota ? '<br><span style="font-size:12px">Motivo: ' + esc(r.nota) + '</span>' : '') + '</div>';
}

// ── Badge sulle righe che si riferiscono al cliente o a un suo intervento aperto ──
function clienteDaAttributi(el) {
  for (const a of el.attributes) {
    if (a.name !== 'onclick' && a.name.indexOf('data-') !== 0) continue;
    const ids = a.value.match(RE_UUID_PAGAMENTI);
    if (!ids) continue;
    for (const id of ids) {
      if (PAGAMENTI.clienti[id]) return id;
      if (PAGAMENTI.odl[id]) return PAGAMENTI.odl[id];
    }
  }
  return null;
}

function segnaPagamentiPagina() {
  if (!PAGAMENTI.attivo || !Object.keys(PAGAMENTI.clienti).length) return;
  document.querySelectorAll('.page.on [onclick], .page.on [data-id], .page.on [data-cli], .page.on [data-cid], .page.on [data-odl], .page.on [data-cliente-id]').forEach(function(el) {
    if (el.closest('#pg-cliente-detail, [data-pag-badge]')) return;
    const cli = clienteDaAttributi(el);
    if (!cli) return;
    const riga = el.closest('tr, li, .card, .ev, .tec-card, [style*="border-bottom"]') || el.parentElement;
    if (!riga || riga.getAttribute('data-pag-segnato') === cli || riga.closest('[data-pag-segnato="' + cli + '"]')) return;
    riga.setAttribute('data-pag-segnato', cli);
    const dove = riga.tagName === 'TR' ? riga.querySelector('td') : riga;
    if (dove) dove.insertAdjacentHTML('afterbegin', htmlBadgePagamenti(PAGAMENTI.clienti[cli]));
  });
}

// ── Banner sotto la scelta del cliente o dell'intervento ──────────────
const SCELTE_PAGAMENTI = [{ id: 'mo1', tipo: 'cliente' }, { id: 'tc1', tipo: 'cliente' }, { id: 'tc-odl', tipo: 'odl' }];
function aggiornaBannerPagamenti() {
  if (!PAGAMENTI.attivo) return;
  SCELTE_PAGAMENTI.forEach(function(s) {
    const sel = ge(s.id);
    if (!sel || !sel.offsetParent) return;
    const cli = s.tipo === 'odl' ? PAGAMENTI.odl[sel.value] : sel.value;
    const r = statoPagamentiCliente(cli);
    const vecchio = sel.parentElement.querySelector(':scope > [data-pag-banner]');
    const chiave = r ? cli + r.stato : '';
    if (vecchio && vecchio.dataset.pagBanner === chiave) return;
    if (vecchio) vecchio.remove();
    if (r) sel.insertAdjacentHTML('afterend', htmlBannerPagamenti(r).replace('data-pag-badge', 'data-pag-banner="' + esc(chiave) + '"'));
  });
}

// ── Scheda cliente: riquadro e finestra per segreteria e titolare ──────
function riquadroPagamentiScheda(clienteId) {
  const nome = ge('cd-nome');
  if (!nome || !PAGAMENTI.attivo) return;
  const vecchio = ge('cd-pagamenti');
  if (vecchio) vecchio.remove();
  const r = statoPagamentiCliente(clienteId);
  const puo = RUOLI_SEGNANO_PAGAMENTI.includes(ROLE);
  if (!r && !puo) return;
  nome.insertAdjacentHTML('afterend', '<div id="cd-pagamenti" style="margin:6px 0">' +
    (r ? htmlBannerPagamenti(r).replace('data-pag-badge', '') + (r.da_nome ? '<div style="font-size:11px;color:var(--m)">Segnato da ' + esc(r.da_nome) + (r.il ? ' il ' + esc(fd(String(r.il).slice(0, 10))) : '') + '</div>' : '')
       : '<span class="bx bok">✅ Pagamenti regolari</span> ') +
    (puo ? '<button class="btn sm" style="margin-top:4px" onclick="apriStatoPagamenti(\'' + esc(clienteId) + '\')">💶 Stato dei pagamenti</button>' : '') + '</div>');
}

if (typeof openClienteDetail === 'function') {
  const openClienteDetailSenzaPagamenti = openClienteDetail;
  // eslint-disable-next-line no-global-assign
  openClienteDetail = async function(id) {
    const esito = await openClienteDetailSenzaPagamenti.apply(this, arguments);
    try { if (await caricaStatoPagamenti()) riquadroPagamentiScheda(id); } catch (e) { console.warn('Stato dei pagamenti:', e); }
    return esito;
  };
}

function apriStatoPagamenti(clienteId) {
  const r = statoPagamentiCliente(clienteId);
  ge('spg-id').value = clienteId;
  ge('spg-cliente').textContent = ((ge('cd-nome') || {}).textContent || '').trim();
  ge('spg-stato').value = r ? r.stato : 'regolare';
  ge('spg-nota').value = r ? r.nota || '' : '';
  cambiaStatoPagamenti();
  openM('m-stato-pagamenti');
}

function cambiaStatoPagamenti() {
  const s = STATI_PAGAMENTI[v('spg-stato')];
  ge('spg-nota-box').style.display = s ? '' : 'none';
  ge('spg-aiuto').textContent = s ? 'Tecnici e capo tecnico vedranno: ' + s.icona + ' ' + s.testo + ' (' + s.consiglio + ') con il motivo. Niente importi.' : 'Nessun segno per tecnici e capo tecnico.';
}

async function salvaStatoPagamenti() {
  const id = v('spg-id'), stato = v('spg-stato');
  const nota = String(v('spg-nota') || '').trim();
  if (stato !== 'regolare' && nota.length < 3) { toast('Scrivi il motivo: lo leggono tecnici e capo tecnico (es. due fatture non pagate)', 'err'); return; }
  const { error } = await db.rpc('imposta_stato_pagamenti_cliente', { p_cliente_id: id, p_stato: stato, p_nota: stato === 'regolare' ? null : nota });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  closeM('m-stato-pagamenti');
  toast(stato === 'regolare' ? 'Pagamenti regolari: segno tolto' : 'Salvato: ' + STATI_PAGAMENTI[stato].testo, 'ok');
  await caricaStatoPagamenti(true);
  riquadroPagamentiScheda(id);
}

// ── Avvio: lettura al login, controllore della pagina ─────────────────
(function avviaStatoPagamenti() {
  let attesa = null;
  const controlla = function() {
    if (attesa) return;
    attesa = setTimeout(function() { attesa = null; try { segnaPagamentiPagina(); } catch (e) { /* niente */ } }, 400);
  };
  document.addEventListener('DOMContentLoaded', function() {
    new MutationObserver(function() { if (PAGAMENTI.attivo) controlla(); }).observe(document.body, { childList: true, subtree: true });
  });
  setInterval(function() {
    if (typeof ROLE === 'undefined' || !ROLE || typeof db === 'undefined') return;
    if (PAGAMENTI.attivo === null) { caricaStatoPagamenti(); return; }
    if (PAGAMENTI.attivo) { aggiornaBannerPagamenti(); if (Date.now() - PAGAMENTI.letto > 300000) caricaStatoPagamenti(); }
  }, 1500);
})();

// ── Cosa tocca a me: interventi aperti di clienti da non contattare ────
if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'interventi-clienti-bloccati', ruoli: ['capo_tecnico', 'segreteria'], icona: '🔴', priorita: 45,
    titolo: 'Interventi aperti di clienti da non contattare (pagamenti)',
    vai: { pagina: 'interventi' },
    conta: async function() {
      if (!(await caricaStatoPagamenti())) return null;
      return Object.keys(PAGAMENTI.odl).filter(function(id) { const r = PAGAMENTI.clienti[PAGAMENTI.odl[id]]; return r && r.stato === 'bloccato'; }).length;
    }
  });
}
