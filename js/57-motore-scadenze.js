// ── F14.4 — IMPOSTAZIONI > SCADENZE: CHI AVVISARE E QUANDO (sql/64) ───
// Solo titolare (e informatico). Motore unico delle scadenze: una riga di
// regole_scadenze per scadenza (evento, oggetto, tempo, destinatario per
// ruolo, risalita a chi e dopo quanto, urgente, attiva). Il controllo
// orario (genera_avvisi_scadenza, sql/63-64) legge solo queste righe.
// Il tempo collegato a una regola di sql/62 è lo stesso valore di
// Impostazioni > Regole (salva_regola_scadenza lo passa a salva_regola).
// Sotto: scadenze aperte (promemoria e risalite segnati), promemoria di
// prova (crea_scadenza_prova / chiudi_scadenza_prova), "↻ Ricalcola"
// (aggiorna_scadenze) e "▶️ Esegui controllo ora" (esegui_controllo_orario).
// Il database ricontrolla il ruolo. Senza sql/64 il riquadro dice "non
// ancora attivo". Le fonti di js/46 restano come conteggio finché ogni
// modulo non passa al motore.

const MOTORE_SCADENZE={disponibili:null,righe:[],aperte:[],utenti:{}};
const UNITA_SCADENZE=['minuti','ore','ore_lav','giorni','giorni_lav'];
const RUOLI_SCADENZE=['titolare','segreteria','capo_tecnico','commerciale','rappresentante','tecnico','ingegnere','contabile'];
const FONTI_SCADENZE={
  progetto_da_integrare:{testo:'collegata: progetti da integrare',classe:'bok'},
  modulo:{testo:'in attesa del modulo',classe:'bgray'}
};

function erroreTabellaMancante(error,nome){
  if(!error)return false;
  const m=String(error.message||'');
  return error.code==='42P01'||error.code==='PGRST205'||(m.includes(nome)&&/(does not exist|schema cache|not find)/i.test(m));
}

async function verificaMotoreScadenzeDisponibili(){
  if(MOTORE_SCADENZE.disponibili!==null)return MOTORE_SCADENZE.disponibili;
  try{
    const {error}=await db.from('regole_scadenze').select('codice').limit(1);
    if(error){if(erroreTabellaMancante(error,'regole_scadenze'))MOTORE_SCADENZE.disponibili=false;return MOTORE_SCADENZE.disponibili;}
    MOTORE_SCADENZE.disponibili=true;
  }catch(e){}
  return MOTORE_SCADENZE.disponibili;
}

function opzioniRuoliScadenza(scelto,conNessuno){
  return (conNessuno?`<option value=""${!scelto?' selected':''}>Nessuna risalita</option>`:'')+
    RUOLI_SCADENZE.map(r=>`<option value="${r}"${r===scelto?' selected':''}>${esc(etichettaRuolo(r))}</option>`).join('');
}
function opzioniUnitaScadenza(scelta){
  return UNITA_SCADENZE.map(u=>`<option value="${u}"${u===scelta?' selected':''}>${esc(UNITA_REGOLE[u]||u)}</option>`).join('');
}
function unitaRegolaCollegata(chiave){
  const r=REGOLE_STATO.righe&&REGOLE_STATO.righe[chiave];const p=regolaPredefinita(chiave);
  return (r&&r.unita)||(p&&p.unita)||'';
}
// Tempo effettivo di una riga (dalla regola di sql/62 se collegata)
function tempoRigaScadenza(r){
  if(r.tempo_regola)return {valore:leggiRegolaSubito(r.tempo_regola),unita:unitaRegolaCollegata(r.tempo_regola),regola:r.tempo_regola};
  return {valore:numeroRegola(r.tempo_valore),unita:r.tempo_unita,regola:null};
}
function risalitaRigaScadenza(r){
  if(!r.risalita_ruolo)return {ruolo:null,valore:null,unita:'giorni_lav',regola:null};
  if(r.risalita_regola)return {ruolo:r.risalita_ruolo,valore:leggiRegolaSubito(r.risalita_regola),unita:unitaRegolaCollegata(r.risalita_regola),regola:r.risalita_regola};
  return {ruolo:r.risalita_ruolo,valore:numeroRegola(r.risalita_valore),unita:r.risalita_unita,regola:null};
}
function testoTempoScadenza(valore,unita){return testoValoreRegola(valore,unita);}

async function mostraMotoreScadenzeImpostazioni(){
  const box=ge('si-scadenze');if(!box)return;
  const card=ge('si-scadenze-card');
  if(ROLE!=='titolare'){if(card)card.style.display='none';return;}
  MOTORE_SCADENZE.disponibili=null;
  const attivo=await verificaMotoreScadenzeDisponibili();
  const nota=ge('si-scadenze-stato');
  const parti=['si-scadenze-attivo'];
  if(attivo!==true){
    if(nota){
      nota.style.display='block';
      nota.textContent=attivo===false
        ?'Il motore delle scadenze non è ancora attivo: serve l’aggiornamento del database (sql/64). Intanto i promemoria restano quelli di oggi (Cosa tocca a me e i riquadri della dashboard).'
        :'Scadenze non lette (rete?). Riprova con ↻.';
    }
    parti.forEach(id=>{const el=ge(id);if(el)el.style.display='none';});
    box.innerHTML='';
    return;
  }
  if(nota)nota.style.display='none';
  parti.forEach(id=>{const el=ge(id);if(el)el.style.display='block';});
  await caricaRegole(true);
  const {data,error}=await db.from('regole_scadenze').select('*').order('gruppo').order('ordine');
  if(error){box.innerHTML=`<div class="al2 w">Righe non lette: ${esc(error.message)}</div>`;return;}
  const gruppi=Object.keys(GRUPPI_REGOLE);
  MOTORE_SCADENZE.righe=(data||[]).sort((a,b)=>{
    const ga=gruppi.indexOf(a.gruppo),gb=gruppi.indexOf(b.gruppo);
    return (ga<0?99:ga)-(gb<0?99:gb)||(a.ordine||0)-(b.ordine||0);
  });
  let gruppo=null,html='';
  MOTORE_SCADENZE.righe.forEach(r=>{
    if(r.gruppo!==gruppo){gruppo=r.gruppo;html+=`<div style="font-size:12px;font-weight:700;margin:14px 0 6px;color:var(--m)">${esc(GRUPPI_REGOLE[gruppo]||gruppo)}</div>`;}
    html+=htmlRigaScadenza(r);
  });
  box.innerHTML=html||'<div class="empty">Nessuna scadenza</div>';
  const sel=ge('sp-regola');
  if(sel){
    const prima=sel.value;
    sel.innerHTML=MOTORE_SCADENZE.righe.map(r=>`<option value="${esc(r.codice)}">${esc(r.nome)}</option>`).join('');
    sel.value=prima&&MOTORE_SCADENZE.righe.some(r=>r.codice===prima)?prima:'integrazione_venditore';
    if(!sel.value&&MOTORE_SCADENZE.righe[0])sel.value=MOTORE_SCADENZE.righe[0].codice;
  }
  const ini=ge('sp-inizio');if(ini&&!ini.value)ini.value=dataLocaleISO()+'T09:00';
  await mostraScadenzeAperte();
}

function htmlRigaScadenza(r){
  const c=esc(r.codice);
  const t=tempoRigaScadenza(r),ri=risalitaRigaScadenza(r);
  const fonte=FONTI_SCADENZE[r.fonte]||{testo:r.fonte,classe:'bgray'};
  const tempoUnita=t.regola
    ?`<span style="font-size:12px" title="Stesso valore della regola ${esc(t.regola)} in Regole">${esc(UNITA_REGOLE[t.unita]||t.unita)} · 📏</span>`
    :`<select id="rs-tu-${c}" style="width:auto">${opzioniUnitaScadenza(t.unita)}</select>`;
  const risUnita=ri.regola
    ?`<span style="font-size:12px" title="Stesso valore della regola ${esc(ri.regola)} in Regole">${esc(UNITA_REGOLE[ri.unita]||ri.unita)} · 📏</span>`
    :`<select id="rs-ru-${c}" style="width:auto">${opzioniUnitaScadenza(ri.unita||'giorni_lav')}</select>`;
  return `<div class="scadenza-riga" style="padding:10px 0;border-bottom:1px solid var(--bo);${r.attiva?'':'opacity:.65'}">
    <div style="font-size:13px"><b>${esc(r.nome)}</b>
      <span class="bx ${fonte.classe}">${esc(fonte.testo)}</span>
      ${r.urgente?'<span class="bx berr">urgente</span>':''}${r.attiva?'':' <span class="bx bwarn">spenta</span>'}</div>
    <div style="font-size:12px;color:var(--m)">${esc(r.evento)} · oggetto: ${esc(r.oggetto)} · <code>${c}</code></div>
    ${r.modificata_il?`<div style="font-size:11px;color:var(--m)">Cambiata da ${esc(r.modificata_da_nome||'—')} il ${esc(quandoRegola(r.modificata_il))}</div>`:''}
    <div style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:flex-end;margin-top:6px">
      <div class="f" style="margin:0"><label>Entro</label><div style="display:flex;gap:6px;align-items:center">
        <input type="text" inputmode="decimal" id="rs-t-${c}" data-iniziale="${esc(numeroCampoRegola(t.valore))}" value="${esc(numeroCampoRegola(t.valore))}" style="width:70px">${tempoUnita}</div></div>
      <div class="f" style="margin:0"><label>Avvisa</label><select id="rs-d-${c}" style="width:auto">${opzioniRuoliScadenza(r.destinatario_ruolo,false)}</select></div>
      <div class="f" style="margin:0"><label>Se non è fatto, risale a</label><select id="rs-r-${c}" style="width:auto">${opzioniRuoliScadenza(ri.ruolo,true)}</select></div>
      <div class="f" style="margin:0"><label>dopo</label><div style="display:flex;gap:6px;align-items:center">
        <input type="text" inputmode="decimal" id="rs-rv-${c}" data-iniziale="${esc(numeroCampoRegola(ri.valore))}" value="${esc(numeroCampoRegola(ri.valore))}" style="width:70px">${risUnita}
        <select id="rs-rd-${c}" style="width:auto"><option value="scadenza"${r.risalita_da!=='inizio'?' selected':''}>dalla scadenza</option><option value="inizio"${r.risalita_da==='inizio'?' selected':''}>dall’inizio</option></select></div></div>
      <label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" id="rs-u-${c}"${r.urgente?' checked':''}> Avviso urgente</label>
      <label style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" id="rs-a-${c}"${r.attiva?' checked':''}> Attiva</label>
      <button class="btn sm p" type="button" onclick="salvaRigaScadenza('${c}')">💾 Salva</button>
    </div>
  </div>`;
}

function numeroCampoScadenza(id){
  const el=ge(id);if(!el)return {vuoto:true,n:null,cambiato:false};
  const grezzo=String(el.value).trim();
  const testo=testoNumeroRegola(grezzo);
  const n=testo===''?null:Number(testo);
  return {vuoto:testo==='',n,valido:testo===''||isFinite(n),cambiato:grezzo!==String(el.dataset.iniziale||'')};
}

async function salvaRigaScadenza(codice){
  if(ROLE!=='titolare'){toast('Solo il titolare può cambiare le scadenze','err');return;}
  if(!(await verificaMotoreScadenzeDisponibili())){toast('Il motore delle scadenze non è ancora attivo (sql/64)','err');return;}
  const r=MOTORE_SCADENZE.righe.find(x=>x.codice===codice);if(!r)return;
  const t=numeroCampoScadenza('rs-t-'+codice);
  if(!t.valido||t.vuoto){toast('“'+r.nome+'”: scrivi il tempo (numero)','err');ge('rs-t-'+codice)?.focus();return;}
  if(t.n<0){toast('“'+r.nome+'”: il tempo non può essere negativo','err');return;}
  const ruoloRis=v('rs-r-'+codice)||null;
  const rv=numeroCampoScadenza('rs-rv-'+codice);
  const risCollegata=!!(r.risalita_regola&&r.risalita_ruolo);
  if(ruoloRis){
    if(!rv.valido||(rv.vuoto&&!risCollegata)){toast('“'+r.nome+'”: scrivi dopo quanto risale','err');ge('rs-rv-'+codice)?.focus();return;}
    if(rv.n!==null&&rv.n<0){toast('“'+r.nome+'”: il tempo della risalita non può essere negativo','err');return;}
    if(ruoloRis===v('rs-d-'+codice)){toast('“'+r.nome+'”: la risalita va a un ruolo diverso da chi riceve l’avviso','err');return;}
  }
  const motivo=String(v('si-scadenze-motivo')||'').trim().slice(0,500)||null;
  const parametri={
    p_codice:codice,
    // tempo collegato a una regola: si manda solo se cambiato (lo salva salva_regola)
    p_tempo_valore:r.tempo_regola?(t.cambiato?t.n:null):t.n,
    p_tempo_unita:r.tempo_regola?null:(v('rs-tu-'+codice)||null),
    p_destinatario_ruolo:v('rs-d-'+codice),
    p_risalita_ruolo:ruoloRis,
    p_risalita_valore:ruoloRis?(risCollegata?(rv.cambiato?rv.n:null):rv.n):null,
    p_risalita_unita:ruoloRis&&!risCollegata?(v('rs-ru-'+codice)||null):null,
    p_risalita_da:v('rs-rd-'+codice)||'scadenza',
    p_urgente:!!ge('rs-u-'+codice)?.checked,
    p_attiva:!!ge('rs-a-'+codice)?.checked,
    p_nota:motivo
  };
  try{
    const {error}=await db.rpc('salva_regola_scadenza',parametri);
    if(error)throw error;
    toast('“'+r.nome+'” salvata ✓ (le scadenze aperte si spostano da sole)','ok');
    const mo=ge('si-scadenze-motivo');if(mo)mo.value='';
  }catch(e){toast('Non salvata: '+(e.message||e),'err');return;}
  svuotaCacheRegole();
  await mostraMotoreScadenzeImpostazioni();
  // il tempo collegato è anche in Impostazioni > Regole
  if((r.tempo_regola&&t.cambiato)||(risCollegata&&rv.cambiato)){
    if(typeof mostraRegoleImpostazioni==='function')mostraRegoleImpostazioni().catch(()=>{});
  }
}

// ── Scadenze aperte e prove ────────────────────────────────────────────
async function mostraScadenzeAperte(){
  const box=ge('si-scadenze-aperte');if(!box)return;
  const {data,error}=await db.from('scadenze')
    .select('id,regola_codice,oggetto_tipo,oggetto_id,descrizione,destinatario_id,inizio,scade_il,risale_il,promemoria_il,promemoria_a,risalita_il,risalita_a,prova')
    .eq('stato','aperta').order('scade_il',{ascending:true}).limit(200);
  if(error){box.innerHTML=`<div class="al2 w">Scadenze non lette: ${esc(error.message)}</div>`;return;}
  MOTORE_SCADENZE.aperte=data||[];
  const ids=[...new Set(MOTORE_SCADENZE.aperte.map(s=>s.destinatario_id).filter(Boolean))].filter(id=>!MOTORE_SCADENZE.utenti[id]);
  if(ids.length){
    const {data:ut}=await db.from('utenti').select('id,nome,cognome').in('id',ids);
    (ut||[]).forEach(u=>{MOTORE_SCADENZE.utenti[u.id]=[u.nome,u.cognome].filter(Boolean).join(' ');});
  }
  const nomi={};MOTORE_SCADENZE.righe.forEach(r=>{nomi[r.codice]=r;});
  const conta=ge('si-scadenze-conta');if(conta)conta.textContent=MOTORE_SCADENZE.aperte.length?`(${MOTORE_SCADENZE.aperte.length}${MOTORE_SCADENZE.aperte.length>=200?'+':''})`:'';
  if(!MOTORE_SCADENZE.aperte.length){box.innerHTML='<div class="empty">Nessuna scadenza aperta</div>';return;}
  const adesso=Date.now();
  box.innerHTML=MOTORE_SCADENZE.aperte.map(s=>{
    const r=nomi[s.regola_codice]||{};
    const scaduta=new Date(s.scade_il).getTime()<=adesso;
    const chi=s.destinatario_id?(MOTORE_SCADENZE.utenti[s.destinatario_id]||'utente'):etichettaRuolo(r.destinatario_ruolo);
    const prom=s.promemoria_il?`🔔 promemoria a ${esc(s.destinatario_id?chi+' ('+etichettaRuolo(s.promemoria_a)+')':etichettaRuolo(s.promemoria_a)||chi)} il ${esc(quandoRegola(s.promemoria_il))}`:(scaduta?'🔔 promemoria al prossimo controllo':'');
    const ris=s.risalita_il?`⬆️ risalita a ${esc(etichettaRuolo(s.risalita_a))} il ${esc(quandoRegola(s.risalita_il))}`
      :(s.risale_il?`risale a ${esc(etichettaRuolo(r.risalita_ruolo)||'—')} il ${esc(quandoRegola(s.risale_il))}`:'nessuna risalita');
    return `<div style="padding:7px 0;border-bottom:1px solid var(--bo);font-size:13px">
      <div>${s.prova?'<span class="bx bpur">prova</span> ':''}<b>${esc(s.descrizione)}</b></div>
      <div style="font-size:12px;color:var(--m)">${esc(r.nome||s.regola_codice)} · per ${esc(chi)} · dal ${esc(quandoRegola(s.inizio))}</div>
      <div style="font-size:12px"><span style="${scaduta?'color:var(--r);font-weight:600':''}">Scade il ${esc(quandoRegola(s.scade_il))}</span> · ${ris}</div>
      ${prom?`<div style="font-size:12px">${prom}</div>`:''}
      ${s.prova?`<button class="btn sm" type="button" style="margin-top:4px" onclick="chiudiScadenzaProva(${Number(s.id)})">✖ Chiudi la prova</button>`:''}
    </div>`;
  }).join('');
}

async function creaScadenzaProva(){
  if(ROLE!=='titolare'){toast('Solo il titolare','err');return;}
  if(!(await verificaMotoreScadenzeDisponibili())){toast('Il motore delle scadenze non è ancora attivo (sql/64)','err');return;}
  const regola=v('sp-regola'),inizio=v('sp-inizio'),nota=String(v('sp-nota')||'').trim();
  if(!regola){toast('Scegli la scadenza da provare','err');return;}
  if(!inizio){toast('Indica da quando parte (giorno e ora)','err');return;}
  const d=new Date(inizio);if(isNaN(d.getTime())){toast('Giorno e ora non validi','err');return;}
  const bt=ge('sp-crea');if(bt)bt.disabled=true;
  try{
    const {error}=await db.rpc('crea_scadenza_prova',{p_regola:regola,p_inizio:d.toISOString(),p_nota:nota||null});
    if(error)throw error;
    toast('Promemoria di prova creato ✓: lo trovi tra le scadenze aperte','ok');
    const n=ge('sp-nota');if(n)n.value='';
  }catch(e){toast('Prova non creata: '+(e.message||e),'err');}
  finally{if(bt)bt.disabled=false;}
  await mostraScadenzeAperte();
}

async function chiudiScadenzaProva(id){
  if(!confirm('Chiudere questa prova? Esce dalle scadenze aperte.'))return;
  try{
    const {error}=await db.rpc('chiudi_scadenza_prova',{p_id:id});
    if(error)throw error;
    toast('Prova chiusa ✓','ok');
  }catch(e){toast('Non chiusa: '+(e.message||e),'err');}
  await mostraScadenzeAperte();
}

async function ricalcolaScadenzeMotore(){
  if(ROLE!=='titolare'){toast('Solo il titolare','err');return;}
  if(!(await verificaMotoreScadenzeDisponibili())){toast('Il motore delle scadenze non è ancora attivo (sql/64)','err');return;}
  try{
    const {data,error}=await db.rpc('aggiorna_scadenze');
    if(error)throw error;
    toast('Scadenze ricalcolate ✓ (aperte: '+(data||0)+')','ok');
  }catch(e){toast('Non ricalcolate: '+(e.message||e),'err');}
  await mostraScadenzeAperte();
}

async function eseguiControlloScadenzeOra(){
  if(ROLE!=='titolare'){toast('Solo il titolare','err');return;}
  if(!(await verificaMotoreScadenzeDisponibili())){toast('Il motore delle scadenze non è ancora attivo (sql/64)','err');return;}
  const bt=ge('si-scadenze-esegui');if(bt)bt.disabled=true;
  try{
    const {data,error}=await db.rpc('esegui_controllo_orario',{p_origine:'manuale'});
    if(error)throw error;
    if(data&&data.esito==='errore')toast('Controllo eseguito con errore: '+(data.messaggio||''),'err');
    else toast('Controllo eseguito ✓ (promemoria e risalite segnati: '+((data&&data.avvisi)||0)+')','ok');
  }catch(e){toast('Controllo non eseguito: '+(e.message||e),'err');}
  finally{if(bt)bt.disabled=false;}
  await mostraScadenzeAperte();
  if(typeof mostraControlloOrario==='function')mostraControlloOrario(true);
}

// ── Registro delle modifiche ───────────────────────────────────────────
const CAMPI_REGISTRO_SCADENZE={
  tempo:'Entro',destinatario:'Avvisa',risalita:'Risale a',risalita_tempo:'Risale dopo',
  risalita_da:'Risalita da',urgente:'Urgente',attiva:'Attiva'
};
function testoCampoRegistroScadenza(campo,foto){
  if(!foto)return '—';
  const x=foto[campo];
  if(campo==='tempo')return testoTempoScadenza(x,foto.tempo_unita);
  if(campo==='risalita_tempo')return x===null||x===undefined?'—':testoTempoScadenza(x,foto.risalita_unita);
  if(campo==='destinatario'||campo==='risalita')return x?etichettaRuolo(x):'nessuna';
  if(campo==='risalita_da')return x==='inizio'?'dall’inizio':'dalla scadenza';
  if(campo==='urgente'||campo==='attiva')return x?'sì':'no';
  return x===null||x===undefined?'—':String(x);
}
async function apriRegistroScadenze(){
  if(ROLE!=='titolare'){toast('Solo il titolare','err');return;}
  const box=ge('mrs2-elenco');if(!box)return;
  box.innerHTML='<div class="load">Caricamento...</div>';
  openM('m-registro-scadenze');
  const {data,error}=await db.from('regole_scadenze_storico').select('*').order('modificata_il',{ascending:false}).limit(300);
  if(error){box.innerHTML=`<div class="al2 w">Registro non letto: ${esc(error.message)}</div>`;return;}
  if(!data||!data.length){box.innerHTML='<div class="empty">Nessuna modifica ancora</div>';return;}
  const nomi={};MOTORE_SCADENZE.righe.forEach(r=>{nomi[r.codice]=r.nome;});
  box.innerHTML=data.map(m=>{
    const cambi=Object.keys(CAMPI_REGISTRO_SCADENZE).filter(k=>JSON.stringify((m.prima||{})[k])!==JSON.stringify((m.dopo||{})[k])
      ||(k==='tempo'&&(m.prima||{}).tempo_unita!==(m.dopo||{}).tempo_unita)
      ||(k==='risalita_tempo'&&(m.prima||{}).risalita_unita!==(m.dopo||{}).risalita_unita));
    return `<div style="padding:7px 0;border-bottom:1px solid var(--bo);font-size:13px">
      <div><b>${esc(nomi[m.codice]||m.codice)}</b></div>
      ${cambi.map(k=>`<div style="font-size:12px">${esc(CAMPI_REGISTRO_SCADENZE[k])}: ${esc(testoCampoRegistroScadenza(k,m.prima))} → <b>${esc(testoCampoRegistroScadenza(k,m.dopo))}</b></div>`).join('')}
      <div style="font-size:11px;color:var(--m)">${esc(m.modificata_da_nome||'—')} · ${esc(quandoRegola(m.modificata_il))}${m.nota?' · '+esc(m.nota):''}</div>
    </div>`;
  }).join('');
}
