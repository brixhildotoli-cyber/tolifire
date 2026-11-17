// ── PROMESSA DI PAGAMENTO SULLE RATE (sql/272) ───────────────────────────
// Richiesta di Erika del 17/11: la fattura emessa resta bloccata (dati
// fiscali), ma su ogni rata si scrivono, quando si vuole, "pagamento previsto
// entro il …" e una nota di incasso.
//   - Sotto ogni rata (finestra della fattura, "💶 Scadenze e incassi",
//     "📞 Insoluti e solleciti"): "📅 Paga il … · nota (chi)" e il bottone
//     "📅 Paga il…" accanto a "💶 Pagamento" per segreteria e titolare (finestra
//     m-promessa-pagamento, id ppg-); il contabile legge.
//   - Promessa passata e rata non pagata: data in rosso.
// Le righe delle rate hanno data-scadenza-id (js/44; per i solleciti lo mette
// questo file). Senza sql/272 niente.

const PROMESSE = { attivo: null, perRata: {} };
const RUOLI_SCRIVONO_PROMESSA = ['titolare', 'segreteria'];

async function verificaPromesseDisponibili() {
  if (PROMESSE.attivo !== null) return PROMESSE.attivo;
  if (!['titolare', 'segreteria', 'contabile'].includes(ROLE)) { PROMESSE.attivo = false; return false; }
  try {
    const { data, error } = await db.rpc('promesse_pagamento_attive');
    PROMESSE.attivo = !error && data === true;
  } catch (e) { PROMESSE.attivo = false; }
  return PROMESSE.attivo;
}

function htmlPromessaRata(id, p) {
  const oggi = typeof oggiFattura === 'function' ? oggiFattura() : dataLocaleISO(new Date());
  const ha = p && (p.data_promessa || p.nota);
  if (!ha) return '';
  const passata = p.data_promessa && p.data_promessa < oggi;
  return '<div data-promessa-rata="' + esc(id) + '" style="font-size:12px;margin-top:4px;overflow-wrap:anywhere">📅 ' +
    (p.data_promessa ? 'Paga il <b' + (passata ? ' style="color:var(--r)"' : '') + '>' + esc(fd(p.data_promessa)) + '</b>' + (passata ? ' (passata)' : '') : 'Nota di incasso') +
    (p.nota ? ' · ' + esc(p.nota) : '') +
    (p.aggiornato_da_nome ? ' <span style="color:var(--m)">(' + esc(p.aggiornato_da_nome) + ', ' + esc(new Date(p.aggiornato_il).toLocaleDateString('it-IT')) + ')</span>' : '') + '</div>';
}

// Bottone "📅 Paga il…" (come nella card "Anticipi da fatturare" della dashboard):
// accanto a "💶 Pagamento" se c'è, altrimenti sotto la rata.
function htmlBottonePagaIl(id, p) {
  if (!RUOLI_SCRIVONO_PROMESSA.includes(ROLE)) return '';
  return '<button class="btn sm" type="button" data-paga-il="' + esc(id) + '" onclick="apriPromessaPagamento(this.dataset.pagaIl)">📅 ' +
    (p && p.data_promessa ? 'Paga il ' + esc(fd(p.data_promessa)) : 'Paga il…') + '</button>';
}

async function decoraPromesseRate(contenitore) {
  if (!contenitore || !(await verificaPromesseDisponibili())) return;
  const righe = Array.from(contenitore.querySelectorAll('[data-scadenza-id]'));
  if (!righe.length) return;
  const ids = righe.map(function(r) { return r.getAttribute('data-scadenza-id'); });
  const { data, error } = await db.from('fatture_promesse_pagamento').select('scadenza_id, data_promessa, nota, aggiornato_da_nome, aggiornato_il').in('scadenza_id', ids);
  if (error) return;
  (data || []).forEach(function(p) { PROMESSE.perRata[p.scadenza_id] = p; });
  righe.forEach(function(r) {
    const id = r.getAttribute('data-scadenza-id');
    r.querySelectorAll('[data-promessa-rata], [data-paga-il], [data-paga-il-riga]').forEach(function(el) { el.remove(); });
    const p = PROMESSE.perRata[id];
    const dentro = r.querySelector('div[style*="min-width:0"]');
    const html = htmlPromessaRata(id, p);
    if (html) (dentro || r).insertAdjacentHTML('beforeend', html);
    const bottone = htmlBottonePagaIl(id, p);
    if (!bottone) return;
    const pagamento = Array.from(r.querySelectorAll('button')).find(function(b) { return /apriPagamentoFattura|Pagamento/.test((b.getAttribute('onclick') || '') + ' ' + b.textContent); });
    if (pagamento) pagamento.insertAdjacentHTML('beforebegin', bottone);
    else if (!/pagata il/i.test(r.textContent)) (dentro || r).insertAdjacentHTML('beforeend', '<div data-paga-il-riga style="margin-top:4px">' + bottone + '</div>');
  });
}

// Righe dei solleciti: id della rata
if (typeof htmlRataDaSollecitare === 'function') {
  const htmlRataDaSollecitareSenzaId = htmlRataDaSollecitare;
  // eslint-disable-next-line no-global-assign
  htmlRataDaSollecitare = function(s) {
    const html = htmlRataDaSollecitareSenzaId.apply(this, arguments);
    return s && s.id && html.indexOf('<div ') === 0 ? '<div data-scadenza-id="' + esc(s.id) + '" ' + html.slice(5) : html;
  };
}

[['caricaScadenzeNellaFattura', 'mfat-emessa'], ['caricaScadenzeFatture', 'fat-scadenze-box'], ['caricaSollecitiFatture', 'fat-solleciti-box']].forEach(function(x) {
  const nome = x[0], box = x[1];
  if (typeof window[nome] !== 'function') return;
  const originale = window[nome];
  window[nome] = async function() {
    const esito = await originale.apply(this, arguments);
    try { await decoraPromesseRate(ge(box)); } catch (e) { console.warn('Promesse di pagamento:', e); }
    return esito;
  };
});

// ── Finestra della promessa ─────────────────────────────────────────
function apriPromessaPagamento(scadenzaId) {
  const p = PROMESSE.perRata[scadenzaId];
  ge('ppg-id').value = scadenzaId;
  ge('ppg-data').value = p && p.data_promessa ? p.data_promessa : '';
  ge('ppg-nota').value = p && p.nota ? p.nota : '';
  openM('m-promessa-pagamento');
}

async function salvaPromessaPagamento(togli) {
  const id = ge('ppg-id').value;
  const data = togli ? null : (ge('ppg-data').value || null);
  const nota = togli ? null : ((ge('ppg-nota').value || '').trim() || null);
  if (!togli && !data && !nota) { toast('Scrivi la data promessa o una nota', 'err'); return; }
  const { error } = await db.rpc('imposta_promessa_pagamento', { p_scadenza_id: id, p_data_promessa: data, p_nota: nota });
  if (error) { toast('Non salvata: ' + error.message, 'err'); return; }
  closeM('m-promessa-pagamento');
  toast(togli ? 'Promessa tolta' : 'Promessa di pagamento salvata', 'ok');
  ['mfat-emessa', 'fat-scadenze-box', 'fat-solleciti-box'].forEach(function(b) { if (ge(b)) decoraPromesseRate(ge(b)).catch(function() {}); });
  // Card "Anticipi da fatturare" (js/44): ridisegna la riga con "📅 Paga il"
  if (typeof decoraFattureAnticipo === 'function') {
    document.querySelectorAll('.fat-anticipo-vera[data-fatto]').forEach(function(ph) { delete ph.dataset.fatto; });
    decoraFattureAnticipo().catch(function() {});
  }
}
