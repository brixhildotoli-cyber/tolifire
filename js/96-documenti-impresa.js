// ── F19.8 — DOCUMENTI DI TOLI FIRE (sql/159) ─────────────────────────────
// Decisione di Erika del 16/11: SOLO i documenti dell'impresa (niente
// fascicolo PDF né "chi rilascia la dichiarazione").
//   - Team e subappalti: bottone "🏢 Documenti di TOLI Fire" (titolare,
//     segreteria, capo tecnico) → la stessa scheda documenti di js/30 con
//     intestatario 'impresa' (tipo scheda 'impresa', id 'toli').
//   - Nuovo e rinnovo: file in impresa/toli/ e RPC registra_documento_impresa;
//     correzione ed eliminazione con le RPC di sql/32 (come oggi).
//   - Menu del tipo: tipi dell'impresa e "Altro" (nomine RSPP, RLS, medico,
//     abilitazione D.M. 37/08, white list aggiunti anche senza sql/152).
//   - Scadenze: i documenti dell'impresa entrano nella tab Scadenze e negli
//     avvisi della dashboard come "🏢 TOLI Fire" (preavviso dei documenti).
// Senza sql/159 il bottone non compare e nulla cambia.

const DOC_IMPRESA = { attivo: null, nome: 'TOLI Fire' };
const TIPI_IMPRESA_NUOVI = [
  { id: 'nomina_rspp', per: 'impresa', nome: 'Nomina RSPP', obbligo_legge: true },
  { id: 'nomina_rls', per: 'impresa', nome: 'Nomina o elezione RLS', obbligo_legge: true },
  { id: 'nomina_medico', per: 'impresa', nome: 'Nomina del medico competente', obbligo_legge: true },
  { id: 'abilitazione_dm37', per: 'impresa', nome: 'Abilitazione D.M. 37/08 (lettere della visura)', obbligo_legge: true },
  { id: 'white_list', per: 'impresa', mesi: 12, nome: 'Iscrizione white list della Prefettura' }
];

function assicuraTipiImpresa() {
  if (typeof TIPI_DOCUMENTO_TEAM_SUBAPPALTI === 'undefined') return;
  TIPI_IMPRESA_NUOVI.forEach(function(t) {
    if (!TIPI_DOCUMENTO_TEAM_SUBAPPALTI.some(function(x) { return x.id === t.id; })) {
      const i = TIPI_DOCUMENTO_TEAM_SUBAPPALTI.findIndex(function(x) { return x.per !== 'impresa'; });
      TIPI_DOCUMENTO_TEAM_SUBAPPALTI.splice(i < 0 ? TIPI_DOCUMENTO_TEAM_SUBAPPALTI.length : i, 0, Object.assign({}, t));
    }
  });
}
assicuraTipiImpresa();
if (typeof caricaCatalogoCorsi === 'function') {
  const caricaCatalogoCorsiSenzaImpresa = caricaCatalogoCorsi;
  // eslint-disable-next-line no-global-assign
  caricaCatalogoCorsi = async function() {
    const esito = await caricaCatalogoCorsiSenzaImpresa.apply(this, arguments);
    assicuraTipiImpresa();
    return esito;
  };
}

async function verificaDocumentiImpresaDisponibili() {
  if (DOC_IMPRESA.attivo !== null) return DOC_IMPRESA.attivo;
  try {
    const { data, error } = await db.rpc('documenti_impresa_attivi');
    DOC_IMPRESA.attivo = !error && data === true;
  } catch (e) { DOC_IMPRESA.attivo = false; }
  return DOC_IMPRESA.attivo;
}

// ── Bottone nella pagina Team e subappalti ──────────────────────────
async function mostraBottoneDocumentiImpresa() {
  const nuovo = ge('ts-btn-nuovo-sub');
  if (!nuovo || ge('ts-btn-impresa')) return;
  if (!['titolare', 'segreteria', 'capo_tecnico'].includes(ROLE) || !(await verificaDocumentiImpresaDisponibili())) return;
  nuovo.insertAdjacentHTML('beforebegin', '<button class="btn" id="ts-btn-impresa" style="margin-right:6px" onclick="openSchedaDocumenti(\'impresa\', \'toli\')">🏢 Documenti di ' + esc(DOC_IMPRESA.nome) + '</button>');
}

// Scadenze: i documenti dell'impresa con "🏢 TOLI Fire"
if (typeof documentiDaSegnalareTS === 'function') {
  const documentiDaSegnalareSenzaImpresa = documentiDaSegnalareTS;
  // eslint-disable-next-line no-global-assign
  documentiDaSegnalareTS = function(documenti, utenti, subappaltatori) {
    const eImpresa = function(d) { return d.impresa || (!d.utente_id && !d.subappaltatore_id); };
    const dell = (documenti || []).filter(eImpresa);
    const altri = (documenti || []).filter(function(d) { return !eImpresa(d); });
    const righe = documentiDaSegnalareSenzaImpresa.call(this, altri, utenti, subappaltatori);
    dell.forEach(function(d) {
      if (d.sostituito_da) return;
      const c = statoDocumentoTeamSubappalti(d).codice;
      if (c === 'scaduto' || c === 'in_scadenza') righe.push({ documento: d, intestatario: { tipo: 'impresa', id: 'toli', nome: '🏢 ' + DOC_IMPRESA.nome } });
    });
    return righe.sort(function(a, b) { return String(a.documento.data_scadenza).localeCompare(String(b.documento.data_scadenza)); });
  };
}

if (typeof loadTeamSubappalti === 'function') {
  const loadTeamSubappaltiSenzaImpresa = loadTeamSubappalti;
  // eslint-disable-next-line no-global-assign
  loadTeamSubappalti = async function() {
    const esito = await loadTeamSubappaltiSenzaImpresa.apply(this, arguments);
    try { await mostraBottoneDocumentiImpresa(); } catch (e) { console.warn('Documenti dell\'impresa:', e); }
    return esito;
  };
}

// ── Scheda documenti dell'impresa ───────────────────────────────────
if (typeof caricaSchedaDocumenti === 'function') {
  const caricaSchedaDocumentiSenzaImpresa = caricaSchedaDocumenti;
  // eslint-disable-next-line no-global-assign
  caricaSchedaDocumenti = async function() {
    const scheda = schedaDocumentiAperta;
    if (!scheda || scheda.tipo !== 'impresa') return caricaSchedaDocumentiSenzaImpresa.apply(this, arguments);
    const anagrafica = ge('sdoc-anagrafica');
    const box = ge('sdoc-documenti');
    if (!anagrafica || !box) return;
    anagrafica.innerHTML = '';
    box.innerHTML = '<div class="load">Caricamento...</div>';
    ge('sdoc-titolo').textContent = '🏢 ' + DOC_IMPRESA.nome;
    ge('sdoc-sottotitolo').textContent = 'Documenti dell\'impresa (DURC, visura, nomine, D.M. 37/08, white list...)';
    if (!(await verificaDocumentiImpresaDisponibili())) { box.innerHTML = '<div class="al2 i">I documenti dell\'impresa si attivano con l\'aggiornamento del database.</div>'; return; }
    scheda.dati = { ragione_sociale: DOC_IMPRESA.nome };
    const { data, error } = await db.from('documenti_team_subappalti').select(COLONNE_DOCUMENTO_TS + ', impresa').eq('impresa', true)
      .order('data_scadenza', { ascending: true, nullsFirst: false });
    if (schedaDocumentiAperta !== scheda) return;
    if (error) { box.innerHTML = '<div class="card"><div class="al2 e">Errore caricamento documenti: ' + esc(error.message) + '</div></div>'; return; }
    documentiSchedaAperta = data || [];
    box.innerHTML = htmlDocumentiScheda(scheda, documentiSchedaAperta);
  };
}

if (typeof apriDocumentoTS === 'function') {
  const apriDocumentoTSSenzaImpresa = apriDocumentoTS;
  // eslint-disable-next-line no-global-assign
  apriDocumentoTS = function(modo, documentoId) {
    const esito = apriDocumentoTSSenzaImpresa.apply(this, arguments);
    const scheda = schedaDocumentiAperta;
    if (scheda && scheda.tipo === 'impresa') {
      const d = documentoId ? documentiSchedaAperta.find(function(x) { return x.id === documentoId; }) : null;
      const scelto = d ? d.tipo : '';
      const tipi = TIPI_DOCUMENTO_TEAM_SUBAPPALTI.filter(function(t) { return (t.per === 'impresa' || t.per === 'tutti') && (t.attivo !== false || t.id === scelto); });
      ge('mdts-tipo').innerHTML = '<option value="">— Scegli il tipo —</option>' + tipi.map(function(t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === scelto ? ' selected' : '') + '>' + esc(t.nome) + (t.obbligo_legge ? ' ⚖️' : '') + '</option>';
      }).join('') + (scelto && !tipi.some(function(t) { return t.id === scelto; }) ? '<option value="' + esc(scelto) + '" selected>' + esc(scelto) + '</option>' : '');
      ge('mdts-intestatario').textContent = '🏢 ' + DOC_IMPRESA.nome;
      ge('mdts-riferito-box').style.display = 'none';
      aggiornaTipoDocumentoTS();
    }
    return esito;
  };
}

if (typeof salvaDocumentoTS === 'function') {
  const salvaDocumentoTSSenzaImpresa = salvaDocumentoTS;
  // eslint-disable-next-line no-global-assign
  salvaDocumentoTS = async function() {
    const scheda = schedaDocumentiAperta;
    const modo = v('mdts-modo');
    if (!scheda || scheda.tipo !== 'impresa' || modo === 'correggi') return salvaDocumentoTSSenzaImpresa.apply(this, arguments);
    const documentoId = v('mdts-documento-id') || null;
    const tipo = v('mdts-tipo');
    const descrizione = (v('mdts-descrizione') || '').trim();
    const rilascio = v('mdts-rilascio') || null;
    const scadenza = v('mdts-scadenza') || null;
    const nota = (v('mdts-nota') || '').trim();
    const file = (ge('mdts-file')?.files || [])[0] || null;
    if (!tipo) { toast('Scegli il tipo di documento', 'err'); return; }
    if (tipo === 'altro' && !descrizione) { toast('Scrivi di che documento si tratta', 'err'); return; }
    if (rilascio && rilascio > dataLocaleISO()) { toast('La data di rilascio non può essere nel futuro', 'err'); return; }
    if (rilascio && scadenza && scadenza < rilascio) { toast('La scadenza non può essere prima del rilascio', 'err'); return; }
    if (!scadenza && !confirm('Nessuna data di scadenza: il documento sarà "senza scadenza" e non darà avvisi. Continuare?')) return;
    if (file && file.size > LIMITE_FILE_TEAM_SUBAPPALTI) { toast('File oltre 50 MB: ' + file.name, 'err'); return; }
    const bottone = ge('mdts-salva');
    if (bottone) { bottone.disabled = true; bottone.textContent = '⏳ Salvataggio...'; }
    const fine = function() { if (bottone) { bottone.disabled = false; bottone.textContent = 'Salva'; } };
    let path = null;
    if (file) {
      path = 'impresa/toli/' + Date.now() + '_' + nomeFileSicuroCommessa(file.name);
      const caricamento = await db.storage.from(BUCKET_TEAM_SUBAPPALTI).upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
      if (caricamento.error) { fine(); toast('File non caricato: ' + caricamento.error.message, 'err'); return; }
    }
    const { error } = await db.rpc('registra_documento_impresa', {
      p_tipo: tipo, p_descrizione: descrizione || null, p_data_rilascio: rilascio, p_data_scadenza: scadenza,
      p_nota: nota || null, p_storage_path: path, p_nome_file: file ? file.name : null, p_sostituisce: modo === 'rinnova' ? documentoId : null
    });
    fine();
    if (error) {
      if (path) await db.storage.from(BUCKET_TEAM_SUBAPPALTI).remove([path]);
      toast('Non salvato: ' + error.message, 'err');
      return;
    }
    toast(modo === 'rinnova' ? 'Documento rinnovato' : 'Documento inserito', 'ok');
    closeM('m-documento-ts');
    await caricaSchedaDocumenti();
  };
}
