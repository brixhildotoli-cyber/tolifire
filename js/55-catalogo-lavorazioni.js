// ── F15.1 — CATALOGO LAVORAZIONI IN TABELLA (sql/75) ──────────────────
// (stesso numero 55 di js/55-storico-esegui-intervento.js: nome del file
// deciso dalla task; i due file non dipendono l'uno dall'altro)
//
// Il catalogo delle lavorazioni (tabelle lavorazioni, lavorazioni_campi,
// lavorazioni_documenti, lavorazioni_checklist; registro lavorazioni_registro)
// sostituisce, un pezzo alla volta, l'elenco fisso di js/18:
// - etichettaFamigliaTecnica (js/18) chiede prima nomeLavorazioneCatalogo
//   (nome dalla tabella), poi l'elenco fisso;
// - selectPreventivo (js/18), cioè i menu delle 7 schede scritte a mano, chiede
//   adattaMenuSchedaCatalogo: se il catalogo ha quel campo come menu attivo,
//   etichetta e valori vengono dalla tabella (il valore già salvato che non è
//   più in elenco resta visibile, "non più in elenco"); altrimenti i valori
//   scritti nel codice. Il campo si riconosce dall'id: prefisso della scheda
//   (PREFISSI_SCHEDE_CATALOGO) + codice del campo con "-" al posto di "_"
//   (es. cp-tipo-intervento = compartimentazione / tipo_intervento).
// - Il catalogo si legge al primo bisogno e prima di aprire ogni scheda di
//   rilievo (leggiSchedaRilievo avvolta qui sotto), se letto da più di 60 s.
// Pagina "📚 Catalogo lavorazioni" (finestra m-catalogo-lavorazioni, id cl-;
// campo nella finestra m-campo-lavorazione, id clc-): dal titolare in
// Impostazioni (riquadro si-catalogo-lav-card, mostraCatalogoLavorazioniImpostazioni
// chiamata da loadImp di js/10), dall'ingegnere con il bottone nella pagina
// Verifiche tecniche. Scrivono titolare (e informatico) e ingegnere, con
// insert/update diretti (RLS di sql/75); ATTIVA/DISATTIVA solo il titolare
// (il database lo rifiuta agli altri, trigger trg_lavorazioni_prima). Niente
// cancellazioni: "Togli" = attivo false. Registro di ogni modifica
// (lavorazioni_registro, lo scrive il database).
// Senza sql/75: il sito resta come prima (elenco fisso, menu di js/18), il
// riquadro dice "non ancora attivo", nessun errore.

const CATALOGO_LAV = { disponibili: null, lavorazioni: [], letto: 0, inCorso: null, aperta: null, registro: [], campo: null };

const PREFISSI_SCHEDE_CATALOGO = {
  pr: 'porte_rei',
  es: 'estintori',
  ri: 'rilevazione_incendi',
  cp: 'compartimentazione',
  vi: 'vernice_intumescente',
  co: 'coppelle',
  is: 'impianti_spegnimento'
};

const DOCUMENTI_FINALI_LAV = [
  { value: '', label: 'Nessuno / da definire' },
  { value: 'corretta_posa', label: 'Dichiarazione di corretta posa in opera' },
  { value: 'dico_37_08', label: 'Dichiarazione di conformità (D.M. 37/08)' },
  { value: 'rapporto', label: 'Rapporto di intervento / manutenzione' },
  { value: 'attestato', label: 'Attestato' },
  { value: 'dop', label: 'DoP (dichiarazione di prestazione)' },
  { value: 'progetto', label: 'Progetto' }
];

const TIPI_CAMPO_LAV = [
  { value: 'numero', label: 'Numero' },
  { value: 'menu', label: 'Menu (scelta da elenco)' },
  { value: 'si_no', label: 'Sì / No' },
  { value: 'testo', label: 'Testo breve' },
  { value: 'foto', label: 'Foto' }
];
// F15.7 (sql/81): righe ripetibili, solo per le pareti in cartongesso della
// compartimentazione (il database non lo ammette per altri campi): il tipo non
// si sceglie e non si cambia dalla pagina.
const TIPO_CAMPO_ELENCO_LAV = { value: 'elenco', label: 'Righe ripetibili (pareti)' };

const AZIONI_REGISTRO_LAV = {
  creata: 'Creata', modificata: 'Modificata', attivata: '✅ Attivata', disattivata: '⏸ Disattivata', tolta: '🗑️ Tolta', rimessa: '↩️ Rimessa'
};

const TABELLE_REGISTRO_LAV = {
  lavorazioni: 'Lavorazione', lavorazioni_campi: 'Campo', lavorazioni_documenti: 'Foto e documenti', lavorazioni_checklist: 'Checklist di posa'
};

function puoModificareCatalogoLav() { return ROLE === 'titolare' || ROLE === 'ingegnere'; }

// ── Lettura del catalogo (per tutti) ────────────────────────────────
async function caricaCatalogoLavorazioni(forza) {
  if (typeof db === 'undefined' || !db) return CATALOGO_LAV.lavorazioni;
  if (!forza && CATALOGO_LAV.disponibili === false) return CATALOGO_LAV.lavorazioni;
  if (!forza && CATALOGO_LAV.letto && Date.now() - CATALOGO_LAV.letto < 60000) return CATALOGO_LAV.lavorazioni;
  if (CATALOGO_LAV.inCorso) return CATALOGO_LAV.inCorso;
  CATALOGO_LAV.inCorso = (async function() {
    try {
      const { data, error } = await db.from('lavorazioni')
        .select('*, lavorazioni_campi(*), lavorazioni_documenti(*), lavorazioni_checklist(*)')
        .order('nome');
      if (error) {
        // Tabella mancante (sql/75 non eseguito) o lettura rifiutata: elenco fisso
        CATALOGO_LAV.disponibili = false;
        CATALOGO_LAV.lavorazioni = [];
      } else {
        CATALOGO_LAV.disponibili = true;
        CATALOGO_LAV.lavorazioni = (data || []).map(ordinaRigheLavorazione);
      }
      CATALOGO_LAV.letto = Date.now();
    } catch (e) {
      CATALOGO_LAV.disponibili = false;
    } finally {
      CATALOGO_LAV.inCorso = null;
    }
    return CATALOGO_LAV.lavorazioni;
  })();
  return CATALOGO_LAV.inCorso;
}

function ordinaRigheLavorazione(l) {
  const perOrdine = function(a, b) { return (a.ordine || 0) - (b.ordine || 0) || Number(a.id) - Number(b.id); };
  l.lavorazioni_campi = (l.lavorazioni_campi || []).slice().sort(perOrdine);
  l.lavorazioni_documenti = (l.lavorazioni_documenti || []).slice().sort(perOrdine);
  l.lavorazioni_checklist = (l.lavorazioni_checklist || []).slice().sort(perOrdine);
  return l;
}

function lavorazioneCatalogo(codice) {
  return (CATALOGO_LAV.lavorazioni || []).find(function(l) { return l.codice === codice; }) || null;
}

// Nome dalla tabella ('' = non c'è: js/18 usa l'elenco fisso)
function nomeLavorazioneCatalogo(codice) {
  if (CATALOGO_LAV.disponibili === null && !CATALOGO_LAV.inCorso && typeof ME !== 'undefined' && ME) {
    caricaCatalogoLavorazioni().catch(function() {});
  }
  const l = lavorazioneCatalogo(codice);
  return l && l.nome ? l.nome : '';
}

// Menu delle schede scritte a mano: etichetta e valori dal catalogo
function adattaMenuSchedaCatalogo(label, id, valore, opzioni) {
  const fisso = { label: label, opzioni: opzioni };
  if (!CATALOGO_LAV.disponibili) return fisso;
  const pezzi = String(id || '').split('-');
  const codiceLav = PREFISSI_SCHEDE_CATALOGO[pezzi[0]];
  if (!codiceLav || pezzi.length < 2) return fisso;
  const lav = lavorazioneCatalogo(codiceLav);
  if (!lav) return fisso;
  const codiceCampo = pezzi.slice(1).join('_');
  const campo = (lav.lavorazioni_campi || []).find(function(c) { return c.codice === codiceCampo; });
  if (!campo || campo.attivo === false || campo.tipo !== 'menu' || !Array.isArray(campo.valori_ammessi) || !campo.valori_ammessi.length) return fisso;
  const segnaposto = (opzioni || []).filter(function(o) { return o.value === ''; });
  const dalCatalogo = campo.valori_ammessi.map(function(x) { return { value: String(x.valore), label: String(x.etichetta || x.valore) }; });
  const elenco = segnaposto.concat(dalCatalogo);
  const scelto = valore === null || valore === undefined ? '' : String(valore);
  if (scelto && !elenco.some(function(o) { return o.value === scelto; })) {
    const vecchia = (opzioni || []).find(function(o) { return o.value === scelto; });
    elenco.push({ value: scelto, label: (vecchia ? vecchia.label : scelto) + ' (non più in elenco)' });
  }
  return { label: esc(campo.etichetta || label), opzioni: elenco };
}

// Prima di aprire una scheda di rilievo il catalogo è fresco (max 60 s)
if (typeof leggiSchedaRilievo === 'function') {
  const leggiSchedaRilievoSenzaCatalogo = leggiSchedaRilievo;
  // eslint-disable-next-line no-global-assign
  leggiSchedaRilievo = async function() {
    try { await caricaCatalogoLavorazioni(); } catch (e) { /* resta l'elenco fisso */ }
    return leggiSchedaRilievoSenzaCatalogo.apply(this, arguments);
  };
}

// ── Riquadro in Impostazioni (titolare) ─────────────────────────────
async function mostraCatalogoLavorazioniImpostazioni() {
  const card = ge('si-catalogo-lav-card');
  if (!card) return;
  if (ROLE !== 'titolare') { card.style.display = 'none'; return; }
  const stato = ge('si-catalogo-lav-stato');
  await caricaCatalogoLavorazioni(true);
  if (!CATALOGO_LAV.disponibili) {
    stato.className = 'al2 i';
    stato.textContent = 'Il catalogo delle lavorazioni non è ancora attivo: serve l’aggiornamento del database (sql/75). Intanto nomi e menu delle schede restano quelli scritti nel gestionale, come oggi.';
    ge('si-catalogo-lav-apri').style.display = 'none';
    return;
  }
  const l = CATALOGO_LAV.lavorazioni;
  const attive = l.filter(function(x) { return x.attiva; }).length;
  const campi = l.reduce(function(s, x) { return s + (x.lavorazioni_campi || []).filter(function(c) { return c.attivo !== false; }).length; }, 0);
  stato.className = '';
  stato.style.cssText = 'font-size:13px;margin-bottom:8px';
  stato.innerHTML = '<b>' + l.length + '</b> lavorazioni (' + attive + ' attive), <b>' + campi + '</b> campi.' +
    (l.some(function(x) { return !x.attiva; }) ? ' Spente: ' + esc(l.filter(function(x) { return !x.attiva; }).map(function(x) { return x.nome; }).join(', ')) + '.' : '');
  ge('si-catalogo-lav-apri').style.display = '';
}

// ── Finestra del catalogo (titolare e ingegnere) ────────────────────
async function apriCatalogoLavorazioni(codice) {
  if (!puoModificareCatalogoLav()) { toast('Il catalogo lo correggono titolare e ingegnere', 'err'); return; }
  await caricaCatalogoLavorazioni(true);
  if (!CATALOGO_LAV.disponibili) {
    toast('Il catalogo delle lavorazioni non è ancora attivo (serve sql/75)', 'err');
    return;
  }
  if (codice !== undefined) CATALOGO_LAV.aperta = codice;
  if (!CATALOGO_LAV.aperta || !lavorazioneCatalogo(CATALOGO_LAV.aperta)) {
    CATALOGO_LAV.aperta = CATALOGO_LAV.lavorazioni.length ? CATALOGO_LAV.lavorazioni[0].codice : '';
  }
  disegnaCatalogoLavorazioni();
  openM('m-catalogo-lavorazioni');
}

function scegliLavorazioneCatalogo() {
  const val = v('cl-scelta');
  if (val === '__nuova') { disegnaNuovaLavorazione(); return; }
  CATALOGO_LAV.aperta = val;
  disegnaCatalogoLavorazioni();
}

function opzioniHtmlLav(elenco, scelto) {
  return elenco.map(function(o) {
    return '<option value="' + esc(o.value) + '"' + (String(scelto || '') === o.value ? ' selected' : '') + '>' + esc(o.label) + '</option>';
  }).join('');
}

function htmlSceltaLavorazione(scelto) {
  return '<div class="f" style="margin:0 0 10px"><label>Lavorazione</label><select id="cl-scelta" onchange="scegliLavorazioneCatalogo()">' +
    CATALOGO_LAV.lavorazioni.map(function(l) {
      return '<option value="' + esc(l.codice) + '"' + (l.codice === scelto ? ' selected' : '') + '>' + esc(l.nome) + (l.attiva ? '' : ' (spenta)') + '</option>';
    }).join('') +
    '<option value="__nuova"' + (scelto === '__nuova' ? ' selected' : '') + '>➕ Nuova lavorazione…</option></select></div>';
}

function disegnaNuovaLavorazione() {
  const box = ge('cl-contenuto');
  box.innerHTML = htmlSceltaLavorazione('__nuova') +
    '<div class="card">' +
      '<div style="font-size:13px;font-weight:600;margin-bottom:6px">➕ Nuova lavorazione</div>' +
      '<div class="fr">' +
        '<div class="f"><label>Nome *</label><input id="cl-n-nome" maxlength="120" placeholder="Es. Sigillature"></div>' +
        '<div class="f"><label>Codice (non si cambia più) *</label><input id="cl-n-codice" maxlength="41" placeholder="Es. sigillature"></div>' +
      '</div>' +
      '<div class="fr">' +
        '<div class="f"><label>Famiglia *</label><input id="cl-n-famiglia" maxlength="41" placeholder="Es. compartimentazione" list="cl-famiglie"></div>' +
        '<div class="f"><label>Documento finale</label><select id="cl-n-documento">' + opzioniHtmlLav(DOCUMENTI_FINALI_LAV, '') + '</select></div>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--m);margin:4px 0 8px">Nasce <b>spenta</b>: ' +
        (ROLE === 'titolare' ? 'la attivi tu quando campi e menu sono pronti.' : 'la attiva il titolare quando campi e menu sono pronti.') + '</div>' +
      '<button class="btn p" type="button" onclick="creaLavorazioneCatalogo()">💾 Crea lavorazione</button>' +
    '</div>' + htmlElencoFamiglie();
  const nome = ge('cl-n-nome');
  nome.addEventListener('input', function() {
    const cod = ge('cl-n-codice');
    if (!cod.dataset.toccato) cod.value = codiceDaTestoLav(nome.value);
  });
  ge('cl-n-codice').addEventListener('input', function() { this.dataset.toccato = '1'; });
}

function htmlElencoFamiglie() {
  const fam = Array.from(new Set(CATALOGO_LAV.lavorazioni.map(function(l) { return l.famiglia; }))).sort();
  return '<datalist id="cl-famiglie">' + fam.map(function(f) { return '<option value="' + esc(f) + '">'; }).join('') + '</datalist>';
}

function codiceDaTestoLav(testo) {
  let s = String(testo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (s && !/^[a-z]/.test(s)) s = 'x_' + s;
  return s.slice(0, 41);
}

function erroreCatalogoLav(error) {
  const m = String((error && error.message) || error || '');
  if (/row-level security|permission denied|42501/i.test(m) || (error && error.code === '42501')) {
    return m.indexOf('Solo il titolare') >= 0 ? m : 'Non hai il permesso per questa modifica: ' + m;
  }
  if (/duplicate key|unique/i.test(m)) return 'Codice già usato: scegline un altro';
  return m;
}

async function creaLavorazioneCatalogo() {
  const nome = v('cl-n-nome').trim();
  const codice = v('cl-n-codice').trim();
  const famiglia = codiceDaTestoLav(v('cl-n-famiglia'));
  if (nome.length < 2) { toast('Scrivi il nome della lavorazione', 'err'); return; }
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(codice)) { toast('Codice: lettere minuscole, numeri e _, comincia con una lettera (es. sigillature)', 'err'); return; }
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(famiglia)) { toast('Scrivi la famiglia (es. compartimentazione)', 'err'); return; }
  if (lavorazioneCatalogo(codice)) { toast('Codice già usato da un’altra lavorazione', 'err'); return; }
  const { error } = await db.from('lavorazioni').insert({
    codice: codice, nome: nome, famiglia: famiglia, documento_finale: v('cl-n-documento') || null, attiva: false
  });
  if (error) { toast('Lavorazione non creata: ' + erroreCatalogoLav(error), 'err'); return; }
  toast('Lavorazione creata (spenta)');
  CATALOGO_LAV.aperta = codice;
  await caricaCatalogoLavorazioni(true);
  disegnaCatalogoLavorazioni();
  mostraCatalogoLavorazioniImpostazioni().catch(function() {});
}

function disegnaCatalogoLavorazioni() {
  const box = ge('cl-contenuto');
  const l = lavorazioneCatalogo(CATALOGO_LAV.aperta);
  if (!l) { disegnaNuovaLavorazione(); return; }
  const titolare = ROLE === 'titolare';
  const campi = l.lavorazioni_campi || [];
  const docs = l.lavorazioni_documenti || [];
  const check = l.lavorazioni_checklist || [];
  box.innerHTML = htmlSceltaLavorazione(l.codice) +
    // Dati della lavorazione
    '<div class="card">' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between;margin-bottom:6px">' +
        '<div style="font-size:13px;font-weight:600">' + (l.attiva ? '✅ Attiva' : '⏸ Spenta') + ' · codice <code>' + esc(l.codice) + '</code> · versione ' + Number(l.versione || 1) + '</div>' +
        (titolare
          ? '<button class="btn sm' + (l.attiva ? '' : ' p') + '" type="button" id="cl-attiva-btn" onclick="attivaLavorazioneCatalogo(' + (l.attiva ? 'false' : 'true') + ')">' + (l.attiva ? '⏸ Disattiva' : '✅ Attiva') + '</button>'
          : '<span style="font-size:12px;color:var(--m)">Attivare o spegnere: solo il titolare</span>') +
      '</div>' +
      '<div class="fr">' +
        '<div class="f"><label>Nome *</label><input id="cl-nome" maxlength="120" value="' + esc(l.nome) + '"></div>' +
        '<div class="f"><label>Famiglia *</label><input id="cl-famiglia" maxlength="41" list="cl-famiglie" value="' + esc(l.famiglia) + '"></div>' +
      '</div>' +
      '<div class="fr">' +
        '<div class="f"><label>Documento finale</label><select id="cl-documento">' + opzioniHtmlLav(DOCUMENTI_FINALI_LAV, l.documento_finale || '') + '</select></div>' +
        '<div class="f"><label>Descrizione</label><input id="cl-descrizione" maxlength="1000" value="' + esc(l.descrizione || '') + '"></div>' +
      '</div>' +
      '<button class="btn sm p" type="button" onclick="salvaLavorazioneCatalogo()">💾 Salva lavorazione</button>' +
    '</div>' + htmlElencoFamiglie() +
    // Campi
    '<div class="rap-section">Campi della scheda (' + campi.filter(function(c) { return c.attivo !== false; }).length + ')</div>' +
    '<div style="font-size:12px;color:var(--m);margin-bottom:6px">I menu delle schede di oggi prendono già da qui etichetta e valori: un valore aggiunto si vede subito aprendo la scheda. Gli altri campi li userà il motore delle schede.</div>' +
    '<div id="cl-campi">' + (campi.length ? campi.map(htmlRigaCampoLav).join('') : '<div style="font-size:12px;color:var(--m)">Nessun campo.</div>') + '</div>' +
    '<button class="btn sm" type="button" style="margin-top:6px" onclick="apriCampoLavorazione(null)">➕ Aggiungi campo</button>' +
    // Documenti e foto
    '<div class="rap-section">Foto e documenti obbligatori</div>' +
    '<div id="cl-documenti">' + docs.map(htmlRigaDocumentoLav).join('') + '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end;margin-top:6px">' +
      '<div class="f" style="flex:1 1 200px;margin:0"><label>Nuovo: cosa serve</label><input id="cl-doc-nuovo" maxlength="200" placeholder="Es. Foto della targhetta della porta"></div>' +
      '<div class="f" style="flex:0 1 120px;margin:0"><label>Tipo</label><select id="cl-doc-nuovo-tipo"><option value="foto">Foto</option><option value="documento">Documento</option><option value="video">Video</option></select></div>' +
      '<div class="f" style="flex:0 1 70px;margin:0"><label>Quanti</label><input id="cl-doc-nuovo-quanti" type="number" min="1" max="50" value="1"></div>' +
      '<label style="display:flex;gap:4px;align-items:center;font-size:12px;font-weight:400"><input type="checkbox" id="cl-doc-nuovo-pos" style="width:auto"> per posizione</label>' +
      '<button class="btn sm" type="button" onclick="aggiungiDocumentoLav()">➕ Aggiungi</button>' +
    '</div>' +
    // Checklist
    '<div class="rap-section">Checklist di posa</div>' +
    '<div id="cl-checklist">' + check.map(htmlRigaChecklistLav).join('') + '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end;margin-top:6px">' +
      '<div class="f" style="flex:1 1 240px;margin:0"><label>Nuovo punto</label><input id="cl-check-nuovo" maxlength="300" placeholder="Es. Sigillante applicato su tutto il perimetro del foro"></div>' +
      '<label style="display:flex;gap:4px;align-items:center;font-size:12px;font-weight:400"><input type="checkbox" id="cl-check-nuovo-foto" style="width:auto"> serve la foto di posa</label>' +
      '<button class="btn sm" type="button" onclick="aggiungiChecklistLav()">➕ Aggiungi</button>' +
    '</div>' +
    // Registro
    '<div class="rap-section">📒 Registro delle modifiche</div>' +
    '<div id="cl-registro" style="max-height:260px;overflow:auto"><div style="font-size:12px;color:var(--m)">Caricamento...</div></div>';
  caricaRegistroLavorazione(l.id);
}

function htmlRigaCampoLav(c) {
  const tipo = (TIPI_CAMPO_LAV.concat([TIPO_CAMPO_ELENCO_LAV]).find(function(t) { return t.value === c.tipo; }) || {}).label || c.tipo;
  const segni = [];
  if (c.livello === 'ingegnere') segni.push('🎓 ingegnere');
  if (c.normativo) segni.push('📜 normativo');
  if (c.obbligatorio) segni.push('* serve al prezzo'); // F15.4 (D2): obbligatorio = serve al prezzo
  if (c.per_posizione) segni.push('per posizione');
  if (c.unita) segni.push(esc(c.unita));
  if (c.tipo === 'numero' && (c.min_plausibile !== null || c.max_plausibile !== null)) segni.push('plausibile ' + esc(c.min_plausibile ?? '…') + '–' + esc(c.max_plausibile ?? '…'));
  const valori = c.tipo === 'menu' && Array.isArray(c.valori_ammessi)
    ? '<div style="font-size:12px;margin-top:2px">' + c.valori_ammessi.map(function(x) { return '<span style="display:inline-block;margin:1px 3px 1px 0;padding:1px 7px;border:1px solid var(--bo);border-radius:10px;font-size:11px">' + esc(x.etichetta) + '</span>'; }).join('') + '</div>'
    : '';
  return '<div style="padding:6px 0;border-bottom:1px solid var(--bo);font-size:13px;' + (c.attivo === false ? 'opacity:.55' : '') + '">' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between">' +
      '<div style="flex:1 1 220px"><b>' + esc(c.etichetta) + '</b> <span style="font-size:11px;color:var(--m)">' + esc(c.codice) + ' · ' + esc(tipo) +
        (segni.length ? ' · ' + segni.join(' · ') : '') + (c.attivo === false ? ' · tolto' : '') + '</span></div>' +
      '<button class="btn sm" type="button" onclick="apriCampoLavorazione(' + Number(c.id) + ')">✏️ Modifica</button>' +
    '</div>' + valori +
    '<div style="font-size:11px;color:var(--m);margin-top:2px">Uso a valle: ' + esc(c.uso_a_valle || '') + '</div></div>';
}

function htmlRigaDocumentoLav(d) {
  const id = Number(d.id);
  return '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--bo);font-size:13px;' + (d.attivo === false ? 'opacity:.55' : '') + '">' +
    '<input id="cl-doc-d-' + id + '" maxlength="200" value="' + esc(d.descrizione) + '" style="flex:1 1 200px">' +
    '<select id="cl-doc-t-' + id + '" style="flex:0 1 110px">' + opzioniHtmlLav([{ value: 'foto', label: 'Foto' }, { value: 'documento', label: 'Documento' }, { value: 'video', label: 'Video' }], d.tipo) + '</select>' +
    '<input id="cl-doc-q-' + id + '" type="number" min="1" max="50" value="' + Number(d.quanti || 1) + '" style="flex:0 1 60px" title="Quanti">' +
    '<label style="display:flex;gap:4px;align-items:center;font-size:12px;font-weight:400"><input type="checkbox" id="cl-doc-o-' + id + '" style="width:auto"' + (d.obbligatorio ? ' checked' : '') + '> obbligatorio</label>' +
    '<label style="display:flex;gap:4px;align-items:center;font-size:12px;font-weight:400"><input type="checkbox" id="cl-doc-p-' + id + '" style="width:auto"' + (d.per_posizione ? ' checked' : '') + '> per posizione</label>' +
    '<button class="btn sm" type="button" onclick="salvaDocumentoLav(' + id + ')">💾</button>' +
    '<button class="btn sm" type="button" onclick="togliRigaLav(\'lavorazioni_documenti\',' + id + ',' + (d.attivo === false ? 'true' : 'false') + ')">' + (d.attivo === false ? '↩️ Rimetti' : '🗑️ Togli') + '</button>' +
  '</div>';
}

function htmlRigaChecklistLav(r) {
  const id = Number(r.id);
  return '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--bo);font-size:13px;' + (r.attivo === false ? 'opacity:.55' : '') + '">' +
    '<input id="cl-chk-p-' + id + '" maxlength="300" value="' + esc(r.punto) + '" style="flex:1 1 240px">' +
    '<label style="display:flex;gap:4px;align-items:center;font-size:12px;font-weight:400"><input type="checkbox" id="cl-chk-f-' + id + '" style="width:auto"' + (r.foto_di_posa ? ' checked' : '') + '> foto di posa</label>' +
    '<button class="btn sm" type="button" onclick="salvaChecklistLav(' + id + ')">💾</button>' +
    '<button class="btn sm" type="button" onclick="togliRigaLav(\'lavorazioni_checklist\',' + id + ',' + (r.attivo === false ? 'true' : 'false') + ')">' + (r.attivo === false ? '↩️ Rimetti' : '🗑️ Togli') + '</button>' +
  '</div>';
}

// Dopo ogni salvataggio: catalogo riletto (la scheda lo vede subito) e finestra ridisegnata
async function dopoModificaCatalogoLav(messaggio) {
  toast(messaggio);
  await caricaCatalogoLavorazioni(true);
  disegnaCatalogoLavorazioni();
  mostraCatalogoLavorazioniImpostazioni().catch(function() {});
}

// update che restituisce le righe: 0 righe = rifiutato dalle regole del database
async function aggiornaRigaLav(tabella, id, valori) {
  const { data, error } = await db.from(tabella).update(valori).eq('id', id).select('id');
  if (error) return error;
  if (!data || !data.length) return { message: 'Il database non ha salvato la modifica (permesso mancante)' };
  return null;
}

async function salvaLavorazioneCatalogo() {
  const l = lavorazioneCatalogo(CATALOGO_LAV.aperta);
  if (!l) return;
  const nome = v('cl-nome').trim();
  const famiglia = codiceDaTestoLav(v('cl-famiglia'));
  if (nome.length < 2) { toast('Scrivi il nome della lavorazione', 'err'); return; }
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(famiglia)) { toast('Scrivi la famiglia (es. compartimentazione)', 'err'); return; }
  const err = await aggiornaRigaLav('lavorazioni', l.id, {
    nome: nome, famiglia: famiglia, documento_finale: v('cl-documento') || null, descrizione: v('cl-descrizione').trim() || null
  });
  if (err) { toast('Non salvata: ' + erroreCatalogoLav(err), 'err'); return; }
  await dopoModificaCatalogoLav('Lavorazione salvata');
}

async function attivaLavorazioneCatalogo(attiva) {
  const l = lavorazioneCatalogo(CATALOGO_LAV.aperta);
  if (!l) return;
  if (!confirm((attiva ? 'Attivare ' : 'Spegnere ') + '"' + l.nome + '"?' + (attiva ? '' : '\nLe schede già salvate restano; la lavorazione non si propone più per quelle nuove (motore schede).'))) return;
  const err = await aggiornaRigaLav('lavorazioni', l.id, { attiva: !!attiva });
  if (err) { toast('Non cambiata: ' + erroreCatalogoLav(err), 'err'); return; }
  await dopoModificaCatalogoLav(attiva ? 'Lavorazione attivata' : 'Lavorazione spenta');
}

async function aggiungiDocumentoLav() {
  const l = lavorazioneCatalogo(CATALOGO_LAV.aperta);
  const descr = v('cl-doc-nuovo').trim();
  const quanti = parseInt(v('cl-doc-nuovo-quanti'), 10) || 1;
  if (!l) return;
  if (descr.length < 2) { toast('Scrivi cosa serve (es. Foto della targhetta)', 'err'); return; }
  if (quanti < 1 || quanti > 50) { toast('Quanti: da 1 a 50', 'err'); return; }
  const ordine = ((l.lavorazioni_documenti || []).reduce(function(m, d) { return Math.max(m, d.ordine || 0); }, 0)) + 10;
  const { error } = await db.from('lavorazioni_documenti').insert({
    lavorazione_id: l.id, descrizione: descr, tipo: v('cl-doc-nuovo-tipo') || 'foto', quanti: quanti,
    obbligatorio: true, per_posizione: !!(ge('cl-doc-nuovo-pos') && ge('cl-doc-nuovo-pos').checked), ordine: Math.min(ordine, 9999)
  });
  if (error) { toast('Non aggiunto: ' + erroreCatalogoLav(error), 'err'); return; }
  await dopoModificaCatalogoLav('Aggiunto');
}

async function salvaDocumentoLav(id) {
  const descr = v('cl-doc-d-' + id).trim();
  const quanti = parseInt(v('cl-doc-q-' + id), 10) || 1;
  if (descr.length < 2) { toast('Scrivi cosa serve', 'err'); return; }
  if (quanti < 1 || quanti > 50) { toast('Quanti: da 1 a 50', 'err'); return; }
  const err = await aggiornaRigaLav('lavorazioni_documenti', id, {
    descrizione: descr, tipo: v('cl-doc-t-' + id) || 'foto', quanti: quanti,
    obbligatorio: !!ge('cl-doc-o-' + id).checked, per_posizione: !!ge('cl-doc-p-' + id).checked
  });
  if (err) { toast('Non salvato: ' + erroreCatalogoLav(err), 'err'); return; }
  await dopoModificaCatalogoLav('Salvato');
}

async function aggiungiChecklistLav() {
  const l = lavorazioneCatalogo(CATALOGO_LAV.aperta);
  const punto = v('cl-check-nuovo').trim();
  if (!l) return;
  if (punto.length < 2) { toast('Scrivi il punto da controllare', 'err'); return; }
  const ordine = ((l.lavorazioni_checklist || []).reduce(function(m, d) { return Math.max(m, d.ordine || 0); }, 0)) + 10;
  const { error } = await db.from('lavorazioni_checklist').insert({
    lavorazione_id: l.id, punto: punto, foto_di_posa: !!(ge('cl-check-nuovo-foto') && ge('cl-check-nuovo-foto').checked), ordine: Math.min(ordine, 9999)
  });
  if (error) { toast('Non aggiunto: ' + erroreCatalogoLav(error), 'err'); return; }
  await dopoModificaCatalogoLav('Aggiunto');
}

async function salvaChecklistLav(id) {
  const punto = v('cl-chk-p-' + id).trim();
  if (punto.length < 2) { toast('Scrivi il punto da controllare', 'err'); return; }
  const err = await aggiornaRigaLav('lavorazioni_checklist', id, { punto: punto, foto_di_posa: !!ge('cl-chk-f-' + id).checked });
  if (err) { toast('Non salvato: ' + erroreCatalogoLav(err), 'err'); return; }
  await dopoModificaCatalogoLav('Salvato');
}

async function togliRigaLav(tabella, id, rimetti) {
  if (['lavorazioni_campi', 'lavorazioni_documenti', 'lavorazioni_checklist'].indexOf(tabella) < 0) return;
  if (!rimetti && !confirm('Togliere la riga? Resta nel registro e si può rimettere.')) return;
  const err = await aggiornaRigaLav(tabella, id, { attivo: !!rimetti });
  if (err) { toast('Non cambiata: ' + erroreCatalogoLav(err), 'err'); return; }
  await dopoModificaCatalogoLav(rimetti ? 'Rimessa' : 'Tolta');
}

async function caricaRegistroLavorazione(idLav) {
  const box = ge('cl-registro');
  if (!box) return;
  const { data, error } = await db.from('lavorazioni_registro').select('*').eq('lavorazione_id', idLav)
    .order('quando', { ascending: false }).limit(60);
  if (error) { box.innerHTML = '<div class="al2 w">Registro non letto: ' + esc(error.message) + '</div>'; return; }
  box.innerHTML = (data || []).length
    ? data.map(function(r) {
        const modifiche = r.azione === 'creata' ? '' : Object.keys(r.modifiche || {}).map(function(k) {
          return esc(k) + ': ' + esc(testoValoreRegistroLav(r.modifiche[k].prima)) + ' → ' + esc(testoValoreRegistroLav(r.modifiche[k].dopo));
        }).join('<br>');
        return '<div style="padding:5px 0;border-bottom:1px solid var(--bo);font-size:12px;overflow-wrap:anywhere">' +
          '<b>' + esc(new Date(r.quando).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</b> · ' +
          esc(AZIONI_REGISTRO_LAV[r.azione] || r.azione) + ' · ' + esc(TABELLE_REGISTRO_LAV[r.tabella] || r.tabella) +
          ' · ' + esc(r.utente_nome || '') + (r.utente_ruolo ? ' (' + esc(typeof etichettaRuolo === 'function' ? etichettaRuolo(r.utente_ruolo) : r.utente_ruolo) + ')' : '') +
          (r.descrizione ? '<div>' + esc(r.descrizione) + '</div>' : '') +
          (modifiche ? '<div style="color:var(--m)">' + modifiche + '</div>' : '') + '</div>';
      }).join('')
    : '<div style="font-size:12px;color:var(--m)">Nessuna modifica registrata.</div>';
}

function testoValoreRegistroLav(x) {
  if (x === null || x === undefined) return '—';
  if (Array.isArray(x)) return x.map(function(e) { return e && typeof e === 'object' ? (e.etichetta || e.valore) : String(e); }).join(', ');
  if (typeof x === 'object') return JSON.stringify(x);
  if (x === true) return 'sì';
  if (x === false) return 'no';
  return String(x);
}

// ── Finestra del campo ──────────────────────────────────────────────
function apriCampoLavorazione(id) {
  const l = lavorazioneCatalogo(CATALOGO_LAV.aperta);
  if (!l) return;
  const c = id ? (l.lavorazioni_campi || []).find(function(x) { return Number(x.id) === Number(id); }) : null;
  CATALOGO_LAV.campo = c ? { id: c.id, valori: (c.valori_ammessi || []).map(function(x) { return { valore: x.valore, etichetta: x.etichetta, nuovo: false }; }) }
                         : { id: null, valori: [] };
  ge('clc-titolo').textContent = (c ? '✏️ ' + c.etichetta : '➕ Nuovo campo') + ' · ' + l.nome;
  ge('clc-etichetta').value = c ? c.etichetta : '';
  ge('clc-codice').value = c ? c.codice : '';
  ge('clc-codice').disabled = !!c;
  ge('clc-codice').dataset.toccato = c ? '1' : '';
  const elenco = !!(c && c.tipo === 'elenco');
  ge('clc-tipo').innerHTML = opzioniHtmlLav(elenco ? [TIPO_CAMPO_ELENCO_LAV] : TIPI_CAMPO_LAV, c ? c.tipo : 'menu');
  ge('clc-tipo').disabled = elenco;
  ge('clc-posizione').disabled = elenco;
  ge('clc-unita').value = c && c.unita ? c.unita : '';
  ge('clc-min').value = c && c.min_plausibile !== null && c.min_plausibile !== undefined ? String(c.min_plausibile).replace('.', ',') : '';
  ge('clc-max').value = c && c.max_plausibile !== null && c.max_plausibile !== undefined ? String(c.max_plausibile).replace('.', ',') : '';
  ge('clc-livello').value = c ? c.livello : 'base';
  ge('clc-normativo').checked = !!(c && c.normativo);
  ge('clc-obbligatorio').checked = !!(c && c.obbligatorio);
  ge('clc-posizione').checked = !!(c && c.per_posizione);
  ge('clc-uso').value = c ? c.uso_a_valle : '';
  const maxOrd = (l.lavorazioni_campi || []).reduce(function(m, x) { return Math.max(m, x.ordine || 0); }, 0);
  ge('clc-ordine').value = c ? c.ordine : Math.min(maxOrd + 10, 9999);
  ge('clc-togli').style.display = c ? '' : 'none';
  ge('clc-togli').textContent = c && c.attivo === false ? '↩️ Rimetti il campo' : '🗑️ Togli il campo';
  ge('clc-nuovo-valore').value = '';
  aggiornaTipoCampoLav();
  disegnaValoriCampoLav();
  openM('m-campo-lavorazione');
  setTimeout(function() { (c ? ge('clc-nuovo-valore') : ge('clc-etichetta')).focus(); }, 50);
}

function codiceCampoDaEtichettaLav() {
  const cod = ge('clc-codice');
  if (!cod.disabled && !cod.dataset.toccato) cod.value = codiceDaTestoLav(v('clc-etichetta'));
}

function aggiornaTipoCampoLav() {
  const tipo = v('clc-tipo');
  ge('clc-box-menu').style.display = tipo === 'menu' ? '' : 'none';
  ge('clc-box-numero').style.display = tipo === 'numero' ? '' : 'none';
}

function disegnaValoriCampoLav() {
  const box = ge('clc-valori');
  const valori = CATALOGO_LAV.campo.valori;
  box.innerHTML = valori.length
    ? valori.map(function(x, i) {
        return '<div style="display:flex;gap:6px;align-items:center;padding:3px 0">' +
          '<input id="clc-val-e-' + i + '" maxlength="120" value="' + esc(x.etichetta) + '" style="flex:1 1 auto" oninput="CATALOGO_LAV.campo.valori[' + i + '].etichetta=this.value">' +
          '<span style="font-size:11px;color:var(--m);flex:0 0 auto;max-width:40%;overflow:hidden;text-overflow:ellipsis" title="Valore salvato nelle schede (non si cambia)">' + esc(x.valore) + '</span>' +
          '<button class="btn sm" type="button" title="Su" onclick="spostaValoreCampoLav(' + i + ',-1)"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="btn sm" type="button" title="Togli dal menu" onclick="togliValoreCampoLav(' + i + ')">✖</button>' +
        '</div>';
      }).join('')
    : '<div style="font-size:12px;color:var(--m)">Nessun valore: aggiungine almeno uno.</div>';
}

function aggiungiValoreCampoLav() {
  const etichetta = v('clc-nuovo-valore').trim();
  if (!etichetta) { toast('Scrivi il valore da aggiungere al menu', 'err'); return; }
  const valori = CATALOGO_LAV.campo.valori;
  let codice = codiceDaTestoLav(etichetta) || 'valore';
  const base = codice;
  for (let n = 2; valori.some(function(x) { return x.valore === codice; }); n++) codice = base.slice(0, 36) + '_' + n;
  if (valori.some(function(x) { return x.etichetta.trim().toLowerCase() === etichetta.toLowerCase(); })) { toast('Valore già nel menu', 'err'); return; }
  valori.push({ valore: codice, etichetta: etichetta, nuovo: true });
  ge('clc-nuovo-valore').value = '';
  disegnaValoriCampoLav();
  ge('clc-nuovo-valore').focus();
}

function spostaValoreCampoLav(i, verso) {
  const valori = CATALOGO_LAV.campo.valori;
  const j = i + verso;
  if (j < 0 || j >= valori.length) return;
  const x = valori[i]; valori[i] = valori[j]; valori[j] = x;
  disegnaValoriCampoLav();
}

function togliValoreCampoLav(i) {
  const x = CATALOGO_LAV.campo.valori[i];
  if (!x) return;
  if (!x.nuovo && !confirm('Togliere "' + x.etichetta + '" dal menu?\nNelle schede già salvate con questo valore resta visibile come "non più in elenco".')) return;
  CATALOGO_LAV.campo.valori.splice(i, 1);
  disegnaValoriCampoLav();
}

function numeroCampoLav(testo) {
  const s = String(testo || '').trim().replace(/\s/g, '');
  if (!s) return null;
  const t = (s.indexOf(',') < 0 && /^-?\d+\.\d+$/.test(s)) ? s : s.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return isFinite(n) ? n : NaN;
}

async function salvaCampoLavorazione() {
  const l = lavorazioneCatalogo(CATALOGO_LAV.aperta);
  if (!l) return;
  const nuovo = !CATALOGO_LAV.campo.id;
  const etichetta = v('clc-etichetta').trim();
  const codice = v('clc-codice').trim();
  const tipo = v('clc-tipo');
  const uso = v('clc-uso').trim();
  const ordine = parseInt(v('clc-ordine'), 10);
  if (!etichetta) { toast('Scrivi l’etichetta del campo', 'err'); return; }
  if (nuovo && !/^[a-z][a-z0-9_]{0,40}$/.test(codice)) { toast('Codice del campo: lettere minuscole, numeri e _ (es. tipo_servizio)', 'err'); return; }
  if (nuovo && (l.lavorazioni_campi || []).some(function(c) { return c.codice === codice; })) { toast('Codice già usato in questa lavorazione', 'err'); return; }
  if (uso.length < 3) { toast('Scrivi l’uso a valle: quale calcolo o documento usa il campo', 'err'); ge('clc-uso').focus(); return; }
  if (!(ordine >= 0 && ordine <= 9999)) { toast('Ordine: un numero da 0 a 9999', 'err'); return; }
  const riga = {
    etichetta: etichetta, tipo: tipo, unita: v('clc-unita').trim() || null,
    valori_ammessi: null, min_plausibile: null, max_plausibile: null,
    livello: v('clc-livello') || 'base', normativo: !!ge('clc-normativo').checked,
    obbligatorio: !!ge('clc-obbligatorio').checked, per_posizione: !!ge('clc-posizione').checked,
    uso_a_valle: uso, ordine: ordine
  };
  if (tipo === 'menu') {
    const valori = CATALOGO_LAV.campo.valori.map(function(x) { return { valore: x.valore, etichetta: String(x.etichetta || '').trim() }; });
    if (!valori.length) { toast('Un menu ha almeno un valore', 'err'); return; }
    if (valori.some(function(x) { return !x.etichetta; })) { toast('Ogni valore del menu ha un’etichetta', 'err'); return; }
    riga.valori_ammessi = valori;
  }
  if (tipo === 'numero') {
    const min = numeroCampoLav(v('clc-min'));
    const max = numeroCampoLav(v('clc-max'));
    if (Number.isNaN(min) || Number.isNaN(max)) { toast('Minimo e massimo: numeri (es. 0,5)', 'err'); return; }
    if (min !== null && max !== null && min > max) { toast('Il minimo è più grande del massimo', 'err'); return; }
    riga.min_plausibile = min; riga.max_plausibile = max;
  }
  let err = null;
  if (nuovo) {
    riga.lavorazione_id = l.id; riga.codice = codice;
    const r = await db.from('lavorazioni_campi').insert(riga);
    err = r.error;
  } else {
    err = await aggiornaRigaLav('lavorazioni_campi', CATALOGO_LAV.campo.id, riga);
  }
  if (err) { toast('Campo non salvato: ' + erroreCatalogoLav(err), 'err'); return; }
  closeM('m-campo-lavorazione');
  await dopoModificaCatalogoLav(nuovo ? 'Campo aggiunto' : 'Campo salvato: le schede lo vedono subito');
}

async function togliCampoLavorazione() {
  const l = lavorazioneCatalogo(CATALOGO_LAV.aperta);
  const c = l && (l.lavorazioni_campi || []).find(function(x) { return Number(x.id) === Number(CATALOGO_LAV.campo.id); });
  if (!c) return;
  closeM('m-campo-lavorazione');
  await togliRigaLav('lavorazioni_campi', c.id, c.attivo === false);
}

// Bottone "📚 Catalogo lavorazioni" nella pagina Verifiche tecniche: compare
// solo con sql/75 e SOLO al titolare (informatico compreso). Decisione di
// Erika del 13/11: il catalogo lo gestisce lei, all'ingegnere niente bottone
// (resta "➕ Proponi un campo" nella scheda del motore). Solo il sito: le
// regole di sql/75 nel database non cambiano.
async function mostraBottoneCatalogoVerifiche() {
  const btn = ge('vt-catalogo-btn');
  if (!btn) return;
  btn.style.display = 'none';
  if (ROLE !== 'titolare' || !puoModificareCatalogoLav()) return;
  await caricaCatalogoLavorazioni();
  if (CATALOGO_LAV.disponibili) btn.style.display = '';
}

if (typeof loadVerificheTecniche === 'function') {
  const loadVerificheTecnicheSenzaCatalogo = loadVerificheTecniche;
  // eslint-disable-next-line no-global-assign
  loadVerificheTecniche = async function() {
    mostraBottoneCatalogoVerifiche().catch(function() {});
    return loadVerificheTecnicheSenzaCatalogo.apply(this, arguments);
  };
}

// ── F15.10 — IMPORT DEL CATALOGO DA UN FOGLIO EXCEL ──────────────────
// Un foglio (xlsx, xls o csv) con UNA RIGA PER CAMPO: la lavorazione (codice
// e/o nome, famiglia, documento finale; vuoti = quelli della riga sopra) e il
// campo (etichetta, codice, tipo, unità, valori del menu separati da ";",
// minimo e massimo plausibili, chi lo compila, normativo, serve al prezzo, per
// posizione, uso a valle, ordine). "⬇️ Scarica il modello" dà il foglio vuoto
// con un esempio e le istruzioni.
// Flusso: importaFoglioLavorazioni legge il file con la libreria xlsx già usata
// da js/14 (caricaLibreriaExcel di js/00), controlla ogni riga con le stesse
// regole del database (sql/75, 78, 81) e mostra l'ANTEPRIMA (finestra
// m-import-lavorazioni, id ilv-): cosa nasce, cosa c'è già, errori con il
// numero di riga. Con anche un solo errore non si importa nulla.
// "📥 Importa" scrive con insert diretti sotto RLS (titolare e ingegnere,
// nessuna RPC, nessun SQL nuovo):
// - lavorazione NUOVA: nasce SPENTA (attiva = false, in bozza): la attiva il
//   titolare dal catalogo quando ha controllato campi e menu;
// - lavorazione GIÀ NEL CATALOGO: nome, famiglia e documento non cambiano; si
//   aggiungono solo i campi nuovi. Se la lavorazione è ATTIVA i campi nuovi
//   arrivano "tolti" (attivo = false: non compaiono nelle schede finché non si
//   preme ↩️ Rimetti), a meno di spuntare "rendili subito visibili";
// - campo con un codice già nella lavorazione: NON si tocca (si corregge dal
//   catalogo con ✏️ Modifica), l'anteprima lo dice.
// I campi di una lavorazione si inseriscono con un solo insert (tutto o
// niente per lavorazione); il registro del catalogo (lavorazioni_registro) li
// scrive il database come per l'inserimento a mano.

const IMPORT_LAV = { righe: null, piano: null, file: '' };

// Colonne del foglio: nome della colonna (senza maiuscole, accenti, spazi) → chiave
const COLONNE_IMPORT_LAV = {
  lavorazione: 'lav_codice', codice_lavorazione: 'lav_codice', lavorazione_codice: 'lav_codice',
  nome_lavorazione: 'lav_nome', lavorazione_nome: 'lav_nome',
  famiglia: 'famiglia',
  documento_finale: 'documento', documento: 'documento',
  descrizione_lavorazione: 'descrizione', descrizione: 'descrizione',
  codice_campo: 'codice', campo: 'codice', codice: 'codice',
  etichetta: 'etichetta', etichetta_campo: 'etichetta', nome_campo: 'etichetta',
  tipo: 'tipo', tipo_campo: 'tipo',
  unita: 'unita', unita_di_misura: 'unita', um: 'unita',
  valori: 'valori', valori_menu: 'valori', valori_del_menu: 'valori', valori_ammessi: 'valori',
  min: 'min', minimo: 'min', min_plausibile: 'min', minimo_plausibile: 'min',
  max: 'max', massimo: 'max', max_plausibile: 'max', massimo_plausibile: 'max',
  livello: 'livello', chi_lo_compila: 'livello', chi_compila: 'livello',
  normativo: 'normativo', dato_normativo: 'normativo',
  serve_al_prezzo: 'prezzo', obbligatorio: 'prezzo', serve_a_calcolare_il_preventivo: 'prezzo',
  per_posizione: 'posizione', posizione: 'posizione',
  uso_a_valle: 'uso', uso: 'uso',
  ordine: 'ordine'
};

const TESTATA_MODELLO_LAV = ['Codice lavorazione', 'Nome lavorazione', 'Famiglia', 'Documento finale', 'Codice campo', 'Etichetta',
  'Tipo', 'Unità', 'Valori menu', 'Minimo', 'Massimo', 'Chi lo compila', 'Normativo', 'Serve al prezzo', 'Per posizione', 'Uso a valle', 'Ordine'];

// Chiavi che il motore usa già nei dati della scheda (js/56, js/66): un campo
// con lo stesso codice le sovrascriverebbe
const CODICI_RISERVATI_LAV = ['nome_scheda', 'fonti_normative', 'foto_video', 'tipo_richiesta', 'sede_id', 'indirizzo_lavori',
  'referente_lavori', 'telefono_referente', 'pareti_cartongesso'];
const CODICI_RISERVATI_POSIZIONE_LAV = ['larghezza', 'altezza', 'note'];

function chiaveColonnaImportLav(testo) {
  const k = String(testo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return COLONNE_IMPORT_LAV[k] || null;
}

function testoCellaLav(x) {
  if (x === null || x === undefined) return '';
  return String(x).replace(/ /g, ' ').trim();
}

function siNoCellaLav(testo) {
  const t = testoCellaLav(testo).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!t) return false;
  if (['si', 's', 'x', '1', 'vero', 'true', 'yes', 'y', '✓', 'ok'].indexOf(t) >= 0) return true;
  if (['no', 'n', '0', 'falso', 'false', '-'].indexOf(t) >= 0) return false;
  return null;
}

function tipoCellaLav(testo) {
  const t = testoCellaLav(testo).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '');
  if (!t) return '';
  if (t.indexOf('numer') === 0) return 'numero';
  if (t.indexOf('menu') === 0 || t === 'elencoavalori' || t === 'scelta' || t.indexOf('sceltada') === 0) return 'menu';
  if (t === 'sino' || t === 'si' || t === 'booleano') return 'si_no';
  if (t.indexOf('test') === 0) return 'testo';
  if (t.indexOf('foto') === 0) return 'foto';
  return null;
}

function documentoCellaLav(testo) {
  const t = testoCellaLav(testo);
  if (!t) return '';
  const n = codiceDaTestoLav(t);
  const d = DOCUMENTI_FINALI_LAV.find(function(x) {
    return x.value && (x.value === n || codiceDaTestoLav(x.label) === n || codiceDaTestoLav(x.label).indexOf(n) === 0);
  });
  return d ? d.value : null;
}

// Etichette del menu: separate da ";" o a capo (anche "|")
function valoriMenuCellaLav(testo) {
  const etichette = testoCellaLav(testo).split(/[;|\n\r]+/).map(function(x) { return x.trim(); }).filter(Boolean);
  const valori = [];
  const errori = [];
  etichette.forEach(function(e) {
    if (e.length > 120) { errori.push('valore del menu troppo lungo (max 120 caratteri): "' + e.slice(0, 30) + '…"'); return; }
    if (valori.some(function(x) { return x.etichetta.toLowerCase() === e.toLowerCase(); })) { errori.push('valore ripetuto nel menu: "' + e + '"'); return; }
    let codice = codiceDaTestoLav(e) || 'valore';
    const base = codice;
    for (let n = 2; valori.some(function(x) { return x.valore === codice; }); n++) codice = base.slice(0, 36) + '_' + n;
    valori.push({ valore: codice, etichetta: e });
  });
  if (valori.length > 200) errori.push('un menu ha al massimo 200 valori');
  return { valori: valori, errori: errori };
}

// Righe del foglio → { righe: [...], errore }
function leggiRigheFoglioLav(workbook) {
  for (const nome of workbook.SheetNames) {
    const tab = XLSX.utils.sheet_to_json(workbook.Sheets[nome], { header: 1, defval: null, raw: false });
    let riga = -1;
    for (let i = 0; i < Math.min(15, tab.length); i++) {
      if ((tab[i] || []).some(function(c) { return chiaveColonnaImportLav(c) === 'etichetta'; })) { riga = i; break; }
    }
    if (riga < 0) continue;
    const colonne = (tab[riga] || []).map(chiaveColonnaImportLav);
    const righe = [];
    for (let r = riga + 1; r < tab.length; r++) {
      const cel = tab[r] || [];
      if (!cel.some(function(c) { return testoCellaLav(c) !== ''; })) continue;
      const o = { n: r + 1, foglio: nome };
      colonne.forEach(function(k, j) { if (k && o[k] === undefined) o[k] = testoCellaLav(cel[j]); });
      righe.push(o);
    }
    return { righe: righe, foglio: nome };
  }
  return { righe: [], errore: 'Nel file non c’è una riga di intestazione con la colonna "Etichetta". Usa il modello (⬇️ Scarica il modello).' };
}

// Controllo di tutte le righe e piano dell'import (niente scritture qui)
function pianoImportLav(righe) {
  const lavs = [];
  const perCodice = {};
  const errori = [];
  let attuale = null;
  righe.forEach(function(r) {
    const err = [];
    // Lavorazione: quella della riga, se no quella della riga sopra
    if (r.lav_codice || r.lav_nome) {
      const codiceLav = r.lav_codice ? r.lav_codice : codiceDaTestoLav(r.lav_nome);
      if (!/^[a-z][a-z0-9_]{1,40}$/.test(codiceLav)) {
        errori.push({ n: r.n, testo: 'codice della lavorazione non valido "' + codiceLav + '" (lettere minuscole, numeri e _, comincia con una lettera)' });
        attuale = null;
        return;
      }
      if (!perCodice[codiceLav]) {
        const esistente = lavorazioneCatalogo(codiceLav);
        const nuova = { codice: codiceLav, esistente: esistente, nome: esistente ? esistente.nome : (r.lav_nome || ''), famiglia: '', documento: '', descrizione: '', campi: [], codiciCampi: {}, n: r.n };
        if (!esistente) {
          if (nuova.nome.length < 2 || nuova.nome.length > 120) err.push('scrivi il nome della lavorazione nuova (da 2 a 120 caratteri)');
          nuova.famiglia = r.famiglia ? codiceDaTestoLav(r.famiglia) : codiceLav;
          if (!/^[a-z][a-z0-9_]{1,40}$/.test(nuova.famiglia)) err.push('famiglia non valida "' + (r.famiglia || '') + '"');
          const doc = documentoCellaLav(r.documento);
          if (doc === null) err.push('documento finale non riconosciuto "' + r.documento + '" (es. corretta posa, D.M. 37/08, rapporto, attestato, DoP, progetto)');
          nuova.documento = doc || '';
          nuova.descrizione = (r.descrizione || '').slice(0, 1000);
        }
        perCodice[codiceLav] = nuova;
        lavs.push(nuova);
      }
      attuale = perCodice[codiceLav];
    }
    if (!attuale) {
      errori.push({ n: r.n, testo: 'manca la lavorazione (codice o nome; in una riga sopra o in questa)' });
      return;
    }
    // Campo
    const etichetta = r.etichetta || '';
    if (!etichetta && !r.codice && !r.tipo) {
      // riga con la sola lavorazione (es. lavorazione nuova senza campi): va bene
      err.forEach(function(t) { errori.push({ n: r.n, testo: t }); });
      return;
    }
    if (!etichetta || etichetta.length > 160) err.push('etichetta del campo vuota o più lunga di 160 caratteri');
    const codice = r.codice ? r.codice : codiceDaTestoLav(etichetta).slice(0, 41);
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(codice)) err.push('codice del campo non valido "' + codice + '" (lettere minuscole, numeri e _)');
    if (CODICI_RISERVATI_LAV.indexOf(codice) >= 0) err.push('il codice "' + codice + '" è già usato dal gestionale nelle schede: scegline un altro');
    const tipo = tipoCellaLav(r.tipo);
    if (!tipo) err.push(tipo === null ? 'tipo non valido "' + r.tipo + '" (numero, menu, sì/no, testo, foto)' : 'manca il tipo (numero, menu, sì/no, testo, foto)');
    const unita = r.unita || '';
    if (unita.length > 20) err.push('unità più lunga di 20 caratteri');
    let valori = null;
    if (tipo === 'menu') {
      const m = valoriMenuCellaLav(r.valori);
      m.errori.forEach(function(t) { err.push(t); });
      if (!m.valori.length) err.push('un menu ha almeno un valore (colonna "Valori menu", separati da ;)');
      valori = m.valori;
    } else if (tipo && r.valori) {
      err.push('i valori servono solo ai campi di tipo menu');
    }
    let min = null, max = null;
    if (tipo === 'numero') {
      min = numeroCampoLav(r.min); max = numeroCampoLav(r.max);
      if (Number.isNaN(min) || Number.isNaN(max)) err.push('minimo e massimo: numeri (es. 0,5)');
      else if (min !== null && max !== null && min > max) err.push('il minimo è più grande del massimo');
    } else if (tipo && (r.min || r.max)) {
      err.push('minimo e massimo servono solo ai campi di tipo numero');
    }
    const liv = (r.livello || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let livello = 'base';
    if (/ingegner|🎓/.test(liv)) livello = 'ingegnere';
    else if (liv && !/^(base|venditore|rappresentante|tutti)/.test(liv)) err.push('"Chi lo compila": base oppure ingegnere');
    const flag = {};
    [['normativo', 'Normativo'], ['prezzo', 'Serve al prezzo'], ['posizione', 'Per posizione']].forEach(function(p) {
      const x = siNoCellaLav(r[p[0]]);
      if (x === null) err.push('"' + p[1] + '": sì oppure no');
      flag[p[0]] = !!x;
    });
    if (flag.posizione && CODICI_RISERVATI_POSIZIONE_LAV.indexOf(codice) >= 0) err.push('in una posizione "' + codice + '" c’è già (misure e note della posizione): scegli un altro codice');
    const uso = r.uso || '';
    if (uso.length < 3 || uso.length > 500) err.push('scrivi l’uso a valle: quale calcolo o documento usa il campo (da 3 a 500 caratteri)');
    let ordine = null;
    if (r.ordine) {
      ordine = Number(String(r.ordine).replace(',', '.'));
      if (!Number.isInteger(ordine) || ordine < 0 || ordine > 9999) err.push('ordine: un numero intero da 0 a 9999');
    }
    if (attuale.codiciCampi[codice]) err.push('codice del campo "' + codice + '" ripetuto nella stessa lavorazione (riga ' + attuale.codiciCampi[codice] + ')');
    attuale.codiciCampi[codice] = r.n;
    const gia = attuale.esistente && (attuale.esistente.lavorazioni_campi || []).find(function(c) { return c.codice === codice; });
    err.forEach(function(t) { errori.push({ n: r.n, testo: t }); });
    attuale.campi.push({
      n: r.n, gia: gia || null, errore: err.length > 0,
      riga: {
        codice: codice, etichetta: etichetta, tipo: tipo || '', unita: unita || null, valori_ammessi: valori,
        min_plausibile: min, max_plausibile: max, livello: livello, normativo: flag.normativo,
        obbligatorio: flag.prezzo, per_posizione: flag.posizione, uso_a_valle: uso, ordine: ordine
      }
    });
  });
  // Ordine: quello del foglio dopo l'ultimo campo già nella lavorazione
  lavs.forEach(function(l) {
    let ultimo = ((l.esistente && l.esistente.lavorazioni_campi) || []).reduce(function(m, c) { return Math.max(m, c.ordine || 0); }, 0);
    l.campi.forEach(function(c) {
      if (c.gia) return;
      if (c.riga.ordine === null) { ultimo = Math.min(ultimo + 10, 9999); c.riga.ordine = ultimo; } else ultimo = Math.max(ultimo, c.riga.ordine);
    });
  });
  if (!righe.length) errori.push({ n: 0, testo: 'il foglio non ha righe sotto l’intestazione' });
  return { lavorazioni: lavs, errori: errori };
}

// Bottone "📥 Importa da foglio": sceglie il file
function scegliFoglioLavorazioni() {
  if (!puoModificareCatalogoLav()) { toast('Il catalogo lo correggono titolare e ingegnere', 'err'); return; }
  const inp = ge('cl-import-file');
  if (inp) { inp.value = ''; inp.click(); }
}

async function importaFoglioLavorazioni(input) {
  if (!puoModificareCatalogoLav()) { toast('Il catalogo lo correggono titolare e ingegnere', 'err'); return; }
  const file = input && input.files && input.files[0];
  if (!file) return;
  input.value = '';
  if (file.size > 5 * 1024 * 1024) { toast('File troppo grande (max 5 MB)', 'err'); return; }
  let letto;
  try {
    await caricaLibreriaExcel();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    letto = leggiRigheFoglioLav(wb);
  } catch (e) {
    toast('File non leggibile: ' + (e && e.message ? e.message : e), 'err');
    return;
  }
  await caricaCatalogoLavorazioni(true);
  if (!CATALOGO_LAV.disponibili) { toast('Il catalogo delle lavorazioni non è ancora attivo (serve sql/75)', 'err'); return; }
  IMPORT_LAV.file = file.name;
  if (ge('ilv-visibili')) ge('ilv-visibili').checked = false;
  IMPORT_LAV.righe = letto.righe;
  IMPORT_LAV.piano = letto.errore ? { lavorazioni: [], errori: [{ n: 0, testo: letto.errore }] } : pianoImportLav(letto.righe);
  disegnaAnteprimaImportLav();
  openM('m-import-lavorazioni');
}

function disegnaAnteprimaImportLav() {
  const p = IMPORT_LAV.piano;
  const box = ge('ilv-contenuto');
  const nuove = p.lavorazioni.filter(function(l) { return !l.esistente; });
  const daAggiungere = p.lavorazioni.reduce(function(s, l) { return s + l.campi.filter(function(c) { return !c.gia; }).length; }, 0);
  const gia = p.lavorazioni.reduce(function(s, l) { return s + l.campi.filter(function(c) { return c.gia; }).length; }, 0);
  const attiveToccate = p.lavorazioni.some(function(l) { return l.esistente && l.esistente.attiva && l.campi.some(function(c) { return !c.gia; }); });
  let h = '<div style="font-size:13px;margin-bottom:8px">File <b>' + esc(IMPORT_LAV.file) + '</b>: ' +
    '<b>' + p.lavorazioni.length + '</b> ' + (p.lavorazioni.length === 1 ? 'lavorazione' : 'lavorazioni') + ' (' + nuove.length + (nuove.length === 1 ? ' nuova' : ' nuove') + '), <b>' + daAggiungere + '</b> ' + (daAggiungere === 1 ? 'campo' : 'campi') + ' da aggiungere' +
    (gia ? ', ' + gia + ' già nel catalogo (non si cambiano)' : '') + '.</div>';
  if (p.errori.length) {
    h += '<div class="al2 e" style="margin-bottom:8px"><b>' + p.errori.length + (p.errori.length === 1 ? ' errore' : ' errori') + ': non si importa nulla.</b> Correggi il foglio e caricalo di nuovo.<ul style="margin:6px 0 0 18px;padding:0">' +
      p.errori.slice(0, 60).map(function(e) { return '<li>' + (e.n ? 'Riga ' + e.n + ': ' : '') + esc(e.testo) + '</li>'; }).join('') +
      (p.errori.length > 60 ? '<li>… e altri ' + (p.errori.length - 60) + '</li>' : '') + '</ul></div>';
  }
  p.lavorazioni.forEach(function(l) {
    const stato = l.esistente
      ? (l.esistente.attiva ? '✅ già nel catalogo, attiva' : '⏸ già nel catalogo, spenta')
      : '➕ nuova, nasce spenta';
    h += '<div class="card" style="margin-bottom:8px"><div style="font-size:13px;font-weight:600;margin-bottom:4px">' + esc(l.nome || l.codice) +
      ' <span style="font-weight:400;font-size:11px;color:var(--m)">' + esc(l.codice) + (l.esistente ? '' : ' · famiglia ' + esc(l.famiglia) +
      (l.documento ? ' · ' + esc((DOCUMENTI_FINALI_LAV.find(function(d) { return d.value === l.documento; }) || {}).label || '') : '')) + ' · ' + stato + '</span></div>';
    if (!l.campi.length) h += '<div style="font-size:12px;color:var(--m)">Nessun campo nel foglio.</div>';
    h += l.campi.map(function(c) {
      const r = c.riga;
      const segni = [];
      const tipo = (TIPI_CAMPO_LAV.find(function(t) { return t.value === r.tipo; }) || {}).label || 'tipo ?';
      segni.push(tipo);
      if (r.unita) segni.push(r.unita);
      if (r.livello === 'ingegnere') segni.push('🎓 ingegnere');
      if (r.normativo) segni.push('📜 normativo');
      if (r.obbligatorio) segni.push('* serve al prezzo');
      if (r.per_posizione) segni.push('per posizione');
      if (r.tipo === 'numero' && (r.min_plausibile !== null || r.max_plausibile !== null)) segni.push('plausibile ' + (r.min_plausibile ?? '…') + '–' + (r.max_plausibile ?? '…'));
      if (r.tipo === 'menu' && r.valori_ammessi) segni.push(r.valori_ammessi.length + ' valori: ' + r.valori_ammessi.slice(0, 6).map(function(x) { return x.etichetta; }).join(', ') + (r.valori_ammessi.length > 6 ? '…' : ''));
      const esito = c.errore ? '<span style="color:var(--r)">❌ errore</span>'
        : c.gia ? '<span style="color:var(--m)">già nel catalogo: non cambia</span>'
        : (l.esistente && l.esistente.attiva ? '➕ si aggiunge' + (ge('ilv-visibili') && ge('ilv-visibili').checked ? '' : ' (tolto)') : '➕ si aggiunge');
      return '<div style="padding:4px 0;border-bottom:1px solid var(--bo);font-size:12px' + (c.gia ? ';opacity:.6' : '') + '">' +
        '<span style="color:var(--m)">riga ' + c.n + '</span> · <b>' + esc(r.etichetta || '(senza etichetta)') + '</b> <span style="color:var(--m)">' + esc(r.codice) + '</span> · ' +
        esc(segni.join(' · ')) + ' · ' + esito + '</div>';
    }).join('');
    h += '</div>';
  });
  box.innerHTML = h;
  ge('ilv-visibili-box').style.display = attiveToccate ? 'flex' : 'none';
  ge('ilv-importa').disabled = !!p.errori.length || !(nuove.length || daAggiungere);
}

async function confermaImportLavorazioni() {
  const p = IMPORT_LAV.piano;
  if (!p || p.errori.length) return;
  if (!puoModificareCatalogoLav()) { toast('Il catalogo lo correggono titolare e ingegnere', 'err'); return; }
  const visibili = !!(ge('ilv-visibili') && ge('ilv-visibili').checked);
  const btn = ge('ilv-importa');
  btn.disabled = true;
  const fatte = [];
  const problemi = [];
  let campiAggiunti = 0;
  try {
    for (const l of p.lavorazioni) {
      let idLav = l.esistente ? l.esistente.id : null;
      let attiva = !!(l.esistente && l.esistente.attiva);
      if (!idLav) {
        const { data, error } = await db.from('lavorazioni').insert({
          codice: l.codice, nome: l.nome, famiglia: l.famiglia, documento_finale: l.documento || null,
          descrizione: l.descrizione || null, attiva: false
        }).select('id').maybeSingle();
        if (error || !data) { problemi.push(l.nome + ': lavorazione non creata (' + erroreCatalogoLav(error || 'permesso mancante') + ')'); continue; }
        idLav = data.id; attiva = false;
      }
      const nuovi = l.campi.filter(function(c) { return !c.gia; }).map(function(c) {
        return Object.assign({}, c.riga, { lavorazione_id: idLav, attivo: attiva ? visibili : true });
      });
      if (nuovi.length) {
        const { data, error } = await db.from('lavorazioni_campi').insert(nuovi).select('id');
        if (error || !data || data.length !== nuovi.length) { problemi.push(l.nome + ': campi non aggiunti (' + erroreCatalogoLav(error || 'permesso mancante') + ')'); fatte.push(l.codice); continue; }
        campiAggiunti += data.length;
      }
      fatte.push(l.codice);
    }
  } finally {
    btn.disabled = false;
  }
  await caricaCatalogoLavorazioni(true);
  mostraCatalogoLavorazioniImpostazioni().catch(function() {});
  if (problemi.length) {
    alert('Import fatto in parte (' + campiAggiunti + ' campi aggiunti).\n\n' + problemi.join('\n') +
      '\n\nLe lavorazioni create restano spente: correggi il foglio e ricaricalo, i campi già importati non si ripetono.');
  } else {
    toast('Import fatto: ' + campiAggiunti + ' campi in ' + fatte.length + ' lavorazioni (le nuove sono spente)');
  }
  closeM('m-import-lavorazioni');
  IMPORT_LAV.piano = null;
  if (fatte.length) CATALOGO_LAV.aperta = fatte[0];
  if (ge('m-catalogo-lavorazioni') && ge('m-catalogo-lavorazioni').classList.contains('on')) disegnaCatalogoLavorazioni();
  else await apriCatalogoLavorazioni(fatte.length ? fatte[0] : undefined);
}

// "⬇️ Scarica il modello": foglio con intestazione, due righe d'esempio e istruzioni
async function scaricaModelloImportLav() {
  try { await caricaLibreriaExcel(); } catch (e) { toast('Libreria Excel non caricata: ' + e.message, 'err'); return; }
  const righe = [TESTATA_MODELLO_LAV,
    ['sigillature', 'Sigillature', 'compartimentazione', 'Dichiarazione di corretta posa in opera', 'tipo_servizio', 'Tipo di servizio', 'menu', '', 'Sigillatura di canaline; Sigillatura di tubi; Sigillatura di cavi', '', '', 'base', 'no', 'sì', 'no', 'Voce del preventivo; dichiarazione di corretta posa', 10],
    ['', '', '', '', 'numero_attraversamenti', 'Numero di attraversamenti', 'numero', 'pz', '', '1', '500', 'base', 'no', 'sì', 'no', 'Quantità per il preventivo', 20],
    ['', '', '', '', 'classe_ei', 'Classe EI richiesta', 'menu', '', 'EI 60; EI 90; EI 120', '', '', 'base', 'sì', 'sì', 'no', 'Scelta del prodotto certificato; dichiarazione di corretta posa', 30]];
  const istruzioni = [['Come compilare il foglio (una riga per campo)'],
    ['Codice lavorazione / Nome lavorazione: almeno uno dei due; vuoti = la lavorazione della riga sopra. Codice: lettere minuscole, numeri e _ (es. sigillature).'],
    ['Una lavorazione NUOVA nasce spenta: la attiva il titolare dal catalogo. In una lavorazione già nel catalogo si aggiungono solo i campi nuovi; nome e famiglia non cambiano.'],
    ['Famiglia: per le lavorazioni nuove (vuota = il codice). Documento finale: corretta posa, D.M. 37/08, rapporto, attestato, DoP, progetto o vuoto.'],
    ['Codice campo: vuoto = ricavato dall’etichetta. Un codice già nella lavorazione non si cambia (si corregge dal catalogo).'],
    ['Tipo: numero, menu, sì/no, testo, foto. Valori menu: separati da punto e virgola (;), solo per il tipo menu.'],
    ['Minimo e Massimo: solo per il tipo numero, con la virgola (es. 0,5). Chi lo compila: base (venditore) o ingegnere.'],
    ['Normativo, Serve al prezzo (obbligatorio, decisione D2), Per posizione: sì oppure no (vuoto = no).'],
    ['Uso a valle: OBBLIGATORIO, quale calcolo o documento usa il campo. Ordine: facoltativo (vuoto = dopo gli altri, di 10 in 10).'],
    ['Se una riga ha un errore non si importa nulla: l’anteprima dice riga e motivo.']];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(righe);
  ws['!cols'] = TESTATA_MODELLO_LAV.map(function(t, i) { return { wch: [16, 22, 18, 26, 22, 28, 9, 7, 44, 8, 8, 13, 10, 13, 12, 44, 7][i] || 14 }; });
  XLSX.utils.book_append_sheet(wb, ws, 'Campi');
  const wi = XLSX.utils.aoa_to_sheet(istruzioni);
  wi['!cols'] = [{ wch: 140 }];
  XLSX.utils.book_append_sheet(wb, wi, 'Istruzioni');
  XLSX.writeFile(wb, 'Modello_catalogo_lavorazioni.xlsx');
}

// ── F15.21 — PROPOSTE DI NUOVI CAMPI (sql/91) ──────────────────────────
// L'ingegnere propone un campo nuovo per una scheda ("➕ Proponi un campo"
// nel catalogo, sotto "➕ Aggiungi campo", e nella scheda del motore che
// apre lui); il titolare (informatico compreso) lo approva, correggendo se
// vuole etichetta, codice, tipo, unità, risposte del menu, uso a valle e chi
// lo compila, oppure lo rifiuta con un motivo. Approvato, il campo entra nel
// catalogo FACOLTATIVO (non serve al prezzo: non ferma nessun invio), non
// normativo, non per posizione, IN FONDO alla lavorazione: lo decide il
// database (approva_proposta_campo). Le schede aperte dopo lo mostrano.
// Finestre m-proposta-campo (id pcl-: proposta e decisione) e
// m-proposte-campi (id pce-: elenco). Riga del titolare "📝 Proposte di campi
// da valutare" in Cosa tocca a me e conteggio nel riquadro di Impostazioni.
// Nessun bottone di prima cambia ("➕ Aggiungi campo" resta com'era).
// Senza sql/91: nessun bottone, nessuna riga, nessun errore (una chiamata RPC
// 404, solo per titolare e ingegnere).

const PROPOSTE_CAMPI = { disponibili: null, inVerifica: null, elenco: [], letto: 0, modo: '', id: null, lavorazione: '', valori: [], soloAttesa: true };
const TIPI_PROPOSTA_CAMPO = TIPI_CAMPO_LAV.filter(function(t) { return t.value !== 'foto'; });
const STATI_PROPOSTA_CAMPO = { in_attesa: '⏳ In attesa del titolare', approvata: '✅ Approvata', rifiutata: '✖ Rifiutata' };

async function verificaProposteCampiDisponibili() {
  if (ROLE !== 'titolare' && ROLE !== 'ingegnere') return false;
  if (PROPOSTE_CAMPI.disponibili !== null) return PROPOSTE_CAMPI.disponibili;
  if (PROPOSTE_CAMPI.inVerifica) return PROPOSTE_CAMPI.inVerifica;
  PROPOSTE_CAMPI.inVerifica = (async function() {
    try {
      const { data, error } = await db.rpc('proposte_campi_attive');
      PROPOSTE_CAMPI.disponibili = !error && data === true;
    } catch (e) {
      PROPOSTE_CAMPI.disponibili = false;
    } finally {
      PROPOSTE_CAMPI.inVerifica = null;
    }
    return PROPOSTE_CAMPI.disponibili;
  })();
  return PROPOSTE_CAMPI.inVerifica;
}

async function caricaProposteCampi(forza) {
  if (!(await verificaProposteCampiDisponibili())) return [];
  if (!forza && PROPOSTE_CAMPI.letto && Date.now() - PROPOSTE_CAMPI.letto < 30000) return PROPOSTE_CAMPI.elenco;
  const { data, error } = await db.from('lavorazioni_proposte_campi').select('*')
    .order('proposta_il', { ascending: false }).limit(300);
  if (error) { console.warn('Proposte di campi:', error.message); return PROPOSTE_CAMPI.elenco; }
  PROPOSTE_CAMPI.elenco = data || [];
  PROPOSTE_CAMPI.letto = Date.now();
  return PROPOSTE_CAMPI.elenco;
}

function quandoPropostaCampo(t) {
  if (!t) return '';
  try { return new Date(t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return t; }
}

function nomeLavorazionePropostaCampo(id) {
  const l = (CATALOGO_LAV.lavorazioni || []).find(function(x) { return Number(x.id) === Number(id); });
  return l ? l.nome : 'Lavorazione ' + id;
}

function etichettaTipoPropostaCampo(tipo) {
  return (TIPI_CAMPO_LAV.find(function(t) { return t.value === tipo; }) || {}).label || tipo;
}

function htmlRigaPropostaCampo(p, conLavorazione) {
  const titolare = ROLE === 'titolare';
  const valori = p.tipo === 'menu' && Array.isArray(p.valori_ammessi)
    ? '<div style="font-size:12px;margin-top:2px">' + p.valori_ammessi.map(function(x) { return '<span style="display:inline-block;margin:1px 3px 1px 0;padding:1px 7px;border:1px solid var(--bo);border-radius:10px;font-size:11px">' + esc(x.etichetta) + '</span>'; }).join('') + '</div>'
    : '';
  const esito = p.stato === 'approvata'
    ? 'Approvata da ' + esc(p.decisa_da_nome || '') + ' il ' + esc(quandoPropostaCampo(p.decisa_il)) + ' · campo <code>' + esc(p.codice_campo || '') + '</code>'
    : p.stato === 'rifiutata'
      ? 'Rifiutata da ' + esc(p.decisa_da_nome || '') + ' il ' + esc(quandoPropostaCampo(p.decisa_il)) + ': <b>' + esc(p.motivo_rifiuto || '') + '</b>'
      : '';
  return '<div class="pcl-riga" data-proposta="' + Number(p.id) + '" style="padding:6px 0;border-bottom:1px solid var(--bo);font-size:13px">' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between">' +
      '<div style="flex:1 1 220px"><b>' + esc(p.etichetta) + '</b> <span style="font-size:11px;color:var(--m)">' +
        (conLavorazione ? esc(nomeLavorazionePropostaCampo(p.lavorazione_id)) + ' · ' : '') + esc(etichettaTipoPropostaCampo(p.tipo)) +
        (p.unita ? ' · ' + esc(p.unita) : '') + ' · ' + esc(STATI_PROPOSTA_CAMPO[p.stato] || p.stato) + '</span></div>' +
      (titolare && p.stato === 'in_attesa'
        ? '<button class="btn sm p" type="button" onclick="apriPropostaCampo(\'decidi\',' + Number(p.id) + ')">✅ Approva o rifiuta</button>' : '') +
    '</div>' + valori +
    '<div style="font-size:11px;color:var(--m);margin-top:2px">Uso a valle: ' + esc(p.uso_a_valle || '') + '</div>' +
    (p.nota ? '<div style="font-size:11px;color:var(--m)">Perché: ' + esc(p.nota) + '</div>' : '') +
    '<div style="font-size:11px;color:var(--m)">Proposta da ' + esc(p.proposta_da_nome || '') + ' il ' + esc(quandoPropostaCampo(p.proposta_il)) + '</div>' +
    (esito ? '<div style="font-size:12px;margin-top:2px">' + esito + '</div>' : '') +
  '</div>';
}

// Riquadro nel catalogo, sotto "➕ Aggiungi campo" (la riga di prima non cambia)
async function disegnaProposteCatalogoLav() {
  const vecchio = ge('cl-proposte');
  if (vecchio) vecchio.remove();
  if (!(await verificaProposteCampiDisponibili())) return;
  const l = lavorazioneCatalogo(CATALOGO_LAV.aperta);
  const campi = ge('cl-campi');
  if (!l || !campi || ge('cl-proposte')) return;
  const elenco = (await caricaProposteCampi()).filter(function(p) { return Number(p.lavorazione_id) === Number(l.id); });
  if (ge('cl-proposte') || CATALOGO_LAV.aperta !== l.codice) return;
  const titolare = ROLE === 'titolare';
  const inAttesa = elenco.filter(function(p) { return p.stato === 'in_attesa'; });
  const tutte = PROPOSTE_CAMPI.elenco.filter(function(p) { return p.stato === 'in_attesa'; }).length;
  const mostra = titolare ? inAttesa : elenco.slice(0, 10);
  let dopo = campi.nextElementSibling;
  const box = document.createElement('div');
  box.id = 'cl-proposte';
  box.style.cssText = 'margin-top:8px';
  box.innerHTML =
    (titolare ? '' : '<button class="btn sm" type="button" id="cl-proponi-campo" onclick="apriPropostaCampo(\'proponi\', null, CATALOGO_LAV.aperta)">➕ Proponi un campo</button>' +
      '<div style="font-size:11px;color:var(--m);margin-top:3px">La proposta va al titolare: se la approva il campo entra facoltativo, in fondo alla scheda.</div>') +
    (mostra.length || (titolare && tutte)
      ? '<div style="font-size:12px;font-weight:600;margin-top:8px">📝 ' + (titolare ? 'Proposte di campi da valutare per questa lavorazione (' + inAttesa.length + ')' : 'Proposte per questa lavorazione') + '</div>' +
        mostra.map(function(p) { return htmlRigaPropostaCampo(p, false); }).join('') +
        '<button class="btn sm" type="button" style="margin-top:6px" onclick="apriProposteCampi()">📝 Tutte le proposte' + (tutte ? ' (' + tutte + ' in attesa)' : '') + '</button>'
      : '');
  if (dopo && /apriCampoLavorazione\(null\)/.test(dopo.getAttribute('onclick') || '')) dopo.insertAdjacentElement('afterend', box);
  else campi.insertAdjacentElement('afterend', box);
}

if (typeof disegnaCatalogoLavorazioni === 'function') {
  const disegnaCatalogoLavorazioniSenzaProposte = disegnaCatalogoLavorazioni;
  // eslint-disable-next-line no-global-assign
  disegnaCatalogoLavorazioni = function() {
    const esito = disegnaCatalogoLavorazioniSenzaProposte.apply(this, arguments);
    disegnaProposteCatalogoLav().catch(function(e) { console.warn('Proposte di campi:', e); });
    return esito;
  };
}

// Riquadro del titolare in Impostazioni: quante proposte aspettano
if (typeof mostraCatalogoLavorazioniImpostazioni === 'function') {
  const mostraCatalogoLavorazioniImpostazioniSenzaProposte = mostraCatalogoLavorazioniImpostazioni;
  // eslint-disable-next-line no-global-assign
  mostraCatalogoLavorazioniImpostazioni = async function() {
    const esito = await mostraCatalogoLavorazioniImpostazioniSenzaProposte.apply(this, arguments);
    try {
      const stato = ge('si-catalogo-lav-stato');
      const vecchia = ge('si-proposte-campi');
      if (vecchia) vecchia.remove();
      if (ROLE !== 'titolare' || !stato || !CATALOGO_LAV.disponibili || !(await verificaProposteCampiDisponibili())) return esito;
      const n = (await caricaProposteCampi(true)).filter(function(p) { return p.stato === 'in_attesa'; }).length;
      if (ge('si-proposte-campi')) return esito;
      stato.insertAdjacentHTML('afterend', '<div id="si-proposte-campi" style="font-size:13px;margin:0 0 8px">📝 ' +
        (n ? '<b>' + n + '</b> ' + (n === 1 ? 'proposta' : 'proposte') + ' di campi da valutare' : 'Nessuna proposta di campi da valutare') +
        ' <button class="btn sm" type="button" onclick="apriProposteCampi()">📝 Proposte di campi</button></div>');
    } catch (e) { console.warn('Proposte di campi:', e); }
    return esito;
  };
}

// ── Elenco delle proposte ───────────────────────────────────────────
async function apriProposteCampi() {
  if (!(await verificaProposteCampiDisponibili())) { toast('Le proposte di campi non sono ancora attive (serve sql/91)', 'err'); return; }
  await caricaCatalogoLavorazioni();
  await caricaProposteCampi(true);
  PROPOSTE_CAMPI.soloAttesa = PROPOSTE_CAMPI.elenco.some(function(p) { return p.stato === 'in_attesa'; });
  disegnaProposteCampi();
  openM('m-proposte-campi');
}

function filtraProposteCampi(soloAttesa) {
  PROPOSTE_CAMPI.soloAttesa = !!soloAttesa;
  disegnaProposteCampi();
}

function disegnaProposteCampi() {
  const box = ge('pce-contenuto');
  if (!box) return;
  const tutte = PROPOSTE_CAMPI.elenco;
  const attesa = tutte.filter(function(p) { return p.stato === 'in_attesa'; });
  const elenco = PROPOSTE_CAMPI.soloAttesa ? attesa : tutte;
  box.innerHTML =
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">' +
      '<button class="btn sm' + (PROPOSTE_CAMPI.soloAttesa ? ' p' : '') + '" type="button" onclick="filtraProposteCampi(true)">⏳ Da valutare (' + attesa.length + ')</button>' +
      '<button class="btn sm' + (PROPOSTE_CAMPI.soloAttesa ? '' : ' p') + '" type="button" onclick="filtraProposteCampi(false)">Tutte (' + tutte.length + ')</button>' +
    '</div>' +
    (elenco.length ? elenco.map(function(p) { return htmlRigaPropostaCampo(p, true); }).join('')
      : '<div style="font-size:13px;color:var(--m)">' + (PROPOSTE_CAMPI.soloAttesa ? 'Nessuna proposta da valutare 🎉' : 'Nessuna proposta.') + '</div>');
}

// ── Finestra della proposta: "proponi" (ingegnere) o "decidi" (titolare) ──
async function apriPropostaCampo(modo, id, codiceLav) {
  if (!(await verificaProposteCampiDisponibili())) { toast('Le proposte di campi non sono ancora attive (serve sql/91)', 'err'); return; }
  if (modo === 'decidi' && ROLE !== 'titolare') { toast('Le proposte le approva il titolare', 'err'); return; }
  await caricaCatalogoLavorazioni();
  const p = modo === 'decidi' ? (await caricaProposteCampi()).find(function(x) { return Number(x.id) === Number(id); }) : null;
  if (modo === 'decidi' && (!p || p.stato !== 'in_attesa')) { toast('Proposta non trovata o già decisa', 'err'); return; }
  PROPOSTE_CAMPI.modo = modo;
  PROPOSTE_CAMPI.id = p ? p.id : null;
  const lav = p ? (CATALOGO_LAV.lavorazioni || []).find(function(x) { return Number(x.id) === Number(p.lavorazione_id); })
                : lavorazioneCatalogo(codiceLav || CATALOGO_LAV.aperta || '');
  PROPOSTE_CAMPI.lavorazione = lav ? lav.codice : '';
  PROPOSTE_CAMPI.valori = p && Array.isArray(p.valori_ammessi) ? p.valori_ammessi.map(function(x) { return { valore: x.valore, etichetta: x.etichetta }; }) : [];
  const decidi = modo === 'decidi';
  ge('pcl-titolo').textContent = decidi ? '📝 Proposta di campo: approva o rifiuta' : '➕ Proponi un campo';
  ge('pcl-info').innerHTML = decidi
    ? 'Proposta da <b>' + esc(p.proposta_da_nome || '') + '</b> il ' + esc(quandoPropostaCampo(p.proposta_il)) + (p.nota ? '<br>Perché: ' + esc(p.nota) : '') +
      '<br>Puoi correggere tutto prima di approvare. Il campo entra <b>facoltativo</b> (non ferma nessun invio), in fondo alla scheda.'
    : 'La proposta arriva al titolare. Se la approva il campo entra <b>facoltativo</b> (non ferma nessun invio), in fondo alla scheda.';
  ge('pcl-lavorazione').innerHTML = (CATALOGO_LAV.lavorazioni || []).map(function(l) {
    return '<option value="' + esc(l.codice) + '"' + (l.codice === PROPOSTE_CAMPI.lavorazione ? ' selected' : '') + '>' + esc(l.nome) + (l.attiva ? '' : ' (spenta)') + '</option>';
  }).join('');
  ge('pcl-lavorazione').disabled = decidi;
  ge('pcl-etichetta').value = p ? p.etichetta : '';
  ge('pcl-tipo').innerHTML = opzioniHtmlLav(TIPI_PROPOSTA_CAMPO, p ? p.tipo : 'menu');
  ge('pcl-unita').value = p && p.unita ? p.unita : '';
  ge('pcl-uso').value = p ? p.uso_a_valle : '';
  ge('pcl-nota').value = p && p.nota ? p.nota : '';
  ge('pcl-box-nota').style.display = decidi ? 'none' : '';
  ge('pcl-box-decidi').style.display = decidi ? '' : 'none';
  ge('pcl-codice').value = p ? codiceDaTestoLav(p.etichetta) : '';
  ge('pcl-codice').dataset.toccato = '';
  ge('pcl-livello').value = 'base';
  ge('pcl-motivo').value = '';
  ge('pcl-nuovo-valore').value = '';
  ge('pcl-invia').style.display = decidi ? 'none' : '';
  ge('pcl-approva').style.display = decidi ? '' : 'none';
  ge('pcl-rifiuta').style.display = decidi ? '' : 'none';
  aggiornaTipoPropostaCampo();
  disegnaValoriPropostaCampo();
  openM('m-proposta-campo');
  setTimeout(function() { ge('pcl-etichetta').focus(); }, 50);
}

function codicePropostaDaEtichetta() {
  const cod = ge('pcl-codice');
  if (cod && !cod.dataset.toccato) cod.value = codiceDaTestoLav(v('pcl-etichetta'));
}

function aggiornaTipoPropostaCampo() {
  ge('pcl-box-menu').style.display = v('pcl-tipo') === 'menu' ? '' : 'none';
}

function disegnaValoriPropostaCampo() {
  const box = ge('pcl-valori');
  const valori = PROPOSTE_CAMPI.valori;
  box.innerHTML = valori.length
    ? valori.map(function(x, i) {
        return '<div style="display:flex;gap:6px;align-items:center;padding:3px 0">' +
          '<input id="pcl-val-' + i + '" maxlength="120" value="' + esc(x.etichetta) + '" style="flex:1 1 auto" oninput="PROPOSTE_CAMPI.valori[' + i + '].etichetta=this.value">' +
          '<button class="btn sm" type="button" title="Togli" onclick="togliValorePropostaCampo(' + i + ')">✖</button>' +
        '</div>';
      }).join('')
    : '<div style="font-size:12px;color:var(--m)">Nessuna risposta: aggiungine almeno una.</div>';
}

function aggiungiValorePropostaCampo() {
  const etichetta = v('pcl-nuovo-valore').trim();
  if (!etichetta) { toast('Scrivi la risposta da aggiungere', 'err'); return; }
  const valori = PROPOSTE_CAMPI.valori;
  if (valori.some(function(x) { return String(x.etichetta).trim().toLowerCase() === etichetta.toLowerCase(); })) { toast('Risposta già nel menu', 'err'); return; }
  let codice = codiceDaTestoLav(etichetta) || 'valore';
  const base = codice;
  for (let n = 2; valori.some(function(x) { return x.valore === codice; }); n++) codice = base.slice(0, 36) + '_' + n;
  valori.push({ valore: codice, etichetta: etichetta });
  ge('pcl-nuovo-valore').value = '';
  disegnaValoriPropostaCampo();
  ge('pcl-nuovo-valore').focus();
}

function togliValorePropostaCampo(i) {
  PROPOSTE_CAMPI.valori.splice(i, 1);
  disegnaValoriPropostaCampo();
}

// Dati della finestra controllati come il database (null = c'è un errore)
function datiFinestraPropostaCampo() {
  const etichetta = v('pcl-etichetta').trim();
  const tipo = v('pcl-tipo');
  const uso = v('pcl-uso').trim();
  if (!etichetta) { toast('Scrivi la domanda del campo', 'err'); ge('pcl-etichetta').focus(); return null; }
  if (!TIPI_PROPOSTA_CAMPO.some(function(t) { return t.value === tipo; })) { toast('Scegli il tipo del campo', 'err'); return null; }
  if (uso.length < 3) { toast('Scrivi l’uso a valle: quale calcolo o documento usa il campo', 'err'); ge('pcl-uso').focus(); return null; }
  let valori = null;
  if (tipo === 'menu') {
    valori = PROPOSTE_CAMPI.valori.map(function(x) { return { valore: x.valore, etichetta: String(x.etichetta || '').trim() }; });
    if (!valori.length) { toast('Un menu ha almeno una risposta possibile', 'err'); ge('pcl-nuovo-valore').focus(); return null; }
    if (valori.some(function(x) { return !x.etichetta; })) { toast('Ogni risposta del menu ha un testo', 'err'); return null; }
    const visti = {};
    for (const x of valori) {
      const k = x.etichetta.toLowerCase();
      if (visti[k]) { toast('La risposta "' + x.etichetta + '" è ripetuta', 'err'); return null; }
      visti[k] = true;
    }
  }
  return { etichetta: etichetta, tipo: tipo, unita: v('pcl-unita').trim() || null, valori: valori, uso: uso };
}

function errorePropostaCampo(error) {
  const m = String((error && error.message) || error || '');
  if (error && error.code === '42501') return m;
  return erroreCatalogoLav(error);
}

async function inviaPropostaCampo() {
  const d = datiFinestraPropostaCampo();
  if (!d) return;
  const codiceLav = v('pcl-lavorazione');
  const lav = lavorazioneCatalogo(codiceLav);
  if (!lav) { toast('Scegli la lavorazione', 'err'); return; }
  if ((lav.lavorazioni_campi || []).some(function(c) { return c.attivo !== false && String(c.etichetta).trim().toLowerCase() === d.etichetta.toLowerCase(); }) &&
      !confirm('Nella scheda c’è già un campo "' + d.etichetta + '". Proporlo lo stesso?')) return;
  const { error } = await db.rpc('proponi_campo_lavorazione', {
    p_lavorazione: codiceLav, p_etichetta: d.etichetta, p_tipo: d.tipo, p_unita: d.unita,
    p_valori: d.valori, p_uso: d.uso, p_nota: v('pcl-nota').trim() || null
  });
  if (error) { toast('Proposta non inviata: ' + errorePropostaCampo(error), 'err'); return; }
  closeM('m-proposta-campo');
  toast('Proposta inviata al titolare');
  await dopoDecisionePropostaCampo();
}

async function approvaPropostaCampo() {
  const d = datiFinestraPropostaCampo();
  if (!d) return;
  const codice = v('pcl-codice').trim();
  if (!/^[a-z][a-z0-9_]{0,40}$/.test(codice)) { toast('Codice del campo: lettere minuscole, numeri e _ (es. tipo_specchiatura)', 'err'); ge('pcl-codice').focus(); return; }
  if (CODICI_RISERVATI_LAV.indexOf(codice) >= 0) { toast('Il codice "' + codice + '" lo usa già il motore delle schede: scegline un altro', 'err'); return; }
  const lav = lavorazioneCatalogo(PROPOSTE_CAMPI.lavorazione);
  if (lav && (lav.lavorazioni_campi || []).some(function(c) { return c.codice === codice; })) { toast('Il codice "' + codice + '" c’è già in questa lavorazione: scegline un altro', 'err'); ge('pcl-codice').focus(); return; }
  const { error } = await db.rpc('approva_proposta_campo', {
    p_id: PROPOSTE_CAMPI.id, p_etichetta: d.etichetta, p_codice: codice, p_tipo: d.tipo, p_unita: d.unita,
    p_valori: d.valori, p_uso: d.uso, p_livello: v('pcl-livello') || 'base'
  });
  if (error) { toast('Non approvata: ' + errorePropostaCampo(error), 'err'); return; }
  closeM('m-proposta-campo');
  toast('Campo aggiunto' + (lav && !lav.attiva ? ' (la lavorazione è spenta: si vede quando la attivi)' : ': compare nelle schede aperte da adesso'));
  await dopoDecisionePropostaCampo(true);
}

async function rifiutaPropostaCampo() {
  const motivo = v('pcl-motivo').trim();
  if (motivo.length < 3) { toast('Scrivi il motivo del rifiuto', 'err'); ge('pcl-motivo').focus(); return; }
  if (!confirm('Rifiutare la proposta "' + v('pcl-etichetta').trim() + '"?')) return;
  const { error } = await db.rpc('rifiuta_proposta_campo', { p_id: PROPOSTE_CAMPI.id, p_motivo: motivo });
  if (error) { toast('Non rifiutata: ' + errorePropostaCampo(error), 'err'); return; }
  closeM('m-proposta-campo');
  toast('Proposta rifiutata');
  await dopoDecisionePropostaCampo();
}

async function dopoDecisionePropostaCampo(catalogoCambiato) {
  await caricaProposteCampi(true);
  if (catalogoCambiato) await caricaCatalogoLavorazioni(true);
  if (ge('m-catalogo-lavorazioni') && ge('m-catalogo-lavorazioni').classList.contains('on')) disegnaCatalogoLavorazioni();
  if (ge('m-proposte-campi') && ge('m-proposte-campi').classList.contains('on')) disegnaProposteCampi();
  if (ROLE === 'titolare') mostraCatalogoLavorazioniImpostazioni().catch(function() {});
  if (typeof aggiornaToccaAMePiuTardi === 'function') aggiornaToccaAMePiuTardi();
}

// Cosa tocca a me del titolare
if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'proposte-campi-titolare', ruoli: ['titolare'], icona: '📝',
    titolo: 'Proposte di campi da valutare',
    vai: function() { apriProposteCampi(); },
    conta: async function() {
      if (!(await verificaProposteCampiDisponibili())) return null;
      const n = await numeroTAM(contaTAM('lavorazioni_proposte_campi').eq('stato', 'in_attesa'), 'proposte di campi');
      if (n === null) return null;
      return { n: n, nota: 'campi nuovi delle schede proposti dall’ingegnere: approva o rifiuta' };
    }
  });
}

// Link "➕ Proponi un campo" nella scheda del motore aperta dall'ingegnere.
// js/56 (il motore) è caricato dopo questo file: si aggancia a sito pronto.
function htmlLinkProponiCampoMotore() {
  return '<div id="msm-proponi-campo" style="text-align:right;margin:6px 0 0;font-size:12px">' +
    '<a href="#" onclick="event.preventDefault();apriPropostaCampo(\'proponi\', null, MOTORE_SCHEDE.famiglia)">➕ Proponi un campo</a>' +
    ' <span style="color:var(--m)">(lo valuta il titolare)</span></div>';
}

document.addEventListener('DOMContentLoaded', function() {
  if (typeof disegnaSchedaMotore !== 'function') return;
  const disegnaSchedaMotoreSenzaProposte = disegnaSchedaMotore;
  // eslint-disable-next-line no-global-assign
  disegnaSchedaMotore = async function() {
    const esito = await disegnaSchedaMotoreSenzaProposte.apply(this, arguments);
    try {
      if (ROLE === 'ingegnere' && ge('msm-motore') && !ge('msm-proponi-campo') && (await verificaProposteCampiDisponibili())) {
        const campi = ge('msm-campi');
        if (campi && !ge('msm-proponi-campo')) campi.insertAdjacentHTML('afterend', htmlLinkProponiCampoMotore());
      }
    } catch (e) { console.warn('Proposte di campi:', e); }
    return esito;
  };
});
