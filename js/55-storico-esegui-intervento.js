// =====================================================================
// js/55 — Storico semestrale dei presidi da "Esegui intervento"
// (richiesta di Erika del 04/11; database: sql/255, il sito funziona
// anche senza).
//
// Al passo Presidi di "Esegui intervento" (loadPC di js/11, anche con
// l'audit di js/40 e il bottone Sostituito di js/51) spuntando un presidio
// si aprono TUTTE le voci del suo controllo, già impostate come
// nell'ultima scheda dello storico (voci_x_si / voci_x_no / voci_x_vuote;
// se non c'è una scheda, le voci del registro del presidio o quelle
// standard del tipo, CKL_PRESIDIO di js/01), cliccabili SI / NO / senza
// esito. Restano stato e note di sempre.
// Chiuso l'intervento (salvaInt di js/11, già avvolta da js/40), per ogni
// presidio spuntato nasce la scheda dello storico nel SEMESTRE DELLA DATA
// DELL'INTERVENTO (1° = gennaio-giugno, 2° = luglio-dicembre; mese 1/7 o
// 2/8 secondo il gruppo della scheda di origine o del presidio). Se nello
// stesso semestre c'è già una scheda di quel presidio si tiene la prima.
// Con sql/255: RPC registra_scheda_presidio_intervento (anche il tecnico,
// solo per i clienti che legge). Senza: titolare e capo tecnico scrivono
// direttamente (policy schede_importazione e manichette_importazione), il
// tecnico riceve un avviso e le schede non nascono.
// "Non ho potuto completare": nessuna scheda (il controllo non è fatto).
// =====================================================================

const storicoEsegui = {
  ultime: {},      // id presidio -> ultima scheda dello storico (o null)
  presidi: {},     // id presidio -> riga di impianti
  esiti: {},       // id presidio -> { voci: [..], esiti: {voce: 'SI'|'NO'|''} }
  caricamento: 0,
  rpc: null        // true/false: c'è sql/255?
};

// Voci proposte per le manichette senza scheda precedente (CKL_PRESIDIO non
// ha le manichette). Proposta, da confermare da Toli.
const VOCI_MANICHETTA_STORICO = ['Verifica integrità manichetta', 'Verifica raccordi', 'Verifica lancia',
  'Prova di tenuta in pressione', 'Verifica cassetta e segnaletica'];

async function storicoEseguiRpcDisponibile() {
  if (storicoEsegui.rpc !== null) return storicoEsegui.rpc;
  const r = await db.rpc('registra_scheda_presidio_intervento', {
    p_impianto_id: '00000000-0000-0000-0000-000000000000', p_dati: {}, p_data: dataLocaleISO(),
    p_odl_id: null, p_tecnico_id: null, p_token: null
  });
  const msg = String((r.error && (r.error.message || '')) || '');
  // Funzione assente: PGRST202 / "Could not find the function".
  storicoEsegui.rpc = !(r.error && (r.error.code === 'PGRST202' || /could not find the function/i.test(msg)));
  return storicoEsegui.rpc;
}

function periodoStoricoEsegui(data, ciclo) {
  if (typeof periodoDaDataVerifica === 'function') return periodoDaDataVerifica(ciclo, data);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) return null;
  const semestre = Number(data.slice(5, 7)) <= 6 ? 1 : 2;
  return { ciclo: ciclo, anno: Number(data.slice(0, 4)), semestre: semestre, mese: (ciclo === 'febbraio_agosto' ? [2, 8] : [1, 7])[semestre - 1] };
}
function testoSemestreEsegui(anno, semestre) {
  return (semestre === 1 ? '1° semestre (gennaio–giugno) ' : '2° semestre (luglio–dicembre) ') + anno;
}

// Ultima scheda: per i presidi la più recente per anno e mese, per le
// manichette per data dell'intervento.
function ultimaSchedaStorico(schede, manichetta) {
  return (schede || []).slice().sort(function(a, b) {
    if (manichetta) {
      return String(b.data_intervento || '').localeCompare(String(a.data_intervento || '')) ||
        String(b.creato_il || '').localeCompare(String(a.creato_il || ''));
    }
    return (Number(b.anno) - Number(a.anno)) || (Number(b.mese) - Number(a.mese));
  })[0] || null;
}

// Legge registro e ultime schede dei presidi mostrati al passo Presidi.
async function caricaStoricoPassoPresidi() {
  const ids = [...document.querySelectorAll('#pcl input[type=checkbox][id^="upd-"]')]
    .map(function(cb) { return cb.dataset.pid || cb.id.slice(4); })
    .filter(function(id) { return id && !(id in storicoEsegui.ultime); });
  if (!ids.length) return;
  const giro = ++storicoEsegui.caricamento;
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const r = await db.from('impianti').select('*').in('id', ids.slice(i, i + 100));
      (r.data || []).forEach(function(p) { storicoEsegui.presidi[p.id] = p; });
    }
    const manichette = ids.filter(function(id) { return storicoEsegui.presidi[id] && storicoEsegui.presidi[id].tipo === 'manichetta'; });
    const altri = ids.filter(function(id) { return manichette.indexOf(id) < 0; });
    const lettura = typeof leggiSchedeScadenze === 'function' ? leggiSchedeScadenze : null;
    const [sp, sm] = lettura ? await Promise.all([
      altri.length ? lettura('schede_presidi', altri).catch(function() { return []; }) : [],
      manichette.length ? lettura('schede_manichette', manichette).catch(function() { return []; }) : []
    ]) : [[], []];
    if (giro !== storicoEsegui.caricamento) return;
    ids.forEach(function(id) {
      const man = manichette.indexOf(id) >= 0;
      storicoEsegui.ultime[id] = ultimaSchedaStorico((man ? sm : sp).filter(function(s) { return s.impianto_id === id; }), man);
    });
  } catch (e) {
    console.warn('Storico del passo Presidi:', e);
    ids.forEach(function(id) { if (!(id in storicoEsegui.ultime)) storicoEsegui.ultime[id] = null; });
  }
  // Ridisegna i controlli già aperti ma non ancora toccati.
  ids.forEach(function(id) {
    const cb = ge('upd-' + id);
    if (cb && cb.checked && !(storicoEsegui.esiti[id] && storicoEsegui.esiti[id].toccato)) {
      delete storicoEsegui.esiti[id];
      assicuraControlliPresidio(id, true);
    }
  });
}

// Voci ed esiti di partenza: ultima scheda, poi registro, poi voci standard.
function esitiPartenzaPresidio(pid) {
  const scheda = storicoEsegui.ultime[pid];
  const p = storicoEsegui.presidi[pid] || {};
  const fonte = scheda && scheda.dati ? scheda.dati : p;
  const si = Array.isArray(fonte.voci_x_si) ? fonte.voci_x_si : [];
  const no = Array.isArray(fonte.voci_x_no) ? fonte.voci_x_no : [];
  const vuote = Array.isArray(fonte.voci_x_vuote) ? fonte.voci_x_vuote : [];
  let voci = [...new Set([...si, ...no, ...vuote])];
  let origine = scheda ? 'scheda' : 'registro';
  if (!voci.length) {
    voci = p.tipo === 'manichetta' ? VOCI_MANICHETTA_STORICO.slice() : (CKL_PRESIDIO[p.tipo] || []).slice();
    origine = 'standard';
  }
  const esiti = {};
  voci.forEach(function(voce) { esiti[voce] = no.includes(voce) ? 'NO' : si.includes(voce) ? 'SI' : ''; });
  return { voci: voci, esiti: esiti, origine: origine, toccato: false };
}

// Contenitore dei controlli: nel pannello della spunta (detail-) o, con
// l'audit, nei dati del presidio trovato (aud-dati-).
function contenitoreControlliPresidio(pid) {
  let box = ge('cks-' + pid);
  if (box) return box;
  const padre = ge('aud-dati-' + pid) || ge('detail-' + pid);
  if (!padre) return null;
  box = document.createElement('div');
  box.id = 'cks-' + pid;
  box.style.cssText = 'margin-top:10px';
  padre.appendChild(box);
  return box;
}

function assicuraControlliPresidio(pid, ridisegna) {
  const box = contenitoreControlliPresidio(pid);
  if (!box) return;
  if (box.dataset.pronto === '1' && !ridisegna) return;
  if (!storicoEsegui.esiti[pid]) storicoEsegui.esiti[pid] = esitiPartenzaPresidio(pid);
  disegnaControlliPresidio(pid);
}

function disegnaControlliPresidio(pid) {
  const box = ge('cks-' + pid);
  const stato = storicoEsegui.esiti[pid];
  if (!box || !stato) return;
  box.dataset.pronto = '1';
  const scheda = storicoEsegui.ultime[pid];
  const p = storicoEsegui.presidi[pid] || {};
  let provenienza;
  if (stato.origine === 'scheda' && scheda) {
    const d = scheda.dati || {};
    provenienza = 'Come nell’ultima scheda dello storico' +
      (p.tipo === 'manichetta'
        ? (scheda.data_intervento ? ' (intervento del ' + fd(scheda.data_intervento) + ')' : '')
        : ' (' + testoSemestreEsegui(Number(scheda.anno), Number(scheda.mese) < 7 ? 1 : 2) + (d.data_ultimo_controllo ? ', verifica del ' + fd(d.data_ultimo_controllo) : '') + ')');
  } else if (stato.origine === 'registro') {
    provenienza = 'Come nel registro del presidio (nessuna scheda nello storico)';
  } else {
    provenienza = 'Voci standard del controllo (nessuna scheda precedente)';
  }
  const di = v('tc3');
  const periodo = di ? periodoStoricoEsegui(di, 'gennaio_luglio') : null;
  const bottone = function(i, valore, testo, colore) {
    const scelto = (stato.esiti[stato.voci[i]] || '') === valore;
    return '<button type="button" data-pid="' + esc(pid) + '" data-i="' + i + '" data-esito="' + valore + '" onclick="scegliEsitoControllo(this)" ' +
      'aria-pressed="' + (scelto ? 'true' : 'false') + '" style="min-width:52px;min-height:36px;padding:4px 8px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;' +
      'border:1px solid ' + (scelto ? colore : 'var(--bo)') + ';background:' + (scelto ? colore : 'var(--w,#fff)') + ';color:' + (scelto ? '#fff' : 'var(--m)') + '">' + testo + '</button>';
  };
  const righe = stato.voci.map(function(voce, i) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--bl)">' +
      '<span style="font-size:13px;flex:1 1 160px;overflow-wrap:anywhere">' + esc(voce) + '</span>' +
      '<span style="display:flex;gap:4px">' + bottone(i, 'SI', 'SI', 'var(--g)') + bottone(i, 'NO', 'NO', 'var(--r)') + bottone(i, '', '—', '#64748b') + '</span>' +
    '</div>';
  }).join('');
  const conta = { SI: 0, NO: 0, '': 0 };
  stato.voci.forEach(function(voce) { conta[stato.esiti[voce] || '']++; });
  box.innerHTML =
    '<div style="background:var(--w,#fff);border:1px solid var(--bo);border-radius:var(--rs);padding:8px 10px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<b style="font-size:12px">Controlli del presidio</b>' +
        '<button type="button" class="btn sm" data-pid="' + esc(pid) + '" onclick="tuttiSiControlliPresidio(this.dataset.pid)" style="font-size:11px">✓ Tutti SI</button>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--m);margin:2px 0 4px">' + esc(provenienza) + '. Tocca SI, NO o — per cambiare.</div>' +
      '<div style="font-size:11px;margin-bottom:4px"><b style="color:var(--g)">' + conta.SI + ' SI</b> · <b style="color:var(--r)">' + conta.NO + ' NO</b> · ' + conta[''] + ' senza esito</div>' +
      (righe || '<div style="font-size:12px;color:var(--m)">Nessuna voce di controllo per questo tipo.</div>') +
      '<div style="font-size:11px;color:var(--m);margin-top:6px">📁 Alla chiusura va nello storico' + (periodo ? ': ' + esc(testoSemestreEsegui(periodo.anno, periodo.semestre)) : ' nel semestre della data dell’intervento') + '. Se il semestre ha già una scheda, si tiene quella.</div>' +
    '</div>';
}

function scegliEsitoControllo(btn) {
  const pid = btn.dataset.pid, stato = storicoEsegui.esiti[pid];
  if (!stato) return;
  const voce = stato.voci[Number(btn.dataset.i)];
  if (voce === undefined) return;
  stato.esiti[voce] = btn.dataset.esito || '';
  stato.toccato = true;
  disegnaControlliPresidio(pid);
}

function tuttiSiControlliPresidio(pid) {
  const stato = storicoEsegui.esiti[pid];
  if (!stato) return;
  stato.voci.forEach(function(voce) { stato.esiti[voce] = 'SI'; });
  stato.toccato = true;
  disegnaControlliPresidio(pid);
}

function aggiornaControlliAperti() {
  document.querySelectorAll('#pcl input[type=checkbox][id^="upd-"]:checked').forEach(function(cb) {
    assicuraControlliPresidio(cb.dataset.pid || cb.id.slice(4), false);
  });
}

// ── Aggancio al passo Presidi ───────────────────────────────────────────
(function() {
  if (typeof loadPC === 'function') {
    const loadPCPrimaStorico = loadPC;
    loadPC = async function() {
      // Cambio di cliente: si riparte da zero.
      const cid = v('tc1');
      if (storicoEsegui.cliente !== cid) {
        storicoEsegui.cliente = cid;
        storicoEsegui.ultime = {}; storicoEsegui.presidi = {}; storicoEsegui.esiti = {};
      }
      const r = await loadPCPrimaStorico.apply(this, arguments);
      try { aggiornaControlliAperti(); } catch (e) { console.warn('Controlli presidi:', e); }
      caricaStoricoPassoPresidi().catch(function(e) { console.warn('Storico presidi:', e); });
      return r;
    };
  }
  if (typeof togglePresidioDetail === 'function') {
    const togglePrimaStorico = togglePresidioDetail;
    togglePresidioDetail = function(el) {
      const r = togglePrimaStorico.apply(this, arguments);
      const pid = el && el.dataset ? el.dataset.pid : el;
      if (el && el.checked && pid) assicuraControlliPresidio(pid, false);
      return r;
    };
  }
  if (typeof rimettiLavoroPassoPresidi === 'function') {
    const rimettiPrimaStorico = rimettiLavoroPassoPresidi;
    rimettiLavoroPassoPresidi = function() {
      const r = rimettiPrimaStorico.apply(this, arguments);
      try { aggiornaControlliAperti(); } catch (e) { console.warn('Controlli presidi:', e); }
      return r;
    };
  }
  if (typeof cambiaEsitoAudit === 'function') {
    const cambiaPrimaStorico = cambiaEsitoAudit;
    cambiaEsitoAudit = function(pid) {
      const r = cambiaPrimaStorico.apply(this, arguments);
      const cb = ge('upd-' + pid);
      if (cb && cb.checked) assicuraControlliPresidio(pid, false);
      return r;
    };
  }
  // La data dell'intervento cambia il semestre scritto sotto i controlli.
  document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'tc3') {
      Object.keys(storicoEsegui.esiti).forEach(function(pid) { if (ge('cks-' + pid)) disegnaControlliPresidio(pid); });
    }
  });
})();

// ── Chiusura dell'intervento: schede nello storico ───────────────────────
function raccogliStoricoDaSalvare() {
  const presidi = [];
  document.querySelectorAll('#pcl input[type=checkbox][id^="upd-"]:checked').forEach(function(cb) {
    const pid = cb.dataset.pid || cb.id.slice(4);
    if (!pid) return;
    if (!storicoEsegui.esiti[pid]) storicoEsegui.esiti[pid] = esitiPartenzaPresidio(pid);
    const st = storicoEsegui.esiti[pid];
    presidi.push({
      pid: pid,
      mesi: parseInt(cb.dataset.mesi, 10) || 12,
      stato: ge('stato-' + pid) ? ge('stato-' + pid).value : 'ok',
      note: ge('note-' + pid) ? ge('note-' + pid).value.trim() : '',
      voci: st.voci.slice(),
      esiti: Object.assign({}, st.esiti),
      token: (crypto.randomUUID ? crypto.randomUUID() : null)
    });
  });
  return {
    cid: v('tc1'), di: v('tc3'), odl: v('tc-odl') || null,
    tecnico: v('tc5') || (ROLE === 'tecnico' && typeof ME !== 'undefined' && ME ? ME.id : null),
    impossibilitato: !!(ge('tc-impossibilitato') && ge('tc-impossibilitato').checked),
    presidi: presidi
  };
}

const CAMPI_NON_DA_COPIARE_STORICO = ['id', 'creato_il', 'eliminato_il', 'eliminato_da', 'clienti', 'sede_label',
  'sostituito_da', 'sostituito_il', 'sostituito_odl_id', 'sostituito_motivo'];

function datiSchedaStorico(x, di) {
  const p = storicoEsegui.presidi[x.pid] || {};
  const scheda = storicoEsegui.ultime[x.pid];
  const base = Object.assign({}, scheda && scheda.dati ? scheda.dati : {}, p);
  CAMPI_NON_DA_COPIARE_STORICO.forEach(function(k) { delete base[k]; });
  const prossima = new Date(di + 'T00:00:00');
  prossima.setMonth(prossima.getMonth() + x.mesi);
  const statoPrima = (scheda && scheda.dati && scheda.dati.stato) || p.stato;
  const dati = Object.assign(base, {
    data_ultimo_controllo: di,
    data_prossimo_controllo: dataLocaleISO(prossima),
    stato: x.stato || null,
    note: x.note || null,
    // L'esito scritto resta solo se lo stato non è cambiato.
    esito_verifica: x.stato === statoPrima ? (base.esito_verifica || null) : null,
    voci_x_si: x.voci.filter(function(voce) { return x.esiti[voce] === 'SI'; }),
    voci_x_no: x.voci.filter(function(voce) { return x.esiti[voce] === 'NO'; }),
    voci_x_vuote: x.voci.filter(function(voce) { return !x.esiti[voce]; }),
    fonte_pdf: null,
    pagina_pdf: null
  });
  if (p.tipo) dati.tipo = p.tipo;
  return dati;
}

// Senza sql/255: titolare e capo tecnico scrivono direttamente.
async function scriviSchedaStoricoDiretta(x, dati, raccolta) {
  const p = storicoEsegui.presidi[x.pid] || {};
  const scheda = storicoEsegui.ultime[x.pid];
  const di = raccolta.di;
  if (p.tipo === 'manichetta') {
    const ciclo = (scheda && scheda.dati && scheda.dati.riferimento_ciclo) || (['gennaio_luglio', 'febbraio_agosto'].includes(p.ciclo_manutenzione) ? p.ciclo_manutenzione : 'gennaio_luglio');
    const periodo = periodoStoricoEsegui(di, ciclo);
    const inizio = periodo.anno + (periodo.semestre === 1 ? '-01-01' : '-07-01');
    const fine = periodo.anno + (periodo.semestre === 1 ? '-06-30' : '-12-31');
    const gia = await db.from('schede_manichette').select('id').eq('impianto_id', x.pid).gte('data_intervento', inizio).lte('data_intervento', fine).limit(1);
    if (gia.error) throw gia.error;
    if (gia.data && gia.data.length) return { creata: false, anno: periodo.anno, semestre: periodo.semestre };
    const r = await db.from('schede_manichette').insert({
      impianto_id: x.pid, data_intervento: di, precedente_id: scheda ? scheda.id : null,
      tecnico_id: raccolta.tecnico || (scheda ? scheda.tecnico_id : null), salvataggio_id: x.token,
      dati: Object.assign(dati, { riferimento_anno: periodo.anno, riferimento_semestre: periodo.semestre, riferimento_ciclo: ciclo, odl_id: raccolta.odl, origine_scheda: 'esegui_intervento' })
    });
    if (r.error && r.error.code !== '23505') throw r.error;
    return { creata: !r.error, anno: periodo.anno, semestre: periodo.semestre };
  }
  const ciclo = scheda ? scheda.ciclo : (['gennaio_luglio', 'febbraio_agosto'].includes(p.ciclo_manutenzione) ? p.ciclo_manutenzione : 'gennaio_luglio');
  const periodo = periodoStoricoEsegui(di, ciclo);
  const mesi = periodo.semestre === 1 ? [1, 2] : [7, 8];
  const gia = await db.from('schede_presidi').select('id').eq('impianto_id', x.pid).eq('anno', periodo.anno).in('mese', mesi).limit(1);
  if (gia.error) throw gia.error;
  if (gia.data && gia.data.length) return { creata: false, anno: periodo.anno, semestre: periodo.semestre };
  const r = await db.from('schede_presidi').insert({
    impianto_id: x.pid, anno: periodo.anno, mese: periodo.mese, ciclo: ciclo,
    precedente_id: scheda ? scheda.id : null,
    tecnico_id: raccolta.tecnico || (scheda ? scheda.tecnico_id : null),
    dati: Object.assign(dati, { anno_manutenzione: periodo.anno, ciclo_manutenzione: ciclo, odl_id: raccolta.odl, origine_scheda: 'esegui_intervento' })
  });
  if (r.error && r.error.code !== '23505') throw r.error;
  return { creata: !r.error, anno: periodo.anno, semestre: periodo.semestre };
}

// Lo storico dei presidi lo scrivono tecnico, capo tecnico e titolare
// (informatico = titolare): con gli altri ruoli l'intervento si chiude come prima.
const RUOLI_STORICO_ESEGUI = ['titolare', 'capo_tecnico', 'tecnico'];

async function scriviStoricoIntervento(raccolta) {
  if (!RUOLI_STORICO_ESEGUI.includes(ROLE)) return { attivo: false, ruolo: true, create: 0, gia: 0, errori: [] };
  const conRpc = await storicoEseguiRpcDisponibile();
  const diretta = !conRpc && (typeof gestisceStoricoPresidi === 'function' ? gestisceStoricoPresidi() : ['titolare', 'capo_tecnico'].includes(ROLE));
  if (!conRpc && !diretta) {
    return { attivo: false, create: 0, gia: 0, errori: [] };
  }
  const esito = { attivo: true, create: 0, gia: 0, errori: [], semestri: {} };
  for (const x of raccolta.presidi) {
    const p = storicoEsegui.presidi[x.pid] || {};
    const nome = tpl(p.tipo) + ' ' + (p.matricola || '') + (p.ubicazione ? ' (' + p.ubicazione + ')' : '');
    try {
      const dati = datiSchedaStorico(x, raccolta.di);
      let r;
      if (conRpc) {
        const rr = await db.rpc('registra_scheda_presidio_intervento', {
          p_impianto_id: x.pid, p_dati: dati, p_data: raccolta.di, p_odl_id: raccolta.odl,
          p_tecnico_id: raccolta.tecnico || null, p_token: x.token
        });
        if (rr.error) throw rr.error;
        r = rr.data || {};
      } else {
        r = await scriviSchedaStoricoDiretta(x, dati, raccolta);
      }
      if (r.creata) esito.create++; else esito.gia++;
      if (r.anno) esito.semestri[testoSemestreEsegui(Number(r.anno), Number(r.semestre))] = true;
      // Il registro del presidio tiene le voci dell'ultimo controllo (come i
      // dati importati); se non riesce, la scheda dello storico resta.
      db.from('impianti').update({ voci_x_si: dati.voci_x_si, voci_x_no: dati.voci_x_no, voci_x_vuote: dati.voci_x_vuote })
        .eq('id', x.pid).then(function(u) { if (u.error) console.warn('Voci del registro non aggiornate:', u.error.message); });
    } catch (e) {
      esito.errori.push(nome + ': ' + (e.message || e));
    }
  }
  return esito;
}

if (typeof salvaInt === 'function') {
  const salvaIntPrimaStorico = salvaInt;
  salvaInt = async function() {
    const raccolta = raccogliStoricoDaSalvare();
    const r = await salvaIntPrimaStorico.apply(this, arguments);
    // salvaInt svuota il cliente (tc1) solo se l'intervento è stato salvato.
    const salvato = !!raccolta.cid && !v('tc1');
    if (!salvato) return r;
    const presidi = raccolta.presidi;
    const azzera = function() { storicoEsegui.esiti = {}; storicoEsegui.ultime = {}; storicoEsegui.presidi = {}; storicoEsegui.cliente = null; };
    if (raccolta.impossibilitato || !presidi.length || !raccolta.di) { azzera(); return r; }
    const t = ge('toast');
    const prima = t && t.classList.contains('on') ? t.textContent : '';
    let esito;
    try { esito = await scriviStoricoIntervento(raccolta); } finally { azzera(); }
    if (esito.ruolo) return r;
    if (!esito.attivo) {
      toast((prima ? prima + ' ' : '') + 'Storico presidi non aggiornato: per il tuo ruolo serve l’aggiornamento del database (sql/255). Avvisa il capo tecnico.', 'err');
      return r;
    }
    let msg = '📁 Storico presidi: ' + esito.create + (esito.create === 1 ? ' scheda nuova' : ' schede nuove') +
      (Object.keys(esito.semestri).length ? ' nel ' + Object.keys(esito.semestri).join(', ') : '') + '.';
    if (esito.gia) msg += ' ' + esito.gia + (esito.gia === 1 ? ' presidio aveva' : ' presidi avevano') + ' già la scheda del semestre: tenuta la prima.';
    if (esito.errori.length) {
      toast((prima ? prima + ' ' : '') + msg + ' Errori: ' + esito.errori.length + '.', 'err');
      if (typeof mostraAvvisoBloccante === 'function') {
        mostraAvvisoBloccante('Storico presidi: schede non salvate',
          '<p style="margin:0 0 10px">L’intervento è chiuso, ma per questi presidi la scheda dello storico non è stata salvata. Avvisa il capo tecnico: la può aggiungere dallo storico del presidio.</p>' +
          '<ul style="margin:0;padding-left:18px">' + esito.errori.map(function(e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>');
      }
    } else {
      toast((prima ? prima + ' ' : '') + msg, 'ok');
    }
    return r;
  };
}
