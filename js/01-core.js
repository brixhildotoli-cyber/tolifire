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
let paginaPrecedenteCliente = 'clienti';
let paginaPrecedenteProgetto = 'progetti';
let richiestaProgettiCliente = 0;
let progettiClienteDati = [];
let appAnno = new Date().getFullYear();
let appMese = new Date().getMonth();
let appDati = [];

const TIPI_PRESIDI=[
  'estintore',
  'porta_rei',
  'manichetta',
  'idrante',
  'naspo',
  'luce_emergenza',
  'pompa_antincendio',
  'centrale_rivelazione',
  'sprinkler',
  'uscita_emergenza'
];

const TIPI_LABEL={
  estintore:'🧯 Estintori',
  porta_rei:'🚪 Porte REI',
  manichetta:'🧵 Manichette',
  idrante:'🚿 Idranti',
  naspo:'🌀 Naspi',
  luce_emergenza:'💡 Luci emergenza',
  pompa_antincendio:'⚙️ Pompa antincendio',
  centrale_rivelazione:'🖥 Centrale rivelazione',
  sprinkler:'🌧 Sprinkler',
  uscita_emergenza:'🚪 Uscite emergenza'
};
const PERIO_OPT=['mensile','bimestrale','trimestrale','quadrimestrale','semestrale','annuale','biennale'];
const PERIO_MESI={mensile:1,bimestrale:2,trimestrale:3,quadrimestrale:4,semestrale:6,annuale:12,biennale:24};

const NAV={
  titolare:[{id:'dashboard',l:'📊 Dashboard'},{id:'calendario',l:'📅 Calendario'},{id:'trattative',l:'🎯 Lead'},{id:'progetti-da-preventivare',l:'📐 Da preventivare'},{id:'preventivi-titolare',l:'🧾 Preventivi'},{id:'piano-mensile',l:'📋 Piano mensile'},{id:'presidi',l:'🧯 Presidi'},{id:'workflow',l:'📋 Da gestire'},{id:'interventi',l:'🔧 Interventi'},{id:'clienti',l:'🧍‍♂️ Clienti'},{id:'documenti',l:'📄 Documenti'},{id:'fatture',l:'💰 Fatture'},{id:'catalogo',l:'📦 Catalogo'},{id:'impostazioni',l:'Impostazioni'}],
  capo_tecnico:[{id:'dashboard',l:'📊 Dashboard'},{id:'calendario',l:'📅 Calendario'},{id:'calendario-team',l:'👥 Calendari team'},{id:'piano-mensile',l:'📋 Piano mensile'},{id:'presidi',l:'🧯 Presidi'},{id:'interventi',l:'Interventi'},{id:'tecnico',l:'📝 Esegui intervento'},{id:'clienti',l:' 🧍‍♂️ Clienti'},{id:'documenti',l:'Documenti'}],
  segreteria:[{id:'dashboard',l:'📊 Dashboard'},{id:'calendario',l:'📅 Calendario'},{id:'workflow',l:'📋 Da gestire'},{id:'presidi',l:'🧯 Presidi'},{id:'interventi',l:'🔧 Interventi'},{id:'clienti',l:'🧍‍♂️ Clienti'},{id:'documenti',l:'📄 Documenti'},{id:'fatture',l:'💰 Fatture'},{id:'catalogo',l:'📦 Catalogo'}],
  contabile:[{id:'dashboard',l:'📊 Dashboard'},{id:'workflow',l:'📅 Da fatturare'},{id:'fatture',l:'💰 Fatture'},{id:'documenti',l:'Documenti'},{id:'catalogo',l:'📦 Catalogo'}],
  tecnico:[{id:'dashboard',l:'📊 Dashboard'},{id:'calendario-tec',l:'📅 Il mio calendario'},{id:'tecnico',l:'📝 Esegui intervento'},{id:'documenti',l:'Documenti'}],
  commerciale:[{id:'dashboard',l:'📊 Dashboard'},{id:'progetti-da-preventivare',l:'📐 Da preventivare'},{id:'preventivi',l:'🧾 Preventivi'},{id:'fornitori',l:'🏭 Fornitori'},{id:'clienti',l:' 🧍‍♂️ Clienti'},{id:'documenti',l:'📄 Documenti'},{id:'fatture',l:'💰 Fatture'},{id:'catalogo',l:'📦 Catalogo'}, {id: 'info', l: 'ℹ️ Info'}],
  rappresentante:[{id:'dashboard-rapp',l:'📊 Dashboard'},{id:'calendario-appuntamenti', l:'📅 Calendario'},{id:'trattative',l:'🎯 Lead e trattative'},{id:'clienti',l:'🧍‍♂️ Clienti'},{id:'preventivi-rapp',l:'🧾 Preventivi'},{id:'progetti', l:'📐 Progetti'}, {id:'catalogo',l:'📦 Catalogo'}, {id:'info',l:'ⓘ Info'}],
  ingegnere: [{id: 'dashboard', l: '📊 Dashboard'},{id: 'calendario-ingegnere', l: '📅 Calendario'},{id: 'verifiche-tecniche', l: '🔧 Verifiche'},{id:'certificati-ingegnere', l:'📜 Certificati'},{id: 'documenti', l: '📄 Documenti'},{id: 'info', l: 'ℹ️ Info'}],
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

function stab(btn,tc){
  const pg=btn.closest('.page')||btn.closest('.modal')||document;pg.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  pg.querySelectorAll('.tc').forEach(t=>t.classList.remove('on'));
  btn.classList.add('on');
  const el=ge(tc);if(el)el.classList.add('on');
}
function sc(d){if(!d)
  return'';
  const days=Math.floor((new Date(d+'T00:00:00')-new Date())/86400000);
  return days<0?'se':days<=30?'se':days<=90?'sw':'si';
}
function dd2(d){if(!d)return'—';
  const diff=Math.floor((new Date(d+'T00:00:00')-new Date())/86400000);
  return diff<0?'Scaduto da '+Math.abs(diff)+'gg':diff+'gg';
}
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
  if(!email||!pwd){
    toast('Inserisci email e password','err');return;}
  const btn=ge('lbtn');
  btn.disabled=true;btn.textContent='Accesso in corso...';
  ge('lerr').innerHTML='';
  try{
    const {data,error}=await db.auth.signInWithPassword({email,password:pwd});
    if(error){throw error;}
    let ud=null;
    const {data:u1}=await db.from('utenti').select('*').eq('id',data.user.id).maybeSingle();
    if(u1)ud=u1;
    else{
      const {data:u2}=await db.from('utenti').select('*').eq('email',email).maybeSingle();
      if(u2)ud=u2;
    }
    if(!ud){
      throw new Error('Utente non trovato nel sistema. Contatta Brixhildo.');}
    await boot(ud);
  }catch(e){
    ge('lerr').innerHTML=`<div class="al2 e">${e.message}</div>`;
    btn.disabled=false;
    btn.textContent='Accedi';
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
 const caricamentiBase = [loadCS(), loadImp()];

// Carica utenti solo dove servono subito.
if (['titolare', 'capo_tecnico', 'segreteria', 'commerciale'].includes(ROLE)) {
  caricamentiBase.push(loadUS());
}

// La tabella completa del team serve solo al titolare.
if (ROLE === 'titolare') {
  caricamentiBase.push(loadTeam());
}

await Promise.all(caricamentiBase);
  if(ROLE==='rappresentante'){gotoPage('dashboard-rapp');}else{loadDash();}
}

