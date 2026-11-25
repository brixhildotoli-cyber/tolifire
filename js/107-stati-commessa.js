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
  const [fonti, faldone, sospensione, date, pos] = await Promise.all([
    typeof leggiFontiMaterialiCommessa === 'function' ? leggiFontiMaterialiCommessa(commessa.id) : Promise.resolve(null),
    db.from('commesse_faldone').select('consegnato_il').eq('commessa_id', commessa.id).maybeSingle(),
    db.from('commesse_sospensioni').select('motivo').eq('commessa_id', commessa.id).is('ripresa_il', null).maybeSingle(),
    db.from('commesse').select('data_inizio').eq('id', commessa.id).maybeSingle(),
    // F19.14 (sql/165, js/116): POS firmato e inviato (solo avviso)
    typeof statoPosPerPassiCommessa === 'function' ? statoPosPerPassiCommessa(commessa.id).catch(function() { return null; }) : Promise.resolve(null)
  ]);
  const righe = fonti && typeof righeMaterialiCommessa === 'function' ? righeMaterialiCommessa(fonti.ordini, fonti.richieste, [], fonti.cliente) : [];
  return {
    materiali: righe,
    materialiLetti: !!(fonti && (fonti.attiveOrdini || fonti.attiveRichieste)),
    faldoneConsegnato: !!(faldone && !faldone.error && faldone.data && faldone.data.consegnato_il),
    faldoneLetto: !!(faldone && !faldone.error),
    sospesa: sospensione && !sospensione.error && sospensione.data ? sospensione.data : null,
    dataInizio: date && date.data ? date.data.data_inizio : null,
    pos: pos
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
  // F18.20 (D5): commessa Pronta con materiali in ritardo o in arrivo dopo
  // l'inizio: proposta di riportarla a Presa in carico (la conferma il titolare)
  if (commessa.stato === 'pronta') {
    const tardi = materialiTardiCommessa(m, d.dataInizio);
    if (tardi.length) {
      return { ok: false, riporta: true, testo: (tardi.length === 1 ? '1 materiale in ritardo' : tardi.length + ' materiali in ritardo') +
        ' o in arrivo dopo l\'inizio (' + tardi.slice(0, 3).map(function(r) { return r.cosa.replace(/^\S+\s/, '') + (r.arrivoPrevisto ? ' ' + fd(r.arrivoPrevisto) : ''); }).join(', ') + (tardi.length > 3 ? '…' : '') +
        '): proposta di riportare la commessa a «' + ETICHETTE_STATO_COMMESSA.in_preparazione + '» e rifare le date con la segreteria.' };
    }
  }
  const senzaData = m.filter(function(r) { return !r.arrivato && !r.arrivoPrevisto; }).length;
  const nonArrivati = m.filter(function(r) { return !r.arrivato; }).length;
  const manca = [];
  if (prossimo === 'materiali_ordinati') {
    if (d.materialiLetti && !m.length) manca.push('nessun materiale ordinato per questa commessa');
    if (senzaData) manca.push(senzaData + (senzaData === 1 ? ' materiale senza data di arrivo' : ' materiali senza data di arrivo'));
  } else if (prossimo === 'pronta') {
    if (d.faldoneLetto && !d.faldoneConsegnato) manca.push('il faldone da consegnare (box «Date e faldone»)');
    if (d.pos && !d.pos.pronto) manca.push(d.pos.testo);
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

// Materiali non arrivati in ritardo, o previsti dopo il giorno di inizio
function materialiTardiCommessa(righe, dataInizio) {
  return (righe || []).filter(function(r) {
    return !r.arrivato && (r.inRitardo || (!!dataInizio && !!r.arrivoPrevisto && r.arrivoPrevisto > dataInizio));
  });
}

// Bottone del titolare: Stato e storico già su "← Indietro a Presa in carico"
async function riportaPresaInCaricoCommessa(commessaId, motivo) {
  await apriStatoCommessa(commessaId, '');
  const sel = ge('msc-stato');
  if (!sel || ![...sel.options].some(function(o) { return o.value === 'in_preparazione'; })) return;
  sel.value = 'in_preparazione';
  if (ge('msc-nota') && !ge('msc-nota').value) ge('msc-nota').value = motivo || 'Materiali in ritardo: da rifare le date';
  aggiornaCambioStatoCommessa();
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
    (s.riporta ? '⚠️ ' : (s.ok ? '👉 ' : '⏳ ')) + esc(s.testo) +
    (s.riporta && ROLE === 'titolare' ? '<div style="margin-top:6px"><button type="button" class="btn sm p" data-id="' + esc(commessa.id) + '" data-motivo="' + esc('Materiali in ritardo: ' + s.testo) + '" onclick="riportaPresaInCaricoCommessa(this.dataset.id, this.dataset.motivo)">↩ Riporta a Presa in carico</button></div>' : '') +
    '<div style="color:var(--m);margin-top:2px">' + (s.riporta ? 'La commessa resta «Pronta» finché il titolare non conferma il ritorno.' : 'È un suggerimento: lo stato non cambia da solo, lo segna chi fa il passo da «Stato e storico».') + '</div></div>';
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

// ── 4. F18.20: commesse Pronte con materiali in ritardo (Cosa tocca a me) ──
async function commessePronteConRitardo() {
  const { data, error } = await db.from('commesse').select('id, codice, titolo, data_inizio, clienti(ragione_sociale)').eq('stato', 'pronta').limit(200);
  if (error) throw error;
  const esito = [];
  for (const c of data || []) {
    const fonti = typeof leggiFontiMaterialiCommessa === 'function' ? await leggiFontiMaterialiCommessa(c.id) : null;
    if (!fonti) continue;
    const tardi = materialiTardiCommessa(righeMaterialiCommessa(fonti.ordini, fonti.richieste, [], fonti.cliente), c.data_inizio);
    if (tardi.length) esito.push({ commessa: c, tardi: tardi });
  }
  return esito;
}

async function apriCommessePronteConRitardo() {
  let righe;
  try { righe = await commessePronteConRitardo(); } catch (e) { toast('Non riesco a leggere le commesse: ' + (e.message || e), 'err'); return; }
  let el = ge('m-pronte-ritardo');
  if (!el) {
    el = document.createElement('div');
    el.className = 'mbg';
    el.id = 'm-pronte-ritardo';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="modal" style="max-width:560px"><button class="x" onclick="closeM(\'m-pronte-ritardo\')">×</button>' +
    '<h3>⚠️ Commesse pronte con materiali in ritardo</h3>' +
    '<div class="al2 i" style="margin-bottom:10px;font-size:12px">Proposta: riportarle a «' + esc(ETICHETTE_STATO_COMMESSA.in_preparazione) + '» e rifare le date. Lo conferma il titolare dalla commessa; da sole restano «Pronta».</div>' +
    (!righe.length ? '<div class="empty">Niente da vedere 🎉</div>' : righe.map(function(x) {
      return '<div class="card" style="margin-bottom:8px"><div style="font-weight:700">' + esc(x.commessa.codice) + ' · ' + esc((x.commessa.clienti && x.commessa.clienti.ragione_sociale) || '') + '</div>' +
        '<div style="font-size:12px;color:var(--m);margin-top:2px">' + esc(x.tardi.map(function(r) { return r.cosa.replace(/^\S+\s/, '') + (r.arrivoPrevisto ? ' (' + fd(r.arrivoPrevisto) + ')' : ''); }).join(', ')) +
        (x.commessa.data_inizio ? ' · inizio ' + esc(fd(x.commessa.data_inizio)) : '') + '</div>' +
        '<button class="btn sm p" style="margin-top:6px" data-id="' + esc(x.commessa.id) + '" onclick="closeM(\'m-pronte-ritardo\');openCommessaDetail(this.dataset.id)">Apri la commessa</button></div>';
    }).join('')) + '</div>';
  openM('m-pronte-ritardo');
}
