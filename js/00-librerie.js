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