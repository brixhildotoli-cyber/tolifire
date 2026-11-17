// ── F20.13 — RIFIUTI: FORMULARI FIR E QUARTA COPIA (sql/181) ─────────────
// Decisione di Erika del 17/11 (MD7 di Toli): responsabile dei rifiuti è
// Acquisti (commerciale).
//   - Commessa: riquadro "♻️ Rifiuti: formulari" (cmd-rifiuti) con i FIR, i
//     giorni passati e la quarta copia; "+ FIR" e "📄 Quarta copia arrivata"
//     per Acquisti e titolare (finestre m-fir, id fir-; m-quarta-copia, id
//     qfc-); segreteria e capo tecnico leggono.
//   - Cosa tocca a me di Acquisti: FIR senza quarta copia da 80 giorni o più
//     (va ricevuta entro 90).
// Niente RENTRI e niente file (il PDF del FIR va nella cartella documenti
// della commessa come oggi). Senza sql/181 niente.

const FIR = { attivo: null, lista: [], commessaId: null, aperto: null };
const GIORNI_QUARTA_COPIA = 90;
const GIORNI_AVVISO_QUARTA_COPIA = 80;
const RUOLI_SCRIVONO_FIR = ['titolare', 'commerciale'];

async function verificaFirDisponibili() {
  if (FIR.attivo !== null) return FIR.attivo;
  if (!['titolare', 'segreteria', 'capo_tecnico', 'commerciale'].includes(ROLE)) { FIR.attivo = false; return false; }
  try {
    const { data, error } = await db.rpc('formulari_rifiuti_attivi');
    FIR.attivo = !error && data === true;
  } catch (e) { FIR.attivo = false; }
  return FIR.attivo;
}

function giorniDaFir(f) {
  return Math.round((new Date(dataLocaleISO(new Date()) + 'T00:00:00') - new Date(f.data_fir + 'T00:00:00')) / 86400000);
}

function rigaFir(f) {
  const scrive = RUOLI_SCRIVONO_FIR.includes(ROLE);
  const gg = giorniDaFir(f);
  const scadenza = (function() { const d = new Date(f.data_fir + 'T00:00:00'); d.setDate(d.getDate() + GIORNI_QUARTA_COPIA); return dataLocaleISO(d); })();
  const stato = f.quarta_copia_il
    ? '<span class="bx bok">✅ Quarta copia il ' + esc(fd(f.quarta_copia_il)) + '</span>'
    : (gg >= GIORNI_QUARTA_COPIA ? '<span class="bx berr">Quarta copia SCADUTA (' + gg + ' gg)</span>'
      : gg >= GIORNI_AVVISO_QUARTA_COPIA ? '<span class="bx bwarn">Quarta copia entro il ' + esc(fd(scadenza)) + '</span>'
      : '<span class="bx bgray">Quarta copia entro il ' + esc(fd(scadenza)) + '</span>');
  return '<div data-fir="' + esc(f.id) + '" style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">' +
    '<div style="min-width:0"><div style="font-size:13px;font-weight:700">FIR ' + esc(f.numero) + ' del ' + esc(fd(f.data_fir)) + ' ' + stato + '</div>' +
    '<div style="font-size:12px;color:var(--m)">' + esc([f.trasportatore && 'trasporto ' + f.trasportatore, f.destinatario && 'a ' + f.destinatario, f.codice_cer && 'CER ' + f.codice_cer, f.quantita, f.nota].filter(Boolean).join(' · ')) + '</div></div>' +
    (scrive && !f.quarta_copia_il ? '<button class="btn sm" onclick="apriQuartaCopiaFir(\'' + esc(f.id) + '\')">📄 Quarta copia arrivata</button>' : '') + '</div>';
}

async function caricaFirCommessa(commessaId) {
  const box = ge('cmd-rifiuti');
  if (!box) return;
  box.innerHTML = '';
  if (!(await verificaFirDisponibili())) return;
  const { data, error } = await db.from('formulari_rifiuti').select('*').eq('commessa_id', commessaId).order('data_fir', { ascending: false });
  if (error) return;
  FIR.lista = data || [];
  FIR.commessaId = commessaId;
  const scrive = RUOLI_SCRIVONO_FIR.includes(ROLE);
  if (!FIR.lista.length && !scrive) return;
  box.innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<div style="font-size:14px;font-weight:700">♻️ Rifiuti: formulari (' + FIR.lista.length + ')</div>' +
    (scrive ? '<button class="btn sm p" onclick="apriNuovoFir()">+ FIR</button>' : '') + '</div>' +
    '<div style="font-size:12px;color:var(--m);margin-top:2px">La quarta copia del formulario va ricevuta entro ' + GIORNI_QUARTA_COPIA + ' giorni. Il PDF del FIR va nella cartella documenti della commessa.</div>' +
    (FIR.lista.length ? FIR.lista.map(rigaFir).join('') : '<div class="empty">Nessun formulario</div>') + '</div>';
}

if (typeof caricaSchedaCommessa === 'function') {
  const caricaSchedaCommessaSenzaFir = caricaSchedaCommessa;
  // eslint-disable-next-line no-global-assign
  caricaSchedaCommessa = async function(commessaId) {
    const esito = await caricaSchedaCommessaSenzaFir.apply(this, arguments);
    try { await caricaFirCommessa(commessaId); } catch (e) { console.warn('Formulari dei rifiuti:', e); }
    return esito;
  };
}

function apriNuovoFir() {
  ['fir-numero', 'fir-trasportatore', 'fir-destinatario', 'fir-cer', 'fir-quantita', 'fir-nota'].forEach(function(id) { ge(id).value = ''; });
  ge('fir-data').value = dataLocaleISO(new Date());
  ge('fir-data').max = dataLocaleISO(new Date());
  openM('m-fir');
}

async function salvaNuovoFir() {
  const numero = (ge('fir-numero').value || '').trim();
  if (!numero) { toast('Scrivi il numero del formulario', 'err'); return; }
  const { error } = await db.rpc('registra_formulario_rifiuti', {
    p_commessa_id: FIR.commessaId, p_numero: numero, p_data_fir: ge('fir-data').value || null,
    p_trasportatore: ge('fir-trasportatore').value || null, p_destinatario: ge('fir-destinatario').value || null,
    p_codice_cer: ge('fir-cer').value || null, p_quantita: ge('fir-quantita').value || null, p_nota: ge('fir-nota').value || null
  });
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  closeM('m-fir');
  toast('Formulario registrato', 'ok');
  await caricaFirCommessa(FIR.commessaId);
}

function apriQuartaCopiaFir(id) {
  const f = FIR.lista.find(function(x) { return x.id === id; });
  if (!f) return;
  FIR.aperto = f;
  ge('qfc-titolo').textContent = 'FIR ' + f.numero + ' del ' + fd(f.data_fir);
  ge('qfc-data').value = dataLocaleISO(new Date());
  ge('qfc-data').min = f.data_fir;
  ge('qfc-data').max = dataLocaleISO(new Date());
  ge('qfc-nota').value = '';
  openM('m-quarta-copia');
}

async function salvaQuartaCopiaFir() {
  const f = FIR.aperto; if (!f) return;
  const data = ge('qfc-data').value;
  if (!data) { toast('Indica quando è arrivata', 'err'); return; }
  const { error } = await db.rpc('segna_quarta_copia_fir', { p_fir_id: f.id, p_data: data, p_nota: ge('qfc-nota').value || null });
  if (error) { toast('Non salvata: ' + error.message, 'err'); return; }
  closeM('m-quarta-copia');
  toast('Quarta copia segnata', 'ok');
  await caricaFirCommessa(f.commessa_id);
}

// ── Cosa tocca a me (Acquisti) ──────────────────────────────────────
async function firSenzaQuartaCopia() {
  if (!(await verificaFirDisponibili())) return null;
  const limite = new Date(); limite.setDate(limite.getDate() - GIORNI_AVVISO_QUARTA_COPIA);
  const { data, error } = await db.from('formulari_rifiuti').select('id, commessa_id, numero, data_fir').is('quarta_copia_il', null).lte('data_fir', dataLocaleISO(limite)).order('data_fir').limit(500);
  return error ? null : (data || []);
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'fir-quarta-copia', ruoli: ['commerciale'], icona: '♻️', priorita: 38,
    titolo: 'Formulari dei rifiuti senza quarta copia (da ' + GIORNI_AVVISO_QUARTA_COPIA + ' giorni o più)',
    vai: function() { firSenzaQuartaCopia().then(function(e) { if (e && e.length) { if (e.length > 1) toast('Apro la commessa del più vecchio di ' + e.length, 'ok'); openCommessaDetail(e[0].commessa_id); } }); },
    conta: async function() { const e = await firSenzaQuartaCopia(); return e === null ? null : e.length; }
  });
}
