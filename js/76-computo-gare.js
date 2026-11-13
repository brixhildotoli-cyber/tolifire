// ── F16.34 — PREVENTIVO A COMPUTO DEL CLIENTE (GARE) ──────────────────
// Versione decisa da Erika il 13/11: le righe del computo dell'ente
// (Excel: codice voce, descrizione, unità, quantità) DIVENTANO le voci del
// preventivo. Nell'editor delle voci (Acquisti e titolare, prima dell'esito)
// "📥 Importa computo del cliente": anteprima nella conferma, poi le righe si
// aggiungono in fondo come voci nuove con costo e prezzo vuoti (si salvano con
// "💾 Salva preventivo" come le altre). Con sql/112 il codice dell'ente va in
// preventivi_voci.codice_cliente (campo "Cod. ente" sulla voce, colonna
// "Cod." nel PDF del cliente); senza sql/112 il codice va all'inizio della
// descrizione ("[A.01.003] ..."). Nessun blocco, niente cambia nei preventivi
// senza computo (il campo "Cod. ente" compare solo se una voce ha il codice).

let codiceClienteVociDisponibile = null;

// Come verificaQuantitaUmVociDisponibile (sql/265): si guarda una riga letta
// con select *; nessuna richiesta in errore senza sql/112.
async function verificaCodiceClienteVociDisponibile(righeLette) {
  if (codiceClienteVociDisponibile !== null) return codiceClienteVociDisponibile;
  let riga = (righeLette || [])[0] || null;
  if (!riga) {
    const { data, error } = await db.from('preventivi_voci').select('*').limit(1);
    if (error || !data || !data.length) return false;
    riga = data[0];
  }
  codiceClienteVociDisponibile = Object.prototype.hasOwnProperty.call(riga, 'codice_cliente');
  return codiceClienteVociDisponibile;
}

function testoCodiceClienteVoce(valore) {
  return String(valore == null ? '' : valore).replace(/[\r\n]+/g, ' ').trim().slice(0, 50);
}

// Il campo "Cod. ente" si vede solo nei preventivi con almeno una voce con il codice
function codiceEnteEditorVisibile() {
  return codiceClienteVociDisponibile === true && typeof vociPreventivoDati !== 'undefined' &&
    vociPreventivoDati.some(function(v) { return testoCodiceClienteVoce(v.codice_cliente); });
}

function htmlCodiceEnteVocePreventivo(voce, indice) {
  if (!codiceEnteEditorVisibile()) return '';
  return '<div class="f"><label>Cod. ente (computo della gara)</label>' +
    '<input type="text" class="pvv-codice-ente" maxlength="50" autocomplete="off" value="' + esc(voce.codice_cliente || '') + '" ' +
    'placeholder="Es. A.01.003" oninput="aggiornaCampoVocePreventivo(' + indice + ', \'codice_cliente\', this.value)"></div>';
}

// ── Import dell'Excel dell'ente ───────────────────────────────────────
function chiaveColonnaComputo(testo) {
  const t = String(testo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (/^(cod|codice|codice voce|voce|art|articolo|n voce|rif|riferimento|tariffa|codice tariffa)$/.test(t) || /^codice/.test(t)) return 'codice';
  if (/descri|lavorazion|designazione|oggetto/.test(t)) return 'descrizione';
  if (/^(u ?m|um|unita|unita di misura|unita misura|udm|u m)$/.test(t) || /^unita/.test(t)) return 'unita';
  if (/^(q ?ta|qta|quantita|qt|quant)/.test(t)) return 'quantita';
  return '';
}

function numeroComputo(v) {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).trim().replace(/\s/g, '');
  if (!s) return NaN;
  // "1.234,5" → 1234.5; "12,5" → 12.5; "12.5" → 12.5
  const norm = /,\d+$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  return Number(norm);
}

function righeDaFoglioComputo(foglio) {
  const righe = XLSX.utils.sheet_to_json(foglio, { header: 1, raw: true, defval: '' });
  // intestazione = la prima riga (nelle prime 15) che ha descrizione e quantità
  let testa = -1, mappa = null;
  for (let i = 0; i < Math.min(righe.length, 15); i++) {
    const m = {};
    (righe[i] || []).forEach(function(c, j) { const k = chiaveColonnaComputo(c); if (k && m[k] === undefined) m[k] = j; });
    if (m.descrizione !== undefined && m.quantita !== undefined) { testa = i; mappa = m; break; }
  }
  if (testa < 0) return { errore: 'Nel foglio non trovo le colonne: servono almeno "Descrizione" e "Quantità" nella riga di intestazione (e se ci sono "Codice" e "Unità").' };
  const out = [], scartate = [];
  for (let i = testa + 1; i < righe.length; i++) {
    const r = righe[i] || [];
    const desc = String(r[mappa.descrizione] == null ? '' : r[mappa.descrizione]).replace(/\s+/g, ' ').trim();
    const qRaw = r[mappa.quantita];
    if (!desc && (qRaw === '' || qRaw == null)) continue;
    const q = numeroComputo(qRaw);
    if (!desc || !(q > 0)) { scartate.push(i + 1); continue; }
    out.push({
      codice: mappa.codice !== undefined ? testoCodiceClienteVoce(r[mappa.codice]) : '',
      descrizione: desc.slice(0, 1000),
      unita: mappa.unita !== undefined ? String(r[mappa.unita] || '').trim().slice(0, 20) : '',
      quantita: Math.round(q * 1000) / 1000
    });
  }
  return { righe: out, scartate: scartate };
}

function apriImportComputoCliente() {
  let input = ge('pvv-computo-cliente-file');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'pvv-computo-cliente-file';
    input.accept = '.xlsx,.xls,.csv';
    input.style.display = 'none';
    input.onchange = function() { const f = input.files && input.files[0]; input.value = ''; if (f) importaComputoCliente(f); };
    document.body.appendChild(input);
  }
  input.click();
}

async function importaComputoCliente(file) {
  if (file.size > 5 * 1024 * 1024) { toast('Il file supera 5 MB', 'err'); return; }
  try { await caricaLibreriaExcel(); } catch (e) { toast('Libreria Excel non caricata: ' + e.message, 'err'); return; }
  let wb;
  try { wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); } catch (e) { toast('File non leggibile: ' + e.message, 'err'); return; }
  const foglio = wb.Sheets[wb.SheetNames[0]];
  const esito = righeDaFoglioComputo(foglio);
  if (esito.errore) { alert(esito.errore); return; }
  if (!esito.righe.length) { alert('Nel foglio non ci sono righe con descrizione e quantità.'); return; }
  await verificaCodiceClienteVociDisponibile(vociPreventivoDati);
  const conCodici = esito.righe.some(function(r) { return r.codice; });
  const anteprima = esito.righe.slice(0, 5).map(function(r) {
    return '• ' + (r.codice ? r.codice + ' – ' : '') + r.descrizione.slice(0, 60) + ' (' + String(r.quantita).replace('.', ',') + ' ' + (r.unita || '') + ')';
  }).join('\n');
  if (!confirm('Computo "' + file.name + '" (primo foglio): ' + esito.righe.length + ' righe da aggiungere come voci, con costo e prezzo da compilare.\n\n' +
      anteprima + (esito.righe.length > 5 ? '\n• …' : '') +
      (esito.scartate.length ? '\n\nRighe saltate (senza descrizione o quantità): ' + esito.scartate.slice(0, 15).join(', ') + (esito.scartate.length > 15 ? '…' : '') : '') +
      (conCodici && !codiceClienteVociDisponibile ? '\n\nIl codice dell\'ente va all\'inizio della descrizione (la colonna "Cod." arriva con l\'aggiornamento del database).' : '') +
      '\n\nAggiungere le voci? Si salvano con "💾 Salva preventivo".')) return;
  registraStatoUndoPreventivo('computo-' + Date.now());
  esito.righe.forEach(function(r) {
    vociPreventivoDati.push({
      id: null,
      _chiave: 'nuova-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      categoria: 'altro',
      descrizione: (r.codice && !codiceClienteVociDisponibile ? '[' + r.codice + '] ' : '') + r.descrizione,
      unita_misura: r.unita || 'pz',
      quantita: r.quantita,
      quantita_um: '',
      codice_cliente: codiceClienteVociDisponibile ? r.codice : '',
      costo_unitario: 0,
      prezzo_unitario: 0
    });
  });
  disegnaVociPreventivo();
  toast(esito.righe.length + ' voci del computo aggiunte: compila costo e prezzo e premi "💾 Salva preventivo"', 'ok');
}
