// js/18i-commesse.js — commesse nate dal preventivo, stati della commessa, ricerca dei preventivi.
// Riordino del 17/11: era una parte di js/18-preventivi.js (righe 11096-11876),
// spostata così com'era. Si carica subito dopo il pezzo precedente (index.html).

// =====================================================================
// F5.1 — COMMESSA nata dal preventivo accettato (sql/26-commesse).
// Passo 5 del flusso: quando il preventivo diventa 'accettato' (senza
// anticipo, oppure con l'accredito verificato dalla segreteria) il
// database crea da solo la commessa, con il codice ANNO-NUMERO
// (es. 2026-001). Nasce solo dai preventivi collegati a un progetto
// tecnico (lavoro straordinario/cantiere, non la manutenzione
// periodica). Qui si mostra il codice nel riepilogo dell'esito e si
// indica la sede del cantiere quando il cliente ne ha più d'una
// (titolare, segreteria, rappresentante: imposta_sede_commessa).
// Senza sql/26 nulla di questo compare.
// =====================================================================

const ETICHETTE_STATO_COMMESSA = {
  approvata: 'Approvata',
  materiali_ordinati: 'Materiali ordinati',
  in_preparazione: 'Presa in carico', // T1 di Toli: etichetta, il codice resta in_preparazione
  pronta: 'Pronta',
  in_corso: 'In corso',
  fine_lavori: 'Fine lavori',
  chiusa: 'Chiusa',
  annullata: 'Annullata'
};

let commesseDisponibili = true; // riordino 17/11: SQL già in produzione, nessuna lettura di controllo

// true se sql/26 è stato eseguito (esiste la tabella commesse).
async function verificaCommesseDisponibili() {
  if (commesseDisponibili !== null) return commesseDisponibili;

  const { error } = await db
    .from('commesse')
    .select('id')
    .limit(1);

  if (!error) {
    commesseDisponibili = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /commesse/i.test(error.message || '')) {
    commesseDisponibili = false;
  } else {
    // Errore di rete o altro: non decidere ora, riprova la prossima volta.
    return false;
  }

  return commesseDisponibili;
}

// Commesse dei preventivi indicati: { id_preventivo: commessa }.
// null se le commesse non sono attive o la lettura non riesce.
async function caricaCommessePreventivi(idPreventivi) {
  const ids = (idPreventivi || []).filter(Boolean);
  if (!ids.length || !(await verificaCommesseDisponibili())) return null;

  const { data, error } = await db
    .from('commesse')
    .select('id, codice, stato, creato_il, cliente_id, sede_id, preventivo_id, sedi_cliente(nome, tipo, via, civico, citta)')
    .in('preventivo_id', ids);

  if (error) return null;

  const mappa = {};
  (data || []).forEach(function(commessa) {
    mappa[commessa.preventivo_id] = commessa;
  });
  return mappa;
}

// Aggiunge preventivo._commessa (oggetto, oppure null se manca) ai
// preventivi accettati dell'elenco. Senza sql/26 non tocca nulla.
async function aggiungiCommessaAiPreventivi(preventivi) {
  const accettati = (preventivi || []).filter(function(p) {
    return p && p.stato === 'accettato';
  });
  if (!accettati.length) return;

  const mappa = await caricaCommessePreventivi(accettati.map(function(p) { return p.id; }));
  if (!mappa) return;

  // F5.2: bottone "Stato e storico" solo con sql/28 (verifica in cache).
  await verificaStatiCommessaDisponibili();

  accettati.forEach(function(p) {
    p._commessa = mappa[p.id] || null;
  });

  // F8.5: il preventivo integrativo di un lavoro extra non ha una
  // commessa sua: resta nella commessa del lavoro extra (js/36, sql/38).
  const senzaCommessa = accettati.filter(function(p) { return !p._commessa; });
  if (senzaCommessa.length && typeof verificaLavoriExtraDisponibili === 'function' &&
      (await verificaLavoriExtraDisponibili())) {
    const { data: extra, error: erroreExtra } = await db
      .from('commesse_lavori_extra')
      .select('numero, preventivo_id, commesse(id, codice, stato, preventivo_id)')
      .in('preventivo_id', senzaCommessa.map(function(p) { return p.id; }));
    if (!erroreExtra) {
      (extra || []).forEach(function(r) {
        const p = senzaCommessa.find(function(x) { return x.id === r.preventivo_id; });
        if (p && r.commesse) p._lavoroExtra = { numero: r.numero, commessa: r.commesse };
      });
    }
  }
}

function puoImpostareSedeCommessa() {
  return ['titolare', 'segreteria', 'rappresentante'].includes(ROLE);
}

function testoSedeCommessa(sede) {
  if (!sede) return '';
  const indirizzo = [
    [sede.via, sede.civico].filter(Boolean).join(' '),
    sede.citta
  ].filter(Boolean).join(', ');
  return [sede.nome || sede.tipo, indirizzo].filter(Boolean).join(' · ');
}

// Riga "Commessa 2026-001" nel riepilogo dell'esito (solo accettati).
function htmlCommessaPreventivo(preventivo) {
  if (!preventivo || preventivo.stato !== 'accettato' || !('_commessa' in preventivo)) return '';

  const commessa = preventivo._commessa;

  if (!commessa && preventivo._lavoroExtra) {
    const le = preventivo._lavoroExtra;
    return `
      <div class="card" style="margin:10px 0 0;padding:10px 12px;color:var(--t)">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
          <div style="font-size:14px;font-weight:700">
            ➕ Preventivo integrativo: lavoro extra n. ${esc(le.numero)} della commessa ${esc(le.commessa.codice)}
          </div>
          <span class="bx ${classeStatoCommessa(le.commessa.stato)}">${esc(ETICHETTE_STATO_COMMESSA[le.commessa.stato] || le.commessa.stato)}</span>
        </div>
        <div style="font-size:12px;color:var(--m);margin-top:4px">
          Accettato: il lavoro extra si può eseguire nella stessa commessa (nessuna commessa nuova).
        </div>
        ${canAccessPage('commessa-detail') ? `
          <div style="margin-top:6px">
            <button class="btn sm" onclick="openCommessaDetail('${esc(le.commessa.id)}')">📂 Apri commessa ${esc(le.commessa.codice)}</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  if (!commessa) {
    return `
      <div style="margin-top:8px;font-size:12px;color:var(--m)">
        Nessuna commessa collegata (preventivo senza progetto tecnico o
        accettato prima dell'attivazione delle commesse).
      </div>
    `;
  }

  const nata = commessa.creato_il
    ? new Date(commessa.creato_il).toLocaleDateString('it-IT')
    : '';
  const sede = testoSedeCommessa(commessa.sedi_cliente);

  return `
    <div class="card" style="margin:10px 0 0;padding:10px 12px;color:var(--t)">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="font-size:14px;font-weight:700">
          📁 Commessa ${esc(commessa.codice)}
        </div>
        <span class="bx ${classeStatoCommessa(commessa.stato)}">${esc(ETICHETTE_STATO_COMMESSA[commessa.stato] || commessa.stato)}</span>
      </div>
      ${nata ? `<div style="font-size:12px;color:var(--m);margin-top:4px">Nata il ${esc(nata)}</div>` : ''}
      ${htmlProssimoPassoCommessa(commessa)}
      ${canAccessPage('commessa-detail') ? `
        <div style="margin-top:6px">
          <button class="btn sm" onclick="openCommessaDetail('${esc(commessa.id)}')">📂 Apri commessa e documenti</button>
        </div>
      ` : ''}
      <div id="commessa-sede-${esc(commessa.id)}" style="font-size:12px;margin-top:6px">
        Sede del cantiere: ${sede
          ? '<b>' + esc(sede) + '</b>'
          : '<b style="color:var(--a)">da indicare</b>'}
        ${puoImpostareSedeCommessa() && commessa.stato !== 'chiusa' && commessa.stato !== 'annullata' ? `
          <button
            class="btn sm"
            style="margin-left:6px"
            onclick="apriSceltaSedeCommessa('${esc(commessa.id)}', '${esc(commessa.cliente_id)}', '${esc(commessa.preventivo_id)}', '${esc(commessa.sede_id || '')}')"
          >
            ${sede ? 'Cambia sede' : 'Indica la sede'}
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

async function apriSceltaSedeCommessa(commessaId, clienteId, preventivoId, sedeAttuale) {
  // Lo stesso id c'è nel riepilogo del preventivo e nella scheda commessa: si prende quello della pagina aperta
  const box = document.querySelector('.page.on [id="commessa-sede-' + commessaId + '"]') || ge('commessa-sede-' + commessaId);
  if (!box) return;

  const { data: sedi, error } = await db.rpc('elenco_sedi_cliente', { p_cliente_id: clienteId });

  if (error) {
    toast('Errore caricamento sedi: ' + error.message, 'err');
    return;
  }

  if (!sedi?.length) {
    toast('Il cliente non ha sedi: aggiungila nella scheda cliente', 'err');
    return;
  }

  box.innerHTML = `
    <div style="font-size:12px;font-weight:600;margin-bottom:4px">Sede del cantiere</div>
    <select id="commessa-sede-scelta-${esc(commessaId)}" style="max-width:100%">
      <option value="">— Scegli la sede —</option>
      ${sedi.map(function(sede) {
        return `<option value="${esc(sede.id)}" ${sede.id === sedeAttuale ? 'selected' : ''}>${esc(testoSedeCommessa(sede))}</option>`;
      }).join('')}
    </select>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn sm p" onclick="salvaSedeCommessa('${esc(commessaId)}', '${esc(preventivoId)}', this)">Salva sede</button>
      <button class="btn sm" onclick="aggiornaDopoEsitoPreventivo('${esc(preventivoId)}')">Annulla</button>
    </div>
  `;
}

async function salvaSedeCommessa(commessaId, preventivoId, bottone) {
  // La tendina giusta è quella accanto al bottone (può essercene una anche nella pagina nascosta del preventivo)
  const scelta = (bottone && bottone.closest('[id="commessa-sede-' + commessaId + '"]')?.querySelector('select'))
    || document.querySelector('.page.on [id="commessa-sede-scelta-' + commessaId + '"]');
  const sedeId = scelta ? scelta.value : v('commessa-sede-scelta-' + commessaId);

  if (!sedeId) {
    toast('Scegli la sede del cantiere', 'err');
    return;
  }

  if (bottone) bottone.disabled = true;

  const { data: codice, error } = await db.rpc('imposta_sede_commessa', {
    p_commessa_id: commessaId,
    p_sede_id: sedeId
  });

  if (error) {
    if (bottone) bottone.disabled = false;
    toast('Sede non salvata: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  toast('Sede della commessa ' + (codice || '') + ' salvata', 'ok');
  await aggiornaDopoEsitoPreventivo(preventivoId);
}

// Testo da aggiungere al messaggio dopo l'accettazione o l'accredito:
// " · nata la commessa 2026-001" (vuoto senza sql/26 o senza commessa).
async function testoCommessaNata(preventivoId) {
  const mappa = await caricaCommessePreventivi([preventivoId]);
  const commessa = mappa && mappa[preventivoId];
  return commessa ? ' · nata la commessa ' + commessa.codice : '';
}


// =====================================================================
// F5.2 — STATI DELLA COMMESSA e storico (sql/28-commesse-stati-storico).
// Gli stati si passano solo in ordine, uno alla volta, e ognuno lo segna
// il ruolo che nel flusso della commessa fa quel lavoro (o il titolare,
// che può tutto ma non è mai obbligato):
//   approvata → materiali ordinati   rappresentante (passo 7)
//   → in preparazione                capo tecnico   (passo 8)
//   → pronta                         segreteria     (passo 10, faldone)
//   → in corso → fine lavori         capo tecnico   (passo 11)
//   → chiusa                         segreteria     (passo 12)
// Solo il titolare riporta indietro (nota obbligatoria), annulla (motivo
// obbligatorio) e riattiva (torna allo stato di prima). Se il titolare
// riporta indietro il preventivo accettato la commessa diventa da sola
// 'annullata'; se il preventivo torna accettato si riattiva da sola.
// Lo storico (chi, quando, da quale stato a quale, nota) lo scrive il
// database (RPC cambia_stato_commessa). Senza sql/28 nulla compare.
// Pagina Commesse e scheda della commessa: js/26 (F5.3).
// =====================================================================

const ORDINE_STATI_COMMESSA = [
  'approvata', 'materiali_ordinati', 'in_preparazione', 'pronta',
  'in_corso', 'fine_lavori', 'chiusa'
];

// Chi segna il passaggio A quello stato (oltre al titolare).
const RUOLO_PASSO_COMMESSA = {
  materiali_ordinati: 'rappresentante',
  in_preparazione: 'capo_tecnico',
  pronta: 'segreteria',
  in_corso: 'capo_tecnico',
  fine_lavori: 'capo_tecnico',
  chiusa: 'segreteria'
};

const NOMI_RUOLO_PASSO_COMMESSA = {
  rappresentante: 'Rappresentante',
  capo_tecnico: 'Capo tecnico',
  segreteria: 'Segreteria',
  titolare: 'Titolare',
  commerciale: 'Acquisti'
};

// Cosa significa il passaggio, in parole semplici (passi del flusso).
const DESCRIZIONE_PASSO_COMMESSA = {
  materiali_ordinati: 'tutto ordinato, date di arrivo comunicate e documentazione girata al capo tecnico',
  in_preparazione: 'documenti esaminati, consumabili e noli mancanti chiesti agli acquisti',
  pronta: 'date di inizio fissate con il cliente, documenti pronti, faldone consegnato al capo tecnico',
  in_corso: 'cantiere iniziato',
  fine_lavori: 'lavori finiti, si passa alla segreteria',
  chiusa: 'corretta messa in opera verificata, fatture fatte, commessa chiusa'
};

function classeStatoCommessa(stato) {
  if (stato === 'chiusa') return 'bok';
  if (stato === 'annullata') return 'berr';
  if (stato === 'in_corso' || stato === 'fine_lavori') return 'bpur';
  return 'bblue';
}

function statoSuccessivoCommessa(stato) {
  const i = ORDINE_STATI_COMMESSA.indexOf(stato);
  if (i < 0 || i >= ORDINE_STATI_COMMESSA.length - 1) return null;
  return ORDINE_STATI_COMMESSA[i + 1];
}

// true se l'utente collegato segna il prossimo passo della commessa.
function toccaAMeCommessa(commessa) {
  const prossimo = statoSuccessivoCommessa(commessa && commessa.stato);
  return !!prossimo && RUOLO_PASSO_COMMESSA[prossimo] === ROLE;
}

let statiCommessaDisponibili = true; // riordino 17/11: SQL già in produzione, nessuna lettura di controllo

// true se sql/28 è stato eseguito (esiste la tabella commesse_storico).
async function verificaStatiCommessaDisponibili() {
  if (statiCommessaDisponibili !== null) return statiCommessaDisponibili;
  if (!(await verificaCommesseDisponibili())) return false;

  const { error } = await db
    .from('commesse_storico')
    .select('id')
    .limit(1);

  if (!error) {
    statiCommessaDisponibili = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /commesse_storico/i.test(error.message || '')) {
    statiCommessaDisponibili = false;
  } else {
    return false;
  }

  return statiCommessaDisponibili;
}

// Riga "Prossimo passo" + bottone "Stato e storico" nel riepilogo della
// commessa. Il bottone c'è solo con sql/28 (verifica già fatta e in cache).
function htmlProssimoPassoCommessa(commessa) {
  if (!commessa || statiCommessaDisponibili !== true) return '';

  const prossimo = statoSuccessivoCommessa(commessa.stato);
  const chi = prossimo ? NOMI_RUOLO_PASSO_COMMESSA[RUOLO_PASSO_COMMESSA[prossimo]] : '';
  const testo = commessa.stato === 'annullata'
    ? 'Commessa annullata: solo il titolare può riattivarla'
    : (prossimo
      ? 'Prossimo passo: <b>' + esc(ETICHETTE_STATO_COMMESSA[prossimo]) + '</b> (lo segna: ' + esc(chi) + ')'
      : 'Commessa chiusa');

  return `
    <div style="font-size:12px;margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span>${testo}</span>
      <button class="btn sm${toccaAMeCommessa(commessa) ? ' p' : ''}" onclick="apriStatoCommessa('${esc(commessa.id)}', '${esc(commessa.preventivo_id || '')}')">
        Stato e storico
      </button>
    </div>
  `;
}

let commessaStatoAperta = null;

// Finestra "Stato della commessa": percorso degli stati, cambio di stato
// consentito al ruolo, storico dei passaggi.
async function apriStatoCommessa(commessaId, preventivoId) {
  if (!(await verificaStatiCommessaDisponibili())) {
    toast('Gli stati della commessa non sono ancora attivi', 'err');
    return;
  }

  const [rCommessa, rStorico] = await Promise.all([
    db.from('commesse')
      .select('id, codice, stato, titolo, preventivo_id, clienti(ragione_sociale), preventivi(stato)')
      .eq('id', commessaId)
      .maybeSingle(),
    db.from('commesse_storico')
      .select('id, da_stato, a_stato, tipo, nota, cambiato_da_nome, cambiato_da_ruolo, cambiato_il')
      .eq('commessa_id', commessaId)
      .order('cambiato_il', { ascending: false })
  ]);

  if (rCommessa.error || !rCommessa.data) {
    toast('Errore apertura commessa: ' + (rCommessa.error?.message || 'commessa non trovata'), 'err');
    return;
  }

  const commessa = rCommessa.data;
  const storico = rStorico.data || [];
  commessaStatoAperta = {
    id: commessa.id,
    codice: commessa.codice,
    stato: commessa.stato,
    preventivoId: preventivoId || commessa.preventivo_id || ''
  };

  ge('msc-titolo').textContent = '📁 Commessa ' + commessa.codice;
  ge('msc-sottotitolo').textContent = [commessa.clienti?.ragione_sociale, commessa.titolo]
    .filter(Boolean).join(' · ');
  ge('msc-percorso').innerHTML = htmlPercorsoStatiCommessa(commessa.stato);

  // Stati che l'utente può scegliere (il database ricontrolla tutto).
  const opzioni = [];
  const prossimo = statoSuccessivoCommessa(commessa.stato);

  if (commessa.stato === 'annullata') {
    const annullamento = storico.find(function(r) { return r.a_stato === 'annullata'; });
    const prima = (annullamento && annullamento.da_stato) || 'approvata';
    if (ROLE === 'titolare' && commessa.preventivi?.stato === 'accettato') {
      opzioni.push({ stato: prima, tipo: 'riattivazione', testo: '↺ Riattiva: torna a ' + ETICHETTE_STATO_COMMESSA[prima] });
    }
  } else {
    // F7.2: con sql/33 'pronta' si segna solo con "Faldone consegnato"
    // nella scheda della commessa (js/31; il database blocca il resto).
    const prontaDalFaldone = prossimo === 'pronta' &&
      typeof verificaFaldoneDisponibile === 'function' && (await verificaFaldoneDisponibile());
    // F9.2: con sql/39 'chiusa' si segna solo con "Chiudi la commessa"
    // nella scheda (js/38: dichiarazione e fattura finale; il database
    // blocca il resto).
    const chiusaDallaScheda = prossimo === 'chiusa' &&
      typeof verificaFatturaFinaleDisponibile === 'function' && (await verificaFatturaFinaleDisponibile());
    if (prossimo && !prontaDalFaldone && !chiusaDallaScheda && (ROLE === 'titolare' || RUOLO_PASSO_COMMESSA[prossimo] === ROLE)) {
      opzioni.push({ stato: prossimo, tipo: 'avanti', testo: '→ ' + ETICHETTE_STATO_COMMESSA[prossimo] });
    }
    // F14.20: il riporto indietro anche a chi ha la delega del titolare (js/65, sql/73)
    if (ROLE === 'titolare' || (typeof haDelegaTitolare === 'function' && haDelegaTitolare('riporto_indietro_commessa'))) {
      ORDINE_STATI_COMMESSA
        .slice(0, ORDINE_STATI_COMMESSA.indexOf(commessa.stato))
        .reverse()
        .forEach(function(stato) {
          opzioni.push({ stato: stato, tipo: 'indietro', testo: '← Indietro a ' + ETICHETTE_STATO_COMMESSA[stato] });
        });
    }
    if (ROLE === 'titolare') {
      opzioni.push({ stato: 'annullata', tipo: 'annullamento', testo: '✕ Annulla la commessa' });
    }
  }

  const box = ge('msc-cambio');
  const avvisoFaldone = (commessa.stato === 'in_preparazione' && typeof faldoneCommessaAttivo === 'function' &&
      faldoneCommessaAttivo() && (ROLE === 'titolare' || RUOLO_PASSO_COMMESSA.pronta === ROLE))
    ? '<div class="al2 i">"Pronta" si segna con <b>Faldone consegnato</b> nella scheda della commessa (box "Date dei lavori e faldone"): il gestionale controlla date, personale e documenti.' +
      (canAccessPage('commessa-detail') ? ` <button class="btn sm" onclick="closeM('m-stato-commessa');openCommessaDetail('${esc(commessa.id)}')">Apri la commessa</button>` : '') + '</div>'
    : '';
  const avvisoChiusura = (commessa.stato === 'fine_lavori' && typeof chiusuraCommessaAttiva === 'function' &&
      chiusuraCommessaAttiva() && (ROLE === 'titolare' || RUOLO_PASSO_COMMESSA.chiusa === ROLE))
    ? '<div class="al2 i">"Chiusa" si segna con <b>Chiudi la commessa</b> nella scheda della commessa (box "Fine lavori"): servono la dichiarazione di corretta messa in opera nella cartella Chiusura e la fattura finale.' +
      (canAccessPage('commessa-detail') ? ` <button class="btn sm" onclick="closeM('m-stato-commessa');openCommessaDetail('${esc(commessa.id)}')">Apri la commessa</button>` : '') + '</div>'
    : '';
  // F8.5: lavori extra ancora da decidere prima di "Fine lavori" o
  // "Chiusa" (js/36, solo con sql/38).
  const avvisoLavoriExtra = prossimo && typeof htmlAvvisoLavoriExtraCambioStato === 'function' &&
      (ROLE === 'titolare' || RUOLO_PASSO_COMMESSA[prossimo] === ROLE)
    ? await htmlAvvisoLavoriExtraCambioStato(commessa.id, prossimo)
    : '';
  if (opzioni.length) {
    box.innerHTML = avvisoLavoriExtra + avvisoFaldone + avvisoChiusura + `
      <div class="f">
        <label>Nuovo stato</label>
        <select id="msc-stato" onchange="aggiornaCambioStatoCommessa()">
          ${opzioni.map(function(o, i) {
            return `<option value="${esc(o.stato)}" data-tipo="${esc(o.tipo)}" ${i === 0 ? 'selected' : ''}>${esc(o.testo)}</option>`;
          }).join('')}
        </select>
      </div>
      <div id="msc-spiegazione" style="font-size:12px;color:var(--m);margin:-4px 0 8px"></div>
      <div id="msc-checklist" style="display:none"></div>
      <div class="f">
        <label id="msc-nota-label">Nota</label>
        <textarea id="msc-nota" rows="2" oninput="aggiornaCambioStatoCommessa()"></textarea>
      </div>
    `;
    // F18.9: i 7 punti della presa in carico (js/108), senza aspettarli
    if (opzioni.some(function(o) { return o.stato === 'in_preparazione' && o.tipo === 'avanti'; })) {
      preparaChecklistPresaInCarico(commessa.id).catch(function(e) { console.warn('Checklist presa in carico:', e); });
    }
  } else {
    let motivo;
    if (commessa.stato === 'chiusa') {
      motivo = 'La commessa è chiusa.';
    } else if (commessa.stato === 'annullata') {
      motivo = ROLE === 'titolare'
        ? 'La commessa è annullata e il preventivo non è accettato: si riattiva da sola quando il preventivo torna accettato.'
        : 'La commessa è annullata: solo il titolare può riattivarla.';
    } else {
      motivo = 'Il prossimo passo (' + ETICHETTE_STATO_COMMESSA[prossimo] + ') lo segna: ' +
        NOMI_RUOLO_PASSO_COMMESSA[RUOLO_PASSO_COMMESSA[prossimo]] + ' (o il titolare).';
    }
    box.innerHTML = avvisoLavoriExtra + (avvisoFaldone || avvisoChiusura || ('<div class="al2 i">' + esc(motivo) + '</div>'));
  }

  ge('msc-conferma').style.display = opzioni.length ? '' : 'none';
  ge('msc-storico').innerHTML = htmlStoricoCommessa(storico);

  aggiornaCambioStatoCommessa();
  openM('m-stato-commessa');
}

function htmlPercorsoStatiCommessa(statoAttuale) {
  const iAttuale = ORDINE_STATI_COMMESSA.indexOf(statoAttuale);

  const passi = ORDINE_STATI_COMMESSA.map(function(stato, i) {
    const fatto = iAttuale >= 0 && i < iAttuale;
    const attuale = i === iAttuale;
    const stile = attuale
      ? 'background:var(--b);color:#fff;font-weight:700'
      : (fatto ? 'background:var(--gl);color:#085041' : 'background:var(--bg);color:var(--m)');
    return `<span style="padding:3px 8px;border-radius:12px;font-size:11px;${stile}">${fatto ? '✓ ' : ''}${esc(ETICHETTE_STATO_COMMESSA[stato])}</span>`;
  }).join('<span style="color:var(--m);font-size:11px">›</span>');

  return `
    <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">${passi}</div>
    ${statoAttuale === 'annullata' ? '<div class="al2 e" style="margin-top:8px">Commessa annullata</div>' : ''}
  `;
}

function htmlStoricoCommessa(storico) {
  if (!storico.length) {
    return '<div style="font-size:12px;color:var(--m)">Nessun passaggio registrato.</div>';
  }

  const titoli = {
    nascita: 'Nata',
    avanti: 'Avanti',
    indietro: 'Indietro',
    annullamento: 'Annullata',
    riattivazione: 'Riattivata'
  };

  return storico.map(function(r) {
    const chi = r.cambiato_da_nome
      ? r.cambiato_da_nome + (r.cambiato_da_ruolo ? ' (' + (NOMI_RUOLO_PASSO_COMMESSA[r.cambiato_da_ruolo] || r.cambiato_da_ruolo) + ')' : '')
      : 'automatico';
    const passaggio = r.da_stato
      ? (ETICHETTE_STATO_COMMESSA[r.da_stato] || r.da_stato) + ' → ' + (ETICHETTE_STATO_COMMESSA[r.a_stato] || r.a_stato)
      : (ETICHETTE_STATO_COMMESSA[r.a_stato] || r.a_stato);
    return `
      <div style="padding:6px 0;border-bottom:1px solid var(--bo);font-size:12px">
        <div><b>${esc(titoli[r.tipo] || r.tipo)}</b> · ${esc(passaggio)}</div>
        <div style="color:var(--m)">${esc(dataOraEsitoPreventivo(r.cambiato_il))} · ${esc(chi)}</div>
        ${r.nota ? `<div style="white-space:pre-wrap;margin-top:2px">${esc(r.nota)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function tipoCambioStatoCommessa() {
  const sel = ge('msc-stato');
  if (!sel || sel.selectedIndex < 0) return '';
  return sel.options[sel.selectedIndex].getAttribute('data-tipo') || '';
}

// Nota obbligatoria per indietro, annullamento e riattivazione.
function aggiornaCambioStatoCommessa() {
  const bottone = ge('msc-conferma');
  const sel = ge('msc-stato');
  if (!sel) {
    if (bottone) bottone.disabled = true;
    return;
  }

  const tipo = tipoCambioStatoCommessa();
  const notaObbligatoria = tipo !== 'avanti';
  const nota = (v('msc-nota') || '').trim();

  const etichetta = ge('msc-nota-label');
  if (etichetta) {
    etichetta.textContent = tipo === 'annullamento'
      ? 'Motivo dell\'annullamento *'
      : (notaObbligatoria ? 'Perché? *' : 'Nota (facoltativa)');
  }

  const spiegazione = ge('msc-spiegazione');
  if (spiegazione) {
    spiegazione.textContent = tipo === 'avanti'
      ? 'Vuol dire: ' + (DESCRIZIONE_PASSO_COMMESSA[sel.value] || '') + '.'
      : (tipo === 'annullamento'
        ? 'La commessa resta salvata con il suo codice e lo storico, ma non va più avanti.'
        : (tipo === 'riattivazione'
          ? 'La commessa torna nello stato che aveva prima dell\'annullamento.'
          : (ROLE === 'titolare' ? 'Solo il titolare riporta indietro una commessa.' : 'Riporti indietro la commessa ' + (typeof testoMiaDelega === 'function' ? testoMiaDelega('riporto_indietro_commessa') : 'con la delega del titolare') + ': resta nello storico.')));
  }

  if (bottone) bottone.disabled = notaObbligatoria && !nota;
  mostraChecklistPresaInCarico(); // F18.9 (js/108)
}

async function salvaStatoCommessa() {
  if (!commessaStatoAperta) return;

  const stato = v('msc-stato');
  const tipo = tipoCambioStatoCommessa();
  // F18.9: con la presa in carico la nota ricorda i 7 punti (js/108)
  const nota = [(v('msc-nota') || '').trim(), testoChecklistPresaInCarico(stato)].filter(Boolean).join('\n');

  if (!stato) return;
  if (tipo !== 'avanti' && !nota) {
    toast(tipo === 'annullamento' ? 'Scrivi il motivo dell\'annullamento' : 'Scrivi perché', 'err');
    return;
  }

  const domanda = tipo === 'annullamento'
    ? 'Confermi l\'annullamento della commessa ' + commessaStatoAperta.codice + '?'
    : 'Confermi: commessa ' + commessaStatoAperta.codice + ' → ' + (ETICHETTE_STATO_COMMESSA[stato] || stato) + '?';
  if (!confirm(domanda)) return;

  const bottone = ge('msc-conferma');
  if (bottone) bottone.disabled = true;

  const { data: nuovoStato, error } = await db.rpc('cambia_stato_commessa', {
    p_commessa_id: commessaStatoAperta.id,
    p_stato: stato,
    p_nota: nota || null
  });

  if (error) {
    if (bottone) bottone.disabled = false;
    toast('Stato non cambiato: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  const codice = commessaStatoAperta.codice;
  const preventivoId = commessaStatoAperta.preventivoId;
  closeM('m-stato-commessa');
  toast('Commessa ' + codice + ': ' + (ETICHETTE_STATO_COMMESSA[nuovoStato] || nuovoStato), 'ok');

  if (preventivoId) {
    try { await aggiornaDopoEsitoPreventivo(preventivoId); } catch (e) { console.warn('aggiornaDopoEsitoPreventivo:', e); }
  }
  await caricaCommesseToccaAMe();
}

// Dashboard: "Commesse: tocca a te" per rappresentante, capo tecnico e
// segreteria (le commesse il cui prossimo passo è del loro ruolo; il
// rappresentante vede solo le sue, come la policy commesse_lettura).
const BOX_COMMESSE_TOCCA_A_ME = {
  rappresentante: 'rap-commesse-tocca',
  capo_tecnico: 'ct-commesse-tocca',
  segreteria: 'seg-commesse-tocca'
};

async function caricaCommesseToccaAMe() {
  const box = ge(BOX_COMMESSE_TOCCA_A_ME[ROLE] || '');
  if (!box) return;

  if (!(await verificaStatiCommessaDisponibili())) {
    box.innerHTML = '';
    return;
  }

  const stati = ORDINE_STATI_COMMESSA.filter(function(stato) {
    const prossimo = statoSuccessivoCommessa(stato);
    return prossimo && RUOLO_PASSO_COMMESSA[prossimo] === ROLE;
  });

  const { data, error } = await db
    .from('commesse')
    .select('id, codice, stato, titolo, preventivo_id, aggiornato_il, clienti(ragione_sociale)')
    .in('stato', stati)
    .order('anno', { ascending: true })
    .order('numero', { ascending: true });

  if (error || !data?.length) {
    if (error) console.warn('Commesse tocca a te:', error.message);
    box.innerHTML = '';
    return;
  }

  box.innerHTML = `
    <div class="tit-section">📁 Commesse: tocca a te (${data.length})</div>
    <div class="rap-list-card" style="margin-bottom:14px">
      ${data.map(function(c) {
        const prossimo = statoSuccessivoCommessa(c.stato);
        return `
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">
            <div style="min-width:0">
              <div style="font-weight:700">${esc(c.codice)} · ${esc(c.clienti?.ragione_sociale || '')}</div>
              <div style="font-size:12px;color:var(--m)">
                ${esc(c.titolo || '')}${c.titolo ? ' · ' : ''}ora: ${esc(ETICHETTE_STATO_COMMESSA[c.stato] || c.stato)}
                · da segnare: <b>${esc(ETICHETTE_STATO_COMMESSA[prossimo] || '')}</b>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${canAccessPage('commessa-detail') ? `<button class="btn sm" onclick="openCommessaDetail('${esc(c.id)}')">Apri</button>` : ''}
              <button class="btn sm p" onclick="apriStatoCommessa('${esc(c.id)}', '${esc(c.preventivo_id || '')}')">Cambia stato</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Un solo salvataggio di scheda di rilievo alla volta: con un doppio clic su
// "Salva" di una scheda nuova (sql/48) ne nascevano due uguali.
let salvataggioSchedaRilievoInCorso = false;
[
  'salvaSchedaPorteRei', 'salvaSchedaEstintori', 'salvaSchedaRilevazioneIncendi',
  'salvaSchedaCompartimentazione', 'salvaSchedaVerniceIntumescente',
  'salvaSchedaCoppelle', 'salvaSchedaImpiantiSpegnimento'
].forEach(function(nome) {
  const originale = window[nome];
  if (typeof originale !== 'function') return;
  window[nome] = async function() {
    if (salvataggioSchedaRilievoInCorso) return;
    salvataggioSchedaRilievoInCorso = true;
    try {
      return await originale.apply(this, arguments);
    } finally {
      salvataggioSchedaRilievoInCorso = false;
    }
  };
});

// ---------------------------------------------------------------------
// "Cerca" nelle pagine Preventivi (richiesta di Erika del 04/11): titolare
// (preventivi-titolare), commerciale (preventivi) e rappresentante
// (preventivi-rapp). Filtra nel browser le schede già caricate: una scheda
// resta visibile se contiene tutte le parole scritte (maiuscole e accenti
// non contano). Quando un elenco si ricarica il filtro si riapplica da solo.
// ---------------------------------------------------------------------
const PAGINE_CERCA_PREVENTIVI = ['preventivi-titolare', 'preventivi', 'preventivi-rapp', 'progetti'];

function testoCercaPreventivi(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function schedePaginaPreventivi(sezione) {
  return Array.from(sezione.querySelectorAll('.card')).filter(function(card) {
    return !card.parentElement.closest('.card') && !card.closest('.sb');
  });
}

function filtraPreventiviPagina(pagina) {
  const sezione = ge('pg-' + pagina);
  const campo = ge('cerca-prev-' + pagina);
  const esito = ge('cerca-prev-' + pagina + '-esito');
  if (!sezione || !campo) return;
  const parole = testoCercaPreventivi(campo.value).split(/\s+/).filter(Boolean);
  const schede = schedePaginaPreventivi(sezione);
  let trovate = 0;
  schede.forEach(function(card) {
    const testo = testoCercaPreventivi(card.textContent);
    const ok = parole.every(function(p) { return testo.includes(p); });
    card.style.display = ok ? '' : 'none';
    if (ok) trovate++;
  });
  if (esito) {
    const messaggio = !parole.length ? '' :
      (pagina === 'progetti'
        ? (trovate ? (trovate === 1 ? '1 progetto trovato' : trovate + ' progetti trovati')
                   : 'Nessun progetto con questa ricerca')
        : (trovate ? (trovate === 1 ? '1 preventivo trovato' : trovate + ' preventivi trovati')
                   : 'Nessun preventivo con questa ricerca'));
    if (esito.textContent !== messaggio) esito.textContent = messaggio;
  }
}

PAGINE_CERCA_PREVENTIVI.forEach(function(pagina) {
  const sezione = ge('pg-' + pagina);
  if (!sezione || typeof MutationObserver !== 'function') return;
  let attesa = null;
  new MutationObserver(function(cambi) {
    // Solo i cambi negli elenchi, non nel campo e nel messaggio della ricerca.
    if (!cambi.some(function(c) { return !c.target.closest || !c.target.closest('.sb, [id$="-esito"]'); })) return;
    const campo = ge('cerca-prev-' + pagina);
    if (!campo || !campo.value.trim()) return;
    clearTimeout(attesa);
    attesa = setTimeout(function() { filtraPreventiviPagina(pagina); }, 50);
  }).observe(sezione, { childList: true, subtree: true });
});
