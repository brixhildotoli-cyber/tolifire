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
  const tipo = (TIPI_CAMPO_LAV.find(function(t) { return t.value === c.tipo; }) || {}).label || c.tipo;
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
  ge('clc-tipo').innerHTML = opzioniHtmlLav(TIPI_CAMPO_LAV, c ? c.tipo : 'menu');
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

// Bottone "📚 Catalogo lavorazioni" nella pagina Verifiche tecniche
// (ingegnere e titolare): compare solo con sql/75
async function mostraBottoneCatalogoVerifiche() {
  const btn = ge('vt-catalogo-btn');
  if (!btn) return;
  btn.style.display = 'none';
  if (!puoModificareCatalogoLav()) return;
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
