// =====================================================================
// js/69-sconto-rappresentante.js — Sconto del rappresentante sul
// preventivo (sql/258, decisioni di Erika del 10/11/2026).
//
// Quando il preventivo è in "I miei preventivi" (stato
// inviato_a_rappresentante, prima dell'esito del cliente) il rappresentante
// del cliente scrive una percentuale di sconto (con la virgola). Fino al 2%
// la motivazione è facoltativa, sopra il 2% obbligatoria: la leggono solo
// lui e il titolare (tabella preventivi_sconti, RLS). Il database ricalcola
// il totale (preventivi.totale_imponibile = scontato, totale_prima_sconto =
// somma delle voci): commessa, anticipo e fattura finale usano da soli
// l'importo scontato. Subito dopo il sito rifà il PDF per il cliente con
// lo sconto (dati_pdf_preventivo_cliente → generaPreventivoClientePDF di
// js/18 → <id>/cliente/ → registra_pdf_preventivo_cliente).
//
// Agganci: js/13 (segnaposto .sconto-rapp nelle schede di "I miei
// preventivi" + caricaScontiRappresentante), js/18 (segnaposto pvd-sconto
// nel riepilogo + caricaScontoPreventivoDettaglio; il PDF legge
// sconto_perc). Senza sql/258: nessun riquadro, nessun errore (una
// chiamata RPC 404).
// Futuro (NON fatto): F16.1 (margine 29%) e F16.42 (sconti degli agenti)
// ridefiniscono nel database controllo_sconto_preventivo: il messaggio di
// blocco arriva qui come errore della RPC e si mostra così com'è.
// =====================================================================

let scontoRappresentanteAttivoCache = null;
const SCONTI_PREVENTIVI = {};
const SOGLIA_MOTIVAZIONE_SCONTO = 2;

async function verificaScontoRappresentanteDisponibile() {
  if (scontoRappresentanteAttivoCache !== null) return scontoRappresentanteAttivoCache;
  try {
    const { data, error } = await db.rpc('sconto_rappresentante_attivo');
    scontoRappresentanteAttivoCache = !error && data === true;
  } catch (e) {
    scontoRappresentanteAttivoCache = false;
  }
  return scontoRappresentanteAttivoCache;
}

// "2,5" / "2.5" / "2,5 %" → 2.5; vuoto → 0; non valido → NaN
function numeroScontoDaTesto(testo) {
  const t = String(testo ?? '').replace(/%/g, '').replace(/\s/g, '').replace(',', '.');
  if (t === '') return 0;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return NaN;
  return Number(t);
}

function testoPercSconto(n) {
  return String(Number(n || 0)).replace('.', ',') + '%';
}

function euroSconto(valore) {
  return Number(valore || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

// Stessa regola del database: round(round(prima, 2) * (100 - sconto) / 100, 2)
// (importoScontatoPreventivo di js/18, in centesimi interi)
function totaleScontatoSito(base, sconto) {
  if (typeof importoScontatoPreventivo === 'function') return importoScontatoPreventivo(base, sconto);
  if (!(sconto > 0)) return Number(base || 0);
  return Math.round(Math.round(Number(base || 0) * 100) * (100 - sconto)) / 10000;
}

function dataOraSconto(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function pdfSenzaSconto(p) {
  if (!p || !p.sconto_il || p.pdf_esterno_titolare_path) return false;
  return !p.preventivo_cliente_pdf_generato_il ||
    new Date(p.preventivo_cliente_pdf_generato_il) < new Date(p.sconto_il);
}

function basePreventivoSconto(p) {
  return Number(p.sconto_perc) > 0 && p.totale_prima_sconto != null
    ? Number(p.totale_prima_sconto) : Number(p.totale_imponibile || 0);
}

const COLONNE_SCONTO_PREVENTIVO =
  'id,numero,stato,totale_imponibile,iva_perc,sconto_perc,totale_prima_sconto,sconto_da,sconto_da_nome,sconto_il,' +
  'preventivo_cliente_pdf_generato_il,pdf_esterno_titolare_path,clienti(ragione_sociale)';

// ---------------------------------------------------------------------
// "I miei preventivi" (js/13): riquadro dello sconto in ogni scheda
// ---------------------------------------------------------------------
async function caricaScontiRappresentante(contenitore) {
  if (!contenitore || ROLE !== 'rappresentante') return;
  const posti = Array.from(contenitore.querySelectorAll('.sconto-rapp[data-preventivo]'));
  if (!posti.length) return;
  if (!(await verificaScontoRappresentanteDisponibile())) return;

  const ids = posti.map(function(el) { return el.dataset.preventivo; });
  const [prevRes, motRes] = await Promise.all([
    db.from('preventivi').select(COLONNE_SCONTO_PREVENTIVO).in('id', ids),
    // RLS: il rappresentante legge solo le righe scritte da lui
    db.from('preventivi_sconti').select('preventivo_id,sconto_perc,motivazione,il').in('preventivo_id', ids)
      .order('il', { ascending: false })
  ]);
  if (prevRes.error) { console.warn('Sconti dei preventivi:', prevRes.error.message); return; }

  const ultimaMotivazione = {};
  (motRes.data || []).forEach(function(r) {
    if (!(r.preventivo_id in ultimaMotivazione)) ultimaMotivazione[r.preventivo_id] = r;
  });

  (prevRes.data || []).forEach(function(p) {
    p.ultima_riga_mia = ultimaMotivazione[p.id] || null;
    SCONTI_PREVENTIVI[p.id] = p;
    const el = posti.find(function(x) { return x.dataset.preventivo === p.id; });
    if (el) el.innerHTML = htmlScontoRappresentante(p);
  });
}

function htmlScontoRappresentante(p) {
  const sconto = Number(p.sconto_perc || 0);
  const iva = Number(p.iva_perc ?? 22);
  const base = basePreventivoSconto(p);
  const totale = Number(p.totale_imponibile || 0);
  const conIva = Math.round(totale * (100 + iva)) / 100;
  const mia = p.ultima_riga_mia;

  let righe;
  if (sconto > 0) {
    righe = `
      <div style="font-size:13px">
        🏷️ Sconto <b>${esc(testoPercSconto(sconto))}</b>:
        ${esc(euroSconto(base))} → <b>${esc(euroSconto(totale))}</b> + IVA
        <span style="color:var(--m)">(${esc(euroSconto(conIva))} IVA inclusa)</span>
      </div>
      ${mia && mia.motivazione && Number(mia.sconto_perc) === sconto ? `
        <div style="font-size:12px;color:var(--m);margin-top:4px">
          La tua motivazione (la vedete solo tu e il titolare): ${esc(mia.motivazione)}
        </div>` : ''}`;
  } else {
    righe = `
      <div style="font-size:13px">
        Totale: <b>${esc(euroSconto(totale))}</b> + IVA
        <span style="color:var(--m)">(${esc(euroSconto(conIva))} IVA inclusa)</span>
      </div>`;
  }

  const avvisoPdf = pdfSenzaSconto(p) ? `
    <div class="al2 w" style="margin-top:8px">
      ⚠️ Il PDF non ha ancora ${sconto > 0 ? 'lo sconto' : 'il totale senza sconto'}: rifallo prima di mandarlo al cliente.
      <div style="margin-top:6px"><button class="btn sm p" onclick="rifaiPdfScontoPreventivo('${p.id}')">📄 Rifai il PDF</button></div>
    </div>` : '';

  const bottone = p.pdf_esterno_titolare_path
    ? '<div style="font-size:12px;color:var(--m);margin-top:6px">Il PDF l\'ha caricato il titolare: per uno sconto chiedi a lui.</div>'
    : `<button class="btn sm" style="margin-top:8px" onclick="apriScontoRappresentante('${p.id}')">
         ${sconto > 0 ? '✏️ Cambia lo sconto' : '🏷️ Applica uno sconto'}
       </button>`;

  return `
    <div style="margin-top:12px;padding-top:10px;border-top:0.5px solid rgba(0,0,0,.08)">
      ${righe}
      ${avvisoPdf}
      ${bottone}
    </div>`;
}

// ---------------------------------------------------------------------
// Finestra dello sconto (rappresentante e titolare)
// ---------------------------------------------------------------------
async function apriScontoRappresentante(preventivoId) {
  if (!(await verificaScontoRappresentanteDisponibile())) {
    toast('Lo sconto del rappresentante non è ancora attivo', 'err');
    return;
  }
  const { data: p, error } = await db.from('preventivi').select(COLONNE_SCONTO_PREVENTIVO).eq('id', preventivoId).maybeSingle();
  if (error || !p) { toast('Preventivo non disponibile: ' + (error?.message || ''), 'err'); return; }
  if (p.stato !== 'inviato_a_rappresentante') {
    toast('Lo sconto si mette solo prima dell\'esito del cliente, con il preventivo inviato al rappresentante', 'err');
    return;
  }
  const precedente = SCONTI_PREVENTIVI[p.id];
  p.ultima_riga_mia = precedente ? precedente.ultima_riga_mia : null;
  if (!p.ultima_riga_mia) {
    const { data: righe } = await db.from('preventivi_sconti').select('sconto_perc,motivazione,il,da_id')
      .eq('preventivo_id', p.id).order('il', { ascending: false }).limit(1);
    p.ultima_riga_mia = righe && righe[0] && righe[0].da_id === ME?.id ? righe[0] : null;
  }
  SCONTI_PREVENTIVI[p.id] = p;

  const sconto = Number(p.sconto_perc || 0);
  ge('scr-preventivo-id').value = p.id;
  ge('scr-sottotitolo').textContent = 'Preventivo n. ' + (p.numero ?? '—') + ' · ' + (p.clienti?.ragione_sociale || 'Cliente');
  ge('scr-base').textContent = euroSconto(basePreventivoSconto(p)) + ' + IVA ' + Number(p.iva_perc ?? 22) + '%';
  ge('scr-perc').value = sconto > 0 ? String(sconto).replace('.', ',') : '';
  ge('scr-motivo').value = p.ultima_riga_mia && p.ultima_riga_mia.motivazione && Number(p.ultima_riga_mia.sconto_perc) === sconto
    ? p.ultima_riga_mia.motivazione : '';
  ge('scr-togli').style.display = sconto > 0 ? '' : 'none';
  ge('scr-titolare-pdf').style.display = p.pdf_esterno_titolare_path ? '' : 'none';
  aggiornaAnteprimaScontoRappresentante();
  openM('m-sconto-rappresentante');
  setTimeout(function() { try { ge('scr-perc').focus(); } catch (e) {} }, 50);
}

function aggiornaAnteprimaScontoRappresentante() {
  const p = SCONTI_PREVENTIVI[ge('scr-preventivo-id').value];
  if (!p) return;
  const box = ge('scr-anteprima');
  const s = numeroScontoDaTesto(ge('scr-perc').value);
  const motivo = String(ge('scr-motivo').value || '').trim();
  const base = basePreventivoSconto(p);
  const iva = Number(p.iva_perc ?? 22);
  const serveMotivo = s > SOGLIA_MOTIVAZIONE_SCONTO;

  ge('scr-motivo-etichetta').textContent = serveMotivo
    ? 'Motivazione dello sconto * (sopra il 2% è obbligatoria)'
    : 'Motivazione dello sconto (facoltativa fino al 2%)';

  let ok = true;
  if (Number.isNaN(s)) {
    box.className = 'al2 e';
    box.innerHTML = 'Scrivi la percentuale come numero, con al massimo due decimali (es. 2,5).';
    ok = false;
  } else if (!(s > 0)) {
    box.className = 'al2 i';
    box.innerHTML = 'Scrivi la percentuale di sconto (es. 1,5).';
    ok = false;
  } else if (s >= 100) {
    box.className = 'al2 e';
    box.innerHTML = 'Lo sconto deve essere meno di 100%.';
    ok = false;
  } else {
    const dopo = totaleScontatoSito(base, s);
    const conIva = Math.round(dopo * (100 + iva)) / 100;
    box.className = 'al2 ok';
    box.innerHTML = `Sconto <b>${esc(testoPercSconto(s))}</b>: − ${esc(euroSconto(base - dopo))}<br>` +
      `Totale scontato: <b>${esc(euroSconto(dopo))}</b> + IVA (${esc(euroSconto(conIva))} IVA inclusa)`;
    if (serveMotivo && motivo.length < 3) ok = false;
  }
  ge('scr-salva').disabled = !ok || motivo.length > 1000;
}

async function salvaScontoRappresentante(togli) {
  const id = ge('scr-preventivo-id').value;
  const p = SCONTI_PREVENTIVI[id];
  if (!id || !p) return;
  const s = togli ? 0 : numeroScontoDaTesto(ge('scr-perc').value);
  const motivo = String(ge('scr-motivo').value || '').trim();
  if (!togli && !(s > 0 && s < 100)) { toast('Percentuale non valida', 'err'); return; }
  if (!togli && s > SOGLIA_MOTIVAZIONE_SCONTO && motivo.length < 3) {
    toast('Sopra il 2% serve la motivazione', 'err');
    return;
  }
  if (togli && !confirm('Togliere lo sconto? Il preventivo torna a ' + euroSconto(basePreventivoSconto(p)) + ' + IVA e il PDF va rifatto.')) return;

  ['scr-salva', 'scr-togli'].forEach(function(x) { if (ge(x)) ge(x).disabled = true; });
  try {
    const { data, error } = await db.rpc('applica_sconto_preventivo', {
      p_preventivo: id, p_sconto: s, p_motivazione: togli ? (motivo || null) : (motivo || null)
    });
    if (error) { toast('Sconto non salvato: ' + error.message, 'err'); return; }
    closeM('m-sconto-rappresentante');
    toast(s > 0
      ? 'Sconto ' + testoPercSconto(s) + ' salvato: totale ' + euroSconto(data?.totale_imponibile) + ' + IVA. Rifaccio il PDF...'
      : 'Sconto tolto. Rifaccio il PDF...', 'ok');
    if (!p.pdf_esterno_titolare_path) await rifaiPdfScontoPreventivo(id, true);
    else toast('Il PDF l\'hai caricato tu: ricaricalo con il nuovo totale', 'err');
    await aggiornaDopoScontoPreventivo(id);
  } finally {
    ['scr-salva', 'scr-togli'].forEach(function(x) { if (ge(x)) ge(x).disabled = false; });
  }
}

// PDF per il cliente rifatto con lo sconto (stesso modello di js/18)
async function rifaiPdfScontoPreventivo(preventivoId, senzaAggiornare) {
  if (typeof generaPreventivoClientePDF !== 'function') { toast('Funzione del PDF non disponibile', 'err'); return false; }
  const letto = await db.rpc('dati_pdf_preventivo_cliente', { p_preventivo: preventivoId });
  if (letto.error || !letto.data?.preventivo) {
    toast('PDF non rifatto: ' + (letto.error?.message || 'dati non disponibili'), 'err');
    return false;
  }
  const pdf = await generaPreventivoClientePDF({ preventivo: letto.data.preventivo, voci: letto.data.voci || [] });
  if (!pdf || !pdf.blob) { toast('PDF non creato: riprova con "📄 Rifai il PDF"', 'err'); return false; }

  // Nome del file legato allo sconto attuale (sql/258: il database accetta
  // solo "<prefisso dello sconto>....pdf" caricato dopo lo sconto).
  const prefisso = letto.data.preventivo.prefisso_pdf;
  if (!prefisso) { toast('PDF non rifatto: il preventivo non ha uno sconto', 'err'); return false; }
  const nomeFile = prefisso + Date.now() + '.pdf';
  const percorso = preventivoId + '/cliente/' + nomeFile;
  const up = await db.storage.from('preventivi-documenti').upload(percorso, pdf.blob, { contentType: 'application/pdf', upsert: false });
  if (up.error) { toast('PDF creato ma non salvato: ' + up.error.message, 'err'); return false; }

  const reg = await db.rpc('registra_pdf_preventivo_cliente', {
    p_preventivo: preventivoId, p_path: percorso, p_nome: nomeFile
  });
  if (reg.error) { toast('PDF salvato, ma non collegato al preventivo: ' + reg.error.message, 'err'); return false; }

  toast('PDF per il cliente rifatto con il totale giusto: è quello di "📄 Apri / scarica PDF"', 'ok');
  if (!senzaAggiornare) await aggiornaDopoScontoPreventivo(preventivoId);
  return true;
}

async function aggiornaDopoScontoPreventivo(preventivoId) {
  try {
    if (ge('pg-preventivi-rapp')?.classList.contains('on') && typeof loadPreventiviRappresentante === 'function') {
      await loadPreventiviRappresentante();
    }
    if (ge('pg-preventivo-detail')?.classList.contains('on') && typeof openPreventivoDetail === 'function' &&
        typeof currentPreventivoId !== 'undefined' && currentPreventivoId === preventivoId) {
      await openPreventivoDetail(preventivoId);
    }
  } catch (e) {
    console.warn('Aggiornamento dopo lo sconto:', e);
  }
}

// ---------------------------------------------------------------------
// Scheda del preventivo (js/18): chi la vede legge lo sconto; la
// motivazione solo il titolare (RLS).
// ---------------------------------------------------------------------
async function caricaScontoPreventivoDettaglio(preventivo, contenitoreId) {
  const box = ge(contenitoreId);
  if (!box || !preventivo) return;
  box.innerHTML = '';
  if (!(await verificaScontoRappresentanteDisponibile())) return;
  if (!('sconto_il' in preventivo)) return;

  const sconto = Number(preventivo.sconto_perc || 0);
  const puoCambiare = ROLE === 'titolare' && preventivo.stato === 'inviato_a_rappresentante';
  if (!(sconto > 0) && !preventivo.sconto_il && !puoCambiare) return;

  let motivazioni = '';
  if (ROLE === 'titolare' && preventivo.sconto_il) {
    const { data: righe } = await db.from('preventivi_sconti')
      .select('sconto_perc,sconto_prima,totale_prima_sconto,totale_scontato,motivazione,da_nome,da_ruolo,il')
      .eq('preventivo_id', preventivo.id).order('il', { ascending: false });
    if (righe && righe.length) {
      const ultima = righe[0];
      motivazioni = `
        <div style="font-size:12px;margin-top:8px">
          <b>Motivazione</b> <span style="color:var(--m)">(la vedete solo tu e il rappresentante che l'ha scritta)</span>:
          ${ultima.motivazione ? esc(ultima.motivazione) : '<i>nessuna (fino al 2% è facoltativa)</i>'}
        </div>
        ${righe.length > 1 ? `
          <details style="margin-top:6px;font-size:12px">
            <summary>▸ Tutti i cambi dello sconto (${righe.length})</summary>
            ${righe.map(function(r) {
              return `<div style="padding:4px 0;border-bottom:0.5px solid rgba(0,0,0,.05)">
                ${esc(dataOraSconto(r.il))} · ${esc(r.da_nome || '—')}${r.da_ruolo ? ' (' + esc(r.da_ruolo) + ')' : ''}:
                ${esc(testoPercSconto(r.sconto_prima))} → <b>${esc(testoPercSconto(r.sconto_perc))}</b>,
                ${esc(euroSconto(r.totale_prima_sconto))} → ${esc(euroSconto(r.totale_scontato))}
                ${r.motivazione ? '<br><span style="color:var(--m)">' + esc(r.motivazione) + '</span>' : ''}
              </div>`;
            }).join('')}
          </details>` : ''}`;
    }
  } else if (sconto > 0) {
    motivazioni = '<div style="font-size:12px;color:var(--m);margin-top:6px">La motivazione dello sconto la leggono solo il titolare e il rappresentante.</div>';
  }

  const chi = preventivo.sconto_il
    ? (preventivo.sconto_da_nome || 'Rappresentante') + ' il ' + dataOraSconto(preventivo.sconto_il)
    : '';
  const testo = sconto > 0
    ? `Sconto <b>${esc(testoPercSconto(sconto))}</b>: totale delle voci ${esc(euroSconto(preventivo.totale_prima_sconto))}
       → imponibile <b>${esc(euroSconto(preventivo.totale_imponibile))}</b>
       (− ${esc(euroSconto(Number(preventivo.totale_prima_sconto || 0) - Number(preventivo.totale_imponibile || 0)))})`
    : (preventivo.sconto_il ? 'Sconto tolto: il totale è quello delle voci.' : 'Nessuno sconto.');

  const avvisoVoci = sconto > 0 && ['commerciale', 'titolare'].includes(ROLE) ? `
    <div style="font-size:12px;color:var(--m);margin-top:6px">
      Il totale del preventivo è già scontato (commessa, anticipo e fattura finale usano questo).
      Se cambi le voci lo sconto si rimette sul nuovo totale; il PDF per il cliente mostra sconto e totale scontato.
    </div>` : '';

  const pdfVecchio = pdfSenzaSconto(preventivo) && preventivo.stato === 'inviato_a_rappresentante' ? `
    <div class="al2 w" style="margin-top:8px">⚠️ Il PDF per il cliente è di prima dell'ultimo cambio dello sconto: va rifatto.
      ${ROLE === 'titolare' ? `<button class="btn sm p" style="margin-left:6px" onclick="rifaiPdfScontoPreventivo('${preventivo.id}')">📄 Rifai il PDF</button>` : ''}
    </div>` : '';

  box.innerHTML = `
    <div class="card" style="margin-top:16px;border-left:4px solid #d97706">
      <div style="font-size:14px;font-weight:700">🏷️ Sconto del rappresentante</div>
      <div style="font-size:13px;margin-top:6px">${testo}</div>
      ${chi ? `<div style="font-size:12px;color:var(--m);margin-top:4px">Ultimo cambio: ${esc(chi)}</div>` : ''}
      ${motivazioni}
      ${avvisoVoci}
      ${pdfVecchio}
      ${puoCambiare ? `<button class="btn sm" style="margin-top:10px" onclick="apriScontoRappresentante('${preventivo.id}')">
        ${sconto > 0 ? '✏️ Cambia lo sconto' : '🏷️ Applica uno sconto'}</button>` : ''}
    </div>`;
}
