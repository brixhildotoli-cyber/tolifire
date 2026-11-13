// ── F16.35 — GARE (sql/113, decisione di Erika del 13/11) ──────────────
// Pagina "🏛️ Gare" (pg-gare) per titolare (informatico), Acquisti
// (commerciale) e segreteria. Una gara: ente, oggetto, CIG, scadenza di
// presentazione, sopralluogo obbligatorio, preventivo collegato
// (facoltativo, per numero), note, checklist dei documenti (da fare / fatto /
// non serve), decisione del titolare (Partecipiamo / Non partecipiamo, con
// nota) e stato (aperta, presentata, non presentata, aggiudicata, persa).
// Il database (trigger di sql/113) vuole la decisione "partecipa" e la
// checklist completa per "presentata"; la decisione solo dal titolare.
// "Cosa tocca a me": gare aperte con la scadenza entro 5 giorni lavorativi
// (titolare, Acquisti, segreteria) e, al titolare, le gare da decidere.
// Il computo dell'ente si importa nel preventivo (F16.34, js/76).
// Senza sql/113: "non ancora attiva", nessun errore (una chiamata RPC 404).

const GARE = { attive: null, elenco: [], filtro: 'aperte', aperta: null, checklist: [] };
const GIORNI_AVVISO_GARA = 5;
const CHECKLIST_GARA_PREDEFINITA = ['DGUE', 'Domanda di partecipazione', 'Garanzia provvisoria (cauzione)', 'PassOE', 'Contributo ANAC',
  'Attestato di sopralluogo', 'Offerta tecnica', 'Offerta economica', 'Dichiarazioni (requisiti, subappalto)'];
const STATI_GARA = {
  aperta: { nome: 'Aperta', classe: 'bblue' },
  presentata: { nome: 'Presentata', classe: 'bok' },
  non_presentata: { nome: 'Non presentata', classe: 'bgray' },
  aggiudicata: { nome: '🏆 Aggiudicata', classe: 'bok' },
  persa: { nome: 'Persa', classe: 'bgray' }
};
const DECISIONI_GARA = { da_decidere: 'Da decidere (titolare)', partecipa: '✅ Partecipiamo', non_partecipa: '✖ Non partecipiamo' };

async function verificaGareDisponibili() {
  if (GARE.attive !== null) return GARE.attive;
  try { const { data, error } = await db.rpc('gare_attive'); GARE.attive = !error && data === true; } catch (e) { GARE.attive = false; }
  return GARE.attive;
}

function dataOraGara(t) { return t ? new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : ''; }

function giorniAllaScadenzaGara(g) {
  if (!g || !g.scadenza_presentazione) return null;
  const oggi = typeof dataLocaleISO === 'function' ? dataLocaleISO() : new Date().toISOString().slice(0, 10);
  const giorno = typeof dataLocaleISO === 'function' ? dataLocaleISO(new Date(g.scadenza_presentazione)) : g.scadenza_presentazione.slice(0, 10);
  if (typeof giorniLavorativiTra === 'function') return giorniLavorativiTra(oggi, giorno);
  return Math.round((new Date(giorno) - new Date(oggi)) / 86400000);
}

function htmlScadenzaGara(g) {
  const gg = giorniAllaScadenzaGara(g);
  if (gg === null || g.stato !== 'aperta') return esc(dataOraGara(g.scadenza_presentazione));
  const rosso = gg <= GIORNI_AVVISO_GARA;
  return '<span style="' + (rosso ? 'color:var(--r);font-weight:700' : '') + '">' + esc(dataOraGara(g.scadenza_presentazione)) +
    (gg < 0 ? ' · scaduta' : ' · ' + (gg === 0 ? 'oggi' : 'tra ' + gg + ' g lav.')) + '</span>';
}

async function loadGare() {
  const box = ge('gar-elenco');
  if (!box) return;
  const nuova = ge('gar-nuova-btn');
  if (!(await verificaGareDisponibili())) {
    box.innerHTML = '<div class="al2 i">Le gare non sono ancora attive: si attivano dopo l’aggiornamento del database (sql/113).</div>';
    if (nuova) nuova.style.display = 'none';
    return;
  }
  if (nuova) nuova.style.display = '';
  box.innerHTML = '<div class="load">Caricamento gare...</div>';
  let q = db.from('gare').select('*').order('scadenza_presentazione', { ascending: GARE.filtro === 'aperte' }).limit(300);
  if (GARE.filtro === 'aperte') q = q.eq('stato', 'aperta');
  const { data, error } = await q;
  if (error) { box.innerHTML = '<div class="al2 e">Errore caricamento: ' + esc(error.message) + '</div>'; return; }
  GARE.elenco = data || [];
  ['aperte', 'tutte'].forEach(function(f) { const b = ge('gar-filtro-' + f); if (b) b.classList.toggle('p', GARE.filtro === f); });
  if (!GARE.elenco.length) { box.innerHTML = '<div class="empty">' + (GARE.filtro === 'aperte' ? 'Nessuna gara aperta.' : 'Nessuna gara.') + '</div>'; return; }
  box.innerHTML = GARE.elenco.map(function(g) {
    const st = STATI_GARA[g.stato] || { nome: g.stato, classe: 'bgray' };
    const lista = Array.isArray(g.checklist) ? g.checklist : [];
    const fatti = lista.filter(function(x) { return x.stato !== 'da_fare'; }).length;
    return '<div class="card" style="margin-top:10px;cursor:pointer" onclick="apriGara(\'' + esc(g.id) + '\')">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">' +
        '<div style="min-width:0"><div style="font-size:15px;font-weight:700">' + esc(g.codice) + ' · ' + esc(g.ente) + '</div>' +
        '<div style="font-size:13px;margin-top:2px">' + esc(g.oggetto) + '</div>' +
        '<div style="font-size:12px;color:var(--m);margin-top:4px">Scadenza: ' + htmlScadenzaGara(g) + (g.cig ? ' · CIG ' + esc(g.cig) : '') +
          ' · documenti ' + fatti + '/' + lista.length + ' · ' + esc(DECISIONI_GARA[g.decisione] || g.decisione) + '</div></div>' +
        '<span class="bx ' + st.classe + '">' + esc(st.nome) + '</span>' +
      '</div></div>';
  }).join('');
}

function filtraGare(f) { GARE.filtro = f; loadGare(); }

// ── Finestra ──────────────────────────────────────────────────────────
function nuovaGara() {
  GARE.aperta = null;
  GARE.checklist = CHECKLIST_GARA_PREDEFINITA.map(function(v) { return { voce: v, stato: 'da_fare', nota: '' }; });
  disegnaGara();
  openM('m-gara');
}

async function apriGara(id) {
  if (!(await verificaGareDisponibili())) { toast('Le gare non sono ancora attive', 'err'); return; }
  const { data, error } = await db.from('gare').select('*').eq('id', id).maybeSingle();
  if (error || !data) { toast('Gara non trovata' + (error ? ': ' + error.message : ''), 'err'); return; }
  GARE.aperta = data;
  GARE.checklist = (Array.isArray(data.checklist) ? data.checklist : []).map(function(x) { return { voce: x.voce, stato: x.stato, nota: x.nota || '' }; });
  let numeroPrev = '';
  if (data.preventivo_id) {
    const { data: p } = await db.from('preventivi').select('numero').eq('id', data.preventivo_id).maybeSingle();
    numeroPrev = p ? String(p.numero) : '';
  }
  disegnaGara(numeroPrev);
  openM('m-gara');
}

function inputDataOraLocale(t) {
  if (!t) return '';
  const d = new Date(t);
  const z = function(n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes());
}

function modificabileGara(g) {
  if (!g) return true;
  if (ROLE === 'titolare') return true;
  return g.stato === 'aperta';
}

function htmlChecklistGara(modifica) {
  return GARE.checklist.map(function(x, i) {
    const col = x.stato === 'fatto' ? 'var(--g)' : (x.stato === 'non_serve' ? 'var(--m)' : 'var(--r)');
    return '<div data-gar-voce="' + i + '" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:6px 0;border-top:1px solid var(--bo)">' +
      (modifica
        ? '<input class="gar-v" maxlength="200" value="' + esc(x.voce) + '" style="flex:1 1 180px;min-width:0">' +
          '<select class="gar-s" style="flex:0 0 120px;color:' + col + '">' +
            [['da_fare', 'Da fare'], ['fatto', '✓ Fatto'], ['non_serve', 'Non serve']].map(function(o) { return '<option value="' + o[0] + '"' + (x.stato === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select>' +
          '<input class="gar-n" maxlength="300" value="' + esc(x.nota || '') + '" placeholder="Nota" style="flex:1 1 140px;min-width:0">' +
          '<button type="button" class="btn sm" style="color:var(--r)" onclick="togliVoceGara(' + i + ')" title="Togli">✖</button>'
        : '<span style="flex:1 1 180px">' + esc(x.voce) + '</span><b style="color:' + col + '">' + ({ da_fare: 'Da fare', fatto: '✓ Fatto', non_serve: 'Non serve' }[x.stato] || x.stato) + '</b>' +
          (x.nota ? '<span style="font-size:12px;color:var(--m);flex:1 1 100%">' + esc(x.nota) + '</span>' : '')) +
      '</div>';
  }).join('');
}

function leggiChecklistGara() {
  const out = [];
  document.querySelectorAll('#gar-checklist [data-gar-voce]').forEach(function(r) {
    const v = r.querySelector('.gar-v');
    if (!v) return;
    out.push({ voce: v.value.trim(), stato: r.querySelector('.gar-s').value, nota: r.querySelector('.gar-n').value.trim() });
  });
  return out;
}

function aggiungiVoceGara() { GARE.checklist = leggiChecklistGara(); GARE.checklist.push({ voce: '', stato: 'da_fare', nota: '' }); ge('gar-checklist').innerHTML = htmlChecklistGara(true); }
function togliVoceGara(i) { GARE.checklist = leggiChecklistGara(); GARE.checklist.splice(i, 1); ge('gar-checklist').innerHTML = htmlChecklistGara(true); }

function disegnaGara(numeroPrev) {
  const g = GARE.aperta;
  const mod = modificabileGara(g);
  ge('gar-titolo').textContent = g ? '🏛️ ' + g.codice : '🏛️ Nuova gara';
  const st = g ? (STATI_GARA[g.stato] || { nome: g.stato, classe: 'bgray' }) : null;
  ge('gar-stato').innerHTML = g ? '<span class="bx ' + st.classe + '">' + esc(st.nome) + '</span>' : '';
  ge('gar-ente').value = g ? g.ente : '';
  ge('gar-oggetto').value = g ? g.oggetto : '';
  ge('gar-cig').value = g ? (g.cig || '') : '';
  ge('gar-scadenza').value = g ? inputDataOraLocale(g.scadenza_presentazione) : '';
  ge('gar-sopralluogo').checked = !!(g && g.sopralluogo_obbligatorio);
  ge('gar-sopralluogo-il').value = g ? inputDataOraLocale(g.sopralluogo_il) : '';
  ge('gar-preventivo').value = numeroPrev || '';
  ge('gar-note').value = g ? (g.note || '') : '';
  ['gar-ente', 'gar-oggetto', 'gar-cig', 'gar-scadenza', 'gar-sopralluogo', 'gar-sopralluogo-il', 'gar-preventivo', 'gar-note'].forEach(function(id) { ge(id).disabled = !mod; });
  const apriPrev = ge('gar-apri-preventivo');
  apriPrev.style.display = g && g.preventivo_id && typeof canAccessPage === 'function' && canAccessPage('preventivo-detail') ? '' : 'none';
  ge('gar-checklist').innerHTML = htmlChecklistGara(mod);
  ge('gar-aggiungi-voce').style.display = mod ? '' : 'none';

  // Decisione del titolare
  const dec = g ? g.decisione : 'da_decidere';
  let hd = '<div style="font-size:13px"><b>' + esc(DECISIONI_GARA[dec] || dec) + '</b>' +
    (g && g.decisione_da_nome ? ' <span style="color:var(--m)">· ' + esc(g.decisione_da_nome) + ' il ' + esc(dataOraGara(g.decisione_il)) + '</span>' : '') +
    (g && g.decisione_nota ? '<div style="color:var(--m);margin-top:2px">' + esc(g.decisione_nota) + '</div>' : '') + '</div>';
  if (g && ROLE === 'titolare') {
    hd += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
      '<button type="button" class="btn sm p" onclick="decidiGara(\'partecipa\')">✅ Partecipiamo</button>' +
      '<button type="button" class="btn sm" style="color:var(--r)" onclick="decidiGara(\'non_partecipa\')">✖ Non partecipiamo</button>' +
      (dec !== 'da_decidere' ? '<button type="button" class="btn sm" onclick="decidiGara(\'da_decidere\')">↩ Da decidere</button>' : '') + '</div>';
  } else if (!g) {
    hd += '<div style="font-size:12px;color:var(--m)">La decide il titolare dopo il salvataggio.</div>';
  }
  ge('gar-decisione').innerHTML = hd;

  // Bottoni
  const b = ['<button type="button" class="btn" onclick="closeM(\'m-gara\')">Chiudi</button>'];
  if (mod) b.push('<button type="button" class="btn p" onclick="salvaGara()">💾 Salva</button>');
  if (g && g.stato === 'aperta') {
    b.push('<button type="button" class="btn p" onclick="cambiaStatoGara(\'presentata\')">📤 Segna presentata</button>');
    b.push('<button type="button" class="btn" onclick="cambiaStatoGara(\'non_presentata\')">Non presentata</button>');
  }
  if (g && g.stato === 'presentata') {
    b.push('<button type="button" class="btn p" onclick="cambiaStatoGara(\'aggiudicata\')">🏆 Aggiudicata</button>');
    b.push('<button type="button" class="btn" onclick="cambiaStatoGara(\'persa\')">Persa</button>');
  }
  ge('gar-bottoni').innerHTML = b.join('');
  ge('gar-info').textContent = g ? 'Creata da ' + (g.creata_da_nome || '—') + ' il ' + dataOraGara(g.creata_il) + (g.aggiornata_da_nome ? ' · ultima modifica ' + g.aggiornata_da_nome + ' il ' + dataOraGara(g.aggiornata_il) : '') : '';
}

async function datiFormGara() {
  const ente = ge('gar-ente').value.trim(), oggetto = ge('gar-oggetto').value.trim();
  const cig = ge('gar-cig').value.trim().toUpperCase();
  const scad = ge('gar-scadenza').value;
  if (!ente) { toast('Scrivi l’ente', 'err'); return null; }
  if (!oggetto) { toast('Scrivi l’oggetto della gara', 'err'); return null; }
  if (!scad) { toast('Indica la scadenza di presentazione', 'err'); return null; }
  if (cig && !/^[A-Z0-9]{10}$/.test(cig)) { toast('Il CIG ha 10 caratteri (lettere e numeri)', 'err'); return null; }
  const checklist = leggiChecklistGara().filter(function(x) { return x.voce; });
  let preventivoId = null;
  const num = ge('gar-preventivo').value.trim();
  if (num) {
    const { data: p } = await db.from('preventivi').select('id').eq('numero', Number(num)).maybeSingle();
    if (!p) { toast('Preventivo n. ' + num + ' non trovato (o non leggibile per il tuo ruolo)', 'err'); return null; }
    preventivoId = p.id;
  }
  const sop = ge('gar-sopralluogo').checked;
  return {
    ente: ente, oggetto: oggetto, cig: cig || null, scadenza_presentazione: new Date(scad).toISOString(),
    sopralluogo_obbligatorio: sop, sopralluogo_il: sop && ge('gar-sopralluogo-il').value ? new Date(ge('gar-sopralluogo-il').value).toISOString() : null,
    preventivo_id: preventivoId, note: ge('gar-note').value.trim() || null, checklist: checklist
  };
}

async function salvaGara() {
  const dati = await datiFormGara();
  if (!dati) return;
  const g = GARE.aperta;
  const r = g
    ? await db.from('gare').update(dati).eq('id', g.id).select('id').single()
    : await db.from('gare').insert(dati).select('id').single();
  if (r.error) { toast('Gara non salvata: ' + r.error.message, 'err'); return; }
  toast(g ? 'Gara aggiornata' : 'Gara creata', 'ok');
  await apriGara(r.data.id);
  loadGare();
}

async function decidiGara(decisione) {
  const g = GARE.aperta;
  if (!g) return;
  let nota = '';
  if (decisione !== 'da_decidere') {
    nota = prompt(decisione === 'partecipa' ? 'Partecipiamo. Nota facoltativa (es. margine, condizioni):' : 'Non partecipiamo. Motivo (facoltativo):', g.decisione_nota || '');
    if (nota === null) return;
  }
  const { error } = await db.from('gare').update({ decisione: decisione, decisione_nota: nota.trim() || null }).eq('id', g.id);
  if (error) { toast('Decisione non salvata: ' + error.message, 'err'); return; }
  toast('Decisione salvata', 'ok');
  await apriGara(g.id);
  loadGare();
}

async function cambiaStatoGara(stato) {
  const g = GARE.aperta;
  if (!g) return;
  const nomi = { presentata: 'presentata', non_presentata: 'non presentata', aggiudicata: 'aggiudicata', persa: 'persa' };
  if (!confirm('Segnare la gara ' + g.codice + ' come ' + nomi[stato] + '?')) return;
  const agg = { stato: stato };
  if (modificabileGara(g) && stato === 'presentata') {
    // salva insieme anche le ultime spunte della checklist
    const dati = await datiFormGara();
    if (!dati) return;
    Object.assign(agg, dati);
  }
  const { error } = await db.from('gare').update(agg).eq('id', g.id);
  if (error) { toast('Non riuscito: ' + error.message, 'err'); return; }
  toast('Gara segnata ' + nomi[stato], 'ok');
  await apriGara(g.id);
  loadGare();
}

function apriPreventivoGara() {
  const g = GARE.aperta;
  if (!g || !g.preventivo_id) return;
  closeM('m-gara');
  openPreventivoDetail(g.preventivo_id);
}

// ── Avvisi in "Cosa tocca a me" ───────────────────────────────────────
async function gareInScadenza() {
  if (!(await verificaGareDisponibili())) return null;
  const { data, error } = await db.from('gare').select('id,scadenza_presentazione,stato').eq('stato', 'aperta');
  if (error) return null;
  return (data || []).filter(function(g) { const gg = giorniAllaScadenzaGara(g); return gg !== null && gg <= GIORNI_AVVISO_GARA; });
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'gare-in-scadenza', ruoli: ['titolare', 'commerciale', 'segreteria'], icona: '🏛️',
    titolo: 'Gare in scadenza entro ' + GIORNI_AVVISO_GARA + ' giorni lavorativi', livello: 'urgente', priorita: 25,
    vai: { pagina: 'gare' },
    conta: async function() { const e = await gareInScadenza(); return e === null ? null : e.length; }
  });
  registraFonteToccaAMe({
    id: 'gare-da-decidere', ruoli: ['titolare'], icona: '🏛️',
    titolo: 'Gare da decidere (partecipiamo?)', priorita: 26,
    vai: { pagina: 'gare' },
    conta: async function() {
      if (!(await verificaGareDisponibili())) return null;
      return numeroTAM(contaTAM('gare').eq('stato', 'aperta').eq('decisione', 'da_decidere'), 'gare da decidere');
    }
  });
}

if (typeof OGGETTO_DA_TABELLA_AVVISO !== 'undefined') OGGETTO_DA_TABELLA_AVVISO.gare = 'gara';
if (typeof NOME_RECORD_AVVISO !== 'undefined') NOME_RECORD_AVVISO.gare = 'la gara';
if (typeof SCHEDE_CON_INDIRIZZO !== 'undefined') {
  SCHEDE_CON_INDIRIZZO.gara = {
    nome: 'la gara', pagina: 'gare', finestra: true, idFinestra: 'm-gara',
    apri: async function(id) { gotoPage('gare'); await apriGara(id); }
  };
}
