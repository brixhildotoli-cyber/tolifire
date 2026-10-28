// =====================================================================
// F8.4 — GIORNALE DI CANTIERE E PERFORMANCE DEGLI OPERAI (passo 11,
// Capo Operativo = capo_tecnico). Per ogni giorno: chi era presente
// (dipendenti e subappaltatori), le ore su ogni lavorazione, i lavori
// fatti, problemi e note, le foto. Per la commessa: ore effettive contro
// ore stimate, per lavorazione, per persona e per squadra.
// Box nella scheda "🏗️ Cantiere" della commessa (js/26):
//   "📓 Giornale di cantiere" (cmd-giornale): titolare, segreteria, capo
//     tecnico (la segreteria vede i presenti SENZA ore);
//   "⏱️ Ore stimate e ore effettive" (cmd-ore) + riquadro compatto in
//     "Commessa e documenti" (cmd-ore-compatto): solo titolare e capo
//     tecnico (le ore per persona sono un dato sensibile).
// Scrivono capo tecnico e titolare: giorni futuri mai, giorni più vecchi
// di 7 giorni solo il titolare, commessa chiusa o annullata solo il
// titolare (stesse regole nel database, sql/37).
// Lavorazioni con le ore stimate (finestra m-lavorazioni-ore): proposte
// dalle voci del preventivo (scheda_cantiere_commessa di sql/34, senza
// prezzi; le voci in ore danno le ore stimate) e dalle fasi del
// cronoprogramma (js/34, se attivo).
// Foto: riuso della cartella documenti della commessa (js/26, sql/29,
// bucket privato commesse-documenti, cartella "cantiere", RPC
// registra_documento_commessa); il nome del file comincia con
// giornale_<AAAA-MM-GG>_ e così il giornale ritrova le foto del giorno.
// Le foto grandi si rimpiccioliscono nel telefono prima di partire.
// Il tecnico vede solo le sue ore nel calendario (cal-tec-ore,
// mie_ore_cantiere). Tutto attivo con sql/37-giornale-cantiere (richiede
// 07, 26, 32). Senza: i box dicono "non ancora attivo".
// =====================================================================

const RUOLI_LEGGONO_GIORNALE = ['titolare', 'segreteria', 'capo_tecnico'];
const RUOLI_LEGGONO_ORE_CANTIERE = ['titolare', 'capo_tecnico'];
const GIORNI_INDIETRO_GIORNALE = 7;      // come sql/37 (controlla_giorno_giornale)
const PREFISSO_FOTO_GIORNALE = 'giornale_';
const ORE_PROPOSTE_GIORNALE = 8;
const GIORNI_GIORNALE_IN_VISTA = 7;      // gli altri in "Giorni precedenti"
const LATO_MAX_FOTO_GIORNALE = 1920;     // px: le foto più grandi si rimpiccioliscono

let giornaleDisponibile = null;
let giornaleAperto = null;   // { commessa, giorni, lavorazioni, ore, presenti, utenti, subappaltatori, foto, urlFoto, vedeOre }
let giornaleModulo = null;   // { commessa, giorno, esistente, righe, foto }
let lavorazioniModulo = null; // { commessa, righe, proposte }
let giornoFotoRapide = null;

// ── Disponibilità di sql/37 ─────────────────────────────────────────
async function verificaGiornaleDisponibile() {
  if (giornaleDisponibile !== null) return giornaleDisponibile;
  if (!(await verificaCommesseDisponibili())) return false;

  const { error } = await db
    .from('commesse_lavorazioni')
    .select('id')
    .limit(1);

  if (!error) {
    giornaleDisponibile = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /commesse_lavorazioni/i.test(error.message || '')) {
    giornaleDisponibile = false;
  } else {
    return false;
  }
  return giornaleDisponibile;
}

function rpcGiornaleMancante(error) {
  return !!error && (error.code === 'PGRST202' || error.code === '42883' ||
    (/mie_ore_cantiere|presenti_giornale_commessa/i.test(error.message || '') && /find|exist|schema cache/i.test(error.message || '')));
}

// ── Chi può fare cosa (le stesse regole le impone il database) ──────
function puoModificareGiornale(commessa) {
  if (ROLE === 'titolare') return true;
  return ROLE === 'capo_tecnico' && commessaAperta(commessa);
}

function primoGiornoModificabileGiornale() {
  return ROLE === 'titolare' ? null : sommaGiorniGiornale(dataLocaleISO(), -GIORNI_INDIETRO_GIORNALE);
}

function puoModificareGiornoGiornale(commessa, giorno) {
  if (!puoModificareGiornale(commessa)) return false;
  if (giorno > dataLocaleISO()) return false;
  const primo = primoGiornoModificabileGiornale();
  return !primo || giorno >= primo;
}

// ── Piccoli aiuti ───────────────────────────────────────────────────
function sommaGiorniGiornale(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dataLocaleISO(d);
}

function etichettaGiornoGiornale(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

function testoOre(n) {
  const x = Math.round((Number(n) || 0) * 100) / 100;
  return x.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' h';
}

// Unità di misura in ore (h, ora, ore, ore uomo...): la quantità della voce
// del preventivo diventa la proposta di ore stimate.
function unitaInOre(unita) {
  const u = String(unita || '').trim().toLowerCase().replace(/\.$/, '');
  return /^(h|hh|hr|hrs|ora|ore|ore[ /-]?uomo|h[ /-]?uomo|uomo[ /-]?ora|ore lavoro)$/.test(u);
}

function oreRigaGiornale(r) {
  return (Number(r.ore) || 0) * (Number(r.persone) || 1);
}

function chiavePersonaGiornale(r) {
  return r.utente_id ? 'u:' + r.utente_id : 's:' + r.subappaltatore_id;
}

function nomePersonaGiornale(s, r) {
  if (r.utente_id) {
    const u = (s.utenti || []).find(function(x) { return x.id === r.utente_id; });
    return u ? [u.nome, u.cognome].filter(Boolean).join(' ') || 'Dipendente' : 'Dipendente';
  }
  const sa = (s.subappaltatori || []).find(function(x) { return x.id === r.subappaltatore_id; });
  return sa ? sa.ragione_sociale : 'Subappaltatore';
}

function nomeLavorazioneGiornale(s, id) {
  if (!id) return 'Altro (non in elenco)';
  const l = (s.lavorazioni || []).find(function(x) { return x.id === id; });
  return l ? l.nome : 'Lavorazione';
}

// Giorno della foto dal nome del file: <commessa>/cantiere/giornale_AAAA-MM-GG_...
function giornoFotoGiornale(documento) {
  const nome = String(documento.storage_path || '').split('/')[2] || '';
  const m = nome.match(/^giornale_(\d{4}-\d{2}-\d{2})_/);
  return m ? m[1] : null;
}

function fotoImmagine(documento) {
  return /^image\//.test(documento.tipo_mime || '') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(documento.nome_file || '');
}

// ── Caricamento dei box (chiamata da js/26 dopo la squadra del giorno) ─
async function caricaGiornaleCantiere(commessa) {
  const boxG = ge('cmd-giornale');
  const boxO = ge('cmd-ore');
  const compatto = ge('cmd-ore-compatto');
  if (!commessa) return;
  if (boxG) boxG.innerHTML = '';
  if (boxO) boxO.innerHTML = '';
  if (compatto) compatto.innerHTML = '';
  giornaleAperto = null;
  if (!RUOLI_LEGGONO_GIORNALE.includes(ROLE)) return;

  const vedeOre = RUOLI_LEGGONO_ORE_CANTIERE.includes(ROLE);
  const titoloG = '<div class="gnc-titolo">📓 Giornale di cantiere</div>';
  const titoloO = '<div class="gnc-titolo">⏱️ Ore stimate e ore effettive</div>';

  if (!(await verificaGiornaleDisponibile())) {
    if (boxG) boxG.innerHTML = `<div class="card gnc-card">${titoloG}<div class="al2 i" style="margin:0">Il giornale di cantiere non è ancora attivo.</div></div>`;
    if (boxO && vedeOre) boxO.innerHTML = `<div class="card gnc-card">${titoloO}<div class="al2 i" style="margin:0">Il confronto tra ore stimate e ore effettive non è ancora attivo.</div></div>`;
    return;
  }

  if (boxG) boxG.innerHTML = `<div class="card gnc-card">${titoloG}<div class="load">Caricamento...</div></div>`;
  if (boxO && vedeOre) boxO.innerHTML = `<div class="card gnc-card">${titoloO}<div class="load">Caricamento...</div></div>`;

  const [rGiorni, rLav, rOre, rUtenti, rSub] = await Promise.all([
    db.from('commesse_giornale')
      .select('id, giorno, lavori_fatti, note, compilato_da_nome, compilato_il, aggiornato_da_nome, aggiornato_il')
      .eq('commessa_id', commessa.id)
      .order('giorno', { ascending: false }),
    db.from('commesse_lavorazioni')
      .select('id, ordine, nome, unita_misura, quantita, ore_stimate')
      .eq('commessa_id', commessa.id)
      .order('ordine'),
    vedeOre
      ? db.from('commesse_giornale_ore')
          .select('id, giornale_id, giorno, utente_id, subappaltatore_id, persone, lavorazione_id, ore')
          .eq('commessa_id', commessa.id)
          .order('giorno')
      : db.rpc('presenti_giornale_commessa', { p_commessa_id: commessa.id }),
    vedeOre
      ? db.from('utenti').select('id, nome, cognome, ruolo, attivo').in('ruolo', ['tecnico', 'capo_tecnico']).order('nome')
      : null,
    vedeOre
      ? db.from('subappaltatori').select('id, ragione_sociale, attivo').order('ragione_sociale')
      : null
  ]);

  if (commessaApertaId && commessaApertaId !== commessa.id) return;

  const errori = [];
  if (rGiorni.error) errori.push('giornale: ' + rGiorni.error.message);
  if (rLav.error) errori.push('lavorazioni: ' + rLav.error.message);
  if (rOre.error) errori.push((vedeOre ? 'ore: ' : 'presenti: ') + rOre.error.message);
  if (rUtenti?.error) errori.push('dipendenti: ' + rUtenti.error.message);
  if (rSub?.error) errori.push('subappaltatori: ' + rSub.error.message);

  // Foto del giornale = documenti della cartella "cantiere" già letti da js/26.
  const documenti = typeof documentiCommessaAperta !== 'undefined' ? (documentiCommessaAperta || []) : [];
  const foto = documenti.filter(function(d) {
    return d.cartella === 'cantiere' && String(d.storage_path || '').indexOf(commessa.id + '/') === 0 && giornoFotoGiornale(d);
  });

  giornaleAperto = {
    commessa: commessa,
    vedeOre: vedeOre,
    giorni: (!rGiorni.error && rGiorni.data) || [],
    lavorazioni: (!rLav.error && rLav.data) || [],
    ore: vedeOre ? ((!rOre.error && rOre.data) || []) : [],
    presenti: vedeOre ? [] : ((!rOre.error && rOre.data) || []),
    utenti: (rUtenti && !rUtenti.error && rUtenti.data) || [],
    subappaltatori: (rSub && !rSub.error && rSub.data) || [],
    foto: foto,
    urlFoto: {},
    errori: errori
  };

  disegnaGiornaleCantiere();
  disegnaOreCantiere();
  await caricaAnteprimeFotoGiornale();
}

// Anteprime delle foto dei giorni in vista (link firmati, 1 ora).
async function caricaAnteprimeFotoGiornale() {
  const s = giornaleAperto;
  if (!s || !s.foto.length) return;
  const inVista = elencoGiorniGiornale(s).slice(0, GIORNI_GIORNALE_IN_VISTA);
  const percorsi = s.foto
    .filter(function(d) { return fotoImmagine(d) && inVista.includes(giornoFotoGiornale(d)); })
    .slice(0, 60)
    .map(function(d) { return d.storage_path; });
  if (!percorsi.length) return;
  const { data, error } = await db.storage.from('commesse-documenti').createSignedUrls(percorsi, 3600);
  if (error || !data || giornaleAperto !== s) return;
  data.forEach(function(r) { if (r.signedUrl && r.path) s.urlFoto[r.path] = r.signedUrl; });
  disegnaGiornaleCantiere();
}

function elencoGiorniGiornale(s) {
  const giorni = {};
  s.giorni.forEach(function(g) { giorni[g.giorno] = true; });
  s.foto.forEach(function(d) { giorni[giornoFotoGiornale(d)] = true; });
  return Object.keys(giorni).sort().reverse();
}

// ── Box "Giornale di cantiere" ──────────────────────────────────────
function disegnaGiornaleCantiere() {
  const s = giornaleAperto;
  const box = ge('cmd-giornale');
  if (!s || !box) return;
  const c = s.commessa;
  const oggi = dataLocaleISO();
  const modifica = puoModificareGiornale(c);
  const giornoOggi = s.giorni.find(function(g) { return g.giorno === oggi; });
  const giorni = elencoGiorniGiornale(s);
  const inVista = giorni.slice(0, GIORNI_GIORNALE_IN_VISTA);
  const precedenti = giorni.slice(GIORNI_GIORNALE_IN_VISTA);

  box.innerHTML = `
    <div class="card gnc-card">
      <div class="gnc-titolo">📓 Giornale di cantiere</div>
      <div style="font-size:12px;color:var(--m);margin-bottom:8px">Ogni giorno: chi c'era, ${s.vedeOre ? 'le ore su ogni lavorazione, ' : ''}i lavori fatti e le foto.</div>
      ${s.errori.length ? `<div class="al2 e" style="margin:0 0 8px">Errore caricamento: ${esc(s.errori.join(' · '))}</div>` : ''}
      ${modifica ? `
        <button class="btn p sq-azione" onclick="apriGiornaleCantiere('${oggi}')">${giornoOggi ? '✏️ Aggiorna il giornale di oggi' : '📓 Compila il giornale di oggi'}</button>
        <div class="gnc-bottoni">
          <button class="btn" onclick="apriFotoRapideGiornale('${oggi}')">📷 Foto di oggi</button>
          <button class="btn" onclick="apriGiornaleCantiere(null)">📅 Un altro giorno</button>
        </div>
      ` : ''}
      ${giorni.length
        ? inVista.map(function(g) { return htmlGiornoGiornale(s, g); }).join('')
        : `<div class="empty">Nessun giorno nel giornale${modifica ? '' : ': lo compila il capo tecnico'}.</div>`}
      ${precedenti.length ? `
        <details style="margin-top:8px">
          <summary style="font-size:13px;cursor:pointer;color:var(--m)">Giorni precedenti (${precedenti.length})</summary>
          ${precedenti.map(function(g) { return htmlGiornoGiornale(s, g); }).join('')}
        </details>
      ` : ''}
    </div>
  `;
}

function htmlGiornoGiornale(s, giorno) {
  const c = s.commessa;
  const g = s.giorni.find(function(x) { return x.giorno === giorno; });
  const foto = s.foto.filter(function(d) { return giornoFotoGiornale(d) === giorno; });
  const modificabile = puoModificareGiornoGiornale(c, giorno);

  let presenti = '';
  let totale = '';
  if (s.vedeOre) {
    const righe = s.ore.filter(function(r) { return r.giorno === giorno; });
    const perPersona = {};
    righe.forEach(function(r) {
      const k = chiavePersonaGiornale(r);
      if (!perPersona[k]) perPersona[k] = { nome: nomePersonaGiornale(s, r), persone: Number(r.persone) || 1, ore: 0, sub: !!r.subappaltatore_id, lav: [] };
      perPersona[k].ore += oreRigaGiornale(r);
      perPersona[k].persone = Math.max(perPersona[k].persone, Number(r.persone) || 1);
      perPersona[k].lav.push(nomeLavorazioneGiornale(s, r.lavorazione_id) + ' ' + testoOre(oreRigaGiornale(r)));
    });
    const elenco = Object.values(perPersona);
    const somma = righe.reduce(function(t, r) { return t + oreRigaGiornale(r); }, 0);
    const teste = elenco.reduce(function(t, p) { return t + p.persone; }, 0);
    if (righe.length) totale = `<span class="bx bblue">${esc(testoOre(somma))} · ${teste} ${teste === 1 ? 'persona' : 'persone'}</span>`;
    presenti = elenco.map(function(p) {
      return `
        <div class="gnc-presente">
          <div><b>${esc(p.nome)}</b>${p.sub ? ` <span style="font-size:11px;color:var(--m)">subappaltatore${p.persone > 1 ? ', ' + p.persone + ' persone' : ''}</span>` : ''}</div>
          <div class="gnc-presente-ore">${esc(testoOre(p.ore))}</div>
          <div class="gnc-presente-lav">${esc(p.lav.join(' · '))}</div>
        </div>
      `;
    }).join('');
  } else {
    const elenco = s.presenti.filter(function(p) { return p.giorno === giorno; });
    if (elenco.length) {
      presenti = `<div class="gnc-presenti-nomi">👷 ${elenco.map(function(p) {
        return esc(p.nome) + (p.tipo === 'subappaltatore' ? ' <span style="color:var(--m)">(subappaltatore' + (p.persone > 1 ? ', ' + p.persone + ' persone' : '') + ')</span>' : '');
      }).join(' · ')}</div>`;
    }
  }

  const fotoHtml = foto.length ? `
    <div class="gnc-foto">
      ${foto.map(function(d) {
        const url = s.urlFoto[d.storage_path];
        const togli = typeof puoTogliereDocumentoCommessa === 'function' && puoTogliereDocumentoCommessa(c, d);
        return `
          <div class="gnc-foto-item">
            <button type="button" class="gnc-foto-apri" title="${esc(d.nome_file)}" onclick="scaricaDocumentoCommessa('${esc(d.storage_path)}')">
              ${url ? `<img src="${esc(url)}" alt="${esc(d.nota || d.nome_file)}" loading="lazy">` : `<span>${fotoImmagine(d) ? '📷' : '📄'}</span>`}
            </button>
            ${d.nota && !/^Giornale di cantiere del /.test(d.nota) ? `<div class="gnc-foto-nota">${esc(d.nota)}</div>` : ''}
            ${togli ? `<button type="button" class="gnc-foto-togli" title="Togli la foto" aria-label="Togli la foto" onclick="togliDocumentoCommessa('${esc(d.id)}')">✕</button>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  ` : '';

  const chi = g ? [
    g.compilato_da_nome ? 'Compilato da ' + g.compilato_da_nome : '',
    g.aggiornato_il && g.aggiornato_il !== g.compilato_il
      ? 'aggiornato' + (g.aggiornato_da_nome ? ' da ' + g.aggiornato_da_nome : '') + ' il ' + new Date(g.aggiornato_il).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : ''
  ].filter(Boolean).join(' · ') : '';

  return `
    <div class="gnc-giorno">
      <div class="gnc-giorno-testa">
        <div style="min-width:0">
          <div style="font-size:14px;font-weight:700">📅 <span style="text-transform:capitalize">${esc(etichettaGiornoGiornale(giorno))}</span></div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px">${totale}${foto.length ? `<span class="bx bgray">📷 ${foto.length}</span>` : ''}${!g ? '<span class="bx bwarn">solo foto</span>' : ''}</div>
        </div>
        ${modificabile ? `
          <div class="gnc-giorno-azioni">
            <button class="btn sm" onclick="apriGiornaleCantiere('${giorno}')">✏️ ${g ? 'Modifica' : 'Compila'}</button>
            <button class="btn sm" title="Aggiungi foto" aria-label="Aggiungi foto" onclick="apriFotoRapideGiornale('${giorno}')">📷</button>
          </div>
        ` : ''}
      </div>
      ${presenti}
      ${g && g.lavori_fatti ? `<div class="gnc-testo"><span class="gnc-etichetta">Lavori fatti</span>${esc(g.lavori_fatti)}</div>` : ''}
      ${g && g.note ? `<div class="gnc-testo gnc-problemi"><span class="gnc-etichetta">⚠️ Problemi e note</span>${esc(g.note)}</div>` : ''}
      ${fotoHtml}
      ${chi ? `<div style="font-size:11px;color:var(--m);margin-top:4px">${esc(chi)}</div>` : ''}
    </div>
  `;
}

// ── Calcoli delle ore (stimate contro effettive) ────────────────────
function calcolaOreCantiere(s) {
  const perLav = {};
  s.lavorazioni.forEach(function(l) {
    perLav[l.id] = { id: l.id, nome: l.nome, stimate: l.ore_stimate === null || l.ore_stimate === undefined ? null : Number(l.ore_stimate), effettive: 0, persone: {} };
  });
  const altro = { id: null, nome: 'Altro (non in elenco)', stimate: null, effettive: 0, persone: {} };
  const perPersona = {};
  const perGiorno = {};

  s.ore.forEach(function(r) {
    const ore = oreRigaGiornale(r);
    const lav = (r.lavorazione_id && perLav[r.lavorazione_id]) || altro;
    const k = chiavePersonaGiornale(r);
    lav.effettive += ore;
    lav.persone[k] = (lav.persone[k] || 0) + ore;

    if (!perPersona[k]) perPersona[k] = { chiave: k, nome: nomePersonaGiornale(s, r), sub: !!r.subappaltatore_id, ore: 0, giorni: {}, lav: {} };
    perPersona[k].ore += ore;
    perPersona[k].giorni[r.giorno] = true;
    perPersona[k].lav[lav.id || '-'] = (perPersona[k].lav[lav.id || '-'] || 0) + ore;

    if (!perGiorno[r.giorno]) perGiorno[r.giorno] = { persone: {}, ore: 0, lav: {} };
    perGiorno[r.giorno].persone[k] = true;
    perGiorno[r.giorno].ore += ore;
    perGiorno[r.giorno].lav[lav.id || '-'] = (perGiorno[r.giorno].lav[lav.id || '-'] || 0) + ore;
  });

  // Squadra = le stesse persone nello stesso giorno.
  const perSquadra = {};
  Object.keys(perGiorno).forEach(function(giorno) {
    const g = perGiorno[giorno];
    // Prima i dipendenti (u:), poi i subappaltatori (s:).
    const chiavi = Object.keys(g.persone).sort(function(a, b) {
      return (a[0] === 'u' ? 0 : 1) - (b[0] === 'u' ? 0 : 1) || a.localeCompare(b);
    });
    const k = chiavi.join('|');
    if (!perSquadra[k]) perSquadra[k] = { chiavi: chiavi, giorni: [], ore: 0, lav: {} };
    perSquadra[k].giorni.push(giorno);
    perSquadra[k].ore += g.ore;
    Object.keys(g.lav).forEach(function(l) { perSquadra[k].lav[l] = (perSquadra[k].lav[l] || 0) + g.lav[l]; });
  });

  const lavorazioni = s.lavorazioni.map(function(l) { return perLav[l.id]; });
  if (altro.effettive > 0) lavorazioni.push(altro);
  const conStima = lavorazioni.filter(function(l) { return l.stimate !== null; });

  return {
    lavorazioni: lavorazioni,
    perLav: perLav,
    persone: Object.values(perPersona).sort(function(a, b) { return b.ore - a.ore; }),
    squadre: Object.values(perSquadra).sort(function(a, b) { return b.ore - a.ore; }),
    effettive: lavorazioni.reduce(function(t, l) { return t + l.effettive; }, 0),
    stimate: conStima.reduce(function(t, l) { return t + l.stimate; }, 0),
    effettiveSuStimate: conStima.reduce(function(t, l) { return t + l.effettive; }, 0),
    senzaStima: lavorazioni.filter(function(l) { return l.stimate === null && l.effettive > 0; }).reduce(function(t, l) { return t + l.effettive; }, 0),
    giorni: Object.keys(perGiorno).length
  };
}

function htmlConfrontoOre(effettive, stimate, piccola) {
  if (stimate === null || stimate === undefined) {
    return `<div style="font-size:12px;color:var(--m)">${esc(testoOre(effettive))} effettive · nessuna stima</div>`;
  }
  const perc = stimate > 0 ? Math.round(effettive / stimate * 100) : (effettive > 0 ? 999 : 0);
  const oltre = effettive > stimate;
  const differenza = Math.abs(effettive - stimate);
  return `
    <div class="gnc-confronto">
      <span><b>${esc(testoOre(effettive))}</b> su ${esc(testoOre(stimate))} stimate</span>
      <span class="bx ${oltre ? 'berr' : (perc >= 90 ? 'bwarn' : 'bok')}">${oltre ? '+' + esc(testoOre(differenza)) + ' oltre la stima' : 'restano ' + esc(testoOre(differenza))}</span>
    </div>
    ${htmlBarraOre(perc, oltre, piccola)}
  `;
}

function htmlBarraOre(perc, oltre, piccola) {
  const p = Math.max(0, Math.min(100, perc));
  const colore = oltre ? '#E24B4A' : (perc >= 90 ? '#EF9F27' : '#378ADD');
  return `<div class="crono-barra${piccola ? ' piccola' : ''}" title="${perc}% delle ore stimate"><div style="width:${p}%;background:${colore}"></div></div>`;
}

// % di avanzamento del cronoprogramma (js/34), se c'è per questa commessa.
function avanzamentoPerOre(commessa) {
  if (typeof cronoprogrammaAperto === 'undefined' || !cronoprogrammaAperto || cronoprogrammaAperto.commessa?.id !== commessa.id) return null;
  if (typeof calcolaAvanzamentoFasi !== 'function') return null;
  const r = calcolaAvanzamentoFasi(cronoprogrammaAperto.fasi);
  return r.percentuale === null ? null : r.percentuale;
}

// ── Box "Ore stimate e ore effettive" (solo titolare e capo tecnico) ──
function disegnaOreCantiere() {
  const s = giornaleAperto;
  if (!s || !s.vedeOre) return;
  const c = s.commessa;
  const box = ge('cmd-ore');
  const compatto = ge('cmd-ore-compatto');
  const r = calcolaOreCantiere(s);
  const modifica = puoModificareGiornale(c);
  const avanzamento = avanzamentoPerOre(c);

  if (compatto) {
    compatto.innerHTML = (s.lavorazioni.length || r.effettive > 0) ? `
      <div class="card gnc-card">
        <div style="font-size:13px;font-weight:700;margin-bottom:2px">⏱️ Ore del cantiere</div>
        ${htmlConfrontoOre(r.effettive, r.stimate > 0 || s.lavorazioni.some(function(l) { return l.ore_stimate !== null; }) ? r.stimate : null)}
        <button class="btn sm" style="margin-top:6px" onclick="vaiAlleOreCantiere()">Apri il confronto</button>
      </div>
    ` : '';
  }
  if (!box) return;

  let proiezione = '';
  if (avanzamento !== null && avanzamento >= 5 && avanzamento < 100 && r.effettive > 0) {
    const servono = r.effettive / (avanzamento / 100);
    const oltre = r.stimate > 0 && servono > r.stimate;
    proiezione = `<div class="al2 ${oltre ? 'w' : 'i'}" style="margin:6px 0 0">Avanzamento lavori ${avanzamento}%: a questo ritmo per finire servono circa <b>${esc(testoOre(Math.round(servono)))}</b> in tutto${r.stimate > 0 ? ` (stimate ${esc(testoOre(r.stimate))})` : ''}.</div>`;
  }

  const lavorazioni = r.lavorazioni.map(function(l) {
    const chi = Object.keys(l.persone).map(function(k) {
      const p = r.persone.find(function(x) { return x.chiave === k; });
      return (p ? p.nome : '') + ' ' + testoOre(l.persone[k]);
    });
    return `
      <div class="gnc-lav">
        <div style="font-size:14px;font-weight:700;overflow-wrap:anywhere">${esc(l.nome)}</div>
        ${htmlConfrontoOre(l.effettive, l.stimate, true)}
        ${chi.length ? `<div class="gnc-presente-lav">${esc(chi.join(' · '))}</div>` : ''}
      </div>
    `;
  }).join('');

  const persone = r.persone.map(function(p) {
    const giorni = Object.keys(p.giorni).length;
    const dettaglio = Object.keys(p.lav).map(function(id) {
      const lav = id === '-' ? null : r.perLav[id];
      const stima = lav && lav.stimate ? ' (' + Math.round(p.lav[id] / lav.stimate * 100) + '% delle ' + testoOre(lav.stimate) + ' stimate)' : '';
      return (lav ? lav.nome : 'Altro') + ': ' + testoOre(p.lav[id]) + stima;
    });
    return `
      <div class="gnc-lav">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
          <div style="font-weight:700;min-width:0;overflow-wrap:anywhere">${esc(p.nome)}${p.sub ? ' <span style="font-size:11px;font-weight:400;color:var(--m)">subappaltatore</span>' : ''}</div>
          <div class="gnc-presente-ore">${esc(testoOre(p.ore))}</div>
        </div>
        <div style="font-size:12px;color:var(--m)">${giorni} ${giorni === 1 ? 'giorno' : 'giorni'} · media ${esc(testoOre(giorni ? p.ore / giorni : 0))} al giorno</div>
        <div class="gnc-presente-lav">${esc(dettaglio.join(' · '))}</div>
      </div>
    `;
  }).join('');

  const squadre = r.squadre.map(function(q) {
    const nomi = q.chiavi.map(function(k) {
      const p = r.persone.find(function(x) { return x.chiave === k; });
      return p ? p.nome : '';
    });
    const dettaglio = Object.keys(q.lav).map(function(id) {
      const lav = id === '-' ? null : r.perLav[id];
      return (lav ? lav.nome : 'Altro') + ': ' + testoOre(q.lav[id]);
    });
    return `
      <div class="gnc-lav">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
          <div style="font-weight:700;min-width:0;overflow-wrap:anywhere">👷 ${esc(nomi.join(', '))}</div>
          <div class="gnc-presente-ore">${esc(testoOre(q.ore))}</div>
        </div>
        <div style="font-size:12px;color:var(--m)">${q.giorni.length} ${q.giorni.length === 1 ? 'giorno' : 'giorni'} insieme · media ${esc(testoOre(q.ore / q.giorni.length))} al giorno</div>
        <div class="gnc-presente-lav">${esc(dettaglio.join(' · '))}</div>
      </div>
    `;
  }).join('');

  const haStime = s.lavorazioni.some(function(l) { return l.ore_stimate !== null; });

  box.innerHTML = `
    <div class="card gnc-card">
      <div class="gnc-titolo">⏱️ Ore stimate e ore effettive</div>
      <div style="font-size:12px;color:var(--m);margin-bottom:6px">Le ore del giornale per lavorazione, persona e squadra. Le vedono solo titolare e capo tecnico.</div>
      ${s.lavorazioni.length || r.effettive > 0 ? `
        <div class="gnc-totale">
          <div style="font-size:13px;font-weight:700">Totale della commessa${r.giorni ? ` · ${r.giorni} ${r.giorni === 1 ? 'giorno' : 'giorni'} di cantiere` : ''}</div>
          ${htmlConfrontoOre(r.effettive, haStime ? r.stimate : null)}
          ${haStime && r.senzaStima > 0 ? `<div style="font-size:11px;color:var(--m);margin-top:3px">Di cui ${esc(testoOre(r.senzaStima))} su lavorazioni senza stima.</div>` : ''}
          ${proiezione}
        </div>
      ` : `<div class="empty" style="padding:10px 0">Nessuna lavorazione: ${modifica ? 'indica le lavorazioni con le ore stimate (proposte dalle voci del preventivo).' : 'le prepara il capo tecnico.'}</div>`}
      ${modifica ? `<button class="btn sq-azione" onclick="apriLavorazioniOre()">📋 Lavorazioni e ore stimate</button>` : ''}
      ${lavorazioni ? `<div class="gnc-sezione">Per lavorazione</div>${lavorazioni}` : ''}
      ${persone ? `
        <details class="gnc-dettagli">
          <summary>Per persona (${r.persone.length})</summary>
          ${persone}
        </details>
      ` : ''}
      ${squadre ? `
        <details class="gnc-dettagli">
          <summary>Per squadra (${r.squadre.length})</summary>
          <div style="font-size:11px;color:var(--m);margin:4px 0">Squadra = le stesse persone presenti nello stesso giorno.</div>
          ${squadre}
        </details>
      ` : ''}
    </div>
  `;
}

function vaiAlleOreCantiere() {
  if (typeof mostraTabCommessa === 'function') mostraTabCommessa('cantiere');
  setTimeout(function() { ge('cmd-ore')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
}

// ── Finestra "Giornale del giorno" ──────────────────────────────────
function apriGiornaleCantiere(giorno) {
  const s = giornaleAperto;
  if (!s || !puoModificareGiornale(s.commessa)) return;
  const oggi = dataLocaleISO();
  giornaleModulo = { commessa: s.commessa, giorno: null, esistente: null, righe: [], foto: [] };
  const c = s.commessa;
  ge('gnc-sottotitolo').textContent = 'Commessa ' + c.codice + (c.clienti?.ragione_sociale ? ' · ' + c.clienti.ragione_sociale : '');
  ge('gnc-giorno').max = oggi;
  ge('gnc-giorno').min = primoGiornoModificabileGiornale() || '';
  ge('gnc-giorno').value = giorno || oggi;
  ge('gnc-limite').textContent = ROLE === 'titolare'
    ? ''
    : 'Si compila per oggi o per i ' + GIORNI_INDIETRO_GIORNALE + ' giorni prima; i giorni più vecchi li corregge il titolare.';
  ge('gnc-foto').value = '';
  ge('gnc-avviso').innerHTML = '';
  ge('gnc-salva').disabled = false;
  caricaGiornoNelModulo();
  openM('m-giornale-cantiere');
}

function cambiaGiornoGiornale() {
  if (!giornaleModulo) return;
  caricaGiornoNelModulo();
}

// Riempie la finestra con il giorno scelto: se è già compilato lo
// ripropone; se no propone la squadra del giorno (js/33) o i presenti
// dell'ultimo giorno compilato.
function caricaGiornoNelModulo() {
  const s = giornaleAperto;
  const m = giornaleModulo;
  if (!s || !m) return;
  const giorno = v('gnc-giorno');
  m.giorno = giorno;
  m.esistente = s.giorni.find(function(g) { return g.giorno === giorno; }) || null;
  const proposta = ge('gnc-proposta');
  proposta.style.display = 'none';
  proposta.textContent = '';

  const lavDefault = s.lavorazioni.length === 1 ? s.lavorazioni[0].id : (s.lavorazioni.length ? '' : '__altro');

  if (m.esistente) {
    m.righe = s.ore.filter(function(r) { return r.giornale_id === m.esistente.id; }).map(function(r) {
      return {
        tipo: r.utente_id ? 'utente' : 'sub',
        id: r.utente_id || r.subappaltatore_id,
        persone: Number(r.persone) || 1,
        lavorazione: r.lavorazione_id || '__altro',
        ore: Number(r.ore)
      };
    });
    ge('gnc-lavori').value = m.esistente.lavori_fatti || '';
    ge('gnc-note').value = m.esistente.note || '';
    proposta.textContent = 'Questo giorno è già nel giornale: lo stai aggiornando.';
    proposta.style.display = '';
  } else {
    ge('gnc-lavori').value = '';
    ge('gnc-note').value = '';
    m.righe = [];
    const squadra = typeof squadraAperta !== 'undefined' && squadraAperta && squadraAperta.commessa?.id === s.commessa.id
      ? (squadraAperta.giorni || []).find(function(g) { return g.data === giorno; })
      : null;
    if (squadra && (squadra.commesse_squadra_persone || []).length) {
      m.righe = squadra.commesse_squadra_persone.map(function(p) {
        return { tipo: p.utente_id ? 'utente' : 'sub', id: p.utente_id || p.subappaltatore_id, persone: 1, lavorazione: lavDefault, ore: ORE_PROPOSTE_GIORNALE };
      });
      proposta.textContent = 'Proposta la squadra organizzata per questo giorno, ' + ORE_PROPOSTE_GIORNALE + ' ore a testa: correggi ore e lavorazioni.';
      proposta.style.display = '';
    } else {
      // L'ultimo giorno compilato prima di questo; se non c'è, il più recente.
      const conOre = s.giorni.filter(function(g) { return g.giorno !== giorno && s.ore.some(function(r) { return r.giornale_id === g.id; }); });
      const precedente = conOre.find(function(g) { return g.giorno < giorno; }) || conOre[0];
      if (precedente) {
        m.righe = s.ore.filter(function(r) { return r.giornale_id === precedente.id; }).map(function(r) {
          return { tipo: r.utente_id ? 'utente' : 'sub', id: r.utente_id || r.subappaltatore_id, persone: Number(r.persone) || 1, lavorazione: r.lavorazione_id || '__altro', ore: Number(r.ore) };
        });
        proposta.textContent = 'Proposti i presenti del ' + fd(precedente.giorno) + ': correggi se questo giorno è diverso.';
        proposta.style.display = '';
      }
    }
  }

  const fotoGiorno = s.foto.filter(function(d) { return giornoFotoGiornale(d) === giorno; }).length;
  ge('gnc-foto-presenti').textContent = fotoGiorno ? 'Già caricate per questo giorno: ' + fotoGiorno + ' foto.' : '';
  ge('gnc-togli').style.display = m.esistente && puoModificareGiornoGiornale(s.commessa, giorno) ? '' : 'none';
  disegnaRigheGiornale();
  disegnaFotoModuloGiornale();
}

function opzioniLavorazioneGiornale(s, scelta) {
  const opzioni = s.lavorazioni.map(function(l) {
    return `<option value="${esc(l.id)}" ${scelta === l.id ? 'selected' : ''}>${esc(l.nome)}</option>`;
  });
  return (s.lavorazioni.length ? `<option value="" ${!scelta ? 'selected' : ''}>— scegli la lavorazione —</option>` : '') +
    opzioni.join('') +
    `<option value="__altro" ${scelta === '__altro' ? 'selected' : ''}>Altro (non in elenco)</option>`;
}

function disegnaRigheGiornale() {
  const s = giornaleAperto;
  const m = giornaleModulo;
  const box = ge('gnc-righe');
  if (!s || !m || !box) return;

  if (!m.righe.length) {
    box.innerHTML = '<div class="empty" style="padding:10px">Nessun presente: aggiungi dipendenti o subappaltatori.</div>';
    aggiornaTotaleGiornale();
    return;
  }

  box.innerHTML = m.righe.map(function(r, i) {
    let scelte;
    if (r.tipo === 'utente') {
      scelte = s.utenti.filter(function(u) { return u.attivo !== false || u.id === r.id; }).map(function(u) {
        return `<option value="${esc(u.id)}" ${u.id === r.id ? 'selected' : ''}>${esc([u.nome, u.cognome].filter(Boolean).join(' ') || 'Dipendente')}${u.ruolo === 'capo_tecnico' ? ' (capo tecnico)' : ''}${u.attivo === false ? ' — non attivo' : ''}</option>`;
      });
    } else {
      scelte = s.subappaltatori.filter(function(x) { return x.attivo !== false || x.id === r.id; }).map(function(x) {
        return `<option value="${esc(x.id)}" ${x.id === r.id ? 'selected' : ''}>${esc(x.ragione_sociale)}${x.attivo === false ? ' — non attivo' : ''}</option>`;
      });
    }
    return `
      <div class="gnc-riga">
        <div class="gnc-riga-chi">
          <select aria-label="${r.tipo === 'utente' ? 'Dipendente' : 'Subappaltatore'}" onchange="aggiornaRigaGiornale(${i}, 'id', this.value)">
            <option value="">${r.tipo === 'utente' ? '— scegli il dipendente —' : '— scegli il subappaltatore —'}</option>
            ${scelte.join('')}
          </select>
          <button type="button" class="btn sm" title="Togli la riga" aria-label="Togli la riga" onclick="togliRigaGiornale(${i})">✕</button>
        </div>
        <div class="gnc-riga-dati">
          <select class="gnc-riga-lav" aria-label="Lavorazione" onchange="aggiornaRigaGiornale(${i}, 'lavorazione', this.value)">${opzioniLavorazioneGiornale(s, r.lavorazione)}</select>
          ${r.tipo === 'sub' ? `
            <label class="gnc-num"><input type="number" min="1" max="50" step="1" inputmode="numeric" value="${esc(r.persone)}" oninput="aggiornaRigaGiornale(${i}, 'persone', this.value)"> pers.</label>
          ` : ''}
          <label class="gnc-num"><input type="number" min="0.25" max="24" step="0.25" inputmode="decimal" value="${esc(r.ore)}" oninput="aggiornaRigaGiornale(${i}, 'ore', this.value)"> h${r.tipo === 'sub' ? ' a testa' : ''}</label>
          <button type="button" class="btn sm" title="Altre ore della stessa persona su un'altra lavorazione" onclick="dividiRigaGiornale(${i})">➕ altra lavorazione</button>
        </div>
      </div>
    `;
  }).join('');
  aggiornaTotaleGiornale();
}

function aggiornaRigaGiornale(indice, campo, valore) {
  const m = giornaleModulo;
  if (!m || !m.righe[indice]) return;
  const r = m.righe[indice];
  if (campo === 'ore') r.ore = String(valore).replace(',', '.') === '' ? '' : Number(String(valore).replace(',', '.'));
  else if (campo === 'persone') r.persone = parseInt(valore, 10) || '';
  else r[campo] = valore;
  aggiornaTotaleGiornale();
}

function aggiungiRigaGiornale(tipo) {
  const s = giornaleAperto;
  const m = giornaleModulo;
  if (!s || !m) return;
  const lavDefault = s.lavorazioni.length === 1 ? s.lavorazioni[0].id : (s.lavorazioni.length ? '' : '__altro');
  m.righe.push({ tipo: tipo, id: '', persone: 1, lavorazione: lavDefault, ore: ORE_PROPOSTE_GIORNALE });
  disegnaRigheGiornale();
}

// Stessa persona su un'altra lavorazione: le ore si dividono a metà.
function dividiRigaGiornale(indice) {
  const m = giornaleModulo;
  if (!m || !m.righe[indice]) return;
  const r = m.righe[indice];
  const ore = Number(r.ore) || 0;
  const meta = Math.round(ore / 2 * 4) / 4;
  r.ore = ore ? ore - meta : '';
  m.righe.splice(indice + 1, 0, { tipo: r.tipo, id: r.id, persone: r.persone, lavorazione: '', ore: meta || '' });
  disegnaRigheGiornale();
}

function togliRigaGiornale(indice) {
  const m = giornaleModulo;
  if (!m) return;
  m.righe.splice(indice, 1);
  disegnaRigheGiornale();
}

function aggiornaTotaleGiornale() {
  const m = giornaleModulo;
  const box = ge('gnc-totale');
  if (!m || !box) return;
  const totale = m.righe.reduce(function(t, r) { return t + (Number(r.ore) || 0) * (r.tipo === 'sub' ? (Number(r.persone) || 1) : 1); }, 0);
  const persone = {};
  m.righe.forEach(function(r) { if (r.id) persone[r.tipo + r.id] = r.tipo === 'sub' ? Math.max(persone[r.tipo + r.id] || 0, Number(r.persone) || 1) : 1; });
  const teste = Object.values(persone).reduce(function(t, n) { return t + n; }, 0);
  box.textContent = m.righe.length ? 'Totale del giorno: ' + testoOre(totale) + ' · ' + teste + (teste === 1 ? ' persona' : ' persone') : '';
}

// ── Foto nella finestra (stesso schema delle foto della scheda di lavoro, js/04) ──
function anteprimaFotoGiornale(input) {
  const m = giornaleModulo;
  if (!m) return;
  Array.from(input.files || []).forEach(function(f) {
    m.foto.push({ file: f, url: URL.createObjectURL(f), didascalia: '' });
  });
  input.value = '';
  disegnaFotoModuloGiornale();
}

function disegnaFotoModuloGiornale() {
  const m = giornaleModulo;
  const box = ge('gnc-foto-anteprima');
  if (!m || !box) return;
  box.innerHTML = m.foto.map(function(f, i) {
    return `
      <div class="gnc-foto-item">
        <img src="${esc(f.url)}" alt="">
        <button type="button" class="gnc-foto-togli" title="Togli" aria-label="Togli la foto" onclick="togliFotoModuloGiornale(${i})">✕</button>
        <input placeholder="Nota..." maxlength="200" value="${esc(f.didascalia)}" oninput="giornaleModulo.foto[${i}].didascalia=this.value">
      </div>
    `;
  }).join('');
}

function togliFotoModuloGiornale(indice) {
  const m = giornaleModulo;
  if (!m) return;
  const f = m.foto.splice(indice, 1)[0];
  if (f && f.url) URL.revokeObjectURL(f.url);
  disegnaFotoModuloGiornale();
}

// Foto grandi del telefono: lato lungo al massimo 1920 px, JPEG. Se non si
// riesce (formato non leggibile dal browser) parte il file originale.
async function ridimensionaFotoGiornale(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type || '') || file.size < 1200 * 1024 || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scala = Math.min(1, LATO_MAX_FOTO_GIORNALE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scala);
    canvas.height = Math.round(bitmap.height * scala);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise(function(ok) { canvas.toBlob(ok, 'image/jpeg', 0.82); });
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], String(file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    return file;
  }
}

// Carica le foto nella cartella "cantiere" della commessa (riuso di js/26:
// bucket commesse-documenti, registra_documento_commessa).
async function caricaFotoGiornale(commessaId, giorno, foto) {
  let caricati = 0;
  const errori = [];
  for (let i = 0; i < foto.length; i++) {
    const originale = foto[i].file;
    if (originale.size > LIMITE_FILE_COMMESSA) { errori.push(originale.name + ': oltre 50 MB'); continue; }
    const file = await ridimensionaFotoGiornale(originale);
    const path = commessaId + '/cantiere/' + PREFISSO_FOTO_GIORNALE + giorno + '_' + Date.now() + '_' + i + '_' + nomeFileSicuroCommessa(file.name);
    const caricamento = await db.storage
      .from('commesse-documenti')
      .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (caricamento.error) { errori.push(originale.name + ': ' + caricamento.error.message); continue; }
    const { error } = await db.rpc('registra_documento_commessa', {
      p_commessa_id: commessaId,
      p_cartella: 'cantiere',
      p_storage_path: path,
      p_nome_file: originale.name,
      p_nota: (foto[i].didascalia || '').trim() || ('Giornale di cantiere del ' + fd(giorno))
    });
    if (error) {
      await db.storage.from('commesse-documenti').remove([path]);
      errori.push(originale.name + ': ' + error.message);
      continue;
    }
    caricati++;
  }
  return { caricati: caricati, errori: errori };
}

async function salvaGiornaleCantiere() {
  const s = giornaleAperto;
  const m = giornaleModulo;
  if (!s || !m) return;
  const giorno = v('gnc-giorno');
  const oggi = dataLocaleISO();
  const lavori = (v('gnc-lavori') || '').trim();
  const note = (v('gnc-note') || '').trim();
  const errore = function(testo) {
    ge('gnc-avviso').innerHTML = `<div class="al2 e" style="margin:8px 0 0">${esc(testo)}</div>`;
    ge('gnc-avviso').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  if (!giorno) return errore('Indica il giorno.');
  if (giorno > oggi) return errore('Il giornale si compila per oggi o per i giorni passati.');
  const primo = primoGiornoModificabileGiornale();
  if (primo && giorno < primo) return errore('I giorni di più di ' + GIORNI_INDIETRO_GIORNALE + ' giorni fa li corregge il titolare.');

  const ore = [];
  const viste = {};
  const totali = {};
  for (let i = 0; i < m.righe.length; i++) {
    const r = m.righe[i];
    const n = i + 1;
    if (!r.id) return errore('Riga ' + n + ': scegli ' + (r.tipo === 'utente' ? 'il dipendente.' : 'il subappaltatore.'));
    const nome = nomePersonaGiornale(s, r.tipo === 'utente' ? { utente_id: r.id } : { subappaltatore_id: r.id });
    const valore = Number(r.ore);
    if (!(valore > 0 && valore <= 24)) return errore(nome + ': ore da 0,25 a 24' + (r.tipo === 'sub' ? ' a testa.' : '.'));
    if (Math.round(valore * 4) !== valore * 4) return errore(nome + ': le ore vanno a quarti d\'ora (es. 7,5 o 7,25).');
    if (r.tipo === 'sub' && !(Number(r.persone) >= 1 && Number(r.persone) <= 50)) return errore(nome + ': numero di persone da 1 a 50.');
    if (r.lavorazione === '') return errore(nome + ': scegli la lavorazione (o "Altro").');
    const lav = r.lavorazione === '__altro' ? null : r.lavorazione;
    const chiave = r.tipo + r.id + '/' + (lav || '-');
    if (viste[chiave]) return errore(nome + ' compare due volte sulla stessa lavorazione: somma le ore in una riga.');
    viste[chiave] = true;
    if (r.tipo === 'utente') {
      totali[r.id] = (totali[r.id] || 0) + valore;
      if (totali[r.id] > 24) return errore(nome + ': più di 24 ore nel giorno.');
    }
    ore.push({
      utente_id: r.tipo === 'utente' ? r.id : null,
      subappaltatore_id: r.tipo === 'sub' ? r.id : null,
      persone: r.tipo === 'sub' ? Number(r.persone) : 1,
      lavorazione_id: lav,
      ore: valore
    });
  }
  if (!ore.length && !lavori && !note && !m.foto.length) return errore('Scrivi i presenti con le ore, i lavori fatti o una nota.');

  const bottone = ge('gnc-salva');
  bottone.disabled = true;
  bottone.textContent = '⏳ Salvataggio...';

  let salvato = !!m.esistente;
  if (ore.length || lavori || note || m.esistente) {
    const { error } = await db.rpc('salva_giornale_cantiere', {
      p_commessa_id: m.commessa.id,
      p_giorno: giorno,
      p_lavori_fatti: lavori || null,
      p_note: note || null,
      p_ore: ore
    });
    if (error) {
      bottone.disabled = false;
      bottone.textContent = 'Salva il giornale';
      return errore('Giornale non salvato: ' + (error.message || 'errore sconosciuto'));
    }
    salvato = true;
  }

  let esitoFoto = { caricati: 0, errori: [] };
  if (m.foto.length) {
    bottone.textContent = '⏳ Caricamento foto...';
    esitoFoto = await caricaFotoGiornale(m.commessa.id, giorno, m.foto);
  }
  bottone.disabled = false;
  bottone.textContent = 'Salva il giornale';

  m.foto.forEach(function(f) { if (f.url) URL.revokeObjectURL(f.url); });
  m.foto = [];
  closeM('m-giornale-cantiere');

  if (esitoFoto.errori.length) {
    toast((salvato ? 'Giornale salvato. ' : '') + (esitoFoto.caricati ? esitoFoto.caricati + ' foto caricate, ' : '') + 'foto non caricate: ' + esitoFoto.errori.join(' · '), 'err');
  } else {
    toast('Giornale del ' + fd(giorno) + ' salvato' + (esitoFoto.caricati ? ' con ' + esitoFoto.caricati + ' foto' : ''), 'ok');
  }
  await ricaricaGiornaleCantiere(m.commessa);
}

async function togliGiornaleCantiere() {
  const m = giornaleModulo;
  if (!m || !m.esistente) return;
  if (!confirm('Togliere dal giornale il ' + fd(m.esistente.giorno) + ' con presenti, ore, lavori fatti e note? Le foto restano nella cartella "Cantiere" della commessa.')) return;
  const { error } = await db.rpc('togli_giornale_cantiere', { p_giornale_id: m.esistente.id });
  if (error) {
    toast('Giorno non tolto: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }
  closeM('m-giornale-cantiere');
  toast('Giorno tolto dal giornale', 'ok');
  await ricaricaGiornaleCantiere(m.commessa);
}

// Le foto nuove sono documenti della commessa: si ricarica tutta la scheda
// (come dopo un caricamento nella cartella, js/26).
async function ricaricaGiornaleCantiere(commessa) {
  if (commessaApertaId === commessa.id) await caricaSchedaCommessa(commessa.id);
}

// ── Foto veloci di un giorno (un tocco, senza aprire il giornale) ───
function apriFotoRapideGiornale(giorno) {
  const s = giornaleAperto;
  if (!s || !puoModificareGiornoGiornale(s.commessa, giorno)) return;
  giornoFotoRapide = { commessa: s.commessa, giorno: giorno };
  const input = ge('gnc-foto-rapide');
  if (!input) return;
  input.value = '';
  input.click();
}

async function caricaFotoRapideGiornale(input) {
  const r = giornoFotoRapide;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!r || !files.length) return;
  toast('Caricamento di ' + files.length + (files.length === 1 ? ' foto...' : ' foto...'), 'ok');
  const esito = await caricaFotoGiornale(r.commessa.id, r.giorno, files.map(function(f) { return { file: f, didascalia: '' }; }));
  if (esito.errori.length) {
    toast((esito.caricati ? esito.caricati + ' foto caricate, ' : '') + 'non caricate: ' + esito.errori.join(' · '), 'err');
  } else {
    toast(esito.caricati === 1 ? 'Foto caricata' : esito.caricati + ' foto caricate', 'ok');
  }
  giornoFotoRapide = null;
  await ricaricaGiornaleCantiere(r.commessa);
}

// ── Finestra "Lavorazioni e ore stimate" ────────────────────────────
async function apriLavorazioniOre() {
  const s = giornaleAperto;
  if (!s || !puoModificareGiornale(s.commessa)) return;
  const c = s.commessa;
  const conOre = {};
  s.ore.forEach(function(r) { if (r.lavorazione_id) conOre[r.lavorazione_id] = true; });

  lavorazioniModulo = {
    commessa: c,
    righe: s.lavorazioni.map(function(l) {
      return {
        id: l.id,
        nome: l.nome,
        ore_stimate: l.ore_stimate === null ? '' : Number(l.ore_stimate),
        unita_misura: l.unita_misura,
        quantita: l.quantita,
        haOre: !!conOre[l.id]
      };
    }),
    proposte: []
  };

  ge('lvo-sottotitolo').textContent = 'Commessa ' + c.codice + (c.clienti?.ragione_sociale ? ' · ' + c.clienti.ragione_sociale : '');
  ge('lvo-avviso').innerHTML = '';
  ge('lvo-proposte').innerHTML = '<div class="load">Caricamento voci del preventivo...</div>';
  ge('lvo-salva').disabled = false;
  disegnaRigheLavorazioni();
  openM('m-lavorazioni-ore');
  await caricaProposteLavorazioni();
}

// Proposte: voci del preventivo senza prezzi (sql/34) e fasi del
// cronoprogramma (js/34). Spuntate le voci di manodopera e servizi e
// quelle in ore; se non ce ne sono, i materiali.
async function caricaProposteLavorazioni() {
  const m = lavorazioniModulo;
  if (!m) return;
  let voci = [];
  let avviso = '';
  const schedaAttiva = typeof verificaDatiCantiereDisponibili === 'function' && await verificaDatiCantiereDisponibili();
  if (schedaAttiva) {
    const { data, error } = await db.rpc('scheda_cantiere_commessa', { p_commessa_id: m.commessa.id });
    if (error) avviso = 'Voci del preventivo non disponibili: ' + error.message;
    else voci = (data && data.lavorazioni) || [];
  } else {
    avviso = 'Le voci del preventivo non sono disponibili qui: aggiungi le lavorazioni a mano.';
  }
  if (lavorazioniModulo !== m) return;

  const lavoro = voci.some(function(x) { return ['manodopera', 'servizio'].includes(x.categoria) || unitaInOre(x.unita_misura); });
  const oreManodopera = voci.filter(function(x) { return unitaInOre(x.unita_misura); })
    .reduce(function(t, x) { return t + (Number(x.quantita) || 0); }, 0);

  const proposte = voci.map(function(x) {
    const inOre = unitaInOre(x.unita_misura);
    return {
      nome: String(x.descrizione || '').trim().slice(0, 200),
      unita_misura: x.unita_misura || null,
      quantita: x.quantita === null || x.quantita === undefined ? null : Number(x.quantita),
      ore_stimate: inOre && Number(x.quantita) >= 0 ? Math.round(Number(x.quantita) * 4) / 4 : '',
      categoria: x.categoria,
      spuntata: lavoro ? (['manodopera', 'servizio'].includes(x.categoria) || inOre) : (x.categoria === 'materiale' || !x.categoria)
    };
  }).filter(function(p) { return p.nome; });

  const fasi = typeof cronoprogrammaAperto !== 'undefined' && cronoprogrammaAperto && cronoprogrammaAperto.commessa?.id === m.commessa.id
    ? (cronoprogrammaAperto.fasi || [])
    : [];
  fasi.forEach(function(f) {
    proposte.push({ nome: String(f.nome || '').slice(0, 200), unita_misura: null, quantita: null, ore_stimate: '', categoria: 'fase', spuntata: false });
  });

  m.proposte = proposte;
  m.oreManodopera = oreManodopera;
  m.avviso = avviso;
  disegnaProposteLavorazioni();
}

function disegnaProposteLavorazioni() {
  const m = lavorazioniModulo;
  const box = ge('lvo-proposte');
  if (!m || !box) return;
  const presenti = m.righe.map(function(r) { return String(r.nome || '').trim().toLowerCase(); });
  const elenco = m.proposte.map(function(p, i) {
    const gia = presenti.includes(p.nome.toLowerCase());
    const etichetta = p.categoria === 'fase'
      ? 'fase del cronoprogramma'
      : (typeof ETICHETTE_CATEGORIA_LAVORAZIONE !== 'undefined' && ETICHETTE_CATEGORIA_LAVORAZIONE[p.categoria]) || p.categoria || '';
    const quantita = p.quantita !== null && p.categoria !== 'fase' && typeof quantitaLavorazione === 'function' ? quantitaLavorazione(p).trim() : '';
    return `
      <label class="sq-scelta${p.spuntata && !gia ? ' on' : ''}">
        <input type="checkbox" data-indice="${i}" ${p.spuntata && !gia ? 'checked' : ''} ${gia ? 'disabled' : ''} onchange="this.parentElement.classList.toggle('on', this.checked)">
        <span style="min-width:0;overflow-wrap:anywhere">${esc(p.nome)}${quantita ? ` <b style="white-space:nowrap">${esc(quantita)}</b>` : ''}
          <span class="sq-scelta-avvisi">${etichetta ? `<span class="bx bgray">${esc(etichetta)}</span>` : ''}${p.ore_stimate !== '' ? ` <span class="bx bblue">${esc(testoOre(p.ore_stimate))} stimate</span>` : ''}${gia ? ' <span class="bx bok">già in elenco</span>' : ''}</span>
        </span>
      </label>
    `;
  }).join('');

  box.innerHTML = `
    ${m.avviso ? `<div class="al2 i" style="margin:0 0 8px">${esc(m.avviso)}</div>` : ''}
    ${m.oreManodopera ? `<div style="font-size:12px;margin-bottom:6px">Ore nel preventivo (voci in ore): <b>${esc(testoOre(m.oreManodopera))}</b></div>` : ''}
    ${elenco ? `
      <div class="sq-elenco" style="max-height:280px">${elenco}</div>
      <button type="button" class="btn sm" style="margin-top:6px" onclick="aggiungiProposteLavorazioni()">➕ Aggiungi le spuntate</button>
    ` : (m.avviso ? '' : '<div class="empty" style="padding:8px">Nessuna voce da proporre.</div>')}
  `;
}

function aggiungiProposteLavorazioni() {
  const m = lavorazioniModulo;
  if (!m) return;
  const scelte = Array.from(document.querySelectorAll('#lvo-proposte input[type=checkbox]:checked:not(:disabled)'))
    .map(function(i) { return m.proposte[Number(i.dataset.indice)]; })
    .filter(Boolean);
  if (!scelte.length) { toast('Spunta almeno una voce', 'err'); return; }
  scelte.forEach(function(p) {
    m.righe.push({ id: null, nome: p.nome, ore_stimate: p.ore_stimate, unita_misura: p.unita_misura, quantita: p.quantita, haOre: false });
  });
  disegnaRigheLavorazioni();
  disegnaProposteLavorazioni();
}

function disegnaRigheLavorazioni() {
  const m = lavorazioniModulo;
  const box = ge('lvo-righe');
  if (!m || !box) return;
  const totale = m.righe.reduce(function(t, r) { return t + (Number(r.ore_stimate) || 0); }, 0);
  box.innerHTML = (m.righe.length ? m.righe.map(function(r, i) {
    const quantita = r.quantita !== null && r.quantita !== undefined && r.unita_misura && typeof quantitaLavorazione === 'function'
      ? quantitaLavorazione(r).trim() : '';
    return `
      <div class="gnc-riga">
        <div class="gnc-riga-chi">
          <input type="text" maxlength="200" aria-label="Nome della lavorazione" placeholder="es. Posa in opera porte REI 60" value="${esc(r.nome)}" oninput="aggiornaRigaLavorazione(${i}, 'nome', this.value)">
        </div>
        <div class="gnc-riga-dati">
          <label class="gnc-num"><input type="number" min="0" step="0.25" inputmode="decimal" aria-label="Ore stimate" placeholder="—" value="${esc(r.ore_stimate)}" oninput="aggiornaRigaLavorazione(${i}, 'ore_stimate', this.value)"> h stimate</label>
          ${i > 0 ? `<button type="button" class="btn sm" title="Sposta su" aria-label="Sposta su" onclick="spostaRigaLavorazione(${i}, -1)">↑</button>` : ''}
          ${i < m.righe.length - 1 ? `<button type="button" class="btn sm" title="Sposta giù" aria-label="Sposta giù" onclick="spostaRigaLavorazione(${i}, 1)">↓</button>` : ''}
          ${r.haOre
            ? '<span class="bx bgray" title="Ha già ore nel giornale: non si può togliere">ha ore</span>'
            : `<button type="button" class="btn sm" style="color:var(--r)" title="Togli" aria-label="Togli la lavorazione" onclick="togliRigaLavorazione(${i})">✕</button>`}
        </div>
        ${quantita ? `<div style="font-size:11px;color:var(--m)">Dal preventivo: ${esc(quantita)}</div>` : ''}
      </div>
    `;
  }).join('') : '<div class="empty" style="padding:10px">Nessuna lavorazione: aggiungila o scegli dalle voci del preventivo qui sotto.</div>') +
    (m.righe.length ? `<div style="font-size:13px;font-weight:700;margin-top:6px">Totale ore stimate: ${esc(testoOre(totale))}</div>` : '');
}

function aggiornaRigaLavorazione(indice, campo, valore) {
  const m = lavorazioniModulo;
  if (!m || !m.righe[indice]) return;
  if (campo === 'ore_stimate') {
    const testo = String(valore).replace(',', '.').trim();
    m.righe[indice].ore_stimate = testo === '' ? '' : Number(testo);
  } else {
    m.righe[indice][campo] = valore;
  }
}

function aggiungiRigaLavorazione() {
  const m = lavorazioniModulo;
  if (!m) return;
  m.righe.push({ id: null, nome: '', ore_stimate: '', unita_misura: null, quantita: null, haOre: false });
  disegnaRigheLavorazioni();
  const campi = document.querySelectorAll('#lvo-righe input[type=text]');
  if (campi.length) campi[campi.length - 1].focus();
}

function spostaRigaLavorazione(indice, verso) {
  const m = lavorazioniModulo;
  if (!m) return;
  const altro = indice + verso;
  if (altro < 0 || altro >= m.righe.length) return;
  const x = m.righe[indice];
  m.righe[indice] = m.righe[altro];
  m.righe[altro] = x;
  disegnaRigheLavorazioni();
}

function togliRigaLavorazione(indice) {
  const m = lavorazioniModulo;
  if (!m || !m.righe[indice] || m.righe[indice].haOre) return;
  m.righe.splice(indice, 1);
  disegnaRigheLavorazioni();
  disegnaProposteLavorazioni();
}

async function salvaLavorazioniOre() {
  const m = lavorazioniModulo;
  if (!m) return;
  const errore = function(testo) { ge('lvo-avviso').innerHTML = `<div class="al2 e" style="margin:8px 0 0">${esc(testo)}</div>`; };
  const nomi = {};
  const elenco = [];
  for (let i = 0; i < m.righe.length; i++) {
    const r = m.righe[i];
    const nome = String(r.nome || '').trim();
    if (!nome) return errore('Lavorazione n. ' + (i + 1) + ': scrivi il nome (o togli la riga).');
    if (nomi[nome.toLowerCase()]) return errore('La lavorazione "' + nome + '" compare due volte.');
    nomi[nome.toLowerCase()] = true;
    const ore = r.ore_stimate === '' || r.ore_stimate === null ? null : Number(r.ore_stimate);
    if (ore !== null && !(ore >= 0 && ore <= 100000)) return errore('"' + nome + '": ore stimate non valide.');
    if (ore !== null && Math.round(ore * 4) !== ore * 4) return errore('"' + nome + '": le ore vanno a quarti d\'ora (es. 7,5).');
    elenco.push({ id: r.id || null, nome: nome, ore_stimate: ore, unita_misura: r.unita_misura || null, quantita: r.quantita === undefined ? null : r.quantita });
  }
  if (elenco.length > 60) return errore('Al massimo 60 lavorazioni.');

  const bottone = ge('lvo-salva');
  bottone.disabled = true;
  const { error } = await db.rpc('salva_lavorazioni_commessa', { p_commessa_id: m.commessa.id, p_lavorazioni: elenco });
  bottone.disabled = false;
  if (error) return errore('Lavorazioni non salvate: ' + (error.message || 'errore sconosciuto'));
  closeM('m-lavorazioni-ore');
  toast('Lavorazioni e ore stimate salvate', 'ok');
  if (commessaApertaId === m.commessa.id) await caricaGiornaleCantiere(m.commessa);
}

// ── Calendario del tecnico: le mie ore in cantiere (solo le sue) ─────
// Chiamata da js/05 alla fine di loadCalendarioTecnico (mese mostrato).
// Senza sql/37 il riquadro resta vuoto.
async function caricaMieOreCalendarioTecnico(anno, mese) {
  const box = ge('cal-tec-ore');
  if (!box) return;
  const dal = dataLocaleISO(new Date(anno, mese, 1));
  const al = dataLocaleISO(new Date(anno, mese + 1, 0));
  const { data, error } = await db.rpc('mie_ore_cantiere', { p_dal: dal, p_al: al });
  if (typeof _calTecAnno !== 'undefined' && (_calTecAnno !== anno || _calTecMese !== mese)) return;
  if (error) {
    if (!rpcGiornaleMancante(error)) console.warn('Le mie ore in cantiere:', error.message);
    box.innerHTML = '';
    return;
  }
  const righe = data || [];
  if (!righe.length) { box.innerHTML = ''; return; }

  const totale = righe.reduce(function(t, r) { return t + (Number(r.ore) || 0); }, 0);
  const perGiorno = {};
  righe.forEach(function(r) { (perGiorno[r.giorno] = perGiorno[r.giorno] || []).push(r); });
  const giorni = Object.keys(perGiorno).sort().reverse();

  box.innerHTML = `
    <div class="card" style="margin-bottom:14px;border-left:3px solid #378ADD">
      <details>
        <summary style="cursor:pointer">
          <span style="font-size:15px;font-weight:700">⏱️ Le mie ore in cantiere del mese</span>
          <div style="font-size:13px;margin-top:2px"><b>${esc(testoOre(totale))}</b> in ${giorni.length} ${giorni.length === 1 ? 'giorno' : 'giorni'} · le segna il capo tecnico nel giornale</div>
        </summary>
        ${giorni.map(function(g) {
          const elenco = perGiorno[g];
          const somma = elenco.reduce(function(t, r) { return t + (Number(r.ore) || 0); }, 0);
          return `
            <div class="gnc-giorno">
              <div style="display:flex;justify-content:space-between;gap:8px"><b style="text-transform:capitalize">${esc(etichettaGiornoGiornale(g))}</b><b>${esc(testoOre(somma))}</b></div>
              ${elenco.map(function(r) {
                return `<div style="font-size:12px;color:var(--m)">${esc(r.cliente || '')} · ${esc(r.commessa_codice || '')} · ${esc(r.lavorazione)}: ${esc(testoOre(r.ore))}</div>`;
              }).join('')}
            </div>
          `;
        }).join('')}
      </details>
    </div>
  `;
}
