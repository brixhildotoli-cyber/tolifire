// ── F18.16 — DOCUMENTI FINALI DELLA COMMESSA: COSA SERVE E COSA MANCA ────
// Decisioni di Erika del 16/11: versione calcolata, NESSUN SQL, solo avviso.
// Riquadro "📑 Documenti finali" nella scheda della commessa (cmd-documenti-
// finali, sopra la dichiarazione di corretta posa) da "in corso" alla
// chiusura, per titolare, segreteria, capo tecnico e Acquisti (l'ingegnere
// non apre le commesse).
//   - Quali documenti servono: dalle schede di rilievo del progetto
//     (scheda_cantiere_commessa di sql/34, la leggono tutti e quattro i ruoli)
//     e dal "documento finale" di ogni lavorazione del catalogo (sql/75):
//     corretta posa (porte, compartimentazione, vernice, coppelle) e DiCo
//     D.M. 37/08 (rilevazione, spegnimento).
//   - Cosa c'è e cosa manca, con a chi tocca: certificati e schede tecniche
//     (sul preventivo o nella cartella Certificati → Acquisti), foto del
//     cantiere (cartella Cantiere, anche quelle del giornale → capo tecnico),
//     dichiarazione di corretta posa salvata in Chiusura (js/37 →
//     segreteria), DiCo: PDF firmato caricato in Chiusura con "DiCo" o
//     "37-08" nel nome (il gestionale non la genera → segreteria).
// La barra per posizione NON c'è: le posizioni non esistono (F16.10 saltata).
// Senza sql/34 o senza la cartella documenti il riquadro non compare.

const RUOLI_DOCUMENTI_FINALI = ['titolare', 'segreteria', 'capo_tecnico', 'commerciale'];
const STATI_DOCUMENTI_FINALI = ['in_corso', 'fine_lavori', 'chiusa'];
const DOCUMENTI_FINALI_GESTITI = {
  corretta_posa: { icona: '📄', nome: 'Dichiarazione di corretta posa in opera' },
  dico_37_08: { icona: '⚡', nome: 'Dichiarazione di conformità (D.M. 37/08)' }
};
const NOMI_RUOLO_MANCANZA = { commerciale: 'ad <b>Acquisti</b>', capo_tecnico: 'al <b>capo tecnico</b>', segreteria: 'alla <b>segreteria</b>' };
const DOC_FINALI = { commessaId: null, scheda: null, lavorazioni: null };

function eFileDiCo(nome) {
  return /dico|37[\s._-]?08/i.test(String(nome || ''));
}

// Voci della lista di un documento: { testo, ok, chi, dettaglio }
function vociDocumentoFinale(tipo, x) {
  const documenti = x.documenti;
  const inCartella = function(cartella) { return documenti.filter(function(d) { return d.cartella === cartella; }); };
  const certificati = (x.certificati || []).length + inCartella('certificati').length;
  const foto = inCartella('cantiere').filter(function(d) { return /^image\//.test(d.tipo_mime || '') || /\.(jpe?g|png|heic|webp)$/i.test(d.nome_file || ''); }).length;
  const chiusura = inCartella('chiusura');
  const voci = [
    { testo: 'Certificati e schede tecniche dei prodotti', ok: certificati > 0, chi: 'commerciale',
      dettaglio: certificati ? certificati + ' file' : 'sul preventivo o nella cartella Certificati' },
    { testo: 'Foto del cantiere', ok: foto > 0, chi: 'capo_tecnico',
      dettaglio: foto ? foto + ' foto' : 'nella cartella Cantiere o dal giornale di cantiere' }
  ];
  if (tipo === 'corretta_posa') {
    const salvate = chiusura.filter(function(d) { return String(d.nome_file || '').indexOf(typeof PREFISSO_FILE_DICHIARAZIONE_POSA !== 'undefined' ? PREFISSO_FILE_DICHIARAZIONE_POSA : 'Dichiarazione_messa_in_opera_') === 0; });
    voci.push({ testo: 'Dichiarazione salvata nella cartella Chiusura', ok: salvate.length > 0, chi: 'segreteria',
      dettaglio: salvate.length ? 'del ' + new Date(salvate[0].caricato_il).toLocaleDateString('it-IT') : 'si prepara dal riquadro "Dichiarazione di corretta messa in opera" a fine lavori' });
  } else if (tipo === 'dico_37_08') {
    const dico = chiusura.filter(function(d) { return eFileDiCo(d.nome_file); });
    voci.push({ testo: 'DiCo firmata caricata nella cartella Chiusura', ok: dico.length > 0, chi: 'segreteria',
      dettaglio: dico.length ? esc(dico[0].nome_file) : 'PDF con "DiCo" o "37-08" nel nome' });
  }
  return voci;
}

function htmlBarraDocumentoFinale(fatte, totale) {
  const perc = totale ? Math.round(fatte / totale * 100) : 0;
  const colore = perc === 100 ? 'var(--g, #16a34a)' : perc >= 50 ? 'var(--a, #d97706)' : 'var(--r, #dc2626)';
  return '<div style="display:flex;align-items:center;gap:8px;margin:4px 0 6px"><div style="flex:1;height:8px;border-radius:4px;background:var(--b2, #e5e7eb);overflow:hidden">' +
    '<div style="width:' + perc + '%;height:100%;background:' + colore + '"></div></div>' +
    '<span style="font-size:12px;white-space:nowrap">' + fatte + ' su ' + totale + '</span></div>';
}

function disegnaDocumentiFinali(commessa) {
  const box = ge('cmd-documenti-finali');
  if (!box || DOC_FINALI.commessaId !== commessa.id) return;
  const schede = ((DOC_FINALI.scheda && DOC_FINALI.scheda.schede_rilievo) || []).map(function(s) { return s.famiglia; });
  const perTipo = {};
  (DOC_FINALI.lavorazioni || []).forEach(function(l) {
    if (!schede.includes(l.codice) || !DOCUMENTI_FINALI_GESTITI[l.documento_finale]) return;
    (perTipo[l.documento_finale] = perTipo[l.documento_finale] || []).push(l.nome);
  });
  const tipi = Object.keys(perTipo);
  const x = { documenti: documentiCommessaAperta || [], certificati: (DOC_FINALI.scheda && DOC_FINALI.scheda.certificati) || [] };
  let corpo = '';
  if (!tipi.length) {
    corpo = '<div style="font-size:13px;color:var(--m);margin-top:6px">' + (schede.length
      ? 'Le lavorazioni di questa commessa non hanno un documento finale tra corretta posa e DiCo.'
      : 'La commessa non ha schede di rilievo nel progetto: il gestionale non sa quali documenti finali servono. Se serve la dichiarazione di corretta posa si prepara dal riquadro qui sotto a fine lavori; la DiCo si carica nella cartella Chiusura.') + '</div>';
  } else {
    corpo = tipi.map(function(tipo) {
      const voci = vociDocumentoFinale(tipo, x);
      const fatte = voci.filter(function(v) { return v.ok; }).length;
      const doc = DOCUMENTI_FINALI_GESTITI[tipo];
      return '<div data-documento-finale="' + tipo + '" style="margin-top:10px;padding-top:8px;border-top:1px solid var(--b2, #e5e7eb)">' +
        '<div style="font-size:13px;font-weight:700">' + doc.icona + ' ' + esc(doc.nome) + (fatte === voci.length ? ' <span class="bx bok">Completo</span>' : ' <span class="bx bwarn">In raccolta</span>') + '</div>' +
        '<div style="font-size:12px;color:var(--m)">Per: ' + esc(perTipo[tipo].join(', ')) + '</div>' +
        htmlBarraDocumentoFinale(fatte, voci.length) +
        voci.map(function(v) {
          return '<div style="font-size:13px;margin:2px 0">' + (v.ok ? '✅' : '⬜') + ' ' + esc(v.testo) +
            ' <span style="color:var(--m);font-size:12px">· ' + (v.ok ? v.dettaglio : 'manca, tocca ' + (NOMI_RUOLO_MANCANZA[v.chi] || esc(v.chi)) + (v.dettaglio ? ' (' + v.dettaglio + ')' : '')) + '</span></div>';
        }).join('') + '</div>';
    }).join('');
  }
  box.innerHTML = '<div class="card"><div style="font-size:14px;font-weight:700">📑 Documenti finali</div>' +
    '<div style="font-size:12px;color:var(--m);margin-top:2px">Cosa serve consegnare al cliente a fine lavori, cosa c\'è già e a chi tocca quello che manca. Solo promemoria: non blocca niente.</div>' +
    corpo + '</div>';
}

async function caricaDocumentiFinaliCommessa(commessa) {
  const box = ge('cmd-documenti-finali');
  if (!box) return;
  if (!commessa || !RUOLI_DOCUMENTI_FINALI.includes(ROLE) || !STATI_DOCUMENTI_FINALI.includes(commessa.stato) ||
      typeof documentiCommessaDisponibili === 'undefined' || documentiCommessaDisponibili !== true) { box.innerHTML = ''; return; }
  try {
    if (DOC_FINALI.commessaId !== commessa.id) {
      if (typeof verificaDatiCantiereDisponibili === 'function' && !(await verificaDatiCantiereDisponibili())) { box.innerHTML = ''; return; }
      const [rScheda, rLav] = await Promise.all([
        db.rpc('scheda_cantiere_commessa', { p_commessa_id: commessa.id }),
        DOC_FINALI.lavorazioni ? { data: DOC_FINALI.lavorazioni } : db.from('lavorazioni').select('codice, nome, documento_finale')
      ]);
      if (rScheda.error) { box.innerHTML = ''; console.warn('Documenti finali:', rScheda.error.message); return; }
      if (commessaApertaId && commessaApertaId !== commessa.id) return;
      DOC_FINALI.commessaId = commessa.id;
      DOC_FINALI.scheda = rScheda.data || {};
      DOC_FINALI.lavorazioni = (rLav && !rLav.error && rLav.data) || [];
    }
    disegnaDocumentiFinali(commessa);
  } catch (e) { console.warn('Documenti finali:', e); }
}

// Si ricalcola a ogni lettura della cartella documenti (apertura della
// commessa e dopo ogni caricamento o eliminazione di un file).
if (typeof caricaDocumentiCommessa === 'function') {
  const caricaDocumentiCommessaSenzaFinali = caricaDocumentiCommessa;
  // eslint-disable-next-line no-global-assign
  caricaDocumentiCommessa = async function(commessa) {
    const esito = await caricaDocumentiCommessaSenzaFinali.apply(this, arguments);
    await caricaDocumentiFinaliCommessa(commessa);
    return esito;
  };
}
if (typeof caricaSchedaCommessa === 'function') {
  const caricaSchedaCommessaSenzaFinali = caricaSchedaCommessa;
  // eslint-disable-next-line no-global-assign
  caricaSchedaCommessa = async function() {
    const box = ge('cmd-documenti-finali');
    if (box) box.innerHTML = '';
    DOC_FINALI.commessaId = null;
    return caricaSchedaCommessaSenzaFinali.apply(this, arguments);
  };
}
