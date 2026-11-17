// js/18a-schede-rilievo.js — schede di rilievo (multiple, porte REI, estintori, rilevazione incendi, compartimentazione, vernice, coppelle, spegnimento).
// Riordino del 17/11: era una parte di js/18-preventivi.js (righe 694-3651),
// spostata così com'era. Si carica subito dopo il pezzo precedente (index.html).

// ── Schede di rilievo multiple (richiesta di Erika del 29/10, sql/48) ──
// Con sql/48 un progetto può avere più schede dello stesso tipo (colonna
// progetti_tecnici_schede.numero: "Porte REI – scheda 2", per esempio una
// per piano). In cima a ogni scheda dell'ingegnere c'è la barra
// "Scheda 1 | Scheda 2 | … | + Nuova scheda" e il campo facoltativo
// "Nome / riferimento" (salvato in dati.nome_scheda, non in una colonna).
// Senza sql/48 tutto come prima: una scheda per tipo, nessuna barra.
// Nessun campo obbligatorio (decisione di Erika del 28/10).
let schedeMultipleDisponibili = true; // riordino 17/11: SQL già in produzione, nessuna lettura di controllo // null = non ancora verificato
// Scheda aperta nella finestra m-rilievo-tecnico (contesto progetto):
// { progettoId, famiglia, numero, elenco (schede salvate; null senza
//   sql/48), bozze ({ numero: { dati, nome, nuova } } non salvate),
//   nomeOriginale, modificata (il tab aperto è stato toccato) }
let schedaRilievoAperta = null;

async function verificaSchedeMultipleDisponibili() {
  if (schedeMultipleDisponibili !== null) return schedeMultipleDisponibili;

  const { error } = await db
    .from('progetti_tecnici_schede')
    .select('numero')
    .limit(1);

  if (!error) {
    schedeMultipleDisponibili = true;
  } else if (error.code === '42703' || /numero/i.test(error.message || '')) {
    schedeMultipleDisponibili = false;
  } else {
    return false;
  }
  return schedeMultipleDisponibili;
}

// true solo dopo la verifica e con sql/48 eseguito.
function schedeMultipleAttive() {
  return schedeMultipleDisponibili === true;
}

// Titolo di una scheda nelle liste e nei PDF: "Porte e portoni REI" se è
// l'unica del suo tipo, "Porte e portoni REI – scheda 2 (Piano terra)"
// se ce ne sono più. quanteStesse (facoltativo) sostituisce il conteggio
// fatto sull'elenco.
function titoloSchedaRilievo(scheda, schede, quanteStesse) {
  const base = etichettaFamigliaTecnica(scheda.famiglia);
  const numero = Number(scheda.numero) || 1;
  const stesse = quanteStesse !== undefined
    ? quanteStesse
    : (schede || []).filter(function(s) { return s.famiglia === scheda.famiglia; }).length;

  let titolo = (stesse > 1 || numero > 1)
    ? base + ' – scheda ' + numero
    : base;

  const nome = String(scheda.nome_scheda || (scheda.dati && scheda.dati.nome_scheda) || '').trim();
  if (nome) titolo += ' (' + nome + ')';

  return titolo;
}

// Il nome della scheda va nel titolo, non tra i campi.
function campoSchedaDaElencare(chiave) {
  // F15.3: sede_id (motore delle schede) serve solo a riproporre la sede
  // F15.5: le fonti dei dati normativi (sql/79) si leggono sotto il loro dato
  // F15.9: foto e video della scheda (sql/82-foto-video) sono file, non dati
  return chiave !== 'nome_scheda' && chiave !== 'sede_id' && chiave !== 'fonti_normative' && chiave !== 'foto_video';
}

// F15.3: salvando, i dati della scheda che il modulo aperto non ha (scritti
// da un'altra scheda, per esempio dal motore delle schede di js/56, o da un
// campo aggiunto dopo) restano com'erano: nessuna scheda cancella i dati
// dell'altra. Il nome della scheda lo decide la barra delle schede.
function conservaDatiFuoriModulo(datiNuovi, datiSalvati) {
  const dati = Object.assign({}, datiNuovi || {});
  Object.keys(datiSalvati || {}).forEach(function(chiave) {
    if (chiave !== 'nome_scheda' && !(chiave in dati)) dati[chiave] = datiSalvati[chiave];
  });
  return dati;
}

// Con sql/48: tipi nell'ordine di oggi (il più recente prima), dentro lo
// stesso tipo per numero. Senza sql/48 l'ordine resta quello ricevuto.
function ordinaSchedeRilievo(schede) {
  const lista = (schede || []).slice();
  if (!lista.some(function(s) { return s.numero !== undefined && s.numero !== null; })) {
    return lista;
  }

  const ordineFamiglie = [];
  lista.forEach(function(s) {
    if (!ordineFamiglie.includes(s.famiglia)) ordineFamiglie.push(s.famiglia);
  });

  return lista.sort(function(a, b) {
    return (ordineFamiglie.indexOf(a.famiglia) - ordineFamiglie.indexOf(b.famiglia)) ||
      ((Number(a.numero) || 1) - (Number(b.numero) || 1));
  });
}

// Legge la scheda da aprire (contesto progetto). numeroRichiesto vuoto =
// la prima scheda salvata del tipo (o la 1, nuova). Restituisce
// { dati } oppure { error }.
// Con sql/48 funziona come le tab di un file Excel (decisione di Erika
// del 29/10): le modifiche di ogni tab restano in memoria (bozze) finché
// non si preme "Salva", che salva tutte le schede modificate del tipo.
// Le bozze restano finché si lavora sullo stesso progetto e tipo; le
// funzioni apriScheda*Ingegnere ripartono da zero.
async function leggiSchedaRilievo(famiglia, numeroRichiesto) {
  const progettoId = currentRilievoProgettoId;
  const box = ge('mrt-content');
  const precedente = schedaRilievoAperta;

  if (box) {
    box.oninput = segnaSchedaRilievoModificata;
    box.onchange = segnaSchedaRilievoModificata;
  }

  if (!(await verificaSchedeMultipleDisponibili())) {
    const { data, error } = await db
      .from('progetti_tecnici_schede')
      .select('dati')
      .eq('progetto_tecnico_id', progettoId)
      .eq('famiglia', famiglia)
      .maybeSingle();

    if (error) return { error: error };

    schedaRilievoAperta = {
      progettoId: progettoId,
      famiglia: famiglia,
      numero: 1,
      elenco: null,
      bozze: {},
      nomeOriginale: String((data && data.dati && data.dati.nome_scheda) || ''),
      datiOriginali: (data && data.dati) || {},
      modificata: false
    };
    return { dati: (data && data.dati) || {} };
  }

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('id,numero,dati,aggiornato_il')
    .eq('progetto_tecnico_id', progettoId)
    .eq('famiglia', famiglia)
    .order('numero', { ascending: true });

  if (error) return { error: error };

  const elenco = data || [];
  const bozze = (precedente && precedente.elenco &&
    precedente.progettoId === progettoId && precedente.famiglia === famiglia)
    ? precedente.bozze
    : {};

  const numeriBozze = Object.keys(bozze).map(Number).sort(function(a, b) { return a - b; });
  const numero = Number(numeroRichiesto) ||
    (elenco.length ? Number(elenco[0].numero) : (numeriBozze[0] || 1));

  const salvata = elenco.find(function(s) { return Number(s.numero) === numero; }) || null;
  const bozza = bozze[numero] || null;

  schedaRilievoAperta = {
    progettoId: progettoId,
    famiglia: famiglia,
    numero: numero,
    elenco: elenco,
    bozze: bozze,
    nomeOriginale: String((salvata && salvata.dati && salvata.dati.nome_scheda) || ''),
    modificata: false
  };

  return {
    dati: bozza ? Object.assign({}, bozza.dati) : ((salvata && salvata.dati) || {})
  };
}

function segnaSchedaRilievoModificata() {
  const s = schedaRilievoAperta;
  if (!s) return;
  s.modificata = true;

  // Pallino sul tab appena si scrive
  const tab = ge('rsm-tab-' + s.numero);
  if (tab && !tab.querySelector('.rsm-pallino')) {
    tab.insertAdjacentHTML('afterbegin', '<span class="rsm-pallino" title="Modifiche non salvate" style="color:#EF9F27">● </span>');
  }
}

function rigaSalvataSchedaRilievo(numero) {
  const s = schedaRilievoAperta;
  return (s && s.elenco || []).find(function(x) { return Number(x.numero) === Number(numero); }) || null;
}

// Funzione che legge il modulo aperto, per tipo di scheda.
function datiFormSchedaRilievo(famiglia) {
  switch (famiglia) {
    case 'rilevazione_incendi': return datiFormSchedaRilevazioneIncendi();
    case 'porte_rei': return datiFormSchedaPorteRei();
    case 'estintori': return datiFormSchedaEstintori();
    case 'compartimentazione': return datiFormSchedaCompartimentazione();
    case 'vernice_intumescente': return datiFormSchedaVerniceIntumescente();
    case 'impianti_spegnimento': return datiFormSchedaImpiantiSpegnimento();
    case 'coppelle': return datiFormSchedaCoppelle();
  }
  return {};
}

// Mette in memoria quello che è scritto nel tab aperto (se modificato).
function memorizzaTabSchedaRilievo() {
  const s = schedaRilievoAperta;
  if (!s || !s.elenco || !s.modificata) return;

  const salvata = rigaSalvataSchedaRilievo(s.numero);
  s.bozze[s.numero] = {
    dati: datiFormSchedaRilievo(s.famiglia),
    nome: String(v('rsm-nome') || '').trim(),
    nuova: !salvata
  };
  s.modificata = false;
}

// Numeri dei tab con modifiche non salvate (compreso quello aperto).
function schedeRilievoNonSalvate() {
  const s = schedaRilievoAperta;
  if (!s || !s.elenco) return [];

  const numeri = Object.keys(s.bozze).map(Number);
  if (s.modificata && !numeri.includes(s.numero)) numeri.push(s.numero);
  return numeri.sort(function(a, b) { return a - b; });
}

// Prima di chiudere la scheda: con modifiche non salvate chiede conferma
// (solo con sql/48; senza, come prima, si chiude e basta).
function confermaChiusuraSchedeRilievo() {
  const s = schedaRilievoAperta;
  const nonSalvate = schedeRilievoNonSalvate();

  if (!nonSalvate.length) return true;

  const ok = confirm(
    (nonSalvate.length === 1
      ? 'La scheda ' + nonSalvate[0] + ' ha modifiche non salvate'
      : 'Le schede ' + nonSalvate.join(', ') + ' hanno modifiche non salvate') +
    ': chiudendo si perdono.\n\nChiudere senza salvare?'
  );

  if (ok && s) {
    s.bozze = {};
    s.modificata = false;
  }
  return ok;
}

// ✕ e clic fuori dalla finestra: stessa conferma (fase di cattura, prima
// dei gestori di closeM e del ✕).
(function() {
  const finestra = ge('m-rilievo-tecnico');
  if (!finestra || finestra._controlloSchedeRilievo) return;

  finestra._controlloSchedeRilievo = true;
  finestra.addEventListener('click', function(e) {
    const chiude = e.target === finestra ||
      (e.target.closest && e.target.closest('.mh .mx'));
    if (!chiude) return;
    if (!confermaChiusuraSchedeRilievo()) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
})();

function puoEliminareSchedaRilievo() {
  const s = schedaRilievoAperta;
  return !!(s && s.elenco && ['ingegnere', 'titolare'].includes(ROLE));
}

// Barra in cima alla scheda: "Scheda 1 | Scheda 2 | … | + Nuova scheda",
// nome/riferimento ed eliminazione. Vuota senza sql/48.
function htmlBarraSchedeRilievo() {
  const s = schedaRilievoAperta;
  if (!s || !s.elenco) return '';

  const numeri = s.elenco.map(function(x) { return Number(x.numero); });
  Object.keys(s.bozze).map(Number).forEach(function(n) {
    if (!numeri.includes(n)) numeri.push(n);
  });
  if (!numeri.includes(s.numero)) numeri.push(s.numero);
  numeri.sort(function(a, b) { return a - b; });

  // F15.2 (js/66, sql/76): elenco delle posizioni P-xx della scheda, disegnato
  // subito dopo la scheda (la funzione lo toglie se la tabella non c'è).
  const posizioniNellaScheda = typeof disegnaPosizioniSchedaAperta === 'function';
  if (posizioniNellaScheda) setTimeout(disegnaPosizioniSchedaAperta, 0);

  function nomeTab(n) {
    const bozza = s.bozze[n];
    if (bozza) return String(bozza.nome || '');
    const riga = rigaSalvataSchedaRilievo(n);
    return String((riga && riga.dati && riga.dati.nome_scheda) || '');
  }

  const attuale = rigaSalvataSchedaRilievo(s.numero);
  const nomeAttuale = nomeTab(s.numero);

  const tab = numeri.map(function(n) {
    const riga = rigaSalvataSchedaRilievo(n);
    const nome = nomeTab(n);
    const attiva = n === s.numero;
    const nonSalvata = !!s.bozze[n];
    const nomeBreve = nome.length > 18 ? nome.slice(0, 17) + '…' : nome;

    return `
      <button
        type="button"
        class="tab${attiva ? ' on' : ''}"
        id="rsm-tab-${n}"
        ${attiva ? 'aria-current="true"' : ''}
        title="${esc((nome || ('Scheda ' + n)) + (nonSalvata ? ' — modifiche non salvate' : ''))}"
        style="line-height:1.25;text-align:left"
        onclick="cambiaSchedaRilievo(${n})"
      >
        ${nonSalvata ? '<span class="rsm-pallino" style="color:#EF9F27">● </span>' : ''}Scheda ${n}${riga ? '' : ' (nuova)'}
        ${nomeBreve ? `<br><span style="font-size:11px;color:var(--m)">${esc(nomeBreve)}</span>` : ''}
      </button>
    `;
  }).join('');

  const pulsanteNuova = numeri.length >= 99
    ? ''
    : `
      <button
        type="button"
        class="tab"
        id="rsm-tab-nuova"
        style="color:var(--g);font-weight:600"
        onclick="nuovaSchedaRilievo()"
      >
        + Nuova scheda
      </button>
    `;

  const salvataggio = attuale && attuale.aggiornato_il
    ? 'Ultimo salvataggio: ' + new Date(attuale.aggiornato_il).toLocaleString('it-IT')
    : 'Scheda nuova: si crea con "Salva", con le stesse voci delle altre.';

  return `
    <div class="tabs" id="rsm-barra" role="tablist" aria-label="Schede di questo tipo" style="margin-bottom:6px">
      ${tab}
      ${pulsanteNuova}
    </div>

    <div style="font-size:12px;color:var(--m);margin-bottom:10px">
      Passa da una scheda all’altra senza perdere quello che hai scritto:
      <b>Salva</b> salva tutte le schede con il pallino <span style="color:#EF9F27">●</span>.
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="f" style="margin-bottom:6px">
        <label for="rsm-nome">
          Nome / riferimento della scheda
          <span style="font-weight:400;color:var(--m)">(facoltativo)</span>
        </label>
        <input
          type="text"
          id="rsm-nome"
          maxlength="80"
          value="${esc(nomeAttuale)}"
          placeholder="Es. Piano terra, porte del magazzino"
        >
      </div>

      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
        <div style="font-size:12px;color:var(--m)">${esc(salvataggio)}</div>
        ${
          puoEliminareSchedaRilievo()
            ? `
              <button type="button" class="btn sm warn" id="rsm-elimina" onclick="eliminaSchedaRilievo()">
                🗑 Elimina scheda ${s.numero}
              </button>
            `
            : ''
        }
      </div>
    </div>

    ${posizioniNellaScheda ? '<div class="card" id="rsm-posizioni" style="margin-bottom:16px;display:none"></div>' : ''}
  `;
}

// Apre la scheda del tipo indicato (numero vuoto = la prima).
async function apriFamigliaSchedaRilievo(famiglia, numero) {
  switch (famiglia) {
    case 'rilevazione_incendi':
      contestoSchedaRilevazione = 'progetto';
      return apriSchedaRilevazioneIncendi(numero);
    case 'porte_rei': return apriSchedaPorteRei(numero);
    case 'estintori': return apriSchedaEstintori(numero);
    case 'compartimentazione': return apriSchedaCompartimentazione(numero);
    case 'vernice_intumescente': return apriSchedaVerniceIntumescente(numero);
    case 'impianti_spegnimento': return apriSchedaImpiantiSpegnimento(numero);
    case 'coppelle': return apriSchedaCoppelle(numero);
  }
}

// Cambio di tab: quello che è scritto resta in memoria, nessuna conferma.
async function cambiaSchedaRilievo(numero) {
  const s = schedaRilievoAperta;
  if (!s || Number(numero) === s.numero) return;

  memorizzaTabSchedaRilievo();
  await apriFamigliaSchedaRilievo(s.famiglia, Number(numero));
}

// Nuova scheda dello stesso tipo, vuota, numero = massimo + 1.
async function nuovaSchedaRilievo() {
  const s = schedaRilievoAperta;
  if (!s || !s.elenco) return;

  memorizzaTabSchedaRilievo();

  // La scheda aperta, nuova e mai toccata, resta tra i tab.
  if (!rigaSalvataSchedaRilievo(s.numero) && !s.bozze[s.numero]) {
    s.bozze[s.numero] = { dati: {}, nome: '', nuova: true };
  }

  const massimo = Math.max(
    0,
    s.numero,
    ...s.elenco.map(function(x) { return Number(x.numero) || 0; }),
    ...Object.keys(s.bozze).map(Number)
  );

  if (massimo >= 99) {
    toast('Si possono creare al massimo 99 schede dello stesso tipo', 'err');
    return;
  }

  s.bozze[massimo + 1] = { dati: {}, nome: '', nuova: true };
  await apriFamigliaSchedaRilievo(s.famiglia, massimo + 1);
  const campoNome = ge('rsm-nome');
  if (campoNome) campoNome.focus();
}

// Salva. Senza sql/48: la scheda del tipo, come prima. Con sql/48: TUTTE
// le schede del tipo con modifiche non salvate (quella aperta compresa),
// ognuna per (progetto, tipo, numero); le nuove si inseriscono (se nel
// frattempo qualcuno ha preso lo stesso numero, prendono il successivo).
// riga = la riga della scheda aperta: per le altre si usano gli stessi
// campi (stato, compilato_da...) con i loro dati.
// Restituisce { error, salvate }.
async function salvaRigaSchedaRilievo(riga) {
  const s = schedaRilievoAperta;
  const multiple = schedeMultipleAttive() && s && s.elenco && s.famiglia === riga.famiglia;

  if (!multiple) {
    if (s && s.nomeOriginale && riga.dati && !riga.dati.nome_scheda) {
      riga.dati.nome_scheda = s.nomeOriginale;
    }
    if (s && s.famiglia === riga.famiglia && s.datiOriginali) {
      riga.dati = conservaDatiFuoriModulo(riga.dati, s.datiOriginali);
    }
    // F15.4 (js/56): misure fuori dal plausibile, campi dell'ingegnere
    if (typeof controlloSchedeRilievoPrimaDelSalvataggio === 'function') {
      const fermo = controlloSchedeRilievoPrimaDelSalvataggio([{
        famiglia: riga.famiglia, dati: riga.dati, prima: (s && s.famiglia === riga.famiglia && s.datiOriginali) || {}
      }]);
      if (fermo) return { error: fermo, salvate: 0 };
    }
    return db
      .from('progetti_tecnici_schede')
      .upsert(riga, { onConflict: 'progetto_tecnico_id,famiglia' });
  }

  // La scheda aperta si salva sempre (come prima), le altre se modificate.
  s.bozze[s.numero] = {
    dati: riga.dati,
    nome: String(v('rsm-nome') || '').trim(),
    nuova: !rigaSalvataSchedaRilievo(s.numero)
  };
  s.modificata = false;

  const numeri = Object.keys(s.bozze).map(Number).sort(function(a, b) { return a - b; });
  let salvate = 0;

  // F15.4 (js/56): prima di salvare, tutte le schede del tipo modificate
  if (typeof controlloSchedeRilievoPrimaDelSalvataggio === 'function') {
    const fermo = controlloSchedeRilievoPrimaDelSalvataggio(numeri.map(function(numero) {
      const salvataPrima = rigaSalvataSchedaRilievo(numero);
      return {
        famiglia: riga.famiglia,
        numero: numero,
        dati: conservaDatiFuoriModulo(s.bozze[numero].dati, salvataPrima && salvataPrima.dati),
        prima: (salvataPrima && salvataPrima.dati) || {}
      };
    }));
    if (fermo) {
      s.modificata = true; // niente salvato: la chiusura chiede ancora conferma
      return { error: fermo, salvate: 0 };
    }
  }

  for (const numero of numeri) {
    const bozza = s.bozze[numero];
    const salvataPrima = rigaSalvataSchedaRilievo(numero);
    const dati = conservaDatiFuoriModulo(bozza.dati, salvataPrima && salvataPrima.dati);
    if (bozza.nome) {
      dati.nome_scheda = bozza.nome;
    } else {
      delete dati.nome_scheda;
    }

    const rigaScheda = Object.assign({}, riga, { dati: dati, numero: numero });
    let risultato;

    if (!bozza.nuova) {
      risultato = await db
        .from('progetti_tecnici_schede')
        .upsert(rigaScheda, { onConflict: 'progetto_tecnico_id,famiglia,numero' });
    } else {
      for (let tentativo = 0; tentativo < 3; tentativo++) {
        risultato = await db.from('progetti_tecnici_schede').insert(rigaScheda);
        if (!risultato.error || risultato.error.code !== '23505') break;

        // Numero preso nel frattempo da un altro: il primo libero.
        const { data: ultima } = await db
          .from('progetti_tecnici_schede')
          .select('numero')
          .eq('progetto_tecnico_id', riga.progetto_tecnico_id)
          .eq('famiglia', riga.famiglia)
          .order('numero', { ascending: false })
          .limit(1)
          .maybeSingle();

        const libero = Math.max(
          Number(ultima && ultima.numero) || 0,
          ...Object.keys(s.bozze).map(Number)
        ) + 1;
        if (s.numero === rigaScheda.numero) s.numero = libero;
        rigaScheda.numero = libero;
      }
    }

    if (risultato.error) {
      // Le schede già salvate escono dalle bozze, le altre restano.
      if (salvate) await apriFamigliaSchedaRilievo(s.famiglia, s.numero);
      return { error: risultato.error, salvate: salvate };
    }

    delete s.bozze[numero];
    salvate++;
  }

  return { error: null, salvate: salvate };
}

// Dopo il salvataggio: con sql/48 la scheda resta aperta (si vede nella
// barra e si può creare la successiva), senza sql/48 si chiude come prima.
async function dopoSalvataggioSchedaRilievo(messaggio, salvate) {
  const s = schedaRilievoAperta;

  if (schedeMultipleAttive() && s && s.elenco) {
    await apriFamigliaSchedaRilievo(s.famiglia, s.numero);
    toast(
      salvate > 1
        ? messaggio.replace(/^Scheda /, 'Schede ').replace(/ salvata$/, ' salvate') + ': ' + salvate
        : messaggio + ' (scheda ' + s.numero + ')',
      'ok'
    );
    aggiornaRiepilogoSchedeVerifica();
    return;
  }

  toast(messaggio, 'ok');
  closeM('m-rilievo-tecnico');
}

// Elimina la scheda aperta, come un foglio di Excel (decisione di Erika
// del 29/10): qualsiasi scheda, anche la 1, in qualsiasi momento; solo
// ingegnere, titolare e informatico, con conferma. Se era l'unica, quel
// tipo resta senza schede. Una scheda nuova mai salvata si toglie solo
// dalla memoria. Lo impone anche il database (RPC elimina_scheda_rilievo).
async function eliminaSchedaRilievo() {
  const s = schedaRilievoAperta;
  if (!puoEliminareSchedaRilievo()) return;

  const salvata = rigaSalvataSchedaRilievo(s.numero);
  const nomeScritto = String(v('rsm-nome') || '').trim();
  const nome = nomeScritto ? ' (' + nomeScritto + ')' : '';
  const ok = confirm(
    'Eliminare ' + etichettaFamigliaTecnica(s.famiglia) + ' – scheda ' + s.numero + nome + '?\n\n' +
    (salvata
      ? 'I dati di questa scheda (comprese le sue posizioni P-xx) si perdono e non si possono recuperare. '
      : 'La scheda non è mai stata salvata: si toglie e basta. ') +
    'Le altre schede restano.'
  );
  if (!ok) return;

  if (salvata) {
    const { error } = await db.rpc('elimina_scheda_rilievo', { p_scheda_id: salvata.id });

    if (error) {
      toast('Errore eliminazione scheda: ' + error.message, 'err');
      return;
    }
  }

  const numeroEliminato = s.numero;
  delete s.bozze[numeroEliminato];
  s.modificata = false;
  s.elenco = s.elenco.filter(function(x) { return Number(x.numero) !== numeroEliminato; });

  // Si apre la prima scheda rimasta (salvata o in memoria); se non ne
  // resta nessuna, la scheda 1 vuota (nuova).
  const rimaste = s.elenco.map(function(x) { return Number(x.numero); })
    .concat(Object.keys(s.bozze).map(Number))
    .sort(function(a, b) { return a - b; });

  await apriFamigliaSchedaRilievo(s.famiglia, rimaste.length ? rimaste[0] : 1);
  toast(
    'Scheda ' + numeroEliminato + ' eliminata' +
    (rimaste.length ? '' : ': questo tipo non ha più schede salvate'),
    'ok'
  );
  aggiornaRiepilogoSchedeVerifica();
}

// Riepilogo delle schede salvate nella finestra "Verifica tecnica"
// (solo con sql/48): quante schede per tipo.
async function aggiornaRiepilogoSchedeVerifica(progettoId) {
  const id = progettoId || v('mvt-id');
  const pulsante = document.querySelector(
    '#m-verifica-tecnica [onclick^="apriSchedaRilevazioneIngegnere"]'
  );
  let box = ge('mvt-schede-riepilogo');

  if (!pulsante || !id || !(await verificaSchedeMultipleDisponibili())) {
    if (box) box.remove();
    return;
  }

  if (!box) {
    box = document.createElement('div');
    box.id = 'mvt-schede-riepilogo';
    box.style.cssText = 'font-size:12px;color:var(--m);margin-top:10px';
    pulsante.parentElement.insertAdjacentElement('afterend', box);
  }

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('famiglia,numero')
    .eq('progetto_tecnico_id', id);

  if (error) {
    box.textContent = '';
    return;
  }

  const conteggio = {};
  (data || []).forEach(function(s) {
    conteggio[s.famiglia] = (conteggio[s.famiglia] || 0) + 1;
  });

  const voci = Object.keys(conteggio).map(function(famiglia) {
    const n = conteggio[famiglia];
    return esc(etichettaFamigliaTecnica(famiglia)) + ': ' + n + (n === 1 ? ' scheda' : ' schede');
  });

  box.innerHTML = voci.length
    ? '<b>Schede salvate</b> — ' + voci.join(' · ') +
      '<br>Per un’altra scheda dello stesso tipo (es. un altro piano) apri la scheda e usa “+ Nuova scheda”.'
    : 'Nessuna scheda salvata. Ogni tipo può avere più schede (es. una per piano): apri la scheda e usa “+ Nuova scheda”.';
}

async function renderSchedePreventivo() {
  ricordaPosizionePagina();
  const box = ge('pvd-schede-content');

  if (!box || !currentPreventivoProgettoId) return;

  box.innerHTML =
    '<div class="load">Caricamento rilievi dell’ingegnere...</div>';

  const { data, error } = await db
    .from('progetti_tecnici_schede')
    .select('*')
    .eq('progetto_tecnico_id', currentPreventivoProgettoId)
    .order('aggiornato_il', { ascending: false });

  if (error) {
    box.innerHTML = `
      <div class="al2 e">
        Errore caricamento schede tecniche: ${esc(error.message)}
      </div>
    `;
    return;
  }

  if (!data || !data.length) {
    box.innerHTML = `
      <div class="empty">
        L’ingegnere non ha ancora compilato alcun rilievo tecnico.
      </div>
    `;
    // F15.13: schede ancora dall'ingegnere (Acquisti non le legge): js/67
    if (typeof aggiungiRiquadroSmistamento === 'function') await aggiungiRiquadroSmistamento(box, currentPreventivoProgettoId);
    return;
  }

  if (typeof aggiungiRiquadroSmistamento === 'function') {
    // F15.13: riquadro "🚦 Smistamento" in cima, dopo il disegno qui sotto (js/67)
    setTimeout(function() { aggiungiRiquadroSmistamento(box, currentPreventivoProgettoId); }, 0);
  }

  box.innerHTML = `
    <div class="al2 i" style="margin-bottom:14px">
      📝 I rilievi originali dell’ingegnere restano invariati.
      Acquisti può modificare la copia destinata ai fornitori.
    </div>

    ${ordinaSchedeRilievo(data).map(function(scheda, indice, schede) {
      const modificataCommerciale = schedaHaDatiCommerciali(scheda);
      const datiVisualizzati = datiSchedaDaMostrare(scheda);

      const campi = Object.entries(datiVisualizzati)
        .filter(function(entry) {
          const valore = entry[1];
          return campoSchedaDaElencare(entry[0]) &&
            valore !== null &&
            valore !== undefined &&
            valore !== '';
        });

      return `
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px">
            <div>
              <div style="font-size:15px;font-weight:700">
                📝 ${esc(titoloSchedaRilievo(scheda, schede))}
              </div>

              <div style="font-size:12px;color:var(--m);margin-top:4px">
                ${
                  scheda.aggiornato_il
                    ? 'Aggiornata il ' +
                      new Date(scheda.aggiornato_il).toLocaleString('it-IT')
                    : 'Data aggiornamento non disponibile'
                }
              </div>

              ${
                modificataCommerciale
                  ? `
                    <div style="font-size:12px;color:var(--o);margin-top:4px">
                      ✏️ Copia di Acquisti attiva
                    </div>
                  `
                  : ''
              }
            </div>

            ${
              ['commerciale', 'titolare'].includes(ROLE)
                ? `
                  <button
                    class="btn sm p"
                    onclick="apriModificaSchedaCommerciale(
                      '${currentPreventivoProgettoId}',
                      '${scheda.famiglia}',
                      '${scheda.id}'
                    )"
                  >
                    ✏️ Modifica copia
                  </button>
                `
                : '<span class="bx bok">Solo lettura</span>'
            }
          </div>

          ${
            campi.length
              ? `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px">
                  ${campi.map(function(entry) {
                    return `
                      <div style="padding:9px;background:var(--bg);border-radius:var(--rs)">
                        <div style="font-size:11px;color:var(--m);margin-bottom:3px">
                          ${esc(etichettaCampoTecnico(entry[0], scheda.famiglia))}
                        </div>

                        <div style="font-size:13px;font-weight:600;white-space:pre-wrap;overflow-wrap:anywhere">
                          ${esc(valoreSchedaTecnica(entry[1], entry[0], scheda.famiglia))}
                        </div>
                        ${typeof htmlFonteDatoScheda === 'function' ? htmlFonteDatoScheda(scheda, entry[0]) : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
              `
              : '<div class="empty">La scheda non contiene ancora dati.</div>'
          }
        </div>
      `;
    }).join('')}
  `;
}

async function apriSchedaRilevazioneIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero
  contestoSchedaRilevazione = 'progetto';

  openM('m-rilievo-tecnico');
  await apriSchedaRilevazioneIncendi();
}

function chiudiSchedaRilevazione() {
  if (!confermaChiusuraSchedeRilievo()) return;
   renderSchedePreventivo();
  if (contestoSchedaRilevazione === 'progetto') {
    closeM('m-rilievo-tecnico');
    return;
  }

  ripristinaPosizionePagina();
}

async function apriSchedaPorteReiIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaPorteRei();
}

function chiudiSchedaPorteRei() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
   renderSchedePreventivo();
}

async function apriSchedaPorteRei(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('porte_rei', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🚪 Porte e portoni REI
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Fornitura e posa di porte tagliafuoco certificate.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaPorteRei()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Intervento richiesto</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipo di intervento', 'pr-tipo-intervento', d.tipo_intervento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'fornitura_e_posa', label: 'Fornitura e posa' },
          { value: 'sostituzione', label: 'Sostituzione porta esistente' },
          { value: 'adeguamento', label: 'Adeguamento' },
          { value: 'manutenzione', label: 'Manutenzione' }
        ])}

        ${selectPreventivo('Resistenza al fuoco richiesta', 'pr-rei', d.rei || '', [
          { value: '', label: 'Seleziona' },
          { value: 'rei_60', label: 'REI 60' },
          { value: 'rei_90', label: 'REI 90' },
          { value: 'rei_120', label: 'REI 120' },
          { value: 'classe_superiore', label: 'Classe superiore / da definire' }
        ])}
      </div>
    </div>

    <div class="rap-section">2. Dati della porta</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipologia', 'pr-tipologia', d.tipologia || '', [
          { value: '', label: 'Seleziona' },
          { value: 'battente_singolo', label: 'Battente singolo' },
          { value: 'battente_doppio', label: 'Battente doppio' },
          { value: 'scorrevole', label: 'Scorrevole' },
          { value: 'portone', label: 'Portone' },
          { value: 'serranda', label: 'Serranda' },
          { value: 'altro', label: 'Altro' }
        ])}

        ${campoPreventivo('Quantità', 'pr-quantita', d.quantita, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Larghezza (cm)', 'pr-larghezza', d.larghezza, 'number', 'Es. 120')}
        ${campoPreventivo('Altezza (cm)', 'pr-altezza', d.altezza, 'number', 'Es. 210')}
      </div>

      <div class="fr">
        ${campoPreventivo('Colore / finitura', 'pr-colore', d.colore, 'text', 'Es. bianco RAL 9010')}

        ${selectPreventivo('Maniglione antipanico', 'pr-maniglione', d.maniglione || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>
    </div>

    <div class="rap-section">3. Vano e parete</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipo di parete', 'pr-parete', d.parete || '', [
          { value: '', label: 'Seleziona' },
          { value: 'muratura', label: 'Muratura' },
          { value: 'cemento_armato', label: 'Cemento armato' },
          { value: 'cartongesso', label: 'Cartongesso' },
          { value: 'altro', label: 'Altro / da verificare' }
        ])}

        ${campoPreventivo('Spessore parete (mm)', 'pr-spessore-parete', d.spessore_parete, 'number')}
      </div>

      <div class="fr">
        ${selectPreventivo('Verso di apertura', 'pr-verso-apertura', d.verso_apertura || '', [
          { value: '', label: 'Seleziona' },
          { value: 'interno', label: 'Verso interno' },
          { value: 'esterno', label: 'Verso esterno' },
          { value: 'destra', label: 'Destra' },
          { value: 'sinistra', label: 'Sinistra' },
          { value: 'da_verificare', label: 'Da verificare' }
        ])}

        ${selectPreventivo('Stato vano', 'pr-stato-vano', d.stato_vano || '', [
          { value: '', label: 'Seleziona' },
          { value: 'pronto', label: 'Pronto per posa' },
          { value: 'da_adeguare', label: 'Da adeguare' },
          { value: 'da_verificare', label: 'Da verificare' }
        ])}
      </div>

      ${areaPreventivo(
        'Note su vano, muratura, misure o criticità',
        'pr-note-vano',
        d.note_vano,
        'Indica eventuali difformità, opere murarie o verifiche necessarie.'
      )}
    </div>

    <div class="rap-section">4. Posa e logistica</div>

    <div class="card">
      <div class="fr">
        ${campoPreventivo('Piano / area di installazione', 'pr-piano', d.piano, 'text', 'Es. piano terra, magazzino')}
        ${selectPreventivo('Smontaggio e smaltimento porta esistente', 'pr-smaltimento', d.smaltimento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      ${areaPreventivo(
        'Accesso, trasporto, opere murarie/elettriche e difficoltà di posa',
        'pr-logistica',
        d.logistica,
        'Scale, ascensore, PLE, fasce orarie, ripristini, demolizioni...'
      )}
    </div>

    <div class="rap-section">5. Note tecniche</div>

    <div class="card">
      ${areaPreventivo(
        'Indicazioni per preventivo e posa',
        'pr-note-tecniche',
        d.note_tecniche,
        'Lavorazioni incluse, esclusioni, tempi, criticità e note interne.'
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaPorteRei()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaPorteRei()">
        Salva scheda Porte REI
      </button>
    </div>
  `;
  // F15.6 (sql/80): la scheda si compila nel motore, questa resta in sola lettura
  if (typeof schedaVecchiaInSolaLettura === 'function') schedaVecchiaInSolaLettura('porte_rei');
   renderSchedePreventivo();
}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaPorteRei() {
  return {
    tipo_intervento: v('pr-tipo-intervento'),
    rei: v('pr-rei'),
    tipologia: v('pr-tipologia'),
    quantita: v('pr-quantita'),
    larghezza: v('pr-larghezza'),
    altezza: v('pr-altezza'),
    colore: v('pr-colore'),
    maniglione: v('pr-maniglione'),
    parete: v('pr-parete'),
    spessore_parete: v('pr-spessore-parete'),
    verso_apertura: v('pr-verso-apertura'),
    stato_vano: v('pr-stato-vano'),
    note_vano: v('pr-note-vano'),
    piano: v('pr-piano'),
    smaltimento: v('pr-smaltimento'),
    logistica: v('pr-logistica'),
    note_tecniche: v('pr-note-tecniche')
  };
}

async function salvaSchedaPorteRei() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  if (typeof salvataggioSchedaVecchiaBloccato === 'function' && salvataggioSchedaVecchiaBloccato('porte_rei')) return;

  const dati = datiFormSchedaPorteRei();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const riga = {
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'porte_rei',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  };

  const { error, salvate } = await salvaRigaSchedaRilievo(riga);

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda Porte REI salvata', salvate);
}


async function apriSchedaEstintoriIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaEstintori();
}

function chiudiSchedaEstintori() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
   renderSchedePreventivo();

}

async function apriSchedaEstintori(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('estintori', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🧯 Estintori
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Rilievo per fornitura, sostituzione, manutenzione o adeguamento.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaEstintori()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Intervento</div>

    <div class="card">
      ${selectPreventivo('Tipo di intervento', 'es-tipo-intervento', d.tipo_intervento || '', [
        { value: '', label: 'Seleziona' },
        { value: 'fornitura', label: 'Fornitura' },
        { value: 'sostituzione', label: 'Sostituzione' },
        { value: 'manutenzione', label: 'Manutenzione' },
        { value: 'adeguamento', label: 'Adeguamento' }
      ])}
    </div>

    <div class="rap-section">2. Estintori richiesti</div>

    <div class="card">
      <div class="fr">
        ${campoPreventivo('Numero estintori esistenti', 'es-numero-esistenti', d.numero_esistenti, 'number')}
        ${campoPreventivo('Numero estintori da installare', 'es-numero-installare', d.numero_installare, 'number')}
      </div>

      <div class="fr">
        ${selectPreventivo('Tipologia', 'es-tipologia', d.tipologia || '', [
          { value: '', label: 'Seleziona' },
          { value: 'polvere', label: 'Polvere' },
          { value: 'co2', label: 'CO₂' },
          { value: 'schiuma', label: 'Schiuma' },
          { value: 'idrico', label: 'Idrico' },
          { value: 'altro', label: 'Altro' }
        ])}

        ${selectPreventivo('Peso o capacità', 'es-capacita', d.capacita || '', [
          { value: '', label: 'Seleziona' },
          { value: '2_kg', label: '2 kg' },
          { value: '4_kg', label: '4 kg' },
          { value: '6_kg', label: '6 kg' },
          { value: '9_kg', label: '9 kg' },
          { value: 'altro', label: 'Altro' }
        ])}
      </div>

      ${campoPreventivo(
        'Classe di spegnimento e capacità estinguente richiesta',
        'es-classe-spegnimento',
        d.classe_spegnimento,
        'text',
        'Es. 34A 233B C'
      )}
    </div>

    <div class="rap-section">3. Stato e posizionamento</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Stato estintori esistenti', 'es-stato-esistenti', d.stato_esistenti || '', [
          { value: '', label: 'Seleziona' },
          { value: 'validi', label: 'Validi' },
          { value: 'scaduti', label: 'Scaduti' },
          { value: 'da_revisionare', label: 'Da revisionare' },
          { value: 'da_sostituire', label: 'Da sostituire' }
        ])}

        ${selectPreventivo('Estintori carrellati necessari', 'es-carrellati', d.carrellati || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      ${areaPreventivo(
        'Posizionamento, altezza, accessibilità, distanze di copertura e aree protette',
        'es-posizionamento',
        d.posizionamento,
        'Indica postazioni, distanze, ostacoli e criticità.'
      )}
    </div>

    <div class="rap-section">4. Accessori e documentazione</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Cartellonistica presente', 'es-cartellonistica', d.cartellonistica || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_integrare', label: 'Da integrare' }
        ])}

        ${selectPreventivo('Smaltimento estintori esistenti', 'es-smaltimento', d.smaltimento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      ${areaPreventivo(
        'Armadietti, piantane, cassette o supporti necessari',
        'es-supporti',
        d.supporti
      )}

      ${areaPreventivo(
        'Registro antincendio e cartellini manutentivi',
        'es-registro',
        d.registro,
        'Indica se presenti, da aggiornare o da predisporre.'
      )}
    </div>

    <div class="rap-section">5. Foto e note</div>

    <div class="card">
      ${areaPreventivo(
        'Foto postazioni caricate negli allegati',
        'es-foto-postazioni',
        d.foto_postazioni,
        'Es. Foto ingresso, magazzino, piano primo...'
      )}

      ${areaPreventivo(
        'Note tecniche per il preventivo',
        'es-note-tecniche',
        d.note_tecniche,
        'Criticità, lavorazioni incluse, esclusioni e indicazioni.'
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaEstintori()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaEstintori()">
        Salva scheda estintori
      </button>
    </div>
  `;
  // F15.6 (sql/80): la scheda si compila nel motore, questa resta in sola lettura
  if (typeof schedaVecchiaInSolaLettura === 'function') schedaVecchiaInSolaLettura('estintori');
   renderSchedePreventivo();
}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaEstintori() {
  return {
    tipo_intervento: v('es-tipo-intervento'),
    numero_esistenti: v('es-numero-esistenti'),
    numero_installare: v('es-numero-installare'),
    tipologia: v('es-tipologia'),
    capacita: v('es-capacita'),
    classe_spegnimento: v('es-classe-spegnimento'),
    stato_esistenti: v('es-stato-esistenti'),
    carrellati: v('es-carrellati'),
    posizionamento: v('es-posizionamento'),
    cartellonistica: v('es-cartellonistica'),
    smaltimento: v('es-smaltimento'),
    supporti: v('es-supporti'),
    registro: v('es-registro'),
    foto_postazioni: v('es-foto-postazioni'),
    note_tecniche: v('es-note-tecniche')
  };
}

async function salvaSchedaEstintori() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  if (typeof salvataggioSchedaVecchiaBloccato === 'function' && salvataggioSchedaVecchiaBloccato('estintori')) return;

  const dati = datiFormSchedaEstintori();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const { error, salvate } = await salvaRigaSchedaRilievo({
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'estintori',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda estintori salvata', salvate);
}

async function apriSchedaRilevazioneIncendi(numero) {
  ricordaPosizionePagina();
  const usaProgetto = contestoSchedaRilevazione === 'progetto';

  const box = usaProgetto
    ? ge('mrt-content')
    : ge('pvd-schede-content');

  const tabella = usaProgetto
    ? 'progetti_tecnici_schede'
    : 'preventivi_schede_tecniche';

  const colonnaId = usaProgetto
    ? 'progetto_tecnico_id'
    : 'preventivo_id';

  const riferimentoId = usaProgetto
    ? currentRilievoProgettoId
    : currentPreventivoId;

  // Dal progetto: schede multiple con sql/48 (barra in cima). Dal
  // preventivo (preventivi_schede_tecniche): una scheda, come prima.
  let lettura;

  if (usaProgetto) {
    lettura = await leggiSchedaRilievo('rilevazione_incendi', numero);
  } else {
    schedaRilievoAperta = null;
    const { data, error } = await db
      .from(tabella)
      .select('dati')
      .eq(colonnaId, riferimentoId)
      .eq('famiglia', 'rilevazione_incendi')
      .maybeSingle();
    lettura = error ? { error: error } : { dati: data?.dati || {} };
  }

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = (usaProgetto ? htmlBarraSchedeRilievo() : '') + `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🚨 Rilevazione incendi
        </div>
        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Compila solo ciò che serve per questo impianto.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaRilevazione()">
        ← Schede
      </button>
    </div>

    <div class="rap-section">1. Tipo di intervento</div>
    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipo di intervento', 'ri-tipo-intervento', d.tipo_intervento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'nuovo_impianto', label: 'Nuovo impianto' },
          { value: 'ampliamento', label: 'Ampliamento' },
          { value: 'adeguamento', label: 'Adeguamento' },
          { value: 'sostituzione_centrale', label: 'Sostituzione centrale' },
          { value: 'manutenzione', label: 'Manutenzione' }
        ])}

        ${selectPreventivo('Progetto esistente fornito dal cliente?', 'ri-progetto-esistente', d.progetto_esistente || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No — includere progettazione UNI 9795' }
        ])}
      </div>

      <div class="fr">
        ${selectPreventivo('Livello di sorveglianza', 'ri-sorveglianza', d.sorveglianza || '', [
          { value: '', label: 'Seleziona' },
          { value: 'totale', label: 'Totale' },
          { value: 'parziale', label: 'Parziale' },
          { value: 'locale', label: 'Locale' }
        ])}

        ${campoPreventivo('Marca richiesta / impianto esistente', 'ri-marca', d.marca, 'text', 'Es. Notifier, Inim, Bosch...')}
      </div>
    </div>

    <div class="rap-section">2. Centrale e architettura</div>
    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipo di centrale', 'ri-centrale-tipo', d.centrale_tipo || '', [
          { value: '', label: 'Seleziona' },
          { value: 'convenzionale', label: 'Convenzionale' },
          { value: 'analogica_indirizzata', label: 'Analogica indirizzata' },
          { value: 'wireless', label: 'Wireless' },
          { value: 'ibrida', label: 'Ibrida' }
        ])}

        ${campoPreventivo('Numero loop', 'ri-loop', d.loop, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Indirizzi per loop', 'ri-indirizzi-loop', d.indirizzi_loop, 'number')}
        ${campoPreventivo('Margine espansione (%)', 'ri-margine-espansione', d.margine_espansione, 'number', 'Es. 25')}
      </div>

      ${areaPreventivo(
        'Ripetitori, batterie, alimentatori, combinatore GSM, quadro sinottico o collegamenti esterni',
        'ri-accessori-centrale',
        d.accessori_centrale,
        'Indica quantità, autonomia 24h/72h, collegamento vigilanza/VVF...'
      )}

      ${areaPreventivo(
        'Comandi a terzi / moduli I-O',
        'ri-comandi-terzi',
        d.comandi_terzi,
        'Serrande, elettromagneti, EVAC, ascensori, gruppi elettrogeni, sgancio...'
      )}

      ${areaPreventivo(
        'Interfacce con impianti esistenti',
        'ri-interfacce',
        d.interfacce,
        'BMS, spegnimento, diffusione sonora, centrale esistente...'
      )}
    </div>

    <div class="rap-section">3. Campo — dispositivi e quantità</div>
    <div class="card">
      <div class="fr">
        ${campoPreventivo('Rivelatori ottici di fumo', 'ri-rivelatori-ottici', d.rivelatori_ottici, 'number')}
        ${campoPreventivo('Rivelatori termici / termovelocimetrici', 'ri-rivelatori-termici', d.rivelatori_termici, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Multicriterio / gas / fiamma UV-IR', 'ri-rivelatori-speciali', d.rivelatori_speciali, 'number')}
        ${campoPreventivo('Barriere lineari ottiche', 'ri-barriere', d.barriere, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Portata barriere (metri)', 'ri-barriere-portata', d.barriere_portata, 'number')}
        ${campoPreventivo('Unità ASD / VESDA', 'ri-vesda-unita', d.vesda_unita, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Tubazione ASD / VESDA (ml)', 'ri-vesda-tubazione', d.vesda_tubazione, 'number')}
        ${campoPreventivo('Fori ASD / VESDA', 'ri-vesda-fori', d.vesda_fori, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Cavo termosensibile (ml)', 'ri-cavo-termosensibile', d.cavo_termosensibile, 'number')}
        ${campoPreventivo('Pulsanti manuali', 'ri-pulsanti-manuali', d.pulsanti_manuali, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Pannelli ottico-acustici / sirene', 'ri-sirene', d.sirene, 'number')}
        ${campoPreventivo('Targhe e cartellonistica', 'ri-cartellonistica', d.cartellonistica, 'number')}
      </div>
    </div>

    <div class="rap-section">4. Ambiente e vincoli</div>
    <div class="card">
      <div class="fr">
        ${campoPreventivo('Altezza soffitto / note per ambiente', 'ri-altezza', d.altezza, 'text', 'Es. magazzino 8 m, uffici 3 m')}
        ${selectPreventivo('Presenza ATEX?', 'ri-atex', d.atex || '', [
          { value: '', label: 'Seleziona' },
          { value: 'no', label: 'No' },
          { value: 'si', label: 'Sì' }
        ])}
      </div>

      <div class="fr">
        ${campoPreventivo('Superficie totale (mq)', 'ri-superficie', d.superficie, 'number')}
        ${campoPreventivo('N. locali / compartimenti', 'ri-locali', d.locali, 'number')}
      </div>

      ${areaPreventivo(
        'Travi, controsoffitti, pavimenti flottanti o sorveglianza sopra/sotto',
        'ri-struttura',
        d.struttura
      )}

      ${areaPreventivo(
        'Ambienti gravosi e grado IP richiesto',
        'ri-ambienti-gravosi',
        d.ambienti_gravosi,
        'Polveri, vapori, cucine, box auto, celle frigo, esterni, tettoie...'
      )}
    </div>

    <div class="rap-section">5. Cablaggio e posa</div>
    <div class="card">
      <div class="fr">
        ${campoPreventivo('Cavo schermato twistato (ml)', 'ri-cavo-schermato', d.cavo_schermato, 'number')}
        ${campoPreventivo('Cavo resistente al fuoco FTG18M / PH30-PH120 (ml)', 'ri-cavo-resistente', d.cavo_resistente, 'number')}
      </div>

      <div class="fr">
        ${selectPreventivo('Tipo di posa', 'ri-posa', d.posa || '', [
          { value: '', label: 'Seleziona' },
          { value: 'canalina_esistente', label: 'Canalina esistente' },
          { value: 'nuova_canalina', label: 'Nuova canalina' },
          { value: 'tubo_rigido', label: 'Tubo rigido' },
          { value: 'corrugato', label: 'Tubo corrugato' },
          { value: 'battiscopa', label: 'Battiscopa' },
          { value: 'vista', label: 'A vista' }
        ])}

        ${selectPreventivo('Canalizzazioni fornite e posate da', 'ri-canalizzazioni-da', d.canalizzazioni_da || '', [
          { value: '', label: 'Seleziona' },
          { value: 'noi', label: 'Noi' },
          { value: 'elettricista_cliente', label: 'Elettricista del cliente' }
        ])}
      </div>

      <div class="fr">
        ${campoPreventivo('Sigillature compartimenti (n.)', 'ri-sigillature', d.sigillature, 'number')}
        ${selectPreventivo('Altezza di lavoro', 'ri-altezza-lavoro', d.altezza_lavoro || '', [
          { value: '', label: 'Normale' },
          { value: 'trabattello', label: 'Trabattello' },
          { value: 'ple', label: 'PLE' }
        ])}
      </div>

      ${areaPreventivo(
        'Forature, ripristini estetici, pitturazione e altre note di posa',
        'ri-note-posa',
        d.note_posa
      )}
    </div>

    <div class="rap-section">6. Collaudo e manutenzione</div>
    <div class="card">
      ${areaPreventivo(
        'Collaudo, programmazione, prove fumo, comandi asserviti, documentazione e formazione',
        'ri-collaudo',
        d.collaudo,
        'Indica attività incluse e particolarità.'
      )}

      ${areaPreventivo(
        'Se manutenzione: consistenza impianto esistente, batterie, periodicità, reperibilità e durata contratto',
        'ri-manutenzione',
        d.manutenzione,
        'Centrali, loop, punti, marca/modello, batterie, sedi, ricambi obsoleti...'
      )}

      ${areaPreventivo(
        'Note interne per il calcolo',
        'ri-note-calcolo',
        d.note_calcolo,
        'Tempi stimati, numero squadre, giornate, margine suggerito...'
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaRilevazione()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaRilevazioneIncendi()">
        Salva scheda rilevazione
      </button>
    </div>
  `;
  // F15.6 (sql/80): dal progetto la scheda si compila nel motore, questa resta in sola lettura
  if (usaProgetto && typeof schedaVecchiaInSolaLettura === 'function') schedaVecchiaInSolaLettura('rilevazione_incendi');
   renderSchedePreventivo();
}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaRilevazioneIncendi() {
  return {
    tipo_intervento: v('ri-tipo-intervento'),
    progetto_esistente: v('ri-progetto-esistente'),
    sorveglianza: v('ri-sorveglianza'),
    marca: v('ri-marca'),
    centrale_tipo: v('ri-centrale-tipo'),
    loop: v('ri-loop'),
    indirizzi_loop: v('ri-indirizzi-loop'),
    margine_espansione: v('ri-margine-espansione'),
    accessori_centrale: v('ri-accessori-centrale'),
    comandi_terzi: v('ri-comandi-terzi'),
    interfacce: v('ri-interfacce'),
    rivelatori_ottici: v('ri-rivelatori-ottici'),
    rivelatori_termici: v('ri-rivelatori-termici'),
    rivelatori_speciali: v('ri-rivelatori-speciali'),
    barriere: v('ri-barriere'),
    barriere_portata: v('ri-barriere-portata'),
    vesda_unita: v('ri-vesda-unita'),
    vesda_tubazione: v('ri-vesda-tubazione'),
    vesda_fori: v('ri-vesda-fori'),
    cavo_termosensibile: v('ri-cavo-termosensibile'),
    pulsanti_manuali: v('ri-pulsanti-manuali'),
    sirene: v('ri-sirene'),
    cartellonistica: v('ri-cartellonistica'),
    altezza: v('ri-altezza'),
    atex: v('ri-atex'),
    superficie: v('ri-superficie'),
    locali: v('ri-locali'),
    struttura: v('ri-struttura'),
    ambienti_gravosi: v('ri-ambienti-gravosi'),
    cavo_schermato: v('ri-cavo-schermato'),
    cavo_resistente: v('ri-cavo-resistente'),
    posa: v('ri-posa'),
    canalizzazioni_da: v('ri-canalizzazioni-da'),
    sigillature: v('ri-sigillature'),
    altezza_lavoro: v('ri-altezza-lavoro'),
    note_posa: v('ri-note-posa'),
    collaudo: v('ri-collaudo'),
    manutenzione: v('ri-manutenzione'),
    note_calcolo: v('ri-note-calcolo')
  };
}

async function salvaSchedaRilevazioneIncendi() {
  const usaProgetto = contestoSchedaRilevazione === 'progetto';

  const riferimentoId = usaProgetto
    ? currentRilievoProgettoId
    : currentPreventivoId;

  if (!riferimentoId) {
    toast(
      usaProgetto
        ? 'Progetto tecnico non selezionato'
        : 'Preventivo non selezionato',
      'err'
    );
    return;
  }

  if (usaProgetto && typeof salvataggioSchedaVecchiaBloccato === 'function' && salvataggioSchedaVecchiaBloccato('rilevazione_incendi')) return;

  const dati = datiFormSchedaRilevazioneIncendi();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

 const tabella = usaProgetto
  ? 'progetti_tecnici_schede'
  : 'preventivi_schede_tecniche';

const riga = usaProgetto
  ? {
      progetto_tecnico_id: riferimentoId,
      famiglia: 'rilevazione_incendi',
      dati: dati,
      aggiornato_il: new Date().toISOString()
    }
  : {
      preventivo_id: riferimentoId,
      famiglia: 'rilevazione_incendi',
      dati: dati,
      aggiornato_il: new Date().toISOString()
    };

if (usaProgetto && ROLE === 'ingegnere') {
  riga.stato = 'bozza';
  riga.compilato_da = ME.id;
}

if (usaProgetto && ROLE === 'commerciale') {
  riga.ultima_modifica_commerciale_da = ME.id;
  riga.ultima_modifica_commerciale_il =
    new Date().toISOString();
}

const { error, salvate } = usaProgetto
  ? await salvaRigaSchedaRilievo(riga)
  : await db
    .from(tabella)
    .upsert(riga, { onConflict: 'preventivo_id,famiglia' });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

if (usaProgetto) {
  await dopoSalvataggioSchedaRilievo('Scheda rilevazione incendi salvata', salvate);
  return;
}

toast('Scheda rilevazione incendi salvata', 'ok');

await renderSchedePreventivo();
}

async function apriSchedaCompartimentazioneIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaCompartimentazione();
}

function chiudiSchedaCompartimentazione() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
   renderSchedePreventivo();
}

async function apriSchedaCompartimentazione(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('compartimentazione', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🧱 Compartimentazione
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Rilievo di attraversamenti, sigillature e ripristini antincendio.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaCompartimentazione()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Tipo di intervento</div>

    <div class="card">
      ${selectPreventivo('Intervento', 'cp-tipo-intervento', d.tipo_intervento || '', [
        { value: '', label: 'Seleziona' },
        { value: 'sigillatura_attraversamenti', label: 'Sigillatura attraversamenti' },
        { value: 'parete', label: 'Parete' },
        { value: 'controsoffitto', label: 'Controsoffitto' },
        { value: 'pavimento', label: 'Pavimento' },
        { value: 'giunto', label: 'Giunto' }
      ])}
    </div>

    <div class="rap-section">2. Resistenza al fuoco richiesta</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Classe richiesta', 'cp-classe', d.classe || '', [
          { value: '', label: 'Seleziona' },
          { value: 'ei', label: 'EI' },
          { value: 'rei', label: 'REI' }
        ])}

        ${selectPreventivo('Minuti', 'cp-minuti', d.minuti || '', [
          { value: '', label: 'Seleziona' },
          { value: '30', label: '30 minuti' },
          { value: '60', label: '60 minuti' },
          { value: '90', label: '90 minuti' },
          { value: '120', label: '120 minuti' },
          { value: 'superiore', label: 'Classe superiore / da definire' }
        ])}
      </div>
    </div>

    <div class="rap-section">3. Attraversamenti e supporto</div>

    <div class="card">
      <div class="fr">
        ${campoPreventivo('Numero attraversamenti', 'cp-numero-attraversamenti', d.numero_attraversamenti, 'number')}

        ${selectPreventivo('Tipo attraversamento', 'cp-tipo-attraversamento', d.tipo_attraversamento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'cavi', label: 'Cavi' },
          { value: 'tubazioni_metalliche', label: 'Tubazioni metalliche' },
          { value: 'tubazioni_plastiche', label: 'Tubazioni plastiche' },
          { value: 'canaline', label: 'Canaline' },
          { value: 'misti', label: 'Misti' }
        ])}
      </div>

      <div class="fr">
        ${campoPreventivo('Dimensioni foro (mm)', 'cp-dimensioni-foro', d.dimensioni_foro, 'text', 'Es. 300 × 200')}
        ${campoPreventivo('Spessore parete o solaio (mm)', 'cp-spessore-supporto', d.spessore_supporto, 'number')}
      </div>

      <div class="fr">
        ${selectPreventivo('Materiale supporto', 'cp-materiale-supporto', d.materiale_supporto || '', [
          { value: '', label: 'Seleziona' },
          { value: 'laterizio', label: 'Laterizio' },
          { value: 'cartongesso', label: 'Cartongesso' },
          { value: 'calcestruzzo', label: 'Calcestruzzo' },
          { value: 'altro', label: 'Altro' }
        ])}

        ${campoPreventivo(
          'Posizione attraversamenti',
          'cp-posizione',
          d.posizione,
          'text',
          'Es. piano primo, locale quadri, parete nord'
        )}
      </div>
    </div>

    <div class="rap-section">4. Sistema di sigillatura</div>

    <div class="card">
      ${areaPreventivo(
        'Isolamento, collari, manicotti, sacchetti o cuscini intumescenti',
        'cp-sistemi-presenti',
        d.sistemi_presenti
      )}

      <div class="fr">
        ${campoPreventivo(
          'Fattore di riempimento cavi / spazio disponibile',
          'cp-riempimento-cavi',
          d.riempimento_cavi,
          'text',
          'Es. canalina piena al 60%, spazio libero...'
        )}

        ${selectPreventivo('Necessità ripristino parete o controsoffitto', 'cp-ripristino', d.ripristino || '', [
          { value: '', label: 'Seleziona' },
          { value: 'si', label: 'Sì' },
          { value: 'no', label: 'No' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      ${areaPreventivo(
        'Certificazione richiesta e sistema scelto',
        'cp-certificazione-sistema',
        d.certificazione_sistema,
        'Es. certificazione EI 120, sistema Hilti / Promat / altro.'
      )}
    </div>

    <div class="rap-section">5. Pareti in cartongesso</div>

    <div class="card">
      <div style="font-size:12px;color:var(--m);margin-bottom:8px">
        Una riga per parete: misure, angoli (interni, esterni o entrambi) con
        la loro misura e il numero.
      </div>
      <div id="cp-pareti-righe">${htmlRighePareteCartongesso(d.pareti_cartongesso)}</div>
      <button class="btn sm" style="margin-top:8px" onclick="aggiungiPareteCartongesso()">+ Aggiungi parete</button>
    </div>

    <div class="rap-section">6. Accesso, foto e note</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Altezza di lavoro', 'cp-altezza-lavoro', d.altezza_lavoro || '', [
          { value: '', label: 'Seleziona' },
          { value: 'normale', label: 'Normale' },
          { value: 'trabattello', label: 'Trabattello' },
          { value: 'ple', label: 'PLE' },
          { value: 'da_verificare', label: 'Da verificare' }
        ])}

        ${campoPreventivo('Accessibilità', 'cp-accessibilita', d.accessibilita, 'text', 'Es. libera, limitata, locale occupato')}
      </div>

      ${areaPreventivo(
        'Foto ravvicinate e foto di contesto',
        'cp-foto',
        d.foto,
        'Indica le foto caricate negli allegati tecnici.'
      )}

      ${areaPreventivo(
        'Note tecniche per il preventivo',
        'cp-note-tecniche',
        d.note_tecniche
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaCompartimentazione()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaCompartimentazione()">
        Salva scheda compartimentazione
      </button>
    </div>
  `;
  // F15.7 (sql/81): la scheda si compila nel motore, questa resta in sola lettura
  if (typeof schedaVecchiaInSolaLettura === 'function') schedaVecchiaInSolaLettura('compartimentazione');
   renderSchedePreventivo();
}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaCompartimentazione() {
  return {
    tipo_intervento: v('cp-tipo-intervento'),
    classe: v('cp-classe'),
    minuti: v('cp-minuti'),
    numero_attraversamenti: v('cp-numero-attraversamenti'),
    tipo_attraversamento: v('cp-tipo-attraversamento'),
    dimensioni_foro: v('cp-dimensioni-foro'),
    spessore_supporto: v('cp-spessore-supporto'),
    materiale_supporto: v('cp-materiale-supporto'),
    posizione: v('cp-posizione'),
    sistemi_presenti: v('cp-sistemi-presenti'),
    riempimento_cavi: v('cp-riempimento-cavi'),
    ripristino: v('cp-ripristino'),
    certificazione_sistema: v('cp-certificazione-sistema'),
    altezza_lavoro: v('cp-altezza-lavoro'),
    accessibilita: v('cp-accessibilita'),
    foto: v('cp-foto'),
    note_tecniche: v('cp-note-tecniche'),
    pareti_cartongesso: leggiPareteCartongesso()
  };
}

// ── Pareti in cartongesso (richiesta di Erika del 02/11) ──────────────
// Righe ripetibili nella scheda Compartimentazione, salvate in
// dati.pareti_cartongesso come elenco: unità di misura, larghezza x
// altezza, angolo (interno / esterno / entrambi), misura e numero degli
// angoli. Misure con la virgola (leggiImportoPreventivo). Nessun campo
// obbligatorio; un elenco vuoto non si salva (null).
const ANGOLI_PARETE_CARTONGESSO = [
  { value: '', label: 'Nessun angolo' },
  { value: 'interno', label: 'Interno' },
  { value: 'esterno', label: 'Esterno' },
  { value: 'entrambi', label: 'Interno ed esterno' }
];
const UNITA_PARETE_CARTONGESSO = ['m²', 'ml', 'pz'];

function numeroParete(valore) {
  if (valore === null || valore === undefined || valore === '') return '';
  return importoConVirgolaPreventivo(valore);
}

function htmlRighePareteCartongesso(lista) {
  const righe = Array.isArray(lista) ? lista : [];
  if (!righe.length) {
    return '<div class="empty" style="padding:10px">Nessuna parete inserita.</div>';
  }
  return righe.map(function(r, i) {
    const campo = function(etichetta, nome, valore, segnaposto) {
      return '<div class="f"><label>' + etichetta + '</label><input type="text" inputmode="decimal" autocomplete="off" id="cp-par-' + i + '-' + nome +
        '" value="' + esc(numeroParete(valore)) + '" placeholder="' + (segnaposto || '') +
        '" oninput="virgolaCampoImportoPreventivo(this)" onpaste="incollaImportoPreventivo(event, this)"></div>';
    };
    const unita = r.unita || 'm²';
    return '<div style="border:1px solid var(--bo);border-radius:var(--rs);padding:10px;margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<b style="font-size:13px">Parete ' + (i + 1) + '</b>' +
        '<button class="btn sm" style="color:var(--r)" onclick="togliPareteCartongesso(' + i + ')">🗑️ Togli</button>' +
      '</div>' +
      '<div class="fr">' +
        '<div class="f"><label>Unità di misura</label><select id="cp-par-' + i + '-unita">' +
          UNITA_PARETE_CARTONGESSO.map(function(u) { return '<option value="' + u + '"' + (u === unita ? ' selected' : '') + '>' + u + '</option>'; }).join('') +
        '</select></div>' +
        campo('Larghezza (m)', 'larghezza', r.larghezza, 'Es. 4,50') +
        campo('Altezza (m)', 'altezza', r.altezza, 'Es. 2,70') +
      '</div>' +
      '<div class="fr">' +
        '<div class="f"><label>Angolo</label><select id="cp-par-' + i + '-angolo">' +
          ANGOLI_PARETE_CARTONGESSO.map(function(a) { return '<option value="' + a.value + '"' + (a.value === (r.angolo || '') ? ' selected' : '') + '>' + a.label + '</option>'; }).join('') +
        '</select></div>' +
        campo('Misura angolo (m)', 'misura_angolo', r.misura_angolo, 'Es. 2,70') +
        campo('Quantità angoli', 'quantita_angoli', r.quantita_angoli, 'Es. 2') +
      '</div>' +
    '</div>';
  }).join('');
}

// Righe scritte nel modulo (anche quelle ancora vuote, per ridisegnarle).
function righeModuloPareteCartongesso() {
  const righe = [];
  for (let i = 0; ge('cp-par-' + i + '-unita'); i++) {
    const num = function(nome) {
      const testo = v('cp-par-' + i + '-' + nome).trim();
      return testo ? leggiImportoPreventivo(testo) : null;
    };
    righe.push({
      unita: v('cp-par-' + i + '-unita') || 'm²',
      larghezza: num('larghezza'),
      altezza: num('altezza'),
      angolo: v('cp-par-' + i + '-angolo') || '',
      misura_angolo: num('misura_angolo'),
      quantita_angoli: num('quantita_angoli')
    });
  }
  return righe;
}

function leggiPareteCartongesso() {
  const piene = righeModuloPareteCartongesso().filter(function(r) {
    return r.larghezza !== null || r.altezza !== null || r.angolo || r.misura_angolo !== null || r.quantita_angoli !== null;
  });
  return piene.length ? piene : null;
}

function aggiungiPareteCartongesso() {
  const righe = righeModuloPareteCartongesso();
  righe.push({ unita: 'm²', larghezza: null, altezza: null, angolo: '', misura_angolo: null, quantita_angoli: null });
  const box = ge('cp-pareti-righe');
  if (box) box.innerHTML = htmlRighePareteCartongesso(righe);
  // F15.7: anche nel motore delle schede (js/56) il tab risulta modificato
  if (typeof segnaSchedaRilievoModificata === 'function') segnaSchedaRilievoModificata();
}

function togliPareteCartongesso(indice) {
  const righe = righeModuloPareteCartongesso();
  righe.splice(indice, 1);
  const box = ge('cp-pareti-righe');
  if (box) box.innerHTML = htmlRighePareteCartongesso(righe);
  if (typeof segnaSchedaRilievoModificata === 'function') segnaSchedaRilievoModificata();
}

// Testo leggibile di una parete (preventivo, copia commerciale, PDF).
function testoPareteCartongesso(r, i) {
  const n = function(x) { return x === null || x === undefined || x === '' ? '—' : importoConVirgolaPreventivo(x); };
  const angolo = (ANGOLI_PARETE_CARTONGESSO.find(function(a) { return a.value === (r.angolo || ''); }) || {}).label || '';
  let testo = 'Parete ' + (i + 1) + ': ' + n(r.larghezza) + ' × ' + n(r.altezza) + ' m (' + (r.unita || 'm²') + ')';
  if (r.angolo) {
    testo += ' · angolo ' + angolo.toLowerCase() + ': ' + n(r.misura_angolo) + ' m, n. ' + n(r.quantita_angoli);
  }
  return testo;
}

async function salvaSchedaCompartimentazione() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  if (typeof salvataggioSchedaVecchiaBloccato === 'function' && salvataggioSchedaVecchiaBloccato('compartimentazione')) return;

  const dati = datiFormSchedaCompartimentazione();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const { error, salvate } = await salvaRigaSchedaRilievo({
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'compartimentazione',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda compartimentazione salvata', salvate);
}

async function apriSchedaVerniceIntumescenteIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaVerniceIntumescente();
}

function chiudiSchedaVerniceIntumescente() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
   renderSchedePreventivo();
}

async function apriSchedaVerniceIntumescente(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('vernice_intumescente', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🎨 Vernice intumescente
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Rilievo per protezione passiva di strutture metalliche.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaVerniceIntumescente()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Elementi da proteggere</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Elemento da proteggere', 'vi-elemento', d.elemento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'pilastro', label: 'Pilastro' },
          { value: 'trave', label: 'Trave' },
          { value: 'solaio', label: 'Solaio' },
          { value: 'struttura_metallica', label: 'Struttura metallica' }
        ])}

        ${selectPreventivo('Classe R richiesta', 'vi-classe-r', d.classe_r || '', [
          { value: '', label: 'Seleziona' },
          { value: 'r30', label: 'R30' },
          { value: 'r60', label: 'R60' },
          { value: 'r90', label: 'R90' },
          { value: 'r120', label: 'R120' },
          { value: 'altro', label: 'Altro / da definire' }
        ])}
      </div>

      <div class="fr">
        ${campoPreventivo(
          'Tipo e dimensione profilo metallico',
          'vi-profilo',
          d.profilo,
          'text',
          'Es. HEA 200, IPE 160, tubolare 100×100'
        )}

        ${campoPreventivo('Numero elementi', 'vi-numero-elementi', d.numero_elementi, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo(
          'Sviluppo lineare (m)',
          'vi-sviluppo-lineare',
          d.sviluppo_lineare,
          'number'
        )}

        ${campoPreventivo(
          'Superficie da trattare (mq)',
          'vi-superficie',
          d.superficie,
          'number'
        )}
      </div>

      ${campoPreventivo(
        'Fattore di sezione S/V o A/V',
        'vi-fattore-sezione',
        d.fattore_sezione,
        'text',
        'Se disponibile'
      )}
    </div>

    <div class="rap-section">2. Stato e preparazione supporto</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Stato del supporto', 'vi-stato-supporto', d.stato_supporto || '', [
          { value: '', label: 'Seleziona' },
          { value: 'zincato', label: 'Zincato' },
          { value: 'verniciato', label: 'Verniciato' },
          { value: 'ossidato', label: 'Ossidato' },
          { value: 'da_preparare', label: 'Da preparare' }
        ])}

        ${selectPreventivo('Preparazione richiesta', 'vi-preparazione', d.preparazione || '', [
          { value: '', label: 'Seleziona' },
          { value: 'pulizia', label: 'Pulizia' },
          { value: 'sabbiatura', label: 'Sabbiatura' },
          { value: 'primer', label: 'Primer' },
          { value: 'trattamento_ruggine', label: 'Trattamento ruggine' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      ${areaPreventivo(
        'Note su supporto, ossidazione, vecchie vernici o preparazioni particolari',
        'vi-note-supporto',
        d.note_supporto
      )}
    </div>

    <div class="rap-section">3. Ambiente e posa</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Condizioni ambientali', 'vi-ambiente', d.ambiente || '', [
          { value: '', label: 'Seleziona' },
          { value: 'interno', label: 'Interno' },
          { value: 'esterno', label: 'Esterno' },
          { value: 'umidita', label: 'Umidità elevata' },
          { value: 'temperatura_critica', label: 'Temperatura critica' }
        ])}

        ${selectPreventivo('Altezza / mezzo di sollevamento', 'vi-altezza-lavoro', d.altezza_lavoro || '', [
          { value: '', label: 'Seleziona' },
          { value: 'normale', label: 'Normale' },
          { value: 'trabattello', label: 'Trabattello' },
          { value: 'ple', label: 'PLE' },
          { value: 'ponteggio', label: 'Ponteggio' }
        ])}
      </div>

      ${areaPreventivo(
        'Accessibilità, ostacoli e vincoli di cantiere',
        'vi-accessibilita',
        d.accessibilita
      )}
    </div>

    <div class="rap-section">4. Ciclo e finitura</div>

    <div class="card">
      ${areaPreventivo(
        'Ciclo richiesto: primer, intumescente, finitura',
        'vi-ciclo',
        d.ciclo,
        'Indica prodotti o ciclo richiesto, se già definito.'
      )}

      <div class="fr">
        ${campoPreventivo(
          'Colore finale / RAL',
          'vi-colore',
          d.colore,
          'text',
          'Es. RAL 9010'
        )}

        ${campoPreventivo(
          'Requisito estetico',
          'vi-requisito-estetico',
          d.requisito_estetico,
          'text',
          'Es. finitura liscia, ambiente a vista'
        )}
      </div>
    </div>

    <div class="rap-section">5. Foto, certificazione e note</div>

    <div class="card">
      ${areaPreventivo(
        'Foto, misure e dettagli dei profili',
        'vi-foto',
        d.foto,
        'Indica le foto caricate negli allegati tecnici.'
      )}

      ${areaPreventivo(
        'Certificazione e dichiarazione di corretta posa',
        'vi-certificazione',
        d.certificazione
      )}

      ${areaPreventivo(
        'Note tecniche per il preventivo',
        'vi-note-tecniche',
        d.note_tecniche
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaVerniceIntumescente()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaVerniceIntumescente()">
        Salva scheda vernice intumescente
      </button>
    </div>
  `;
  // F15.7 (sql/81): la scheda si compila nel motore, questa resta in sola lettura
  if (typeof schedaVecchiaInSolaLettura === 'function') schedaVecchiaInSolaLettura('vernice_intumescente');
   renderSchedePreventivo();

}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaVerniceIntumescente() {
  return {
    elemento: v('vi-elemento'),
    classe_r: v('vi-classe-r'),
    profilo: v('vi-profilo'),
    numero_elementi: v('vi-numero-elementi'),
    sviluppo_lineare: v('vi-sviluppo-lineare'),
    superficie: v('vi-superficie'),
    fattore_sezione: v('vi-fattore-sezione'),
    stato_supporto: v('vi-stato-supporto'),
    preparazione: v('vi-preparazione'),
    note_supporto: v('vi-note-supporto'),
    ambiente: v('vi-ambiente'),
    altezza_lavoro: v('vi-altezza-lavoro'),
    accessibilita: v('vi-accessibilita'),
    ciclo: v('vi-ciclo'),
    colore: v('vi-colore'),
    requisito_estetico: v('vi-requisito-estetico'),
    foto: v('vi-foto'),
    certificazione: v('vi-certificazione'),
    note_tecniche: v('vi-note-tecniche')
  };
}

async function salvaSchedaVerniceIntumescente() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  if (typeof salvataggioSchedaVecchiaBloccato === 'function' && salvataggioSchedaVecchiaBloccato('vernice_intumescente')) return;

  const dati = datiFormSchedaVerniceIntumescente();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const { error, salvate } = await salvaRigaSchedaRilievo({
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'vernice_intumescente',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda vernice intumescente salvata', salvate);
}


// ── Scheda "Coppelle" (protezione antincendio delle tubazioni) ───────
// Richiesta di Erika del 28/10: stessa struttura delle altre schede
// dell'ingegnere (tabella progetti_tecnici_schede, famiglia 'coppelle').
// Nessun campo obbligatorio.
async function apriSchedaCoppelleIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaCoppelle();
}

function chiudiSchedaCoppelle() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
  renderSchedePreventivo();
}

async function apriSchedaCoppelle(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('coppelle', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          🔥 Coppelle
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Rilievo per la protezione antincendio delle tubazioni con coppelle.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaCoppelle()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Tubazioni da proteggere</div>

    <div class="card">
      ${selectPreventivo('Tipo di intervento', 'co-tipo-intervento', d.tipo_intervento || '', [
        { value: '', label: 'Seleziona' },
        { value: 'nuova_posa', label: 'Nuova posa' },
        { value: 'sostituzione', label: 'Sostituzione coppelle esistenti' },
        { value: 'integrazione', label: 'Integrazione / ripristino' }
      ])}

      <div class="fr">
        ${selectPreventivo('Materiale della tubazione', 'co-materiale-tubazione', d.materiale_tubazione || '', [
          { value: '', label: 'Seleziona' },
          { value: 'acciaio', label: 'Acciaio' },
          { value: 'rame', label: 'Rame' },
          { value: 'ghisa', label: 'Ghisa' },
          { value: 'plastica', label: 'Plastica (PVC, PE, PP)' },
          { value: 'multistrato', label: 'Multistrato' },
          { value: 'altro', label: 'Altro / da definire' }
        ])}

        ${selectPreventivo('Uso / fluido', 'co-uso-tubazione', d.uso_tubazione || '', [
          { value: '', label: 'Seleziona' },
          { value: 'acqua', label: 'Acqua (sanitaria / riscaldamento)' },
          { value: 'antincendio', label: 'Rete antincendio' },
          { value: 'gas', label: 'Gas' },
          { value: 'scarichi', label: 'Scarichi' },
          { value: 'vapore', label: 'Vapore / alta temperatura' },
          { value: 'altro', label: 'Altro' }
        ])}
      </div>

      <div class="fr">
        ${campoPreventivo('Diametro esterno tubazione (mm)', 'co-diametro', d.diametro, 'text', 'Es. 48, 60, 114 (anche più diametri)')}
        ${campoPreventivo('Lunghezza da rivestire (m)', 'co-lunghezza', d.lunghezza, 'number')}
      </div>

      <div class="fr">
        ${campoPreventivo('Numero di tratti / tubazioni', 'co-numero-tratti', d.numero_tratti, 'number')}
        ${campoPreventivo('Spessore coppella (mm)', 'co-spessore', d.spessore, 'text', 'Se richiesto o da certificato')}
      </div>
    </div>

    <div class="rap-section">2. Resistenza e reazione al fuoco</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Classe di resistenza al fuoco', 'co-classe-resistenza', d.classe_resistenza || '', [
          { value: '', label: 'Seleziona' },
          { value: 'EI 30', label: 'EI 30' },
          { value: 'EI 60', label: 'EI 60' },
          { value: 'EI 90', label: 'EI 90' },
          { value: 'EI 120', label: 'EI 120' },
          { value: 'EI 180', label: 'EI 180' },
          { value: 'altro', label: 'Altro / da definire' }
        ])}

        ${selectPreventivo('Reazione al fuoco richiesta', 'co-reazione-fuoco', d.reazione_fuoco || '', [
          { value: '', label: 'Seleziona' },
          { value: 'A1', label: 'A1' },
          { value: 'A2-s1,d0', label: 'A2-s1,d0' },
          { value: 'BL-s1,d0', label: 'BL-s1,d0' },
          { value: 'non_richiesta', label: 'Non richiesta' },
          { value: 'da_definire', label: 'Da definire' }
        ])}
      </div>

      <div class="fr">
        ${selectPreventivo('Parete o solaio attraversato', 'co-supporto-attraversato', d.supporto_attraversato || '', [
          { value: '', label: 'Seleziona' },
          { value: 'nessuno', label: 'Nessun attraversamento' },
          { value: 'muratura', label: 'Parete in muratura / calcestruzzo' },
          { value: 'cartongesso', label: 'Parete in cartongesso' },
          { value: 'solaio', label: 'Solaio' },
          { value: 'misto', label: 'Più tipi' }
        ])}

        ${campoPreventivo('Numero di attraversamenti', 'co-numero-attraversamenti', d.numero_attraversamenti_coppelle, 'number')}
      </div>

      ${selectPreventivo('Finitura esterna', 'co-finitura', d.finitura || '', [
        { value: '', label: 'Seleziona' },
        { value: 'nessuna', label: 'Nessuna' },
        { value: 'alluminio', label: 'Alluminio' },
        { value: 'pvc', label: 'PVC' },
        { value: 'lamierino', label: 'Lamierino' },
        { value: 'altro', label: 'Altro' }
      ])}
    </div>

    <div class="rap-section">3. Ambiente, ostacoli e mezzi</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Ambiente', 'co-ambiente', d.ambiente || '', [
          { value: '', label: 'Seleziona' },
          { value: 'interno', label: 'Interno' },
          { value: 'esterno', label: 'Esterno' },
          { value: 'cavedio', label: 'Cavedio / vano tecnico' },
          { value: 'controsoffitto', label: 'Sopra controsoffitto' },
          { value: 'umidita', label: 'Umidità elevata' }
        ])}

        ${selectPreventivo('Altezza / mezzo di sollevamento', 'co-altezza-lavoro', d.altezza_lavoro || '', [
          { value: '', label: 'Seleziona' },
          { value: 'normale', label: 'Normale' },
          { value: 'trabattello', label: 'Trabattello' },
          { value: 'PLE', label: 'PLE' },
          { value: 'ponteggio', label: 'Ponteggio' }
        ])}
      </div>

      ${areaPreventivo(
        'Ostacoli e interferenze',
        'co-ostacoli',
        d.ostacoli,
        'Es. canaline, cavi, altri impianti, staffaggi, controsoffitti da aprire'
      )}

      ${areaPreventivo(
        'Accessibilità e vincoli di cantiere',
        'co-accessibilita',
        d.accessibilita
      )}
    </div>

    <div class="rap-section">4. Foto, certificazione e note</div>

    <div class="card">
      ${areaPreventivo(
        'Foto e misure delle tubazioni',
        'co-foto',
        d.foto,
        'Indica le foto caricate negli allegati tecnici.'
      )}

      ${areaPreventivo(
        'Certificazione e dichiarazione di corretta posa',
        'co-certificazione',
        d.certificazione
      )}

      ${areaPreventivo(
        'Note tecniche per il preventivo',
        'co-note-tecniche',
        d.note_tecniche
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaCoppelle()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaCoppelle()">
        Salva scheda coppelle
      </button>
    </div>
  `;
  // F15.7 (sql/81): la scheda si compila nel motore, questa resta in sola lettura
  if (typeof schedaVecchiaInSolaLettura === 'function') schedaVecchiaInSolaLettura('coppelle');
  renderSchedePreventivo();
}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaCoppelle() {
  return {
    tipo_intervento: v('co-tipo-intervento'),
    materiale_tubazione: v('co-materiale-tubazione'),
    uso_tubazione: v('co-uso-tubazione'),
    diametro: v('co-diametro'),
    lunghezza: v('co-lunghezza'),
    numero_tratti: v('co-numero-tratti'),
    spessore: v('co-spessore'),
    classe_resistenza: v('co-classe-resistenza'),
    reazione_fuoco: v('co-reazione-fuoco'),
    supporto_attraversato: v('co-supporto-attraversato'),
    numero_attraversamenti_coppelle: v('co-numero-attraversamenti'),
    finitura: v('co-finitura'),
    ambiente: v('co-ambiente'),
    altezza_lavoro: v('co-altezza-lavoro'),
    ostacoli: v('co-ostacoli'),
    accessibilita: v('co-accessibilita'),
    foto: v('co-foto'),
    certificazione: v('co-certificazione'),
    note_tecniche: v('co-note-tecniche')
  };
}

async function salvaSchedaCoppelle() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  if (typeof salvataggioSchedaVecchiaBloccato === 'function' && salvataggioSchedaVecchiaBloccato('coppelle')) return;

  const dati = datiFormSchedaCoppelle();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const { error, salvate } = await salvaRigaSchedaRilievo({
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'coppelle',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda coppelle salvata', salvate);
}

async function apriSchedaImpiantiSpegnimentoIngegnere() {
  ricordaPosizionePagina();
  const progettoId = v('mvt-id');

  if (!progettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  currentRilievoProgettoId = progettoId;
  schedaRilievoAperta = null; // schede e bozze ripartono da zero

  openM('m-rilievo-tecnico');
  await apriSchedaImpiantiSpegnimento();
}

function chiudiSchedaImpiantiSpegnimento() {
  if (!confermaChiusuraSchedeRilievo()) return;
  closeM('m-rilievo-tecnico');
   renderSchedePreventivo();

}

async function apriSchedaImpiantiSpegnimento(numero) {
  ricordaPosizionePagina();
  const box = ge('mrt-content');

  const lettura = await leggiSchedaRilievo('impianti_spegnimento', numero);

  if (lettura.error) {
    toast('Errore apertura scheda: ' + lettura.error.message, 'err');
    return;
  }

  const d = lettura.dati;

  box.innerHTML = htmlBarraSchedeRilievo() + `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:700">
          💧 Impianti di spegnimento
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Rilievo per impianti idrici e sistemi di spegnimento speciali.
        </div>
      </div>

      <button class="btn sm" onclick="chiudiSchedaImpiantiSpegnimento()">
        ← Indietro
      </button>
    </div>

    <div class="rap-section">1. Impianto e intervento</div>

    <div class="card">
      <div class="fr">
        ${selectPreventivo('Tipo impianto', 'is-tipo-impianto', d.tipo_impianto || '', [
          { value: '', label: 'Seleziona' },
          { value: 'idranti', label: 'Idranti' },
          { value: 'naspi', label: 'Naspi' },
          { value: 'sprinkler', label: 'Sprinkler' },
          { value: 'water_mist', label: 'Water mist' },
          { value: 'gas', label: 'Gas' },
          { value: 'schiuma', label: 'Schiuma' },
          { value: 'altro', label: 'Altro' }
        ])}

        ${selectPreventivo('Tipo intervento', 'is-tipo-intervento', d.tipo_intervento || '', [
          { value: '', label: 'Seleziona' },
          { value: 'nuovo', label: 'Nuovo impianto' },
          { value: 'ampliamento', label: 'Ampliamento' },
          { value: 'adeguamento', label: 'Adeguamento' },
          { value: 'manutenzione', label: 'Manutenzione' }
        ])}
      </div>

      ${campoPreventivo(
        'Area o compartimento da proteggere',
        'is-area-protetta',
        d.area_protetta,
        'text',
        'Es. magazzino 1.200 mq, locale tecnico, piano terra'
      )}

      ${campoPreventivo(
        'Normativa o livello prestazionale richiesto',
        'is-normativa',
        d.normativa,
        'text',
        'Es. UNI 10779, UNI EN 12845, livello di pericolo...'
      )}
    </div>

    <div class="rap-section">2. Impianto esistente e alimentazione</div>

    <div class="card">
      ${areaPreventivo(
        'Impianto esistente: marca, modello, anno, stato e documentazione',
        'is-impianto-esistente',
        d.impianto_esistente,
        'Indica anche se assente o non documentato.'
      )}

      <div class="fr">
        ${selectPreventivo('Alimentazione idrica disponibile', 'is-alimentazione', d.alimentazione || '', [
          { value: '', label: 'Seleziona' },
          { value: 'acquedotto', label: 'Acquedotto' },
          { value: 'serbatoio', label: 'Serbatoio' },
          { value: 'gruppo_pompe', label: 'Gruppo pompe' },
          { value: 'altro', label: 'Altro / da verificare' }
        ])}

        ${campoPreventivo(
          'Pressione disponibile',
          'is-pressione',
          d.pressione,
          'text',
          'Es. 4 bar'
        )}
      </div>

      <div class="fr">
        ${campoPreventivo(
          'Portata disponibile',
          'is-portata',
          d.portata,
          'text',
          'Es. 300 l/min'
        )}

        ${campoPreventivo(
          'Riserva idrica disponibile',
          'is-riserva',
          d.riserva,
          'text',
          'Es. 20 mc'
        )}
      </div>
    </div>

    <div class="rap-section">3. Rete e componenti</div>

    <div class="card">
      ${areaPreventivo(
        'Numero e tipo componenti',
        'is-componenti',
        d.componenti,
        'Idranti, naspi, sprinkler, valvole, stazioni, attacchi VV.F...'
      )}

      <div class="fr">
        ${campoPreventivo(
          'Rete esistente e materiale tubazioni',
          'is-rete-esistente',
          d.rete_esistente,
          'text',
          'Es. acciaio zincato DN65, PEAD...'
        )}

        ${campoPreventivo(
          'Percorsi, lunghezze e posa tubazioni',
          'is-percorsi-tubazioni',
          d.percorsi_tubazioni,
          'text',
          'Es. 120 ml a vista in quota'
        )}
      </div>

      ${areaPreventivo(
        'Attraversamenti e opere di compartimentazione correlate',
        'is-compartimentazione',
        d.compartimentazione
      )}

      ${areaPreventivo(
        'Collegamenti a centrale incendio, allarmi o supervisione',
        'is-collegamenti',
        d.collegamenti
      )}
    </div>

    <div class="rap-section">4. Manutenzione, prove e documenti</div>

    <div class="card">
      ${areaPreventivo(
        'Accessibilità per manutenzione e prove',
        'is-accessibilita',
        d.accessibilita
      )}

      ${areaPreventivo(
        'Collaudi richiesti: idraulico, funzionale, certificazioni',
        'is-collaudi',
        d.collaudi
      )}
    </div>

    <div class="rap-section">5. Foto e note</div>

    <div class="card">
      ${areaPreventivo(
        'Foto locale pompe, rete, terminali e criticità',
        'is-foto',
        d.foto,
        'Indica le foto caricate negli allegati tecnici.'
      )}

      ${areaPreventivo(
        'Note tecniche per il preventivo',
        'is-note-tecniche',
        d.note_tecniche
      )}
    </div>

    <div class="ma" style="margin:18px 0 40px">
      <button class="btn" onclick="chiudiSchedaImpiantiSpegnimento()">
        Annulla
      </button>

      <button class="btn p" onclick="salvaSchedaImpiantiSpegnimento()">
        Salva scheda impianti di spegnimento
      </button>
    </div>
  `;
  // F15.7 (sql/81): la scheda si compila nel motore, questa resta in sola lettura
  if (typeof schedaVecchiaInSolaLettura === 'function') schedaVecchiaInSolaLettura('impianti_spegnimento');
   renderSchedePreventivo();

}

// Valori del modulo della scheda (servono anche per passare da un
// tab all'altro senza perdere quello che si è scritto, sql/48).
function datiFormSchedaImpiantiSpegnimento() {
  return {
    tipo_impianto: v('is-tipo-impianto'),
    tipo_intervento: v('is-tipo-intervento'),
    area_protetta: v('is-area-protetta'),
    normativa: v('is-normativa'),
    impianto_esistente: v('is-impianto-esistente'),
    alimentazione: v('is-alimentazione'),
    pressione: v('is-pressione'),
    portata: v('is-portata'),
    riserva: v('is-riserva'),
    componenti: v('is-componenti'),
    rete_esistente: v('is-rete-esistente'),
    percorsi_tubazioni: v('is-percorsi-tubazioni'),
    compartimentazione: v('is-compartimentazione'),
    collegamenti: v('is-collegamenti'),
    accessibilita: v('is-accessibilita'),
    collaudi: v('is-collaudi'),
    foto: v('is-foto'),
    note_tecniche: v('is-note-tecniche')
  };
}

async function salvaSchedaImpiantiSpegnimento() {
  if (!currentRilievoProgettoId) {
    toast('Progetto tecnico non selezionato', 'err');
    return;
  }

  if (typeof salvataggioSchedaVecchiaBloccato === 'function' && salvataggioSchedaVecchiaBloccato('impianti_spegnimento')) return;

  const dati = datiFormSchedaImpiantiSpegnimento();

  // Nessun campo obbligatorio nelle schede tecniche (decisione di Erika del 28/10)

  const { error, salvate } = await salvaRigaSchedaRilievo({
    progetto_tecnico_id: currentRilievoProgettoId,
    famiglia: 'impianti_spegnimento',
    dati: dati,
    stato: 'bozza',
    compilato_da: ME.id,
    aggiornato_il: new Date().toISOString()
  });

  if (error) {
    toast('Errore salvataggio scheda: ' + error.message, 'err');
    return;
  }

  await dopoSalvataggioSchedaRilievo('Scheda impianti di spegnimento salvata', salvate);
}
