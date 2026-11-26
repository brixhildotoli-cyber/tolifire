// ── F19.15 Revisione del POS (sql/166) ─────────────────────────────────
// Scelte di Erika del 26/11: SOLO AVVISI. Se dopo l'invio del POS cambia
// qualcosa nella commessa (persone e subappaltatori del faldone, persone in
// squadra, mezzi, lavorazioni) nel riquadro «🦺 POS di commessa» compare
// «⚠️ POS da aggiornare» con l'elenco delle differenze rispetto all'ultima
// revisione: si preme «Genera il POS» come oggi e nasce la revisione dopo.
// Una persona in squadra che non è nel POS: la squadra si salva come oggi,
// poi compare l'avviso (js/33 chiama avvisoPosDopoSquadra). Riga in «Cosa
// tocca a me» per segreteria e titolare; «Prossimo passo» di js/107 tramite
// statoPosPerPassiCommessa (js/116). Il database si annota cosa c'era in ogni
// revisione (pos_commessa.contenuto): le revisioni fatte prima di sql/166 non
// si confrontano. Senza sql/166 (pos_revisione_attiva) non compare niente.

let posRevisioneVerificata = null;

async function verificaPosRevisioneDisponibile() {
  if (posRevisioneVerificata !== null) return posRevisioneVerificata;
  try {
    const { data, error } = await db.rpc('pos_revisione_attiva');
    posRevisioneVerificata = !error && data === true;
  } catch (e) { posRevisioneVerificata = false; }
  return posRevisioneVerificata;
}

// { inviato, revisione, confrontabile, differenze } o null
async function leggiPosDaAggiornare(commessaId) {
  if (!['titolare', 'segreteria', 'capo_tecnico'].includes(ROLE) || !(await verificaPosRevisioneDisponibile())) return null;
  const { data, error } = await db.rpc('pos_da_aggiornare', { p_commessa_id: commessaId });
  if (error) { console.warn('POS da aggiornare:', error.message); return null; }
  return data || null;
}

const NOMI_COSA_REVISIONE_POS = { persona: '👷', subappaltatore: '🤝', lavorazione: '🔧', mezzo: '🚜', squadra: '📅' };

function testoDifferenzaPos(d) {
  if (d.cosa === 'squadra') {
    return esc(d.nome) + ' è in squadra dal ' + esc(fd(d.dal)) + ' ma non è nel POS' +
      (d.nel_faldone ? '' : ': aggiungilo al personale del faldone');
  }
  const cosa = { persona: 'Persona', subappaltatore: 'Subappaltatore', lavorazione: 'Lavorazione', mezzo: 'Mezzo' }[d.cosa] || '';
  return cosa + ' ' + esc(d.azione) + ': ' + esc(d.nome);
}

function htmlPosDaAggiornare(stato) {
  const diff = (stato && stato.differenze) || [];
  if (!diff.length) return '';
  return '<div class="al2 w" style="font-size:12px;margin:0 0 6px">⚠️ <b>POS da aggiornare</b>: dopo l\'invio sono cambiate ' + diff.length + (diff.length === 1 ? ' cosa' : ' cose') +
    ' rispetto alla revisione ' + esc(String(stato.revisione)) + '.' +
    '<ul style="margin:4px 0 4px 18px;padding:0">' + diff.map(function(d) {
      return '<li>' + (NOMI_COSA_REVISIONE_POS[d.cosa] || '•') + ' ' + testoDifferenzaPos(d) + '</li>';
    }).join('') + '</ul>' +
    'Premi «🦺 Genera il POS» per fare la revisione ' + (Number(stato.revisione) + 1) + ', poi falla approvare, firmare e rimandala. È un avviso: non blocca niente.</div>';
}

// Riempie #cmd-pos-aggiorna nel riquadro del POS (js/116)
async function caricaPosDaAggiornare(commessa) {
  const posto = ge('cmd-pos-aggiorna');
  if (!posto || !commessa) return;
  const stato = await leggiPosDaAggiornare(commessa.id);
  if (typeof commessaApertaId !== 'undefined' && commessaApertaId && commessaApertaId !== commessa.id) return;
  const qui = ge('cmd-pos-aggiorna');
  if (qui) qui.innerHTML = htmlPosDaAggiornare(stato);
}

// Dopo il salvataggio della squadra (js/33): solo avviso
async function avvisoPosDopoSquadra(commessa) {
  if (!commessa) return;
  const stato = await leggiPosDaAggiornare(commessa.id);
  const fuori = ((stato && stato.differenze) || []).filter(function(d) { return d.cosa === 'squadra'; });
  if (!fuori.length) return;
  toast('⚠️ ' + fuori.map(function(d) { return d.nome; }).join(', ') + (fuori.length === 1 ? ' non è' : ' non sono') +
    ' nel POS inviato: aggiorna il POS e rimandalo', 'warn');
  if (typeof caricaPosCommessa === 'function' && typeof commessaApertaId !== 'undefined' && commessaApertaId === commessa.id) caricaPosCommessa(commessa).catch(function() {});
}

async function commessePosDaAggiornare() {
  if (!['titolare', 'segreteria'].includes(ROLE) || !(await verificaPosRevisioneDisponibile())) return null;
  const { data, error } = await db.rpc('pos_da_aggiornare_elenco');
  if (error) { console.warn('POS da aggiornare (elenco):', error.message); return null; }
  return data || [];
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'pos-da-aggiornare', ruoli: ['titolare', 'segreteria'], icona: '🦺', priorita: 20,
    titolo: 'POS da aggiornare: la commessa è cambiata dopo l\'invio',
    vai: function() {
      commessePosDaAggiornare().then(function(e) {
        if (!e || !e.length) return;
        if (e.length > 1) toast('Apro la ' + e[0].codice + ' (' + e.length + ' commesse con il POS da aggiornare)', 'ok');
        openCommessaDetail(e[0].commessa_id);
      });
    },
    conta: async function() { const e = await commessePosDaAggiornare(); return e === null ? null : e.length; }
  });
}
