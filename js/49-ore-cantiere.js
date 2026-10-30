// =====================================================================
// RIEPILOGO ORE DI CANTIERE SU TUTTE LE COMMESSE (Moduli da costruire,
// punto 6; chiesto da Erika il 28/10). Pagina "⏱️ Ore cantiere"
// (pg-ore-cantiere): le ore di ogni dipendente e subappaltatore dal
// giornale di cantiere (sql/37, js/35), per periodo, sommate su tutte le
// commesse, con il confronto tra ore stimate ed effettive.
//
// Chi la vede: titolare (e informatico, che ha ROLE 'titolare') e capo
// tecnico, cioè SOLO i ruoli che per RLS leggono già le ore per persona
// (policy commesse_giornale_ore_lettura di sql/37). Il capo tecnico la
// vede perché è lui che organizza le squadre (scelta dichiarata).
// Nessun SQL nuovo, nessuna RPC: legge solo commesse_giornale_ore,
// commesse_lavorazioni, commesse (senza importi), utenti e subappaltatori
// con le policy che ci sono. Niente costi né prezzi.
//
// Filtri: periodo (questo mese, mese scorso, ultimi 3 mesi = questo mese
// e i 2 precedenti, quest'anno, date libere), commessa, persona.
// Viste:
//   Per persona: ore, giorni di presenza, commesse, media al giorno, ore
//     per commessa (riga espandibile). Export CSV (; e virgola decimale).
//   Per commessa: ore del periodo (con i filtri) e ore totali (tutto il
//     giornale, tutte le persone: gli stessi numeri del box "⏱️ Ore
//     stimate e ore effettive" della scheda commessa, js/35), ore stimate
//     delle lavorazioni, scostamento in ore e in %. In cima le commesse
//     APERTE oltre la stima, qualunque sia il filtro.
//   Per lavorazione: stesse lavorazioni (stesso nome, maiuscole e spazi
//     a parte) sommate tra le commesse della vista per commessa.
// Subappaltatori: ore x persone, come nel giornale (oreRigaGiornale).
// Letture a pagine da 1000 righe (limite dell'API di Supabase).
// Senza sql/37: "non ancora attivo".
// Dato informativo nel "Cosa tocca a me" del titolare (js/46): "Commesse
// oltre la stima delle ore" (solo commesse aperte; nascosto se 0).
// =====================================================================

const RUOLI_PAGINA_ORE_CANTIERE = ['titolare', 'capo_tecnico']; // come la policy delle ore di sql/37
const RIGHE_PER_LETTURA_ORE = 1000;
const MASSIMO_RIGHE_ORE = 200000;
const SECONDI_CACHE_ORE_CANTIERE = 120; // tornando alla pagina entro 2 minuti non si rilegge

let datiOreCantiere = null;          // { ore, lavorazioni, commesse, utenti, sub, letto }
let caricamentoOreCantiere = null;   // promessa in corso
let riepilogoOreCantiere = null;     // ultimo calcolo disegnato (serve al CSV)

// ── Letture ─────────────────────────────────────────────────────────
// Tutte le righe di una query, a pagine (crea() deve ordinare per id).
async function leggiTutteLeRigheOre(crea) {
  const righe = [];
  for (let da = 0; da < MASSIMO_RIGHE_ORE; da += RIGHE_PER_LETTURA_ORE) {
    const { data, error } = await crea().range(da, da + RIGHE_PER_LETTURA_ORE - 1);
    if (error) return { errore: error, righe: righe };
    righe.push.apply(righe, data || []);
    if (!data || data.length < RIGHE_PER_LETTURA_ORE) break;
  }
  return { righe: righe };
}

async function leggiDatiOreCantiere() {
  const [rOre, rLav, rCom, rUt, rSub] = await Promise.all([
    leggiTutteLeRigheOre(function() {
      return db.from('commesse_giornale_ore')
        .select('id, commessa_id, giorno, utente_id, subappaltatore_id, persone, lavorazione_id, ore')
        .order('id');
    }),
    leggiTutteLeRigheOre(function() {
      return db.from('commesse_lavorazioni')
        .select('id, commessa_id, ordine, nome, ore_stimate')
        .order('id');
    }),
    leggiTutteLeRigheOre(function() {
      return db.from('commesse')
        .select('id, codice, anno, numero, titolo, stato, cliente_id, clienti(ragione_sociale)')
        .order('id');
    }),
    leggiTutteLeRigheOre(function() {
      return db.from('utenti').select('id, nome, cognome, ruolo').order('id');
    }),
    leggiTutteLeRigheOre(function() {
      return db.from('subappaltatori').select('id, ragione_sociale').order('id');
    })
  ]);

  const errore = rOre.errore || rLav.errore || rCom.errore;
  if (errore) return { errore: errore };

  const perId = function(righe) {
    const m = {};
    righe.forEach(function(x) { m[x.id] = x; });
    return m;
  };
  return {
    ore: rOre.righe,
    lavorazioni: rLav.righe,
    commesse: perId(rCom.righe),
    utenti: perId(rUt.errore ? [] : rUt.righe),
    sub: perId(rSub.errore ? [] : rSub.righe),
    letto: Date.now()
  };
}

// ── Pagina ──────────────────────────────────────────────────────────
async function loadOreCantiere(forza) {
  if (!RUOLI_PAGINA_ORE_CANTIERE.includes(ROLE)) return;
  const nonAttivo = ge('orec-non-attivo');
  const contenuto = ge('orec-contenuto');

  if (!(await verificaGiornaleDisponibile())) {
    if (nonAttivo) nonAttivo.style.display = '';
    if (contenuto) contenuto.style.display = 'none';
    const csv = ge('orec-btn-csv');
    if (csv) csv.style.display = 'none';
    return;
  }
  if (nonAttivo) nonAttivo.style.display = 'none';
  if (contenuto) contenuto.style.display = '';
  const csv = ge('orec-btn-csv');
  if (csv) csv.style.display = '';

  impostaDateLibereOreCantiere(false);

  const recenti = datiOreCantiere && (Date.now() - datiOreCantiere.letto) < SECONDI_CACHE_ORE_CANTIERE * 1000;
  if (recenti && !forza) {
    disegnaOreCantierePagina();
    return;
  }

  if (!datiOreCantiere) {
    ['orec-persone', 'orec-commesse', 'orec-lavorazioni'].forEach(function(id) {
      const b = ge(id);
      if (b) b.innerHTML = '<div class="load">Caricamento...</div>';
    });
  }

  if (!caricamentoOreCantiere) {
    caricamentoOreCantiere = leggiDatiOreCantiere().finally(function() { caricamentoOreCantiere = null; });
  }
  const dati = await caricamentoOreCantiere;
  if (dati.errore) {
    const msg = `<div class="al2 e">Errore nel caricamento delle ore: ${esc(dati.errore.message || '')}</div>`;
    ['orec-persone', 'orec-commesse', 'orec-lavorazioni'].forEach(function(id) {
      const b = ge(id);
      if (b) b.innerHTML = msg;
    });
    return;
  }
  datiOreCantiere = dati;
  riempiFiltriOreCantiere();
  disegnaOreCantierePagina();
  if (forza) toast('Ore aggiornate', 'ok');
}

// ── Periodo ─────────────────────────────────────────────────────────
function primoDelMeseOre(anno, mese) { // mese 0-11, anche fuori intervallo
  return dataLocaleISO(new Date(anno, mese, 1));
}

function ultimoDelMeseOre(anno, mese) {
  return dataLocaleISO(new Date(anno, mese + 1, 0));
}

// { dal, al } in AAAA-MM-GG (null = senza limite) e l'etichetta.
function intervalloPeriodoOreCantiere() {
  const scelta = v('orec-periodo') || 'mese';
  const oggi = new Date();
  const a = oggi.getFullYear();
  const m = oggi.getMonth();
  let dal = null, al = null;
  if (scelta === 'mese') { dal = primoDelMeseOre(a, m); al = ultimoDelMeseOre(a, m); }
  else if (scelta === 'mese-scorso') { dal = primoDelMeseOre(a, m - 1); al = ultimoDelMeseOre(a, m - 1); }
  else if (scelta === 'tre-mesi') { dal = primoDelMeseOre(a, m - 2); al = ultimoDelMeseOre(a, m); }
  else if (scelta === 'anno') { dal = a + '-01-01'; al = a + '-12-31'; }
  else {
    dal = v('orec-dal') || null;
    al = v('orec-al') || null;
    if (dal && al && dal > al) { const t = dal; dal = al; al = t; }
  }
  let etichetta;
  if (dal && al) etichetta = 'dal ' + fd(dal) + ' al ' + fd(al);
  else if (dal) etichetta = 'dal ' + fd(dal);
  else if (al) etichetta = 'fino al ' + fd(al);
  else etichetta = 'tutto il giornale';
  return { dal: dal, al: al, etichetta: etichetta, scelta: scelta };
}

function impostaDateLibereOreCantiere(precompila) {
  const libere = v('orec-periodo') === 'libere';
  const box = ge('orec-date-libere');
  if (box) box.style.display = libere ? '' : 'none';
  if (libere && precompila && !v('orec-dal') && !v('orec-al')) {
    const oggi = new Date();
    ge('orec-dal').value = primoDelMeseOre(oggi.getFullYear(), oggi.getMonth());
    ge('orec-al').value = dataLocaleISO(oggi);
  }
}

function cambiaPeriodoOreCantiere() {
  impostaDateLibereOreCantiere(true);
  disegnaOreCantierePagina();
}

// ── Nomi ────────────────────────────────────────────────────────────
function nomePersonaOreCantiere(d, r) {
  if (r.utente_id) {
    const u = d.utenti[r.utente_id];
    return u ? ([u.nome, u.cognome].filter(Boolean).join(' ') || 'Dipendente') : 'Dipendente';
  }
  const s = d.sub[r.subappaltatore_id];
  return s ? (s.ragione_sociale || 'Subappaltatore') : 'Subappaltatore';
}

function commessaOreCantiere(d, id) {
  return d.commesse[id] || { id: id, codice: '—', titolo: '', stato: '', clienti: null };
}

function etichettaCommessaOre(c) {
  return (c.codice || '—') + (c.clienti?.ragione_sociale ? ' · ' + c.clienti.ragione_sociale : '');
}

function commessaApertaOre(c) {
  return c && c.stato !== 'chiusa' && c.stato !== 'annullata';
}

function chiaveNomeLavorazioneOre(nome) {
  return String(nome || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// ── Filtri commessa e persona (dalle righe lette) ───────────────────
function riempiFiltriOreCantiere() {
  const d = datiOreCantiere;
  if (!d) return;

  const selC = ge('orec-commessa');
  if (selC) {
    const scelta = selC.value;
    const ids = {};
    d.ore.forEach(function(r) { ids[r.commessa_id] = true; });
    d.lavorazioni.forEach(function(l) { ids[l.commessa_id] = true; });
    const elenco = Object.keys(ids).map(function(id) { return commessaOreCantiere(d, id); }).sort(function(a, b) {
      return (b.anno || 0) - (a.anno || 0) || (b.numero || 0) - (a.numero || 0) || String(a.codice).localeCompare(String(b.codice));
    });
    selC.innerHTML = '<option value="">Tutte le commesse</option>' + elenco.map(function(c) {
      return `<option value="${esc(c.id)}">${esc(etichettaCommessaOre(c))}${commessaApertaOre(c) ? '' : ' (' + esc((typeof ETICHETTE_STATO_COMMESSA !== 'undefined' && ETICHETTE_STATO_COMMESSA[c.stato]) || c.stato).toLowerCase() + ')'}</option>`;
    }).join('');
    selC.value = elenco.some(function(c) { return c.id === scelta; }) ? scelta : '';
  }

  const selP = ge('orec-persona');
  if (selP) {
    const scelta = selP.value;
    const persone = {};
    d.ore.forEach(function(r) {
      const k = chiavePersonaGiornale(r);
      if (!persone[k]) persone[k] = { chiave: k, nome: nomePersonaOreCantiere(d, r), sub: !!r.subappaltatore_id };
    });
    const ordina = function(a, b) { return a.nome.localeCompare(b.nome, 'it'); };
    const dip = Object.values(persone).filter(function(p) { return !p.sub; }).sort(ordina);
    const sub = Object.values(persone).filter(function(p) { return p.sub; }).sort(ordina);
    const opzioni = function(lista) {
      return lista.map(function(p) { return `<option value="${esc(p.chiave)}">${esc(p.nome)}</option>`; }).join('');
    };
    selP.innerHTML = '<option value="">Tutte le persone</option>' +
      (dip.length ? `<optgroup label="Dipendenti">${opzioni(dip)}</optgroup>` : '') +
      (sub.length ? `<optgroup label="Subappaltatori">${opzioni(sub)}</optgroup>` : '');
    selP.value = persone[scelta] ? scelta : '';
  }
}

// ── Calcoli ─────────────────────────────────────────────────────────
function calcolaRiepilogoOreCantiere(d, filtri) {
  const nelPeriodo = function(r) {
    return (!filtri.dal || r.giorno >= filtri.dal) && (!filtri.al || r.giorno <= filtri.al);
  };
  const righe = d.ore.filter(function(r) {
    return nelPeriodo(r) &&
      (!filtri.commessa || r.commessa_id === filtri.commessa) &&
      (!filtri.persona || chiavePersonaGiornale(r) === filtri.persona);
  });

  // Per persona
  const perPersona = {};
  const giorniCantiere = {};
  righe.forEach(function(r) {
    const ore = oreRigaGiornale(r);
    const k = chiavePersonaGiornale(r);
    if (!perPersona[k]) perPersona[k] = { chiave: k, nome: nomePersonaOreCantiere(d, r), sub: !!r.subappaltatore_id, ore: 0, giorni: {}, commesse: {} };
    const p = perPersona[k];
    p.ore += ore;
    p.giorni[r.giorno] = true;
    if (!p.commesse[r.commessa_id]) p.commesse[r.commessa_id] = { ore: 0, giorni: {} };
    p.commesse[r.commessa_id].ore += ore;
    p.commesse[r.commessa_id].giorni[r.giorno] = true;
    giorniCantiere[r.commessa_id + '|' + r.giorno] = true;
  });
  const ordinaPersone = function(a, b) { return b.ore - a.ore || a.nome.localeCompare(b.nome, 'it'); };
  const persone = Object.values(perPersona);
  persone.forEach(function(p) {
    p.nGiorni = Object.keys(p.giorni).length;
    p.media = p.nGiorni ? p.ore / p.nGiorni : 0;
    p.elencoCommesse = Object.keys(p.commesse).map(function(id) {
      const c = commessaOreCantiere(d, id);
      return { id: id, commessa: c, ore: p.commesse[id].ore, nGiorni: Object.keys(p.commesse[id].giorni).length };
    }).sort(function(a, b) { return b.ore - a.ore; });
  });
  const dipendenti = persone.filter(function(p) { return !p.sub; }).sort(ordinaPersone);
  const subappaltatori = persone.filter(function(p) { return p.sub; }).sort(ordinaPersone);

  // Totali di ogni commessa (tutto il giornale, tutte le persone): come js/35.
  const totaliCommessa = {};
  const lavPerId = {};
  d.lavorazioni.forEach(function(l) {
    lavPerId[l.id] = l;
    const t = totaliCommessa[l.commessa_id] || (totaliCommessa[l.commessa_id] = nuovoTotaleCommessaOre());
    if (l.ore_stimate !== null && l.ore_stimate !== undefined) {
      t.haStime = true;
      t.stimate += Number(l.ore_stimate) || 0;
    }
  });
  d.ore.forEach(function(r) {
    const t = totaliCommessa[r.commessa_id] || (totaliCommessa[r.commessa_id] = nuovoTotaleCommessaOre());
    const ore = oreRigaGiornale(r);
    t.totali += ore;
    const l = r.lavorazione_id ? lavPerId[r.lavorazione_id] : null;
    if (!l || l.ore_stimate === null || l.ore_stimate === undefined) t.senzaStima += ore;
    if (!r.lavorazione_id) t.altro += ore;
    if (!r.lavorazione_id || !l) return;
    t.perLav[l.id] = (t.perLav[l.id] || 0) + ore;
  });

  // Per commessa: quelle con ore nel periodo (o quella scelta nel filtro).
  const periodoCommessa = {};
  const periodoLav = {};
  righe.forEach(function(r) {
    const ore = oreRigaGiornale(r);
    periodoCommessa[r.commessa_id] = (periodoCommessa[r.commessa_id] || 0) + ore;
    const kl = r.lavorazione_id && lavPerId[r.lavorazione_id] ? r.lavorazione_id : 'altro:' + r.commessa_id;
    periodoLav[kl] = (periodoLav[kl] || 0) + ore;
  });
  const idsCommesse = Object.keys(periodoCommessa);
  if (filtri.commessa && !idsCommesse.includes(filtri.commessa)) idsCommesse.push(filtri.commessa);
  const commesse = idsCommesse.map(function(id) {
    return riepilogoCommessaOre(commessaOreCantiere(d, id), totaliCommessa[id] || nuovoTotaleCommessaOre(), periodoCommessa[id] || 0);
  }).sort(function(a, b) {
    if (a.oltre !== b.oltre) return a.oltre ? -1 : 1;
    if (a.oltre) return (b.perc || 0) - (a.perc || 0);
    return b.periodo - a.periodo || String(b.commessa.codice).localeCompare(String(a.commessa.codice));
  });

  // Commesse APERTE oltre la stima, qualunque sia il filtro.
  const aperteOltre = Object.keys(totaliCommessa).map(function(id) {
    return riepilogoCommessaOre(commessaOreCantiere(d, id), totaliCommessa[id], periodoCommessa[id] || 0);
  }).filter(function(x) { return x.oltre && commessaApertaOre(d.commesse[x.commessa.id]); })
    .sort(function(a, b) { return (b.perc || 0) - (a.perc || 0); });

  // Per lavorazione: lavorazioni delle commesse della vista, per nome.
  const scope = {};
  idsCommesse.forEach(function(id) { scope[id] = true; });
  const gruppi = {};
  const gruppo = function(chiave, nome) {
    return gruppi[chiave] || (gruppi[chiave] = { chiave: chiave, nome: nome, commesse: {}, stimate: 0, conStima: 0, totali: 0, totaliSuStima: 0, periodo: 0 });
  };
  d.lavorazioni.forEach(function(l) {
    if (!scope[l.commessa_id]) return;
    const g = gruppo(chiaveNomeLavorazioneOre(l.nome), String(l.nome || '').trim());
    g.commesse[l.commessa_id] = true;
    const tot = (totaliCommessa[l.commessa_id] && totaliCommessa[l.commessa_id].perLav[l.id]) || 0;
    g.totali += tot;
    g.periodo += periodoLav[l.id] || 0;
    if (l.ore_stimate !== null && l.ore_stimate !== undefined) {
      g.conStima += 1;
      g.stimate += Number(l.ore_stimate) || 0;
      g.totaliSuStima += tot;
    }
  });
  idsCommesse.forEach(function(id) {
    const t = totaliCommessa[id];
    const p = periodoLav['altro:' + id] || 0;
    if ((!t || !t.altro) && !p) return;
    const g = gruppo('\u0000altro', 'Altro (non in elenco)');
    g.commesse[id] = true;
    g.totali += t ? t.altro : 0;
    g.periodo += p;
  });
  const lavorazioni = Object.values(gruppi).filter(function(g) { return g.totali > 0 || g.periodo > 0 || g.conStima > 0; });
  lavorazioni.forEach(function(g) {
    g.nCommesse = Object.keys(g.commesse).length;
    g.oltre = g.conStima > 0 && g.totaliSuStima > g.stimate;
    g.perc = g.conStima > 0 && g.stimate > 0 ? Math.round(g.totaliSuStima / g.stimate * 100) : null;
  });
  lavorazioni.sort(function(a, b) {
    if (a.chiave === '\u0000altro') return 1;
    if (b.chiave === '\u0000altro') return -1;
    if (a.oltre !== b.oltre) return a.oltre ? -1 : 1;
    return b.totali - a.totali || a.nome.localeCompare(b.nome, 'it');
  });

  const somma = function(lista) { return lista.reduce(function(t, p) { return t + p.ore; }, 0); };
  return {
    filtri: filtri,
    dipendenti: dipendenti,
    subappaltatori: subappaltatori,
    oreDipendenti: somma(dipendenti),
    oreSubappaltatori: somma(subappaltatori),
    oreTotali: somma(dipendenti) + somma(subappaltatori),
    giorniCantiere: Object.keys(giorniCantiere).length,
    commesse: commesse,
    aperteOltre: aperteOltre,
    lavorazioni: lavorazioni
  };
}

function nuovoTotaleCommessaOre() {
  return { totali: 0, stimate: 0, haStime: false, senzaStima: 0, altro: 0, perLav: {} };
}

function riepilogoCommessaOre(commessa, t, periodo) {
  const perc = t.haStime && t.stimate > 0 ? Math.round(t.totali / t.stimate * 100) : (t.haStime && t.totali > 0 ? 999 : null);
  return {
    commessa: commessa,
    periodo: periodo,
    totali: t.totali,
    stimate: t.haStime ? t.stimate : null,
    senzaStima: t.senzaStima,
    scostamento: t.haStime ? t.totali - t.stimate : null,
    perc: perc,
    oltre: t.haStime && t.totali > t.stimate
  };
}

// ── Disegno ─────────────────────────────────────────────────────────
function numeroOre(n) {
  const x = Math.round((Number(n) || 0) * 100) / 100;
  return x.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

// Percentuale: un decimale sotto il 10% (8 h su 2.900 = 0,3%, non 0%).
function testoPercentualeOre(p) {
  const x = p < 10 ? Math.round(p * 10) / 10 : Math.round(p);
  return x.toLocaleString('it-IT', { maximumFractionDigits: 1 }) + '%';
}

function htmlScostamentoOre(totali, stimate, perc, senzaNota) {
  if (stimate === null || stimate === undefined) return '<span style="font-size:12px;color:var(--m)">nessuna stima</span>';
  const oltre = totali > stimate;
  const diff = totali - stimate;
  const percDiff = stimate > 0 ? diff / stimate * 100 : null;
  const classe = oltre ? 'berr' : (perc !== null && perc >= 90 ? 'bwarn' : 'bok');
  const segno = function(x) { return x > 0 ? '+' : (x < 0 ? '−' : ''); };
  const testo = segno(diff) + numeroOre(Math.abs(diff)) + ' h' +
    (percDiff !== null ? ' (' + segno(percDiff) + testoPercentualeOre(Math.abs(percDiff)) + ')' : '');
  return `<span class="bx ${classe}" style="white-space:nowrap">${esc(testo)}</span>${oltre && !senzaNota ? '<div style="font-size:11px;color:var(--r);margin-top:2px">oltre la stima</div>' : ''}`;
}

function disegnaOreCantierePagina() {
  const d = datiOreCantiere;
  if (!d) return;
  const periodo = intervalloPeriodoOreCantiere();
  const filtri = { dal: periodo.dal, al: periodo.al, etichetta: periodo.etichetta, commessa: v('orec-commessa') || '', persona: v('orec-persona') || '' };
  const r = calcolaRiepilogoOreCantiere(d, filtri);
  riepilogoOreCantiere = r;

  disegnaRiassuntoOreCantiere(r);
  disegnaPersoneOreCantiere(r);
  disegnaCommesseOreCantiere(r);
  disegnaLavorazioniOreCantiere(r);
}

function testoFiltriOreCantiere(r) {
  const d = datiOreCantiere;
  const parti = [r.filtri.etichetta];
  if (r.filtri.commessa) parti.push('commessa ' + etichettaCommessaOre(commessaOreCantiere(d, r.filtri.commessa)));
  if (r.filtri.persona) {
    const sel = ge('orec-persona');
    const opt = sel && sel.options[sel.selectedIndex];
    if (opt) parti.push(opt.textContent);
  }
  return parti.join(' · ');
}

function disegnaRiassuntoOreCantiere(r) {
  const box = ge('orec-riassunto');
  if (!box) return;
  const nCommesse = r.commesse.filter(function(c) { return c.periodo > 0; }).length;
  box.innerHTML = `
    <div style="font-size:12px;color:var(--m);margin:-4px 0 8px">${esc(testoFiltriOreCantiere(r))}</div>
    <div class="kpi-grid orec-kpi">
      <div class="kpi-card"><div class="kpi-icon">⏱️</div><div class="kpi-num">${esc(numeroOre(r.oreTotali))}</div><div class="kpi-label">Ore nel periodo</div></div>
      <div class="kpi-card"><div class="kpi-icon">👷</div><div class="kpi-num">${esc(numeroOre(r.oreDipendenti))}</div><div class="kpi-label">Dipendenti (${r.dipendenti.length})</div></div>
      <div class="kpi-card"><div class="kpi-icon">🏗️</div><div class="kpi-num">${esc(numeroOre(r.oreSubappaltatori))}</div><div class="kpi-label">Subappaltatori (${r.subappaltatori.length})</div></div>
      <div class="kpi-card"><div class="kpi-icon">📁</div><div class="kpi-num">${nCommesse}</div><div class="kpi-label">Commesse · ${r.giorniCantiere} ${r.giorniCantiere === 1 ? 'giorno' : 'giorni'} di cantiere</div></div>
    </div>
  `;
  const conta = ge('orec-oltre-conta');
  if (conta) {
    const n = r.commesse.filter(function(c) { return c.oltre; }).length;
    conta.innerHTML = n ? `<span class="bx berr">${n} oltre</span>` : '';
  }
}

function rigaPersonaOreCantiere(p) {
  const dettaglio = p.elencoCommesse.map(function(x) {
    return `
      <div class="orec-dett-riga">
        <div style="min-width:0;overflow-wrap:anywhere"><b>${esc(x.commessa.codice || '—')}</b> ${esc(x.commessa.clienti?.ragione_sociale || '')}${x.commessa.titolo ? `<div style="font-size:11px;color:var(--m)">${esc(x.commessa.titolo)}</div>` : ''}</div>
        <div style="white-space:nowrap;text-align:right"><b>${esc(numeroOre(x.ore))} h</b><div style="font-size:11px;color:var(--m)">${x.nGiorni} ${x.nGiorni === 1 ? 'giorno' : 'giorni'}</div></div>
      </div>
    `;
  }).join('');
  return `
    <tr>
      <td data-label="Persona"><b style="overflow-wrap:anywhere">${esc(p.nome)}</b>${p.sub ? ' <span class="bx bgray">subappaltatore</span>' : ''}</td>
      <td data-label="Ore" class="orec-num"><b>${esc(numeroOre(p.ore))}</b></td>
      <td data-label="Giorni" class="orec-num">${p.nGiorni}</td>
      <td data-label="Media al giorno" class="orec-num">${esc(numeroOre(p.media))}</td>
      <td data-label="Commesse"><button type="button" class="btn sm" onclick="apriDettaglioOreCantiere(this)" aria-expanded="false">▸ ${p.elencoCommesse.length} ${p.elencoCommesse.length === 1 ? 'commessa' : 'commesse'}</button></td>
    </tr>
    <tr class="orec-dettaglio" style="display:none"><td colspan="5">${dettaglio}</td></tr>
  `;
}

function apriDettaglioOreCantiere(btn) {
  const tr = btn.closest('tr');
  const dett = tr && tr.nextElementSibling;
  if (!dett || !dett.classList.contains('orec-dettaglio')) return;
  const aperto = dett.style.display !== 'none';
  dett.style.display = aperto ? 'none' : '';
  btn.setAttribute('aria-expanded', aperto ? 'false' : 'true');
  btn.textContent = btn.textContent.replace(aperto ? '▾' : '▸', aperto ? '▸' : '▾');
}

function disegnaPersoneOreCantiere(r) {
  const box = ge('orec-persone');
  if (!box) return;
  if (!r.dipendenti.length && !r.subappaltatori.length) {
    box.innerHTML = '<div class="empty">Nessuna ora di cantiere nel periodo scelto.</div>';
    return;
  }
  const intest = '<thead><tr><th>Persona</th><th class="orec-num">Ore</th><th class="orec-num">Giorni</th><th class="orec-num">Media al giorno</th><th>Commesse</th></tr></thead>';
  const sezione = function(titolo, lista, ore) {
    if (!lista.length) return '';
    return `
      <div class="orec-sezione">${titolo} · ${esc(numeroOre(ore))} h</div>
      <div class="tw orec-tw"><table class="orec-tab">${intest}<tbody>${lista.map(rigaPersonaOreCantiere).join('')}</tbody></table></div>
    `;
  };
  box.innerHTML =
    sezione('👷 Dipendenti', r.dipendenti, r.oreDipendenti) +
    sezione('🏗️ Subappaltatori', r.subappaltatori, r.oreSubappaltatori) +
    (r.subappaltatori.length ? '<div style="font-size:11px;color:var(--m);margin-top:6px">Subappaltatori: ore × persone, come nel giornale; la media al giorno è di tutta la loro squadra.</div>' : '');
}

function disegnaCommesseOreCantiere(r) {
  const box = ge('orec-commesse');
  if (!box) return;

  const evidenza = r.aperteOltre.length ? `
    <div class="al2 w orec-evidenza">
      <b>⚠️ Commesse aperte oltre la stima delle ore: ${r.aperteOltre.length}</b>
      <div style="font-size:11px;margin:2px 0 6px">Ore di tutto il giornale contro le ore stimate delle lavorazioni, qualunque sia il periodo scelto.</div>
      ${r.aperteOltre.map(function(x) {
        return `<div class="orec-dett-riga">
          <div style="min-width:0;overflow-wrap:anywhere"><b>${esc(x.commessa.codice || '—')}</b> ${esc(x.commessa.clienti?.ragione_sociale || '')} · ${esc(numeroOre(x.totali))} h su ${esc(numeroOre(x.stimate))} stimate</div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">${htmlScostamentoOre(x.totali, x.stimate, x.perc, true)}<button class="btn sm p" onclick="openCommessaDetail('${esc(x.commessa.id)}')">Apri</button></div>
        </div>`;
      }).join('')}
    </div>
  ` : '';

  if (!r.commesse.length) {
    box.innerHTML = evidenza + '<div class="empty">Nessuna commessa con ore nel periodo scelto.</div>';
    return;
  }

  const righe = r.commesse.map(function(x) {
    const c = x.commessa;
    return `
      <tr${x.oltre ? ' class="orec-oltre"' : ''}>
        <td data-label="Commessa"><b>${esc(c.codice || '—')}</b> ${c.stato ? badgeStatoCommessa(c.stato) : ''}<div style="font-size:12px;overflow-wrap:anywhere">${esc(c.clienti?.ragione_sociale || '')}</div>${c.titolo ? `<div style="font-size:11px;color:var(--m);overflow-wrap:anywhere">${esc(c.titolo)}</div>` : ''}</td>
        <td data-label="Nel periodo" class="orec-num"><b>${esc(numeroOre(x.periodo))}</b></td>
        <td data-label="Totali" class="orec-num">${esc(numeroOre(x.totali))}</td>
        <td data-label="Stimate" class="orec-num"><span>${x.stimate === null ? '—' : esc(numeroOre(x.stimate))}${x.stimate !== null && x.senzaStima > 0 ? `<div style="font-size:11px;color:var(--m)">${esc(numeroOre(x.senzaStima))} h senza stima</div>` : ''}</span></td>
        <td data-label="Scostamento"><span>${htmlScostamentoOre(x.totali, x.stimate, x.perc)}</span></td>
        <td data-label=""><button class="btn sm p" onclick="openCommessaDetail('${esc(c.id)}')">Apri</button></td>
      </tr>
    `;
  }).join('');

  box.innerHTML = evidenza + `
    <div style="font-size:12px;color:var(--m);margin-bottom:6px">“Nel periodo” segue i filtri; “Totali” e stime sono di tutta la commessa (tutto il giornale, tutte le persone), come nel box ⏱️ della scheda commessa. Scostamento = totali − stimate.</div>
    <div class="tw orec-tw"><table class="orec-tab">
      <thead><tr><th>Commessa</th><th class="orec-num">Nel periodo</th><th class="orec-num">Totali</th><th class="orec-num">Stimate</th><th>Scostamento</th><th></th></tr></thead>
      <tbody>${righe}</tbody>
    </table></div>
  `;
}

function disegnaLavorazioniOreCantiere(r) {
  const box = ge('orec-lavorazioni');
  if (!box) return;
  if (!r.lavorazioni.length) {
    box.innerHTML = '<div class="empty">Nessuna lavorazione con ore o stime nelle commesse del periodo scelto.</div>';
    return;
  }
  const righe = r.lavorazioni.map(function(g) {
    const senzaStima = g.totali - g.totaliSuStima;
    return `
      <tr${g.oltre ? ' class="orec-oltre"' : ''}>
        <td data-label="Lavorazione"><b style="overflow-wrap:anywhere">${esc(g.nome)}</b></td>
        <td data-label="Commesse" class="orec-num">${g.nCommesse}</td>
        <td data-label="Nel periodo" class="orec-num"><b>${esc(numeroOre(g.periodo))}</b></td>
        <td data-label="Totali" class="orec-num">${esc(numeroOre(g.totali))}</td>
        <td data-label="Stimate" class="orec-num">${g.conStima ? esc(numeroOre(g.stimate)) : '—'}</td>
        <td data-label="Scostamento"><span>${g.conStima ? htmlScostamentoOre(g.totaliSuStima, g.stimate, g.perc) : '<span style="font-size:12px;color:var(--m)">nessuna stima</span>'}${g.conStima && senzaStima > 0 ? `<div style="font-size:11px;color:var(--m)">più ${esc(numeroOre(senzaStima))} h su commesse senza stima</div>` : ''}</span></td>
      </tr>
    `;
  }).join('');
  box.innerHTML = `
    <div style="font-size:12px;color:var(--m);margin-bottom:6px">Le lavorazioni con lo stesso nome sono sommate tra le commesse della vista “Per commessa”. Lo scostamento confronta le stime con le ore delle sole commesse che hanno la stima.</div>
    <div class="tw orec-tw"><table class="orec-tab">
      <thead><tr><th>Lavorazione</th><th class="orec-num">Commesse</th><th class="orec-num">Nel periodo</th><th class="orec-num">Totali</th><th class="orec-num">Stimate</th><th>Scostamento</th></tr></thead>
      <tbody>${righe}</tbody>
    </table></div>
  `;
}

// ── CSV del riepilogo per persona (Excel italiano: ; e virgola) ─────
function cellaCsvOre(x) {
  let t = String(x === null || x === undefined ? '' : x);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // niente formule da un nome
  return /[";\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function numeroCsvOre(n) {
  return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',');
}

function scaricaCsvOreCantiere() {
  const r = riepilogoOreCantiere;
  if (!r) { toast('Ore non ancora caricate', 'err'); return; }
  const persone = r.dipendenti.concat(r.subappaltatori);
  if (!persone.length) { toast('Nessuna ora nel periodo scelto', 'err'); return; }

  const linee = [];
  const riga = function(celle) { linee.push(celle.map(cellaCsvOre).join(';')); };
  riga(['Ore cantiere - riepilogo per persona']);
  riga(['Filtri', testoFiltriOreCantiere(r)]);
  riga(['Dal', r.filtri.dal ? fd(r.filtri.dal) : '', 'Al', r.filtri.al ? fd(r.filtri.al) : '']);
  riga([]);
  linee.push(['Persona', 'Tipo', 'Ore', 'Giorni di presenza', 'Commesse', 'Media ore al giorno'].map(cellaCsvOre).join(';'));
  persone.forEach(function(p) {
    linee.push([cellaCsvOre(p.nome), cellaCsvOre(p.sub ? 'Subappaltatore' : 'Dipendente'), numeroCsvOre(p.ore), String(p.nGiorni), String(p.elencoCommesse.length), numeroCsvOre(p.media)].join(';'));
  });
  linee.push([cellaCsvOre('Totale'), '', numeroCsvOre(r.oreTotali), '', '', ''].join(';'));
  riga([]);
  riga(['Dettaglio per commessa']);
  linee.push(['Persona', 'Tipo', 'Commessa', 'Cliente', 'Lavoro', 'Ore', 'Giorni'].map(cellaCsvOre).join(';'));
  persone.forEach(function(p) {
    p.elencoCommesse.forEach(function(x) {
      linee.push([cellaCsvOre(p.nome), cellaCsvOre(p.sub ? 'Subappaltatore' : 'Dipendente'), cellaCsvOre(x.commessa.codice || ''),
        cellaCsvOre(x.commessa.clienti?.ragione_sociale || ''), cellaCsvOre(x.commessa.titolo || ''), numeroCsvOre(x.ore), String(x.nGiorni)].join(';'));
    });
  });
  riga([]);
  riga(['Subappaltatori: ore x persone, come nel giornale di cantiere.']);

  const nome = 'Ore_cantiere_' + (r.filtri.dal || 'inizio') + '_' + (r.filtri.al || 'oggi') + '.csv';
  const blob = new Blob(['﻿' + linee.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ── "Cosa tocca a me" del titolare: dato informativo ────────────────
// Commesse APERTE con ore effettive (tutto il giornale) oltre le ore
// stimate delle lavorazioni. Stessa regola della pagina. Legge solo le
// lavorazioni con stima e le ore di quelle commesse (a pagine).
async function contaCommesseOltreStimaOre(giro) {
  if (!(await verificaGiornaleDisponibile())) return null;
  const aperte = typeof commesseAperteTAM === 'function' ? await commesseAperteTAM(giro) : null;
  if (!aperte) return null;
  const idAperte = {};
  aperte.forEach(function(c) { idAperte[c.id] = c; });

  const rLav = await leggiTutteLeRigheOre(function() {
    return db.from('commesse_lavorazioni').select('id, commessa_id, ore_stimate').not('ore_stimate', 'is', null).order('id');
  });
  if (rLav.errore) return null;
  const stime = {};
  rLav.righe.forEach(function(l) {
    if (!idAperte[l.commessa_id]) return;
    stime[l.commessa_id] = (stime[l.commessa_id] || 0) + (Number(l.ore_stimate) || 0);
  });
  const ids = Object.keys(stime);
  if (!ids.length) return { n: 0, codici: [] };

  const totali = {};
  for (let i = 0; i < ids.length; i += 80) {
    const blocco = ids.slice(i, i + 80);
    const rOre = await leggiTutteLeRigheOre(function() {
      return db.from('commesse_giornale_ore').select('id, commessa_id, ore, persone').in('commessa_id', blocco).order('id');
    });
    if (rOre.errore) return null;
    rOre.righe.forEach(function(r) { totali[r.commessa_id] = (totali[r.commessa_id] || 0) + oreRigaGiornale(r); });
  }
  const oltre = ids.filter(function(id) { return (totali[id] || 0) > stime[id]; });
  return { n: oltre.length };
}

function apriOreCantiereSuCommesse() {
  if (!canAccessPage('ore-cantiere')) return;
  gotoPage('ore-cantiere');
  const btn = Array.prototype.find.call(document.querySelectorAll('#pg-ore-cantiere .tab'), function(b) {
    return /Commesse/.test(b.textContent);
  });
  if (btn) stab(btn, 'orec-tab-commesse');
}

if (typeof registraFonteToccaAMe === 'function') {
  registraFonteToccaAMe({
    id: 'commesse-oltre-stima-ore', ruoli: ['titolare'], icona: '⏱️', tipo: 'info',
    titolo: 'Commesse oltre la stima delle ore',
    vai: apriOreCantiereSuCommesse,
    conta: async function(giro) {
      const r = await contaCommesseOltreStimaOre(giro);
      if (!r || !r.n) return null; // 0 o non attivo: la riga non compare
      return { n: r.n };
    }
  });
}
