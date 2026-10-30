// =====================================================================
// F11.3 — FATTURE: RIBA, SOLLECITI, DASHBOARD, PDF (fasi 8-12 del piano
// in CLAUDE.md). Caricare dopo 44-fatture-emissione.js e prima di
// 19-init.js. Funziona solo con sql/47-fatture-riba-solleciti eseguito
// (che richiede 45 e 46): senza, il sito resta come con il 46.
//
// - RIBA (fasi 8-9). Pagina Fatture, riquadro fat-riba-box: distinte e
//   rate da presentare, "+ Nuova distinta" (finestra m-riba-distinta, id
//   mrd-): banca, IBAN di accredito, rate aperte (anche insolute o
//   sollecitate, per ripresentarle) con ABI e CAB della banca del
//   cliente. Dettaglio (m-riba-dettaglio, id mrv-): "Segna inviata"
//   (m-riba-invio, id mrn-), esito per riga (m-riba-esito, id mre-:
//   accreditata = pagamento registrato, insoluta = rata e fattura
//   insolute), "Annulla esito" (m-annulla-esito-riba, id mae-, titolare
//   e segreteria), distinta in PDF e CSV e file CBI RiBa per l'home
//   banking (js/48-riba-cbi.js, codice SIA con sql/49).
//   Lo fanno titolare, segreteria, contabile (salva_presentazione_riba,
//   segna_presentazione_riba_inviata, registra_esito_riba...).
// - SOLLECITI (fase 10). Riquadro fat-solleciti-box (insoluti, rate
//   scadute, solleciti senza risposta) e box nella fattura: "📞 Registra
//   sollecito" (m-sollecito, id msl-), esito o "Togli" dell'ultimo
//   (m-esito-sollecito, id mse-). Solo segreteria e titolare; il
//   contabile li vede.
// - DASHBOARD (fase 11): titolare tit-fatturato (fatturato del mese e
//   dell'anno, incassato dell'anno, insoluti); segreteria
//   seg-riba-solleciti e contabile dash-riba-solleciti (RIBA da
//   presentare, distinte da inviare, esiti da registrare, insoluti da
//   sollecitare, scadute, solleciti senza risposta, primi insoluti);
//   rappresentante rap-insoluti-box (insoluti dei suoi clienti:
//   clienti.rappresentante_id = lui, con commessa, materiale e ultimo
//   sollecito).
// - PDF DELLA FATTURA (fase 12): nella fattura emessa o annullata (e
//   nella nota di credito) "📄 Scarica PDF" per chi vede la fattura;
//   "💾 Salva copia" (bucket fatture-pdf, fatture.pdf_url) per titolare,
//   segreteria, contabile; "📂 Copia salvata". Copia di cortesia, non la
//   fattura elettronica SDI.
// - DATI BANCARI: banca d'appoggio, ABI e CAB del cliente (scheda
//   cliente e finestra cliente, titolare e segreteria); banca e IBAN
//   dell'azienda nelle Impostazioni (titolare); con sql/49 anche il codice
//   SIA (file CBI della distinta, js/48).
// =====================================================================

const RUOLI_RIBA = ['titolare', 'segreteria', 'contabile'];
const RUOLI_SOLLECITI = ['titolare', 'segreteria'];
const RUOLI_BANCA_CLIENTE = ['titolare', 'segreteria'];
const MEZZI_SOLLECITO = [
  ['telefono', '📞 Telefono'], ['email', '✉️ Email'], ['pec', '📧 PEC'],
  ['lettera', '✉️ Lettera'], ['raccomandata', '📮 Raccomandata'], ['altro', 'Altro']
];
const STATI_DISTINTA_RIBA = {
  preparata: ['bgray', 'Preparata'],
  inviata: ['bblue', 'Inviata in banca'],
  accreditata: ['bok', 'Accreditata'],
  parzialmente_accreditata: ['bwarn', 'Parzialmente accreditata'],
  chiusa: ['berr', 'Chiusa: tutte insolute']
};
const FILTRI_SOLLECITI = [
  ['tutti', 'Insoluti, scadute e solleciti'], ['insolute', 'Solo insoluti da sollecitare'],
  ['scadute', 'Scadute non sollecitate'], ['attesa', 'Solleciti senza risposta']
];

let fattureRibaAttive = null;   // null = da verificare (sql/47)
let distintaAperta = null;      // stato della finestra m-riba-distinta
let dettaglioDistinta = null;   // distinta della finestra m-riba-dettaglio
let rigaEsitoAperta = null;     // riga della finestra m-riba-esito
let rigaAnnullaEsito = null;    // riga della finestra m-annulla-esito-riba
let sollecitoAperto = null;     // rata della finestra m-sollecito
let esitoSollecitoAperto = null; // { sollecito, modo } della finestra m-esito-sollecito
let invioDistinta = null;       // distinta della finestra m-riba-invio

// ── Utilità ──────────────────────────────────────────────────────────────
function puoRiba() { return RUOLI_RIBA.includes(ROLE); }
function puoSolleciti() { return RUOLI_SOLLECITI.includes(ROLE); }
function puoAnnullareEsitoRiba() { return ['titolare', 'segreteria'].includes(ROLE); }

function ibanPulito(s) {
  return String(s || '').replace(/\s+/g, '').toUpperCase();
}

// ABI e CAB dall'IBAN italiano (come abi_cab_da_iban di sql/47).
function abiCabDaIban(iban) {
  const i = ibanPulito(iban);
  if (!/^IT[0-9]{2}[A-Z][0-9]{10}[0-9A-Z]{12}$/.test(i)) return null;
  return { abi: i.slice(5, 10), cab: i.slice(10, 15) };
}

function ibanValido(iban) {
  return /^[A-Z]{2}[0-9]{2}[0-9A-Z]{11,30}$/.test(ibanPulito(iban));
}

// ABI e CAB del cliente: quelli scritti, altrimenti dall'IBAN.
function abiCabCliente(c, ibanFattura) {
  if (c && c.abi_appoggio && c.cab_appoggio) return { abi: c.abi_appoggio, cab: c.cab_appoggio };
  return abiCabDaIban(c && c.iban) || abiCabDaIban(ibanFattura);
}

function badgeDistinta(stato) {
  const s = STATI_DISTINTA_RIBA[stato] || ['bgray', stato || '—'];
  return '<span class="bx ' + s[0] + '">' + esc(s[1]) + '</span>';
}

function etichettaMezzo(m) {
  const t = MEZZI_SOLLECITO.find(function(x) { return x[0] === m; });
  return t ? t[1] : (m || '—');
}

function modalitaRiba(testo) {
  return /riba|ri\.ba|ricevuta bancaria/i.test(String(testo || ''));
}

function testoSollecito(so) {
  if (!so) return '';
  return 'Sollecito n. ' + so.livello + ' del ' + fd(so.data_invio) + ' (' + etichettaMezzo(so.mezzo) + ')' +
    (so.esito === 'inviato' ? ' · in attesa di risposta' : (so.esito === 'risposto' ? ' · ha risposto' : ' · nessuna risposta')) +
    (so.esito_note ? ': ' + so.esito_note : '');
}

// true se sql/47 è stato eseguito (colonna riba_righe.pagamento_id).
async function verificaFattureRiba() {
  if (fattureRibaAttive !== null) return fattureRibaAttive;
  if (!(await verificaFattureEmissione())) return false;
  const { error } = await db.from('clienti').select('abi_appoggio').limit(1);
  if (!error) fattureRibaAttive = true;
  else if (error.code === '42703' || error.code === 'PGRST204' || /abi_appoggio/i.test(error.message || '')) fattureRibaAttive = false;
  else return false; // errore momentaneo: si riprova la prossima volta
  return fattureRibaAttive;
}

async function leggiImpostazioniBanca() {
  const { data } = await db.from('impostazioni').select('banca_azienda,iban_azienda').eq('id', 1).maybeSingle();
  return data || {};
}

// Dopo distinta, esito o sollecito: ricarica quello che è aperto.
async function aggiornaDopoRiba(fatturaId) {
  try {
    const mf = ge('m-fattura');
    if (fatturaId && mf && mf.classList.contains('on') && fatBozza && fatBozza.id === fatturaId) await apriFattura(fatturaId);
    const md = ge('m-riba-dettaglio');
    if (md && md.classList.contains('on') && dettaglioDistinta) await apriDettaglioDistinta(dettaglioDistinta.id);
    const pf = ge('pg-fatture');
    if (pf && pf.classList.contains('on')) await loadFatture();
    const pd = ge('pg-dashboard');
    if (pd && pd.classList.contains('on')) { await caricaKpiIncassi(); await caricaDashboardFattureRiba(); }
  } catch (e) { console.warn('Aggiornamento dopo RIBA:', e); }
}

// ── Dati bancari del cliente (finestra m-cli e scheda cliente) ───────────
function datiBancaRibaCliente() {
  const box = ge('mf-banca-riba');
  if (fattureRibaAttive !== true || !RUOLI_BANCA_CLIENTE.includes(ROLE) || !box || box.style.display === 'none') return {};
  const banca = (v('mf12') || '').trim();
  const abi = (v('mf13') || '').trim();
  const cab = (v('mf14') || '').trim();
  if ((abi && !/^[0-9]{5}$/.test(abi)) || (cab && !/^[0-9]{5}$/.test(cab))) {
    toast('ABI e CAB sono di 5 cifre', 'err');
    return null;
  }
  if (!!abi !== !!cab) {
    toast('Indica sia ABI sia CAB (o lasciali vuoti: si ricavano dall\'IBAN)', 'err');
    return null;
  }
  return { banca_appoggio: banca || null, abi_appoggio: abi || null, cab_appoggio: cab || null };
}

function suggerisciAbiCabCliente() {
  const aiuto = ge('mf-banca-riba-aiuto');
  if (!aiuto) return;
  const x = abiCabDaIban(v('mf10'));
  aiuto.textContent = x
    ? 'Dall\'IBAN: ABI ' + x.abi + ', CAB ' + x.cab + '. Lasciali vuoti per usare questi.'
    : 'Servono per presentare le RIBA. Vuoti: si ricavano dall\'IBAN italiano.';
}

async function mostraCampiBancaRiba(c) {
  const box = ge('mf-banca-riba');
  if (!box) return;
  ['mf12', 'mf13', 'mf14'].forEach(function(id) { if (ge(id)) ge(id).value = ''; });
  box.style.display = 'none';
  if (!RUOLI_BANCA_CLIENTE.includes(ROLE) || !(await verificaFattureRiba())) return;
  box.style.display = '';
  if (c) {
    ge('mf12').value = c.banca_appoggio || '';
    ge('mf13').value = c.abi_appoggio || '';
    ge('mf14').value = c.cab_appoggio || '';
  }
  suggerisciAbiCabCliente();
}

const openNewCliPrimaRiba = openNewCli;
openNewCli = function() {
  const r = openNewCliPrimaRiba.apply(this, arguments);
  mostraCampiBancaRiba(null).catch(function(e) { console.warn('Banca RIBA:', e); });
  return r;
};

const editCliPrimaRiba = editCli;
editCli = async function(c) {
  const r = await editCliPrimaRiba.apply(this, arguments);
  let cli = c;
  if (typeof cli === 'string') { try { cli = JSON.parse(atob(cli)); } catch (e) { try { cli = JSON.parse(cli); } catch (e2) { cli = null; } } }
  try { await mostraCampiBancaRiba(cli && typeof cli === 'object' ? cli : null); } catch (e) { console.warn('Banca RIBA:', e); }
  return r;
};

const apriClienteSegreteriaPrimaRiba = apriClienteSegreteria;
apriClienteSegreteria = async function(id) {
  const r = await apriClienteSegreteriaPrimaRiba.apply(this, arguments);
  try {
    const { data } = await db.from('clienti').select('*').eq('id', id).maybeSingle();
    await mostraCampiBancaRiba(data || null);
  } catch (e) { console.warn('Banca RIBA:', e); }
  return r;
};

const openClienteDetailPrimaRiba = openClienteDetail;
openClienteDetail = async function(id) {
  const r = await openClienteDetailPrimaRiba.apply(this, arguments);
  try {
    if (!RUOLI_BANCA_CLIENTE.includes(ROLE) || !(await verificaFattureRiba())) return r;
    const cont = ge('cd-info-content');
    const cli = (typeof CLIS !== 'undefined' ? CLIS : []).find(function(c) { return c.id === id; });
    if (!cont || !cli || cont.querySelector('.cd-banca-riba')) return r;
    const griglie = Array.from(cont.querySelectorAll('.g2'));
    const g = griglie.find(function(x) { return /IBAN/.test(x.textContent); });
    if (!g) return r;
    const x = abiCabCliente(cli, null);
    const wrap = document.createElement('div');
    wrap.className = 'cd-banca-riba';
    wrap.style.display = 'contents';
    wrap.innerHTML = ir('Banca d\'appoggio (RIBA)', cli.banca_appoggio) +
      ir('ABI / CAB' + (x && !(cli.abi_appoggio && cli.cab_appoggio) ? ' (dall\'IBAN)' : ''), x ? x.abi + ' / ' + x.cab : '');
    g.appendChild(wrap);
  } catch (e) { console.warn('Banca RIBA scheda cliente:', e); }
  return r;
};

// ── Banca dell'azienda (Impostazioni, titolare) ──────────────────────────
const loadImpPrimaRiba = loadImp;
loadImp = async function() {
  const r = await loadImpPrimaRiba.apply(this, arguments);
  try {
    const box = ge('si-banca-azienda');
    if (box && typeof IMPOSTAZIONI !== 'undefined' && IMPOSTAZIONI && Object.prototype.hasOwnProperty.call(IMPOSTAZIONI, 'iban_azienda')) {
      box.style.display = '';
      ge('si8').value = IMPOSTAZIONI.banca_azienda || '';
      ge('si9').value = IMPOSTAZIONI.iban_azienda || '';
      // Codice SIA (file CBI della distinta, js/48): solo con sql/49.
      const sia = ge('si-sia-box');
      const conSia = Object.prototype.hasOwnProperty.call(IMPOSTAZIONI, 'codice_sia');
      if (sia) sia.style.display = conSia ? '' : 'none';
      if (conSia) ge('si10').value = IMPOSTAZIONI.codice_sia || '';
    }
  } catch (e) { console.warn('Banca azienda:', e); }
  return r;
};

const saveImpPrimaRiba = saveImp;
saveImp = async function() {
  const box = ge('si-banca-azienda');
  const attiva = box && box.style.display !== 'none';
  const banca = attiva ? (v('si8') || '').trim() : '';
  const iban = attiva ? ibanPulito(v('si9')) : '';
  if (attiva && iban && !ibanValido(iban)) { toast('IBAN dell\'azienda non valido', 'err'); return; }
  const boxSia = ge('si-sia-box');
  const conSia = attiva && boxSia && boxSia.style.display !== 'none';
  const sia = conSia ? (v('si10') || '').replace(/\s/g, '').toUpperCase() : '';
  if (conSia && sia && !/^[A-Z0-9]{5}$/.test(sia)) { toast('Il codice SIA ha 5 caratteri, lettere e cifre (lo dà la banca)', 'err'); return; }
  const r = await saveImpPrimaRiba.apply(this, arguments);
  if (attiva && typeof IMPOSTAZIONI !== 'undefined' && IMPOSTAZIONI) {
    const campi = { banca_azienda: banca || null, iban_azienda: iban || null };
    if (conSia) campi.codice_sia = sia || null;
    const { error } = await db.from('impostazioni').update(campi).eq('id', 1);
    if (error) toast('Banca dell\'azienda non salvata: ' + error.message, 'err');
    else await loadImp();
  }
  return r;
};

// ── Pagina Fatture: riquadri RIBA e solleciti ────────────────────────────
const loadFatturePrimaRiba = loadFatture;
loadFatture = async function() {
  const r = await loadFatturePrimaRiba.apply(this, arguments);
  try {
    const rb = ge('fat-riba-box');
    const sb = ge('fat-solleciti-box');
    if (!puoRiba() || !(await verificaFattureRiba())) {
      if (rb) rb.style.display = 'none';
      if (sb) sb.style.display = 'none';
      return r;
    }
    const sotto = ge('fat-sottotitolo');
    if (sotto) sotto.textContent = 'Bozze dalle schede di lavoro, emissione, scadenze e pagamenti, RIBA, solleciti, PDF.';
    const attivo = document.activeElement && document.activeElement.id === 'fat-fil-search';
    if (!attivo) await Promise.all([caricaRibaFatture(), caricaSollecitiFatture()]);
  } catch (e) { console.warn('RIBA e solleciti:', e); }
  return r;
};

// Rate aperte con pagamento RIBA non ancora in distinta, entro "giorni".
async function rateRibaDaPresentare(giorni) {
  const oggi = oggiFattura();
  const r = await leggiTuttePagine(function() {
    let q = db.from('fatture_scadenze')
      .select('id,importo,importo_pagato,data_scadenza,fatture!inner(stato,tipo_documento,eliminato_il,modalita_pagamento)')
      .eq('stato', 'aperta').eq('fatture.stato', 'emessa').eq('fatture.tipo_documento', 'fattura')
      .is('fatture.eliminato_il', null).ilike('fatture.modalita_pagamento', '%riba%');
    if (giorni) q = q.lte('data_scadenza', aggiungiGiorniISO(oggi, giorni));
    return q.order('id');
  }, 3000);
  if (r.errore) return null;
  const rate = r.righe.filter(function(s) { return residuoRata(s) > 0; });
  return { n: rate.length, importo: arrotonda2(rate.reduce(function(t, s) { return t + residuoRata(s); }, 0)) };
}

async function caricaRibaFatture() {
  const box = ge('fat-riba-box');
  if (!box) return;
  const [rd, daPres] = await Promise.all([
    db.from('riba_presentazioni').select('*').is('eliminato_il', null).order('creato_il', { ascending: false }).limit(30),
    rateRibaDaPresentare(60)
  ]);
  if (rd.error) { box.innerHTML = '<div class="al2 e">Distinte RIBA non leggibili: ' + esc(rd.error.message || 'errore') + '</div>'; box.style.display = 'block'; return; }
  const distinte = rd.data || [];
  const ids = distinte.map(function(d) { return d.id; });
  const rr = ids.length ? await leggiABlocchi(ids, function(b) {
    return db.from('riba_righe').select('presentazione_id,esito,data_scadenza').in('presentazione_id', b);
  }) : { righe: [] };
  const perDistinta = {};
  (rr.righe || []).forEach(function(x) {
    const c = perDistinta[x.presentazione_id] = perDistinta[x.presentazione_id] || { n: 0, senza: 0 };
    c.n++; if (!x.esito) c.senza++;
  });
  const aperto = box.querySelector('details') ? box.querySelector('details').open
    : distinte.some(function(d) { return d.stato === 'preparata' || d.stato === 'inviata'; }) || !!(daPres && daPres.n);
  let html = '<details' + (aperto ? ' open' : '') + '><summary style="cursor:pointer;font-size:14px;font-weight:600">🏦 RIBA: distinte e rate da presentare</summary>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0">' +
      '<span style="font-size:13px">' + (daPres
        ? (daPres.n ? '<b>' + daPres.n + '</b> ' + (daPres.n === 1 ? 'rata' : 'rate') + ' con pagamento RIBA da presentare (entro 60 giorni): <b>' + esc(euroBuono(daPres.importo)) + '</b>' : 'Nessuna rata RIBA da presentare nei prossimi 60 giorni')
        : '') + '</span>' +
      '<button class="btn sm p" onclick="apriDistintaRiba(null)">+ Nuova distinta</button></div>';
  if (!distinte.length) {
    html += '<div class="empty" style="padding:10px">Nessuna distinta RIBA</div>';
  } else {
    html += distinte.map(function(d) {
      const c = perDistinta[d.id] || { n: 0, senza: 0 };
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-top:0.5px solid var(--bo)">' +
        '<div style="min-width:0;overflow-wrap:anywhere"><div style="font-size:13px;font-weight:600">Distinta n. ' + esc(d.numero) + ' · ' + esc(d.banca || '') + '</div>' +
          '<div style="font-size:12px;color:var(--m)">' + c.n + (c.n === 1 ? ' riga' : ' righe') + ' · ' + esc(euroBuono(d.importo_totale)) +
            (d.data_presentazione ? ' · presentata il ' + esc(fd(d.data_presentazione)) : ' · preparata il ' + esc(fd(dataLocaleISO(new Date(d.creato_il))))) +
            (d.stato === 'inviata' && c.senza ? ' · <b style="color:var(--a)">' + c.senza + (c.senza === 1 ? ' esito' : ' esiti') + ' da registrare</b>' : '') + '</div>' +
          '<div style="margin-top:2px">' + badgeDistinta(d.stato) + '</div></div>' +
        '<button class="btn sm" data-id="' + esc(d.id) + '" onclick="apriDettaglioDistinta(this.dataset.id)">Apri</button></div>';
    }).join('');
  }
  html += '</details>';
  box.innerHTML = html;
  box.style.display = 'block';
}

async function leggiRateDaSollecitare() {
  const oggi = oggiFattura();
  const r = await leggiTuttePagine(function() {
    return db.from('fatture_scadenze')
      .select('id,fattura_id,numero_rata,data_scadenza,importo,importo_pagato,stato,fatture!inner(id,numero,stato,tipo_documento,eliminato_il,snap_ragione_sociale,cliente_id,commessa_id)')
      .eq('fatture.stato', 'emessa').eq('fatture.tipo_documento', 'fattura').is('fatture.eliminato_il', null)
      .or('stato.in.(insoluta,sollecitata),and(stato.eq.aperta,data_scadenza.lt.' + oggi + ')')
      .order('data_scadenza', { ascending: true });
  }, 3000);
  if (r.errore) return { errore: r.errore };
  const rate = r.righe.filter(function(s) { return residuoRata(s) > 0; });
  const ids = rate.map(function(s) { return s.id; });
  const rs = ids.length ? await leggiABlocchi(ids, function(b) {
    return db.from('solleciti').select('*').in('scadenza_id', b).is('eliminato_il', null).order('livello', { ascending: true });
  }) : { righe: [] };
  const sol = {};
  (rs.righe || []).forEach(function(so) { (sol[so.scadenza_id] = sol[so.scadenza_id] || []).push(so); });
  rate.forEach(function(s) {
    s.solleciti = sol[s.id] || [];
    s.ultimo = s.solleciti.length ? s.solleciti[s.solleciti.length - 1] : null;
  });
  return { rate: rate };
}

function htmlRataDaSollecitare(s, oggi, conBottoni) {
  const f = s.fatture || {};
  const residuo = residuoRata(s);
  const scaduta = s.data_scadenza < oggi;
  const u = s.ultimo;
  return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-top:0.5px solid var(--bo)' + (s.stato === 'insoluta' ? ';border-left:3px solid var(--r);padding-left:8px' : '') + '">' +
    '<div style="min-width:0;overflow-wrap:anywhere"><div style="font-size:13px;font-weight:600">' + esc(f.snap_ragione_sociale || '—') + '</div>' +
      '<div style="font-size:12px;color:var(--m)">Fattura n. <span style="font-family:monospace">' + esc(f.numero || '') + '</span> · rata ' + esc(s.numero_rata) +
        ' · scadenza ' + esc(fd(s.data_scadenza)) + (scaduta ? ' (scaduta da ' + giorniTraISO(s.data_scadenza, oggi) + ' gg)' : '') + '</div>' +
      '<div style="font-size:12px">Da incassare <b>' + esc(euroBuono(residuo)) + '</b> ' + bsPag(s.stato) + '</div>' +
      (u ? '<div style="font-size:12px;color:var(--m)">' + esc(testoSollecito(u)) + '</div>' : '') + '</div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      (conBottoni && puoSolleciti() ? '<button class="btn sm p" data-id="' + esc(s.id) + '" onclick="apriSollecito(this.dataset.id)">📞 Sollecito</button>' : '') +
      (conBottoni && puoSolleciti() && u && u.esito === 'inviato' ? '<button class="btn sm" data-id="' + esc(u.id) + '" onclick="apriEsitoSollecito(this.dataset.id,\'esito\')">Esito</button>' : '') +
      (canAccessPage('fatture') ? '<button class="btn sm" data-id="' + esc(f.id) + '" onclick="apriFatturaDaOvunque(this.dataset.id)">Apri</button>' : '') +
    '</div></div>';
}

function filtraRateSolleciti(rate, filtro) {
  return rate.filter(function(s) {
    if (filtro === 'insolute') return s.stato === 'insoluta';
    if (filtro === 'scadute') return s.stato === 'aperta';
    if (filtro === 'attesa') return s.ultimo && s.ultimo.esito === 'inviato';
    return true;
  });
}

async function caricaSollecitiFatture() {
  const box = ge('fat-solleciti-box');
  if (!box) return;
  const filtro = ge('fat-sol-filtro') ? ge('fat-sol-filtro').value : 'tutti';
  const r = await leggiRateDaSollecitare();
  if (r.errore) { box.innerHTML = '<div class="al2 e">Insoluti non leggibili: ' + esc(r.errore.message || 'errore') + '</div>'; box.style.display = 'block'; return; }
  const oggi = oggiFattura();
  const lista = filtraRateSolleciti(r.rate, filtro);
  const nIns = r.rate.filter(function(s) { return s.stato === 'insoluta'; }).length;
  const aperto = box.querySelector('details') ? box.querySelector('details').open : nIns > 0;
  let html = '<details' + (aperto ? ' open' : '') + '><summary style="cursor:pointer;font-size:14px;font-weight:600">📞 Insoluti e solleciti' + (nIns ? ' <span class="bx berr">' + nIns + ' da sollecitare</span>' : '') + '</summary>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0">' +
      '<select id="fat-sol-filtro" onchange="caricaSollecitiFatture()" style="width:auto;max-width:100%">' +
        FILTRI_SOLLECITI.map(function(x) { return '<option value="' + x[0] + '"' + (x[0] === filtro ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') +
      '</select><span style="font-size:12px;color:var(--m)">' + lista.length + (lista.length === 1 ? ' rata' : ' rate') + '</span></div>' +
    (puoSolleciti() ? '' : '<div style="font-size:12px;color:var(--m);margin-bottom:6px">I solleciti li registra la segreteria (o il titolare).</div>');
  html += lista.length ? lista.map(function(s) { return htmlRataDaSollecitare(s, oggi, true); }).join('')
    : '<div class="empty" style="padding:10px">Niente da sollecitare in questo elenco</div>';
  html += '</details>';
  box.innerHTML = html;
  box.style.display = 'block';
}

async function apriFatturaDaOvunque(id) {
  await apriFattura(id);
}

// ── Finestra m-fattura: PDF, RIBA e solleciti della fattura emessa ───────
const decoraFinestraFatturaPrimaRiba = decoraFinestraFattura;
decoraFinestraFattura = async function() {
  const r = await decoraFinestraFatturaPrimaRiba.apply(this, arguments);
  try { await decoraRibaFattura(); } catch (e) { console.warn('RIBA nella fattura:', e); }
  return r;
};

async function decoraRibaFattura() {
  const b = fatBozza;
  const box = ge('mfat-emessa');
  if (!b || !box || !b.fattura || b.fattura.stato === 'bozza') return;
  if (!(await verificaFattureRiba()) || fatBozza !== b) return;
  const f = b.fattura;
  if (ge('mfat-pdf-box')) ge('mfat-pdf-box').remove();
  if (ge('mfat-riba-solleciti')) ge('mfat-riba-solleciti').remove();
  const pdf = document.createElement('div');
  pdf.id = 'mfat-pdf-box';
  pdf.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px';
  pdf.innerHTML = '<button class="btn sm" onclick="scaricaPdfFattura()">📄 Scarica PDF</button>' +
    (puoRiba() ? '<button class="btn sm" id="mfat-pdf-salva" onclick="salvaCopiaPdfFattura()">💾 Salva copia</button>' : '') +
    (f.pdf_url ? '<button class="btn sm" onclick="apriCopiaPdfFattura()">📂 Copia salvata</button>' : '') +
    '<span style="font-size:11px;color:var(--m)">Copia di cortesia, non la fattura elettronica</span>';
  box.insertBefore(pdf, box.firstChild);

  if (f.tipo_documento !== 'fattura') return;
  const [rs, rr, rl] = await Promise.all([
    db.from('fatture_scadenze').select('id,numero_rata,data_scadenza,importo,importo_pagato,stato').eq('fattura_id', f.id).order('numero_rata', { ascending: true }),
    puoRiba() ? db.from('riba_righe').select('id,scadenza_id,esito,data_esito,importo,pagamento_id,presentazione_id,riba_presentazioni(numero,stato,data_presentazione)').eq('fattura_id', f.id).order('creato_il', { ascending: true }) : Promise.resolve({ data: [] }),
    db.from('solleciti').select('*').eq('fattura_id', f.id).is('eliminato_il', null).order('livello', { ascending: true })
  ]);
  if (fatBozza !== b || rs.error) return;
  const scad = rs.data || [];
  const righe = rr.data || [];
  const sol = rl.data || [];
  const oggi = oggiFattura();
  // Il pagamento nato da un esito RIBA si annulla dalla distinta (sql/47).
  righe.forEach(function(x) {
    if (!x.pagamento_id) return;
    box.querySelectorAll('button[onclick^="apriAnnullaPagamento"]').forEach(function(btn) {
      if (btn.dataset.id === x.pagamento_id) btn.outerHTML = '<span style="font-size:11px;color:var(--m)">esito RIBA: si annulla dalla distinta</span>';
    });
  });
  const html = scad.map(function(s) {
    const rigeRata = righe.filter(function(x) { return x.scadenza_id === s.id; });
    const solRata = sol.filter(function(x) { return x.scadenza_id === s.id; });
    const puoSol = puoSolleciti() && f.stato === 'emessa' && residuoRata(s) > 0 &&
      (s.stato === 'insoluta' || s.stato === 'sollecitata' || (s.stato === 'aperta' && s.data_scadenza < oggi));
    if (!rigeRata.length && !solRata.length && !puoSol) return '';
    const ultimo = solRata.length ? solRata[solRata.length - 1] : null;
    return '<div style="border:0.5px solid var(--bo);border-radius:var(--rs);padding:8px;margin-bottom:6px;font-size:12px;overflow-wrap:anywhere">' +
      '<div style="font-weight:600;margin-bottom:2px">Rata ' + esc(s.numero_rata) + ' ' + bsPag(s.stato) + '</div>' +
      rigeRata.map(function(x) {
        const p = x.riba_presentazioni || {};
        return '<div>🏦 RIBA, distinta n. ' + esc(p.numero || '') + ' (' + esc((STATI_DISTINTA_RIBA[p.stato] || [0, p.stato])[1]) + ')' +
          (x.esito ? ' · <b>' + (x.esito === 'accreditato' ? 'accreditata' : 'insoluta') + '</b> il ' + esc(fd(x.data_esito)) : ' · in attesa dell\'esito') +
          ' <button class="btn sm" style="padding:2px 8px" data-id="' + esc(x.presentazione_id) + '" onclick="apriDettaglioDistinta(this.dataset.id)">Distinta</button></div>';
      }).join('') +
      solRata.map(function(so) {
        return '<div>📞 ' + esc(testoSollecito(so)) + (so.destinatario ? ' · a ' + esc(so.destinatario) : '') +
          (so.testo ? '<div style="color:var(--m)">' + esc(so.testo) + '</div>' : '') +
          (puoSolleciti() && f.stato === 'emessa' && so === ultimo
            ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:3px">' +
              (so.esito === 'inviato' ? '<button class="btn sm" style="padding:2px 8px" data-id="' + esc(so.id) + '" onclick="apriEsitoSollecito(this.dataset.id,\'esito\')">Esito</button>' : '') +
              '<button class="btn sm" style="padding:2px 8px;color:var(--r)" data-id="' + esc(so.id) + '" onclick="apriEsitoSollecito(this.dataset.id,\'elimina\')">Togli</button></div>' : '') +
          '</div>';
      }).join('') +
      (puoSol ? '<button class="btn sm p" style="margin-top:4px" data-id="' + esc(s.id) + '" onclick="apriSollecito(this.dataset.id)">📞 Registra sollecito</button>' : '') +
    '</div>';
  }).join('');
  if (!html) return;
  const div = document.createElement('div');
  if (ge('mfat-riba-solleciti')) ge('mfat-riba-solleciti').remove();
  div.id = 'mfat-riba-solleciti';
  div.innerHTML = '<div style="font-size:12px;font-weight:600;color:var(--m);text-transform:uppercase;margin:10px 0 6px">RIBA e solleciti</div>' + html;
  box.appendChild(div);
}

// ── Distinta RIBA: nuova o da cambiare ───────────────────────────────────
async function apriDistintaRiba(id) {
  if (!puoRiba()) { toast('Le distinte RIBA le preparano segreteria, contabile o titolare', 'err'); return; }
  if (!(await verificaFattureRiba())) { toast('Le RIBA non sono ancora attive (sql/47)', 'err'); return; }
  let distinta = null;
  let nella = [];
  if (id) {
    const [rp, rr] = await Promise.all([
      db.from('riba_presentazioni').select('*').eq('id', id).maybeSingle(),
      db.from('riba_righe').select('scadenza_id').eq('presentazione_id', id)
    ]);
    if (rp.error || !rp.data) { toast('Distinta non trovata', 'err'); return; }
    if (rp.data.stato !== 'preparata' || rp.data.eliminato_il) { toast('La distinta non si cambia più', 'err'); return; }
    distinta = rp.data;
    nella = (rr.data || []).map(function(x) { return x.scadenza_id; });
  }
  const filtroRate = function() {
    let q = db.from('fatture_scadenze')
      .select('id,fattura_id,numero_rata,data_scadenza,importo,importo_pagato,stato,fatture!inner(id,numero,data_emissione,stato,tipo_documento,eliminato_il,snap_ragione_sociale,modalita_pagamento,iban,cliente_id,clienti(ragione_sociale,modalita_pagamento,iban,abi_appoggio,cab_appoggio,banca_appoggio))')
      .eq('fatture.stato', 'emessa').eq('fatture.tipo_documento', 'fattura').is('fatture.eliminato_il', null);
    q = nella.length ? q.or('stato.in.(aperta,insoluta,sollecitata),id.in.(' + nella.join(',') + ')') : q.in('stato', ['aperta', 'insoluta', 'sollecitata']);
    return q.order('data_scadenza', { ascending: true });
  };
  const [r, banca] = await Promise.all([leggiTuttePagine(filtroRate, 3000), id ? Promise.resolve({}) : leggiImpostazioniBanca()]);
  if (r.errore) { toast('Rate non leggibili: ' + (r.errore.message || 'errore'), 'err'); return; }
  const rate = r.righe.filter(function(s) { return nella.includes(s.id) || residuoRata(s) > 0; });
  distintaAperta = {
    id: id || null, numero: distinta ? distinta.numero : null, rate: rate,
    scelte: new Set(nella), inCorso: false
  };
  ge('mrd-titolo').textContent = distinta ? '🏦 Distinta RIBA n. ' + distinta.numero : '🏦 Nuova distinta RIBA';
  ge('mrd-banca').value = distinta ? (distinta.banca || '') : (banca.banca_azienda || '');
  ge('mrd-iban').value = distinta ? (distinta.iban_appoggio || '') : (banca.iban_azienda || '');
  ge('mrd-note').value = distinta ? (distinta.note || '') : '';
  ge('mrd-solo-riba').checked = true;
  ge('mrd-entro').value = '60';
  ge('mrd-errore').style.display = 'none';
  disegnaRateDistintaRiba();
  openM('m-riba-distinta');
}

function disegnaRateDistintaRiba() {
  const d = distintaAperta;
  const el = ge('mrd-rate');
  if (!d || !el) return;
  const oggi = oggiFattura();
  const soloRiba = ge('mrd-solo-riba').checked;
  const entro = v('mrd-entro');
  const limite = entro === 'tutte' ? null : aggiungiGiorniISO(oggi, parseInt(entro, 10) || 60);
  const lista = d.rate.filter(function(s) {
    if (d.scelte.has(s.id)) return true;
    const f = s.fatture || {};
    if (soloRiba && !modalitaRiba(f.modalita_pagamento) && !modalitaRiba(f.clienti && f.clienti.modalita_pagamento)) return false;
    if (limite && s.data_scadenza > limite) return false;
    return true;
  });
  if (!lista.length) {
    el.innerHTML = '<div class="empty" style="padding:12px">Nessuna rata da presentare con questi filtri' + (soloRiba ? ' (togli "Solo fatture con pagamento RIBA" per vederle tutte)' : '') + '</div>';
  } else {
    el.innerHTML = lista.map(function(s) {
      const f = s.fatture || {};
      const c = f.clienti || {};
      const ac = abiCabCliente(c, f.iban);
      const residuo = residuoRata(s);
      const scelta = d.scelte.has(s.id);
      const scaduta = s.data_scadenza < oggi;
      return '<label style="display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-top:0.5px solid var(--bo);font-weight:400;cursor:' + (ac ? 'pointer' : 'default') + ';margin:0">' +
        '<input type="checkbox" data-id="' + esc(s.id) + '"' + (scelta ? ' checked' : '') + (ac ? '' : ' disabled') + ' onchange="sceltaRataDistinta(this.dataset.id,this.checked)" style="margin-top:3px;flex-shrink:0">' +
        '<span style="min-width:0;overflow-wrap:anywhere;font-size:13px"><b>' + esc(f.snap_ragione_sociale || c.ragione_sociale || '—') + '</b>' +
          '<br><span style="font-size:12px;color:var(--m)">Fattura n. ' + esc(f.numero || '') + ' · rata ' + esc(s.numero_rata) + ' · scade il ' + esc(fd(s.data_scadenza)) + '</span>' +
          '<br><span style="font-size:12px"><b>' + esc(euroBuono(residuo)) + '</b>' +
            (s.stato !== 'aperta' && s.stato !== 'in_riba' ? ' ' + bsPag(s.stato) : '') +
            (scaduta ? ' <span class="bx bwarn">Scaduta: la banca potrebbe non accettarla</span>' : '') +
            (ac ? ' · ABI ' + esc(ac.abi) + ' CAB ' + esc(ac.cab) : ' <span style="color:var(--r)">Mancano ABI e CAB del cliente</span>' +
              (canAccessPage('cliente-detail') && f.cliente_id ? ' <button class="btn sm" style="padding:2px 8px" data-id="' + esc(f.cliente_id) + '" onclick="event.preventDefault();closeM(\'m-riba-distinta\');editCliById(this.dataset.id)">Completa</button>' : '')) +
          '</span></span></label>';
    }).join('');
  }
  aggiornaDistintaRiba();
}

function sceltaRataDistinta(id, scelta) {
  const d = distintaAperta;
  if (!d) return;
  if (scelta) d.scelte.add(id); else d.scelte.delete(id);
  aggiornaDistintaRiba();
}

function erroreDistintaRiba() {
  const d = distintaAperta;
  if (!d) return 'Nessuna distinta';
  if (!(v('mrd-banca') || '').trim()) return 'Indica la banca';
  const iban = ibanPulito(v('mrd-iban'));
  if (iban && !ibanValido(iban)) return 'IBAN di accredito non valido';
  if (!d.scelte.size) return 'Scegli almeno una rata';
  return '';
}

function aggiornaDistintaRiba() {
  const d = distintaAperta;
  if (!d) return;
  const scelte = d.rate.filter(function(s) { return d.scelte.has(s.id); });
  const tot = arrotonda2(scelte.reduce(function(t, s) { return t + residuoRata(s); }, 0));
  ge('mrd-totale').innerHTML = 'In distinta: <b>' + scelte.length + '</b> ' + (scelte.length === 1 ? 'rata' : 'rate') + ' · totale <b>' + esc(euroBuono(tot)) + '</b>';
  const errore = erroreDistintaRiba();
  ge('mrd-salva').disabled = !!errore || d.inCorso;
}

async function salvaDistintaRiba() {
  const d = distintaAperta;
  if (!d || d.inCorso) return;
  const errore = erroreDistintaRiba();
  if (errore) { toast(errore, 'err'); return; }
  d.inCorso = true;
  ge('mrd-salva').disabled = true;
  const { data, error } = await db.rpc('salva_presentazione_riba', {
    p_presentazione_id: d.id, p_banca: v('mrd-banca').trim(), p_iban_appoggio: ibanPulito(v('mrd-iban')) || null,
    p_note: (v('mrd-note') || '').trim() || null, p_scadenze: Array.from(d.scelte)
  });
  d.inCorso = false;
  if (error) {
    const er = ge('mrd-errore');
    er.textContent = 'Distinta non salvata: ' + (error.message || 'errore');
    er.style.display = 'block';
    aggiornaDistintaRiba();
    return;
  }
  closeM('m-riba-distinta');
  distintaAperta = null;
  toast('Distinta RIBA n. ' + data.numero + ' salvata ✓ ' + data.righe + (data.righe === 1 ? ' rata' : ' rate') + ', ' + euroBuono(data.importo_totale), 'ok');
  await apriDettaglioDistinta(data.id);
  await aggiornaDopoRiba(null);
}

// ── Distinta RIBA: dettaglio, invio, esiti ───────────────────────────────
async function apriDettaglioDistinta(id) {
  if (!(await verificaFattureRiba())) return;
  const [rp, rr] = await Promise.all([
    db.from('riba_presentazioni').select('*').eq('id', id).maybeSingle(),
    db.from('riba_righe').select('*').eq('presentazione_id', id).order('debitore', { ascending: true }).order('data_scadenza', { ascending: true })
  ]);
  if (rp.error || !rp.data) { toast('Distinta non trovata' + (rp.error ? ': ' + rp.error.message : ''), 'err'); return; }
  const p = rp.data;
  const righe = rr.data || [];
  dettaglioDistinta = { id: p.id, p: p, righe: righe };
  ge('mrv-titolo').textContent = '🏦 Distinta RIBA n. ' + p.numero;
  ge('mrv-errore').style.display = 'none';
  const nAcc = righe.filter(function(x) { return x.esito === 'accreditato'; });
  const nIns = righe.filter(function(x) { return x.esito === 'insoluto'; });
  ge('mrv-dati').innerHTML = '<div>' + badgeDistinta(p.stato) + (p.eliminato_il ? ' <span class="bx berr">Eliminata</span>' : '') + '</div>' +
    '<div style="margin-top:4px">Banca: <b>' + esc(p.banca || '—') + '</b>' + (p.iban_appoggio ? ' · IBAN ' + esc(p.iban_appoggio) : '') + '</div>' +
    '<div>' + righe.length + (righe.length === 1 ? ' riga' : ' righe') + ' · totale <b>' + esc(euroBuono(p.importo_totale)) + '</b>' +
      (nAcc.length || nIns.length ? ' · accreditate ' + nAcc.length + ' (' + esc(euroBuono(nAcc.reduce(function(t, x) { return t + Number(x.importo); }, 0))) + '), insolute ' + nIns.length : '') + '</div>' +
    '<div style="color:var(--m);font-size:12px">Preparata' + (p.creato_da_nome ? ' da ' + esc(p.creato_da_nome) : '') + ' il ' + esc(fd(dataLocaleISO(new Date(p.creato_il)))) +
      (p.data_presentazione ? ' · presentata in banca il ' + esc(fd(p.data_presentazione)) + (p.inviata_da_nome ? ' (' + esc(p.inviata_da_nome) + ')' : '') : '') + '</div>' +
    (p.note ? '<div style="font-size:12px;margin-top:2px">' + esc(p.note) + '</div>' : '') +
    (p.eliminato_il ? '<div style="color:var(--r);font-size:12px">Eliminata' + (p.eliminato_da_nome ? ' da ' + esc(p.eliminato_da_nome) : '') + (p.motivo_eliminazione ? ': ' + esc(p.motivo_eliminazione) : '') + '</div>' : '') +
    (p.stato === 'preparata' && !p.eliminato_il ? '<div class="al2 i" style="margin:8px 0 0;font-size:12px">Scarica il file CBI e caricalo nell\'home banking (oppure porta in banca il PDF o il CSV), poi "Segna inviata". Da lì si registrano gli esiti. Il file CBI è da verificare con la banca al primo invio.</div>' : '');
  const oggi = oggiFattura();
  const puoEsito = puoRiba() && p.stato !== 'preparata' && !p.eliminato_il;
  ge('mrv-righe').innerHTML = !righe.length ? '<div class="empty" style="padding:10px">Nessuna riga</div>' : righe.map(function(x) {
    const storico = Array.isArray(x.storico_esiti) ? x.storico_esiti : [];
    return '<div style="border:0.5px solid var(--bo);border-radius:var(--rs);padding:8px;margin-bottom:6px;font-size:12px;overflow-wrap:anywhere' +
      (x.esito === 'insoluto' ? ';border-left:3px solid var(--r)' : (x.esito === 'accreditato' ? ';border-left:3px solid var(--gm)' : '')) + '">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b style="font-size:13px">' + esc(x.debitore) + '</b><b>' + esc(euroBuono(x.importo)) + '</b></div>' +
      '<div style="color:var(--m)">' + [x.debitore_piva ? 'P.IVA ' + esc(x.debitore_piva) : '', x.debitore_codice_fiscale && x.debitore_codice_fiscale !== x.debitore_piva ? 'C.F. ' + esc(x.debitore_codice_fiscale) : '',
        'ABI ' + esc(x.abi) + ' CAB ' + esc(x.cab), x.banca_debitore ? esc(x.banca_debitore) : ''].filter(Boolean).join(' · ') + '</div>' +
      '<div>Fattura n. ' + esc(x.fattura_numero || '') + (x.fattura_data ? ' del ' + esc(fd(x.fattura_data)) : '') + ' · rata ' + esc(x.numero_rata) + ' · scadenza ' + esc(fd(x.data_scadenza)) + '</div>' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px">' +
        '<span>' + (x.esito === 'accreditato' ? '<span class="bx bok">Accreditata</span> il ' + esc(fd(x.data_esito))
          : (x.esito === 'insoluto' ? '<span class="bx berr">Insoluta</span> il ' + esc(fd(x.data_esito))
          : (p.stato === 'preparata' ? '<span class="bx bgray">Da presentare</span>' : '<span class="bx bblue">In attesa dell\'esito</span>' + (x.data_scadenza < oggi ? ' <span style="color:var(--a)">scaduta</span>' : '')))) +
          (x.esito_da_nome ? ' <span style="color:var(--m)">(' + esc(x.esito_da_nome) + ')</span>' : '') + '</span>' +
        '<span style="display:flex;gap:6px;flex-wrap:wrap">' +
          (puoEsito && !x.esito ? '<button class="btn sm p" data-id="' + esc(x.id) + '" onclick="apriEsitoRiba(this.dataset.id)">Esito</button>' : '') +
          (puoEsito && x.esito && puoAnnullareEsitoRiba() ? '<button class="btn sm" data-id="' + esc(x.id) + '" onclick="apriAnnullaEsitoRiba(this.dataset.id)">↩ Annulla esito</button>' : '') +
          (canAccessPage('fatture') ? '<button class="btn sm" data-id="' + esc(x.fattura_id) + '" onclick="apriFattura(this.dataset.id)">Fattura</button>' : '') +
        '</span></div>' +
      (x.note ? '<div style="color:var(--m);margin-top:2px">' + esc(x.note) + '</div>' : '') +
      (storico.length ? '<div style="color:var(--m);margin-top:2px">' + storico.map(function(h) {
        return '↩ Esito "' + esc(h.esito) + '" del ' + esc(fd(h.data_esito)) + ' annullato' + (h.annullato_da ? ' da ' + esc(h.annullato_da) : '') + ': ' + esc(h.motivo || '');
      }).join('<br>') + '</div>' : '') +
    '</div>';
  }).join('');
  const az = [];
  if (p.stato === 'preparata' && !p.eliminato_il && puoRiba()) {
    az.push('<button class="btn" style="color:var(--r)" onclick="eliminaDistintaRiba()">🗑️ Elimina</button>');
    az.push('<button class="btn" data-id="' + esc(p.id) + '" onclick="closeM(\'m-riba-dettaglio\');apriDistintaRiba(this.dataset.id)">✏️ Cambia rate</button>');
  }
  if (righe.length) {
    az.push('<button class="btn" onclick="scaricaCsvDistintaRiba()">⬇️ CSV</button>');
    az.push('<button class="btn" onclick="scaricaPdfDistintaRiba()">📄 PDF distinta</button>');
    if (puoRiba() && typeof scaricaCbiDistintaRiba === 'function') az.push('<button class="btn" onclick="scaricaCbiDistintaRiba()" title="Tracciato CBI Ri.Ba. per l\'home banking: da verificare con la banca al primo invio">🏦 Scarica file CBI</button>');
  }
  if (p.stato === 'preparata' && !p.eliminato_il && puoRiba() && righe.length) {
    az.push('<button class="btn p" onclick="apriInvioRiba()">📤 Segna inviata</button>');
  }
  az.push('<button class="btn" onclick="closeM(\'m-riba-dettaglio\')">Chiudi</button>');
  ge('mrv-azioni').innerHTML = az.join('');
  openM('m-riba-dettaglio');
}

async function eliminaDistintaRiba() {
  const d = dettaglioDistinta;
  if (!d || d.p.stato !== 'preparata') return;
  if (!confirm('Eliminare la distinta n. ' + d.p.numero + '? Le rate tornano da presentare (resta il numero, come eliminata).')) return;
  const { error } = await db.rpc('elimina_presentazione_riba', { p_presentazione_id: d.id, p_motivo: null });
  if (error) { toast('Distinta non eliminata: ' + (error.message || 'errore'), 'err'); return; }
  closeM('m-riba-dettaglio');
  dettaglioDistinta = null;
  toast('Distinta n. ' + d.p.numero + ' eliminata: le rate tornano da presentare', 'ok');
  await aggiornaDopoRiba(null);
}

function apriInvioRiba() {
  const d = dettaglioDistinta;
  if (!d || d.p.stato !== 'preparata') return;
  invioDistinta = d;
  const oggi = oggiFattura();
  ge('mrn-riepilogo').innerHTML = 'Distinta <b>n. ' + esc(d.p.numero) + '</b> · ' + esc(d.p.banca || '') + ' · ' + d.righe.length + (d.righe.length === 1 ? ' riga' : ' righe') + ' · <b>' + esc(euroBuono(d.p.importo_totale)) + '</b>';
  ge('mrn-data').value = oggi;
  ge('mrn-data').max = oggi;
  ge('mrn-data').min = dataLocaleISO(new Date(d.p.creato_il));
  ge('mrn-conferma').checked = false;
  ge('mrn-errore').style.display = 'none';
  aggiornaInvioRiba();
  openM('m-riba-invio');
}

function aggiornaInvioRiba() {
  const data = v('mrn-data');
  let errore = '';
  if (!data) errore = 'Indica la data';
  else if (data > oggiFattura()) errore = 'La data non può essere nel futuro';
  const er = ge('mrn-errore');
  if (errore) { er.textContent = errore; er.style.display = 'block'; } else er.style.display = 'none';
  ge('mrn-salva').disabled = !!errore || !ge('mrn-conferma').checked;
}

async function salvaInvioRiba() {
  const d = invioDistinta;
  if (!d) return;
  ge('mrn-salva').disabled = true;
  const { error } = await db.rpc('segna_presentazione_riba_inviata', { p_presentazione_id: d.id, p_data: v('mrn-data') });
  if (error) {
    const er = ge('mrn-errore');
    er.textContent = 'Non registrato: ' + (error.message || 'errore');
    er.style.display = 'block';
    ge('mrn-salva').disabled = false;
    return;
  }
  closeM('m-riba-invio');
  invioDistinta = null;
  toast('Distinta n. ' + d.p.numero + ' inviata in banca ✓ Ora si registrano gli esiti', 'ok');
  await aggiornaDopoRiba(null);
}

function apriEsitoRiba(rigaId) {
  const d = dettaglioDistinta;
  const x = d && d.righe.find(function(r) { return r.id === rigaId; });
  if (!x || x.esito) return;
  rigaEsitoAperta = { riga: x, distinta: d.p };
  const oggi = oggiFattura();
  ge('mre-riepilogo').innerHTML = '<b>' + esc(x.debitore) + '</b> · fattura n. ' + esc(x.fattura_numero || '') + ', rata ' + esc(x.numero_rata) +
    '<br>Scadenza ' + esc(fd(x.data_scadenza)) + ' · <b>' + esc(euroBuono(x.importo)) + '</b> · distinta n. ' + esc(d.p.numero);
  ge('mre-esito-acc').checked = false;
  ge('mre-esito-ins').checked = false;
  ge('mre-data').value = oggi;
  ge('mre-data').max = oggi;
  ge('mre-data').min = d.p.data_presentazione || '';
  ge('mre-note').value = '';
  ge('mre-conferma').checked = false;
  ge('mre-errore').style.display = 'none';
  aggiornaEsitoRiba();
  openM('m-riba-esito');
}

function esitoRibaScelto() {
  return ge('mre-esito-acc').checked ? 'accreditato' : (ge('mre-esito-ins').checked ? 'insoluto' : '');
}

function aggiornaEsitoRiba() {
  const a = rigaEsitoAperta;
  if (!a) return;
  const esito = esitoRibaScelto();
  const data = v('mre-data');
  ge('mre-data-label').textContent = esito === 'insoluto' ? 'Data della comunicazione dell\'insoluto *' : 'Data dell\'accredito *';
  ge('mre-avviso').innerHTML = esito === 'accreditato'
    ? '<div class="al2 ok" style="margin:0">Diventa un <b>pagamento registrato</b> (modalità RIBA) di ' + esc(euroBuono(a.riga.importo)) + ': la rata risulta pagata.</div>'
    : (esito === 'insoluto' ? '<div class="al2 w" style="margin:0">La rata e la fattura diventano <b>insolute</b>: compaiono alla segreteria (solleciti da fare) e al rappresentante del cliente.</div>' : '');
  let errore = '';
  if (!esito) errore = 'Scegli l\'esito';
  else if (!data) errore = 'Indica la data';
  else if (data > oggiFattura()) errore = 'La data non può essere nel futuro';
  else if (a.distinta.data_presentazione && data < a.distinta.data_presentazione) errore = 'La data non può essere prima della presentazione (' + fd(a.distinta.data_presentazione) + ')';
  const er = ge('mre-errore');
  if (errore && esito) { er.textContent = errore; er.style.display = 'block'; } else er.style.display = 'none';
  ge('mre-salva').disabled = !!errore || !ge('mre-conferma').checked || !!a.inCorso;
}

async function salvaEsitoRiba() {
  const a = rigaEsitoAperta;
  if (!a || a.inCorso) return;
  a.inCorso = true;
  ge('mre-salva').disabled = true;
  const { data, error } = await db.rpc('registra_esito_riba', {
    p_riga_id: a.riga.id, p_esito: esitoRibaScelto(), p_data: v('mre-data'), p_note: (v('mre-note') || '').trim() || null
  });
  a.inCorso = false;
  if (error) {
    const er = ge('mre-errore');
    er.textContent = 'Esito non registrato: ' + (error.message || 'errore');
    er.style.display = 'block';
    aggiornaEsitoRiba();
    return;
  }
  closeM('m-riba-esito');
  rigaEsitoAperta = null;
  const d = data || {};
  if (d.esito === 'accreditato') {
    toast(d.preventivo_sbloccato ? 'RIBA accreditata: anticipo pagato, preventivo accettato' + (d.commessa_codice ? ' · nata la commessa ' + d.commessa_codice : '')
      : 'RIBA accreditata ✓ Pagamento registrato sulla fattura n. ' + d.numero, 'ok');
  } else {
    toast('RIBA insoluta: fattura n. ' + d.numero + ' insoluta, da sollecitare', 'warn');
  }
  await aggiornaDopoRiba(d.fattura_id);
}

function apriAnnullaEsitoRiba(rigaId) {
  const d = dettaglioDistinta;
  const x = d && d.righe.find(function(r) { return r.id === rigaId; });
  if (!x || !x.esito || !puoAnnullareEsitoRiba()) return;
  rigaAnnullaEsito = x;
  ge('mae-riepilogo').innerHTML = 'Esito <b>' + (x.esito === 'accreditato' ? 'accreditata' : 'insoluta') + '</b> del ' + esc(fd(x.data_esito)) + ' · ' + esc(x.debitore) + ', fattura n. ' + esc(x.fattura_numero || '') + ' rata ' + esc(x.numero_rata) +
    (x.esito === 'accreditato' ? '<br>Il pagamento registrato si annulla (resta nello storico della fattura).' : '');
  ge('mae-motivo').value = '';
  ge('mae-salva').disabled = true;
  openM('m-annulla-esito-riba');
}

async function salvaAnnullaEsitoRiba() {
  const x = rigaAnnullaEsito;
  const motivo = (v('mae-motivo') || '').trim();
  if (!x || !motivo) return;
  ge('mae-salva').disabled = true;
  const { error } = await db.rpc('annulla_esito_riba', { p_riga_id: x.id, p_motivo: motivo });
  if (error) { ge('mae-salva').disabled = false; toast('Esito non annullato: ' + (error.message || 'errore'), 'err'); return; }
  closeM('m-annulla-esito-riba');
  rigaAnnullaEsito = null;
  toast('Esito annullato: la rata torna in attesa dell\'esito della banca', 'ok');
  await aggiornaDopoRiba(x.fattura_id);
}

// ── Distinta RIBA: PDF e CSV per la banca ────────────────────────────────
function righeDistintaPerFile() {
  const d = dettaglioDistinta;
  if (!d) return null;
  return d.righe.slice().sort(function(a, b) { return (a.debitore || '').localeCompare(b.debitore || '') || String(a.data_scadenza).localeCompare(String(b.data_scadenza)); });
}

function scaricaCsvDistintaRiba() {
  const d = dettaglioDistinta;
  const righe = righeDistintaPerFile();
  if (!d || !righe) return;
  const cella = function(x) {
    const t = String(x === null || x === undefined ? '' : x);
    return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const intest = ['Distinta', 'Banca', 'Debitore', 'P.IVA', 'Codice fiscale', 'Indirizzo', 'CAP', 'Città', 'ABI', 'CAB', 'Banca del debitore',
    'Fattura', 'Data fattura', 'Rata', 'Scadenza', 'Importo', 'Esito', 'Data esito'];
  const linee = [intest.map(cella).join(';')].concat(righe.map(function(x) {
    return [d.p.numero, d.p.banca, x.debitore, x.debitore_piva, x.debitore_codice_fiscale, x.debitore_indirizzo, x.debitore_cap, x.debitore_citta,
      x.abi, x.cab, x.banca_debitore, x.fattura_numero, fd(x.fattura_data), x.numero_rata, fd(x.data_scadenza),
      Number(x.importo).toFixed(2).replace('.', ','), x.esito || '', x.data_esito ? fd(x.data_esito) : ''].map(cella).join(';');
  }));
  const blob = new Blob(['﻿' + linee.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Distinta_RIBA_' + String(d.p.numero).replace(/[^0-9A-Za-z]+/g, '-') + '.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function intestazionePdfToliFire(doc, sottotitolo) {
  const margine = 16;
  const larghezza = 210;
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
  doc.text(sottotitolo, larghezza - margine, 16, { align: 'right' });
  doc.setTextColor(25, 25, 25);
}

function numeraPaginePdf(doc, testo) {
  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(testo + ' — pagina ' + p + ' di ' + pagine, 194, 290, { align: 'right' });
  }
}

async function scaricaPdfDistintaRiba() {
  const d = dettaglioDistinta;
  const righe = righeDistintaPerFile();
  if (!d || !righe) return;
  if (!(await preparaPDF())) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  intestazionePdfToliFire(doc, 'Distinta RIBA');
  let y = 46;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('DISTINTA RIBA N. ' + d.p.numero, 16, y);
  doc.setFontSize(10);
  doc.text('Data: ' + fd(d.p.data_presentazione || dataLocaleISO(new Date(d.p.creato_il))), 194, y, { align: 'right' });
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.text('Banca presentatrice: ' + (d.p.banca || '—') + (d.p.iban_appoggio ? ' — IBAN di accredito ' + d.p.iban_appoggio : ''), 16, y, { maxWidth: 178 });
  y += 6;
  doc.text('Ricevute bancarie: ' + righe.length + ' — Totale: ' + euroPreventivo(d.p.importo_totale), 16, y);
  doc.autoTable({
    startY: y + 4,
    margin: { top: 18, right: 16, bottom: 22, left: 16 },
    head: [['Debitore', 'ABI / CAB', 'Fattura', 'Scadenza', 'Importo']],
    body: righe.map(function(x) {
      return [
        [x.debitore, x.debitore_piva ? 'P.IVA ' + x.debitore_piva : (x.debitore_codice_fiscale ? 'C.F. ' + x.debitore_codice_fiscale : ''),
          [x.debitore_indirizzo, [x.debitore_cap, x.debitore_citta].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join('\n'),
        x.abi + ' / ' + x.cab + (x.banca_debitore ? '\n' + x.banca_debitore : ''),
        'n. ' + (x.fattura_numero || '') + (x.fattura_data ? '\ndel ' + fd(x.fattura_data) : '') + '\nrata ' + x.numero_rata,
        fd(x.data_scadenza),
        euroPreventivo(x.importo)
      ];
    }),
    foot: [['', '', '', 'Totale', euroPreventivo(d.p.importo_totale)]],
    theme: 'grid',
    headStyles: { fillColor: [8, 80, 65], textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: [240, 240, 240], textColor: [25, 25, 25], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 34 }, 2: { cellWidth: 30 }, 3: { cellWidth: 20 }, 4: { halign: 'right', cellWidth: 24 } }
  });
  let yf = doc.lastAutoTable.finalY + 8;
  if (yf > 270) { doc.addPage(); yf = 20; }
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(doc.splitTextToSize('Distinta preparata con il gestionale TOLI FIRE. Non è il file elettronico per la banca: quello è il file CBI ("Scarica file CBI" nella distinta, da verificare con la banca al primo invio), oppure le ricevute si caricano dall\'home banking o allo sportello con questi dati.', 178), 16, yf);
  numeraPaginePdf(doc, 'Distinta RIBA ' + d.p.numero);
  doc.save('Distinta_RIBA_' + String(d.p.numero).replace(/[^0-9A-Za-z]+/g, '-') + '.pdf');
}

// ── Solleciti ────────────────────────────────────────────────────────────
async function apriSollecito(scadenzaId) {
  if (!puoSolleciti()) { toast('I solleciti li registra la segreteria (o il titolare)', 'err'); return; }
  if (!(await verificaFattureRiba())) { toast('I solleciti non sono ancora attivi (sql/47)', 'err'); return; }
  const { data: s, error } = await db.from('fatture_scadenze')
    .select('*,fatture(id,numero,data_emissione,stato,tipo_documento,snap_ragione_sociale,cliente_id,clienti(referente_nome,referente_telefono,referente_email,pec))')
    .eq('id', scadenzaId).maybeSingle();
  if (error || !s || !s.fatture) { toast('Rata non trovata: ricarica la pagina', 'err'); return; }
  const f = s.fatture;
  const oggi = oggiFattura();
  if (f.stato !== 'emessa') { toast('La fattura è ' + f.stato + ': niente solleciti', 'err'); return; }
  if (s.stato === 'pagata') { toast('La rata è pagata', 'err'); return; }
  if (s.stato === 'in_riba') { toast('La rata è in una distinta RIBA: prima l\'esito della banca', 'err'); return; }
  if (s.stato === 'aperta' && s.data_scadenza >= oggi) { toast('La rata non è ancora scaduta', 'err'); return; }
  const { data: prec } = await db.from('solleciti').select('livello,data_invio,mezzo,esito').eq('scadenza_id', s.id).is('eliminato_il', null).order('livello', { ascending: false }).limit(1);
  const ultimo = (prec || [])[0] || null;
  sollecitoAperto = { scadenza: s, fattura: f };
  const c = f.clienti || {};
  ge('msl-riepilogo').innerHTML = '<b>' + esc(f.snap_ragione_sociale || '') + '</b> · fattura n. ' + esc(f.numero) + ' del ' + esc(fd(f.data_emissione)) +
    '<br>Rata ' + esc(s.numero_rata) + ' · scadenza ' + esc(fd(s.data_scadenza)) + ' · da incassare <b>' + esc(euroBuono(residuoRata(s))) + '</b> ' + bsPag(s.stato) +
    (ultimo ? '<br>Ultimo: sollecito n. ' + ultimo.livello + ' del ' + esc(fd(ultimo.data_invio)) + ' (' + esc(etichettaMezzo(ultimo.mezzo)) + ')' : '<br>Primo sollecito') +
    (c.referente_nome || c.referente_telefono || c.referente_email ? '<br>Referente: ' + esc([c.referente_nome, c.referente_telefono, c.referente_email].filter(Boolean).join(' · ')) : '');
  ge('msl-data').value = oggi;
  ge('msl-data').max = oggi;
  ge('msl-data').min = f.data_emissione || '';
  ge('msl-mezzo').innerHTML = '<option value="">Scegli...</option>' + MEZZI_SOLLECITO.map(function(m) { return '<option value="' + m[0] + '">' + esc(m[1]) + '</option>'; }).join('');
  ge('msl-mezzo').value = 'telefono';
  ge('msl-destinatario').value = [c.referente_nome, c.referente_telefono].filter(Boolean).join(' ');
  delete ge('msl-destinatario').dataset.toccato;
  ge('msl-note').value = '';
  ge('msl-errore').style.display = 'none';
  aggiornaSollecito();
  openM('m-sollecito');
}

function aggiornaSollecito() {
  const a = sollecitoAperto;
  if (!a) return;
  const data = v('msl-data');
  let errore = '';
  if (!data) errore = 'Indica la data';
  else if (data > oggiFattura()) errore = 'La data non può essere nel futuro';
  else if (a.fattura.data_emissione && data < a.fattura.data_emissione) errore = 'La data non può essere prima della fattura';
  else if (!v('msl-mezzo')) errore = 'Scegli come hai sollecitato';
  const er = ge('msl-errore');
  if (errore) { er.textContent = errore; er.style.display = 'block'; } else er.style.display = 'none';
  // Cambiando il mezzo si propone il recapito giusto del referente.
  const c = a.fattura.clienti || {};
  const dest = ge('msl-destinatario');
  if (dest && !dest.dataset.toccato) {
    const m = v('msl-mezzo');
    dest.value = m === 'pec' ? (c.pec || '') : (m === 'email' ? (c.referente_email || '') : [c.referente_nome, m === 'telefono' ? c.referente_telefono : ''].filter(Boolean).join(' '));
  }
  ge('msl-salva').disabled = !!errore || !!a.inCorso;
}

async function salvaSollecito() {
  const a = sollecitoAperto;
  if (!a || a.inCorso) return;
  a.inCorso = true;
  ge('msl-salva').disabled = true;
  const { data, error } = await db.rpc('registra_sollecito', {
    p_scadenza_id: a.scadenza.id, p_data: v('msl-data'), p_mezzo: v('msl-mezzo'),
    p_destinatario: (v('msl-destinatario') || '').trim() || null, p_note: (v('msl-note') || '').trim() || null
  });
  a.inCorso = false;
  if (error) {
    const er = ge('msl-errore');
    er.textContent = 'Sollecito non registrato: ' + (error.message || 'errore');
    er.style.display = 'block';
    aggiornaSollecito();
    return;
  }
  closeM('m-sollecito');
  sollecitoAperto = null;
  toast('Sollecito n. ' + data.livello + ' registrato ✓ Fattura n. ' + data.numero + ' sollecitata', 'ok');
  await aggiornaDopoRiba(a.fattura.id);
}

async function apriEsitoSollecito(id, modo) {
  if (!puoSolleciti()) return;
  const { data: so, error } = await db.from('solleciti').select('*,fatture(id,numero,snap_ragione_sociale)').eq('id', id).maybeSingle();
  if (error || !so) { toast('Sollecito non trovato', 'err'); return; }
  esitoSollecitoAperto = { sollecito: so, modo: modo === 'elimina' ? 'elimina' : 'esito' };
  const elimina = esitoSollecitoAperto.modo === 'elimina';
  ge('mse-titolo').textContent = elimina ? '🗑️ Togli il sollecito' : '📞 Esito del sollecito';
  ge('mse-riepilogo').innerHTML = esc(testoSollecito(so)) + '<br>Fattura n. ' + esc((so.fatture && so.fatture.numero) || '') + ' · ' + esc((so.fatture && so.fatture.snap_ragione_sociale) || '') +
    (elimina ? '<br>Resta nel database come tolto; la rata torna com\'era prima del sollecito.' : '');
  ge('mse-esito-box').style.display = elimina ? 'none' : '';
  ge('mse-esito').value = '';
  ge('mse-note-label').textContent = elimina ? 'Perché lo togli? *' : 'Nota';
  ge('mse-note').value = '';
  ge('mse-errore').style.display = 'none';
  ge('mse-salva').textContent = elimina ? '🗑️ Togli sollecito' : '💾 Salva esito';
  aggiornaEsitoSollecito();
  openM('m-esito-sollecito');
}

function aggiornaEsitoSollecito() {
  const a = esitoSollecitoAperto;
  if (!a) return;
  const ok = a.modo === 'elimina' ? !!(v('mse-note') || '').trim() : !!v('mse-esito');
  ge('mse-salva').disabled = !ok || !!a.inCorso;
}

async function salvaEsitoSollecito() {
  const a = esitoSollecitoAperto;
  if (!a || a.inCorso) return;
  a.inCorso = true;
  ge('mse-salva').disabled = true;
  const nota = (v('mse-note') || '').trim() || null;
  const ris = a.modo === 'elimina'
    ? await db.rpc('elimina_sollecito', { p_sollecito_id: a.sollecito.id, p_motivo: nota })
    : await db.rpc('esito_sollecito', { p_sollecito_id: a.sollecito.id, p_esito: v('mse-esito'), p_note: nota });
  a.inCorso = false;
  if (ris.error) {
    const er = ge('mse-errore');
    er.textContent = 'Non salvato: ' + (ris.error.message || 'errore');
    er.style.display = 'block';
    aggiornaEsitoSollecito();
    return;
  }
  closeM('m-esito-sollecito');
  esitoSollecitoAperto = null;
  toast(a.modo === 'elimina' ? 'Sollecito tolto' : 'Esito del sollecito salvato ✓', 'ok');
  await aggiornaDopoRiba(a.sollecito.fattura_id);
}

// ── PDF della fattura (fase 12) ──────────────────────────────────────────
async function generaPdfFattura(fatturaId) {
  if (!(await preparaPDF())) return null;
  const { data: f, error } = await db.from('fatture').select('*').eq('id', fatturaId).maybeSingle();
  if (error || !f) { toast('Fattura non trovata per il PDF', 'err'); return null; }
  if (f.stato === 'bozza') { toast('Il PDF si fa della fattura emessa', 'err'); return null; }
  const [rr, rs, rif, banca] = await Promise.all([
    db.from('fatture_righe').select('*').eq('fattura_id', f.id).order('ordine_riga', { ascending: true }),
    db.from('fatture_scadenze').select('numero_rata,data_scadenza,importo').eq('fattura_id', f.id).order('numero_rata', { ascending: true }),
    f.tipo_documento === 'nota_credito'
      ? db.from('fatture').select('numero,data_emissione').eq('id', f.riferimento_fattura_id || '00000000-0000-0000-0000-000000000000').maybeSingle()
      : db.from('fatture').select('numero,data_emissione').eq('riferimento_fattura_id', f.id).eq('tipo_documento', 'nota_credito').is('eliminato_il', null).maybeSingle(),
    leggiImpostazioniBanca()
  ]);
  if (rr.error) { toast('Righe non leggibili: ' + rr.error.message, 'err'); return null; }
  const righe = rr.data || [];
  const scad = rs.data || [];
  const coll = rif.data || null;
  const nc = f.tipo_documento === 'nota_credito';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margine = 16;
  const destra = 194;
  intestazionePdfToliFire(doc, nc ? 'Nota di credito' : 'Fattura');

  let y = 46;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text((nc ? 'NOTA DI CREDITO N. ' : 'FATTURA N. ') + f.numero, margine, y);
  doc.setFontSize(10);
  doc.text('Data: ' + fd(f.data_emissione), destra, y, { align: 'right' });
  if (f.stato === 'annullata') {
    doc.setTextColor(200, 30, 30);
    doc.setFontSize(12);
    doc.text('ANNULLATA' + (coll ? ' con nota di credito n. ' + coll.numero : ''), destra, y + 7, { align: 'right' });
    doc.setTextColor(25, 25, 25);
  }

  y += 12;
  const colonna = 112;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Spett.le', margine, y);
  doc.text('Dati del documento', colonna, y);
  doc.setFont('helvetica', 'normal');
  const cliente = [
    f.snap_ragione_sociale,
    f.snap_indirizzo,
    [f.snap_cap, f.snap_citta].filter(Boolean).join(' '),
    f.snap_piva ? 'P.IVA ' + f.snap_piva : '',
    f.snap_codice_fiscale && f.snap_codice_fiscale !== f.snap_piva ? 'C.F. ' + f.snap_codice_fiscale : '',
    f.snap_codice_sdi ? 'Codice destinatario ' + f.snap_codice_sdi : '',
    f.snap_pec ? 'PEC ' + f.snap_pec : ''
  ].filter(Boolean);
  const documento = [
    'Numero: ' + f.numero,
    'Data: ' + fd(f.data_emissione),
    nc && coll ? 'Storno della fattura n. ' + coll.numero + ' del ' + fd(coll.data_emissione) : '',
    !nc && f.modalita_pagamento ? 'Pagamento: ' + f.modalita_pagamento : ''
  ].filter(Boolean);
  let ys = y + 6;
  cliente.forEach(function(t) { const p = doc.splitTextToSize(String(t), colonna - margine - 6); doc.text(p, margine, ys); ys += p.length * 5; });
  let yd = y + 6;
  documento.forEach(function(t) { const p = doc.splitTextToSize(String(t), destra - colonna); doc.text(p, colonna, yd); yd += p.length * 5; });
  y = Math.max(ys, yd) + 2;

  doc.autoTable({
    startY: y + 2,
    margin: { top: 18, right: margine, bottom: 30, left: margine },
    head: [['Descrizione', 'Q.tà', 'U.M.', 'Prezzo unit.', 'Sconto', 'Importo']],
    body: righe.map(function(r) {
      return [
        r.descrizione || '—',
        String(Number(r.quantita) || 0).replace('.', ','),
        r.unita_misura || '',
        euroPreventivo(r.prezzo_unitario),
        Number(r.sconto_perc) ? String(Number(r.sconto_perc)).replace('.', ',') + '%' : '',
        euroPreventivo(r.totale_riga)
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: [8, 80, 65], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 78 }, 1: { halign: 'right', cellWidth: 14 }, 2: { cellWidth: 12 },
      3: { halign: 'right', cellWidth: 28 }, 4: { halign: 'right', cellWidth: 16 }, 5: { halign: 'right', cellWidth: 30 }
    }
  });

  y = doc.lastAutoTable.finalY + 8;
  if (y > 240) { doc.addPage(); y = 20; }
  const totali = [
    ['Imponibile', euroPreventivo(f.totale_imponibile)],
    ['IVA ' + String(Number(f.iva_perc ?? 22)).replace('.', ',') + '%', euroPreventivo(f.totale_iva)],
    [nc ? 'Totale nota di credito' : 'Totale documento', euroPreventivo(f.totale)]
  ];
  doc.setFontSize(10);
  totali.forEach(function(t, i) {
    doc.setFont('helvetica', i === totali.length - 1 ? 'bold' : 'normal');
    if (i === totali.length - 1) doc.setFontSize(12);
    doc.text(t[0], 112, y);
    doc.text(t[1], destra, y, { align: 'right' });
    y += i === totali.length - 1 ? 8 : 6;
  });
  doc.setFontSize(9);

  if (!nc && scad.length) {
    if (y > 245) { doc.addPage(); y = 20; }
    doc.autoTable({
      startY: y,
      margin: { top: 18, right: margine, bottom: 30, left: margine },
      head: [['Rata', 'Scadenza', 'Importo']],
      body: scad.map(function(s) { return [String(s.numero_rata), fd(s.data_scadenza), euroPreventivo(s.importo)]; }),
      theme: 'grid',
      headStyles: { fillColor: [8, 80, 65], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      tableWidth: 90,
      columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 34 }, 2: { halign: 'right', cellWidth: 40 } }
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  const pagamento = [];
  if (!nc) {
    if (modalitaRiba(f.modalita_pagamento)) {
      const ac = abiCabDaIban(f.iban);
      pagamento.push('Pagamento con ricevuta bancaria (RIBA)' + (ac ? ': banca d\'appoggio ABI ' + ac.abi + ' CAB ' + ac.cab : '') + '.');
    } else if (banca.iban_azienda) {
      pagamento.push('Coordinate per il bonifico: ' + (banca.banca_azienda ? banca.banca_azienda + ' — ' : '') + 'IBAN ' + banca.iban_azienda + '. Causale: fattura n. ' + f.numero + '.');
    }
  }
  if (f.note) pagamento.push('Note: ' + f.note);
  if (pagamento.length) {
    const testo = doc.splitTextToSize(pagamento.join('\n'), destra - margine);
    if (y + testo.length * 4.5 > 270) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'normal');
    doc.text(testo, margine, y);
    y += testo.length * 4.5 + 4;
  }

  const cortesia = doc.splitTextToSize('Copia di cortesia. Non sostituisce la fattura elettronica trasmessa tramite il Sistema di Interscambio (SDI).', destra - margine);
  if (y + cortesia.length * 4 > 278) { doc.addPage(); y = 20; }
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(cortesia, margine, y);
  doc.setTextColor(25, 25, 25);

  numeraPaginePdf(doc, (nc ? 'Nota di credito ' : 'Fattura ') + f.numero);
  const nomeFile = (nc ? 'NotaCredito_' : 'Fattura_') + String(f.numero).replace(/[^0-9A-Za-z]+/g, '-') + '_' +
    nomeFileSicuroCommessa(f.snap_ragione_sociale || 'cliente').slice(0, 40) + '.pdf';
  return { doc: doc, nomeFile: nomeFile, fattura: f };
}

async function scaricaPdfFattura() {
  const f = fatBozza && fatBozza.fattura;
  if (!f) return;
  const r = await generaPdfFattura(f.id);
  if (r) r.doc.save(r.nomeFile);
}

async function salvaCopiaPdfFattura() {
  const f = fatBozza && fatBozza.fattura;
  if (!f || !puoRiba()) return;
  const btn = ge('mfat-pdf-salva');
  if (btn) btn.disabled = true;
  const r = await generaPdfFattura(f.id);
  if (!r) { if (btn) btn.disabled = false; return; }
  const ora = new Date();
  const timbro = dataLocaleISO(ora).replace(/-/g, '') + '-' + String(ora.getHours()).padStart(2, '0') + String(ora.getMinutes()).padStart(2, '0') + String(ora.getSeconds()).padStart(2, '0');
  const percorso = f.id + '/' + r.nomeFile.replace(/\.pdf$/, '') + '_' + timbro + '.pdf';
  const blob = r.doc.output('blob');
  const up = await db.storage.from('fatture-pdf').upload(percorso, blob, { contentType: 'application/pdf', upsert: false });
  if (up.error) { if (btn) btn.disabled = false; toast('PDF non salvato: ' + (up.error.message || 'errore'), 'err'); return; }
  const { error } = await db.from('fatture').update({ pdf_url: percorso }).eq('id', f.id);
  if (btn) btn.disabled = false;
  if (error) { toast('PDF caricato ma non collegato alla fattura: ' + error.message, 'err'); return; }
  toast('Copia PDF salvata nell\'archivio ✓', 'ok');
  if (fatBozza && fatBozza.id === f.id) await apriFattura(f.id);
}

async function apriCopiaPdfFattura() {
  const f = fatBozza && fatBozza.fattura;
  if (!f || !f.pdf_url) return;
  const finestra = window.open('', '_blank');
  const { data, error } = await db.storage.from('fatture-pdf').createSignedUrl(f.pdf_url, 300);
  if (error || !data) { if (finestra) finestra.close(); toast('Copia non apribile: ' + ((error && error.message) || 'errore'), 'err'); return; }
  if (finestra) finestra.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}

// ── Dashboard (fase 11) ──────────────────────────────────────────────────
async function datiKpiFatturato() {
  const oggi = oggiFattura();
  const primoAnno = oggi.slice(0, 4) + '-01-01';
  const primoMese = oggi.slice(0, 8) + '01';
  const [rf, rp, ri] = await Promise.all([
    leggiTuttePagine(function() {
      return db.from('fatture').select('id,tipo_documento,stato,totale_imponibile,data_emissione')
        .in('stato', ['emessa', 'annullata']).is('eliminato_il', null).gte('data_emissione', primoAnno).lte('data_emissione', oggi).order('id');
    }),
    leggiTuttePagine(function() {
      return db.from('fatture_pagamenti').select('id,importo').is('annullato_il', null).gte('data_pagamento', primoAnno).lte('data_pagamento', oggi).order('id');
    }),
    leggiTuttePagine(function() {
      return db.from('fatture_scadenze').select('id,importo,importo_pagato,stato,fatture!inner(stato,eliminato_il,cliente_id)')
        .in('stato', ['insoluta', 'sollecitata']).eq('fatture.stato', 'emessa').is('fatture.eliminato_il', null).order('id');
    })
  ]);
  if (rf.errore || rp.errore || ri.errore) return null;
  const k = { mese: 0, anno: 0, incassatoAnno: 0, insoluti: 0, nInsoluti: 0, clientiInsoluti: 0 };
  rf.righe.forEach(function(f) {
    const segno = f.tipo_documento === 'nota_credito' ? -1 : 1;
    const imp = segno * (Number(f.totale_imponibile) || 0);
    k.anno += imp;
    if (f.data_emissione >= primoMese) k.mese += imp;
  });
  rp.righe.forEach(function(p) { k.incassatoAnno += Number(p.importo) || 0; });
  const clienti = new Set();
  ri.righe.forEach(function(s) {
    const r = residuoRata(s);
    if (r <= 0) return;
    k.insoluti += r; k.nInsoluti++;
    if (s.fatture && s.fatture.cliente_id) clienti.add(s.fatture.cliente_id);
  });
  k.clientiInsoluti = clienti.size;
  ['mese', 'anno', 'incassatoAnno', 'insoluti'].forEach(function(c) { k[c] = arrotonda2(k[c]); });
  return k;
}

function vaiASollecitiFatture(filtro) {
  if (!canAccessPage('fatture')) return;
  gotoPage('fatture');
  setTimeout(function() {
    const sel = ge('fat-sol-filtro');
    if (sel && filtro) { sel.value = filtro; caricaSollecitiFatture(); }
    const b = ge('fat-solleciti-box');
    if (b) { const d = b.querySelector('details'); if (d) d.open = true; b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }, 900);
}

function vaiARibaFatture() {
  if (!canAccessPage('fatture')) return;
  gotoPage('fatture');
  setTimeout(function() {
    const b = ge('fat-riba-box');
    if (b) { const d = b.querySelector('details'); if (d) d.open = true; b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }, 900);
}

async function caricaKpiFatturatoTitolare() {
  const el = ge('tit-fatturato');
  if (!el) return;
  if (!(await verificaFattureRiba())) { el.innerHTML = ''; return; }
  const k = await datiKpiFatturato();
  if (!k) { el.innerHTML = ''; return; }
  const mese = new Date().toLocaleDateString('it-IT', { month: 'long', timeZone: 'Europe/Rome' });
  const anno = oggiFattura().slice(0, 4);
  const carta = function(classe, icona, valore, etichetta, click) {
    return '<div class="kpi-card ' + classe + (click ? ' clickable" onclick="' + click : '') + '"><div class="kpi-icon">' + icona + '</div><div class="kpi-num" style="font-size:20px">' + esc(euroBuono(valore)) + '</div><div class="kpi-label">' + etichetta + '</div></div>';
  };
  el.innerHTML = '<div class="tit-section">📈 Fatturato e insoluti</div><div class="kpi-grid">' +
    carta('info', '🧾', k.mese, 'Fatturato a ' + esc(mese) + ' (imponibile, note di credito tolte)', 'gotoPage(\'fatture\')') +
    carta('', '📅', k.anno, 'Fatturato ' + anno + ' (imponibile)', 'gotoPage(\'fatture\')') +
    carta('success', '✅', k.incassatoAnno, 'Incassato ' + anno + ' (pagamenti registrati)', 'vaiAScadenzeFatture(\'pagate\')') +
    carta(k.nInsoluti ? 'attention' : '', '💔', k.insoluti, 'Insoluti (' + k.nInsoluti + (k.nInsoluti === 1 ? ' rata' : ' rate') + ', ' + k.clientiInsoluti + (k.clientiInsoluti === 1 ? ' cliente' : ' clienti') + ')', 'vaiASollecitiFatture(\'tutti\')') +
  '</div>';
}

async function datiRibaSolleciti() {
  const [daPres, rd, rr, sol] = await Promise.all([
    rateRibaDaPresentare(60),
    db.from('riba_presentazioni').select('id', { count: 'exact', head: true }).eq('stato', 'preparata').is('eliminato_il', null),
    leggiTuttePagine(function() {
      return db.from('riba_righe').select('id,data_scadenza,riba_presentazioni!inner(stato,eliminato_il)')
        .is('esito', null).eq('riba_presentazioni.stato', 'inviata').is('riba_presentazioni.eliminato_il', null).order('id');
    }, 3000),
    leggiRateDaSollecitare()
  ]);
  if (!daPres || rd.error || rr.errore || sol.errore) return null;
  const oggi = oggiFattura();
  const rate = sol.rate;
  const somma = function(l) { return arrotonda2(l.reduce(function(t, s) { return t + residuoRata(s); }, 0)); };
  const ins = rate.filter(function(s) { return s.stato === 'insoluta'; });
  const scad = rate.filter(function(s) { return s.stato === 'aperta'; });
  const attesa = rate.filter(function(s) { return s.ultimo && s.ultimo.esito === 'inviato'; });
  return {
    daPresentare: daPres, distinteDaInviare: rd.count || 0,
    esiti: rr.righe.length, esitiScaduti: rr.righe.filter(function(x) { return x.data_scadenza < oggi; }).length,
    insolute: { n: ins.length, importo: somma(ins) }, scadute: { n: scad.length, importo: somma(scad) },
    attesa: attesa.length, rate: rate
  };
}

async function caricaRibaSollecitiDashboard() {
  const id = ROLE === 'segreteria' ? 'seg-riba-solleciti' : (ROLE === 'contabile' ? 'dash-riba-solleciti' : null);
  const el = id ? ge(id) : null;
  if (!el) return;
  if (!(await verificaFattureRiba())) return;
  const k = await datiRibaSolleciti();
  if (!k) { el.innerHTML = '<div class="rap-list-card"><div class="tit-empty">RIBA e solleciti non leggibili ora: riprova</div></div>'; return; }
  const carta = function(classe, icona, numero, etichetta, click) {
    return '<div class="kpi-card ' + classe + ' clickable" onclick="' + click + '"><div class="kpi-icon">' + icona + '</div><div class="kpi-num">' + numero + '</div><div class="kpi-label">' + etichetta + '</div></div>';
  };
  const oggi = oggiFattura();
  const primi = k.rate.filter(function(s) { return s.stato === 'insoluta' || s.stato === 'sollecitata'; }).slice(0, 8);
  el.innerHTML = (ROLE === 'contabile' ? '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--m);margin-bottom:10px">🏦 RIBA, insoluti e solleciti</div>' : '') +
    '<div class="kpi-grid">' +
      carta(k.daPresentare.n ? 'warn' : '', '🏦', k.daPresentare.n, 'RIBA da presentare entro 60 gg (' + esc(euroBuono(k.daPresentare.importo)) + ')', 'vaiARibaFatture()') +
      carta(k.distinteDaInviare ? 'warn' : '', '📤', k.distinteDaInviare, 'Distinte preparate da portare in banca', 'vaiARibaFatture()') +
      carta(k.esitiScaduti ? 'attention' : 'info', '📥', k.esiti, 'Esiti RIBA da registrare' + (k.esitiScaduti ? ' (' + k.esitiScaduti + ' già scaduti)' : ''), 'vaiARibaFatture()') +
      carta(k.insolute.n ? 'attention' : '', '💔', k.insolute.n, 'Insoluti da sollecitare (' + esc(euroBuono(k.insolute.importo)) + ')', 'vaiASollecitiFatture(\'insolute\')') +
      carta(k.scadute.n ? 'warn' : '', '⏰', k.scadute.n, 'Scadute non sollecitate (' + esc(euroBuono(k.scadute.importo)) + ')', 'vaiASollecitiFatture(\'scadute\')') +
      carta('', '📞', k.attesa, 'Solleciti senza risposta', 'vaiASollecitiFatture(\'attesa\')') +
    '</div>' +
    (primi.length ? '<div class="rap-list-card" style="margin-top:8px">' + primi.map(function(s) { return htmlRataDaSollecitare(s, oggi, true); }).join('') + '</div>' : '') +
    (ROLE === 'contabile' ? '<div style="height:20px"></div>' : '');
}

async function caricaDashboardFattureRiba() {
  if (ROLE === 'titolare') await caricaKpiFatturatoTitolare();
  else if (ROLE === 'segreteria' || ROLE === 'contabile') await caricaRibaSollecitiDashboard();
}

const loadDashPrimaRiba = loadDash;
loadDash = async function() {
  const r = await loadDashPrimaRiba.apply(this, arguments);
  try { await caricaDashboardFattureRiba(); } catch (e) { console.warn('Dashboard RIBA e solleciti:', e); }
  return r;
};

// Rappresentante: insoluti dei suoi clienti (clienti.rappresentante_id = lui;
// le policy di sql/10 gli fanno già vedere solo quelle fatture).
async function caricaInsolutiRappresentante() {
  const el = ge('rap-insoluti-box');
  if (!el || ROLE !== 'rappresentante' || !ME || !ME.id) return;
  if (!(await verificaFattureRiba())) return;
  const r = await leggiTuttePagine(function() {
    return db.from('fatture_scadenze')
      .select('id,fattura_id,numero_rata,data_scadenza,importo,importo_pagato,stato,fatture!inner(id,numero,data_emissione,stato,eliminato_il,commessa_id,cliente_id,snap_ragione_sociale,clienti!inner(ragione_sociale,rappresentante_id))')
      .in('stato', ['insoluta', 'sollecitata']).eq('fatture.stato', 'emessa').is('fatture.eliminato_il', null)
      .eq('fatture.clienti.rappresentante_id', ME.id)
      .order('data_scadenza', { ascending: true });
  }, 2000);
  if (r.errore) { el.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Insoluti non leggibili: ' + esc(r.errore.message || 'errore') + '</div></div>'; return; }
  const rate = r.righe.filter(function(s) { return residuoRata(s) > 0 && s.fatture && s.fatture.clienti && s.fatture.clienti.rappresentante_id === ME.id; });
  if (!rate.length) { el.innerHTML = '<div class="rap-list-card"><div class="tit-empty">✅ Nessun insoluto dei tuoi clienti</div></div>'; return; }
  const fIds = Array.from(new Set(rate.map(function(s) { return s.fattura_id; })));
  const sIds = rate.map(function(s) { return s.id; });
  const cIds = Array.from(new Set(rate.map(function(s) { return s.fatture.commessa_id; }).filter(Boolean)));
  const [rr, rs, rc] = await Promise.all([
    leggiABlocchi(fIds, function(b) { return db.from('fatture_righe').select('fattura_id,descrizione,ordine_riga').in('fattura_id', b).order('ordine_riga', { ascending: true }); }),
    leggiABlocchi(sIds, function(b) { return db.from('solleciti').select('scadenza_id,livello,data_invio,mezzo,esito,esito_note').in('scadenza_id', b).is('eliminato_il', null).order('livello', { ascending: true }); }),
    cIds.length ? leggiABlocchi(cIds, function(b) { return db.from('commesse').select('id,codice').in('id', b); }) : Promise.resolve({ righe: [] })
  ]);
  const righe = {};
  (rr.righe || []).forEach(function(x) { (righe[x.fattura_id] = righe[x.fattura_id] || []).push(x.descrizione); });
  const sol = {};
  (rs.righe || []).forEach(function(x) { sol[x.scadenza_id] = x; });
  const comm = {};
  (rc.righe || []).forEach(function(x) { comm[x.id] = x.codice; });
  const oggi = oggiFattura();
  el.innerHTML = '<div class="rap-list-card">' + rate.map(function(s) {
    const f = s.fatture;
    const mat = righe[f.id] || [];
    const u = sol[s.id];
    return '<div style="padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px;overflow-wrap:anywhere">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + esc(f.clienti.ragione_sociale || f.snap_ragione_sociale || '') + '</b><b style="color:var(--r)">' + esc(euroBuono(residuoRata(s))) + '</b></div>' +
      '<div style="font-size:12px;color:var(--m)">Fattura n. ' + esc(f.numero) + ' del ' + esc(fd(f.data_emissione)) + ' · rata ' + esc(s.numero_rata) + ' · scadenza ' + esc(fd(s.data_scadenza)) +
        (s.data_scadenza < oggi ? ' (scaduta da ' + giorniTraISO(s.data_scadenza, oggi) + ' gg)' : '') + ' ' + bsPag(s.stato) + '</div>' +
      (f.commessa_id && comm[f.commessa_id] ? '<div style="font-size:12px">Commessa <b>' + esc(comm[f.commessa_id]) + '</b>' +
        (canAccessPage('commessa-detail') ? ' <button class="btn sm" style="padding:2px 8px" data-id="' + esc(f.commessa_id) + '" onclick="openCommessaDetail(this.dataset.id)">Apri</button>' : '') + '</div>' : '') +
      (mat.length ? '<div style="font-size:12px">Per: ' + esc(mat.slice(0, 2).join('; ')) + (mat.length > 2 ? ' e altre ' + (mat.length - 2) + ' righe' : '') + '</div>' : '') +
      (u ? '<div style="font-size:12px;color:var(--m)">Segreteria: ' + esc(testoSollecito(u)) + '</div>' : '<div style="font-size:12px;color:var(--a)">La segreteria non l\'ha ancora sollecitata</div>') +
    '</div>';
  }).join('') + '</div>';
}

const loadDashRappresentantePrimaRiba = loadDashRappresentante;
loadDashRappresentante = async function() {
  const r = await loadDashRappresentantePrimaRiba.apply(this, arguments);
  try { await caricaInsolutiRappresentante(); } catch (e) { console.warn('Insoluti del rappresentante:', e); }
  return r;
};

// Il destinatario del sollecito scritto a mano non si sovrascrive più.
document.addEventListener('input', function(e) {
  if (e.target && e.target.id === 'msl-destinatario') e.target.dataset.toccato = '1';
});
