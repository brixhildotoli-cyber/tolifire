// =====================================================================
// F6.2 — RICHIESTE DI CONSUMABILI E NOLI della commessa (passi 8-9).
// Il capo tecnico (Capo Operativo) apre sulla commessa una richiesta di
// integrazione: un consumabile o un nolo che manca. Gli acquisti
// (commerciale) la evadono indicando la data di arrivo prevista (più
// fornitore e costo, facoltativi). Quando arriva, chi la riceve la segna
// "arrivata". Stati: aperta → evasa → arrivata (più annullata, con
// motivo). Gli stati della commessa NON cambiano da soli.
// Dove: scheda della commessa (box cmd-richieste), "Tocca a te" della
// pagina Commesse (js/26), dashboard del commerciale
// (com-richieste-integrazione) e del capo tecnico
// (ct-richieste-integrazione).
// Chi (sql/31): leggono i 5 ruoli che leggono la commessa; aprono capo
// tecnico e titolare; evadono commerciale e titolare; segnano arrivata
// capo tecnico, commerciale, segreteria, titolare; annullano capo
// tecnico, commerciale, titolare. Su commessa chiusa o annullata solo il
// titolare.
// Scelta: la richiesta evasa non crea un ordine al fornitore (js/27,
// sql/30): basta la data di arrivo. Non dipende da sql/28, 29 o 30.
// Senza sql/31 la scheda mostra "non ancora attive".
// =====================================================================

const TIPI_RICHIESTA_INTEGRAZIONE = {
  consumabile: { icona: '🔩', nome: 'Consumabile', esempio: 'es. tasselli, sigillante REI, viti, collari tagliafuoco' },
  nolo:        { icona: '🏗️', nome: 'Nolo',        esempio: 'es. piattaforma aerea 12 m, ponteggio, carotatrice' }
};

const ETICHETTE_STATO_RICHIESTA_INTEGRAZIONE = {
  aperta: 'Da evadere (acquisti)',
  evasa: 'In arrivo',
  arrivata: 'Arrivata',
  annullata: 'Annullata'
};

const RUOLI_APRONO_RICHIESTE = ['titolare', 'capo_tecnico'];
const RUOLI_EVADONO_RICHIESTE = ['titolare', 'commerciale'];
const RUOLI_ARRIVO_RICHIESTE = ['titolare', 'capo_tecnico', 'commerciale', 'segreteria'];
const RUOLI_ANNULLANO_RICHIESTE = ['titolare', 'capo_tecnico', 'commerciale'];

let richiesteIntegrazioneDisponibili = null;
// Riepilogo delle richieste attive per commessa (per "Tocca a te"):
// { id_commessa: { aperte, evase, daSegnare } }
let riepilogoRichiesteCommesse = {};
// Richieste caricate (scheda e dashboard): { id: richiesta }, ogni
// richiesta con la sua commessa in r.commesse.
let richiesteIntegrazioneCache = {};
let commessaRichiesteAperta = null;
let richiestaInModifica = null;
let fornitoriRichiesteElenco = null;

// ── Disponibilità di sql/31 ─────────────────────────────────────────
async function verificaRichiesteIntegrazioneDisponibili() {
  if (richiesteIntegrazioneDisponibili !== null) return richiesteIntegrazioneDisponibili;
  if (!(await verificaCommesseDisponibili())) return false;

  const { error } = await db
    .from('commesse_richieste_integrazione')
    .select('id')
    .limit(1);

  if (!error) {
    richiesteIntegrazioneDisponibili = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /commesse_richieste_integrazione/i.test(error.message || '')) {
    richiesteIntegrazioneDisponibili = false;
  } else {
    return false;
  }

  return richiesteIntegrazioneDisponibili;
}

// true solo dopo la verifica e con sql/31 eseguito (usata da js/26).
function richiesteIntegrazioneAttive() {
  return richiesteIntegrazioneDisponibili === true;
}

// ── Chi può fare cosa (le stesse regole le impone il database) ──────
function commessaModificabileRichieste(commessa) {
  return ROLE === 'titolare' || commessaAperta(commessa);
}

function puoAprireRichiestaIntegrazione(commessa) {
  return RUOLI_APRONO_RICHIESTE.includes(ROLE) && commessaModificabileRichieste(commessa);
}

function puoEvadereRichiestaIntegrazione(commessa, r) {
  return ['aperta', 'evasa'].includes(r.stato) &&
    RUOLI_EVADONO_RICHIESTE.includes(ROLE) && commessaModificabileRichieste(commessa);
}

function puoSegnareArrivoRichiestaIntegrazione(commessa, r) {
  return r.stato === 'evasa' &&
    RUOLI_ARRIVO_RICHIESTE.includes(ROLE) && commessaModificabileRichieste(commessa);
}

function puoAnnullareRichiestaIntegrazione(commessa, r) {
  return ['aperta', 'evasa'].includes(r.stato) &&
    RUOLI_ANNULLANO_RICHIESTE.includes(ROLE) && commessaModificabileRichieste(commessa);
}

// ── Piccoli aiuti ───────────────────────────────────────────────────
function classeStatoRichiestaIntegrazione(stato) {
  if (stato === 'arrivata') return 'bok';
  if (stato === 'annullata') return 'bgray';
  if (stato === 'evasa') return 'bblue';
  return 'bwarn';
}

function badgeStatoRichiestaIntegrazione(stato) {
  return `<span class="bx ${classeStatoRichiestaIntegrazione(stato)}">${esc(ETICHETTE_STATO_RICHIESTA_INTEGRAZIONE[stato] || stato || '—')}</span>`;
}

function testoCosaRichiestaIntegrazione(r) {
  const tipo = TIPI_RICHIESTA_INTEGRAZIONE[r.tipo] || { icona: '', nome: r.tipo };
  const unita = numeroPreventivo(r.quantita) === 1 && r.unita_misura === 'giorni' ? 'giorno' : (r.unita_misura || '');
  return tipo.icona + ' ' + tipo.nome + ': ' + quantitaLeggibileOrdine(r.quantita) + ' ' + unita + ' · ' + (r.descrizione || '');
}

function testoQuandoServeRichiesta(r) {
  if (r.tipo === 'nolo' && r.serve_dal && r.nolo_fino_al) return 'serve dal ' + fd(r.serve_dal) + ' al ' + fd(r.nolo_fino_al);
  if (r.serve_dal) return 'serve dal ' + fd(r.serve_dal);
  if (r.nolo_fino_al) return 'serve fino al ' + fd(r.nolo_fino_al);
  return '';
}

function richiestaInRitardo(r) {
  return r.stato === 'evasa' && r.arrivo_previsto && r.arrivo_previsto < dataOggiOrdine();
}

// Riga "arrivo" leggibile con i segnali (ritardo, arriva dopo che serve).
function htmlArrivoRichiestaIntegrazione(r) {
  if (r.stato === 'arrivata') {
    return '<span style="color:var(--g);font-weight:600">arrivata il ' + esc(fd(r.data_arrivo)) + '</span>';
  }
  if (r.stato === 'annullata') return '';
  if (r.stato === 'aperta') return '<span style="color:var(--a);font-weight:600">in attesa degli acquisti</span>';

  const ritardo = richiestaInRitardo(r);
  const tardi = r.serve_dal && r.arrivo_previsto && r.arrivo_previsto > r.serve_dal;
  return '<span style="' + (ritardo ? 'color:var(--r);' : '') + 'font-weight:600">arrivo previsto ' + esc(fd(r.arrivo_previsto)) +
    (ritardo ? ' (in ritardo)' : '') + '</span>' +
    (tardi ? ' <span style="color:var(--a)">· arriva dopo il giorno in cui serve</span>' : '');
}

// ── Riepilogo per "Tocca a te" (chiamata da js/26) ──────────────────
// commessaId: una sola commessa (scheda) o null (tutte quelle visibili).
async function caricaRiepilogoRichiesteIntegrazione(commessaId) {
  if (!(await verificaRichiesteIntegrazioneDisponibili())) return;

  let query = db
    .from('commesse_richieste_integrazione')
    .select('commessa_id, stato, arrivo_previsto')
    .in('stato', ['aperta', 'evasa']);
  if (commessaId) query = query.eq('commessa_id', commessaId);

  const { data, error } = await query;
  if (error) {
    console.warn('Riepilogo consumabili e noli:', error.message);
    return;
  }

  if (commessaId) delete riepilogoRichiesteCommesse[commessaId];
  else riepilogoRichiesteCommesse = {};

  const oggi = dataOggiOrdine();
  (data || []).forEach(function(r) {
    const voce = riepilogoRichiesteCommesse[r.commessa_id] ||
      (riepilogoRichiesteCommesse[r.commessa_id] = { aperte: 0, evase: 0, daSegnare: 0 });
    if (r.stato === 'aperta') voce.aperte++;
    if (r.stato === 'evasa') {
      voce.evase++;
      if (r.arrivo_previsto && r.arrivo_previsto <= oggi) voce.daSegnare++;
    }
  });
}

// Motivi "Tocca a te" delle richieste (commessa aperta, mai il titolare:
// il controllo lo fa già motiviToccaAMeCommessa in js/26).
function motiviRichiesteIntegrazioneCommessa(commessa) {
  if (!richiesteIntegrazioneAttive() || !commessa) return [];
  const voce = riepilogoRichiesteCommesse[commessa.id];
  if (!voce) return [];

  const motivi = [];
  if (ROLE === 'commerciale' && voce.aperte) {
    motivi.push('Passo 9: ' + voce.aperte + (voce.aperte === 1 ? ' richiesta' : ' richieste') +
      ' di consumabili e noli da evadere (indica la data di arrivo)');
  }
  if (ROLE === 'capo_tecnico' && voce.daSegnare) {
    motivi.push(voce.daSegnare + (voce.daSegnare === 1 ? ' consumabile o nolo' : ' consumabili e noli') +
      ' con arrivo previsto entro oggi: segna l\'arrivo (o senti gli acquisti)');
  }
  return motivi;
}

// ── Box nella scheda della commessa (chiamata da js/26) ─────────────
async function caricaRichiesteIntegrazioneCommessa(commessa) {
  const box = ge('cmd-richieste');
  if (!box || !commessa) return;

  commessaRichiesteAperta = commessa;

  if (!(await verificaRichiesteIntegrazioneDisponibili())) {
    box.innerHTML = `
      <div class="card">
        <div style="font-size:14px;font-weight:700;margin-bottom:8px">🧰 Consumabili e noli</div>
        <div class="al2 i" style="margin:0">Le richieste di consumabili e noli non sono ancora attive.</div>
      </div>
    `;
    return;
  }

  box.innerHTML = '<div class="card"><div class="load">Caricamento consumabili e noli...</div></div>';

  const { data, error } = await db
    .from('commesse_richieste_integrazione')
    .select('*')
    .eq('commessa_id', commessa.id)
    .order('numero', { ascending: true });

  if (commessaApertaId && commessaApertaId !== commessa.id) return; // aperta un'altra commessa

  if (error) {
    box.innerHTML = `<div class="card"><div class="al2 e">Errore caricamento consumabili e noli: ${esc(error.message)}</div></div>`;
    return;
  }

  const richieste = data || [];
  richieste.forEach(function(r) {
    r.commesse = commessa;
    richiesteIntegrazioneCache[r.id] = r;
  });

  const attive = richieste.filter(function(r) { return r.stato !== 'annullata'; }).length;
  const bottoni = puoAprireRichiestaIntegrazione(commessa)
    ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn sm p" onclick="apriNuovaRichiestaIntegrazione('consumabile')">+ Consumabile</button>
        <button class="btn sm p" onclick="apriNuovaRichiestaIntegrazione('nolo')">+ Nolo</button>
      </div>
    `
    : '';

  box.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
        <div style="font-size:14px;font-weight:700">🧰 Consumabili e noli (${attive})</div>
        ${bottoni}
      </div>
      <div style="font-size:12px;color:var(--m);margin-bottom:10px">
        Passi 8-9: il capo tecnico chiede quello che manca, gli acquisti lo procurano e indicano la data di arrivo.
      </div>
      ${richieste.length
        ? richieste.map(function(r) { return htmlRigaRichiestaIntegrazione(commessa, r, false); }).join('')
        : '<div class="empty">Nessuna richiesta di consumabili o noli per questa commessa.</div>'}
    </div>
  `;
}

// Una richiesta (scheda della commessa o dashboard). conCommessa: mostra
// codice e cliente e il bottone per aprire la commessa.
function htmlRigaRichiestaIntegrazione(commessa, r, conCommessa) {
  const bottoni = [];
  if (puoEvadereRichiestaIntegrazione(commessa, r)) {
    bottoni.push(r.stato === 'aperta'
      ? `<button class="btn sm p" onclick="apriEvadiRichiestaIntegrazione('${esc(r.id)}')">📅 Evadi: data di arrivo</button>`
      : `<button class="btn sm" onclick="apriEvadiRichiestaIntegrazione('${esc(r.id)}')">📅 Cambia data</button>`);
  }
  if (puoSegnareArrivoRichiestaIntegrazione(commessa, r)) {
    bottoni.push(`<button class="btn sm p" onclick="apriStatoRichiestaIntegrazione('${esc(r.id)}', 'arrivata')">📦 Arrivata</button>`);
  }
  if (puoAnnullareRichiestaIntegrazione(commessa, r)) {
    bottoni.push(`<button class="btn sm" style="color:var(--r)" onclick="apriStatoRichiestaIntegrazione('${esc(r.id)}', 'annullata')">Annulla</button>`);
  }
  if (conCommessa && canAccessPage('commessa-detail')) {
    bottoni.push(`<button class="btn sm" onclick="openCommessaDetail('${esc(commessa.id)}')">Apri commessa</button>`);
  }

  const quando = testoQuandoServeRichiesta(r);
  const titolo = conCommessa
    ? esc(commessa.codice) + ' · ' + esc(commessa.clienti?.ragione_sociale || '') + ' · n. ' + esc(r.numero)
    : 'n. ' + esc(r.numero);

  return `
    <div style="padding:8px 0;border-bottom:1px solid var(--bo)${r.stato === 'annullata' ? ';opacity:.65' : ''}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
        <div style="min-width:0;flex:1">
          <div style="font-weight:700;word-break:break-word">${titolo} ${badgeStatoRichiestaIntegrazione(r.stato)}</div>
          <div style="font-size:13px;word-break:break-word">${esc(testoCosaRichiestaIntegrazione(r))}</div>
          <div style="font-size:12px;color:var(--m)">
            ${[quando ? esc(quando) : '', htmlArrivoRichiestaIntegrazione(r)].filter(Boolean).join(' · ')}
          </div>
        </div>
        ${bottoni.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${bottoni.join('')}</div>` : ''}
      </div>
      <details style="margin-top:4px">
        <summary style="font-size:12px;cursor:pointer;color:var(--m)">Dettagli e passaggi</summary>
        ${htmlDettaglioRichiestaIntegrazione(r)}
      </details>
    </div>
  `;
}

function htmlDettaglioRichiestaIntegrazione(r) {
  const righe = [];
  righe.push('Richiesta il ' + dataOraEsitoPreventivo(r.richiesta_il) +
    (r.richiesta_da_nome ? ' da ' + r.richiesta_da_nome + (r.richiesta_da_ruolo ? ' (' + etichettaRuolo(r.richiesta_da_ruolo) + ')' : '') : '') +
    (r.note ? ': ' + r.note : ''));
  if (r.evasa_il) {
    const dettagli = [
      'arrivo previsto ' + fd(r.arrivo_previsto),
      r.fornitore_nome ? 'fornitore ' + r.fornitore_nome : '',
      r.costo != null ? 'costo ' + euroPreventivo(r.costo) + ' IVA esclusa' : ''
    ].filter(Boolean).join(', ');
    righe.push('Evasa dagli acquisti (ultimo aggiornamento il ' + dataOraEsitoPreventivo(r.evasa_il) +
      (r.evasa_da_nome ? ' da ' + r.evasa_da_nome : '') + '): ' + dettagli + (r.nota_evasione ? ' · ' + r.nota_evasione : ''));
  }
  if (r.data_arrivo) {
    righe.push('Arrivata il ' + fd(r.data_arrivo) + (r.arrivo_registrato_da_nome ? ' (segnata da ' + r.arrivo_registrato_da_nome + ')' : '') +
      (r.nota_arrivo ? ': ' + r.nota_arrivo : ''));
  }
  if (r.annullata_il) {
    righe.push('Annullata il ' + dataOraEsitoPreventivo(r.annullata_il) + (r.annullata_da_nome ? ' da ' + r.annullata_da_nome : '') +
      ': ' + (r.motivo_annullamento || ''));
  }

  return `
    <div style="font-size:12px;color:var(--m);margin-top:4px">
      ${righe.map(function(p) { return '<div style="word-break:break-word">• ' + esc(p) + '</div>'; }).join('')}
    </div>
  `;
}

// ── Nuova richiesta (capo tecnico, titolare) ────────────────────────
function apriNuovaRichiestaIntegrazione(tipo) {
  const commessa = commessaRichiesteAperta;
  if (!commessa) return;

  ge('mri-sottotitolo').textContent = 'Commessa ' + commessa.codice +
    (commessa.clienti?.ragione_sociale ? ' · ' + commessa.clienti.ragione_sociale : '') +
    (commessa.titolo ? ' · ' + commessa.titolo : '');
  ge('mri-tipo').value = TIPI_RICHIESTA_INTEGRAZIONE[tipo] ? tipo : 'consumabile';
  ge('mri-descrizione').value = '';
  ge('mri-quantita').value = '1';
  ge('mri-unita').value = '';
  ge('mri-serve-dal').value = '';
  ge('mri-fino-al').value = '';
  ge('mri-note').value = '';
  ge('mri-conferma').disabled = false;
  ge('mri-conferma-altra').disabled = false;

  cambiaTipoNuovaRichiestaIntegrazione();
  openM('m-richiesta-integrazione');
  setTimeout(function() { ge('mri-descrizione')?.focus(); }, 50);
}

function cambiaTipoNuovaRichiestaIntegrazione() {
  const tipo = v('mri-tipo') === 'nolo' ? 'nolo' : 'consumabile';
  const info = TIPI_RICHIESTA_INTEGRAZIONE[tipo];

  ge('mri-titolo').textContent = info.icona + ' Richiesta ' + (tipo === 'nolo' ? 'di nolo' : 'di consumabile');
  ge('mri-descrizione').placeholder = info.esempio;
  ge('mri-unita').placeholder = tipo === 'nolo' ? 'giorni' : 'pz';
  ge('mri-serve-dal-etichetta').textContent = tipo === 'nolo' ? 'Serve dal' : 'Serve in cantiere dal';
  ge('mri-fino-al-riga').style.display = tipo === 'nolo' ? '' : 'none';
  if (tipo !== 'nolo') ge('mri-fino-al').value = '';
}

async function salvaNuovaRichiestaIntegrazione(unAltra) {
  const commessa = commessaRichiesteAperta;
  if (!commessa) return;

  const tipo = v('mri-tipo');
  const descrizione = v('mri-descrizione').trim();
  const quantita = Number(String(v('mri-quantita')).replace(',', '.'));
  const serveDal = v('mri-serve-dal');
  const finoAl = tipo === 'nolo' ? v('mri-fino-al') : '';

  if (!TIPI_RICHIESTA_INTEGRAZIONE[tipo]) { toast('Scegli consumabile o nolo', 'err'); return; }
  if (!descrizione) { toast('Scrivi cosa serve', 'err'); return; }
  if (!Number.isFinite(quantita) || quantita <= 0) { toast('La quantità deve essere maggiore di zero', 'err'); return; }
  if (serveDal && finoAl && finoAl < serveDal) { toast('Il nolo non può finire prima di cominciare', 'err'); return; }

  ge('mri-conferma').disabled = true;
  ge('mri-conferma-altra').disabled = true;

  const { error } = await db.rpc('apri_richiesta_integrazione', {
    p_commessa_id: commessa.id,
    p_tipo: tipo,
    p_descrizione: descrizione,
    p_quantita: Math.round(quantita * 1000) / 1000,
    p_unita_misura: v('mri-unita').trim() || null,
    p_serve_dal: serveDal || null,
    p_nolo_fino_al: finoAl || null,
    p_note: v('mri-note').trim() || null
  });

  ge('mri-conferma').disabled = false;
  ge('mri-conferma-altra').disabled = false;

  if (error) {
    toast('Richiesta non salvata: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  toast((tipo === 'nolo' ? 'Nolo' : 'Consumabile') + ' richiesto agli acquisti', 'ok');

  if (unAltra) {
    // Stessa finestra, pronta per la prossima cosa da chiedere.
    ge('mri-descrizione').value = '';
    ge('mri-quantita').value = '1';
    ge('mri-note').value = '';
    ge('mri-descrizione').focus();
  } else {
    closeM('m-richiesta-integrazione');
  }

  await aggiornaDopoRichiestaIntegrazione();
}

// ── Evasione (acquisti: commerciale, titolare) ──────────────────────
async function apriEvadiRichiestaIntegrazione(richiestaId) {
  const r = richiesteIntegrazioneCache[richiestaId];
  if (!r) {
    toast('Richiesta non trovata: ricarica la pagina', 'err');
    return;
  }

  richiestaInModifica = { id: richiestaId, stato: 'evasa' };

  const commessa = r.commesse || {};
  ge('mev-titolo').textContent = (r.stato === 'evasa' ? '📅 Cambia la data di arrivo' : '📅 Evadi la richiesta');
  ge('mev-sottotitolo').textContent = 'Commessa ' + (commessa.codice || '') +
    (commessa.clienti?.ragione_sociale ? ' · ' + commessa.clienti.ragione_sociale : '') + ' · richiesta n. ' + r.numero;

  const quando = testoQuandoServeRichiesta(r);
  ge('mev-cosa').innerHTML =
    '<b>' + esc(testoCosaRichiestaIntegrazione(r)) + '</b>' +
    (quando ? '<div>' + esc(quando[0].toUpperCase() + quando.slice(1)) + '</div>' : '') +
    (r.note ? '<div>Note del capo tecnico: ' + esc(r.note) + '</div>' : '') +
    '<div style="font-size:12px;color:var(--m)">Chiesta da ' + esc(r.richiesta_da_nome || '—') + ' il ' + esc(dataOraEsitoPreventivo(r.richiesta_il)) + '</div>';

  const giornoRichiesta = r.richiesta_il ? new Date(r.richiesta_il).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) : '';
  ge('mev-arrivo').min = giornoRichiesta;
  ge('mev-arrivo').value = r.arrivo_previsto || '';
  ge('mev-fornitore').value = r.fornitore_nome || '';
  ge('mev-costo').value = r.costo != null ? String(r.costo) : '';
  ge('mev-nota').value = r.nota_evasione || '';
  ge('mev-conferma').disabled = false;
  ge('mev-conferma').textContent = r.stato === 'evasa' ? '📅 Salva la nuova data' : '📅 Evadi e comunica la data';

  openM('m-evadi-richiesta');
  await caricaFornitoriRichiesteIntegrazione();
}

// Tendina dei fornitori in anagrafica (si può anche scrivere un nome).
async function caricaFornitoriRichiesteIntegrazione() {
  const elenco = ge('mev-fornitori-elenco');
  if (!elenco) return;

  if (fornitoriRichiesteElenco === null) {
    const { data, error } = await db
      .from('fornitori')
      .select('id, ragione_sociale')
      .eq('attivo', true)
      .order('ragione_sociale', { ascending: true });
    if (error) {
      console.warn('Fornitori per consumabili e noli:', error.message);
      return;
    }
    fornitoriRichiesteElenco = data || [];
  }

  elenco.innerHTML = fornitoriRichiesteElenco.map(function(f) {
    return `<option value="${esc(f.ragione_sociale)}"></option>`;
  }).join('');
}

async function salvaEvasioneRichiestaIntegrazione() {
  const modifica = richiestaInModifica;
  if (!modifica || modifica.stato !== 'evasa') return;

  const arrivo = v('mev-arrivo');
  const fornitore = v('mev-fornitore').trim();
  const costoTesto = String(v('mev-costo')).trim().replace(',', '.');
  const costo = costoTesto === '' ? null : Number(costoTesto);

  if (!arrivo) { toast('Indica la data di arrivo prevista', 'err'); return; }
  if (ge('mev-arrivo').min && arrivo < ge('mev-arrivo').min) { toast('La data di arrivo non può essere prima della richiesta', 'err'); return; }
  if (costo !== null && (!Number.isFinite(costo) || costo < 0)) { toast('Costo non valido', 'err'); return; }

  const inAnagrafica = (fornitoriRichiesteElenco || []).find(function(f) {
    return String(f.ragione_sociale || '').trim().toLowerCase() === fornitore.toLowerCase();
  });

  const bottone = ge('mev-conferma');
  bottone.disabled = true;

  const { error } = await db.rpc('evadi_richiesta_integrazione', {
    p_richiesta_id: modifica.id,
    p_arrivo_previsto: arrivo,
    p_fornitore_id: inAnagrafica ? inAnagrafica.id : null,
    p_fornitore_nome: inAnagrafica ? null : (fornitore || null),
    p_costo: costo === null ? null : Math.round(costo * 100) / 100,
    p_nota: v('mev-nota').trim() || null
  });

  if (error) {
    bottone.disabled = false;
    toast('Richiesta non evasa: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-evadi-richiesta');
  richiestaInModifica = null;
  toast('Data di arrivo comunicata al capo tecnico: ' + fd(arrivo), 'ok');
  await aggiornaDopoRichiestaIntegrazione();
}

// ── Arrivata / annullata ────────────────────────────────────────────
function apriStatoRichiestaIntegrazione(richiestaId, stato) {
  const r = richiesteIntegrazioneCache[richiestaId];
  if (!r) {
    toast('Richiesta non trovata: ricarica la pagina', 'err');
    return;
  }

  const testi = {
    arrivata: {
      titolo: '📦 Consumabile o nolo arrivato',
      data: 'Data di arrivo *',
      nota: 'Nota (facoltativa, es. numero del DDT, mancanze)',
      bottone: '📦 Segna arrivata'
    },
    annullata: {
      titolo: 'Annulla la richiesta',
      data: '',
      nota: 'Motivo dell\'annullamento *',
      bottone: 'Annulla la richiesta'
    }
  }[stato];
  if (!testi) return;

  richiestaInModifica = { id: richiestaId, stato: stato };

  const commessa = r.commesse || {};
  ge('msr-titolo').textContent = testi.titolo;
  ge('msr-sottotitolo').textContent = 'Commessa ' + (commessa.codice || '') + ' · n. ' + r.numero + ' · ' + testoCosaRichiestaIntegrazione(r);
  ge('msr-data-riga').style.display = testi.data ? '' : 'none';
  ge('msr-data-etichetta').textContent = testi.data;
  ge('msr-data').max = dataOggiOrdine();
  ge('msr-data').min = r.richiesta_il ? new Date(r.richiesta_il).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) : '';
  ge('msr-data').value = dataOggiOrdine();
  ge('msr-nota-etichetta').textContent = testi.nota;
  ge('msr-nota').value = '';
  ge('msr-avviso').innerHTML = stato === 'annullata'
    ? '<div class="al2 w">La richiesta resta nell\'elenco come annullata e non si può riattivare. Se serve, se ne fa una nuova.' +
      (r.stato === 'evasa' ? ' Gli acquisti l\'avevano già evasa: avvisa il fornitore.' : '') + '</div>'
    : '';

  const bottone = ge('msr-conferma');
  bottone.textContent = testi.bottone;
  bottone.disabled = false;

  openM('m-stato-richiesta-integrazione');
}

async function salvaStatoRichiestaIntegrazione() {
  const modifica = richiestaInModifica;
  if (!modifica || !['arrivata', 'annullata'].includes(modifica.stato)) return;

  const nota = v('msr-nota').trim();
  const data = v('msr-data');

  if (modifica.stato === 'annullata' && !nota) { toast('Scrivi il motivo dell\'annullamento', 'err'); return; }
  if (modifica.stato === 'arrivata' && !data) { toast('Indica la data di arrivo', 'err'); return; }
  if (modifica.stato === 'arrivata' && data > dataOggiOrdine()) { toast('La data di arrivo non può essere nel futuro', 'err'); return; }

  const bottone = ge('msr-conferma');
  bottone.disabled = true;

  const { error } = await db.rpc('cambia_stato_richiesta_integrazione', {
    p_richiesta_id: modifica.id,
    p_stato: modifica.stato,
    p_data: modifica.stato === 'arrivata' ? data : null,
    p_nota: nota || null
  });

  if (error) {
    bottone.disabled = false;
    toast('Richiesta non aggiornata: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-stato-richiesta-integrazione');
  richiestaInModifica = null;
  toast('Richiesta: ' + ETICHETTE_STATO_RICHIESTA_INTEGRAZIONE[modifica.stato], 'ok');
  await aggiornaDopoRichiestaIntegrazione();
}

// ── Dashboard: commerciale (da evadere) e capo tecnico (in arrivo) ──
const BOX_RICHIESTE_INTEGRAZIONE_DASHBOARD = {
  commerciale: 'com-richieste-integrazione',
  capo_tecnico: 'ct-richieste-integrazione'
};

async function caricaRichiesteIntegrazioneDashboard() {
  const box = ge(BOX_RICHIESTE_INTEGRAZIONE_DASHBOARD[ROLE] || '');
  if (!box) return;

  if (!(await verificaRichiesteIntegrazioneDisponibili())) {
    box.innerHTML = '';
    return;
  }

  const stati = ROLE === 'commerciale' ? ['aperta'] : ['aperta', 'evasa'];

  const { data, error } = await db
    .from('commesse_richieste_integrazione')
    .select('*, commesse(id, codice, stato, titolo, clienti(ragione_sociale))')
    .in('stato', stati)
    .order('richiesta_il', { ascending: true });

  if (error) {
    console.warn('Consumabili e noli in dashboard:', error.message);
    box.innerHTML = '';
    return;
  }

  const richieste = (data || []).filter(function(r) { return r.commesse && commessaAperta(r.commesse); });
  richieste.forEach(function(r) { richiesteIntegrazioneCache[r.id] = r; });

  if (ROLE === 'capo_tecnico') {
    // Prima quelle in arrivo (per data), poi quelle che aspettano gli acquisti.
    richieste.sort(function(a, b) {
      if (a.stato !== b.stato) return a.stato === 'evasa' ? -1 : 1;
      return String(a.arrivo_previsto || a.richiesta_il).localeCompare(String(b.arrivo_previsto || b.richiesta_il));
    });
  }

  if (!richieste.length) {
    box.innerHTML = '';
    return;
  }

  const titolo = ROLE === 'commerciale'
    ? '🧰 Consumabili e noli da procurare (' + richieste.length + ')'
    : '🧰 Consumabili e noli richiesti agli acquisti (' + richieste.length + ')';
  const aiuto = ROLE === 'commerciale'
    ? 'Richieste del capo tecnico: procura e indica la data di arrivo (passo 9).'
    : 'Le date di arrivo le indicano gli acquisti; quando arriva, segna "Arrivata".';

  box.innerHTML = `
    <div class="tit-section" style="margin-top:14px">${esc(titolo)}</div>
    <div class="rap-list-card" style="margin-bottom:14px">
      <div style="font-size:12px;color:var(--m);margin-bottom:4px">${esc(aiuto)}</div>
      ${richieste.map(function(r) { return htmlRigaRichiestaIntegrazione(r.commesse, r, true); }).join('')}
    </div>
  `;
}

// ── Aggiornamento dopo una modifica ─────────────────────────────────
async function aggiornaDopoRichiestaIntegrazione() {
  if (ge('pg-commessa-detail')?.classList.contains('on') && commessaApertaId) {
    await caricaSchedaCommessa(commessaApertaId);
    return;
  }
  if (ge('pg-commesse')?.classList.contains('on')) {
    await loadCommesse();
    return;
  }
  await caricaRichiesteIntegrazioneDashboard();
  if (typeof caricaMaterialiInRitardoDashboard === 'function') await caricaMaterialiInRitardoDashboard(); // F6.3, js/29
}
