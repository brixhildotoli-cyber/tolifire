// ── INTERVENTI ────────────────────────────────────────────────
async function loadOdl(){const {data}=await db.from('ordini_lavoro').select('*,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)').is('eliminato_il',null).order('data_pianificata',{ascending:false});ODLS=data||[];
  // F2.2 — motivo degli interventi tornati in coda perché non completati
  _motiviRiprog=await caricaMotiviRiprogrammare(ODLS.filter(o=>o.stato==='da_pianificare').map(o=>o.id));
  renderO(ODLS);}
var _motiviRiprog={};
function renderO(data){const tb=ge('otbody');if(!data.length){tb.innerHTML='<tr><td colspan="7"><div class="empty">Nessun intervento</div></td></tr>';return;}tb.innerHTML=data.map(o=>`<tr>
    <td style="color:var(--m)">#${o.numero||'—'}</td>
    <td><strong>${esc(o.clienti?.ragione_sociale||'—')}</strong></td>
    <td>${tl(o.tipo)}</td>
    <td>${o.utenti?esc(o.utenti.nome+' '+o.utenti.cognome):'<span style="color:var(--r)">Non assegnato</span>'}</td>
    <td>${fd(o.data_pianificata)||'<span style="color:var(--a)">Da pianificare</span>'}</td>
    <td>${bs(o.stato)}${o.stato==='da_pianificare'&&_motiviRiprog[o.id]?boxRiprogrammare(_motiviRiprog[o.id]):''}</td>
    <td style="display:flex;gap:6px">
      ${(ROLE==='titolare'||ROLE==='capo_tecnico'||ROLE==='segreteria')?`<button class="btn sm" onclick="openEditOdl('${o.id}')">✏️ Modifica</button>`:''}
      ${(ROLE==='titolare'||ROLE==='capo_tecnico')?`<button class="btn sm" style="color:var(--r)" onclick="eliminaOdl('${o.id}')">🗑️</button>`:''}
    </td>
  </tr>`).join('');}
function filterO(){const q=v('osearch').toLowerCase(),s=v('ofilt');renderO(ODLS.filter(o=>(!q||(o.clienti?.ragione_sociale||'').toLowerCase().includes(q))&&(!s||(s==='da_riprogrammare'?(o.stato==='da_pianificare'&&!!_motiviRiprog[o.id]):o.stato===s))));}

// ── DOCUMENTI ─────────────────────────────────────────────────
async function loadDocs(){
  // F2.2 — le schede non completate (impossibilitato) non arrivano a
  // segreteria, contabilità e commerciale (vedeSchedeNonCompletate, js/11)
  let qSchede=db.from('schede_lavoro').select('*,clienti(ragione_sociale),utenti!schede_lavoro_tecnico_id_fkey(nome,cognome)').is('eliminato_il',null).order('creato_il',{ascending:false});
  if(!vedeSchedeNonCompletate()) qSchede=qSchede.not('impossibilitato','is',true);
  const [sr,dr,rr]=await Promise.all([
    qSchede,
    db.from('ddt').select('*,clienti(ragione_sociale)').is('eliminato_il',null).order('creato_il',{ascending:false}),
    db.from('relazioni_tecniche').select('*,clienti(ragione_sociale),utenti!relazioni_tecniche_tecnico_id_fkey(nome,cognome)').order('creato_il',{ascending:false}),
  ]);
  const st=sr.data||[];ge('stbody').innerHTML=!st.length?'<tr><td colspan="7"><div class="empty">Nessuna scheda</div></td></tr>':st.map(s=>`<tr><td>#${s.numero||'—'}</td><td>${esc(s.clienti?.ragione_sociale||'—')}</td><td>${esc(s.utenti?s.utenti.nome+' '+s.utenti.cognome:'—')}</td><td>${fd(s.data_intervento)}</td><td>${s.esito?be(s.esito):'—'}</td><td>${s.impossibilitato?'<span class="bx berr">Non completata</span>':bs(s.stato)}</td><td><button class="btn sm" onclick="openScheda('${s.id}')">📄 Gestisci</button>
      <button class="btn sm" onclick="stampaRapportoIntervento('${s.id}')">📋 Rapporto</button>
      <button class="btn sm" onclick="stampaRelazionePorteREI('${s.id}')" title="Solo se ci sono porte REI">🚪 Porte</button>
      ${ROLE==='titolare'?`<button class="btn sm" style="color:var(--r)" onclick="eliminaScheda('${s.id}')">🗑️</button>`:''}</td></tr>`).join('');
 const dt = dr.data || [];
ge('dtbody').innerHTML = !dt.length
  ? '<tr><td colspan="5"><div class="empty">Nessun DDT</div></td></tr>'
  : dt.map(function(d) {
      var puoModificare = ROLE === 'segreteria' || ROLE === 'titolare';
      return `<tr data-ddt-id="${esc(d.id)}" data-ddt-odl="${esc(d.odl_id || '')}" data-ddt-scheda="${esc(d.scheda_lavoro_id || '')}">
        <td>#${d.numero || '—'}</td>
        <td>${esc(d.clienti?.ragione_sociale || '—')}</td>
        <td>${fd(d.data_emissione)}</td>
        <td>${esc(d.causale || '—')}</td>
        <td style="display:flex;gap:6px">
          <button class="btn sm" onclick="stampaDDT('${d.id}')">🖨️ PDF</button>
          ${puoModificare ? `<button class="btn sm" onclick="modificaDDT('${d.id}')">✏️ Modifica</button>` : ''}
          ${ROLE === 'titolare' ? `<button class="btn sm" style="color:var(--r)" onclick="eliminaDDT('${d.id}')">🗑️</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  const rt=rr.data||[];ge('rttbody').innerHTML=!rt.length?'<tr><td colspan="7"><div class="empty">Nessuna relazione</div></td></tr>':rt.map(r=>`<tr><td>#${r.numero||'—'}</td><td>${esc(r.clienti?.ragione_sociale||'—')}</td><td>${esc((r.tipo_impianto||'').replace(/_/g,' '))}</td><td>${fd(r.data_sopralluogo)}</td><td>${be(r.esito)}</td><td>${r.intervento_straordinario?'<span class="bx berr">Sì</span>':'<span class="bx bok">No</span>'}</td><td><button class="btn sm">Vedi</button></td></tr>`).join('');
}

// ── SELECTS ───────────────────────────────────────────────────
async function loadCS(){
let query = db
  .from('clienti')
  .select('id,ragione_sociale')
  .is('eliminato_il', null)
  .order('ragione_sociale');

if (ROLE === 'rappresentante') {
  query = query.eq('rappresentante_id', ME.id);
}

// Tecnico: con le policy per ruolo (sql/08) in "clienti" vede solo i clienti
// dei suoi interventi; per la tendina "nuovo intervento" usa la RPC che dà solo
// id e ragione sociale di tutti. Se la RPC non esiste ancora resta la lettura diretta.
let risTecnico = null;
if (ROLE === 'tecnico') {
  risTecnico = await db.rpc('elenco_clienti_base');
  if (risTecnico.error) risTecnico = null;
}

const { data, error } = risTecnico || await query;
  if(error){console.warn('loadCS:',error.message);return;}
  CLIS=data||[];
  ['tc1','mo1','mpcl'].forEach(id=>{const el=ge(id);if(!el)return;const cur=el.value;el.innerHTML='<option value="">Seleziona cliente...</option>'+(data||[]).map(c=>`<option value="${c.id}">${esc(c.ragione_sociale)}</option>`).join('');if(cur)el.value=cur;});
}
async function loadUS(){
  const {data,error}=await db.from('utenti').select('id,nome,cognome,ruolo').eq('attivo',true).order('nome');
  if(error){console.warn('loadUS:',error.message);return;}
  UTENTI=data||[];const tec=(data||[]).filter(u=>['tecnico','capo_tecnico'].includes(u.ruolo));
  ['tc5','mo5'].forEach(id=>{const el=ge(id);if(!el)return;el.innerHTML='<option value="">Seleziona tecnico...</option>'+tec.map(u=>`<option value="${u.id}">${esc(u.nome)} ${esc(u.cognome)} (${u.ruolo})</option>`).join('');});
}

async function toggleAttivoUtente(id, attivoAttuale) {
  var r = await db.from('utenti').update({attivo: !attivoAttuale}).eq('id', id);
  if(r.error) { toast('Errore: '+r.error.message,'err'); return; }
  toast(attivoAttuale ? 'Utente disattivato' : 'Utente riattivato', 'ok');
  loadTeam(); loadUS();
}

async function eliminaUtente(id, nome) {
  if(id === ME.id) { toast('Non puoi eliminare il tuo account', 'err'); return; }
  if(!confirm('Eliminare definitivamente ' + nome + '?\nAttenzione: questa azione è irreversibile.')) return;
  // Prima disattiva su auth (non possiamo eliminare utenti auth da client)
  // Elimina dalla tabella utenti
  var r = await db.from('utenti').delete().eq('id', id);
  if(r.error) {
    // F7.1: chi ha documenti (o altri dati collegati) non si elimina, si disattiva
    if(r.error.code === '23503') { toast(nome + ' ha documenti o lavori collegati: non si può eliminare, disattivalo', 'err'); return; }
    toast('Errore: '+r.error.message,'err'); return;
  }
  toast(nome + ' eliminato', 'ok');
  loadTeam(); loadUS();
}

async function loadTeam(){
  const {data,error}=await db.from('utenti').select('*').order('ruolo').order('nome');
  const el=ge('teamlist');if(!el)return;
  if(error){el.innerHTML=`<div class="al2 e">Errore: ${error.message}</div>`;return;}
  if(!data?.length){el.innerHTML='<div class="empty">Nessun utente</div>';return;}
  el.innerHTML=`<table><thead><tr><th>Nome</th><th>Ruolo</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>${data.map(u=>`<tr>
    <td><strong>${esc(u.nome)} ${esc(u.cognome)}</strong><br><span style="font-size:11px;color:var(--m)">${esc(u.email)}</span></td>
    <td><span class="bx bblue">${esc(etichettaRuolo(u.ruolo))}</span></td>
    <td>${u.attivo?'<span class="bx bok">Attivo</span>':'<span class="bx bgray">Inattivo</span>'}</td>
    <td style="display:flex;gap:6px">
      ${typeof openSchedaDocumenti==='function'&&canAccessPage('scheda-documenti')?`<button class="btn sm" title="Documenti con scadenza (F7.1)" onclick="openSchedaDocumenti('dipendente','${u.id}')">🪪 Documenti</button>`:''}
      <button class="btn sm" onclick="toggleAttivoUtente('${u.id}',${u.attivo})">${u.attivo?'⏸️ Disattiva':'▶️ Riattiva'}</button>
      ${u.id!==ME?.id?`<button class="btn sm" style="color:var(--r)" onclick="eliminaUtente('${u.id}','${esc(u.nome)} ${esc(u.cognome)}')">🗑️</button>`:''}
    </td>
  </tr>`).join('')}</tbody></table>`;
}
async function loadImp(){
  const {data}=await db.from('impostazioni').select('*').eq('id',1).maybeSingle();if(!data)return;
  IMPOSTAZIONI=data;
  mostraSoglie();
  // F14.2: sezione Regole (solo titolare; senza sql/62 i predefiniti in sola lettura)
  if(ROLE==='titolare'&&ge('si-regole'))mostraRegoleImpostazioni().catch(e=>console.warn('Regole:',e));
  // F14.3: festività e controllo orario (solo titolare; senza sql/63 predefinite in sola lettura, js/56)
  if(ROLE==='titolare'&&ge('si-festivita')&&typeof mostraFestivitaImpostazioni==='function')mostraFestivitaImpostazioni().catch(e=>console.warn('Festività:',e));
  // F14.4: motore unico delle scadenze (solo titolare; senza sql/64 "non ancora attivo", js/57)
  if(ROLE==='titolare'&&ge('si-scadenze')&&typeof mostraMotoreScadenzeImpostazioni==='function')mostraMotoreScadenzeImpostazioni().catch(e=>console.warn('Scadenze:',e));
  // #nc (nome azienda nella barra) non esiste più dal commit 865b6ba: resta solo il titolo della scheda.
  if(data.ragione_sociale){const nc=ge('nc');if(nc)nc.textContent=data.ragione_sociale.split(' ')[0];document.title=data.ragione_sociale+' — Gestionale';}
  const fs=['ragione_sociale','indirizzo','cap','citta','piva','telefono','email'];const is=['si1','si2','si3','si4','si5','si6','si7'];
  fs.forEach((f,i)=>{const el=ge(is[i]);if(el)el.value=data[f]||'';});
}

// Soglie e tariffe (F3.2): modificabili dal titolare (policy impo_update:
// solo titolare, e informatico che il DB tratta come titolare).
// soglia_lavoro_grande e giorni_preavviso_rinnovo arrivano con sql/20: finché
// le colonne non esistono i due campi restano disattivati e non si salvano.
let IMPOSTAZIONI=null;
const CAMPI_SOGLIE=[
  {col:'soglia_lavoro_grande',id:'si-soglia-lavoro-grande',intero:false,max:null},
  {col:'giorni_preavviso_rinnovo',id:'si-preavviso-rinnovo',intero:true,max:365},
  // F7.1: preavviso scadenza documenti di team e subappalti (sql/32, default 30)
  {col:'giorni_preavviso_documenti',id:'si-preavviso-documenti',intero:true,max:365,obbligatorio:true,msg:'Il preavviso dei documenti è obbligatorio (0 = nessun preavviso)'},
  {col:'tariffa_oraria_standard',id:'si-tariffa-oraria',intero:false,max:null,obbligatorio:true}
];
function mostraSoglie(){
  if(!ge('si-tariffa-oraria'))return;
  const data=IMPOSTAZIONI||{};
  let mancanti=0;
  CAMPI_SOGLIE.forEach(c=>{
    const el=ge(c.id);if(!el)return;
    const presente=Object.prototype.hasOwnProperty.call(data,c.col);
    el.disabled=!presente;
    if(!presente)mancanti++;
    el.value=(presente&&data[c.col]!==null&&data[c.col]!==undefined)?data[c.col]:'';
  });
  const nota=ge('si-soglie-nota');
  if(nota)nota.style.display=mancanti?'block':'none';
}
async function saveSoglie(){
  if(ROLE!=='titolare'){toast('Solo il titolare può modificare soglie e tariffe','err');return;}
  if(!IMPOSTAZIONI){toast('Impostazioni non caricate, ricarica la pagina','err');return;}
  const upd={};
  for(const c of CAMPI_SOGLIE){
    if(!Object.prototype.hasOwnProperty.call(IMPOSTAZIONI,c.col))continue;
    const testo=String(v(c.id)).trim().replace(',','.');
    if(testo===''&&c.obbligatorio){toast(c.msg||'La tariffa oraria standard è obbligatoria','err');ge(c.id).focus();return;}
    if(testo===''){upd[c.col]=null;continue;}
    const n=Number(testo);
    if(!isFinite(n)||n<0){toast('Valore non valido: usa un numero positivo','err');ge(c.id).focus();return;}
    if(c.intero&&!Number.isInteger(n)){toast('I giorni di preavviso devono essere un numero intero','err');ge(c.id).focus();return;}
    if(c.max!==null&&n>c.max){toast('Massimo '+c.max+' giorni di preavviso','err');ge(c.id).focus();return;}
    upd[c.col]=n;
  }
  const {data,error}=await db.from('impostazioni').update(upd).eq('id',1).select();
  if(error){toast('Errore: '+error.message,'err');return;}
  if(!data||!data.length){toast('Modifica non salvata: permesso negato','err');return;}
  toast('Soglie e tariffe salvate ✓','ok');
  loadImp();
}


// ── F14.2 — IMPOSTAZIONI > REGOLE (sql/62) ───────────────────────────
// Solo titolare (e informatico). Ogni regola: valore, unità, predefinito
// (↺ lo rimette nel campo), ultima modifica. "Salva regole" manda solo le
// regole cambiate con la RPC salva_regola (il database ricontrolla ruolo,
// minimo, massimo, intero; scrive il registro). Le 4 regole con la colonna
// di impostazioni sono le stesse di "Soglie e tariffe". Senza sql/62 si
// vedono i predefiniti in sola lettura.
function quandoRegola(ts){
  if(!ts)return '';
  try{return new Date(ts).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return '';}
}
function elencoRegoleOrdinato(){
  const righe=REGOLE_STATO.righe||{};
  const chiavi=new Set(REGOLE_PREDEFINITE.map(r=>r.chiave));
  Object.keys(righe).forEach(k=>chiavi.add(k));
  const gruppi=Object.keys(GRUPPI_REGOLE);
  return Array.from(chiavi).map(k=>{
    const r=righe[k],p=regolaPredefinita(k)||{};
    return {
      chiave:k,
      gruppo:r?r.gruppo:p.gruppo,
      ordine:r?r.ordine:p.ordine,
      unita:r?r.unita:p.unita,
      descrizione:r?r.descrizione:p.descrizione,
      predefinito:r?numeroRegola(r.valore_predefinito):numeroRegola(p.valore),
      min:r?numeroRegola(r.valore_minimo):numeroRegola(p.min),
      max:r?numeroRegola(r.valore_massimo):numeroRegola(p.max),
      intero:r?!!r.intero:!!p.intero,
      vuota:r?!!r.vuota_ammessa:!!p.vuota,
      colonna:r?r.colonna_impostazioni:p.colonna,
      valore:leggiRegolaSubito(k),
      daNome:r?r.modificata_da_nome:null,
      il:r?r.modificata_il:null
    };
  }).sort((a,b)=>{
    const ga=gruppi.indexOf(a.gruppo),gb=gruppi.indexOf(b.gruppo);
    return (ga<0?99:ga)-(gb<0?99:gb)||(a.ordine||0)-(b.ordine||0)||a.chiave.localeCompare(b.chiave);
  });
}
// "1.234,5" e "1234,5" → "1234.5"; "30.000" → "30000"; "35.5" → "35.5"
function testoNumeroRegola(x){
  const t=String(x||'').trim().replace(/\s/g,'').replace(/€|%/g,'');
  if(t.includes(','))return t.replace(/\./g,'').replace(',','.');
  if(/^\d{1,3}(\.\d{3})+$/.test(t))return t.replace(/\./g,'');
  return t;
}
function numeroCampoRegola(x){return (x===null||x===undefined)?'':String(x).replace('.',',');}

async function mostraRegoleImpostazioni(){
  const box=ge('si-regole');if(!box)return;
  if(ROLE!=='titolare'){ge('si-regole-card')&&(ge('si-regole-card').style.display='none');return;}
  await caricaRegole(true);
  const attive=REGOLE_STATO.disponibili===true;
  const nota=ge('si-regole-stato');
  if(nota){
    nota.style.display=attive?'none':'block';
    nota.textContent=REGOLE_STATO.disponibili===false
      ?'La sezione Regole non è ancora attiva: serve l’aggiornamento del database (sql/62). Intanto valgono i valori predefiniti qui sotto (sola lettura).'
      :'Regole non lette (rete?): valgono i valori predefiniti. Riprova con ↻.';
  }
  ['si-regole-salva','si-regole-registro','si-regole-motivo'].forEach(id=>{const el=ge(id);if(el)el.disabled=!attive;});
  const elenco=elencoRegoleOrdinato();
  let gruppo=null,html='';
  elenco.forEach(r=>{
    if(r.gruppo!==gruppo){gruppo=r.gruppo;html+=`<div class="regola-gruppo" data-gruppo="${esc(gruppo)}" style="font-size:12px;font-weight:700;margin:14px 0 6px;color:var(--m)">${esc(GRUPPI_REGOLE[gruppo]||gruppo)}</div>`;}
    const limiti=[r.min!==null?'min '+numeroCampoRegola(r.min):'',r.max!==null?'max '+numeroCampoRegola(r.max):'',r.intero?'intero':'',r.vuota?'vuoto ammesso':''].filter(Boolean).join(' · ');
    html+=`<div class="regola-riga" data-gruppo="${esc(r.gruppo)}" data-testo="${esc(((r.descrizione||'')+' '+r.chiave).toLowerCase())}" style="display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--bo)">
      <div style="flex:1 1 260px;min-width:200px">
        <div style="font-size:13px">${esc(r.descrizione)}</div>
        <div style="font-size:11px;color:var(--m)"><code>${esc(r.chiave)}</code>${limiti?' · '+esc(limiti):''}</div>
        ${r.il?`<div style="font-size:11px;color:var(--m)">Cambiata da ${esc(r.daNome||'—')} il ${esc(quandoRegola(r.il))}</div>`:''}
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <input type="text" inputmode="decimal" id="reg-${esc(r.chiave)}" data-chiave="${esc(r.chiave)}" data-iniziale="${esc(numeroCampoRegola(r.valore))}" value="${esc(numeroCampoRegola(r.valore))}" style="width:110px" ${attive?'':'disabled'} placeholder="${r.vuota?'vuota':''}">
        <span style="font-size:12px;min-width:62px">${esc(UNITA_REGOLE[r.unita]||r.unita||'')}</span>
        <button class="btn sm" type="button" title="Rimetti il valore predefinito (${esc(testoValoreRegola(r.predefinito,r.unita))})" onclick="ripristinaRegolaCampo('${esc(r.chiave)}')" ${attive?'':'disabled'}>↺ ${esc(testoValoreRegola(r.predefinito,r.unita))}</button>
      </div>
    </div>`;
  });
  box.innerHTML=html+'<div class="empty" id="si-regole-vuoto" style="display:none">Nessuna regola con questo testo</div>';
  filtraRegoleImpostazioni();
}
// Cerca: nasconde le righe senza ridisegnare (i valori scritti restano)
function filtraRegoleImpostazioni(){
  const box=ge('si-regole');if(!box)return;
  const filtro=String(v('si-regole-cerca')||'').trim().toLowerCase();
  const visibili={};let n=0;
  box.querySelectorAll('.regola-riga').forEach(el=>{
    const ok=!filtro||(el.dataset.testo||'').includes(filtro);
    el.style.display=ok?'flex':'none';
    if(ok){visibili[el.dataset.gruppo]=true;n++;}
  });
  box.querySelectorAll('.regola-gruppo').forEach(el=>{el.style.display=visibili[el.dataset.gruppo]?'block':'none';});
  const vuoto=ge('si-regole-vuoto');if(vuoto)vuoto.style.display=n?'none':'block';
}
function ripristinaRegolaCampo(chiave){
  const r=elencoRegoleOrdinato().find(x=>x.chiave===chiave);const el=ge('reg-'+chiave);
  if(!r||!el)return;
  el.value=numeroCampoRegola(r.predefinito);el.focus();
}
async function salvaRegoleImpostazioni(){
  if(ROLE!=='titolare'){toast('Solo il titolare può modificare le regole','err');return;}
  if(!(await verificaRegoleDisponibili())){toast('Le regole non sono ancora attive (sql/62)','err');return;}
  const elenco=elencoRegoleOrdinato();
  const modifiche=[];
  for(const r of elenco){
    const el=ge('reg-'+r.chiave);if(!el)continue;
    const testo=testoNumeroRegola(el.value);
    const testoGrezzo=String(el.value).trim();
    if(testoGrezzo===String(el.dataset.iniziale||''))continue;
    let n=null;
    if(testo===''){
      if(!r.vuota){toast('“'+r.descrizione+'”: serve un valore','err');el.focus();return;}
    }else{
      n=Number(testo);
      if(!isFinite(n)){toast('“'+r.descrizione+'”: numero non valido','err');el.focus();return;}
      if(r.min!==null&&n<r.min){toast('“'+r.descrizione+'”: minimo '+numeroCampoRegola(r.min),'err');el.focus();return;}
      if(r.max!==null&&n>r.max){toast('“'+r.descrizione+'”: massimo '+numeroCampoRegola(r.max),'err');el.focus();return;}
      if(r.intero&&!Number.isInteger(n)){toast('“'+r.descrizione+'”: serve un numero intero','err');el.focus();return;}
    }
    if(n===r.valore)continue;
    modifiche.push({r,n});
  }
  if(!modifiche.length){toast('Nessuna regola cambiata','ok');return;}
  const motivo=String(v('si-regole-motivo')||'').trim().slice(0,500)||null;
  const bt=ge('si-regole-salva');if(bt)bt.disabled=true;
  let salvate=0;
  try{
    for(const m of modifiche){
      const {error}=await db.rpc('salva_regola',{p_chiave:m.r.chiave,p_valore:m.n,p_nota:motivo});
      if(error){toast('“'+m.r.descrizione+'”: '+error.message,'err');break;}
      salvate++;
    }
  }finally{if(bt)bt.disabled=false;}
  if(salvate){
    toast(salvate===1?'1 regola salvata ✓':salvate+' regole salvate ✓','ok');
    const mo=ge('si-regole-motivo');if(mo)mo.value='';
  }
  svuotaCacheRegole();
  await loadImp(); // rilegge anche le 4 colonne di impostazioni e ridisegna
}
async function apriRegistroRegole(){
  if(ROLE!=='titolare')return;
  const el=ge('mrr-elenco');if(!el)return;
  el.innerHTML='<div class="load">Caricamento...</div>';
  openM('m-registro-regole');
  const {data,error}=await db.from('regole_storico').select('*').order('modificata_il',{ascending:false}).limit(300);
  if(error){el.innerHTML=`<div class="al2 e">Registro non disponibile: ${esc(error.message)}</div>`;return;}
  if(!data||!data.length){el.innerHTML='<div class="empty">Nessuna modifica registrata</div>';return;}
  const info={};elencoRegoleOrdinato().forEach(r=>{info[r.chiave]=r;});
  el.innerHTML=data.map(s=>{
    const r=info[s.chiave]||{descrizione:s.chiave,unita:''};
    return `<div style="padding:8px 0;border-bottom:1px solid var(--bo);font-size:13px">
      <div><b>${esc(r.descrizione)}</b></div>
      <div>${esc(testoValoreRegola(s.valore_prima,r.unita))} → <b>${esc(testoValoreRegola(s.valore_dopo,r.unita))}</b></div>
      <div style="font-size:11px;color:var(--m)">${esc(quandoRegola(s.modificata_il))} · ${esc(s.modificata_da_nome||'—')}${s.modificata_da_ruolo?' ('+esc(etichettaRuolo(s.modificata_da_ruolo))+')':''}${s.nota?' · '+esc(s.nota):''}</div>
    </div>`;
  }).join('');
}
