// ── TECNICO ───────────────────────────────────────────────────
function buildSB(){const bar=ge('tsbar');bar.innerHTML=Array.from({length:5},(_,i)=>`<div style="flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,${i===0?.9:.3})" id="tsb${i}"></div>`).join('');}
const TL=['Step 1 — Dati','Step 2 — Check-list','Step 3 — Anomalie','Step 4 — Aggiorna presidi','Step 5 — Chiusura'];


// ── TECNICO: impossibilitato + relazione tecnica ──────────────
function toggleImpossibilitato() {
  var cb = ge('tc-impossibilitato');
  var box = ge('tc-imp-box');
  if(box) box.style.display = cb && cb.checked ? 'block' : 'none';
}

function mostraRelazioneBox() {
  var tipo = v('tc2');
  var box = ge('tc-relazione-box');
  if(box) box.style.display = tipo === 'ordinario_programmato' ? 'block' : 'none';
}

// Mostra info sede selezionata
function mostraInfoSede() {
  var sel = ge('tc1-sede');
  var info = ge('tc-sede-info');
  if(!sel || !info) return;
  var opt = sel.options[sel.selectedIndex];
  if(sel.value && opt) {
    info.style.display = 'block';
    info.innerHTML = '📍 <strong>' + opt.text + '</strong>';
  } else {
    info.style.display = 'none';
  }
}

async function loadAddrTec(){const cid=v('tc1');if(!cid)return;}

function tnav(n){for(let i=0;i<5;i++){ge('ts'+i).classList.toggle('on',i===n);ge('tsb'+i).style.background=i===n?'rgba(255,255,255,.9)':i<n?'rgba(255,255,255,.6)':'rgba(255,255,255,.3)';}ge('tsl').textContent=TL[n];if(n===1)buildCKL();if(n===3)loadPC();if(n===4)buildRiep();}
function tnext(from){
  if(from===0&&!v('tc1')){toast('Seleziona un cliente','err');return;}
  if(from===0&&!v('tc3')){toast('Inserisci la data','err');return;}
  if(from===1){
    var imp = ge('tc-impossibilitato');
    if(imp && imp.checked) {
      var motivo = v('tc-imp-motivo').trim();
      if(!motivo){toast('Devi indicare il motivo per cui non hai potuto completare','err');return;}
    }
  }
  if(from===1) mostraRelazioneBox();
  tnav(from+1);
}
function tprev(from){tnav(from-1);}

function buildCKL(){const tipo=v('tc2'),chk=CKL[tipo]||CKL.ordinario_chiamata;let html='';Object.entries(chk).forEach(([sec,items])=>{html+=`<div class="cs">${sec}</div>`;items.forEach((item,i)=>{const id=sec.replace(/\W/g,'')+i;html+=`<div class="ci" id="cw${id}" onclick="tgChk('${id}')"><input type="checkbox" id="cb${id}"><label for="cb${id}">${item}</label></div>`;});});ge('chkc').innerHTML=html;document.querySelectorAll('.ci input').forEach(cb=>cb.addEventListener('change',updCKP));updCKP();}
function tgChk(id){const cb=ge('cb'+id);if(cb){cb.checked=!cb.checked;ge('cw'+id).classList.toggle('done',cb.checked);updCKP();}}
function updCKP(){const all=document.querySelectorAll('.ci input'),done=document.querySelectorAll('.ci input:checked'),pct=all.length?Math.round(done.length/all.length*100):0;const pf=ge('cpf');if(pf){pf.style.width=pct+'%';ge('cpb').className='pb'+(pct<50?' e':pct<100?' w':'');ge('cpc').textContent=done.length+' / '+all.length+' completati';}}



function renderPresidiPerSede(pp) {
  var el = ge('cd-presidi-content');
  if(!el) return;
  if(!pp || !pp.length) { el.innerHTML='<div class="empty">Nessun presidio censito.</div>'; return; }

  // Raggruppa per sede
  var bySede = {'__principale': {label:'Sede principale', items:[]}};
  pp.forEach(function(p){
    var key = p.sede_id || '__principale';
    if(!bySede[key]) {
      var s = p.sedi_cliente;
      bySede[key] = {
        label: s ? (s.tipo||'') + ' — ' + (esc(s.indirizzo)||'') + (esc(s.citta)?', '+esc(s.citta):'') : 'Sede',
        items: []
      };
    }
    bySede[key].items.push(p);
  });

  var html = '';
  Object.keys(bySede).forEach(function(key) {
    var gruppo = bySede[key];
    if(!gruppo.items.length) return;
    html += '<div style="margin-bottom:20px">' +
      '<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--m);margin-bottom:10px;display:flex;align-items:center;gap:6px">' +
        '<span>📍</span><span>'+gruppo.label+'</span>' +
        '<span style="background:var(--bg);border-radius:20px;padding:1px 8px;font-size:11px">'+gruppo.items.length+' presidi</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">' +
      gruppo.items.map(function(p){
        return '<div class="pc">' +
          '<div style="position:absolute;top:12px;right:12px">'+si2(p.stato)+'</div>' +
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--m);margin-bottom:4px">'+tpl(p.tipo)+'</div>' +
          '<div style="font-size:14px;font-weight:600;margin-bottom:2px">'+(esc(p.matricola)||'—')+'</div>' +
          '<div style="font-size:12px;display:flex;flex-direction:column;gap:4px">' +
            '<div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Ubicazione</span><span>'+(esc(p.ubicazione)||'—')+'</span></div>' +
            '<div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Ult. verifica</span><span>'+fd(p.data_ultimo_controllo)+'</span></div>' +
            '<div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Prossima</span><span class="'+sc(p.data_prossimo_controllo)+'">'+fd(p.data_prossimo_controllo)+'</span></div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;margin-top:10px">' +
            ((ROLE==='titolare'||ROLE==='capo_tecnico'||ROLE==='segreteria') ? '<button class="btn sm" data-pid="'+p.id+'" onclick="editP(this.dataset.pid)">✏️</button>' : '') +
            ((ROLE==='titolare'||ROLE==='capo_tecnico') ? '<button class="btn sm" style="color:var(--r)" data-pid="'+p.id+'" onclick="eliminaPresidio(this.dataset.pid)">🗑️</button>' : '') +
          '</div>' +
        '</div>';
      }).join('') +
      '</div></div>';
  });
  el.innerHTML = html;
}

async function loadSediPresidio(cliId, selectedSedeId) {
  var sel = ge('mpsede');
  if(!sel) return;
  sel.innerHTML = '<option value="">Sede principale / non specificata</option>';
  if(!cliId) return;
  var r = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').eq('cliente_id',cliId).order('tipo');
  (r.data||[]).forEach(function(s) {
    var label = (s.tipo||'') + ' — ' + (s.indirizzo||'') + (s.citta?', '+s.citta:'');
    var opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = label;
    if(selectedSedeId && s.id === selectedSedeId) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function loadPC(){
  const cid=v('tc1');if(!cid){ge('pcl').innerHTML='<div class="empty">Seleziona un cliente</div>';return;}
  const [{data:pp},{data:perio}]=await Promise.all([
    db.from('impianti').select('*').eq('cliente_id',cid).order('tipo').order('matricola'),
    db.from('clienti_periodicita').select('*').eq('cliente_id',cid).maybeSingle()
  ]);
  const el=ge('pcl');
  if(!pp?.length){
    el.innerHTML='<div class="empty">Nessun presidio censito.<br><button class="btn p sm" style="margin-top:8px" onclick="apriAggiungiPresidioTec()">+ Aggiungi primo presidio</button></div>';
    return;
  }
  // Carica sedi del cliente
  var sediRes = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').eq('cliente_id',cid).order('tipo');
  var sediList = sediRes.data || [];
  var sediMap2 = {}; sediList.forEach(function(s){sediMap2[s.id]=s;});

  // Raggruppa per sede poi per tipo
  var bySede2 = {'': {label:'Sede principale', items:[]}};
  sediList.forEach(function(s){ bySede2[s.id]={label:(s.tipo||'')+ ' — '+(esc(s.indirizzo)||'')+(esc(s.citta)?', '+esc(s.citta):''), items:[]}; });
  pp.forEach(function(p){ var k=p.sede_id||''; if(!bySede2[k]) bySede2[k]={label:'Sede N/D',items:[]}; bySede2[k].items.push(p); });

  var hasMultiSede = sediList.length > 0;

  el.innerHTML=Object.keys(bySede2).filter(function(k){return bySede2[k].items.length>0;}).map(function(sedeKey){
    var gruppo = bySede2[sedeKey];
    // Raggruppa per tipo dentro la sede
    var byTipo={};
    gruppo.items.forEach(function(p){if(!byTipo[p.tipo])byTipo[p.tipo]=[];byTipo[p.tipo].push(p);});
    var sedeHeader = hasMultiSede ? '<div style="font-size:12px;font-weight:700;color:var(--b);margin-bottom:8px;padding:6px 8px;background:var(--bl);border-radius:6px">📍 '+gruppo.label+'</div>' : '';
    return sedeHeader + Object.keys(byTipo).map(function(tipo){
    var presidi=byTipo[tipo];
    var mesiTipo=perio?.[tipo]?PERIO_MESI[perio[tipo]]:null;
    var presidi=byTipo[tipo];
    return '<div style="margin-bottom:12px">' +
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--m);margin-bottom:6px">'+tpl(tipo)+' ('+presidi.length+')</div>' +
      presidi.map(function(p){
        var mesi=mesiTipo||p.periodicita_mesi||0;
        var periLabel=mesi?'ogni '+mesi+' mesi':'periodicità N/D';
        var statoIcon={ok:'✅',anomalia:'⚠️',scaduto:'❌',fuori_servizio:'🔴'}[p.stato]||'•';
        return '<div style="background:var(--bg);border-radius:var(--rs);padding:10px;margin-bottom:6px">' +
          '<div style="display:flex;align-items:flex-start;gap:10px">' +
            '<input type="checkbox" id="upd-'+p.id+'" data-mesi="'+mesi+'" style="width:18px;height:18px;accent-color:var(--g);margin-top:3px" onchange="togglePresidioDetail(this.dataset.pid)" data-pid="'+p.id+'">' +
            '<div style="flex:1">' +
              '<div style="font-size:13px;font-weight:600">'+statoIcon+' '+tpl(p.tipo)+' — '+( esc(p.matricola)||'N/A')+'</div>' +
              '<div style="font-size:12px;color:var(--m)">'+( esc(p.ubicazione)||'—')+(p.piano?' · Piano '+p.piano:'')+' · '+periLabel+'</div>' +
              '<div style="font-size:11px;color:var(--m)">Ult. verifica: '+(fd(p.data_ultimo_controllo)||'Mai')+' · Pross.: '+fd(p.data_prossimo_controllo)+'</div>' +
            '</div>' +
            '<button class="btn sm" data-pid="'+p.id+'" onclick="editPresidioTec(this.dataset.pid)" style="font-size:11px">✏️</button>' +
          '</div>' +
          // Pannello espandibile quando spuntato
          '<div id="detail-'+p.id+'" style="display:none;margin-top:10px;border-top:0.5px solid var(--bo);padding-top:10px">' +
            '<div class="fr">' +
              '<div class="f" style="margin:0"><label style="font-size:11px">Stato dopo verifica</label>' +
                '<select id="stato-'+p.id+'" style="width:100%;font-size:13px">' +
                  '<option value="ok"'+(p.stato==='ok'?' selected':'')+'>✅ OK / Conforme</option>' +
                  '<option value="anomalia"'+(p.stato==='anomalia'?' selected':'')+'>⚠️ Anomalia rilevata</option>' +
                  '<option value="fuori_servizio"'+(p.stato==='fuori_servizio'?' selected':'')+'>🔴 Fuori servizio</option>' +
                '</select></div>' +
              '<div class="f" style="margin:0"><label style="font-size:11px">Note intervento</label>' +
                '<input type="text" id="note-'+p.id+'" value="'+(esc(p.note)||'')+'" placeholder="Anomalie, ricambi..." style="font-size:13px"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }).join('');
  }).join('');
}

function togglePresidioDetail(el) {
  var pid = el.dataset ? el.dataset.pid : el;
  var detail = ge('detail-'+pid);
  if(detail) detail.style.display = el.checked ? 'block' : 'none';
}

function buildRiep(){const ce=ge('tc1'),cn=ce.options[ce.selectedIndex]?.text||'—';const te=ge('tc5'),tn=te.options[te.selectedIndex]?.text||'—';const done=document.querySelectorAll('.ci input:checked').length,total=document.querySelectorAll('.ci input').length;ge('triepilogo').innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;font-size:13px"><div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Cliente</span><strong>${cn}</strong></div><div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Tecnico</span><strong>${tn}</strong></div><div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Data</span><strong>${fd(v('tc3'))}</strong></div><div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Tipo</span><strong>${tl(v('tc2'))}</strong></div><div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Check-list</span><strong>${done}/${total} completate</strong></div><div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Esito</span><strong>${v('tc13').replace(/_/g,' ')}</strong></div>${v('tc14')==='true'?'<div><span class="bx berr">⚠ Intervento straordinario richiesto</span></div>':''}</div>`;}

async function salvaInt(){
  const cid=v('tc1'),tid=v('tc5'),di=v('tc3');if(!cid||!di){toast('Dati mancanti','err');return;}
  var impossibilitato = ge('tc-impossibilitato') && ge('tc-impossibilitato').checked;
  var motivoImp = impossibilitato ? v('tc-imp-motivo').trim() : null;
  var relazioneDettaglio = v('tc-relaz-lavori') || null;
  var relazioneRacc = v('tc-relaz-racc') || null;
  const btn=ge('savebtn');btn.disabled=true;btn.textContent='Salvataggio...';
  const chkDone=[];document.querySelectorAll('.ci input:checked').forEach(cb=>{chkDone.push(cb.nextElementSibling.textContent);});
  const chkTxt=chkDone.length?'CHECK-LIST:\n'+chkDone.map(t=>'✓ '+t).join('\n'):null;
  const sedeId=v('tc1-sede')||null;const {data:odl,error:e1}=await db.from('ordini_lavoro').insert({cliente_id:cid,tipo:v('tc2'),tecnico_id:tid||null,data_pianificata:di,stato:'completato',note_per_tecnico:v('tc6')||null,sede_id:sedeId}).select().single();
  if(e1){toast('Errore intervento: '+e1.message,'err');btn.disabled=false;btn.textContent='Salva e chiudi intervento ✓';return;}
  const straord=v('tc14')==='true';
  const {data:schedaData,error:e2}=await db.from('schede_lavoro').insert({odl_id:odl.id,tecnico_id:tid||ME.id,cliente_id:cid,data_intervento:di,ora_inizio:v('tc4')||null,ora_fine:v('tc17')||null,lavori_eseguiti:chkTxt?chkTxt+'\n\n'+(v('tc10')||''):v('tc10')||null,anomalie_rilevate:v('tc12')||null,
      esito: impossibilitato ? 'non_completato' : v('tc13'),
      note_interne: relazioneDettaglio ? '[RELAZIONE TECNICA]\n'+relazioneDettaglio+(relazioneRacc?'\n\nRACCOMANDAZIONI: '+relazioneRacc:'') : null,
      impossibilitato: impossibilitato || false,
      motivo_impossibilitato: motivoImp,intervento_straordinario_richiesto:straord,urgenza_straordinario:straord?v('tc15'):null,descrizione_intervento_necessario:straord?v('tc16'):null,nome_firmatario:v('tc18')||null,stato:'firmata'}).select().single();
  var scheda = schedaData || {};
  if(e2){toast('Errore scheda: '+e2.message,'err');btn.disabled=false;btn.textContent='Salva e chiudi intervento ✓';return;}
  // Aggiorna presidi selezionati con stato e note specifici
  const pch=document.querySelectorAll('#pcl input[type=checkbox]:checked');
  for(const cb of pch){
    const pid=cb.id.replace('upd-','');
    const mesi=parseInt(cb.dataset.mesi)||12;
    const d=new Date(di+'T00:00:00');d.setMonth(d.getMonth()+mesi);
    var nuovoStato = ge('stato-'+pid) ? ge('stato-'+pid).value : 'ok';
    var noteP = ge('note-'+pid) ? ge('note-'+pid).value.trim() : null;
    await db.from('impianti').update({
      data_ultimo_controllo:di,
      data_prossimo_controllo:d.toISOString().split('T')[0],
      stato: nuovoStato,
      note: noteP || null
    }).eq('id',pid);
  }
  btn.disabled=false;btn.textContent='Salva e chiudi intervento ✓';
  // Upload foto se presenti
  if(_fotoTecnico.length > 0) {
    toast('⏳ Caricamento foto...','ok');
    await uploadFotoIntervento(odl.id, scheda.id || odl.id);
  }
  toast('✅ Intervento salvato! Scheda inviata in segreteria.','ok');
  ['tc1','tc5','tc6','tc10','tc12','tc16','tc17','tc18','tc-relaz-lavori','tc-relaz-racc','tc-imp-motivo'].forEach(id=>{const el=ge(id);if(el)el.value='';});
  var impCb = ge('tc-impossibilitato'); if(impCb){impCb.checked=false; toggleImpossibilitato();}
  var relBox = ge('tc-relazione-box'); if(relBox) relBox.style.display='none';
  tnav(0);gotoPage('dashboard');document.querySelectorAll('.nb')[0]?.classList.add('on');document.querySelectorAll('.nb').forEach((t,i)=>{if(i>0)t.classList.remove('on');});
}

// ── SAVE ──────────────────────────────────────────────────────
// B4 — Imposta la modalità del modal m-odl. Modi: 'create' | 'edit' | 'assign' | 'tecnico-self'.
// Aggiorna classe CSS, titolo, label CTA, e popola summary se necessario.
function setModalMode(mode){
  var m = document.querySelector('#m-odl .modal');
  if(!m) return;
  m.classList.remove('mode-create','mode-edit','mode-assign','mode-tecnico-self');
  m.classList.add('mode-' + mode);
  var btn = ge('mo-btn-save');
  var title = ge('modal-odl-title');
  if(mode === 'assign'){
    if(title) title.firstChild.nodeValue = 'Assegna intervento ';
    if(btn) btn.textContent = '✅ Assegna';
    // Popola summary con i valori attuali dei campi
    populateAssignSummary();
  } else if(mode === 'edit'){
    if(btn) btn.textContent = 'Salva modifiche';
  } else if(mode === 'tecnico-self'){
    if(title) title.firstChild.nodeValue = 'Schedula intervento personale ';
    if(btn) btn.textContent = '📅 Aggiungi al mio calendario';
  } else {
    // create
    if(title) title.firstChild.nodeValue = 'Nuovo intervento ';
    if(btn) btn.textContent = 'Crea intervento';
  }
}

function populateAssignSummary(){
  var el = ge('mo-summary-content');
  if(!el) return;
  var cliSel = ge('mo1');
  var cliText = cliSel ? (cliSel.options[cliSel.selectedIndex]?.text || '—') : '—';
  var sedeSel = ge('mo-sede');
  var sedeText = sedeSel ? (sedeSel.options[sedeSel.selectedIndex]?.text || '—') : '—';
  var tipoSel = ge('mo2');
  var tipoText = tipoSel ? (tipoSel.options[tipoSel.selectedIndex]?.text || '—') : '—';
  var note = v('mo6');
  var materiali = v('mo-materiali');
  var html = '';
  html += '<div style="margin-bottom:6px"><strong>'+esc(cliText)+'</strong></div>';
  if(sedeText && sedeText !== 'Sede principale / da definire') html += '<div style="font-size:12px;color:var(--m);margin-bottom:4px">📍 '+esc(sedeText)+'</div>';
  html += '<div style="font-size:12px;color:var(--m);margin-bottom:6px">🔧 '+esc(tipoText)+'</div>';
  if(materiali) html += '<div style="font-size:12px;color:var(--g);margin-top:8px;padding:6px 8px;background:var(--gl);border-radius:6px"><strong>📦 Materiali:</strong> '+esc(materiali)+'</div>';
  if(note) html += '<div style="font-size:12px;color:var(--m);margin-top:6px"><em>📝 '+esc(note)+'</em></div>';
  el.innerHTML = html;
}

async function saveOdl(){
  const cid=v('mo1'),tipo=v('mo2'),data=v('mo3');
  if(!cid||!tipo||!data){toast('Compila cliente, tipo e data','err');return;}
  const sede=v('mo-sede');
  const editId = ge('mcli-odl-id') ? ge('mcli-odl-id').value : '';
  const soprId = ge('mo-sopr-id') ? ge('mo-sopr-id').value : '';
  const payload={cliente_id:cid,tipo,data_pianificata:data,fascia_oraria:v('mo4')||null,tecnico_id:v('mo5')||null,note_per_tecnico:v('mo6')||null,sede_id:sede||null,materiali_da_portare:v('mo-materiali')||null,note_capo_tecnico:v('mo-note-cap')||null};
  let error, newOdlId = null;
  if(editId) {
    const r = await db.from('ordini_lavoro').update(payload).eq('id',editId);
    error = r.error;
  } else {
    // Tecnico che schedula sé stesso: forza tecnico_id=ME e stato=pianificato
    if(ROLE === 'tecnico'){
      payload.tecnico_id = ME.id;
      payload.stato = 'pianificato';
    } else {
      payload.stato = (ROLE === 'capo_tecnico') ? 'pianificato' : 'da_pianificare';
    }
    const r = await db.from('ordini_lavoro').insert(payload).select().single();
    error = r.error;
    if(!error && r.data) newOdlId = r.data.id;
  }
  if(error){toast('Errore: '+error.message,'err');return;}
  // Se l'OdL nasce da un sopralluogo accettato, aggiorna sopralluoghi.odl_creato_id
  if(newOdlId && soprId){
    await db.from('sopralluoghi').update({odl_creato_id:newOdlId}).eq('id', soprId);
  }
  if(ge('mcli-odl-id')) ge('mcli-odl-id').value='';
  if(ge('mo-sopr-id')) ge('mo-sopr-id').value='';
  if(ge('modal-odl-title')) ge('modal-odl-title').textContent='Nuovo intervento';
  closeM('m-odl');
  toast(editId?'Intervento aggiornato ✓':'Intervento creato ✓','ok');
  await loadCS();loadDash();
  if(ge('pg-interventi')&&ge('pg-interventi').classList.contains('on'))loadOdl();
  if(ge('pg-calendario')&&ge('pg-calendario').classList.contains('on'))loadCalendario();
  if(ge('pg-calendario-tec')&&ge('pg-calendario-tec').classList.contains('on'))loadCalendarioTecnico();
  if(ge('pg-trattative')&&ge('pg-trattative').classList.contains('on'))loadSopralluoghiList();
}

// Apre m-odl vuoto (usato dal bottone rappresentante "+ Pianifica intervento")
async function openNuovoOdlVuoto(){
  await loadCS(); await loadUS();
  // Reset
  ['mo1','mo-sede','mo2','mo3','mo4','mo5','mo6','mo-materiali','mo-note-cap'].forEach(function(id){
    var el = ge(id); if(el) el.value = id==='mo2'?'ordinario_chiamata':(id==='mo4'?'mattina':'');
  });
  if(ge('mcli-odl-id')) ge('mcli-odl-id').value='';
  if(ge('mo-sopr-id')) ge('mo-sopr-id').value='';
  var pp = ge('mo-presidi-preview'); if(pp) pp.innerHTML='<div style="color:var(--m);font-size:12px;padding:4px">Seleziona prima un cliente.</div>';
  setModalMode('create');
  if(ge('modal-odl-title')) ge('modal-odl-title').firstChild && (ge('modal-odl-title').firstChild.nodeValue='Nuovo intervento (da pianificare) ');
  openM('m-odl');
}

// Apre m-odl in modalità "create" pulito (usato dai bottoni "+ Pianifica intervento").
async function apriNuovoIntervento(){
  await loadCS(); await loadUS();
  if(ge('mcli-odl-id')) ge('mcli-odl-id').value='';
  if(ge('mo-sopr-id')) ge('mo-sopr-id').value='';
  ['mo1','mo-sede','mo3','mo5','mo6','mo-materiali','mo-note-cap'].forEach(function(id){
    var el = ge(id); if(el) el.value = '';
  });
  var t = ge('mo2'); if(t) t.value = 'ordinario_programmato';
  var f = ge('mo4'); if(f) f.value = 'mattina';
  var pp = ge('mo-presidi-preview'); if(pp) pp.innerHTML='<div style="color:var(--m);font-size:12px;padding:4px">Seleziona prima un cliente.</div>';
  setModalMode('create');
  if(ge('modal-odl-title') && ge('modal-odl-title').firstChild){
    ge('modal-odl-title').firstChild.nodeValue = 'Nuovo intervento ';
  }
  openM('m-odl');
}

// Apre m-odl in modalità "tecnico-self": il tecnico schedula un proprio intervento.
// Sostituisce il vecchio m-schedula-tec (B5).
async function apriSchedulazionePersonale(){
  await loadCS(); // CLIS popolato
  // Reset
  ['mo1','mo-sede','mo3','mo4','mo6','mo-materiali','mo-note-cap'].forEach(function(id){
    var el = ge(id); if(el) el.value = '';
  });
  // Tipo default "su chiamata", data oggi, fascia mattina
  var t = ge('mo2'); if(t) t.value = 'ordinario_chiamata';
  var d = ge('mo3'); if(d) d.value = new Date().toISOString().split('T')[0];
  var f = ge('mo4'); if(f) f.value = 'mattina';
  // Popola dropdown clienti
  var cliSel = ge('mo1');
  if(cliSel){
    cliSel.innerHTML = '<option value="">Seleziona cliente...</option>' +
      (CLIS||[]).map(function(c){ return '<option value="'+c.id+'">'+esc(c.ragione_sociale)+'</option>'; }).join('');
  }
  // Reset altri stati modal
  if(ge('mcli-odl-id')) ge('mcli-odl-id').value='';
  if(ge('mo-sopr-id')) ge('mo-sopr-id').value='';
  var pp = ge('mo-presidi-preview'); if(pp) pp.innerHTML='<div style="color:var(--m);font-size:12px;padding:4px">Seleziona prima un cliente.</div>';
  setModalMode('tecnico-self');
  openM('m-odl');
}

// Apre m-odl pre-compilato da un sopralluogo accettato
async function accettaSopralluogo(soprId){
  var r = await db.from('sopralluoghi').select('*').eq('id', soprId).single();
  if(r.error){ toast('Errore caricamento sopralluogo: '+r.error.message,'err'); return; }
  var s = r.data;
  if(!s.cliente_id){ toast('Sopralluogo senza cliente associato: crea prima il cliente.','err'); return; }
  await loadCS(); await loadUS();
  // Reset poi precompila
  ['mo3','mo4','mo5','mo6','mo-note-cap'].forEach(function(id){ var el=ge(id); if(el) el.value=''; });
  ge('mo1').value = s.cliente_id;
  await loadSediForOdl();
  ge('mo2').value = (s.urgenza==='urgente'||s.urgenza==='entro_30gg') ? 'ordinario_chiamata' : 'straordinario';
  // Componi una bozza materiali dal contenuto del sopralluogo
  var materiali = [];
  if(s.estintori_n) materiali.push(s.estintori_n+' estintori — '+(s.estintori_tipo||'tipo da definire'));
  if(s.idranti_n) materiali.push(s.idranti_n+' idranti');
  if(s.porte_rei_n) materiali.push(s.porte_rei_n+' porte REI');
  if(s.luci_emergenza_n) materiali.push(s.luci_emergenza_n+' luci emergenza');
  if(s.richiesta_cliente) materiali.push('— RICHIESTA CLIENTE —\n'+s.richiesta_cliente);
  if(s.anomalie_rilevate) materiali.push('— ANOMALIE RILEVATE —\n'+s.anomalie_rilevate);
  ge('mo-materiali').value = materiali.join('\n');
  ge('mo-note-cap').value = s.note_commerciali || '';
  ge('mo6').value = 'Da sopralluogo del ' + (s.creato_il ? new Date(s.creato_il).toLocaleDateString('it-IT') : '—');
  ge('mo-sopr-id').value = soprId;
  if(ge('mcli-odl-id')) ge('mcli-odl-id').value='';
  await calcolaPresidiSede(s.cliente_id, null, 'mo-presidi-preview');
  setModalMode('create');
  if(ge('modal-odl-title') && ge('modal-odl-title').firstChild){
    ge('modal-odl-title').firstChild.nodeValue = 'Accettazione sopralluogo → nuovo intervento ';
  }
  openM('m-odl');
}
async function saveImp(){const {error}=await db.from('impostazioni').update({ragione_sociale:v('si1')||null,indirizzo:v('si2')||null,cap:v('si3')||null,citta:v('si4')||null,piva:v('si5')||null,telefono:v('si6')||null,email:v('si7')||null}).eq('id',1);if(error){toast('Errore: '+error.message,'err');return;}toast('Dati aziendali salvati ✓','ok');loadImp();}

async function saveUser(){
  const nome=v('mu1').trim(),cognome=v('mu2').trim(),email=v('mu3').trim(),pwd=v('mu4'),ruolo=v('mu6');
  if(!nome||!cognome||!email||!pwd||!ruolo){toast('Compila tutti i campi','err');return;}
  if(pwd.length<6){toast('Password min 6 caratteri','err');return;}
  // Client temporaneo: il signUp avrebbe cambiato la sessione attiva al nuovo utente,
  // facendo fallire l'INSERT su utenti (policy: solo titolare). Così la sessione
  // del titolare resta sul client principale `db`.
  const dbTmp = supabase.createClient(SU, SK, {auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error} = await dbTmp.auth.signUp({email,password:pwd});
  if(error){toast('Errore: '+error.message,'err');return;}
  if(data.user){
    const r = await db.from('utenti').insert({id:data.user.id,nome,cognome,email,ruolo,attivo:true});
    if(r.error){toast('Errore inserimento utente: '+r.error.message,'err');return;}
    // Conferma email automaticamente
    await db.rpc('confirm_user_email',{user_email:email}).catch(()=>{});
  }
  closeM('m-user');toast(`${nome} ${cognome} (${ruolo}) creato ✓`,'ok');
  ['mu1','mu2','mu3','mu4'].forEach(id=>{const el=ge(id);if(el)el.value='';});
  loadTeam();loadUS();
}


