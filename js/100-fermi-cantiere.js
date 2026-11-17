// ── F20.10 — FERMI DEL CANTIERE (sql/178) ────────────────────────────────
// Decisione di Erika del 17/11: versione completa.
//   - "🛑 Fermo" nel giorno di cantiere del tecnico (js/33,
//     htmlGiornoCantiereTecnico) e "🛑 Fermo del cantiere" tra le azioni della
//     commessa (capo tecnico, titolare): finestra m-fermo-cantiere (id frm-)
//     con causa, ora di inizio e fine attesa, nota.
//   - Riquadro cmd-fermi nella commessa: fermi con causa, attesa, stato e
//     addebito; "📅 Riprogramma" (segreteria, capo tecnico, titolare) e
//     "💶 Addebito" (titolare) nella finestra m-gestisci-fermo (id gfr-).
//   - Cosa tocca a me: fermi da riprogrammare (segreteria), addebiti da
//     decidere (titolare), fermi con noli aperti (Acquisti: prorogare?).
// Gli avvisi li crea il database (capo tecnico, segreteria, titolare).
// Senza sql/178 nessun bottone.

const FERMI = { attivo: null, ctx: null, aperto: null };
const CAUSE_FERMO = {
  cliente_assente: '🚪 Cliente assente', accesso_negato: '⛔ Accesso negato', area_non_pronta: '🚧 Area non pronta',
  materiale_mancante: '📦 Materiale mancante', meteo: '🌧️ Meteo', altro: '✏️ Altro'
};
const STATI_FERMO = { da_riprogrammare: 'Da riprogrammare', riprogrammato: 'Riprogrammato', non_serve: 'Non serve riprogrammare' };
const ADDEBITI_FERMO = { da_decidere: 'Addebito da decidere (titolare)', addebitare: 'Da addebitare', non_addebitare: 'Non addebitato' };

async function verificaFermiDisponibili() {
  if (FERMI.attivo !== null) return FERMI.attivo;
  if (!['titolare', 'segreteria', 'capo_tecnico', 'tecnico', 'commerciale'].includes(ROLE)) { FERMI.attivo = false; return false; }
  try {
    const { data, error } = await db.rpc('fermi_cantiere_attivi');
    FERMI.attivo = !error && data === true;
  } catch (e) { FERMI.attivo = false; }
  return FERMI.attivo;
}

// ── Registrazione ───────────────────────────────────────────────────
function apriFermoCantiere(ctx) {
  FERMI.ctx = ctx || {};
  ge('frm-dove').textContent = ctx.titolo || '';
  ge('frm-causa').value = 'cliente_assente';
  ge('frm-dalle').value = ''; ge('frm-alle').value = ''; ge('frm-nota').value = '';
  ge('frm-data-box').style.display = ctx.giornoId ? 'none' : '';
  ge('frm-data').value = dataLocaleISO(new Date());
  openM('m-fermo-cantiere');
}

async function salvaFermoCantiere() {
  const c = FERMI.ctx || {};
  const causa = ge('frm-causa').value;
  const nota = (ge('frm-nota').value || '').trim();
  if (causa === 'altro' && nota.length < 3) { toast('Per "altro" scrivi la causa', 'err'); return; }
  const b = ge('frm-salva'); if (b) b.disabled = true;
  const { error } = await db.rpc('registra_fermo_cantiere', {
    p_causa: causa, p_nota: nota || null, p_attesa_dalle: ge('frm-dalle').value || null, p_attesa_alle: ge('frm-alle').value || null,
    p_giorno_id: c.giornoId || null, p_commessa_id: c.giornoId ? null : (c.commessaId || null), p_data: c.giornoId ? null : (ge('frm-data').value || null)
  });
  if (b) b.disabled = false;
  if (error) { toast('Fermo non registrato: ' + error.message, 'err'); return; }
  closeM('m-fermo-cantiere');
  toast('Fermo registrato: la segreteria lo riprogramma' + (['cliente_assente', 'accesso_negato', 'area_non_pronta'].includes(causa) ? ', il titolare decide l\'addebito' : ''), 'ok');
  if (c.commessaId && typeof commessaApertaId !== 'undefined' && commessaApertaId === c.commessaId) await caricaFermiCommessa(c.commessaId);
}

// Giorno di cantiere del tecnico
if (typeof htmlGiornoCantiereTecnico === 'function') {
  const htmlGiornoCantiereTecnicoSenzaFermo = htmlGiornoCantiereTecnico;
  // eslint-disable-next-line no-global-assign
  htmlGiornoCantiereTecnico = function(g) {
    const html = htmlGiornoCantiereTecnicoSenzaFermo.apply(this, arguments);
    if (!FERMI.attivo || !g || !g.giorno_id || g.data > dataLocaleISO(new Date())) return html;
    const c = g.commessa || {};
    const titolo = 'Commessa ' + (c.codice || '') + ' · ' + (typeof etichettaGiornoSquadra === 'function' ? etichettaGiornoSquadra(g.data) : g.data);
    const bottone = '<button class="btn sq-azione" type="button" style="margin-top:8px" data-fermo-giorno="' + esc(g.giorno_id) + '" onclick="apriFermoCantiere({ giornoId: this.dataset.fermoGiorno, titolo: this.dataset.titolo })" data-titolo="' + esc(titolo) + '">🛑 Fermo: non si può lavorare</button>';
    const i = html.lastIndexOf('</details>');
    const j = i >= 0 ? html.lastIndexOf('</div>', i) : -1;
    return j >= 0 ? html.slice(0, j) + bottone + html.slice(j) : html;
  };
}
['caricaMieiCantieriDashboard', 'caricaCantieriCalendarioTecnico'].forEach(function(nome) {
  if (typeof window[nome] !== 'function') return;
  const originale = window[nome];
  window[nome] = async function() {
    try { await verificaFermiDisponibili(); } catch (e) { /* senza */ }
    return originale.apply(this, arguments);
  };
});

// ── Commessa ────────────────────────────────────────────────────────
if (typeof registraAzioneScheda === 'function') {
  registraAzioneScheda('commessa', {
    codice: 'fermo_cantiere', etichetta: '🛑 Fermo del cantiere', ruoli: ['titolare', 'capo_tecnico'],
    quando: function(c) { return FERMI.attivo === true && !['chiusa', 'annullata'].includes(c.stato); },
    esegui: function(c) { return apriFermoCantiere({ commessaId: c.id, titolo: 'Commessa ' + (c.codice || '') }); }
  });
}

function rigaFermo(f) {
  const gestisce = ['titolare', 'segreteria', 'capo_tecnico'].includes(ROLE);
  return '<div data-fermo="' + esc(f.id) + '" style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">' +
    '<div style="min-width:0"><div style="font-size:13px;font-weight:700">' + esc(fd(f.giorno)) + ' · ' + esc(CAUSE_FERMO[f.causa] || f.causa) +
      ' <span class="bx ' + (f.stato === 'da_riprogrammare' ? 'bwarn' : 'bgray') + '">' + esc(STATI_FERMO[f.stato]) + (f.nuova_data ? ' al ' + esc(fd(f.nuova_data)) : '') + '</span>' +
      (f.addebito ? ' <span class="bx ' + (f.addebito === 'da_decidere' ? 'berr' : 'bblue') + '">' + esc(ADDEBITI_FERMO[f.addebito]) + (f.importo_addebito ? ' ' + esc(typeof euroPreventivo === 'function' ? euroPreventivo(f.importo_addebito) : f.importo_addebito) : '') + '</span>' : '') + '</div>' +
    '<div style="font-size:12px;color:var(--m)">' + (f.attesa_dalle ? 'Attesa ' + esc(String(f.attesa_dalle).slice(0, 5)) + (f.attesa_alle ? '–' + esc(String(f.attesa_alle).slice(0, 5)) : '') + ' · ' : '') +
      (f.nota ? esc(f.nota) + ' · ' : '') + 'registrato da ' + esc(f.registrato_da_nome || '') + '</div></div>' +
    (gestisce || ROLE === 'titolare' ? '<button class="btn sm" onclick="apriGestioneFermo(\'' + esc(f.id) + '\')">Gestisci</button>' : '') + '</div>';
}

async function caricaFermiCommessa(commessaId) {
  const box = ge('cmd-fermi');
  if (!box) return;
  box.innerHTML = '';
  if (!(await verificaFermiDisponibili())) return;
  const { data, error } = await db.from('fermi_cantiere').select('*').eq('commessa_id', commessaId).order('giorno', { ascending: false });
  if (error || !(data || []).length) return;
  FERMI.lista = data;
  const addebiti = data.filter(function(f) { return f.addebito === 'addebitare' && f.importo_addebito; }).reduce(function(t, f) { return t + Number(f.importo_addebito); }, 0);
  box.innerHTML = '<div class="card"><div style="font-size:14px;font-weight:700">🛑 Fermi del cantiere (' + data.length + ')</div>' +
    (addebiti && typeof euroPreventivo === 'function' ? '<div style="font-size:13px">Da addebitare al cliente: <b>' + esc(euroPreventivo(addebiti)) + '</b></div>' : '') +
    data.map(rigaFermo).join('') + '</div>';
}

if (typeof caricaSchedaCommessa === 'function') {
  const caricaSchedaCommessaSenzaFermi = caricaSchedaCommessa;
  // eslint-disable-next-line no-global-assign
  caricaSchedaCommessa = async function(commessaId) {
    try { await verificaFermiDisponibili(); } catch (e) { /* senza */ }
    const esito = await caricaSchedaCommessaSenzaFermi.apply(this, arguments);
    try { await caricaFermiCommessa(commessaId); } catch (e) { console.warn('Fermi del cantiere:', e); }
    return esito;
  };
}

// ── Riprogrammazione e addebito ─────────────────────────────────────
function apriGestioneFermo(id) {
  const f = (FERMI.lista || []).find(function(x) { return x.id === id; });
  if (!f) return;
  FERMI.aperto = f;
  ge('gfr-titolo').textContent = fd(f.giorno) + ' · ' + (CAUSE_FERMO[f.causa] || f.causa);
  const riprog = ['titolare', 'segreteria', 'capo_tecnico'].includes(ROLE);
  ge('gfr-riprog-box').style.display = riprog ? '' : 'none';
  ge('gfr-nuova-data').value = f.nuova_data || '';
  ge('gfr-nota-riprog').value = f.nota_riprogrammazione || '';
  const add = ROLE === 'titolare' && !!f.addebito;
  ge('gfr-addebito-box').style.display = add ? '' : 'none';
  if (add) {
    ge('gfr-addebito').value = f.addebito;
    ge('gfr-importo').value = f.importo_addebito || '';
    ge('gfr-nota-addebito').value = f.nota_addebito || '';
  }
  openM('m-gestisci-fermo');
}

async function salvaRiprogrammazioneFermo(nonServe) {
  const f = FERMI.aperto; if (!f) return;
  const data = nonServe ? null : (ge('gfr-nuova-data').value || null);
  if (!nonServe && !data) { toast('Indica la nuova data (o "Non serve riprogrammare")', 'err'); return; }
  const { error } = await db.rpc('riprogramma_fermo', { p_fermo_id: f.id, p_nuova_data: data, p_nota: ge('gfr-nota-riprog').value || null });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  closeM('m-gestisci-fermo');
  toast(nonServe ? 'Segnato: non serve riprogrammare' : 'Riprogrammato al ' + fd(data) + ': organizza la squadra di quel giorno', 'ok');
  await caricaFermiCommessa(f.commessa_id);
}

async function salvaAddebitoFermo() {
  const f = FERMI.aperto; if (!f) return;
  const dec = ge('gfr-addebito').value;
  const imp = ge('gfr-importo').value;
  const { error } = await db.rpc('decidi_addebito_fermo', { p_fermo_id: f.id, p_decisione: dec, p_importo: imp === '' ? null : Number(imp), p_nota: ge('gfr-nota-addebito').value || null });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  closeM('m-gestisci-fermo');
  toast('Decisione sull\'addebito salvata', 'ok');
  await caricaFermiCommessa(f.commessa_id);
}

// ── Cosa tocca a me ─────────────────────────────────────────────────
async function fermiFiltrati(filtro) {
  if (!(await verificaFermiDisponibili())) return null;
  const { data, error } = await filtro(db.from('fermi_cantiere').select('id, commessa_id, giorno, stato, addebito')).limit(500);
  return error ? null : (data || []);
}
function apriPrimaCommessaFermo(e) {
  if (!e || !e.length) return;
  if (e.length > 1) toast('Apro la commessa del primo di ' + e.length, 'ok');
  openCommessaDetail(e[0].commessa_id);
}
async function fermiConNoliAperti() {
  const fermi = await fermiFiltrati(function(q) { return q.gte('giorno', (function() { const d = new Date(); d.setDate(d.getDate() - 30); return dataLocaleISO(d); })()).neq('stato', 'non_serve'); });
  if (!fermi || !fermi.length) return fermi;
  const ids = Array.from(new Set(fermi.map(function(f) { return f.commessa_id; })));
  const { data, error } = await db.from('commesse_richieste_integrazione').select('commessa_id, nolo_fino_al').eq('tipo', 'nolo').in('stato', ['evasa', 'arrivata']).is('restituito_il', null).in('commessa_id', ids);
  if (error) return null;
  const conNoli = new Set((data || []).map(function(r) { return r.commessa_id; }));
  return fermi.filter(function(f) { return conNoli.has(f.commessa_id); });
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'fermi-da-riprogrammare', ruoli: ['segreteria', 'titolare'], icona: '🛑', priorita: 20,
    titolo: 'Fermi del cantiere da riprogrammare',
    vai: function() { fermiFiltrati(function(q) { return q.eq('stato', 'da_riprogrammare'); }).then(apriPrimaCommessaFermo); },
    conta: async function() { const e = await fermiFiltrati(function(q) { return q.eq('stato', 'da_riprogrammare'); }); return e === null ? null : e.length; }
  });
  registraFonteToccaAMe({
    id: 'addebiti-fermi', ruoli: ['titolare'], icona: '💶', priorita: 21,
    titolo: 'Uscite a vuoto: decidere l\'addebito al cliente',
    vai: function() { fermiFiltrati(function(q) { return q.eq('addebito', 'da_decidere'); }).then(apriPrimaCommessaFermo); },
    conta: async function() { const e = await fermiFiltrati(function(q) { return q.eq('addebito', 'da_decidere'); }); return e === null ? null : e.length; }
  });
  registraFonteToccaAMe({
    id: 'fermi-noli', ruoli: ['commerciale'], icona: '🏗️', priorita: 36,
    titolo: 'Cantieri fermi con noli in corso (prorogare o ritirare?)',
    vai: function() { fermiConNoliAperti().then(apriPrimaCommessaFermo); },
    conta: async function() { const e = await fermiConNoliAperti(); return e === null ? null : e.length; }
  });
}
