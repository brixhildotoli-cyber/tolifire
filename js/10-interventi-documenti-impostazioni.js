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

