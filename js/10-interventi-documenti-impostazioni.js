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
 const dt = dr.data || [];
ge('dtbody').innerHTML = !dt.length
  ? '<tr><td colspan="5"><div class="empty">Nessun DDT</div></td></tr>'
  : dt.map(function(d) {
      var puoModificare = ROLE === 'segreteria' || ROLE === 'titolare';
      return `<tr>
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

const { data, error } = await query;
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

