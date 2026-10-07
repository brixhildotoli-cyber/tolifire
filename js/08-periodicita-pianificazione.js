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

