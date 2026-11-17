// ── IL CAPO TECNICO SEGNA "IL CLIENTE NON PAGA" (sql/273, richiesta di Erika del 17/11) ──
// Nella dashboard del capo tecnico, "🔁 Controlli scaduti: da ripianificare",
// un presidio scaduto può restare lì perché il cliente non paga: prima il capo
// tecnico non poteva segnarlo da nessuna parte. Usa lo stato dei pagamenti di
// sql/270 (js/85: 🟡 ritardo, 🔴 non intervenire). Decisioni di Erika:
//   - anche il capo tecnico segna (🟡 o 🔴, con il motivo); avviso a segreteria
//     e titolare (dentro la RPC di sql/273). Il segno lo TOGLIE solo la
//     segreteria o il titolare, quando il cliente paga;
//   - i clienti 🔴 escono dalla lista "da ripianificare" e finiscono in una
//     riga grigia a parte "⛔ Fermi: il cliente non paga (N)", chiusa, con il
//     motivo e chi l'ha segnato (anche dal Piano mensile e dal conteggio di
//     Cosa tocca a me escono);
//   - SOLO AVVISO: niente blocchi (il banner sotto la scelta del cliente
//     nell'intervento c'è già, js/85).
// Ogni riga della lista ha "⛔ Non paga" (capo tecnico e titolare); la scheda
// del cliente ha "💶 Stato dei pagamenti" anche per il capo tecnico (senza
// "✅ Regolare" se non è lui a poterlo togliere). Senza sql/273 nulla cambia.

const NON_PAGA = { attivo: null };

async function verificaNonPagaCapoTecnico() {
  if (NON_PAGA.attivo !== null) return NON_PAGA.attivo;
  if (!['capo_tecnico', 'titolare', 'segreteria'].includes(ROLE)) { NON_PAGA.attivo = false; return false; }
  try {
    const { data, error } = await db.rpc('capo_tecnico_segna_pagamenti_attivo');
    NON_PAGA.attivo = !error && data === true;
  } catch (e) { NON_PAGA.attivo = false; }
  if (NON_PAGA.attivo && typeof RUOLI_SEGNANO_PAGAMENTI !== 'undefined' && !RUOLI_SEGNANO_PAGAMENTI.includes('capo_tecnico')) {
    RUOLI_SEGNANO_PAGAMENTI.push('capo_tecnico');
  }
  return NON_PAGA.attivo;
}

// Lista "da ripianificare": fuori i clienti 🔴, tenuti a parte in ris.fermiNonPaga
if (typeof controlliDaRipianificare === 'function') {
  const controlliDaRipianificareConTutti = controlliDaRipianificare;
  // eslint-disable-next-line no-global-assign
  controlliDaRipianificare = async function() {
    const ris = await controlliDaRipianificareConTutti.apply(this, arguments);
    try {
      if (!ris || ris.errore || !ris.lista || typeof caricaStatoPagamenti !== 'function') return ris;
      if (!(await caricaStatoPagamenti())) return ris;
      const fermi = [];
      ris.lista = ris.lista.filter(function(g) {
        const r = statoPagamentiCliente(g.cliente_id);
        if (r && r.stato === 'bloccato') { fermi.push(Object.assign({ pagamenti: r }, g)); return false; }
        return true;
      });
      ris.fermiNonPaga = fermi;
    } catch (e) { console.warn('Clienti che non pagano:', e); }
    return ris;
  };
}

function htmlFermiNonPaga(fermi) {
  if (!fermi || !fermi.length) return '';
  return '<details class="ct-pane" data-fermi-non-paga style="margin-top:8px;background:var(--bg2,#f4f4f2);opacity:.9">' +
    '<summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--m)">⛔ Fermi: il cliente non paga (' + fermi.length + ')</summary>' +
    '<div style="font-size:12px;color:var(--m);margin:6px 0">Controlli da fare ma fermi finché il cliente non paga. Il segno lo toglie la segreteria o il titolare dalla scheda del cliente: allora il cliente torna nella lista.</div>' +
    fermi.map(function(g) {
      const r = g.pagamenti || {};
      return '<div style="padding:8px 0;border-top:0.5px solid var(--bo);overflow-wrap:anywhere;color:var(--m)">' +
        '<div style="font-size:13px;font-weight:600">' + esc(g.ragione_sociale) + '</div>' +
        '<div style="font-size:12px">🔴 ' + esc(r.nota || 'Non intervenire') + (r.da_nome ? ' <span>(' + esc(r.da_nome) + (r.il ? ', ' + esc(fd(String(r.il).slice(0, 10))) : '') + ')</span>' : '') + '</div>' +
        '<div style="opacity:.8">' + htmlMotiviRipartenza(g) + '</div>' +
        '<div style="margin-top:6px"><button class="btn sm" data-cli="' + esc(g.cliente_id) + '" onclick="apriContrattoCliente(this.dataset.cli)">Apri cliente</button></div>' +
      '</div>';
    }).join('') + '</details>';
}

if (typeof caricaControlliDaRipianificareDashboard === 'function') {
  const caricaControlliDaRipianificareDashboardSenzaFermi = caricaControlliDaRipianificareDashboard;
  // eslint-disable-next-line no-global-assign
  caricaControlliDaRipianificareDashboard = async function() {
    const attivo = await verificaNonPagaCapoTecnico();
    let ultimo = null;
    if (attivo) {
      // Il risultato della lettura fatta dalla dashboard (una sola lettura)
      const leggi = controlliDaRipianificare;
      // eslint-disable-next-line no-global-assign
      controlliDaRipianificare = async function() { ultimo = await leggi.apply(this, arguments); return ultimo; };
      try { await caricaControlliDaRipianificareDashboardSenzaFermi.apply(this, arguments); }
      finally {
        // eslint-disable-next-line no-global-assign
        controlliDaRipianificare = leggi;
      }
    } else {
      return caricaControlliDaRipianificareDashboardSenzaFermi.apply(this, arguments);
    }
    const box = ge('ct-ripartenza');
    if (!box || !ultimo || ultimo.errore) return;
    // "⛔ Non paga" accanto ad "Apri cliente" di ogni riga
    box.querySelectorAll('button[onclick^="apriContrattoCliente"]').forEach(function(b) {
      const cli = b.dataset.cli;
      if (!cli || b.parentElement.querySelector('[data-non-paga]')) return;
      const riga = b.closest('div[style*="border-bottom"]');
      const nome = riga ? riga.querySelector('div[style*="font-weight:600"]') : null;
      b.insertAdjacentHTML('afterend', '<button class="btn sm" style="color:var(--r)" data-non-paga="' + esc(cli) + '" data-nome="' + esc(nome ? nome.textContent : '') + '" onclick="apriNonPaga(this.dataset.nonPaga, this.dataset.nome)">⛔ Non paga</button>');
    });
    const pane = box.querySelector('.ct-pane');
    if (pane) pane.insertAdjacentHTML('afterend', htmlFermiNonPaga(ultimo.fermiNonPaga));
  };
}

// Finestra (m-stato-pagamenti di js/85) già su 🔴, dalla riga della lista
function apriNonPaga(clienteId, nome) {
  if (typeof apriStatoPagamenti !== 'function') return;
  apriStatoPagamenti(clienteId);
  ge('spg-cliente').textContent = nome || '';
  const r = statoPagamentiCliente(clienteId);
  if (!r) { ge('spg-stato').value = 'bloccato'; cambiaStatoPagamenti(); }
  setTimeout(function() { const n = ge('spg-nota'); if (n) n.focus(); }, 50);
}

// Il capo tecnico non toglie il segno: niente "✅ Regolare" nella finestra
if (typeof apriStatoPagamenti === 'function') {
  const apriStatoPagamentiTutti = apriStatoPagamenti;
  // eslint-disable-next-line no-global-assign
  apriStatoPagamenti = function(clienteId) {
    const esito = apriStatoPagamentiTutti.apply(this, arguments);
    const opt = document.querySelector('#spg-stato option[value="regolare"]');
    if (opt) {
      const ct = ROLE === 'capo_tecnico';
      opt.hidden = ct; opt.disabled = ct;
      if (ct && ge('spg-stato').value === 'regolare') { ge('spg-stato').value = 'bloccato'; cambiaStatoPagamenti(); }
    }
    let nota = ge('spg-nota-ct');
    if (ROLE === 'capo_tecnico') {
      if (!nota) {
        ge('spg-aiuto').insertAdjacentHTML('afterend', '<div id="spg-nota-ct" style="font-size:12px;color:var(--m);margin-top:6px">Segreteria e titolare ricevono un avviso. Il segno lo tolgono loro quando il cliente paga.</div>');
      }
    } else if (nota) nota.remove();
    return esito;
  };
}

// Dopo il salvataggio: la lista della dashboard si ridisegna
if (typeof salvaStatoPagamenti === 'function') {
  const salvaStatoPagamentiSenzaLista = salvaStatoPagamenti;
  // eslint-disable-next-line no-global-assign
  salvaStatoPagamenti = async function() {
    const esito = await salvaStatoPagamentiSenzaLista.apply(this, arguments);
    const box = ge('ct-ripartenza');
    if (box && box.offsetParent && typeof caricaControlliDaRipianificareDashboard === 'function') {
      try { await caricaControlliDaRipianificareDashboard(); } catch (e) { /* niente */ }
    }
    return esito;
  };
}

// Scheda cliente: il capo tecnico vede "💶 Stato dei pagamenti" (dopo la verifica)
if (typeof openClienteDetail === 'function') {
  const openClienteDetailSenzaNonPaga = openClienteDetail;
  // eslint-disable-next-line no-global-assign
  openClienteDetail = async function(id) {
    if (ROLE === 'capo_tecnico') { try { await verificaNonPagaCapoTecnico(); } catch (e) { /* niente */ } }
    return openClienteDetailSenzaNonPaga.apply(this, arguments);
  };
}
