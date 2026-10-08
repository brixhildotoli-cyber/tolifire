// ── RAPPRESENTANTE ───────────────────────────────────────────
var _allProspect = [];
let contestoCompletamentoLead = null;

var rapCalAnno = new Date().getFullYear();
var rapCalMese = new Date().getMonth();

function rapCalendarioPrev() {
  rapCalMese--;

  if (rapCalMese < 0) {
    rapCalMese = 11;
    rapCalAnno--;
  }

  loadCalendarioDisponibilitaRappresentante();
}

function rapCalendarioNext() {
  rapCalMese++;

  if (rapCalMese > 11) {
    rapCalMese = 0;
    rapCalAnno++;
  }

  loadCalendarioDisponibilitaRappresentante();
}

function rapDataIso(anno, mese, giorno) {
  return anno + '-' +
    String(mese + 1).padStart(2, '0') + '-' +
    String(giorno).padStart(2, '0');
}

async function loadCalendarioDisponibilitaRappresentante() {
  const calendario = ge('rap-calendario-team');
  const titolo = ge('rap-cal-mese');
  const lista = ge('rap-impegni-team-lista');

  if (!calendario || !titolo || !lista) return;

  calendario.innerHTML = '<div class="load">Caricamento calendario...</div>';
  lista.innerHTML = '<div class="load">Caricamento impegni...</div>';

  const primoGiorno = rapDataIso(rapCalAnno, rapCalMese, 1);
  const ultimoGiorno = rapDataIso(
    rapCalAnno,
    rapCalMese,
    new Date(rapCalAnno, rapCalMese + 1, 0).getDate()
  );

  const nomeMese = new Date(rapCalAnno, rapCalMese, 1)
    .toLocaleDateString('it-IT', {
      month: 'long',
      year: 'numeric'
    });

  titolo.textContent = nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1);

  const { data, error } = await db
    .from('ordini_lavoro')
    .select(`
      id,
      data_pianificata,
      fascia_oraria,
      stato,
      tecnico_id,
      utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)
    `)
    .is('eliminato_il', null)
    .not('tecnico_id', 'is', null)
    .gte('data_pianificata', primoGiorno)
    .lte('data_pianificata', ultimoGiorno)
    .neq('stato', 'annullato')
    .order('data_pianificata')
    .order('fascia_oraria');

  if (error) {
    calendario.innerHTML =
      '<div class="al2 e">Errore calendario: ' + esc(error.message) + '</div>';

    lista.innerHTML =
      '<div class="al2 e">Impossibile caricare gli impegni.</div>';

    return;
  }

  const impegni = data || [];
  const perData = {};

  impegni.forEach(function(impegno) {
    if (!perData[impegno.data_pianificata]) {
      perData[impegno.data_pianificata] = [];
    }

    perData[impegno.data_pianificata].push(impegno);
  });

  const primo = new Date(rapCalAnno, rapCalMese, 1);
  const ultimoNumero = new Date(rapCalAnno, rapCalMese + 1, 0).getDate();

  // Converte domenica da 0 a 6, così la settimana parte da lunedì.
  const giornoInizio = (primo.getDay() + 6) % 7;

  let html = '';

  for (let vuoto = 0; vuoto < giornoInizio; vuoto++) {
    html += '<div class="rap-month-day empty"></div>';
  }

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  for (let giorno = 1; giorno <= ultimoNumero; giorno++) {
    const dataIso = rapDataIso(rapCalAnno, rapCalMese, giorno);
    const impegniDelGiorno = perData[dataIso] || [];

    const dataCorrente = new Date(rapCalAnno, rapCalMese, giorno);
    const isOggi = dataCorrente.getTime() === oggi.getTime();

    const tecnici = [...new Set(
      impegniDelGiorno.map(function(impegno) {
        const utente = impegno.utenti;
        return utente
          ? ((utente.nome || '') + ' ' + (utente.cognome || '')).trim()
          : 'Tecnico assegnato';
      })
    )];

    const nomiTecnici = tecnici.slice(0, 2).map(function(nome) {
      return '<div class="rap-cal-tech">👷 ' + esc(nome) + '</div>';
    }).join('');

    const altriTecnici = tecnici.length > 2
      ? '<div class="rap-cal-more">+' + (tecnici.length - 2) + ' tecnici</div>'
      : '';

    html += `
      <div class="rap-month-day ${impegniDelGiorno.length ? 'busy' : ''} ${isOggi ? 'today' : ''}">
        <div class="rap-cal-day-number">${giorno}</div>

        ${impegniDelGiorno.length ? `
          <div class="rap-cal-count">
            ${impegniDelGiorno.length} intervent${impegniDelGiorno.length === 1 ? 'o' : 'i'}
          </div>
          ${nomiTecnici}
          ${altriTecnici}
        ` : `
          <div class="rap-cal-free">Libero</div>
        `}
      </div>
    `;
  }

  calendario.innerHTML = html;

  if (!impegni.length) {
    lista.innerHTML =
      '<div class="empty">✅ Nessun tecnico impegnato in ' +
      esc(nomeMese) +
      '.</div>';

    return;
  }

  lista.innerHTML = Object.keys(perData).map(function(dataIso) {
    const dataFormattata = new Date(dataIso + 'T12:00:00')
      .toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });

    return `
      <div class="rap-team-day">
        <div class="rap-team-date">
          ${esc(dataFormattata)}
          <span>${perData[dataIso].length} intervent${perData[dataIso].length === 1 ? 'o' : 'i'}</span>
        </div>

        ${perData[dataIso].map(function(impegno) {
          const utente = impegno.utenti;
          const tecnico = utente
            ? ((utente.nome || '') + ' ' + (utente.cognome || '')).trim()
            : 'Tecnico assegnato';

          return `
            <div class="rap-team-row">
              <span>👷 ${esc(tecnico)}</span>
              <span class="bx bblue">${esc(impegno.fascia_oraria || 'Orario da definire')}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
}


async function loadImpegniTeamAnonimi() {
  const box = ge('rap-impegni-team-lista');

  if (!box) return;

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  const tra14Giorni = new Date(oggi);
  tra14Giorni.setDate(tra14Giorni.getDate() + 14);

  const { data, error } = await db.rpc('impegni_tecnici_dashboard', {
    p_dal: oggi.toISOString().split('T')[0],
    p_al: tra14Giorni.toISOString().split('T')[0]
  });

  if (error) {
    box.innerHTML =
      '<div class="al2 e">Impossibile caricare gli impegni del team.</div>';
    return;
  }

  if (!data || !data.length) {
    box.innerHTML =
      '<div class="empty">Nessun impegno tecnico pianificato nei prossimi 14 giorni.</div>';
    return;
  }

  const perData = {};

  data.forEach(function(impegno) {
    if (!perData[impegno.data]) {
      perData[impegno.data] = [];
    }

    perData[impegno.data].push(impegno);
  });

  box.innerHTML = Object.keys(perData).map(function(data) {
    const dataFormattata = new Date(data + 'T12:00:00')
      .toLocaleDateString('it-IT', {
        weekday: 'long',
        day: '2-digit',
        month: 'long'
      });

    return `
      <div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--m)">
          ${esc(dataFormattata)}
        </div>

        ${perData[data].map(function(impegno) {
          return `
            <div style="display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:0.5px solid var(--bo)">
              <span style="font-weight:600">
                👷 ${esc(impegno.ruolo)} — ${esc(impegno.tecnico)}
              </span>

              <span class="bx bblue">
                ${esc(impegno.fascia)}
              </span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
}


async function loadDashRappresentante() {
  caricaAvvisiLeadAssegnate();
  caricaAvvisiPreventiviRappresentante();
  var ora = new Date().getHours();
  var saluto = ora < 14 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
  var el;
  el = ge('rapp-welcome'); if(el) el.textContent = saluto + (ME?.nome ? ', ' + esc(ME.nome) : '');
  el = ge('ddate-r'); if(el) el.textContent = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});

  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var oggiStr = oggi.toISOString().split('T')[0];
  var primoDelMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1).toISOString();
  var in30Str = new Date(Date.now()+30*86400000).toISOString().split('T')[0];

  // Step 1: tutti i sopralluoghi del rappresentante (servono per KPI, lista, distinct clienti)
  var rSopr = await db.from('sopralluoghi')
    .select('id,cliente_id,ragione_sociale,urgenza,creato_il,odl_creato_id,indirizzo')
    .eq('rappresentante_id', ME.id)
    .order('creato_il',{ascending:false});
  var sopralluoghi = rSopr.data || [];

  var aperti = sopralluoghi.filter(function(s){ return !s.odl_creato_id; });
  var convertitiMese = sopralluoghi.filter(function(s){
    return s.odl_creato_id && s.creato_il && s.creato_il >= primoDelMese;
  });
  // Clienti assegnati direttamente al rappresentante.
const { data: clientiRappresentante, error: erroreClientiRappresentante } = await db
  .from('clienti')
  .select('id')
  .eq('rappresentante_id', ME.id)
  .is('eliminato_il', null);

var cliIdsArr = erroreClientiRappresentante
  ? []
  : (clientiRappresentante || []).map(function(cliente) {
      return cliente.id;
    });

  // KPI 4: presidi scaduti dei tuoi clienti
  var presidiScaduti = 0;
  if(cliIdsArr.length){
    var rPS = await db.from('impianti')
      .select('id',{count:'exact',head:true})
      .is('eliminato_il',null)
      .in('cliente_id', cliIdsArr)
      .lt('data_prossimo_controllo', oggiStr);
    presidiScaduti = rPS.error ? '—' : (rPS.count || 0);
  }

  // Render KPI
  el = ge('rap-k-sopr-aperti'); if(el) el.textContent = aperti.length;
  el = ge('rap-k-sopr-conv'); if(el) el.textContent = convertitiMese.length;
  el = ge('rap-k-tuoi-cli'); if(el) el.textContent = cliIdsArr.length;
  el = ge('rap-k-presidi-scad'); if(el) el.textContent = presidiScaduti;
    // Progetti rimandati dall’ingegnere al rappresentante.
  // Progetti rimandati al rappresentante per integrazione.
const boxProgetti = ge('rap-progetti-da-integrare');

const { data: progettiDaIntegrare, error: erroreProgetti } = await db
  .from('progetti_tecnici')
  .select(`
    id,
    titolo,
    nota_integrazione,
    nota_verifica_tecnica,
    aggiornato_il
  `)
  .eq('stato', 'da_integrare')
  .eq('rappresentante_id', ME.id)
  .order('aggiornato_il', { ascending: false });

if (boxProgetti) {
  const chiaveLetti = `progetti_da_integrare_letti_${ME.id}`;

  let giaLetti = [];
  try {
    const salvati = JSON.parse(localStorage.getItem(chiaveLetti) || '[]');
    giaLetti = Array.isArray(salvati) ? salvati : [];
  } catch {
    giaLetti = [];
  }

  const nuovi = (progettiDaIntegrare || []).filter(function(progetto) {
    const versione = [
      progetto.id,
      progetto.aggiornato_il || '',
      progetto.nota_integrazione || progetto.nota_verifica_tecnica || ''
    ].join('|');

    return !giaLetti.includes(versione);
  });

  if (erroreProgetti || !nuovi.length) {
    boxProgetti.innerHTML = '';
  } else {
    boxProgetti.innerHTML = nuovi.map(function(progetto) {
      return `
        <button
          id="rap-progetto-notifica-${progetto.id}"
          class="rap-primary"
          style="background:#b45309;margin-top:14px"
          onclick="apriProgettoDaIntegrareDaDashboard('${progetto.id}')"
        >
          <span class="ico">🔧</span>

          <span class="body">
            <span class="title">
              Progetto da integrare: ${esc(progetto.titolo || 'Progetto tecnico')}
            </span>

            <span class="sub">
              È stata richiesta un’integrazione. Apri il progetto, leggi la nota e completa i dati richiesti.
            </span>
          </span>

          <span class="chev">›</span>
        </button>
      `;
    }).join('');
  }
}

  // Lista sopralluoghi da seguire (aperti, top 5)
  var elL = ge('rap-sopr-lista');
  if(elL){
    if(!aperti.length){
      elL.innerHTML = '<div class="rap-list-card"><div class="tit-empty">🎉 Nessun sopralluogo aperto. <button class="btn p sm" style="margin-left:8px" onclick="gotoPage(\'sopralluogo\')">+ Nuovo</button></div></div>';
    } else {
      elL.innerHTML = aperti.slice(0,5).map(function(s){
        var urg = s.urgenza || 'normale';
        return '<div class="rap-sopr-card">' +
          '<div class="body">' +
            '<div class="cli">' + esc(s.ragione_sociale || '—') + '</div>' +
            '<div class="meta">' + fd(s.creato_il) + (esc(s.indirizzo) ? ' · ' + esc(s.indirizzo) : '') + '</div>' +
          '</div>' +
          '<span class="urg ' + urg + '">' + urg.replace('_',' ') + '</span>' +
          '<button class="btn sm p" data-sid="'+s.id+'" onclick="accettaSopralluogo(this.dataset.sid)">✅ Accetta</button>' +
        '</div>';
      }).join('') + (aperti.length > 5 ? '<div style="text-align:center;padding:8px"><button class="btn sm" onclick="gotoPage(\'trattative\')">Vedi tutti ('+aperti.length+')</button></div>' : '');
    }
  }

  // B3 — I miei interventi inviati (top 10), con stato attuale visibile
  var rMieiOdl = await db.from('ordini_lavoro')
    .select('id,numero,tipo,stato,data_pianificata,fascia_oraria,creato_il,in_ritardo_il,clienti(ragione_sociale),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)')
    .is('eliminato_il', null)
    .eq('creato_da', ME.id)
    .order('creato_il',{ascending:false})
    .limit(10);
  var elM = ge('rap-miei-odl-lista');
  if(elM){
    if(rMieiOdl.error){
      elM.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Errore: '+esc(rMieiOdl.error.message)+'</div></div>';
    } else {
      var mieiOdl = rMieiOdl.data || [];
      if(!mieiOdl.length){
        elM.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Nessun intervento ancora inviato.<br><span style="font-size:12px">Quando crei un intervento ("+ Intervento da pianificare" o accettando un sopralluogo) lo trovi qui con il suo stato attuale.</span></div></div>';
      } else {
        elM.innerHTML = '<div class="rap-list-card">' + mieiOdl.map(function(o){
          var cli = o.clienti?.ragione_sociale || '—';
          var tec = o.utenti ? (o.utenti.nome + ' ' + o.utenti.cognome) : null;
          var ritardo = o.in_ritardo_il ? '<span class="bx berr" style="margin-left:6px">⏰ In ritardo</span>' : '';
          var when = o.data_pianificata ? fd(o.data_pianificata) : '—';
          var fascia = o.fascia_oraria ? ' · '+o.fascia_oraria : '';
          return '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px;gap:10px">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-weight:600">'+esc(cli)+(o.numero?' <span style="color:var(--m);font-weight:400">· #'+esc(o.numero)+'</span>':'')+'</div>' +
              '<div style="font-size:12px;color:var(--m);margin-top:2px">Inviato il '+fd(o.creato_il)+(tec?' · 👤 '+esc(tec):' · 👤 da assegnare')+'</div>' +
              (when!=='—'?'<div style="font-size:12px;color:var(--m)">📅 '+when+fascia+'</div>':'') +
            '</div>' +
            '<div style="text-align:right;flex-shrink:0">'+bs(o.stato)+ritardo+'</div>' +
          '</div>';
        }).join('') + '</div>';
      }
    }
  }

  await loadCalendarioDisponibilitaRappresentante();
  // Presidi in scadenza dei tuoi clienti (lista, 30gg)
  var elS = ge('rap-scadenze-lista');
  if(elS){
    if(!cliIdsArr.length){
      elS.innerHTML = '<div class="rap-list-card"><div class="tit-empty">Nessun cliente associato ai tuoi sopralluoghi.</div></div>';
    } else {
      var rSc = await db.from('impianti')
        .select('tipo,matricola,ubicazione,data_prossimo_controllo,clienti(ragione_sociale)')
        .is('eliminato_il', null)
        .in('cliente_id', cliIdsArr)
        .lte('data_prossimo_controllo', in30Str)
        .order('data_prossimo_controllo')
        .limit(8);
      var pres = rSc.data || [];
      if(!pres.length){
        elS.innerHTML = '<div class="rap-list-card"><div class="tit-empty">✅ Nessun presidio in scadenza nei prossimi 30 giorni</div></div>';
      } else {
        elS.innerHTML = '<div class="rap-list-card">' + pres.map(function(p){
          var cli = p.clienti?.ragione_sociale || '—';
          var scaduto = p.data_prossimo_controllo && p.data_prossimo_controllo < oggiStr;
          return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px">' +
            '<div><div style="font-weight:600">'+esc(cli)+'</div>' +
            '<div style="color:var(--m);font-size:12px">'+tpl(p.tipo)+(p.matricola?' #'+esc(p.matricola):'')+(p.ubicazione?' — '+esc(p.ubicazione):'')+'</div></div>' +
            '<div style="text-align:right"><div class="'+(scaduto?'se':sc(p.data_prossimo_controllo))+'">'+fd(p.data_prossimo_controllo)+'</div>' +
            '<div style="font-size:11px;color:var(--m)">'+dd2(p.data_prossimo_controllo)+'</div></div>' +
          '</div>';
        }).join('') + '</div>';
      }
    }
  }
}

async function apriProgettoDaIntegrareDaDashboard(progettoId) {
  if (ROLE !== 'rappresentante') return;

  const { data: progetto, error } = await db
    .from('progetti_tecnici')
    .select(`
      id,
      stato,
      aggiornato_il,
      nota_integrazione,
      nota_verifica_tecnica
    `)
    .eq('id', progettoId)
    .eq('rappresentante_id', ME.id)
    .eq('stato', 'da_integrare')
    .single();

  if (error || !progetto) {
    toast(
      'Impossibile aprire il progetto: ' + (error?.message || 'progetto non trovato'),
      'err'
    );
    return;
  }

  const chiaveLetti = `progetti_da_integrare_letti_${ME.id}`;
  const versione = [
    progetto.id,
    progetto.aggiornato_il || '',
    progetto.nota_integrazione || progetto.nota_verifica_tecnica || ''
  ].join('|');

  let giaLetti = [];
  try {
    const salvati = JSON.parse(localStorage.getItem(chiaveLetti) || '[]');
    giaLetti = Array.isArray(salvati) ? salvati : [];
  } catch {
    giaLetti = [];
  }

  if (!giaLetti.includes(versione)) {
    giaLetti.push(versione);
    localStorage.setItem(chiaveLetti, JSON.stringify(giaLetti));
  }

  // Rimuove subito soltanto la notifica cliccata.
  const notifica = ge(`rap-progetto-notifica-${progettoId}`);
  if (notifica) notifica.remove();

  // Apre direttamente la scheda del progetto rinviato.
  await openProgettoDetail(progettoId);
}


async function loadPreventiviRappresentante() {
  if (ROLE !== 'rappresentante') return;

  const box = ge('preventivi-rapp-lista');
  if (!box) return;

  box.innerHTML = '<div class="load">Caricamento preventivi...</div>';

  const { data: preventivi, error } = await db
    .from('preventivi')
    .select(`
      id,
      numero,
      preventivo_cliente_pdf_path,
      pdf_esterno_titolare_path,
pdf_esterno_titolare_nome,
      preventivo_cliente_pdf_nome,
      preventivo_cliente_pdf_generato_il,
      inviato_a_rappresentante_il,
      clienti!inner(
        ragione_sociale,
        rappresentante_id
      )
    `)
    .eq('stato', 'inviato_a_rappresentante')
    .eq('clienti.rappresentante_id', ME.id)
    .or('preventivo_cliente_pdf_path.not.is.null,pdf_esterno_titolare_path.not.is.null')
    .order('inviato_a_rappresentante_il', { ascending: false });

  if (error) {
    box.innerHTML = `
      <div class="al2 e">
        Errore caricamento preventivi: ${esc(error.message)}
      </div>
    `;
    return;
  }

  if (!preventivi?.length) {
    box.innerHTML = `
      <div class="empty">
        Nessun preventivo ricevuto al momento.
      </div>
    `;
    return;
  }

  box.innerHTML = preventivi.map(function(preventivo) {
    const dataInvio = preventivo.inviato_a_rappresentante_il
      ? new Date(preventivo.inviato_a_rappresentante_il)
          .toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
      : '—';

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div style="min-width:0">
            <div style="font-size:15px;font-weight:700">
              Preventivo n. ${esc(String(preventivo.numero || '—'))}
            </div>

            <div style="font-size:13px;margin-top:4px">
              ${esc(preventivo.clienti?.ragione_sociale || 'Cliente')}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:4px">
              Inviato dal commerciale il ${esc(dataInvio)}
            </div>
          </div>

          <span class="bx bok">Pronto per il cliente</span>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <button
            class="btn sm p"
            onclick="apriPdfPreventivoRappresentante('${preventivo.id}')"
          >
            📄 Apri / scarica PDF
          </button>
          <button class="btn sm" onclick="rinviaPreventivoAlCommercialeDalRappresentante('${preventivo.id}')">
  ↩ Rinvio al commerciale
</button>
        </div>
      </div>
    `;
  }).join('');
}

async function apriPdfPreventivoRappresentante(preventivoId) {
  if (ROLE !== 'rappresentante') return;

  const nuovaScheda = window.open('', '_blank');

  const { data: preventivo, error } = await db
    .from('preventivi')
    .select(`
      id,
      preventivo_cliente_pdf_path,
      pdf_esterno_titolare_path,
      clienti!inner(rappresentante_id)
    `)
    .eq('id', preventivoId)
    .eq('stato', 'inviato_a_rappresentante')
    .eq('clienti.rappresentante_id', ME.id)
    .single();

  const percorsoPdf =
    preventivo?.pdf_esterno_titolare_path ||
    preventivo?.preventivo_cliente_pdf_path;

  if (error || !percorsoPdf) {
    if (nuovaScheda) nuovaScheda.close();

    toast(
      'PDF non disponibile: ' + (error?.message || ''),
      'err'
    );
    return;
  }

  const { data: urlData, error: erroreUrl } = await db.storage
    .from('preventivi-documenti')
    .createSignedUrl(percorsoPdf, 3600);

  if (erroreUrl || !urlData?.signedUrl) {
    if (nuovaScheda) nuovaScheda.close();

    toast(
      'Errore apertura PDF: ' + (erroreUrl?.message || ''),
      'err'
    );
    return;
  }

  const { error: erroreLettura } = await db.rpc(
    'marca_preventivo_letto_rappresentante',
    { p_preventivo_id: preventivoId }
  );

  if (erroreLettura) {
    console.warn(
      'Impossibile segnare il preventivo come letto:',
      erroreLettura.message
    );
  }

  if (nuovaScheda) {
    nuovaScheda.location.href = urlData.signedUrl;
  } else {
    window.open(urlData.signedUrl, '_blank', 'noopener');
  }

  await loadPreventiviRappresentante();
}

async function rinviaPreventivoAlCommercialeDalRappresentante(preventivoId) {
  if (ROLE !== 'rappresentante') return;

  if (!confirm('Rinviare il preventivo al commerciale per le modifiche?')) return;

  const { error } = await db.rpc(
    'rinvia_preventivo_al_commerciale_da_rappresentante',
    { p_preventivo_id: preventivoId }
  );

  if (error) {
    toast('Errore nel rinvio: ' + error.message, 'err');
    return;
  }

  toast('Preventivo rinviato al commerciale', 'ok');
  await loadPreventiviRappresentante();
}

async function caricaAvvisiPreventiviRappresentante() {
  if (ROLE !== 'rappresentante') return;

  const box = ge('rap-preventivi-ricevuti');
  if (!box) return;

  const chiaveLetti = `preventivi_notificati_letti_${ME.id}`;
  const giaLetti = new Set(
    JSON.parse(localStorage.getItem(chiaveLetti) || '[]')
  );

  const { data: preventivi, error } = await db
    .from('preventivi')
    .select(`
      id,
      clienti!inner(rappresentante_id)
    `)
    .eq('stato', 'inviato_a_rappresentante')
    .eq('clienti.rappresentante_id', ME.id)
    .is('letto_rappresentante_il', null)
    .not('preventivo_cliente_pdf_path', 'is', null);

  const nuoviPreventivi = (preventivi || []).filter(function(preventivo) {
    return !giaLetti.has(preventivo.id);
  });

  if (error || !nuoviPreventivi.length) {
    box.innerHTML = '';
    return;
  }

  const testo = nuoviPreventivi.length === 1
    ? 'Hai 1 nuovo preventivo da inviare'
    : `Hai ${nuoviPreventivi.length} nuovi preventivi da inviare`;

  box.innerHTML = `
    <button
      class="rap-primary"
      style="background:#b91c1c;margin-top:14px"
      onclick="apriPreventiviRappresentanteDaDashboard()"
    >
      <span class="ico">🔴</span>
      <span class="body">
        <span class="title">${testo}</span>
        <span class="sub">
          Il commerciale ha preparato il PDF per il tuo cliente.
        </span>
      </span>
      <span class="chev">›</span>
    </button>
  `;
}

async function apriPreventiviRappresentanteDaDashboard() {
  const box = ge('rap-preventivi-ricevuti');
  if (box) box.innerHTML = '';

  const chiaveLetti = `preventivi_notificati_letti_${ME.id}`;

  const { data: preventivi } = await db
    .from('preventivi')
    .select(`
      id,
      clienti!inner(rappresentante_id)
    `)
    .eq('stato', 'inviato_a_rappresentante')
    .eq('clienti.rappresentante_id', ME.id)
    .is('letto_rappresentante_il', null)
    .not('preventivo_cliente_pdf_path', 'is', null);

  const giaLetti = new Set(
    JSON.parse(localStorage.getItem(chiaveLetti) || '[]')
  );

  (preventivi || []).forEach(function(preventivo) {
    giaLetti.add(preventivo.id);
  });

  localStorage.setItem(chiaveLetti, JSON.stringify([...giaLetti]));

  gotoPage('preventivi-rapp');

  // Prova comunque ad aggiornare anche Supabase.
  await Promise.all(
    (preventivi || []).map(function(preventivo) {
      return db.rpc('marca_preventivo_letto_rappresentante', {
        p_preventivo_id: preventivo.id
      });
    })
  );
}

async function caricaAvvisiPreventiviTitolare() {
  if (ROLE !== 'titolare') return;

  const box = ge('tit-avviso-preventivi');
  if (!box) return;

  const { data: preventivi, error } = await db
    .from('preventivi')
    .select('id')
    .not('inviato_a_titolare_il', 'is', null)
    .is('letto_titolare_il', null)
    .not('preventivo_cliente_pdf_path', 'is', null);

  if (error || !preventivi?.length) {
    box.innerHTML = '';
    return;
  }

  const testo = preventivi.length === 1
    ? 'Hai 1 preventivo da controllare'
    : `Hai ${preventivi.length} preventivi da controllare`;

  box.innerHTML = `
    <button
      class="rap-primary"
      style="background:#b91c1c;margin:14px 0"
      onclick="apriPreventiviTitolareDaDashboard()"
    >
      <span class="ico">🔴</span>
      <span class="body">
        <span class="title">${testo}</span>
        <span class="sub">
          Preventivi inviati dal commerciale: puoi controllarli e modificarli.
        </span>
      </span>
      <span class="chev">›</span>
    </button>
  `;
}

async function apriPreventiviTitolareDaDashboard() {
  const { data: preventivi } = await db
    .from('preventivi')
    .select('id')
    .not('inviato_a_titolare_il', 'is', null)
    .is('letto_titolare_il', null)
    .not('preventivo_cliente_pdf_path', 'is', null);

  for (const preventivo of preventivi || []) {
    await db.rpc('marca_preventivo_letto_titolare', {
      p_preventivo_id: preventivo.id
    });
  }

  const box = ge('tit-avviso-preventivi');
  if (box) box.innerHTML = '';

  gotoPage('preventivi-titolare');
}

async function loadPreventiviTitolare() {
  const boxDaControllare = ge('preventivi-titolare-da-controllare');
  const boxInviati = ge('preventivi-titolare-inviati');

  if (!boxDaControllare || !boxInviati) return;

  boxDaControllare.innerHTML =
    '<div class="load">Caricamento preventivi...</div>';

  boxInviati.innerHTML =
    '<div class="load">Caricamento preventivi...</div>';

  const { data: preventivi, error } = await db
    .from('preventivi')
    .select(`
      id,
      numero,
      stato,
      inviato_a_titolare_il,
      inviato_a_rappresentante_il,
      aggiornato_il,
      clienti(ragione_sociale)
    `)
    .order('numero', { ascending: false });

  if (error) {
    const messaggio = `
      <div class="al2 e">
        Errore caricamento preventivi: ${esc(error.message)}
      </div>
    `;

    boxDaControllare.innerHTML = messaggio;
    boxInviati.innerHTML = '';
    return;
  }

  const creaCard = function(preventivo, inviato) {
    const ricevutoDalCommerciale = !!preventivo.inviato_a_titolare_il;

    const data = inviato
      ? preventivo.inviato_a_rappresentante_il
      : preventivo.aggiornato_il;

    const dataTesto = data
      ? new Date(data).toLocaleString('it-IT')
      : '—';

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div>
            <div style="font-size:15px;font-weight:700">
              Preventivo n. ${esc(String(preventivo.numero || '—'))}
            </div>

            <div style="font-size:13px;margin-top:4px">
              ${esc(preventivo.clienti?.ragione_sociale || 'Cliente')}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:4px">
              ${inviato ? 'Inviato al rappresentante il ' : 'Aggiornato il '}
              ${esc(dataTesto)}
            </div>
          </div>

          <span class="bx ${inviato ? 'bok' : 'bblue'}">
            ${inviato ? 'Inviato' : 'Da controllare'}
          </span>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <button
            class="btn sm p"
            onclick="apriPreventivoTitolare(
              '${preventivo.id}',
              ${ricevutoDalCommerciale}
            )"
          >
            ✏️ Apri e modifica
          </button>

          <button
            class="btn sm"
            style="color:var(--r)"
            onclick="eliminaPreventivoTitolare('${preventivo.id}')"
          >
            🗑️ Elimina
          </button>
        </div>
      </div>
    `;
  };

  const daControllare = (preventivi || []).filter(function(preventivo) {
    return preventivo.stato !== 'inviato_a_rappresentante';
  });

  const inviati = (preventivi || []).filter(function(preventivo) {
    return preventivo.stato === 'inviato_a_rappresentante';
  });

  boxDaControllare.innerHTML = daControllare.length
    ? daControllare.map(function(preventivo) {
        return creaCard(preventivo, false);
      }).join('')
    : '<div class="empty">Nessun preventivo da controllare.</div>';

  boxInviati.innerHTML = inviati.length
    ? inviati.map(function(preventivo) {
        return creaCard(preventivo, true);
      }).join('')
    : '<div class="empty">Nessun preventivo ancora inviato.</div>';
}


async function eliminaPreventivoTitolare(preventivoId) {
  if (ROLE !== 'titolare') {
    toast('Solo il titolare può eliminare un preventivo', 'err');
    return;
  }

  const { data: preventivo, error: erroreLettura } = await db
    .from('preventivi')
    .select(`
      id,
      numero,
      progetto_tecnico_id,
      preventivo_cliente_pdf_path,
      pdf_esterno_titolare_path
    `)
    .eq('id', preventivoId)
    .single();

  if (erroreLettura || !preventivo) {
    toast('Preventivo non trovato: ' + (erroreLettura?.message || ''), 'err');
    return;
  }

  if (!confirm(
    'Eliminare definitivamente il preventivo n. ' +
    preventivo.numero +
    '? Verranno eliminate anche voci e fornitori collegati.'
  )) {
    return;
  }

  const { error: erroreEliminazione } = await db
    .from('preventivi')
    .delete()
    .eq('id', preventivoId);

  if (erroreEliminazione) {
    toast('Errore eliminazione preventivo: ' + erroreEliminazione.message, 'err');
    return;
  }

  const percorsiPdf = [
    preventivo.preventivo_cliente_pdf_path,
    preventivo.pdf_esterno_titolare_path
  ].filter(Boolean);

  if (percorsiPdf.length) {
    const { error: erroreFile } = await db.storage
      .from('preventivi-documenti')
      .remove(percorsiPdf);

    if (erroreFile) {
      console.warn(
        'Preventivo eliminato, ma alcuni PDF sono rimasti nel bucket:',
        erroreFile.message
      );
    }
  }

  if (preventivo.progetto_tecnico_id) {
    await db
      .from('progetti_tecnici')
      .update({ stato: 'inviato_a_commerciale' })
      .eq('id', preventivo.progetto_tecnico_id)
      .eq('stato', 'in_preventivazione');
  }

  toast('Preventivo eliminato', 'ok');
  await loadPreventiviTitolare();
}

async function apriPreventivoTitolare(
  preventivoId,
  ricevutoDalCommerciale = false
) {
  if (ricevutoDalCommerciale) {
    const { error } = await db.rpc(
      'marca_preventivo_letto_titolare',
      { p_preventivo_id: preventivoId }
    );

    if (error) {
      toast('Errore apertura preventivo: ' + error.message, 'err');
      return;
    }
  }

  await openPreventivoDetail(preventivoId);
}






async function loadTrattative() {

  montaLeadSitoTitolare();

 const richieste = [
  db
    .from('clienti')
    .select('*')
    .eq('stato', 'prospect')
    .is('eliminato_il', null)
    .order('creato_il', { ascending: false }),

  db
    .from('pipeline_crm')
    .select('*')
    .order('aggiornato_il', { ascending: false })
];

// Solo il titolare carica anche i progetti tecnici collegati alle lead.
if (ROLE === 'titolare') {
  richieste.push(
    db
      .from('progetti_tecnici')
      .select('id,cliente_id,titolo,tipologia,stato,creato_il')
      .order('creato_il', { ascending: false })
  );
}

const risultati = await Promise.all(richieste);

const clientiRes = risultati[0];
const pipelineRes = risultati[1];
const progettiRes = risultati[2];

  if (clientiRes.error) {
    toast('Errore caricamento lead: ' + clientiRes.error.message, 'err');
    return;
  }

  const pipelinePerCliente = {};

  (pipelineRes.data || []).forEach(p => {
    if (!pipelinePerCliente[p.cliente_id]) {
      pipelinePerCliente[p.cliente_id] = p;
    }
  });

const progettiPerCliente = {};

if (
  ROLE === 'titolare' &&
  progettiRes &&
  !progettiRes.error
) {
  (progettiRes.data || []).forEach(function(progetto) {
    if (!progettiPerCliente[progetto.cliente_id]) {
      progettiPerCliente[progetto.cliente_id] = [];
    }

    progettiPerCliente[progetto.cliente_id].push(progetto);
  });
}

 _allProspect = (clientiRes.data || []).map(c => ({
  ...c,
  pipeline: pipelinePerCliente[c.id] || null,
  progettiTecnici: progettiPerCliente[c.id] || []
}));

_allProspect = _allProspect.filter(c =>
  !c.pipeline || c.pipeline.fase !== 'perso'
);

renderProspectListT(_allProspect);
}

function renderProspectListT(data) {
  const el = ge('tr-prospect-list');
  if (!el) return;

  if (!data.length) {
    el.innerHTML =
       '<div class="empty">Nessun lead. <br><button class="btn p sm" style="margin-top:10px" onclick="apriNuovoLead()">+ Nuovo lead</button></div>';
    return;
  }

  const etichetteFonte = {
    google_ads: 'Google Ads',
    passaparola: 'Passaparola',
    relazionale: 'Relazionale',
    sito_web: 'Sito web',
    telefonata: 'Telefonata',
    evento: 'Evento',
    altro: 'Altro'
  };

  const etichetteFase = {
    primo_contatto: 'Primo contatto',
    qualificato: 'Qualificato',
    appuntamento_fissato: 'Appuntamento fissato',
    sopralluogo: 'Sopralluogo',
    progetto_tecnico: 'Progetto tecnico',
    preventivo_inviato: 'Preventivo inviato',
    vinto: 'Vinto',
    perso: 'Perso'
  };

  el.innerHTML = data.map(c => {
    const p = c.pipeline;
    const telefono = c.referente_telefono
      ? '<a href="tel:' + esc(c.referente_telefono) + '" class="btn sm">Chiama</a>'
      : '';

    const autore = (UTENTI || []).find(
    u => u.id === c.rappresentante_id
  );

const inseritoDa = autore
  ? `${autore.nome || ''} ${autore.cognome || ''}`.trim()
  : 'Utente non disponibile';

    const fonte = p
      ? (etichetteFonte[p.fonte_lead] || p.fonte_lead || '—')
      : 'Da qualificare';

    const fase = p
      ? (etichetteFase[p.fase] || p.fase || 'Primo contatto')
      : 'Senza trattativa';

    const richiamo = p && p.data_prossimo_contatto
      ? ' · Prossimo: ' + fd(p.data_prossimo_contatto)
      : '';

    const valore = p && p.valore_stimato
      ? ' · € ' + Number(p.valore_stimato).toLocaleString('it-IT')
      : '';


      const progettiTecnici = c.progettiTecnici || [];

const riepilogoProgetti = (
  ROLE === 'titolare' &&
  progettiTecnici.length
) ? `
  <div
    style="
      margin-top:12px;
      padding:10px;
      background:var(--bg);
      border-radius:8px;
    "
  >
    <div style="font-size:12px;font-weight:700;margin-bottom:7px">
      📐 Progetti tecnici collegati (${progettiTecnici.length})
    </div>

    ${progettiTecnici.map(function(progetto) {
      return `
        <button
          class="btn sm"
          style="margin:0 6px 6px 0"
          onclick="openProgettoDetail('${progetto.id}')"
        >
          📎 ${esc(progetto.titolo || 'Progetto tecnico')}
          · ${esc(progetto.tipologia || 'Apri allegati')}
        </button>
      `;
    }).join('')}
  </div>
` : '';

    return `

    <div class="card" style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div>
        <div style="font-size:14px;font-weight:600">${esc(c.ragione_sociale)}</div>

        <div style="font-size:12px;color:var(--m);margin-top:3px">
          ${esc(c.citta || 'Città non indicata')}
          ${c.referente_nome ? ' · ' + esc(c.referente_nome) : ''}
          ${c.referente_telefono ? ' · ' + esc(c.referente_telefono) : ''}
        </div>
      </div>

      <span class="bx bblue">${esc(fase)}</span>
    </div>

    <div style="font-size:12px;color:var(--m);margin-top:8px">
      🎯 Fonte: ${esc(fonte)}
      ${richiamo}
      ${valore}
    </div>
    
    ${ROLE === 'titolare' ? `
  <div style="font-size:12px;color:var(--m);margin-top:5px">
    👤 Inserito da: ${esc(inseritoDa)}
  </div>
` : ''}

    ${riepilogoProgetti}

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn sm" onclick="openClienteDetail('${c.id}')">
        Scheda
      </button>

      ${telefono}

      <button class="btn sm info" onclick="apriAppuntamentoDaLead('${c.id}')">
        📅 Fissa appuntamento
      </button>

            ${ROLE === 'rappresentante' && p?.fase === 'primo_contatto' ? `
        <button
          class="btn sm p"
          onclick="completaAnagraficaDopoContatto('${c.id}')"
        >
          ✅ Contatto completato
        </button>
      ` : ''}

      <button
        class="btn sm"
        style="color:var(--r)"
        onclick="segnaLeadPerso('${c.id}')">
        ✕ Segna perso
      </button>
    </div>
  </div>
`;
}).join('');
}

function apriNuovoLead() {
  [
    'lead-ragione',
    'lead-referente',
    'lead-telefono',
    'lead-email',
    'lead-citta',
    'lead-dettaglio',
    'lead-prossimo-contatto',
    'lead-valore',
    'lead-note'
  ].forEach(id => {
    const el = ge(id);
    if (el) el.value = '';
  });

  ge('lead-attivita').value = '';
  ge('lead-fonte').value = '';
  ge('lead-prossima-azione').value = 'chiamata';
 ge('lead-servizio').value = '';
  ge('lead-errore').innerHTML = '';

  openM('m-lead');
}

async function salvaLead() {
  const ragioneSociale = v('lead-ragione').trim();
  const fonteLead = v('lead-fonte');
  const erroreBox = ge('lead-errore');
  const bottone = ge('lead-salva');

  if (!ragioneSociale || !fonteLead) {
    erroreBox.innerHTML =
      '<div class="al2 e">Ragione sociale e fonte del lead sono obbligatorie.</div>';
    return;
  }

  bottone.disabled = true;
  bottone.textContent = 'Creazione in corso...';
  erroreBox.innerHTML = '';

  try {
    const { data: cliente, error: erroreCliente } = await db
      .from('clienti')
      .insert({
        ragione_sociale: ragioneSociale,
        tipo_attivita: v('lead-attivita') || null,
        referente_nome: v('lead-referente').trim() || null,
        referente_telefono: v('lead-telefono').trim() || null,
        referente_email: v('lead-email').trim() || null,
        citta: v('lead-citta').trim() || null,
      stato: 'prospect',
ads_inserito_da_rappresentante: ['rappresentante', 'titolare'].includes(ROLE),
rappresentante_id: ME.id,
        note_commerciali: v('lead-note').trim() || null
      })
      .select()
      .single();

    if (erroreCliente) throw erroreCliente;


    const { error: errorePipeline } = await db
      .from('pipeline_crm')
      .insert({
        cliente_id: cliente.id,
        rappresentante_id: ME.id,
        fase: 'primo_contatto',
        fonte_lead: fonteLead,
        dettaglio_fonte: v('lead-dettaglio').trim() || null,
        valore_stimato: parseFloat(v('lead-valore')) || null,
        data_prossimo_contatto: v('lead-prossimo-contatto') || null,
        tipo_prossima_azione: v('lead-prossima-azione') || null,
        servizio_richiesto: v('lead-servizio') || null,
        note_trattativa: v('lead-note').trim() || null
      });

    if (errorePipeline) {
      throw new Error(
        'Prospect creato, ma trattativa non salvata: ' +
        errorePipeline.message
      );
    }

    closeM('m-lead');
    toast('Lead creato correttamente', 'ok');

    await loadCS();
    await loadTrattative();

  } catch (e) {
    erroreBox.innerHTML =
      '<div class="al2 e">Errore: ' + esc(e.message) + '</div>';
  } finally {
    bottone.disabled = false;
    bottone.textContent = 'Crea lead';
  }
}

async function completaAnagraficaDopoContatto(clienteId) {
  const lead = _allProspect.find(function(cliente) {
    return cliente.id === clienteId;
  });

  if (!lead?.pipeline) {
    toast('Trattativa non trovata', 'err');
    return;
  }

  await editCliById(clienteId, {
    pipelineId: lead.pipeline.id
  });

  const titolo = ge('mcli-title');
  if (titolo) {
    titolo.textContent = 'Completa anagrafica dopo il contatto';
  }

  toast(
    'Per confermare il contatto compila P.IVA, referente, telefono, indirizzo, CAP e città.',
    'ok'
  );
}

function apriAppuntamentoDaLead(clienteId) {
  const lead = _allProspect.find(c => c.id === clienteId);

  apriNuovoAppuntamento(new Date().toISOString().split('T')[0]);

  ge('ma-cliente').value = clienteId;

  if (lead) {
    ge('ma-titolo').value = 'Contatto lead — ' + lead.ragione_sociale;
  }
}
async function segnaLeadPerso(clienteId) {
  const lead = _allProspect.find(c => c.id === clienteId);

  if (!lead || !lead.pipeline) {
    toast('Questo prospect non ha ancora una trattativa collegata', 'err');
    return;
  }

  const motivo = prompt(
    'Motivo della perdita / archiviazione del lead:',
    lead.pipeline.motivo_perdita || ''
  );

  if (motivo === null) return;

  const { error } = await db
    .from('pipeline_crm')
    .update({
      fase: 'perso',
      motivo_perdita: motivo.trim() || null,
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', lead.pipeline.id);

  if (error) {
    toast('Errore: ' + error.message, 'err');
    return;
  }

  toast('Lead archiviato come perso', 'ok');
  await loadTrattative();
}

function filterTrattative() {
  var q = v('tr-search').toLowerCase();
  renderProspectListT(_allProspect.filter(function(c) {
    return esc(c.ragione_sociale).toLowerCase().includes(q) || (esc(c.referente_nome)||'').toLowerCase().includes(q) || (esc(c.citta)||'').toLowerCase().includes(q);
  }));
}

async function loadSopralluoghiList() {
  var el = ge('tr-sop-list'); if(!el) return;
  // Rappresentante vede solo i suoi; altri ruoli vedono tutti
  var q = db.from('sopralluoghi').select('*').order('creato_il',{ascending:false}).limit(30);
  if(ROLE === 'rappresentante') q = q.eq('rappresentante_id', ME.id);
  var res = await q;
  var data = res.data || [];
  if(!data.length) { el.innerHTML = '<div class="empty">Nessun sopralluogo.<br><button class="btn p sm" style="margin-top:10px" onclick="gotoPage(\'sopralluogo\')">Nuova scheda</button></div>'; return; }
  el.innerHTML = data.map(function(s) {
    var cls = s.urgenza === 'urgente' ? 'berr' : s.urgenza === 'entro_30gg' ? 'bwarn' : 'bgray';
    var azione;
    if(s.odl_creato_id){
      azione = '<span style="font-size:12px;color:var(--g);font-weight:600">✅ Intervento creato</span>';
    } else {
      azione = '<button class="btn sm p" data-sid="'+s.id+'" onclick="accettaSopralluogo(this.dataset.sid)">✅ Accetta → crea OdL</button>';
    }
    return '<div class="card" style="margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
      '<div style="flex:1"><div style="font-size:14px;font-weight:600">' + (esc(s.ragione_sociale)||'—') + '</div>' +
      '<div style="font-size:12px;color:var(--m)">' + fd(s.creato_il) + ' · ' + (esc(s.indirizzo)||'') + '</div></div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">' +
      '<span class="bx ' + cls + '">' + (s.urgenza||'normale') + '</span>' + azione +
      '</div></div></div>';
  }).join('');
}

async function salvaSchopralluogo() {
  var rag = v('sl-rag').trim();
  var richiesta = v('sl-richiesta').trim();
  var errEl = ge('sl-err');
  if(!rag) { errEl.innerHTML = '<div class="al2 e">Inserisci la ragione sociale.</div>'; return; }
  if(!richiesta) { errEl.innerHTML = '<div class="al2 e">Descrivi la richiesta del cliente (sezione D).</div>'; return; }
  var btn = ge('sl-btn'); btn.disabled = true; btn.textContent = 'Invio...'; errEl.innerHTML = '';
  try {
    var clienteId = null;
    var exRes = await db.from('clienti').select('id').ilike('ragione_sociale', rag).maybeSingle();
    if(exRes.data) { clienteId = exRes.data.id; }
    else {
      var ncRes = await db.from('clienti').insert({ragione_sociale:rag,tipo_attivita:v('sl-attivita'),referente_nome:v('sl-ref')||null,referente_telefono:v('sl-tel')||null,stato:'prospect'}).select().single();
      if(ncRes.error) throw ncRes.error;
      clienteId = ncRes.data.id;
    }
    var payload = {
      cliente_id:clienteId, ragione_sociale:rag, rappresentante_id:ME.id,
      referente_sicurezza:v('sl-ref')||null, telefono_referente:v('sl-tel')||null,
      fornitore_attuale:v('sl-fornitore')||null, scadenze_esistenti:v('sl-scadenze')||null, tipo_attivita:v('sl-attivita'),
      mq:parseInt(v('sl-mq'))||null, n_piani:parseInt(v('sl-piani'))||null,
      n_piani_interrati:parseInt(v('sl-interrati'))||0, n_uscite_emergenza:parseInt(v('sl-uscite'))||null,
      planimetria:v('sl-planimetria'), note_struttura:v('sl-struttura-note')||null,
      estintori_n:parseInt(v('sl-ext-n'))||0, estintori_tipo:v('sl-ext-tipo')||null,
      idranti_n:parseInt(v('sl-idr-n'))||0, idranti_stato:v('sl-idr-stato'),
      porte_rei_n:parseInt(v('sl-rei-n'))||0, porte_rei_stato:v('sl-rei-stato'),
      luci_emergenza_n:parseInt(v('sl-luce-n'))||0,
      centrale_rivelazione:v('sl-centrale'), sprinkler:v('sl-sprinkler'), pompa_antincendio:v('sl-pompa'),
      richiesta_cliente:richiesta, anomalie_rilevate:v('sl-anomalie')||null,
      urgenza:v('sl-urgenza'), foto_scattate:v('sl-foto')==='si',
      budget_indicativo:parseFloat(v('sl-budget'))||null, decisore:v('sl-decisore')||null,
      concorrenti:v('sl-concorrenti')||null, interesse_contratto:v('sl-contratto'),
      note_commerciali:v('sl-note-comm')||null, indirizzo:v('sl-indirizzo')||null
    };
    var insRes = await db.from('sopralluoghi').insert(payload);
    if(insRes.error) throw insRes.error;
    toast('Scheda inviata al commerciale!', 'ok');
    var campi = ['sl-rag','sl-ref','sl-tel','sl-fornitore','sl-scadenze','sl-struttura-note','sl-ext-n','sl-ext-tipo','sl-idr-n','sl-rei-n','sl-luce-n','sl-richiesta','sl-anomalie','sl-budget','sl-decisore','sl-concorrenti','sl-note-comm','sl-indirizzo'];
    campi.forEach(function(id) { var el = ge(id); if(el) el.value = ''; });
    gotoPage('dashboard-rapp');
  } catch(e) {
    errEl.innerHTML = '<div class="al2 e">Errore: ' + e.message + '</div>';
  } finally {
    btn.disabled = false; btn.textContent = 'Invia al commerciale';
  }
}

