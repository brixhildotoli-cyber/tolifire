// ── F14.7 — PAGINA "⚖️ DECISIONI DEL TITOLARE" (nessun SQL nuovo) ────
// Una pagina sola (pg-decisioni, solo titolare e informatico) con tutto
// quello che aspetta il titolare, ORDINATO PER URGENZA, da usare anche dal
// telefono:
// 1. DECISIONI = avvisi (sql/65, js/58) che chiedono un sì o un no al
//    titolare: sblocchi del margine, anticipi parziali, ratifiche di spese,
//    voci fuori modello, commesse senza preventivo... Ognuna ha
//    "✅ Approva" e "❌ Rifiuta" con il MOTIVO obbligatorio (finestra
//    m-decisione, id dec-). Riconosciute da tipoDecisioneAvviso():
//    - i tipi registrati con registraTipoDecisione(tipo, {...}) dai moduli
//      che li creeranno (F16.1 sblocco margine, ecc.): approva/rifiuta
//      chiamano la RPC del modulo (la stessa della sua scheda);
//    - i tipi che cominciano con "decisione" (stessa forma, senza modulo:
//      chiusi con segna_avviso_fatto e l'esito "Approvato/Rifiutato: ...");
//    - le DECISIONI DI PROVA: avviso di prova (crea_avviso_prova di sql/65)
//      al ruolo titolare con il testo "Prova: Decisione: ..." ed esito
//      obbligatorio, creato con "🧪 Decisione di prova" di questa pagina.
//    PROMEMORIA DOPO 1 GIORNO LAVORATIVO (scelta dichiarata, nel sito):
//    una decisione aperta da almeno 1 giorno lavorativo (giorniLavorativiTra
//    di js/01, festività di sql/63) o con la scadenza passata ha
//    "⏰ Promemoria", sale in cima e fa diventare rossa la riga
//    "⚖️ Decisioni da prendere" di "Cosa tocca a me" (js/46). Gli avvisi
//    al titolare non risalgono (sql/65): il promemoria è questo. La riga
//    nel report del venerdì arriverà con F24.2.
// 2. AVVISI per il titolare che non sono decisioni (suoi, del ruolo,
//    risaliti a lui: scadenze superate): "Apri", azioni rapide di js/58 e
//    "✓ Fatto" (stessa finestra della campanella).
// 3. LE FONTI DEL TITOLARE di "Cosa tocca a me" (js/46, stessi conteggi e
//    stesse regole: preventivi da controllare, anticipi, audit, contratti
//    senza venditore...) con "Apri" verso il box o la pagina giusta.
// Ogni riga apre la finestra che c'è già: per le decisioni su una commessa
// "🗂️ Consegna del faldone" (apriConsegnaFaldone di js/31, consegna
// forzata con motivo) se è in preparazione e "🏁 Chiudi la commessa"
// (apriChiusuraCommessa di js/38, chiusura forzata con motivo) se è in
// fine lavori. Dal link #/avviso/<id> (email, notifica) la barra in fondo
// allo schermo ha "⚖️ Decidi" con la stessa azione.
// Senza sql/65 la pagina mostra solo le fonti di "Cosa tocca a me".

const DECISIONI = { caricamento: 0, righe: [], commesse: {}, aperta: null };
const TIPI_DECISIONE = {};
const RE_DECISIONE_PROVA = /^Prova: Decisione\b/i;

// Tipi di decisione dei moduli. opzioni: { icona, nome, approva(a, motivo),
// rifiuta(a, motivo), azioni: [{ etichetta, puo(a), fai(a) }] }.
// approva/rifiuta restituiscono { error } come db.rpc; senza, la decisione
// si chiude con segna_avviso_fatto e l'esito.
function registraTipoDecisione(tipo, opzioni) {
  if (!tipo || !/^[a-z][a-z0-9_]{1,40}$/.test(tipo)) return;
  TIPI_DECISIONE[tipo] = Object.assign({ icona: '⚖️', nome: 'Decisione' }, opzioni || {});
}

// Le decisioni che il piano prevede (nome e icona; le RPC le aggiungono i moduli).
[
  ['sblocco_margine', '📉', 'Sblocco del margine'],
  ['anticipo_parziale', '💶', 'Anticipo parziale'],
  ['ratifica_spesa', '🧾', 'Ratifica di una spesa'],
  ['voce_fuori_modello', '🧩', 'Voce fuori modello'],
  ['commessa_senza_preventivo', '📁', 'Commessa senza preventivo'],
  ['urgenza', '🚨', 'Urgenza']
].forEach(function(t) { registraTipoDecisione(t[0], { icona: t[1], nome: t[2] }); });

// Nomi delle decisioni di prova (testo "Prova: Decisione: <nome> – ...").
const PROVE_DECISIONE = [
  { tipo: 'sblocco_margine', esempio: 'preventivo con margine del 26% dopo la provvigione, sotto il 29%: sblocco richiesto da Acquisti' },
  { tipo: 'anticipo_parziale', esempio: 'il cliente ha versato il 50% dell\'anticipo, chiede di partire lo stesso' },
  { tipo: 'ratifica_spesa', esempio: 'corsa al negozio di 260 € senza autorizzazione, da ratificare' },
  { tipo: 'voce_fuori_modello', esempio: 'voce non prevista dal modello di preventivo, da approvare' },
  { tipo: 'commessa_senza_preventivo', esempio: 'urgenza: aprire la commessa prima del preventivo firmato' }
];

function tipoDecisioneAvviso(a) {
  if (!a || a.stato !== 'aperto') return null;
  if (TIPI_DECISIONE[a.tipo]) return Object.assign({ tipo: a.tipo }, TIPI_DECISIONE[a.tipo]);
  if (/^decisione(_|$)/.test(a.tipo || '')) return { tipo: a.tipo, icona: '⚖️', nome: 'Decisione' };
  if (a.tipo === 'prova' && RE_DECISIONE_PROVA.test(a.testo || '')) {
    const nome = (String(a.testo).replace(RE_DECISIONE_PROVA, '').replace(/^[:\s]+/, '').split(/\s[–-]\s/)[0] || '').trim();
    const nota = PROVE_DECISIONE.map(function(p) { return TIPI_DECISIONE[p.tipo]; })
      .find(function(t) { return t && t.nome.toLowerCase() === nome.toLowerCase(); });
    return { tipo: 'prova', prova: true, icona: nota ? nota.icona : '⚖️', nome: (nota ? nota.nome : 'Decisione') + ' (prova)' };
  }
  return null;
}

// Da quando aspetta: giorni lavorativi dalla nascita; promemoria dopo 1.
function attesaDecisione(a) {
  const nata = a.creato_il ? new Date(a.creato_il) : null;
  const gg = nata && typeof giorniLavorativiTra === 'function' ? giorniLavorativiTra(dataLocaleISO(nata), dataLocaleISO(new Date())) : null;
  const scaduta = !!a.scadenza && new Date(a.scadenza).getTime() <= Date.now();
  return { gg: gg, promemoria: scaduta || (gg !== null && gg >= 1), scaduta: scaduta };
}

function testoAttesaDecisione(att) {
  if (att.gg === null || (att.scaduta && att.gg <= 0)) return '';
  if (att.gg <= 0) return 'arrivata oggi';
  return 'aspetta da ' + att.gg + (att.gg === 1 ? ' giorno lavorativo' : ' giorni lavorativi');
}

// Decisioni aperte del titolare (null = avvisi non attivi). Usata anche da js/46.
async function leggiDecisioniAperte(forza) {
  if (ROLE !== 'titolare' || typeof leggiMieiAvvisi !== 'function') return null;
  const elenco = await leggiMieiAvvisi(!!forza);
  if (!elenco) return null;
  return elenco.filter(function(a) { return !!tipoDecisioneAvviso(a); });
}

// ── Pagina ───────────────────────────────────────────────────────────
async function loadDecisioni() {
  const box = ge('dec-elenco');
  if (!box || ROLE !== 'titolare') return;
  preparaFinestreDecisioni();
  const mio = ++DECISIONI.caricamento;
  box.innerHTML = '<div class="avv-vuoto">⏳ Controllo cosa aspetta te…</div>';
  ge('dec-riepilogo').textContent = '';

  const avvisiAttivi = typeof verificaAvvisiDisponibili === 'function' && (await verificaAvvisiDisponibili()) === true;
  const [avvisi, fonti] = await Promise.all([
    avvisiAttivi ? leggiMieiAvvisi(true) : Promise.resolve(null),
    typeof leggiFontiToccaAMePerPagina === 'function'
      ? leggiFontiToccaAMePerPagina(['avvisi-aperti', 'decisioni-titolare']).catch(function(e) { console.warn('Decisioni:', e); return []; })
      : Promise.resolve([])
  ]);
  if (mio !== DECISIONI.caricamento) return;

  const righe = [];
  (avvisi || []).forEach(function(a) {
    if (a.stato !== 'aperto') return;
    const tipo = tipoDecisioneAvviso(a);
    if (tipo) {
      const att = attesaDecisione(a);
      righe.push({ genere: 'decisione', a: a, tipo: tipo, att: att,
        peso: a.urgente ? 0 : (att.promemoria ? 1 : 2), quando: a.creato_il || '' });
    } else {
      const caldo = a.urgente || avvisoScaduto(a) || avvisoRisalitoAMe(a);
      righe.push({ genere: 'avviso', a: a, peso: a.urgente ? 0 : (caldo ? 2.2 : 3), quando: a.scadenza || a.creato_il || '' });
    }
  });
  fonti.forEach(function(x, i) {
    righe.push({ genere: 'fonte', f: x.f, r: x.r, peso: (x.r.livello || x.f.livello) === 'urgente' ? 2.5 : 4, quando: String(1000 + i) });
  });
  righe.sort(function(x, y) { return (x.peso - y.peso) || String(x.quando).localeCompare(String(y.quando)); });
  DECISIONI.righe = righe;

  // stato delle commesse collegate alle decisioni (per le finestre di consegna e chiusura)
  DECISIONI.commesse = {};
  const idCommesse = righe.filter(function(r) { return r.genere === 'decisione' && r.a.rif_tabella === 'commesse' && r.a.rif_id; })
    .map(function(r) { return r.a.rif_id; });
  if (idCommesse.length && canAccessPage('commessa-detail')) {
    const { data } = await db.from('commesse').select('id, codice, stato').in('id', idCommesse.slice(0, 100));
    (data || []).forEach(function(c) { DECISIONI.commesse[String(c.id)] = c; });
    if (mio !== DECISIONI.caricamento) return;
  }

  const nDec = righe.filter(function(r) { return r.genere === 'decisione'; });
  const nProm = nDec.filter(function(r) { return r.att.promemoria; }).length;
  ge('dec-riepilogo').innerHTML = nDec.length
    ? '<b>' + nDec.length + (nDec.length === 1 ? ' decisione' : ' decisioni') + ' da prendere</b>' +
      (nProm ? ' · <span class="avv-scaduto">⏰ ' + nProm + ' in attesa da più di 1 giorno lavorativo</span>' : '')
    : 'Nessuna decisione da prendere';
  ge('dec-prova-btn').style.display = avvisiAttivi ? '' : 'none';
  ge('dec-non-attivi').style.display = avvisiAttivi ? 'none' : '';

  if (!righe.length) { box.innerHTML = '<div class="avv-vuoto">Niente che aspetta te 🎉</div>'; return; }
  box.innerHTML = righe.map(htmlRigaDecisioni).join('');
}

function htmlRigaDecisioni(r, i) {
  if (r.genere === 'fonte') {
    const urg = (r.r.livello || r.f.livello) === 'urgente';
    return '<div class="avv-card dec-fonte' + (urg ? ' urgente' : '') + '">' +
      '<div class="dec-riga-testa"><span class="dec-etichetta">Da controllare</span><span class="tam-num">' + esc(String(r.r.n)) + '</span></div>' +
      '<div class="avv-testo"><span class="avv-ico">' + esc(r.f.icona || '•') + '</span>' + esc(r.f.titolo) + '</div>' +
      (r.r.nota ? '<div class="avv-meta">' + esc(r.r.nota) + '</div>' : '') +
      '<div class="avv-azioni"><button type="button" class="btn sm p" onclick="vaiRigaDecisioni(' + i + ')">Apri ›</button></div>' +
    '</div>';
  }
  const a = r.a;
  const rec = typeof schedaRecordAvviso === 'function' ? schedaRecordAvviso(a) : null;
  const azioni = [];
  let etichetta, meta;
  if (r.genere === 'decisione') {
    etichetta = '<span class="dec-etichetta dec-dec">' + esc(r.tipo.icona + ' ' + r.tipo.nome) + '</span>' +
      (r.att.promemoria ? '<span class="dec-etichetta dec-prom">⏰ Promemoria</span>' : '') +
      (a.urgente ? '<span class="dec-etichetta dec-prom">🚨 Urgente</span>' : '');
    meta = [testoAttesaDecisione(r.att), a.scadenza ? testoScadenzaAvviso(a) : '', a.creato_da_nome ? 'chiesta da ' + esc(a.creato_da_nome) : ''];
    azioni.push('<button type="button" class="btn sm p" onclick="apriDecisione(' + Number(a.id) + ',\'approva\')">✅ Approva</button>');
    azioni.push('<button type="button" class="btn sm dec-no" onclick="apriDecisione(' + Number(a.id) + ',\'rifiuta\')">❌ Rifiuta</button>');
    if (rec) azioni.push('<button type="button" class="btn sm" onclick="apriRecordAvviso(' + Number(a.id) + ')">Apri ' + esc(NOME_RECORD_AVVISO[a.rif_tabella] || 'la scheda') + '</button>');
    azioniFinestraDecisione(a).forEach(function(az, k) {
      azioni.push('<button type="button" class="btn sm" onclick="finestraDecisione(' + Number(a.id) + ',' + k + ')">' + esc(az.etichetta) + '</button>');
    });
  } else {
    const tipo = TIPI_AVVISO[a.tipo] || { icona: '🔔', nome: a.tipo };
    const scad = avvisoScaduto(a);
    etichetta = '<span class="dec-etichetta">' + (avvisoRisalitoAMe(a) ? '⬆️ Risalito a te' : (scad ? '⏰ Scadenza superata' : esc(tipo.icona + ' ' + tipo.nome))) + '</span>' +
      (a.urgente ? '<span class="dec-etichetta dec-prom">🚨 Urgente</span>' : '');
    meta = [testoScadenzaAvviso(a), esc(testoPercheAvviso(a))];
    if (rec) azioni.push('<button type="button" class="btn sm" onclick="apriRecordAvviso(' + Number(a.id) + ')">Apri ' + esc(NOME_RECORD_AVVISO[a.rif_tabella] || 'la scheda') + '</button>');
    (AZIONI_RAPIDE_AVVISO[a.tipo] || []).forEach(function(az, k) {
      if (!az.puo || az.puo(a)) azioni.push('<button type="button" class="btn sm" onclick="azioneRapidaAvviso(' + Number(a.id) + ',' + k + ')">' + esc(az.etichetta) + '</button>');
    });
    azioni.push('<button type="button" class="btn sm p" onclick="chiudiAvviso(' + Number(a.id) + ',\'fatto\')">✓ Fatto</button>');
  }
  return '<div class="avv-card' + (r.genere === 'decisione' ? ' dec-card' : '') + (a.urgente || (r.att && r.att.promemoria) || avvisoScaduto(a) ? ' urgente' : '') + '" id="dec-' + Number(a.id) + '">' +
    '<div class="dec-riga-testa">' + etichetta + '</div>' +
    '<div class="avv-testo">' + esc(String(a.testo || '').replace(/^Prova: Decisione[:\s]*/i, 'Prova: ')) + '</div>' +
    '<div class="avv-meta">' + meta.filter(Boolean).join(' · ') + '</div>' +
    '<div class="avv-azioni dec-azioni">' + azioni.join('') + '</div>' +
  '</div>';
}

// "Apri" di una fonte di "Cosa tocca a me" (js/46)
function vaiRigaDecisioni(i) {
  const r = DECISIONI.righe[i];
  if (!r || r.genere !== 'fonte') return;
  if (typeof vaiFonteToccaAMeDaPagina === 'function') vaiFonteToccaAMeDaPagina(r.f, r.r);
}

// ── Finestre già esistenti per le decisioni su una commessa ─────────
function azioniFinestraDecisione(a) {
  const tipo = tipoDecisioneAvviso(a) || {};
  const proprie = (tipo.azioni || []).filter(function(az) { return !az.puo || az.puo(a); });
  const c = a.rif_tabella === 'commesse' ? DECISIONI.commesse[String(a.rif_id)] : null;
  const comuni = [];
  if (c && c.stato === 'in_preparazione' && typeof apriConsegnaFaldone === 'function') {
    comuni.push({ etichetta: '🗂️ Consegna del faldone', fai: function() { return apriFinestraCommessaDecisione(c.id, 'faldone'); } });
  }
  if (c && c.stato === 'fine_lavori' && typeof apriChiusuraCommessa === 'function') {
    comuni.push({ etichetta: '🏁 Chiudi la commessa', fai: function() { return apriFinestraCommessaDecisione(c.id, 'chiusura'); } });
  }
  return proprie.concat(comuni);
}

async function finestraDecisione(id, k) {
  const a = decisioneInMemoria(id);
  const az = a && azioniFinestraDecisione(a)[k];
  if (!az) return;
  try { await az.fai(a); } catch (e) { toast('Errore: ' + (e.message || e), 'err'); }
}

// Apre la scheda della commessa, aspetta il suo box e apre la finestra di
// sempre (consegna del faldone di js/31, chiusura di js/38: anche forzate).
async function apriFinestraCommessaDecisione(commessaId, quale) {
  const id = String(commessaId);
  const pronta = quale === 'faldone'
    ? function() { return typeof faldoneAperto !== 'undefined' && faldoneAperto && String(faldoneAperto.commessa.id) === id; }
    : function() { return typeof commessaFatturaFinale !== 'undefined' && commessaFatturaFinale && String(commessaFatturaFinale.id) === id && !!statoChiusuraDi(commessaFatturaFinale); };
  await openCommessaDetail(id);
  for (let t = 0; t < 60 && !pronta(); t++) await new Promise(function(ok) { setTimeout(ok, 250); });
  if (!pronta()) { toast('La scheda della commessa non è pronta: usa il bottone nel suo box', 'err'); return; }
  if (quale === 'faldone') { if (ge('cmd-faldone')) ge('cmd-faldone').scrollIntoView({ block: 'start' }); apriConsegnaFaldone(); }
  else { if (ge('cmd-chiusura')) ge('cmd-chiusura').scrollIntoView({ block: 'start' }); apriChiusuraCommessa(); }
}

// ── Approva / Rifiuta con il motivo ─────────────────────────────────
function preparaFinestreDecisioni() {
  if (ge('m-decisione')) return;
  document.body.insertAdjacentHTML('beforeend',
    '<div class="mbg" id="m-decisione"><div class="modal" style="max-width:520px">' +
      '<button class="x" onclick="closeM(\'m-decisione\')">×</button>' +
      '<h3 id="dec-m-titolo">⚖️ Decisione</h3>' +
      '<input type="hidden" id="dec-m-id">' +
      '<div id="dec-m-testo" class="al2 i" style="margin-bottom:10px;overflow-wrap:anywhere"></div>' +
      '<div class="f"><label id="dec-m-etichetta">Motivo *</label><textarea id="dec-m-motivo" rows="3" maxlength="400" placeholder="es. Cliente storico, margine recuperato sulla manutenzione"></textarea></div>' +
      '<div class="ma dec-m-bottoni"><button class="btn" onclick="closeM(\'m-decisione\')">Annulla</button>' +
        '<button class="btn dec-no" id="dec-m-rifiuta" onclick="confermaDecisione(\'rifiuta\')">❌ Rifiuta</button>' +
        '<button class="btn p" id="dec-m-approva" onclick="confermaDecisione(\'approva\')">✅ Approva</button></div>' +
    '</div></div>' +
    '<div class="mbg" id="m-decisione-prova"><div class="modal" style="max-width:540px">' +
      '<button class="x" onclick="closeM(\'m-decisione-prova\')">×</button>' +
      '<h3>🧪 Decisione di prova</h3>' +
      '<div class="al2 i" style="margin-bottom:10px">Crea una decisione finta che arriva a te come quelle vere (avviso di prova "Prova: Decisione: ..."). Serve a provare la pagina dal telefono: <b>Approva</b> o <b>Rifiuta</b> con il motivo e sparisce dalla lista.</div>' +
      '<div class="f"><label>Che decisione *</label><select id="decp-tipo" onchange="esempioDecisioneProva()"></select></div>' +
      '<div class="f"><label>Record da aprire</label><div style="display:flex;gap:6px">' +
        '<select id="decp-rif-tipo" style="flex:0 0 46%"><option value="">Nessuno</option><option value="preventivi">Preventivo n.</option><option value="commesse">Commessa (codice)</option></select>' +
        '<input id="decp-rif" placeholder="es. 86 o 2026-001"></div></div>' +
      '<div class="f"><label>Testo *</label><input id="decp-testo" maxlength="240"></div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:400;margin:4px 0 8px"><input type="checkbox" id="decp-vecchia"> Come se aspettasse da 1 giorno lavorativo (prova del promemoria)</label>' +
      '<div class="ma"><button class="btn" onclick="closeM(\'m-decisione-prova\')">Chiudi</button>' +
      '<button class="btn p" id="decp-crea" onclick="creaDecisioneProva()">Crea la decisione di prova</button></div>' +
    '</div></div>');
  ['m-decisione', 'm-decisione-prova'].forEach(function(id) {
    const m = ge(id);
    m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('on'); });
  });
}

function decisioneInMemoria(id) {
  const tutte = [].concat(DECISIONI.righe.filter(function(r) { return r.a; }).map(function(r) { return r.a; }),
    (typeof AVVISI !== 'undefined' && AVVISI.miei) || [], (typeof AVVISI !== 'undefined' && AVVISI.ultimoElenco) || []);
  return tutte.find(function(a) { return String(a.id) === String(id); }) || null;
}

// F14.20: decide il titolare oppure il delegato a cui la decisione è
// arrivata (delega del titolare, sql/73: avviso con destinatario la persona).
function puoDecidereAvviso(a) {
  return ROLE === 'titolare' || !!(a && a.destinatario_id && typeof ME !== 'undefined' && ME && String(a.destinatario_id) === String(ME.id));
}

async function apriDecisione(id, modo) {
  preparaFinestreDecisioni();
  let a = decisioneInMemoria(id);
  if (!a && typeof leggiAvviso === 'function') a = await leggiAvviso(id);
  if (a && !puoDecidereAvviso(a)) { toast('Le decisioni le prende il titolare (o chi ha la sua delega)', 'err'); return; }
  if (!a && ROLE !== 'titolare') { toast('Le decisioni le prende il titolare (o chi ha la sua delega)', 'err'); return; }
  const tipo = tipoDecisioneAvviso(a);
  if (!a || !tipo) { toast('Decisione non trovata o già presa', 'err'); return; }
  DECISIONI.aperta = a;
  ge('dec-m-id').value = String(a.id);
  ge('dec-m-titolo').textContent = tipo.icona + ' ' + tipo.nome;
  ge('dec-m-testo').textContent = a.testo;
  ge('dec-m-motivo').value = '';
  ge('dec-m-etichetta').textContent = modo === 'rifiuta' ? 'Motivo del rifiuto *' : (modo === 'approva' ? 'Motivo dell\'approvazione *' : 'Motivo *');
  ge('dec-m-approva').style.display = modo === 'rifiuta' ? 'none' : '';
  ge('dec-m-rifiuta').style.display = modo === 'approva' ? 'none' : '';
  openM('m-decisione');
  setTimeout(function() { ge('dec-m-motivo').focus(); }, 50);
}

async function confermaDecisione(modo) {
  const a = DECISIONI.aperta;
  const motivo = (ge('dec-m-motivo').value || '').trim();
  if (!a) return;
  if (motivo.length < 3) { toast('Scrivi il motivo (almeno 3 caratteri)', 'err'); ge('dec-m-motivo').focus(); return; }
  const tipo = tipoDecisioneAvviso(a) || {};
  const bottoni = [ge('dec-m-approva'), ge('dec-m-rifiuta')];
  bottoni.forEach(function(b) { b.disabled = true; });
  try {
    const fn = modo === 'approva' ? tipo.approva : tipo.rifiuta;
    const r = typeof fn === 'function'
      ? await fn(a, motivo)
      : await db.rpc('segna_avviso_fatto', { p_id: Number(a.id), p_esito: (modo === 'approva' ? '✅ Approvato: ' : '❌ Rifiutato: ') + motivo });
    if (r && r.error) { toast('Errore: ' + r.error.message, 'err'); return; }
    closeM('m-decisione');
    DECISIONI.aperta = null;
    toast(modo === 'approva' ? 'Approvata ✓' : 'Rifiutata', 'ok');
    if (typeof AVVISI !== 'undefined' && AVVISI.barra && String(AVVISI.barra.id) === String(a.id) && typeof nascondiBarraAvviso === 'function') nascondiBarraAvviso();
    if (typeof ricaricaDopoAzioneAvviso === 'function') await ricaricaDopoAzioneAvviso();
    const pg = ge('pg-decisioni');
    if (pg && pg.classList.contains('on')) await loadDecisioni();
  } finally {
    bottoni.forEach(function(b) { b.disabled = false; });
  }
}

// ── Decisione di prova (sql/65: crea_avviso_prova al ruolo titolare) ──
function apriDecisioneProva() {
  if (ROLE !== 'titolare') return;
  preparaFinestreDecisioni();
  ge('decp-tipo').innerHTML = PROVE_DECISIONE.map(function(p) {
    const t = TIPI_DECISIONE[p.tipo];
    return '<option value="' + esc(p.tipo) + '">' + esc(t.icona + ' ' + t.nome) + '</option>';
  }).join('');
  ge('decp-tipo').value = 'sblocco_margine';
  ge('decp-rif-tipo').value = 'preventivi';
  ge('decp-rif').value = '';
  ge('decp-vecchia').checked = false;
  esempioDecisioneProva();
  openM('m-decisione-prova');
}

function esempioDecisioneProva() {
  const p = PROVE_DECISIONE.find(function(x) { return x.tipo === ge('decp-tipo').value; }) || PROVE_DECISIONE[0];
  ge('decp-testo').value = p.esempio;
}

async function creaDecisioneProva() {
  const p = PROVE_DECISIONE.find(function(x) { return x.tipo === ge('decp-tipo').value; });
  const testo = (ge('decp-testo').value || '').trim();
  const rifTipo = ge('decp-rif-tipo').value;
  const rif = (ge('decp-rif').value || '').trim();
  if (!p) { toast('Scegli la decisione', 'err'); return; }
  if (testo.length < 3) { toast('Scrivi il testo', 'err'); return; }
  let rifId = null;
  if (rifTipo && rif) {
    const q = rifTipo === 'preventivi'
      ? db.from('preventivi').select('id').eq('numero', parseInt(rif, 10) || -1).limit(1)
      : db.from('commesse').select('id').eq('codice', rif).limit(1);
    const { data, error } = await q;
    if (error || !data || !data.length) { toast((rifTipo === 'preventivi' ? 'Preventivo n. ' : 'Commessa ') + rif + ' non trovato', 'err'); return; }
    rifId = String(data[0].id);
  }
  let scadenza = null;
  if (ge('decp-vecchia').checked) {
    const ieri = typeof aggiungiGgLav === 'function' ? aggiungiGgLav(dataLocaleISO(new Date()), -1) : null;
    const d = ieri ? new Date(ieri + 'T' + new Date().toTimeString().slice(0, 8)) : new Date(Date.now() - 864e5);
    scadenza = new Date(d.getTime() - 5 * 60000).toISOString();
  }
  const btn = ge('decp-crea');
  btn.disabled = true;
  try {
    const { error } = await db.rpc('crea_avviso_prova', {
      p_testo: 'Decisione: ' + TIPI_DECISIONE[p.tipo].nome + ' – ' + testo,
      p_destinatario_id: null,
      p_destinatario_ruolo: 'titolare',
      p_rif_tabella: rifId ? rifTipo : null,
      p_rif_id: rifId,
      p_scadenza: scadenza,
      p_responsabile_ruolo: 'nessuno',
      p_esito_obbligatorio: true
    });
    if (error) { toast('Errore: ' + error.message, 'err'); return; }
    closeM('m-decisione-prova');
    toast('Decisione di prova creata', 'ok');
    if (typeof ricaricaDopoAzioneAvviso === 'function') await ricaricaDopoAzioneAvviso();
    await loadDecisioni();
  } finally {
    btn.disabled = false;
  }
}

// ── Stessa azione dalla campanella e dal link #/avviso/<id> (js/58) ──
registraAzioneRapidaAvviso('prova', {
  etichetta: '⚖️ Decidi',
  puo: function(a) { return puoDecidereAvviso(a) && !!tipoDecisioneAvviso(a); },
  fai: function(a) { closeM('m-avvisi'); return apriDecisione(a.id); }
});
Object.keys(TIPI_DECISIONE).forEach(function(tipo) {
  registraAzioneRapidaAvviso(tipo, {
    etichetta: '⚖️ Decidi',
    puo: function(a) { return puoDecidereAvviso(a); },
    fai: function(a) { closeM('m-avvisi'); return apriDecisione(a.id); }
  });
});

(function() {
  if (typeof mostraBarraAvviso !== 'function') return;
  const mostraBarraAvvisoPrimaDecisioni = mostraBarraAvviso;
  mostraBarraAvviso = function(a) {
    const r = mostraBarraAvvisoPrimaDecisioni.apply(this, arguments);
    const barra = ge('avviso-barra');
    const azioni = barra && barra.querySelector('.avb-azioni');
    if (azioni && a && puoDecidereAvviso(a) && tipoDecisioneAvviso(a)) {
      const fatto = azioni.querySelector('.btn.p');
      if (fatto) fatto.remove();   // una decisione si approva o si rifiuta, con il motivo
      azioni.insertAdjacentHTML('afterbegin',
        '<button type="button" class="btn sm p" onclick="apriDecisione(' + Number(a.id) + ',\'approva\')">✅ Approva</button>' +
        '<button type="button" class="btn sm" onclick="apriDecisione(' + Number(a.id) + ',\'rifiuta\')">❌ Rifiuta</button>');
    }
    return r;
  };
})();
