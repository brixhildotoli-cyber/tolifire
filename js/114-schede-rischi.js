// ── F19.6 Schede rischi per lavorazione (modello del POS), sql/157 ─────────
// Scelte di Erika del 24/11: i testi entrano da un FOGLIO EXCEL (niente
// finestra di scrittura), si parte da una bozza generica da validare, la
// scheda vale per il POS solo "validata dall'RSPP" (nome e data, li segna il
// titolare); SDS dei prodotti più avanti.
// Finestra m-schede-rischi (creata qui): una riga per lavorazione del catalogo
// (sql/75) con l'ultima versione (bozza ⚠️ o validata ✅), "👁 Vedi" (fasi,
// rischi e misure, DPI, attrezzature, sostanze). Solo il titolare:
// "📥 Scarica il foglio" (le ultime versioni, da dare all'RSPP), "📤 Carica il
// foglio" (anteprima di cosa cambia, poi importa_schede_rischi: versione nuova
// solo dove il testo cambia) e "✓ Validata dall'RSPP" sull'ultima versione.
// Si apre da Team e subappalti (#ts-btn-schede-rischi: titolare, capo tecnico,
// segreteria; js/30 chiama mostraBottoneSchedeRischi) e da Impostazioni
// (#si-schede-rischi-card, js/10 chiama mostraSchedeRischiImpostazioni).
// Senza sql/157 (schede_rischi_attive) bottone e riquadro non compaiono.

const SCHEDE_RISCHI = { disponibile: null, schede: [], lavorazioni: [], aperta: null, foglio: null };
const RUOLI_LEGGONO_SCHEDE_RISCHI = ['titolare', 'capo_tecnico', 'segreteria', 'informatico'];
const SEZIONI_SCHEDA_RISCHI = [
  { k: 'fasi', foglio: 'Fase', titolo: 'Fasi di lavoro' },
  { k: 'rischi', foglio: 'Rischio', titolo: 'Rischi e misure' },
  { k: 'dpi', foglio: 'DPI', titolo: 'DPI' },
  { k: 'attrezzature', foglio: 'Attrezzatura', titolo: 'Attrezzature' },
  { k: 'sostanze', foglio: 'Sostanza', titolo: 'Sostanze' },
  { k: 'note', foglio: 'Nota', titolo: 'Note' }
];

async function verificaSchedeRischiDisponibili() {
  if (SCHEDE_RISCHI.disponibile !== null) return SCHEDE_RISCHI.disponibile;
  try {
    const { data, error } = await db.rpc('schede_rischi_attive');
    SCHEDE_RISCHI.disponibile = !error && data === true;
  } catch (e) {
    SCHEDE_RISCHI.disponibile = false;
  }
  return SCHEDE_RISCHI.disponibile;
}

async function mostraBottoneSchedeRischi() {
  const b = ge('ts-btn-schede-rischi');
  if (!b) return;
  b.style.display = RUOLI_LEGGONO_SCHEDE_RISCHI.includes(ROLE) && (await verificaSchedeRischiDisponibili()) ? '' : 'none';
}

async function mostraSchedeRischiImpostazioni() {
  const card = ge('si-schede-rischi-card');
  if (!card) return;
  if (ROLE !== 'titolare') { card.style.display = 'none'; return; }
  const stato = ge('si-schede-rischi-stato');
  if (!(await verificaSchedeRischiDisponibili())) {
    stato.textContent = 'Le schede rischi non sono ancora attive: serve l’aggiornamento del database (sql/157).';
    ge('si-schede-rischi-apri').style.display = 'none';
    return;
  }
  await leggiSchedeRischi();
  const ultime = ultimeSchedeRischi();
  const validate = ultime.filter(function(s) { return s.stato === 'validata'; }).length;
  stato.innerHTML = '<b>' + ultime.length + '</b> lavorazioni con la scheda: <b>' + validate + '</b> validate dall’RSPP, ' + (ultime.length - validate) + ' in bozza.';
  ge('si-schede-rischi-apri').style.display = '';
}

async function leggiSchedeRischi() {
  const [rs, rl] = await Promise.all([
    db.from('sicurezza_lavorazioni').select('id, lavorazione_codice, versione, contenuto, origine, stato, rspp_nome, validata_il, validata_da_nome, caricata_da_nome, caricata_il')
      .order('lavorazione_codice', { ascending: true }).order('versione', { ascending: false }),
    db.from('lavorazioni').select('codice, nome, attiva').order('nome', { ascending: true })
  ]);
  SCHEDE_RISCHI.schede = rs.error ? [] : (rs.data || []);
  SCHEDE_RISCHI.lavorazioni = rl.error ? [] : (rl.data || []);
  return !rs.error;
}

// L'ultima versione di ogni lavorazione (le versioni sono già in ordine decrescente)
function ultimeSchedeRischi() {
  const viste = {};
  return SCHEDE_RISCHI.schede.filter(function(s) {
    if (viste[s.lavorazione_codice]) return false;
    viste[s.lavorazione_codice] = true;
    return true;
  });
}

function nomeLavorazioneRischi(codice) {
  const l = SCHEDE_RISCHI.lavorazioni.find(function(x) { return x.codice === codice; });
  return l ? l.nome : codice;
}

function finestraSchedeRischi(html) {
  let el = ge('m-schede-rischi');
  if (!el) {
    el = document.createElement('div');
    el.className = 'mbg';
    el.id = 'm-schede-rischi';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="modal" style="max-width:720px"><button class="x" onclick="closeM(\'m-schede-rischi\')">×</button>' + html + '</div>';
  if (!el.classList.contains('on')) openM('m-schede-rischi');
}

function bollinoSchedaRischi(s) {
  return s.stato === 'validata'
    ? '<span class="bx bok">✅ Validata dall’RSPP ' + esc(s.rspp_nome || '') + ' il ' + esc(fd(s.validata_il)) + '</span>'
    : '<span class="bx bwarn" style="background:var(--yl, #fef9c3);color:#854d0e">⚠️ Bozza da validare</span>';
}

async function apriSchedeRischi() {
  if (!RUOLI_LEGGONO_SCHEDE_RISCHI.includes(ROLE)) return;
  if (!(await verificaSchedeRischiDisponibili())) { toast('Le schede rischi non sono ancora attive', 'err'); return; }
  await leggiSchedeRischi();
  disegnaSchedeRischi();
}

function disegnaSchedeRischi() {
  const tit = ROLE === 'titolare';
  const ultime = ultimeSchedeRischi();
  const senza = SCHEDE_RISCHI.lavorazioni.filter(function(l) { return !ultime.some(function(s) { return s.lavorazione_codice === l.codice; }); });
  finestraSchedeRischi('<h3>🦺 Schede rischi delle lavorazioni</h3>' +
    '<div style="font-size:12px;color:var(--m);margin-bottom:8px">Fasi, rischi e misure, DPI, attrezzature e sostanze di ogni lavorazione: servono al POS della commessa. ' +
      'Valgono solo quando sono <b>validate dall’RSPP</b>. I testi si cambiano con il foglio Excel: scaricalo, fallo correggere all’RSPP e ricaricalo.</div>' +
    (tit ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
      '<button type="button" class="btn sm" onclick="scaricaFoglioSchedeRischi()">📥 Scarica il foglio</button>' +
      '<button type="button" class="btn sm p" onclick="ge(\'srk-file\').click()">📤 Carica il foglio</button>' +
      '<input type="file" id="srk-file" accept=".xlsx,.xls" style="display:none" onchange="leggiFoglioSchedeRischi(this)"></div>' : '') +
    '<div id="srk-anteprima"></div>' +
    ultime.map(function(s) {
      return '<div style="padding:8px 0;border-top:0.5px solid var(--bo)">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">' +
          '<div style="min-width:0"><b>' + esc(nomeLavorazioneRischi(s.lavorazione_codice)) + '</b> <span style="font-size:12px;color:var(--m)">versione ' + s.versione +
            (s.origine === 'bozza_iniziale' ? ' · bozza di partenza' : ' · caricata da ' + esc(s.caricata_da_nome || '') + ' il ' + esc(fd(String(s.caricata_il).slice(0, 10)))) + '</span></div>' +
          bollinoSchedaRischi(s) +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
          '<button type="button" class="btn sm" data-id="' + esc(s.id) + '" onclick="vediSchedaRischi(this.dataset.id)">👁 Vedi</button>' +
          (tit && s.stato !== 'validata' ? '<button type="button" class="btn sm" data-id="' + esc(s.id) + '" onclick="apriValidaSchedaRischi(this.dataset.id)">✓ Validata dall’RSPP</button>' : '') +
        '</div><div id="srk-vedi-' + esc(s.id) + '"></div></div>';
    }).join('') +
    (senza.length ? '<div style="font-size:12px;color:var(--m);margin-top:8px;border-top:0.5px solid var(--bo);padding-top:8px">Senza scheda: ' +
      esc(senza.map(function(l) { return l.nome; }).join(', ')) + '. Per aggiungerla scrivila nel foglio con il codice della lavorazione.</div>' : ''));
}

function htmlContenutoSchedaRischi(c) {
  c = c || {};
  return SEZIONI_SCHEDA_RISCHI.map(function(sz) {
    if (sz.k === 'note') return c.note ? '<div style="font-size:12px;color:var(--m);margin-top:6px;white-space:pre-wrap">' + esc(c.note) + '</div>' : '';
    const v = c[sz.k] || [];
    if (!v.length) return '';
    return '<div style="margin-top:6px"><div style="font-size:12px;font-weight:700">' + esc(sz.titolo) + '</div>' +
      (sz.k === 'rischi'
        ? '<table style="width:100%;font-size:12px;border-collapse:collapse">' + v.map(function(r) {
            return '<tr style="border-top:0.5px solid var(--bo);vertical-align:top"><td style="width:45%;padding:3px 6px 3px 0">' + esc(r.rischio) + '</td><td style="padding:3px 0;color:var(--m)">' + esc(r.misure || '') + '</td></tr>';
          }).join('') + '</table>'
        : '<ul style="margin:2px 0 0 18px;padding:0;font-size:12px">' + v.map(function(x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>') + '</div>';
  }).join('');
}

function vediSchedaRischi(id) {
  const box = ge('srk-vedi-' + id);
  if (!box) return;
  if (box.innerHTML) { box.innerHTML = ''; return; }
  const s = SCHEDE_RISCHI.schede.find(function(x) { return x.id === id; });
  box.innerHTML = '<div class="card" style="margin-top:6px;padding:10px">' + htmlContenutoSchedaRischi(s && s.contenuto) + '</div>';
}

function apriValidaSchedaRischi(id) {
  const box = ge('srk-vedi-' + id);
  if (!box) return;
  box.innerHTML = '<div class="card" style="margin-top:6px;padding:10px">' +
    '<div style="font-size:12px;margin-bottom:6px">Segna la scheda come controllata e approvata dall’RSPP. Si valida solo l’ultima versione; se poi ricarichi un testo diverso nasce una versione nuova da validare.</div>' +
    '<div class="fr"><div class="f"><label>Nome dell’RSPP *</label><input type="text" id="srk-rspp-' + esc(id) + '" maxlength="120"></div>' +
    '<div class="f"><label>Data della validazione</label><input type="date" id="srk-data-' + esc(id) + '" value="' + esc(dataLocaleISO()) + '" max="' + esc(dataLocaleISO()) + '"></div></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn sm" onclick="this.closest(\'.card\').parentNode.innerHTML=\'\'">Annulla</button>' +
    '<button class="btn sm p" data-id="' + esc(id) + '" onclick="salvaValidaSchedaRischi(this.dataset.id)">✓ Valida</button></div></div>';
}

async function salvaValidaSchedaRischi(id) {
  const nome = v('srk-rspp-' + id).trim();
  if (nome.length < 3) { toast('Scrivi il nome dell’RSPP', 'err'); return; }
  const { error } = await db.rpc('valida_scheda_rischi', { p_id: id, p_rspp_nome: nome, p_data: v('srk-data-' + id) || null });
  if (error) { toast('Non validata: ' + error.message, 'err'); return; }
  toast('Scheda validata ✓', 'ok');
  await leggiSchedeRischi();
  disegnaSchedeRischi();
  mostraSchedeRischiImpostazioni().catch(function() {});
}

// ── Foglio Excel ────────────────────────────────────────────────────────
// Foglio "Schede rischi": Codice lavorazione | Lavorazione | Sezione | Testo | Misure
// (Sezione: Fase, Rischio, DPI, Attrezzatura, Sostanza, Nota; Misure solo per i rischi)
async function scaricaFoglioSchedeRischi() {
  try { await caricaLibreriaExcel(); } catch (e) { toast('Libreria Excel non caricata: ' + e.message, 'err'); return; }
  const righe = [['Codice lavorazione', 'Lavorazione', 'Sezione', 'Testo', 'Misure (solo per i rischi)']];
  ultimeSchedeRischi().forEach(function(s) {
    const c = s.contenuto || {};
    const nome = nomeLavorazioneRischi(s.lavorazione_codice);
    SEZIONI_SCHEDA_RISCHI.forEach(function(sz) {
      if (sz.k === 'note') { if (c.note) righe.push([s.lavorazione_codice, nome, sz.foglio, c.note, '']); return; }
      (c[sz.k] || []).forEach(function(x) {
        righe.push(sz.k === 'rischi' ? [s.lavorazione_codice, nome, sz.foglio, x.rischio, x.misure || ''] : [s.lavorazione_codice, nome, sz.foglio, x, '']);
      });
    });
  });
  const istruzioni = [
    ['Come si compila'],
    ['Una riga per ogni fase, rischio, DPI, attrezzatura o sostanza. La colonna Sezione dice cos\'è: Fase, Rischio, DPI, Attrezzatura, Sostanza, Nota.'],
    ['Per i rischi scrivi le misure nella colonna Misure.'],
    ['Il Codice lavorazione non si cambia (è quello del catalogo). Per una lavorazione nuova usa il suo codice: ' + SCHEDE_RISCHI.lavorazioni.map(function(l) { return l.codice; }).join(', ') + '.'],
    ['Ricaricando il foglio, ogni lavorazione con un testo diverso diventa una versione nuova da validare; quelle uguali restano come sono.'],
    ['Le lavorazioni che non sono nel foglio non cambiano.']
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(righe);
  ws['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 12 }, { wch: 70 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Schede rischi');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(istruzioni), 'Istruzioni');
  XLSX.writeFile(wb, 'Schede_rischi_lavorazioni_' + dataLocaleISO() + '.xlsx');
}

// Righe del foglio → [{ lavorazione, contenuto }]
function schedeDaFoglioRischi(tab) {
  const mappa = {};
  const sezioni = {};
  SEZIONI_SCHEDA_RISCHI.forEach(function(sz) { sezioni[sz.foglio.toLowerCase()] = sz.k; });
  sezioni['fasi'] = 'fasi'; sezioni['rischi'] = 'rischi'; sezioni['attrezzature'] = 'attrezzature'; sezioni['sostanze'] = 'sostanze'; sezioni['note'] = 'note';
  const errori = [];
  tab.slice(1).forEach(function(r, i) {
    const codice = String(r[0] || '').trim().toLowerCase();
    const sezione = sezioni[String(r[2] || '').trim().toLowerCase()];
    const testo = String(r[3] || '').trim();
    if (!codice && !testo) return;
    if (!codice || !sezione) { errori.push('riga ' + (i + 2) + ': ' + (!codice ? 'manca il codice della lavorazione' : 'sezione «' + (r[2] || '') + '» non prevista')); return; }
    if (!testo) return;
    const c = mappa[codice] = mappa[codice] || { fasi: [], rischi: [], dpi: [], attrezzature: [], sostanze: [], note: '' };
    if (sezione === 'rischi') c.rischi.push({ rischio: testo, misure: String(r[4] || '').trim() });
    else if (sezione === 'note') c.note = c.note ? c.note + '\n' + testo : testo;
    else c[sezione].push(testo);
  });
  return { schede: Object.keys(mappa).map(function(k) { return { lavorazione: k, contenuto: mappa[k] }; }), errori: errori };
}

// Confronto senza l'ordine delle chiavi (il database le riordina)
function testoOrdinatoRischi(x) {
  if (Array.isArray(x)) return '[' + x.map(testoOrdinatoRischi).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(function(k) { return JSON.stringify(k) + ':' + testoOrdinatoRischi(x[k]); }).join(',') + '}';
  return JSON.stringify(x === undefined ? null : x);
}
function stessoContenutoRischi(a, b) {
  return testoOrdinatoRischi(a || {}) === testoOrdinatoRischi(b || {});
}

async function leggiFoglioSchedeRischi(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try { await caricaLibreriaExcel(); } catch (e) { toast('Libreria Excel non caricata: ' + e.message, 'err'); return; }
  let letto;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const nome = wb.SheetNames.includes('Schede rischi') ? 'Schede rischi' : wb.SheetNames[0];
    letto = schedeDaFoglioRischi(XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null, raw: false }));
  } catch (e) { toast('Foglio non letto: ' + e.message, 'err'); return; }
  SCHEDE_RISCHI.foglio = letto.schede;
  const ultime = ultimeSchedeRischi();
  const righe = letto.schede.map(function(s) {
    const conosciuta = SCHEDE_RISCHI.lavorazioni.some(function(l) { return l.codice === s.lavorazione; });
    const prima = ultime.find(function(x) { return x.lavorazione_codice === s.lavorazione; });
    const esito = !conosciuta ? '❌ codice sconosciuto: non si carica' : (!prima ? '🆕 scheda nuova (versione 1)'
      : (stessoContenutoRischi(prima.contenuto, s.contenuto) ? '= uguale: resta la versione ' + prima.versione : '✏️ cambia: diventa la versione ' + (prima.versione + 1) + ', da validare'));
    return '<li><b>' + esc(conosciuta ? nomeLavorazioneRischi(s.lavorazione) : s.lavorazione) + '</b>: ' + esc(esito) + '</li>';
  });
  ge('srk-anteprima').innerHTML = '<div class="al2 i" style="font-size:13px;margin-bottom:10px">📤 <b>' + esc(file.name) + '</b>: ' + letto.schede.length + ' lavorazioni' +
    '<ul style="margin:4px 0 0 18px;padding:0">' + righe.join('') + '</ul>' +
    (letto.errori.length ? '<div style="color:var(--r);margin-top:4px">Righe saltate: ' + esc(letto.errori.slice(0, 8).join('; ')) + (letto.errori.length > 8 ? '…' : '') + '</div>' : '') +
    (letto.schede.length ? '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button class="btn sm" onclick="ge(\'srk-anteprima\').innerHTML=\'\'">Annulla</button>' +
      '<button class="btn sm p" id="srk-carica" onclick="caricaFoglioSchedeRischi()">Carica</button></div>' : '') + '</div>';
}

async function caricaFoglioSchedeRischi() {
  if (!SCHEDE_RISCHI.foglio || !SCHEDE_RISCHI.foglio.length) return;
  const btn = ge('srk-carica');
  if (btn) btn.disabled = true;
  const { data, error } = await db.rpc('importa_schede_rischi', { p_schede: SCHEDE_RISCHI.foglio });
  if (btn) btn.disabled = false;
  if (error) { toast('Foglio non caricato: ' + error.message, 'err'); return; }
  const nuove = (data || []).filter(function(x) { return x.esito === 'nuova_versione'; }).length;
  SCHEDE_RISCHI.foglio = null;
  toast('Foglio caricato: ' + nuove + (nuove === 1 ? ' versione nuova' : ' versioni nuove') + ' da validare ✓', 'ok');
  await leggiSchedeRischi();
  disegnaSchedeRischi();
  mostraSchedeRischiImpostazioni().catch(function() {});
}
