const SU='https://syjbpxtkcsazpynyvoss.supabase.co';
const SK='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5amJweHRrY3NhenB5bnl2b3NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDA4NTAsImV4cCI6MjA5MDg3Njg1MH0.mzsJpMSNck7lOYJZZM_TdDXRCSGsBB2Zt0-5mcvujmA';
const db=supabase.createClient(SU,SK,{auth:{persistSession:true,autoRefreshToken:true,storage:window.localStorage}});
// Client pubblico per portale cliente (nessun login richiesto)
const dbPublic=supabase.createClient(SU,SK,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{'apikey':SK,'Authorization':'Bearer '+SK}}
});

let ME=null,ROLE=null,CLIS=[],UTENTI=[],ODLS=[],PA=[],PF=[];
let _pianoAnno=new Date().getFullYear(),_pianoMese=new Date().getMonth()+1;
let calCicli=[];
let currentCliId=null;
let progettiClienteDati = [];
let appAnno = new Date().getFullYear();
let appMese = new Date().getMonth();
let appDati = [];

const TIPI_PRESIDI=['estintore','porta_rei','idrante','naspo','luce_emergenza','pompa_antincendio','centrale_rivelazione','sprinkler','uscita_emergenza'];
const TIPI_LABEL={estintore:'🧯 Estintori',porta_rei:'🚪 Porte REI',idrante:'🚿 Idranti',naspo:'🌀 Naspi',luce_emergenza:'💡 Luci emergenza',pompa_antincendio:'⚙️ Pompa antincendio',centrale_rivelazione:'🖥 Centrale rivelazione',sprinkler:'🌧 Sprinkler',uscita_emergenza:'🚪 Uscite emergenza'};
const PERIO_OPT=['mensile','bimestrale','trimestrale','quadrimestrale','semestrale','annuale','biennale'];
const PERIO_MESI={mensile:1,bimestrale:2,trimestrale:3,quadrimestrale:4,semestrale:6,annuale:12,biennale:24};

const NAV={
  titolare:[{id:'dashboard',l:'Dashboard'},{id:'calendario',l:'📅 Calendario'},{id:'piano-mensile',l:'📋 Piano mensile'},{id:'presidi',l:'🧯 Presidi'},{id:'workflow',l:'📋 Da gestire'},{id:'interventi',l:'Interventi'},{id:'clienti',l:'🧍‍♂️ Clienti'},{id:'documenti',l:'Documenti'},{id:'fatture',l:'💰 Fatture'},{id:'catalogo',l:'📦 Catalogo'},{id:'impostazioni',l:'Impostazioni'}],
  capo_tecnico:[{id:'dashboard',l:'Dashboard'},{id:'calendario',l:'📅 Calendario'},{id:'calendario-team',l:'👥 Calendari team'},{id:'piano-mensile',l:'📋 Piano mensile'},{id:'presidi',l:'🧯 Presidi'},{id:'interventi',l:'Interventi'},{id:'clienti',l:' 🧍‍♂️ Clienti'},{id:'documenti',l:'Documenti'}],
  segreteria:[{id:'dashboard',l:'Dashboard'},{id:'calendario',l:'📅 Calendario'},{id:'workflow',l:'📋 Da gestire'},{id:'presidi',l:'🧯 Presidi'},{id:'interventi',l:'Interventi'},{id:'clienti',l:'Clienti'},{id:'documenti',l:'Documenti'},{id:'fatture',l:'💰 Fatture'},{id:'catalogo',l:'📦 Catalogo'}],
  contabile:[{id:'dashboard',l:'Dashboard'},{id:'workflow',l:'💜 Da fatturare'},{id:'fatture',l:'💰 Fatture'},{id:'documenti',l:'Documenti'},{id:'catalogo',l:'📦 Catalogo'}],
  tecnico:[{id:'dashboard',l:'Dashboard'},{id:'calendario-tec',l:'📅 Il mio calendario'},{id:'tecnico',l:'📝 Esegui intervento'},{id:'documenti',l:'Documenti'}],
  commerciale:[{id:'dashboard',l:'Dashboard'},{id:'clienti',l:' 🧍‍♂️ Clienti'},{id:'presidi',l:'🧯 Presidi'},{id:'documenti',l:'Documenti'},{id:'fatture',l:'💰 Fatture'},{id:'catalogo',l:'📦 Catalogo'}],
  rappresentante:[{id:'dashboard-rapp',l:'Dashboard'},{id:'calendario-appuntamenti', l:'📅 Calendario'},{id:'clienti',l:'🧍‍♂️ Clienti'},{id:'progetti', l:'📐 Progetti'},{id:'presidi',l:'🧯 Presidi'},{id:'sopralluogo',l:'📋 Sopralluogo'},{id:'trattative',l:'💼 Trattative'}],
};

// NAV MOBILE
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


// Checklist operative per tipo intervento
const CKL={
  ordinario_programmato:{
    '🧯 Estintori':['Verifica integrità esterna','Verifica pressione manometro (zona verde)','Verifica peso/carica','Verifica pin sicurezza e sigillo','Verifica leggibilità etichetta e cartellino','Verifica scadenza collaudo','Verifica ubicazione e accessibilità','Verifica segnaletica','Aggiornamento cartellino manutenzione'],
    '🚪 Porte REI / Tagliafuoco':['Controllo chiusura','Controllo chiusura porta','Controllo perno e molla','Controllo guarnizione autoespandenti','Controllo regolazione chiudiporta','Controllo elettromagneti','Controllo maniglione antipanico','Controllo regolatori di chiusura (2 batt.)','Controllo catenaccio asta inf./superiore','Controllo altezza pavimento','Controllo placca di omologa','Controllo boccole a terra','Controllo finestrature','Controllo funzionalità centralina/rilevatori','Controllo serratura antipanico','Controllo snervatura manto','Lubrificante','Serraggio viti maniglia'],
    '🚪 Uscite emergenza':['Controllo chiusura','Controllo fissaggio','Controllo regolazione chiudiporta','Controllo maniglione antipanico','Controllo fissaggio sopraluce','Controllo catenaccio asta inf./superiore','Controllo perno molla','Lubrificante'],
    '🚿 Idranti / Naspi':['Verifica integrità cassetta','Verifica manichetta (crepe, rotture)','Verifica lance e raccordi','Verifica valvola di intercettazione','Test apertura valvola','Verifica segnaletica','Aggiornamento cartellino'],
    '💡 Luci emergenza':['Verifica accensione manuale','Test autonomia (simulazione mancanza rete)','Verifica illuminazione adeguata vie fuga','Verifica segnaletica','Verifica fissaggio corpi illuminanti'],
    '📋 Generale':['Documentazione completata','Cliente informato delle anomalie','Foto anomalie scattate (se presenti)','Firma cliente raccolta']
  },
  ordinario_chiamata:{'📋 Intervento su chiamata':['Identificazione problema segnalato','Diagnosi causa','Intervento risolutivo eseguito','Verifica funzionamento post-intervento','Documentazione completata','Firma cliente raccolta']},
  straordinario:{'📋 Straordinario':['Sopralluogo e valutazione','Intervento eseguito','Verifica post-intervento','Foto prima e dopo','Relazione tecnica compilata','Firma cliente raccolta']},
  corso:{'📋 Corso antincendio':['Registro presenze compilato','Materiale didattico distribuito','Teoria antincendio illustrata','Utilizzo estintori praticato','Procedure evacuazione illustrate','Test finale somministrato','Attestati compilati']}
};

// Checklist dettagliata per relazione tecnica PDF (per singolo presidio)
const CKL_PRESIDIO = {
  porta_rei: ['Controllo chiusura','Controllo chiusura porta','Controllo perno e molla','Controllo guarnizione autoespandenti','Controllo regolazione chiudiporta','Controllo elettromagneti','Controllo maniglione antipanico','Controllo regolatori di chiusura (2 batt.)','Controllo catenaccio asta inf./superiore','Controllo altezza pavimento','Controllo placca di omologa','Controllo boccole a terra','Controllo finestrature','Controllo funzionalità centralina/rilevatori','Controllo serratura antipanico','Controllo snervatura manto','Lubrificante','Serraggio viti maniglia'],
  uscita_emergenza: ['Controllo chiusura','Controllo fissaggio','Controllo regolazione chiudiporta','Controllo maniglione antipanico','Controllo fissaggio sopraluce','Controllo catenaccio asta inf./superiore','Controllo perno molla','Lubrificante'],
  estintore: ['Verifica integrità esterna','Verifica pressione manometro','Verifica peso/carica','Verifica pin sicurezza e sigillo','Verifica leggibilità etichetta','Verifica scadenza collaudo','Verifica ubicazione','Aggiornamento cartellino'],
  idrante: ['Verifica integrità cassetta','Verifica manichetta','Verifica lance e raccordi','Verifica valvola intercettazione','Test apertura valvola','Verifica segnaletica'],
  naspo: ['Verifica integrità cassetta','Verifica manichetta','Verifica raccordi e lance','Verifica valvola','Verifica segnaletica'],
  luce_emergenza: ['Verifica accensione','Test autonomia','Verifica illuminazione vie fuga','Verifica segnaletica','Verifica fissaggio'],
};

const WFS=['firmata','approvata','inviata_cliente','da_fatturare','fatturata'];
const WFL={firmata:'🔴 Firmata dal tecnico',approvata:'🟡 Approvata da segreteria',inviata_cliente:'🟢 Inviata al cliente',da_fatturare:'💜 Da fatturare',fatturata:'✅ Fatturata'};

function ge(id){return document.getElementById(id);}
function v(id){const el=ge(id);return el?el.value:'';}
function toast(msg,type='ok'){const t=ge('toast');t.textContent=msg;t.className='toast on '+type;setTimeout(()=>t.classList.remove('on'),4000);}
function fd(d){if(!d)return'—';try{return new Date(d+'T00:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});}catch(e){return d;}}
// Escape HTML per dati provenienti dal DB o dall'utente prima dell'interpolazione in innerHTML.
function esc(s){return String(s??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

// B7 — Soft-delete helper. Marca la riga come eliminata anziche' cancellarla.
// Tracking automatico di chi e quando tramite eliminato_il e eliminato_da.
function softDel(tabella){
  return db.from(tabella).update({ eliminato_il: new Date().toISOString(), eliminato_da: ME?.id || null });
}
function openM(id){
  if(id==='m-odl') {
    var editId = ge('mcli-odl-id');
    if(!editId || !editId.value) {
      if(ge('modal-odl-title')) ge('modal-odl-title').textContent='Nuovo intervento';
    }
  }
  var el = ge(id);
  if(!el) return;
  el.classList.add('on');
  // Aggiungi listener click-fuori se non già presente
  if(!el._mbgListener) {
    el._mbgListener = function(e){ if(e.target===this) closeM(id); };
    el.addEventListener('click', el._mbgListener);
  }
}
function closeM(id){
  var el = ge(id);
  if(el) el.classList.remove('on');
}
// Helper per modal dinamici (evita problemi con escape negli onclick inline)
window.chiudiModal = function(id) { closeM(id); };
// Listener per modal statici già nel DOM
document.querySelectorAll('.mbg').forEach(function(m){
  if(!m._mbgListener) {
    m._mbgListener = function(e){ if(e.target===this) this.classList.remove('on'); };
    m.addEventListener('click', m._mbgListener);
  }
});

// All'avvio: controlla se è richiesto il portale cliente
(async function() {
  var isPortale = await checkPortaleCliente();
  if(isPortale) return; // Non mostrare login

  // Altrimenti controlla sessione normale
  var {data:{session}} = await db.auth.getSession();
  if(session) {
    var {data:ud} = await db.from('utenti').select('*').eq('id', session.user.id).maybeSingle();
    if(ud) { await boot(ud); return; }
  }
  ge('lp').style.display = 'flex';
})();
function stab(btn,tc){const pg=btn.closest('.page')||btn.closest('.modal')||document;pg.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));pg.querySelectorAll('.tc').forEach(t=>t.classList.remove('on'));btn.classList.add('on');const el=ge(tc);if(el)el.classList.add('on');}
function sc(d){if(!d)return'';const days=Math.floor((new Date(d+'T00:00:00')-new Date())/86400000);return days<0?'se':days<=30?'se':days<=90?'sw':'si';}
function dd2(d){if(!d)return'—';const diff=Math.floor((new Date(d+'T00:00:00')-new Date())/86400000);return diff<0?'Scaduto da '+Math.abs(diff)+'gg':diff+'gg';}
function tpl(t){return TIPI_LABEL[t]||t||'—';}
function tl(t){return{ordinario_programmato:'Manutenzione ordinaria',ordinario_chiamata:'Su chiamata',straordinario:'Straordinario',corso:'Corso antincendio'}[t]||t||'—';}
function al2(a){return{polvere_abc:'Polvere ABC',co2:'CO₂',schiuma:'Schiuma',idrico:'Idrico'}[a]||a||'—';}
function si2(s){return{ok:'✅',anomalia:'⚠️',scaduto:'❌',fuori_servizio:'🔴'}[s]||'•';}
function bs(s){const m={da_pianificare:'<span class="bx bgray">Da pianificare</span>',pianificato:'<span class="bx bblue">Pianificato</span>',completato:'<span class="bx bok">Completato</span>',bozza:'<span class="bx bgray">Bozza</span>',firmata:'<span class="bx berr">Da approvare</span>',approvata:'<span class="bx bwarn">Approvata</span>',inviata_cliente:'<span class="bx bok">Inviata cliente</span>',da_fatturare:'<span class="bx bpur">Da fatturare</span>',fatturata:'<span class="bx bok">Fatturata</span>',emessa:'<span class="bx bok">Emessa</span>',annullata:'<span class="bx berr">Annullata</span>'};return m[s]||`<span class="bx bgray">${s||'—'}</span>`;}
// Badge per stato_pagamento di fatture/scadenze
function bsPag(s){const m={da_pagare:'<span class="bx bgray">Da pagare</span>',in_riba:'<span class="bx bblue">In RIBA</span>',pagata:'<span class="bx bok">Pagata</span>',parzialmente_pagata:'<span class="bx bwarn">Parz. pagata</span>',insoluta:'<span class="bx berr">Insoluta</span>',sollecitata:'<span class="bx berr">Sollecitata</span>',aperta:'<span class="bx bgray">Aperta</span>'};return m[s]||`<span class="bx bgray">${s||'—'}</span>`;}
function be(e){const m={conforme:'<span class="bx bok">Conforme</span>',conforme_osservazioni:'<span class="bx bwarn">Con osservazioni</span>',non_conforme:'<span class="bx berr">Non conforme</span>',non_conforme_urgente:'<span class="bx berr">URGENTE</span>'};return m[e]||`<span class="bx bgray">${e||'—'}</span>`;}
function bc(s){return{attivo:'<span class="bx bok">Attivo</span>',prospect:'<span class="bx bblue">Prospect</span>',sospeso:'<span class="bx bwarn">Sospeso</span>',perso:'<span class="bx bgray">Perso</span>'}[s]||`<span class="bx bgray">${s||'—'}</span>`;}
function ir(l,v2){return `<div style="padding:8px;background:var(--bg);border-radius:var(--rs)"><div style="font-size:11px;color:var(--m);margin-bottom:2px">${l}</div><div style="font-size:13px;font-weight:500">${esc(v2||'—')}</div></div>`;}

// ── AUTH ──────────────────────────────────────────────────────
async function doLogin(){
  const email=v('lem').trim(),pwd=v('lpw');
  if(!email||!pwd){toast('Inserisci email e password','err');return;}
  const btn=ge('lbtn');btn.disabled=true;btn.textContent='Accesso in corso...';ge('lerr').innerHTML='';
  try{
    const {data,error}=await db.auth.signInWithPassword({email,password:pwd});
    if(error){throw error;}
    await new Promise(r=>setTimeout(r,800));
    let ud=null;
    const {data:u1}=await db.from('utenti').select('*').eq('id',data.user.id).maybeSingle();
    if(u1)ud=u1;
    else{
      const {data:u2}=await db.from('utenti').select('*').eq('email',email).maybeSingle();
      if(u2)ud=u2;
    }
    if(!ud){throw new Error('Utente non trovato nel sistema. Contatta Brixhildo.');}
    await boot(ud);
  }catch(e){
    ge('lerr').innerHTML=`<div class="al2 e">${e.message}</div>`;
    btn.disabled=false;btn.textContent='Accedi';
  }
}

async function doLogout(){await db.auth.signOut();location.reload();}

async function boot(ud){
  ME=ud;ROLE=ud.ruolo;
  ge('lp').style.display='none';ge('nav').classList.add('on');ge('app').style.display='block';
  ge('nusr').textContent=esc(ud.nome)+' — Esci';ge('nrole').textContent=ud.ruolo;
  ge('ddate').textContent=new Date().toLocaleDateString('it-IT',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  buildNav();buildSB();
  const today=new Date().toISOString().split('T')[0];const now=new Date();
  ge('tc3').value=today;ge('mo3').value=today;
  ge('tc4').value=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  await Promise.all([loadCS(),loadUS(),loadImp(),loadTeam()]);
  if(ROLE==='rappresentante'){gotoPage('dashboard-rapp');}else{loadDash();}
}

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
  titolare:       ['dashboard','calendario','piano-mensile','presidi','workflow','interventi','clienti','documenti','fatture','catalogo','impostazioni','cliente-detail','tecnico','sopralluogo'],
  capo_tecnico:   ['dashboard','calendario','calendario-team','piano-mensile','presidi','interventi','clienti','documenti','cliente-detail'],
  segreteria:     ['dashboard','calendario','workflow','presidi','interventi','clienti','documenti','fatture','catalogo','cliente-detail'],
  contabile:      ['dashboard','workflow','fatture','documenti','catalogo'],
  tecnico:        ['dashboard','calendario-tec','tecnico','documenti'],
  commerciale:    ['dashboard','clienti','presidi','documenti','fatture','catalogo','cliente-detail'],
  rappresentante: ['dashboard','dashboard-rapp','calendario-appuntamenti','clienti', 'progetti', 'presidi','sopralluogo','trattative','cliente-detail'],
};

function canAccessPage(id) {
  if(!ROLE) return false;
  var allowed = PAGINE_RUOLO[ROLE] || [];
  return allowed.indexOf(id) !== -1;
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
  if(id==='progetti'){loadPaginaProgetti();}
  if(id==='trattative')loadTrattative();
  if(id==='catalogo'){loadPaginaCatalogo();var _ba=ge('btn-add-prodotto');if(_ba)_ba.style.display=(ROLE==='titolare')?'':'none';var _bi=ge('btn-import-excel');if(_bi)_bi.style.display=(ROLE==='titolare')?'':'none';}
  if(id==='fatture'){loadFatture();}
  if(id==='tecnico')loadOdlTecnico();
  if(id==='sopralluogo' && ROLE!=='rappresentante' && ROLE!=='titolare'){toast('Accesso non consentito','err');return;}
  window.scrollTo(0,0);
}

// ── DASHBOARD ─────────────────────────────────────────────────
async function loadDash(){
  // Smistamento per ruolo: tecnico, titolare, segreteria, capo_tecnico hanno dashboard dedicate.
  var dtSec = ge('dash-tecnico'), ttSec = ge('dash-titolare'), sgSec = ge('dash-segreteria-pg'), ctSec = ge('dash-capo-tecnico-pg'), dsSec = ge('dash-standard');
  function showOnly(sec){
    if(dtSec) dtSec.style.display = (sec==='tecnico') ? 'block' : 'none';
    if(ttSec) ttSec.style.display = (sec==='titolare') ? 'block' : 'none';
    if(sgSec) sgSec.style.display = (sec==='segreteria') ? 'block' : 'none';
    if(ctSec) ctSec.style.display = (sec==='capo_tecnico') ? 'block' : 'none';
    if(dsSec) dsSec.style.display = (sec==='standard') ? 'block' : 'none';
  }
  if(ROLE==='tecnico'){ showOnly('tecnico'); await loadDashTecnico(); return; }
  if(ROLE==='titolare'){ showOnly('titolare'); await loadDashTitolare(); return; }
  if(ROLE==='segreteria'){ showOnly('segreteria'); await loadDashSegreteriaPg(); return; }
  if(ROLE==='capo_tecnico'){ showOnly('capo_tecnico'); await loadDashCapoTecnicoPg(); return; }
  showOnly('standard');
  const today=new Date().toISOString().split('T')[0];const in30=new Date(Date.now()+30*86400000).toISOString().split('T')[0];
  // Query KPI filtrate per ruolo
  var qOdl = db.from('ordini_lavoro').select('id',{count:'exact'}).is('eliminato_il',null).eq('data_pianificata',today);
  if(ROLE==='tecnico') qOdl = qOdl.eq('tecnico_id', ME.id);
  const [o,wf,fat,c]=await Promise.all([
    qOdl,
    db.from('schede_lavoro').select('id',{count:'exact'}).is('eliminato_il',null).eq('stato','firmata'),
    db.from('schede_lavoro').select('id',{count:'exact'}).is('eliminato_il',null).eq('stato','da_fatturare'),
    db.from('clienti').select('id',{count:'exact'}).is('eliminato_il',null).eq('stato','attivo'),
  ]);
  ge('ds1').textContent=o.count||0;
  ge('ds2').textContent=ROLE==='contabile'?fat.count||0:wf.count||0;
  ge('ds3').textContent=fat.count||0;
  ge('ds4').textContent=c.count||0;
  // Aggiorna label KPI in base al ruolo
  if(ROLE==='tecnico'){
    ge('ds1').closest('.stat').querySelector('div').textContent='Miei interventi oggi';
    ge('ds2').closest('.stat').querySelector('div').textContent='Schede da approvare';
  }
  if(ROLE==='contabile'){
    ge('ds2').closest('.stat').querySelector('div').textContent='Da fatturare';
  }
  var odlQ = db.from('ordini_lavoro').select('numero,stato,data_pianificata,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)').is('eliminato_il',null).order('creato_il',{ascending:false}).limit(6);
  if(ROLE==='tecnico') odlQ = odlQ.eq('tecnico_id', ME.id);
  const {data:odl}=await odlQ;
  const de=ge('dodl');
  if(!odl?.length){
    var emptyMsg = ROLE==='tecnico' ? 'Nessun intervento assegnato oggi' :
                   ROLE==='commerciale' ? 'Nessun intervento recente' :
                   'Nessun intervento. <button class="btn p sm" onclick="openM(\'m-odl\')">+ Pianifica il primo</button>';
    de.innerHTML='<div class="empty">'+emptyMsg+'</div>';
  }
  else{de.innerHTML=`<table><thead><tr><th>Cliente</th><th>Tecnico</th><th>Data</th><th>Stato</th></tr></thead><tbody>${odl.map(o=>`<tr><td>${esc(o.clienti?.ragione_sociale||'—')}</td><td>${esc(o.utenti?o.utenti.nome+' '+o.utenti.cognome:'—')}</td><td>${fd(o.data_pianificata)}</td><td>${bs(o.stato)}</td></tr>`).join('')}</tbody></table>`;}
  const {data:scl}=await db.from('impianti').select('tipo,matricola,ubicazione,data_prossimo_controllo,clienti(ragione_sociale)').is('eliminato_il',null).lte('data_prossimo_controllo',in30).order('data_prossimo_controllo').limit(10);
  const ds=ge('dscad');
  if(!scl?.length){ds.innerHTML='<div class="empty">✅ Nessun presidio in scadenza nei prossimi 30 giorni</div>';}
  else{ds.innerHTML=scl.map(p=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:0.5px solid var(--bo);font-size:13px"><div><div style="font-weight:500">${esc(p.clienti?.ragione_sociale||'—')}</div><div style="color:var(--m);font-size:12px">${tpl(p.tipo)} ${p.matricola?'#'+esc(p.matricola):''} — ${esc(p.ubicazione||'')}</div></div><div style="text-align:right"><div class="${sc(p.data_prossimo_controllo)}">${fd(p.data_prossimo_controllo)}</div><div style="font-size:11px;color:var(--m)">${dd2(p.data_prossimo_controllo)}</div></div></div>`).join('');}

  // Sezioni specifiche per ruolo
  ge('dash-segreteria') && (ge('dash-segreteria').style.display = ROLE==='segreteria'?'block':'none');
  ge('dash-capo-tecnico') && (ge('dash-capo-tecnico').style.display = ROLE==='capo_tecnico'?'block':'none');
  // Ticket visibili a: segreteria, capo_tecnico, commerciale, titolare
  var vediTicket = ['segreteria','capo_tecnico','commerciale','titolare'].includes(ROLE);
  ge('dash-ticket') && (ge('dash-ticket').style.display = vediTicket ? 'block' : 'none');
  if(ROLE==='segreteria') await loadDashSegreteria();
  if(ROLE==='capo_tecnico') await loadDashCapoTecnico();
  // Richieste modifica: capo_tecnico e titolare
  var vediRichieste = ['capo_tecnico','titolare'].includes(ROLE);
  ge('dash-sezione-richieste') && (ge('dash-sezione-richieste').style.display = vediRichieste ? 'block' : 'none');
  if(vediRichieste) await loadRichiesteModifica();
  if(vediTicket) {
    await loadDashTicket();
    // Auto-refresh ogni 60 secondi
    if(window._ticketRefreshTimer) clearInterval(window._ticketRefreshTimer);
    window._ticketRefreshTimer = setInterval(function(){ loadDashTicket(); }, 60000);
  }
}

// ── DASHBOARD TECNICO (iOS-like) ─────────────────────────────
async function loadDashTecnico(){
  var today = new Date(); today.setHours(0,0,0,0);
  var weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate()+6);
  var todayStr = today.toISOString().split('T')[0];
  var weekEndStr = weekEnd.toISOString().split('T')[0];

  // Saluto + data
  var greet = ge('tec-greet-nome');
  if(greet){
    var h = new Date().getHours();
    var prefix = h<12?'Buongiorno':(h<18?'Buon pomeriggio':'Buonasera');
    greet.textContent = prefix + ', ' + (ME?.nome||'');
  }
  var gd = ge('tec-greet-data');
  if(gd) gd.textContent = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});

  // Carica tutti gli OdL del tecnico da oggi a +6 giorni
  var r = await db.from('ordini_lavoro')
    .select('id,numero,tipo,stato,data_pianificata,fascia_oraria,note_per_tecnico,sede_id,clienti(ragione_sociale,referente_telefono)')
    .is('eliminato_il', null)
    .eq('tecnico_id', ME.id)
    .gte('data_pianificata', todayStr)
    .lte('data_pianificata', weekEndStr)
    .neq('stato','annullato')
    .order('data_pianificata').order('fascia_oraria');
  var odls = r.data || [];

  // Carica sedi referenziate
  var sedeIds = odls.map(function(o){return o.sede_id;}).filter(Boolean);
  var sediMap = {};
  if(sedeIds.length){
    var rs = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta,cap').in('id', sedeIds);
    (rs.data||[]).forEach(function(s){ sediMap[s.id]=s; });
  }

  // Split: oggi vs resto settimana
  var oggi = odls.filter(function(o){return o.data_pianificata === todayStr;});
  var dopo = odls.filter(function(o){return o.data_pianificata !== todayStr;});

  ge('tec-oggi-badge').textContent = oggi.length;
  ge('tec-week-badge').textContent = dopo.length;

  // RENDER OGGI — card grandi, una per intervento
  var oggiEl = ge('tec-oggi-lista');
  if(!oggi.length){
    oggiEl.innerHTML = '<div class="tec-empty"><div class="ico">🎉</div>Nessun intervento per oggi. Goditi la giornata.</div>';
  } else {
    oggiEl.innerHTML = oggi.map(function(o){ return tecCardOggi(o, sediMap); }).join('');
  }

  // RENDER SETTIMANA — raggruppato per giorno, righe compatte
  var weekEl = ge('tec-week-lista');
  if(!dopo.length){
    weekEl.innerHTML = '<div class="tec-empty"><div class="ico">📭</div>Nessun altro intervento nei prossimi giorni.</div>';
  } else {
    // Raggruppa per data
    var perGiorno = {};
    dopo.forEach(function(o){
      var k = o.data_pianificata;
      if(!perGiorno[k]) perGiorno[k] = [];
      perGiorno[k].push(o);
    });
    var giorni = Object.keys(perGiorno).sort();
    var html = '<div class="tec-week">';
    giorni.forEach(function(k){
      var d = new Date(k+'T00:00:00');
      var label = d.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
      html += '<div class="tec-week-day">' + esc(label) + '</div>';
      perGiorno[k].forEach(function(o){
        html += tecRigaSettimana(o);
      });
    });
    html += '</div>';
    weekEl.innerHTML = html;
  }
}

function tecTipoCls(tipo){
  return {ordinario_programmato:'tipo-ord', ordinario_chiamata:'tipo-chi', straordinario:'tipo-str', corso:'tipo-cor'}[tipo] || 'tipo-ord';
}
function tecTipoLabel(tipo){
  return {ordinario_programmato:'🔧 Manutenzione', ordinario_chiamata:'📞 Su chiamata', straordinario:'⚡ Straordinario', corso:'📚 Corso'}[tipo] || tipo || '—';
}
function tecOrario(o){
  if(o.fascia_oraria) return o.fascia_oraria;
  return '—';
}
function tecSedeFmt(o, sediMap){
  var s = o.sede_id ? sediMap[o.sede_id] : null;
  if(!s) return 'Sede principale del cliente';
  var parts = [];
  var head = (s.tipo||'').toUpperCase();
  if(s.nome) head += ' — ' + s.nome;
  if(head) parts.push(head);
  var addr = [s.via, s.civico].filter(Boolean).join(' ');
  if(s.cap) addr = (addr?addr+', ':'') + s.cap;
  if(s.citta) addr = (addr?addr+' ':'') + s.citta;
  if(addr) parts.push(addr);
  return parts.join(' · ');
}

function tecCardOggi(o, sediMap){
  var cls = tecTipoCls(o.tipo);
  var cli = o.clienti?.ragione_sociale || '—';
  var sede = tecSedeFmt(o, sediMap);
  var tel = o.clienti?.referente_telefono;
  var note = o.note_per_tecnico;
  var done = o.stato === 'completato';
  return '<div class="tec-card ' + (done?'done':'') + '" onclick="apriInterventoDiretto(\'' + o.id + '\')">' +
    '<div class="tec-card-bar ' + cls + '"></div>' +
    '<div class="tec-card-top">' +
      '<div class="tec-time"><span class="ico">🕐</span>' + esc(tecOrario(o)) + '</div>' +
      '<span class="tec-tag ' + cls + '">' + tecTipoLabel(o.tipo) + '</span>' +
    '</div>' +
    '<div class="tec-card-client">' + esc(cli) + '</div>' +
    '<div class="tec-card-row"><span class="ico">📍</span><span>' + esc(sede) + '</span></div>' +
    (tel ? '<div class="tec-card-row"><span class="ico">📞</span><span>' + esc(tel) + '</span></div>' : '') +
    (note ? '<div class="tec-card-row notes"><span class="ico">📝</span><span>' + esc(note) + '</span></div>' : '') +
    '<div class="tec-card-cta">' + (done?'✅ Completato — apri scheda':'Tocca per iniziare →') + '</div>' +
  '</div>';
}

function tecRigaSettimana(o){
  var cls = tecTipoCls(o.tipo);
  var cli = o.clienti?.ragione_sociale || '—';
  var fascia = o.fascia_oraria || '';
  var tipoL = tecTipoLabel(o.tipo);
  return '<div class="tec-week-item" onclick="apriInterventoDiretto(\'' + o.id + '\')">' +
    '<div class="tec-week-dot ' + cls + '"></div>' +
    '<div class="tec-week-time' + (fascia?'':' no-time') + '">' + esc(fascia||'—') + '</div>' +
    '<div class="tec-week-body">' +
      '<div class="tec-week-client">' + esc(cli) + '</div>' +
      '<div class="tec-week-meta">' + tipoL + '</div>' +
    '</div>' +
    '<div class="tec-week-chev">›</div>' +
  '</div>';
}

// Apre direttamente la pagina "Esegui intervento" pre-caricando l'OdL selezionato
async function apriInterventoDiretto(odlId){
  gotoPage('tecnico');
  // Aspetta che loadOdlTecnico abbia popolato la select, poi seleziona e precarica
  await loadOdlTecnico();
  var sel = ge('tc-odl');
  if(sel){
    sel.value = odlId;
    await preloadFromOdl();
  }
}

// ── DASHBOARD TITOLARE (iOS-like, KPI + chart, periodo selezionabile) ─
function getPeriodoRange(periodo){
  // Ritorna {start, end} come stringhe YYYY-MM-DD (end ESCLUSIVO).
  var d = new Date(); d.setHours(0,0,0,0);
  var start, end;
  if(periodo === 'oggi'){
    start = new Date(d);
    end = new Date(d); end.setDate(end.getDate()+1);
  } else if(periodo === 'mese'){
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end   = new Date(d.getFullYear(), d.getMonth()+1, 1);
  } else { // 'settimana' (default): lunedì–domenica
    var dow = d.getDay(); // 0=dom, 1=lun, ...
    var offsetToMon = (dow === 0) ? -6 : 1 - dow;
    start = new Date(d); start.setDate(start.getDate()+offsetToMon);
    end = new Date(start); end.setDate(end.getDate()+7);
  }
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
    startTs: start.toISOString(),
    endTs: end.toISOString()
  };
}

function setTitolarePeriodo(p){
  window._dashTitPeriodo = p;
  ['oggi','settimana','mese'].forEach(function(x){
    var el = ge('tit-period-'+x); if(el) el.classList.toggle('on', x === p);
  });
  loadDashTitolare();
}

async function loadDashTitolare(){
  var periodo = window._dashTitPeriodo || 'settimana';
  var range = getPeriodoRange(periodo);
  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var oggiStr = oggi.toISOString().split('T')[0];
  var in30Str = new Date(Date.now()+30*86400000).toISOString().split('T')[0];

  // Saluto
  var h = new Date().getHours();
  var pref = h<12?'Buongiorno':(h<18?'Buon pomeriggio':'Buonasera');
  var gn = ge('tit-greet-nome'); if(gn) gn.textContent = pref + ', ' + (ME?.nome || '');
  var gd = ge('tit-greet-data'); if(gd) gd.textContent = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});

  // Refresh: marca come in_ritardo eventuali OdL diventati tardivi dal solo passare del tempo.
  // Idempotente; ignora errori se la RPC non è (ancora) installata sul DB.
  try { await db.rpc('marca_ritardi_pendenti'); } catch(e){}

  // KPI in parallelo (solo head:true count quando possibile)
  var SOFT_TABLES = ['ordini_lavoro','schede_lavoro','clienti','impianti','ddt','ticket_clienti'];
  var Q = function(tbl){
    var q = db.from(tbl).select('*',{count:'exact',head:true});
    if(SOFT_TABLES.indexOf(tbl) !== -1) q = q.is('eliminato_il', null);
    return q;
  };
  var [
    rCompletati, rPianificati, rRitardo, rDaPianif,
    rPresidiScad, rPresidi30, rCliAtt, rCliNuovi,
    rTecAtt, rDaApprov, rDaFatt
  ] = (await Promise.allSettled([
    Q('ordini_lavoro').eq('stato','completato').gte('data_pianificata',range.start).lt('data_pianificata',range.end),
    Q('ordini_lavoro').eq('stato','pianificato').gte('data_pianificata',range.start).lt('data_pianificata',range.end),
    Q('ordini_lavoro').not('in_ritardo_il','is',null),
    Q('ordini_lavoro').eq('stato','da_pianificare'),
    Q('impianti').lt('data_prossimo_controllo',oggiStr),
    Q('impianti').gte('data_prossimo_controllo',oggiStr).lte('data_prossimo_controllo',in30Str),
    Q('clienti').eq('stato','attivo'),
    Q('clienti').gte('creato_il',range.startTs).lt('creato_il',range.endTs),
    Q('utenti').eq('ruolo','tecnico').eq('attivo',true),
    Q('schede_lavoro').eq('stato','firmata'),
    Q('schede_lavoro').eq('stato','da_fatturare')
  ])).map(function(s){ return s.status === 'fulfilled' ? s.value : { error: s.reason, count: 0 }; });

  function num(r){ return (!r || r.error) ? '—' : (r.count || 0); }
  ge('tit-k-completati').textContent = num(rCompletati);
  ge('tit-k-pianificati').textContent = num(rPianificati);
  ge('tit-k-ritardo').textContent = num(rRitardo);
  ge('tit-k-dapianif').textContent = num(rDaPianif);
  ge('tit-k-presidi-scad').textContent = num(rPresidiScad);
  ge('tit-k-presidi-30').textContent = num(rPresidi30);
  ge('tit-k-cli-attivi').textContent = num(rCliAtt);
  ge('tit-k-cli-nuovi').textContent = num(rCliNuovi);
  ge('tit-k-tec-attivi').textContent = num(rTecAtt);
  ge('tit-k-da-approvare').textContent = num(rDaApprov);
  ge('tit-k-da-fatturare').textContent = num(rDaFatt);

  // Top tecnico nel periodo
  var rTopRaw = await db.from('ordini_lavoro')
    .select('tecnico_id,utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)')
    .is('eliminato_il', null)
    .eq('stato','completato')
    .gte('data_pianificata', range.start)
    .lt('data_pianificata', range.end)
    .not('tecnico_id','is',null);
  var topEl = ge('tit-k-top-tec');
  var topLbl = ge('tit-k-top-tec-label');
  if(rTopRaw.error || !rTopRaw.data || !rTopRaw.data.length){
    if(topEl) topEl.textContent = '—';
    if(topLbl) topLbl.textContent = 'Top tecnico del periodo';
  } else {
    var cnt = {};
    rTopRaw.data.forEach(function(o){
      var k = o.tecnico_id;
      if(!cnt[k]) cnt[k] = { n:0, nome: o.utenti ? (o.utenti.nome + ' ' + o.utenti.cognome) : 'Tecnico' };
      cnt[k].n++;
    });
    var best = Object.values(cnt).sort(function(a,b){ return b.n - a.n; })[0];
    if(topEl) topEl.textContent = esc(best.nome.split(' ')[0]);
    if(topLbl) topLbl.textContent = best.n + ' interventi nel periodo';
  }

  // Valore materiali DDT nel periodo
  var rDdt = await db.from('ddt').select('id').is('eliminato_il', null).gte('data_emissione', range.start).lt('data_emissione', range.end);
  var ddtEl = ge('tit-k-ddt-eur');
  if(rDdt.error || !rDdt.data || !rDdt.data.length){
    if(ddtEl) ddtEl.textContent = '€ 0,00';
  } else {
    var ids = rDdt.data.map(function(d){ return d.id; });
    var rR = await db.from('ddt_righe').select('quantita,prezzo_unitario').in('ddt_id', ids);
    var tot = 0;
    (rR.data||[]).forEach(function(r){ tot += (r.quantita||0) * (r.prezzo_unitario||0); });
    if(ddtEl) ddtEl.textContent = '€ ' + tot.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
  }

  // Chart 8 settimane (indipendente dal periodo selezionato)
  var weeksAgo8 = new Date(); weeksAgo8.setHours(0,0,0,0);
  weeksAgo8.setDate(weeksAgo8.getDate() - 7*8);
  // Allineo a lunedì
  var dow8 = weeksAgo8.getDay();
  weeksAgo8.setDate(weeksAgo8.getDate() + ((dow8 === 0) ? -6 : 1 - dow8));
  var weeksAgoStr = weeksAgo8.toISOString().split('T')[0];
  var rChart = await db.from('ordini_lavoro').select('data_pianificata').is('eliminato_il', null).eq('stato','completato').gte('data_pianificata', weeksAgoStr);
  var weeks = [];
  for(var i=0; i<8; i++){
    var ws = new Date(weeksAgo8); ws.setDate(ws.getDate() + 7*i);
    var we = new Date(ws); we.setDate(we.getDate() + 7);
    weeks.push({ start: ws, end: we, count: 0, label: ws.getDate() + '/' + (ws.getMonth()+1) });
  }
  (rChart.data||[]).forEach(function(o){
    if(!o.data_pianificata) return;
    var d = new Date(o.data_pianificata + 'T00:00:00');
    weeks.forEach(function(w){ if(d >= w.start && d < w.end) w.count++; });
  });
  var maxC = Math.max(1, weeks.reduce(function(m,w){ return Math.max(m, w.count); }, 0));
  var barsEl = ge('tit-chart-bars');
  var lblEl = ge('tit-chart-labels');
  if(barsEl){
    barsEl.innerHTML = weeks.map(function(w){
      var pct = Math.max(4, (w.count / maxC) * 100);
      return '<div class="tit-chart-bar" style="height:'+pct+'%" title="Settimana del '+w.label+': '+w.count+' interventi"><div class="tit-chart-bar-val">'+w.count+'</div></div>';
    }).join('');
  }
  if(lblEl){
    lblEl.innerHTML = weeks.map(function(w){ return '<span>'+w.label+'</span>'; }).join('');
  }

  // Lista interventi in ritardo (top 5)
  var rRit = await db.from('ordini_lavoro')
    .select('id,numero,data_pianificata,stato,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)')
    .is('eliminato_il', null)
    .not('in_ritardo_il','is',null)
    .order('data_pianificata')
    .limit(5);
  var ritEl = ge('tit-ritardo-lista');
  if(ritEl){
    var rows = (rRit.data||[]);
    if(!rows.length){
      ritEl.innerHTML = '<div class="tit-empty">✅ Nessun intervento in ritardo</div>';
    } else {
      ritEl.innerHTML = rows.map(function(o){
        var dt = o.data_pianificata ? new Date(o.data_pianificata + 'T00:00:00') : null;
        var diff = dt ? Math.floor((oggi - dt) / 86400000) : 0;
        var when = dt ? (diff + ' gg fa') : '—';
        var cli = o.clienti?.ragione_sociale || '—';
        var tec = o.utenti ? (o.utenti.nome + ' ' + o.utenti.cognome) : 'Non assegnato';
        return '<div class="tit-list-item" onclick="openEditOdl(\'' + o.id + '\')" style="cursor:pointer">' +
          '<div class="dot"></div>' +
          '<div class="body">' +
            '<div class="cli">' + esc(cli) + '</div>' +
            '<div class="meta">#' + esc(o.numero || '—') + ' · ' + esc(tec) + ' · ' + fd(o.data_pianificata) + '</div>' +
          '</div>' +
          '<div class="when">' + when + '</div>' +
        '</div>';
      }).join('');
    }
  }
}

// ── DASHBOARD SEGRETERIA (iOS-like, Variante A) ─────────────
async function loadDashSegreteriaPg(){
  var ora = new Date().getHours();
  var saluto = ora < 12 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
  var el;
  el = ge('seg-greet-nome'); if(el) el.textContent = saluto + (ME?.nome ? ', ' + esc(ME.nome) : '');
  el = ge('seg-greet-data'); if(el) el.textContent = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});

  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var oggiStr = oggi.toISOString().split('T')[0];
  var in30Str = new Date(Date.now()+30*86400000).toISOString().split('T')[0];
  var SOFT_TABLES = ['ordini_lavoro','schede_lavoro','clienti','impianti','ddt','ticket_clienti'];
  var Q = function(tbl){
    var q = db.from(tbl).select('*',{count:'exact',head:true});
    if(SOFT_TABLES.indexOf(tbl) !== -1) q = q.is('eliminato_il', null);
    return q;
  };

  // Refresh ritardi pendenti (idempotente)
  try { await db.rpc('marca_ritardi_pendenti'); } catch(e){}

  // KPI in parallelo (Promise.allSettled per resilienza)
  var [
    rApprovare, rFatturare, rDaPianif, rRichMod,
    rPresidiScad, rPresidi30, rCliAtt, rInviate
  ] = (await Promise.allSettled([
    Q('schede_lavoro').eq('stato','firmata'),
    Q('schede_lavoro').eq('stato','da_fatturare'),
    Q('ordini_lavoro').eq('stato','da_pianificare'),
    Q('richieste_modifica_odl').eq('stato','in_attesa'),
    Q('impianti').lt('data_prossimo_controllo',oggiStr),
    Q('impianti').gte('data_prossimo_controllo',oggiStr).lte('data_prossimo_controllo',in30Str),
    Q('clienti').eq('stato','attivo'),
    Q('schede_lavoro').eq('stato','inviata_cliente')
  ])).map(function(s){ return s.status === 'fulfilled' ? s.value : { error: s.reason, count: 0 }; });

  function num(r){ return (!r || r.error) ? '—' : (r.count || 0); }
  el = ge('seg-k-approvare'); if(el) el.textContent = num(rApprovare);
  el = ge('seg-k-fatturare'); if(el) el.textContent = num(rFatturare);
  el = ge('seg-k-dapianif'); if(el) el.textContent = num(rDaPianif);
  el = ge('seg-k-richmod'); if(el) el.textContent = num(rRichMod);
  el = ge('seg-k-presidi-scad'); if(el) el.textContent = num(rPresidiScad);
  el = ge('seg-k-presidi-30'); if(el) el.textContent = num(rPresidi30);
  el = ge('seg-k-cli-attivi'); if(el) el.textContent = num(rCliAtt);
  el = ge('seg-k-inviate'); if(el) el.textContent = num(rInviate);

  // Ticket aperti assegnati alla segreteria (top 5)
  var rTk = await db.from('ticket_clienti')
    .select('id,titolo,priorita,tipo,creato_il,clienti(ragione_sociale)')
    .is('eliminato_il', null)
    .eq('stato','aperto').eq('assegnato_a','segreteria')
    .order('creato_il',{ascending:false}).limit(5);
  var elTk = ge('seg-ticket-lista');
  if(elTk){
    var tks = rTk.data || [];
    if(!tks.length){
      elTk.innerHTML = '<div class="rap-list-card"><div class="tit-empty">🎉 Nessuna richiesta cliente aperta</div></div>';
    } else {
      elTk.innerHTML = '<div class="rap-list-card">' + tks.map(function(t){
        var prCls = t.priorita==='urgente'?'urgente':(t.priorita==='alta'?'entro_30gg':'normale');
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:600">'+esc(t.titolo||'(senza titolo)')+'</div>' +
            '<div style="font-size:12px;color:var(--m)">'+esc(t.clienti?.ragione_sociale||'—')+' · '+fd(t.creato_il)+' · '+(t.tipo||'segnalazione')+'</div>' +
          '</div>' +
          '<span class="urg '+prCls+'" style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:20px;text-transform:uppercase;background:var(--gyl);color:var(--m)">'+(t.priorita||'normale')+'</span>' +
        '</div>';
      }).join('') + '</div>';
    }
  }

  // Anagrafiche da completare (per fatturazione)
  var rAnag = await db.from('clienti')
    .select('id,ragione_sociale,indirizzo_fattura,codice_sdi,modalita_pagamento,pec,iban')
    .is('eliminato_il', null)
    .eq('stato','attivo')
    .or('indirizzo_fattura.is.null,codice_sdi.is.null,modalita_pagamento.is.null')
    .order('creato_il',{ascending:false}).limit(8);
  var elAn = ge('seg-anag-lista');
  if(elAn){
    var ans = rAnag.data || [];
    if(rAnag.error){
      elAn.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Errore: '+esc(rAnag.error.message)+'</div></div>';
    } else if(!ans.length){
      elAn.innerHTML = '<div class="rap-list-card"><div class="tit-empty">✅ Tutti i clienti attivi hanno i dati di fatturazione completi</div></div>';
    } else {
      elAn.innerHTML = '<div class="rap-list-card">' + ans.map(function(c){
        var manca = [];
        if(!c.indirizzo_fattura) manca.push('indirizzo');
        if(!c.codice_sdi) manca.push('SDI');
        if(!c.modalita_pagamento) manca.push('mod. pagamento');
        if(!c.pec) manca.push('PEC');
        if(!c.iban) manca.push('IBAN');
        return '<div onclick="openClienteDetail(\''+c.id+'\')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px">' +
          '<div style="font-weight:600">'+esc(c.ragione_sociale)+'</div>' +
          '<div style="font-size:11px;color:var(--a)">manca: '+manca.join(', ')+'</div>' +
        '</div>';
      }).join('') + '</div>';
    }
  }

  // Clienti con modalità RIBA
  var rRiba = await db.from('clienti')
    .select('id,ragione_sociale,modalita_pagamento,giorni_pagamento,iban')
    .is('eliminato_il', null)
    .eq('stato','attivo')
    .ilike('modalita_pagamento','%riba%')
    .order('ragione_sociale').limit(20);
  var elRb = ge('seg-riba-lista');
  if(elRb){
    var rbs = rRiba.data || [];
    if(rRiba.error){
      elRb.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Errore: '+esc(rRiba.error.message)+'</div></div>';
    } else if(!rbs.length){
      elRb.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Nessun cliente con modalità pagamento RIBA</div></div>';
    } else {
      elRb.innerHTML = '<div class="rap-list-card">' + rbs.map(function(c){
        return '<div onclick="openClienteDetail(\''+c.id+'\')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px">' +
          '<div style="font-weight:600">'+esc(c.ragione_sociale)+'</div>' +
          '<div style="font-size:12px;color:var(--m)">'+esc(c.modalita_pagamento||'')+' · '+(c.giorni_pagamento||30)+'gg'+(c.iban?' · IBAN ok':' · <span style="color:var(--a)">IBAN mancante</span>')+'</div>' +
        '</div>';
      }).join('') + '</div>';
    }
  }
}

// ── DASHBOARD CAPO_TECNICO (split lista + calendario settimanale, D&D) ──
// Stato settimana corrente (lunedì 00:00 della settimana mostrata)
window._ctWeekStart = null;

function ctMondayOf(d){
  var x = new Date(d); x.setHours(0,0,0,0);
  var dow = x.getDay();
  x.setDate(x.getDate() + ((dow === 0) ? -6 : 1 - dow));
  return x;
}

async function loadDashCapoTecnicoPg(){
  var ora = new Date().getHours();
  var saluto = ora < 12 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
  var el = ge('ct-greet-nome'); if(el) el.textContent = saluto + (ME?.nome ? ', ' + esc(ME.nome) : '');
  el = ge('ct-greet-data'); if(el) el.textContent = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});

  if(!window._ctWeekStart) window._ctWeekStart = ctMondayOf(new Date());

  // Refresh marcatura ritardi pendenti (idempotente)
  try { await db.rpc('marca_ritardi_pendenti'); } catch(e){}

  // KPI in parallelo
  var Q = function(tbl){
    var SOFT = ['ordini_lavoro','schede_lavoro','clienti','impianti','ddt','ticket_clienti'];
    var q = db.from(tbl).select('*',{count:'exact',head:true});
    if(SOFT.indexOf(tbl) !== -1) q = q.is('eliminato_il', null);
    return q;
  };
  var [rDaPianif, rRitardo, rRichMod, rUrgenti] = (await Promise.allSettled([
    Q('ordini_lavoro').eq('stato','da_pianificare'),
    Q('ordini_lavoro').not('in_ritardo_il','is',null),
    Q('richieste_modifica_odl').eq('stato','in_attesa'),
    Q('ordini_lavoro').eq('stato','da_pianificare').in('tipo',['straordinario','ordinario_chiamata'])
  ])).map(function(s){ return s.status === 'fulfilled' ? s.value : { error:s.reason, count:0 }; });
  function num(r){ return (!r || r.error) ? '—' : (r.count || 0); }
  el = ge('ct-k-dapianif'); if(el) el.textContent = num(rDaPianif);
  el = ge('ct-k-ritardo');  if(el) el.textContent = num(rRitardo);
  el = ge('ct-k-richmod');  if(el) el.textContent = num(rRichMod);
  el = ge('ct-k-urgenti');  if(el) el.textContent = num(rUrgenti);

  // Carica lista da pianificare + calendario settimanale
  await ctLoadListaDaPianificare();
  await ctLoadCalendarioSettimana();

  // Pannelli riusati (refactored per accettare targetId)
  await loadDashCapoTecnico('ct-cicli-mese');
  await loadRichiesteModifica('ct-richieste-modifica');
  await loadDashTicket('ct-ticket-lista');
}

async function ctLoadListaDaPianificare(){
  var el = ge('ct-list-content');
  if(!el) return;
  var r = await db.from('ordini_lavoro')
    .select('id,numero,tipo,data_pianificata,fascia_oraria,in_ritardo_il,note_per_tecnico,materiali_da_portare,clienti(ragione_sociale)')
    .is('eliminato_il', null)
    .eq('stato','da_pianificare')
    .order('in_ritardo_il',{ascending:true,nullsFirst:false})
    .order('creato_il',{ascending:true})
    .limit(40);
  var odls = r.data || [];
  var cntEl = ge('ct-list-count'); if(cntEl) cntEl.textContent = odls.length;
  if(!odls.length){
    el.innerHTML = '<div class="ct-empty">🎉 Nessun intervento da pianificare</div>';
    return;
  }
  el.innerHTML = odls.map(function(o){
    var urg = '';
    if(o.in_ritardo_il) urg = 'urg-ritardo';
    else if(o.tipo === 'straordinario' || o.tipo === 'ordinario_chiamata') urg = 'urg-tipo';
    var cli = o.clienti?.ragione_sociale || '—';
    var tipoLabel = {ordinario_programmato:'Manutenzione',ordinario_chiamata:'Su chiamata',straordinario:'Straordinario',corso:'Corso'}[o.tipo] || o.tipo || '—';
    var tipoCls = {ordinario_programmato:'tipo-ord',ordinario_chiamata:'tipo-chi',straordinario:'tipo-str',corso:'tipo-cor'}[o.tipo] || 'tipo-ord';
    var tags = '<span class="ct-odl-tag '+tipoCls+'">'+esc(tipoLabel)+'</span>';
    if(o.in_ritardo_il) tags += '<span class="ct-odl-tag in-ritardo">⏰ In ritardo</span>';
    var note = o.note_per_tecnico || o.materiali_da_portare;
    return '<div class="ct-odl-card '+urg+'" draggable="true" data-odl="'+o.id+'" ondragstart="ctDragStart(event)" ondragend="ctDragEnd(event)">' +
      '<div class="bar"></div>' +
      '<div class="ct-odl-cli">'+(o.numero?'#'+esc(o.numero)+' · ':'')+esc(cli)+'</div>' +
      '<div class="ct-odl-meta">'+tags+(o.fascia_oraria?' · '+esc(o.fascia_oraria):'')+'</div>' +
      (note ? '<div class="ct-odl-meta" style="margin-top:4px;font-style:italic">📝 '+esc(String(note).substring(0,80))+(String(note).length>80?'…':'')+'</div>' : '') +
    '</div>';
  }).join('');
}

async function ctLoadCalendarioSettimana(){
  var el = ge('ct-cal-grid');
  if(!el) return;
  var monday = new Date(window._ctWeekStart); monday.setHours(0,0,0,0);
  var sunday = new Date(monday); sunday.setDate(sunday.getDate()+6);
  var lbl = ge('ct-cal-week-label');
  if(lbl) lbl.textContent = monday.toLocaleDateString('it-IT',{day:'numeric',month:'short'}) + ' – ' + sunday.toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'});

  // Carica tecnici attivi + interventi della settimana
  var [rTec, rOdl] = await Promise.all([
    db.from('utenti').select('id,nome,cognome').eq('ruolo','tecnico').eq('attivo',true).order('cognome'),
    db.from('ordini_lavoro')
      .select('id,numero,tipo,tecnico_id,data_pianificata,fascia_oraria,stato,in_ritardo_il,clienti(ragione_sociale)')
      .is('eliminato_il', null)
      .gte('data_pianificata', monday.toISOString().split('T')[0])
      .lte('data_pianificata', sunday.toISOString().split('T')[0])
      .neq('stato','annullato')
  ]);
  var tecnici = rTec.data || [];
  var interventi = rOdl.data || [];

  if(!tecnici.length){
    el.innerHTML = '<div class="ct-empty">Nessun tecnico attivo configurato.</div>';
    return;
  }

  // Header giorni + indicazione "oggi"
  var today = new Date(); today.setHours(0,0,0,0);
  var giorni = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  var html = '<table class="ct-cal-table"><thead><tr><th class="tec-col">Tecnico</th>';
  for(var i=0; i<7; i++){
    var d = new Date(monday); d.setDate(d.getDate()+i);
    var isToday = d.getTime() === today.getTime();
    html += '<th class="' + (isToday?'today':'') + '">'+giorni[i]+'<br><span style="font-size:11px;font-weight:600">'+d.getDate()+'</span></th>';
  }
  html += '</tr></thead><tbody>';
  tecnici.forEach(function(t){
    html += '<tr>';
    html += '<td><div class="ct-cal-tec" title="'+esc(t.nome+' '+t.cognome)+'">'+esc(t.nome+' '+(t.cognome||'').charAt(0)+'.')+'</div></td>';
    for(var i=0; i<7; i++){
      var d = new Date(monday); d.setDate(d.getDate()+i);
      var ds = d.toISOString().split('T')[0];
      var isToday = d.getTime() === today.getTime();
      var dayInts = interventi.filter(function(o){ return o.tecnico_id === t.id && o.data_pianificata === ds; });
      var cellHtml = dayInts.map(function(o){
        var urg = '';
        if(o.in_ritardo_il) urg = 'urg-ritardo';
        else if(o.tipo === 'straordinario' || o.tipo === 'ordinario_chiamata') urg = 'urg-tipo';
        var cli = o.clienti?.ragione_sociale || '—';
        return '<div class="ct-cal-ev '+urg+'" draggable="true" data-odl="'+o.id+'" ondragstart="ctEvDragStart(event)" ondragend="ctDragEnd(event)" onclick="ctEvClick(event,\''+o.id+'\')" title="'+esc(cli)+'">' +
          '<div class="ev-cli">'+esc(cli)+'</div>' +
          (o.fascia_oraria?'<div class="ev-meta">'+esc(o.fascia_oraria)+'</div>':'') +
        '</div>';
      }).join('');
      html += '<td class="ct-cal-cell '+(isToday?'today':'')+'" data-tec="'+t.id+'" data-day="'+ds+'" ondragover="ctDragOver(event)" ondragleave="ctDragLeave(event)" ondrop="ctDrop(event)">' + cellHtml + '</td>';
    }
    html += '</tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function ctWeekPrev(){
  var d = new Date(window._ctWeekStart); d.setDate(d.getDate()-7);
  window._ctWeekStart = d;
  ctLoadCalendarioSettimana();
}
function ctWeekNext(){
  var d = new Date(window._ctWeekStart); d.setDate(d.getDate()+7);
  window._ctWeekStart = d;
  ctLoadCalendarioSettimana();
}
function ctWeekToday(){
  window._ctWeekStart = ctMondayOf(new Date());
  ctLoadCalendarioSettimana();
}

// Drag & drop — sorgente: card lista "Da pianificare"
function ctDragStart(e){
  var card = e.target.closest('.ct-odl-card');
  if(!card) return;
  var id = card.getAttribute('data-odl');
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'move';
  card.classList.add('dragging');
}
// Drag & drop — sorgente: evento già nel calendario (drag inverso o riassegnazione)
function ctEvDragStart(e){
  e.stopPropagation();
  var ev = e.target.closest('.ct-cal-ev');
  if(!ev) return;
  var id = ev.getAttribute('data-odl');
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'move';
  ev.classList.add('dragging');
}
// Click su evento già nel calendario: apre modal edit
// (drag e click sono mutuamente esclusivi: il browser non genera click dopo drag)
function ctEvClick(e, odlId){
  e.stopPropagation();
  openEditOdl(odlId);
}
function ctDragEnd(e){
  var card = e.target.closest('.ct-odl-card');
  if(card) card.classList.remove('dragging');
  var ev = e.target.closest('.ct-cal-ev');
  if(ev) ev.classList.remove('dragging');
}
function ctDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var cell = e.target.closest('.ct-cal-cell');
  if(cell) cell.classList.add('drag-over');
}
function ctDragLeave(e){
  var cell = e.target.closest('.ct-cal-cell');
  if(cell) cell.classList.remove('drag-over');
}
async function ctDrop(e){
  e.preventDefault();
  var cell = e.target.closest('.ct-cal-cell');
  if(cell) cell.classList.remove('drag-over');
  var odlId = e.dataTransfer.getData('text/plain');
  if(!odlId || !cell) return;
  var tecId = cell.getAttribute('data-tec');
  var day = cell.getAttribute('data-day');
  // Recupera info per conferma
  var r = await db.from('ordini_lavoro').select('tecnico_id,data_pianificata,clienti(ragione_sociale)').eq('id', odlId).single();
  if(!r.data){ toast('Errore caricamento intervento','err'); return; }
  // No-op se la cella è la stessa
  if(r.data.tecnico_id === tecId && r.data.data_pianificata === day) return;
  var cli = r.data.clienti?.ragione_sociale || 'intervento';
  // Recupera nome tecnico
  var rT = await db.from('utenti').select('nome,cognome').eq('id', tecId).single();
  var tecNome = rT.data ? (rT.data.nome + ' ' + rT.data.cognome) : 'tecnico';
  var dStr = new Date(day+'T00:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
  if(!confirm('Assegnare "'+cli+'" a '+tecNome+' per '+dStr+'?')) return;
  var up = await db.from('ordini_lavoro').update({
    tecnico_id: tecId,
    data_pianificata: day,
    stato: 'pianificato'
  }).eq('id', odlId);
  if(up.error){ toast('Errore: '+up.error.message,'err'); return; }
  toast('✅ Intervento pianificato','ok');
  await loadDashCapoTecnicoPg();
}

// Drop sulla lista "Da pianificare" = drag inverso (annulla assegnazione)
function ctListDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var list = ge('ct-list-content');
  if(list) list.classList.add('drag-over-list');
}
function ctListDragLeave(e){
  // Evita flickering: rimuovi solo se davvero usciamo dal contenitore
  var list = ge('ct-list-content');
  if(!list) return;
  if(e.relatedTarget && list.contains(e.relatedTarget)) return;
  list.classList.remove('drag-over-list');
}
async function ctDropOnList(e){
  e.preventDefault();
  var list = ge('ct-list-content');
  if(list) list.classList.remove('drag-over-list');
  var odlId = e.dataTransfer.getData('text/plain');
  if(!odlId) return;
  var r = await db.from('ordini_lavoro').select('stato,clienti(ragione_sociale)').eq('id', odlId).single();
  if(!r.data){ toast('Errore caricamento intervento','err'); return; }
  // Se già da_pianificare, no-op (utente ha trascinato una card della lista sulla lista stessa)
  if(r.data.stato === 'da_pianificare') return;
  var cli = r.data.clienti?.ragione_sociale || 'intervento';
  if(!confirm('Riportare "'+cli+'" in coda "Da pianificare"? Verranno rimossi tecnico e data assegnati.')) return;
  var up = await db.from('ordini_lavoro').update({
    tecnico_id: null,
    data_pianificata: null,
    stato: 'da_pianificare',
    in_ritardo_il: null
  }).eq('id', odlId);
  if(up.error){ toast('Errore: '+up.error.message,'err'); return; }
  toast('↩️ Intervento rimesso in coda','ok');
  await loadDashCapoTecnicoPg();
}

// ── FOTO TECNICO ─────────────────────────────────────────────
var _fotoTecnico = []; // {file, url, didascalia}

function anteprimaFotoTecnico(input) {
  var nuovi = Array.from(input.files);
  input.value = '';
  nuovi.forEach(function(f) {
    _fotoTecnico.push({file: f, url: URL.createObjectURL(f), didascalia: ''});
  });
  renderFotoPreview();
}

function renderFotoPreview() {
  var div = ge('tc-foto-preview');
  if(!div) return;
  if(!_fotoTecnico.length) { div.innerHTML = ''; return; }
  div.innerHTML = _fotoTecnico.map(function(f, i) {
    var isVideo = f.file.type.startsWith('video/');
    var isPdf = f.file.type === 'application/pdf';
    var thumb = isVideo
      ? '<div style="width:80px;height:80px;background:#000;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px">🎥</div>'
      : isPdf
        ? '<div style="width:80px;height:80px;background:var(--bg);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px">📄</div>'
        : '<img src="'+f.url+'" style="width:80px;height:80px;object-fit:cover;border-radius:8px">';
    return '<div style="position:relative;text-align:center">' +
      thumb +
      '<div onclick="rimuoviFoto('+i+')" style="position:absolute;top:-4px;right:-4px;background:var(--r);color:white;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer">✕</div>' +
      '<input placeholder="Nota..." value="'+f.didascalia+'" oninput="_fotoTecnico['+i+'].didascalia=this.value" style="width:80px;font-size:10px;margin-top:4px;border:0.5px solid var(--bo);border-radius:4px;padding:2px 4px">' +
    '</div>';
  }).join('');
}

function rimuoviFoto(i) {
  _fotoTecnico.splice(i, 1);
  renderFotoPreview();
}

async function uploadFotoIntervento(odlId, schedaId) {
  if(!_fotoTecnico.length) return;
  for(var i=0; i<_fotoTecnico.length; i++) {
    var f = _fotoTecnico[i];
    var ext = f.file.name.split('.').pop();
    var path = 'odl/' + odlId + '/' + Date.now() + '_' + i + '.' + ext;
    var tipo = f.file.type.startsWith('video/') ? 'video' : f.file.type === 'application/pdf' ? 'documento' : 'foto';
    var up = await db.storage.from('foto-interventi').upload(path, f.file);
    if(!up.error) {
      await db.from('schede_foto').insert({
        scheda_id: schedaId,
        odl_id: odlId,
        storage_path: path,
        nome_file: f.file.name,
        didascalia: f.didascalia || null,
        tipo: tipo,
        caricato_da: ME.id
      });
    }
  }
  _fotoTecnico = [];
  renderFotoPreview();
}

// ── PDF RAPPORTO INTERVENTO (stile Toli Fire) ─────────────────
async function stampaRapportoIntervento(schedaId) {
  if(!window.jspdf) { toast('Libreria PDF non caricata, riprova tra qualche secondo','err'); return; }
  var r = await db.from('schede_lavoro')
    .select('*, clienti(ragione_sociale,indirizzo_fattura,citta_fattura,citta), ordini_lavoro(tipo,sede_id), utenti!schede_lavoro_tecnico_id_fkey(nome,cognome)')
    .eq('id', schedaId).single();
  if(r.error) { toast('Errore caricamento scheda','err'); return; }
  var s = r.data;

  // Carica impostazioni azienda
  var ri = await db.from('impostazioni').select('*').eq('id',1).maybeSingle();
  var az = ri.data || {};

  // Carica foto
  var rf = await db.from('schede_foto').select('*').eq('scheda_id', schedaId);
  var foto = rf.data || [];

  // Carica presidi aggiornati
  var rp = await db.from('impianti')
    .select('tipo,matricola,ubicazione,data_ultimo_controllo,stato,note')
    .eq('cliente_id', s.cliente_id)
    .order('tipo');
  var presidi = rp.data || [];

  var { jsPDF } = window.jspdf;
  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  var W = 210, M = 15;

  // ── HEADER ────────────────────────────────
  doc.setFillColor(8, 80, 65);
  doc.rect(0, 0, W, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica','bold');
  doc.text('TOLI FIRE', M, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica','normal');
  doc.text(az.ragione_sociale || 'TOLI S.R.L.', M, 20);
  doc.text('P.I. ' + (az.piva || '02490980501'), M, 25);
  doc.text((az.indirizzo || 'VIA ARCHIMEDE BELLATALLA 98') + ', ' + (az.citta || 'PISA'), M, 30);

  // Numero scheda e data a destra
  doc.setFontSize(11);
  doc.setFont('helvetica','bold');
  doc.text('RAPPORTO DI INTERVENTO', W - M, 13, {align:'right'});
  doc.setFontSize(9);
  doc.setFont('helvetica','normal');
  doc.text('N° ' + (s.numero || '—'), W - M, 19, {align:'right'});
  doc.text('Data: ' + (s.data_intervento ? new Date(s.data_intervento+'T00:00:00').toLocaleDateString('it-IT') : '—'), W - M, 24, {align:'right'});
  if(s.ora_inizio) doc.text('Ore: ' + s.ora_inizio + (s.ora_fine ? ' - ' + s.ora_fine : ''), W - M, 29, {align:'right'});

  doc.setTextColor(30, 30, 30);
  var y = 42;

  // ── CLIENTE ───────────────────────────────
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, W - M*2, 22, 'F');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('CLIENTE', M + 3, y + 5);
  doc.setFontSize(11);
  doc.setFont('helvetica','bold');
  doc.setTextColor(20, 20, 20);
  doc.text(s.clienti?.ragione_sociale || '—', M + 3, y + 11);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  var addr = [s.clienti?.indirizzo_fattura, s.clienti?.citta_fattura || s.clienti?.citta].filter(Boolean).join(', ');
  if(addr) doc.text(addr, M + 3, y + 17);

  // Tecnico a destra
  doc.setFontSize(8);
  doc.setTextColor(120,120,120);
  doc.text('TECNICO', W - M - 55, y + 5);
  doc.setFontSize(10);
  doc.setFont('helvetica','bold');
  doc.setTextColor(20,20,20);
  var tecNome = s.utenti ? s.utenti.nome + ' ' + s.utenti.cognome : '—';
  doc.text(tecNome, W - M - 55, y + 11);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  var tipoLabel = {ordinario_programmato:'Manutenzione ordinaria',ordinario_chiamata:'Su chiamata',straordinario:'Straordinario',corso:'Corso'}[s.ordini_lavoro?.tipo] || '—';
  doc.text(tipoLabel, W - M - 55, y + 17);

  y += 27;

  // ── ESITO ─────────────────────────────────
  var esitoColors = {conforme:[39,174,96],conforme_osservazioni:[243,156,18],non_conforme:[231,76,60],non_conforme_urgente:[192,57,43]};
  var esitoLabels = {conforme:'CONFORME',conforme_osservazioni:'CONFORME CON OSSERVAZIONI',non_conforme:'NON CONFORME',non_conforme_urgente:'NON CONFORME — URGENTE'};
  var ec = esitoColors[s.esito] || [100,100,100];
  doc.setFillColor(ec[0], ec[1], ec[2]);
  doc.rect(M, y, W - M*2, 10, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(11);
  doc.setFont('helvetica','bold');
  doc.text('ESITO: ' + (esitoLabels[s.esito] || s.esito || '—'), W/2, y+7, {align:'center'});
  y += 15;

  doc.setTextColor(30,30,30);

  // ── LAVORI ESEGUITI ───────────────────────
  if(esc(s.lavori_eseguiti)) {
    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    doc.setTextColor(80,80,80);
    doc.text('LAVORI ESEGUITI / MATERIALI UTILIZZATI', M, y);
    y += 4;
    doc.setFont('helvetica','normal');
    doc.setTextColor(30,30,30);
    var lavLines = doc.splitTextToSize(s.lavori_eseguiti, W - M*2);
    doc.text(lavLines, M, y);
    y += lavLines.length * 4 + 4;
  }

  // ── ANOMALIE ──────────────────────────────
  if(esc(s.anomalie_rilevate)) {
    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    doc.setTextColor(80,80,80);
    doc.text('ANOMALIE RILEVATE', M, y);
    y += 4;
    doc.setFont('helvetica','normal');
    doc.setFillColor(255, 248, 220);
    var anomLines = doc.splitTextToSize(s.anomalie_rilevate, W - M*2 - 4);
    doc.rect(M, y-2, W-M*2, anomLines.length*4+4, 'F');
    doc.setTextColor(120,60,0);
    doc.text(anomLines, M+2, y+2);
    y += anomLines.length * 4 + 8;
    doc.setTextColor(30,30,30);
  }

  // ── PRESIDI CONTROLLATI ───────────────────
  if(presidi.length) {
    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    doc.setTextColor(80,80,80);
    doc.text('PRESIDI CONTROLLATI', M, y);
    y += 2;
    var tipiLabel = {estintore:'Estintore',porta_rei:'Porta REI',idrante:'Idrante',naspo:'Naspo',luce_emergenza:'Luce emergenza',pompa_antincendio:'Pompa AI',centrale_rivelazione:'Centrale',sprinkler:'Sprinkler',uscita_emergenza:'Uscita emerg.'};
    var stati = {ok:'✓',anomalia:'⚠',scaduto:'✗',fuori_servizio:'✗'};
    doc.autoTable({
      startY: y,
      head: [['Tipo','Matricola','Ubicazione','Esito','Note']],
      body: presidi.map(function(p){return [tipiLabel[p.tipo]||p.tipo, p.matricola||'—', p.ubicazione||'—', stati[p.stato]||'—', p.note||''];} ),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [8,80,65], textColor: 255 },
      columnStyles: { 0:{cellWidth:30}, 1:{cellWidth:25}, 2:{cellWidth:65}, 3:{cellWidth:12,halign:'center'}, 4:{cellWidth:40} },
      margin: { left: M, right: M }
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── STRAORDINARIO ─────────────────────────
  if(s.intervento_straordinario_richiesto && y < 240) {
    doc.setFillColor(255, 235, 235);
    var strLines = doc.splitTextToSize('INTERVENTO STRAORDINARIO RICHIESTO: ' + (s.descrizione_intervento_necessario||''), W-M*2-4);
    doc.rect(M, y-2, W-M*2, strLines.length*4+6, 'F');
    doc.setTextColor(150,0,0);
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.text(strLines, M+2, y+2);
    y += strLines.length * 4 + 8;
    doc.setTextColor(30,30,30);
  }

  // ── FIRMA ─────────────────────────────────
  if(y > 240) { doc.addPage(); y = 20; }
  y = Math.max(y, 230);
  doc.setDrawColor(180,180,180);
  doc.setLineWidth(0.3);
  doc.line(M, y, M+70, y);
  doc.line(W-M-70, y, W-M, y);
  doc.setFontSize(8);
  doc.setTextColor(120,120,120);
  doc.text('Firma tecnico', M, y+4);
  doc.text('Firma cliente: ' + (s.nome_firmatario||''), W-M-70, y+4);

  // Footer
  doc.setFontSize(7);
  doc.text('Documento generato il ' + new Date().toLocaleDateString('it-IT') + ' — ' + (az.ragione_sociale||'Toli Fire') + ' — P.I. ' + (az.piva||'02490980501'), W/2, 290, {align:'center'});

  var nomeFile = 'Rapporto_' + (s.data_intervento||'').replace(/-/g,'') + '_' + (s.clienti?.ragione_sociale||'cliente').substring(0,15).replace(/\s/g,'_') + '.pdf';
  doc.save(nomeFile);
  toast('✅ PDF rapporto scaricato', 'ok');
}

// ── PDF RELAZIONE PORTE REI ───────────────────────────────────
async function stampaRelazionePorteREI(schedaId) {
  if(!window.jspdf) { toast('Libreria PDF non caricata','err'); return; }
  var r = await db.from('schede_lavoro')
    .select('*, clienti(ragione_sociale,indirizzo_fattura,citta_fattura,citta), utenti!schede_lavoro_tecnico_id_fkey(nome,cognome)')
    .eq('id', schedaId).single();
  if(r.error) { toast('Errore caricamento scheda','err'); return; }
  var s = r.data;

  var ri = await db.from('impostazioni').select('*').eq('id',1).maybeSingle();
  var az = ri.data || {};

  // Carica TUTTI i presidi del cliente (non solo porte)
  var rp = await db.from('impianti')
    .select('*')
    .eq('cliente_id', s.cliente_id)
    .order('tipo').order('matricola');
  var tutti = rp.data || [];

  // Raggruppa per tipo
  var byTipo = {};
  tutti.forEach(function(p){
    if(!byTipo[p.tipo]) byTipo[p.tipo]=[];
    byTipo[p.tipo].push(p);
  });

  if(!tutti.length) { toast('Nessun presidio registrato per questo cliente','err'); return; }

  var { jsPDF } = window.jspdf;
  var W=210, M=15;

  // Una sezione per tipo presidio
  var tipiKeys = Object.keys(byTipo);
  var docCreato = false;
  var doc;

  tipiKeys.forEach(function(tipo, tipoIdx) {
    var presidi = byTipo[tipo];
    var checklist = CKL_PRESIDIO[tipo] || ['Verifica generale','Verifica funzionamento','Verifica segnaletica'];
    var titoloTipo = {
      porta_rei:'PORTE TAGLIAFUOCO REI',
      uscita_emergenza:'USCITE DI EMERGENZA',
      estintore:'ESTINTORI',
      idrante:'IDRANTI',
      naspo:'NASPI',
      luce_emergenza:'LUCI DI EMERGENZA',
      pompa_antincendio:'POMPE ANTINCENDIO',
      centrale_rivelazione:'CENTRALE RIVELAZIONE',
      sprinkler:'IMPIANTO SPRINKLER'
    }[tipo] || tipo.toUpperCase();

    presidi.forEach(function(p, pi) {
      if(!docCreato) {
        doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
        docCreato = true;
      } else {
        doc.addPage();
      }

      var y = 0;

      // ── HEADER ──
      doc.setFillColor(8,80,65);
      doc.rect(0,0,W,28,'F');
      doc.setTextColor(255,255,255);
      doc.setFontSize(16);
      doc.setFont('helvetica','bold');
      doc.text('TOLI FIRE', M, 12);
      doc.setFontSize(8);
      doc.setFont('helvetica','normal');
      doc.text((az.ragione_sociale||'TOLI S.R.L.') + ' — P.I. ' + (az.piva||'02490980501'), M, 18);
      doc.text((az.indirizzo||'VIA ARCHIMEDE BELLATALLA 98') + ' — ' + (az.citta||'PISA') + ' — Tel. ' + (az.telefono||'050.8054008'), M, 23);
      y = 35;

      // ── TITOLO RELAZIONE ──
      doc.setTextColor(30,30,30);
      doc.setFontSize(13);
      doc.setFont('helvetica','bold');
      doc.text('RELAZIONE VERIFICA ' + titoloTipo, W/2, y, {align:'center'});
      y += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica','normal');
      doc.setTextColor(80,80,80);
      var dataFmt = s.data_intervento ? new Date(s.data_intervento+'T00:00:00').toLocaleDateString('it-IT') : '—';
      doc.text("In data " + dataFmt + " e'stata effettuata la verifica delle " + titoloTipo, W/2, y, {align:'center'});
      y += 5;
      doc.text('I riscontri hanno dato i seguenti esiti:', W/2, y, {align:'center'});
      y += 10;

      // ── CLIENTE E INDIRIZZO ──
      doc.setTextColor(20,20,20);
      doc.setFontSize(10);
      doc.setFont('helvetica','bold');
      doc.text(s.clienti?.ragione_sociale||'—', M, y);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      var addr = [s.clienti?.indirizzo_fattura, s.clienti?.citta_fattura||s.clienti?.citta].filter(Boolean).join(' — ');
      if(addr) { y+=5; doc.text(addr, M, y); }
      y += 10;

      // ── BOX TIPO PORTA / PRESIDIO ──
      doc.setDrawColor(100,100,100);
      doc.setLineWidth(0.5);
      doc.rect(M, y, W-M*2, 20);
      doc.setFontSize(10);
      doc.setFont('helvetica','bold');
      doc.text('TIPO: ' + titoloTipo + (p.modello ? ' — ' + p.modello.toUpperCase() : ''), M+3, y+7);
      doc.text('MATRICOLA: ' + (p.matricola||'N/A'), M+3, y+14);
      doc.text('N. ' + (pi+1), W-M-20, y+7);
      if(p.ubicazione) doc.text('Ubicazione: ' + p.ubicazione, W/2, y+14);
      y += 26;

      // ── TABELLA CHECKLIST ──
      var rows = checklist.map(function(item) {
        // SI se stato ok, NO se anomalia/scaduto/fuori_servizio
        var si = p.stato === 'ok' ? 'X' : '';
        var no = p.stato !== 'ok' ? 'X' : '';
        var nota = (p.stato !== 'ok' && p.note) ? p.note.substring(0,40) : '';
        return [item, si, no, nota];
      });

      doc.autoTable({
        startY: y,
        head: [['ELENCO OPERAZIONI DI CONTROLLO','SI','NO','Note (interventi di riallineamento)']],
        body: rows,
        styles: { fontSize: 8.5, cellPadding: 2 },
        headStyles: { fillColor:[220,220,220], textColor:30, fontStyle:'bold', fontSize:8.5, halign:'center' },
        columnStyles: {
          0:{cellWidth:100},
          1:{cellWidth:12, halign:'center'},
          2:{cellWidth:12, halign:'center'},
          3:{cellWidth:W-M*2-124}
        },
        margin:{left:M, right:M}
      });
      y = doc.lastAutoTable.finalY + 8;

      // ── ESITO FINALE ──
      doc.setFontSize(9);
      doc.setFont('helvetica','normal');
      doc.setTextColor(30,30,30);
      doc.text('I riscontri hanno dato i seguenti esiti:', M, y);
      y += 5;
      doc.text('Pertanto il presidio verificato è da considerarsi:', M, y);
      y += 6;

      var isOk = p.stato === 'ok';
      var isAnomalia = p.stato === 'anomalia';
      doc.text((isOk?'X':'O') + '  Manutenzionato, efficiente e conforme', M+4, y); y+=5;
      doc.text((isAnomalia?'X':'O') + '  Manutenzionato, ma non conforme', M+4, y); y+=5;
      doc.text((p.stato==='fuori_servizio'?'X':'O') + '  Non riallineabile alla vigente normativa', M+4, y); y+=10;

      // ── FIRMA ──
      var firmY = Math.max(y, 255);
      doc.setDrawColor(180,180,180);
      doc.setLineWidth(0.3);
      doc.line(M, firmY, M+60, firmY);
      doc.line(W-M-60, firmY, W-M, firmY);
      doc.setFontSize(8);
      doc.setTextColor(120,120,120);
      doc.text('Il tecnico manutentore', M, firmY+4);
      var tecNome = s.utenti ? s.utenti.nome+' '+s.utenti.cognome : '—';
      doc.text(tecNome, W-M-60, firmY+4);

      // TOLI logo-footer
      doc.setFontSize(9);
      doc.setFont('helvetica','bold');
      doc.setTextColor(8,80,65);
      doc.text('TOLI s.r.l.', W-M-45, firmY-12);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7);
      doc.setTextColor(80,80,80);
      doc.text((az.indirizzo||'Via A. Bellatalla, 98')+' — '+(az.citta||'56121 PISA'), W-M-45, firmY-8);
      doc.text('Partita I.V.A. '+(az.piva||'02490980501'), W-M-45, firmY-4);
      doc.text('Tel. '+(az.telefono||'050.8054008'), W-M-45, firmY);
    });
  });

  if(!doc) { toast('Nessun presidio da stampare','err'); return; }
  var nomeFile = 'Relazione_Tecnica_'+(s.data_intervento||'').replace(/-/g,'')+'_'+(s.clienti?.ragione_sociale||'').substring(0,15).replace(/\s/g,'_')+'.pdf';
  doc.save(nomeFile);
  toast('✅ Relazione tecnica scaricata ('+tutti.length+' presidi)','ok');
}



// ── GESTIONE PRESIDI DAL TECNICO ─────────────────────────────
function apriAggiungiPresidioTec() {
  var cliId = v('tc1');
  if(!cliId) { toast('Seleziona prima il cliente','err'); return; }
  // Usa il modal presidio esistente con cliente preimpostato
  resetPF();
  ge('mpt').textContent = 'Nuovo presidio';
  ge('mpeid').value = '';
  ge('mpcl').value = cliId;
  openM('m-presidio');
}

async function editPresidioTec(pid) {
  // Carica presidio e apri modal modifica
  var r = await db.from('impianti').select('*').eq('id',pid).single();
  if(r.error) { toast('Errore','err'); return; }
  editP(pid);
}


// ── CALENDARIO TEAM (Giorno / Settimana / Mese) ─────────────
var _calTeamData = new Date(); _calTeamData.setHours(0,0,0,0);
var _calTeamVista = 'settimana'; // 'giorno' | 'settimana' | 'mese'
var _calTeamFiltro = 'tutti';    // 'tutti' | 'nessuno' | <tecnico_id>
var _calTeamOdls = [];
var _calTeamTecniciAll = [];     // tecnici attivi (per i bottoni filtro)
window._calTeamSediMap = {};

function ctmMondayOf(d){
  var x = new Date(d); x.setHours(0,0,0,0);
  var dow = x.getDay();
  x.setDate(x.getDate() + ((dow === 0) ? -6 : 1 - dow));
  return x;
}

function setCalTeamVista(v){
  _calTeamVista = v;
  ['giorno','settimana','mese'].forEach(function(x){
    var el = ge('ctm-vista-'+x); if(el) el.classList.toggle('on', x===v);
  });
  loadCalendarioTeam();
}

function calTeamPrev(){
  var d = new Date(_calTeamData);
  if(_calTeamVista === 'giorno') d.setDate(d.getDate()-1);
  else if(_calTeamVista === 'settimana') d.setDate(d.getDate()-7);
  else d.setMonth(d.getMonth()-1);
  _calTeamData = d;
  loadCalendarioTeam();
}
function calTeamNext(){
  var d = new Date(_calTeamData);
  if(_calTeamVista === 'giorno') d.setDate(d.getDate()+1);
  else if(_calTeamVista === 'settimana') d.setDate(d.getDate()+7);
  else d.setMonth(d.getMonth()+1);
  _calTeamData = d;
  loadCalendarioTeam();
}
function calTeamToday(){
  _calTeamData = new Date(); _calTeamData.setHours(0,0,0,0);
  loadCalendarioTeam();
}

function filtraCalTeam(id){
  _calTeamFiltro = id;
  var btnTutti = ge('cteam-btn-tutti');
  if(btnTutti) btnTutti.classList.toggle('on', id==='tutti');
  document.querySelectorAll('#cteam-btn-tecnici .btn').forEach(function(b){
    b.classList.toggle('on', b.dataset.id === id);
  });
  // Re-render (no need to re-fetch dati)
  renderCalTeam();
}

async function loadCalendarioTeam(){
  // Calcola range in base alla vista
  var start, end, titolo;
  if(_calTeamVista === 'giorno'){
    start = new Date(_calTeamData); start.setHours(0,0,0,0);
    end = new Date(start); end.setDate(end.getDate()+1);
    titolo = start.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  } else if(_calTeamVista === 'settimana'){
    start = ctmMondayOf(_calTeamData);
    end = new Date(start); end.setDate(end.getDate()+7);
    var endLabel = new Date(end); endLabel.setDate(endLabel.getDate()-1);
    titolo = start.toLocaleDateString('it-IT',{day:'numeric',month:'short'}) + ' – ' + endLabel.toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'});
  } else {
    start = new Date(_calTeamData.getFullYear(), _calTeamData.getMonth(), 1);
    end = new Date(_calTeamData.getFullYear(), _calTeamData.getMonth()+1, 1);
    titolo = start.toLocaleDateString('it-IT',{month:'long',year:'numeric'});
  }
  var titEl = ge('cal-team-title'); if(titEl) titEl.textContent = titolo;

  var body = ge('cal-team-body');
  if(body) body.innerHTML = '<div class="load">Caricamento...</div>';

  // Carica tecnici attivi + OdL nel periodo (in parallelo)
  var [rTec, rOdl] = await Promise.all([
    db.from('utenti').select('id,nome,cognome').eq('ruolo','tecnico').eq('attivo',true).order('cognome'),
    db.from('ordini_lavoro')
      .select('id,numero,tipo,stato,data_pianificata,fascia_oraria,sede_id,in_ritardo_il,tecnico_id,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(id,nome,cognome)')
      .is('eliminato_il', null)
      .gte('data_pianificata', start.toISOString().split('T')[0])
      .lt('data_pianificata', end.toISOString().split('T')[0])
      .neq('stato','annullato')
  ]);
  _calTeamTecniciAll = rTec.data || [];
  _calTeamOdls = rOdl.data || [];

  // Bottoni filtro tecnico
  var bDiv = ge('cteam-btn-tecnici');
  if(bDiv){
    var html = _calTeamTecniciAll.map(function(t){
      return '<button class="btn'+(t.id===_calTeamFiltro?' on':'')+'" data-id="'+t.id+'" onclick="filtraCalTeam(this.dataset.id)">'+esc(t.nome)+' '+esc(t.cognome)+'</button>';
    }).join('');
    var nonAss = _calTeamOdls.filter(function(o){return !o.tecnico_id;}).length;
    html += '<button class="btn'+('nessuno'===_calTeamFiltro?' on':'')+'" data-id="nessuno" onclick="filtraCalTeam(this.dataset.id)">⚠️ Non assegnati'+(nonAss?' ('+nonAss+')':'')+'</button>';
    bDiv.innerHTML = html;
  }
  var btnTutti = ge('cteam-btn-tutti'); if(btnTutti) btnTutti.classList.toggle('on', _calTeamFiltro==='tutti');

  // Carica sedi referenziate (per tooltip e edit modal)
  var sedeIds = _calTeamOdls.map(function(o){return o.sede_id;}).filter(Boolean);
  window._calTeamSediMap = {};
  if(sedeIds.length){
    var rs = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').in('id',sedeIds);
    (rs.data||[]).forEach(function(s){ window._calTeamSediMap[s.id]=s; });
  }

  renderCalTeam(start, end);
}

function renderCalTeam(start, end){
  var el = ge('cal-team-body');
  if(!el) return;
  // Se chiamata senza argomenti (es. dal filtraCalTeam), ricalcola
  if(!start || !end){
    if(_calTeamVista === 'giorno'){
      start = new Date(_calTeamData); start.setHours(0,0,0,0);
      end = new Date(start); end.setDate(end.getDate()+1);
    } else if(_calTeamVista === 'settimana'){
      start = ctmMondayOf(_calTeamData);
      end = new Date(start); end.setDate(end.getDate()+7);
    } else {
      start = new Date(_calTeamData.getFullYear(), _calTeamData.getMonth(), 1);
      end = new Date(_calTeamData.getFullYear(), _calTeamData.getMonth()+1, 1);
    }
  }

  // Applica filtro tecnico
  var odls = _calTeamOdls.filter(function(o){
    if(_calTeamFiltro === 'tutti') return true;
    if(_calTeamFiltro === 'nessuno') return !o.tecnico_id;
    return o.tecnico_id === _calTeamFiltro;
  });

  // Tecnici da mostrare nelle righe (vista griglia)
  var tecniciRighe;
  if(_calTeamFiltro === 'tutti'){
    // include "Non assegnati" come pseudo-riga in fondo solo se ci sono OdL senza tecnico
    tecniciRighe = _calTeamTecniciAll.slice();
    if(_calTeamOdls.some(function(o){return !o.tecnico_id;})){
      tecniciRighe.push({id:'nessuno', nome:'Non', cognome:'assegnati'});
    }
  } else if(_calTeamFiltro === 'nessuno'){
    tecniciRighe = [{id:'nessuno', nome:'Non', cognome:'assegnati'}];
  } else {
    var found = _calTeamTecniciAll.find(function(t){return t.id===_calTeamFiltro;});
    tecniciRighe = found ? [found] : [];
  }

  if(_calTeamVista === 'mese'){
    el.innerHTML = renderCalTeamMese(start, odls);
  } else {
    // Giorno o Settimana: griglia tecnico × giorno
    var giorni = [];
    var d = new Date(start);
    while(d < end){ giorni.push(new Date(d)); d.setDate(d.getDate()+1); }
    el.innerHTML = renderCalTeamGriglia(giorni, odls, tecniciRighe);
  }
}

function renderCalTeamGriglia(giorni, odls, tecnici){
  if(!tecnici.length) return '<div class="ct-empty">Nessun tecnico da mostrare.</div>';
  var today = new Date(); today.setHours(0,0,0,0);
  var dayLabels = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  var html = '<div class="ct-cal-grid"><table class="ct-cal-table"><thead><tr><th class="tec-col">Tecnico</th>';
  giorni.forEach(function(d){
    var isToday = d.getTime() === today.getTime();
    var dow = d.getDay();
    var lbl = dayLabels[dow===0?6:dow-1];
    html += '<th class="'+(isToday?'today':'')+'">'+lbl+'<br><span style="font-size:11px;font-weight:600">'+d.getDate()+'/'+(d.getMonth()+1)+'</span></th>';
  });
  html += '</tr></thead><tbody>';
  tecnici.forEach(function(t){
    var tecLabel = (t.id === 'nessuno') ? '⚠️ Non assegnati' : esc(t.nome+' '+(t.cognome||'').charAt(0)+'.');
    html += '<tr><td><div class="ct-cal-tec" title="'+esc(t.nome+' '+t.cognome)+'">'+tecLabel+'</div></td>';
    giorni.forEach(function(d){
      var isToday = d.getTime() === today.getTime();
      var ds = d.toISOString().split('T')[0];
      var dayInts = odls.filter(function(o){
        if(t.id === 'nessuno') return !o.tecnico_id && o.data_pianificata === ds;
        return o.tecnico_id === t.id && o.data_pianificata === ds;
      });
      html += '<td class="ct-cal-cell '+(isToday?'today':'')+'">' + dayInts.map(renderCalTeamEv).join('') + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function renderCalTeamEv(o){
  var tipoCls = {ordinario_programmato:'ev-ord',ordinario_chiamata:'ev-chi',straordinario:'ev-str',corso:'ev-cor'}[o.tipo] || 'ev-ord';
  var ritardo = o.in_ritardo_il ? ' ev-ritardo' : '';
  var cli = o.clienti?.ragione_sociale || '—';
  return '<div class="ct-cal-ev '+tipoCls+ritardo+'" onclick="event.stopPropagation();openEditOdl(\''+o.id+'\')" title="'+esc(cli)+'">' +
    '<div class="ev-cli">'+esc(cli)+'</div>' +
    (o.fascia_oraria?'<div class="ev-meta">'+esc(o.fascia_oraria)+'</div>':'') +
  '</div>';
}

function renderCalTeamMese(start, odls){
  // Griglia mensile classica 7 colonne × N settimane.
  // Per cella: numero giorno + fino a 3 eventi colorati per tipo, "+N altri" se di più.
  var mese = start.getMonth();
  var firstDow = start.getDay();
  // Allinea a lunedì
  var firstMonday = new Date(start);
  firstMonday.setDate(firstMonday.getDate() - ((firstDow === 0) ? 6 : firstDow - 1));
  var today = new Date(); today.setHours(0,0,0,0);

  var html = '<div class="ctm-month-grid">';
  ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(function(g){ html += '<div class="ctm-month-head">'+g+'</div>'; });
  var current = new Date(firstMonday);
  // Numero settimane: max 6 per coprire tutti i mesi possibili
  for(var w=0; w<6; w++){
    for(var d=0; d<7; d++){
      var ds = current.toISOString().split('T')[0];
      var isOtherMonth = current.getMonth() !== mese;
      var isToday = current.getTime() === today.getTime();
      var dayInts = odls.filter(function(o){return o.data_pianificata === ds;});
      var cls = 'ctm-month-day';
      if(isOtherMonth) cls += ' other-month';
      if(isToday) cls += ' today';
      html += '<div class="'+cls+'"><div class="ctm-day-n">'+current.getDate()+'</div>';
      dayInts.slice(0,3).forEach(function(o){
        var tipoCls = {ordinario_programmato:'ev-ord',ordinario_chiamata:'ev-chi',straordinario:'ev-str',corso:'ev-cor'}[o.tipo] || 'ev-ord';
        var ritardo = o.in_ritardo_il ? ' ev-ritardo' : '';
        var cli = o.clienti?.ragione_sociale || '—';
        var tecAbbr = o.utenti ? esc(((o.utenti.nome||'').charAt(0)+(o.utenti.cognome||'').charAt(0)).toUpperCase()) : '—';
        var tooltip = cli + (o.utenti ? (' · '+o.utenti.nome+' '+o.utenti.cognome) : ' · non assegnato');
        html += '<div class="ctm-month-ev '+tipoCls+ritardo+'" onclick="event.stopPropagation();openEditOdl(\''+o.id+'\')" title="'+esc(tooltip)+'">' + tecAbbr + ' ' + esc(cli) + '</div>';
      });
      if(dayInts.length > 3) html += '<div class="ctm-month-more">+'+(dayInts.length-3)+' altri</div>';
      html += '</div>';
      current.setDate(current.getDate()+1);
    }
    // Fine se abbiamo già coperto tutto il mese
    if(current.getMonth() !== mese && current.getDay() === 1) break;
  }
  html += '</div>';
  return html;
}

// ── CALENDARIO TECNICO ───────────────────────────────────────
var _calTecAnno = new Date().getFullYear();
var _calTecMese = new Date().getMonth();

async function loadCalendarioTecnico() {
  var mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var titEl = ge('cal-tec-title');
  if(titEl) titEl.textContent = mesi[_calTecMese] + ' ' + _calTecAnno;

  var dataInizio = new Date(_calTecAnno, _calTecMese, 1).toISOString().split('T')[0];
  var dataFine = new Date(_calTecAnno, _calTecMese+1, 0).toISOString().split('T')[0];

  // Carica OdL assegnati al tecnico
  var r = await db.from('ordini_lavoro')
    .select('id,numero,tipo,stato,data_pianificata,fascia_oraria,note_per_tecnico,sede_id,clienti(ragione_sociale)')
    .eq('tecnico_id', ME.id)
    .gte('data_pianificata', dataInizio)
    .lte('data_pianificata', dataFine)
    .neq('stato','annullato')
    .order('data_pianificata');

  // Carica sedi separatamente per gli OdL che hanno sede_id
  var sedeIds = (r.data||[]).map(function(o){return o.sede_id;}).filter(Boolean);
  var sediMap = {};
  if(sedeIds.length) {
    var rs = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').in('id',sedeIds);
    (rs.data||[]).forEach(function(s){ sediMap[s.id]=s; });
  }

  var odls = r.data || [];
  var el = ge('cal-tec-lista');
  if(!el) return;

  if(!odls.length) {
    el.innerHTML = '<div class="empty">Nessun intervento assegnato questo mese.</div>';
  } else {
    var tipi = {ordinario_programmato:'🔧 Manutenzione',ordinario_chiamata:'📞 Su chiamata',straordinario:'⚡ Straordinario',corso:'📚 Corso'};
    el.innerHTML = odls.map(function(o) {
      var cli = o.clienti?.ragione_sociale || '—';
      var data = o.data_pianificata ? new Date(o.data_pianificata+'T00:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'2-digit',month:'long'}) : '—';
      var fasciaStr = o.fascia_oraria ? ' · ' + o.fascia_oraria : '';
      var sedeObj = o.sede_id ? sediMap[o.sede_id] : null;
      var sede = sedeObj ? (sedeObj.tipo||'').toUpperCase() + (sedeObj.nome?' — '+sedeObj.nome:'') + ': ' + (sedeObj.via||'') + ' ' + (sedeObj.civico||'') + (sedeObj.citta?' ('+sedeObj.citta+')':'') : null;
      var canRichiedi = o.stato !== 'completato';
      return '<div style="border:0.5px solid var(--bo);border-radius:var(--rs);padding:14px;margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
          '<div style="flex:1">' +
            '<div style="font-size:13px;font-weight:600;margin-bottom:3px">' + cli + '</div>' +
            '<div style="font-size:12px;color:var(--m)">' + (tipi[o.tipo]||o.tipo) + fasciaStr + '</div>' +
            '<div style="font-size:13px;font-weight:500;color:var(--b);margin-top:4px">📅 ' + data + '</div>' +
            (sede ? '<div style="font-size:12px;color:var(--m);margin-top:3px">📍 ' + sede + '</div>' : '<div style="font-size:12px;color:var(--m);margin-top:3px">📍 Sede principale</div>') +
            (esc(o.note_per_tecnico) ? '<div style="font-size:12px;color:var(--a);margin-top:4px;padding:6px 8px;background:var(--al);border-radius:6px">📝 ' + esc(o.note_per_tecnico) + '</div>' : '') +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">' +
            (canRichiedi ? '<button class="btn sm" data-id="'+o.id+'" data-data="'+o.data_pianificata+'" data-cli="'+cli+'" onclick="apriRichiestaModifica(this.dataset.id,this.dataset.data,this.dataset.cli)">✏️ Richiedi modifica</button>' : '') +
          '</div>' +
        '</div></div>';
    }).join('');
  }

  // Carica richieste in attesa del tecnico
  await loadRichiesteInAttesaTecnico();
}


// B5: vecchio modal m-schedula-tec + helpers rimossi. La funzione
// apriSchedulazionePersonale ora riusa m-odl in modalità 'tecnico-self'
// (definita più in basso). caricaSediSchedula e inviaSchedulazione
// sono diventate obsolete; loadSediForOdl e saveOdl coprono entrambi.

function calTecPrev() {
  _calTecMese--;
  if(_calTecMese < 0) { _calTecMese = 11; _calTecAnno--; }
  loadCalendarioTecnico();
}
function calTecNext() {
  _calTecMese++;
  if(_calTecMese > 11) { _calTecMese = 0; _calTecAnno++; }
  loadCalendarioTecnico();
}

async function loadRichiesteInAttesaTecnico() {
  var r = await db.from('richieste_modifica_odl')
    .select('*, ordini_lavoro(numero,clienti(ragione_sociale))')
    .eq('tecnico_id', ME.id)
    .eq('stato','in_attesa')
    .order('creato_il', {ascending:false})
    .limit(5);

  var richieste = r.data || [];
  var div = ge('cal-tec-richieste');
  var lista = ge('cal-tec-richieste-lista');
  if(!div || !lista) return;

  if(!richieste.length) { div.style.display='none'; return; }
  div.style.display = 'block';

  var stati = {in_attesa:'⏳ In attesa',approvata:'✅ Approvata',rifiutata:'❌ Rifiutata'};
  var statiCol = {in_attesa:'var(--a)',approvata:'var(--g)',rifiutata:'var(--r)'};
  lista.innerHTML = richieste.map(function(r) {
    var cli = r.ordini_lavoro?.clienti?.ragione_sociale || '—';
    var tipi = {cambio_data:'Cambio data',cambio_orario:'Cambio orario',rinvio:'Rinvio',annullamento:'Annullamento',note:'Note'};
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:0.5px solid var(--bo);font-size:13px">' +
      '<div><span style="font-weight:600">' + cli + '</span> · ' + (tipi[r.tipo_modifica]||r.tipo_modifica) +
        (r.data_richiesta ? ' → ' + new Date(r.data_richiesta+'T00:00:00').toLocaleDateString('it-IT') : '') +
        (esc(r.note_risposta) ? '<div style="font-size:11px;color:var(--m)">Risposta: ' + esc(r.note_risposta) + '</div>' : '') +
      '</div>' +
      '<span style="color:'+statiCol[r.stato]+';font-weight:600;white-space:nowrap">' + (stati[r.stato]||r.stato) + '</span>' +
    '</div>';
  }).join('');
}

function apriRichiestaModifica(odlId, dataAttuale, nomeCliente) {
  // Crea modal al volo
  var m = ge('m-richiesta-modifica');
  if(!m) {
    m = document.createElement('div');
    m.id = 'm-richiesta-modifica';
    m.className = 'mbg';
    m.innerHTML = '<div class="modal" style="max-width:480px">' +
      '<div class="mh">✏️ Richiesta modifica intervento <button class="mx" data-mid="m-richiesta-modifica" onclick="closeM(this.dataset.mid)">✕</button></div>' +
      '<div id="m-rich-body"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function(e){ if(e.target===this) this.classList.remove('on'); });
  }

  ge('m-rich-body').innerHTML =
    '<div style="padding:16px">' +
    '<div style="font-size:13px;font-weight:600;margin-bottom:12px">Cliente: ' + nomeCliente + '</div>' +
    '<div class="f"><label>Tipo modifica *</label>' +
      '<select id="rich-tipo" style="width:100%" onchange="aggiornaFormRichiesta()">' +
        '<option value="cambio_data">📅 Cambio data</option>' +
        '<option value="cambio_orario">🕐 Cambio orario</option>' +
        '<option value="rinvio">⏭️ Rinvio</option>' +
        '<option value="annullamento">❌ Annullamento</option>' +
        '<option value="note">📝 Nota/comunicazione</option>' +
      '</select></div>' +
    '<div id="rich-data-field" class="f"><label>Nuova data richiesta</label><input type="date" id="rich-data"></div>' +
    '<div id="rich-ora-field" class="f" style="display:none"><label>Orario richiesto</label><input type="text" id="rich-ora" placeholder="Es: mattina, 09:00-12:00"></div>' +
    '<div class="f"><label>Motivo / note</label><textarea id="rich-note" style="min-height:80px" placeholder="Spiega il motivo della richiesta..."></textarea></div>' +
    '<div class="al2 i" style="margin-top:8px">La richiesta verrà inviata al capo tecnico e al titolare per approvazione.</div>' +
    '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button class="btn" data-mid="m-richiesta-modifica" onclick="closeM(this.dataset.mid)">Annulla</button>' +
      '<button class="btn p" data-odl="'+odlId+'" onclick="inviaRichiestaModifica(this.dataset.odl)">📤 Invia richiesta</button>' +
    '</div></div>';

  openM('m-richiesta-modifica');
}

function aggiornaFormRichiesta() {
  var tipo = ge('rich-tipo') ? ge('rich-tipo').value : '';
  var df = ge('rich-data-field');
  var of = ge('rich-ora-field');
  if(df) df.style.display = ['cambio_data','rinvio'].includes(tipo) ? 'block' : 'none';
  if(of) of.style.display = tipo === 'cambio_orario' ? 'block' : 'none';
}

async function inviaRichiestaModifica(odlId) {
  var tipo = ge('rich-tipo').value;
  var note = ge('rich-note').value.trim();
  if(!note) { toast('Scrivi il motivo della richiesta','err'); return; }

  var payload = {
    odl_id: odlId,
    tecnico_id: ME.id,
    tipo_modifica: tipo,
    data_richiesta: ge('rich-data').value || null,
    orario_richiesto: ge('rich-ora') ? ge('rich-ora').value || null : null,
    note_richiesta: note,
    stato: 'in_attesa'
  };

  var r = await db.from('richieste_modifica_odl').insert(payload);
  if(r.error) { toast('Errore: '+r.error.message,'err'); return; }

  toast('✅ Richiesta inviata! In attesa di approvazione.','ok');
  closeM('m-richiesta-modifica');
  await loadCalendarioTecnico();
}

// ── DASHBOARD CAPO TECNICO / TITOLARE: approva richieste ─────
async function loadRichiesteModifica(targetId) {
  var el = ge(targetId || 'dash-richieste-modifica');
  if(!el) return;

  var r = await db.from('richieste_modifica_odl')
    .select('*, utenti!richieste_modifica_odl_tecnico_id_fkey(nome,cognome), ordini_lavoro(numero,data_pianificata,clienti(ragione_sociale))')
    .eq('stato','in_attesa')
    .order('creato_il', {ascending:false});

  var richieste = r.data || [];
  var cnt = ge('dash-rich-count');
  if(cnt) { cnt.textContent = richieste.length; cnt.style.display = richieste.length ? 'inline' : 'none'; }

  if(!richieste.length) {
    el.innerHTML = '<div class="empty">✅ Nessuna richiesta in attesa</div>';
    return;
  }

  var tipi = {cambio_data:'📅 Cambio data',cambio_orario:'🕐 Cambio orario',rinvio:'⏭️ Rinvio',annullamento:'❌ Annullamento',note:'📝 Nota'};

  el.innerHTML = richieste.map(function(rq) {
    var tec = rq.utenti ? rq.utenti.nome+' '+rq.utenti.cognome : '—';
    var cli = rq.ordini_lavoro?.clienti?.ragione_sociale || '—';
    var dataAtt = rq.ordini_lavoro?.data_pianificata ? new Date(rq.ordini_lavoro.data_pianificata+'T00:00:00').toLocaleDateString('it-IT') : '—';
    var dataRich = rq.data_richiesta ? new Date(rq.data_richiesta+'T00:00:00').toLocaleDateString('it-IT') : null;
    return '<div style="border:0.5px solid var(--a);border-radius:var(--rs);padding:12px;margin-bottom:10px;background:var(--al)">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
        '<div style="flex:1">' +
          '<div style="font-size:13px;font-weight:600">' + (tipi[rq.tipo_modifica]||rq.tipo_modifica) + '</div>' +
          '<div style="font-size:12px;color:var(--m);margin-top:2px">Tecnico: <strong>' + tec + '</strong> · Cliente: <strong>' + cli + '</strong></div>' +
          '<div style="font-size:12px;color:var(--m)">Data attuale: ' + dataAtt + (dataRich ? ' → Richiesta: <strong>' + dataRich + '</strong>' : '') + '</div>' +
          (rq.orario_richiesto ? '<div style="font-size:12px;color:var(--m)">Orario: ' + rq.orario_richiesto + '</div>' : '') +
          '<div style="font-size:12px;margin-top:6px;padding:6px 8px;background:white;border-radius:6px">' + (rq.note_richiesta||'—') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="f" style="margin-top:10px"><label style="font-size:11px">Risposta (opzionale)</label>' +
        '<input type="text" id="rich-resp-'+rq.id+'" placeholder="Es: Approvato, spostato a mercoledì prossimo..." style="font-size:13px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button class="btn p" data-id="'+rq.id+'" data-odl="'+rq.odl_id+'" data-tipo="'+rq.tipo_modifica+'" data-data="'+(rq.data_richiesta||'')+'" data-stato="approvata" onclick="rispondiRichiestaBtn(this)">✅ Approva</button>' +
        '<button class="btn warn" data-id="'+rq.id+'" data-stato="rifiutata" onclick="rispondiRichiestaBtn(this)">❌ Rifiuta</button>' +
      '</div></div>';
  }).join('');
}


function rispondiRichiestaBtn(btn) {
  var id = btn.dataset.id;
  var odl = btn.dataset.odl || null;
  var tipo = btn.dataset.tipo || null;
  var data = btn.dataset.data || null;
  var stato = btn.dataset.stato;
  rispondiRichiesta(id, odl, tipo, data, stato);
}

async function rispondiRichiesta(richId, odlId, tipo, nuovaData, stato) {
  var nota = ge('rich-resp-'+richId) ? ge('rich-resp-'+richId).value : '';

  // Se approvata e cambio data: aggiorna l'OdL
  if(stato === 'approvata' && odlId) {
    if(['cambio_data','rinvio'].includes(tipo) && nuovaData) {
      await db.from('ordini_lavoro').update({data_pianificata: nuovaData}).eq('id', odlId);
    }
    if(tipo === 'annullamento') {
      await db.from('ordini_lavoro').update({stato: 'annullato'}).eq('id', odlId);
    }
  }

  // Aggiorna stato richiesta
  var r = await db.from('richieste_modifica_odl').update({
    stato: stato,
    note_risposta: nota || null,
    risposto_da: ME.id,
    risposto_il: new Date().toISOString()
  }).eq('id', richId);

  if(r.error) { toast('Errore: '+r.error.message,'err'); return; }
  toast(stato==='approvata' ? '✅ Richiesta approvata' : '❌ Richiesta rifiutata', 'ok');
  await loadRichiesteModifica();
  if(ge('pg-calendario') && ge('pg-calendario').classList.contains('on')) loadCalendario();
}

// ── DASHBOARD TICKET ─────────────────────────────────────────
async function loadDashTicket(targetId) {
  var el = ge(targetId || 'dash-ticket-lista');
  var cnt = ge('dash-ticket-count');
  if(!el) return;

  // Query base senza filtro stato
  var query = db.from('ticket_clienti')
    .select('*, clienti(ragione_sociale)')
    .is('eliminato_il', null)
    .neq('stato','chiuso')
    .order('creato_il', {ascending:false})
    .limit(20);

  // Filtra per reparto in base al ruolo
  if(ROLE === 'capo_tecnico') query = query.in('assegnato_a',['capo_tecnico']);
  if(ROLE === 'commerciale') query = query.in('assegnato_a',['commerciale']);
  // segreteria e titolare vedono tutto

  var r = await query;
  var tickets = r.data || [];

  if(r.error) {
    el.innerHTML = '<div style="color:red;padding:10px">Errore query: ' + r.error.message + '</div>';
    return;
  }

  if(cnt) {
    cnt.textContent = tickets.length + ' aperte';
    cnt.style.display = tickets.length ? 'inline' : 'none';
  }

  if(!tickets.length) {
    // Prova query senza filtri per debug
    var rAll = await db.from('ticket_clienti').select('id,titolo,stato,assegnato_a').limit(5);
    var debugInfo = rAll.error ? 'Errore: '+rAll.error.message : 'Tot nel DB: '+(rAll.data||[]).length + ' — ' + (rAll.data||[]).map(function(t){return t.titolo+'('+t.assegnato_a+')'}).join(', ');
    el.innerHTML = '<div class="empty">✅ Nessuna richiesta aperta</div><div style="font-size:11px;color:var(--m);margin-top:8px">Debug: ROLE='+ROLE+' | '+debugInfo+'</div>';
    return;
  }

  var tipiIcon = {segnalazione:'🚨',intervento:'🔧',preventivo:'💼'};
  var prioritaCol = {bassa:'var(--m)',normale:'var(--b)',alta:'var(--a)',urgente:'var(--r)'};

  el.innerHTML = tickets.map(function(t) {
    var dt = new Date(t.creato_il).toLocaleDateString('it-IT');
    var cli = t.clienti?.ragione_sociale || '—';
    return '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:0.5px solid var(--bo);gap:10px">' +
      '<div style="flex:1">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">' +
          '<span style="font-size:16px">'+(tipiIcon[t.tipo]||'📋')+'</span>' +
          '<span style="font-size:13px;font-weight:600">'+esc(t.titolo)+'</span>' +
          '<span style="width:8px;height:8px;border-radius:50%;background:'+(prioritaCol[t.priorita]||'var(--m)')+'"></span>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--m)">'+cli+' · '+dt+'</div>' +
        (esc(t.descrizione) ? '<div style="font-size:12px;color:var(--t);margin-top:4px;opacity:.8">'+esc(t.descrizione).substring(0,80)+(esc(t.descrizione).length>80?'...':'')+'</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0">' +
        '<button class="btn sm p" data-id="'+t.id+'" onclick="apriTicket(this.dataset.id)">Gestisci</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function apriTicket(id) {
  // Apri modal gestione ticket
  var r = await db.from('ticket_clienti')
    .select('*, clienti(ragione_sociale,referente_telefono,referente_email)')
    .eq('id', id).single();
  if(r.error || !r.data) { toast('Errore caricamento ticket','err'); return; }
  var t = r.data;

  // Carica allegati
  var ra = await db.from('ticket_allegati').select('*').eq('ticket_id', id);
  var allegati = ra.data || [];

  var tipiIcon = {segnalazione:'🚨',intervento:'🔧',preventivo:'💼'};
  var tipiLabel = {segnalazione:'Segnalazione',intervento:'Richiesta intervento',preventivo:'Richiesta preventivo'};

  var allegatHtml = allegati.length ? allegati.map(function(a){
    return '<button class="btn sm" data-path="'+esc(a.storage_path)+'" data-nome="'+esc(a.nome_file)+'" onclick="scaricaAllegato(this.dataset.path,this.dataset.nome)">📎 '+esc(a.nome_file)+'</button>';
  }).join('') : '<span style="font-size:12px;color:var(--m)">Nessun allegato</span>';

  var html = '<div style="padding:16px">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">' +
      '<span style="font-size:24px">'+(tipiIcon[t.tipo]||'📋')+'</span>' +
      '<div><div style="font-size:16px;font-weight:700">'+esc(t.titolo)+'</div>' +
      '<div style="font-size:12px;color:var(--m)">'+(tipiLabel[t.tipo]||t.tipo)+' · '+new Date(t.creato_il).toLocaleDateString('it-IT')+'</div></div>' +
    '</div>' +
    '<div class="g2" style="margin-bottom:14px">' +
      '<div style="background:var(--bg);border-radius:var(--rs);padding:12px"><div style="font-size:11px;color:var(--m);margin-bottom:4px">CLIENTE</div>' +
        '<div style="font-weight:600">'+( t.clienti?.ragione_sociale||'—')+'</div>' +
        (t.clienti?.referente_telefono ? '<div style="font-size:12px">📞 '+t.clienti.referente_telefono+'</div>' : '') +
        (t.clienti?.referente_email ? '<div style="font-size:12px">✉️ '+t.clienti.referente_email+'</div>' : '') +
      '</div>' +
      '<div style="background:var(--bg);border-radius:var(--rs);padding:12px"><div style="font-size:11px;color:var(--m);margin-bottom:4px">SEDE</div>' +
        '<div>'+(t.sede_id ? 'Sede specifica' : 'Sede principale')+'</div>' +
      '</div>' +
    '</div>' +
    (esc(t.descrizione) ? '<div style="background:var(--bg);border-radius:var(--rs);padding:12px;margin-bottom:14px"><div style="font-size:11px;color:var(--m);margin-bottom:6px">DESCRIZIONE</div><div style="font-size:13px">'+esc(t.descrizione)+'</div></div>' : '') +
    '<div style="margin-bottom:14px"><div style="font-size:11px;color:var(--m);margin-bottom:6px">ALLEGATI</div><div style="display:flex;flex-wrap:wrap;gap:6px">'+allegatHtml+'</div></div>' +
    '<div class="f"><label>Note interne</label><textarea id="ticket-note-int" style="min-height:60px" placeholder="Aggiungi note per il team...">'+(esc(t.note_interne)||'')+'</textarea></div>' +
    '<div class="fr" style="margin-top:12px">' +
      '<div class="f"><label>Stato</label><select id="ticket-stato"><option value="aperto"'+(t.stato==='aperto'?' selected':'')+'>🟡 Aperto</option><option value="in_lavorazione"'+(t.stato==='in_lavorazione'?' selected':'')+'>🔵 In lavorazione</option><option value="chiuso"'+(t.stato==='chiuso'?' selected':'')+'>✅ Chiuso</option></select></div>' +
      '<div class="f"><label>Priorità</label><select id="ticket-priorita"><option value="bassa"'+(t.priorita==='bassa'?' selected':'')+'>⬇️ Bassa</option><option value="normale"'+(t.priorita==='normale'?' selected':'')+'>➡️ Normale</option><option value="alta"'+(t.priorita==='alta'?' selected':'')+'>⬆️ Alta</option><option value="urgente"'+(t.priorita==='urgente'?' selected':'')+'>🔴 Urgente</option></select></div>' +
    '</div>' +
    // Pianifica intervento (solo per tipo intervento/segnalazione)
    ((['intervento','segnalazione'].includes(t.tipo) && t.stato !== 'chiuso') ?
      '<div style="background:var(--gl);border-radius:var(--rs);padding:14px;margin-top:14px">' +
        '<div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--g)">📅 Pianifica intervento</div>' +
        '<div class="fr">' +
          '<div class="f" style="margin:0"><label style="font-size:11px">Data intervento</label><input type="date" id="ticket-piano-data"></div>' +
          '<div class="f" style="margin:0"><label style="font-size:11px">Tecnico</label><select id="ticket-piano-tec" style="width:100%"><option value="">— Seleziona —</option>'+
            UTENTI.filter(function(u){return ['tecnico','capo_tecnico'].includes(u.ruolo);}).map(function(u){return '<option value="'+u.id+'">'+esc(u.nome)+' '+esc(u.cognome)+'</option>';}).join('')+
          '</select></div>' +
        '</div>' +
        '<button class="btn p" style="margin-top:8px;width:100%" data-tid="'+t.id+'" data-cid="'+t.cliente_id+'" data-sid="'+(t.sede_id||'')+'" onclick="pianificaDaTicket(this.dataset.tid,this.dataset.cid,this.dataset.sid)">✅ Crea ordine di lavoro e pianifica</button>' +
      '</div>'
    : '') +
    '<div style="display:flex;gap:8px;margin-top:16px">' +
      '<button class="btn" data-mid="m-ticket" onclick="closeM(this.dataset.mid)">Chiudi</button>' +
      '<button class="btn p" data-id="'+t.id+'" onclick="salvaTicket(this.dataset.id)">💾 Salva</button>' +
      (ROLE==='titolare'||ROLE==='segreteria' ? '<button class="btn" data-id="'+t.id+'" onclick="eliminaTicket(this.dataset.id)" style="color:var(--r)">🗑️</button>' : '') +
    '</div>' +
  '</div>';

  // Mostra in modal
  var m = ge('m-ticket');
  if(!m) {
    m = document.createElement('div');
    m.id = 'm-ticket';
    m.className = 'mbg';
    m.innerHTML = '<div class="modal" style="max-width:680px"><div class="mh">Gestione richiesta <button class="mx" data-mid="m-ticket" onclick="closeM(this.dataset.mid)">✕</button></div><div id="m-ticket-body"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function(e){ if(e.target===this) this.classList.remove('on'); });
  }
  ge('m-ticket-body').innerHTML = html;
  m.classList.add('on');
}


async function pianificaDaTicket(ticketId, cliId, sedeId) {
  var data = ge('ticket-piano-data') ? ge('ticket-piano-data').value : '';
  var tecId = ge('ticket-piano-tec') ? ge('ticket-piano-tec').value : '';
  if(!data) { toast('Seleziona la data intervento','err'); return; }

  // Crea OdL collegato al ticket
  var rOdl = await db.from('ordini_lavoro').insert({
    cliente_id: cliId,
    tipo: 'ordinario_chiamata',
    tecnico_id: tecId || null,
    data_pianificata: data,
    sede_id: sedeId || null,
    stato: 'pianificato',
    note_per_tecnico: 'Intervento da richiesta cliente'
  }).select().single();

  if(rOdl.error) { toast('Errore creazione intervento: '+rOdl.error.message,'err'); return; }

  // Aggiorna ticket: salva odl_id per mostrare data al cliente nel portale
  await db.from('ticket_clienti').update({
    stato: 'in_lavorazione',
    odl_id: rOdl.data.id,
    note_interne: (ge('ticket-note-int').value||'') || null,
    aggiornato_il: new Date().toISOString()
  }).eq('id', ticketId);

  toast('✅ Intervento pianificato e ticket aggiornato','ok');
  chiudiModal('m-ticket');
  loadDash();
  await loadDashTicket();
  if(ge('pg-interventi') && ge('pg-interventi').classList.contains('on')) loadOdl();
}

async function salvaTicket(id) {
  var r = await db.from('ticket_clienti').update({
    stato: ge('ticket-stato').value,
    priorita: ge('ticket-priorita').value,
    note_interne: ge('ticket-note-int').value || null,
    aggiornato_il: new Date().toISOString()
  }).eq('id', id);
  if(r.error) { toast('Errore: '+r.error.message,'err'); return; }
  toast('✅ Ticket aggiornato','ok');
  closeM('m-ticket');
  await loadDashTicket();
}

async function eliminaTicket(id) {
  if(!confirm('Eliminare questa richiesta? (Soft-delete: la traccia resta nel DB)')) return;
  // Allegati: hard-delete (sono solo metadati di file)
  await db.from('ticket_allegati').delete().eq('ticket_id', id);
  // Ticket: soft-delete
  var r = await softDel('ticket_clienti').eq('id', id);
  if(r.error){ toast('Errore: '+r.error.message,'err'); return; }
  toast('Ticket eliminato','ok');
  closeM('m-ticket');
  await loadDashTicket();
}

async function scaricaAllegato(path, nomeFile) {
  var r = await db.storage.from('ticket-allegati').createSignedUrl(path, 3600);
  if(r.error) { toast('Errore download','err'); return; }
  var a = document.createElement('a');
  a.href = r.data.signedUrl; a.download = nomeFile; a.target='_blank';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── DASHBOARD SEGRETERIA ─────────────────────────────────────
// Campi obbligatori cliente: ragione_sociale è già richiesta
// Campi importanti mancanti da segnalare:
const CAMPI_OBBLIGATORI_CLI = [
  {field:'piva',           label:'P.IVA'},
  {field:'codice_fiscale', label:'Codice fiscale'},
  {field:'referente_nome', label:'Referente'},
  {field:'referente_telefono', label:'Telefono'},
  {field:'referente_email',    label:'Email'},
  {field:'citta',              label:'Città'},
  {field:'indirizzo_fattura',  label:'Indirizzo fatturazione'},
  {field:'cap_fattura',        label:'CAP fatturazione'},
  {field:'citta_fattura',      label:'Città fatturazione'},
  {field:'codice_sdi',         label:'Codice SDI'},
  {field:'modalita_pagamento', label:'Modalità pagamento'},
];

async function loadDashSegreteria() {
  var el = ge('dash-seg-lista');
  var countEl = ge('dash-seg-count');
  if(!el) return;
  el.innerHTML = '<div class="load">Caricamento...</div>';

  // Carica tutti i clienti attivi con tutti i campi
  var r = await db.from('clienti')
    .select('id,ragione_sociale,piva,codice_fiscale,referente_nome,referente_telefono,referente_email,citta,indirizzo_fattura,cap_fattura,citta_fattura,codice_sdi,modalita_pagamento')
    .is('eliminato_il', null)
    .eq('stato','attivo')
    .order('ragione_sociale');

  var clienti = r.data || [];

  // Filtra solo quelli con campi mancanti
  var daFare = clienti.map(function(c) {
    var mancanti = CAMPI_OBBLIGATORI_CLI.filter(function(campo) {
      return !c[campo.field] || String(c[campo.field]).trim() === '';
    });
    return { cli: c, mancanti: mancanti };
  }).filter(function(x) { return x.mancanti.length > 0; });

  if(countEl) countEl.textContent = daFare.length > 0 ? daFare.length + ' da completare' : '';
  if(countEl) countEl.style.background = daFare.length > 0 ? 'var(--r)' : 'var(--g)';

  if(!daFare.length) {
    el.innerHTML = '<div class="empty">✅ Tutti i clienti hanno i dati completi!</div>';
    return;
  }

  el.innerHTML = daFare.map(function(x) {
    var mancantiHtml = x.mancanti.map(function(m) {
      return '<span style="background:var(--al);color:var(--a);padding:2px 8px;border-radius:10px;font-size:11px;margin:2px">' + m.label + '</span>';
    }).join('');
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:0.5px solid var(--bo);gap:10px;flex-wrap:wrap">' +
      '<div>' +
        '<div style="font-size:13px;font-weight:600">' + x.cli.ragione_sociale + '</div>' +
        '<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">' + mancantiHtml + '</div>' +
      '</div>' +
      '<button class="btn sm p" data-cliid="'+x.cli.id+'" onclick="apriClienteSegreteria(this.dataset.cliid)">✏️ Completa</button>' +
    '</div>';
  }).join('');
}

async function apriClienteSegreteria(id) {
  toast('Caricamento...', 'ok');
  // Carica dati completi del cliente da Supabase
  var r = await db.from('clienti').select('*').eq('id', id).single();
  if(r.error || !r.data) { toast('Errore caricamento cliente', 'err'); return; }
  var cli = r.data;

  // Precompila il modal con tutti i dati (anagrafica + fatturazione)
  ge('mcli-title').textContent = 'Completa dati — ' + esc(cli.ragione_sociale);
  ge('mc-edit-id').value = id;

  // Anagrafica
  var map = {
    mc1: 'ragione_sociale', mc2: 'referente_nome', mc2b: 'referente_cognome',
    mc3: 'referente_telefono', mc4: 'referente_email', mc5: 'piva',
    mc6: 'codice_fiscale', mc9: 'note_commerciali'
  };
  Object.keys(map).forEach(function(elId) {
    var el = ge(elId); if(el) el.value = cli[map[elId]] || '';
  });
  if(ge('mc7')) ge('mc7').value = esc(cli.tipo_attivita) || 'ufficio';
  if(ge('mc8')) ge('mc8').value = cli.stato || 'attivo';

  // Fatturazione
  var mapF = {
    mf1: 'ragione_sociale_fattura', mf2: 'indirizzo_fattura',
    mf3: 'cap_fattura', mf4: 'citta_fattura', mf5: 'provincia_fattura',
    mf6: 'codice_sdi', mf7: 'pec', mf9: 'giorni_pagamento',
    mf10: 'iban', mf11: 'note_fatturazione'
  };
  Object.keys(mapF).forEach(function(elId) {
    var el = ge(elId); if(el) el.value = cli[mapF[elId]] || '';
  });
  if(ge('mf8')) ge('mf8').value = cli.modalita_pagamento || '';
  if(ge('mf9') && !cli.giorni_pagamento) ge('mf9').value = '30';

  // Apri il modal e vai direttamente al tab fatturazione se mancano quei dati
  openM('m-cli');

  // Se mancano dati di fatturazione, vai al tab fatturazione
  var mancaFatturazione = !cli.indirizzo_fattura || !cli.codice_sdi || !cli.modalita_pagamento;
  if(mancaFatturazione) {
    setTimeout(function() {
      var tabs = document.querySelectorAll('#m-cli .tab');
      tabs.forEach(function(t) {
        if(t.getAttribute('onclick') && t.getAttribute('onclick').includes('mct-fat')) {
          t.click();
        }
      });
    }, 100);
  }
}

// ── DASHBOARD CAPO TECNICO ───────────────────────────────────
async function loadDashCapoTecnico(targetId) {
  var el = ge(targetId || 'dash-ct-lista');
  var meseEl = ge('dash-ct-mese');
  if(!el) return;

  var oggi = new Date();
  var meseStr = oggi.getFullYear() + '-' + String(oggi.getMonth()+1).padStart(2,'0');
  if(meseEl) meseEl.textContent = oggi.toLocaleDateString('it-IT',{month:'long',year:'numeric'});

  el.innerHTML = '<div class="load">Caricamento...</div>';

  // Cicli pianificati del mese corrente senza OdL
  var r = await db.from('cicli_pianificati')
    .select('*, clienti(ragione_sociale)')
    .eq('mese_anno', meseStr)
    .eq('stato','pianificato')
    .is('odl_id', null)
    .order('cliente_id');

  var cicli = r.data || [];

  if(!cicli.length) {
    el.innerHTML = '<div class="empty">✅ Tutti gli interventi di questo mese sono già schedulati</div>';
    return;
  }

  // Raggruppa per cliente
  var byCliente = {};
  cicli.forEach(function(c) {
    if(!byCliente[c.cliente_id]) byCliente[c.cliente_id] = { nome: c.clienti?.ragione_sociale||'—', tipi: [] };
    byCliente[c.cliente_id].tipi.push(c.tipo_presidio);
  });

  el.innerHTML = Object.keys(byCliente).map(function(cliId) {
    var g = byCliente[cliId];
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:0.5px solid var(--bo);gap:10px;flex-wrap:wrap">' +
      '<div>' +
        '<div style="font-size:13px;font-weight:600">' + esc(g.nome) + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">' +
          g.tipi.map(function(t){return '<span style="background:var(--bl);color:var(--b);padding:2px 8px;border-radius:10px;font-size:11px">'+tpl(t)+'</span>';}).join('') +
        '</div>' +
      '</div>' +
      '<button class="btn sm p" data-cli="'+cliId+'" data-mese="'+meseStr+'" onclick="creaOdlDaCiclo(this.dataset.cli,this.dataset.mese)">+ Schedula intervento</button>' +
    '</div>';
  }).join('');
}

// Apre m-odl pre-compilato per schedulare un intervento periodico
// (chiamato dal pannello "Interventi periodici del mese" della dashboard capo_tecnico)
async function creaOdlDaCiclo(cliId, meseAnno){
  if(!cliId) return;
  await apriNuovoIntervento();
  // Pre-seleziona cliente e carica sedi
  var cliSel = ge('mo1');
  if(cliSel){ cliSel.value = cliId; }
  await loadSediForOdl();
  await calcolaPresidiSede(cliId, null, 'mo-presidi-preview');
  // Tipo default per periodici
  var t = ge('mo2'); if(t) t.value = 'ordinario_programmato';
  // Nota suggerita
  var n = ge('mo6'); if(n) n.value = 'Intervento periodico — ' + (meseAnno || '');
}

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

// ── PRESIDI ───────────────────────────────────────────────────
async function loadPresidi(){
  const {data}=await db.from('impianti').select('*,clienti(ragione_sociale),sedi_cliente(id,tipo,indirizzo,citta)').is('eliminato_il',null).order('tipo').order('creato_il',{ascending:false});
  PA=data||[];PF=PA;renderPC(PA);renderPT(PA);renderPS(PA);
  const names=[...new Set(PA.map(p=>p.clienti?.ragione_sociale).filter(Boolean))].sort();
  const cur=v('pcli');ge('pcli').innerHTML='<option value="">Tutti i clienti</option>'+names.map(n=>`<option value="${n}"${n===cur?' selected':''}>${n}</option>`).join('');
}

function filterP(){
  const q=v('psearch').toLowerCase(),t=v('ptipo'),s=v('pstato'),c=v('pcli');
  PF=PA.filter(p=>(!q||(p.matricola||'').toLowerCase().includes(q)||(p.clienti?.ragione_sociale||'').toLowerCase().includes(q)||(p.ubicazione||'').toLowerCase().includes(q))&&(!t||p.tipo===t)&&(!s||p.stato===s)&&(!c||(p.clienti?.ragione_sociale||'')===c));
  renderPC(PF);renderPT(PF);
}

function renderPC(data){
  const w=ge('pcards');
  if(!data.length){w.innerHTML='<div style="grid-column:1/-1"><div class="empty">Nessun presidio.<br><button class="btn p sm" style="margin-top:12px" onclick="resetPF();openM(\'m-presidio\')">+ Aggiungi</button></div></div>';return;}
  w.innerHTML=data.map(p=>`<div class="pc">
    <div style="position:absolute;top:12px;right:12px">${si2(p.stato)}</div>
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--m);margin-bottom:4px">${tpl(p.tipo)}</div>
    <div style="font-size:14px;font-weight:600;margin-bottom:2px">${esc(p.matricola||'—')}</div>
    <div style="font-size:12px;color:var(--m);margin-bottom:10px">${esc(p.clienti?.ragione_sociale||'—')}</div>
    <div style="font-size:12px;display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Ubicazione</span><span>${esc(p.ubicazione||'—')}${esc(p.piano?' ('+p.piano+')':'')}</span></div>
      ${p.tipo==='estintore'?`<div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Agente</span><span>${al2(p.modello)||'—'} ${p.marca||''}</span></div>`:''}
      ${p.tipo==='porta_rei'?`<div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Classe</span><span>${p.modello||'—'}</span></div>`:''}
      <div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Ultima verifica</span><span>${fd(p.data_ultimo_controllo)}</span></div>
      <div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Prossima verifica</span><span class="${sc(p.data_prossimo_controllo)}">${fd(p.data_prossimo_controllo)} (${dd2(p.data_prossimo_controllo)})</span></div>
      ${p.data_scadenza_collaudo?`<div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Scad. collaudo</span><span class="${sc(p.data_scadenza_collaudo)}">${fd(p.data_scadenza_collaudo)}</span></div>`:''}
    </div>
    <div style="display:flex;gap:6px;margin-top:10px"><button class="btn sm" onclick="editP('${p.id}')">Modifica</button></div>
  </div>`).join('');
}

function renderPT(data){
  const tb=ge('ptbody');if(!data.length){tb.innerHTML='<tr><td colspan="9"><div class="empty">Nessun presidio</div></td></tr>';return;}
  tb.innerHTML=data.map(p=>`<tr><td>${tpl(p.tipo)}</td><td>${esc(p.clienti?.ragione_sociale||'—')}</td><td style="font-family:monospace;font-size:12px">${esc(p.matricola||'—')}</td><td>${esc(p.ubicazione||'—')}${esc(p.piano?' ('+p.piano+')':'')}</td><td>${fd(p.data_ultimo_controllo)}</td><td class="${sc(p.data_prossimo_controllo)}">${fd(p.data_prossimo_controllo)} (${dd2(p.data_prossimo_controllo)})</td><td>${p.periodicita_mesi?p.periodicita_mesi+' mesi':'—'}</td><td>${si2(p.stato)} ${p.stato}</td><td>${(ROLE==='titolare'||ROLE==='capo_tecnico'||ROLE==='segreteria')?`<button class="btn sm" onclick="editP('${p.id}')">✏️</button>`:''}${(ROLE==='titolare'||ROLE==='capo_tecnico')?`<button class="btn sm" style="color:var(--r)" onclick="eliminaPresidio('${p.id}')">🗑️</button>`:''}</td></tr>`).join('');
}

function renderPS(data){
  const in30=new Date(Date.now()+30*86400000),in90=new Date(Date.now()+90*86400000);
  const u=data.filter(p=>p.data_prossimo_controllo&&new Date(p.data_prossimo_controllo+'T00:00:00')<=in30);
  const pr=data.filter(p=>p.data_prossimo_controllo&&new Date(p.data_prossimo_controllo+'T00:00:00')>in30&&new Date(p.data_prossimo_controllo+'T00:00:00')<=in90);
  const rl=(items,el)=>{if(!items.length){ge(el).innerHTML='<div class="empty" style="padding:20px">Nessuno ✅</div>';return;}ge(el).innerHTML=items.map(p=>`<div style="padding:10px;background:var(--bg);border-radius:var(--rs);margin-bottom:6px"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-weight:500;font-size:13px">${esc(p.clienti?.ragione_sociale||'—')}</div><div style="font-size:12px;color:var(--m)">${tpl(p.tipo)} ${p.matricola?'— #'+esc(p.matricola):''}</div><div style="font-size:12px;color:var(--m)">${esc(p.ubicazione||'')}</div></div><div style="text-align:right"><div class="${sc(p.data_prossimo_controllo)}">${fd(p.data_prossimo_controllo)}</div><div style="font-size:11px;color:var(--m)">${dd2(p.data_prossimo_controllo)}</div>${p.periodicita_mesi?`<div style="font-size:10px;color:var(--m)">ogni ${p.periodicita_mesi} mesi</div>`:''}</div></div></div>`).join('');};
  rl(u,'su');rl(pr,'sp2');
}

function switchPF(){const t=v('mptp');ge('fe').style.display=t==='estintore'?'block':'none';ge('fp').style.display=t==='porta_rei'?'block':'none';if(t!=='estintore'&&t!=='porta_rei'){ge('fe').style.display='block';}}
function resetPF(){ge('mpt').textContent='Nuovo presidio';ge('mpeid').value='';ge('mptp').value='estintore';switchPF();['me1','me2','me5','me6','me7','me14','mp1','mp3','mp4','mp6','mp15'].forEach(id=>{const el=ge(id);if(el)el.value='';});['me8','me9','me10','me11','mp7','mp8','mp9'].forEach(id=>{const el=ge(id);if(el)el.value='';});ge('me3').value='polvere_abc';ge('me4').value='6kg';ge('me13').value='ok';ge('mp2').value='REI 60';ge('mp14').value='ok';}

function editP(id){
  const p=PA.find(x=>x.id===id);if(!p)return;
  resetPF();ge('mpt').textContent='Modifica presidio';ge('mpeid').value=id;ge('mptp').value=p.tipo;ge('mpcl').value=p.cliente_id||'';switchPF();
  if(p.tipo==='porta_rei'){ge('mp1').value=esc(p.matricola)||'';ge('mp2').value=p.modello||'REI 60';
  if(p.cliente_id) loadSediPresidio(p.cliente_id, p.sede_id);ge('mp3').value=esc(p.ubicazione)||'';ge('mp4').value=p.piano||'';ge('mp6').value=p.marca||'';ge('mp7').value=p.data_installazione||'';ge('mp8').value=p.data_ultimo_controllo||'';ge('mp9').value=p.data_prossimo_controllo||'';ge('mp14').value=p.stato||'ok';ge('mp15').value=esc(p.note)||'';}
  else{ge('me1').value=esc(p.matricola)||'';ge('me2').value=p.marca||'';
  if(p.cliente_id) loadSediPresidio(p.cliente_id, p.sede_id);ge('me3').value=p.modello||'polvere_abc';ge('me4').value=p.marca||'6kg';ge('me5').value=esc(p.ubicazione)||'';ge('me6').value=p.piano||'';ge('me7').value=p.locale||'';ge('me8').value=p.data_installazione||'';ge('me9').value=p.data_ultimo_controllo||'';ge('me10').value=p.data_prossimo_controllo||'';ge('me11').value=p.data_scadenza_collaudo||'';ge('me13').value=p.stato||'ok';ge('me14').value=esc(p.note)||'';}
  openM('m-presidio');
}

async function saveP(){
  const tipo=v('mptp'),cid=v('mpcl');if(!cid){toast('Seleziona un cliente','err');return;}
  const eid=v('mpeid');let payload={cliente_id:cid,tipo};
  if(tipo==='porta_rei'){const mat=v('mp1').trim();if(!mat){toast("Inserisci l'ID porta",'err');return;}payload={...payload,matricola:mat,modello:v('mp2'),marca:v('mp6')||null,ubicazione:v('mp3')||null,piano:v('mp4')||null,data_installazione:v('mp7')||null,data_ultimo_controllo:v('mp8')||null,data_prossimo_controllo:v('mp9')||null,stato:v('mp14'),note:v('mp15')||null,sede_id:v('mpsede')||null};}
  else{const mat=v('me1').trim();if(!mat){toast('Inserisci la matricola','err');return;}payload={...payload,matricola:mat,marca:v('me4'),modello:v('me3'),ubicazione:v('me5')||null,piano:v('me6')||null,locale:v('me7')||null,data_installazione:v('me8')||null,data_ultimo_controllo:v('me9')||null,data_prossimo_controllo:v('me10')||null,data_scadenza_collaudo:v('me11')||null,stato:v('me13'),note:v('me14')||null,sede_id:v('mpsede')||null};}
  let error;
  if(eid){({error}=await db.from('impianti').update(payload).eq('id',eid));}
  else{({error}=await db.from('impianti').insert(payload));}
  if(error){toast('Errore: '+error.message,'err');return;}
  closeM('m-presidio');toast(eid?'Presidio aggiornato ✓':'Presidio salvato ✓','ok');loadPresidi();loadDash();
}

// ── PERIODICITA CLIENTE ───────────────────────────────────────
async function loadPeriodicitaCliente(cliId){
  const {data}=await db.from('clienti_periodicita').select('*').eq('cliente_id',cliId).maybeSingle();
  const perio=data||{};

  // Popola campi contratto
  var pd = ge('perio-durata'); if(pd) pd.value = perio.durata_contratto || 'annuale';
  var pi = ge('perio-inizio'); if(pi) pi.value = perio.data_inizio_contratto || '';
  var pf = ge('perio-fine'); if(pf) pf.value = perio.data_fine_contratto || '';
  var pn = ge('perio-note'); if(pn) pn.value = perio.note_contratto || '';

  // Listener per calcolo automatico data fine
  if(pi) pi.onchange = function() { calcolaFineContratto(); };
  if(pd) pd.onchange = function() { calcolaFineContratto(); };

  // Stato generazione
  var bgen = ge('btn-genera-piano');
  var stato = ge('perio-stato-gen');
  if(perio.pianificazione_generata && bgen) {
    bgen.style.display = '';
    bgen.textContent = '🔄 Rigenera piano interventi';
    bgen.className = 'btn warn';
    if(stato) stato.textContent = '✅ Piano già generato il ' + (perio.ultima_generazione ? new Date(perio.ultima_generazione).toLocaleDateString('it-IT') : '—');
  } else if(bgen) {
    bgen.style.display = perio.data_inizio_contratto ? '' : 'none';
  }

  // Grid periodicità per tipo
  ge('cd-perio-content').innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
    ${TIPI_PRESIDI.map(t=>`<div style="background:var(--bg);border-radius:var(--rs);padding:12px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">${tpl(t)}</div>
      <select id="perio-${t}" style="width:100%;font-size:13px">
        <option value="">Non previsto</option>
        ${PERIO_OPT.map(p=>`<option value="${p}"${perio[t]===p?' selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
      </select>
    </div>`).join('')}
  </div>`;

  // Carica piano se già generato
  if(perio.pianificazione_generata) await loadPrevistaCliente(cliId);
}

function calcolaFineContratto() {
  var inizio = ge('perio-inizio') ? ge('perio-inizio').value : '';
  var durata = ge('perio-durata') ? ge('perio-durata').value : 'annuale';
  var fine = ge('perio-fine');
  if(!inizio || !fine) return;
  var d = new Date(inizio + 'T00:00:00');
  if(durata === 'annuale') d.setFullYear(d.getFullYear() + 1);
  else d.setFullYear(d.getFullYear() + 5);
  d.setDate(d.getDate() - 1);
  fine.value = d.toISOString().split('T')[0];
  var bgen = ge('btn-genera-piano');
  if(bgen) bgen.style.display = '';
}

async function savePeriodicita(){
  if(!currentCliId){toast('Errore: nessun cliente selezionato','err');return;}
  const payload={
    cliente_id: currentCliId,
    durata_contratto: v('perio-durata') || 'annuale',
    data_inizio_contratto: v('perio-inizio') || null,
    data_fine_contratto: v('perio-fine') || null,
    note_contratto: v('perio-note') || null,
  };
  TIPI_PRESIDI.forEach(t=>{payload[t]=v('perio-'+t)||null;});
  const {data:existing}=await db.from('clienti_periodicita').select('id').eq('cliente_id',currentCliId).maybeSingle();
  let error;
  if(existing){({error}=await db.from('clienti_periodicita').update(payload).eq('cliente_id',currentCliId));}
  else{({error}=await db.from('clienti_periodicita').insert(payload));}
  if(error){toast('Errore: '+error.message,'err');return;}
  toast('✅ Periodicità e contratto salvati','ok');
  // Aggiorna date prossima verifica per i presidi esistenti
  await aggiornaProssimeDate(currentCliId,payload);
  // Mostra bottone genera
  var bgen = ge('btn-genera-piano');
  if(bgen && payload.data_inizio_contratto) bgen.style.display = '';
}

async function aggiornaProssimeDate(cliId,perio){
  const {data:presidi}=await db.from('impianti').select('*').eq('cliente_id',cliId);
  if(!presidi?.length)return;
  for(const p of presidi){
    const per=perio[p.tipo];
    if(!per)continue;
    const mesi=PERIO_MESI[per];
    if(!mesi)continue;
    const base=p.data_ultimo_controllo||new Date().toISOString().split('T')[0];
    const d=new Date(base+'T00:00:00');d.setMonth(d.getMonth()+mesi);
    await db.from('impianti').update({periodicita_mesi:mesi,data_prossimo_controllo:d.toISOString().split('T')[0]}).eq('id',p.id);
  }
  toast('Date aggiornate automaticamente ✓','ok');
}


// ── PIANIFICAZIONE AUTOMATICA INTERVENTI ─────────────────────

async function generaPianificazione() {
  if(!currentCliId) { toast('Nessun cliente selezionato','err'); return; }
  if(ROLE !== 'titolare' && ROLE !== 'capo_tecnico') {
    toast('Solo titolare e capo tecnico possono generare il piano','err'); return;
  }

  var btn = ge('btn-genera-piano');
  var stato = ge('perio-stato-gen');
  if(btn) { btn.disabled = true; btn.textContent = '⏳ Generazione...'; }

  try {
    // Carica dati contratto e periodicità
    var rc = await db.from('clienti_periodicita').select('*').eq('cliente_id', currentCliId).maybeSingle();
    if(!rc.data || !rc.data.data_inizio_contratto) {
      toast('Imposta prima la data di inizio contratto','err');
      if(btn) { btn.disabled=false; btn.textContent='📅 Genera piano interventi'; }
      return;
    }
    var perio = rc.data;
    var inizio = new Date(perio.data_inizio_contratto + 'T00:00:00');
    var fine = perio.data_fine_contratto
      ? new Date(perio.data_fine_contratto + 'T00:00:00')
      : new Date(inizio.getFullYear() + (perio.durata_contratto === 'quinquennale' ? 5 : 1), inizio.getMonth(), inizio.getDate());

    // Elimina cicli precedenti non ancora eseguiti
    await db.from('cicli_pianificati')
      .delete()
      .eq('cliente_id', currentCliId)
      .eq('stato', 'pianificato');

    // Genera cicli per ogni tipo di presidio con periodicità
    var cicli = [];
    var oggi = new Date();

    TIPI_PRESIDI.forEach(function(tipo) {
      var periLabel = perio[tipo];
      if(!periLabel) return;
      var mesi = PERIO_MESI[periLabel];
      if(!mesi) return;

      // Calcola prima data: inizio contratto o data prossimo controllo se nel futuro
      var dataBase = new Date(inizio);

      // Genera tutte le occorrenze fino alla fine contratto
      var dataCorrente = new Date(dataBase);
      while(dataCorrente <= fine) {
        var mesAnno = dataCorrente.getFullYear() + '-' + String(dataCorrente.getMonth()+1).padStart(2,'0');
        cicli.push({
          cliente_id: currentCliId,
          tipo_presidio: tipo,
          data_prevista: dataCorrente.toISOString().split('T')[0],
          mese_anno: mesAnno,
          stato: dataCorrente < oggi ? 'saltato' : 'pianificato'
        });
        dataCorrente.setMonth(dataCorrente.getMonth() + mesi);
      }
    });

    if(!cicli.length) {
      toast('Nessun ciclo da generare — controlla le periodicità','err');
      if(btn) { btn.disabled=false; }
      return;
    }

    // Inserisci in batch
    var batchSize = 50;
    for(var i=0; i<cicli.length; i+=batchSize) {
      var r = await db.from('cicli_pianificati').insert(cicli.slice(i, i+batchSize));
      if(r.error) throw r.error;
    }

    // Segna come generato
    await db.from('clienti_periodicita').update({
      pianificazione_generata: true,
      ultima_generazione: new Date().toISOString()
    }).eq('cliente_id', currentCliId);

    toast('✅ Piano generato: ' + cicli.length + ' interventi programmati', 'ok');
    if(stato) stato.textContent = '✅ Piano generato: ' + cicli.length + ' interventi';
    if(btn) { btn.disabled=false; btn.textContent='🔄 Rigenera piano'; btn.className='btn warn'; }
    await loadPrevistaCliente(currentCliId);

  } catch(e) {
    console.error('Errore generazione:', e);
    toast('Errore: ' + e.message, 'err');
    if(btn) { btn.disabled=false; btn.textContent='📅 Genera piano interventi'; }
  }
}

async function loadPrevistaCliente(cliId) {
  var preview = ge('perio-piano-preview');
  if(!preview) return;

  var r = await db.from('cicli_pianificati')
    .select('*')
    .eq('cliente_id', cliId)
    .order('data_prevista');
  var cicli = r.data || [];
  if(!cicli.length) { preview.style.display='none'; return; }

  // Raggruppa per mese
  var byMese = {};
  cicli.forEach(function(c) {
    if(!byMese[c.mese_anno]) byMese[c.mese_anno] = [];
    byMese[c.mese_anno].push(c);
  });

  var mesiKeys = Object.keys(byMese).sort();
  var colori = {pianificato:'var(--bl)',eseguito:'var(--gl)',saltato:'var(--al)'};
  var icone = {pianificato:'📅',eseguito:'✅',saltato:'⏭️'};

  preview.style.display = 'block';
  preview.innerHTML = '<div style="font-size:14px;font-weight:600;margin-bottom:12px">📋 Piano interventi generato</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">' +
    mesiKeys.map(function(mese) {
      var items = byMese[mese];
      var d = new Date(mese + '-01');
      var label = d.toLocaleDateString('it-IT', {month:'long', year:'numeric'});
      var itemsHtml = items.map(function(c) {
        return '<div style="display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 0">' +
          icone[c.stato] + ' ' + tpl(c.tipo_presidio) +
          '<span style="color:var(--m)">(' + c.stato + ')</span></div>';
      }).join('');
      var hasPianificati = items.some(function(c){return c.stato==='pianificato';});
      return '<div style="background:var(--bg);border-radius:var(--rs);padding:12px;border-left:3px solid '+(hasPianificati?'var(--b)':'var(--bo)')+'">' +
        '<div style="font-weight:600;font-size:13px;margin-bottom:6px">'+label+'</div>' +
        itemsHtml + '</div>';
    }).join('') + '</div>';
}

// Capo tecnico: pannello pianificazione mensile
// Stato globale piano mensile
var _pianoTecnici = [], _pianoOdls = [];

async function loadPianificazioneMensile(anno, mese) {
  var el = ge('piano-mensile-content');
  if(!el) return;
  el.innerHTML = '<div class="load">Caricamento...</div>';

  var meseStr = anno + '-' + String(mese).padStart(2,'0');
  var primoGiorno = meseStr + '-01';
  var ultimoGiorno = meseStr + '-31';

  var [rCicli, rOdl, rTec] = await Promise.all([
    db.from('cicli_pianificati')
      .select('*, clienti(ragione_sociale, referente_telefono)')
      .eq('mese_anno', meseStr)
      .eq('stato','pianificato')
      .order('cliente_id'),
    db.from('ordini_lavoro')
      .select('id,numero,tipo,stato,data_pianificata,tecnico_id,cliente_id,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)')
      .gte('data_pianificata', primoGiorno)
      .lte('data_pianificata', ultimoGiorno)
      .order('data_pianificata'),
    db.from('utenti').select('id,nome,cognome').in('ruolo',['tecnico','capo_tecnico']).eq('attivo',true).order('nome')
  ]);

  _pianoTecnici = rTec.data || [];
  _pianoOdls = rOdl.data || [];
  var cicli = rCicli.data || [];

  var tecOpt = '<option value="">— Nessun tecnico —</option>' +
    _pianoTecnici.map(function(t){return '<option value="'+t.id+'">'+esc(t.nome)+' '+esc(t.cognome)+'</option>';}).join('');

  // Cicli senza OdL raggruppati per cliente
  var byCliente = {};
  cicli.filter(function(c){return !c.odl_id;}).forEach(function(c){
    if(!byCliente[c.cliente_id]) byCliente[c.cliente_id] = {cli:c.clienti, items:[]};
    byCliente[c.cliente_id].items.push(c);
  });

  var html = '';
  var cliKeys = Object.keys(byCliente);

  if(cliKeys.length) {
    html += '<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--r);margin-bottom:12px">⚠️ Da schedulare ('+cliKeys.length+' clienti)</div>';
    html += cliKeys.map(function(cliId){
      var g = byCliente[cliId];
      var cli = g.cli||{};
      var tel = esc(cli.referente_telefono) ? '<a href="tel:'+esc(cli.referente_telefono)+'" style="color:var(--g)">📞 '+esc(cli.referente_telefono)+'</a>' : '';
      var tipi = g.items.map(function(c){return '<span style="background:var(--bl);color:var(--b);padding:3px 9px;border-radius:20px;font-size:11px">'+tpl(c.tipo_presidio)+'</span>';}).join(' ');
      return '<div class="card" style="margin-bottom:10px;border-left:3px solid var(--r)">' +
        '<div style="font-size:14px;font-weight:600;margin-bottom:2px">'+(esc(cli.ragione_sociale)||'—')+'</div>' +
        '<div style="font-size:12px;color:var(--m);margin-bottom:8px">'+tel+'</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px">'+tipi+'</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">' +
          '<div><label style="font-size:11px;color:var(--m)">Data</label>' +
            '<input type="date" id="pd-'+cliId+'" value="'+anno+'-'+String(mese).padStart(2,'0')+'-15" style="width:100%;font-size:13px"></div>' +
          '<div><label style="font-size:11px;color:var(--m)">Tecnico</label>' +
            '<select id="pt-'+cliId+'" style="width:100%;font-size:13px">'+tecOpt+'</select></div>' +
          '<button class="btn p" style="white-space:nowrap" onclick="schedulaOdl(\"'+cliId+'\",\"'+meseStr+'\")">✅ Schedula</button>' +
        '</div></div>';
    }).join('');
  }

  if(_pianoOdls.length) {
    html += '<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--g);margin:20px 0 12px">✅ Già schedulati questo mese ('+_pianoOdls.length+')</div>';
    html += _pianoOdls.map(function(o){
      var cli = o.clienti?.ragione_sociale||'—';
      var tecOpts = '<option value="">— Nessuno —</option>' +
        _pianoTecnici.map(function(t){return '<option value="'+t.id+'"'+(o.tecnico_id===t.id?' selected':'')+'>'+esc(t.nome)+' '+esc(t.cognome)+'</option>';}).join('');
      return '<div class="card" style="margin-bottom:8px;border-left:3px solid var(--g)">' +
        '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;align-items:center">' +
          '<div><div style="font-size:13px;font-weight:600">'+cli+'</div>' +
            '<div style="font-size:11px;color:var(--m)">OdL #'+(o.numero||'—')+' · '+bs(o.stato)+'</div></div>' +
          '<input type="date" value="'+(o.data_pianificata||'')+' " onchange="aggiornaOdlPiano(this.dataset.id,\'data_pianificata\',this.value)" data-id="'+o.id+'" style="font-size:12px" title="Sposta data">' +
          '<select onchange="aggiornaOdlPiano(this.dataset.id,\'tecnico_id\',this.value)" data-id="'+o.id+'" style="font-size:12px" title="Cambia tecnico">'+tecOpts+'</select>' +
        '</div></div>';
    }).join('');
  }

  if(!html) html = '<div class="empty">✅ Nessun intervento pianificato per questo mese</div>';
  el.innerHTML = html;
}

async function schedulaOdl(cliId, meseAnno) {
  var dataEl = ge('pd-'+cliId);
  var tecEl = ge('pt-'+cliId);
  var data = dataEl ? dataEl.value : '';
  var tecId = tecEl ? tecEl.value : '';
  if(!data) { toast('Inserisci la data intervento', 'err'); return; }

  var r = await db.from('ordini_lavoro').insert({
    cliente_id: cliId,
    tipo: 'ordinario_programmato',
    data_pianificata: data,
    tecnico_id: tecId || null,
    stato: 'pianificato',
    note_per_tecnico: 'Intervento periodico — ' + meseAnno
  }).select().single();

  if(r.error) { toast('Errore: '+r.error.message,'err'); return; }

  await db.from('cicli_pianificati')
    .update({ odl_id: r.data.id })
    .eq('cliente_id', cliId)
    .eq('mese_anno', meseAnno)
    .is('odl_id', null);

  toast('✅ Intervento schedulato'+(tecId?' e assegnato a tecnico':''), 'ok');
  var parts = meseAnno.split('-');
  await loadPianificazioneMensile(parseInt(parts[0]), parseInt(parts[1]));
  if(ROLE==='capo_tecnico') await loadDashCapoTecnico();
}

async function aggiornaOdlPiano(odlId, campo, valore) {
  var payload = {};
  payload[campo] = valore || null;
  if(campo === 'tecnico_id' && valore) payload.stato = 'pianificato';
  if(campo === 'tecnico_id' && !valore) payload.stato = 'da_pianificare';
  var r = await db.from('ordini_lavoro').update(payload).eq('id', odlId);
  if(r.error) { toast('Errore: '+r.error.message,'err'); return; }
  toast('✅ Aggiornato', 'ok');
}

// ── SCHEDA CLIENTE ────────────────────────────────────────────
async function openClienteDetail(id){
  // Mostra/nascondi bottone nuovo presidio
  var bp = ge('cli-det-add-presidio');
  if(bp) bp.style.display = (ROLE==='titolare'||ROLE==='capo_tecnico'||ROLE==='segreteria') ? '' : 'none';
  // Mostra/nascondi bottone carica file e link cliente
  var bf = ge('btn-carica-file');
  if(bf) bf.style.display = (ROLE==='titolare'||ROLE==='segreteria') ? '' : 'none';
  var bl = ge('cli-det-link');
  if(bl) bl.style.display = (ROLE==='titolare'||ROLE==='segreteria') ? '' : 'none';
  currentCliId=id;
  const cli=CLIS.find(c=>c.id===id);
  ge('cd-nome').textContent=cli?.ragione_sociale||'Cliente';
  ge('mpcl').value=id;
  gotoPage('cliente-detail');
  document.querySelectorAll('.nb').forEach(n=>n.classList.remove('on'));
  // Carica tab anagrafica
  const sediHtml=await loadSediDetail(id);
  ge('cd-info-content').innerHTML=`
    <div class="g2" style="margin-bottom:16px">${ir('Ragione sociale',cli?.ragione_sociale)+ir('P.IVA',cli?.piva)+ir('Cod. fiscale',cli?.codice_fiscale)+ir('Referente',cli?.referente_nome)+ir('Telefono',cli?.referente_telefono)+ir('Email',cli?.referente_email)+ir('Città',cli?.citta)+ir('Tipo attività',cli?.tipo_attivita)+ir('Stato',cli?.stato)}</div>
    ${cli?.note_commerciali?`<div style="padding:12px;background:var(--bg);border-radius:var(--rs);font-size:13px;margin-bottom:16px">${esc(cli.note_commerciali)}</div>`:''}
    <div style="font-size:13px;font-weight:600;margin-bottom:10px">Sedi</div>
    ${sediHtml}
    <div style="font-size:13px;font-weight:600;margin:16px 0 10px">Dati fatturazione</div>
    <div class="g2">${ir('Rag. soc. fattura',cli?.ragione_sociale_fattura||cli?.ragione_sociale)+ir('Indirizzo fattura',cli?.indirizzo_fattura)+ir('CAP / Città',cli?.cap_fattura?cli.cap_fattura+' '+cli.citta_fattura:cli?.citta_fattura)+ir('Codice SDI',cli?.codice_sdi)+ir('PEC',cli?.pec)+ir('Modalità pagamento',cli?.modalita_pagamento)+ir('Giorni pagamento',(cli?.giorni_pagamento||30)+'gg')+ir('IBAN',cli?.iban)}</div>
    ${cli?.note_fatturazione?`<div style="padding:12px;background:var(--bg);border-radius:var(--rs);font-size:13px;margin-top:10px">${esc(cli.note_fatturazione)}</div>`:''}
    <div style="margin-top:14px;display:flex;gap:8px"><button class="btn p sm" onclick="editCliById('${id}')">Modifica cliente</button></div>`;
  // Carica presidi
  const {data:pp}=await db.from('impianti').select('*,sedi_cliente(id,tipo,indirizzo,citta)').eq('cliente_id',id).order('tipo').order('matricola');
  ge('cd-presidi-content').innerHTML=!pp?.length?'<div class="empty">Nessun presidio censito.<br><button class="btn p sm" style="margin-top:10px" onclick="openM(\'m-presidio\')">+ Aggiungi presidio</button></div>':
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">${pp.map(p=>`<div class="pc"><div style="position:absolute;top:12px;right:12px">${si2(p.stato)}</div>
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--m);margin-bottom:4px">${tpl(p.tipo)}</div>
    <div style="font-size:14px;font-weight:600;margin-bottom:2px">${esc(p.matricola||'—')}</div>
    ${p.sedi_cliente?`<div style="font-size:11px;color:var(--b);margin-bottom:4px">📍 ${p.sedi_cliente.tipo||''} ${esc(p.sedi_cliente.indirizzo||'')}</div>`:''}
    <div style="font-size:12px;display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Ubicazione</span><span>${esc(p.ubicazione||'—')}</span></div>
      <div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Ultima verifica</span><span>${fd(p.data_ultimo_controllo)}</span></div>
      <div style="display:flex;justify-content:space-between"><span style="color:var(--m)">Prossima</span><span class="${sc(p.data_prossimo_controllo)}">${fd(p.data_prossimo_controllo)}</span></div>
    </div>
    <div style="display:flex;gap:6px;margin-top:10px">
      ${(ROLE==='titolare'||ROLE==='capo_tecnico'||ROLE==='segreteria')?`<button class="btn sm" onclick="editP('${p.id}')">✏️</button>`:''}
      ${(ROLE==='titolare'||ROLE==='capo_tecnico')?`<button class="btn sm" style="color:var(--r)" onclick="eliminaPresidio('${p.id}')">🗑️</button>`:''}
    </div>
  </div>`).join('')}</div>`;
  // Carica interventi
  const {data:ii}=await db.from('ordini_lavoro').select('*,utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)').eq('cliente_id',id).order('data_pianificata',{ascending:false}).limit(20);
  ge('cd-interventi-content').innerHTML=!ii?.length?'<div class="empty">Nessun intervento</div>':
    `<div class="tw"><table><thead><tr><th>N°</th><th>Tipo</th><th>Tecnico</th><th>Data</th><th>Stato</th></tr></thead><tbody>${ii.map(o=>`<tr><td>#${o.numero||'—'}</td><td>${tl(o.tipo)}</td><td>${esc(o.utenti?o.utenti.nome+' '+o.utenti.cognome:'—')}</td><td>${fd(o.data_pianificata)}</td><td>${bs(o.stato)}</td></tr>`).join('')}</tbody></table></div>`;
  // Carica documenti
  const {data:ss}=await db.from('schede_lavoro').select('*,utenti!schede_lavoro_tecnico_id_fkey(nome,cognome)').eq('cliente_id',id).order('creato_il',{ascending:false}).limit(20);
  ge('cd-documenti-content').innerHTML=!ss?.length?'<div class="empty">Nessun documento</div>':
    `<div class="tw"><table><thead><tr><th>N°</th><th>Tecnico</th><th>Data</th><th>Esito</th><th>Stato</th><th></th></tr></thead><tbody>${ss.map(s=>`<tr><td>#${s.numero||'—'}</td><td>${esc(s.utenti?s.utenti.nome+' '+s.utenti.cognome:'—')}</td><td>${fd(s.data_intervento)}</td><td>${s.esito?be(s.esito):'—'}</td><td>${bs(s.stato)}</td><td><button class="btn sm" onclick="openScheda('${s.id}')">Vedi</button></td></tr>`).join('')}</tbody></table></div>`;
  // Carica periodicità
  loadPeriodicitaCliente(id);
}

async function editCliById(id){
  // Cerca prima nel cache locale, poi nel DB
  let c = window._cliMap?.[id] || CLIS.find(x=>x.id===id);
  if(!c){
    const {data}=await db.from('clienti').select('*').eq('id',id).single();
    c=data;
  }
  if(!c){toast('Cliente non trovato','err');return;}
  await editCli(c);
}

// ── CLIENTI ───────────────────────────────────────────────────
async function loadCli(){
  const {data,error}=await db.from('clienti').select('*').is('eliminato_il',null).order('ragione_sociale');
  if(error){ge('ctbody').innerHTML=`<tr><td colspan="5"><div class="al2 e">Errore: ${error.message}</div></td></tr>`;return;}
  CLIS=data||[];ge('cli-count').textContent=`(${CLIS.length} totali)`;renderC(CLIS);
}
function renderC(data){
  const tb=ge('ctbody');
  if(!data.length){tb.innerHTML='<tr><td colspan="5"><div class="empty">Nessun cliente.<br><button class="btn p sm" style="margin-top:10px" onclick="openNewCli()">+ Aggiungi il primo</button></div></td></tr>';return;}
  // Salva mappa clienti per accesso rapido
  window._cliMap = Object.fromEntries(data.map(c=>[c.id,c]));
  tb.innerHTML=data.map(c=>`<tr>
    <td><strong>${esc(c.ragione_sociale)}</strong>${esc(c.piva)?'<br><span style="font-size:11px;color:var(--m)">P.IVA: '+esc(c.piva)+'</span>':''}</td>
    <td>${esc(c.referente_email)||esc(c.referente_telefono)?`<span style="font-size:12px">${esc(c.referente_email||'')}<br>${esc(c.referente_telefono||'')}</span>`:'—'}</td>
    <td>${esc(c.citta||'—')}</td>
    <td>${bc(c.stato)}</td>
    <td>
      <button class="btn sm p" onclick="openClienteDetail('${c.id}')">📋 Scheda</button>
      ${(ROLE==='titolare'||ROLE==='segreteria')?`<button class="btn sm" onclick="openEditCli('${c.id}')">✏️</button>`:''}
      ${ROLE==='titolare'?`<button class="btn sm" style="color:var(--r)" onclick="eliminaCliente('${c.id}')">🗑️</button>`:''}
      <button class="btn sm" onclick="editCliById('${c.id}')">Modifica</button>
    </td>
  </tr>`).join('');
}
function filterC(){const q=v('csearch').toLowerCase(),s=v('cfilt');renderC(CLIS.filter(c=>(!q||c.ragione_sociale.toLowerCase().includes(q)||(c.referente_email||'').toLowerCase().includes(q)||(c.piva||'').includes(q))&&(!s||c.stato===s)));}

function openEditCli(id) {
  // Carica dati e apri modal cliente in modifica
  var cli = CLIS.find(function(c) { return c.id === id; });
  if(!cli) { toast('Cliente non trovato', 'err'); return; }
  ge('mcli-title').textContent = 'Modifica cliente';
  ge('mc-edit-id').value = id;
  // Precompila campi base
  var fields = {mc1:'ragione_sociale',mc2:'referente_nome',mc2b:'referente_cognome',mc3:'referente_telefono',mc4:'referente_email',mc5:'piva',mc6:'codice_fiscale',mc9:'note_commerciali'};
  Object.keys(fields).forEach(function(elId) {
    var el = ge(elId); if(el) el.value = cli[fields[elId]]||'';
  });
  if(ge('mc7')) ge('mc7').value = esc(cli.tipo_attivita)||'ufficio';
  if(ge('mc8')) ge('mc8').value = cli.stato||'attivo';
  openM('m-cli');
}

function openNewCli(){ge('mcli-title').textContent='Nuovo cliente';ge('mc-edit-id').value='';['mc1','mc2','mc2b','mc3','mc4','mc5','mc6','mc9','mf1','mf2','mf3','mf4','mf5','mf6','mf7','mf9','mf10','mf11'].forEach(id=>{const el=ge(id);if(el)el.value='';});ge('mc7').value='ufficio';ge('mc8').value='attivo';if(ge('mf9'))ge('mf9').value='30';pendingSedi=[];existingSediIds=[];renderSediList();openM('m-cli');}
async function editCli(c){
  if(typeof c==='string'){
    try{c=JSON.parse(atob(c));}catch(e){try{c=JSON.parse(c);}catch(e2){}}
  }
  if(!c||typeof c!=='object'){toast('Errore caricamento cliente','err');return;}
  ge('mcli-title').textContent='Modifica cliente';ge('mc-edit-id').value=c.id;
  ge('mc1').value=esc(c.ragione_sociale)||'';ge('mc2').value=esc(c.piva)||'';ge('mc2b').value=esc(c.codice_fiscale)||'';
  ge('mc3').value=esc(c.citta)||'';ge('mc4').value=esc(c.referente_nome)||'';ge('mc5').value=esc(c.referente_telefono)||'';
  ge('mc6').value=esc(c.referente_email)||'';ge('mc7').value=esc(c.tipo_attivita)||'ufficio';ge('mc8').value=c.stato||'attivo';ge('mc9').value=esc(c.note_commerciali)||'';
  // Fatturazione
  if(ge('mf1'))ge('mf1').value=esc(c.ragione_sociale_fattura)||'';
  if(ge('mf2'))ge('mf2').value=esc(c.indirizzo_fattura)||'';
  if(ge('mf3'))ge('mf3').value=c.cap_fattura||'';
  if(ge('mf4'))ge('mf4').value=esc(c.citta_fattura)||'';
  if(ge('mf5'))ge('mf5').value=c.provincia_fattura||'';
  if(ge('mf6'))ge('mf6').value=esc(c.codice_sdi)||'';
  if(ge('mf7'))ge('mf7').value=esc(c.pec)||'';
  if(ge('mf8'))ge('mf8').value=c.modalita_pagamento||'';
  if(ge('mf9'))ge('mf9').value=c.giorni_pagamento||30;
  if(ge('mf10'))ge('mf10').value=esc(c.iban)||'';
  if(ge('mf11'))ge('mf11').value=esc(c.note_fatturazione)||'';
  // Carica sedi
  await loadSediForCliente(c.id);
  openM('m-cli');
}

// ── SEDI ────────────────────────────────────────────────────
let pendingSedi = [];
let existingSediIds = [];

function renderSediList(){
  const el=ge('sedi-list');
  const cnt=ge('sedi-count');
  if(cnt)cnt.textContent=pendingSedi.length||'';
  if(!pendingSedi.length){if(el)el.innerHTML='<div style="font-size:13px;color:var(--m);padding:8px">Nessuna sede aggiunta</div>';return;}
  if(el)el.innerHTML=pendingSedi.map((s,i)=>`<div class="sede-card">
    <div style="flex:1">
      <div class="sede-tipo ${s.tipo}">${s.tipo.toUpperCase()}${s.nome?' — '+esc(s.nome):''}</div>
      <div style="font-size:13px;font-weight:500">${[esc(s.via),esc(s.civico)].filter(Boolean).join(' ')}${s.via||s.civico?' — ':''}${esc(s.citta||'')}${s.cap?' '+esc(s.cap):''}</div>
      ${s.zona?`<div style="font-size:12px;color:var(--m)">${s.zona}</div>`:''}
    </div>
    <button class="btn sm" onclick="removeSede(${i})" style="color:var(--r);flex-shrink:0">✕</button>
  </div>`).join('');
}

function addSede(){
  const cit=v('ns-cit').trim();if(!cit){toast('Inserisci almeno la città','err');return;}
  pendingSedi.push({tipo:v('ns-tipo'),nome:v('ns-nome')||null,via:v('ns-via')||null,civico:v('ns-civ')||null,cap:v('ns-cap')||null,citta:cit,provincia:v('ns-prov')||null,zona:v('ns-zona')||null});
  ['ns-nome','ns-via','ns-civ','ns-cap','ns-cit','ns-prov','ns-zona'].forEach(id=>{const el=ge(id);if(el)el.value='';});
  renderSediList();toast('Sede aggiunta','ok');
}

function removeSede(i){pendingSedi.splice(i,1);renderSediList();}

async function loadSediForOdl(){
  const cid=v('mo1');const sel=ge('mo-sede');
  if(!cid){sel.innerHTML='<option value="">Sede principale / da definire</option>';return;}
  const {data}=await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').eq('cliente_id',cid).order('tipo');
  sel.innerHTML='<option value="">Sede principale (indirizzo cliente)</option>'+(data||[]).map(s=>`<option value="${s.id}">${(s.tipo||'sede').toUpperCase()}${s.nome?' — '+esc(s.nome):''}: ${esc(s.via||'')} ${esc(s.civico||'')} ${s.citta?'('+esc(s.citta)+')':''}</option>`).join('');
}

async function loadSediTec(){
  const cid=v('tc1');const sel=ge('tc1-sede');
  if(!cid){sel.innerHTML='<option value="">Sede principale / da definire</option>';return;}
  const {data}=await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').eq('cliente_id',cid).order('tipo');
  sel.innerHTML='<option value="">Sede principale (indirizzo cliente)</option>'+(data||[]).map(s=>`<option value="${s.id}">${(s.tipo||'sede').toUpperCase()}${s.nome?' — '+esc(s.nome):''}: ${esc(s.via||'')} ${esc(s.civico||'')} ${s.citta?'('+esc(s.citta)+')':''}</option>`).join('');
}

async function loadSediForCliente(cliId){
  const {data}=await db.from('sedi_cliente').select('*').eq('cliente_id',cliId).order('tipo');
  pendingSedi=(data||[]).map(s=>({...s,_existing:true}));
  existingSediIds=(data||[]).map(s=>s.id);
  renderSediList();
}

async function saveCliSedi(cliId){
  // Elimina tutte le sedi esistenti e reinserisci
  if(existingSediIds.length){
    await db.from('sedi_cliente').delete().in('id',existingSediIds);
  }
  if(pendingSedi.length){
    const payload=pendingSedi.map(s=>{const {_existing,id,...rest}=s;return {...rest,cliente_id:cliId};});
    await db.from('sedi_cliente').insert(payload);
  }
}

async function loadSediDetail(cliId){
  const {data}=await db.from('sedi_cliente').select('*').eq('cliente_id',cliId).order('tipo');
  if(!data?.length)return'<div class="empty">Nessuna sede. Modifica il cliente per aggiungerne.</div>';
  return data.map(s=>`<div class="sede-card" style="margin-bottom:8px">
    <div style="flex:1">
      <div class="sede-tipo ${s.tipo}">${s.tipo.toUpperCase()}${s.nome?' — '+esc(s.nome):''}</div>
      <div style="font-size:13px;font-weight:500">${[esc(s.via),esc(s.civico)].filter(Boolean).join(' ')}${(s.via||s.civico)?` — ${esc(s.citta||'')}`:esc(s.citta||'')}</div>
      ${s.cap||s.provincia?`<div style="font-size:12px;color:var(--m)">${esc(s.cap||'')} ${s.provincia||''}</div>`:''}
      ${s.zona?`<div style="font-size:12px;color:var(--m)">${s.zona}</div>`:''}
    </div>
  </div>`).join('');
}


// ── TECNICO: impossibilitato + relazione tecnica ──────────────
// (toggleImpossibilitato / mostraRelazioneBox / mostraInfoSede / loadAddrTec
//  definite piu' in basso — questa prima copia era dead code)

async function saveCli(){
  const rag=v('mc1').trim();if(!rag){toast('Inserisci la ragione sociale','err');return;}
  const eid=v('mc-edit-id');
  const payload={
    ragione_sociale:rag,piva:v('mc2')||null,codice_fiscale:v('mc2b')||null,
    citta:v('mc3')||null,referente_nome:v('mc4')||null,referente_telefono:v('mc5')||null,
    referente_email:v('mc6')||null,tipo_attivita:v('mc7'),stato:v('mc8'),note_commerciali:v('mc9')||null,
    ragione_sociale_fattura:v('mf1')||null,indirizzo_fattura:v('mf2')||null,
    cap_fattura:v('mf3')||null,citta_fattura:v('mf4')||null,provincia_fattura:v('mf5')||null,
    codice_sdi:v('mf6')||null,pec:v('mf7')||null,modalita_pagamento:v('mf8')||null,
    giorni_pagamento:parseInt(v('mf9'))||30,iban:v('mf10')||null,note_fatturazione:v('mf11')||null,
  };
  let cliId=eid;
  let error;
  if(eid){({error}=await db.from('clienti').update(payload).eq('id',eid));}
  else{
    const {data:nd,error:ne}=await db.from('clienti').insert(payload).select().single();
    error=ne;if(nd)cliId=nd.id;
  }
  if(error){toast('Errore: '+error.message,'err');return;}
  if(cliId)await saveCliSedi(cliId);
  closeM('m-cli');toast(eid?'Cliente aggiornato ✓':'Cliente creato ✓','ok');
  if(ROLE==='segreteria') { await loadCS(); await loadDashSegreteria(); }
  pendingSedi=[];existingSediIds=[];
  await loadCS();loadCli();loadDash();
}

// ── INTERVENTI ────────────────────────────────────────────────
async function loadOdl(){const {data}=await db.from('ordini_lavoro').select('*,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)').is('eliminato_il',null).order('data_pianificata',{ascending:false});ODLS=data||[];renderO(ODLS);}
function renderO(data){const tb=ge('otbody');if(!data.length){tb.innerHTML='<tr><td colspan="7"><div class="empty">Nessun intervento</div></td></tr>';return;}tb.innerHTML=data.map(o=>`<tr>
    <td style="color:var(--m)">#${o.numero||'—'}</td>
    <td><strong>${esc(o.clienti?.ragione_sociale||'—')}</strong></td>
    <td>${tl(o.tipo)}</td>
    <td>${o.utenti?esc(o.utenti.nome+' '+o.utenti.cognome):'<span style="color:var(--r)">Non assegnato</span>'}</td>
    <td>${fd(o.data_pianificata)||'<span style="color:var(--a)">Da pianificare</span>'}</td>
    <td>${bs(o.stato)}</td>
    <td style="display:flex;gap:6px">
      ${(ROLE==='titolare'||ROLE==='capo_tecnico'||ROLE==='segreteria')?`<button class="btn sm" onclick="openEditOdl('${o.id}')">✏️ Modifica</button>`:''}
      ${(ROLE==='titolare'||ROLE==='capo_tecnico')?`<button class="btn sm" style="color:var(--r)" onclick="eliminaOdl('${o.id}')">🗑️</button>`:''}
    </td>
  </tr>`).join('');}
function filterO(){const q=v('osearch').toLowerCase(),s=v('ofilt');renderO(ODLS.filter(o=>(!q||(o.clienti?.ragione_sociale||'').toLowerCase().includes(q))&&(!s||o.stato===s)));}

// ── DOCUMENTI ─────────────────────────────────────────────────
async function loadDocs(){
  const [sr,dr,rr]=await Promise.all([
    db.from('schede_lavoro').select('*,clienti(ragione_sociale),utenti!schede_lavoro_tecnico_id_fkey(nome,cognome)').is('eliminato_il',null).order('creato_il',{ascending:false}),
    db.from('ddt').select('*,clienti(ragione_sociale)').is('eliminato_il',null).order('creato_il',{ascending:false}),
    db.from('relazioni_tecniche').select('*,clienti(ragione_sociale),utenti!relazioni_tecniche_tecnico_id_fkey(nome,cognome)').order('creato_il',{ascending:false}),
  ]);
  const st=sr.data||[];ge('stbody').innerHTML=!st.length?'<tr><td colspan="7"><div class="empty">Nessuna scheda</div></td></tr>':st.map(s=>`<tr><td>#${s.numero||'—'}</td><td>${esc(s.clienti?.ragione_sociale||'—')}</td><td>${esc(s.utenti?s.utenti.nome+' '+s.utenti.cognome:'—')}</td><td>${fd(s.data_intervento)}</td><td>${s.esito?be(s.esito):'—'}</td><td>${bs(s.stato)}</td><td><button class="btn sm" onclick="openScheda('${s.id}')">📄 Gestisci</button>
      <button class="btn sm" onclick="stampaRapportoIntervento('${s.id}')">📋 Rapporto</button>
      <button class="btn sm" onclick="stampaRelazionePorteREI('${s.id}')" title="Solo se ci sono porte REI">🚪 Porte</button>
      ${ROLE==='titolare'?`<button class="btn sm" style="color:var(--r)" onclick="eliminaScheda('${s.id}')">🗑️</button>`:''}</td></tr>`).join('');
  const dt=dr.data||[];ge('dtbody').innerHTML=!dt.length?'<tr><td colspan="5"><div class="empty">Nessun DDT</div></td></tr>':dt.map(d=>`<tr><td>#${d.numero||'—'}</td><td>${esc(d.clienti?.ragione_sociale||'—')}</td><td>${fd(d.data_emissione)}</td><td>${esc(d.causale||'—')}</td><td style="display:flex;gap:6px"><button class="btn sm" onclick="stampaDDT('${d.id}')">🖨️ PDF</button>${ROLE==='titolare'?`<button class="btn sm" style="color:var(--r)" onclick="eliminaDDT('${d.id}')">🗑️</button>`:''}</td></tr>`).join('');
  const rt=rr.data||[];ge('rttbody').innerHTML=!rt.length?'<tr><td colspan="7"><div class="empty">Nessuna relazione</div></td></tr>':rt.map(r=>`<tr><td>#${r.numero||'—'}</td><td>${esc(r.clienti?.ragione_sociale||'—')}</td><td>${esc((r.tipo_impianto||'').replace(/_/g,' '))}</td><td>${fd(r.data_sopralluogo)}</td><td>${be(r.esito)}</td><td>${r.intervento_straordinario?'<span class="bx berr">Sì</span>':'<span class="bx bok">No</span>'}</td><td><button class="btn sm">Vedi</button></td></tr>`).join('');
}

// ── SELECTS ───────────────────────────────────────────────────
async function loadCS(){
  const {data,error}=await db.from('clienti').select('id,ragione_sociale').is('eliminato_il',null).order('ragione_sociale');
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
  if(r.error) { toast('Errore: '+r.error.message,'err'); return; }
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
    <td><span class="bx bblue">${u.ruolo}</span></td>
    <td>${u.attivo?'<span class="bx bok">Attivo</span>':'<span class="bx bgray">Inattivo</span>'}</td>
    <td style="display:flex;gap:6px">
      <button class="btn sm" onclick="toggleAttivoUtente('${u.id}',${u.attivo})">${u.attivo?'⏸️ Disattiva':'▶️ Riattiva'}</button>
      ${u.id!==ME?.id?`<button class="btn sm" style="color:var(--r)" onclick="eliminaUtente('${u.id}','${esc(u.nome)} ${esc(u.cognome)}')">🗑️</button>`:''}
    </td>
  </tr>`).join('')}</tbody></table>`;
}
async function loadImp(){
  const {data}=await db.from('impostazioni').select('*').eq('id',1).maybeSingle();if(!data)return;
  if(esc(data.ragione_sociale)){ge('nc').textContent=esc(data.ragione_sociale).split(' ')[0];document.title=esc(data.ragione_sociale)+' — Gestionale';}
  const fs=['ragione_sociale','indirizzo','cap','citta','piva','telefono','email'];const is=['si1','si2','si3','si4','si5','si6','si7'];
  fs.forEach((f,i)=>{const el=ge(is[i]);if(el&&data[f])el.value=data[f];});
}

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


// ── CALENDARIO ───────────────────────────────────────────────

var calYear = new Date().getFullYear();
var calMonth = new Date().getMonth();
var calOdls = [];

function calPrev() { calMonth--; if(calMonth<0){calMonth=11;calYear--;} loadCalendario(); }
function calNext() { calMonth++; if(calMonth>11){calMonth=0;calYear++;} loadCalendario(); }

async function loadCalendario() {
  var mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var titEl = ge('cal-title');
  if(titEl) titEl.textContent = mesi[calMonth] + ' ' + calYear;

  // Range del mese
  var dataInizio = new Date(calYear, calMonth, 1).toISOString().split('T')[0];
  var dataFine = new Date(calYear, calMonth+1, 0).toISOString().split('T')[0];

  var res = await db.from('ordini_lavoro')
    .select('id,numero,tipo,stato,data_pianificata,fascia_oraria,sede_id,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)')
    .gte('data_pianificata', dataInizio)
    .lte('data_pianificata', dataFine)
    .order('data_pianificata');
  calOdls = res.data || [];

  // Carica sedi degli OdL
  var sedeIdsCal = calOdls.map(function(o){return o.sede_id;}).filter(Boolean);
  window._calSediMap = {};
  if(sedeIdsCal.length) {
    var rsc = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').in('id', sedeIdsCal);
    (rsc.data||[]).forEach(function(s){ window._calSediMap[s.id] = s; });
  }

  // Carica anche cicli pianificati del mese (non ancora con OdL)
  var meseStr = calYear + '-' + String(calMonth+1).padStart(2,'0');
  var rCicli = await db.from('cicli_pianificati')
    .select('*, clienti(ragione_sociale)')
    .eq('mese_anno', meseStr)
    .eq('stato', 'pianificato')
    .is('odl_id', null);
  calCicli = rCicli.data || [];

  renderCalendar();
  renderCalList();
}

function renderCalendar() {
  var headsEl = ge('cal-heads');
  var bodyEl = ge('cal-body');
  if(!headsEl || !bodyEl) return;

  var giorni = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  headsEl.innerHTML = giorni.map(function(g) {
    return '<div class="cal-head">' + g + '</div>';
  }).join('');

  var oggi = new Date().toISOString().split('T')[0];
  var primoGiorno = new Date(calYear, calMonth, 1);
  var ultimoGiorno = new Date(calYear, calMonth+1, 0).getDate();

  // Giorno settimana del primo (0=dom, converti in lun=0)
  var startDow = primoGiorno.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  var cells = [];
  // Celle vuote prima
  for(var i=0; i<startDow; i++) {
    cells.push('<div class="cal-day other-month"></div>');
  }

  for(var d=1; d<=ultimoGiorno; d++) {
    var dateStr = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var isToday = dateStr === oggi;
    var dayOdls = calOdls.filter(function(o) { return o.data_pianificata === dateStr; });

    var evHtml = dayOdls.slice(0,3).map(function(o) {
      var cls = o.tipo === 'straordinario' ? 'str' : o.tipo === 'corso' ? 'cor' : o.tipo === 'ordinario_chiamata' ? 'chi' : 'ord';
      var cli = o.clienti && o.clienti.ragione_sociale ? o.clienti.ragione_sociale : '—';
      return '<div class="cal-ev ' + cls + '" onclick="event.stopPropagation();openOdlDetail(\'' + o.id + '\')" title="' + cli + '">' + cli + '</div>';
    }).join('');
    if(dayOdls.length > 3) evHtml += '<div style="font-size:10px;color:var(--m)">+' + (dayOdls.length-3) + ' altri</div>';
    // Cicli pianificati senza OdL (da schedulare)
    var dayCicli = calCicli.filter(function(c) { return c.data_prevista === dateStr; });
    if(dayCicli.length) {
      evHtml += '<div style="font-size:10px;color:var(--m);border-top:0.5px dashed var(--bo);margin-top:2px;padding-top:2px">' +
        '📋 ' + dayCicli.length + ' da pianificare</div>';
    }

    var canEdit = ROLE === 'capo_tecnico' || ROLE === 'segreteria' || ROLE === 'titolare';
    var clickAttr = canEdit ? 'onclick="calDayClick(\'' + dateStr + '\')"' : '';

    cells.push('<div class="cal-day' + (isToday?' today':'') + '" ' + clickAttr + '>' +
      '<div class="cal-day-n">' + d + '</div>' + evHtml + '</div>');
  }

  bodyEl.innerHTML = cells.join('');
}

function calDayClick(dateStr) {
  // Apre modal OdL nuovo con la data precompilata
  var editId = ge('mcli-odl-id');
  if(editId) editId.value = ''; // assicura nuovo OdL
  if(ge('modal-odl-title')) ge('modal-odl-title').textContent = 'Nuovo intervento';
  ge('mo3').value = dateStr;
  openM('m-odl');
}

function renderCalList() {
  var el = ge('cal-list');
  if(!el) return;
  if(!calOdls.length) {
    el.innerHTML = '<div class="empty">Nessun intervento pianificato questo mese.</div>';
    return;
  }
  var tipiLabel = {ordinario_programmato:'Manutenzione',ordinario_chiamata:'Su chiamata',straordinario:'Straordinario',corso:'Corso'};
  var canEdit = ROLE === 'capo_tecnico' || ROLE === 'titolare';
  var canDel = ROLE === 'titolare';
  el.innerHTML = calOdls.map(function(o) {
    var cli = o.clienti && o.clienti.ragione_sociale ? esc(o.clienti.ragione_sociale) : '—';
    var tec = o.utenti ? esc(o.utenti.nome + ' ' + o.utenti.cognome) : '<span style="color:var(--r)">Non assegnato</span>';
    var statoLabel = bs(o.stato);
    var sedeObj = o.sede_id && window._calSediMap ? window._calSediMap[o.sede_id] : null;
    var sedeStr = sedeObj ? '📍 ' + esc((sedeObj.tipo||'').toUpperCase()) + (sedeObj.nome?' — '+esc(sedeObj.nome):'') + ': ' + esc(sedeObj.via||'') + ' ' + esc(sedeObj.civico||'') + (sedeObj.citta?' ('+esc(sedeObj.citta)+')':'') : '📍 Sede principale';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:0.5px solid var(--bo);gap:10px">' +
      '<div style="flex:1">' +
        '<div style="font-size:13px;font-weight:600">' + cli + '</div>' +
        '<div style="font-size:12px;color:var(--m);margin-top:2px">' + fd(o.data_pianificata) + (o.fascia_oraria?' · '+o.fascia_oraria:'') + ' · ' + (tipiLabel[o.tipo]||o.tipo) + '</div>' +
        '<div style="font-size:12px;color:var(--m)">' + sedeStr + '</div>' +
        '<div style="font-size:12px;color:var(--m)">👤 ' + tec + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0">' +
        statoLabel +
        (canEdit ? '<button class="btn sm" data-id="'+o.id+'" onclick="apriEditOdlCal(this.dataset.id)">✏️ Modifica</button>' : '') +
        (canDel ? '<button class="btn sm" style="color:var(--r)" data-id="'+o.id+'" onclick="eliminaOdlCal(this.dataset.id)">🗑️</button>' : '') +
      '</div></div>';
  }).join('');
}

function openOdlDetail(id) {
  apriEditOdlCal(id);
}

async function apriEditOdlCal(id) {
  var odl = calOdls.find(function(o) { return o.id === id; });
  if(!odl) {
    // Se non in cache, carica da DB
    var r = await db.from('ordini_lavoro').select('*,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)').eq('id',id).single();
    if(r.error) { toast('Errore caricamento','err'); return; }
    odl = r.data;
  }

  await loadCS(); await loadUS();

  var m = ge('m-cal-edit');
  if(!m) {
    m = document.createElement('div');
    m.id = 'm-cal-edit';
    m.className = 'mbg';
    document.body.appendChild(m);
    m.addEventListener('click', function(e){ if(e.target===this) this.classList.remove('on'); });
  }

  var canEdit = ROLE === 'capo_tecnico' || ROLE === 'titolare';
  var tecOpts = '<option value="">— Nessuno —</option>' +
    UTENTI.filter(function(u){return ['tecnico','capo_tecnico'].includes(u.ruolo);})
    .map(function(u){return '<option value="'+u.id+'"'+(odl.tecnico_id===u.id?' selected':'')+'>'+esc(u.nome)+' '+esc(u.cognome)+'</option>';}).join('');

  // Carica sedi del cliente per il select
  var sediOpts = '<option value="">Sede principale</option>';
  if(odl.cliente_id || odl.clienti) {
    var cliId2 = odl.cliente_id;
    if(!cliId2 && odl.clienti) {
      // cerca id dal nome
      var found = CLIS.find(function(c){return c.ragione_sociale === odl.clienti.ragione_sociale;});
      if(found) cliId2 = found.id;
    }
    if(cliId2) {
      var rSedi2 = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').eq('cliente_id', cliId2).order('tipo');
      sediOpts += (rSedi2.data||[]).map(function(s){
        var lbl = (s.tipo||'').toUpperCase()+(s.nome?' — '+s.nome:'')+': '+(s.via||'')+' '+(s.civico||'')+(s.citta?' ('+s.citta+')':'');
        return '<option value="'+s.id+'"'+(odl.sede_id===s.id?' selected':'')+'>'+lbl+'</option>';
      }).join('');
    }
  }

  m.innerHTML = '<div class="modal" style="max-width:500px">' +
    '<div class="mh">✏️ Modifica intervento <button class="mx" data-mid="m-cal-edit" onclick="closeM(this.dataset.mid)">✕</button></div>' +
    '<div style="padding:16px">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:14px">'+(odl.clienti?.ragione_sociale||'—')+'</div>' +
      '<div class="fr">' +
        '<div class="f"><label>Data</label><input type="date" id="ce-data" value="'+(odl.data_pianificata||'')+'" '+(canEdit?'':'readonly')+'></div>' +
        '<div class="f"><label>Fascia oraria</label><input type="text" id="ce-fascia" value="'+(odl.fascia_oraria||'')+'" placeholder="Es: mattina" '+(canEdit?'':'readonly')+'></div>' +
      '</div>' +
      '<div class="f"><label>📍 Sede intervento</label><select id="ce-sede" '+(canEdit?'':'disabled')+'>'+sediOpts+'</select></div>' +
      '<div class="f"><label>Tecnico assegnato</label><select id="ce-tec" '+(canEdit?'':'disabled')+'>'+tecOpts+'</select></div>' +
      '<div class="f"><label>Note</label><textarea id="ce-note" style="min-height:60px" '+(canEdit?'':'readonly')+'>'+(esc(odl.note_per_tecnico)||'')+'</textarea></div>' +
      (canEdit ?
        '<div style="display:flex;gap:8px;margin-top:14px">' +
          '<button class="btn" data-mid="m-cal-edit" onclick="closeM(this.dataset.mid)">Annulla</button>' +
          '<button class="btn p" data-id="'+id+'" onclick="salvaEditOdlCal(this.dataset.id)">💾 Salva</button>' +
        '</div>'
        :
        '<div style="margin-top:14px"><button class="btn" data-mid="m-cal-edit" onclick="closeM(this.dataset.mid)">Chiudi</button></div>'
      ) +
    '</div></div>';

  openM('m-cal-edit');
}

async function salvaEditOdlCal(id) {
  var data = ge('ce-data').value;
  var fascia = ge('ce-fascia').value;
  var tecId = ge('ce-tec').value;
  var note = ge('ce-note').value;
  if(!data) { toast('Inserisci la data','err'); return; }

  var sedeId = ge('ce-sede') ? ge('ce-sede').value || null : null;
  var payload = {
    data_pianificata: data,
    fascia_oraria: fascia || null,
    tecnico_id: tecId || null,
    sede_id: sedeId,
    note_per_tecnico: note || null,
    stato: 'pianificato'
  };

  var r = await db.from('ordini_lavoro').update(payload).eq('id', id);
  if(r.error) { toast('Errore: '+r.error.message,'err'); return; }
  toast('✅ Intervento aggiornato','ok');
  closeM('m-cal-edit');
  if(ge('pg-calendario-tec') && ge('pg-calendario-tec').classList.contains('on')) {
    loadCalendarioTecnico();
  } else {
    loadCalendario();
  }
}

async function eliminaOdlCal(id) {
  if(ROLE !== 'titolare') { toast('Solo il titolare può eliminare','err'); return; }
  if(!confirm('Eliminare questo intervento dal calendario? (Soft-delete: recuperabile)')) return;
  await softDel('schede_lavoro').eq('odl_id', id);
  var r = await softDel('ordini_lavoro').eq('id', id);
  if(r.error) { toast('Errore: '+r.error.message,'err'); return; }
  toast('Intervento eliminato','ok');
  loadCalendario();
}

// ── TECNICO: carica OdL assegnati ────────────────────────────
async function loadOdlTecnico() {
  var sel = ge('tc-odl');
  if(!sel) return;
  nascondiCampoTecnico();
  var res = await db.from('ordini_lavoro')
    .select('id,numero,tipo,data_pianificata,fascia_oraria,note_per_tecnico,clienti(ragione_sociale,referente_telefono)')
    .eq('tecnico_id', ME.id)
    .in('stato', ['da_pianificare','pianificato'])
    .order('data_pianificata');
  var odls = res.data || [];
  sel.innerHTML = '<option value="">— Seleziona OdL o compila manualmente —</option>' +
    odls.map(function(o) {
      var cli = o.clienti && o.clienti.ragione_sociale ? o.clienti.ragione_sociale : '—';
      var tel = o.clienti && o.clienti.referente_telefono ? ' 📞' + o.clienti.referente_telefono : '';
      var fascia = o.fascia_oraria ? ' (' + o.fascia_oraria + ')' : '';
      var tipo = {ordinario_programmato:'Manutenzione',ordinario_chiamata:'Su chiamata',straordinario:'Straordinario',corso:'Corso'}[o.tipo] || o.tipo || '';
      return '<option value="' + o.id + '">' + fd(o.data_pianificata) + fascia + ' — ' + cli + ' — ' + tipo + '</option>';
    }).join('');
}

async function preloadFromOdl() {
  var odlId = v('tc-odl');
  if(!odlId) return;
  var res = await db.from('ordini_lavoro')
    .select('cliente_id,tipo,data_pianificata,tecnico_id,note_per_tecnico,sede_id,materiali_da_portare,note_capo_tecnico,clienti(ragione_sociale,referente_telefono)')
    .eq('id', odlId).single();
  var o = res.data;
  if(!o) return;
  var cliSel = ge('tc1'); if(cliSel) cliSel.value = o.cliente_id || '';
  var tipoSel = ge('tc2'); if(tipoSel) tipoSel.value = o.tipo || 'ordinario_programmato';
  var dataSel = ge('tc3'); if(dataSel) dataSel.value = o.data_pianificata || '';
  var tecSel = ge('tc5'); if(tecSel) tecSel.value = o.tecnico_id || '';
  var noteSel = ge('tc6'); if(noteSel && o.note_per_tecnico) noteSel.value = o.note_per_tecnico;
  await loadSediTec();
  if(o.sede_id) { var sedeSel = ge('tc1-sede'); if(sedeSel) sedeSel.value = o.sede_id; }
  // Mostra le card briefing (materiali / presidi auto / note operative / cliente)
  var infoDiv = ge('tec-odl-info');
  if(infoDiv && o.clienti) {
    infoDiv.innerHTML = renderInfoIntervento(o);
    infoDiv.style.display = 'block';
    await calcolaPresidiSede(o.cliente_id, o.sede_id, 'tec-presidi-box');
  }
  toast('✅ Dati caricati. Procedi con la compilazione.', 'ok');
}

// Render delle card briefing al tecnico quando apre un intervento dalla dashboard
function renderInfoIntervento(o){
  var c = o.clienti || {};
  var tel = c.referente_telefono ? '<a href="tel:'+esc(c.referente_telefono)+'" style="color:var(--g);text-decoration:none">📞 '+esc(c.referente_telefono)+'</a>' : '';
  var html = '';
  // Card cliente
  html += '<div style="background:var(--bl);border-radius:10px;padding:12px;font-size:13px;margin-bottom:10px">';
  html += '<div style="font-weight:600;font-size:14px;margin-bottom:4px">'+esc(c.ragione_sociale||'—')+'</div>';
  if(tel) html += '<div>'+tel+'</div>';
  html += '</div>';
  // Card materiali da portare
  if(o.materiali_da_portare){
    html += '<div style="background:var(--gl);border-left:3px solid var(--gm);border-radius:10px;padding:12px;font-size:13px;margin-bottom:10px">';
    html += '<div style="font-size:11px;font-weight:700;color:var(--g);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">📦 Materiali da portare</div>';
    html += '<div style="white-space:pre-wrap">'+esc(o.materiali_da_portare)+'</div>';
    html += '</div>';
  }
  // Card presidi della sede (placeholder, riempita da calcolaPresidiSede)
  html += '<div style="background:var(--w);border:0.5px solid var(--bo);border-radius:10px;padding:12px;margin-bottom:10px">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--m);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">🧯 Presidi della sede</div>';
  html += '<div id="tec-presidi-box"><div style="color:var(--m);font-size:12px">⏳ Calcolo...</div></div>';
  html += '</div>';
  // Card note operative
  if(o.note_capo_tecnico){
    html += '<div style="background:var(--al);border-left:3px solid var(--a);border-radius:10px;padding:12px;font-size:13px;margin-bottom:10px">';
    html += '<div style="font-size:11px;font-weight:700;color:var(--a);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">📝 Note operative</div>';
    html += '<div style="white-space:pre-wrap">'+esc(o.note_capo_tecnico)+'</div>';
    html += '</div>';
  }
  // Note generiche legacy (mostrate solo se valorizzate)
  if(o.note_per_tecnico){
    html += '<div style="background:var(--bg);border-radius:10px;padding:10px;font-size:12px;color:var(--m);margin-bottom:10px">';
    html += '<strong>Note:</strong> '+esc(o.note_per_tecnico);
    html += '</div>';
  }
  return html;
}

// Calcola e mostra l'elenco presidi della sede (caso A: cliente ricorrente).
// Se non ci sono presidi, suggerisce di scrivere a mano i materiali (caso B).
async function calcolaPresidiSede(cliId, sedeId, containerId){
  var el = ge(containerId);
  if(!el) return;
  if(!cliId){ el.innerHTML = '<div style="color:var(--m);font-size:12px;padding:4px">Seleziona prima un cliente.</div>'; return; }
  el.innerHTML = '<div style="color:var(--m);font-size:12px;padding:4px">⏳ Calcolo presidi...</div>';

  var q = db.from('impianti').select('id,tipo,modello,marca,matricola,ubicazione,data_prossimo_controllo,data_scadenza_collaudo,stato').eq('cliente_id', cliId);
  if(sedeId) q = q.eq('sede_id', sedeId);
  var r = await q;
  if(r.error){ el.innerHTML = '<div style="color:var(--r);font-size:12px">Errore: '+esc(r.error.message)+'</div>'; return; }
  var presidi = r.data || [];

  if(!presidi.length){
    el.innerHTML = '<div style="color:var(--m);font-size:13px;padding:8px;line-height:1.4">📭 Nessun presidio censito per questa sede.<br><span style="font-size:12px">Cliente nuovo o lavoro extra: usa il campo <strong>"Materiali da portare"</strong> sopra per scrivere cosa serve.</span></div>';
    return;
  }

  var oggi = new Date().toISOString().split('T')[0];
  var in30 = new Date(Date.now()+30*86400000).toISOString().split('T')[0];

  var scaduti = presidi.filter(function(p){ return p.data_prossimo_controllo && p.data_prossimo_controllo < oggi; });
  var inScadenza = presidi.filter(function(p){ return p.data_prossimo_controllo && p.data_prossimo_controllo >= oggi && p.data_prossimo_controllo <= in30; });
  var collaudoScaduto = presidi.filter(function(p){ return p.data_scadenza_collaudo && p.data_scadenza_collaudo < oggi; });
  var anomalie = presidi.filter(function(p){ return p.stato === 'anomalia'; });

  // Conteggio per tipo
  var perTipo = {};
  presidi.forEach(function(p){ perTipo[p.tipo] = (perTipo[p.tipo]||0) + 1; });
  var conteggi = Object.keys(perTipo).sort().map(function(t){
    return '<span style="background:var(--w);padding:3px 10px;border-radius:20px;font-size:12px;margin-right:6px;margin-bottom:4px;display:inline-block;border:0.5px solid var(--bo)">'+tpl(t)+' × '+perTipo[t]+'</span>';
  }).join('');

  function lista(arr, max){
    var n = max || 4;
    return arr.slice(0,n).map(function(p){
      var ext = p.matricola ? ' #'+esc(p.matricola) : '';
      var loc = p.ubicazione ? ' — '+esc(p.ubicazione) : '';
      return tpl(p.tipo)+ext+loc;
    }).join('<br>') + (arr.length>n ? '<br>... e altri '+(arr.length-n) : '');
  }

  var html = '';
  html += '<div style="margin-bottom:10px"><strong style="font-size:13px">📊 '+presidi.length+' presidi censiti</strong></div>';
  html += '<div style="margin-bottom:12px">'+conteggi+'</div>';
  if(scaduti.length){
    html += '<div style="background:var(--rl);color:var(--r);padding:8px 10px;border-radius:6px;margin-bottom:6px;font-size:12px">';
    html += '<strong>❌ Scaduti: '+scaduti.length+'</strong>';
    html += '<div style="margin-top:4px;line-height:1.5">'+lista(scaduti)+'</div></div>';
  }
  if(inScadenza.length){
    html += '<div style="background:var(--al);color:var(--a);padding:8px 10px;border-radius:6px;margin-bottom:6px;font-size:12px">';
    html += '<strong>⚠️ In scadenza nei 30gg: '+inScadenza.length+'</strong>';
    html += '<div style="margin-top:4px;line-height:1.5">'+lista(inScadenza)+'</div></div>';
  }
  if(collaudoScaduto.length){
    html += '<div style="background:var(--rl);color:var(--r);padding:8px 10px;border-radius:6px;margin-bottom:6px;font-size:12px">';
    html += '<strong>🔧 Collaudo scaduto (da sostituire): '+collaudoScaduto.length+'</strong>';
    html += '<div style="margin-top:4px;line-height:1.5">'+lista(collaudoScaduto)+'</div></div>';
  }
  if(anomalie.length){
    html += '<div style="background:var(--al);color:var(--a);padding:8px 10px;border-radius:6px;margin-bottom:6px;font-size:12px">';
    html += '<strong>🔧 Con anomalie segnalate: '+anomalie.length+'</strong>';
    html += '<div style="margin-top:4px;line-height:1.5">'+lista(anomalie)+'</div></div>';
  }
  if(!scaduti.length && !inScadenza.length && !collaudoScaduto.length && !anomalie.length){
    html += '<div style="background:var(--gl);color:var(--g);padding:8px 10px;border-radius:6px;font-size:12px;font-weight:500">✅ Tutti i presidi in regola, nessuna anomalia.</div>';
  }
  el.innerHTML = html;
}

// Nasconde campo tecnico per il ruolo tecnico (esegue lui stesso)
function nascondiCampoTecnico() {
  var f = ge('tc5-field');
  if(f) f.style.display = ROLE === 'tecnico' ? 'none' : '';
  // Imposta automaticamente ME come tecnico
  var sel = ge('tc5');
  if(sel && ROLE === 'tecnico') sel.value = ME.id;
}

// ── RAPPRESENTANTE ───────────────────────────────────────────
var _allProspect = [];

async function loadDashRappresentante() {
  var ora = new Date().getHours();
  var saluto = ora < 12 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
  var el;
  el = ge('rapp-welcome'); if(el) el.textContent = saluto + (ME?.nome ? ', ' + esc(ME.nome) : '');
  el = ge('ddate-r'); if(el) el.textContent = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});

  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var oggiStr = oggi.toISOString().split('T')[0];
  var primoDelMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1).toISOString();
  var in30Str = new Date(Date.now()+30*86400000).toISOString().split('T')[0];

  // Step 1: tutti i sopralluoghi del rappresentante (servono per KPI, lista, distinct clienti)
  var rSopr = await db.from('sopralluoghi')
    .select('id,cliente_id,ragione_sociale,urgenza,creato_il,odl_creato_id,indirizzo')
    .eq('rappresentante_id', ME.id)
    .order('creato_il',{ascending:false});
  var sopralluoghi = rSopr.data || [];

  var aperti = sopralluoghi.filter(function(s){ return !s.odl_creato_id; });
  var convertitiMese = sopralluoghi.filter(function(s){
    return s.odl_creato_id && s.creato_il && s.creato_il >= primoDelMese;
  });
  // Clienti distinti del rappresentante
  var cliIds = {};
  sopralluoghi.forEach(function(s){ if(s.cliente_id) cliIds[s.cliente_id] = true; });
  var cliIdsArr = Object.keys(cliIds);

  // KPI 4: presidi scaduti dei tuoi clienti
  var presidiScaduti = 0;
  if(cliIdsArr.length){
    var rPS = await db.from('impianti')
      .select('id',{count:'exact',head:true})
      .is('eliminato_il',null)
      .in('cliente_id', cliIdsArr)
      .lt('data_prossimo_controllo', oggiStr);
    presidiScaduti = rPS.error ? '—' : (rPS.count || 0);
  }

  // Render KPI
  el = ge('rap-k-sopr-aperti'); if(el) el.textContent = aperti.length;
  el = ge('rap-k-sopr-conv'); if(el) el.textContent = convertitiMese.length;
  el = ge('rap-k-tuoi-cli'); if(el) el.textContent = cliIdsArr.length;
  el = ge('rap-k-presidi-scad'); if(el) el.textContent = presidiScaduti;

  // Lista sopralluoghi da seguire (aperti, top 5)
  var elL = ge('rap-sopr-lista');
  if(elL){
    if(!aperti.length){
      elL.innerHTML = '<div class="rap-list-card"><div class="tit-empty">🎉 Nessun sopralluogo aperto. <button class="btn p sm" style="margin-left:8px" onclick="gotoPage(\'sopralluogo\')">+ Nuovo</button></div></div>';
    } else {
      elL.innerHTML = aperti.slice(0,5).map(function(s){
        var urg = s.urgenza || 'normale';
        return '<div class="rap-sopr-card">' +
          '<div class="body">' +
            '<div class="cli">' + esc(s.ragione_sociale || '—') + '</div>' +
            '<div class="meta">' + fd(s.creato_il) + (esc(s.indirizzo) ? ' · ' + esc(s.indirizzo) : '') + '</div>' +
          '</div>' +
          '<span class="urg ' + urg + '">' + urg.replace('_',' ') + '</span>' +
          '<button class="btn sm p" data-sid="'+s.id+'" onclick="accettaSopralluogo(this.dataset.sid)">✅ Accetta</button>' +
        '</div>';
      }).join('') + (aperti.length > 5 ? '<div style="text-align:center;padding:8px"><button class="btn sm" onclick="gotoPage(\'trattative\')">Vedi tutti ('+aperti.length+')</button></div>' : '');
    }
  }

  // B3 — I miei interventi inviati (top 10), con stato attuale visibile
  var rMieiOdl = await db.from('ordini_lavoro')
    .select('id,numero,tipo,stato,data_pianificata,fascia_oraria,creato_il,in_ritardo_il,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)')
    .is('eliminato_il', null)
    .eq('creato_da', ME.id)
    .order('creato_il',{ascending:false})
    .limit(10);
  var elM = ge('rap-miei-odl-lista');
  if(elM){
    if(rMieiOdl.error){
      elM.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Errore: '+esc(rMieiOdl.error.message)+'</div></div>';
    } else {
      var mieiOdl = rMieiOdl.data || [];
      if(!mieiOdl.length){
        elM.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Nessun intervento ancora inviato.<br><span style="font-size:12px">Quando crei un intervento ("+ Intervento da pianificare" o accettando un sopralluogo) lo trovi qui con il suo stato attuale.</span></div></div>';
      } else {
        elM.innerHTML = '<div class="rap-list-card">' + mieiOdl.map(function(o){
          var cli = o.clienti?.ragione_sociale || '—';
          var tec = o.utenti ? (o.utenti.nome + ' ' + o.utenti.cognome) : null;
          var ritardo = o.in_ritardo_il ? '<span class="bx berr" style="margin-left:6px">⏰ In ritardo</span>' : '';
          var when = o.data_pianificata ? fd(o.data_pianificata) : '—';
          var fascia = o.fascia_oraria ? ' · '+o.fascia_oraria : '';
          return '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px;gap:10px">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-weight:600">'+esc(cli)+(o.numero?' <span style="color:var(--m);font-weight:400">· #'+esc(o.numero)+'</span>':'')+'</div>' +
              '<div style="font-size:12px;color:var(--m);margin-top:2px">Inviato il '+fd(o.creato_il)+(tec?' · 👤 '+esc(tec):' · 👤 da assegnare')+'</div>' +
              (when!=='—'?'<div style="font-size:12px;color:var(--m)">📅 '+when+fascia+'</div>':'') +
            '</div>' +
            '<div style="text-align:right;flex-shrink:0">'+bs(o.stato)+ritardo+'</div>' +
          '</div>';
        }).join('') + '</div>';
      }
    }
  }

  // Heatmap calendario: prossime 5 settimane (35 giorni) dal lunedì corrente
  var startMon = new Date(oggi);
  var dow = startMon.getDay();
  startMon.setDate(startMon.getDate() + ((dow === 0) ? -6 : 1 - dow));
  var endHM = new Date(startMon); endHM.setDate(endHM.getDate() + 35);
  var rOdl = await db.from('ordini_lavoro')
    .select('data_pianificata,stato')
    .is('eliminato_il', null)
    .gte('data_pianificata', startMon.toISOString().split('T')[0])
    .lt('data_pianificata', endHM.toISOString().split('T')[0])
    .neq('stato','annullato');
  var perDay = {};
  (rOdl.data || []).forEach(function(o){
    if(!o.data_pianificata) return;
    perDay[o.data_pianificata] = (perDay[o.data_pianificata] || 0) + 1;
  });
  var elH = ge('rap-heatmap-grid');
  if(elH){
    var cells = [];
    for(var i=0; i<35; i++){
      var d = new Date(startMon); d.setDate(d.getDate()+i);
      var ds = d.toISOString().split('T')[0];
      var n = perDay[ds] || 0;
      var lvl = n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : 3;
      var past = d < oggi ? ' past' : '';
      var today = (d.getTime() === oggi.getTime()) ? ' today' : '';
      var tip = d.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'}) + ': ' + n + ' interventi';
      cells.push('<div class="rap-heatmap-day l'+lvl+past+today+'" title="'+esc(tip)+'"><span class="n">'+d.getDate()+'</span></div>');
    }
    elH.innerHTML = cells.join('');
  }

  // Presidi in scadenza dei tuoi clienti (lista, 30gg)
  var elS = ge('rap-scadenze-lista');
  if(elS){
    if(!cliIdsArr.length){
      elS.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Nessun cliente associato ai tuoi sopralluoghi.</div></div>';
    } else {
      var rSc = await db.from('impianti')
        .select('tipo,matricola,ubicazione,data_prossimo_controllo,clienti(ragione_sociale)')
        .is('eliminato_il', null)
        .in('cliente_id', cliIdsArr)
        .lte('data_prossimo_controllo', in30Str)
        .order('data_prossimo_controllo')
        .limit(8);
      var pres = rSc.data || [];
      if(!pres.length){
        elS.innerHTML = '<div class="rap-list-card"><div class="tit-empty">✅ Nessun presidio in scadenza nei prossimi 30 giorni</div></div>';
      } else {
        elS.innerHTML = '<div class="rap-list-card">' + pres.map(function(p){
          var cli = p.clienti?.ragione_sociale || '—';
          var scaduto = p.data_prossimo_controllo && p.data_prossimo_controllo < oggiStr;
          return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px">' +
            '<div><div style="font-weight:600">'+esc(cli)+'</div>' +
            '<div style="color:var(--m);font-size:12px">'+tpl(p.tipo)+(p.matricola?' #'+esc(p.matricola):'')+(p.ubicazione?' — '+esc(p.ubicazione):'')+'</div></div>' +
            '<div style="text-align:right"><div class="'+(scaduto?'se':sc(p.data_prossimo_controllo))+'">'+fd(p.data_prossimo_controllo)+'</div>' +
            '<div style="font-size:11px;color:var(--m)">'+dd2(p.data_prossimo_controllo)+'</div></div>' +
          '</div>';
        }).join('') + '</div>';
      }
    }
  }
}

async function loadTrattative() {
  var res = await db.from('clienti').select('*').eq('stato','prospect').order('creato_il',{ascending:false});
  _allProspect = res.data || [];
  renderProspectListT(_allProspect);
}

function renderProspectListT(data) {
  var el = ge('tr-prospect-list'); if(!el) return;
  if(!data.length) { el.innerHTML = '<div class="empty">Nessun prospect.</div>'; return; }
  el.innerHTML = data.map(function(c) {
    var tel = esc(c.referente_telefono) ? '<a href="tel:' + esc(c.referente_telefono) + '" class="btn sm">Chiama</a>' : '';
    return '<div class="card" style="margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
      '<div><div style="font-size:14px;font-weight:600">' + esc(c.ragione_sociale) + '</div>' +
      '<div style="font-size:12px;color:var(--m)">' + (esc(c.citta)||'') + (esc(c.referente_nome)?' · '+esc(c.referente_nome):'') + (esc(c.referente_telefono)?' · '+esc(c.referente_telefono):'') + '</div></div>' +
      '<span class="bx bblue">Prospect</span></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
      '<button class="btn sm" onclick="openClienteDetail(\'' + c.id + '\')">Scheda</button> ' + tel + '</div></div>';
  }).join('');
}

function filterTrattative() {
  var q = v('tr-search').toLowerCase();
  renderProspectListT(_allProspect.filter(function(c) {
    return esc(c.ragione_sociale).toLowerCase().includes(q) || (esc(c.referente_nome)||'').toLowerCase().includes(q) || (esc(c.citta)||'').toLowerCase().includes(q);
  }));
}

async function loadSopralluoghiList() {
  var el = ge('tr-sop-list'); if(!el) return;
  // Rappresentante vede solo i suoi; altri ruoli vedono tutti
  var q = db.from('sopralluoghi').select('*').order('creato_il',{ascending:false}).limit(30);
  if(ROLE === 'rappresentante') q = q.eq('rappresentante_id', ME.id);
  var res = await q;
  var data = res.data || [];
  if(!data.length) { el.innerHTML = '<div class="empty">Nessun sopralluogo.<br><button class="btn p sm" style="margin-top:10px" onclick="gotoPage(\'sopralluogo\')">Nuova scheda</button></div>'; return; }
  el.innerHTML = data.map(function(s) {
    var cls = s.urgenza === 'urgente' ? 'berr' : s.urgenza === 'entro_30gg' ? 'bwarn' : 'bgray';
    var azione;
    if(s.odl_creato_id){
      azione = '<span style="font-size:12px;color:var(--g);font-weight:600">✅ Intervento creato</span>';
    } else {
      azione = '<button class="btn sm p" data-sid="'+s.id+'" onclick="accettaSopralluogo(this.dataset.sid)">✅ Accetta → crea OdL</button>';
    }
    return '<div class="card" style="margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
      '<div style="flex:1"><div style="font-size:14px;font-weight:600">' + (esc(s.ragione_sociale)||'—') + '</div>' +
      '<div style="font-size:12px;color:var(--m)">' + fd(s.creato_il) + ' · ' + (esc(s.indirizzo)||'') + '</div></div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">' +
      '<span class="bx ' + cls + '">' + (s.urgenza||'normale') + '</span>' + azione +
      '</div></div></div>';
  }).join('');
}

async function salvaSchopralluogo() {
  var rag = v('sl-rag').trim();
  var richiesta = v('sl-richiesta').trim();
  var errEl = ge('sl-err');
  if(!rag) { errEl.innerHTML = '<div class="al2 e">Inserisci la ragione sociale.</div>'; return; }
  if(!richiesta) { errEl.innerHTML = '<div class="al2 e">Descrivi la richiesta del cliente (sezione D).</div>'; return; }
  var btn = ge('sl-btn'); btn.disabled = true; btn.textContent = 'Invio...'; errEl.innerHTML = '';
  try {
    var clienteId = null;
    var exRes = await db.from('clienti').select('id').ilike('ragione_sociale', rag).maybeSingle();
    if(exRes.data) { clienteId = exRes.data.id; }
    else {
      var ncRes = await db.from('clienti').insert({ragione_sociale:rag,tipo_attivita:v('sl-attivita'),referente_nome:v('sl-ref')||null,referente_telefono:v('sl-tel')||null,stato:'prospect'}).select().single();
      if(ncRes.error) throw ncRes.error;
      clienteId = ncRes.data.id;
    }
    var payload = {
      cliente_id:clienteId, ragione_sociale:rag, rappresentante_id:ME.id,
      referente_sicurezza:v('sl-ref')||null, telefono_referente:v('sl-tel')||null,
      fornitore_attuale:v('sl-fornitore')||null, scadenze_esistenti:v('sl-scadenze')||null, tipo_attivita:v('sl-attivita'),
      mq:parseInt(v('sl-mq'))||null, n_piani:parseInt(v('sl-piani'))||null,
      n_piani_interrati:parseInt(v('sl-interrati'))||0, n_uscite_emergenza:parseInt(v('sl-uscite'))||null,
      planimetria:v('sl-planimetria'), note_struttura:v('sl-struttura-note')||null,
      estintori_n:parseInt(v('sl-ext-n'))||0, estintori_tipo:v('sl-ext-tipo')||null,
      idranti_n:parseInt(v('sl-idr-n'))||0, idranti_stato:v('sl-idr-stato'),
      porte_rei_n:parseInt(v('sl-rei-n'))||0, porte_rei_stato:v('sl-rei-stato'),
      luci_emergenza_n:parseInt(v('sl-luce-n'))||0,
      centrale_rivelazione:v('sl-centrale'), sprinkler:v('sl-sprinkler'), pompa_antincendio:v('sl-pompa'),
      richiesta_cliente:richiesta, anomalie_rilevate:v('sl-anomalie')||null,
      urgenza:v('sl-urgenza'), foto_scattate:v('sl-foto')==='si',
      budget_indicativo:parseFloat(v('sl-budget'))||null, decisore:v('sl-decisore')||null,
      concorrenti:v('sl-concorrenti')||null, interesse_contratto:v('sl-contratto'),
      note_commerciali:v('sl-note-comm')||null, indirizzo:v('sl-indirizzo')||null
    };
    var insRes = await db.from('sopralluoghi').insert(payload);
    if(insRes.error) throw insRes.error;
    toast('Scheda inviata al commerciale!', 'ok');
    var campi = ['sl-rag','sl-ref','sl-tel','sl-fornitore','sl-scadenze','sl-struttura-note','sl-ext-n','sl-ext-tipo','sl-idr-n','sl-rei-n','sl-luce-n','sl-richiesta','sl-anomalie','sl-budget','sl-decisore','sl-concorrenti','sl-note-comm','sl-indirizzo'];
    campi.forEach(function(id) { var el = ge(id); if(el) el.value = ''; });
    gotoPage('dashboard-rapp');
  } catch(e) {
    errEl.innerHTML = '<div class="al2 e">Errore: ' + e.message + '</div>';
  } finally {
    btn.disabled = false; btn.textContent = 'Invia al commerciale';
  }
}

// ── CATALOGO & DDT ───────────────────────────────────────────
var RUOLI_PREZZI = ['titolare','commerciale','segreteria','contabile','rappresentante'];
var _catalogo = [];
var _ddtRighe = [];
var _ddtSearchTimeout = null;

async function loadCatalogo() {
  if(_catalogo.length > 0) return _catalogo;
  var res = await db.from('prodotti_catalogo').select('*').eq('attivo', true).order('codice');
  _catalogo = res.data || [];
  return _catalogo;
}

function canSeePrezzi() {
  return RUOLI_PREZZI.indexOf(ROLE) !== -1;
}

// Aggiorna openM per DDT
var _origOpenM = openM;
openM = function(id) {
  _origOpenM(id);
  if(id === 'm-ddt') {
    initDDTModal();
  }
};

async function initDDTModal() {
  // Popola clienti
  var sel = ge('ddt-cli');
  if(sel) {
    sel.innerHTML = '<option value="">Seleziona...</option>' +
      CLIS.map(function(c) { return '<option value="' + c.id + '">' + esc(c.ragione_sociale) + '</option>'; }).join('');
    sel.onchange = function() { caricaSediDDT(this.value); };
  }
  // Popola OdL
  var odlSel = ge('ddt-odl');
  if(odlSel) {
    odlSel.innerHTML = '<option value="">Nessuno</option>' +
      ODLS.map(function(o) {
        var cli = o.clienti && o.clienti.ragione_sociale ? o.clienti.ragione_sociale : '';
        return '<option value="' + o.id + '">#' + (o.numero||'—') + ' ' + cli + '</option>';
      }).join('');
  }
  // Data di oggi
  var dEl = ge('ddt-data'); if(dEl) dEl.value = new Date().toISOString().split('T')[0];
  // Reset righe
  _ddtRighe = [];
  renderRigheDDT();
  // Precarica catalogo
  await loadCatalogo();
}

function cercaProdottoDDT() {
  clearTimeout(_ddtSearchTimeout);
  _ddtSearchTimeout = setTimeout(function() { _cercaProdottiAsync(); }, 250);
}

async function caricaSediDDT(clienteId) {
  var sel = ge('ddt-luogo');
  if(!sel) return;
  sel.innerHTML = '<option value="">Sede legale (default)</option>';
  if(!clienteId) return;
  // Carica dati cliente (sede legale)
  var rc = await db.from('clienti').select('ragione_sociale, indirizzo_fattura, citta_fattura, cap_fattura, citta, piva').eq('id', clienteId).single();
  if(rc.data) {
    var c = rc.data;
    var sedeLegale = [c.indirizzo_fattura, (c.cap_fattura||'') + ' ' + (c.citta_fattura||c.citta||'')].filter(function(x){return x && x.trim();}).join(', ');
    if(sedeLegale) {
      sel.innerHTML = '<option value="">Sede legale (default)</option>' +
        '<option value="' + sedeLegale + '">' + sedeLegale + '</option>';
    }
  }
  // Carica sedi aggiuntive
  var rs = await db.from('sedi_cliente').select('*').eq('cliente_id', clienteId).order('tipo');
  if(rs.data && rs.data.length) {
    rs.data.forEach(function(s) {
      var addr = [s.indirizzo, (s.cap||'') + ' ' + (s.citta||'')].filter(function(x){return x && x.trim();}).join(', ');
      var label = (s.tipo ? s.tipo + ' — ' : '') + addr;
      var opt = document.createElement('option');
      opt.value = addr;
      opt.textContent = label;
      sel.appendChild(opt);
    });
  }
}

async function _cercaProdottiAsync() {
  var q = (ge("ddt-search-prod").value || "").toLowerCase().trim();
  var resEl = ge("ddt-search-results");
  if (!q || q.length < 2) { resEl.style.display = "none"; return; }
  if (!_catalogo.length) {
    resEl.style.display = "block";
    resEl.innerHTML = "<div style=\"padding:10px;color:var(--m);font-size:13px\">Caricamento catalogo...</div>";
    await loadCatalogo();
  }
  if (!_catalogo.length) {
    resEl.style.display = "block";
    resEl.innerHTML = "<div style=\"padding:10px;color:var(--r);font-size:13px\">Catalogo vuoto. Sincronizza prima da TOLI-FIRE.html</div>";
    return;
  }
  var found = _catalogo.filter(function(p) {
    return p.codice.toLowerCase().includes(q) || p.articolo.toLowerCase().includes(q);
  }).slice(0, 30);
  if (!found.length) {
    resEl.style.display = "block";
    resEl.innerHTML = "<div style=\"padding:10px;color:var(--m);font-size:13px\">Nessun prodotto trovato</div>";
    return;
  }
  var html = "";
  for (var i = 0; i < found.length; i++) {
    var p = found[i];
    var prezzo = canSeePrezzi() ? " <b style=\"color:var(--g)\">\u20ac" + p.prezzo_cliente.toFixed(2) + "</b>" : "";
    var um = p.um ? " (" + p.um + ")" : "";
    html += "<div style=\"padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:0.5px solid var(--bo)\"" +
      " onmouseover=\"this.style.background=&quot;var(--bg)&quot;\"" +
      " onmouseout=\"this.style.background=&quot;&quot;\"" +
      " onclick=\"aggiungiDaCatalogo(&quot;" + p.id + "&quot;)\">" +
      "<span style=\"font-family:monospace;font-size:11px;color:var(--m)\">" + p.codice + "</span> " +
      p.articolo + um + prezzo + "</div>";
  }
  resEl.style.display = "block";
  resEl.innerHTML = html;
}

async function aggiungiDaCatalogo(prodId) {
  var prod = _catalogo.find(function(p) { return p.id === prodId; });
  if(!prod) return;
  _ddtRighe.push({
    prodotto_id: prod.id,
    codice: prod.codice,
    descrizione: prod.articolo,
    um: prod.um || '',
    quantita: 1,
    prezzo_unitario: prod.prezzo_cliente || 0,
    _prod: prod
  });
  ge('ddt-search-prod').value = '';
  ge('ddt-search-results').style.display = 'none';
  renderRigheDDT();
}

function aggiungiRigaManuale() {
  _ddtRighe.push({
    prodotto_id: null,
    codice: '',
    descrizione: '',
    um: '',
    quantita: 1,
    prezzo_unitario: 0
  });
  renderRigheDDT();
}

function rimuoviRiga(i) {
  _ddtRighe.splice(i, 1);
  renderRigheDDT();
}

function aggiornaRiga(i, campo, valore) {
  _ddtRighe[i][campo] = campo === 'quantita' || campo === 'prezzo_unitario' ? parseFloat(valore)||0 : valore;
  aggiornaRigaCalcolo(i);
}

function aggiornaRigaCalcolo(i) {
  var el = ge('riga-tot-' + i);
  if(el) {
    var r = _ddtRighe[i];
    var tot = (r.quantita||0) * (r.prezzo_unitario||0);
    el.textContent = '€ ' + tot.toFixed(2);
  }
  aggiornaTotaleDDT();
}

function aggiornaTotaleDDT() {
  var tot = _ddtRighe.reduce(function(s, r) { return s + (r.quantita||0)*(r.prezzo_unitario||0); }, 0);
  var el = ge('ddt-totale'); if(el) el.textContent = tot.toFixed(2);
}

function renderRigheDDT() {
  var el = ge('ddt-righe-list'); if(!el) return;
  if(!_ddtRighe.length) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--m);font-size:13px">Nessuna riga. Cerca un prodotto o aggiungi una riga manuale.</div>';
    aggiornaTotaleDDT();
    return;
  }
  var mostraPrezzi = canSeePrezzi();
  el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    '<thead><tr style="background:var(--bg)">' +
    '<th style="padding:6px 8px;text-align:left;font-weight:500;color:var(--m)">Codice</th>' +
    '<th style="padding:6px 8px;text-align:left;font-weight:500;color:var(--m)">Descrizione</th>' +
    '<th style="padding:6px 8px;text-align:left;font-weight:500;color:var(--m)">UM</th>' +
    '<th style="padding:6px 8px;text-align:center;font-weight:500;color:var(--m)">Qta</th>' +
    (mostraPrezzi ? '<th style="padding:6px 8px;text-align:right;font-weight:500;color:var(--m)">Prezzo €</th>' : '') +
    (mostraPrezzi ? '<th style="padding:6px 8px;text-align:right;font-weight:500;color:var(--m)">Totale</th>' : '') +
    '<th style="padding:6px 8px"></th>' +
    '</tr></thead><tbody>' +
    _ddtRighe.map(function(r, i) {
      return '<tr style="border-bottom:0.5px solid var(--bo)">' +
        '<td style="padding:4px 8px"><input type="text" value="' + (r.codice||'') + '" placeholder="Codice" style="width:80px;padding:4px 6px;border:0.5px solid var(--bo);border-radius:4px;font-size:12px" onchange="aggiornaRiga(' + i + ',\'codice\',this.value)"></td>' +
        '<td style="padding:4px 8px"><input type="text" value="' + (esc(r.descrizione)||'').replace(/"/g,'&quot;') + '" placeholder="Descrizione" style="width:100%;padding:4px 6px;border:0.5px solid var(--bo);border-radius:4px;font-size:12px" onchange="aggiornaRiga(' + i + ',\'descrizione\',this.value)"></td>' +
        '<td style="padding:4px 8px"><input type="text" value="' + (r.um||'') + '" placeholder="UM" style="width:50px;padding:4px 6px;border:0.5px solid var(--bo);border-radius:4px;font-size:12px" onchange="aggiornaRiga(' + i + ',\'um\',this.value)"></td>' +
        '<td style="padding:4px 8px;text-align:center"><input type="number" value="' + (r.quantita||1) + '" min="0" style="width:60px;padding:4px 6px;border:0.5px solid var(--bo);border-radius:4px;font-size:12px;text-align:center" oninput="aggiornaRiga(' + i + ',\'quantita\',this.value)"></td>' +
        (mostraPrezzi ? '<td style="padding:4px 8px;text-align:right"><input type="number" value="' + (r.prezzo_unitario||0).toFixed(2) + '" min="0" step="0.01" style="width:70px;padding:4px 6px;border:0.5px solid var(--bo);border-radius:4px;font-size:12px;text-align:right" oninput="aggiornaRiga(' + i + ',\'prezzo_unitario\',this.value)"></td>' : '') +
        (mostraPrezzi ? '<td style="padding:4px 8px;text-align:right;font-weight:500" id="riga-tot-' + i + '">€ ' + ((r.quantita||1)*(r.prezzo_unitario||0)).toFixed(2) + '</td>' : '') +
        '<td style="padding:4px 8px"><button class="btn sm" style="color:var(--r);padding:3px 8px" onclick="rimuoviRiga(' + i + ')">✕</button></td>' +
        '</tr>';
    }).join('') +
    '</tbody></table>';
  aggiornaTotaleDDT();
}

async function saveDdt() {
  var cid = v('ddt-cli');
  var data = v('ddt-data');
  if(!cid || !data) { toast('Cliente e data obbligatori', 'err'); return; }
  if(!_ddtRighe.length) { toast('Aggiungi almeno una riga', 'err'); return; }
  // Crea DDT
  var payload = {
    cliente_id: cid,
    data_emissione: data,
    causale: v('ddt-causale') || null,
    note: v('ddt-note') || null,
    odl_id: v('ddt-odl') || null,
    luogo_consegna: v('ddt-luogo') || null,
    tecnico_id: ME.id  // utente loggato
  };
  // Rimuovi campi null per evitare errori di constraint
  Object.keys(payload).forEach(function(k) { if(payload[k]===null) delete payload[k]; });
  var res = await db.from('ddt').insert(payload).select().single();
  if(res.error) { toast('Errore DDT: ' + res.error.message, 'err'); return; }
  var ddtId = res.data.id;
  // Salva righe
  var righePayload = _ddtRighe.map(function(r) {
    return {
      ddt_id: ddtId,
      prodotto_id: r.prodotto_id || null,
      codice: r.codice || null,
      descrizione: esc(r.descrizione) || '—',
      um: r.um || null,
      quantita: r.quantita || 1,
      prezzo_unitario: canSeePrezzi() ? (r.prezzo_unitario || 0) : 0
    };
  });
  var res2 = await db.from('ddt_righe').insert(righePayload);
  if(res2.error) { toast('Errore righe: ' + res2.error.message, 'err'); return; }
  closeM('m-ddt');
  toast('DDT creato', 'ok');
  if(ge('pg-documenti') && ge('pg-documenti').classList.contains('on')) loadDocs();
  // Offri subito la stampa
  if(confirm('DDT creato! Vuoi stampare/scaricare il PDF?')) {
    await stampaDDT(ddtId);
  }
}

async function stampaDDT(ddtId) {
  try {
    // Carica dati DDT
    var res = await db.from('ddt')
      .select('id, numero, data_emissione, causale, note, luogo_consegna, clienti(ragione_sociale, piva, codice_fiscale, indirizzo_fattura, citta_fattura, cap_fattura, citta), ordini_lavoro(numero)')
      .eq('id', ddtId).single();
    if(res.error) throw res.error;
    var ddt = res.data;

    // Carica righe
    var res2 = await db.from('ddt_righe').select('*').eq('ddt_id', ddtId).order('id');
    if(res2.error) throw res2.error;
    var righe = res2.data || [];

    var { jsPDF } = window.jspdf;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Header azienda
    doc.setFontSize(20);
    doc.setTextColor(8, 80, 65);
    doc.setFont('helvetica', 'bold');
    doc.text('TOLI FIRE', 15, 20);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('Via esempio, 1 — 00000 Città (XX)', 15, 26);
    doc.text('P.IVA: 00000000000 — info@tolifire.it', 15, 30);

    // Titolo DDT
    doc.setFontSize(16);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text('DOCUMENTO DI TRASPORTO', 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Data: ' + (ddt.data_emissione || '—'), 150, 30);
    if(ddt.ordini_lavoro) doc.text('Intervento: #' + ddt.ordini_lavoro.numero, 150, 35);

    // Dati cliente - box destinatario
    var cli = ddt.clienti || {};
    var sede = [
      esc(cli.indirizzo_fattura),
      (cli.cap_fattura ? cli.cap_fattura + ' ' : '') + (esc(cli.citta_fattura) || esc(cli.citta) || '')
    ].filter(Boolean);

    var boxH = 10 + (sede.length * 5) + (cli.piva ? 5 : 0) + (cli.codice_fiscale ? 5 : 0) + 4;
    doc.setFillColor(245, 245, 245);
    doc.rect(15, 38, 90, boxH, 'F');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('DESTINATARIO', 17, 43);
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.text(cli.ragione_sociale || '—', 17, 49);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    var yy = 54;
    sede.forEach(function(line) { doc.text(line, 17, yy); yy += 5; });
    if (cli.piva) { doc.text('P.IVA: ' + cli.piva, 17, yy); yy += 5; }
    if (cli.codice_fiscale) { doc.text('C.F.: ' + cli.codice_fiscale, 17, yy); yy += 5; }

    // Luogo di consegna (se diverso da sede)
    if (ddt.luogo_consegna) {
      doc.setFillColor(230, 245, 235);
      doc.rect(110, 38, 85, 30, 'F');
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('LUOGO DI CONSEGNA', 112, 43);
      doc.setFontSize(9);
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      var lineeConsegna = doc.splitTextToSize(ddt.luogo_consegna, 80);
      doc.text(lineeConsegna, 112, 49);
      doc.setFont('helvetica', 'normal');
    }

    var startY = Math.max(38 + boxH + 4, 72);

    // Causale
    if(esc(ddt.causale)) {
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text('Causale: ' + ddt.causale, 15, startY);
      startY += 6;
    }

    // Tabella righe
    var mostraPrezzi = canSeePrezzi();
    var columns = ['Codice', 'Descrizione', 'UM', 'Qta'];
    if(mostraPrezzi) columns.push('Prezzo €', 'Totale €');

    var rows = righe.map(function(r) {
      var row = [r.codice || '—', r.descrizione, r.um || '—', r.quantita];
      if(mostraPrezzi) {
        row.push('€ ' + (r.prezzo_unitario||0).toFixed(2));
        row.push('€ ' + (r.totale||0).toFixed(2));
      }
      return row;
    });

    doc.autoTable({
      startY: startY + 2,
      head: [columns],
      body: rows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [8, 80, 65], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: mostraPrezzi ? {
        0: { cellWidth: 25 },
        1: { cellWidth: 75 },
        2: { cellWidth: 15 },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' }
      } : {
        0: { cellWidth: 30 },
        1: { cellWidth: 110 },
        2: { cellWidth: 20 },
        3: { cellWidth: 20, halign: 'center' }
      }
    });

    // Totale
    if(mostraPrezzi) {
      var totale = righe.reduce(function(s, r) { return s + (r.totale||0); }, 0);
      var finalY = doc.lastAutoTable.finalY + 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Totale: € ' + totale.toFixed(2), 180, finalY, { align: 'right' });
    }

    // Note
    if(esc(ddt.note)) {
      var noteY = doc.lastAutoTable.finalY + (mostraPrezzi ? 12 : 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Note: ' + ddt.note, 15, noteY);
    }

    // Footer legale
    var footerY = 265;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(15, footerY, 195, footerY);
    footerY += 5;
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'bold');
    doc.text('CLAUSOLA DI CONSEGNA', 15, footerY);
    footerY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    var clausola = "Il presente documento, generato successivamente alla consegna della merce, attesta l'avvenuta consegna dei beni sopra elencati al destinatario indicato. " +
      "Eventuali contestazioni relative a vizi apparenti, ammanchi o difformita' rispetto all'ordine devono essere comunicate per iscritto entro 24 ore dalla consegna. " +
      "Decorso tale termine, la merce si intende accettata in conformita' a quanto indicato nel presente documento.";
    var lines = doc.splitTextToSize(clausola, 180);
    doc.text(lines, 15, footerY);
    footerY += lines.length * 3.5 + 4;
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text('Documento generato il ' + new Date().toLocaleDateString('it-IT') + ' — Toli Fire S.r.l.', 15, footerY);


    doc.save('DDT_' + (ddt.data_emissione||'').replace(/-/g,'') + '_' + (ddt.clienti?.ragione_sociale||'cliente').substring(0,20).replace(/\s/g,'_') + '.pdf');
    toast('PDF scaricato', 'ok');

  } catch(e) {
    console.error('PDF error:', e);
    toast('Errore PDF: ' + e.message, 'err');
  }
}

// ── CATALOGO PAGE (visibile a chi può vedere prezzi) ──────────

// ── IMPORT EXCEL CATALOGO ────────────────────────────────────

function aggiornaAnteprima() {
  var sconto = parseFloat(ge('import-sconto').value) || 0;
  if (sconto < 0) sconto = 0;
  if (sconto > 99) sconto = 99;
  var LISTINO = 100;
  var MINIMO = 3.00;
  var costo = LISTINO * (1 - sconto / 100);
  var cliente = Math.max(costo * 1.70, MINIMO);
  var nonCliente = Math.max(costo * 1.85, MINIMO);
  var grandi = Math.max(costo * 1.25, MINIMO);
  var fmt = function(n) { return '\u20ac ' + n.toFixed(2); };
  ge('ap-costo').textContent = fmt(costo);
  ge('ap-cliente').textContent = fmt(cliente);
  ge('ap-noncliente').textContent = fmt(nonCliente);
  ge('ap-grandi').textContent = fmt(grandi);
}

async function importaExcelCatalogo(input) {
  if (ROLE !== 'titolare') { toast('Solo il titolare può importare il catalogo', 'err'); return; }
  var file = input.files[0];
  if (!file) return;
  input.value = '';

  // Leggi sconto configurato nel modal (default 70%)
  var scontoEl = ge('import-sconto');
  var SCONTO = scontoEl ? (parseFloat(scontoEl.value) || 70) : 70;
  if (SCONTO < 0) SCONTO = 0;
  if (SCONTO > 99) SCONTO = 99;
  var MOLTIPLICATORE_COSTO = 1 - SCONTO / 100; // es. 70% sconto → pago 30%

  var bar = ge('catalogo-import-bar');
  var status = ge('catalogo-import-status');
  bar.style.display = 'block';
  status.textContent = '⏳ Lettura file (sconto ' + SCONTO + '%)...';

  try {
    var arrayBuffer = await file.arrayBuffer();
    var workbook = XLSX.read(arrayBuffer, { type: 'array' });

    var prodotti = [];
    var PREZZO_MINIMO = 3.00;

    workbook.SheetNames.forEach(function(sheetName) {
      var ws = workbook.Sheets[sheetName];
      var jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      // Trova riga header (CODICE)
      var headerRow = -1;
      for (var i = 0; i < Math.min(10, jsonData.length); i++) {
        if (jsonData[i] && String(jsonData[i][0]).toUpperCase().includes('CODICE')) {
          headerRow = i; break;
        }
      }
      if (headerRow === -1) return;

      var categoriaCorrente = null;
      for (var r = headerRow + 1; r < jsonData.length; r++) {
        var row = jsonData[r];
        if (!row || row.every(function(c) { return c === null || c === ''; })) continue;

        var codice   = row[0];
        var articolo = row[1];
        var um       = row[2];
        var pagCat   = row[3];
        var listino  = row[4];

        // Riga di categoria (ha codice ma non listino)
        if (codice && !listino && articolo === null) {
          categoriaCorrente = String(codice);
          continue;
        }
        if (!codice || !listino || isNaN(parseFloat(listino))) continue;

        var l = parseFloat(listino);
        // Calcolo prezzi: sconto configurabile dal titolare
        var costo = l * MOLTIPLICATORE_COSTO; // es. 70% sconto → pago 30% del listino
        var prezzoCliente         = costo * 1.70;
        var prezzoNonCliente      = costo * 1.85;
        var prezzoGrandiQuantita  = costo * 1.25;
        prodotti.push({
          codice:                 String(codice).trim().toUpperCase(),
          articolo:               String(articolo || '').trim(),
          um:                     um ? String(um).trim() : null,
          pag_cat:                pagCat ? String(pagCat).trim() : null,
          listino_base:           l,
          prezzo_cliente:         Math.max(prezzoCliente, PREZZO_MINIMO),
          prezzo_non_cliente:     Math.max(prezzoNonCliente, PREZZO_MINIMO),
          prezzo_grandi_quantita: Math.max(prezzoGrandiQuantita, PREZZO_MINIMO),
          categoria:              categoriaCorrente,
          foglio:                 sheetName,
          attivo:                 true
        });
      }
    });

    if (!prodotti.length) {
      status.textContent = '⚠️ Nessun prodotto trovato. Verifica il formato del file.';
      return;
    }

    status.textContent = '⏳ Trovati ' + prodotti.length + ' prodotti. Caricamento su Supabase...';

    // Cancella tutto e reinserisci
    await db.from('prodotti_catalogo').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    var done = 0, errors = 0;
    var batchSize = 50;
    for (var i = 0; i < prodotti.length; i += batchSize) {
      var batch = prodotti.slice(i, i + batchSize);
      var res = await db.from('prodotti_catalogo').insert(batch);
      if (res.error) {
        console.error('Batch error:', res.error);
        // Prova uno ad uno per trovare il record problematico
        for (var j = 0; j < batch.length; j++) {
          var r1 = await db.from('prodotti_catalogo').insert(batch[j]);
          if (r1.error) {
            console.error('Record fallito:', batch[j].codice, r1.error.message, r1.error.details);
          }
        }
        errors++;
        // Aggiorna status con errore visibile
        status.textContent = '❌ Errore batch: ' + res.error.message + ' | ' + (res.error.details||res.error.hint||'');
      } else {
        done += batch.length;
      }
      status.textContent = '⏳ ' + done + '/' + prodotti.length + ' importati...';
    }

    _catalogo = []; // Reset cache
    if (errors === 0) {
      status.textContent = '✅ ' + prodotti.length + ' prodotti importati con successo!';
      bar.style.background = 'var(--gl)';
      bar.style.borderColor = 'var(--gm)';
    } else {
      status.textContent = '⚠️ ' + done + ' ok, ' + errors + ' batch falliti (vedi console)';
      bar.style.background = 'var(--al)';
    }
    setTimeout(function() { bar.style.display = 'none'; }, 4000);
    loadPaginaCatalogo();

  } catch(e) {
    console.error('Import error:', e);
    status.textContent = '❌ Errore: ' + e.message;
  }
}

async function loadPaginaCatalogo() {
  var el = ge('catalogo-content'); if(!el) return;
  el.innerHTML = '<div class="load">Caricamento...</div>';
  await loadCatalogo();
  if(!_catalogo.length) {
    el.innerHTML = '<div class="empty">Nessun prodotto nel catalogo.<br><small>Importa i prodotti da TOLI-FIRE.html o aggiungi manualmente.</small></div>';
    return;
  }
  var mostraPrezzi = canSeePrezzi();
  var byCategoria = {};
  _catalogo.forEach(function(p) {
    var cat = p.categoria || 'Altro';
    if(!byCategoria[cat]) byCategoria[cat] = [];
    byCategoria[cat].push(p);
  });
  var html = Object.keys(byCategoria).sort().map(function(cat) {
    return '<div style="margin-bottom:20px">' +
      '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--m);margin-bottom:8px;padding-bottom:4px;border-bottom:0.5px solid var(--bo)">' + cat + '</div>' +
      '<div class="tw"><table><thead><tr>' +
      '<th>Codice</th><th>Descrizione</th><th>UM</th>' +
      (mostraPrezzi ? '<th style="text-align:right">Cliente €</th>' : '') +
      (mostraPrezzi ? '<th style="text-align:right">Non cl. €</th>' : '') +
      (mostraPrezzi ? '<th style="text-align:right">Grandi Q. €</th>' : '') +
      (canSeePrezzi() ? '<th></th>' : '') +
      '</tr></thead><tbody>' +
      byCategoria[cat].map(function(p) {
        var editBtn = (ROLE==='titolare') ?
          '<button class="btn sm" onclick="openEditProdotto(\'' + p.id + '\')">Modifica</button>' : '';
        return '<tr>' +
          '<td style="font-family:monospace;font-size:12px">' + p.codice + '</td>' +
          '<td>' + p.articolo + '</td>' +
          '<td style="color:var(--m)">' + (p.um||'—') + '</td>' +
          (mostraPrezzi ? '<td style="text-align:right;font-weight:500' + (p.prezzo_cliente <= 3.00 ? ';color:var(--a)' : '') + '">€ ' + p.prezzo_cliente.toFixed(2) + '</td>' : '') +
          (mostraPrezzi ? '<td style="text-align:right;color:var(--m)' + (p.prezzo_non_cliente <= 3.00 ? ';color:var(--a)' : '') + '">€ ' + p.prezzo_non_cliente.toFixed(2) + '</td>' : '') +
          (mostraPrezzi ? '<td style="text-align:right;color:var(--m)' + (p.prezzo_grandi_quantita <= 3.00 ? ';color:var(--a)' : '') + '">€ ' + p.prezzo_grandi_quantita.toFixed(2) + '</td>' : '') +
          (canSeePrezzi() ? '<td>' + editBtn + '</td>' : '') +
          '</tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }).join('');
  el.innerHTML = html;
}

function openEditProdotto(id) {
  if(ROLE!=='titolare'){toast('Solo il titolare può modificare i prezzi','err');return;}
  var p = _catalogo.find(function(x) { return x.id === id; });
  if(!p) return;
  var nuovo = prompt('Nuovo listino base per ' + p.codice + ' (' + p.articolo + '):', p.listino_base.toFixed(2));
  if(nuovo === null) return;
  var val = parseFloat(nuovo);
  if(isNaN(val) || val < 0) { toast('Valore non valido', 'err'); return; }
  // Ricalcola
  var base = val - (val * 0.70);
  var MINIMO = 3.00;
  var payload = {
    listino_base: val,
    prezzo_cliente: Math.max(base + base*0.70, MINIMO),
    prezzo_non_cliente: Math.max(base + base*0.85, MINIMO),
    prezzo_grandi_quantita: Math.max(base + base*0.25, MINIMO),
    aggiornato_il: new Date().toISOString()
  };
  db.from('prodotti_catalogo').update(payload).eq('id', id).then(function(res) {
    if(res.error) { toast('Errore: ' + res.error.message, 'err'); return; }
    toast('Prodotto aggiornato', 'ok');
    _catalogo = [];
    loadPaginaCatalogo();
  });
}

async function addProdottoCatalogo() {
  if(ROLE!=='titolare'){toast('Solo il titolare può aggiungere prodotti','err');return;}
  var codice = prompt('Codice prodotto:'); if(!codice) return;
  var articolo = prompt('Descrizione:'); if(!articolo) return;
  var listino = parseFloat(prompt('Prezzo listino base (€):')||'0');
  if(isNaN(listino) || listino < 0) { toast('Prezzo non valido', 'err'); return; }
  var um = prompt('Unità di misura (es: NR, PZ, KG):') || '';
  var categoria = prompt('Categoria (opzionale):') || '';
  var base = listino - (listino * 0.70);
  var MINIMO = 3.00;
  var payload = {
    codice: codice.trim().toUpperCase(),
    articolo: articolo.trim(),
    um: um.trim() || null,
    categoria: categoria.trim() || null,
    listino_base: listino,
    prezzo_cliente: Math.max(base + base*0.70, MINIMO),
    prezzo_non_cliente: Math.max(base + base*0.85, MINIMO),
    prezzo_grandi_quantita: Math.max(base + base*0.25, MINIMO)
  };
  var res = await db.from('prodotti_catalogo').insert(payload);
  if(res.error) { 
    toast('Errore: ' + res.error.message + ' | ' + (res.error.details||'') + ' | ' + (res.error.hint||''), 'err'); 
    console.error('Insert error full:', res.error);
    return; 
  }
  toast('Prodotto aggiunto', 'ok');
  _catalogo = [];
  loadPaginaCatalogo();
}



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
  if(ROLE !== 'titolare') { toast('Solo il titolare può eliminare i clienti', 'err'); return; }
  if(!confirm('Eliminare questo cliente? (Soft-delete: il record resta nel DB e può essere ripristinato)')) return;
  var r = await softDel('clienti').eq('id', id);
  if(r.error) { toast('Errore: ' + r.error.message, 'err'); return; }
  toast('Cliente eliminato', 'ok');
  loadCli();
}

async function eliminaPresidio(id) {
  if(ROLE !== 'titolare' && ROLE !== 'capo_tecnico') { toast('Non hai i permessi', 'err'); return; }
  if(!confirm('Eliminare questo presidio? (Soft-delete: recuperabile)')) return;
  var r = await softDel('impianti').eq('id', id);
  if(r.error) { toast('Errore: ' + r.error.message, 'err'); return; }
  toast('Presidio eliminato', 'ok');
  loadPresidi();
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



// ── CALENDARIO APPUNTAMENTI COMMERCIALI ──────────────────────


function dataLocaleApp(iso) {
  const d = new Date(iso);

  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function datetimeLocaleApp(iso) {
  if (!iso) return '';

  const d = new Date(iso);

  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + 'T' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

function formatOraApp(iso) {
  if (!iso) return '';

  return new Date(iso).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadAppuntamentiCommerciali() {
  const inizioMese = new Date(appAnno, appMese, 1);
  const inizioMeseDopo = new Date(appAnno, appMese + 1, 1);

  const { data, error } = await db
    .from('appuntamenti_commerciali')
    .select('*, clienti(ragione_sociale)')
    .gte('inizio', inizioMese.toISOString())
    .lt('inizio', inizioMeseDopo.toISOString())
    .order('inizio');

  if (error) {
    console.error(error);
    toast('Errore calendario: ' + error.message, 'err');
    return;
  }

  appDati = data || [];
  renderCalendarioAppuntamenti();
}

function renderCalendarioAppuntamenti() {
  const label = ge('app-mese-label');
  const heads = ge('app-cal-heads');
  const body = ge('app-cal-body');
  const lista = ge('app-lista');
  
  if (!label || !heads || !body || !lista) return;

  const primo = new Date(appAnno, appMese, 1);
  const ultimoGiorno = new Date(appAnno, appMese + 1, 0).getDate();

  label.textContent = primo.toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric'
  });

  heads.innerHTML = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
    .map(g => '<div class="cal-head">' + g + '</div>')
    .join('');

  const spaziIniziali = (primo.getDay() + 6) % 7;
  let html = '';

  for (let i = 0; i < spaziIniziali; i++) {
    html += '<div class="cal-day other-month"></div>';
  }

  for (let giorno = 1; giorno <= ultimoGiorno; giorno++) {
    const data = appAnno + '-' +
      String(appMese + 1).padStart(2, '0') + '-' +
      String(giorno).padStart(2, '0');

    const oggi = new Date();
    const oggiString = oggi.getFullYear() + '-' +
      String(oggi.getMonth() + 1).padStart(2, '0') + '-' +
      String(oggi.getDate()).padStart(2, '0');

    const appuntamentiDelGiorno = appDati.filter(a =>
      dataLocaleApp(a.inizio) === data
    );

    html += '<div class="cal-day' +
      (data === oggiString ? ' today' : '') +
      '" onclick="apriNuovoAppuntamento(\'' + data + '\')">' +
      '<div class="cal-day-n">' + giorno + '</div>';

    appuntamentiDelGiorno.forEach(a => {
      const cliente = a.clienti?.ragione_sociale || 'Senza cliente';

      html += '<div class="cal-ev ord" ' +
        'onclick="event.stopPropagation();modificaAppuntamento(\'' + a.id + '\')">' +
        esc(formatOraApp(a.inizio) + ' · ' + a.titolo + ' — ' + cliente) +
        '</div>';
    });

    html += '</div>';
  }

  body.innerHTML = html;

  if (!appDati.length) {
    lista.innerHTML =
      '<div class="empty">Nessun appuntamento in questo mese.</div>';
    return;
  }

  lista.innerHTML = appDati.map(a => {
    const cliente = a.clienti?.ragione_sociale || 'Senza cliente';

    return '<div class="card" style="margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
      '<div>' +
      '<div style="font-weight:700">' + esc(a.titolo) + '</div>' +
      '<div style="font-size:12px;color:var(--m);margin-top:4px">' +
      esc(cliente) + ' · ' +
      new Date(a.inizio).toLocaleString('it-IT', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) +
      '</div>' +
      '</div>' +
      '<span class="bx bblue">' + esc(a.stato) + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="btn sm" onclick="modificaAppuntamento(\'' + a.id + '\')">✏️ Modifica</button>' +
      '<button class="btn sm" style="color:var(--r)" onclick="eliminaAppuntamento(\'' + a.id + '\')">🗑️ Elimina</button>' +
      '</div>' +
      '</div>';
  }).join('');
}

function apriNuovoAppuntamento(data) {
  ge('ma-id').value = '';
  ge('ma-titolo').value = '';
  ge('ma-tipo').value = 'visita';
  ge('ma-stato').value = 'pianificato';
  ge('ma-note').value = '';

  ge('ma-cliente').innerHTML =
    '<option value="">Nessun cliente / prospect</option>' +
    CLIS.map(c =>
      '<option value="' + c.id + '">' +
      esc(c.ragione_sociale) +
      '</option>'
    ).join('');

  ge('ma-inizio').value = data + 'T09:00';
  ge('ma-fine').value = data + 'T10:00';

  openM('m-appuntamento');
}

async function salvaAppuntamento() {
  const id = v('ma-id');
  const titolo = v('ma-titolo').trim();
  const inizio = v('ma-inizio');

  if (!titolo || !inizio) {
    toast('Titolo e data/ora di inizio sono obbligatori', 'err');
    return;
  }

  const payload = {
    cliente_id: v('ma-cliente') || null,
    titolo: titolo,
    tipo: v('ma-tipo'),
    inizio: new Date(inizio).toISOString(),
    fine: v('ma-fine') ? new Date(v('ma-fine')).toISOString() : null,
    stato: v('ma-stato'),
    note: v('ma-note').trim() || null
  };

  let result;

  if (id) {
    result = await db
      .from('appuntamenti_commerciali')
      .update(payload)
      .eq('id', id);
  } else {
    payload.rappresentante_id = ME.id;
    payload.creato_da = ME.id;

    result = await db
      .from('appuntamenti_commerciali')
      .insert(payload);
  }

  if (result.error) {
    toast('Errore: ' + result.error.message, 'err');
    return;
  }

  closeM('m-appuntamento');
  toast(id ? 'Appuntamento aggiornato' : 'Appuntamento creato', 'ok');
  loadAppuntamentiCommerciali();
}

function modificaAppuntamento(id) {
  const a = appDati.find(x => x.id === id);

  if (!a) {
    toast('Appuntamento non trovato', 'err');
    return;
  }

  ge('ma-id').value = a.id;
  ge('ma-titolo').value = a.titolo || '';
  ge('ma-tipo').value = a.tipo || 'visita';
  ge('ma-stato').value = a.stato || 'pianificato';
  ge('ma-inizio').value = datetimeLocaleApp(a.inizio);
  ge('ma-fine').value = datetimeLocaleApp(a.fine);
  ge('ma-note').value = a.note || '';

  ge('ma-cliente').innerHTML =
    '<option value="">Nessun cliente / prospect</option>' +
    CLIS.map(c =>
      '<option value="' + c.id + '">' +
      esc(c.ragione_sociale) +
      '</option>'
    ).join('');

  ge('ma-cliente').value = a.cliente_id || '';

  openM('m-appuntamento');
}

async function eliminaAppuntamento(id) {
  if (!confirm('Vuoi eliminare questo appuntamento?')) return;

  const { error } = await db
    .from('appuntamenti_commerciali')
    .delete()
    .eq('id', id);

  if (error) {
    toast('Errore: ' + error.message, 'err');
    return;
  }

  toast('Appuntamento eliminato', 'ok');
  loadAppuntamentiCommerciali();
}

function cambiaMeseAppuntamenti(delta) {
  appMese += delta;

  if (appMese < 0) {
    appMese = 11;
    appAnno--;
  }

  if (appMese > 11) {
    appMese = 0;
    appAnno++;
  }

  loadAppuntamentiCommerciali();
}

// ── PROGETTI TECNICI CLIENTE ─────────────────────────────────

async function loadProgettiCliente(clienteId) {
  const lista = ge('cd-progetti-lista');

  if (!clienteId || !lista) return;

  lista.innerHTML = '<div class="load">Caricamento...</div>';

  const { data, error } = await db
    .from('progetti_tecnici')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('creato_il', { ascending: false });

  if (error) {
    lista.innerHTML =
      '<div class="al2 e">Errore: ' + esc(error.message) + '</div>';
    return;
  }

  progettiClienteDati = data || [];

  if (!progettiClienteDati.length) {
    lista.innerHTML =
      '<div class="empty">Nessun progetto tecnico per questo cliente.</div>';
    return;
  }

  lista.innerHTML = progettiClienteDati.map(function(p) {
    const stato = {
      bozza: 'Bozza',
      inviato_a_commerciale: 'Inviato al commerciale',
      in_valutazione: 'In valutazione',
      pronto_per_preventivo: 'Pronto per preventivo',
      approvato: 'Approvato',
      archiviato: 'Archiviato'
    }[p.stato] || p.stato;

    return '<div class="card" style="margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
        '<div>' +
          '<div style="font-size:14px;font-weight:700">' +
            esc(p.titolo) +
          '</div>' +
          '<div style="font-size:12px;color:var(--m);margin-top:4px">' +
            esc(p.tipologia) +
            ' · Creato il ' +
            new Date(p.creato_il).toLocaleDateString('it-IT') +
          '</div>' +
        '</div>' +
        '<span class="bx bblue">' + esc(stato) + '</span>' +
      '</div>' +
      '<div style="font-size:13px;white-space:pre-wrap;margin-top:10px">' +
        esc(p.descrizione_tecnica) +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button class="btn sm" onclick="modificaProgetto(\'' + p.id + '\')">' +
          '✏️ Modifica' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function apriNuovoProgetto() {
  if (!currentCliId) {
    toast('Apri prima la scheda di un cliente', 'err');
    return;
  }

  ge('mp-id').value = '';
  ge('mp-titolo-modal').textContent = 'Nuovo progetto tecnico';
  ge('mp-titolo').value = '';
  ge('mp-tipologia').value = '';
  ge('mp-descrizione').value = '';
  ge('mp-materiali').value = '';

  openM('m-progetto');
}

function modificaProgetto(id) {
  const progetto = progettiClienteDati.find(p => p.id === id);

  if (!progetto) {
    toast('Progetto non trovato', 'err');
    return;
  }

  ge('mp-id').value = progetto.id;
  ge('mp-titolo-modal').textContent = 'Modifica progetto tecnico';
  ge('mp-titolo').value = progetto.titolo || '';
  ge('mp-tipologia').value = progetto.tipologia || '';
  ge('mp-descrizione').value = progetto.descrizione_tecnica || '';
  ge('mp-materiali').value = progetto.materiali_note || '';

  openM('m-progetto');
}

async function salvaProgetto() {
  const id = v('mp-id');
  const titolo = v('mp-titolo').trim();
  const tipologia = v('mp-tipologia');
  const descrizione = v('mp-descrizione').trim();

  if (!titolo || !tipologia || !descrizione) {
    toast('Titolo, tipologia e descrizione sono obbligatori', 'err');
    return;
  }

  const payload = {
    titolo: titolo,
    tipologia: tipologia,
    descrizione_tecnica: descrizione,
    materiali_note: v('mp-materiali').trim() || null
  };

  let result;

  if (id) {
    result = await db
      .from('progetti_tecnici')
      .update(payload)
      .eq('id', id);
  } else {
    payload.cliente_id = currentCliId;
    payload.rappresentante_id = ME.id;
    payload.stato = 'bozza';

    result = await db
      .from('progetti_tecnici')
      .insert(payload);
  }

  if (result.error) {
    toast('Errore: ' + result.error.message, 'err');
    return;
  }

  closeM('m-progetto');
  toast(id ? 'Progetto aggiornato' : 'Progetto creato come bozza', 'ok');
  loadProgettiCliente(currentCliId);
}


// ── PAGINA PROGETTI TECNICI ────────────────────────────────────
async function loadPaginaProgetti() {
  const box = ge('progetti-lista');
  if (!box) {
    console.error('Manca l’elemento HTML con id="progetti-lista"');
    return;
  }

  box.innerHTML = '<div class="load">Caricamento progetti...</div>';

  const { data, error } = await db
    .from('progetti_tecnici')
    .select('*, clienti(ragione_sociale)')
    .order('creato_il', { ascending: false });

  if (error) {
    console.error(error);
    box.innerHTML = '<div class="al2 e">Errore nel caricamento: ' + esc(error.message) + '</div>';
    return;
  }

  if (!data || data.length === 0) {
    box.innerHTML = '<div class="empty">Nessun progetto tecnico creato.</div>';
    return;
  }

  box.innerHTML = data.map(function(p) {
    const cliente = p.clienti ? p.clienti.ragione_sociale : 'Cliente non disponibile';

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:start">
          <div>
            <b>${esc(p.titolo)}</b>
            <div class="muted">${esc(cliente)} · ${esc(p.tipologia)}</div>
          </div>
          <span class="badge">${esc(p.stato)}</span>
        </div>
        <p style="margin:10px 0">${esc(p.descrizione_tecnica)}</p>
        <button class="btn sm" onclick="apriProgettoDaElenco('${p.id}')">
          Apri / modifica
        </button>
      </div>
    `;
  }).join('');
}

async function apriProgettoDaElenco(id) {
  const { data, error } = await db
    .from('progetti_tecnici')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    toast(error.message, 'err');
    return;
  }

  currentCliId = data.cliente_id;
  modificaProgetto(id);
}

// MOSTRA PASSWORD 

function togglePasswordLogin() {
  const input = ge('lpw');
  const button = ge('toggle-password');

  if (!input || !button) return;

  const nascosta = input.type === 'password';
  input.type = nascosta ? 'text' : 'password';
  button.textContent = nascosta ? 'Nascondi' : 'Mostra';
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',async()=>{
  ge('lem').addEventListener('keydown',e=>{if(e.key==='Enter')ge('lpw').focus();});
  ge('lpw').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
  buildSB();
  // Controlla sessione esistente
  const {data:{session}}=await db.auth.getSession();
  if(session?.user){
    let ud=null;
    const {data:u1}=await db.from('utenti').select('*').eq('id',session.user.id).maybeSingle();
    if(u1)ud=u1;
    else{const {data:u2}=await db.from('utenti').select('*').eq('email',session.user.email).maybeSingle();if(u2)ud=u2;}
    if(ud)await boot(ud);
  }
});
