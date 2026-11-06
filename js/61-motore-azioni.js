// ── F14.12 — MOTORE UNICO DI STATI E AZIONI (sql/68) ─────────────────
// Per gli oggetti NUOVI (POS, documenti finali, eventi di sicurezza,
// fermi...) gli stati e le azioni sono righe della tabella
// motore_transizioni (oggetto, stato da, stato a, azione, ruoli ammessi,
// controlli, motivo obbligatorio, avvisi da creare, scadenze da aprire o
// chiudere). Il sito:
// - azioniDisponibili(oggetto, ruolo, stato) legge la STESSA tabella e
//   restituisce le azioni che quel ruolo può fare in quello stato: i
//   pulsanti (htmlPulsantiAzioni) compaiono solo a chi può usarli;
// - eseguiAzioneMotore(oggetto, id, azione, motivo, dati) chiama la RPC
//   unica esegui_azione: il DATABASE ricontrolla ruolo, stato, motivo e
//   controlli, cambia lo stato, scrive il registro, chiude gli avvisi del
//   passo di prima, crea quelli nuovi, apre e chiude le scadenze;
// - apriAzioneMotore chiede prima il motivo (se obbligatorio) o la
//   conferma (finestra m-azione-motore, id azm-);
// - apriOggettoMotore(oggetto, id) = scheda generica dell'oggetto
//   (finestra m-oggetto-motore, id ogm-): stato, percorso degli stati,
//   pulsanti, registro delle azioni. La apre l'avviso "⚙️ Apri e agisci"
//   (azione rapida di js/58 per gli avvisi azione_*).
// Un modulo nuovo aggiunge le sue righe con un file sql/NN, usa
// htmlPulsantiAzioni nella sua scheda e registraDopoAzioneMotore(oggetto,
// fn) per ricaricarla dopo un'azione.
// Le RPC che esistono già (commesse sql/28, preventivi, ordini, fatture,
// RIBA, contratti, appuntamenti) NON passano di qui.
// Impostazioni > "⚙️ Stati e azioni" (solo titolare): tabella delle
// transizioni in sola lettura e oggetti di prova (Bozza → In verifica →
// Approvato) con "🧪 Crea oggetto di prova".
// Senza sql/68: nessun pulsante, il riquadro dice "non ancora attivo".

const MOTORE_AZIONI = {
  disponibile: null, caricato_il: 0, lettura: null,
  oggetti: {}, stati: {}, transizioni: [], dopo: {}, tipiAvviso: {}, aperto: null
};
const MOTORE_AZIONI_VALIDO_MS = 5 * 60 * 1000;

function erroreMotoreAzioniMancante(error) {
  if (!error) return false;
  const m = String(error.message || '');
  return ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error.code) ||
    /(motore_|esegui_azione|azioni_disponibili).*(does not exist|schema cache|not find)|could not find the function/i.test(m);
}

async function verificaMotoreAzioniDisponibile() {
  if (MOTORE_AZIONI.disponibile !== null) return MOTORE_AZIONI.disponibile;
  try {
    const { error } = await db.from('motore_transizioni').select('id').limit(1);
    if (error) { if (erroreMotoreAzioniMancante(error)) MOTORE_AZIONI.disponibile = false; return MOTORE_AZIONI.disponibile; }
    MOTORE_AZIONI.disponibile = true;
  } catch (e) {}
  return MOTORE_AZIONI.disponibile;
}

// Legge oggetti, stati e transizioni (valgono 5 minuti). false = non attivo.
async function caricaMotoreAzioni(forza) {
  if (!(await verificaMotoreAzioniDisponibile())) return false;
  if (!forza && MOTORE_AZIONI.caricato_il && Date.now() - MOTORE_AZIONI.caricato_il < MOTORE_AZIONI_VALIDO_MS) return true;
  if (MOTORE_AZIONI.lettura) return MOTORE_AZIONI.lettura;
  MOTORE_AZIONI.lettura = (async function() {
    try {
      const [o, s, t] = await Promise.all([
        db.from('motore_oggetti').select('*').eq('attivo', true),
        db.from('motore_stati').select('*').order('ordine'),
        db.from('motore_transizioni').select('*').eq('attiva', true).order('ordine').order('id')
      ]);
      if (o.error || s.error || t.error) { console.warn('Motore azioni:', (o.error || s.error || t.error).message); return false; }
      MOTORE_AZIONI.oggetti = {};
      (o.data || []).forEach(function(r) { MOTORE_AZIONI.oggetti[r.oggetto] = r; });
      MOTORE_AZIONI.stati = {};
      (s.data || []).forEach(function(r) { (MOTORE_AZIONI.stati[r.oggetto] = MOTORE_AZIONI.stati[r.oggetto] || []).push(r); });
      MOTORE_AZIONI.transizioni = t.data || [];
      MOTORE_AZIONI.caricato_il = Date.now();
      registraTipiAvvisoMotore();
      return true;
    } finally {
      MOTORE_AZIONI.lettura = null;
    }
  })();
  return MOTORE_AZIONI.lettura;
}

// Azioni che il ruolo può fare sull'oggetto in quello stato (stessa tabella
// del database; il database ricontrolla sempre). Servono i dati letti da
// caricaMotoreAzioni: senza, nessuna azione.
function azioniDisponibili(oggetto, ruolo, stato) {
  if (!oggetto || !ruolo || stato == null) return [];
  return MOTORE_AZIONI.transizioni.filter(function(t) {
    return t.attiva !== false && t.oggetto === oggetto && t.stato_da === stato &&
      Array.isArray(t.ruoli_ammessi) && t.ruoli_ammessi.indexOf(ruolo) >= 0;
  }).sort(function(a, b) { return (a.ordine - b.ordine) || (a.id - b.id); });
}

function transizioneMotore(oggetto, azione, stato) {
  return MOTORE_AZIONI.transizioni.find(function(t) {
    return t.oggetto === oggetto && t.azione === azione && t.stato_da === stato;
  }) || null;
}

function nomeStatoMotore(oggetto, codice) {
  if (codice == null) return 'Nascita';
  const s = (MOTORE_AZIONI.stati[oggetto] || []).find(function(r) { return r.codice === codice; });
  return s ? s.nome : codice;
}

function classeStatoMotore(oggetto, codice) {
  const s = (MOTORE_AZIONI.stati[oggetto] || []).find(function(r) { return r.codice === codice; });
  if (!s) return 'bgray';
  return s.finale ? 'bok' : (s.iniziale ? 'bgray' : 'bblue');
}

function nomeOggettoMotore(oggetto) {
  return (MOTORE_AZIONI.oggetti[oggetto] || {}).nome || oggetto;
}

// Un modulo ricarica la sua scheda dopo un'azione sul suo oggetto.
function registraDopoAzioneMotore(oggetto, fn) {
  if (!oggetto || typeof fn !== 'function') return;
  (MOTORE_AZIONI.dopo[oggetto] = MOTORE_AZIONI.dopo[oggetto] || []).push(fn);
}

// Pulsanti delle azioni (solo quelle del ruolo). ruolo predefinito = ROLE.
function htmlPulsantiAzioni(oggetto, id, stato, ruolo) {
  return azioniDisponibili(oggetto, ruolo || ROLE, stato).map(function(t) {
    return '<button type="button" class="btn sm' + (t.ordine <= 10 ? ' p' : '') + '"' +
      ' data-oggetto="' + esc(oggetto) + '" data-id="' + esc(String(id)) + '" data-azione="' + esc(t.azione) + '"' +
      ' data-stato="' + esc(stato) + '" onclick="clicAzioneMotore(this)">' + esc(t.etichetta) + '</button>';
  }).join('');
}

function clicAzioneMotore(btn) {
  return apriAzioneMotore(btn.dataset.oggetto, btn.dataset.id, btn.dataset.azione, btn.dataset.stato);
}

// ── Finestre ─────────────────────────────────────────────────────────
function preparaFinestreMotoreAzioni() {
  if (ge('m-azione-motore')) return;
  document.body.insertAdjacentHTML('beforeend',
    '<div class="mbg" id="m-oggetto-motore"><div class="modal" style="max-width:620px">' +
      '<button class="x" onclick="closeM(\'m-oggetto-motore\')">×</button>' +
      '<h3 id="ogm-titolo">⚙️ Oggetto</h3>' +
      '<div id="ogm-corpo"><div class="load">Caricamento...</div></div>' +
      '<div class="ma"><button class="btn" onclick="closeM(\'m-oggetto-motore\')">Chiudi</button></div>' +
    '</div></div>' +
    '<div class="mbg" id="m-azione-motore"><div class="modal" style="max-width:520px">' +
      '<button class="x" onclick="closeM(\'m-azione-motore\')">×</button>' +
      '<h3 id="azm-titolo">Azione</h3>' +
      '<input type="hidden" id="azm-oggetto"><input type="hidden" id="azm-id"><input type="hidden" id="azm-azione">' +
      '<div id="azm-testo" class="al2 i" style="margin-bottom:10px"></div>' +
      '<div class="f" id="azm-motivo-riga"><label id="azm-etichetta">Motivo *</label><textarea id="azm-motivo" rows="3" maxlength="500"></textarea></div>' +
      '<div class="ma"><button class="btn" onclick="closeM(\'m-azione-motore\')">Annulla</button>' +
      '<button class="btn p" id="azm-conferma" onclick="confermaAzioneMotore()">Conferma</button></div>' +
    '</div></div>');
  ['m-oggetto-motore', 'm-azione-motore'].forEach(function(id) {
    const m = ge(id);
    m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('on'); });
  });
}

// Prima dell'azione: motivo (se obbligatorio) o conferma (se la riga la chiede).
async function apriAzioneMotore(oggetto, id, azione, stato) {
  if (!(await caricaMotoreAzioni())) { toast('Il motore delle azioni non è ancora attivo', 'err'); return; }
  const t = transizioneMotore(oggetto, azione, stato);
  if (!t) { toast('Azione non più disponibile: ricarica la pagina', 'err'); return; }
  if (!t.motivo_obbligatorio && !t.conferma) return eseguiAzioneMotore(oggetto, id, azione, null, null);
  preparaFinestreMotoreAzioni();
  ge('azm-oggetto').value = oggetto;
  ge('azm-id').value = String(id);
  ge('azm-azione').value = azione;
  ge('azm-titolo').textContent = t.etichetta;
  ge('azm-testo').textContent = (t.conferma ? t.conferma + ' ' : '') +
    nomeOggettoMotore(oggetto) + ': da «' + nomeStatoMotore(oggetto, stato) + '» a «' + nomeStatoMotore(oggetto, t.stato_a) + '».';
  ge('azm-motivo').value = '';
  ge('azm-motivo-riga').style.display = t.motivo_obbligatorio ? '' : 'none';
  ge('azm-etichetta').textContent = 'Motivo * (va nel registro e nell\'avviso)';
  ge('azm-conferma').dataset.obbligatorio = t.motivo_obbligatorio ? '1' : '';
  ge('azm-conferma').textContent = t.etichetta;
  openM('m-azione-motore');
  if (t.motivo_obbligatorio) setTimeout(function() { ge('azm-motivo').focus(); }, 50);
}

async function confermaAzioneMotore() {
  const btn = ge('azm-conferma');
  const motivo = ge('azm-motivo').value.trim();
  if (btn.dataset.obbligatorio && motivo.length < 3) { toast('Scrivi il motivo', 'err'); return; }
  btn.disabled = true;
  try {
    const ok = await eseguiAzioneMotore(ge('azm-oggetto').value, ge('azm-id').value, ge('azm-azione').value, motivo || null, null);
    if (ok) closeM('m-azione-motore');
  } finally {
    btn.disabled = false;
  }
}

// RPC unica. true = fatta. Il messaggio d'errore è quello del database.
async function eseguiAzioneMotore(oggetto, id, azione, motivo, dati) {
  const { data, error } = await db.rpc('esegui_azione', {
    p_oggetto: oggetto, p_id: String(id), p_azione: azione, p_motivo: motivo || null, p_dati: dati || null
  });
  if (error) { toast('Non fatto: ' + error.message, 'err'); return false; }
  const extra = [];
  if (data && data.avvisi_creati) extra.push(data.avvisi_creati === 1 ? '1 avviso mandato' : data.avvisi_creati + ' avvisi mandati');
  toast('Fatto: ' + nomeOggettoMotore(oggetto) + ' ora è «' + ((data && data.stato_a_nome) || nomeStatoMotore(oggetto, data && data.stato_a)) + '»' +
    (extra.length ? ' (' + extra.join(', ') + ')' : ''), 'ok');
  (MOTORE_AZIONI.dopo[oggetto] || []).forEach(function(fn) { try { fn(id, data); } catch (e) { console.warn(e); } });
  if (MOTORE_AZIONI.aperto && MOTORE_AZIONI.aperto.oggetto === oggetto && String(MOTORE_AZIONI.aperto.id) === String(id) &&
      ge('m-oggetto-motore') && ge('m-oggetto-motore').classList.contains('on')) {
    apriOggettoMotore(oggetto, id).catch(function() {});
  }
  if (typeof ricaricaDopoAzioneAvviso === 'function') ricaricaDopoAzioneAvviso().catch(function() {});
  if (oggetto === 'motore_oggetti_prova' && ge('si-motore-prova')) disegnaOggettiProvaMotore().catch(function() {});
  return true;
}

// ── Scheda generica dell'oggetto ─────────────────────────────────────
function dataOraMotore(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function htmlPercorsoStatiMotore(oggetto, stato) {
  return (MOTORE_AZIONI.stati[oggetto] || []).map(function(s) {
    return '<span class="bx ' + (s.codice === stato ? classeStatoMotore(oggetto, s.codice) : 'bgray') + '"' +
      (s.codice === stato ? ' style="font-weight:700;outline:1px solid currentColor"' : ' style="opacity:.6"') + '>' + esc(s.nome) + '</span>';
  }).join(' → ');
}

async function apriOggettoMotore(oggetto, id) {
  preparaFinestreMotoreAzioni();
  ge('ogm-titolo').textContent = '⚙️ ' + nomeOggettoMotore(oggetto);
  ge('ogm-corpo').innerHTML = '<div class="load">Caricamento...</div>';
  openM('m-oggetto-motore');
  if (!(await caricaMotoreAzioni())) {
    ge('ogm-corpo').innerHTML = '<div class="al2 i">Il motore delle azioni non è ancora attivo.</div>';
    return;
  }
  const o = MOTORE_AZIONI.oggetti[oggetto];
  if (!o) { ge('ogm-corpo').innerHTML = '<div class="al2 w">Oggetto non gestito dal motore delle azioni.</div>'; return; }
  ge('ogm-titolo').textContent = '⚙️ ' + o.nome;
  MOTORE_AZIONI.aperto = { oggetto: oggetto, id: id };
  const [r, st] = await Promise.all([
    db.from(oggetto).select('*').eq('id', id).maybeSingle(),
    db.from('motore_azioni_storico').select('*').eq('oggetto', oggetto).eq('record_id', String(id)).order('quando', { ascending: false }).limit(50)
  ]);
  if (r.error || !r.data) {
    ge('ogm-corpo').innerHTML = '<div class="al2 w">Non trovato, oppure non hai accesso a questo oggetto.</div>';
    return;
  }
  const riga = r.data;
  const stato = riga[o.colonna_stato];
  const etichetta = o.colonna_etichetta ? riga[o.colonna_etichetta] : null;
  const pulsanti = htmlPulsantiAzioni(oggetto, id, stato);
  const altre = MOTORE_AZIONI.transizioni.filter(function(t) { return t.oggetto === oggetto && t.stato_da === stato; })
    .filter(function(t) { return t.ruoli_ammessi.indexOf(ROLE) < 0; });
  let html = '<div style="font-size:15px;font-weight:600;margin-bottom:4px">' + esc(etichetta || ('n. ' + id)) + '</div>';
  if (riga.descrizione) html += '<div style="font-size:13px;color:var(--m);margin-bottom:8px;white-space:pre-wrap">' + esc(riga.descrizione) + '</div>';
  html += '<div style="margin:8px 0">Stato: <span class="bx ' + classeStatoMotore(oggetto, stato) + '">' + esc(nomeStatoMotore(oggetto, stato)) + '</span></div>';
  html += '<div style="font-size:12px;margin-bottom:10px;line-height:2">' + htmlPercorsoStatiMotore(oggetto, stato) + '</div>';
  html += pulsanti
    ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' + pulsanti + '</div>'
    : '<div class="al2 i" style="margin-bottom:8px">In questo stato non ci sono azioni per il tuo ruolo.</div>';
  // F14.19 (js/64, sql/72): "↩️ Annulla" la tua ultima azione o "✏️ Chiedi correzione"
  if (typeof segnapostoAnnulla === 'function') html += '<div style="margin-bottom:8px">' + segnapostoAnnulla(oggetto, id) + '</div>';
  if (altre.length) {
    html += '<div style="font-size:12px;color:var(--m);margin-bottom:10px">Le altre azioni di questo stato le fanno: ' +
      altre.map(function(t) { return esc(t.etichetta) + ' (' + t.ruoli_ammessi.map(etichettaRuolo).map(esc).join(', ') + ')'; }).join('; ') + '.</div>';
  }
  html += '<div style="font-size:13px;font-weight:600;margin:12px 0 6px">📜 Registro delle azioni</div>';
  const righe = st.data || [];
  html += righe.length ? righe.map(function(s) {
    return '<div style="font-size:12px;padding:6px 0;border-bottom:0.5px solid var(--bo)">' +
      '<b>' + esc(s.etichetta || s.azione) + '</b>: ' + esc(nomeStatoMotore(oggetto, s.stato_da)) + ' → ' + esc(nomeStatoMotore(oggetto, s.stato_a)) +
      '<div style="color:var(--m)">' + esc(dataOraMotore(s.quando)) + ' · ' + esc(s.utente_nome || 'Database') +
        (s.ruolo_reale ? ' (' + esc(etichettaRuolo(s.ruolo_reale)) + (s.ruolo_usato && s.ruolo_usato !== s.ruolo_reale ? ' come ' + esc(etichettaRuolo(s.ruolo_usato)) : '') + ')' : '') +
        (s.avvisi_creati ? ' · ' + s.avvisi_creati + (s.avvisi_creati === 1 ? ' avviso' : ' avvisi') : '') + '</div>' +
      (s.motivo ? '<div>Motivo: ' + esc(s.motivo) + '</div>' : '') +
    '</div>';
  }).join('') : '<div style="font-size:12px;color:var(--m)">Nessuna azione registrata.</div>';
  ge('ogm-corpo').innerHTML = html;
  if (typeof riempiPulsantiAnnulla === 'function') riempiPulsantiAnnulla(ge('ogm-corpo')).catch(function() {});
}

// ── Avvisi del motore (js/58) ────────────────────────────────────────
function registraTipiAvvisoMotore() {
  if (typeof registraAzioneRapidaAvviso !== 'function') return;
  const tipi = { azione_motore: true };
  MOTORE_AZIONI.transizioni.forEach(function(t) {
    (Array.isArray(t.avvisi) ? t.avvisi : []).forEach(function(a) { if (a && a.tipo) tipi[a.tipo] = true; });
  });
  Object.keys(tipi).forEach(function(tipo) {
    if (MOTORE_AZIONI.tipiAvviso[tipo]) return;
    MOTORE_AZIONI.tipiAvviso[tipo] = true;
    if (typeof TIPI_AVVISO !== 'undefined' && !TIPI_AVVISO[tipo]) TIPI_AVVISO[tipo] = { icona: '⚙️', nome: 'Azione da fare' };
    registraAzioneRapidaAvviso(tipo, {
      etichetta: '⚙️ Apri e agisci',
      puo: function(a) { return !!a.rif_tabella && !!a.rif_id; },
      fai: function(a) { closeM('m-avvisi'); return apriOggettoMotore(a.rif_tabella, a.rif_id); }
    });
  });
}

// Registra subito il tipo predefinito (anche prima di leggere le righe).
(function() {
  if (typeof TIPI_AVVISO !== 'undefined' && !TIPI_AVVISO.azione_motore) TIPI_AVVISO.azione_motore = { icona: '⚙️', nome: 'Azione da fare' };
  if (typeof registraAzioneRapidaAvviso === 'function') {
    MOTORE_AZIONI.tipiAvviso.azione_motore = true;
    registraAzioneRapidaAvviso('azione_motore', {
      etichetta: '⚙️ Apri e agisci',
      puo: function(a) { return !!a.rif_tabella && !!a.rif_id; },
      fai: function(a) { closeM('m-avvisi'); return apriOggettoMotore(a.rif_tabella, a.rif_id); }
    });
  }
})();

// ── Impostazioni > ⚙️ Stati e azioni (solo titolare) ──────────────────
function testoAvvisiTransizione(t) {
  return (Array.isArray(t.avvisi) ? t.avvisi : []).map(function(a) {
    const a1 = String(a.a || '');
    const chi = a1.indexOf('ruolo:') === 0 ? etichettaRuolo(a1.slice(6))
      : (a1 === 'campo:creato_da' ? 'chi l\'ha creato' : a1.slice(6)) + (a.ruolo ? ' (o ' + etichettaRuolo(a.ruolo) + ')' : '');
    const entro = a.entro_valore != null ? ' entro ' + a.entro_valore + ' ' + String(a.entro_unita || 'giorni_lav').replace('giorni_lav', 'gg lav.').replace('ore_lav', 'ore lav.') : '';
    return chi + entro;
  }).join(', ');
}

async function mostraMotoreAzioniImpostazioni() {
  const stato = ge('si-motore-stato'), att = ge('si-motore-attivo');
  if (!stato || !att) return;
  MOTORE_AZIONI.disponibile = null;
  if (!(await caricaMotoreAzioni(true))) {
    stato.style.display = '';
    stato.textContent = 'Il motore di stati e azioni non è ancora attivo (serve aggiornare il database, sql/68).';
    att.style.display = 'none';
    return;
  }
  stato.style.display = 'none';
  att.style.display = '';
  const oggetti = Object.values(MOTORE_AZIONI.oggetti).sort(function(a, b) { return a.id - b.id; });
  ge('si-motore-transizioni').innerHTML = oggetti.map(function(o) {
    const righe = MOTORE_AZIONI.transizioni.filter(function(t) { return t.oggetto === o.oggetto; })
      .sort(function(a, b) {
        const sa = (MOTORE_AZIONI.stati[o.oggetto] || []).findIndex(function(s) { return s.codice === a.stato_da; });
        const sb = (MOTORE_AZIONI.stati[o.oggetto] || []).findIndex(function(s) { return s.codice === b.stato_da; });
        return (sa - sb) || (a.ordine - b.ordine) || (a.id - b.id);
      });
    return '<div style="font-size:12px;font-weight:700;margin:12px 0 6px;color:var(--m)">' + esc(o.nome) + (o.prova ? ' 🧪' : '') + '</div>' +
      '<div style="font-size:12px;margin-bottom:6px;line-height:2">' + htmlPercorsoStatiMotore(o.oggetto, null) + '</div>' +
      '<div style="overflow-x:auto"><table><thead><tr><th>Da → a</th><th>Pulsante</th><th>Chi può</th><th>Motivo</th><th>Controlli</th><th>Avvisi a</th><th>Scadenze</th></tr></thead><tbody>' +
      righe.map(function(t) {
        const scad = [].concat((t.scadenze_apri || []).map(function(c) { return 'apre ' + c; }), (t.scadenze_chiudi || []).map(function(c) { return 'chiude ' + c; }));
        return '<tr><td style="font-size:12px">' + esc(nomeStatoMotore(o.oggetto, t.stato_da)) + ' → ' + esc(nomeStatoMotore(o.oggetto, t.stato_a)) + '</td>' +
          '<td style="font-size:12px">' + esc(t.etichetta) + '</td>' +
          '<td style="font-size:12px">' + t.ruoli_ammessi.map(etichettaRuolo).map(esc).join(', ') + '</td>' +
          '<td style="font-size:12px">' + (t.motivo_obbligatorio ? 'obbligatorio' : '—') + '</td>' +
          '<td style="font-size:12px">' + ((t.controlli || []).map(function(c) { return esc(c.replace(/^controllo_azione_/, '').replace(/_/g, ' ')); }).join(', ') || '—') + '</td>' +
          '<td style="font-size:12px">' + (esc(testoAvvisiTransizione(t)) || '—') + '</td>' +
          '<td style="font-size:12px">' + (esc(scad.join(', ')) || '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }).join('') || '<div style="font-size:12px;color:var(--m)">Nessun oggetto gestito.</div>';
  await disegnaOggettiProvaMotore();
}

async function disegnaOggettiProvaMotore() {
  const box = ge('si-motore-prova');
  if (!box) return;
  const { data, error } = await db.from('motore_oggetti_prova').select('*').order('id', { ascending: false }).limit(20);
  if (error) { box.innerHTML = '<div class="al2 w">Errore: ' + esc(error.message) + '</div>'; return; }
  if (!(data || []).length) { box.innerHTML = '<div style="font-size:12px;color:var(--m)">Nessun oggetto di prova.</div>'; return; }
  box.innerHTML = data.map(function(r) {
    return '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:0.5px solid var(--bo)">' +
      '<div style="font-size:13px"><b>n. ' + Number(r.id) + '</b> ' + esc(r.titolo) +
        ' <span class="bx ' + classeStatoMotore('motore_oggetti_prova', r.stato) + '">' + esc(nomeStatoMotore('motore_oggetti_prova', r.stato)) + '</span>' +
        (r.descrizione ? '' : ' <span style="font-size:11px;color:var(--m)">(senza descrizione)</span>') + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' + htmlPulsantiAzioni('motore_oggetti_prova', r.id, r.stato) +
        (typeof segnapostoAnnulla === 'function' ? segnapostoAnnulla('motore_oggetti_prova', r.id) : '') +
        '<button type="button" class="btn sm" onclick="apriOggettoMotore(\'motore_oggetti_prova\',' + Number(r.id) + ')">Apri</button></div>' +
    '</div>';
  }).join('');
  if (typeof riempiPulsantiAnnulla === 'function') riempiPulsantiAnnulla(box).catch(function() {});
}

async function creaOggettoProvaMotore() {
  const titolo = (ge('mop-titolo').value || '').trim();
  const descr = (ge('mop-descrizione').value || '').trim();
  if (titolo.length < 3) { toast('Scrivi un titolo (almeno 3 caratteri)', 'err'); return; }
  const btn = ge('mop-crea');
  btn.disabled = true;
  try {
    const { data, error } = await db.rpc('crea_oggetto_prova_motore', { p_titolo: titolo, p_descrizione: descr || null });
    if (error) { toast('Errore: ' + error.message, 'err'); return; }
    ge('mop-titolo').value = '';
    ge('mop-descrizione').value = '';
    toast('Oggetto di prova n. ' + data + ' creato: avviso alla segreteria', 'ok');
    await disegnaOggettiProvaMotore();
    if (typeof ricaricaDopoAzioneAvviso === 'function') ricaricaDopoAzioneAvviso().catch(function() {});
  } finally {
    btn.disabled = false;
  }
}
