// ── F14.15 — DOMANDE NEL GESTIONALE (sql/70) ────────────────────────
// Una domanda a un collega (una persona oppure tutto un ruolo) collegata a
// un progetto tecnico, a un preventivo o a una commessa: testo, allegati,
// scadenza per rispondere dalle Regole (ingegnere ad Acquisti 1 giorno
// lavorativo, capo tecnico al rappresentante 1, integrazione al venditore
// 2, le altre 1), risposta, chiusa. Il database fa tutto il resto
// (sql/70): chi chiede, avviso subito al destinatario (campanella, js/58),
// SCADUTA SENZA RISPOSTA sale al titolare, con la risposta avviso a chi ha
// chiesto. Leggono la domanda solo chi chiede, chi deve rispondere e il
// titolare.
// Dove: riquadro "❓ Domande" nella scheda del progetto (js/17, pd-domande),
// del preventivo (js/18, pvd-domande) e della commessa (js/26,
// cmd-domande); finestra "❓ Domande per me" (riga di "Cosa tocca a me",
// js/46, e azione rapida degli avvisi). Senza sql/70 non compare nulla.

const DOMANDE = { disponibili: null, utenti: null, aperta: null, mie: null, mieLette: 0 };
const DOMANDE_VALIDE_MS = 15000;
const DOMANDE_MAX_FILE = 20 * 1024 * 1024;   // come il bucket domande-allegati
const RUOLI_DOMANDA = ['titolare', 'segreteria', 'capo_tecnico', 'commerciale', 'rappresentante', 'tecnico', 'ingegnere', 'contabile'];
// Record a cui si collega una domanda → scheda con indirizzo (js/47)
const RECORD_DOMANDA = {
  progetti_tecnici: { oggetto: 'progetto', nome: 'il progetto', su: 'Sul progetto aperto' },
  preventivi: { oggetto: 'preventivo', nome: 'il preventivo', su: 'Sul preventivo aperto' },
  commesse: { oggetto: 'commessa', nome: 'la commessa', su: 'Sulla commessa aperta' }
};

// Il ruolo apre la scheda del record? (pagine di PAGINE_RUOLO, js/47)
function recordDomandaApribile(tabella) {
  const rec = RECORD_DOMANDA[tabella];
  if (!rec || typeof SCHEDE_CON_INDIRIZZO === 'undefined' || !SCHEDE_CON_INDIRIZZO[rec.oggetto]) return false;
  const pagina = typeof paginaSchedaConIndirizzo === 'function' ? paginaSchedaConIndirizzo(SCHEDE_CON_INDIRIZZO[rec.oggetto]) : null;
  return !!pagina && canAccessPage(pagina);
}

function erroreDomandeMancanti(error) {
  if (!error) return false;
  const m = String(error.message || '');
  return ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error.code) ||
    /(domande|fai_domanda|rispondi_domanda).*(does not exist|schema cache|not find)|could not find the function/i.test(m);
}

async function verificaDomandeDisponibili() {
  if (DOMANDE.disponibili !== null) return DOMANDE.disponibili;
  try {
    const { error } = await db.from('domande').select('id').limit(1);
    if (error) { if (erroreDomandeMancanti(error)) DOMANDE.disponibili = false; return DOMANDE.disponibili; }
    DOMANDE.disponibili = true;
  } catch (e) {}
  return DOMANDE.disponibili;
}

function mioIdDomande() { return ME && ME.id ? String(ME.id) : ''; }

function dataOraDomanda(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return iso; }
}

function domandaScaduta(d) {
  return d.stato === 'aperta' && d.scadenza && new Date(d.scadenza).getTime() < Date.now();
}

// Stesse regole del database (sql/70 puo_rispondere_domanda)
function possoRispondereDomanda(d) {
  const io = mioIdDomande();
  if (!io || d.stato !== 'aperta' || String(d.da_id) === io) return false;
  return ROLE === 'titolare' || String(d.a_id || '') === io || (!d.a_id && d.a_ruolo === ROLE);
}

function possoChiudereDomanda(d) {
  return d.stato !== 'chiusa' && (String(d.da_id) === mioIdDomande() || ROLE === 'titolare');
}

function domandaPerMe(d) {
  const io = mioIdDomande();
  return String(d.a_id || '') === io || (!d.a_id && d.a_ruolo === ROLE);
}

function destinatarioDomanda(d) {
  return d.a_nome ? d.a_nome + ' (' + etichettaRuolo(d.a_ruolo) + ')' : 'chiunque del ruolo ' + etichettaRuolo(d.a_ruolo);
}

// Tempo per rispondere, come lo sceglie il database (righe del motore
// delle scadenze di sql/64 e sql/70; il titolare le cambia nelle Regole).
function tempoRispostaDomanda(aRuolo) {
  if (!aRuolo) return '';
  const gg = function(chiave, predefinito) {
    const v = typeof leggiRegolaSubito === 'function' ? Number(leggiRegolaSubito(chiave)) : NaN;
    return isFinite(v) && v > 0 ? v : predefinito;
  };
  if (aRuolo === 'titolare' || ROLE === 'titolare') return 'Risposta attesa entro circa 1 giorno lavorativo (indicativa, nessuna risalita).';
  let n = 1;
  if (ROLE === 'commerciale' && aRuolo === 'ingegnere') n = gg('risposta_ingegnere_acquisti_gg', 1);
  else if (ROLE === 'capo_tecnico' && aRuolo === 'rappresentante') n = gg('domande_capo_tecnico_gg', 1);
  else if (aRuolo === 'rappresentante') n = gg('integrazione_venditore_gg', 2);
  return 'Risposta attesa entro ' + n + ' giorn' + (n === 1 ? 'o' : 'i') + ' lavorativ' + (n === 1 ? 'o' : 'i') +
    ': se scade senza risposta la domanda arriva al titolare.';
}

async function utentiPerDomande() {
  if (DOMANDE.utenti) return DOMANDE.utenti;
  const { data, error } = await db.from('utenti').select('id,nome,cognome,ruolo,attivo').eq('attivo', true).order('cognome');
  if (error) return [];
  DOMANDE.utenti = (data || []).map(function(u) {
    return { id: u.id, nome: [u.nome, u.cognome].filter(Boolean).join(' '), ruolo: u.ruolo === 'informatico' ? 'titolare' : u.ruolo };
  });
  return DOMANDE.utenti;
}

// ── Riquadro "❓ Domande" nella scheda del record ────────────────────
async function caricaDomandeRecord(tabella, id, contenitoreId) {
  const box = ge(contenitoreId);
  if (!box) return;
  box.innerHTML = '';
  if (!id || !RECORD_DOMANDA[tabella]) return;
  if (!(await verificaDomandeDisponibili())) return;
  box.dataset.tabella = tabella;
  box.dataset.id = id;
  const { data, error } = await db.from('domande').select('*')
    .eq('rif_tabella', tabella).eq('rif_id', id).order('creato_il', { ascending: false });
  if (box.dataset.id !== String(id)) return;   // nel frattempo si è aperto un altro record
  if (error) {
    box.innerHTML = '<div class="card" style="margin-top:16px"><div class="al2 w">Domande non leggibili: ' + esc(error.message) + '</div></div>';
    return;
  }
  const elenco = data || [];
  const aperte = elenco.filter(function(d) { return d.stato === 'aperta'; }).length;
  box.innerHTML =
    '<div class="card" style="margin-top:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<div style="font-size:14px;font-weight:700">❓ Domande' + (aperte ? ' <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:#fef3c7;color:#92400e">' + aperte + ' senza risposta</span>' : '') + '</div>' +
        '<button type="button" class="btn sm p" onclick="apriNuovaDomanda(\'' + esc(tabella) + '\',\'' + esc(id) + '\',\'' + esc(contenitoreId) + '\')">❓ Fai una domanda</button>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--m);margin:6px 0 4px">Una domanda a un collega su questo record, con la scadenza per rispondere. La vedono solo chi chiede, chi risponde e il titolare.</div>' +
      (elenco.length
        ? elenco.map(function(d) { return htmlDomanda(d, contenitoreId, false); }).join('')
        : '<div class="empty" style="padding:10px">Nessuna domanda tua o per te su questo record.</div>') +
    '</div>';
}

function htmlDomanda(d, contenitoreId, conRecord) {
  const scaduta = domandaScaduta(d);
  const stato = d.stato === 'aperta'
    ? (scaduta ? '<span style="color:var(--r);font-weight:700">⏰ Scaduta senza risposta</span>' : '⏳ In attesa di risposta')
    : d.stato === 'risposta' ? '💬 Risposta arrivata' : '✅ Chiusa';
  const allegati = (d.allegati || []).map(function(a, i) {
    return '<button type="button" class="btn sm" onclick="apriAllegatoDomanda(' + Number(d.id) + ',' + i + ')">📎 ' + esc(a.nome) +
      (a.parte === 'risposta' ? ' (risposta)' : '') + '</button>';
  }).join(' ');
  const azioni = [];
  if (conRecord && recordDomandaApribile(d.rif_tabella)) {
    azioni.push('<button type="button" class="btn sm" onclick="apriRecordDomanda(' + Number(d.id) + ')">Apri ' + esc(RECORD_DOMANDA[d.rif_tabella].nome) + '</button>');
  }
  if (possoRispondereDomanda(d)) azioni.push('<button type="button" class="btn sm p" onclick="apriRispostaDomanda(' + Number(d.id) + ',\'' + esc(contenitoreId || '') + '\')">💬 Rispondi</button>');
  if (possoChiudereDomanda(d)) {
    azioni.push('<button type="button" class="btn sm" onclick="chiudiDomanda(' + Number(d.id) + ',\'' + esc(contenitoreId || '') + '\')">' +
      (d.stato === 'aperta' ? '↩️ Ritira la domanda' : '✓ Chiudi') + '</button>');
  }
  return '<div class="card" id="dom-' + Number(d.id) + '" style="margin-top:10px;padding:10px 12px;border-left:4px solid ' +
      (d.stato === 'aperta' ? (scaduta ? '#dc2626' : '#d97706') : d.stato === 'risposta' ? '#2563eb' : '#16a34a') + '">' +
    (conRecord ? '<div style="font-size:12px;font-weight:700;margin-bottom:4px">' + esc(d.rif_descrizione || '') + '</div>' : '') +
    '<div style="font-size:12px;color:var(--m)">Da <b>' + esc(d.da_nome || '—') + '</b> (' + esc(etichettaRuolo(d.da_ruolo)) + ') a <b>' + esc(destinatarioDomanda(d)) + '</b> · ' + esc(dataOraDomanda(d.creato_il)) + '</div>' +
    '<div style="white-space:pre-wrap;margin:6px 0">' + esc(d.testo) + '</div>' +
    (d.risposta ? '<div class="al2 i" style="white-space:pre-wrap;margin:6px 0"><b>💬 ' + esc(d.risposta_da_nome || '') + '</b> · ' + esc(dataOraDomanda(d.risposta_il)) + '<br>' + esc(d.risposta) + '</div>' : '') +
    '<div style="font-size:12px;margin-top:4px">' + stato +
      (d.stato === 'aperta' && d.scadenza ? ' · entro ' + esc(dataOraDomanda(d.scadenza)) : '') +
      (d.stato === 'chiusa' ? ' · ' + esc(d.chiusa_da_nome || '') + ' ' + esc(dataOraDomanda(d.chiusa_il)) + (d.chiusa_nota ? ': ' + esc(d.chiusa_nota) : '') : '') +
    '</div>' +
    (allegati ? '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' + allegati + '</div>' : '') +
    (azioni.length ? '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' + azioni.join('') + '</div>' : '') +
  '</div>';
}

// ── Finestre ────────────────────────────────────────────────────────
function preparaFinestreDomande() {
  if (ge('m-domanda')) return;
  // L'elenco per primo: le finestre di domanda e risposta gli stanno sopra.
  document.body.insertAdjacentHTML('beforeend',
    '<div class="mbg" id="m-domande-elenco"><div class="modal" style="max-width:640px">' +
      '<div class="mh"><span>❓ Domande per me</span><button class="mx" onclick="closeM(\'m-domande-elenco\')">✕</button></div>' +
      '<div id="dme-elenco"><div class="load">Caricamento...</div></div>' +
      '<div class="ma"><button class="btn" onclick="closeM(\'m-domande-elenco\')">Chiudi</button></div>' +
    '</div></div>' +
    '<div class="mbg" id="m-domanda"><div class="modal" style="max-width:560px">' +
      '<div class="mh"><span>❓ Fai una domanda</span><button class="mx" onclick="closeM(\'m-domanda\')">✕</button></div>' +
      '<input type="hidden" id="dmn-tabella"><input type="hidden" id="dmn-id"><input type="hidden" id="dmn-box">' +
      '<div class="al2 i" style="margin-bottom:10px" id="dmn-record"></div>' +
      '<div class="f"><label>A chi *</label><select id="dmn-a" onchange="aggiornaTempoDomanda()"></select></div>' +
      '<div id="dmn-tempo" style="font-size:12px;color:var(--m);margin:-4px 0 8px"></div>' +
      '<div class="f"><label>Domanda *</label><textarea id="dmn-testo" rows="4" maxlength="2000" placeholder="es. Le tubazioni del piano terra sono DN 50 o DN 32?"></textarea></div>' +
      '<div class="f"><label>Allegati (facoltativi, max 20 MB l\'uno)</label><input type="file" id="dmn-file" multiple></div>' +
      '<div class="ma"><button class="btn" onclick="closeM(\'m-domanda\')">Annulla</button>' +
      '<button class="btn p" id="dmn-invia" onclick="inviaDomanda()">❓ Invia la domanda</button></div>' +
    '</div></div>' +
    '<div class="mbg" id="m-domanda-risposta"><div class="modal" style="max-width:560px">' +
      '<div class="mh"><span>💬 Rispondi alla domanda</span><button class="mx" onclick="closeM(\'m-domanda-risposta\')">✕</button></div>' +
      '<input type="hidden" id="dmr-id"><input type="hidden" id="dmr-box">' +
      '<div id="dmr-domanda" class="al2 i" style="margin-bottom:10px;white-space:pre-wrap"></div>' +
      '<div class="f"><label>Risposta *</label><textarea id="dmr-testo" rows="4" maxlength="2000"></textarea></div>' +
      '<div class="f"><label>Allegati (facoltativi, max 20 MB l\'uno)</label><input type="file" id="dmr-file" multiple></div>' +
      '<div class="ma"><button class="btn" onclick="closeM(\'m-domanda-risposta\')">Annulla</button>' +
      '<button class="btn p" id="dmr-invia" onclick="inviaRispostaDomanda()">💬 Invia la risposta</button></div>' +
    '</div></div>');
  ['m-domanda', 'm-domanda-risposta', 'm-domande-elenco'].forEach(function(id) {
    const m = ge(id);
    m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('on'); });
  });
}

// Persona o ruolo suggerito per il record e il ruolo di chi chiede
function destinatarioPropostoDomanda(tabella) {
  if (ROLE === 'commerciale' && tabella !== 'commesse') return 'r:ingegnere';
  if (ROLE === 'capo_tecnico' || ROLE === 'ingegnere') return 'r:rappresentante';
  if (ROLE === 'rappresentante') return tabella === 'commesse' ? 'r:capo_tecnico' : 'r:commerciale';
  if (ROLE === 'segreteria') return 'r:rappresentante';
  return '';
}

async function apriNuovaDomanda(tabella, id, contenitoreId) {
  preparaFinestreDomande();
  ge('dmn-tabella').value = tabella;
  ge('dmn-id').value = id;
  ge('dmn-box').value = contenitoreId || '';
  ge('dmn-testo').value = '';
  ge('dmn-file').value = '';
  ge('dmn-record').textContent = (RECORD_DOMANDA[tabella] ? RECORD_DOMANDA[tabella].su : 'Sul record aperto') +
    '. Chi risponde riceve subito un avviso nella campanella 🔔.';
  const utenti = (await utentiPerDomande()).filter(function(u) { return String(u.id) !== mioIdDomande(); });
  const persone = RUOLI_DOMANDA.map(function(r) {
    const del = utenti.filter(function(u) { return u.ruolo === r; });
    if (!del.length) return '';
    return '<optgroup label="' + esc(etichettaRuolo(r)) + '">' + del.map(function(u) {
      return '<option value="u:' + esc(u.id) + '" data-ruolo="' + esc(r) + '">' + esc(u.nome) + '</option>';
    }).join('') + '</optgroup>';
  }).join('');
  ge('dmn-a').innerHTML = '<option value="">— Scegli —</option>' +
    '<optgroup label="Tutto un ruolo (risponde chiunque del ruolo)">' +
      RUOLI_DOMANDA.map(function(r) { return '<option value="r:' + r + '" data-ruolo="' + r + '">Chiunque: ' + esc(etichettaRuolo(r)) + '</option>'; }).join('') +
    '</optgroup>' + persone;
  ge('dmn-a').value = destinatarioPropostoDomanda(tabella);
  aggiornaTempoDomanda();
  ge('dmn-invia').disabled = false;
  openM('m-domanda');
}

function aggiornaTempoDomanda() {
  const sel = ge('dmn-a');
  const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
  ge('dmn-tempo').textContent = opt && opt.dataset.ruolo ? tempoRispostaDomanda(opt.dataset.ruolo) : '';
}

function fileTroppoGrandiDomanda(input) {
  const files = Array.from((input && input.files) || []);
  if (files.length > 10) return 'Al massimo 10 allegati';
  const grande = files.find(function(f) { return f.size > DOMANDE_MAX_FILE; });
  return grande ? 'Il file "' + grande.name + '" supera i 20 MB' : '';
}

// Carica i file nel bucket domande-allegati (<id domanda>/<file>) e li
// registra sulla domanda. Restituisce quanti non sono andati.
async function caricaAllegatiDomanda(idDomanda, input) {
  const files = Array.from((input && input.files) || []);
  let falliti = 0;
  for (const f of files) {
    const pulito = String(f.name || 'file').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(-120) || 'file';
    const percorso = idDomanda + '/' + Date.now() + '_' + pulito;
    const up = await db.storage.from('domande-allegati').upload(percorso, f, { upsert: false, contentType: f.type || undefined });
    if (up.error) { falliti++; console.warn('Allegato domanda:', up.error); continue; }
    const r = await db.rpc('aggiungi_allegato_domanda', { p_id: idDomanda, p_nome: f.name || pulito, p_percorso: percorso });
    if (r.error) { falliti++; console.warn('Allegato domanda:', r.error); }
  }
  return falliti;
}

async function inviaDomanda() {
  const tabella = ge('dmn-tabella').value;
  const id = ge('dmn-id').value;
  const scelta = ge('dmn-a').value;
  const testo = ge('dmn-testo').value.trim();
  if (!scelta) { toast('Scegli a chi fare la domanda', 'err'); return; }
  if (testo.length < 3) { toast('Scrivi la domanda', 'err'); return; }
  const troppo = fileTroppoGrandiDomanda(ge('dmn-file'));
  if (troppo) { toast(troppo, 'err'); return; }
  const btn = ge('dmn-invia');
  btn.disabled = true;
  try {
    const { data, error } = await db.rpc('fai_domanda', {
      p_rif_tabella: tabella, p_rif_id: id, p_testo: testo,
      p_a_id: scelta.startsWith('u:') ? scelta.slice(2) : null,
      p_a_ruolo: scelta.startsWith('r:') ? scelta.slice(2) : null
    });
    if (error) throw error;
    const falliti = await caricaAllegatiDomanda(data.id, ge('dmn-file'));
    closeM('m-domanda');
    toast('Domanda inviata' + (data.scadenza ? ': risposta attesa entro ' + dataOraDomanda(data.scadenza) : '') +
      (falliti ? '. ' + falliti + ' allegat' + (falliti === 1 ? 'o non caricato' : 'i non caricati') : ''), falliti ? 'err' : 'ok');
    DOMANDE.mie = null;
    await ricaricaDopoDomanda(ge('dmn-box').value);
  } catch (e) {
    toast('Domanda non inviata: ' + (e.message || e), 'err');
  } finally {
    btn.disabled = false;
  }
}

async function leggiDomanda(id) {
  const { data, error } = await db.from('domande').select('*').eq('id', id).maybeSingle();
  if (error) { toast('Errore: ' + error.message, 'err'); return null; }
  return data;
}

async function apriRispostaDomanda(id, contenitoreId) {
  preparaFinestreDomande();
  const d = await leggiDomanda(id);
  if (!d) return;
  ge('dmr-id').value = d.id;
  ge('dmr-box').value = contenitoreId || '';
  ge('dmr-domanda').textContent = (d.rif_descrizione ? d.rif_descrizione + '\n' : '') +
    'Domanda di ' + (d.da_nome || '—') + ' (' + etichettaRuolo(d.da_ruolo) + '):\n' + d.testo +
    (d.scadenza ? '\n\nRisposta attesa entro ' + dataOraDomanda(d.scadenza) : '');
  ge('dmr-testo').value = '';
  ge('dmr-file').value = '';
  ge('dmr-invia').disabled = false;
  openM('m-domanda-risposta');
}

async function inviaRispostaDomanda() {
  const id = Number(ge('dmr-id').value);
  const testo = ge('dmr-testo').value.trim();
  if (!testo) { toast('Scrivi la risposta', 'err'); return; }
  const troppo = fileTroppoGrandiDomanda(ge('dmr-file'));
  if (troppo) { toast(troppo, 'err'); return; }
  const btn = ge('dmr-invia');
  btn.disabled = true;
  try {
    // prima gli allegati (dopo la risposta resta possibile, ma così arrivano insieme)
    const falliti = await caricaAllegatiDomanda(id, ge('dmr-file'));
    const { error } = await db.rpc('rispondi_domanda', { p_id: id, p_risposta: testo });
    if (error) throw error;
    closeM('m-domanda-risposta');
    toast('Risposta inviata' + (falliti ? '. ' + falliti + ' allegat' + (falliti === 1 ? 'o non caricato' : 'i non caricati') : ''), falliti ? 'err' : 'ok');
    DOMANDE.mie = null;
    await ricaricaDopoDomanda(ge('dmr-box').value);
  } catch (e) {
    toast('Risposta non inviata: ' + (e.message || e), 'err');
  } finally {
    btn.disabled = false;
  }
}

async function chiudiDomanda(id, contenitoreId) {
  const d = await leggiDomanda(id);
  if (!d) return;
  const ritira = d.stato === 'aperta';
  if (!confirm(ritira ? 'Ritiri la domanda senza aspettare la risposta?' : 'Chiudi la domanda? (la risposta resta scritta)')) return;
  const nota = prompt('Nota (facoltativa)', '');
  if (nota === null) return;
  const { error } = await db.rpc('chiudi_domanda', { p_id: id, p_nota: nota.trim() || null });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast(ritira ? 'Domanda ritirata' : 'Domanda chiusa', 'ok');
  DOMANDE.mie = null;
  await ricaricaDopoDomanda(contenitoreId);
}

async function ricaricaDopoDomanda(contenitoreId) {
  const box = contenitoreId ? ge(contenitoreId) : null;
  if (box && box.dataset.tabella && box.dataset.id) await caricaDomandeRecord(box.dataset.tabella, box.dataset.id, contenitoreId);
  if (ge('m-domande-elenco') && ge('m-domande-elenco').classList.contains('on')) await disegnaElencoDomande();
  if (typeof ricaricaDopoAzioneAvviso === 'function') { try { await ricaricaDopoAzioneAvviso(); } catch (e) {} }
}

async function apriAllegatoDomanda(id, i) {
  const d = await leggiDomanda(id);
  const a = d && (d.allegati || [])[i];
  if (!a) return;
  const { data, error } = await db.storage.from('domande-allegati').createSignedUrl(a.percorso, 600);
  if (error || !data) { toast('File non disponibile: ' + ((error && error.message) || ''), 'err'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

async function apriRecordDomanda(id) {
  const d = await leggiDomanda(id);
  const rec = d && RECORD_DOMANDA[d.rif_tabella];
  if (!rec) return;
  closeM('m-domande-elenco');
  if (typeof apriRottaScheda === 'function') {
    await apriRottaScheda({ tipo: 'rotta', oggetto: rec.oggetto, id: String(d.rif_id), rotta: '/' + rec.oggetto + '/' + d.rif_id });
  }
  const riquadro = ge('dom-' + Number(id));
  if (riquadro) riquadro.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── "Domande per me" (Cosa tocca a me e azione rapida degli avvisi) ──
// Aperte per me (o per il mio ruolo), risposte arrivate alle mie non
// ancora chiuse; il titolare anche le scadute senza risposta di tutti.
async function leggiDomandePerMe(forza) {
  if (!(await verificaDomandeDisponibili())) return null;
  if (!forza && DOMANDE.mie && Date.now() - DOMANDE.mieLette < DOMANDE_VALIDE_MS) return DOMANDE.mie;
  const { data, error } = await db.from('domande').select('*').in('stato', ['aperta', 'risposta'])
    .order('creato_il', { ascending: true }).limit(500);
  if (error) return null;
  const io = mioIdDomande();
  DOMANDE.mie = (data || []).filter(function(d) {
    if (d.stato === 'aperta') return domandaPerMe(d) || (ROLE === 'titolare' && domandaScaduta(d));
    return String(d.da_id) === io;
  });
  DOMANDE.mieLette = Date.now();
  return DOMANDE.mie;
}

async function contaDomandePerMe() {
  const elenco = await leggiDomandePerMe(false);
  if (!elenco) return null;
  const perMe = elenco.filter(function(d) { return d.stato === 'aperta' && domandaPerMe(d); });
  const scadute = elenco.filter(function(d) { return domandaScaduta(d); }).length;
  const risposte = elenco.filter(function(d) { return d.stato === 'risposta'; }).length;
  const altrui = elenco.filter(function(d) { return d.stato === 'aperta' && !domandaPerMe(d); }).length;
  const nota = [perMe.length ? perMe.length + ' da rispondere' : '',
    altrui ? altrui + ' di altri scadut' + (altrui === 1 ? 'a' : 'e') + ' senza risposta' : '',
    risposte ? risposte + ' rispost' + (risposte === 1 ? 'a' : 'e') + ' alle tue domande' : ''].filter(Boolean).join(' · ');
  return { n: elenco.length, nota: nota, livello: scadute ? 'urgente' : '' };
}

async function apriElencoDomande() {
  preparaFinestreDomande();
  openM('m-domande-elenco');
  await disegnaElencoDomande();
}

async function disegnaElencoDomande() {
  const box = ge('dme-elenco');
  if (!box) return;
  box.innerHTML = '<div class="load">Caricamento...</div>';
  const elenco = await leggiDomandePerMe(true);
  if (!elenco) { box.innerHTML = '<div class="empty">Le domande non sono ancora attive.</div>'; return; }
  if (!elenco.length) { box.innerHTML = '<div class="empty">Nessuna domanda per te. 🎉</div>'; return; }
  const gruppo = function(titolo, righe) {
    return righe.length ? '<div style="font-size:13px;font-weight:700;margin:12px 0 4px">' + titolo + ' (' + righe.length + ')</div>' +
      righe.map(function(d) { return htmlDomanda(d, '', true); }).join('') : '';
  };
  box.innerHTML =
    gruppo('Da rispondere', elenco.filter(function(d) { return d.stato === 'aperta' && domandaPerMe(d); })) +
    gruppo('Scadute senza risposta (di altri)', elenco.filter(function(d) { return d.stato === 'aperta' && !domandaPerMe(d); })) +
    gruppo('Risposte alle tue domande', elenco.filter(function(d) { return d.stato === 'risposta'; }));
}

// ── Avvisi (js/58): nomi dei tipi nuovi e azione rapida ───────────────
if (typeof TIPI_AVVISO !== 'undefined') {
  TIPI_AVVISO.domanda = { icona: '❓', nome: 'Domanda per te' };
  TIPI_AVVISO.domanda_risposta = { icona: '💬', nome: 'Risposta alla tua domanda' };
}
if (typeof registraAzioneRapidaAvviso === 'function') {
  ['domanda', 'domanda_risposta'].forEach(function(tipo) {
    registraAzioneRapidaAvviso(tipo, {
      etichetta: tipo === 'domanda' ? '💬 Domande per me' : '💬 Leggi le risposte',
      puo: function() { return DOMANDE.disponibili !== false; },
      fai: function() { closeM('m-avvisi'); return apriElencoDomande(); }
    });
  });
}
