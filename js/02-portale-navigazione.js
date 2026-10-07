// Check portale cliente (URL ?portale=cliId — accesso pubblico senza login)
// Variabile globale portale
var _portaleCliId = null;
var _portaleTipo = null;
var _portaleFiles = [];

async function checkPortaleCliente() {
  var params = new URLSearchParams(window.location.search);
  var cliId = params.get('portale');
  if(!cliId) return false;
  _portaleCliId = cliId;

  // Mostra solo il portale
  ge('lp').style.display = 'none';
  var nav = ge('nav'); if(nav) nav.style.display = 'none';
  ge('app').style.display = 'block';
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('on');});
  var pg = ge('pg-portale-cliente'); if(pg) pg.classList.add('on');

  // Carica dati cliente
  var rc = await dbPublic.from('clienti').select('ragione_sociale').eq('id', cliId).single();
  if(rc.data) {
    ge('portale-nome').textContent = rc.data.ragione_sociale;
  }

  // Carica sedi per il form
  var rs = await dbPublic.from('sedi_cliente').select('*').eq('cliente_id', cliId).order('tipo');
  var sediSel = ge('portale-sede');
  if(sediSel && rs.data) {
    sediSel.innerHTML = '<option value="">— Sede principale —</option>' +
      rs.data.map(function(s){
        var addr = (s.tipo||'').toUpperCase() + (s.nome?' — '+s.nome:'') + ': ' + (s.via||'') + ' ' + (s.civico||'') + (s.citta?' ('+s.citta+')':'');
        return '<option value="'+s.id+'">'+addr+'</option>';
      }).join('');
  }

  // Carica documenti
  await portaleCaricaDocs();
  return true;
}

function portaleTab(tab) {
  ['docs','ticket','upload','nuovo'].forEach(function(t) {
    var el = ge('portale-tab-'+t);
    var btn = ge('ptab-'+t);
    if(el) el.style.display = (t===tab) ? 'block' : 'none';
    if(btn) {
      btn.style.color = t===tab ? 'var(--g)' : 'var(--m)';
      btn.style.borderBottomColor = t===tab ? 'var(--g)' : 'transparent';
    }
  });
  if(tab === 'ticket') portaleCaricaTicket();
  if(tab === 'upload') portaleCaricaMieiFile();
}

async function portaleCaricaDocs() {
  var el = ge('portale-lista-docs');
  if(!el) return;
  if(!_portaleCliId) _portaleCliId = new URLSearchParams(window.location.search).get('portale');
  if(!_portaleCliId) { el.innerHTML = '<div class="empty">Errore: ricarica la pagina</div>'; return; }
  el.innerHTML = '<div class="load">Caricamento...</div>';

  // Documenti caricati dalla segreteria
  var rd = await dbPublic.from('documenti_cliente')
    .select('*').eq('cliente_id', _portaleCliId)
    .eq('visibile_cliente', true).order('caricato_il', {ascending:false});

  // DDT del cliente
  var rddt = await dbPublic.from('ddt')
    .select('id,numero,data_emissione,causale')
    .eq('cliente_id', _portaleCliId)
    .order('data_emissione', {ascending:false}).limit(20);

  // Schede lavoro del cliente
  var rsl = await dbPublic.from('schede_lavoro')
    .select('id,numero,data_intervento,esito,stato')
    .eq('cliente_id', _portaleCliId)
    .in('stato',['inviata_cliente','da_fatturare','fatturata'])
    .order('data_intervento', {ascending:false}).limit(20);

  var html = '';

  // Sezione documenti caricati
  var docs = rd.data || [];
  if(docs.length) {
    html += '<div style="font-size:13px;font-weight:700;color:var(--m);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">📁 Documenti</div>';
    html += docs.map(function(d) {
      var icona = {'Contratto':'📄','DDT':'📦','Offerta':'💼','Certificato':'🏅','Relazione tecnica':'🔧','Fattura':'💶','Verbale':'📋','Altro':'📎'}[d.tipo_documento]||'📎';
      var data = d.caricato_il ? new Date(d.caricato_il).toLocaleDateString('it-IT') : '—';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:var(--rs);margin-bottom:8px;gap:10px">' +
        '<div><div style="font-size:13px;font-weight:600">'+icona+' '+esc(d.nome_file)+'</div>' +
        '<div style="font-size:11px;color:var(--m)">'+d.tipo_documento+(esc(d.note)?' · '+esc(d.note):'')+' · '+data+'</div></div>' +
        '<button class="btn sm p" data-path="'+esc(d.storage_path)+'" data-nome="'+esc(d.nome_file)+'" onclick="scaricaPortale(this.dataset.path,this.dataset.nome)">⬇️ Scarica</button>' +
      '</div>';
    }).join('');
  }

  // Sezione DDT
  var ddts = rddt.data || [];
  if(ddts.length) {
    html += '<div style="font-size:13px;font-weight:700;color:var(--m);text-transform:uppercase;letter-spacing:.04em;margin:20px 0 10px">📦 Documenti di trasporto</div>';
    html += ddts.map(function(d) {
      var dt = d.data_emissione ? new Date(d.data_emissione+'T00:00:00').toLocaleDateString('it-IT') : '—';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:var(--rs);margin-bottom:8px;gap:10px">' +
        '<div><div style="font-size:13px;font-weight:600">📦 DDT #'+(d.numero||'—')+'</div>' +
        '<div style="font-size:11px;color:var(--m)">'+dt+(esc(d.causale)?' · '+esc(d.causale):'')+'</div></div>' +
        '<button class="btn sm" data-id="'+d.id+'" onclick="scaricaDDTPortale(this.dataset.id)">🖨️ PDF</button>' +
      '</div>';
    }).join('');
  }

  // Sezione schede lavoro
  var sls = rsl.data || [];
  if(sls.length) {
    html += '<div style="font-size:13px;font-weight:700;color:var(--m);text-transform:uppercase;letter-spacing:.04em;margin:20px 0 10px">🔧 Rapporti di intervento</div>';
    html += sls.map(function(s) {
      var dt = s.data_intervento ? new Date(s.data_intervento+'T00:00:00').toLocaleDateString('it-IT') : '—';
      var esiti = {conforme:'✅ Conforme',conforme_osservazioni:'⚠️ Con osservazioni',non_conforme:'❌ Non conforme'};
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:var(--rs);margin-bottom:8px;gap:10px">' +
        '<div><div style="font-size:13px;font-weight:600">🔧 Rapporto #'+(s.numero||'—')+'</div>' +
        '<div style="font-size:11px;color:var(--m)">'+dt+' · '+(esiti[s.esito]||s.esito||'—')+'</div></div>' +
        '<span style="font-size:11px;color:var(--m)">'+s.stato+'</span>' +
      '</div>';
    }).join('');
  }

  if(!html) html = '<div style="text-align:center;padding:40px;color:var(--m)">Nessun documento disponibile al momento.<br><span style="font-size:12px">Contatta Toli Fire per informazioni.</span></div>';
  el.innerHTML = html;
}


// ── UPLOAD FILE DAL PORTALE CLIENTE ──────────────────────────
var _portaleUploadQueue = [];

function portaleHandleDrop(event) {
  var files = event.dataTransfer.files;
  if(files.length) portaleUploadFiles(files);
}

async function portaleUploadFiles(files) {
  if(!_portaleCliId) _portaleCliId = new URLSearchParams(window.location.search).get('portale');
  if(!_portaleCliId) { alert('Errore: ricarica la pagina'); return; }

  var fileArr = Array.from(files);
  var queue = ge('portale-upload-queue');

  // Mostra progress per ogni file
  queue.innerHTML = fileArr.map(function(f, i) {
    var size = f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+' MB' : (f.size/1024).toFixed(0)+' KB';
    return '<div id="pup-'+i+'" style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:var(--rs);margin-bottom:6px">' +
      '<div style="font-size:20px">'+(f.type.startsWith('video/')? '🎥' : f.type.startsWith('image/')? '🖼️' : f.type.includes('pdf')? '📄' : '📎')+'</div>' +
      '<div style="flex:1"><div style="font-size:13px;font-weight:600">'+f.name+'</div><div style="font-size:11px;color:var(--m)">'+size+'</div></div>' +
      '<div id="pup-stato-'+i+'" style="font-size:12px;color:var(--m)">In attesa...</div>' +
    '</div>';
  }).join('');

  // Carica uno alla volta
  for(var i = 0; i < fileArr.length; i++) {
    var f = fileArr[i];
    var statoEl = ge('pup-stato-'+i);
    if(statoEl) statoEl.textContent = '⏳ Caricamento...';

    var safeName = f.name.replace(/[^a-zA-Z0-9._\-àáèéìíòóùú ]/g, '_');
    var path = _portaleCliId + '/cliente/' + Date.now() + '_' + safeName;

    var up = await dbPublic.storage.from('documenti-clienti').upload(path, f, {
      cacheControl: '3600',
      upsert: false
    });

    if(up.error) {
      if(statoEl) statoEl.innerHTML = '<span style="color:var(--r)">❌ Errore</span>';
      console.error('Upload error:', up.error);
      continue;
    }

    // Salva metadati
    var tipo = f.type.startsWith('video/') ? 'Video' :
               f.type.startsWith('image/') ? 'Foto' :
               f.type.includes('pdf') ? 'PDF' : 'Documento';

    await dbPublic.from('documenti_cliente').insert({
      cliente_id: _portaleCliId,
      nome_file: f.name,
      tipo_documento: tipo,
      storage_path: path,
      dimensione: f.size,
      note: 'Caricato dal cliente',
      visibile_cliente: true
    });

    if(statoEl) statoEl.innerHTML = '<span style="color:var(--g)">✅ Caricato</span>';
  }

  // Ricarica lista dopo 1 secondo
  setTimeout(function() {
    queue.innerHTML = '';
    portaleCaricaMieiFile();
  }, 1500);
}

async function portaleCaricaMieiFile() {
  if(!_portaleCliId) _portaleCliId = new URLSearchParams(window.location.search).get('portale');
  var el = ge('portale-miei-file');
  if(!el) return;
  el.innerHTML = '<div class="load">Caricamento...</div>';

  var r = await dbPublic.from('documenti_cliente')
    .select('*')
    .eq('cliente_id', _portaleCliId)
    .eq('note', 'Caricato dal cliente')
    .order('caricato_il', {ascending: false});

  var docs = r.data || [];

  if(!docs.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--m);font-size:13px">Nessun file caricato ancora</div>';
    return;
  }

  el.innerHTML = docs.map(function(d) {
    var size = d.dimensione ? (d.dimensione > 1024*1024 ? (d.dimensione/1024/1024).toFixed(1)+' MB' : Math.round(d.dimensione/1024)+' KB') : '';
    var data = new Date(d.caricato_il).toLocaleDateString('it-IT');
    var icona = {Video:'🎥', Foto:'🖼️', PDF:'📄', Documento:'📎'}[d.tipo_documento] || '📎';
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:var(--rs);margin-bottom:6px">' +
      '<div style="font-size:20px">'+icona+'</div>' +
      '<div style="flex:1"><div style="font-size:13px;font-weight:600">'+esc(d.nome_file)+'</div>' +
        '<div style="font-size:11px;color:var(--m)">'+size+(size?' · ':'')+data+'</div></div>' +
      '<button class="btn sm p" data-path="'+esc(d.storage_path)+'" data-nome="'+esc(d.nome_file)+'" onclick="scaricaPortale(this.dataset.path,this.dataset.nome)">⬇️</button>' +
    '</div>';
  }).join('');
}

async function portaleCaricaTicket() {
  var el = ge('portale-lista-ticket');
  if(!el) return;
  // Recupera ID dal URL se non in memoria
  if(!_portaleCliId) {
    _portaleCliId = new URLSearchParams(window.location.search).get('portale');
  }
  if(!_portaleCliId) { el.innerHTML = '<div class="empty">Errore: cliente non identificato</div>'; return; }
  el.innerHTML = '<div class="load">Caricamento richieste...</div>';
  var r = await dbPublic.from('ticket_clienti')
    .select('*, ordini_lavoro(data_pianificata,stato,fascia_oraria)')
    .eq('cliente_id', _portaleCliId)
    .order('creato_il', {ascending:false});
  if(r.error) { el.innerHTML = '<div style="color:var(--r);padding:20px">Errore: '+r.error.message+'</div>'; return; }
  var tickets = r.data || [];
  if(!tickets.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--m)">Nessuna richiesta inviata ancora.<br>' +
      '<button class="btn p" style="margin-top:12px" onclick="portaleTab(\"nuovo\")">+ Invia prima richiesta</button></div>';
    return;
  }
  var stati = {aperto:'🟡 In attesa',in_lavorazione:'🔵 In lavorazione',chiuso:'✅ Risolto'};
  var statiCol = {aperto:'var(--a)',in_lavorazione:'var(--b)',chiuso:'var(--g)'};
  var tipi = {segnalazione:'🚨 Segnalazione',intervento:'🔧 Richiesta intervento',preventivo:'💼 Richiesta preventivo'};
  el.innerHTML = tickets.map(function(t) {
    var dt = new Date(t.creato_il).toLocaleDateString('it-IT');
    var odl = t.ordini_lavoro;
    var schedInfo = '';
    if(odl && odl.data_pianificata) {
      var dataInt = new Date(odl.data_pianificata+'T00:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
      schedInfo = '<div style="background:var(--gl);border-left:3px solid var(--g);border-radius:var(--rs);padding:10px;margin-top:10px">' +
        '<div style="font-size:12px;font-weight:600;color:var(--g)">✅ Intervento schedulato</div>' +
        '<div style="font-size:13px;margin-top:3px">📅 ' + dataInt + (odl.fascia_oraria ? ' · ' + odl.fascia_oraria : '') + '</div>' +
      '</div>';
    } else if(t.stato === 'in_lavorazione') {
      schedInfo = '<div style="background:var(--bl);border-left:3px solid var(--b);border-radius:var(--rs);padding:10px;margin-top:10px">' +
        '<div style="font-size:12px;color:var(--b)">🔵 Presa in carico — vi contatteremo a breve per definire la data</div>' +
      '</div>';
    }
    return '<div style="border:0.5px solid var(--bo);border-radius:var(--rs);padding:14px;margin-bottom:12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
        '<div style="flex:1">' +
          '<div style="font-size:14px;font-weight:600">'+esc(t.titolo)+'</div>' +
          '<div style="font-size:12px;color:var(--m);margin-top:3px">'+(tipi[t.tipo]||t.tipo)+' · '+dt+'</div>' +
          (esc(t.descrizione) ? '<div style="font-size:13px;color:var(--t);margin-top:6px">'+esc(t.descrizione)+'</div>' : '') +
          schedInfo +
          (esc(t.note_interne) ? '<div style="font-size:12px;color:var(--m);margin-top:8px;padding:8px;background:var(--bg);border-radius:6px">💬 <em>'+esc(t.note_interne)+'</em></div>' : '') +
        '</div>' +
        '<span style="white-space:nowrap;font-size:12px;font-weight:600;color:'+(statiCol[t.stato]||'var(--m)')+'">'+( stati[t.stato]||t.stato)+'</span>' +
      '</div></div>';
  }).join('');
}

function selPortaleTipo(tipo) {
  _portaleTipo = tipo;
  ['segnalazione','intervento','preventivo'].forEach(function(t) {
    var el = ge('ptipo-'+t);
    if(el) el.style.border = t===tipo ? '2px solid var(--g)' : '2px solid var(--bo)';
    if(el) el.style.background = t===tipo ? 'var(--gl)' : '';
  });
}

function mostraAnteprima(input) {
  _portaleFiles = Array.from(input.files);
  var div = ge('portale-anteprima');
  div.innerHTML = _portaleFiles.map(function(f,i) {
    var isImg = f.type.startsWith('image/');
    if(isImg) {
      var url = URL.createObjectURL(f);
      return '<div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:0.5px solid var(--bo)">' +
        '<img src="'+url+'" style="width:100%;height:100%;object-fit:cover">' +
        '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.5);color:white;font-size:9px;padding:2px 4px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap">'+f.name+'</div></div>';
    }
    return '<div style="width:80px;height:80px;border-radius:8px;border:0.5px solid var(--bo);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11px;color:var(--m)"><div style="font-size:24px">📎</div>'+f.name.substring(0,10)+'</div>';
  }).join('');
}

async function inviaTicketPortale() {
  // Recupera ID dal URL se non in memoria
  if(!_portaleCliId) _portaleCliId = new URLSearchParams(window.location.search).get('portale');
  if(!_portaleCliId) { ge('portale-invio-stato').textContent = '⚠️ Errore: ricarica la pagina'; return; }
  if(!_portaleTipo) { ge('portale-invio-stato').textContent = '⚠️ Seleziona il tipo di richiesta'; return; }
  var titolo = ge('portale-titolo').value.trim();
  if(!titolo) { ge('portale-invio-stato').textContent = '⚠️ Inserisci un oggetto'; return; }

  var btn = ge('btn-invia-ticket');
  btn.disabled = true; btn.textContent = '⏳ Invio...';
  ge('portale-invio-stato').textContent = '';

  // Determina reparto destinatario
  var assegnato = _portaleTipo === 'preventivo' ? 'commerciale' :
                  _portaleTipo === 'intervento' ? 'capo_tecnico' : 'segreteria';

  var r = await dbPublic.from('ticket_clienti').insert({
    cliente_id: _portaleCliId,
    sede_id: ge('portale-sede').value || null,
    tipo: _portaleTipo,
    titolo: titolo,
    descrizione: ge('portale-desc').value || null,
    assegnato_a: assegnato,
    stato: 'aperto',
    priorita: 'normale'
  }).select().single();

  if(r.error) {
    ge('portale-invio-stato').innerHTML = '<div style="color:var(--r);padding:10px;background:var(--rl,#fef2f2);border-radius:var(--rs)">❌ Errore invio: ' + r.error.message + '<br><small>Riprova o contatta direttamente Toli Fire</small></div>';
    btn.disabled=false; btn.textContent='📤 Invia richiesta';
    return;
  }

  // Upload allegati
  for(var i=0; i<_portaleFiles.length; i++) {
    var f = _portaleFiles[i];
    var path = _portaleCliId + '/tickets/' + r.data.id + '/' + f.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    var up = await dbPublic.storage.from('ticket-allegati').upload(path, f);
    if(!up.error) {
      await dbPublic.from('ticket_allegati').insert({ticket_id:r.data.id, nome_file:f.name, storage_path:path});
    }
  }

  // Reset form
  ge('portale-titolo').value=''; ge('portale-desc').value='';
  ge('portale-anteprima').innerHTML=''; _portaleFiles=[];
  selPortaleTipo(null); _portaleTipo=null;
  btn.disabled=false; btn.textContent='📤 Invia richiesta';

  ge('portale-invio-stato').innerHTML = '<div style="background:var(--gl);color:var(--g);padding:12px;border-radius:var(--rs);font-weight:600">✅ Richiesta inviata! Ti risponderemo al più presto.</div>';
  // Ricarica subito i ticket in background
  await portaleCaricaTicket();
  setTimeout(function(){ portaleTab('ticket'); }, 1500);
}

async function scaricaDDTPortale(ddtId) {
  await stampaDDT(ddtId);
}

async function scaricaPortale(path, nomeFile) {
  var r = await dbPublic.storage.from('documenti-clienti').createSignedUrl(path, 3600);
  if(r.error) { alert('Errore nel download. Contatta Toli Fire.'); return; }
  var a = document.createElement('a');
  a.href = r.data.signedUrl;
  a.download = nomeFile;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function toggleNavMobile() {
  const nav = ge('nav');
  const btn = ge('nav-toggle');

  nav.classList.toggle('mobile-open');

  const aperto = nav.classList.contains('mobile-open');
  btn.setAttribute('aria-expanded', aperto ? 'true' : 'false');
  btn.textContent = aperto ? '✕ Chiudi' : '☰ Menu';
}

function chiudiNavMobile() {
  const nav = ge('nav');
  const btn = ge('nav-toggle');

  if (!nav || !btn) return;

  nav.classList.remove('mobile-open');
  btn.setAttribute('aria-expanded', 'false');
  btn.textContent = '☰ Menu';
}

function buildNav() {
  const tabs = NAV[ROLE] || NAV.tecnico;
  const c = ge('ntabs');

  c.innerHTML = '';

  tabs.forEach((t, i) => {
    const b = document.createElement('button');

    b.className = 'nb' + (i === 0 ? ' on' : '');
    b.textContent = t.l;

    b.onclick = () => {
      gotoPage(t.id);
      document.querySelectorAll('.nb').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      chiudiNavMobile();
    };

    c.appendChild(b);
  });
}

// Fine portale

// Pagine accessibili per ruolo
const PAGINE_RUOLO = {
  titolare:       ['dashboard','calendario','piano-mensile','trattative','preventivi-titolare','preventivo-detail','progetti-da-preventivare','presidi','workflow','interventi','clienti','documenti','fatture','catalogo','impostazioni','cliente-detail','progetto-detail','fornitore-detail', 'tecnico','sopralluogo'],
  capo_tecnico:   ['dashboard','calendario','calendario-team','piano-mensile','presidi','interventi','tecnico','clienti','documenti','cliente-detail'],
  segreteria:     ['dashboard','calendario','workflow','presidi','interventi','tecnico','clienti','documenti','fatture','catalogo','cliente-detail', 'fornitore-detail'],
  contabile:      ['dashboard','workflow','fatture','documenti','catalogo'],
  tecnico:        ['dashboard','calendario-tec','tecnico','documenti'],
  commerciale:    ['dashboard','progetti-da-preventivare', 'preventivi', 'fornitori', 'fornitore-detail','preventivo-detail','clienti','documenti','progetto-detail','fatture','catalogo','cliente-detail', 'info'],
  rappresentante: ['dashboard','dashboard-rapp','calendario-appuntamenti','clienti', 'progetti', 'presidi','trattative','preventivi-rapp','cliente-detail','progetto-detail','catalogo', 'info'],
  ingegnere:      ['dashboard','calendario-ingegnere','verifiche-tecniche','documenti', 'certificati-ingegnere','progetto-detail','cliente-detail','info'],
};

function canAccessPage(id) {
  if(!ROLE) return false;
  var allowed = PAGINE_RUOLO[ROLE] || [];
  return allowed.indexOf(id) !== -1;
}


function loadInfo() {
  document.querySelectorAll('.guida-ruolo').forEach(function(guida) {
    guida.style.display = 'none';
  });

  const guidaAttiva = ge('guida-' + ROLE);

  if (guidaAttiva) {
    guidaAttiva.style.display = 'block';
    ge('info-titolo').textContent =
      guidaAttiva.getAttribute('data-titolo') || 'Informazioni';
  } else {
    ge('info-titolo').textContent = 'Informazioni';
    ge('info-contenuto').innerHTML =
      '<div class="al2">Nessuna guida disponibile per questo ruolo.</div>';
  }
}

function gotoPage(id){
  // Controllo accessi
  if(!canAccessPage(id)) {
    toast('Non hai accesso a questa sezione', 'err');
    return;
  }
  // Chiudi tutti i modal aperti
  document.querySelectorAll('.mbg.on').forEach(function(m){ m.classList.remove('on'); });
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  const pg=ge('pg-'+id);if(pg)pg.classList.add('on');
  if(id==='interventi')loadOdl();
  if(id==='clienti')loadCli();
  if(id==='documenti'){loadDocs();var b=ge('btn-nuovo-ddt');if(b)b.style.display='';}
  if(id==='presidi')loadPresidi();
  if(id==='impostazioni')loadTeam();
  if(id==='workflow')loadWorkflow();
  if(id==='calendario-appuntamenti'){loadAppuntamentiCommerciali();}
  if(id==='calendario')loadCalendario();
  if(id==='calendario-tec'){loadCalendarioTecnico();}
  if(id==='calendario-team'){loadCalendarioTeam();}
  if(id==='piano-mensile'){var n=new Date();_pianoAnno=n.getFullYear();_pianoMese=n.getMonth()+1;aggiornaPianoLabel();loadPianificazioneMensile(_pianoAnno,_pianoMese);}
  if(id==='dashboard-rapp')loadDashRappresentante();
  if(id==='preventivi-rapp')loadPreventiviRappresentante();
  if(id==='calendario-ingegnere')loadCalendarioIngegnere();
  if(id === 'certificati-ingegnere') {loadCertificatiIngegnere();}
  if(id==='verifiche-tecniche')loadVerificheTecniche();
  if(id==='progetti'){loadPaginaProgetti();}
  if(id==='progetti-da-preventivare') loadProgettiDaPreventivare();
  if(id==='preventivi') loadPreventivi();
  if(id==='preventivi-titolare') loadPreventiviTitolare();
  if(id==='trattative')loadTrattative();
  if(id==='catalogo'){loadPaginaCatalogo();var _ba=ge('btn-add-prodotto');if(_ba)_ba.style.display=(ROLE==='titolare')?'':'none';var _bi=ge('btn-import-excel');if(_bi)_bi.style.display=(ROLE==='titolare')?'':'none';}
  if(id==='fatture'){loadFatture();}
  if(id==='tecnico'){loadOdlTecnico(); loadStoricoInterventiTecnico();}
  if(id==='fornitori')loadFornitori();
  if(id==='preventivazione') loadPreventivazione();
  if(id==='sopralluogo' && ROLE!=='rappresentante' && ROLE!=='titolare'){toast('Accesso non consentito','err');return;}
  if(id === 'info') loadInfo();
  window.scrollTo(0,0);
}

async function caricaAvvisoProgettiDaPreventivareCommerciale() {
  if (ROLE !== 'commerciale') return;

  const box = ge('com-avviso-progetti');
  if (!box) return;

  const chiaveLetti = `progetti_da_preventivare_letti_${ME.id}`;

  let idGiaLetti = [];

  try {
    const salvati = JSON.parse(
      localStorage.getItem(chiaveLetti) || '[]'
    );

    idGiaLetti = Array.isArray(salvati) ? salvati : [];
  } catch {
    idGiaLetti = [];
  }

  const giaLetti = new Set(idGiaLetti);

  const { data: progetti, error } = await db
    .from('progetti_tecnici')
    .select('id')
    .in('stato', [
      'inviato_a_commerciale',
      'pronto_per_preventivo', 
      'in_preventivazione'
    ]);

  if (error) {
    console.error(
      'Errore lettura notifiche progetti:',
      error.message
    );
    box.innerHTML = '';
    return;
  }

    // Mostra solo i progetti che NON hanno ancora un preventivo reale collegato.
  const idsProgetti = (data || []).map(function(progetto) {
    return progetto.id;
  });

  let preventiviCollegati = [];

  if (idsProgetti.length) {
    const { data: righePreventivi, error: errorePreventivi } = await db
      .from('preventivi')
      .select('progetto_tecnico_id')
      .in('progetto_tecnico_id', idsProgetti);

    if (errorePreventivi) {
      box.innerHTML =
        '<div class="al2 e">Errore controllo preventivi: ' +
        esc(errorePreventivi.message) +
        '</div>';
      return;
    }

    preventiviCollegati = righePreventivi || [];
  }

  const progettiConPreventivo = new Set(
    preventiviCollegati
      .map(function(preventivo) {
        return preventivo.progetto_tecnico_id;
      })
      .filter(Boolean)
  );

  const progettiDaPreventivare = (data || []).filter(function(progetto) {
    return !progettiConPreventivo.has(progetto.id);
  });


  const nuovi = (progetti || []).filter(function(progetto) {
    return !giaLetti.has(progetto.id);
  });

  if (!nuovi.length) {
    box.innerHTML = '';
    return;
  }

  const testo = nuovi.length === 1
    ? 'Hai 1 nuovo progetto da preventivare'
    : `Hai ${nuovi.length} nuovi progetti da preventivare`;

  box.innerHTML = `
    <button
      class="rap-primary"
      style="background:#b91c1c;margin:14px 0"
      onclick="apriProgettiDaPreventivareDaDashboard()"
    >
      <span class="ico">📐</span>

      <span class="body">
        <span class="title">${testo}</span>
        <span class="sub">
          Il rappresentante ha inviato un progetto tecnico da controllare.
        </span>
      </span>

      <span class="chev">›</span>
    </button>
  `;
}

async function apriProgettiDaPreventivareDaDashboard() {
  if (ROLE !== 'commerciale') return;

  const box = ge('com-avviso-progetti');

  if (box) {
    box.innerHTML = '';
  }

  const chiaveLetti = `progetti_da_preventivare_letti_${ME.id}`;

  const { data: progetti, error } = await db
    .from('progetti_tecnici')
    .select('id')
    .in('stato', [
      'inviato_a_commerciale',
      'pronto_per_preventivo'
    ]);

  if (!error) {
    let idGiaLetti = [];

    try {
      const salvati = JSON.parse(
        localStorage.getItem(chiaveLetti) || '[]'
      );

      idGiaLetti = Array.isArray(salvati) ? salvati : [];
    } catch {
      idGiaLetti = [];
    }

    const tuttiGliId = [
      ...new Set([
        ...idGiaLetti,
        ...(progetti || []).map(function(progetto) {
          return progetto.id;
        })
      ])
    ];

    localStorage.setItem(
      chiaveLetti,
      JSON.stringify(tuttiGliId)
    );
  }

  gotoPage('progetti-da-preventivare');
}

async function loadDashCommerciale() {
  const ora = new Date().getHours();
  const saluto = ora < 12
    ? 'Buongiorno'
    : ora < 18
      ? 'Buon pomeriggio'
      : 'Buonasera';

  ge('com-greet-nome').textContent =
    saluto + ', ' + (ME.nome || '');

  ge('com-greet-data').textContent =
    new Date().toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

  const [
    progettiRicevutiRes,
    progettiLavorazioneRes,
    fornitoriRes,
    clientiRes
  ] = await Promise.all([
    db
      .from('progetti_tecnici')
      .select('id,titolo,tipologia,creato_il,clienti(ragione_sociale)')
      .in('stato', [
  'inviato_a_commerciale',
  'pronto_per_preventivo'
])
      .order('creato_il', { ascending: false }),

    db
      .from('progetti_tecnici')
      .select('id,titolo,tipologia,aggiornato_il,clienti(ragione_sociale)')
      .eq('stato', 'in_preventivazione')
      .order('aggiornato_il', { ascending: false }),

    db
      .from('fornitori')
      .select('id', { count: 'exact', head: true })
      .eq('attivo', true),

    db
      .from('clienti')
      .select('id', { count: 'exact', head: true })
      .eq('stato', 'attivo')
      .is('eliminato_il', null)
  ]);

  const progetti = progettiRicevutiRes.data || [];
  const progettiInLavorazione = progettiLavorazioneRes.data || [];

  ge('com-k-da-preventivare').textContent = progetti.length;
  ge('com-k-in-lavorazione').textContent = progettiInLavorazione.length;
  ge('com-k-fornitori').textContent = fornitoriRes.count || 0;
  ge('com-k-clienti').textContent = clientiRes.count || 0;

  const lista = ge('com-progetti-ricevuti');

  if (!progetti.length) {
    lista.innerHTML = `
      <div class="empty">
        ✅ Nessun progetto in attesa di preventivo.
      </div>
    `;
  } else {
    lista.innerHTML = progetti.slice(0, 5).map(function(progetto) {
      const data = progetto.creato_il
        ? new Date(progetto.creato_il).toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '—';

      return `
        <div style="padding:11px 0;border-bottom:1px solid var(--bo);display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div>
            <div style="font-size:13px;font-weight:600">
              ${esc(progetto.titolo || 'Progetto tecnico')}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${esc(progetto.clienti?.ragione_sociale || 'Cliente non indicato')}
              · ${esc(progetto.tipologia || 'Tipologia non indicata')}
              · ricevuto il ${data}
            </div>
          </div>

          <button
            class="btn sm info"
            onclick="gotoPage('progetti-da-preventivare')"
          >
            Gestisci
          </button>
        </div>
      `;
    }).join('');
  }

  const listaLavorazione = ge('com-progetti-lavorazione');

  if (!progettiInLavorazione.length) {
    listaLavorazione.innerHTML = `
      <div class="empty">
        Nessuna preventivazione attualmente in corso.
      </div>
    `;
  } else {
    listaLavorazione.innerHTML =
      progettiInLavorazione.slice(0, 5).map(function(progetto) {
        return `
          <div style="padding:11px 0;border-bottom:1px solid var(--bo);display:flex;justify-content:space-between;gap:10px;align-items:center">
            <div>
              <div style="font-size:13px;font-weight:600">
                ${esc(progetto.titolo || 'Progetto tecnico')}
              </div>

              <div style="font-size:12px;color:var(--m);margin-top:3px">
                ${esc(progetto.clienti?.ragione_sociale || 'Cliente non indicato')}
                · ${esc(progetto.tipologia || 'Tipologia non indicata')}
              </div>
            </div>

            <button
              class="btn sm info"
              onclick="gotoPage('preventivi')"
            >
              Continua
            </button>
          </div>
        `;
      }).join('');
  }

  await renderCalendarioCommerciale();
  await caricaAvvisoProgettiDaPreventivareCommerciale();
}
var comCalAnno = new Date().getFullYear();
var comCalMese = new Date().getMonth();

function calCommercialePrev() {
  comCalMese--;

  if (comCalMese < 0) {
    comCalMese = 11;
    comCalAnno--;
  }

  renderCalendarioCommerciale();
}

function calCommercialeNext() {
  comCalMese++;

  if (comCalMese > 11) {
    comCalMese = 0;
    comCalAnno++;
  }

  renderCalendarioCommerciale();
}

async function renderCalendarioCommerciale() {
  const box = ge('com-mini-calendario');
  const titolo = ge('com-cal-title');

  if (!box) return;

  const mesi = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile',
    'Maggio', 'Giugno', 'Luglio', 'Agosto',
    'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];

  titolo.textContent = mesi[comCalMese] + ' ' + comCalAnno;
  box.innerHTML = '<div class="load">Caricamento calendario...</div>';

  const inizio = dataLocaleIng(new Date(comCalAnno, comCalMese, 1));
  const fine = dataLocaleIng(new Date(comCalAnno, comCalMese + 1, 0));

  const { data, error } = await db
    .from('calendario_personale')
    .select('id,titolo,data,ora_inizio,ora_fine,tipo,descrizione')
    .eq('utente_id', ME.id)
    .gte('data', inizio)
    .lte('data', fine)
    .order('data')
    .order('ora_inizio');

  if (error) {
    box.innerHTML = `
      <div style="grid-column:1/-1;padding:12px;color:var(--r)">
        Errore calendario: ${esc(error.message)}
      </div>
    `;
    return;
  }

  calIngDati = data || [];

  const perData = {};

  calIngDati.forEach(function(attivita) {
    if (!perData[attivita.data]) {
      perData[attivita.data] = [];
    }

    perData[attivita.data].push(attivita);
  });

  const giorniSettimana = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  let html = giorniSettimana.map(function(giorno) {
    return `<div class="cal-head">${giorno}</div>`;
  }).join('');

  const primoGiorno = new Date(comCalAnno, comCalMese, 1);
  const spaziIniziali = (primoGiorno.getDay() + 6) % 7;
  const giorniDelMese = new Date(comCalAnno, comCalMese + 1, 0).getDate();
  const oggi = dataLocaleIng(new Date());

  for (let i = 0; i < spaziIniziali; i++) {
    html += '<div class="cal-day other-month"></div>';
  }

  for (let giorno = 1; giorno <= giorniDelMese; giorno++) {
    const dataCorrente = dataLocaleIng(new Date(comCalAnno, comCalMese, giorno));
    const attivitaGiorno = perData[dataCorrente] || [];

    const anteprima = attivitaGiorno.slice(0, 2).map(function(attivita) {
      const ora = attivita.ora_inizio
        ? attivita.ora_inizio.slice(0, 5) + ' '
        : '';

      return `
        <div class="cal-ev ord"
          onclick="event.stopPropagation();modificaAttivitaIngegnere('${attivita.id}')">
          ${ora}${esc(attivita.titolo)}
        </div>
      `;
    }).join('');

    const altre = attivitaGiorno.length > 2
      ? `<div class="cal-ev ord">+${attivitaGiorno.length - 2} altre</div>`
      : '';

    html += `
      <div class="cal-day ${dataCorrente === oggi ? 'today' : ''}"
        onclick="apriNuovaAttivitaCommerciale('${dataCorrente}')">

        <div class="cal-day-n">${giorno}</div>
        ${anteprima}
        ${altre}
      </div>
    `;
  }

  box.innerHTML = html;
}

