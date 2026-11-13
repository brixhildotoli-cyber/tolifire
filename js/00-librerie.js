// Carica ogni libreria una sola volta, anche con richieste simultanee.
const librerieInCaricamento = new Map();

function caricaScriptLibreria(url, disponibile) {
  if (disponibile()) return Promise.resolve();

  if (librerieInCaricamento.has(url)) {
    return librerieInCaricamento.get(url);
  }

  const richiesta = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;

    let concluso = false;

    const timeout = setTimeout(() => {
      termina(new Error('Caricamento troppo lento. Riprova.'));
    }, 30000);

    function termina(errore) {
      if (concluso) return;
      concluso = true;

      clearTimeout(timeout);
      script.onload = script.onerror = null;

      if (errore) {
        script.remove();
        reject(errore);
      } else {
        resolve();
      }
    }

    script.onload = () => {
      termina(
        disponibile()
          ? null
          : new Error('Libreria caricata ma non disponibile.')
      );
    };

    script.onerror = () => {
      termina(new Error('Controlla la connessione e riprova.'));
    };

    document.head.appendChild(script);
  });

  librerieInCaricamento.set(url, richiesta);

  richiesta.catch(() => {
    if (librerieInCaricamento.get(url) === richiesta) {
      librerieInCaricamento.delete(url);
    }
  });

  return richiesta;
}

async function caricaLibreriePDF() {
  await caricaScriptLibreria(
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    () => !!window.jspdf?.jsPDF
  );

  await caricaScriptLibreria(
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
    () => typeof window.jspdf?.jsPDF?.API?.autoTable === 'function'
  );

  proteggiTestoPDF();
}

// Testi dei PDF (segnalazione di Erika del 02/11: "a volte cambia il font e
// taglia le parole"). I font di base di jsPDF (helvetica) conoscono solo i
// caratteri "occidentali" (WinAnsi). Se una riga contiene un carattere fuori
// elenco (≥, il trattino che inserisce Word, gli spazi stretti copiati da
// Excel o da un PDF, emoji...) jsPDF scrive TUTTA la riga in un'altra
// codifica: lettere distanziate, aspetto di un altro font, larghezze
// sbagliate e parole tagliate. Qui ogni testo che va nel PDF viene ripulito:
// i caratteri noti diventano l'equivalente (≥ → >=, trattini → -, spazi
// strani → spazio), gli altri si tolgono. Vale per tutti i PDF del sito
// (preventivi, ordini, fatture, rapporti, dichiarazioni), tabelle comprese.
const SOSTITUZIONI_TESTO_PDF = {
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2212': '-', '\u2043': '-',
  '\u2002': ' ', '\u2003': ' ', '\u2004': ' ', '\u2005': ' ', '\u2006': ' ',
  '\u2007': ' ', '\u2008': ' ', '\u2009': ' ', '\u200A': ' ', '\u202F': ' ', '\u205F': ' ', '\u3000': ' ',
  '\u00A0': ' ', '\t': ' ', '\u2028': '\n', '\u2029': '\n',
  '\u200B': '', '\u200C': '', '\u200D': '', '\u2060': '', '\uFEFF': '', '\u00AD': '',
  '\u2265': '>=', '\u2264': '<=', '\u2260': '<>', '\u2248': '~', '\u00B1': '+/-',
  '\u2192': '->', '\u2190': '<-', '\u21D2': '=>', '\u2794': '->', '\u27A1': '->',
  '\u2713': 'v', '\u2714': 'v', '\u2705': 'v', '\u2717': 'x', '\u2718': 'x', '\u274C': 'x',
  '\u2032': "'", '\u2033': '"', '\u201B': "'", '\u201F': '"', '\u2044': '/', '\u2215': '/',
  '\u2300': '\u00D8', '\u2205': '\u00D8', '\u03A9': 'Ohm', '\u2126': 'Ohm', '\u00B5': '\u00B5',
  '\u2022': '\u2022', '\u25CF': '\u2022', '\u25AA': '\u2022', '\u2023': '\u2022', '\u2219': '\u2022'
};
// Caratteri di WinAnsi fuori dal Latin-1 (€ ‚ ƒ „ … † ‡ ˆ ‰ Š ‹ Œ Ž ‘ ’ “ ” • – — ˜ ™ š › œ ž Ÿ).
const EXTRA_WINANSI_PDF = '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D' +
  '\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178';

// Anche dentro il Latin-1 ci sono caratteri che sfasano il PDF (segnalazione
// di Erika del 03/11, provata): lo spazio "fisso" di Word (U+00A0) non lascia
// andare a capo, quindi la tabella spezza le parole a metà ("c / ompleta");
// il tab di Excel sposta il testo fuori dalla colonna; l'a capo "\r" di
// Windows. Diventano spazio o a capo normali.
function pulisciTestoPDF(testo) {
  if (typeof testo !== 'string') return testo;
  if (testo.indexOf('\r') !== -1) testo = testo.replace(/\r\n?/g, '\n');
  let fuori = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo.charCodeAt(i);
    if (c === 0xA0 || c === 9 || (c > 255 && EXTRA_WINANSI_PDF.indexOf(testo[i]) === -1)) { fuori = true; break; }
  }
  if (!fuori) return testo;
  return Array.from(testo).map(function(ch) {
    if (Object.prototype.hasOwnProperty.call(SOSTITUZIONI_TESTO_PDF, ch)) return SOSTITUZIONI_TESTO_PDF[ch];
    const c = ch.codePointAt(0);
    if (c <= 255 || EXTRA_WINANSI_PDF.indexOf(ch) !== -1) return ch;
    // lettere accentate di altre lingue: la lettera senza accento (ł, ő, č...)
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (base !== ch && Array.from(base).every(function(b) { return b.codePointAt(0) <= 255; })) return base;
    return '';
  }).join('');
}

function pulisciArgomentoPDF(valore) {
  if (typeof valore === 'string') return pulisciTestoPDF(valore);
  if (Array.isArray(valore)) return valore.map(pulisciArgomentoPDF);
  return valore;
}

const METODI_TESTO_PDF = ['text', 'splitTextToSize', 'getStringUnitWidth', 'getTextWidth', 'getTextDimensions'];

function avvolgiMetodiTestoPDF(oggetto) {
  METODI_TESTO_PDF.forEach(function(nome) {
    const originale = oggetto[nome];
    if (typeof originale !== 'function' || originale._testoPulito) return;
    const avvolto = function(primo) {
      const argomenti = Array.prototype.slice.call(arguments);
      argomenti[0] = pulisciArgomentoPDF(primo);
      return originale.apply(this, argomenti);
    };
    avvolto._testoPulito = true;
    oggetto[nome] = avvolto;
  });
}

// I metodi dei plugin (autoTable, splitTextToSize...) stanno in jsPDF.API;
// "text" e altri del nucleo sono creati su ogni documento: si avvolgono
// quindi sia in jsPDF.API sia su ogni documento nuovo.
let testoPDFProtetto = false;
function proteggiTestoPDF() {
  const lib = window.jspdf;
  if (testoPDFProtetto || !lib || !lib.jsPDF) return;
  const JsPDFOriginale = lib.jsPDF;
  avvolgiMetodiTestoPDF(JsPDFOriginale.API);
  const JsPDFPulito = function() {
    const doc = new (Function.prototype.bind.apply(JsPDFOriginale, [null].concat(Array.prototype.slice.call(arguments))))();
    avvolgiMetodiTestoPDF(doc);
    return doc;
  };
  Object.keys(JsPDFOriginale).forEach(function(k) { JsPDFPulito[k] = JsPDFOriginale[k]; });
  JsPDFPulito.API = JsPDFOriginale.API;
  JsPDFPulito.prototype = JsPDFOriginale.prototype;
  lib.jsPDF = JsPDFPulito;
  testoPDFProtetto = true;
}

async function caricaLibreriaPDFLib() {
  await caricaScriptLibreria(
    'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    () => !!window.PDFLib?.PDFDocument
  );
}

// pdf.js (build UMD) per disegnare le pagine di un PDF su un canvas: serve
// al computo PDF del preventivo (js/18), caricato solo quando serve.
const PDFJS_VERSIONE = '3.11.174';
async function caricaLibreriaPdfJs() {
  const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSIONE + '/';
  await caricaScriptLibreria(base + 'pdf.min.js', () => !!window.pdfjsLib?.getDocument);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
}

function caricaLibreriaExcel() {
  return caricaScriptLibreria(
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    () => !!window.XLSX?.read
  );
}

async function preparaPDF() {
  try {
    await caricaLibreriePDF();
    return true;
  } catch (errore) {
    toast('Errore caricamento PDF: ' + errore.message, 'err');
    return false;
  }
}
// ════════════════════════════════════════════════════════════════════════
// F16.7 — MOTORE UNICO DEI PDF DA MODELLO (solo per i PDF NUOVI: POS,
// verbale di consegna, DiCo, moduli...). REGOLA DI ERIKA (13/11): i PDF di
// prima (preventivo js/18, ordine js/27, dichiarazione js/37, fatture js/45,
// schede js/71...) NON usano queste funzioni e restano identici.
// Un modulo nuovo:
//   registraModelloPdf('codice', { nome, titolo, testi: { chiave: { etichetta,
//     testo } }, sezioni: [...], leggiDati: async contesto => ({...}),
//     nomeFile: dati => '...' });
//   const esito = await generaPdfDaModello('codice', contesto, { scarica: true });
//   esito = { blob, impronta (SHA-256 del file), revisione, nomeFile, modello }
// Sezioni (in ordine): { tipo: 'campi', titolo, da: 'chiave dei dati' } =
// righe [etichetta, valore]; { tipo: 'testo', chiave } = testo fisso del
// modello (lo cambia il titolare, sql/98: modelli_pdf); { tipo: 'tabella',
// titolo, colonne: [...], da } = righe dai dati (le "query" le fa
// leggiDati); { tipo: 'allegati', titolo, da } = elenco di nomi;
// { tipo: 'firme', etichette: [...] }. I testi fissi arrivano dalla tabella
// modelli_pdf (js/72 leggiModelloPdf, con la revisione); senza sql/98 dai
// testi predefiniti del modulo ("predefinito del sito").
// ════════════════════════════════════════════════════════════════════════
const TOLI_PDF_AZIENDA = {
  nome: 'TOLI FIRE',
  indirizzo: 'Via Bellatalla 62, Ospedaletto — 56121 Pisa',
  fiscale: 'P.IVA: 02490980501 — amministrazione@toli-fire.com'
};
const MODELLI_PDF_SITO = {};

function registraModelloPdf(codice, definizione) {
  MODELLI_PDF_SITO[codice] = Object.assign({ codice: codice, sezioni: [], testi: {} }, definizione || {});
  return MODELLI_PDF_SITO[codice];
}

// Fascia verde con nome, indirizzo e P.IVA (come l'ordine di js/27 e le
// schede di js/71) e la dicitura a destra. Restituisce la y da cui scrivere.
function intestazionePdfToli(doc, opz) {
  opz = opz || {};
  const larghezza = doc.internal.pageSize.getWidth();
  const margine = opz.margine || 16;
  doc.setFillColor(8, 80, 65);
  doc.rect(0, 0, larghezza, 34, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(TOLI_PDF_AZIENDA.nome, margine, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(TOLI_PDF_AZIENDA.indirizzo, margine, 23);
  doc.text(TOLI_PDF_AZIENDA.fiscale, margine, 28);
  if (opz.dicitura) {
    doc.setFontSize(10);
    doc.text(String(opz.dicitura), larghezza - margine, 16, { align: 'right' });
  }
  if (opz.revisione) {
    doc.setFontSize(8);
    doc.text(String(opz.revisione), larghezza - margine, 23, { align: 'right' });
  }
  doc.setTextColor(25, 25, 25);
  return 46;
}

// Piè di pagina su TUTTE le pagine: modello e revisione a sinistra,
// "Pagina N di M" a destra, data di generazione al centro.
function piedePdfToli(doc, opz) {
  opz = opz || {};
  const larghezza = doc.internal.pageSize.getWidth();
  const altezza = doc.internal.pageSize.getHeight();
  const margine = opz.margine || 16;
  const pagine = doc.getNumberOfPages();
  const generato = 'Generato il ' + new Date().toLocaleDateString('it-IT');
  for (let i = 1; i <= pagine; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 200, 200);
    doc.line(margine, altezza - 14, larghezza - margine, altezza - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    if (opz.sinistra) doc.text(String(opz.sinistra), margine, altezza - 9);
    doc.text(generato, larghezza / 2, altezza - 9, { align: 'center' });
    doc.text('Pagina ' + i + ' di ' + pagine, larghezza - margine, altezza - 9, { align: 'right' });
  }
  doc.setTextColor(25, 25, 25);
}

async function improntaSha256(buffer) {
  const h = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(h)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function scaricaBlobPdf(blob, nomeFile) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 30000);
}

function nomeFilePdfPulito(testo) {
  return String(testo || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'documento';
}

// Modello pronto per il disegno: struttura del sito + titolo, testi e
// revisione della tabella (se c'è). riga = riga di modelli_pdf o null.
function unisciModelloPdf(definizione, riga) {
  const testi = {};
  Object.keys(definizione.testi || {}).forEach(function(k) {
    testi[k] = { etichetta: definizione.testi[k].etichetta || k, testo: definizione.testi[k].testo || '' };
  });
  if (riga && Array.isArray(riga.blocchi)) {
    riga.blocchi.forEach(function(b) {
      if (b && b.chiave) testi[b.chiave] = { etichetta: b.etichetta || b.chiave, testo: b.testo == null ? '' : String(b.testo) };
    });
  }
  return {
    codice: definizione.codice,
    nome: (riga && riga.nome) || definizione.nome || definizione.codice,
    titolo: (riga && riga.titolo) || definizione.titolo || definizione.nome || definizione.codice,
    testi: testi,
    revisione: riga ? riga.revisione : null,
    aggiornato_il: riga ? riga.aggiornato_il : null,
    daTabella: !!riga,
    definizione: definizione
  };
}

function testoRevisionePdf(modello) {
  return 'Modello ' + modello.codice + ' - ' + (modello.revisione ? 'rev. ' + modello.revisione : 'testi predefiniti del sito');
}

// Disegna il PDF del modello con i dati (nessuna lettura dal database).
function disegnaPdfDaModello(modello, dati) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const larghezza = doc.internal.pageSize.getWidth();
  const altezza = doc.internal.pageSize.getHeight();
  const margine = 16;
  const larghezzaTesto = larghezza - margine * 2;
  const fondo = altezza - 20;
  dati = dati || {};
  let y = intestazionePdfToli(doc, { margine: margine, dicitura: modello.nome, revisione: modello.revisione ? 'Rev. ' + modello.revisione : '' });

  function spazio(serve) {
    if (y + serve > fondo) { doc.addPage(); y = 20; }
  }
  function titoloSezione(t) {
    if (!t) return;
    spazio(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(8, 80, 65);
    doc.text(String(t), margine, y);
    doc.setTextColor(25, 25, 25);
    y += 6;
  }
  function paragrafo(testo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    String(testo).split('\n').forEach(function(capoverso) {
      const righe = doc.splitTextToSize(capoverso || ' ', larghezzaTesto);
      righe.forEach(function(r) { spazio(5); doc.text(r, margine, y); y += 5; });
    });
    y += 2;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(doc.splitTextToSize(String(modello.titolo), larghezzaTesto - 40), margine, y);
  doc.setFontSize(10);
  doc.text('Data: ' + new Date().toLocaleDateString('it-IT'), larghezza - margine, y, { align: 'right' });
  y += 10;

  (modello.definizione.sezioni || []).forEach(function(s) {
    if (s.tipo === 'testo') {
      const t = modello.testi[s.chiave];
      if (!t || !String(t.testo || '').trim()) return;
      titoloSezione(s.titolo === undefined ? t.etichetta : s.titolo);
      paragrafo(t.testo);
    } else if (s.tipo === 'campi') {
      const righe = (dati[s.da] || []).filter(function(r) { return r && r[0]; });
      if (!righe.length) return;
      titoloSezione(s.titolo);
      righe.forEach(function(r) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        const val = doc.splitTextToSize(String(r[1] == null || r[1] === '' ? '—' : r[1]), larghezzaTesto - 45);
        spazio(val.length * 5 + 1);
        doc.text(String(r[0]), margine, y);
        doc.setFont('helvetica', 'normal');
        doc.text(val, margine + 45, y);
        y += val.length * 5 + 1;
      });
      y += 3;
    } else if (s.tipo === 'tabella') {
      const righe = dati[s.da] || [];
      titoloSezione(s.titolo);
      if (!righe.length) { paragrafo(s.vuota || 'Nessuna riga.'); return; }
      doc.autoTable({
        startY: y, margin: { left: margine, right: margine, bottom: 20 },
        head: [s.colonne || []], body: righe.map(function(r) { return r.map(function(c) { return c == null ? '' : String(c); }); }),
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, overflow: 'linebreak' },
        headStyles: { fillColor: [8, 80, 65], textColor: 255 }
      });
      y = doc.lastAutoTable.finalY + 6;
    } else if (s.tipo === 'allegati') {
      const elenco = (dati[s.da] || []).filter(Boolean);
      if (!elenco.length) return;
      titoloSezione(s.titolo || 'Allegati');
      elenco.forEach(function(a, i) { paragrafo((i + 1) + '. ' + a); });
    } else if (s.tipo === 'firme') {
      const etichette = s.etichette || [];
      if (!etichette.length) return;
      spazio(30);
      y += 6;
      const passo = larghezzaTesto / etichette.length;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      etichette.forEach(function(e, i) {
        const x = margine + passo * i;
        doc.text(String(e), x, y);
        doc.line(x, y + 16, x + passo - 8, y + 16);
      });
      y += 22;
    }
  });

  piedePdfToli(doc, { margine: margine, sinistra: TOLI_PDF_AZIENDA.nome + ' - ' + testoRevisionePdf(modello) });
  return doc;
}

// Generatore unico: legge il modello (tabella modelli_pdf se c'è, js/72),
// prende i dati (leggiDati del modulo o il contesto così com'è), disegna,
// calcola l'impronta SHA-256 del file e, se chiesto, lo scarica.
async function generaPdfDaModello(codice, contesto, opz) {
  opz = opz || {};
  const definizione = MODELLI_PDF_SITO[codice];
  if (!definizione) throw new Error('Modello del PDF sconosciuto: ' + codice);
  await caricaLibreriePDF();
  const riga = typeof leggiModelloPdf === 'function' ? await leggiModelloPdf(codice) : null;
  const modello = unisciModelloPdf(definizione, riga);
  const dati = typeof definizione.leggiDati === 'function' ? await definizione.leggiDati(contesto || {}, modello) : (contesto || {});
  const doc = disegnaPdfDaModello(modello, dati);
  const buffer = doc.output('arraybuffer');
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const impronta = await improntaSha256(buffer);
  const nomeFile = nomeFilePdfPulito(typeof definizione.nomeFile === 'function' ? definizione.nomeFile(dati, modello) : (modello.nome || codice)) + '.pdf';
  if (opz.scarica) scaricaBlobPdf(blob, nomeFile);
  return { blob: blob, impronta: impronta, revisione: modello.revisione, nomeFile: nomeFile, modello: modello };
}
