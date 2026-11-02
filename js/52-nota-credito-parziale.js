// =====================================================================
// js/52-nota-credito-parziale.js — nota di credito PARZIALE (decisione di
// Toli del 02/11, risposta 4: "va bene parziale"). Con sql/54.
//
// Nella fattura emessa il bottone "🔁 Nota di credito" apre la finestra
// m-nota-credito con due scelte:
//   - "Storno totale": come prima (emetti_nota_credito, sql/46). Solo senza
//     pagamenti, senza rate in RIBA e senza note parziali già emesse;
//   - "Storno parziale": righe della fattura (quantità e prezzo non oltre
//     quelli fatturati) e/o righe libere, stessa IVA della fattura, motivo
//     obbligatorio (emetti_nota_credito_parziale, sql/54). Vale solo sul
//     non ancora incassato: le rate si riducono dall'ultima scadenza.
// Nella fattura: elenco delle note di credito emesse e quanto resta da
// stornare. Senza sql/54 tutto come prima (solo storno totale).
// Va caricato dopo js/44 e js/45.
// =====================================================================

let notaCreditoParzialeDisponibile = null;
let statoNotaCredito = null; // { f, righe, libere, stornabile, incassabile, inRiba, totalePossibile, motivoNoTotale }

async function verificaNotaCreditoParziale() {
  if (notaCreditoParzialeDisponibile !== null) return notaCreditoParzialeDisponibile;
  // Chiamata senza effetti: la funzione si ferma su "Fattura non trovata".
  const { error } = await db.rpc('emetti_nota_credito_parziale', {
    p_fattura_id: '00000000-0000-0000-0000-000000000000', p_data: null, p_motivo: null, p_righe: null
  });
  if (!error) return false;
  if (error.code === 'PGRST202' || /could not find the function/i.test(error.message || '')) {
    notaCreditoParzialeDisponibile = false;
  } else if (/non trovata|non consentita/i.test(error.message || '')) {
    notaCreditoParzialeDisponibile = true;
  } else {
    return false; // errore momentaneo: si riprova la prossima volta
  }
  return notaCreditoParzialeDisponibile;
}

function euroNC(n) { return euroBuono(arrotonda2(n)); }

// Note di credito emesse sulla fattura, rate e pagamenti: quanto si può
// ancora stornare e quanto resta da incassare fuori dalla RIBA.
async function leggiSituazioneNotaCredito(f) {
  const [rn, rs, rp] = await Promise.all([
    db.from('fatture').select('id,numero,data_emissione,totale,totale_imponibile,note')
      .eq('riferimento_fattura_id', f.id).eq('tipo_documento', 'nota_credito').eq('stato', 'emessa')
      .is('eliminato_il', null).order('data_emissione', { ascending: true }).order('numero', { ascending: true }),
    db.from('fatture_scadenze').select('id,importo,importo_pagato,stato').eq('fattura_id', f.id),
    db.from('fatture_pagamenti').select('id').eq('fattura_id', f.id).is('annullato_il', null).limit(1)
  ]);
  if (rn.error || rs.error || rp.error) return null;
  const note = rn.data || [];
  const gia = note.reduce(function(t, n) { return t + (Number(n.totale) || 0); }, 0);
  let incassabile = 0, inRiba = 0;
  (rs.data || []).forEach(function(s) {
    if (s.stato === 'pagata') return;
    const r = residuoRata(s);
    if (s.stato === 'in_riba') inRiba += r; else incassabile += r;
  });
  return {
    note: note,
    stornabile: arrotonda2((Number(f.totale) || 0) - gia),
    incassabile: arrotonda2(incassabile),
    inRiba: arrotonda2(inRiba),
    pagamenti: (rp.data || []).length > 0
  };
}

function puoNotaCreditoRuolo(f) {
  return puoGestirePagamenti() && (f.origine === 'scheda' || ROLE !== 'contabile');
}

// ── Nella fattura: note emesse e bottone ─────────────────────────────────
(function() {
  if (typeof caricaScadenzeNellaFattura !== 'function') return;
  const caricaScadenzePrimaNC = caricaScadenzeNellaFattura;
  caricaScadenzeNellaFattura = async function(f) {
    const r = await caricaScadenzePrimaNC.apply(this, arguments);
    try {
      if (!f || f.tipo_documento !== 'fattura' || f.stato === 'bozza') return r;
      if (!(await verificaNotaCreditoParziale())) return r;
      const sit = await leggiSituazioneNotaCredito(f);
      if (!sit || !fatBozza || fatBozza.id !== f.id) return r;
      const box = ge('mfat-emessa');
      if (box && sit.note.length && f.stato === 'emessa') {
        box.insertAdjacentHTML('afterbegin',
          '<div class="card" style="margin-bottom:10px;font-size:13px;overflow-wrap:anywhere">' +
            '<div style="font-weight:600;margin-bottom:4px">🔁 Note di credito parziali</div>' +
            sit.note.map(function(n) {
              return '<div style="margin:2px 0">n. ' + esc(n.numero || '') + ' del ' + esc(fd(n.data_emissione)) + ' · ' + esc(euroNC(n.totale)) +
                ' <button class="btn sm" data-id="' + esc(n.id) + '" onclick="apriFattura(this.dataset.id)">Vedi</button></div>';
            }).join('') +
            '<div style="font-size:12px;color:var(--m);margin-top:4px">Resta da stornare ' + esc(euroNC(sit.stornabile)) + ' (IVA compresa)</div>' +
          '</div>');
      }
      const bNc = ge('mfat-nota-credito');
      if (!bNc) return r;
      const parziale = f.stato === 'emessa' && puoNotaCreditoRuolo(f) && sit.stornabile > 0 && sit.incassabile > 0;
      if (parziale) {
        bNc.style.display = '';
        bNc.textContent = '🔁 Nota di credito';
      }
    } catch (e) { console.warn('Nota di credito parziale:', e); }
    return r;
  };
})();

// ── Finestra ────────────────────────────────────────────────────────────
(function() {
  if (typeof apriNotaCredito !== 'function') return;
  const apriNotaCreditoTotale = apriNotaCredito;
  apriNotaCredito = async function() {
    const f = fatBozza && fatBozza.fattura;
    const tipoBox = ge('mnc-tipo-box');
    if (tipoBox) tipoBox.style.display = 'none';
    if (ge('mnc-parziale')) ge('mnc-parziale').style.display = 'none';
    if (ge('mnc-conferma-testo')) ge('mnc-conferma-testo').textContent = 'Confermo: la nota di credito storna tutta la fattura, che diventa annullata';
    statoNotaCredito = null;
    if (!f || !(await verificaNotaCreditoParziale())) return apriNotaCreditoTotale.apply(this, arguments);

    const [sit, rr] = await Promise.all([
      leggiSituazioneNotaCredito(f),
      db.from('fatture_righe').select('id,ordine_riga,descrizione,quantita,unita_misura,prezzo_unitario,sconto_perc')
        .eq('fattura_id', f.id).order('ordine_riga', { ascending: true })
    ]);
    if (!sit || rr.error) { toast('Dati della fattura non leggibili', 'err'); return; }
    let motivoNoTotale = '';
    if (sit.note.length) motivoNoTotale = 'ci sono già note di credito parziali';
    else if (sit.pagamenti) motivoNoTotale = 'ci sono pagamenti registrati';
    else if (sit.inRiba > 0) motivoNoTotale = 'una rata è in una RIBA presentata';
    statoNotaCredito = {
      f: f, sit: sit, libere: [],
      righe: (rr.data || []).map(function(r) {
        return { id: r.id, descrizione: r.descrizione || '', unita_misura: r.unita_misura || '',
          quantitaMax: Number(r.quantita) || 0, prezzoMax: Number(r.prezzo_unitario) || 0,
          sconto: Number(r.sconto_perc) || 0, sel: false,
          quantita: Number(r.quantita) || 0, prezzo: Number(r.prezzo_unitario) || 0 };
      }),
      totalePossibile: !motivoNoTotale && puoNotaCreditoRuolo(f),
      motivoNoTotale: motivoNoTotale
    };
    apriNotaCreditoTotale.apply(this, arguments);
    if (!ge('m-nota-credito').classList.contains('on')) return;
    if (tipoBox) tipoBox.style.display = '';
    ge('mnc-tipo-totale').disabled = !statoNotaCredito.totalePossibile;
    ge('mnc-tipo-totale-nota').textContent = statoNotaCredito.totalePossibile ? '' : ' (non disponibile: ' + motivoNoTotale + ')';
    ge('mnc-tipo-parziale').disabled = !(sit.stornabile > 0 && sit.incassabile > 0);
    ge('mnc-tipo-parziale-nota').textContent = ge('mnc-tipo-parziale').disabled
      ? ' (non disponibile: niente da incassare fuori dalla RIBA)'
      : ' (fino a ' + euroNC(Math.min(sit.stornabile, sit.incassabile)) + ' IVA compresa)';
    const tipo = statoNotaCredito.totalePossibile ? 'totale' : 'parziale';
    ge('mnc-tipo-' + tipo).checked = true;
    cambiaTipoNotaCredito(tipo);
  };
})();

function cambiaTipoNotaCredito(tipo) {
  const s = statoNotaCredito;
  if (!s) return;
  s.tipo = tipo;
  const f = s.f;
  const parz = tipo === 'parziale';
  ge('mnc-parziale').style.display = parz ? '' : 'none';
  ge('mnc-conferma-testo').textContent = parz
    ? 'Confermo: la nota di credito storna le righe scelte e riduce quanto il cliente deve ancora pagare'
    : 'Confermo: la nota di credito storna tutta la fattura, che diventa annullata';
  if (parz) {
    ge('mnc-riepilogo').innerHTML = 'Fattura <b>n. ' + esc(f.numero) + '</b> del ' + esc(fd(f.data_emissione)) + ' · totale ' + esc(euroNC(f.totale)) +
      '<br>Storno parziale: scegli le righe (o aggiungi una riga libera). La fattura resta emessa; si riducono le rate ancora da incassare, partendo dall\'ultima. ' +
      'Resta da stornare ' + esc(euroNC(s.sit.stornabile)) + ', da incassare ' + esc(euroNC(s.sit.incassabile)) +
      (s.sit.inRiba > 0 ? ' (più ' + esc(euroNC(s.sit.inRiba)) + ' in RIBA, che non si toccano)' : '') + '.';
    disegnaRigheNotaCredito();
  } else {
    // testo dello storno totale di js/44
    const effetto = f.origine === 'anticipo'
      ? 'Il preventivo torna senza fattura d\'anticipo: se ne potrà emettere un\'altra.'
      : (f.origine === 'finale' ? 'La commessa torna senza fattura finale: se ne potrà emettere un\'altra (la commessa non si chiude senza).'
        : 'La scheda di lavoro torna "da fatturare": se ne potrà fare una nuova bozza.');
    ge('mnc-riepilogo').innerHTML = 'Fattura <b>n. ' + esc(f.numero) + '</b> del ' + esc(fd(f.data_emissione)) + ' · totale ' + esc(euroNC(f.totale)) +
      '<br>La nota di credito (numerazione NC/ separata) storna <b>tutta</b> la fattura, che diventa annullata. ' + esc(effetto);
  }
  ge('mnc-conferma').checked = false;
  aggiornaNotaCredito();
}

function campoNumeroNC(valore) {
  return esc(String(valore).replace('.', ','));
}

function disegnaRigheNotaCredito() {
  const s = statoNotaCredito;
  const box = ge('mnc-righe');
  if (!s || !box) return;
  const righe = s.righe.map(function(r, i) {
    return '<div style="border:0.5px solid var(--bo);border-radius:var(--rs);padding:8px;margin-bottom:6px;font-size:13px">' +
      '<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;font-weight:400">' +
        '<input type="checkbox"' + (r.sel ? ' checked' : '') + ' onchange="cambiaRigaNC(' + i + ',\'sel\',this.checked)" style="margin-top:3px">' +
        '<span style="overflow-wrap:anywhere">' + esc(r.descrizione) + '<br><span style="font-size:12px;color:var(--m)">Fatturato: ' +
          campoNumeroNC(r.quantitaMax) + ' ' + esc(r.unita_misura) + ' × ' + esc(euroNC(r.prezzoMax)) + (r.sconto ? ' − ' + campoNumeroNC(r.sconto) + '%' : '') + '</span></span>' +
      '</label>' +
      (r.sel ? '<div class="fr" style="margin-top:6px">' +
        '<div class="f"><label>Quantità da stornare</label><input type="text" inputmode="decimal" value="' + campoNumeroNC(r.quantita) + '" oninput="cambiaRigaNC(' + i + ',\'quantita\',this.value)"></div>' +
        '<div class="f"><label>Prezzo unitario</label><input type="text" inputmode="decimal" value="' + campoNumeroNC(r.prezzo) + '" oninput="cambiaRigaNC(' + i + ',\'prezzo\',this.value)"></div>' +
      '</div>' : '') +
    '</div>';
  }).join('');
  const libere = s.libere.map(function(r, i) {
    return '<div style="border:0.5px dashed var(--bo);border-radius:var(--rs);padding:8px;margin-bottom:6px;font-size:13px">' +
      '<div class="f"><label>Descrizione</label><input type="text" maxlength="1000" value="' + esc(r.descrizione) + '" placeholder="Es. Sconto concordato" oninput="cambiaLiberaNC(' + i + ',\'descrizione\',this.value)"></div>' +
      '<div class="fr">' +
        '<div class="f"><label>Quantità</label><input type="text" inputmode="decimal" value="' + campoNumeroNC(r.quantita) + '" oninput="cambiaLiberaNC(' + i + ',\'quantita\',this.value)"></div>' +
        '<div class="f"><label>Prezzo unitario (IVA esclusa)</label><input type="text" inputmode="decimal" value="' + campoNumeroNC(r.prezzo) + '" oninput="cambiaLiberaNC(' + i + ',\'prezzo\',this.value)"></div>' +
      '</div>' +
      '<button class="btn sm" style="color:var(--r)" onclick="togliLiberaNC(' + i + ')">Togli</button>' +
    '</div>';
  }).join('');
  box.innerHTML = righe + libere +
    '<button class="btn sm" onclick="aggiungiLiberaNC()">+ Riga libera</button>';
  aggiornaNotaCredito();
}

function cambiaRigaNC(i, campo, valore) {
  const s = statoNotaCredito;
  if (!s || !s.righe[i]) return;
  s.righe[i][campo] = valore;
  if (campo === 'sel') disegnaRigheNotaCredito();
  else aggiornaNotaCredito();
}

function cambiaLiberaNC(i, campo, valore) {
  const s = statoNotaCredito;
  if (!s || !s.libere[i]) return;
  s.libere[i][campo] = valore;
  aggiornaNotaCredito();
}

function aggiungiLiberaNC() {
  if (!statoNotaCredito) return;
  statoNotaCredito.libere.push({ descrizione: '', quantita: 1, prezzo: '' });
  disegnaRigheNotaCredito();
}

function togliLiberaNC(i) {
  if (!statoNotaCredito) return;
  statoNotaCredito.libere.splice(i, 1);
  disegnaRigheNotaCredito();
}

// Righe da mandare al database e totali (stesse regole dei trigger:
// riga = q × p × (1 − sconto%), IVA della fattura sull'imponibile).
function calcolaNotaCreditoParziale() {
  const s = statoNotaCredito;
  const righe = [];
  let errore = '';
  let imponibile = 0;
  s.righe.forEach(function(r) {
    if (!r.sel || errore) return;
    const q = arrotonda2(numeroDaCampo(r.quantita));
    const p = arrotonda2(numeroDaCampo(r.prezzo));
    if (!(q > 0)) errore = '"' + r.descrizione + '": quantità non valida';
    else if (q > r.quantitaMax) errore = '"' + r.descrizione + '": quantità oltre quella fatturata (' + String(r.quantitaMax).replace('.', ',') + ')';
    else if (!(p > 0)) errore = '"' + r.descrizione + '": prezzo non valido';
    else if (p > r.prezzoMax) errore = '"' + r.descrizione + '": prezzo oltre quello fatturato';
    if (errore) return;
    imponibile += arrotonda2(q * p * (1 - r.sconto / 100));
    righe.push({ riga_id: r.id, quantita: q, prezzo_unitario: p });
  });
  s.libere.forEach(function(r, i) {
    if (errore) return;
    const d = String(r.descrizione || '').trim();
    const q = arrotonda2(numeroDaCampo(r.quantita));
    const p = arrotonda2(numeroDaCampo(r.prezzo));
    if (!d) errore = 'Riga libera ' + (i + 1) + ': scrivi la descrizione';
    else if (!(q > 0)) errore = 'Riga libera ' + (i + 1) + ': quantità non valida';
    else if (!(p > 0)) errore = 'Riga libera ' + (i + 1) + ': prezzo non valido';
    if (errore) return;
    imponibile += arrotonda2(q * p);
    righe.push({ descrizione: d, quantita: q, prezzo_unitario: p });
  });
  imponibile = arrotonda2(imponibile);
  const iva = arrotonda2(imponibile * (Number(s.f.iva_perc ?? 22)) / 100);
  return { righe: righe, imponibile: imponibile, iva: iva, totale: arrotonda2(imponibile + iva), errore: errore };
}

(function() {
  if (typeof aggiornaNotaCredito !== 'function') return;
  const aggiornaNotaCreditoTotale = aggiornaNotaCredito;
  aggiornaNotaCredito = function() {
    const s = statoNotaCredito;
    aggiornaNotaCreditoTotale.apply(this, arguments);
    if (!s || s.tipo !== 'parziale') {
      if (s && s.tipo === 'totale' && !s.totalePossibile) ge('mnc-salva').disabled = true;
      return;
    }
    const c = calcolaNotaCreditoParziale();
    const limite = Math.min(s.sit.stornabile, s.sit.incassabile);
    let errore = c.errore;
    if (!errore && !c.righe.length) errore = 'Scegli almeno una riga o aggiungi una riga libera';
    if (!errore && c.totale > limite) errore = 'Il totale (' + euroNC(c.totale) + ') supera il massimo stornabile ora (' + euroNC(limite) + ')';
    const tot = ge('mnc-totale');
    if (tot) {
      tot.innerHTML = 'Imponibile <b>' + esc(euroNC(c.imponibile)) + '</b> · IVA ' + esc(String(Number(s.f.iva_perc ?? 22))) + '% ' + esc(euroNC(c.iva)) +
        ' · <b>Totale ' + esc(euroNC(c.totale)) + '</b>' +
        (errore ? '<div style="color:var(--r);margin-top:4px">' + esc(errore) + '</div>' : '');
    }
    if (errore) ge('mnc-salva').disabled = true;
  };
})();

(function() {
  if (typeof salvaNotaCredito !== 'function') return;
  const salvaNotaCreditoTotale = salvaNotaCredito;
  salvaNotaCredito = async function() {
    const s = statoNotaCredito;
    if (!s || s.tipo !== 'parziale') return salvaNotaCreditoTotale.apply(this, arguments);
    const f = s.f;
    const c = calcolaNotaCreditoParziale();
    if (c.errore || !c.righe.length) return;
    ge('mnc-salva').disabled = true;
    const { data, error } = await db.rpc('emetti_nota_credito_parziale', {
      p_fattura_id: f.id, p_data: v('mnc-data'), p_motivo: (v('mnc-motivo') || '').trim(), p_righe: c.righe
    });
    if (error) {
      const er = ge('mnc-errore');
      er.textContent = 'Nota di credito non emessa: ' + (error.message || 'errore');
      er.style.display = 'block';
      ge('mnc-salva').disabled = false;
      return;
    }
    closeM('m-nota-credito');
    statoNotaCredito = null;
    toast('Nota di credito n. ' + (data && data.numero) + ' emessa (' + euroNC(data && data.totale) + ')' +
      (data && data.fattura_annullata ? ': fattura n. ' + f.numero + ' stornata tutta, ora annullata' : ''), 'ok');
    await aggiornaDopoFatture(f.id, f.origine === 'anticipo' ? f.preventivo_id : null);
    if (data && data.fattura_annullata && f.origine === 'finale' && typeof commessaApertaId !== 'undefined' && commessaApertaId === f.commessa_id) {
      await caricaSchedaCommessa(f.commessa_id);
    }
  };
})();
