// js/18h-esito-anticipo.js — esito del cliente, oggetto e nota, computo, anticipo e fattura d'anticipo.
// Riordino del 17/11: era una parte di js/18-preventivi.js (righe 9331-11095),
// spostata così com'era. Si carica subito dopo il pezzo precedente (index.html).

// =====================================================================
// F4.1 — ESITO DEL PREVENTIVO: accettato / rifiutato dal cliente
// Passo 5 del flusso della commessa: il rappresentante (o il titolare,
// mai obbligatorio) registra l'esito. Per accettare serve l'allegato
// (preventivo firmato o mail di approvazione), per rifiutare il motivo.
// Il database lo impone (sql/22: trigger trg_preventivi_esito e funzioni
// accetta_preventivo / rifiuta_preventivo). Senza sql/22 i bottoni non
// compaiono e il sito funziona come prima.
// =====================================================================

const STATI_ATTESA_ESITO_PREVENTIVO = ['inviato_a_rappresentante', 'inviato'];
// Stati con l'esito del cliente già registrato (F4.2: in_attesa_anticipo).
const STATI_ESITO_PREVENTIVO = ['in_attesa_anticipo', 'accettato', 'rifiutato'];
const ESITO_PREVENTIVO_MAX_MB = 15;
let esitoPreventivoDisponibile = true; // riordino 17/11: SQL già in produzione, nessuna lettura di controllo

// true se sql/22 è stato eseguito (esiste la colonna dell'allegato).
async function verificaEsitoPreventivoDisponibile() {
  if (esitoPreventivoDisponibile !== null) return esitoPreventivoDisponibile;

  const { error } = await db
    .from('preventivi')
    .select('allegato_accettazione_path')
    .limit(1);

  if (!error) {
    esitoPreventivoDisponibile = true;
  } else if (/allegato_accettazione_path|column|colonna/i.test(error.message || '')) {
    esitoPreventivoDisponibile = false;
  } else {
    // Errore di rete o altro: non decidere ora, riprova la prossima volta.
    return false;
  }

  return esitoPreventivoDisponibile;
}

function puoRegistrareEsitoPreventivo() {
  return ROLE === 'rappresentante' || ROLE === 'titolare';
}

function bottoniEsitoPreventivo(preventivo) {
  if (!puoRegistrareEsitoPreventivo()) return '';
  if (!STATI_ATTESA_ESITO_PREVENTIVO.includes(preventivo.stato)) return '';

  const numero = esc(String(preventivo.numero || ''));

  return `
    <button
      class="btn sm p"
      onclick="apriEsitoPreventivo('${preventivo.id}', 'accettato', '${numero}')"
    >
      ✅ Accettato dal cliente
    </button>
    <button
      class="btn sm"
      style="color:var(--r)"
      onclick="apriEsitoPreventivo('${preventivo.id}', 'rifiutato', '${numero}')"
    >
      ❌ Rifiutato dal cliente
    </button>
  `;
}

function nomeChiHaRegistratoEsito(utenteId) {
  if (!utenteId) return '';
  if (ME && utenteId === ME.id) return 'te';
  const u = (UTENTI || []).find(function(x) { return x.id === utenteId; });
  return u ? ((u.nome || '') + ' ' + (u.cognome || '')).trim() : '';
}

function dataOraEsitoPreventivo(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Riepilogo dell'esito già registrato (accettato o rifiutato).
function riepilogoEsitoPreventivo(preventivo) {
  if (!STATI_ESITO_PREVENTIVO.includes(preventivo.stato)) return '';

  const attesaAnticipo = preventivo.stato === 'in_attesa_anticipo';
  const accettato = preventivo.stato === 'accettato' || attesaAnticipo;
  const quando = dataOraEsitoPreventivo(preventivo.esito_registrato_il);
  const chi = nomeChiHaRegistratoEsito(preventivo.esito_registrato_da);
  const dettaglio = [
    quando ? 'il ' + quando : '',
    chi ? 'da ' + chi : ''
  ].filter(Boolean).join(' ');

  return `
    <div class="al2 ${attesaAnticipo ? 'w' : (accettato ? 'ok' : 'e')}" style="margin-top:10px">
      <b>${attesaAnticipo
        ? '⏳ Accettato dal cliente · in attesa dell\'anticipo'
        : (accettato ? '✅ Accettato dal cliente' : '❌ Rifiutato dal cliente')}</b>
      ${dettaglio ? `<span style="font-size:12px"> · registrato ${esc(dettaglio)}</span>` : ''}
      ${accettato ? rigaAnticipoPreventivo(preventivo) : ''}
      ${htmlCommessaPreventivo(preventivo)}
      ${!accettato && preventivo.motivo_rifiuto ? `
        <div style="margin-top:6px;white-space:pre-wrap">Motivo: ${esc(preventivo.motivo_rifiuto)}</div>
      ` : ''}
      ${!accettato ? htmlFatturaAnticipoPreventivo(preventivo) : ''}
      ${accettato && preventivo.allegato_accettazione_path ? `
        <div style="margin-top:8px">
          <button
            class="btn sm"
            onclick="apriAllegatoPreventivoFornitore('${esc(preventivo.allegato_accettazione_path)}')"
          >
            📎 ${esc(preventivo.allegato_accettazione_nome || 'Allegato di accettazione')}
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// Card per la scheda del preventivo (titolare e commerciale).
function cardEsitoPreventivo(preventivo) {
  // Colonne di sql/22 assenti: niente card.
  if (!preventivo || !('allegato_accettazione_path' in preventivo)) return '';

  const inAttesa = STATI_ATTESA_ESITO_PREVENTIVO.includes(preventivo.stato);
  const esito = riepilogoEsitoPreventivo(preventivo);

  if (!inAttesa && !esito) return '';

  return `
    <div class="card" style="margin-top:16px;border-left:4px solid var(--b)">
      <div style="font-size:14px;font-weight:700">
        🤝 Esito del cliente
      </div>

      ${inAttesa ? `
        <div style="font-size:12px;color:var(--m);margin:6px 0 10px">
          In attesa della risposta del cliente. Di norma la registra il rappresentante.
          Per accettare serve il preventivo firmato o la mail di approvazione.
        </div>
        ${puoRegistrareEsitoPreventivo() ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${bottoniEsitoPreventivo(preventivo)}
          </div>
        ` : ''}
      ` : esito}
    </div>
  `;
}

async function apriEsitoPreventivo(preventivoId, esito, numero) {
  if (!puoRegistrareEsitoPreventivo()) {
    toast('Solo il rappresentante o il titolare possono registrare l\'esito', 'err');
    return;
  }

  const accetta = esito === 'accettato';

  ge('mep-preventivo-id').value = preventivoId;
  ge('mep-esito').value = esito;
  ge('mep-titolo').textContent = accetta
    ? '✅ Preventivo accettato dal cliente'
    : '❌ Preventivo rifiutato dal cliente';
  ge('mep-sottotitolo').textContent = numero
    ? 'Preventivo n. ' + numero
    : '';

  ge('mep-box-accettazione').style.display = accetta ? '' : 'none';
  ge('mep-box-rifiuto').style.display = accetta ? 'none' : '';
  ge('mep-allegato').value = '';
  ge('mep-motivo').value = '';

  const bottone = ge('mep-conferma');
  bottone.textContent = accetta ? '✅ Conferma accettazione' : '❌ Conferma rifiuto';
  bottone.className = accetta ? 'btn p' : 'btn warn';

  // F4.2: anticipo sì/no (precompilato con quanto indicato dal commerciale).
  await preparaAnticipoEsitoPreventivo(preventivoId, accetta);
  // F18.3 (sql/132): "Il cliente ha accettato con condizioni diverse" (js/105)
  await preparaCondizioniDiverseEsito(accetta);

  aggiornaBottoneEsitoPreventivo();
  openM('m-esito-preventivo');
}

// Il bottone di conferma resta bloccato finché manca l'allegato (o il motivo).
function aggiornaBottoneEsitoPreventivo() {
  const bottone = ge('mep-conferma');
  if (!bottone) return;

  const esito = v('mep-esito');
  const pronto = esito === 'accettato'
    ? !!ge('mep-allegato')?.files?.[0] && anticipoEsitoPronto() && condizioniDiverseEsitoPronte()
    : v('mep-motivo').trim().length > 0;

  bottone.disabled = !pronto;
}

function messaggioErroreEsitoPreventivo(error) {
  const testo = error?.message || '';

  if (/3\.000/.test(testo)) {
    return 'Preventivo sopra 3.000 €: per ora l\'esito lo registra il titolare. Avvisalo.';
  }

  return testo || 'errore sconosciuto';
}

async function salvaEsitoPreventivo() {
  if (!puoRegistrareEsitoPreventivo()) return;

  const preventivoId = v('mep-preventivo-id');
  const esito = v('mep-esito');
  const bottone = ge('mep-conferma');

  if (!preventivoId || !['accettato', 'rifiutato'].includes(esito)) return;

  if (esito === 'rifiutato') {
    const motivo = v('mep-motivo').trim();

    if (!motivo) {
      toast('Scrivi il motivo del rifiuto', 'err');
      return;
    }

    bottone.disabled = true;

    const { error } = await db.rpc('rifiuta_preventivo', {
      p_preventivo_id: preventivoId,
      p_motivo: motivo
    });

    if (error) {
      bottone.disabled = false;
      toast('Rifiuto non registrato: ' + messaggioErroreEsitoPreventivo(error), 'err');
      return;
    }

    closeM('m-esito-preventivo');
    toast('Preventivo segnato come rifiutato', 'ok');
    await aggiornaDopoEsitoPreventivo(preventivoId);
    return;
  }

  // Accettazione: allegato obbligatorio.
  const file = ge('mep-allegato')?.files?.[0];

  if (!file) {
    toast('Allega il preventivo firmato o la mail di approvazione', 'err');
    aggiornaBottoneEsitoPreventivo();
    return;
  }

  if (file.size > ESITO_PREVENTIVO_MAX_MB * 1024 * 1024) {
    toast('L\'allegato supera il limite di ' + ESITO_PREVENTIVO_MAX_MB + ' MB', 'err');
    return;
  }

  const tipoAmmesso =
    file.type === 'application/pdf' ||
    /^image\//.test(file.type || '') ||
    file.type === 'message/rfc822' ||
    /\.(pdf|eml|msg|jpe?g|png|heic|webp)$/i.test(file.name);

  if (!tipoAmmesso) {
    toast('Allega un PDF, una foto o il file della mail (.eml / .msg)', 'err');
    return;
  }

  // F4.2: dati dell'anticipo (solo con sql/24 eseguito).
  const anticipo = datiAnticipoEsitoPreventivo();

  if (anticipo && anticipo.errore) {
    toast(anticipo.errore, 'err');
    return;
  }

  bottone.disabled = true;

  // Stesso schema di percorso degli altri caricamenti del bucket.
  const nomeSicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const percorso =
    preventivoId +
    '/accettazione/' +
    Date.now() +
    '_' +
    nomeSicuro;

  const { error: erroreUpload } = await db.storage
    .from('preventivi-documenti')
    .upload(percorso, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });

  if (erroreUpload) {
    bottone.disabled = false;
    toast('Errore caricamento allegato: ' + erroreUpload.message, 'err');
    return;
  }

  const parametriAccettazione = {
    p_preventivo_id: preventivoId,
    p_allegato_path: percorso,
    p_allegato_nome: file.name
  };

  if (anticipo) {
    parametriAccettazione.p_anticipo_richiesto = anticipo.richiesto;
    parametriAccettazione.p_anticipo_tipo = anticipo.tipo;
    parametriAccettazione.p_anticipo_valore = anticipo.valore;
  }

  const { data: nuovoStato, error } = await db.rpc('accetta_preventivo', parametriAccettazione);

  if (error) {
    await db.storage.from('preventivi-documenti').remove([percorso]);
    bottone.disabled = false;
    toast('Accettazione non registrata: ' + messaggioErroreEsitoPreventivo(error), 'err');
    return;
  }

  // F18.3 (sql/132): condizioni diverse al titolare (js/105); null = errore già detto
  const avvisoCondizioni = await salvaCondizioniDiverseEsito(preventivoId);
  closeM('m-esito-preventivo');
  if (avvisoCondizioni === null) { await aggiornaDopoEsitoPreventivo(preventivoId); return; }

  // F4.2: con l'anticipo il database restituisce 'in_attesa_anticipo'
  // e il preventivo compare alla segreteria in "Anticipi da fatturare".
  // F5.1: senza anticipo nasce subito la commessa (solo con sql/26).
  toast(
    nuovoStato === 'in_attesa_anticipo'
      ? 'Preventivo accettato: in attesa dell\'anticipo (passa alla segreteria per la fattura)'
      : 'Preventivo segnato come accettato' + await testoCommessaNata(preventivoId),
    'ok'
  );
  if (avvisoCondizioni) toast(ge('toast').textContent + avvisoCondizioni, 'ok');

  await aggiornaDopoEsitoPreventivo(preventivoId);
}

async function aggiornaDopoEsitoPreventivo(preventivoId) {
  // F5.3: sede o stato cambiati dalla pagina Commesse o dalla scheda
  // della commessa (js/26): si ricarica quella pagina.
  if (typeof aggiornaPagineCommesse === 'function' && await aggiornaPagineCommesse()) return;

  if (ROLE === 'rappresentante') {
    await loadPreventiviRappresentante();
    return;
  }

  if (currentPreventivoId === preventivoId && ge('pg-preventivo-detail')?.classList.contains('on')) {
    await openPreventivoDetail(preventivoId);
  }
}

// Elenco "Esiti registrati" nella pagina I miei preventivi del rappresentante.
async function htmlEsitiRegistratiRappresentante() {
  const anticipoDisponibile = await verificaAnticipoPreventivoDisponibile();
  // F4.3: fattura d'anticipo e accredito (solo con sql/25).
  const fatturaDisponibile = anticipoDisponibile && await verificaFatturaAnticipoDisponibile();

  const { data, error } = await db
    .from('preventivi')
    .select(`
      id,
      numero,
      stato,
      esito_registrato_il,
      esito_registrato_da,
      motivo_rifiuto,
      allegato_accettazione_path,
      allegato_accettazione_nome,
      ${anticipoDisponibile ? 'totale_imponibile, anticipo_richiesto, anticipo_tipo, anticipo_valore,' : ''}
      ${fatturaDisponibile ? COLONNE_FATTURA_ANTICIPO + ',' : ''}
      clienti!inner(ragione_sociale, rappresentante_id)
    `)
    .in('stato', STATI_ESITO_PREVENTIVO)
    .eq('clienti.rappresentante_id', ME.id)
    .not('esito_registrato_il', 'is', null)
    .order('esito_registrato_il', { ascending: false })
    .limit(20);

  if (error || !data?.length) return '';

  // F5.1: codice della commessa sui preventivi accettati (solo con sql/26).
  await aggiungiCommessaAiPreventivi(data);

  return `
    <div style="font-size:14px;font-weight:700;margin:22px 0 10px">
      Esiti registrati (ultimi 20)
    </div>
    ${data.map(function(preventivo) {
      return `
        <div class="card" style="margin-bottom:10px">
          <div style="font-size:14px;font-weight:700">
            Preventivo n. ${esc(String(preventivo.numero || '—'))}
          </div>
          <div style="font-size:13px;margin-top:2px">
            ${esc(preventivo.clienti?.ragione_sociale || 'Cliente')}
          </div>
          ${riepilogoEsitoPreventivo(preventivo)}
        </div>
      `;
    }).join('')}
  `;
}


// =====================================================================
// F4.2 — ANTICIPO DEL PREVENTIVO e lista "Anticipi da fatturare"
// Passi 5 e 6 del flusso della commessa. Il commerciale può indicare
// l'anticipo nel preventivo; il rappresentante lo conferma o lo corregge
// quando il cliente accetta. Con l'anticipo il preventivo va
// "in attesa anticipo" (sql/24) e compare alla segreteria: senza
// accredito la commessa non parte. Senza sql/24 nulla di questo compare.
// =====================================================================

let anticipoPreventivoDisponibile = true; // riordino 17/11: SQL già in produzione, nessuna lettura di controllo

// sql/264 --------------------------------------------------------------
const OGGETTO_PREVENTIVO_MAX = 200;
const NOTA_INTRO_PREVENTIVO_MAX = 2000;
let oggettoNotaPreventivoDisponibile = true; // riordino 17/11: SQL già in produzione, nessuna lettura di controllo
let computoPreventivoDisponibile = true; // riordino 17/11: SQL già in produzione, nessuna lettura di controllo

// true solo con le colonne oggetto e nota_introduttiva (sql/264). Si legge
// una riga intera e si guarda se la colonna c'è: così senza sql/264 nessuna
// richiesta finisce in errore (un 400 "column does not exist" sporcherebbe i
// controlli degli altri moduli). Nessuna riga leggibile o errore di rete: non
// si decide ora, si riprova la prossima volta (l'editor si apre su un
// preventivo che il ruolo legge, quindi una riga c'è).
async function verificaOggettoNotaPreventivoDisponibile() {
  if (oggettoNotaPreventivoDisponibile !== null) return oggettoNotaPreventivoDisponibile;

  const { data, error } = await db
    .from('preventivi')
    .select('*')
    .limit(1);

  if (error || !data || !data.length) return false;

  oggettoNotaPreventivoDisponibile = Object.prototype.hasOwnProperty.call(data[0], 'nota_introduttiva');
  // sql/264 (computo, stesso file): dalla stessa riga
  computoPreventivoDisponibile = Object.prototype.hasOwnProperty.call(data[0], 'computo_path');
  return oggettoNotaPreventivoDisponibile;
}

// true solo con le colonne computo_path e computo_nome (sql/264).
async function verificaComputoPreventivoDisponibile() {
  if (computoPreventivoDisponibile === null) await verificaOggettoNotaPreventivoDisponibile();
  return computoPreventivoDisponibile === true;
}

// sql/265 --------------------------------------------------------------
// "Quantità x UM" delle voci: testo LIBERO e facoltativo ("2,5", "12 m²",
// "circa 30"), solo informativo: NESSUN calcolo (il totale della riga resta
// quantità (pz) × prezzo unitario). Una riga, al massimo 50 caratteri.
const QUANTITA_UM_VOCE_MAX = 50;

function testoQuantitaUmVoce(valore) {
  return String(valore == null ? '' : valore).replace(/[\r\n]+/g, ' ').trim();
}

// Numeri delle voci nei campi dell'editor (richiesta di Erika del 12/11):
// vuoto o 0 = campo vuoto (non "0,00"); il valore salvato resta 0.
function campoNumeroVocePreventivo(valore, decimaliMinimi) {
  return numeroPreventivo(valore) === 0 ? '' : importoConVirgolaPreventivo(valore, decimaliMinimi);
}

function htmlQuantitaUmVocePreventivo(voce, indice) {
  if (!quantitaUmEditorDisponibile) return '';
  return `
                  <div class="f">
                  <label>Quantità x UM</label>
                  <input
                    type="text"
                    class="pvv-quantita-um"
                    maxlength="${QUANTITA_UM_VOCE_MAX}"
                    autocomplete="off"
                    value="${esc(voce.quantita_um || '')}"
                    placeholder="Es. 2,5"
                    title="Facoltativa, testo libero: solo informativa, non entra nei calcoli"
                    oninput="aggiornaCampoVocePreventivo(${indice}, 'quantita_um', this.value)"
                  >
                </div>
`;
}

function htmlOggettoNotaEditorPreventivo() {
  if (!oggettoNotaEditorDisponibile) return '';
  return `
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--b)">
  <div style="font-size:14px;font-weight:700;margin-bottom:5px">
    🏷️ Oggetto e nota iniziale
  </div>

  <div style="font-size:12px;color:var(--m);margin-bottom:10px">
    Facoltativi. Nel PDF per il cliente vanno dopo i dati del cliente e prima
    della tabella dei prezzi.
  </div>

  <label style="font-size:12px;font-weight:600">Oggetto (facoltativo)</label>
  <input
    id="pvv-oggetto"
    type="text"
    maxlength="${OGGETTO_PREVENTIVO_MAX}"
    placeholder="Es. Fornitura e posa di porte REI 60 al piano terra"
    oninput="oggettoPreventivoEditor = this.value"
    value="${esc(oggettoPreventivoEditor)}"
  >
${computoEditorPreventivo.disponibile ? '<div id="pvv-computo">' + htmlComputoEditorPreventivo() + '</div>' : ''}
  <label style="font-size:12px;font-weight:600;display:block;margin-top:10px">Nota prima della tabella dei prezzi (facoltativa)</label>
  <textarea
    id="pvv-nota-introduttiva"
    rows="3"
    maxlength="${NOTA_INTRO_PREVENTIVO_MAX}"
    placeholder="Es. Come da sopralluogo del 10/11, vi proponiamo quanto segue."
    oninput="notaIntroPreventivoEditor = this.value"
  >${esc(notaIntroPreventivoEditor)}</textarea>
</div>
  `;
}

// Scrive "Oggetto: ..." (grassetto) e la nota sotto i dati del cliente;
// restituisce la nuova y. Niente da scrivere = y invariata.
// sql/264 (computo): traOggettoENota(y) → nuova y, per la tabella del
// computo Excel fra "Oggetto:" e la nota; senza è tutto come prima.
function scriviOggettoNotaPdfPreventivo(doc, preventivo, margine, y, traOggettoENota) {
  const oggetto = String(preventivo?.oggetto || '').replace(/[\r\n]+/g, ' ').trim();
  const nota = String(preventivo?.nota_introduttiva || '').trim();
  if (!oggetto && !nota && !traOggettoENota) return y;

  const larghezzaTesto = 178;
  y += 2;
  doc.setTextColor(25, 25, 25);

  if (oggetto) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const righe = doc.splitTextToSize('Oggetto: ' + oggetto, larghezzaTesto);
    doc.text(righe, margine, y);
    y += righe.length * 5 + 2;
  }

  if (traOggettoENota) y = traOggettoENota(y);

  if (nota) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const righe = doc.splitTextToSize(nota, larghezzaTesto);
    righe.forEach(function(riga) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(riga, margine, y);
      y += 4.5;
    });
    y += 2;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  return y;
}
// sql/264: computo dell'ingegnere -----------------------------------------
// Un file Excel (xlsx, xls, csv) o PDF, al massimo 10 MB, nel bucket
// preventivi-documenti in <id>/computo/<ora>_<nome>. Si carica e si collega
// SUBITO (non con "💾 Salva preventivo"): così il file e il preventivo non
// restano mai a metà. Lo caricano e lo tolgono il titolare e Acquisti che
// ha preparato il preventivo, prima dell'esito (dopo solo il titolare):
// stesse regole del database (trigger e regole dei file di sql/264).
// Nel PDF del cliente: Excel = tabella del primo foglio tra "Oggetto:" e la
// nota; PDF = sue pagine subito dopo la pagina con oggetto e nota.
const COMPUTO_MAX_BYTE = 10 * 1024 * 1024;
const COMPUTO_MAX_RIGHE = 300;
const COMPUTO_AVVISO_COLONNE = 10;
const COMPUTO_ESTENSIONI = ['xlsx', 'xls', 'csv', 'pdf'];

function estensioneComputo(nome) {
  const m = /\.([a-z0-9]+)$/i.exec(String(nome || ''));
  return m ? m[1].toLowerCase() : '';
}

function computoPreventivoModificabile() {
  const c = computoEditorPreventivo;
  if (!c.disponibile) return false;
  if (ROLE === 'titolare') return true;
  if (STATI_ESITO_PREVENTIVO.includes(c.stato)) return false;
  return ROLE === 'commerciale' && !!ME && c.commercialeId === ME.id;
}

function htmlComputoEditorPreventivo() {
  const c = computoEditorPreventivo;
  const puo = computoPreventivoModificabile();
  const tipo = c.path ? (estensioneComputo(c.path) === 'pdf' ? '📄 PDF' : '📊 Excel') : '';
  return `
  <div style="margin-top:12px;padding:10px 12px;border:1px dashed var(--b);border-radius:8px">
    <div style="font-size:12px;font-weight:600">📐 Computo (facoltativo)</div>
    <div style="font-size:12px;color:var(--m);margin:3px 0 8px">
      Il computo dell'ingegnere (Excel o PDF, al massimo 10 MB). Nel PDF per il
      cliente va dopo l'oggetto e prima della nota: un Excel diventa una tabella,
      un PDF entra come immagine delle sue pagine (margini bianchi tagliati).
    </div>
    ${c.path ? `
      <div id="pvv-computo-nome" style="font-size:13px;margin-bottom:8px">
        ${tipo}: <b>${esc(c.nome || c.path.split('/').pop())}</b>
      </div>` : `<div style="font-size:12px;color:var(--m);margin-bottom:8px">Nessun computo caricato.</div>`}
    ${puo ? `
      <input id="pvv-computo-file" type="file" accept=".xlsx,.xls,.csv,.pdf,.numbers" style="display:none"
        onchange="caricaComputoPreventivo(this)">
      <button class="btn bs bsm" type="button" onclick="ge('pvv-computo-file').click()">
        ${c.path ? '🔁 Sostituisci' : '📎 Carica Excel o PDF'}
      </button>
      ${c.path ? `<button class="btn bs bsm" type="button" onclick="togliComputoPreventivo()">✖ Togli</button>` : ''}
    ` : (c.path ? '' : `<div style="font-size:12px;color:var(--m)">Lo carica Acquisti che ha preparato il preventivo o il titolare.</div>`)}
  </div>`;
}

function ridisegnaComputoEditorPreventivo() {
  const box = ge('pvv-computo');
  if (box) box.innerHTML = htmlComputoEditorPreventivo();
}

async function caricaComputoPreventivo(input) {
  const file = input?.files?.[0];
  if (input) input.value = '';
  if (!file || !currentPreventivoId) return;
  if (!computoPreventivoModificabile()) { toast('Il computo lo carica Acquisti che ha preparato il preventivo o il titolare', 'err'); return; }
  const est = estensioneComputo(file.name);
  if (est === 'numbers') { toast('Questo è un file di Numbers: in Numbers usa File → Esporta come → Excel e carica il file .xlsx', 'err'); return; }
  if (!COMPUTO_ESTENSIONI.includes(est)) { toast('Il computo deve essere un file Excel (.xlsx, .xls, .csv) o PDF', 'err'); return; }
  if (file.size > COMPUTO_MAX_BYTE) { toast('Il computo supera i 10 MB', 'err'); return; }
  if (file.size === 0) { toast('Il file è vuoto', 'err'); return; }

  const vecchio = computoEditorPreventivo.path;
  const nomeSicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const percorso = currentPreventivoId + '/computo/' + Date.now() + '_' + nomeSicuro;
  const tipi = { pdf: 'application/pdf', csv: 'text/csv', xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

  const { error: erroreUpload } = await db.storage
    .from('preventivi-documenti')
    .upload(percorso, file, { contentType: tipi[est], upsert: false });
  if (erroreUpload) { toast('Computo non caricato: ' + erroreUpload.message, 'err'); return; }

  const nome = String(file.name).replace(/[\r\n]+/g, ' ').trim().slice(0, 255);
  const { error } = await db
    .from('preventivi')
    .update({ computo_path: percorso, computo_nome: nome })
    .eq('id', currentPreventivoId);
  if (error) {
    await db.storage.from('preventivi-documenti').remove([percorso]);
    toast('Computo caricato ma non collegato: ' + error.message, 'err');
    return;
  }
  // il file di prima non serve più (se non si toglie resta solo nella cartella)
  if (vecchio && vecchio !== percorso) await db.storage.from('preventivi-documenti').remove([vecchio]);

  computoEditorPreventivo.path = percorso;
  computoEditorPreventivo.nome = nome;
  ridisegnaComputoEditorPreventivo();
  toast(vecchio ? 'Computo sostituito' : 'Computo caricato', 'ok');
}

async function togliComputoPreventivo() {
  const vecchio = computoEditorPreventivo.path;
  if (!vecchio || !currentPreventivoId) return;
  if (!computoPreventivoModificabile()) { toast('Il computo lo toglie Acquisti che ha preparato il preventivo o il titolare', 'err'); return; }
  if (!confirm('Togliere il computo dal preventivo? Il PDF per il cliente non lo avrà più.')) return;

  const { error } = await db
    .from('preventivi')
    .update({ computo_path: null, computo_nome: null })
    .eq('id', currentPreventivoId);
  if (error) { toast('Computo non tolto: ' + error.message, 'err'); return; }
  await db.storage.from('preventivi-documenti').remove([vecchio]);

  computoEditorPreventivo.path = null;
  computoEditorPreventivo.nome = null;
  ridisegnaComputoEditorPreventivo();
  toast('Computo tolto', 'ok');
}

// Legge il computo per il PDF: { tipo: 'excel', righe, righeTotali,
// colonne } oppure { tipo: 'pdf', immagini } (12/11: pagine disegnate con
// pdf.js e ritagliate, vanno nel flusso del preventivo come l'Excel). Errore = eccezione con il motivo.
async function leggiComputoPerPdfPreventivo(percorso) {
  const { data: blob, error } = await db.storage.from('preventivi-documenti').download(percorso);
  if (error || !blob) throw new Error('il file non si scarica' + (error?.message ? ' (' + error.message + ')' : ''));
  const byte = await blob.arrayBuffer();

  if (estensioneComputo(percorso) === 'pdf') {
    return { tipo: 'pdf', immagini: await immaginiComputoPdfPreventivo(byte) };
  }

  await caricaLibreriaExcel();
  let righe;
  try {
    const libro = XLSX.read(new Uint8Array(byte), { type: 'array' });
    const foglio = libro.Sheets[libro.SheetNames[0]];
    // raw false = i valori come li mostra Excel (numeri e date formattati)
    righe = foglio ? XLSX.utils.sheet_to_json(foglio, { header: 1, raw: false, defval: '', blankrows: true }) : [];
  } catch (e) {
    throw new Error('il foglio Excel del computo non si legge');
  }
  righe = righe.map(function(riga) {
    return (riga || []).map(function(cella) { return String(cella == null ? '' : cella).trim(); });
  });
  // righe vuote in fondo e celle vuote in fondo a ogni riga: via
  while (righe.length && righe[righe.length - 1].every(function(c) { return c === ''; })) righe.pop();
  let colonne = 0;
  righe.forEach(function(riga) {
    for (let i = riga.length - 1; i >= 0; i--) {
      if (riga[i] !== '') { colonne = Math.max(colonne, i + 1); break; }
    }
  });
  righe = righe.map(function(riga) {
    const r = riga.slice(0, colonne);
    while (r.length < colonne) r.push('');
    return r;
  });
  const righeTotali = righe.length;
  return { tipo: 'excel', righe: righe.slice(0, COMPUTO_MAX_RIGHE), righeTotali, colonne };
}

// Tabella del computo Excel nel PDF (prima riga = intestazione): colonne
// strette per stare nei 178 mm; restituisce la nuova y.
function scriviComputoExcelPdfPreventivo(doc, computo, margine, y) {
  if (!computo || !computo.righe.length || !computo.colonne) return y;
  const pulisci = typeof pulisciTestoPDF === 'function' ? pulisciTestoPDF : function(t) { return t; };
  const righe = computo.righe.map(function(r) { return r.map(function(c) { return pulisci(c); }); });
  const n = computo.colonne;
  const carattere = n <= 5 ? 8 : n <= 8 ? 7 : n <= 10 ? 6.5 : n <= 14 ? 5.5 : 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(25, 25, 25);
  if (y > 240) { doc.addPage(); y = 20; }
  doc.text('Computo', margine, y + 2);

  doc.autoTable({
    margin: { top: 18, right: margine, bottom: 82, left: margine },
    startY: y + 5,
    tableWidth: 178,
    head: righe.length > 1 ? [righe[0]] : undefined,
    body: righe.length > 1 ? righe.slice(1) : righe,
    theme: 'grid',
    headStyles: { fillColor: [232, 238, 236], textColor: [25, 25, 25], fontStyle: 'bold' },
    styles: { fontSize: carattere, cellPadding: 1.4, overflow: 'linebreak' }
  });
  y = doc.lastAutoTable.finalY + 4;

  if (computo.righeTotali > computo.righe.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text('Computo: riportate le prime ' + computo.righe.length + ' righe di ' + computo.righeTotali + '.', margine, y + 2);
    y += 6;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(25, 25, 25);
  return y + 4;
}

// Computo PDF (richiesta di Erika del 12/11): ogni pagina disegnata con
// pdf.js su un canvas (circa 2x, massimo 2000 px di lato), margini bianchi
// tagliati (riquadro dei pixel non bianchi + un piccolo bordo). Restituisce
// [{ dati (PNG), larghezzaMm, altezzaMm }] alla scala 1:1 della pagina
// sorgente; le pagine tutte bianche si saltano. Errore = eccezione col motivo.
async function immaginiComputoPdfPreventivo(byte) {
  try {
    await caricaLibreriaPdfJs();
  } catch (e) {
    throw new Error('la libreria per leggere il PDF non si carica (' + e.message + ')');
  }
  let pdf;
  try {
    pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(byte.slice(0)) }).promise;
  } catch (e) {
    throw new Error('il PDF del computo non si legge (protetto da password o rovinato?)');
  }
  const MM_PER_PUNTO = 25.4 / 72;
  const immagini = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const pagina = await pdf.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const scala = Math.min(2, 2000 / Math.max(base.width, base.height));
      const vista = pagina.getViewport({ scale: scala });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vista.width);
      canvas.height = Math.ceil(vista.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: ctx, viewport: vista }).promise;

      // riquadro dei pixel non bianchi
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let x0 = canvas.width, y0 = canvas.height, x1 = -1, y1 = -1;
      for (let yy = 0; yy < canvas.height; yy++) {
        const riga = yy * canvas.width * 4;
        for (let xx = 0; xx < canvas.width; xx++) {
          const i = riga + xx * 4;
          if (px[i] < 240 || px[i + 1] < 240 || px[i + 2] < 240) {
            if (xx < x0) x0 = xx;
            if (xx > x1) x1 = xx;
            if (yy < y0) y0 = yy;
            if (yy > y1) y1 = yy;
          }
        }
      }
      pagina.cleanup();
      if (x1 < 0) continue; // pagina bianca
      const bordo = Math.round(4 * scala); // circa 1,4 mm
      x0 = Math.max(0, x0 - bordo); y0 = Math.max(0, y0 - bordo);
      x1 = Math.min(canvas.width - 1, x1 + bordo); y1 = Math.min(canvas.height - 1, y1 + bordo);
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const taglio = document.createElement('canvas');
      taglio.width = w; taglio.height = h;
      taglio.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
      immagini.push({
        dati: taglio.toDataURL('image/png'),
        larghezzaMm: (w / scala) * MM_PER_PUNTO,
        altezzaMm: (h / scala) * MM_PER_PUNTO
      });
    }
  } catch (e) {
    throw new Error('le pagine del PDF del computo non si disegnano (' + e.message + ')');
  } finally {
    try { pdf.destroy(); } catch (e) { /* già chiuso */ }
  }
  return immagini;
}

// Computo PDF nel PDF del preventivo, dopo "Oggetto:" e prima della nota:
// titolo "Computo" e le immagini una dopo l'altra, larghe al massimo 178 mm
// (mai ingrandite oltre la scala 1:1); se non c'è posto pagina nuova come le
// altre del preventivo (y 20, fondo 215 come la tabella dei prezzi); più
// alta di una pagina = rimpicciolita. Restituisce la nuova y.
function scriviComputoPdfImmaginiPreventivo(doc, computo, margine, y) {
  const immagini = (computo && computo.immagini) || [];
  if (!immagini.length) return y;
  const larghezzaUtile = 178, cima = 20, fondo = 215;
  const misure = immagini.map(function(img) {
    let l = Math.min(img.larghezzaMm, larghezzaUtile);
    let a = img.altezzaMm * (l / img.larghezzaMm);
    if (a > fondo - cima) { l = l * ((fondo - cima) / a); a = fondo - cima; }
    return { l: l, a: a };
  });

  // il titolo resta con la prima immagine
  if (y + 6 + misure[0].a > fondo) { doc.addPage(); y = cima; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(25, 25, 25);
  doc.text('Computo', margine, y + 2);
  y += 5;

  immagini.forEach(function(img, i) {
    const m = misure[i];
    if (y + m.a > fondo) { doc.addPage(); y = cima; }
    doc.addImage(img.dati, 'PNG', margine, y, m.l, m.a, undefined, 'FAST');
    y += m.a + 3;
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  return y + 3;
}
let anticipoEsitoAttivo = false;
let anticipoEsitoNonCaricato = false;
let anticipoEsitoTotale = 0;

// true se sql/24 è stato eseguito (esiste la colonna anticipo_richiesto).
async function verificaAnticipoPreventivoDisponibile() {
  if (anticipoPreventivoDisponibile !== null) return anticipoPreventivoDisponibile;

  const { error } = await db
    .from('preventivi')
    .select('anticipo_richiesto')
    .limit(1);

  if (!error) {
    anticipoPreventivoDisponibile = true;
  } else if (/anticipo_richiesto|column|colonna/i.test(error.message || '')) {
    anticipoPreventivoDisponibile = false;
  } else {
    // Errore di rete o altro: non decidere ora, riprova la prossima volta.
    return false;
  }

  return anticipoPreventivoDisponibile;
}

function numeroAnticipo(valore) {
  if (valore === null || valore === undefined) return NaN;
  const testo = String(valore).trim().replace(',', '.');
  return testo === '' ? NaN : Number(testo);
}

// Importo dell'anticipo in EUR, IVA esclusa.
function importoAnticipoPreventivo(tipo, valore, totaleImponibile) {
  const numero = numeroAnticipo(valore);
  if (!Number.isFinite(numero)) return 0;
  if (tipo === 'percentuale') {
    return Math.round(numeroPreventivo(totaleImponibile) * numero) / 100;
  }
  return numero;
}

function testoAnticipoPreventivo(tipo, valore, totaleImponibile) {
  const numero = numeroAnticipo(valore);
  if (!Number.isFinite(numero) || numero <= 0) return '';

  const importo = euroPreventivo(importoAnticipoPreventivo(tipo, valore, totaleImponibile));

  return tipo === 'percentuale'
    ? numero.toLocaleString('it-IT') + '% del totale imponibile = ' + importo + ' + IVA'
    : importo + ' + IVA';
}

// Riga "Anticipo: ..." nel riepilogo dell'esito (solo con sql/24).
function rigaAnticipoPreventivo(preventivo) {
  if (!preventivo || !('anticipo_richiesto' in preventivo)) return '';

  if (preventivo.anticipo_richiesto !== true) {
    return '<div style="margin-top:6px;font-size:12px">Senza anticipo</div>';
  }

  const testo = testoAnticipoPreventivo(
    preventivo.anticipo_tipo,
    preventivo.anticipo_valore,
    preventivo.totale_imponibile
  );

  return `
    <div style="margin-top:6px;font-size:13px">
      Anticipo: <b>${esc(testo || 'indicato')}</b>
      ${preventivo.stato === 'in_attesa_anticipo' ? `
        <div style="font-size:12px;margin-top:2px">
          La segreteria emette la fattura d'anticipo e verifica l'accredito:
          finché non è accreditato la commessa non parte.
        </div>
      ` : ''}
      ${htmlFatturaAnticipoPreventivo(preventivo)}
    </div>
  `;
}

// Controlla e normalizza i dati dell'anticipo.
// consentiNonIndicato: nell'editor del commerciale si può lasciare vuoto.
function datiAnticipoValidi(richiesto, tipo, valore, totaleImponibile, consentiNonIndicato) {
  if (richiesto === null || richiesto === undefined) {
    return consentiNonIndicato
      ? { richiesto: null, tipo: null, valore: null }
      : { errore: 'Indica se il cliente paga un anticipo (sì o no)' };
  }

  if (richiesto === false) {
    return { richiesto: false, tipo: null, valore: null };
  }

  if (!['percentuale', 'importo'].includes(tipo)) {
    return { errore: 'Indica se l\'anticipo è una percentuale o un importo' };
  }

  const numero = numeroAnticipo(valore);

  if (!Number.isFinite(numero) || numero <= 0) {
    return { errore: 'Indica il valore dell\'anticipo (maggiore di zero)' };
  }

  const arrotondato = Math.round(numero * 100) / 100;

  if (tipo === 'percentuale' && arrotondato > 100) {
    return { errore: 'La percentuale dell\'anticipo non può superare 100' };
  }

  if (tipo === 'importo' && arrotondato > numeroPreventivo(totaleImponibile)) {
    return {
      errore: 'L\'anticipo supera il totale imponibile del preventivo (' +
        euroPreventivo(totaleImponibile) + ')'
    };
  }

  return { richiesto: true, tipo: tipo, valore: arrotondato };
}

// ---- Editor del preventivo (commerciale / titolare) ----------------------

function htmlAnticipoEditorPreventivo(totaleImponibile) {
  const a = anticipoPreventivoEditor;
  if (!a.disponibile) return '';

  const intestazione = `
    <div style="font-size:14px;font-weight:700;margin-bottom:5px">
      💶 Anticipo
    </div>
  `;

  if (a.bloccato) {
    return `
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--b)">
        ${intestazione}
        <div style="font-size:13px">
          ${a.richiesto === true
            ? 'Anticipo: <b>' + esc(testoAnticipoPreventivo(a.tipo, a.valore, totaleImponibile)) + '</b>'
            : 'Senza anticipo'}
        </div>
        <div style="font-size:12px;color:var(--m);margin-top:4px">
          Fissato quando il cliente ha risposto: non si cambia più.
        </div>
      </div>
    `;
  }

  return `
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--b)">
      ${intestazione}

      <div style="font-size:12px;color:var(--m);margin-bottom:10px">
        Facoltativo. Il cliente paga un anticipo prima dei lavori? Se lo indichi
        qui, il rappresentante lo trova già compilato quando il cliente accetta
        (e può correggerlo). Per togliere l'anticipo scegli "Non indicato" (o
        "No") e salva: si può cambiare finché il cliente non ha risposto. Il
        testo delle modalità di pagamento qui sopra resta quello del PDF.
      </div>

      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:13px;margin-bottom:10px">
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
          <input
            type="radio"
            name="pvv-anticipo"
            value="nd"
            ${a.richiesto !== true && a.richiesto !== false ? 'checked' : ''}
            onchange="impostaAnticipoEditor('richiesto', null)"
          >
          Non indicato (lo decide il rappresentante)
        </label>
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
          <input
            type="radio"
            name="pvv-anticipo"
            value="no"
            ${a.richiesto === false ? 'checked' : ''}
            onchange="impostaAnticipoEditor('richiesto', false)"
          >
          No, senza anticipo
        </label>
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
          <input
            type="radio"
            name="pvv-anticipo"
            value="si"
            ${a.richiesto === true ? 'checked' : ''}
            onchange="impostaAnticipoEditor('richiesto', true)"
          >
          Sì, con anticipo
        </label>
      </div>

      <div id="pvv-anticipo-dettaglio" class="g2" style="display:${a.richiesto === true ? 'grid' : 'none'}">
        <div class="f">
          <label>Anticipo espresso in</label>
          <select onchange="impostaAnticipoEditor('tipo', this.value)">
            <option value="percentuale" ${a.tipo === 'percentuale' ? 'selected' : ''}>% del totale imponibile</option>
            <option value="importo" ${a.tipo === 'importo' ? 'selected' : ''}>Importo in € (IVA esclusa)</option>
          </select>
        </div>
        <div class="f">
          <label>Valore *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value="${esc(String(a.valore ?? ''))}"
            placeholder="Es. 30"
            oninput="impostaAnticipoEditor('valore', this.value)"
          >
        </div>
      </div>

      <div id="pvv-anticipo-calcolo" style="font-size:12px;color:var(--m)">
        ${a.richiesto === true ? esc(testoAnticipoPreventivo(a.tipo, a.valore, totaleImponibile)) : ''}
      </div>
    </div>
  `;
}

function impostaAnticipoEditor(campo, valore) {
  if (anticipoPreventivoEditor.bloccato) return;

  anticipoPreventivoEditor[campo] = valore;

  const dettaglio = ge('pvv-anticipo-dettaglio');
  if (dettaglio) {
    dettaglio.style.display = anticipoPreventivoEditor.richiesto === true ? 'grid' : 'none';
  }

  const calcolo = ge('pvv-anticipo-calcolo');
  if (calcolo) {
    const totale = vociPreventivoDati.reduce(function(somma, voce) {
      return somma + totaleVocePreventivo(voce, 'vendita');
    }, 0);

    calcolo.textContent = anticipoPreventivoEditor.richiesto === true
      ? testoAnticipoPreventivo(anticipoPreventivoEditor.tipo, anticipoPreventivoEditor.valore, totale)
      : '';
  }
}

// ---- Finestra "Accettato dal cliente" (rappresentante / titolare) --------

async function preparaAnticipoEsitoPreventivo(preventivoId, accetta) {
  const box = ge('mep-box-anticipo');
  anticipoEsitoAttivo = false;
  anticipoEsitoNonCaricato = false;
  anticipoEsitoTotale = 0;

  if (!box) return;
  box.style.display = 'none';

  document.querySelectorAll('input[name="mep-anticipo"]').forEach(function(radio) {
    radio.checked = false;
  });
  ge('mep-anticipo-tipo').value = 'percentuale';
  ge('mep-anticipo-valore').value = '';

  if (!accetta || !(await verificaAnticipoPreventivoDisponibile())) {
    aggiornaAnticipoEsitoPreventivo();
    return;
  }

  const { data: preventivo, error } = await db
    .from('preventivi')
    .select('totale_imponibile,anticipo_richiesto,anticipo_tipo,anticipo_valore')
    .eq('id', preventivoId)
    .single();

  if (error || !preventivo) {
    // Senza i dati non si può chiedere l'anticipo: conferma bloccata.
    anticipoEsitoNonCaricato = true;
    toast('Dati dell\'anticipo non caricati: chiudi e riapri la finestra', 'err');
    return;
  }

  anticipoEsitoAttivo = true;
  anticipoEsitoTotale = numeroPreventivo(preventivo.totale_imponibile);
  box.style.display = '';

  if (preventivo.anticipo_richiesto === true || preventivo.anticipo_richiesto === false) {
    const scelta = document.querySelector(
      'input[name="mep-anticipo"][value="' + (preventivo.anticipo_richiesto ? 'si' : 'no') + '"]'
    );
    if (scelta) scelta.checked = true;
  }

  if (preventivo.anticipo_tipo) ge('mep-anticipo-tipo').value = preventivo.anticipo_tipo;
  if (preventivo.anticipo_valore !== null && preventivo.anticipo_valore !== undefined) {
    ge('mep-anticipo-valore').value = preventivo.anticipo_valore;
  }

  ge('mep-anticipo-totale').textContent =
    'Totale imponibile del preventivo: ' + euroPreventivo(anticipoEsitoTotale);

  aggiornaAnticipoEsitoPreventivo();
}

function sceltaAnticipoEsito() {
  const scelta = document.querySelector('input[name="mep-anticipo"]:checked');
  if (!scelta) return null;
  return scelta.value === 'si';
}

function aggiornaAnticipoEsitoPreventivo() {
  const richiesto = sceltaAnticipoEsito();

  const dettaglio = ge('mep-anticipo-dettaglio');
  if (dettaglio) dettaglio.style.display = richiesto === true ? 'grid' : 'none';

  const avviso = ge('mep-anticipo-avviso');
  if (avviso) avviso.style.display = richiesto === true ? '' : 'none';

  const calcolo = ge('mep-anticipo-calcolo');
  if (calcolo) {
    calcolo.textContent = richiesto === true
      ? testoAnticipoPreventivo(v('mep-anticipo-tipo'), v('mep-anticipo-valore'), anticipoEsitoTotale)
      : '';
  }

  aggiornaBottoneEsitoPreventivo();
}

function datiAnticipoEsitoPreventivo() {
  if (anticipoEsitoNonCaricato) {
    return { errore: 'Dati dell\'anticipo non caricati: chiudi e riapri la finestra' };
  }
  if (!anticipoEsitoAttivo) return null;

  return datiAnticipoValidi(
    sceltaAnticipoEsito(),
    v('mep-anticipo-tipo'),
    v('mep-anticipo-valore'),
    anticipoEsitoTotale,
    false
  );
}

function anticipoEsitoPronto() {
  const anticipo = datiAnticipoEsitoPreventivo();
  return !anticipo || !anticipo.errore;
}

// ---- Dashboard segreteria: "Anticipi da fatturare" -----------------------

async function loadAnticipiDaFatturare() {
  const sezione = ge('seg-anticipi-sezione');
  const box = ge('seg-anticipi-lista');
  const kpi = ge('seg-k-anticipi');
  const kpiCard = ge('seg-k-anticipi-card');

  if (!box) return;

  if (!(await verificaAnticipoPreventivoDisponibile())) {
    if (sezione) sezione.style.display = 'none';
    if (kpiCard) kpiCard.style.display = 'none';
    return;
  }

  if (sezione) sezione.style.display = '';
  if (kpiCard) kpiCard.style.display = '';

  // F4.3: fattura d'anticipo e accredito (solo con sql/25).
  const fatturaDisponibile = await verificaFatturaAnticipoDisponibile();

  const { data, error } = await db
    .from('preventivi')
    .select(`
      id,
      numero,
      stato,
      tipo,
      totale_imponibile,
      iva_perc,
      condizioni_pagamento,
      anticipo_richiesto,
      anticipo_tipo,
      anticipo_valore,
      esito_registrato_il,
      esito_registrato_da,
      allegato_accettazione_path,
      allegato_accettazione_nome,
      ${fatturaDisponibile ? COLONNE_FATTURA_ANTICIPO + ',' : ''}
      clienti(ragione_sociale, rappresentante_id)
    `)
    .eq('stato', 'in_attesa_anticipo')
    .order('esito_registrato_il', { ascending: true });

  if (error) {
    if (kpi) kpi.textContent = '—';
    box.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Errore: ' + esc(error.message) + '</div></div>';
    return;
  }

  const anticipi = data || [];
  if (kpi) kpi.textContent = anticipi.length;

  if (!anticipi.length) {
    box.innerHTML = '<div class="rap-list-card"><div class="tit-empty">✅ Nessun anticipo da fatturare o da accreditare</div></div>';
    return;
  }

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  box.innerHTML = `
    <div class="al2 w" style="margin-bottom:10px">
      Preventivi accettati dal cliente con anticipo: emetti la fattura d'anticipo,
      registrala qui, poi segna l'accredito quando l'hai verificato sul conto.
      Senza accredito il preventivo non è approvato e la commessa non parte.
      Se il cliente non versa l'anticipo usa "Rifiuta: anticipo non versato".
      Dal più vecchio.
    </div>
  ` + listaCorta(anticipi.map(function(p) {
    const importo = importoAnticipoPreventivo(p.anticipo_tipo, p.anticipo_valore, p.totale_imponibile);
    const ivaPerc = Number(p.iva_perc ?? 22);
    const accettatoIl = p.esito_registrato_il ? new Date(p.esito_registrato_il) : null;
    let giorni = null;

    if (accettatoIl) {
      const giorno = new Date(accettatoIl);
      giorno.setHours(0, 0, 0, 0);
      giorni = Math.round((oggi - giorno) / 86400000);
    }

    const rappresentante = nomeChiHaRegistratoEsito(p.clienti?.rappresentante_id);
    const chi = nomeChiHaRegistratoEsito(p.esito_registrato_da);

    return `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #EF9F27">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="min-width:0">
            <div style="font-size:14px;font-weight:700">
              Preventivo n. ${esc(String(p.numero || '—'))}
              · ${esc(p.clienti?.ragione_sociale || 'Cliente')}
            </div>
            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${esc(p.tipo || 'Preventivo')}
              ${rappresentante ? ' · Rappresentante: ' + esc(rappresentante) : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start">
            ${fatturaDisponibile ? `
              <span class="bx ${p.anticipo_fattura_numero ? 'bblue' : 'bwarn'}">
                ${p.anticipo_fattura_numero ? 'Fatturato · attende accredito' : 'Da fatturare'}
              </span>
            ` : ''}
            <span class="bx bwarn">
              ${giorni === null ? 'In attesa' : (giorni === 0 ? 'Accettato oggi' : 'Da ' + giorni + (giorni === 1 ? ' giorno' : ' giorni'))}
            </span>
          </div>
        </div>

        <div style="font-size:13px;margin-top:8px;overflow-wrap:anywhere" data-anticipo-riepilogo>
          💶 Anticipo <b>${esc(euroPreventivo(importo))} + IVA</b>
          (${esc(euroPreventivo(Math.round(importo * (100 + ivaPerc)) / 100))} con IVA ${ivaPerc}%)
          ${p.anticipo_tipo === 'percentuale' ? ' · ' + esc(testoAnticipoPreventivo(p.anticipo_tipo, p.anticipo_valore, p.totale_imponibile) || '') : ''}
          · preventivo ${esc(euroPreventivo(p.totale_imponibile))}
        </div>

        ${p.condizioni_pagamento ? `
          <div style="font-size:12px;margin-top:8px;white-space:pre-wrap">
            <span style="color:var(--m)">Modalità di pagamento:</span> ${esc(p.condizioni_pagamento)}
          </div>
        ` : ''}

        <div style="font-size:12px;color:var(--m);margin-top:8px">
          Accettato ${accettatoIl ? 'il ' + esc(dataOraEsitoPreventivo(p.esito_registrato_il)) : ''}
          ${chi ? ' · registrato da ' + esc(chi) : ''}
        </div>

        ${htmlFatturaAnticipoPreventivo(p)}

        ${p.allegato_accettazione_path ? `
          <div style="margin-top:10px">
            <button
              class="btn sm"
              onclick="apriAllegatoPreventivoFornitore('${esc(p.allegato_accettazione_path)}')"
            >
              📎 ${esc(p.allegato_accettazione_nome || 'Preventivo firmato / mail di approvazione')}
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }), 3);
}

// =====================================================================
// F4.3 — FATTURA D'ANTICIPO E ACCREDITO VERIFICATO
// Passo 6 del flusso: la segreteria (o il titolare) registra la fattura
// d'anticipo emessa (numero, data, importo) e poi l'accredito verificato
// (data; chi = l'utente collegato). Con l'accredito il preventivo diventa
// 'accettato': via libera al rappresentante. Il database lo impone
// (sql/25: registra_fattura_anticipo, registra_accredito_anticipo e
// trigger trg_preventivi_esito). La fattura non va nella tabella fatture
// (modulo Fatture in costruzione): sul preventivo resta il riferimento.
// Senza sql/25 i bottoni non compaiono.
// =====================================================================

const COLONNE_FATTURA_ANTICIPO =
  'anticipo_fattura_numero, anticipo_fattura_data, anticipo_fattura_importo, ' +
  'anticipo_fattura_registrata_da, anticipo_fattura_registrata_il, ' +
  'anticipo_accredito_data, anticipo_accredito_verificato_da, anticipo_accredito_registrato_il';

let fatturaAnticipoDisponibile = true; // riordino 17/11: SQL già in produzione, nessuna lettura di controllo
let anticipoSegreteriaTotale = 0;

// true se sql/25 è stato eseguito (esiste la colonna anticipo_fattura_numero).
async function verificaFatturaAnticipoDisponibile() {
  if (fatturaAnticipoDisponibile !== null) return fatturaAnticipoDisponibile;

  const { error } = await db
    .from('preventivi')
    .select('anticipo_fattura_numero')
    .limit(1);

  if (!error) {
    fatturaAnticipoDisponibile = true;
  } else if (/anticipo_fattura_numero|column|colonna/i.test(error.message || '')) {
    fatturaAnticipoDisponibile = false;
  } else {
    // Errore di rete o altro: non decidere ora, riprova la prossima volta.
    return false;
  }

  return fatturaAnticipoDisponibile;
}

function puoRegistrareAccreditoAnticipo() {
  return ROLE === 'segreteria' || ROLE === 'titolare';
}

// Fattura d'anticipo e accredito: riepilogo per tutti, bottoni solo per
// segreteria e titolare finché il preventivo è in attesa dell'anticipo.
function htmlFatturaAnticipoPreventivo(p) {
  if (!p || !('anticipo_fattura_numero' in p) || p.anticipo_richiesto !== true) return '';

  const fattura = !!p.anticipo_fattura_numero;
  const accredito = !!p.anticipo_accredito_data;
  const chiFattura = nomeChiHaRegistratoEsito(p.anticipo_fattura_registrata_da);
  const chiAccredito = nomeChiHaRegistratoEsito(p.anticipo_accredito_verificato_da);
  const puo = p.stato === 'in_attesa_anticipo' && puoRegistrareAccreditoAnticipo();

  // Rifiutato per anticipo non versato: resta solo il riferimento alla
  // fattura d'anticipo eventualmente registrata.
  if (p.stato === 'rifiutato') {
    if (!fattura) return '';
    return `
      <div style="margin-top:8px;font-size:12px;line-height:1.6">
        🧾 Fattura d'anticipo registrata prima del rifiuto:
        <b>n. ${esc(p.anticipo_fattura_numero)}</b> del ${esc(fd(p.anticipo_fattura_data))}
        · ${esc(euroPreventivo(p.anticipo_fattura_importo))} + IVA
        ${chiFattura ? ' · registrata da ' + esc(chiFattura) : ''}
      </div>
    `;
  }

  return `
    <div style="margin-top:8px;font-size:12px;line-height:1.6" data-anticipo-f43-testo>
      <div>
        🧾 Fattura d'anticipo:
        ${fattura
          ? '<b>n. ' + esc(p.anticipo_fattura_numero) + '</b> del ' + esc(fd(p.anticipo_fattura_data)) +
            ' · ' + esc(euroPreventivo(p.anticipo_fattura_importo)) + ' + IVA' +
            (chiFattura ? ' · registrata da ' + esc(chiFattura) : '')
          : '<b>non ancora registrata</b>'}
      </div>
      <div>
        🏦 Accredito:
        ${accredito
          ? '<b>verificato</b> · accreditato il ' + esc(fd(p.anticipo_accredito_data)) +
            (chiAccredito ? ' · verificato da ' + esc(chiAccredito) : '')
          : '<b>non ancora verificato</b>'}
      </div>
    </div>
    ${puo ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px" data-anticipo-f43-bottoni>
        <button class="btn sm${fattura ? '' : ' p'}" onclick="apriAnticipoSegreteria('${p.id}', 'fattura')">
          ${fattura ? '✏️ Correggi fattura d\'anticipo' : '🧾 Registra fattura d\'anticipo'}
        </button>
        <button
          class="btn sm${fattura ? ' p' : ''}"
          ${fattura ? '' : 'disabled title="Registra prima la fattura d\'anticipo"'}
          onclick="apriAnticipoSegreteria('${p.id}', 'accredito')"
        >
          ✅ Accredito verificato
        </button>
        <button
          class="btn sm"
          style="color:var(--r)"
          onclick="apriRifiutoAnticipoNonVersato('${p.id}')"
        >
          ❌ Rifiuta: anticipo non versato
        </button>
      </div>
    ` : ''}
  `;
}

async function apriAnticipoSegreteria(preventivoId, modo) {
  if (!puoRegistrareAccreditoAnticipo()) {
    toast('Solo la segreteria o il titolare registrano fattura d\'anticipo e accredito', 'err');
    return;
  }

  if (!(await verificaFatturaAnticipoDisponibile())) {
    toast('Funzione non ancora attiva sul database', 'err');
    return;
  }

  const { data: p, error } = await db
    .from('preventivi')
    .select(`
      id,
      numero,
      stato,
      totale_imponibile,
      iva_perc,
      anticipo_richiesto,
      anticipo_tipo,
      anticipo_valore,
      ${COLONNE_FATTURA_ANTICIPO},
      clienti(ragione_sociale)
    `)
    .eq('id', preventivoId)
    .single();

  if (error || !p) {
    toast('Preventivo non caricato: ' + (error?.message || 'non trovato'), 'err');
    return;
  }

  if (p.stato !== 'in_attesa_anticipo') {
    toast('Il preventivo non è più in attesa dell\'anticipo', 'err');
    await aggiornaDopoAnticipoSegreteria(preventivoId);
    return;
  }

  if (modo === 'accredito' && !p.anticipo_fattura_numero) {
    toast('Registra prima la fattura d\'anticipo', 'err');
    return;
  }

  const fattura = modo === 'fattura';
  const atteso = importoAnticipoPreventivo(p.anticipo_tipo, p.anticipo_valore, p.totale_imponibile);
  const oggi = dataLocaleISO();

  anticipoSegreteriaTotale = numeroPreventivo(p.totale_imponibile);

  ge('mas-preventivo-id').value = p.id;
  ge('mas-modo').value = modo;
  ge('mas-titolo').textContent = fattura
    ? (p.anticipo_fattura_numero ? '✏️ Correggi la fattura d\'anticipo' : '🧾 Fattura d\'anticipo emessa')
    : '✅ Accredito dell\'anticipo verificato';
  ge('mas-sottotitolo').textContent =
    'Preventivo n. ' + (p.numero || '—') + ' · ' + (p.clienti?.ragione_sociale || 'Cliente');

  ge('mas-riepilogo').innerHTML = fattura
    ? 'Anticipo richiesto: <b>' + esc(testoAnticipoPreventivo(p.anticipo_tipo, p.anticipo_valore, p.totale_imponibile) || '—') +
      '</b><br>Totale imponibile del preventivo: ' + esc(euroPreventivo(p.totale_imponibile))
    : 'Fattura d\'anticipo <b>n. ' + esc(p.anticipo_fattura_numero) + '</b> del ' + esc(fd(p.anticipo_fattura_data)) +
      ': <b>' + esc(euroPreventivo(p.anticipo_fattura_importo)) + '</b> + IVA ' + Number(p.iva_perc ?? 22) + '%';

  ge('mas-box-fattura').style.display = fattura ? '' : 'none';
  ge('mas-box-accredito').style.display = fattura ? 'none' : '';

  ge('mas-fattura-numero').value = p.anticipo_fattura_numero || '';
  ge('mas-fattura-data').value = p.anticipo_fattura_data || oggi;
  ge('mas-fattura-data').max = oggi;
  ge('mas-fattura-importo').value = p.anticipo_fattura_importo ?? (Math.round(atteso * 100) / 100);
  ge('mas-fattura-importo').dataset.atteso = String(Math.round(atteso * 100) / 100);

  ge('mas-accredito-data').value = oggi;
  ge('mas-accredito-data').max = oggi;
  ge('mas-accredito-conferma').checked = false;

  const bottone = ge('mas-conferma');
  bottone.textContent = fattura ? '🧾 Salva fattura d\'anticipo' : '✅ Conferma accredito';

  aggiornaBottoneAnticipoSegreteria();
  openM('m-anticipo-segreteria');
}

// Controlla i dati della finestra: restituisce { errore } oppure i dati.
function datiAnticipoSegreteria() {
  const oggi = dataLocaleISO();

  if (v('mas-modo') === 'fattura') {
    const numero = v('mas-fattura-numero').trim();
    const data = v('mas-fattura-data');
    const importo = Math.round(numeroPreventivo(v('mas-fattura-importo')) * 100) / 100;

    if (!numero) return { errore: 'Indica il numero della fattura d\'anticipo' };
    if (!data) return { errore: 'Indica la data della fattura' };
    if (data > oggi) return { errore: 'La data della fattura non può essere nel futuro' };
    if (!(importo > 0)) return { errore: 'Indica l\'importo fatturato (maggiore di zero)' };
    if (importo > Math.round(anticipoSegreteriaTotale * 100) / 100) {
      return { errore: 'L\'importo supera il totale imponibile del preventivo (' + euroPreventivo(anticipoSegreteriaTotale) + ')' };
    }

    return { numero: numero, data: data, importo: importo };
  }

  const dataAccredito = v('mas-accredito-data');
  if (!dataAccredito) return { errore: 'Indica la data dell\'accredito' };
  if (dataAccredito > oggi) return { errore: 'La data dell\'accredito non può essere nel futuro' };
  if (!ge('mas-accredito-conferma')?.checked) {
    return { errore: 'Conferma di aver verificato l\'accredito sul conto' };
  }

  return { dataAccredito: dataAccredito };
}

function aggiornaBottoneAnticipoSegreteria() {
  const bottone = ge('mas-conferma');
  if (!bottone) return;

  const dati = datiAnticipoSegreteria();
  bottone.disabled = !!dati.errore;

  // Avviso (non blocca) se l'importo è diverso dall'anticipo richiesto.
  const avviso = ge('mas-fattura-avviso');
  if (avviso && v('mas-modo') === 'fattura') {
    const atteso = numeroPreventivo(ge('mas-fattura-importo')?.dataset.atteso);
    const importo = numeroPreventivo(v('mas-fattura-importo'));
    avviso.textContent = dati.errore
      ? dati.errore
      : (Math.abs(importo - atteso) >= 0.01
          ? '⚠️ Diverso dall\'anticipo richiesto (' + euroPreventivo(atteso) + '): controlla prima di salvare.'
          : 'Uguale all\'anticipo richiesto.');
  }
}

async function salvaAnticipoSegreteria() {
  if (!puoRegistrareAccreditoAnticipo()) return;

  const preventivoId = v('mas-preventivo-id');
  const modo = v('mas-modo');
  const bottone = ge('mas-conferma');
  const dati = datiAnticipoSegreteria();

  if (!preventivoId) return;

  if (dati.errore) {
    toast(dati.errore, 'err');
    return;
  }

  if (modo === 'accredito' && !confirm(
    'Confermi l\'accredito dell\'anticipo? Il preventivo diventa accettato e non si torna indietro.'
  )) {
    return;
  }

  bottone.disabled = true;

  const { error } = modo === 'fattura'
    ? await db.rpc('registra_fattura_anticipo', {
        p_preventivo_id: preventivoId,
        p_numero: dati.numero,
        p_data: dati.data,
        p_importo: dati.importo
      })
    : await db.rpc('registra_accredito_anticipo', {
        p_preventivo_id: preventivoId,
        p_data_accredito: dati.dataAccredito
      });

  if (error) {
    bottone.disabled = false;
    toast((modo === 'fattura' ? 'Fattura non registrata: ' : 'Accredito non registrato: ') + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-anticipo-segreteria');
  toast(
    modo === 'fattura'
      ? 'Fattura d\'anticipo registrata. Quando l\'anticipo arriva sul conto segna "Accredito verificato"'
      : 'Accredito registrato: preventivo accettato, via libera al rappresentante' + await testoCommessaNata(preventivoId),
    'ok'
  );

  await aggiornaDopoAnticipoSegreteria(preventivoId);
}

async function aggiornaDopoAnticipoSegreteria(preventivoId) {
  if (ROLE === 'segreteria' || ge('seg-anticipi-lista')?.offsetParent) {
    await loadAnticipiDaFatturare();
  }

  if (currentPreventivoId === preventivoId && ge('pg-preventivo-detail')?.classList.contains('on')) {
    await openPreventivoDetail(preventivoId);
  }
}

// ---- Cliente che non versa l'anticipo -----------------------------------
// Decisione di Erika del 26/10: un preventivo in attesa dell'anticipo può
// essere portato a 'rifiutato' solo dalla segreteria o dal titolare, con
// un motivo obbligatorio (sql/25: rifiuta_per_anticipo_non_versato). La
// fattura d'anticipo eventualmente registrata resta salvata.

const MOTIVO_ANTICIPO_NON_VERSATO = 'Anticipo non versato';

async function apriRifiutoAnticipoNonVersato(preventivoId) {
  if (!puoRegistrareAccreditoAnticipo()) {
    toast('Solo la segreteria o il titolare possono rifiutare per anticipo non versato', 'err');
    return;
  }

  if (!(await verificaFatturaAnticipoDisponibile())) {
    toast('Funzione non ancora attiva sul database', 'err');
    return;
  }

  const { data: p, error } = await db
    .from('preventivi')
    .select('id, numero, stato, anticipo_fattura_numero, anticipo_fattura_data, clienti(ragione_sociale)')
    .eq('id', preventivoId)
    .single();

  if (error || !p) {
    toast('Preventivo non caricato: ' + (error?.message || 'non trovato'), 'err');
    return;
  }

  if (p.stato !== 'in_attesa_anticipo') {
    toast('Il preventivo non è più in attesa dell\'anticipo', 'err');
    await aggiornaDopoAnticipoSegreteria(preventivoId);
    return;
  }

  ge('mra-preventivo-id').value = p.id;
  ge('mra-sottotitolo').textContent =
    'Preventivo n. ' + (p.numero || '—') + ' · ' + (p.clienti?.ragione_sociale || 'Cliente');
  ge('mra-fattura').innerHTML = p.anticipo_fattura_numero
    ? 'La fattura d\'anticipo <b>n. ' + esc(p.anticipo_fattura_numero) + '</b> del ' +
      esc(fd(p.anticipo_fattura_data)) + ' resta registrata sul preventivo: ' +
      'se va annullata, serve una nota di credito (fuori dal gestionale).'
    : 'Nessuna fattura d\'anticipo registrata.';
  ge('mra-motivo').value = MOTIVO_ANTICIPO_NON_VERSATO;
  ge('mra-conferma-check').checked = false;

  aggiornaBottoneRifiutoAnticipo();
  openM('m-rifiuto-anticipo');
}

function aggiornaBottoneRifiutoAnticipo() {
  const bottone = ge('mra-conferma');
  if (!bottone) return;
  bottone.disabled = !v('mra-motivo').trim() || !ge('mra-conferma-check')?.checked;
}

async function salvaRifiutoAnticipoNonVersato() {
  if (!puoRegistrareAccreditoAnticipo()) return;

  const preventivoId = v('mra-preventivo-id');
  const motivo = v('mra-motivo').trim();
  const bottone = ge('mra-conferma');

  if (!preventivoId) return;

  if (!motivo) {
    toast('Indica il motivo del rifiuto', 'err');
    return;
  }

  if (!ge('mra-conferma-check')?.checked) {
    toast('Conferma che il cliente non ha versato l\'anticipo', 'err');
    return;
  }

  if (!confirm('Confermi il rifiuto? Il preventivo diventa rifiutato e la commessa non parte.')) {
    return;
  }

  bottone.disabled = true;

  const { error } = await db.rpc('rifiuta_per_anticipo_non_versato', {
    p_preventivo_id: preventivoId,
    p_motivo: motivo
  });

  if (error) {
    bottone.disabled = false;
    toast('Rifiuto non registrato: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-rifiuto-anticipo');
  toast('Preventivo rifiutato: anticipo non versato', 'ok');

  await aggiornaDopoAnticipoSegreteria(preventivoId);
}
