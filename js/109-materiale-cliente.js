// ── F18.20 Materiale fornito dal cliente (sql/146, scelte di Erika del 20/11) ──
// Riquadro "👤 Materiale del cliente" nella scheda della commessa (js/26
// chiama caricaMaterialeClienteCommessa, sotto "📦 Materiali"): cosa porta il
// cliente, quanto e quando. Capo tecnico, titolare e rappresentante del
// cliente lo segnano, cambiano la data o lo tolgono (con il motivo); capo
// tecnico e titolare all'arrivo lo controllano: conforme con la DoP (caricata
// tra i certificati della commessa, registra_documento_commessa di sql/29) o
// non conforme con la nota. Le righe entrano anche nell'elenco Materiali
// (js/29 leggiFontiMaterialiCommessa → leggiMaterialeClienteCommessa) e quindi
// nei suggerimenti (js/107) e nei 7 punti della presa in carico (js/108).
// Senza sql/146 (materiale_cliente_attivo) non compare nulla.

let materialeClienteVerificato = null;
let materialeClienteCommessa = null;   // { commessa, righe }

const STATI_MATERIALE_CLIENTE = {
  atteso: { testo: 'Atteso', classe: 'bblue' },
  arrivato: { testo: '✅ Arrivato e controllato', classe: 'bok' },
  non_conforme: { testo: '⚠️ Non conforme', classe: 'berr' },
  tolto: { testo: 'Tolto', classe: 'bgray' }
};

async function verificaMaterialeClienteDisponibile() {
  if (materialeClienteVerificato !== null) return materialeClienteVerificato;
  try {
    const { data, error } = await db.rpc('materiale_cliente_attivo');
    materialeClienteVerificato = !error && data === true;
  } catch (e) {
    materialeClienteVerificato = false;
  }
  return materialeClienteVerificato;
}

// Per js/29: { attivo, righe, errore }
async function leggiMaterialeClienteCommessa(commessaId) {
  if (!(await verificaMaterialeClienteDisponibile())) return { attivo: false, righe: [], errore: '' };
  const { data, error } = await db.from('commesse_materiale_cliente')
    .select('id, descrizione, quantita, unita_misura, arrivo_previsto, stato, data_arrivo, nota_controllo, motivo_tolto, dop_documento_id, segnato_da_nome, segnato_il, controllato_da_nome, controllato_il')
    .eq('commessa_id', commessaId).order('segnato_il', { ascending: true });
  return { attivo: true, righe: error ? [] : (data || []), errore: error ? error.message : '' };
}

function puoSegnareMaterialeCliente() {
  return ['titolare', 'capo_tecnico', 'rappresentante'].includes(ROLE);
}

function puoControllareMaterialeCliente() {
  return ROLE === 'titolare' || ROLE === 'capo_tecnico';
}

async function caricaMaterialeClienteCommessa(commessa) {
  const box = ge('cmd-materiale-cliente');
  if (!box) return;
  box.innerHTML = '';
  if (!commessa || !(await verificaMaterialeClienteDisponibile())) return;
  const letti = await leggiMaterialeClienteCommessa(commessa.id);
  if (typeof commessaApertaId !== 'undefined' && commessaApertaId && commessaApertaId !== commessa.id) return;
  materialeClienteCommessa = { commessa: commessa, righe: letti.righe };
  const aperta = !['chiusa', 'annullata'].includes(commessa.stato);
  const segna = aperta && puoSegnareMaterialeCliente();
  const controlla = aperta && puoControllareMaterialeCliente();
  const visibili = letti.righe.filter(function(r) { return r.stato !== 'tolto'; });
  const tolte = letti.righe.length - visibili.length;
  if (!visibili.length && !segna && !tolte) return;
  box.innerHTML = '<div class="card">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">' +
      '<div style="font-size:14px;font-weight:700">👤 Materiale del cliente (' + visibili.length + ')</div>' +
      (segna ? '<button type="button" class="btn sm p" onclick="apriMaterialeCliente()">+ Materiale del cliente</button>' : '') +
    '</div>' +
    '<div style="font-size:12px;color:var(--m);margin-bottom:6px">Quello che porta il cliente: all\'arrivo il capo tecnico lo controlla e allega la DoP.</div>' +
    (letti.errore ? '<div class="al2 e">Errore: ' + esc(letti.errore) + '</div>' : '') +
    (visibili.length ? visibili.map(function(r) {
      const s = STATI_MATERIALE_CLIENTE[r.stato] || { testo: r.stato, classe: 'bgray' };
      const ritardo = r.stato === 'atteso' && r.arrivo_previsto && r.arrivo_previsto < dataLocaleISO();
      const quando = r.stato === 'atteso'
        ? (r.arrivo_previsto ? (ritardo ? '<span style="color:var(--r);font-weight:700">⚠️ previsto il ' + esc(fd(r.arrivo_previsto)) + ' (in ritardo)</span>' : 'previsto il ' + esc(fd(r.arrivo_previsto))) : '<span style="color:var(--a)">nessuna data</span>')
        : 'arrivato il ' + esc(fd(r.data_arrivo)) + (r.controllato_da_nome ? ', controllato da ' + esc(r.controllato_da_nome) : '');
      return '<div style="padding:8px 0;border-top:0.5px solid var(--bo)">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">' +
          '<div style="min-width:0;font-size:13px"><b>' + esc(r.descrizione) + '</b> · ' + esc(String(Number(r.quantita)).replace('.', ',')) + ' ' + esc(r.unita_misura || '') +
            '<div style="font-size:12px;color:var(--m)">' + quando + '</div>' +
            (r.stato === 'non_conforme' && r.nota_controllo ? '<div style="font-size:12px;color:var(--r)">' + esc(r.nota_controllo) + '</div>' : '') +
            (r.stato === 'arrivato' && r.nota_controllo ? '<div style="font-size:12px;color:var(--m)">' + esc(r.nota_controllo) + '</div>' : '') +
          '</div>' +
          '<span class="bx ' + s.classe + '" style="flex-shrink:0">' + esc(s.testo) + '</span>' +
        '</div>' +
        (r.stato === 'atteso' && (segna || controlla) ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
          (controlla ? '<button type="button" class="btn sm p" data-id="' + esc(r.id) + '" onclick="apriArrivoMaterialeCliente(this.dataset.id)">✅ Arrivato</button>' : '') +
          (segna ? '<button type="button" class="btn sm" data-id="' + esc(r.id) + '" onclick="cambiaDataMaterialeCliente(this.dataset.id)">📅 Cambia data</button>' +
            '<button type="button" class="btn sm" data-id="' + esc(r.id) + '" onclick="togliMaterialeCliente(this.dataset.id)">✕ Togli</button>' : '') +
        '</div>' : '') +
      '</div>';
    }).join('') : '<div class="empty" style="font-size:12px">Nessun materiale del cliente.</div>') +
    (tolte ? '<div style="font-size:11px;color:var(--m);margin-top:6px">' + tolte + (tolte === 1 ? ' riga tolta' : ' righe tolte') + '</div>' : '') +
    '</div>';
}

function finestraMaterialeCliente(html) {
  let el = ge('m-materiale-cliente');
  if (!el) {
    el = document.createElement('div');
    el.className = 'mbg';
    el.id = 'm-materiale-cliente';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="modal" style="max-width:480px"><button class="x" onclick="closeM(\'m-materiale-cliente\')">×</button>' + html + '</div>';
  openM('m-materiale-cliente');
}

function apriMaterialeCliente() {
  finestraMaterialeCliente('<h3>👤 Materiale del cliente</h3>' +
    '<div class="f"><label>Cosa porta il cliente *</label><input type="text" id="mmc-descrizione" maxlength="500" placeholder="Es. 2 porte REI EI 120 già acquistate dal cliente"></div>' +
    '<div class="fr"><div class="f"><label>Quantità *</label><input type="text" id="mmc-quantita" inputmode="decimal" value="1"></div>' +
    '<div class="f"><label>Unità</label><input type="text" id="mmc-um" maxlength="20" placeholder="pz, m, kg…"></div></div>' +
    '<div class="f"><label>Quando arriva</label><input type="date" id="mmc-arrivo"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeM(\'m-materiale-cliente\')">Annulla</button>' +
    '<button class="btn p" id="mmc-salva" onclick="salvaMaterialeCliente()">Salva</button></div>');
}

async function aggiornaDopoMaterialeCliente() {
  const m = materialeClienteCommessa;
  if (!m) return;
  await caricaMaterialeClienteCommessa(m.commessa);
  if (typeof caricaMaterialiCommessa === 'function') await caricaMaterialiCommessa(m.commessa);
  if (typeof caricaSuggerimentoPassoCommessa === 'function') caricaSuggerimentoPassoCommessa(m.commessa).catch(function() {});
}

async function salvaMaterialeCliente() {
  const m = materialeClienteCommessa;
  if (!m) return;
  const q = Number(String(v('mmc-quantita') || '').replace(',', '.'));
  if (!(q > 0)) { toast('La quantità deve essere un numero maggiore di zero', 'err'); return; }
  const btn = ge('mmc-salva');
  btn.disabled = true;
  const { error } = await db.rpc('segna_materiale_cliente', {
    p_commessa_id: m.commessa.id, p_descrizione: v('mmc-descrizione').trim(), p_quantita: q,
    p_unita_misura: v('mmc-um').trim() || null, p_arrivo_previsto: v('mmc-arrivo') || null
  });
  btn.disabled = false;
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  closeM('m-materiale-cliente');
  toast('Materiale del cliente segnato ✓', 'ok');
  await aggiornaDopoMaterialeCliente();
}

async function cambiaDataMaterialeCliente(id) {
  const r = materialeClienteCommessa && materialeClienteCommessa.righe.find(function(x) { return x.id === id; });
  if (!r) return;
  finestraMaterialeCliente('<h3>📅 Quando arriva</h3><div style="font-size:13px;margin-bottom:8px">' + esc(r.descrizione) + '</div>' +
    '<div class="f"><label>Arrivo previsto</label><input type="date" id="mmc-nuova-data" value="' + esc(r.arrivo_previsto || '') + '"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeM(\'m-materiale-cliente\')">Annulla</button>' +
    '<button class="btn p" data-id="' + esc(id) + '" onclick="salvaDataMaterialeCliente(this.dataset.id)">Salva</button></div>');
}

async function salvaDataMaterialeCliente(id) {
  const { error } = await db.rpc('cambia_arrivo_materiale_cliente', { p_id: id, p_arrivo_previsto: v('mmc-nuova-data') || null });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  closeM('m-materiale-cliente');
  toast('Data aggiornata ✓', 'ok');
  await aggiornaDopoMaterialeCliente();
}

async function togliMaterialeCliente(id) {
  const motivo = prompt('Perché togli questo materiale del cliente?');
  if (motivo === null) return;
  const { error } = await db.rpc('togli_materiale_cliente', { p_id: id, p_motivo: motivo });
  if (error) { toast('Non tolto: ' + error.message, 'err'); return; }
  toast('Materiale tolto ✓', 'ok');
  await aggiornaDopoMaterialeCliente();
}

function apriArrivoMaterialeCliente(id) {
  const r = materialeClienteCommessa && materialeClienteCommessa.righe.find(function(x) { return x.id === id; });
  if (!r) return;
  finestraMaterialeCliente('<h3>✅ Arrivo del materiale del cliente</h3><div style="font-size:13px;margin-bottom:8px"><b>' + esc(r.descrizione) + '</b></div>' +
    '<div class="f"><label>Arrivato il *</label><input type="date" id="mmc-data-arrivo" value="' + esc(dataLocaleISO()) + '" max="' + esc(dataLocaleISO()) + '"></div>' +
    '<div class="f"><label>Controllo *</label>' +
      '<label style="display:flex;gap:8px;font-weight:400"><input type="radio" name="mmc-esito" value="si" checked onchange="aggiornaArrivoMaterialeCliente()"> Conforme (allega la DoP)</label>' +
      '<label style="display:flex;gap:8px;font-weight:400"><input type="radio" name="mmc-esito" value="no" onchange="aggiornaArrivoMaterialeCliente()"> Non conforme (scrivi cosa non va)</label></div>' +
    '<div class="f" id="mmc-dop-box"><label>DoP (dichiarazione di prestazione) *</label><input type="file" id="mmc-dop" accept="application/pdf,.pdf,image/*"></div>' +
    '<div class="f"><label id="mmc-nota-label">Nota</label><textarea id="mmc-nota" rows="2" maxlength="1000"></textarea></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeM(\'m-materiale-cliente\')">Annulla</button>' +
    '<button class="btn p" id="mmc-arrivo-salva" data-id="' + esc(id) + '" onclick="salvaArrivoMaterialeCliente(this.dataset.id)">Registra</button></div>');
  aggiornaArrivoMaterialeCliente();
}

function esitoArrivoMaterialeCliente() {
  const s = document.querySelector('input[name="mmc-esito"]:checked');
  return s ? s.value === 'si' : true;
}

function aggiornaArrivoMaterialeCliente() {
  const conforme = esitoArrivoMaterialeCliente();
  ge('mmc-dop-box').style.display = conforme ? '' : 'none';
  ge('mmc-nota-label').textContent = conforme ? 'Nota' : 'Cosa non va *';
}

async function salvaArrivoMaterialeCliente(id) {
  const m = materialeClienteCommessa;
  const r = m && m.righe.find(function(x) { return x.id === id; });
  if (!r) return;
  const conforme = esitoArrivoMaterialeCliente();
  const file = conforme && ge('mmc-dop') && ge('mmc-dop').files ? ge('mmc-dop').files[0] : null;
  if (conforme && !file) { toast('Allega la DoP del materiale', 'err'); return; }
  if (!conforme && v('mmc-nota').trim().length < 3) { toast('Scrivi cosa non va nel materiale', 'err'); return; }
  const btn = ge('mmc-arrivo-salva');
  btn.disabled = true;
  let documentoId = null;
  if (file) {
    if (typeof LIMITE_FILE_COMMESSA !== 'undefined' && file.size > LIMITE_FILE_COMMESSA) { btn.disabled = false; toast('File oltre 50 MB', 'err'); return; }
    const nome = typeof nomeFileSicuroCommessa === 'function' ? nomeFileSicuroCommessa(file.name) : file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = m.commessa.id + '/certificati/' + Date.now() + '_dop_' + nome;
    const up = await db.storage.from('commesse-documenti').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (up.error) { btn.disabled = false; toast('DoP non caricata: ' + up.error.message, 'err'); return; }
    const reg = await db.rpc('registra_documento_commessa', {
      p_commessa_id: m.commessa.id, p_cartella: 'certificati', p_storage_path: path, p_nome_file: file.name,
      p_nota: 'DoP del materiale del cliente: ' + r.descrizione
    });
    if (reg.error) {
      await db.storage.from('commesse-documenti').remove([path]);
      btn.disabled = false; toast('DoP non registrata: ' + reg.error.message, 'err'); return;
    }
    documentoId = reg.data;
  }
  const { error } = await db.rpc('registra_arrivo_materiale_cliente', {
    p_id: id, p_data: v('mmc-data-arrivo'), p_conforme: conforme, p_documento_id: documentoId, p_nota: v('mmc-nota').trim() || null
  });
  btn.disabled = false;
  if (error) { toast('Arrivo non registrato: ' + error.message + (documentoId ? ' (la DoP è comunque tra i certificati)' : ''), 'err'); return; }
  closeM('m-materiale-cliente');
  toast(conforme ? 'Materiale arrivato e controllato ✓ DoP tra i certificati' : 'Materiale segnato non conforme', 'ok');
  await aggiornaDopoMaterialeCliente();
  if (typeof caricaDocumentiCommessa === 'function' && documentoId) caricaDocumentiCommessa(m.commessa).catch(function() {});
}
