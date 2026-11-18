// ── PERIODO DEI CONTROLLI E INTERVENTI IN RITARDO (richiesta di Erika del 16/11) ──
// NESSUN SQL, nessun dato cambia: tutto calcolato a video.
// 1. Scheda del presidio (js/07 apriSchedaPresidio / campiSchedaPresidio):
//    - riquadro "📆 Periodicità": ogni N mesi e i mesi del gruppo
//      (impianti.ciclo_manutenzione, es. febbraio_agosto);
//    - "Ultimo controllo": il più recente tra impianti.data_ultimo_controllo e
//      lo storico (schede_presidi anno/mese, schede_manichette data_intervento):
//      in produzione il registro spesso è fermo e lo storico è più avanti;
//    - "Prossima verifica": se impianti.data_prossimo_controllo è vuota (798
//      presidi al 16/11) la calcola: con un gruppo di due mesi e periodicità 6
//      il mese del gruppo del semestre dopo l'ultimo controllo, se no ultimo +
//      periodicità; "SCADUTO" in rosso se il mese è finito. Scritto
//      "(calcolata)": il registro non cambia;
//    - estintori senza prossima revisione: "non registrata" al posto di "—".
// 2. Interventi in ritardo (data pianificata passata, non chiusi: in_ritardo_il
//    di marca_ritardi_pendenti): periodo di riferimento e giorni di ritardo
//    - nella finestra dell'intervento (m-odl, openEditOdl di js/15);
//    - nella pagina Interventi (renderO di js/10), sotto la data;
//    - riquadro "⏰ In ritardo" della dashboard del capo tecnico cliccabile:
//      finestra m-interventi-ritardo con l'elenco e "Apri".

const NOMI_MESI_PERIODO = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const PERIODO_STORICO = {};

function mesiGruppoPresidio(ciclo) {
  if (!ciclo) return null;
  const parti = String(ciclo).toLowerCase().split('_').map(function(n) { return NOMI_MESI_PERIODO.indexOf(n) + 1; });
  return parti.length >= 1 && parti.every(function(m) { return m > 0; }) ? parti : null;
}

function semestreDi(mese) { return mese <= 6 ? 1 : 2; }
function testoMesePeriodo(am) { return NOMI_MESI_PERIODO[am.mese - 1] + ' ' + am.anno + ' (' + semestreDi(am.mese) + '° semestre)'; }
function amDaData(d) { if (!d) return null; const p = String(d).slice(0, 10).split('-'); return { anno: +p[0], mese: +p[1] }; }
function amMaggiore(a, b) { if (!a) return b; if (!b) return a; return (a.anno * 12 + a.mese) >= (b.anno * 12 + b.mese) ? a : b; }

// p = riga di impianti; storico = { anno, mese } dell'ultima scheda (o null)
function periodoPresidio(p, storico) {
  const gruppo = mesiGruppoPresidio(p.ciclo_manutenzione);
  const periodicita = Number(p.periodicita_mesi) || (gruppo && gruppo.length === 2 ? 6 : null);
  const dalRegistro = amDaData(p.data_ultimo_controllo);
  const ultimo = amMaggiore(dalRegistro, storico);
  const out = { gruppo: gruppo, periodicita: periodicita, ultimo: ultimo, ultimoDalloStorico: !!(storico && ultimo === storico && ultimo !== dalRegistro), prossimo: null, calcolato: false, scaduto: false };
  if (p.data_prossimo_controllo) {
    out.prossimo = amDaData(p.data_prossimo_controllo);
    out.scaduto = String(p.data_prossimo_controllo).slice(0, 10) < dataLocaleISO();
  } else if (ultimo && periodicita) {
    let am;
    if (gruppo && gruppo.length === 2 && periodicita === 6) {
      am = semestreDi(ultimo.mese) === 1 ? { anno: ultimo.anno, mese: gruppo[1] } : { anno: ultimo.anno + 1, mese: gruppo[0] };
    } else {
      const t = ultimo.anno * 12 + (ultimo.mese - 1) + periodicita;
      am = { anno: Math.floor(t / 12), mese: (t % 12) + 1 };
    }
    out.prossimo = am; out.calcolato = true;
    const fineMese = new Date(am.anno, am.mese, 0);
    out.scaduto = fineMese < new Date(dataLocaleISO() + 'T00:00:00');
  }
  return out;
}

function testoPeriodicitaPresidio(per) {
  if (!per.periodicita && !per.gruppo) return '';
  const ogni = per.periodicita ? (per.periodicita === 6 ? 'ogni 6 mesi (semestrale)' : per.periodicita === 12 ? 'ogni 12 mesi (annuale)' : 'ogni ' + per.periodicita + ' mesi') : '';
  const mesi = per.gruppo ? per.gruppo.map(function(m) { return NOMI_MESI_PERIODO[m - 1]; }).join(' e ') : '';
  return [ogni, mesi].filter(Boolean).join(' · ');
}

// Ultima scheda dello storico, letta prima di disegnare la scheda. Conta la
// DATA VERA del controllo scritta nella scheda (dati.data_ultimo_controllo: la
// salvano le importazioni e "Esegui intervento", sql/255); la casella anno/mese
// solo se la data manca (le schede importate prima del 04/11 sono nel "mese 2"
// anche con la verifica di settembre: la casella da sola darebbe febbraio).
async function leggiStoricoPeriodo(id) {
  try {
    const [rp, rm] = await Promise.all([
      db.from('schede_presidi').select('anno, mese, data_controllo:dati->>data_ultimo_controllo').eq('impianto_id', id)
        .order('anno', { ascending: false }).order('mese', { ascending: false }).limit(12),
      db.from('schede_manichette').select('data_intervento').eq('impianto_id', id).order('data_intervento', { ascending: false, nullsFirst: false }).limit(1)
    ]);
    let migliore = null;
    (rp.data || []).forEach(function(r) {
      const am = /^\d{4}-\d{2}-\d{2}/.test(r.data_controllo || '') ? amDaData(r.data_controllo) : (r.anno ? { anno: +r.anno, mese: +r.mese || 1 } : null);
      migliore = amMaggiore(migliore, am);
    });
    const b = rm.data && rm.data[0] ? amDaData(rm.data[0].data_intervento) : null;
    PERIODO_STORICO[id] = amMaggiore(migliore, b);
  } catch (e) { PERIODO_STORICO[id] = null; }
}

// Anteprima dei presidi nella scheda del cliente (js/09 renderPC): lo storico
// di tutti i presidi della lista con una lettura sola, poi si ridisegna
async function leggiStoricoPeriodoMolti(ids) {
  const mancanti = ids.filter(function(id) { return !(id in PERIODO_STORICO); });
  if (!mancanti.length) return false;
  for (let i = 0; i < mancanti.length; i += 100) {
    const pezzo = mancanti.slice(i, i + 100);
    const [rp, rm] = await Promise.all([
      db.from('schede_presidi').select('impianto_id, anno, mese, data_controllo:dati->>data_ultimo_controllo').in('impianto_id', pezzo).limit(5000),
      db.from('schede_manichette').select('impianto_id, data_intervento').in('impianto_id', pezzo).limit(5000)
    ]);
    pezzo.forEach(function(id) { PERIODO_STORICO[id] = null; });
    (rp.data || []).forEach(function(r) {
      const am = /^\d{4}-\d{2}-\d{2}/.test(r.data_controllo || '') ? amDaData(r.data_controllo) : (r.anno ? { anno: +r.anno, mese: +r.mese || 1 } : null);
      PERIODO_STORICO[r.impianto_id] = amMaggiore(PERIODO_STORICO[r.impianto_id], am);
    });
    (rm.data || []).forEach(function(r) { PERIODO_STORICO[r.impianto_id] = amMaggiore(PERIODO_STORICO[r.impianto_id], amDaData(r.data_intervento)); });
  }
  return true;
}

if (typeof renderPC === 'function') {
  const renderPCSenzaStorico = renderPC;
  // eslint-disable-next-line no-global-assign
  renderPC = function(data) {
    const esito = renderPCSenzaStorico.apply(this, arguments);
    const ids = (data || []).filter(function(p) { return p.tipo !== 'estintore'; }).map(function(p) { return p.id; });
    if (ids.length) {
      leggiStoricoPeriodoMolti(ids).then(function(letti) {
        if (letti && ge('pcards')) renderPCSenzaStorico.call(this, data);
      }).catch(function(e) { console.warn('Storico dei presidi:', e); });
    }
    return esito;
  };
}

// leggiStoricoPeriodo è il passo 1 di apriSchedaPresidio (js/07, riordino del 18/11).

if (typeof campiSchedaPresidio === 'function') {
  const campiSchedaPresidioSenzaPeriodo = campiSchedaPresidio;
  // eslint-disable-next-line no-global-assign
  campiSchedaPresidio = function(p) {
    const r = campiSchedaPresidioSenzaPeriodo.apply(this, arguments);
    try {
      const C = COLORI_EVIDENZA_PRESIDIO;
      const per = periodoPresidio(p, PERIODO_STORICO[p.id] || null);
      const testoPer = testoPeriodicitaPresidio(per);
      // Ultimo controllo: anche dallo storico
      if (per.ultimo) {
        const testoUltimo = per.ultimoDalloStorico ? testoMesePeriodo(per.ultimo) + ' · dallo storico' : null;
        const e = r.evidenza.find(function(x) { return x[1] === 'Ultima verifica'; });
        if (e && testoUltimo) e[2] = testoUltimo;
      }
      // Prossima verifica: calcolata se manca
      let prossima = r.evidenza.find(function(x) { return x[1] === 'Prossima verifica'; });
      const testoProssima = per.prossimo
        ? (per.calcolato ? testoMesePeriodo(per.prossimo) : fd(p.data_prossimo_controllo)) + (per.scaduto ? ' — ⚠️ SCADUTO' : '') + (per.calcolato ? ' (calcolata)' : '')
        : '';
      if (!prossima && per.prossimo) {
        prossima = ['📅', 'Prossima verifica', '', C.giallo];
        r.evidenza.splice(1, 0, prossima);
        r.campi = r.campi.filter(function(c) { return c[0] !== 'Prossima verifica'; });
      }
      if (prossima && testoProssima) { prossima[2] = testoProssima; if (per.scaduto) prossima[3] = C.rosso; }
      // Estintore senza revisione
      const rev = r.evidenza.find(function(x) { return x[1] === 'Prossima revisione'; });
      if (rev && !rev[2]) rev[2] = 'non registrata';
      if (testoPer) r.evidenza.unshift(['📆', 'Controlli', testoPer, C.blu]);
    } catch (e) { console.warn('Periodo del presidio:', e); }
    return r;
  };
}

// ── Interventi in ritardo ─────────────────────────────────────────────
function giorniDaData(iso) {
  if (!iso) return null;
  return Math.max(0, Math.round((new Date(dataLocaleISO() + 'T12:00:00') - new Date(String(iso).slice(0, 10) + 'T12:00:00')) / 86400000));
}

function testoRitardoIntervento(o) {
  if (!o || !o.data_pianificata || ['completato', 'annullato'].includes(o.stato)) return '';
  const gg = giorniDaData(o.data_pianificata);
  if (!o.in_ritardo_il && !(gg > 0)) return '';
  const am = amDaData(o.data_pianificata);
  const periodo = (o.tipo === 'ordinario_programmato' ? 'manutenzione del ' : '') + semestreDi(am.mese) + '° semestre ' + am.anno;
  return '⏰ In ritardo da ' + gg + (gg === 1 ? ' giorno' : ' giorni') + ': era previsto il ' + fd(o.data_pianificata) + ' (' + periodo + ') e non è ancora chiuso.';
}


// ── Cosa si controlla: presidi registrati nella sede dell'intervento ──
// (l'intervento non dice quali presidi: si ricava dal registro della sede;
// presidi senza sede = valgono per tutte le sedi del cliente)
async function presidiPerInterventi(odls) {
  const out = {};
  const clienti = [...new Set((odls || []).map(function(o) { return o.cliente_id; }).filter(Boolean))];
  const righe = [];
  for (let i = 0; i < clienti.length; i += 100) {
    const { data, error } = await db.from('impianti').select('tipo, cliente_id, sede_id').in('cliente_id', clienti.slice(i, i + 100)).is('eliminato_il', null).limit(5000);
    if (error) return out;
    righe.push.apply(righe, data || []);
  }
  (odls || []).forEach(function(o) {
    const conta = {};
    righe.forEach(function(r) {
      if (r.cliente_id !== o.cliente_id) return;
      if (o.sede_id && r.sede_id && r.sede_id !== o.sede_id) return;
      conta[r.tipo] = (conta[r.tipo] || 0) + 1;
    });
    const tipi = Object.keys(conta);
    out[o.id] = tipi.length ? tipi.map(function(t) { return tpl(t) + ': ' + conta[t]; }).join(' · ') : 'Nessun presidio registrato in questa sede';
  });
  return out;
}

if (typeof openEditOdl === 'function') {
  const openEditOdlSenzaRitardo = openEditOdl;
  // eslint-disable-next-line no-global-assign
  openEditOdl = async function(id) {
    const esito = await openEditOdlSenzaRitardo.apply(this, arguments);
    try {
      const box = document.querySelector('#m-odl .modal');
      const vecchio = ge('mo-ritardo');
      if (vecchio) vecchio.remove();
      const { data: o } = await db.from('ordini_lavoro').select('id, tipo, stato, data_pianificata, in_ritardo_il, cliente_id, sede_id').eq('id', id).maybeSingle();
      const testo = testoRitardoIntervento(o);
      const presidi = o ? (await presidiPerInterventi([o]))[o.id] : '';
      const titolo = ge('modal-odl-title');
      if (box && titolo && (testo || presidi)) titolo.insertAdjacentHTML('afterend', '<div id="mo-ritardo" style="margin:8px 0">' +
        (testo ? '<div class="al2 w" style="margin:0 0 6px">' + esc(testo) + '</div>' : '') +
        (presidi ? '<div class="al2 i" style="margin:0">Da controllare in questa sede: <b>' + esc(presidi) + '</b></div>' : '') + '</div>');
    } catch (e) { console.warn('Intervento in ritardo:', e); }
    return esito;
  };
}

if (typeof renderO === 'function') {
  const renderOSenzaRitardo = renderO;
  // eslint-disable-next-line no-global-assign
  renderO = function(data) {
    const esito = renderOSenzaRitardo.apply(this, arguments);
    try {
      const righe = ge('otbody') ? ge('otbody').rows : [];
      (data || []).forEach(function(o, i) {
        const testo = testoRitardoIntervento(o);
        const cella = righe[i] && righe[i].cells[4];
        if (testo && cella) cella.insertAdjacentHTML('beforeend', '<div style="font-size:11px;color:var(--r);font-weight:600;margin-top:2px">' + esc(testo.replace(' e non è ancora chiuso.', '')) + '</div>');
      });
      // Cosa si controlla, sotto il tipo (in sottofondo)
      const tb = ge('otbody'), giro = {};
      if (tb) tb._giroPresidi = giro;
      presidiPerInterventi(data).then(function(mappa) {
        if (!tb || tb._giroPresidi !== giro) return; // la lista è stata ridisegnata nel frattempo
        (data || []).forEach(function(o, i) {
          const cella = righe[i] && righe[i].cells[2];
          if (cella && mappa[o.id] && !cella.querySelector('[data-presidi-odl]')) {
            cella.insertAdjacentHTML('beforeend', '<div data-presidi-odl style="font-size:11px;color:var(--m);margin-top:2px">' + esc(mappa[o.id]) + '</div>');
          }
        });
      });
    } catch (e) { console.warn('Interventi in ritardo:', e); }
    return esito;
  };
}

// Riquadro "⏰ In ritardo" della dashboard del capo tecnico: finestra con l'elenco
async function apriInterventiInRitardo() {
  openM('m-interventi-ritardo');
  const box = ge('mir-elenco');
  box.innerHTML = '<div class="load">Caricamento…</div>';
  const { data, error } = await db.from('ordini_lavoro')
    .select('id, numero, tipo, stato, data_pianificata, in_ritardo_il, cliente_id, sede_id, clienti(ragione_sociale), utenti!ordini_lavoro_tecnico_id_fkey(nome, cognome)')
    .is('eliminato_il', null).not('in_ritardo_il', 'is', null).not('stato', 'in', '(completato,annullato)')
    .order('data_pianificata', { ascending: true }).limit(200);
  if (error) { box.innerHTML = '<div class="al2 e">Interventi non letti: ' + esc(error.message) + '</div>'; return; }
  const tipi = { ordinario_programmato: 'Manutenzione programmata', ordinario_chiamata: 'Su chiamata', straordinario: 'Straordinario', corso: 'Corso' };
  const presidi = await presidiPerInterventi(data || []);
  box.innerHTML = (data || []).length ? data.map(function(o) {
    return '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">' +
      '<div style="min-width:160px;flex:1"><div style="font-weight:700">' + (o.numero ? '#' + esc(o.numero) + ' · ' : '') + esc(o.clienti?.ragione_sociale || '—') + '</div>' +
      '<div style="font-size:12px;color:var(--m)">' + esc(tipi[o.tipo] || o.tipo || '') + ' · ' + (o.utenti ? esc(o.utenti.nome + ' ' + o.utenti.cognome) : '<span style="color:var(--r)">senza tecnico</span>') + '</div>' +
      '<div style="font-size:12px">Da controllare: ' + esc(presidi[o.id] || '—') + '</div>' +
      '<div style="font-size:12px;color:var(--r);font-weight:600">' + esc(testoRitardoIntervento(o)) + '</div></div>' +
      '<button class="btn sm" onclick="closeM(\'m-interventi-ritardo\');openEditOdl(\'' + esc(o.id) + '\')">Apri</button></div>';
  }).join('') : '<div class="empty">✅ Nessun intervento in ritardo.</div>';
}

document.addEventListener('DOMContentLoaded', function() {
  const kpi = ge('ct-k-ritardo') && ge('ct-k-ritardo').closest('.kpi-card');
  if (kpi && !kpi.getAttribute('onclick')) {
    kpi.classList.add('clickable');
    kpi.setAttribute('onclick', 'apriInterventiInRitardo()');
    kpi.title = 'Apri l\'elenco degli interventi in ritardo';
  }
});
