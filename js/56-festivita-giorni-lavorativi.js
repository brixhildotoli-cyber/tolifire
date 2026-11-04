// ── F14.3 — IMPOSTAZIONI > FESTIVITÀ E GIORNI LAVORATIVI (sql/63) ─────
// Solo titolare (e informatico). Riquadro "📅 Festività e giorni
// lavorativi": elenco dei giorni non lavorativi per anno (oltre a sabato e
// domenica), aggiunta e correzione (RPC salva_festivita), "Togli"
// (togli_festivita), prova del calcolo con aggiungiGgLav/giorniLavorativiTra
// (js/01) e stato del controllo orario (registro controllo_orario_esecuzioni,
// "▶️ Esegui ora" = esegui_controllo_orario). Il database ricontrolla il
// ruolo. Senza sql/63 si vedono le festività predefinite in sola lettura e
// il calcolo usa quelle.

const NOMI_GIORNI_SETTIMANA=['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
function testoGiornoFestivita(iso){
  const d=dataGiornoLavorativo(iso);if(!d)return iso||'';
  return NOMI_GIORNI_SETTIMANA[d.getDay()]+' '+fd(dataLocaleISO(d));
}
function elencoFestivitaAttuale(){
  return (FESTIVITA_STATO.righe||FESTIVITA_PREDEFINITE).map(f=>({...f,data:String(f.data).slice(0,10)}))
    .sort((a,b)=>a.data.localeCompare(b.data));
}

async function mostraFestivitaImpostazioni(){
  const box=ge('si-festivita');if(!box)return;
  const card=ge('si-festivita-card');
  if(ROLE!=='titolare'){if(card)card.style.display='none';return;}
  await caricaFestivita(true);
  const attive=FESTIVITA_STATO.disponibili===true;
  const nota=ge('si-festivita-stato');
  if(nota){
    nota.style.display=attive?'none':'block';
    nota.textContent=FESTIVITA_STATO.disponibili===false
      ?'Il calendario delle festività non è ancora attivo: serve l’aggiornamento del database (sql/63). Intanto i giorni lavorativi si contano con le festività qui sotto (sola lettura).'
      :'Festività non lette (rete?): valgono quelle predefinite. Riprova con ↻.';
  }
  ['fes-data','fes-nome','fes-tipo','fes-nota','fes-salva'].forEach(id=>{const el=ge(id);if(el)el.disabled=!attive;});
  const elenco=elencoFestivitaAttuale();
  const anni={};elenco.forEach(f=>{const a=f.data.slice(0,4);(anni[a]=anni[a]||[]).push(f);});
  const oggi=dataLocaleISO();
  let html='';
  Object.keys(anni).sort().forEach(a=>{
    html+=`<div style="font-size:12px;font-weight:700;margin:12px 0 4px;color:var(--m)">${esc(a)} · ${anni[a].length} giorni</div>`;
    anni[a].forEach(f=>{
      const d=dataGiornoLavorativo(f.data);const weekend=d&&(d.getDay()===0||d.getDay()===6);
      html+=`<div class="festivita-riga" data-data="${esc(f.data)}" style="display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--bo);${f.data<oggi?'opacity:.6':''}">
        <div style="min-width:170px;font-size:13px">${esc(testoGiornoFestivita(f.data))}</div>
        <div style="flex:1 1 160px;font-size:13px"><b>${esc(f.nome)}</b> <span class="bx ${f.tipo==='chiusura'?'bwarn':f.tipo==='patrono'?'bpur':'bblue'}">${esc(TIPI_FESTIVITA[f.tipo]||f.tipo||'')}</span>${weekend?' <span style="font-size:11px;color:var(--m)">(cade nel fine settimana)</span>':''}${f.nota?`<div style="font-size:11px;color:var(--m)">${esc(f.nota)}</div>`:''}</div>
        ${attive?`<div style="display:flex;gap:6px"><button class="btn sm" type="button" title="Correggi" onclick="modificaFestivitaCampo('${esc(f.data)}')">✏️</button><button class="btn sm" type="button" style="color:var(--r)" title="Togli: torna un giorno lavorativo" onclick="togliFestivita('${esc(f.data)}')">🗑️ Togli</button></div>`:''}
      </div>`;
    });
  });
  box.innerHTML=html||'<div class="empty">Nessuna festività</div>';
  // l'elenco parte dal prossimo giorno non lavorativo (quelli passati restano sopra)
  const prossimo=Array.from(box.querySelectorAll('.festivita-riga')).find(r=>r.dataset.data>=oggi);
  if(prossimo)box.scrollTop=Math.max(0,prossimo.offsetTop-box.offsetTop-30);
  provaCalcoloGiorniLavorativi();
  mostraControlloOrario(attive);
}

function modificaFestivitaCampo(data){
  const f=elencoFestivitaAttuale().find(x=>x.data===data);if(!f)return;
  if(ge('fes-data'))ge('fes-data').value=f.data;
  if(ge('fes-nome'))ge('fes-nome').value=f.nome||'';
  if(ge('fes-tipo'))ge('fes-tipo').value=f.tipo||'nazionale';
  if(ge('fes-nota'))ge('fes-nota').value=f.nota||'';
  const n=ge('fes-nome');if(n){n.focus();n.scrollIntoView({block:'center',behavior:'smooth'});}
}

async function salvaFestivita(){
  if(ROLE!=='titolare'){toast('Solo il titolare può cambiare le festività','err');return;}
  if(!(await verificaFestivitaDisponibili())){toast('Il calendario delle festività non è ancora attivo (sql/63)','err');return;}
  const data=v('fes-data'),nome=String(v('fes-nome')||'').trim(),tipo=v('fes-tipo')||'nazionale',nota=String(v('fes-nota')||'').trim();
  if(!data){toast('Indica il giorno','err');return;}
  if(nome.length<2){toast('Scrivi il nome (es. Chiusura estiva)','err');return;}
  const esiste=elencoFestivitaAttuale().some(f=>f.data===data);
  const bt=ge('fes-salva');if(bt)bt.disabled=true;
  try{
    const {error}=await db.rpc('salva_festivita',{p_data:data,p_nome:nome,p_tipo:tipo,p_nota:nota||null});
    if(error)throw error;
    toast(esiste?'Festività corretta ✓':'Giorno non lavorativo aggiunto ✓','ok');
    ['fes-data','fes-nome','fes-nota'].forEach(id=>{const el=ge(id);if(el)el.value='';});
    if(ge('fes-tipo'))ge('fes-tipo').value='nazionale';
  }catch(e){toast('Non salvata: '+(e.message||e),'err');}
  finally{if(bt)bt.disabled=false;}
  await mostraFestivitaImpostazioni();
}

async function togliFestivita(data){
  if(ROLE!=='titolare'){toast('Solo il titolare può cambiare le festività','err');return;}
  const f=elencoFestivitaAttuale().find(x=>x.data===data);
  if(!confirm('Togliere '+(f?f.nome+' ('+testoGiornoFestivita(data)+')':data)+' dalle festività?\nSe è dal lunedì al venerdì torna un giorno lavorativo per tutti i conteggi.'))return;
  try{
    const {error}=await db.rpc('togli_festivita',{p_data:data});
    if(error)throw error;
    toast('Festività tolta ✓','ok');
  }catch(e){toast('Non tolta: '+(e.message||e),'err');}
  await mostraFestivitaImpostazioni();
}

// Prova del calcolo (stessa regola delle funzioni del database)
function provaCalcoloGiorniLavorativi(){
  const out=ge('fes-prova-esito');if(!out)return;
  const da=v('fes-prova-data'),n=parseInt(v('fes-prova-gg'),10);
  if(!da||!isFinite(n)){out.innerHTML='';return;}
  if(Math.abs(n)>3650){out.innerHTML='<span style="color:var(--r)">Massimo 3650 giorni lavorativi</span>';return;}
  const ris=aggiungiGgLav(da,n);if(!ris){out.innerHTML='';return;}
  // giorni saltati (fine settimana e festività) tra le due date
  const saltati=[];const passo=n<0?-1:1;const g=dataGiornoLavorativo(da);
  for(let i=0;i<4000&&dataLocaleISO(g)!==ris;i++){
    g.setDate(g.getDate()+passo);const iso=dataLocaleISO(g);
    if(dateFestivita().has(iso)){const f=elencoFestivitaAttuale().find(x=>x.data===iso);saltati.push(fd(iso)+' '+(f?f.nome:''));}
  }
  out.innerHTML=`<b>${esc(testoGiornoFestivita(ris))}</b> · ${n>=0?'+':''}${n} giorni lavorativi da ${esc(testoGiornoFestivita(da))}`+
    (saltati.length?`<div style="font-size:12px;color:var(--m)">Festività saltate: ${esc(saltati.join(', '))}</div>`:'');
}

// Controllo orario: ultime esecuzioni (solo titolare, sql/63)
async function mostraControlloOrario(attive){
  const box=ge('si-controllo-orario');if(!box)return;
  const bt=ge('fes-esegui-ora');if(bt)bt.disabled=!attive;
  if(!attive){box.innerHTML='<div style="font-size:12px;color:var(--m)">Il controllo orario parte con l’aggiornamento del database (sql/63).</div>';return;}
  try{
    const {data,error}=await db.from('controllo_orario_esecuzioni').select('origine,iniziata_il,finita_il,esito,avvisi,messaggio,lanciata_da_nome').order('iniziata_il',{ascending:false}).limit(5);
    if(error)throw error;
    if(!data||!data.length){box.innerHTML='<div style="font-size:12px;color:var(--m)">Nessuna esecuzione ancora: la prima arriva al prossimo cambio d’ora.</div>';return;}
    const ORIGINI={pg_cron:'automatico (ogni ora)',n8n:'automatico (n8n)',manuale:'a mano'};
    const ultima=data[0];const ore=(Date.now()-new Date(ultima.iniziata_il).getTime())/3600000;
    const avviso=ore>2?`<div class="al2 w">L’ultimo controllo è di più di 2 ore fa: il controllo automatico potrebbe essere fermo. Avvisa la programmatrice.</div>`:'';
    box.innerHTML=avviso+data.map(r=>`<div style="font-size:12px;padding:3px 0">${r.esito==='ok'?'✅':r.esito==='errore'?'❌':'⏭️'} ${esc(quandoRegola(r.iniziata_il))} · ${esc(ORIGINI[r.origine]||r.origine)}${r.lanciata_da_nome?' ('+esc(r.lanciata_da_nome)+')':''} · avvisi: ${r.avvisi??0}${r.messaggio?` · <span style="color:var(--r)">${esc(r.messaggio)}</span>`:''}</div>`).join('');
  }catch(e){box.innerHTML='<div style="font-size:12px;color:var(--m)">Registro del controllo orario non letto.</div>';}
}

async function eseguiControlloOrarioOra(){
  if(ROLE!=='titolare'){toast('Solo il titolare','err');return;}
  if(!(await verificaFestivitaDisponibili())){toast('Il controllo orario non è ancora attivo (sql/63)','err');return;}
  const bt=ge('fes-esegui-ora');if(bt)bt.disabled=true;
  try{
    const {data,error}=await db.rpc('esegui_controllo_orario',{p_origine:'manuale'});
    if(error)throw error;
    if(data&&data.esito==='errore')toast('Controllo eseguito con errore: '+(data.messaggio||''),'err');
    else toast('Controllo eseguito ✓ (avvisi: '+((data&&data.avvisi)||0)+')','ok');
  }catch(e){toast('Controllo non eseguito: '+(e.message||e),'err');}
  finally{if(bt)bt.disabled=false;}
  mostraControlloOrario(true);
}
