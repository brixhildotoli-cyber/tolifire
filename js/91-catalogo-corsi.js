// ── F19.1 — CATALOGO DEI CORSI E DELLE ABILITAZIONI (sql/152) ────────────
// Decisione di Erika del 16/11: tabella corsi_catalogo gestita dal titolare
// al posto della costante TIPI_DOCUMENTO_TEAM_SUBAPPALTI di js/30 (stessi
// codici). Con sql/152 la costante si riempie dalla tabella (in place: chi la
// usa, js/30 e js/31, non cambia); i corsi spenti spariscono dal menu dei
// documenti nuovi ma i documenti vecchi restano leggibili. Senza sql/152 resta
// la costante come oggi.
// Impostazioni → riquadro "🎓 Corsi e abilitazioni" (titolare) → finestra
// m-catalogo-corsi (id ccr-): elenco, nuovo corso, modifica (nome, per chi,
// validità in mesi, obbligatorio per legge, ore di aggiornamento, ente,
// attivo, ordine) e registro delle modifiche (registro delle azioni, sql/67).

const CATALOGO_CORSI = { disponibile: null, righe: [], letto: 0, aperto: null };

async function caricaCatalogoCorsi(forza) {
  if (!forza && CATALOGO_CORSI.letto && Date.now() - CATALOGO_CORSI.letto < 300000) return CATALOGO_CORSI.disponibile;
  const { data, error } = await db.from('corsi_catalogo').select('*').order('ordine', { ascending: true }).order('nome', { ascending: true });
  if (error) { CATALOGO_CORSI.disponibile = false; return false; }
  CATALOGO_CORSI.disponibile = true;
  CATALOGO_CORSI.righe = data || [];
  CATALOGO_CORSI.letto = Date.now();
  if (typeof TIPI_DOCUMENTO_TEAM_SUBAPPALTI !== 'undefined' && CATALOGO_CORSI.righe.length) {
    const nuovi = CATALOGO_CORSI.righe.map(function(r) {
      const t = { id: r.codice, per: r.per, nome: r.nome, attivo: r.attivo !== false, obbligo_legge: !!r.obbligo_legge };
      if (r.validita_mesi) t.mesi = r.validita_mesi;
      if (r.validita_giorni) t.giorni = r.validita_giorni;
      if (r.riservato) t.riservato = true;
      if (r.ore_aggiornamento != null) t.ore_aggiornamento = Number(r.ore_aggiornamento);
      if (r.ente) t.ente = r.ente;
      return t;
    });
    TIPI_DOCUMENTO_TEAM_SUBAPPALTI.length = 0;
    nuovi.forEach(function(t) { TIPI_DOCUMENTO_TEAM_SUBAPPALTI.push(t); });
  }
  return true;
}

// Menu del tipo nei documenti: senza i corsi spenti (resta quello già scelto)
if (typeof opzioniTipoDocumentoTS === 'function') {
  // eslint-disable-next-line no-global-assign
  opzioniTipoDocumentoTS = function(perSubappaltatore, scelto) {
    const gruppo = function(etichetta, filtro) {
      const tipi = TIPI_DOCUMENTO_TEAM_SUBAPPALTI.filter(function(t) { return filtro(t) && (t.attivo !== false || t.id === scelto); });
      return '<optgroup label="' + esc(etichetta) + '">' + tipi.map(function(t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === scelto ? ' selected' : '') + '>' + esc(t.nome) + (t.obbligo_legge ? ' ⚖️' : '') + '</option>';
      }).join('') + '</optgroup>';
    };
    let html = '<option value="">— Scegli il tipo —</option>';
    if (perSubappaltatore) html += gruppo('Impresa', function(t) { return t.per === 'impresa'; });
    html += gruppo(perSubappaltatore ? 'Persone (operai del subappaltatore)' : 'Persona', function(t) { return t.per === 'persona'; });
    html += gruppo('Altro', function(t) { return t.per === 'tutti'; });
    if (scelto && !tipoDocumentoTS(scelto)) html += '<option value="' + esc(scelto) + '" selected>' + esc(scelto) + '</option>';
    return html;
  };
}

// Il catalogo si rilegge quando si apre Team e subappalti
if (typeof verificaTeamSubappaltiDisponibili === 'function') {
  const verificaTeamSubappaltiSenzaCatalogo = verificaTeamSubappaltiDisponibili;
  // eslint-disable-next-line no-global-assign
  verificaTeamSubappaltiDisponibili = async function() {
    const esito = await verificaTeamSubappaltiSenzaCatalogo.apply(this, arguments);
    try { await caricaCatalogoCorsi(); } catch (e) { /* resta la costante */ }
    return esito;
  };
}
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() { if (typeof ROLE !== 'undefined' && ROLE) caricaCatalogoCorsi().catch(function() {}); }, 3500);
});

// ── Riquadro in Impostazioni (titolare) ─────────────────────────────
async function mostraCatalogoCorsiImpostazioni() {
  const card = ge('si-corsi-card');
  if (!card) return;
  if (ROLE !== 'titolare') { card.style.display = 'none'; return; }
  card.style.display = '';
  const stato = ge('si-corsi-stato');
  const ok = await caricaCatalogoCorsi(true);
  if (!ok) {
    stato.className = 'al2 i';
    stato.textContent = 'Il catalogo dei corsi non è ancora attivo: serve l’aggiornamento del database (sql/152). Intanto l’elenco resta quello scritto nel gestionale.';
    ge('si-corsi-apri').style.display = 'none';
    return;
  }
  const r = CATALOGO_CORSI.righe;
  stato.className = '';
  stato.style.cssText = 'font-size:13px;margin-bottom:8px';
  stato.innerHTML = '<b>' + r.length + '</b> tra corsi, abilitazioni e documenti (' + r.filter(function(x) { return x.attivo; }).length + ' attivi, ' +
    r.filter(function(x) { return x.obbligo_legge; }).length + ' obbligatori per legge).';
  ge('si-corsi-apri').style.display = '';
}

if (typeof loadImp === 'function') {
  const loadImpSenzaCorsi = loadImp;
  // eslint-disable-next-line no-global-assign
  loadImp = async function() {
    const esito = await loadImpSenzaCorsi.apply(this, arguments);
    if (ge('si-corsi-card')) mostraCatalogoCorsiImpostazioni().catch(function(e) { console.warn('Catalogo corsi:', e); });
    return esito;
  };
}

// ── Finestra del catalogo ───────────────────────────────────────────
const NOMI_PER_CORSO = { persona: 'Persona', impresa: 'Impresa', tutti: 'Tutti' };

async function apriCatalogoCorsi() {
  if (ROLE !== 'titolare') return;
  await caricaCatalogoCorsi(true);
  CATALOGO_CORSI.aperto = null;
  disegnaCatalogoCorsi();
  ge('ccr-form').style.display = 'none';
  openM('m-catalogo-corsi');
  caricaRegistroCorsi();
}

function testoValiditaCorso(r) {
  if (r.validita_mesi) return r.validita_mesi + ' mesi';
  if (r.validita_giorni) return r.validita_giorni + ' giorni';
  return 'senza scadenza fissa';
}

function disegnaCatalogoCorsi() {
  const box = ge('ccr-elenco');
  box.innerHTML = CATALOGO_CORSI.righe.map(function(r) {
    return '<div data-corso="' + esc(r.codice) + '" style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--b2, #e5e7eb)' + (r.attivo ? '' : ';opacity:.55') + '">' +
      '<div style="min-width:0"><div style="font-size:13px;font-weight:600">' + esc(r.nome) + (r.obbligo_legge ? ' <span class="bx bblue">⚖️ Per legge</span>' : '') + (r.attivo ? '' : ' <span class="bx bgray">Spento</span>') + '</div>' +
      '<div style="font-size:12px;color:var(--m)">' + esc(NOMI_PER_CORSO[r.per] || r.per) + ' · ' + esc(testoValiditaCorso(r)) +
      (r.ore_aggiornamento != null ? ' · aggiornamento ' + esc(String(r.ore_aggiornamento).replace('.', ',')) + ' h' : '') + (r.ente ? ' · ' + esc(r.ente) : '') + '</div>' +
      (testoPreventivoCorso(r) ? '<div style="font-size:12px;color:var(--m)">🧾 Serve nel preventivo con: ' + esc(testoPreventivoCorso(r)) + (r.serve_a === 'almeno_uno' ? ' · 👥 basta uno in squadra' : '') + '</div>' : '') + '</div>' +
      '<button class="btn sm" onclick="modificaCorsoCatalogo(\'' + esc(r.codice) + '\')">✏️</button></div>';
  }).join('') || '<div class="empty">Nessun corso</div>';
}

// F19.5 (sql/156): quando il corso serve in un preventivo
function catalogoConPreventivo() {
  return CATALOGO_CORSI.righe.some(function(r) { return Object.prototype.hasOwnProperty.call(r, 'parole_preventivo'); });
}
function testoPreventivoCorso(r) {
  return [].concat((r.parole_preventivo || []).map(function(w) { return '"' + w + '"'; }), (r.lavorazioni_preventivo || []).map(function(l) { return 'lavorazione ' + l; })).join(', ');
}
function elencoDaTesto(t) {
  return String(t || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean).slice(0, 20);
}

function codiceDaNomeCorso(nome) {
  return String(nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function modificaCorsoCatalogo(codice) {
  const r = codice ? CATALOGO_CORSI.righe.find(function(x) { return x.codice === codice; }) : null;
  CATALOGO_CORSI.aperto = r ? r.codice : null;
  ge('ccr-form-titolo').textContent = r ? 'Modifica: ' + r.nome : 'Nuovo corso o abilitazione';
  ge('ccr-nome').value = r ? r.nome : '';
  ge('ccr-per').value = r ? r.per : 'persona';
  ge('ccr-mesi').value = r && r.validita_mesi ? r.validita_mesi : '';
  ge('ccr-legge').checked = r ? !!r.obbligo_legge : false;
  ge('ccr-ore').value = r && r.ore_aggiornamento != null ? r.ore_aggiornamento : '';
  ge('ccr-ente').value = r && r.ente ? r.ente : '';
  ge('ccr-attivo').checked = r ? r.attivo !== false : true;
  ge('ccr-ordine').value = r ? r.ordine : 300;
  ge('ccr-giorni-nota').textContent = r && r.validita_giorni ? 'Validità attuale: ' + r.validita_giorni + ' giorni (scrivendo i mesi si passa ai mesi).' : '';
  const conPrev = catalogoConPreventivo();
  ge('ccr-preventivo-box').style.display = conPrev ? '' : 'none';
  if (conPrev) {
    ge('ccr-parole').value = r ? (r.parole_preventivo || []).join(', ') : '';
    ge('ccr-lavorazioni').value = r ? (r.lavorazioni_preventivo || []).join(', ') : '';
  }
  // F19.3 (sql/154): a ogni persona o almeno uno in squadra
  const conServeA = CATALOGO_CORSI.righe.some(function(x) { return Object.prototype.hasOwnProperty.call(x, 'serve_a'); });
  ge('ccr-serve-a-box').style.display = conServeA ? '' : 'none';
  if (conServeA) ge('ccr-serve-a').value = r && r.serve_a ? r.serve_a : 'ogni_persona';
  ge('ccr-form').style.display = '';
  ge('ccr-nome').focus();
}

async function salvaCorsoCatalogo() {
  const nome = (ge('ccr-nome').value || '').trim();
  if (nome.length < 2) { toast('Scrivi il nome del corso', 'err'); return; }
  const mesi = ge('ccr-mesi').value ? parseInt(ge('ccr-mesi').value, 10) : null;
  const ore = ge('ccr-ore').value !== '' ? Number(String(ge('ccr-ore').value).replace(',', '.')) : null;
  const dati = {
    nome: nome, per: ge('ccr-per').value, validita_mesi: mesi, obbligo_legge: ge('ccr-legge').checked,
    ore_aggiornamento: ore, ente: (ge('ccr-ente').value || '').trim() || null, attivo: ge('ccr-attivo').checked,
    ordine: parseInt(ge('ccr-ordine').value, 10) || 300
  };
  if (catalogoConPreventivo()) {
    dati.parole_preventivo = elencoDaTesto(ge('ccr-parole').value);
    dati.lavorazioni_preventivo = elencoDaTesto(ge('ccr-lavorazioni').value).map(function(x) { return x.toLowerCase(); });
  }
  if (ge('ccr-serve-a-box').style.display !== 'none') dati.serve_a = ge('ccr-serve-a').value;
  let res;
  if (CATALOGO_CORSI.aperto) {
    const vecchio = CATALOGO_CORSI.righe.find(function(x) { return x.codice === CATALOGO_CORSI.aperto; });
    if (mesi) dati.validita_giorni = null;
    else if (vecchio && vecchio.validita_giorni) delete dati.validita_mesi;
    res = await db.from('corsi_catalogo').update(dati).eq('codice', CATALOGO_CORSI.aperto).select('codice');
  } else {
    let codice = codiceDaNomeCorso(nome) || 'corso';
    if (CATALOGO_CORSI.righe.some(function(x) { return x.codice === codice; })) codice = (codice.slice(0, 34) + '_' + Date.now().toString(36).slice(-5));
    dati.codice = codice;
    res = await db.from('corsi_catalogo').insert(dati).select('codice');
  }
  if (res.error) { toast('Non salvato: ' + res.error.message, 'err'); return; }
  if (!res.data || !res.data.length) { toast('Non salvato: permesso negato', 'err'); return; }
  toast('Corso salvato ✓', 'ok');
  ge('ccr-form').style.display = 'none';
  await caricaCatalogoCorsi(true);
  disegnaCatalogoCorsi();
  caricaRegistroCorsi();
  mostraCatalogoCorsiImpostazioni().catch(function() {});
}

const CAMPI_REGISTRO_CORSI = { serve_a: 'serve a', parole_preventivo: 'parole nel preventivo', lavorazioni_preventivo: 'lavorazioni nel preventivo', nome: 'nome', per: 'per chi', validita_mesi: 'validità (mesi)', validita_giorni: 'validità (giorni)', obbligo_legge: 'per legge', ore_aggiornamento: 'ore di aggiornamento', ente: 'ente', attivo: 'attivo', ordine: 'ordine' };

function valoreRegistroCorsi(x) {
  if (x === true) return 'sì';
  if (x === false) return 'no';
  if (x === null || x === undefined || x === '') return '—';
  if (Array.isArray(x)) return x.length ? x.join(', ') : '—';
  return String(x);
}

async function caricaRegistroCorsi() {
  const box = ge('ccr-registro');
  if (!box) return;
  const { data, error } = await db.from('registro_azioni').select('record_id, azione, campo, prima, dopo, utente_reale_nome, quando')
    .eq('tabella', 'corsi_catalogo').order('quando', { ascending: false }).limit(60);
  if (error) { box.innerHTML = '<div class="empty">Registro non disponibile</div>'; return; }
  const nomi = {};
  CATALOGO_CORSI.righe.forEach(function(r) { nomi[r.id] = r.nome; });
  const righe = (data || []).filter(function(r) { return r.azione !== 'modifica' || CAMPI_REGISTRO_CORSI[r.campo]; });
  box.innerHTML = righe.map(function(r) {
    const chi = r.utente_reale_nome || 'Database';
    const quando = new Date(r.quando).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const cosa = r.azione === 'inserimento' ? 'aggiunto' : (CAMPI_REGISTRO_CORSI[r.campo] + ': ' + valoreRegistroCorsi(r.prima) + ' → ' + valoreRegistroCorsi(r.dopo));
    return '<div style="font-size:12px;padding:3px 0;border-bottom:1px solid var(--b2, #e5e7eb)"><b>' + esc(nomi[r.record_id] || (r.dopo && r.dopo.nome) || '—') + '</b> · ' + esc(cosa) + ' <span style="color:var(--m)">(' + esc(chi) + ', ' + esc(quando) + ')</span></div>';
  }).join('') || '<div class="empty">Nessuna modifica</div>';
}
