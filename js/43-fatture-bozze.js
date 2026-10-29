// =====================================================================
// F11.1 — FATTURE: BOZZA DALLA SCHEDA DI LAVORO (modulo Fatture, fasi 1-4
// del piano in CLAUDE.md). Caricare dopo 42-buono-lavoro.js e prima di
// 19-init.js. Funziona solo con sql/45-fatture-bozze eseguito: senza, la
// pagina Fatture resta la lista in sola lettura di js/06 e nulla cambia.
//
// - Pagina Fatture (pg-fatture): riquadro "Schede da fatturare"
//   (fat-schede-box) con le schede di lavoro approvate, inviate al cliente
//   o da fatturare che non sono ancora in una fattura, ognuna con
//   "Crea bozza". Ogni riga della lista apre la fattura (finestra
//   m-fattura): modificabile se è una bozza e si è titolare, segreteria o
//   contabile; in sola lettura per gli altri (commerciale) e per le
//   fatture emesse o annullate.
// - Workflow (Da gestire / Da fatturare) e finestra della scheda (box
//   "Buono di lavoro" di js/42): bottone "🧾 Crea bozza fattura" o
//   "🧾 Apri bozza".
// - RIGHE PROPOSTE (fase 4 del piano), dal buono di lavoro di F10.4
//   (datiBuonoLavoro di js/42):
//     1. la descrizione dell'intervento (data, tipo, lavori eseguiti),
//        prezzo 0, da completare o togliere;
//     2. le righe dei DDT dell'intervento, con il prezzo del DDT (che per i
//        clienti con contratto è già quello del preventivo del contratto,
//        F10.4) e il riferimento al DDT; un DDT già in un'altra fattura
//        non si propone;
//     3. la manodopera: ore lavorate della scheda × tariffa oraria
//        standard (Impostazioni). Per la manutenzione ordinaria del
//        contratto in vigore è proposta ma NON spuntata (di solito è
//        compresa nel contratto: si spunta se va fatturata).
//   Si aggiungono a mano righe libere, la manodopera e le voci del
//   preventivo del contratto (prezzi_contratto_cliente, sql/44). Ogni
//   riga ha la sua origine e l'origine del prezzo (prezzo cambiato a
//   mano = "manuale"). Una sola aliquota IVA per fattura.
// - Il database (RPC salva_bozza_fattura) controlla tutto di nuovo e
//   calcola i totali; la bozza NON ha numero (lo assegna l'emissione,
//   F11.2). Creando la bozza la scheda approvata o inviata passa "da
//   fatturare". "Elimina bozza" (elimina_bozza_fattura) la toglie e la
//   scheda torna fatturabile.
// =====================================================================

const RUOLI_BOZZE_FATTURA = ['titolare', 'segreteria', 'contabile'];
const STATI_SCHEDA_FATTURABILE = ['approvata', 'inviata_cliente', 'da_fatturare'];
const ALIQUOTE_IVA = [22, 10, 5, 4, 0];
const ETICHETTE_ORIGINE_RIGA = { scheda: '📋 Intervento', ddt: '📦 DDT', manodopera: '🕒 Manodopera', contratto: '📄 Voce del contratto', manuale: '✏️ A mano' };
const ETICHETTE_FONTE_PREZZO = { contratto: 'prezzo del contratto', ddt: 'prezzo del DDT', tariffa_oraria: 'tariffa oraria', manuale: 'prezzo a mano' };

let fattureBozzeAttive = null;  // null = da verificare; true/false dopo (sql/45)
let fatBozza = null;            // stato della finestra m-fattura

// ── Utilità ──────────────────────────────────────────────────────────────
function puoScrivereBozze() {
  return RUOLI_BOZZE_FATTURA.includes(ROLE);
}

// Arrotondamento a 2 decimali come Postgres (metà lontano da zero).
function arrotonda2(x) {
  const n = Number(x) || 0;
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7) / 100;
}

function numeroDaCampo(s) {
  if (s === null || s === undefined) return NaN;
  const t = String(s).trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
}

function totaleRigaBozza(r) {
  const q = arrotonda2(numeroDaCampo(r.quantita));
  const p = arrotonda2(numeroDaCampo(r.prezzo_unitario));
  const sc = arrotonda2(numeroDaCampo(r.sconto_perc) || 0);
  if (isNaN(q) || isNaN(p)) return 0;
  return arrotonda2(q * p * (1 - sc / 100));
}

function testoFatturaBreve(f) {
  if (!f) return '';
  return f.numero ? 'n. ' + f.numero : 'bozza del ' + (f.creato_il ? fd(dataLocaleISO(new Date(f.creato_il))) : '');
}

// true se sql/45 è stato eseguito (colonna origine delle righe).
async function verificaFattureBozze() {
  if (fattureBozzeAttive !== null) return fattureBozzeAttive;
  const { error } = await db.from('fatture_righe').select('origine').limit(1);
  if (!error) fattureBozzeAttive = true;
  else if (error.code === '42703' || error.code === 'PGRST204' || /origine/i.test(error.message || '')) fattureBozzeAttive = false;
  else return false; // errore momentaneo: si riprova la prossima volta
  return fattureBozzeAttive;
}

// Fatture attive (non eliminate, non annullate) per scheda: { schedaId: fattura }.
async function fattureAttivePerScheda(schedaIds) {
  const ris = {};
  const r = await leggiABlocchi(schedaIds, function(b) {
    return db.from('fatture').select('id,numero,stato,creato_il,scheda_lavoro_id')
      .is('eliminato_il', null).neq('stato', 'annullata').eq('tipo_documento', 'fattura').in('scheda_lavoro_id', b);
  });
  if (r.errore) return null;
  r.righe.forEach(function(f) { ris[f.scheda_lavoro_id] = f; });
  return ris;
}

// ── Pagina Fatture ───────────────────────────────────────────────────────
const loadFatturePrimaBozze = loadFatture;
loadFatture = async function() {
  const r = await loadFatturePrimaBozze.apply(this, arguments);
  try {
    if (!(await verificaFattureBozze())) return r;
    const sotto = ge('fat-sottotitolo');
    if (sotto) sotto.textContent = puoScrivereBozze()
      ? 'Documenti emessi, bozze e note di credito. Le bozze nascono dalle schede di lavoro.'
      : 'Documenti emessi, bozze e note di credito (sola lettura)';
    document.querySelectorAll('#fat-body tr[data-fattura-id]').forEach(function(tr) {
      tr.style.cursor = 'pointer';
      tr.title = 'Apri la fattura';
      tr.onclick = function() { apriFattura(tr.dataset.fatturaId); };
    });
    const attivo = document.activeElement && document.activeElement.id === 'fat-fil-search';
    if (!attivo) await caricaSchedeDaFatturare();
  } catch (e) { console.warn('Bozze fatture:', e); }
  return r;
};

async function caricaSchedeDaFatturare() {
  const box = ge('fat-schede-box');
  if (!box) return;
  if (!puoScrivereBozze()) { box.style.display = 'none'; return; }
  const { data, error } = await db.from('schede_lavoro')
    .select('id,numero,data_intervento,stato,ore_lavorate,clienti(ragione_sociale),ordini_lavoro(tipo,numero)')
    .in('stato', STATI_SCHEDA_FATTURABILE).not('impossibilitato', 'is', true).is('eliminato_il', null)
    .order('data_intervento', { ascending: true }).limit(300);
  if (error) { box.style.display = 'none'; return; }
  const gia = await fattureAttivePerScheda((data || []).map(function(s) { return s.id; }));
  if (!gia) { box.style.display = 'none'; return; }
  const libere = (data || []).filter(function(s) { return !gia[s.id]; });
  const aperto = box.querySelector('details') ? box.querySelector('details').open : libere.length > 0 && libere.length <= 10;
  let html = '<details' + (aperto ? ' open' : '') + '><summary style="cursor:pointer;font-size:14px;font-weight:600">🧾 Schede da fatturare senza bozza (' + libere.length + ')</summary>' +
    '<div style="font-size:12px;color:var(--m);margin:6px 0 8px">Schede di lavoro approvate, inviate al cliente o da fatturare. La bozza propone le righe dal buono di lavoro: intervento, DDT e manodopera.</div>';
  if (!libere.length) {
    html += '<div class="empty" style="padding:10px">Nessuna scheda in attesa di fattura</div>';
  } else {
    html += libere.map(function(s) {
      const tipo = s.ordini_lavoro && s.ordini_lavoro.tipo;
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-top:0.5px solid var(--bo)">' +
        '<div style="min-width:0;overflow-wrap:anywhere"><div style="font-size:13px;font-weight:600">' + esc((s.clienti && s.clienti.ragione_sociale) || '—') + '</div>' +
        '<div style="font-size:12px;color:var(--m)">Scheda n. ' + esc(s.numero ?? '—') + ' · ' + esc(fd(s.data_intervento)) + (tipo ? ' · ' + esc(tl(tipo)) : '') + ' ' + bs(s.stato) + '</div></div>' +
        '<button class="btn sm p" data-id="' + esc(s.id) + '" onclick="apriBozzaDaScheda(this.dataset.id)">🧾 Crea bozza</button></div>';
    }).join('');
    if ((data || []).length >= 300) html += '<div style="font-size:11px;color:var(--m);margin-top:6px">Mostrate le prime 300 schede (dalle più vecchie).</div>';
  }
  html += '</details>';
  box.innerHTML = html;
  box.style.display = 'block';
}

function aggiornaDopoBozza() {
  const pf = ge('pg-fatture');
  if (pf && pf.classList.contains('on')) loadFatture();
  const pw = ge('pg-workflow');
  if (pw && pw.classList.contains('on')) loadWorkflow();
}

// ── Finestra m-fattura ───────────────────────────────────────────────────
// Nuova bozza dalla scheda: righe proposte dal buono di lavoro.
async function apriBozzaDaScheda(schedaId) {
  if (!puoScrivereBozze()) { toast('La bozza la preparano segreteria, contabile o titolare', 'err'); return; }
  if (!(await verificaFattureBozze())) { toast('Il modulo Fatture non è ancora attivo (sql/45)', 'err'); return; }
  const gia = await fattureAttivePerScheda([schedaId]);
  if (gia && gia[schedaId]) { apriFattura(gia[schedaId].id); return; }
  const { data: s, error } = await db.from('schede_lavoro')
    .select('*,ordini_lavoro(tipo,numero),clienti(ragione_sociale)').eq('id', schedaId).maybeSingle();
  if (error || !s) { toast('Scheda non trovata: ricarica la pagina', 'err'); return; }
  if (s.eliminato_il || s.impossibilitato) { toast('Questa scheda non si fattura (eliminata o intervento non completato)', 'err'); return; }
  if (!STATI_SCHEDA_FATTURABILE.includes(s.stato)) { toast('La scheda si fattura quando è approvata, inviata al cliente o da fatturare', 'err'); return; }

  closeM('m-scheda');
  fatBozza = { id: null, scheda: s, clienteId: s.cliente_id, cliente: (s.clienti && s.clienti.ragione_sociale) || '—', righe: [], modificabile: true, prezzi: null, tariffa: null, fuori: [] };
  preparaFinestraFattura('🧾 Nuova bozza di fattura');
  ge('mfat-righe').innerHTML = '<div class="load">Preparo le righe dal buono di lavoro...</div>';
  openM('m-fattura');

  const [d, tariffa] = await Promise.all([datiBuonoLavoro(s), leggiTariffaOraria()]);
  if (!fatBozza || fatBozza.scheda.id !== schedaId) return;
  fatBozza.prezzi = d.prezzi;
  fatBozza.tariffa = tariffa;
  fatBozza.fuori = d.fuori || [];

  // DDT già in un'altra fattura attiva
  const ddtIds = (d.ddt || []).map(function(x) { return x.id; });
  const giaDdt = {};
  if (ddtIds.length) {
    const rr = await leggiABlocchi(ddtIds, function(b) {
      return db.from('fatture_righe').select('ddt_id,fatture(id,numero,stato,creato_il,eliminato_il,tipo_documento)').in('ddt_id', b);
    });
    rr.righe.forEach(function(r) {
      const f = r.fatture;
      if (f && !f.eliminato_il && f.stato !== 'annullata' && f.tipo_documento === 'fattura') giaDdt[r.ddt_id] = f;
    });
  }

  const righe = [];
  const tipo = d.tipoIntervento;
  const lavori = String(s.lavori_eseguiti || '').replace(/\s+/g, ' ').trim();
  righe.push({
    incl: true, origine: 'scheda', fonte_prezzo: null, ddt_id: null, quantita: 1, unita_misura: '', sconto_perc: 0,
    descrizione: 'Intervento del ' + fd(s.data_intervento) + (tipo ? ' - ' + tl(tipo) : '') +
      (s.ordini_lavoro && s.ordini_lavoro.numero ? ' (intervento n. ' + s.ordini_lavoro.numero + ')' : '') +
      (lavori ? ': ' + (lavori.length > 400 ? lavori.slice(0, 400) + '...' : lavori) : ''),
    prezzo_unitario: 0, prezzoProposto: 0,
    nota: 'Descrizione dell\'intervento: completa il prezzo se l\'intervento si fattura, oppure lasciala come riga descrittiva.'
  });
  (d.ddt || []).forEach(function(dd) {
    const altra = giaDdt[dd.id];
    (dd.righe || []).forEach(function(r) {
      const p = Number(r.prezzo_unitario) || 0;
      righe.push({
        incl: !altra, bloccata: !!altra, origine: 'ddt', ddt_id: dd.id,
        fonte_prezzo: r._fonte && r._fonte.tipo === 'contratto' ? 'contratto' : 'ddt',
        descrizione: (r.descrizione || '—') + ' (DDT n. ' + (dd.numero || '—') + ' del ' + fd(dd.data_emissione) + ')',
        quantita: Number(r.quantita) || 0, unita_misura: r.um || r.unita_misura || '', prezzo_unitario: p, prezzoProposto: p, sconto_perc: 0,
        nota: altra ? 'DDT già nella fattura ' + testoFatturaBreve(altra) + ': non si fattura due volte.' : (r._fonte && r._fonte.tipo === 'diverso' ? 'Nel contratto questa voce costa ' + euroBuono(r._fonte.voce.prezzo_unitario) + '.' : '')
      });
    });
  });
  const ore = Number(s.ore_lavorate) || 0;
  if (ore > 0) {
    const inContratto = d.periodo && d.periodo.stato === 'attivo' && tipo === 'ordinario_programmato';
    righe.push(rigaManodopera(ore, tariffa, !inContratto,
      inContratto ? 'Manutenzione ordinaria del contratto in vigore: la manodopera di solito è compresa. Spunta la riga se va fatturata.' : ''));
  }
  fatBozza.righe = righe;
  fatBozza.oreScheda = ore;
  ge('mfat-iva').value = '22';
  ge('mfat-note').value = '';
  disegnaFattura();
}

function rigaManodopera(ore, tariffa, incl, nota) {
  const t = Number(tariffa) || 0;
  return {
    incl: incl, origine: 'manodopera', fonte_prezzo: 'tariffa_oraria', ddt_id: null,
    descrizione: 'Manodopera tecnico', quantita: ore || 1, unita_misura: 'ore',
    prezzo_unitario: t, prezzoProposto: t, sconto_perc: 0,
    nota: nota || (t ? '' : 'Tariffa oraria non impostata (Impostazioni): scrivi il prezzo.')
  };
}

async function leggiTariffaOraria() {
  const { data, error } = await db.from('impostazioni').select('tariffa_oraria_standard').eq('id', 1).maybeSingle();
  if (error || !data) return null;
  return data.tariffa_oraria_standard === null ? null : Number(data.tariffa_oraria_standard);
}

// Fattura esistente: bozza modificabile o sola lettura.
async function apriFattura(id) {
  if (!(await verificaFattureBozze())) return;
  const { data: f, error } = await db.from('fatture').select('*,clienti(ragione_sociale)').eq('id', id).maybeSingle();
  if (error || !f) { toast('Fattura non trovata: ricarica la pagina', 'err'); return; }
  const [rr, rs] = await Promise.all([
    db.from('fatture_righe').select('*').eq('fattura_id', id).order('ordine_riga', { ascending: true }),
    f.scheda_lavoro_id
      ? db.from('schede_lavoro').select('id,numero,data_intervento,stato,cliente_id,odl_id,ore_lavorate,ordini_lavoro(tipo,numero)').eq('id', f.scheda_lavoro_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);
  if (rr.error) { toast('Righe non leggibili: ' + rr.error.message, 'err'); return; }
  const modificabile = puoScrivereBozze() && f.stato === 'bozza' && !f.eliminato_il && f.tipo_documento === 'fattura';
  closeM('m-scheda');
  fatBozza = {
    id: f.id, fattura: f, scheda: rs.data || null, clienteId: f.cliente_id,
    cliente: f.snap_ragione_sociale || (f.clienti && f.clienti.ragione_sociale) || '—',
    modificabile: modificabile, prezzi: null, tariffa: null, fuori: [],
    oreScheda: rs.data ? Number(rs.data.ore_lavorate) || 0 : 0,
    righe: (rr.data || []).map(function(r) {
      return {
        incl: true, origine: r.origine || 'manuale', fonte_prezzo: r.fonte_prezzo || null, ddt_id: r.ddt_id || null,
        descrizione: r.descrizione || '', quantita: Number(r.quantita) || 0, unita_misura: r.unita_misura || '',
        prezzo_unitario: Number(r.prezzo_unitario) || 0, prezzoProposto: Number(r.prezzo_unitario) || 0,
        sconto_perc: Number(r.sconto_perc) || 0, totale_riga: r.totale_riga, nota: ''
      };
    })
  };
  preparaFinestraFattura(f.stato === 'bozza' ? '🧾 Bozza di fattura' : (f.tipo_documento === 'nota_credito' ? '🔁 Nota di credito ' : '📄 Fattura ') + (f.numero || ''));
  ge('mfat-iva').value = String(Number(f.iva_perc ?? 22));
  if (ge('mfat-iva').value !== String(Number(f.iva_perc ?? 22))) {
    const o = document.createElement('option');
    o.value = String(Number(f.iva_perc)); o.textContent = Number(f.iva_perc) + '%';
    ge('mfat-iva').appendChild(o); ge('mfat-iva').value = o.value;
  }
  ge('mfat-note').value = f.note || '';
  disegnaFattura();
  openM('m-fattura');
  if (modificabile) {
    const [prezzi, tariffa] = await Promise.all([prezziContrattoCliente(f.cliente_id), leggiTariffaOraria()]);
    if (!fatBozza || fatBozza.id !== f.id) return;
    fatBozza.prezzi = prezzi;
    fatBozza.tariffa = tariffa;
    disegnaAggiunteFattura();
  }
}

function preparaFinestraFattura(titolo) {
  ge('mfat-titolo').textContent = titolo;
  const iva = ge('mfat-iva');
  iva.innerHTML = ALIQUOTE_IVA.map(function(a) { return '<option value="' + a + '">' + a + '%</option>'; }).join('');
  ge('mfat-promemoria').innerHTML = '';
  ge('mfat-aggiungi').innerHTML = '';
  ge('mfat-totali').innerHTML = '';
  ge('mfat-errore').style.display = 'none';
  ge('mfat-salva').disabled = false;
}

function disegnaFattura() {
  const b = fatBozza;
  if (!b) return;
  const s = b.scheda;
  const f = b.fattura;
  let sotto = '<strong>' + esc(b.cliente) + '</strong>';
  if (s) sotto += '<br>Scheda di lavoro n. ' + esc(s.numero ?? '—') + ' del ' + esc(fd(s.data_intervento)) +
    (s.ordini_lavoro && s.ordini_lavoro.tipo ? ' · ' + esc(tl(s.ordini_lavoro.tipo)) : '') + ' ' + bs(s.stato);
  if (f) sotto += '<br>' + bs(f.stato) + ' ' + (f.numero ? 'n. <span style="font-family:monospace">' + esc(f.numero) + '</span>' + (f.data_emissione ? ' del ' + esc(fd(f.data_emissione)) : '') : '<span style="color:var(--m)">senza numero (lo assegna l\'emissione)</span>') +
    (f.stato !== 'bozza' ? ' ' + bsPag(f.stato_pagamento) : '');
  ge('mfat-sottotitolo').innerHTML = sotto;

  ge('mfat-info').style.display = b.modificabile ? 'block' : 'none';
  ge('mfat-iva').disabled = !b.modificabile;
  ge('mfat-note').disabled = !b.modificabile;
  ge('mfat-salva').style.display = b.modificabile ? '' : 'none';
  ge('mfat-elimina').style.display = b.modificabile && b.id ? '' : 'none';

  // Promemoria dal buono di lavoro (lavori fuori contratto)
  ge('mfat-promemoria').innerHTML = b.fuori && b.fuori.length
    ? '<details style="background:var(--al);border-radius:var(--rs);padding:8px 10px;margin-bottom:10px;font-size:12px;overflow-wrap:anywhere"><summary style="cursor:pointer;font-weight:600">⚠️ Dal buono di lavoro: ' + b.fuori.length + (b.fuori.length === 1 ? ' avviso' : ' avvisi') + ' (lavori fuori contratto)</summary>' +
      '<ul style="margin:6px 0 0;padding-left:18px">' + b.fuori.map(function(x) { return '<li style="margin-bottom:3px">' + esc(x.testo) + '</li>'; }).join('') + '</ul></details>'
    : '';

  disegnaRigheFattura();
  disegnaAggiunteFattura();
}

function disegnaRigheFattura() {
  const b = fatBozza;
  const el = ge('mfat-righe');
  if (!b || !el) return;
  if (!b.righe.length) {
    el.innerHTML = '<div class="empty" style="padding:12px">Nessuna riga' + (b.modificabile ? ': aggiungine una qui sotto' : '') + '</div>';
    aggiornaTotaliFattura();
    return;
  }
  el.innerHTML = b.righe.map(function(r, i) {
    const badge = '<span class="bx bgray" style="font-size:10px">' + esc(ETICHETTE_ORIGINE_RIGA[r.origine] || r.origine) + '</span>' +
      (r.fonte_prezzo ? ' <span class="bx ' + (r.fonte_prezzo === 'contratto' ? 'bok' : (r.fonte_prezzo === 'manuale' ? 'bwarn' : 'bblue')) + '" style="font-size:10px">' + esc(ETICHETTE_FONTE_PREZZO[r.fonte_prezzo] || r.fonte_prezzo) + '</span>' : '');
    const stile = 'border:0.5px solid var(--bo);border-radius:var(--rs);padding:8px;margin-bottom:6px;overflow-wrap:anywhere;' + (r.incl ? '' : 'opacity:.55;');
    if (!b.modificabile) {
      return '<div style="' + stile + '"><div style="font-size:13px">' + esc(r.descrizione) + '</div>' +
        '<div style="font-size:12px;color:var(--m);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:4px">' +
          '<span>' + esc(String(r.quantita).replace('.', ',')) + ' ' + esc(r.unita_misura || '') + ' × ' + esc(euroBuono(r.prezzo_unitario)) + (Number(r.sconto_perc) ? ' − ' + esc(String(r.sconto_perc).replace('.', ',')) + '%' : '') + '</span>' +
          '<strong>' + esc(euroBuono(r.totale_riga ?? totaleRigaBozza(r))) + '</strong></div>' +
        '<div style="margin-top:4px">' + badge + '</div></div>';
    }
    const dis = r.bloccata ? ' disabled' : '';
    return '<div style="' + stile + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin:0"><input type="checkbox"' + (r.incl ? ' checked' : '') + dis + ' onchange="cambiaRigaFattura(' + i + ',\'incl\',this.checked)"> In fattura</label>' +
        '<span style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">' + badge +
          (r.origine === 'scheda' || r.origine === 'ddt' ? '' : ' <button class="btn sm" type="button" title="Togli la riga" onclick="togliRigaFattura(' + i + ')">✕</button>') + '</span></div>' +
      '<textarea rows="2" maxlength="1000" style="width:100%;font-size:13px"' + dis + ' oninput="cambiaRigaFattura(' + i + ',\'descrizione\',this.value)">' + esc(r.descrizione) + '</textarea>' +
      '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:6px;align-items:end">' +
        '<div><div style="font-size:11px;color:var(--m)">Q.tà</div><input type="text" inputmode="decimal" value="' + esc(String(r.quantita).replace('.', ',')) + '"' + dis + ' oninput="cambiaRigaFattura(' + i + ',\'quantita\',this.value)" style="width:100%"></div>' +
        '<div><div style="font-size:11px;color:var(--m)">U.M.</div><input type="text" maxlength="20" value="' + esc(r.unita_misura || '') + '"' + dis + ' oninput="cambiaRigaFattura(' + i + ',\'unita_misura\',this.value)" style="width:100%"></div>' +
        '<div><div style="font-size:11px;color:var(--m)">Prezzo €</div><input type="text" inputmode="decimal" value="' + esc(String(r.prezzo_unitario).replace('.', ',')) + '"' + dis + ' oninput="cambiaRigaFattura(' + i + ',\'prezzo_unitario\',this.value)" style="width:100%"></div>' +
        '<div><div style="font-size:11px;color:var(--m)">Sconto %</div><input type="text" inputmode="decimal" value="' + esc(String(r.sconto_perc || 0).replace('.', ',')) + '"' + dis + ' oninput="cambiaRigaFattura(' + i + ',\'sconto_perc\',this.value)" style="width:100%"></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:12px">' +
        '<span style="color:var(--a)">' + esc(r.nota || '') + '</span>' +
        '<span>Totale riga: <strong data-mfat-tot="' + i + '">' + esc(euroBuono(totaleRigaBozza(r))) + '</strong></span></div>' +
    '</div>';
  }).join('');
  aggiornaTotaliFattura();
}

function disegnaAggiunteFattura() {
  const b = fatBozza;
  const el = ge('mfat-aggiungi');
  if (!b || !el) return;
  if (!b.modificabile) { el.innerHTML = ''; return; }
  const voci = b.prezzi && b.prezzi.preventivo ? (b.prezzi.voci || []) : [];
  let html = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0 12px">' +
    '<button class="btn sm" type="button" onclick="aggiungiRigaFattura()">+ Riga libera</button>' +
    '<button class="btn sm" type="button" onclick="aggiungiManodoperaFattura()">+ Manodopera</button>';
  if (voci.length) {
    html += '<select id="mfat-voce-contratto" style="flex:1;min-width:0;max-width:100%;font-size:12px"><option value="">Aggiungi una voce del contratto...</option>' +
      voci.map(function(vc) { return '<option value="' + esc(vc.id) + '">' + esc(vc.descrizione) + ' — ' + esc(euroBuono(vc.prezzo_unitario)) + (vc.unita_misura ? '/' + esc(vc.unita_misura) : '') + '</option>'; }).join('') +
      '</select><button class="btn sm" type="button" onclick="aggiungiVoceContrattoFattura()">+ Aggiungi</button>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function cambiaRigaFattura(i, campo, valore) {
  const r = fatBozza && fatBozza.righe[i];
  if (!r || r.bloccata) return;
  r[campo] = valore;
  if (campo === 'prezzo_unitario' && r.origine !== 'manuale') {
    const p = numeroDaCampo(valore);
    if (!isNaN(p) && Math.abs(p - (Number(r.prezzoProposto) || 0)) >= 0.005) {
      if (!r.fontePrimaManuale) r.fontePrimaManuale = r.fonte_prezzo || null;
      r.fonte_prezzo = 'manuale';
    } else if (r.fonte_prezzo === 'manuale' && Object.prototype.hasOwnProperty.call(r, 'fontePrimaManuale')) {
      r.fonte_prezzo = r.fontePrimaManuale;
    }
  }
  if (campo === 'incl') { disegnaRigheFattura(); return; }
  const t = document.querySelector('[data-mfat-tot="' + i + '"]');
  if (t) t.textContent = euroBuono(totaleRigaBozza(r));
  aggiornaTotaliFattura();
}

function togliRigaFattura(i) {
  if (!fatBozza) return;
  fatBozza.righe.splice(i, 1);
  disegnaRigheFattura();
}

function aggiungiRigaFattura() {
  if (!fatBozza) return;
  fatBozza.righe.push({ incl: true, origine: 'manuale', fonte_prezzo: 'manuale', ddt_id: null, descrizione: '', quantita: 1, unita_misura: '', prezzo_unitario: 0, prezzoProposto: 0, sconto_perc: 0, nota: '' });
  disegnaRigheFattura();
}

function aggiungiManodoperaFattura() {
  if (!fatBozza) return;
  fatBozza.righe.push(rigaManodopera(fatBozza.oreScheda || 1, fatBozza.tariffa, true, fatBozza.oreScheda ? '' : 'Ore lavorate non indicate nella scheda: scrivi le ore.'));
  disegnaRigheFattura();
}

function aggiungiVoceContrattoFattura() {
  const id = v('mfat-voce-contratto');
  if (!id) { toast('Scegli una voce del contratto', 'err'); return; }
  const vc = ((fatBozza && fatBozza.prezzi && fatBozza.prezzi.voci) || []).find(function(x) { return x.id === id; });
  if (!vc) return;
  const p = Number(vc.prezzo_unitario) || 0;
  fatBozza.righe.push({ incl: true, origine: 'contratto', fonte_prezzo: 'contratto', ddt_id: null, descrizione: vc.descrizione || '', quantita: 1, unita_misura: vc.unita_misura || '', prezzo_unitario: p, prezzoProposto: p, sconto_perc: 0, nota: '' });
  ge('mfat-voce-contratto').value = '';
  disegnaRigheFattura();
}

function aggiornaTotaliFattura() {
  const b = fatBozza;
  const el = ge('mfat-totali');
  if (!b || !el) return;
  let imp, iva, tot, ivaPerc;
  if (!b.modificabile && b.fattura) {
    imp = Number(b.fattura.totale_imponibile) || 0;
    iva = Number(b.fattura.totale_iva) || 0;
    tot = Number(b.fattura.totale) || 0;
    ivaPerc = Number(b.fattura.iva_perc ?? 22);
  } else {
    ivaPerc = Number(v('mfat-iva')) || 0;
    imp = arrotonda2(b.righe.filter(function(r) { return r.incl; }).reduce(function(t, r) { return t + totaleRigaBozza(r); }, 0));
    iva = arrotonda2(imp * ivaPerc / 100);
    tot = arrotonda2(imp + iva);
  }
  const n = b.righe.filter(function(r) { return r.incl; }).length;
  el.innerHTML = '<div style="display:flex;justify-content:space-between;font-size:13px"><span>Imponibile' + (b.modificabile ? ' (' + n + (n === 1 ? ' riga' : ' righe') + ')' : '') + '</span><span>' + esc(euroBuono(imp)) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:13px"><span>IVA ' + esc(String(ivaPerc).replace('.', ',')) + '%</span><span>' + esc(euroBuono(iva)) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;margin-top:4px"><span>Totale</span><span>' + esc(euroBuono(tot)) + '</span></div>' +
    (b.modificabile ? '<div style="font-size:11px;color:var(--m);margin-top:4px">I totali definitivi li calcola il database al salvataggio.</div>' : '');
}

function erroreFattura(msg) {
  const el = ge('mfat-errore');
  el.textContent = msg;
  el.style.display = 'block';
  el.scrollIntoView({ block: 'nearest' });
}

// opzioni.restaAperta (F11.2, js/44): salva senza chiudere la finestra e
// restituisce la risposta del database (null se non salvata), per emettere.
async function salvaBozzaFattura(opzioni) {
  const restaAperta = !!(opzioni && opzioni.restaAperta);
  const b = fatBozza;
  if (!b || !b.modificabile) return null;
  ge('mfat-errore').style.display = 'none';
  const scelte = b.righe.filter(function(r) { return r.incl && !r.bloccata; });
  if (!scelte.length) { erroreFattura('Spunta almeno una riga "In fattura".'); return null; }
  const righe = [];
  for (let k = 0; k < scelte.length; k++) {
    const r = scelte[k];
    const n = b.righe.indexOf(r) + 1;
    const descr = String(r.descrizione || '').trim();
    const q = numeroDaCampo(r.quantita), p = numeroDaCampo(r.prezzo_unitario);
    const sc = String(r.sconto_perc ?? '').trim() === '' ? 0 : numeroDaCampo(r.sconto_perc);
    if (!descr) { erroreFattura('Riga ' + n + ': scrivi la descrizione.'); return null; }
    if (isNaN(q) || q <= 0) { erroreFattura('Riga ' + n + ': la quantità deve essere un numero maggiore di zero.'); return null; }
    if (isNaN(p)) { erroreFattura('Riga ' + n + ': il prezzo deve essere un numero (anche 0).'); return null; }
    if (isNaN(sc) || sc < 0 || sc > 100) { erroreFattura('Riga ' + n + ': lo sconto va da 0 a 100.'); return null; }
    righe.push({
      descrizione: descr, quantita: arrotonda2(q), unita_misura: String(r.unita_misura || '').trim(),
      prezzo_unitario: arrotonda2(p), sconto_perc: arrotonda2(sc), origine: r.origine,
      fonte_prezzo: r.fonte_prezzo || null, ddt_id: r.ddt_id || null
    });
  }
  const iva = Number(v('mfat-iva'));
  if (isNaN(iva)) { erroreFattura('Scegli l\'aliquota IVA.'); return null; }
  const btn = ge('mfat-salva');
  btn.disabled = true;
  const { data, error } = await db.rpc('salva_bozza_fattura', {
    p_fattura_id: b.id,
    p_scheda_id: b.scheda ? b.scheda.id : null,
    p_iva_perc: iva,
    p_note: v('mfat-note') || null,
    p_righe: righe
  });
  btn.disabled = false;
  if (error) { erroreFattura('Non salvata: ' + (error.message || 'errore')); return null; }
  if (restaAperta) { b.id = data && data.id; return data; }
  closeM('m-fattura');
  toast((b.id ? 'Bozza aggiornata' : 'Bozza creata') + ' ✓ Totale ' + euroBuono(data && data.totale) + ' (senza numero: lo assegna l\'emissione)', 'ok');
  fatBozza = null;
  aggiornaDopoBozza();
  return data;
}

async function eliminaBozzaFattura() {
  const b = fatBozza;
  if (!b || !b.id || !b.modificabile) return;
  if (!confirm('Eliminare questa bozza di fattura? La scheda di lavoro torna tra quelle da fatturare.')) return;
  const { error } = await db.rpc('elimina_bozza_fattura', { p_fattura_id: b.id });
  if (error) { erroreFattura('Non eliminata: ' + (error.message || 'errore')); return; }
  closeM('m-fattura');
  toast('Bozza eliminata', 'ok');
  fatBozza = null;
  aggiornaDopoBozza();
}

// ── Workflow: bottone sulle schede fatturabili ───────────────────────────
const loadWorkflowPrimaBozze = loadWorkflow;
loadWorkflow = async function() {
  const r = await loadWorkflowPrimaBozze.apply(this, arguments);
  try { await decoraWorkflowBozze(); } catch (e) { console.warn('Bozze nel workflow:', e); }
  return r;
};

async function decoraWorkflowBozze() {
  if (!puoScrivereBozze() || !(await verificaFattureBozze())) return;
  const carte = [];
  ['list-a', 'list-i', 'list-d'].forEach(function(lista) {
    document.querySelectorAll('#' + lista + ' > .card').forEach(function(card) {
      const b = card.querySelector('button[onclick^="openScheda("]');
      const m = b && /openScheda\('([^']+)'\)/.exec(b.getAttribute('onclick'));
      if (m) carte.push({ card: card, id: m[1], azioni: b.parentElement });
    });
  });
  if (!carte.length) return;
  const gia = await fattureAttivePerScheda(carte.map(function(c) { return c.id; }));
  if (!gia) return;
  carte.forEach(function(c) {
    if (c.azioni.querySelector('.btn-bozza-fattura')) return;
    const f = gia[c.id];
    const btn = document.createElement('button');
    btn.className = 'btn sm btn-bozza-fattura' + (f ? '' : ' info');
    btn.dataset.id = f ? f.id : c.id;
    btn.textContent = f ? (f.stato === 'bozza' ? '🧾 Apri bozza' : '🧾 Fattura ' + (f.numero || '')) : '🧾 Crea bozza fattura';
    btn.onclick = f ? function() { apriFattura(this.dataset.id); } : function() { apriBozzaDaScheda(this.dataset.id); };
    c.azioni.appendChild(btn);
  });
}

// ── Finestra della scheda: riga "Fattura" nel buono di lavoro (js/42) ─────
const caricaBuonoLavoroSchedaPrimaBozze = caricaBuonoLavoroScheda;
caricaBuonoLavoroScheda = async function(id) {
  const r = await caricaBuonoLavoroSchedaPrimaBozze.apply(this, arguments);
  try { await mostraFatturaNelBuono(id); } catch (e) { console.warn('Fattura nel buono:', e); }
  return r;
};

async function mostraFatturaNelBuono(schedaId) {
  const el = ge('ms-buono-fattura');
  if (!el || !(await verificaFattureBozze())) return;
  const { data: s } = await db.from('schede_lavoro').select('id,stato,impossibilitato').eq('id', schedaId).maybeSingle();
  if (!s || s.impossibilitato) return;
  const gia = await fattureAttivePerScheda([schedaId]);
  if (!gia || !ge('m-scheda').classList.contains('on')) return;
  const f = gia[schedaId];
  let html;
  if (f) {
    html = '🧾 ' + (f.stato === 'bozza' ? 'Bozza di fattura preparata (senza numero)' : 'Fattura ' + esc(f.numero || '') + ' ' + bs(f.stato)) +
      ' <button class="btn sm" data-id="' + esc(f.id) + '" onclick="apriFattura(this.dataset.id)">' + (f.stato === 'bozza' && puoScrivereBozze() ? 'Apri bozza' : 'Vedi') + '</button>';
  } else if (s.stato === 'fatturata') {
    html = 'Segnata "fatturata" senza fattura nel gestionale (fattura emessa fuori).';
  } else if (puoScrivereBozze() && STATI_SCHEDA_FATTURABILE.includes(s.stato)) {
    html = 'Nessuna fattura ancora. <button class="btn sm info" data-id="' + esc(s.id) + '" onclick="apriBozzaDaScheda(this.dataset.id)">🧾 Crea bozza fattura</button>';
  } else {
    html = 'Nessuna fattura ancora: la bozza la preparano segreteria o contabile quando la scheda è approvata.';
  }
  el.innerHTML = html;
  el.style.color = '';
  el.style.fontSize = '12px';
}
