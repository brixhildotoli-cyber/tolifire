// ═══════════════════════════════════════════════════════════════════════
// PDF delle schede tecniche dal preventivo (richiesta di Erika dell'11/11)
// ═══════════════════════════════════════════════════════════════════════
// Nella scheda del preventivo (preventivo-detail, tab "Schede tecniche")
// il bottone "📄 Scarica le schede tecniche (PDF)" per Acquisti e titolare
// (informatico compreso): un PDF con le schede di rilievo del progetto del
// preventivo e le loro posizioni P-xx, pensato per poter arrivare al
// cliente. NESSUN SQL: legge solo tabelle che il ruolo già legge.
// Scelte:
// - dati dell'INGEGNERE (scheda.dati), non la copia di Acquisti per i
//   fornitori (dati_commerciali);
// - fuori dal PDF: blocco comune (contatti del primo contatto), foto e
//   video, campi foto, note interne per il calcolo e note tecniche (e ogni
//   campo "livello ingegnere" del catalogo), fonti dei dati normativi,
//   sede_id, nome della scheda (va nel titolo), note delle posizioni;
// - il PDF si scarica e basta, non si salva da nessuna parte.
// js/18 non si tocca: renderSchedePreventivo si avvolge da qui.
// ═══════════════════════════════════════════════════════════════════════

const RUOLI_PDF_SCHEDE_TECNICHE = ['commerciale', 'titolare'];
// Chiavi che non vanno mai nel PDF (oltre a campoSchedaDaElencare di js/18)
const CHIAVI_ESCLUSE_PDF_SCHEDE = ['note_calcolo', 'note_tecniche', 'dati_commerciali', 'fonti_normative', 'foto_video', 'sede_id', 'nome_scheda'];

function campoCatalogoPdfSchede(famiglia, codice) {
  if (typeof lavorazioneCatalogo !== 'function') return null;
  const l = lavorazioneCatalogo(famiglia);
  return ((l && l.lavorazioni_campi) || []).find(function(c) { return c.codice === codice; }) || null;
}

// true = il dato della scheda va nel PDF per il cliente
function campoNelPdfSchedeTecniche(chiave, valore, famiglia) {
  if (typeof campoSchedaDaElencare === 'function' && !campoSchedaDaElencare(chiave)) return false;
  if (CHIAVI_ESCLUSE_PDF_SCHEDE.includes(chiave)) return false;
  if (chiave === 'foto' || /^foto_/.test(chiave)) return false; // niente foto
  if (valore === null || valore === undefined || valore === '') return false;
  if (Array.isArray(valore)) {
    if (!valore.length) return false;
    const pareti = valore.every(function(r) { return r && typeof r === 'object' && ('larghezza' in r || 'angolo' in r); });
    const semplici = valore.every(function(r) { return r === null || typeof r !== 'object'; });
    if (!pareti && !semplici) return false;
  } else if (typeof valore === 'object') {
    return false;
  }
  const c = campoCatalogoPdfSchede(famiglia, chiave);
  if (c && (c.livello === 'ingegnere' || c.tipo === 'foto')) return false;
  return true;
}

// Campi "per posizione" del catalogo che vanno nel PDF (niente livello ingegnere)
function campiPosizionePdfSchede(famiglia) {
  if (typeof campiCatalogoPosizione !== 'function') return [];
  return campiCatalogoPosizione(famiglia).filter(function(c) {
    return c.livello !== 'ingegnere' && !CHIAVI_ESCLUSE_PDF_SCHEDE.includes(c.codice);
  });
}

function testoCampoPosizionePdf(c, val) {
  if (val === null || val === undefined || val === '' || typeof val === 'object') return '';
  if (val === 'non_noto') return 'Non noto';
  if (c.tipo === 'menu') {
    const voce = (c.valori_ammessi || []).find(function(x) { return x.valore === val; });
    return voce ? voce.etichetta : String(val);
  }
  if (c.tipo === 'si_no') return val === 'si' || val === true ? 'Sì' : 'No';
  if (c.tipo === 'numero' && typeof testoNumeroPosizione === 'function') {
    return testoNumeroPosizione(val) + (c.unita ? ' ' + c.unita : '');
  }
  return String(val);
}

function testoQuantitaPosizionePdf(q) {
  if (q === null || q === undefined || q === '') return '—';
  return typeof testoNumeroPosizione === 'function' ? testoNumeroPosizione(q) : String(q);
}

function nomeFilePdfSchede(testo) {
  return String(testo || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^0-9A-Za-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'cliente';
}

// Quante schede del progetto vanno nel PDF (il blocco comune no)
async function contaSchedePdfTecniche(progettoId) {
  const { count, error } = await db
    .from('progetti_tecnici_schede')
    .select('id', { count: 'exact', head: true })
    .eq('progetto_tecnico_id', progettoId)
    .neq('famiglia', 'comune');
  return error ? null : (count || 0);
}

// Barra con il bottone sopra il contenuto delle schede (fuori da
// pvd-schede-content, che renderSchedePreventivo riscrive ogni volta)
async function mostraBottonePdfSchedeTecniche() {
  const box = ge('pvd-schede-content');
  if (!box || !box.parentNode) return;
  let barra = ge('pvd-pdf-schede');
  if (!barra) {
    barra = document.createElement('div');
    barra.id = 'pvd-pdf-schede';
    barra.style.marginBottom = '12px';
    box.parentNode.insertBefore(barra, box);
  }
  barra.innerHTML = '';
  const progettoId = typeof currentPreventivoProgettoId !== 'undefined' ? currentPreventivoProgettoId : null;
  if (!progettoId || !RUOLI_PDF_SCHEDE_TECNICHE.includes(ROLE)) return;
  const quante = await contaSchedePdfTecniche(progettoId);
  if (progettoId !== currentPreventivoProgettoId) return; // nel frattempo si è aperto un altro preventivo
  if (quante === null) return;
  barra.innerHTML = quante
    ? '<button class="btn sm" id="pvd-pdf-schede-btn" onclick="scaricaPdfSchedeTecniche()">📄 Scarica le schede tecniche (PDF)</button>' +
      ' <span style="font-size:12px;color:var(--m)">Schede dell’ingegnere e posizioni, senza foto né note interne: si può mandare al cliente.</span>'
    : '<span style="font-size:12px;color:var(--m)">📄 PDF delle schede tecniche: nessuna scheda nel progetto.</span>';
}

// Prepara il PDF: { doc, nomeFile } oppure null (con il messaggio)
async function creaPdfSchedeTecniche(preventivoId) {
  if (!(await preparaPDF())) return null;
  if (typeof preparaSchedeMigrate === 'function') { try { await preparaSchedeMigrate(); } catch (e) { /* facoltativo */ } }
  if (typeof caricaCatalogoLavorazioni === 'function') { try { await caricaCatalogoLavorazioni(); } catch (e) { /* facoltativo */ } }

  const { data: preventivo, error } = await db
    .from('preventivi')
    .select('id, numero, progetto_tecnico_id, clienti(ragione_sociale), progetti_tecnici(titolo, tipologia)')
    .eq('id', preventivoId)
    .single();
  if (error || !preventivo) {
    toast('Errore lettura del preventivo: ' + (error ? error.message : 'non trovato'), 'err');
    return null;
  }
  if (!preventivo.progetto_tecnico_id) {
    toast('Il preventivo non ha un progetto tecnico: nessuna scheda', 'err');
    return null;
  }

  const { data: schedeLette, error: erroreSchede } = await db
    .from('progetti_tecnici_schede')
    .select('*')
    .eq('progetto_tecnico_id', preventivo.progetto_tecnico_id)
    .neq('famiglia', 'comune')
    .order('aggiornato_il', { ascending: false });
  if (erroreSchede) {
    toast('Errore lettura delle schede: ' + erroreSchede.message, 'err');
    return null;
  }
  const schede = ordinaSchedeRilievo(schedeLette || []);
  if (!schede.length) {
    toast('Nel progetto non c’è nessuna scheda tecnica', 'err');
    return null;
  }

  let posizioni = [];
  if (typeof verificaPosizioniDisponibili === 'function' && (await verificaPosizioniDisponibili())) {
    const { data: righe, error: errorePos } = await db
      .from('progetti_tecnici_posizioni')
      .select('id, scheda_id, numero, codice, ubicazione, quantita, dati, tolta')
      .eq('progetto_tecnico_id', preventivo.progetto_tecnico_id)
      .eq('tolta', false)
      .order('numero');
    if (errorePos) {
      toast('Errore lettura delle posizioni: ' + errorePos.message, 'err');
      return null;
    }
    posizioni = righe || [];
  }

  const cliente = (preventivo.clienti && preventivo.clienti.ragione_sociale) || 'Cliente';
  const progetto = preventivo.progetti_tecnici || {};

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const larghezza = 210;
  const margine = 16;
  const destra = larghezza - margine;
  const larghezzaTesto = larghezza - margine * 2;
  let y;

  // Intestazione (come la richiesta di quotazione e l'ordine al fornitore)
  doc.setFillColor(8, 80, 65);
  doc.rect(0, 0, larghezza, 34, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('TOLI FIRE', margine, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Via Bellatalla 62, Ospedaletto — 56121 Pisa', margine, 23);
  doc.text('P.IVA: 02490980501 — amministrazione@toli-fire.com', margine, 28);
  doc.setFontSize(10);
  doc.text('Schede tecniche del rilievo', destra, 16, { align: 'right' });

  y = 46;
  doc.setTextColor(25, 25, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('SCHEDE TECNICHE', margine, y);
  doc.setFontSize(10);
  doc.text('Data: ' + new Date().toLocaleDateString('it-IT'), destra, y, { align: 'right' });
  y += 8;

  function riga(etichetta, valore) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(etichetta, margine, y);
    doc.setFont('helvetica', 'normal');
    const righe = doc.splitTextToSize(String(valore || '—'), larghezzaTesto - 34);
    doc.text(righe, margine + 34, y);
    y += righe.length * 5 + 1;
  }
  riga('Cliente:', cliente);
  riga('Progetto:', progetto.titolo || progetto.tipologia || '—');
  riga('Preventivo:', 'n. ' + preventivo.numero);
  y += 3;

  function titoloScheda(testo) {
    if (y > 262) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(8, 80, 65);
    const righe = doc.splitTextToSize(testo, larghezzaTesto);
    doc.text(righe, margine, y);
    y += righe.length * 5.5 + 1;
    doc.setTextColor(25, 25, 25);
  }

  schede.forEach(function(scheda) {
    titoloScheda(titoloSchedaRilievo(scheda, schede));
    const dati = scheda.dati || {};
    const campi = Object.keys(dati).filter(function(k) { return campoNelPdfSchedeTecniche(k, dati[k], scheda.famiglia); });
    // Nell'ordine del catalogo (come nella scheda), i dati senza campo in fondo
    const ordine = function(k) { const c = campoCatalogoPdfSchede(scheda.famiglia, k); return c && c.ordine !== null && c.ordine !== undefined ? Number(c.ordine) : 1e9; };
    campi.sort(function(a, b) { return ordine(a) - ordine(b); });

    if (campi.length) {
      doc.autoTable({
        startY: y,
        margin: { top: 18, right: margine, bottom: 18, left: margine },
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 1.8, overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: [8, 80, 65], textColor: 255 },
        columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' } },
        head: [['Dato', 'Valore']],
        body: campi.map(function(k) {
          return [etichettaCampoTecnico(k, scheda.famiglia), valoreSchedaTecnica(dati[k], k, scheda.famiglia)];
        })
      });
      y = doc.lastAutoTable.finalY + 4;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Nessun dato tecnico compilato.', margine, y);
      y += 6;
    }

    const sue = posizioni.filter(function(p) { return p.scheda_id === scheda.id; });
    if (sue.length) {
      const extra = campiPosizionePdfSchede(scheda.famiglia);
      y += 2;
      if (y > 262) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Posizioni (' + sue.length + ')', margine, y);
      y += 2;
      doc.autoTable({
        startY: y,
        margin: { top: 18, right: margine, bottom: 18, left: margine },
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 1.8, overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: [230, 240, 237], textColor: 20 },
        columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 2: { cellWidth: 16, halign: 'right' }, 3: { cellWidth: 32 } },
        head: [['Pos.', 'Ubicazione', 'Q.tà', 'Misure', 'Altri dati']],
        body: sue.map(function(p) {
          const d = p.dati || {};
          const altri = extra.map(function(c) {
            const t = testoCampoPosizionePdf(c, d[c.codice]);
            return t ? c.etichetta + ': ' + t : '';
          }).filter(Boolean).join('\n');
          return [
            p.codice || ('P-' + p.numero),
            p.ubicazione || '—',
            testoQuantitaPosizionePdf(p.quantita),
            (typeof testoMisurePosizione === 'function' ? testoMisurePosizione(p) : '') || '—',
            altri || '—'
          ];
        })
      });
      y = doc.lastAutoTable.finalY + 6;
    } else {
      y += 2;
    }
  });

  // Numero di pagina in fondo
  const pagine = doc.getNumberOfPages();
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Preventivo n. ' + preventivo.numero + ' — schede tecniche — pagina ' + i + ' di ' + pagine, larghezza / 2, 290, { align: 'center' });
  }

  return {
    doc: doc,
    nomeFile: 'Schede_tecniche_preventivo_' + nomeFilePdfSchede(preventivo.numero) + '_' + nomeFilePdfSchede(cliente) + '.pdf'
  };
}

async function scaricaPdfSchedeTecniche() {
  const id = typeof currentPreventivoId !== 'undefined' ? currentPreventivoId : null;
  if (!id) { toast('Preventivo non selezionato', 'err'); return; }
  const btn = ge('pvd-pdf-schede-btn');
  if (btn) btn.disabled = true;
  try {
    const pdf = await creaPdfSchedeTecniche(id);
    if (pdf) {
      pdf.doc.save(pdf.nomeFile);
      toast('PDF delle schede tecniche scaricato');
    }
  } catch (e) {
    toast('Errore nel PDF delle schede tecniche: ' + e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Aggancio: dopo ogni disegno delle schede del preventivo, il bottone
if (typeof renderSchedePreventivo === 'function') {
  const renderSchedePreventivoSenzaPdf = renderSchedePreventivo;
  // eslint-disable-next-line no-global-assign
  renderSchedePreventivo = async function() {
    const esito = await renderSchedePreventivoSenzaPdf.apply(this, arguments);
    try { await mostraBottonePdfSchedeTecniche(); } catch (e) { /* il bottone non blocca la scheda */ }
    return esito;
  };
}
