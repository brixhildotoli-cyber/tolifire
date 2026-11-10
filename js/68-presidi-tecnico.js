// ── PRESIDI IN CONSULTAZIONE PER IL TECNICO (richiesta di Erika del 10/11) ──
// Caricato dopo js/67 e prima di js/19-init.js.
// La pagina Presidi (js/07, js/09 renderPC, js/20 storico, js/24-25 scadenze)
// per il tecnico è IN SOLA LETTURA: niente nuovo presidio, import, modifica,
// elimina, sostituisci. Con sql/257 il database gli fa leggere presidi, sedi e
// storico di TUTTI i clienti con presidi; la riga del cliente no (P.IVA, IBAN,
// contatti): il nome arriva dalla RPC elenco_clienti_presidi_tecnico().
// "Riporta in una nuova verifica" ed "Esegui nuovo controllo" restano solo per
// i clienti che il tecnico legge (quelli dei suoi interventi: cliente_visibile,
// la regola di salva_riporto_presidio di sql/255). Senza sql/257 la pagina
// mostra i clienti visibili come prima, con una nota.

const PRESIDI_TECNICO = { nomi: null, visibili: null, attivo: null };

function presidiSolaLettura() {
  return ROLE === 'tecnico';
}

// Clienti che il tecnico legge per RLS (cliente_visibile): lì il riporto vale.
function clienteVisibileTecnico(clienteId) {
  if (ROLE !== 'tecnico') return true;
  if (!PRESIDI_TECNICO.visibili) return true; // non ancora letti: decide il database
  return PRESIDI_TECNICO.visibili.has(clienteId);
}

function nomeClientePresidioTecnico(clienteId) {
  const c = PRESIDI_TECNICO.nomi && PRESIDI_TECNICO.nomi.get(clienteId);
  return c ? { ragione_sociale: c.ragione_sociale } : null;
}

async function caricaClientiPresidiTecnico() {
  const [rpc, vis] = await Promise.all([
    db.rpc('elenco_clienti_presidi_tecnico'),
    db.from('clienti').select('id')
  ]);
  PRESIDI_TECNICO.attivo = !rpc.error;
  PRESIDI_TECNICO.nomi = new Map((rpc.error ? [] : (rpc.data || [])).map(function(c) { return [c.id, c]; }));
  PRESIDI_TECNICO.visibili = vis.error ? null : new Set((vis.data || []).map(function(c) { return c.id; }));
}

// Bottoni in testa alla pagina e nota: per gli altri ruoli tutto come prima.
function aggiornaTestataPresidi() {
  const sola = presidiSolaLettura();
  ['btn-import-presidi', 'btn-nuovo-presidio'].forEach(function(id) {
    const b = ge(id);
    if (b) b.style.display = sola ? 'none' : '';
  });
  const nota = ge('presidi-tec-nota');
  if (!nota) return;
  if (!sola) { nota.style.display = 'none'; return; }
  nota.style.display = '';
  nota.className = PRESIDI_TECNICO.attivo ? 'al2 i' : 'al2 w';
  nota.textContent = PRESIDI_TECNICO.attivo
    ? '🔎 Consultazione: presidi e storico di tutti i clienti. Nuove verifiche e modifiche solo sui clienti dei tuoi interventi (📝 Esegui intervento).'
    : '🔎 Consultazione: vedi i presidi dei clienti dei tuoi interventi. Per vedere tutti i clienti serve l\'aggiornamento del database (sql/257).';
}

// Chiamata da loadPresidi (js/07) prima di disegnare.
async function completaClientiPresidi(presidi) {
  if (presidiSolaLettura()) {
    try { await caricaClientiPresidiTecnico(); } catch (e) { PRESIDI_TECNICO.attivo = false; }
    (presidi || []).forEach(function(p) {
      if (!p.clienti) p.clienti = nomeClientePresidioTecnico(p.cliente_id);
    });
  }
  aggiornaTestataPresidi();
}

// Storico (js/20): riporto solo sui clienti visibili; per gli altri "👁 Apri".
if (typeof riportaStoricoPresidi === 'function') {
  const riportaStoricoPresidiPrima257 = riportaStoricoPresidi;
  riportaStoricoPresidi = function() {
    if (!riportaStoricoPresidiPrima257()) return false;
    return clienteVisibileTecnico(storicoPresidi.anagrafica && storicoPresidi.anagrafica.cliente_id);
  };
}

function storicoInSolaLettura() {
  return ROLE === 'tecnico' && !clienteVisibileTecnico(storicoPresidi.anagrafica && storicoPresidi.anagrafica.cliente_id);
}

if (typeof mostraStoricoPresidio === 'function') {
  const mostraStoricoPresidioPrima257 = mostraStoricoPresidio;
  mostraStoricoPresidio = function() {
    const esito = mostraStoricoPresidioPrima257.apply(this, arguments);
    if (storicoInSolaLettura()) {
      const box = ge('storico-presidio');
      if (box) box.querySelectorAll('button[onclick^="apriEditorSchedaPresidio("]').forEach(function(b) {
        if (/,\s*false\)/.test(b.getAttribute('onclick') || '')) b.textContent = '👁 Apri ' + b.textContent.replace(/^\s*Apri \/ modifica\s*/, '');
      });
    }
    return esito;
  };
}

if (typeof apriEditorSchedaPresidio === 'function') {
  const apriEditorSchedaPresidioPrima257 = apriEditorSchedaPresidio;
  apriEditorSchedaPresidio = function(indice, riporta) {
    const esito = apriEditorSchedaPresidioPrima257.apply(this, arguments);
    const box = ge('storico-presidio');
    if (storicoInSolaLettura() && box) {
      box.querySelectorAll('input, textarea, select').forEach(function(el) { el.disabled = true; });
      const salva = ge('sp-salva');
      if (salva) salva.style.display = 'none';
      const titolo = box.querySelector('h3');
      if (titolo) titolo.insertAdjacentHTML('afterend', '<div class="al2 i" style="margin:6px 0">Solo consultazione: il cliente non è tra i tuoi interventi.</div>');
    }
    return esito;
  };
}

// Scadenze (js/25): "Esegui nuovo controllo" solo sui clienti visibili.
if (typeof renderPS === 'function') {
  const renderPSPrima257 = renderPS;
  renderPS = async function(data) {
    const esito = await renderPSPrima257.apply(this, arguments);
    if (ROLE === 'tecnico') {
      const tab = ge('tc-ps');
      if (tab) tab.querySelectorAll('[data-nuovo-controllo]').forEach(function(b) {
        const p = (PA || []).find(function(x) { return x.id === b.dataset.nuovoControllo; });
        if (p && !clienteVisibileTecnico(p.cliente_id)) b.remove();
      });
    }
    return esito;
  };
}

if (typeof eseguiNuovoControllo === 'function') {
  const eseguiNuovoControlloPrima257 = eseguiNuovoControllo;
  eseguiNuovoControllo = async function(id) {
    const p = (PA || []).find(function(x) { return x.id === id; });
    if (p && !clienteVisibileTecnico(p.cliente_id)) {
      toast('Il cliente non è tra i tuoi interventi: il controllo si registra da Esegui intervento.', 'err');
      return;
    }
    return eseguiNuovoControlloPrima257.apply(this, arguments);
  };
}

// Difesa: dalla pagina Presidi il tecnico non apre modifica né nuovo presidio
// (i bottoni non ci sono; questo vale anche da console, il database decide).
['editP', 'apriImportPresidi'].forEach(function(nome) {
  const prima = window[nome];
  if (typeof prima !== 'function') return;
  window[nome] = function() {
    if (presidiSolaLettura() && ge('pg-presidi') && ge('pg-presidi').classList.contains('on')) {
      toast('Pagina Presidi in consultazione per il tuo ruolo.', 'err');
      return;
    }
    return prima.apply(this, arguments);
  };
});
