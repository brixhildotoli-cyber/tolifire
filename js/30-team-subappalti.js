// =====================================================================
// F7.1 — TEAM E SUBAPPALTI: anagrafica dei subappaltatori (con
// referente) e documenti con scadenza dei dipendenti (utenti) e dei
// subappaltatori. Attivo con sql/32-team-subappalti-documenti.
// Pagina "Team e subappalti" (pg-team-subappalti): tab Scadenze,
// Dipendenti, Subappaltatori. Scheda documenti (pg-scheda-documenti) di
// un dipendente o di un subappaltatore. Avviso "Documenti in scadenza"
// nelle dashboard di segreteria e capo tecnico; "I miei documenti" nella
// dashboard del tecnico.
// Chi (regole di sql/32):
//   titolare e segreteria: vedono tutto, inseriscono e modificano
//     subappaltatori, registrano, rinnovano, correggono e tolgono
//     documenti;
//   capo tecnico: vede tutto in sola lettura; dei documenti riservati
//     (idoneità sanitaria) vede tipo e scadenza ma non apre il file;
//   ogni utente: i propri documenti (il tecnico nella sua dashboard).
// Preavviso: impostazioni.giorni_preavviso_documenti (default 30).
// Senza sql/32 la pagina mostra "non ancora attiva" e i box non
// compaiono. Per F7.2 (checklist del faldone): statoDocumentoTeamSubappalti
// accetta la data di riferimento (es. inizio lavori).
// =====================================================================

// Tipi di documento. Per aggiungerne uno basta una riga qui (il database
// controlla solo la forma del codice). per: 'impresa' = solo
// subappaltatori, 'persona' = dipendenti e operai dei subappaltatori.
// mesi/giorni: validità usata solo per PROPORRE la scadenza dalla data
// di rilascio (si verifica sempre sul documento).
const TIPI_DOCUMENTO_TEAM_SUBAPPALTI = [
  { id: 'durc',                          per: 'impresa', giorni: 120, nome: 'DURC (regolarità contributiva)' },
  { id: 'visura_camerale',               per: 'impresa', mesi: 6,     nome: 'Visura camerale' },
  { id: 'pos',                           per: 'impresa',              nome: 'POS (Piano operativo di sicurezza)' },
  { id: 'assicurazione_rc',              per: 'impresa', mesi: 12,    nome: 'Assicurazione RCT/RCO' },
  { id: 'dvr',                           per: 'impresa',              nome: 'DVR o autocertificazione DVR' },
  { id: 'idoneita_tecnico_professionale', per: 'impresa',             nome: 'Idoneità tecnico-professionale (All. XVII D.Lgs. 81/08)' },
  { id: 'formazione_lavoratori',         per: 'persona', mesi: 60,    nome: 'Formazione lavoratori (generale e specifica)' },
  { id: 'formazione_antincendio',        per: 'persona', mesi: 60,    nome: 'Addetto antincendio' },
  { id: 'primo_soccorso',                per: 'persona', mesi: 36,    nome: 'Addetto primo soccorso' },
  { id: 'preposto',                      per: 'persona', mesi: 24,    nome: 'Preposto' },
  { id: 'ple',                           per: 'persona', mesi: 60,    nome: 'Patentino PLE (piattaforme di lavoro elevabili)' },
  { id: 'lavori_quota',                  per: 'persona', mesi: 60,    nome: 'Lavori in quota e DPI anticaduta (III categoria)' },
  { id: 'carrelli_elevatori',            per: 'persona', mesi: 60,    nome: 'Carrelli elevatori' },
  { id: 'idoneita_sanitaria',            per: 'persona',              nome: 'Idoneità sanitaria (giudizio del medico competente)', riservato: true },
  { id: 'altro',                         per: 'tutti',                nome: 'Altro (scrivi quale)' }
];

const BUCKET_TEAM_SUBAPPALTI = 'documenti-team-subappalti';
const LIMITE_FILE_TEAM_SUBAPPALTI = 50 * 1024 * 1024; // 50 MB, come il bucket
const COLONNE_DOCUMENTO_TS = 'id, utente_id, subappaltatore_id, tipo, descrizione, riferito_a, data_rilascio, data_scadenza, ' +
  'riservato, nota, nome_file, storage_path, dimensione, sostituito_da, sostituito_il, caricato_da_nome, caricato_da_ruolo, caricato_il';

let teamSubappaltiDisponibili = null;
let subappaltatoriElenco = [];
let dipendentiElencoTS = [];
let documentiInVigoreTS = [];
let schedaDocumentiAperta = null; // { tipo: 'dipendente'|'subappaltatore', id, dati }
let documentiSchedaAperta = [];
let paginaPrecedenteSchedaDocumenti = 'team-subappalti';

// ── Disponibilità di sql/32 ─────────────────────────────────────────
async function verificaTeamSubappaltiDisponibili() {
  if (teamSubappaltiDisponibili !== null) return teamSubappaltiDisponibili;

  const { error } = await db
    .from('documenti_team_subappalti')
    .select('id')
    .limit(1);

  if (!error) {
    teamSubappaltiDisponibili = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /documenti_team_subappalti/i.test(error.message || '')) {
    teamSubappaltiDisponibili = false;
  } else {
    return false;
  }
  return teamSubappaltiDisponibili;
}

// ── Regole del sito (le stesse del database) ───────────────────────
function puoGestireTeamSubappalti() {
  return ROLE === 'titolare' || ROLE === 'segreteria';
}

function puoAprireFileDocumentoTS(d) {
  if (!d || !d.storage_path) return false;
  if (puoGestireTeamSubappalti()) return true;
  if (d.utente_id && d.utente_id === ME?.id) return true;
  return ROLE === 'capo_tecnico' && !d.riservato;
}

function giorniPreavvisoDocumenti() {
  const n = (typeof IMPOSTAZIONI !== 'undefined' && IMPOSTAZIONI) ? IMPOSTAZIONI.giorni_preavviso_documenti : null;
  return (n === null || n === undefined || !isFinite(Number(n))) ? 30 : Number(n);
}

function sommaGiorniISO(iso, giorni) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + giorni);
  return dataLocaleISO(d);
}

function sommaMesiISO(iso, mesi) {
  const d = new Date(iso + 'T00:00:00');
  const giorno = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + mesi);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(giorno, ultimo));
  return dataLocaleISO(d);
}

function giorniTraISO(da, a) {
  return Math.round((new Date(a + 'T00:00:00') - new Date(da + 'T00:00:00')) / 86400000);
}

// Stato di un documento a una data (oggi se non indicata). Per F7.2 la
// data può essere l'inizio dei lavori della commessa.
function statoDocumentoTeamSubappalti(d, allaData) {
  const rif = allaData || dataLocaleISO();
  if (!d.data_scadenza) return { codice: 'senza_scadenza', classe: 'bgray', testo: 'Senza scadenza' };
  const giorni = giorniTraISO(rif, d.data_scadenza);
  if (giorni < 0) return { codice: 'scaduto', classe: 'berr', testo: 'Scaduto da ' + Math.abs(giorni) + (Math.abs(giorni) === 1 ? ' giorno' : ' giorni') };
  if (giorni <= giorniPreavvisoDocumenti()) {
    return { codice: 'in_scadenza', classe: 'bwarn', testo: giorni === 0 ? 'Scade oggi' : 'Scade tra ' + giorni + (giorni === 1 ? ' giorno' : ' giorni') };
  }
  return { codice: 'valido', classe: 'bok', testo: 'Valido' };
}

function tipoDocumentoTS(codice) {
  return TIPI_DOCUMENTO_TEAM_SUBAPPALTI.find(function(t) { return t.id === codice; }) || null;
}

function nomeDocumentoTS(d) {
  const tipo = tipoDocumentoTS(d.tipo);
  if (d.tipo === 'altro') return d.descrizione || 'Altro';
  const nome = tipo ? tipo.nome : d.tipo;
  return d.descrizione ? nome + ' — ' + d.descrizione : nome;
}

function nomeDipendenteTS(u) {
  return [u?.nome, u?.cognome].filter(Boolean).join(' ') || 'Dipendente';
}

// Riepilogo dei documenti in vigore di un intestatario: badge sintetico.
function badgeRiepilogoDocumentiTS(documenti) {
  if (!documenti.length) return '<span class="bx bgray">Nessun documento</span>';
  const scaduti = documenti.filter(function(d) { return statoDocumentoTeamSubappalti(d).codice === 'scaduto'; }).length;
  const inScadenza = documenti.filter(function(d) { return statoDocumentoTeamSubappalti(d).codice === 'in_scadenza'; }).length;
  const parti = [];
  if (scaduti) parti.push(`<span class="bx berr">${scaduti} ${scaduti === 1 ? 'scaduto' : 'scaduti'}</span>`);
  if (inScadenza) parti.push(`<span class="bx bwarn">${inScadenza} in scadenza</span>`);
  if (!parti.length) parti.push('<span class="bx bok">In regola</span>');
  return parti.join(' ');
}

// ── Pagina Team e subappalti ───────────────────────────────────────
async function loadTeamSubappalti() {
  const avviso = ge('ts-non-attivo');
  const contenuto = ge('ts-contenuto');
  if (!contenuto) return;

  const nuovo = ge('ts-btn-nuovo-sub');
  if (nuovo) nuovo.style.display = puoGestireTeamSubappalti() ? '' : 'none';

  if (!(await verificaTeamSubappaltiDisponibili())) {
    if (avviso) avviso.style.display = 'block';
    contenuto.style.display = 'none';
    return;
  }
  if (avviso) avviso.style.display = 'none';
  contenuto.style.display = '';

  ['ts-scadenze-lista', 'ts-dipendenti-lista', 'ts-subappaltatori-lista'].forEach(function(id) {
    const el = ge(id);
    if (el) el.innerHTML = '<div class="load">Caricamento...</div>';
  });

  const [utentiRes, subRes, docRes] = await Promise.all([
    db.from('utenti').select('id, nome, cognome, ruolo, attivo').order('nome'),
    db.from('subappaltatori').select('*').order('ragione_sociale'),
    db.from('documenti_team_subappalti').select(COLONNE_DOCUMENTO_TS).is('sostituito_da', null)
  ]);

  const errore = utentiRes.error || subRes.error || docRes.error;
  if (errore) {
    ge('ts-scadenze-lista').innerHTML = `<div class="al2 e">Errore caricamento: ${esc(errore.message)}</div>`;
    ge('ts-dipendenti-lista').innerHTML = '';
    ge('ts-subappaltatori-lista').innerHTML = '';
    return;
  }

  dipendentiElencoTS = utentiRes.data || [];
  subappaltatoriElenco = subRes.data || [];
  documentiInVigoreTS = docRes.data || [];

  renderScadenzeTeamSubappalti();
  renderDipendentiTeamSubappalti();
  filtraSubappaltatori();
}

// Documenti in vigore scaduti o in scadenza, di intestatari attivi.
function documentiDaSegnalareTS(documenti, utenti, subappaltatori) {
  const utentiAttivi = {};
  (utenti || []).forEach(function(u) { if (u.attivo !== false) utentiAttivi[u.id] = u; });
  const subAttivi = {};
  (subappaltatori || []).forEach(function(s) { if (s.attivo !== false) subAttivi[s.id] = s; });

  return (documenti || [])
    .filter(function(d) {
      if (d.sostituito_da) return false;
      if (d.utente_id && !utentiAttivi[d.utente_id]) return false;
      if (d.subappaltatore_id && !subAttivi[d.subappaltatore_id]) return false;
      const stato = statoDocumentoTeamSubappalti(d).codice;
      return stato === 'scaduto' || stato === 'in_scadenza';
    })
    .map(function(d) {
      return {
        documento: d,
        intestatario: d.utente_id
          ? { tipo: 'dipendente', id: d.utente_id, nome: nomeDipendenteTS(utentiAttivi[d.utente_id]) }
          : { tipo: 'subappaltatore', id: d.subappaltatore_id, nome: subAttivi[d.subappaltatore_id].ragione_sociale }
      };
    })
    .sort(function(a, b) { return String(a.documento.data_scadenza).localeCompare(String(b.documento.data_scadenza)); });
}

function htmlRigaScadenzaTS(r) {
  const d = r.documento;
  const stato = statoDocumentoTeamSubappalti(d);
  const icona = r.intestatario.tipo === 'dipendente' ? '👷' : '🏗️';
  return `
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">
      <div style="min-width:0">
        <div style="font-weight:700">${icona} ${esc(r.intestatario.nome)} <span class="bx ${stato.classe}">${esc(stato.testo)}</span></div>
        <div style="font-size:12px;color:var(--m)">
          ${esc(nomeDocumentoTS(d))}${d.riferito_a ? ' · ' + esc(d.riferito_a) : ''} · scadenza ${esc(fd(d.data_scadenza))}
        </div>
      </div>
      <button class="btn sm p" onclick="openSchedaDocumenti('${esc(r.intestatario.tipo)}', '${esc(r.intestatario.id)}')">Apri</button>
    </div>
  `;
}

function renderScadenzeTeamSubappalti() {
  const box = ge('ts-scadenze-lista');
  if (!box) return;

  const righe = documentiDaSegnalareTS(documentiInVigoreTS, dipendentiElencoTS, subappaltatoriElenco);
  const conta = ge('ts-scadenze-conta');
  if (conta) conta.textContent = righe.length ? '(' + righe.length + ')' : '';

  const nota = `<div style="font-size:12px;color:var(--m);margin-bottom:8px">Documenti in vigore scaduti o che scadono entro ${giorniPreavvisoDocumenti()} giorni (preavviso in Impostazioni). Dipendenti e subappaltatori non attivi esclusi.</div>`;

  if (!righe.length) {
    box.innerHTML = nota + '<div class="al2 ok">Nessun documento scaduto o in scadenza.</div>';
    return;
  }
  box.innerHTML = nota + '<div class="rap-list-card">' + righe.map(htmlRigaScadenzaTS).join('') + '</div>';
}

function renderDipendentiTeamSubappalti() {
  const box = ge('ts-dipendenti-lista');
  if (!box) return;

  const attivi = dipendentiElencoTS.filter(function(u) { return u.attivo !== false; });
  if (!attivi.length) {
    box.innerHTML = '<div class="empty">Nessun utente attivo.</div>';
    return;
  }

  box.innerHTML = `
    <div class="tw"><table>
      <thead><tr><th>Dipendente</th><th>Ruolo</th><th>Documenti in vigore</th><th>Situazione</th><th></th></tr></thead>
      <tbody>
        ${attivi.map(function(u) {
          const documenti = documentiInVigoreTS.filter(function(d) { return d.utente_id === u.id; });
          return `
            <tr>
              <td><b>${esc(nomeDipendenteTS(u))}</b></td>
              <td><span class="bx bblue">${esc(etichettaRuolo(u.ruolo))}</span></td>
              <td>${documenti.length}</td>
              <td>${badgeRiepilogoDocumentiTS(documenti)}</td>
              <td><button class="btn sm p" onclick="openSchedaDocumenti('dipendente', '${esc(u.id)}')">Apri</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table></div>
  `;
}

function filtraSubappaltatori() {
  const box = ge('ts-subappaltatori-lista');
  if (!box) return;

  const q = (v('ts-sub-cerca') || '').trim().toLowerCase();
  const anche = !!ge('ts-sub-non-attivi')?.checked;

  const righe = subappaltatoriElenco.filter(function(s) {
    if (!anche && s.attivo === false) return false;
    if (!q) return true;
    return [s.ragione_sociale, s.partita_iva, s.lavorazioni, s.referente_nome, s.telefono, s.email, s.referente_telefono]
      .join(' ').toLowerCase().includes(q);
  });

  if (!righe.length) {
    box.innerHTML = `<div class="empty">${subappaltatoriElenco.length ? 'Nessun subappaltatore con questi filtri.' : 'Nessun subappaltatore inserito.'}</div>`;
    return;
  }

  box.innerHTML = righe.map(function(s) {
    const documenti = documentiInVigoreTS.filter(function(d) { return d.subappaltatore_id === s.id; });
    const referente = [s.referente_nome, s.referente_ruolo].filter(Boolean).join(', ');
    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
          <div style="min-width:0">
            <div style="font-size:15px;font-weight:700">${esc(s.ragione_sociale)}
              ${s.attivo === false ? '<span class="bx bgray">Non attivo</span>' : ''}
            </div>
            ${s.lavorazioni ? `<div style="font-size:12px;margin-top:2px">${esc(s.lavorazioni)}</div>` : ''}
            <div style="font-size:12px;color:var(--m);margin-top:4px">
              Referente: ${referente ? esc(referente) : 'non indicato'}
              ${s.referente_telefono ? ' · <a href="tel:' + esc(s.referente_telefono) + '">' + esc(s.referente_telefono) + '</a>' : ''}
              ${s.referente_email ? ' · ' + esc(s.referente_email) : ''}
            </div>
            <div style="margin-top:6px">${badgeRiepilogoDocumentiTS(documenti)}</div>
          </div>
          <button class="btn sm p" onclick="openSchedaDocumenti('subappaltatore', '${esc(s.id)}')">Apri</button>
        </div>
      </div>
    `;
  }).join('');
}

// ── Anagrafica subappaltatore (finestra m-subappaltatore) ──────────
const CAMPI_SUBAPPALTATORE = [
  ['msub-ragione-sociale', 'ragione_sociale'],
  ['msub-partita-iva', 'partita_iva'],
  ['msub-lavorazioni', 'lavorazioni'],
  ['msub-indirizzo', 'indirizzo'],
  ['msub-telefono', 'telefono'],
  ['msub-email', 'email'],
  ['msub-pec', 'pec'],
  ['msub-referente-nome', 'referente_nome'],
  ['msub-referente-ruolo', 'referente_ruolo'],
  ['msub-referente-telefono', 'referente_telefono'],
  ['msub-referente-email', 'referente_email'],
  ['msub-note', 'note']
];

function apriSubappaltatore(subId) {
  if (!puoGestireTeamSubappalti()) {
    toast('Solo titolare e segreteria modificano i subappaltatori', 'err');
    return;
  }
  const s = subId ? subappaltatoriElenco.find(function(x) { return x.id === subId; }) || schedaDocumentiAperta?.dati : null;
  ge('msub-id').value = s ? s.id : '';
  ge('msub-titolo').textContent = s ? '🏗️ Modifica subappaltatore' : '🏗️ Nuovo subappaltatore';
  CAMPI_SUBAPPALTATORE.forEach(function(c) {
    const el = ge(c[0]);
    if (el) el.value = s ? (s[c[1]] || '') : '';
  });
  openM('m-subappaltatore');
  setTimeout(function() { ge('msub-ragione-sociale')?.focus(); }, 50);
}

async function salvaSubappaltatore() {
  const id = v('msub-id');
  const record = {};
  CAMPI_SUBAPPALTATORE.forEach(function(c) {
    const testo = (v(c[0]) || '').trim();
    record[c[1]] = testo || null;
  });

  if (!record.ragione_sociale) {
    toast('La ragione sociale è obbligatoria', 'err');
    ge('msub-ragione-sociale').focus();
    return;
  }
  if (!record.referente_nome) {
    toast('Indica il referente del subappaltatore', 'err');
    ge('msub-referente-nome').focus();
    return;
  }

  const bottone = ge('msub-salva');
  if (bottone) bottone.disabled = true;

  const risposta = id
    ? await db.from('subappaltatori').update(record).eq('id', id).select('id')
    : await db.from('subappaltatori').insert(record).select('id');

  if (bottone) bottone.disabled = false;

  if (risposta.error) {
    const doppia = risposta.error.code === '23505';
    toast(doppia ? 'Esiste già un subappaltatore con questa partita IVA' : 'Errore: ' + risposta.error.message, 'err');
    return;
  }
  if (!risposta.data?.length) {
    toast('Modifica non salvata: permesso negato', 'err');
    return;
  }

  toast(id ? 'Subappaltatore aggiornato' : 'Subappaltatore inserito', 'ok');
  closeM('m-subappaltatore');

  if (ge('pg-scheda-documenti')?.classList.contains('on') && schedaDocumentiAperta?.tipo === 'subappaltatore') {
    await caricaSchedaDocumenti();
  } else if (!id && risposta.data[0]?.id) {
    await loadTeamSubappalti();
    await openSchedaDocumenti('subappaltatore', risposta.data[0].id);
  } else {
    await loadTeamSubappalti();
  }
}

async function cambiaAttivoSubappaltatore(subId, attivo) {
  if (!puoGestireTeamSubappalti()) return;
  const domanda = attivo
    ? 'Riattivare il subappaltatore?'
    : 'Segnare il subappaltatore come non attivo? Resta in anagrafica con i suoi documenti, ma esce dall\'elenco e dagli avvisi di scadenza.';
  if (!confirm(domanda)) return;

  const { data, error } = await db.from('subappaltatori').update({ attivo: attivo }).eq('id', subId).select('id');
  if (error || !data?.length) {
    toast('Non salvato: ' + (error?.message || 'permesso negato'), 'err');
    return;
  }
  toast(attivo ? 'Subappaltatore riattivato' : 'Subappaltatore non attivo', 'ok');
  await caricaSchedaDocumenti();
}

// ── Scheda documenti (dipendente o subappaltatore) ─────────────────
async function openSchedaDocumenti(tipo, id) {
  if (!canAccessPage('scheda-documenti')) {
    toast('Non hai accesso a questa sezione', 'err');
    return;
  }
  const paginaAttuale = document.querySelector('.page.on')?.id?.replace('pg-', '');
  if (paginaAttuale && paginaAttuale !== 'scheda-documenti') {
    paginaPrecedenteSchedaDocumenti = paginaAttuale;
    ricordaPosizionePagina();
  }
  schedaDocumentiAperta = { tipo: tipo, id: id, dati: null };
  gotoPage('scheda-documenti');
  await caricaSchedaDocumenti();
}

function tornaDaSchedaDocumenti() {
  const destinazione = paginaPrecedenteSchedaDocumenti && canAccessPage(paginaPrecedenteSchedaDocumenti)
    ? paginaPrecedenteSchedaDocumenti
    : 'team-subappalti';
  schedaDocumentiAperta = null;
  gotoPage(destinazione);
  ripristinaPosizionePagina();
}

async function caricaSchedaDocumenti() {
  const scheda = schedaDocumentiAperta;
  const anagrafica = ge('sdoc-anagrafica');
  const box = ge('sdoc-documenti');
  if (!scheda || !anagrafica || !box) return;

  anagrafica.innerHTML = '<div class="load">Caricamento...</div>';
  box.innerHTML = '';

  if (!(await verificaTeamSubappaltiDisponibili())) {
    anagrafica.innerHTML = '<div class="al2 i">I documenti di team e subappalti non sono ancora attivi.</div>';
    return;
  }

  const intestatario = scheda.tipo === 'dipendente'
    ? await db.from('utenti').select('id, nome, cognome, ruolo, email, telefono, attivo').eq('id', scheda.id).maybeSingle()
    : await db.from('subappaltatori').select('*').eq('id', scheda.id).maybeSingle();

  if (intestatario.error || !intestatario.data) {
    ge('sdoc-titolo').textContent = 'Documenti';
    ge('sdoc-sottotitolo').textContent = '';
    anagrafica.innerHTML = `<div class="al2 e">Non trovato${intestatario.error ? ': ' + esc(intestatario.error.message) : ''}.</div>`;
    return;
  }

  scheda.dati = intestatario.data;
  const colonna = scheda.tipo === 'dipendente' ? 'utente_id' : 'subappaltatore_id';

  const { data, error } = await db
    .from('documenti_team_subappalti')
    .select(COLONNE_DOCUMENTO_TS)
    .eq(colonna, scheda.id)
    .order('data_scadenza', { ascending: true, nullsFirst: false });

  if (schedaDocumentiAperta !== scheda) return; // nel frattempo aperta un'altra scheda

  if (scheda.tipo === 'dipendente') {
    ge('sdoc-titolo').textContent = '👷 ' + nomeDipendenteTS(scheda.dati);
    ge('sdoc-sottotitolo').textContent = 'Dipendente · ' + etichettaRuolo(scheda.dati.ruolo) + (scheda.dati.attivo === false ? ' · non attivo' : '');
    anagrafica.innerHTML = '';
  } else {
    ge('sdoc-titolo').textContent = '🏗️ ' + scheda.dati.ragione_sociale;
    ge('sdoc-sottotitolo').textContent = 'Subappaltatore' + (scheda.dati.attivo === false ? ' · non attivo' : '');
    anagrafica.innerHTML = htmlAnagraficaSubappaltatore(scheda.dati);
  }

  if (error) {
    box.innerHTML = `<div class="card"><div class="al2 e">Errore caricamento documenti: ${esc(error.message)}</div></div>`;
    return;
  }

  documentiSchedaAperta = data || [];
  box.innerHTML = htmlDocumentiScheda(scheda, documentiSchedaAperta);
}

function htmlAnagraficaSubappaltatore(s) {
  const tel = function(n) { return n ? `<a href="tel:${esc(n)}">${esc(n)}</a>` : '—'; };
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <div style="font-size:14px;font-weight:700">Anagrafica</div>
        ${puoGestireTeamSubappalti() ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn sm" onclick="apriSubappaltatore('${esc(s.id)}')">✏️ Modifica</button>
            <button class="btn sm" onclick="cambiaAttivoSubappaltatore('${esc(s.id)}', ${s.attivo === false ? 'true' : 'false'})">${s.attivo === false ? '▶️ Riattiva' : '⏸️ Non attivo'}</button>
          </div>
        ` : ''}
      </div>
      <div class="g2" style="margin-bottom:10px">
        ${ir('Ragione sociale', s.ragione_sociale)}
        ${ir('Partita IVA', s.partita_iva)}
        ${ir('Lavorazioni', s.lavorazioni)}
        ${ir('Indirizzo', s.indirizzo)}
        ${ir('Telefono', s.telefono)}
        ${ir('Email / PEC', [s.email, s.pec].filter(Boolean).join(' · '))}
      </div>
      <div style="background:var(--bg);border-radius:var(--rs);padding:10px">
        <div style="font-size:11px;color:var(--m);margin-bottom:2px">Referente</div>
        <div style="font-size:13px;font-weight:600">${esc(s.referente_nome || 'non indicato')}${s.referente_ruolo ? ' <span style="font-weight:400;color:var(--m)">(' + esc(s.referente_ruolo) + ')</span>' : ''}</div>
        <div style="font-size:13px">📞 ${tel(s.referente_telefono)}${s.referente_email ? ' · ✉️ ' + esc(s.referente_email) : ''}</div>
      </div>
      ${s.note ? `<div style="font-size:12px;color:var(--m);margin-top:8px;white-space:pre-wrap">${esc(s.note)}</div>` : ''}
    </div>
  `;
}

function htmlDocumentiScheda(scheda, documenti) {
  const inVigore = documenti.filter(function(d) { return !d.sostituito_da; });
  const storico = documenti.filter(function(d) { return d.sostituito_da; })
    .sort(function(a, b) { return String(b.sostituito_il).localeCompare(String(a.sostituito_il)); });

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        <div style="font-size:14px;font-weight:700">🪪 Documenti in vigore (${inVigore.length}) ${badgeRiepilogoDocumentiTS(inVigore)}</div>
        ${puoGestireTeamSubappalti() ? `<button class="btn p sm" onclick="apriDocumentoTS('nuovo')">+ Aggiungi documento</button>` : ''}
      </div>
      ${inVigore.length
        ? inVigore.map(function(d) { return htmlDocumentoTS(d, true); }).join('')
        : '<div class="empty">Nessun documento inserito.</div>'}
      ${storico.length ? `
        <details style="margin-top:10px">
          <summary style="cursor:pointer;font-size:13px;font-weight:600">Storico: documenti rinnovati o sostituiti (${storico.length})</summary>
          ${storico.map(function(d) { return htmlDocumentoTS(d, false); }).join('')}
        </details>
      ` : ''}
    </div>
  `;
}

function htmlDocumentoTS(d, inVigore) {
  const stato = statoDocumentoTeamSubappalti(d);
  const date = [
    d.data_rilascio ? 'rilascio ' + fd(d.data_rilascio) : '',
    d.data_scadenza ? 'scadenza ' + fd(d.data_scadenza) : 'senza scadenza'
  ].filter(Boolean).join(' · ');
  const chi = d.caricato_da_nome
    ? 'inserito da ' + d.caricato_da_nome + (d.caricato_da_ruolo ? ' (' + etichettaRuolo(d.caricato_da_ruolo) + ')' : '') +
      (d.caricato_il ? ' il ' + new Date(d.caricato_il).toLocaleDateString('it-IT') : '')
    : '';

  let file = '';
  if (d.storage_path) {
    file = puoAprireFileDocumentoTS(d)
      ? `<button class="btn sm p" data-path="${esc(d.storage_path)}" onclick="apriFileDocumentoTS(this.dataset.path)">⬇️ Apri</button>`
      : '<span style="font-size:11px;color:var(--m)">🔒 file riservato</span>';
  } else {
    file = '<span style="font-size:11px;color:var(--a)">file non caricato</span>';
  }

  const azioni = inVigore && puoGestireTeamSubappalti() ? `
    <button class="btn sm" title="Nuovo documento al posto di questo (rinnovo, o per aggiungere il file)" onclick="apriDocumentoTS('rinnova', '${esc(d.id)}')">🔁 Rinnova o sostituisci</button>
    <button class="btn sm" title="Correggi tipo, date o nota" onclick="apriDocumentoTS('correggi', '${esc(d.id)}')">✏️</button>
    <button class="btn sm" style="color:var(--r)" title="Togli (inserito per errore)" onclick="togliDocumentoTS('${esc(d.id)}')">🗑️</button>
  ` : '';

  return `
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)${inVigore ? '' : ';opacity:.7'}">
      <div style="min-width:0;flex:1">
        <div style="font-size:13px;font-weight:700;word-break:break-word">
          ${esc(nomeDocumentoTS(d))}
          ${inVigore ? `<span class="bx ${stato.classe}">${esc(stato.testo)}</span>` : '<span class="bx bgray">Sostituito</span>'}
          ${d.riservato ? '<span class="bx bpur">Riservato</span>' : ''}
        </div>
        ${d.riferito_a ? `<div style="font-size:12px">Persona: <b>${esc(d.riferito_a)}</b></div>` : ''}
        <div style="font-size:12px;color:var(--m)">${esc(date)}${d.nome_file ? ' · ' + esc(d.nome_file) : ''}${d.dimensione ? ' (' + esc(dimensioneLeggibile(d.dimensione)) + ')' : ''}</div>
        ${d.nota ? `<div style="font-size:12px;color:var(--m)">${esc(d.nota)}</div>` : ''}
        ${chi ? `<div style="font-size:11px;color:var(--m)">${esc(chi)}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${file}${azioni}</div>
    </div>
  `;
}

async function apriFileDocumentoTS(path) {
  const { data, error } = await db.storage
    .from(BUCKET_TEAM_SUBAPPALTI)
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    toast('Impossibile aprire il documento: ' + (error?.message || 'file non disponibile'), 'err');
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener');
}

// ── Finestra documento (m-documento-ts): nuovo, rinnova, correggi ───
function opzioniTipoDocumentoTS(perSubappaltatore, scelto) {
  const gruppo = function(etichetta, filtro) {
    const tipi = TIPI_DOCUMENTO_TEAM_SUBAPPALTI.filter(filtro);
    return `<optgroup label="${esc(etichetta)}">${tipi.map(function(t) {
      return `<option value="${esc(t.id)}"${t.id === scelto ? ' selected' : ''}>${esc(t.nome)}</option>`;
    }).join('')}</optgroup>`;
  };
  let html = '<option value="">— Scegli il tipo —</option>';
  if (perSubappaltatore) html += gruppo('Impresa', function(t) { return t.per === 'impresa'; });
  html += gruppo(perSubappaltatore ? 'Persone (operai del subappaltatore)' : 'Persona', function(t) { return t.per === 'persona'; });
  html += gruppo('Altro', function(t) { return t.per === 'tutti'; });
  // Tipo non più in elenco (documento vecchio): resta selezionabile.
  if (scelto && !tipoDocumentoTS(scelto)) html += `<option value="${esc(scelto)}" selected>${esc(scelto)}</option>`;
  return html;
}

function apriDocumentoTS(modo, documentoId) {
  const scheda = schedaDocumentiAperta;
  if (!scheda || !puoGestireTeamSubappalti()) return;

  const d = documentoId ? documentiSchedaAperta.find(function(x) { return x.id === documentoId; }) : null;
  if (modo !== 'nuovo' && !d) return;

  const perSub = scheda.tipo === 'subappaltatore';
  ge('mdts-modo').value = modo;
  ge('mdts-documento-id').value = d ? d.id : '';
  ge('mdts-titolo').textContent = modo === 'nuovo' ? '🪪 Nuovo documento' : modo === 'rinnova' ? '🔁 Rinnova o sostituisci' : '✏️ Correggi documento';
  ge('mdts-intestatario').textContent = perSub ? scheda.dati.ragione_sociale : nomeDipendenteTS(scheda.dati);
  ge('mdts-aiuto').innerHTML = modo === 'rinnova'
    ? 'Registra il documento nuovo (o lo stesso con il file): quello di prima resta nello storico come sostituito.'
    : modo === 'correggi'
      ? 'Per correggere un errore di inserimento. Il file non cambia: per un documento rinnovato usa "Rinnova o sostituisci".'
      : '';
  ge('mdts-aiuto').style.display = modo === 'nuovo' ? 'none' : 'block';

  ge('mdts-tipo').innerHTML = opzioniTipoDocumentoTS(perSub, d ? d.tipo : '');
  ge('mdts-descrizione').value = d ? (d.descrizione || '') : '';
  ge('mdts-riferito-a').value = d ? (d.riferito_a || '') : '';
  ge('mdts-riferito-box').style.display = perSub ? '' : 'none';
  ge('mdts-rilascio').value = d && modo === 'correggi' ? (d.data_rilascio || '') : '';
  ge('mdts-scadenza').value = d && modo === 'correggi' ? (d.data_scadenza || '') : '';
  ge('mdts-rilascio').max = dataLocaleISO();
  ge('mdts-nota').value = d && modo === 'correggi' ? (d.nota || '') : '';
  ge('mdts-file').value = '';
  ge('mdts-file-box').style.display = modo === 'correggi' ? 'none' : '';

  aggiornaTipoDocumentoTS();
  openM('m-documento-ts');
}

// Mostra la descrizione per "altro", l'avviso per i riservati e la
// scadenza proposta dalla validità del tipo.
function aggiornaTipoDocumentoTS() {
  const tipo = tipoDocumentoTS(v('mdts-tipo'));
  const codice = v('mdts-tipo');
  ge('mdts-descrizione-label').textContent = codice === 'altro' ? 'Quale documento *' : 'Dettaglio (facoltativo)';
  ge('mdts-riservato').style.display = tipo && tipo.riservato ? 'block' : 'none';
  proponiScadenzaDocumentoTS(false);
}

function proponiScadenzaDocumentoTS(forza) {
  const box = ge('mdts-proposta');
  if (!box) return;
  const tipo = tipoDocumentoTS(v('mdts-tipo'));
  const rilascio = v('mdts-rilascio');
  box.innerHTML = '';
  if (!tipo || !rilascio || (!tipo.mesi && !tipo.giorni)) return;

  const proposta = tipo.mesi ? sommaMesiISO(rilascio, tipo.mesi) : sommaGiorniISO(rilascio, tipo.giorni);
  const durata = tipo.mesi
    ? (tipo.mesi % 12 === 0 ? (tipo.mesi / 12) + (tipo.mesi === 12 ? ' anno' : ' anni') : tipo.mesi + ' mesi')
    : tipo.giorni + ' giorni';

  if (forza || !v('mdts-scadenza')) ge('mdts-scadenza').value = proposta;
  box.innerHTML = `Proposta: ${esc(fd(proposta))} (${esc(durata)} dal rilascio). Verifica sempre la data scritta sul documento.`;
}

async function salvaDocumentoTS() {
  const scheda = schedaDocumentiAperta;
  if (!scheda) return;

  const modo = v('mdts-modo');
  const documentoId = v('mdts-documento-id') || null;
  const tipo = v('mdts-tipo');
  const descrizione = (v('mdts-descrizione') || '').trim();
  const riferitoA = scheda.tipo === 'subappaltatore' ? (v('mdts-riferito-a') || '').trim() : '';
  const rilascio = v('mdts-rilascio') || null;
  const scadenza = v('mdts-scadenza') || null;
  const nota = (v('mdts-nota') || '').trim();
  const file = modo === 'correggi' ? null : (ge('mdts-file')?.files || [])[0] || null;

  if (!tipo) { toast('Scegli il tipo di documento', 'err'); ge('mdts-tipo').focus(); return; }
  if (tipo === 'altro' && !descrizione) { toast('Scrivi di che documento si tratta', 'err'); ge('mdts-descrizione').focus(); return; }
  if (rilascio && rilascio > dataLocaleISO()) { toast('La data di rilascio non può essere nel futuro', 'err'); return; }
  if (rilascio && scadenza && scadenza < rilascio) { toast('La scadenza non può essere prima del rilascio', 'err'); return; }
  if (!scadenza && !confirm('Nessuna data di scadenza: il documento sarà "senza scadenza" e non darà avvisi. Continuare?')) return;
  if (file && file.size > LIMITE_FILE_TEAM_SUBAPPALTI) { toast('File oltre 50 MB: ' + file.name, 'err'); return; }

  const bottone = ge('mdts-salva');
  if (bottone) { bottone.disabled = true; bottone.textContent = '⏳ Salvataggio...'; }
  const fine = function() { if (bottone) { bottone.disabled = false; bottone.textContent = 'Salva'; } };

  if (modo === 'correggi') {
    const { error } = await db.rpc('correggi_documento_team_subappalti', {
      p_documento_id: documentoId,
      p_tipo: tipo,
      p_descrizione: descrizione || null,
      p_riferito_a: riferitoA || null,
      p_data_rilascio: rilascio,
      p_data_scadenza: scadenza,
      p_nota: nota || null
    });
    fine();
    if (error) { toast('Non salvato: ' + error.message, 'err'); return; }
    toast('Documento corretto', 'ok');
    closeM('m-documento-ts');
    await caricaSchedaDocumenti();
    return;
  }

  let path = null;
  if (file) {
    const cartella = scheda.tipo === 'dipendente' ? 'dipendenti' : 'subappaltatori';
    path = cartella + '/' + scheda.id + '/' + Date.now() + '_' + nomeFileSicuroCommessa(file.name);
    const caricamento = await db.storage
      .from(BUCKET_TEAM_SUBAPPALTI)
      .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (caricamento.error) {
      fine();
      toast('File non caricato: ' + caricamento.error.message, 'err');
      return;
    }
  }

  const { error } = await db.rpc('registra_documento_team_subappalti', {
    p_utente_id: scheda.tipo === 'dipendente' ? scheda.id : null,
    p_subappaltatore_id: scheda.tipo === 'subappaltatore' ? scheda.id : null,
    p_tipo: tipo,
    p_descrizione: descrizione || null,
    p_riferito_a: riferitoA || null,
    p_data_rilascio: rilascio,
    p_data_scadenza: scadenza,
    p_nota: nota || null,
    p_storage_path: path,
    p_nome_file: file ? file.name : null,
    p_sostituisce: modo === 'rinnova' ? documentoId : null
  });

  fine();

  if (error) {
    // Il file senza rigo non serve: lo toglie chi l'ha caricato.
    if (path) await db.storage.from(BUCKET_TEAM_SUBAPPALTI).remove([path]);
    toast('Non salvato: ' + error.message, 'err');
    return;
  }

  toast(modo === 'rinnova' ? 'Documento rinnovato' : 'Documento inserito', 'ok');
  closeM('m-documento-ts');
  await caricaSchedaDocumenti();
}

async function togliDocumentoTS(documentoId) {
  const d = documentiSchedaAperta.find(function(x) { return x.id === documentoId; });
  if (!d) return;
  const domanda = 'Togliere "' + nomeDocumentoTS(d) + '"?\n' +
    'Serve solo per un documento inserito per errore' + (d.storage_path ? ': anche il file viene cancellato.' : '.') +
    '\nPer un documento rinnovato usa invece "Rinnova o sostituisci" (il vecchio resta nello storico).';
  if (!confirm(domanda)) return;

  const { data: path, error } = await db.rpc('elimina_documento_team_subappalti', { p_documento_id: documentoId });
  if (error) {
    toast('Documento non tolto: ' + error.message, 'err');
    return;
  }
  if (path) {
    const rimozione = await db.storage.from(BUCKET_TEAM_SUBAPPALTI).remove([path]);
    if (rimozione.error) console.warn('File del documento non cancellato:', rimozione.error.message);
  }
  toast('Documento tolto', 'ok');
  await caricaSchedaDocumenti();
}

// ── Dashboard: documenti in scadenza (segreteria, capo tecnico) ────
async function caricaDocumentiInScadenzaDashboard(boxId) {
  const box = ge(boxId);
  if (!box) return;
  box.innerHTML = '';
  if (!['titolare', 'segreteria', 'capo_tecnico'].includes(ROLE)) return;
  if (!(await verificaTeamSubappaltiDisponibili())) return;

  const limite = sommaGiorniISO(dataLocaleISO(), giorniPreavvisoDocumenti());
  const [docRes, utentiRes, subRes] = await Promise.all([
    db.from('documenti_team_subappalti').select(COLONNE_DOCUMENTO_TS)
      .is('sostituito_da', null).not('data_scadenza', 'is', null).lte('data_scadenza', limite),
    db.from('utenti').select('id, nome, cognome, attivo'),
    db.from('subappaltatori').select('id, ragione_sociale, attivo')
  ]);
  const errore = docRes.error || utentiRes.error || subRes.error;
  if (errore) {
    console.warn('Documenti in scadenza:', errore.message);
    return;
  }

  const righe = documentiDaSegnalareTS(docRes.data, utentiRes.data, subRes.data);
  if (!righe.length) return;

  const scaduti = righe.filter(function(r) { return statoDocumentoTeamSubappalti(r.documento).codice === 'scaduto'; }).length;
  const mostrate = righe.slice(0, 8);

  box.innerHTML = `
    <div class="tit-section" style="margin-top:14px">🪪 Documenti team e subappalti: ${scaduti ? scaduti + (scaduti === 1 ? ' scaduto' : ' scaduti') + ', ' : ''}${righe.length - scaduti} in scadenza</div>
    <div class="rap-list-card" style="margin-bottom:14px">
      ${mostrate.map(htmlRigaScadenzaTS).join('')}
      ${righe.length > mostrate.length ? `<div style="font-size:12px;color:var(--m);padding-top:8px">e altri ${righe.length - mostrate.length}…</div>` : ''}
      <div style="padding-top:8px"><button class="btn sm" onclick="gotoPage('team-subappalti')">Tutte le scadenze</button></div>
    </div>
  `;
}

// ── Dashboard del tecnico: i miei documenti (sola lettura) ─────────
async function caricaMieiDocumentiTecnico() {
  const box = ge('tec-miei-documenti');
  if (!box) return;
  box.innerHTML = '';
  if (!ME?.id || !(await verificaTeamSubappaltiDisponibili())) return;

  const { data, error } = await db
    .from('documenti_team_subappalti')
    .select(COLONNE_DOCUMENTO_TS)
    .eq('utente_id', ME.id)
    .is('sostituito_da', null)
    .order('data_scadenza', { ascending: true, nullsFirst: false });

  if (error) {
    console.warn('I miei documenti:', error.message);
    return;
  }
  if (!data?.length) return;

  box.innerHTML = `
    <div class="tec-sec-title">
      <h2>🪪 I miei documenti</h2>
      <span class="tec-badge">${data.length}</span>
    </div>
    <div class="card">
      ${data.map(function(d) {
        const stato = statoDocumentoTeamSubappalti(d);
        return `
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">
            <div style="min-width:0">
              <div style="font-size:13px;font-weight:700">${esc(nomeDocumentoTS(d))}</div>
              <div style="font-size:12px;color:var(--m)">${d.data_scadenza ? 'scadenza ' + esc(fd(d.data_scadenza)) : 'senza scadenza'}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <span class="bx ${stato.classe}">${esc(stato.testo)}</span>
              ${d.storage_path ? `<button class="btn sm" data-path="${esc(d.storage_path)}" onclick="apriFileDocumentoTS(this.dataset.path)">Apri</button>` : ''}
            </div>
          </div>
        `;
      }).join('')}
      <div style="font-size:11px;color:var(--m);margin-top:8px">Per un documento rinnovato porta il nuovo attestato in segreteria.</div>
    </div>
  `;
}
