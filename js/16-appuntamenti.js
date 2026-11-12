// ── CALENDARIO APPUNTAMENTI COMMERCIALI ──────────────────────


function dataLocaleApp(iso) {
  const d = new Date(iso);

  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function datetimeLocaleApp(iso) {
  if (!iso) return '';

  const d = new Date(iso);

  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + 'T' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0');
}

function formatOraApp(iso) {
  if (!iso) return '';

  return new Date(iso).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadAppuntamentiCommerciali() {
  const inizioMese = new Date(appAnno, appMese, 1);
  const inizioMeseDopo = new Date(appAnno, appMese + 1, 1);

  const { data, error } = await db
    .from('appuntamenti_commerciali')
    .select('*, clienti(ragione_sociale)')
    .gte('inizio', inizioMese.toISOString())
    .lt('inizio', inizioMeseDopo.toISOString())
    .order('inizio');

  if (error) {
    console.error(error);
    toast('Errore calendario: ' + error.message, 'err');
    return;
  }

  appDati = data || [];
  renderCalendarioAppuntamenti();
}

function renderCalendarioAppuntamenti() {
  const label = ge('app-mese-label');
  const heads = ge('app-cal-heads');
  const body = ge('app-cal-body');
  const lista = ge('app-lista');
  
  if (!label || !heads || !body || !lista) return;

  const primo = new Date(appAnno, appMese, 1);
  const ultimoGiorno = new Date(appAnno, appMese + 1, 0).getDate();

  label.textContent = primo.toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric'
  });

  heads.innerHTML = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
    .map(g => '<div class="cal-head">' + g + '</div>')
    .join('');

  const spaziIniziali = (primo.getDay() + 6) % 7;
  let html = '';

  for (let i = 0; i < spaziIniziali; i++) {
    html += '<div class="cal-day other-month"></div>';
  }

  for (let giorno = 1; giorno <= ultimoGiorno; giorno++) {
    const data = appAnno + '-' +
      String(appMese + 1).padStart(2, '0') + '-' +
      String(giorno).padStart(2, '0');

    const oggi = new Date();
    const oggiString = oggi.getFullYear() + '-' +
      String(oggi.getMonth() + 1).padStart(2, '0') + '-' +
      String(oggi.getDate()).padStart(2, '0');

    const appuntamentiDelGiorno = appDati.filter(a =>
      dataLocaleApp(a.inizio) === data
    );

    html += '<div class="cal-day' +
      (data === oggiString ? ' today' : '') +
      '" onclick="apriNuovoAppuntamento(\'' + data + '\')">' +
      '<div class="cal-day-n">' + giorno + '</div>';

    appuntamentiDelGiorno.forEach(a => {
      const cliente = a.clienti?.ragione_sociale || 'Senza cliente';

      html += '<div class="cal-ev ord" ' +
        'onclick="event.stopPropagation();modificaAppuntamento(\'' + a.id + '\')">' +
        esc(formatOraApp(a.inizio) + ' · ' + a.titolo + ' — ' + cliente) +
        '</div>';
    });

    html += '</div>';
  }

  body.innerHTML = html;

  if (!appDati.length) {
    lista.innerHTML =
      '<div class="empty">Nessun appuntamento in questo mese.</div>';
    return;
  }

  lista.innerHTML = appDati.map(a => {
    const cliente = a.clienti?.ragione_sociale || 'Senza cliente';

    return '<div class="card" style="margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
      '<div>' +
      '<div style="font-weight:700">' + esc(a.titolo) + '</div>' +
      '<div style="font-size:12px;color:var(--m);margin-top:4px">' +
      esc(cliente) + ' · ' +
      new Date(a.inizio).toLocaleString('it-IT', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) +
      '</div>' +
      '</div>' +
      '<span class="bx bblue">' + esc(a.stato) + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="btn sm" onclick="modificaAppuntamento(\'' + a.id + '\')">✏️ Modifica</button>' +
      '<button class="btn sm" style="color:var(--r)" onclick="eliminaAppuntamento(\'' + a.id + '\')">🗑️ Elimina</button>' +
      '</div>' +
      '</div>';
  }).join('');
}

function apriNuovoAppuntamento(data) {
  ge('ma-id').value = '';
  ge('ma-titolo').value = '';
  ge('ma-tipo').value = 'visita';
  ge('ma-stato').value = 'pianificato';
  ge('ma-note').value = '';

  ge('ma-cliente').innerHTML =
    '<option value="">Nessun cliente / prospect</option>' +
    CLIS.map(c =>
      '<option value="' + c.id + '">' +
      esc(c.ragione_sociale) +
      '</option>'
    ).join('');

  ge('ma-inizio').value = data + 'T09:00';
  ge('ma-fine').value = data + 'T10:00';

  openM('m-appuntamento');
}

async function salvaAppuntamento() {
  const id = v('ma-id');
  const titolo = v('ma-titolo').trim();
  const inizio = v('ma-inizio');

  if (!titolo || !inizio) {
    toast('Titolo e data/ora di inizio sono obbligatori', 'err');
    return;
  }
  const fine = v('ma-fine');

if (
  fine &&
  new Date(fine).getTime() <= new Date(inizio).getTime()
) {
  toast(
    "L'orario di fine deve essere successivo all'orario di inizio.",
    'err'
  );
  return;
}

  const payload = {
    cliente_id: v('ma-cliente') || null,
    titolo: titolo,
    tipo: v('ma-tipo'),
    inizio: new Date(inizio).toISOString(),
    fine: v('ma-fine') ? new Date(v('ma-fine')).toISOString() : null,
    stato: v('ma-stato'),
    note: v('ma-note').trim() || null
  };

  let result;

  if (id) {
    result = await db
      .from('appuntamenti_commerciali')
      .update(payload)
      .eq('id', id);
  } else {
    payload.rappresentante_id = ME.id;
    payload.creato_da = ME.id;

    result = await db
      .from('appuntamenti_commerciali')
      .insert(payload);
  }

if (result.error) {
  if (
    result.error.code === '23514' ||
    result.error.message.includes('appuntamento_fine_valida')
  ) {
    toast(
      "L'orario di fine deve essere successivo all'orario di inizio.",
      'err'
    );
  } else {
    toast('Errore salvataggio appuntamento: ' + result.error.message, 'err');
  }

  return;
}

  closeM('m-appuntamento');
  toast(id ? 'Appuntamento aggiornato' : 'Appuntamento creato', 'ok');
  loadAppuntamentiCommerciali();
}

function modificaAppuntamento(id) {
  const a = appDati.find(x => x.id === id);

  if (!a) {
    toast('Appuntamento non trovato', 'err');
    return;
  }

  ge('ma-id').value = a.id;
  ge('ma-titolo').value = a.titolo || '';
  ge('ma-tipo').value = a.tipo || 'visita';
  ge('ma-stato').value = a.stato || 'pianificato';
  ge('ma-inizio').value = datetimeLocaleApp(a.inizio);
  ge('ma-fine').value = datetimeLocaleApp(a.fine);
  ge('ma-note').value = a.note || '';

  ge('ma-cliente').innerHTML =
    '<option value="">Nessun cliente / prospect</option>' +
    CLIS.map(c =>
      '<option value="' + c.id + '">' +
      esc(c.ragione_sociale) +
      '</option>'
    ).join('');

  ge('ma-cliente').value = a.cliente_id || '';

  openM('m-appuntamento');
}

async function eliminaAppuntamento(id) {
  if (!confirm('Vuoi eliminare questo appuntamento?')) return;

  const { error } = await db
    .from('appuntamenti_commerciali')
    .delete()
    .eq('id', id);

  if (error) {
    toast('Errore: ' + error.message, 'err');
    return;
  }

  toast('Appuntamento eliminato', 'ok');
  loadAppuntamentiCommerciali();
}

function cambiaMeseAppuntamenti(delta) {
  appMese += delta;

  if (appMese < 0) {
    appMese = 11;
    appAnno--;
  }

  if (appMese > 11) {
    appMese = 0;
    appAnno++;
  }

  loadAppuntamentiCommerciali();
}

// =====================================================================
// F15.19 (versione ridotta, decisione di Erika del 12/11): coda
// dell'ingegnere con i GIORNI DI ATTESA e l'URGENZA. Solo informazioni in
// più: l'ingegnere lavora come prima (stessi bottoni e passaggi).
// - Data di ingresso in verifica = ultimo passaggio a in_verifica_tecnica
//   in progetti_tecnici_storico (lo scrive il trigger
//   registra_storico_progetto_tecnico); se manca, aggiornato_il.
// - Giorni di attesa = giorniLavorativiTra (js/01, festività di sql/63).
// - Ordine: urgenti per primi, poi per data di arrivo (il più vecchio in
//   alto).
// - Urgente: colonna progetti_tecnici.urgente di sql/89; la cambia SOLO il
//   titolare (anche dal database). Senza sql/89 (RPC
//   urgente_progetti_attivo 404) niente badge né bottone, il resto c'è.
// - Oltre ATTESA_VERIFICA_LIMITE_GG giorni lavorativi: riga del titolare
//   "⏳ Progetti fermi dall'ingegnere" in Cosa tocca a me (js/46).
// =====================================================================
const ATTESA_VERIFICA_LIMITE_GG = 1;
const URGENZA_PROGETTI = { presente: null };

async function verificaUrgenzaProgettiDisponibile() {
  if (URGENZA_PROGETTI.presente !== null) return URGENZA_PROGETTI.presente;
  try {
    const { data, error } = await db.rpc('urgente_progetti_attivo');
    if (error) {
      // funzione assente = sql/89 non eseguito; altri errori (rete): si riprova dopo
      if (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || '')) {
        URGENZA_PROGETTI.presente = false;
      }
      return false;
    }
    URGENZA_PROGETTI.presente = data === true;
  } catch (e) {
    return false;
  }
  return URGENZA_PROGETTI.presente;
}

// id progetto → data di ingresso in verifica (stringa ISO) per i progetti
// dati (servono id, aggiornato_il, creato_il).
async function ingressiVerificaProgetti(progetti) {
  const esito = {};
  const elenco = (progetti || []).filter(function(p) { return p && p.id; });
  elenco.forEach(function(p) { esito[p.id] = p.aggiornato_il || p.creato_il || null; });
  const ids = elenco.map(function(p) { return p.id; });
  const trovati = {};
  for (let i = 0; i < ids.length; i += 100) {
    const blocco = ids.slice(i, i + 100);
    try {
      const { data, error } = await db.from('progetti_tecnici_storico')
        .select('progetto_id, creato_il')
        .in('progetto_id', blocco)
        .eq('stato_successivo', 'in_verifica_tecnica')
        .or('stato_precedente.is.null,stato_precedente.neq.in_verifica_tecnica')
        .order('creato_il', { ascending: false })
        .limit(1000);
      if (error || !Array.isArray(data)) continue;
      data.forEach(function(r) {
        if (!trovati[r.progetto_id]) trovati[r.progetto_id] = r.creato_il;
      });
    } catch (e) { /* resta aggiornato_il */ }
  }
  Object.keys(trovati).forEach(function(id) { esito[id] = trovati[id]; });
  return esito;
}

// Giorni lavorativi dall'ingresso a oggi (0 = arrivato oggi o in un giorno
// non lavorativo dopo l'ultimo lavorativo); null se la data non c'è.
function giorniAttesaVerifica(ingresso) {
  if (!ingresso || typeof giorniLavorativiTra !== 'function') return null;
  const d = new Date(ingresso);
  if (isNaN(d)) return null;
  const n = giorniLavorativiTra(d, new Date());
  return n === null ? null : Math.max(0, n);
}

function testoAttesaVerifica(giorni) {
  if (giorni === null || giorni === undefined) return '';
  if (giorni < 1) return 'In attesa da meno di 1 giorno lavorativo';
  return 'In attesa da ' + giorni + (giorni === 1 ? ' giorno lavorativo' : ' giorni lavorativi');
}

function attesaVerificaOltre(giorni) {
  return giorni !== null && giorni !== undefined && giorni > ATTESA_VERIFICA_LIMITE_GG;
}

// Progetti in verifica tecnica con giorni di attesa e urgenza (per js/46).
// null = lettura non riuscita.
async function progettiVerificaInAttesa() {
  const conUrgenza = await verificaUrgenzaProgettiDisponibile();
  const { data, error } = await db.from('progetti_tecnici')
    .select('id, aggiornato_il, creato_il' + (conUrgenza ? ', urgente' : ''))
    .eq('stato', 'in_verifica_tecnica').limit(1000);
  if (error || !Array.isArray(data)) return null;
  const ingressi = await ingressiVerificaProgetti(data);
  return data.map(function(p) {
    return { id: p.id, ingresso: ingressi[p.id], giorni: giorniAttesaVerifica(ingressi[p.id]), urgente: !!p.urgente };
  });
}

function htmlBadgeUrgenteProgetto(progetto) {
  return progetto && progetto.urgente ? '<span class="bx berr">🚨 Urgente</span>' : '';
}

// Bottone "🚨 Segna urgente" / "Togli urgente": solo titolare (informatico
// compreso) e solo con sql/89.
function htmlBottoneUrgenzaProgetto(progetto) {
  if (ROLE !== 'titolare' || !progetto || !('urgente' in progetto) || !URGENZA_PROGETTI.presente) return '';
  return progetto.urgente
    ? '<button class="btn sm" onclick="cambiaUrgenzaProgetto(\'' + progetto.id + '\', false)">Togli urgente</button>'
    : '<button class="btn sm" onclick="cambiaUrgenzaProgetto(\'' + progetto.id + '\', true)">🚨 Segna urgente</button>';
}

async function cambiaUrgenzaProgetto(progettoId, urgente) {
  if (ROLE !== 'titolare') return;
  const { data, error } = await db.from('progetti_tecnici')
    .update({ urgente: !!urgente }).eq('id', progettoId).select('id');
  if (error) {
    toast('Urgenza non salvata: ' + error.message, 'err');
    return;
  }
  if (!data || !data.length) {
    toast('Urgenza non salvata: progetto non trovato', 'err');
    return;
  }
  toast(urgente ? '🚨 Progetto segnato urgente' : 'Urgenza tolta');
  const pagina = document.querySelector('.page.on')?.id;
  if (pagina === 'pg-progetto-detail' && typeof openProgettoDetail === 'function') {
    openProgettoDetail(progettoId);
  } else {
    loadVerificheTecniche();
  }
}

// Riquadro nella scheda progetto (js/17): badge, attesa e bottone del
// titolare. Vuoto se non c'è niente da dire.
async function mostraAttesaUrgenzaProgetto(progetto, contenitoreId) {
  const box = ge(contenitoreId);
  if (!box || !progetto) return;
  await verificaUrgenzaProgettiDisponibile();
  let attesa = null;
  if (progetto.stato === 'in_verifica_tecnica') {
    const ingressi = await ingressiVerificaProgetti([progetto]);
    attesa = giorniAttesaVerifica(ingressi[progetto.id]);
  }
  const badge = htmlBadgeUrgenteProgetto(progetto);
  const bottone = htmlBottoneUrgenzaProgetto(progetto);
  const testo = attesa !== null
    ? '<b style="color:' + (attesaVerificaOltre(attesa) ? 'var(--r)' : 'inherit') + '">⏳ In verifica tecnica: ' +
      esc(testoAttesaVerifica(attesa).replace(/^In attesa/, 'in attesa')) + '</b>'
    : '';
  if (!badge && !bottone && !testo) { box.innerHTML = ''; return; }
  box.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px;font-size:13px">' +
    badge + testo + bottone + '</div>';
}

async function loadVerificheTecniche() {
  const box = ge('verifiche-tecniche-lista');

  if (!box) return;

  box.innerHTML = '<div class="load">Caricamento progetti...</div>';

  const conUrgenza = await verificaUrgenzaProgettiDisponibile(); // F15.19

  const { data, error } = await db
    .from('progetti_tecnici')
    .select(`
      id,
      titolo,
      tipologia,
      descrizione_tecnica,
      stato,
      creato_il,
      aggiornato_il,
      ${conUrgenza ? 'urgente,' : ''}
      clienti(ragione_sociale)
    `)
    .order('aggiornato_il', { ascending: false });

  if (error) {
    box.innerHTML =
      '<div class="al2 e">Errore: ' + esc(error.message) + '</div>';
    return;
  }

  const progetti = data || [];

  const daVerificare = progetti.filter(function(progetto) {
    return progetto.stato === 'in_verifica_tecnica';
  });

  // F15.19: giorni di attesa dall'ingresso in verifica; urgenti per primi,
  // poi in ordine di arrivo
  const ingressi = await ingressiVerificaProgetti(daVerificare);
  daVerificare.forEach(function(progetto) {
    progetto._ingresso = ingressi[progetto.id] || null;
    progetto._attesa = giorniAttesaVerifica(progetto._ingresso);
  });
  daVerificare.sort(function(a, b) {
    if (!!a.urgente !== !!b.urgente) return a.urgente ? -1 : 1;
    return String(a._ingresso || '').localeCompare(String(b._ingresso || ''));
  });

  const storico = progetti.filter(function(progetto) {
    return [
      'da_integrare',
      'in_preventivazione',
      'inviato_a_commerciale',
      'pronto_per_preventivo'
    ].includes(progetto.stato);
  });

  if (!daVerificare.length && !storico.length) {
    box.innerHTML =
      '<div class="empty">Nessun progetto tecnico disponibile.</div>';
    return;
  }

  function dataItaliana(data) {
    if (!data) return '—';

    return new Date(data).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  function cardProgetto(progetto, storicoProgetto) {
    const cliente =
      progetto.clienti?.ragione_sociale || 'Cliente non disponibile';

    const stato = {
      da_integrare: {
        testo: 'Rimandato al rappresentante per integrazione',
        classe: 'bwarn'
      },
      in_preventivazione: {
        testo: 'Inviato ad Acquisti · in preventivazione',
        classe: 'bok'
      },
      inviato_a_commerciale: {
        testo: 'Inviato ad Acquisti',
        classe: 'bok'
      },
      pronto_per_preventivo: {
        testo: 'Pronto per preventivo',
        classe: 'bok'
      }
    }[progetto.stato] || {
      testo: progetto.stato || 'Stato non definito',
      classe: 'bgray'
    };

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-size:15px;font-weight:700">
              ${esc(progetto.titolo || 'Progetto tecnico')}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:4px">
              ${esc(cliente)} · ${esc(progetto.tipologia || 'Tipologia non indicata')}
            </div>
          </div>

          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start">
            ${!storicoProgetto ? htmlBadgeUrgenteProgetto(progetto) : ''}
            <span class="bx ${storicoProgetto ? stato.classe : 'bblue'}">
              ${storicoProgetto ? esc(stato.testo) : 'In verifica tecnica'}
            </span>
          </div>
        </div>

        <div style="font-size:13px;white-space:pre-wrap;margin-top:10px">
          ${esc(progetto.descrizione_tecnica || 'Nessuna descrizione disponibile')}
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:10px">
          ${storicoProgetto ? 'Ultimo aggiornamento' : 'Ricevuto'}:
          ${esc(dataItaliana(storicoProgetto ? (progetto.aggiornato_il || progetto.creato_il) : (progetto._ingresso || progetto.aggiornato_il || progetto.creato_il)))}
          ${!storicoProgetto && progetto._attesa !== null && progetto._attesa !== undefined ? `
            · <b style="color:${attesaVerificaOltre(progetto._attesa) ? 'var(--r)' : 'inherit'}">⏳ ${esc(testoAttesaVerifica(progetto._attesa))}</b>
          ` : ''}
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button
            class="btn sm"
            onclick="openProgettoDetail('${progetto.id}')"
          >
            Apri progetto
          </button>

          ${!storicoProgetto ? `
            <button
              class="btn sm p"
              onclick="apriVerificaTecnica('${progetto.id}')"
            >
              🔧 Gestisci verifica
            </button>
            ${htmlBottoneUrgenzaProgetto(progetto)}
          ` : ''}
        </div>
      </div>
    `;
  }

  box.innerHTML = `
    <div class="rap-section">
      🔧 Da verificare
      <span style="color:var(--m)">(${daVerificare.length})</span>
    </div>

    ${
      daVerificare.length
        ? daVerificare.map(function(progetto) {
            return cardProgetto(progetto, false);
          }).join('')
        : '<div class="empty">Nessun progetto da verificare.</div>'
    }

    <div class="rap-section" style="margin-top:28px">
      🕘 Storico progetti inviati
      <span style="color:var(--m)">(${storico.length})</span>
    </div>

    ${
      storico.length
        ? storico.map(function(progetto) {
            return cardProgetto(progetto, true);
          }).join('')
        : '<div class="empty">Nessun progetto inviato dall’ingegnere.</div>'
    }
  `;
}
