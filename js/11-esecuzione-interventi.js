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




async function loadSediPresidio(cliId, selectedSedeId) {
  const sel = ge('mpsede');

  if (!sel) return;

  sel.innerHTML =
    '<option value="">Sede principale / non specificata</option>';

  if (!cliId) return;

  const { data: sedi, error } = await db
    .from('sedi_cliente')
    .select('id,tipo,nome,via,civico,cap,citta')
    .eq('cliente_id', cliId)
    .order('tipo');

  if (error) {
    console.error('Errore caricamento sedi:', error);
    toast('Non riesco a caricare le sedi: ' + error.message, 'err');
    return;
  }

  (sedi || []).forEach(function(sede) {
    const intestazione =
      (sede.tipo || 'Sede').toUpperCase() +
      (sede.nome ? ' — ' + sede.nome : '');

    const indirizzo = [sede.via, sede.civico]
      .filter(Boolean)
      .join(' ');

    const localita = [sede.cap, sede.citta]
      .filter(Boolean)
      .join(' ');

    const etichetta = [intestazione, indirizzo, localita]
      .filter(Boolean)
      .join(' · ');

    const opt = document.createElement('option');
    opt.value = sede.id;
    opt.textContent = etichetta;

    if (selectedSedeId && sede.id === selectedSedeId) {
      opt.selected = true;
    }

    sel.appendChild(opt);
  });
}

async function loadPC(){
  ricordaPosizionePagina();
  const cid=v('tc1');if(!cid){ge('pcl').innerHTML='<div class="empty">Seleziona un cliente</div>';return;}
  // Tecnico: con le policy per ruolo (sql/08) legge impianti, periodicità e
  // sedi solo dei clienti dei suoi interventi; per un intervento compilato a
  // mano su un altro cliente usa la RPC parco_presidi_cliente (sql/07).
  // Se la RPC non esiste ancora resta la lettura diretta.
  let pp=null, perio=null, sediList=null;
  if(ROLE==='tecnico'){
    const r=await db.rpc('parco_presidi_cliente',{p_cliente_id:cid});
    if(!r.error && r.data){pp=r.data.impianti||[];perio=r.data.periodicita||null;sediList=r.data.sedi||[];}
  }
  if(!pp){
    const [{data:ppDir},{data:perioDir}]=await Promise.all([
      db.from('impianti').select('*').eq('cliente_id',cid).order('tipo').order('matricola'),
      db.from('clienti_periodicita').select('*').eq('cliente_id',cid).maybeSingle()
    ]);
    pp=ppDir; perio=perioDir;
  }
  const el=ge('pcl');
  if(!pp?.length){
    el.innerHTML='<div class="empty">Nessun presidio censito.<br><button class="btn p sm" style="margin-top:8px" onclick="apriAggiungiPresidioTec()">+ Aggiungi primo presidio</button></div>';
    return;
  }
  // Carica sedi del cliente (se non sono già arrivate dalla RPC)
  if(!sediList){
    var sediRes = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').eq('cliente_id',cid).order('tipo');
    sediList = sediRes.data || [];
  }
  var sediMap2 = {}; sediList.forEach(function(s){sediMap2[s.id]=s;});

  // Raggruppa per sede poi per tipo
  var bySede2 = {'': {label:'Sede principale', items:[]}};
  // F2.3 — le sedi hanno via/civico/città (non "indirizzo"), sia dalla RPC sia dalla lettura diretta
  sediList.forEach(function(s){ var indS=[s.via,s.civico].filter(Boolean).join(' '); bySede2[s.id]={label:esc((s.tipo||'').toUpperCase())+(s.nome?' — '+esc(s.nome):'')+': '+(esc(indS)||'—')+(s.citta?', '+esc(s.citta):''), items:[]}; });
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

function buildRiep(){const ce=ge('tc1'),cn=ce.options[ce.selectedIndex]?.text||'—';const te=ge('tc5'),tn=te.options[te.selectedIndex]?.text||'—';
  const done=document.querySelectorAll('.ci input:checked')
  .length,total=document.querySelectorAll('.ci input')
  .length;ge('triepilogo')
  .innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
  <div style="display:flex;justify-content:space-between">
  <span style="color:var(--m)">Cliente</span><strong>${cn}</strong></div>
  <div style="display:flex;justify-content:space-between">
  <span style="color:var(--m)">Tecnico</span><strong>${tn}</strong></div>
  <div style="display:flex;justify-content:space-between">
  <span style="color:var(--m)">Data</span><strong>${fd(v('tc3'))}</strong></div>
  <div style="display:flex;justify-content:space-between">
  <span style="color:var(--m)">Tipo</span><strong>${tl(v('tc2'))}</strong>
  </div><div style="display:flex;justify-content:space-between">
  <span style="color:var(--m)">Check-list</span><strong>${done}/${total} completate</strong>
  </div><div style="display:flex;justify-content:space-between">
  <span style="color:var(--m)">Esito</span><strong>${v('tc13').replace(/_/g,' ')}</strong>
  </div>${v('tc14')==='true'?'<div><span class="bx berr">⚠ Intervento straordinario richiesto</span></div>':''}</div>`;}

// F2.1 — Avviso che resta a video finché l'utente non preme "Ho capito"
// (non si chiude cliccando fuori). corpoHtml deve essere già passato da esc().
function mostraAvvisoBloccante(titolo, corpoHtml){
  var id='m-avviso-bloccante';
  var el=ge(id);
  if(!el){
    el=document.createElement('div');el.className='mbg';el.id=id;
    el._mbgListener=function(){}; // niente chiusura al click fuori
    document.body.appendChild(el);
  }
  el.innerHTML='<div class="modal" style="max-width:440px">'+
    '<div class="mh" style="color:var(--r)">⚠ '+esc(titolo)+'</div>'+
    '<div style="font-size:14px">'+corpoHtml+'</div>'+
    '<div style="margin-top:16px;text-align:right"><button class="btn p" onclick="closeM(\'m-avviso-bloccante\')">Ho capito</button></div>'+
    '</div>';
  openM(id);
}

// F2.2 — Interventi "da riprogrammare": ordini tornati in coda "da
// pianificare" perché il tecnico ha segnato "Non ho potuto completare
// l'intervento". Non c'è uno stato nuovo nel database: l'ordine torna
// 'da_pianificare' (così code, KPI e calendari lo contano come da pianificare)
// e il motivo si legge dalla scheda di lavoro collegata (schede_lavoro con
// impossibilitato = true). Restituisce { odl_id: {motivo, data, n} } con il
// motivo più recente e quante volte non è stato completato.
async function caricaMotiviRiprogrammare(odlIds){
  var mappa = {};
  var ids = (odlIds || []).filter(Boolean);
  if(!ids.length) return mappa;
  // a blocchi di 100 per non allungare troppo l'indirizzo della richiesta
  var righe = [];
  for(var i = 0; i < ids.length; i += 100){
    var r = await db.from('schede_lavoro')
      .select('odl_id,motivo_impossibilitato,data_intervento,creato_il')
      .in('odl_id', ids.slice(i, i+100))
      .eq('impossibilitato', true)
      .is('eliminato_il', null);
    if(r.error){ console.warn('Motivi da riprogrammare non caricati:', r.error.message); return mappa; }
    righe = righe.concat(r.data || []);
  }
  righe.sort(function(a,b){ return String(b.creato_il||'').localeCompare(String(a.creato_il||'')); });
  righe.forEach(function(s){
    if(!mappa[s.odl_id]) mappa[s.odl_id] = {motivo: s.motivo_impossibilitato || '', data: s.data_intervento, n: 0};
    mappa[s.odl_id].n++;
  });
  return mappa;
}

// F2.2 — Le schede "non completate" (impossibilitato = true) non vanno alla
// segreteria né alla contabilità: le vedono solo chi pianifica (capo tecnico,
// titolare/informatico) e il tecnico. Usata da Documenti e Scheda cliente.
function vedeSchedeNonCompletate(){
  return ROLE === 'titolare' || ROLE === 'capo_tecnico' || ROLE === 'tecnico';
}

// Riquadro con il motivo, per chi pianifica (capo tecnico / Resp. Service).
function boxRiprogrammare(info){
  if(!info) return '';
  return '<div style="background:var(--rl,#fef2f2);border-left:3px solid var(--r);padding:8px 10px;border-radius:var(--rs);margin-top:6px;font-size:12px">' +
    '<strong style="color:var(--r)">↻ Da riprogrammare</strong>' +
    (info.n > 1 ? ' <span style="color:var(--m)">(non completato '+info.n+' volte)</span>' : '') +
    '<br><span style="color:var(--m)">Tentativo del '+esc(fd(info.data))+' — motivo del tecnico:</span> ' +
    esc(info.motivo || '—') +
    '</div>';
}

async function salvaInt(){
  // Il tecnico può intestare l'intervento anche a un collega tecnico o capo
  // tecnico (decisione di Erika del 23/10, da confermare da Toli in F1.4;
  // policy sql/09 ordini_lavoro_inserimento). Se non sceglie nessuno, è lui.
  const cid=v('tc1'),tid=(v('tc5')||(ROLE==='tecnico'?ME.id:'')),di=v('tc3');if(!cid||!di){toast('Dati mancanti','err');return;}
  var impossibilitato = ge('tc-impossibilitato') && ge('tc-impossibilitato').checked;
  var motivoImp = impossibilitato ? v('tc-imp-motivo').trim() : null;
  if(impossibilitato && !motivoImp){toast('Devi indicare il motivo per cui non hai potuto completare','err');return;}
  var relazioneDettaglio = v('tc-relaz-lavori') || null;
  var relazioneRacc = v('tc-relaz-racc') || null;
  const btn=ge('savebtn');btn.disabled=true;btn.textContent='Salvataggio...';
  const chkDone=[];document.querySelectorAll('.ci input:checked').forEach(cb=>{chkDone.push(cb.nextElementSibling.textContent);});
  const chkTxt=chkDone.length?'CHECK-LIST:\n'+chkDone.map(t=>'✓ '+t).join('\n'):null;
  const sedeId=v('tc1-sede')||null;
  const riattivaBtn=function(){btn.disabled=false;btn.textContent='Salva e chiudi intervento ✓';};
  // F2.1 — Se è stato scelto un intervento assegnato (tendina "Intervento
  // assegnato"), si chiude QUELLO: niente ordine nuovo, niente doppioni nel
  // calendario. Il ciclo del Piano mensile collegato passa a "eseguito".
  // Senza intervento scelto (intervento estemporaneo) si crea un ordine nuovo
  // già completato, come prima.
  const odlSelId=v('tc-odl')||null;
  let odl=null, odlPrima=null;
  if(odlSelId){
    const rPrima=await db.from('ordini_lavoro').select('id,cliente_id,tipo,tecnico_id,data_pianificata,stato,sede_id,note_per_tecnico').eq('id',odlSelId).maybeSingle();
    odlPrima=rPrima.data;
    if(rPrima.error||!odlPrima){toast('Non trovo l\'intervento selezionato: ricarica la pagina e riprova.','err');riattivaBtn();return;}
    if(odlPrima.stato==='completato'){toast('Questo intervento risulta già chiuso: ricarica la pagina.','err');riattivaBtn();return;}
    if(odlPrima.cliente_id!==cid){toast('Il cliente non corrisponde all\'intervento selezionato: rimetti il cliente dell\'intervento oppure togli la scelta in "Intervento assegnato".','err');riattivaBtn();return;}
    // Il tecnico non può passare a un collega un intervento assegnato a lui
    // (policy ordini_lavoro: modifica solo dei propri): lo riassegna il capo tecnico.
    if(ROLE==='tecnico' && tid && tid!==odlPrima.tecnico_id){toast('Questo intervento è assegnato a te: per intestarlo a un collega chiedi al capo tecnico di riassegnarlo.','err');riattivaBtn();return;}
    // F2.2 — Se il tecnico non è riuscito a svolgerlo, l'intervento NON
    // diventa "completato": torna in coda "da pianificare" senza data, così il
    // capo tecnico lo ripianifica (lista "Da pianificare", Piano mensile). Il
    // tecnico resta quello di prima (le regole del database non gli permettono
    // di togliersi dall'intervento); il motivo sta nella scheda salvata qui
    // sotto (impossibilitato / motivo_impossibilitato).
    const agg={tipo:v('tc2')||odlPrima.tipo,tecnico_id:tid||odlPrima.tecnico_id||null,data_pianificata:di,sede_id:sedeId||odlPrima.sede_id||null};
    if(impossibilitato){
      agg.stato='da_pianificare';
      agg.data_pianificata=null;
      agg.in_ritardo_il=null;
    } else agg.stato='completato';
    if(v('tc6')) agg.note_per_tecnico=v('tc6');
    // Il filtro sullo stato evita di chiudere due volte lo stesso intervento
    // (es. salvato da due telefoni): se nel frattempo è stato chiuso non torna nulla.
    let qUpd=db.from('ordini_lavoro').update(agg).eq('id',odlSelId);
    qUpd=odlPrima.stato?qUpd.eq('stato',odlPrima.stato):qUpd.is('stato',null);
    const rUpd=await qUpd.select().maybeSingle();
    if(rUpd.error){toast(rUpd.error.code==='42501'?'Non hai i permessi per chiudere questo intervento.':'Errore intervento: '+rUpd.error.message,'err');riattivaBtn();return;}
    if(!rUpd.data){toast('Non è stato possibile chiudere l\'intervento (già chiuso o non assegnato a te): ricarica la pagina.','err');riattivaBtn();return;}
    odl=rUpd.data;
  } else {
    // F2.2 — Intervento estemporaneo non completato: nasce già in coda "da
    // pianificare" (senza data) invece che "completato", per non contarlo
    // tra gli interventi fatti e farlo ripianificare al capo tecnico.
    const rIns=await db.from('ordini_lavoro').insert({cliente_id:cid,tipo:v('tc2'),tecnico_id:tid||null,data_pianificata:impossibilitato?null:di,stato:impossibilitato?'da_pianificare':'completato',note_per_tecnico:v('tc6')||null,sede_id:sedeId}).select().single();
    if(rIns.error){toast(rIns.error.code==='42501'?'Non hai i permessi per registrare questo intervento: scegli come tecnico te stesso o un collega tecnico.':'Errore intervento: '+rIns.error.message,'err');riattivaBtn();return;}
    odl=rIns.data;
  }
  const straord=v('tc14')==='true';
  const {data:schedaData,error:e2}=await db.from('schede_lavoro').insert({odl_id:odl.id,tecnico_id:tid||odl.tecnico_id||ME.id,cliente_id:cid,data_intervento:di,ora_inizio:v('tc4')||null,ora_fine:v('tc17')||null,lavori_eseguiti:chkTxt?chkTxt+'\n\n'+(v('tc10')||''):v('tc10')||null,anomalie_rilevate:v('tc12')||null,
      esito: impossibilitato ? 'non_completato' : v('tc13'),
      note_interne: relazioneDettaglio ? '[RELAZIONE TECNICA]\n'+relazioneDettaglio+(relazioneRacc?'\n\nRACCOMANDAZIONI: '+relazioneRacc:'') : null,
      impossibilitato: impossibilitato || false,
      motivo_impossibilitato: motivoImp,intervento_straordinario_richiesto:straord,urgenza_straordinario:straord?v('tc15'):null,descrizione_intervento_necessario:straord?v('tc16'):null,nome_firmatario:v('tc18')||null,
      // F2.2 (decisione di Erika del 23/10, da confermare da Toli in F1.4) —
      // la scheda di un intervento NON completato non va alla segreteria: resta
      // 'bozza' (stato già previsto dal database) e quindi fuori da "Da
      // approvare", fatturazione e contatori. La vedono capo tecnico e titolare
      // come motivo da riprogrammare (caricaMotiviRiprogrammare).
      stato: impossibilitato ? 'bozza' : 'firmata'}).select().single();
  var scheda = schedaData || {};
  if(e2){
    // Scheda non salvata: l'intervento scelto torna com'era (resta da eseguire)
    if(odlPrima){
      const rRip=await db.from('ordini_lavoro').update({stato:odlPrima.stato,tipo:odlPrima.tipo,tecnico_id:odlPrima.tecnico_id,data_pianificata:odlPrima.data_pianificata,sede_id:odlPrima.sede_id,note_per_tecnico:odlPrima.note_per_tecnico}).eq('id',odlPrima.id).select('id');
      if(rRip.error||!rRip.data||!rRip.data.length){
        // Ripristino fallito: l'intervento risulta chiuso senza scheda. Avviso
        // persistente (finestra da chiudere a mano), non un toast che sparisce.
        const ceR=ge('tc1'),cliR=(ceR&&ceR.options[ceR.selectedIndex])?ceR.options[ceR.selectedIndex].text:'—';
        const msgR=impossibilitato
          ?'La scheda non è stata salvata e l\'intervento è rimasto in coda "da pianificare" senza il motivo: avvisa il capo tecnico.'
          :'La scheda non è stata salvata e l\'intervento è rimasto segnato come completato: avvisa il capo tecnico.';
        console.error('F2.1 ripristino intervento fallito',odlPrima.id,rRip.error);
        mostraAvvisoBloccante('Intervento da sistemare',
          '<p style="margin:0 0 10px">'+esc(msgR)+'</p>'+
          '<p style="margin:0 0 6px"><strong>Cliente:</strong> '+esc(cliR)+'</p>'+
          '<p style="margin:0 0 6px"><strong>Data pianificata:</strong> '+esc(fd(odlPrima.data_pianificata))+'</p>'+
          '<p style="margin:0 0 6px"><strong>Data esecuzione indicata:</strong> '+esc(fd(di))+'</p>'+
          '<p style="margin:10px 0 0;color:var(--m);font-size:12px">Errore scheda: '+esc(e2.message)+(rRip.error?' — errore ripristino: '+esc(rRip.error.message):'')+'</p>');
        toast(msgR,'err');riattivaBtn();return;
      }
    }
    toast('Errore scheda: '+e2.message+'. L\'intervento è rimasto aperto: riprova.','err');riattivaBtn();return;
  }
  // Ciclo del Piano mensile collegato -> eseguito. Lo fa anche il trigger
  // sql/17 (necessario per il tecnico, che non può modificare i cicli);
  // qui è un tentativo in più per i ruoli che pianificano: un errore non blocca.
  if(odlPrima && !impossibilitato){
    const rCic=await db.from('cicli_pianificati').update({stato:'eseguito'}).eq('odl_id',odl.id).eq('stato','pianificato');
    if(rCic.error) console.warn('Ciclo pianificato non aggiornato dal sito (ci pensa il trigger sql/17):',rCic.error.message);
  }
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
      data_prossimo_controllo:dataLocaleISO(d),
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
  toast(impossibilitato?'✅ Scheda salvata. L\'intervento torna in coda "da pianificare" con il tuo motivo: lo ripianifica il capo tecnico.':'✅ Intervento salvato! Scheda inviata in segreteria.','ok');
  _tcPrecaricatoDaOdl = false;
  var infoOdl = ge('tec-odl-info'); if(infoOdl){infoOdl.style.display='none';infoOdl.innerHTML='';}
  ['tc-odl','tc1','tc5','tc6','tc10','tc12','tc16','tc17','tc18','tc-relaz-lavori','tc-relaz-racc','tc-imp-motivo'].forEach(id=>{const el=ge(id);if(el)el.value='';});
  var impCb = ge('tc-impossibilitato'); if(impCb){impCb.checked=false; toggleImpossibilitato();}
  var relBox = ge('tc-relazione-box'); if(relBox) relBox.style.display='none';
  tnav(0);gotoPage('dashboard');document.querySelectorAll('.nb')[0]?.classList.add('on');document.querySelectorAll('.nb').forEach((t,i)=>{if(i>0)t.classList.remove('on');});

  ripristinaPosizionePagina();
}

// ── SAVE ──────────────────────────────────────────────────────
// B4 — Imposta la modalità del modal m-odl. Modi: 'create' | 'edit' | 'assign' | 'tecnico-self'.
// Aggiorna classe CSS, titolo, label CTA, e popola summary se necessario.
function setModalMode(mode){
  var m = document.querySelector('#m-odl .modal');
  if(!m) return;
  m.classList.remove('mode-create','mode-edit','mode-assign','mode-tecnico-self');
  m.classList.add('mode-' + mode);
  // F2.2 — il riquadro "da riprogrammare" vale solo per l'intervento aperto
  // da openEditOdl: per un intervento nuovo si svuota.
  if(mode === 'create' || mode === 'tecnico-self'){
    var boxRip = ge('mo-riprogrammare'); if(boxRip){ boxRip.style.display='none'; boxRip.innerHTML=''; }
    window._moStatoOrig = null;
  }
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
    // F2.2 — Chi pianifica (capo tecnico, titolare/informatico, segreteria) e
    // assegna tecnico + data a un intervento "da pianificare" (anche da
    // riprogrammare) lo rende "pianificato", come fa il trascinamento nel
    // calendario (ctDrop); prima restava "da pianificare". Policy ordini_lavoro
    // (produzione odl_update e sql/09): modifica permessa a questi ruoli.
    var puoPianificare = ROLE === 'capo_tecnico' || ROLE === 'titolare' || ROLE === 'segreteria';
    if(puoPianificare && window._moStatoOrig === 'da_pianificare' && payload.tecnico_id && payload.data_pianificata) payload.stato = 'pianificato';
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
  ricordaPosizionePagina();
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
  ricordaPosizionePagina();
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


