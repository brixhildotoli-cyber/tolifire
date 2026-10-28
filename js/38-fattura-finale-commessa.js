// =====================================================================
// F9.2 — FATTURA FINALE e CHIUSURA della commessa (passo 12).
// A fine lavori la segreteria (o il titolare) registra la fattura
// finale: il gestionale propone l'imponibile (IVA esclusa)
//     totale del preventivo accettato
//   + preventivi integrativi dei lavori extra accettati (sql/38, se c'è;
//     si possono escludere se si fatturano a parte)
//   − fatture d'anticipo già registrate (sql/25)
// e la segreteria lo conferma o lo corregge (con il perché).
// Scelta (come F4.3): la fattura finale NON va nella tabella fatture,
// il modulo Fatture (Fase 11) è in costruzione. Sulla commessa restano
// numero, data, imponibile, calcolo, chi e quando (sql/39).
// La commessa passa a 'chiusa' SOLO con la dichiarazione di corretta
// messa in opera nella cartella Chiusura (F9.1, js/37) e la fattura
// finale registrata: lo impone il database (trigger
// trg_commesse_controllo_chiusa). "Chiudi la commessa" (chiudi_commessa):
// segreteria e titolare; il titolare può chiudere lo stesso scrivendo il
// motivo (chiusura forzata, motivo e problemi nello storico).
// Dove: box cmd-fattura-finale nella scheda della commessa (dopo la
// dichiarazione), checklist e bottone nel box cmd-chiusura (js/36),
// finestre m-fattura-finale (id ffc-) e m-chiusura-commessa (id chc-).
// In "Stato e storico" (js/18) il passaggio "→ Chiusa" rimanda alla
// scheda. Senza sql/39 tutto resta come prima.
// =====================================================================

const RUOLI_FATTURA_FINALE = ['titolare', 'segreteria'];
const STATI_FATTURA_FINALE = ['fine_lavori', 'chiusa'];

let fatturaFinaleDisponibile = null;
let statoChiusuraAperto = null;   // risposta di controllo_chiusura_commessa
let commessaFatturaFinale = null; // commessa del box
let fatturaFinaleCommessaLetta = null; // colonne fattura_finale_* lette per tutti i ruoli

// true se sql/39 è stato eseguito (colonne fattura_finale_* sulla commessa).
async function verificaFatturaFinaleDisponibile() {
  if (fatturaFinaleDisponibile !== null) return fatturaFinaleDisponibile;
  if (!(await verificaCommesseDisponibili())) return false;

  const { error } = await db
    .from('commesse')
    .select('fattura_finale_numero')
    .limit(1);

  if (!error) {
    fatturaFinaleDisponibile = true;
  } else if (error.code === '42703' || error.code === 'PGRST204' || /fattura_finale/i.test(error.message || '')) {
    fatturaFinaleDisponibile = false;
  } else {
    return false;
  }
  return fatturaFinaleDisponibile;
}

// true solo dopo la verifica e con sql/39 eseguito (usata da js/18 e js/36).
function chiusuraCommessaAttiva() {
  return fatturaFinaleDisponibile === true;
}

function puoRegistrareFatturaFinale(commessa) {
  if (!commessa || !RUOLI_FATTURA_FINALE.includes(ROLE)) return false;
  if (commessa.stato === 'fine_lavori') return true;
  return commessa.stato === 'chiusa' && ROLE === 'titolare';
}

function puoChiudereCommessa(commessa) {
  return !!commessa && commessa.stato === 'fine_lavori' && RUOLI_FATTURA_FINALE.includes(ROLE);
}

// Stato della chiusura della commessa aperta (solo segreteria e titolare).
function statoChiusuraDi(commessa) {
  return statoChiusuraAperto && commessa && statoChiusuraAperto.commessa_id === commessa.id ? statoChiusuraAperto : null;
}

function dataOggiFatturaFinale() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

function dataLeggibileFatturaFinale(d) {
  if (!d) return '';
  return new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('it-IT');
}

function importoFatturaFinaleProposto(calcolo, conExtra) {
  if (!calcolo) return 0;
  return numeroPreventivo(conExtra ? calcolo.da_fatturare : calcolo.da_fatturare_senza_extra);
}

// Righe del calcolo: preventivo, extra, anticipi, totale.
function htmlCalcoloFatturaFinale(calcolo, conExtra) {
  if (!calcolo) return '';
  const righe = [];
  const riga = function(testo, importo, segno, forte) {
    righe.push(`
      <div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;font-size:13px${forte ? ';font-weight:700;border-top:1px solid var(--bo);margin-top:3px;padding-top:5px' : ''}">
        <span style="min-width:0;overflow-wrap:anywhere">${testo}</span>
        <span style="white-space:nowrap">${segno ? segno + ' ' : ''}${esc(euroPreventivo(importo))}</span>
      </div>
    `);
  };

  riga('Preventivo accettato' + (calcolo.preventivo_numero ? ' n. ' + esc(calcolo.preventivo_numero) : ''), calcolo.totale_preventivo, '', false);
  const extra = calcolo.extra_accettati || [];
  extra.forEach(function(x) {
    const testo = 'Lavoro extra n. ' + esc(x.numero) + (x.preventivo_numero ? ' (preventivo integrativo n. ' + esc(x.preventivo_numero) + ')' : '') +
      (conExtra ? '' : ' <i>fatturato a parte</i>');
    if (conExtra) riga(testo, x.totale_imponibile, '+', false);
    else righe.push(`<div style="font-size:12px;color:var(--m);padding:3px 0">${testo}</div>`);
  });
  if (numeroPreventivo(calcolo.anticipo_preventivo) > 0) {
    riga('Anticipo già fatturato' + (calcolo.anticipo_fattura_numero ? ' (fattura n. ' + esc(calcolo.anticipo_fattura_numero) +
      (calcolo.anticipo_fattura_data ? ' del ' + esc(dataLeggibileFatturaFinale(calcolo.anticipo_fattura_data)) : '') + ')' : ''),
      calcolo.anticipo_preventivo, '−', false);
  }
  if (conExtra) {
    extra.forEach(function(x) {
      if (numeroPreventivo(x.anticipo_fattura_importo) > 0) {
        riga('Anticipo del lavoro extra n. ' + esc(x.numero) + (x.anticipo_fattura_numero ? ' (fattura n. ' + esc(x.anticipo_fattura_numero) + ')' : ''),
          x.anticipo_fattura_importo, '−', false);
      }
    });
  }
  const totale = importoFatturaFinaleProposto(calcolo, conExtra);
  riga('Da fatturare (imponibile, IVA esclusa)', totale, '=', true);
  const iva = Number(calcolo.iva_perc ?? 22);
  righe.push(`<div style="font-size:11px;color:var(--m);text-align:right">IVA ${esc(iva)}%: totale fattura circa ${esc(euroPreventivo(Math.round(totale * (100 + iva)) / 100))}</div>`);
  return righe.join('');
}

function htmlAvvisiCalcoloFatturaFinale(calcolo) {
  const avvisi = (calcolo && calcolo.avvisi) || [];
  const aperti = (calcolo && calcolo.extra_aperti) || [];
  let html = avvisi.map(function(a) { return `<div class="al2 w" style="margin-top:6px">${esc(a)}</div>`; }).join('');
  if (aperti.length) {
    html += `<div class="al2 w" style="margin-top:6px"><b>${aperti.length === 1 ? '1 lavoro extra è' : aperti.length + ' lavori extra sono'} ancora in attesa del preventivo integrativo</b>
      (${aperti.map(function(x) { return 'n. ' + esc(x.numero) + ' ' + esc(x.descrizione); }).join(' · ')}): non sono nel calcolo. Senti il rappresentante.</div>`;
  }
  return html;
}

function htmlFatturaFinaleRegistrata(f) {
  if (!f) return '';
  const conExtra = f.con_extra;
  return `
    <div style="font-size:13px;margin-top:8px">
      ✅ <b>Fattura finale n. ${esc(f.numero)}</b> del ${esc(dataLeggibileFatturaFinale(f.data))}:
      imponibile <b>${esc(euroPreventivo(f.importo))}</b> (IVA esclusa)
      ${conExtra === false ? ' · lavori extra fatturati a parte' : ''}
    </div>
    ${f.calcolato != null && numeroPreventivo(f.calcolato) !== numeroPreventivo(f.importo)
      ? `<div style="font-size:12px;color:var(--m)">Calcolato dal gestionale: ${esc(euroPreventivo(f.calcolato))}</div>` : ''}
    ${f.nota ? `<div style="font-size:12px;white-space:pre-wrap">Nota: ${esc(f.nota)}</div>` : ''}
    ${f.registrata_da_nome || f.registrata_il ? `<div style="font-size:11px;color:var(--m)">Registrata${f.registrata_da_nome ? ' da ' + esc(f.registrata_da_nome) : ''}${f.registrata_il ? ' il ' + esc(dataOraEsitoPreventivo(f.registrata_il)) : ''}</div>` : ''}
  `;
}

// ── Box nella scheda della commessa (chiamata da js/26) ─────────────
// Prima di js/36 (checklist della chiusura) e di js/37.
async function caricaFatturaFinaleCommessa(commessa) {
  const box = ge('cmd-fattura-finale');
  if (box) box.innerHTML = '';
  statoChiusuraAperto = null;
  commessaFatturaFinale = null;
  fatturaFinaleCommessaLetta = null;
  if (!box || !commessa || statiCommessaDisponibili !== true) return;
  if (!STATI_FATTURA_FINALE.includes(commessa.stato)) return;
  if (!(await verificaFatturaFinaleDisponibile())) return;
  commessaFatturaFinale = commessa;

  // Segreteria e titolare: calcolo e controllo dal database.
  if (RUOLI_FATTURA_FINALE.includes(ROLE)) {
    const { data, error } = await db.rpc('controllo_chiusura_commessa', { p_commessa_id: commessa.id });
    if (commessaApertaId && commessaApertaId !== commessa.id) return;
    if (error) {
      box.innerHTML = `<div class="card"><div class="al2 e">Fattura finale: ${esc(error.message || 'errore di lettura')}</div></div>`;
      return;
    }
    statoChiusuraAperto = data;
    disegnaBoxFatturaFinale(commessa);
    return;
  }

  // Gli altri ruoli che leggono la commessa: solo la fattura registrata.
  const { data } = await db
    .from('commesse')
    .select('fattura_finale_numero, fattura_finale_data, fattura_finale_importo, fattura_finale_con_extra')
    .eq('id', commessa.id)
    .maybeSingle();
  if (commessaApertaId && commessaApertaId !== commessa.id) return;
  if (!data || !data.fattura_finale_numero) return;
  fatturaFinaleCommessaLetta = data;
  box.innerHTML = `
    <div class="card">
      <div style="font-size:14px;font-weight:700">💶 Fattura finale</div>
      ${htmlFatturaFinaleRegistrata({ numero: data.fattura_finale_numero, data: data.fattura_finale_data, importo: data.fattura_finale_importo, con_extra: data.fattura_finale_con_extra })}
    </div>
  `;
}

function disegnaBoxFatturaFinale(commessa) {
  const box = ge('cmd-fattura-finale');
  const s = statoChiusuraDi(commessa);
  if (!box || !s) return;
  const calcolo = s.calcolo || {};
  const f = s.fattura;
  const conExtra = f ? f.con_extra !== false : true;
  const puo = puoRegistrareFatturaFinale(commessa);
  const cambiato = (s.problemi || []).find(function(p) { return p.codice === 'calcolo_cambiato'; });

  box.innerHTML = `
    <div class="card" id="cmd-fattura-finale-card">
      <div style="font-size:14px;font-weight:700">💶 Fattura finale</div>
      <div style="font-size:12px;color:var(--m);margin-top:2px">
        La fattura si emette come oggi; qui si registrano numero, data e imponibile. Il gestionale scala l'anticipo già fatturato.
      </div>
      ${f ? htmlFatturaFinaleRegistrata(f) : `
        <div style="margin-top:8px">${htmlCalcoloFatturaFinale(calcolo, conExtra)}</div>
        <div style="font-size:13px;margin-top:6px;color:var(--a)">⚠️ Fattura finale non ancora registrata.</div>
      `}
      ${cambiato ? `<div class="al2 w" style="margin-top:6px">${esc(cambiato.testo)}</div>` : ''}
      ${commessa.stato === 'chiusa' && s.chiusura_forzata ? `<div class="al2 e" style="margin-top:6px">Commessa chiusa dal titolare senza dichiarazione o fattura finale. Motivo: ${esc(s.chiusura_motivo_forzatura || '')}</div>` : ''}
      ${f ? '' : htmlAvvisiCalcoloFatturaFinale(calcolo)}
      ${!puo && commessa.stato === 'chiusa' ? '<div style="font-size:11px;color:var(--m);margin-top:4px">Commessa chiusa: la fattura finale la corregge solo il titolare.</div>' : ''}
      ${puo ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <button class="btn sm${f ? '' : ' p'}" id="cmd-fattura-finale-apri" onclick="apriFatturaFinale()">💶 ${f ? 'Correggi la fattura finale' : 'Registra fattura finale'}</button>
        </div>
      ` : ''}
    </div>
  `;
}

// ── Finestra "Fattura finale" ───────────────────────────────────────
function apriFatturaFinale() {
  const commessa = commessaFatturaFinale;
  const s = statoChiusuraDi(commessa);
  if (!commessa || !s || !puoRegistrareFatturaFinale(commessa)) {
    toast('La fattura finale non si può registrare ora', 'err');
    return;
  }
  const calcolo = s.calcolo || {};
  const f = s.fattura;
  const extra = calcolo.extra_accettati || [];
  const conExtra = f ? f.con_extra !== false : true;

  ge('ffc-sottotitolo').textContent = 'Commessa ' + commessa.codice + ' · ' + [commessa.clienti?.ragione_sociale, commessa.titolo].filter(Boolean).join(' · ');
  ge('ffc-extra-box').style.display = extra.length ? '' : 'none';
  ge('ffc-con-extra').checked = conExtra;
  ge('ffc-numero').value = f ? f.numero : '';
  ge('ffc-data').value = f ? String(f.data || '').slice(0, 10) : dataOggiFatturaFinale();
  ge('ffc-data').max = dataOggiFatturaFinale();
  ge('ffc-importo').value = f ? numeroPreventivo(f.importo).toFixed(2) : importoFatturaFinaleProposto(calcolo, conExtra).toFixed(2);
  ge('ffc-nota').value = f ? (f.nota || '') : '';
  ge('ffc-avvisi').innerHTML = htmlAvvisiCalcoloFatturaFinale(calcolo);
  aggiornaFatturaFinale(false);
  openM('m-fattura-finale');
}

// Ridisegna il calcolo; con "ricalcola" rimette l'importo proposto.
function aggiornaFatturaFinale(ricalcola) {
  const s = statoChiusuraDi(commessaFatturaFinale);
  if (!s) return;
  const calcolo = s.calcolo || {};
  const conExtra = !!ge('ffc-con-extra')?.checked || !(calcolo.extra_accettati || []).length;
  const proposto = importoFatturaFinaleProposto(calcolo, conExtra);
  if (ricalcola) ge('ffc-importo').value = proposto.toFixed(2);

  ge('ffc-calcolo').innerHTML = htmlCalcoloFatturaFinale(calcolo, conExtra);

  const importo = Math.round(numeroPreventivo(ge('ffc-importo').value) * 100) / 100;
  const diverso = importo !== Math.round(proposto * 100) / 100;
  const nota = (v('ffc-nota') || '').trim();
  ge('ffc-nota-label').textContent = diverso ? 'Perché l\'imponibile è diverso da quello calcolato? *' : 'Nota (facoltativa)';
  ge('ffc-importo-aiuto').textContent = diverso
    ? 'Diverso dal calcolato (' + euroPreventivo(proposto) + '): scrivi il perché.'
    : 'Uguale al calcolato dal gestionale.';
  ge('ffc-importo-aiuto').style.color = diverso ? 'var(--a)' : 'var(--m)';

  const numero = (v('ffc-numero') || '').trim();
  const data = v('ffc-data');
  const ok = numero && data && data <= dataOggiFatturaFinale() && importo > 0 && (!diverso || nota);
  ge('ffc-salva').disabled = !ok;
}

async function salvaFatturaFinale() {
  const commessa = commessaFatturaFinale;
  const s = statoChiusuraDi(commessa);
  if (!commessa || !s) return;
  const calcolo = s.calcolo || {};
  const conExtra = !!ge('ffc-con-extra')?.checked || !(calcolo.extra_accettati || []).length;
  const numero = (v('ffc-numero') || '').trim();
  const data = v('ffc-data');
  const importo = Math.round(numeroPreventivo(ge('ffc-importo').value) * 100) / 100;
  const nota = (v('ffc-nota') || '').trim();

  if (!numero || !data || !(importo > 0)) {
    toast('Indica numero, data e imponibile della fattura finale', 'err');
    return;
  }
  if (!confirm('Confermi la fattura finale n. ' + numero + ' del ' + dataLeggibileFatturaFinale(data) +
      ', imponibile ' + euroPreventivo(importo) + ' (IVA esclusa)?')) return;

  const bottone = ge('ffc-salva');
  bottone.disabled = true;
  const { error } = await db.rpc('registra_fattura_finale_commessa', {
    p_commessa_id: commessa.id,
    p_numero: numero,
    p_data: data,
    p_importo: importo,
    p_con_extra: conExtra,
    p_nota: nota || null
  });
  if (error) {
    bottone.disabled = false;
    toast('Fattura finale non registrata: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }
  closeM('m-fattura-finale');
  toast('Fattura finale registrata sulla commessa ' + commessa.codice, 'ok');
  if (commessaApertaId === commessa.id) await caricaSchedaCommessa(commessa.id);
}

// ── Checklist della chiusura (usata da js/36 nel box cmd-chiusura) ───
// Restituisce i punti { ok, blocca, testo, box } o null senza sql/39.
function puntiChiusuraCommessa(commessa) {
  const s = statoChiusuraDi(commessa);
  if (!chiusuraCommessaAttiva() || !s) return null;
  const punti = [];
  const dich = s.dichiarazioni || [];
  punti.push(dich.length
    ? { ok: true, testo: 'Dichiarazione di corretta messa in opera nella cartella Chiusura (' + dich[0].nome_file + ')' }
    : { ok: false, blocca: true, box: 'cmd-dichiarazione', testo: 'Manca la dichiarazione di corretta messa in opera nella cartella Chiusura' });
  punti.push(s.fattura
    ? { ok: true, testo: 'Fattura finale n. ' + s.fattura.numero + ' del ' + dataLeggibileFatturaFinale(s.fattura.data) + ', imponibile ' + euroPreventivo(s.fattura.importo) }
    : { ok: false, blocca: true, box: 'cmd-fattura-finale', testo: 'Manca la fattura finale' });
  (s.problemi || []).forEach(function(p) {
    if (!p.blocca) punti.push({ ok: false, testo: p.testo, box: 'cmd-fattura-finale' });
  });
  // Ordini ai fornitori non arrivati (js/27, sql/30): solo avviso.
  if (typeof commessaOrdiniAperta !== 'undefined' && commessaOrdiniAperta && commessaOrdiniAperta.id === commessa.id &&
      typeof ordiniCommessaAperta !== 'undefined') {
    const nonArrivati = (ordiniCommessaAperta || []).filter(function(o) { return ['ordinato', 'confermato'].includes(o.stato); });
    if (nonArrivati.length) {
      punti.push({ ok: false, box: 'cmd-ordini', testo: nonArrivati.length + (nonArrivati.length === 1 ? ' ordine al fornitore non risulta arrivato' : ' ordini ai fornitori non risultano arrivati') +
        ' (' + nonArrivati.map(function(o) { return o.codice; }).join(', ') + '): segna l\'arrivo o annullalo' });
    }
  }
  return punti;
}

function bloccantiChiusuraCommessa(commessa) {
  const s = statoChiusuraDi(commessa);
  return s ? Number(s.bloccanti || 0) : 0;
}

// Bottone "Chiudi la commessa" nel box cmd-chiusura (js/36).
function htmlBottoneChiudiCommessa(commessa) {
  if (!puoChiudereCommessa(commessa) || !statoChiusuraDi(commessa)) return '';
  const bloccanti = bloccantiChiusuraCommessa(commessa);
  if (!bloccanti) {
    return `<button class="btn sm p" id="cmd-chiudi-commessa" onclick="apriChiusuraCommessa()">✅ Chiudi la commessa</button>`;
  }
  if (ROLE === 'titolare') {
    return `<button class="btn sm" id="cmd-chiudi-commessa" onclick="apriChiusuraCommessa()">Chiudi comunque (con motivo)</button>`;
  }
  return `<button class="btn sm" id="cmd-chiudi-commessa" disabled title="Servono la dichiarazione e la fattura finale">✅ Chiudi la commessa</button>`;
}

// ── Finestra "Chiudi la commessa" ───────────────────────────────────
function apriChiusuraCommessa() {
  const commessa = commessaFatturaFinale;
  const s = statoChiusuraDi(commessa);
  if (!commessa || !s || !puoChiudereCommessa(commessa)) {
    toast('La commessa non si può chiudere ora', 'err');
    return;
  }
  const bloccanti = bloccantiChiusuraCommessa(commessa);
  if (bloccanti && ROLE !== 'titolare') {
    toast('Servono la dichiarazione di corretta messa in opera e la fattura finale', 'err');
    return;
  }
  const punti = puntiChiusuraCommessa(commessa) || [];
  // Avvisi del riepilogo di js/36 (lavori extra, consumabili e noli, %).
  const altri = typeof puntiRiepilogoChiusuraCommessa === 'function' ? puntiRiepilogoChiusuraCommessa(commessa) : [];

  ge('chc-sottotitolo').textContent = 'Commessa ' + commessa.codice + ' · ' + [commessa.clienti?.ragione_sociale, commessa.titolo].filter(Boolean).join(' · ');
  ge('chc-punti').innerHTML = punti.concat(altri).map(function(p) {
    return `<div style="font-size:13px;padding:3px 0;overflow-wrap:anywhere">${p.ok ? (p.info ? '💶' : '✅') : (p.blocca ? '❌' : '⚠️')} ${esc(p.testo)}</div>`;
  }).join('');
  ge('chc-forzata').style.display = bloccanti ? '' : 'none';
  ge('chc-nota-label').textContent = bloccanti ? 'Motivo della chiusura senza dichiarazione o fattura finale *' : 'Nota (facoltativa)';
  ge('chc-nota').value = '';
  ge('chc-conferma').textContent = bloccanti ? 'Chiudi comunque' : '✅ Chiudi la commessa';
  aggiornaChiusuraCommessa();
  openM('m-chiusura-commessa');
}

function aggiornaChiusuraCommessa() {
  const commessa = commessaFatturaFinale;
  const bloccanti = bloccantiChiusuraCommessa(commessa);
  const nota = (v('chc-nota') || '').trim();
  ge('chc-conferma').disabled = !!bloccanti && !nota;
}

async function salvaChiusuraCommessa() {
  const commessa = commessaFatturaFinale;
  if (!commessa) return;
  const bloccanti = bloccantiChiusuraCommessa(commessa);
  const nota = (v('chc-nota') || '').trim();
  if (bloccanti && !nota) {
    toast('Scrivi il motivo', 'err');
    return;
  }
  if (!confirm(bloccanti
    ? 'Chiudi la commessa ' + commessa.codice + ' anche se mancano dichiarazione o fattura finale? Il motivo resta nello storico.'
    : 'Confermi la chiusura della commessa ' + commessa.codice + '?')) return;

  const bottone = ge('chc-conferma');
  bottone.disabled = true;
  const { error } = await db.rpc('chiudi_commessa', { p_commessa_id: commessa.id, p_nota: nota || null });
  if (error) {
    bottone.disabled = false;
    toast('Commessa non chiusa: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }
  closeM('m-chiusura-commessa');
  toast('Commessa ' + commessa.codice + ' chiusa', 'ok');
  if (commessaApertaId === commessa.id) await caricaSchedaCommessa(commessa.id);
  if (typeof caricaCommesseToccaAMe === 'function') await caricaCommesseToccaAMe();
}
