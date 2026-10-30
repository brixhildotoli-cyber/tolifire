// =====================================================================
// FILE CBI RiBa DELLA DISTINTA RIBA (per l'home banking). Caricare dopo
// 45-fatture-riba-solleciti.js e prima di 19-init.js.
//
// Nel dettaglio della distinta (finestra m-riba-dettaglio, js/45) il
// bottone "🏦 Scarica file CBI", accanto a CSV e PDF, per titolare,
// segreteria e contabile (RUOLI_RIBA). Scarica il flusso standard CBI
// "Ri.Ba." (ricevute bancarie elettroniche): file di testo, record da 120
// caratteri, ognuno chiuso da CR LF, solo ASCII (maiuscole senza accenti).
//
//   IB                 testa del flusso (una volta)
//   14 20 30 40 50 51 70   una ricevuta (sette record per ogni riga)
//   EF                 coda: numero delle ricevute, totale, numero record
//
// DA VERIFICARE CON LA BANCA AL PRIMO INVIO: le banche hanno piccole
// varianti del tracciato. I punti variabili sono nelle costanti
// CBI_RIBA_VARIANTI qui sotto (tipo di flusso nel record IB, codice
// azienda nel record 14, ecc.): si cambiano lì, senza toccare il resto.
//
// Dati usati:
//   - creditore (TOLI FIRE): Impostazioni > Dati aziendali (ragione
//     sociale, indirizzo, CAP, città, P.IVA), altrimenti i dati
//     dell'intestazione dei PDF (CBI_RIBA_AZIENDA_PREDEFINITA);
//   - codice SIA: impostazioni.codice_sia (sql/49-codice-sia). Senza
//     sql/49 il bottone c'è ma dice "Inserisci il codice SIA in
//     Impostazioni (serve aggiornare il database)";
//   - banca assuntrice (ABI, CAB, conto): dall'IBAN di accredito della
//     distinta, altrimenti dall'IBAN dell'azienda (Impostazioni, sql/47);
//   - debitore: la riga della distinta (riba_righe), che copia lo snapshot
//     della fattura emessa e ABI/CAB della banca del cliente (sql/47); la
//     sigla della provincia dalla scheda cliente, se leggibile;
//   - ricevuta: importo e scadenza della rata, numero e data della fattura.
// Se manca un dato obbligatorio il file NON si genera: il riquadro rosso
// della finestra elenca cosa manca.
// =====================================================================

// ── Punti variabili da concordare con la banca ───────────────────────────
// Lasciati come da tracciato standard CBI. Se la banca chiede una variante
// si cambia qui (le posizioni sono quelle dei commenti dei record).
const CBI_RIBA_VARIANTI = {
  // Record IB, pos. 105: "tipo flusso". Standard: spazio. Alcune banche
  // vogliono '1'.
  tipoFlussoIB: ' ',
  // Record IB, pos. 106: "qualificatore flusso". Standard: spazio. Alcune
  // banche vogliono '$'.
  qualificatoreFlussoIB: ' ',
  // Record IB, pos. 107-111: "soggetto veicolare" (ABI di 5 cifre). Standard:
  // spazi. Lo chiedono solo alcune banche.
  soggettoVeicolareIB: '     ',
  // Record 14, pos. 92-96: "codice azienda". Vuoto = codice SIA
  // dell'azienda (standard). Alcune banche assegnano un codice diverso:
  // scriverlo qui (5 caratteri).
  codiceAzienda14: '',
  // Record 14, pos. 97: "tipo codice" del codice cliente. Standard: '4'.
  tipoCodice14: '4',
  // Record 14, pos. 29-33: causale. Standard RiBa: '30000'.
  causale14: '30000',
  // Record IB, 14, EF: codice divisa. 'E' = euro.
  divisa: 'E',
  // Record 14, pos. 98-113: codice del cliente debitore (16). Standard:
  // codice con cui il creditore conosce il cliente; qui la sua P.IVA, o
  // il codice fiscale se manca.
  codiceClienteDa: 'piva',
  // Estensione del file scaricato ('.txt' o '.cbi').
  estensione: '.txt'
};

// Creditore se in Impostazioni mancano i dati aziendali (come
// l'intestazione dei PDF, js/45 intestazionePdfToliFire).
const CBI_RIBA_AZIENDA_PREDEFINITA = {
  ragione_sociale: 'TOLI FIRE',
  indirizzo: 'Via Bellatalla 62, Ospedaletto',
  cap: '56121',
  citta: 'Pisa',
  piva: '02490980501'
};

// ── Testo e numeri nel formato CBI ───────────────────────────────────────
// Maiuscolo, senza accenti (à → A), solo A-Z 0-9 spazio . , ' - / ( ) + :
// (gli altri caratteri diventano spazi; & → E). Spazi doppi tolti.
function testoCbi(s) {
  return String(s === null || s === undefined ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'").replace(/&/g, 'E').replace(/€/g, 'EUR')
    .toUpperCase()
    .replace(/[^A-Z0-9 .,'\-\/()+:]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Campo alfanumerico: allineato a sinistra, completato con spazi, tagliato
// alla lunghezza.
function alfaCbi(s, lunghezza) {
  return testoCbi(s).slice(0, lunghezza).padEnd(lunghezza, ' ');
}

// Campo numerico: allineato a destra, completato con zeri. Un numero più
// lungo del campo è un errore (non si taglia mai una cifra).
function numCbi(n, lunghezza) {
  const t = String(n === null || n === undefined ? '' : n).replace(/\D/g, '');
  if (t.length > lunghezza) throw new Error('Numero ' + t + ' troppo lungo per un campo di ' + lunghezza + ' cifre');
  return t.padStart(lunghezza, '0');
}

// Data AAAA-MM-GG (o Date) → GGMMAA.
function dataCbi(d) {
  const iso = d instanceof Date ? dataLocaleISO(d) : String(d || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error('Data non valida: ' + d);
  return m[3] + m[2] + m[1].slice(2);
}

function centesimiCbi(importo) {
  return Math.round(Number(importo) * 100);
}

// Record finito: esattamente 120 caratteri (controllo di sicurezza).
function recordCbi(parti, tipo) {
  const r = parti.join('');
  if (r.length !== 120) throw new Error('Record ' + tipo + ' lungo ' + r.length + ' invece di 120');
  if (!/^[\x20-\x7E]*$/.test(r)) throw new Error('Record ' + tipo + ' con caratteri non ASCII');
  return r;
}

// Sigla della provincia: dalla scheda cliente, altrimenti "Città (PI)".
function provinciaCbi(cliente, citta) {
  const p = testoCbi(cliente && (cliente.provincia_fattura || cliente.provincia));
  if (/^[A-Z]{2}$/.test(p)) return p;
  const m = /\(([A-Za-z]{2})\)\s*$/.exec(String(citta || ''));
  return m ? m[1].toUpperCase() : '';
}

function cittaSenzaProvinciaCbi(citta) {
  return String(citta || '').replace(/\s*\([A-Za-z]{2}\)\s*$/, '');
}

// ── Composizione del flusso ──────────────────────────────────────────────
// dati = { sia, abiAssuntrice, cabAssuntrice, conto, dataCreazione (Date),
//   nomeSupporto, azienda {ragione_sociale, indirizzo, cap, citta, piva},
//   ricevute: [{ numeroRicevuta, scadenza, centesimi, abi, cab, codiceCliente,
//     debitore, debitoreCf, indirizzo, cap, citta, provincia, bancaDebitore,
//     riferimento1, riferimento2 }] }
// Restituisce le righe (senza CR LF).
function componiFlussoCbiRiba(dati) {
  const V = CBI_RIBA_VARIANTI;
  const sia = dati.sia;
  const dataCreazione = dataCbi(dati.dataCreazione);
  const codiceAzienda = V.codiceAzienda14 ? V.codiceAzienda14 : sia;
  const az = dati.azienda;
  // "Via Bellatalla 62, Ospedaletto": la via nel 2° segmento, la frazione
  // davanti a CAP e città nel 3° (se ci sta), così nulla resta tagliato.
  const parti = String(az.indirizzo || '').split(',');
  const frazione = parti.length > 1 ? parti.slice(1).join(',').trim() : '';
  const capCitta = [az.cap, az.citta].filter(Boolean).join(' ');
  const indirizzoCreditore = {
    via: testoCbi(az.indirizzo).length > 24 && frazione ? parti[0] : az.indirizzo,
    localita: testoCbi(az.indirizzo).length > 24 && frazione && testoCbi(frazione + ' ' + capCitta).length <= 24
      ? frazione + ' ' + capCitta : capCitta
  };
  const righe = [];
  let totale = 0;

  // RECORD IB — testa del flusso
  //   pos.   1       filler (spazio)
  //   pos.   2-3     tipo record 'IB'
  //   pos.   4-8     mittente: codice SIA dell'azienda (5)
  //   pos.   9-13    ricevente: ABI della banca assuntrice (5)
  //   pos.  14-19    data di creazione GGMMAA (6)
  //   pos.  20-39    nome del supporto (20, univoco per mittente e data)
  //   pos.  40-45    campo a disposizione (6, spazi)
  //   pos.  46-104   filler (59, spazi)
  //   pos. 105       tipo flusso (variante, standard spazio)
  //   pos. 106       qualificatore flusso (variante, standard spazio)
  //   pos. 107-111   soggetto veicolare (variante, standard spazi)
  //   pos. 112-113   filler (2, spazi)
  //   pos. 114       codice divisa 'E'
  //   pos. 115-120   filler (6, spazi)
  righe.push(recordCbi([' ', 'IB', alfaCbi(sia, 5), numCbi(dati.abiAssuntrice, 5), dataCreazione,
    alfaCbi(dati.nomeSupporto, 20), ' '.repeat(6), ' '.repeat(59),
    alfaCbi(V.tipoFlussoIB, 1), String(V.qualificatoreFlussoIB || ' ').slice(0, 1).padEnd(1, ' '),
    alfaCbi(V.soggettoVeicolareIB, 5), ' '.repeat(2),
    V.divisa, ' '.repeat(6)], 'IB'));

  dati.ricevute.forEach(function(x, i) {
    const prog = numCbi(i + 1, 7);   // numero progressivo della ricevuta nel flusso
    totale += x.centesimi;

    // RECORD 14 — disposizione
    //   pos.   1       filler
    //   pos.   2-3     tipo record '14'
    //   pos.   4-10    numero progressivo (7)
    //   pos.  11-22    filler (12)
    //   pos.  23-28    data di scadenza GGMMAA (6)
    //   pos.  29-33    causale '30000' (5)
    //   pos.  34-46    importo in centesimi (13)
    //   pos.  47       segno '-'
    //   pos.  48-52    ABI della banca assuntrice (5)
    //   pos.  53-57    CAB della banca assuntrice (5)
    //   pos.  58-69    conto del creditore (12, dall'IBAN)
    //   pos.  70-74    ABI della banca domiciliataria (debitore) (5)
    //   pos.  75-79    CAB della banca domiciliataria (debitore) (5)
    //   pos.  80-91    filler (12)
    //   pos.  92-96    codice azienda (5, standard = codice SIA)
    //   pos.  97       tipo codice '4'
    //   pos.  98-113   codice cliente debitore (16)
    //   pos. 114-119   filler (6)
    //   pos. 120       codice divisa 'E'
    righe.push(recordCbi([' ', '14', prog, ' '.repeat(12), dataCbi(x.scadenza), numCbi(V.causale14, 5),
      numCbi(x.centesimi, 13), '-', numCbi(dati.abiAssuntrice, 5), numCbi(dati.cabAssuntrice, 5),
      alfaCbi(dati.conto, 12), numCbi(x.abi, 5), numCbi(x.cab, 5), ' '.repeat(12),
      alfaCbi(codiceAzienda, 5), alfaCbi(V.tipoCodice14, 1), alfaCbi(x.codiceCliente, 16),
      ' '.repeat(6), V.divisa], '14'));

    // RECORD 20 — creditore (4 segmenti da 24)
    //   pos.   4-10    numero progressivo (7)
    //   pos.  11-34    1° segmento: ragione sociale (24)
    //   pos.  35-58    2° segmento: indirizzo (24)
    //   pos.  59-82    3° segmento: (frazione) CAP e città (24)
    //   pos.  83-106   4° segmento: partita IVA (24)
    //   pos. 107-120   filler (14)
    righe.push(recordCbi([' ', '20', prog, alfaCbi(az.ragione_sociale, 24), alfaCbi(indirizzoCreditore.via, 24),
      alfaCbi(indirizzoCreditore.localita, 24), alfaCbi(az.piva ? 'P.IVA ' + az.piva : '', 24),
      ' '.repeat(14)], '20'));

    // RECORD 30 — debitore
    //   pos.   4-10    numero progressivo (7)
    //   pos.  11-40    1° segmento: ragione sociale del debitore (30)
    //   pos.  41-70    2° segmento: seguito della ragione sociale (30)
    //   pos.  71-86    codice fiscale o partita IVA del debitore (16)
    //   pos.  87-120   filler (34)
    const nome = testoCbi(x.debitore);
    righe.push(recordCbi([' ', '30', prog, alfaCbi(nome.slice(0, 30), 30), alfaCbi(nome.slice(30, 60), 30),
      alfaCbi(x.debitoreCf, 16), ' '.repeat(34)], '30'));

    // RECORD 40 — indirizzo del debitore
    //   pos.   4-10    numero progressivo (7)
    //   pos.  11-40    via e numero civico (30)
    //   pos.  41-45    CAP (5)
    //   pos.  46-67    comune (22)
    //   pos.  68       filler (1)
    //   pos.  69-70    sigla della provincia (2)
    //   pos.  71-120   banca/sportello domiciliataria, descrizione (50)
    righe.push(recordCbi([' ', '40', prog, alfaCbi(x.indirizzo, 30),
      /^\d{5}$/.test(String(x.cap || '')) ? String(x.cap) : alfaCbi(x.cap, 5),
      alfaCbi(x.citta, 22), ' ', alfaCbi(x.provincia, 2), alfaCbi(x.bancaDebitore, 50)], '40'));

    // RECORD 50 — riferimenti del debito
    //   pos.   4-10    numero progressivo (7)
    //   pos.  11-50    1° segmento: numero e data della fattura (40)
    //   pos.  51-90    2° segmento: rata e importo (40)
    //   pos.  91-100   filler (10)
    //   pos. 101-116   codice fiscale / P.IVA del creditore (16)
    //   pos. 117-120   filler (4)
    righe.push(recordCbi([' ', '50', prog, alfaCbi(x.riferimento1, 40), alfaCbi(x.riferimento2, 40),
      ' '.repeat(10), alfaCbi(az.piva, 16), ' '.repeat(4)], '50'));

    // RECORD 51 — numero della ricevuta
    //   pos.   4-10    numero progressivo (7)
    //   pos.  11-20    numero della ricevuta dato dal creditore (10)
    //   pos.  21-40    denominazione del creditore (20)
    //   pos.  41-55    provincia dell'intendenza di finanza (bollo virtuale, 15, spazi)
    //   pos.  56-65    numero di autorizzazione bollo (10, spazi)
    //   pos.  66-71    data di autorizzazione bollo (6, spazi)
    //   pos.  72-120   filler (49)
    righe.push(recordCbi([' ', '51', prog, numCbi(x.numeroRicevuta, 10), alfaCbi(az.ragione_sociale, 20),
      ' '.repeat(15), ' '.repeat(10), ' '.repeat(6), ' '.repeat(49)], '51'));

    // RECORD 70 — chiusura della ricevuta
    //   pos.   4-10    numero progressivo (7)
    //   pos.  11-88    filler (78)
    //   pos.  89-100   indicatori di circuito (12, spazi)
    //   pos. 101-120   filler / chiavi di controllo (20, spazi)
    righe.push(recordCbi([' ', '70', prog, ' '.repeat(78), ' '.repeat(12), ' '.repeat(20)], '70'));
  });

  // RECORD EF — coda del flusso
  //   pos.   1       filler
  //   pos.   2-3     tipo record 'EF'
  //   pos.   4-8     mittente: codice SIA (5, come IB)
  //   pos.   9-13    ricevente: ABI banca assuntrice (5, come IB)
  //   pos.  14-19    data di creazione GGMMAA (come IB)
  //   pos.  20-39    nome del supporto (20, come IB)
  //   pos.  40-45    campo a disposizione (6)
  //   pos.  46-52    numero delle disposizioni (ricevute) (7)
  //   pos.  53-67    totale importi negativi in centesimi (15): le RiBa
  //   pos.  68-82    totale importi positivi in centesimi (15): zeri
  //   pos.  83-89    numero dei record del flusso, IB ed EF compresi (7)
  //   pos.  90-113   filler (24)
  //   pos. 114       codice divisa 'E'
  //   pos. 115-120   filler (6)
  const numeroRecord = righe.length + 1;
  righe.push(recordCbi([' ', 'EF', alfaCbi(sia, 5), numCbi(dati.abiAssuntrice, 5), dataCreazione,
    alfaCbi(dati.nomeSupporto, 20), ' '.repeat(6), numCbi(dati.ricevute.length, 7), numCbi(totale, 15),
    numCbi(0, 15), numCbi(numeroRecord, 7), ' '.repeat(24), V.divisa, ' '.repeat(6)], 'EF'));
  return righe;
}

// ── Dati dalla distinta e controlli ──────────────────────────────────────
// Restituisce { errore } (sql/49 mancante), { mancanti: [...] } oppure
// { dati, nomeFile }.
async function preparaDatiCbiRiba(d) {
  const ri = await db.from('impostazioni').select('*').eq('id', 1).maybeSingle();
  if (ri.error) return { errore: 'Impostazioni non lette: ' + ri.error.message };
  const imp = ri.data || {};
  if (!Object.prototype.hasOwnProperty.call(imp, 'codice_sia')) {
    return { errore: 'Inserisci il codice SIA in Impostazioni (serve aggiornare il database)' };
  }
  const mancanti = [];
  const sia = String(imp.codice_sia || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(sia)) mancanti.push('Codice SIA dell\'azienda: lo inserisce il titolare in Impostazioni > Dati aziendali (5 caratteri, lo dà la banca)');

  const iban = ibanPulito(d.p.iban_appoggio || imp.iban_azienda || '');
  let banca = null;
  if (!iban) mancanti.push('IBAN dell\'azienda: indicalo nella distinta o in Impostazioni > Dati aziendali (titolare)');
  else if (!/^IT[0-9]{2}[A-Z][0-9]{10}[0-9A-Z]{12}$/.test(iban)) mancanti.push('IBAN di accredito ' + iban + ': serve un IBAN italiano (IT, 27 caratteri) per ricavare ABI, CAB e conto');
  else banca = { abi: iban.slice(5, 10), cab: iban.slice(10, 15), conto: iban.slice(15, 27) };

  const azienda = {};
  Object.keys(CBI_RIBA_AZIENDA_PREDEFINITA).forEach(function(k) {
    azienda[k] = (imp[k] && String(imp[k]).trim()) || CBI_RIBA_AZIENDA_PREDEFINITA[k];
  });

  // Provincia dalla scheda del cliente (se il ruolo la può leggere).
  const clienti = {};
  const ids = Array.from(new Set(d.righe.map(function(x) { return x.cliente_id; }).filter(Boolean)));
  if (ids.length) {
    const rc = await db.from('clienti').select('id,provincia,provincia_fattura').in('id', ids);
    (rc.data || []).forEach(function(c) { clienti[c.id] = c; });
  }

  const righe = righeDistintaPerFile() || [];
  if (!righe.length) mancanti.push('La distinta non ha ricevute');
  const anno = Number(d.p.anno) || Number(String(d.p.numero || '').slice(0, 4)) || new Date().getFullYear();
  const progDistinta = Number(d.p.progressivo) || Number(String(d.p.numero || '').split('/')[1]) || 0;
  const ricevute = righe.map(function(x, i) {
    const chi = (x.debitore || 'riga ' + (i + 1)) + (x.fattura_numero ? ' (fattura ' + x.fattura_numero + ')' : '');
    if (!/^[0-9]{5}$/.test(String(x.abi || '')) || !/^[0-9]{5}$/.test(String(x.cab || ''))) mancanti.push('ABI e CAB della banca del cliente: ' + chi);
    const cf = String(x.debitore_piva || x.debitore_codice_fiscale || '').replace(/\s/g, '');
    if (!cf) mancanti.push('Partita IVA o codice fiscale del cliente: ' + chi);
    if (!testoCbi(x.debitore)) mancanti.push('Ragione sociale del cliente: riga ' + (i + 1));
    if (!(Number(x.importo) > 0)) mancanti.push('Importo della rata: ' + chi);
    if (!x.data_scadenza) mancanti.push('Scadenza della rata: ' + chi);
    const codiceCliente = CBI_RIBA_VARIANTI.codiceClienteDa === 'piva'
      ? (x.debitore_piva || x.debitore_codice_fiscale || '') : (x.debitore_codice_fiscale || x.debitore_piva || '');
    return {
      // numero ricevuta: anno (2) + numero distinta (4) + riga (4), univoco
      numeroRicevuta: String(anno % 100).padStart(2, '0') + String(progDistinta % 10000).padStart(4, '0') + String(i + 1).padStart(4, '0'),
      scadenza: x.data_scadenza,
      centesimi: centesimiCbi(x.importo),
      abi: x.abi, cab: x.cab,
      codiceCliente: codiceCliente,
      debitore: x.debitore,
      debitoreCf: cf,
      indirizzo: x.debitore_indirizzo || '',
      cap: x.debitore_cap || '',
      citta: cittaSenzaProvinciaCbi(x.debitore_citta),
      provincia: provinciaCbi(clienti[x.cliente_id], x.debitore_citta),
      bancaDebitore: x.banca_debitore || '',
      riferimento1: 'FATTURA N. ' + (x.fattura_numero || '') + (x.fattura_data ? ' DEL ' + fd(x.fattura_data) : ''),
      riferimento2: 'RATA ' + x.numero_rata + ' EUR ' + Number(x.importo).toFixed(2).replace('.', ',')
    };
  });
  if (mancanti.length) return { mancanti: Array.from(new Set(mancanti)) };

  const adesso = new Date();
  const ora = String(adesso.getHours()).padStart(2, '0') + String(adesso.getMinutes()).padStart(2, '0') + String(adesso.getSeconds()).padStart(2, '0');
  return {
    dati: {
      sia: sia, abiAssuntrice: banca.abi, cabAssuntrice: banca.cab, conto: banca.conto,
      dataCreazione: adesso,
      // nome del supporto: RIBA + anno + numero distinta + ora (univoco nel giorno)
      nomeSupporto: 'RIBA' + anno + String(progDistinta).padStart(3, '0') + ora,
      azienda: azienda, ricevute: ricevute
    },
    nomeFile: 'Distinta_RIBA_' + String(d.p.numero).replace(/[^0-9A-Za-z]+/g, '-') + '_CBI' + CBI_RIBA_VARIANTI.estensione
  };
}

// ── Bottone "🏦 Scarica file CBI" ────────────────────────────────────────
async function scaricaCbiDistintaRiba() {
  const d = dettaglioDistinta;
  if (!d) return;
  const box = ge('mrv-errore');
  if (box) box.style.display = 'none';
  if (!puoRiba()) { toast('Il file CBI lo scaricano segreteria, contabile o titolare', 'err'); return; }
  let pronto;
  try {
    pronto = await preparaDatiCbiRiba(d);
  } catch (e) { toast('File CBI non preparato: ' + e.message, 'err'); return; }
  if (pronto.errore) { toast(pronto.errore, 'err'); return; }
  if (pronto.mancanti) {
    if (box) {
      box.innerHTML = '<b>File CBI non generato: mancano questi dati</b><ul style="margin:6px 0 0 18px;padding:0">' +
        pronto.mancanti.map(function(m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
      box.style.display = '';
      box.scrollIntoView({ block: 'nearest' });
    }
    toast('File CBI non generato: ' + (pronto.mancanti.length === 1 ? 'manca 1 dato' : 'mancano ' + pronto.mancanti.length + ' dati'), 'err');
    return;
  }
  let righe;
  try {
    righe = componiFlussoCbiRiba(pronto.dati);
  } catch (e) { toast('File CBI non generato: ' + e.message, 'err'); return; }
  const blob = new Blob([righe.join('\r\n') + '\r\n'], { type: 'text/plain;charset=us-ascii' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = pronto.nomeFile;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('File CBI scaricato (' + pronto.dati.ricevute.length + (pronto.dati.ricevute.length === 1 ? ' ricevuta' : ' ricevute') + '). Da verificare con la banca al primo invio', 'ok');
}
