// =====================================================================
// F9.1 — DICHIARAZIONE DI CORRETTA MESSA IN OPERA (passo 12).
// La segreteria (o il titolare), con la commessa in "fine lavori",
// genera il PDF della dichiarazione dai dati già presenti nel
// gestionale, SENZA riscriverli: committente e sede (clienti,
// sedi_cliente), riferimenti della commessa (codice, preventivo,
// progetto), periodo dei lavori (inizio dal faldone, sql/33; fine dallo
// storico, sql/28), lavorazioni e prodotti dalle voci del preventivo
// accettato SENZA prezzi (scheda_cantiere_commessa, sql/34) e, se ci
// sono, dalle voci dei lavori extra accettati (sql/38) e dagli ordini ai
// fornitori (sql/30); certificati caricati sul preventivo
// (preventivi_certificati) e nella cartella "Certificati" della commessa
// (sql/29). Classi di resistenza al fuoco (REI, EI...), reazione al
// fuoco, classi degli estintori, norme UNI/EN e omologazioni si leggono
// dalle descrizioni delle voci, se scritte lì: nessun campo nuovo.
// Prima di generare si possono solo togliere voci, scrivere note,
// indicare il nome del responsabile tecnico e adattare testo e
// riferimenti normativi (predefiniti, da confermare da Toli).
// Il PDF si scarica e si salva nella cartella "Chiusura" della commessa
// (bucket commesse-documenti, registra_documento_commessa di sql/29),
// come il PDF dell'ordine di js/27.
// Box cmd-dichiarazione nella scheda della commessa (js/26), finestra
// m-dichiarazione-posa. Nessun SQL nuovo. Le fonti assenti si ignorano.
// =====================================================================

// Chi genera la dichiarazione (passo 12). Capo tecnico: da decidere (Toli).
const RUOLI_DICHIARAZIONE_POSA = ['titolare', 'segreteria'];
const STATI_DICHIARAZIONE_POSA = ['fine_lavori', 'chiusa'];
const PREFISSO_FILE_DICHIARAZIONE_POSA = 'Dichiarazione_messa_in_opera_';

// Testi predefiniti, modificabili nella finestra prima di generare.
// DA CONFERMARE DA TOLI (testo e riferimenti normativi).
const TESTO_DICHIARAZIONE_POSA_PREDEFINITO =
  'La sottoscritta impresa TOLI FIRE, nella persona del responsabile tecnico sottoscritto, ' +
  'DICHIARA che, presso il luogo dei lavori sopra indicato e nell\'ambito della commessa indicata, ' +
  'le lavorazioni e i prodotti elencati nel presente documento sono stati posati in opera e installati ' +
  'a regola d\'arte, secondo le istruzioni del fabbricante e nel rispetto delle condizioni previste ' +
  'dalle relative certificazioni, rapporti di classificazione, omologazioni e schede tecniche, ' +
  'nonché della normativa di prevenzione incendi applicabile, di cui si richiamano i principali riferimenti.';

const NORMATIVA_DICHIARAZIONE_POSA_PREDEFINITA = [
  '- D.M. 3 agosto 2015 e s.m.i. – Norme tecniche di prevenzione incendi (Codice di prevenzione incendi);',
  '- D.M. 7 agosto 2012 – Documentazione tecnica allegata alle istanze di prevenzione incendi (certificazioni e dichiarazioni di corretta posa in opera);',
  '- D.M. 16 febbraio 2007 – Classificazione di resistenza al fuoco di prodotti ed elementi costruttivi;',
  '- D.M. 21 giugno 2004 – Porte ed altri elementi di chiusura resistenti al fuoco (ove applicabile);',
  '- Regolamento (UE) n. 305/2011 e Regolamento (UE) 2024/3110 – Prodotti da costruzione e marcatura CE (ove applicabile);',
  '- D.M. 1 settembre 2021 – Controllo e manutenzione di impianti, attrezzature e altri sistemi di sicurezza antincendio;',
  '- D.M. 2 settembre 2021 – Gestione della sicurezza antincendio in esercizio e in emergenza.'
].join('\n');

const TESTO_LIMITI_DICHIARAZIONE_POSA =
  'La presente dichiarazione riguarda esclusivamente le lavorazioni e i prodotti sopra elencati, ' +
  'forniti e/o posati in opera da TOLI FIRE nell\'ambito della commessa indicata. Non riguarda opere, ' +
  'prodotti o impianti preesistenti o di terzi, né eventuali manomissioni o modifiche successive alla posa.';

let commessaDichiarazionePosa = null;  // commessa del box
let dichiarazionePosaAperta = null;    // dati della finestra

// ── Chi e quando ────────────────────────────────────────────────────
function puoGenerareDichiarazionePosa(commessa) {
  return !!commessa && RUOLI_DICHIARAZIONE_POSA.includes(ROLE) &&
    statiCommessaDisponibili === true && STATI_DICHIARAZIONE_POSA.includes(commessa.stato);
}

// Salvataggio nella cartella: stesse regole di registra_documento_commessa.
function puoSalvareDichiarazionePosa(commessa) {
  if (typeof documentiCommessaDisponibili === 'undefined' || documentiCommessaDisponibili !== true) return false;
  return typeof puoCaricareDocumentiCommessa === 'function' && puoCaricareDocumentiCommessa(commessa);
}

function dichiarazioniPosaSalvate(commessa) {
  if (typeof documentiCommessaAperta === 'undefined' || !commessa) return [];
  return (documentiCommessaAperta || []).filter(function(d) {
    return d.cartella === 'chiusura' && String(d.nome_file || '').indexOf(PREFISSO_FILE_DICHIARAZIONE_POSA) === 0;
  });
}

// ── Box nella scheda della commessa (chiamata da js/26) ─────────────
async function caricaDichiarazioneCommessa(commessa) {
  const box = ge('cmd-dichiarazione');
  if (!box) return;
  box.innerHTML = '';
  commessaDichiarazionePosa = null;
  if (!puoGenerareDichiarazionePosa(commessa)) return;
  commessaDichiarazionePosa = commessa;

  const salvate = dichiarazioniPosaSalvate(commessa);
  const salva = puoSalvareDichiarazionePosa(commessa);

  box.innerHTML = `
    <div class="card">
      <div style="font-size:14px;font-weight:700">📄 Dichiarazione di corretta messa in opera</div>
      <div style="font-size:12px;color:var(--m);margin-top:2px">
        PDF precompilato con committente, sede, lavorazioni, prodotti e certificati della commessa (senza prezzi).
        Prima di generarlo puoi solo togliere voci e aggiungere note.
      </div>
      ${salvate.length ? `
        <div style="font-size:13px;margin-top:8px">✅ ${salvate.length === 1 ? 'Una dichiarazione salvata' : salvate.length + ' dichiarazioni salvate'} nella cartella Chiusura
          (ultima: ${esc(new Date(salvate[0].caricato_il).toLocaleDateString('it-IT'))}${salvate[0].caricato_da_nome ? ', ' + esc(salvate[0].caricato_da_nome) : ''}).</div>
      ` : `
        <div style="font-size:13px;margin-top:8px;color:var(--a)">⚠️ Nessuna dichiarazione ancora salvata nella cartella Chiusura.</div>
      `}
      ${!salva && typeof documentiCommessaDisponibili !== 'undefined' && documentiCommessaDisponibili !== true
        ? '<div style="font-size:11px;color:var(--m);margin-top:4px">La cartella documenti non è attiva: il PDF si può solo scaricare.</div>' : ''}
      ${!salva && commessa.stato === 'chiusa' && ROLE !== 'titolare'
        ? '<div style="font-size:11px;color:var(--m);margin-top:4px">Commessa chiusa: il PDF si può scaricare; salvarlo nella cartella lo può fare solo il titolare.</div>' : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        <button class="btn sm p" id="cmd-dichiarazione-apri" onclick="apriDichiarazionePosa()">📄 ${salvate.length ? 'Genera di nuovo la dichiarazione' : 'Prepara la dichiarazione'}</button>
      </div>
    </div>
  `;
}

// ── Classificazioni lette dalle descrizioni ─────────────────────────
// Solo ciò che è già scritto nella voce: nessun dato inventato.
function classificazioniDaDescrizione(testo) {
  const t = String(testo || '');
  const trovate = [];
  function aggiungi(x) {
    const pulito = String(x).replace(/\s+/g, ' ').trim();
    if (pulito && !trovate.some(function(y) { return y.toUpperCase() === pulito.toUpperCase(); })) trovate.push(pulito);
  }
  // Resistenza al fuoco (D.M. 16/02/2007): REI 60, EI 120, EI2 60-C, E 30-Sa.
  // Sigle solo in maiuscolo ("e 30" nel testo non è una classe).
  const resistenza = /\b(REI|REW|EI[12]?|EW|RE|R|E)\s?-?\s?(15|20|30|45|60|90|120|180|240)((?:\s?-\s?(?:Sa|S200|S|C[0-5]?|M))*)(?![0-9A-Za-z])/g;
  let m;
  while ((m = resistenza.exec(t)) !== null) {
    aggiungi(m[1] + ' ' + m[2] + m[3].replace(/\s/g, ''));
  }
  // Reazione al fuoco (euroclassi): A2-s1,d0, Bfl-s1,d0...
  (t.match(/\b(A1|A2|B|C|D|E)(fl|ca)?\s?-\s?s[123]\s?,\s?d[012]\b/g) || []).forEach(function(x) { aggiungi('reazione al fuoco ' + x.replace(/\s/g, '')); });
  (t.match(/\bclasse\s+(A1|A2|0|1|2)\b/gi) || []).forEach(function(x) { aggiungi(x.toLowerCase()); });
  // Capacità di estinzione degli estintori: 34A 233B C
  (t.match(/\b\d{1,2}\s?A\s?\d{2,3}\s?B(\s?C)?\b/g) || []).forEach(function(x) { aggiungi('estinzione ' + x); });
  // Norme: UNI EN 1634-1, EN 3-7, UNI 10779, UNI EN 12845...
  (t.match(/\b(UNI\s?)?EN\s?(ISO\s?)?\d{1,5}(-\d+)*(:\d{4})?\b/g) || []).forEach(function(x) { aggiungi(x); });
  (t.match(/\bUNI\s?(ISO\s?)?\d{3,5}(-\d+)*(:\d{4})?\b/g) || []).forEach(function(x) { aggiungi(x); });
  if (/omologa/i.test(t)) aggiungi('omologato');
  if (/\bmarcatur[ae]\s+CE\b|\bmarcat[oaie]\s+CE\b|\bCE\b/.test(t)) aggiungi('marcatura CE');
  if (/\bDoP\b|dichiarazione di prestazione/i.test(t)) aggiungi('DoP');
  return trovate;
}

function quantitaDichiarazionePosa(q) {
  if (q === null || q === undefined || q === '') return '';
  const n = Number(q);
  if (!isFinite(n)) return String(q);
  return n.toLocaleString('it-IT', { maximumFractionDigits: 3 });
}

// Una voce del preventivo (o del lavoro extra) va tra i prodotti o tra
// le lavorazioni; noli, trasporti e la stessa dichiarazione non spuntati.
function rigaVoceDichiarazionePosa(voce, origine) {
  const descrizione = String(voce.descrizione || '').trim();
  const categoria = voce.categoria || 'altro';
  const prodotto = categoria === 'materiale';
  const accessoria = ['nolo', 'trasporto'].includes(categoria) ||
    /dichiarazion|certificazion|pratica|sopralluogo|progettazion/i.test(descrizione);
  return {
    gruppo: prodotto ? 'prodotti' : 'lavorazioni',
    descrizione: descrizione,
    quantita: quantitaDichiarazionePosa(voce.quantita),
    unita: voce.unita_misura || '',
    categoria: categoria,
    origine: origine,
    fornitore: '',
    classi: classificazioniDaDescrizione(descrizione),
    incluso: !accessoria
  };
}

// ── Finestra ────────────────────────────────────────────────────────
async function apriDichiarazionePosa() {
  const commessa = commessaDichiarazionePosa;
  if (!commessa || !puoGenerareDichiarazionePosa(commessa)) return;

  const bottone = ge('cmd-dichiarazione-apri');
  if (bottone) bottone.disabled = true;

  const [cantiereOk, faldoneOk, extraOk, ordiniOk] = await Promise.all([
    typeof verificaDatiCantiereDisponibili === 'function' ? verificaDatiCantiereDisponibili() : false,
    typeof verificaFaldoneDisponibile === 'function' ? verificaFaldoneDisponibile() : false,
    typeof verificaLavoriExtraDisponibili === 'function' ? verificaLavoriExtraDisponibili() : false,
    typeof verificaOrdiniFornitoriDisponibili === 'function' ? verificaOrdiniFornitoriDisponibili() : false
  ]);

  const colonne = [faldoneOk ? 'data_inizio' : '', cantiereOk ? 'cantiere_piano_zona' : ''].filter(Boolean).join(', ');

  const [rCliente, rSede, rScheda, rDati, rFine, rExtra, rOrdini] = await Promise.all([
    commessa.cliente_id
      ? db.from('clienti').select('ragione_sociale, piva, codice_fiscale, indirizzo, cap, citta, provincia').eq('id', commessa.cliente_id).maybeSingle()
      : null,
    commessa.sede_id
      ? db.from('sedi_cliente').select('nome, tipo, via, civico, cap, citta, provincia').eq('id', commessa.sede_id).maybeSingle()
      : null,
    cantiereOk
      ? db.rpc('scheda_cantiere_commessa', { p_commessa_id: commessa.id })
      : (commessa.preventivo_id
          ? db.from('preventivi_voci').select('categoria, descrizione, unita_misura, quantita').eq('preventivo_id', commessa.preventivo_id).order('ordinamento', { ascending: true }).order('creato_il', { ascending: true })
          : null),
    colonne ? db.from('commesse').select(colonne).eq('id', commessa.id).maybeSingle() : null,
    db.from('commesse_storico').select('cambiato_il').eq('commessa_id', commessa.id).eq('a_stato', 'fine_lavori')
      .order('cambiato_il', { ascending: false }).limit(1),
    extraOk ? db.rpc('voci_lavori_extra_commessa', { p_commessa_id: commessa.id }) : null,
    ordiniOk
      ? db.from('ordini_fornitori')
        .select('codice, numero, stato, fornitore_ragione_sociale, ordini_fornitori_voci(posizione, descrizione, unita_misura, quantita)')
        .eq('commessa_id', commessa.id)
        .order('numero', { ascending: true })
      : null
  ]);

  if (bottone) bottone.disabled = false;
  if (commessaApertaId && commessaApertaId !== commessa.id) return;

  const avvisi = [];
  if (rCliente?.error) avvisi.push('cliente: ' + rCliente.error.message);
  if (rSede?.error) avvisi.push('sede: ' + rSede.error.message);
  if (rScheda?.error) avvisi.push('voci del preventivo: ' + rScheda.error.message);
  if (rDati?.error) avvisi.push('date dei lavori: ' + rDati.error.message);
  if (rExtra?.error) avvisi.push('lavori extra: ' + rExtra.error.message);
  if (rOrdini?.error) avvisi.push('ordini ai fornitori: ' + rOrdini.error.message);

  const scheda = rScheda && !rScheda.error ? rScheda.data : null;
  const vociPreventivo = cantiereOk ? ((scheda && scheda.lavorazioni) || []) : (scheda || []);

  const righe = [];
  vociPreventivo.forEach(function(voce) {
    if (String(voce.descrizione || '').trim()) righe.push(rigaVoceDichiarazionePosa(voce, 'preventivo'));
  });
  ((rExtra && !rExtra.error && rExtra.data) || []).forEach(function(x) {
    (x.voci || []).forEach(function(voce) {
      if (!String(voce.descrizione || '').trim()) return;
      const r = rigaVoceDichiarazionePosa(voce, 'extra');
      r.descrizione = r.descrizione + ' (lavoro extra n. ' + x.numero + ')';
      righe.push(r);
    });
  });
  // Voci degli ordini ai fornitori: spesso ripetono i materiali del
  // preventivo, quindi non spuntate (servono per indicare il fornitore).
  ((rOrdini && !rOrdini.error && rOrdini.data) || []).forEach(function(o) {
    if (o.stato === 'annullato') return;
    (o.ordini_fornitori_voci || []).slice().sort(function(a, b) { return a.posizione - b.posizione; }).forEach(function(voce) {
      const descrizione = String(voce.descrizione || '').trim();
      if (!descrizione) return;
      righe.push({
        gruppo: 'prodotti',
        descrizione: descrizione,
        quantita: quantitaDichiarazionePosa(voce.quantita),
        unita: voce.unita_misura || '',
        categoria: 'materiale',
        origine: 'ordine',
        fornitore: o.fornitore_ragione_sociale || '',
        riferimento: 'ordine ' + o.codice,
        classi: classificazioniDaDescrizione(descrizione),
        incluso: false
      });
    });
  });

  // Certificati: del preventivo (sql/34) e della cartella della commessa.
  const certificati = [];
  ((scheda && cantiereOk && scheda.certificati) || []).forEach(function(c) {
    certificati.push({ nome: c.nome_file, dettaglio: 'caricato sul preventivo', incluso: true });
  });
  ((typeof documentiCommessaAperta !== 'undefined' && documentiCommessaAperta) || [])
    .filter(function(d) { return d.cartella === 'certificati'; })
    .forEach(function(d) {
      if (certificati.some(function(c) { return c.nome === d.nome_file; })) return;
      certificati.push({ nome: d.nome_file, dettaglio: d.nota || 'cartella Certificati della commessa', incluso: true });
    });

  const dati = (rDati && !rDati.error && rDati.data) || {};
  const fine = rFine && !rFine.error && rFine.data && rFine.data[0] ? rFine.data[0].cambiato_il : null;

  dichiarazionePosaAperta = {
    commessa: commessa,
    cliente: (rCliente && !rCliente.error && rCliente.data) || { ragione_sociale: commessa.clienti?.ragione_sociale },
    sede: (rSede && !rSede.error && rSede.data) || null,
    progetto: (scheda && cantiereOk && scheda.progetto) || null,
    dataInizio: dati.data_inizio || '',
    dataFine: fine ? new Date(fine).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) : '',
    pianoZona: dati.cantiere_piano_zona || '',
    righe: righe,
    certificati: certificati,
    vociLeggibili: cantiereOk || !!(scheda && scheda.length),
    avvisi: avvisi
  };

  ge('dmo-sottotitolo').textContent = 'Commessa ' + commessa.codice +
    (commessa.clienti?.ragione_sociale ? ' · ' + commessa.clienti.ragione_sociale : '') +
    (commessa.titolo ? ' · ' + commessa.titolo : '');
  ge('dmo-testo').value = TESTO_DICHIARAZIONE_POSA_PREDEFINITO;
  ge('dmo-normativa').value = NORMATIVA_DICHIARAZIONE_POSA_PREDEFINITA;
  ge('dmo-note').value = '';
  ge('dmo-responsabile').value = '';
  const salva = puoSalvareDichiarazionePosa(commessa);
  ge('dmo-salva').style.display = salva ? '' : 'none';
  ge('dmo-salva').disabled = false;
  ge('dmo-scarica').disabled = false;
  ge('dmo-scarica').classList.toggle('p', !salva);
  disegnaDichiarazionePosa();
  openM('m-dichiarazione-posa');
}

function testoPeriodoLavoriPosa(d) {
  if (d.dataInizio && d.dataFine) return 'dal ' + fd(d.dataInizio) + ' al ' + fd(d.dataFine);
  if (d.dataFine) return 'ultimati il ' + fd(d.dataFine);
  if (d.dataInizio) return 'iniziati il ' + fd(d.dataInizio);
  return '';
}

function indirizzoSedeLegaleCliente(c) {
  if (!c) return '';
  return [c.indirizzo, [c.cap, c.citta, c.provincia ? '(' + c.provincia + ')' : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function disegnaDichiarazionePosa() {
  const d = dichiarazionePosaAperta;
  if (!d) return;
  const c = d.commessa;
  const sede = d.sede;
  const indirizzoSede = typeof indirizzoCompletoSede === 'function' ? indirizzoCompletoSede(sede) : '';
  const periodo = testoPeriodoLavoriPosa(d);

  const avvisi = [];
  if (!c.sede_id) avvisi.push('La sede del cantiere non è indicata: nel PDF il luogo dei lavori resta vuoto. Indicala nella scheda della commessa.');
  if (!d.vociLeggibili) avvisi.push('Le voci del preventivo non sono disponibili: lavorazioni e prodotti restano vuoti.');
  if (d.avvisi.length) avvisi.push('Errore caricamento: ' + d.avvisi.join(' · '));

  ge('dmo-avvisi').innerHTML = avvisi.map(function(a) { return '<div class="al2 w" style="margin:0 0 8px">' + esc(a) + '</div>'; }).join('');

  ge('dmo-dati').innerHTML = `
    <div class="dmo-dato"><span>Committente</span><b>${esc(d.cliente?.ragione_sociale || '—')}</b>${d.cliente?.piva || d.cliente?.codice_fiscale ? ' · ' + esc([d.cliente.piva ? 'P.IVA ' + d.cliente.piva : '', d.cliente.codice_fiscale && d.cliente.codice_fiscale !== d.cliente.piva ? 'C.F. ' + d.cliente.codice_fiscale : ''].filter(Boolean).join(' · ')) : ''}</div>
    <div class="dmo-dato"><span>Luogo dei lavori</span>${sede ? '<b>' + esc(sede.nome || sede.tipo || 'Sede') + '</b>' + (indirizzoSede ? ' · ' + esc(indirizzoSede) : '') : '<b style="color:var(--a)">da indicare</b>'}${d.pianoZona ? ' · ' + esc(d.pianoZona) : ''}</div>
    <div class="dmo-dato"><span>Riferimenti</span>Commessa <b>${esc(c.codice)}</b>${c.preventivi?.numero ? ' · preventivo n. ' + esc(c.preventivi.numero) : ''}${c.titolo || c.progetti_tecnici?.titolo ? ' · ' + esc(c.titolo || c.progetti_tecnici.titolo) : ''}</div>
    <div class="dmo-dato"><span>Periodo dei lavori</span>${periodo ? esc(periodo) : '<span style="color:var(--m)">non indicato</span>'}</div>
  `;

  function elenco(gruppo, vuoto) {
    const indici = [];
    d.righe.forEach(function(r, i) { if (r.gruppo === gruppo) indici.push(i); });
    if (!indici.length) return '<div class="empty" style="padding:8px">' + esc(vuoto) + '</div>';
    return indici.map(function(i) {
      const r = d.righe[i];
      const dettagli = [
        r.origine === 'ordine' ? 'dall\'ordine ai fornitori' + (r.fornitore ? ' · ' + r.fornitore : '') : '',
        r.categoria && !['materiale', 'manodopera'].includes(r.categoria) && typeof ETICHETTE_CATEGORIA_LAVORAZIONE !== 'undefined' ? (ETICHETTE_CATEGORIA_LAVORAZIONE[r.categoria] || r.categoria) : '',
        r.classi.length ? r.classi.join(', ') : ''
      ].filter(Boolean).join(' · ');
      return `
        <label class="dmo-riga">
          <input type="checkbox" ${r.incluso ? 'checked' : ''} onchange="spuntaVoceDichiarazionePosa(${i}, this.checked)">
          <span style="flex:1;min-width:0">
            <span style="display:block;font-size:13px">${esc(r.descrizione)}</span>
            ${dettagli ? `<span style="display:block;font-size:11px;color:var(--m)">${esc(dettagli)}</span>` : ''}
          </span>
          <span class="dmo-quantita">${esc((r.quantita + ' ' + r.unita).trim())}</span>
        </label>
      `;
    }).join('');
  }

  ge('dmo-lavorazioni').innerHTML = elenco('lavorazioni', 'Nessuna lavorazione nelle voci del preventivo.');
  ge('dmo-prodotti').innerHTML = elenco('prodotti', 'Nessun prodotto o materiale nelle voci del preventivo.');
  ge('dmo-certificati').innerHTML = d.certificati.length
    ? d.certificati.map(function(cf, i) {
        return `
          <label class="dmo-riga">
            <input type="checkbox" ${cf.incluso ? 'checked' : ''} onchange="spuntaCertificatoDichiarazionePosa(${i}, this.checked)">
            <span style="flex:1;min-width:0">
              <span style="display:block;font-size:13px">🏅 ${esc(cf.nome)}</span>
              <span style="display:block;font-size:11px;color:var(--m)">${esc(cf.dettaglio)}</span>
            </span>
          </label>
        `;
      }).join('')
    : '<div class="empty" style="padding:8px">Nessun certificato caricato sul preventivo o nella cartella Certificati della commessa.</div>';
}

function spuntaVoceDichiarazionePosa(indice, valore) {
  const r = dichiarazionePosaAperta?.righe[indice];
  if (r) r.incluso = !!valore;
}

function spuntaCertificatoDichiarazionePosa(indice, valore) {
  const c = dichiarazionePosaAperta?.certificati[indice];
  if (c) c.incluso = !!valore;
}

function ripristinaTestiDichiarazionePosa() {
  ge('dmo-testo').value = TESTO_DICHIARAZIONE_POSA_PREDEFINITO;
  ge('dmo-normativa').value = NORMATIVA_DICHIARAZIONE_POSA_PREDEFINITA;
  toast('Testo e riferimenti normativi predefiniti ripristinati', 'ok');
}

// ── PDF ─────────────────────────────────────────────────────────────
async function creaPdfDichiarazionePosa() {
  const d = dichiarazionePosaAperta;
  if (!d) return null;
  const testo = (v('dmo-testo') || '').trim();
  if (!testo) {
    toast('Il testo della dichiarazione non può essere vuoto (usa "Ripristina i testi predefiniti")', 'err');
    return null;
  }
  const lavorazioni = d.righe.filter(function(r) { return r.incluso && r.gruppo === 'lavorazioni'; });
  const prodotti = d.righe.filter(function(r) { return r.incluso && r.gruppo === 'prodotti'; });
  if (!lavorazioni.length && !prodotti.length) {
    toast('Spunta almeno una lavorazione o un prodotto', 'err');
    return null;
  }
  if (!(await preparaPDF())) return null;

  const c = d.commessa;
  const normativa = (v('dmo-normativa') || '').trim();
  const note = (v('dmo-note') || '').trim();
  const responsabile = (v('dmo-responsabile') || '').trim();
  const certificati = d.certificati.filter(function(x) { return x.incluso; });

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margine = 16;
  const larghezza = 210;
  const destra = larghezza - margine;
  const utile = destra - margine;
  const verde = [8, 80, 65];

  // Intestazione (come ordine, richiesta di quotazione e preventivo)
  doc.setFillColor(verde[0], verde[1], verde[2]);
  doc.rect(0, 0, larghezza, 34, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('TOLI FIRE', margine, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Via Bellatalla 62, Ospedaletto — 56121 Pisa', margine, 23);
  doc.text('P.IVA: 02490980501 — amministrazione@toli-fire.com', margine, 28);
  doc.setFontSize(10);
  doc.text('Dichiarazione di corretta messa in opera', destra, 16, { align: 'right' });
  doc.text('Commessa ' + c.codice, destra, 22, { align: 'right' });

  let y = 46;
  doc.setTextColor(25, 25, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('DICHIARAZIONE DI CORRETTA MESSA IN OPERA', larghezza / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('posa in opera di prodotti e sistemi per la protezione antincendio', larghezza / 2, y, { align: 'center' });
  y += 9;

  function spazio(altezza) {
    if (y + altezza > 272) { doc.addPage(); y = 20; }
  }
  function titolo(t) {
    spazio(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(verde[0], verde[1], verde[2]);
    doc.text(t, margine, y);
    doc.setDrawColor(verde[0], verde[1], verde[2]);
    doc.line(margine, y + 1.5, destra, y + 1.5);
    doc.setTextColor(25, 25, 25);
    y += 6;
  }
  function paragrafo(t, dimensione) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(dimensione || 9);
    const pezzi = doc.splitTextToSize(t, utile);
    pezzi.forEach(function(riga) {
      spazio(5);
      doc.text(riga, margine, y);
      y += 4.4;
    });
    y += 2;
  }

  // Dati: committente, luogo, riferimenti
  const cli = d.cliente || {};
  const sede = d.sede;
  const indirizzoSede = typeof indirizzoCompletoSede === 'function' ? indirizzoCompletoSede(sede) : '';
  const fiscali = [cli.piva ? 'P.IVA ' + cli.piva : '', cli.codice_fiscale && cli.codice_fiscale !== cli.piva ? 'C.F. ' + cli.codice_fiscale : ''].filter(Boolean).join(' — ');
  const periodo = testoPeriodoLavoriPosa(d);
  const lavoro = c.titolo || c.progetti_tecnici?.titolo || d.progetto?.titolo || '';
  const tipologia = d.progetto?.tipologia ? (typeof tipologiaLeggibileOrdine === 'function' ? tipologiaLeggibileOrdine(d.progetto.tipologia) : d.progetto.tipologia) : '';

  doc.autoTable({
    startY: y,
    margin: { top: 18, right: margine, bottom: 24, left: margine },
    body: [
      ['Committente', [cli.ragione_sociale || '', fiscali, indirizzoSedeLegaleCliente(cli)].filter(Boolean).join('\n')],
      ['Luogo dei lavori', sede
        ? [sede.nome || sede.tipo || '', indirizzoSede, d.pianoZona ? 'Piano e zona: ' + d.pianoZona : ''].filter(Boolean).join('\n')
        : ''],
      ['Commessa', c.codice + (c.preventivi?.numero ? ' — preventivo n. ' + c.preventivi.numero : '')],
      ['Lavoro', [lavoro, tipologia && tipologia.toLowerCase() !== String(lavoro).toLowerCase() ? '(' + tipologia + ')' : ''].filter(Boolean).join(' ')],
      ['Periodo dei lavori', periodo]
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, valign: 'top' },
    columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold', fillColor: [240, 245, 243] }, 1: { cellWidth: utile - 38 } }
  });
  y = doc.lastAutoTable.finalY + 8;

  // Dichiarazione e riferimenti normativi
  titolo('DICHIARAZIONE');
  paragrafo(testo);
  if (normativa) {
    titolo('RIFERIMENTI NORMATIVI');
    paragrafo(normativa, 8.5);
  }

  function tabella(intestazione, righe, conClassi) {
    titolo(intestazione);
    doc.autoTable({
      startY: y,
      margin: { top: 18, right: margine, bottom: 24, left: margine },
      head: [conClassi
        ? ['Descrizione', 'Q.tà', 'U.M.', 'Classificazione, certificazione, fornitore']
        : ['Descrizione', 'Q.tà', 'U.M.']],
      body: righe.map(function(r) {
        const base = [r.descrizione, r.quantita, r.unita];
        if (conClassi) {
          base.push([r.classi.join(', '), r.origine === 'ordine' && r.fornitore ? 'Fornitore: ' + r.fornitore : ''].filter(Boolean).join('\n') || '—');
        }
        return base;
      }),
      theme: 'grid',
      headStyles: { fillColor: verde, textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2.5, valign: 'top' },
      columnStyles: conClassi
        ? { 0: { cellWidth: 84 }, 1: { halign: 'right', cellWidth: 16 }, 2: { cellWidth: 14 }, 3: { cellWidth: utile - 114 } }
        : { 0: { cellWidth: utile - 34 }, 1: { halign: 'right', cellWidth: 18 }, 2: { cellWidth: 16 } }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  if (lavorazioni.length) tabella('LAVORAZIONI ESEGUITE', lavorazioni, lavorazioni.some(function(r) { return r.classi.length; }));
  if (prodotti.length) tabella('PRODOTTI E MATERIALI POSATI IN OPERA', prodotti, true);

  if (certificati.length) {
    titolo('DOCUMENTAZIONE DEI PRODOTTI (certificazioni, rapporti di classificazione, schede tecniche)');
    paragrafo('Documenti conservati nel fascicolo della commessa ' + c.codice + ', disponibili su richiesta:', 8.5);
    certificati.forEach(function(cf) {
      paragrafo('- ' + cf.nome, 8.5);
      y -= 1.5;
    });
    y += 2;
  }

  if (note) {
    titolo('NOTE');
    paragrafo(note);
  }

  paragrafo(TESTO_LIMITI_DICHIARAZIONE_POSA, 8);

  // Luogo, data, timbro e firma: tutto nella stessa pagina.
  spazio(46);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Luogo', margine, y);
  doc.line(margine + 12, y + 0.8, margine + 70, y + 0.8);
  doc.text('Data', margine, y + 10);
  doc.line(margine + 12, y + 10.8, margine + 70, y + 10.8);

  const xFirma = 112;
  doc.setFont('helvetica', 'bold');
  doc.text('Il responsabile tecnico', xFirma, y);
  doc.setFont('helvetica', 'normal');
  doc.text(responsabile ? responsabile : 'Nome e cognome', xFirma, y + 6);
  if (!responsabile) doc.line(xFirma + 26, y + 6.8, destra, y + 6.8);
  doc.setDrawColor(150, 150, 150);
  doc.rect(xFirma, y + 10, destra - xFirma, 26);
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Timbro e firma', xFirma + 2, y + 14);
  doc.setTextColor(25, 25, 25);

  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Dichiarazione di corretta messa in opera — Commessa ' + c.codice + ' — pagina ' + p + ' di ' + pagine, destra, 290, { align: 'right' });
  }

  const nomeFile = PREFISSO_FILE_DICHIARAZIONE_POSA + String(c.codice).replace(/[^0-9A-Za-z]+/g, '-') + '_' +
    nomeFileSicuroCommessa(cli.ragione_sociale || 'cliente').slice(0, 40) + '.pdf';
  return { doc: doc, nomeFile: nomeFile };
}

async function scaricaDichiarazionePosa() {
  const bottone = ge('dmo-scarica');
  if (bottone) bottone.disabled = true;
  const pdf = await creaPdfDichiarazionePosa();
  if (bottone) bottone.disabled = false;
  if (pdf) pdf.doc.save(pdf.nomeFile);
}

// Scarica il PDF e lo salva nella cartella "Chiusura" (sql/29).
async function salvaDichiarazionePosa() {
  const d = dichiarazionePosaAperta;
  if (!d || !puoSalvareDichiarazionePosa(d.commessa)) return;
  const commessa = d.commessa;
  const bottone = ge('dmo-salva');
  if (bottone) bottone.disabled = true;

  const pdf = await creaPdfDichiarazionePosa();
  if (!pdf) { if (bottone) bottone.disabled = false; return; }

  const path = commessa.id + '/chiusura/' + Date.now() + '_' + pdf.nomeFile;
  const caricamento = await db.storage
    .from('commesse-documenti')
    .upload(path, pdf.doc.output('blob'), { upsert: false, contentType: 'application/pdf' });

  if (caricamento.error) {
    if (bottone) bottone.disabled = false;
    toast('Dichiarazione non salvata nella cartella: ' + caricamento.error.message, 'err');
    return;
  }

  const { error } = await db.rpc('registra_documento_commessa', {
    p_commessa_id: commessa.id,
    p_cartella: 'chiusura',
    p_storage_path: path,
    p_nome_file: pdf.nomeFile,
    p_nota: 'Dichiarazione di corretta messa in opera (generata dal gestionale)'
  });

  if (error) {
    await db.storage.from('commesse-documenti').remove([path]);
    if (bottone) bottone.disabled = false;
    toast('Dichiarazione non salvata nella cartella: ' + error.message, 'err');
    return;
  }

  pdf.doc.save(pdf.nomeFile);
  if (bottone) bottone.disabled = false;
  closeM('m-dichiarazione-posa');
  toast('Dichiarazione salvata nella cartella Chiusura della commessa', 'ok');
  if (commessaApertaId === commessa.id) await caricaSchedaCommessa(commessa.id);
}
