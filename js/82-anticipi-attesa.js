// ── F18.4 — ANTICIPO ATTESO: PROMEMORIA A 7 E 15 GIORNI, TITOLARE A 30 E 60 ──
// Decisione di Toli E7: anticipo non pagato = promemoria al rappresentante a
// 7 e 15 giorni, avviso al titolare a 30 giorni e di nuovo a 60, NESSUN
// annullamento automatico: il preventivo resta 'in_attesa_anticipo' finché
// segreteria o titolare non confermano a mano "Rifiuta: anticipo non versato"
// (rifiuta_per_anticipo_non_versato di sql/25, finestra m-rifiuto-anticipo
// di js/18). NESSUN SQL: giorni di calendario dall'accettazione del cliente
// (preventivi.esito_registrato_il, sql/22), fissi nel sito
// (ANTICIPO_PROMEMORIA_GG di js/13: nelle Regole servirebbe un file SQL).
// Righe di "Cosa tocca a me" (js/46); quelle del titolare compaiono da sole
// anche nella pagina ⚖️ Decisioni (js/60, sezione delle fonti). NON FATTO:
// anticipo di default dal cliente (condizioni del cliente di F16.39, rimandata).

const GG_ANTICIPO = typeof ANTICIPO_PROMEMORIA_GG !== 'undefined'
  ? ANTICIPO_PROMEMORIA_GG : { richiamo: 7, sollecito: 15, titolare: 30, decisione: 60 };

// Fine del giorno di N giorni fa (ora locale), per "accettato da almeno N giorni"
function limiteAttesaAnticipo(giorni) {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() - giorni);
  return d.toISOString();
}

async function anticipiInAttesaDa(min, max) {
  if (typeof verificaAnticipoPreventivoDisponibile !== 'function' || !(await verificaAnticipoPreventivoDisponibile())) return null;
  let q = db.from('preventivi').select('id, esito_registrato_il')
    .eq('stato', 'in_attesa_anticipo').lte('esito_registrato_il', limiteAttesaAnticipo(min))
    .order('esito_registrato_il', { ascending: true }).limit(200);
  if (max) q = q.gt('esito_registrato_il', limiteAttesaAnticipo(max));
  const { data, error } = await q;
  if (error) { console.warn('Anticipi in attesa:', error.message); return null; }
  return data || [];
}

function contaAnticipiDa(min, max) {
  return async function() { const e = await anticipiInAttesaDa(min, max); return e === null ? null : e.length; };
}

// A 60 giorni: apre la conferma del rifiuto sul più vecchio (segreteria o
// titolare decidono; con Annulla il preventivo resta com'è)
async function decidiAnticipoFermo() {
  const e = await anticipiInAttesaDa(GG_ANTICIPO.decisione);
  if (!e || !e.length) { gotoPage('preventivi-titolare'); return; }
  if (e.length > 1) toast('Il più vecchio di ' + e.length + ': dopo la decisione la riga mostra il successivo', 'ok');
  apriRifiutoAnticipoNonVersato(e[0].id);
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'anticipi-richiamo-rappresentante', ruoli: ['rappresentante'], icona: '📞', priorita: 6,
    titolo: 'Anticipo non ancora pagato da ' + GG_ANTICIPO.richiamo + ' giorni: richiama il cliente',
    vai: { box: 'rap-promemoria-anticipi', pagina: 'preventivi-rapp' },
    conta: contaAnticipiDa(GG_ANTICIPO.richiamo, GG_ANTICIPO.sollecito)
  });
  registraFonteToccaAMe({
    id: 'anticipi-sollecito-rappresentante', ruoli: ['rappresentante'], icona: '📞', priorita: 5, livello: 'urgente',
    titolo: 'Anticipo non pagato da più di ' + GG_ANTICIPO.sollecito + ' giorni: sollecita il cliente',
    vai: { box: 'rap-promemoria-anticipi', pagina: 'preventivi-rapp' },
    conta: contaAnticipiDa(GG_ANTICIPO.sollecito)
  });
  registraFonteToccaAMe({
    id: 'anticipi-30-titolare', ruoli: ['titolare'], icona: '⏳', priorita: 12,
    titolo: 'Anticipi non pagati da più di ' + GG_ANTICIPO.titolare + ' giorni',
    vai: { pagina: 'preventivi-titolare' },
    conta: contaAnticipiDa(GG_ANTICIPO.titolare, GG_ANTICIPO.decisione)
  });
  registraFonteToccaAMe({
    id: 'anticipi-60-titolare', ruoli: ['titolare'], icona: '⚖️', priorita: 11, livello: 'urgente',
    titolo: 'Anticipi non pagati da più di ' + GG_ANTICIPO.decisione + ' giorni: decidi se rifiutare il preventivo',
    vai: decidiAnticipoFermo,
    conta: contaAnticipiDa(GG_ANTICIPO.decisione)
  });
}
