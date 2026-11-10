// ── PRESIDI ───────────────────────────────────────────────────
async function loadPresidi() {
  const { data, error } = await db
    .from('impianti')
    .select('*, clienti(ragione_sociale)')
    .is('eliminato_il', null)
    .order('tipo')
    .order('creato_il', { ascending: false });

  if (error) {
    console.error('Errore caricamento presidi:', error.message);
    toast('Errore caricamento presidi: ' + error.message, 'err');
    return;
  }

  const presidi = data || [];
  // sql/257 (js/68): per il tecnico i nomi dei clienti che non legge per RLS
  if (typeof completaClientiPresidi === 'function') await completaClientiPresidi(presidi);

  const sediIds = [
    ...new Set(
      presidi
        .map(function(presidio) {
          return presidio.sede_id;
        })
        .filter(Boolean)
    )
  ];

  let sediPerId = {};

  if (sediIds.length) {
    const { data: sedi } = await db
      .from('sedi_cliente')
      .select('id,tipo,nome,via,civico,citta')
      .in('id', sediIds);

    (sedi || []).forEach(function(sede) {
      const indirizzo = [sede.via, sede.civico]
        .filter(Boolean)
        .join(' ');

      sediPerId[sede.id] = [
        sede.nome,
        indirizzo,
        sede.citta
      ].filter(Boolean).join(' · ') || sede.tipo || 'Sede';
    });
  }

  PA = presidi.map(function(presidio) {
    return {
      ...presidio,
      sede_label: presidio.sede_id
        ? (sediPerId[presidio.sede_id] || 'Sede non disponibile')
        : 'Sede principale / non specificata'
    };
  });

  PF = PA;

  renderPC(PA);
  renderPT(PA);
  renderPS(PA);

  const names = [
    ...new Set(
      PA.map(function(p) {
        return p.clienti?.ragione_sociale;
      }).filter(Boolean)
    )
  ].sort();

  const cur = v('pcli');

  ge('pcli').innerHTML =
    '<option value="">Tutti i clienti</option>' +
    names.map(function(nome) {
      return `<option value="${nome}"${nome === cur ? ' selected' : ''}>${nome}</option>`;
    }).join('');
}

function filterP(){
  const q=v('psearch').toLowerCase(),t=v('ptipo'),s=v('pstato'),c=v('pcli');
  PF=PA.filter(p=>(!q ||
  (p.matricola || '').toLowerCase().includes(q) ||
  (p.clienti?.ragione_sociale || '').toLowerCase().includes(q) ||
  (p.ubicazione || '').toLowerCase().includes(q) ||
  (p.sede_label || '').toLowerCase().includes(q)
)&&(!t||p.tipo===t)&&(!s||p.stato===s)&&(!c||(p.clienti?.ragione_sociale||'')===c));
  renderPC(PF);renderPT(PF);
}

function renderPT(data){
  const tb=ge('ptbody');if(!data.length){tb.innerHTML='<tr><td colspan="9"><div class="empty">Nessun presidio</div></td></tr>';return;}
  tb.innerHTML=data.map(p=>`<tr><td>${tpl(p.tipo)}</td><td>${esc(p.clienti?.ragione_sociale||'—')}</td><td style="font-family:monospace;font-size:12px">${esc(p.matricola||'—')}</td><td>${esc(p.ubicazione||'—')}${esc(p.piano?' ('+p.piano+')':'')}</td><td>${fd(p.data_ultimo_controllo)}</td><td class="${sc(p.data_prossimo_controllo)}">${fd(p.data_prossimo_controllo)} (${dd2(p.data_prossimo_controllo)})</td><td>${p.periodicita_mesi?p.periodicita_mesi+' mesi':'—'}</td><td>${si2(p.stato)} ${p.stato}</td><td>${(ROLE==='titolare'||ROLE==='capo_tecnico'||ROLE==='segreteria')?`<button class="btn sm" onclick="editP('${p.id}')">✏️</button>`:''}${typeof bottoneSostituisciPresidio==='function'?bottoneSostituisciPresidio(p.id):''}${(ROLE==='titolare'||ROLE==='capo_tecnico')?`<button class="btn sm" style="color:var(--r)" onclick="eliminaPresidio('${p.id}')">🗑️</button>`:''}</td></tr>`).join('');
}

function switchPF() {
  const tipo = v('mptp');

  const fe = ge('fe');
  const fp = ge('fp');
  const fm = ge('fm');

  if (fe) fe.style.display = 'none';
  if (fp) fp.style.display = 'none';
  if (fm) fm.style.display = 'none';

 if (tipo === 'porta_rei' || tipo === 'uscita_emergenza') {
    if (fp) fp.style.display = 'block';
    return;
  }

  if (tipo === 'manichetta') {
    if (fm) fm.style.display = 'block';
    return;
  }

  if (fe) fe.style.display = 'block';
}
function resetPF() {
  ge('mpt').textContent = 'Nuovo presidio';
  ge('mpeid').value = '';
  ge('mptp').value = 'estintore';

  [
    'me1', 'me2', 'me5', 'me6', 'me7', 'me14',
    'mp1', 'mp3', 'mp4', 'mp6', 'mp15',
    'mm1', 'mm3', 'mm4', 'mm5', 'mm10'
  ].forEach(function(id) {
    const el = ge(id);
    if (el) el.value = '';
  });

  [
    'me8', 'me9', 'me10', 'me11',
    'mp7', 'mp8', 'mp9',
    'mm6', 'mm7', 'mm8'
  ].forEach(function(id) {
    const el = ge(id);
    if (el) el.value = '';
  });

  if (ge('me3')) ge('me3').value = 'polvere_abc';
  if (ge('me4')) ge('me4').value = '6kg';
  if (ge('me13')) ge('me13').value = 'ok';

  if (ge('mp2')) ge('mp2').value = 'REI 60';
  if (ge('mp14')) ge('mp14').value = 'ok';

  if (ge('mm2')) ge('mm2').value = 'uni_45';
  if (ge('mm9')) ge('mm9').value = 'ok';

  switchPF();
}

// Scheda del presidio (m-scheda-presidio). Richiesta di Erika del 04/11:
// tutti i tipi con la stessa impostazione grafica degli estintori
// (riquadri colorati in evidenza come nelle schede presidio del cliente,
// js/09), poi i dati del tipo e i controlli voce per voce (☒ SI / ☒ NO / ☐).
// Lo storico semestrale (js/20) e i dati della manichetta (js/22) si
// aggiungono sotto, come prima.
function datoNotaPresidio(note, etichette) {
  const testo = String(note || '');
  for (const etichetta of etichette) {
    const m = testo.match(new RegExp('(?:^|[·;\\n]\\s*|\\.\\s*)' + etichetta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*([^·;\\n]+)', 'i'));
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
}

function riquadroEvidenzaPresidio(icona, etichetta, valore, colori) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;background:${colori[0]};border:1px solid ${colori[1]};border-radius:8px">
    <span style="font-weight:700;color:${colori[2]};font-size:13px">${icona} ${esc(etichetta)}</span>
    <strong style="color:${colori[2]};font-size:13px;text-align:right">${esc(valore || '—')}</strong>
  </div>`;
}

const COLORI_EVIDENZA_PRESIDIO = {
  giallo: ['#fff4d6', '#e7b651', '#8a4b00'],
  blu: ['#e8f3ff', '#72aee6', '#145a9b'],
  verde: ['#eaf7ee', '#7cc49a', '#166534'],
  rosso: ['#fdecec', '#e79a9a', '#9b1c1c']
};

// Riquadri in evidenza e campi della scheda, per tipo di presidio.
function campiSchedaPresidio(p) {
  const scadenza = p.data_scadenza_collaudo ? fd(p.data_scadenza_collaudo)
    : p.anno_scadenza ? p.anno_scadenza + ' — data da precisare' : '';
  const ultima = p.data_ultimo_controllo ? fd(p.data_ultimo_controllo) : '';
  const prossima = p.data_prossimo_controllo ? fd(p.data_prossimo_controllo) : '';
  const meseManut = datoNotaPresidio(p.note, ['Mese manutenzione indicato', 'Manutenzione mese']);
  const revisione = datoNotaPresidio(p.note, ['Prossima revisione', 'PROSS. RIC.']) ||
    (p.data_scadenza_revisione ? fd(p.data_scadenza_revisione) : '');
  const periodicita = p.periodicita_mesi ? p.periodicita_mesi + ' mesi' : '';
  const C = COLORI_EVIDENZA_PRESIDIO;
  const ev = [];
  const campi = [];
  if (p.tipo === 'estintore') {
    ev.push(['📅', 'Mese manutenzione', meseManut, C.giallo], ['🔄', 'Prossima revisione', revisione, C.blu],
      ['⏳', 'Scadenza collaudo', scadenza, C.rosso], ['✅', 'Ultima verifica', ultima, C.verde]);
    campi.push(['Agente estinguente', al2(p.modello)], ['Capacità', p.capacita], ['Marca', p.marca],
      ['Prossima verifica', prossima]);
  } else if (p.tipo === 'porta_rei' || p.tipo === 'uscita_emergenza') {
    ev.push(['✅', 'Ultima verifica', ultima, C.verde], ['📅', 'Prossima verifica', prossima, C.giallo]);
    if (p.tipo === 'porta_rei') ev.push(['🛡️', 'Classe REI / modello', p.modello, C.blu]);
    campi.push(['Produttore / marca', p.marca]);
    if (p.tipo === 'uscita_emergenza') campi.push(['Modello / descrizione', p.modello]);
  } else if (p.tipo === 'manichetta') {
    ev.push(['⏳', 'Scadenza', scadenza, C.rosso], ['✅', 'Ultima verifica', ultima, C.verde],
      ['📅', 'Prossima verifica', prossima, C.giallo]);
    campi.push(['Tipologia', p.modello], ['Stato — anomalia / appunto del tecnico', p.esito_verifica], ['Marca', p.marca]);
  } else if (p.tipo === 'idrante' || p.tipo === 'naspo') {
    ev.push(['✅', 'Ultima verifica', ultima, C.verde], ['📅', 'Prossima verifica', prossima, C.giallo],
      ['⏳', 'Scadenza collaudo', scadenza, C.rosso]);
    campi.push(['Marca', p.marca], ['Modello / descrizione', p.modello]);
  } else {
    // Luci di emergenza, evacuatori di fumo e altri impianti.
    ev.push(['✅', 'Ultima verifica', ultima, C.verde], ['📅', 'Prossima verifica', prossima, C.giallo]);
    if (scadenza) ev.push(['⏳', 'Scadenza', scadenza, C.rosso]);
    campi.push(['Marca', p.marca], ['Modello / descrizione', p.modello]);
  }
  campi.push(['Ubicazione', p.ubicazione], ['Piano', p.piano], ['Locale / area', p.locale],
    ['Periodicità', periodicita], ['Annata', p.annata], ['Data installazione', p.data_installazione ? fd(p.data_installazione) : '']);
  return { evidenza: ev, campi: campi };
}

// Voci del controllo con il loro esito. Senza voci registrate: le voci
// standard del tipo (CKL_PRESIDIO, js/01) senza esito.
function vociControlloSchedaPresidio(p) {
  const si = Array.isArray(p.voci_x_si) ? p.voci_x_si : [];
  const no = Array.isArray(p.voci_x_no) ? p.voci_x_no : [];
  const vuote = Array.isArray(p.voci_x_vuote) ? p.voci_x_vuote : [];
  const registrate = si.length || no.length || vuote.length;
  const voci = registrate ? [...new Set([...si, ...no, ...vuote])] : (CKL_PRESIDIO[p.tipo] || []);
  return {
    registrate: !!registrate,
    righe: voci.map(function(voce) { return { voce: voce, esito: no.includes(voce) ? 'NO' : si.includes(voce) ? 'SI' : '' }; })
  };
}

async function apriSchedaPresidio(id) {
  ricordaPosizionePagina();
  openM('m-scheda-presidio');
  ge('msp-titolo').textContent = 'Scheda presidio';
  ge('msp-contenuto').innerHTML = '<div class="load">Caricamento...</div>';

  const { data: p, error } = await db
    .from('impianti')
    .select('*, clienti(ragione_sociale)')
    .eq('id', id)
    .is('eliminato_il', null)
    .single();

  if (error || !p) {
    ge('msp-contenuto').innerHTML = '<div class="empty">Impossibile caricare la scheda del presidio.</div>';
    return;
  }
  // sql/257 (js/68): nome del cliente per il tecnico che non legge la sua riga
  if (!p.clienti && typeof nomeClientePresidioTecnico === 'function') p.clienti = nomeClientePresidioTecnico(p.cliente_id);

  const stato = { ok: '✅ OK', anomalia: '⚠️ Anomalia', fuori_servizio: '🔴 Fuori servizio', scaduto: '❌ Scaduto' }[p.stato] || p.stato || 'Non compilato';
  const coloreStato = { ok: 'var(--g)', anomalia: 'var(--a)', fuori_servizio: 'var(--r)', scaduto: 'var(--r)' }[p.stato] || 'var(--m)';
  const { evidenza, campi } = campiSchedaPresidio(p);
  const controlli = vociControlloSchedaPresidio(p);

  const campo = function(etichetta, valore) {
    return `<div style="padding:8px 0;border-bottom:1px solid var(--bl);min-width:0">
      <div class="muted" style="font-size:11px;color:var(--m)">${esc(etichetta)}</div>
      <div style="font-weight:600;margin-top:2px;overflow-wrap:anywhere">${valore !== null && valore !== undefined && valore !== '' ? esc(String(valore)) : '—'}</div>
    </div>`;
  };
  const rigaControllo = function(r) {
    const segno = r.esito === 'SI' ? '<b style="color:var(--g)">☒ SI</b>'
      : r.esito === 'NO' ? '<b style="color:var(--r)">☒ NO</b>'
      : '<b style="color:var(--m)">☐</b>';
    return `<div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--bl)">
      <span style="min-width:52px">${segno}</span><span style="overflow-wrap:anywhere">${esc(r.voce)}</span>
    </div>`;
  };
  const conteggio = { SI: 0, NO: 0, '': 0 };
  controlli.righe.forEach(function(r) { conteggio[r.esito]++; });

  // Note: per gli estintori importati il campo note ripete revisione e
  // collaudo (già nei riquadri): si mostrano le altre parti.
  const notaOperativa = String(p.note || '').split(/[;·\n]+/)
    .map(function(parte) { return parte.trim().replace(/^note\s*:\s*/i, ''); })
    .filter(function(parte) {
      return parte && !/^(documento(?:\s+\w+)?|fonte|pagina|scheda\s+\d+|numero\s+progressivo|sede|prossima revisione|pross\. ric\.|scadenza collaudo|mese manutenzione indicato|manutenzione mese)\b/i.test(parte);
    }).join('\n').trim();
  const esitoNonConforme = /non\s+conforme|non\s+riallineabile/i.test(String(p.esito_verifica || ''));

  ge('msp-titolo').textContent = `Scheda presidio · ${p.matricola || 'senza matricola'}`;
  ge('msp-contenuto').innerHTML = `
    <div class="card" style="margin:0;position:relative">
      <div style="position:absolute;top:12px;right:12px;font-size:12px;font-weight:700;color:${coloreStato}">${esc(stato)}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--m);margin-bottom:4px">${tpl(p.tipo)}</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:2px;padding-right:110px;overflow-wrap:anywhere">${esc(p.matricola || 'Senza matricola')}</div>
      <div style="font-size:12px;color:var(--m)">Numero progressivo: <b style="color:var(--t)">${esc(p.numero_progressivo || '—')}</b></div>
      <div style="font-size:12px;color:var(--m);margin-bottom:12px">${esc(p.clienti?.ragione_sociale || '—')}</div>

      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
        ${evidenza.map(function(e) { return riquadroEvidenzaPresidio(e[0], e[1], e[2], e[3]); }).join('')}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));column-gap:16px">
        ${campi.map(function(c) { return campo(c[0], c[1]); }).join('')}
      </div>

      <div style="margin-top:16px;border-top:1px solid var(--bl);padding-top:12px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <div style="font-weight:700">Controlli della verifica</div>
          ${controlli.righe.length ? `<div style="font-size:12px;color:var(--m)"><b style="color:var(--g)">${conteggio.SI} SI</b> · <b style="color:var(--r)">${conteggio.NO} NO</b> · ${conteggio['']} senza esito</div>` : ''}
        </div>
        ${p.esito_verifica && p.tipo !== 'manichetta' ? `<div class="al2 i" style="margin-bottom:10px"><b>Esito:</b> ${esc(p.esito_verifica)}</div>` : ''}
        ${esitoNonConforme && notaOperativa ? `<div style="margin:0 0 12px;padding:12px;border-radius:8px;border:1px solid #fed7aa;border-left:4px solid #ea580c;background:#fff7ed;white-space:pre-wrap">
          <div style="font-size:12px;font-weight:700;color:#9a3412;margin-bottom:5px">⚠️ Note / anomalia rilevata</div>
          <div style="font-size:13px">${esc(notaOperativa)}</div></div>` : ''}
        ${!controlli.registrate && controlli.righe.length ? '<div style="font-size:12px;color:var(--m);margin-bottom:4px">Nessuna verifica registrata: queste sono le voci del controllo per questo tipo di presidio.</div>' : ''}
        ${controlli.righe.length ? controlli.righe.map(rigaControllo).join('') : '<div style="font-size:12px;color:var(--m)">Nessuna voce di controllo per questo tipo di presidio.</div>'}
        ${p.fonte_pdf ? `<div style="font-size:11px;color:var(--m);margin-top:10px">Fonte: ${esc(p.fonte_pdf)}${p.pagina_pdf ? ' · pagina ' + esc(String(p.pagina_pdf)) : ''}</div>` : ''}
        <div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid var(--bl);font-size:12px;line-height:1.65">
          <b>Legenda</b><br>
          <span style="font-weight:700;color:#166534">☒ SI</span> = controllo verificato con esito positivo.<br>
          <span style="font-weight:700;color:var(--r)">☒ NO</span> = controllo non superato o anomalia da gestire.<br>
          <span style="font-weight:700;color:var(--m)">☐</span> = voce del modulo senza una X: da verificare o compilare.
        </div>
      </div>

      ${!(esitoNonConforme && notaOperativa) ? `<div style="margin-top:16px">
        <div class="muted" style="font-size:12px;color:var(--m)">Note / anomalie</div>
        <div style="margin-top:5px;white-space:pre-wrap">${notaOperativa ? esc(notaOperativa) : 'Nessuna nota registrata.'}</div>
      </div>` : ''}
      <div id="msp-annulla"></div>
    </div>
  `;
  // F14.19 (js/64, sql/72): l'ultimo esito registrato da chi guarda → "Chiedi correzione"
  if (typeof caricaAnnullaSchedaPresidio === 'function') caricaAnnullaSchedaPresidio(p).catch(function() {});
}

function editP(id) {
  const p = PA.find(function(item) {
    return item.id === id;
  });

  if (!p) {
    toast('Presidio non trovato', 'err');
    return;
  }

  resetPF();

  ge('mpt').textContent = 'Modifica presidio';
  ge('mpeid').value = id;
  ge('mptp').value = p.tipo;
  ge('mpcl').value = p.cliente_id || '';

  if (p.cliente_id) {
    loadSediPresidio(p.cliente_id, p.sede_id);
  }

  switchPF();

  if (p.tipo === 'manichetta') {
    ge('mm1').value = p.matricola || '';
    ge('mm2').value = p.modello || 'uni_45';
    ge('mm3').value = p.ubicazione || '';
    ge('mm4').value = p.piano || '';
    ge('mm5').value = p.locale || '';
    ge('mm6').value = p.data_ultimo_controllo || '';
    ge('mm7').value = p.data_prossimo_controllo || '';
    ge('mm8').value = p.data_scadenza_collaudo || '';
    ge('mm9').value = p.stato || 'ok';
    ge('mm10').value = p.note || '';
  } else if (p.tipo === 'porta_rei') {
    ge('mp1').value = p.matricola || '';
    ge('mp2').value = p.modello || 'REI 60';
    ge('mp3').value = p.ubicazione || '';
    ge('mp4').value = p.piano || '';
    ge('mp6').value = p.marca || '';
    ge('mp7').value = p.data_installazione || '';
    ge('mp8').value = p.data_ultimo_controllo || '';
    ge('mp9').value = p.data_prossimo_controllo || '';
    ge('mp14').value = p.stato || 'ok';
    ge('mp15').value = p.note || '';
  } else {
    ge('me1').value = p.matricola || '';
    ge('me2').value = p.marca || '';
    ge('me3').value = p.modello || 'polvere_abc';
    // F10.2 — prima editP leggeva la capacità dalla marca e saveP la scriveva
    // nella marca (la marca vera si perdeva). Con sql/52 la capacità ha la
    // sua colonna (impianti.capacita); senza, il select si precompila solo
    // se la marca è una capacità (dati vecchi).
    impostaCapacitaEstintore(p.capacita !== undefined && p.capacita !== null ? p.capacita : p.marca);
    ge('me5').value = p.ubicazione || '';
    ge('me6').value = p.piano || '';
    ge('me7').value = p.locale || '';
    ge('me8').value = p.data_installazione || '';
    ge('me9').value = p.data_ultimo_controllo || '';
    ge('me10').value = p.data_prossimo_controllo || '';
    ge('me11').value = p.data_scadenza_collaudo || '';
    ge('me13').value = p.stato || 'ok';
    ge('me14').value = p.note || '';
  }

  openM('m-presidio');
}

// Capacità degli estintori (decisione di Toli del 02/11, sql/52): la
// colonna impianti.capacita c'è? Senza sql/52 il campo si mostra ma non si
// salva, come prima.
let capacitaEstintoriVerificata = null;
async function capacitaEstintoriDisponibile() {
  if (capacitaEstintoriVerificata !== null) return capacitaEstintoriVerificata;
  const { error } = await db.from('impianti').select('capacita').limit(1);
  capacitaEstintoriVerificata = !error;
  return capacitaEstintoriVerificata;
}

function impostaCapacitaEstintore(valore) {
  const sel = ge('me4');
  if (!sel) return;
  const pulito = String(valore || '').toLowerCase().replace(/\s+/g, '');
  if (pulito && ![...sel.options].some(function(o) { return o.value === pulito; })) {
    // valore fuori elenco (es. 2,5kg): si aggiunge, così non si perde salvando
    const opt = document.createElement('option');
    opt.value = pulito;
    opt.textContent = pulito.replace(/(kg|lt)$/, ' $1');
    sel.appendChild(opt);
  }
  sel.value = pulito && [...sel.options].some(function(o) { return o.value === pulito; }) ? pulito : '';
}

async function saveP() {
  const tipo = v('mptp');
  const cid = v('mpcl');

  if (!cid) {
    toast('Seleziona un cliente', 'err');
    return;
  }

  const eid = v('mpeid');
  let payload = {
    cliente_id: cid,
    tipo: tipo
  };

  if (tipo === 'manichetta') {
    const numero = v('mm1').trim();

    if (!numero) {
      toast('Inserisci il numero o ID della manichetta', 'err');
      return;
    }

    if (!v('mm3').trim()) {
      toast('Inserisci l’ubicazione della manichetta', 'err');
      return;
    }

    payload = {
      ...payload,
      matricola: numero,
      modello: v('mm2'),
      marca: null,
      ubicazione: v('mm3') || null,
      piano: v('mm4') || null,
      locale: v('mm5') || null,
      data_ultimo_controllo: v('mm6') || null,
      data_prossimo_controllo: v('mm7') || null,
      data_scadenza_collaudo: v('mm8') || null,
      stato: v('mm9'),
      note: v('mm10') || null,
      sede_id: v('mpsede') || null
    };
  } else if (tipo === 'porta_rei' || tipo === 'uscita_emergenza') {
    const mat = v('mp1').trim();

    if (!mat) {
      toast('Inserisci l’ID porta', 'err');
      return;
    }

    payload = {
      ...payload,
      matricola: mat,
      modello: v('mp2'),
      marca: v('mp6') || null,
      ubicazione: v('mp3') || null,
      piano: v('mp4') || null,
      data_installazione: v('mp7') || null,
      data_ultimo_controllo: v('mp8') || null,
      data_prossimo_controllo: v('mp9') || null,
      stato: v('mp14'),
      note: v('mp15') || null,
      sede_id: v('mpsede') || null
    };
  } else {
    const mat = v('me1').trim();

    if (!mat) {
      toast('Inserisci la matricola', 'err');
      return;
    }

    payload = {
      ...payload,
      matricola: mat,
      // F10.2 — la marca è il campo Marca (me2), non la capacità (me4)
      marca: v('me2').trim() || null,
      modello: v('me3'),
      ubicazione: v('me5') || null,
      piano: v('me6') || null,
      locale: v('me7') || null,
      data_installazione: v('me8') || null,
      data_ultimo_controllo: v('me9') || null,
      data_prossimo_controllo: v('me10') || null,
      data_scadenza_collaudo: v('me11') || null,
      stato: v('me13'),
      note: v('me14') || null,
      sede_id: v('mpsede') || null
    };
  }

  // Capacità dell'estintore: solo con sql/52 (colonna impianti.capacita).
  if (tipo === 'estintore' && (await capacitaEstintoriDisponibile())) {
    payload.capacita = v('me4') || null;
  }

  // F10.2 — annata (anno di fabbricazione), solo con sql/41 (js/40)
  if (typeof datiAnnataPresidio === 'function') {
    const annata = datiAnnataPresidio();
    if (!annata) return;
    Object.assign(payload, annata);
  }

  let error;

  if (eid) {
    ({ error } = await db
      .from('impianti')
      .update(payload)
      .eq('id', eid));
  } else {
    ({ error } = await db
      .from('impianti')
      .insert(payload));
  }

  if (error) {
    toast('Errore: ' + error.message, 'err');
    return;
  }

  closeM('m-presidio');
  toast(eid ? 'Presidio aggiornato ✓' : 'Presidio salvato ✓', 'ok');
  loadPresidi();
  loadDash();
}

  let righeImportPresidi = [];

function pulisciImportPresidi(valore) {
  return String(valore || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pulisciPivaImport(valore) {
  return String(valore || '').replace(/\D/g, '');
}

function leggiCsvImportPresidi(testo) {
  const primaRiga = testo.split(/\r?\n/)[0] || '';
  const separatore = primaRiga.includes(';') ? ';' : ',';

  const righe = [];
  let riga = [];
  let valore = '';
  let traVirgolette = false;

  for (let i = 0; i < testo.length; i++) {
    const carattere = testo[i];
    const successivo = testo[i + 1];

    if (carattere === '"') {
      if (traVirgolette && successivo === '"') {
        valore += '"';
        i++;
      } else {
        traVirgolette = !traVirgolette;
      }

      continue;
    }

    if (!traVirgolette && carattere === separatore) {
      riga.push(valore.trim());
      valore = '';
      continue;
    }

    if (!traVirgolette && (carattere === '\n' || carattere === '\r')) {
      if (carattere === '\r' && successivo === '\n') i++;

      riga.push(valore.trim());

      if (riga.some(function(cella) { return cella !== ''; })) {
        righe.push(riga);
      }

      riga = [];
      valore = '';
      continue;
    }

    valore += carattere;
  }

  riga.push(valore.trim());

  if (riga.some(function(cella) { return cella !== ''; })) {
    righe.push(riga);
  }

  return righe;
}

function dataImportPresidi(valore) {
  const data = String(valore || '').trim();

  if (!data) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return data;
  }

  const match = data.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);

  if (!match) return null;

  return [
    match[3],
    String(match[2]).padStart(2, '0'),
    String(match[1]).padStart(2, '0')
  ].join('-');
}

function tipoImportPresidio(valore) {
  const tipo = pulisciImportPresidi(valore);

  const mappa = {
    estintore: 'estintore',
    estintori: 'estintore',

    porta_rei: 'porta_rei',
    porte_rei: 'porta_rei',
    porta_tagliafuoco: 'porta_rei',
    porte_tagliafuoco: 'porta_rei',

    uscita_emergenza: 'uscita_emergenza',
    uscite_emergenza: 'uscita_emergenza',

    manichetta: 'manichetta',
    manichette: 'manichetta',

    idrante: 'idrante',
    idranti: 'idrante',

    naspo: 'naspo',
    naspi: 'naspo',

    luce_emergenza: 'luce_emergenza',
    luci_emergenza: 'luce_emergenza',

    evacuatore_fumi: 'evacuatore_fumi',
evacuatori_fumo: 'evacuatore_fumi',
evacuatore_di_fumo: 'evacuatore_fumi',
evacuatori_di_fumo: 'evacuatore_fumi',

    pompa_antincendio: 'pompa_antincendio',
    centrale_rivelazione: 'centrale_rivelazione',
    sprinkler: 'sprinkler'
    
  };

  return mappa[tipo] || '';
}

function elencoVociCsv(valore) {
  return String(valore || '')
    .split('|')
    .map(function(voce) {
      return voce.trim();
    })
    .filter(Boolean);
}

function statoDaEsitoCsv(esito) {
  const valore = pulisciImportPresidi(esito || '');

  if (!valore) return 'ok';

  if (['ok', 'anomalia', 'scaduto', 'fuori_servizio'].includes(valore)) {
    return valore;
  }

  if (
    valore.includes('non riallineabile') ||
    valore.includes('fuori servizio')
  ) {
    return 'fuori_servizio';
  }

  if (
    valore.includes('non conforme') ||
    valore.includes('non manutenzionata')
  ) {
    return 'anomalia';
  }

  return 'ok';
}

function apriImportPresidi() {
  ricordaPosizionePagina();
  if (!['titolare', 'capo_tecnico', 'tecnico'].includes(ROLE)) {
    toast('Solo titolare e capo tecnico possono importare presidi', 'err');
    return;
  }

  righeImportPresidi = [];

  ge('import-presidi-file').value = '';
  ge('import-presidi-conferma').disabled = true;

  ge('import-presidi-riepilogo').textContent =
    'Nessun file selezionato.';

  ge('import-presidi-righe').innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty">Carica un file per vedere l’anteprima.</div>
      </td>
    </tr>
  `;
  ge('import-presidi-anno').value = new Date().getFullYear();

  openM('m-import-presidi');
}

function renderAnteprimaImportPresidi() {
  const valide = righeImportPresidi.filter(function(riga) {
    return riga.valido;
  });

  const errori = righeImportPresidi.filter(function(riga) {
    return !riga.valido;
  });

  const nuove = valide.filter(function(riga) {
    return riga.azione === 'Crea';
  });

  const aggiornamenti = valide.filter(function(riga) {
    return riga.azione === 'Aggiorna';
  });

  ge('import-presidi-riepilogo').innerHTML = `
    <b>${valide.length}</b> righe pronte:
    ${nuove.length} nuove,
    ${aggiornamenti.length} aggiornamenti,
    ${errori.length} con errore.
  `;

  ge('import-presidi-conferma').disabled = valide.length === 0;

  ge('import-presidi-righe').innerHTML = righeImportPresidi
    .slice(0, 100)
    .map(function(riga) {
      return `
        <tr>
          <td>${riga.numeroRiga}</td>
          <td>${esc(riga.cliente || '—')}</td>
          <td>${esc(riga.tipoNormale || riga.tipo || '—')}</td>
          <td>${esc(riga.matricolaNormale || riga.matricola || '—')}</td>
          <td>${esc(riga.azione || '—')}</td>
          <td style="color:${riga.valido ? 'var(--g)' : 'var(--r)'}">
            ${esc(riga.messaggio)}
          </td>
        </tr>
      `;
    })
    .join('');
}


