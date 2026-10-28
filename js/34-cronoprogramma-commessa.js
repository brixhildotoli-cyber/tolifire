// =====================================================================
// F8.3 — CRONOPROGRAMMA E % DI AVANZAMENTO della commessa (passo 11,
// Capo Operativo = capo_tecnico). Le fasi del lavoro con date previste
// ed effettive e la % di avanzamento di ciascuna; la commessa mostra la
// sua % (media delle fasi pesata con il "peso", predefinito 1 = tutte
// uguali).
// Box "📅 Cronoprogramma e avanzamento" (cmd-cronoprogramma) nella
// scheda "🏗️ Cantiere" della commessa, con un mini cronoprogramma a
// barre (solo CSS); riquadro compatto della % in cima alle due schede
// (cmd-avanzamento-cantiere, cmd-avanzamento) e colonna "Avanzamento"
// nella pagina Commesse (js/26 filtraCommesse).
// Lo vede chi vede la commessa; scrivono capo_tecnico e titolare (su
// commessa chiusa o annullata solo il titolare). Fasi proposte dalle voci
// del preventivo (scheda_cantiere_commessa di sql/34, senza prezzi) o
// libere. Fase in ritardo: fine prevista passata e non al 100%.
// Lo stato della commessa NON cambia da solo: con tutte le fasi al 100%
// il capo tecnico trova il suggerimento "segna Fine lavori" (finestra
// "Stato e storico" di js/18, solo con sql/28).
// Tutto attivo con sql/36-cronoprogramma-commessa (richiede 26). Senza:
// il box dice "non ancora attivo" e la colonna non compare.
// =====================================================================

const RUOLI_SCRIVONO_CRONOPROGRAMMA = ['titolare', 'capo_tecnico'];

// Fasi tipiche di un cantiere antincendio, proposte (non spuntate)
// insieme alle voci del preventivo.
const FASI_TIPICHE_CANTIERE = [
  'Allestimento del cantiere',
  'Prove, verifiche e collaudo',
  'Smobilizzo e pulizia del cantiere'
];

let cronoprogrammaDisponibile = null;
let cronoprogrammaAperto = null;    // { commessa, fasi, datiLavori }
let faseCronoprogrammaAperta = null; // { commessa, fase } finestra aperta
let propostaFasiAperta = null;       // { commessa, proposte }
let avanzamentoCommesse = null;      // { id commessa: riepilogo } per la pagina Commesse; null = non attivo

// ── Disponibilità di sql/36 ─────────────────────────────────────────
async function verificaCronoprogrammaDisponibile() {
  if (cronoprogrammaDisponibile !== null) return cronoprogrammaDisponibile;
  if (!(await verificaCommesseDisponibili())) return false;

  const { error } = await db
    .from('commesse_fasi')
    .select('id')
    .limit(1);

  if (!error) {
    cronoprogrammaDisponibile = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /commesse_fasi/i.test(error.message || '')) {
    cronoprogrammaDisponibile = false;
  } else {
    return false;
  }
  return cronoprogrammaDisponibile;
}

// ── Chi può fare cosa (le stesse regole le impone il database) ──────
function puoModificareCronoprogramma(commessa) {
  if (ROLE === 'titolare') return true;
  return RUOLI_SCRIVONO_CRONOPROGRAMMA.includes(ROLE) && commessaAperta(commessa);
}

// ── Calcoli (stessa formula ovunque) ────────────────────────────────
// % della commessa = somma(peso x %) / somma(peso), arrotondata.
function calcolaAvanzamentoFasi(fasi) {
  const oggi = dataLocaleISO();
  const elenco = fasi || [];
  let pesi = 0;
  let somma = 0;
  let completate = 0;
  let inRitardo = 0;
  elenco.forEach(function(f) {
    const peso = Number(f.peso) || 1;
    const perc = Number(f.percentuale) || 0;
    pesi += peso;
    somma += peso * perc;
    if (perc >= 100) completate++;
    if (faseInRitardo(f, oggi)) inRitardo++;
  });
  return {
    fasi: elenco.length,
    // 100% solo se tutte le fasi sono finite: 99,5 non deve diventare 100
    percentuale: pesi
      ? (completate < elenco.length ? Math.min(99, Math.round(somma / pesi)) : Math.round(somma / pesi))
      : null,
    completate: completate,
    inRitardo: inRitardo
  };
}

function faseInRitardo(fase, oggi) {
  return !!fase.fine_prevista && fase.fine_prevista < (oggi || dataLocaleISO()) && (Number(fase.percentuale) || 0) < 100;
}

// Stato leggibile della fase (non si salva: lo calcola il sito).
function statoFaseCronoprogramma(fase, oggi) {
  oggi = oggi || dataLocaleISO();
  const perc = Number(fase.percentuale) || 0;
  if (perc >= 100) return { codice: 'completata', etichetta: 'Completata', classe: 'bok' };
  if (faseInRitardo(fase, oggi)) return { codice: 'ritardo', etichetta: 'In ritardo', classe: 'berr' };
  if (perc > 0 || fase.inizio_effettivo) return { codice: 'in_corso', etichetta: 'In corso', classe: 'bblue' };
  if (fase.inizio_previsto && fase.inizio_previsto < oggi) return { codice: 'da_iniziare_tardi', etichetta: 'Doveva iniziare', classe: 'bwarn' };
  return { codice: 'da_iniziare', etichetta: 'Da iniziare', classe: 'bgray' };
}

function dataCortaCrono(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function giorniTraCrono(dal, al) {
  return Math.round((new Date(al + 'T00:00:00') - new Date(dal + 'T00:00:00')) / 86400000);
}

function testoPeriodoCrono(dal, al, vuoto) {
  if (!dal && !al) return vuoto;
  return (dal ? dataCortaCrono(dal) : '?') + ' → ' + (al ? dataCortaCrono(al) : '?');
}

// ── Pezzi di interfaccia riusati ────────────────────────────────────
function testoConteggioFasi(r) {
  return 'Fasi completate: ' + r.completate + ' su ' + r.fasi;
}

function htmlBarraAvanzamento(percentuale, ritardo, piccola) {
  const p = Math.max(0, Math.min(100, Number(percentuale) || 0));
  const colore = p >= 100 ? 'var(--gm)' : (ritardo ? '#E24B4A' : '#378ADD');
  return `<div class="crono-barra${piccola ? ' piccola' : ''}" title="${p}%"><div style="width:${p}%;background:${colore}"></div></div>`;
}

// Riquadro compatto (senza id dentro: si mette in due punti della scheda).
function htmlAvanzamentoCompatto(r, vaiAlBox) {
  if (!r) return '';
  const corpo = r.percentuale === null
    ? '<div style="font-size:13px;color:var(--m)">Cronoprogramma da preparare: nessuna fase indicata.</div>'
    : `
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <div style="font-size:13px;font-weight:700">📅 Avanzamento lavori</div>
        <div class="crono-perc">${r.percentuale}%</div>
      </div>
      ${htmlBarraAvanzamento(r.percentuale, r.inRitardo > 0)}
      <div style="font-size:12px;color:var(--m);margin-top:4px">
        ${esc(testoConteggioFasi(r))}${r.inRitardo ? ` · <b style="color:var(--r)">${r.inRitardo} in ritardo</b>` : ''}
      </div>
    `;
  return `
    <div class="card crono-compatto">
      ${corpo}
      ${vaiAlBox ? `<button class="btn sm" style="margin-top:6px" onclick="vaiAlCronoprogramma()">Apri il cronoprogramma</button>` : ''}
    </div>
  `;
}

function vaiAlCronoprogramma() {
  if (typeof mostraTabCommessa === 'function') mostraTabCommessa('cantiere');
  setTimeout(function() { ge('cmd-cronoprogramma')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
}

// ── Caricamento del box (chiamata da js/26 dopo la scheda cantiere) ──
async function caricaCronoprogrammaCommessa(commessa) {
  const box = ge('cmd-cronoprogramma');
  if (!box || !commessa) return;
  const compatti = ['cmd-avanzamento', 'cmd-avanzamento-cantiere'];
  compatti.forEach(function(id) { if (ge(id)) ge(id).innerHTML = ''; });
  cronoprogrammaAperto = null;

  const titolo = '<div class="crono-titolo">📅 Cronoprogramma e avanzamento</div>';

  if (!(await verificaCronoprogrammaDisponibile())) {
    box.innerHTML = `<div class="card crono-card">${titolo}<div class="al2 i" style="margin:0">Il cronoprogramma e la % di avanzamento non sono ancora attivi.</div></div>`;
    return;
  }

  box.innerHTML = `<div class="card crono-card">${titolo}<div class="load">Caricamento...</div></div>`;

  const { data: fasi, error } = await db
    .from('commesse_fasi')
    .select('id, ordine, nome, peso, inizio_previsto, fine_prevista, inizio_effettivo, fine_effettiva, percentuale, note, aggiornato_da_nome, aggiornato_il')
    .eq('commessa_id', commessa.id)
    .order('ordine');

  if (commessaApertaId && commessaApertaId !== commessa.id) return;

  if (error) {
    box.innerHTML = `<div class="card crono-card">${titolo}<div class="al2 e" style="margin:0">Errore caricamento cronoprogramma: ${esc(error.message)}</div></div>`;
    return;
  }

  // Date dei lavori della commessa (sql/33), già lette dalla scheda cantiere.
  const dati = typeof cantiereAperto !== 'undefined' && cantiereAperto && cantiereAperto.commessa?.id === commessa.id
    ? (cantiereAperto.dati || {})
    : {};

  cronoprogrammaAperto = {
    commessa: commessa,
    fasi: fasi || [],
    datiLavori: { data_inizio: dati.data_inizio || null, data_fine_prevista: dati.data_fine_prevista || null }
  };

  disegnaCronoprogramma();
}

function disegnaCronoprogramma() {
  const s = cronoprogrammaAperto;
  const box = ge('cmd-cronoprogramma');
  if (!s || !box) return;
  const riepilogo = calcolaAvanzamentoFasi(s.fasi);
  box.innerHTML = htmlCronoprogramma(s, riepilogo);
  if (ge('cmd-avanzamento')) ge('cmd-avanzamento').innerHTML = htmlAvanzamentoCompatto(riepilogo, true);
  if (ge('cmd-avanzamento-cantiere')) {
    ge('cmd-avanzamento-cantiere').innerHTML = riepilogo.fasi ? htmlAvanzamentoCompatto(riepilogo, true) : '';
  }
  // La pagina Commesse, se già caricata, resta allineata.
  if (avanzamentoCommesse) avanzamentoCommesse[s.commessa.id] = riepilogo;
}

function htmlCronoprogramma(s, r) {
  const c = s.commessa;
  const modifica = puoModificareCronoprogramma(c);
  const oggi = dataLocaleISO();
  const fineLavori = s.datiLavori.data_fine_prevista;

  const avvisi = [];
  if (r.fasi && r.completate === r.fasi && c.stato === 'in_corso') {
    avvisi.push(modifica && statiCommessaDisponibili === true
      ? `<div class="al2 ok" style="margin:0 0 8px">Tutte le fasi sono al 100%: se il cantiere è finito segna <b>Fine lavori</b> (la commessa passa alla segreteria).
           <div style="margin-top:6px"><button class="btn sm p" onclick="apriStatoCommessa('${esc(c.id)}', '${esc(c.preventivo_id || '')}')">Segna Fine lavori</button></div></div>`
      : '<div class="al2 ok" style="margin:0 0 8px">Tutte le fasi sono al 100%.</div>');
  }
  if (r.fasi && r.percentuale < 100 && ['fine_lavori', 'chiusa'].includes(c.stato)) {
    avvisi.push(`<div class="al2 w" style="margin:0 0 8px">La commessa è in "${esc(ETICHETTE_STATO_COMMESSA[c.stato] || c.stato)}" ma il cronoprogramma è al ${r.percentuale}%.</div>`);
  }
  if (fineLavori && fineLavori < oggi && r.fasi && r.percentuale < 100 && commessaAperta(c)) {
    avvisi.push(`<div class="al2 e" style="margin:0 0 8px">Fine lavori prevista il <b>${esc(fd(fineLavori))}</b> già passata (avanzamento ${r.percentuale}%).</div>`);
  }

  const testa = r.fasi ? `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:4px">
      <div style="font-size:13px">${esc(testoConteggioFasi(r))}${r.inRitardo ? ` · <b style="color:var(--r)">${r.inRitardo} in ritardo</b>` : ''}</div>
      <div class="crono-perc grande">${r.percentuale}%</div>
    </div>
    ${htmlBarraAvanzamento(r.percentuale, r.inRitardo > 0)}
    <div style="font-size:11px;color:var(--m);margin:4px 0 8px">% della commessa: media delle fasi${s.fasi.some(function(f) { return Number(f.peso) !== 1; }) ? ' pesata con il peso di ciascuna' : ''}.</div>
  ` : `
    <div class="empty" style="padding:10px 0">Nessuna fase: ${modifica ? 'proponile dalle voci del preventivo o aggiungile una alla volta.' : 'il cronoprogramma lo prepara il capo tecnico.'}</div>
  `;

  const bottoni = modifica ? `
    <div class="crono-bottoni">
      <button class="btn p" onclick="apriFaseCronoprogramma(null)">➕ Aggiungi una fase</button>
      <button class="btn" onclick="apriPropostaFasi()">📋 Proponi le fasi dal preventivo</button>
    </div>
  ` : '';

  return `
    <div class="card crono-card">
      <div class="crono-titolo">📅 Cronoprogramma e avanzamento</div>
      ${s.datiLavori.data_inizio && typeof testoDateLavori === 'function' ? `<div style="font-size:12px;color:var(--m)">Date dei lavori: ${esc(testoDateLavori(s.datiLavori))}</div>` : ''}
      ${testa}
      ${avvisi.join('')}
      ${htmlGanttFasi(s)}
      ${s.fasi.map(function(f, i) { return htmlFaseCronoprogramma(s, f, i, modifica, oggi); }).join('')}
      ${bottoni}
    </div>
  `;
}

function htmlFaseCronoprogramma(s, f, indice, modifica, oggi) {
  const stato = statoFaseCronoprogramma(f, oggi);
  const perc = Number(f.percentuale) || 0;
  const fineLavori = s.datiLavori.data_fine_prevista;
  const inizioLavori = s.datiLavori.data_inizio;
  const fuori = (fineLavori && f.fine_prevista && f.fine_prevista > fineLavori) ||
    (inizioLavori && f.inizio_previsto && f.inizio_previsto < inizioLavori);

  return `
    <div class="crono-fase">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div style="min-width:0;flex:1">
          <div style="font-size:14px;font-weight:700;overflow-wrap:anywhere">${indice + 1}. ${esc(f.nome)}</div>
          <div style="margin-top:2px;display:flex;gap:4px;flex-wrap:wrap">
            <span class="bx ${stato.classe}">${esc(stato.etichetta)}</span>
            ${Number(f.peso) !== 1 ? `<span class="bx bgray">peso ${esc(f.peso)}</span>` : ''}
            ${fuori ? '<span class="bx bwarn">fuori dalle date dei lavori</span>' : ''}
          </div>
        </div>
        <div class="crono-perc">${perc}%</div>
      </div>
      ${htmlBarraAvanzamento(perc, stato.codice === 'ritardo', true)}
      <div class="crono-date">
        <div><span>Prevista</span> ${esc(testoPeriodoCrono(f.inizio_previsto, f.fine_prevista, 'da indicare'))}</div>
        <div><span>Effettiva</span> ${esc(f.inizio_effettivo
          ? dataCortaCrono(f.inizio_effettivo) + ' → ' + (f.fine_effettiva ? dataCortaCrono(f.fine_effettiva) : 'in corso')
          : 'non iniziata')}</div>
      </div>
      ${f.note ? `<div style="font-size:12px;color:var(--m);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:2px">${esc(f.note)}</div>` : ''}
      ${modifica ? `
        <div class="crono-azioni">
          <button class="btn sm p" onclick="apriFaseCronoprogramma('${esc(f.id)}')">✏️ Aggiorna</button>
          ${indice > 0 ? `<button class="btn sm" title="Sposta su" aria-label="Sposta su" onclick="spostaFaseCronoprogramma('${esc(f.id)}', true)">↑</button>` : ''}
          ${indice < s.fasi.length - 1 ? `<button class="btn sm" title="Sposta giù" aria-label="Sposta giù" onclick="spostaFaseCronoprogramma('${esc(f.id)}', false)">↓</button>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

// Mini cronoprogramma a barre (solo CSS): previsto (chiaro, riempito con
// la %) ed effettivo (sotto, sottile), linea rossa = oggi.
function htmlGanttFasi(s) {
  const conDate = s.fasi.filter(function(f) { return f.inizio_previsto || f.fine_prevista || f.inizio_effettivo; });
  if (!conDate.length) return '';

  const oggi = dataLocaleISO();
  const date = [];
  s.fasi.forEach(function(f) {
    [f.inizio_previsto, f.fine_prevista, f.inizio_effettivo, f.fine_effettiva].forEach(function(d) { if (d) date.push(d); });
    if (f.inizio_effettivo && !f.fine_effettiva) date.push(oggi);
  });
  if (s.datiLavori.data_inizio) date.push(s.datiLavori.data_inizio);
  if (s.datiLavori.data_fine_prevista) date.push(s.datiLavori.data_fine_prevista);
  date.sort();
  const dal = date[0];
  const al = date[date.length - 1];
  const totale = giorniTraCrono(dal, al) + 1;

  function posizione(inizio, fine) {
    const a = inizio || fine;
    const b = fine || inizio;
    const left = giorniTraCrono(dal, a) / totale * 100;
    const width = Math.max((giorniTraCrono(a, b) + 1) / totale * 100, 1.5);
    return 'left:' + left.toFixed(2) + '%;width:' + Math.min(width, 100 - left).toFixed(2) + '%';
  }

  const lineaOggi = oggi >= dal && oggi <= al
    ? `<div class="crono-oggi" style="left:${((giorniTraCrono(dal, oggi) + 0.5) / totale * 100).toFixed(2)}%"></div>`
    : '';

  const righe = s.fasi.map(function(f, i) {
    const perc = Number(f.percentuale) || 0;
    const ritardo = faseInRitardo(f, oggi);
    const previsto = (f.inizio_previsto || f.fine_prevista)
      ? `<div class="crono-g-prev${ritardo ? ' ritardo' : ''}" style="${posizione(f.inizio_previsto, f.fine_prevista)}"><div style="width:${perc}%"></div></div>`
      : '';
    const effettivo = f.inizio_effettivo
      ? `<div class="crono-g-eff${f.fine_effettiva ? ' finita' : ''}" style="${posizione(f.inizio_effettivo, f.fine_effettiva || (oggi > f.inizio_effettivo ? oggi : f.inizio_effettivo))}"></div>`
      : '';
    return `
      <div class="crono-g-riga">
        <div class="crono-g-nome" title="${esc(f.nome)}">${i + 1}. ${esc(f.nome)}</div>
        <div class="crono-g-pista">${lineaOggi}${previsto}${effettivo}</div>
      </div>
    `;
  }).join('');

  return `
    <details class="crono-gantt" open>
      <summary>Cronoprogramma dal ${esc(fd(dal))} al ${esc(fd(al))}</summary>
      ${righe}
      <div class="crono-g-legenda">
        <span><i class="prev"></i> previsto (pieno = % fatta)</span>
        <span><i class="eff"></i> effettivo</span>
        ${lineaOggi ? '<span><i class="oggi"></i> oggi</span>' : ''}
      </div>
    </details>
  `;
}

// ── Finestra "Fase del cronoprogramma" ──────────────────────────────
function apriFaseCronoprogramma(faseId) {
  const s = cronoprogrammaAperto;
  if (!s) return;
  const fase = faseId ? s.fasi.find(function(f) { return f.id === faseId; }) : null;
  if (faseId && !fase) { toast('Fase non trovata: ricarica la pagina', 'err'); return; }

  faseCronoprogrammaAperta = { commessa: s.commessa, fase: fase };
  const c = s.commessa;
  ge('crf-titolo').textContent = fase ? '📅 Aggiorna la fase' : '📅 Nuova fase';
  ge('crf-sottotitolo').textContent = 'Commessa ' + c.codice + (c.clienti?.ragione_sociale ? ' · ' + c.clienti.ragione_sociale : '');
  ge('crf-nome').value = fase?.nome || '';
  ge('crf-peso').value = fase?.peso || 1;
  ge('crf-inizio-prev').value = fase?.inizio_previsto || '';
  ge('crf-fine-prev').value = fase?.fine_prevista || '';
  ge('crf-inizio-eff').value = fase?.inizio_effettivo || '';
  ge('crf-fine-eff').value = fase?.fine_effettiva || '';
  ge('crf-note').value = fase?.note || '';
  const oggi = dataLocaleISO();
  ge('crf-inizio-eff').max = oggi;
  ge('crf-fine-eff').max = oggi;
  impostaPercentualeFase(fase ? Number(fase.percentuale) || 0 : 0, true);
  ge('crf-togli').style.display = fase ? '' : 'none';
  ge('crf-salva').disabled = false;
  ge('crf-avviso').innerHTML = '';
  openM('m-fase-cronoprogramma');
}

// Imposta la % (bottoni rapidi o cursore) e tiene coerenti le date
// effettive: oltre lo 0% serve l'inizio, al 100% la fine (oggi se manca).
function impostaPercentualeFase(valore, senzaDate) {
  const p = Math.max(0, Math.min(100, Math.round(Number(valore) || 0)));
  ge('crf-perc').value = p;
  ge('crf-perc-testo').textContent = p + '%';
  document.querySelectorAll('#m-fase-cronoprogramma .crono-rapidi button').forEach(function(b) {
    b.classList.toggle('p', Number(b.dataset.perc) === p);
  });
  if (senzaDate) return;
  const oggi = dataLocaleISO();
  if (p > 0 && !v('crf-inizio-eff')) ge('crf-inizio-eff').value = oggi;
  if (p === 100 && !v('crf-fine-eff')) ge('crf-fine-eff').value = oggi;
  if (p < 100 && v('crf-fine-eff')) ge('crf-fine-eff').value = '';
}

// Chi scrive la fine effettiva ha finito la fase: 100%.
function cambiaFineEffettivaFase() {
  if (v('crf-fine-eff')) {
    impostaPercentualeFase(100, true);
    if (!v('crf-inizio-eff')) ge('crf-inizio-eff').value = v('crf-fine-eff');
  }
}

async function salvaFaseCronoprogramma() {
  const m = faseCronoprogrammaAperta;
  if (!m) return;
  const nome = (v('crf-nome') || '').trim();
  const peso = parseInt(v('crf-peso'), 10);
  const perc = parseInt(v('crf-perc'), 10) || 0;
  const iPrev = v('crf-inizio-prev') || null;
  const fPrev = v('crf-fine-prev') || null;
  const iEff = v('crf-inizio-eff') || null;
  const fEff = v('crf-fine-eff') || null;
  const oggi = dataLocaleISO();

  const errore = function(testo) { ge('crf-avviso').innerHTML = `<div class="al2 e" style="margin:8px 0 0">${esc(testo)}</div>`; };
  if (!nome) return errore('Scrivi il nome della fase.');
  if (!(peso >= 1 && peso <= 100)) return errore('Il peso va da 1 a 100 (1 = come le altre fasi).');
  if (iPrev && fPrev && fPrev < iPrev) return errore('La fine prevista non può essere prima dell\'inizio previsto.');
  if ((iEff && iEff > oggi) || (fEff && fEff > oggi)) return errore('Le date effettive non possono essere dopo oggi.');
  if (iEff && fEff && fEff < iEff) return errore('La fine effettiva non può essere prima dell\'inizio effettivo.');
  if (fEff && perc < 100) return errore('Con la fine effettiva la fase è al 100%: metti 100% o togli la data.');

  const bottone = ge('crf-salva');
  bottone.disabled = true;
  const { error } = await db.rpc('salva_fase_commessa', {
    p_commessa_id: m.commessa.id,
    p_fase_id: m.fase ? m.fase.id : null,
    p_nome: nome,
    p_peso: peso,
    p_inizio_previsto: iPrev,
    p_fine_prevista: fPrev,
    p_inizio_effettivo: iEff,
    p_fine_effettiva: fEff,
    p_percentuale: perc,
    p_note: (v('crf-note') || '').trim() || null
  });
  bottone.disabled = false;

  if (error) {
    errore('Fase non salvata: ' + (error.message || 'errore sconosciuto'));
    return;
  }
  closeM('m-fase-cronoprogramma');
  toast(m.fase ? 'Fase aggiornata' : 'Fase aggiunta', 'ok');
  await ricaricaCronoprogramma(m.commessa);
}

async function togliFaseCronoprogramma() {
  const m = faseCronoprogrammaAperta;
  if (!m || !m.fase) return;
  if (!confirm('Togliere la fase "' + m.fase.nome + '" dal cronoprogramma?')) return;
  const { error } = await db.rpc('togli_fase_commessa', { p_fase_id: m.fase.id });
  if (error) {
    toast('Fase non tolta: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }
  closeM('m-fase-cronoprogramma');
  toast('Fase tolta', 'ok');
  await ricaricaCronoprogramma(m.commessa);
}

async function spostaFaseCronoprogramma(faseId, su) {
  const s = cronoprogrammaAperto;
  if (!s) return;
  const { error } = await db.rpc('sposta_fase_commessa', { p_fase_id: faseId, p_su: !!su });
  if (error) {
    toast('Fase non spostata: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }
  await ricaricaCronoprogramma(s.commessa);
}

async function ricaricaCronoprogramma(commessa) {
  if (commessaApertaId === commessa.id) await caricaCronoprogrammaCommessa(commessa);
}

// ── Proposta delle fasi dalle voci del preventivo ───────────────────
// Le voci arrivano senza prezzi (scheda_cantiere_commessa, sql/34). Si
// propongono spuntate le voci di lavoro (manodopera e servizi); se il
// preventivo non ne ha, quelle di materiale. Noli e trasporti non
// spuntati. Più le fasi tipiche di un cantiere, non spuntate.
async function apriPropostaFasi() {
  const s = cronoprogrammaAperto;
  if (!s) return;

  let voci = [];
  let avviso = '';
  const schedaAttiva = typeof verificaDatiCantiereDisponibili === 'function' && await verificaDatiCantiereDisponibili();
  if (schedaAttiva) {
    const { data, error } = await db.rpc('scheda_cantiere_commessa', { p_commessa_id: s.commessa.id });
    if (error) avviso = 'Voci del preventivo non disponibili: ' + error.message;
    else voci = (data && data.lavorazioni) || [];
  } else {
    avviso = 'Le voci del preventivo non sono ancora disponibili qui: scegli tra le fasi tipiche o aggiungi le fasi una alla volta.';
  }

  const giaPresenti = s.fasi.map(function(f) { return f.nome.trim().toLowerCase(); });
  const lavoro = voci.some(function(x) { return ['manodopera', 'servizio'].includes(x.categoria); });

  const proposte = voci.map(function(x) {
    const quantita = typeof quantitaLavorazione === 'function' ? quantitaLavorazione(x).trim() : '';
    const nome = (String(x.descrizione || '').trim() + (quantita && Number(x.quantita) ? ' — ' + quantita : '')).slice(0, 200);
    const spuntata = lavoro ? ['manodopera', 'servizio'].includes(x.categoria) : x.categoria === 'materiale' || !x.categoria;
    return { nome: nome, categoria: x.categoria, spuntata: spuntata };
  }).filter(function(p) { return p.nome; })
    .concat(FASI_TIPICHE_CANTIERE.map(function(n) { return { nome: n, categoria: 'tipica', spuntata: false }; }))
    .map(function(p) {
      const gia = giaPresenti.includes(p.nome.toLowerCase());
      return Object.assign(p, { gia: gia, spuntata: p.spuntata && !gia });
    });

  propostaFasiAperta = { commessa: s.commessa, proposte: proposte };

  ge('crp-sottotitolo').textContent = 'Commessa ' + s.commessa.codice + (s.commessa.clienti?.ragione_sociale ? ' · ' + s.commessa.clienti.ragione_sociale : '');
  ge('crp-avviso').innerHTML = avviso ? `<div class="al2 i" style="margin:0 0 8px">${esc(avviso)}</div>` : '';
  ge('crp-elenco').innerHTML = proposte.map(function(p, i) {
    const etichetta = p.categoria === 'tipica'
      ? 'fase tipica'
      : (typeof ETICHETTE_CATEGORIA_LAVORAZIONE !== 'undefined' && ETICHETTE_CATEGORIA_LAVORAZIONE[p.categoria]) || p.categoria || '';
    return `
      <label class="sq-scelta${p.spuntata ? ' on' : ''}">
        <input type="checkbox" data-indice="${i}" ${p.spuntata ? 'checked' : ''} ${p.gia ? 'disabled' : ''} onchange="this.parentElement.classList.toggle('on', this.checked)">
        <span style="min-width:0;overflow-wrap:anywhere">${esc(p.nome)}
          <span class="sq-scelta-avvisi">${etichetta ? `<span class="bx bgray">${esc(etichetta)}</span>` : ''}${p.gia ? ' <span class="bx bok">già nel cronoprogramma</span>' : ''}</span>
        </span>
      </label>
    `;
  }).join('') || '<div class="empty">Nessuna fase da proporre.</div>';
  ge('crp-salva').disabled = false;
  openM('m-proposta-fasi');
}

async function confermaPropostaFasi() {
  const m = propostaFasiAperta;
  if (!m) return;
  const nomi = Array.from(document.querySelectorAll('#crp-elenco input[type=checkbox]:checked:not(:disabled)'))
    .map(function(i) { return m.proposte[Number(i.dataset.indice)]?.nome; })
    .filter(Boolean);
  if (!nomi.length) { toast('Spunta almeno una fase', 'err'); return; }

  const bottone = ge('crp-salva');
  bottone.disabled = true;
  const { data, error } = await db.rpc('aggiungi_fasi_commessa', { p_commessa_id: m.commessa.id, p_nomi: nomi });
  bottone.disabled = false;
  if (error) {
    toast('Fasi non aggiunte: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }
  closeM('m-proposta-fasi');
  toast((data || nomi.length) + ' fasi aggiunte: indica date previste e peso con "Aggiorna"', 'ok');
  await ricaricaCronoprogramma(m.commessa);
}

// ── Pagina Commesse: colonna "Avanzamento" (chiamata da js/26) ───────
async function caricaAvanzamentoCommesse() {
  avanzamentoCommesse = null;
  if (!(await verificaCronoprogrammaDisponibile())) return;
  // Lettura a pagine: Supabase restituisce al massimo 1000 righe per volta
  const data = [];
  const PAGINA = 1000;
  for (let da = 0; ; da += PAGINA) {
    const { data: pagina, error } = await db
      .from('commesse_fasi')
      .select('id, commessa_id, peso, percentuale, fine_prevista')
      .order('id')
      .range(da, da + PAGINA - 1);
    if (error) return;
    data.push(...(pagina || []));
    if (!pagina || pagina.length < PAGINA) break;
  }
  const perCommessa = {};
  (data || []).forEach(function(f) {
    (perCommessa[f.commessa_id] = perCommessa[f.commessa_id] || []).push(f);
  });
  avanzamentoCommesse = {};
  Object.keys(perCommessa).forEach(function(id) {
    avanzamentoCommesse[id] = calcolaAvanzamentoFasi(perCommessa[id]);
  });
}

function avanzamentoCommesseAttivo() {
  return avanzamentoCommesse !== null;
}

function htmlCellaAvanzamentoCommessa(commessa) {
  const r = avanzamentoCommesse && avanzamentoCommesse[commessa.id];
  if (!r || r.percentuale === null) return '<span style="font-size:11px;color:var(--m)">nessuna fase</span>';
  return `
    <div class="crono-cella">
      <b>${r.percentuale}%</b>${r.inRitardo ? ` <span class="bx berr">${r.inRitardo} in ritardo</span>` : ''}
      ${htmlBarraAvanzamento(r.percentuale, r.inRitardo > 0, true)}
    </div>
  `;
}

// Sul telefono la colonna "Avanzamento" resta a destra, fuori vista:
// la % compare anche sotto il codice (solo schermi stretti, CSS).
function htmlAvanzamentoSottoCodice(commessa) {
  const r = avanzamentoCommesse && avanzamentoCommesse[commessa.id];
  if (!r || r.percentuale === null) return '';
  return `<div class="crono-solo-mobile"><span class="bx ${r.inRitardo ? 'berr' : (r.percentuale >= 100 ? 'bok' : 'bblue')}">${r.percentuale}%</span></div>`;
}
