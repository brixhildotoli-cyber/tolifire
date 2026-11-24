// ── Capo dei rappresentanti (sql/161, richiesta di Erika del 24/11) ─────────
// Giulio (utenti.capo_rappresentanti) vede e lavora su progetti tecnici,
// clienti e preventivi dei rappresentanti seguiti dal capo: lo decide il
// database (rappresentante_gestito). Qui il sito:
//   - dashboard e "Cosa tocca a me" restano SOLO sue: preparaCapoRappresentanti
//     (js/46 la chiama prima di contare) legge una volta se è capo e i suoi
//     clienti; filtroMieCapo(q, tipo) aggiunge "solo i miei" ai contatori che
//     contano tutto quello che il rappresentante vede (commesse, materiali,
//     lavori extra, anticipi). Per chi non è capo non cambia niente;
//   - liste (clienti, progetti, preventivi da far firmare, esiti): "Tutti"
//     o "Solo i miei" (htmlSceltaVistaCapo, memoria del browser) e il nome del
//     rappresentante sulle righe non sue (etichettaRappCapo);
//   - Impostazioni (titolare): riquadro "👥 Rappresentanti seguiti da …"
//     (#si-capo-rapp-card, js/10 chiama mostraCapoRappresentantiImpostazioni)
//     con una casella per rappresentante (imposta_seguito_dal_capo).
// Senza sql/161 (sono_capo_rappresentanti assente) tutto resta come prima.

const CAPO_RAPPRESENTANTI = { letto: false, capo: false, clienti: [], nomi: {} };

async function preparaCapoRappresentanti() {
  if (CAPO_RAPPRESENTANTI.letto || typeof ROLE === 'undefined' || ROLE !== 'rappresentante') return CAPO_RAPPRESENTANTI;
  try {
    const { data, error } = await db.rpc('sono_capo_rappresentanti');
    CAPO_RAPPRESENTANTI.capo = !error && data === true;
    if (CAPO_RAPPRESENTANTI.capo) {
      const r = await db.from('clienti').select('id').eq('rappresentante_id', ME.id).limit(5000);
      CAPO_RAPPRESENTANTI.clienti = (r.data || []).map(function(c) { return c.id; });
      const u = await db.from('utenti').select('id, nome, cognome').eq('ruolo', 'rappresentante');
      (u.data || []).forEach(function(x) { CAPO_RAPPRESENTANTI.nomi[x.id] = ((x.nome || '') + ' ' + (x.cognome || '')).trim(); });
    }
  } catch (e) { CAPO_RAPPRESENTANTI.capo = false; }
  CAPO_RAPPRESENTANTI.letto = true;
  return CAPO_RAPPRESENTANTI;
}

// tipo: 'commessa' (q sulla tabella commesse), 'commessa_collegata' (q con
// commesse!inner(cliente_id)), 'preventivo' (q su preventivi)
function filtroMieCapo(q, tipo) {
  if (typeof ROLE === 'undefined' || ROLE !== 'rappresentante' || !CAPO_RAPPRESENTANTI.capo) return q;
  const ids = CAPO_RAPPRESENTANTI.clienti.length ? CAPO_RAPPRESENTANTI.clienti : ['00000000-0000-0000-0000-000000000000'];
  if (tipo === 'commessa') return q.in('cliente_id', ids);
  if (tipo === 'commessa_collegata') return q.in('commesse.cliente_id', ids);
  if (tipo === 'preventivo') return q.eq('rappresentante_id', ME.id);
  return q;
}

// ── Impostazioni: chi è seguito dal capo ───────────────────────────────
async function mostraCapoRappresentantiImpostazioni() {
  const card = ge('si-capo-rapp-card');
  if (!card) return;
  if (ROLE !== 'titolare') { card.style.display = 'none'; return; }
  const box = ge('si-capo-rapp-elenco');
  const { data, error } = await db.from('utenti').select('id, nome, cognome, attivo, capo_rappresentanti, seguito_dal_capo')
    .eq('ruolo', 'rappresentante').order('nome', { ascending: true });
  if (error) { card.style.display = 'none'; return; }   // senza sql/161 le colonne non ci sono
  card.style.display = '';
  const capo = (data || []).find(function(u) { return u.capo_rappresentanti; });
  ge('si-capo-rapp-titolo').textContent = '👥 Rappresentanti seguiti da ' + (capo ? ((capo.nome || '') + ' ' + (capo.cognome || '')).trim() : 'il capo');
  const altri = (data || []).filter(function(u) { return !u.capo_rappresentanti && u.attivo; });
  box.innerHTML = !capo ? '<div class="al2 i">Nessun capo dei rappresentanti.</div>' :
    (altri.length ? altri.map(function(u) {
      return '<label style="display:flex;gap:8px;align-items:center;font-size:13px;padding:3px 0">' +
        '<input type="checkbox" style="width:auto" data-id="' + esc(u.id) + '"' + (u.seguito_dal_capo ? ' checked' : '') + ' onchange="cambiaSeguitoDalCapo(this)">' +
        esc(((u.nome || '') + ' ' + (u.cognome || '')).trim()) + '</label>';
    }).join('') : '<div class="empty">Nessun altro rappresentante attivo.</div>');
}

async function cambiaSeguitoDalCapo(casella) {
  casella.disabled = true;
  const { error } = await db.rpc('imposta_seguito_dal_capo', { p_utente: casella.dataset.id, p_seguito: casella.checked });
  casella.disabled = false;
  if (error) { casella.checked = !casella.checked; toast('Non salvato: ' + error.message, 'err'); return; }
  toast(casella.checked ? 'Ora il capo vede progetti, clienti e preventivi di questo rappresentante ✓' : 'Il capo non vede più le sue cose ✓', 'ok');
}

// ── Liste del capo: "Tutti" (suoi e dei seguiti) o "Solo i miei" ───────
// Per un rappresentante normale le liste restano "solo i miei" come oggi.
function vistaCapo() {
  let v = 'tutti';
  try { v = localStorage.getItem('toli-vista-capo-rapp') || 'tutti'; } catch (e) { /* senza memoria del browser */ }
  return v === 'miei' ? 'miei' : 'tutti';
}

function cambiaVistaCapo(valore, ricarica) {
  try { localStorage.setItem('toli-vista-capo-rapp', valore === 'miei' ? 'miei' : 'tutti'); } catch (e) { /* niente */ }
  if (typeof window[ricarica] === 'function') window[ricarica]();
}

function capoVedeTutti() {
  return typeof ROLE !== 'undefined' && ROLE === 'rappresentante' && CAPO_RAPPRESENTANTI.capo && vistaCapo() === 'tutti';
}

// Liste filtrate dal sito con "rappresentante = io" (clienti, preventivi)
function filtroListaCapo(q, colonna) {
  if (typeof ROLE === 'undefined' || ROLE !== 'rappresentante') return q;
  return capoVedeTutti() ? q : q.eq(colonna, ME.id);
}

// Controlli prima di un'azione: il capo lavora anche sulle cose dei seguiti
function filtroAzioneCapo(q, colonna) {
  if (typeof ROLE === 'undefined' || ROLE !== 'rappresentante') return q;
  return CAPO_RAPPRESENTANTI.capo ? q : q.eq(colonna, ME.id);
}

// Liste che il database già limita (progetti tecnici): "Solo i miei" le filtra qui
function filtraDatiCapo(righe, campo) {
  if (typeof ROLE === 'undefined' || ROLE !== 'rappresentante' || !CAPO_RAPPRESENTANTI.capo || vistaCapo() === 'tutti') return righe;
  return (righe || []).filter(function(r) { return r[campo] === ME.id; });
}

function htmlSceltaVistaCapo(ricarica) {
  if (typeof ROLE === 'undefined' || ROLE !== 'rappresentante' || !CAPO_RAPPRESENTANTI.capo) return '';
  const v = vistaCapo();
  return '<select class="vista-capo-rapp" style="width:auto;font-size:13px;padding:4px 8px" onchange="cambiaVistaCapo(this.value, \'' + ricarica + '\')">' +
    '<option value="tutti"' + (v === 'tutti' ? ' selected' : '') + '>👥 Tutti (anche dei rappresentanti che segui)</option>' +
    '<option value="miei"' + (v === 'miei' ? ' selected' : '') + '>👤 Solo i miei</option></select>';
}

function mostraSceltaVistaCapo(idBox, ricarica) {
  const box = ge(idBox);
  if (box) box.innerHTML = htmlSceltaVistaCapo(ricarica);
}

function etichettaRappCapo(rappresentanteId) {
  if (typeof ROLE === 'undefined' || ROLE !== 'rappresentante' || !CAPO_RAPPRESENTANTI.capo || !rappresentanteId || rappresentanteId === ME.id) return '';
  const n = CAPO_RAPPRESENTANTI.nomi[rappresentanteId];
  return ' <span class="bx bblue" style="font-size:11px">👤 ' + esc(n || 'altro rappresentante') + '</span>';
}
