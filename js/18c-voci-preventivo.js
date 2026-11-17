// js/18c-voci-preventivo.js — editor delle voci del preventivo (importi, sconto, unità di misura).
// Riordino del 17/11: era una parte di js/18-preventivi.js (righe 4723-5490),
// spostata così com'era. Si carica subito dopo il pezzo precedente (index.html).

let vociPreventivoDati = [];
let notePreventivoCliente = '';
let condizioniPagamentoPreventivo = '';
// sql/264: "Oggetto" e nota prima della tabella dei prezzi (facoltativi;
// senza sql/264 il riquadro non compare e non si mandano).
let oggettoPreventivoEditor = '';
let notaIntroPreventivoEditor = '';
let oggettoNotaEditorDisponibile = false;
// sql/264 (computo): file del computo dell'ingegnere nell'editor (solo con
// le colonne computo_path e computo_nome). commercialeId e stato servono a
// sapere se chi guarda lo può caricare o togliere.
let computoEditorPreventivo = { disponibile: false, path: null, nome: null, commercialeId: null, stato: null };
// sql/265: "Quantità x UM" delle voci (testo libero) nell'editor.
let quantitaUmEditorDisponibile = false;
// F4.2: dati dell'anticipo nell'editor (solo con sql/24 eseguito).
let anticipoPreventivoEditor = {
  disponibile: false,
  bloccato: false,
  richiesto: null,
  tipo: 'percentuale',
  valore: ''
};
// F4.3: dopo l'esito del cliente (in attesa anticipo, accettato,
// rifiutato) voci e totale non si cambiano, tranne che per il titolare.
let esitoRegistratoEditorPreventivo = false;
let vociPreventivoBloccate = false;
let storicoUndoPreventivo = [];
let vociEliminatePreventivo = [];
let chiaveModificaPreventivo = '';
let timerModificaPreventivo = null;
// sql/258: sconto del rappresentante sul preventivo aperto nell'editor
// (preventivi.sconto_perc; 0 = nessuno). Serve al margine con lo sconto e,
// senza sql/258 (dopo il suo rollback), a scrivere il totale già scontato.
let scontoPreventivoEditor = 0;

// true se nell'editor delle voci ci sono modifiche non ancora salvate
// (ogni modifica lascia un punto di "Annulla"; il ricaricamento li azzera).
function modificheVociNonSalvatePreventivo() {
  return storicoUndoPreventivo.length > 0 || vociEliminatePreventivo.length > 0;
}

function registraStatoUndoPreventivo(chiave) {
  clearTimeout(timerModificaPreventivo);

  timerModificaPreventivo = setTimeout(function() {
    chiaveModificaPreventivo = '';
  }, 800);

  // Durante la stessa digitazione salva un solo punto di annullamento.
  if (chiave && chiave === chiaveModificaPreventivo) return;

  storicoUndoPreventivo.push({
    voci: JSON.parse(JSON.stringify(vociPreventivoDati)),
    eliminate: [...vociEliminatePreventivo]
  });

  if (storicoUndoPreventivo.length > 50) {
    storicoUndoPreventivo.shift();
  }

  chiaveModificaPreventivo = chiave || '';
}

function annullaUltimaModificaPreventivo() {
  const statoPrecedente = storicoUndoPreventivo.pop();

  if (!statoPrecedente) {
    toast('Non ci sono modifiche da annullare', 'err');
    return;
  }

  vociPreventivoDati = statoPrecedente.voci;
  vociEliminatePreventivo = statoPrecedente.eliminate;
  chiaveModificaPreventivo = '';

  disegnaVociPreventivo();
  toast('Ultima modifica annullata', 'ok');
}

document.addEventListener('keydown', function(evento) {
  const undo = (evento.metaKey || evento.ctrlKey) &&
    !evento.shiftKey &&
    evento.key.toLowerCase() === 'z';

  if (!undo) return;

  const box = ge('pvd-costi-content');

  // Funziona solo nella pagina Preventivo Cliente.
  if (!box || !box.contains(evento.target)) return;

  // Nei campi note resta attivo l'annulla nativo del browser.
  if (
    evento.target.id === 'pvv-note-cliente' ||
    evento.target.id === 'pvv-condizioni-pagamento'
  ) return;

  evento.preventDefault();
  annullaUltimaModificaPreventivo();
});

function numeroPreventivo(valore) {
  const numero = Number(valore);
  return Number.isFinite(numero) ? numero : 0;
}

// Importi delle voci scritti con la virgola (richiesta di Erika del 30/10):
// campi di testo, quindi niente frecce né rotellina che cambiano il
// numero; il punto digitato diventa virgola; si incollano anche importi
// presi da Excel, PDF o mail ("1.234,56", "1234.56", "€ 12,50").
function leggiImportoPreventivo(testo) {
  let s = String(testo == null ? '' : testo).replace(/[\s\u00a0€]/g, '');
  if (!s) return 0;
  const virgola = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  if (virgola >= 0 && punto >= 0) {
    // Il separatore dei decimali è l'ultimo dei due, l'altro sono le migliaia.
    s = virgola > punto
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (virgola >= 0) {
    s = s.replace(/,(?=.*,)/g, '').replace(',', '.');
  } else if (punto >= 0 && (/\..*\./.test(s) || /^-?[1-9]\d{0,2}\.\d{3}$/.test(s))) {
    // "1.500" o "1.250.000": punti delle migliaia, come si scrive in Italia.
    s = s.replace(/\./g, '');
  }
  const numero = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(numero) ? numero : 0;
}

function importoConVirgolaPreventivo(valore, decimaliMinimi) {
  const numero = numeroPreventivo(valore);
  return numero.toLocaleString('it-IT', {
    useGrouping: false,
    minimumFractionDigits: decimaliMinimi || 0,
    maximumFractionDigits: 4
  });
}

function virgolaCampoImportoPreventivo(campo) {
  if (campo.value.indexOf('.') < 0) return;
  const posizione = campo.selectionStart;
  campo.value = campo.value.replace(/\./g, ',');
  try { campo.setSelectionRange(posizione, posizione); } catch (e) {}
}

function incollaImportoPreventivo(evento, campo) {
  const testo = (evento.clipboardData || window.clipboardData).getData('text');
  if (!testo) return;
  evento.preventDefault();
  campo.value = importoConVirgolaPreventivo(leggiImportoPreventivo(testo));
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

function euroPreventivo(valore) {
  return numeroPreventivo(valore).toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR'
  });
}

function irHtmlPreventivo(etichetta, contenuto) {
  return `
    <div style="padding:8px;background:var(--bg);border-radius:var(--rs)">
      <div style="font-size:11px;color:var(--m);margin-bottom:2px">
        ${esc(etichetta)}
      </div>
      <div style="font-size:13px;font-weight:500">
        ${contenuto}
      </div>
    </div>
  `;
}

// sql/258: stessa formula del database, in centesimi interi (niente errori
// dei numeri con la virgola): round(round(base, 2) * (100 - sconto) / 100, 2).
function importoScontatoPreventivo(base, sconto) {
  const b = Number(base || 0);
  const s = Number(sconto || 0);
  if (!(s > 0 && s < 100)) return Math.round(b * 100) / 100;
  const centesimi = Math.round(b * 100);
  const s100 = Math.round(s * 100);
  const prodotto = centesimi * (10000 - s100);
  const arrotondato = prodotto >= 0
    ? Math.floor((prodotto + 5000) / 10000)
    : -Math.floor((-prodotto + 5000) / 10000);
  return arrotondato / 100;
}

// Totale da scrivere in preventivi.totale_imponibile salvando le voci: con
// sql/258 la somma delle voci (il database rimette lo sconto); senza sql/258
// ma con uno sconto rimasto dopo il suo rollback, il totale già scontato
// (così totale e PDF restano uguali).
async function totaleDaScrivereConSconto(sommaVoci, sconto) {
  if (!(Number(sconto) > 0)) return sommaVoci;
  let conSql = false;
  try {
    conSql = typeof verificaScontoRappresentanteDisponibile === 'function' &&
      await verificaScontoRappresentanteDisponibile();
  } catch (e) { conSql = false; }
  return conSql ? sommaVoci : importoScontatoPreventivo(sommaVoci, sconto);
}

// Riga "con lo sconto" sotto i margini dell'editor (vuota senza sconto).
function htmlMargineConScontoPreventivo(costo, vendita) {
  const s = Number(scontoPreventivoEditor || 0);
  if (!(s > 0)) return '';
  const scontato = importoScontatoPreventivo(vendita, s);
  const margine = scontato - costo;
  const perc = scontato > 0 ? (margine / scontato) * 100 : 0;
  return `🏷️ Con lo sconto del ${esc(String(s).replace('.', ','))}%: imponibile <b>${euroPreventivo(scontato)}</b>,
    margine <b>${euroPreventivo(margine)}</b> (${perc.toFixed(1)}%)`;
}

function totaleVocePreventivo(voce, tipo) {
  const quantita = numeroPreventivo(voce.quantita);

  if (tipo === 'costo') {
    return quantita * numeroPreventivo(voce.costo_unitario);
  }

  return quantita * numeroPreventivo(voce.prezzo_unitario);
}

// Unità di misura delle voci come menu (richiesta di Erika del 12/11).
// Il valore salvato resta il testo in preventivi_voci.unita_misura: i valori
// di prima che sono chiaramente la stessa unità ("mq", "m2", "corpo", "h"...)
// si MOSTRANO nella voce del menu, ma si riscrivono solo se si cambia il menu.
const UNITA_MISURA_VOCI_PREVENTIVO = ['pz', 'm²', 'ml', 'm³', 'kg', 'l', 'ore', 'giorni', 'a corpo'];
const SINONIMI_UNITA_MISURA_VOCI = {
  'pz': 'pz', 'pz.': 'pz', 'pezzo': 'pz', 'pezzi': 'pz', 'pc': 'pz', 'pcs': 'pz',
  'm²': 'm²', 'm2': 'm²', 'mq': 'm²', 'mq.': 'm²', 'm^2': 'm²', 'metri quadri': 'm²', 'metri quadrati': 'm²',
  'ml': 'ml', 'ml.': 'ml', 'm.l.': 'ml', 'metri lineari': 'ml',
  'm³': 'm³', 'm3': 'm³', 'mc': 'm³', 'mc.': 'm³', 'm^3': 'm³', 'metri cubi': 'm³',
  'kg': 'kg', 'kg.': 'kg', 'chilogrammi': 'kg',
  'l': 'l', 'l.': 'l', 'lt': 'l', 'lt.': 'l', 'litro': 'l', 'litri': 'l',
  'ore': 'ore', 'ora': 'ore', 'h': 'ore', 'h.': 'ore', 'hr': 'ore',
  'giorni': 'giorni', 'giorno': 'giorni', 'gg': 'giorni', 'gg.': 'giorni', 'g': 'giorni',
  'a corpo': 'a corpo', 'corpo': 'a corpo', 'a.c.': 'a corpo'
};

// Voce del menu per il testo salvato: '' = vuoto ("Scegli…"), null = "Altro".
function unitaMisuraMenuVoce(testo) {
  const t = String(testo == null ? '' : testo).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return '';
  return SINONIMI_UNITA_MISURA_VOCI[t] || null;
}

// Valore scelto nel menu per la voce ('', una voce del menu o 'altro').
function sceltaMenuUnitaVoce(voce) {
  if (voce._umAltro) return 'altro';
  const m = unitaMisuraMenuVoce(voce.unita_misura);
  return m === null ? 'altro' : m;
}

// "€ al m²", "€ all'ora"... accanto a costo e prezzo (il prezzo è per unità).
function etichettaEuroUnitaVoce(voce) {
  const scelta = sceltaMenuUnitaVoce(voce);
  if (scelta === 'altro') {
    const t = String(voce.unita_misura || '').trim();
    return t ? '€ per ' + t : '€';
  }
  const testi = { 'pz': '€ al pz', 'm²': '€ al m²', 'ml': '€ al ml', 'm³': '€ al m³', 'kg': '€ al kg',
    'l': '€ al litro', 'ore': '€ all’ora', 'giorni': '€ al giorno', 'a corpo': '€ a corpo' };
  return testi[scelta] || '€';
}

// Quantità bloccata a 1 con "a corpo" (solo se è davvero 1: una voce di
// prima "a corpo" con un'altra quantità resta modificabile, nulla cambia
// da solo all'apertura).
function quantitaACorpoVoce(voce) {
  return sceltaMenuUnitaVoce(voce) === 'a corpo' && numeroPreventivo(voce.quantita) === 1;
}

function mancaQuantitaVocePreventivo(voce) {
  return numeroPreventivo(voce.quantita) === 0 &&
    (numeroPreventivo(voce.costo_unitario) > 0 || numeroPreventivo(voce.prezzo_unitario) > 0);
}

function htmlUnitaMisuraVocePreventivo(voce, indice) {
  const scelta = sceltaMenuUnitaVoce(voce);
  const opzioni = ['<option value=""' + (scelta === '' ? ' selected' : '') + '>Scegli…</option>']
    .concat(UNITA_MISURA_VOCI_PREVENTIVO.map(function(u) {
      return '<option value="' + esc(u) + '"' + (scelta === u ? ' selected' : '') + '>' + esc(u) + '</option>';
    }))
    .concat(['<option value="altro"' + (scelta === 'altro' ? ' selected' : '') + '>Altro (scrivi tu)</option>']);
  return `
                  <div class="f">
                    <label>Unità di misura</label>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      <select class="pvv-um" style="flex:1 1 120px;min-width:0"
                        onchange="scegliUnitaMisuraVocePreventivo(${indice}, this.value)">
                        ${opzioni.join('')}
                      </select>
                      ${scelta === 'altro' ? `<input
                        type="text"
                        class="pvv-um-altro"
                        id="pvv-um-altro-${indice}"
                        style="flex:1 1 120px;min-width:0"
                        maxlength="20"
                        autocomplete="off"
                        value="${esc(voce.unita_misura || '')}"
                        placeholder="Scrivi l'unità"
                        oninput="scriviUnitaMisuraAltroVocePreventivo(${indice}, this.value)"
                      >` : ''}
                    </div>
                  </div>`;
}

function scegliUnitaMisuraVocePreventivo(indice, valore) {
  const voce = vociPreventivoDati[indice];
  if (!voce) return;
  registraStatoUndoPreventivo('um-' + indice + '-' + Date.now());
  if (valore === 'altro') {
    voce._umAltro = true;
    // Si parte vuoti se prima c'era una voce del menu; un testo "altro" resta.
    if (unitaMisuraMenuVoce(voce.unita_misura) !== null) voce.unita_misura = '';
  } else {
    voce._umAltro = false;
    voce.unita_misura = valore;
    if (valore === 'a corpo') voce.quantita = 1;
  }
  disegnaVociPreventivo();
  if (valore === 'altro') {
    const campo = ge('pvv-um-altro-' + indice);
    if (campo) campo.focus();
  }
}

function scriviUnitaMisuraAltroVocePreventivo(indice, valore) {
  const voce = vociPreventivoDati[indice];
  if (!voce) return;
  voce._umAltro = true;
  aggiornaCampoVocePreventivo(indice, 'unita_misura', valore);
}

function ricaricoFornituraDaCosto(costoFornitura) {
  const costo = numeroPreventivo(costoFornitura);

  if (costo <= 3000) return 70;
  if (costo <= 10000) return 45;
  if (costo <= 20000) return 35;
  if (costo <= 50000) return 30;
  if (costo <= 100000) return 25;

  return 25;
}

function costoTotaleFornituraPreventivo() {
  return vociPreventivoDati.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'costo');
  }, 0);
}

function applicaRicaricoFornitura() {
  const costoFornitura = costoTotaleFornituraPreventivo();

  if (costoFornitura <= 0) {
    toast('Inserisci prima il costo dei materiali forniti', 'err');
    return;
  }

  const percentuale = ricaricoFornituraDaCosto(costoFornitura);
  const moltiplicatore = 1 + (percentuale / 100);
registraStatoUndoPreventivo('ricarico-' + Date.now());
  vociPreventivoDati.forEach(function(voce) {
  voce.prezzo_unitario = Math.round(
      numeroPreventivo(voce.costo_unitario) * moltiplicatore * 100
    ) / 100;
  });

  disegnaVociPreventivo();

  toast(
    'Ricarico del ' + percentuale +
    '% applicato alla fornitura di ' +
    euroPreventivo(costoFornitura),
    'ok'
  );
}

function aggiornaRiepilogoVociPreventivo() {
  const costo = vociPreventivoDati.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'costo');
  }, 0);

  const vendita = vociPreventivoDati.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'vendita');
  }, 0);

  const margine = vendita - costo;
  const marginePerc = vendita > 0 ? (margine / vendita) * 100 : 0;

  const costoEl = ge('pvv-totale-costo');
  const venditaEl = ge('pvv-totale-vendita');
  const margineEl = ge('pvv-totale-margine');
  const marginePercEl = ge('pvv-totale-margine-perc');

  if (costoEl) costoEl.textContent = euroPreventivo(costo);
  if (venditaEl) venditaEl.textContent = euroPreventivo(vendita);
  if (margineEl) margineEl.textContent = euroPreventivo(margine);
  if (marginePercEl) marginePercEl.textContent = marginePerc.toFixed(1) + '%';
  const scontoEl = ge('pvv-margine-sconto');
  if (scontoEl) scontoEl.innerHTML = htmlMargineConScontoPreventivo(costo, vendita);
  // F16.48 (js/75): margine per categoria, avviso giallo sotto il 20%
  if (typeof aggiornaMargineCategoriePreventivo === 'function') aggiornaMargineCategoriePreventivo();
}

function aggiornaCampoVocePreventivo(indice, campo, valore) {
  if (!vociPreventivoDati[indice]) return;
  registraStatoUndoPreventivo('campo-' + indice + '-' + campo);

  const campiNumerici = [
    'quantita',
    'costo_unitario',
    'prezzo_unitario'
  ];

  vociPreventivoDati[indice][campo] =
    campiNumerici.includes(campo)
      ? numeroPreventivo(valore)
      : valore;

  const voce = vociPreventivoDati[indice];

  const costoRiga = ge('pvv-costo-riga-' + indice);
  const venditaRiga = ge('pvv-vendita-riga-' + indice);
  const margineRiga = ge('pvv-margine-riga-' + indice);

  const costo = totaleVocePreventivo(voce, 'costo');
  const vendita = totaleVocePreventivo(voce, 'vendita');
  const margine = vendita - costo;

  if (costoRiga) costoRiga.textContent = euroPreventivo(costo);
  if (venditaRiga) venditaRiga.textContent = euroPreventivo(vendita);
  if (margineRiga) margineRiga.textContent = euroPreventivo(margine);

  const avvisoQuantita = ge('pvv-manca-q-' + indice);
  if (avvisoQuantita) avvisoQuantita.style.display = mancaQuantitaVocePreventivo(voce) ? '' : 'none';
  const euro = etichettaEuroUnitaVoce(voce);
  ['pvv-eu-costo-', 'pvv-eu-prezzo-'].forEach(function(prefisso) {
    const el = ge(prefisso + indice);
    if (el) el.textContent = euro;
  });

  aggiornaRiepilogoVociPreventivo();
}

function disegnaVociPreventivo() {
  const box = ge('pvd-costi-content');
  if (!box) return;

  const costo = vociPreventivoDati.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'costo');
  }, 0);

  const vendita = vociPreventivoDati.reduce(function(totale, voce) {
    return totale + totaleVocePreventivo(voce, 'vendita');
  }, 0);

  const margine = vendita - costo;
  const marginePerc = vendita > 0 ? (margine / vendita) * 100 : 0;

    const costoFornitura = costoTotaleFornituraPreventivo();
  const ricaricoFornitura = costoFornitura > 0
    ? ricaricoFornituraDaCosto(costoFornitura)
    : null;


  box.innerHTML = `
    <div class="al2 i" style="margin-bottom:14px">
      Inserisci materiali, lavorazioni e servizi. I costi sono interni;
      il prezzo cliente determina imponibile e margine preliminare.
    </div>


    <div class="g2" style="margin-bottom:16px">
      ${ir('Costo totale interno', euroPreventivo(costo))}
      ${ir('Imponibile cliente', euroPreventivo(vendita))}
      ${ir('Margine preliminare', euroPreventivo(margine))}
      ${ir('Margine percentuale', marginePerc.toFixed(1) + '%')}
    </div>
    ${scontoPreventivoEditor > 0 ? `<div class="al2 w" style="margin:-6px 0 14px;font-size:13px">${htmlMargineConScontoPreventivo(costo, vendita)}</div>` : ''}

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <button class="btn sm p" onclick="aggiungiVocePreventivo()">
        + Aggiungi voce
      </button>

      <button class="btn sm" onclick="apriImportComputoCliente()" title="Excel dell'ente con codice, descrizione, unità e quantità: le righe diventano voci">
        📥 Importa computo del cliente
      </button>

      <button class="btn sm" onclick="annullaUltimaModificaPreventivo()">
  ↶ Annulla ultima modifica
</button>

      <button
  class="btn sm info"
  onclick="applicaRicaricoFornitura()"
>
  📈 Applica ricarico fornitura
  ${ricaricoFornitura !== null ? '(' + ricaricoFornitura + '%)' : ''}
</button>

    </div>

    ${
      !vociPreventivoDati.length
        ? `<div class="empty">
            Nessuna voce inserita. Aggiungi materiale, manodopera o un servizio.
          </div>`
        : vociPreventivoDati.map(function(voce, indice) {
            const costoRiga = totaleVocePreventivo(voce, 'costo');
            const venditaRiga = totaleVocePreventivo(voce, 'vendita');
            const margineRiga = venditaRiga - costoRiga;

            return `
              <div class="card" style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px">
                  <div style="font-size:14px;font-weight:700">
                    Voce ${indice + 1}
                  </div>

                  ${
                    voce.id
                      ? `<button class="btn sm" style="color:var(--r)" onclick="eliminaVocePreventivo('${voce.id}')">Elimina</button>`
                      : `<button class="btn sm" style="color:var(--r)" onclick="rimuoviNuovaVocePreventivo(${indice})">Elimina</button>`
                  }
                </div>

                <div class="fr${quantitaUmEditorDisponibile ? ' fr3' : ''}">
                  <div class="f">
                    <label>Categoria</label>
                    <select onchange="aggiornaCampoVocePreventivo(${indice}, 'categoria', this.value)">
                      <option value="materiale" ${voce.categoria === 'materiale' ? 'selected' : ''}>Materiale</option>
                      <option value="manodopera" ${voce.categoria === 'manodopera' ? 'selected' : ''}>Manodopera</option>
                      <option value="nolo" ${voce.categoria === 'nolo' ? 'selected' : ''}>Nolo</option>
                      <option value="trasporto" ${voce.categoria === 'trasporto' ? 'selected' : ''}>Trasporto</option>
                      <option value="servizio" ${voce.categoria === 'servizio' ? 'selected' : ''}>Servizio</option>
                      <option value="altro" ${voce.categoria === 'altro' ? 'selected' : ''}>Altro</option>
                    </select>
                  </div>

${htmlUnitaMisuraVocePreventivo(voce, indice)}
${htmlQuantitaUmVocePreventivo(voce, indice)}
                </div>
${typeof htmlCodiceEnteVocePreventivo === 'function' ? htmlCodiceEnteVocePreventivo(voce, indice) : ''}

                <div class="f">
                  <label>Descrizione *</label>
                  <input
                    type="text"
                    value="${esc(voce.descrizione || '')}"
                    placeholder="Es. Fornitura porta REI 120 completa di posa"
                    oninput="aggiornaCampoVocePreventivo(${indice}, 'descrizione', this.value)"
                  >
                </div>

                <div class="fr">
                  <div class="f">
                    <label>Quantità</label>
                    <input
                      type="text"
                      inputmode="decimal"
                      autocomplete="off"
                      class="pvv-quantita"
                      value="${campoNumeroVocePreventivo(voce.quantita)}"
                      ${quantitaACorpoVoce(voce) ? 'disabled' : ''}
                      oninput="virgolaCampoImportoPreventivo(this); aggiornaCampoVocePreventivo(${indice}, 'quantita', leggiImportoPreventivo(this.value))"
                      onpaste="incollaImportoPreventivo(event, this)"
                      onblur="this.value = campoNumeroVocePreventivo(leggiImportoPreventivo(this.value))"
                    >
                    ${quantitaACorpoVoce(voce) ? '<div class="pvv-nota-corpo" style="font-size:12px;color:var(--m);margin-top:4px">a corpo: il prezzo è quello di tutta la lavorazione</div>' : ''}
                  </div>

                  <div class="f">
                    <label>Costo unitario interno (<span id="pvv-eu-costo-${indice}">${esc(etichettaEuroUnitaVoce(voce))}</span>)</label>
                    <input
                      type="text"
                      inputmode="decimal"
                      autocomplete="off"
                      class="pvv-costo"
                      value="${campoNumeroVocePreventivo(voce.costo_unitario, 2)}"
                      oninput="virgolaCampoImportoPreventivo(this); aggiornaCampoVocePreventivo(${indice}, 'costo_unitario', leggiImportoPreventivo(this.value))"
                      onpaste="incollaImportoPreventivo(event, this)"
                      onblur="this.value = campoNumeroVocePreventivo(leggiImportoPreventivo(this.value), 2)"
                    >
                  </div>
                </div>

                <div class="f">
                  <label>Prezzo unitario cliente (<span id="pvv-eu-prezzo-${indice}">${esc(etichettaEuroUnitaVoce(voce))}</span>)</label>
                  <input
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    class="pvv-prezzo"
                    value="${campoNumeroVocePreventivo(voce.prezzo_unitario, 2)}"
                    oninput="virgolaCampoImportoPreventivo(this); aggiornaCampoVocePreventivo(${indice}, 'prezzo_unitario', leggiImportoPreventivo(this.value))"
                    onpaste="incollaImportoPreventivo(event, this)"
                    onblur="this.value = campoNumeroVocePreventivo(leggiImportoPreventivo(this.value), 2)"
                  >
                </div>

                <div id="pvv-manca-q-${indice}" class="pvv-manca-quantita" style="color:var(--r);font-size:13px;font-weight:600;margin:-4px 0 10px;${mancaQuantitaVocePreventivo(voce) ? '' : 'display:none'}">
                  Manca la quantità: il totale resta 0
                </div>

                <div class="g2">
                  ${irHtmlPreventivo('Costo riga', `<span id="pvv-costo-riga-${indice}">${euroPreventivo(costoRiga)}</span>`)}
                  ${irHtmlPreventivo('Totale cliente', `<span id="pvv-vendita-riga-${indice}">${euroPreventivo(venditaRiga)}</span>`)}
                  ${irHtmlPreventivo('Margine riga', `<span id="pvv-margine-riga-${indice}">${euroPreventivo(margineRiga)}</span>`)}
                  ${irHtmlPreventivo('Margine %', venditaRiga > 0 ? ((margineRiga / venditaRiga) * 100).toFixed(1) + '%' : '—')}
                </div>
              </div>
            `;
          }).join('')
    }

    <div class="card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
        <div>
          <div style="font-size:15px;font-weight:700">Totali provvisori</div>
          <div style="font-size:12px;color:var(--m);margin-top:4px">
            Il titolare potrà applicare sconti e validare l’offerta in seguito.
          </div>
        </div>

</div>

        <div style="text-align:right">
          <div style="font-size:12px;color:var(--m)">Imponibile cliente</div>
          <div id="pvv-totale-vendita" style="font-size:20px;font-weight:700">
            ${euroPreventivo(vendita)}
          </div>
        </div>
      </div>

      <div class="g2" style="margin-top:14px">
        ${irHtmlPreventivo('Costo totale interno', `<span id="pvv-totale-costo">${euroPreventivo(costo)}</span>`)}
        ${irHtmlPreventivo('Margine preliminare', `<span id="pvv-totale-margine">${euroPreventivo(margine)}</span>`)}
        ${irHtmlPreventivo('Margine percentuale', `<span id="pvv-totale-margine-perc">${marginePerc.toFixed(1)}%</span>`)}
      </div>
      <div id="pvv-margine-sconto" class="${scontoPreventivoEditor > 0 ? 'al2 w' : ''}" style="${scontoPreventivoEditor > 0 ? 'margin-top:10px;font-size:13px' : ''}">${htmlMargineConScontoPreventivo(costo, vendita)}</div>
      <div id="pvv-margine-gruppi">${typeof htmlMargineCategoriePreventivo === 'function' ? htmlMargineCategoriePreventivo(vociPreventivoDati) : ''}</div>

      <div id="pvv-bottoni-fondo" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        <button class="btn sm p" onclick="aggiungiVocePreventivo(); restaSuiBottoniFondoPreventivo()">+ Aggiungi voce</button>
        <button class="btn sm info" onclick="applicaRicaricoFornitura(); restaSuiBottoniFondoPreventivo()">
          📈 Applica ricarico fornitura ${ricaricoFornitura !== null ? '(' + ricaricoFornitura + '%)' : ''}
        </button>
      </div>

${htmlOggettoNotaEditorPreventivo()}

      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--b)">
  <div style="font-size:14px;font-weight:700;margin-bottom:5px">
    💳 Modalità di pagamento
  </div>

  <div style="font-size:12px;color:var(--m);margin-bottom:10px">
    Facoltative. Verranno riportate nel preventivo cliente.
  </div>

  <textarea
    id="pvv-condizioni-pagamento"
    rows="2"
    placeholder="Es. 50% all'ordine e saldo a fine lavori; bonifico bancario a 30 giorni..."
    oninput="condizioniPagamentoPreventivo = this.value"
  >${esc(condizioniPagamentoPreventivo)}</textarea>
</div>

${htmlAnticipoEditorPreventivo(vendita)}

      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--b)">
  <div style="font-size:14px;font-weight:700;margin-bottom:5px">
    📝 Note aggiuntive per il cliente
  </div>

  <div style="font-size:12px;color:var(--m);margin-bottom:10px">
    Facoltative. Inserisci qui condizioni, precisazioni o attività aggiuntive.
  </div>

  <textarea
    id="pvv-note-cliente"
    rows="4"
    placeholder="Es. Sono esclusi lavori edili, tempi soggetti a sopralluogo, condizioni di pagamento..."
    oninput="notePreventivoCliente = this.value"
  >${esc(notePreventivoCliente)}</textarea>
</div>


 <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px;padding-top:14px;border-top:1px solid var(--b)">
  <button
    class="btn p"
    ${vociPreventivoDati.length ? '' : 'disabled'}
    onclick="salvaVociPreventivo()"
  >
    💾 Salva preventivo
  </button>

  <button
    class="btn info"
    ${vociPreventivoDati.length ? '' : 'disabled'}
    onclick="generaPreventivoClientePDF()"
  >
    📄 Genera PDF cliente
  </button>

  <button
  class="btn warn"
  onclick="inviaPdfClienteATitolareERappresentante()"
>
  📤 Invia a titolare e rappresentante
</button>

  <button
  class="btn"
  style="color:var(--r)"
  onclick="eliminaPreventivo(currentPreventivoId)"
>
  🗑️ Elimina preventivo
</button>

    </div>
  `;

  // F4.3: dopo l'esito del cliente l'editor è in sola lettura (non per il titolare).
  if (vociPreventivoBloccate) {
    bloccaEditorVociPreventivo(box);
  } else if (esitoRegistratoEditorPreventivo) {
    box.insertAdjacentHTML('afterbegin', `
      <div class="al2 w" style="margin-bottom:14px">
        Il cliente ha già dato l'esito di questo preventivo. Come titolare puoi
        ancora cambiare voci e totale: con un anticipo in percentuale cambia anche
        l'importo da fatturare.
      </div>
    `);
  }
}

// F4.3 ---------------------------------------------------------------
function impostaBloccoVociPreventivo(stato) {
  esitoRegistratoEditorPreventivo = STATI_ESITO_PREVENTIVO.includes(stato);
  vociPreventivoBloccate = esitoRegistratoEditorPreventivo && ROLE !== 'titolare';
}

// Sola lettura: campi disattivati, resta solo "Genera PDF cliente".
function bloccaEditorVociPreventivo(box) {
  box.querySelectorAll('input, select, textarea').forEach(function(campo) {
    campo.disabled = true;
  });

  box.querySelectorAll('button').forEach(function(bottone) {
    const azione = bottone.getAttribute('onclick') || '';
    if (/generaPreventivoClientePDF/.test(azione)) return;
    bottone.style.display = 'none';
  });

  box.insertAdjacentHTML('afterbegin', `
    <div class="al2 w" style="margin-bottom:14px">
      🔒 Il cliente ha già dato l'esito di questo preventivo: voci, totale e
      condizioni non si cambiano più. Per una correzione rivolgiti al titolare.
    </div>
  `);
}
