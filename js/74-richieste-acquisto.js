// ── RICHIESTE DI ACQUISTO DEL CAPO TECNICO AD ACQUISTI (richiesta di Erika del 13/11, sql/268) ──
// Pagina "🛒 Richieste di acquisto" (pg-richieste-acquisto) per capo tecnico,
// Acquisti (commerciale), titolare (informatico) e segreteria (sola lettura).
// Il capo tecnico chiede materiale (magazzino, indumenti, qualsiasi cosa):
// oggetto, note, righe con descrizione, quantità, unità, note. NIENTE prezzi
// e NIENTE fornitore (decisione di Erika). Acquisti la prende in carico, la
// può correggere, scarica il PDF (motore unico dei PDF di js/00, modello
// 'richiesta_acquisto'), la manda lui al fornitore fuori dal gestionale e
// segna "📤 Inviata al fornitore", poi "📦 Arrivato": a ogni passo l'avviso
// al capo tecnico (database, sql/268). Finestra m-richiesta-acquisto (id
// rqa-). Senza sql/268: "non ancora attiva", nessun errore (una chiamata 404).

const RICH_ACQ = { attive: null, elenco: [], filtro: 'aperte', aperta: null, righe: [] };
const RUOLI_RICHIESTE_ACQUISTO = ['titolare', 'commerciale', 'capo_tecnico', 'segreteria'];
const STATI_RICHIESTA_ACQUISTO = {
  inviata_acquisti: { nome: 'Da prendere in carico', classe: 'bwarn' },
  presa_in_carico: { nome: 'Presa in carico da Acquisti', classe: 'bblue' },
  inviata_fornitore: { nome: 'Inviata al fornitore', classe: 'bblue' },
  arrivata: { nome: 'Arrivato', classe: 'bok' },
  annullata: { nome: 'Annullata', classe: 'bgray' }
};
const UNITA_RICHIESTA_ACQUISTO = ['pz', 'paia', 'conf', 'kg', 'lt', 'm', 'm²', 'rotoli', 'scatole'];

async function verificaRichiesteAcquistoDisponibili() {
  if (RICH_ACQ.attive !== null) return RICH_ACQ.attive;
  try {
    const { data, error } = await db.rpc('richieste_acquisto_attive');
    RICH_ACQ.attive = !error && data === true;
  } catch (e) { RICH_ACQ.attive = false; }
  return RICH_ACQ.attive;
}

const puoCreareRichiestaAcquisto = function() { return ROLE === 'capo_tecnico' || ROLE === 'titolare'; };
const eAcquistiRichiesta = function() { return ROLE === 'commerciale' || ROLE === 'titolare'; };

function puoCorreggereRichiestaAcquisto(r) {
  if (!r) return puoCreareRichiestaAcquisto();
  if (ROLE === 'capo_tecnico') return r.stato === 'inviata_acquisti';
  if (eAcquistiRichiesta()) return r.stato === 'inviata_acquisti' || r.stato === 'presa_in_carico';
  return false;
}

function quantitaRichiestaTesto(q) {
  const n = Number(q);
  if (!isFinite(n)) return String(q || '');
  return n.toLocaleString('it-IT', { maximumFractionDigits: 3 });
}

function dataOraRichiesta(t) {
  return t ? new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

// ── Pagina ────────────────────────────────────────────────────────────
async function loadRichiesteAcquisto() {
  const box = ge('rqa-elenco');
  if (!box) return;
  const nuova = ge('rqa-nuova-btn');
  if (nuova) nuova.style.display = puoCreareRichiestaAcquisto() ? '' : 'none';
  if (!(await verificaRichiesteAcquistoDisponibili())) {
    box.innerHTML = '<div class="al2 i">Le richieste di acquisto non sono ancora attive: si attivano dopo l’aggiornamento del database (sql/268).</div>';
    if (nuova) nuova.style.display = 'none';
    return;
  }
  box.innerHTML = '<div class="load">Caricamento richieste...</div>';
  let q = db.from('richieste_acquisto').select('*').order('creata_il', { ascending: false }).limit(300);
  if (RICH_ACQ.filtro === 'aperte') q = q.in('stato', ['inviata_acquisti', 'presa_in_carico', 'inviata_fornitore']);
  const { data, error } = await q;
  if (error) { box.innerHTML = '<div class="al2 e">Errore caricamento: ' + esc(error.message) + '</div>'; return; }
  RICH_ACQ.elenco = data || [];
  ['aperte', 'tutte'].forEach(function(f) { const b = ge('rqa-filtro-' + f); if (b) b.classList.toggle('p', RICH_ACQ.filtro === f); });
  if (!RICH_ACQ.elenco.length) {
    box.innerHTML = '<div class="empty">' + (RICH_ACQ.filtro === 'aperte' ? 'Nessuna richiesta di acquisto aperta.' : 'Nessuna richiesta di acquisto.') + '</div>';
    return;
  }
  box.innerHTML = RICH_ACQ.elenco.map(function(r) {
    const st = STATI_RICHIESTA_ACQUISTO[r.stato] || { nome: r.stato, classe: 'bgray' };
    const righe = Array.isArray(r.righe) ? r.righe : [];
    const anteprima = righe.slice(0, 3).map(function(x) { return quantitaRichiestaTesto(x.quantita) + ' ' + (x.unita || '') + ' ' + x.descrizione; }).join(' · ') + (righe.length > 3 ? ' · …' : '');
    return '<div class="card" style="margin-top:10px;cursor:pointer" onclick="apriRichiestaAcquisto(\'' + esc(r.id) + '\')">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="min-width:0"><div style="font-size:15px;font-weight:700">' + esc(r.codice) + ' · ' + esc(r.oggetto) + '</div>' +
        '<div style="font-size:12px;color:var(--m);margin-top:3px">Da ' + esc(r.richiesta_da_nome || '—') + ' il ' + esc(dataOraRichiesta(r.creata_il)) + ' · ' + righe.length + (righe.length === 1 ? ' riga' : ' righe') + '</div></div>' +
        '<span class="bx ' + st.classe + '">' + esc(st.nome) + '</span>' +
      '</div>' +
      '<div style="font-size:13px;margin-top:8px;color:var(--t)">' + esc(anteprima) + '</div>' +
    '</div>';
  }).join('');
}

function filtraRichiesteAcquisto(f) { RICH_ACQ.filtro = f; loadRichiesteAcquisto(); }

// ── Finestra ──────────────────────────────────────────────────────────
function nuovaRichiestaAcquisto() {
  RICH_ACQ.aperta = null;
  RICH_ACQ.righe = [{ descrizione: '', quantita: '', unita: 'pz', note: '' }];
  disegnaRichiestaAcquisto();
  openM('m-richiesta-acquisto');
}

async function apriRichiestaAcquisto(id) {
  if (!(await verificaRichiesteAcquistoDisponibili())) { toast('Le richieste di acquisto non sono ancora attive', 'err'); return; }
  const { data, error } = await db.from('richieste_acquisto').select('*').eq('id', id).maybeSingle();
  if (error || !data) { toast('Richiesta di acquisto non trovata' + (error ? ': ' + error.message : ''), 'err'); return; }
  RICH_ACQ.aperta = data;
  RICH_ACQ.righe = (Array.isArray(data.righe) ? data.righe : []).map(function(x) {
    return { descrizione: x.descrizione || '', quantita: x.quantita == null ? '' : quantitaRichiestaTesto(x.quantita), unita: x.unita || '', note: x.note || '' };
  });
  disegnaRichiestaAcquisto();
  openM('m-richiesta-acquisto');
}

function leggiRigheFinestraRichiesta() {
  const righe = [];
  document.querySelectorAll('#rqa-righe [data-rqa-riga]').forEach(function(tr) {
    righe.push({
      descrizione: tr.querySelector('.rqa-desc').value,
      quantita: tr.querySelector('.rqa-q').value,
      unita: tr.querySelector('.rqa-u').value,
      note: tr.querySelector('.rqa-n').value
    });
  });
  return righe;
}

function htmlRigheRichiestaAcquisto(modifica) {
  if (!modifica) {
    return '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;color:var(--m)"><th style="padding:4px">Cosa serve</th><th style="padding:4px">Q.tà</th><th style="padding:4px">Unità</th><th style="padding:4px">Note</th></tr></thead><tbody>' +
      RICH_ACQ.righe.map(function(x) {
        return '<tr style="border-top:1px solid var(--bo)"><td style="padding:5px 4px">' + esc(x.descrizione) + '</td><td style="padding:5px 4px;white-space:nowrap">' + esc(x.quantita) + '</td><td style="padding:5px 4px">' + esc(x.unita || '') + '</td><td style="padding:5px 4px">' + esc(x.note || '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  return RICH_ACQ.righe.map(function(x, i) {
    return '<div data-rqa-riga="' + i + '" style="border:1px solid var(--bo);border-radius:8px;padding:8px;margin-bottom:8px">' +
      '<div class="f" style="margin:0 0 6px"><label>Cosa serve *</label><input class="rqa-desc" maxlength="300" value="' + esc(x.descrizione) + '" placeholder="Es. giacca invernale alta visibilità taglia L"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
        '<div class="f" style="margin:0;flex:0 0 90px"><label>Quantità *</label><input class="rqa-q" inputmode="decimal" value="' + esc(x.quantita) + '"></div>' +
        '<div class="f" style="margin:0;flex:0 0 100px"><label>Unità</label><input class="rqa-u" maxlength="20" list="rqa-unita" value="' + esc(x.unita || '') + '"></div>' +
        '<div class="f" style="margin:0;flex:1 1 160px"><label>Note</label><input class="rqa-n" maxlength="300" value="' + esc(x.note || '') + '"></div>' +
        '<button type="button" class="btn sm" style="color:var(--r)" onclick="togliRigaRichiestaAcquisto(' + i + ')" title="Togli la riga">✖</button>' +
      '</div></div>';
  }).join('') + '<datalist id="rqa-unita">' + UNITA_RICHIESTA_ACQUISTO.map(function(u) { return '<option value="' + esc(u) + '">'; }).join('') + '</datalist>';
}

function aggiungiRigaRichiestaAcquisto() {
  RICH_ACQ.righe = leggiRigheFinestraRichiesta();
  RICH_ACQ.righe.push({ descrizione: '', quantita: '', unita: 'pz', note: '' });
  ge('rqa-righe').innerHTML = htmlRigheRichiestaAcquisto(true);
  const ultime = document.querySelectorAll('#rqa-righe .rqa-desc');
  if (ultime.length) ultime[ultime.length - 1].focus();
}

function togliRigaRichiestaAcquisto(i) {
  RICH_ACQ.righe = leggiRigheFinestraRichiesta();
  RICH_ACQ.righe.splice(i, 1);
  if (!RICH_ACQ.righe.length) RICH_ACQ.righe.push({ descrizione: '', quantita: '', unita: 'pz', note: '' });
  ge('rqa-righe').innerHTML = htmlRigheRichiestaAcquisto(true);
}

function disegnaRichiestaAcquisto() {
  const r = RICH_ACQ.aperta;
  const modifica = puoCorreggereRichiestaAcquisto(r);
  const st = r ? (STATI_RICHIESTA_ACQUISTO[r.stato] || { nome: r.stato, classe: 'bgray' }) : null;
  ge('rqa-titolo').textContent = r ? '🛒 ' + r.codice : '🛒 Nuova richiesta di acquisto';
  ge('rqa-stato').innerHTML = r ? '<span class="bx ' + st.classe + '">' + esc(st.nome) + '</span>' : '';
  ge('rqa-oggetto').value = r ? r.oggetto : '';
  ge('rqa-note').value = r ? (r.note || '') : '';
  ge('rqa-oggetto').disabled = !modifica;
  ge('rqa-note').disabled = !modifica;
  ge('rqa-righe').innerHTML = htmlRigheRichiestaAcquisto(modifica);
  ge('rqa-aggiungi').style.display = modifica ? '' : 'none';

  // Storico: chi e quando
  const passi = [];
  if (r) {
    passi.push('📝 Richiesta da ' + (r.richiesta_da_nome || '—') + ' il ' + dataOraRichiesta(r.creata_il));
    if (r.presa_il) passi.push('🙋 Presa in carico da ' + (r.presa_da_nome || '—') + ' il ' + dataOraRichiesta(r.presa_il));
    if (r.inviata_il) passi.push('📤 Inviata al fornitore da ' + (r.inviata_da_nome || '—') + ' il ' + dataOraRichiesta(r.inviata_il) + (r.nota_invio ? ' · ' + r.nota_invio : ''));
    if (r.arrivata_il) passi.push('📦 Arrivato, segnato da ' + (r.arrivata_da_nome || '—') + ' il ' + dataOraRichiesta(r.arrivata_il));
    if (r.annullata_il) passi.push('✖ Annullata da ' + (r.annullata_da_nome || '—') + ' il ' + dataOraRichiesta(r.annullata_il) + ' · ' + (r.motivo_annullamento || ''));
    if (r.aggiornata_il && r.aggiornata_da_nome && r.aggiornata_il !== r.creata_il && !passi.some(function(p) { return p.indexOf(dataOraRichiesta(r.aggiornata_il)) >= 0; })) {
      passi.push('✏️ Ultima modifica di ' + r.aggiornata_da_nome + ' il ' + dataOraRichiesta(r.aggiornata_il));
    }
  }
  ge('rqa-storico').innerHTML = passi.map(function(p) { return '<div>' + esc(p) + '</div>'; }).join('');

  // Bottoni secondo ruolo e stato
  const b = [];
  if (!r) b.push('<button type="button" class="btn p" onclick="salvaRichiestaAcquisto()">📤 Invia ad Acquisti</button>');
  else {
    if (modifica) b.push('<button type="button" class="btn p" onclick="salvaRichiestaAcquisto()">💾 Salva le modifiche</button>');
    if (eAcquistiRichiesta() && r.stato === 'inviata_acquisti') b.push('<button type="button" class="btn p" onclick="passoRichiestaAcquisto(\'prendi\')">🙋 Prendi in carico</button>');
    if (eAcquistiRichiesta() && r.stato !== 'annullata') b.push('<button type="button" class="btn" onclick="pdfRichiestaAcquisto()">📄 Scarica il PDF</button>');
    if (eAcquistiRichiesta() && (r.stato === 'inviata_acquisti' || r.stato === 'presa_in_carico')) b.push('<button type="button" class="btn p" onclick="passoRichiestaAcquisto(\'inviata\')">📤 Segna inviata al fornitore</button>');
    if ((eAcquistiRichiesta() || ROLE === 'capo_tecnico') && r.stato === 'inviata_fornitore') b.push('<button type="button" class="btn p" onclick="passoRichiestaAcquisto(\'arrivata\')">📦 Segna arrivato</button>');
    const annullaCt = ROLE === 'capo_tecnico' && r.stato === 'inviata_acquisti';
    const annullaAcq = eAcquistiRichiesta() && (r.stato === 'inviata_acquisti' || r.stato === 'presa_in_carico');
    if (annullaCt || annullaAcq) b.push('<button type="button" class="btn" style="color:var(--r)" onclick="passoRichiestaAcquisto(\'annulla\')">✖ Annulla la richiesta</button>');
  }
  ge('rqa-bottoni').innerHTML = '<button type="button" class="btn" onclick="closeM(\'m-richiesta-acquisto\')">Chiudi</button>' + b.join('');
  const nota = ge('rqa-nota');
  nota.textContent = !r ? 'Acquisti riceve l’avviso e la prende in carico. Ti arriva un avviso quando la invia al fornitore e quando il materiale è arrivato.'
    : (ROLE === 'capo_tecnico' && r.stato === 'presa_in_carico' ? 'Acquisti l’ha presa in carico: per cambiarla chiedi a loro.'
    : (ROLE === 'segreteria' ? 'Sola lettura.' : ''));
}

async function salvaRichiestaAcquisto() {
  const r = RICH_ACQ.aperta;
  const righe = leggiRigheFinestraRichiesta().filter(function(x) { return String(x.descrizione).trim() || String(x.quantita).trim(); });
  const oggetto = ge('rqa-oggetto').value.trim();
  if (!oggetto) { toast('Scrivi l’oggetto della richiesta', 'err'); return; }
  if (!righe.length) { toast('Scrivi almeno una riga del materiale', 'err'); return; }
  for (let i = 0; i < righe.length; i++) {
    const n = Number(String(righe[i].quantita).trim().replace(',', '.'));
    if (!String(righe[i].descrizione).trim()) { toast('Riga ' + (i + 1) + ': scrivi cosa serve', 'err'); return; }
    if (!(n > 0)) { toast('Riga ' + (i + 1) + ': la quantità deve essere un numero maggiore di zero', 'err'); return; }
    righe[i].quantita = String(righe[i].quantita).trim().replace(',', '.');
  }
  const { data, error } = await db.rpc('salva_richiesta_acquisto', {
    p_id: r ? r.id : null, p_oggetto: oggetto, p_note: ge('rqa-note').value, p_righe: righe
  });
  if (error) { toast('Richiesta non salvata: ' + error.message, 'err'); return; }
  toast(r ? 'Richiesta di acquisto aggiornata' : 'Richiesta inviata ad Acquisti', 'ok');
  await apriRichiestaAcquisto(data || r.id);
  if (typeof loadRichiesteAcquisto === 'function') loadRichiesteAcquisto();
}

async function passoRichiestaAcquisto(passo) {
  const r = RICH_ACQ.aperta;
  if (!r) return;
  let rpc, arg = { p_id: r.id }, ok;
  if (passo === 'prendi') { rpc = 'prendi_in_carico_richiesta_acquisto'; ok = 'Richiesta presa in carico'; }
  else if (passo === 'inviata') {
    const nota = prompt('Inviata al fornitore. Nota facoltativa per il capo tecnico (es. consegna prevista):', '');
    if (nota === null) return;
    rpc = 'segna_richiesta_acquisto_inviata'; arg.p_nota = nota; ok = 'Segnata inviata al fornitore: il capo tecnico riceve l’avviso';
  } else if (passo === 'arrivata') {
    if (!confirm('Segnare il materiale come arrivato?')) return;
    rpc = 'segna_richiesta_acquisto_arrivata'; ok = 'Segnato arrivato';
  } else if (passo === 'annulla') {
    const motivo = prompt('Motivo dell’annullamento (obbligatorio):', '');
    if (motivo === null) return;
    if (motivo.trim().length < 3) { toast('Scrivi il motivo (almeno 3 caratteri)', 'err'); return; }
    rpc = 'annulla_richiesta_acquisto'; arg.p_motivo = motivo; ok = 'Richiesta annullata';
  } else return;
  const { error } = await db.rpc(rpc, arg);
  if (error) { toast('Non riuscito: ' + error.message, 'err'); return; }
  toast(ok, 'ok');
  await apriRichiestaAcquisto(r.id);
  loadRichiesteAcquisto();
}

// ── PDF (motore unico, js/00) ─────────────────────────────────────────
registraModelloPdf('richiesta_acquisto', {
  nome: 'Richiesta di acquisto',
  titolo: 'RICHIESTA DI ACQUISTO',
  testi: {
    premessa: { etichetta: 'Richiesta', testo: 'Si richiede la fornitura del materiale elencato. Per ogni riga indicare disponibilità e tempi di consegna.' }
  },
  sezioni: [
    { tipo: 'campi', titolo: 'Dati della richiesta', da: 'campi' },
    { tipo: 'testo', chiave: 'premessa' },
    { tipo: 'tabella', titolo: 'Materiale richiesto', colonne: ['N.', 'Descrizione', 'Quantità', 'Unità', 'Note'], da: 'righe', vuota: 'Nessuna riga.' },
    { tipo: 'campi', titolo: 'Note', da: 'note' }
  ],
  leggiDati: async function(contesto) {
    const r = contesto.richiesta;
    return {
      campi: [['Numero:', r.codice], ['Oggetto:', r.oggetto], ['Data richiesta:', new Date(r.creata_il).toLocaleDateString('it-IT')]],
      righe: (r.righe || []).map(function(x, i) { return [i + 1, x.descrizione, quantitaRichiestaTesto(x.quantita), x.unita || '', x.note || '']; }),
      note: r.note ? [['Note:', r.note]] : []
    };
  },
  nomeFile: function(dati) { return 'Richiesta_acquisto_' + ((dati.campi && dati.campi[0] && dati.campi[0][1]) || ''); }
});

async function pdfRichiestaAcquisto() {
  const r = RICH_ACQ.aperta;
  if (!r) return;
  try {
    await generaPdfDaModello('richiesta_acquisto', { richiesta: r }, { scarica: true });
  } catch (e) {
    toast('PDF non generato: ' + (e.message || e), 'err');
  }
}

// ── Avvisi, indirizzo e "Cosa tocca a me" ─────────────────────────────
if (typeof TIPI_AVVISO !== 'undefined') {
  TIPI_AVVISO.richiesta_acquisto = { icona: '🛒', nome: 'Richiesta di acquisto' };
  TIPI_AVVISO.richiesta_acquisto_inviata = { icona: '📤', nome: 'Richiesta di acquisto inviata al fornitore' };
  TIPI_AVVISO.richiesta_acquisto_arrivata = { icona: '📦', nome: 'Materiale arrivato' };
  TIPI_AVVISO.richiesta_acquisto_annullata = { icona: '✖', nome: 'Richiesta di acquisto annullata' };
}
if (typeof OGGETTO_DA_TABELLA_AVVISO !== 'undefined') OGGETTO_DA_TABELLA_AVVISO.richieste_acquisto = 'richiesta_acquisto';
if (typeof NOME_RECORD_AVVISO !== 'undefined') NOME_RECORD_AVVISO.richieste_acquisto = 'la richiesta di acquisto';
if (typeof SCHEDE_CON_INDIRIZZO !== 'undefined') {
  SCHEDE_CON_INDIRIZZO.richiesta_acquisto = {
    nome: 'la richiesta di acquisto', pagina: 'richieste-acquisto', finestra: true, idFinestra: 'm-richiesta-acquisto',
    apri: async function(id) { gotoPage('richieste-acquisto'); await apriRichiestaAcquisto(id); }
  };
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'richieste-acquisto-acquisti', ruoli: ['commerciale'], icona: '🛒',
    titolo: 'Richieste di acquisto da gestire', priorita: 30,
    vai: { pagina: 'richieste-acquisto' },
    conta: async function() {
      if (!(await verificaRichiesteAcquistoDisponibili())) return null;
      return numeroTAM(contaTAM('richieste_acquisto').in('stato', ['inviata_acquisti', 'presa_in_carico']), 'richieste di acquisto');
    }
  });
}
