// ── F19.13 Approvazione tracciata e firma digitale dei documenti (sql/164) ──
// Scelte di Erika del 25/11: POS di commessa (js/116) e dichiarazione di
// corretta messa in opera (js/37); APPROVA solo il titolare (un tocco: si
// registrano chi, quando e l'impronta SHA-256 del PDF); il PDF FIRMATO lo
// caricano segreteria e titolare e diventa "firmato" solo se contiene proprio
// il PDF approvato:
//   - PAdES (PDF firmato): i primi byte del firmato, lunghi quanto
//     l'approvato, devono avere la stessa impronta (la firma si aggiunge in
//     coda al PDF);
//   - CAdES (.p7m): il PDF approvato deve trovarsi dentro il file.
//   Il controllo si fa qui PRIMA di caricare (niente file inutili) e il
//   database confronta di nuovo l'impronta (registra_firmato).
// Un POS uscito in bozza si approva solo scrivendo il motivo.
// Uso: nei riquadri, un segnaposto per documento
//   <div data-firma-doc="ID" data-firma-tipo="pos|dichiarazione_posa"
//        data-firma-path="…" data-firma-cartella="…" data-firma-commessa="…"
//        data-firma-bozza="1"?></div>
// e poi arricchisciFirme(box). Senza sql/164 i segnaposto restano vuoti.

let firmeDocumentiVerificate = null;
const FIRME_DOCUMENTI = {};   // documento_id → riga di documenti_firme

async function verificaFirmeDocumentiDisponibili() {
  if (firmeDocumentiVerificate !== null) return firmeDocumentiVerificate;
  try {
    const { data, error } = await db.rpc('documenti_firme_attive');
    firmeDocumentiVerificate = !error && data === true;
  } catch (e) { firmeDocumentiVerificate = false; }
  return firmeDocumentiVerificate;
}

async function arricchisciFirme(box) {
  if (!box || !(await verificaFirmeDocumentiDisponibili())) return;
  const posti = Array.from(box.querySelectorAll('[data-firma-doc]'));
  if (!posti.length) return;
  const ids = posti.map(function(p) { return p.dataset.firmaDoc; });
  const { data, error } = await db.from('documenti_firme')
    .select('documento_id, tipo, impronta_sha256, dimensione, stato, approvato_da_nome, approvato_il, nota, firmato_formato, firmato_da_nome, firmato_il, firmato_documento_id, commesse_documenti!documenti_firme_firmato_documento_id_fkey(storage_path, nome_file)')
    .in('documento_id', ids);
  if (error) { console.warn('Firme dei documenti:', error.message); return; }
  (data || []).forEach(function(f) { FIRME_DOCUMENTI[f.documento_id] = f; });
  posti.forEach(function(p) { p.innerHTML = htmlFirmaDocumento(p.dataset); });
}

function htmlFirmaDocumento(d) {
  const f = FIRME_DOCUMENTI[d.firmaDoc];
  const quando = function(t) { return t ? new Date(t).toLocaleDateString('it-IT') : ''; };
  const attr = 'data-doc="' + esc(d.firmaDoc) + '"';
  if (!f) {
    return ROLE === 'titolare'
      ? '<div style="margin-top:4px"><button type="button" class="btn sm" ' + attr + ' onclick="approvaDocumentoFirma(this.closest(\'[data-firma-doc]\'))">✓ Approva</button>' +
        ' <span style="font-size:11px;color:var(--m)">da approvare</span></div>'
      : '<div style="font-size:11px;color:var(--m);margin-top:4px">Da approvare dal titolare</div>';
  }
  if (f.stato === 'firmato') {
    const s = f.commesse_documenti;
    return '<div style="font-size:12px;margin-top:4px;color:var(--g)">🖊 Firmato (' + (f.firmato_formato === 'cades' ? '.p7m' : 'PDF firmato') + ') il ' + esc(quando(f.firmato_il)) +
      (f.firmato_da_nome ? ', caricato da ' + esc(f.firmato_da_nome) : '') +
      (s && s.storage_path ? ' <button type="button" class="btn sm" data-path="' + esc(s.storage_path) + '" onclick="scaricaDocumentoCommessa(this.dataset.path)">📄 Firmato</button>' : '') + '</div>';
  }
  return '<div style="font-size:12px;margin-top:4px">✅ Approvato da ' + esc(f.approvato_da_nome || '') + ' il ' + esc(quando(f.approvato_il)) +
    ' · <b style="color:var(--a)">da firmare</b>' + (f.nota ? '<div style="font-size:11px;color:var(--m)">Motivo: ' + esc(f.nota) + '</div>' : '') +
    (['titolare', 'segreteria'].includes(ROLE) ? '<div style="margin-top:4px"><label class="btn sm" style="cursor:pointer">📤 Carica il firmato' +
      '<input type="file" accept=".pdf,.p7m,application/pdf,application/pkcs7-mime" style="display:none" onchange="caricaFirmatoDocumento(this)"></label></div>' : '') + '</div>';
}

async function bytesDocumentoCommessa(path) {
  const { data, error } = await firmaFile('commesse-documenti', path, 300);
  const url = data && (data.signedUrl || data.signedURL);
  if (error || !url) throw new Error(error ? error.message : 'link non disponibile');
  const r = await fetch(url);
  if (!r.ok) throw new Error('file non scaricato (' + r.status + ')');
  return new Uint8Array(await r.arrayBuffer());
}

async function sha256Bytes(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(h)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function approvaDocumentoFirma(posto) {
  if (!posto || ROLE !== 'titolare') return;
  const d = posto.dataset;
  let nota = null;
  if (d.firmaBozza === '1') {
    nota = prompt('Questo POS è una BOZZA: manca qualcosa. Scrivi perché lo approvi lo stesso:');
    if (nota === null) return;
  } else if (!confirm('Approvi questo documento? Si registrano il tuo nome, la data e l\'impronta del PDF.')) return;
  let bytes;
  try { bytes = await bytesDocumentoCommessa(d.firmaPath); } catch (e) { toast('PDF non letto: ' + e.message, 'err'); return; }
  const { error } = await db.rpc('approva_documento', { p_documento_id: d.firmaDoc, p_tipo: d.firmaTipo, p_impronta: await sha256Bytes(bytes), p_dimensione: bytes.length, p_nota: nota });
  if (error) { toast('Non approvato: ' + error.message, 'err'); return; }
  toast('Documento approvato: ora va firmato ✓', 'ok');
  await arricchisciFirme(posto.parentNode);
}

// Cerca la sequenza "ago" dentro "pagliaio" (per il .p7m)
function posizioneBytes(pagliaio, ago) {
  if (!ago.length || ago.length > pagliaio.length) return -1;
  const primo = ago[0], fine = pagliaio.length - ago.length;
  for (let i = 0; i <= fine; i++) {
    if (pagliaio[i] !== primo) continue;
    let j = 1;
    while (j < ago.length && pagliaio[i + j] === ago[j]) j++;
    if (j === ago.length) return i;
  }
  return -1;
}

// Impronta dell'originale ritrovato dentro il firmato ('' se non c'è)
async function originaleNelFirmato(firmato, cades, approvato) {
  if (!cades) return firmato.length >= approvato.dimensione ? sha256Bytes(firmato.slice(0, approvato.dimensione)) : '';
  return '';   // il .p7m si controlla con l'originale (vedi caricaFirmatoDocumento)
}

async function caricaFirmatoDocumento(input) {
  const file = input.files && input.files[0];
  const posto = input.closest('[data-firma-doc]');
  input.value = '';
  if (!file || !posto) return;
  const d = posto.dataset;
  const f = FIRME_DOCUMENTI[d.firmaDoc];
  if (!f) return;
  const cades = /\.p7m$/i.test(file.name);
  const firmato = new Uint8Array(await file.arrayBuffer());
  let impronta = await originaleNelFirmato(firmato, cades, f);
  if (cades) {
    try {
      const orig = await bytesDocumentoCommessa(d.firmaPath);
      impronta = posizioneBytes(firmato, orig) >= 0 ? await sha256Bytes(orig) : '';
    } catch (e) { toast('PDF approvato non letto: ' + e.message, 'err'); return; }
  }
  if (impronta !== f.impronta_sha256) {
    toast(cades ? 'Il .p7m non contiene il documento approvato: è di un\'altra versione' : 'Il PDF firmato non è quello approvato (è di un\'altra versione o è stato rigenerato)', 'err');
    return;
  }
  const nome = 'FIRMATO_' + String(file.name).replace(/[^\w.-]+/g, '_').slice(0, 120);
  const path = d.firmaCommessa + '/' + d.firmaCartella + '/' + Date.now() + '_' + nome;
  const up = await db.storage.from('commesse-documenti').upload(path, file, { upsert: false, contentType: cades ? 'application/pkcs7-mime' : 'application/pdf' });
  if (up.error) { toast('Firmato non caricato: ' + up.error.message, 'err'); return; }
  const rd = await db.rpc('registra_documento_commessa', { p_commessa_id: d.firmaCommessa, p_cartella: d.firmaCartella, p_storage_path: path, p_nome_file: nome, p_nota: 'Documento firmato digitalmente' });
  if (rd.error) { await db.storage.from('commesse-documenti').remove([path]); toast('Firmato non registrato: ' + rd.error.message, 'err'); return; }
  const rf = await db.rpc('registra_firmato', { p_documento_id: d.firmaDoc, p_firmato_documento_id: rd.data, p_formato: cades ? 'cades' : 'pades',
    p_impronta_firmato: await sha256Bytes(firmato), p_impronta_originale: impronta });
  if (rf.error) { toast('Non segnato come firmato: ' + rf.error.message, 'err'); return; }
  toast('Documento firmato registrato ✓', 'ok');
  await arricchisciFirme(posto.parentNode);
}
