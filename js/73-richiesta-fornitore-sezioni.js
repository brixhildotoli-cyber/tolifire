// ── F16.9 — PDF DELLA RICHIESTA AL FORNITORE PER SEZIONE ───────────────
// Nel riquadro di ogni fornitore del preventivo (js/18 renderFornitoriPreventivo,
// avvolta qui) sopra "Salva dati fornitore": "Schede da mandare a questo
// fornitore" (una spunta per scheda di rilievo, blocco comune escluso) e
// "Rispondere entro il". "📄 Genera PDF richiesta" (js/18
// generaRichiestaQuotazionePDF) usa queste funzioni:
//   - schedeRichiestaFornitore: solo le schede spuntate (nessuna = tutte, come prima);
//   - campoInternoRichiestaFornitore: niente campi 🎓 dell'ingegnere (note
//     tecniche comprese) quando la scheda NON ha la copia di Acquisti; con la
//     copia di Acquisti resta quello che Acquisti ha scritto per i fornitori;
//   - posizioniRichiestaFornitore + tabella delle posizioni P-xx (regole di js/71);
//   - "Rispondere entro il", "PREZZO INDICATIVO" (scheda con tipo di richiesta
//     indicativa) e i testi fissi della richiesta.
// SCELTA (decisione di Erika del 13/11): NESSUN SQL, spunte e data non si
// salvano nel database: restano in memoria finché la pagina è aperta (anche
// dopo "Salva dati fornitore"); ricaricando la pagina ripartono tutte spuntate.
// Nessun blocco, nessun bottone di prima cambia. Ruoli: chi vede il riquadro
// (Acquisti e titolare).

const RQ_SEZIONI = { scelte: {}, schede: [], progetto: null };

const TESTI_FISSI_RICHIESTA_FORNITORE = [
  'Prezzi IVA esclusa, franco cantiere o con il costo del trasporto indicato a parte.',
  'Indicare i tempi di consegna e la validità dell’offerta.',
  'Allegare le certificazioni, le schede tecniche e le dichiarazioni di prestazione (DoP) dei prodotti offerti.',
  'Per ogni posizione indicare marca e codice del prodotto offerto; segnalare eventuali varianti rispetto a quanto richiesto.'
];

function datiSceltaRichiesta(selezioneId) {
  if (!RQ_SEZIONI.scelte[selezioneId]) RQ_SEZIONI.scelte[selezioneId] = { schede: null, entro: '' };
  return RQ_SEZIONI.scelte[selezioneId];
}

async function leggiSchedeRichiestaFornitore() {
  RQ_SEZIONI.schede = [];
  RQ_SEZIONI.progetto = null;
  if (!currentPreventivoId) return;
  const { data: prev } = await db.from('preventivi').select('progetto_tecnico_id').eq('id', currentPreventivoId).maybeSingle();
  if (!prev || !prev.progetto_tecnico_id) return;
  RQ_SEZIONI.progetto = prev.progetto_tecnico_id;
  const { data } = await db.from('progetti_tecnici_schede')
    .select('id, famiglia, numero, dati')
    .eq('progetto_tecnico_id', prev.progetto_tecnico_id)
    .neq('famiglia', 'comune');
  RQ_SEZIONI.schede = typeof ordinaSchedeRilievo === 'function' ? ordinaSchedeRilievo(data || []) : (data || []);
}

function htmlSezioniRichiestaFornitore(selezioneId) {
  const scelta = datiSceltaRichiesta(selezioneId);
  const schede = RQ_SEZIONI.schede;
  const spuntata = function(id) { return !scelta.schede || scelta.schede.indexOf(id) >= 0; };
  return `
    <div data-rq-sezioni="${esc(selezioneId)}" style="margin:14px 0 10px;padding:10px 12px;border:1px solid var(--bo);border-radius:8px">
      <div style="font-size:13px;font-weight:700">📑 Schede da mandare a questo fornitore</div>
      ${schede.length ? `
        <div style="font-size:12px;color:var(--m);margin:2px 0 6px">Nel PDF vanno solo le schede spuntate, con le loro posizioni P-xx.</div>
        ${schede.map(function(s, i, tutte) {
          const titolo = typeof titoloSchedaRilievo === 'function' ? titoloSchedaRilievo(s, tutte) : s.famiglia;
          const indicativa = s.dati && s.dati.tipo_richiesta === 'indicativa';
          return `<label style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13px">
            <input type="checkbox" style="width:auto" data-rq-scheda="${esc(selezioneId)}" value="${esc(s.id)}"${spuntata(s.id) ? ' checked' : ''}
              onchange="aggiornaSceltaRichiestaFornitore('${esc(selezioneId)}')">
            <span>${esc(titolo)}${indicativa ? ' <span style="font-size:11px;color:#854F0B">(indicativa: PREZZO INDICATIVO)</span>' : ''}</span>
          </label>`;
        }).join('')}` : '<div style="font-size:12px;color:var(--m);margin-top:4px">Nel progetto non ci sono schede di rilievo.</div>'}
      <div class="f" style="margin:8px 0 0;max-width:220px">
        <label for="rq-entro-${esc(selezioneId)}">Rispondere entro il (facoltativo)</label>
        <input type="date" id="rq-entro-${esc(selezioneId)}" value="${esc(scelta.entro || '')}"
          onchange="aggiornaSceltaRichiestaFornitore('${esc(selezioneId)}')">
      </div>
    </div>`;
}

function aggiornaSceltaRichiestaFornitore(selezioneId) {
  const scelta = datiSceltaRichiesta(selezioneId);
  const caselle = Array.from(document.querySelectorAll('[data-rq-scheda="' + selezioneId + '"]'));
  if (caselle.length) {
    const spuntate = caselle.filter(function(c) { return c.checked; }).map(function(c) { return c.value; });
    scelta.schede = spuntate.length === caselle.length ? null : spuntate;
  }
  const entro = ge('rq-entro-' + selezioneId);
  scelta.entro = entro ? entro.value : '';
}

if (typeof renderFornitoriPreventivo === 'function') {
  const renderFornitoriPreventivoSenzaSezioni = renderFornitoriPreventivo;
  // eslint-disable-next-line no-global-assign
  renderFornitoriPreventivo = async function() {
    const esito = await renderFornitoriPreventivoSenzaSezioni.apply(this, arguments);
    try {
      const box = ge('pvd-fornitori-content');
      const bottoni = box ? Array.from(box.querySelectorAll('button[onclick^="generaRichiestaQuotazionePDF("]')) : [];
      if (!bottoni.length) return esito;
      await leggiSchedeRichiestaFornitore();
      bottoni.forEach(function(b) {
        const m = /generaRichiestaQuotazionePDF\('([^']+)'\)/.exec(b.getAttribute('onclick') || '');
        if (!m || box.querySelector('[data-rq-sezioni="' + m[1] + '"]')) return;
        const salva = b.previousElementSibling && b.previousElementSibling.tagName === 'BUTTON' ? b.previousElementSibling : b;
        salva.insertAdjacentHTML('beforebegin', htmlSezioniRichiestaFornitore(m[1]));
      });
    } catch (e) {
      console.warn('Schede da mandare al fornitore:', e);
    }
    return esito;
  };
}

// ── Usate da generaRichiestaQuotazionePDF (js/18) ───────────────────────

function schedeRichiestaFornitore(selezioneId, schede) {
  aggiornaSceltaRichiestaFornitore(selezioneId);
  const scelta = datiSceltaRichiesta(selezioneId);
  if (!scelta.schede) return schede || [];
  return (schede || []).filter(function(s) { return scelta.schede.indexOf(s.id) >= 0; });
}

function entroRichiestaFornitore(selezioneId) {
  const d = datiSceltaRichiesta(selezioneId).entro;
  return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? new Date(d + 'T12:00:00').toLocaleDateString('it-IT') : '';
}

function richiestaFornitoreIndicativa(schede) {
  return (schede || []).some(function(s) { return s.dati && s.dati.tipo_richiesta === 'indicativa'; });
}

// true = il campo NON va al fornitore (dato interno dell'ingegnere)
function campoInternoRichiestaFornitore(scheda, chiave) {
  if (typeof schedaHaDatiCommerciali === 'function' && schedaHaDatiCommerciali(scheda)) return false; // la copia di Acquisti decide
  if (chiave === 'note_tecniche' || chiave === 'note_calcolo') return true;
  const c = typeof campoCatalogoPdfSchede === 'function' ? campoCatalogoPdfSchede(scheda.famiglia, chiave) : null;
  return !!(c && c.livello === 'ingegnere');
}

async function posizioniRichiestaFornitore(progettoId, schede) {
  if (!progettoId || !(schede || []).length) return [];
  if (typeof verificaPosizioniDisponibili !== 'function' || !(await verificaPosizioniDisponibili())) return [];
  const { data, error } = await db.from('progetti_tecnici_posizioni')
    .select('id, scheda_id, numero, codice, ubicazione, quantita, dati, tolta')
    .eq('progetto_tecnico_id', progettoId)
    .eq('tolta', false)
    .in('scheda_id', schede.map(function(s) { return s.id; }))
    .order('numero');
  if (error) { console.warn('Posizioni della richiesta:', error.message); return []; }
  return data || [];
}

// Tabella delle posizioni di una scheda; restituisce la nuova y
function tabellaPosizioniRichiestaFornitore(doc, y, margine, scheda, posizioni) {
  const sue = (posizioni || []).filter(function(p) { return p.scheda_id === scheda.id; });
  if (!sue.length || typeof doc.autoTable !== 'function') return y;
  const extra = typeof campiPosizionePdfSchede === 'function' ? campiPosizionePdfSchede(scheda.famiglia) : [];
  if (y > 262) { doc.addPage(); y = 18; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text('Posizioni (' + sue.length + ')', margine, y);
  doc.autoTable({
    startY: y + 2,
    margin: { top: 18, right: margine, bottom: 18, left: margine },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [230, 240, 237], textColor: 20 },
    columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 2: { cellWidth: 16, halign: 'right' }, 3: { cellWidth: 32 } },
    head: [['Pos.', 'Ubicazione', 'Q.tà', 'Misure', 'Altri dati']],
    body: sue.map(function(p) {
      const d = p.dati || {};
      const altri = extra.map(function(c) {
        const t = typeof testoCampoPosizionePdf === 'function' ? testoCampoPosizionePdf(c, d[c.codice]) : '';
        return t ? c.etichetta + ': ' + t : '';
      }).filter(Boolean).join('\n');
      return [
        p.codice || ('P-' + p.numero),
        p.ubicazione || '—',
        typeof testoQuantitaPosizionePdf === 'function' ? testoQuantitaPosizionePdf(p.quantita) : String(p.quantita ?? '—'),
        (typeof testoMisurePosizione === 'function' ? testoMisurePosizione(p) : '') || '—',
        altri || '—'
      ];
    })
  });
  return doc.lastAutoTable.finalY + 6;
}
