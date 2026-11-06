// ── F14.16 — UNA SCHEDA PER OGGETTO CON "COLLEGATI" ─────────────────
// Parte comune delle schede di dettaglio (preventivo, commessa, progetto
// tecnico, cliente; ogni oggetto nuovo la usa, regola in CLAUDE.md):
//   caricaSchedaOggetto(oggetto, record, contenitoreId)
// disegna nel contenitore (in cima alla scheda, sotto il titolo):
// 1. INTESTAZIONE: stato (se il titolo della pagina non lo mostra già) e
//    scadenza dell'oggetto;
// 2. "Cosa puoi fare": i pulsanti calcolati da
//      azioniScheda(oggetto, record, ruolo)
//    SOLO da oggetto, ruolo effettivo e stato (mai dalla pagina da cui si
//    arriva: dashboard, cliente, ricerca, avviso danno gli stessi
//    pulsanti). Per gli oggetti del motore unico (js/61, sql/68) sono le
//    azioni di azioniDisponibili(oggetto, ruolo, stato); per gli oggetti di
//    prima (preventivi, commesse, progetti, clienti, che hanno le loro RPC)
//    sono le righe di AZIONI_SCHEDA qui sotto, che richiamano le stesse
//    finestre dei bottoni già presenti nella scheda (il database ricontrolla
//    sempre). Ogni pulsante ha data-azione-scheda="<codice>" (lo legge il
//    test test/scheda-oggetto.spec.js);
// 3. riquadro "🔗 Collegati": cliente, sede, progetto, preventivi (anche
//    gli altri dello stesso progetto: revisioni e integrativi), commessa,
//    ordini ai fornitori, cantiere, POS, documenti finali, fatture, ticket.
//    Ogni riga apre la scheda con il suo indirizzo (apriRottaScheda, js/47)
//    se il ruolo ha la pagina; le righe che il ruolo non legge (RLS) non ci
//    sono. Un modulo nuovo aggiunge una riga con
//      registraFonteCollegati(oggetto, { id, icona, titolo, leggi })
//    (leggi(record, contesto) → elenco di { oggetto, id, testo, sotto } o
//    null se la fonte non è attiva);
// 4. "🕘 Storico" (si apre a richiesta): per il titolare il registro delle
//    azioni (registro_azioni, sql/67: chi, quando, cosa è cambiato; oggi
//    preventivi e progetti tecnici), per tutti i passaggi di stato della
//    commessa (commesse_storico) e del motore (motore_azioni_storico).
// Le domande (❓, js/62) restano nel loro riquadro della scheda.
// Nessun SQL nuovo: legge solo tabelle che il ruolo già legge.

const SCHEDA_OGGETTO = { aperte: {}, fonti: {}, azioni: {} };

const TABELLA_OGGETTO_SCHEDA = {
  preventivo: 'preventivi', commessa: 'commesse', progetto: 'progetti_tecnici', cliente: 'clienti'
};

const NOMI_STATO_SCHEDA = {
  preventivo: {
    bozza: 'Bozza', inviato: 'Inviato', inviato_a_rappresentante: 'Inviato al rappresentante',
    in_attesa_anticipo: 'Accettato, in attesa anticipo', accettato: 'Accettato', rifiutato: 'Rifiutato', scaduto: 'Scaduto'
  },
  commessa: {
    approvata: 'Approvata', materiali_ordinati: 'Materiali ordinati', in_preparazione: 'In preparazione', pronta: 'Pronta',
    in_corso: 'In corso', fine_lavori: 'Fine lavori', chiusa: 'Chiusa', annullata: 'Annullata'
  },
  progetto: {
    bozza: 'Bozza', in_verifica_tecnica: 'In verifica tecnica', da_integrare: 'Integrazione richiesta',
    inviato_a_commerciale: 'Inviato al commerciale', pronto_per_preventivo: 'Pronto per il preventivo',
    in_preventivazione: 'In preventivazione', in_valutazione: 'In valutazione', archiviato: 'Archiviato'
  },
  cliente: { attivo: 'Attivo', prospect: 'Prospect', lead: 'Lead', sospeso: 'Sospeso', cessato: 'Cessato' }
};

function nomeStatoScheda(oggetto, stato) {
  if (MOTORE_AZIONI_ATTIVO_PER(oggetto)) return nomeStatoMotore(TABELLA_OGGETTO_SCHEDA[oggetto] || oggetto, stato);
  return ((NOMI_STATO_SCHEDA[oggetto] || {})[stato]) || (stato ? String(stato).replace(/_/g, ' ') : '—');
}

// Oggetto gestito dal motore unico (js/61)?
function MOTORE_AZIONI_ATTIVO_PER(oggetto) {
  if (typeof MOTORE_AZIONI === 'undefined') return false;
  const tabella = TABELLA_OGGETTO_SCHEDA[oggetto] || oggetto;
  return !!MOTORE_AZIONI.oggetti[tabella];
}

function dataScheda(valore) {
  if (!valore) return '';
  const d = new Date(String(valore).length === 10 ? valore + 'T00:00:00' : valore);
  return isNaN(d) ? String(valore) : d.toLocaleDateString('it-IT');
}

function dataOraScheda(valore) {
  if (!valore) return '';
  const d = new Date(valore);
  return isNaN(d) ? String(valore) : d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function oggiISOScheda() {
  return typeof dataLocaleISO === 'function' ? dataLocaleISO(new Date()) : new Date().toISOString().slice(0, 10);
}

// ── Azioni ───────────────────────────────────────────────────────────
// Una riga: { codice, etichetta, ruoli (null = tutti), stati (null = ogni
// stato), quando(record) facoltativa, esegui(record), principale }.
function registraAzioneScheda(oggetto, azione) {
  if (!oggetto || !azione || !azione.codice) return;
  (SCHEDA_OGGETTO.azioni[oggetto] = SCHEDA_OGGETTO.azioni[oggetto] || []).push(azione);
}

function statoRecordScheda(oggetto, record) {
  if (!record) return null;
  return record.stato == null ? '' : String(record.stato);
}

// Elenco delle azioni del ruolo sull'oggetto nel suo stato. Funzione pura
// di oggetto, record (stato e dati) e ruolo: la pagina di provenienza non
// conta.
function azioniScheda(oggetto, record, ruolo) {
  ruolo = ruolo || ROLE;
  if (!record || !ruolo) return [];
  const stato = statoRecordScheda(oggetto, record);
  if (MOTORE_AZIONI_ATTIVO_PER(oggetto)) {
    const tabella = TABELLA_OGGETTO_SCHEDA[oggetto] || oggetto;
    return azioniDisponibili(tabella, ruolo, stato).map(function(t) {
      return {
        codice: 'motore:' + t.azione, etichetta: t.etichetta, principale: t.ordine <= 10,
        esegui: function() { return apriAzioneMotore(tabella, record.id, t.azione, stato); }
      };
    });
  }
  return (SCHEDA_OGGETTO.azioni[oggetto] || []).filter(function(a) {
    if (a.ruoli && a.ruoli.indexOf(ruolo) < 0) return false;
    if (a.stati && a.stati.indexOf(stato) < 0) return false;
    if (typeof a.quando === 'function') {
      try { return !!a.quando(record, ruolo); } catch (e) { return false; }
    }
    return true;
  });
}

function htmlAzioniScheda(oggetto, record, ruolo) {
  const azioni = azioniScheda(oggetto, record, ruolo);
  if (!azioni.length) return '';
  return '<div class="so-azioni">' +
    '<span class="so-etichetta">Cosa puoi fare</span>' +
    azioni.map(function(a) {
      return '<button type="button" class="btn sm' + (a.principale ? ' p' : '') + '" data-azione-scheda="' + esc(a.codice) + '"' +
        ' data-oggetto="' + esc(oggetto) + '" onclick="clicAzioneScheda(this)">' + esc(a.etichetta) + '</button>';
    }).join('') +
  '</div>';
}

function clicAzioneScheda(btn) {
  const oggetto = btn.dataset.oggetto;
  const aperta = SCHEDA_OGGETTO.aperte[oggetto];
  if (!aperta || !aperta.record) return;
  const azione = azioniScheda(oggetto, aperta.record).find(function(a) { return a.codice === btn.dataset.azioneScheda; });
  if (!azione) { toast('Azione non più disponibile: ricarica la scheda', 'err'); return; }
  try {
    const r = azione.esegui(aperta.record);
    if (r && typeof r.catch === 'function') r.catch(function(e) { toast('Errore: ' + (e.message || e), 'err'); });
  } catch (e) { toast('Errore: ' + (e.message || e), 'err'); }
}

// Porta a un riquadro della scheda (e al suo tab) evidenziandolo.
function vaiRiquadroScheda(id, tabBottone) {
  if (tabBottone) {
    const t = document.querySelector(tabBottone);
    if (t) t.click();
  }
  const el = ge(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('so-evidenzia');
  setTimeout(function() { el.classList.remove('so-evidenzia'); }, 1600);
  if (/^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName)) el.focus();
}

function domandeAttiveScheda() {
  return typeof DOMANDE !== 'undefined' && DOMANDE.disponibili === true && typeof apriNuovaDomanda === 'function';
}

// Preventivo (le stesse finestre dei bottoni della scheda, js/18, js/44)
registraAzioneScheda('preventivo', {
  codice: 'esito_accettato', etichetta: '✅ Accettato dal cliente', principale: true,
  ruoli: ['rappresentante', 'titolare'], stati: ['inviato_a_rappresentante', 'inviato'],
  quando: function(p) { return 'allegato_accettazione_path' in p; },
  esegui: function(p) { return apriEsitoPreventivo(p.id, 'accettato', String(p.numero || '')); }
});
registraAzioneScheda('preventivo', {
  codice: 'esito_rifiutato', etichetta: '❌ Rifiutato dal cliente',
  ruoli: ['rappresentante', 'titolare'], stati: ['inviato_a_rappresentante', 'inviato'],
  quando: function(p) { return 'allegato_accettazione_path' in p; },
  esegui: function(p) { return apriEsitoPreventivo(p.id, 'rifiutato', String(p.numero || '')); }
});
registraAzioneScheda('preventivo', {
  codice: 'rimanda_indietro', etichetta: '↩ Rimanda indietro',
  ruoli: ['commerciale', 'titolare'], stati: ['bozza'],
  quando: function(p) { return !!p.progetto_tecnico_id; },
  esegui: function() { return apriRimandaPreventivoAvviato(); }
});
registraAzioneScheda('preventivo', {
  codice: 'rimanda_commerciale', etichetta: '↩ Rimanda al commerciale',
  ruoli: ['titolare'], stati: ['inviato_a_rappresentante'],
  esegui: function() { vaiRiquadroScheda('pvd-nota-rinvio-titolare', '#pg-preventivo-detail .tabs .tab'); }
});
registraAzioneScheda('preventivo', {
  codice: 'preventivo_cliente', etichetta: '💶 Voci e PDF per il cliente',
  ruoli: ['commerciale', 'titolare'],
  esegui: function() {
    const t = Array.from(document.querySelectorAll('#pg-preventivo-detail .tabs .tab')).find(function(b) { return /pvd-costi/.test(b.getAttribute('onclick') || ''); });
    if (t) t.click();
  }
});
registraAzioneScheda('preventivo', {
  codice: 'anticipo', etichetta: '🧾 Fattura e accredito d\'anticipo', principale: true,
  ruoli: ['segreteria', 'titolare'], stati: ['in_attesa_anticipo'],
  esegui: function() { vaiRiquadroScheda('pvd-riepilogo-content', '#pg-preventivo-detail .tabs .tab'); }
});
registraAzioneScheda('preventivo', {
  codice: 'stato_commessa', etichetta: '📋 Stato e storico della commessa',
  ruoli: ['titolare', 'segreteria', 'commerciale', 'capo_tecnico', 'rappresentante'], stati: ['accettato'],
  quando: function(p) { return !!(p._commessa && p._commessa.id) && typeof statiCommessaDisponibili !== 'undefined' && statiCommessaDisponibili === true; },
  esegui: function(p) { return apriStatoCommessa(p._commessa.id, p.id); }
});
registraAzioneScheda('preventivo', {
  codice: 'domanda', etichetta: '❓ Fai una domanda',
  quando: function() { return domandeAttiveScheda(); },
  esegui: function(p) { return apriNuovaDomanda('preventivi', p.id, 'pvd-domande'); }
});

// Commessa (js/18 stato e sede, js/32 cantiere, js/62 domande)
registraAzioneScheda('commessa', {
  codice: 'stato_commessa', etichetta: '📋 Stato e storico', principale: true,
  ruoli: ['titolare', 'segreteria', 'commerciale', 'capo_tecnico', 'rappresentante'],
  quando: function() { return typeof statiCommessaDisponibili !== 'undefined' && statiCommessaDisponibili === true; },
  esegui: function(c) { return apriStatoCommessa(c.id, c.preventivo_id); }
});
registraAzioneScheda('commessa', {
  codice: 'sede', etichetta: '📍 Sede del cantiere',
  ruoli: ['titolare', 'segreteria', 'rappresentante'],
  quando: function(c) { return commessaAperta(c); },
  esegui: function(c) { return apriSceltaSedeCommessa(c.id, c.cliente_id, c.preventivo_id, c.sede_id || ''); }
});
registraAzioneScheda('commessa', {
  codice: 'cantiere', etichetta: '🏗️ Scheda cantiere',
  quando: function() { return typeof mostraTabCommessa === 'function'; },
  esegui: function() { mostraTabCommessa('cantiere'); }
});
registraAzioneScheda('commessa', {
  codice: 'domanda', etichetta: '❓ Fai una domanda',
  quando: function() { return domandeAttiveScheda(); },
  esegui: function(c) { mostraTabCommessa('commessa'); return apriNuovaDomanda('commesse', c.id, 'cmd-domande'); }
});

// Progetto tecnico (js/17). "Modifica" resta il bottone del titolo
// (pd-btn-modifica, rappresentante): qui non si ripete.
registraAzioneScheda('progetto', {
  codice: 'domanda', etichetta: '❓ Fai una domanda',
  quando: function() { return domandeAttiveScheda(); },
  esegui: function(p) { return apriNuovaDomanda('progetti_tecnici', p.id, 'pd-domande'); }
});

// Cliente (js/09): "+ Nuovo presidio", "🔗 Link cliente" e "🔄 Nuovo link"
// restano i bottoni del titolo della scheda, già per ruolo; qui nessuna
// riga finché il cliente non ha azioni sue (le domande sul cliente
// richiedono una riga in RECORD_DOMANDA di js/62 e nel vincolo di sql/70).

// ── Collegati ────────────────────────────────────────────────────────
function registraFonteCollegati(oggetto, fonte) {
  if (!oggetto || !fonte || !fonte.id || typeof fonte.leggi !== 'function') return;
  const elenco = SCHEDA_OGGETTO.fonti[oggetto] = SCHEDA_OGGETTO.fonti[oggetto] || [];
  if (elenco.some(function(f) { return f.id === fonte.id; })) return;
  elenco.push(fonte);
}

// Il ruolo apre la scheda di questo oggetto? (pagine del ruolo, js/47)
function collegatoApribile(oggetto) {
  if (typeof SCHEDE_CON_INDIRIZZO === 'undefined' || !SCHEDE_CON_INDIRIZZO[oggetto]) return false;
  const pagina = paginaSchedaConIndirizzo(SCHEDE_CON_INDIRIZZO[oggetto]);
  return !!pagina && canAccessPage(pagina);
}

async function apriCollegatoScheda(oggetto, id) {
  if (!oggetto || !id) return;
  await apriRottaScheda({ tipo: 'rotta', oggetto: oggetto, id: String(id), rotta: '/' + oggetto + '/' + id });
}

function clicCollegato(btn) {
  return apriCollegatoScheda(btn.dataset.oggetto, btn.dataset.id);
}

// Lettura che non ferma il riquadro: errore o tabella assente = null.
async function leggiCollegati(richiesta) {
  try {
    const r = await richiesta;
    if (r.error) return null;
    return r.data || [];
  } catch (e) { return null; }
}

function righeOMancante(dati, fn) {
  if (dati === null) return null;
  return (dati || []).map(fn).filter(Boolean);
}

const MAX_RIGHE_COLLEGATI = 8;

// Contesto letto una volta per scheda: commessa del preventivo, commesse
// del progetto... (lo usano più fonti).
async function commesseDelRecord(oggetto, record, ctx) {
  if (ctx.commesse) return ctx.commesse;
  let q = null;
  if (oggetto === 'commessa') ctx.commesse = [record];
  else if (oggetto === 'preventivo') {
    const dirette = await leggiCollegati(db.from('commesse').select('id,codice,stato,titolo,preventivo_id').eq('preventivo_id', record.id));
    let extra = null;
    if (typeof verificaLavoriExtraDisponibili === 'function' && (await verificaLavoriExtraDisponibili())) {
      extra = await leggiCollegati(db.from('commesse_lavori_extra').select('numero, commesse(id,codice,stato,titolo,preventivo_id)').eq('preventivo_id', record.id));
    }
    const tutte = (dirette || []).slice();
    (extra || []).forEach(function(e) { if (e.commesse && !tutte.some(function(c) { return c.id === e.commesse.id; })) tutte.push(Object.assign({ _extra: e.numero }, e.commesse)); });
    ctx.commesse = dirette === null && extra === null ? null : tutte;
  } else if (oggetto === 'progetto') {
    const dirette = await leggiCollegati(db.from('commesse').select('id,codice,stato,titolo,preventivo_id').eq('progetto_tecnico_id', record.id));
    let extra = null;
    if (typeof verificaLavoriExtraDisponibili === 'function' && (await verificaLavoriExtraDisponibili())) {
      extra = await leggiCollegati(db.from('commesse_lavori_extra').select('numero, commesse(id,codice,stato,titolo,preventivo_id)').eq('progetto_tecnico_id', record.id));
    }
    const tutte = (dirette || []).slice();
    (extra || []).forEach(function(e) { if (e.commesse && !tutte.some(function(c) { return c.id === e.commesse.id; })) tutte.push(Object.assign({ _extra: e.numero }, e.commesse)); });
    ctx.commesse = dirette === null && extra === null ? null : tutte;
  } else if (oggetto === 'cliente') {
    q = db.from('commesse').select('id,codice,stato,titolo,preventivo_id').eq('cliente_id', record.id).order('creato_il', { ascending: false }).limit(50);
    ctx.commesse = await leggiCollegati(q);
  }
  return ctx.commesse;
}

function idClienteRecord(oggetto, record) {
  return oggetto === 'cliente' ? record.id : record.cliente_id;
}

function rigaCommessaCollegata(c) {
  return {
    oggetto: 'commessa', id: c.id, testo: 'Commessa ' + (c.codice || ''),
    sotto: [nomeStatoScheda('commessa', c.stato), c._extra ? 'lavoro extra n. ' + c._extra : '', c.titolo].filter(Boolean).join(' · ')
  };
}

function rigaPreventivoCollegato(p, attuale) {
  return {
    oggetto: 'preventivo', id: p.id, testo: 'Preventivo n. ' + (p.numero != null ? p.numero : '—') + (attuale ? ' (questo)' : ''),
    sotto: [nomeStatoScheda('preventivo', p.stato), p.data_emissione ? dataScheda(p.data_emissione) : '',
      p.totale_imponibile != null && typeof euroPreventivo === 'function' ? euroPreventivo(p.totale_imponibile) + ' + IVA' : ''].filter(Boolean).join(' · '),
    attuale: !!attuale
  };
}

// Cliente
['preventivo', 'commessa', 'progetto'].forEach(function(oggetto) {
  registraFonteCollegati(oggetto, {
    id: 'cliente', icona: '🧍‍♂️', titolo: 'Cliente',
    leggi: async function(record) {
      if (!record.cliente_id) return [];
      const nome = (record.clienti && record.clienti.ragione_sociale) || null;
      if (nome) return [{ oggetto: 'cliente', id: record.cliente_id, testo: nome }];
      const d = await leggiCollegati(db.from('clienti').select('id,ragione_sociale').eq('id', record.cliente_id));
      return righeOMancante(d, function(c) { return { oggetto: 'cliente', id: c.id, testo: c.ragione_sociale || 'Cliente' }; });
    }
  });
});

// Sede (del cantiere per la commessa; tutte per il cliente)
registraFonteCollegati('commessa', {
  id: 'sede', icona: '📍', titolo: 'Sede del cantiere',
  leggi: async function(c) {
    const testo = c.sedi_cliente && typeof testoSedeCommessa === 'function' ? testoSedeCommessa(c.sedi_cliente) : '';
    return [{ testo: testo || 'Da indicare', sotto: testo ? '' : 'la indicano rappresentante, segreteria o titolare' }];
  }
});
registraFonteCollegati('cliente', {
  id: 'sedi', icona: '📍', titolo: 'Sedi',
  leggi: async function(c) {
    const d = await leggiCollegati(db.from('sedi_cliente').select('id,nome,tipo,via,civico,citta,principale').eq('cliente_id', c.id).order('principale', { ascending: false }));
    return righeOMancante(d, function(s) {
      return { testo: (s.nome || 'Sede') + (s.principale ? ' (principale)' : ''), sotto: [s.tipo, [s.via, s.civico].filter(Boolean).join(' '), s.citta].filter(Boolean).join(' · ') };
    });
  }
});

// Progetto tecnico
['preventivo', 'commessa'].forEach(function(oggetto) {
  registraFonteCollegati(oggetto, {
    id: 'progetto', icona: '📐', titolo: 'Progetto tecnico',
    leggi: async function(record) {
      if (!record.progetto_tecnico_id) return [];
      const p = record.progetti_tecnici;
      if (p && (p.titolo || p.stato)) {
        return [{ oggetto: 'progetto', id: record.progetto_tecnico_id, testo: p.titolo || 'Progetto tecnico', sotto: p.stato ? nomeStatoScheda('progetto', p.stato) : '' }];
      }
      const d = await leggiCollegati(db.from('progetti_tecnici').select('id,titolo,stato').eq('id', record.progetto_tecnico_id));
      return righeOMancante(d, function(x) { return { oggetto: 'progetto', id: x.id, testo: x.titolo || 'Progetto tecnico', sotto: nomeStatoScheda('progetto', x.stato) }; });
    }
  });
});
registraFonteCollegati('cliente', {
  id: 'progetti', icona: '📐', titolo: 'Progetti tecnici',
  leggi: async function(c) {
    const d = await leggiCollegati(db.from('progetti_tecnici').select('id,titolo,stato,creato_il').eq('cliente_id', c.id).order('creato_il', { ascending: false }).limit(50));
    return righeOMancante(d, function(x) { return { oggetto: 'progetto', id: x.id, testo: x.titolo || 'Progetto tecnico', sotto: [nomeStatoScheda('progetto', x.stato), dataScheda(x.creato_il)].filter(Boolean).join(' · ') }; });
  }
});

// Preventivi e revisioni: tutti quelli dello stesso progetto (il preventivo
// principale, gli integrativi dei lavori extra, quelli rifatti).
const COLONNE_PREVENTIVO_COLLEGATO = 'id,numero,stato,data_emissione,totale_imponibile,progetto_tecnico_id';
registraFonteCollegati('preventivo', {
  id: 'preventivi', icona: '🧾', titolo: 'Preventivi dello stesso progetto',
  leggi: async function(p) {
    if (!p.progetto_tecnico_id) return [];
    const d = await leggiCollegati(db.from('preventivi').select(COLONNE_PREVENTIVO_COLLEGATO).eq('progetto_tecnico_id', p.progetto_tecnico_id).neq('id', p.id).order('numero', { ascending: false }));
    return righeOMancante(d, function(x) { return rigaPreventivoCollegato(x, false); });
  }
});
registraFonteCollegati('commessa', {
  id: 'preventivi', icona: '🧾', titolo: 'Preventivi e revisioni',
  leggi: async function(c) {
    const ids = [c.preventivo_id].filter(Boolean);
    let extra = null;
    if (typeof verificaLavoriExtraDisponibili === 'function' && (await verificaLavoriExtraDisponibili())) {
      extra = await leggiCollegati(db.from('commesse_lavori_extra').select('numero,preventivo_id,preventivo_numero,preventivo_stato').eq('commessa_id', c.id).order('numero'));
    }
    const filtri = [];
    if (c.preventivo_id) filtri.push('id.eq.' + c.preventivo_id);
    if (c.progetto_tecnico_id) filtri.push('progetto_tecnico_id.eq.' + c.progetto_tecnico_id);
    (extra || []).forEach(function(e) { if (e.preventivo_id) { filtri.push('id.eq.' + e.preventivo_id); ids.push(e.preventivo_id); } });
    let d = filtri.length ? await leggiCollegati(db.from('preventivi').select(COLONNE_PREVENTIVO_COLLEGATO).or(filtri.join(',')).order('numero')) : [];
    // Capo tecnico e segreteria non leggono i preventivi: restano le righe
    // copiate nella commessa (numero), senza apertura.
    if (d === null || (!d.length && c.preventivo_id)) {
      const righe = [];
      if (c.preventivo_id) righe.push({ oggetto: 'preventivo', id: c.preventivo_id, testo: 'Preventivo n. ' + ((c.preventivi && c.preventivi.numero) || '—'), sotto: 'preventivo accettato' });
      (extra || []).forEach(function(e) {
        if (e.preventivo_id) righe.push({ oggetto: 'preventivo', id: e.preventivo_id, testo: 'Preventivo n. ' + (e.preventivo_numero || '—'), sotto: 'integrativo, lavoro extra n. ' + e.numero + (e.preventivo_stato ? ' · ' + nomeStatoScheda('preventivo', e.preventivo_stato) : '') });
      });
      return righe;
    }
    const extraPer = {};
    (extra || []).forEach(function(e) { if (e.preventivo_id) extraPer[e.preventivo_id] = e.numero; });
    return d.map(function(x) {
      const r = rigaPreventivoCollegato(x, false);
      if (x.id === c.preventivo_id) r.sotto = 'preventivo della commessa · ' + r.sotto;
      else if (extraPer[x.id]) r.sotto = 'integrativo, lavoro extra n. ' + extraPer[x.id] + ' · ' + r.sotto;
      return r;
    });
  }
});
['progetto', 'cliente'].forEach(function(oggetto) {
  registraFonteCollegati(oggetto, {
    id: 'preventivi', icona: '🧾', titolo: 'Preventivi',
    leggi: async function(record) {
      const campo = oggetto === 'progetto' ? 'progetto_tecnico_id' : 'cliente_id';
      const d = await leggiCollegati(db.from('preventivi').select(COLONNE_PREVENTIVO_COLLEGATO).eq(campo, record.id).order('numero', { ascending: false }).limit(50));
      return righeOMancante(d, function(x) { return rigaPreventivoCollegato(x, false); });
    }
  });
});

// Commessa
['preventivo', 'progetto', 'cliente'].forEach(function(oggetto) {
  registraFonteCollegati(oggetto, {
    id: 'commessa', icona: '📁', titolo: oggetto === 'cliente' ? 'Commesse' : 'Commessa',
    leggi: async function(record, ctx) {
      const d = await commesseDelRecord(oggetto, record, ctx);
      return righeOMancante(d, rigaCommessaCollegata);
    }
  });
});

// Cantiere (la scheda Cantiere della commessa, js/32)
['preventivo', 'commessa', 'progetto'].forEach(function(oggetto) {
  registraFonteCollegati(oggetto, {
    id: 'cantiere', icona: '🏗️', titolo: 'Cantiere',
    leggi: async function(record, ctx) {
      const d = await commesseDelRecord(oggetto, record, ctx);
      return righeOMancante(d, function(c) {
        if (c._extra || c.stato === 'annullata') return null;
        return { oggetto: 'cantiere', id: c.id, testo: 'Cantiere della commessa ' + (c.codice || ''), sotto: nomeStatoScheda('commessa', c.stato) };
      });
    }
  });
});

// Ordini ai fornitori (js/27): si aprono dalla commessa.
['preventivo', 'commessa', 'progetto'].forEach(function(oggetto) {
  registraFonteCollegati(oggetto, {
    id: 'ordini', icona: '🛒', titolo: 'Ordini ai fornitori',
    leggi: async function(record, ctx) {
      const commesse = (await commesseDelRecord(oggetto, record, ctx)) || [];
      const ids = commesse.filter(function(c) { return !c._extra; }).map(function(c) { return c.id; });
      if (!ids.length) return [];
      const d = await leggiCollegati(db.from('ordini_fornitori').select('id,codice,stato,fornitore_ragione_sociale,arrivo_previsto,commessa_id').in('commessa_id', ids).order('numero'));
      return righeOMancante(d, function(o) {
        return { oggetto: 'commessa', id: o.commessa_id, testo: 'Ordine ' + (o.codice || ''), sotto: [o.fornitore_ragione_sociale, String(o.stato || '').replace(/_/g, ' '), o.arrivo_previsto ? 'arrivo ' + dataScheda(o.arrivo_previsto) : ''].filter(Boolean).join(' · ') };
      });
    }
  });
});

// POS della commessa: voce del faldone (sql/33; titolare, segreteria, capo
// tecnico). Quando il POS avrà la sua scheda questa fonte la sostituisce.
['preventivo', 'commessa'].forEach(function(oggetto) {
  registraFonteCollegati(oggetto, {
    id: 'pos', icona: '🦺', titolo: 'POS',
    leggi: async function(record, ctx) {
      const commesse = (await commesseDelRecord(oggetto, record, ctx)) || [];
      const ids = commesse.filter(function(c) { return !c._extra; }).map(function(c) { return c.id; });
      if (!ids.length) return [];
      const d = await leggiCollegati(db.from('commesse_faldone_voci').select('id,commessa_id,descrizione,stato').in('commessa_id', ids).ilike('descrizione', 'POS%'));
      const nomi = { da_fare: 'da fare', fatta: 'fatto', non_necessaria: 'non necessario' };
      return righeOMancante(d, function(v) { return { oggetto: 'commessa', id: v.commessa_id, testo: v.descrizione, sotto: 'faldone: ' + (nomi[v.stato] || v.stato) }; });
    }
  });
});

// Documenti finali: cartella "chiusura" della commessa (dichiarazione di
// corretta messa in opera, collaudi; js/37, sql/29).
['preventivo', 'commessa', 'progetto'].forEach(function(oggetto) {
  registraFonteCollegati(oggetto, {
    id: 'documenti_finali', icona: '📄', titolo: 'Documenti finali',
    leggi: async function(record, ctx) {
      const commesse = (await commesseDelRecord(oggetto, record, ctx)) || [];
      const ids = commesse.filter(function(c) { return !c._extra; }).map(function(c) { return c.id; });
      if (!ids.length) return [];
      const d = await leggiCollegati(db.from('commesse_documenti').select('id,commessa_id,nome_file,caricato_il').in('commessa_id', ids).eq('cartella', 'chiusura').order('caricato_il', { ascending: false }));
      return righeOMancante(d, function(f) { return { oggetto: 'commessa', id: f.commessa_id, testo: f.nome_file, sotto: 'cartella Chiusura · ' + dataScheda(f.caricato_il) }; });
    }
  });
});

// Fatture (d'anticipo del preventivo, finale e altre della commessa; per il
// cliente le ultime emesse).
const COLONNE_FATTURA_COLLEGATA = 'id,numero,stato,stato_pagamento,tipo_documento,origine,data_emissione,totale';
function rigaFatturaCollegata(f) {
  const tipo = f.tipo_documento === 'nota_credito' ? 'Nota di credito' : ({ anticipo: 'Fattura d\'anticipo', finale: 'Fattura finale' }[f.origine] || 'Fattura');
  return {
    oggetto: 'fattura', id: f.id, testo: tipo + (f.numero ? ' n. ' + f.numero : ' (bozza)'),
    sotto: [f.data_emissione ? dataScheda(f.data_emissione) : '', f.totale != null && typeof euroPreventivo === 'function' ? euroPreventivo(f.totale) : '',
      f.stato === 'emessa' ? String(f.stato_pagamento || '').replace(/_/g, ' ') : String(f.stato || '').replace(/_/g, ' ')].filter(Boolean).join(' · ')
  };
}
['preventivo', 'commessa', 'progetto'].forEach(function(oggetto) {
  registraFonteCollegati(oggetto, {
    id: 'fatture', icona: '💶', titolo: 'Fatture',
    leggi: async function(record, ctx) {
      const commesse = (await commesseDelRecord(oggetto, record, ctx)) || [];
      const filtri = commesse.filter(function(c) { return !c._extra; }).map(function(c) { return 'commessa_id.eq.' + c.id; });
      if (oggetto === 'preventivo') filtri.push('preventivo_id.eq.' + record.id);
      if (oggetto === 'commessa' && record.preventivo_id) filtri.push('preventivo_id.eq.' + record.preventivo_id);
      if (!filtri.length) return [];
      const d = await leggiCollegati(db.from('fatture').select(COLONNE_FATTURA_COLLEGATA).or(filtri.join(',')).is('eliminato_il', null).order('creato_il', { ascending: false }));
      return righeOMancante(d, rigaFatturaCollegata);
    }
  });
});
registraFonteCollegati('cliente', {
  id: 'fatture', icona: '💶', titolo: 'Fatture',
  leggi: async function(c) {
    const d = await leggiCollegati(db.from('fatture').select(COLONNE_FATTURA_COLLEGATA).eq('cliente_id', c.id).is('eliminato_il', null).order('creato_il', { ascending: false }).limit(20));
    return righeOMancante(d, rigaFatturaCollegata);
  }
});

// Ticket del portale (richieste del cliente): non hanno una scheda.
registraFonteCollegati('cliente', {
  id: 'ticket', icona: '🎫', titolo: 'Richieste dal portale',
  leggi: async function(c) {
    const d = await leggiCollegati(db.from('ticket_clienti').select('id,titolo,stato,creato_il,odl_id').eq('cliente_id', c.id).is('eliminato_il', null).order('creato_il', { ascending: false }).limit(20));
    return righeOMancante(d, function(t) {
      return { oggetto: t.odl_id ? 'intervento' : null, id: t.odl_id, testo: t.titolo || 'Richiesta', sotto: [String(t.stato || '').replace(/_/g, ' '), dataScheda(t.creato_il), t.odl_id ? 'apre l\'intervento' : ''].filter(Boolean).join(' · ') };
    });
  }
});

function htmlRigaCollegata(r) {
  const apribile = r.oggetto && r.id && !r.attuale && collegatoApribile(r.oggetto);
  const corpo = '<span class="so-col-testo">' + esc(r.testo) + '</span>' + (r.sotto ? '<span class="so-col-sotto">' + esc(r.sotto) + '</span>' : '');
  if (apribile) {
    return '<button type="button" class="so-col-riga" data-collegato="' + esc(r.oggetto + ':' + r.id) + '" data-oggetto="' + esc(r.oggetto) + '" data-id="' + esc(String(r.id)) + '" onclick="clicCollegato(this)">' + corpo + '<span class="so-col-apri">Apri ›</span></button>';
  }
  return '<div class="so-col-riga so-col-fissa">' + corpo + '</div>';
}

async function caricaCollegatiScheda(oggetto, record, boxId) {
  const box = ge(boxId);
  if (!box) return;
  const fonti = SCHEDA_OGGETTO.fonti[oggetto] || [];
  const ctx = {};
  const risultati = await Promise.all(fonti.map(async function(f) {
    try { return await f.leggi(record, ctx); } catch (e) { console.warn('Collegati ' + f.id + ':', e); return null; }
  }));
  const aperta = SCHEDA_OGGETTO.aperte[oggetto];
  if (!aperta || aperta.id !== String(record.id) || !ge(boxId)) return;   // nel frattempo un altro record
  let totale = 0;
  const gruppi = fonti.map(function(f, i) {
    const righe = risultati[i];
    if (!righe || !righe.length) return '';
    totale += righe.length;
    const prime = righe.slice(0, MAX_RIGHE_COLLEGATI);
    const altre = righe.slice(MAX_RIGHE_COLLEGATI);
    return '<div class="so-col-gruppo" data-fonte="' + esc(f.id) + '">' +
      '<div class="so-col-titolo">' + esc(f.icona || '') + ' ' + esc(f.titolo) + (righe.length > 1 ? ' <span class="so-col-n">' + righe.length + '</span>' : '') + '</div>' +
      prime.map(htmlRigaCollegata).join('') +
      (altre.length ? '<details class="so-col-altre"><summary>Mostra altri ' + altre.length + '</summary>' + altre.map(htmlRigaCollegata).join('') + '</details>' : '') +
    '</div>';
  }).join('');
  // Sul telefono chiuso (si apre toccandolo), sul computer aperto.
  const aperto = window.innerWidth >= 700 ? ' open' : '';
  box.innerHTML = '<details class="so-riquadro"' + aperto + '><summary>🔗 Collegati' + (totale ? ' <span class="so-col-n">' + totale + '</span>' : '') + '</summary>' +
    (gruppi ? '<div class="so-col-griglia">' + gruppi + '</div>' : '<div class="empty" style="padding:8px">Nessun collegamento visibile con il tuo ruolo.</div>') +
  '</details>';
}

// ── Storico ──────────────────────────────────────────────────────────
// Tabelle con il trigger del registro delle azioni (sql/67).
const TABELLE_REGISTRO_SCHEDA = ['preventivi', 'progetti_tecnici'];
const CAMPI_NASCOSTI_STORICO = ['aggiornato_il', 'updated_at'];

function valoreStorico(x) {
  if (x === null || x === undefined) return '—';
  if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x)) return dataOraScheda(x);
  if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) return dataScheda(x);
  if (typeof x === 'boolean') return x ? 'sì' : 'no';
  let t = typeof x === 'string' ? x : JSON.stringify(x);
  if (t.length > 80) t = t.slice(0, 77) + '...';
  return t;
}

async function leggiStoricoScheda(oggetto, record) {
  const tabella = TABELLA_OGGETTO_SCHEDA[oggetto] || oggetto;
  const voci = [];
  const note = [];
  const letture = [];
  if (ROLE === 'titolare' && TABELLE_REGISTRO_SCHEDA.indexOf(tabella) >= 0) {
    letture.push(leggiCollegati(db.from('registro_azioni').select('tabella,azione,campo,prima,dopo,utente_reale_nome,ruolo_reale,agito_come_ruolo,quando')
      .eq('tabella', tabella).eq('record_id', String(record.id)).order('quando', { ascending: false }).limit(200)).then(function(d) {
      if (d === null) { note.push('Il registro delle modifiche non è ancora attivo (sql/67).'); return; }
      const gruppi = {};
      d.forEach(function(r) {
        if (r.campo && CAMPI_NASCOSTI_STORICO.indexOf(r.campo) >= 0) return;
        const k = r.quando + '|' + (r.utente_reale_nome || '') + '|' + r.azione;
        if (!gruppi[k]) {
          gruppi[k] = { quando: r.quando, chi: r.utente_reale_nome || 'Database', ruolo: r.ruolo_reale, come: r.agito_come_ruolo, testo: r.azione === 'inserimento' ? 'Creato' : (r.azione === 'cancellazione' ? 'Cancellato' : 'Modificato'), dettagli: [] };
          voci.push(gruppi[k]);
        }
        if (r.azione === 'modifica' && r.campo) gruppi[k].dettagli.push(r.campo.replace(/_/g, ' ') + ': ' + valoreStorico(r.prima) + ' → ' + valoreStorico(r.dopo));
      });
    }));
  } else if (TABELLE_REGISTRO_SCHEDA.indexOf(tabella) >= 0) {
    note.push('Il registro delle modifiche (chi ha cambiato cosa) lo legge solo il titolare.');
  }
  if (oggetto === 'commessa') {
    letture.push(leggiCollegati(db.from('commesse_storico').select('da_stato,a_stato,tipo,nota,cambiato_da_nome,cambiato_da_ruolo,cambiato_il').eq('commessa_id', record.id).order('cambiato_il', { ascending: false })).then(function(d) {
      (d || []).forEach(function(r) {
        voci.push({ quando: r.cambiato_il, chi: r.cambiato_da_nome || 'Database', ruolo: r.cambiato_da_ruolo,
          testo: (r.da_stato ? nomeStatoScheda('commessa', r.da_stato) + ' → ' : 'Nascita: ') + nomeStatoScheda('commessa', r.a_stato),
          dettagli: r.nota ? [r.nota] : [] });
      });
    }));
  }
  if (MOTORE_AZIONI_ATTIVO_PER(oggetto)) {
    letture.push(leggiCollegati(db.from('motore_azioni_storico').select('etichetta,azione,stato_da,stato_a,motivo,utente_nome,ruolo_reale,ruolo_usato,quando').eq('oggetto', tabella).eq('record_id', String(record.id)).order('quando', { ascending: false })).then(function(d) {
      (d || []).forEach(function(r) {
        voci.push({ quando: r.quando, chi: r.utente_nome || 'Database', ruolo: r.ruolo_reale, come: r.ruolo_usato !== r.ruolo_reale ? r.ruolo_usato : null,
          testo: (r.etichetta || r.azione) + ': ' + nomeStatoScheda(oggetto, r.stato_da) + ' → ' + nomeStatoScheda(oggetto, r.stato_a), dettagli: r.motivo ? ['Motivo: ' + r.motivo] : [] });
      });
    }));
  }
  if (!letture.length && !note.length) note.push('Per questa scheda il registro delle modifiche non è ancora attivo.');
  await Promise.all(letture);
  voci.sort(function(a, b) { return String(b.quando).localeCompare(String(a.quando)); });
  return { voci: voci, note: note };
}

async function caricaStoricoScheda(oggetto, boxId) {
  const box = ge(boxId);
  const aperta = SCHEDA_OGGETTO.aperte[oggetto];
  if (!box || !aperta) return;
  const corpo = box.querySelector('.so-storico-corpo');
  if (!corpo || corpo.dataset.caricato === aperta.id) return;
  corpo.dataset.caricato = aperta.id;
  corpo.innerHTML = '<div class="load">Caricamento...</div>';
  const r = await leggiStoricoScheda(oggetto, aperta.record);
  if (!SCHEDA_OGGETTO.aperte[oggetto] || SCHEDA_OGGETTO.aperte[oggetto].id !== aperta.id) return;
  corpo.innerHTML =
    r.note.map(function(n) { return '<div class="al2 i" style="margin:6px 0">' + esc(n) + '</div>'; }).join('') +
    (r.voci.length
      ? r.voci.slice(0, 60).map(function(x) {
          return '<div class="so-sto-riga"><div class="so-sto-testa"><b>' + esc(x.testo) + '</b> · ' + esc(dataOraScheda(x.quando)) + ' · ' + esc(x.chi) +
            (x.ruolo ? ' (' + esc(etichettaRuolo(x.ruolo)) + ')' : '') + (x.come ? ' come ' + esc(etichettaRuolo(x.come)) : '') + '</div>' +
            (x.dettagli.length ? '<div class="so-sto-dett">' + x.dettagli.map(esc).join('<br>') + '</div>' : '') + '</div>';
        }).join('') + (r.voci.length > 60 ? '<div style="font-size:12px;color:var(--m)">… e altre ' + (r.voci.length - 60) + ' voci più vecchie.</div>' : '')
      : (r.note.length ? '' : '<div class="empty" style="padding:8px">Nessun passaggio registrato.</div>'));
}

// ── Intestazione e montaggio ─────────────────────────────────────────
// statoInTesta: la pagina mostra già lo stato nel titolo (non si ripete).
const DESCRITTORI_SCHEDA = {
  preventivo: {
    statoInTesta: true,
    scadenza: function(p) {
      // Conta solo finché si aspetta la risposta del cliente.
      const attesa = ['bozza', 'inviato', 'inviato_a_rappresentante'].indexOf(p.stato) >= 0;
      if (!p.data_scadenza || !attesa) return null;
      return { testo: 'Valido fino al ' + dataScheda(p.data_scadenza), scaduta: String(p.data_scadenza) < oggiISOScheda() };
    }
  },
  commessa: {
    statoInTesta: true,
    // Date dei lavori (sql/33): COLONNE_COMMESSA di js/26 non le legge.
    completa: async function(c) {
      if ('data_fine_prevista' in c) return;
      const d = await leggiCollegati(db.from('commesse').select('data_inizio,data_fine_prevista').eq('id', c.id));
      if (d && d[0]) { c.data_inizio = d[0].data_inizio; c.data_fine_prevista = d[0].data_fine_prevista; }
    },
    scadenza: function(c) {
      if (!c.data_fine_prevista) return c.data_inizio ? { testo: 'Inizio lavori ' + dataScheda(c.data_inizio) } : null;
      const aperta = commessaAperta(c) && ['fine_lavori'].indexOf(c.stato) < 0;
      return { testo: 'Fine lavori prevista ' + dataScheda(c.data_fine_prevista), scaduta: aperta && String(c.data_fine_prevista) < oggiISOScheda() };
    }
  },
  progetto: { statoInTesta: false, scadenza: function() { return null; } },
  cliente: { statoInTesta: false, scadenza: function() { return null; } }
};

function htmlTestaScheda(oggetto, record) {
  const d = DESCRITTORI_SCHEDA[oggetto] || {};
  const parti = [];
  if (!d.statoInTesta && record.stato) parti.push('<span class="bx bblue">' + esc(nomeStatoScheda(oggetto, record.stato)) + '</span>');
  const s = typeof d.scadenza === 'function' ? d.scadenza(record) : null;
  if (s) parti.push('<span class="so-scadenza' + (s.scaduta ? ' scaduta' : '') + '">📅 ' + esc(s.testo) + (s.scaduta ? ' (passata)' : '') + '</span>');
  return parti.length ? '<div class="so-testa">' + parti.join('') + '</div>' : '';
}

// Unica funzione chiamata dalle schede (js/09, js/17, js/18, js/26).
async function caricaSchedaOggetto(oggetto, record, contenitoreId) {
  const box = ge(contenitoreId);
  if (!box || !record || !record.id) return;
  SCHEDA_OGGETTO.aperte[oggetto] = { id: String(record.id), record: record, contenitore: contenitoreId };
  // Motore (js/61) e domande (js/62): letti prima di calcolare le azioni.
  try { if (typeof caricaMotoreAzioni === 'function') await caricaMotoreAzioni(); } catch (e) {}
  try { if (typeof verificaDomandeDisponibili === 'function') await verificaDomandeDisponibili(); } catch (e) {}
  const descrittore = DESCRITTORI_SCHEDA[oggetto] || {};
  try { if (typeof descrittore.completa === 'function') await descrittore.completa(record); } catch (e) {}
  if (!SCHEDA_OGGETTO.aperte[oggetto] || SCHEDA_OGGETTO.aperte[oggetto].id !== String(record.id)) return;
  const idCol = contenitoreId + '-collegati';
  const idSto = contenitoreId + '-storico';
  box.innerHTML =
    '<div class="so-scheda" data-oggetto="' + esc(oggetto) + '" data-id="' + esc(String(record.id)) + '">' +
      htmlTestaScheda(oggetto, record) +
      htmlAzioniScheda(oggetto, record, ROLE) +
      // F14.19 (js/64): per gli oggetti del motore "↩️ Annulla" / "✏️ Chiedi correzione"
      (MOTORE_AZIONI_ATTIVO_PER(oggetto) && typeof segnapostoAnnulla === 'function'
        ? '<div class="so-annulla">' + segnapostoAnnulla(TABELLA_OGGETTO_SCHEDA[oggetto] || oggetto, record.id) + '</div>' : '') +
      '<div id="' + esc(idCol) + '"><div class="load" style="padding:6px">Collegati...</div></div>' +
      '<div id="' + esc(idSto) + '"><details class="so-riquadro" ontoggle="if(this.open)caricaStoricoScheda(\'' + esc(oggetto) + '\',\'' + esc(idSto) + '\')">' +
        '<summary>🕘 Storico</summary><div class="so-storico-corpo"></div></details></div>' +
    '</div>';
  if (typeof riempiPulsantiAnnulla === 'function') riempiPulsantiAnnulla(box).catch(function() {});
  await caricaCollegatiScheda(oggetto, record, idCol);
}

// Ridisegna i pulsanti dopo un cambio del record (es. stato) senza
// rileggere i collegati.
function aggiornaAzioniScheda(oggetto, record) {
  const aperta = SCHEDA_OGGETTO.aperte[oggetto];
  if (!aperta || !record || aperta.id !== String(record.id)) return;
  aperta.record = record;
  const box = ge(aperta.contenitore);
  const scheda = box && box.querySelector('.so-scheda');
  if (!scheda) return;
  const vecchie = scheda.querySelector('.so-azioni');
  const nuovo = htmlAzioniScheda(oggetto, record, ROLE);
  if (vecchie) vecchie.outerHTML = nuovo || '';
  else if (nuovo) {
    const testa = scheda.querySelector('.so-testa');
    if (testa) testa.insertAdjacentHTML('afterend', nuovo); else scheda.insertAdjacentHTML('afterbegin', nuovo);
  }
}
