// =====================================================================
// F8.5 — LAVORI EXTRA e FINE LAVORI della commessa (passi 11-12).
// Lavori extra: in cantiere il cliente chiede un lavoro in più; il capo
// tecnico (Capo Operativo) o il titolare lo registra sulla commessa
// (registra_lavoro_extra, sql/38). Il database crea il progetto tecnico
// del preventivo integrativo e lo manda al commerciale (lista "Da
// preventivare", js/17: "Avvia preventivo" come sempre); il rappresentante
// del cliente lo vede tra i suoi progetti e fa approvare il preventivo.
// Lo stato del lavoro extra segue il preventivo integrativo (trigger):
// richiesto → in_preventivo → accettato | rifiutato; annullato a mano.
// NON si esegue prima dell'accettazione: in cantiere compare in rosso
// "non eseguire"; accettato compare con le voci del preventivo SENZA
// prezzi (voci_lavori_extra_commessa) e si propone come lavorazione del
// giornale (js/35). Il preventivo integrativo accettato NON crea una
// commessa nuova (trigger di sql/38).
// Dove: scheda Cantiere (cmd-lavori-extra-avviso in cima,
// cmd-lavori-extra), riquadro in "Commessa e documenti"
// (cmd-lavori-extra-compatto), "Tocca a te" (js/26), dashboard di
// commerciale (com-lavori-extra), rappresentante (rap-lavori-extra) e
// capo tecnico (ct-lavori-extra), riepilogo dell'esito del preventivo
// integrativo (js/18).
// Fine lavori: quando la commessa è in "fine lavori" passa alla
// segreteria (passo 12). Il box "Commesse: tocca a te" della sua
// dashboard (js/18) c'era già; qui il riepilogo per la chiusura
// (cmd-chiusura) nella scheda della commessa, che funziona anche senza
// sql/38, e l'avviso sui lavori extra aperti quando si segna "Fine
// lavori" o "Chiusa" (finestra Stato e storico, js/18).
// Chi (sql/38): leggono i 5 ruoli che leggono la commessa; registrano
// capo tecnico e titolare; annullano (solo richiesto o rifiutato) capo
// tecnico, commerciale, rappresentante, titolare. Su commessa chiusa o
// annullata solo il titolare. Senza sql/38: "non ancora attivi".
// =====================================================================

const ETICHETTE_STATO_LAVORO_EXTRA = {
  richiesto: 'Da preventivare',
  in_preventivo: 'Preventivo integrativo in corso',
  accettato: 'Accettato: si può eseguire',
  rifiutato: 'Non accettato dal cliente',
  annullato: 'Annullato'
};

const ETICHETTE_STATO_PREVENTIVO_LAVORO_EXTRA = {
  bozza: 'in preparazione dal commerciale',
  in_attesa_approvazione: 'in preparazione',
  approvato: 'pronto per il cliente',
  inviato: 'inviato al cliente',
  inviato_a_rappresentante: 'dal rappresentante, da far approvare',
  in_attesa_anticipo: 'accettato, in attesa dell\'anticipo',
  accettato: 'accettato',
  rifiutato: 'rifiutato',
  scaduto: 'scaduto'
};

const RUOLI_REGISTRANO_LAVORI_EXTRA = ['titolare', 'capo_tecnico'];
const RUOLI_ANNULLANO_LAVORI_EXTRA = ['titolare', 'capo_tecnico', 'commerciale', 'rappresentante'];

let lavoriExtraDisponibili = null;
// Riepilogo per "Tocca a te": { id_commessa: { richiesti, bozze, daApprovare, inAttesa, accettati } }
let riepilogoLavoriExtraCommesse = {};
// Lavori extra caricati (scheda e dashboard): { id: lavoro }, con la sua commessa in r.commesse.
let lavoriExtraCache = {};
let lavoriExtraAperti = null;   // { commessa, lavori, voci } della scheda aperta
let lavoroExtraInAnnullamento = null;

// ── Disponibilità di sql/38 ─────────────────────────────────────────
async function verificaLavoriExtraDisponibili() {
  if (lavoriExtraDisponibili !== null) return lavoriExtraDisponibili;
  if (!(await verificaCommesseDisponibili())) return false;

  const { error } = await db
    .from('commesse_lavori_extra')
    .select('id')
    .limit(1);

  if (!error) {
    lavoriExtraDisponibili = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /commesse_lavori_extra/i.test(error.message || '')) {
    lavoriExtraDisponibili = false;
  } else {
    return false;
  }
  return lavoriExtraDisponibili;
}

// true solo dopo la verifica e con sql/38 eseguito.
function lavoriExtraAttivi() {
  return lavoriExtraDisponibili === true;
}

// ── Chi può fare cosa (le stesse regole le impone il database) ──────
function commessaModificabileLavoriExtra(commessa) {
  return ROLE === 'titolare' || commessaAperta(commessa);
}

function puoRegistrareLavoroExtra(commessa) {
  return RUOLI_REGISTRANO_LAVORI_EXTRA.includes(ROLE) && commessaModificabileLavoriExtra(commessa);
}

function puoAnnullareLavoroExtra(commessa, r) {
  return ['richiesto', 'rifiutato'].includes(r.stato) &&
    RUOLI_ANNULLANO_LAVORI_EXTRA.includes(ROLE) && commessaModificabileLavoriExtra(commessa);
}

// Stati del progetto in cui il preventivo tocca al commerciale (come la
// lista "Da preventivare", js/17). Con "Rimanda indietro" (js/18) o
// "Richiedi integrazione" il progetto va al rappresentante (da_integrare,
// poi bozza) o all'ingegnere (in_verifica_tecnica): lì il commerciale
// aspetta. Stato del progetto letto con progetti_tecnici(stato): il capo
// tecnico non lo legge (RLS) e per lui resta vuoto.
const STATI_PROGETTO_LAVORO_EXTRA_AL_COMMERCIALE = ['inviato_a_commerciale', 'pronto_per_preventivo', 'in_preventivazione'];

function statoProgettoLavoroExtra(r) {
  return (r && r.progetti_tecnici && r.progetti_tecnici.stato) || null;
}

// true se il progetto è dal commerciale (o se lo stato non si legge).
function progettoLavoroExtraAlCommerciale(r) {
  const stato = statoProgettoLavoroExtra(r);
  return !stato || STATI_PROGETTO_LAVORO_EXTRA_AL_COMMERCIALE.includes(stato);
}

// Il preventivo (o il progetto) aspetta il commerciale.
function lavoroExtraDaPreparare(r) {
  return (r.stato === 'richiesto' || (r.stato === 'in_preventivo' && r.preventivo_stato === 'bozza')) &&
    progettoLavoroExtraAlCommerciale(r);
}

// "rimandato al rappresentante / all'ingegnere" (vuoto se non rimandato).
function testoRimandoLavoroExtra(r) {
  if (!(r.stato === 'richiesto' || (r.stato === 'in_preventivo' && r.preventivo_stato === 'bozza'))) return '';
  const stato = statoProgettoLavoroExtra(r);
  if (stato === 'da_integrare' || stato === 'bozza') return 'rimandato al rappresentante';
  if (stato === 'in_verifica_tecnica') return 'rimandato all\'ingegnere (verifica tecnica)';
  return '';
}

// Il preventivo integrativo lo prepara chi prepara i preventivi dal
// progetto tecnico (js/17 avviaPreventivo): commerciale e titolare, solo
// con il progetto dal commerciale.
function puoPreparareLavoroExtra(commessa, r) {
  if (!['commerciale', 'titolare'].includes(ROLE) || !commessaModificabileLavoriExtra(commessa)) return false;
  return lavoroExtraDaPreparare(r);
}

// Ancora da decidere con il cliente: in cantiere NON si esegue.
function lavoroExtraInAttesa(r) {
  return r && (r.stato === 'richiesto' || r.stato === 'in_preventivo');
}

// ── Piccoli aiuti ───────────────────────────────────────────────────
function classeStatoLavoroExtra(stato) {
  if (stato === 'accettato') return 'bok';
  if (stato === 'annullato') return 'bgray';
  if (stato === 'rifiutato') return 'berr';
  if (stato === 'in_preventivo') return 'bblue';
  return 'bwarn';
}

function badgeStatoLavoroExtra(stato) {
  return `<span class="bx ${classeStatoLavoroExtra(stato)}">${esc(ETICHETTE_STATO_LAVORO_EXTRA[stato] || stato || '—')}</span>`;
}

function testoPreventivoLavoroExtra(r) {
  const rimando = testoRimandoLavoroExtra(r);
  if (!r.preventivo_numero) {
    if (r.stato !== 'richiesto') return '';
    return rimando ? 'preventivo integrativo: progetto ' + rimando : 'preventivo integrativo da preparare (commerciale)';
  }
  const stato = rimando || ETICHETTE_STATO_PREVENTIVO_LAVORO_EXTRA[r.preventivo_stato] || r.preventivo_stato || '';
  return 'preventivo integrativo n. ' + r.preventivo_numero + (stato ? ' · ' + stato : '');
}

function quantitaVoceLavoroExtra(voce) {
  if (typeof quantitaLavorazione === 'function') return quantitaLavorazione(voce).trim();
  return String(voce.quantita ?? '') + ' ' + (voce.unita_misura || '');
}

// ── Riepilogo per "Tocca a te" (chiamata da js/26) ──────────────────
// commessaId: una sola commessa (scheda) o null (tutte quelle visibili).
async function caricaRiepilogoLavoriExtra(commessaId) {
  if (!(await verificaLavoriExtraDisponibili())) return;

  let query = db
    .from('commesse_lavori_extra')
    .select('commessa_id, stato, preventivo_stato, progetti_tecnici(stato)')
    .in('stato', ['richiesto', 'in_preventivo', 'accettato']);
  if (commessaId) query = query.eq('commessa_id', commessaId);

  const { data, error } = await query;
  if (error) {
    console.warn('Riepilogo lavori extra:', error.message);
    return;
  }

  if (commessaId) delete riepilogoLavoriExtraCommesse[commessaId];
  else riepilogoLavoriExtraCommesse = {};

  (data || []).forEach(function(r) {
    const voce = riepilogoLavoriExtraCommesse[r.commessa_id] ||
      (riepilogoLavoriExtraCommesse[r.commessa_id] = { richiesti: 0, bozze: 0, daApprovare: 0, inAttesa: 0, accettati: 0 });
    // Solo se il progetto è dal commerciale (non rimandato indietro).
    if (r.stato === 'richiesto' && lavoroExtraDaPreparare(r)) voce.richiesti++;
    if (r.stato === 'in_preventivo' && lavoroExtraDaPreparare(r)) voce.bozze++;
    if (r.stato === 'in_preventivo' && ['inviato_a_rappresentante', 'inviato', 'approvato'].includes(r.preventivo_stato)) voce.daApprovare++;
    if (lavoroExtraInAttesa(r)) voce.inAttesa++;
    if (r.stato === 'accettato') voce.accettati++;
  });
}

// Motivi "Tocca a te" dei lavori extra (commessa aperta, mai il
// titolare: il controllo lo fa già motiviToccaAMeCommessa in js/26).
function motiviLavoriExtraCommessa(commessa) {
  if (!lavoriExtraAttivi() || !commessa) return [];
  const voce = riepilogoLavoriExtraCommesse[commessa.id];
  if (!voce) return [];

  const motivi = [];
  if (ROLE === 'commerciale' && (voce.richiesti || voce.bozze)) {
    const n = voce.richiesti + voce.bozze;
    motivi.push(n + (n === 1 ? ' lavoro extra chiesto' : ' lavori extra chiesti') +
      ' in cantiere: prepara il preventivo integrativo (lista Da preventivare)');
  }
  if (ROLE === 'rappresentante' && voce.daApprovare) {
    motivi.push(voce.daApprovare + (voce.daApprovare === 1 ? ' preventivo integrativo' : ' preventivi integrativi') +
      ' per lavori extra: fallo approvare dal cliente');
  }
  return motivi;
}

// ── Box nella scheda della commessa (chiamata da js/26) ─────────────
async function caricaLavoriExtraCommessa(commessa) {
  const box = ge('cmd-lavori-extra');
  const avviso = ge('cmd-lavori-extra-avviso');
  const compatto = ge('cmd-lavori-extra-compatto');
  if (!box || !commessa) return;
  lavoriExtraAperti = null;
  if (avviso) avviso.innerHTML = '';
  if (compatto) compatto.innerHTML = '';

  if (!(await verificaLavoriExtraDisponibili())) {
    box.innerHTML = `
      <div class="card lex-card">
        <div class="cant-titolo">➕ Lavori extra</div>
        <div class="al2 i" style="margin:0">I lavori extra chiesti in cantiere non sono ancora attivi.</div>
      </div>
    `;
    return;
  }

  box.innerHTML = '<div class="card lex-card"><div class="load">Caricamento lavori extra...</div></div>';

  const { data, error } = await db
    .from('commesse_lavori_extra')
    .select('*, progetti_tecnici(stato)')
    .eq('commessa_id', commessa.id)
    .order('numero', { ascending: true });

  if (commessaApertaId && commessaApertaId !== commessa.id) return; // aperta un'altra commessa

  if (error) {
    box.innerHTML = `<div class="card lex-card"><div class="al2 e">Errore caricamento lavori extra: ${esc(error.message)}</div></div>`;
    return;
  }

  const lavori = data || [];
  lavori.forEach(function(r) {
    r.commesse = commessa;
    lavoriExtraCache[r.id] = r;
  });

  // Voci dei preventivi integrativi accettati, senza prezzi.
  let voci = {};
  let erroreVoci = '';
  if (lavori.some(function(r) { return r.stato === 'accettato'; })) {
    const rVoci = await db.rpc('voci_lavori_extra_commessa', { p_commessa_id: commessa.id });
    if (rVoci.error) erroreVoci = rVoci.error.message;
    else (rVoci.data || []).forEach(function(x) { voci[x.lavoro_extra_id] = x.voci || []; });
    if (commessaApertaId && commessaApertaId !== commessa.id) return;
  }

  lavoriExtraAperti = { commessa: commessa, lavori: lavori, voci: voci };
  disegnaLavoriExtraCommessa(erroreVoci);
}

function disegnaLavoriExtraCommessa(erroreVoci) {
  const s = lavoriExtraAperti;
  const box = ge('cmd-lavori-extra');
  if (!s || !box) return;
  const commessa = s.commessa;

  const visibili = s.lavori.filter(function(r) { return r.stato !== 'annullato'; });
  const annullati = s.lavori.filter(function(r) { return r.stato === 'annullato'; });
  const inAttesa = s.lavori.filter(lavoroExtraInAttesa);
  const accettati = s.lavori.filter(function(r) { return r.stato === 'accettato'; });

  const bottone = puoRegistrareLavoroExtra(commessa)
    ? `<button class="btn p cant-azione lex-azione" onclick="apriNuovoLavoroExtra()">➕ Il cliente chiede un lavoro extra</button>`
    : '';

  box.innerHTML = `
    <div class="card lex-card">
      <div class="cant-titolo">➕ Lavori extra (${visibili.length})</div>
      <div style="font-size:12px;color:var(--m);margin-bottom:8px">
        Lavori chiesti dal cliente in cantiere, fuori dal preventivo: vanno al commerciale per il preventivo integrativo.
        <b>Si eseguono solo dopo che il cliente lo ha accettato.</b>
      </div>
      ${bottone}
      ${erroreVoci ? `<div class="al2 e" style="margin:6px 0">Voci dei preventivi integrativi non disponibili: ${esc(erroreVoci)}</div>` : ''}
      ${visibili.length
        ? visibili.map(function(r) { return htmlLavoroExtra(commessa, r, s.voci[r.id], false); }).join('')
        : '<div class="empty">Nessun lavoro extra per questa commessa.</div>'}
      ${annullati.length ? `
        <details style="margin-top:8px">
          <summary style="font-size:12px;cursor:pointer;color:var(--m)">Annullati (${annullati.length})</summary>
          ${annullati.map(function(r) { return htmlLavoroExtra(commessa, r, null, false); }).join('')}
        </details>
      ` : ''}
    </div>
  `;

  // In cima alla scheda Cantiere: cosa NON eseguire ancora.
  const avviso = ge('cmd-lavori-extra-avviso');
  if (avviso) {
    avviso.innerHTML = inAttesa.length ? `
      <div class="al2 e lex-avviso">
        ⛔ <b>${inAttesa.length === 1 ? '1 lavoro extra' : inAttesa.length + ' lavori extra'} in attesa del preventivo integrativo: NON eseguirli.</b>
        <div style="font-size:12px;margin-top:2px">${inAttesa.map(function(r) { return 'n. ' + esc(r.numero) + ' ' + esc(r.descrizione); }).join(' · ')}</div>
        <button class="btn sm" style="margin-top:6px" onclick="ge('cmd-lavori-extra')?.scrollIntoView({behavior:'smooth',block:'start'})">Vedi i lavori extra</button>
      </div>
    ` : '';
  }

  // In "Commessa e documenti": il riquadro in breve.
  const compatto = ge('cmd-lavori-extra-compatto');
  if (compatto) {
    compatto.innerHTML = visibili.length ? `
      <div class="card lex-card">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
          <div style="font-size:14px;font-weight:700">➕ Lavori extra (${visibili.length})</div>
          <button class="btn sm" onclick="vaiAiLavoriExtra()">Apri</button>
        </div>
        <div style="font-size:12px;margin-top:4px">
          ${[
            inAttesa.length ? '<span style="color:var(--r);font-weight:600">' + inAttesa.length + ' in attesa del preventivo integrativo</span>' : '',
            accettati.length ? '<span style="color:var(--g);font-weight:600">' + accettati.length + (accettati.length === 1 ? ' accettato' : ' accettati') + '</span>' : '',
            visibili.length - inAttesa.length - accettati.length ? (visibili.length - inAttesa.length - accettati.length) + ' non accettati dal cliente' : ''
          ].filter(Boolean).join(' · ')}
        </div>
        ${visibili.map(function(r) {
          return `<div style="font-size:12px;margin-top:4px;overflow-wrap:anywhere">n. ${esc(r.numero)} ${badgeStatoLavoroExtra(r.stato)} ${esc(r.descrizione)}${r.preventivo_numero ? ' <span style="color:var(--m)">· preventivo n. ' + esc(r.preventivo_numero) + '</span>' : ''}</div>`;
        }).join('')}
      </div>
    ` : '';
  }
}

function vaiAiLavoriExtra() {
  if (typeof mostraTabCommessa === 'function') mostraTabCommessa('cantiere');
  setTimeout(function() { ge('cmd-lavori-extra')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
}

// Un lavoro extra (scheda della commessa o dashboard). conCommessa:
// mostra codice e cliente e il bottone per aprire la commessa.
function htmlLavoroExtra(commessa, r, voci, conCommessa) {
  const bottoni = [];
  if (puoPreparareLavoroExtra(commessa, r)) {
    bottoni.push(`<button class="btn sm p" onclick="preparaPreventivoLavoroExtra('${esc(r.id)}')">🧾 ${r.stato === 'richiesto' ? 'Prepara il preventivo integrativo' : 'Riprendi il preventivo'}</button>`);
  }
  if (r.preventivo_id && canAccessPage('preventivo-detail') && !puoPreparareLavoroExtra(commessa, r)) {
    bottoni.push(`<button class="btn sm" onclick="openPreventivoDetail('${esc(r.preventivo_id)}')">🧾 Preventivo n. ${esc(r.preventivo_numero || '')}</button>`);
  }
  if (ROLE === 'rappresentante' && r.stato === 'in_preventivo' && canAccessPage('preventivi-rapp') &&
      ['inviato_a_rappresentante', 'inviato', 'approvato'].includes(r.preventivo_stato)) {
    bottoni.push(`<button class="btn sm p" onclick="gotoPage('preventivi-rapp')">🧾 I miei preventivi</button>`);
  }
  if (canAccessPage('progetto-detail') && r.progetto_tecnico_id && ['commerciale', 'rappresentante', 'titolare'].includes(ROLE)) {
    bottoni.push(`<button class="btn sm" onclick="openProgettoDetail('${esc(r.progetto_tecnico_id)}')">📐 Progetto</button>`);
  }
  if (puoAnnullareLavoroExtra(commessa, r)) {
    bottoni.push(`<button class="btn sm" style="color:var(--r)" onclick="apriAnnullaLavoroExtra('${esc(r.id)}')">Annulla</button>`);
  }
  if (conCommessa && canAccessPage('commessa-detail')) {
    bottoni.push(`<button class="btn sm" onclick="openCommessaDetail('${esc(commessa.id)}')">Apri commessa</button>`);
  }

  const titolo = conCommessa
    ? esc(commessa.codice) + ' · ' + esc(commessa.clienti?.ragione_sociale || '') + ' · extra n. ' + esc(r.numero)
    : 'Extra n. ' + esc(r.numero);

  let esecuzione = '';
  if (lavoroExtraInAttesa(r)) {
    esecuzione = '<div class="lex-stop">⛔ Non eseguire: aspetta il preventivo integrativo accettato</div>';
  } else if (r.stato === 'accettato') {
    esecuzione = '<div class="lex-via">✅ Accettato dal cliente' + (r.esito_il ? ' il ' + esc(new Date(r.esito_il).toLocaleDateString('it-IT')) : '') + ': si può eseguire</div>';
  } else if (r.stato === 'rifiutato') {
    esecuzione = '<div class="lex-stop">✕ Il cliente non lo ha accettato: non si esegue' + (r.motivo_rifiuto ? ' (' + esc(r.motivo_rifiuto) + ')' : '') + '</div>';
  }

  const elencoVoci = r.stato === 'accettato' && voci && voci.length ? `
    <div style="margin-top:4px">
      ${voci.map(function(voce) {
        return `
          <div class="lex-voce">
            <div style="min-width:0;flex:1;overflow-wrap:anywhere">${esc(voce.descrizione)}${voce.categoria && voce.categoria !== 'materiale' && typeof ETICHETTE_CATEGORIA_LAVORAZIONE !== 'undefined' ? ` <span class="bx bgray">${esc(ETICHETTE_CATEGORIA_LAVORAZIONE[voce.categoria] || voce.categoria)}</span>` : ''}</div>
            <div class="lex-quantita">${esc(quantitaVoceLavoroExtra(voce))}</div>
          </div>
        `;
      }).join('')}
    </div>
  ` : '';

  const preventivo = testoPreventivoLavoroExtra(r);

  return `
    <div class="lex-riga"${r.stato === 'annullato' ? ' style="opacity:.65"' : ''}>
      <div style="font-weight:700;overflow-wrap:anywhere">${titolo} ${badgeStatoLavoroExtra(r.stato)}</div>
      <div style="font-size:14px;overflow-wrap:anywhere;margin-top:2px">${esc(r.descrizione)}</div>
      ${r.dettagli ? `<div style="font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:2px">${esc(r.dettagli)}</div>` : ''}
      ${preventivo ? `<div style="font-size:12px;color:var(--m);margin-top:2px">${esc(preventivo)}</div>` : ''}
      ${esecuzione}
      ${elencoVoci}
      ${bottoni.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${bottoni.join('')}</div>` : ''}
      <details style="margin-top:4px">
        <summary style="font-size:12px;cursor:pointer;color:var(--m)">Dettagli e passaggi</summary>
        ${htmlDettaglioLavoroExtra(r)}
      </details>
    </div>
  `;
}

function htmlDettaglioLavoroExtra(r) {
  const righe = [];
  righe.push('Registrato il ' + dataOraEsitoPreventivo(r.richiesto_il) +
    (r.richiesto_da_nome ? ' da ' + r.richiesto_da_nome + (r.richiesto_da_ruolo ? ' (' + etichettaRuolo(r.richiesto_da_ruolo) + ')' : '') : ''));
  if (r.chiesto_da_cliente) righe.push('Lo ha chiesto per il cliente: ' + r.chiesto_da_cliente);
  righe.push('Arriva al commerciale nella lista "Da preventivare" e al rappresentante tra i suoi progetti.');
  if (r.preventivo_numero) righe.push('Preventivo integrativo n. ' + r.preventivo_numero + ': ' + (ETICHETTE_STATO_PREVENTIVO_LAVORO_EXTRA[r.preventivo_stato] || r.preventivo_stato || ''));
  if (r.esito_il && r.stato !== 'annullato') righe.push('Esito del cliente il ' + dataOraEsitoPreventivo(r.esito_il));
  if (r.annullato_il) {
    righe.push('Annullato il ' + dataOraEsitoPreventivo(r.annullato_il) + (r.annullato_da_nome ? ' da ' + r.annullato_da_nome : '') +
      ': ' + (r.motivo_annullamento || ''));
  }
  return `
    <div style="font-size:12px;color:var(--m);margin-top:4px">
      ${righe.map(function(p) { return '<div style="overflow-wrap:anywhere">• ' + esc(p) + '</div>'; }).join('')}
    </div>
  `;
}

// ── Nuovo lavoro extra (capo tecnico, titolare) ─────────────────────
function apriNuovoLavoroExtra() {
  const commessa = lavoriExtraAperti && lavoriExtraAperti.commessa;
  if (!commessa) return;

  ge('mle-sottotitolo').textContent = 'Commessa ' + commessa.codice +
    (commessa.clienti?.ragione_sociale ? ' · ' + commessa.clienti.ragione_sociale : '') +
    (commessa.titolo ? ' · ' + commessa.titolo : '');
  ge('mle-descrizione').value = '';
  ge('mle-dettagli').value = '';
  ge('mle-chiesto').value = '';
  ge('mle-conferma').disabled = false;
  openM('m-lavoro-extra');
  setTimeout(function() { ge('mle-descrizione')?.focus(); }, 50);
}

async function salvaNuovoLavoroExtra() {
  const commessa = lavoriExtraAperti && lavoriExtraAperti.commessa;
  if (!commessa) return;

  const descrizione = v('mle-descrizione').trim();
  const dettagli = v('mle-dettagli').trim();
  const chiesto = v('mle-chiesto').trim();

  if (!descrizione) { toast('Scrivi quale lavoro extra chiede il cliente', 'err'); return; }
  if (descrizione.length > 500) { toast('Descrizione troppo lunga (massimo 500 caratteri): metti il resto nei dettagli', 'err'); return; }

  const bottone = ge('mle-conferma');
  bottone.disabled = true;

  const { error } = await db.rpc('registra_lavoro_extra', {
    p_commessa_id: commessa.id,
    p_descrizione: descrizione,
    p_dettagli: dettagli || null,
    p_chiesto_da_cliente: chiesto || null
  });

  if (error) {
    bottone.disabled = false;
    toast('Lavoro extra non registrato: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-lavoro-extra');
  toast('Lavoro extra inviato al commerciale per il preventivo integrativo. Non eseguirlo prima dell\'accettazione.', 'ok');
  await aggiornaDopoLavoroExtra();
}

// ── Annullamento ────────────────────────────────────────────────────
function apriAnnullaLavoroExtra(lavoroId) {
  const r = lavoriExtraCache[lavoroId];
  if (!r) {
    toast('Lavoro extra non trovato: ricarica la pagina', 'err');
    return;
  }
  lavoroExtraInAnnullamento = lavoroId;
  const commessa = r.commesse || {};
  ge('mla-sottotitolo').textContent = 'Commessa ' + (commessa.codice || '') + ' · extra n. ' + r.numero + ' · ' + r.descrizione;
  ge('mla-motivo').value = '';
  ge('mla-conferma').disabled = false;
  openM('m-annulla-lavoro-extra');
  setTimeout(function() { ge('mla-motivo')?.focus(); }, 50);
}

async function salvaAnnullaLavoroExtra() {
  const id = lavoroExtraInAnnullamento;
  if (!id) return;
  const motivo = v('mla-motivo').trim();
  if (!motivo) { toast('Scrivi il motivo dell\'annullamento', 'err'); return; }

  const bottone = ge('mla-conferma');
  bottone.disabled = true;

  const { error } = await db.rpc('annulla_lavoro_extra', { p_lavoro_id: id, p_motivo: motivo });

  if (error) {
    bottone.disabled = false;
    toast('Lavoro extra non annullato: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-annulla-lavoro-extra');
  lavoroExtraInAnnullamento = null;
  toast('Lavoro extra annullato', 'ok');
  await aggiornaDopoLavoroExtra();
}

// ── Preventivo integrativo (commerciale, titolare) ──────────────────
// Stesso percorso della lista "Da preventivare" (js/17): bozza dal
// progetto tecnico del lavoro extra, poi la scheda del preventivo.
async function preparaPreventivoLavoroExtra(lavoroId) {
  const r = lavoriExtraCache[lavoroId];
  if (!r || !r.progetto_tecnico_id) {
    toast('Lavoro extra non trovato: ricarica la pagina', 'err');
    return;
  }
  if (typeof avviaPreventivo !== 'function') {
    toast('Apri la lista Da preventivare per preparare il preventivo', 'err');
    return;
  }
  await avviaPreventivo(r.progetto_tecnico_id);
}

// ── Lavorazioni del giornale (chiamata da js/35) ────────────────────
// Le voci dei preventivi integrativi accettati, come proposte di
// lavorazione (le non accettate non si propongono: non si eseguono).
async function proposteLavorazioniLavoriExtra(commessaId) {
  if (!(await verificaLavoriExtraDisponibili())) return [];
  const { data, error } = await db.rpc('voci_lavori_extra_commessa', { p_commessa_id: commessaId });
  if (error) {
    console.warn('Lavori extra per le lavorazioni:', error.message);
    return [];
  }
  const proposte = [];
  (data || []).forEach(function(x) {
    (x.voci || []).forEach(function(voce) {
      const inOre = typeof unitaInOre === 'function' && unitaInOre(voce.unita_misura);
      const nome = ('Extra n. ' + x.numero + ': ' + String(voce.descrizione || '').trim()).slice(0, 200);
      if (!String(voce.descrizione || '').trim()) return;
      proposte.push({
        nome: nome,
        unita_misura: voce.unita_misura || null,
        quantita: voce.quantita === null || voce.quantita === undefined ? null : Number(voce.quantita),
        ore_stimate: inOre && Number(voce.quantita) >= 0 ? Math.round(Number(voce.quantita) * 4) / 4 : '',
        categoria: voce.categoria,
        spuntata: ['manodopera', 'servizio'].includes(voce.categoria) || inOre
      });
    });
  });
  return proposte;
}

// ── Avviso nella finestra "Stato e storico" (chiamata da js/18) ─────
// Fine lavori o chiusura con lavori extra ancora da decidere.
async function htmlAvvisoLavoriExtraCambioStato(commessaId, prossimo) {
  if (!['fine_lavori', 'chiusa'].includes(prossimo)) return '';
  if (!(await verificaLavoriExtraDisponibili())) return '';
  const { data, error } = await db
    .from('commesse_lavori_extra')
    .select('numero, descrizione, stato')
    .eq('commessa_id', commessaId)
    .in('stato', ['richiesto', 'in_preventivo'])
    .order('numero', { ascending: true });
  if (error || !data || !data.length) return '';
  return `
    <div class="al2 w">
      <b>${data.length === 1 ? '1 lavoro extra è' : data.length + ' lavori extra sono'} ancora in attesa del preventivo integrativo</b>
      (${data.map(function(r) { return 'n. ' + esc(r.numero) + ' ' + esc(r.descrizione); }).join(' · ')}).
      ${prossimo === 'fine_lavori'
        ? 'Se il cliente lo accetta dopo la fine lavori, il titolare riporta la commessa "In corso" per eseguirlo.'
        : 'Prima di chiudere senti il rappresentante: accettato, va eseguito e fatturato.'}
    </div>
  `;
}

// ── Riepilogo per la chiusura (fine lavori → segreteria, passo 12) ──
// Chiamata da js/26 alla fine della scheda: riusa i dati già letti
// (cartella documenti, consumabili e noli, cronoprogramma, lavori extra).
async function caricaRiepilogoChiusuraCommessa(commessa) {
  const box = ge('cmd-chiusura');
  if (!box) return;
  box.innerHTML = '';
  if (!commessa || commessa.stato !== 'fine_lavori' || statiCommessaDisponibili !== true) return;

  // Chi ha segnato la fine dei lavori e quando (storico di sql/28).
  const { data: storico } = await db
    .from('commesse_storico')
    .select('cambiato_da_nome, cambiato_da_ruolo, cambiato_il, nota')
    .eq('commessa_id', commessa.id)
    .eq('a_stato', 'fine_lavori')
    .order('cambiato_il', { ascending: false })
    .limit(1);
  if (commessaApertaId && commessaApertaId !== commessa.id) return;
  const fine = storico && storico[0];

  const punti = [];

  // Avanzamento (js/34, se il cronoprogramma c'è).
  if (typeof cronoprogrammaAperto !== 'undefined' && cronoprogrammaAperto && cronoprogrammaAperto.commessa?.id === commessa.id &&
      typeof calcolaAvanzamentoFasi === 'function') {
    const av = calcolaAvanzamentoFasi(cronoprogrammaAperto.fasi);
    if (av.fasi) {
      punti.push(av.percentuale >= 100
        ? { ok: true, testo: 'Cronoprogramma: tutte le fasi al 100%' }
        : { ok: false, testo: 'Cronoprogramma al ' + av.percentuale + '%: senti il capo tecnico' });
    }
  }

  // Lavori extra (sql/38).
  const extra = lavoriExtraAperti && lavoriExtraAperti.commessa?.id === commessa.id ? lavoriExtraAperti.lavori : null;
  if (extra) {
    const accettati = extra.filter(function(r) { return r.stato === 'accettato'; });
    const inAttesa = extra.filter(lavoroExtraInAttesa);
    if (accettati.length) {
      punti.push({ ok: true, info: true, testo: 'Lavori extra accettati da fatturare con il loro preventivo integrativo: ' +
        accettati.map(function(r) { return 'n. ' + r.numero + (r.preventivo_numero ? ' (preventivo n. ' + r.preventivo_numero + ')' : ''); }).join(', ') });
    }
    if (inAttesa.length) {
      punti.push({ ok: false, testo: inAttesa.length + (inAttesa.length === 1 ? ' lavoro extra ancora in attesa' : ' lavori extra ancora in attesa') +
        ' del preventivo integrativo: senti il rappresentante prima di chiudere' });
    }
  }

  // Consumabili e noli ancora aperti (js/28, sql/31).
  if (typeof riepilogoRichiesteCommesse !== 'undefined' && typeof richiesteIntegrazioneAttive === 'function' && richiesteIntegrazioneAttive()) {
    const r = riepilogoRichiesteCommesse[commessa.id];
    const aperte = r ? (r.aperte || 0) + (r.evase || 0) : 0;
    if (aperte) punti.push({ ok: false, testo: aperte + (aperte === 1 ? ' consumabile o nolo non ancora arrivato' : ' consumabili e noli non ancora arrivati') + ': chiudili o annullali' });
  }

  // Documenti di chiusura (cartella "chiusura", sql/29).
  if (typeof documentiCommessaDisponibili !== 'undefined' && documentiCommessaDisponibili === true) {
    const docChiusura = (documentiCommessaAperta || []).filter(function(d) { return d.cartella === 'chiusura'; }).length;
    punti.push(docChiusura
      ? { ok: true, testo: 'Cartella Chiusura: ' + docChiusura + (docChiusura === 1 ? ' documento' : ' documenti') }
      : { ok: false, testo: (typeof puoGenerareDichiarazionePosa === 'function' && puoGenerareDichiarazionePosa(commessa)
          ? 'Cartella Chiusura vuota: genera la dichiarazione di corretta messa in opera (qui sotto) e carica collaudi e verbali'
          : 'Cartella Chiusura vuota: carica la dichiarazione di corretta messa in opera, collaudi e verbali') });
  }

  const puoChiudere = ['segreteria', 'titolare'].includes(ROLE);

  box.innerHTML = `
    <div class="card lex-card" style="border-left:4px solid var(--p)">
      <div style="font-size:14px;font-weight:700">🏁 Fine lavori: ora tocca alla segreteria</div>
      <div style="font-size:12px;color:var(--m);margin-top:2px">
        ${fine ? 'Segnata' + (fine.cambiato_da_nome ? ' da ' + esc(fine.cambiato_da_nome) + (fine.cambiato_da_ruolo ? ' (' + esc(etichettaRuolo(fine.cambiato_da_ruolo)) + ')' : '') : '') + ' il ' + esc(dataOraEsitoPreventivo(fine.cambiato_il)) : 'Lavori finiti in cantiere.'}
        Passo 12: corretta messa in opera, fatture, chiusura della commessa.
      </div>
      ${fine && fine.nota ? `<div style="font-size:12px;white-space:pre-wrap;margin-top:4px">Nota: ${esc(fine.nota)}</div>` : ''}
      ${punti.length ? `
        <div style="margin-top:8px">
          ${punti.map(function(p) {
            return `<div style="font-size:13px;padding:3px 0;overflow-wrap:anywhere">${p.ok ? (p.info ? '💶' : '✅') : '⚠️'} ${esc(p.testo)}</div>`;
          }).join('')}
        </div>
      ` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        ${typeof vaiABoxCommessa === 'function' ? `<button class="btn sm" onclick="vaiABoxCommessa('cmd-documenti')">📂 Cartella documenti</button>` : ''}
        ${puoChiudere ? `<button class="btn sm p" onclick="apriStatoCommessa('${esc(commessa.id)}', '${esc(commessa.preventivo_id || '')}')">✅ Chiudi la commessa</button>` : ''}
      </div>
    </div>
  `;
}

// ── Dashboard: commerciale, rappresentante, capo tecnico ────────────
const BOX_LAVORI_EXTRA_DASHBOARD = {
  commerciale: 'com-lavori-extra',
  rappresentante: 'rap-lavori-extra',
  capo_tecnico: 'ct-lavori-extra'
};

async function caricaLavoriExtraDashboard() {
  const box = ge(BOX_LAVORI_EXTRA_DASHBOARD[ROLE] || '');
  if (!box) return;

  if (!(await verificaLavoriExtraDisponibili())) {
    box.innerHTML = '';
    return;
  }

  const stati = ROLE === 'capo_tecnico' ? ['richiesto', 'in_preventivo', 'accettato'] : ['richiesto', 'in_preventivo'];

  const { data, error } = await db
    .from('commesse_lavori_extra')
    .select('*, progetti_tecnici(stato), commesse(id, codice, stato, titolo, preventivo_id, clienti(ragione_sociale))')
    .in('stato', stati)
    .order('richiesto_il', { ascending: true });

  if (error) {
    console.warn('Lavori extra in dashboard:', error.message);
    box.innerHTML = '';
    return;
  }

  let lavori = (data || []).filter(function(r) { return r.commesse && commessaAperta(r.commesse); });
  if (ROLE === 'capo_tecnico') {
    // Gli accettati solo finché il cantiere è aperto (prima di fine lavori).
    lavori = lavori.filter(function(r) { return r.stato !== 'accettato' || r.commesse.stato !== 'fine_lavori'; });
  }
  lavori.forEach(function(r) { lavoriExtraCache[r.id] = r; });

  if (!lavori.length) {
    box.innerHTML = '';
    return;
  }

  const titoli = {
    commerciale: '➕ Lavori extra da preventivare (' + lavori.length + ')',
    rappresentante: '➕ Lavori extra dei tuoi clienti (' + lavori.length + ')',
    capo_tecnico: '➕ Lavori extra in cantiere (' + lavori.length + ')'
  };
  const aiuti = {
    commerciale: 'Chiesti dal cliente in cantiere: prepara il preventivo integrativo (lo trovi anche in Da preventivare). Accettato, resta nella stessa commessa.',
    rappresentante: 'Chiesti dal cliente in cantiere: il commerciale prepara il preventivo integrativo, tu lo fai approvare. Finché non è accettato non si eseguono.',
    capo_tecnico: 'Si eseguono solo quelli accettati dal cliente; gli altri aspettano il preventivo integrativo.'
  };

  box.innerHTML = `
    <div class="tit-section" style="margin-top:14px">${esc(titoli[ROLE])}</div>
    <div class="rap-list-card" style="margin-bottom:14px">
      <div style="font-size:12px;color:var(--m);margin-bottom:4px">${esc(aiuti[ROLE])}</div>
      ${lavori.map(function(r) { return htmlLavoroExtra(r.commesse, r, null, true); }).join('')}
    </div>
  `;
}

// ── Aggiornamento dopo una modifica ─────────────────────────────────
async function aggiornaDopoLavoroExtra() {
  if (ge('pg-commessa-detail')?.classList.contains('on') && commessaApertaId) {
    await caricaSchedaCommessa(commessaApertaId);
    return;
  }
  if (ge('pg-commesse')?.classList.contains('on')) {
    await loadCommesse();
    return;
  }
  await caricaLavoriExtraDashboard();
}
