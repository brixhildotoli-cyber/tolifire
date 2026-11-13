// ── F17.13 — MEZZI AZIENDALI: MEZZO FERMO E MULTE (sql/129) ──────────────
// Versione ridotta decisa da Erika il 13/11: niente scadenze né incidenti,
// tutto nella finestra "Elenco mezzi e attrezzature" della scheda Cantiere
// (js/33, m-mezzi-attrezzature). Ruoli: titolare, segreteria, capo_tecnico.
//   - "🛑 Fermo" su ogni mezzo (finestra m-mezzo-fermo, id mzf-): dal, causa;
//     "✅ Rimetti in servizio". Nella squadra del giorno un mezzo fermo resta
//     sceglibile con l'avviso rosso (solo avviso).
//   - "🧾 Multe" su ogni mezzo (finestra m-mezzo-multe, id mlt-): elenco e
//     scheda della multa. Il CONDUCENTE si propone dalla squadra del cantiere
//     di quel giorno con quel mezzo (commesse_squadra_*); se non c'è si sceglie
//     a mano. Scadenza per comunicarlo = notifica (o data) + 60 giorni (la
//     calcola il database). L'addebito (azienda o conducente) solo il titolare.
//   - Cosa tocca a me: segreteria e titolare "Multe: conducente da comunicare"
//     (entro 15 giorni o scaduta) e "Multe da pagare"; titolare "Multe:
//     addebito da decidere".
// Senza sql/129: nessun bottone, nessuna riga, nessun errore (una RPC 404).

const MEZZI_MULTE = { attivo: null, mezzi: null, utenti: null, mezzoId: null, multe: [] };
const RUOLI_MEZZI_MULTE = ['titolare', 'segreteria', 'capo_tecnico'];
const GG_AVVISO_CONDUCENTE = 15;

async function verificaMulteMezziDisponibili() {
  if (MEZZI_MULTE.attivo !== null) return MEZZI_MULTE.attivo;
  if (!RUOLI_MEZZI_MULTE.includes(ROLE)) { MEZZI_MULTE.attivo = false; return false; }
  try {
    const { data, error } = await db.rpc('mezzi_multe_attive');
    MEZZI_MULTE.attivo = !error && data === true;
  } catch (e) { MEZZI_MULTE.attivo = false; }
  return MEZZI_MULTE.attivo;
}

function dataItMulta(d) {
  if (!d) return '';
  const p = String(d).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d;
}

function euroMulta(n) {
  return n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function numeroDaCampoMulta(id) {
  let t = String(v(id) || '').trim().replace(/\s|€/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return isFinite(n) ? n : NaN;
}

function nomeUtenteMulta(u) {
  return u ? [u.nome, u.cognome].filter(Boolean).join(' ') : '';
}

async function leggiMezziEUtentiMulte() {
  const [rm, ru] = await Promise.all([
    db.from('mezzi_attrezzature').select('*').order('nome'),
    db.from('utenti').select('id, nome, cognome, ruolo, attivo').order('nome')
  ]);
  MEZZI_MULTE.mezzi = rm.data || [];
  MEZZI_MULTE.utenti = ru.data || [];
}

// ── Mezzo fermo ───────────────────────────────────────────────────────
function mezzoDaId(id) {
  return (squadraAperta?.mezzi || MEZZI_MULTE.mezzi || []).find(function(m) { return m.id === id; })
    || (MEZZI_MULTE.mezzi || []).find(function(m) { return m.id === id; });
}

function apriFermoMezzo(id) {
  const m = mezzoDaId(id);
  if (!m) return;
  ge('mzf-id').value = m.id;
  ge('mzf-titolo').textContent = '🛑 ' + nomeMezzoSquadra(m);
  ge('mzf-dal').value = m.fermo_dal || dataLocaleISO();
  ge('mzf-causa').value = m.fermo_causa || '';
  ge('mzf-rimetti').style.display = m.fermo_dal ? '' : 'none';
  openM('m-mezzo-fermo');
}

async function salvaFermoMezzo(rimetti) {
  const id = v('mzf-id');
  const causa = String(v('mzf-causa') || '').trim();
  const riga = rimetti ? { fermo_dal: null, fermo_causa: null } : { fermo_dal: v('mzf-dal'), fermo_causa: causa };
  if (!rimetti) {
    if (!riga.fermo_dal) { toast('Indica da quando è fermo', 'err'); return; }
    if (causa.length < 3) { toast('Scrivi la causa del fermo (es. in officina, guasto)', 'err'); return; }
  }
  const { error } = await db.from('mezzi_attrezzature').update(riga).eq('id', id);
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  closeM('m-mezzo-fermo');
  toast(rimetti ? 'Mezzo di nuovo in servizio' : 'Mezzo segnato fermo', 'ok');
  if (typeof ricaricaMezziSquadra === 'function' && squadraAperta) await ricaricaMezziSquadra();
  MEZZI_MULTE.mezzi = null;
}

function testoFermoMezzo(m) {
  return m && m.fermo_dal ? '🛑 Fermo dal ' + dataItMulta(m.fermo_dal) + (m.fermo_causa ? ': ' + m.fermo_causa : '') : '';
}

// Elenco dei mezzi (js/33): bottoni Fermo e Multe e riga del fermo
if (typeof renderElencoMezzi === 'function') {
  const renderElencoMezziSenzaMulte = renderElencoMezzi;
  // eslint-disable-next-line no-global-assign
  renderElencoMezzi = function() {
    renderElencoMezziSenzaMulte.apply(this, arguments);
    if (MEZZI_MULTE.attivo !== true) {
      if (MEZZI_MULTE.attivo === null) verificaMulteMezziDisponibili().then(function(ok) { if (ok) renderElencoMezzi(); });
      return;
    }
    const box = ge('mza-elenco');
    if (!box) return;
    if (!box.querySelector('[data-multe-tutte]')) {
      box.insertAdjacentHTML('afterbegin', '<div data-multe-tutte style="margin-bottom:8px"><button class="btn sm" onclick="apriMulteMezzo(null)">🧾 Tutte le multe</button></div>');
    }
    box.querySelectorAll('button[onclick^="modificaMezzoElenco("]').forEach(function(b) {
      const id = (b.getAttribute('onclick').match(/'([^']+)'/) || [])[1];
      const m = mezzoDaId(id);
      if (!m || b.parentNode.querySelector('[data-mezzo-multe]')) return;
      if (m.tipo === 'mezzo') {
        b.parentNode.insertAdjacentHTML('afterbegin',
          '<button class="btn sm" data-mezzo-fermo onclick="apriFermoMezzo(\'' + esc(m.id) + '\')">' + (m.fermo_dal ? '🛑 Fermo' : '🛑 Segna fermo') + '</button>' +
          '<button class="btn sm" data-mezzo-multe onclick="apriMulteMezzo(\'' + esc(m.id) + '\')">🧾 Multe</button>');
      }
      if (m.fermo_dal) {
        const testo = b.closest('div[style*="justify-content:space-between"]')?.querySelector('div[style*="min-width:0"]');
        if (testo) testo.insertAdjacentHTML('beforeend', '<div style="font-size:12px;color:var(--r);font-weight:600">' + esc(testoFermoMezzo(m)) + '</div>');
      }
    });
  };
}

// Box della squadra (js/33): "🚐 Mezzi: fermo e multe" per i tre ruoli (la
// segreteria non apre la squadra del giorno, da cui oggi si apre l'elenco)
if (typeof caricaSquadraCantiere === 'function') {
  const caricaSquadraCantiereSenzaMulte = caricaSquadraCantiere;
  // eslint-disable-next-line no-global-assign
  caricaSquadraCantiere = async function() {
    const esito = await caricaSquadraCantiereSenzaMulte.apply(this, arguments);
    try {
      const box = ge('cmd-squadra');
      if (box && squadraAperta && (await verificaMulteMezziDisponibili()) && !box.querySelector('[data-mezzi-multe-box]')) {
        const titolo = box.querySelector('.cant-titolo');
        if (titolo) titolo.insertAdjacentHTML('afterend', '<button class="btn sm" data-mezzi-multe-box style="margin-bottom:8px" onclick="apriElencoMezzi()">🚐 Mezzi: fermo e multe</button>');
      }
    } catch (e) { console.warn('Mezzi e multe:', e); }
    return esito;
  };
}

// Squadra del giorno (js/33): avviso rosso sui mezzi fermi (si possono scegliere)
if (typeof aggiornaRiepilogoAvvisiSquadra === 'function') {
  const aggiornaRiepilogoAvvisiSquadraSenzaFermo = aggiornaRiepilogoAvvisiSquadra;
  // eslint-disable-next-line no-global-assign
  aggiornaRiepilogoAvvisiSquadra = function() {
    const esito = aggiornaRiepilogoAvvisiSquadraSenzaFermo.apply(this, arguments);
    try {
      document.querySelectorAll('#m-squadra-giorno .sq-scelta[data-gruppo="mezzo"]').forEach(function(el) {
        const m = (squadraAperta?.mezzi || []).find(function(x) { return x.id === el.dataset.id; });
        const spazio = el.querySelector('.sq-scelta-avvisi');
        if (m && m.fermo_dal && spazio && !spazio.querySelector('[data-fermo]')) {
          spazio.insertAdjacentHTML('beforeend', '<div data-fermo style="font-size:12px;color:var(--r);font-weight:600">' + esc(testoFermoMezzo(m)) + '</div>');
        }
      });
    } catch (e) { console.warn('Mezzo fermo:', e); }
    return esito;
  };
}

// ── Multe ─────────────────────────────────────────────────────────────
async function apriMulteMezzo(mezzoId) {
  if (!(await verificaMulteMezziDisponibili())) { toast('Le multe dei mezzi non sono ancora attive', 'err'); return; }
  if (!MEZZI_MULTE.mezzi || !MEZZI_MULTE.utenti) await leggiMezziEUtentiMulte();
  MEZZI_MULTE.mezzoId = mezzoId || null;
  const m = mezzoId ? mezzoDaId(mezzoId) : null;
  ge('mlt-titolo').textContent = m ? '🧾 Multe di ' + nomeMezzoSquadra(m) : '🧾 Multe dei mezzi';
  ge('mlt-form').style.display = 'none';
  ge('mlt-mostra-chiuse').checked = false;
  openM('m-mezzo-multe');
  await caricaMulteMezzo();
}

async function caricaMulteMezzo() {
  const box = ge('mlt-elenco');
  box.innerHTML = '<div class="empty">Caricamento…</div>';
  let q = db.from('mezzi_multe').select('*').order('data_infrazione', { ascending: false }).limit(300);
  if (MEZZI_MULTE.mezzoId) q = q.eq('mezzo_id', MEZZI_MULTE.mezzoId);
  const { data, error } = await q;
  if (error) { box.innerHTML = '<div class="al2 e">Multe non lette: ' + esc(error.message) + '</div>'; return; }
  MEZZI_MULTE.multe = data || [];
  disegnaMulteMezzo();
}

function multaAperta(x) {
  return !x.annullata && (!x.comunicato_il || !x.pagata_il || (ROLE === 'titolare' && !x.addebito));
}

function disegnaMulteMezzo() {
  const tutte = ge('mlt-mostra-chiuse').checked;
  const oggi = dataLocaleISO();
  const elenco = MEZZI_MULTE.multe.filter(function(x) { return tutte || multaAperta(x); });
  ge('mlt-elenco').innerHTML = elenco.length ? elenco.map(function(x) {
    const m = mezzoDaId(x.mezzo_id);
    const scaduta = !x.comunicato_il && x.scadenza_comunicazione < oggi;
    const vicina = !x.comunicato_il && !scaduta && x.scadenza_comunicazione <= aggiungiGiorniMulta(oggi, GG_AVVISO_CONDUCENTE);
    const stati = [];
    if (x.annullata) stati.push('<span class="bx bgray">Annullata</span>');
    else {
      stati.push(x.comunicato_il ? '<span class="bx bok">Conducente comunicato il ' + dataItMulta(x.comunicato_il) + '</span>'
        : '<span class="bx ' + (scaduta ? 'berr' : vicina ? 'bwarn' : 'bgray') + '">Comunicare il conducente entro il ' + dataItMulta(x.scadenza_comunicazione) + '</span>');
      stati.push(x.pagata_il ? '<span class="bx bok">Pagata il ' + dataItMulta(x.pagata_il) + (x.importo_pagato !== null ? ' (' + euroMulta(x.importo_pagato) + ')' : '') + '</span>' : '<span class="bx bwarn">Da pagare</span>');
      stati.push(x.addebito ? '<span class="bx bgray">Addebito: ' + (x.addebito === 'conducente' ? 'al conducente' : 'all\'azienda') + '</span>' : '<span class="bx bgray">Addebito da decidere (titolare)</span>');
    }
    return '<div style="padding:8px 0;border-bottom:1px solid var(--bo)">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<div style="font-size:13px;font-weight:600">' + dataItMulta(x.data_infrazione) + (x.ora_infrazione ? ' ore ' + esc(x.ora_infrazione) : '') +
          (MEZZI_MULTE.mezzoId ? '' : ' · ' + esc(m ? nomeMezzoSquadra(m) : 'mezzo')) +
          (x.importo !== null ? ' · ' + euroMulta(x.importo) : '') + '</div>' +
        '<button class="btn sm" onclick="apriMulta(\'' + esc(x.id) + '\')">✏️ Apri</button>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--m)">' + esc([x.luogo, x.numero_verbale ? 'verbale ' + x.numero_verbale : '', 'conducente: ' + (x.conducente_nome || 'da indicare')].filter(Boolean).join(' · ')) + '</div>' +
      '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">' + stati.join('') + '</div>' +
    '</div>';
  }).join('') : '<div class="empty">' + (tutte ? 'Nessuna multa registrata.' : 'Nessuna multa aperta.') + '</div>';
}

function aggiungiGiorniMulta(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dataLocaleISO(d);
}

function opzioniMezziMulta(scelto) {
  return (MEZZI_MULTE.mezzi || []).filter(function(m) { return m.tipo === 'mezzo' && (m.attivo !== false || m.id === scelto); })
    .map(function(m) { return '<option value="' + esc(m.id) + '"' + (m.id === scelto ? ' selected' : '') + '>' + esc(nomeMezzoSquadra(m)) + '</option>'; }).join('');
}

function opzioniConducentiMulta(scelto) {
  return '<option value="">— da indicare —</option>' + (MEZZI_MULTE.utenti || [])
    .filter(function(u) { return u.attivo !== false || u.id === scelto; })
    .map(function(u) { return '<option value="' + esc(u.id) + '"' + (u.id === scelto ? ' selected' : '') + '>' + esc(nomeUtenteMulta(u)) + '</option>'; }).join('');
}

function apriMulta(id) {
  const x = id ? MEZZI_MULTE.multe.find(function(r) { return r.id === id; }) : null;
  if (id && !x) return;
  const mezzo = x ? x.mezzo_id : (MEZZI_MULTE.mezzoId || '');
  ge('mlt-id').value = x ? x.id : '';
  ge('mlt-mezzo').innerHTML = opzioniMezziMulta(mezzo);
  ge('mlt-mezzo').disabled = !!x;
  ge('mlt-data').value = x ? x.data_infrazione : '';
  ge('mlt-data').max = dataLocaleISO();
  ge('mlt-ora').value = x?.ora_infrazione || '';
  ge('mlt-luogo').value = x?.luogo || '';
  ge('mlt-verbale').value = x?.numero_verbale || '';
  ge('mlt-importo').value = x && x.importo !== null ? String(x.importo).replace('.', ',') : '';
  ge('mlt-notifica').value = x?.data_notifica || '';
  ge('mlt-conducente').innerHTML = opzioniConducentiMulta(x?.conducente_id || '');
  ge('mlt-proposto').innerHTML = x?.conducente_proposto_nome ? 'Proposto dalla squadra: ' + esc(x.conducente_proposto_nome) : '';
  ge('mlt-comunicato').value = x?.comunicato_il || '';
  ge('mlt-pagata').value = x?.pagata_il || '';
  ge('mlt-pagato').value = x && x.importo_pagato !== null ? String(x.importo_pagato).replace('.', ',') : '';
  ge('mlt-addebito').value = x?.addebito || '';
  ge('mlt-addebito').disabled = ROLE !== 'titolare';
  ge('mlt-addebito-nota').textContent = x?.addebito_da_nome ? 'Deciso da ' + x.addebito_da_nome + ' il ' + dataItMulta(x.addebito_il) : (ROLE === 'titolare' ? '' : 'Lo decide il titolare');
  ge('mlt-nota').value = x?.nota || '';
  ge('mlt-annullata').checked = !!x?.annullata;
  ge('mlt-motivo').value = x?.annullata_motivo || '';
  ge('mlt-annulla-box').style.display = x ? '' : 'none';
  ge('mlt-scadenza').textContent = x ? 'Comunicare il conducente entro il ' + dataItMulta(x.scadenza_comunicazione) + ' (60 giorni dalla notifica o, se manca, dalla data della multa)' : 'Il conducente va comunicato entro 60 giorni dalla notifica (o dalla data della multa).';
  ge('mlt-form').style.display = '';
  ge('mlt-form').scrollIntoView({ block: 'start' });
}

// Conducente proposto: chi era nella squadra del cantiere quel giorno con quel mezzo
async function proponiConducenteMulta() {
  const mezzo = v('mlt-mezzo');
  const giorno = v('mlt-data');
  const box = ge('mlt-proposto');
  if (!mezzo || !giorno) { box.innerHTML = ''; return; }
  box.innerHTML = 'Cerco chi aveva il mezzo quel giorno…';
  const { data, error } = await db.from('commesse_squadra_giorni')
    .select('data, commesse(codice), commesse_squadra_mezzi!inner(mezzo_id), commesse_squadra_persone(utente_id)')
    .eq('data', giorno).eq('commesse_squadra_mezzi.mezzo_id', mezzo);
  if (error) { box.innerHTML = 'Squadra non letta: ' + esc(error.message); return; }
  const persone = [];
  const codici = [];
  (data || []).forEach(function(g) {
    if (g.commesse?.codice) codici.push(g.commesse.codice);
    (g.commesse_squadra_persone || []).forEach(function(p) { if (p.utente_id && !persone.includes(p.utente_id)) persone.push(p.utente_id); });
  });
  if (!persone.length) { box.innerHTML = 'Nessuna squadra di cantiere con questo mezzo quel giorno: scegli il conducente a mano.'; box.dataset.nomi = ''; return; }
  const nomi = persone.map(function(id) { return nomeUtenteMulta((MEZZI_MULTE.utenti || []).find(function(u) { return u.id === id; })) || 'utente'; });
  box.dataset.nomi = nomi.join(', ') + (codici.length ? ' (commessa ' + codici.join(', ') + ')' : '');
  box.innerHTML = 'In squadra con il mezzo (commessa ' + esc(codici.join(', ')) + '): <b>' + esc(nomi.join(', ')) + '</b>' +
    (persone.length > 1 ? '. Scegli chi guidava.' : '. Proposto come conducente.');
  if (persone.length === 1 && !v('mlt-conducente')) ge('mlt-conducente').value = persone[0];
}

async function salvaMulta() {
  const id = v('mlt-id');
  const importo = numeroDaCampoMulta('mlt-importo');
  const pagato = numeroDaCampoMulta('mlt-pagato');
  if (Number.isNaN(importo) || Number.isNaN(pagato)) { toast('Importo non valido: scrivi un numero (es. 42,00)', 'err'); return; }
  if (!v('mlt-mezzo')) { toast('Scegli il mezzo', 'err'); return; }
  if (!v('mlt-data')) { toast('Indica la data della multa', 'err'); return; }
  const annullata = ge('mlt-annullata').checked;
  const motivo = String(v('mlt-motivo') || '').trim();
  if (annullata && motivo.length < 3) { toast('Scrivi perché la multa è annullata', 'err'); return; }
  const riga = {
    data_infrazione: v('mlt-data'),
    ora_infrazione: String(v('mlt-ora') || '').trim() || null,
    luogo: String(v('mlt-luogo') || '').trim() || null,
    numero_verbale: String(v('mlt-verbale') || '').trim() || null,
    importo: importo,
    data_notifica: v('mlt-notifica') || null,
    conducente_id: v('mlt-conducente') || null,
    comunicato_il: v('mlt-comunicato') || null,
    pagata_il: v('mlt-pagata') || null,
    importo_pagato: pagato,
    nota: String(v('mlt-nota') || '').trim() || null,
    annullata: annullata,
    annullata_motivo: annullata ? motivo : null
  };
  const proposto = ge('mlt-proposto').dataset.nomi;
  if (proposto) riga.conducente_proposto_nome = proposto.slice(0, 500);
  if (ROLE === 'titolare') riga.addebito = v('mlt-addebito') || null;
  let r;
  if (id) r = await db.from('mezzi_multe').update(riga).eq('id', id).select('scadenza_comunicazione').single();
  else { riga.mezzo_id = v('mlt-mezzo'); r = await db.from('mezzi_multe').insert(riga).select('scadenza_comunicazione').single(); }
  if (r.error) { toast('Multa non salvata: ' + r.error.message, 'err'); return; }
  toast((id ? 'Multa salvata' : 'Multa registrata') + (r.data && !riga.comunicato_il ? ': comunicare il conducente entro il ' + dataItMulta(r.data.scadenza_comunicazione) : ''), 'ok');
  ge('mlt-form').style.display = 'none';
  await caricaMulteMezzo();
}

// ── Cosa tocca a me ───────────────────────────────────────────────────
if (typeof registraFonteToccaAMe === 'function') {
  const contaMulte = async function(filtro) {
    if (!(await verificaMulteMezziDisponibili())) return null;
    return numeroTAM(filtro(contaTAM('mezzi_multe').eq('annullata', false)), 'multe');
  };
  registraFonteToccaAMe({
    id: 'multe-conducente', ruoli: ['segreteria', 'titolare'], icona: '🧾', livello: 'urgente', priorita: 40,
    titolo: 'Multe: conducente da comunicare (entro ' + GG_AVVISO_CONDUCENTE + ' giorni o scaduto)',
    vai: function() { apriMulteMezzo(null); },
    conta: function() { return contaMulte(function(q) { return q.is('comunicato_il', null).lte('scadenza_comunicazione', aggiungiGiorniMulta(dataLocaleISO(), GG_AVVISO_CONDUCENTE)); }); }
  });
  registraFonteToccaAMe({
    id: 'multe-da-pagare', ruoli: ['segreteria', 'titolare'], icona: '🧾', priorita: 41,
    titolo: 'Multe da pagare',
    vai: function() { apriMulteMezzo(null); },
    conta: function() { return contaMulte(function(q) { return q.is('pagata_il', null); }); }
  });
  registraFonteToccaAMe({
    id: 'multe-addebito', ruoli: ['titolare'], icona: '🧾', priorita: 42,
    titolo: 'Multe: addebito da decidere',
    vai: function() { apriMulteMezzo(null); },
    conta: function() { return contaMulte(function(q) { return q.is('addebito', null); }); }
  });
}
