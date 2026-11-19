// ── F18.8 Stati della commessa (versione scelta da Erika il 19/11/2026) ──
// Solo sito, nessun SQL. Decisione D5 di Toli: le condizioni dei passaggi
// sono SUGGERIMENTI, il passaggio lo conferma una persona da "Stato e
// storico" (js/18i, cambia_stato_commessa). Restano nel database i blocchi
// che c'erano (faldone per "pronta", sql/33).
// 1. Suggerimento sotto "Prossimo passo" nella scheda della commessa (js/26
//    chiama caricaSuggerimentoPassoCommessa): legge materiali (js/29
//    leggiFontiMaterialiCommessa / righeMaterialiCommessa), faldone
//    consegnato, data di inizio e sospensione (sql/151) e dice cosa manca o
//    che il passaggio si può segnare.
// 2. "Annullata (non avviata)": badgeStatoCommessa (js/26) mette
//    data-annullata-id sulle commesse annullate; qui si guarda lo storico
//    (commesse_storico): se non è mai stata "in corso" il bollino lo dice.
// 3. "Presa in carico" = etichetta di in_preparazione (T1): nelle tabelle dei
//    nomi di js/18i e js/63.

// ── 1. Suggerimento del prossimo passaggio ────────────────────────────
async function leggiDatiSuggerimentoCommessa(commessa) {
  const [fonti, faldone, sospensione, date] = await Promise.all([
    typeof leggiFontiMaterialiCommessa === 'function' ? leggiFontiMaterialiCommessa(commessa.id) : Promise.resolve(null),
    db.from('commesse_faldone').select('consegnato_il').eq('commessa_id', commessa.id).maybeSingle(),
    db.from('commesse_sospensioni').select('motivo').eq('commessa_id', commessa.id).is('ripresa_il', null).maybeSingle(),
    db.from('commesse').select('data_inizio').eq('id', commessa.id).maybeSingle()
  ]);
  const righe = fonti && typeof righeMaterialiCommessa === 'function' ? righeMaterialiCommessa(fonti.ordini, fonti.richieste, []) : [];
  return {
    materiali: righe,
    materialiLetti: !!(fonti && (fonti.attiveOrdini || fonti.attiveRichieste)),
    faldoneConsegnato: !!(faldone && !faldone.error && faldone.data && faldone.data.consegnato_il),
    faldoneLetto: !!(faldone && !faldone.error),
    sospesa: sospensione && !sospensione.error && sospensione.data ? sospensione.data : null,
    dataInizio: date && date.data ? date.data.data_inizio : null
  };
}

// { ok: bool, testo } oppure null (niente da suggerire)
function suggerimentoPassoCommessa(commessa, d) {
  if (!commessa || commessa.stato === 'annullata' || commessa.stato === 'chiusa') return null;
  const prossimo = statoSuccessivoCommessa(commessa.stato);
  if (!prossimo) return null;
  const nome = ETICHETTE_STATO_COMMESSA[prossimo];
  if (d.sospesa) return { ok: false, testo: 'La commessa è sospesa (' + d.sospesa.motivo + '): prima va ripresa, poi si segna «' + nome + '».' };
  const m = d.materiali || [];
  const senzaData = m.filter(function(r) { return !r.arrivato && !r.arrivoPrevisto; }).length;
  const nonArrivati = m.filter(function(r) { return !r.arrivato; }).length;
  const manca = [];
  if (prossimo === 'materiali_ordinati') {
    if (d.materialiLetti && !m.length) manca.push('nessun materiale ordinato per questa commessa');
    if (senzaData) manca.push(senzaData + (senzaData === 1 ? ' materiale senza data di arrivo' : ' materiali senza data di arrivo'));
  } else if (prossimo === 'pronta') {
    if (d.faldoneLetto && !d.faldoneConsegnato) manca.push('il faldone da consegnare (box «Date e faldone»)');
    if (senzaData) manca.push(senzaData + (senzaData === 1 ? ' materiale senza data di arrivo' : ' materiali senza data di arrivo'));
  } else if (prossimo === 'in_corso') {
    if (nonArrivati) manca.push(nonArrivati + (nonArrivati === 1 ? ' materiale non ancora arrivato' : ' materiali non ancora arrivati'));
    if (!d.dataInizio) manca.push('la data di inizio');
    else if (d.dataInizio > dataLocaleISO()) manca.push('il giorno di inizio (' + fd(d.dataInizio) + ')');
  } else if (prossimo === 'in_preparazione') {
    return { ok: true, testo: 'Materiali ordinati dal rappresentante: il capo tecnico può prendere in carico la commessa.' };
  } else {
    return null;
  }
  if (manca.length) return { ok: false, testo: 'Per «' + nome + '» manca: ' + manca.join(', ') + '.' };
  const perche = prossimo === 'materiali_ordinati' ? 'tutti i materiali hanno la data di arrivo'
    : (prossimo === 'pronta' ? 'faldone consegnato e materiali con la data di arrivo'
      : 'materiali arrivati e data di inizio raggiunta');
  return { ok: true, testo: 'Si può segnare «' + nome + '»: ' + perche + '.' };
}

async function caricaSuggerimentoPassoCommessa(commessa) {
  const box = ge('cmd-suggerimento-passo');
  if (!box) return;
  box.innerHTML = '';
  if (!commessa || commessa.stato === 'annullata' || commessa.stato === 'chiusa') return;
  box.dataset.commessa = commessa.id;
  let d;
  try { d = await leggiDatiSuggerimentoCommessa(commessa); } catch (e) { console.warn('Suggerimento del passo:', e); return; }
  if (box.dataset.commessa !== commessa.id) return;
  const s = suggerimentoPassoCommessa(commessa, d);
  if (!s) return;
  box.innerHTML = '<div class="al2 ' + (s.ok ? 'i' : 'w') + '" style="margin:8px 0 0;font-size:12px">' +
    (s.ok ? '👉 ' : '⏳ ') + esc(s.testo) +
    '<div style="color:var(--m);margin-top:2px">È un suggerimento: lo stato non cambia da solo, lo segna chi fa il passo da «Stato e storico».</div></div>';
}

// ── 2. "Annullata (non avviata)" ─────────────────────────────────────
const avvioCommesseAnnullate = {};  // id → true se è stata in corso

async function decoraAnnullateNonAvviate() {
  const spans = Array.from(document.querySelectorAll('span[data-annullata-id]:not([data-annullata-letta])'));
  if (!spans.length) return;
  spans.forEach(function(s) { s.dataset.annullataLetta = '1'; });
  const ids = Array.from(new Set(spans.map(function(s) { return s.dataset.annullataId; })))
    .filter(function(id) { return !(id in avvioCommesseAnnullate); });
  if (ids.length) {
    try {
      const { data, error } = await db.from('commesse_storico').select('commessa_id').in('commessa_id', ids).in('a_stato', ['in_corso', 'fine_lavori', 'chiusa']);
      if (error) throw error;
      ids.forEach(function(id) { avvioCommesseAnnullate[id] = false; });
      (data || []).forEach(function(r) { avvioCommesseAnnullate[r.commessa_id] = true; });
    } catch (e) { console.warn('Commesse annullate:', e); return; }
  }
  spans.forEach(function(s) {
    if (avvioCommesseAnnullate[s.dataset.annullataId] === false) {
      s.textContent = 'Annullata (non avviata)';
      s.title = 'Annullata prima di iniziare i lavori';
    }
  });
}

let attesaAnnullate = null;
new MutationObserver(function() {
  if (attesaAnnullate || !document.querySelector('span[data-annullata-id]:not([data-annullata-letta])')) return;
  attesaAnnullate = setTimeout(function() {
    attesaAnnullate = null;
    decoraAnnullateNonAvviate().catch(function() {});
  }, 50);
}).observe(document.documentElement, { childList: true, subtree: true });
