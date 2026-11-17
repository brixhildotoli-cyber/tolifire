// ── F19.5 — CORSI MANCANTI NEL PREVENTIVO (sql/156) ──────────────────────
// Decisione di Erika del 16/11: avviso CON SCELTA OBBLIGATORIA.
//   - Scheda del preventivo (Acquisti autore e titolare): riquadro "🎓 Corsi
//     richiesti" (pvd-corsi) con i corsi che le voci o le lavorazioni
//     richiedono (catalogo dei corsi, F19.1) e quante persone li hanno validi
//     (solo il numero). Per un corso senza nessuno abilitato: "Faremo il corso"
//     / "Lo fa un subappaltatore" (con nota), finché il preventivo è in bozza.
//   - Invio (PDF al titolare e al rappresentante, PDF esterno del titolare):
//     senza la scelta si ferma con il messaggio; il database blocca comunque
//     l'uscita dalla bozza (trg_preventivi_corsi_mancanti).
// Senza sql/156 nessun riquadro né controllo.

const CORSI_PREV = { attivo: true };

async function verificaCorsiPreventivoDisponibili() {
  if (CORSI_PREV.attivo !== null) return CORSI_PREV.attivo;
  try {
    const { data, error } = await db.rpc('corsi_preventivo_attivi');
    CORSI_PREV.attivo = !error && data === true;
  } catch (e) { CORSI_PREV.attivo = false; }
  return CORSI_PREV.attivo;
}

async function leggiCorsiPreventivo(id) {
  if (!['commerciale', 'titolare'].includes(ROLE) || !(await verificaCorsiPreventivoDisponibili())) return null;
  const { data, error } = await db.rpc('corsi_preventivo', { p_preventivo: id });
  if (error) return null;
  return data || [];
}

const SCELTE_CORSO = { faremo_corso: '🎓 Faremo il corso', subappaltatore: '🏗️ Lo fa un subappaltatore' };

async function disegnaCorsiPreventivo(id) {
  const vecchio = ge('pvd-corsi');
  if (vecchio) vecchio.remove();
  const corsi = await leggiCorsiPreventivo(id);
  if (!corsi || !corsi.length) return;
  const { data: p } = await db.from('preventivi').select('stato').eq('id', id).maybeSingle();
  const bozza = p && p.stato === 'bozza';
  const mancanti = corsi.filter(function(c) { return c.persone_valide === 0; });
  const senzaScelta = mancanti.filter(function(c) { return !c.scelta; }).length;
  const righe = corsi.map(function(c) {
    const testa = '<b>' + esc(c.corso_nome) + '</b> <span style="color:var(--m);font-size:12px">(' + esc(c.motivo || '') + ')</span>';
    if (c.persone_valide > 0) return '<div style="font-size:13px;margin:4px 0">✅ ' + testa + ' · ' + c.persone_valide + (c.persone_valide === 1 ? ' persona abilitata' : ' persone abilitate') + '</div>';
    const bottoni = bozza ? ' <button class="btn sm" onclick="scegliCorsoPreventivo(\'' + esc(id) + '\',\'' + esc(c.corso_codice) + '\',\'faremo_corso\')">' + SCELTE_CORSO.faremo_corso + '</button>' +
      ' <button class="btn sm" onclick="scegliCorsoPreventivo(\'' + esc(id) + '\',\'' + esc(c.corso_codice) + '\',\'subappaltatore\')">' + SCELTE_CORSO.subappaltatore + '</button>' : '';
    return '<div data-corso-mancante="' + esc(c.corso_codice) + '" style="font-size:13px;margin:6px 0">⚠️ ' + testa + ' · <b>nessuno ha il corso valido</b>' +
      (c.scelta ? '<div style="margin-top:2px">Scelta: <b>' + esc(SCELTE_CORSO[c.scelta] || c.scelta) + '</b>' + (c.scelta_nota ? ' · ' + esc(c.scelta_nota) : '') + (c.scelta_da_nome ? ' <span style="color:var(--m)">(' + esc(c.scelta_da_nome) + ')</span>' : '') + (bozza ? '<details style="display:inline-block;margin-left:6px"><summary style="font-size:12px;cursor:pointer">Cambia</summary>' + bottoni + '</details>' : '') + '</div>'
        : '<div style="margin-top:4px">' + bottoni + '</div>') + '</div>';
  }).join('');
  const classe = senzaScelta ? 'al2 w' : 'al2 i';
  const html = '<div id="pvd-corsi" class="' + classe + '" style="margin:0 0 8px">🎓 <b>Corsi richiesti da questo preventivo</b>' +
    (senzaScelta && bozza ? '<div style="font-size:12px;margin-top:2px">Per inviare il preventivo scegli cosa fare per ' + (senzaScelta === 1 ? 'il corso' : 'i ' + senzaScelta + ' corsi') + ' senza persone abilitate.</div>' : '') + righe + '</div>';
  const dove = ge('pvd-scheda-oggetto');
  if (dove) dove.insertAdjacentHTML('beforebegin', html);
}

async function scegliCorsoPreventivo(id, corso, scelta) {
  const nota = prompt(SCELTE_CORSO[scelta] + '. Nota (facoltativa, es. data del corso o nome del subappaltatore):', '');
  if (nota === null) return;
  const { error } = await db.rpc('scegli_corso_preventivo', { p_preventivo: id, p_corso: corso, p_scelta: scelta, p_nota: nota || null });
  if (error) { toast('Scelta non salvata: ' + error.message, 'err'); return; }
  toast('Scelta salvata', 'ok');
  await disegnaCorsiPreventivo(id);
}

if (typeof openPreventivoDetail === 'function') {
  const openPreventivoDetailSenzaCorsi = openPreventivoDetail;
  // eslint-disable-next-line no-global-assign
  openPreventivoDetail = async function(preventivoId) {
    const esito = await openPreventivoDetailSenzaCorsi.apply(this, arguments);
    try { await disegnaCorsiPreventivo(preventivoId); } catch (e) { console.warn('Corsi del preventivo:', e); }
    return esito;
  };
}

// Controllo prima dell'invio (il database blocca comunque)
async function corsiMancantiSenzaScelta(id) {
  const corsi = await leggiCorsiPreventivo(id);
  if (!corsi) return [];
  return corsi.filter(function(c) { return c.persone_valide === 0 && !c.scelta; });
}

['inviaPdfClienteATitolareERappresentante', 'caricaEInviaPdfEsternoTitolare'].forEach(function(nome) {
  if (typeof window[nome] !== 'function') return;
  const originale = window[nome];
  window[nome] = async function() {
    try {
      if (typeof currentPreventivoId !== 'undefined' && currentPreventivoId) {
        const { data: p } = await db.from('preventivi').select('stato').eq('id', currentPreventivoId).maybeSingle();
        if (p && p.stato === 'bozza') {
          const mancano = await corsiMancantiSenzaScelta(currentPreventivoId);
          if (mancano.length) {
            toast('Prima di inviare: nessuno ha il corso valido per ' + mancano.map(function(c) { return c.corso_nome; }).join(', ') + '. Scegli "Faremo il corso" o "Lo fa un subappaltatore" nel riquadro dei corsi.', 'err');
            const box = ge('pvd-corsi');
            if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          }
        }
      }
    } catch (e) { console.warn('Corsi del preventivo:', e); }
    return originale.apply(this, arguments);
  };
});
