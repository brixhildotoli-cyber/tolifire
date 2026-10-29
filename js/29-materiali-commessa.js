// =====================================================================
// F6.3 — ELENCO MATERIALI E RITARDI della commessa.
// Un solo elenco "Materiali" nella scheda della commessa (box
// cmd-materiali, sopra i box di dettaglio): ogni voce degli ordini ai
// fornitori (js/27, sql/30) e ogni consumabile o nolo chiesto agli
// acquisti (js/28, sql/31), con fornitore, arrivo previsto (o data di
// arrivo) e stato. "In ritardo" se l'arrivo previsto è passato e non è
// arrivato. Per chi vede le offerte (rappresentante, commerciale,
// titolare) anche le offerte selezionate ancora da ordinare.
// Riepilogo dei ritardi nella dashboard del capo tecnico (box
// ct-materiali-ritardo) e, dalle decisioni del 29/10, del rappresentante
// del cliente (box rap-materiali-ritardo: solo le sue commesse, per RLS).
// Nessun prezzo d'acquisto in questo file (il capo tecnico non li vede).
// Sola lettura: le azioni (conferma, arrivato, evadi, annulla) restano
// nei box "Ordini ai fornitori" e "Consumabili e noli".
// Lo stato "Materiali ordinati" NON cambia da solo (decisione F5.2): lo
// segna il rappresentante; qui si dice solo se tutto risulta ordinato.
// Nessun SQL nuovo: legge le tabelle di sql/30 e sql/31 con le loro
// policy (le leggono i 5 ruoli che leggono la commessa). Funziona con
// nessuna, una o entrambe: le fonti mancanti si ignorano.
// =====================================================================

let materialiCommessaAperta = [];

// Oggi in ora italiana (AAAA-MM-GG), per il confronto con le date.
function dataOggiMateriali() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
}

// ── Lettura delle due fonti ─────────────────────────────────────────
// Restituisce { ordini, richieste, attiveOrdini, attiveRichieste,
// errori }. Una fonte non attiva (tabella assente) dà elenco vuoto.
async function leggiFontiMaterialiCommessa(commessaId) {
  const [attiveOrdini, attiveRichieste] = await Promise.all([
    typeof verificaOrdiniFornitoriDisponibili === 'function' ? verificaOrdiniFornitoriDisponibili() : false,
    typeof verificaRichiesteIntegrazioneDisponibili === 'function' ? verificaRichiesteIntegrazioneDisponibili() : false
  ]);

  const [ordiniRes, richiesteRes] = await Promise.all([
    attiveOrdini
      ? db.from('ordini_fornitori')
        .select('id, codice, numero, stato, fornitore_ragione_sociale, data_ordine, arrivo_previsto, data_arrivo, preventivo_fornitore_id, ordini_fornitori_voci(id, posizione, descrizione, unita_misura, quantita)')
        .eq('commessa_id', commessaId)
        .order('numero', { ascending: true })
      : null,
    attiveRichieste
      ? db.from('commesse_richieste_integrazione')
        .select('id, numero, tipo, stato, descrizione, quantita, unita_misura, serve_dal, nolo_fino_al, arrivo_previsto, data_arrivo, fornitore_nome')
        .eq('commessa_id', commessaId)
        .order('numero', { ascending: true })
      : null
  ]);

  const errori = [];
  if (ordiniRes?.error) errori.push('ordini: ' + ordiniRes.error.message);
  if (richiesteRes?.error) errori.push('consumabili e noli: ' + richiesteRes.error.message);

  return {
    ordini: ordiniRes && !ordiniRes.error ? (ordiniRes.data || []) : [],
    richieste: richiesteRes && !richiesteRes.error ? (richiesteRes.data || []) : [],
    attiveOrdini: !!attiveOrdini,
    attiveRichieste: !!attiveRichieste,
    errori: errori
  };
}

// ── Una riga per ogni cosa che deve arrivare in cantiere ────────────
// Ogni riga: { fonte, cosa, quantita, fornitore, riferimento, stato,
// etichettaStato, classeStato, arrivoPrevisto, dataArrivo, arrivato,
// inRitardo, nota }.
function righeMaterialiCommessa(ordini, richieste, offerteDaOrdinare) {
  const oggi = dataOggiMateriali();
  const righe = [];

  (ordini || []).forEach(function(o) {
    if (o.stato === 'annullato') return;
    const arrivato = o.stato === 'arrivato';
    const inRitardo = !arrivato && !!o.arrivo_previsto && o.arrivo_previsto < oggi;
    const voci = (o.ordini_fornitori_voci || []).slice().sort(function(a, b) { return a.posizione - b.posizione; });
    const base = {
      fonte: 'ordine',
      fornitore: o.fornitore_ragione_sociale || '',
      riferimento: 'Ordine ' + o.codice,
      stato: o.stato,
      etichettaStato: ETICHETTE_STATO_ORDINE_FORNITORE[o.stato] || o.stato,
      classeStato: classeStatoOrdineFornitore(o.stato),
      arrivoPrevisto: o.arrivo_previsto || '',
      dataArrivo: o.data_arrivo || '',
      arrivato: arrivato,
      inRitardo: inRitardo,
      nota: ''
    };
    if (!voci.length) {
      righe.push(Object.assign({}, base, { cosa: '🛒 Materiale dell\'ordine', quantita: '' }));
      return;
    }
    voci.forEach(function(voce) {
      righe.push(Object.assign({}, base, {
        cosa: '🛒 ' + (voce.descrizione || ''),
        quantita: quantitaLeggibileOrdine(voce.quantita) + ' ' + (voce.unita_misura || '')
      }));
    });
  });

  (richieste || []).forEach(function(r) {
    if (r.stato === 'annullata') return;
    const tipo = TIPI_RICHIESTA_INTEGRAZIONE[r.tipo] || { icona: '', nome: r.tipo };
    const arrivato = r.stato === 'arrivata';
    const unita = numeroPreventivo(r.quantita) === 1 && r.unita_misura === 'giorni' ? 'giorno' : (r.unita_misura || '');
    const tardi = !arrivato && r.serve_dal && r.arrivo_previsto && r.arrivo_previsto > r.serve_dal;
    righe.push({
      fonte: 'richiesta',
      cosa: tipo.icona + ' ' + (r.descrizione || ''),
      quantita: quantitaLeggibileOrdine(r.quantita) + ' ' + unita,
      fornitore: r.fornitore_nome || '',
      riferimento: tipo.nome + ' n. ' + r.numero,
      stato: r.stato,
      etichettaStato: ETICHETTE_STATO_RICHIESTA_INTEGRAZIONE[r.stato] || r.stato,
      classeStato: classeStatoRichiestaIntegrazione(r.stato),
      arrivoPrevisto: r.arrivo_previsto || '',
      dataArrivo: r.data_arrivo || '',
      arrivato: arrivato,
      inRitardo: r.stato === 'evasa' && !!r.arrivo_previsto && r.arrivo_previsto < oggi,
      nota: [testoQuandoServeRichiesta(r), tardi ? 'arriva dopo il giorno in cui serve' : ''].filter(Boolean).join(' · ')
    });
  });

  (offerteDaOrdinare || []).forEach(function(o) {
    const tipologia = tipologiaLeggibileOrdine(o.tipologia);
    righe.push({
      fonte: 'offerta',
      cosa: '🛒 Fornitura' + (tipologia ? ' ' + tipologia : '') + ' (offerta scelta nel preventivo)',
      quantita: '',
      fornitore: o.ragione_sociale || '',
      riferimento: o.tempi_consegna_proposti ? 'consegna proposta: ' + o.tempi_consegna_proposti : '',
      stato: 'da_ordinare',
      etichettaStato: 'Da ordinare',
      classeStato: 'bwarn',
      arrivoPrevisto: '',
      dataArrivo: '',
      arrivato: false,
      inRitardo: false,
      nota: ''
    });
  });

  // Prima i ritardi, poi quello che arriva (per data), poi quello senza
  // data (da ordinare, da evadere), in fondo l'arrivato.
  function gruppo(r) {
    if (r.arrivato) return 3;
    if (r.inRitardo) return 0;
    return r.arrivoPrevisto ? 1 : 2;
  }
  righe.sort(function(a, b) {
    return (gruppo(a) - gruppo(b)) ||
      String(a.arrivato ? a.dataArrivo : a.arrivoPrevisto).localeCompare(String(b.arrivato ? b.dataArrivo : b.arrivoPrevisto));
  });

  return righe;
}

function htmlArrivoMateriale(r) {
  if (r.arrivato) return '<span style="color:var(--g);font-weight:600">arrivato il ' + esc(fd(r.dataArrivo)) + '</span>';
  if (r.inRitardo) return '<span style="color:var(--r);font-weight:700">⚠️ arrivo previsto ' + esc(fd(r.arrivoPrevisto)) + ' (in ritardo)</span>';
  if (r.arrivoPrevisto) return '<span style="font-weight:600">arrivo previsto ' + esc(fd(r.arrivoPrevisto)) + '</span>';
  if (r.fonte === 'offerta') return '<span style="color:var(--a);font-weight:600">nessuna data: da ordinare</span>';
  return '<span style="color:var(--a);font-weight:600">nessuna data: in attesa degli acquisti</span>';
}

function htmlRigaMateriale(r) {
  const dettagli = [
    r.fornitore ? '🏭 ' + esc(r.fornitore) : '',
    r.riferimento ? esc(r.riferimento) : '',
    htmlArrivoMateriale(r),
    r.nota ? '<span style="color:var(--a)">' + esc(r.nota) + '</span>' : ''
  ].filter(Boolean).join(' · ');

  return `
    <div style="padding:7px 0;border-bottom:1px solid var(--bo)${r.inRitardo ? ';background:var(--rl)' : ''}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">
        <div style="font-weight:700;min-width:0;flex:1;word-break:break-word">
          ${esc(r.cosa)}${r.quantita ? ` <span style="font-weight:400;color:var(--m)">· ${esc(r.quantita.trim())}</span>` : ''}
        </div>
        <span class="bx ${esc(r.classeStato)}">${esc(r.etichettaStato)}</span>
      </div>
      <div style="font-size:12px;color:var(--m);word-break:break-word">${dettagli}</div>
    </div>
  `;
}

// Riga su "materiali ordinati". Lo stato lo segna il rappresentante
// (sql/28): qui solo l'informazione, il bottone resta nel box Ordini.
function htmlStatoOrdinatoMateriali(commessa, fonti, offerteDaOrdinare, vedeOfferte) {
  if (statiCommessaDisponibili === true && commessa.stato !== 'approvata') {
    if (commessa.stato === 'annullata') return '';
    return '<div class="al2 ok" style="margin:0 0 8px">✅ Materiali ordinati: la commessa è già in "' +
      esc(ETICHETTE_STATO_COMMESSA[commessa.stato] || commessa.stato) + '".</div>';
  }
  if (!fonti.attiveOrdini) return '';

  if (vedeOfferte && offerteDaOrdinare !== null) {
    if (offerteDaOrdinare.length) {
      return '<div class="al2 w" style="margin:0 0 8px">Da ordinare: ' + offerteDaOrdinare.length +
        (offerteDaOrdinare.length === 1 ? ' offerta selezionata nel preventivo' : ' offerte selezionate nel preventivo') +
        ' (box "Ordini ai fornitori" qui sotto).</div>';
    }
    const nOrdini = fonti.ordini.filter(function(o) { return o.stato !== 'annullato'; }).length;
    if (!nOrdini) return '';
    return '<div class="al2 ok" style="margin:0 0 8px">Tutte le offerte selezionate sono ordinate.' +
      (statiCommessaDisponibili === true
        ? (['rappresentante', 'titolare'].includes(ROLE)
          ? ' Segna la commessa <b>Materiali ordinati</b> dal box "Ordini ai fornitori" qui sotto.'
          : ' Manca solo che il rappresentante segni la commessa <b>Materiali ordinati</b>.')
        : '') + '</div>';
  }

  // Capo tecnico e segreteria non vedono le offerte del preventivo.
  if (statiCommessaDisponibili === true) {
    return '<div class="al2 i" style="margin:0 0 8px">' +
      (ROLE === 'rappresentante' ? 'La commessa non è ancora segnata' : 'Il rappresentante non ha ancora segnato') +
      ' <b>Materiali ordinati</b>: l\'elenco degli ordini può non essere completo.</div>';
  }
  return '';
}

// ── Box nella scheda della commessa (chiamata da js/26) ─────────────
async function caricaMaterialiCommessa(commessa) {
  const box = ge('cmd-materiali');
  if (!box || !commessa) return;

  materialiCommessaAperta = [];
  box.innerHTML = '<div class="card"><div class="load">Caricamento materiali...</div></div>';

  const fonti = await leggiFontiMaterialiCommessa(commessa.id);
  if (commessaApertaId && commessaApertaId !== commessa.id) return; // aperta un'altra commessa

  if (!fonti.attiveOrdini && !fonti.attiveRichieste) {
    box.innerHTML = '';
    return;
  }

  // Offerte da ordinare: già lette da js/27 (caricaOrdiniCommessa) per i
  // ruoli che le vedono; null = non disponibili per chi guarda.
  const vedeOfferte = fonti.attiveOrdini && typeof RUOLI_CREANO_ORDINI !== 'undefined' && RUOLI_CREANO_ORDINI.includes(ROLE);
  const offerteLette = vedeOfferte && offerteCommessaLette && commessaOrdiniAperta && commessaOrdiniAperta.id === commessa.id;
  const offerteDaOrdinare = offerteLette
    ? (offerteCommessaAperta || []).filter(function(o) { return !o.ordine; })
    : null;

  const righe = righeMaterialiCommessa(fonti.ordini, fonti.richieste, offerteDaOrdinare || []);
  materialiCommessaAperta = righe;

  const daArrivare = righe.filter(function(r) { return !r.arrivato; });
  const arrivati = righe.filter(function(r) { return r.arrivato; });
  const inRitardo = righe.filter(function(r) { return r.inRitardo; }).length;
  const senzaData = daArrivare.filter(function(r) { return !r.arrivoPrevisto; }).length;

  const conteggi = [
    righe.length + (righe.length === 1 ? ' materiale' : ' materiali'),
    arrivati.length + (arrivati.length === 1 ? ' arrivato' : ' arrivati'),
    (daArrivare.length - senzaData - inRitardo) + ' in arrivo',
    inRitardo ? '<b style="color:var(--r)">' + inRitardo + ' in ritardo</b>' : '0 in ritardo',
    senzaData ? senzaData + ' senza data' : ''
  ].filter(Boolean).join(' · ');

  const nonAttive = [
    !fonti.attiveOrdini ? 'gli ordini ai fornitori non sono ancora attivi' : '',
    !fonti.attiveRichieste ? 'le richieste di consumabili e noli non sono ancora attive' : ''
  ].filter(Boolean).join(' e ');

  box.innerHTML = `
    <div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">📦 Materiali (${righe.length})</div>
      <div style="font-size:12px;color:var(--m);margin-bottom:8px">
        Tutto quello che deve arrivare in cantiere: materiali ordinati ai fornitori${fonti.attiveRichieste ? ', consumabili e noli' : ''}, con la data di arrivo.
        Le azioni (conferma, arrivato, evadi) sono nei box qui sotto.
      </div>
      ${fonti.errori.length ? `<div class="al2 e">Errore caricamento: ${esc(fonti.errori.join(' · '))}</div>` : ''}
      ${nonAttive ? `<div class="al2 i" style="margin:0 0 8px">Nell'elenco manca una parte: ${esc(nonAttive)}.</div>` : ''}
      ${htmlStatoOrdinatoMateriali(commessa, fonti, offerteDaOrdinare, vedeOfferte)}
      ${righe.length ? `<div style="font-size:12px;margin-bottom:6px">${conteggi}</div>` : ''}
      ${daArrivare.length
        ? daArrivare.map(htmlRigaMateriale).join('')
        : `<div class="empty">${righe.length ? 'Tutto arrivato.' : 'Nessun materiale ordinato o richiesto per questa commessa.'}</div>`}
      ${arrivati.length ? `
        <details style="margin-top:6px">
          <summary style="font-size:12px;cursor:pointer;color:var(--m)">Arrivati (${arrivati.length})</summary>
          ${arrivati.map(htmlRigaMateriale).join('')}
        </details>
      ` : ''}
    </div>
  `;
}

// ── Dashboard: materiali in ritardo ─────────────────────────────────
// Riepilogo di sola lettura (ordini e consumabili/noli con arrivo
// previsto passato e non arrivati) sulle commesse aperte. Capo tecnico:
// tutte; rappresentante: solo le commesse dei suoi clienti (le altre non
// le legge, policy di sql/26, 30 e 31).
const BOX_MATERIALI_RITARDO = {
  capo_tecnico: 'ct-materiali-ritardo',
  rappresentante: 'rap-materiali-ritardo'
};

async function caricaMaterialiInRitardoDashboard() {
  const box = ge(BOX_MATERIALI_RITARDO[ROLE] || '');
  if (!box) return;
  box.innerHTML = '';

  const [attiveOrdini, attiveRichieste] = await Promise.all([
    typeof verificaOrdiniFornitoriDisponibili === 'function' ? verificaOrdiniFornitoriDisponibili() : false,
    typeof verificaRichiesteIntegrazioneDisponibili === 'function' ? verificaRichiesteIntegrazioneDisponibili() : false
  ]);
  if (!attiveOrdini && !attiveRichieste) return;

  const oggi = dataOggiMateriali();
  const colonneCommessa = 'commesse(id, codice, stato, titolo, clienti(ragione_sociale))';

  const [ordiniRes, richiesteRes] = await Promise.all([
    attiveOrdini
      ? db.from('ordini_fornitori')
        .select('id, codice, stato, fornitore_ragione_sociale, arrivo_previsto, ordini_fornitori_voci(id), ' + colonneCommessa)
        .in('stato', ['ordinato', 'confermato'])
        .lt('arrivo_previsto', oggi)
        .order('arrivo_previsto', { ascending: true })
      : null,
    attiveRichieste
      ? db.from('commesse_richieste_integrazione')
        .select('id, numero, tipo, stato, descrizione, quantita, unita_misura, fornitore_nome, arrivo_previsto, ' + colonneCommessa)
        .eq('stato', 'evasa')
        .lt('arrivo_previsto', oggi)
        .order('arrivo_previsto', { ascending: true })
      : null
  ]);

  if (ordiniRes?.error) console.warn('Materiali in ritardo (ordini):', ordiniRes.error.message);
  if (richiesteRes?.error) console.warn('Materiali in ritardo (consumabili e noli):', richiesteRes.error.message);

  const voci = [];
  ((ordiniRes && !ordiniRes.error && ordiniRes.data) || []).forEach(function(o) {
    if (!o.commesse || !commessaAperta(o.commesse)) return;
    const n = (o.ordini_fornitori_voci || []).length;
    voci.push({
      commessa: o.commesse,
      arrivo: o.arrivo_previsto,
      testo: '🛒 Ordine ' + o.codice + ' · ' + (o.fornitore_ragione_sociale || '') +
        (n ? ' (' + n + (n === 1 ? ' voce' : ' voci') + ')' : '') + ' · ' + (ETICHETTE_STATO_ORDINE_FORNITORE[o.stato] || o.stato)
    });
  });
  ((richiesteRes && !richiesteRes.error && richiesteRes.data) || []).forEach(function(r) {
    if (!r.commesse || !commessaAperta(r.commesse)) return;
    voci.push({
      commessa: r.commesse,
      arrivo: r.arrivo_previsto,
      testo: testoCosaRichiestaIntegrazione(r) + (r.fornitore_nome ? ' · ' + r.fornitore_nome : '')
    });
  });

  if (!voci.length) return;
  voci.sort(function(a, b) { return String(a.arrivo).localeCompare(String(b.arrivo)); });

  box.innerHTML = `
    <div class="tit-section" style="margin-top:14px">⚠️ Materiali in ritardo (${voci.length})</div>
    <div class="rap-list-card" style="margin-bottom:14px">
      <div style="font-size:12px;color:var(--m);margin-bottom:4px">
        ${ROLE === 'rappresentante'
          ? 'Materiali delle commesse dei tuoi clienti con l\'arrivo previsto passato e non ancora arrivati: senti il fornitore (ordini) o gli acquisti (consumabili e noli) e, se serve, avvisa il cliente. L\'arrivo lo segna chi lo riceve.'
          : 'Arrivo previsto passato e non ancora arrivati. Se sono arrivati segnali nella commessa; altrimenti senti rappresentante (ordini) o acquisti (consumabili e noli).'}
      </div>
      ${voci.map(function(x) {
        const c = x.commessa;
        return `
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">
            <div style="min-width:0;flex:1">
              <div style="font-weight:700;word-break:break-word">${esc(c.codice)} · ${esc(c.clienti?.ragione_sociale || '')}</div>
              <div style="font-size:13px;word-break:break-word">${esc(x.testo)}</div>
              <div style="font-size:12px;color:var(--r);font-weight:700">arrivo previsto ${esc(fd(x.arrivo))} (in ritardo)</div>
            </div>
            ${canAccessPage('commessa-detail') ? `<button class="btn sm p" onclick="openCommessaDetail('${esc(c.id)}')">Apri commessa</button>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}
