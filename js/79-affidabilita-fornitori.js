// ── F17.11 — AFFIDABILITÀ STORICA DEL FORNITORE (sql/245) ──────────────
// Solo informazione (decisione di Erika del 13/11): badge con il punteggio
// 0-100 degli ultimi 12 mesi (puntualità sulla data promessa, ritorni da
// "arrivato", risposte alle richieste) accanto al nome del fornitore nel
// riquadro dei fornitori del preventivo e nella scheda del fornitore. Verde da
// 80, giallo da 60, rosso sotto 60, grigio "pochi dati" con meno di 3 ordini;
// il dettaglio nel suggerimento (title). Solo Acquisti e titolare. Senza
// sql/245 nessun badge (una chiamata 404).

const AFFIDABILITA = { attiva: null, cache: {} };

async function affidabilitaFornitore(id) {
  if (!id || AFFIDABILITA.attiva === false) return null;
  if (AFFIDABILITA.cache[id] && Date.now() - AFFIDABILITA.cache[id].t < 120000) return AFFIDABILITA.cache[id].v;
  try {
    const { data, error } = await db.rpc('affidabilita_fornitore', { p_fornitore: id });
    if (error) { if (error.code === 'PGRST202' || /Could not find/.test(error.message || '')) AFFIDABILITA.attiva = false; return null; }
    AFFIDABILITA.attiva = true;
    AFFIDABILITA.cache[id] = { t: Date.now(), v: data };
    return data;
  } catch (e) { return null; }
}

function htmlBadgeAffidabilita(a) {
  if (!a) return '';
  const p = Number(a.punteggio);
  const classe = a.pochi_dati ? 'bgray' : (p >= 80 ? 'bok' : (p >= 60 ? 'bwarn' : 'berr'));
  const testo = a.pochi_dati ? 'Affidabilità: pochi dati' : 'Affidabilità ' + p + '/100';
  return ' <span class="bx ' + classe + '" data-affidabilita title="' + esc(a.dettaglio || '') + '" style="margin-left:6px;cursor:help">' + esc(testo) + '</span>';
}

const vedeAffidabilita = function() { return ROLE === 'commerciale' || ROLE === 'titolare'; };

if (typeof renderFornitoriPreventivo === 'function') {
  const renderFornitoriPreventivoSenzaAffidabilita = renderFornitoriPreventivo;
  // eslint-disable-next-line no-global-assign
  renderFornitoriPreventivo = async function() {
    const esito = await renderFornitoriPreventivoSenzaAffidabilita.apply(this, arguments);
    try {
      const box = ge('pvd-fornitori-content');
      if (!box || !vedeAffidabilita() || !currentPreventivoId || AFFIDABILITA.attiva === false) return esito;
      const { data } = await db.from('preventivi_fornitori').select('id,fornitore_id').eq('preventivo_id', currentPreventivoId);
      for (const r of (data || [])) {
        const pdf = box.querySelector('button[onclick="generaRichiestaQuotazionePDF(\'' + r.id + '\')"]');
        const card = pdf && pdf.closest('.card');
        const nome = card && card.querySelector('div[style*="font-weight:700"]');
        if (!nome || nome.querySelector('[data-affidabilita]')) continue;
        const a = await affidabilitaFornitore(r.fornitore_id);
        if (a) nome.insertAdjacentHTML('beforeend', htmlBadgeAffidabilita(a));
      }
    } catch (e) { console.warn('Affidabilità dei fornitori:', e); }
    return esito;
  };
}

if (typeof openFornitoreDetail === 'function') {
  const openFornitoreDetailSenzaAffidabilita = openFornitoreDetail;
  // eslint-disable-next-line no-global-assign
  openFornitoreDetail = async function(fornitoreId) {
    const esito = await openFornitoreDetailSenzaAffidabilita.apply(this, arguments);
    try {
      const nome = ge('fd-nome');
      if (nome && vedeAffidabilita()) {
        const vecchio = nome.parentNode.querySelector('[data-affidabilita-scheda]');
        if (vecchio) vecchio.remove();
        const a = await affidabilitaFornitore(fornitoreId);
        if (a) nome.insertAdjacentHTML('afterend', '<div data-affidabilita-scheda style="margin-top:4px">' + htmlBadgeAffidabilita(a) +
          '<div style="font-size:12px;color:var(--m);margin-top:3px">' + esc(a.dettaglio || '') + '</div></div>');
      }
    } catch (e) { console.warn('Affidabilità del fornitore:', e); }
    return esito;
  };
}
