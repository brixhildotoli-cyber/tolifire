// ── CALENDARIO ───────────────────────────────────────────────

var calYear = new Date().getFullYear();
var calMonth = new Date().getMonth();
var calOdls = [];

function calPrev() { calMonth--; if(calMonth<0){calMonth=11;calYear--;} loadCalendario(); }
function calNext() { calMonth++; if(calMonth>11){calMonth=0;calYear++;} loadCalendario(); }

async function loadCalendario() {
  var mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var titEl = ge('cal-title');
  if(titEl) titEl.textContent = mesi[calMonth] + ' ' + calYear;

  // Range del mese
  var dataInizio = new Date(calYear, calMonth, 1).toISOString().split('T')[0];
  var dataFine = new Date(calYear, calMonth+1, 0).toISOString().split('T')[0];

  var res = await db.from('ordini_lavoro')
    .select('id,numero,tipo,stato,data_pianificata,fascia_oraria,sede_id,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)')
    .gte('data_pianificata', dataInizio)
    .lte('data_pianificata', dataFine)
    .order('data_pianificata');
  calOdls = res.data || [];

  // Carica sedi degli OdL
  var sedeIdsCal = calOdls.map(function(o){return o.sede_id;}).filter(Boolean);
  window._calSediMap = {};
  if(sedeIdsCal.length) {
    var rsc = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').in('id', sedeIdsCal);
    (rsc.data||[]).forEach(function(s){ window._calSediMap[s.id] = s; });
  }

  // Carica anche cicli pianificati del mese (non ancora con OdL)
  var meseStr = calYear + '-' + String(calMonth+1).padStart(2,'0');
  var rCicli = await db.from('cicli_pianificati')
    .select('*, clienti(ragione_sociale)')
    .eq('mese_anno', meseStr)
    .eq('stato', 'pianificato')
    .is('odl_id', null);
  calCicli = rCicli.data || [];

  renderCalendar();
  renderCalList();
}

function renderCalendar() {
  var headsEl = ge('cal-heads');
  var bodyEl = ge('cal-body');
  if(!headsEl || !bodyEl) return;

  var giorni = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  headsEl.innerHTML = giorni.map(function(g) {
    return '<div class="cal-head">' + g + '</div>';
  }).join('');

  var oggi = new Date().toISOString().split('T')[0];
  var primoGiorno = new Date(calYear, calMonth, 1);
  var ultimoGiorno = new Date(calYear, calMonth+1, 0).getDate();

  // Giorno settimana del primo (0=dom, converti in lun=0)
  var startDow = primoGiorno.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  var cells = [];
  // Celle vuote prima
  for(var i=0; i<startDow; i++) {
    cells.push('<div class="cal-day other-month"></div>');
  }

  for(var d=1; d<=ultimoGiorno; d++) {
    var dateStr = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var isToday = dateStr === oggi;
    var dayOdls = calOdls.filter(function(o) { return o.data_pianificata === dateStr; });

    var evHtml = dayOdls.slice(0,3).map(function(o) {
      var cls = o.tipo === 'straordinario' ? 'str' : o.tipo === 'corso' ? 'cor' : o.tipo === 'ordinario_chiamata' ? 'chi' : 'ord';
      var cli = o.clienti && o.clienti.ragione_sociale ? o.clienti.ragione_sociale : '—';
      return '<div class="cal-ev ' + cls + '" onclick="event.stopPropagation();openOdlDetail(\'' + o.id + '\')" title="' + cli + '">' + cli + '</div>';
    }).join('');
    if(dayOdls.length > 3) evHtml += '<div style="font-size:10px;color:var(--m)">+' + (dayOdls.length-3) + ' altri</div>';
    // Cicli pianificati senza OdL (da schedulare)
    var dayCicli = calCicli.filter(function(c) { return c.data_prevista === dateStr; });
    if(dayCicli.length) {
      evHtml += '<div style="font-size:10px;color:var(--m);border-top:0.5px dashed var(--bo);margin-top:2px;padding-top:2px">' +
        '📋 ' + dayCicli.length + ' da pianificare</div>';
    }

    var canEdit = ROLE === 'capo_tecnico' || ROLE === 'segreteria' || ROLE === 'titolare';
    var clickAttr = canEdit ? 'onclick="calDayClick(\'' + dateStr + '\')"' : '';

    cells.push('<div class="cal-day' + (isToday?' today':'') + '" ' + clickAttr + '>' +
      '<div class="cal-day-n">' + d + '</div>' + evHtml + '</div>');
  }

  bodyEl.innerHTML = cells.join('');
}

function calDayClick(dateStr) {
  // Apre modal OdL nuovo con la data precompilata
  var editId = ge('mcli-odl-id');
  if(editId) editId.value = ''; // assicura nuovo OdL
  if(ge('modal-odl-title')) ge('modal-odl-title').textContent = 'Nuovo intervento';
  ge('mo3').value = dateStr;
  openM('m-odl');
}

function renderCalList() {
  var el = ge('cal-list');
  if(!el) return;
  if(!calOdls.length) {
    el.innerHTML = '<div class="empty">Nessun intervento pianificato questo mese.</div>';
    return;
  }
  var tipiLabel = {ordinario_programmato:'Manutenzione',ordinario_chiamata:'Su chiamata',straordinario:'Straordinario',corso:'Corso'};
  var canEdit = ROLE === 'capo_tecnico' || ROLE === 'titolare';
  var canDel = ROLE === 'titolare';
  el.innerHTML = calOdls.map(function(o) {
    var cli = o.clienti && o.clienti.ragione_sociale ? esc(o.clienti.ragione_sociale) : '—';
    var tec = o.utenti ? esc(o.utenti.nome + ' ' + o.utenti.cognome) : '<span style="color:var(--r)">Non assegnato</span>';
    var statoLabel = bs(o.stato);
    var sedeObj = o.sede_id && window._calSediMap ? window._calSediMap[o.sede_id] : null;
    var sedeStr = sedeObj ? '📍 ' + esc((sedeObj.tipo||'').toUpperCase()) + (sedeObj.nome?' — '+esc(sedeObj.nome):'') + ': ' + esc(sedeObj.via||'') + ' ' + esc(sedeObj.civico||'') + (sedeObj.citta?' ('+esc(sedeObj.citta)+')':'') : '📍 Sede principale';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:0.5px solid var(--bo);gap:10px">' +
      '<div style="flex:1">' +
        '<div style="font-size:13px;font-weight:600">' + cli + '</div>' +
        '<div style="font-size:12px;color:var(--m);margin-top:2px">' + fd(o.data_pianificata) + (o.fascia_oraria?' · '+o.fascia_oraria:'') + ' · ' + (tipiLabel[o.tipo]||o.tipo) + '</div>' +
        '<div style="font-size:12px;color:var(--m)">' + sedeStr + '</div>' +
        '<div style="font-size:12px;color:var(--m)">👤 ' + tec + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0">' +
        statoLabel +
        (canEdit ? '<button class="btn sm" data-id="'+o.id+'" onclick="apriEditOdlCal(this.dataset.id)">✏️ Modifica</button>' : '') +
        (canDel ? '<button class="btn sm" style="color:var(--r)" data-id="'+o.id+'" onclick="eliminaOdlCal(this.dataset.id)">🗑️</button>' : '') +
      '</div></div>';
  }).join('');
}

function openOdlDetail(id) {
  apriEditOdlCal(id);
}

async function apriEditOdlCal(id) {
  var odl = calOdls.find(function(o) { return o.id === id; });
  if(!odl) {
    // Se non in cache, carica da DB
    var r = await db.from('ordini_lavoro').select('*,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)').eq('id',id).single();
    if(r.error) { toast('Errore caricamento','err'); return; }
    odl = r.data;
  }

  await loadCS(); await loadUS();

  var m = ge('m-cal-edit');
  if(!m) {
    m = document.createElement('div');
    m.id = 'm-cal-edit';
    m.className = 'mbg';
    document.body.appendChild(m);
    m.addEventListener('click', function(e){ if(e.target===this) this.classList.remove('on'); });
  }

  var canEdit = ROLE === 'capo_tecnico' || ROLE === 'titolare';
  var tecOpts = '<option value="">— Nessuno —</option>' +
    UTENTI.filter(function(u){return ['tecnico','capo_tecnico'].includes(u.ruolo);})
    .map(function(u){return '<option value="'+u.id+'"'+(odl.tecnico_id===u.id?' selected':'')+'>'+esc(u.nome)+' '+esc(u.cognome)+'</option>';}).join('');

  // Carica sedi del cliente per il select
  var sediOpts = '<option value="">Sede principale</option>';
  if(odl.cliente_id || odl.clienti) {
    var cliId2 = odl.cliente_id;
    if(!cliId2 && odl.clienti) {
      // cerca id dal nome
      var found = CLIS.find(function(c){return c.ragione_sociale === odl.clienti.ragione_sociale;});
      if(found) cliId2 = found.id;
    }
    if(cliId2) {
      var rSedi2 = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').eq('cliente_id', cliId2).order('tipo');
      sediOpts += (rSedi2.data||[]).map(function(s){
        var lbl = (s.tipo||'').toUpperCase()+(s.nome?' — '+s.nome:'')+': '+(s.via||'')+' '+(s.civico||'')+(s.citta?' ('+s.citta+')':'');
        return '<option value="'+s.id+'"'+(odl.sede_id===s.id?' selected':'')+'>'+lbl+'</option>';
      }).join('');
    }
  }

  m.innerHTML = '<div class="modal" style="max-width:500px">' +
    '<div class="mh">✏️ Modifica intervento <button class="mx" data-mid="m-cal-edit" onclick="closeM(this.dataset.mid)">✕</button></div>' +
    '<div style="padding:16px">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:14px">'+(odl.clienti?.ragione_sociale||'—')+'</div>' +
      '<div class="fr">' +
        '<div class="f"><label>Data</label><input type="date" id="ce-data" value="'+(odl.data_pianificata||'')+'" '+(canEdit?'':'readonly')+'></div>' +
        '<div class="f"><label>Fascia oraria</label><input type="text" id="ce-fascia" value="'+(odl.fascia_oraria||'')+'" placeholder="Es: mattina" '+(canEdit?'':'readonly')+'></div>' +
      '</div>' +
      '<div class="f"><label>📍 Sede intervento</label><select id="ce-sede" '+(canEdit?'':'disabled')+'>'+sediOpts+'</select></div>' +
      '<div class="f"><label>Tecnico assegnato</label><select id="ce-tec" '+(canEdit?'':'disabled')+'>'+tecOpts+'</select></div>' +
      '<div class="f"><label>Note</label><textarea id="ce-note" style="min-height:60px" '+(canEdit?'':'readonly')+'>'+(esc(odl.note_per_tecnico)||'')+'</textarea></div>' +
      (canEdit ?
        '<div style="display:flex;gap:8px;margin-top:14px">' +
          '<button class="btn" data-mid="m-cal-edit" onclick="closeM(this.dataset.mid)">Annulla</button>' +
          '<button class="btn p" data-id="'+id+'" onclick="salvaEditOdlCal(this.dataset.id)">💾 Salva</button>' +
        '</div>'
        :
        '<div style="margin-top:14px"><button class="btn" data-mid="m-cal-edit" onclick="closeM(this.dataset.mid)">Chiudi</button></div>'
      ) +
    '</div></div>';

  openM('m-cal-edit');
}

async function salvaEditOdlCal(id) {
  var data = ge('ce-data').value;
  var fascia = ge('ce-fascia').value;
  var tecId = ge('ce-tec').value;
  var note = ge('ce-note').value;
  if(!data) { toast('Inserisci la data','err'); return; }

  var sedeId = ge('ce-sede') ? ge('ce-sede').value || null : null;
  var payload = {
    data_pianificata: data,
    fascia_oraria: fascia || null,
    tecnico_id: tecId || null,
    sede_id: sedeId,
    note_per_tecnico: note || null,
    stato: 'pianificato'
  };

  var r = await db.from('ordini_lavoro').update(payload).eq('id', id);
  if(r.error) { toast('Errore: '+r.error.message,'err'); return; }
  toast('✅ Intervento aggiornato','ok');
  closeM('m-cal-edit');
  if(ge('pg-calendario-tec') && ge('pg-calendario-tec').classList.contains('on')) {
    loadCalendarioTecnico();
  } else {
    loadCalendario();
  }
}

async function eliminaOdlCal(id) {
  if(ROLE !== 'titolare') { toast('Solo il titolare può eliminare','err'); return; }
  if(!confirm('Eliminare questo intervento dal calendario? (Soft-delete: recuperabile)')) return;
  await softDel('schede_lavoro').eq('odl_id', id);
  var r = await softDel('ordini_lavoro').eq('id', id);
  if(r.error) { toast('Errore: '+r.error.message,'err'); return; }
  toast('Intervento eliminato','ok');
  loadCalendario();
}

// ── TECNICO: carica OdL assegnati ────────────────────────────

async function loadStoricoInterventiTecnico() {
  const box = ge('tec-storico-interventi');

  if (!box) return;

  if (!['tecnico', 'capo_tecnico'].includes(ROLE)) {
    box.innerHTML = '';
    return;
  }

  box.innerHTML = '<div class="load">Caricamento interventi...</div>';

  const { data: schede, error } = await db
    .from('schede_lavoro')
    .select(`
      id,
      numero,
      data_intervento,
      ora_inizio,
      ora_fine,
      lavori_eseguiti,
      anomalie_rilevate,
      esito,
      stato,
      creato_il,
      clienti(ragione_sociale),
      ordini_lavoro(tipo)
    `)
    .eq('tecnico_id', ME.id)
    .is('eliminato_il', null)
    .order('data_intervento', { ascending: false })
    .order('creato_il', { ascending: false })
    .limit(30);

  if (error) {
    box.innerHTML = `
      <div class="al2 e">
        Errore caricamento storico: ${esc(error.message)}
      </div>
    `;
    return;
  }

  if (!schede?.length) {
    box.innerHTML = `
      <div class="empty">
        Nessun intervento compilato finora.
      </div>
    `;
    return;
  }

  box.innerHTML = schede.map(function(scheda) {
    const cliente =
      scheda.clienti?.ragione_sociale || 'Cliente non disponibile';

    const tipo =
      tl(scheda.ordini_lavoro?.tipo || '') || 'Intervento';

    const stato = scheda.stato === 'firmata'
      ? 'Inviata alla segreteria'
      : (WFL[scheda.stato] || scheda.stato || '—');

    const classeStato = scheda.stato === 'firmata'
      ? 'bblue'
      : scheda.stato === 'approvata'
        ? 'bok'
        : 'bgray';

    const lavori = (scheda.lavori_eseguiti || 'Nessun lavoro indicato.')
      .slice(0, 180);

    return `
      <div style="padding:12px 0;border-bottom:1px solid var(--bo)">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div style="min-width:0">
            <div style="font-size:14px;font-weight:700">
              ${esc(cliente)}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${esc(tipo)} · ${esc(fd(scheda.data_intervento))}
              ${scheda.numero ? ' · Scheda n. ' + esc(String(scheda.numero)) : ''}
            </div>
          </div>

          <span class="bx ${classeStato}">
            ${esc(stato)}
          </span>
        </div>

        <div style="font-size:13px;white-space:pre-wrap;margin-top:9px">
          ${esc(lavori)}${(scheda.lavori_eseguiti || '').length > 180 ? '…' : ''}
        </div>

        ${scheda.anomalie_rilevate ? `
          <div style="font-size:12px;color:var(--a);margin-top:7px">
            ⚠️ Anomalie registrate
          </div>
        ` : ''}

        <button
          class="btn sm"
          style="margin-top:10px"
          onclick="openScheda('${scheda.id}')"
        >
          📄 Apri riepilogo completo
        </button>
      </div>
    `;
  }).join('');
}


async function loadOdlTecnico() {
  var sel = ge('tc-odl');
  if(!sel) return;
  nascondiCampoTecnico();
  var res = await db.from('ordini_lavoro')
    .select('id,numero,tipo,data_pianificata,fascia_oraria,note_per_tecnico,clienti(ragione_sociale,referente_telefono)')
    .eq('tecnico_id', ME.id)
    .in('stato', ['da_pianificare','pianificato'])
    .order('data_pianificata');
  var odls = res.data || [];
  sel.innerHTML = '<option value="">— Seleziona OdL o compila manualmente —</option>' +
    odls.map(function(o) {
      var cli = o.clienti && o.clienti.ragione_sociale ? o.clienti.ragione_sociale : '—';
      var tel = o.clienti && o.clienti.referente_telefono ? ' 📞' + o.clienti.referente_telefono : '';
      var fascia = o.fascia_oraria ? ' (' + o.fascia_oraria + ')' : '';
      var tipo = {ordinario_programmato:'Manutenzione',ordinario_chiamata:'Su chiamata',straordinario:'Straordinario',corso:'Corso'}[o.tipo] || o.tipo || '';
      return '<option value="' + o.id + '">' + fd(o.data_pianificata) + fascia + ' — ' + cli + ' — ' + tipo + '</option>';
    }).join('');
}

async function preloadFromOdl() {
  var odlId = v('tc-odl');
  if(!odlId) return;
  var res = await db.from('ordini_lavoro')
    .select('cliente_id,tipo,data_pianificata,tecnico_id,note_per_tecnico,sede_id,materiali_da_portare,note_capo_tecnico,clienti(ragione_sociale,referente_telefono)')
    .eq('id', odlId).single();
  var o = res.data;
  if(!o) return;
  var cliSel = ge('tc1'); if(cliSel) cliSel.value = o.cliente_id || '';
  var tipoSel = ge('tc2'); if(tipoSel) tipoSel.value = o.tipo || 'ordinario_programmato';
  var dataSel = ge('tc3'); if(dataSel) dataSel.value = o.data_pianificata || '';
  var tecSel = ge('tc5'); if(tecSel) tecSel.value = o.tecnico_id || '';
  var noteSel = ge('tc6'); if(noteSel && o.note_per_tecnico) noteSel.value = o.note_per_tecnico;
  await loadSediTec();
  if(o.sede_id) { var sedeSel = ge('tc1-sede'); if(sedeSel) sedeSel.value = o.sede_id; }
  // Mostra le card briefing (materiali / presidi auto / note operative / cliente)
  var infoDiv = ge('tec-odl-info');
  if(infoDiv && o.clienti) {
    infoDiv.innerHTML = renderInfoIntervento(o);
    infoDiv.style.display = 'block';
    await calcolaPresidiSede(o.cliente_id, o.sede_id, 'tec-presidi-box');
  }
  toast('✅ Dati caricati. Procedi con la compilazione.', 'ok');
}

// Render delle card briefing al tecnico quando apre un intervento dalla dashboard
function renderInfoIntervento(o){
  var c = o.clienti || {};
  var tel = c.referente_telefono ? '<a href="tel:'+esc(c.referente_telefono)+'" style="color:var(--g);text-decoration:none">📞 '+esc(c.referente_telefono)+'</a>' : '';
  var html = '';
  // Card cliente
  html += '<div style="background:var(--bl);border-radius:10px;padding:12px;font-size:13px;margin-bottom:10px">';
  html += '<div style="font-weight:600;font-size:14px;margin-bottom:4px">'+esc(c.ragione_sociale||'—')+'</div>';
  if(tel) html += '<div>'+tel+'</div>';
  html += '</div>';
  // Card materiali da portare
  if(o.materiali_da_portare){
    html += '<div style="background:var(--gl);border-left:3px solid var(--gm);border-radius:10px;padding:12px;font-size:13px;margin-bottom:10px">';
    html += '<div style="font-size:11px;font-weight:700;color:var(--g);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">📦 Materiali da portare</div>';
    html += '<div style="white-space:pre-wrap">'+esc(o.materiali_da_portare)+'</div>';
    html += '</div>';
  }
  // Card presidi della sede (placeholder, riempita da calcolaPresidiSede)
  html += '<div style="background:var(--w);border:0.5px solid var(--bo);border-radius:10px;padding:12px;margin-bottom:10px">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--m);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">🧯 Presidi della sede</div>';
  html += '<div id="tec-presidi-box"><div style="color:var(--m);font-size:12px">⏳ Calcolo...</div></div>';
  html += '</div>';
  // Card note operative
  if(o.note_capo_tecnico){
    html += '<div style="background:var(--al);border-left:3px solid var(--a);border-radius:10px;padding:12px;font-size:13px;margin-bottom:10px">';
    html += '<div style="font-size:11px;font-weight:700;color:var(--a);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">📝 Note operative</div>';
    html += '<div style="white-space:pre-wrap">'+esc(o.note_capo_tecnico)+'</div>';
    html += '</div>';
  }
  // Note generiche legacy (mostrate solo se valorizzate)
  if(o.note_per_tecnico){
    html += '<div style="background:var(--bg);border-radius:10px;padding:10px;font-size:12px;color:var(--m);margin-bottom:10px">';
    html += '<strong>Note:</strong> '+esc(o.note_per_tecnico);
    html += '</div>';
  }
  return html;
}

// Calcola e mostra l'elenco presidi della sede (caso A: cliente ricorrente).
// Se non ci sono presidi, suggerisce di scrivere a mano i materiali (caso B).
async function calcolaPresidiSede(cliId, sedeId, containerId){
  var el = ge(containerId);
  if(!el) return;
  if(!cliId){ el.innerHTML = '<div style="color:var(--m);font-size:12px;padding:4px">Seleziona prima un cliente.</div>'; return; }
  el.innerHTML = '<div style="color:var(--m);font-size:12px;padding:4px">⏳ Calcolo presidi...</div>';

  var q = db.from('impianti').select('id,tipo,modello,marca,matricola,ubicazione,data_prossimo_controllo,data_scadenza_collaudo,stato').eq('cliente_id', cliId);
  if(sedeId) q = q.eq('sede_id', sedeId);
  var r = await q;
  if(r.error){ el.innerHTML = '<div style="color:var(--r);font-size:12px">Errore: '+esc(r.error.message)+'</div>'; return; }
  var presidi = r.data || [];

  if(!presidi.length){
    el.innerHTML = '<div style="color:var(--m);font-size:13px;padding:8px;line-height:1.4">📭 Nessun presidio censito per questa sede.<br><span style="font-size:12px">Cliente nuovo o lavoro extra: usa il campo <strong>"Materiali da portare"</strong> sopra per scrivere cosa serve.</span></div>';
    return;
  }

  var oggi = new Date().toISOString().split('T')[0];
  var in30 = new Date(Date.now()+30*86400000).toISOString().split('T')[0];

  var scaduti = presidi.filter(function(p){ return p.data_prossimo_controllo && p.data_prossimo_controllo < oggi; });
  var inScadenza = presidi.filter(function(p){ return p.data_prossimo_controllo && p.data_prossimo_controllo >= oggi && p.data_prossimo_controllo <= in30; });
  var collaudoScaduto = presidi.filter(function(p){ return p.data_scadenza_collaudo && p.data_scadenza_collaudo < oggi; });
  var anomalie = presidi.filter(function(p){ return p.stato === 'anomalia'; });

  // Conteggio per tipo
  var perTipo = {};
  presidi.forEach(function(p){ perTipo[p.tipo] = (perTipo[p.tipo]||0) + 1; });
  var conteggi = Object.keys(perTipo).sort().map(function(t){
    return '<span style="background:var(--w);padding:3px 10px;border-radius:20px;font-size:12px;margin-right:6px;margin-bottom:4px;display:inline-block;border:0.5px solid var(--bo)">'+tpl(t)+' × '+perTipo[t]+'</span>';
  }).join('');

  function lista(arr, max){
    var n = max || 4;
    return arr.slice(0,n).map(function(p){
      var ext = p.matricola ? ' #'+esc(p.matricola) : '';
      var loc = p.ubicazione ? ' — '+esc(p.ubicazione) : '';
      return tpl(p.tipo)+ext+loc;
    }).join('<br>') + (arr.length>n ? '<br>... e altri '+(arr.length-n) : '');
  }

  var html = '';
  html += '<div style="margin-bottom:10px"><strong style="font-size:13px">📊 '+presidi.length+' presidi censiti</strong></div>';
  html += '<div style="margin-bottom:12px">'+conteggi+'</div>';
  if(scaduti.length){
    html += '<div style="background:var(--rl);color:var(--r);padding:8px 10px;border-radius:6px;margin-bottom:6px;font-size:12px">';
    html += '<strong>❌ Scaduti: '+scaduti.length+'</strong>';
    html += '<div style="margin-top:4px;line-height:1.5">'+lista(scaduti)+'</div></div>';
  }
  if(inScadenza.length){
    html += '<div style="background:var(--al);color:var(--a);padding:8px 10px;border-radius:6px;margin-bottom:6px;font-size:12px">';
    html += '<strong>⚠️ In scadenza nei 30gg: '+inScadenza.length+'</strong>';
    html += '<div style="margin-top:4px;line-height:1.5">'+lista(inScadenza)+'</div></div>';
  }
  if(collaudoScaduto.length){
    html += '<div style="background:var(--rl);color:var(--r);padding:8px 10px;border-radius:6px;margin-bottom:6px;font-size:12px">';
    html += '<strong>🔧 Collaudo scaduto (da sostituire): '+collaudoScaduto.length+'</strong>';
    html += '<div style="margin-top:4px;line-height:1.5">'+lista(collaudoScaduto)+'</div></div>';
  }
  if(anomalie.length){
    html += '<div style="background:var(--al);color:var(--a);padding:8px 10px;border-radius:6px;margin-bottom:6px;font-size:12px">';
    html += '<strong>🔧 Con anomalie segnalate: '+anomalie.length+'</strong>';
    html += '<div style="margin-top:4px;line-height:1.5">'+lista(anomalie)+'</div></div>';
  }
  if(!scaduti.length && !inScadenza.length && !collaudoScaduto.length && !anomalie.length){
    html += '<div style="background:var(--gl);color:var(--g);padding:8px 10px;border-radius:6px;font-size:12px;font-weight:500">✅ Tutti i presidi in regola, nessuna anomalia.</div>';
  }
  el.innerHTML = html;
}

// Nasconde campo tecnico per il ruolo tecnico (esegue lui stesso)
function nascondiCampoTecnico() {
  var f = ge('tc5-field');
  if(f) f.style.display = ROLE === 'tecnico' ? 'none' : '';
  // Imposta automaticamente ME come tecnico
  var sel = ge('tc5');
  if(sel && ROLE === 'tecnico') sel.value = ME.id;
}

