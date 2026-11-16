// ── F19.2 — ESITO DELLA VISITA DI IDONEITÀ (sql/153) ─────────────────────
// Decisione di Erika del 16/11: SOLO l'esito (idoneo / con limitazioni / non
// idoneo + limitazioni) sulla visita 'idoneita_sanitaria' di js/30.
//   - Scheda documenti (pg-scheda-documenti): sotto la visita titolare e
//     segreteria vedono l'esito con le limitazioni e "🩺 Esito" per scriverlo
//     (finestra m-idoneita, id ido-); il capo tecnico vede SOLO "Idoneo: sì /
//     no" (idoneita_persone(), D9).
//   - "I miei documenti" del tecnico: la persona vede il suo esito.
// Senza sql/153 nessuna riga né bottone (una RPC 404).

const IDON = { attivo: null };

async function verificaIdoneitaDisponibile() {
  if (IDON.attivo !== null) return IDON.attivo;
  try {
    const { data, error } = await db.rpc('idoneita_esito_attivo');
    IDON.attivo = !error && data === true;
  } catch (e) { IDON.attivo = false; }
  return IDON.attivo;
}

const ESITI_IDONEITA = {
  idoneo: { icona: '✅', testo: 'Idoneo', classe: 'bok' },
  con_limitazioni: { icona: '⚠️', testo: 'Idoneo con limitazioni', classe: 'bwarn' },
  non_idoneo: { icona: '⛔', testo: 'Non idoneo', classe: 'berr' }
};

function htmlEsitoIdoneita(r) {
  if (!r) return '<span style="color:var(--a)">🩺 Esito della visita non ancora scritto</span>';
  const e = ESITI_IDONEITA[r.esito] || { icona: '', testo: r.esito, classe: 'bgray' };
  return '🩺 <span class="bx ' + e.classe + '">' + e.icona + ' ' + esc(e.testo) + '</span>' + (r.limitazioni ? ' <b>' + esc(r.limitazioni) + '</b>' : '');
}

// Segnaposto nella riga della visita (riempito dopo il caricamento)
if (typeof htmlDocumentoTS === 'function') {
  const htmlDocumentoTSSenzaIdoneita = htmlDocumentoTS;
  // eslint-disable-next-line no-global-assign
  htmlDocumentoTS = function(d, inVigore) {
    const html = htmlDocumentoTSSenzaIdoneita.apply(this, arguments);
    if (!IDON.attivo || !d || d.tipo !== 'idoneita_sanitaria') return html;
    const segno = '<div style="font-size:12px;color:var(--m)">';
    const i = html.indexOf(segno);
    if (i < 0) return html;
    return html.slice(0, i) + '<div data-idoneita-doc="' + esc(d.id) + '" data-in-vigore="' + (inVigore ? '1' : '0') + '" style="font-size:12px;margin:2px 0"></div>' + html.slice(i);
  };
}

async function riempiIdoneitaScheda() {
  const posti = Array.from(document.querySelectorAll('[data-idoneita-doc]'));
  if (!posti.length) return;
  const ids = posti.map(function(p) { return p.getAttribute('data-idoneita-doc'); });
  if (['titolare', 'segreteria'].includes(ROLE)) {
    const { data, error } = await db.from('documenti_idoneita').select('documento_id, esito, limitazioni, aggiornato_da_nome, aggiornato_il').in('documento_id', ids);
    if (error) return;
    const perDoc = {};
    (data || []).forEach(function(r) { perDoc[r.documento_id] = r; });
    posti.forEach(function(p) {
      const id = p.getAttribute('data-idoneita-doc');
      const r = perDoc[id];
      p.innerHTML = htmlEsitoIdoneita(r) + (r && r.aggiornato_da_nome ? ' <span style="color:var(--m)">(' + esc(r.aggiornato_da_nome) + ')</span>' : '') +
        (p.getAttribute('data-in-vigore') === '1' ? ' <button class="btn sm" style="margin-left:4px" onclick="apriEsitoIdoneita(\'' + esc(id) + '\')">🩺 Esito</button>' : '');
    });
  } else if (ROLE === 'capo_tecnico') {
    const { data, error } = await db.rpc('idoneita_persone');
    if (error) return;
    const perDoc = {};
    (data || []).forEach(function(r) { perDoc[r.documento_id] = r; });
    posti.forEach(function(p) {
      const r = perDoc[p.getAttribute('data-idoneita-doc')];
      p.innerHTML = !r || r.idoneo === null ? '<span style="color:var(--a)">🩺 Esito non ancora scritto dalla segreteria</span>'
        : '🩺 Idoneo: <span class="bx ' + (r.idoneo ? 'bok">sì' : 'berr">no') + '</span>';
    });
  }
}

if (typeof caricaSchedaDocumenti === 'function') {
  const caricaSchedaDocumentiSenzaIdoneita = caricaSchedaDocumenti;
  // eslint-disable-next-line no-global-assign
  caricaSchedaDocumenti = async function() {
    try { await verificaIdoneitaDisponibile(); } catch (e) { /* senza */ }
    const esito = await caricaSchedaDocumentiSenzaIdoneita.apply(this, arguments);
    try { if (IDON.attivo) await riempiIdoneitaScheda(); } catch (e) { console.warn('Idoneità:', e); }
    return esito;
  };
}

// ── Finestra dell'esito (titolare e segreteria) ─────────────────────
async function apriEsitoIdoneita(documentoId) {
  ge('ido-id').value = documentoId;
  const { data } = await db.from('documenti_idoneita').select('esito, limitazioni').eq('documento_id', documentoId).maybeSingle();
  ge('ido-esito').value = data ? data.esito : 'idoneo';
  ge('ido-limitazioni').value = data && data.limitazioni ? data.limitazioni : '';
  cambiaEsitoIdoneita();
  openM('m-idoneita');
}

function cambiaEsitoIdoneita() {
  ge('ido-limitazioni-box').style.display = ge('ido-esito').value === 'con_limitazioni' ? '' : 'none';
}

async function salvaEsitoIdoneita() {
  const esito = ge('ido-esito').value;
  const lim = (ge('ido-limitazioni').value || '').trim();
  if (esito === 'con_limitazioni' && lim.length < 3) { toast('Scrivi le limitazioni', 'err'); return; }
  const { error } = await db.rpc('imposta_idoneita_documento', { p_documento_id: ge('ido-id').value, p_esito: esito, p_limitazioni: esito === 'con_limitazioni' ? lim : null });
  if (error) { toast('Esito non salvato: ' + error.message, 'err'); return; }
  closeM('m-idoneita');
  toast('Esito della visita salvato', 'ok');
  if (typeof caricaSchedaDocumenti === 'function') await caricaSchedaDocumenti();
}

// ── "I miei documenti" del tecnico: il suo esito ────────────────────
if (typeof caricaMieiDocumentiTecnico === 'function') {
  const caricaMieiDocumentiSenzaIdoneita = caricaMieiDocumentiTecnico;
  // eslint-disable-next-line no-global-assign
  caricaMieiDocumentiTecnico = async function() {
    const esito = await caricaMieiDocumentiSenzaIdoneita.apply(this, arguments);
    try {
      const box = ge('tec-miei-documenti');
      if (!box || !box.innerHTML || !ME || !(await verificaIdoneitaDisponibile())) return esito;
      const { data: doc } = await db.from('documenti_team_subappalti').select('id').eq('utente_id', ME.id).eq('tipo', 'idoneita_sanitaria').is('sostituito_da', null).limit(1).maybeSingle();
      if (!doc) return esito;
      const { data: r } = await db.from('documenti_idoneita').select('esito, limitazioni').eq('documento_id', doc.id).maybeSingle();
      const card = box.querySelector('.card');
      if (card && !card.querySelector('[data-mia-idoneita]')) card.insertAdjacentHTML('afterbegin', '<div data-mia-idoneita style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--bo)">' + htmlEsitoIdoneita(r) + '</div>');
    } catch (e) { console.warn('Idoneità:', e); }
    return esito;
  };
}
