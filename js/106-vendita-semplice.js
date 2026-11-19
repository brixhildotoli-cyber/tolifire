// ── F18.5 Vendita semplice (sql/133; D8 di Toli; scelte di Erika del 19/11) ──
// Un DDT di sola fornitura SENZA scheda di lavoro si fattura senza commessa:
// nell'elenco dei DDT (Documenti, js/10 chiama decoraVenditeDdt) la segreteria
// e il titolare hanno "🛒 Fattura vendita": crea_bozza_vendita_da_ddt fa la
// bozza (origine 'vendita') con cliente, righe e prezzi del DDT; si apre la
// bozza di sempre (apriFattura di js/43) con gli avvisi del database (sopra
// 1.000 €, righe fuori catalogo, righe senza prezzo: solo avvisi). Emissione
// ("📤 Emetti fattura", js/44) e pagamento come le altre fatture. Un DDT già
// in fattura mostra "🧾 In fattura …" che apre quella fattura.
// Senza sql/133 (vendite_semplici_attive) non compare nulla.

let venditeSempliciVerificate = null;

async function verificaVenditeSempliciDisponibile() {
  if (venditeSempliciVerificate !== null) return venditeSempliciVerificate;
  try {
    const { data, error } = await db.rpc('vendite_semplici_attive');
    venditeSempliciVerificate = !error && data === true;
  } catch (e) {
    venditeSempliciVerificate = false;
  }
  return venditeSempliciVerificate;
}

function puoFareVenditaSemplice() {
  return ROLE === 'segreteria' || ROLE === 'titolare';
}

// Fatture (non annullate) che contengono i DDT: { ddt_id: fattura }
async function fattureDeiDdt(ids) {
  const ris = {};
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from('fatture_righe')
      .select('ddt_id, fatture!inner(id, numero, stato, eliminato_il, tipo_documento)')
      .in('ddt_id', ids.slice(i, i + 100));
    if (error) throw error;
    (data || []).forEach(function(r) {
      const f = r.fatture;
      if (!f || f.eliminato_il || f.stato === 'annullata' || f.tipo_documento !== 'fattura') return;
      ris[r.ddt_id] = f;
    });
  }
  return ris;
}

// Elenco dei DDT (js/10): bottone sui DDT senza scheda di lavoro
async function decoraVenditeDdt() {
  if (!puoFareVenditaSemplice() || !(await verificaVenditeSempliciDisponibile())) return;
  const righe = Array.from(document.querySelectorAll('#dtbody tr[data-ddt-id]'))
    .filter(function(tr) { return !tr.dataset.ddtScheda; });
  if (!righe.length) return;
  let fatture;
  try { fatture = await fattureDeiDdt(righe.map(function(tr) { return tr.dataset.ddtId; })); }
  catch (e) { console.warn('Vendite dai DDT:', e); return; }
  righe.forEach(function(tr) {
    const cella = tr.lastElementChild;
    if (!cella || cella.querySelector('.vendita-ddt')) return;
    const f = fatture[tr.dataset.ddtId];
    const bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'btn sm vendita-ddt' + (f ? '' : ' p');
    if (f) {
      bottone.textContent = f.numero ? '🧾 In fattura n. ' + f.numero : '🧾 In bozza di fattura';
      bottone.onclick = function() { apriFattura(f.id); };
    } else {
      bottone.textContent = '🛒 Fattura vendita';
      bottone.title = 'Vendita semplice: fattura dal DDT, senza commessa';
      bottone.onclick = function() { creaVenditaDaDdt(tr.dataset.ddtId, bottone); };
    }
    cella.appendChild(bottone);
  });
}

async function creaVenditaDaDdt(ddtId, bottone) {
  if (!puoFareVenditaSemplice()) { toast('La fattura di vendita la fanno la segreteria e il titolare', 'err'); return; }
  if (!confirm('Creare la bozza di fattura di vendita da questo DDT? Righe e prezzi vengono dal DDT e si possono correggere nella bozza.')) return;
  if (bottone) bottone.disabled = true;
  const { data, error } = await db.rpc('crea_bozza_vendita_da_ddt', { p_ddt_id: ddtId, p_iva_perc: 22 });
  if (bottone) bottone.disabled = false;
  if (error) { toast('Vendita non creata: ' + error.message, 'err'); return; }
  const avvisi = (data && data.avvisi) || [];
  await apriFattura(data.id);
  mostraAvvisiVendita(avvisi);
  toast('Bozza di vendita creata ✓ Controlla righe e prezzi, poi «📤 Emetti fattura»', 'ok');
  if (ge('pg-documenti') && ge('pg-documenti').classList.contains('on') && typeof loadDocs === 'function') {
    loadDocs().catch(function() {});
  }
}

function mostraAvvisiVendita(avvisi) {
  const box = ge('mfat-promemoria');
  if (!box || !(avvisi || []).length) return;
  box.insertAdjacentHTML('afterbegin', '<div class="al2 w" id="mfat-avvisi-vendita" style="margin-bottom:10px;font-size:12px">' +
    '<b>⚠️ Vendita semplice</b><ul style="margin:4px 0 0;padding-left:18px">' +
    avvisi.map(function(a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>');
}
