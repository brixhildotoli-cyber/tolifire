// Caricare dopo 23-elimina-sottosezioni.js e prima di 19-init.js.
function aggiungiMesiControllo(iso, mesi) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  const [a,m,g] = iso.split('-').map(Number);
  const fine = new Date(a,m-1+mesi+1,0).getDate();
  const d = new Date(a,m-1+mesi,Math.min(g,fine));
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function oggiScadenze() {
  const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function chiediRiferimentoManichette() {
  const anno=prompt('Anno di riferimento dello storico:',String(new Date().getFullYear()));
  if(anno===null)return null;
  const ciclo=prompt('Gruppo fisso: 1 = Gennaio–Luglio; 2 = Febbraio–Agosto','1');
  if(ciclo===null)return null;
  const semestre=prompt('Semestre di riferimento: 1 oppure 2','1');
  if(semestre===null)return null;
  if(!/^\d{4}$/.test(anno)||Number(anno)<1900||Number(anno)>2200||!['1','2'].includes(ciclo)||!['1','2'].includes(semestre)) {
    toast('Anno, gruppo o semestre non validi.','err');return null;
  }
  return {riferimento_anno:Number(anno),riferimento_ciclo:ciclo==='1'?'gennaio_luglio':'febbraio_agosto',riferimento_semestre:Number(semestre)};
}
const periodoPrimaScadenze=periodoScheda;
periodoScheda=function(s) {
  if(s.dati?.tipo!=='manichetta')return periodoPrimaScadenze(s);
  const d=s.dati;
  return d.riferimento_anno && d.riferimento_semestre
    ? `${nomeCicloScheda(d.riferimento_ciclo)} · ${d.riferimento_semestre}° semestre ${d.riferimento_anno}`
    : 'Periodo da assegnare'+(s.data_intervento?' · '+fd(s.data_intervento):'');
};
const mostraStoricoPrimaScadenze=mostraStoricoPresidio;
mostraStoricoPresidio=function() {
  mostraStoricoPrimaScadenze();
  if(storicoPresidi.anagrafica?.tipo==='manichetta') {
    const box=ge('storico-presidio');
    const p=box?.querySelector('p');
    if(p)p.textContent='Schede divise per semestre. La scadenza è distinta dalla data dell’intervento. Le schede senza periodo restano da assegnare.';
    if(box?.querySelector('h3'))box.querySelector('h3').textContent='Schede semestrali manichetta';
    // Ordina e raggruppa le schede senza modificare i record.
    const cards=[...box.querySelectorAll(':scope > .card')];
    const gruppi=new Map();
    cards.forEach(card=>{
      const periodo=card.querySelector('b')?.textContent||'Periodo da assegnare';
      if(!gruppi.has(periodo))gruppi.set(periodo,[]);
      gruppi.get(periodo).push(card);
    });
    for(const [titolo,items] of gruppi) {
      const gruppo=document.createElement('details');gruppo.open=true;
      const summary=document.createElement('summary');summary.textContent=titolo;gruppo.append(summary);
      items.forEach(card=>gruppo.append(card));box.append(gruppo);
    }
  }
};
const editorPrimaScadenze=apriEditorSchedaPresidio;
apriEditorSchedaPresidio=function(indice,riporta) {
  editorPrimaScadenze(indice,riporta);
  const s=storicoPresidi.schede[indice];if(!s)return;
  const d=s.dati||{};
  if(['porta_rei','uscita_emergenza'].includes(d.tipo)) {
    const data=ge('sp-data'),prossima=ge('sp-prossima');
    if(data&&prossima){
      prossima.readOnly=true;
      const aggiorna=()=>{prossima.value=aggiungiMesiControllo(data.value,6)||'';};
      data.addEventListener('input',aggiorna);aggiorna();
    }
  }
  if(d.tipo!=='manichetta')return;
  const a=d.riferimento_anno||new Date().getFullYear();
  const c=d.riferimento_ciclo||'gennaio_luglio';
  const sem=d.riferimento_semestre||1;
  const next=riporta&&d.riferimento_anno?{anno:a+(sem===2?1:0),semestre:sem===1?2:1}:{anno:a,semestre:sem};
  ge('sp-data').closest('.f').insertAdjacentHTML('beforebegin',`<div class="fr">
    <div class="f"><label>Anno di riferimento</label><input id="sc-anno" type="number" min="1900" max="2200" value="${next.anno}"></div>
    <div class="f"><label>Gruppo fisso</label><select id="sc-ciclo"><option value="gennaio_luglio" ${c==='gennaio_luglio'?'selected':''}>Gennaio–Luglio</option><option value="febbraio_agosto" ${c==='febbraio_agosto'?'selected':''}>Febbraio–Agosto</option></select></div>
    <div class="f"><label>Semestre</label><select id="sc-semestre"><option value="1" ${next.semestre===1?'selected':''}>1° semestre</option><option value="2" ${next.semestre===2?'selected':''}>2° semestre</option></select></div></div>`);
};
const salvaPrimaScadenze=salvaSchedaPresidio;
salvaSchedaPresidio=async function(indice,riporta) {
  const s=storicoPresidi.schede[indice];if(!s)return;
  if(['porta_rei','uscita_emergenza'].includes(s.dati?.tipo)&&ge('sp-prossima'))
    ge('sp-prossima').value=aggiungiMesiControllo(v('sp-data'),6)||'';
  if(s.dati?.tipo!=='manichetta')return salvaPrimaScadenze(indice,riporta);
  const anno=Number(v('sc-anno')),semestre=Number(v('sc-semestre')),ciclo=v('sc-ciclo');
  if(!Number.isInteger(anno)||anno<1900||anno>2200||![1,2].includes(semestre)||!['gennaio_luglio','febbraio_agosto'].includes(ciclo)) {
    toast('Indica un periodo valido.','err');return;
  }
  const originale=s.dati;
  s.dati={...originale,riferimento_anno:anno,riferimento_semestre:semestre,riferimento_ciclo:ciclo};
  try {await salvaPrimaScadenze(indice,riporta);}finally{s.dati=originale;}
};
const registraPrimaScadenze=registraSchedaGiaCaricata;
registraSchedaGiaCaricata=async function() {
  const p=storicoPresidi.anagrafica;
  if(p?.tipo!=='manichetta')return registraPrimaScadenze();
  if(!gestisceStoricoPresidi())return;
  const ref=chiediRiferimentoManichette();if(!ref)return;
  const {error}=await db.from('schede_manichette').insert({impianto_id:p.id,data_intervento:p.data_ultimo_controllo||null,
    chiave_import:'anagrafica-semestre:'+JSON.stringify(ref),dati:{...p,...ref}});
  if(error&&error.code!=='23505'){toast(error.message,'err');return;}
  toast(error?'Scheda già registrata: conservata.':'Scheda semestrale registrata.');
  await caricaStoricoPresidio(p.id);
};
let versioneScadenze=0;
const cartelleScadenzeAperte=new Set();
function conservaCartelleScadenze(box) {
  box.querySelectorAll('details[data-cartella-scadenze]').forEach(el=>{
    const chiave=el.dataset.cartellaScadenze;
    if(el.open)cartelleScadenzeAperte.add(chiave);
    else cartelleScadenzeAperte.delete(chiave);
  });
}
function collegaCartelleScadenze(box) {
  box.querySelectorAll('details[data-cartella-scadenze]').forEach(el=>{
    el.addEventListener('toggle',()=>{
      if(!el.isConnected)return;
      const chiave=el.dataset.cartellaScadenze;
      if(el.open)cartelleScadenzeAperte.add(chiave);
      else cartelleScadenzeAperte.delete(chiave);
    });
  });
}
async function leggiSchedeScadenze(tabella,ids) {
  const risultato=[];
  for(let i=0;i<ids.length;i+=100) {
    for(let offset=0;;offset+=500) {
      const {data,error}=await db.from(tabella).select('*').in('impianto_id',ids.slice(i,i+100))
        .order('id').range(offset,offset+499);
      if(error)throw error;
      risultato.push(...(data||[]));if((data||[]).length<500)break;
    }
  }
  return risultato;
}
renderPS=async function(data) {
    ricordaPosizionePagina();
  const versione=++versioneScadenze,box=ge('tc-ps');if(!box)return;
  conservaCartelleScadenze(box);
  box.innerHTML='<div class="load">Caricamento scadenze...</div>';
  try {
    const [normali,manichette]=await Promise.all([
      leggiSchedeScadenze('schede_presidi',data.filter(p=>p.tipo!=='manichetta').map(p=>p.id)),
      leggiSchedeScadenze('schede_manichette',data.filter(p=>p.tipo==='manichetta').map(p=>p.id))]);
    if(versione!==versioneScadenze)return;
    const schede=[...normali,...manichette],righe=[];
    for(const p of data) {
      // Una scheda senza data non sostituisce una verifica effettivamente datata.
      const ultime=schede.filter(s=>s.impianto_id===p.id).sort((a,b)=>
        String(b.dati?.data_ultimo_controllo||b.data_intervento||'').localeCompare(String(a.dati?.data_ultimo_controllo||a.data_intervento||''))||
        String(b.aggiornato_il||b.creato_il||'').localeCompare(String(a.aggiornato_il||a.creato_il||'')));
      const scheda=ultime[0];
      const dataStorica=scheda?.dati?.data_ultimo_controllo||scheda?.data_intervento||'';
      const dati=p.data_ultimo_controllo&&p.data_ultimo_controllo>dataStorica?p:(scheda?.dati||p);
      const verifica=dati.data_ultimo_controllo||(dati===scheda?.dati?scheda?.data_intervento:null);
      if(['porta_rei','uscita_emergenza'].includes(p.tipo)) {
        righe.push({p,label:'Prossimo controllo',data:aggiungiMesiControllo(verifica,6),anno:null});
      } else {
        if(dati.data_prossimo_controllo)righe.push({p,label:'Prossimo controllo',data:dati.data_prossimo_controllo,anno:null});
        righe.push({p,label:'Scadenza',data:dati.data_scadenza_collaudo||null,anno:dati.anno_scadenza||null});
      }
    }
    const oggi=oggiScadenze(),limite=aggiungiGiorniScadenze(oggi,30);
    const gruppi=[['Scaduti',r=>r.data?r.data<oggi:r.anno?Number(r.anno)<Number(oggi.slice(0,4)):false],
      ['Entro 30 giorni',r=>r.data&&r.data>=oggi&&r.data<=limite],
      ['Scadenze successive',r=>r.data&&r.data>limite],
      ['Solo anno — data da precisare',r=>!r.data&&r.anno&&Number(r.anno)>=Number(oggi.slice(0,4))],
      ['Scadenza da inserire',r=>!r.data&&!r.anno]];
    const card=r=>`<div class="card" style="margin-top:8px"><b>${esc(r.p.clienti?.ragione_sociale||'—')}</b>
      <div>${esc(r.p.sede_label||r.p.ubicazione||'Sede da indicare')}</div><div>${tpl(r.p.tipo)} · ${esc(r.p.matricola||'—')} · Progressivo ${esc(r.p.numero_progressivo||'—')}</div>
      <div>${esc(r.label)}: <b>${r.data?fd(r.data):r.anno?esc(String(r.anno))+' — data da precisare':'Non indicata'}</b></div>
      <button class="btn sm" onclick="apriSchedaPresidio('${esc(r.p.id)}')">Apri scheda / storico</button></div>`;
    const clienti=new Map();
    righe.forEach(r=>{
      // L'ID evita di unire clienti omonimi.
      const chiave=r.p.cliente_id||('presidio:'+r.p.id);
      if(!clienti.has(chiave))clienti.set(chiave,[]);
      clienti.get(chiave).push(r);
    });
    const riepilogo=items=>{
      const controlli=items.filter(r=>r.label==='Prossimo controllo'&&r.data).map(r=>r.data).sort();
      const scadenze=items.filter(r=>r.data).map(r=>r.data).sort();
      const anni=items.filter(r=>!r.data&&r.anno).map(r=>Number(r.anno)).sort((a,b)=>a-b);
      const prossima=controlli[0];
      const testo=prossima?'Prossimo controllo: '+fd(prossima):scadenze.length?'Scadenza: '+fd(scadenze[0]):anni.length?'Scadenza: '+anni[0]+' — data da precisare':'Scadenza da inserire';
      const scadute=items.filter(r=>r.data?r.data<oggi:r.anno&&Number(r.anno)<Number(oggi.slice(0,4))).length;
      return esc(testo)+(scadute?' · '+scadute+' scadenze superate':'');
    };
    const contenuto=items=>gruppi.map(([titolo,test])=>{
      const elenco=items.filter(test).sort((a,b)=>String(a.data||a.anno||'').localeCompare(String(b.data||b.anno||'')));
      return elenco.length?`<div style="margin-top:14px"><b>${titolo} (${elenco.length})</b>${elenco.map(card).join('')}</div>`:'';
    }).join('');
    const cartelle=[...clienti.values()].sort((a,b)=>
      String(a[0].p.clienti?.ragione_sociale||'').localeCompare(String(b[0].p.clienti?.ragione_sociale||''),'it'));
    box.innerHTML='<p>Apri una cartella cliente per vedere le schede. Il prossimo controllo mostra la prima data da gestire, comprese quelle già superate.</p>'+
      (cartelle.length?cartelle.map(items=>{
        const sedi=new Map();
        items.forEach(r=>{
          const chiave=r.p.sede_id||'senza-sede';
          if(!sedi.has(chiave))sedi.set(chiave,[]);
          sedi.get(chiave).push(r);
        });
        const count=new Set(items.map(r=>r.p.id)).size;
        const chiaveCliente=JSON.stringify(['cliente',items[0].p.cliente_id||('presidio:'+items[0].p.id)]);
        const attributiCartella=chiave=>`data-cartella-scadenze="${esc(chiave)}" ${cartelleScadenzeAperte.has(chiave)?'open':''}`;
        return `<details ${attributiCartella(chiaveCliente)} class="card" style="margin-bottom:12px"><summary style="cursor:pointer"><b>📁 ${esc(items[0].p.clienti?.ragione_sociale||'Cliente non indicato')}</b>
          <div style="margin-top:5px">${riepilogo(items)} · ${count} presidi</div></summary>
          ${[...sedi.values()].map(elenco=>`<details ${attributiCartella(JSON.stringify(['sede',chiaveCliente,elenco[0].p.sede_id||'senza-sede']))} style="margin-top:12px;padding:10px;border:1px solid var(--bo);border-radius:8px"><summary style="cursor:pointer"><b>📍 ${esc(elenco[0].p.sede_label||'Sede non assegnata')}</b><div>${riepilogo(elenco)}</div></summary>${contenuto(elenco)}</details>`).join('')}
        </details>`;
      }).join(''):'<div class="empty">Nessun presidio.</div>');
    collegaCartelleScadenze(box);
  } catch(e) {if(versione===versioneScadenze)box.textContent='Impossibile leggere le scadenze: '+e.message;}
};
function aggiungiGiorniScadenze(iso,n) {
  const [a,m,g]=iso.split('-').map(Number),d=new Date(a,m-1,g+n);
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
const filterPrimaScadenze=filterP;
filterP=function(){filterPrimaScadenze();renderPS(PF);};
const caricaStoricoPrimaScadenze=caricaStoricoPresidio;
caricaStoricoPresidio=async function(id){await caricaStoricoPrimaScadenze(id);renderPS(typeof PF!=='undefined'?PF:PA);};
