// ── F18.25 — SOSPENSIONE DELLA COMMESSA, ORDINI APERTI E ANTICIPO (sql/151) ─
// Decisioni di Erika del 16/11:
//   - "⏸ Sospendi" / "▶️ Riprendi" tra le azioni della commessa ("Cosa puoi
//     fare", js/63): sospendono titolare e capo tecnico (motivo e ripresa
//     prevista); riprende il titolare o il capo tecnico che ha sospeso. È un
//     SEGNO sopra lo stato (lo stato non cambia): etichetta "⏸ Sospesa"
//     accanto allo stato e negli elenchi, riquadro sotto l'intestazione con
//     motivo, chi, quando e ripresa prevista. Cambiare lo stato di una
//     commessa sospesa chiede conferma (solo avviso).
//   - Ordini ai fornitori non ancora arrivati (ordinato, confermato) di una
//     commessa ANNULLATA o SOSPESA: riquadro rosso nella commessa per Acquisti
//     e titolare e riga di "Cosa tocca a me" ad Acquisti. Decide lui (nessun
//     annullamento automatico).
//   - Commessa annullata con l'anticipo incassato: riquadro e riga di "Cosa
//     tocca a me" a titolare e segreteria finché non segnano "trattenuto" o
//     "rimborsato" (il rimborso si fa con la nota di credito che c'è già).
//   - Riga a titolare e capo tecnico per le commesse sospese con la ripresa
//     prevista passata.
// Senza sql/151 nessun bottone, riquadro o riga (una RPC 404).

const SOSP = { attivo: true, corrente: null, commessaId: null, mappa: {}, letto: 0 };
const STATI_ORDINE_APERTO = ['ordinato', 'confermato'];

async function verificaSospensioneDisponibile() {
  if (SOSP.attivo !== null) return SOSP.attivo;
  try {
    const { data, error } = await db.rpc('sospensione_commessa_attiva');
    SOSP.attivo = !error && data === true;
  } catch (e) { SOSP.attivo = false; }
  return SOSP.attivo;
}

async function leggiSospensioneCommessa(commessaId) {
  SOSP.corrente = null; SOSP.commessaId = commessaId;
  if (!(await verificaSospensioneDisponibile())) return null;
  const { data } = await db.from('commesse_sospensioni')
    .select('id, motivo, ripresa_prevista, sospesa_il, sospesa_da, sospesa_da_nome, sospesa_da_ruolo')
    .eq('commessa_id', commessaId).is('ripresa_il', null).maybeSingle();
  if (SOSP.commessaId === commessaId) SOSP.corrente = data || null;
  return SOSP.corrente;
}

function commessaSospesa(c) {
  return !!(c && SOSP.corrente && SOSP.commessaId === c.id && !['chiusa', 'annullata'].includes(c.stato));
}

// ── Azioni nella scheda ─────────────────────────────────────────────
if (typeof registraAzioneScheda === 'function') {
  registraAzioneScheda('commessa', {
    codice: 'sospendi', etichetta: '⏸ Sospendi', ruoli: ['titolare', 'capo_tecnico'],
    quando: function(c) { return SOSP.attivo === true && SOSP.commessaId === c.id && !SOSP.corrente && !['chiusa', 'annullata'].includes(c.stato); },
    esegui: function(c) { return apriSospendiCommessa(c.id, c.codice); }
  });
  registraAzioneScheda('commessa', {
    codice: 'riprendi', etichetta: '▶️ Riprendi', ruoli: ['titolare', 'capo_tecnico'],
    quando: function(c) { return commessaSospesa(c) && (ROLE === 'titolare' || SOSP.corrente.sospesa_da === ME.id); },
    esegui: function(c) { return riprendiCommessa(c.id, c.codice); }
  });
}

function apriSospendiCommessa(id, codice) {
  ge('sco-id').value = id;
  ge('sco-commessa').textContent = 'Commessa ' + (codice || '');
  ge('sco-motivo').value = '';
  ge('sco-ripresa').value = '';
  ge('sco-ripresa').min = dataLocaleISO(new Date());
  openM('m-sospendi-commessa');
}

async function salvaSospendiCommessa() {
  const id = ge('sco-id').value;
  const motivo = (ge('sco-motivo').value || '').trim();
  const ripresa = ge('sco-ripresa').value || null;
  if (motivo.length < 3) { toast('Scrivi il motivo della sospensione', 'err'); return; }
  const { error } = await db.rpc('sospendi_commessa', { p_commessa_id: id, p_motivo: motivo, p_ripresa_prevista: ripresa });
  if (error) { toast('Commessa non sospesa: ' + error.message, 'err'); return; }
  closeM('m-sospendi-commessa');
  SOSP.letto = 0;
  toast('Commessa sospesa', 'ok');
  if (typeof caricaSchedaCommessa === 'function' && commessaApertaId === id) await caricaSchedaCommessa(id);
}

async function riprendiCommessa(id, codice) {
  const nota = prompt('Riprendere la commessa ' + (codice || '') + '?\nResta nello stato in cui era. Nota (facoltativa):', '');
  if (nota === null) return;
  const { error } = await db.rpc('riprendi_commessa', { p_commessa_id: id, p_nota: nota || null });
  if (error) { toast('Commessa non ripresa: ' + error.message, 'err'); return; }
  SOSP.letto = 0;
  toast('Commessa ripresa', 'ok');
  if (typeof caricaSchedaCommessa === 'function' && commessaApertaId === id) await caricaSchedaCommessa(id);
}

// ── Riquadri nella scheda della commessa ────────────────────────────
function ordiniApertiCommessa() {
  return (typeof ordiniCommessaAperta !== 'undefined' ? ordiniCommessaAperta || [] : []).filter(function(o) { return STATI_ORDINE_APERTO.includes(o.stato); });
}

async function disegnaRiquadriSospensione(commessa) {
  const vecchio = ge('cmd-sospensione');
  if (vecchio) vecchio.remove();
  if (!commessa || !SOSP.attivo) return;
  let html = '';
  const sospesa = commessaSospesa(commessa);
  if (sospesa) {
    const s = SOSP.corrente;
    const passata = s.ripresa_prevista && s.ripresa_prevista < dataLocaleISO(new Date());
    html += '<div class="al2 w" style="margin:8px 0" data-sospensione>⏸ <b>Commessa sospesa</b> dal ' + esc(new Date(s.sospesa_il).toLocaleDateString('it-IT')) +
      (s.sospesa_da_nome ? ' da ' + esc(s.sospesa_da_nome) : '') + '. Motivo: ' + esc(s.motivo) + '.' +
      (s.ripresa_prevista ? ' Ripresa prevista: <b' + (passata ? ' style="color:var(--r, #dc2626)"' : '') + '>' + esc(fd(s.ripresa_prevista)) + '</b>' + (passata ? ' (passata)' : '') + '.' : ' Ripresa non ancora prevista.') +
      ' Lo stato resta "' + esc(typeof ETICHETTE_STATO_COMMESSA !== 'undefined' ? (ETICHETTE_STATO_COMMESSA[commessa.stato] || commessa.stato) : commessa.stato) + '".</div>';
  }
  if ((sospesa || commessa.stato === 'annullata') && ['commerciale', 'titolare'].includes(ROLE)) {
    const aperti = ordiniApertiCommessa();
    if (aperti.length) {
      html += '<div class="al2 e" style="margin:8px 0" data-ordini-aperti>🛒 <b>' + (aperti.length === 1 ? '1 ordine ai fornitori non ancora arrivato' : aperti.length + ' ordini ai fornitori non ancora arrivati') +
        '</b> su una commessa ' + (sospesa ? 'sospesa' : 'annullata') + ': ' + esc(aperti.map(function(o) { return (o.codice || ('n. ' + o.numero)) + (o.fornitore_ragione_sociale ? ' (' + o.fornitore_ragione_sociale + ')' : ''); }).join(', ')) +
        '. Decidi se annullarli' + (sospesa ? ' o farli slittare' : '') + ' con il fornitore.</div>';
    }
  }
  if (commessa.stato === 'annullata' && ['titolare', 'segreteria'].includes(ROLE)) html += await htmlAnticipoCommessaAnnullata(commessa);
  if (!html) return;
  const dove = ge('cmd-scheda-oggetto');
  if (dove) dove.insertAdjacentHTML('afterend', '<div id="cmd-sospensione">' + html + '</div>');
}

async function htmlAnticipoCommessaAnnullata(commessa) {
  if (!commessa.preventivo_id) return '';
  const [rp, rd] = await Promise.all([
    db.from('preventivi').select('anticipo_accredito_data, anticipo_fattura_numero, anticipo_fattura_importo').eq('id', commessa.preventivo_id).maybeSingle(),
    db.from('commesse_anticipo_decisioni').select('decisione, nota, deciso_da_nome, deciso_il').eq('commessa_id', commessa.id).maybeSingle()
  ]);
  const p = rp.data;
  if (!p || !p.anticipo_accredito_data) return '';
  const d = rd.data;
  const importo = p.anticipo_fattura_importo != null && typeof euroPreventivo === 'function' ? euroPreventivo(p.anticipo_fattura_importo) : '';
  const bottoni = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
    '<button class="btn sm" onclick="decidiAnticipoCommessa(\'' + esc(commessa.id) + '\',\'trattenuto\')">Trattenuto</button>' +
    '<button class="btn sm" onclick="decidiAnticipoCommessa(\'' + esc(commessa.id) + '\',\'rimborsato\')">Rimborsato</button></div>';
  if (!d) {
    return '<div class="al2 w" style="margin:8px 0" data-anticipo-annullata>💶 <b>Commessa annullata con l\'anticipo già incassato</b>' + (importo ? ' (' + esc(importo) + ', fattura n. ' + esc(p.anticipo_fattura_numero || '') + ')' : '') +
      ': decidi se trattenerlo o rimborsarlo. Il rimborso si fa con la nota di credito della fattura d\'anticipo (pagina Fatture).' + bottoni + '</div>';
  }
  return '<div class="al2 i" style="margin:8px 0" data-anticipo-annullata>💶 Anticipo ' + (importo ? esc(importo) + ' ' : '') + '<b>' + esc(d.decisione) + '</b>' +
    (d.deciso_da_nome ? ' (' + esc(d.deciso_da_nome) + ', ' + esc(new Date(d.deciso_il).toLocaleDateString('it-IT')) + ')' : '') + (d.nota ? ': ' + esc(d.nota) : '') +
    (d.decisione === 'rimborsato' ? '. Ricorda la nota di credito della fattura d\'anticipo n. ' + esc(p.anticipo_fattura_numero || '') + '.' : '.') +
    '<details style="margin-top:4px"><summary style="font-size:12px;cursor:pointer">Cambia</summary>' + bottoni + '</details></div>';
}

async function decidiAnticipoCommessa(id, decisione) {
  const nota = prompt('Anticipo ' + decisione + '. Nota (facoltativa):', '');
  if (nota === null) return;
  const { error } = await db.rpc('decidi_anticipo_commessa', { p_commessa_id: id, p_decisione: decisione, p_nota: nota || null });
  if (error) { toast('Decisione non salvata: ' + error.message, 'err'); return; }
  toast('Anticipo: ' + decisione, 'ok');
  if (typeof caricaSchedaCommessa === 'function' && commessaApertaId === id) await caricaSchedaCommessa(id);
}

function segnaStatoSospeso(commessa) {
  const st = ge('cmd-stato');
  if (!st || st.querySelector('[data-sospesa]') || !commessaSospesa(commessa)) return;
  st.insertAdjacentHTML('beforeend', ' <span class="bx bwarn" data-sospesa>⏸ Sospesa</span>');
}

if (typeof caricaSchedaCommessa === 'function') {
  const caricaSchedaCommessaSenzaSospensione = caricaSchedaCommessa;
  // eslint-disable-next-line no-global-assign
  caricaSchedaCommessa = async function(commessaId) {
    const vecchio = ge('cmd-sospensione');
    if (vecchio) vecchio.remove();
    try { await leggiSospensioneCommessa(commessaId); } catch (e) { SOSP.corrente = null; }
    const esito = await caricaSchedaCommessaSenzaSospensione.apply(this, arguments);
    try {
      if (commessaApertaId && commessaApertaId !== commessaId) return esito;
      const { data: c } = await db.from('commesse').select('id, codice, stato, preventivo_id').eq('id', commessaId).maybeSingle();
      if (c) { segnaStatoSospeso(c); await disegnaRiquadriSospensione(c); }
    } catch (e) { console.warn('Sospensione della commessa:', e); }
    return esito;
  };
}

// Cambio di stato di una commessa sospesa: conferma (solo avviso)
if (typeof salvaStatoCommessa === 'function') {
  const salvaStatoCommessaSenzaSospensione = salvaStatoCommessa;
  // eslint-disable-next-line no-global-assign
  salvaStatoCommessa = async function() {
    try {
      const c = typeof commessaStatoAperta !== 'undefined' ? commessaStatoAperta : null;
      if (c && SOSP.attivo) {
        const { data: s } = await db.from('commesse_sospensioni').select('motivo').eq('commessa_id', c.id).is('ripresa_il', null).maybeSingle();
        if (s && !confirm('La commessa ' + (c.codice || '') + ' è sospesa (' + s.motivo + ').\n\nCambiare lo stato lo stesso? Resta sospesa finché qualcuno non preme "Riprendi".')) return;
      }
    } catch (e) { console.warn('Sospensione della commessa:', e); }
    return salvaStatoCommessaSenzaSospensione.apply(this, arguments);
  };
}

// ── Etichetta "⏸ Sospesa" negli elenchi delle commesse ──────────────
async function caricaMappaSospese() {
  if (!(await verificaSospensioneDisponibile())) return false;
  if (SOSP.letto && Date.now() - SOSP.letto < 120000) return true;
  const { data, error } = await db.from('commesse_sospensioni').select('commessa_id, ripresa_prevista').is('ripresa_il', null).limit(1000);
  if (error) return false;
  SOSP.mappa = {};
  (data || []).forEach(function(r) { SOSP.mappa[r.commessa_id] = r; });
  SOSP.letto = Date.now();
  return true;
}

function segnaSospesePagina() {
  const ids = Object.keys(SOSP.mappa);
  if (!ids.length) return;
  document.querySelectorAll('.page.on [onclick*="openCommessaDetail("]').forEach(function(el) {
    const testo = el.getAttribute('onclick') || '';
    const id = ids.find(function(x) { return testo.indexOf(x) >= 0; });
    if (!id) return;
    const riga = el.closest('.card, tr, li') || el.parentElement;
    if (!riga || riga.querySelector('[data-sospesa-badge]') || riga.closest('#pg-commessa-detail')) return;
    const dove = riga.tagName === 'TR' ? riga.querySelector('td') : riga;
    if (dove) dove.insertAdjacentHTML('afterbegin', '<span class="bx bwarn" data-sospesa-badge style="margin:0 4px 2px 0">⏸ Sospesa</span>');
  });
}

document.addEventListener('DOMContentLoaded', function() {
  let attesa = null;
  new MutationObserver(function() {
    if (!SOSP.attivo || attesa) return;
    attesa = setTimeout(function() { attesa = null; caricaMappaSospese().then(function(ok) { if (ok) segnaSospesePagina(); }); }, 500);
  }).observe(document.body, { childList: true, subtree: true });
  setTimeout(function() { if (typeof ROLE !== 'undefined' && ROLE) caricaMappaSospese(); }, 4000);
});

// ── Cosa tocca a me ─────────────────────────────────────────────────
async function ordiniCommesseFerme() {
  if (!(await verificaSospensioneDisponibile())) return null;
  const [ro, rs] = await Promise.all([
    db.from('ordini_fornitori').select('id, commessa_id, commesse(stato)').in('stato', STATI_ORDINE_APERTO).limit(1000),
    db.from('commesse_sospensioni').select('commessa_id, commesse(stato)').is('ripresa_il', null).limit(1000)
  ]);
  if (ro.error || rs.error) return null;
  const sospese = new Set((rs.data || []).filter(function(s) { return s.commesse && !['chiusa', 'annullata'].includes(s.commesse.stato); }).map(function(s) { return s.commessa_id; }));
  return (ro.data || []).filter(function(o) { return (o.commesse && o.commesse.stato === 'annullata') || sospese.has(o.commessa_id); });
}

async function commesseSospeseDaRiprendere() {
  if (!(await verificaSospensioneDisponibile())) return null;
  const { data, error } = await db.from('commesse_sospensioni').select('commessa_id, commesse(stato)').is('ripresa_il', null)
    .lte('ripresa_prevista', dataLocaleISO(new Date())).limit(500);
  if (error) return null;
  return (data || []).filter(function(s) { return s.commesse && !['chiusa', 'annullata'].includes(s.commesse.stato); });
}

async function anticipiDaDecidere() {
  if (!(await verificaSospensioneDisponibile())) return null;
  const [rc, rd] = await Promise.all([
    db.from('commesse').select('id, preventivi!inner(anticipo_accredito_data)').eq('stato', 'annullata').not('preventivi.anticipo_accredito_data', 'is', null).limit(500),
    db.from('commesse_anticipo_decisioni').select('commessa_id').limit(1000)
  ]);
  if (rc.error || rd.error) return null;
  const decise = new Set((rd.data || []).map(function(d) { return d.commessa_id; }));
  return (rc.data || []).filter(function(c) { return !decise.has(c.id); });
}

function apriPrimaCommessa(elenco, campo) {
  if (!elenco || !elenco.length) return;
  if (elenco.length > 1) toast('Apro la prima di ' + elenco.length, 'ok');
  openCommessaDetail(elenco[0][campo]);
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'ordini-commesse-ferme', ruoli: ['commerciale'], icona: '🛒', priorita: 32,
    titolo: 'Ordini aperti di commesse annullate o sospese',
    vai: function() { ordiniCommesseFerme().then(function(e) { apriPrimaCommessa(e, 'commessa_id'); }); },
    conta: async function() { const e = await ordiniCommesseFerme(); return e === null ? null : e.length; }
  });
  registraFonteToccaAMe({
    id: 'commesse-sospese-ripresa', ruoli: ['titolare', 'capo_tecnico'], icona: '⏸', priorita: 34,
    titolo: 'Commesse sospese: ripresa prevista passata',
    vai: function() { commesseSospeseDaRiprendere().then(function(e) { apriPrimaCommessa(e, 'commessa_id'); }); },
    conta: async function() { const e = await commesseSospeseDaRiprendere(); return e === null ? null : e.length; }
  });
  registraFonteToccaAMe({
    id: 'anticipo-commesse-annullate', ruoli: ['titolare', 'segreteria'], icona: '💶', priorita: 35,
    titolo: 'Commesse annullate: decidere l\'anticipo incassato',
    vai: function() { anticipiDaDecidere().then(function(e) { apriPrimaCommessa(e, 'id'); }); },
    conta: async function() { const e = await anticipiDaDecidere(); return e === null ? null : e.length; }
  });
}
