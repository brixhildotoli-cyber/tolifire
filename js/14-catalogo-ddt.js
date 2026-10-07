// ── CATALOGO & DDT ───────────────────────────────────────────
var RUOLI_PREZZI = ['titolare','commerciale','segreteria','contabile','rappresentante'];
var _catalogo = [];
var _ddtRighe = [];
var _ddtSearchTimeout = null;

async function loadCatalogo() {
  if(_catalogo.length > 0) return _catalogo;
  var res = await db.from('prodotti_catalogo').select('*').eq('attivo', true).order('codice');
  _catalogo = res.data || [];
  return _catalogo;
}

function canSeePrezzi() {
  return RUOLI_PREZZI.indexOf(ROLE) !== -1;
}

// Aggiorna openM per DDT
var _origOpenM = openM;
openM = function(id) {
  _origOpenM(id);
  if(id === 'm-ddt') {
    initDDTModal();
  }
};

async function initDDTModal() {
  // Popola clienti
  var sel = ge('ddt-cli');
  if(sel) {
    sel.innerHTML = '<option value="">Seleziona...</option>' +
      CLIS.map(function(c) { return '<option value="' + c.id + '">' + esc(c.ragione_sociale) + '</option>'; }).join('');
    sel.onchange = function() { caricaSediDDT(this.value); };
  }
  // Popola OdL
  var odlSel = ge('ddt-odl');
  if(odlSel) {
    odlSel.innerHTML = '<option value="">Nessuno</option>' +
      ODLS.map(function(o) {
        var cli = o.clienti && o.clienti.ragione_sociale ? o.clienti.ragione_sociale : '';
        return '<option value="' + o.id + '">#' + (o.numero||'—') + ' ' + cli + '</option>';
      }).join('');
  }
  // Data di oggi
  var dEl = ge('ddt-data'); if(dEl) dEl.value = new Date().toISOString().split('T')[0];
  // Reset righe
  _ddtRighe = [];
  renderRigheDDT();
  // Precarica catalogo
  await loadCatalogo();
}

function cercaProdottoDDT() {
  clearTimeout(_ddtSearchTimeout);
  _ddtSearchTimeout = setTimeout(function() { _cercaProdottiAsync(); }, 250);
}

async function caricaSediDDT(clienteId) {
  var sel = ge('ddt-luogo');
  if(!sel) return;
  sel.innerHTML = '<option value="">Sede legale (default)</option>';
  if(!clienteId) return;
  // Carica dati cliente (sede legale)
  var rc = await db.from('clienti').select('ragione_sociale, indirizzo_fattura, citta_fattura, cap_fattura, citta, piva').eq('id', clienteId).single();
  if(rc.data) {
    var c = rc.data;
    var sedeLegale = [c.indirizzo_fattura, (c.cap_fattura||'') + ' ' + (c.citta_fattura||c.citta||'')].filter(function(x){return x && x.trim();}).join(', ');
    if(sedeLegale) {
      sel.innerHTML = '<option value="">Sede legale (default)</option>' +
        '<option value="' + sedeLegale + '">' + sedeLegale + '</option>';
    }
  }
  // Carica sedi aggiuntive
  var rs = await db.from('sedi_cliente').select('*').eq('cliente_id', clienteId).order('tipo');
  if(rs.data && rs.data.length) {
    rs.data.forEach(function(s) {
      var addr = [s.indirizzo, (s.cap||'') + ' ' + (s.citta||'')].filter(function(x){return x && x.trim();}).join(', ');
      var label = (s.tipo ? s.tipo + ' — ' : '') + addr;
      var opt = document.createElement('option');
      opt.value = addr;
      opt.textContent = label;
      sel.appendChild(opt);
    });
  }
}

async function _cercaProdottiAsync() {
  var q = (ge("ddt-search-prod").value || "").toLowerCase().trim();
  var resEl = ge("ddt-search-results");
  if (!q || q.length < 2) { resEl.style.display = "none"; return; }
  if (!_catalogo.length) {
    resEl.style.display = "block";
    resEl.innerHTML = "<div style=\"padding:10px;color:var(--m);font-size:13px\">Caricamento catalogo...</div>";
    await loadCatalogo();
  }
  if (!_catalogo.length) {
    resEl.style.display = "block";
    resEl.innerHTML = "<div style=\"padding:10px;color:var(--r);font-size:13px\">Catalogo vuoto. Sincronizza prima da TOLI-FIRE.html</div>";
    return;
  }
  var found = _catalogo.filter(function(p) {
    return p.codice.toLowerCase().includes(q) || p.articolo.toLowerCase().includes(q);
  }).slice(0, 30);
  if (!found.length) {
    resEl.style.display = "block";
    resEl.innerHTML = "<div style=\"padding:10px;color:var(--m);font-size:13px\">Nessun prodotto trovato</div>";
    return;
  }
  var html = "";
  for (var i = 0; i < found.length; i++) {
    var p = found[i];
    var prezzo = canSeePrezzi() ? " <b style=\"color:var(--g)\">\u20ac" + p.prezzo_cliente.toFixed(2) + "</b>" : "";
    var um = p.um ? " (" + p.um + ")" : "";
    html += "<div style=\"padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:0.5px solid var(--bo)\"" +
      " onmouseover=\"this.style.background=&quot;var(--bg)&quot;\"" +
      " onmouseout=\"this.style.background=&quot;&quot;\"" +
      " onclick=\"aggiungiDaCatalogo(&quot;" + p.id + "&quot;)\">" +
      "<span style=\"font-family:monospace;font-size:11px;color:var(--m)\">" + p.codice + "</span> " +
      p.articolo + um + prezzo + "</div>";
  }
  resEl.style.display = "block";
  resEl.innerHTML = html;
}

async function aggiungiDaCatalogo(prodId) {
  var prod = _catalogo.find(function(p) { return p.id === prodId; });
  if(!prod) return;
  _ddtRighe.push({
    prodotto_id: prod.id,
    codice: prod.codice,
    descrizione: prod.articolo,
    um: prod.um || '',
    quantita: 1,
    prezzo_unitario: prod.prezzo_cliente || 0,
    _prod: prod
  });
  ge('ddt-search-prod').value = '';
  ge('ddt-search-results').style.display = 'none';
  renderRigheDDT();
}

function aggiungiRigaManuale() {
  _ddtRighe.push({
    prodotto_id: null,
    codice: '',
    descrizione: '',
    um: '',
    quantita: 1,
    prezzo_unitario: 0
  });
  renderRigheDDT();
}

function rimuoviRiga(i) {
  _ddtRighe.splice(i, 1);
  renderRigheDDT();
}

function aggiornaRiga(i, campo, valore) {
  _ddtRighe[i][campo] = campo === 'quantita' || campo === 'prezzo_unitario' ? parseFloat(valore)||0 : valore;
  aggiornaRigaCalcolo(i);
}

function aggiornaRigaCalcolo(i) {
  var el = ge('riga-tot-' + i);
  if(el) {
    var r = _ddtRighe[i];
    var tot = (r.quantita||0) * (r.prezzo_unitario||0);
    el.textContent = '€ ' + tot.toFixed(2);
  }
  aggiornaTotaleDDT();
}

function aggiornaTotaleDDT() {
  var tot = _ddtRighe.reduce(function(s, r) { return s + (r.quantita||0)*(r.prezzo_unitario||0); }, 0);
  var el = ge('ddt-totale'); if(el) el.textContent = tot.toFixed(2);
}

function renderRigheDDT() {
  var el = ge('ddt-righe-list'); if(!el) return;
  if(!_ddtRighe.length) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--m);font-size:13px">Nessuna riga. Cerca un prodotto o aggiungi una riga manuale.</div>';
    aggiornaTotaleDDT();
    return;
  }
  var mostraPrezzi = canSeePrezzi();
  el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    '<thead><tr style="background:var(--bg)">' +
    '<th style="padding:6px 8px;text-align:left;font-weight:500;color:var(--m)">Codice</th>' +
    '<th style="padding:6px 8px;text-align:left;font-weight:500;color:var(--m)">Descrizione</th>' +
    '<th style="padding:6px 8px;text-align:left;font-weight:500;color:var(--m)">UM</th>' +
    '<th style="padding:6px 8px;text-align:center;font-weight:500;color:var(--m)">Qta</th>' +
    (mostraPrezzi ? '<th style="padding:6px 8px;text-align:right;font-weight:500;color:var(--m)">Prezzo €</th>' : '') +
    (mostraPrezzi ? '<th style="padding:6px 8px;text-align:right;font-weight:500;color:var(--m)">Totale</th>' : '') +
    '<th style="padding:6px 8px"></th>' +
    '</tr></thead><tbody>' +
    _ddtRighe.map(function(r, i) {
      return '<tr style="border-bottom:0.5px solid var(--bo)">' +
        '<td style="padding:4px 8px"><input type="text" value="' + (r.codice||'') + '" placeholder="Codice" style="width:80px;padding:4px 6px;border:0.5px solid var(--bo);border-radius:4px;font-size:12px" onchange="aggiornaRiga(' + i + ',\'codice\',this.value)"></td>' +
        '<td style="padding:4px 8px"><input type="text" value="' + (esc(r.descrizione)||'').replace(/"/g,'&quot;') + '" placeholder="Descrizione" style="width:100%;padding:4px 6px;border:0.5px solid var(--bo);border-radius:4px;font-size:12px" onchange="aggiornaRiga(' + i + ',\'descrizione\',this.value)"></td>' +
        '<td style="padding:4px 8px"><input type="text" value="' + (r.um||'') + '" placeholder="UM" style="width:50px;padding:4px 6px;border:0.5px solid var(--bo);border-radius:4px;font-size:12px" onchange="aggiornaRiga(' + i + ',\'um\',this.value)"></td>' +
        '<td style="padding:4px 8px;text-align:center"><input type="number" value="' + (r.quantita||1) + '" min="0" style="width:60px;padding:4px 6px;border:0.5px solid var(--bo);border-radius:4px;font-size:12px;text-align:center" oninput="aggiornaRiga(' + i + ',\'quantita\',this.value)"></td>' +
        (mostraPrezzi ? '<td style="padding:4px 8px;text-align:right"><input type="number" value="' + (r.prezzo_unitario||0).toFixed(2) + '" min="0" step="0.01" style="width:70px;padding:4px 6px;border:0.5px solid var(--bo);border-radius:4px;font-size:12px;text-align:right" oninput="aggiornaRiga(' + i + ',\'prezzo_unitario\',this.value)"></td>' : '') +
        (mostraPrezzi ? '<td style="padding:4px 8px;text-align:right;font-weight:500" id="riga-tot-' + i + '">€ ' + ((r.quantita||1)*(r.prezzo_unitario||0)).toFixed(2) + '</td>' : '') +
        '<td style="padding:4px 8px"><button class="btn sm" style="color:var(--r);padding:3px 8px" onclick="rimuoviRiga(' + i + ')">✕</button></td>' +
        '</tr>';
    }).join('') +
    '</tbody></table>';
  aggiornaTotaleDDT();
}

function apriNuovoDDT() {
  ge('ddt-id').value = '';
  ge('ddt-modal-title').textContent = 'Nuovo DDT';
  ge('ddt-save-btn').textContent = 'Crea DDT';
  ge('ddt-causale').value = '';
  ge('ddt-note').value = '';
  ge('ddt-luogo').value = '';
  ge('ddt-search-prod').value = '';
  openM('m-ddt');
}

async function modificaDDT(ddtId) {
  if (ROLE !== 'segreteria' && ROLE !== 'titolare') {
    toast('Non hai i permessi per modificare il DDT', 'err');
    return;
  }

  var res = await db
    .from('ddt')
    .select('id, numero, cliente_id, data_emissione, causale, note, odl_id, luogo_consegna')
    .eq('id', ddtId)
    .single();

  if (res.error) {
    toast('Errore caricamento DDT: ' + res.error.message, 'err');
    return;
  }

  var righeRes = await db
    .from('ddt_righe')
    .select('id, prodotto_id, codice, descrizione, um, quantita, prezzo_unitario')
    .eq('ddt_id', ddtId)
    .order('id');

  if (righeRes.error) {
    toast('Errore caricamento righe: ' + righeRes.error.message, 'err');
    return;
  }

  var ddt = res.data;

  await initDDTModal();

  ge('ddt-id').value = ddt.id;
  ge('ddt-modal-title').textContent = 'Modifica DDT n. ' + (ddt.numero || '—');
  ge('ddt-save-btn').textContent = 'Salva modifiche';

  ge('ddt-cli').value = ddt.cliente_id || '';
  ge('ddt-data').value = ddt.data_emissione || '';
  ge('ddt-causale').value = ddt.causale || '';
  ge('ddt-note').value = ddt.note || '';
  ge('ddt-odl').value = ddt.odl_id || '';

  await caricaSediDDT(ddt.cliente_id);

  if (ddt.luogo_consegna) {
    var luogoEsiste = Array.from(ge('ddt-luogo').options)
      .some(function(opzione) { return opzione.value === ddt.luogo_consegna; });

    if (!luogoEsiste) {
      var opzione = document.createElement('option');
      opzione.value = ddt.luogo_consegna;
      opzione.textContent = ddt.luogo_consegna;
      ge('ddt-luogo').appendChild(opzione);
    }

    ge('ddt-luogo').value = ddt.luogo_consegna;
  }

  _ddtRighe = (righeRes.data || []).map(function(riga) {
    return {
      prodotto_id: riga.prodotto_id || null,
      codice: riga.codice || '',
      descrizione: riga.descrizione || '',
      um: riga.um || '',
      quantita: Number(riga.quantita) || 1,
      prezzo_unitario: Number(riga.prezzo_unitario) || 0
    };
  });

  renderRigheDDT();
  _origOpenM('m-ddt');
}

async function saveDdt() {
  var cid = v('ddt-cli');
  var data = v('ddt-data');
  var ddtId = v('ddt-id');
  var inModifica = !!ddtId;

  if (!cid || !data) {
    toast('Cliente e data obbligatori', 'err');
    return;
  }

  if (!_ddtRighe.length) {
    toast('Aggiungi almeno una riga', 'err');
    return;
  }

  var payload = {
    cliente_id: cid,
    data_emissione: data,
    causale: v('ddt-causale') || null,
    note: v('ddt-note') || null,
    odl_id: v('ddt-odl') || null,
    luogo_consegna: v('ddt-luogo') || null
  };

  Object.keys(payload).forEach(function(k) {
    if (payload[k] === null) delete payload[k];
  });

  var res;

  if (inModifica) {
    res = await db
      .from('ddt')
      .update(payload)
      .eq('id', ddtId)
      .select()
      .single();
  } else {
    payload.tecnico_id = ME.id;
    res = await db
      .from('ddt')
      .insert(payload)
      .select()
      .single();
  }

  if (res.error) {
    toast('Errore DDT: ' + res.error.message, 'err');
    return;
  }

  ddtId = res.data.id;

  if (inModifica) {
    var eliminaRighe = await db
      .from('ddt_righe')
      .delete()
      .eq('ddt_id', ddtId);

    if (eliminaRighe.error) {
      toast('Errore aggiornamento righe: ' + eliminaRighe.error.message, 'err');
      return;
    }
  }

  var righePayload = _ddtRighe.map(function(r) {
    return {
      ddt_id: ddtId,
      prodotto_id: r.prodotto_id || null,
      codice: r.codice || null,
      descrizione: r.descrizione || '—',
      um: r.um || null,
      quantita: r.quantita || 1,
      prezzo_unitario: canSeePrezzi() ? (r.prezzo_unitario || 0) : 0
    };
  });

  var resRighe = await db.from('ddt_righe').insert(righePayload);

  if (resRighe.error) {
    toast('Errore righe: ' + resRighe.error.message, 'err');
    return;
  }

  closeM('m-ddt');
  await loadDocs();

  toast(inModifica ? 'DDT aggiornato' : 'DDT creato', 'ok');

  if (!inModifica && confirm('DDT creato! Vuoi stampare/scaricare il PDF?')) {
    await stampaDDT(ddtId);
  }
}

async function stampaDDT(ddtId) {
  try {
    await caricaLibreriePDF();
    // Carica dati DDT
    var res = await db.from('ddt')
      .select('id, numero, data_emissione, causale, note, luogo_consegna, clienti(ragione_sociale, piva, codice_fiscale, indirizzo_fattura, citta_fattura, cap_fattura, citta), ordini_lavoro(numero)')
      .eq('id', ddtId).single();
    if(res.error) throw res.error;
    var ddt = res.data;

    // Carica righe
    var res2 = await db.from('ddt_righe').select('*').eq('ddt_id', ddtId).order('id');
    if(res2.error) throw res2.error;
    var righe = res2.data || [];

    var { jsPDF } = window.jspdf;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Header azienda
    doc.setFontSize(20);
    doc.setTextColor(8, 80, 65);
    doc.setFont('helvetica', 'bold');
    doc.text('TOLI FIRE', 15, 20);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('Via Bellatalla 62, Ospedaletto — 56121 Pisa', 15, 26);
doc.text('P.IVA: 02490980501 — amministrazione@toli-fire.com', 15, 30);

    // Titolo DDT
    doc.setFontSize(16);
    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.text('DOCUMENTO DI TRASPORTO', 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Data: ' + (ddt.data_emissione || '—'), 150, 30);
    if(ddt.ordini_lavoro) doc.text('Intervento: #' + ddt.ordini_lavoro.numero, 150, 35);

    // Dati cliente - box destinatario
    var cli = ddt.clienti || {};
    var sede = [
      esc(cli.indirizzo_fattura),
      (cli.cap_fattura ? cli.cap_fattura + ' ' : '') + (esc(cli.citta_fattura) || esc(cli.citta) || '')
    ].filter(Boolean);

    var boxH = 10 + (sede.length * 5) + (cli.piva ? 5 : 0) + (cli.codice_fiscale ? 5 : 0) + 4;
    doc.setFillColor(245, 245, 245);
    doc.rect(15, 38, 90, boxH, 'F');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('DESTINATARIO', 17, 43);
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.text(cli.ragione_sociale || '—', 17, 49);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    var yy = 54;
    sede.forEach(function(line) { doc.text(line, 17, yy); yy += 5; });
    if (cli.piva) { doc.text('P.IVA: ' + cli.piva, 17, yy); yy += 5; }
    if (cli.codice_fiscale) { doc.text('C.F.: ' + cli.codice_fiscale, 17, yy); yy += 5; }

    // Luogo di consegna (se diverso da sede)
    if (ddt.luogo_consegna) {
      doc.setFillColor(230, 245, 235);
      doc.rect(110, 38, 85, 30, 'F');
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('LUOGO DI CONSEGNA', 112, 43);
      doc.setFontSize(9);
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      var lineeConsegna = doc.splitTextToSize(ddt.luogo_consegna, 80);
      doc.text(lineeConsegna, 112, 49);
      doc.setFont('helvetica', 'normal');
    }

    var startY = Math.max(38 + boxH + 4, 72);

    // Causale
    if(esc(ddt.causale)) {
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text('Causale: ' + ddt.causale, 15, startY);
      startY += 6;
    }

    // Tabella righe
    var mostraPrezzi = canSeePrezzi();
    var columns = ['Codice', 'Descrizione', 'UM', 'Qta'];
    if(mostraPrezzi) columns.push('Prezzo €', 'Totale €');

    var rows = righe.map(function(r) {
      var row = [r.codice || '—', r.descrizione, r.um || '—', r.quantita];
      if(mostraPrezzi) {
        row.push('€ ' + (r.prezzo_unitario||0).toFixed(2));
        row.push('€ ' + (r.totale||0).toFixed(2));
      }
      return row;
    });

    doc.autoTable({
      startY: startY + 2,
      head: [columns],
      body: rows,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [8, 80, 65], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: mostraPrezzi ? {
        0: { cellWidth: 25 },
        1: { cellWidth: 75 },
        2: { cellWidth: 15 },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' }
      } : {
        0: { cellWidth: 30 },
        1: { cellWidth: 110 },
        2: { cellWidth: 20 },
        3: { cellWidth: 20, halign: 'center' }
      }
    });

    // Totale
    if(mostraPrezzi) {
      var totale = righe.reduce(function(s, r) { return s + (r.totale||0); }, 0);
      var finalY = doc.lastAutoTable.finalY + 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Totale: € ' + totale.toFixed(2), 180, finalY, { align: 'right' });
    }

    // Note
    if(esc(ddt.note)) {
      var noteY = doc.lastAutoTable.finalY + (mostraPrezzi ? 12 : 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Note: ' + ddt.note, 15, noteY);
    }

    // Footer legale
    var footerY = 265;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(15, footerY, 195, footerY);
    footerY += 5;
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'bold');
    doc.text('CLAUSOLA DI CONSEGNA', 15, footerY);
    footerY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    var clausola = "Il presente documento, generato successivamente alla consegna della merce, attesta l'avvenuta consegna dei beni sopra elencati al destinatario indicato. " +
      "Eventuali contestazioni relative a vizi apparenti, ammanchi o difformita' rispetto all'ordine devono essere comunicate per iscritto entro 24 ore dalla consegna. " +
      "Decorso tale termine, la merce si intende accettata in conformita' a quanto indicato nel presente documento.";
    var lines = doc.splitTextToSize(clausola, 180);
    doc.text(lines, 15, footerY);
    footerY += lines.length * 3.5 + 4;
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text('Documento generato il ' + new Date().toLocaleDateString('it-IT') + ' — Toli Fire S.r.l.', 15, footerY);


    doc.save('DDT_' + (ddt.data_emissione||'').replace(/-/g,'') + '_' + (ddt.clienti?.ragione_sociale||'cliente').substring(0,20).replace(/\s/g,'_') + '.pdf');
    toast('PDF scaricato', 'ok');

  } catch(e) {
    console.error('PDF error:', e);
    toast('Errore PDF: ' + e.message, 'err');
  }
}

// ── CATALOGO PAGE (visibile a chi può vedere prezzi) ──────────

// ── IMPORT EXCEL CATALOGO ────────────────────────────────────

function aggiornaAnteprima() {
  var sconto = parseFloat(ge('import-sconto').value) || 0;
  if (sconto < 0) sconto = 0;
  if (sconto > 99) sconto = 99;
  var LISTINO = 100;
  var MINIMO = 3.00;
  var costo = LISTINO * (1 - sconto / 100);
  var cliente = Math.max(costo * 1.70, MINIMO);
  var nonCliente = Math.max(costo * 1.85, MINIMO);
  var grandi = Math.max(costo * 1.25, MINIMO);
  var fmt = function(n) { return '\u20ac ' + n.toFixed(2); };
  ge('ap-costo').textContent = fmt(costo);
  ge('ap-cliente').textContent = fmt(cliente);
  ge('ap-noncliente').textContent = fmt(nonCliente);
  ge('ap-grandi').textContent = fmt(grandi);
}

async function importaExcelCatalogo(input) {
  if (ROLE !== 'titolare') { toast('Solo il titolare può importare il catalogo', 'err'); return; }
  var file = input.files[0];
  if (!file) return;
  input.value = '';

  // Leggi sconto configurato nel modal (default 70%)
  var scontoEl = ge('import-sconto');
  var SCONTO = scontoEl ? (parseFloat(scontoEl.value) || 70) : 70;
  if (SCONTO < 0) SCONTO = 0;
  if (SCONTO > 99) SCONTO = 99;
  var MOLTIPLICATORE_COSTO = 1 - SCONTO / 100; // es. 70% sconto → pago 30%

  var bar = ge('catalogo-import-bar');
  var status = ge('catalogo-import-status');
  bar.style.display = 'block';
  status.textContent = '⏳ Lettura file (sconto ' + SCONTO + '%)...';

  try {
    await caricaLibreriaExcel();
    var arrayBuffer = await file.arrayBuffer();
    var workbook = XLSX.read(arrayBuffer, { type: 'array' });

    var prodotti = [];
    var PREZZO_MINIMO = 3.00;

    workbook.SheetNames.forEach(function(sheetName) {
      var ws = workbook.Sheets[sheetName];
      var jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      // Trova riga header (CODICE)
      var headerRow = -1;
      for (var i = 0; i < Math.min(10, jsonData.length); i++) {
        if (jsonData[i] && String(jsonData[i][0]).toUpperCase().includes('CODICE')) {
          headerRow = i; break;
        }
      }
      if (headerRow === -1) return;

      var categoriaCorrente = null;
      for (var r = headerRow + 1; r < jsonData.length; r++) {
        var row = jsonData[r];
        if (!row || row.every(function(c) { return c === null || c === ''; })) continue;

        var codice   = row[0];
        var articolo = row[1];
        var um       = row[2];
        var pagCat   = row[3];
        var listino  = row[4];

        // Riga di categoria (ha codice ma non listino)
        if (codice && !listino && articolo === null) {
          categoriaCorrente = String(codice);
          continue;
        }
        if (!codice || !listino || isNaN(parseFloat(listino))) continue;

        var l = parseFloat(listino);
        // Calcolo prezzi: sconto configurabile dal titolare
        var costo = l * MOLTIPLICATORE_COSTO; // es. 70% sconto → pago 30% del listino
        var prezzoCliente         = costo * 1.70;
        var prezzoNonCliente      = costo * 1.85;
        var prezzoGrandiQuantita  = costo * 1.25;
        prodotti.push({
          codice:                 String(codice).trim().toUpperCase(),
          articolo:               String(articolo || '').trim(),
          um:                     um ? String(um).trim() : null,
          pag_cat:                pagCat ? String(pagCat).trim() : null,
          listino_base:           l,
          prezzo_cliente:         Math.max(prezzoCliente, PREZZO_MINIMO),
          prezzo_non_cliente:     Math.max(prezzoNonCliente, PREZZO_MINIMO),
          prezzo_grandi_quantita: Math.max(prezzoGrandiQuantita, PREZZO_MINIMO),
          categoria:              categoriaCorrente,
          foglio:                 sheetName,
          attivo:                 true
        });
      }
    });

    if (!prodotti.length) {
      status.textContent = '⚠️ Nessun prodotto trovato. Verifica il formato del file.';
      return;
    }

    status.textContent = '⏳ Trovati ' + prodotti.length + ' prodotti. Caricamento su Supabase...';

    // Cancella tutto e reinserisci
    await db.from('prodotti_catalogo').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    var done = 0, errors = 0;
    var batchSize = 50;
    for (var i = 0; i < prodotti.length; i += batchSize) {
      var batch = prodotti.slice(i, i + batchSize);
      var res = await db.from('prodotti_catalogo').insert(batch);
      if (res.error) {
        console.error('Batch error:', res.error);
        // Prova uno ad uno per trovare il record problematico
        for (var j = 0; j < batch.length; j++) {
          var r1 = await db.from('prodotti_catalogo').insert(batch[j]);
          if (r1.error) {
            console.error('Record fallito:', batch[j].codice, r1.error.message, r1.error.details);
          }
        }
        errors++;
        // Aggiorna status con errore visibile
        status.textContent = '❌ Errore batch: ' + res.error.message + ' | ' + (res.error.details||res.error.hint||'');
      } else {
        done += batch.length;
      }
      status.textContent = '⏳ ' + done + '/' + prodotti.length + ' importati...';
    }

    _catalogo = []; // Reset cache
    if (errors === 0) {
      status.textContent = '✅ ' + prodotti.length + ' prodotti importati con successo!';
      bar.style.background = 'var(--gl)';
      bar.style.borderColor = 'var(--gm)';
    } else {
      status.textContent = '⚠️ ' + done + ' ok, ' + errors + ' batch falliti (vedi console)';
      bar.style.background = 'var(--al)';
    }
    setTimeout(function() { bar.style.display = 'none'; }, 4000);
    loadPaginaCatalogo();

  } catch(e) {
    console.error('Import error:', e);
    status.textContent = '❌ Errore: ' + e.message;
  }
}

async function loadPaginaCatalogo() {
  var el = ge('catalogo-content'); if(!el) return;
  el.innerHTML = '<div class="load">Caricamento...</div>';
  await loadCatalogo();
  if(!_catalogo.length) {
    el.innerHTML = '<div class="empty">Nessun prodotto nel catalogo.<br><small>Importa i prodotti da TOLI-FIRE.html o aggiungi manualmente.</small></div>';
    return;
  }
  var mostraPrezzi = canSeePrezzi();
  var byCategoria = {};
  _catalogo.forEach(function(p) {
    var cat = p.categoria || 'Altro';
    if(!byCategoria[cat]) byCategoria[cat] = [];
    byCategoria[cat].push(p);
  });
  var html = Object.keys(byCategoria).sort().map(function(cat) {
    return '<div style="margin-bottom:20px">' +
      '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--m);margin-bottom:8px;padding-bottom:4px;border-bottom:0.5px solid var(--bo)">' + cat + '</div>' +
      '<div class="tw"><table><thead><tr>' +
      '<th>Codice</th><th>Descrizione</th><th>UM</th>' +
      (mostraPrezzi ? '<th style="text-align:right">Cliente €</th>' : '') +
      (mostraPrezzi ? '<th style="text-align:right">Non cl. €</th>' : '') +
      (mostraPrezzi ? '<th style="text-align:right">Grandi Q. €</th>' : '') +
      (canSeePrezzi() ? '<th></th>' : '') +
      '</tr></thead><tbody>' +
      byCategoria[cat].map(function(p) {
        var editBtn = (ROLE==='titolare') ?
          '<button class="btn sm" onclick="openEditProdotto(\'' + p.id + '\')">Modifica</button>' : '';
        return '<tr>' +
          '<td style="font-family:monospace;font-size:12px">' + p.codice + '</td>' +
          '<td>' + p.articolo + '</td>' +
          '<td style="color:var(--m)">' + (p.um||'—') + '</td>' +
          (mostraPrezzi ? '<td style="text-align:right;font-weight:500' + (p.prezzo_cliente <= 3.00 ? ';color:var(--a)' : '') + '">€ ' + p.prezzo_cliente.toFixed(2) + '</td>' : '') +
          (mostraPrezzi ? '<td style="text-align:right;color:var(--m)' + (p.prezzo_non_cliente <= 3.00 ? ';color:var(--a)' : '') + '">€ ' + p.prezzo_non_cliente.toFixed(2) + '</td>' : '') +
          (mostraPrezzi ? '<td style="text-align:right;color:var(--m)' + (p.prezzo_grandi_quantita <= 3.00 ? ';color:var(--a)' : '') + '">€ ' + p.prezzo_grandi_quantita.toFixed(2) + '</td>' : '') +
          (canSeePrezzi() ? '<td>' + editBtn + '</td>' : '') +
          '</tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }).join('');
  el.innerHTML = html;
}

function openEditProdotto(id) {
  if(ROLE!=='titolare'){toast('Solo il titolare può modificare i prezzi','err');return;}
  var p = _catalogo.find(function(x) { return x.id === id; });
  if(!p) return;
  var nuovo = prompt('Nuovo listino base per ' + p.codice + ' (' + p.articolo + '):', p.listino_base.toFixed(2));
  if(nuovo === null) return;
  var val = parseFloat(nuovo);
  if(isNaN(val) || val < 0) { toast('Valore non valido', 'err'); return; }
  // Ricalcola
  var base = val - (val * 0.70);
  var MINIMO = 3.00;
  var payload = {
    listino_base: val,
    prezzo_cliente: Math.max(base + base*0.70, MINIMO),
    prezzo_non_cliente: Math.max(base + base*0.85, MINIMO),
    prezzo_grandi_quantita: Math.max(base + base*0.25, MINIMO),
    aggiornato_il: new Date().toISOString()
  };
  db.from('prodotti_catalogo').update(payload).eq('id', id).then(function(res) {
    if(res.error) { toast('Errore: ' + res.error.message, 'err'); return; }
    toast('Prodotto aggiornato', 'ok');
    _catalogo = [];
    loadPaginaCatalogo();
  });
}

async function addProdottoCatalogo() {
  if(ROLE!=='titolare'){toast('Solo il titolare può aggiungere prodotti','err');return;}
  var codice = prompt('Codice prodotto:'); if(!codice) return;
  var articolo = prompt('Descrizione:'); if(!articolo) return;
  var listino = parseFloat(prompt('Prezzo listino base (€):')||'0');
  if(isNaN(listino) || listino < 0) { toast('Prezzo non valido', 'err'); return; }
  var um = prompt('Unità di misura (es: NR, PZ, KG):') || '';
  var categoria = prompt('Categoria (opzionale):') || '';
  var base = listino - (listino * 0.70);
  var MINIMO = 3.00;
  var payload = {
    codice: codice.trim().toUpperCase(),
    articolo: articolo.trim(),
    um: um.trim() || null,
    categoria: categoria.trim() || null,
    listino_base: listino,
    prezzo_cliente: Math.max(base + base*0.70, MINIMO),
    prezzo_non_cliente: Math.max(base + base*0.85, MINIMO),
    prezzo_grandi_quantita: Math.max(base + base*0.25, MINIMO)
  };
  var res = await db.from('prodotti_catalogo').insert(payload);
  if(res.error) { 
    toast('Errore: ' + res.error.message + ' | ' + (res.error.details||'') + ' | ' + (res.error.hint||''), 'err'); 
    console.error('Insert error full:', res.error);
    return; 
  }
  toast('Prodotto aggiunto', 'ok');
  _catalogo = [];
  loadPaginaCatalogo();
}



