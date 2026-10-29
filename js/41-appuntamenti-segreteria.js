// =====================================================================
// F10.3 — APPUNTAMENTO FISSATO DALLA SEGRETERIA (Fase 10, Service).
// Con sql/43:
//   - la manutenzione ordinaria programmata nata dopo sql/43 "chiede
//     l'appuntamento" (ordini_lavoro.appuntamento_richiesto, lo mette il
//     database); gli interventi già esistenti, su chiamata, straordinari,
//     corsi e quelli creati da un tecnico no. Titolare, capo tecnico e
//     segreteria lo mettono o lo tolgono dalla finestra dell'intervento
//     (box mo-appuntamento, RPC imposta_appuntamento_richiesto);
//   - il capo tecnico (Responsabile Service) pianifica come oggi (data
//     indicativa e tecnico); l'intervento compare alla segreteria nella
//     lista "📞 Appuntamenti da fissare" (dashboard seg-appuntamenti; la
//     vedono anche capo tecnico, ct-appuntamenti, come "da confermare", e
//     titolare, tit-appuntamenti);
//   - la segreteria chiama il cliente e registra giorno e ora esatti, con
//     chi ha parlato e quando (finestra m-fissa-appuntamento, RPC
//     fissa_appuntamento_intervento; chi = utente collegato);
//   - il tecnico vede l'intervento SOLO con l'appuntamento fissato (regola
//     nel database, policy restrittiva di sql/43) e vede l'ora esatta
//     (dashboard, calendario, tendina e scheda di "Esegui intervento");
//   - data cambiata dal capo tecnico, richiesta di modifica del tecnico
//     approvata (data, orario, rinvio) o "Rimanda alla segreteria"
//     (RPC rimanda_appuntamento_segreteria): l'intervento torna nella lista
//     della segreteria con il motivo, e sparisce al tecnico finché non è
//     fissato di nuovo.
// Senza sql/43: nessuna lista, nessun box, il tecnico vede tutto come prima.
// Id usati: seg-/ct-/tit-appuntamenti, m-fissa-appuntamento, fap-*,
// mo-appuntamento, moap-*.
// =====================================================================

const RUOLI_FISSA_APPUNTAMENTO = ['titolare', 'segreteria'];
const RUOLI_GESTISCI_APPUNTAMENTO = ['titolare', 'capo_tecnico', 'segreteria'];
const BOX_APPUNTAMENTI = {
  segreteria: 'seg-appuntamenti',
  capo_tecnico: 'ct-appuntamenti',
  titolare: 'tit-appuntamenti'
};
const COLONNE_APPUNTAMENTO = 'appuntamento_richiesto,appuntamento_fissato,appuntamento_giorno,appuntamento_ora,' +
  'appuntamento_contatto,appuntamento_contattato_il,appuntamento_nota,appuntamento_fissato_da_nome,' +
  'appuntamento_fissato_il,appuntamento_motivo,appuntamento_motivo_il';

let appuntamentiDisponibile = null;
let fapIntervento = null; // intervento aperto nella finestra "Fissa appuntamento"

// true se sql/43 è stato eseguito (colonna ordini_lavoro.appuntamento_richiesto).
async function verificaAppuntamentiDisponibile() {
  if (appuntamentiDisponibile !== null) return appuntamentiDisponibile;
  const { error } = await db.from('ordini_lavoro').select('appuntamento_richiesto').limit(1);
  if (!error) {
    appuntamentiDisponibile = true;
  } else if (error.code === '42703' || error.code === 'PGRST204' || /appuntamento_richiesto/i.test(error.message || '')) {
    appuntamentiDisponibile = false;
  } else {
    return false; // errore diverso (es. rete): si riprova la prossima volta
  }
  return appuntamentiDisponibile;
}

function appuntamentiAttivi() {
  return appuntamentiDisponibile === true;
}

// Colonne da aggiungere alle letture degli interventi ('' senza sql/43).
async function colonneAppuntamento() {
  return (await verificaAppuntamentiDisponibile()) ? ',' + COLONNE_APPUNTAMENTO : '';
}

function oraBreve(t) {
  return t ? String(t).slice(0, 5) : '';
}

// 'non_richiesto' | 'fissato' | 'da_fissare' | 'chiuso' | null (senza dati)
function statoAppuntamento(o) {
  if (!o || typeof o.appuntamento_richiesto === 'undefined') return null;
  if (o.stato === 'completato' || o.stato === 'annullato') return 'chiuso';
  if (!o.appuntamento_richiesto) return 'non_richiesto';
  if (o.appuntamento_fissato) return 'fissato';
  return 'da_fissare';
}

// Ora esatta dell'appuntamento fissato ('' se non fissato).
function oraAppuntamento(o) {
  if (!o || !o.appuntamento_fissato || !o.appuntamento_ora) return '';
  return oraBreve(o.appuntamento_ora);
}

function giornoLungo(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}

function quandoBreve(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Etichetta corta per calendari e liste di chi pianifica.
function htmlBadgeAppuntamento(o) {
  const st = statoAppuntamento(o);
  if (st === 'fissato') return '<span class="bx bok" title="Appuntamento fissato con il cliente">📞 ' + esc(oraAppuntamento(o) || 'fissato') + '</span>';
  if (st === 'da_fissare') return '<span class="bx bwarn" title="La segreteria deve fissare l\'appuntamento: il tecnico non lo vede">⏳ Da confermare</span>';
  return '';
}

// ── Tecnico: orario mostrato (dashboard) ────────────────────────────────
const tecOrarioPrimaAppuntamento = tecOrario;
tecOrario = function(o) {
  const ora = oraAppuntamento(o);
  if (ora) return 'ore ' + ora;
  return tecOrarioPrimaAppuntamento.apply(this, arguments);
};

// Card "Appuntamento con il cliente" nella scheda di "Esegui intervento".
function htmlAppuntamentoTecnico(o) {
  const ora = oraAppuntamento(o);
  if (!ora) return '';
  return '<div style="background:var(--gl);border-left:3px solid var(--g);border-radius:10px;padding:12px;font-size:13px;margin-bottom:10px">' +
    '<div style="font-size:11px;font-weight:700;color:var(--g);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">📞 Appuntamento con il cliente</div>' +
    '<div><strong>' + esc(giornoLungo(o.appuntamento_giorno)) + ' alle ' + esc(ora) + '</strong></div>' +
    (o.appuntamento_contatto ? '<div style="color:var(--m)">Fissato con: ' + esc(o.appuntamento_contatto) + '</div>' : '') +
    (o.appuntamento_nota ? '<div style="margin-top:4px;white-space:pre-wrap">' + esc(o.appuntamento_nota) + '</div>' : '') +
    '<div style="font-size:11px;color:var(--m);margin-top:4px">Per cambiare giorno o ora usa "Richiedi modifica" nel calendario: la segreteria richiama il cliente.</div>' +
  '</div>';
}

// ── Lista "Appuntamenti da fissare" (dashboard) ──────────────────────────
async function caricaAppuntamentiDaFissare() {
  const box = ge(BOX_APPUNTAMENTI[ROLE] || '');
  if (!box) return;
  if (!(await verificaAppuntamentiDisponibile())) { box.innerHTML = ''; return; }
  const { data, error } = await db.from('ordini_lavoro')
    .select('id,numero,tipo,stato,data_pianificata,fascia_oraria,sede_id,tecnico_id,' + COLONNE_APPUNTAMENTO +
      ',clienti(ragione_sociale,referente_nome,referente_telefono),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)')
    .is('eliminato_il', null)
    .eq('appuntamento_richiesto', true)
    .eq('appuntamento_fissato', false)
    .in('stato', ['da_pianificare', 'pianificato'])
    .not('data_pianificata', 'is', null)
    .order('data_pianificata', { ascending: true })
    .limit(100);
  if (error) { console.warn('Appuntamenti da fissare:', error.message); box.innerHTML = ''; return; }
  const odls = data || [];
  if (!odls.length) {
    box.innerHTML = ROLE === 'segreteria'
      ? '<div class="tit-section">📞 Appuntamenti da fissare</div><div class="rap-list-card" style="margin-bottom:14px"><div class="tit-empty">✅ Nessun appuntamento da fissare</div></div>'
      : '';
    return;
  }

  const sedeIds = odls.map(function(o) { return o.sede_id; }).filter(Boolean);
  const sediMap = {};
  if (sedeIds.length) {
    const rs = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta,cap').in('id', sedeIds);
    (rs.data || []).forEach(function(s) { sediMap[s.id] = s; });
  }

  const aiuti = {
    segreteria: 'Interventi pianificati dal capo tecnico che aspettano la tua telefonata al cliente. Il tecnico li vede solo dopo che hai fissato giorno e ora.',
    capo_tecnico: 'Interventi da confermare: la segreteria deve ancora fissare l\'appuntamento con il cliente. Il tecnico non li vede finché non sono fissati.',
    titolare: 'Interventi che aspettano l\'appuntamento della segreteria: il tecnico non li vede finché non sono fissati.'
  };
  const oggi = dataLocaleISO();
  const puoFissare = RUOLI_FISSA_APPUNTAMENTO.includes(ROLE);

  const righe = odls.map(function(o) {
    const c = o.clienti || {};
    const referente = (c.referente_nome || '').trim();
    const tel = c.referente_telefono
      ? '<a href="tel:' + esc(c.referente_telefono) + '" style="color:var(--g);text-decoration:none;white-space:nowrap">📞 ' + esc(c.referente_telefono) + '</a>'
      : '<span style="color:var(--r)">telefono mancante</span>';
    const tec = o.utenti ? esc(o.utenti.nome + ' ' + o.utenti.cognome) : '<span style="color:var(--r)">da assegnare</span>';
    const passata = o.data_pianificata < oggi;
    const motivo = o.appuntamento_motivo
      ? '<div style="font-size:12px;margin-top:6px;padding:6px 8px;background:var(--al);border-radius:6px;overflow-wrap:anywhere">↻ ' + esc(o.appuntamento_motivo) +
        (o.appuntamento_motivo_il ? ' <span style="color:var(--m)">(' + esc(quandoBreve(o.appuntamento_motivo_il)) + ')</span>' : '') + '</div>'
      : '';
    return '<div style="padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px">' +
      '<div style="font-weight:600;overflow-wrap:anywhere">' + esc(c.ragione_sociale || 'Cliente') + '</div>' +
      '<div style="font-size:12px;color:var(--m)">' + (o.numero ? 'Intervento n. ' + esc(o.numero) + ' · ' : '') + tecTipoLabel(o.tipo) +
        (o.stato === 'da_pianificare' ? ' · <span style="color:var(--a)">non ancora pianificato</span>' : '') + '</div>' +
      '<div style="font-size:12px;margin-top:2px">Data indicativa: <strong style="color:' + (passata ? 'var(--r)' : 'var(--t)') + '">' + esc(giornoLungo(o.data_pianificata)) + '</strong>' +
        (o.fascia_oraria ? ' (' + esc(o.fascia_oraria) + ')' : '') + (passata ? ' <span class="bx berr">passata</span>' : '') + ' · Tecnico: ' + tec + '</div>' +
      '<div style="font-size:12px;color:var(--m);overflow-wrap:anywhere">📍 ' + esc(tecSedeFmt(o, sediMap)) + '</div>' +
      '<div style="font-size:12px;overflow-wrap:anywhere">' + (referente ? esc(referente) + ' · ' : '') + tel + '</div>' +
      motivo +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
        (puoFissare ? '<button class="btn sm p" data-id="' + esc(o.id) + '" onclick="apriFissaAppuntamento(this.dataset.id)">📞 Fissa appuntamento</button>' : '') +
        '<button class="btn sm" data-id="' + esc(o.id) + '" onclick="openEditOdl(this.dataset.id)">Apri intervento</button>' +
      '</div>' +
    '</div>';
  }).join('');

  const titolo = ROLE === 'capo_tecnico' ? '⏳ Da confermare: appuntamento della segreteria' : '📞 Appuntamenti da fissare';
  box.innerHTML = '<div class="tit-section" style="margin-top:14px">' + titolo + ' (' + odls.length + ')</div>' +
    '<div class="rap-list-card" style="margin-bottom:14px">' +
    '<div style="font-size:12px;color:var(--m);margin-bottom:4px">' + esc(aiuti[ROLE] || '') + '</div>' +
    righe + '</div>';
}

// ── Finestra "Fissa appuntamento" ─────────────────────────────────────────
function oraLocaleInput(d) {
  d = d || new Date();
  return dataLocaleISO(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

async function apriFissaAppuntamento(odlId) {
  if (!RUOLI_FISSA_APPUNTAMENTO.includes(ROLE)) { toast('L\'appuntamento lo fissano la segreteria e il titolare', 'err'); return; }
  if (!(await verificaAppuntamentiDisponibile())) { toast('Gli appuntamenti non sono ancora attivi', 'err'); return; }
  const { data: o, error } = await db.from('ordini_lavoro')
    .select('id,numero,tipo,stato,data_pianificata,fascia_oraria,sede_id,tecnico_id,' + COLONNE_APPUNTAMENTO +
      ',clienti(ragione_sociale,referente_nome,referente_telefono),utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)')
    .eq('id', odlId)
    .maybeSingle();
  if (error || !o) { toast('Intervento non trovato: ricarica la pagina', 'err'); return; }
  if (o.stato !== 'da_pianificare' && o.stato !== 'pianificato') { toast('L\'intervento è già chiuso o annullato', 'err'); return; }
  fapIntervento = o;

  const sediMap = {};
  if (o.sede_id) {
    const rs = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta,cap').eq('id', o.sede_id);
    (rs.data || []).forEach(function(s) { sediMap[s.id] = s; });
  }
  const c = o.clienti || {};
  const referente = (c.referente_nome || '').trim();
  const tel = c.referente_telefono
    ? '<a href="tel:' + esc(c.referente_telefono) + '" class="btn sm p" style="text-decoration:none;margin-top:6px">📞 Chiama ' + esc(c.referente_telefono) + '</a>'
    : '<div style="color:var(--r);margin-top:4px">Telefono del referente mancante nella scheda cliente</div>';
  ge('fap-riepilogo').innerHTML =
    '<div style="font-weight:600;font-size:14px;overflow-wrap:anywhere">' + esc(c.ragione_sociale || 'Cliente') + '</div>' +
    '<div style="font-size:12px;color:var(--m)">' + (o.numero ? 'Intervento n. ' + esc(o.numero) + ' · ' : '') + tecTipoLabel(o.tipo) + '</div>' +
    '<div style="font-size:12px;color:var(--m);overflow-wrap:anywhere">📍 ' + esc(tecSedeFmt(o, sediMap)) + '</div>' +
    '<div style="font-size:12px">Data indicativa: <strong>' + esc(giornoLungo(o.data_pianificata)) + '</strong>' + (o.fascia_oraria ? ' (' + esc(o.fascia_oraria) + ')' : '') +
      ' · Tecnico: ' + (o.utenti ? esc(o.utenti.nome + ' ' + o.utenti.cognome) : '<span style="color:var(--r)">da assegnare</span>') + '</div>' +
    (referente ? '<div style="font-size:12px">Referente: ' + esc(referente) + '</div>' : '') +
    (o.appuntamento_motivo && !o.appuntamento_fissato ? '<div style="font-size:12px;margin-top:6px;padding:6px 8px;background:var(--al);border-radius:6px;overflow-wrap:anywhere">↻ ' + esc(o.appuntamento_motivo) + '</div>' : '') +
    tel;

  const oggi = dataLocaleISO();
  const giorno = ge('fap-giorno');
  giorno.min = oggi;
  giorno.value = (o.appuntamento_fissato && o.appuntamento_giorno) ? o.appuntamento_giorno
    : (o.data_pianificata && o.data_pianificata >= oggi ? o.data_pianificata : '');
  ge('fap-ora').value = o.appuntamento_fissato ? oraBreve(o.appuntamento_ora) : '';
  ge('fap-contatto').value = (o.appuntamento_fissato && o.appuntamento_contatto) ? o.appuntamento_contatto : referente;
  const quando = ge('fap-contattato-il');
  quando.value = oraLocaleInput();
  quando.max = oraLocaleInput(new Date(Date.now() + 5 * 60000));
  ge('fap-nota').value = o.appuntamento_fissato ? (o.appuntamento_nota || '') : '';
  ge('fap-chi').textContent = 'Lo registri tu: ' + ([ME && ME.nome, ME && ME.cognome].filter(Boolean).join(' ') || 'utente collegato');
  ge('fap-titolo').firstChild.nodeValue = (o.appuntamento_fissato ? 'Cambia appuntamento ' : 'Fissa appuntamento ');
  const btn = ge('fap-btn-salva'); btn.disabled = false; btn.textContent = '📞 Salva appuntamento';
  await aggiornaAvvisoAppuntamento();
  openM('m-fissa-appuntamento');
}

// Avviso se il giorno scelto è diverso dalla data indicativa del capo tecnico.
async function aggiornaAvvisoAppuntamento() {
  const box = ge('fap-avviso');
  if (!box) return;
  box.style.display = 'none'; box.innerHTML = '';
  const o = fapIntervento;
  const giorno = v('fap-giorno');
  if (!o || !giorno) return;
  const msg = [];
  if (giorno !== o.data_pianificata) {
    msg.push('Giorno diverso dalla data indicativa (' + giornoLungo(o.data_pianificata) + '): l\'intervento si sposta al ' + giornoLungo(giorno) +
      (o.utenti ? ' e resta a ' + o.utenti.nome + ' ' + o.utenti.cognome + '. Se il tecnico non è disponibile avvisa il capo tecnico.' : '.'));
  }
  if (o.tecnico_id) {
    const r = await db.from('ordini_lavoro').select('id', { count: 'exact', head: true })
      .is('eliminato_il', null).eq('tecnico_id', o.tecnico_id).eq('data_pianificata', giorno)
      .neq('id', o.id).neq('stato', 'annullato');
    if (v('fap-giorno') !== giorno) return; // scelta cambiata nel frattempo
    if (!r.error && r.count) msg.push('Quel giorno il tecnico ha già ' + r.count + (r.count === 1 ? ' altro intervento.' : ' altri interventi.'));
  }
  if (!o.tecnico_id) msg.push('Il tecnico non è ancora assegnato: lo assegna il capo tecnico.');
  if (!msg.length) return;
  box.innerHTML = msg.map(esc).join('<br>');
  box.style.display = 'block';
}

async function salvaAppuntamento() {
  const o = fapIntervento;
  if (!o) return;
  const giorno = v('fap-giorno');
  const ora = v('fap-ora');
  const contatto = v('fap-contatto').trim();
  const quando = v('fap-contattato-il');
  const nota = v('fap-nota').trim();
  if (!giorno) { toast('Indica il giorno dell\'appuntamento', 'err'); return; }
  if (giorno < dataLocaleISO()) { toast('Il giorno dell\'appuntamento è già passato', 'err'); return; }
  if (!ora) { toast('Indica l\'ora dell\'appuntamento', 'err'); return; }
  if (!contatto) { toast('Scrivi con chi hai parlato', 'err'); return; }
  if (!quando) { toast('Indica quando hai parlato con il cliente', 'err'); return; }
  const quandoData = new Date(quando);
  if (isNaN(quandoData.getTime())) { toast('Data della telefonata non valida', 'err'); return; }
  if (quandoData.getTime() > Date.now() + 10 * 60000) { toast('La telefonata non può essere nel futuro', 'err'); return; }
  const btn = ge('fap-btn-salva'); btn.disabled = true; btn.textContent = 'Salvataggio...';
  const { data, error } = await db.rpc('fissa_appuntamento_intervento', {
    p_odl_id: o.id, p_giorno: giorno, p_ora: ora, p_contatto: contatto,
    p_contattato_il: quandoData.toISOString(), p_nota: nota || null
  });
  btn.disabled = false; btn.textContent = '📞 Salva appuntamento';
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  closeM('m-fissa-appuntamento');
  fapIntervento = null;
  let msg = 'Appuntamento fissato: ' + giornoLungo(giorno) + ' alle ' + ora + ' ✓';
  if (data && data.tecnico_assegnato === false) msg += ' Il tecnico lo assegna il capo tecnico.';
  else msg += ' Ora il tecnico lo vede.';
  toast(msg, 'ok');
  await aggiornaDopoAppuntamento(o.id);
}

// Dopo un cambio: ricarica la lista, il box della finestra intervento aperta
// e i calendari di chi pianifica se sono a schermo.
async function aggiornaDopoAppuntamento(odlId) {
  try { await caricaAppuntamentiDaFissare(); } catch (e) { console.warn('caricaAppuntamentiDaFissare:', e); }
  if ((ge('mcli-odl-id') || {}).value === odlId && ge('m-odl') && ge('m-odl').classList.contains('on')) {
    try { await caricaBoxAppuntamentoOdl(odlId); } catch (e) { console.warn('caricaBoxAppuntamentoOdl:', e); }
  }
  if (ROLE === 'capo_tecnico' && ge('ct-cal-grid') && typeof ctLoadCalendarioSettimana === 'function') {
    try { await ctLoadCalendarioSettimana(); await ctLoadListaDaPianificare(); } catch (e) { console.warn('calendario capo tecnico:', e); }
  }
}

// ── Finestra dell'intervento (m-odl): stato dell'appuntamento ─────────────
function nascondiBoxAppuntamentoOdl() {
  const box = ge('mo-appuntamento');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

const EVENTI_APPUNTAMENTO = {
  fissato: '📞 Fissato',
  rimandato: '↩️ Rimandato alla segreteria',
  data_cambiata: '📅 Data cambiata',
  richiesta_approvata: '✏️ Richiesta del tecnico approvata',
  richiesto: '➕ Serve l\'appuntamento',
  non_richiesto: '➖ Non serve l\'appuntamento'
};

async function caricaBoxAppuntamentoOdl(odlId) {
  const box = ge('mo-appuntamento');
  if (!box) return;
  nascondiBoxAppuntamentoOdl();
  if (!odlId || !RUOLI_GESTISCI_APPUNTAMENTO.includes(ROLE) || !(await verificaAppuntamentiDisponibile())) return;
  const [rO, rS] = await Promise.all([
    db.from('ordini_lavoro').select('id,stato,data_pianificata,' + COLONNE_APPUNTAMENTO).eq('id', odlId).maybeSingle(),
    db.from('ordini_lavoro_appuntamenti').select('evento,data_indicativa,giorno,ora,contatto,contattato_il,nota,fatto_da_nome,fatto_il')
      .eq('odl_id', odlId).order('fatto_il', { ascending: false }).limit(20)
  ]);
  const o = rO.data;
  if (rO.error || !o) return;
  if ((ge('mcli-odl-id') || {}).value !== odlId) return;
  const st = statoAppuntamento(o);
  const aperto = st !== 'chiuso';
  const puoFissare = aperto && RUOLI_FISSA_APPUNTAMENTO.includes(ROLE);
  const id = esc(o.id);
  let html = '';
  let azioni = '';
  const campoMotivo = '<div class="f" style="margin:8px 0 0"><label style="font-size:11px">Motivo</label>' +
    '<input type="text" id="moap-motivo" maxlength="1000" placeholder="Es. il cliente ha chiesto un altro giorno"></div>';

  if (st === 'fissato' || (st === 'chiuso' && o.appuntamento_fissato_il)) {
    html = '<div style="background:var(--gl);border-left:3px solid var(--g);border-radius:var(--rs);padding:10px;font-size:12px">' +
      '<strong style="color:var(--g)">📞 Appuntamento ' + (st === 'chiuso' ? 'registrato' : 'fissato') + ': ' +
        esc(giornoLungo(o.appuntamento_giorno)) + ' alle ' + esc(oraBreve(o.appuntamento_ora)) + '</strong>' +
      '<div>Con: ' + esc(o.appuntamento_contatto || '—') + (o.appuntamento_contattato_il ? ' · sentito il ' + esc(quandoBreve(o.appuntamento_contattato_il)) : '') + '</div>' +
      '<div style="color:var(--m)">Fissato da ' + esc(o.appuntamento_fissato_da_nome || '—') + (o.appuntamento_fissato_il ? ' il ' + esc(quandoBreve(o.appuntamento_fissato_il)) : '') + '</div>' +
      (o.appuntamento_nota ? '<div style="margin-top:4px;white-space:pre-wrap">' + esc(o.appuntamento_nota) + '</div>' : '') +
      (st === 'fissato' ? '<div style="color:var(--m);margin-top:4px">Se cambi la data qui sotto, l\'appuntamento non vale più e torna alla segreteria.</div>' : '');
    if (st === 'fissato') {
      azioni = (puoFissare ? '<button type="button" class="btn sm p" data-id="' + id + '" onclick="apriFissaAppuntamento(this.dataset.id)">📞 Cambia appuntamento</button>' : '') +
        '<button type="button" class="btn sm" data-id="' + id + '" onclick="rimandaAppuntamentoOdl(this.dataset.id)">↩️ Rimanda alla segreteria</button>' +
        '<button type="button" class="btn sm" data-id="' + id + '" onclick="impostaAppuntamentoRichiestoOdl(this.dataset.id,false)">Non serve l\'appuntamento</button>';
    }
  } else if (st === 'da_fissare') {
    html = '<div style="background:var(--al);border-left:3px solid var(--a);border-radius:var(--rs);padding:10px;font-size:12px">' +
      '<strong style="color:var(--a)">⏳ Da confermare: la segreteria deve fissare l\'appuntamento con il cliente</strong>' +
      '<div>Il tecnico non vede l\'intervento finché l\'appuntamento non è fissato.' + (o.data_pianificata ? '' : ' Prima serve una data indicativa.') + '</div>' +
      (o.appuntamento_motivo ? '<div style="margin-top:4px;overflow-wrap:anywhere">↻ ' + esc(o.appuntamento_motivo) + '</div>' : '');
    azioni = (puoFissare ? '<button type="button" class="btn sm p" data-id="' + id + '" onclick="apriFissaAppuntamento(this.dataset.id)">📞 Fissa appuntamento</button>' : '') +
      '<button type="button" class="btn sm" data-id="' + id + '" onclick="impostaAppuntamentoRichiestoOdl(this.dataset.id,false)">Non serve l\'appuntamento</button>';
  } else if (st === 'non_richiesto') {
    html = '<div style="background:var(--bg);border-radius:var(--rs);padding:10px;font-size:12px">' +
      '<span style="color:var(--m)">Intervento senza appuntamento della segreteria: il tecnico lo vede appena ha data e tecnico.</span>' +
      (o.appuntamento_motivo ? '<div style="color:var(--m);margin-top:4px;overflow-wrap:anywhere">' + esc(o.appuntamento_motivo) + '</div>' : '');
    azioni = '<button type="button" class="btn sm" data-id="' + id + '" onclick="impostaAppuntamentoRichiestoOdl(this.dataset.id,true)">📞 Serve l\'appuntamento</button>';
  } else {
    return; // chiuso senza appuntamento: niente da mostrare
  }

  if (azioni) {
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + azioni + '</div>';
    if (st === 'fissato' || st === 'da_fissare') html += campoMotivo;
  }
  const storico = rS.error ? [] : (rS.data || []);
  if (storico.length) {
    html += '<details style="margin-top:8px"><summary style="cursor:pointer;color:var(--m)">Storico appuntamento (' + storico.length + ')</summary>' +
      storico.map(function(s) {
        return '<div style="padding:4px 0;border-bottom:0.5px solid rgba(0,0,0,.05);overflow-wrap:anywhere">' +
          '<strong>' + esc(EVENTI_APPUNTAMENTO[s.evento] || s.evento) + '</strong> · ' + esc(quandoBreve(s.fatto_il)) + (s.fatto_da_nome ? ' · ' + esc(s.fatto_da_nome) : '') +
          (s.evento === 'fissato' ? '<div>' + esc(giornoLungo(s.giorno)) + ' alle ' + esc(oraBreve(s.ora)) + (s.contatto ? ' con ' + esc(s.contatto) : '') +
            (s.contattato_il ? ' (sentito il ' + esc(quandoBreve(s.contattato_il)) + ')' : '') + '</div>' : '') +
          (s.nota ? '<div style="color:var(--m)">' + esc(s.nota) + '</div>' : '') +
        '</div>';
      }).join('') + '</details>';
  }
  html += '</div>';
  box.innerHTML = html;
  box.style.display = 'block';
}

async function rimandaAppuntamentoOdl(odlId) {
  const motivo = v('moap-motivo').trim();
  if (!motivo) { toast('Scrivi nel campo Motivo perché va richiamato il cliente', 'err'); if (ge('moap-motivo')) ge('moap-motivo').focus(); return; }
  if (!confirm('Rimandare l\'intervento alla segreteria? Il tecnico non lo vedrà finché non è fissato un nuovo appuntamento.')) return;
  const { error } = await db.rpc('rimanda_appuntamento_segreteria', { p_odl_id: odlId, p_motivo: motivo });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast('Intervento rimandato alla segreteria ✓', 'ok');
  await aggiornaDopoAppuntamento(odlId);
}

async function impostaAppuntamentoRichiestoOdl(odlId, richiesto) {
  const motivo = richiesto ? null : v('moap-motivo').trim();
  if (!richiesto && !motivo) {
    if (!ge('moap-motivo')) {
      // intervento con appuntamento non richiesto: niente campo, si chiede qui
      const m = prompt('Perché non serve l\'appuntamento?');
      if (!m || !m.trim()) { toast('Serve il motivo', 'err'); return; }
      return impostaAppuntamentoConMotivo(odlId, false, m.trim());
    }
    toast('Scrivi nel campo Motivo perché non serve l\'appuntamento', 'err'); ge('moap-motivo').focus(); return;
  }
  if (!richiesto && !confirm('Togliere l\'appuntamento? Il tecnico vedrà subito l\'intervento.')) return;
  if (richiesto && !confirm('Serve l\'appuntamento della segreteria? Il tecnico non vedrà l\'intervento finché non è fissato.')) return;
  return impostaAppuntamentoConMotivo(odlId, richiesto, motivo);
}

async function impostaAppuntamentoConMotivo(odlId, richiesto, motivo) {
  const { error } = await db.rpc('imposta_appuntamento_richiesto', { p_odl_id: odlId, p_richiesto: richiesto, p_motivo: motivo || null });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast(richiesto ? 'Ora l\'intervento aspetta l\'appuntamento della segreteria ✓' : 'Appuntamento tolto: il tecnico vede l\'intervento ✓', 'ok');
  await aggiornaDopoAppuntamento(odlId);
}

const openEditOdlPrimaAppuntamento = openEditOdl;
openEditOdl = async function(id) {
  nascondiBoxAppuntamentoOdl();
  const r = await openEditOdlPrimaAppuntamento.apply(this, arguments);
  try { await caricaBoxAppuntamentoOdl(id); } catch (e) { console.warn('caricaBoxAppuntamentoOdl:', e); }
  return r;
};

const openMPrimaAppuntamento = openM;
openM = function(id) {
  if (id === 'm-odl' && !((ge('mcli-odl-id') || {}).value)) nascondiBoxAppuntamentoOdl();
  return openMPrimaAppuntamento.apply(this, arguments);
};

// Salvando la finestra intervento con una data diversa da quella
// dell'appuntamento fissato: conferma (l'appuntamento torna alla segreteria).
const saveOdlPrimaAppuntamento = saveOdl;
saveOdl = async function() {
  const editId = (ge('mcli-odl-id') || {}).value;
  if (editId && appuntamentiAttivi()) {
    const { data: o } = await db.from('ordini_lavoro').select('id,stato,data_pianificata,' + COLONNE_APPUNTAMENTO).eq('id', editId).maybeSingle();
    if (o && statoAppuntamento(o) === 'fissato' && v('mo3') && v('mo3') !== o.appuntamento_giorno) {
      if (!confirm('L\'appuntamento con il cliente è fissato per ' + giornoLungo(o.appuntamento_giorno) + ' alle ' + oraBreve(o.appuntamento_ora) +
        '. Cambiando la data l\'appuntamento non vale più: la segreteria dovrà richiamare il cliente e il tecnico non vedrà l\'intervento finché non è fissato di nuovo. Continuare?')) return;
    }
  }
  return saveOdlPrimaAppuntamento.apply(this, arguments);
};

// ── Capo tecnico: calendario settimanale e lista "Da pianificare" ──────────
async function datiAppuntamentoPerId(ids) {
  const mappa = {};
  if (!ids.length || !(await verificaAppuntamentiDisponibile())) return mappa;
  const { data, error } = await db.from('ordini_lavoro').select('id,stato,data_pianificata,' + COLONNE_APPUNTAMENTO).in('id', ids);
  if (error) return mappa;
  (data || []).forEach(function(o) { mappa[o.id] = o; });
  return mappa;
}

// Aggiunge l'etichetta dell'appuntamento agli elementi con data-odl (o data-id).
async function decoraAppuntamenti(selettore, attributo, dove) {
  const els = Array.prototype.slice.call(document.querySelectorAll(selettore));
  const ids = [];
  els.forEach(function(el) { const id = el.getAttribute(attributo); if (id && ids.indexOf(id) === -1) ids.push(id); });
  const mappa = await datiAppuntamentoPerId(ids);
  els.forEach(function(el) {
    const o = mappa[el.getAttribute(attributo)];
    const badge = htmlBadgeAppuntamento(o);
    const target = dove ? (el.closest(dove) || el) : el;
    const vecchio = target.querySelector('.ev-appuntamento');
    if (vecchio) vecchio.remove();
    if (!badge) return;
    const div = document.createElement('div');
    div.className = 'ev-appuntamento';
    div.style.marginTop = '3px';
    div.innerHTML = badge;
    target.appendChild(div);
  });
}

const ctLoadCalendarioSettimanaPrimaAppuntamento = ctLoadCalendarioSettimana;
ctLoadCalendarioSettimana = async function() {
  const r = await ctLoadCalendarioSettimanaPrimaAppuntamento.apply(this, arguments);
  try { await decoraAppuntamenti('#ct-cal-grid .ct-cal-ev[data-odl]', 'data-odl'); } catch (e) { console.warn('decoraAppuntamenti:', e); }
  return r;
};

const ctLoadListaDaPianificarePrimaAppuntamento = ctLoadListaDaPianificare;
ctLoadListaDaPianificare = async function() {
  const r = await ctLoadListaDaPianificarePrimaAppuntamento.apply(this, arguments);
  try { await decoraAppuntamenti('#ct-list-content .ct-odl-card[data-odl]', 'data-odl'); } catch (e) { console.warn('decoraAppuntamenti:', e); }
  return r;
};

// Trascinando sul calendario un intervento con appuntamento fissato in un
// altro giorno: conferma prima (l'appuntamento torna alla segreteria).
const ctDropPrimaAppuntamento = ctDrop;
ctDrop = async function(e) {
  e.preventDefault();
  const odlId = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
  const target = e.target;
  const cell = target && target.closest ? target.closest('.ct-cal-cell') : null;
  // dataTransfer non è più leggibile dopo un await: si passa un evento con i dati già letti
  const ev = { preventDefault: function() {}, target: target, dataTransfer: { getData: function() { return odlId; } } };
  if (odlId && cell && appuntamentiAttivi()) {
    const mappa = await datiAppuntamentoPerId([odlId]);
    const o = mappa[odlId];
    const giorno = cell.getAttribute('data-day');
    if (o && statoAppuntamento(o) === 'fissato' && giorno !== o.appuntamento_giorno) {
      if (!confirm('L\'appuntamento con il cliente è fissato per ' + giornoLungo(o.appuntamento_giorno) + ' alle ' + oraBreve(o.appuntamento_ora) +
        '. Spostandolo la segreteria dovrà richiamare il cliente. Continuare?')) {
        cell.classList.remove('drag-over');
        return;
      }
    }
  }
  return ctDropPrimaAppuntamento.call(this, ev);
};

// ── Calendario team e Piano mensile: etichette ────────────────────────────
const renderCalTeamPrimaAppuntamento = renderCalTeam;
renderCalTeam = function() {
  const r = renderCalTeamPrimaAppuntamento.apply(this, arguments);
  // Gli eventi del calendario team non hanno data-odl: si legge l'id dall'onclick.
  (async function() {
    const els = Array.prototype.slice.call(document.querySelectorAll('#cal-team-body .ct-cal-ev'));
    els.forEach(function(el) {
      const m = /openEditOdl\('([0-9a-f-]{36})'\)/.exec(el.getAttribute('onclick') || '');
      if (m) el.setAttribute('data-odl', m[1]);
    });
    await decoraAppuntamenti('#cal-team-body .ct-cal-ev[data-odl]', 'data-odl');
  })().catch(function(e) { console.warn('decoraAppuntamenti:', e); });
  return r;
};

const loadPianificazioneMensilePrimaAppuntamento = loadPianificazioneMensile;
loadPianificazioneMensile = async function() {
  const r = await loadPianificazioneMensilePrimaAppuntamento.apply(this, arguments);
  try { await decoraAppuntamenti('#piano-mensile-content input[type="date"][data-id]', 'data-id', '.card'); } catch (e) { console.warn('decoraAppuntamenti:', e); }
  return r;
};

// ── Finestra del calendario (m-cal-edit): stato dell'appuntamento ─────────
const apriEditOdlCalPrimaAppuntamento = apriEditOdlCal;
apriEditOdlCal = async function(id) {
  const r = await apriEditOdlCalPrimaAppuntamento.apply(this, arguments);
  try {
    const mappa = await datiAppuntamentoPerId([id]);
    const o = mappa[id];
    const st = statoAppuntamento(o);
    const corpo = document.querySelector('#m-cal-edit .modal > div:nth-child(2)');
    if (corpo && (st === 'fissato' || st === 'da_fissare')) {
      const div = document.createElement('div');
      div.style.cssText = 'font-size:12px;border-radius:var(--rs);padding:8px 10px;margin-bottom:12px;background:' + (st === 'fissato' ? 'var(--gl)' : 'var(--al)');
      div.innerHTML = st === 'fissato'
        ? '📞 Appuntamento fissato: <strong>' + esc(giornoLungo(o.appuntamento_giorno)) + ' alle ' + esc(oraBreve(o.appuntamento_ora)) + '</strong>' +
          (o.appuntamento_contatto ? ' con ' + esc(o.appuntamento_contatto) : '') + '. Cambiando la data torna alla segreteria.'
        : '⏳ Da confermare: la segreteria deve fissare l\'appuntamento con il cliente; il tecnico non lo vede.';
      corpo.insertBefore(div, corpo.firstChild);
    }
  } catch (e) { console.warn('apriEditOdlCal appuntamento:', e); }
  return r;
};
