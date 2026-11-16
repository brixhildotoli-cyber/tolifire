// ── F18.14 — NOLI: RESTITUZIONE, PROROGA E AVVISO 2 GIORNI PRIMA (sql/141) ──
// Versione decisa da Erika il 16/11 (niente "nolo contestato"). Sulle righe
// dei NOLI di "🧰 Consumabili e noli" (js/28) procurati dagli acquisti
// (evasa o arrivata):
//   - "Da restituire entro il ..." (rossa se passata, gialla entro 2 giorni);
//   - "↩️ Restituito" (titolare, capo tecnico, Acquisti, segreteria: RPC
//     segna_nolo_restituito, data non futura) e "📅 Proroga" con nuova data e
//     motivo (titolare, capo tecnico, Acquisti: proroga_nolo);
//   - restituito: "↩️ Restituito il ..." e per il titolare "Togli" (errore);
//   - nei "Dettagli e passaggi" le proroghe (da, a, motivo, chi, quando).
// Cosa tocca a me di capo tecnico e Acquisti: "Noli da restituire entro 2
// giorni" e, rossa, "Noli scaduti da restituire" (calcolate nel sito come
// F15.18: niente motore delle scadenze). Finestra m-nolo (id nol-).
// Senza sql/141: righe come prima, nessuna riga in Cosa tocca a me.

const NOLI = { attivo: null, richiesta: null, modo: null };
const RUOLI_RESTITUISCONO_NOLI = ['titolare', 'capo_tecnico', 'commerciale', 'segreteria'];
const RUOLI_PROROGANO_NOLI = ['titolare', 'capo_tecnico', 'commerciale'];
const GG_AVVISO_NOLO = 2;

async function verificaNoliRestituzioneDisponibile() {
  if (NOLI.attivo !== null) return NOLI.attivo;
  try {
    const { data, error } = await db.rpc('noli_restituzione_attiva');
    NOLI.attivo = !error && data === true;
  } catch (e) { NOLI.attivo = false; }
  return NOLI.attivo;
}

function giorniAlNolo(fino) {
  if (!fino) return null;
  const oggi = new Date(dataLocaleISO() + 'T12:00:00');
  return Math.round((new Date(String(fino).slice(0, 10) + 'T12:00:00') - oggi) / 86400000);
}

function noloDaRestituire(r) {
  return r && r.tipo === 'nolo' && (r.stato === 'evasa' || r.stato === 'arrivata') && !r.restituito_il;
}

function htmlRestituzioneNolo(r) {
  if (!NOLI.attivo || !r || r.tipo !== 'nolo' || !('proroghe' in r)) return '';
  const id = esc(r.id);
  if (r.restituito_il) {
    return '<div style="font-size:12px;margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
      '<span class="bx bok">↩️ Restituito il ' + esc(fd(r.restituito_il)) + '</span>' +
      (ROLE === 'titolare' ? '<button class="btn sm" onclick="togliRestituzioneNolo(\'' + id + '\')">Togli (errore)</button>' : '') + '</div>';
  }
  if (!noloDaRestituire(r)) return '';
  const gg = giorniAlNolo(r.nolo_fino_al);
  const etichetta = r.nolo_fino_al
    ? '<span class="bx ' + (gg < 0 ? 'berr' : gg <= GG_AVVISO_NOLO ? 'bwarn' : 'bgray') + '">' +
      (gg < 0 ? '⏰ Da restituire: scaduto il ' : 'Da restituire entro il ') + esc(fd(r.nolo_fino_al)) + '</span>'
    : '<span class="bx bgray">Data di restituzione non indicata</span>';
  const bottoni = [];
  if (RUOLI_RESTITUISCONO_NOLI.includes(ROLE)) bottoni.push('<button class="btn sm p" onclick="apriNolo(\'' + id + '\', \'restituito\')">↩️ Restituito</button>');
  if (RUOLI_PROROGANO_NOLI.includes(ROLE)) bottoni.push('<button class="btn sm" onclick="apriNolo(\'' + id + '\', \'proroga\')">📅 Proroga</button>');
  return '<div data-nolo-restituzione style="font-size:12px;margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + etichetta + bottoni.join('') + '</div>';
}

if (typeof htmlRigaRichiestaIntegrazione === 'function') {
  const htmlRigaRichiestaIntegrazioneSenzaNoli = htmlRigaRichiestaIntegrazione;
  // eslint-disable-next-line no-global-assign
  htmlRigaRichiestaIntegrazione = function(commessa, r) {
    const html = htmlRigaRichiestaIntegrazioneSenzaNoli.apply(this, arguments);
    const extra = htmlRestituzioneNolo(r);
    if (!extra) return html;
    const i = html.indexOf('<details');
    return i < 0 ? html + extra : html.slice(0, i) + extra + html.slice(i);
  };
}

if (typeof htmlDettaglioRichiestaIntegrazione === 'function') {
  const htmlDettaglioRichiestaIntegrazioneSenzaNoli = htmlDettaglioRichiestaIntegrazione;
  // eslint-disable-next-line no-global-assign
  htmlDettaglioRichiestaIntegrazione = function(r) {
    const html = htmlDettaglioRichiestaIntegrazioneSenzaNoli.apply(this, arguments);
    if (!r || r.tipo !== 'nolo' || !Array.isArray(r.proroghe)) return html;
    const righe = r.proroghe.map(function(p) {
      return 'Prorogato ' + (p.da ? 'dal ' + fd(p.da) + ' ' : '') + 'al ' + fd(p.a) + (p.chi ? ' da ' + p.chi : '') +
        (p.il ? ' il ' + dataOraEsitoPreventivo(p.il) : '') + ': ' + (p.motivo || '');
    });
    if (r.restituito_il) righe.push('Restituito il ' + fd(r.restituito_il) + (r.restituito_da_nome ? ' (segnato da ' + r.restituito_da_nome + ')' : '') + (r.nota_restituzione ? ': ' + r.nota_restituzione : ''));
    if (!righe.length) return html;
    const i = html.lastIndexOf('</div>');
    return html.slice(0, i) + righe.map(function(t) { return '<div style="word-break:break-word">• ' + esc(t) + '</div>'; }).join('') + html.slice(i);
  };
}

// Prima di disegnare, la verifica (una volta sola)
['caricaRichiesteIntegrazioneCommessa', 'caricaRichiesteIntegrazioneDashboard'].forEach(function(nome) {
  if (typeof window[nome] !== 'function') return;
  const originale = window[nome];
  window[nome] = async function() {
    await verificaNoliRestituzioneDisponibile();
    return originale.apply(this, arguments);
  };
});

function apriNolo(id, modo) {
  const r = richiesteIntegrazioneCache[id];
  if (!r) return;
  NOLI.richiesta = id; NOLI.modo = modo;
  const proroga = modo === 'proroga';
  ge('nol-titolo').textContent = (proroga ? '📅 Proroga del nolo n. ' : '↩️ Nolo restituito n. ') + r.numero;
  ge('nol-cosa').textContent = testoCosaRichiestaIntegrazione(r) + (r.nolo_fino_al ? ' · da restituire entro il ' + fd(r.nolo_fino_al) : '');
  ge('nol-etichetta-data').textContent = proroga ? 'Nuova data di restituzione *' : 'Restituito il *';
  ge('nol-data').value = proroga ? '' : dataLocaleISO();
  ge('nol-data').max = proroga ? '' : dataLocaleISO();
  ge('nol-data').min = proroga && r.nolo_fino_al ? aggiungiGiorniNolo(r.nolo_fino_al, 1) : '';
  ge('nol-etichetta-testo').textContent = proroga ? 'Motivo della proroga *' : 'Nota (facoltativa)';
  ge('nol-testo').value = '';
  ge('nol-testo').placeholder = proroga ? 'es. lavori in quota non finiti, il cliente ha spostato i lavori' : 'es. ritirato dal noleggiatore in cantiere';
  ge('nol-salva').textContent = proroga ? '📅 Proroga' : '↩️ Segna restituito';
  openM('m-nolo');
}

function aggiungiGiorniNolo(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dataLocaleISO(d);
}

async function salvaNolo() {
  const data = v('nol-data');
  const testo = String(v('nol-testo') || '').trim();
  if (!data) { toast('Indica la data', 'err'); return; }
  let r;
  if (NOLI.modo === 'proroga') {
    if (testo.length < 3) { toast('Scrivi il motivo della proroga', 'err'); return; }
    r = await db.rpc('proroga_nolo', { p_richiesta_id: NOLI.richiesta, p_fino_al: data, p_motivo: testo });
  } else {
    r = await db.rpc('segna_nolo_restituito', { p_richiesta_id: NOLI.richiesta, p_data: data, p_nota: testo || null });
  }
  if (r.error) { toast('Non salvato: ' + r.error.message, 'err'); return; }
  closeM('m-nolo');
  toast(NOLI.modo === 'proroga' ? 'Nolo prorogato al ' + fd(data) : 'Nolo segnato restituito', 'ok');
  await aggiornaDopoRichiestaIntegrazione();
}

async function togliRestituzioneNolo(id) {
  if (!confirm('Togliere la restituzione segnata per errore? Il nolo torna "da restituire".')) return;
  const { error } = await db.rpc('annulla_restituzione_nolo', { p_richiesta_id: id });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  toast('Restituzione tolta', 'ok');
  await aggiornaDopoRichiestaIntegrazione();
}

// ── Cosa tocca a me: capo tecnico e Acquisti ─────────────────────────
async function noliDaRestituire(scaduti) {
  if (!(await verificaNoliRestituzioneDisponibile())) return null;
  const oggi = dataLocaleISO();
  let q = db.from('commesse_richieste_integrazione').select('id, commessa_id, nolo_fino_al, commesse!inner(stato)')
    .eq('tipo', 'nolo').in('stato', ['evasa', 'arrivata']).is('restituito_il', null).not('nolo_fino_al', 'is', null)
    .neq('commesse.stato', 'annullata').order('nolo_fino_al', { ascending: true }).limit(200);
  q = scaduti ? q.lt('nolo_fino_al', oggi) : q.gte('nolo_fino_al', oggi).lte('nolo_fino_al', aggiungiGiorniNolo(oggi, GG_AVVISO_NOLO));
  const { data, error } = await q;
  if (error) { console.warn('Noli da restituire:', error.message); return null; }
  return data || [];
}

async function vaiNoliDaRestituire(scaduti) {
  const e = await noliDaRestituire(scaduti);
  if (!e || !e.length) return;
  if (e.length > 1) toast('Apro la commessa del primo di ' + e.length + ' noli', 'ok');
  openCommessaDetail(e[0].commessa_id);
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'noli-scaduti', ruoli: ['capo_tecnico', 'commerciale'], icona: '⏰', livello: 'urgente', priorita: 30,
    titolo: 'Noli scaduti da restituire (o da prorogare)',
    vai: function() { vaiNoliDaRestituire(true); },
    conta: async function() { const e = await noliDaRestituire(true); return e === null ? null : e.length; }
  });
  registraFonteToccaAMe({
    id: 'noli-in-scadenza', ruoli: ['capo_tecnico', 'commerciale'], icona: '🏗️', priorita: 31,
    titolo: 'Noli da restituire entro ' + GG_AVVISO_NOLO + ' giorni',
    vai: function() { vaiNoliDaRestituire(false); },
    conta: async function() { const e = await noliDaRestituire(false); return e === null ? null : e.length; }
  });
}
