// ── F18.18 Arrivo merce: documenti riga per riga (sql/145, scelte di Erika
// del 20/11) ──────────────────────────────────────────────────────────────
// Nel riquadro "🛒 Ordini ai fornitori" della commessa (js/27 mette
// .documenti-arrivo[data-ordine-id] sugli ordini arrivati e chiama
// caricaDocumentiArrivoOrdini), per ogni riga: lotto o matricola, DoP (tra i
// certificati della commessa, registra_documento_commessa di sql/29) e
// "omologazione o classe diversa" con la nota (SOLO AVVISO: il blocco della
// posizione arriva con F18.17). Le scrivono capo tecnico, Acquisti, segreteria
// e titolare (registra_documenti_voce_ordine); Acquisti e titolare segnano
// "✓ Visto" l'omologazione diversa (vista_omologazione_voce; l'ingegnere non
// legge le commesse). Cosa tocca a me (js/46): ad Acquisti i documenti da
// sollecitare (ordini arrivati da almeno 2 giorni lavorativi con righe senza
// DoP), ad Acquisti e titolare le omologazioni diverse da vedere.
// Senza sql/145 (documenti_arrivo_attivi) non compare nulla.

let documentiArrivoVerificati = null;
let documentiArrivoAperti = null;  // { commessa, voci: {id: voce} }

async function verificaDocumentiArrivoDisponibili() {
  if (documentiArrivoVerificati !== null) return documentiArrivoVerificati;
  try {
    const { data, error } = await db.rpc('documenti_arrivo_attivi');
    documentiArrivoVerificati = !error && data === true;
  } catch (e) {
    documentiArrivoVerificati = false;
  }
  return documentiArrivoVerificati;
}

const COLONNE_DOCUMENTI_VOCE = 'id, ordine_id, posizione, descrizione, quantita, unita_misura, lotto, dop_documento_id, omologazione_diversa, nota_omologazione, omologazione_vista_il, omologazione_vista_da_nome, documenti_da_nome, documenti_il';

function puoScrivereDocumentiArrivo(commessa) {
  return ['titolare', 'capo_tecnico', 'commerciale', 'segreteria'].includes(ROLE) && !!commessa && !['chiusa', 'annullata'].includes(commessa.stato);
}

function puoVedereOmologazione() {
  return ROLE === 'titolare' || ROLE === 'commerciale';
}

async function caricaDocumentiArrivoOrdini(commessa) {
  const posti = Array.from(document.querySelectorAll('.documenti-arrivo[data-ordine-id]'));
  if (!posti.length || !commessa || !(await verificaDocumentiArrivoDisponibili())) return;
  const ids = posti.map(function(p) { return p.dataset.ordineId; });
  const { data: voci, error } = await db.from('ordini_fornitori_voci').select(COLONNE_DOCUMENTI_VOCE).in('ordine_id', ids).order('posizione');
  if (error) { console.warn('Documenti all\'arrivo:', error.message); return; }
  const docIds = (voci || []).map(function(v) { return v.dop_documento_id; }).filter(Boolean);
  const docs = {};
  if (docIds.length) {
    const r = await db.from('commesse_documenti').select('id, nome_file, storage_path').in('id', docIds);
    (r.data || []).forEach(function(d) { docs[d.id] = d; });
  }
  documentiArrivoAperti = { commessa: commessa, voci: {} };
  (voci || []).forEach(function(v) { documentiArrivoAperti.voci[v.id] = v; });
  const scrive = puoScrivereDocumentiArrivo(commessa);
  posti.forEach(function(p) {
    const proprie = (voci || []).filter(function(v) { return v.ordine_id === p.dataset.ordineId; });
    if (!proprie.length) return;
    const conDop = proprie.filter(function(v) { return v.dop_documento_id; }).length;
    p.innerHTML = '<div style="margin-top:6px;padding:6px 8px;background:var(--bg);border-radius:var(--rs);font-size:12px">' +
      '<div style="font-weight:600;color:' + (conDop === proprie.length ? 'var(--g)' : 'var(--a)') + '">📑 Documenti: ' + conDop + ' su ' + proprie.length + (proprie.length === 1 ? ' riga' : ' righe') + ' con la DoP</div>' +
      proprie.map(function(v) {
        const d = v.dop_documento_id ? docs[v.dop_documento_id] : null;
        const omo = v.omologazione_diversa
          ? '<div style="color:var(--r)">⚠️ Omologazione o classe diversa: ' + esc(v.nota_omologazione || '') +
            (v.omologazione_vista_il ? ' <span style="color:var(--m)">(visto da ' + esc(v.omologazione_vista_da_nome || '—') + ')</span>' : '') + '</div>'
          : '';
        return '<div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start;padding:4px 0;border-top:0.5px solid var(--bo)">' +
          '<div style="min-width:0;overflow-wrap:anywhere">' + esc(String(v.posizione)) + '. ' + esc(v.descrizione || '') +
            '<div style="color:var(--m)">' + (v.lotto ? 'lotto ' + esc(v.lotto) : 'lotto non scritto') + ' · ' +
              (d ? '<a href="#" data-path="' + esc(d.storage_path) + '" onclick="event.preventDefault();apriFileCantiere(\'commesse-documenti\', this.dataset.path)">📄 ' + esc(d.nome_file) + '</a>'
                 : '<span style="color:var(--a);font-weight:600">⚠️ manca la DoP</span>') + '</div>' + omo + '</div>' +
          '<div style="display:flex;gap:4px;flex-wrap:wrap;flex-shrink:0">' +
            (scrive ? '<button type="button" class="btn sm" data-id="' + esc(v.id) + '" onclick="apriDocumentiVoceOrdine(this.dataset.id)">📑 Documenti</button>' : '') +
            (v.omologazione_diversa && !v.omologazione_vista_il && puoVedereOmologazione() ? '<button type="button" class="btn sm p" data-id="' + esc(v.id) + '" onclick="vistaOmologazioneVoce(this.dataset.id)">✓ Visto</button>' : '') +
          '</div></div>';
      }).join('') + '</div>';
  });
}

function apriDocumentiVoceOrdine(id) {
  const v = documentiArrivoAperti && documentiArrivoAperti.voci[id];
  if (!v) return;
  let el = ge('m-documenti-voce');
  if (!el) {
    el = document.createElement('div');
    el.className = 'mbg';
    el.id = 'm-documenti-voce';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="modal" style="max-width:480px"><button class="x" onclick="closeM(\'m-documenti-voce\')">×</button>' +
    '<h3>📑 Documenti della riga</h3><div style="font-size:13px;margin-bottom:8px"><b>' + esc(String(v.posizione)) + '. ' + esc(v.descrizione || '') + '</b></div>' +
    '<div class="f"><label>Matricola o lotto</label><input type="text" id="mdv-lotto" maxlength="100" value="' + esc(v.lotto || '') + '"></div>' +
    '<div class="f"><label>DoP (dichiarazione di prestazione)' + (v.dop_documento_id ? ' — già allegata: scegli un file solo per sostituirla' : '') + '</label><input type="file" id="mdv-dop" accept="application/pdf,.pdf,image/*"></div>' +
    (v.omologazione_diversa ? '<div class="al2 w" style="font-size:12px">Omologazione diversa già segnalata: ' + esc(v.nota_omologazione || '') + '</div>'
      : '<label style="display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:13px;margin-top:4px"><input type="checkbox" id="mdv-omo" onchange="ge(\'mdv-omo-box\').style.display=this.checked?\'\':\'none\'"> Omologazione o classe <b>diversa</b> da quella ordinata</label>' +
        '<div class="f" id="mdv-omo-box" style="display:none;margin-top:6px"><label>Cosa è diverso? *</label><textarea id="mdv-omo-nota" rows="2" maxlength="1000" placeholder="Es. arrivati EN 1125 invece di EN 179"></textarea>' +
        '<div style="font-size:12px;color:var(--m)">Arriva l\'avviso ad Acquisti e al titolare.</div></div>') +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeM(\'m-documenti-voce\')">Annulla</button>' +
    '<button class="btn p" id="mdv-salva" data-id="' + esc(id) + '" onclick="salvaDocumentiVoceOrdine(this.dataset.id)">Salva</button></div></div>';
  openM('m-documenti-voce');
}

async function salvaDocumentiVoceOrdine(id) {
  const a = documentiArrivoAperti;
  const voce = a && a.voci[id];
  if (!voce) return;
  const omo = !!(ge('mdv-omo') && ge('mdv-omo').checked);
  const notaOmo = omo ? v('mdv-omo-nota').trim() : '';
  if (omo && notaOmo.length < 3) { toast('Scrivi cosa è diverso', 'err'); return; }
  const file = ge('mdv-dop') && ge('mdv-dop').files ? ge('mdv-dop').files[0] : null;
  const btn = ge('mdv-salva');
  btn.disabled = true;
  let documentoId = null;
  if (file) {
    if (typeof LIMITE_FILE_COMMESSA !== 'undefined' && file.size > LIMITE_FILE_COMMESSA) { btn.disabled = false; toast('File oltre 50 MB', 'err'); return; }
    const nome = typeof nomeFileSicuroCommessa === 'function' ? nomeFileSicuroCommessa(file.name) : file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = a.commessa.id + '/certificati/' + Date.now() + '_dop_' + nome;
    const up = await db.storage.from('commesse-documenti').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (up.error) { btn.disabled = false; toast('DoP non caricata: ' + up.error.message, 'err'); return; }
    const reg = await db.rpc('registra_documento_commessa', {
      p_commessa_id: a.commessa.id, p_cartella: 'certificati', p_storage_path: path, p_nome_file: file.name,
      p_nota: 'DoP della riga ' + voce.posizione + ' (' + (voce.descrizione || '') + ')'
    });
    if (reg.error) { await db.storage.from('commesse-documenti').remove([path]); btn.disabled = false; toast('DoP non registrata: ' + reg.error.message, 'err'); return; }
    documentoId = reg.data;
  }
  const { error } = await db.rpc('registra_documenti_voce_ordine', {
    p_voce_id: id, p_lotto: v('mdv-lotto').trim() || null, p_documento_id: documentoId,
    p_omologazione_diversa: omo, p_nota: notaOmo || null
  });
  btn.disabled = false;
  if (error) { toast('Non salvato: ' + error.message + (documentoId ? ' (la DoP è comunque tra i certificati)' : ''), 'err'); return; }
  closeM('m-documenti-voce');
  toast(omo ? 'Salvato ✓ Omologazione diversa segnalata ad Acquisti' : 'Documenti della riga salvati ✓', 'ok');
  await caricaDocumentiArrivoOrdini(a.commessa);
  if (documentoId && typeof caricaDocumentiCommessa === 'function') caricaDocumentiCommessa(a.commessa).catch(function() {});
}

async function vistaOmologazioneVoce(id) {
  const nota = prompt('Nota (facoltativa) sull\'omologazione diversa:', '');
  if (nota === null) return;
  const { error } = await db.rpc('vista_omologazione_voce', { p_voce_id: id, p_nota: nota || null });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  toast('Segnato visto ✓', 'ok');
  if (documentiArrivoAperti) await caricaDocumentiArrivoOrdini(documentiArrivoAperti.commessa);
  if (ge('m-omologazioni') && ge('m-omologazioni').classList.contains('on')) await apriOmologazioniDaVedere();
}

// ── Cosa tocca a me (js/46) ──────────────────────────────────────────
// Ordini arrivati da almeno 2 giorni lavorativi con righe senza DoP
async function ordiniDocumentiDaSollecitare() {
  if (!(await verificaDocumentiArrivoDisponibili())) return null;
  const { data, error } = await db.from('ordini_fornitori')
    .select('id, codice, fornitore_ragione_sociale, data_arrivo, commesse(id, codice, stato), ordini_fornitori_voci(id, dop_documento_id)')
    .eq('stato', 'arrivato').limit(1000);
  if (error) throw error;
  const oggi = dataLocaleISO();
  return (data || []).filter(function(o) {
    if (!o.commesse || ['chiusa', 'annullata'].includes(o.commesse.stato) || !o.data_arrivo) return false;
    const mancano = (o.ordini_fornitori_voci || []).some(function(v) { return !v.dop_documento_id; });
    const giorni = giorniLavorativiTra(o.data_arrivo, oggi);
    return mancano && giorni !== null && giorni >= 2;
  });
}

async function omologazioniDaVedere() {
  if (!(await verificaDocumentiArrivoDisponibili())) return null;
  const { data, error } = await db.from('ordini_fornitori_voci')
    .select('id, posizione, descrizione, nota_omologazione, documenti_da_nome, ordini_fornitori!inner(codice, fornitore_ragione_sociale, commesse(id, codice))')
    .eq('omologazione_diversa', true).is('omologazione_vista_il', null).limit(500);
  if (error) throw error;
  return data || [];
}

async function apriFinestraElencoArrivo(id, titolo, corpo) {
  let el = ge(id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'mbg';
    el.id = id;
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="modal" style="max-width:560px"><button class="x" onclick="closeM(\'' + id + '\')">×</button><h3>' + titolo + '</h3>' + corpo + '</div>';
  openM(id);
}

async function apriDocumentiDaSollecitare() {
  let righe;
  try { righe = await ordiniDocumentiDaSollecitare() || []; } catch (e) { toast('Non riesco a leggere gli ordini: ' + (e.message || e), 'err'); return; }
  apriFinestraElencoArrivo('m-documenti-sollecito', '📑 Documenti dei fornitori da sollecitare',
    '<div class="al2 i" style="margin-bottom:10px;font-size:12px">Ordini arrivati da almeno 2 giorni lavorativi con righe senza DoP: chiedile al fornitore, poi allegale dalla commessa (📑 Documenti).</div>' +
    (!righe.length ? '<div class="empty">Niente da sollecitare 🎉</div>' : righe.map(function(o) {
      const mancano = (o.ordini_fornitori_voci || []).filter(function(v) { return !v.dop_documento_id; }).length;
      return '<div class="card" style="margin-bottom:8px"><div style="font-weight:700">' + esc(o.codice) + ' · ' + esc(o.fornitore_ragione_sociale || '') + '</div>' +
        '<div style="font-size:12px;color:var(--m)">Commessa ' + esc((o.commesse && o.commesse.codice) || '') + ' · arrivato il ' + esc(fd(o.data_arrivo)) + ' · ' + mancano + (mancano === 1 ? ' riga senza DoP' : ' righe senza DoP') + '</div>' +
        '<button class="btn sm p" style="margin-top:6px" data-id="' + esc(o.commesse ? o.commesse.id : '') + '" onclick="closeM(\'m-documenti-sollecito\');openCommessaDetail(this.dataset.id)">Apri la commessa</button></div>';
    }).join('')));
}

async function apriOmologazioniDaVedere() {
  let righe;
  try { righe = await omologazioniDaVedere() || []; } catch (e) { toast('Non riesco a leggere le righe: ' + (e.message || e), 'err'); return; }
  apriFinestraElencoArrivo('m-omologazioni', '⚠️ Omologazioni diverse da vedere',
    '<div class="al2 i" style="margin-bottom:10px;font-size:12px">All\'arrivo è stata segnata un\'omologazione o una classe diversa da quella ordinata. Senti il fornitore e l\'ingegnere, poi segna «✓ Visto».</div>' +
    (!righe.length ? '<div class="empty">Niente da vedere 🎉</div>' : righe.map(function(v) {
      const o = v.ordini_fornitori || {};
      return '<div class="card" style="margin-bottom:8px"><div style="font-weight:700">' + esc(o.codice || '') + ' · ' + esc(o.fornitore_ragione_sociale || '') + '</div>' +
        '<div style="font-size:13px">' + esc(String(v.posizione)) + '. ' + esc(v.descrizione || '') + '</div>' +
        '<div style="font-size:12px;color:var(--r)">' + esc(v.nota_omologazione || '') + (v.documenti_da_nome ? ' (segnalato da ' + esc(v.documenti_da_nome) + ')' : '') + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn sm p" data-id="' + esc(v.id) + '" onclick="vistaOmologazioneVoce(this.dataset.id)">✓ Visto</button>' +
        (o.commesse ? '<button class="btn sm" data-id="' + esc(o.commesse.id) + '" onclick="closeM(\'m-omologazioni\');openCommessaDetail(this.dataset.id)">Apri la commessa</button>' : '') + '</div></div>';
    }).join('')));
}
