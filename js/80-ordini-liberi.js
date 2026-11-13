// ── F17.12 — ORDINI LIBERI SENZA OFFERTA (sql/128, decisione D3) ────────
// Nel box "🛒 Ordini ai fornitori" della commessa (js/27) "➕ Ordine libero
// (senza offerta)" per Acquisti e titolare: la stessa finestra
// m-ordine-fornitore con in più il fornitore dall'anagrafica e il preventivo
// del fornitore da allegare (va nella cartella "ordini" della commessa con
// registra_documento_commessa). RPC crea_ordine_libero: oltre la regola
// soglia_ordine_libero (Regole del titolare, 2.000 € IVA esclusa) l'ordine
// nasce "Da approvare": niente PDF finché il titolare non preme "✅ Approva"
// (o "✖ Non approvare" con il motivo, l'ordine diventa annullato). Il
// titolare riceve l'avviso e la riga di Cosa tocca a me; chi l'ha creato
// l'esito. Senza sql/128 niente bottone, nessun errore.

const ORDINI_LIBERI = { attivi: null, fornitori: null };

async function verificaOrdiniLiberiDisponibili() {
  if (ORDINI_LIBERI.attivi !== null) return ORDINI_LIBERI.attivi;
  try { const { data, error } = await db.rpc('ordini_liberi_attivi'); ORDINI_LIBERI.attivi = !error && data === true; } catch (e) { ORDINI_LIBERI.attivi = false; }
  return ORDINI_LIBERI.attivi;
}

function sogliaOrdineLibero() {
  const v = typeof leggiRegolaSubito === 'function' ? Number(leggiRegolaSubito('soglia_ordine_libero')) : NaN;
  return isFinite(v) && v >= 0 ? v : 2000;
}

function htmlBottoneOrdineLibero(commessa) {
  if (ORDINI_LIBERI.attivi !== true || !(ROLE === 'commerciale' || ROLE === 'titolare')) return '';
  if (ROLE !== 'titolare' && typeof commessaAperta === 'function' && !commessaAperta(commessa)) return '';
  return '<div style="margin:0 0 10px"><button type="button" class="btn sm" onclick="apriOrdineLibero()">➕ Ordine libero (senza offerta)</button>' +
    '<span style="font-size:12px;color:var(--m);margin-left:6px">oltre ' + euroPreventivo(sogliaOrdineLibero()) + ' lo approva il titolare</span></div>';
}

// La verifica prima di disegnare il box (il bottone è nel template di js/27)
if (typeof caricaOrdiniCommessa === 'function') {
  const caricaOrdiniCommessaSenzaLiberi = caricaOrdiniCommessa;
  // eslint-disable-next-line no-global-assign
  caricaOrdiniCommessa = async function() {
    await verificaOrdiniLiberiDisponibili();
    return caricaOrdiniCommessaSenzaLiberi.apply(this, arguments);
  };
}

// Ordine da un'offerta: il riquadro dell'ordine libero non si vede
if (typeof apriNuovoOrdineFornitore === 'function') {
  const apriNuovoOrdineFornitoreSenzaLiberi = apriNuovoOrdineFornitore;
  // eslint-disable-next-line no-global-assign
  apriNuovoOrdineFornitore = function() {
    const box = ge('mof-libero');
    if (box) box.style.display = 'none';
    return apriNuovoOrdineFornitoreSenzaLiberi.apply(this, arguments);
  };
}

async function apriOrdineLibero() {
  const commessa = commessaOrdiniAperta;
  if (!commessa) return;
  if (!ORDINI_LIBERI.fornitori) {
    const { data, error } = await db.from('fornitori').select('id,ragione_sociale').order('ragione_sociale').limit(1000);
    if (error) { toast('Fornitori non letti: ' + error.message, 'err'); return; }
    ORDINI_LIBERI.fornitori = data || [];
  }
  offertaNuovoOrdine = { libero: true };
  vociNuovoOrdine = [{ descrizione: '', unita_misura: 'pz', quantita: 1, prezzo_unitario: '', preventivo_voce_id: null }];
  ge('mof-titolo').textContent = '🛒 Ordine libero (senza offerta)';
  ge('mof-sottotitolo').textContent = 'Commessa ' + commessa.codice + (commessa.titolo ? ' · ' + commessa.titolo : '');
  ge('mof-fornitore').innerHTML = 'Ordine senza un\'offerta scelta nel preventivo: allega se puoi il preventivo del fornitore. ' +
    'Oltre <b>' + esc(euroPreventivo(sogliaOrdineLibero())) + '</b> IVA esclusa l\'ordine aspetta l\'approvazione del titolare prima del PDF.';
  ge('mof-libero').style.display = '';
  ge('mof-libero-fornitore').innerHTML = '<option value="">Scegli il fornitore…</option>' +
    ORDINI_LIBERI.fornitori.map(function(f) { return '<option value="' + esc(f.id) + '">' + esc(f.ragione_sociale) + '</option>'; }).join('');
  ge('mof-libero-allegato').value = '';
  ge('mof-data-ordine').value = dataOggiOrdine();
  ge('mof-arrivo').value = '';
  ge('mof-arrivo').min = dataOggiOrdine();
  ge('mof-luogo').value = typeof testoSedeCommessa === 'function' && testoSedeCommessa(commessa.sedi_cliente) ? 'Cantiere: ' + testoSedeCommessa(commessa.sedi_cliente) : '';
  ge('mof-note').value = 'Riferimento da indicare su conferma d\'ordine, DDT e fattura: commessa ' + commessa.codice + '.';
  const salva = ge('mof-salva-cartella-riga');
  const puoSalvare = documentiCommessaDisponibili === true && puoCaricareDocumentiCommessa(commessa);
  if (salva) salva.style.display = puoSalvare ? '' : 'none';
  if (ge('mof-salva-cartella')) ge('mof-salva-cartella').checked = puoSalvare;
  const bottone = ge('mof-conferma');
  if (bottone) { bottone.disabled = false; bottone.textContent = '🛒 Crea ordine libero'; }
  renderVociNuovoOrdine();
  openM('m-ordine-fornitore');
}

if (typeof salvaNuovoOrdineFornitore === 'function') {
  const salvaNuovoOrdineFornitoreSenzaLiberi = salvaNuovoOrdineFornitore;
  // eslint-disable-next-line no-global-assign
  salvaNuovoOrdineFornitore = async function() {
    if (offertaNuovoOrdine && offertaNuovoOrdine.libero) return salvaOrdineLibero();
    return salvaNuovoOrdineFornitoreSenzaLiberi.apply(this, arguments);
  };
}

async function salvaOrdineLibero() {
  const commessa = commessaOrdiniAperta;
  if (!commessa) return;
  const fornitore = v('mof-libero-fornitore');
  const dataOrdine = v('mof-data-ordine'), arrivo = v('mof-arrivo');
  if (!fornitore) { toast('Scegli il fornitore', 'err'); return; }
  if (!dataOrdine) { toast('Indica la data dell\'ordine', 'err'); return; }
  if (!arrivo) { toast('Indica la data di arrivo prevista', 'err'); return; }
  if (arrivo < dataOrdine) { toast('L\'arrivo previsto non può essere prima della data dell\'ordine', 'err'); return; }
  const voci = [];
  for (let i = 0; i < vociNuovoOrdine.length; i++) {
    const voce = vociNuovoOrdine[i];
    const descrizione = String(voce.descrizione || '').trim();
    const quantita = Number(voce.quantita);
    const prezzo = Number(voce.prezzo_unitario === '' ? NaN : voce.prezzo_unitario);
    if (!descrizione) { toast('Voce ' + (i + 1) + ': manca la descrizione', 'err'); return; }
    if (!Number.isFinite(quantita) || quantita <= 0) { toast('Voce ' + (i + 1) + ': la quantità deve essere maggiore di zero', 'err'); return; }
    if (!Number.isFinite(prezzo) || prezzo < 0) { toast('Voce ' + (i + 1) + ': prezzo unitario non valido', 'err'); return; }
    voci.push({ descrizione: descrizione, unita_misura: String(voce.unita_misura || '').trim() || 'pz',
      quantita: Math.round(quantita * 1000) / 1000, prezzo_unitario: Math.round(prezzo * 100) / 100 });
  }
  if (!voci.length) { toast('L\'ordine deve avere almeno una voce', 'err'); return; }
  const bottone = ge('mof-conferma');
  if (bottone) { bottone.disabled = true; bottone.textContent = '⏳ Creazione...'; }
  const ripristina = function() { if (bottone) { bottone.disabled = false; bottone.textContent = '🛒 Crea ordine libero'; } };

  // Preventivo del fornitore nella cartella "ordini" della commessa
  let allegatoPath = null, allegatoNome = null;
  const file = ge('mof-libero-allegato').files && ge('mof-libero-allegato').files[0];
  if (file) {
    if (file.size > 50 * 1024 * 1024) { ripristina(); toast('Il file supera 50 MB', 'err'); return; }
    allegatoNome = file.name.slice(0, 200);
    allegatoPath = commessa.id + '/ordini/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const up = await db.storage.from('commesse-documenti').upload(allegatoPath, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (up.error) { ripristina(); toast('Preventivo del fornitore non caricato: ' + up.error.message, 'err'); return; }
    const reg = await db.rpc('registra_documento_commessa', { p_commessa_id: commessa.id, p_cartella: 'ordini', p_storage_path: allegatoPath, p_nome_file: allegatoNome, p_nota: 'Preventivo del fornitore per un ordine libero' });
    if (reg.error) { await db.storage.from('commesse-documenti').remove([allegatoPath]); ripristina(); toast('Preventivo del fornitore non registrato: ' + reg.error.message, 'err'); return; }
  }

  const { data: ordineId, error } = await db.rpc('crea_ordine_libero', {
    p_commessa_id: commessa.id, p_fornitore_id: fornitore, p_data_ordine: dataOrdine, p_arrivo_previsto: arrivo, p_voci: voci,
    p_luogo_consegna: v('mof-luogo').trim() || null, p_note: v('mof-note').trim() || null,
    p_allegato_path: allegatoPath, p_allegato_nome: allegatoNome
  });
  if (error || !ordineId) { ripristina(); toast('Ordine non creato: ' + (error?.message || 'errore sconosciuto'), 'err'); return; }
  const salvaInCartella = !!ge('mof-salva-cartella')?.checked && documentiCommessaDisponibili === true && puoCaricareDocumentiCommessa(commessa);
  closeM('m-ordine-fornitore');
  const { data: ordine } = await db.from('ordini_fornitori').select('stato').eq('id', ordineId).maybeSingle();
  if (ordine && ordine.stato === 'da_approvare') {
    toast('Ordine libero creato: è oltre la soglia, il titolare deve approvarlo (gli arriva l\'avviso). Il PDF lo fai dopo l\'approvazione.', 'ok');
  } else {
    const pdf = await creaPdfOrdineFornitore(ordineId);
    if (!pdf) toast('Ordine creato, ma il PDF non è stato generato: usa il bottone 📄 PDF dell\'ordine', 'err');
    else {
      pdf.doc.save(pdf.nomeFile);
      if (!salvaInCartella) toast('Ordine libero creato: PDF scaricato', 'ok');
      else if (await registraPdfOrdineInCartella(commessa.id, pdf)) toast('Ordine libero creato: PDF scaricato e salvato nella cartella Ordini', 'ok');
    }
  }
  if (commessaApertaId === commessa.id) await caricaSchedaCommessa(commessa.id);
}

async function approvaOrdineLibero(id, approva) {
  let motivo = null;
  if (!approva) {
    motivo = prompt('Perché non approvi l\'ordine? (obbligatorio: lo legge chi l\'ha creato)', '');
    if (motivo === null) return;
    if (!motivo.trim()) { toast('Scrivi il motivo', 'err'); return; }
  } else if (!confirm('Approvare l\'ordine libero? Chi l\'ha creato potrà fare il PDF e mandarlo al fornitore.')) return;
  const { error } = await db.rpc('approva_ordine_libero', { p_ordine_id: id, p_approva: !!approva, p_motivo: motivo });
  if (error) { toast('Non riuscito: ' + error.message, 'err'); return; }
  toast(approva ? 'Ordine approvato' : 'Ordine non approvato (annullato)', 'ok');
  if (commessaOrdiniAperta && commessaApertaId === commessaOrdiniAperta.id) await caricaSchedaCommessa(commessaOrdiniAperta.id);
}

async function apriAllegatoOrdineLibero(path) {
  const { data, error } = await firmaFile('commesse-documenti', path, 3600);
  if (error || !data?.signedUrl) { toast('File non disponibile' + (error ? ': ' + error.message : ''), 'err'); return; }
  if (typeof apriPdfStessaScheda === 'function') apriPdfStessaScheda(data.signedUrl); else window.open(data.signedUrl, '_blank', 'noopener');
}

// ── Avvisi e Cosa tocca a me ──────────────────────────────────────────
if (typeof TIPI_AVVISO !== 'undefined') {
  TIPI_AVVISO.ordine_da_approvare = { icona: '🛒', nome: 'Ordine libero da approvare' };
  TIPI_AVVISO.ordine_libero_esito = { icona: '🛒', nome: 'Esito dell\'ordine libero' };
}
if (typeof OGGETTO_DA_TABELLA_AVVISO !== 'undefined') OGGETTO_DA_TABELLA_AVVISO.ordini_fornitori = 'ordine';
if (typeof NOME_RECORD_AVVISO !== 'undefined') NOME_RECORD_AVVISO.ordini_fornitori = 'l\'ordine';
if (typeof SCHEDE_CON_INDIRIZZO !== 'undefined' && !SCHEDE_CON_INDIRIZZO.ordine) {
  SCHEDE_CON_INDIRIZZO.ordine = {
    nome: 'l\'ordine', pagina: 'commessa-detail',
    apri: async function(id) {
      const { data } = await db.from('ordini_fornitori').select('commessa_id').eq('id', id).maybeSingle();
      if (!data) { toast('Ordine non trovato', 'err'); return; }
      return openCommessaDetail(data.commessa_id);
    }
  };
}
if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'ordini-liberi-da-approvare', ruoli: ['titolare'], icona: '🛒', livello: 'urgente', priorita: 27,
    titolo: 'Ordini liberi da approvare',
    vai: async function() {
      const { data } = await db.from('ordini_fornitori').select('commessa_id').eq('stato', 'da_approvare').order('creato_il').limit(1);
      if (data && data[0]) openCommessaDetail(data[0].commessa_id); else gotoPage('commesse');
    },
    conta: async function() {
      if (!(await verificaOrdiniLiberiDisponibili())) return null;
      return numeroTAM(contaTAM('ordini_fornitori').eq('stato', 'da_approvare'), 'ordini da approvare');
    }
  });
}
