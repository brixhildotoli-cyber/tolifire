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
// ── CALENDARIO PERSONALE INGEGNERE ────────────────────────────
let calIngAnno = new Date().getFullYear();
let calIngMese = new Date().getMonth();
let calIngDati = [];

function dataLocaleIng(data) {
  const anno = data.getFullYear();
  const mese = String(data.getMonth() + 1).padStart(2, '0');
  const giorno = String(data.getDate()).padStart(2, '0');

  return `${anno}-${mese}-${giorno}`;
}

function calIngPrev() {
  calIngMese--;

  if (calIngMese < 0) {
    calIngMese = 11;
    calIngAnno--;
  }

  loadCalendarioIngegnere();
}

function calIngNext() {
  calIngMese++;

  if (calIngMese > 11) {
    calIngMese = 0;
    calIngAnno++;
  }

  loadCalendarioIngegnere();
}

async function loadCalendarioIngegnere() {
  const box = ge('cal-ing-lista');
  const titolo = ge('cal-ing-title');

  if (!box) return;

  const mesi = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile',
    'Maggio', 'Giugno', 'Luglio', 'Agosto',
    'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];

  if (titolo) {
    titolo.textContent = `${mesi[calIngMese]} ${calIngAnno}`;
  }

  const inizio = dataLocaleIng(new Date(calIngAnno, calIngMese, 1));
  const fine = dataLocaleIng(new Date(calIngAnno, calIngMese + 1, 0));

  box.innerHTML = '<div class="load">Caricamento calendario...</div>';

  const { data, error } = await db
    .from('calendario_personale')
    .select('*')
    .eq('utente_id', ME.id)
    .gte('data', inizio)
    .lte('data', fine)
    .order('data', { ascending: true })
    .order('ora_inizio', { ascending: true });

  if (error) {
    box.innerHTML =
      '<div class="al2 e">Errore: ' + esc(error.message) + '</div>';
    return;
  }

  calIngDati = data || [];

  const attivitaPerData = {};

  calIngDati.forEach(function(attivita) {
    if (!attivitaPerData[attivita.data]) {
      attivitaPerData[attivita.data] = [];
    }

    attivitaPerData[attivita.data].push(attivita);
  });

  const giorniSettimana = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  const primoGiorno = new Date(calIngAnno, calIngMese, 1);

  // Converte domenica=0 in lunedì=0.
  const spaziIniziali = (primoGiorno.getDay() + 6) % 7;

  const giorniDelMese = new Date(
    calIngAnno,
    calIngMese + 1,
    0
  ).getDate();

  const oggi = dataLocaleIng(new Date());

  let html = giorniSettimana.map(function(giorno) {
    return `<div class="cal-head">${giorno}</div>`;
  }).join('');

  for (let i = 0; i < spaziIniziali; i++) {
    html += '<div class="cal-day other-month"></div>';
  }

  for (let giorno = 1; giorno <= giorniDelMese; giorno++) {
    const dataCorrente = dataLocaleIng(
      new Date(calIngAnno, calIngMese, giorno)
    );

    const attivitaDelGiorno = attivitaPerData[dataCorrente] || [];

    const anteprima = attivitaDelGiorno.slice(0, 3).map(function(attivita) {
      const ora = attivita.ora_inizio
        ? attivita.ora_inizio.slice(0, 5) + ' '
        : '';

      const classe = attivita.tipo === 'scadenza' ? 'str' : 'ord';

      return `
        <div
          class="cal-ev ${classe}"
          onclick="event.stopPropagation(); modificaAttivitaIngegnere('${attivita.id}')">
          ${ora}${esc(attivita.titolo)}
        </div>
      `;
    }).join('');

    const altreAttivita = attivitaDelGiorno.length > 3
      ? `<div class="cal-ev ord">+${attivitaDelGiorno.length - 3} altre</div>`
      : '';

    html += `
      <div
        class="cal-day ${dataCorrente === oggi ? 'today' : ''}"
        onclick="apriNuovaAttivitaIngegnere('${dataCorrente}')">

        <div class="cal-day-n">${giorno}</div>

        ${anteprima}
        ${altreAttivita}
      </div>
    `;
  }

  box.innerHTML = `<div class="cal-grid">${html}</div>`;
}

function apriNuovaAttivitaIngegnere(dataSelezionata = null) {
  ge('mai-id').value = '';
  ge('mai-titolo').textContent = 'Nuova attività';
  ge('mai-titolo-attivita').value = '';
  ge('mai-data').value = dataSelezionata || dataLocaleIng(new Date());
  ge('mai-tipo').value = 'attivita';
  ge('mai-inizio').value = '';
  ge('mai-fine').value = '';
  ge('mai-descrizione').value = '';

  openM('m-attivita-ingegnere');
}

function modificaAttivitaIngegnere(id) {
  const attivita = calIngDati.find(function(item) {
    return item.id === id;
  });

  if (!attivita) {
    toast('Attività non trovata', 'err');
    return;
  }

  ge('mai-id').value = attivita.id;
  ge('mai-titolo').textContent = 'Modifica attività';
  ge('mai-titolo-attivita').value = attivita.titolo || '';
  ge('mai-data').value = attivita.data || '';
  ge('mai-tipo').value = attivita.tipo || 'attivita';
  ge('mai-inizio').value = attivita.ora_inizio
    ? attivita.ora_inizio.slice(0, 5)
    : '';
  ge('mai-fine').value = attivita.ora_fine
    ? attivita.ora_fine.slice(0, 5)
    : '';
  ge('mai-descrizione').value = attivita.descrizione || '';

  openM('m-attivita-ingegnere');
}

async function salvaAttivitaIngegnere() {
  const id = v('mai-id');
  const titolo = v('mai-titolo-attivita').trim();
  const data = v('mai-data');

  if (!titolo || !data) {
    toast('Titolo e data sono obbligatori', 'err');
    return;
  }

  const inizio = v('mai-inizio') || null;
  const fine = v('mai-fine') || null;

  if (inizio && fine && fine <= inizio) {
    toast('L’orario di fine deve essere successivo all’orario di inizio', 'err');
    return;
  }


  const payload = {
    titolo: titolo,
    data: data,
    tipo: v('mai-tipo'),
    ora_inizio: inizio,
    ora_fine: fine,
    descrizione: v('mai-descrizione').trim() || null
  };

  let error;

  if (id) {
    ({ error } = await db
      .from('calendario_personale')
      .update(payload)
      .eq('id', id));
  } else {
    payload.utente_id = ME.id;

    ({ error } = await db
      .from('calendario_personale')
      .insert(payload));
  }

  if (error) {
    toast('Errore salvataggio: ' + error.message, 'err');
    return;
  }

  closeM('m-attivita-ingegnere');
  toast(id ? 'Attività aggiornata' : 'Attività creata', 'ok');

  await loadCalendarioIngegnere();
}

async function eliminaAttivitaIngegnere(id) {
  if (!confirm('Eliminare questa attività dal calendario?')) {
    return;
  }

  const { error } = await db
    .from('calendario_personale')
    .delete()
    .eq('id', id);

  if (error) {
    toast('Errore eliminazione: ' + error.message, 'err');
    return;
  }

  toast('Attività eliminata', 'ok');
  if (ROLE === 'commerciale') {
  await loadDashCommerciale();
} else {
  await loadCalendarioIngegnere();
}
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

