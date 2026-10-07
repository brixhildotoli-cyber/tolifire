// ── DASHBOARD ─────────────────────────────────────────────────
async function loadDash(){
  // Smistamento per ruolo: tecnico, titolare, segreteria, capo_tecnico hanno dashboard dedicate.
  var dtSec = ge('dash-tecnico');
  var ttSec = ge('dash-titolare');
  var sgSec = ge('dash-segreteria-pg');
  var ctSec = ge('dash-capo-tecnico-pg');
  var ingSec = ge('dash-ingegnere-pg');
  var comSec = ge('dash-commerciale-pg');
  var dsSec = ge('dash-standard');

  function showOnly(sec) {
    if (dtSec) dtSec.style.display = sec === 'tecnico' ? 'block' : 'none';
    if (ttSec) ttSec.style.display = sec === 'titolare' ? 'block' : 'none';
    if (sgSec) sgSec.style.display = sec === 'segreteria' ? 'block' : 'none';
    if (ctSec) ctSec.style.display = sec === 'capo_tecnico' ? 'block' : 'none';
    if (ingSec) ingSec.style.display = sec === 'ingegnere' ? 'block' : 'none';
    if (comSec) comSec.style.display = sec === 'commerciale' ? 'block' : 'none';
    if (dsSec) dsSec.style.display = sec === 'standard' ? 'block' : 'none';
  }

  if (ROLE === 'tecnico') {
    showOnly('tecnico');
    await loadDashTecnico();
    return;
  }

  if (ROLE === 'titolare') {
    showOnly('titolare');
    await loadDashTitolare();
    return;
  }

  if (ROLE === 'segreteria') {
    showOnly('segreteria');
    await loadDashSegreteriaPg();
    return;
  }

  if (ROLE === 'capo_tecnico') {
    showOnly('capo_tecnico');
    await loadDashCapoTecnicoPg();
    return;
  }
  if (ROLE === 'commerciale') {
   showOnly('commerciale');
   await loadDashCommerciale();
   return;
}
  if (ROLE === 'ingegnere') {
    showOnly('ingegnere');
    await loadDashIngegnere();
    return;
  }

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
async function loadDashIngegnere() {
  const adesso = new Date();
  const ora = adesso.getHours();

  // Alle 12 è ancora buongiorno.
  const saluto = ora < 14
    ? 'Buongiorno'
    : ora < 18
      ? 'Buon pomeriggio'
      : 'Buonasera';

  ge('ing-greet-nome').textContent =
    saluto + (ME?.nome ? ', ' + ME.nome : '');

  ge('ing-greet-data').textContent = adesso.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const oggi = dataLocaleIng(adesso);
  const inSetteGiorni = new Date(adesso);
  inSetteGiorni.setDate(inSetteGiorni.getDate() + 7);

  const primoMese = dataLocaleIng(
    new Date(adesso.getFullYear(), adesso.getMonth(), 1)
  );

  const ultimoMese = dataLocaleIng(
    new Date(adesso.getFullYear(), adesso.getMonth() + 1, 0)
  );

  const [
    verificheRes,
    attivitaMeseRes,
    scadenzeRes,
    prontiRes,
    attivitaRes,
    calendarioRes
  ] = await Promise.all([
    db.from('progetti_tecnici')
      .select('id,titolo,tipologia,creato_il,clienti(ragione_sociale)', {
        count: 'exact'
      })
      .eq('stato', 'in_verifica_tecnica')
      .order('creato_il', { ascending: false })
      .limit(5),

    db.from('calendario_personale')
      .select('id', { count: 'exact', head: true })
      .eq('utente_id', ME.id)
      .gte('data', primoMese)
      .lte('data', ultimoMese),

    db.from('calendario_personale')
      .select('id', { count: 'exact', head: true })
      .eq('utente_id', ME.id)
      .eq('tipo', 'scadenza')
      .gte('data', oggi)
      .lte('data', dataLocaleIng(inSetteGiorni)),

    db.from('progetti_tecnici')
      .select('id', { count: 'exact', head: true })
      .eq('stato', 'pronto_per_preventivo'),

    db.from('calendario_personale')
      .select('id,titolo,data,ora_inizio,tipo')
      .eq('utente_id', ME.id)
      .gte('data', oggi)
      .order('data', { ascending: true })
      .order('ora_inizio', { ascending: true })
      .limit(5),

    db.from('calendario_personale')
      .select('id,titolo,data,ora_inizio')
      .eq('utente_id', ME.id)
      .gte('data', oggi)
      .lte('data', dataLocaleIng(new Date(
        adesso.getFullYear(),
        adesso.getMonth(),
        adesso.getDate() + 34
      )))
      .order('data', { ascending: true })
  ]);

  ge('ing-k-verifiche').textContent = verificheRes.count || 0;
  ge('ing-k-attivita').textContent = attivitaMeseRes.count || 0;
  ge('ing-k-scadenze').textContent = scadenzeRes.count || 0;
  ge('ing-k-pronti').textContent = prontiRes.count || 0;

  const verifiche = verificheRes.data || [];
  ge('ing-verifiche-lista').innerHTML = verifiche.length
    ? `<div class="rap-list-card">${
        verifiche.map(p => `
          <div class="rap-sopr-card" style="margin:0 0 8px">
            <div class="body">
              <div class="cli">🔧 ${esc(p.titolo)}</div>
              <div class="meta">
                ${esc(p.clienti?.ragione_sociale || 'Cliente non indicato')}
                · ${esc(p.tipologia || 'Progetto tecnico')}
              </div>
            </div>
          </div>
        `).join('')
      }
      <button class="btn sm" onclick="gotoPage('verifiche-tecniche')">
        Vedi tutte →
      </button>
    </div>`
    : `<div class="rap-list-card">
        <div class="tit-empty">✅ Nessuna verifica tecnica da svolgere.</div>
      </div>`;

  const attivita = attivitaRes.data || [];
  ge('ing-attivita-lista').innerHTML = attivita.length
    ? `<div class="rap-list-card">${
        attivita.map(a => `
          <div class="rap-sopr-card" style="margin:0 0 8px">
            <div class="body">
              <div class="cli">📌 ${esc(a.titolo)}</div>
              <div class="meta">
                ${new Date(a.data + 'T12:00:00').toLocaleDateString('it-IT', {
                  day: 'numeric',
                  month: 'short'
                })}
                ${a.ora_inizio ? ' · ' + a.ora_inizio.slice(0, 5) : ''}
              </div>
            </div>
          </div>
        `).join('')
      }
      <button class="btn sm" onclick="gotoPage('calendario-ingegnere')">
        Apri calendario →
      </button>
    </div>`
    : `<div class="rap-list-card">
        <div class="tit-empty">
          Nessuna attività prossima.<br><br>
          <button class="btn p sm" onclick="apriNuovaAttivitaIngegnere()">
            + Nuova attività
          </button>
        </div>
      </div>`;

  const perData = {};
  (calendarioRes.data || []).forEach(a => {
    perData[a.data] = (perData[a.data] || 0) + 1;
  });

  const inizio = new Date(adesso);
  const giornoSettimana = inizio.getDay();
  inizio.setDate(
    inizio.getDate() + (giornoSettimana === 0 ? -6 : 1 - giornoSettimana)
  );

  const celle = [];

  for (let i = 0; i < 35; i++) {
    const data = new Date(inizio);
    data.setDate(inizio.getDate() + i);

    const chiave = dataLocaleIng(data);
    const numero = perData[chiave] || 0;
    const livello = numero === 0 ? 0 : numero <= 2 ? 1 : numero <= 4 ? 2 : 3;
    const classeOggi = chiave === oggi ? ' today' : '';

    celle.push(`
      <div class="rap-heatmap-day l${livello}${classeOggi}"
           title="${data.toLocaleDateString('it-IT', {
             weekday: 'long',
             day: 'numeric',
             month: 'long'
           })}: ${numero} attività"
           onclick="gotoPage('calendario-ingegnere')">
        <span class="n">${data.getDate()}</span>
      </div>
    `);
  }

  ge('ing-mini-calendario').innerHTML = celle.join('');
}

function apriNuovaAttivitaCommerciale(dataSelezionata = null) {
  apriNuovaAttivitaIngegnere(dataSelezionata);
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
  caricaCodaCommercialeTitolare();
  caricaAvvisoLeadSitoTitolare();
  caricaAvvisiPreventiviTitolare();
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

