// ── F14.5 — AVVISI PERSISTENTI E CAMPANELLA NEL MENU (sql/65) ─────────
// Gli avvisi li crea SOLO il database (sql/65: motore delle scadenze di
// sql/64, stati delle commesse, prove del titolare); il sito li legge
// (RPC miei_avvisi, con le regole RLS: i miei, quelli del mio ruolo,
// quelli risaliti a me; il titolare anche tutti) e li chiude:
// - "✓ Fatto" con l'esito (obbligatorio per alcuni tipi), RPC
//   segna_avviso_fatto; "✖ Annulla" con il motivo, solo titolare;
// - "Apri ..." apre la scheda del record con la rotta di F14.1 (js/47);
// - AZIONI RAPIDE per tipo (AZIONI_RAPIDE_AVVISO): chiamano la stessa
//   funzione (e la stessa RPC) della scheda, nessun doppione di logica.
//   Oggi: passo della commessa → "Stato e storico" (js/18). Un modulo che
//   aggiunge un tipo di avviso aggiunge le sue azioni con
//   registraAzioneRapidaAvviso(tipo, { etichetta, puo, fai }).
// Campanella 🔔 col numero degli avvisi aperti nel menu (anche sul
// telefono, accanto a "Esci"), aggiornata al login, ogni 5 minuti, dopo
// ogni azione e con il riquadro "Cosa tocca a me" (fonte 'avvisi-aperti'
// in js/46). Link unico #/avviso/<id> (lo stesso per email e notifiche):
// apre la scheda del record collegato e in fondo allo schermo la barra
// dell'avviso con "✓ Fatto". Senza sql/65 non compare nulla.
// F14.6: gli urgenti arrivano anche come notifica ed email (js/59, sql/66).

const AVVISI = {
  disponibili: null, miei: null, ultimoElenco: null, letti_il: 0, lettura: null,
  tutti: false, chiusi: false, timer: null, inApertura: false, barra: null, evidenzia: null
};
const AVVISI_VALIDI_MS = 15000;          // lettura condivisa tra campanella e riquadro
const AVVISI_OGNI_MS = 5 * 60 * 1000;    // aggiornamento della campanella

// Tabella del record → scheda con indirizzo (SCHEDE_CON_INDIRIZZO di js/47)
const OGGETTO_DA_TABELLA_AVVISO = {
  preventivi: 'preventivo', commesse: 'commessa', progetti_tecnici: 'progetto', clienti: 'cliente',
  fornitori: 'fornitore', fatture: 'fattura', ordini_lavoro: 'intervento', utenti: 'persona',
  subappaltatori: 'subappaltatore'
};
const NOME_RECORD_AVVISO = {
  preventivi: 'il preventivo', commesse: 'la commessa', progetti_tecnici: 'il progetto', clienti: 'il cliente',
  fornitori: 'il fornitore', fatture: 'la fattura', ordini_lavoro: "l'intervento", utenti: 'la persona',
  subappaltatori: 'il subappaltatore'
};
const TIPI_AVVISO = {
  scadenza: { icona: '⏰', nome: 'Scadenza' },
  scadenza_risalita: { icona: '⬆️', nome: 'Risalita di una scadenza' },
  commessa_passo: { icona: '📁', nome: 'Passo della commessa' },
  prova: { icona: '🧪', nome: 'Avviso di prova' }
};

// Azioni rapide per tipo: stessa funzione della scheda (e stessa RPC).
const AZIONI_RAPIDE_AVVISO = {
  commessa_passo: [{
    etichetta: '🔁 Stato e storico',
    puo: function(a) { return typeof apriStatoCommessa === 'function' && !!a.rif_id && canAccessPage('commessa-detail'); },
    fai: function(a) { closeM('m-avvisi'); return apriStatoCommessa(a.rif_id); }
  }]
};

function registraAzioneRapidaAvviso(tipo, azione) {
  if (!tipo || !azione || typeof azione.fai !== 'function') return;
  (AZIONI_RAPIDE_AVVISO[tipo] = AZIONI_RAPIDE_AVVISO[tipo] || []).push(azione);
}

// ── Disponibilità e lettura ─────────────────────────────────────────
function erroreAvvisiMancanti(error) {
  if (!error) return false;
  const m = String(error.message || '');
  return ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error.code) ||
    /(avvisi|miei_avvisi).*(does not exist|schema cache|not find)|could not find the function/i.test(m);
}

async function verificaAvvisiDisponibili() {
  if (AVVISI.disponibili !== null) return AVVISI.disponibili;
  try {
    const { error } = await db.from('avvisi').select('id').limit(1);
    if (error) { if (erroreAvvisiMancanti(error)) AVVISI.disponibili = false; return AVVISI.disponibili; }
    AVVISI.disponibili = true;
  } catch (e) {}
  return AVVISI.disponibili;
}

// Avvisi APERTI miei (destinatario, ruolo, risaliti a me). null = non attivi
// o errore. Una lettura vale 15 secondi (campanella e riquadro insieme).
async function leggiMieiAvvisi(forza) {
  // F14.17: lavorando "come" un altro il database darebbe gli avvisi del
  // titolare: niente avvisi finché F14.18 non porta il ruolo al database.
  if (typeof ENTRA_COME !== 'undefined' && ENTRA_COME) return null;
  if (!forza && AVVISI.miei && Date.now() - AVVISI.letti_il < AVVISI_VALIDI_MS) return AVVISI.miei;
  if (AVVISI.lettura) return AVVISI.lettura;
  AVVISI.lettura = (async function() {
    if (!(await verificaAvvisiDisponibili())) return null;
    const { data, error } = await db.rpc('miei_avvisi', { p_tutti: false, p_chiusi: false });
    if (error) {
      if (erroreAvvisiMancanti(error)) AVVISI.disponibili = false;
      else console.warn('Avvisi:', error.message);
      return null;
    }
    AVVISI.miei = data || [];
    AVVISI.letti_il = Date.now();
    return AVVISI.miei;
  })();
  try {
    const r = await AVVISI.lettura;
    aggiornaBadgeAvvisi();
    return r;
  } finally {
    AVVISI.lettura = null;
  }
}

function avvisoScaduto(a) {
  return !!a.scadenza && a.stato === 'aperto' && new Date(a.scadenza).getTime() <= Date.now();
}

function avvisoRisalitoAMe(a) {
  return a.perche === 'risalito_responsabile' || a.perche === 'risalito_titolare';
}

// ── Campanella nel menu ─────────────────────────────────────────────
function preparaBadgeAvvisi() {
  const nr = document.querySelector('#nav .nr');
  if (!nr || ge('nav-avvisi')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'nav-avvisi';
  b.className = 'nav-avvisi';
  b.style.display = 'none';
  b.setAttribute('aria-label', 'Avvisi');
  b.title = 'Avvisi';
  b.innerHTML = '🔔<span class="nav-avvisi-n" id="nav-avvisi-n"></span>';
  b.onclick = function() { apriAvvisi(); };
  nr.insertBefore(b, nr.firstChild);
}

function aggiornaBadgeAvvisi() {
  const b = ge('nav-avvisi');
  if (!b) return;
  if (AVVISI.disponibili !== true || !Array.isArray(AVVISI.miei)) { b.style.display = 'none'; return; }
  const aperti = AVVISI.miei.filter(function(a) { return a.stato === 'aperto'; });
  const urgenti = aperti.filter(function(a) { return a.urgente || avvisoScaduto(a); }).length;
  const n = ge('nav-avvisi-n');
  b.style.display = '';
  b.classList.toggle('con-avvisi', aperti.length > 0);
  b.classList.toggle('urgenti', urgenti > 0);
  if (n) n.textContent = aperti.length ? (aperti.length > 99 ? '99+' : String(aperti.length)) : '';
  b.setAttribute('aria-label', aperti.length ? 'Avvisi aperti: ' + aperti.length : 'Nessun avviso aperto');
  b.title = aperti.length ? aperti.length + (aperti.length === 1 ? ' avviso aperto' : ' avvisi aperti') +
    (urgenti ? ' (' + urgenti + ' scaduti o urgenti)' : '') : 'Nessun avviso aperto';
}

// Al login (boot, js/01): stato nuovo per l'utente, campanella, lettura.
function avviaAvvisi() {
  clearInterval(AVVISI.timer);
  AVVISI.disponibili = null;
  AVVISI.miei = null;
  AVVISI.letti_il = 0;
  AVVISI.tutti = false;
  AVVISI.chiusi = false;
  preparaBadgeAvvisi();
  aggiornaBadgeAvvisi();
  leggiMieiAvvisi(true).catch(function(e) { console.warn('Avvisi:', e); });
  AVVISI.timer = setInterval(function() {
    if (document.hidden || AVVISI.disponibili === false) return;
    leggiMieiAvvisi(true).catch(function() {});
  }, AVVISI_OGNI_MS);
}

// Dopo un'azione: campanella, finestra e riquadro "Cosa tocca a me".
async function ricaricaDopoAzioneAvviso() {
  await leggiMieiAvvisi(true);
  if (ge('m-avvisi') && ge('m-avvisi').classList.contains('on')) await disegnaAvvisi();
  if (typeof caricaToccaAMe === 'function' && typeof BOX_TOCCA_A_ME !== 'undefined') {
    const box = ge(BOX_TOCCA_A_ME[ROLE] || '');
    if (box && box.offsetParent !== null) caricaToccaAMe().catch(function() {});
  }
}

// ── Testi ────────────────────────────────────────────────────────────
function dataOraAvviso(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return iso; }
}

function testoScadenzaAvviso(a) {
  if (!a.scadenza) return '';
  if (a.stato !== 'aperto') return 'Scadenza ' + dataOraAvviso(a.scadenza);
  return avvisoScaduto(a)
    ? '<span class="avv-scaduto">⏰ Scaduto il ' + esc(dataOraAvviso(a.scadenza)) + '</span>'
    : 'Entro il ' + esc(dataOraAvviso(a.scadenza));
}

function testoPercheAvviso(a) {
  const dest = a.destinatario_nome || etichettaRuolo(a.destinatario_ruolo);
  switch (a.perche) {
    case 'tuo': return '';
    case 'ruolo': return 'Per il ruolo ' + etichettaRuolo(a.destinatario_ruolo) + ' (lo può chiudere chiunque del ruolo)';
    case 'risalito_responsabile': return '⬆️ Risalito a te come responsabile: ' + dest + " non l'ha ancora chiuso";
    case 'risalito_titolare': return '⬆️ Risalito al titolare: ' + dest + " non l'ha ancora chiuso";
    default: return a.destinatario_nome ? 'Di ' + a.destinatario_nome : 'Per il ruolo ' + etichettaRuolo(a.destinatario_ruolo);
  }
}

function testoRisalitaAvviso(a) {
  if (a.stato !== 'aperto' || a.regola_propria) return a.regola_propria && a.stato === 'aperto' ? 'Segue la sua regola in Impostazioni > Scadenze' : '';
  const parti = [];
  if (a.responsabile_ruolo && a.risale_responsabile_il) {
    parti.push((a.risalito_responsabile_il ? 'risalito a ' : 'se resta aperto va a ') + etichettaRuolo(a.responsabile_ruolo) +
      (a.risalito_responsabile_il ? '' : ' dal ' + dataOraAvviso(a.risale_responsabile_il)));
  }
  if (a.risale_titolare_il) {
    parti.push((a.risalito_titolare_il ? 'risalito al titolare' : 'al titolare dal ' + dataOraAvviso(a.risale_titolare_il)));
  }
  return parti.length ? 'Risalita: ' + parti.join(', poi ') : '';
}

function schedaRecordAvviso(a) {
  const oggetto = a.rif_tabella ? OGGETTO_DA_TABELLA_AVVISO[a.rif_tabella] : null;
  if (!oggetto || typeof SCHEDE_CON_INDIRIZZO === 'undefined' || !SCHEDE_CON_INDIRIZZO[oggetto]) return null;
  const scheda = SCHEDE_CON_INDIRIZZO[oggetto];
  const pagina = typeof paginaSchedaConIndirizzo === 'function' ? paginaSchedaConIndirizzo(scheda) : scheda.pagina;
  if (!pagina || !canAccessPage(pagina)) return null;
  return { oggetto: oggetto, scheda: scheda };
}

// ── Finestra "🔔 Avvisi" ─────────────────────────────────────────────
function preparaFinestreAvvisi() {
  if (ge('m-avvisi')) return;
  document.body.insertAdjacentHTML('beforeend',
    '<div class="mbg" id="m-avvisi"><div class="modal" style="max-width:640px">' +
      '<button class="x" onclick="closeM(\'m-avvisi\')">×</button>' +
      '<h3>🔔 Avvisi</h3>' +
      '<div class="avv-filtri" id="avv-filtri"></div>' +
      '<div id="avv-elenco"></div>' +
      '<div class="ma"><button class="btn" onclick="closeM(\'m-avvisi\')">Chiudi</button></div>' +
    '</div></div>' +
    '<div class="mbg" id="m-avviso-chiudi"><div class="modal" style="max-width:520px">' +
      '<button class="x" onclick="closeM(\'m-avviso-chiudi\')">×</button>' +
      '<h3 id="avc-titolo">✓ Fatto</h3>' +
      '<input type="hidden" id="avc-id"><input type="hidden" id="avc-modo">' +
      '<div id="avc-testo" class="al2 i" style="margin-bottom:10px"></div>' +
      '<div class="f"><label id="avc-etichetta">Esito</label><textarea id="avc-esito" rows="3" maxlength="500"></textarea></div>' +
      '<div class="ma"><button class="btn" onclick="closeM(\'m-avviso-chiudi\')">Annulla</button>' +
      '<button class="btn p" id="avc-conferma" onclick="confermaChiusuraAvviso()">Conferma</button></div>' +
    '</div></div>' +
    '<div class="mbg" id="m-avviso-prova"><div class="modal" style="max-width:560px">' +
      '<button class="x" onclick="closeM(\'m-avviso-prova\')">×</button>' +
      '<h3>🧪 Avviso di prova</h3>' +
      '<div class="al2 i" style="margin-bottom:10px">Serve a provare campanella, link e risalita. Arriva come un avviso vero, con "Prova:" davanti al testo. Per vedere subito la risalita metti una scadenza passata e poi <b>▶️ Esegui controllo ora</b> in Impostazioni.</div>' +
      '<div class="f"><label>A chi va *</label><select id="avp-dest"></select></div>' +
      '<div class="f"><label>Record da aprire</label><div style="display:flex;gap:6px">' +
        '<select id="avp-rif-tipo" style="flex:0 0 46%"><option value="">Nessuno</option><option value="preventivi">Preventivo n.</option><option value="commesse">Commessa (codice)</option></select>' +
        '<input id="avp-rif" placeholder="es. 86 o 2026-001"></div></div>' +
      '<div class="f"><label>Testo *</label><input id="avp-testo" maxlength="300" placeholder="es. Chiama il cliente per il preventivo"></div>' +
      '<div class="f"><label>Scadenza</label><input type="datetime-local" id="avp-scadenza">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
          '<button type="button" class="btn sm" onclick="scadenzaProvaAvviso(0)">Tra 1 ora</button>' +
          '<button type="button" class="btn sm" onclick="scadenzaProvaAvviso(1)">Scaduto da 1 gg lav.</button>' +
          '<button type="button" class="btn sm" onclick="scadenzaProvaAvviso(2)">Scaduto da 2 gg lav.</button>' +
          '<button type="button" class="btn sm" onclick="ge(\'avp-scadenza\').value=\'\'">Senza</button></div></div>' +
      '<div class="f"><label>Se scade risale a</label><select id="avp-resp">' +
        '<option value="">Responsabile proposto (dal record)</option><option value="nessuno">Direttamente al titolare</option>' +
        '<option value="capo_tecnico">Capo tecnico</option><option value="commerciale">Acquisti</option>' +
        '<option value="segreteria">Segreteria</option><option value="rappresentante">Rappresentante</option></select></div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:400;margin:4px 0 8px"><input type="checkbox" id="avp-esito"> Esito obbligatorio per chiuderlo</label>' +
      '<div id="avp-esito-creato"></div>' +
      '<div class="ma"><button class="btn" onclick="closeM(\'m-avviso-prova\')">Chiudi</button>' +
      '<button class="btn p" id="avp-crea" onclick="creaAvvisoProva()">Crea l\'avviso di prova</button></div>' +
    '</div></div>');
  ['m-avvisi', 'm-avviso-chiudi', 'm-avviso-prova'].forEach(function(id) {
    const m = ge(id);
    m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('on'); });
  });
}

async function apriAvvisi(evidenziaId) {
  if (!(await verificaAvvisiDisponibili())) {
    toast('Gli avvisi non sono ancora attivi: serve l’aggiornamento del database (sql/65)', 'err');
    return;
  }
  preparaFinestreAvvisi();
  AVVISI.evidenzia = evidenziaId ? String(evidenziaId) : null;
  openM('m-avvisi');
  await disegnaAvvisi();
}

function cambiaFiltroAvvisi(chiave, valore) {
  AVVISI[chiave] = !!valore;
  disegnaAvvisi();
}

async function disegnaAvvisi() {
  const box = ge('avv-elenco');
  const filtri = ge('avv-filtri');
  if (!box) return;
  if (filtri) {
    filtri.innerHTML =
      (ROLE === 'titolare'
        ? '<label><input type="checkbox"' + (AVVISI.tutti ? ' checked' : '') + ' onchange="cambiaFiltroAvvisi(\'tutti\',this.checked)"> Tutti gli avvisi aperti (anche degli altri)</label>'
        : '') +
      '<label><input type="checkbox"' + (AVVISI.chiusi ? ' checked' : '') + ' onchange="cambiaFiltroAvvisi(\'chiusi\',this.checked)"> Anche i chiusi (30 giorni)</label>' +
      '<button type="button" class="btn sm" onclick="disegnaAvvisi()">↻</button>' +
      (ROLE === 'titolare' ? '<button type="button" class="btn sm" onclick="apriAvvisoProva()">🧪 Avviso di prova</button>' : '');
  }
  box.innerHTML = '<div class="avv-vuoto">⏳ Carico gli avvisi…</div>';
  let elenco;
  if (!AVVISI.tutti && !AVVISI.chiusi) {
    elenco = await leggiMieiAvvisi(true);
  } else {
    const { data, error } = await db.rpc('miei_avvisi', { p_tutti: AVVISI.tutti, p_chiusi: AVVISI.chiusi });
    if (error) { box.innerHTML = '<div class="al2 e">Avvisi non letti: ' + esc(error.message) + '</div>'; return; }
    elenco = data || [];
    leggiMieiAvvisi(true).catch(function() {});
  }
  if (!elenco) { box.innerHTML = '<div class="al2 e">Avvisi non letti (rete?). Riprova con ↻.</div>'; return; }
  AVVISI.ultimoElenco = elenco;
  if (!elenco.length) { box.innerHTML = '<div class="avv-vuoto">Nessun avviso aperto 🎉</div>'; return; }
  box.innerHTML = elenco.map(htmlAvviso).join('');
  if (typeof riempiPulsantiAnnulla === 'function') riempiPulsantiAnnulla(box).catch(function() {});
  if (AVVISI.evidenzia) {
    const el = ge('avv-' + AVVISI.evidenzia);
    if (el) { el.classList.add('avv-evidenza'); el.scrollIntoView({ block: 'center' }); }
    AVVISI.evidenzia = null;
  }
}

function htmlAvviso(a) {
  const tipo = TIPI_AVVISO[a.tipo] || { icona: '🔔', nome: a.tipo };
  const aperto = a.stato === 'aperto';
  const rec = schedaRecordAvviso(a);
  const perche = testoPercheAvviso(a);
  const risalita = testoRisalitaAvviso(a);
  const azioni = [];
  if (rec) azioni.push('<button type="button" class="btn sm" onclick="apriRecordAvviso(' + Number(a.id) + ')">Apri ' + esc(NOME_RECORD_AVVISO[a.rif_tabella] || 'la scheda') + '</button>');
  if (aperto) {
    (AZIONI_RAPIDE_AVVISO[a.tipo] || []).forEach(function(az, i) {
      if (!az.puo || az.puo(a)) azioni.push('<button type="button" class="btn sm" onclick="azioneRapidaAvviso(' + Number(a.id) + ',' + i + ')">' + esc(az.etichetta) + '</button>');
    });
    // F14.19: le richieste di correzione si chiudono dalla loro finestra (js/64)
    if (!tipo.senzaFatto) azioni.push('<button type="button" class="btn sm p" onclick="chiudiAvviso(' + Number(a.id) + ',\'fatto\')">✓ Fatto</button>');
    if (ROLE === 'titolare' && !tipo.senzaFatto) azioni.push('<button type="button" class="btn sm" onclick="chiudiAvviso(' + Number(a.id) + ',\'annulla\')">✖ Annulla</button>');
  } else if (a.stato === 'fatto' && typeof segnapostoAnnulla === 'function') {
    // F14.19: chi l'ha chiuso a mano lo riapre (↩️ Annulla, 24 h) o chiede la correzione
    (AZIONI_RAPIDE_AVVISO[a.tipo] || []).forEach(function(az, i) {
      if (az.anche_chiuso && (!az.puo || az.puo(a))) azioni.push('<button type="button" class="btn sm" onclick="azioneRapidaAvviso(' + Number(a.id) + ',' + i + ')">' + esc(az.etichetta) + '</button>');
    });
    azioni.push(segnapostoAnnulla('avvisi', a.id));
  }
  const chiuso = aperto ? '' :
    '<div class="avv-meta">' + (a.stato === 'fatto' ? '✅ Fatto' : '✖ Annullato') +
      (a.chiuso_da_nome ? ' da ' + esc(a.chiuso_da_nome) : '') + ' il ' + esc(dataOraAvviso(a.chiuso_il)) +
      (a.esito ? ': ' + esc(a.esito) : '') + '</div>';
  return '<div class="avv-card' + (aperto ? '' : ' chiuso') + (a.urgente && aperto ? ' urgente' : '') + (avvisoScaduto(a) ? ' scaduto' : '') + '" id="avv-' + Number(a.id) + '">' +
    '<div class="avv-testo"><span class="avv-ico" title="' + esc(tipo.nome) + '">' + esc(tipo.icona) + '</span>' + esc(a.testo) + '</div>' +
    '<div class="avv-meta">' + [testoScadenzaAvviso(a), esc(perche), esc(risalita), a.esito_obbligatorio && aperto ? 'esito obbligatorio' : ''].filter(Boolean).join(' · ') + '</div>' +
    chiuso +
    (azioni.length ? '<div class="avv-azioni">' + azioni.join('') + '</div>' : '') +
  '</div>';
}

function avvisoInMemoria(id) {
  const tutti = [].concat(AVVISI.miei || [], AVVISI.ultimoElenco || []);
  return tutti.find(function(a) { return String(a.id) === String(id); }) || null;
}

async function leggiAvviso(id) {
  const { data, error } = await db.from('avvisi').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data;
}

async function apriRecordAvviso(id) {
  closeM('m-avvisi');
  await apriRottaScheda({ tipo: 'rotta', oggetto: 'avviso', id: String(id), rotta: '/avviso/' + id });
}

async function azioneRapidaAvviso(id, i) {
  const a = avvisoInMemoria(id) || await leggiAvviso(id);
  const az = a && (AZIONI_RAPIDE_AVVISO[a.tipo] || [])[i];
  if (!az) return;
  try { await az.fai(a); } catch (e) { toast('Errore: ' + (e.message || e), 'err'); }
}

// ── Fatto / Annulla ─────────────────────────────────────────────────
async function chiudiAvviso(id, modo) {
  preparaFinestreAvvisi();
  const a = avvisoInMemoria(id) || await leggiAvviso(id);
  if (!a) { toast('Avviso non trovato', 'err'); return; }
  ge('avc-id').value = String(a.id);
  ge('avc-modo').value = modo;
  ge('avc-testo').textContent = a.testo;
  ge('avc-esito').value = '';
  const annulla = modo === 'annulla';
  ge('avc-titolo').textContent = annulla ? '✖ Annulla l’avviso' : '✓ Fatto';
  ge('avc-etichetta').textContent = annulla ? 'Motivo dell’annullamento *'
    : (a.esito_obbligatorio ? 'Esito * (obbligatorio per questo avviso)' : 'Esito (facoltativo: cosa hai fatto)');
  ge('avc-conferma').textContent = annulla ? 'Annulla l’avviso' : '✓ Segna fatto';
  ge('avc-conferma').dataset.obbligatorio = (annulla || a.esito_obbligatorio) ? '1' : '';
  openM('m-avviso-chiudi');
  setTimeout(function() { ge('avc-esito').focus(); }, 50);
}

async function confermaChiusuraAvviso() {
  const id = Number(ge('avc-id').value);
  const modo = ge('avc-modo').value;
  const testo = ge('avc-esito').value.trim();
  const btn = ge('avc-conferma');
  if (btn.dataset.obbligatorio && testo.length < (modo === 'annulla' ? 3 : 1)) {
    toast(modo === 'annulla' ? 'Scrivi il motivo' : 'Scrivi l’esito: per questo avviso è obbligatorio', 'err');
    return;
  }
  btn.disabled = true;
  try {
    const r = modo === 'annulla'
      ? await db.rpc('annulla_avviso', { p_id: id, p_motivo: testo })
      : await db.rpc('segna_avviso_fatto', { p_id: id, p_esito: testo || null });
    if (r.error) { toast('Errore: ' + r.error.message, 'err'); return; }
    closeM('m-avviso-chiudi');
    toast(modo === 'annulla' ? 'Avviso annullato'
      : 'Avviso chiuso: fatto ✓' + (typeof segnapostoAnnulla === 'function' && ANNULLA.disponibile ? ' (sbagliato? «Anche i chiusi» → ↩️ Annulla entro 24 h)' : ''), 'ok');
    if (AVVISI.barra && String(AVVISI.barra.id) === String(id)) nascondiBarraAvviso();
    await ricaricaDopoAzioneAvviso();
  } finally {
    btn.disabled = false;
  }
}

// ── Avviso di prova (titolare) ──────────────────────────────────────
function apriAvvisoProva() {
  if (ROLE !== 'titolare') return;
  preparaFinestreAvvisi();
  const persone = (typeof UTENTI !== 'undefined' && Array.isArray(UTENTI) ? UTENTI : [])
    .slice().sort(function(x, y) { return String(x.ruolo).localeCompare(String(y.ruolo)) || String(x.nome).localeCompare(String(y.nome)); });
  const ruoli = ['rappresentante', 'commerciale', 'segreteria', 'capo_tecnico', 'tecnico', 'ingegnere', 'contabile', 'titolare'];
  ge('avp-dest').innerHTML =
    '<optgroup label="Persona">' + persone.map(function(u) {
      return '<option value="u:' + esc(u.id) + '">' + esc((u.nome || '') + ' ' + (u.cognome || '')) + ' (' + esc(etichettaRuolo(u.ruolo)) + ')</option>';
    }).join('') + '</optgroup>' +
    '<optgroup label="Tutto il ruolo">' + ruoli.map(function(r) {
      return '<option value="r:' + r + '">' + esc(etichettaRuolo(r)) + ' (tutti)</option>';
    }).join('') + '</optgroup>';
  const primoRapp = persone.find(function(u) { return u.ruolo === 'rappresentante'; });
  if (primoRapp) ge('avp-dest').value = 'u:' + primoRapp.id;
  ge('avp-rif-tipo').value = 'preventivi';
  ge('avp-rif').value = '';
  ge('avp-testo').value = '';
  ge('avp-resp').value = '';
  ge('avp-esito').checked = false;
  ge('avp-esito-creato').innerHTML = '';
  scadenzaProvaAvviso(0);
  openM('m-avviso-prova');
}

// 0 = tra un'ora; n = scaduto da n giorni lavorativi (stessa ora)
function scadenzaProvaAvviso(n) {
  const d = new Date();
  if (!n) d.setHours(d.getHours() + 1);
  else {
    let giorno = dataLocaleISO(d);
    if (typeof aggiungiGgLav === 'function') giorno = aggiungiGgLav(giorno, -n);
    else { d.setDate(d.getDate() - n); giorno = dataLocaleISO(d); }
    const p = giorno.split('-');
    d.setFullYear(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setMinutes(d.getMinutes() - 5);
  }
  const due = function(x) { return String(x).padStart(2, '0'); };
  ge('avp-scadenza').value = dataLocaleISO(d) + 'T' + due(d.getHours()) + ':' + due(d.getMinutes());
}

async function creaAvvisoProva() {
  const dest = ge('avp-dest').value;
  const testo = ge('avp-testo').value.trim();
  const rifTipo = ge('avp-rif-tipo').value;
  const rif = ge('avp-rif').value.trim();
  if (!dest) { toast('Scegli a chi va', 'err'); return; }
  if (testo.length < 3) { toast('Scrivi il testo (almeno 3 caratteri)', 'err'); return; }
  let rifId = null;
  if (rifTipo && rif) {
    const q = rifTipo === 'preventivi'
      ? db.from('preventivi').select('id').eq('numero', parseInt(rif, 10) || -1).limit(1)
      : db.from('commesse').select('id').eq('codice', rif).limit(1);
    const { data, error } = await q;
    if (error || !data || !data.length) { toast((rifTipo === 'preventivi' ? 'Preventivo n. ' : 'Commessa ') + rif + ' non trovato', 'err'); return; }
    rifId = String(data[0].id);
  } else if (rifTipo && !rif) {
    toast('Scrivi il numero del preventivo o il codice della commessa (o scegli "Nessuno")', 'err');
    return;
  }
  const scad = ge('avp-scadenza').value;
  const btn = ge('avp-crea');
  btn.disabled = true;
  try {
    // F14.6 (js/59, sql/66): con la spunta "Urgente" notifica ed email subito
    const urgente = !!(ge('avp-urgente') && ge('avp-urgente').checked);
    const base = {
      p_testo: testo,
      p_destinatario_id: dest.startsWith('u:') ? dest.slice(2) : null,
      p_destinatario_ruolo: dest.startsWith('r:') ? dest.slice(2) : null,
      p_rif_tabella: rifId ? rifTipo : null,
      p_rif_id: rifId
    };
    const { data, error } = urgente
      ? await db.rpc('crea_avviso_prova_urgente', base)
      : await db.rpc('crea_avviso_prova', Object.assign(base, {
        p_scadenza: scad ? new Date(scad).toISOString() : null,
        p_responsabile_ruolo: ge('avp-resp').value || null,
        p_esito_obbligatorio: ge('avp-esito').checked
      }));
    if (error) { toast('Errore: ' + error.message, 'err'); return; }
    const link = linkAvviso(data);
    ge('avp-esito-creato').innerHTML = '<div class="al2 i">✅ Avviso n. ' + esc(String(data)) + ' creato. Link diretto: <code>' + esc(link) + '</code> ' +
      '<button type="button" class="btn sm" onclick="copiaLinkAvviso(' + Number(data) + ')">📋 Copia</button></div>';
    toast('Avviso di prova creato', 'ok');
    await ricaricaDopoAzioneAvviso();
  } finally {
    btn.disabled = false;
  }
}

function linkAvviso(id) {
  return location.origin + location.pathname + '#/avviso/' + id;
}

function copiaLinkAvviso(id) {
  const link = linkAvviso(id);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(function() { toast('Link copiato', 'ok'); }, function() { prompt('Copia il link', link); });
  } else {
    prompt('Copia il link', link);
  }
}

// ── Barra dell'avviso (aperto dal link) ─────────────────────────────
function mostraBarraAvviso(a) {
  let barra = ge('avviso-barra');
  if (!barra) {
    barra = document.createElement('div');
    barra.id = 'avviso-barra';
    barra.className = 'avviso-barra';
    document.body.appendChild(barra);
  }
  AVVISI.barra = a;
  const aperto = a.stato === 'aperto';
  barra.innerHTML =
    '<div class="avb-testo">🔔 ' + esc(a.testo) +
      (aperto ? '' : ' <b>(' + (a.stato === 'fatto' ? 'già fatto' : 'annullato') + ')</b>') + '</div>' +
    '<div class="avb-azioni">' +
      (aperto ? '<button type="button" class="btn sm p" onclick="chiudiAvviso(' + Number(a.id) + ',\'fatto\')">✓ Fatto</button>' : '') +
      '<button type="button" class="btn sm" onclick="apriAvvisi(' + Number(a.id) + ')">🔔 Avvisi</button>' +
      '<button type="button" class="avb-x" aria-label="Chiudi" onclick="nascondiBarraAvviso()">×</button>' +
    '</div>';
  barra.style.display = 'flex';
}

function nascondiBarraAvviso() {
  AVVISI.barra = null;
  const barra = ge('avviso-barra');
  if (barra) barra.style.display = 'none';
}

// Cambiando pagina la barra sparisce (tranne mentre si apre dall'avviso).
(function() {
  if (typeof gotoPage !== 'function') return;
  const gotoPagePrimaAvvisi = gotoPage;
  gotoPage = function() {
    if (!AVVISI.inApertura && AVVISI.barra) nascondiBarraAvviso();
    return gotoPagePrimaAvvisi.apply(this, arguments);
  };
})();

// ── Link #/avviso/<id> (F14.1): apre il record collegato ────────────
async function apriAvvisoDaIndirizzo(id, opzioni, apriScheda) {
  const fuori = function(msg) {
    toast(msg, 'err');
    if (typeof vaiAllaDashboardDaIndirizzo === 'function') vaiAllaDashboardDaIndirizzo();
    return false;
  };
  if (!(await verificaAvvisiDisponibili())) return fuori('Gli avvisi non sono ancora attivi: sei sulla dashboard');
  const a = await leggiAvviso(id);
  if (!a) return fuori('Non hai accesso: questo avviso non è tuo, oppure non esiste più. Sei sulla dashboard');
  const oggetto = a.rif_tabella ? OGGETTO_DA_TABELLA_AVVISO[a.rif_tabella] : null;
  AVVISI.inApertura = true;
  let aperta = false;
  try {
    if (oggetto && a.rif_id) {
      aperta = await apriScheda({ tipo: 'rotta', oggetto: oggetto, id: String(a.rif_id), rotta: '/' + oggetto + '/' + a.rif_id }, opzioni);
    } else {
      if (typeof vaiAllaDashboardDaIndirizzo === 'function') vaiAllaDashboardDaIndirizzo();
    }
  } finally {
    AVVISI.inApertura = false;
  }
  mostraBarraAvviso(a);
  if (!oggetto) apriAvvisi(a.id);
  return aperta;
}

(function() {
  if (typeof apriRottaScheda !== 'function') return;
  const apriRottaSchedaPrimaAvvisi = apriRottaScheda;
  apriRottaScheda = async function(richiesta, opzioni) {
    if (!richiesta || richiesta.oggetto !== 'avviso') return apriRottaSchedaPrimaAvvisi.apply(this, arguments);
    return apriAvvisoDaIndirizzo(richiesta.id, opzioni || {}, apriRottaSchedaPrimaAvvisi);
  };
})();
