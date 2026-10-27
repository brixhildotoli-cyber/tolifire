// =====================================================================
// F8.2 — SQUADRA E MEZZI DEL GIORNO (passo 11, Capo Operativo =
// capo_tecnico). Per ogni giorno di cantiere il capo tecnico sceglie
// chi va (dipendenti tecnici e subappaltatori) e con quali mezzi e
// attrezzature. Avvisa (senza bloccare) se una persona o un mezzo è già
// impegnato quel giorno (interventi, calendario personale, altri
// cantieri) o se una persona ha documenti scaduti (sql/32, js/30
// statoDocumentoTeamSubappalti) o non è nel faldone della commessa
// (js/31, solo se il faldone è attivo).
// I tecnici scelti trovano il cantiere nel loro calendario
// (pg-calendario-tec) e nella dashboard (oggi e prossimi 7 giorni):
// dove si va, orari, referente, note di sicurezza, squadra e mezzi,
// senza prezzi (RPC miei_giorni_cantiere).
// Box "👷 Squadra e mezzi del giorno" (cmd-squadra) nella scheda
// "🏗️ Cantiere" della commessa: lo vedono titolare, segreteria e capo
// tecnico; scrivono capo tecnico e titolare (giorni passati solo il
// titolare). Mezzi e attrezzature: piccola anagrafica
// (mezzi_attrezzature, finestra "Elenco mezzi e attrezzature") + testo
// libero "altri mezzi" sul giorno.
// Tutto attivo con sql/35-squadra-cantiere (richiede 26 e 32). Senza:
// il box dice "non ancora attivo" e il calendario del tecnico mostra
// solo gli interventi, come prima.
// =====================================================================

const RUOLI_LEGGONO_SQUADRA = ['titolare', 'segreteria', 'capo_tecnico'];
const RUOLI_SCRIVONO_SQUADRA = ['titolare', 'capo_tecnico'];

let squadraDisponibile = null;
let squadraAperta = null;     // { commessa, giorni, impegni, documenti, utenti, subappaltatori, mezzi }
let squadraModulo = null;     // { giornoId } finestra aperta
let timerImpegniSquadra = null;

// ── Disponibilità di sql/35 ─────────────────────────────────────────
async function verificaSquadraDisponibile() {
  if (squadraDisponibile !== null) return squadraDisponibile;
  if (!RUOLI_LEGGONO_SQUADRA.includes(ROLE)) return false;

  const { error } = await db
    .from('commesse_squadra_giorni')
    .select('id')
    .limit(1);

  if (!error) {
    squadraDisponibile = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /commesse_squadra_giorni/i.test(error.message || '')) {
    squadraDisponibile = false;
  } else {
    return false;
  }
  return squadraDisponibile;
}

// RPC assente (sql/35 non eseguito): niente errori, solo "non attivo".
function rpcSquadraMancante(error) {
  return !!error && (error.code === 'PGRST202' || error.code === '42883' || /miei_giorni_cantiere|impegni_squadra_periodo/i.test(error.message || '') && /find|exist|schema cache/i.test(error.message || ''));
}

// ── Chi può fare cosa (le stesse regole le impone il database) ──────
function puoModificareSquadra(commessa) {
  if (ROLE === 'titolare') return true;
  return ROLE === 'capo_tecnico' && commessaAperta(commessa);
}

function puoModificareGiornoSquadra(commessa, data) {
  if (ROLE === 'titolare') return true;
  return puoModificareSquadra(commessa) && data >= dataLocaleISO();
}

// ── Piccoli aiuti ───────────────────────────────────────────────────
function etichettaGiornoSquadra(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

function dataBreveSquadra(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function nomeUtenteSquadra(u) {
  return [u?.nome, u?.cognome].filter(Boolean).join(' ') || 'Dipendente';
}

function nomeMezzoSquadra(m) {
  return (m.tipo === 'mezzo' ? '🚐 ' : '🧰 ') + m.nome + (m.targa_matricola ? ' (' + m.targa_matricola + ')' : '');
}

function giorniTraDateSquadra(dal, al, saltaWeekend) {
  const giorni = [];
  if (!dal) return giorni;
  const fine = al && al >= dal ? al : dal;
  let iso = dal;
  let guardia = 0;
  while (iso <= fine && guardia < 100) {
    const dow = new Date(iso + 'T00:00:00').getDay();
    if (!(saltaWeekend && (dow === 0 || dow === 6))) giorni.push(iso);
    iso = sommaGiorniSquadra(iso, 1);
    guardia++;
  }
  return giorni;
}

function sommaGiorniSquadra(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dataLocaleISO(d);
}

// ── Avvisi: impegni già presi e documenti ───────────────────────────
// impegni: risposta di impegni_squadra_periodo. chiave: 'utente_id',
// 'subappaltatore_id' o 'mezzo_id'. giorni: date considerate.
function impegniDi(impegni, chiave, id, giorni) {
  return (impegni || []).filter(function(i) {
    return i[chiave] === id && (!giorni || giorni.includes(i.data));
  });
}

// Documenti in vigore (sql/32) scaduti al primo giorno o che scadono
// entro l'ultimo, e requisiti mancanti del faldone (js/31, se attivo).
function avvisiDocumentiSquadra(tipo, id, giorni, documenti, commessa) {
  const avvisi = [];
  if (!giorni.length) return avvisi;
  const primo = giorni[0];
  const ultimo = giorni[giorni.length - 1];
  const chiave = tipo === 'utente' ? 'utente_id' : 'subappaltatore_id';

  if (documenti) {
    documenti.filter(function(d) { return d[chiave] === id; }).forEach(function(d) {
      if (!d.data_scadenza) return;
      const nome = typeof nomeDocumentoTS === 'function' ? nomeDocumentoTS(d) : d.tipo;
      if (statoDocumentoTeamSubappalti(d, primo).codice === 'scaduto') {
        avvisi.push({ grave: true, testo: nome + ' scaduto il ' + fd(d.data_scadenza) });
      } else if (statoDocumentoTeamSubappalti(d, ultimo).codice === 'scaduto') {
        avvisi.push({ grave: false, testo: nome + ' scade il ' + fd(d.data_scadenza) + ', nei giorni scelti' });
      }
    });
  }

  // Faldone della commessa (js/31): solo se letto e con almeno una persona.
  const faldone = typeof faldoneAperto !== 'undefined' && faldoneAperto && faldoneAperto.commessa?.id === commessa.id
    ? (faldoneAperto.stato?.persone || [])
    : null;
  if (faldone && faldone.length) {
    const persona = faldone.find(function(p) { return p[chiave] === id; });
    if (!persona) {
      avvisi.push({ grave: false, testo: 'non è nel faldone della commessa' });
    } else {
      (persona.requisiti || []).filter(function(r) { return r.esito === 'mancante'; }).forEach(function(r) {
        avvisi.push({ grave: true, testo: 'manca ' + (typeof nomeTipoDocumentoFaldone === 'function' ? nomeTipoDocumentoFaldone(r.tipo) : r.tipo) + ' (faldone)' });
      });
    }
  }
  return avvisi;
}

function htmlAvvisiSquadra(impegni, avvisiDoc, piuGiorni) {
  const righe = []
    .concat((avvisiDoc || []).map(function(a) {
      return `<span class="bx ${a.grave ? 'berr' : 'bwarn'}">🪪 ${esc(a.testo)}</span>`;
    }))
    .concat((impegni || []).map(function(i) {
      const icona = i.tipo === 'intervento' ? '🔧' : i.tipo === 'calendario' ? '📅' : '🏗️';
      return `<span class="bx bwarn">${icona} ${piuGiorni ? esc(dataBreveSquadra(i.data)) + ': ' : ''}${esc(i.testo)}</span>`;
    }));
  return righe.length ? `<div class="sq-avvisi">${righe.join('')}</div>` : '';
}

// ── Caricamento del box (chiamata da js/26 dopo la scheda cantiere) ──
async function caricaSquadraCantiere(commessa) {
  const box = ge('cmd-squadra');
  if (!box || !commessa) return;
  box.innerHTML = '';
  squadraAperta = null;
  if (!RUOLI_LEGGONO_SQUADRA.includes(ROLE)) return;

  const titolo = '<div class="cant-titolo">👷 Squadra e mezzi del giorno</div>';

  if (!(await verificaSquadraDisponibile())) {
    box.innerHTML = `<div class="card sq-card">${titolo}<div class="al2 i" style="margin:0">La squadra e i mezzi del giorno non sono ancora attivi.</div></div>`;
    return;
  }

  box.innerHTML = `<div class="card sq-card">${titolo}<div class="load">Caricamento...</div></div>`;

  const { data: giorni, error } = await db
    .from('commesse_squadra_giorni')
    .select('id, data, orario, altri_mezzi, note, aggiornato_da_nome, aggiornato_il, commesse_squadra_persone(id, utente_id, subappaltatore_id), commesse_squadra_mezzi(mezzo_id)')
    .eq('commessa_id', commessa.id)
    .order('data');

  if (commessaApertaId && commessaApertaId !== commessa.id) return;

  if (error) {
    box.innerHTML = `<div class="card sq-card">${titolo}<div class="al2 e" style="margin:0">Errore caricamento squadra: ${esc(error.message)}</div></div>`;
    return;
  }

  const oggi = dataLocaleISO();
  const prossimi = (giorni || []).filter(function(g) { return g.data >= oggi; });

  // Nomi di persone, subappaltatori e mezzi + avvisi per i giorni a venire.
  const [rUtenti, rSub, rMezzi, rDoc, rImpegni] = await Promise.all([
    db.from('utenti').select('id, nome, cognome, ruolo, attivo').in('ruolo', ['tecnico', 'capo_tecnico']).order('nome'),
    db.from('subappaltatori').select('id, ragione_sociale, attivo').order('ragione_sociale'),
    db.from('mezzi_attrezzature').select('id, nome, tipo, targa_matricola, note, attivo').order('nome'),
    caricaDocumentiSquadra(),
    prossimi.length
      ? db.rpc('impegni_squadra_periodo', {
          p_dal: prossimi[0].data,
          p_al: prossimi[prossimi.length - 1].data > sommaGiorniSquadra(prossimi[0].data, 92) ? sommaGiorniSquadra(prossimi[0].data, 92) : prossimi[prossimi.length - 1].data,
          p_commessa_id: commessa.id
        })
      : null
  ]);

  if (commessaApertaId && commessaApertaId !== commessa.id) return;

  squadraAperta = {
    commessa: commessa,
    giorni: giorni || [],
    impegni: (rImpegni && !rImpegni.error && rImpegni.data) || [],
    documenti: rDoc,
    utenti: (rUtenti && !rUtenti.error && rUtenti.data) || [],
    subappaltatori: (rSub && !rSub.error && rSub.data) || [],
    mezzi: (rMezzi && !rMezzi.error && rMezzi.data) || []
  };

  const errori = [];
  if (rUtenti?.error) errori.push('dipendenti: ' + rUtenti.error.message);
  if (rSub?.error) errori.push('subappaltatori: ' + rSub.error.message);
  if (rMezzi?.error) errori.push('mezzi: ' + rMezzi.error.message);
  if (rImpegni?.error) errori.push('impegni: ' + rImpegni.error.message);

  box.innerHTML = htmlSquadraCantiere(squadraAperta, errori);
}

// Documenti in vigore di dipendenti e subappaltatori (sql/32): li
// leggono titolare, segreteria e capo tecnico. null = non disponibili.
async function caricaDocumentiSquadra() {
  if (typeof verificaTeamSubappaltiDisponibili !== 'function' || !(await verificaTeamSubappaltiDisponibili())) return null;
  const { data, error } = await db
    .from('documenti_team_subappalti')
    .select('id, utente_id, subappaltatore_id, tipo, descrizione, data_scadenza')
    .is('sostituito_da', null);
  if (error) return null;
  return data || [];
}

function htmlSquadraCantiere(s, errori) {
  const c = s.commessa;
  const oggi = dataLocaleISO();
  const prossimi = s.giorni.filter(function(g) { return g.data >= oggi; });
  const passati = s.giorni.filter(function(g) { return g.data < oggi; }).reverse();
  const modifica = puoModificareSquadra(c);

  return `
    <div class="card sq-card">
      <div class="cant-titolo">👷 Squadra e mezzi del giorno</div>
      <div style="font-size:12px;color:var(--m);margin-bottom:8px">I tecnici scelti trovano il cantiere nel loro calendario.</div>
      ${errori.length ? `<div class="al2 e" style="margin:0 0 8px">Errore caricamento: ${esc(errori.join(' · '))}</div>` : ''}
      ${modifica ? `<button class="btn p sq-azione" onclick="apriGiornoSquadra()">➕ Organizza un giorno</button>` : ''}
      ${prossimi.length
        ? prossimi.map(function(g) { return htmlGiornoSquadra(s, g, true); }).join('')
        : `<div class="empty">${s.giorni.length ? 'Nessun giorno in programma da oggi in poi.' : 'Nessun giorno organizzato.'}</div>`}
      ${passati.length ? `
        <details style="margin-top:8px">
          <summary style="font-size:13px;cursor:pointer;color:var(--m)">Giorni passati (${passati.length})</summary>
          ${passati.map(function(g) { return htmlGiornoSquadra(s, g, false); }).join('')}
        </details>
      ` : ''}
    </div>
  `;
}

function htmlGiornoSquadra(s, g, conAvvisi) {
  const c = s.commessa;
  const persone = g.commesse_squadra_persone || [];
  const giorni = [g.data];

  const dipendenti = persone.filter(function(p) { return p.utente_id; }).map(function(p) {
    const u = s.utenti.find(function(x) { return x.id === p.utente_id; });
    const avvisi = conAvvisi
      ? htmlAvvisiSquadra(impegniDi(s.impegni, 'utente_id', p.utente_id, giorni), avvisiDocumentiSquadra('utente', p.utente_id, giorni, s.documenti, c), false)
      : '';
    return `<div class="sq-persona"><b>${esc(u ? nomeUtenteSquadra(u) : 'Dipendente')}</b>${u && u.attivo === false ? ' <span class="bx berr">Non attivo</span>' : ''}${avvisi}</div>`;
  });

  const subappalti = persone.filter(function(p) { return p.subappaltatore_id; }).map(function(p) {
    const sa = s.subappaltatori.find(function(x) { return x.id === p.subappaltatore_id; });
    const avvisi = conAvvisi
      ? htmlAvvisiSquadra(impegniDi(s.impegni, 'subappaltatore_id', p.subappaltatore_id, giorni), avvisiDocumentiSquadra('subappaltatore', p.subappaltatore_id, giorni, s.documenti, c), false)
      : '';
    return `<div class="sq-persona"><b>${esc(sa ? sa.ragione_sociale : 'Subappaltatore')}</b> <span style="font-size:11px;color:var(--m)">subappaltatore</span>${sa && sa.attivo === false ? ' <span class="bx berr">Non attivo</span>' : ''}${avvisi}</div>`;
  });

  const mezzi = (g.commesse_squadra_mezzi || []).map(function(r) {
    const m = s.mezzi.find(function(x) { return x.id === r.mezzo_id; });
    const occupato = conAvvisi ? impegniDi(s.impegni, 'mezzo_id', r.mezzo_id, giorni) : [];
    return `<span class="bx ${occupato.length ? 'bwarn' : 'bgray'}" title="${esc(occupato.map(function(i) { return i.testo; }).join(', '))}">${esc(m ? nomeMezzoSquadra(m) : 'Mezzo')}${occupato.length ? ' · anche ' + esc(occupato.map(function(i) { return i.testo; }).join(', ')) : ''}</span>`;
  });

  const modificabile = puoModificareGiornoSquadra(c, g.data);

  return `
    <div class="sq-giorno">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">
        <div>
          <div style="font-size:14px;font-weight:700">📅 <span style="text-transform:capitalize">${esc(etichettaGiornoSquadra(g.data))}</span></div>
          ${g.orario ? `<div style="font-size:13px">🕐 ${esc(g.orario)}</div>` : ''}
        </div>
        ${modificabile ? `
          <div style="display:flex;gap:6px">
            <button class="btn sm" onclick="apriGiornoSquadra('${esc(g.id)}')">✏️ Modifica</button>
            <button class="btn sm" onclick="togliGiornoSquadra('${esc(g.id)}')">🗑️</button>
          </div>
        ` : ''}
      </div>
      ${dipendenti.join('')}
      ${subappalti.join('')}
      ${mezzi.length || g.altri_mezzi ? `
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${mezzi.join('')}${g.altri_mezzi ? `<span class="bx bgray">➕ ${esc(g.altri_mezzi)}</span>` : ''}</div>
      ` : '<div style="font-size:12px;color:var(--m);margin-top:4px">Nessun mezzo o attrezzatura indicato</div>'}
      ${g.note ? `<div style="font-size:12px;margin-top:6px;white-space:pre-wrap">📝 ${esc(g.note)}</div>` : ''}
    </div>
  `;
}

// ── Finestra "Squadra del giorno" ───────────────────────────────────
function apriGiornoSquadra(giornoId) {
  if (!squadraAperta) return;
  const s = squadraAperta;
  const c = s.commessa;
  const g = giornoId ? s.giorni.find(function(x) { return x.id === giornoId; }) : null;
  if (giornoId && !g) return;
  squadraModulo = { giornoId: g ? g.id : null };

  ge('sqg-titolo').textContent = g ? '👷 Squadra di ' + etichettaGiornoSquadra(g.data) : '👷 Organizza un giorno';
  ge('sqg-sottotitolo').textContent = 'Commessa ' + c.codice +
    (c.clienti?.ragione_sociale ? ' · ' + c.clienti.ragione_sociale : '') +
    (c.titolo ? ' · ' + c.titolo : '');

  ge('sqg-dal').value = g ? g.data : proponiGiornoSquadra(s);
  ge('sqg-dal').disabled = !!g;
  ge('sqg-al').value = '';
  ge('sqg-salta-weekend').checked = true;
  ge('sqg-orario').value = g ? (g.orario || '') : '';
  ge('sqg-altri-mezzi').value = g ? (g.altri_mezzi || '') : '';
  ge('sqg-note').value = g ? (g.note || '') : '';
  ge('sqg-al-etichetta').textContent = g ? 'Stessa squadra anche nei giorni seguenti, fino al (facoltativo)' : 'Stessa squadra fino al (facoltativo, per più giorni di fila)';

  const scelti = {
    utenti: g ? (g.commesse_squadra_persone || []).filter(function(p) { return p.utente_id; }).map(function(p) { return p.utente_id; }) : [],
    sub: g ? (g.commesse_squadra_persone || []).filter(function(p) { return p.subappaltatore_id; }).map(function(p) { return p.subappaltatore_id; }) : [],
    mezzi: g ? (g.commesse_squadra_mezzi || []).map(function(r) { return r.mezzo_id; }) : []
  };
  // Senza giorno: propone la squadra dell'ultimo giorno organizzato.
  if (!g && s.giorni.length) {
    const ultimo = s.giorni[s.giorni.length - 1];
    scelti.utenti = (ultimo.commesse_squadra_persone || []).filter(function(p) { return p.utente_id; }).map(function(p) { return p.utente_id; });
    scelti.sub = (ultimo.commesse_squadra_persone || []).filter(function(p) { return p.subappaltatore_id; }).map(function(p) { return p.subappaltatore_id; });
    scelti.mezzi = (ultimo.commesse_squadra_mezzi || []).map(function(r) { return r.mezzo_id; });
    ge('sqg-orario').value = ultimo.orario || '';
  }
  ge('sqg-proposta').style.display = (!g && s.giorni.length) ? 'block' : 'none';

  renderElenchiSquadra(scelti);
  ge('sqg-salva').disabled = false;
  openM('m-squadra-giorno');
  aggiornaImpegniSquadra();
}

// Primo giorno libero da oggi (o dall'inizio lavori, se il faldone lo dice), saltando sabato e domenica.
function proponiGiornoSquadra(s) {
  let iso = dataLocaleISO();
  const inizio = typeof cantiereAperto !== 'undefined' && cantiereAperto && cantiereAperto.commessa?.id === s.commessa.id
    ? cantiereAperto.dati?.data_inizio
    : null;
  if (inizio && inizio > iso) iso = inizio;
  const occupati = s.giorni.map(function(g) { return g.data; });
  for (let i = 0; i < 60; i++) {
    const dow = new Date(iso + 'T00:00:00').getDay();
    if (dow !== 0 && dow !== 6 && !occupati.includes(iso)) return iso;
    iso = sommaGiorniSquadra(iso, 1);
  }
  return dataLocaleISO();
}

function sceltiSquadra() {
  function valori(sel) {
    return Array.from(document.querySelectorAll(sel + ' input[type=checkbox]:checked')).map(function(i) { return i.value; });
  }
  return { utenti: valori('#sqg-dipendenti'), sub: valori('#sqg-subappaltatori'), mezzi: valori('#sqg-mezzi') };
}

function renderElenchiSquadra(scelti) {
  const s = squadraAperta;
  if (!s) return;

  function riga(gruppo, id, testo, dettaglio, spuntato) {
    return `
      <label class="sq-scelta" data-gruppo="${gruppo}" data-id="${esc(id)}">
        <input type="checkbox" value="${esc(id)}"${spuntato ? ' checked' : ''} onchange="aggiornaRiepilogoAvvisiSquadra()">
        <span style="min-width:0;flex:1">
          <span style="font-weight:600">${esc(testo)}</span>${dettaglio ? ` <span style="font-size:11px;color:var(--m)">${esc(dettaglio)}</span>` : ''}
          <span class="sq-scelta-avvisi"></span>
        </span>
      </label>
    `;
  }

  // Attivi + quelli già scelti (anche se non più attivi).
  const utenti = s.utenti.filter(function(u) { return u.attivo !== false || scelti.utenti.includes(u.id); });
  const sub = s.subappaltatori.filter(function(x) { return x.attivo !== false || scelti.sub.includes(x.id); });
  const mezzi = s.mezzi.filter(function(m) { return m.attivo !== false || scelti.mezzi.includes(m.id); })
    .sort(function(a, b) { return (a.tipo === b.tipo ? 0 : a.tipo === 'mezzo' ? -1 : 1) || a.nome.localeCompare(b.nome, 'it'); });

  ge('sqg-dipendenti').innerHTML = utenti.length
    ? utenti.map(function(u) { return riga('utente', u.id, nomeUtenteSquadra(u), etichettaRuolo(u.ruolo) + (u.attivo === false ? ' · non attivo' : ''), scelti.utenti.includes(u.id)); }).join('')
    : '<div class="empty">Nessun tecnico attivo.</div>';
  ge('sqg-subappaltatori').innerHTML = sub.length
    ? sub.map(function(x) { return riga('subappaltatore', x.id, x.ragione_sociale, x.attivo === false ? 'non attivo' : '', scelti.sub.includes(x.id)); }).join('')
    : '<div style="font-size:12px;color:var(--m)">Nessun subappaltatore in anagrafica (Team e subappalti).</div>';
  ge('sqg-mezzi').innerHTML = mezzi.length
    ? mezzi.map(function(m) { return riga('mezzo', m.id, (m.tipo === 'mezzo' ? '🚐 ' : '🧰 ') + m.nome, [m.targa_matricola, m.attivo === false ? 'non attivo' : ''].filter(Boolean).join(' · '), scelti.mezzi.includes(m.id)); }).join('')
    : '<div style="font-size:12px;color:var(--m)">Elenco vuoto: aggiungi furgoni, trabattelli, PLE... con "Elenco mezzi e attrezzature", oppure scrivili qui sotto.</div>';

  aggiornaRiepilogoAvvisiSquadra();
}

// Rilegge gli impegni quando cambiano le date (con un piccolo ritardo).
function aggiornaImpegniSquadra() {
  clearTimeout(timerImpegniSquadra);
  timerImpegniSquadra = setTimeout(caricaImpegniModuloSquadra, 250);
}

async function caricaImpegniModuloSquadra() {
  const s = squadraAperta;
  if (!s || !squadraModulo) return;
  const giorni = giorniTraDateSquadra(v('sqg-dal'), v('sqg-al'), ge('sqg-salta-weekend').checked);
  squadraModulo.giorni = giorni;
  squadraModulo.impegni = [];
  if (!giorni.length || giorni[giorni.length - 1] > sommaGiorniSquadra(giorni[0], 92)) {
    aggiornaRiepilogoAvvisiSquadra();
    return;
  }
  const richiesta = { dal: giorni[0], al: giorni[giorni.length - 1] };
  squadraModulo.richiesta = richiesta;
  const { data, error } = await db.rpc('impegni_squadra_periodo', {
    p_dal: richiesta.dal,
    p_al: richiesta.al,
    p_commessa_id: s.commessa.id
  });
  if (!squadraModulo || squadraModulo.richiesta !== richiesta) return; // date cambiate nel frattempo
  squadraModulo.impegni = error ? [] : (data || []);
  squadraModulo.erroreImpegni = error ? error.message : '';
  aggiornaRiepilogoAvvisiSquadra();
}

function aggiornaRiepilogoAvvisiSquadra() {
  const s = squadraAperta;
  if (!s || !squadraModulo) return;
  const giorni = squadraModulo.giorni || giorniTraDateSquadra(v('sqg-dal'), v('sqg-al'), ge('sqg-salta-weekend').checked);
  const impegni = squadraModulo.impegni || [];
  const piuGiorni = giorni.length > 1;
  let avvisiScelti = 0;

  document.querySelectorAll('#m-squadra-giorno .sq-scelta').forEach(function(el) {
    const gruppo = el.dataset.gruppo;
    const id = el.dataset.id;
    const chiave = gruppo === 'utente' ? 'utente_id' : gruppo === 'subappaltatore' ? 'subappaltatore_id' : 'mezzo_id';
    const imp = impegniDi(impegni, chiave, id, giorni);
    const doc = gruppo === 'mezzo' ? [] : avvisiDocumentiSquadra(gruppo, id, giorni, s.documenti, s.commessa);
    const html = htmlAvvisiSquadra(imp, doc, piuGiorni);
    const spazio = el.querySelector('.sq-scelta-avvisi');
    if (spazio) spazio.innerHTML = html;
    const spuntato = el.querySelector('input')?.checked;
    el.classList.toggle('on', !!spuntato);
    if (spuntato && html) avvisiScelti++;
  });

  const riepilogo = ge('sqg-avvisi');
  if (!riepilogo) return;
  const parti = [];
  if (!giorni.length) parti.push('<div class="al2 w" style="margin:0 0 8px">Nessun giorno: controlla le date (sabato e domenica sono saltati).</div>');
  else if (piuGiorni) parti.push(`<div class="al2 i" style="margin:0 0 8px">Stessa squadra per <b>${giorni.length} giorni</b>: ${esc(giorni.map(dataBreveSquadra).join(', '))}. I giorni già organizzati vengono sostituiti.</div>`);
  if (squadraModulo.erroreImpegni) parti.push(`<div class="al2 e" style="margin:0 0 8px">Impegni non verificati: ${esc(squadraModulo.erroreImpegni)}</div>`);
  if (s.documenti === null) parti.push('<div style="font-size:12px;color:var(--m);margin-bottom:8px">Documenti non verificati (Team e subappalti non attivo).</div>');
  if (avvisiScelti) parti.push(`<div class="al2 w" style="margin:0 0 8px">⚠️ <b>${avvisiScelti}</b> ${avvisiScelti === 1 ? 'scelta ha' : 'scelte hanno'} un avviso (già impegnati o documenti): puoi salvare lo stesso.</div>`);
  riepilogo.innerHTML = parti.join('');
}

async function salvaGiornoSquadra() {
  const s = squadraAperta;
  if (!s || !squadraModulo) return;
  const dal = v('sqg-dal');
  const al = v('sqg-al');
  const saltaWeekend = ge('sqg-salta-weekend').checked;
  const scelti = sceltiSquadra();

  if (!dal) { toast('Indica il giorno', 'err'); return; }
  if (al && al < dal) { toast('Il giorno finale non può essere prima del primo', 'err'); return; }
  if (!scelti.utenti.length && !scelti.sub.length) { toast('Scegli almeno una persona o un subappaltatore', 'err'); return; }
  const giorni = giorniTraDateSquadra(dal, al, saltaWeekend);
  if (!giorni.length) { toast('Nessun giorno da salvare: tra le date ci sono solo sabati e domeniche', 'err'); return; }
  if (giorni.length > 63) { toast('Al massimo 63 giorni alla volta', 'err'); return; }
  if (dal < dataLocaleISO() && ROLE !== 'titolare') { toast('I giorni passati li cambia solo il titolare', 'err'); return; }

  // Avvisi sulle scelte: si conferma e si salva lo stesso.
  const conAvviso = Array.from(document.querySelectorAll('#m-squadra-giorno .sq-scelta.on'))
    .filter(function(el) { return el.querySelector('.sq-scelta-avvisi')?.textContent.trim(); })
    .map(function(el) { return el.querySelector('span span')?.textContent.trim(); });
  if (conAvviso.length && !confirm('Attenzione, ci sono avvisi per: ' + conAvviso.join(', ') + '.\n\nSalvare comunque la squadra?')) return;

  const bottone = ge('sqg-salva');
  if (bottone) bottone.disabled = true;

  const { data, error } = await db.rpc('salva_squadra_cantiere', {
    p_commessa_id: s.commessa.id,
    p_dal: dal,
    p_al: al || null,
    p_salta_weekend: saltaWeekend,
    p_utenti: scelti.utenti,
    p_subappaltatori: scelti.sub,
    p_mezzi: scelti.mezzi,
    p_orario: (v('sqg-orario') || '').trim() || null,
    p_altri_mezzi: (v('sqg-altri-mezzi') || '').trim() || null,
    p_note: (v('sqg-note') || '').trim() || null
  });

  if (bottone) bottone.disabled = false;

  if (error) {
    toast('Squadra non salvata: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-squadra-giorno');
  squadraModulo = null;
  toast(data > 1 ? 'Squadra salvata per ' + data + ' giorni' : 'Squadra salvata', 'ok');
  if (commessaApertaId === s.commessa.id) await caricaSquadraCantiere(s.commessa);
}

async function togliGiornoSquadra(giornoId) {
  const s = squadraAperta;
  if (!s) return;
  const g = s.giorni.find(function(x) { return x.id === giornoId; });
  if (!g) return;
  if (!confirm('Togliere la squadra di ' + etichettaGiornoSquadra(g.data) + '?\nI tecnici non vedranno più il cantiere nel calendario per quel giorno.')) return;
  const { error } = await db.rpc('togli_giorno_squadra', { p_giorno_id: giornoId });
  if (error) {
    toast('Giorno non tolto: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }
  toast('Giorno tolto', 'ok');
  if (commessaApertaId === s.commessa.id) await caricaSquadraCantiere(s.commessa);
}

// ── Elenco mezzi e attrezzature (anagrafica, sql/35) ────────────────
function apriElencoMezzi() {
  ge('mza-id').value = '';
  ge('mza-nome').value = '';
  ge('mza-tipo').value = 'mezzo';
  ge('mza-targa').value = '';
  ge('mza-note').value = '';
  ge('mza-salva').textContent = '➕ Aggiungi';
  renderElencoMezzi();
  openM('m-mezzi-attrezzature');
}

function renderElencoMezzi() {
  const elenco = (squadraAperta?.mezzi || []).slice()
    .sort(function(a, b) { return (a.attivo === b.attivo ? 0 : a.attivo ? -1 : 1) || (a.tipo === b.tipo ? 0 : a.tipo === 'mezzo' ? -1 : 1) || a.nome.localeCompare(b.nome, 'it'); });
  ge('mza-elenco').innerHTML = elenco.length
    ? elenco.map(function(m) {
        return `
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--bo);flex-wrap:wrap">
            <div style="min-width:0;flex:1">
              <div style="font-size:13px;font-weight:600;${m.attivo === false ? 'color:var(--m);text-decoration:line-through' : ''}">${esc(nomeMezzoSquadra(m))}</div>
              ${m.note ? `<div style="font-size:11px;color:var(--m)">${esc(m.note)}</div>` : ''}
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn sm" onclick="modificaMezzoElenco('${esc(m.id)}')">✏️</button>
              <button class="btn sm" onclick="cambiaAttivoMezzo('${esc(m.id)}', ${m.attivo === false ? 'true' : 'false'})">${m.attivo === false ? 'Riattiva' : 'Non attivo'}</button>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="empty">Nessun mezzo o attrezzatura in elenco.</div>';
}

function modificaMezzoElenco(id) {
  const m = (squadraAperta?.mezzi || []).find(function(x) { return x.id === id; });
  if (!m) return;
  ge('mza-id').value = m.id;
  ge('mza-nome').value = m.nome || '';
  ge('mza-tipo').value = m.tipo || 'attrezzatura';
  ge('mza-targa').value = m.targa_matricola || '';
  ge('mza-note').value = m.note || '';
  ge('mza-salva').textContent = '💾 Salva modifiche';
  ge('mza-nome').focus();
}

async function ricaricaMezziSquadra() {
  const { data, error } = await db.from('mezzi_attrezzature').select('id, nome, tipo, targa_matricola, note, attivo').order('nome');
  if (error) { toast('Elenco mezzi non letto: ' + error.message, 'err'); return; }
  if (squadraAperta) squadraAperta.mezzi = data || [];
  renderElencoMezzi();
  // Aggiorna la finestra della squadra senza perdere le scelte.
  if (squadraModulo && ge('m-squadra-giorno')?.classList.contains('on')) renderElenchiSquadra(sceltiSquadra());
}

async function salvaMezzoElenco() {
  const id = v('mza-id');
  const nome = (v('mza-nome') || '').trim();
  const riga = {
    nome: nome,
    tipo: v('mza-tipo') === 'mezzo' ? 'mezzo' : 'attrezzatura',
    targa_matricola: (v('mza-targa') || '').trim() || null,
    note: (v('mza-note') || '').trim() || null
  };
  if (!nome) { toast('Scrivi il nome del mezzo o dell\'attrezzatura', 'err'); return; }
  const doppio = (squadraAperta?.mezzi || []).find(function(m) {
    return m.id !== id && m.nome.trim().toLowerCase() === nome.toLowerCase() && (m.targa_matricola || '') === (riga.targa_matricola || '');
  });
  if (doppio) { toast('È già in elenco: ' + nomeMezzoSquadra(doppio), 'err'); return; }

  const r = id
    ? await db.from('mezzi_attrezzature').update(riga).eq('id', id)
    : await db.from('mezzi_attrezzature').insert(riga);
  if (r.error) { toast('Non salvato: ' + r.error.message, 'err'); return; }

  toast(id ? 'Modificato' : 'Aggiunto all\'elenco', 'ok');
  ge('mza-id').value = '';
  ge('mza-nome').value = '';
  ge('mza-targa').value = '';
  ge('mza-note').value = '';
  ge('mza-salva').textContent = '➕ Aggiungi';
  await ricaricaMezziSquadra();
}

async function cambiaAttivoMezzo(id, attivo) {
  const { error } = await db.from('mezzi_attrezzature').update({ attivo: attivo }).eq('id', id);
  if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
  toast(attivo ? 'Riattivato' : 'Segnato non attivo: non si potrà più scegliere', 'ok');
  await ricaricaMezziSquadra();
}

// ── Calendario e dashboard del tecnico: i miei giorni di cantiere ───
// Funziona per ogni ruolo (mostra solo i giorni in cui chi guarda è
// nella squadra). Senza sql/35 il riquadro resta vuoto.
async function leggiMieiGiorniCantiere(dal, al) {
  const { data, error } = await db.rpc('miei_giorni_cantiere', { p_dal: dal, p_al: al });
  if (error) {
    if (!rpcSquadraMancante(error)) console.warn('I miei cantieri:', error.message);
    return { giorni: [], errore: rpcSquadraMancante(error) ? '' : error.message };
  }
  return { giorni: data || [], errore: '' };
}

// Chiamata da js/05 alla fine di loadCalendarioTecnico (mese mostrato).
async function caricaCantieriCalendarioTecnico(anno, mese) {
  const box = ge('cal-tec-cantieri');
  if (!box) return;
  const dal = dataLocaleISO(new Date(anno, mese, 1));
  const al = dataLocaleISO(new Date(anno, mese + 1, 0));
  const r = await leggiMieiGiorniCantiere(dal, al);
  if (_calTecAnno !== anno || _calTecMese !== mese) return; // cambiato mese nel frattempo

  if (r.errore) {
    box.innerHTML = `<div class="al2 e">Cantieri non caricati: ${esc(r.errore)}</div>`;
    return;
  }
  if (!r.giorni.length) { box.innerHTML = ''; return; }

  const oggi = dataLocaleISO();
  const prossimi = r.giorni.filter(function(g) { return g.data >= oggi; });
  const passati = r.giorni.filter(function(g) { return g.data < oggi; });
  box.innerHTML = `
    <div class="card sq-tec" style="margin-bottom:14px;border-left:3px solid #EF9F27">
      <div style="font-size:15px;font-weight:700;margin-bottom:8px">🏗️ I miei cantieri del mese (${r.giorni.length} ${r.giorni.length === 1 ? 'giorno' : 'giorni'})</div>
      ${prossimi.map(function(g, i) { return htmlGiornoCantiereTecnico(g, i === 0); }).join('')}
      ${!prossimi.length ? '<div style="font-size:13px;color:var(--m)">Nessun altro giorno di cantiere questo mese.</div>' : ''}
      ${passati.length ? `
        <details style="margin-top:6px">
          <summary style="font-size:13px;cursor:pointer;color:var(--m)">Giorni passati (${passati.length})</summary>
          ${passati.map(function(g) { return htmlGiornoCantiereTecnico(g, false); }).join('')}
        </details>
      ` : ''}
    </div>
  `;
}

// Chiamata da js/03 dopo la dashboard del tecnico: oggi e 6 giorni dopo.
async function caricaMieiCantieriDashboard() {
  const box = ge('tec-miei-cantieri');
  if (!box) return;
  const oggi = dataLocaleISO();
  const r = await leggiMieiGiorniCantiere(oggi, sommaGiorniSquadra(oggi, 6));
  if (r.errore || !r.giorni.length) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="tec-sec-title">
      <h2>🏗️ I miei cantieri</h2>
      <span class="tec-badge">${r.giorni.length}</span>
    </div>
    <div class="card sq-tec" style="border-left:3px solid #EF9F27">
      ${r.giorni.map(function(g, i) { return htmlGiornoCantiereTecnico(g, i === 0); }).join('')}
    </div>
  `;
}

// Un giorno di cantiere per il tecnico: il minimo per andarci, niente prezzi.
function htmlGiornoCantiereTecnico(g, aperto) {
  const c = g.commessa || {};
  const cli = g.cliente || {};
  const cant = g.cantiere || {};
  const sede = g.sede;
  const indirizzo = typeof indirizzoCompletoSede === 'function' ? indirizzoCompletoSede(sede) : '';
  const mappa = typeof linkMappaCantiere === 'function' ? linkMappaCantiere(sede) : '';
  const referenteCantiere = !!(cant.referente_nome || cant.referente_telefono);
  const referente = referenteCantiere
    ? { nome: cant.referente_nome, ruolo: cant.referente_ruolo, telefono: cant.referente_telefono }
    : { nome: cli.referente_nome, ruolo: '', telefono: cli.referente_telefono };
  const riserva = (cant.riserva_nome || cant.riserva_telefono)
    ? { nome: cant.riserva_nome, ruolo: cant.riserva_ruolo, telefono: cant.riserva_telefono }
    : null;
  const colleghi = (g.squadra || []).filter(function(p) { return !p.io; });

  function campo(etichetta, testo) {
    if (!testo) return '';
    return `<div class="sq-tec-campo"><div class="sq-tec-etichetta">${esc(etichetta)}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(testo)}</div></div>`;
  }
  function chiama(p, titolo) {
    if (!p || !(p.nome || p.telefono)) return '';
    const numero = String(p.telefono || '').replace(/[^0-9+]/g, '');
    return `
      <div class="sq-tec-campo">
        <div class="sq-tec-etichetta">${esc(titolo)}</div>
        <div style="font-weight:600">${esc(p.nome || 'Nome non indicato')}${p.ruolo ? ` <span style="font-weight:400;color:var(--m)">· ${esc(p.ruolo)}</span>` : ''}</div>
        ${numero ? `<a class="btn p sq-azione" href="tel:${esc(numero)}">📞 Chiama · ${esc(p.telefono)}</a>` : ''}
      </div>
    `;
  }

  const mezzi = (g.mezzi || []).map(function(m) { return nomeMezzoSquadra(m); });
  if (g.altri_mezzi) mezzi.push('➕ ' + g.altri_mezzi);

  return `
    <details class="sq-tec-giorno"${aperto ? ' open' : ''}>
      <summary>
        <div style="font-size:14px;font-weight:700">📅 <span style="text-transform:capitalize">${esc(etichettaGiornoSquadra(g.data))}</span>${g.orario ? ' · ' + esc(g.orario) : ''}</div>
        <div style="font-size:13px">🏗️ <b>${esc(cli.ragione_sociale || 'Cliente')}</b> · commessa ${esc(c.codice || '')}${c.titolo ? ' · ' + esc(c.titolo) : ''}</div>
        ${indirizzo ? `<div style="font-size:12px;color:var(--m)">📍 ${esc(indirizzo)}</div>` : ''}
      </summary>
      <div style="padding-top:6px">
        ${sede
          ? (mappa ? `<a class="btn p sq-azione" href="${esc(mappa)}" target="_blank" rel="noopener">🗺️ Apri la mappa</a>` : '')
          : '<div class="al2 w" style="margin:0 0 6px">Sede del cantiere non ancora indicata: chiedi al capo tecnico.</div>'}
        ${sede && sede.note ? campo('Note della sede', sede.note) : ''}
        ${campo('Piano e zona di lavoro', cant.piano_zona)}
        ${campo('Orari di accesso', cant.orari)}
        ${campo('Istruzioni di accesso', cant.accessi)}
        ${cant.note_sicurezza ? `<div class="al2 w" style="margin:6px 0"><b>⛑️ Sicurezza:</b> <span style="white-space:pre-wrap">${esc(cant.note_sicurezza)}</span></div>` : ''}
        ${chiama(referente, referenteCantiere ? 'Referente in cantiere' : 'Referente del cliente')}
        ${chiama(riserva, 'Riserva')}
        ${colleghi.length ? `<div class="sq-tec-campo"><div class="sq-tec-etichetta">Con te</div>${colleghi.map(function(p) {
          const numero = String(p.telefono || '').replace(/[^0-9+]/g, '');
          return `<div>${esc(p.nome)}${numero ? ` · <a href="tel:${esc(numero)}">${esc(p.telefono)}</a>` : ''}</div>`;
        }).join('')}</div>` : ''}
        ${(g.subappaltatori || []).length ? `<div class="sq-tec-campo"><div class="sq-tec-etichetta">Subappaltatori</div>${g.subappaltatori.map(function(sa) {
          const numero = String(sa.referente_telefono || '').replace(/[^0-9+]/g, '');
          return `<div>${esc(sa.nome)}${sa.referente_nome ? ' · ' + esc(sa.referente_nome) : ''}${numero ? ` · <a href="tel:${esc(numero)}">${esc(sa.referente_telefono)}</a>` : ''}</div>`;
        }).join('')}</div>` : ''}
        ${mezzi.length ? `<div class="sq-tec-campo"><div class="sq-tec-etichetta">Mezzi e attrezzature</div>${mezzi.map(function(m) { return `<div>${esc(m)}</div>`; }).join('')}</div>` : ''}
        ${campo('Note del giorno', g.note)}
      </div>
    </details>
  `;
}
