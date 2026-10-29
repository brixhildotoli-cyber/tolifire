// =====================================================================
// F8.1 — SCHEDA CANTIERE della commessa (passo 11, Capo Operativo =
// capo_tecnico). Una sola schermata, pensata per il telefono, con tutto
// quello che serve in cantiere: dove si va (indirizzo con mappa, piano e
// zona, orari e istruzioni di accesso), con chi si parla (referente del
// cliente e riserva, con il tasto Chiama), cosa si fa (lavorazioni con
// quantità dalle voci del preventivo, SENZA prezzi), con cosa (materiali
// con la data di arrivo, js/29), allegati tecnici (progetto, rilievi,
// certificati) e note di sicurezza.
// Scheda "🏗️ Cantiere" dentro commessa-detail (js/26): il capo tecnico
// la trova aperta per prima, gli altri ruoli su "Commessa e documenti".
// Riusa i dati già letti dagli altri box (materiali di js/29, documenti
// di js/26, personale del faldone di js/31): niente letture doppie.
// Con sql/34: dati del cantiere sulla commessa (imposta_dati_cantiere_
// commessa: capo tecnico, segreteria, rappresentante, titolare) e
// lavorazioni/allegati senza prezzi (scheda_cantiere_commessa), perché
// capo tecnico e segreteria non leggono preventivi e progetti per RLS.
// Senza sql/34 mostra indirizzo, referente del cliente, materiali e
// documenti della commessa, e dice che il resto non è ancora attivo.
// =====================================================================

const COLONNE_DATI_CANTIERE = 'cantiere_piano_zona, cantiere_orari, cantiere_accessi, ' +
  'cantiere_referente_nome, cantiere_referente_ruolo, cantiere_referente_telefono, ' +
  'cantiere_riserva_nome, cantiere_riserva_ruolo, cantiere_riserva_telefono, ' +
  'cantiere_note_sicurezza, cantiere_aggiornato_da_nome, cantiere_aggiornato_il';

// Stesso controllo del database (sql/34).
const FORMATO_TELEFONO_CANTIERE = /^[0-9 +()./-]{3,40}$/;

const ETICHETTE_CATEGORIA_LAVORAZIONE = {
  materiale: 'Materiale',
  manodopera: 'Manodopera',
  nolo: 'Nolo',
  trasporto: 'Trasporto',
  servizio: 'Servizio',
  altro: 'Altro'
};

let datiCantiereDisponibili = null;
let tabCommessaScelta = null;   // { commessaId, tab } per non perdere la scheda scelta ricaricando
let cantiereAperto = null;      // { commessa, dati }

// ── Disponibilità di sql/34 ─────────────────────────────────────────
async function verificaDatiCantiereDisponibili() {
  if (datiCantiereDisponibili !== null) return datiCantiereDisponibili;
  if (!(await verificaCommesseDisponibili())) return false;

  const { error } = await db
    .from('commesse')
    .select('cantiere_orari')
    .limit(1);

  if (!error) {
    datiCantiereDisponibili = true;
  } else if (error.code === '42703' || error.code === 'PGRST204' || /cantiere_orari/i.test(error.message || '')) {
    datiCantiereDisponibili = false;
  } else {
    return false;
  }
  return datiCantiereDisponibili;
}

// ── Schede "Cantiere" / "Commessa e documenti" ──────────────────────
function mostraTabCommessa(tab) {
  const cantiere = tab === 'cantiere';
  ge('cmd-tab-btn-cantiere')?.classList.toggle('on', cantiere);
  ge('cmd-tab-btn-commessa')?.classList.toggle('on', !cantiere);
  ge('cmd-tab-cantiere')?.classList.toggle('on', cantiere);
  ge('cmd-tab-commessa')?.classList.toggle('on', !cantiere);
  if (commessaApertaId) tabCommessaScelta = { commessaId: commessaApertaId, tab: cantiere ? 'cantiere' : 'commessa' };
}

// Apre la scheda e porta in vista un box della commessa (es. cmd-richieste).
function vaiABoxCommessa(idBox) {
  mostraTabCommessa('commessa');
  setTimeout(function() { ge(idBox)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
}

// Chiamata da js/26 all'inizio del caricamento della scheda.
function preparaSchedaCantiere(commessaId) {
  const stessa = tabCommessaScelta && tabCommessaScelta.commessaId === commessaId;
  mostraTabCommessa(stessa ? tabCommessaScelta.tab : (ROLE === 'capo_tecnico' ? 'cantiere' : 'commessa'));
  const box = ge('cmd-cantiere');
  if (box) box.innerHTML = '<div class="card"><div class="load">Caricamento scheda cantiere...</div></div>';
}

// ── Chi può fare cosa (le stesse regole le impone il database) ──────
function puoModificareDatiCantiere(commessa) {
  if (ROLE === 'titolare') return true;
  return ['segreteria', 'capo_tecnico', 'rappresentante'].includes(ROLE) && commessaAperta(commessa);
}

// ── Piccoli aiuti ───────────────────────────────────────────────────
function indirizzoCompletoSede(sede) {
  if (!sede) return '';
  const via = [sede.via, sede.civico].filter(Boolean).join(' ');
  const citta = [sede.cap, sede.citta, sede.provincia ? '(' + sede.provincia + ')' : ''].filter(Boolean).join(' ');
  return [via, citta].filter(Boolean).join(', ');
}

function linkMappaCantiere(sede) {
  if (!sede || !(sede.via || sede.citta)) return '';
  const indirizzo = [[sede.via, sede.civico].filter(Boolean).join(' '), sede.cap, sede.citta, sede.provincia]
    .filter(Boolean).join(' ');
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(indirizzo);
}

function numeroTelefonoChiamata(telefono) {
  return String(telefono || '').replace(/[^0-9+]/g, '');
}

function htmlBottoneChiama(nome, telefono) {
  const numero = numeroTelefonoChiamata(telefono);
  if (!numero) return '<div style="font-size:12px;color:var(--a)">Nessun telefono indicato</div>';
  return `<a class="btn p cant-azione" href="tel:${esc(numero)}">📞 Chiama ${esc(nome || '')} · ${esc(telefono)}</a>`;
}

function htmlCampoCantiere(etichetta, testo, vuoto) {
  return `
    <div class="cant-campo">
      <div class="cant-etichetta">${esc(etichetta)}</div>
      ${testo
        ? `<div class="cant-testo">${esc(testo)}</div>`
        : `<div class="cant-testo" style="color:var(--m);font-weight:400">${esc(vuoto || 'non indicato')}</div>`}
    </div>
  `;
}

function quantitaLavorazione(voce) {
  const n = typeof numeroPreventivo === 'function' ? numeroPreventivo(voce.quantita) : Number(voce.quantita || 0);
  return n.toLocaleString('it-IT', { maximumFractionDigits: 3 }) + ' ' + (voce.unita_misura || '');
}

// ── Caricamento (chiamata da js/26 alla fine della scheda commessa) ──
async function caricaSchedaCantiere(commessa) {
  const box = ge('cmd-cantiere');
  if (!box || !commessa) return;
  cantiereAperto = null;

  const [attivi, faldoneOk] = await Promise.all([
    verificaDatiCantiereDisponibili(),
    typeof verificaFaldoneDisponibile === 'function' ? verificaFaldoneDisponibile() : false
  ]);

  const colonne = [attivi ? COLONNE_DATI_CANTIERE : '', faldoneOk ? 'data_inizio, data_fine_prevista' : '']
    .filter(Boolean).join(', ');

  const [rSede, rCliente, rDati, rScheda] = await Promise.all([
    commessa.sede_id
      ? db.from('sedi_cliente').select('id, nome, tipo, via, civico, cap, citta, provincia, zona, note').eq('id', commessa.sede_id).maybeSingle()
      : null,
    commessa.cliente_id
      ? db.from('clienti').select('ragione_sociale, referente_nome, referente_telefono, referente_email').eq('id', commessa.cliente_id).maybeSingle()
      : null,
    colonne
      ? db.from('commesse').select('id, ' + colonne).eq('id', commessa.id).maybeSingle()
      : null,
    attivi
      ? db.rpc('scheda_cantiere_commessa', { p_commessa_id: commessa.id })
      : null
  ]);

  if (commessaApertaId && commessaApertaId !== commessa.id) return; // aperta un'altra commessa

  const errori = [];
  if (rSede?.error) errori.push('sede: ' + rSede.error.message);
  if (rCliente?.error) errori.push('cliente: ' + rCliente.error.message);
  if (rDati?.error) errori.push('dati del cantiere: ' + rDati.error.message);
  if (rScheda?.error) errori.push('lavorazioni e allegati: ' + rScheda.error.message);

  const dati = (rDati && !rDati.error && rDati.data) || {};
  cantiereAperto = { commessa: commessa, dati: dati };

  box.innerHTML = htmlSchedaCantiere({
    commessa: commessa,
    attivi: attivi,
    faldoneOk: faldoneOk,
    sede: (rSede && !rSede.error && rSede.data) || null,
    cliente: (rCliente && !rCliente.error && rCliente.data) || null,
    dati: dati,
    scheda: (rScheda && !rScheda.error && rScheda.data) || null,
    errori: errori
  });
}

// ── La schermata ────────────────────────────────────────────────────
function htmlSchedaCantiere(x) {
  const c = x.commessa;
  const modifica = x.attivi && puoModificareDatiCantiere(c);

  const righeTestata = [
    x.faldoneOk ? `
      <div style="font-size:14px">📅 ${x.dati.data_inizio
        ? 'Lavori <b>' + esc(testoDateLavori(x.dati)) + '</b>'
        : '<span style="color:var(--a)">Date dei lavori non ancora fissate dalla segreteria</span>'}</div>
    ` : '',
    x.errori.length ? `<div class="al2 e" style="margin:8px 0 0">Errore caricamento: ${esc(x.errori.join(' · '))}</div>` : '',
    !x.attivi ? '<div class="al2 i" style="margin:8px 0 0">Lavorazioni dal preventivo, allegati tecnici, accessi, referenti del cantiere e note di sicurezza non sono ancora attivi.</div>' : '',
    modifica ? `<button class="btn cant-azione" style="margin-top:8px" onclick="apriDatiCantiere()">✏️ ${haDatiCantiere(x.dati) ? 'Modifica accessi, referenti e sicurezza' : 'Scrivi accessi, referenti e sicurezza'}</button>` : ''
  ].filter(Boolean);
  const testata = righeTestata.length ? `<div class="card cant-card">${righeTestata.join('')}</div>` : '';

  return testata +
    htmlDoveCantiere(x) +
    htmlChiCantiere(x) +
    htmlSicurezzaCantiere(x) +
    htmlCosaCantiere(x) +
    htmlMaterialiCantiere(x) +
    htmlAllegatiCantiere(x) +
    (x.dati.cantiere_aggiornato_il ? `
      <div style="font-size:11px;color:var(--m);margin:-4px 0 14px">
        Dati del cantiere scritti${x.dati.cantiere_aggiornato_da_nome ? ' da ' + esc(x.dati.cantiere_aggiornato_da_nome) : ''} il ${esc(new Date(x.dati.cantiere_aggiornato_il).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))}.
      </div>
    ` : '');
}

function haDatiCantiere(d) {
  return !!(d && d.cantiere_aggiornato_il);
}

function htmlDoveCantiere(x) {
  const sede = x.sede;
  const indirizzo = indirizzoCompletoSede(sede);
  const mappa = linkMappaCantiere(sede);

  let corpo;
  if (!x.commessa.sede_id) {
    corpo = `<div class="al2 w" style="margin:0 0 8px">Sede del cantiere <b>da indicare</b> (segreteria o rappresentante, nella scheda "Commessa e documenti").</div>`;
  } else if (!sede) {
    corpo = '<div class="al2 w" style="margin:0 0 8px">Sede del cantiere non disponibile.</div>';
  } else {
    corpo = `
      <div class="cant-testo" style="font-size:15px">${esc(indirizzo || 'Indirizzo non indicato nella sede')}</div>
      <div style="font-size:12px;color:var(--m);margin-bottom:8px">${esc([sede.nome || sede.tipo, sede.zona ? 'zona ' + sede.zona : ''].filter(Boolean).join(' · '))}</div>
      ${mappa ? `<a class="btn p cant-azione" href="${esc(mappa)}" target="_blank" rel="noopener">🗺️ Apri la mappa</a>` : ''}
      ${sede.note ? htmlCampoCantiere('Note della sede', sede.note) : ''}
    `;
  }

  return `
    <div class="card cant-card">
      <div class="cant-titolo">📍 Dove si va</div>
      ${corpo}
      ${x.attivi ? `
        ${htmlCampoCantiere('Piano e zona di lavoro', x.dati.cantiere_piano_zona)}
        ${htmlCampoCantiere('Orari di accesso', x.dati.cantiere_orari)}
        ${htmlCampoCantiere('Istruzioni di accesso (badge, chiavi, parcheggio, carico/scarico)', x.dati.cantiere_accessi)}
      ` : ''}
    </div>
  `;
}

function htmlChiCantiere(x) {
  const d = x.dati;
  const cli = x.cliente || {};
  const referenteCantiere = !!(d.cantiere_referente_nome || d.cantiere_referente_telefono);

  const referente = referenteCantiere
    ? { nome: d.cantiere_referente_nome, ruolo: d.cantiere_referente_ruolo, telefono: d.cantiere_referente_telefono, nota: 'referente in cantiere' }
    : { nome: cli.referente_nome, ruolo: '', telefono: cli.referente_telefono, nota: 'referente del cliente (anagrafica)' };

  const riserva = (d.cantiere_riserva_nome || d.cantiere_riserva_telefono)
    ? { nome: d.cantiere_riserva_nome, ruolo: d.cantiere_riserva_ruolo, telefono: d.cantiere_riserva_telefono }
    : null;

  function persona(p, titolo) {
    return `
      <div class="cant-campo">
        <div class="cant-etichetta">${esc(titolo)}</div>
        <div class="cant-testo">${esc(p.nome || 'Nome non indicato')}${p.ruolo ? ` <span style="font-weight:400;color:var(--m)">· ${esc(p.ruolo)}</span>` : ''}</div>
        ${p.nota ? `<div style="font-size:11px;color:var(--m);margin-bottom:4px">${esc(p.nota)}</div>` : ''}
        ${htmlBottoneChiama(p.nome, p.telefono)}
      </div>
    `;
  }

  // Personale del faldone (js/31): lo vedono titolare, segreteria, capo tecnico.
  const faldone = typeof faldoneAperto !== 'undefined' && faldoneAperto && faldoneAperto.commessa?.id === x.commessa.id
    ? (faldoneAperto.stato?.persone || [])
    : null;

  return `
    <div class="card cant-card">
      <div class="cant-titolo">👤 Con chi si parla</div>
      ${referente.nome || referente.telefono
        ? persona(referente, 'Referente')
        : '<div style="font-size:13px;color:var(--a);margin-bottom:8px">Nessun referente indicato (né sul cantiere né sul cliente).</div>'}
      ${riserva
        ? persona(riserva, 'Riserva')
        : (x.attivi ? htmlCampoCantiere('Riserva', '', 'nessun referente di riserva indicato') : '')}
      ${faldone !== null ? `
        <div class="cant-campo">
          <div class="cant-etichetta">Personale in cantiere (faldone)</div>
          <div class="cant-testo" style="font-weight:400">${faldone.length
            ? faldone.map(function(p) { return '<b>' + esc(p.nome) + '</b>' + (p.utente_id ? '' : ' <span style="color:var(--m)">(subappaltatore)</span>'); }).join(', ')
            : '<span style="color:var(--m)">nessuno ancora nel faldone</span>'}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function htmlSicurezzaCantiere(x) {
  if (!x.attivi) return '';
  const note = x.dati.cantiere_note_sicurezza;
  return `
    <div class="card cant-card"${note ? ' style="border-left:3px solid #EF9F27"' : ''}>
      <div class="cant-titolo">⛑️ Note di sicurezza</div>
      ${note
        ? `<div class="cant-testo" style="font-weight:500">${esc(note)}</div>`
        : '<div style="font-size:13px;color:var(--m)">Nessuna nota: rischi specifici, DPI richiesti e regole del cliente non sono stati indicati.</div>'}
    </div>
  `;
}

function htmlCosaCantiere(x) {
  if (!x.attivi) return '';
  const s = x.scheda || {};
  const voci = s.lavorazioni || [];
  const p = s.progetto;

  const descrizione = p && (p.descrizione_tecnica || p.materiali_note) ? `
    <details class="cant-campo">
      <summary style="font-size:13px;cursor:pointer"><b>Descrizione tecnica del progetto</b>${p.tipologia ? ' <span style="color:var(--m)">· ' + esc(typeof tipologiaLeggibileOrdine === 'function' ? tipologiaLeggibileOrdine(p.tipologia) : p.tipologia) + '</span>' : ''}</summary>
      ${p.descrizione_tecnica ? `<div class="cant-testo" style="font-weight:400;margin-top:4px">${esc(p.descrizione_tecnica)}</div>` : ''}
      ${p.materiali_note ? `<div class="cant-testo" style="font-weight:400;margin-top:4px"><b>Materiali:</b> ${esc(p.materiali_note)}</div>` : ''}
    </details>
  ` : '';

  return `
    <div class="card cant-card">
      <div class="cant-titolo">🔧 Cosa si fa (${voci.length})</div>
      <div style="font-size:11px;color:var(--m);margin-bottom:6px">Lavorazioni e quantità dalle voci del preventivo accettato.</div>
      ${voci.length
        ? voci.map(function(voce) {
            return `
              <div class="cant-riga">
                <div style="min-width:0;flex:1;word-break:break-word">
                  ${esc(voce.descrizione)}
                  ${voce.categoria && voce.categoria !== 'materiale' ? ` <span class="bx bgray">${esc(ETICHETTE_CATEGORIA_LAVORAZIONE[voce.categoria] || voce.categoria)}</span>` : ''}
                </div>
                <div class="cant-quantita">${esc(quantitaLavorazione(voce).trim())}</div>
              </div>
            `;
          }).join('')
        : '<div class="empty">Il preventivo non ha voci.</div>'}
      ${descrizione}
    </div>
  `;
}

function htmlMaterialiCantiere(x) {
  const leggibili = typeof htmlRigaMateriale === 'function' && typeof materialiCommessaAperta !== 'undefined';
  const righe = leggibili ? (materialiCommessaAperta || []) : [];
  const daArrivare = righe.filter(function(r) { return !r.arrivato; });
  const arrivati = righe.filter(function(r) { return r.arrivato; });
  const inRitardo = righe.filter(function(r) { return r.inRitardo; }).length;
  const chiedi = typeof richiesteIntegrazioneAttive === 'function' && richiesteIntegrazioneAttive() &&
    typeof puoAprireRichiestaIntegrazione === 'function' && puoAprireRichiestaIntegrazione(x.commessa) &&
    typeof commessaRichiesteAperta !== 'undefined' && commessaRichiesteAperta?.id === x.commessa.id;

  return `
    <div class="card cant-card">
      <div class="cant-titolo">📦 Con cosa: materiali (${righe.length})</div>
      ${inRitardo ? `<div class="al2 e" style="margin:0 0 8px"><b>${inRitardo} in ritardo</b>: arrivo previsto passato.</div>` : ''}
      ${daArrivare.length
        ? daArrivare.map(htmlRigaMateriale).join('')
        : `<div class="empty">${righe.length ? 'Tutto arrivato.' : 'Nessun materiale ordinato o richiesto per questa commessa.'}</div>`}
      ${arrivati.length ? `
        <details style="margin-top:6px">
          <summary style="font-size:13px;cursor:pointer;color:var(--m)">Arrivati (${arrivati.length})</summary>
          ${arrivati.map(htmlRigaMateriale).join('')}
        </details>
      ` : ''}
      ${chiedi ? `<button class="btn cant-azione" style="margin-top:8px" onclick="apriNuovaRichiestaIntegrazione('consumabile')">➕ Chiedi consumabili o noli</button>` : ''}
    </div>
  `;
}

function htmlAllegatiCantiere(x) {
  const s = x.scheda || {};
  const allegati = x.attivi ? (s.allegati || []) : [];
  const certificati = x.attivi ? (s.certificati || []) : [];
  const schede = x.attivi ? (s.schede_rilievo || []) : [];
  const documenti = (typeof documentiCommessaAperta !== 'undefined' ? documentiCommessaAperta : [])
    .filter(function(d) { return d.cartella === 'certificati'; });

  function riga(icona, nome, dettaglio, bucket, path) {
    return `
      <div class="cant-riga">
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:600;word-break:break-word">${icona} ${esc(nome)}</div>
          ${dettaglio ? `<div style="font-size:11px;color:var(--m)">${esc(dettaglio)}</div>` : ''}
        </div>
        <button class="btn sm p" data-bucket="${esc(bucket)}" data-path="${esc(path)}" onclick="apriFileCantiere(this.dataset.bucket, this.dataset.path)">Apri</button>
      </div>
    `;
  }

  // Decisioni 29/10: l'originale del preventivo firmato (letto da js/26
  // con la cartella documenti; per il capo tecnico serve sql/42).
  const firmato = x.commessa && x.commessa.preventivoFirmato &&
    typeof puoAprirePreventivoFirmato === 'function' && puoAprirePreventivoFirmato()
    ? x.commessa.preventivoFirmato
    : null;

  const righe = []
    .concat(firmato ? [riga('✍️', firmato.nome || 'Preventivo firmato', 'Preventivo firmato dal cliente (originale)', 'preventivi-documenti', firmato.path)] : [])
    .concat(allegati.map(function(a) { return riga('📐', a.nome_file, 'Progetto tecnico' + (a.dimensione ? ' · ' + dimensioneLeggibile(a.dimensione) : ''), 'progetti-tecnici', a.storage_path); }))
    .concat(certificati.map(function(cf) { return riga('🏅', cf.nome_file, 'Certificato del preventivo' + (cf.dimensione ? ' · ' + dimensioneLeggibile(cf.dimensione) : ''), 'certificati-preventivi', cf.storage_path); }))
    .concat(documenti.map(function(d) { return riga('🏅', d.nome_file, 'Cartella della commessa' + (d.nota ? ' · ' + d.nota : ''), 'commesse-documenti', d.storage_path); }));

  const htmlSchede = schede.map(function(sc) {
    const campi = Object.entries(sc.dati || {}).filter(function(e) { return e[1] !== null && e[1] !== undefined && e[1] !== ''; });
    return `
      <details class="cant-campo">
        <summary style="font-size:13px;cursor:pointer">📝 <b>Rilievo: ${esc(etichettaFamigliaTecnica(sc.famiglia))}</b>${sc.stato === 'bozza' ? ' <span class="bx bwarn">bozza</span>' : ''}</summary>
        ${campi.length
          ? campi.map(function(e) {
              return `<div style="padding:4px 0;border-bottom:1px solid var(--bo)"><div style="font-size:11px;color:var(--m)">${esc(etichettaCampoTecnico(e[0]))}</div><div style="font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(valoreSchedaTecnica(e[1]))}</div></div>`;
            }).join('')
          : '<div style="font-size:12px;color:var(--m)">La scheda non contiene dati.</div>'}
      </details>
    `;
  }).join('');

  const totale = righe.length + schede.length;
  return `
    <div class="card cant-card">
      <div class="cant-titolo">📎 Allegati tecnici (${totale})</div>
      ${totale
        ? righe.join('') + htmlSchede
        : `<div class="empty">${x.attivi ? 'Nessun disegno, rilievo o certificato caricato su progetto e preventivo.' : 'Nessun certificato nella cartella della commessa.'}</div>`}
      <button class="btn sm" style="margin-top:8px" onclick="vaiABoxCommessa('cmd-documenti')">📂 Tutti i documenti della commessa</button>
    </div>
  `;
}

// ── Apertura dei file ───────────────────────────────────────────────
async function apriFileCantiere(bucket, path) {
  if (!['progetti-tecnici', 'certificati-preventivi', 'commesse-documenti', 'preventivi-documenti'].includes(bucket) || !path) return;
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    toast('Impossibile aprire il file: ' + (error?.message || 'file non disponibile'), 'err');
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener');
}

// ── Finestra "Dati del cantiere" (solo con sql/34) ──────────────────
function apriDatiCantiere() {
  if (!cantiereAperto) return;
  const c = cantiereAperto.commessa;
  const d = cantiereAperto.dati || {};

  ge('cant-mod-sottotitolo').textContent = 'Commessa ' + c.codice +
    (c.clienti?.ragione_sociale ? ' · ' + c.clienti.ragione_sociale : '') +
    (c.titolo ? ' · ' + c.titolo : '');
  ge('cant-mod-piano-zona').value = d.cantiere_piano_zona || '';
  ge('cant-mod-orari').value = d.cantiere_orari || '';
  ge('cant-mod-accessi').value = d.cantiere_accessi || '';
  ge('cant-mod-ref-nome').value = d.cantiere_referente_nome || '';
  ge('cant-mod-ref-ruolo').value = d.cantiere_referente_ruolo || '';
  ge('cant-mod-ref-tel').value = d.cantiere_referente_telefono || '';
  ge('cant-mod-ris-nome').value = d.cantiere_riserva_nome || '';
  ge('cant-mod-ris-ruolo').value = d.cantiere_riserva_ruolo || '';
  ge('cant-mod-ris-tel').value = d.cantiere_riserva_telefono || '';
  ge('cant-mod-sicurezza').value = d.cantiere_note_sicurezza || '';
  ge('cant-mod-salva').disabled = false;
  openM('m-dati-cantiere');
}

async function salvaDatiCantiere() {
  if (!cantiereAperto) return;
  const commessa = cantiereAperto.commessa;
  const testo = function(id) { return (v(id) || '').trim(); };

  const telRef = testo('cant-mod-ref-tel');
  const telRis = testo('cant-mod-ris-tel');
  if (telRef && !FORMATO_TELEFONO_CANTIERE.test(telRef)) {
    toast('Telefono del referente non valido: solo cifre, spazi e + ( ) . / -', 'err');
    return;
  }
  if (telRis && !FORMATO_TELEFONO_CANTIERE.test(telRis)) {
    toast('Telefono della riserva non valido: solo cifre, spazi e + ( ) . / -', 'err');
    return;
  }

  const bottone = ge('cant-mod-salva');
  if (bottone) bottone.disabled = true;

  const { error } = await db.rpc('imposta_dati_cantiere_commessa', {
    p_commessa_id: commessa.id,
    p_piano_zona: testo('cant-mod-piano-zona') || null,
    p_orari: testo('cant-mod-orari') || null,
    p_accessi: testo('cant-mod-accessi') || null,
    p_referente_nome: testo('cant-mod-ref-nome') || null,
    p_referente_ruolo: testo('cant-mod-ref-ruolo') || null,
    p_referente_telefono: telRef || null,
    p_riserva_nome: testo('cant-mod-ris-nome') || null,
    p_riserva_ruolo: testo('cant-mod-ris-ruolo') || null,
    p_riserva_telefono: telRis || null,
    p_note_sicurezza: testo('cant-mod-sicurezza') || null
  });

  if (bottone) bottone.disabled = false;

  if (error) {
    toast('Dati del cantiere non salvati: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-dati-cantiere');
  toast('Dati del cantiere salvati', 'ok');
  if (commessaApertaId === commessa.id) await caricaSchedaCantiere(commessa);
}
