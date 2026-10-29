// =====================================================================
// F11.2 — FATTURE: EMISSIONE, SCADENZE, PAGAMENTI (fasi 5-7 del piano in
// CLAUDE.md). Caricare dopo 43-fatture-bozze.js e prima di 19-init.js.
// Funziona solo con sql/46-fatture-emissione-pagamenti eseguito (che
// richiede sql/45): senza, il sito resta come con il 45 (bozze senza
// emissione) e senza il 45 come oggi.
//
// - EMISSIONE (finestra m-emetti-fattura, id mef-): dalla bozza
//   ("📤 Emetti fattura" in m-fattura: prima salva la bozza), dalla
//   fattura d'anticipo del preventivo e dalla fattura finale della
//   commessa. Data (giorno italiano, mai nel futuro), modalità di
//   pagamento, rate (numero, giorni, importi modificabili; la somma deve
//   fare il totale IVA compresa). Il numero lo assegna il database
//   (emetti_fattura, emetti_fattura_anticipo,
//   emetti_fattura_finale_commessa): niente doppioni né buchi.
// - FATTURA EMESSA (m-fattura, box mfat-emessa): rate con pagato e
//   residuo, "💶 Registra pagamento" per rata (m-pagamento-fattura, id
//   mpg-), pagamenti con "↩ Annulla" (m-annulla-pagamento, id map-),
//   "🔁 Annulla con nota di credito" (m-nota-credito, id mnc-) se non ci
//   sono pagamenti. Fattura emessa: niente modifiche (lo impone il
//   database).
// - SCADENZE (fase 6): riquadro fat-scadenze-box nella pagina Fatture
//   (scadute, prossimi 30 giorni, tutte da incassare, pagate) e KPI
//   "Incassi" nelle dashboard di titolare (tit-incassi), segreteria
//   (seg-incassi) e contabile (dash-incassi).
// - ANTICIPO (passo 6): nella lista "Anticipi da fatturare" e nella
//   scheda preventivo, accanto ai bottoni di F4.3, "🧾 Emetti fattura
//   d'anticipo". Con la fattura vera i bottoni di F4.3 (registra
//   fattura, accredito verificato) spariscono: l'accredito è il
//   pagamento registrato della sua rata, che porta il preventivo ad
//   accettato e fa nascere la commessa. Il percorso di F4.3 resta per la
//   fattura emessa fuori dal gestionale.
// - FATTURA FINALE (passo 12, F9.2): nel box della commessa in fine
//   lavori "🧾 Emetti fattura finale" accanto alla registrazione a mano.
// =====================================================================

const RUOLI_PAGAMENTI_FATTURE = ['titolare', 'segreteria', 'contabile'];
const MODALITA_PAGAMENTO_FATTURA = [
  ['bonifico', 'Bonifico'], ['contanti', 'Contanti'], ['assegno', 'Assegno'], ['carta', 'Carta / POS'],
  ['riba', 'RIBA'], ['compensazione', 'Compensazione'], ['altro', 'Altro']
];
const FILTRI_SCADENZE_FATTURE = [
  ['prossime', 'Scadute e prossimi 30 giorni'], ['scadute', 'Solo scadute'],
  ['aperte', 'Tutte da incassare'], ['pagate', 'Pagate (ultimi 90 giorni)']
];
const ETICHETTE_ORIGINE_FATTURA = { anticipo: '💶 Anticipo', finale: '🏁 Finale commessa' };

let fattureEmissioneAttive = null; // null = da verificare (sql/46)
let emissione = null;              // stato della finestra m-emetti-fattura
let pagamentoAperto = null;        // rata della finestra m-pagamento-fattura
let pagamentiMostrati = {};        // pagamenti disegnati in m-fattura (per l'annullamento)
let pagamentoDaAnnullare = null;
let filtroScadenzeRichiesto = null;

// ── Utilità ──────────────────────────────────────────────────────────────
function oggiFattura() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

function aggiungiGiorniISO(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + (Number(n) || 0));
  return dataLocaleISO(d);
}

function giorniTraISO(da, a) {
  return Math.round((new Date(String(a).slice(0, 10) + 'T12:00:00') - new Date(String(da).slice(0, 10) + 'T12:00:00')) / 86400000);
}

function puoGestirePagamenti() {
  return RUOLI_PAGAMENTI_FATTURE.includes(ROLE);
}

// Il pagamento della fattura d'anticipo lo registra la segreteria (o il
// titolare): è la verifica dell'accredito di F4.3 (sql/46).
function puoPagamentoFattura(f) {
  return puoGestirePagamenti() && !!f && (f.origine !== 'anticipo' || ROLE !== 'contabile');
}

function etichettaModalita(m) {
  const t = MODALITA_PAGAMENTO_FATTURA.find(function(x) { return x[0] === m; });
  return t ? t[1] : (m || '—');
}

function totaleConIva(imponibile, ivaPerc) {
  const imp = arrotonda2(imponibile);
  return arrotonda2(imp + arrotonda2(imp * (Number(ivaPerc) || 0) / 100));
}

function residuoRata(s) {
  return arrotonda2((Number(s.importo) || 0) - (Number(s.importo_pagato) || 0));
}

function datiFiscaliMancanti(c) {
  if (!c) return false;
  return !String(c.piva || '').trim() && !String(c.codice_fiscale || '').trim();
}

// true se sql/46 è stato eseguito (tabella fatture_pagamenti).
async function verificaFattureEmissione() {
  if (fattureEmissioneAttive !== null) return fattureEmissioneAttive;
  if (!(await verificaFattureBozze())) return false;
  const { error } = await db.from('fatture_pagamenti').select('id').limit(1);
  if (!error) fattureEmissioneAttive = true;
  else if (error.code === '42P01' || error.code === 'PGRST205' || /fatture_pagamenti/i.test(error.message || '')) fattureEmissioneAttive = false;
  else return false; // errore momentaneo: si riprova la prossima volta
  return fattureEmissioneAttive;
}

// Legge tutte le righe di una query a pagine da 1000 (limite dell'API).
async function leggiTuttePagine(crea, massimo) {
  const righe = [];
  const max = massimo || 10000;
  for (let da = 0; da < max; da += 1000) {
    const { data, error } = await crea().range(da, da + 999);
    if (error) return { errore: error, righe: righe };
    righe.push.apply(righe, data || []);
    if (!data || data.length < 1000) break;
  }
  return { righe: righe };
}

// Dopo emissione, pagamento o nota di credito: ricarica quello che è aperto.
async function aggiornaDopoFatture(fatturaId, preventivoId) {
  try {
    const mf = ge('m-fattura');
    if (fatturaId && mf && mf.classList.contains('on') && fatBozza && fatBozza.id === fatturaId) await apriFattura(fatturaId);
    const pf = ge('pg-fatture');
    if (pf && pf.classList.contains('on')) await loadFatture();
    const pw = ge('pg-workflow');
    if (pw && pw.classList.contains('on')) await loadWorkflow();
    if (preventivoId && typeof aggiornaDopoAnticipoSegreteria === 'function') await aggiornaDopoAnticipoSegreteria(preventivoId);
    const pd = ge('pg-dashboard');
    if (pd && pd.classList.contains('on')) await caricaKpiIncassi();
  } catch (e) { console.warn('Aggiornamento dopo fatture:', e); }
}

// ── Finestra m-fattura: emissione, scadenze, pagamenti, nota di credito ──
const disegnaFatturaPrimaEmissione = disegnaFattura;
disegnaFattura = function() {
  const r = disegnaFatturaPrimaEmissione.apply(this, arguments);
  decoraFinestraFattura().catch(function(e) { console.warn('Emissione fattura:', e); });
  return r;
};

async function decoraFinestraFattura() {
  const box = ge('mfat-emessa');
  const bEm = ge('mfat-emetti');
  const bNc = ge('mfat-nota-credito');
  if (!box || !bEm || !bNc) return;
  box.innerHTML = '';
  bEm.style.display = 'none';
  bNc.style.display = 'none';
  const b = fatBozza;
  if (!b || !(await verificaFattureEmissione()) || fatBozza !== b) return;
  if (b.modificabile) {
    bEm.style.display = '';
    bEm.disabled = false;
    return;
  }
  const f = b.fattura;
  if (f && f.stato !== 'bozza') await caricaScadenzeNellaFattura(f);
}

async function caricaScadenzeNellaFattura(f) {
  const box = ge('mfat-emessa');
  const fid = f.id;
  const collegata = f.tipo_documento === 'fattura'
    ? db.from('fatture').select('id,numero,data_emissione').eq('riferimento_fattura_id', fid).eq('tipo_documento', 'nota_credito').is('eliminato_il', null)
    : db.from('fatture').select('id,numero,data_emissione').eq('id', f.riferimento_fattura_id || '00000000-0000-0000-0000-000000000000');
  const [rs, rp, rc] = await Promise.all([
    db.from('fatture_scadenze').select('*').eq('fattura_id', fid).order('numero_rata', { ascending: true }),
    db.from('fatture_pagamenti').select('*').eq('fattura_id', fid).order('data_pagamento', { ascending: true }).order('registrato_il', { ascending: true }),
    collegata
  ]);
  if (!fatBozza || fatBozza.id !== fid) return;
  if (rs.error || rp.error) {
    box.innerHTML = '<div class="al2 e" style="margin-bottom:10px">Scadenze non leggibili: ' + esc((rs.error || rp.error).message || 'errore') + '</div>';
    return;
  }
  const scad = rs.data || [];
  const pag = rp.data || [];
  const coll = (rc && rc.data) || [];
  const oggi = oggiFattura();
  const attivi = pag.filter(function(p) { return !p.annullato_il; });
  const puoPag = puoPagamentoFattura(f) && f.stato === 'emessa';
  pagamentiMostrati = {};
  pag.forEach(function(p) { pagamentiMostrati[p.id] = Object.assign({ numero: f.numero }, p); });

  let html = '';
  // Origine e collegamenti
  const righeInfo = [];
  if (f.origine === 'anticipo') {
    righeInfo.push('💶 Fattura d\'anticipo del preventivo' + (f.preventivo_id && canAccessPage('preventivo-detail')
      ? ' <button class="btn sm" data-id="' + esc(f.preventivo_id) + '" onclick="closeM(\'m-fattura\');openPreventivoDetail(this.dataset.id)">Apri preventivo</button>' : '') +
      '<div style="font-size:12px;color:var(--m)">Pagata per intero = accredito verificato: il preventivo diventa accettato e nasce la commessa.</div>');
  }
  if (f.origine === 'finale') {
    righeInfo.push('🏁 Fattura finale della commessa' + (f.commessa_id && canAccessPage('commessa-detail')
      ? ' <button class="btn sm" data-id="' + esc(f.commessa_id) + '" onclick="closeM(\'m-fattura\');openCommessaDetail(this.dataset.id)">Apri commessa</button>' : ''));
  }
  if (f.tipo_documento === 'nota_credito' && coll[0]) {
    righeInfo.push('🔁 Storna la fattura n. ' + esc(coll[0].numero || '') + ' del ' + esc(fd(coll[0].data_emissione)) +
      ' <button class="btn sm" data-id="' + esc(coll[0].id) + '" onclick="apriFattura(this.dataset.id)">Vedi</button>');
  }
  if (f.stato === 'annullata') {
    righeInfo.push('<span style="color:var(--r)">Annullata</span>' + (coll[0] ? ' con la nota di credito n. ' + esc(coll[0].numero || '') + ' del ' + esc(fd(coll[0].data_emissione)) +
      ' <button class="btn sm" data-id="' + esc(coll[0].id) + '" onclick="apriFattura(this.dataset.id)">Vedi</button>' : ''));
  }
  if (righeInfo.length) html += '<div class="card" style="margin-bottom:10px;font-size:13px;overflow-wrap:anywhere">' + righeInfo.map(function(t) { return '<div style="margin:2px 0">' + t + '</div>'; }).join('') + '</div>';

  if (f.tipo_documento === 'fattura') {
    html += '<div style="font-size:12px;font-weight:600;color:var(--m);text-transform:uppercase;margin-bottom:6px">Scadenze</div>';
    if (!scad.length) html += '<div class="empty" style="padding:10px">Nessuna scadenza</div>';
    html += scad.map(function(s) {
      const residuo = residuoRata(s);
      const aperta = s.stato !== 'pagata' && f.stato === 'emessa';
      const scaduta = aperta && s.data_scadenza < oggi;
      return '<div style="border:0.5px solid var(--bo);border-radius:var(--rs);padding:8px;margin-bottom:6px;font-size:13px;overflow-wrap:anywhere' + (scaduta ? ';border-left:3px solid var(--r)' : '') + '">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<span><b>Rata ' + esc(s.numero_rata) + '</b> · scade il ' + esc(fd(s.data_scadenza)) +
            (scaduta ? ' <span class="bx berr">Scaduta da ' + giorniTraISO(s.data_scadenza, oggi) + ' gg</span>' : '') + '</span>' +
          '<span>' + (f.stato === 'annullata' && s.stato !== 'pagata' ? '<span class="bx bgray">Annullata: niente da incassare</span>' : bsPag(s.stato)) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:4px;color:var(--m);font-size:12px">' +
          '<span>Importo ' + esc(euroBuono(s.importo)) + (Number(s.importo_pagato) ? ' · pagato ' + esc(euroBuono(s.importo_pagato)) : '') +
            (aperta ? ' · <b style="color:var(--t,inherit)">da incassare ' + esc(euroBuono(residuo)) + '</b>' : (s.data_pagamento ? ' · pagata il ' + esc(fd(s.data_pagamento)) : '')) + '</span>' +
          (puoPag && aperta && s.stato !== 'in_riba'
            ? '<button class="btn sm p" data-id="' + esc(s.id) + '" onclick="apriPagamentoFattura(this.dataset.id)">💶 Registra pagamento</button>' : '') +
        '</div></div>';
    }).join('');

    if (pag.length) {
      html += '<div style="font-size:12px;font-weight:600;color:var(--m);text-transform:uppercase;margin:10px 0 6px">Pagamenti registrati</div>';
      html += pag.map(function(p) {
        const rata = scad.find(function(s) { return s.id === p.scadenza_id; });
        const annullato = !!p.annullato_il;
        return '<div style="border:0.5px solid var(--bo);border-radius:var(--rs);padding:8px;margin-bottom:6px;font-size:12px;overflow-wrap:anywhere' + (annullato ? ';opacity:.6' : '') + '">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
            '<span' + (annullato ? ' style="text-decoration:line-through"' : '') + '><b>' + esc(euroBuono(p.importo)) + '</b> il ' + esc(fd(p.data_pagamento)) + ' · ' + esc(etichettaModalita(p.modalita)) +
              (rata ? ' · rata ' + esc(rata.numero_rata) : '') + '</span>' +
            (!annullato && puoPag ? '<button class="btn sm" data-id="' + esc(p.id) + '" onclick="apriAnnullaPagamento(this.dataset.id)">↩ Annulla</button>' : '') +
          '</div>' +
          (p.note ? '<div style="margin-top:2px">' + esc(p.note) + '</div>' : '') +
          '<div style="color:var(--m);margin-top:2px">Registrato' + (p.registrato_da_nome ? ' da ' + esc(p.registrato_da_nome) : '') + (p.registrato_il ? ' il ' + esc(fd(dataLocaleISO(new Date(p.registrato_il)))) : '') + '</div>' +
          (annullato ? '<div style="color:var(--r);margin-top:2px">Annullato' + (p.annullato_da_nome ? ' da ' + esc(p.annullato_da_nome) : '') + ': ' + esc(p.motivo_annullamento || '') + '</div>' : '') +
        '</div>';
      }).join('');
    }
  }
  box.innerHTML = html;

  const bNc = ge('mfat-nota-credito');
  const puoNc = f.stato === 'emessa' && f.tipo_documento === 'fattura' && puoGestirePagamenti() &&
    (f.origine === 'scheda' || ROLE !== 'contabile') && !attivi.length && !scad.some(function(s) { return s.stato === 'in_riba'; });
  if (bNc) bNc.style.display = puoNc ? '' : 'none';
}

// ── Emissione ────────────────────────────────────────────────────────────
async function apriEmissioneDaBozza() {
  const b = fatBozza;
  if (!b || !b.modificabile) return;
  if (!(await verificaFattureEmissione())) { toast('L\'emissione non è ancora attiva (sql/46)', 'err'); return; }
  const btn = ge('mfat-emetti');
  btn.disabled = true;
  const salvata = await salvaBozzaFattura({ restaAperta: true });
  btn.disabled = false;
  if (!salvata || !salvata.id) return;
  const { data: f, error } = await db.from('fatture')
    .select('id,cliente_id,totale,totale_imponibile,totale_iva,iva_perc,clienti(ragione_sociale,piva,codice_fiscale,giorni_pagamento,modalita_pagamento)')
    .eq('id', salvata.id).maybeSingle();
  if (error || !f) { erroreFattura('Bozza salvata ma non riletta: riaprila dalla lista.'); return; }
  apriEmissione({
    modo: 'bozza', fatturaId: f.id, cliente: f.clienti || {},
    totale: Number(f.totale) || 0, imponibile: Number(f.totale_imponibile) || 0, ivaPerc: Number(f.iva_perc ?? 22),
    titolo: '📤 Emetti fattura', sottotitolo: (f.clienti && f.clienti.ragione_sociale) || b.cliente || ''
  });
}

async function apriEmissioneAnticipo(preventivoId) {
  if (typeof puoRegistrareAccreditoAnticipo === 'function' && !puoRegistrareAccreditoAnticipo()) {
    toast('La fattura d\'anticipo la emette la segreteria (o il titolare)', 'err');
    return;
  }
  if (!(await verificaFattureEmissione())) { toast('L\'emissione non è ancora attiva (sql/46)', 'err'); return; }
  const { data: p, error } = await db.from('preventivi')
    .select('id,numero,stato,data_emissione,totale_imponibile,iva_perc,anticipo_richiesto,anticipo_tipo,anticipo_valore,anticipo_fattura_numero,clienti(ragione_sociale,piva,codice_fiscale,giorni_pagamento,modalita_pagamento)')
    .eq('id', preventivoId).maybeSingle();
  if (error || !p) { toast('Preventivo non caricato: ' + ((error && error.message) || 'non trovato'), 'err'); return; }
  if (p.stato !== 'in_attesa_anticipo') { toast('Il preventivo non è più in attesa dell\'anticipo', 'err'); return; }
  if (p.anticipo_fattura_numero) { toast('C\'è già una fattura d\'anticipo (n. ' + p.anticipo_fattura_numero + ')', 'err'); return; }
  const atteso = arrotonda2(importoAnticipoPreventivo(p.anticipo_tipo, p.anticipo_valore, p.totale_imponibile));
  apriEmissione({
    modo: 'anticipo', preventivoId: p.id, preventivo: p, cliente: p.clienti || {},
    atteso: atteso, importo: atteso, massimo: arrotonda2(numeroPreventivo(p.totale_imponibile)),
    ivaPerc: Number(p.iva_perc ?? 22), giorni: 0, modalita: 'Bonifico anticipato',
    titolo: '🧾 Emetti fattura d\'anticipo',
    sottotitolo: 'Preventivo n. ' + (p.numero || '—') + ' · ' + ((p.clienti && p.clienti.ragione_sociale) || 'Cliente')
  });
}

async function apriEmissioneFinale() {
  const commessa = typeof commessaFatturaFinale !== 'undefined' ? commessaFatturaFinale : null;
  const s = commessa ? statoChiusuraDi(commessa) : null;
  if (!commessa || !s || !puoRegistrareFatturaFinale(commessa) || commessa.stato !== 'fine_lavori') {
    toast('La fattura finale si emette con la commessa in fine lavori (segreteria o titolare)', 'err');
    return;
  }
  if (!(await verificaFattureEmissione())) { toast('L\'emissione non è ancora attiva (sql/46)', 'err'); return; }
  const { data: cli } = await db.from('clienti')
    .select('ragione_sociale,piva,codice_fiscale,giorni_pagamento,modalita_pagamento').eq('id', commessa.cliente_id).maybeSingle();
  const calcolo = s.calcolo || {};
  const conExtra = true;
  const proposto = arrotonda2(importoFatturaFinaleProposto(calcolo, conExtra));
  apriEmissione({
    modo: 'finale', commessaId: commessa.id, commessa: commessa, calcolo: calcolo, cliente: cli || {},
    conExtra: conExtra, proposto: proposto, importo: proposto, ivaPerc: Number(calcolo.iva_perc ?? 22),
    titolo: '🧾 Emetti fattura finale',
    sottotitolo: 'Commessa ' + commessa.codice + ' · ' + [commessa.clienti && commessa.clienti.ragione_sociale, commessa.titolo].filter(Boolean).join(' · ')
  });
}

function apriEmissione(conf) {
  emissione = conf;
  const oggi = oggiFattura();
  ge('mef-titolo').textContent = conf.titolo;
  ge('mef-sottotitolo').textContent = conf.sottotitolo || '';
  ge('mef-data').value = oggi;
  ge('mef-data').max = oggi;
  ge('mef-modalita').value = conf.modalita || (conf.cliente && conf.cliente.modalita_pagamento) || '';
  const sel = ge('mef-n-rate');
  sel.innerHTML = Array.from({ length: 12 }, function(_, i) { return '<option value="' + (i + 1) + '">' + (i + 1) + (i ? ' rate' : ' rata') + '</option>'; }).join('');
  sel.value = '1';
  const giorni = conf.giorni !== undefined ? conf.giorni : (conf.cliente && conf.cliente.giorni_pagamento != null ? conf.cliente.giorni_pagamento : 30);
  ge('mef-giorni').value = String(giorni);
  ge('mef-intervallo').value = '30';
  ge('mef-conferma').checked = false;
  ge('mef-errore').style.display = 'none';
  ge('mef-salva').disabled = true;
  ge('mef-salva').textContent = conf.modo === 'bozza' ? '📤 Emetti fattura' : (conf.modo === 'anticipo' ? '🧾 Emetti fattura d\'anticipo' : '🧾 Emetti fattura finale');
  disegnaDatiEmissione();
  ricalcolaRateEmissione();
  openM('m-emetti-fattura');
}

function totaleEmissione() {
  const e = emissione;
  if (!e) return 0;
  if (e.modo === 'bozza') return arrotonda2(e.totale);
  return totaleConIva(e.importo, e.ivaPerc);
}

function disegnaDatiEmissione() {
  const e = emissione;
  const el = ge('mef-dati');
  if (!e || !el) return;
  let html = '';
  if (datiFiscaliMancanti(e.cliente)) {
    html += '<div class="al2 e" style="margin-bottom:8px">Mancano partita IVA e codice fiscale del cliente: completali nella scheda del cliente, poi emetti.</div>';
  }
  if (e.modo === 'bozza') {
    html += '<div class="card" style="font-size:13px">' +
      '<div style="display:flex;justify-content:space-between"><span>Imponibile</span><span>' + esc(euroBuono(e.imponibile)) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span>IVA ' + esc(String(e.ivaPerc).replace('.', ',')) + '%</span><span>' + esc(euroBuono(arrotonda2(e.totale - e.imponibile))) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;margin-top:4px"><span>Totale</span><span>' + esc(euroBuono(e.totale)) + '</span></div>' +
      '<div style="font-size:11px;color:var(--m);margin-top:4px">Righe e importi sono quelli della bozza appena salvata. I dati fiscali del cliente si copiano nella fattura all\'emissione.</div></div>';
  } else if (e.modo === 'anticipo') {
    const p = e.preventivo;
    html += '<div class="al2 i" style="margin-bottom:8px;font-size:13px">Anticipo richiesto: <b>' + esc(testoAnticipoPreventivo(p.anticipo_tipo, p.anticipo_valore, p.totale_imponibile) || '—') + '</b><br>' +
      'Totale imponibile del preventivo: ' + esc(euroPreventivo(p.totale_imponibile)) + '<br>' +
      'Quando la fattura risulta <b>pagata per intero</b> (pagamento registrato dalla segreteria) il preventivo diventa accettato e nasce la commessa.</div>' +
      '<div class="fr"><div class="f"><label>Importo dell\'anticipo (€, IVA esclusa) *</label>' +
      '<input type="text" id="mef-importo" inputmode="decimal" value="' + esc(String(e.importo).replace('.', ',')) + '" oninput="cambiaImportoEmissione(this.value)"></div>' +
      '<div class="f"><label>Totale con IVA ' + esc(String(e.ivaPerc).replace('.', ',')) + '%</label><div id="mef-totale-calc" style="font-size:15px;font-weight:700;padding:8px 0">' + esc(euroBuono(totaleEmissione())) + '</div></div></div>' +
      '<div id="mef-importo-aiuto" style="font-size:12px;color:var(--m)"></div>' +
      '<div class="f"><label>Descrizione della riga</label><textarea id="mef-descrizione" rows="2" maxlength="1000" placeholder="Vuoto = Anticipo sul preventivo n. ' + esc(p.numero || '—') + ' del ' + esc(fd(p.data_emissione)) + ' - titolo del progetto"></textarea></div>';
  } else if (e.modo === 'finale') {
    const extra = (e.calcolo.extra_accettati || []);
    html += '<div id="mef-calcolo" class="card" style="margin-bottom:8px">' + htmlCalcoloFatturaFinale(e.calcolo, e.conExtra) + '</div>' +
      htmlAvvisiCalcoloFatturaFinale(e.calcolo) +
      (extra.length ? '<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;font-size:13px;font-weight:400;margin:6px 0"><input type="checkbox" id="mef-con-extra"' + (e.conExtra ? ' checked' : '') + ' onchange="cambiaExtraEmissione(this.checked)" style="margin-top:3px"> Comprende i lavori extra accettati (togli la spunta se li fatturi a parte)</label>' : '') +
      '<div class="fr"><div class="f"><label>Imponibile della fattura finale (€, IVA esclusa) *</label>' +
      '<input type="text" id="mef-importo" inputmode="decimal" value="' + esc(String(e.importo).replace('.', ',')) + '" oninput="cambiaImportoEmissione(this.value)"></div>' +
      '<div class="f"><label>Totale con IVA ' + esc(String(e.ivaPerc).replace('.', ',')) + '%</label><div id="mef-totale-calc" style="font-size:15px;font-weight:700;padding:8px 0">' + esc(euroBuono(totaleEmissione())) + '</div></div></div>' +
      '<div id="mef-importo-aiuto" style="font-size:12px;color:var(--m)"></div>' +
      '<div class="f"><label id="mef-nota-label">Nota (facoltativa)</label><textarea id="mef-nota" rows="2" maxlength="1000" oninput="aggiornaEmissione()"></textarea></div>' +
      '<div style="font-size:12px;color:var(--m)">Le righe della fattura: lavori del preventivo, lavori extra compresi, anticipi già fatturati in detrazione e, se l\'imponibile è diverso dal calcolato, una riga di rettifica con la nota. La fattura viene anche registrata sulla commessa (serve per chiuderla).</div>';
  }
  el.innerHTML = html;
}

function cambiaImportoEmissione(valore) {
  if (!emissione) return;
  const n = numeroDaCampo(valore);
  emissione.importo = isNaN(n) ? 0 : arrotonda2(n);
  const t = ge('mef-totale-calc');
  if (t) t.textContent = euroBuono(totaleEmissione());
  ricalcolaRateEmissione();
}

function cambiaExtraEmissione(conExtra) {
  const e = emissione;
  if (!e || e.modo !== 'finale') return;
  e.conExtra = !!conExtra;
  e.proposto = arrotonda2(importoFatturaFinaleProposto(e.calcolo, e.conExtra));
  e.importo = e.proposto;
  const nota = v('mef-nota');
  disegnaDatiEmissione();
  if (ge('mef-nota')) ge('mef-nota').value = nota;
  ricalcolaRateEmissione();
}

// Rate uguali (l'ultima prende i centesimi che avanzano), dalla data della
// fattura + giorni, poi ogni "intervallo" giorni.
function ricalcolaRateEmissione() {
  const e = emissione;
  if (!e) return;
  const n = Math.max(1, Math.min(12, parseInt(v('mef-n-rate'), 10) || 1));
  const giorni = Math.max(0, parseInt(v('mef-giorni'), 10) || 0);
  const intervallo = Math.max(1, parseInt(v('mef-intervallo'), 10) || 30);
  const data = v('mef-data') || oggiFattura();
  const tot = totaleEmissione();
  const base = Math.floor(tot * 100 / n) / 100;
  e.rate = [];
  for (let i = 0; i < n; i++) {
    e.rate.push({
      data_scadenza: aggiungiGiorniISO(data, giorni + i * intervallo),
      importo: i === n - 1 ? arrotonda2(tot - base * (n - 1)) : base
    });
  }
  ge('mef-intervallo').disabled = n === 1;
  disegnaRateEmissione();
}

function disegnaRateEmissione() {
  const e = emissione;
  const el = ge('mef-rate');
  if (!e || !el) return;
  el.innerHTML = e.rate.map(function(r, i) {
    return '<div style="display:grid;grid-template-columns:auto minmax(0,1fr) minmax(0,1fr);gap:6px;align-items:center;margin-bottom:6px">' +
      '<span style="font-size:12px;color:var(--m);white-space:nowrap">Rata ' + (i + 1) + '</span>' +
      '<input type="date" value="' + esc(r.data_scadenza) + '" oninput="cambiaRataEmissione(' + i + ',\'data_scadenza\',this.value)" style="width:100%">' +
      '<input type="text" inputmode="decimal" value="' + esc(String(r.importo.toFixed(2)).replace('.', ',')) + '" oninput="cambiaRataEmissione(' + i + ',\'importo\',this.value)" style="width:100%" aria-label="Importo rata ' + (i + 1) + '">' +
    '</div>';
  }).join('');
  aggiornaEmissione();
}

function cambiaRataEmissione(i, campo, valore) {
  const r = emissione && emissione.rate[i];
  if (!r) return;
  if (campo === 'importo') {
    const n = numeroDaCampo(valore);
    r.importo = isNaN(n) ? NaN : arrotonda2(n);
  } else {
    r.data_scadenza = valore;
  }
  aggiornaEmissione();
}

// Controlla la finestra: restituisce il messaggio d'errore o '' se è pronta.
function erroreEmissione() {
  const e = emissione;
  if (!e) return 'Niente da emettere';
  const oggi = oggiFattura();
  const data = v('mef-data');
  if (datiFiscaliMancanti(e.cliente)) return 'Mancano partita IVA e codice fiscale del cliente';
  if (e.modo === 'anticipo') {
    if (!(e.importo > 0)) return 'Indica l\'importo dell\'anticipo (maggiore di zero)';
    if (e.importo > e.massimo) return 'L\'importo supera il totale imponibile del preventivo (' + euroBuono(e.massimo) + ')';
  }
  if (e.modo === 'finale') {
    if (!(e.importo > 0)) return 'Indica l\'imponibile della fattura finale (maggiore di zero)';
    if (e.importo !== e.proposto && !(v('mef-nota') || '').trim()) return 'L\'imponibile è diverso dal calcolato: scrivi il perché nella nota';
  }
  if (totaleEmissione() <= 0) return 'Il totale della fattura deve essere maggiore di zero';
  if (!data) return 'Indica la data della fattura';
  if (data > oggi) return 'La data della fattura non può essere nel futuro';
  let somma = 0;
  for (let i = 0; i < e.rate.length; i++) {
    const r = e.rate[i];
    if (!r.data_scadenza) return 'Rata ' + (i + 1) + ': indica la data';
    if (r.data_scadenza < data) return 'Rata ' + (i + 1) + ': la scadenza è prima della data della fattura';
    if (isNaN(r.importo) || !(r.importo > 0)) return 'Rata ' + (i + 1) + ': l\'importo deve essere maggiore di zero';
    somma = arrotonda2(somma + r.importo);
  }
  if (somma !== totaleEmissione()) return 'La somma delle rate (' + euroBuono(somma) + ') deve essere uguale al totale (' + euroBuono(totaleEmissione()) + ')';
  return '';
}

function aggiornaEmissione() {
  const e = emissione;
  if (!e) return;
  const errore = erroreEmissione();
  const somma = arrotonda2((e.rate || []).reduce(function(t, r) { return t + (isNaN(r.importo) ? 0 : r.importo); }, 0));
  const elS = ge('mef-somma');
  const ok = somma === totaleEmissione();
  elS.innerHTML = 'Somma delle rate: <b>' + esc(euroBuono(somma)) + '</b> su un totale di <b>' + esc(euroBuono(totaleEmissione())) + '</b> (IVA compresa) ' + (ok ? '✅' : '<span style="color:var(--r)">⚠️ deve essere uguale</span>');
  if (e.modo === 'finale') {
    const diverso = e.importo !== e.proposto;
    const lab = ge('mef-nota-label');
    if (lab) lab.textContent = diverso ? 'Perché l\'imponibile è diverso da quello calcolato? *' : 'Nota (facoltativa)';
    const aiuto = ge('mef-importo-aiuto');
    if (aiuto) {
      aiuto.textContent = diverso ? 'Diverso dal calcolato (' + euroBuono(e.proposto) + '): scrivi il perché.' : 'Uguale al calcolato dal gestionale.';
      aiuto.style.color = diverso ? 'var(--a)' : 'var(--m)';
    }
  }
  if (e.modo === 'anticipo') {
    const aiuto = ge('mef-importo-aiuto');
    if (aiuto) {
      const diverso = Math.abs((e.importo || 0) - e.atteso) >= 0.005;
      aiuto.textContent = diverso ? '⚠️ Diverso dall\'anticipo richiesto (' + euroBuono(e.atteso) + '): controlla prima di emettere.' : 'Uguale all\'anticipo richiesto.';
      aiuto.style.color = diverso ? 'var(--a)' : 'var(--m)';
    }
  }
  const er = ge('mef-errore');
  if (errore && (e.rate || []).length) { er.textContent = errore; er.style.display = 'block'; } else { er.style.display = 'none'; }
  ge('mef-salva').disabled = !!errore || !ge('mef-conferma').checked || !!e.inCorso;
}

async function confermaEmissione() {
  const e = emissione;
  if (!e || e.inCorso) return;
  const errore = erroreEmissione();
  if (errore) { toast(errore, 'err'); return; }
  if (!ge('mef-conferma').checked) { toast('Conferma di aver controllato la fattura', 'err'); return; }
  e.inCorso = true;
  ge('mef-salva').disabled = true;
  const scadenze = e.rate.map(function(r) { return { data_scadenza: r.data_scadenza, importo: r.importo }; });
  const data = v('mef-data');
  const modalita = (v('mef-modalita') || '').trim() || null;
  let ris;
  if (e.modo === 'bozza') {
    ris = await db.rpc('emetti_fattura', { p_fattura_id: e.fatturaId, p_data: data, p_modalita_pagamento: modalita, p_scadenze: scadenze });
  } else if (e.modo === 'anticipo') {
    ris = await db.rpc('emetti_fattura_anticipo', {
      p_preventivo_id: e.preventivoId, p_importo: e.importo, p_data: data,
      p_descrizione: (v('mef-descrizione') || '').trim() || null, p_modalita_pagamento: modalita, p_scadenze: scadenze
    });
  } else {
    ris = await db.rpc('emetti_fattura_finale_commessa', {
      p_commessa_id: e.commessaId, p_importo: e.importo, p_con_extra: e.conExtra,
      p_nota: (v('mef-nota') || '').trim() || null, p_data: data, p_modalita_pagamento: modalita, p_scadenze: scadenze
    });
  }
  e.inCorso = false;
  if (ris.error) {
    aggiornaEmissione();
    const er = ge('mef-errore');
    er.textContent = 'Fattura non emessa: ' + (ris.error.message || 'errore');
    er.style.display = 'block';
    return;
  }
  const d = ris.data || {};
  closeM('m-emetti-fattura');
  emissione = null;
  if (e.modo === 'bozza') {
    closeM('m-fattura');
    fatBozza = null;
    toast('Fattura n. ' + d.numero + ' emessa ✓ Totale ' + euroBuono(d.totale) + ', ' + (d.scadenze || []).length + ((d.scadenze || []).length === 1 ? ' scadenza' : ' scadenze'), 'ok');
    await aggiornaDopoFatture(null, null);
    if (d.id) await apriFattura(d.id);
  } else if (e.modo === 'anticipo') {
    toast('Fattura d\'anticipo n. ' + d.numero + ' emessa ✓ Quando è pagata registra il pagamento: il preventivo diventa accettato', 'ok');
    await aggiornaDopoFatture(null, e.preventivoId);
  } else {
    toast('Fattura finale n. ' + d.numero + ' emessa e registrata sulla commessa ' + (d.commessa_codice || '') + ' ✓', 'ok');
    if (typeof commessaApertaId !== 'undefined' && commessaApertaId === e.commessaId) await caricaSchedaCommessa(e.commessaId);
    await aggiornaDopoFatture(null, null);
  }
}

// ── Pagamenti ────────────────────────────────────────────────────────────
async function apriPagamentoFattura(scadenzaId) {
  if (!puoGestirePagamenti()) { toast('I pagamenti li registrano segreteria, contabile o titolare', 'err'); return; }
  const { data: s, error } = await db.from('fatture_scadenze')
    .select('*,fatture(id,numero,data_emissione,stato,tipo_documento,origine,preventivo_id,totale,snap_ragione_sociale,clienti(ragione_sociale))')
    .eq('id', scadenzaId).maybeSingle();
  if (error || !s || !s.fatture) { toast('Rata non trovata: ricarica la pagina', 'err'); return; }
  const f = s.fatture;
  if (!puoPagamentoFattura(f)) { toast('Il pagamento della fattura d\'anticipo lo registra la segreteria (o il titolare)', 'err'); return; }
  if (f.stato !== 'emessa') { toast('La fattura è ' + f.stato + ': niente pagamenti', 'err'); return; }
  if (s.stato === 'pagata') { toast('La rata è già pagata', 'err'); return; }
  if (s.stato === 'in_riba') { toast('La rata è in una RIBA presentata: il pagamento arriva con l\'esito della RIBA', 'err'); return; }
  const residuo = residuoRata(s);
  pagamentoAperto = { scadenza: s, fattura: f, residuo: residuo };
  const oggi = oggiFattura();
  ge('mpg-sottotitolo').textContent = 'Fattura n. ' + f.numero + ' del ' + fd(f.data_emissione) + ' · ' + (f.snap_ragione_sociale || (f.clienti && f.clienti.ragione_sociale) || '');
  ge('mpg-riepilogo').innerHTML = '<b>Rata ' + esc(s.numero_rata) + '</b> · scade il ' + esc(fd(s.data_scadenza)) + '<br>Importo ' + esc(euroBuono(s.importo)) +
    (Number(s.importo_pagato) ? ' · già pagato ' + esc(euroBuono(s.importo_pagato)) : '') + ' · <b>da incassare ' + esc(euroBuono(residuo)) + '</b>';
  ge('mpg-data').value = oggi;
  ge('mpg-data').max = oggi;
  ge('mpg-importo').value = residuo.toFixed(2).replace('.', ',');
  ge('mpg-modalita').innerHTML = '<option value="">Scegli...</option>' + MODALITA_PAGAMENTO_FATTURA.map(function(m) { return '<option value="' + m[0] + '">' + esc(m[1]) + '</option>'; }).join('');
  ge('mpg-modalita').value = 'bonifico';
  ge('mpg-note').value = '';
  ge('mpg-conferma').checked = false;
  ge('mpg-errore').style.display = 'none';
  ge('mpg-avviso').innerHTML = f.origine === 'anticipo'
    ? '<div class="al2 w">È la fattura d\'anticipo: quando è <b>pagata per intero</b> il preventivo diventa accettato (accredito verificato) e nasce la commessa. Non si torna indietro.</div>'
    : '';
  aggiornaPagamentoFattura();
  openM('m-pagamento-fattura');
}

function erroreDatiPagamento() {
  const a = pagamentoAperto;
  if (!a) return 'Nessuna rata';
  const data = v('mpg-data');
  const imp = arrotonda2(numeroDaCampo(v('mpg-importo')));
  if (!data) return 'Indica la data del pagamento';
  if (data > oggiFattura()) return 'La data del pagamento non può essere nel futuro';
  if (isNaN(imp) || !(imp > 0)) return 'Indica l\'importo pagato (maggiore di zero)';
  if (imp > a.residuo) return 'L\'importo supera quanto resta da pagare (' + euroBuono(a.residuo) + ')';
  if (!v('mpg-modalita')) return 'Scegli la modalità';
  return '';
}

function aggiornaPagamentoFattura() {
  const a = pagamentoAperto;
  if (!a) return;
  const errore = erroreDatiPagamento();
  const imp = arrotonda2(numeroDaCampo(v('mpg-importo')));
  const er = ge('mpg-errore');
  if (errore) { er.textContent = errore; er.style.display = 'block'; } else { er.style.display = 'none'; }
  const parziale = !errore && imp < a.residuo;
  const avviso = ge('mpg-avviso');
  const base = a.fattura.origine === 'anticipo'
    ? '<div class="al2 w">È la fattura d\'anticipo: quando è <b>pagata per intero</b> il preventivo diventa accettato (accredito verificato) e nasce la commessa. Non si torna indietro.</div>' : '';
  avviso.innerHTML = base + (parziale ? '<div style="color:var(--a);margin-top:4px">Pagamento parziale: la rata resta da incassare per ' + esc(euroBuono(arrotonda2(a.residuo - imp))) + '.</div>' : '');
  ge('mpg-salva').disabled = !!errore || !ge('mpg-conferma').checked || !!a.inCorso;
}

async function salvaPagamentoFattura() {
  const a = pagamentoAperto;
  if (!a || a.inCorso) return;
  const errore = erroreDatiPagamento();
  if (errore) { toast(errore, 'err'); return; }
  a.inCorso = true;
  ge('mpg-salva').disabled = true;
  const { data, error } = await db.rpc('registra_pagamento_fattura', {
    p_scadenza_id: a.scadenza.id, p_data: v('mpg-data'), p_importo: arrotonda2(numeroDaCampo(v('mpg-importo'))),
    p_modalita: v('mpg-modalita'), p_note: (v('mpg-note') || '').trim() || null
  });
  a.inCorso = false;
  if (error) {
    const er = ge('mpg-errore');
    er.textContent = 'Pagamento non registrato: ' + (error.message || 'errore');
    er.style.display = 'block';
    ge('mpg-salva').disabled = !ge('mpg-conferma').checked;
    return;
  }
  closeM('m-pagamento-fattura');
  pagamentoAperto = null;
  const d = data || {};
  if (d.preventivo_sbloccato) {
    toast('Anticipo pagato: preventivo accettato, via libera al rappresentante' + (d.commessa_codice ? ' · nata la commessa ' + d.commessa_codice : ''), 'ok');
  } else {
    toast('Pagamento registrato ✓ ' + (d.stato_rata === 'pagata' ? 'Rata pagata' : 'Resta da incassare ' + euroBuono(d.residuo)), 'ok');
  }
  await aggiornaDopoFatture(a.fattura.id, a.fattura.origine === 'anticipo' ? a.fattura.preventivo_id : null);
}

function apriAnnullaPagamento(pagamentoId) {
  const p = pagamentiMostrati[pagamentoId];
  if (!p || !puoGestirePagamenti()) return;
  pagamentoDaAnnullare = p;
  ge('map-riepilogo').innerHTML = 'Pagamento di <b>' + esc(euroBuono(p.importo)) + '</b> del ' + esc(fd(p.data_pagamento)) + ' (' + esc(etichettaModalita(p.modalita)) + ') sulla fattura n. ' + esc(p.numero || '');
  ge('map-motivo').value = '';
  ge('map-salva').disabled = true;
  openM('m-annulla-pagamento');
}

async function salvaAnnullaPagamento() {
  const p = pagamentoDaAnnullare;
  const motivo = (v('map-motivo') || '').trim();
  if (!p || !motivo) return;
  ge('map-salva').disabled = true;
  const { error } = await db.rpc('annulla_pagamento_fattura', { p_pagamento_id: p.id, p_motivo: motivo });
  if (error) { ge('map-salva').disabled = false; toast('Pagamento non annullato: ' + (error.message || 'errore'), 'err'); return; }
  closeM('m-annulla-pagamento');
  pagamentoDaAnnullare = null;
  toast('Pagamento annullato: la rata torna da incassare', 'ok');
  await aggiornaDopoFatture(p.fattura_id, null);
}

// ── Nota di credito ──────────────────────────────────────────────────────
function apriNotaCredito() {
  const f = fatBozza && fatBozza.fattura;
  if (!f || f.stato !== 'emessa' || f.tipo_documento !== 'fattura') return;
  const oggi = oggiFattura();
  const effetto = f.origine === 'anticipo'
    ? 'Il preventivo torna senza fattura d\'anticipo: se ne potrà emettere un\'altra.'
    : (f.origine === 'finale' ? 'La commessa torna senza fattura finale: se ne potrà emettere un\'altra (la commessa non si chiude senza).'
      : 'La scheda di lavoro torna "da fatturare": se ne potrà fare una nuova bozza.');
  ge('mnc-riepilogo').innerHTML = 'Fattura <b>n. ' + esc(f.numero) + '</b> del ' + esc(fd(f.data_emissione)) + ' · totale ' + esc(euroBuono(f.totale)) +
    '<br>La nota di credito (numerazione NC/ separata) storna <b>tutta</b> la fattura, che diventa annullata. ' + esc(effetto);
  ge('mnc-data').value = oggi;
  ge('mnc-data').max = oggi;
  ge('mnc-data').min = f.data_emissione || '';
  ge('mnc-motivo').value = '';
  ge('mnc-conferma').checked = false;
  ge('mnc-errore').style.display = 'none';
  ge('mnc-salva').disabled = true;
  openM('m-nota-credito');
}

function aggiornaNotaCredito() {
  const f = fatBozza && fatBozza.fattura;
  const data = v('mnc-data');
  let errore = '';
  if (!f) errore = 'Fattura non aperta';
  else if (!data) errore = 'Indica la data';
  else if (data > oggiFattura()) errore = 'La data non può essere nel futuro';
  else if (f.data_emissione && data < f.data_emissione) errore = 'La data non può essere prima della fattura';
  else if (!(v('mnc-motivo') || '').trim()) errore = 'Scrivi il motivo';
  ge('mnc-salva').disabled = !!errore || !ge('mnc-conferma').checked;
}

async function salvaNotaCredito() {
  const f = fatBozza && fatBozza.fattura;
  if (!f) return;
  ge('mnc-salva').disabled = true;
  const { data, error } = await db.rpc('emetti_nota_credito', {
    p_fattura_id: f.id, p_data: v('mnc-data'), p_motivo: (v('mnc-motivo') || '').trim()
  });
  if (error) {
    const er = ge('mnc-errore');
    er.textContent = 'Nota di credito non emessa: ' + (error.message || 'errore');
    er.style.display = 'block';
    ge('mnc-salva').disabled = false;
    return;
  }
  closeM('m-nota-credito');
  toast('Nota di credito n. ' + (data && data.numero) + ' emessa: fattura n. ' + f.numero + ' annullata', 'ok');
  await aggiornaDopoFatture(f.id, f.origine === 'anticipo' ? f.preventivo_id : null);
  if (f.origine === 'finale' && typeof commessaApertaId !== 'undefined' && commessaApertaId === f.commessa_id) await caricaSchedaCommessa(f.commessa_id);
}

// ── Pagina Fatture: riquadro scadenze e origine nella lista ─────────────
const loadFatturePrimaEmissione = loadFatture;
loadFatture = async function() {
  const r = await loadFatturePrimaEmissione.apply(this, arguments);
  try {
    if (!(await verificaFattureEmissione())) return r;
    const sotto = ge('fat-sottotitolo');
    if (sotto && puoScrivereBozze()) sotto.textContent = 'Bozze dalle schede di lavoro, emissione con numero e scadenze, pagamenti e note di credito.';
    await decoraOrigineListaFatture();
    const attivo = document.activeElement && document.activeElement.id === 'fat-fil-search';
    if (!attivo) await caricaScadenzeFatture();
  } catch (e) { console.warn('Scadenze fatture:', e); }
  return r;
};

async function decoraOrigineListaFatture() {
  const righe = Array.from(document.querySelectorAll('#fat-body tr[data-fattura-id]'));
  if (!righe.length) return;
  const r = await leggiABlocchi(righe.map(function(tr) { return tr.dataset.fatturaId; }), function(b) {
    return db.from('fatture').select('id,origine,stato,tipo_documento').in('id', b);
  });
  const mappa = {};
  (r.righe || []).forEach(function(f) { mappa[f.id] = f; });
  righe.forEach(function(tr) {
    const f = mappa[tr.dataset.fatturaId];
    if (!f) return;
    const td = tr.children[2];
    const o = f.origine;
    if (o && o !== 'scheda' && td && !td.querySelector('.fat-origine')) td.insertAdjacentHTML('beforeend', ' <span class="bx bgray fat-origine" style="font-size:10px">' + esc(ETICHETTE_ORIGINE_FATTURA[o] || o) + '</span>');
    // Note di credito e fatture annullate: niente da incassare.
    const tdPag = tr.children[6];
    if (tdPag && (f.tipo_documento === 'nota_credito' || f.stato === 'annullata')) tdPag.innerHTML = '<span style="color:var(--m)">—</span>';
  });
}

async function caricaScadenzeFatture() {
  const box = ge('fat-scadenze-box');
  if (!box) return;
  const filtroPrima = ge('fat-scad-filtro') ? ge('fat-scad-filtro').value : null;
  const filtro = filtroScadenzeRichiesto || filtroPrima || 'prossime';
  filtroScadenzeRichiesto = null;
  const oggi = oggiFattura();
  let q = function() {
    let x = db.from('fatture_scadenze')
      .select('id,fattura_id,numero_rata,data_scadenza,importo,importo_pagato,stato,data_pagamento,fatture!inner(id,numero,stato,tipo_documento,origine,data_emissione,snap_ragione_sociale,eliminato_il)')
      .eq('fatture.stato', 'emessa').is('fatture.eliminato_il', null);
    if (filtro === 'pagate') x = x.eq('stato', 'pagata').gte('data_pagamento', aggiungiGiorniISO(oggi, -90)).order('data_pagamento', { ascending: false });
    else {
      x = x.neq('stato', 'pagata');
      if (filtro === 'scadute') x = x.lt('data_scadenza', oggi);
      if (filtro === 'prossime') x = x.lte('data_scadenza', aggiungiGiorniISO(oggi, 30));
      x = x.order('data_scadenza', { ascending: true });
    }
    return x;
  };
  const [rs, k] = await Promise.all([leggiTuttePagine(q, 3000), datiKpiIncassi()]);
  if (rs.errore) { box.innerHTML = '<div class="al2 e">Scadenze non leggibili: ' + esc(rs.errore.message || 'errore') + '</div>'; box.style.display = 'block'; return; }
  const scad = rs.righe;
  const aperto = box.querySelector('details') ? box.querySelector('details').open : true;
  let html = '<details' + (aperto ? ' open' : '') + '><summary style="cursor:pointer;font-size:14px;font-weight:600">💶 Scadenze e incassi</summary>' +
    (k ? '<div style="margin-top:8px">' + htmlKpiIncassi(k, false) + '</div>' : '') +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0">' +
      '<select id="fat-scad-filtro" onchange="caricaScadenzeFatture()" style="width:auto;max-width:100%">' +
        FILTRI_SCADENZE_FATTURE.map(function(f) { return '<option value="' + f[0] + '"' + (f[0] === filtro ? ' selected' : '') + '>' + esc(f[1]) + '</option>'; }).join('') +
      '</select><span style="font-size:12px;color:var(--m)">' + scad.length + (scad.length === 1 ? ' rata' : ' rate') + '</span></div>';
  if (!scad.length) {
    html += '<div class="empty" style="padding:10px">' + (filtro === 'pagate' ? 'Nessuna rata pagata negli ultimi 90 giorni' : 'Nessuna rata da incassare in questo elenco') + '</div>';
  } else {
    html += scad.map(function(s) {
      const f = s.fatture || {};
      const residuo = residuoRata(s);
      const aperta = s.stato !== 'pagata';
      const scaduta = aperta && s.data_scadenza < oggi;
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-top:0.5px solid var(--bo)' + (scaduta ? ';border-left:3px solid var(--r);padding-left:8px' : '') + '">' +
        '<div style="min-width:0;overflow-wrap:anywhere"><div style="font-size:13px;font-weight:600">' + esc(f.snap_ragione_sociale || '—') + '</div>' +
          '<div style="font-size:12px;color:var(--m)">Fattura n. <span style="font-family:monospace">' + esc(f.numero || '') + '</span> · rata ' + esc(s.numero_rata) +
            (f.origine && f.origine !== 'scheda' ? ' · ' + esc(ETICHETTE_ORIGINE_FATTURA[f.origine] || f.origine) : '') + '</div>' +
          '<div style="font-size:12px">' + (aperta
            ? 'Scade il ' + esc(fd(s.data_scadenza)) + (scaduta ? ' <span class="bx berr">Scaduta da ' + giorniTraISO(s.data_scadenza, oggi) + ' gg</span>' : '') +
              ' · da incassare <b>' + esc(euroBuono(residuo)) + '</b>' + (Number(s.importo_pagato) ? ' su ' + esc(euroBuono(s.importo)) : '')
            : 'Pagata il ' + esc(fd(s.data_pagamento)) + ' · ' + esc(euroBuono(s.importo))) + ' ' + bsPag(s.stato) + '</div></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          (aperta && s.stato !== 'in_riba' && puoPagamentoFattura(f) ? '<button class="btn sm p" data-id="' + esc(s.id) + '" onclick="apriPagamentoFattura(this.dataset.id)">💶 Pagamento</button>' : '') +
          '<button class="btn sm" data-id="' + esc(f.id) + '" onclick="apriFattura(this.dataset.id)">Apri</button></div></div>';
    }).join('');
  }
  html += '</details>';
  box.innerHTML = html;
  box.style.display = 'block';
}

function vaiAScadenzeFatture(filtro) {
  if (!canAccessPage('fatture')) return;
  filtroScadenzeRichiesto = filtro || 'prossime';
  gotoPage('fatture');
  setTimeout(function() { const b = ge('fat-scadenze-box'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 600);
}

// ── KPI incassi (fase 6) ─────────────────────────────────────────────────
async function datiKpiIncassi() {
  const oggi = oggiFattura();
  const tra30 = aggiungiGiorniISO(oggi, 30);
  const primoMese = oggi.slice(0, 8) + '01';
  const [rs, rp] = await Promise.all([
    leggiTuttePagine(function() {
      return db.from('fatture_scadenze').select('id,importo,importo_pagato,data_scadenza,stato,fatture!inner(stato,eliminato_il)')
        .eq('fatture.stato', 'emessa').is('fatture.eliminato_il', null).neq('stato', 'pagata').order('id');
    }),
    leggiTuttePagine(function() {
      return db.from('fatture_pagamenti').select('id,importo').is('annullato_il', null).gte('data_pagamento', primoMese).lte('data_pagamento', oggi).order('id');
    })
  ]);
  if (rs.errore || rp.errore) return null;
  const k = { daIncassare: 0, nDaIncassare: 0, scaduto: 0, nScadute: 0, in30: 0, nIn30: 0, incassatoMese: 0, nPagamentiMese: 0 };
  rs.righe.forEach(function(s) {
    const r = residuoRata(s);
    if (r <= 0) return;
    k.daIncassare += r; k.nDaIncassare++;
    if (s.data_scadenza < oggi) { k.scaduto += r; k.nScadute++; }
    else if (s.data_scadenza <= tra30) { k.in30 += r; k.nIn30++; }
  });
  rp.righe.forEach(function(p) { k.incassatoMese += Number(p.importo) || 0; k.nPagamentiMese++; });
  ['daIncassare', 'scaduto', 'in30', 'incassatoMese'].forEach(function(c) { k[c] = arrotonda2(k[c]); });
  return k;
}

function htmlKpiIncassi(k, cliccabili) {
  const mese = new Date().toLocaleDateString('it-IT', { month: 'long', timeZone: 'Europe/Rome' });
  const carta = function(classe, icona, valore, etichetta, filtro) {
    const click = cliccabili && filtro ? ' clickable" onclick="vaiAScadenzeFatture(\'' + filtro + '\')' : '';
    return '<div class="kpi-card ' + classe + click + '"><div class="kpi-icon">' + icona + '</div><div class="kpi-num" style="font-size:20px">' + esc(euroBuono(valore)) + '</div><div class="kpi-label">' + etichetta + '</div></div>';
  };
  return '<div class="kpi-grid">' +
    carta('', '💶', k.daIncassare, 'Da incassare (' + k.nDaIncassare + (k.nDaIncassare === 1 ? ' rata' : ' rate') + ')', 'aperte') +
    carta(k.nScadute ? 'attention' : '', '⏰', k.scaduto, 'Scaduto (' + k.nScadute + (k.nScadute === 1 ? ' rata' : ' rate') + ')', 'scadute') +
    carta('warn', '⏳', k.in30, 'In scadenza nei 30 gg (' + k.nIn30 + ')', 'prossime') +
    carta('success', '✅', k.incassatoMese, 'Incassato a ' + esc(mese) + ' (' + k.nPagamentiMese + (k.nPagamentiMese === 1 ? ' pagamento' : ' pagamenti') + ')', 'pagate') +
  '</div>';
}

async function caricaKpiIncassi() {
  const id = ROLE === 'titolare' ? 'tit-incassi' : (ROLE === 'segreteria' ? 'seg-incassi' : (ROLE === 'contabile' ? 'dash-incassi' : null));
  const el = id ? ge(id) : null;
  if (!el) return;
  if (!(await verificaFattureEmissione())) { el.innerHTML = ''; return; }
  const k = await datiKpiIncassi();
  if (!k) { el.innerHTML = ''; return; }
  el.innerHTML = (ROLE === 'contabile'
    ? '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--m);margin-bottom:10px">💶 Incassi</div>'
    : '<div class="tit-section">💶 Incassi</div>') +
    htmlKpiIncassi(k, true) + (ROLE === 'contabile' ? '<div style="height:20px"></div>' : '');
}

const loadDashPrimaIncassi = loadDash;
loadDash = async function() {
  const r = await loadDashPrimaIncassi.apply(this, arguments);
  try { await caricaKpiIncassi(); } catch (e) { console.warn('KPI incassi:', e); }
  return r;
};

// ── Anticipo (passo 6): fattura vera accanto ai bottoni di F4.3 ─────────
const htmlFatturaAnticipoPrimaEmissione = htmlFatturaAnticipoPreventivo;
htmlFatturaAnticipoPreventivo = function(p) {
  const html = htmlFatturaAnticipoPrimaEmissione.apply(this, arguments);
  if (!html || fattureEmissioneAttive !== true || !p || !p.id) return html;
  return html + '<div class="fat-anticipo-vera" data-preventivo-id="' + esc(p.id) + '" data-stato="' + esc(p.stato || '') + '" data-esterna="' + (p.anticipo_fattura_numero ? esc(p.anticipo_fattura_numero) : '') + '" style="margin-top:8px"></div>';
};

const loadAnticipiDaFatturarePrimaEmissione = loadAnticipiDaFatturare;
loadAnticipiDaFatturare = async function() {
  try { await verificaFattureEmissione(); } catch (e) { /* si decide dopo */ }
  const r = await loadAnticipiDaFatturarePrimaEmissione.apply(this, arguments);
  try { await decoraFattureAnticipo(); } catch (e) { console.warn('Fattura d\'anticipo:', e); }
  return r;
};

const openPreventivoDetailPrimaEmissione = openPreventivoDetail;
openPreventivoDetail = async function() {
  try { await verificaFattureEmissione(); } catch (e) { /* si decide dopo */ }
  const r = await openPreventivoDetailPrimaEmissione.apply(this, arguments);
  try { await decoraFattureAnticipo(); } catch (e) { console.warn('Fattura d\'anticipo:', e); }
  return r;
};

async function decoraFattureAnticipo() {
  const segnaposti = Array.from(document.querySelectorAll('.fat-anticipo-vera:not([data-fatto])'));
  if (!segnaposti.length || fattureEmissioneAttive !== true) return;
  const ids = Array.from(new Set(segnaposti.map(function(ph) { return ph.dataset.preventivoId; })));
  const r = await leggiABlocchi(ids, function(b) {
    return db.from('fatture').select('id,numero,stato,stato_pagamento,totale,data_emissione,preventivo_id')
      .eq('origine', 'anticipo').eq('tipo_documento', 'fattura').is('eliminato_il', null).in('preventivo_id', b);
  });
  if (r.errore) return;
  const attive = {};
  (r.righe || []).forEach(function(f) { if (f.stato === 'emessa') attive[f.preventivo_id] = f; });
  const puo = typeof puoRegistrareAccreditoAnticipo === 'function' && puoRegistrareAccreditoAnticipo();
  segnaposti.forEach(function(ph) {
    ph.dataset.fatto = '1';
    const id = ph.dataset.preventivoId;
    const stato = ph.dataset.stato;
    const f = attive[id];
    const contenitore = ph.parentElement;
    const bottoniF43 = contenitore ? Array.from(contenitore.querySelectorAll('button')).filter(function(b) {
      const oc = b.getAttribute('onclick') || '';
      return oc.indexOf('apriAnticipoSegreteria(\'' + id + '\'') !== -1;
    }) : [];
    if (f) {
      bottoniF43.forEach(function(b) { b.style.display = 'none'; });
      ph.innerHTML = '<div style="font-size:12px;line-height:1.6;overflow-wrap:anywhere">🧾 Fattura d\'anticipo <b>n. ' + esc(f.numero) + '</b> emessa dal gestionale · totale ' + esc(euroBuono(f.totale)) + ' ' + bsPag(f.stato_pagamento) +
        (stato === 'in_attesa_anticipo' ? '<br>L\'accredito si registra come <b>pagamento</b> della fattura: pagata per intero, il preventivo diventa accettato e nasce la commessa.' : '') + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
          (stato === 'in_attesa_anticipo' && puo && f.stato_pagamento !== 'pagata'
            ? '<button class="btn sm p" data-id="' + esc(f.id) + '" onclick="apriPagamentoAnticipo(this.dataset.id)">💶 Registra pagamento (accredito)</button>' : '') +
          (canAccessPage('fatture') ? '<button class="btn sm" data-id="' + esc(f.id) + '" onclick="apriFattura(this.dataset.id)">Apri fattura</button>' : '') +
        '</div>';
    } else if (stato === 'in_attesa_anticipo' && !ph.dataset.esterna && puo) {
      bottoniF43.forEach(function(b) {
        if ((b.getAttribute('onclick') || '').indexOf('\'fattura\'') !== -1) {
          b.textContent = '🧾 Fattura emessa fuori: registrala';
          b.classList.remove('p');
        }
      });
      ph.innerHTML = '<button class="btn sm p" data-id="' + esc(id) + '" onclick="apriEmissioneAnticipo(this.dataset.id)">🧾 Emetti fattura d\'anticipo</button>' +
        '<div style="font-size:11px;color:var(--m);margin-top:4px">Fattura vera con numero e scadenza; il suo pagamento registrato sblocca la commessa. Se l\'hai emessa fuori dal gestionale, registrala come prima.</div>';
    }
  });
}

async function apriPagamentoAnticipo(fatturaId) {
  const { data, error } = await db.from('fatture_scadenze').select('id,stato,numero_rata')
    .eq('fattura_id', fatturaId).neq('stato', 'pagata').order('numero_rata', { ascending: true });
  if (error) { toast('Scadenze non leggibili: ' + error.message, 'err'); return; }
  const aperte = data || [];
  if (aperte.length === 1) { await apriPagamentoFattura(aperte[0].id); return; }
  await apriFattura(fatturaId); // più rate (o nessuna): si sceglie dalla fattura
}

// ── Fattura finale (passo 12): fattura vera accanto alla registrazione ───
const disegnaBoxFatturaFinalePrimaEmissione = disegnaBoxFatturaFinale;
disegnaBoxFatturaFinale = function(commessa) {
  const r = disegnaBoxFatturaFinalePrimaEmissione.apply(this, arguments);
  decoraFatturaFinaleVera(commessa).catch(function(e) { console.warn('Fattura finale vera:', e); });
  return r;
};

async function decoraFatturaFinaleVera(commessa) {
  if (!commessa || !(await verificaFattureEmissione())) return;
  const { data } = await db.from('fatture').select('id,numero,stato,stato_pagamento,totale')
    .eq('commessa_id', commessa.id).eq('origine', 'finale').eq('tipo_documento', 'fattura').eq('stato', 'emessa').is('eliminato_il', null).limit(1);
  const card = ge('cmd-fattura-finale-card');
  if (!card || (typeof commessaApertaId !== 'undefined' && commessaApertaId && commessaApertaId !== commessa.id)) return;
  if (card.querySelector('.fat-finale-vera')) return;
  const f = (data || [])[0];
  const s = statoChiusuraDi(commessa);
  const bApri = ge('cmd-fattura-finale-apri');
  const div = document.createElement('div');
  div.className = 'fat-finale-vera';
  div.style.marginTop = '8px';
  if (f) {
    if (bApri) bApri.style.display = 'none';
    div.innerHTML = '<div style="font-size:12px">🧾 Emessa dal gestionale: fattura <b>n. ' + esc(f.numero) + '</b> · totale ' + esc(euroBuono(f.totale)) + ' ' + bsPag(f.stato_pagamento) +
      '. Per correggerla serve la nota di credito.</div>' +
      (canAccessPage('fatture') ? '<button class="btn sm" style="margin-top:6px" data-id="' + esc(f.id) + '" onclick="apriFattura(this.dataset.id)">Apri fattura</button>' : '');
  } else if (s && !s.fattura && commessa.stato === 'fine_lavori' && puoRegistrareFatturaFinale(commessa)) {
    if (bApri) { bApri.textContent = '💶 Fattura emessa fuori: registrala'; bApri.classList.remove('p'); }
    div.innerHTML = '<button class="btn sm p" onclick="apriEmissioneFinale()">🧾 Emetti fattura finale</button>' +
      '<div style="font-size:11px;color:var(--m);margin-top:4px">Fattura vera con numero e scadenze, anticipo già scalato; viene registrata sulla commessa da sola.</div>';
  } else {
    return;
  }
  card.appendChild(div);
}
