// ── F15.3 — MOTORE DELLE SCHEDE (1a: disegno e salvataggio, sql/77) ─────
// (stesso numero 56 di js/56-festivita-giorni-lavorativi.js: nome deciso
// dalla task; si carica dopo js/55 e js/66, prima di js/19-init)
//
// F15.5 (sql/79, in fondo al file): fonte del rilievo del progetto e fonte di
// ogni dato normativo, con il blocco dell'invio.
//
// Disegna la scheda di rilievo di una lavorazione dal catalogo
// (lavorazioni_campi di sql/75, letto da js/55) invece che dal codice scritto
// a mano, pensata per il telefono (390 px):
// - menu CHIUSI (solo i valori del catalogo; un valore salvato che non è più
//   in elenco resta visibile "non più in elenco"), numeri con la virgola e
//   l'UNITÀ accanto (cm, mm, pz...), Sì / No, testi;
// - "❓ Non noto" esplicito SOLO se la scheda è una RICHIESTA INDICATIVA (il
//   cliente non conosce tutti i dati); nella richiesta definitiva no;
// - campi di LIVELLO INGEGNERE in sola lettura per il rappresentante (con
//   sql/78, F15.4, anche nel database: trigger su schede e posizioni);
// - PLAUSIBILITÀ (F15.4): numeri dentro minimo e massimo del catalogo (porte
//   REI 60-300 cm), menu chiusi, m² coerenti con larghezza × altezza; per il
//   rappresentante bloccano il salvataggio (con sql/78 anche il database),
//   per ingegnere e titolare chiedono conferma (problemiPlausibilitaDati,
//   gemella di motore_controlla_dati_rappresentante di sql/78; la usano
//   anche js/18 salvaRigaSchedaRilievo per tutte le schede e js/66);
// - dati PRECOMPILATI da sede e cliente: luogo dei lavori (sede principale o
//   unica del cliente, se no l'indirizzo del cliente), referente e telefono
//   dall'anagrafica, modificabili;
// - obbligatori (*) SOLO i dati che servono a calcolare il preventivo
//   (decisione di Toli D2; con sql/78 colonna lavorazioni_campi.
//   serve_al_prezzo, senza si legge "obbligatorio"): si segnalano, non bloccano il salvataggio (il
//   controllo all'invio è di F15.8); i campi "per posizione" si compilano
//   nelle posizioni P-xx (js/66), le foto con le posizioni.
// SALVA nella stessa riga di progetti_tecnici_schede delle 7 schede di js/18
// (stessa famiglia, stessi codici = stesse chiavi di dati): si legge uguale
// nel preventivo, nella scheda progetto, nella copia commerciale, nel PDF per
// il fornitore e nella scheda cantiere (valoreSchedaTecnica,
// etichettaCampoTecnico di js/18). Le tab "Scheda 1 | Scheda 2 | + Nuova
// scheda" (sql/48), il nome, le bozze in memoria, la conferma alla chiusura e
// le posizioni sono quelle di js/18 (htmlBarraSchedeRilievo,
// leggiSchedaRilievo, salvaRigaSchedaRilievo...): qui si avvolgono solo
// datiFormSchedaRilievo e apriFamigliaSchedaRilievo, e solo quando nella
// finestra c'è la scheda del motore (riquadro #msm-motore). I dati salvati
// che il motore non mostra restano (si salva sopra quelli di prima).
// Dove: scheda progetto, tab "📝 Rilievi tecnici" (riquadro msm-apri in cima,
// disegnato avvolgendo renderSchedeProgettoCommerciale di js/17): scegli la
// lavorazione, "📝 Compila la scheda". Chi: il rappresentante sui SUOI
// progetti in bozza o da integrare (policy di sql/77), ingegnere e titolare
// sempre. Senza sql/77 (RPC motore_schede_attivo) nulla di questo compare.

const MOTORE_SCHEDE = { disponibile: null, progetto: null, cliente: null, sedi: [], famiglia: null, datiBase: {}, numero: null };

const ICONE_LAVORAZIONI_MOTORE = {
  porte_rei: '🚪', estintori: '🧯', rilevazione_incendi: '🔔', compartimentazione: '🧱',
  vernice_intumescente: '🎨', coppelle: '🔥', impianti_spegnimento: '💧'
};

// Chiavi dei dati scritte dal motore oltre ai campi del catalogo
const CHIAVI_PROPRIE_MOTORE = ['tipo_richiesta', 'sede_id', 'indirizzo_lavori', 'referente_lavori', 'telefono_referente'];

const VALORE_NON_NOTO = 'non_noto';

// F15.8 (sql/82): blocco comune del progetto = scheda della lavorazione 'comune'
// (una sola, numero 1), con le 6 domande del primo contatto; campi data
// (testo AAAA-MM-GG con il calendario del telefono)
const FAMIGLIA_COMUNE = 'comune';
const CAMPI_DATA_MOTORE = ['entro_il'];

async function verificaMotoreSchedeDisponibile() {
  if (MOTORE_SCHEDE.disponibile !== null) return MOTORE_SCHEDE.disponibile;
  if (typeof db === 'undefined' || !db) return false;
  const { data, error } = await db.rpc('motore_schede_attivo');
  if (!error) {
    MOTORE_SCHEDE.disponibile = data === true;
  } else if (error.code === 'PGRST202' || error.code === '42883' || /Could not find|does not exist/i.test(error.message || '')) {
    MOTORE_SCHEDE.disponibile = false;
  } else {
    return false; // errore passeggero: si riprova la prossima volta
  }
  return MOTORE_SCHEDE.disponibile;
}

function puoCompilareMotore(progetto) {
  if (ROLE === 'titolare' || ROLE === 'ingegnere') return true;
  if (ROLE !== 'rappresentante' || !progetto || typeof ME === 'undefined' || !ME) return false;
  return progetto.rappresentante_id === ME.id && ['bozza', 'da_integrare'].includes(progetto.stato);
}

// Il rappresentante non scrive i campi di livello ingegnere (titolare e ingegnere sì)
function scriveLivelloIngegnere() { return ROLE === 'titolare' || ROLE === 'ingegnere'; }

// Campi che il motore disegna nella scheda (non quelli per posizione, non le foto)
function campiSchedaMotore(lav) {
  return ((lav && lav.lavorazioni_campi) || []).filter(function(c) {
    return c.attivo !== false && !c.per_posizione && c.tipo !== 'foto';
  });
}

function lavorazioniMotore() {
  if (typeof CATALOGO_LAV === 'undefined' || !CATALOGO_LAV.disponibili) return [];
  return (CATALOGO_LAV.lavorazioni || []).filter(function(l) {
    return l.attiva && l.codice !== FAMIGLIA_COMUNE && campiSchedaMotore(l).length; // F15.8: il blocco comune ha il suo riquadro
  });
}

// F15.8: blocco comune attivo (catalogo con la lavorazione 'comune' accesa e con campi: sql/82)
function bloccoComuneAttivo() {
  if (MOTORE_SCHEDE.disponibile !== true || typeof CATALOGO_LAV === 'undefined' || !CATALOGO_LAV.disponibili) return false;
  const l = (CATALOGO_LAV.lavorazioni || []).find(function(x) { return x.codice === FAMIGLIA_COMUNE; });
  return !!(l && l.attiva && campiSchedaMotore(l).length);
}

// Etichetta dal catalogo per una chiave dei dati (js/18 etichettaCampoTecnico):
// solo se tutte le lavorazioni che hanno quel codice lo chiamano allo stesso modo.
function etichettaCampoCatalogo(codice) {
  if (typeof CATALOGO_LAV === 'undefined' || !CATALOGO_LAV.disponibili) return '';
  const etichette = [];
  (CATALOGO_LAV.lavorazioni || []).forEach(function(l) {
    (l.lavorazioni_campi || []).forEach(function(c) {
      if (c.codice === codice && c.attivo !== false && !etichette.includes(c.etichetta)) etichette.push(c.etichetta);
    });
  });
  if (etichette.length !== 1) return '';
  const campo = (CATALOGO_LAV.lavorazioni || []).reduce(function(trovato, l) {
    return trovato || (l.lavorazioni_campi || []).find(function(c) { return c.codice === codice && c.attivo !== false; });
  }, null);
  return etichette[0] + (campo && campo.unita ? ' (' + campo.unita + ')' : '');
}

// ── Numeri con la virgola ─────────────────────────────────────────────
function numeroMotore(testo) {
  const t = String(testo === null || testo === undefined ? '' : testo).trim().replace(/\s/g, '');
  if (!t) return null;
  const n = Number(t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isFinite(n) ? n : NaN;
}

function testoNumeroMotore(x) {
  if (x === null || x === undefined || x === '') return '';
  if (typeof x === 'number') return x.toLocaleString('it-IT', { maximumFractionDigits: 3, useGrouping: false });
  // F15.6: numeri salvati come testo dalle schede di js/18 ("12.5") con la virgola
  if (typeof x === 'string' && /^-?\d+\.\d+$/.test(x.trim())) return x.trim().replace('.', ',');
  return String(x);
}

// ── Riquadro nella scheda progetto (tab Rilievi tecnici) ───────────────
async function disegnaApriMotoreProgetto(progettoId) {
  const box = ge('pd-schede-content');
  if (!box || !progettoId) return;
  const vecchio = ge('msm-apri');
  if (vecchio) vecchio.remove();
  const vecchioComune = ge('msm-comune');
  if (vecchioComune) vecchioComune.remove();
  // Richiesta di Erika dell'11/11 (con sql/259 e sql/260): per il
  // RAPPRESENTANTE (anche "Entra come") il progetto torna com'era prima del
  // 06/11: titolo, tipologia, descrizione, allegati e foto, poi invio
  // all'ingegnere o ad Acquisti. Niente "📝 Compila una scheda di rilievo" né
  // "📋 Blocco comune"; le schede già salvate restano nel tab in sola
  // lettura. SCELTA SOLO DEL SITO: le policy di sql/77 (il rappresentante
  // scrive le schede dei suoi progetti in bozza o da integrare) restano.
  // Ingegnere e titolare come prima.
  if (ROLE === 'rappresentante') return;
  if (!(await verificaMotoreSchedeDisponibile())) return;
  if (typeof caricaCatalogoLavorazioni === 'function') {
    try { await caricaCatalogoLavorazioni(); } catch (e) { return; }
  }
  const lav = lavorazioniMotore();
  if (!lav.length) return;
  const { data: progetto } = await db.from('progetti_tecnici').select('id,stato,rappresentante_id').eq('id', progettoId).maybeSingle();
  if (!progetto || !puoCompilareMotore(progetto)) return;
  // F15.8: il blocco comune c'è già?
  let comune = null;
  if (bloccoComuneAttivo()) {
    const { data: righe } = await db.from('progetti_tecnici_schede').select('id,dati')
      .eq('progetto_tecnico_id', progettoId).eq('famiglia', FAMIGLIA_COMUNE).order('numero').limit(1);
    comune = { scheda: (righe && righe[0]) || null };
  }
  if (ge('msm-apri')) return; // disegnato nel frattempo da un'altra chiamata
  const preferita = lav.some(function(l) { return l.codice === 'porte_rei'; }) ? 'porte_rei' : lav[0].codice;
  if (comune) box.insertAdjacentHTML('afterbegin', htmlRiquadroBloccoComune(progettoId, comune.scheda));
  const dopoComune = ge('msm-comune');
  (dopoComune ? function(html) { dopoComune.insertAdjacentHTML('afterend', html); } : function(html) { box.insertAdjacentHTML('afterbegin', html); })(`
    <div class="card" id="msm-apri" style="margin-bottom:12px">
      <div style="font-size:15px;font-weight:700">📝 Compila una scheda di rilievo</div>
      <div style="font-size:12px;color:var(--m);margin:3px 0 10px">
        Scegli la lavorazione: la scheda ha i menu e le unità del catalogo.
        ${ROLE === 'rappresentante' ? 'La compili finché il progetto è in bozza o da integrare.' : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div class="f" style="flex:1 1 200px;margin:0">
          <label for="msm-lavorazione">Lavorazione</label>
          <select id="msm-lavorazione">
            ${lav.map(function(l) {
              return '<option value="' + esc(l.codice) + '"' + (l.codice === preferita ? ' selected' : '') + '>' + esc(l.nome) + '</option>';
            }).join('')}
          </select>
        </div>
        <button type="button" class="btn p" id="msm-apri-btn" onclick="apriSchedaMotore('${esc(progettoId)}', v('msm-lavorazione'))">📝 Compila la scheda</button>
      </div>
    </div>
  `);
}

// F15.8: riquadro "📋 Blocco comune" in cima al tab Rilievi tecnici
function htmlRiquadroBloccoComune(progettoId, scheda) {
  const lav = lavorazioneCatalogo(FAMIGLIA_COMUNE);
  const d = (scheda && scheda.dati) || {};
  const domande = [
    ['Referente in cantiere', !vuotoMotore(d.referente_lavori) || !vuotoMotore(d.telefono_referente)],
    ['Chi decide', !vuotoMotore(d.chi_decide)],
    ['Perché', !vuotoMotore(d.motivo_lavoro)],
    ['Entro quando', !vuotoMotore(d.entro_il) || !vuotoMotore(d.entro_motivo)],
    ['Accessi', !vuotoMotore(d.accessi)],
    ['Orari', !vuotoMotore(d.orari)]
  ];
  const fatte = domande.filter(function(x) { return x[1]; }).length;
  const prezzo = campiSchedaMotore(lav).filter(serveAlPrezzoMotore);
  return `
    <div class="card" id="msm-comune" style="margin-bottom:12px">
      <div style="font-size:15px;font-weight:700">📋 Blocco comune: le 6 domande del primo contatto</div>
      <div style="font-size:12px;color:var(--m);margin:3px 0 8px">
        Una volta per progetto: referente in cantiere e telefono, chi decide, perché si fa il lavoro, entro quando, accessi, orari.
        ${prezzo.length ? 'Servono al preventivo: ' + esc(prezzo.map(function(c) { return c.etichetta; }).join(', ')) + '.' : 'Sono facoltative: non fermano l’invio. Referente, accessi e orari andranno da soli nella scheda del cantiere.'}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
        ${domande.map(function(x) {
          return '<span class="bx ' + (x[1] ? 'bok' : 'bgray') + '" style="font-size:11px">' + (x[1] ? '✓ ' : '') + esc(x[0]) + '</span>';
        }).join('')}
      </div>
      <button type="button" class="btn ${scheda ? '' : 'p'}" id="msm-comune-btn" onclick="apriSchedaMotore('${esc(progettoId)}', '${FAMIGLIA_COMUNE}', 1)">
        ${scheda ? '✏️ Modifica il blocco comune (' + fatte + ' su 6)' : '📋 Compila il blocco comune'}
      </button>
    </div>`;
}

if (typeof renderSchedeProgettoCommerciale === 'function') {
  const renderSchedeProgettoSenzaMotore = renderSchedeProgettoCommerciale;
  // eslint-disable-next-line no-global-assign
  renderSchedeProgettoCommerciale = async function(progettoId) {
    try { await verificaFontiDatiDisponibili(); } catch (e) { /* F15.5 facoltativo */ }
    try { await preparaSchedeMigrate(); } catch (e) { /* F15.6 facoltativo */ }
    const esito = await renderSchedeProgettoSenzaMotore.apply(this, arguments);
    try { await disegnaApriMotoreProgetto(progettoId); } catch (e) { /* il motore è facoltativo */ }
    return esito;
  };
}

// ── Apertura della scheda ──────────────────────────────────────────────
async function apriSchedaMotore(progettoId, famiglia, numero) {
  if (!progettoId || !famiglia) return;
  if (!(await verificaMotoreSchedeDisponibile())) { toast('Il motore delle schede non è ancora attivo (serve sql/77)', 'err'); return; }
  if (typeof caricaCatalogoLavorazioni === 'function') await caricaCatalogoLavorazioni();
  const lav = typeof lavorazioneCatalogo === 'function' ? lavorazioneCatalogo(famiglia) : null;
  if (!lav || !campiSchedaMotore(lav).length) { toast('Lavorazione non trovata nel catalogo', 'err'); return; }
  if (famiglia === FAMIGLIA_COMUNE) numero = 1; // F15.8: un solo blocco comune per progetto

  const fonti = await verificaFontiDatiDisponibili(); // F15.5 (sql/79)
  const { data: progetto, error } = await db.from('progetti_tecnici')
    .select('id,titolo,stato,rappresentante_id,cliente_id,' + (fonti ? 'fonte_rilievo,' : '') +
      'clienti(ragione_sociale,indirizzo,cap,citta,provincia,referente_nome,referente_telefono)')
    .eq('id', progettoId).maybeSingle();
  if (error || !progetto) { toast('Progetto non trovato' + (error ? ': ' + error.message : ''), 'err'); return; }
  if (!puoCompilareMotore(progetto)) {
    toast(ROLE === 'rappresentante'
      ? 'La scheda la compili finché il progetto è in bozza o da integrare'
      : 'Non puoi compilare le schede di questo progetto', 'err');
    return;
  }
  const { data: sedi } = await db.from('sedi_cliente')
    .select('id,nome,tipo,via,civico,cap,citta,provincia,principale')
    .eq('cliente_id', progetto.cliente_id).order('principale', { ascending: false }).order('nome');

  MOTORE_SCHEDE.progetto = progetto;
  MOTORE_SCHEDE.cliente = progetto.clienti || {};
  MOTORE_SCHEDE.sedi = sedi || [];
  MOTORE_SCHEDE.famiglia = famiglia;
  // F15.9: anche foto e video (sql/82-foto-video) usano l'elenco dei file del progetto
  const fotoVideo = await verificaFotoVideoDisponibile();
  if (fonti || fotoVideo) await caricaAllegatiFontiMotore(progettoId);

  if (typeof ricordaPosizionePagina === 'function') ricordaPosizionePagina();
  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero
  const box = ge('mrt-content');
  box.innerHTML = '<div class="load">Caricamento scheda...</div>';
  openM('m-rilievo-tecnico');
  await disegnaSchedaMotore(numero);
}

// Disegna (o ridisegna, cambiando tab) la scheda del motore aperta
async function disegnaSchedaMotore(numero) {
  const famiglia = MOTORE_SCHEDE.famiglia;
  const box = ge('mrt-content');
  const lettura = await leggiSchedaRilievo(famiglia, numero);
  if (lettura.error) { toast('Errore apertura scheda: ' + lettura.error.message, 'err'); return; }
  const lav = lavorazioneCatalogo(famiglia);
  MOTORE_SCHEDE.datiBase = Object.assign({}, lettura.dati || {});
  MOTORE_SCHEDE.numero = schedaRilievoAperta ? schedaRilievoAperta.numero : 1;
  precompilaDaSedeCliente(MOTORE_SCHEDE.datiBase);
  iniziaFontiMotore(MOTORE_SCHEDE.datiBase);
  iniziaFotoVideoMotore(MOTORE_SCHEDE.datiBase); // F15.9

  const comune = famiglia === FAMIGLIA_COMUNE; // F15.8: niente tab "Scheda 1 | + Nuova scheda"
  box.innerHTML = (comune ? '' : htmlBarraSchedeRilievo()) + `
    <div id="msm-motore" data-famiglia="${esc(famiglia)}">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:12px">
        <div style="min-width:0">
          <div style="font-size:16px;font-weight:700">${comune ? '📋' : (ICONE_LAVORAZIONI_MOTORE[famiglia] || '📝')} ${esc(lav.nome)}</div>
          <div style="font-size:12px;color:var(--m);margin-top:3px;overflow-wrap:anywhere">
            ${esc(MOTORE_SCHEDE.cliente.ragione_sociale || '')}${MOTORE_SCHEDE.progetto.titolo ? ' · ' + esc(MOTORE_SCHEDE.progetto.titolo) : ''}
          </div>
        </div>
        <button type="button" class="btn sm" onclick="chiudiSchedaMotore()">← Indietro</button>
      </div>
      <div id="msm-campi" oninput="aggiornaFontiDopoModificaMotore(event)" onchange="aggiornaFontiDopoModificaMotore(event)">${htmlCampiMotore(lav, MOTORE_SCHEDE.datiBase)}</div>
      ${htmlFotoVideoMotore(lav)}
      <div class="ma" style="margin:18px 0 40px">
        <button type="button" class="btn" onclick="chiudiSchedaMotore()">Annulla</button>
        <button type="button" class="btn p" id="msm-salva" onclick="salvaSchedaMotore()">💾 Salva scheda</button>
      </div>
    </div>
  `;
}

// Luogo dei lavori e referente dall'anagrafica, solo se la scheda non li ha mai avuti
function precompilaDaSedeCliente(dati) {
  const c = MOTORE_SCHEDE.cliente || {};
  const sedi = MOTORE_SCHEDE.sedi || [];
  if (dati.indirizzo_lavori === undefined) {
    const principali = sedi.filter(function(s) { return s.principale; });
    const sede = principali.length === 1 ? principali[0] : (sedi.length === 1 ? sedi[0] : null);
    if (sede) {
      dati.sede_id = sede.id;
      dati.indirizzo_lavori = testoSedeMotore(sede);
    } else {
      dati.indirizzo_lavori = [c.indirizzo, [c.cap, c.citta].filter(Boolean).join(' '), c.provincia ? '(' + c.provincia + ')' : '']
        .filter(Boolean).join(', ').replace(', (', ' (');
    }
  }
  if (dati.referente_lavori === undefined) dati.referente_lavori = c.referente_nome || '';
  if (dati.telefono_referente === undefined) dati.telefono_referente = c.referente_telefono || '';
  if (!dati.tipo_richiesta) dati.tipo_richiesta = 'definitiva';
}

function testoSedeMotore(s) {
  const via = [s.via, s.civico].filter(Boolean).join(' ');
  const citta = [s.cap, s.citta].filter(Boolean).join(' ') + (s.provincia ? ' (' + s.provincia + ')' : '');
  const indirizzo = [via, citta.trim()].filter(Boolean).join(', ');
  return [s.nome, indirizzo].filter(Boolean).join(' – ');
}

function opzioniMenuMotore(c) {
  if (c.tipo === 'si_no') return [{ valore: 'si', etichetta: 'Sì' }, { valore: 'no', etichetta: 'No' }];
  return (c.valori_ammessi || []).map(function(x) { return { valore: String(x.valore), etichetta: String(x.etichetta || x.valore) }; });
}

function htmlCampiMotore(lav, d) {
  const indicativa = d.tipo_richiesta === 'indicativa';
  const ingegnere = scriveLivelloIngegnere();
  const campi = campiSchedaMotore(lav);
  const obbligatori = campi.filter(serveAlPrezzoMotore).length;
  const sedi = MOTORE_SCHEDE.sedi || [];
  const comune = lav && lav.codice === FAMIGLIA_COMUNE; // F15.8

  const richiesta = comune ? (htmlFonteRilievoMotore() ? '<div class="card" style="margin-bottom:12px">' + htmlFonteRilievoMotore() + '</div>' : '') : `
    <div class="card" style="margin-bottom:12px">
      <div class="f" style="margin-bottom:4px">
        <label for="msm-tipo-richiesta">Tipo di richiesta</label>
        <select id="msm-tipo-richiesta" onchange="cambiaTipoRichiestaMotore()">
          <option value="definitiva"${indicativa ? '' : ' selected'}>Definitiva: dati misurati e verificati</option>
          <option value="indicativa"${indicativa ? ' selected' : ''}>Indicativa: il cliente non conosce tutti i dati</option>
        </select>
      </div>
      <div style="font-size:12px;color:var(--m)">
        ${indicativa
          ? 'Nella richiesta indicativa puoi segnare <b>❓ Non noto</b> i dati che il cliente non sa: andranno chiesti prima del preventivo definitivo.'
          : 'Nella richiesta definitiva ogni dato si compila (niente "non noto").'}
      </div>
      ${htmlFonteRilievoMotore()}
    </div>`;

  const luogo = `
    <div class="rap-section">${comune ? 'Luogo dei lavori e referente in cantiere' : 'Luogo dei lavori e referente'}</div>
    <div class="card" style="margin-bottom:12px">
      ${sedi.length ? `
        <div class="f">
          <label for="msm-sede">Sede del cliente</label>
          <select id="msm-sede" onchange="cambiaSedeMotore()">
            <option value="">Altro indirizzo (scritto sotto)</option>
            ${sedi.map(function(s) {
              return '<option value="' + esc(s.id) + '"' + (d.sede_id === s.id ? ' selected' : '') + '>' + esc(testoSedeMotore(s) || 'Sede') + (s.principale ? ' (principale)' : '') + '</option>';
            }).join('')}
          </select>
        </div>` : ''}
      <div class="f">
        <label for="msm-indirizzo-lavori">Indirizzo dei lavori <span style="font-weight:400;color:var(--m)">(dalla scheda del cliente, modificabile)</span></label>
        <input id="msm-indirizzo-lavori" maxlength="300" value="${esc(d.indirizzo_lavori || '')}">
      </div>
      <div class="fr">
        <div class="f"><label for="msm-referente">Referente sul posto</label><input id="msm-referente" maxlength="120" value="${esc(d.referente_lavori || '')}"></div>
        <div class="f"><label for="msm-telefono-referente">Telefono del referente</label><input id="msm-telefono-referente" type="tel" inputmode="tel" maxlength="40" value="${esc(d.telefono_referente || '')}"></div>
      </div>
    </div>`;

  const righe = campi.map(function(c) { return htmlCampoMotore(c, d[c.codice], indicativa, ingegnere); }).join('');

  return richiesta + luogo + `
    <div class="rap-section">${comune ? 'Chi decide, perché, entro quando, accessi e orari' : 'Dati della lavorazione'}</div>
    ${comune && !obbligatori ? '<div style="font-size:12px;color:var(--m);margin-bottom:6px">Tutto facoltativo: compila quello che sai. Il perché e il motivo della data si scelgono dalla lista.</div>' : ''}
    ${obbligatori ? '<div style="font-size:12px;color:var(--m);margin-bottom:6px"><b>*</b> = serve per calcolare il preventivo. Gli altri dati sono facoltativi.' +
      (ingegnere ? '' : ' I campi 🎓 li compila l’ingegnere.') + '</div>' : ''}
    <div class="card">${righe}</div>
  `;
}

function htmlCampoMotore(c, valore, indicativa, ingegnere) {
  const id = 'msm-c-' + c.codice;
  const solaLettura = c.livello === 'ingegnere' && !ingegnere;
  const nonNoto = indicativa && !solaLettura && valore === VALORE_NON_NOTO;
  const eraNonNoto = !indicativa && valore === VALORE_NON_NOTO;
  const val = (valore === VALORE_NON_NOTO && !solaLettura) ? '' : valore;
  const etichetta = esc(c.etichetta) + (serveAlPrezzoMotore(c) ? ' <b style="color:var(--r)">*</b>' : '') +
    (c.livello === 'ingegnere' ? ' <span title="Campo dell’ingegnere">🎓</span>' : '');
  const dis = solaLettura || nonNoto ? ' disabled' : '';
  const nota = solaLettura
    ? '<div style="font-size:11px;color:var(--m)">Lo compila l’ingegnere: per te è in sola lettura.</div>'
    : (eraNonNoto ? '<div style="font-size:11px;color:#854F0B">Era "non noto": nella richiesta definitiva va compilato.</div>' : '');
  // "Non noto" per i numeri e i testi brevi (non per le note)
  const lungo = c.tipo === 'testo' && (CAMPI_TESTO_LUNGO_MOTORE.includes(c.codice) || /note|logistica|descrizione|indicazioni/i.test(c.codice) || String(c.etichetta || '').length > 45);
  const casella = indicativa && !solaLettura && (c.tipo === 'numero' || (c.tipo === 'testo' && !lungo))
    ? `<label style="display:flex;gap:6px;align-items:center;font-size:12px;font-weight:400;margin-top:4px;white-space:nowrap">
         <input type="checkbox" id="msm-nn-${esc(c.codice)}" style="width:auto"${nonNoto ? ' checked' : ''} onchange="cambiaNonNotoMotore('${esc(c.codice)}')"> ❓ Non noto
       </label>`
    : '';
  let controllo;

  if (c.tipo === 'elenco') {
    // F15.7 (sql/81): righe ripetibili (pareti in cartongesso), niente "non noto"
    return `<div class="f" data-campo-motore="${esc(c.codice)}">
      <label>${etichetta}</label>
      ${htmlElencoMotore(c, valore, solaLettura)}
      ${nota}
    </div>`;
  } else if (c.tipo === 'menu' || c.tipo === 'si_no') {
    const opz = opzioniMenuMotore(c);
    const scelto = val === null || val === undefined ? '' : String(val);
    const fuori = scelto && scelto !== VALORE_NON_NOTO && !opz.some(function(o) { return o.valore === scelto; });
    controllo = `<select id="${id}"${solaLettura ? ' disabled' : ''}>
      <option value="">Seleziona</option>
      ${opz.map(function(o) { return '<option value="' + esc(o.valore) + '"' + (o.valore === scelto ? ' selected' : '') + '>' + esc(o.etichetta) + '</option>'; }).join('')}
      ${fuori ? '<option value="' + esc(scelto) + '" selected>' + esc(scelto) + ' (non più in elenco)</option>' : ''}
      ${indicativa && !solaLettura ? '<option value="' + VALORE_NON_NOTO + '"' + (valore === VALORE_NON_NOTO ? ' selected' : '') + '>❓ Non noto</option>' : ''}
      ${solaLettura && scelto === VALORE_NON_NOTO ? '<option value="' + VALORE_NON_NOTO + '" selected>❓ Non noto</option>' : ''}
    </select>`;
  } else if (c.tipo === 'numero') {
    controllo = `<div style="display:flex;gap:6px;align-items:center">
      <input id="${id}" inputmode="decimal" autocomplete="off" value="${esc(testoNumeroMotore(val))}"${dis} style="flex:1 1 auto;min-width:0">
      ${c.unita ? '<span style="font-size:13px;color:var(--m);flex:0 0 auto">' + esc(c.unita) + '</span>' : ''}
    </div>`;
  } else {
    const testo = val === null || val === undefined ? '' : String(val);
    if (CAMPI_DATA_MOTORE.includes(c.codice) && (!testo || /^\d{4}-\d{2}-\d{2}$/.test(testo))) {
      // F15.8: data (entro quando), salvata AAAA-MM-GG
      controllo = `<input id="${id}" type="date" value="${esc(testo)}"${dis}>`;
    } else
    controllo = lungo
      ? `<textarea id="${id}" rows="3" maxlength="2000"${dis}>${esc(testo)}</textarea>`
      : `<div style="display:flex;gap:6px;align-items:center"><input id="${id}" maxlength="300" value="${esc(testo)}"${dis} style="flex:1 1 auto;min-width:0">${c.unita ? '<span style="font-size:13px;color:var(--m)">' + esc(c.unita) + '</span>' : ''}</div>`;
  }

  return `<div class="f" data-campo-motore="${esc(c.codice)}">
    <label for="${id}">${etichetta}</label>
    ${controllo}
    ${casella}
    ${nota}
    ${htmlFonteCampoMotore(c, valore)}
  </div>`;
}

function cambiaNonNotoMotore(codice) {
  const casella = ge('msm-nn-' + codice);
  const campo = ge('msm-c-' + codice);
  if (!casella || !campo) return;
  campo.disabled = casella.checked;
  if (casella.checked) campo.value = '';
  segnaSchedaRilievoModificata();
}

function cambiaSedeMotore() {
  const id = v('msm-sede');
  const sede = (MOTORE_SCHEDE.sedi || []).find(function(s) { return s.id === id; });
  if (sede) ge('msm-indirizzo-lavori').value = testoSedeMotore(sede);
  else if (ge('msm-indirizzo-lavori')) ge('msm-indirizzo-lavori').focus();
}

// Indicativa ↔ definitiva: quello che è scritto resta, il modulo si ridisegna
function cambiaTipoRichiestaMotore() {
  const dati = datiFormSchedaMotore();
  MOTORE_SCHEDE.datiBase = dati;
  ge('msm-campi').innerHTML = htmlCampiMotore(lavorazioneCatalogo(MOTORE_SCHEDE.famiglia), dati);
  segnaSchedaRilievoModificata();
}

// ── Lettura del modulo (anche per passare da un tab all'altro) ──────────
function motoreInFinestra(famiglia) {
  const el = ge('msm-motore');
  return !!(el && ge('mrt-content') && ge('mrt-content').contains(el) && (!famiglia || el.dataset.famiglia === famiglia));
}

function datiFormSchedaMotore() {
  const lav = lavorazioneCatalogo(MOTORE_SCHEDE.famiglia);
  // Si parte dai dati di prima: le chiavi che il motore non mostra restano
  const dati = Object.assign({}, MOTORE_SCHEDE.datiBase || {});
  dati.tipo_richiesta = v('msm-tipo-richiesta') || 'definitiva';
  dati.sede_id = ge('msm-sede') ? (v('msm-sede') || '') : (dati.sede_id || '');
  dati.indirizzo_lavori = String(v('msm-indirizzo-lavori') || '').trim();
  dati.referente_lavori = String(v('msm-referente') || '').trim();
  dati.telefono_referente = String(v('msm-telefono-referente') || '').trim();
  const ingegnere = scriveLivelloIngegnere();
  campiSchedaMotore(lav).forEach(function(c) {
    if (c.tipo === 'elenco') { // F15.7: pareti in cartongesso
      if (c.livello === 'ingegnere' && !ingegnere) return;
      const righe = leggiElencoMotore(c);
      if (righe !== undefined) dati[c.codice] = righe;
      return;
    }
    const el = ge('msm-c-' + c.codice);
    if (!el) return;
    if (c.livello === 'ingegnere' && !ingegnere) return; // resta il valore di prima
    const casella = ge('msm-nn-' + c.codice);
    if (casella && casella.checked) { dati[c.codice] = VALORE_NON_NOTO; return; }
    const testo = String(el.value || '').trim();
    if (c.tipo === 'numero') {
      const n = numeroMotore(testo);
      const prima = (MOTORE_SCHEDE.datiBase || {})[c.codice];
      // F15.4: stesso numero già salvato (anche come testo "350" dalla scheda di js/18) = si rimanda com'era
      if (n !== null && !isNaN(n) && prima !== undefined && prima !== null && prima !== '' && numeroMotore(prima) === n) dati[c.codice] = prima;
      else dati[c.codice] = n === null ? '' : (isNaN(n) ? testo : n); // il testo non valido lo ferma il salvataggio
    } else {
      dati[c.codice] = testo;
    }
  });
  scriviFontiNeiDatiMotore(dati);
  scriviFotoVideoNeiDatiMotore(dati); // F15.9
  return dati;
}

if (typeof datiFormSchedaRilievo === 'function') {
  const datiFormSchedaRilievoSenzaMotore = datiFormSchedaRilievo;
  // eslint-disable-next-line no-global-assign
  datiFormSchedaRilievo = function(famiglia) {
    if (motoreInFinestra(famiglia)) return datiFormSchedaMotore();
    return datiFormSchedaRilievoSenzaMotore.apply(this, arguments);
  };
}

if (typeof apriFamigliaSchedaRilievo === 'function') {
  const apriFamigliaSchedaRilievoSenzaMotore = apriFamigliaSchedaRilievo;
  // eslint-disable-next-line no-global-assign
  apriFamigliaSchedaRilievo = async function(famiglia, numero) {
    if (motoreInFinestra(famiglia)) return disegnaSchedaMotore(numero);
    return apriFamigliaSchedaRilievoSenzaMotore.apply(this, arguments);
  };
}

// ── Salvataggio ────────────────────────────────────────────────────────
function numeriNonValidiMotore(dati, lav) {
  return campiSchedaMotore(lav).filter(function(c) {
    const x = dati[c.codice];
    return c.tipo === 'numero' && typeof x === 'string' && x !== '' && x !== VALORE_NON_NOTO && isNaN(numeroMotore(x)); // "350" salvato come testo va bene
  });
}

function obbligatoriMancantiMotore(dati, lav) {
  // F15.8: anche "non noto" nella definitiva e "da verificare", "da definire", "?", "xx"
  const indicativa = dati && dati.tipo_richiesta === 'indicativa';
  return campiSchedaMotore(lav).filter(function(c) {
    return serveAlPrezzoMotore(c) && !!problemaValoreInvio(dati[c.codice], c, indicativa);
  });
}

// ── F15.4: campi del prezzo, campi dell'ingegnere, plausibilità ─────────
// D2: obbligatori solo i campi che servono al prezzo (sql/78; prima "obbligatorio")
function serveAlPrezzoMotore(c) {
  if (!c) return false;
  return c.serve_al_prezzo !== undefined && c.serve_al_prezzo !== null ? !!c.serve_al_prezzo : !!c.obbligatorio;
}

// Le note interne di tutte le schede di js/18 sono dell'ingegnere (come sql/78)
const CAMPI_INGEGNERE_SEMPRE = [
  { codice: 'note_tecniche', etichetta: 'Indicazioni per preventivo e posa' },
  { codice: 'note_calcolo', etichetta: 'Note interne per il calcolo' }
];

function campiIngegnereLavorazione(famiglia) {
  const lav = typeof lavorazioneCatalogo === 'function' ? lavorazioneCatalogo(famiglia) : null;
  const campi = ((lav && lav.lavorazioni_campi) || []).filter(function(c) { return c.livello === 'ingegnere'; })
    .map(function(c) { return { codice: c.codice, etichetta: c.etichetta }; });
  CAMPI_INGEGNERE_SEMPRE.forEach(function(c) {
    if (!campi.some(function(x) { return x.codice === c.codice; })) campi.push(c);
  });
  return campi;
}

function vuotoMotore(x) {
  return x === null || x === undefined || (typeof x === 'string' && x.trim() === '');
}

function ugualeMotore(a, b) {
  if (vuotoMotore(a) && vuotoMotore(b)) return true;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = numeroMotore(a), nb = numeroMotore(b);
    if (na !== null && nb !== null && !isNaN(na) && !isNaN(nb)) return na === nb;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function metriMotore(n, unita) {
  const u = String(unita || 'cm').trim().toLowerCase();
  if (u === 'mm') return n / 1000;
  if (u === 'm' || u === 'ml') return n;
  return n / 100;
}

// Problemi di plausibilità dei dati CAMBIATI (stesse regole di sql/78).
// opz: { quantita, quantitaPrima, rappresentante } (rappresentante: anche campi
// dell'ingegnere, numeri non validi e menu fuori elenco).
function problemiPlausibilitaDati(famiglia, nuovi, prima, opz) {
  opz = opz || {};
  const n = nuovi || {}, o = prima || {};
  const lav = typeof lavorazioneCatalogo === 'function' ? lavorazioneCatalogo(famiglia) : null;
  const campi = ((lav && lav.lavorazioni_campi) || []);
  const problemi = [];
  const cambiato = function(k) { return !ugualeMotore(n[k], o[k]); };

  if (opz.rappresentante) {
    campiIngegnereLavorazione(famiglia).forEach(function(c) {
      if (cambiato(c.codice)) problemi.push('«' + c.etichetta + '» lo compila l’ingegnere');
    });
  }
  campi.filter(function(c) { return c.attivo !== false && ['numero', 'menu', 'si_no'].includes(c.tipo); }).forEach(function(c) {
    const x = n[c.codice];
    if (vuotoMotore(x) || !cambiato(c.codice) || x === VALORE_NON_NOTO) return;
    if (c.tipo === 'numero') {
      const num = numeroMotore(x);
      if (num === null || isNaN(num)) {
        if (opz.rappresentante) problemi.push(c.etichetta + ': «' + x + '» non è un numero');
        return;
      }
      const min = c.min_plausibile === null || c.min_plausibile === undefined ? null : Number(c.min_plausibile);
      const max = c.max_plausibile === null || c.max_plausibile === undefined ? null : Number(c.max_plausibile);
      if ((min !== null && num < min) || (max !== null && num > max)) {
        const u = c.unita ? ' ' + c.unita : '';
        problemi.push(c.etichetta + ': ' + testoNumeroMotore(num) + u + ' è fuori dal plausibile (' +
          (min !== null ? testoNumeroMotore(min) : '…') + '-' + (max !== null ? testoNumeroMotore(max) : '…') + u + ')');
      }
    } else if (opz.rappresentante) {
      const ok = c.tipo === 'menu'
        ? opzioniMenuMotore(c).some(function(v1) { return v1.valore === String(x); })
        : (x === true || x === false || x === 'si' || x === 'no');
      if (!ok) problemi.push(c.etichetta + ': «' + x + '» non è tra i valori del menu');
    }
  });

  // m² coerenti con larghezza × altezza (una porta o la quantità)
  const l = numeroMotore(n.larghezza), h = numeroMotore(n.altezza);
  if (l && h && !isNaN(l) && !isNaN(h) && l > 0 && h > 0) {
    const unita = function(cod) {
      const c = campi.find(function(x) { return x.codice === cod && x.tipo === 'numero'; });
      return c ? c.unita : null;
    };
    const area = metriMotore(l, unita('larghezza')) * metriMotore(h, unita('altezza'));
    let q = opz.quantita !== undefined && opz.quantita !== null ? Number(opz.quantita) : numeroMotore(n.quantita);
    if (!q || isNaN(q) || q <= 0) q = 1;
    campi.filter(function(c) {
      return c.attivo !== false && c.tipo === 'numero' && ['m²', 'm2', 'mq', 'm^2'].includes(String(c.unita || '').trim().toLowerCase());
    }).forEach(function(c) {
      const m2 = numeroMotore(n[c.codice]);
      if (m2 === null || isNaN(m2)) return;
      const cambiate = cambiato(c.codice) || cambiato('larghezza') || cambiato('altezza') || cambiato('quantita') ||
        (opz.quantita !== undefined && Number(opz.quantita) !== Number(opz.quantitaPrima));
      if (!cambiate) return;
      if (Math.abs(m2 - area) > Math.max(0.05, area * 0.1) && Math.abs(m2 - area * q) > Math.max(0.05, area * q * 0.1)) {
        problemi.push(c.etichetta + ': ' + testoNumeroMotore(Math.round(m2 * 100) / 100) + ' m² non torna con larghezza × altezza (' +
          testoNumeroMotore(Math.round(area * 100) / 100) + ' m²' +
          (q !== 1 ? ', per ' + testoNumeroMotore(q) + ' = ' + testoNumeroMotore(Math.round(area * q * 100) / 100) + ' m²' : '') + ')');
      }
    });
  }
  return problemi;
}

// Prima di salvare le schede di rilievo (tutte: motore e le 7 di js/18).
// elenco = [{ famiglia, numero, dati, prima }]. Rappresentante: blocca;
// gli altri: conferma. Restituisce null (si salva) o { message } (fermo).
function controlloSchedeRilievoPrimaDelSalvataggio(elenco) {
  const rapp = typeof ROLE !== 'undefined' && ROLE === 'rappresentante';
  const righe = [];
  (elenco || []).forEach(function(e) {
    const p = problemiPlausibilitaDati(e.famiglia, e.dati, e.prima, { rappresentante: rapp });
    p.forEach(function(x) { righe.push(((elenco.length > 1 && e.numero) ? 'Scheda ' + e.numero + ' – ' : '') + x); });
  });
  if (!righe.length) return null;
  if (rapp) return { message: righe.join('; ') + '. Ricontrolla i dati', code: 'plausibilita' };
  const ok = confirm('Controlla questi dati:\n\n- ' + righe.join('\n- ') + '\n\nSono giusti? OK = salva lo stesso, Annulla = torno a correggere.');
  return ok ? null : { message: 'salvataggio annullato: ricontrolla ' + righe[0], code: 'plausibilita_annullato' };
}

// Errore del salvataggio da mostrare (le regole di sql/78 hanno già il testo giusto)
function testoErroreSchedaMotore(error) {
  const m = String((error && error.message) || '');
  const bloccato = typeof messaggioInvioBloccatoRappresentante === 'function' && messaggioInvioBloccatoRappresentante(error);
  if (bloccato) return bloccato;
  if (/row-level security|permission denied/i.test(m)) {
    return 'il database non lo permette (il rappresentante compila solo i suoi progetti in bozza o da integrare)';
  }
  return m || 'errore sconosciuto';
}

async function salvaSchedaMotore() {
  if (!currentRilievoProgettoId || !motoreInFinestra()) return;
  const famiglia = MOTORE_SCHEDE.famiglia;
  const lav = lavorazioneCatalogo(famiglia);
  const dati = datiFormSchedaMotore();

  const sbagliati = numeriNonValidiMotore(dati, lav);
  if (sbagliati.length) {
    toast(sbagliati[0].etichetta + ': solo numeri (es. 90 oppure 92,5)', 'err');
    const el = ge('msm-c-' + sbagliati[0].codice);
    if (el) el.focus();
    return;
  }
  const problemaFoto = problemaFotoVideoMotore(); // F15.9
  if (problemaFoto) { toast(problemaFoto, 'err'); return; }
  // Anche le altre schede del tipo in memoria (tab con il pallino)
  const s = schedaRilievoAperta;
  if (s && s.bozze) {
    for (const n of Object.keys(s.bozze).map(Number)) {
      if (n === s.numero) continue;
      const altro = numeriNonValidiMotore(s.bozze[n].dati || {}, lav);
      if (altro.length) { toast('Scheda ' + n + ': ' + altro[0].etichetta + ' non è un numero', 'err'); return; }
    }
  }

  const riga = {
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: famiglia,
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  };
  const btn = ge('msm-salva');
  if (btn) btn.disabled = true;
  try {
    const { error, salvate } = await salvaRigaSchedaRilievo(riga);
    if (error) {
      toast('Scheda non salvata: ' + testoErroreSchedaMotore(error), 'err');
      return;
    }
    const mancanti = obbligatoriMancantiMotore(dati, lav);
    const senzaFonte = fontiMancantiDatiMotore(dati, lav);
    const senzaFoto = fotoVideoMancantiMotore(lav); // F15.9
    await dopoSalvataggioSchedaRilievo('Scheda ' + lav.nome + ' salvata', salvate);
    if (mancanti.length || senzaFonte.length || senzaFoto.length) {
      setTimeout(function() {
        toast('Salvata.' +
          (mancanti.length ? ' Per il preventivo mancano o sono da precisare: ' + mancanti.map(function(c) { return c.etichetta; }).join(', ') + '.' : '') +
          (senzaFonte.length ? ' Senza fonte (il progetto non si invia): ' + senzaFonte.map(function(c) { return c.etichetta; }).join(', ') + '.' : '') +
          (senzaFoto.length ? ' Mancano foto o video (il progetto non si invia): ' + senzaFoto.map(function(d) { return d.descrizione; }).join(', ') + '.' : ''), 'warn');
      }, 1500);
    }
    if (typeof currentProgettoTecnicoId !== 'undefined' && currentProgettoTecnicoId === riga.progetto_tecnico_id && ge('pd-schede-content')) {
      renderSchedeProgettoCommerciale(riga.progetto_tecnico_id).catch(function() {});
    }
  } finally {
    const b = ge('msm-salva');
    if (b) b.disabled = false;
  }
}

function chiudiSchedaMotore() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
  const progettoId = currentRilievoProgettoId;
  if (progettoId && typeof currentProgettoTecnicoId !== 'undefined' && currentProgettoTecnicoId === progettoId && ge('pd-schede-content')) {
    renderSchedeProgettoCommerciale(progettoId).catch(function() {});
  }
}

// ── F15.5 — FONTE DEL RILIEVO E FONTE DEI DATI NORMATIVI (sql/79) ──────
// Fonte del RILIEVO (progetti_tecnici.fonte_rilievo): sopralluogo TOLI,
// documenti del cliente, misure dichiarate dal cliente (foto e video non
// obbligatori; il PDF del preventivo per il cliente stampa "Misure fornite
// dal committente, da verificare prima dell'ordine", js/18). Si sceglie nella
// finestra del progetto (js/17) e in cima alla scheda del motore.
// Fonte di ogni DATO NORMATIVO (campi del catalogo con "normativo": classe
// REI/EI, classe R, minuti, reazione al fuoco, ATEX...): sotto il campo,
// "📜 Fonte del dato" con documento del cliente o del progettista (file
// obbligatorio), come l'esistente (foto della targhetta obbligatoria),
// dichiarato dal cliente per iscritto (modulo generato qui, da far firmare o
// accettare per email, poi caricato), definito dall'ingegnere TOLI (solo
// ingegnere e titolare, nome e data li scrive il database). Si salva in
// dati.fonti_normative.<codice> = { valore, fonte, allegato_id, ... } con la
// scheda. Il gestionale NON calcola requisiti normativi: registra da dove
// viene il dato. Senza fonte il dato non vale e l'invio del progetto si
// ferma (js/17 controllaFontiPrimaDellInvio + trigger di sql/79, anche da
// console). Senza sql/79 (RPC fonti_dati_attive) nulla di questo compare.
const FONTI_DATI = { disponibile: null, allegati: [], progettoId: null };

const FONTI_RILIEVO = [
  { valore: 'sopralluogo_toli', etichetta: 'Sopralluogo TOLI' },
  { valore: 'documenti_cliente', etichetta: 'Documenti del cliente (planimetrie, progetto)' },
  { valore: 'misure_dichiarate', etichetta: 'Misure dichiarate dal cliente' }
];

const FONTI_DATO = [
  { valore: 'documento_cliente', etichetta: 'Documento del cliente o del progettista', file: 'il documento' },
  { valore: 'come_esistente', etichetta: 'Come l’esistente (foto della targhetta)', file: 'la foto della targhetta' },
  { valore: 'dichiarato_cliente', etichetta: 'Dichiarato dal cliente per iscritto (modulo firmato o mail)', file: 'il modulo firmato o la mail del cliente' },
  { valore: 'ingegnere_toli', etichetta: 'Definito dall’ingegnere TOLI (solo con progettazione)', file: '' }
];

const TESTO_MISURE_DICHIARATE = 'Misure fornite dal committente, da verificare prima dell’ordine.';

async function verificaFontiDatiDisponibili() {
  if (FONTI_DATI.disponibile !== null) return FONTI_DATI.disponibile;
  if (typeof db === 'undefined' || !db) return false;
  const { data, error } = await db.rpc('fonti_dati_attive');
  if (!error) {
    FONTI_DATI.disponibile = data === true;
  } else if (error.code === 'PGRST202' || error.code === '42883' || /Could not find|does not exist/i.test(error.message || '')) {
    FONTI_DATI.disponibile = false;
  } else {
    return false; // errore passeggero: si riprova la prossima volta
  }
  return FONTI_DATI.disponibile;
}

function fontiDatiAttive() { return FONTI_DATI.disponibile === true; }

function etichettaFonteRilievo(valore) {
  const f = FONTI_RILIEVO.find(function(x) { return x.valore === valore; });
  return f ? f.etichetta : '';
}

function etichettaFonteDato(valore) {
  const f = FONTI_DATO.find(function(x) { return x.valore === valore; });
  return f ? f.etichetta : '';
}

function fonteConFile(fonte) { return ['documento_cliente', 'come_esistente', 'dichiarato_cliente'].includes(fonte); }

// Con le misure dichiarate dal cliente foto e video non sono obbligatori
// (per i controlli delle foto di F15.9)
function fotoObbligatorieProgetto(progetto) {
  return !(progetto && progetto.fonte_rilievo === 'misure_dichiarate');
}

function campiNormativiMotore(lav) {
  return campiSchedaMotore(lav).filter(function(c) { return !!c.normativo; });
}

function valoreSenzaFonteNecessaria(x) {
  return vuotoMotore(x) || x === VALORE_NON_NOTO;
}

// Una fonte vale per il dato di oggi? (stesse regole di fonti_mancanti_progetto)
function problemaFonteDato(voce, valore, toccata) {
  if (valoreSenzaFonteNecessaria(valore)) return '';
  if (!voce || !voce.fonte) return 'senza fonte';
  if (!FONTI_DATO.some(function(f) { return f.valore === voce.fonte; })) return 'fonte non valida';
  if (!toccata && !ugualeMotore(voce.valore, valore)) return 'il dato è cambiato dopo la fonte';
  if (fonteConFile(voce.fonte)) {
    if (!voce.allegato_id) return 'manca ' + FONTI_DATO.find(function(f) { return f.valore === voce.fonte; }).file;
    if (FONTI_DATI.progettoId && FONTI_DATI.allegati.length &&
        !FONTI_DATI.allegati.some(function(a) { return a.id === voce.allegato_id; })) return 'il file non è più tra i file del progetto';
  }
  return '';
}

// Campi normativi compilati senza una fonte valida (avviso dopo il salvataggio)
function fontiMancantiDatiMotore(dati, lav) {
  if (!fontiDatiAttive()) return [];
  const fonti = (dati && dati.fonti_normative) || {};
  return campiNormativiMotore(lav).filter(function(c) {
    return !!problemaFonteDato(fonti[c.codice], dati[c.codice], true);
  });
}

async function caricaAllegatiFontiMotore(progettoId) {
  FONTI_DATI.progettoId = progettoId;
  FONTI_DATI.allegati = [];
  const { data } = await db.from('progetti_tecnici_allegati')
    .select('id,nome_file,storage_path,mime_type,caricato_il')
    .eq('progetto_id', progettoId).order('caricato_il', { ascending: false });
  FONTI_DATI.allegati = data || [];
}

function iniziaFontiMotore(dati) {
  const f = dati && dati.fonti_normative && typeof dati.fonti_normative === 'object' && !Array.isArray(dati.fonti_normative)
    ? dati.fonti_normative : {};
  MOTORE_SCHEDE.fonti = JSON.parse(JSON.stringify(f));
  MOTORE_SCHEDE.fontiToccate = {};
}

// Nei dati che si salvano: le voci non toccate tornano uguali (il database non
// le ricontrolla), quelle toccate valgono per il dato di adesso
function scriviFontiNeiDatiMotore(dati) {
  if (!fontiDatiAttive() || !MOTORE_SCHEDE.fonti) return;
  const fonti = {};
  Object.keys(MOTORE_SCHEDE.fonti).forEach(function(k) {
    const voce = MOTORE_SCHEDE.fonti[k];
    if (!voce || !voce.fonte) return;
    fonti[k] = (MOTORE_SCHEDE.fontiToccate || {})[k]
      ? Object.assign({}, voce, { valore: dati[k] === undefined ? null : dati[k] })
      : voce;
  });
  if (Object.keys(fonti).length || (MOTORE_SCHEDE.datiBase && MOTORE_SCHEDE.datiBase.fonti_normative)) {
    dati.fonti_normative = fonti;
  }
}

function valoreAttualeCampoMotore(codice) {
  const lav = lavorazioneCatalogo(MOTORE_SCHEDE.famiglia);
  const c = campiSchedaMotore(lav).find(function(x) { return x.codice === codice; });
  if (!c) return undefined;
  const casella = ge('msm-nn-' + codice);
  if (casella && casella.checked) return VALORE_NON_NOTO;
  const el = ge('msm-c-' + codice);
  if (!el) return (MOTORE_SCHEDE.datiBase || {})[codice];
  const testo = String(el.value || '').trim();
  if (c.tipo === 'numero') { const n = numeroMotore(testo); return n === null ? '' : (isNaN(n) ? testo : n); }
  return testo;
}

// Fonte del rilievo in cima alla scheda: si salva subito sul progetto
function htmlFonteRilievoMotore() {
  if (!fontiDatiAttive() || !MOTORE_SCHEDE.progetto) return '';
  // sql/259 (richiesta di Erika dell'11/11): il rappresentante (anche
  // "Entra come") non sceglie la fonte del rilievo: all'invio vale
  // "Sopralluogo TOLI". Ingegnere e titolare la vedono e la cambiano.
  if (ROLE === 'rappresentante') return '';
  const p = MOTORE_SCHEDE.progetto;
  const puo = ['rappresentante', 'ingegnere', 'titolare'].includes(ROLE);
  return `
    <div class="f" style="margin:10px 0 4px">
      <label for="msm-fonte-rilievo">📐 Fonte del rilievo del progetto</label>
      <select id="msm-fonte-rilievo" onchange="salvaFonteRilievoMotore()"${puo ? '' : ' disabled'}>
        <option value="">Da indicare (senza, il progetto non si invia)</option>
        ${FONTI_RILIEVO.map(function(f) { return '<option value="' + f.valore + '"' + (p.fonte_rilievo === f.valore ? ' selected' : '') + '>' + esc(f.etichetta) + '</option>'; }).join('')}
      </select>
    </div>
    <div id="msm-fonte-rilievo-nota" style="font-size:12px;color:var(--m)">${esc(notaFonteRilievo(p.fonte_rilievo))}</div>`;
}

function notaFonteRilievo(valore) {
  if (valore === 'misure_dichiarate') return 'Foto e video non obbligatori. Nel preventivo per il cliente: «' + TESTO_MISURE_DICHIARATE + '»';
  return 'Vale per tutto il progetto: si salva subito.';
}

async function salvaFonteRilievoMotore() {
  const sel = ge('msm-fonte-rilievo');
  const p = MOTORE_SCHEDE.progetto;
  if (!sel || !p) return;
  const prima = p.fonte_rilievo || '';
  const { data, error } = await db.from('progetti_tecnici').update({ fonte_rilievo: sel.value || null })
    .eq('id', p.id).select('id');
  if (error || !data || !data.length) {
    sel.value = prima;
    toast('Fonte del rilievo non salvata: ' + (error ? error.message : 'il progetto non si può modificare in questo stato'), 'err');
    return;
  }
  p.fonte_rilievo = sel.value || null;
  const nota = ge('msm-fonte-rilievo-nota');
  if (nota) nota.textContent = notaFonteRilievo(p.fonte_rilievo);
  toast('Fonte del rilievo salvata', 'ok');
}

// Riquadro "📜 Fonte del dato" sotto un campo normativo
function htmlFonteCampoMotore(c, valore) {
  if (!fontiDatiAttive() || !c.normativo) return '';
  return `<div id="msm-fonte-${esc(c.codice)}" class="msm-fonte" style="margin-top:6px;padding:8px;border:1px dashed var(--bo);border-radius:var(--rs);background:var(--bg)">
    ${htmlInternoFonteMotore(c.codice, valore)}
  </div>`;
}

// valoreDisegno: il dato mentre si disegna la scheda (il modulo non c'è ancora);
// senza, il dato scritto adesso nel modulo
function htmlInternoFonteMotore(codice, valoreDisegno) {
  const voce = (MOTORE_SCHEDE.fonti || {})[codice] || null;
  const toccata = !!(MOTORE_SCHEDE.fontiToccate || {})[codice];
  const valore = arguments.length > 1 ? valoreDisegno : valoreAttualeCampoMotore(codice);
  const ingegnere = scriveLivelloIngegnere();
  const fonte = voce ? voce.fonte : '';
  const opzioni = FONTI_DATO.filter(function(f) { return f.valore !== 'ingegnere_toli' || ingegnere || fonte === 'ingegnere_toli'; });
  const problema = problemaFonteDato(voce, valore, toccata);
  let dettaglio = '';

  if (fonteConFile(fonte)) {
    const immagini = fonte === 'come_esistente';
    dettaglio += `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
      <select id="msm-fa-${esc(codice)}" style="flex:1 1 180px;min-width:0" onchange="scegliFileFonteMotore('${esc(codice)}')">
        <option value="">Scegli un file del progetto…</option>
        ${FONTI_DATI.allegati.map(function(a) {
          return '<option value="' + esc(a.id) + '"' + (voce && voce.allegato_id === a.id ? ' selected' : '') + '>' + esc(a.nome_file) + '</option>';
        }).join('')}
        ${voce && voce.allegato_id && !FONTI_DATI.allegati.some(function(a) { return a.id === voce.allegato_id; })
          ? '<option value="' + esc(voce.allegato_id) + '" selected>' + esc(voce.allegato_nome || 'file') + ' (non più tra i file)</option>' : ''}
      </select>
      <label class="btn sm" style="margin:0;cursor:pointer">📎 ${immagini ? 'Foto' : 'Carica'}
        <input type="file" style="display:none" accept="${immagini ? 'image/*' : '.pdf,.jpg,.jpeg,.png,.eml,.msg,application/pdf,image/*'}"${immagini ? ' capture="environment"' : ''}
          onchange="caricaFileFonteMotore('${esc(codice)}', this)">
      </label>
      ${voce && voce.allegato_id ? `<button type="button" class="btn sm" onclick="apriFileFonteMotore('${esc(codice)}')">👁 Apri</button>` : ''}
      ${fonte === 'dichiarato_cliente' ? `<button type="button" class="btn sm" onclick="generaModuloDichiarazioneMotore()">📄 Modulo da far firmare</button>` : ''}
    </div>`;
  } else if (fonte === 'ingegnere_toli') {
    dettaglio += '<div style="font-size:12px;color:var(--m);margin-top:4px">' +
      (voce && voce.da_nome && !toccata
        ? 'Definito da ' + esc(voce.da_nome) + (voce.il ? ' il ' + esc(new Date(voce.il).toLocaleDateString('it-IT')) : '')
        : 'Nome e data li scrive il gestionale quando salvi.') + '</div>';
  }
  if (voce && voce.fonte && voce.da_nome && !toccata && fonte !== 'ingegnere_toli') {
    dettaglio += '<div style="font-size:11px;color:var(--m);margin-top:4px">Indicata da ' + esc(voce.da_nome) +
      (voce.il ? ' il ' + esc(new Date(voce.il).toLocaleDateString('it-IT')) : '') + '</div>';
  }
  let stato = '';
  if (valoreSenzaFonteNecessaria(valore)) {
    stato = '<div style="font-size:11px;color:var(--m);margin-top:4px">Dato vuoto o non noto: la fonte non serve.</div>';
  } else if (problema === 'il dato è cambiato dopo la fonte') {
    stato = `<div style="font-size:12px;color:#854F0B;margin-top:4px">⚠️ Il dato è cambiato dopo la fonte (era «${esc(valoreSchedaTecnica(voce.valore))}»).
      <button type="button" class="btn sm" onclick="confermaFonteMotore('${esc(codice)}')">✓ Vale per il dato nuovo</button></div>`;
  } else if (problema) {
    stato = '<div style="font-size:12px;color:var(--r);margin-top:4px">⚠️ ' + esc(problema.charAt(0).toUpperCase() + problema.slice(1)) + ': il progetto non si invia.</div>';
  } else {
    stato = '<div style="font-size:12px;color:var(--g);margin-top:4px">✓ Fonte indicata' + (toccata ? ' (si salva con la scheda)' : '') + '</div>';
  }

  return `<label for="msm-f-${esc(codice)}" style="font-size:12px">📜 Fonte del dato</label>
    <select id="msm-f-${esc(codice)}" onchange="cambiaFonteMotore('${esc(codice)}')">
      <option value="">Senza fonte</option>
      ${opzioni.map(function(f) {
        return '<option value="' + f.valore + '"' + (fonte === f.valore ? ' selected' : '') +
          (f.valore === 'ingegnere_toli' && !ingegnere ? ' disabled' : '') + '>' + esc(f.etichetta) + '</option>';
      }).join('')}
    </select>
    ${dettaglio}
    ${stato}`;
}

function ridisegnaFonteMotore(codice) {
  const box = ge('msm-fonte-' + codice);
  if (box) box.innerHTML = htmlInternoFonteMotore(codice);
}

function toccaFonteMotore(codice, voce) {
  if (!MOTORE_SCHEDE.fonti) MOTORE_SCHEDE.fonti = {};
  if (!MOTORE_SCHEDE.fontiToccate) MOTORE_SCHEDE.fontiToccate = {};
  if (voce) MOTORE_SCHEDE.fonti[codice] = voce; else delete MOTORE_SCHEDE.fonti[codice];
  MOTORE_SCHEDE.fontiToccate[codice] = true;
  if (typeof segnaSchedaRilievoModificata === 'function') segnaSchedaRilievoModificata();
  ridisegnaFonteMotore(codice);
}

function cambiaFonteMotore(codice) {
  const fonte = v('msm-f-' + codice);
  if (!fonte) { toccaFonteMotore(codice, null); return; }
  const prima = (MOTORE_SCHEDE.fonti || {})[codice] || {};
  const voce = { fonte: fonte, valore: valoreAttualeCampoMotore(codice) };
  if (fonteConFile(fonte) && prima.allegato_id && fonteConFile(prima.fonte)) voce.allegato_id = prima.allegato_id;
  toccaFonteMotore(codice, voce);
}

function scegliFileFonteMotore(codice) {
  const voce = Object.assign({}, (MOTORE_SCHEDE.fonti || {})[codice] || {});
  const id = v('msm-fa-' + codice);
  ['allegato_nome', 'allegato_percorso', 'da', 'da_nome', 'da_ruolo', 'il'].forEach(function(k) { delete voce[k]; });
  if (id) voce.allegato_id = id; else delete voce.allegato_id;
  voce.valore = valoreAttualeCampoMotore(codice);
  toccaFonteMotore(codice, voce);
}

function confermaFonteMotore(codice) {
  const voce = Object.assign({}, (MOTORE_SCHEDE.fonti || {})[codice] || {});
  ['da', 'da_nome', 'da_ruolo', 'il'].forEach(function(k) { delete voce[k]; });
  voce.valore = valoreAttualeCampoMotore(codice);
  toccaFonteMotore(codice, voce);
}

// Cambiando un dato normativo il suo riquadro della fonte si aggiorna
function aggiornaFontiDopoModificaMotore(ev) {
  if (!fontiDatiAttive() || !ev || !ev.target || !ev.target.id) return;
  const m = /^msm-(?:c|nn)-(.+)$/.exec(ev.target.id);
  if (m && ge('msm-fonte-' + m[1])) ridisegnaFonteMotore(m[1]);
}

async function caricaFileFonteMotore(codice, input) {
  const originale = input && input.files && input.files[0];
  if (input) input.value = '';
  const progettoId = currentRilievoProgettoId;
  if (!originale || !progettoId) return;
  const { data: auth } = await db.auth.getUser();
  const uid = auth && auth.user && auth.user.id;
  if (!uid) { toast('Sessione scaduta: rientra e riprova', 'err'); return; }
  toast('Caricamento…', 'info');
  // F15.9: rimpicciolita, con l'impronta (sql/82-foto-video); un file già del
  // progetto si riusa per la fonte
  const r = await caricaFileNelProgetto(progettoId, uid, originale, { cartella: 'fonti', prefisso: 'fonte_' + codice + '_' });
  const alleg = r.alleg || r.doppione;
  if (!alleg) { toast(r.errore, 'err'); return; }
  if (r.doppione) toast('File già tra i file del progetto: uso quello («' + alleg.nome_file + '»)', 'info');
  if (!FONTI_DATI.allegati.some(function(x) { return x.id === alleg.id; })) FONTI_DATI.allegati.unshift(alleg);
  const voce = Object.assign({}, (MOTORE_SCHEDE.fonti || {})[codice] || {});
  ['allegato_nome', 'allegato_percorso', 'da', 'da_nome', 'da_ruolo', 'il'].forEach(function(k) { delete voce[k]; });
  voce.allegato_id = alleg.id;
  voce.valore = valoreAttualeCampoMotore(codice);
  toccaFonteMotore(codice, voce);
  if (r.alleg) toast('File caricato: ricordati di salvare la scheda', 'ok');
}

async function apriFileFonteMotore(codice) {
  const voce = (MOTORE_SCHEDE.fonti || {})[codice];
  if (!voce || !voce.allegato_id) return;
  const a = FONTI_DATI.allegati.find(function(x) { return x.id === voce.allegato_id; });
  const percorso = (a && a.storage_path) || voce.allegato_percorso;
  if (!percorso) { toast('File non trovato', 'err'); return; }
  const { data, error } = await firmaFile('progetti-tecnici', percorso, 600);
  if (error || !data || !data.signedUrl) { toast('File non disponibile' + (error ? ': ' + error.message : ''), 'err'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

// Modulo di dichiarazione dei dati da far firmare (o accettare per email)
async function generaModuloDichiarazioneMotore() {
  if (typeof preparaPDF === 'function' && !(await preparaPDF())) return;
  if (!window.jspdf) { toast('Libreria PDF non disponibile', 'err'); return; }
  const lav = lavorazioneCatalogo(MOTORE_SCHEDE.famiglia);
  const dati = datiFormSchedaMotore();
  const fonti = dati.fonti_normative || {};
  let campi = campiNormativiMotore(lav).filter(function(c) {
    return !valoreSenzaFonteNecessaria(dati[c.codice]) && fonti[c.codice] && fonti[c.codice].fonte === 'dichiarato_cliente';
  });
  if (!campi.length) campi = campiNormativiMotore(lav).filter(function(c) { return !valoreSenzaFonteNecessaria(dati[c.codice]); });
  if (!campi.length) { toast('Compila prima i dati da far dichiarare al cliente', 'err'); return; }
  const testoValore = function(c, x) {
    const o = opzioniMenuMotore(c).find(function(y) { return y.valore === String(x); });
    return (o ? o.etichetta : valoreSchedaTecnica(x)) + (c.unita && c.tipo === 'numero' ? ' ' + c.unita : '');
  };
  const cliente = MOTORE_SCHEDE.cliente || {};
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const m = 16;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(8, 80, 65);
  doc.text('TOLI FIRE', m, 18);
  doc.setFontSize(12); doc.setTextColor(40, 40, 40);
  doc.text('Dichiarazione del committente sui dati per il preventivo', m, 28);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  let y = 38;
  [['Committente', cliente.ragione_sociale || ''],
   ['Progetto', (MOTORE_SCHEDE.progetto && MOTORE_SCHEDE.progetto.titolo) || ''],
   ['Luogo dei lavori', dati.indirizzo_lavori || ''],
   ['Lavorazione', (lav ? lav.nome : '') + (MOTORE_SCHEDE.numero > 1 ? ' – scheda ' + MOTORE_SCHEDE.numero : '') + (dati.nome_scheda ? ' (' + dati.nome_scheda + ')' : '')]
  ].forEach(function(r) {
    const righe = doc.splitTextToSize(r[0] + ': ' + r[1], 178);
    doc.text(righe, m, y); y += righe.length * 5 + 1;
  });
  doc.autoTable({
    startY: y + 3, margin: { left: m, right: m },
    head: [['Dato', 'Valore dichiarato dal committente']],
    body: campi.map(function(c) { return [c.etichetta, testoValore(c, dati[c.codice])]; }),
    styles: { fontSize: 10 }, headStyles: { fillColor: [8, 80, 65] }
  });
  y = doc.lastAutoTable.finalY + 10;
  const testo = 'Il sottoscritto, in qualità di committente o suo incaricato, dichiara sotto la propria responsabilità che i dati ' +
    'sopra riportati sono quelli richiesti per l’intervento (o corrispondono a quanto già installato). TOLI FIRE li utilizza ' +
    'per formulare il preventivo così come dichiarati: non li ha verificati e non ha determinato i requisiti normativi. ' +
    'In alternativa alla firma il committente può rispondere per email confermando i dati.';
  const righe = doc.splitTextToSize(testo, 178);
  doc.text(righe, m, y); y += righe.length * 5 + 14;
  doc.text('Data ____________________', m, y);
  doc.text('Nome e cognome ______________________________', m, y + 10);
  doc.text('Firma ______________________________', m, y + 20);
  const nomeFile = 'Dichiarazione_dati_' + String(cliente.ragione_sociale || 'cliente').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40) + '.pdf';
  doc.save(nomeFile);
  toast('Modulo scaricato: fallo firmare (o confermare per email) e caricalo qui con 📎 Carica', 'ok');
}

// Riga della fonte sotto un dato nelle schede salvate (scheda progetto, js/17;
// preventivo, js/18). '' se non c'è niente da dire.
function htmlFonteDatoScheda(scheda, chiave) {
  if (FONTI_DATI.disponibile === false || !scheda || !scheda.dati) return '';
  const valore = scheda.dati[chiave];
  if (valoreSenzaFonteNecessaria(valore)) return '';
  const voce = (scheda.dati.fonti_normative || {})[chiave];
  const lav = typeof lavorazioneCatalogo === 'function' && typeof CATALOGO_LAV !== 'undefined' && CATALOGO_LAV.disponibili
    ? lavorazioneCatalogo(scheda.famiglia) : null;
  const normativo = fontiDatiAttive() && lav && campiNormativiMotore(lav).some(function(c) { return c.codice === chiave; });
  if (!voce && !normativo) return '';
  const problema = problemaFonteDato(voce, valore, false);
  const testo = voce && voce.fonte
    ? '📜 ' + etichettaFonteDato(voce.fonte) + (voce.allegato_nome ? ' · ' + voce.allegato_nome : '') +
      (voce.da_nome ? ' · ' + voce.da_nome : '') + (voce.il ? ' ' + new Date(voce.il).toLocaleDateString('it-IT') : '')
    : '';
  return '<div style="font-size:11px;margin-top:4px;color:' + (problema ? 'var(--r)' : 'var(--m)') + '">' +
    esc(testo) + (problema ? (testo ? ' · ' : '') + '⚠️ ' + esc(problema) : '') + '</div>';
}

// Prima di inviare il progetto (js/17, js/67): fonte del rilievo e fonti dei
// dati normativi (RPC fonti_mancanti_progetto di sql/79). true = si può inviare.
// sql/261 (richiesta di Erika dell'11/11, come prima del 06/11): il
// RAPPRESENTANTE (anche "Entra come") non è fermato da nessun controllo delle
// schede: niente elenco, si invia (lo decide lui: ingegnere o Acquisti; js/17
// chiede solo almeno un allegato). La fonte del rilievo la scrive
// preparaInvioRappresentante DOPO la conferma dell'invio. Ingegnere e
// titolare: come prima.
// Con le regole di smistamento accese (sql/83, oggi spente da sql/260) l'invio
// passa da js/67 inviaProgettoConSmistamento, che non si tocca: lì la fonte del
// rilievo si scrive qui, come prima (senza sql/259 il database la vuole).
async function controllaFontiPrimaDellInvio(progettoId) {
  if (ROLE === 'rappresentante') {
    if (typeof smistamentoAttivoSubito === 'function' && smistamentoAttivoSubito()) return preparaInvioRappresentante(progettoId);
    return true;
  }
  if (!(await verificaFontiDatiDisponibili())) return true;
  const { data, error } = await db.rpc('fonti_mancanti_progetto', { p_progetto: progettoId });
  if (error) return true; // il database lo ricontrolla comunque all'invio
  const problemi = data || [];
  if (problemi.length) {
    const righe = problemi.slice(0, 8).map(function(r) {
      return '- ' + (r.scheda ? r.scheda + ' – ' : '') + r.etichetta + ': ' + r.motivo;
    });
    alert('Il progetto non si può ancora inviare:\n\n' + righe.join('\n') +
      (problemi.length > 8 ? '\n- … e altri ' + (problemi.length - 8) : '') +
      '\n\nLa fonte del rilievo si indica in "Modifica" del progetto o in cima alla scheda di rilievo; ' +
      'la fonte dei dati normativi sotto il dato, nella scheda (📝 Rilievi tecnici → 📝 Compila la scheda).');
    return false;
  }
  return true;
}

// sql/259 + sql/261: chiamata da js/17 per il rappresentante DOPO la conferma
// dell'invio (e dopo il controllo dell'allegato), subito prima del cambio di
// stato. Con sql/79 e la fonte del rilievo ancora vuota la scrive il sito
// ("Sopralluogo TOLI"), così l'invio passa anche senza sql/259. true = si va
// avanti.
async function preparaInvioRappresentante(progettoId) {
  if (ROLE !== 'rappresentante') return true;
  if (!(await verificaFontiDatiDisponibili())) return true;
  return mettiFonteRilievoAutomatica(progettoId);
}

// Errore dell'invio del rappresentante: senza sql/261 il database lo ferma
// ancora per le schede (dati normativi senza fonte, dati del prezzo, foto e
// video). Il rappresentante non apre le schede: gli si dice solo a chi
// chiedere. null = non è un blocco dell'invio (si mostra l'errore com'è).
function messaggioInvioBloccatoRappresentante(error) {
  if (ROLE !== 'rappresentante') return null;
  const m = String((error && error.message) || '');
  if (!/Invio bloccato/i.test(m)) return null;
  return 'Il progetto non si può ancora inviare: le schede di rilievo non sono complete. ' +
    'Chiedi all’ingegnere di completare la scheda.';
}

// sql/259: fonte del rilievo messa dal sito per il rappresentante ("Sopralluogo
// TOLI"), solo se è ancora vuota. true = fatto (o già indicata).
async function mettiFonteRilievoAutomatica(progettoId) {
  const { data, error } = await db.from('progetti_tecnici')
    .update({ fonte_rilievo: 'sopralluogo_toli' })
    .eq('id', progettoId).is('fonte_rilievo', null).select('id');
  if (error) {
    toast('Invio non riuscito: ' + (typeof testoErroreSchedaMotore === 'function' ? testoErroreSchedaMotore(error) : error.message), 'err');
    return false;
  }
  if (data && data.length && MOTORE_SCHEDE.progetto && MOTORE_SCHEDE.progetto.id === progettoId) {
    MOTORE_SCHEDE.progetto.fonte_rilievo = 'sopralluogo_toli';
  }
  return true;
}

// ── F15.6 — MIGRAZIONE DELLE SCHEDE SCRITTE A MANO (sql/80) ─────────────
// Porte REI, estintori e rilevazione incendi (le altre 4 con F15.7): nel
// catalogo c'è un campo per ogni dato che la scheda di js/18 salvava, con
// CODICE = CHIAVE di progetti_tecnici_schede.dati. I progetti esistenti si
// aprono nel motore con tutti i dati, senza trasformarli; il codice non si
// cambia (sql/75), il titolare cambia etichette e menu e preventivo, copia di
// Acquisti, PDF per il fornitore e scheda cantiere leggono il dato con lo
// stesso codice e l'etichetta nuova (etichettaCampoTecnico/valoreSchedaTecnica
// di js/18 con la famiglia).
// Con sql/80 (RPC schede_migrate_motore = elenco delle lavorazioni migrate) e
// il motore attivo (sql/77, verificaMotoreSchedeDisponibile):
// - i bottoni "Compila ..." della verifica tecnica aprono il motore;
// - la scheda scritta a mano resta IN SOLA LETTURA ("👁 Modulo di prima" nella
//   scheda del motore; da lì "📝 Compila nel motore"), e non salva più;
// - una scheda salvata con il modulo di prima si apre nel motore con l'avviso
//   "da ricompilare": i dati ci sono, si controllano e si salva.
// Senza sql/80 (o senza sql/77) tutto come prima, nessun errore.
const MIGRAZIONE_SCHEDE = { disponibile: null, famiglie: [] };

// Chiave → funzione della scheda di js/18 (sola lettura) per le famiglie migrate
const SCHEDE_VECCHIE_MOTORE = {
  porte_rei: function(n) { return apriSchedaPorteRei(n); },
  estintori: function(n) { return apriSchedaEstintori(n); },
  rilevazione_incendi: function(n) { contestoSchedaRilevazione = 'progetto'; return apriSchedaRilevazioneIncendi(n); },
  // F15.7 (sql/81)
  compartimentazione: function(n) { return apriSchedaCompartimentazione(n); },
  vernice_intumescente: function(n) { return apriSchedaVerniceIntumescente(n); },
  coppelle: function(n) { return apriSchedaCoppelle(n); },
  impianti_spegnimento: function(n) { return apriSchedaImpiantiSpegnimento(n); }
};

// Testi lunghi delle schede di js/18 (area di testo, non una riga)
const CAMPI_TESTO_LUNGO_MOTORE = [
  'note_vano', 'logistica', 'note_tecniche', 'posizionamento', 'supporti', 'registro', 'foto_postazioni',
  'accessori_centrale', 'comandi_terzi', 'interfacce', 'struttura', 'ambienti_gravosi', 'note_posa',
  'collaudo', 'manutenzione', 'note_calcolo',
  // F15.7: compartimentazione, vernice, coppelle, spegnimento
  'sistemi_presenti', 'certificazione_sistema', 'foto', 'note_supporto', 'accessibilita', 'ciclo', 'certificazione',
  'ostacoli', 'impianto_esistente', 'componenti', 'compartimentazione', 'collegamenti', 'collaudi',
  // F15.8: blocco comune
  'accessi'
];

async function verificaMigrazioneSchedeDisponibile() {
  if (MIGRAZIONE_SCHEDE.disponibile !== null) return MIGRAZIONE_SCHEDE.disponibile;
  if (typeof db === 'undefined' || !db) return false;
  if (!(await verificaMotoreSchedeDisponibile())) return false;
  const { data, error } = await db.rpc('schede_migrate_motore');
  if (!error) {
    MIGRAZIONE_SCHEDE.famiglie = Array.isArray(data) ? data.map(String) : [];
    MIGRAZIONE_SCHEDE.disponibile = MIGRAZIONE_SCHEDE.famiglie.length > 0;
  } else if (error.code === 'PGRST202' || error.code === '42883' || /Could not find|does not exist/i.test(error.message || '')) {
    MIGRAZIONE_SCHEDE.disponibile = false;
  } else {
    return false; // errore passeggero: si riprova la prossima volta
  }
  return MIGRAZIONE_SCHEDE.disponibile;
}

// true = la scheda di questa lavorazione si compila nel motore (dopo le verifiche)
function famigliaMigrataMotore(famiglia) {
  if (MIGRAZIONE_SCHEDE.disponibile !== true || MOTORE_SCHEDE.disponibile !== true) return false;
  if (!MIGRAZIONE_SCHEDE.famiglie.includes(famiglia)) return false;
  const lav = typeof lavorazioneCatalogo === 'function' ? lavorazioneCatalogo(famiglia) : null;
  return !!(lav && campiSchedaMotore(lav).length);
}

// Catalogo e verifiche pronti (per etichette e valori delle schede salvate)
async function preparaSchedeMigrate() {
  try {
    if (!(await verificaMigrazioneSchedeDisponibile())) return false;
    if (typeof caricaCatalogoLavorazioni === 'function') await caricaCatalogoLavorazioni();
    return true;
  } catch (e) { return false; }
}

function campoCatalogoMigrato(famiglia, codice) {
  if (!famiglia || !codice) return null;
  if (!famigliaMigrataMotore(famiglia) && !(famiglia === FAMIGLIA_COMUNE && bloccoComuneAttivo())) return null; // F15.8
  const lav = lavorazioneCatalogo(famiglia);
  return ((lav && lav.lavorazioni_campi) || []).find(function(c) { return c.codice === codice; }) || null;
}

// Etichetta del campo dal catalogo (anche rinominato dal titolare), '' = non c'è
function etichettaCampoFamigliaMigrata(famiglia, codice) {
  const c = campoCatalogoMigrato(famiglia, codice);
  if (!c || !c.etichetta) return '';
  return c.etichetta + (c.unita && c.tipo === 'numero' ? ' (' + c.unita + ')' : '');
}

// Valore di un menu con l'etichetta del catalogo, '' = come prima
function valoreCampoFamigliaMigrata(famiglia, codice, valore) {
  const c = campoCatalogoMigrato(famiglia, codice);
  if (!c || valore === null || valore === undefined || valore === '' || typeof valore === 'object') return '';
  if (c.tipo === 'menu') {
    const o = opzioniMenuMotore(c).find(function(x) { return x.valore === String(valore); });
    return o ? o.etichetta : '';
  }
  if (c.tipo === 'numero' && typeof valore === 'string' && /^-?\d+\.\d+$/.test(valore.trim())) return valore.trim().replace('.', ',');
  // F15.8: date del blocco comune (AAAA-MM-GG) in italiano
  if (CAMPI_DATA_MOTORE.includes(codice) && typeof valore === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valore)) {
    return new Date(valore + 'T12:00:00').toLocaleDateString('it-IT');
  }
  return '';
}

// I bottoni della verifica tecnica aprono il motore per le lavorazioni migrate
[
  ['apriSchedaPorteReiIngegnere', 'porte_rei'],
  ['apriSchedaEstintoriIngegnere', 'estintori'],
  ['apriSchedaRilevazioneIngegnere', 'rilevazione_incendi'],
  // F15.7 (sql/81)
  ['apriSchedaCompartimentazioneIngegnere', 'compartimentazione'],
  ['apriSchedaVerniceIntumescenteIngegnere', 'vernice_intumescente'],
  ['apriSchedaCoppelleIngegnere', 'coppelle'],
  ['apriSchedaImpiantiSpegnimentoIngegnere', 'impianti_spegnimento']
].forEach(function(x) {
  const originale = window[x[0]];
  if (typeof originale !== 'function') return;
  window[x[0]] = async function() {
    const progettoId = v('mvt-id');
    if (progettoId && (await preparaSchedeMigrate()) && famigliaMigrataMotore(x[1])) {
      return apriSchedaMotore(progettoId, x[1]);
    }
    return originale.apply(this, arguments);
  };
});

// Prima di aprire una scheda: verifiche fatte (la scheda di js/18 sa se è in sola lettura)
if (typeof leggiSchedaRilievo === 'function') {
  const leggiSchedaRilievoSenzaMigrazione = leggiSchedaRilievo;
  // eslint-disable-next-line no-global-assign
  leggiSchedaRilievo = async function() {
    await preparaSchedeMigrate();
    return leggiSchedaRilievoSenzaMigrazione.apply(this, arguments);
  };
}

// Schede salvate: etichette e menu del catalogo pronti prima di disegnare
[
  'renderSchedePreventivo', 'generaRichiestaQuotazionePDF', 'caricaSchedaCantiere'
].forEach(function(nome) {
  const originale = window[nome];
  if (typeof originale !== 'function') return;
  window[nome] = async function() {
    await preparaSchedeMigrate();
    return originale.apply(this, arguments);
  };
});

// Scheda di js/18 di una lavorazione migrata: sola lettura. Chiamata dalle
// funzioni apriScheda... di js/18 dopo aver disegnato il modulo. true = bloccata.
function schedaVecchiaInSolaLettura(famiglia) {
  if (!famigliaMigrataMotore(famiglia)) return false;
  const box = ge('mrt-content');
  if (!box) return false;
  box.querySelectorAll('input, select, textarea').forEach(function(el) { el.disabled = true; });
  box.querySelectorAll('button').forEach(function(b) {
    const azione = b.getAttribute('onclick') || '';
    if (/salvaScheda|nuovaSchedaRilievo|eliminaSchedaRilievo|aggiungiPareteCartongesso|togliPareteCartongesso/.test(azione)) b.style.display = 'none';
  });
  if (schedaRilievoAperta) schedaRilievoAperta.modificata = false;
  if (!ge('msm-sola-lettura')) {
    box.insertAdjacentHTML('afterbegin', `
      <div class="al2 w" id="msm-sola-lettura" style="margin-bottom:12px">
        🔒 <b>Modulo di prima, in sola lettura.</b> Questa scheda ora si compila con il motore delle schede:
        stessi dati e stessi codici, menu e unità del <b>📚 Catalogo lavorazioni</b>. Da ricompilare lì.
        <div style="margin-top:8px"><button type="button" class="btn sm p" id="msm-torna-motore" onclick="tornaAlMotoreDaSchedaVecchia()">📝 Compila nel motore</button></div>
      </div>`);
  }
  return true;
}

// Salvataggio della scheda di js/18 di una lavorazione migrata: fermo
function salvataggioSchedaVecchiaBloccato(famiglia) {
  if (!famigliaMigrataMotore(famiglia)) return false;
  toast('Questa scheda ora si compila nel motore: premi "📝 Compila nel motore"', 'err');
  return true;
}

async function tornaAlMotoreDaSchedaVecchia() {
  const s = schedaRilievoAperta;
  const progettoId = currentRilievoProgettoId;
  if (!s || !progettoId) return;
  if (MOTORE_SCHEDE.progetto && MOTORE_SCHEDE.progetto.id === progettoId && MOTORE_SCHEDE.famiglia === s.famiglia &&
      puoCompilareMotore(MOTORE_SCHEDE.progetto)) {
    return disegnaSchedaMotore(s.numero);
  }
  return apriSchedaMotore(progettoId, s.famiglia, s.numero);
}

// Dal motore: la scheda scritta a mano dello stesso tab, in sola lettura
async function vediModuloDiPrimaMotore() {
  const famiglia = MOTORE_SCHEDE.famiglia;
  const apri = SCHEDE_VECCHIE_MOTORE[famiglia];
  if (!apri || !schedaRilievoAperta) return;
  const numero = schedaRilievoAperta.numero;
  memorizzaTabSchedaRilievo(); // quello che è scritto nel motore resta in memoria
  await apri(numero);
}

function htmlLinkModuloDiPrimaMotore(famiglia, datiSalvati) {
  if (!famigliaMigrataMotore(famiglia) || !SCHEDE_VECCHIE_MOTORE[famiglia]) return '';
  const d = datiSalvati || {};
  const daModuloDiPrima = d.tipo_richiesta === undefined &&
    Object.keys(d).some(function(k) { return k !== 'nome_scheda' && d[k] !== '' && d[k] !== null && d[k] !== undefined; });
  return `
    ${daModuloDiPrima ? `<div class="al2 i" id="msm-da-ricompilare" style="margin-bottom:10px">
      📝 <b>Da ricompilare:</b> questa scheda è stata salvata con il modulo di prima. I dati ci sono tutti (stessi codici):
      controlla tipo di richiesta, luogo dei lavori e referente (proposti dalla scheda del cliente) e premi <b>💾 Salva scheda</b>.
    </div>` : ''}
    <div style="text-align:right;margin:-4px 0 10px">
      <button type="button" class="btn sm" id="msm-modulo-prima" onclick="vediModuloDiPrimaMotore()">👁 Modulo di prima (sola lettura)</button>
    </div>`;
}

// Il motore disegna la scheda: avviso "da ricompilare" e link al modulo di prima
if (typeof disegnaSchedaMotore === 'function') {
  const disegnaSchedaMotoreSenzaMigrazione = disegnaSchedaMotore;
  // eslint-disable-next-line no-global-assign
  disegnaSchedaMotore = async function(numero) {
    await preparaSchedeMigrate();
    const esito = await disegnaSchedaMotoreSenzaMigrazione.apply(this, arguments);
    const campi = ge('msm-campi');
    if (campi && ge('msm-motore') && !ge('msm-modulo-prima')) {
      const s = schedaRilievoAperta;
      const salvata = s && typeof rigaSalvataSchedaRilievo === 'function' ? rigaSalvataSchedaRilievo(s.numero) : null;
      const datiSalvati = salvata ? salvata.dati : (s && s.datiOriginali);
      campi.insertAdjacentHTML('beforebegin', htmlLinkModuloDiPrimaMotore(MOTORE_SCHEDE.famiglia, datiSalvati));
    }
    return esito;
  };
}

// ── F15.7 — COMPARTIMENTAZIONE, VERNICE, COPPELLE, SPEGNIMENTO (sql/81) ──
// Come F15.6 per le altre 4 schede di js/18 (stesse funzioni qui sopra:
// SCHEDE_VECCHIE_MOTORE, bottoni della verifica tecnica, sola lettura). In più
// il tipo di campo 'elenco' (righe ripetibili), che sql/81 ammette SOLO per le
// PARETI IN CARTONGESSO della compartimentazione (dati.pareti_cartongesso, come
// js/18 dal 02/11): il motore disegna le stesse righe della scheda di prima
// (htmlRighePareteCartongesso di js/18: unità, larghezza e altezza in m,
// angolo, misura e numero degli angoli, "+ Aggiungi parete", "🗑️ Togli") e le
// salva nella stessa forma, così preventivo, copia di Acquisti, scheda cantiere
// e PDF per il fornitore leggono ancora "Parete 1: 4,5 × 2,7 m (m²) ...".
// Un elenco senza modulo noto (o un valore salvato che non è un elenco) resta
// com'è, in sola lettura.
function elencoPareteMotore(c) {
  return c && c.codice === 'pareti_cartongesso' && typeof htmlRighePareteCartongesso === 'function' &&
    typeof leggiPareteCartongesso === 'function';
}

function htmlElencoMotore(c, valore, solaLettura) {
  const lista = Array.isArray(valore) ? valore : [];
  const altro = !Array.isArray(valore) && !vuotoMotore(valore) && valore !== VALORE_NON_NOTO;
  const testo = function(x) { return typeof valoreSchedaTecnica === 'function' ? valoreSchedaTecnica(x, c.codice, MOTORE_SCHEDE.famiglia) : String(x); };
  if (!elencoPareteMotore(c) || solaLettura) {
    return `<div id="msm-c-${esc(c.codice)}" style="font-size:13px;white-space:pre-wrap;padding:6px 0">${esc(lista.length || altro ? testo(valore) : '—')}</div>`;
  }
  return `
    <div style="font-size:12px;color:var(--m);margin-bottom:8px">Una riga per parete: misure, angoli (interni, esterni o entrambi) con la loro misura e il numero.</div>
    ${altro ? `<div class="al2 w" style="margin-bottom:8px">Salvato prima come testo: <b>${esc(String(valore))}</b>. Resta così finché non aggiungi le righe.</div>` : ''}
    <div id="cp-pareti-righe">${htmlRighePareteCartongesso(lista)}</div>
    <button type="button" class="btn sm" id="msm-aggiungi-parete" style="margin-top:8px" onclick="aggiungiPareteCartongesso()">+ Aggiungi parete</button>`;
}

// undefined = resta il valore di prima
function leggiElencoMotore(c) {
  if (!elencoPareteMotore(c) || !ge('cp-pareti-righe') || !ge('msm-aggiungi-parete')) return undefined;
  const righe = leggiPareteCartongesso();
  const prima = (MOTORE_SCHEDE.datiBase || {})[c.codice];
  if (righe === null && !Array.isArray(prima) && !vuotoMotore(prima)) return undefined; // testo di prima, nessuna riga
  return righe;
}

// ── F15.8 — BLOCCO COMUNE E CONTROLLI DI INVIO (sql/82) ─────────────────
// Blocco comune: scheda della lavorazione 'comune' (riquadro "📋 Blocco
// comune" in cima al tab Rilievi tecnici, htmlRiquadroBloccoComune): le 6
// domande del primo contatto, tutte facoltative (D2). Alla nascita della
// commessa referente, telefono, accessi e orari vanno nella scheda cantiere
// (trigger di sql/82).
// Controlli di invio (D2: SOLO i campi "serve al prezzo" del catalogo, anche
// nelle posizioni P-xx): vuoto, "non noto" nella richiesta definitiva, oppure
// "da verificare", "da definire", "?", "xx" (nei menu anche il valore scelto)
// = il progetto non si invia. Con sql/82 l'elenco lo dà la RPC
// controlli_invio_progetto (e il database ferma l'invio anche da console);
// senza, lo calcola il sito con le stesse regole.

// Testo che non basta per il preventivo: restituisce quello trovato, '' = va bene
// (gemella di testo_vietato_rilievo di sql/82)
function testoVietatoRilievo(testo) {
  if (testo === null || testo === undefined) return '';
  const t = String(testo).replace(/_/g, ' ').toLowerCase();
  if (/(^|[^a-z0-9])da\s+verificare([^a-z0-9]|$)/.test(t)) return 'da verificare';
  if (/(^|[^a-z0-9])da\s+definire([^a-z0-9]|$)/.test(t)) return 'da definire';
  if (String(testo).indexOf('?') >= 0) return '?';
  if (/(^|[^a-z0-9])xx+([^a-z0-9]|$)/.test(t)) return 'xx';
  return '';
}

// Problema di un valore di un campo "serve al prezzo", '' = va bene
// (gemella di problema_valore_invio di sql/82)
function problemaValoreInvio(valore, c, indicativa) {
  if (vuotoMotore(valore) || (Array.isArray(valore) && !valore.length)) return 'manca (serve per calcolare il preventivo)';
  if (valore === VALORE_NON_NOTO) {
    return indicativa ? '' : 'è «non noto»: nella richiesta definitiva va compilato (o la richiesta diventa indicativa)';
  }
  if (typeof valore !== 'string' && typeof valore !== 'number') return '';
  const testo = String(valore);
  if (c && c.tipo === 'menu') {
    const o = (c.valori_ammessi || []).find(function(x) { return String(x.valore) === testo; });
    const etichetta = o ? String(o.etichetta || o.valore) : '';
    if (testoVietatoRilievo(testo) || testoVietatoRilievo(etichetta)) {
      return '«' + (etichetta || testo) + '» non basta per il preventivo: scegli il valore preciso';
    }
    return '';
  }
  const vietato = testoVietatoRilievo(testo);
  return vietato ? 'c’è «' + vietato + '»: scrivi il dato preciso' : '';
}

const CONTROLLI_INVIO = { rpc: null };

// Elenco calcolato dal sito (senza sql/82): stesse righe della RPC
async function controlliInvioProgettoSito(progettoId) {
  if (typeof caricaCatalogoLavorazioni === 'function') {
    try { await caricaCatalogoLavorazioni(); } catch (e) { return []; }
  }
  if (typeof CATALOGO_LAV === 'undefined' || !CATALOGO_LAV.disponibili) return [];
  const { data: schede, error } = await db.from('progetti_tecnici_schede')
    .select('id,famiglia,numero,dati').eq('progetto_tecnico_id', progettoId).order('famiglia').order('numero');
  if (error) return [];
  let posizioni = [];
  const pos = await db.from('progetti_tecnici_posizioni')
    .select('scheda_id,codice,numero,quantita,dati,tolta').eq('progetto_tecnico_id', progettoId).order('numero');
  if (!pos.error) posizioni = (pos.data || []).filter(function(p) { return !p.tolta; });

  const righe = [];
  const campiPrezzo = function(lav) {
    return ((lav && lav.lavorazioni_campi) || []).filter(function(c) {
      return c.attivo !== false && serveAlPrezzoMotore(c) && c.tipo !== 'foto';
    }).sort(function(a, b) { return (a.ordine || 0) - (b.ordine || 0); });
  };
  const comune = lavorazioneCatalogo(FAMIGLIA_COMUNE);
  if (comune && comune.attiva && !(schede || []).some(function(s) { return s.famiglia === FAMIGLIA_COMUNE; })) {
    campiPrezzo(comune).forEach(function(c) {
      righe.push({ scheda_id: null, scheda: 'Blocco comune', campo: c.codice, etichetta: c.etichetta, motivo: 'manca: compila il blocco comune' });
    });
  }
  (schede || []).forEach(function(s) {
    const lav = lavorazioneCatalogo(s.famiglia);
    if (!lav) return;
    const stesse = schede.filter(function(x) { return x.famiglia === s.famiglia; }).length;
    const nome = (lav.nome || s.famiglia) + (stesse > 1 || Number(s.numero) > 1 ? ' – scheda ' + s.numero : '');
    const dati = s.dati || {};
    const indicativa = dati.tipo_richiesta === 'indicativa';
    const suePos = posizioni.filter(function(p) { return p.scheda_id === s.id; });
    const valorePos = function(p, codice) { return codice === 'quantita' ? p.quantita : (p.dati || {})[codice]; };
    campiPrezzo(lav).forEach(function(c) {
      if (c.per_posizione) {
        suePos.forEach(function(p) {
          const m = problemaValoreInvio(valorePos(p, c.codice), c, indicativa);
          if (m) righe.push({ scheda_id: s.id, scheda: nome + ' – ' + p.codice, campo: c.codice, etichetta: c.etichetta, motivo: m });
        });
        return;
      }
      const val = dati[c.codice];
      let m = problemaValoreInvio(val, c, indicativa);
      // vuoto nella scheda ma compilato in tutte le posizioni attive: va bene
      if (m && suePos.length && (vuotoMotore(val) || (Array.isArray(val) && !val.length)) &&
          suePos.every(function(p) { return !problemaValoreInvio(valorePos(p, c.codice), c, indicativa); })) m = '';
      if (m) righe.push({ scheda_id: s.id, scheda: nome, campo: c.codice, etichetta: c.etichetta, motivo: m });
    });
  });
  return righe;
}

// Cosa ferma l'invio: RPC di sql/82 se c'è, altrimenti il calcolo del sito
async function controlliInvioProgetto(progettoId) {
  if (CONTROLLI_INVIO.rpc !== false) {
    const { data, error } = await db.rpc('controlli_invio_progetto', { p_progetto: progettoId });
    if (!error) { CONTROLLI_INVIO.rpc = true; return data || []; }
    if (error.code === 'PGRST202' || error.code === '42883' || /Could not find|does not exist/i.test(error.message || '')) {
      CONTROLLI_INVIO.rpc = false;
    } else {
      return []; // errore passeggero: il database lo ricontrolla comunque all'invio
    }
  }
  return controlliInvioProgettoSito(progettoId);
}

// Prima di inviare il progetto (js/17). true = si può inviare.
// sql/261: il rappresentante (anche "Entra come") non viene fermato.
async function controllaDatiPrimaDellInvio(progettoId) {
  if (ROLE === 'rappresentante') return true;
  let righe = [];
  try { righe = await controlliInvioProgetto(progettoId); } catch (e) { return true; }
  if (!righe || !righe.length) return true;
  const elenco = righe.slice(0, 10).map(function(r) {
    return '- ' + (r.scheda ? r.scheda + ' – ' : '') + r.etichetta + ': ' + r.motivo;
  });
  alert('Il progetto non si può ancora inviare: mancano o sono da precisare dati che servono a calcolare il preventivo.\n\n' +
    elenco.join('\n') + (righe.length > 10 ? '\n- … e altri ' + (righe.length - 10) : '') +
    '\n\nCompletali nella scheda (📝 Rilievi tecnici → 📝 Compila la scheda). ' +
    '"Da verificare", "da definire", "?" e "xx" non bastano: scrivi il dato preciso. ' +
    'Se il cliente non lo sa, la richiesta diventa Indicativa e il dato ❓ Non noto. I dati facoltativi non fermano l’invio.');
  return false;
}

// ── F15.9 — FOTO E VIDEO (sql/82-foto-video) ───────────────────────────
// 1. IMPRONTA: ogni file nuovo del progetto (finestra del progetto e verifica
//    tecnica di js/17, foto delle posizioni di js/66, fonti dei dati, foto e
//    video della scheda) porta l'impronta SHA-256 del file ORIGINALE
//    (crypto.subtle, nel browser) in progetti_tecnici_allegati.impronta: lo
//    stesso file non entra due volte nello stesso progetto ("la stessa foto non
//    vale per due posizioni"; il database lo rifiuta anche da console).
// 2. VIDEO mp4 e mov fino a 50 MB (foto e documenti 10 MB; le foto oltre
//    1,2 MB si rimpiccioliscono come nel giornale di cantiere, js/35
//    ridimensionaFotoGiornale), consiglio "registra in 720p, massimo 2 minuti".
//    I video si caricano solo dopo 82-foto-video-VINCOLO.sql.
// 3. FOTO E VIDEO RICHIESTI dal catalogo (lavorazioni_documenti) nella scheda
//    del motore, riquadro "📷 Foto e video": per ogni riga i file caricati
//    (dati.foto_video.<id riga> = { allegati, mancanza }) oppure "🚫 Non
//    fotografabile" / "🚫 Video impossibile" con il motivo dalla lista. Si
//    salvano con la scheda (💾 Salva scheda), i file vanno subito tra i file
//    del progetto. Con le misure dichiarate dal cliente non sono obbligatori.
// 4. INVIO: controllaFotoVideoPrimaDellInvio (RPC foto_video_mancanti_progetto)
//    dagli invii di js/17; il database ferma comunque l'invio.
// Senza sql/82-foto-video (RPC foto_video_attivi) tutto come prima: niente
// impronta, niente video, niente riquadro, nessun errore.
const FOTO_VIDEO = { disponibile: null, video: false };
const LIMITE_FILE_PROGETTO = 10 * 1024 * 1024;
const LIMITE_VIDEO_PROGETTO = 50 * 1024 * 1024;
const TIPI_VIDEO_PROGETTO = ['video/mp4', 'video/quicktime'];
const ACCEPT_VIDEO_PROGETTO = '.mp4,.mov,video/mp4,video/quicktime';
const TESTO_CONSIGLIO_VIDEO = 'Registra in 720p, massimo 2 minuti (mp4 o mov, fino a 50 MB).';

// Gemella di motivo_foto_mancante di sql/82-foto-video
const MOTIVI_FOTO_MANCANTI = [
  { valore: 'cliente_non_autorizza', etichetta: 'Il cliente non autorizza foto o video' },
  { valore: 'area_riservata', etichetta: 'Area riservata (privacy, sanitaria, produzione, sicurezza)' },
  { valore: 'non_raggiungibile', etichetta: 'Punto non raggiungibile in sicurezza' },
  { valore: 'opera_da_realizzare', etichetta: 'Opera ancora da realizzare (c’è solo il progetto)' },
  { valore: 'rilievo_da_documenti', etichetta: 'Nessun sopralluogo: rilievo dai documenti del cliente' },
  { valore: 'altro', etichetta: 'Altro (scritto nella nota)' }
];

async function verificaFotoVideoDisponibile() {
  if (FOTO_VIDEO.disponibile !== null) return FOTO_VIDEO.disponibile;
  if (typeof db === 'undefined' || !db) return false;
  const { data, error } = await db.rpc('foto_video_attivi');
  if (!error) {
    FOTO_VIDEO.disponibile = true;
    FOTO_VIDEO.video = data === true;
  } else if (error.code === 'PGRST202' || error.code === '42883' || /Could not find|does not exist/i.test(error.message || '')) {
    FOTO_VIDEO.disponibile = false;
  } else {
    return false; // errore passeggero: si riprova la prossima volta
  }
  return FOTO_VIDEO.disponibile;
}

function fotoVideoAttivi() { return FOTO_VIDEO.disponibile === true; }
function videoProgettoAmmesso() { return FOTO_VIDEO.disponibile === true && FOTO_VIDEO.video === true; }

function estensioneFile(file) {
  return String((file && file.name) || '').split('.').pop().toLowerCase();
}

function fileVideoProgetto(file) {
  if (!file) return false;
  return TIPI_VIDEO_PROGETTO.includes(file.type) || ['mp4', 'mov'].includes(estensioneFile(file));
}

// Tipo da salvare (e da dare allo storage): DWG e video senza tipo dal telefono
function tipoFileProgetto(file) {
  const est = estensioneFile(file);
  if (est === 'dwg') return 'application/acad';
  if (file.type === 'video/mp4' || (!file.type && est === 'mp4')) return 'video/mp4';
  if (file.type === 'video/quicktime' || (!file.type && est === 'mov')) return 'video/quicktime';
  return file.type || 'application/octet-stream';
}

function limiteFileProgetto(file) {
  return fileVideoProgetto(file) && videoProgettoAmmesso() ? LIMITE_VIDEO_PROGETTO : LIMITE_FILE_PROGETTO;
}

// SHA-256 esadecimale del file (null se il browser non lo sa fare)
async function improntaFileProgetto(file) {
  try {
    if (!window.crypto || !window.crypto.subtle || !file || typeof file.arrayBuffer !== 'function') return null;
    const buf = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  } catch (e) {
    return null;
  }
}

// File pronto da caricare: foto rimpicciolita, tipo, impronta dell'originale
async function preparaFileProgetto(originale) {
  if (fileVideoProgetto(originale) && !videoProgettoAmmesso()) {
    return { errore: originale.name + ': i video si caricano dopo l’aggiornamento del database' };
  }
  if (fileVideoProgetto(originale) && originale.size > LIMITE_VIDEO_PROGETTO) {
    return { errore: originale.name + ': oltre 50 MB. ' + TESTO_CONSIGLIO_VIDEO };
  }
  const impronta = fotoVideoAttivi() ? await improntaFileProgetto(originale) : null;
  if (fotoVideoAttivi() && !impronta) {
    return { errore: 'Questo browser non calcola l’impronta del file (controllo delle foto doppie): aggiorna il browser o usa Chrome/Safari' };
  }
  const file = /^image\//.test(originale.type || '') && typeof ridimensionaFotoGiornale === 'function'
    ? await ridimensionaFotoGiornale(originale) : originale;
  if (file.size > limiteFileProgetto(file)) {
    return { errore: originale.name + ': oltre ' + Math.round(limiteFileProgetto(file) / 1048576) + ' MB' };
  }
  return { file: file, impronta: impronta, tipo: tipoFileProgetto(file) };
}

function campiImprontaAllegato(impronta) {
  return impronta && fotoVideoAttivi() ? { impronta: impronta } : {};
}

async function fileGiaNelProgetto(progettoId, impronta) {
  if (!impronta || !fotoVideoAttivi()) return null;
  const { data } = await db.from('progetti_tecnici_allegati')
    .select('id,nome_file,storage_path,mime_type,caricato_il')
    .eq('progetto_id', progettoId).eq('impronta', impronta).limit(1);
  return data && data[0] ? data[0] : null;
}

function testoErroreFileProgetto(error) {
  if (!error) return '';
  if (error.code === '23505' && /impronta/i.test(error.message || '')) {
    return 'questo file è già tra i file del progetto: la stessa foto non vale per due posizioni';
  }
  return error.message || String(error);
}

// Carica un file tra i file del progetto (bucket progetti-tecnici + riga in
// progetti_tecnici_allegati). opz: { cartella, prefisso }.
// Restituisce { alleg } oppure { errore, doppione: riga già presente }.
async function caricaFileNelProgetto(progettoId, uid, originale, opz) {
  opz = opz || {};
  await verificaFotoVideoDisponibile();
  const prep = await preparaFileProgetto(originale);
  if (prep.errore) return { errore: prep.errore };
  const gia = await fileGiaNelProgetto(progettoId, prep.impronta);
  if (gia) {
    return {
      doppione: gia,
      errore: '«' + originale.name + '» è già tra i file del progetto' +
        (gia.nome_file !== originale.name ? ' (come «' + gia.nome_file + '»)' : '') + ': la stessa foto non vale per due posizioni'
    };
  }
  const nome = (opz.prefisso || '') + String(prep.file.name || originale.name || 'file');
  const path = uid + '/' + progettoId + '/' + (opz.cartella ? opz.cartella + '/' : '') + Date.now() + '_' +
    nome.replace(/[^a-zA-Z0-9._-]/g, '_');
  const up = await db.storage.from('progetti-tecnici').upload(path, prep.file, { contentType: prep.tipo, upsert: false });
  if (up.error) return { errore: originale.name + ': caricamento non riuscito: ' + up.error.message };
  const riga = Object.assign({
    progetto_id: progettoId, nome_file: nome, storage_path: path,
    mime_type: prep.tipo, dimensione: prep.file.size, caricato_da: opz.caricatoDa || uid // caricatoDa: persona di "Entra come" (js/17)
  }, campiImprontaAllegato(prep.impronta));
  const { data, error } = await db.from('progetti_tecnici_allegati').insert(riga)
    .select('id,nome_file,storage_path,mime_type,caricato_il').single();
  if (error || !data) {
    await db.storage.from('progetti-tecnici').remove([path]);
    return { errore: originale.name + ': non salvato tra i file del progetto: ' + testoErroreFileProgetto(error) };
  }
  return { alleg: data };
}

// Finestre del progetto e della verifica tecnica (js/17): video ammessi e nota
function preparaInputVideoProgetto() {
  verificaFotoVideoDisponibile().then(function() {
    const video = videoProgettoAmmesso();
    ['mp-file', 'mp-file-extra', 'mvt-file'].forEach(function(id) {
      const el = ge(id);
      if (!el) return;
      if (!el.dataset.acceptBase) el.dataset.acceptBase = el.getAttribute('accept') || '';
      el.setAttribute('accept', el.dataset.acceptBase + (video ? ',' + ACCEPT_VIDEO_PROGETTO : ''));
    });
    document.querySelectorAll('.fv-video-nota').forEach(function(el) { el.style.display = video ? '' : 'none'; });
  }).catch(function() {});
}

// ── Riquadro "📷 Foto e video" nella scheda del motore ──────────────────
function documentiFotoVideoMotore(lav) {
  if (!fotoVideoAttivi() || !lav || lav.codice === FAMIGLIA_COMUNE) return [];
  return (lav.lavorazioni_documenti || []).filter(function(d) {
    return d.attivo !== false && (d.tipo !== 'video' || videoProgettoAmmesso());
  }).sort(function(a, b) { return (a.ordine || 0) - (b.ordine || 0) || a.id - b.id; });
}

function iniziaFotoVideoMotore(dati) {
  const f = dati && dati.foto_video && typeof dati.foto_video === 'object' && !Array.isArray(dati.foto_video) ? dati.foto_video : {};
  MOTORE_SCHEDE.fotoVideo = JSON.parse(JSON.stringify(f));
}

function scriviFotoVideoNeiDatiMotore(dati) {
  if (!fotoVideoAttivi() || !MOTORE_SCHEDE.fotoVideo) return;
  const out = {};
  Object.keys(MOTORE_SCHEDE.fotoVideo).forEach(function(k) {
    const e = MOTORE_SCHEDE.fotoVideo[k];
    if (!e) return;
    const allegati = Array.isArray(e.allegati) ? e.allegati : [];
    if (!allegati.length && !(e.mancanza && e.mancanza.motivo)) return;
    out[k] = e;
  });
  if (Object.keys(out).length || (MOTORE_SCHEDE.datiBase && MOTORE_SCHEDE.datiBase.foto_video)) dati.foto_video = out;
}

function voceFotoVideoMotore(id) {
  if (!MOTORE_SCHEDE.fotoVideo) MOTORE_SCHEDE.fotoVideo = {};
  const k = String(id);
  if (!MOTORE_SCHEDE.fotoVideo[k]) MOTORE_SCHEDE.fotoVideo[k] = { allegati: [] };
  if (!Array.isArray(MOTORE_SCHEDE.fotoVideo[k].allegati)) MOTORE_SCHEDE.fotoVideo[k].allegati = [];
  return MOTORE_SCHEDE.fotoVideo[k];
}

function mimeAdattoDocumento(mime, tipo) {
  if (tipo === 'foto') return /^image\//.test(mime || '');
  if (tipo === 'video') return /^video\//.test(mime || '');
  return true;
}

function mimeFileFotoVideo(a) {
  if (a && a.mime) return a.mime;
  const x = (FONTI_DATI.allegati || []).find(function(y) { return a && y.id === a.allegato_id; });
  return x ? x.mime_type : '';
}

function quantiFotoVideoMotore(d) {
  const e = (MOTORE_SCHEDE.fotoVideo || {})[String(d.id)];
  return ((e && e.allegati) || []).filter(function(a) { return mimeAdattoDocumento(mimeFileFotoVideo(a), d.tipo); }).length;
}

function parolaDocumento(tipo, n) {
  if (tipo === 'video') return 'video';
  if (tipo === 'foto') return 'foto';
  return n === 1 ? 'documento' : 'documenti';
}

// Righe obbligatorie (non per posizione) ancora scoperte: per l'avviso dopo il salvataggio
function fotoVideoMancantiMotore(lav) {
  if (!fotoVideoAttivi() || !fotoObbligatorieProgetto(MOTORE_SCHEDE.progetto)) return [];
  return documentiFotoVideoMotore(lav).filter(function(d) {
    if (!d.obbligatorio || d.per_posizione) return false;
    const e = (MOTORE_SCHEDE.fotoVideo || {})[String(d.id)];
    if (e && e.mancanza && e.mancanza.motivo) return false;
    return quantiFotoVideoMotore(d) < (d.quanti || 1);
  });
}

function htmlFotoVideoMotore(lav) {
  const docs = documentiFotoVideoMotore(lav);
  if (!docs.length) return '';
  const dichiarate = !fotoObbligatorieProgetto(MOTORE_SCHEDE.progetto);
  return `<div class="rap-section">📷 Foto e video</div>
    <div style="font-size:12px;color:var(--m);margin-bottom:6px">
      ${dichiarate
        ? 'Misure dichiarate dal cliente: foto e video non sono obbligatori (caricali se li hai).'
        : 'Richiesti dal catalogo per questa lavorazione: senza (o senza il motivo) il progetto non si invia. La stessa foto non vale per due voci o due posizioni.'}
    </div>
    <div id="msm-foto-video">${docs.map(function(d) {
      return '<div class="card" id="msm-fv-' + d.id + '" style="margin-bottom:8px">' + htmlVoceFotoVideoMotore(d) + '</div>';
    }).join('')}</div>`;
}

function htmlVoceFotoVideoMotore(d) {
  const e = (MOTORE_SCHEDE.fotoVideo || {})[String(d.id)] || {};
  const allegati = Array.isArray(e.allegati) ? e.allegati : [];
  const m = e.mancanza || null;
  const quanti = quantiFotoVideoMotore(d);
  const serve = d.quanti || 1;
  const icona = d.tipo === 'video' ? '🎥' : (d.tipo === 'foto' ? '📷' : '📄');
  const obbligo = d.obbligatorio && fotoObbligatorieProgetto(MOTORE_SCHEDE.progetto);
  let stato;
  if (d.per_posizione) {
    stato = '<div style="font-size:12px;color:var(--m)">' + serve + ' ' + parolaDocumento(d.tipo, serve) +
      ' per ogni posizione P-xx: si caricano nella posizione (📍 Posizioni → ✏️ Modifica → 📷 Aggiungi foto).</div>';
  } else if (m && m.motivo) {
    stato = '<div style="font-size:12px;color:var(--g)">✓ ' + (d.tipo === 'video' ? 'Video impossibile' : 'Non fotografabile') + ': motivo indicato</div>';
  } else if (quanti >= serve) {
    stato = '<div style="font-size:12px;color:var(--g)">✓ ' + quanti + ' di ' + serve + '</div>';
  } else {
    stato = '<div style="font-size:12px;color:' + (obbligo ? 'var(--r)' : 'var(--m)') + '">' + (obbligo ? '⚠️ ' : '') +
      quanti + ' di ' + serve + (obbligo ? ': ne mancano ' + (serve - quanti) + ' (o indica il motivo sotto)' : ' (facoltativo)') + '</div>';
  }
  const accept = d.tipo === 'video' ? ACCEPT_VIDEO_PROGETTO : (d.tipo === 'foto' ? 'image/*' : '.pdf,.jpg,.jpeg,.png,application/pdf,image/*');
  const file = allegati.map(function(a, i) {
    return `<div style="display:flex;gap:6px;align-items:center;margin-top:4px;font-size:12px">
      <span style="flex:1 1 auto;min-width:0;overflow-wrap:anywhere">${/^video\//.test(mimeFileFotoVideo(a)) ? '🎥' : (/^image\//.test(mimeFileFotoVideo(a)) ? '🖼️' : '📎')} ${esc(a.nome || 'file')}</span>
      <button type="button" class="btn sm" onclick="apriFileFotoVideoMotore(${d.id}, ${i})">👁 Apri</button>
      <button type="button" class="btn sm" onclick="togliFileFotoVideoMotore(${d.id}, ${i})" title="Il file resta tra i file del progetto">✖</button>
    </div>`;
  }).join('');
  const caricamento = d.per_posizione ? '' : `
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
      <label class="btn sm" style="margin:0;cursor:pointer">${d.tipo === 'video' ? '🎥 Registra o scegli il video' : (d.tipo === 'foto' ? '📷 Scatta o scegli le foto' : '📎 Carica')}
        <input type="file" style="display:none" accept="${accept}"${d.tipo === 'documento' ? '' : ' capture="environment"'}${d.tipo === 'video' ? '' : ' multiple'}
          onchange="caricaFotoVideoMotore(${d.id}, this)">
      </label>
      ${d.tipo === 'video' ? '<span style="font-size:11px;color:var(--m)">' + esc(TESTO_CONSIGLIO_VIDEO) + '</span>' : ''}
    </div>`;
  const chi = m && m.motivo && m.da_nome
    ? '<div style="font-size:11px;color:var(--m);margin-top:3px">Segnato da ' + esc(m.da_nome) + (m.il ? ' il ' + esc(new Date(m.il).toLocaleDateString('it-IT')) : '') + '</div>'
    : '';
  return `<div style="font-weight:600;font-size:13px">${icona} ${esc(d.descrizione)}${d.obbligatorio ? '' : ' <span style="font-weight:400;color:var(--m)">(facoltativo)</span>'}</div>
    ${stato}
    ${file}
    ${caricamento}
    <div class="f" style="margin:8px 0 0">
      <label for="msm-fvm-${d.id}" style="font-size:12px">🚫 ${d.tipo === 'video' ? 'Video impossibile' : (d.tipo === 'foto' ? 'Non fotografabile' : 'Documento non disponibile')}: motivo</label>
      <select id="msm-fvm-${d.id}" onchange="cambiaMancanzaFotoVideoMotore(${d.id}, true)">
        <option value="">— Nessuno (${d.tipo === 'video' ? 'il video c’è' : (d.tipo === 'foto' ? 'le foto ci sono' : 'il documento c’è')}) —</option>
        ${MOTIVI_FOTO_MANCANTI.map(function(x) { return '<option value="' + x.valore + '"' + (m && m.motivo === x.valore ? ' selected' : '') + '>' + esc(x.etichetta) + '</option>'; }).join('')}
      </select>
      <textarea id="msm-fvn-${d.id}" rows="1" maxlength="500" placeholder="Nota (obbligatoria con «Altro»)" style="margin-top:4px${m && m.motivo ? '' : ';display:none'}"
        oninput="cambiaMancanzaFotoVideoMotore(${d.id}, false)">${esc((m && m.nota) || '')}</textarea>
      ${chi}
    </div>`;
}

function ridisegnaVoceFotoVideoMotore(id) {
  const box = ge('msm-fv-' + id);
  const lav = lavorazioneCatalogo(MOTORE_SCHEDE.famiglia);
  const d = documentiFotoVideoMotore(lav).find(function(x) { return String(x.id) === String(id); });
  if (box && d) box.innerHTML = htmlVoceFotoVideoMotore(d);
}

function cambiaMancanzaFotoVideoMotore(id, ridisegna) {
  const e = voceFotoVideoMotore(id);
  const motivo = v('msm-fvm-' + id);
  const nota = String(v('msm-fvn-' + id) || '').trim();
  const prima = ((MOTORE_SCHEDE.datiBase || {}).foto_video || {})[String(id)];
  const mPrima = prima && prima.mancanza;
  if (!motivo) delete e.mancanza;
  else if (mPrima && mPrima.motivo === motivo && String(mPrima.nota || '').trim() === nota) e.mancanza = mPrima; // com'era: chi e quando restano
  else e.mancanza = { motivo: motivo, nota: nota || null };
  if (typeof segnaSchedaRilievoModificata === 'function') segnaSchedaRilievoModificata();
  if (ridisegna) {
    ridisegnaVoceFotoVideoMotore(id);
    const t = ge('msm-fvn-' + id);
    if (t && motivo === 'altro') t.focus();
  }
}

function fileGiaInSchedaMotore(allegatoId) {
  const fv = MOTORE_SCHEDE.fotoVideo || {};
  return Object.keys(fv).some(function(k) {
    return ((fv[k] && fv[k].allegati) || []).some(function(a) { return a.allegato_id === allegatoId; });
  });
}

async function caricaFotoVideoMotore(id, input) {
  const files = Array.from((input && input.files) || []);
  if (input) input.value = '';
  const progettoId = currentRilievoProgettoId;
  if (!files.length || !progettoId) return;
  const lav = lavorazioneCatalogo(MOTORE_SCHEDE.famiglia);
  const d = documentiFotoVideoMotore(lav).find(function(x) { return String(x.id) === String(id); });
  if (!d) return;
  const { data: auth } = await db.auth.getUser();
  const uid = auth && auth.user && auth.user.id;
  if (!uid) { toast('Sessione scaduta: rientra e riprova', 'err'); return; }
  const e = voceFotoVideoMotore(id);
  let aggiunti = 0;
  for (const f of files) {
    const giusto = d.tipo === 'video' ? fileVideoProgetto(f) : (d.tipo === 'foto' ? /^image\//.test(f.type || '') : true);
    if (!giusto) { toast(f.name + ': qui serve ' + (d.tipo === 'video' ? 'un video (mp4 o mov)' : 'una foto'), 'err'); continue; }
    toast('Caricamento di ' + f.name + '…', 'info');
    const r = await caricaFileNelProgetto(progettoId, uid, f, { cartella: 'foto_video' });
    let alleg = r.alleg;
    if (!alleg && r.doppione) {
      if (fileGiaInSchedaMotore(r.doppione.id)) {
        toast('«' + r.doppione.nome_file + '» è già in questa scheda: la stessa foto non vale per due voci', 'err');
        continue;
      }
      if (!confirm(r.errore + '.\n\nUsare il file già caricato per «' + d.descrizione + '»?\n(Se è già in un’altra scheda o in una posizione P-xx il salvataggio lo rifiuta.)')) continue;
      alleg = r.doppione;
    }
    if (!alleg) { toast(r.errore, 'err'); continue; }
    if (!FONTI_DATI.allegati.some(function(x) { return x.id === alleg.id; })) FONTI_DATI.allegati.unshift(alleg);
    e.allegati.push({ allegato_id: alleg.id, nome: alleg.nome_file, percorso: alleg.storage_path, mime: alleg.mime_type });
    aggiunti++;
  }
  if (aggiunti) {
    if (typeof segnaSchedaRilievoModificata === 'function') segnaSchedaRilievoModificata();
    ridisegnaVoceFotoVideoMotore(id);
    toast((aggiunti === 1 ? 'File caricato' : aggiunti + ' file caricati') + ': ricordati di salvare la scheda', 'ok');
  }
}

function togliFileFotoVideoMotore(id, i) {
  const e = voceFotoVideoMotore(id);
  if (!e.allegati[i] || !confirm('Togliere «' + (e.allegati[i].nome || 'file') + '» da questa voce? Il file resta tra i file del progetto.')) return;
  e.allegati.splice(i, 1);
  if (typeof segnaSchedaRilievoModificata === 'function') segnaSchedaRilievoModificata();
  ridisegnaVoceFotoVideoMotore(id);
}

async function apriFileFotoVideoMotore(id, i) {
  const a = (voceFotoVideoMotore(id).allegati || [])[i];
  const x = a && (FONTI_DATI.allegati || []).find(function(y) { return y.id === a.allegato_id; });
  const percorso = (x && x.storage_path) || (a && a.percorso);
  if (!percorso) { toast('File non trovato', 'err'); return; }
  const { data, error } = await firmaFile('progetti-tecnici', percorso, 600);
  if (error || !data || !data.signedUrl) { toast('File non disponibile' + (error ? ': ' + error.message : ''), 'err'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

// Prima del salvataggio della scheda: "Altro" senza nota (il database lo rifiuta)
function problemaFotoVideoMotore() {
  const fv = MOTORE_SCHEDE.fotoVideo || {};
  const k = Object.keys(fv).find(function(x) {
    const m = fv[x] && fv[x].mancanza;
    return m && m.motivo === 'altro' && String(m.nota || '').trim().length < 3;
  });
  return k ? 'Foto e video: con «Altro» scrivi il motivo nella nota' : '';
}

// Prima di inviare il progetto (js/17). true = si può inviare.
async function controllaFotoVideoPrimaDellInvio(progettoId) {
  if (ROLE === 'rappresentante') return true; // sql/261: il rappresentante non viene fermato
  if (!(await verificaFotoVideoDisponibile())) return true;
  const { data, error } = await db.rpc('foto_video_mancanti_progetto', { p_progetto: progettoId });
  if (error || !data || !data.length) return true; // il database lo ricontrolla comunque all'invio
  const righe = data.slice(0, 8).map(function(r) {
    return '- ' + (r.scheda ? r.scheda + ' – ' : '') + r.etichetta + ': ' + r.motivo;
  });
  alert('Il progetto non si può ancora inviare: mancano foto o video.\n\n' + righe.join('\n') +
    (data.length > 8 ? '\n- … e altri ' + (data.length - 8) : '') +
    '\n\nCaricali nella scheda (📝 Rilievi tecnici → 📝 Compila la scheda → 📷 Foto e video) oppure, se non si può, ' +
    'scegli il motivo in «🚫 Non fotografabile» / «🚫 Video impossibile». Video: ' + TESTO_CONSIGLIO_VIDEO);
  return false;
}
