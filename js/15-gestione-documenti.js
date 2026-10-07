// ── ELIMINA / MODIFICA RAPIDA ─────────────────────────────────

async function eliminaOdl(id) {
  if(!['titolare','capo_tecnico'].includes(ROLE)) { toast('Non hai i permessi per eliminare', 'err'); return; }
  if(!confirm('Eliminare questo intervento? Le schede collegate verranno marcate come eliminate (recuperabili).')) return;
  await softDel('schede_lavoro').eq('odl_id', id);
  var r = await softDel('ordini_lavoro').eq('id', id);
  if(r.error) { toast('Errore: ' + r.error.message, 'err'); return; }
  toast('Intervento eliminato', 'ok');
  loadOdl();
  loadDash();
}

async function openEditOdl(id) {
  // Apri modal OdL precompilato
  var r = await db.from('ordini_lavoro').select('*,clienti(ragione_sociale)').eq('id', id).single();
  if(r.error) { toast('Errore caricamento', 'err'); return; }
  var o = r.data;
  // Precompila modal
  await loadCS(); await loadUS();
  ge('mcli-odl-id') && (ge('mcli-odl-id').value = id);
  var s = ge('mo1'); if(s) s.value = o.cliente_id;
  var t = ge('mo2'); if(t) t.value = o.tipo;
  var d = ge('mo3'); if(d) d.value = o.data_pianificata||'';
  var f = ge('mo4'); if(f) f.value = o.fascia_oraria||'';
  var tec = ge('mo5'); if(tec) tec.value = o.tecnico_id||'';
  var n = ge('mo6'); if(n) n.value = o.note_per_tecnico||'';
  var nm = ge('mo-materiali'); if(nm) nm.value = o.materiali_da_portare||'';
  var nc = ge('mo-note-cap'); if(nc) nc.value = o.note_capo_tecnico||'';
  if(ge('mo-sopr-id')) ge('mo-sopr-id').value='';
  await loadSediForOdl();
  if(o.sede_id){ var se = ge('mo-sede'); if(se) se.value = o.sede_id; }
  await calcolaPresidiSede(o.cliente_id, o.sede_id, 'mo-presidi-preview');
  // Modalità: capo_tecnico su un da_pianificare → 'assign'; altrimenti 'edit'
  var mode = (ROLE === 'capo_tecnico' && o.stato === 'da_pianificare') ? 'assign' : 'edit';
  setModalMode(mode);
  if(ge('modal-odl-title') && ge('modal-odl-title').firstChild){
    ge('modal-odl-title').firstChild.nodeValue = (mode === 'assign' ? 'Assegna intervento #' : 'Modifica intervento #') + (o.numero||'') + ' ';
  }
  openM('m-odl');
}

async function eliminaCliente(id) {
  if (!['titolare', 'rappresentante'].includes(ROLE)) {
  toast('Non hai i permessi per eliminare clienti', 'err');
  return;
}
  if(!confirm('Eliminare questo cliente? (Soft-delete: il record resta nel DB e può essere ripristinato)')) return;
  var r = await softDel('clienti').eq('id', id);
  if(r.error) { toast('Errore: ' + r.error.message, 'err'); return; }
  toast('Cliente eliminato', 'ok');
  loadCli();
}

async function eliminaPresidio(id) {
  if (ROLE !== 'titolare' && ROLE !== 'capo_tecnico') {
    toast('Non hai i permessi', 'err');
    return;
  }

  if (!confirm('Eliminare questo presidio? (Soft-delete: recuperabile)')) {
    return;
  }

  // Memorizza cliente, sede e tipologia attualmente aperti.
  const cartelleAperte = Array.from(
    document.querySelectorAll('#pcards details[open][data-cartella]')
  ).map(function(el) {
    return el.dataset.cartella;
  });

  const r = await softDel('impianti').eq('id', id);

  if (r.error) {
    toast('Errore: ' + r.error.message, 'err');
    return;
  }

  await loadPresidi();

  // Dopo il ricaricamento riapre le stesse cartelle, se contengono ancora presìdi.
  document.querySelectorAll('#pcards details[data-cartella]').forEach(function(el) {
    if (cartelleAperte.includes(el.dataset.cartella)) {
      el.open = true;
    }
  });

  toast('Presidio eliminato', 'ok');
}


async function eliminaScheda(id) {
  if(ROLE !== 'titolare') { toast('Solo il titolare può eliminare', 'err'); return; }
  if(!confirm('Eliminare questa scheda lavoro? (Soft-delete: recuperabile)')) return;
  var r = await softDel('schede_lavoro').eq('id', id);
  if(r.error) { toast('Errore: ' + r.error.message, 'err'); return; }
  toast('Scheda eliminata', 'ok');
  loadDocs(); loadDash();
}

function aggiornaPianoLabel() {
  var el = ge('piano-mese-label');
  if(!el) return;
  var d = new Date(_pianoAnno, _pianoMese-1, 1);
  el.textContent = d.toLocaleDateString('it-IT', {month:'long', year:'numeric'}).toUpperCase();
}

async function pianoCambiaM(delta) {
  _pianoMese += delta;
  if(_pianoMese > 12) { _pianoMese = 1; _pianoAnno++; }
  if(_pianoMese < 1) { _pianoMese = 12; _pianoAnno--; }
  aggiornaPianoLabel();
  await loadPianificazioneMensile(_pianoAnno, _pianoMese);
}


// ── DOCUMENTI CLIENTE ────────────────────────────────────────
var _pendingFiles = [];

async function loadDocumentiCliente(cliId) {
  if(!cliId) return;
  var el = ge('lista-doc-cli');
  if(!el) return;
  el.innerHTML = '<div class="load">Caricamento...</div>';

  var r = await db.from('documenti_cliente')
    .select('*, utenti(nome,cognome)')
    .eq('cliente_id', cliId)
    .eq('visibile_cliente', true)
    .order('caricato_il', {ascending: false});

  var docs = r.data || [];

  if(!docs.length) {
    el.innerHTML = '<div class="empty">Nessun documento caricato per questo cliente.</div>';
    return;
  }

  el.innerHTML = docs.map(function(d) {
    var icona = {
      'Contratto':'📄','DDT':'📦','Offerta':'💼','Certificato':'🏅',
      'Relazione tecnica':'🔧','Fattura':'💶','Verbale':'📋','Altro':'📎'
    }[d.tipo_documento] || '📎';
    var chi = d.utenti ? d.utenti.nome + ' ' + d.utenti.cognome : '—';
    var data = d.caricato_il ? new Date(d.caricato_il).toLocaleDateString('it-IT') : '—';
    var canDel = ROLE === 'titolare' || ROLE === 'segreteria';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:0.5px solid var(--bo);gap:10px">' +
      '<div style="flex:1">' +
        '<div style="font-size:13px;font-weight:600">' + icona + ' ' + esc(d.nome_file) + '</div>' +
        '<div style="font-size:11px;color:var(--m);margin-top:2px">' + d.tipo_documento + (esc(d.note) ? ' · ' + esc(d.note) : '') + ' · ' + chi + ' · ' + data + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="btn sm p" data-id="'+d.id+'" data-path="'+esc(d.storage_path)+'" data-nome="'+esc(d.nome_file)+'" onclick="scaricaDocumento(this.dataset.id,this.dataset.path,this.dataset.nome)">⬇️ Scarica</button>' +
        (canDel ? '<button class="btn sm" style="color:var(--r)" data-id="'+d.id+'" data-path="'+esc(d.storage_path)+'" onclick="eliminaDocumentoCliente(this.dataset.id,this.dataset.path)">🗑️</button>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function uploadDocumentoCliente(input) {
  _pendingFiles = Array.from(input.files);
  if(!_pendingFiles.length) return;
  input.value = '';
  // Mostra form tipo documento
  ge('form-tipo-doc').style.display = 'block';
}

function annullaUpload() {
  _pendingFiles = [];
  ge('form-tipo-doc').style.display = 'none';
}

async function confermaUploadDoc() {
  if(!_pendingFiles.length || !currentCliId) return;
  var tipo = v('doc-tipo') || 'Altro';
  var note = v('doc-note') || '';
  var btn = document.querySelector('#form-tipo-doc .btn.p');
  if(btn) { btn.disabled = true; btn.textContent = '⏳ Caricamento...'; }

  var errori = 0;
  for(var i = 0; i < _pendingFiles.length; i++) {
    var file = _pendingFiles[i];
    var path = currentCliId + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Upload su Supabase Storage
    var upRes = await db.storage.from('documenti-clienti').upload(path, file);
    if(upRes.error) {
      console.error('Upload error:', upRes.error);
      errori++;
      continue;
    }
    // Salva metadati
    await db.from('documenti_cliente').insert({
      cliente_id: currentCliId,
      nome_file: file.name,
      tipo_documento: tipo,
      storage_path: path,
      dimensione: file.size,
      caricato_da: ME.id,
      note: note || null,
      visibile_cliente: true
    });
  }

  ge('form-tipo-doc').style.display = 'none';
  _pendingFiles = [];
  ge('doc-note').value = '';
  if(btn) { btn.disabled = false; btn.textContent = '⬆️ Carica'; }

  if(errori === 0) toast('✅ ' + (i) + ' file caricati', 'ok');
  else toast('⚠️ ' + errori + ' errori durante il caricamento', 'err');
  await loadDocumentiCliente(currentCliId);
}

async function scaricaDocumento(id, path, nomeFile) {
  var r = await db.storage.from('documenti-clienti').createSignedUrl(path, 3600);
  if(r.error) { toast('Errore download: ' + r.error.message, 'err'); return; }
  // Apri in nuova tab
  var a = document.createElement('a');
  a.href = r.data.signedUrl;
  a.download = nomeFile;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function eliminaDocumentoCliente(id, path) {
  if(!confirm('Eliminare questo documento?')) return;
  await db.storage.from('documenti-clienti').remove([path]);
  var r = await db.from('documenti_cliente').delete().eq('id', id);
  if(r.error) { toast('Errore: ' + r.error.message, 'err'); return; }
  toast('Documento eliminato', 'ok');
  await loadDocumentiCliente(currentCliId);
}

// ── PORTALE CLIENTE (pagina pubblica) ────────────────────────
// La segreteria può condividere un link diretto al cliente
function copiaLinkCliente(cliId) {
  var url = window.location.origin + window.location.pathname + '?portale=' + cliId;
  navigator.clipboard.writeText(url).then(function() {
    toast('✅ Link copiato! Invialo al cliente.', 'ok');
  });
}

async function eliminaDDT(id) {
  if(ROLE !== 'titolare') { toast('Solo il titolare può eliminare', 'err'); return; }
  if(!confirm('Eliminare questo DDT? (Soft-delete: il record resta nel DB e può essere ripristinato. Le righe restano collegate.)')) return;
  var res = await softDel('ddt').eq('id', id);
  if(res.error) { toast('Errore: ' + res.error.message, 'err'); return; }
  toast('DDT eliminato', 'ok');
  loadDocs();
}

function filtraCatalogo() {
  var q = (ge('catalogo-search').value || '').toLowerCase();
  var rows = document.querySelectorAll('#catalogo-content table tbody tr');
  rows.forEach(function(tr) {
    var txt = tr.textContent.toLowerCase();
    tr.style.display = (!q || txt.includes(q)) ? '' : 'none';
  });
}



