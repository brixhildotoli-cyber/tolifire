// Caricare dopo 24-scadenze-presidi.js e prima di 19-init.js.
const nuovoControlloPresidio={origine:null,presidio:null,token:null,salvataggio:false};
const modaleNuovoControllo=document.createElement('div');
modaleNuovoControllo.id='m-nuovo-controllo';modaleNuovoControllo.className='mbg';
modaleNuovoControllo.innerHTML='<div class="modal" style="max-width:850px"><div id="nc-contenuto"></div></div>';
document.body.append(modaleNuovoControllo);
async function eseguiNuovoControllo(id) {
  if(nuovoControlloPresidio.salvataggio)return;
  const p=PA.find(r=>r.id===id);if(!p)return;
  openM('m-nuovo-controllo');ge('nc-contenuto').textContent='Caricamento ultima scheda...';
  const richiesta=crypto.randomUUID();nuovoControlloPresidio.richiesta=richiesta;
  try {
    const tabella=p.tipo==='manichetta'?'schede_manichette':'schede_presidi';
    const schede=await leggiSchedeScadenze(tabella,[id]);
    if(nuovoControlloPresidio.richiesta!==richiesta)return;
    schede.sort((a,b)=>String(b.dati?.data_ultimo_controllo||b.data_intervento||'').localeCompare(String(a.dati?.data_ultimo_controllo||a.data_intervento||''))||String(b.creato_il||'').localeCompare(String(a.creato_il||'')));
    const origine=schede[0];
    if(!origine)throw new Error('Nessuna scheda storica disponibile. Apri lo storico e registra prima la scheda di origine.');
    const d=origine.dati||{},manichetta=p.tipo==='manichetta';
    nuovoControlloPresidio.origine=origine;nuovoControlloPresidio.presidio=p;nuovoControlloPresidio.token=crypto.randomUUID();
    const target=manichetta?{anno:new Date().getFullYear(),mese:new Date().getMonth()<6?1:7}:periodoRiportoPresidio(origine);
    const ciclo=manichetta?(d.riferimento_ciclo||'gennaio_luglio'):origine.ciclo;
    ge('nc-contenuto').innerHTML=`<h2>Esegui nuovo controllo</h2><p><b>${esc(p.clienti?.ragione_sociale||'')}</b> · ${esc(p.sede_label||p.ubicazione||'')}<br>${tpl(p.tipo)} · ${esc(p.matricola||'')} · Progressivo ${esc(p.numero_progressivo||'—')}</p>
      <p>X e note provengono dall’ultima scheda. Confermale o modificale dopo il controllo.</p>
      <div class="fr"><div class="f"><label>Anno della cartella di destinazione</label><input id="nc-anno" type="number" min="2020" max="2100" value="${target.anno}"></div>
      <div class="f"><label>Periodo già presente in Vista cartelle</label><select id="nc-ciclo" ${manichetta?'':'disabled'}><option value="gennaio_luglio" ${ciclo==='gennaio_luglio'?'selected':''}>Gennaio–Luglio</option><option value="febbraio_agosto" ${ciclo==='febbraio_agosto'?'selected':''}>Febbraio–Agosto</option></select></div>
      <div class="f"><label>Riferimento della nuova scheda</label><select id="nc-semestre"><option value="1" ${target.mese<7?'selected':''}>Prima verifica del periodo</option><option value="2" ${target.mese>=7?'selected':''}>Seconda verifica del periodo</option></select></div></div>
      <div class="f"><label>Data effettiva dell’intervento *</label><input id="nc-data" type="date"></div>
      ${['porta_rei','uscita_emergenza'].includes(p.tipo)?'<div class="f"><label>Prossimo controllo — 6 mesi</label><input id="nc-prossima" type="date" readonly></div>':'<div class="fr"><div class="f"><label>Prossimo controllo, se noto</label><input id="nc-prossima" type="date"></div><div class="f"><label>Scadenza, data precisa se nota</label><input id="nc-scadenza" type="date" value="'+esc(d.data_scadenza_collaudo||'')+'"></div><div class="f"><label>Scadenza solo anno, se nota</label><input id="nc-anno-scadenza" type="number" min="1900" max="2200" value="'+esc(d.anno_scadenza||'')+'"></div></div>'}
      <div class="f"><label>Stato</label><select id="nc-stato"><option value="">Non compilato</option>${['ok','anomalia','scaduto','fuori_servizio'].map(st=>`<option value="${st}" ${d.stato===st?'selected':''}>${st}</option>`).join('')}</select></div>
      <div class="f"><label>Esito</label><textarea id="nc-esito">${esc(d.esito_verifica||'')}</textarea></div>
      <h3>Controlli</h3><div id="nc-controlli">${htmlControlliScheda(d)}</div>
      <div class="f"><label>Nuovi controlli con esito SI — una voce per riga</label><textarea id="nc-aggiunte"></textarea></div>
      <div class="f"><label>Note / anomalie</label><textarea id="nc-note">${esc(d.note||'')}</textarea></div>
      <div class="f"><label><input id="nc-conferma" type="checkbox"> Ho effettuato il controllo e verificato i dati riportati.</label></div>
      <div id="nc-messaggio" role="status"></div><button class="btn" onclick="closeM('m-nuovo-controllo')">Annulla</button> <button id="nc-salva" class="btn p" onclick="salvaNuovoControlloPresidio()">Salva nuova scheda</button>`;
    if(['porta_rei','uscita_emergenza'].includes(p.tipo))ge('nc-data').addEventListener('input',()=>{ge('nc-prossima').value=aggiungiMesiControllo(v('nc-data'),6)||'';});
  }catch(e){ge('nc-contenuto').textContent=e.message;}
}
async function salvaNuovoControlloPresidio() {
  if(nuovoControlloPresidio.salvataggio)return;
  const {origine,presidio:p}=nuovoControlloPresidio;if(!origine||!p)return;
  const data=v('nc-data'),anno=Number(v('nc-anno')),semestre=Number(v('nc-semestre')),ciclo=v('nc-ciclo');
  const mese=(ciclo==='febbraio_agosto'?[2,8]:[1,7])[semestre-1];
  const manichetta=p.tipo==='manichetta';
  if(!data||!ge('nc-conferma').checked){toast('Inserisci la data effettiva e conferma il controllo.','err');return;}
  if(!Number.isInteger(anno)||anno<2020||anno>2100||![1,2].includes(semestre)||!['gennaio_luglio','febbraio_agosto'].includes(ciclo)){toast('Periodo non valido.','err');return;}
  if(!manichetta&&(anno<Number(origine.anno)||(anno===Number(origine.anno)&&mese<=Number(origine.mese)))){toast('Scegli un riferimento successivo alla scheda precedente.','err');return;}
  const esiti=new Map();ge('nc-controlli').querySelectorAll('.sp-controllo').forEach(el=>esiti.set(el.dataset.voce,el.querySelector('input:checked')?.value||''));
  listaControlliScheda(v('nc-aggiunte')).forEach(voce=>{if(!esiti.has(voce))esiti.set(voce,'SI');});
  const dati={...origine.dati,data_ultimo_controllo:data,data_prossimo_controllo:v('nc-prossima')||null,stato:v('nc-stato')||null,
    esito_verifica:v('nc-esito').trim()||null,note:v('nc-note').trim()||null,fonte_pdf:null,pagina_pdf:null,
    voci_x_si:[...esiti].filter(([,e])=>e==='SI').map(([v])=>v),voci_x_no:[...esiti].filter(([,e])=>e==='NO').map(([v])=>v),voci_x_vuote:[...esiti].filter(([,e])=>!e).map(([v])=>v)};
  if(['porta_rei','uscita_emergenza'].includes(p.tipo))dati.data_prossimo_controllo=aggiungiMesiControllo(data,6);
  else {
    try {dati.anno_scadenza=annoScadenzaManichetta(v('nc-anno-scadenza'));dati.data_scadenza_collaudo=v('nc-scadenza')||null;
      if(dati.anno_scadenza&&dati.data_scadenza_collaudo&&dati.anno_scadenza!==Number(dati.data_scadenza_collaudo.slice(0,4)))throw new Error('Anno e data di scadenza non coincidono.');
    }catch(e){toast(e.message,'err');return;}
  }
  if(manichetta)Object.assign(dati,{riferimento_anno:anno,riferimento_semestre:semestre,riferimento_ciclo:ciclo});
  else Object.assign(dati,{anno_manutenzione:anno,ciclo_manutenzione:ciclo});
  nuovoControlloPresidio.salvataggio=true;ge('nc-salva').disabled=true;
  try {
    const tabella=manichetta?'schede_manichette':'schede_presidi';
    if(!manichetta) {
      const esistenti=await leggiSchedeScadenze(tabella,[p.id]);
      if(esistenti.some(s=>Number(s.anno)===anno&&Number(s.mese)===mese))throw new Error('Esiste già una scheda in questo riferimento. Aprila dallo storico: non è stata sovrascritta.');
    }
    const {data:id,error}=manichetta
      ?await db.rpc('nuovo_intervento_manichetta',{p_origine:origine.id,p_dati:dati,p_data:data,p_token:nuovoControlloPresidio.token})
      :await db.rpc('salva_riporto_presidio',{p_origine:origine.id,p_dati:dati,p_anno:anno,p_mese:mese});
    if(error)throw error;
    // Verifica anche il caso di un inserimento concorrente: la RPC conserva la scheda già presente.
    const {data:salvata,error:erroreLettura}=await db.from(tabella).select('dati').eq('id',id).single();
    if(erroreLettura)throw new Error('Salvataggio eseguito, ma verifica non riuscita. Riapri lo storico prima di riprovare.');
    if(!salvata?.dati||Object.entries(dati).some(([campo,valore])=>confrontaDatiControllo(salvata.dati[campo])!==confrontaDatiControllo(valore)))throw new Error('Il periodo contiene già una scheda salvata da un altro operatore. Aprila dallo storico.');
    closeM('m-nuovo-controllo');toast('Nuova scheda salvata nella cartella '+nomeCicloScheda(ciclo)+' '+anno+'.');
    await loadPresidi();filterP();
  }catch(e){ge('nc-messaggio').textContent=e.message;toast(e.message,'err');}
  finally {nuovoControlloPresidio.salvataggio=false;if(ge('nc-salva'))ge('nc-salva').disabled=false;}
}
// Aggiunge il comando alle schede presenti in Scadenze.
const renderScadenzePrimaNuovoControllo=renderPS;
renderPS=async function(data) {
  await renderScadenzePrimaNuovoControllo(data);
  ge('tc-ps')?.querySelectorAll('button[onclick^="apriSchedaPresidio("]').forEach(btn=>{
    if(btn.parentElement.querySelector('[data-nuovo-controllo]'))return;
    const id=btn.getAttribute('onclick').match(/apriSchedaPresidio\('([^']+)'\)/)?.[1];if(!id)return;
    const nuovo=document.createElement('button');nuovo.className='btn sm p';nuovo.dataset.nuovoControllo=id;
    nuovo.textContent='Esegui nuovo controllo';nuovo.addEventListener('click',()=>eseguiNuovoControllo(id));btn.after(nuovo);
  });
};
// Riutilizza la struttura attuale delle cartelle, con l'ultima scheda di ogni periodo.
let versioneCartelleStoriche=0;
const renderCartellePrimaNuovoControllo=renderPC;
renderPC=async function(data) {
  const versione=++versioneCartelleStoriche;
  const box=ge('pcards');if(!box)return;
  try {
    const [normali,manichette]=await Promise.all([
      leggiSchedeScadenze('schede_presidi',data.filter(p=>p.tipo!=='manichetta').map(p=>p.id)),
      leggiSchedeScadenze('schede_manichette',data.filter(p=>p.tipo==='manichetta').map(p=>p.id))]);
    if(versione!==versioneCartelleStoriche)return;
    const elenco=[];
    for(const p of data) {
      const schede=[...normali,...manichette].filter(s=>s.impianto_id===p.id);
      const periodi=new Map();
      schede.forEach(s=>{
        const d=s.dati||{},anno=s.anno||d.riferimento_anno,ciclo=s.ciclo||d.riferimento_ciclo;
        if(!anno||!ciclo)return;
        const key=JSON.stringify([anno,ciclo]);const prima=periodi.get(key);
        const ordine=x=>String(x.dati?.data_ultimo_controllo||x.data_intervento||'')+'|'+String(x.creato_il||'');
        if(!prima||ordine(s)>ordine(prima))periodi.set(key,s);
      });
      if(!periodi.size){elenco.push(p);continue;}
      for(const s of periodi.values())elenco.push({...p,...s.dati,id:p.id,clienti:p.clienti,sede_label:p.sede_label,
        anno_manutenzione:s.anno||s.dati.riferimento_anno,ciclo_manutenzione:s.ciclo||s.dati.riferimento_ciclo});
    }
    renderCartellePrimaNuovoControllo(elenco);
  }catch(e){if(versione===versioneCartelleStoriche){renderCartellePrimaNuovoControllo(data);toast('Vista storico non aggiornata: '+e.message,'err');}}
};

function confrontaDatiControllo(valore) {
  if(Array.isArray(valore))return '['+valore.map(confrontaDatiControllo).join(',')+']';
  if(valore&&typeof valore==='object')return '{'+Object.keys(valore).sort().map(k=>JSON.stringify(k)+':'+confrontaDatiControllo(valore[k])).join(',')+'}';
  return JSON.stringify(valore);
}
