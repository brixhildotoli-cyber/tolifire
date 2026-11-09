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
    return l.attiva && campiSchedaMotore(l).length;
  });
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
  if (!(await verificaMotoreSchedeDisponibile())) return;
  if (typeof caricaCatalogoLavorazioni === 'function') {
    try { await caricaCatalogoLavorazioni(); } catch (e) { return; }
  }
  const lav = lavorazioniMotore();
  if (!lav.length) return;
  const { data: progetto } = await db.from('progetti_tecnici').select('id,stato,rappresentante_id').eq('id', progettoId).maybeSingle();
  if (!progetto || !puoCompilareMotore(progetto)) return;
  if (ge('msm-apri')) return; // disegnato nel frattempo da un'altra chiamata
  const preferita = lav.some(function(l) { return l.codice === 'porte_rei'; }) ? 'porte_rei' : lav[0].codice;
  box.insertAdjacentHTML('afterbegin', `
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
  if (fonti) await caricaAllegatiFontiMotore(progettoId);

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

  box.innerHTML = htmlBarraSchedeRilievo() + `
    <div id="msm-motore" data-famiglia="${esc(famiglia)}">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:12px">
        <div style="min-width:0">
          <div style="font-size:16px;font-weight:700">${ICONE_LAVORAZIONI_MOTORE[famiglia] || '📝'} ${esc(lav.nome)}</div>
          <div style="font-size:12px;color:var(--m);margin-top:3px;overflow-wrap:anywhere">
            ${esc(MOTORE_SCHEDE.cliente.ragione_sociale || '')}${MOTORE_SCHEDE.progetto.titolo ? ' · ' + esc(MOTORE_SCHEDE.progetto.titolo) : ''}
          </div>
        </div>
        <button type="button" class="btn sm" onclick="chiudiSchedaMotore()">← Indietro</button>
      </div>
      <div id="msm-campi" oninput="aggiornaFontiDopoModificaMotore(event)" onchange="aggiornaFontiDopoModificaMotore(event)">${htmlCampiMotore(lav, MOTORE_SCHEDE.datiBase)}</div>
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

  const richiesta = `
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
    <div class="rap-section">Luogo dei lavori e referente</div>
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
    <div class="rap-section">Dati della lavorazione</div>
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

  if (c.tipo === 'menu' || c.tipo === 'si_no') {
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
  return campiSchedaMotore(lav).filter(function(c) {
    const x = dati[c.codice];
    return serveAlPrezzoMotore(c) && (x === null || x === undefined || x === '');
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
    await dopoSalvataggioSchedaRilievo('Scheda ' + lav.nome + ' salvata', salvate);
    if (mancanti.length || senzaFonte.length) {
      setTimeout(function() {
        toast('Salvata.' +
          (mancanti.length ? ' Per il preventivo mancano: ' + mancanti.map(function(c) { return c.etichetta; }).join(', ') + '.' : '') +
          (senzaFonte.length ? ' Senza fonte (il progetto non si invia): ' + senzaFonte.map(function(c) { return c.etichetta; }).join(', ') + '.' : ''), 'warn');
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
  const file = /^image\//.test(originale.type || '') && typeof ridimensionaFotoGiornale === 'function'
    ? await ridimensionaFotoGiornale(originale) : originale;
  if (file.size > 10 * 1024 * 1024) { toast(originale.name + ': oltre 10 MB', 'err'); return; }
  const nome = 'fonte_' + codice + '_' + String(file.name || originale.name || 'file');
  const path = uid + '/' + progettoId + '/fonti/' + Date.now() + '_' + nome.replace(/[^a-zA-Z0-9._-]/g, '_');
  toast('Caricamento…', 'info');
  const up = await db.storage.from('progetti-tecnici').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (up.error) { toast('Caricamento non riuscito: ' + up.error.message, 'err'); return; }
  const { data: alleg, error } = await db.from('progetti_tecnici_allegati').insert({
    progetto_id: progettoId, nome_file: nome, storage_path: path,
    mime_type: file.type || 'application/octet-stream', dimensione: file.size, caricato_da: uid
  }).select('id,nome_file,storage_path,mime_type,caricato_il').single();
  if (error || !alleg) {
    await db.storage.from('progetti-tecnici').remove([path]);
    toast('File non salvato tra i file del progetto: ' + (error ? error.message : ''), 'err');
    return;
  }
  FONTI_DATI.allegati.unshift(alleg);
  const voce = Object.assign({}, (MOTORE_SCHEDE.fonti || {})[codice] || {});
  ['allegato_nome', 'allegato_percorso', 'da', 'da_nome', 'da_ruolo', 'il'].forEach(function(k) { delete voce[k]; });
  voce.allegato_id = alleg.id;
  voce.valore = valoreAttualeCampoMotore(codice);
  toccaFonteMotore(codice, voce);
  toast('File caricato: ricordati di salvare la scheda', 'ok');
}

async function apriFileFonteMotore(codice) {
  const voce = (MOTORE_SCHEDE.fonti || {})[codice];
  if (!voce || !voce.allegato_id) return;
  const a = FONTI_DATI.allegati.find(function(x) { return x.id === voce.allegato_id; });
  const percorso = (a && a.storage_path) || voce.allegato_percorso;
  if (!percorso) { toast('File non trovato', 'err'); return; }
  const { data, error } = await db.storage.from('progetti-tecnici').createSignedUrl(percorso, 600);
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

// Prima di inviare il progetto (js/17): fonte del rilievo e fonti dei dati
// normativi (RPC fonti_mancanti_progetto di sql/79). true = si può inviare.
async function controllaFontiPrimaDellInvio(progettoId) {
  if (!(await verificaFontiDatiDisponibili())) return true;
  const { data, error } = await db.rpc('fonti_mancanti_progetto', { p_progetto: progettoId });
  if (error) return true; // il database lo ricontrolla comunque all'invio
  if (!data || !data.length) return true;
  const righe = data.slice(0, 8).map(function(r) {
    return '- ' + (r.scheda ? r.scheda + ' – ' : '') + r.etichetta + ': ' + r.motivo;
  });
  alert('Il progetto non si può ancora inviare:\n\n' + righe.join('\n') +
    (data.length > 8 ? '\n- … e altri ' + (data.length - 8) : '') +
    '\n\nLa fonte del rilievo si indica in "Modifica" del progetto o in cima alla scheda di rilievo; ' +
    'la fonte dei dati normativi sotto il dato, nella scheda (📝 Rilievi tecnici → 📝 Compila la scheda).');
  return false;
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
  rilevazione_incendi: function(n) { contestoSchedaRilevazione = 'progetto'; return apriSchedaRilevazioneIncendi(n); }
};

// Testi lunghi delle schede di js/18 (area di testo, non una riga)
const CAMPI_TESTO_LUNGO_MOTORE = [
  'note_vano', 'logistica', 'note_tecniche', 'posizionamento', 'supporti', 'registro', 'foto_postazioni',
  'accessori_centrale', 'comandi_terzi', 'interfacce', 'struttura', 'ambienti_gravosi', 'note_posa',
  'collaudo', 'manutenzione', 'note_calcolo'
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
  if (!famiglia || !codice || !famigliaMigrataMotore(famiglia)) return null;
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
  return '';
}

// I bottoni della verifica tecnica aprono il motore per le lavorazioni migrate
[
  ['apriSchedaPorteReiIngegnere', 'porte_rei'],
  ['apriSchedaEstintoriIngegnere', 'estintori'],
  ['apriSchedaRilevazioneIngegnere', 'rilevazione_incendi']
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
    if (/salvaScheda|nuovaSchedaRilievo|eliminaSchedaRilievo/.test(azione)) b.style.display = 'none';
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
