// ── F14.19 — "↩️ ANNULLA" E "✏️ CHIEDI CORREZIONE" PER TUTTI (sql/72) ──
// Chi ha fatto un'azione la annulla da solo finché il passo successivo non
// è partito e comunque entro 24 ore (regola annulla_entro_ore); dopo, al
// posto di "Annulla" compare "Chiedi correzione": la richiesta, con il
// motivo, arriva al responsabile come avviso (✏️ correzione_richiesta, 1
// giorno lavorativo, poi risale al titolare). Tutto lo decide il DATABASE
// (RPC annullamenti_possibili, annulla_azione, chiedi_correzione,
// rispondi_correzione, ritira_correzione): il sito mostra solo il pulsante
// che la RPC dice.
// Oggetti di oggi: avvisi segnati "Fatto" a mano (finestra 🔔 Avvisi con
// "Anche i chiusi"), oggetti del motore di stati e azioni (finestra
// dell'oggetto, js/61; scheda comune, js/63), esito del presidio (scheda
// del presidio, js/07: solo "Chiedi correzione").
// Un modulo mette nel suo HTML segnapostoAnnulla(oggetto, id) e dopo il
// disegno chiama riempiPulsantiAnnulla(contenitore); per ricaricare la sua
// scheda dopo un annullamento usa registraDopoAnnulla(oggetto, fn).
// Senza sql/72: nessun pulsante, nessun errore.

const ANNULLA = { disponibile: null, config: {}, dopo: {}, ultimi: {}, lettura: null };

function erroreAnnullaMancante(error) {
  if (!error) return false;
  const m = String(error.message || '');
  return ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error.code) ||
    /(annullabili|annullamenti|annulla_azione|chiedi_correzione).*(does not exist|schema cache|not find)|could not find the function/i.test(m);
}

async function verificaAnnullaDisponibile() {
  if (ANNULLA.disponibile !== null) return ANNULLA.disponibile;
  if (ANNULLA.lettura) return ANNULLA.lettura;
  ANNULLA.lettura = (async function() {
    try {
      const { data, error } = await db.from('annullabili').select('oggetto,nome,funzione_annulla,responsabile_ruolo,attivo');
      if (error) { if (erroreAnnullaMancante(error)) ANNULLA.disponibile = false; return ANNULLA.disponibile; }
      ANNULLA.config = {};
      (data || []).forEach(function(r) { ANNULLA.config[r.oggetto] = r; });
      ANNULLA.disponibile = true;
    } catch (e) {}
    return ANNULLA.disponibile;
  })();
  try { return await ANNULLA.lettura; } finally { ANNULLA.lettura = null; }
}

function registraDopoAnnulla(oggetto, fn) {
  if (!oggetto || typeof fn !== 'function') return;
  (ANNULLA.dopo[oggetto] = ANNULLA.dopo[oggetto] || []).push(fn);
}

// L'oggetto si annulla in automatico? (avvisi, oggetti del motore) o solo correzione?
function oggettoSiAnnulla(oggetto) {
  const c = ANNULLA.config[oggetto];
  if (c) return c.attivo !== false && !!c.funzione_annulla;
  return typeof MOTORE_AZIONI !== 'undefined' && !!MOTORE_AZIONI.oggetti[oggetto];
}

function nomeOggettoAnnulla(oggetto) {
  const c = ANNULLA.config[oggetto];
  if (c) return c.nome;
  return typeof nomeOggettoMotore === 'function' ? nomeOggettoMotore(oggetto) : oggetto;
}

function oraAnnulla(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const oggi = new Date();
    const ora = d.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
    const giorno = function(x) { return x.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }); };
    const domani = new Date(oggi.getTime() + 86400000);
    if (giorno(d) === giorno(oggi)) return 'alle ' + ora;
    if (giorno(d) === giorno(domani)) return 'a domani alle ' + ora;
    return 'al ' + d.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit' }) + ' alle ' + ora;
  } catch (e) { return iso; }
}

function dataOraAnnulla(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return iso; }
}

// ── Pulsanti ─────────────────────────────────────────────────────────
function segnapostoAnnulla(oggetto, id) {
  if (!oggetto || id == null) return '';
  return '<span class="anl-posto" data-annulla-oggetto="' + esc(oggetto) + '" data-annulla-id="' + esc(String(id)) + '"></span>';
}

function htmlPulsanteAnnulla(oggetto, id, r) {
  if (!r) return '';
  const dati = ' data-oggetto="' + esc(oggetto) + '" data-id="' + esc(String(id)) + '"';
  if (r.modo === 'annulla') {
    return '<button type="button" class="btn sm"' + dati + ' data-modo="annulla" onclick="clicAnnulla(this)"' +
      ' title="Annulli la tua azione: torna com\'era prima">↩️ Annulla' + (r.entro ? ' (fino ' + esc(oraAnnulla(r.entro)) + ')' : '') + '</button>';
  }
  if (r.modo === 'correzione') {
    return '<button type="button" class="btn sm"' + dati + ' data-modo="correzione" onclick="clicAnnulla(this)"' +
      ' title="' + esc(r.motivo || '') + '">✏️ Chiedi correzione</button>';
  }
  if (r.modo === 'in_attesa') {
    return '<span class="bx bgray" title="La richiesta è al responsabile">⏳ Correzione chiesta a ' + esc(etichettaRuolo(r.responsabile || 'titolare')) + '</span>' +
      (r.richiesta_id ? ' <button type="button" class="btn sm" onclick="ritiraCorrezione(' + Number(r.richiesta_id) + ',\'' + esc(oggetto) + '\',\'' + esc(String(id)) + '\')">Ritira</button>' : '');
  }
  return '';
}

// Riempie i segnaposto del contenitore (una lettura per oggetto, max 300 id).
async function riempiPulsantiAnnulla(radice) {
  if (!radice || !radice.querySelectorAll) return;
  const posti = Array.from(radice.querySelectorAll('[data-annulla-oggetto][data-annulla-id]'));
  if (!posti.length) return;
  if (!(await verificaAnnullaDisponibile())) return;
  const perOggetto = {};
  posti.forEach(function(p) {
    const o = p.dataset.annullaOggetto;
    (perOggetto[o] = perOggetto[o] || []).push(p);
  });
  await Promise.all(Object.keys(perOggetto).map(async function(oggetto) {
    const ids = Array.from(new Set(perOggetto[oggetto].map(function(p) { return p.dataset.annullaId; }))).slice(0, 300);
    const { data, error } = await db.rpc('annullamenti_possibili', { p_oggetto: oggetto, p_ids: ids });
    if (error) {
      if (erroreAnnullaMancante(error)) ANNULLA.disponibile = false;
      else console.warn('Annulla:', error.message);
      return;
    }
    const mappa = {};
    (data || []).forEach(function(r) { mappa[String(r.id)] = r; ANNULLA.ultimi[oggetto + ':' + r.id] = r; });
    perOggetto[oggetto].forEach(function(p) {
      p.innerHTML = htmlPulsanteAnnulla(oggetto, p.dataset.annullaId, mappa[p.dataset.annullaId]);
    });
  }));
}

function clicAnnulla(btn) {
  return apriAnnulla(btn.dataset.oggetto, btn.dataset.id, btn.dataset.modo);
}

// ── Finestre ─────────────────────────────────────────────────────────
function preparaFinestreAnnulla() {
  if (ge('m-annulla')) return;
  document.body.insertAdjacentHTML('beforeend',
    '<div class="mbg" id="m-annulla"><div class="modal" style="max-width:520px">' +
      '<button class="x" onclick="closeM(\'m-annulla\')">×</button>' +
      '<h3 id="anl-titolo">↩️ Annulla</h3>' +
      '<input type="hidden" id="anl-oggetto"><input type="hidden" id="anl-id"><input type="hidden" id="anl-modo">' +
      '<div id="anl-testo" class="al2 i" style="margin-bottom:10px"></div>' +
      '<div class="f"><label id="anl-etichetta">Motivo</label><textarea id="anl-motivo" rows="3" maxlength="500"></textarea></div>' +
      '<div class="ma"><button class="btn" onclick="closeM(\'m-annulla\')">Chiudi</button>' +
      '<button class="btn p" id="anl-conferma" onclick="confermaAnnulla()">Conferma</button></div>' +
    '</div></div>' +
    '<div class="mbg" id="m-correzione"><div class="modal" style="max-width:560px">' +
      '<button class="x" onclick="closeM(\'m-correzione\')">×</button>' +
      '<h3>✏️ Richiesta di correzione</h3>' +
      '<input type="hidden" id="crz-id">' +
      '<div id="crz-corpo"><div class="load">Caricamento...</div></div>' +
      '<div class="ma" id="crz-azioni"></div>' +
    '</div></div>');
  ['m-annulla', 'm-correzione'].forEach(function(id) {
    const m = ge(id);
    m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('on'); });
  });
}

function apriAnnulla(oggetto, id, modo) {
  preparaFinestreAnnulla();
  const r = ANNULLA.ultimi[oggetto + ':' + id] || {};
  ge('anl-oggetto').value = oggetto;
  ge('anl-id').value = String(id);
  ge('anl-modo').value = modo;
  ge('anl-motivo').value = '';
  const corr = modo === 'correzione';
  ge('anl-titolo').textContent = corr ? '✏️ Chiedi correzione' : '↩️ Annulla la tua azione';
  ge('anl-testo').innerHTML = esc(r.descrizione || nomeOggettoAnnulla(oggetto)) + '<br>' + (corr
    ? 'Non puoi più annullarla da solo' + (r.motivo ? ' (' + esc(r.motivo) + ')' : '') + '. La richiesta va a <b>' +
      esc(etichettaRuolo(r.responsabile || 'titolare')) + '</b>, che ha 1 giorno lavorativo per rispondere; poi la vede il titolare.'
    : 'Torna com\'era prima della tua azione. Resta scritto nel registro chi ha annullato e quando.' +
      (r.entro ? ' Puoi farlo fino ' + esc(oraAnnulla(r.entro)) + '.' : ''));
  ge('anl-etichetta').textContent = corr ? 'Cosa va corretto e perché * (almeno 5 caratteri)' : 'Motivo (facoltativo)';
  ge('anl-conferma').textContent = corr ? '✏️ Manda la richiesta' : '↩️ Annulla';
  openM('m-annulla');
  setTimeout(function() { ge('anl-motivo').focus(); }, 50);
}

async function confermaAnnulla() {
  const oggetto = ge('anl-oggetto').value, id = ge('anl-id').value, modo = ge('anl-modo').value;
  const motivo = ge('anl-motivo').value.trim();
  if (modo === 'correzione' && motivo.length < 5) { toast('Scrivi cosa va corretto (almeno 5 caratteri)', 'err'); return; }
  const btn = ge('anl-conferma');
  btn.disabled = true;
  try {
    const r = modo === 'correzione'
      ? await db.rpc('chiedi_correzione', { p_oggetto: oggetto, p_id: String(id), p_motivo: motivo })
      : await db.rpc('annulla_azione', { p_oggetto: oggetto, p_id: String(id), p_motivo: motivo || null });
    if (r.error) { toast('Non fatto: ' + r.error.message, 'err'); return; }
    closeM('m-annulla');
    const resp = (ANNULLA.ultimi[oggetto + ':' + id] || {}).responsabile;
    toast(modo === 'correzione' ? 'Richiesta mandata a ' + etichettaRuolo(resp || 'titolare') + ' ✓' : 'Annullato ✓: è tornato com\'era', 'ok');
    await dopoAnnulla(oggetto, id);
  } finally {
    btn.disabled = false;
  }
}

async function ritiraCorrezione(richiestaId, oggetto, id) {
  if (!confirm('Ritiri la richiesta di correzione?')) return;
  const { error } = await db.rpc('ritira_correzione', { p_id: Number(richiestaId), p_nota: null });
  if (error) { toast('Non fatto: ' + error.message, 'err'); return; }
  toast('Richiesta ritirata', 'ok');
  closeM('m-correzione');
  await dopoAnnulla(oggetto, id);
}

// Dopo un annullamento o una risposta: ricarica quello che è aperto.
async function dopoAnnulla(oggetto, id) {
  (ANNULLA.dopo[oggetto] || []).forEach(function(fn) { try { fn(id); } catch (e) { console.warn(e); } });
  const motore = typeof MOTORE_AZIONI !== 'undefined' && MOTORE_AZIONI.oggetti[oggetto];
  if (motore) {
    (MOTORE_AZIONI.dopo[oggetto] || []).forEach(function(fn) { try { fn(id, null); } catch (e) { console.warn(e); } });
    if (MOTORE_AZIONI.aperto && MOTORE_AZIONI.aperto.oggetto === oggetto && String(MOTORE_AZIONI.aperto.id) === String(id) &&
        ge('m-oggetto-motore') && ge('m-oggetto-motore').classList.contains('on')) {
      apriOggettoMotore(oggetto, id).catch(function() {});
    }
    if (oggetto === 'motore_oggetti_prova' && ge('si-motore-prova') && typeof disegnaOggettiProvaMotore === 'function') {
      disegnaOggettiProvaMotore().catch(function() {});
    }
    if (typeof SCHEDA_OGGETTO !== 'undefined' && typeof caricaSchedaOggetto === 'function') {
      Object.keys(SCHEDA_OGGETTO.aperte || {}).forEach(function(o) {
        const a = SCHEDA_OGGETTO.aperte[o];
        if ((typeof TABELLA_OGGETTO_SCHEDA !== 'undefined' ? (TABELLA_OGGETTO_SCHEDA[o] || o) : o) === oggetto && a && a.id === String(id)) {
          db.from(oggetto).select('*').eq('id', id).maybeSingle().then(function(r) {
            if (r && r.data) caricaSchedaOggetto(o, r.data, a.contenitore);
          });
        }
      });
    }
  }
  if (typeof ricaricaDopoAzioneAvviso === 'function') await ricaricaDopoAzioneAvviso().catch(function() {});
  const scheda = ge('msp-annulla');
  if (scheda && (oggetto === 'schede_presidi' || oggetto === 'schede_manichette')) riempiPulsantiAnnulla(scheda);
}

// Apre l'oggetto di una richiesta (dove si può).
function puoAprireOggettoAnnulla(oggetto) {
  if (oggetto === 'avvisi') return typeof apriAvvisi === 'function';
  return typeof MOTORE_AZIONI !== 'undefined' && !!MOTORE_AZIONI.oggetti[oggetto] && typeof apriOggettoMotore === 'function';
}

function apriOggettoAnnulla(oggetto, id) {
  closeM('m-correzione');
  if (oggetto === 'avvisi') {
    if (typeof AVVISI !== 'undefined') AVVISI.chiusi = true;
    return apriAvvisi(id);
  }
  return apriOggettoMotore(oggetto, id);
}

// ── Richiesta di correzione: chi risponde e chi l'ha chiesta ──────────
const STATI_CORREZIONE = {
  aperta: '⏳ Aperta', applicata: '↩️ Annullata dal responsabile', corretta: '✓ Corretta a mano',
  rifiutata: '✖ Non accolta', ritirata: 'Ritirata', fatto: '↩️ Annullata'
};

async function apriCorrezione(richiestaId) {
  if (!(await verificaAnnullaDisponibile())) { toast('Annulla e correzioni non sono ancora attivi (sql/72)', 'err'); return; }
  try { if (typeof caricaMotoreAzioni === 'function') await caricaMotoreAzioni(); } catch (e) {}
  preparaFinestreAnnulla();
  ge('crz-id').value = String(richiestaId);
  ge('crz-corpo').innerHTML = '<div class="load">Caricamento...</div>';
  ge('crz-azioni').innerHTML = '<button class="btn" onclick="closeM(\'m-correzione\')">Chiudi</button>';
  openM('m-correzione');
  const { data: r, error } = await db.from('annullamenti').select('*').eq('id', richiestaId).maybeSingle();
  if (error || !r) { ge('crz-corpo').innerHTML = '<div class="al2 w">Richiesta non trovata, oppure non è per te.</div>'; return; }
  const mia = ME && r.chiesto_da === ME.id;
  const puoRispondere = r.stato === 'aperta' && !mia && (ROLE === 'titolare' || ROLE === r.responsabile_ruolo);
  const scaduta = r.stato === 'aperta' && r.scadenza && new Date(r.scadenza).getTime() <= Date.now();
  let html = '<div style="font-size:14px;font-weight:600;margin-bottom:6px">' + esc(r.descrizione) + '</div>' +
    '<div style="font-size:13px;margin-bottom:6px"><b>Cosa va corretto:</b> ' + esc(r.motivo || '') + '</div>' +
    '<div style="font-size:12px;color:var(--m);margin-bottom:6px">Chiesta da ' + esc(r.chiesto_da_nome || '—') +
      (r.chiesto_da_ruolo ? ' (' + esc(etichettaRuolo(r.chiesto_da_ruolo)) + ')' : '') + ' il ' + esc(dataOraAnnulla(r.chiesto_il)) +
      ' · per ' + esc(etichettaRuolo(r.responsabile_ruolo || 'titolare')) +
      (r.scadenza ? ' · ' + (scaduta ? '<span class="avv-scaduto">⏰ scaduta il ' + esc(dataOraAnnulla(r.scadenza)) + '</span>' : 'entro il ' + esc(dataOraAnnulla(r.scadenza))) : '') + '</div>' +
    '<div style="margin-bottom:8px">Stato: <b>' + esc(STATI_CORREZIONE[r.stato] || r.stato) + '</b>' +
      (r.chiusa_il ? ' da ' + esc(r.chiusa_da_nome || '—') + ' il ' + esc(dataOraAnnulla(r.chiusa_il)) : '') + '</div>' +
    (r.esito && r.stato !== 'aperta' ? '<div class="al2 i" style="margin-bottom:8px">' + esc(r.esito) + '</div>' : '');
  if (puoRispondere) {
    const siAnnulla = oggettoSiAnnulla(r.oggetto);
    html += '<div class="al2 i" style="margin-bottom:8px">' + (siAnnulla
      ? 'Se il passo successivo non è partito puoi <b>↩️ Annullare l\'azione per lui</b> (torna com\'era). Altrimenti correggi a mano e segna <b>✓ Corretta a mano</b>.'
      : 'Questo non si annulla in automatico: correggilo a mano (es. dallo storico dei presidi) e segna <b>✓ Corretta a mano</b>.') + '</div>' +
      '<div class="f"><label>Cosa hai fatto (obbligatorio per «Corretta a mano» e «Non serve»)</label><textarea id="crz-esito" rows="3" maxlength="500"></textarea></div>';
    ge('crz-azioni').innerHTML = '<button class="btn" onclick="closeM(\'m-correzione\')">Chiudi</button>' +
      (puoAprireOggettoAnnulla(r.oggetto) ? '<button class="btn" onclick="apriOggettoAnnulla(\'' + esc(r.oggetto) + '\',\'' + esc(r.record_id) + '\')">Apri</button>' : '') +
      '<button class="btn" onclick="rispondiCorrezione(\'rifiutata\')">✖ Non serve</button>' +
      '<button class="btn" onclick="rispondiCorrezione(\'corretta\')">✓ Corretta a mano</button>' +
      (siAnnulla ? '<button class="btn p" onclick="rispondiCorrezione(\'applica\')">↩️ Annulla l\'azione per lui</button>' : '');
  } else {
    if (r.stato === 'aperta' && !mia) html += '<div class="al2 w">La richiesta è per ' + esc(etichettaRuolo(r.responsabile_ruolo || 'titolare')) + '.</div>';
    ge('crz-azioni').innerHTML = '<button class="btn" onclick="closeM(\'m-correzione\')">Chiudi</button>' +
      (puoAprireOggettoAnnulla(r.oggetto) ? '<button class="btn" onclick="apriOggettoAnnulla(\'' + esc(r.oggetto) + '\',\'' + esc(r.record_id) + '\')">Apri</button>' : '') +
      (mia && r.stato === 'aperta' ? '<button class="btn" onclick="ritiraCorrezione(' + Number(r.id) + ',\'' + esc(r.oggetto) + '\',\'' + esc(r.record_id) + '\')">Ritira la richiesta</button>' : '');
  }
  ge('crz-corpo').innerHTML = html;
}

async function rispondiCorrezione(modo) {
  const id = Number(ge('crz-id').value);
  const esito = (ge('crz-esito') ? ge('crz-esito').value : '').trim();
  if (modo !== 'applica' && esito.length < 3) { toast('Scrivi cosa hai fatto (o perché non serve)', 'err'); return; }
  const bottoni = ge('crz-azioni').querySelectorAll('button');
  bottoni.forEach(function(b) { b.disabled = true; });
  try {
    const { error } = await db.rpc('rispondi_correzione', { p_id: id, p_modo: modo, p_esito: esito || null });
    if (error) { toast('Non fatto: ' + error.message, 'err'); return; }
    closeM('m-correzione');
    toast(modo === 'applica' ? 'Azione annullata ✓ (avvisato chi l\'aveva chiesto)' : modo === 'corretta' ? 'Segnata corretta ✓' : 'Richiesta chiusa: non serve', 'ok');
    const { data: r } = await db.from('annullamenti').select('oggetto,record_id').eq('id', id).maybeSingle();
    await dopoAnnulla(r ? r.oggetto : '', r ? r.record_id : '');
  } finally {
    bottoni.forEach(function(b) { b.disabled = false; });
  }
}

// ── Avvisi (js/58): tipi e azioni rapide ───────────────────────────────
(function() {
  if (typeof TIPI_AVVISO !== 'undefined') {
    TIPI_AVVISO.correzione_richiesta = { icona: '✏️', nome: 'Richiesta di correzione', senzaFatto: true };
    TIPI_AVVISO.correzione_esito = { icona: '↩️', nome: 'Esito di una richiesta di correzione' };
  }
  if (typeof registraAzioneRapidaAvviso === 'function') {
    registraAzioneRapidaAvviso('correzione_richiesta', {
      etichetta: '✏️ Gestisci la correzione', anche_chiuso: true,
      puo: function(a) { return a.rif_tabella === 'annullamenti' && !!a.rif_id; },
      fai: function(a) { closeM('m-avvisi'); return apriCorrezione(a.rif_id); }
    });
    registraAzioneRapidaAvviso('correzione_esito', {
      etichetta: '📄 Vedi la richiesta', anche_chiuso: true,
      puo: function(a) { return a.rif_tabella === 'annullamenti' && !!a.rif_id; },
      fai: function(a) { closeM('m-avvisi'); return apriCorrezione(a.rif_id); }
    });
  }
})();

// ── Esito del presidio (scheda del presidio, js/07) ───────────────────
// Ultimo esito del presidio registrato da chi guarda: "Chiedi correzione".
async function caricaAnnullaSchedaPresidio(impianto) {
  const box = ge('msp-annulla');
  if (!box || !impianto || !impianto.id || !ME) return;
  box.innerHTML = '';
  if (!(await verificaAnnullaDisponibile())) return;
  const tabella = impianto.tipo === 'manichetta' ? 'schede_manichette' : 'schede_presidi';
  const { data, error } = await db.from(tabella).select('id,creato_il,tecnico_id,creato_da')
    .eq('impianto_id', impianto.id).order('creato_il', { ascending: false }).limit(1);
  if (error || !data || !data.length) return;
  const s = data[0];
  if (s.tecnico_id !== ME.id && s.creato_da !== ME.id) return;
  box.innerHTML = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--bl)">' +
    '<span style="font-size:12px;color:var(--m)">Ultimo esito registrato da te il ' + esc(dataOraAnnulla(s.creato_il)) + ': sbagliato?</span>' +
    segnapostoAnnulla(tabella, s.id) + '</div>';
  await riempiPulsantiAnnulla(box);
  if (!box.querySelector('button, .bx')) box.innerHTML = '';
}
