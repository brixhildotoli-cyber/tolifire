// =====================================================================
// F10.4 — BUONO DI LAVORO, FATTURA E RIPARTENZA DEL CICLO (Fase 10, Service).
// Caricare dopo 41-appuntamenti-segreteria.js e prima di 19-init.js.
//
// 1. BUONO DI LAVORO = la scheda di lavoro del tecnico (schede_lavoro) con
//    i DDT collegati all'intervento (ddt.odl_id o ddt.scheda_lavoro_id).
//    Nella finestra della scheda (m-scheda, box ms-buono) e nel PDF
//    "Rapporto" (js/04, sezioniBuonoLavoroPDF) riporta:
//    - DIFFERENZE PRESIDI per tipo tra i presidi previsti dal contratto
//      (clienti_periodicita.presidi_contratto, sql/40) e quelli trovati:
//      se l'intervento ha l'audit registrato (sql/41) i trovati sono
//      quelli dell'audit (con i "non trovati"), altrimenti il registro
//      presidi attuale del cliente (presidi non eliminati).
//    - LAVORI FUORI CONTRATTO (regola dichiarata, nessun dato nuovo):
//      a) cliente senza contratto di manutenzione;
//      b) intervento fuori dal periodo del contratto (prima dell'inizio,
//         dopo la fine o contratto non rinnovato);
//      c) intervento che non è la manutenzione ordinaria programmata (su
//         chiamata, straordinario, corso);
//      d) presidi in più rispetto al contratto (per tipo);
//      e) presidi controllati in questo intervento rimasti in anomalia,
//         scaduti o fuori servizio (sostituzione, ricarica o riparazione
//         da preventivare);
//      f) intervento straordinario richiesto dal tecnico;
//      g) righe dei DDT dell'intervento senza voce corrispondente nel
//         preventivo del contratto (solo per chi vede i prezzi e se il
//         contratto ha il preventivo collegato).
//    - MATERIALE E PREZZI: righe dei DDT; per chi vede i prezzi
//      (RUOLI_PREZZI di js/14) l'origine del prezzo di ogni riga.
//    - FATTURAZIONE: lo stato della scheda nel workflow che esiste già
//      (firmata → approvata → inviata al cliente → da fatturare →
//      fatturata). Il modulo Fatture non c'è (Fase 11): qui buono e DDT
//      arrivano pronti e segnati "da fatturare" a segreteria e contabile
//      (workflow, Documenti); niente fattura emessa dal gestionale.
// 2. PREZZI DAL PREVENTIVO DEL CONTRATTO: nel DDT (m-ddt, box
//    ddt-contratto-box) le righe prese dal catalogo prendono il prezzo
//    della voce del preventivo del contratto che corrisponde (stessa
//    descrizione, senza badare a maiuscole, accenti e punteggiatura,
//    oppure codice del prodotto scritto nella descrizione della voce:
//    preventivi_voci non ha un collegamento a prodotti_catalogo); senza
//    voce corrispondente resta il prezzo del catalogo, come oggi. "Aggiungi
//    una voce del contratto" e "Applica i prezzi del contratto". Le voci
//    arrivano da prezzi_contratto_cliente (sql/44); senza sql/44 solo il
//    titolare le legge (policy di oggi su preventivi_voci). È il primo
//    passo del modulo "Listini per cliente" (CLAUDE.md, Moduli punto 1):
//    il listino del cliente con contratto è il preventivo del contratto.
// 3. RIPARTENZA DEL CICLO: "🔁 Controlli scaduti: da ripianificare" nella
//    dashboard del capo tecnico (Responsabile Service, ct-ripartenza) e in
//    testa al Piano mensile del mese corrente: clienti con controlli del
//    piano degli ultimi 12 mesi mai schedulati o con presidi scaduti o in
//    scadenza entro 30 giorni, senza una manutenzione ordinaria aperta.
//    Schedulando, i controlli del piano del cliente fino al mese
//    dell'intervento si collegano all'intervento (alla chiusura passano a
//    "eseguito", trigger di sql/17); da lì si riparte con l'appuntamento
//    della segreteria (F10.3). Anche "+ Schedula intervento" del box
//    "Interventi periodici del mese" ora collega i controlli (prima no:
//    restavano "da schedulare" anche dopo l'intervento).
// =====================================================================

const RUOLI_CREA_DDT_BUONO = ['titolare', 'segreteria', 'capo_tecnico'];
const RUOLI_RIPARTENZA = ['titolare', 'capo_tecnico'];
const GIORNI_PREAVVISO_CONTROLLI = 30;
const STATI_PRESIDIO_DA_PREVENTIVARE = { anomalia: 'anomalia', scaduto: 'scaduto', fuori_servizio: 'fuori servizio' };

let prezziContrattoRpc = null;           // null = da provare, true/false dopo il primo tentativo
const prezziContrattoCache = {};         // cliente -> { contratto, preventivo, voci } | null
let ddtPrezziContratto = null;           // prezzi del contratto del cliente del DDT aperto
let collegaCicliDopoSalvataggio = null;  // { cli } dopo "+ Schedula intervento" della dashboard

// ── Utilità ──────────────────────────────────────────────────────────────
function euroBuono(n) {
  return '€ ' + (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nomeTipoPresidio(t) {
  return tpl(t).replace(/^\S+\s/, '');
}

// "EX-2 (Estintori, Magazzino)": il presidio con il suo tipo e dove si trova.
function nomePresidioBuono(p) {
  const dove = [nomeTipoPresidio(p.tipo), p.ubicazione].filter(Boolean).join(', ');
  return (p.matricola ? p.matricola + ' (' + dove + ')' : dove);
}

function normalizzaTestoPrezzo(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function meseDiData(iso) {
  return /^\d{4}-\d{2}/.test(iso || '') ? iso.slice(0, 7) : null;
}

function meseCorrenteISO() {
  return dataLocaleISO(new Date()).slice(0, 7);
}

function nomeMese(meseAnno) {
  const d = new Date(meseAnno + '-01T00:00:00');
  return isNaN(d) ? meseAnno : d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

// ── Prezzi del preventivo del contratto ───────────────────────────────────
// Restituisce { contratto, preventivo, voci } o null (ruolo senza prezzi,
// cliente senza contratto o nessuna lettura possibile).
async function prezziContrattoCliente(cliId) {
  if (!cliId || !canSeePrezzi()) return null;
  if (Object.prototype.hasOwnProperty.call(prezziContrattoCache, cliId)) return prezziContrattoCache[cliId];
  let ris = null;
  if (prezziContrattoRpc !== false) {
    const { data, error } = await db.rpc('prezzi_contratto_cliente', { p_cliente_id: cliId });
    if (!error) {
      prezziContrattoRpc = true;
      ris = data || null;
    } else if (error.code === 'PGRST202' || error.code === '42883' || /prezzi_contratto_cliente/i.test(error.message || '')) {
      prezziContrattoRpc = false; // sql/44 non ancora eseguito
    } else {
      console.warn('Prezzi del contratto:', error.message);
      return null;
    }
  }
  if (prezziContrattoRpc === false) ris = await prezziContrattoLetturaDiretta(cliId);
  if (ris && !ris.contratto) ris = null;
  prezziContrattoCache[cliId] = ris;
  return ris;
}

// Senza sql/44: lettura diretta (le regole di oggi la permettono al
// titolare, e al commerciale per i suoi preventivi). Se non legge nulla
// il DDT usa i prezzi del catalogo come prima.
async function prezziContrattoLetturaDiretta(cliId) {
  const rc = await db.from('clienti_periodicita').select('*').eq('cliente_id', cliId)
    .order('creato_il', { ascending: true, nullsFirst: false }).limit(1);
  const c = rc.error ? null : (rc.data || [])[0];
  if (!c) return null;
  const ris = {
    contratto: { inizio: c.data_inizio_contratto || null, fine: c.data_fine_contratto || null, stato: c.contratto_stato || 'attivo' },
    preventivo: null,
    voci: [],
    soloLetturaDiretta: true
  };
  if (!c.preventivo_id) return ris;
  const [rp, rv] = await Promise.all([
    db.from('preventivi').select('id,numero,data_emissione,stato').eq('id', c.preventivo_id).maybeSingle(),
    db.from('preventivi_voci').select('id,categoria,descrizione,unita_misura,quantita,prezzo_unitario,ordinamento')
      .eq('preventivo_id', c.preventivo_id).order('ordinamento', { ascending: true })
  ]);
  if (rp.error || !rp.data) return ris;
  ris.preventivo = rp.data;
  ris.voci = rv.error ? [] : (rv.data || []);
  ris.vociNonLeggibili = !!rv.error || !(rv.data || []).length;
  return ris;
}

// Voce del contratto che corrisponde a una riga (descrizione uguale,
// oppure codice del prodotto nella descrizione della voce).
function voceContrattoPerRiga(r, voci) {
  if (!r || !voci || !voci.length) return null;
  const d = normalizzaTestoPrezzo(r.descrizione);
  if (d) {
    const uguale = voci.find(function(vc) { return normalizzaTestoPrezzo(vc.descrizione) === d; });
    if (uguale) return uguale;
  }
  const cod = normalizzaTestoPrezzo(r.codice);
  if (cod && cod.length >= 3) {
    return voci.find(function(vc) {
      return (' ' + normalizzaTestoPrezzo(vc.descrizione) + ' ').indexOf(' ' + cod + ' ') !== -1;
    }) || null;
  }
  return null;
}

// Origine del prezzo di una riga rispetto al contratto.
function fontePrezzoRiga(r, prezzi) {
  if (!prezzi || !prezzi.preventivo || !(prezzi.voci || []).length) return null;
  const vc = voceContrattoPerRiga(r, prezzi.voci);
  if (!vc) return { tipo: 'fuori', voce: null };
  const uguale = Math.abs((Number(r.prezzo_unitario) || 0) - (Number(vc.prezzo_unitario) || 0)) < 0.005;
  return { tipo: uguale ? 'contratto' : 'diverso', voce: vc };
}

function htmlFontePrezzo(f) {
  if (!f) return '';
  if (f.tipo === 'contratto') return '<span class="bx bok" style="font-size:10px">📄 prezzo del contratto</span>';
  if (f.tipo === 'diverso') return '<span class="bx bwarn" style="font-size:10px">⚠️ nel contratto ' + esc(euroBuono(f.voce.prezzo_unitario)) + '</span>';
  return '<span class="bx bgray" style="font-size:10px">fuori contratto</span>';
}

function testoPreventivoBuono(p) {
  if (!p) return '';
  return 'n. ' + (p.numero ?? '—') + (p.data_emissione ? ' del ' + fd(p.data_emissione) : '') +
    (p.stato ? ' (' + ((typeof ETICHETTE_STATO_PREVENTIVO_CONTRATTO !== 'undefined' && ETICHETTE_STATO_PREVENTIVO_CONTRATTO[p.stato]) || String(p.stato).replace(/_/g, ' ')) + ')' : '');
}

// ── DDT: prezzi del contratto ────────────────────────────────────────────
const initDDTModalPrimaBuono = initDDTModal;
initDDTModal = function() {
  ddtPrezziContratto = null;
  Object.keys(prezziContrattoCache).forEach(function(k) { delete prezziContrattoCache[k]; });
  const box = ge('ddt-contratto-box');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  return initDDTModalPrimaBuono.apply(this, arguments);
};

const caricaSediDDTPrimaBuono = caricaSediDDT;
caricaSediDDT = async function(clienteId) {
  const r = await caricaSediDDTPrimaBuono.apply(this, arguments);
  try { await caricaPrezziContrattoDDT(clienteId); } catch (e) { console.warn('Prezzi del contratto nel DDT:', e); }
  return r;
};

async function caricaPrezziContrattoDDT(cliId) {
  const box = ge('ddt-contratto-box');
  ddtPrezziContratto = null;
  if (!box) return;
  box.style.display = 'none';
  box.innerHTML = '';
  if (!cliId || !canSeePrezzi()) { renderRigheDDT(); return; }
  const prezzi = await prezziContrattoCliente(cliId);
  if (v('ddt-cli') !== cliId) return; // nel frattempo è stato scelto un altro cliente
  ddtPrezziContratto = prezzi;
  if (!prezzi) { renderRigheDDT(); return; }
  let html;
  if (!prezzi.preventivo) {
    html = '<div style="font-size:12px;color:var(--m)">📄 Contratto di manutenzione senza preventivo collegato: prezzi dal catalogo, come sempre. Il preventivo del contratto si collega nella scheda del cliente (tab Periodicità).</div>';
  } else if (!(prezzi.voci || []).length) {
    html = '<div style="font-size:12px;color:var(--m)">📄 Preventivo del contratto ' + esc(testoPreventivoBuono(prezzi.preventivo)) + ': ' +
      (prezzi.vociNonLeggibili && prezziContrattoRpc === false
        ? 'le voci non sono ancora leggibili per il tuo ruolo (si attivano con sql/44). Prezzi dal catalogo.'
        : 'nessuna voce. Prezzi dal catalogo.') + '</div>';
  } else {
    const opzioni = prezzi.voci.map(function(vc) {
      return '<option value="' + esc(vc.id) + '">' + esc(vc.descrizione) + ' — ' + esc(euroBuono(vc.prezzo_unitario)) + (vc.unita_misura ? '/' + esc(vc.unita_misura) : '') + '</option>';
    }).join('');
    html = '<div style="font-size:12px;margin-bottom:6px">📄 <strong>Prezzi dal preventivo del contratto</strong> ' + esc(testoPreventivoBuono(prezzi.preventivo)) +
      ' · ' + prezzi.voci.length + (prezzi.voci.length === 1 ? ' voce' : ' voci') + '</div>' +
      '<div style="font-size:11px;color:var(--m);margin-bottom:8px">Le righe del catalogo prendono il prezzo della voce con la stessa descrizione (o con il codice del prodotto nella descrizione); le altre restano al prezzo del catalogo e sono segnate "fuori contratto".</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
        '<select id="ddt-voce-contratto" style="flex:1;min-width:0;max-width:100%;font-size:12px"><option value="">Aggiungi una voce del contratto...</option>' + opzioni + '</select>' +
        '<button class="btn sm" type="button" onclick="aggiungiVoceContrattoDDT()">+ Aggiungi</button>' +
        '<button class="btn sm" type="button" onclick="applicaPrezziContrattoDDT()">Applica i prezzi del contratto</button>' +
      '</div>';
  }
  const c = prezzi.contratto || {};
  const oggi = dataLocaleISO(new Date());
  if (c.stato === 'non_rinnovato') html += '<div style="font-size:12px;color:var(--r);margin-top:6px">⚠️ Contratto non rinnovato.</div>';
  else if (c.fine && c.fine < oggi) html += '<div style="font-size:12px;color:var(--r);margin-top:6px">⚠️ Contratto scaduto il ' + esc(fd(c.fine)) + '.</div>';
  box.innerHTML = '<div style="background:var(--bg);border-radius:var(--rs);padding:10px;overflow-wrap:anywhere">' + html + '</div>';
  box.style.display = 'block';
  renderRigheDDT();
}

function vociContrattoDDT() {
  return ddtPrezziContratto && ddtPrezziContratto.preventivo ? (ddtPrezziContratto.voci || []) : [];
}

const aggiungiDaCatalogoPrimaBuono = aggiungiDaCatalogo;
aggiungiDaCatalogo = async function(prodId) {
  const prima = _ddtRighe.length;
  const r = await aggiungiDaCatalogoPrimaBuono.apply(this, arguments);
  if (_ddtRighe.length > prima && canSeePrezzi()) {
    const riga = _ddtRighe[_ddtRighe.length - 1];
    const vc = voceContrattoPerRiga(riga, vociContrattoDDT());
    if (vc) {
      riga.prezzo_unitario = Number(vc.prezzo_unitario) || 0;
      renderRigheDDT();
    }
  }
  return r;
};

function aggiungiVoceContrattoDDT() {
  const id = v('ddt-voce-contratto');
  if (!id) { toast('Scegli una voce del contratto', 'err'); return; }
  const vc = vociContrattoDDT().find(function(x) { return x.id === id; });
  if (!vc) return;
  _ddtRighe.push({
    prodotto_id: null,
    codice: '',
    descrizione: vc.descrizione || '',
    um: vc.unita_misura || '',
    quantita: 1,
    prezzo_unitario: Number(vc.prezzo_unitario) || 0
  });
  ge('ddt-voce-contratto').value = '';
  renderRigheDDT();
}

function applicaPrezziContrattoDDT() {
  const voci = vociContrattoDDT();
  if (!voci.length) return;
  let n = 0, fuori = 0;
  _ddtRighe.forEach(function(r) {
    const vc = voceContrattoPerRiga(r, voci);
    if (!vc) { fuori++; return; }
    const p = Number(vc.prezzo_unitario) || 0;
    if (Math.abs((Number(r.prezzo_unitario) || 0) - p) >= 0.005) { r.prezzo_unitario = p; n++; }
  });
  renderRigheDDT();
  toast(n ? ('Prezzi del contratto applicati a ' + n + (n === 1 ? ' riga' : ' righe') + (fuori ? '; ' + fuori + ' fuori contratto' : '')) : (fuori ? 'Nessuna riga da aggiornare (' + fuori + ' fuori contratto)' : 'Le righe hanno già i prezzi del contratto'), 'ok');
}

const renderRigheDDTPrimaBuono = renderRigheDDT;
renderRigheDDT = function() {
  const r = renderRigheDDTPrimaBuono.apply(this, arguments);
  decoraRigheDDTContratto();
  return r;
};

function decoraRigheDDTContratto() {
  if (!canSeePrezzi() || !vociContrattoDDT().length) return;
  const righe = document.querySelectorAll('#ddt-righe-list tbody tr');
  righe.forEach(function(tr, i) {
    const td = tr.children[1];
    if (!td) return;
    let el = ge('ddt-riga-fonte-' + i);
    if (!el) {
      el = document.createElement('div');
      el.id = 'ddt-riga-fonte-' + i;
      el.style.marginTop = '3px';
      td.appendChild(el);
    }
    el.innerHTML = htmlFontePrezzo(fontePrezzoRiga(_ddtRighe[i], ddtPrezziContratto));
  });
}

const aggiornaRigaPrimaBuono = aggiornaRiga;
aggiornaRiga = function(i, campo) {
  const r = aggiornaRigaPrimaBuono.apply(this, arguments);
  if (['descrizione', 'codice', 'prezzo_unitario'].includes(campo)) {
    const el = ge('ddt-riga-fonte-' + i);
    if (el && _ddtRighe[i]) el.innerHTML = htmlFontePrezzo(fontePrezzoRiga(_ddtRighe[i], ddtPrezziContratto));
  }
  return r;
};

// DDT dell'intervento, aperto dal buono di lavoro con cliente e intervento già scelti.
async function creaDDTDaBuono(schedaId) {
  if (!RUOLI_CREA_DDT_BUONO.includes(ROLE)) { toast('Il DDT lo prepara la segreteria', 'err'); return; }
  const { data: s, error } = await db.from('schede_lavoro')
    .select('id,cliente_id,odl_id,ordini_lavoro(numero),clienti(ragione_sociale)').eq('id', schedaId).maybeSingle();
  if (error || !s) { toast('Scheda non trovata: ricarica la pagina', 'err'); return; }
  closeM('m-scheda');
  apriNuovoDDT();
  const cli = ge('ddt-cli');
  if (cli && !Array.prototype.some.call(cli.options, function(o) { return o.value === s.cliente_id; })) {
    const o = document.createElement('option');
    o.value = s.cliente_id;
    o.textContent = (s.clienti && s.clienti.ragione_sociale) || 'Cliente';
    cli.appendChild(o);
  }
  if (cli) cli.value = s.cliente_id;
  const odl = ge('ddt-odl');
  if (odl && s.odl_id) {
    if (!Array.prototype.some.call(odl.options, function(o) { return o.value === s.odl_id; })) {
      const o = document.createElement('option');
      o.value = s.odl_id;
      o.textContent = '#' + ((s.ordini_lavoro && s.ordini_lavoro.numero) || '—') + ' ' + ((s.clienti && s.clienti.ragione_sociale) || '');
      odl.appendChild(o);
    }
    odl.value = s.odl_id;
  }
  if (!v('ddt-causale')) ge('ddt-causale').value = 'Materiale fornito durante l\'intervento';
  await caricaSediDDT(s.cliente_id);
}

// ── Dati del buono di lavoro ──────────────────────────────────────────────
function statoContrattoAlGiorno(c, giorno) {
  if (!c) return { stato: 'assente' };
  const inizio = c.data_inizio_contratto || null, fine = c.data_fine_contratto || null;
  if (c.contratto_stato === 'non_rinnovato' && fine && giorno > fine) return { stato: 'non_rinnovato', inizio: inizio, fine: fine };
  if (fine && giorno > fine) return { stato: 'scaduto', inizio: inizio, fine: fine };
  if (inizio && giorno < inizio) return { stato: 'non_iniziato', inizio: inizio, fine: fine };
  return { stato: 'attivo', inizio: inizio, fine: fine };
}

async function leggiPresidiClienteBuono(cliId) {
  const tutti = [];
  for (let da = 0; da < 10000; da += 1000) {
    const { data, error } = await db.from('impianti')
      .select('id,tipo,matricola,ubicazione,stato,data_ultimo_controllo')
      .eq('cliente_id', cliId).is('eliminato_il', null).order('id').range(da, da + 999);
    if (error) return { errore: error.message, presidi: tutti };
    tutti.push.apply(tutti, data || []);
    if (!data || data.length < 1000) break;
  }
  return { presidi: tutti };
}

async function leggiDDTBuono(s) {
  if (!s.odl_id && !s.id) return { ddt: [] };
  let q = db.from('ddt').select('id,numero,data_emissione,causale,odl_id,scheda_lavoro_id').is('eliminato_il', null);
  q = s.odl_id ? q.or('odl_id.eq.' + s.odl_id + ',scheda_lavoro_id.eq.' + s.id) : q.eq('scheda_lavoro_id', s.id);
  const rd = await q.order('numero', { ascending: true });
  if (rd.error) return { ddt: [], errore: rd.error.message };
  const ddt = rd.data || [];
  if (!ddt.length) return { ddt: [] };
  const rr = await db.from('ddt_righe').select('ddt_id,codice,descrizione,um,quantita,prezzo_unitario,prodotto_id')
    .in('ddt_id', ddt.map(function(d) { return d.id; })).order('id');
  const righe = rr.error ? [] : (rr.data || []);
  ddt.forEach(function(d) {
    d.righe = righe.filter(function(r) { return r.ddt_id === d.id; });
    d.totale = d.righe.reduce(function(t, r) { return t + (Number(r.quantita) || 0) * (Number(r.prezzo_unitario) || 0); }, 0);
  });
  return { ddt: ddt };
}

// s = riga di schede_lavoro (con ordini_lavoro(tipo) se possibile).
async function datiBuonoLavoro(s) {
  const giorno = s.data_intervento || dataLocaleISO(new Date());
  const [rc, ra, rp, rd, prezzi, ro] = await Promise.all([
    db.from('clienti_periodicita').select('*').eq('cliente_id', s.cliente_id)
      .order('creato_il', { ascending: true, nullsFirst: false }).limit(1),
    s.odl_id
      ? db.from('audit_presidi').select('data_audit,presidi_trovati,presidi_non_trovati').eq('odl_id', s.odl_id).maybeSingle()
      : Promise.resolve({ data: null }),
    leggiPresidiClienteBuono(s.cliente_id),
    leggiDDTBuono(s),
    prezziContrattoCliente(s.cliente_id),
    (s.ordini_lavoro && s.ordini_lavoro.tipo) || !s.odl_id
      ? Promise.resolve({ data: s.ordini_lavoro || null })
      : db.from('ordini_lavoro').select('tipo').eq('id', s.odl_id).maybeSingle()
  ]);
  const contratto = rc.error ? null : ((rc.data || [])[0] || null);
  const audit = ra && !ra.error ? ra.data : null;
  const presidi = rp.presidi || [];
  const tipoIntervento = (ro && ro.data && ro.data.tipo) || null;
  const periodo = statoContrattoAlGiorno(contratto, giorno);

  // Differenze presidi per tipo
  const diff = { disponibile: false, fonte: null, righe: [], nonTrovati: [], senzaNumeri: false, trovati: {} };
  if (contratto && Object.prototype.hasOwnProperty.call(contratto, 'presidi_contratto')) {
    diff.disponibile = true;
    const previsti = contratto.presidi_contratto || {};
    let trovati = {};
    if (audit && audit.presidi_trovati) {
      diff.fonte = 'audit';
      diff.dataAudit = audit.data_audit;
      trovati = audit.presidi_trovati || {};
      diff.nonTrovati = Array.isArray(audit.presidi_non_trovati) ? audit.presidi_non_trovati : [];
    } else {
      diff.fonte = 'registro';
      presidi.forEach(function(p) { trovati[p.tipo] = (trovati[p.tipo] || 0) + 1; });
    }
    diff.trovati = trovati;
    diff.senzaNumeri = !Object.keys(previsti).some(function(k) { return Number(previsti[k]) > 0; });
    if (!diff.senzaNumeri) {
      const tipi = {};
      Object.keys(trovati).concat(Object.keys(previsti)).forEach(function(t) { tipi[t] = true; });
      diff.righe = Object.keys(tipi).map(function(t) {
        const tr = Number(trovati[t]) || 0, pr = Number(previsti[t]) || 0;
        return { tipo: t, trovati: tr, previsti: pr, delta: tr - pr };
      }).filter(function(x) { return x.delta !== 0; })
        .sort(function(a, b) { return TIPI_PRESIDI.indexOf(a.tipo) - TIPI_PRESIDI.indexOf(b.tipo); });
    }
  }

  // Lavori fuori contratto (regola in testa al file)
  const fuori = [];
  if (periodo.stato === 'assente') {
    fuori.push({ chiave: 'contratto', testo: 'Cliente senza contratto di manutenzione: l\'intervento si fattura a parte (a consuntivo).' });
  } else if (periodo.stato !== 'attivo') {
    const etichetta = { scaduto: 'contratto scaduto il ' + fd(periodo.fine), non_rinnovato: 'contratto non rinnovato (finito il ' + fd(periodo.fine) + ')', non_iniziato: 'contratto in vigore dal ' + fd(periodo.inizio) }[periodo.stato];
    fuori.push({ chiave: 'periodo', testo: 'Intervento fuori dal periodo del contratto (' + etichetta + '): si fattura a parte.' });
  } else if (tipoIntervento && tipoIntervento !== 'ordinario_programmato') {
    fuori.push({ chiave: 'tipo', testo: 'Intervento "' + tl(tipoIntervento) + '": non è la manutenzione ordinaria programmata del contratto.' });
  }
  diff.righe.filter(function(x) { return x.delta > 0; }).forEach(function(x) {
    fuori.push({ chiave: 'presidi', testo: nomeTipoPresidio(x.tipo) + ': ' + x.delta + ' in più rispetto al contratto (previsti ' + x.previsti + ', trovati ' + x.trovati + '): da aggiungere al contratto o da fatturare a parte.' });
  });
  const daPreventivare = presidi.filter(function(p) {
    return p.data_ultimo_controllo === s.data_intervento && STATI_PRESIDIO_DA_PREVENTIVARE[p.stato];
  });
  if (daPreventivare.length) {
    const elenco = daPreventivare.slice(0, 6).map(function(p) {
      return nomePresidioBuono(p) + ': ' + STATI_PRESIDIO_DA_PREVENTIVARE[p.stato];
    }).join('; ') + (daPreventivare.length > 6 ? '; e altri ' + (daPreventivare.length - 6) : '');
    fuori.push({ chiave: 'stato', testo: 'Presidi da sostituire, ricaricare o riparare (da preventivare): ' + elenco + '.' });
  }
  if (s.intervento_straordinario_richiesto) {
    fuori.push({ chiave: 'straordinario', testo: 'Intervento straordinario richiesto dal tecnico' + (s.urgenza_straordinario ? ' (urgenza: ' + String(s.urgenza_straordinario).replace(/_/g, ' ') + ')' : '') + (s.descrizione_intervento_necessario ? ': ' + s.descrizione_intervento_necessario : '') + '.' });
  }
  const ddt = rd.ddt || [];
  if (prezzi && prezzi.preventivo && (prezzi.voci || []).length) {
    ddt.forEach(function(d) {
      d.righe.forEach(function(r) { r._fonte = fontePrezzoRiga(r, prezzi); });
      const fuoriDdt = d.righe.filter(function(r) { return r._fonte && r._fonte.tipo === 'fuori'; });
      if (fuoriDdt.length) {
        fuori.push({ chiave: 'ddt', testo: 'Materiale fuori contratto nel DDT n. ' + (d.numero || '—') + ': ' + fuoriDdt.map(function(r) { return r.descrizione; }).join('; ') + ' (prezzo del catalogo).' });
      }
    });
  }

  return { contratto: contratto, periodo: periodo, diff: diff, fuori: fuori, ddt: ddt, ddtErrore: rd.errore || null, prezzi: prezzi, tipoIntervento: tipoIntervento };
}

// ── Finestra della scheda: box "Buono di lavoro" ──────────────────────────
const openSchedaPrimaBuono = openScheda;
openScheda = async function(id) {
  const box = ge('ms-buono');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  const r = await openSchedaPrimaBuono.apply(this, arguments);
  try { await caricaBuonoLavoroScheda(id); } catch (e) { console.warn('Buono di lavoro:', e); }
  return r;
};

function titoletto(t) {
  return '<div style="font-size:12px;font-weight:600;color:var(--m);text-transform:uppercase;margin:12px 0 6px">' + t + '</div>';
}

async function caricaBuonoLavoroScheda(id) {
  const box = ge('ms-buono');
  if (!box) return;
  const { data: s, error } = await db.from('schede_lavoro').select('*,ordini_lavoro(tipo,numero)').eq('id', id).maybeSingle();
  if (error || !s || s.impossibilitato) return;
  box.innerHTML = '<div class="load">Caricamento del buono di lavoro...</div>';
  box.style.display = 'block';
  const d = await datiBuonoLavoro(s);
  if (!ge('m-scheda').classList.contains('on')) return;
  const prezziVisibili = canSeePrezzi();
  let html = '<div style="border:0.5px solid var(--bo);border-radius:var(--rs);padding:12px;overflow-wrap:anywhere">' +
    '<div style="font-size:14px;font-weight:700;margin-bottom:4px">🧾 Buono di lavoro</div>';

  // Contratto
  const c = d.contratto;
  if (!c) {
    html += '<div style="font-size:12px;color:var(--m)">Cliente senza contratto di manutenzione.</div>';
  } else {
    const per = (c.data_inizio_contratto ? 'dal ' + fd(c.data_inizio_contratto) : '') + (c.data_fine_contratto ? ' al ' + fd(c.data_fine_contratto) : '');
    const badge = { attivo: '<span class="bx bok">in vigore</span>', scaduto: '<span class="bx berr">scaduto</span>', non_rinnovato: '<span class="bx berr">non rinnovato</span>', non_iniziato: '<span class="bx bwarn">non ancora iniziato</span>' }[d.periodo.stato] || '';
    html += '<div style="font-size:12px">Contratto di manutenzione ' + esc(per.trim() || '(date non indicate)') + ' ' + badge + '</div>';
    if (prezziVisibili && d.prezzi) {
      html += '<div style="font-size:12px;color:var(--m)">Preventivo del contratto: ' + (d.prezzi.preventivo ? esc(testoPreventivoBuono(d.prezzi.preventivo)) : 'non collegato (prezzi dal catalogo)') + '</div>';
    }
  }

  // Differenze presidi
  const df = d.diff;
  if (df.disponibile) {
    html += titoletto('Differenze presidi rispetto al contratto');
    const fonte = df.fonte === 'audit' ? 'audit della prima manutenzione del ' + fd(df.dataAudit) : 'registro presidi attuale del cliente';
    if (df.senzaNumeri) {
      html += '<div style="font-size:12px;color:var(--a)">Il contratto non indica i presidi previsti: differenze non calcolabili. Trovati (' + esc(fonte) + '): ' +
        esc(Object.keys(df.trovati).map(function(t) { return df.trovati[t] + ' ' + nomeTipoPresidio(t).toLowerCase(); }).join(', ') || 'nessuno') + '.</div>';
    } else if (!df.righe.length) {
      html += '<div style="font-size:12px;color:var(--g)">✓ I presidi coincidono con il contratto (' + esc(fonte) + ').</div>';
    } else {
      html += '<div style="font-size:11px;color:var(--m);margin-bottom:4px">Trovati secondo: ' + esc(fonte) + '</div>' +
        df.righe.map(function(x) {
          return '<div style="font-size:12px;display:flex;justify-content:space-between;gap:8px;padding:2px 0;flex-wrap:wrap">' +
            '<span>' + esc(tpl(x.tipo)) + '</span>' +
            '<span style="white-space:nowrap">previsti ' + esc(x.previsti) + ' · trovati <strong>' + esc(x.trovati) + '</strong> ' +
            '<span class="bx ' + (x.delta > 0 ? 'bwarn' : 'berr') + '">' + (x.delta > 0 ? '+' : '') + x.delta + '</span></span></div>';
        }).join('');
    }
    if (df.nonTrovati.length) {
      html += '<div style="font-size:12px;color:var(--r);margin-top:4px">Non trovati sul posto: ' + esc(df.nonTrovati.map(nomePresidioBuono).join('; ')) + '</div>';
    }
  }

  // Lavori fuori contratto
  html += titoletto('Lavori fuori contratto (da preventivare o fatturare a parte)');
  html += d.fuori.length
    ? '<ul style="margin:0;padding-left:18px;font-size:12px">' + d.fuori.map(function(f) { return '<li style="margin-bottom:3px">' + esc(f.testo) + '</li>'; }).join('') + '</ul>'
    : '<div style="font-size:12px;color:var(--g)">✓ Nessun lavoro fuori contratto.</div>';

  // Materiale e prezzi (DDT)
  html += titoletto('Materiale fornito (DDT dell\'intervento)');
  if (d.ddtErrore) {
    html += '<div style="font-size:12px;color:var(--m)">DDT non visibili per il tuo ruolo.</div>';
  } else if (!d.ddt.length) {
    html += '<div style="font-size:12px;color:var(--m)">Nessun DDT collegato all\'intervento.</div>';
  } else {
    html += d.ddt.map(function(dd) {
      return '<div style="background:var(--bg);border-radius:var(--rs);padding:8px;margin-bottom:6px">' +
        '<div style="font-size:12px;font-weight:600;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
          '<span>📦 DDT n. ' + esc(dd.numero || '—') + ' del ' + esc(fd(dd.data_emissione)) + '</span>' +
          (prezziVisibili ? '<span>' + esc(euroBuono(dd.totale)) + ' + IVA</span>' : '') + '</div>' +
        dd.righe.map(function(r) {
          return '<div style="font-size:12px;padding:3px 0;border-top:0.5px solid var(--bo)">' +
            '<div>' + esc(r.descrizione || '—') + ' · ' + esc(String(Number(r.quantita) || 0)) + ' ' + esc(r.um || '') +
            (prezziVisibili ? ' × ' + esc(euroBuono(r.prezzo_unitario)) : '') + '</div>' +
            (prezziVisibili && r._fonte ? '<div>' + htmlFontePrezzo(r._fonte) + '</div>' : '') + '</div>';
        }).join('') +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">' +
          '<button class="btn sm" data-id="' + esc(dd.id) + '" onclick="stampaDDT(this.dataset.id)">🖨️ PDF</button>' +
          ((ROLE === 'segreteria' || ROLE === 'titolare') ? '<button class="btn sm" data-id="' + esc(dd.id) + '" onclick="closeM(\'m-scheda\');modificaDDT(this.dataset.id)">✏️ Modifica DDT</button>' : '') +
        '</div></div>';
    }).join('');
    if (prezziVisibili && d.prezzi && !d.prezzi.preventivo) html += '<div style="font-size:11px;color:var(--m)">Contratto senza preventivo collegato: prezzi dal catalogo.</div>';
  }

  // Fatturazione
  html += titoletto('Fatturazione');
  const testoStato = {
    firmata: 'Firmato dal tecnico: la segreteria lo controlla e lo approva.',
    approvata: 'Approvato: da inviare al cliente o passare a fatturazione.',
    inviata_cliente: 'Inviato al cliente: da passare a fatturazione.',
    da_fatturare: '💜 Da fatturare: buono e DDT sono pronti per il contabile.',
    fatturata: '✅ Fatturato.'
  }[s.stato] || ('Stato: ' + String(s.stato || '—').replace(/_/g, ' '));
  html += '<div style="font-size:12px">' + bs(s.stato) + ' ' + esc(testoStato) + '</div>' +
    '<div style="font-size:11px;color:var(--m);margin-top:3px">La fattura si emette fuori dal gestionale finché il modulo Fatture non è pronto.</div>';

  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' +
    '<button class="btn sm" data-id="' + esc(s.id) + '" onclick="stampaRapportoIntervento(this.dataset.id)">📋 Scarica il buono (PDF)</button>' +
    (RUOLI_CREA_DDT_BUONO.includes(ROLE) && s.odl_id ? '<button class="btn sm" data-id="' + esc(s.id) + '" onclick="creaDDTDaBuono(this.dataset.id)">📦 Crea DDT per l\'intervento</button>' : '') +
    '</div></div>';
  box.innerHTML = html;
}

// ── PDF "Rapporto" (js/04): sezioni del buono di lavoro ───────────────────
async function sezioniBuonoLavoroPDF(doc, s, y, M, W) {
  const d = await datiBuonoLavoro(s);
  const pagina = function(spazio) { if (y + spazio > 275) { doc.addPage(); y = 20; } };
  const titolo = function(t) {
    pagina(14);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
    doc.text(t, M, y); y += 4;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  };
  const testo = function(t) {
    const righe = doc.splitTextToSize(t, W - M * 2);
    pagina(righe.length * 4 + 2);
    doc.setFontSize(9);
    doc.text(righe, M, y);
    y += righe.length * 4 + 2;
  };

  const df = d.diff;
  if (df.disponibile) {
    titolo('DIFFERENZE PRESIDI RISPETTO AL CONTRATTO');
    const fonte = df.fonte === 'audit' ? 'audit della prima manutenzione del ' + fd(df.dataAudit) : 'registro presidi del cliente';
    if (df.senzaNumeri) testo('Il contratto non indica i presidi previsti.');
    else if (!df.righe.length) testo('I presidi coincidono con il contratto (' + fonte + ').');
    else {
      doc.autoTable({
        startY: y,
        head: [['Tipo', 'Previsti', 'Trovati', 'Differenza']],
        body: df.righe.map(function(x) { return [nomeTipoPresidio(x.tipo), String(x.previsti), String(x.trovati), (x.delta > 0 ? '+' : '') + x.delta]; }),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [8, 80, 65], textColor: 255 },
        margin: { left: M, right: M }
      });
      y = doc.lastAutoTable.finalY + 3;
      testo('Trovati secondo: ' + fonte + '.');
    }
    if (df.nonTrovati.length) testo('Non trovati sul posto: ' + df.nonTrovati.map(nomePresidioBuono).join('; ') + '.');
    y += 2;
  }

  // Lo straordinario richiesto ha già il suo riquadro nel PDF.
  const fuori = d.fuori.filter(function(f) { return f.chiave !== 'straordinario'; });
  if (fuori.length) {
    titolo('LAVORI FUORI CONTRATTO (DA PREVENTIVARE O FATTURARE A PARTE)');
    fuori.forEach(function(f) { testo('- ' + f.testo); });
    y += 2;
  }

  const righe = [];
  d.ddt.forEach(function(dd) {
    dd.righe.forEach(function(r) { righe.push(['n. ' + (dd.numero || '—'), r.codice || '', r.descrizione || '', String(Number(r.quantita) || 0), r.um || '']); });
  });
  if (righe.length) {
    titolo('MATERIALE FORNITO (DDT)');
    doc.autoTable({
      startY: y,
      head: [['DDT', 'Codice', 'Descrizione', 'Q.tà', 'UM']],
      body: righe,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [8, 80, 65], textColor: 255 },
      columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 25 }, 3: { cellWidth: 15, halign: 'center' }, 4: { cellWidth: 15 } },
      margin: { left: M, right: M }
    });
    y = doc.lastAutoTable.finalY + 6;
  }
  return y;
}

// ── Workflow e Documenti: DDT e stato di fatturazione ─────────────────────
// Letture con molti id divise a blocchi (indirizzi delle richieste corti).
async function leggiABlocchi(ids, crea, dimensione) {
  const tutti = [];
  const unici = Array.from(new Set(ids.filter(Boolean)));
  const n = dimensione || 80;
  for (let i = 0; i < unici.length; i += n) {
    const { data, error } = await crea(unici.slice(i, i + n));
    if (error) return { errore: error.message, righe: tutti };
    tutti.push.apply(tutti, data || []);
  }
  return { righe: tutti };
}

const loadWorkflowPrimaBuono = loadWorkflow;
loadWorkflow = async function() {
  const r = await loadWorkflowPrimaBuono.apply(this, arguments);
  try { await decoraWorkflowBuoni(); } catch (e) { console.warn('Buoni nel workflow:', e); }
  return r;
};

async function decoraWorkflowBuoni() {
  const carte = [];
  ['list-f', 'list-a', 'list-i', 'list-d'].forEach(function(lista) {
    document.querySelectorAll('#' + lista + ' > .card').forEach(function(card) {
      const b = card.querySelector('button[onclick^="openScheda("]');
      const m = b && /openScheda\('([^']+)'\)/.exec(b.getAttribute('onclick'));
      if (m) carte.push({ card: card, id: m[1] });
    });
  });
  if (!carte.length) return;
  const ids = carte.map(function(c) { return c.id; });
  const rs = await leggiABlocchi(ids, function(b) {
    return db.from('schede_lavoro').select('id,odl_id,cliente_id,intervento_straordinario_richiesto,ordini_lavoro(tipo)').in('id', b);
  });
  if (rs.errore) return;
  const schede = {};
  rs.righe.forEach(function(s) { schede[s.id] = s; });
  const odlIds = rs.righe.map(function(s) { return s.odl_id; }).filter(Boolean);
  const cliIds = rs.righe.map(function(s) { return s.cliente_id; });
  const [rdOdl, rdSch, rc] = await Promise.all([
    leggiABlocchi(odlIds, function(b) { return db.from('ddt').select('id,numero,odl_id,scheda_lavoro_id').is('eliminato_il', null).in('odl_id', b); }),
    leggiABlocchi(ids, function(b) { return db.from('ddt').select('id,numero,odl_id,scheda_lavoro_id').is('eliminato_il', null).in('scheda_lavoro_id', b); }),
    leggiABlocchi(cliIds, function(b) { return db.from('clienti_periodicita').select('cliente_id').in('cliente_id', b); })
  ]);
  let ddt = null;
  if (!rdOdl.errore && !rdSch.errore) {
    const visti = {};
    ddt = rdOdl.righe.concat(rdSch.righe).filter(function(x) { if (visti[x.id]) return false; visti[x.id] = true; return true; });
  }
  const conContratto = {};
  if (!rc.errore) rc.righe.forEach(function(c) { conContratto[c.cliente_id] = true; });
  const totali = {};
  if (ddt && ddt.length && canSeePrezzi()) {
    const rr = await leggiABlocchi(ddt.map(function(x) { return x.id; }), function(b) {
      return db.from('ddt_righe').select('ddt_id,quantita,prezzo_unitario').in('ddt_id', b);
    });
    rr.righe.forEach(function(r) { totali[r.ddt_id] = (totali[r.ddt_id] || 0) + (Number(r.quantita) || 0) * (Number(r.prezzo_unitario) || 0); });
  }
  carte.forEach(function(c) {
    const s = schede[c.id];
    if (!s) return;
    const parti = [];
    if (ddt) {
      const suoi = ddt.filter(function(x) { return (s.odl_id && x.odl_id === s.odl_id) || x.scheda_lavoro_id === s.id; });
      parti.push(suoi.length
        ? suoi.map(function(x) { return '📦 DDT n. ' + esc(x.numero || '—') + (canSeePrezzi() ? ' (' + esc(euroBuono(totali[x.id] || 0)) + ')' : ''); }).join(' · ')
        : '<span style="color:var(--m)">📦 Nessun DDT</span>');
    }
    const avvisi = [];
    if (!rc.errore && !conContratto[s.cliente_id]) avvisi.push('cliente senza contratto');
    const tipo = s.ordini_lavoro && s.ordini_lavoro.tipo;
    if (tipo && tipo !== 'ordinario_programmato') avvisi.push(tl(tipo).toLowerCase());
    if (s.intervento_straordinario_richiesto) avvisi.push('straordinario da preventivare');
    if (avvisi.length) parti.push('<span style="color:var(--a)">⚠️ Fuori contratto: ' + esc(avvisi.join(', ')) + '</span>');
    if (!parti.length) return;
    const vecchio = c.card.querySelector('.buono-riepilogo');
    if (vecchio) vecchio.remove();
    const div = document.createElement('div');
    div.className = 'buono-riepilogo';
    div.style.cssText = 'font-size:12px;margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;overflow-wrap:anywhere';
    div.innerHTML = parti.join('<span style="color:var(--bo)">|</span>');
    const azioni = c.card.querySelector('button[onclick^="openScheda("]').parentElement;
    c.card.insertBefore(div, azioni);
  });
}

const loadDocsPrimaBuono = loadDocs;
loadDocs = async function() {
  const r = await loadDocsPrimaBuono.apply(this, arguments);
  try { await decoraDDTFatturazione(); } catch (e) { console.warn('DDT da fatturare:', e); }
  return r;
};

// Accanto alla causale del DDT: lo stato del buono di lavoro collegato.
async function decoraDDTFatturazione() {
  const righe = Array.prototype.slice.call(document.querySelectorAll('#dtbody tr[data-ddt-id]'));
  const odl = righe.map(function(tr) { return tr.dataset.ddtOdl; }).filter(Boolean);
  const sch = righe.map(function(tr) { return tr.dataset.ddtScheda; }).filter(Boolean);
  if (!odl.length && !sch.length) return;
  const filtri = [];
  if (odl.length) filtri.push('odl_id.in.(' + Array.from(new Set(odl)).join(',') + ')');
  if (sch.length) filtri.push('id.in.(' + Array.from(new Set(sch)).join(',') + ')');
  const { data, error } = await db.from('schede_lavoro').select('id,odl_id,stato,impossibilitato')
    .is('eliminato_il', null).not('impossibilitato', 'is', true).or(filtri.join(','));
  if (error) return;
  righe.forEach(function(tr) {
    const s = (data || []).find(function(x) { return (tr.dataset.ddtScheda && x.id === tr.dataset.ddtScheda) || (tr.dataset.ddtOdl && x.odl_id === tr.dataset.ddtOdl); });
    const td = tr.children[3];
    if (!s || !td || td.querySelector('.ddt-fatturazione')) return;
    const span = document.createElement('div');
    span.className = 'ddt-fatturazione';
    span.style.marginTop = '3px';
    span.innerHTML = '<span style="font-size:11px;color:var(--m)">Buono: </span>' + bs(s.stato);
    td.appendChild(span);
  });
}

// ── Ripartenza del ciclo: controlli scaduti da ripianificare ──────────────
async function leggiTuttoBuono(query, max) {
  const tutti = [];
  for (let da = 0; da < (max || 5000); da += 1000) {
    const { data, error } = await query().range(da, da + 999);
    if (error) return { errore: error.message, righe: tutti };
    tutti.push.apply(tutti, data || []);
    if (!data || data.length < 1000) break;
  }
  return { righe: tutti };
}

// Clienti da ripianificare: controlli del piano dei mesi passati mai
// schedulati (e non fatti dopo), presidi scaduti o in scadenza entro
// GIORNI_PREAVVISO_CONTROLLI giorni; esclusi i clienti con una
// manutenzione ordinaria già aperta (da pianificare o pianificata) e,
// per i soli presidi, quelli già nel piano del mese corrente.
async function controlliDaRipianificare() {
  const oggi = dataLocaleISO(new Date());
  const mese = meseCorrenteISO();
  const dodici = new Date();
  dodici.setDate(1);
  dodici.setMonth(dodici.getMonth() - 12);
  const meseMinimo = dataLocaleISO(dodici).slice(0, 7);
  const limite = typeof aggiungiGiorniISO === 'function' ? aggiungiGiorniISO(oggi, GIORNI_PREAVVISO_CONTROLLI) : oggi;
  const [rArr, rPres, rAperti, rMese] = await Promise.all([
    leggiTuttoBuono(function() {
      return db.from('cicli_pianificati').select('cliente_id,tipo_presidio,data_prevista,mese_anno,clienti(ragione_sociale,eliminato_il)')
        .eq('stato', 'pianificato').is('odl_id', null).lt('mese_anno', mese).gte('mese_anno', meseMinimo).order('data_prevista');
    }),
    leggiTuttoBuono(function() {
      return db.from('impianti').select('cliente_id,tipo,data_prossimo_controllo,clienti(ragione_sociale,eliminato_il)')
        .is('eliminato_il', null).not('data_prossimo_controllo', 'is', null).lte('data_prossimo_controllo', limite).order('data_prossimo_controllo');
    }, 10000),
    leggiTuttoBuono(function() {
      return db.from('ordini_lavoro').select('cliente_id').is('eliminato_il', null)
        .eq('tipo', 'ordinario_programmato').in('stato', ['da_pianificare', 'pianificato']).order('id');
    }),
    leggiTuttoBuono(function() {
      return db.from('cicli_pianificati').select('cliente_id').eq('stato', 'pianificato').is('odl_id', null).eq('mese_anno', mese).order('id');
    })
  ]);
  if (rArr.errore && rPres.errore) return { errore: rArr.errore };
  const aperti = {}, nelMese = {};
  (rAperti.righe || []).forEach(function(o) { aperti[o.cliente_id] = true; });
  (rMese.righe || []).forEach(function(c) { nelMese[c.cliente_id] = true; });
  const clienti = {};
  const prendi = function(id, cli) {
    if (!clienti[id]) clienti[id] = { cliente_id: id, ragione_sociale: (cli && cli.ragione_sociale) || 'Cliente', arretrati: [], scaduti: 0, primaScaduta: null, inScadenza: 0, primaInScadenza: null, tipi: {} };
    return clienti[id];
  };
  (rArr.righe || []).forEach(function(c) {
    if (aperti[c.cliente_id] || (c.clienti && c.clienti.eliminato_il)) return;
    prendi(c.cliente_id, c.clienti).arretrati.push(c);
  });
  // Controlli arretrati già fatti dopo (intervento completato non collegato al piano): non contano.
  const conArretrati = Object.keys(clienti);
  if (conArretrati.length) {
    const minimo = Object.keys(clienti).reduce(function(m, id) {
      return clienti[id].arretrati.reduce(function(mm, c) { return c.mese_anno < mm ? c.mese_anno : mm; }, m);
    }, mese);
    const rFatti = await leggiABlocchi(conArretrati, function(blocco) {
      return db.from('ordini_lavoro').select('cliente_id,data_pianificata').is('eliminato_il', null)
        .eq('tipo', 'ordinario_programmato').eq('stato', 'completato').in('cliente_id', blocco)
        .gte('data_pianificata', minimo + '-01');
    }, 20);
    const ultimo = {};
    (rFatti.righe || []).forEach(function(o) { if (!ultimo[o.cliente_id] || o.data_pianificata > ultimo[o.cliente_id]) ultimo[o.cliente_id] = o.data_pianificata; });
    conArretrati.forEach(function(id) {
      const u = ultimo[id];
      if (u) clienti[id].arretrati = clienti[id].arretrati.filter(function(c) { return meseDiData(u) < c.mese_anno; });
    });
  }
  (rPres.righe || []).forEach(function(p) {
    if (aperti[p.cliente_id] || nelMese[p.cliente_id] || (p.clienti && p.clienti.eliminato_il)) return;
    const g = prendi(p.cliente_id, p.clienti);
    g.tipi[p.tipo] = true;
    if (p.data_prossimo_controllo < oggi) {
      g.scaduti++;
      if (!g.primaScaduta) g.primaScaduta = p.data_prossimo_controllo;
    } else {
      g.inScadenza++;
      if (!g.primaInScadenza) g.primaInScadenza = p.data_prossimo_controllo;
    }
  });
  const lista = Object.keys(clienti).map(function(id) { return clienti[id]; })
    .filter(function(g) { return g.arretrati.length || g.scaduti || g.inScadenza; })
    .map(function(g) {
      g.urgenza = [g.arretrati.length ? g.arretrati[0].data_prevista : null, g.primaScaduta, g.primaInScadenza].filter(Boolean).sort()[0] || oggi;
      return g;
    })
    .sort(function(a, b) { return a.urgenza < b.urgenza ? -1 : a.urgenza > b.urgenza ? 1 : a.ragione_sociale.localeCompare(b.ragione_sociale); });
  return { lista: lista, oggi: oggi, mese: mese };
}

function htmlMotiviRipartenza(g) {
  const righe = [];
  if (g.arretrati.length) {
    const perMese = {};
    g.arretrati.forEach(function(c) { (perMese[c.mese_anno] = perMese[c.mese_anno] || {})[c.tipo_presidio] = true; });
    righe.push('<div style="font-size:12px;color:var(--r)">⏰ Controlli del piano non fatti: ' + esc(Object.keys(perMese).sort().map(function(m) {
      return nomeMese(m) + ' (' + Object.keys(perMese[m]).map(function(t) { return nomeTipoPresidio(t).toLowerCase(); }).join(', ') + ')';
    }).join('; ')) + '</div>');
  }
  if (g.scaduti) righe.push('<div style="font-size:12px;color:var(--r)">🧯 ' + g.scaduti + (g.scaduti === 1 ? ' presidio scaduto' : ' presidi scaduti') + ' (dal ' + esc(fd(g.primaScaduta)) + ')</div>');
  if (g.inScadenza) righe.push('<div style="font-size:12px;color:var(--a)">🧯 ' + g.inScadenza + (g.inScadenza === 1 ? ' presidio in scadenza' : ' presidi in scadenza') + ' (dal ' + esc(fd(g.primaInScadenza)) + ')</div>');
  const tipi = Object.keys(g.tipi);
  if (tipi.length) righe.push('<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">' + tipi.map(function(t) { return '<span style="background:var(--bl);color:var(--b);padding:2px 8px;border-radius:10px;font-size:11px">' + esc(tpl(t)) + '</span>'; }).join('') + '</div>');
  return righe.join('');
}

// Dashboard del capo tecnico (Responsabile Service).
async function caricaControlliDaRipianificareDashboard() {
  const box = ge('ct-ripartenza');
  if (!box) return;
  if (!RUOLI_RIPARTENZA.includes(ROLE)) { box.innerHTML = ''; return; }
  const ris = await controlliDaRipianificare();
  if (ris.errore) { console.warn('Controlli da ripianificare:', ris.errore); box.innerHTML = ''; return; }
  const lista = ris.lista;
  const MAX = 25;
  let corpo;
  if (!lista.length) {
    corpo = '<div class="ct-empty">✅ Nessun controllo scaduto da ripianificare</div>';
  } else {
    corpo = '<div style="font-size:12px;color:var(--m);margin-bottom:6px">Clienti con controlli del piano mai schedulati o presidi scaduti o in scadenza entro ' + GIORNI_PREAVVISO_CONTROLLI + ' giorni, senza una manutenzione ordinaria aperta. Schedulando, i controlli del piano si collegano all\'intervento e la segreteria fissa l\'appuntamento con il cliente.</div>' +
      lista.slice(0, MAX).map(function(g) {
        return '<div style="padding:10px 0;border-bottom:0.5px solid var(--bo);overflow-wrap:anywhere">' +
          '<div style="font-size:13px;font-weight:600">' + esc(g.ragione_sociale) + '</div>' +
          htmlMotiviRipartenza(g) +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
            '<button class="btn sm p" data-cli="' + esc(g.cliente_id) + '" onclick="schedulaRipartenzaDashboard(this.dataset.cli)">+ Schedula intervento</button>' +
            '<button class="btn sm" data-cli="' + esc(g.cliente_id) + '" onclick="apriContrattoCliente(this.dataset.cli)">Apri cliente</button>' +
          '</div></div>';
      }).join('') +
      (lista.length > MAX ? '<div style="font-size:12px;color:var(--m);margin-top:8px">e altri ' + (lista.length - MAX) + ' clienti: li trovi nel Piano mensile.</div>' : '');
  }
  box.innerHTML = '<div class="ct-section-title">🔁 Controlli scaduti: da ripianificare' + (lista.length ? ' (' + lista.length + ')' : '') + '</div>' +
    '<div class="ct-pane">' + corpo + '</div>';
}

async function schedulaRipartenzaDashboard(cliId) {
  await creaOdlDaCiclo(cliId, meseCorrenteISO());
  const n = ge('mo6');
  if (n) n.value = 'Controlli periodici scaduti — ripartenza del ciclo';
}

// Collega i controlli del piano ancora da schedulare del cliente, fino al
// mese dell'intervento, all'intervento appena creato.
async function collegaCicliAlIntervento(cliId, odlId, meseMax) {
  if (!cliId || !odlId || !meseMax) return 0;
  const { data, error } = await db.from('cicli_pianificati').update({ odl_id: odlId })
    .eq('cliente_id', cliId).eq('stato', 'pianificato').is('odl_id', null).lte('mese_anno', meseMax).select('id');
  if (error) { console.warn('Collegamento controlli del piano:', error.message); return 0; }
  return (data || []).length;
}

async function idManutenzioniAperte(cliId) {
  const { data } = await db.from('ordini_lavoro').select('id').eq('cliente_id', cliId).is('eliminato_il', null)
    .eq('tipo', 'ordinario_programmato').in('stato', ['da_pianificare', 'pianificato']);
  return (data || []).map(function(o) { return o.id; });
}

const creaOdlDaCicloPrimaBuono = creaOdlDaCiclo;
creaOdlDaCiclo = async function(cliId) {
  const r = await creaOdlDaCicloPrimaBuono.apply(this, arguments);
  collegaCicliDopoSalvataggio = cliId ? { cli: cliId } : null;
  return r;
};

const openMPrimaBuono = openM;
openM = function(id) {
  if (id === 'm-odl') collegaCicliDopoSalvataggio = null; // creaOdlDaCiclo lo rimette dopo l'apertura
  return openMPrimaBuono.apply(this, arguments);
};

const saveOdlPrimaBuono = saveOdl;
saveOdl = async function() {
  const p = collegaCicliDopoSalvataggio;
  const editId = (ge('mcli-odl-id') || {}).value;
  if (!p || editId || v('mo1') !== p.cli || v('mo2') !== 'ordinario_programmato' || !v('mo3')) {
    return saveOdlPrimaBuono.apply(this, arguments);
  }
  const meseMax = meseDiData(v('mo3'));
  const prima = await idManutenzioniAperte(p.cli);
  const r = await saveOdlPrimaBuono.apply(this, arguments);
  if (ge('m-odl') && ge('m-odl').classList.contains('on')) return r; // non salvato
  collegaCicliDopoSalvataggio = null;
  const nuovo = (await idManutenzioniAperte(p.cli)).find(function(id) { return prima.indexOf(id) === -1; });
  if (nuovo) {
    const n = await collegaCicliAlIntervento(p.cli, nuovo, meseMax);
    if (n) toast('Collegati all\'intervento ' + n + (n === 1 ? ' controllo' : ' controlli') + ' del piano', 'ok');
    if (ROLE === 'capo_tecnico' && ge('pg-dashboard') && ge('pg-dashboard').classList.contains('on')) {
      try { await loadDashCapoTecnico('ct-cicli-mese'); await caricaControlliDaRipianificareDashboard(); } catch (e) { console.warn(e); }
    }
  }
  return r;
};

// Piano mensile: in testa al mese corrente i controlli da ripianificare.
const loadPianificazioneMensilePrimaBuono = loadPianificazioneMensile;
loadPianificazioneMensile = async function(anno, mese) {
  const r = await loadPianificazioneMensilePrimaBuono.apply(this, arguments);
  try { await mostraRipartenzaPianoMensile(anno, mese); } catch (e) { console.warn('Ripartenza nel Piano mensile:', e); }
  return r;
};

async function mostraRipartenzaPianoMensile(anno, mese) {
  const el = ge('piano-mensile-content');
  if (!el || !RUOLI_RIPARTENZA.includes(ROLE)) return;
  const meseStr = anno + '-' + String(mese).padStart(2, '0');
  if (meseStr !== meseCorrenteISO()) return;
  const ris = await controlliDaRipianificare();
  if (ris.errore || !ris.lista.length) return;
  const vecchio = ge('piano-ripartenza');
  if (vecchio) vecchio.remove();
  const tecOpt = '<option value="">— Nessun tecnico —</option>' + (_pianoTecnici || []).map(function(t) {
    return '<option value="' + esc(t.id) + '">' + esc(t.nome) + ' ' + esc(t.cognome) + '</option>';
  }).join('');
  const html = '<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--r);margin-bottom:6px">🔁 Controlli scaduti da ripianificare (' + ris.lista.length + ' clienti)</div>' +
    '<div style="font-size:12px;color:var(--m);margin-bottom:12px">Controlli del piano dei mesi passati mai schedulati, presidi scaduti o in scadenza entro ' + GIORNI_PREAVVISO_CONTROLLI + ' giorni. Schedulando, i controlli del piano del cliente fino al mese dell\'intervento si collegano all\'intervento.</div>' +
    ris.lista.map(function(g) {
      const id = esc(g.cliente_id);
      return '<div class="card" style="margin-bottom:10px;border-left:3px solid var(--r);overflow-wrap:anywhere">' +
        '<div style="font-size:14px;font-weight:600;margin-bottom:4px">' + esc(g.ragione_sociale) + '</div>' +
        htmlMotiviRipartenza(g) +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;align-items:end;margin-top:10px">' +
          '<div><label style="font-size:11px;color:var(--m)" for="rip-d-' + id + '">Data</label>' +
            '<input type="date" id="rip-d-' + id + '" value="' + esc(ris.oggi) + '" style="width:100%;font-size:13px"></div>' +
          '<div><label style="font-size:11px;color:var(--m)" for="rip-t-' + id + '">Tecnico</label>' +
            '<select id="rip-t-' + id + '" style="width:100%;font-size:13px">' + tecOpt + '</select></div>' +
          '<button class="btn p" style="white-space:nowrap" data-cli="' + id + '" onclick="schedulaRipartenzaPiano(this.dataset.cli)">✅ Schedula</button>' +
        '</div></div>';
    }).join('') + '<div style="height:10px"></div>';
  const div = document.createElement('div');
  div.id = 'piano-ripartenza';
  div.innerHTML = html;
  el.insertBefore(div, el.firstChild);
}

async function schedulaRipartenzaPiano(cliId) {
  const data = v('rip-d-' + cliId);
  const tecId = v('rip-t-' + cliId);
  if (!data) { toast('Inserisci la data intervento', 'err'); return; }
  const r = await db.from('ordini_lavoro').insert({
    cliente_id: cliId,
    tipo: 'ordinario_programmato',
    data_pianificata: data,
    tecnico_id: tecId || null,
    stato: 'pianificato',
    note_per_tecnico: 'Controlli periodici scaduti — ripartenza del ciclo'
  }).select('id').single();
  if (r.error) { toast('Errore: ' + r.error.message, 'err'); return; }
  const n = await collegaCicliAlIntervento(cliId, r.data.id, meseDiData(data));
  toast('✅ Intervento schedulato' + (tecId ? ' e assegnato al tecnico' : '') + (n ? ' · collegati ' + n + (n === 1 ? ' controllo' : ' controlli') + ' del piano' : ''), 'ok');
  const oggi = new Date();
  await loadPianificazioneMensile(oggi.getFullYear(), oggi.getMonth() + 1);
}
