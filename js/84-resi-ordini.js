// ── F18.21 — RESO: MATERIALE SBAGLIATO, DANNEGGIATO O MANCANTE (sql/147) ──
// Scelto da Erika il 16/11. Nel box "🛒 Ordini ai fornitori" della commessa
// (js/27), sotto ogni ordine ARRIVATO:
//   - "⚠️ Segnala problema" (capo tecnico, Acquisti, titolare): sbagliato /
//     danneggiato / mancante, descrizione, voci dell'ordine con la quantità,
//     foto (facoltative, nella cartella "ordini" della commessa, rimpicciolite
//     come quelle del giornale). Avviso ad Acquisti (database).
//   - l'elenco dei resi dell'ordine con stato; "Apri" = finestra m-reso
//     (id rso-): Acquisti e titolare "📦 Reso al fornitore", "🔁 Riordina"
//     (ordine libero di js/80 già compilato con fornitore e voci: l'ordine
//     arrivato non si rifà dalla stessa offerta; il nuovo ordine si collega da
//     solo al reso), "✅ Chiudi" con l'esito; il titolare la CAUSALE
//     (fornitore, rilievo, trasporto, progetto).
// Cosa tocca a me: Acquisti "Resi da gestire", titolare "Resi: causale da
// decidere". NON FATTI: magazzino "fuori standard" (modulo Magazzino) e riga
// nel report del venerdì (non esiste ancora). Senza sql/147 nulla compare.

const RESI = { attivo: null, perOrdine: {}, aperto: null };
const RUOLI_SEGNALANO_RESI = ['titolare', 'capo_tecnico', 'commerciale'];
const RUOLI_GESTISCONO_RESI = ['titolare', 'commerciale'];
const PROBLEMI_RESO = { sbagliato: 'Materiale sbagliato', danneggiato: 'Materiale danneggiato', mancante: 'Materiale mancante' };
const STATI_RESO = { segnalato: 'Segnalato ad Acquisti', reso_inviato: 'Reso al fornitore', chiuso: 'Chiuso' };
const ESITI_RESO = { sostituito: 'Sostituito', rimborsato: 'Rimborsato', tenuto: 'Tenuto (accordo)', altro: 'Altro' };
const CAUSALI_RESO = { fornitore: 'Fornitore', rilievo: 'Rilievo', trasporto: 'Trasporto', progetto: 'Progetto' };

async function verificaResiOrdiniDisponibili() {
  if (RESI.attivo !== null) return RESI.attivo;
  try {
    const { data, error } = await db.rpc('resi_ordini_attivi');
    RESI.attivo = !error && data === true;
  } catch (e) { RESI.attivo = false; }
  return RESI.attivo;
}

function classeStatoReso(r) { return r.stato === 'chiuso' ? 'bok' : r.stato === 'reso_inviato' ? 'bblue' : 'bwarn'; }

function htmlResiOrdine(o) {
  const resi = RESI.perOrdine[o.id] || [];
  const righe = resi.map(function(r) {
    return '<div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px;padding:4px 0">' +
      '<span>⚠️ <b>' + esc(PROBLEMI_RESO[r.problema] || r.problema) + '</b> · ' + esc(r.descrizione) +
      ' <span class="bx ' + classeStatoReso(r) + '">' + esc(r.stato === 'chiuso' ? 'Chiuso: ' + (ESITI_RESO[r.esito] || r.esito) : STATI_RESO[r.stato]) + '</span>' +
      (r.causale ? ' <span class="bx bgray">Causale: ' + esc(CAUSALI_RESO[r.causale]) + '</span>' : (ROLE === 'titolare' ? ' <span class="bx bgray">Causale da decidere</span>' : '')) + '</span>' +
      '<button class="btn sm" onclick="apriReso(\'' + esc(r.id) + '\')">Apri</button></div>';
  }).join('');
  const segnala = o.stato === 'arrivato' && RUOLI_SEGNALANO_RESI.includes(ROLE)
    ? '<button class="btn sm" style="color:var(--a)" onclick="apriSegnalaReso(\'' + esc(o.id) + '\')">⚠️ Segnala problema</button>' : '';
  if (!righe && !segnala) return '';
  return '<div data-resi-ordine style="margin-top:4px;padding:4px 8px;border-left:3px solid var(--a);background:rgba(217,119,6,.05);border-radius:4px">' +
    righe + (segnala ? '<div style="margin-top:4px">' + segnala + '</div>' : '') + '</div>';
}

if (typeof caricaOrdiniCommessa === 'function') {
  const caricaOrdiniCommessaSenzaResi = caricaOrdiniCommessa;
  // eslint-disable-next-line no-global-assign
  caricaOrdiniCommessa = async function(commessa) {
    const esito = await caricaOrdiniCommessaSenzaResi.apply(this, arguments);
    try {
      if (!commessa || !(await verificaResiOrdiniDisponibili())) return esito;
      const { data, error } = await db.from('ordini_fornitori_resi').select('*').eq('commessa_id', commessa.id).order('segnalato_il');
      if (error) { console.warn('Resi:', error.message); return esito; }
      RESI.perOrdine = {};
      (data || []).forEach(function(r) { (RESI.perOrdine[r.ordine_id] = RESI.perOrdine[r.ordine_id] || []).push(r); });
      (ordiniCommessaAperta || []).forEach(function(o) {
        const riga = document.querySelector('#cmd-ordini [data-ordine-id="' + o.id + '"]');
        if (!riga || riga.querySelector('[data-resi-ordine]')) return;
        const html = htmlResiOrdine(o);
        if (!html) return;
        const det = riga.querySelector('details');
        if (det) det.insertAdjacentHTML('beforebegin', html); else riga.insertAdjacentHTML('beforeend', html);
      });
    } catch (e) { console.warn('Resi degli ordini:', e); }
    return esito;
  };
}

function trovaReso(id) {
  for (const k in RESI.perOrdine) { const r = RESI.perOrdine[k].find(function(x) { return x.id === id; }); if (r) return r; }
  return null;
}

// ── Segnalazione ──────────────────────────────────────────────────────
function apriSegnalaReso(ordineId) {
  const o = (ordiniCommessaAperta || []).find(function(x) { return x.id === ordineId; });
  if (!o) return;
  RESI.aperto = { ordine: o, reso: null };
  ge('rso-titolo').textContent = '⚠️ Problema con l\'ordine ' + o.codice;
  ge('rso-sottotitolo').textContent = (o.fornitore_ragione_sociale || '') + ' · arrivato il ' + fd(o.data_arrivo);
  ge('rso-segnala').style.display = '';
  ge('rso-gestisci').style.display = 'none';
  ge('rso-problema').value = 'danneggiato';
  ge('rso-descrizione').value = '';
  ge('rso-foto').value = '';
  ge('rso-voci').innerHTML = (o.ordini_fornitori_voci || []).map(function(voce, i) {
    return '<label style="display:flex;gap:8px;align-items:center;font-size:13px;padding:4px 0;flex-wrap:wrap">' +
      '<input type="checkbox" data-voce="' + i + '"' + ((o.ordini_fornitori_voci || []).length === 1 ? ' checked' : '') + '>' +
      '<span style="flex:1;min-width:150px">' + esc(voce.descrizione) + '</span>' +
      '<input type="text" inputmode="decimal" data-quantita="' + i + '" value="' + esc(String(voce.quantita).replace('.', ',')) + '" style="width:70px"> ' + esc(voce.unita_misura || '') + '</label>';
  }).join('') || '<div class="empty">L\'ordine non ha voci.</div>';
  openM('m-reso');
}

async function salvaSegnalaReso() {
  const a = RESI.aperto;
  if (!a || !a.ordine) return;
  const o = a.ordine;
  const descrizione = String(v('rso-descrizione') || '').trim();
  if (descrizione.length < 3) { toast('Descrivi il problema (es. porta ammaccata sul montante)', 'err'); return; }
  const voci = [];
  let errore = '';
  document.querySelectorAll('#rso-voci input[data-voce]').forEach(function(c) {
    if (!c.checked) return;
    const i = Number(c.dataset.voce);
    const voce = o.ordini_fornitori_voci[i];
    const q = Number(String(document.querySelector('#rso-voci input[data-quantita="' + i + '"]').value || '').replace(/\./g, '').replace(',', '.'));
    if (!(q > 0)) errore = 'Quantità non valida per «' + voce.descrizione + '»';
    voci.push({ descrizione: voce.descrizione, quantita: q, unita: voce.unita_misura || 'pz' });
  });
  if (errore) { toast(errore, 'err'); return; }
  if (!voci.length) { toast('Spunta almeno una voce con il problema', 'err'); return; }
  const bottone = ge('rso-salva-segnala');
  bottone.disabled = true;
  const foto = [];
  const files = Array.from(ge('rso-foto').files || []).slice(0, 10);
  for (const f0 of files) {
    const f = typeof ridimensionaFotoGiornale === 'function' ? await ridimensionaFotoGiornale(f0) : f0;
    const nome = (f0.name || 'foto.jpg').slice(0, 150);
    const path = o.commessa_id + '/ordini/' + Date.now() + '_reso_' + nome.replace(/[^a-zA-Z0-9._-]/g, '_');
    const up = await db.storage.from('commesse-documenti').upload(path, f, { upsert: false, contentType: f.type || 'image/jpeg' });
    if (up.error) { bottone.disabled = false; toast('Foto non caricata: ' + up.error.message, 'err'); return; }
    const reg = await db.rpc('registra_documento_commessa', { p_commessa_id: o.commessa_id, p_cartella: 'ordini', p_storage_path: path, p_nome_file: nome, p_nota: 'Foto del reso dell\'ordine ' + o.codice });
    if (reg.error) { await db.storage.from('commesse-documenti').remove([path]); bottone.disabled = false; toast('Foto non registrata: ' + reg.error.message, 'err'); return; }
    foto.push({ path: path, nome: nome });
  }
  const { error } = await db.rpc('segnala_reso_ordine', { p_ordine_id: o.id, p_problema: v('rso-problema'), p_descrizione: descrizione, p_voci: voci, p_foto: foto });
  bottone.disabled = false;
  if (error) { toast('Problema non segnalato: ' + error.message, 'err'); return; }
  closeM('m-reso');
  toast('Problema segnalato' + (ROLE === 'commerciale' ? '' : ': Acquisti riceve l\'avviso'), 'ok');
  if (commessaApertaId) await caricaSchedaCommessa(commessaApertaId);
}

// ── Gestione (Acquisti, titolare) e causale (titolare) ─────────────────
function apriReso(id) {
  const r = trovaReso(id);
  if (!r) return;
  const o = (ordiniCommessaAperta || []).find(function(x) { return x.id === r.ordine_id; }) || {};
  RESI.aperto = { ordine: o, reso: r };
  ge('rso-titolo').textContent = '⚠️ ' + (PROBLEMI_RESO[r.problema] || 'Reso') + ' · ordine ' + (o.codice || '');
  ge('rso-sottotitolo').textContent = (o.fornitore_ragione_sociale || '') + ' · ' + STATI_RESO[r.stato] + (r.esito ? ': ' + ESITI_RESO[r.esito] : '');
  ge('rso-segnala').style.display = 'none';
  ge('rso-gestisci').style.display = '';
  const riordine = r.riordine_ordine_id ? (ordiniCommessaAperta || []).find(function(x) { return x.id === r.riordine_ordine_id; }) : null;
  const passi = [
    'Segnalato il ' + dataOraEsitoPreventivo(r.segnalato_il) + ' da ' + (r.segnalato_da_nome || '') + (r.segnalato_da_ruolo ? ' (' + etichettaRuolo(r.segnalato_da_ruolo) + ')' : '') + ': ' + r.descrizione,
    'Voci: ' + (r.voci || []).map(function(x) { return x.descrizione + ' × ' + String(x.quantita).replace('.', ',') + ' ' + (x.unita || ''); }).join('; '),
    r.reso_inviato_il ? 'Reso al fornitore il ' + dataOraEsitoPreventivo(r.reso_inviato_il) + ' da ' + (r.reso_inviato_da_nome || '') + (r.nota_reso ? ': ' + r.nota_reso : '') : '',
    riordine ? 'Riordino: ordine ' + riordine.codice + ' (' + (riordine.stato || '') + ')' : '',
    r.chiuso_il ? 'Chiuso il ' + dataOraEsitoPreventivo(r.chiuso_il) + ' da ' + (r.chiuso_da_nome || '') + ': ' + ESITI_RESO[r.esito] + (r.nota_chiusura ? ' · ' + r.nota_chiusura : '') : '',
    r.causale ? 'Causale: ' + CAUSALI_RESO[r.causale] + ' (' + (r.causale_da_nome || '') + ', ' + dataOraEsitoPreventivo(r.causale_il) + ')' + (r.causale_nota ? ': ' + r.causale_nota : '') : ''
  ].filter(Boolean);
  ge('rso-passi').innerHTML = passi.map(function(p) { return '<div style="word-break:break-word">• ' + esc(p) + '</div>'; }).join('') +
    ((r.foto || []).length ? '<div style="margin-top:6px">' + r.foto.map(function(f) { return '<button class="btn sm" style="margin:2px" data-path="' + esc(f.path) + '" onclick="apriAllegatoOrdineLibero(this.dataset.path)">📷 ' + esc(f.nome) + '</button>'; }).join('') + '</div>' : '');
  const gestisce = RUOLI_GESTISCONO_RESI.includes(ROLE) && r.stato !== 'chiuso';
  ge('rso-azioni').style.display = gestisce ? '' : 'none';
  ge('rso-reso-inviato').style.display = gestisce && r.stato === 'segnalato' ? '' : 'none';
  ge('rso-riordina').style.display = gestisce && !r.riordine_ordine_id && typeof apriOrdineLibero === 'function' ? '' : 'none';
  ge('rso-nota').value = '';
  ge('rso-esito').value = '';
  ge('rso-causale-box').style.display = ROLE === 'titolare' ? '' : 'none';
  ge('rso-causale').value = r.causale || '';
  ge('rso-causale-nota').value = r.causale_nota || '';
  openM('m-reso');
}

async function azioneReso(azione) {
  const r = RESI.aperto && RESI.aperto.reso;
  if (!r) return;
  const esito = v('rso-esito');
  if (azione === 'chiudi' && !esito) { toast('Scegli l\'esito del reso', 'err'); return; }
  const { error } = await db.rpc('aggiorna_reso_ordine', { p_id: r.id, p_azione: azione, p_esito: azione === 'chiudi' ? esito : null, p_nota: String(v('rso-nota') || '').trim() || null, p_riordine_ordine_id: null });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  closeM('m-reso');
  toast(azione === 'chiudi' ? 'Reso chiuso' : 'Segnato: reso al fornitore', 'ok');
  if (commessaApertaId) await caricaSchedaCommessa(commessaApertaId);
}

async function riordinaReso() {
  const a = RESI.aperto;
  if (!a || !a.reso || !a.ordine) return;
  const r = a.reso, o = a.ordine;
  closeM('m-reso');
  await apriOrdineLibero();
  ge('mof-titolo').textContent = '🔁 Riordino per il reso dell\'ordine ' + o.codice;
  if (o.fornitore_id) ge('mof-libero-fornitore').value = o.fornitore_id;
  vociNuovoOrdine = (r.voci || []).map(function(x) {
    const orig = (o.ordini_fornitori_voci || []).find(function(vv) { return vv.descrizione === x.descrizione; }) || {};
    return { descrizione: x.descrizione, unita_misura: x.unita || orig.unita_misura || 'pz', quantita: x.quantita, prezzo_unitario: orig.prezzo_unitario != null ? orig.prezzo_unitario : '', preventivo_voce_id: null };
  });
  renderVociNuovoOrdine();
  ge('mof-note').value = 'Riordino per il materiale ' + r.problema + ' dell\'ordine ' + o.codice + '. ' + (ge('mof-note').value || '');
  dopoOrdineLibero = async function(nuovoId) {
    const { error } = await db.rpc('aggiorna_reso_ordine', { p_id: r.id, p_azione: 'riordine', p_esito: null, p_nota: null, p_riordine_ordine_id: nuovoId });
    if (error) toast('Ordine creato, ma non collegato al reso: ' + error.message, 'err');
  };
}

async function salvaCausaleReso() {
  const r = RESI.aperto && RESI.aperto.reso;
  if (!r) return;
  const { error } = await db.rpc('imposta_causale_reso', { p_id: r.id, p_causale: v('rso-causale') || null, p_nota: String(v('rso-causale-nota') || '').trim() || null });
  if (error) { toast('Causale non salvata: ' + error.message, 'err'); return; }
  closeM('m-reso');
  toast('Causale salvata', 'ok');
  if (commessaApertaId) await caricaSchedaCommessa(commessaApertaId);
}

// ── Avvisi e Cosa tocca a me ──────────────────────────────────────────
if (typeof TIPI_AVVISO !== 'undefined') TIPI_AVVISO.reso_segnalato = { icona: '⚠️', nome: 'Materiale da rendere al fornitore' };

async function resiDaVedere(filtro) {
  if (!(await verificaResiOrdiniDisponibili())) return null;
  const { data, error } = await filtro(db.from('ordini_fornitori_resi').select('id, commessa_id').order('segnalato_il').limit(200));
  if (error) { console.warn('Resi:', error.message); return null; }
  return data || [];
}

async function vaiResi(filtro) {
  const e = await resiDaVedere(filtro);
  if (!e || !e.length) return;
  if (e.length > 1) toast('Apro la commessa del primo di ' + e.length + ' resi', 'ok');
  openCommessaDetail(e[0].commessa_id);
}

if (typeof registraFonteToccaAMe === 'function') {
  const daGestire = function(q) { return q.in('stato', ['segnalato', 'reso_inviato']); };
  const senzaCausale = function(q) { return q.is('causale', null); };
  registraFonteToccaAMe({
    id: 'resi-da-gestire', ruoli: ['commerciale'], icona: '⚠️', livello: 'urgente', priorita: 27,
    titolo: 'Resi da gestire (materiale sbagliato o danneggiato)',
    vai: function() { vaiResi(daGestire); },
    conta: async function() { const e = await resiDaVedere(daGestire); return e === null ? null : e.length; }
  });
  registraFonteToccaAMe({
    id: 'resi-causale', ruoli: ['titolare'], icona: '⚠️', priorita: 30,
    titolo: 'Resi: causale da decidere',
    vai: function() { vaiResi(senzaCausale); },
    conta: async function() { const e = await resiDaVedere(senzaCausale); return e === null ? null : e.length; }
  });
}
