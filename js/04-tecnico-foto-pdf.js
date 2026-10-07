// ── FOTO TECNICO ─────────────────────────────────────────────
var _fotoTecnico = []; // {file, url, didascalia}

function anteprimaFotoTecnico(input) {
  var nuovi = Array.from(input.files);
  input.value = '';
  nuovi.forEach(function(f) {
    _fotoTecnico.push({file: f, url: URL.createObjectURL(f), didascalia: ''});
  });
  renderFotoPreview();
}

function renderFotoPreview() {
  var div = ge('tc-foto-preview');
  if(!div) return;
  if(!_fotoTecnico.length) { div.innerHTML = ''; return; }
  div.innerHTML = _fotoTecnico.map(function(f, i) {
    var isVideo = f.file.type.startsWith('video/');
    var isPdf = f.file.type === 'application/pdf';
    var thumb = isVideo
      ? '<div style="width:80px;height:80px;background:#000;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px">🎥</div>'
      : isPdf
        ? '<div style="width:80px;height:80px;background:var(--bg);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px">📄</div>'
        : '<img src="'+f.url+'" style="width:80px;height:80px;object-fit:cover;border-radius:8px">';
    return '<div style="position:relative;text-align:center">' +
      thumb +
      '<div onclick="rimuoviFoto('+i+')" style="position:absolute;top:-4px;right:-4px;background:var(--r);color:white;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer">✕</div>' +
      '<input placeholder="Nota..." value="'+f.didascalia+'" oninput="_fotoTecnico['+i+'].didascalia=this.value" style="width:80px;font-size:10px;margin-top:4px;border:0.5px solid var(--bo);border-radius:4px;padding:2px 4px">' +
    '</div>';
  }).join('');
}

function rimuoviFoto(i) {
  _fotoTecnico.splice(i, 1);
  renderFotoPreview();
}

async function uploadFotoIntervento(odlId, schedaId) {
  if(!_fotoTecnico.length) return;
  for(var i=0; i<_fotoTecnico.length; i++) {
    var f = _fotoTecnico[i];
    var ext = f.file.name.split('.').pop();
    var path = 'odl/' + odlId + '/' + Date.now() + '_' + i + '.' + ext;
    var tipo = f.file.type.startsWith('video/') ? 'video' : f.file.type === 'application/pdf' ? 'documento' : 'foto';
    var up = await db.storage.from('foto-interventi').upload(path, f.file);
    if(!up.error) {
      await db.from('schede_foto').insert({
        scheda_id: schedaId,
        odl_id: odlId,
        storage_path: path,
        nome_file: f.file.name,
        didascalia: f.didascalia || null,
        tipo: tipo,
        caricato_da: ME.id
      });
    }
  }
  _fotoTecnico = [];
  renderFotoPreview();
}

// ── PDF RAPPORTO INTERVENTO (stile Toli Fire) ─────────────────
async function stampaRapportoIntervento(schedaId) {
 if (!(await preparaPDF())) return;
  var r = await db.from('schede_lavoro')
    .select('*, clienti(ragione_sociale,indirizzo_fattura,citta_fattura,citta), ordini_lavoro(tipo,sede_id), utenti!schede_lavoro_tecnico_id_fkey(nome,cognome)')
    .eq('id', schedaId).single();
  if(r.error) { toast('Errore caricamento scheda','err'); return; }
  var s = r.data;

  // Carica impostazioni azienda
  var ri = await db.from('impostazioni').select('*').eq('id',1).maybeSingle();
  var az = ri.data || {};

  // Carica foto
  var rf = await db.from('schede_foto').select('*').eq('scheda_id', schedaId);
  var foto = rf.data || [];

  // Carica presidi aggiornati
  var rp = await db.from('impianti')
    .select('tipo,matricola,ubicazione,data_ultimo_controllo,stato,note')
    .eq('cliente_id', s.cliente_id)
    .order('tipo');
  var presidi = rp.data || [];

  var { jsPDF } = window.jspdf;
  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  var W = 210, M = 15;

  // ── HEADER ────────────────────────────────
  doc.setFillColor(8, 80, 65);
  doc.rect(0, 0, W, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica','bold');
  doc.text('TOLI FIRE', M, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica','normal');
  doc.text(az.ragione_sociale || 'TOLI S.R.L.', M, 20);
  doc.text('P.I. ' + (az.piva || '02490980501'), M, 25);
  doc.text((az.indirizzo || 'VIA ARCHIMEDE BELLATALLA 98') + ', ' + (az.citta || 'PISA'), M, 30);

  // Numero scheda e data a destra
  doc.setFontSize(11);
  doc.setFont('helvetica','bold');
  doc.text('RAPPORTO DI INTERVENTO', W - M, 13, {align:'right'});
  doc.setFontSize(9);
  doc.setFont('helvetica','normal');
  doc.text('N° ' + (s.numero || '—'), W - M, 19, {align:'right'});
  doc.text('Data: ' + (s.data_intervento ? new Date(s.data_intervento+'T00:00:00').toLocaleDateString('it-IT') : '—'), W - M, 24, {align:'right'});
  if(s.ora_inizio) doc.text('Ore: ' + s.ora_inizio + (s.ora_fine ? ' - ' + s.ora_fine : ''), W - M, 29, {align:'right'});

  doc.setTextColor(30, 30, 30);
  var y = 42;

  // ── CLIENTE ───────────────────────────────
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, W - M*2, 22, 'F');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('CLIENTE', M + 3, y + 5);
  doc.setFontSize(11);
  doc.setFont('helvetica','bold');
  doc.setTextColor(20, 20, 20);
  doc.text(s.clienti?.ragione_sociale || '—', M + 3, y + 11);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  var addr = [s.clienti?.indirizzo_fattura, s.clienti?.citta_fattura || s.clienti?.citta].filter(Boolean).join(', ');
  if(addr) doc.text(addr, M + 3, y + 17);

  // Tecnico a destra
  doc.setFontSize(8);
  doc.setTextColor(120,120,120);
  doc.text('TECNICO', W - M - 55, y + 5);
  doc.setFontSize(10);
  doc.setFont('helvetica','bold');
  doc.setTextColor(20,20,20);
  var tecNome = s.utenti ? s.utenti.nome + ' ' + s.utenti.cognome : '—';
  doc.text(tecNome, W - M - 55, y + 11);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  var tipoLabel = {ordinario_programmato:'Manutenzione ordinaria',ordinario_chiamata:'Su chiamata',straordinario:'Straordinario',corso:'Corso'}[s.ordini_lavoro?.tipo] || '—';
  doc.text(tipoLabel, W - M - 55, y + 17);

  y += 27;

  // ── ESITO ─────────────────────────────────
  var esitoColors = {conforme:[39,174,96],conforme_osservazioni:[243,156,18],non_conforme:[231,76,60],non_conforme_urgente:[192,57,43]};
  var esitoLabels = {conforme:'CONFORME',conforme_osservazioni:'CONFORME CON OSSERVAZIONI',non_conforme:'NON CONFORME',non_conforme_urgente:'NON CONFORME — URGENTE'};
  var ec = esitoColors[s.esito] || [100,100,100];
  doc.setFillColor(ec[0], ec[1], ec[2]);
  doc.rect(M, y, W - M*2, 10, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(11);
  doc.setFont('helvetica','bold');
  doc.text('ESITO: ' + (esitoLabels[s.esito] || s.esito || '—'), W/2, y+7, {align:'center'});
  y += 15;

  doc.setTextColor(30,30,30);

  // ── LAVORI ESEGUITI ───────────────────────
  if(esc(s.lavori_eseguiti)) {
    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    doc.setTextColor(80,80,80);
    doc.text('LAVORI ESEGUITI / MATERIALI UTILIZZATI', M, y);
    y += 4;
    doc.setFont('helvetica','normal');
    doc.setTextColor(30,30,30);
    var lavLines = doc.splitTextToSize(s.lavori_eseguiti, W - M*2);
    doc.text(lavLines, M, y);
    y += lavLines.length * 4 + 4;
  }

  // ── ANOMALIE ──────────────────────────────
  if(esc(s.anomalie_rilevate)) {
    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    doc.setTextColor(80,80,80);
    doc.text('ANOMALIE RILEVATE', M, y);
    y += 4;
    doc.setFont('helvetica','normal');
    doc.setFillColor(255, 248, 220);
    var anomLines = doc.splitTextToSize(s.anomalie_rilevate, W - M*2 - 4);
    doc.rect(M, y-2, W-M*2, anomLines.length*4+4, 'F');
    doc.setTextColor(120,60,0);
    doc.text(anomLines, M+2, y+2);
    y += anomLines.length * 4 + 8;
    doc.setTextColor(30,30,30);
  }

  // ── PRESIDI CONTROLLATI ───────────────────
  if(presidi.length) {
    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    doc.setTextColor(80,80,80);
    doc.text('PRESIDI CONTROLLATI', M, y);
    y += 2;
    var tipiLabel = {estintore:'Estintore',porta_rei:'Porta REI',idrante:'Idrante',naspo:'Naspo',luce_emergenza:'Luce emergenza',pompa_antincendio:'Pompa AI',centrale_rivelazione:'Centrale',sprinkler:'Sprinkler',uscita_emergenza:'Uscita emerg.'};
    var stati = {ok:'✓',anomalia:'⚠',scaduto:'✗',fuori_servizio:'✗'};
    doc.autoTable({
      startY: y,
      head: [['Tipo','Matricola','Ubicazione','Esito','Note']],
      body: presidi.map(function(p){return [tipiLabel[p.tipo]||p.tipo, p.matricola||'—', p.ubicazione||'—', stati[p.stato]||'—', p.note||''];} ),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [8,80,65], textColor: 255 },
      columnStyles: { 0:{cellWidth:30}, 1:{cellWidth:25}, 2:{cellWidth:65}, 3:{cellWidth:12,halign:'center'}, 4:{cellWidth:40} },
      margin: { left: M, right: M }
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── STRAORDINARIO ─────────────────────────
  if(s.intervento_straordinario_richiesto && y < 240) {
    doc.setFillColor(255, 235, 235);
    var strLines = doc.splitTextToSize('INTERVENTO STRAORDINARIO RICHIESTO: ' + (s.descrizione_intervento_necessario||''), W-M*2-4);
    doc.rect(M, y-2, W-M*2, strLines.length*4+6, 'F');
    doc.setTextColor(150,0,0);
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.text(strLines, M+2, y+2);
    y += strLines.length * 4 + 8;
    doc.setTextColor(30,30,30);
  }

  // ── FIRMA ─────────────────────────────────
  if(y > 240) { doc.addPage(); y = 20; }
  y = Math.max(y, 230);
  doc.setDrawColor(180,180,180);
  doc.setLineWidth(0.3);
  doc.line(M, y, M+70, y);
  doc.line(W-M-70, y, W-M, y);
  doc.setFontSize(8);
  doc.setTextColor(120,120,120);
  doc.text('Firma tecnico', M, y+4);
  doc.text('Firma cliente: ' + (s.nome_firmatario||''), W-M-70, y+4);

  // Footer
  doc.setFontSize(7);
  doc.text('Documento generato il ' + new Date().toLocaleDateString('it-IT') + ' — ' + (az.ragione_sociale||'Toli Fire') + ' — P.I. ' + (az.piva||'02490980501'), W/2, 290, {align:'center'});

  var nomeFile = 'Rapporto_' + (s.data_intervento||'').replace(/-/g,'') + '_' + (s.clienti?.ragione_sociale||'cliente').substring(0,15).replace(/\s/g,'_') + '.pdf';
  doc.save(nomeFile);
  toast('✅ PDF rapporto scaricato', 'ok');
}

// ── PDF RELAZIONE PORTE REI ───────────────────────────────────
async function stampaRelazionePorteREI(schedaId) {
  if (!(await preparaPDF())) return;
  var r = await db.from('schede_lavoro')
    .select('*, clienti(ragione_sociale,indirizzo_fattura,citta_fattura,citta), utenti!schede_lavoro_tecnico_id_fkey(nome,cognome)')
    .eq('id', schedaId).single();
  if(r.error) { toast('Errore caricamento scheda','err'); return; }
  var s = r.data;

  var ri = await db.from('impostazioni').select('*').eq('id',1).maybeSingle();
  var az = ri.data || {};

  // Carica TUTTI i presidi del cliente (non solo porte)
  var rp = await db.from('impianti')
    .select('*')
    .eq('cliente_id', s.cliente_id)
    .order('tipo').order('matricola');
  var tutti = rp.data || [];

  // Raggruppa per tipo
  var byTipo = {};
  tutti.forEach(function(p){
    if(!byTipo[p.tipo]) byTipo[p.tipo]=[];
    byTipo[p.tipo].push(p);
  });

  if(!tutti.length) { toast('Nessun presidio registrato per questo cliente','err'); return; }

  var { jsPDF } = window.jspdf;
  var W=210, M=15;

  // Una sezione per tipo presidio
  var tipiKeys = Object.keys(byTipo);
  var docCreato = false;
  var doc;

  tipiKeys.forEach(function(tipo, tipoIdx) {
    var presidi = byTipo[tipo];
    var checklist = CKL_PRESIDIO[tipo] || ['Verifica generale','Verifica funzionamento','Verifica segnaletica'];
    var titoloTipo = {
      porta_rei:'PORTE TAGLIAFUOCO REI',
      uscita_emergenza:'USCITE DI EMERGENZA',
      estintore:'ESTINTORI',
      idrante:'IDRANTI',
      naspo:'NASPI',
      luce_emergenza:'LUCI DI EMERGENZA',
      pompa_antincendio:'POMPE ANTINCENDIO',
      centrale_rivelazione:'CENTRALE RIVELAZIONE',
      sprinkler:'IMPIANTO SPRINKLER'
    }[tipo] || tipo.toUpperCase();

    presidi.forEach(function(p, pi) {
      if(!docCreato) {
        doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
        docCreato = true;
      } else {
        doc.addPage();
      }

      var y = 0;

      // ── HEADER ──
      doc.setFillColor(8,80,65);
      doc.rect(0,0,W,28,'F');
      doc.setTextColor(255,255,255);
      doc.setFontSize(16);
      doc.setFont('helvetica','bold');
      doc.text('TOLI FIRE', M, 12);
      doc.setFontSize(8);
      doc.setFont('helvetica','normal');
      doc.text((az.ragione_sociale||'TOLI S.R.L.') + ' — P.I. ' + (az.piva||'02490980501'), M, 18);
      doc.text((az.indirizzo||'VIA ARCHIMEDE BELLATALLA 98') + ' — ' + (az.citta||'PISA') + ' — Tel. ' + (az.telefono||'050.8054008'), M, 23);
      y = 35;

      // ── TITOLO RELAZIONE ──
      doc.setTextColor(30,30,30);
      doc.setFontSize(13);
      doc.setFont('helvetica','bold');
      doc.text('RELAZIONE VERIFICA ' + titoloTipo, W/2, y, {align:'center'});
      y += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica','normal');
      doc.setTextColor(80,80,80);
      var dataFmt = s.data_intervento ? new Date(s.data_intervento+'T00:00:00').toLocaleDateString('it-IT') : '—';
      doc.text("In data " + dataFmt + " e'stata effettuata la verifica delle " + titoloTipo, W/2, y, {align:'center'});
      y += 5;
      doc.text('I riscontri hanno dato i seguenti esiti:', W/2, y, {align:'center'});
      y += 10;

      // ── CLIENTE E INDIRIZZO ──
      doc.setTextColor(20,20,20);
      doc.setFontSize(10);
      doc.setFont('helvetica','bold');
      doc.text(s.clienti?.ragione_sociale||'—', M, y);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      var addr = [s.clienti?.indirizzo_fattura, s.clienti?.citta_fattura||s.clienti?.citta].filter(Boolean).join(' — ');
      if(addr) { y+=5; doc.text(addr, M, y); }
      y += 10;

      // ── BOX TIPO PORTA / PRESIDIO ──
      doc.setDrawColor(100,100,100);
      doc.setLineWidth(0.5);
      doc.rect(M, y, W-M*2, 20);
      doc.setFontSize(10);
      doc.setFont('helvetica','bold');
      doc.text('TIPO: ' + titoloTipo + (p.modello ? ' — ' + p.modello.toUpperCase() : ''), M+3, y+7);
      doc.text('MATRICOLA: ' + (p.matricola||'N/A'), M+3, y+14);
      doc.text('N. ' + (pi+1), W-M-20, y+7);
      if(p.ubicazione) doc.text('Ubicazione: ' + p.ubicazione, W/2, y+14);
      y += 26;

      // ── TABELLA CHECKLIST ──
      var rows = checklist.map(function(item) {
        // SI se stato ok, NO se anomalia/scaduto/fuori_servizio
        var si = p.stato === 'ok' ? 'X' : '';
        var no = p.stato !== 'ok' ? 'X' : '';
        var nota = (p.stato !== 'ok' && p.note) ? p.note.substring(0,40) : '';
        return [item, si, no, nota];
      });

      doc.autoTable({
        startY: y,
        head: [['ELENCO OPERAZIONI DI CONTROLLO','SI','NO','Note (interventi di riallineamento)']],
        body: rows,
        styles: { fontSize: 8.5, cellPadding: 2 },
        headStyles: { fillColor:[220,220,220], textColor:30, fontStyle:'bold', fontSize:8.5, halign:'center' },
        columnStyles: {
          0:{cellWidth:100},
          1:{cellWidth:12, halign:'center'},
          2:{cellWidth:12, halign:'center'},
          3:{cellWidth:W-M*2-124}
        },
        margin:{left:M, right:M}
      });
      y = doc.lastAutoTable.finalY + 8;

      // ── ESITO FINALE ──
      doc.setFontSize(9);
      doc.setFont('helvetica','normal');
      doc.setTextColor(30,30,30);
      doc.text('I riscontri hanno dato i seguenti esiti:', M, y);
      y += 5;
      doc.text('Pertanto il presidio verificato è da considerarsi:', M, y);
      y += 6;

      var isOk = p.stato === 'ok';
      var isAnomalia = p.stato === 'anomalia';
      doc.text((isOk?'X':'O') + '  Manutenzionato, efficiente e conforme', M+4, y); y+=5;
      doc.text((isAnomalia?'X':'O') + '  Manutenzionato, ma non conforme', M+4, y); y+=5;
      doc.text((p.stato==='fuori_servizio'?'X':'O') + '  Non riallineabile alla vigente normativa', M+4, y); y+=10;

      // ── FIRMA ──
      var firmY = Math.max(y, 255);
      doc.setDrawColor(180,180,180);
      doc.setLineWidth(0.3);
      doc.line(M, firmY, M+60, firmY);
      doc.line(W-M-60, firmY, W-M, firmY);
      doc.setFontSize(8);
      doc.setTextColor(120,120,120);
      doc.text('Il tecnico manutentore', M, firmY+4);
      var tecNome = s.utenti ? s.utenti.nome+' '+s.utenti.cognome : '—';
      doc.text(tecNome, W-M-60, firmY+4);

      // TOLI logo-footer
      doc.setFontSize(9);
      doc.setFont('helvetica','bold');
      doc.setTextColor(8,80,65);
      doc.text('TOLI s.r.l.', W-M-45, firmY-12);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7);
      doc.setTextColor(80,80,80);
      doc.text((az.indirizzo||'Via A. Bellatalla, 98')+' — '+(az.citta||'56121 PISA'), W-M-45, firmY-8);
      doc.text('Partita I.V.A. '+(az.piva||'02490980501'), W-M-45, firmY-4);
      doc.text('Tel. '+(az.telefono||'050.8054008'), W-M-45, firmY);
    });
  });

  if(!doc) { toast('Nessun presidio da stampare','err'); return; }
  var nomeFile = 'Relazione_Tecnica_'+(s.data_intervento||'').replace(/-/g,'')+'_'+(s.clienti?.ragione_sociale||'').substring(0,15).replace(/\s/g,'_')+'.pdf';
  doc.save(nomeFile);
  toast('✅ Relazione tecnica scaricata ('+tutti.length+' presidi)','ok');
}



// ── GESTIONE PRESIDI DAL TECNICO ─────────────────────────────
function apriAggiungiPresidioTec() {
  var cliId = v('tc1');
  if(!cliId) { toast('Seleziona prima il cliente','err'); return; }
  // Usa il modal presidio esistente con cliente preimpostato
  resetPF();
  ge('mpt').textContent = 'Nuovo presidio';
  ge('mpeid').value = '';
  ge('mpcl').value = cliId;
  openM('m-presidio');
}

async function editPresidioTec(pid) {
  // Carica presidio e apri modal modifica
  var r = await db.from('impianti').select('*').eq('id',pid).single();
  if(r.error) { toast('Errore','err'); return; }
  editP(pid);
}


