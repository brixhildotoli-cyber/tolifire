// =====================================================================
// js/50-promemoria-appuntamenti.js — promemoria al cliente prima
// dell'appuntamento (decisione di Toli del 02/11, risposta 20: "email e
// chiamata di Assunta", cioè della segreteria). NESSUN SQL: legge gli
// appuntamenti fissati di sql/43.
//
// Box "🔔 Promemoria ai clienti" nella dashboard della segreteria
// (seg-promemoria) e del titolare (tit-promemoria): gli interventi con
// l'appuntamento fissato per il PROSSIMO GIORNO LAVORATIVO (domani; il
// venerdì anche sabato, domenica e lunedì; il sabato domenica e lunedì).
// Per ogni cliente:
//   - "📞 Chiama" (tel:) con il referente del cliente;
//   - "✉️ Mail promemoria": apre il programma di posta con la mail già
//     scritta (destinatario = mail del referente, altrimenti la mail del
//     portale); la segreteria controlla e preme Invia. Il gestionale non
//     manda mail da solo (servirebbe un servizio di posta collegato);
//   - "✓ Avvisato": segna che il cliente è stato avvisato.
// SCELTA DICHIARATA (nessun SQL): il segno "Avvisato" resta nel browser di
// chi lo mette (localStorage, per giorno e ora dell'appuntamento). Se
// l'appuntamento cambia giorno o ora il segno non vale più. Su un altro
// computer non si vede: se serve condividerlo si aggiunge una colonna.
// "Cosa tocca a me" (js/46) della segreteria: "Clienti da avvisare".
// Va caricato dopo js/41 e js/46.
// =====================================================================

const BOX_PROMEMORIA_APPUNTAMENTI = { segreteria: 'seg-promemoria', titolare: 'tit-promemoria' };

// Giorni da avvisare: dal giorno dopo fino al primo giorno da lunedì a
// venerdì compreso (domani; venerdì → sabato, domenica, lunedì).
function giorniPromemoriaAppuntamenti(oggiIso) {
  const giorni = [];
  const d = new Date((oggiIso || dataLocaleISO()) + 'T00:00:00');
  for (let i = 0; i < 4; i++) {
    d.setDate(d.getDate() + 1);
    giorni.push(dataLocaleISO(d));
    const g = d.getDay();
    if (g >= 1 && g <= 5) break;
  }
  return giorni;
}

function chiavePromemoriaAppuntamento(o) {
  return 'promemoria_app_' + o.id + '_' + o.appuntamento_giorno + '_' + (o.appuntamento_ora || '');
}

function leggiAvvisoPromemoria(o) {
  try { return localStorage.getItem(chiavePromemoriaAppuntamento(o)); } catch (e) { return null; }
}

function scriviAvvisoPromemoria(o, valore) {
  try {
    if (valore) localStorage.setItem(chiavePromemoriaAppuntamento(o), valore);
    else localStorage.removeItem(chiavePromemoriaAppuntamento(o));
  } catch (e) {}
}

async function leggiAppuntamentiDaRicordare() {
  if (typeof verificaAppuntamentiDisponibile !== 'function' || !(await verificaAppuntamentiDisponibile())) return null;
  const giorni = giorniPromemoriaAppuntamenti();
  const { data, error } = await db.from('ordini_lavoro')
    .select('id,numero,tipo,stato,data_pianificata,sede_id,tecnico_id,appuntamento_giorno,appuntamento_ora,appuntamento_contatto,' +
      'clienti(ragione_sociale,referente_nome,referente_telefono,referente_email,email_portale),' +
      'utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)')
    .is('eliminato_il', null)
    .eq('appuntamento_fissato', true)
    .in('stato', ['da_pianificare', 'pianificato'])
    .in('appuntamento_giorno', giorni)
    .order('appuntamento_giorno', { ascending: true })
    .order('appuntamento_ora', { ascending: true })
    .limit(200);
  if (error) { console.warn('Promemoria appuntamenti:', error.message); return null; }
  return { giorni: giorni, odls: data || [] };
}

let promemoriaAppuntamentiCorrenti = [];

function testoMailPromemoria(o, sede) {
  const c = o.clienti || {};
  const azienda = (typeof IMPOSTAZIONI !== 'undefined' && IMPOSTAZIONI && IMPOSTAZIONI.ragione_sociale) || 'TOLI Fire';
  const telAzienda = (typeof IMPOSTAZIONI !== 'undefined' && IMPOSTAZIONI && IMPOSTAZIONI.telefono) || '';
  const quando = giornoLungo(o.appuntamento_giorno) + (o.appuntamento_ora ? ' alle ore ' + String(o.appuntamento_ora).slice(0, 5) : '');
  const saluto = (c.referente_nome || '').trim() ? 'Gentile ' + c.referente_nome.trim() + ',' : 'Gentile cliente,';
  const oggetto = 'Promemoria intervento ' + azienda + ' – ' + quando;
  const corpo = saluto + '\n\n' +
    'le ricordiamo l\'appuntamento con i nostri tecnici:\n\n' +
    '📅 ' + quando + '\n' +
    (sede ? '📍 ' + sede + '\n' : '') +
    '🔧 ' + tecTipoLabel(o.tipo) + '\n\n' +
    'Se non fosse più possibile, la preghiamo di avvisarci il prima possibile' +
    (telAzienda ? ' al numero ' + telAzienda : ' rispondendo a questa mail') + '.\n\n' +
    'Cordiali saluti,\n' + azienda;
  return { oggetto: oggetto, corpo: corpo };
}

async function caricaPromemoriaAppuntamenti() {
  const box = ge(BOX_PROMEMORIA_APPUNTAMENTI[ROLE] || '');
  if (!box) return;
  const r = await leggiAppuntamentiDaRicordare();
  if (!r) { box.innerHTML = ''; return; }
  const odls = r.odls;
  promemoriaAppuntamentiCorrenti = odls;
  const etichettaGiorni = r.giorni.map(function(g) { return giornoLungo(g); }).join(', ');

  if (!odls.length) {
    box.innerHTML = ROLE === 'segreteria'
      ? '<div class="tit-section" style="margin-top:14px">🔔 Promemoria ai clienti</div>' +
        '<div class="rap-list-card" style="margin-bottom:14px"><div class="tit-empty">✅ Nessun appuntamento da ricordare per ' + esc(etichettaGiorni) + '</div></div>'
      : '';
    return;
  }

  const sediMap = {};
  const sedeIds = odls.map(function(o) { return o.sede_id; }).filter(Boolean);
  if (sedeIds.length) {
    const rs = await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta,cap').in('id', sedeIds);
    (rs.data || []).forEach(function(s) { sediMap[s.id] = s; });
  }

  let daAvvisare = 0;
  const righe = odls.map(function(o, i) {
    const c = o.clienti || {};
    const avvisato = leggiAvvisoPromemoria(o);
    if (!avvisato) daAvvisare++;
    const ora = o.appuntamento_ora ? String(o.appuntamento_ora).slice(0, 5) : '';
    const sede = tecSedeFmt(o, sediMap);
    o._sedeTesto = o.sede_id ? sede : '';
    const mail = (c.referente_email || c.email_portale || '').trim();
    const tec = o.utenti ? esc(o.utenti.nome + ' ' + o.utenti.cognome) : '<span style="color:var(--r)">da assegnare</span>';
    return '<div style="padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,.05);font-size:13px;' + (avvisato ? 'opacity:.6' : '') + '">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
        '<div style="font-weight:600;overflow-wrap:anywhere">' + esc(c.ragione_sociale || 'Cliente') + '</div>' +
        (avvisato ? '<span class="bx bok">✓ Avvisato ' + esc(avvisato) + '</span>' : '<span class="bx bwarn">Da avvisare</span>') +
      '</div>' +
      '<div style="font-size:12px;margin-top:2px"><strong>' + esc(giornoLungo(o.appuntamento_giorno)) + (ora ? ' ore ' + esc(ora) : '') + '</strong>' +
        ' · ' + tecTipoLabel(o.tipo) + ' · Tecnico: ' + tec + '</div>' +
      '<div style="font-size:12px;color:var(--m);overflow-wrap:anywhere">📍 ' + esc(sede) + '</div>' +
      '<div style="font-size:12px;overflow-wrap:anywhere">' + esc((c.referente_nome || '').trim() || 'Referente non indicato') +
        (c.referente_telefono ? ' · ' + esc(c.referente_telefono) : ' · <span style="color:var(--r)">telefono mancante</span>') +
        (mail ? ' · ' + esc(mail) : ' · <span style="color:var(--r)">mail mancante</span>') + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
        (c.referente_telefono ? '<a class="btn sm" href="tel:' + esc(c.referente_telefono) + '">📞 Chiama</a>' : '') +
        (mail ? '<button class="btn sm" onclick="apriMailPromemoria(' + i + ')">✉️ Mail promemoria</button>' : '') +
        (avvisato
          ? '<button class="btn sm" onclick="segnaAvvisatoPromemoria(' + i + ', false)">↩️ Togli "avvisato"</button>'
          : '<button class="btn sm p" onclick="segnaAvvisatoPromemoria(' + i + ', true)">✓ Avvisato</button>') +
        '<button class="btn sm" data-id="' + esc(o.id) + '" onclick="openEditOdl(this.dataset.id)">Apri intervento</button>' +
      '</div>' +
    '</div>';
  }).join('');

  box.innerHTML = '<div class="tit-section" style="margin-top:14px">🔔 Promemoria ai clienti' +
      (daAvvisare ? ' (' + daAvvisare + ' da avvisare)' : '') + '</div>' +
    '<div class="rap-list-card" style="margin-bottom:14px">' +
      '<div style="font-size:12px;color:var(--m);margin-bottom:6px">Appuntamenti di ' + esc(etichettaGiorni) +
        ': chiama il cliente o mandagli la mail di promemoria, poi premi <b>✓ Avvisato</b>.</div>' +
      righe +
    '</div>';
}

function apriMailPromemoria(indice) {
  const o = promemoriaAppuntamentiCorrenti[indice];
  if (!o) return;
  const c = o.clienti || {};
  const mail = (c.referente_email || c.email_portale || '').trim();
  if (!mail) { toast('Il cliente non ha una mail', 'err'); return; }
  const testo = testoMailPromemoria(o, o._sedeTesto || '');
  window.location.href = 'mailto:' + encodeURIComponent(mail) +
    '?subject=' + encodeURIComponent(testo.oggetto) + '&body=' + encodeURIComponent(testo.corpo);
}

function segnaAvvisatoPromemoria(indice, avvisato) {
  const o = promemoriaAppuntamentiCorrenti[indice];
  if (!o) return;
  const adesso = new Date();
  scriviAvvisoPromemoria(o, avvisato
    ? adesso.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' +
      adesso.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : null);
  caricaPromemoriaAppuntamenti();
  if (typeof aggiornaToccaAMePiuTardi === 'function') aggiornaToccaAMePiuTardi();
}

// Si carica insieme alla lista "Appuntamenti da fissare" (dashboard di
// segreteria e titolare; per il capo tecnico il box non c'è).
(function() {
  if (typeof caricaAppuntamentiDaFissare !== 'function') return;
  const caricaAppuntamentiDaFissarePrima = caricaAppuntamentiDaFissare;
  caricaAppuntamentiDaFissare = async function() {
    const risultato = await caricaAppuntamentiDaFissarePrima.apply(this, arguments);
    try { await caricaPromemoriaAppuntamenti(); } catch (e) { console.warn('caricaPromemoriaAppuntamenti:', e); }
    return risultato;
  };
})();

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'promemoria-appuntamenti', ruoli: ['segreteria'], icona: '🔔',
    titolo: 'Clienti da avvisare per l\'appuntamento',
    vai: { box: function() { return BOX_PROMEMORIA_APPUNTAMENTI[ROLE] || ''; } },
    conta: async function() {
      const r = await leggiAppuntamentiDaRicordare();
      if (!r) return null;
      return { n: r.odls.filter(function(o) { return !leggiAvvisoPromemoria(o); }).length };
    }
  });
}
