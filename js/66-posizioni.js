// ── F15.2 — POSIZIONI P-xx DENTRO LE SCHEDE DI RILIEVO (sql/76) ───────
// Tabella progetti_tecnici_posizioni: dentro una scheda di rilievo (una per
// tipo e, con sql/48, una per piano o zona) l'elenco delle posizioni P-01,
// P-02... = una porta, un attraversamento, una trave: id fisso, quantità,
// ubicazione, misure (dati.larghezza, dati.altezza in cm), note, i campi
// "per posizione" del catalogo lavorazioni (sql/75, se ci sono) e le foto.
// La scheda resta per i dati comuni del piano o della zona.
// - "⧉ Duplica" (RPC duplica_posizione): da 1 a 50 copie uguali (ubicazione,
//   quantità, misure e dati; foto no). 10 porte uguali = P-01 + "Duplica" 9.
// - Il codice P-xx lo dà il DATABASE (il più alto del progetto + 1, mai
//   riusato) e non si cambia; la posizione si "toglie" (tolta = true) e si
//   rimette, non si cancella. Le posizioni si salvano subito, una per una:
//   non serve "Salva" della scheda.
// - Foto: allegati del progetto (bucket progetti-tecnici, cartella
//   <utente>/<progetto>/posizioni/, riga in progetti_tecnici_allegati come
//   gli altri file del progetto) elencati in posizione.foto.
// Dove: nella scheda di rilievo aperta (m-rilievo-tecnico, js/18: riquadro
// rsm-posizioni sotto il nome della scheda, solo per una scheda già salvata)
// e nel tab "📝 Rilievi tecnici" della scheda progetto (js/17: riquadro
// pd-posizioni-<id scheda> in ogni scheda).
// Chi (regole del database, RLS di sql/76): leggono titolare, ingegnere,
// rappresentante (suoi progetti) e commerciale (progetti inviati al
// commerciale o in preventivazione); scrivono titolare, ingegnere e il
// rappresentante sui suoi progetti in bozza o da integrare. Il sito mostra i
// pulsanti solo a chi può (puoScriverePosizioni), ma decide il database.
// Finestre: m-posizione (id pos-) e m-posizione-duplica (id posd-).
// Senza sql/76 il sito resta come prima: nessun riquadro, nessun errore.

const POSIZIONI = { disponibili: null, progetti: {}, aperta: null, duplica: null, contesto: null };

function posizioniAttive() { return POSIZIONI.disponibili === true; }

async function verificaPosizioniDisponibili() {
  if (POSIZIONI.disponibili !== null) return POSIZIONI.disponibili;
  if (typeof db === 'undefined' || !db) return false;
  const { error } = await db.from('progetti_tecnici_posizioni').select('id').limit(1);
  if (!error) {
    POSIZIONI.disponibili = true;
  } else if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|Could not find/i.test(error.message || '')) {
    POSIZIONI.disponibili = false;
  } else {
    return false; // errore passeggero: si riprova la prossima volta
  }
  return POSIZIONI.disponibili;
}

// Stato e rappresentante del progetto (per sapere se mostrare i pulsanti)
async function progettoPerPosizioni(progettoId) {
  if (POSIZIONI.progetti[progettoId]) return POSIZIONI.progetti[progettoId];
  const { data } = await db.from('progetti_tecnici').select('id,stato,rappresentante_id').eq('id', progettoId).maybeSingle();
  POSIZIONI.progetti[progettoId] = data || { id: progettoId };
  return POSIZIONI.progetti[progettoId];
}

function puoScriverePosizioni(progetto) {
  if (ROLE === 'titolare' || ROLE === 'ingegnere') return true;
  if (ROLE !== 'rappresentante' || !progetto || typeof ME === 'undefined' || !ME) return false;
  return progetto.rappresentante_id === ME.id && ['bozza', 'da_integrare'].includes(progetto.stato);
}

// ── Numeri con la virgola ─────────────────────────────────────────────
function numeroPosizione(testo) {
  const t = String(testo === null || testo === undefined ? '' : testo).trim().replace(/\s/g, '');
  if (!t) return null;
  const n = Number(t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isFinite(n) ? n : NaN;
}

function testoNumeroPosizione(n) {
  if (n === null || n === undefined || n === '') return '';
  const x = Number(String(n).replace(',', '.'));
  return isFinite(x) ? x.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : String(n);
}

// Campi "per posizione" del catalogo (sql/75), se ci sono
function campiCatalogoPosizione(famiglia) {
  if (typeof lavorazioneCatalogo !== 'function') return [];
  const l = lavorazioneCatalogo(famiglia);
  const fissi = ['larghezza', 'altezza', 'note', 'quantita', 'ubicazione'];
  return ((l && l.lavorazioni_campi) || []).filter(function(c) {
    return c.attivo && c.per_posizione && c.tipo !== 'foto' && !fissi.includes(c.codice);
  });
}

function testoMisurePosizione(p) {
  const d = p.dati || {};
  const l = testoNumeroPosizione(d.larghezza);
  const a = testoNumeroPosizione(d.altezza);
  if (l && a) return l + ' × ' + a + ' cm';
  if (l) return 'larghezza ' + l + ' cm';
  if (a) return 'altezza ' + a + ' cm';
  return '';
}

function testoCampiCatalogoPosizione(p, famiglia) {
  const d = p.dati || {};
  return campiCatalogoPosizione(famiglia).map(function(c) {
    const val = d[c.codice];
    if (val === null || val === undefined || val === '') return '';
    let t = String(val);
    if (c.tipo === 'menu') {
      const voce = (c.valori_ammessi || []).find(function(x) { return x.valore === val; });
      t = voce ? voce.etichetta : t;
    } else if (c.tipo === 'si_no') {
      t = val === 'si' || val === true ? 'Sì' : 'No';
    } else if (c.tipo === 'numero') {
      t = testoNumeroPosizione(val) + (c.unita ? ' ' + c.unita : '');
    }
    return c.etichetta + ': ' + t;
  }).filter(Boolean).join(' · ');
}

// ── Elenco delle posizioni di una scheda ───────────────────────────────
// contesto = { contenitore, progettoId, schedaId, famiglia, titolo }
function htmlElencoPosizioni(ctx, righe, scrive) {
  const attive = righe.filter(function(p) { return !p.tolta; });
  const tolte = righe.filter(function(p) { return p.tolta; });
  const pezzi = attive.reduce(function(s, p) { return s + (Number(p.quantita) || 0); }, 0);
  const cx = esc(JSON.stringify(ctx.contenitore));

  function riga(p) {
    const misure = testoMisurePosizione(p);
    const altri = testoCampiCatalogoPosizione(p, ctx.famiglia);
    const note = String((p.dati && p.dati.note) || '').trim();
    const foto = (p.foto || []).length;
    const id = esc(JSON.stringify(p.id));
    return `
      <div class="pos-riga" id="pos-riga-${esc(p.id)}" style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--b)${p.tolta ? ';opacity:.6' : ''}">
        <div style="min-width:0;flex:1 1 220px">
          <div style="font-weight:700">${esc(p.codice)}${p.ubicazione ? ' <span style="font-weight:400">· ' + esc(p.ubicazione) + '</span>' : ''}</div>
          <div style="font-size:12px;color:var(--m);overflow-wrap:anywhere">
            Quantità ${esc(testoNumeroPosizione(p.quantita))}${misure ? ' · ' + esc(misure) : ''}${foto ? ' · 📷 ' + foto : ''}${altri ? ' · ' + esc(altri) : ''}
          </div>
          ${note ? `<div style="font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(note)}</div>` : ''}
          ${p.tolta ? `<div style="font-size:11px;color:var(--m)">Tolta${p.tolta_da_nome ? ' da ' + esc(p.tolta_da_nome) : ''}${p.tolta_il ? ' il ' + esc(new Date(p.tolta_il).toLocaleDateString('it-IT')) : ''}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${p.tolta
            ? (scrive ? `<button type="button" class="btn sm" onclick='rimettiPosizione(${id}, ${cx})'>↩️ Rimetti</button>` : '')
            : `
              <button type="button" class="btn sm" onclick='apriPosizione(${id}, ${cx})'>${scrive ? '✏️ Modifica' : '👁 Apri'}</button>
              ${scrive ? `<button type="button" class="btn sm" id="pos-duplica-${esc(p.id)}" onclick='apriDuplicaPosizione(${id}, ${cx})'>⧉ Duplica</button>` : ''}
            `}
        </div>
      </div>
    `;
  }

  return `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
      <div>
        <div style="font-weight:700">📍 Posizioni${attive.length ? ' (' + attive.length + ')' : ''}</div>
        <div style="font-size:12px;color:var(--m)">
          ${attive.length
            ? 'P-01, P-02...: una riga per porta, attraversamento o elemento; ' + esc(testoNumeroPosizione(pezzi)) + ' in tutto.'
            : 'Nessuna posizione: una riga per ogni porta, attraversamento o elemento (P-01, P-02...).'}
          ${scrive ? ' Si salvano subito, una per una.' : ''}
        </div>
      </div>
      ${scrive ? `<button type="button" class="btn sm p" id="pos-nuova-btn" onclick='apriPosizione(null, ${cx})'>+ Aggiungi posizione</button>` : ''}
    </div>
    ${attive.map(riga).join('')}
    ${tolte.length ? `
      <details style="margin-top:6px">
        <summary style="font-size:12px;color:var(--m);cursor:pointer">Tolte (${tolte.length})</summary>
        ${tolte.map(riga).join('')}
      </details>
    ` : ''}
  `;
}

// Disegna l'elenco in un contenitore. righe facoltative (già lette).
async function disegnaPosizioniScheda(ctx, righe) {
  const box = ge(ctx.contenitore);
  if (!box || !(await verificaPosizioniDisponibili())) {
    if (box) box.innerHTML = '';
    return;
  }
  POSIZIONI.contesti = POSIZIONI.contesti || {};
  POSIZIONI.contesti[ctx.contenitore] = ctx;
  if (!righe) {
    const { data, error } = await db.from('progetti_tecnici_posizioni')
      .select('*').eq('scheda_id', ctx.schedaId).order('numero');
    if (error) {
      box.innerHTML = '<div class="al2 e">Errore lettura delle posizioni: ' + esc(error.message) + '</div>';
      return;
    }
    righe = data || [];
  }
  const progetto = await progettoPerPosizioni(ctx.progettoId);
  const scrive = puoScriverePosizioni(progetto);
  if (!righe.length && !scrive) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = '';
  box.innerHTML = htmlElencoPosizioni(ctx, righe, scrive);
}

// js/18: scheda di rilievo aperta (chiamata da htmlBarraSchedeRilievo)
async function disegnaPosizioniSchedaAperta() {
  const box = ge('rsm-posizioni');
  const s = typeof schedaRilievoAperta !== 'undefined' ? schedaRilievoAperta : null;
  if (!box || !s) return;
  if (!(await verificaPosizioniDisponibili())) { box.remove(); return; }
  const salvata = typeof rigaSalvataSchedaRilievo === 'function' ? rigaSalvataSchedaRilievo(s.numero) : null;
  if (!salvata) {
    box.style.display = '';
    box.innerHTML = '<div style="font-weight:700">📍 Posizioni</div><div style="font-size:12px;color:var(--m)">Salva la scheda per aggiungere le posizioni (P-01, P-02...).</div>';
    return;
  }
  await disegnaPosizioniScheda({
    contenitore: 'rsm-posizioni',
    progettoId: s.progettoId,
    schedaId: salvata.id,
    famiglia: s.famiglia,
    titolo: (typeof etichettaFamigliaTecnica === 'function' ? etichettaFamigliaTecnica(s.famiglia) : s.famiglia) + ' – scheda ' + s.numero
  });
}

// js/17: tab "Rilievi tecnici" della scheda progetto (una lettura sola)
async function disegnaPosizioniProgetto(progettoId, schede) {
  if (!schede || !schede.length || !(await verificaPosizioniDisponibili())) return;
  delete POSIZIONI.progetti[progettoId];
  const { data, error } = await db.from('progetti_tecnici_posizioni')
    .select('*').eq('progetto_tecnico_id', progettoId).order('numero');
  for (const scheda of schede) {
    const ctx = {
      contenitore: 'pd-posizioni-' + scheda.id,
      progettoId: progettoId,
      schedaId: scheda.id,
      famiglia: scheda.famiglia,
      titolo: typeof titoloSchedaRilievo === 'function' ? titoloSchedaRilievo(scheda, schede) : scheda.famiglia
    };
    if (error) {
      const box = ge(ctx.contenitore);
      if (box) box.innerHTML = '<div class="al2 e">Errore lettura delle posizioni: ' + esc(error.message) + '</div>';
      continue;
    }
    await disegnaPosizioniScheda(ctx, (data || []).filter(function(p) { return p.scheda_id === scheda.id; }));
  }
}

async function ridisegnaPosizioni(contenitore) {
  const ctx = (POSIZIONI.contesti || {})[contenitore];
  if (ctx) await disegnaPosizioniScheda(ctx);
}

function erroreScritturaPosizione(error) {
  const m = String((error && error.message) || '');
  if (/row-level security|permission denied|42501/i.test(m) || (error && error.code === '42501')) {
    return 'Non puoi cambiare le posizioni di questo progetto (il rappresentante solo sui suoi progetti in bozza o da integrare)';
  }
  return m || 'errore sconosciuto';
}

// ── Finestra della posizione (nuova o esistente) ──────────────────────
async function apriPosizione(id, contenitore) {
  const ctx = (POSIZIONI.contesti || {})[contenitore];
  if (!ctx) return;
  let p = null;
  if (id) {
    const { data, error } = await db.from('progetti_tecnici_posizioni').select('*').eq('id', id).maybeSingle();
    if (error || !data) { toast('Posizione non trovata' + (error ? ': ' + error.message : ''), 'err'); return; }
    p = data;
  }
  if (typeof caricaCatalogoLavorazioni === 'function') {
    try { await caricaCatalogoLavorazioni(); } catch (e) { /* catalogo facoltativo */ }
  }
  const progetto = await progettoPerPosizioni(ctx.progettoId);
  const scrive = puoScriverePosizioni(progetto);
  POSIZIONI.aperta = { id: id, ctx: ctx, riga: p, scrive: scrive, foto: (p && p.foto) ? p.foto.slice() : [] };
  const d = (p && p.dati) || {};

  ge('pos-titolo').textContent = (p ? p.codice : 'Nuova posizione') + ' · ' + ctx.titolo;
  ge('pos-ubicazione').value = (p && p.ubicazione) || '';
  ge('pos-quantita').value = p ? testoNumeroPosizione(p.quantita) : '1';
  ge('pos-larghezza').value = testoNumeroPosizione(d.larghezza);
  ge('pos-altezza').value = testoNumeroPosizione(d.altezza);
  ge('pos-note').value = d.note || '';
  ge('pos-codice-info').textContent = p
    ? 'Codice ' + p.codice + ' (non cambia)' + (p.creata_da_nome ? ' · creata da ' + p.creata_da_nome : '') +
      (p.aggiornata_il ? ' · ultima modifica ' + new Date(p.aggiornata_il).toLocaleString('it-IT') + (p.aggiornata_da_nome ? ' (' + p.aggiornata_da_nome + ')' : '') : '')
    : 'Il codice (P-01, P-02...) lo dà il gestionale al salvataggio.';

  // Campi "per posizione" del catalogo lavorazioni
  const campi = campiCatalogoPosizione(ctx.famiglia);
  ge('pos-campi').innerHTML = campi.map(function(c) {
    const idc = 'pos-c-' + c.codice;
    const val = d[c.codice];
    const etich = esc(c.etichetta) + (c.unita ? ' (' + esc(c.unita) + ')' : '');
    if (c.tipo === 'menu' || c.tipo === 'si_no') {
      const opz = c.tipo === 'si_no'
        ? [{ valore: 'si', etichetta: 'Sì' }, { valore: 'no', etichetta: 'No' }]
        : (c.valori_ammessi || []);
      const presente = val === undefined || val === null || val === '' || opz.some(function(o) { return o.valore === val; });
      return `<div class="f"><label for="${idc}">${etich}</label><select id="${idc}">
        <option value="">Seleziona</option>
        ${opz.map(function(o) { return '<option value="' + esc(o.valore) + '"' + (o.valore === val ? ' selected' : '') + '>' + esc(o.etichetta) + '</option>'; }).join('')}
        ${presente ? '' : '<option value="' + esc(val) + '" selected>' + esc(val) + ' (non più in elenco)</option>'}
      </select></div>`;
    }
    const valore = c.tipo === 'numero' ? testoNumeroPosizione(val) : (val || '');
    return `<div class="f"><label for="${idc}">${etich}</label><input id="${idc}" ${c.tipo === 'numero' ? 'inputmode="decimal"' : 'maxlength="200"'} value="${esc(valore)}"></div>`;
  }).join('');

  disegnaFotoPosizione();
  ['pos-ubicazione', 'pos-quantita', 'pos-larghezza', 'pos-altezza', 'pos-note'].forEach(function(x) { ge(x).disabled = !scrive; });
  ge('pos-campi').querySelectorAll('input,select').forEach(function(el) { el.disabled = !scrive; });
  ge('pos-salva').style.display = scrive ? '' : 'none';
  ge('pos-togli').style.display = scrive && p ? '' : 'none';
  ge('pos-foto-riga').style.display = scrive && p ? '' : 'none';
  ge('pos-foto-nuova-info').style.display = scrive && !p ? '' : 'none';
  openM('m-posizione');
}

function disegnaFotoPosizione() {
  const a = POSIZIONI.aperta;
  const box = ge('pos-foto');
  if (!a || !box) return;
  if (!a.foto.length) { box.innerHTML = '<span style="font-size:12px;color:var(--m)">Nessuna foto.</span>'; return; }
  box.innerHTML = a.foto.map(function(f, i) {
    return `<div style="display:flex;gap:8px;align-items:center;font-size:13px;margin:3px 0">
      <a href="#" onclick="apriFotoPosizione(${i});return false">📷 ${esc(f.nome || ('Foto ' + (i + 1)))}</a>
      ${a.scrive ? `<button type="button" class="btn sm" title="Togli dalla posizione (il file resta tra i file del progetto)" onclick="togliFotoPosizione(${i})">✕</button>` : ''}
    </div>`;
  }).join('');
}

async function apriFotoPosizione(i) {
  const a = POSIZIONI.aperta;
  const f = a && a.foto[i];
  if (!f || !f.percorso) return;
  const { data, error } = await db.storage.from('progetti-tecnici').createSignedUrl(f.percorso, 600);
  if (error || !data || !data.signedUrl) { toast('Foto non disponibile' + (error ? ': ' + error.message : ''), 'err'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

async function salvaFotoElencoPosizione() {
  const a = POSIZIONI.aperta;
  const { error } = await db.from('progetti_tecnici_posizioni').update({ foto: a.foto }).eq('id', a.id).select('id').single();
  return error;
}

async function togliFotoPosizione(i) {
  const a = POSIZIONI.aperta;
  if (!a || !a.scrive || !confirm('Togliere la foto da questa posizione? Il file resta tra i file del progetto.')) return;
  const prima = a.foto.slice();
  a.foto.splice(i, 1);
  const error = await salvaFotoElencoPosizione();
  if (error) { a.foto = prima; toast('Errore: ' + erroreScritturaPosizione(error), 'err'); return; }
  disegnaFotoPosizione();
  await ridisegnaPosizioni(a.ctx.contenitore);
}

// Foto con il metro: file del progetto (come gli allegati di js/17)
async function caricaFotoPosizione(input) {
  const a = POSIZIONI.aperta;
  const files = Array.from((input && input.files) || []);
  if (input) input.value = '';
  if (!a || !a.id || !files.length) return;
  const { data: auth } = await db.auth.getUser();
  const uid = auth && auth.user && auth.user.id;
  if (!uid) { toast('Sessione scaduta: rientra e riprova', 'err'); return; }
  let caricate = 0;
  for (const originale of files) {
    if (a.foto.length >= 30) { toast('Al massimo 30 foto per posizione', 'err'); break; }
    const file = typeof ridimensionaFotoGiornale === 'function' ? await ridimensionaFotoGiornale(originale) : originale;
    if (file.size > 10 * 1024 * 1024) { toast(originale.name + ': oltre 10 MB', 'err'); continue; }
    const codice = (a.riga && a.riga.codice) || 'P';
    const nome = codice + '_' + String(file.name || 'foto.jpg');
    const path = uid + '/' + a.ctx.progettoId + '/posizioni/' + Date.now() + '_' + nome.replace(/[^a-zA-Z0-9._-]/g, '_');
    const up = await db.storage.from('progetti-tecnici').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
    if (up.error) { toast('Caricamento non riuscito: ' + up.error.message, 'err'); continue; }
    const { data: alleg, error: errA } = await db.from('progetti_tecnici_allegati').insert({
      progetto_id: a.ctx.progettoId, nome_file: nome, storage_path: path,
      mime_type: file.type || 'image/jpeg', dimensione: file.size, caricato_da: uid
    }).select('id').single();
    if (errA) {
      await db.storage.from('progetti-tecnici').remove([path]);
      toast('Foto non salvata tra i file del progetto: ' + errA.message, 'err');
      continue;
    }
    a.foto.push({ allegato_id: alleg.id, percorso: path, nome: nome });
    const error = await salvaFotoElencoPosizione();
    if (error) { a.foto.pop(); toast('Errore: ' + erroreScritturaPosizione(error), 'err'); continue; }
    caricate++;
  }
  disegnaFotoPosizione();
  if (caricate) {
    toast(caricate === 1 ? 'Foto aggiunta' : caricate + ' foto aggiunte', 'ok');
    await ridisegnaPosizioni(a.ctx.contenitore);
  }
}

async function salvaPosizione() {
  const a = POSIZIONI.aperta;
  if (!a || !a.scrive) return;
  const quantita = numeroPosizione(v('pos-quantita'));
  if (quantita === null || isNaN(quantita) || quantita <= 0 || quantita > 100000) {
    toast('Quantità: un numero maggiore di zero (es. 1 oppure 2,5)', 'err'); return;
  }
  const dati = Object.assign({}, (a.riga && a.riga.dati) || {});
  const misure = { larghezza: numeroPosizione(v('pos-larghezza')), altezza: numeroPosizione(v('pos-altezza')) };
  for (const k of Object.keys(misure)) {
    if (misure[k] !== null && (isNaN(misure[k]) || misure[k] < 0)) { toast('Misura non valida: ' + k + ' (solo numeri, es. 90 o 92,5)', 'err'); return; }
    if (misure[k] === null) delete dati[k]; else dati[k] = misure[k];
  }
  const note = String(v('pos-note') || '').trim();
  if (note) dati.note = note; else delete dati.note;
  for (const c of campiCatalogoPosizione(a.ctx.famiglia)) {
    const el = ge('pos-c-' + c.codice);
    if (!el) continue;
    let val = String(el.value || '').trim();
    if (c.tipo === 'numero' && val) {
      const n = numeroPosizione(val);
      if (isNaN(n)) { toast(c.etichetta + ': solo numeri', 'err'); return; }
      val = n;
    }
    if (val === '' || val === null) delete dati[c.codice]; else dati[c.codice] = val;
  }
  const riga = { ubicazione: String(v('pos-ubicazione') || '').trim() || null, quantita: quantita, dati: dati };
  const btn = ge('pos-salva');
  btn.disabled = true;
  try {
    let r;
    if (a.id) {
      r = await db.from('progetti_tecnici_posizioni').update(riga).eq('id', a.id).select('codice').single();
    } else {
      // progetto e numero li mette il database (dalla scheda); numero qui è solo segnaposto
      r = await db.from('progetti_tecnici_posizioni')
        .insert(Object.assign({ scheda_id: a.ctx.schedaId, progetto_tecnico_id: a.ctx.progettoId, numero: 1 }, riga))
        .select('codice').single();
    }
    if (r.error) { toast('Errore salvataggio posizione: ' + erroreScritturaPosizione(r.error), 'err'); return; }
    closeM('m-posizione');
    toast((r.data && r.data.codice ? r.data.codice : 'Posizione') + ' salvata', 'ok');
    await ridisegnaPosizioni(a.ctx.contenitore);
  } finally {
    btn.disabled = false;
  }
}

async function togliPosizione() {
  const a = POSIZIONI.aperta;
  if (!a || !a.id || !a.scrive) return;
  if (!confirm('Togliere ' + a.riga.codice + '? Il codice resta suo (non si riusa) e la posizione si può rimettere.')) return;
  const { error } = await db.from('progetti_tecnici_posizioni').update({ tolta: true }).eq('id', a.id).select('id').single();
  if (error) { toast('Errore: ' + erroreScritturaPosizione(error), 'err'); return; }
  closeM('m-posizione');
  toast(a.riga.codice + ' tolta', 'ok');
  await ridisegnaPosizioni(a.ctx.contenitore);
}

async function rimettiPosizione(id, contenitore) {
  const { data, error } = await db.from('progetti_tecnici_posizioni').update({ tolta: false }).eq('id', id).select('codice').single();
  if (error) { toast('Errore: ' + erroreScritturaPosizione(error), 'err'); return; }
  toast(data.codice + ' rimessa', 'ok');
  await ridisegnaPosizioni(contenitore);
}

// ── Duplica ────────────────────────────────────────────────────────────
async function apriDuplicaPosizione(id, contenitore) {
  const ctx = (POSIZIONI.contesti || {})[contenitore];
  const { data, error } = await db.from('progetti_tecnici_posizioni').select('id,codice,ubicazione,quantita,dati').eq('id', id).maybeSingle();
  if (!ctx || error || !data) { toast('Posizione non trovata', 'err'); return; }
  POSIZIONI.duplica = { riga: data, ctx: ctx };
  ge('posd-titolo').textContent = '⧉ Duplica ' + data.codice;
  const misure = testoMisurePosizione(data);
  ge('posd-info').textContent = 'Le copie nascono uguali a ' + data.codice + ': ' +
    [data.ubicazione, 'quantità ' + testoNumeroPosizione(data.quantita), misure].filter(Boolean).join(', ') +
    ' (senza foto). Poi cambi solo quello che è diverso. I codici li dà il gestionale, in fila.';
  ge('posd-copie').value = '1';
  openM('m-posizione-duplica');
  setTimeout(function() { const el = ge('posd-copie'); if (el) { el.focus(); el.select(); } }, 50);
}

async function duplicaPosizione() {
  const d = POSIZIONI.duplica;
  if (!d) return;
  const copie = Number(String(v('posd-copie') || '').trim());
  if (!Number.isInteger(copie) || copie < 1 || copie > 50) { toast('Copie: un numero intero da 1 a 50', 'err'); return; }
  const btn = ge('posd-conferma');
  btn.disabled = true;
  try {
    const { data, error } = await db.rpc('duplica_posizione', { p_posizione_id: d.riga.id, p_copie: copie });
    if (error) { toast('Errore: ' + erroreScritturaPosizione(error), 'err'); return; }
    const codici = (data || []).map(function(x) { return x.codice; });
    closeM('m-posizione-duplica');
    toast(codici.length === 1 ? 'Creata ' + codici[0] : 'Create ' + codici[0] + ' … ' + codici[codici.length - 1] + ' (' + codici.length + ')', 'ok');
    await ridisegnaPosizioni(d.ctx.contenitore);
  } finally {
    btn.disabled = false;
  }
}
