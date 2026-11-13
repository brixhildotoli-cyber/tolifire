const SU='https://syjbpxtkcsazpynyvoss.supabase.co';
const SK='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5amJweHRrY3NhenB5bnl2b3NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDA4NTAsImV4cCI6MjA5MDg3Njg1MH0.mzsJpMSNck7lOYJZZM_TdDXRCSGsBB2Zt0-5mcvujmA';
// F14.18: fetch personalizzato. Mentre il titolare lavora "come" un'altra
// persona (ENTRA_COME, F14.17) ogni richiesta al database porta
// l'intestazione x-agito-come con l'id della persona: con sql/71 il database
// risponde con il ruolo e la persona impersonati (stessi limiti) e il
// registro delle azioni tiene il titolare come autore vero. global.headers
// non basta: è fisso quando si crea il client. Solo l'id (non "ruolo|id"):
// sql/67, già in produzione, accetta l'id o il ruolo, così prima di sql/71
// i salvataggi non si fermano. Il portale (dbPublic) non la manda mai.
function intestazioneAgitoCome(){
  try{return (ENTRA_COME&&ROLE_REALE==='titolare'&&ENTRA_COME.id)?String(ENTRA_COME.id):'';}catch(e){return '';}
}
// F15.12: senza "Entra come" le richieste passano da fetchDatabase, che
// js/57 sostituisce con le letture cifrate sul telefono (dati già visti
// senza rete, 7 giorni). Con "Entra come" mai: si va sempre in rete.
function fetchDatabase(risorsa,opzioni){return fetch(risorsa,opzioni);}
function fetchConAgitoCome(risorsa,opzioni){
  const come=intestazioneAgitoCome();
  if(!come)return fetchDatabase(risorsa,opzioni);
  const o=Object.assign({},opzioni||{});
  const h=new Headers(o.headers||(risorsa instanceof Request?risorsa.headers:undefined));
  h.set('x-agito-come',come);
  o.headers=h;
  return fetch(risorsa,o);
}
// 12/11: FILA delle richieste al database (piano Nano di Supabase: con
// molte richieste insieme la CPU si satura e il gestionale si ferma per
// tutti). Per scheda del browser al massimo FILA_DB.max richieste in corso
// verso /rest, /storage e /functions; le altre aspettano il loro turno, in
// ordine. Il login e il rinnovo della sessione (/auth) non fanno la fila.
// Il posto si libera SEMPRE: risposta, errore, interruzione, o comunque dopo
// FILA_DB.attesaMaxMs (una richiesta appesa non blocca le altre). Senza rete
// (navigator.onLine false) niente fila: le letture arrivano dal telefono.
// In più: due LETTURE identiche (GET/HEAD, stesso indirizzo e stesse
// intestazioni) in corso nello stesso momento diventano una sola richiesta,
// e ognuna riceve la sua copia della risposta (Response.clone). Stessi dati,
// meno richieste. FILA_DB.scritture conta le scritture fatte da questa
// scheda: le memorie brevi dei moduli (es. smistamento di js/67) le usano
// per non mostrare un dato vecchio dopo un salvataggio.
const FILA_DB={max:6,inCorso:0,attesa:[],attesaMaxMs:30000,inVolo:new Map(),scritture:0,
  conteggio:{richieste:0,unite:0,inFila:0,maxInCorso:0}};
function indirizzoRichiestaDb(risorsa){
  try{return typeof risorsa==='string'?risorsa:(risorsa&&risorsa.url)||String(risorsa);}catch(e){return '';}
}
// POST che non scrivono (firme dei file, RPC di sola lettura): non contano
// come scritture. Una RPC non in elenco conta come scrittura (prudente).
const RPC_SOLA_LETTURA_DB=/^([a-z0-9_]+_attiv[oie]|smistamento_progetto|miei_avvisi|schede_migrate_motore|audit_presidi_da_esaminare|impegni_tecnici_dashboard|impegni_squadra_periodo|mie_deleghe_titolare|configurazione_push|stato_dispositivo_push|interventi_tecnici_assenti|assenze_personale|tipi_[a-z_]+|pratiche_aperte_[a-z_]+|importi_extra_commesse|ruolo_corrente|scheda_cantiere_commessa|miei_giorni_cantiere|mie_ore_cantiere|controllo_faldone_commessa|preventivo_firmato_commessa|voci_lavori_extra_commessa|presenti_giornale_commessa|ambito_audit_intervento|prezzi_contratto_cliente|elenco_clienti_presidi_tecnico|fonti_mancanti_progetto|controlli_invio_progetto|foto_video_mancanti_progetto|anteprima_smistamento|offerte_ordinabili_commessa|stati_fornitore_controlli|affidabilita_fornitore)$/;
function richiestaSoloLetturaDb(url){
  if(/\/storage\/v1\/object\/sign\//.test(url))return true;
  const m=/\/rest\/v1\/rpc\/([a-z0-9_]+)/.exec(url);
  return !!(m&&RPC_SOLA_LETTURA_DB.test(m[1]));
}
function richiestaDaFila(url){return /\/(rest|storage|functions)\/v1\//.test(url);}
function liberaPostoFilaDb(){
  const prossimo=FILA_DB.attesa.shift();
  if(prossimo)prossimo.via();else FILA_DB.inCorso=Math.max(0,FILA_DB.inCorso-1);
}
function prendiPostoFilaDb(segnale){
  if(FILA_DB.inCorso<FILA_DB.max){
    FILA_DB.inCorso++;
    if(FILA_DB.inCorso>FILA_DB.conteggio.maxInCorso)FILA_DB.conteggio.maxInCorso=FILA_DB.inCorso;
    return Promise.resolve();
  }
  FILA_DB.conteggio.inFila++;
  return new Promise(function(ok,ko){
    const voce={via:function(){if(segnale)segnale.removeEventListener('abort',fuori);ok();}};
    function fuori(){
      const i=FILA_DB.attesa.indexOf(voce);
      if(i>=0)FILA_DB.attesa.splice(i,1);
      ko(segnale.reason||new DOMException('Richiesta interrotta','AbortError'));
    }
    if(segnale){
      if(segnale.aborted){fuori();return;}
      segnale.addEventListener('abort',fuori,{once:true});
    }
    FILA_DB.attesa.push(voce);
  });
}
async function eseguiInFilaDb(risorsa,opzioni){
  const segnale=opzioni&&opzioni.signal;
  await prendiPostoFilaDb(segnale);
  let libero=false;
  const libera=function(){if(libero)return;libero=true;clearTimeout(timer);liberaPostoFilaDb();};
  const timer=setTimeout(libera,FILA_DB.attesaMaxMs);
  try{return await fetchConAgitoCome(risorsa,opzioni);}
  finally{libera();}
}
function chiaveLetturaUguale(metodo,url,opzioni){
  let corpo='';
  if(metodo==='POST'){
    // RPC di sola lettura con lo stesso corpo (es. le *_attivo all'avvio)
    if(!/\/rest\/v1\/rpc\//.test(url)||!richiestaSoloLetturaDb(url))return '';
    corpo=opzioni&&opzioni.body;
    if(corpo==null)corpo='';
    if(typeof corpo!=='string')return '';
  }else if(metodo!=='GET'&&metodo!=='HEAD')return '';
  if(opzioni&&opzioni.signal)return '';
  const h=new Headers((opzioni&&opzioni.headers)||undefined);
  return [metodo,url,h.get('authorization')||'',h.get('accept')||'',h.get('prefer')||'',h.get('range')||'',
    h.get('accept-profile')||'',h.get('content-profile')||'',intestazioneAgitoCome(),corpo,
    // una lettura nata dopo una scrittura non si unisce a una partita prima
    'scritture:'+FILA_DB.scritture].join('\n');
}
// Memoria breve (60 s) delle letture di tabelle che cambiano poco (elenchi
// di subappaltatori e utenti, regole, festività, catalogo delle lavorazioni,
// configurazione del motore...): moduli diversi della stessa scheda le
// rileggevano uguali una dopo l'altra. Solo risposte 200, solo finché questa
// scheda del browser non scrive nulla (FILA_DB.scritture): dopo un
// salvataggio si rilegge dal database. Ricaricare la pagina la svuota.
const LETTURE_QUASI_FISSE={tabelle:/^\/rest\/v1\/(subappaltatori|utenti|regole|regole_scadenze|festivita|lavorazioni|lavorazioni_campi|lavorazioni_documenti|lavorazioni_checklist|motore_oggetti|motore_stati|motore_transizioni|annullabili|fornitore_tipologie|mezzi_attrezzature|modelli_pdf)$/,
  durataMs:60000,massimo:150,righe:new Map()};
function letturaQuasiFissaInMemoria(metodo,url,chiave){
  if(metodo!=='GET')return null;
  const x=LETTURE_QUASI_FISSE.righe.get(chiave);
  if(!x)return null;
  if(x.scritture!==FILA_DB.scritture||Date.now()-x.il>LETTURE_QUASI_FISSE.durataMs){LETTURE_QUASI_FISSE.righe.delete(chiave);return null;}
  return x.risposta;
}
function ricordaLetturaQuasiFissa(metodo,url,chiave,promessa){
  if(metodo!=='GET')return;
  let percorso='';
  try{percorso=new URL(url,location.href).pathname;}catch(e){return;}
  if(!LETTURE_QUASI_FISSE.tabelle.test(percorso))return;
  const voce={risposta:promessa,il:Date.now(),scritture:FILA_DB.scritture};
  promessa.then(function(r){
    if(!r||r.status!==200||r.headers.get('x-toli-dal-telefono')){if(LETTURE_QUASI_FISSE.righe.get(chiave)===voce)LETTURE_QUASI_FISSE.righe.delete(chiave);return;}
    if(LETTURE_QUASI_FISSE.righe.size>=LETTURE_QUASI_FISSE.massimo)LETTURE_QUASI_FISSE.righe.delete(LETTURE_QUASI_FISSE.righe.keys().next().value);
    LETTURE_QUASI_FISSE.righe.set(chiave,voce);
  },function(){});
}
function fetchSupabaseInFila(risorsa,opzioni){
  const url=indirizzoRichiestaDb(risorsa);
  if(!richiestaDaFila(url))return fetchConAgitoCome(risorsa,opzioni);
  FILA_DB.conteggio.richieste++;
  const metodo=String((opzioni&&opzioni.method)||(risorsa&&risorsa.method)||'GET').toUpperCase();
  const scrittura=metodo!=='GET'&&metodo!=='HEAD'&&!richiestaSoloLetturaDb(url);
  if(scrittura){
    // segnata quando parte e quando finisce: una lettura servita durante una
    // scrittura lenta non resta in memoria con il dato di prima
    FILA_DB.scritture++;
    const fine=function(){FILA_DB.scritture++;};
    const p=(typeof navigator!=='undefined'&&navigator.onLine===false)?fetchConAgitoCome(risorsa,opzioni):eseguiInFilaDb(risorsa,opzioni);
    p.then(fine,fine);
    return p;
  }
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return fetchConAgitoCome(risorsa,opzioni);
  let chiave='';
  try{chiave=chiaveLetturaUguale(metodo,url,opzioni);}catch(e){chiave='';}
  if(!chiave)return eseguiInFilaDb(risorsa,opzioni);
  const tenuta=letturaQuasiFissaInMemoria(metodo,url,chiave);
  if(tenuta){FILA_DB.conteggio.unite++;return tenuta.then(function(r){return r.clone();});}
  let comune=FILA_DB.inVolo.get(chiave);
  if(comune)FILA_DB.conteggio.unite++;
  else{
    comune=eseguiInFilaDb(risorsa,opzioni);
    FILA_DB.inVolo.set(chiave,comune);
    const via=function(){if(FILA_DB.inVolo.get(chiave)===comune)FILA_DB.inVolo.delete(chiave);};
    comune.then(via,via);
    // una lettura appesa non deve trattenere le uguali che arrivano dopo
    setTimeout(via,FILA_DB.attesaMaxMs);
    ricordaLetturaQuasiFissa(metodo,url,chiave,comune);
  }
  return comune.then(function(r){return r.clone();});
}
const db=supabase.createClient(SU,SK,{auth:{persistSession:true,autoRefreshToken:true,storage:window.localStorage},global:{fetch:fetchSupabaseInFila}});
// Client pubblico per portale cliente (nessun login richiesto).
// Il codice segreto del link (?portale=<codice>) viaggia nell'intestazione
// x-portale-token: le policy dello storage lo usano per riconoscere il
// cliente (sql/13 e sql/14). I dati passano dalle RPC portale_*.
const PORTALE_TOKEN=new URLSearchParams(window.location.search).get('portale')||'';
const dbPublic=supabase.createClient(SU,SK,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{'apikey':SK,'Authorization':'Bearer '+SK,'x-portale-token':PORTALE_TOKEN}}
});

// Link firmati dei file dello Storage (11/11: ogni firma interroga il
// database con le regole dello Storage; aprendo più volte una scheda con 21
// foto si firmavano sempre tutte e il database andava in sovraccarico).
// Un link per bucket, percorso e nome di download, tenuto in memoria (solo
// in questa pagina: "Esci" e "Entra come" ricaricano e lo cancellano) finché
// mancano più di 2 minuti alla scadenza. Stessa risposta di createSignedUrl:
// { data: { signedUrl }, error }. firmaFileInBlocco firma con UNA richiesta
// (createSignedUrls) i percorsi che non sono già in memoria e restituisce
// un oggetto percorso -> link (assente se il file non si firma).
const FIRME_FILE={link:new Map(),inCorso:new Map(),margineMs:120000};
function chiaveFirmaFile(bucket,percorso,opzioni){
  return bucket+'|'+percorso+'|'+((opzioni&&opzioni.download)?String(opzioni.download):'');
}
function firmaFileInMemoria(chiave){
  const x=FIRME_FILE.link.get(chiave);
  if(x&&x.scade-Date.now()>FIRME_FILE.margineMs)return x.url;
  if(x)FIRME_FILE.link.delete(chiave);
  return null;
}
function ricordaFirmaFile(chiave,url,secondi){
  if(url)FIRME_FILE.link.set(chiave,{url:url,scade:Date.now()+Number(secondi||3600)*1000});
}
async function firmaFile(bucket,percorso,secondi,opzioni){
  secondi=Math.max(Number(secondi)||3600,300);
  if(!percorso)return {data:null,error:{message:'Percorso del file mancante'}};
  const chiave=chiaveFirmaFile(bucket,percorso,opzioni);
  const pronto=firmaFileInMemoria(chiave);
  if(pronto)return {data:{signedUrl:pronto},error:null};
  if(FIRME_FILE.inCorso.has(chiave))return FIRME_FILE.inCorso.get(chiave);
  const p=(async function(){
    try{
      const r=opzioni?await db.storage.from(bucket).createSignedUrl(percorso,secondi,opzioni)
                     :await db.storage.from(bucket).createSignedUrl(percorso,secondi);
      if(!r.error&&r.data&&r.data.signedUrl)ricordaFirmaFile(chiave,r.data.signedUrl,secondi);
      return r;
    }catch(e){return {data:null,error:e};}
    finally{FIRME_FILE.inCorso.delete(chiave);}
  })();
  FIRME_FILE.inCorso.set(chiave,p);
  return p;
}
async function firmaFileInBlocco(bucket,percorsi,secondi){
  secondi=Math.max(Number(secondi)||3600,300);
  const out={};
  const mancanti=[];
  Array.from(new Set((percorsi||[]).filter(Boolean))).forEach(function(p){
    const u=firmaFileInMemoria(chiaveFirmaFile(bucket,p));
    if(u)out[p]=u;else mancanti.push(p);
  });
  // a blocchi di 100 percorsi per richiesta
  for(let i=0;i<mancanti.length;i+=100){
    const blocco=mancanti.slice(i,i+100);
    try{
      const {data,error}=await db.storage.from(bucket).createSignedUrls(blocco,secondi);
      if(error||!Array.isArray(data))continue;
      data.forEach(function(r){
        if(!r||r.error||!r.signedUrl||!r.path)return;
        out[r.path]=r.signedUrl;
        ricordaFirmaFile(chiaveFirmaFile(bucket,r.path),r.signedUrl,secondi);
      });
    }catch(e){/* restano senza link: "File non disponibile" */}
  }
  return out;
}

let ME=null,ROLE=null,CLIS=[],UTENTI=[],ODLS=[],PA=[],PF=[];
let _pianoAnno=new Date().getFullYear(),_pianoMese=new Date().getMonth()+1;
let calCicli=[];
let currentCliId=null;
let paginaPrecedenteCliente = 'clienti';
let scrollPrimaSchedaCliente = 0;
let paginaPrecedenteProgetto = 'progetti';
let richiestaProgettiCliente = 0;
let progettiClienteDati = [];
let appAnno = new Date().getFullYear();
let appMese = new Date().getMonth();
let appDati = [];

const storicoScrollPagine = [];

function ricordaPosizionePagina() {
  storicoScrollPagine.push({
    top: window.scrollY || 0,
    left: window.scrollX || 0
  });
}

function ripristinaPosizionePagina() {
  const posizione = storicoScrollPagine.pop();

  if (!posizione) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({
        top: posizione.top,
        left: posizione.left,
        behavior: 'auto'
      });
    });
  });
}

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
  'uscita_emergenza',
  'evacuatore_fumi'
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
  uscita_emergenza:'🚪 Uscite emergenza',
  evacuatore_fumi: '🌫️ Evacuatori fumo',
};
const PERIO_OPT=['mensile','bimestrale','trimestrale','quadrimestrale','semestrale','annuale','biennale'];
const PERIO_MESI={mensile:1,bimestrale:2,trimestrale:3,quadrimestrale:4,semestrale:6,annuale:12,biennale:24};
// Etichette dei ruoli in interfaccia (F3.2): servono solo a non mostrare i
// codici grezzi di utenti.ruolo, che NON cambiano (decisione D1). Decisione
// di Erika del 09/11: il ruolo commerciale si chiama "Acquisti" (solo
// l'etichetta, il codice resta 'commerciale'); "Rappresentante" resta.
const ETICHETTE_RUOLO={
  titolare:'Titolare',
  informatico:'Informatico',
  rappresentante:'Rappresentante',
  commerciale:'Acquisti',
  ingegnere:'Ingegnere',
  capo_tecnico:'Capo tecnico',
  tecnico:'Tecnico',
  segreteria:'Segreteria',
  contabile:'Contabile'
};
function etichettaRuolo(codice){return ETICHETTE_RUOLO[codice]||codice||'';}

// ── F14.2 — REGOLE E SOGLIE (sql/62) ─────────────────────────────────
// Funzione unica: leggiRegola('chiave') (asincrona, con cache) o
// leggiRegolaSubito('chiave') (dalla cache già caricata). Valori nella
// tabella regole, cambiati solo dal titolare (RPC salva_regola, registro
// in regole_storico). Le 4 regole con "colonna" leggono la colonna di
// impostazioni, che resta dove è (la leggono trigger e RPC): es. la
// soglia "lavoro grande" dello smistamento (T2). La soglia 3.000 € del
// rappresentante NON è una regola (D14: fissa nel DB, sql/10).
// Senza sql/62 valgono i predefiniti qui sotto (gli stessi del file SQL):
// chi aggiunge una regola la mette sia nel suo sql/NN sia qui.
const REGOLE_PREDEFINITE=[
  {chiave:"margine_minimo_totale",gruppo:"margini",ordine:10,valore:29,unita:"percento",verso:"sotto",min:0,max:100,intero:false,vuota:false,colonna:null,descrizione:"Margine minimo del preventivo sul totale, dopo la provvigione: sotto si blocca e serve lo sblocco del titolare"},
  {chiave:"soglia_margine_gruppo",gruppo:"margini",ordine:20,valore:20,unita:"percento",verso:"sotto",min:0,max:100,intero:false,vuota:false,colonna:null,descrizione:"Margine minimo di un gruppo di voci: sotto compare solo un avviso giallo (decisione E3)"},
  {chiave:"anticipo_percentuale",gruppo:"margini",ordine:30,valore:50,unita:"percento",verso:"valore",min:0,max:100,intero:false,vuota:false,colonna:null,descrizione:"Anticipo proposto sul totale imponibile del preventivo"},
  {chiave:"vendita_semplice_sotto",gruppo:"margini",ordine:40,valore:1000,unita:"euro",verso:"sotto",min:0,max:null,intero:false,vuota:false,colonna:null,descrizione:"Sotto questo importo (imponibile) è una vendita semplice"},
  {chiave:"tetto_urgenza",gruppo:"margini",ordine:50,valore:2000,unita:"euro",verso:"sopra",min:0,max:null,intero:false,vuota:false,colonna:null,descrizione:"Tetto delle urgenze: oltre questo importo l'urgenza passa dal titolare"},
  {chiave:"tolleranza_quantita",gruppo:"margini",ordine:60,valore:5,unita:"percento",verso:"sopra",min:0,max:100,intero:false,vuota:false,colonna:null,descrizione:"Tolleranza sulle quantità (consegnato o posato rispetto al previsto): oltre si segnala"},
  {chiave:"costo_operaio_giorno",gruppo:"margini",ordine:70,valore:150,unita:"euro_giorno",verso:"valore",min:0,max:null,intero:false,vuota:false,colonna:null,descrizione:"Costo giorno uomo: costo azienda di un operaio per giorno lavorato (decisione E11)"},
  {chiave:"tariffa_oraria_standard",gruppo:"margini",ordine:80,valore:35,unita:"euro_ora",verso:"valore",min:0,max:null,intero:false,vuota:false,colonna:"tariffa_oraria_standard",descrizione:"Tariffa oraria standard della manodopera (ore della scheda di lavoro); è anche in Soglie e tariffe"},
  {chiave:"soglia_lavoro_grande",gruppo:"smistamento",ordine:10,valore:30000,unita:"euro",verso:"sopra",min:0,max:null,intero:false,vuota:true,colonna:"soglia_lavoro_grande",descrizione:"Soglia \"lavoro grande\" (imponibile stimato): sopra il lavoro va all'ingegnere (smistamento, decisione T2). Vuota = nessuna soglia; è anche in Soglie e tariffe"},
  {chiave:"soglia_giallo_posizioni",gruppo:"smistamento",ordine:20,valore:10,unita:"numero",verso:"sopra",min:0,max:null,intero:true,vuota:false,colonna:null,descrizione:"Pratica gialla per dimensione: più di questo numero di posizioni"},
  {chiave:"soglia_giallo_importo",gruppo:"smistamento",ordine:30,valore:15000,unita:"euro",verso:"sopra",min:0,max:null,intero:false,vuota:false,colonna:null,descrizione:"Pratica gialla per dimensione: più di questo importo"},
  {chiave:"porte_fornitori_parallelo_sopra",gruppo:"smistamento",ordine:40,valore:5000,unita:"euro",verso:"sopra",min:0,max:null,intero:false,vuota:false,colonna:null,descrizione:"Porte: sopra questo importo si chiedono offerte a più fornitori in parallelo"},
  {chiave:"passaggio_consegne_sopra",gruppo:"smistamento",ordine:50,valore:10000,unita:"euro",verso:"sopra",min:0,max:null,intero:false,vuota:false,colonna:null,descrizione:"Commessa sopra questo importo: prima della presa in carico serve il passaggio tra venditore e capo tecnico"},
  {chiave:"passaggio_consegne_minuti",gruppo:"smistamento",ordine:60,valore:15,unita:"minuti",verso:"valore",min:0,max:480,intero:true,vuota:false,colonna:null,descrizione:"Durata del passaggio di consegne tra venditore e capo tecnico"},
  {chiave:"richiamo_scadenza_offerta_gg",gruppo:"smistamento",ordine:70,valore:5,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:null,descrizione:"Giorni prima della scadenza dell'offerta in cui il venditore richiama il cliente"},
  {chiave:"anticipo_promemoria_1_gg",gruppo:"smistamento",ordine:80,valore:7,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:null,descrizione:"Anticipo non pagato: primo promemoria al rappresentante dopo questi giorni (decisione E7)"},
  {chiave:"anticipo_promemoria_2_gg",gruppo:"smistamento",ordine:90,valore:15,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:null,descrizione:"Anticipo non pagato: secondo promemoria al rappresentante (decisione E7)"},
  {chiave:"anticipo_avviso_titolare_gg",gruppo:"smistamento",ordine:100,valore:30,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:null,descrizione:"Anticipo non pagato: avviso al titolare dopo questi giorni (decisione E7, nessun annullamento automatico)"},
  {chiave:"anticipo_avviso_titolare_2_gg",gruppo:"smistamento",ordine:110,valore:60,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:null,descrizione:"Anticipo non pagato: secondo avviso al titolare (decisione E7, nessun annullamento automatico)"},
  {chiave:"presa_in_carico_gg",gruppo:"tempi",ordine:10,valore:2,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Presa in carico della commessa da parte del capo tecnico"},
  {chiave:"integrazione_venditore_gg",gruppo:"tempi",ordine:20,valore:2,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Integrazione chiesta al venditore (rappresentante): tempo per rispondere"},
  {chiave:"integrazione_promemoria_ore",gruppo:"tempi",ordine:30,valore:48,unita:"ore",verso:"sopra",min:0,max:720,intero:false,vuota:false,colonna:null,descrizione:"Integrazione al venditore: promemoria dopo queste ore"},
  {chiave:"integrazione_avviso_titolare_gg",gruppo:"tempi",ordine:40,valore:7,unita:"giorni_lav",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:null,descrizione:"Integrazione al venditore ancora aperta: avviso al titolare dopo questi giorni lavorativi"},
  {chiave:"risposta_ingegnere_acquisti_gg",gruppo:"tempi",ordine:50,valore:1,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Risposta dell'ingegnere ad Acquisti"},
  {chiave:"domande_capo_tecnico_gg",gruppo:"tempi",ordine:60,valore:1,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Risposta alle domande del capo tecnico (Capo Operativo)"},
  {chiave:"scadenza_fornitore_gg",gruppo:"tempi",ordine:70,valore:3,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Tempo dato al fornitore per mandare l'offerta"},
  {chiave:"preventivo_verde_gg",gruppo:"tempi",ordine:80,valore:2,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Preventivo verde pronto entro questi giorni da \"pronto per preventivo\" (o dall'ultima offerta)"},
  {chiave:"rivalidazione_prezzi_gg",gruppo:"tempi",ordine:90,valore:1,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Rivalidazione dei prezzi di un preventivo"},
  {chiave:"decisione_bloccata_cantiere_ore",gruppo:"tempi",ordine:100,valore:4,unita:"ore_lav",verso:"sopra",min:0,max:80,intero:false,vuota:false,colonna:null,descrizione:"Decisione su una posizione bloccata con il cantiere aperto"},
  {chiave:"decisione_bloccata_gg",gruppo:"tempi",ordine:110,valore:1,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Decisione su una posizione bloccata senza cantiere aperto"},
  {chiave:"caso_non_previsto_cantiere_ore",gruppo:"tempi",ordine:120,valore:4,unita:"ore_lav",verso:"sopra",min:0,max:80,intero:false,vuota:false,colonna:null,descrizione:"Risposta a un caso non previsto con il cantiere aperto"},
  {chiave:"caso_non_previsto_gg",gruppo:"tempi",ordine:130,valore:1,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Risposta a un caso non previsto senza cantiere aperto"},
  {chiave:"attesa_massima_cantiere_min",gruppo:"tempi",ordine:140,valore:30,unita:"minuti",verso:"sopra",min:0,max:480,intero:true,vuota:false,colonna:null,descrizione:"Attesa massima della squadra in cantiere"},
  {chiave:"risposta_gestionale_fermo_ore",gruppo:"tempi",ordine:150,valore:4,unita:"ore_lav",verso:"sopra",min:0,max:80,intero:false,vuota:false,colonna:null,descrizione:"Risposta della programmatrice quando il gestionale è fermo"},
  {chiave:"annulla_entro_ore",gruppo:"tempi",ordine:200,valore:24,unita:"ore",verso:"sopra",min:0,max:168,intero:false,vuota:false,colonna:null,descrizione:"Annulla: per quante ore chi ha fatto un'azione la può annullare da solo (se il passo successivo non è partito); dopo, \"Chiedi correzione\" al responsabile"},
  {chiave:"correzione_risposta_gg",gruppo:"tempi",ordine:210,valore:1,unita:"giorni_lav",verso:"sopra",min:0,max:10,intero:false,vuota:false,colonna:null,descrizione:"Richiesta di correzione: tempo del responsabile per rispondere, poi risale al titolare"},
  {chiave:"spese_fuori_budget_acquisti",gruppo:"spese",ordine:10,valore:50,unita:"euro",verso:"sopra",min:0,max:null,intero:false,vuota:false,colonna:null,descrizione:"Spesa fuori budget: fino a questo importo decide Acquisti, oltre il titolare"},
  {chiave:"spese_titolare_irraggiungibile",gruppo:"spese",ordine:20,valore:200,unita:"euro",verso:"sopra",min:0,max:null,intero:false,vuota:false,colonna:null,descrizione:"Cantiere fermo e titolare irraggiungibile: Acquisti autorizza fino a questo importo, il titolare ratifica"},
  {chiave:"soglia_km_trasferta",gruppo:"spese",ordine:30,valore:50,unita:"km",verso:"sopra",min:0,max:2000,intero:false,vuota:false,colonna:null,descrizione:"Oltre questi km dalla sede il lavoro è in trasferta (valore iniziale da confermare)"},
  {chiave:"controllo_km_oltre",gruppo:"spese",ordine:40,valore:150,unita:"km",verso:"sopra",min:0,max:2000,intero:false,vuota:false,colonna:null,descrizione:"Oltre questi km la trasferta va controllata"},
  {chiave:"soglia_ordine_libero",gruppo:"spese",ordine:50,valore:2000,unita:"euro",verso:"sopra",min:0,max:null,intero:false,vuota:false,colonna:null,descrizione:"Ordine libero ai fornitori (senza offerta): oltre questo importo IVA esclusa lo approva il titolare prima dell'invio"},
  {chiave:"doc_finali_controllo_gg",gruppo:"documenti_finali",ordine:10,valore:2,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Documenti finali: controllo di completezza del capo tecnico"},
  {chiave:"doc_finali_firma_gg",gruppo:"documenti_finali",ordine:20,valore:3,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Documenti finali: firma dell'ingegnere"},
  {chiave:"doc_finali_invio_gg",gruppo:"documenti_finali",ordine:30,valore:1,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Documenti finali: invio della segreteria al cliente (dopo il saldo, decisione E1)"},
  {chiave:"doc_finali_consegna_gg",gruppo:"documenti_finali",ordine:40,valore:10,unita:"giorni_lav",verso:"sopra",min:0,max:120,intero:false,vuota:false,colonna:null,descrizione:"Documenti finali consegnati al cliente entro questi giorni"},
  {chiave:"verbale_consegna_silenzio_gg",gruppo:"documenti_finali",ordine:50,valore:5,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Verbale di consegna accettato dopo questi giorni di silenzio del cliente"},
  {chiave:"fattura_anticipo_entro_gg",gruppo:"incassi",ordine:10,valore:1,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Fattura d'anticipo emessa entro questi giorni dall'accettazione"},
  {chiave:"sollecito_1_gg",gruppo:"incassi",ordine:20,valore:7,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:null,descrizione:"Primo sollecito di incasso: giorni dopo la scadenza"},
  {chiave:"sollecito_2_gg",gruppo:"incassi",ordine:30,valore:30,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:null,descrizione:"Secondo sollecito di incasso: giorni dopo la scadenza"},
  {chiave:"sollecito_3_gg",gruppo:"incassi",ordine:40,valore:60,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:null,descrizione:"Terzo sollecito di incasso: giorni dopo la scadenza"},
  {chiave:"cliente_bloccato_scaduto_gg",gruppo:"incassi",ordine:50,valore:30,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:null,descrizione:"Cliente bloccato con uno scaduto oltre questi giorni"},
  {chiave:"fattura_contestata_risposta_gg",gruppo:"incassi",ordine:60,valore:3,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Risposta a una fattura contestata"},
  {chiave:"reclamo_prima_risposta_gg",gruppo:"incassi",ordine:70,valore:2,unita:"giorni_lav",verso:"sopra",min:0,max:60,intero:false,vuota:false,colonna:null,descrizione:"Prima risposta a un reclamo"},
  {chiave:"giorni_preavviso_rinnovo",gruppo:"preavvisi",ordine:10,valore:60,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:true,colonna:"giorni_preavviso_rinnovo",descrizione:"Preavviso rinnovo dei contratti di manutenzione (vuoto = 60); è anche in Soglie e tariffe"},
  {chiave:"preavviso_corsi_visite_gg",gruppo:"preavvisi",ordine:20,valore:60,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:null,descrizione:"Preavviso scadenza di corsi e visite mediche (formazione, idoneità)"},
  {chiave:"giorni_preavviso_documenti",gruppo:"preavvisi",ordine:30,valore:30,unita:"giorni",verso:"sopra",min:0,max:365,intero:true,vuota:false,colonna:"giorni_preavviso_documenti",descrizione:"Preavviso scadenza documenti dell'impresa (DURC, visura, POS...): oggi vale per tutti i documenti di team e subappalti; è anche in Soglie e tariffe"}
];
const GRUPPI_REGOLE={
  margini:'💶 Margini, prezzi e anticipo',
  smistamento:'🧭 Pratiche, smistamento e richiami',
  tempi:'⏱️ Tempi di risposta',
  spese:'🚐 Spese di cantiere e trasferte',
  documenti_finali:'📄 Documenti finali',
  incassi:'💰 Fatture, incassi e reclami',
  preavvisi:'🔔 Scadenze e preavvisi'
};
const UNITA_REGOLE={
  percento:'%',euro:'€',euro_ora:'€/ora',euro_giorno:'€/giorno',giorni:'giorni',
  giorni_lav:'giorni lav.',ore:'ore',ore_lav:'ore lav.',minuti:'minuti',km:'km',numero:'n.'
};
const REGOLE_CACHE_MS=5*60*1000;
const REGOLE_STATO={disponibili:null,righe:null,lette:0,inCorso:null};

function regolaPredefinita(chiave){return REGOLE_PREDEFINITE.find(r=>r.chiave===chiave)||null;}

// true/false se la tabella regole c'è (null = non si sa ancora, es. rete)
async function verificaRegoleDisponibili(){
  if(REGOLE_STATO.disponibili!==null)return REGOLE_STATO.disponibili;
  await caricaRegole(true);
  return REGOLE_STATO.disponibili;
}

// Legge tutte le regole in una volta (cache di 5 minuti). Non dà mai errore.
async function caricaRegole(forza){
  if(!forza&&REGOLE_STATO.righe&&Date.now()-REGOLE_STATO.lette<REGOLE_CACHE_MS)return REGOLE_STATO.righe;
  if(!forza&&REGOLE_STATO.disponibili===false)return null; // senza sql/62: predefiniti, nessuna rilettura
  if(REGOLE_STATO.inCorso)return REGOLE_STATO.inCorso;
  REGOLE_STATO.inCorso=(async()=>{
    try{
      const {data,error}=await db.from('regole').select('*');
      if(error){
        const manca=error.code==='42P01'||error.code==='PGRST205'||/regole/.test(error.message||'')&&/(does not exist|schema cache|not find)/i.test(error.message||'');
        if(manca){REGOLE_STATO.disponibili=false;REGOLE_STATO.righe=null;}
        return REGOLE_STATO.righe;
      }
      const mappa={};(data||[]).forEach(r=>{mappa[r.chiave]=r;});
      REGOLE_STATO.disponibili=true;REGOLE_STATO.righe=mappa;REGOLE_STATO.lette=Date.now();
      return mappa;
    }catch(e){return REGOLE_STATO.righe;}
    finally{REGOLE_STATO.inCorso=null;}
  })();
  return REGOLE_STATO.inCorso;
}
function svuotaCacheRegole(){REGOLE_STATO.lette=0;}

function numeroRegola(x){
  if(x===null||x===undefined||x==='')return null;
  const n=Number(x);return isFinite(n)?n:null;
}
// Valore dalla cache (o predefinito) senza attese. null = regola vuota o sconosciuta.
function leggiRegolaSubito(chiave){
  const riga=REGOLE_STATO.righe&&REGOLE_STATO.righe[chiave];
  const pred=regolaPredefinita(chiave);
  if(!riga&&!pred){console.warn('Regola sconosciuta: '+chiave);return null;}
  const colonna=(riga&&riga.colonna_impostazioni)||(pred&&pred.colonna);
  if(colonna){
    const imp=(typeof IMPOSTAZIONI!=='undefined')?IMPOSTAZIONI:null;
    return imp&&Object.prototype.hasOwnProperty.call(imp,colonna)?numeroRegola(imp[colonna]):null;
  }
  if(riga)return numeroRegola(riga.valore);
  return numeroRegola(pred.valore);
}
// Funzione unica per leggere una soglia: await leggiRegola('spese_fuori_budget_acquisti')
async function leggiRegola(chiave){
  await caricaRegole(false);
  const riga=REGOLE_STATO.righe&&REGOLE_STATO.righe[chiave];
  const pred=regolaPredefinita(chiave);
  const colonna=(riga&&riga.colonna_impostazioni)||(pred&&pred.colonna);
  if(colonna&&(typeof IMPOSTAZIONI==='undefined'||!IMPOSTAZIONI)){
    try{
      const {data,error}=await db.from('impostazioni').select(colonna).eq('id',1).maybeSingle();
      if(!error&&data)return numeroRegola(data[colonna]);
    }catch(e){}
    return null;
  }
  return leggiRegolaSubito(chiave);
}
// La regola scatta? sopra: valore oltre la soglia; sotto: valore sotto la
// soglia; null per i parametri di calcolo o con soglia/valore vuoti.
// Gemella di regola_superata (sql/62). Es.: spese_fuori_budget_acquisti 60,
// spesa 55 → false (decide Acquisti), 65 → true (decide il titolare).
function regolaSuperata(chiave,valore){
  const riga=REGOLE_STATO.righe&&REGOLE_STATO.righe[chiave];
  const pred=regolaPredefinita(chiave);
  const verso=(riga&&riga.verso)||(pred&&pred.verso);
  const soglia=leggiRegolaSubito(chiave);
  const n=numeroRegola(valore);
  if(!verso||verso==='valore'||soglia===null||n===null)return null;
  return verso==='sotto'?n<soglia:n>soglia;
}
function testoValoreRegola(valore,unita){
  if(valore===null||valore===undefined||valore==='')return 'vuota';
  const u=UNITA_REGOLE[unita]||'';
  const n=Number(valore).toLocaleString('it-IT',{maximumFractionDigits:2});
  return unita==='euro'?n+' €':(n+(u?' '+u:''));
}

// ── F14.3 — FESTIVITÀ E GIORNI LAVORATIVI (sql/63) ───────────────────
// Giorni lavorativi = dal lunedì al venerdì, tolti i giorni della tabella
// festivita (festività nazionali, San Ranieri 17/6 patrono di Pisa,
// chiusure aziendali), che cambia solo il titolare (Impostazioni, js/56).
// Valgono per i conteggi interni, non per gli orari dei cantieri fuori Pisa.
// Gemelle delle funzioni del database: giornoLavorativo = giorno_lavorativo,
// giorniLavorativiTra = giorni_lavorativi_tra, aggiungiGgLav = aggiungi_gg_lav.
// Senza sql/63 valgono le date qui sotto (le stesse del file SQL).
// Es.: aggiungiGgLav('2026-12-04',2) = '2026-12-09' (salta l'8/12).
const FESTIVITA_PREDEFINITE=[
  {data:'2026-01-01',nome:'Capodanno',tipo:'nazionale'},
  {data:'2026-01-06',nome:'Epifania',tipo:'nazionale'},
  {data:'2026-04-06',nome:"Lunedì dell'Angelo",tipo:'nazionale'},
  {data:'2026-04-25',nome:'Liberazione',tipo:'nazionale'},
  {data:'2026-05-01',nome:'Festa del lavoro',tipo:'nazionale'},
  {data:'2026-06-02',nome:'Festa della Repubblica',tipo:'nazionale'},
  {data:'2026-06-17',nome:'San Ranieri (Pisa)',tipo:'patrono'},
  {data:'2026-08-15',nome:'Ferragosto',tipo:'nazionale'},
  {data:'2026-11-01',nome:'Ognissanti',tipo:'nazionale'},
  {data:'2026-12-08',nome:'Immacolata',tipo:'nazionale'},
  {data:'2026-12-25',nome:'Natale',tipo:'nazionale'},
  {data:'2026-12-26',nome:'Santo Stefano',tipo:'nazionale'},
  {data:'2027-01-01',nome:'Capodanno',tipo:'nazionale'},
  {data:'2027-01-06',nome:'Epifania',tipo:'nazionale'},
  {data:'2027-03-29',nome:"Lunedì dell'Angelo",tipo:'nazionale'},
  {data:'2027-04-25',nome:'Liberazione',tipo:'nazionale'},
  {data:'2027-05-01',nome:'Festa del lavoro',tipo:'nazionale'},
  {data:'2027-06-02',nome:'Festa della Repubblica',tipo:'nazionale'},
  {data:'2027-06-17',nome:'San Ranieri (Pisa)',tipo:'patrono'},
  {data:'2027-08-15',nome:'Ferragosto',tipo:'nazionale'},
  {data:'2027-11-01',nome:'Ognissanti',tipo:'nazionale'},
  {data:'2027-12-08',nome:'Immacolata',tipo:'nazionale'},
  {data:'2027-12-25',nome:'Natale',tipo:'nazionale'},
  {data:'2027-12-26',nome:'Santo Stefano',tipo:'nazionale'}
];
const TIPI_FESTIVITA={nazionale:'Festività nazionale',patrono:'Patrono',chiusura:'Chiusura aziendale'};
const FESTIVITA_STATO={disponibili:null,righe:null,date:null,lette:0,inCorso:null};

// Legge la tabella festivita (cache di 5 minuti). Non dà mai errore:
// senza sql/63 (o senza rete) restano le FESTIVITA_PREDEFINITE.
async function caricaFestivita(forza){
  if(!forza&&FESTIVITA_STATO.righe&&Date.now()-FESTIVITA_STATO.lette<REGOLE_CACHE_MS)return FESTIVITA_STATO.righe;
  if(!forza&&FESTIVITA_STATO.disponibili===false)return null;
  if(FESTIVITA_STATO.inCorso)return FESTIVITA_STATO.inCorso;
  FESTIVITA_STATO.inCorso=(async()=>{
    try{
      const {data,error}=await db.from('festivita').select('*').order('data');
      if(error){
        const manca=error.code==='42P01'||error.code==='PGRST205'||/festivita/.test(error.message||'')&&/(does not exist|schema cache|not find)/i.test(error.message||'');
        if(manca){FESTIVITA_STATO.disponibili=false;FESTIVITA_STATO.righe=null;FESTIVITA_STATO.date=null;}
        return FESTIVITA_STATO.righe;
      }
      FESTIVITA_STATO.disponibili=true;FESTIVITA_STATO.righe=data||[];
      FESTIVITA_STATO.date=new Set((data||[]).map(r=>String(r.data).slice(0,10)));
      FESTIVITA_STATO.lette=Date.now();
      return FESTIVITA_STATO.righe;
    }catch(e){return FESTIVITA_STATO.righe;}
    finally{FESTIVITA_STATO.inCorso=null;}
  })();
  return FESTIVITA_STATO.inCorso;
}
async function verificaFestivitaDisponibili(){
  if(FESTIVITA_STATO.disponibili!==null)return FESTIVITA_STATO.disponibili;
  await caricaFestivita(true);
  return FESTIVITA_STATO.disponibili;
}
let _festivitaPredefiniteSet=null;
function dateFestivita(){
  if(FESTIVITA_STATO.date)return FESTIVITA_STATO.date;
  if(!_festivitaPredefiniteSet)_festivitaPredefiniteSet=new Set(FESTIVITA_PREDEFINITE.map(f=>f.data));
  return _festivitaPredefiniteSet;
}
// 'AAAA-MM-GG' o Date → Date a mezzogiorno locale (niente salti per l'ora legale); null se non valida
function dataGiornoLavorativo(x){
  if(x===null||x===undefined||x==='')return null;
  if(x instanceof Date)return isNaN(x)?null:new Date(x.getFullYear(),x.getMonth(),x.getDate(),12);
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(x));
  if(!m)return null;
  const d=new Date(+m[1],+m[2]-1,+m[3],12);
  return isNaN(d)?null:d;
}
function giornoLavorativo(x){
  const d=dataGiornoLavorativo(x);if(!d)return null;
  const dow=d.getDay();
  return dow!==0&&dow!==6&&!dateFestivita().has(dataLocaleISO(d));
}
// Giorni lavorativi DOPO "dal" fino ad "al" compreso; negativo se al < dal.
function giorniLavorativiTra(dal,al){
  const a=dataGiornoLavorativo(dal),b=dataGiornoLavorativo(al);
  if(!a||!b)return null;
  const segno=b<a?-1:1;
  const da=segno>0?a:b,fino=segno>0?b:a;
  let n=0;const g=new Date(da);
  while(true){
    g.setDate(g.getDate()+1);
    if(g>fino)break;
    if(giornoLavorativo(g))n++;
  }
  return segno*n;
}
// La data (AAAA-MM-GG) dopo n giorni lavorativi; n negativo = indietro, 0 = la data stessa.
function aggiungiGgLav(data,n){
  const d=dataGiornoLavorativo(data);const k=parseInt(n,10);
  if(!d||!isFinite(k))return null;
  if(Math.abs(k)>3650)return null;
  const passo=k<0?-1:1;let restano=Math.abs(k);
  while(restano>0){d.setDate(d.getDate()+passo);if(giornoLavorativo(d))restano--;}
  return dataLocaleISO(d);
}

const NAV={
  titolare:[{id:'dashboard',l:'📊 Dashboard'},{id:'decisioni',l:'⚖️ Decisioni'},{id:'calendario',l:'📅 Calendario'},{id:'trattative',l:'🎯 Lead'},{id:'progetti-da-preventivare',l:'📐 Da preventivare'},{id:'preventivi-titolare',l:'🧾 Preventivi'},{id:'commesse',l:'📁 Commesse'},{id:'ore-cantiere',l:'⏱️ Ore cantiere'},{id:'richieste-acquisto',l:'🛒 Richieste di acquisto'},{id:'gare',l:'🏛️ Gare'},{id:'piano-mensile',l:'📋 Piano mensile'},{id:'presidi',l:'🧯 Presidi'},{id:'workflow',l:'📋 Da gestire'},{id:'interventi',l:'🔧 Interventi'},{id:'clienti',l:'🧍‍♂️ Clienti'},{id:'documenti',l:'📄 Documenti'},{id:'fatture',l:'💰 Fatture'},{id:'catalogo',l:'📦 Catalogo'},{id:'team-subappalti',l:'🦺 Team e subappalti'},{id:'impostazioni',l:'Impostazioni'},{id:'info',l:'ℹ️ Info'}],
  capo_tecnico:[{id:'dashboard',l:'📊 Dashboard'},{id:'calendario',l:'📅 Calendario'},{id:'calendario-team',l:'👥 Calendari team'},{id:'piano-mensile',l:'📋 Piano mensile'},{id:'commesse',l:'📁 Commesse'},{id:'ore-cantiere',l:'⏱️ Ore cantiere'},{id:'richieste-acquisto',l:'🛒 Richieste di acquisto'},{id:'presidi',l:'🧯 Presidi'},{id:'interventi',l:'Interventi'},{id:'tecnico',l:'📝 Esegui intervento'},{id:'clienti',l:' 🧍‍♂️ Clienti'},{id:'documenti',l:'Documenti'},{id:'team-subappalti',l:'🦺 Team e subappalti'},{id:'info',l:'ℹ️ Info'}],
  segreteria:[{id:'dashboard',l:'📊 Dashboard'},{id:'calendario',l:'📅 Calendario'},{id:'workflow',l:'📋 Da gestire'},{id:'commesse',l:'📁 Commesse'},{id:'richieste-acquisto',l:'🛒 Richieste di acquisto'},{id:'gare',l:'🏛️ Gare'},{id:'presidi',l:'🧯 Presidi'},{id:'interventi',l:'🔧 Interventi'},{id:'clienti',l:'🧍‍♂️ Clienti'},{id:'documenti',l:'📄 Documenti'},{id:'team-subappalti',l:'🦺 Team e subappalti'},{id:'fatture',l:'💰 Fatture'},{id:'catalogo',l:'📦 Catalogo'},{id:'info',l:'ℹ️ Info'}],
  contabile:[{id:'dashboard',l:'📊 Dashboard'},{id:'workflow',l:'📅 Da fatturare'},{id:'fatture',l:'💰 Fatture'},{id:'documenti',l:'Documenti'},{id:'catalogo',l:'📦 Catalogo'},{id:'info',l:'ℹ️ Info'}],
  tecnico:[{id:'dashboard',l:'📊 Dashboard'},{id:'calendario-tec',l:'📅 Il mio calendario'},{id:'tecnico',l:'📝 Esegui intervento'},{id:'presidi',l:'🧯 Presidi'},{id:'documenti',l:'Documenti'},{id:'info',l:'ℹ️ Info'}],
  commerciale:[{id:'dashboard',l:'📊 Dashboard'},{id:'progetti-da-preventivare',l:'📐 Da preventivare'},{id:'preventivi',l:'🧾 Preventivi'},{id:'commesse',l:'📁 Commesse'},{id:'richieste-acquisto',l:'🛒 Richieste di acquisto'},{id:'gare',l:'🏛️ Gare'},{id:'fornitori',l:'🏭 Fornitori'},{id:'clienti',l:' 🧍‍♂️ Clienti'},{id:'documenti',l:'📄 Documenti'},{id:'fatture',l:'💰 Fatture'},{id:'catalogo',l:'📦 Catalogo'}, {id: 'info', l: 'ℹ️ Info'}],
  rappresentante:[{id:'dashboard-rapp',l:'📊 Dashboard'},{id:'calendario-appuntamenti', l:'📅 Calendario'},{id:'trattative',l:'🎯 Lead e trattative'},{id:'clienti',l:'🧍‍♂️ Clienti'},{id:'preventivi-rapp',l:'🧾 Preventivi'},{id:'commesse',l:'📁 Commesse'},{id:'progetti', l:'📐 Progetti'}, {id:'catalogo',l:'📦 Catalogo'}, {id:'info',l:'ℹ️ Info'}],
  ingegnere: [{id: 'dashboard', l: '📊 Dashboard'},{id: 'calendario-ingegnere', l: '📅 Calendario'},{id: 'verifiche-tecniche', l: '🔧 Verifiche'},{id:'clienti',l:'🧍‍♂️ Clienti'},{id:'certificati-ingegnere', l:'📜 Certificati'},{id: 'documenti', l: '📄 Documenti'},{id: 'info', l: 'ℹ️ Info'}],
};


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
  evacuatore_fumi: ['Controllo apertura','Lubrificazione cerniere','Verifica bomboletta CO₂','Verifica scadenza bomboletta CO₂'],
};

const WFS=['firmata','approvata','inviata_cliente','da_fatturare','fatturata'];
const WFL={firmata:'🔴 Firmata dal tecnico',approvata:'🟡 Approvata da segreteria',inviata_cliente:'🟢 Inviata al cliente',da_fatturare:'💜 Da fatturare',fatturata:'✅ Fatturata'};

function ge(id){return document.getElementById(id);}
function v(id){const el=ge(id);return el?el.value:'';}
function toast(msg,type='ok'){const t=ge('toast');t.textContent=msg;t.className='toast on '+type;setTimeout(()=>t.classList.remove('on'),4000);}
// F2.3 — data AAAA-MM-GG nel fuso del dispositivo (ora italiana). Da usare
// al posto di toISOString().split('T')[0], che usa l'ora UTC: tra mezzanotte
// e le 2 darebbe il giorno prima.
function dataLocaleISO(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
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
      // F2.2 — niente riquadro "da riprogrammare" su un intervento nuovo
      var boxRip = ge('mo-riprogrammare'); if(boxRip){ boxRip.style.display='none'; boxRip.innerHTML=''; }
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
function be(e){const m={conforme:'<span class="bx bok">Conforme</span>',conforme_osservazioni:'<span class="bx bwarn">Con osservazioni</span>',non_conforme:'<span class="bx berr">Non conforme</span>',non_conforme_urgente:'<span class="bx berr">URGENTE</span>',non_completato:'<span class="bx berr">Non completato</span>'};return m[e]||`<span class="bx bgray">${e||'—'}</span>`;}
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

async function doLogout(){
  // F14.17: chi esce chiude anche "Entra come" (chi entra dopo è sé stesso)
  try{sessionStorage.removeItem(CHIAVE_ENTRA_COME);}catch(e){}
  // F14.6: le notifiche di questo dispositivo non vanno più a chi esce (js/59)
  if(typeof scollegaDispositivoPush==='function'){try{await scollegaDispositivoPush();}catch(e){}}
  await db.auth.signOut();
  // F14.1: chi entra dopo parte dalla sua dashboard, non dalla scheda
  // dell'utente uscito (#/preventivo/<id> resterebbe nell'indirizzo).
  try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
  location.reload();
}

// F14.6: service worker (sw.js: notifiche). Da F15.11 anche cache dell'app
// e dei dati per l'uso senza rete: lo registra js/19 all'avvio per tutti
// (registraServiceWorkerApp di js/57) e js/59 per le notifiche, sempre con lo
// stesso indirizzo sw.js?v=<versione di pubblica.sh> (indirizzoServiceWorker).
// Restituisce la registrazione pronta, o null (browser senza service worker,
// pagina non https, errore).
function registraServiceWorker(){
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return Promise.resolve(null);
  const indirizzo=typeof indirizzoServiceWorker==='function'?indirizzoServiceWorker():'sw.js';
  return navigator.serviceWorker.register(indirizzo,{scope:'./'})
    .then(function(){return navigator.serviceWorker.ready;})
    .catch(function(e){console.warn('Service worker non registrato:',e&&e.message);return null;});
}

// ── F14.17 — "ENTRA COME" (parte 1: interfaccia) ─────────────────────
// Il titolare (anche l'informatico, che è titolare) sceglie in Impostazioni >
// Team una persona o un ruolo (proposto l'utente di prova di quel ruolo) e il
// gestionale si riavvia con boot(utente reale, utente scelto): ME e ROLE
// diventano la persona scelta, ME_REALE e ROLE_REALE restano il titolare.
// Menu, pagine, filtri del sito e dashboard funzionano così senza toccare i
// ME.id e i ROLE=== del codice. La scelta vive in sessionStorage (solo questa
// scheda del browser: ricaricando si resta "come", chiudendo la scheda si
// torna sé stessi); "Esci" nel banner la toglie e rifà boot con il titolare.
// Entrare e uscire RICARICANO la pagina: così nessun dato già letto come
// titolare (elenchi, cache dei moduli) resta in memoria.
// F14.18 (parte 2): le richieste portano x-agito-come (fetchConAgitoCome in
// cima al file). Con sql/71 eseguito il database risponde come la persona
// (ruolo e "solo i propri"); senza sql/71 risponde ancora al titolare e il
// banner lo dice (verificaEntraComeDatabase). Campanella e notifiche restano
// spente mentre si lavora "come".
let ME_REALE=null,ROLE_REALE=null,ENTRA_COME=null;
const CHIAVE_ENTRA_COME='toli_entra_come';
const RUOLI_ENTRA_COME=['segreteria','contabile','capo_tecnico','tecnico','commerciale','rappresentante','ingegnere'];
function ruoloDelSito(ruolo){return ruolo==='informatico'?'titolare':ruolo;}
// Utente di prova: nome, cognome o email con "prova", "test" o "smoke".
function eUtenteDiProva(u){return /(^|[^a-z])(prova|test|smoke)/i.test([u&&u.nome,u&&u.cognome,u&&u.email].join(' '));}
function idEntraComeSalvato(){try{return sessionStorage.getItem(CHIAVE_ENTRA_COME)||'';}catch(e){return '';}}
// Chi si può impersonare: utente attivo, non sé stessi, non titolare/informatico.
function utenteImpersonabile(reale,u){
  return !!(u&&reale&&u.id!==reale.id&&u.attivo!==false&&RUOLI_ENTRA_COME.includes(u.ruolo));
}
async function utenteEntraComeSalvato(reale){
  const id=idEntraComeSalvato();
  if(!id)return null;
  if(ruoloDelSito(reale.ruolo)!=='titolare')return null;
  const {data,error}=await db.from('utenti').select('*').eq('id',id).maybeSingle();
  if(error){console.warn('Entra come:',error.message);return null;}
  return data||null;
}
// Entra come la persona scelta (id di utenti). Solo il titolare reale.
async function entraCome(idUtente){
  if(ROLE_REALE!=='titolare'||!ME_REALE){toast('Solo il titolare può entrare come un altro utente','err');return;}
  if(!idUtente){toast('Scegli la persona','err');return;}
  const {data:u,error}=await db.from('utenti').select('*').eq('id',idUtente).maybeSingle();
  if(error||!u){toast('Utente non trovato'+(error?': '+error.message:''),'err');return;}
  if(!utenteImpersonabile(ME_REALE,u)){toast('Non puoi entrare come questo utente (non attivo, titolare o sei tu)','err');return;}
  try{sessionStorage.setItem(CHIAVE_ENTRA_COME,u.id);}catch(e){toast('Il browser non permette "Entra come" (memoria della scheda bloccata)','err');return;}
  riavviaGestionale();
}
// "Esci" del banner: torna sé stessi (nuovo boot con il titolare).
function esciDaEntraCome(){
  try{sessionStorage.removeItem(CHIAVE_ENTRA_COME);}catch(e){}
  riavviaGestionale();
}
// Si riparte dalla dashboard (l'indirizzo #/... della scheda aperta si toglie).
function riavviaGestionale(){
  try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
  location.reload();
}
function mostraBannerEntraCome(){
  let b=ge('entra-come-banner');
  document.body.classList.toggle('entra-come-on',!!ENTRA_COME);
  if(!ENTRA_COME){if(b)b.style.display='none';return;}
  if(!b){b=document.createElement('div');b.id='entra-come-banner';b.className='entra-come-banner';b.setAttribute('role','status');document.body.appendChild(b);}
  b.innerHTML=`<span class="ecb-testo">👁️ Stai lavorando come <b>${esc(((ENTRA_COME.nome||'')+' '+(ENTRA_COME.cognome||'')).trim())}</b> · ${esc(etichettaRuolo(ENTRA_COME.ruolo))}<span class="ecb-reale"> (sei ${esc(ME_REALE.nome||'')})</span><span class="ecb-db" id="ecb-db"></span></span><button type="button" class="btn sm" onclick="esciDaEntraCome()">↩️ Esci</button>`;
  b.style.display='flex';
  verificaEntraComeDatabase().then(function(attivo){
    const n=ge('ecb-db');
    if(!n)return;
    n.textContent=attivo?' · il database applica i limiti del ruolo':' · solo il sito: il database risponde ancora a te (titolare)';
    n.title=attivo?'Quello che questa persona non può fare, il database lo rifiuta anche a te. Nel registro risulti tu "come" questa persona.':'Manca l\'aggiornamento del database (sql/71): menu e pagine sono della persona, i dati e i permessi ancora del titolare.';
  });
}
// F14.18: il database applica "Entra come"? Con l'intestazione si chiede a
// ruolo_corrente() (sql/07, c'è sempre): con sql/71 risponde il ruolo della
// persona, senza risponde 'titolare'. Nessuna funzione nuova da cercare.
let ENTRA_COME_DB=null;
async function verificaEntraComeDatabase(){
  if(ENTRA_COME_DB!==null)return ENTRA_COME_DB;
  if(!ENTRA_COME)return false;
  try{
    const {data,error}=await db.rpc('ruolo_corrente');
    ENTRA_COME_DB=!error&&data===ruoloDelSito(ENTRA_COME.ruolo);
  }catch(e){ENTRA_COME_DB=false;}
  return ENTRA_COME_DB;
}
// Riquadro di Impostazioni > Team (lo chiama loadTeam con l'elenco utenti).
let UTENTI_ENTRA_COME=[];
function mostraSelettoreEntraCome(utenti){
  const card=ge('si-entra-come-card');
  if(!card)return;
  if(ROLE_REALE!=='titolare'||ENTRA_COME){card.style.display='none';return;}
  UTENTI_ENTRA_COME=(utenti||[]).filter(u=>utenteImpersonabile(ME_REALE,u));
  card.style.display='';
  const sr=ge('ec-ruolo');
  const ruoli=RUOLI_ENTRA_COME.filter(r=>UTENTI_ENTRA_COME.some(u=>u.ruolo===r));
  const prima=sr.value;
  sr.innerHTML='<option value="">Scegli il ruolo...</option>'+ruoli.map(r=>`<option value="${r}">${esc(etichettaRuolo(r))}</option>`).join('');
  if(prima&&ruoli.includes(prima))sr.value=prima;
  aggiornaPersoneEntraCome();
}
function aggiornaPersoneEntraCome(){
  const sr=ge('ec-ruolo'),su=ge('ec-utente');
  if(!sr||!su)return;
  const r=sr.value;
  const lista=UTENTI_ENTRA_COME.filter(u=>!r||u.ruolo===r)
    .sort((a,b)=>(eUtenteDiProva(b)-eUtenteDiProva(a))||String(a.nome).localeCompare(String(b.nome)));
  su.innerHTML=lista.length?lista.map(u=>`<option value="${u.id}">${esc(u.nome)} ${esc(u.cognome)}${r?'':' · '+esc(etichettaRuolo(u.ruolo))}${eUtenteDiProva(u)?' (utente di prova)':''}</option>`).join(''):'<option value="">Nessun utente attivo</option>';
  // Scelto il ruolo, la prima è l'utente di prova di quel ruolo (se c'è).
  const nota=ge('ec-nota');
  if(nota)nota.textContent=r&&lista.length&&!eUtenteDiProva(lista[0])?'Per questo ruolo non c\'è un utente di prova: entri come una persona vera.':'';
}
function entraComeScelto(){entraCome(v('ec-utente'));}

async function boot(ud,utenteForzato){
  // F14.17: ME_REALE/ROLE_REALE = chi ha fatto il login; ME/ROLE = la persona
  // con cui si lavora (la stessa, oppure quella di "Entra come").
  ME_REALE=ud;ROLE_REALE=ruoloDelSito(ud.ruolo);
  if(utenteForzato===undefined)utenteForzato=await utenteEntraComeSalvato(ud);
  ENTRA_COME=(ROLE_REALE==='titolare'&&utenteImpersonabile(ud,utenteForzato))?utenteForzato:null;
  if(!ENTRA_COME){try{sessionStorage.removeItem(CHIAVE_ENTRA_COME);}catch(e){}}
  const u=ENTRA_COME||ud;
  // L'informatico ha accesso completo, uguale al titolare (decisione di Erika
  // del 23/10, da confermare da Toli in F1.4): unico punto di normalizzazione,
  // così PAGINE_RUOLO, canAccessPage e i controlli ROLE==='titolare' valgono
  // anche per lui. ME.ruolo resta quello vero. Lato DB: sql/07 ruolo_corrente().
  ME=u;ROLE=ruoloDelSito(u.ruolo);
  ge('lp').style.display='none';ge('nav').classList.add('on');ge('app').style.display='block';
  ge('nusr').textContent=esc(ud.nome)+' — Esci';ge('nrole').textContent=ENTRA_COME?'👁️ '+etichettaRuolo(u.ruolo):etichettaRuolo(ud.ruolo);
  mostraBannerEntraCome();
  ge('ddate').textContent=new Date().toLocaleDateString('it-IT',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  buildNav();buildSB();
  // F14.17: lavorando "come" un altro, campanella e notifiche sono spente: il
  // database risponderebbe con gli avvisi e il telefono del titolare (F14.18).
  // F14.5: campanella degli avvisi nel menu (js/58; senza sql/65 non compare)
  if(!ENTRA_COME&&typeof avviaAvvisi==='function')avviaAvvisi();
  // F14.6: notifiche sul telefono degli avvisi urgenti (js/59; senza sql/66
  // o senza configurazione non fa nulla: nessun permesso, nessun service worker)
  if(!ENTRA_COME&&typeof avviaNotifichePush==='function')avviaNotifichePush();
  // F14.20: deleghe del titolare valide ora per chi entra (js/65; senza sql/73 nessuna)
  if(typeof caricaMieDeleghe==='function')caricaMieDeleghe().catch(()=>{});
  const today=dataLocaleISO();const now=new Date();
  ge('tc3').value=today;ge('mo3').value=today;
  ge('tc4').value=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
 // F14.2: regole e soglie (sql/62) in cache per tutti i ruoli; non dà mai errore
 const caricamentiBase = [loadCS(), loadImp(), caricaRegole(true), caricaFestivita(true)];

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

