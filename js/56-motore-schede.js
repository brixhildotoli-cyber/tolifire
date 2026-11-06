// ── F15.3 — MOTORE DELLE SCHEDE (1a: disegno e salvataggio, sql/77) ─────
// (stesso numero 56 di js/56-festivita-giorni-lavorativi.js: nome deciso
// dalla task; si carica dopo js/55 e js/66, prima di js/19-init)
//
// Disegna la scheda di rilievo di una lavorazione dal catalogo
// (lavorazioni_campi di sql/75, letto da js/55) invece che dal codice scritto
// a mano, pensata per il telefono (390 px):
// - menu CHIUSI (solo i valori del catalogo; un valore salvato che non è più
//   in elenco resta visibile "non più in elenco"), numeri con la virgola e
//   l'UNITÀ accanto (cm, mm, pz...), Sì / No, testi;
// - "❓ Non noto" esplicito SOLO se la scheda è una RICHIESTA INDICATIVA (il
//   cliente non conosce tutti i dati); nella richiesta definitiva no;
// - campi di LIVELLO INGEGNERE in sola lettura per il rappresentante (qui
//   solo nel sito; la protezione nel database è la parte 1b, F15.4);
// - dati PRECOMPILATI da sede e cliente: luogo dei lavori (sede principale o
//   unica del cliente, se no l'indirizzo del cliente), referente e telefono
//   dall'anagrafica, modificabili;
// - obbligatori (*) SOLO i dati che servono a calcolare il preventivo
//   (decisione di Toli D2): si segnalano, non bloccano il salvataggio (il
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

  const { data: progetto, error } = await db.from('progetti_tecnici')
    .select('id,titolo,stato,rappresentante_id,cliente_id,clienti(ragione_sociale,indirizzo,cap,citta,provincia,referente_nome,referente_telefono)')
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
      <div id="msm-campi">${htmlCampiMotore(lav, MOTORE_SCHEDE.datiBase)}</div>
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
  const obbligatori = campi.filter(function(c) { return c.obbligatorio; }).length;
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
  const etichetta = esc(c.etichetta) + (c.obbligatorio ? ' <b style="color:var(--r)">*</b>' : '') +
    (c.livello === 'ingegnere' ? ' <span title="Campo dell’ingegnere">🎓</span>' : '');
  const dis = solaLettura || nonNoto ? ' disabled' : '';
  const nota = solaLettura
    ? '<div style="font-size:11px;color:var(--m)">Lo compila l’ingegnere: per te è in sola lettura.</div>'
    : (eraNonNoto ? '<div style="font-size:11px;color:#854F0B">Era "non noto": nella richiesta definitiva va compilato.</div>' : '');
  // "Non noto" per i numeri e i testi brevi (non per le note)
  const lungo = c.tipo === 'testo' && (/note|logistica|descrizione|indicazioni/i.test(c.codice) || String(c.etichetta || '').length > 45);
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
      dati[c.codice] = n === null ? '' : (isNaN(n) ? testo : n); // il testo non valido lo ferma il salvataggio
    } else {
      dati[c.codice] = testo;
    }
  });
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
    return c.tipo === 'numero' && typeof x === 'string' && x !== '' && x !== VALORE_NON_NOTO;
  });
}

function obbligatoriMancantiMotore(dati, lav) {
  return campiSchedaMotore(lav).filter(function(c) {
    const x = dati[c.codice];
    return c.obbligatorio && (x === null || x === undefined || x === '');
  });
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
      const m = String(error.message || '');
      toast('Scheda non salvata: ' + (/row-level security|permission denied/i.test(m) || error.code === '42501'
        ? 'il database non lo permette (il rappresentante compila solo i suoi progetti in bozza o da integrare)'
        : m), 'err');
      return;
    }
    const mancanti = obbligatoriMancantiMotore(dati, lav);
    await dopoSalvataggioSchedaRilievo('Scheda ' + lav.nome + ' salvata', salvate);
    if (mancanti.length) {
      setTimeout(function() {
        toast('Salvata. Per il preventivo mancano: ' + mancanti.map(function(c) { return c.etichetta; }).join(', '), 'warn');
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
