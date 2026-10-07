// ── FATTURE — lista read-only (Fase 2 modulo Fatture) ─────────
async function loadFatture(){
  var el = ge('fat-body');
  if(!el) return;
  el.innerHTML = '<div class="load">Caricamento...</div>';

  var fStato = v('fat-fil-stato');
  var fTipo  = v('fat-fil-tipo');
  var fSearch = (v('fat-fil-search')||'').toLowerCase().trim();

  var q = db.from('fatture')
    .select('id,numero,anno,tipo_documento,data_emissione,totale,stato,stato_pagamento,snap_ragione_sociale,creato_il,clienti(ragione_sociale)')
    .is('eliminato_il', null);
  if(fStato) q = q.eq('stato', fStato);
  if(fTipo)  q = q.eq('tipo_documento', fTipo);
  q = q.order('creato_il', {ascending:false}).limit(200);

  var r = await q;
  if(r.error){
    el.innerHTML = '<div class="al2 e">Errore: '+esc(r.error.message)+'</div>';
    return;
  }
  var data = r.data || [];

  // Filtro testo client-side (cerca in cliente o numero)
  if(fSearch){
    data = data.filter(function(f){
      var cli = ((f.snap_ragione_sociale || f.clienti?.ragione_sociale) || '').toLowerCase();
      var num = (f.numero||'').toLowerCase();
      return cli.indexOf(fSearch) !== -1 || num.indexOf(fSearch) !== -1;
    });
  }

  var cntEl = ge('fat-count');
  if(cntEl) cntEl.textContent = data.length + (data.length === 1 ? ' fattura' : ' fatture');

  if(!data.length){
    el.innerHTML = '<div class="empty">Nessuna fattura corrispondente ai filtri</div>';
    return;
  }

  el.innerHTML = '<div class="tw"><table>' +
    '<thead><tr>' +
      '<th>Numero</th><th>Cliente</th><th>Tipo</th><th>Data emiss.</th>' +
      '<th style="text-align:right">Totale €</th><th>Stato doc.</th><th>Pagamento</th>' +
    '</tr></thead><tbody>' +
    data.map(function(f){
      var cli = f.snap_ragione_sociale || f.clienti?.ragione_sociale || '—';
      var numCell = f.numero
        ? '<span style="font-family:monospace">'+esc(f.numero)+'</span>'
        : '<span style="color:var(--m);font-style:italic">(da emettere)</span>';
      var tipoLbl = f.tipo_documento === 'nota_credito'
        ? '<span class="bx bpur">🔁 Nota credito</span>'
        : '<span class="bx bblue">📄 Fattura</span>';
      var totale = (f.totale||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
      return '<tr>' +
        '<td>'+numCell+'</td>' +
        '<td>'+esc(cli)+'</td>' +
        '<td>'+tipoLbl+'</td>' +
        '<td>'+fd(f.data_emissione)+'</td>' +
        '<td style="text-align:right;font-weight:600">€ '+totale+'</td>' +
        '<td>'+bs(f.stato)+'</td>' +
        '<td>'+bsPag(f.stato_pagamento)+'</td>' +
      '</tr>';
    }).join('') + '</tbody></table></div>';
}

// ── WORKFLOW ──────────────────────────────────────────────────
async function loadWorkflow(){
  // Personalizza UI per contabile
  if(ROLE === 'contabile') {
    var title = ge('wf-title'); if(title) title.textContent = 'Fatturazione';
    var sub = ge('wf-subtitle'); if(sub) sub.textContent = 'Schede da fatturare e già fatturate';
    ['wf-tab-f','wf-tab-a','wf-tab-i'].forEach(function(id){var el=ge(id);if(el)el.style.display='none';});
    var td = ge('wf-tab-d'); if(td){td.classList.add('on');}
    // Rimuovi 'on' da tutti i tab visibili
    ['wf-tab-f','wf-tab-a','wf-tab-i'].forEach(function(id){var el=ge(id);if(el)el.classList.remove('on');});
    document.querySelectorAll('#pg-workflow .tc').forEach(function(t){t.classList.remove('on');});
    var wfd = ge('wf-d'); if(wfd) wfd.classList.add('on');
  }
  const stati=['firmata','approvata','inviata_cliente','da_fatturare','fatturata'];
  const ids=['list-f','list-a','list-i','list-d','list-t'];
  const cnts=['cnt-f','cnt-a','cnt-i','cnt-d'];
  for(let i=0;i<stati.length;i++){
    const {data}=await db.from('schede_lavoro').select('*,clienti(ragione_sociale),utenti!schede_lavoro_tecnico_id_fkey(nome,cognome),ordini_lavoro(tipo)').eq('stato',stati[i]).is('eliminato_il',null).order('aggiornato_il',{ascending:false});
    if(cnts[i]&&ge(cnts[i]))ge(cnts[i]).textContent=data?.length?`(${data.length})`:'';
    const el=ge(ids[i]);if(!el)continue;
    if(!data?.length){el.innerHTML='<div class="empty">Nessuna scheda in questo stato</div>';continue;}
    el.innerHTML=data.map(s=>`<div class="card" style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div><div style="font-size:14px;font-weight:600">${esc(s.clienti?.ragione_sociale||'—')}</div>
        <div style="font-size:12px;color:var(--m);margin-top:2px">${esc(s.utenti?s.utenti.nome+' '+s.utenti.cognome:'—')} · ${fd(s.data_intervento)} · ${tl(s.ordini_lavoro?.tipo||'')}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${bs(s.stato)} ${s.esito?be(s.esito):''} ${s.intervento_straordinario_richiesto?'<span class="bx berr">⚠ Straord.</span>':''}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn sm p" onclick="openScheda('${s.id}')">📄 Gestisci</button>${ROLE==='titolare'?`<button class="btn sm" style="color:var(--r)" onclick="eliminaScheda('${s.id}')">🗑️</button>`:''}
        ${wfBtns(s)}
      </div>
    </div>`).join('');
  }
}

function wfBtns(s){
  // Mostra azioni rapide solo titolare
  var qa = ge('dash-quick-actions');
  if(qa) qa.style.display = ROLE==='titolare' ? 'block' : 'none';
  // Mostra/nascondi bottoni dashboard in base al ruolo
  var bp = ge('dash-btn-presidi');
  var bw = ge('dash-btn-workflow');
  var bo = ge('dash-btn-odl');
  if(bp) bp.style.display = canAccessPage('presidi') ? '' : 'none';
  if(bw) bw.style.display = canAccessPage('workflow') ? '' : 'none';
  if(bo) bo.style.display = (ROLE==='titolare'||ROLE==='capo_tecnico'||ROLE==='segreteria') ? '' : 'none';
  const cs=ROLE==='segreteria'||ROLE==='titolare'||ROLE==='capo_tecnico';
  const cc=ROLE==='contabile'||ROLE==='titolare';
  let b='';
  if(s.stato==='firmata'&&cs){b+=`<button class="btn sm p" onclick="chgStato('${s.id}','approvata')">✅ Approva</button><button class="btn sm warn" onclick="chgStato('${s.id}','bozza')">↩ Rimanda</button>`;}
  if(s.stato==='approvata'&&cs){b+=`<button class="btn sm p" onclick="chgStato('${s.id}','inviata_cliente')">📧 Inviata al cliente</button><button class="btn sm info" onclick="chgStato('${s.id}','da_fatturare')">💜 Passa a fatturazione</button>`;}
  if(s.stato==='inviata_cliente'&&cs){b+=`<button class="btn sm info" onclick="chgStato('${s.id}','da_fatturare')">💜 Passa a fatturazione</button>`;}
  if(s.stato==='da_fatturare'&&cc){b+=`<button class="btn sm p" onclick="chgStato('${s.id}','fatturata')">✅ Fatturata</button>`;}
  return b;
}

async function chgStato(id,stato){
  const {error}=await db.from('schede_lavoro').update({stato}).eq('id',id);
  if(error){toast('Errore: '+error.message,'err');return;}
  closeM('m-scheda');toast('Stato aggiornato ✓','ok');loadWorkflow();loadDash();
}

async function openScheda(id){
  const {data:s}=await db.from('schede_lavoro').select('*,clienti(ragione_sociale),utenti!schede_lavoro_tecnico_id_fkey(nome,cognome),ordini_lavoro(tipo)').eq('id',id).single();
  if(!s)return;
  ge('ms-title').textContent='Scheda — '+s.clienti?.ragione_sociale;
  ge('ms-info').innerHTML=ir('Cliente',s.clienti?.ragione_sociale)+ir('Tecnico',s.utenti?s.utenti.nome+' '+s.utenti.cognome:null)+ir('Data',fd(s.data_intervento))+ir('Tipo',tl(s.ordini_lavoro?.tipo||''))+ir('Esito',s.esito?.replace(/_/g,' '))+ir('Firmatario',s.nome_firmatario);
  ge('ms-lavori').textContent=esc(s.lavori_eseguiti)||'—';
  // Mostra impossibilitato se presente
  var impDiv = ge('ms-impossibilitato');
  if(impDiv) {
    if(s.impossibilitato) {
      impDiv.style.display='block';
      impDiv.innerHTML='<div style="background:var(--rl,#fef2f2);border-left:3px solid var(--r);padding:10px;border-radius:var(--rs);margin-bottom:10px"><strong>⚠️ Intervento non completato</strong><br><span style="font-size:13px">'+( s.motivo_impossibilitato||'—')+'</span></div>';
    } else { impDiv.style.display='none'; }
  }
  // Note interne (relazione tecnica) - visibili a capo_tecnico e titolare
  var noteIntDiv = ge('ms-note-interne');
  if(noteIntDiv && esc(s.note_interne) && (ROLE==='capo_tecnico'||ROLE==='titolare'||ROLE==='segreteria')) {
    noteIntDiv.style.display='block';
    noteIntDiv.innerHTML='<div style="font-size:12px;font-weight:600;color:var(--m);text-transform:uppercase;margin-bottom:6px">📋 Relazione tecnica</div><div style="background:var(--bg);padding:12px;border-radius:var(--rs);font-size:13px;white-space:pre-wrap">'+esc(s.note_interne)+'</div>';
  } else if(noteIntDiv) { noteIntDiv.style.display='none'; }
  ge('ms-anomalie').textContent=esc(s.anomalie_rilevate)||'Nessuna anomalia';
  ge('ms-wf').innerHTML=WFS.map(st=>`<div class="wf-step ${s.stato===st?'active':WFS.indexOf(s.stato)>WFS.indexOf(st)?'done':'pending'}"><div class="wf-dot ${s.stato===st?'active':WFS.indexOf(s.stato)>WFS.indexOf(st)?'done':'pending'}"></div><span>${WFL[st]}</span></div>`).join('');
  ge('ms-actions').innerHTML=wfBtns(s);
  openM('m-scheda');
}

