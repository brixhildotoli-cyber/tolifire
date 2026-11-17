// ── F19.7 — KIT STANDARD PER TIPO DI LAVORO (sql/158) ────────────────────
// Decisione di Erika del 16/11: il kit sta nel catalogo lavorazioni.
//   - Finestra del catalogo (js/55): riquadro "🧰 Kit standard" della
//     lavorazione aperta: DPI, attrezzatura, consumabili; titolare e
//     ingegnere aggiungono, correggono, spengono (niente cancellazioni).
//   - Scheda "🏗️ Cantiere" della commessa: riquadro "🧰 Kit da portare"
//     (cmd-kit) con le voci delle lavorazioni delle schede del progetto
//     (scheda_cantiere_commessa di sql/34); capo tecnico e titolare spuntano
//     cosa c'è (spunta_kit_commessa) e con "📦 Chiedi i mancanti" aprono una
//     richiesta di consumabili per ogni voce mancante (apri_richiesta_
//     integrazione di sql/31, come la richiesta a mano); segreteria legge.
// Senza sql/158 nessun riquadro.

const KIT = { attivo: true, commessaId: null, voci: [], spunte: {} };
const CATEGORIE_KIT = { dpi: '🦺 DPI', attrezzatura: '🔧 Attrezzatura', consumabile: '📦 Consumabile' };

async function verificaKitDisponibile() {
  if (KIT.attivo !== null) return KIT.attivo;
  try {
    const { data, error } = await db.rpc('kit_standard_attivo');
    KIT.attivo = !error && data === true;
  } catch (e) { KIT.attivo = false; }
  return KIT.attivo;
}

// ── Catalogo lavorazioni ────────────────────────────────────────────
async function disegnaKitCatalogo() {
  const box = ge('cl-contenuto');
  if (!box || !(await verificaKitDisponibile())) return;
  const l = typeof lavorazioneCatalogo === 'function' ? lavorazioneCatalogo(CATALOGO_LAV.aperta) : null;
  const vecchio = ge('cl-kit-card');
  if (vecchio) vecchio.remove();
  if (!l) return;
  const { data, error } = await db.from('lavorazioni_kit').select('*').eq('lavorazione_id', l.id).order('ordine').order('id');
  if (error || !ge('cl-contenuto')) return;
  if (ge('cl-kit-card')) ge('cl-kit-card').remove();
  const scrive = ['titolare', 'ingegnere'].includes(ROLE);
  const righe = (data || []).map(function(k) {
    return '<div data-kit-voce="' + k.id + '" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:4px 0;border-bottom:1px solid var(--bo)' + (k.attivo ? '' : ';opacity:.55') + '">' +
      (scrive
        ? '<input type="text" id="cl-kit-v-' + k.id + '" value="' + esc(k.voce) + '" maxlength="150" style="flex:1;min-width:140px">' +
          '<select id="cl-kit-c-' + k.id + '" style="width:auto">' + Object.keys(CATEGORIE_KIT).map(function(c) { return '<option value="' + c + '"' + (c === k.categoria ? ' selected' : '') + '>' + CATEGORIE_KIT[c] + '</option>'; }).join('') + '</select>' +
          '<button class="btn sm" type="button" onclick="salvaVoceKit(' + k.id + ')">💾</button>' +
          '<button class="btn sm" type="button" onclick="attivaVoceKit(' + k.id + ',' + (k.attivo ? 'false' : 'true') + ')">' + (k.attivo ? '🗑️ Togli' : '↩️ Rimetti') + '</button>'
        : '<span style="flex:1">' + esc(k.voce) + '</span><span style="font-size:12px;color:var(--m)">' + CATEGORIE_KIT[k.categoria] + '</span>') +
      '</div>';
  }).join('') || '<div class="empty">Nessuna voce nel kit</div>';
  const nuovo = scrive ? '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px">' +
    '<input type="text" id="cl-kit-nuova" maxlength="150" placeholder="es. Imbracatura anticaduta" style="flex:1;min-width:140px">' +
    '<select id="cl-kit-nuova-cat" style="width:auto">' + Object.keys(CATEGORIE_KIT).map(function(c) { return '<option value="' + c + '">' + CATEGORIE_KIT[c] + '</option>'; }).join('') + '</select>' +
    '<button class="btn sm p" type="button" onclick="aggiungiVoceKit(' + l.id + ')">+ Aggiungi</button></div>' : '';
  box.insertAdjacentHTML('beforeend', '<div class="card" id="cl-kit-card" style="margin-top:10px"><div style="font-size:13px;font-weight:600;margin-bottom:4px">🧰 Kit standard</div>' +
    '<div style="font-size:12px;color:var(--m);margin-bottom:6px">DPI, attrezzatura e consumabili da portare in cantiere per questa lavorazione: il capo tecnico li spunta nella scheda cantiere della commessa.</div>' + righe + nuovo + '</div>');
}

async function aggiungiVoceKit(lavorazioneId) {
  const voce = (ge('cl-kit-nuova').value || '').trim();
  if (voce.length < 2) { toast('Scrivi la voce del kit', 'err'); return; }
  const { error } = await db.from('lavorazioni_kit').insert({ lavorazione_id: lavorazioneId, voce: voce, categoria: ge('cl-kit-nuova-cat').value, ordine: 500 });
  if (error) { toast('Non salvata: ' + error.message, 'err'); return; }
  toast('Voce aggiunta al kit', 'ok');
  await disegnaKitCatalogo();
}

async function salvaVoceKit(id) {
  const voce = (ge('cl-kit-v-' + id).value || '').trim();
  if (voce.length < 2) { toast('Scrivi la voce del kit', 'err'); return; }
  const { error } = await db.from('lavorazioni_kit').update({ voce: voce, categoria: ge('cl-kit-c-' + id).value }).eq('id', id);
  if (error) { toast('Non salvata: ' + error.message, 'err'); return; }
  toast('Voce salvata', 'ok');
  await disegnaKitCatalogo();
}

async function attivaVoceKit(id, attivo) {
  const { error } = await db.from('lavorazioni_kit').update({ attivo: attivo }).eq('id', id);
  if (error) { toast('Non salvata: ' + error.message, 'err'); return; }
  await disegnaKitCatalogo();
}

if (typeof disegnaCatalogoLavorazioni === 'function') {
  const disegnaCatalogoLavorazioniSenzaKit = disegnaCatalogoLavorazioni;
  // eslint-disable-next-line no-global-assign
  disegnaCatalogoLavorazioni = function() {
    const esito = disegnaCatalogoLavorazioniSenzaKit.apply(this, arguments);
    disegnaKitCatalogo().catch(function(e) { console.warn('Kit standard:', e); });
    return esito;
  };
}

// ── Scheda cantiere della commessa ──────────────────────────────────
async function caricaKitCommessa(commessa) {
  const box = ge('cmd-kit');
  if (!box) return;
  box.innerHTML = '';
  if (!commessa || !['titolare', 'segreteria', 'capo_tecnico'].includes(ROLE) || !(await verificaKitDisponibile())) return;
  const [rs, rl] = await Promise.all([
    db.rpc('scheda_cantiere_commessa', { p_commessa_id: commessa.id }),
    db.from('lavorazioni').select('id, codice, nome')
  ]);
  if (rs.error || rl.error || (typeof commessaApertaId !== 'undefined' && commessaApertaId && commessaApertaId !== commessa.id)) return;
  const famiglie = ((rs.data && rs.data.schede_rilievo) || []).map(function(s) { return s.famiglia; });
  const lavorazioni = (rl.data || []).filter(function(l) { return famiglie.includes(l.codice); });
  if (!lavorazioni.length) return;
  const [rk, rsp] = await Promise.all([
    db.from('lavorazioni_kit').select('id, lavorazione_id, voce, categoria, ordine').in('lavorazione_id', lavorazioni.map(function(l) { return l.id; })).eq('attivo', true).order('ordine').order('id'),
    db.from('commesse_kit_spunte').select('kit_id, presente, richiesto_il, spuntato_da_nome').eq('commessa_id', commessa.id)
  ]);
  if (rk.error || rsp.error || !(rk.data || []).length) return;
  KIT.commessaId = commessa.id;
  KIT.commessa = commessa;
  KIT.voci = rk.data;
  KIT.spunte = {};
  (rsp.data || []).forEach(function(s) { KIT.spunte[s.kit_id] = s; });
  disegnaKitCommessa(lavorazioni);
}

function disegnaKitCommessa(lavorazioni) {
  const box = ge('cmd-kit');
  if (!box) return;
  const c = KIT.commessa;
  const spunta = ['titolare', 'capo_tecnico'].includes(ROLE) && !['chiusa', 'annullata'].includes(c.stato);
  const ok = KIT.voci.filter(function(k) { return KIT.spunte[k.id] && KIT.spunte[k.id].presente; }).length;
  const mancanti = KIT.voci.filter(function(k) { const s = KIT.spunte[k.id]; return !(s && s.presente) && !(s && s.richiesto_il); });
  const gruppi = (lavorazioni || []).map(function(l) {
    const voci = KIT.voci.filter(function(k) { return k.lavorazione_id === l.id; });
    if (!voci.length) return '';
    return '<div style="font-size:13px;font-weight:600;margin:8px 0 2px">' + esc(l.nome) + '</div>' + voci.map(function(k) {
      const s = KIT.spunte[k.id];
      const presente = !!(s && s.presente);
      return '<label data-kit-commessa="' + k.id + '" style="display:flex;gap:8px;align-items:center;font-size:13px;padding:3px 0">' +
        '<input type="checkbox" style="width:auto"' + (presente ? ' checked' : '') + (spunta ? ' onchange="spuntaKitCommessa(' + k.id + ', this.checked)"' : ' disabled') + '>' +
        '<span>' + esc(k.voce) + ' <span style="color:var(--m);font-size:12px">· ' + CATEGORIE_KIT[k.categoria] + '</span>' +
        (!presente && s && s.richiesto_il ? ' <span class="bx bblue">📦 Chiesto il ' + esc(new Date(s.richiesto_il).toLocaleDateString('it-IT')) + '</span>' : '') + '</span></label>';
    }).join('');
  }).join('');
  box.innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<div style="font-size:14px;font-weight:700">🧰 Kit da portare <span style="font-weight:400;font-size:12px;color:var(--m)">' + ok + ' su ' + KIT.voci.length + ' pronti</span></div>' +
    (spunta && mancanti.length ? '<button class="btn sm p" id="kit-chiedi" onclick="chiediMancantiKit()">📦 Chiedi i mancanti (' + mancanti.length + ')</button>' : '') + '</div>' +
    '<div style="font-size:12px;color:var(--m);margin-top:2px">Kit standard delle lavorazioni della commessa (catalogo lavorazioni). Spunta quello che c\'è; per il resto parte una richiesta di consumabili ad Acquisti.</div>' +
    gruppi + '</div>';
}

async function spuntaKitCommessa(kitId, presente) {
  const { error } = await db.rpc('spunta_kit_commessa', { p_commessa_id: KIT.commessaId, p_kit_id: kitId, p_presente: presente, p_richiesto: false });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  KIT.spunte[kitId] = Object.assign({}, KIT.spunte[kitId] || {}, { presente: presente, richiesto_il: presente ? null : (KIT.spunte[kitId] || {}).richiesto_il });
  await caricaKitCommessa(KIT.commessa);
}

async function chiediMancantiKit() {
  const mancanti = KIT.voci.filter(function(k) { const s = KIT.spunte[k.id]; return !(s && s.presente) && !(s && s.richiesto_il); });
  if (!mancanti.length) return;
  if (!confirm('Chiedere ad Acquisti ' + mancanti.length + (mancanti.length === 1 ? ' voce mancante' : ' voci mancanti') + ' del kit?\n\n' + mancanti.map(function(k) { return '• ' + k.voce; }).join('\n'))) return;
  const b = ge('kit-chiedi');
  if (b) b.disabled = true;
  let fatte = 0;
  for (const k of mancanti) {
    const { error } = await db.rpc('apri_richiesta_integrazione', { p_commessa_id: KIT.commessaId, p_tipo: 'consumabile', p_descrizione: 'Kit: ' + k.voce, p_quantita: 1, p_note: 'Dal kit standard della lavorazione' });
    if (error) { toast('Richiesta non aperta per "' + k.voce + '": ' + error.message, 'err'); break; }
    await db.rpc('spunta_kit_commessa', { p_commessa_id: KIT.commessaId, p_kit_id: k.id, p_presente: false, p_richiesto: true });
    fatte++;
  }
  if (fatte) toast(fatte + (fatte === 1 ? ' richiesta aperta' : ' richieste aperte') + ' ad Acquisti', 'ok');
  if (typeof caricaRichiesteIntegrazioneCommessa === 'function') { try { await caricaRichiesteIntegrazioneCommessa(KIT.commessa); } catch (e) { /* si vedrà riaprendo */ } }
  await caricaKitCommessa(KIT.commessa);
}

if (typeof caricaSchedaCantiere === 'function') {
  const caricaSchedaCantiereSenzaKit = caricaSchedaCantiere;
  // eslint-disable-next-line no-global-assign
  caricaSchedaCantiere = async function(commessa) {
    const esito = await caricaSchedaCantiereSenzaKit.apply(this, arguments);
    try { await caricaKitCommessa(commessa); } catch (e) { console.warn('Kit standard:', e); }
    return esito;
  };
}
