// ── F17.2 — SCADENZE DELLE RICHIESTE AI FORNITORI E SOLLECITI (sql/126) ──
// Approvata da Erika il 13/11: solo promemoria, nessun blocco.
// Nel riquadro di ogni fornitore del preventivo (renderFornitoriPreventivo
// avvolta, dopo js/73) il riquadro "⏰ Risposta del fornitore": data
// "Risposta entro" (proposta da sola a "📤 Segna come inviata": 3 giorni
// lavorativi dopo; si cambia e si salva con 💾), e se la richiesta è inviata
// e la data è passata "Nessuna risposta: telefona" con "📞 Ho telefonato"
// (esito obbligatorio nel prompt; la data passa a 2 giorni lavorativi dopo
// oggi). Ultima telefonata con chi e quando (dal database).
// Cosa tocca a me: Acquisti "📞 Fornitori da sollecitare" (richieste inviate
// oltre la data), titolare "📞 Richieste ai fornitori ferme" (oltre la data
// da più di 2 giorni lavorativi). Senza sql/126 niente riquadro né righe.

const SCAD_FORN = { attive: null };
const GG_RISPOSTA_FORNITORE = 3, GG_RINVIO_TELEFONATA = 2, GG_RITARDO_TITOLARE = 2;

async function verificaScadenzeFornitoriDisponibili() {
  if (SCAD_FORN.attive !== null) return SCAD_FORN.attive;
  try { const { data, error } = await db.rpc('fornitori_scadenze_attive'); SCAD_FORN.attive = !error && data === true; } catch (e) { SCAD_FORN.attive = false; }
  return SCAD_FORN.attive;
}

const oggiFornitori = function() { return typeof dataLocaleISO === 'function' ? dataLocaleISO() : new Date().toISOString().slice(0, 10); };

function htmlScadenzaFornitore(r) {
  const scaduta = r.stato === 'richiesta_inviata' && r.risposta_entro && r.risposta_entro < oggiFornitori();
  return `
    <div data-scad-forn="${esc(r.id)}" style="margin:6px 0 10px;padding:10px 12px;border:1px solid ${scaduta ? 'var(--r)' : 'var(--bo)'};border-radius:8px">
      <div style="font-size:13px;font-weight:700">⏰ Risposta del fornitore</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:6px">
        <div class="f" style="margin:0;max-width:200px"><label for="sf-entro-${esc(r.id)}">Risposta entro</label>
          <input type="date" id="sf-entro-${esc(r.id)}" value="${esc(r.risposta_entro || '')}"></div>
        <button type="button" class="btn sm" onclick="salvaScadenzaFornitore('${esc(r.id)}')">💾 Salva la data</button>
        ${r.stato === 'richiesta_inviata' ? `<button type="button" class="btn sm${scaduta ? ' p' : ''}" onclick="telefonataFornitore('${esc(r.id)}')">📞 Ho telefonato</button>` : ''}
      </div>
      ${scaduta ? '<div style="color:var(--r);font-size:13px;font-weight:600;margin-top:6px">Nessuna risposta entro il ' + esc(fd(r.risposta_entro)) + ': telefona al fornitore.</div>' : ''}
      ${r.esito_telefonata ? '<div style="font-size:12px;color:var(--m);margin-top:6px">📞 Ultima telefonata: ' + esc(r.telefonata_da_nome || '—') + ' il ' + esc(new Date(r.telefonata_il).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })) + ' · ' + esc(r.esito_telefonata) + '</div>' : ''}
    </div>`;
}

if (typeof renderFornitoriPreventivo === 'function') {
  const renderFornitoriPreventivoSenzaScadenze = renderFornitoriPreventivo;
  // eslint-disable-next-line no-global-assign
  renderFornitoriPreventivo = async function() {
    const esito = await renderFornitoriPreventivoSenzaScadenze.apply(this, arguments);
    try {
      const box = ge('pvd-fornitori-content');
      if (!box || !currentPreventivoId || !(await verificaScadenzeFornitoriDisponibili())) return esito;
      const { data } = await db.from('preventivi_fornitori')
        .select('id,stato,risposta_entro,esito_telefonata,telefonata_il,telefonata_da_nome')
        .eq('preventivo_id', currentPreventivoId);
      (data || []).forEach(function(r) {
        if (box.querySelector('[data-scad-forn="' + r.id + '"]')) return;
        const pdf = box.querySelector('button[onclick="generaRichiestaQuotazionePDF(\'' + r.id + '\')"]');
        if (!pdf) return;
        const salva = pdf.previousElementSibling && pdf.previousElementSibling.tagName === 'BUTTON' ? pdf.previousElementSibling : pdf;
        salva.insertAdjacentHTML('beforebegin', htmlScadenzaFornitore(r));
      });
    } catch (e) { console.warn('Scadenze dei fornitori:', e); }
    return esito;
  };
}

async function salvaScadenzaFornitore(id) {
  const v = ge('sf-entro-' + id).value || null;
  const { error } = await db.from('preventivi_fornitori').update({ risposta_entro: v }).eq('id', id);
  if (error) { toast('Data non salvata: ' + error.message, 'err'); return; }
  toast(v ? 'Risposta attesa entro il ' + fd(v) : 'Data tolta', 'ok');
  await renderFornitoriPreventivo();
}

async function telefonataFornitore(id) {
  const esito = prompt('Com’è andata la telefonata al fornitore? (es. "Risponde venerdì", "Non risponde", "Manda l’offerta oggi")', '');
  if (esito === null) return;
  if (!esito.trim()) { toast('Scrivi l’esito della telefonata', 'err'); return; }
  const nuova = typeof aggiungiGgLav === 'function' ? aggiungiGgLav(oggiFornitori(), GG_RINVIO_TELEFONATA) : null;
  const { error } = await db.from('preventivi_fornitori').update({ esito_telefonata: esito.trim().slice(0, 500), risposta_entro: nuova }).eq('id', id);
  if (error) { toast('Telefonata non salvata: ' + error.message, 'err'); return; }
  toast('Telefonata segnata' + (nuova ? ': nuova scadenza ' + fd(nuova) : ''), 'ok');
  await renderFornitoriPreventivo();
}

// "📤 Segna come inviata": data di risposta proposta (solo se vuota)
if (typeof segnaRichiestaFornitoreInviata === 'function') {
  const segnaRichiestaFornitoreInviataSenzaScadenza = segnaRichiestaFornitoreInviata;
  // eslint-disable-next-line no-global-assign
  segnaRichiestaFornitoreInviata = async function(selezioneId) {
    const esito = await segnaRichiestaFornitoreInviataSenzaScadenza.apply(this, arguments);
    try {
      if (await verificaScadenzeFornitoriDisponibili()) {
        const { data } = await db.from('preventivi_fornitori').select('stato,risposta_entro').eq('id', selezioneId).maybeSingle();
        if (data && data.stato === 'richiesta_inviata' && !data.risposta_entro && typeof aggiungiGgLav === 'function') {
          await db.from('preventivi_fornitori').update({ risposta_entro: aggiungiGgLav(oggiFornitori(), GG_RISPOSTA_FORNITORE) }).eq('id', selezioneId);
          await renderFornitoriPreventivo();
        }
      }
    } catch (e) { console.warn('Scadenza della richiesta:', e); }
    return esito;
  };
}

// ── Cosa tocca a me ───────────────────────────────────────────────────
async function richiesteFornitoriScadute(oltreGg) {
  if (!(await verificaScadenzeFornitoriDisponibili())) return null;
  const { data, error } = await db.from('preventivi_fornitori').select('id,preventivo_id,risposta_entro')
    .eq('stato', 'richiesta_inviata').lt('risposta_entro', oggiFornitori()).order('risposta_entro').limit(300);
  if (error) return null;
  return (data || []).filter(function(r) {
    if (!oltreGg) return true;
    const gg = typeof giorniLavorativiTra === 'function' ? giorniLavorativiTra(r.risposta_entro, oggiFornitori()) : 99;
    return gg !== null && gg > oltreGg;
  });
}

function vaiRichiestaFornitore(elenco) {
  if (!elenco || !elenco.length) { gotoPage(ROLE === 'titolare' ? 'preventivi-titolare' : 'preventivi'); return; }
  openPreventivoDetail(elenco[0].preventivo_id).then(function() {
    const t = [...document.querySelectorAll('#pg-preventivo-detail .tab')].find(function(x) { return /Fornitori/.test(x.textContent); });
    if (t) t.click();
  });
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'fornitori-da-sollecitare', ruoli: ['commerciale'], icona: '📞', livello: 'urgente', priorita: 28,
    titolo: 'Fornitori da sollecitare (risposta in ritardo)',
    vai: function() { richiesteFornitoriScadute(0).then(vaiRichiestaFornitore); },
    conta: async function() { const e = await richiesteFornitoriScadute(0); return e === null ? null : e.length; }
  });
  registraFonteToccaAMe({
    id: 'fornitori-fermi-titolare', ruoli: ['titolare'], icona: '📞', priorita: 29,
    titolo: 'Richieste ai fornitori ferme da più di ' + GG_RITARDO_TITOLARE + ' giorni lavorativi',
    vai: function() { richiesteFornitoriScadute(GG_RITARDO_TITOLARE).then(vaiRichiestaFornitore); },
    conta: async function() { const e = await richiesteFornitoriScadute(GG_RITARDO_TITOLARE); return e === null ? null : e.length; }
  });
}
