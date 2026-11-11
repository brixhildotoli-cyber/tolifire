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
  // F15.15 (sql/85): visita fatta e progetti collegati
  if (await verificaInvioDopoVisitaDisponibile()) await caricaProgettiDelleVisite(appDati);
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
      htmlVisitaAppuntamento(a) +
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
  mostraVisitaInAppuntamento(null); // F15.15

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
  mostraVisitaInAppuntamento(a); // F15.15

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

async function loadVerificheTecniche() {
  const box = ge('verifiche-tecniche-lista');

  if (!box) return;

  box.innerHTML = '<div class="load">Caricamento progetti...</div>';

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

          <span class="bx ${storicoProgetto ? stato.classe : 'bblue'}">
            ${storicoProgetto ? esc(stato.testo) : 'In verifica tecnica'}
          </span>
        </div>

        <div style="font-size:13px;white-space:pre-wrap;margin-top:10px">
          ${esc(progetto.descrizione_tecnica || 'Nessuna descrizione disponibile')}
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:10px">
          ${storicoProgetto ? 'Ultimo aggiornamento' : 'Ricevuto'}:
          ${esc(dataItaliana(progetto.aggiornato_il || progetto.creato_il))}
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

// =====================================================================
// F15.15 — VISITA FATTA E INVIO DEL PROGETTO ENTRO 24 H (sql/85)
// La visita (o il sopralluogo) del rappresentante si segna "✅ Visita fatta"
// (RPC segna_visita_fatta: chi e quando li scrive il database) e il progetto
// tecnico si collega alla visita da cui nasce (progetti_tecnici.appuntamento_id,
// campo "Visita da cui nasce" nella finestra del progetto, js/17). Se dal
// giorno lavorativo dopo la visita nessun progetto collegato è uscito dalla
// bozza: riga in "Cosa tocca a me" del rappresentante; dal secondo giorno
// lavorativo anche del titolare (js/46, RPC invii_dopo_visita). Senza sql/85
// non compare nulla (una chiamata RPC 404).
// =====================================================================
const VISITE_INVIO = { disponibile: null, progettiPerVisita: {} };
const TIPI_VISITA_INVIO = ['visita', 'sopralluogo'];

async function verificaInvioDopoVisitaDisponibile() {
  if (VISITE_INVIO.disponibile !== null) return VISITE_INVIO.disponibile;
  if (typeof db === 'undefined' || !db) return false;
  const { data, error } = await db.rpc('invio_dopo_visita_attivo');
  if (!error) {
    VISITE_INVIO.disponibile = data === true;
  } else if (error.code === 'PGRST202' || error.code === '42883' || /Could not find|does not exist/i.test(error.message || '')) {
    VISITE_INVIO.disponibile = false;
  } else {
    return false; // errore passeggero: si riprova la prossima volta
  }
  return VISITE_INVIO.disponibile;
}

function invioDopoVisitaAttivo() { return VISITE_INVIO.disponibile === true; }

function puoSegnareVisita(a) {
  if (!a || !invioDopoVisitaAttivo()) return false;
  if (!TIPI_VISITA_INVIO.includes(a.tipo) || a.stato === 'annullato') return false;
  return ROLE === 'titolare' || (ROLE === 'rappresentante' && a.rappresentante_id === ME.id);
}

function dataOraVisita(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Giorni lavorativi passati dalla visita (stessa regola del database, js/01)
function giorniDopoVisita(iso) {
  if (!iso || typeof giorniLavorativiTra !== 'function') return null;
  return giorniLavorativiTra(dataLocaleISO(new Date(iso)), dataLocaleISO(new Date()));
}

// Progetti collegati alle visite del mese (solo con sql/85)
async function caricaProgettiDelleVisite(appuntamenti) {
  VISITE_INVIO.progettiPerVisita = {};
  const ids = (appuntamenti || []).filter(function(a) { return TIPI_VISITA_INVIO.includes(a.tipo); }).map(function(a) { return a.id; });
  if (!ids.length || !invioDopoVisitaAttivo()) return;
  const { data, error } = await db.from('progetti_tecnici').select('id, titolo, stato, appuntamento_id').in('appuntamento_id', ids);
  if (error) return;
  (data || []).forEach(function(p) {
    (VISITE_INVIO.progettiPerVisita[p.appuntamento_id] = VISITE_INVIO.progettiPerVisita[p.appuntamento_id] || []).push(p);
  });
}

// Riga "visita fatta" sotto l'appuntamento nell'elenco del mese
function htmlVisitaAppuntamento(a) {
  if (!invioDopoVisitaAttivo() || !TIPI_VISITA_INVIO.includes(a.tipo) || a.stato === 'annullato') return '';
  const puo = puoSegnareVisita(a);
  if (!a.visita_fatta_il) {
    if (!puo || new Date(a.inizio).getTime() > Date.now()) return '';
    return '<div style="margin-top:10px"><button class="btn sm p" onclick="apriVisitaFatta(\'' + a.id + '\')">✅ Visita fatta</button>' +
      ' <span style="font-size:12px;color:var(--m)">poi invia il progetto entro il giorno lavorativo dopo</span></div>';
  }
  const progetti = VISITE_INVIO.progettiPerVisita[a.id] || [];
  const inviato = progetti.some(function(p) { return p.stato !== 'bozza'; });
  let stato;
  if (a.visita_senza_progetto) {
    stato = '<span class="bx bgray">Nessun progetto: ' + esc(a.visita_senza_progetto) + '</span>';
  } else if (inviato) {
    stato = '<span class="bx bok">📤 Progetto inviato</span>';
  } else {
    const gg = giorniDopoVisita(a.visita_fatta_il);
    stato = '<span class="bx ' + (gg !== null && gg >= 1 ? 'berr' : 'bwarn') + '">⏰ ' +
      (progetti.length ? 'Progetto in bozza: da inviare' : 'Progetto da creare e inviare') + '</span>';
  }
  const elenco = progetti.map(function(p) {
    return '<button class="btn sm" onclick="openProgettoDetail(\'' + p.id + '\')">📁 ' + esc(p.titolo || 'Progetto') + '</button>';
  }).join(' ');
  return '<div style="margin-top:10px;font-size:12px">✅ Visita fatta il ' + esc(dataOraVisita(a.visita_fatta_il)) +
    (a.visita_fatta_da_nome ? ' (segnata da ' + esc(a.visita_fatta_da_nome) + ')' : '') + ' ' + stato +
    (puo ? ' <button class="btn sm" onclick="apriVisitaFatta(\'' + a.id + '\')">✏️</button>' : '') +
    (elenco ? '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' + elenco + '</div>' : '') + '</div>';
}

// Riquadro nella finestra dell'appuntamento
function mostraVisitaInAppuntamento(a) {
  const box = ge('ma-visita-box');
  if (!box) return;
  const html = a ? htmlVisitaAppuntamento(a) : '';
  box.style.display = html ? 'block' : 'none';
  box.innerHTML = html;
}

async function apriVisitaFatta(id, senzaProgetto) {
  if (!(await verificaInvioDopoVisitaDisponibile())) {
    toast('La visita fatta non è ancora attiva (serve l\'aggiornamento del database)', 'err');
    return;
  }
  let a = (appDati || []).find(function(x) { return x.id === id; });
  if (!a) {
    const { data } = await db.from('appuntamenti_commerciali').select('*, clienti(ragione_sociale)').eq('id', id).maybeSingle();
    a = data;
  }
  if (!a) { toast('Appuntamento non trovato', 'err'); return; }
  if (!puoSegnareVisita(a)) { toast('La visita la segna il rappresentante della visita o il titolare', 'err'); return; }

  ge('vf-id').value = a.id;
  ge('vf-intro').innerHTML = '<b>' + esc(a.titolo || 'Visita') + '</b> · ' + esc(a.clienti?.ragione_sociale || 'Senza cliente') +
    ' · appuntamento del ' + esc(dataOraVisita(a.inizio));
  const quando = a.visita_fatta_il || (new Date(a.inizio).getTime() < Date.now() ? (a.fine && new Date(a.fine).getTime() < Date.now() ? a.fine : a.inizio) : new Date().toISOString());
  ge('vf-quando').value = datetimeLocaleApp(quando);
  ge('vf-quando').max = datetimeLocaleApp(new Date().toISOString());
  const senza = !!(senzaProgetto || a.visita_senza_progetto);
  ge('vf-senza').checked = senza;
  ge('vf-motivo').value = a.visita_senza_progetto || '';
  aggiornaVisitaSenzaProgetto();
  ge('vf-togli').style.display = a.visita_fatta_il ? '' : 'none';
  openM('m-visita-fatta');
}

function aggiornaVisitaSenzaProgetto() {
  const box = ge('vf-motivo-box');
  if (box) box.style.display = ge('vf-senza') && ge('vf-senza').checked ? 'block' : 'none';
}

async function salvaVisitaFatta(togli) {
  const id = v('vf-id');
  let quando = null;
  let motivo = null;
  if (!togli) {
    const testo = v('vf-quando');
    if (!testo) { toast('Indica quando è stata fatta la visita', 'err'); return; }
    const d = new Date(testo);
    if (d.getTime() > Date.now() + 5 * 60000) { toast('La visita non può essere nel futuro', 'err'); return; }
    quando = d.toISOString();
    if (ge('vf-senza').checked) {
      motivo = v('vf-motivo').trim();
      if (motivo.length < 3) { toast('Scrivi perché da questa visita non nasce un progetto', 'err'); ge('vf-motivo').focus(); return; }
    }
  } else if (!confirm('Togliere "visita fatta" da questo appuntamento?')) {
    return;
  }
  const { error } = await db.rpc('segna_visita_fatta', { p_appuntamento: id, p_quando: quando, p_senza_progetto: motivo });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  closeM('m-visita-fatta');
  toast(togli ? 'Visita fatta tolta' : (motivo ? 'Visita fatta, senza progetto' : 'Visita fatta: ora invia il progetto entro il giorno lavorativo dopo'), 'ok');
  if (ge('m-appuntamento') && ge('m-appuntamento').classList.contains('on')) closeM('m-appuntamento');
  if (ge('m-invii-visita') && ge('m-invii-visita').classList.contains('on')) apriInviiDopoVisita();
  if (typeof loadAppuntamentiCommerciali === 'function' && ge('app-lista') && ge('app-lista').offsetParent !== null) loadAppuntamentiCommerciali();
  if (typeof aggiornaToccaAMePiuTardi === 'function') aggiornaToccaAMePiuTardi();
}

// Visite che si possono collegare a un progetto (finestra del progetto, js/17):
// visite e sopralluoghi non annullati del rappresentante del progetto, del
// cliente (o senza cliente), degli ultimi 60 giorni, più quella già collegata.
async function visiteCollegabiliProgetto(clienteId, rappresentanteId, attualeId) {
  if (!(await verificaInvioDopoVisitaDisponibile()) || !rappresentanteId) return [];
  const dal = new Date(Date.now() - 60 * 86400000).toISOString();
  let q = db.from('appuntamenti_commerciali')
    .select('id, titolo, tipo, inizio, stato, cliente_id, visita_fatta_il, visita_senza_progetto')
    .eq('rappresentante_id', rappresentanteId)
    .in('tipo', TIPI_VISITA_INVIO)
    .neq('stato', 'annullato')
    .gte('inizio', dal)
    .order('inizio', { ascending: false })
    .limit(40);
  if (clienteId) q = q.or('cliente_id.eq.' + clienteId + ',cliente_id.is.null');
  const { data, error } = await q;
  let elenco = error ? [] : (data || []);
  if (attualeId && !elenco.some(function(a) { return a.id === attualeId; })) {
    const { data: attuale } = await db.from('appuntamenti_commerciali')
      .select('id, titolo, tipo, inizio, stato, cliente_id, visita_fatta_il, visita_senza_progetto').eq('id', attualeId).maybeSingle();
    if (attuale) elenco = [attuale].concat(elenco);
  }
  return elenco;
}

function etichettaVisitaProgetto(a) {
  return (a.tipo === 'sopralluogo' ? 'Sopralluogo' : 'Visita') + ' del ' +
    new Date(a.inizio).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' · ' + (a.titolo || '') + (a.visita_fatta_il ? ' ✅' : ' (non segnata fatta)');
}

// Elenco "Progetti da inviare dopo la visita" (riga di "Cosa tocca a me")
async function leggiInviiDopoVisita() {
  if (!['rappresentante', 'titolare'].includes(ROLE)) return null;
  if (!(await verificaInvioDopoVisitaDisponibile())) return null;
  const { data, error } = await db.rpc('invii_dopo_visita');
  if (error) {
    console.warn('Invii dopo la visita:', error.message);
    return null;
  }
  return data || [];
}

async function apriInviiDopoVisita() {
  const box = ge('iv-lista');
  if (!box) return;
  box.innerHTML = '<div class="load">Caricamento…</div>';
  if (!ge('m-invii-visita').classList.contains('on')) openM('m-invii-visita');
  const righe = await leggiInviiDopoVisita();
  if (righe === null) {
    box.innerHTML = '<div class="al2 w">Elenco non disponibile (serve l\'aggiornamento del database).</div>';
    return;
  }
  ge('iv-intro').textContent = ROLE === 'titolare'
    ? 'Visite fatte da almeno 2 giorni lavorativi senza un progetto inviato (tutti i rappresentanti).'
    : 'Le tue visite fatte senza un progetto inviato: invia il progetto entro il giorno lavorativo dopo la visita.';
  if (!righe.length) {
    box.innerHTML = '<div class="empty">Nessuna visita in attesa di invio 🎉</div>';
    return;
  }
  box.innerHTML = righe.map(function(r) {
    const azioni = [];
    if (r.progetto_id) azioni.push('<button class="btn sm p" onclick="closeM(\'m-invii-visita\');openProgettoDetail(\'' + r.progetto_id + '\')">📁 Apri il progetto e invialo</button>');
    else if (r.cliente_id && canAccessPage('cliente-detail')) azioni.push('<button class="btn sm p" onclick="closeM(\'m-invii-visita\');openClienteDetail(\'' + r.cliente_id + '\')">👤 Apri il cliente e crea il progetto</button>');
    if (!r.progetto_id) azioni.push('<button class="btn sm" onclick="apriVisitaFatta(\'' + r.appuntamento_id + '\', true)">🚫 Nessun progetto da questa visita</button>');
    return '<div class="card" style="margin-bottom:10px' + (r.livello === 'titolare' ? ';border-left:4px solid var(--r)' : '') + '">' +
      '<div style="font-weight:700">' + esc(r.cliente || 'Senza cliente') + ' · ' + esc(r.titolo || '') + '</div>' +
      '<div style="font-size:12px;color:var(--m);margin-top:4px">' +
        (r.tipo === 'sopralluogo' ? 'Sopralluogo' : 'Visita') + ' fatta il ' + esc(dataOraVisita(r.visita_fatta_il)) +
        ' · ' + esc(String(r.giorni_lavorativi)) + (r.giorni_lavorativi === 1 ? ' giorno lavorativo fa' : ' giorni lavorativi fa') +
        (ROLE === 'titolare' && r.rappresentante_nome ? ' · ' + esc(r.rappresentante_nome) : '') + '</div>' +
      '<div style="font-size:13px;margin-top:6px">' + (r.progetto_id
        ? '📝 Progetto in bozza: <b>' + esc(r.progetto_titolo || '') + '</b>' + (r.progetti_in_bozza > 1 ? ' (e altri ' + (r.progetti_in_bozza - 1) + ')' : '')
        : '⚠️ Nessun progetto collegato alla visita') + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' + azioni.join('') + '</div>' +
    '</div>';
  }).join('');
}
