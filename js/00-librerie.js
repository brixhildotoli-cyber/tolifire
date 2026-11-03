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

function pulisciTestoPDF(testo) {
  if (typeof testo !== 'string') return testo;
  let fuori = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo.charCodeAt(i);
    if (c > 255 && EXTRA_WINANSI_PDF.indexOf(testo[i]) === -1) { fuori = true; break; }
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