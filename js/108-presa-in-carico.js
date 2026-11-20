// ── F18.9 Presa in carico del capo tecnico: i 7 punti (versione scelta da
// Erika il 19/11/2026: solo la checklist, SOLO AVVISO, solo sito) ─────────
// Nella finestra "Stato e storico" (js/18i), scegliendo "→ Presa in carico"
// (in_preparazione), compaiono i 7 punti del documento dell'area 06: quelli
// che il gestionale sa controllare sono spuntati (✅) o segnati (⚠️ con cosa
// manca), gli altri li spunta il capo tecnico. Si prende in carico anche con
// punti aperti; nella nota del passaggio (storico della commessa) si aggiunge
// "Controlli della presa in carico: N su 7 (aperti: …)".
// Dati: scheda_cantiere_commessa (sql/34: lavorazioni, schede di rilievo,
// allegati senza prezzi, perché il capo tecnico non legge preventivi e
// progetti), materiali (js/29), dati del cantiere sulla commessa (sql/34).
// js/18i chiama preparaChecklistPresaInCarico, mostraChecklistPresaInCarico
// e testoChecklistPresaInCarico.

const PUNTI_PRESA_IN_CARICO = [
  { k: 'schede', t: 'Schede di rilievo con le foto' },
  { k: 'perche', t: 'Perché si fa il lavoro (cosa chiede il cliente)' },
  { k: 'lavorazioni', t: 'Lavorazioni e quantità' },
  { k: 'giorni', t: 'Giorni di lavoro e persone che servono' },
  { k: 'materiali', t: 'Materiali con la data di arrivo' },
  { k: 'accessi', t: 'Referente e accessi del cantiere' },
  { k: 'promesse', t: 'Promesse fatte a voce al cliente (chiedile al rappresentante)' }
];
let checklistPresaInCarico = null;  // { commessaId, esiti: { k: { ok, nota } } }

async function controlliAutomaticiPresaInCarico(commessaId) {
  const esiti = {};
  const [rScheda, rDati, fonti] = await Promise.all([
    db.rpc('scheda_cantiere_commessa', { p_commessa_id: commessaId }),
    db.from('commesse').select('cantiere_referente_nome, cantiere_referente_telefono, cantiere_accessi').eq('id', commessaId).maybeSingle(),
    typeof leggiFontiMaterialiCommessa === 'function' ? leggiFontiMaterialiCommessa(commessaId) : Promise.resolve(null)
  ]);
  const s = rScheda && !rScheda.error ? (rScheda.data || {}) : null;
  if (s) {
    const schede = (s.schede_rilievo || []).length;
    const foto = (s.allegati || []).filter(function(a) { return /^image\//.test(a.mime_type || '') || /\.(jpe?g|png|heic)$/i.test(a.nome_file || ''); }).length;
    esiti.schede = schede && foto ? { ok: true, nota: schede + (schede === 1 ? ' scheda' : ' schede') + ', ' + foto + ' foto' }
      : { ok: false, nota: !schede ? 'nessuna scheda di rilievo' : 'nessuna foto tra i file del progetto' };
    const voci = (s.lavorazioni || []).length;
    esiti.lavorazioni = voci ? { ok: true, nota: voci + (voci === 1 ? ' lavorazione' : ' lavorazioni') } : { ok: false, nota: 'nessuna lavorazione nel preventivo' };
  }
  if (fonti && typeof righeMaterialiCommessa === 'function') {
    const righe = righeMaterialiCommessa(fonti.ordini, fonti.richieste, []);
    const senzaData = righe.filter(function(r) { return !r.arrivato && !r.arrivoPrevisto; }).length;
    esiti.materiali = !righe.length ? { ok: false, nota: 'nessun materiale ordinato' }
      : (senzaData ? { ok: false, nota: senzaData + (senzaData === 1 ? ' materiale senza data' : ' materiali senza data') } : { ok: true, nota: righe.length + ' con la data' });
  }
  const d = rDati && !rDati.error ? rDati.data : null;
  if (d) {
    const manca = [];
    if (!String(d.cantiere_referente_nome || '').trim() || !String(d.cantiere_referente_telefono || '').trim()) manca.push('referente con telefono');
    if (!String(d.cantiere_accessi || '').trim()) manca.push('istruzioni di accesso');
    esiti.accessi = manca.length ? { ok: false, nota: 'manca: ' + manca.join(', ') + ' (scheda Cantiere)' } : { ok: true, nota: 'compilati' };
  }
  return esiti;
}

async function preparaChecklistPresaInCarico(commessaId) {
  const box = ge('msc-checklist');
  if (!box) return;
  checklistPresaInCarico = { commessaId: commessaId, esiti: {} };
  box.innerHTML = '<div class="load" style="font-size:12px">Controllo i 7 punti…</div>';
  let esiti = {};
  try { esiti = await controlliAutomaticiPresaInCarico(commessaId); } catch (e) { console.warn('Checklist presa in carico:', e); }
  if (!checklistPresaInCarico || checklistPresaInCarico.commessaId !== commessaId || !ge('msc-checklist')) return;
  checklistPresaInCarico.esiti = esiti;
  ge('msc-checklist').innerHTML = '<div class="card" style="margin:0 0 10px;font-size:13px">' +
    '<div style="font-weight:700;margin-bottom:4px">✅ I 7 punti prima della presa in carico</div>' +
    '<div style="font-size:12px;color:var(--m);margin-bottom:6px">Quelli che il gestionale controlla sono già segnati; gli altri spuntali tu. Puoi prendere in carico anche con punti aperti: restano scritti nello storico.</div>' +
    PUNTI_PRESA_IN_CARICO.map(function(p) {
      const e = esiti[p.k];
      const segno = e ? (e.ok ? '✅' : '⚠️') : '';
      return '<label style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;font-weight:400;cursor:pointer">' +
        '<input type="checkbox" class="msc-punto" data-k="' + p.k + '"' + (e && e.ok ? ' checked' : '') + '>' +
        '<span>' + esc(p.t) + (e ? ' <span style="font-size:11px;color:' + (e.ok ? 'var(--g)' : 'var(--a)') + '">' + segno + ' ' + esc(e.nota) + '</span>' : '') + '</span>' +
        '</label>';
    }).join('') + '</div>';
  mostraChecklistPresaInCarico();
}

function mostraChecklistPresaInCarico() {
  const box = ge('msc-checklist');
  if (box) box.style.display = v('msc-stato') === 'in_preparazione' ? '' : 'none';
}

// Riga da aggiungere alla nota del passaggio ('' se non è la presa in carico)
function testoChecklistPresaInCarico(stato) {
  if (stato !== 'in_preparazione' || !ge('msc-checklist')) return '';
  const caselle = Array.from(document.querySelectorAll('#msc-checklist .msc-punto'));
  if (!caselle.length) return '';
  const aperti = caselle.filter(function(c) { return !c.checked; }).map(function(c) {
    const p = PUNTI_PRESA_IN_CARICO.find(function(x) { return x.k === c.dataset.k; });
    return p ? p.t.replace(/ \(.*\)$/, '').toLowerCase() : c.dataset.k;
  });
  return 'Controlli della presa in carico: ' + (caselle.length - aperti.length) + ' su ' + caselle.length +
    (aperti.length ? ' (aperti: ' + aperti.join(', ') + ')' : ' ✓');
}
