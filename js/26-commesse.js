// =====================================================================
// F5.3 — PAGINA COMMESSE e CARTELLA DOCUMENTI della commessa.
// Pagina "Commesse" (pg-commesse): elenco con filtro per stato e
// ricerca, in evidenza le commesse in cui tocca a chi guarda.
// Scheda della commessa (pg-commessa-detail): dati, sede del cantiere,
// stato e storico (js/18, solo con sql/28), cartella documenti unica
// (bucket commesse-documenti, sql/29).
// La commessa si ritrova anche dal cliente (scheda cliente, tab
// Commesse) e dal preventivo (riepilogo dell'esito, "Apri commessa").
// Ruoli (come la lettura delle commesse, sql/26): titolare, segreteria,
// commerciale, capo_tecnico, rappresentante (solo le sue). Il titolare
// può intervenire ovunque ma non ha mai commesse "in attesa di lui".
// Funziona con sql/26 soltanto (dati di base), con sql/28 (stati e
// storico) e con sql/29 (cartella documenti). Ordini ai fornitori: js/27
// (sql/30); consumabili e noli: js/28 (sql/31); elenco materiali: js/29;
// date dei lavori e faldone: js/31 (sql/33); scheda cantiere: js/32
// (sql/34); squadra del giorno: js/33 (sql/35); cronoprogramma e %
// di avanzamento: js/34 (sql/36).
// =====================================================================

// Cartelle dei documenti (stesso elenco del vincolo di sql/29).
const CARTELLE_DOCUMENTI_COMMESSA = [
  { id: 'ordini',      icona: '🛒', nome: 'Ordini ai fornitori',            aiuto: 'ordini, conferme d\'ordine, date di arrivo' },
  { id: 'ddt',         icona: '📦', nome: 'DDT e bolle di consegna',        aiuto: 'materiali arrivati' },
  { id: 'faldone',     icona: '🗂️', nome: 'Faldone',                        aiuto: 'documenti dipendenti, subappalti, POS, documenti chiesti dal cliente' },
  { id: 'cantiere',    icona: '📷', nome: 'Cantiere',                       aiuto: 'foto, report fotografici, cronoprogramma' },
  { id: 'certificati', icona: '🏅', nome: 'Certificati e schede tecniche',  aiuto: 'certificazioni dei prodotti, dichiarazioni di conformità' },
  { id: 'chiusura',    icona: '✅', nome: 'Chiusura',                       aiuto: 'dichiarazione di corretta messa in opera, collaudi, verbali' },
  { id: 'altro',       icona: '📎', nome: 'Altro',                          aiuto: '' }
];

const LIMITE_FILE_COMMESSA = 50 * 1024 * 1024; // 50 MB, come il bucket

const COLONNE_COMMESSA = 'id, codice, anno, numero, stato, origine, titolo, importo_imponibile, creato_il, aggiornato_il, ' +
  'cliente_id, sede_id, preventivo_id, progetto_tecnico_id, ' +
  'clienti(ragione_sociale), sedi_cliente(nome, tipo, via, civico, citta)';

let commesseElenco = [];
let commessaApertaId = null;
let paginaPrecedenteCommessa = 'commesse';
let documentiCommessaDisponibili = null;
let documentiCommessaAperta = [];

// ── Disponibilità di sql/29 ─────────────────────────────────────────
async function verificaDocumentiCommessaDisponibili() {
  if (documentiCommessaDisponibili !== null) return documentiCommessaDisponibili;
  if (!(await verificaCommesseDisponibili())) return false;

  const { error } = await db
    .from('commesse_documenti')
    .select('id')
    .limit(1);

  if (!error) {
    documentiCommessaDisponibili = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /commesse_documenti/i.test(error.message || '')) {
    documentiCommessaDisponibili = false;
  } else {
    return false;
  }

  return documentiCommessaDisponibili;
}

// ── Chi deve fare cosa ──────────────────────────────────────────────
function commessaAperta(commessa) {
  return commessa && commessa.stato !== 'chiusa' && commessa.stato !== 'annullata';
}

// Motivi per cui la commessa "aspetta" l'utente collegato (vuoto se
// nessuno). Il titolare non è mai un passaggio obbligato: per lui vuoto.
function motiviToccaAMeCommessa(commessa) {
  const motivi = [];
  if (!commessaAperta(commessa) || ROLE === 'titolare') return motivi;

  if (!commessa.sede_id && ['segreteria', 'rappresentante'].includes(ROLE)) {
    motivi.push('Indica la sede del cantiere');
  }

  if (statiCommessaDisponibili === true) {
    if (toccaAMeCommessa(commessa)) {
      const prossimo = statoSuccessivoCommessa(commessa.stato);
      motivi.push('Da segnare: ' + ETICHETTE_STATO_COMMESSA[prossimo] +
        ' (' + DESCRIZIONE_PASSO_COMMESSA[prossimo] + ')');
    }
    // Passo 9: gli acquisti procurano consumabili e noli mentre la
    // commessa è in preparazione (non cambia lo stato). Con sql/31 (F6.2)
    // il motivo nasce dalle richieste aperte del capo tecnico (sotto).
    if (ROLE === 'commerciale' && commessa.stato === 'in_preparazione' &&
        !(typeof richiesteIntegrazioneAttive === 'function' && richiesteIntegrazioneAttive())) {
      motivi.push('Passo 9: procura consumabili e noli chiesti dal capo tecnico e comunica le date di arrivo');
    }
  }

  // F6.2: richieste di consumabili e noli (js/28, solo con sql/31).
  if (typeof motiviRichiesteIntegrazioneCommessa === 'function') {
    motivi.push.apply(motivi, motiviRichiesteIntegrazioneCommessa(commessa));
  }

  return motivi;
}

function puoCaricareDocumentiCommessa(commessa) {
  if (!['titolare', 'segreteria', 'commerciale', 'capo_tecnico', 'rappresentante'].includes(ROLE)) return false;
  return ROLE === 'titolare' || commessaAperta(commessa);
}

function puoTogliereDocumentoCommessa(commessa, documento) {
  if (ROLE === 'titolare') return true;
  if (!commessaAperta(commessa)) return false;
  if (ROLE === 'segreteria') return true;
  return !!documento && documento.caricato_da === ME?.id;
}

function testoProssimoPassoCommessa(commessa) {
  if (statiCommessaDisponibili !== true) return '';
  if (commessa.stato === 'annullata') return 'Annullata';
  const prossimo = statoSuccessivoCommessa(commessa.stato);
  if (!prossimo) return '—';
  return ETICHETTE_STATO_COMMESSA[prossimo] + ' (' + NOMI_RUOLO_PASSO_COMMESSA[RUOLO_PASSO_COMMESSA[prossimo]] + ')';
}

function badgeStatoCommessa(stato) {
  return `<span class="bx ${classeStatoCommessa(stato)}">${esc(ETICHETTE_STATO_COMMESSA[stato] || stato || '—')}</span>`;
}

// ── Pagina Commesse ─────────────────────────────────────────────────
async function loadCommesse() {
  const lista = ge('commesse-tbody');
  const evidenza = ge('commesse-evidenza');
  if (!lista) return;

  lista.innerHTML = '<tr><td colspan="8"><div class="load">Caricamento...</div></td></tr>';
  if (evidenza) evidenza.innerHTML = '';

  if (!(await verificaCommesseDisponibili())) {
    lista.innerHTML = '<tr><td colspan="8"><div class="empty">Le commesse non sono ancora attive.</div></td></tr>';
    return;
  }

  await verificaStatiCommessaDisponibili();
  impostaFiltroStatiCommesse();

  const { data, error } = await db
    .from('commesse')
    .select(COLONNE_COMMESSA)
    .order('anno', { ascending: false })
    .order('numero', { ascending: false });

  if (error) {
    lista.innerHTML = `<tr><td colspan="8"><div class="al2 e">Errore caricamento commesse: ${esc(error.message)}</div></td></tr>`;
    return;
  }

  commesseElenco = data || [];
  // F6.2: richieste di consumabili e noli per "Tocca a te" (js/28).
  if (typeof caricaRiepilogoRichiesteIntegrazione === 'function') await caricaRiepilogoRichiesteIntegrazione(null);
  // F8.3: % di avanzamento per la colonna "Avanzamento" (js/34, sql/36).
  if (typeof caricaAvanzamentoCommesse === 'function') await caricaAvanzamentoCommesse();
  renderEvidenzaCommesse();
  filtraCommesse();
}

// Le voci del filtro: "Annullate" solo con sql/28.
function impostaFiltroStatiCommesse() {
  const sel = ge('commesse-filtro-stato');
  if (!sel || sel.dataset.pronto === (statiCommessaDisponibili ? '28' : '26')) return;

  const scelto = sel.value || 'aperte';
  const stati = ORDINE_STATI_COMMESSA.concat(statiCommessaDisponibili ? ['annullata'] : []);

  sel.innerHTML =
    '<option value="aperte">Aperte (non chiuse' + (statiCommessaDisponibili ? ' né annullate' : '') + ')</option>' +
    '<option value="tutte">Tutte</option>' +
    stati.map(function(stato) {
      return `<option value="${esc(stato)}">${esc(ETICHETTE_STATO_COMMESSA[stato])}</option>`;
    }).join('');

  sel.value = Array.from(sel.options).some(function(o) { return o.value === scelto; }) ? scelto : 'aperte';
  sel.dataset.pronto = statiCommessaDisponibili ? '28' : '26';
}

function renderEvidenzaCommesse() {
  const box = ge('commesse-evidenza');
  if (!box) return;

  const mie = commesseElenco
    .map(function(c) { return { commessa: c, motivi: motiviToccaAMeCommessa(c) }; })
    .filter(function(r) { return r.motivi.length; })
    .sort(function(a, b) {
      return (a.commessa.anno - b.commessa.anno) || (a.commessa.numero - b.commessa.numero);
    });

  if (!mie.length) {
    box.innerHTML = ROLE === 'titolare'
      ? ''
      : '<div class="al2 ok">Nessuna commessa aspetta te in questo momento.</div>';
    return;
  }

  box.innerHTML = `
    <div class="tit-section">⭐ Tocca a te (${mie.length})</div>
    <div class="rap-list-card" style="margin-bottom:14px">
      ${mie.map(function(r) {
        const c = r.commessa;
        return `
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">
            <div style="min-width:0">
              <div style="font-weight:700">${esc(c.codice)} · ${esc(c.clienti?.ragione_sociale || '')} ${badgeStatoCommessa(c.stato)}</div>
              <div style="font-size:12px;color:var(--m)">${esc(c.titolo || '')}</div>
              ${r.motivi.map(function(m) {
                return `<div style="font-size:12px;margin-top:2px">→ <b>${esc(m)}</b></div>`;
              }).join('')}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${statiCommessaDisponibili === true && toccaAMeCommessa(c)
                ? `<button class="btn sm" onclick="apriStatoCommessa('${esc(c.id)}', '${esc(c.preventivo_id || '')}')">Cambia stato</button>`
                : ''}
              <button class="btn sm p" onclick="openCommessaDetail('${esc(c.id)}')">Apri</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function filtraCommesse() {
  const lista = ge('commesse-tbody');
  if (!lista) return;

  const q = (v('commesse-cerca') || '').trim().toLowerCase();
  const filtro = v('commesse-filtro-stato') || 'aperte';

  const righe = commesseElenco.filter(function(c) {
    if (filtro === 'aperte' && !commessaAperta(c)) return false;
    if (filtro !== 'aperte' && filtro !== 'tutte' && c.stato !== filtro) return false;
    if (!q) return true;
    return [c.codice, c.clienti?.ragione_sociale, c.titolo, testoSedeCommessa(c.sedi_cliente)]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  // F8.3: colonna "Avanzamento" solo con il cronoprogramma attivo (js/34).
  const conAvanzamento = typeof avanzamentoCommesseAttivo === 'function' && avanzamentoCommesseAttivo();
  if (ge('commesse-th-avanzamento')) ge('commesse-th-avanzamento').style.display = conAvanzamento ? '' : 'none';

  const conta = ge('commesse-conta');
  if (conta) conta.textContent = righe.length + (righe.length === 1 ? ' commessa' : ' commesse');

  if (!righe.length) {
    lista.innerHTML = `<tr><td colspan="8"><div class="empty">${commesseElenco.length ? 'Nessuna commessa con questi filtri.' : 'Nessuna commessa.'}</div></td></tr>`;
    return;
  }

  lista.innerHTML = righe.map(function(c) {
    const sede = testoSedeCommessa(c.sedi_cliente);
    const mia = motiviToccaAMeCommessa(c).length > 0;
    const prossimo = testoProssimoPassoCommessa(c);
    return `
      <tr${mia ? ' style="background:var(--al)"' : ''}>
        <td><b>${esc(c.codice)}</b>${mia ? ' ⭐' : ''}${conAvanzamento ? htmlAvanzamentoSottoCodice(c) : ''}</td>
        <td>${esc(c.clienti?.ragione_sociale || '—')}</td>
        <td>${esc(c.titolo || '—')}</td>
        <td>${sede ? esc(sede) : '<span style="color:var(--a)">da indicare</span>'}</td>
        <td>${badgeStatoCommessa(c.stato)}${prossimo ? `<div style="font-size:11px;color:var(--m);margin-top:2px">poi: ${esc(prossimo)}</div>` : ''}</td>
        ${conAvanzamento ? `<td>${htmlCellaAvanzamentoCommessa(c)}</td>` : ''}
        <td style="white-space:nowrap">${c.importo_imponibile != null ? esc(euroPreventivo(c.importo_imponibile)) : '—'}</td>
        <td><button class="btn sm p" onclick="openCommessaDetail('${esc(c.id)}')">Apri</button></td>
      </tr>
    `;
  }).join('');
}

// ── Scheda della commessa ───────────────────────────────────────────
async function openCommessaDetail(commessaId) {
  if (!canAccessPage('commessa-detail')) {
    toast('Non hai accesso alle commesse', 'err');
    return;
  }

  const paginaAttuale = document.querySelector('.page.on')?.id?.replace('pg-', '');
  if (paginaAttuale && paginaAttuale !== 'commessa-detail') {
    paginaPrecedenteCommessa = paginaAttuale;
    ricordaPosizionePagina();
  }

  commessaApertaId = commessaId;
  gotoPage('commessa-detail');
  await caricaSchedaCommessa(commessaId);
}

function tornaDaCommessa() {
  const destinazione = paginaPrecedenteCommessa && canAccessPage(paginaPrecedenteCommessa)
    ? paginaPrecedenteCommessa
    : 'commesse';
  commessaApertaId = null;
  gotoPage(destinazione);
  ripristinaPosizionePagina();
}

async function caricaSchedaCommessa(commessaId) {
  const riepilogo = ge('cmd-riepilogo');
  const cartella = ge('cmd-documenti');
  if (!riepilogo || !cartella) return;

  riepilogo.innerHTML = '<div class="load">Caricamento...</div>';
  cartella.innerHTML = '';
  if (ge('cmd-materiali')) ge('cmd-materiali').innerHTML = '';
  if (ge('cmd-ordini')) ge('cmd-ordini').innerHTML = '';
  if (ge('cmd-richieste')) ge('cmd-richieste').innerHTML = '';
  if (ge('cmd-faldone')) ge('cmd-faldone').innerHTML = '';
  if (ge('cmd-squadra')) ge('cmd-squadra').innerHTML = '';
  ['cmd-cronoprogramma', 'cmd-avanzamento', 'cmd-avanzamento-cantiere'].forEach(function(id) { if (ge(id)) ge(id).innerHTML = ''; });
  ['cmd-giornale', 'cmd-ore', 'cmd-ore-compatto'].forEach(function(id) { if (ge(id)) ge(id).innerHTML = ''; });
  // F8.1: scheda cantiere (js/32): sceglie la scheda da mostrare.
  if (typeof preparaSchedaCantiere === 'function') preparaSchedaCantiere(commessaId);

  await verificaStatiCommessaDisponibili();

  const { data: commessa, error } = await db
    .from('commesse')
    .select(COLONNE_COMMESSA + ', preventivi(numero, stato, allegato_accettazione_path, allegato_accettazione_nome), progetti_tecnici(titolo)')
    .eq('id', commessaId)
    .maybeSingle();

  if (error || !commessa) {
    ge('cmd-titolo').textContent = '📁 Commessa';
    ge('cmd-sottotitolo').textContent = '';
    ge('cmd-stato').innerHTML = '';
    riepilogo.innerHTML = `<div class="al2 e">Commessa non trovata${error ? ': ' + esc(error.message) : ''}.</div>`;
    if (ge('cmd-cantiere')) ge('cmd-cantiere').innerHTML = '<div class="al2 e">Commessa non trovata.</div>';
    return;
  }

  ge('cmd-titolo').textContent = '📁 Commessa ' + commessa.codice;
  ge('cmd-sottotitolo').textContent = [commessa.clienti?.ragione_sociale, commessa.titolo].filter(Boolean).join(' · ');
  ge('cmd-stato').innerHTML = badgeStatoCommessa(commessa.stato);

  // F6.2: richieste di consumabili e noli per "Tocca a te" (js/28).
  if (typeof caricaRiepilogoRichiesteIntegrazione === 'function') await caricaRiepilogoRichiesteIntegrazione(commessa.id);
  riepilogo.innerHTML = htmlRiepilogoCommessa(commessa);
  // F6.1: ordini ai fornitori (js/27, attivi con sql/30).
  if (typeof caricaOrdiniCommessa === 'function') await caricaOrdiniCommessa(commessa);
  // F6.2: consumabili e noli (js/28, attivi con sql/31).
  if (typeof caricaRichiesteIntegrazioneCommessa === 'function') await caricaRichiesteIntegrazioneCommessa(commessa);
  // F6.3: elenco unico dei materiali con le date di arrivo (js/29), dopo
  // js/27 perché riusa le offerte da ordinare già lette.
  if (typeof caricaMaterialiCommessa === 'function') await caricaMaterialiCommessa(commessa);
  // F7.2: date dei lavori e faldone (js/31, attivi con sql/33).
  if (typeof caricaFaldoneCommessa === 'function') await caricaFaldoneCommessa(commessa);
  await caricaDocumentiCommessa(commessa);
  // F8.1: scheda cantiere (js/32), per ultima: riusa materiali, faldone e
  // documenti appena letti.
  if (typeof caricaSchedaCantiere === 'function') await caricaSchedaCantiere(commessa);
  // F8.3: cronoprogramma e % di avanzamento (js/34, attivi con sql/36),
  // dopo la scheda cantiere (riusa le date dei lavori lette lì).
  if (typeof caricaCronoprogrammaCommessa === 'function') await caricaCronoprogrammaCommessa(commessa);
  // F8.2: squadra e mezzi del giorno (js/33, attivi con sql/35), dopo la
  // scheda cantiere e il faldone (riusa date dei lavori e persone).
  if (typeof caricaSquadraCantiere === 'function') await caricaSquadraCantiere(commessa);
  // F8.4: giornale di cantiere e ore stimate contro effettive (js/35,
  // attivi con sql/37), per ultimi: riusano documenti, squadra e fasi.
  if (typeof caricaGiornaleCantiere === 'function') await caricaGiornaleCantiere(commessa);
}

function htmlRiepilogoCommessa(c) {
  const sede = testoSedeCommessa(c.sedi_cliente);
  const nata = c.creato_il ? new Date(c.creato_il).toLocaleDateString('it-IT') : '';
  const motivi = motiviToccaAMeCommessa(c);
  const numeroPreventivo = c.preventivi?.numero;

  const bottoniCollegati = [];
  if (canAccessPage('cliente-detail') && c.cliente_id) {
    bottoniCollegati.push(`<button class="btn sm" onclick="openClienteDetail('${esc(c.cliente_id)}')">🧍‍♂️ Scheda cliente</button>`);
  }
  if (canAccessPage('preventivo-detail') && c.preventivo_id) {
    bottoniCollegati.push(`<button class="btn sm" onclick="openPreventivoDetail('${esc(c.preventivo_id)}')">🧾 Preventivo${numeroPreventivo ? ' n. ' + esc(numeroPreventivo) : ''}</button>`);
  }
  if (canAccessPage('progetto-detail') && c.progetto_tecnico_id) {
    bottoniCollegati.push(`<button class="btn sm" onclick="openProgettoDetail('${esc(c.progetto_tecnico_id)}')">📐 Progetto tecnico</button>`);
  }

  return `
    ${motivi.length ? `
      <div class="al2 w">
        <b>Tocca a te:</b>
        ${motivi.map(function(m) { return '<div>→ ' + esc(m) + '</div>'; }).join('')}
      </div>
    ` : ''}

    <div class="card">
      <div class="g2" style="margin-bottom:12px">
        ${ir('Cliente', c.clienti?.ragione_sociale)}
        ${ir('Lavoro', c.titolo || c.progetti_tecnici?.titolo)}
        ${ir('Importo (imponibile, IVA esclusa)', c.importo_imponibile != null ? euroPreventivo(c.importo_imponibile) : '')}
        ${ir('Nata il', nata ? nata + (c.origine === 'recupero' ? ' (per un preventivo già accettato)' : ' (preventivo accettato)') : '')}
        ${ir('Preventivo', numeroPreventivo ? 'n. ' + numeroPreventivo : '')}
        ${ir('Codice da usare nelle mail', c.codice)}
      </div>

      <div id="commessa-sede-${esc(c.id)}" style="font-size:13px;margin-bottom:10px">
        Sede del cantiere: ${sede
          ? '<b>' + esc(sede) + '</b>'
          : '<b style="color:var(--a)">da indicare</b>'}
        ${puoImpostareSedeCommessa() && commessaAperta(c) ? `
          <button
            class="btn sm"
            style="margin-left:6px"
            onclick="apriSceltaSedeCommessa('${esc(c.id)}', '${esc(c.cliente_id)}', '${esc(c.preventivo_id)}', '${esc(c.sede_id || '')}')"
          >
            ${sede ? 'Cambia sede' : 'Indica la sede'}
          </button>
        ` : ''}
      </div>

      ${bottoniCollegati.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${bottoniCollegati.join('')}</div>` : ''}
    </div>

    ${statiCommessaDisponibili === true ? `
      <div class="card">
        <div style="font-size:14px;font-weight:700;margin-bottom:8px">Stato della commessa</div>
        ${htmlPercorsoStatiCommessa(c.stato)}
        ${htmlProssimoPassoCommessa(c)}
      </div>
    ` : ''}
  `;
}

// ── Cartella documenti ──────────────────────────────────────────────
async function caricaDocumentiCommessa(commessa) {
  const box = ge('cmd-documenti');
  if (!box) return;

  const disponibili = await verificaDocumentiCommessaDisponibili();
  const firmato = htmlPreventivoFirmatoCommessa(commessa);

  if (!disponibili) {
    box.innerHTML = `
      <div class="card">
        <div style="font-size:14px;font-weight:700;margin-bottom:8px">📂 Cartella documenti</div>
        ${firmato}
        <div class="al2 i" style="margin:8px 0 0">La cartella documenti della commessa non è ancora attiva.</div>
      </div>
    `;
    return;
  }

  box.innerHTML = '<div class="card"><div class="load">Caricamento documenti...</div></div>';

  const { data, error } = await db
    .from('commesse_documenti')
    .select('id, cartella, nome_file, storage_path, dimensione, tipo_mime, nota, caricato_da, caricato_da_nome, caricato_da_ruolo, caricato_il')
    .eq('commessa_id', commessa.id)
    .order('caricato_il', { ascending: false });

  if (error) {
    box.innerHTML = `<div class="card"><div class="al2 e">Errore caricamento documenti: ${esc(error.message)}</div></div>`;
    return;
  }

  documentiCommessaAperta = data || [];

  const gruppi = CARTELLE_DOCUMENTI_COMMESSA.map(function(cartella) {
    const documenti = documentiCommessaAperta.filter(function(d) { return d.cartella === cartella.id; });
    return `
      <div style="padding:8px 0;border-bottom:1px solid var(--bo)">
        <div style="font-size:13px;font-weight:700">${cartella.icona} ${esc(cartella.nome)} <span style="font-weight:400;color:var(--m)">(${documenti.length})</span></div>
        ${cartella.aiuto ? `<div style="font-size:11px;color:var(--m)">${esc(cartella.aiuto)}</div>` : ''}
        ${documenti.map(function(d) { return htmlDocumentoCommessa(commessa, d); }).join('')}
      </div>
    `;
  }).join('');

  box.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <div style="font-size:14px;font-weight:700">📂 Cartella documenti (${documentiCommessaAperta.length})</div>
      </div>
      ${htmlCaricaDocumentoCommessa(commessa)}
      ${firmato}
      ${gruppi}
    </div>
  `;
}

// Il preventivo firmato resta nel bucket del preventivo: qui solo il
// collegamento, per chi può aprirlo (regole di sql/22).
function htmlPreventivoFirmatoCommessa(commessa) {
  const path = commessa.preventivi?.allegato_accettazione_path;
  if (!path) return '';

  const puoAprire = ['titolare', 'segreteria', 'commerciale', 'rappresentante'].includes(ROLE);
  return `
    <div style="padding:8px 0;border-bottom:1px solid var(--bo)">
      <div style="font-size:13px;font-weight:700">✍️ Preventivo firmato</div>
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">
        <div style="font-size:13px">${esc(commessa.preventivi?.allegato_accettazione_nome || 'Preventivo firmato')}</div>
        ${puoAprire
          ? `<button class="btn sm" data-path="${esc(path)}" onclick="apriAllegatoPreventivoFornitore(this.dataset.path)">Apri</button>`
          : '<span style="font-size:11px;color:var(--m)">nella scheda del preventivo</span>'}
      </div>
    </div>
  `;
}

function dimensioneLeggibile(byte) {
  if (byte == null) return '';
  if (byte < 1024) return byte + ' B';
  if (byte < 1024 * 1024) return Math.round(byte / 1024) + ' KB';
  return (byte / 1024 / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB';
}

function htmlDocumentoCommessa(commessa, d) {
  const chi = d.caricato_da_nome
    ? d.caricato_da_nome + (d.caricato_da_ruolo ? ' (' + etichettaRuolo(d.caricato_da_ruolo) + ')' : '')
    : '';
  const dettagli = [dataOraEsitoPreventivo(d.caricato_il), chi, dimensioneLeggibile(d.dimensione)].filter(Boolean).join(' · ');

  return `
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0 0 18px">
      <div style="min-width:0;flex:1">
        <div style="font-size:13px;font-weight:600;word-break:break-word">${esc(d.nome_file)}</div>
        <div style="font-size:11px;color:var(--m)">${esc(dettagli)}${d.nota ? ' · ' + esc(d.nota) : ''}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn sm p" data-path="${esc(d.storage_path)}" onclick="scaricaDocumentoCommessa(this.dataset.path)">⬇️ Apri</button>
        ${puoTogliereDocumentoCommessa(commessa, d)
          ? `<button class="btn sm" style="color:var(--r)" title="Togli dalla cartella" onclick="togliDocumentoCommessa('${esc(d.id)}')">🗑️</button>`
          : ''}
      </div>
    </div>
  `;
}

function htmlCaricaDocumentoCommessa(commessa) {
  if (!puoCaricareDocumentiCommessa(commessa)) {
    return commessaAperta(commessa)
      ? ''
      : '<div class="al2 i">Commessa ' + esc(ETICHETTE_STATO_COMMESSA[commessa.stato] || commessa.stato) + ': i documenti li aggiunge solo il titolare.</div>';
  }

  return `
    <div style="background:var(--bg);border-radius:var(--rs);padding:12px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">📎 Aggiungi documenti</div>
      <div class="fr">
        <div class="f">
          <label>Cartella *</label>
          <select id="cmd-doc-cartella">
            <option value="">— Scegli la cartella —</option>
            ${CARTELLE_DOCUMENTI_COMMESSA.map(function(c) {
              return `<option value="${esc(c.id)}">${c.icona} ${esc(c.nome)}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="f">
          <label>Nota (facoltativa)</label>
          <input type="text" id="cmd-doc-nota" maxlength="300" placeholder="es. conferma d'ordine porte REI">
        </div>
      </div>
      <div class="f">
        <label>File (uno o più, massimo 50 MB ciascuno) *</label>
        <input type="file" id="cmd-doc-file" multiple>
      </div>
      <button class="btn p" id="cmd-doc-carica" onclick="caricaFileCommessa('${esc(commessa.id)}')">⬆️ Carica</button>
    </div>
  `;
}

function nomeFileSicuroCommessa(nome) {
  const pulito = String(nome || 'file')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  return pulito.slice(-120) || 'file';
}

async function caricaFileCommessa(commessaId) {
  const cartella = v('cmd-doc-cartella');
  const nota = (v('cmd-doc-nota') || '').trim();
  const input = ge('cmd-doc-file');
  const files = Array.from(input?.files || []);

  if (!cartella) {
    toast('Scegli la cartella', 'err');
    return;
  }
  if (!files.length) {
    toast('Scegli almeno un file', 'err');
    return;
  }

  const troppoGrandi = files.filter(function(f) { return f.size > LIMITE_FILE_COMMESSA; });
  if (troppoGrandi.length) {
    toast('File oltre 50 MB: ' + troppoGrandi.map(function(f) { return f.name; }).join(', '), 'err');
    return;
  }

  const bottone = ge('cmd-doc-carica');
  if (bottone) { bottone.disabled = true; bottone.textContent = '⏳ Caricamento...'; }

  let caricati = 0;
  const errori = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = commessaId + '/' + cartella + '/' + Date.now() + '_' + i + '_' + nomeFileSicuroCommessa(file.name);

    const caricamento = await db.storage
      .from('commesse-documenti')
      .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });

    if (caricamento.error) {
      errori.push(file.name + ': ' + caricamento.error.message);
      continue;
    }

    const { error } = await db.rpc('registra_documento_commessa', {
      p_commessa_id: commessaId,
      p_cartella: cartella,
      p_storage_path: path,
      p_nome_file: file.name,
      p_nota: nota || null
    });

    if (error) {
      // Il file senza rigo non serve: lo toglie chi l'ha caricato.
      await db.storage.from('commesse-documenti').remove([path]);
      errori.push(file.name + ': ' + error.message);
      continue;
    }

    caricati++;
  }

  if (bottone) { bottone.disabled = false; bottone.textContent = '⬆️ Carica'; }

  if (errori.length) {
    toast((caricati ? caricati + ' caricati, ' : '') + 'non caricati: ' + errori.join(' · '), 'err');
  } else {
    toast(caricati === 1 ? 'Documento caricato' : caricati + ' documenti caricati', 'ok');
  }

  if (commessaApertaId === commessaId) await caricaSchedaCommessa(commessaId);
}

async function scaricaDocumentoCommessa(path) {
  const { data, error } = await db.storage
    .from('commesse-documenti')
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    toast('Impossibile aprire il documento: ' + (error?.message || 'file non disponibile'), 'err');
    return;
  }

  window.open(data.signedUrl, '_blank', 'noopener');
}

async function togliDocumentoCommessa(documentoId) {
  const documento = documentiCommessaAperta.find(function(d) { return d.id === documentoId; });
  if (!confirm('Togliere "' + (documento?.nome_file || 'il documento') + '" dalla cartella della commessa? Il file viene cancellato.')) return;

  const { data: path, error } = await db.rpc('elimina_documento_commessa', { p_documento_id: documentoId });

  if (error) {
    toast('Documento non tolto: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  if (path) {
    const rimozione = await db.storage.from('commesse-documenti').remove([path]);
    if (rimozione.error) console.warn('File della commessa non cancellato:', rimozione.error.message);
  }

  toast('Documento tolto', 'ok');
  if (commessaApertaId) await caricaSchedaCommessa(commessaApertaId);
}

// ── Commesse del cliente (scheda cliente, tab Commesse) ─────────────
function impostaTabCommesseCliente(clienteId) {
  const tab = ge('cd-tab-commesse');
  const visibile = canAccessPage('commesse');
  if (tab) tab.style.display = visibile ? '' : 'none';
  if (visibile) loadCommesseCliente(clienteId);
}

async function loadCommesseCliente(clienteId) {
  const box = ge('cd-commesse-lista');
  if (!box || !clienteId) return;

  box.innerHTML = '<div class="load">Caricamento...</div>';

  if (!(await verificaCommesseDisponibili())) {
    box.innerHTML = '<div class="empty">Le commesse non sono ancora attive.</div>';
    return;
  }

  await verificaStatiCommessaDisponibili();
  // F6.2: richieste di consumabili e noli per la stellina (js/28).
  if (typeof caricaRiepilogoRichiesteIntegrazione === 'function') await caricaRiepilogoRichiesteIntegrazione(null);

  const { data, error } = await db
    .from('commesse')
    .select(COLONNE_COMMESSA)
    .eq('cliente_id', clienteId)
    .order('anno', { ascending: false })
    .order('numero', { ascending: false });

  if (currentCliId !== clienteId) return; // nel frattempo aperto un altro cliente

  if (error) {
    box.innerHTML = `<div class="al2 e">Errore caricamento commesse: ${esc(error.message)}</div>`;
    return;
  }

  if (!data?.length) {
    box.innerHTML = '<div class="empty">Nessuna commessa per questo cliente.</div>';
    return;
  }

  box.innerHTML = data.map(function(c) {
    const sede = testoSedeCommessa(c.sedi_cliente);
    const mia = motiviToccaAMeCommessa(c).length > 0;
    return `
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--bo)">
        <div style="min-width:0">
          <div style="font-weight:700">${esc(c.codice)}${mia ? ' ⭐' : ''} ${badgeStatoCommessa(c.stato)}</div>
          <div style="font-size:12px;color:var(--m)">
            ${esc(c.titolo || '')}${c.titolo ? ' · ' : ''}sede: ${sede ? esc(sede) : 'da indicare'}
            ${c.importo_imponibile != null ? ' · ' + esc(euroPreventivo(c.importo_imponibile)) : ''}
          </div>
        </div>
        <button class="btn sm p" onclick="openCommessaDetail('${esc(c.id)}')">Apri</button>
      </div>
    `;
  }).join('');
}

// ── Aggiornamento dopo sede o stato (chiamata da js/18) ─────────────
// true se era aperta una pagina delle commesse ed è stata ricaricata.
async function aggiornaPagineCommesse() {
  if (ge('pg-commessa-detail')?.classList.contains('on') && commessaApertaId) {
    await caricaSchedaCommessa(commessaApertaId);
    return true;
  }
  if (ge('pg-commesse')?.classList.contains('on')) {
    await loadCommesse();
    return true;
  }
  if (ge('pg-cliente-detail')?.classList.contains('on') && ge('cd-commesse')?.classList.contains('on')) {
    await loadCommesseCliente(currentCliId);
    return true;
  }
  return false;
}
