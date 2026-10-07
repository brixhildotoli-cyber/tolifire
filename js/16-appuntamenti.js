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

async function loadVerificheTecniche() {
  const box = ge('verifiche-tecniche-lista');

  if (!box) return;

  box.innerHTML = '<div class="load">Caricamento verifiche...</div>';

  const { data, error } = await db
    .from('progetti_tecnici')
    .select('id, titolo, tipologia, descrizione_tecnica, stato, creato_il, clienti(ragione_sociale)')
    .eq('stato', 'in_verifica_tecnica')
    .order('creato_il', { ascending: false });

  if (error) {
    box.innerHTML =
      '<div class="al2 e">Errore: ' + esc(error.message) + '</div>';
    return;
  }

  if (!data || data.length === 0) {
    box.innerHTML =
      '<div class="empty">Nessun progetto tecnico da verificare.</div>';
    return;
  }

  box.innerHTML = data.map(function(progetto) {
    const cliente = progetto.clienti?.ragione_sociale || 'Cliente non disponibile';

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-size:15px;font-weight:700">
              ${esc(progetto.titolo)}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:4px">
              ${esc(cliente)} · ${esc(progetto.tipologia)}
            </div>
          </div>

          <span class="bx bblue">In verifica tecnica</span>
        </div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
  <button
    class="btn sm"
    onclick="openProgettoDetail('${progetto.id}')">
    Apri progetto
  </button>

  <button
    class="btn sm p"
    onclick="apriVerificaTecnica('${progetto.id}')">
    🔧 Gestisci verifica
  </button>
</div>
        <div style="font-size:13px;white-space:pre-wrap;margin-top:10px">
          ${esc(progetto.descrizione_tecnica)}
        </div>

        <div style="font-size:12px;color:var(--m);margin-top:10px">
          Inviato il ${new Date(progetto.creato_il).toLocaleDateString('it-IT')}
        </div>
      </div>
    `;
  }).join('');
}

