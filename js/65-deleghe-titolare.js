// ── F14.20 — DELEGHE DEL TITOLARE (sql/73) ───────────────────────────
// Impostazioni > "🤝 Deleghe del titolare" (solo titolare e informatico,
// riquadro si-deleghe-card, chiamato da loadImp di js/10):
// - per ogni tipo di sblocco una delega facoltativa: A CHI (una persona con
//   un ruolo ammesso dal tipo), FINO A QUALE IMPORTO (tetto, solo per le
//   decisioni con importo; vuoto = senza tetto) e FINO A QUANDO (data
//   obbligatoria, max un anno). RPC salva_delega_titolare, revoca con
//   revoca_delega_titolare (le decisioni ancora aperte tornano al titolare);
// - DELEGATO GENERALE e ASSENZE del titolare (segna_assenza_titolare,
//   togli_assenza_titolare): con il titolare assente ogni decisione ferma
//   da 1 giorno lavorativo passa al delegato generale entro il suo tetto
//   (ogni ora dal database con pg_cron, subito con "▶️ Controlla ora",
//   controlla_deleghe_ora); oltre il tetto resta al titolare con l'avviso
//   urgente;
// - 🧪 decisione di prova con importo (crea_decisione_prova_delega): va al
//   delegato o al titolare come le vere;
// - registro delle deleghe usate (deleghe_registro, ultime 40 righe).
// Per tutti i ruoli: caricaMieDeleghe() al login (rpc mie_deleghe_titolare)
// e haDelegaTitolare(tipo) per mostrare i bottoni di sblocco (consegna e
// chiusura forzata, riporto indietro della commessa: js/31, js/38, js/36,
// js/18) a chi ha la delega. Il database ricontrolla sempre (delega_sblocco
// nelle RPC). Senza sql/73: riquadro "non ancora attivo", nessun bottone in
// più, nessun errore.

const DELEGHE = { disponibili: null, mie: [], tipi: [], deleghe: [], assenze: [], utenti: [], registro: [] };

const NOMI_AZIONE_DELEGA = {
  decisione_assegnata: 'Decisione andata al delegato',
  decisione_passata: 'Passata al delegato generale (titolare assente)',
  decisione_chiusa: 'Decisione presa',
  decisione_tornata: 'Tornata al titolare (delega revocata)',
  sblocco_usato: 'Sblocco usato',
  oltre_tetto: 'Oltre il tetto: resta al titolare (urgente)'
};

// Per tutti: le mie deleghe valide adesso (null = non attive)
async function caricaMieDeleghe() {
  DELEGHE.mie = [];
  if (ROLE === 'titolare') { DELEGHE.disponibili = null; return []; }
  try {
    const { data, error } = await db.rpc('mie_deleghe_titolare');
    if (error) { DELEGHE.disponibili = false; return []; }
    DELEGHE.disponibili = true;
    DELEGHE.mie = data || [];
  } catch (e) { DELEGHE.disponibili = false; }
  return DELEGHE.mie;
}

function haDelegaTitolare(tipo) {
  return ROLE !== 'titolare' && (DELEGHE.mie || []).some(function(d) { return d.tipo === tipo; });
}

function testoMiaDelega(tipo) {
  const d = (DELEGHE.mie || []).find(function(x) { return x.tipo === tipo; });
  if (!d) return '';
  return d.modo === 'assenza' ? 'come delegato generale (titolare assente)' : 'con la delega del titolare';
}

async function verificaDelegheDisponibili() {
  const { error } = await db.from('deleghe_titolare').select('id', { head: true, count: 'exact' }).limit(1);
  return !error;
}

function euroDelega(n) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function numeroDelega(testo) {
  const s = String(testo || '').trim().replace(/\s|€/g, '');
  if (!s) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? n : NaN;
}

function nomeUtenteDelega(u) { return u ? ((u.nome || '') + ' ' + (u.cognome || '')).trim() : ''; }

// ── Impostazioni (titolare) ─────────────────────────────────────────
async function mostraDelegheImpostazioni() {
  const card = ge('si-deleghe-card');
  if (!card) return;
  if (ROLE !== 'titolare') { card.style.display = 'none'; return; }
  const nota = ge('si-deleghe-stato');
  const attivo = ge('si-deleghe-attivo');
  const ok = await verificaDelegheDisponibili();
  DELEGHE.disponibili = ok;
  if (!ok) {
    nota.style.display = 'block';
    nota.textContent = 'Le deleghe non sono ancora attive: serve l’aggiornamento del database (sql/73). Intanto gli sblocchi e le decisioni restano solo tuoi, come oggi.';
    attivo.style.display = 'none';
    return;
  }
  nota.style.display = 'none';
  attivo.style.display = 'block';
  const [tipi, deleghe, assenze, utenti, registro] = await Promise.all([
    db.rpc('tipi_delega_titolare'),
    db.from('deleghe_titolare').select('*').is('revocata_il', null),
    db.from('assenze_titolare').select('*').is('tolta_il', null).gte('al', dataLocaleISO()).order('dal'),
    db.from('utenti').select('id, nome, cognome, ruolo, attivo').or('attivo.is.null,attivo.eq.true').order('nome'),
    db.from('deleghe_registro').select('*').order('quando', { ascending: false }).limit(40)
  ]);
  const err = [tipi, deleghe, assenze, utenti, registro].find(function(r) { return r.error; });
  if (err) { ge('si-deleghe-righe').innerHTML = '<div class="al2 w">Deleghe non lette: ' + esc(err.error.message) + '</div>'; return; }
  DELEGHE.tipi = (tipi.data || []).sort(function(a, b) { return a.ordine - b.ordine; });
  DELEGHE.deleghe = deleghe.data || [];
  DELEGHE.assenze = assenze.data || [];
  DELEGHE.utenti = utenti.data || [];
  DELEGHE.registro = registro.data || [];
  disegnaAssenzeTitolare();
  disegnaRigheDeleghe();
  disegnaRegistroDeleghe();
  const sel = ge('dlp-tipo');
  if (sel && !sel.options.length) {
    sel.innerHTML = DELEGHE.tipi.filter(function(t) { return t.genere === 'decisione'; })
      .map(function(t) { return '<option value="' + esc(t.tipo) + '">' + esc(t.icona + ' ' + t.nome) + '</option>'; }).join('');
    sel.value = 'ratifica_spesa';
  }
}

function disegnaAssenzeTitolare() {
  const box = ge('si-deleghe-assenze');
  const oggi = dataLocaleISO();
  const gen = DELEGHE.deleghe.find(function(d) { return d.tipo === 'generale' && d.valida_fino >= oggi; });
  const ora = DELEGHE.assenze.find(function(a) { return a.dal <= oggi && a.al >= oggi; });
  let html = ora
    ? '<div class="al2 w" style="margin-bottom:6px"><b>Oggi risulti assente</b> (' + esc(fd(ora.dal)) + ' – ' + esc(fd(ora.al)) + ').' +
      (gen ? ' Le decisioni ferme da 1 giorno lavorativo passano a <b>' + esc(gen.delegato_nome || '') + '</b>' + (gen.tetto_importo ? ' fino a ' + esc(euroDelega(gen.tetto_importo)) : '') + '; oltre restano a te con l’avviso urgente.'
           : ' Non hai un delegato generale: le decisioni restano a te.') + '</div>'
    : '';
  html += DELEGHE.assenze.length
    ? DELEGHE.assenze.map(function(a) {
        return '<div style="display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:5px 0;border-bottom:1px solid var(--bo);font-size:13px">' +
          '<div style="flex:1 1 220px">🏖️ dal <b>' + esc(fd(a.dal)) + '</b> al <b>' + esc(fd(a.al)) + '</b>' + (a.nota ? ' · ' + esc(a.nota) : '') + '</div>' +
          '<button class="btn sm" type="button" style="color:var(--r)" onclick="togliAssenzaTitolare(' + Number(a.id) + ')">Togli</button></div>';
      }).join('')
    : '<div style="font-size:12px;color:var(--m)">Nessuna assenza segnata.</div>';
  box.innerHTML = html;
  if (ge('dla-dal') && !ge('dla-dal').value) ge('dla-dal').value = oggi;
}

function disegnaRigheDeleghe() {
  const box = ge('si-deleghe-righe');
  const oggi = dataLocaleISO();
  const fino = new Date(); fino.setDate(fino.getDate() + 90);
  const finoProposto = dataLocaleISO(fino);
  let html = '';
  let genere = null;
  DELEGHE.tipi.forEach(function(t) {
    if (t.genere !== genere) {
      genere = t.genere;
      html += '<div style="font-size:12px;font-weight:700;margin:14px 0 6px;color:var(--m)">' +
        ({ generale: 'Quando sei assente', decisione: 'Decisioni (arrivano come avviso al delegato)', sblocco: 'Sblocchi della commessa (bottoni nella scheda)' }[genere] || genere) + '</div>';
    }
    const d = DELEGHE.deleghe.find(function(x) { return x.tipo === t.tipo; });
    const scaduta = d && d.valida_fino < oggi;
    const persone = DELEGHE.utenti.filter(function(u) { return (t.ruoli || []).indexOf(u.ruolo) >= 0; });
    const k = esc(t.tipo);
    html += '<div class="dlg-riga" style="padding:8px 0;border-bottom:1px solid var(--bo)">' +
      '<div style="font-size:13px"><b>' + esc(t.icona + ' ' + t.nome) + '</b> <span style="font-size:11px;color:var(--m)">' + esc(t.fonte || '') + '</span></div>' +
      '<div style="font-size:12px;margin:2px 0 6px">' + (d
        ? (scaduta ? '<span style="color:var(--r)">Scaduta il ' + esc(fd(d.valida_fino)) + '</span>: ' : '✅ ') +
          'a <b>' + esc(d.delegato_nome || '') + '</b> (' + esc(etichettaRuolo(d.delegato_ruolo)) + ')' +
          (t.con_importo ? (d.tetto_importo ? ', fino a <b>' + esc(euroDelega(d.tetto_importo)) + '</b>' : ', senza tetto') : '') +
          ', fino al ' + esc(fd(d.valida_fino)) + (d.nota ? ' · ' + esc(d.nota) : '')
        : '<span style="color:var(--m)">Nessuna delega: decidi tu.</span>') + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end">' +
        '<div class="f" style="flex:1 1 180px;margin:0"><label>A chi</label><select id="dlg-chi-' + k + '"><option value="">— scegli —</option>' +
          persone.map(function(u) { return '<option value="' + esc(u.id) + '"' + (d && d.delegato_id === u.id ? ' selected' : '') + '>' + esc(nomeUtenteDelega(u)) + ' · ' + esc(etichettaRuolo(u.ruolo)) + '</option>'; }).join('') +
        '</select></div>' +
        (t.con_importo ? '<div class="f" style="flex:0 1 120px;margin:0"><label>Fino a € (vuoto = senza tetto)</label><input id="dlg-tetto-' + k + '" inputmode="decimal" placeholder="es. 150" value="' + (d && d.tetto_importo ? esc(String(d.tetto_importo).replace('.', ',')) : '') + '"></div>' : '') +
        '<div class="f" style="flex:0 1 150px;margin:0"><label>Fino al *</label><input type="date" id="dlg-fino-' + k + '" min="' + oggi + '" value="' + esc(d && !scaduta ? d.valida_fino : finoProposto) + '"></div>' +
        '<div class="f" style="flex:1 1 150px;margin:0"><label>Nota</label><input id="dlg-nota-' + k + '" maxlength="300" value="' + esc(d && d.nota ? d.nota : '') + '"></div>' +
        '<button class="btn sm p" type="button" onclick="salvaDelegaTitolare(\'' + k + '\')">💾 ' + (d ? 'Cambia' : 'Delega') + '</button>' +
        (d ? '<button class="btn sm" type="button" style="color:var(--r)" onclick="revocaDelegaTitolare(' + Number(d.id) + ')">✖ Revoca</button>' : '') +
      '</div></div>';
  });
  box.innerHTML = html;
}

function disegnaRegistroDeleghe() {
  const box = ge('si-deleghe-registro');
  const conta = ge('si-deleghe-registro-conta');
  if (conta) conta.textContent = DELEGHE.registro.length ? '(' + DELEGHE.registro.length + (DELEGHE.registro.length >= 40 ? '+' : '') + ')' : '';
  const nomi = {};
  DELEGHE.tipi.forEach(function(t) { nomi[t.tipo] = t.icona + ' ' + t.nome; });
  box.innerHTML = DELEGHE.registro.length
    ? DELEGHE.registro.map(function(r) {
        return '<div style="padding:5px 0;border-bottom:1px solid var(--bo);font-size:12px;overflow-wrap:anywhere">' +
          '<b>' + esc(new Date(r.quando).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</b> · ' +
          esc(NOMI_AZIONE_DELEGA[r.azione] || r.azione) + ' · ' + esc(nomi[r.tipo] || r.tipo) +
          (r.delegato_nome ? ' · ' + esc(r.delegato_nome) : '') + (r.importo !== null && r.importo !== undefined ? ' · ' + esc(euroDelega(r.importo)) : '') +
          (r.testo ? '<div style="color:var(--m)">' + esc(r.testo) + '</div>' : '') +
          (r.esito ? '<div>Esito: ' + esc(r.esito) + '</div>' : '') + '</div>';
      }).join('')
    : '<div style="font-size:12px;color:var(--m)">Nessuna delega usata finora.</div>';
}

async function salvaDelegaTitolare(tipo) {
  const t = DELEGHE.tipi.find(function(x) { return x.tipo === tipo; });
  if (!t) return;
  const chi = v('dlg-chi-' + tipo);
  const fino = v('dlg-fino-' + tipo);
  const tetto = t.con_importo ? numeroDelega(v('dlg-tetto-' + tipo)) : null;
  if (!chi) { toast('Scegli a chi dai la delega', 'err'); return; }
  if (!fino) { toast('Scrivi fino a quando vale la delega', 'err'); return; }
  if (tetto !== null && !(tetto > 0)) { toast('Il tetto è un importo in € (es. 150 oppure 1.500,00); vuoto = senza tetto', 'err'); return; }
  const u = DELEGHE.utenti.find(function(x) { return x.id === chi; });
  if (!confirm('Delegare "' + t.nome + '" a ' + nomeUtenteDelega(u) + (t.con_importo ? (tetto ? ' fino a ' + euroDelega(tetto) : ' SENZA TETTO') : '') + ' fino al ' + fd(fino) + '?')) return;
  const { error } = await db.rpc('salva_delega_titolare', {
    p_tipo: tipo, p_delegato_id: chi, p_tetto: tetto, p_valida_fino: fino, p_nota: v('dlg-nota-' + tipo) || null
  });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast('Delega salvata ✓', 'ok');
  await mostraDelegheImpostazioni();
}

async function revocaDelegaTitolare(id) {
  const d = DELEGHE.deleghe.find(function(x) { return Number(x.id) === Number(id); });
  if (!d) return;
  const motivo = prompt('Revocare la delega a ' + (d.delegato_nome || '') + '? Le decisioni che ha ancora aperte tornano a te.\nMotivo (facoltativo):', '');
  if (motivo === null) return;
  const { data, error } = await db.rpc('revoca_delega_titolare', { p_id: Number(id), p_motivo: motivo || null });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast('Delega revocata' + (data ? ' · ' + data + (data === 1 ? ' decisione tornata a te' : ' decisioni tornate a te') : ''), 'ok');
  if (typeof ricaricaDopoAzioneAvviso === 'function') await ricaricaDopoAzioneAvviso();
  await mostraDelegheImpostazioni();
}

async function segnaAssenzaTitolare() {
  const dal = v('dla-dal'), al = v('dla-al');
  if (!dal || !al) { toast('Scrivi dal giorno e al giorno', 'err'); return; }
  if (al < dal) { toast('"Al" non può essere prima di "dal"', 'err'); return; }
  const { error } = await db.rpc('segna_assenza_titolare', { p_dal: dal, p_al: al, p_nota: v('dla-nota') || null });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  ['dla-al', 'dla-nota'].forEach(function(id) { if (ge(id)) ge(id).value = ''; });
  toast('Assenza segnata ✓', 'ok');
  if (typeof ricaricaDopoAzioneAvviso === 'function') await ricaricaDopoAzioneAvviso();
  await mostraDelegheImpostazioni();
}

async function togliAssenzaTitolare(id) {
  if (!confirm('Togliere questa assenza? Le decisioni già passate al delegato restano a lui.')) return;
  const { error } = await db.rpc('togli_assenza_titolare', { p_id: Number(id) });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast('Assenza tolta', 'ok');
  await mostraDelegheImpostazioni();
}

async function controllaDelegheOra() {
  const b = ge('dlg-controlla');
  if (b) b.disabled = true;
  try {
    const { data, error } = await db.rpc('controlla_deleghe_ora');
    if (error) { toast('Errore: ' + error.message, 'err'); return; }
    toast(data ? data + (data === 1 ? ' decisione passata o segnata urgente' : ' decisioni passate o segnate urgenti') : 'Niente da passare al delegato', 'ok');
    if (typeof ricaricaDopoAzioneAvviso === 'function') await ricaricaDopoAzioneAvviso();
    await mostraDelegheImpostazioni();
  } finally { if (b) b.disabled = false; }
}

async function creaDecisioneProvaDelega() {
  const tipo = v('dlp-tipo');
  const importo = numeroDelega(v('dlp-importo'));
  const testo = (v('dlp-testo') || '').trim();
  if (!tipo) { toast('Scegli la decisione', 'err'); return; }
  if (importo !== null && !(importo >= 0)) { toast('Importo non valido', 'err'); return; }
  if (testo.length < 3) { toast('Scrivi il testo', 'err'); return; }
  const b = ge('dlp-crea');
  b.disabled = true;
  try {
    const { data, error } = await db.rpc('crea_decisione_prova_delega', {
      p_tipo: tipo, p_importo: importo, p_testo: testo, p_vecchia: !!(ge('dlp-vecchia') && ge('dlp-vecchia').checked)
    });
    if (error) { toast('Errore: ' + error.message, 'err'); return; }
    const r = data || {};
    toast(r.delegata ? 'Decisione di prova andata a ' + (r.destinatario_nome || 'il delegato') + ' (non a te)'
      : (r.urgente ? 'Decisione di prova rimasta a te, urgente (oltre il tetto)' : 'Decisione di prova arrivata a te'), 'ok');
    if (typeof ricaricaDopoAzioneAvviso === 'function') await ricaricaDopoAzioneAvviso();
    await mostraDelegheImpostazioni();
  } finally { b.disabled = false; }
}
