// =====================================================================
// js/54-recupero-contratti.js — risposte di Toli del 03/11 sui contratti
// ---------------------------------------------------------------------
// 1. PRESIDI PREVISTI DAL CONTRATTO (risposta 9): li corregge anche il
//    rappresentante, per i suoi clienti. Nella scheda cliente, tab
//    Periodicità, il rappresentante cambia SOLO i "N. previsti dal
//    contratto" (il resto è in sola lettura) e salva con la RPC
//    imposta_presidi_contratto (sql/58). Prima, salvando, il database non
//    scriveva nulla (regole di sql/08) e il sito diceva "salvati".
// 2. CONTRATTO DISDETTO O NON RINNOVATO (risposta 2): "bisogna assegnarlo a
//    un venditore che lo chiama per richiuderlo". Con sql/58:
//    - "❌ Disdetta anticipata" nella scheda anche prima della scadenza
//      (registra "Non rinnovato" con il motivo, come sempre);
//    - il contratto diventa "da richiamare" e compare nel box
//      "📞 Contratti da richiamare" del rappresentante del cliente
//      (rap-contratti-recupero) e di titolare e segreteria
//      (tit-/seg-contratti-recupero), con Chiama, Apri contratto,
//      "✅ Rinnovato" (il cliente torna: diventa "recuperato" da solo) e
//      "✖ Perso" (nota obbligatoria, chiudi_recupero_contratto);
//    - cliente senza rappresentante: titolare e segreteria lo assegnano
//      ("👤 Assegna venditore", assegna_rappresentante_cliente): il
//      venditore diventa il rappresentante del cliente.
//    Il piano dei controlli NON cambia da solo.
// Senza sql/58 tutto come prima.
// =====================================================================

const BOX_CONTRATTI_RECUPERO = {
  rappresentante: 'rap-contratti-recupero',
  titolare: 'tit-contratti-recupero',
  segreteria: 'seg-contratti-recupero'
};
const RUOLI_ASSEGNA_VENDITORE = ['titolare', 'segreteria'];
const RUOLI_CHIUDI_RECUPERO = ['titolare', 'segreteria', 'rappresentante'];

let recuperoContrattiAttivo = null; // null = da verificare
let recuperoAperto = null;          // contratto della finestra "Perso" / "Assegna"
const contrattiRecuperoCache = {};

async function verificaRecuperoContrattiDisponibile() {
  if (recuperoContrattiAttivo !== null) return recuperoContrattiAttivo;
  const { error } = await db.from('clienti_periodicita').select('recupero_stato').limit(1);
  if (!error) recuperoContrattiAttivo = true;
  else if (error.code === '42703' || error.code === 'PGRST204' || /recupero_stato/.test(error.message || '')) recuperoContrattiAttivo = false;
  else return false; // errore diverso: si riprova la prossima volta
  return recuperoContrattiAttivo;
}

// ── 1. Presidi previsti: il rappresentante li corregge ────────────────
(function() {
  if (typeof loadPeriodicitaCliente !== 'function') return;
  const loadPeriodicitaClientePrimaRecupero = loadPeriodicitaCliente;
  loadPeriodicitaCliente = async function() {
    const risultato = await loadPeriodicitaClientePrimaRecupero.apply(this, arguments);
    if (ROLE === 'rappresentante') bloccaPeriodicitaRappresentante();
    return risultato;
  };
})();

// Il rappresentante cambia solo i presidi previsti: il resto della scheda
// Periodicità resta da leggere (lo cambia la segreteria).
function bloccaPeriodicitaRappresentante() {
  const pagina = ge('cd-periodicita');
  if (!pagina) return;
  const campiPresidi = pagina.querySelectorAll('input[id^="perio-n-"]');
  pagina.querySelectorAll('input, select, textarea').forEach(function(el) {
    if (/^perio-n-/.test(el.id || '')) return;
    el.disabled = true;
  });
  const gen = ge('btn-genera-piano');
  if (gen) gen.style.display = 'none';
  const salva = pagina.querySelector('button[onclick="savePeriodicita()"]');
  if (salva) {
    salva.textContent = '💾 Salva presidi previsti';
    salva.style.display = campiPresidi.length ? '' : 'none';
  }
  if (!ge('perio-nota-rappresentante')) {
    const card = ge('cd-perio-content');
    if (card) card.insertAdjacentHTML('beforebegin', '<div id="perio-nota-rappresentante" class="al2 i" style="margin-bottom:10px;font-size:12px">Puoi correggere i <b>presidi previsti dal contratto</b> (es. dopo l\'audit). Date, frequenze e note del contratto le cambia la segreteria.</div>');
  }
}

(function() {
  if (typeof savePeriodicita !== 'function') return;
  const savePeriodicitaPrimaRecupero = savePeriodicita;
  savePeriodicita = async function() {
    if (ROLE !== 'rappresentante') return savePeriodicitaPrimaRecupero.apply(this, arguments);
    return salvaPresidiContrattoRappresentante();
  };
})();

async function salvaPresidiContrattoRappresentante() {
  if (!currentCliId) { toast('Errore: nessun cliente selezionato', 'err'); return; }
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
      return;
    }
    presidi[t] = n;
  }
  const { error } = await db.rpc('imposta_presidi_contratto', { p_cliente_id: currentCliId, p_presidi: presidi });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') toast('La correzione dei presidi previsti non è ancora attiva (aggiornamento del database in attesa)', 'err');
    else toast('Presidi non salvati: ' + (error.message || 'errore'), 'err');
    return;
  }
  toast('✅ Presidi previsti dal contratto salvati', 'ok');
  await loadPeriodicitaCliente(currentCliId);
}

// ── 2. Scheda cliente: disdetta anticipata e stato del recupero ───────
(function() {
  if (typeof caricaRinnovoContrattoScheda !== 'function') return;
  const caricaRinnovoContrattoSchedaPrima = caricaRinnovoContrattoScheda;
  caricaRinnovoContrattoScheda = async function(cliId, perio) {
    const risultato = await caricaRinnovoContrattoSchedaPrima.apply(this, arguments);
    try { decoraRecuperoContrattoScheda(cliId, perio); } catch (e) { console.warn('Recupero del contratto:', e); }
    return risultato;
  };
})();

function testoStatoRecupero(c) {
  if (c.recupero_stato === 'da_richiamare') return '📞 Da richiamare: il rappresentante del cliente lo chiama per riprendere il contratto.';
  if (c.recupero_stato === 'perso') return '✖ Recupero chiuso: cliente perso' + (c.recupero_chiuso_da_nome ? ' (' + c.recupero_chiuso_da_nome + ', ' + fd(dataLocaleISO(new Date(c.recupero_chiuso_il))) + ')' : '') + (c.recupero_nota ? ': ' + c.recupero_nota : '') + '.';
  if (c.recupero_stato === 'recuperato') return '✅ Contratto recuperato' + (c.recupero_chiuso_il ? ' il ' + fd(dataLocaleISO(new Date(c.recupero_chiuso_il))) : '') + (c.recupero_chiuso_da_nome ? ' (' + c.recupero_chiuso_da_nome + ')' : '') + '.';
  return '';
}

function decoraRecuperoContrattoScheda(cliId, perio) {
  const box = ge('perio-rinnovo-box');
  if (!box || !perio || !perio.id || !Object.prototype.hasOwnProperty.call(perio, 'recupero_stato')) return;
  let html = '';
  if (perio.contratto_stato === 'non_rinnovato' && perio.recupero_stato) {
    html += '<div style="font-size:12px;margin:-2px 0 8px">' + esc(testoStatoRecupero(perio)) + '</div>';
    if (perio.recupero_stato === 'da_richiamare' && RUOLI_CHIUDI_RECUPERO.includes(ROLE)) {
      html += '<div style="margin-bottom:8px"><button class="btn sm" data-cli="' + esc(cliId) + '" onclick="apriRecuperoPerso(this.dataset.cli)">✖ Perso: il cliente non torna</button></div>';
    }
  } else if (perio.contratto_stato !== 'non_rinnovato' && perio.recupero_stato === 'recuperato') {
    html += '<div style="font-size:12px;color:var(--m);margin:-2px 0 8px">' + esc(testoStatoRecupero(perio)) + '</div>';
  }
  // Disdetta prima della scadenza: "Non rinnovato" anche fuori dal preavviso.
  const scad = typeof scadenzaContratto === 'function' ? scadenzaContratto(perio) : null;
  if (perio.contratto_stato !== 'non_rinnovato' && perio.data_fine_contratto && puoRegistrareRinnovo() && !(scad && scad.inScadenza)) {
    html += '<div style="margin-bottom:8px"><button class="btn sm" data-cli="' + esc(cliId) + '" onclick="apriRinnovoContratto(this.dataset.cli,\'non_rinnovato\')">❌ Disdetta anticipata</button>' +
      '<div style="font-size:11px;color:var(--m);margin-top:4px">Se il cliente disdice prima della fine: il contratto passa al rappresentante, che lo richiama per riprenderlo.</div></div>';
  }
  if (html) box.insertAdjacentHTML('beforeend', html);
}

// ── 3. Dashboard: contratti da richiamare ─────────────────────────────
async function leggiContrattiDaRichiamare() {
  if (!(await verificaRecuperoContrattiDisponibile())) return null;
  const { data, error } = await db
    .from('clienti_periodicita')
    .select('id, cliente_id, data_inizio_contratto, data_fine_contratto, durata_contratto, presidi_contratto, recupero_stato, recupero_dal, ' +
      'clienti(ragione_sociale, rappresentante_id, eliminato_il, referente_nome, referente_telefono, utenti!clienti_rappresentante_id_fkey(nome, cognome))')
    .eq('recupero_stato', 'da_richiamare')
    .order('recupero_dal', { ascending: true });
  if (error) { console.warn('Contratti da richiamare:', error.message); return null; }
  let righe = (data || []).filter(function(c) { return c.clienti && !c.clienti.eliminato_il; });
  if (ROLE === 'rappresentante') righe = righe.filter(function(c) { return c.clienti.rappresentante_id === ME.id; });
  if (!righe.length) return righe;
  const { data: storico } = await db
    .from('clienti_periodicita_rinnovi')
    .select('cliente_id, motivo, registrato_il, registrato_da_nome')
    .eq('esito', 'non_rinnovato')
    .in('cliente_id', righe.map(function(c) { return c.cliente_id; }))
    .order('registrato_il', { ascending: false });
  righe.forEach(function(c) {
    c.ultimoMotivo = (storico || []).find(function(r) { return r.cliente_id === c.cliente_id; }) || null;
  });
  return righe;
}

async function caricaContrattiDaRichiamareDashboard() {
  const box = ge(BOX_CONTRATTI_RECUPERO[ROLE] || '');
  if (!box) return;
  const righe = await leggiContrattiDaRichiamare();
  if (!righe || !righe.length) { box.innerHTML = ''; return; }
  righe.forEach(function(c) { contrattiRecuperoCache[c.cliente_id] = c; });
  const aiuto = ROLE === 'rappresentante'
    ? 'Clienti tuoi che hanno disdetto o non hanno rinnovato il contratto di manutenzione: chiamali per riprenderlo. Se tornano registra "Rinnovato", se no "Perso" con com\'è andata.'
    : 'Contratti disdetti o non rinnovati: li richiama il rappresentante del cliente. Ai clienti senza rappresentante va assegnato un venditore.';
  const html = righe.map(function(c) {
    const cli = c.clienti;
    const rapp = cli.utenti ? ((cli.utenti.nome || '') + ' ' + (cli.utenti.cognome || '')).trim() : '';
    const giorni = c.recupero_dal ? Math.max(0, Math.round((Date.now() - new Date(c.recupero_dal).getTime()) / 86400000)) : null;
    const m = c.ultimoMotivo;
    const chi = ROLE === 'rappresentante' ? '' : (cli.rappresentante_id
      ? '<div style="font-size:12px;color:var(--m)">Lo richiama: ' + esc(rapp || '—') + '</div>'
      : '<div style="font-size:12px;color:var(--r)">Cliente senza rappresentante: assegna un venditore</div>');
    const tel = cli.referente_telefono ? '<a class="btn sm p" style="text-decoration:none" href="tel:' + esc(cli.referente_telefono) + '">📞 Chiama' + (cli.referente_nome ? ' ' + esc(cli.referente_nome) : '') + '</a>' : '';
    return '<div style="padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start">' +
        '<div style="font-weight:600;min-width:0;overflow-wrap:anywhere">' + esc(cli.ragione_sociale || 'Cliente') + '</div>' +
        (giorni !== null ? '<span class="bx ' + (giorni > 14 ? 'berr' : 'bwarn') + '">da ' + giorni + (giorni === 1 ? ' giorno' : ' giorni') + '</span>' : '') +
      '</div>' +
      '<div style="font-size:12px;color:var(--m);margin-top:2px">Contratto ' + esc(c.durata_contratto === 'quinquennale' ? 'quinquennale' : 'annuale') + (c.data_fine_contratto ? ' fino al ' + esc(fd(c.data_fine_contratto)) : '') + '</div>' +
      (m ? '<div style="font-size:12px;overflow-wrap:anywhere">Motivo: ' + esc(m.motivo || '—') + (m.registrato_da_nome ? ' <span style="color:var(--m)">(' + esc(m.registrato_da_nome) + ')</span>' : '') + '</div>' : '') +
      chi +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + tel +
        '<button class="btn sm" data-cli="' + esc(c.cliente_id) + '" onclick="apriContrattoCliente(this.dataset.cli)">Apri contratto</button>' +
        (puoRegistrareRinnovo() && cli.rappresentante_id ? '<button class="btn sm" data-cli="' + esc(c.cliente_id) + '" onclick="apriRinnovoContratto(this.dataset.cli,\'rinnovato\')">✅ Rinnovato</button>' : '') +
        (RUOLI_CHIUDI_RECUPERO.includes(ROLE) && cli.rappresentante_id ? '<button class="btn sm" data-cli="' + esc(c.cliente_id) + '" onclick="apriRecuperoPerso(this.dataset.cli)">✖ Perso</button>' : '') +
        (RUOLI_ASSEGNA_VENDITORE.includes(ROLE) && !cli.rappresentante_id ? '<button class="btn sm p" data-cli="' + esc(c.cliente_id) + '" onclick="apriAssegnaVenditore(this.dataset.cli)">👤 Assegna venditore</button>' : '') +
      '</div></div>';
  }).join('');
  box.innerHTML = '<div class="tit-section" style="margin-top:14px">📞 Contratti da richiamare (' + righe.length + ')</div>' +
    '<div class="rap-list-card" style="margin-bottom:14px"><div style="font-size:12px;color:var(--m);margin-bottom:4px">' + esc(aiuto) + '</div>' + html + '</div>';
}

// Si carica insieme ai contratti in scadenza (titolare, rappresentante) e
// con la dashboard della segreteria.
(function() {
  if (typeof caricaContrattiInScadenzaDashboard === 'function') {
    const caricaContrattiInScadenzaPrimaRecupero = caricaContrattiInScadenzaDashboard;
    caricaContrattiInScadenzaDashboard = async function() {
      const risultato = await caricaContrattiInScadenzaPrimaRecupero.apply(this, arguments);
      try { await caricaContrattiDaRichiamareDashboard(); } catch (e) { console.warn('Contratti da richiamare:', e); }
      return risultato;
    };
  }
  if (typeof loadDashSegreteriaPg === 'function') {
    const loadDashSegreteriaPgPrimaRecupero = loadDashSegreteriaPg;
    loadDashSegreteriaPg = async function() {
      const risultato = await loadDashSegreteriaPgPrimaRecupero.apply(this, arguments);
      caricaContrattiDaRichiamareDashboard().catch(function(e) { console.warn('Contratti da richiamare:', e); });
      return risultato;
    };
  }
})();

async function dopoRecuperoContratto(cliId) {
  await caricaContrattiDaRichiamareDashboard();
  if (typeof currentCliId !== 'undefined' && currentCliId === cliId && ge('pg-cliente-detail') && ge('pg-cliente-detail').classList.contains('on')) {
    await loadPeriodicitaCliente(cliId);
  }
  if (typeof caricaToccaAMe === 'function') caricaToccaAMe().catch(function() {});
}

// ── Finestra "Perso" ──────────────────────────────────────────────────
async function apriRecuperoPerso(cliId) {
  if (!RUOLI_CHIUDI_RECUPERO.includes(ROLE)) return;
  let c = contrattiRecuperoCache[cliId];
  if (!c) {
    const { data } = await db.from('clienti_periodicita').select('id, cliente_id, clienti(ragione_sociale)').eq('cliente_id', cliId).maybeSingle();
    c = data;
  }
  if (!c) { toast('Contratto non trovato', 'err'); return; }
  recuperoAperto = { cliId: cliId };
  ge('rcp-cliente').textContent = (c.clienti && c.clienti.ragione_sociale) || 'Cliente';
  ge('rcp-nota').value = '';
  ge('rcp-salva').disabled = true;
  openM('m-recupero-perso');
}

async function salvaRecuperoPerso() {
  const r = recuperoAperto;
  const nota = (v('rcp-nota') || '').trim();
  if (!r || !nota) return;
  ge('rcp-salva').disabled = true;
  const { error } = await db.rpc('chiudi_recupero_contratto', { p_cliente_id: r.cliId, p_nota: nota });
  if (error) { ge('rcp-salva').disabled = false; toast('Non registrato: ' + (error.message || 'errore'), 'err'); return; }
  closeM('m-recupero-perso');
  recuperoAperto = null;
  toast('Registrato: cliente perso. Se ci ripensa si registra "Rinnovato" dal contratto', 'ok');
  await dopoRecuperoContratto(r.cliId);
}

// ── Finestra "Assegna venditore" ──────────────────────────────────────
async function apriAssegnaVenditore(cliId) {
  if (!RUOLI_ASSEGNA_VENDITORE.includes(ROLE)) return;
  const c = contrattiRecuperoCache[cliId];
  const { data: venditori, error } = await db.from('utenti').select('id, nome, cognome')
    .eq('ruolo', 'rappresentante').eq('attivo', true).order('nome', { ascending: true });
  if (error || !(venditori || []).length) { toast('Nessun rappresentante attivo da scegliere', 'err'); return; }
  recuperoAperto = { cliId: cliId };
  ge('asv-cliente').textContent = (c && c.clienti && c.clienti.ragione_sociale) || 'Cliente';
  ge('asv-venditore').innerHTML = '<option value="">— Scegli il venditore —</option>' + venditori.map(function(u) {
    return '<option value="' + esc(u.id) + '">' + esc(((u.nome || '') + ' ' + (u.cognome || '')).trim()) + '</option>';
  }).join('');
  ge('asv-salva').disabled = true;
  openM('m-assegna-venditore');
}

async function salvaAssegnaVenditore() {
  const r = recuperoAperto;
  const id = v('asv-venditore');
  if (!r || !id) return;
  ge('asv-salva').disabled = true;
  const { data, error } = await db.rpc('assegna_rappresentante_cliente', { p_cliente_id: r.cliId, p_rappresentante_id: id });
  if (error) { ge('asv-salva').disabled = false; toast('Venditore non assegnato: ' + (error.message || 'errore'), 'err'); return; }
  closeM('m-assegna-venditore');
  recuperoAperto = null;
  toast('Assegnato a ' + ((data && data.rappresentante_nome) || 'il venditore') + ': ora è il rappresentante del cliente e lo richiama', 'ok');
  await dopoRecuperoContratto(r.cliId);
}

// ── "Cosa tocca a me" ─────────────────────────────────────────────────
if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'contratti-da-richiamare', ruoli: ['rappresentante'], icona: '📞',
    titolo: 'Contratti disdetti da richiamare',
    vai: { box: function() { return BOX_CONTRATTI_RECUPERO[ROLE] || ''; } },
    conta: async function() {
      if (!(await verificaRecuperoContrattiDisponibile())) return null;
      const n = await numeroTAM(db.from('clienti_periodicita').select('id, clienti!inner(rappresentante_id)', { count: 'exact', head: true })
        .eq('recupero_stato', 'da_richiamare').eq('clienti.rappresentante_id', ME.id), 'contratti da richiamare');
      return n === null ? null : { n: n };
    }
  });
  registraFonteToccaAMe({
    id: 'contratti-senza-venditore', ruoli: ['titolare', 'segreteria'], icona: '👤',
    titolo: 'Contratti disdetti senza venditore',
    vai: { box: function() { return BOX_CONTRATTI_RECUPERO[ROLE] || ''; } },
    conta: async function() {
      if (!(await verificaRecuperoContrattiDisponibile())) return null;
      const n = await numeroTAM(db.from('clienti_periodicita').select('id, clienti!inner(rappresentante_id)', { count: 'exact', head: true })
        .eq('recupero_stato', 'da_richiamare').is('clienti.rappresentante_id', null), 'contratti senza venditore');
      return n === null ? null : { n: n };
    }
  });
}
