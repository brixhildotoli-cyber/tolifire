// =====================================================================
// F12.1 — "COSA TOCCA A ME" in cima a ogni dashboard (Fase 12 della
// roadmap). Un solo riquadro compatto sotto il saluto, con il CONTEGGIO
// di ogni cosa da fare del ruolo; ogni riga porta al box della
// dashboard (scorre e lo evidenzia) o alla pagina giusta. Le righe a zero
// non si mostrano; se non c'è niente: "Niente da fare 🎉".
// Non rifà i box delle fasi precedenti: li riassume.
//
// Nomi dei ruoli (CLAUDE.md, D1 e 26/10): "Commerciale" del documento =
// rappresentante; Acquisti = commerciale; Capo Operativo e Responsabile
// Service = capo_tecnico. Anche ingegnere e contabile hanno il riquadro.
// L'informatico usa quello del titolare (ROLE = 'titolare').
//
// REGISTRO DELLE FONTI (scelta dichiarata). Ogni "cosa da fare" è una
// fonte registrata con registraFonteToccaAMe({...}):
//   id      nome unico (serve solo al codice)
//   ruoli   ruoli che la vedono
//   icona, titolo
//   conta   async (giro) => numero | { n, nota, livello, vai } | null
//           null = fonte non attiva (SQL non eseguito, errore): la riga
//           si salta senza errori. giro.memo(chiave, fn) condivide una
//           lettura tra più righe dello stesso caricamento.
//   vai     dove porta la riga: { box: 'id' } (scorre al box della
//           dashboard; se il box è vuoto o nascosto usa pagina),
//           { pagina: 'id' } (gotoPage) o una funzione
//   livello 'urgente' (numero rosso) o normale (arancione)
//   priorita numero per l'ordine delle righe (più basso = più in alto;
//           senza: 50, a pari priorità vale l'ordine di registrazione)
//   tipo    'info' = dato da sapere, non da fare (in fondo, come
//           etichetta; non conta per "Niente da fare")
// Chi aggiunge un modulo con una cosa da fare aggiunge una fonte (anche
// dal suo file, caricato dopo questo). Le fonti qui sotto riusano le
// funzioni di verifica dei moduli (verifica*Disponibili) e le stesse
// regole dei loro box, ma contano con richieste "count/head" dove si
// può (niente righe scaricate).
//
// Prestazioni: al massimo 4 fonti lette insieme (Promise.allSettled),
// righe disegnate man mano che arrivano; il riquadro parte insieme alla
// dashboard, non dopo. Si aggiorna: con il bottone ↻, tornando alla
// Dashboard dal menu e da solo dopo un'azione che ricarica uno dei box
// riassunti (es. "Cambia stato" di una commessa).
// Nessun SQL nuovo: legge solo tabelle e RPC già usate dai box, con le
// policy RLS che ci sono (ognuno conta solo quello che può leggere).
// =====================================================================

const BOX_TOCCA_A_ME = {
  titolare: 'tam-titolare',
  segreteria: 'tam-segreteria',
  capo_tecnico: 'tam-capo-tecnico',
  commerciale: 'tam-commerciale',
  rappresentante: 'tam-rappresentante',
  tecnico: 'tam-tecnico',
  ingegnere: 'tam-ingegnere',
  contabile: 'tam-contabile'
};
const RIGHE_TOCCA_A_ME_VISIBILI = 6;   // le altre dietro "Mostra altre"
const FONTI_TOCCA_A_ME_INSIEME = 4;    // fonti lette in parallelo

const FONTI_TOCCA_A_ME = [];
let giroToccaAMe = 0;
let risultatiToccaAMe = {};      // id fonte -> { n, nota, livello, vai, testo } | null
let toccaAMeTutteAperte = false;
let toccaAMeInCaricamento = false;
let dashboardInCaricamento = 0;  // >0 mentre loadDash o loadDashRappresentante girano
let timerAggiornaToccaAMe = null;

function registraFonteToccaAMe(fonte) {
  if (!fonte || !fonte.id || typeof fonte.conta !== 'function' || !Array.isArray(fonte.ruoli)) {
    console.warn('Fonte "Cosa tocca a me" non valida:', fonte && fonte.id);
    return;
  }
  const i = FONTI_TOCCA_A_ME.findIndex(function(f) { return f.id === fonte.id; });
  if (i >= 0) FONTI_TOCCA_A_ME[i] = fonte;
  else FONTI_TOCCA_A_ME.push(fonte);
}

// ── Piccoli aiuti ───────────────────────────────────────────────────
function oggiTAM() {
  return dataLocaleISO(new Date());
}

function giorniDopoTAM(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dataLocaleISO(d);
}

function funzioneEsiste(nome) {
  return typeof window[nome] === 'function';
}

// Esegue una richiesta "count/head" e restituisce il numero (null se errore).
async function numeroTAM(richiesta, cosa) {
  const { count, error } = await richiesta;
  if (error) {
    // colonna o tabella non ancora nel database: la riga si salta in silenzio
    // (con head:true un errore 400 arriva senza messaggio)
    if (error.message && !['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code)) console.warn('Cosa tocca a me (' + cosa + '):', error.message);
    return null;
  }
  return count || 0;
}

function contaTAM(tabella, colonne) {
  return db.from(tabella).select(colonne || 'id', { count: 'exact', head: true });
}

// La commessa è aperta (non chiusa né annullata): filtro sull'embed !inner.
function soloCommesseAperte(q, campo) {
  return q.not((campo || 'commesse') + '.stato', 'in', '(chiusa,annullata)');
}

// Esito di una fonte in forma unica.
function normalizzaToccaAMe(r) {
  if (r === null || r === undefined || r === false) return null;
  if (typeof r === 'number') return isFinite(r) ? { n: r } : null;
  if (typeof r === 'object') {
    if (r.testo === undefined && (r.n === null || r.n === undefined || !isFinite(Number(r.n)))) return null;
    return r;
  }
  return null;
}

// Lettura di più fonti con un limite di richieste contemporanee.
async function eseguiConLimiteTAM(lavori, limite) {
  let prossimo = 0;
  async function operaio() {
    while (prossimo < lavori.length) {
      const i = prossimo++;
      try { await lavori[i](); } catch (e) { console.warn('Cosa tocca a me:', e); }
    }
  }
  const operai = [];
  for (let k = 0; k < Math.min(limite, lavori.length); k++) operai.push(operaio());
  await Promise.allSettled(operai);
}

// ── Caricamento e disegno ───────────────────────────────────────────
function fontiDelRuoloTAM() {
  return FONTI_TOCCA_A_ME
    .map(function(f, i) { return { f: f, i: i }; })
    .filter(function(x) { return x.f.ruoli.includes(ROLE); })
    .sort(function(a, b) { return ((a.f.priorita ?? 50) - (b.f.priorita ?? 50)) || (a.i - b.i); })
    .map(function(x) { return x.f; });
}

async function caricaToccaAMe() {
  const box = ge(BOX_TOCCA_A_ME[ROLE] || '');
  if (!box) return;
  clearTimeout(timerAggiornaToccaAMe);

  const fonti = fontiDelRuoloTAM();
  if (!fonti.length) { box.innerHTML = ''; return; }

  const mio = ++giroToccaAMe;
  const risultati = {};
  risultatiToccaAMe = risultati;
  toccaAMeInCaricamento = true;
  disegnaToccaAMe(box, fonti, risultati, false);

  const memo = {};
  const giro = {
    memo: function(chiave, fn) {
      if (!memo[chiave]) memo[chiave] = Promise.resolve().then(fn).catch(function(e) { console.warn('Cosa tocca a me (' + chiave + '):', e); return null; });
      return memo[chiave];
    }
  };

  await eseguiConLimiteTAM(fonti.map(function(f) {
    return async function() {
      let r = null;
      try { r = normalizzaToccaAMe(await f.conta(giro)); } catch (e) { console.warn('Cosa tocca a me (' + f.id + '):', e); r = null; }
      if (mio !== giroToccaAMe) return;
      risultati[f.id] = r;
      disegnaToccaAMe(box, fonti, risultati, false);
    };
  }), FONTI_TOCCA_A_ME_INSIEME);

  if (mio !== giroToccaAMe) return;
  toccaAMeInCaricamento = false;
  disegnaToccaAMe(box, fonti, risultati, true);
}

function disegnaToccaAMe(box, fonti, risultati, finito) {
  const righe = [];
  const info = [];
  fonti.forEach(function(f) {
    const r = risultati[f.id];
    if (!r) return;
    if (f.tipo === 'info') {
      info.push({ f: f, r: r });
      return;
    }
    if (!(Number(r.n) > 0)) return;
    righe.push({ f: f, r: r });
  });

  const visibili = toccaAMeTutteAperte ? righe : righe.slice(0, RIGHE_TOCCA_A_ME_VISIBILI);
  const nascoste = righe.length - visibili.length;
  const attese = fonti.filter(function(f) { return !(f.id in risultati); }).length;

  let corpo;
  if (righe.length) {
    corpo = '<div class="tam-righe">' + visibili.map(function(x) { return htmlRigaToccaAMe(x.f, x.r); }).join('') + '</div>' +
      (nascoste > 0
        ? '<button type="button" class="tam-altre" onclick="mostraTutteToccaAMe(true)">Mostra altre ' + nascoste + ' ›</button>'
        : (toccaAMeTutteAperte && righe.length > RIGHE_TOCCA_A_ME_VISIBILI
          ? '<button type="button" class="tam-altre" onclick="mostraTutteToccaAMe(false)">Mostra meno</button>'
          : ''));
  } else if (!finito) {
    corpo = '<div class="tam-vuoto attesa">⏳ Controllo cosa c\'è da fare…</div>';
  } else {
    corpo = '<div class="tam-vuoto">Niente da fare 🎉</div>';
  }

  const chips = info.length
    ? '<div class="tam-info">' + info.map(function(x) {
      return '<button type="button" class="tam-chip" data-fonte="' + esc(x.f.id) + '" onclick="vaiToccaAMe(this.dataset.fonte)">' +
        esc(x.f.icona || '') + ' ' + esc(x.f.titolo) + ': <b>' + esc(x.r.testo !== undefined ? x.r.testo : String(x.r.n)) + '</b>' +
        (x.r.nota ? ' <span class="tam-chip-nota">(' + esc(x.r.nota) + ')</span>' : '') + '</button>';
    }).join('') + '</div>'
    : '';

  box.innerHTML =
    '<div class="tam-card">' +
      '<div class="tam-head">' +
        '<span class="tam-titolo">📌 Cosa tocca a me</span>' +
        (righe.length ? '<span class="tam-totale">' + righe.length + (righe.length === 1 ? ' cosa' : ' cose') + '</span>' : '') +
        '<span class="tam-stato">' + (finito ? '' : (attese ? '⏳' : '')) + '</span>' +
        '<button type="button" class="tam-agg" title="Aggiorna" aria-label="Aggiorna" onclick="caricaToccaAMe()">↻</button>' +
      '</div>' +
      corpo + chips +
    '</div>';
}

function htmlRigaToccaAMe(f, r) {
  const livello = r.livello || f.livello || '';
  return '<button type="button" class="tam-riga' + (livello === 'urgente' ? ' urgente' : '') + '" data-fonte="' + esc(f.id) + '" onclick="vaiToccaAMe(this.dataset.fonte)">' +
    '<span class="tam-ico">' + esc(f.icona || '•') + '</span>' +
    '<span class="tam-testo">' + esc(f.titolo) + (r.nota ? '<span class="tam-nota">' + esc(r.nota) + '</span>' : '') + '</span>' +
    '<span class="tam-num">' + esc(String(r.n)) + '</span>' +
    '<span class="tam-chev">›</span>' +
  '</button>';
}

function mostraTutteToccaAMe(si) {
  toccaAMeTutteAperte = !!si;
  const box = ge(BOX_TOCCA_A_ME[ROLE] || '');
  if (box) disegnaToccaAMe(box, fontiDelRuoloTAM(), risultatiToccaAMe, !toccaAMeInCaricamento);
}

// ── Dove porta una riga ─────────────────────────────────────────────
function boxVisibileConContenuto(el) {
  return !!el && el.offsetParent !== null && el.innerHTML.trim() !== '' && el.getBoundingClientRect().height > 0;
}

function evidenziaBoxTAM(el) {
  el.style.scrollMarginTop = '64px';
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.remove('tam-evidenza');
  void el.offsetWidth;
  el.classList.add('tam-evidenza');
  setTimeout(function() { el.classList.remove('tam-evidenza'); }, 1800);
}

function vaiToccaAMe(id) {
  const f = FONTI_TOCCA_A_ME.find(function(x) { return x.id === id; });
  if (!f) return;
  const r = risultatiToccaAMe[id] || {};
  const vai = r.vai || f.vai;
  if (typeof vai === 'function') { vai(); return; }
  if (!vai) return;

  const nomeBox = typeof vai.box === 'function' ? vai.box() : vai.box;
  const el = nomeBox ? ge(nomeBox) : null;
  if (boxVisibileConContenuto(el)) { evidenziaBoxTAM(el); return; }
  if (vai.pagina && canAccessPage(vai.pagina)) { gotoPage(vai.pagina); return; }
  if (el && el.offsetParent !== null) { evidenziaBoxTAM(el); return; }
  toast('Apri la sezione dal menu', 'ok');
}

// ── Aggancio alle dashboard ─────────────────────────────────────────
// Parte insieme alla dashboard (non la aspetta).
function avviaToccaAMe() {
  clearTimeout(timerAggiornaToccaAMe);
  caricaToccaAMe().catch(function(e) { console.warn('Cosa tocca a me:', e); });
}

const loadDashPrimaToccaAMe = loadDash;
loadDash = async function() {
  dashboardInCaricamento++;
  if (ROLE !== 'rappresentante') avviaToccaAMe();
  try {
    return await loadDashPrimaToccaAMe.apply(this, arguments);
  } finally {
    dashboardInCaricamento--;
  }
};

const loadDashRappresentantePrimaToccaAMe = loadDashRappresentante;
loadDashRappresentante = async function() {
  dashboardInCaricamento++;
  avviaToccaAMe();
  try {
    return await loadDashRappresentantePrimaToccaAMe.apply(this, arguments);
  } finally {
    dashboardInCaricamento--;
  }
};

// Dopo un'azione che ricarica un box riassunto, il riquadro si aggiorna
// da solo (una volta, poco dopo). Durante il caricamento della dashboard
// no: il riquadro è già partito.
function aggiornaToccaAMePiuTardi() {
  if (dashboardInCaricamento > 0) return;
  clearTimeout(timerAggiornaToccaAMe);
  timerAggiornaToccaAMe = setTimeout(function() {
    const box = ge(BOX_TOCCA_A_ME[ROLE] || '');
    if (box && box.offsetParent !== null) caricaToccaAMe().catch(function(e) { console.warn('Cosa tocca a me:', e); });
  }, 1200);
}

[
  'caricaCommesseToccaAMe', 'loadAnticipiDaFatturare', 'caricaAppuntamentiDaFissare',
  'caricaAuditPresidiDashboard', 'caricaContrattiInScadenzaDashboard', 'caricaLavoriExtraDashboard',
  'caricaRichiesteIntegrazioneDashboard', 'caricaMaterialiInRitardoDashboard',
  'caricaControlliDaRipianificareDashboard', 'caricaDocumentiInScadenzaDashboard',
  'caricaRibaSollecitiDashboard', 'caricaKpiIncassi', 'caricaInsolutiRappresentante',
  'caricaPromemoriaAnticipiRappresentante', 'loadRichiesteModifica', 'ctLoadListaDaPianificare',
  'loadDashCapoTecnico'
].forEach(function(nome) {
  const originale = window[nome];
  if (typeof originale !== 'function') return;
  window[nome] = function() {
    const r = originale.apply(this, arguments);
    aggiornaToccaAMePiuTardi();
    return r;
  };
});

// Tornando alla Dashboard dal menu i numeri si rileggono.
const gotoPagePrimaToccaAMe = gotoPage;
gotoPage = function(id) {
  const r = gotoPagePrimaToccaAMe.apply(this, arguments);
  if (id === 'dashboard' && ROLE !== 'rappresentante' && dashboardInCaricamento === 0) {
    const pg = ge('pg-dashboard');
    if (pg && pg.classList.contains('on')) aggiornaToccaAMePiuTardi();
  }
  return r;
};

// =====================================================================
// FONTI (in ordine di importanza dentro ogni ruolo)
// =====================================================================

// ── Lettura condivisa: commesse aperte (stato e sede) ───────────────
function commesseAperteTAM(giro) {
  return giro.memo('commesse-aperte', async function() {
    if (!funzioneEsiste('verificaCommesseDisponibili') || !(await verificaCommesseDisponibili())) return null;
    const { data, error } = await db.from('commesse').select('id, stato, sede_id').not('stato', 'in', '(chiusa,annullata)').limit(2000);
    if (error) { console.warn('Cosa tocca a me (commesse):', error.message); return null; }
    return data || [];
  });
}

// Commesse ferme in uno stato il cui passo successivo è del ruolo (sql/28).
async function contaCommesseInStatoTAM(giro, stato) {
  if (!funzioneEsiste('verificaStatiCommessaDisponibili') || !(await verificaStatiCommessaDisponibili())) return null;
  const elenco = await commesseAperteTAM(giro);
  if (!elenco) return null;
  const mie = elenco.filter(function(c) { return c.stato === stato; });
  return {
    n: mie.length,
    vai: mie.length === 1 && canAccessPage('commessa-detail') ? function() { openCommessaDetail(mie[0].id); } : null
  };
}

function boxCommesseTAM() {
  return (typeof BOX_COMMESSE_TOCCA_A_ME !== 'undefined' && BOX_COMMESSE_TOCCA_A_ME[ROLE]) || '';
}

// ── Titolare ────────────────────────────────────────────────────────
registraFonteToccaAMe({
  id: 'preventivi-da-controllare', ruoli: ['titolare'], icona: '🧾',
  titolo: 'Preventivi del commerciale da controllare', livello: 'urgente',
  vai: { box: 'tit-avviso-preventivi', pagina: 'preventivi-titolare' },
  conta: function() {
    return numeroTAM(contaTAM('preventivi').not('inviato_a_titolare_il', 'is', null)
      .is('letto_titolare_il', null).not('preventivo_cliente_pdf_path', 'is', null), 'preventivi da controllare');
  }
});

registraFonteToccaAMe({
  id: 'lead-sito', ruoli: ['titolare'], icona: '📥',
  titolo: 'Nuove lead dal sito',
  vai: { box: 'tit-avviso-lead-sito', pagina: 'trattative' },
  conta: function() {
    return numeroTAM(contaTAM('lead_sito').in('stato_commerciale', ['da_qualificare', 'contattato'])
      .is('letto_titolare_il', null), 'lead dal sito');
  }
});

// ── Anticipi (passo 6) ──────────────────────────────────────────────
async function contaAnticipiTAM() {
  if (!funzioneEsiste('verificaAnticipoPreventivoDisponibile') || !(await verificaAnticipoPreventivoDisponibile())) return null;
  // Il rappresentante conta solo i suoi (policy preventivi_lettura, sql/10).
  return numeroTAM(contaTAM('preventivi').eq('stato', 'in_attesa_anticipo'), 'anticipi');
}

registraFonteToccaAMe({
  id: 'anticipi-segreteria', ruoli: ['segreteria'], icona: '💶',
  titolo: 'Anticipi da fatturare o da verificare l\'accredito', livello: 'urgente',
  vai: { box: 'seg-anticipi-sezione' },
  conta: contaAnticipiTAM
});

registraFonteToccaAMe({
  id: 'anticipi-titolare', ruoli: ['titolare'], icona: '💶',
  titolo: 'Anticipi non ancora accreditati',
  vai: { pagina: 'preventivi-titolare' },
  conta: contaAnticipiTAM
});

// ── Rappresentante ("Commerciale" del flusso) ───────────────────────
registraFonteToccaAMe({
  id: 'preventivi-da-approvare', ruoli: ['rappresentante'], icona: '🧾',
  titolo: 'Preventivi da far approvare al cliente', livello: 'urgente',
  vai: { pagina: 'preventivi-rapp' },
  conta: function() {
    return numeroTAM(contaTAM('preventivi', 'id, clienti!inner(rappresentante_id)')
      .eq('stato', 'inviato_a_rappresentante').eq('clienti.rappresentante_id', ME.id), 'preventivi da far approvare');
  }
});

registraFonteToccaAMe({
  id: 'anticipi-rappresentante', ruoli: ['rappresentante'], icona: '⏳',
  titolo: 'Anticipi da ricordare al cliente',
  vai: { box: 'rap-promemoria-anticipi', pagina: 'preventivi-rapp' },
  conta: contaAnticipiTAM
});

registraFonteToccaAMe({
  id: 'commesse-da-ordinare', ruoli: ['rappresentante'], icona: '🛒',
  titolo: 'Commesse da ordinare (passo 7)',
  vai: { box: boxCommesseTAM, pagina: 'commesse' },
  conta: function(giro) { return contaCommesseInStatoTAM(giro, 'approvata'); }
});

registraFonteToccaAMe({
  id: 'lead-assegnate', ruoli: ['rappresentante'], icona: '🎯',
  titolo: 'Nuove lead da contattare',
  vai: { box: 'rap-lead-assegnate', pagina: 'trattative' },
  conta: function() {
    return numeroTAM(contaTAM('pipeline_crm').eq('rappresentante_id', ME.id).eq('fonte_lead', 'sito_web')
      .eq('fase', 'primo_contatto').is('letto_rappresentante_il', null), 'lead assegnate');
  }
});

registraFonteToccaAMe({
  id: 'progetti-da-integrare', ruoli: ['rappresentante'], icona: '🔧',
  titolo: 'Progetti da integrare',
  vai: { box: 'rap-progetti-da-integrare', pagina: 'progetti' },
  conta: function() {
    return numeroTAM(contaTAM('progetti_tecnici').eq('stato', 'da_integrare').eq('rappresentante_id', ME.id), 'progetti da integrare');
  }
});

// ── Commesse: sede del cantiere da indicare (segreteria, rappresentante) ──
registraFonteToccaAMe({
  id: 'sede-cantiere', ruoli: ['segreteria', 'rappresentante'], icona: '📍',
  titolo: 'Commesse senza la sede del cantiere',
  vai: { pagina: 'commesse' },
  conta: async function(giro) {
    const elenco = await commesseAperteTAM(giro);
    if (!elenco) return null;
    const senza = elenco.filter(function(c) { return !c.sede_id; });
    return {
      n: senza.length,
      vai: senza.length === 1 && canAccessPage('commessa-detail') ? function() { openCommessaDetail(senza[0].id); } : null
    };
  }
});

// ── Segreteria: passi 10 e 12 della commessa ────────────────────────
registraFonteToccaAMe({
  id: 'faldoni', ruoli: ['segreteria'], icona: '🗂',
  titolo: 'Faldoni da preparare (commesse in preparazione, passo 10)',
  vai: { box: boxCommesseTAM, pagina: 'commesse' },
  conta: function(giro) { return contaCommesseInStatoTAM(giro, 'in_preparazione'); }
});

registraFonteToccaAMe({
  id: 'commesse-da-chiudere', ruoli: ['segreteria'], icona: '🏁',
  titolo: 'Commesse da chiudere (fine lavori, passo 12)', livello: 'urgente',
  vai: { box: boxCommesseTAM, pagina: 'commesse' },
  conta: function(giro) { return contaCommesseInStatoTAM(giro, 'fine_lavori'); }
});

// ── Appuntamenti con i clienti (js/41, sql/43) ──────────────────────
registraFonteToccaAMe({
  id: 'appuntamenti', ruoli: ['segreteria', 'titolare'], icona: '📞',
  titolo: 'Appuntamenti da fissare con i clienti',
  vai: { box: function() { return (typeof BOX_APPUNTAMENTI !== 'undefined' && BOX_APPUNTAMENTI[ROLE]) || ''; } },
  conta: async function() {
    if (!funzioneEsiste('verificaAppuntamentiDisponibile') || !(await verificaAppuntamentiDisponibile())) return null;
    return numeroTAM(contaTAM('ordini_lavoro').is('eliminato_il', null).eq('appuntamento_richiesto', true)
      .eq('appuntamento_fissato', false).in('stato', ['da_pianificare', 'pianificato'])
      .not('data_pianificata', 'is', null), 'appuntamenti');
  }
});

// ── Capo tecnico (Responsabile Service): interventi ─────────────────
registraFonteToccaAMe({
  id: 'da-pianificare', ruoli: ['capo_tecnico'], icona: '📋',
  titolo: 'Interventi da pianificare',
  vai: { box: 'ct-list-content' },
  conta: async function() {
    const [tutti, rip] = await Promise.all([
      numeroTAM(contaTAM('ordini_lavoro').is('eliminato_il', null).eq('stato', 'da_pianificare'), 'da pianificare'),
      // F2.2: tornati in coda perché il tecnico non ha potuto completarli
      numeroTAM(contaTAM('ordini_lavoro', 'id, schede_lavoro!inner(id)').is('eliminato_il', null).eq('stato', 'da_pianificare')
        .eq('schede_lavoro.impossibilitato', true).is('schede_lavoro.eliminato_il', null), 'da riprogrammare')
    ]);
    if (tutti === null) return null;
    return { n: tutti, nota: rip ? 'di cui ' + rip + ' da riprogrammare (non completati dal tecnico)' : '', livello: rip ? 'urgente' : '' };
  }
});

registraFonteToccaAMe({
  id: 'in-ritardo', ruoli: ['capo_tecnico', 'titolare'], icona: '⏰',
  titolo: 'Interventi in ritardo', livello: 'urgente',
  vai: { box: function() { return ROLE === 'titolare' ? 'tit-ritardo-lista' : 'ct-list-content'; }, pagina: 'interventi' },
  // stessa regola del KPI "In ritardo" delle dashboard (js/03)
  conta: function() {
    return numeroTAM(contaTAM('ordini_lavoro').is('eliminato_il', null).not('in_ritardo_il', 'is', null), 'in ritardo');
  }
});

registraFonteToccaAMe({
  id: 'richieste-modifica', ruoli: ['capo_tecnico'], icona: '✏️',
  titolo: 'Richieste di modifica dai tecnici',
  vai: { box: 'ct-richieste-modifica' },
  conta: function() {
    return numeroTAM(contaTAM('richieste_modifica_odl').eq('stato', 'in_attesa'), 'richieste modifica');
  }
});

// ── Capo tecnico (Capo Operativo): commesse, passi 8 e 11 ───────────
registraFonteToccaAMe({
  id: 'commesse-da-esaminare', ruoli: ['capo_tecnico'], icona: '📁',
  titolo: 'Commesse da esaminare: documenti, consumabili e noli (passo 8)',
  vai: { box: boxCommesseTAM, pagina: 'commesse' },
  conta: function(giro) { return contaCommesseInStatoTAM(giro, 'materiali_ordinati'); }
});

registraFonteToccaAMe({
  id: 'cantieri-da-avviare', ruoli: ['capo_tecnico'], icona: '🚧',
  titolo: 'Cantieri pronti da avviare',
  vai: { box: boxCommesseTAM, pagina: 'commesse' },
  conta: function(giro) { return contaCommesseInStatoTAM(giro, 'pronta'); }
});

registraFonteToccaAMe({
  id: 'cantieri-in-corso', ruoli: ['capo_tecnico'], icona: '🏗️',
  titolo: 'Cantieri in corso',
  vai: { box: boxCommesseTAM, pagina: 'commesse' },
  conta: function(giro) { return contaCommesseInStatoTAM(giro, 'in_corso'); }
});

// Giornale di cantiere (js/35, sql/37): giorni di cantiere degli ultimi 7
// giorni (squadra di js/33, sql/35) senza giornale. Oggi non conta.
registraFonteToccaAMe({
  id: 'giornale', ruoli: ['capo_tecnico'], icona: '📓',
  titolo: 'Giornale di cantiere da compilare',
  vai: { pagina: 'commesse' },
  conta: async function() {
    if (!funzioneEsiste('verificaGiornaleDisponibile') || !funzioneEsiste('verificaSquadraDisponibile')) return null;
    const [g, s] = await Promise.all([verificaGiornaleDisponibile(), verificaSquadraDisponibile()]);
    if (!g || !s) return null;
    const oggi = oggiTAM();
    const dal = giorniDopoTAM(oggi, -7);
    const [rs, rg] = await Promise.all([
      soloCommesseAperte(db.from('commesse_squadra_giorni').select('commessa_id, data, commesse!inner(stato)')
        .gte('data', dal).lt('data', oggi)).limit(1000),
      db.from('commesse_giornale').select('commessa_id, giorno').gte('giorno', dal).lt('giorno', oggi).limit(1000)
    ]);
    if (rs.error || rg.error) { console.warn('Cosa tocca a me (giornale):', (rs.error || rg.error).message); return null; }
    const fatti = {};
    (rg.data || []).forEach(function(x) { fatti[x.commessa_id + '|' + x.giorno] = true; });
    const mancanti = (rs.data || []).filter(function(x) { return !fatti[x.commessa_id + '|' + x.data]; });
    const commesse = Array.from(new Set(mancanti.map(function(x) { return x.commessa_id; })));
    return {
      n: mancanti.length,
      nota: mancanti.length ? 'giorni di cantiere degli ultimi 7 giorni' + (commesse.length > 1 ? ', ' + commesse.length + ' commesse' : '') : '',
      vai: commesse.length === 1 ? function() { openCommessaDetail(commesse[0]); } : null
    };
  }
});

// Materiali (js/29): ordini ai fornitori (sql/30) e consumabili/noli (sql/31)
async function contaMaterialiTAM(dal, al, soloOrdini) {
  const [ordiniAttivi, richiesteAttive] = await Promise.all([
    funzioneEsiste('verificaOrdiniFornitoriDisponibili') ? verificaOrdiniFornitoriDisponibili() : false,
    !soloOrdini && funzioneEsiste('verificaRichiesteIntegrazioneDisponibili') ? verificaRichiesteIntegrazioneDisponibili() : false
  ]);
  if (!ordiniAttivi && !richiesteAttive) return null;
  function periodo(q) {
    if (dal) q = q.gte('arrivo_previsto', dal);
    return al ? q.lte('arrivo_previsto', al) : q;
  }
  const [o, r] = await Promise.all([
    ordiniAttivi
      ? numeroTAM(periodo(soloCommesseAperte(contaTAM('ordini_fornitori', 'id, commesse!inner(stato)')
        .in('stato', ['ordinato', 'confermato']))), 'ordini')
      : 0,
    richiesteAttive
      ? numeroTAM(periodo(soloCommesseAperte(contaTAM('commesse_richieste_integrazione', 'id, commesse!inner(stato)')
        .eq('stato', 'evasa'))), 'consumabili e noli')
      : 0
  ]);
  if (o === null && r === null) return null;
  return { n: (o || 0) + (r || 0), ordini: o || 0, richieste: r || 0 };
}

registraFonteToccaAMe({
  id: 'materiali-ritardo', ruoli: ['capo_tecnico', 'rappresentante', 'titolare'], icona: '⚠️',
  titolo: 'Materiali in ritardo', livello: 'urgente',
  vai: { box: function() { return (typeof BOX_MATERIALI_RITARDO !== 'undefined' && BOX_MATERIALI_RITARDO[ROLE]) || ''; }, pagina: 'commesse' },
  conta: async function() {
    const oggi = oggiTAM();
    const r = await contaMaterialiTAM(null, giorniDopoTAM(oggi, -1), false);
    if (!r) return null;
    return { n: r.n, nota: r.n && r.ordini && r.richieste ? r.ordini + ' ordini, ' + r.richieste + ' consumabili e noli' : '' };
  }
});

registraFonteToccaAMe({
  id: 'materiali-in-arrivo', ruoli: ['capo_tecnico'], icona: '🚚',
  titolo: 'Materiali in arrivo nei prossimi 7 giorni',
  vai: { box: 'ct-richieste-integrazione', pagina: 'commesse' },
  conta: async function() {
    const oggi = oggiTAM();
    const r = await contaMaterialiTAM(oggi, giorniDopoTAM(oggi, 7), false);
    if (!r) return null;
    return { n: r.n, nota: r.n && r.ordini && r.richieste ? r.ordini + ' ordini, ' + r.richieste + ' consumabili e noli' : '' };
  }
});

// ── Lavori extra (js/36, sql/38): come i box delle dashboard ────────
registraFonteToccaAMe({
  id: 'lavori-extra', ruoli: ['commerciale', 'rappresentante', 'capo_tecnico'], icona: '➕',
  titolo: 'Lavori extra',
  vai: { box: function() { return (typeof BOX_LAVORI_EXTRA_DASHBOARD !== 'undefined' && BOX_LAVORI_EXTRA_DASHBOARD[ROLE]) || ''; }, pagina: 'commesse' },
  conta: async function() {
    if (!funzioneEsiste('verificaLavoriExtraDisponibili') || !(await verificaLavoriExtraDisponibili())) return null;
    const stati = ROLE === 'capo_tecnico' ? ['richiesto', 'in_preventivo', 'accettato'] : ['richiesto', 'in_preventivo'];
    const { data, error } = await soloCommesseAperte(db.from('commesse_lavori_extra').select('id, stato, commesse!inner(stato)')
      .in('stato', stati)).limit(1000);
    if (error) { console.warn('Cosa tocca a me (lavori extra):', error.message); return null; }
    let lavori = data || [];
    // Capo tecnico: gli accettati solo finché il cantiere è aperto (come il box)
    if (ROLE === 'capo_tecnico') lavori = lavori.filter(function(r) { return r.stato !== 'accettato' || r.commesse.stato !== 'fine_lavori'; });
    const daEseguire = lavori.filter(function(r) { return r.stato === 'accettato'; }).length;
    const testi = {
      commerciale: 'da preparare il preventivo integrativo',
      rappresentante: 'preventivo integrativo da far approvare',
      capo_tecnico: daEseguire ? daEseguire + ' accettati da eseguire, gli altri non si eseguono ancora' : 'in attesa del preventivo integrativo: non eseguire'
    };
    return { n: lavori.length, nota: lavori.length ? testi[ROLE] : '' };
  }
});

// ── Audit dei presidi (js/40, sql/41) ───────────────────────────────
registraFonteToccaAMe({
  id: 'audit-presidi', ruoli: ['titolare', 'capo_tecnico', 'rappresentante'], icona: '🔎',
  titolo: 'Audit presidi: differenze con il contratto',
  vai: { box: function() { return (typeof BOX_AUDIT_PRESIDI !== 'undefined' && BOX_AUDIT_PRESIDI[ROLE]) || ''; } },
  conta: async function() {
    if (!funzioneEsiste('verificaAuditPresidiDisponibile') || !(await verificaAuditPresidiDisponibile())) return null;
    const { data, error } = await db.rpc('audit_presidi_da_esaminare');
    if (error) { console.warn('Cosa tocca a me (audit):', error.message); return null; }
    return Array.isArray(data) ? data.length : 0;
  }
});

// ── Contratti di manutenzione in scadenza (js/39, sql/40) ───────────
registraFonteToccaAMe({
  id: 'contratti-scadenza', ruoli: ['rappresentante', 'titolare'], icona: '📄',
  titolo: 'Contratti di manutenzione da rinnovare',
  vai: { box: function() { return (typeof BOX_CONTRATTI_SCADENZA !== 'undefined' && BOX_CONTRATTI_SCADENZA[ROLE]) || ''; } },
  conta: async function() {
    if (!funzioneEsiste('verificaContrattoRinnovoDisponibile') || !(await verificaContrattoRinnovoDisponibile())) return null;
    const preavviso = funzioneEsiste('giorniPreavvisoRinnovo') ? giorniPreavvisoRinnovo() : 60;
    let q = contaTAM('clienti_periodicita', 'id, clienti!inner(eliminato_il, rappresentante_id)')
      .eq('contratto_stato', 'attivo').not('data_fine_contratto', 'is', null)
      .lte('data_fine_contratto', giorniDopoTAM(oggiTAM(), preavviso)).is('clienti.eliminato_il', null);
    if (ROLE === 'rappresentante') q = q.eq('clienti.rappresentante_id', ME.id);
    const n = await numeroTAM(q, 'contratti');
    return n === null ? null : { n: n, nota: n ? 'scaduti o in scadenza entro ' + preavviso + ' giorni' : '' };
  }
});

// ── Capo tecnico: piano dei controlli periodici ─────────────────────
registraFonteToccaAMe({
  id: 'ripartenza', ruoli: ['capo_tecnico'], icona: '🔁',
  titolo: 'Controlli scaduti da ripianificare (clienti)', livello: 'urgente',
  vai: { box: 'ct-ripartenza' },
  conta: async function() {
    if (!funzioneEsiste('controlliDaRipianificare')) return null;
    const ris = await controlliDaRipianificare();
    if (!ris || ris.errore) return null;
    return ris.lista.length;
  }
});

registraFonteToccaAMe({
  id: 'periodici-mese', ruoli: ['capo_tecnico'], icona: '📅',
  titolo: 'Interventi periodici del mese da schedulare (clienti)',
  vai: { box: 'ct-cicli-mese', pagina: 'piano-mensile' },
  conta: async function() {
    const mese = oggiTAM().slice(0, 7);
    const { data, error } = await db.from('cicli_pianificati').select('cliente_id')
      .eq('mese_anno', mese).eq('stato', 'pianificato').is('odl_id', null).limit(5000);
    if (error) { console.warn('Cosa tocca a me (periodici):', error.message); return null; }
    return new Set((data || []).map(function(c) { return c.cliente_id; })).size;
  }
});

// ── Richieste dei clienti (ticket) ──────────────────────────────────
registraFonteToccaAMe({
  id: 'ticket', ruoli: ['capo_tecnico', 'segreteria'], icona: '🎫',
  titolo: 'Richieste dei clienti aperte',
  vai: { box: function() { return ROLE === 'segreteria' ? 'seg-ticket-lista' : 'ct-ticket-lista'; } },
  conta: function() {
    // come i box: segreteria solo "aperto" assegnati a lei; capo tecnico i non chiusi suoi
    let q = contaTAM('ticket_clienti').is('eliminato_il', null);
    q = ROLE === 'segreteria'
      ? q.eq('stato', 'aperto').eq('assegnato_a', 'segreteria')
      : q.neq('stato', 'chiuso').eq('assegnato_a', 'capo_tecnico');
    return numeroTAM(q, 'ticket');
  }
});

// ── Schede di lavoro e fatturazione ─────────────────────────────────
registraFonteToccaAMe({
  id: 'schede-da-approvare', ruoli: ['segreteria', 'titolare'], icona: '✍️',
  titolo: 'Schede di lavoro firmate da approvare',
  vai: { pagina: 'workflow' },
  conta: function() {
    return numeroTAM(contaTAM('schede_lavoro').is('eliminato_il', null).eq('stato', 'firmata')
      .not('impossibilitato', 'is', true), 'schede da approvare');
  }
});

// Buoni (schede) da fatturare. Con sql/45 (js/43) le schede fatturabili
// senza una fattura o bozza; prima, le schede "da fatturare".
registraFonteToccaAMe({
  id: 'schede-da-fatturare', ruoli: ['segreteria', 'contabile'], icona: '💜',
  titolo: 'Buoni di lavoro da fatturare',
  vai: function() {
    if (fattureBozzeAttiveTAM() && canAccessPage('fatture')) {
      gotoPage('fatture');
      setTimeout(function() { const b = ge('fat-schede-box'); if (b) evidenziaBoxTAM(b); }, 900);
    } else {
      gotoPage('workflow');
    }
  },
  conta: async function() {
    const bozze = funzioneEsiste('verificaFattureBozze') ? await verificaFattureBozze() : false;
    if (!bozze || !funzioneEsiste('fattureAttivePerScheda')) {
      return numeroTAM(contaTAM('schede_lavoro').is('eliminato_il', null).eq('stato', 'da_fatturare')
        .not('impossibilitato', 'is', true), 'schede da fatturare');
    }
    const { data, error } = await db.from('schede_lavoro').select('id')
      .in('stato', STATI_SCHEDA_FATTURABILE).not('impossibilitato', 'is', true).is('eliminato_il', null).limit(300);
    if (error) { console.warn('Cosa tocca a me (schede da fatturare):', error.message); return null; }
    const gia = await fattureAttivePerScheda((data || []).map(function(s) { return s.id; }));
    if (!gia) return null;
    return (data || []).filter(function(s) { return !gia[s.id]; }).length;
  }
});

function fattureBozzeAttiveTAM() {
  return typeof fattureBozzeAttive !== 'undefined' && fattureBozzeAttive === true;
}

registraFonteToccaAMe({
  id: 'fatture-bozze', ruoli: ['segreteria', 'contabile', 'titolare'], icona: '🧾',
  titolo: 'Bozze di fattura da emettere',
  vai: { pagina: 'fatture' },
  conta: async function() {
    if (!funzioneEsiste('verificaFattureBozze') || !(await verificaFattureBozze())) return null;
    return numeroTAM(contaTAM('fatture').is('eliminato_il', null).eq('stato', 'bozza'), 'bozze di fattura');
  }
});

registraFonteToccaAMe({
  id: 'anagrafiche', ruoli: ['segreteria'], icona: '📝',
  titolo: 'Clienti con i dati di fatturazione da completare',
  vai: { box: 'seg-anag-lista' },
  conta: function() {
    return numeroTAM(contaTAM('clienti').is('eliminato_il', null).eq('stato', 'attivo')
      .or('indirizzo_fattura.is.null,codice_sdi.is.null,modalita_pagamento.is.null'), 'anagrafiche');
  }
});

// ── RIBA, insoluti e solleciti (js/45, sql/47) ──────────────────────
function datiRibaTAM(giro) {
  return giro.memo('riba', async function() {
    if (!funzioneEsiste('verificaFattureRiba') || !funzioneEsiste('datiRibaSolleciti') || !(await verificaFattureRiba())) return null;
    return datiRibaSolleciti();
  });
}

function vaiRibaTAM() {
  if (funzioneEsiste('vaiARibaFatture') && canAccessPage('fatture')) vaiARibaFatture();
  else { const b = ge(ROLE === 'contabile' ? 'dash-riba-solleciti' : 'seg-riba-solleciti'); if (b) evidenziaBoxTAM(b); }
}

registraFonteToccaAMe({
  id: 'riba-da-presentare', ruoli: ['segreteria', 'contabile'], icona: '🏦',
  titolo: 'RIBA da presentare entro 60 giorni',
  vai: vaiRibaTAM,
  conta: async function(giro) {
    const k = await datiRibaTAM(giro);
    if (!k) return null;
    return { n: k.daPresentare.n, nota: k.daPresentare.n && funzioneEsiste('euroBuono') ? euroBuono(k.daPresentare.importo) : '' };
  }
});

registraFonteToccaAMe({
  id: 'distinte-da-portare', ruoli: ['segreteria', 'contabile'], icona: '📤',
  titolo: 'Distinte RIBA preparate da portare in banca',
  vai: vaiRibaTAM,
  conta: async function(giro) {
    const k = await datiRibaTAM(giro);
    return k ? k.distinteDaInviare : null;
  }
});

registraFonteToccaAMe({
  id: 'esiti-riba', ruoli: ['segreteria', 'contabile'], icona: '📥',
  titolo: 'Esiti RIBA da registrare',
  vai: vaiRibaTAM,
  conta: async function(giro) {
    const k = await datiRibaTAM(giro);
    if (!k) return null;
    return { n: k.esiti, nota: k.esitiScaduti ? k.esitiScaduti + ' già scaduti' : '', livello: k.esitiScaduti ? 'urgente' : '' };
  }
});

registraFonteToccaAMe({
  id: 'insoluti-da-sollecitare', ruoli: ['segreteria'], icona: '💔',
  titolo: 'Insoluti da sollecitare', livello: 'urgente',
  vai: function() { if (funzioneEsiste('vaiASollecitiFatture')) vaiASollecitiFatture('insolute'); },
  conta: async function(giro) {
    const k = await datiRibaTAM(giro);
    if (!k) return null;
    return { n: k.insolute.n, nota: k.insolute.n && funzioneEsiste('euroBuono') ? euroBuono(k.insolute.importo) : '' };
  }
});

registraFonteToccaAMe({
  id: 'scadute-non-sollecitate', ruoli: ['segreteria'], icona: '⏰',
  titolo: 'Rate scadute non ancora sollecitate',
  vai: function() { if (funzioneEsiste('vaiASollecitiFatture')) vaiASollecitiFatture('scadute'); },
  conta: async function(giro) {
    const k = await datiRibaTAM(giro);
    if (!k) return null;
    return { n: k.scadute.n, nota: k.scadute.n && funzioneEsiste('euroBuono') ? euroBuono(k.scadute.importo) : '' };
  }
});

// Contabile: rate scadute da incassare (js/44, sql/46), senza solleciti
registraFonteToccaAMe({
  id: 'rate-scadute', ruoli: ['contabile'], icona: '⏰',
  titolo: 'Rate scadute da incassare',
  vai: { box: 'dash-incassi' },
  conta: async function() {
    if (!funzioneEsiste('verificaFattureEmissione') || !funzioneEsiste('datiKpiIncassi') || !(await verificaFattureEmissione())) return null;
    const k = await datiKpiIncassi();
    if (!k) return null;
    return { n: k.nScadute, nota: k.nScadute && funzioneEsiste('euroBuono') ? euroBuono(k.scaduto) : '' };
  }
});

// Rappresentante: insoluti dei suoi clienti (come caricaInsolutiRappresentante)
registraFonteToccaAMe({
  id: 'insoluti-rappresentante', ruoli: ['rappresentante'], icona: '💔',
  titolo: 'Insoluti dei tuoi clienti',
  vai: { box: 'rap-insoluti-box' },
  conta: async function() {
    if (!funzioneEsiste('verificaFattureRiba') || !(await verificaFattureRiba())) return null;
    const { data, error } = await db.from('fatture_scadenze')
      .select('id, importo, importo_pagato, fatture!inner(stato, eliminato_il, clienti!inner(rappresentante_id))')
      .in('stato', ['insoluta', 'sollecitata']).eq('fatture.stato', 'emessa').is('fatture.eliminato_il', null)
      .eq('fatture.clienti.rappresentante_id', ME.id).limit(2000);
    if (error) { console.warn('Cosa tocca a me (insoluti):', error.message); return null; }
    return (data || []).filter(function(s) { return funzioneEsiste('residuoRata') ? residuoRata(s) > 0 : true; }).length;
  }
});

// Titolare: insoluti e fatturato del mese (js/45, sql/47)
function datiFatturatoTAM(giro) {
  return giro.memo('fatturato', async function() {
    if (!funzioneEsiste('verificaFattureRiba') || !funzioneEsiste('datiKpiFatturato') || !(await verificaFattureRiba())) return null;
    return datiKpiFatturato();
  });
}

registraFonteToccaAMe({
  id: 'insoluti-titolare', ruoli: ['titolare'], icona: '💔',
  titolo: 'Rate insolute', livello: 'urgente',
  vai: function() { if (funzioneEsiste('vaiASollecitiFatture')) vaiASollecitiFatture('insolute'); },
  conta: async function(giro) {
    const k = await datiFatturatoTAM(giro);
    if (!k) return null;
    return {
      n: k.nInsoluti,
      nota: k.nInsoluti ? (funzioneEsiste('euroBuono') ? euroBuono(k.insoluti) + ', ' : '') + k.clientiInsoluti + (k.clientiInsoluti === 1 ? ' cliente' : ' clienti') : ''
    };
  }
});

// ── Documenti di team e subappalti (js/30, sql/32) ──────────────────
registraFonteToccaAMe({
  id: 'documenti-scadenza', ruoli: ['segreteria', 'capo_tecnico', 'titolare'], icona: '🪪',
  titolo: 'Documenti di team e subappalti scaduti o in scadenza',
  vai: { box: function() { return ROLE === 'segreteria' ? 'seg-documenti-scadenza' : (ROLE === 'capo_tecnico' ? 'ct-documenti-scadenza' : ''); }, pagina: 'team-subappalti' },
  conta: async function() {
    if (!funzioneEsiste('verificaTeamSubappaltiDisponibili') || !funzioneEsiste('documentiDaSegnalareTS') || !(await verificaTeamSubappaltiDisponibili())) return null;
    const limite = giorniDopoTAM(oggiTAM(), funzioneEsiste('giorniPreavvisoDocumenti') ? giorniPreavvisoDocumenti() : 30);
    const [d, u, s] = await Promise.all([
      db.from('documenti_team_subappalti').select(COLONNE_DOCUMENTO_TS)
        .is('sostituito_da', null).not('data_scadenza', 'is', null).lte('data_scadenza', limite),
      db.from('utenti').select('id, attivo'),
      db.from('subappaltatori').select('id, attivo')
    ]);
    const errore = d.error || u.error || s.error;
    if (errore) { console.warn('Cosa tocca a me (documenti):', errore.message); return null; }
    const righe = documentiDaSegnalareTS(d.data, u.data, s.data);
    const scaduti = righe.filter(function(r) { return statoDocumentoTeamSubappalti(r.documento).codice === 'scaduto'; }).length;
    return { n: righe.length, nota: scaduti ? scaduti + (scaduti === 1 ? ' già scaduto' : ' già scaduti') : '', livello: scaduti ? 'urgente' : '' };
  }
});

// ── Acquisti (commerciale) ──────────────────────────────────────────
registraFonteToccaAMe({
  id: 'progetti-da-preventivare', ruoli: ['commerciale'], priorita: 10, icona: '📐',
  titolo: 'Progetti da preventivare',
  vai: { pagina: 'progetti-da-preventivare' },
  conta: function() {
    return numeroTAM(contaTAM('progetti_tecnici').in('stato', ['inviato_a_commerciale', 'pronto_per_preventivo']), 'progetti da preventivare');
  }
});

registraFonteToccaAMe({
  id: 'offerte-fornitori', ruoli: ['commerciale'], priorita: 30, icona: '🏭',
  titolo: 'Richieste ai fornitori in attesa di risposta',
  vai: { pagina: 'preventivi' },
  conta: function() {
    return numeroTAM(contaTAM('preventivi_fornitori').eq('stato', 'richiesta_inviata'), 'offerte fornitori');
  }
});

registraFonteToccaAMe({
  id: 'consumabili-noli', ruoli: ['commerciale'], priorita: 20, icona: '🧰',
  titolo: 'Consumabili e noli da procurare (passo 9)', livello: 'urgente',
  vai: { box: 'com-richieste-integrazione', pagina: 'commesse' },
  conta: async function() {
    if (!funzioneEsiste('verificaRichiesteIntegrazioneDisponibili') || !(await verificaRichiesteIntegrazioneDisponibili())) return null;
    return numeroTAM(soloCommesseAperte(contaTAM('commesse_richieste_integrazione', 'id, commesse!inner(stato)').eq('stato', 'aperta')), 'consumabili e noli');
  }
});

registraFonteToccaAMe({
  id: 'ordini-ritardo', ruoli: ['commerciale'], priorita: 40, icona: '⚠️',
  titolo: 'Ordini ai fornitori in ritardo', livello: 'urgente',
  vai: { pagina: 'commesse' },
  conta: async function() {
    const r = await contaMaterialiTAM(null, giorniDopoTAM(oggiTAM(), -1), true);
    return r ? r.n : null;
  }
});

// ── Ingegnere ───────────────────────────────────────────────────────
registraFonteToccaAMe({
  id: 'verifiche-tecniche', ruoli: ['ingegnere'], icona: '🔧',
  titolo: 'Verifiche tecniche aperte',
  vai: { pagina: 'verifiche-tecniche' },
  conta: function() {
    return numeroTAM(contaTAM('progetti_tecnici').eq('stato', 'in_verifica_tecnica'), 'verifiche tecniche');
  }
});

registraFonteToccaAMe({
  id: 'certificati-nuovi', ruoli: ['ingegnere'], icona: '📜',
  titolo: 'Certificati nuovi da guardare',
  vai: { pagina: 'certificati-ingegnere' },
  conta: function() {
    return numeroTAM(contaTAM('preventivi_certificati').not('inviato_il', 'is', null).is('letto_ingegnere_il', null), 'certificati');
  }
});

registraFonteToccaAMe({
  id: 'scadenze-ingegnere', ruoli: ['ingegnere'], icona: '⏰',
  titolo: 'Scadenze nei prossimi 7 giorni',
  vai: { pagina: 'calendario-ingegnere' },
  conta: function() {
    const oggi = oggiTAM();
    return numeroTAM(contaTAM('calendario_personale').eq('utente_id', ME.id).eq('tipo', 'scadenza')
      .gte('data', oggi).lte('data', giorniDopoTAM(oggi, 7)), 'scadenze');
  }
});

// ── Tecnico: interventi di oggi e della settimana con l'ora esatta ──
function oraOrdinamentoTAM(o) {
  if (o.appuntamento_fissato && o.appuntamento_ora) return String(o.appuntamento_ora).slice(0, 5);
  const m = String(o.fascia_oraria || '').match(/(\d{1,2})[:.](\d{2})/);
  return m ? m[1].padStart(2, '0') + ':' + m[2] : '99:99';
}

function interventiTecnicoTAM(giro) {
  return giro.memo('tecnico-settimana', async function() {
    const oggi = oggiTAM();
    const colApp = funzioneEsiste('colonneAppuntamento') ? await colonneAppuntamento() : '';
    const { data, error } = await db.from('ordini_lavoro')
      .select('id, stato, data_pianificata, fascia_oraria, clienti(ragione_sociale)' + colApp)
      .is('eliminato_il', null).eq('tecnico_id', ME.id)
      .gte('data_pianificata', oggi).lte('data_pianificata', giorniDopoTAM(oggi, 6))
      .not('stato', 'in', '(annullato,completato)')
      .order('data_pianificata').limit(500);
    if (error) { console.warn('Cosa tocca a me (interventi):', error.message); return null; }
    return (data || []).sort(function(a, b) {
      return String(a.data_pianificata).localeCompare(String(b.data_pianificata)) || oraOrdinamentoTAM(a).localeCompare(oraOrdinamentoTAM(b));
    });
  });
}

function orarioTecnicoTAM(o) {
  const t = funzioneEsiste('tecOrario') ? tecOrario(o) : (o.fascia_oraria || '');
  return t && t !== '—' ? t : 'orario da definire';
}

registraFonteToccaAMe({
  id: 'tecnico-oggi', ruoli: ['tecnico'], icona: '📋',
  titolo: 'Interventi di oggi',
  vai: { box: 'tec-oggi-lista' },
  conta: async function(giro) {
    const elenco = await interventiTecnicoTAM(giro);
    if (!elenco) return null;
    const oggi = oggiTAM();
    const mie = elenco.filter(function(o) { return o.data_pianificata === oggi; });
    const primo = mie[0];
    return { n: mie.length, nota: primo ? 'primo: ' + orarioTecnicoTAM(primo) + ' · ' + ((primo.clienti && primo.clienti.ragione_sociale) || 'cliente') : '' };
  }
});

registraFonteToccaAMe({
  id: 'tecnico-settimana', ruoli: ['tecnico'], icona: '📅',
  titolo: 'Interventi nei prossimi 6 giorni',
  vai: { box: 'tec-week-lista', pagina: 'calendario-tec' },
  conta: async function(giro) {
    const elenco = await interventiTecnicoTAM(giro);
    if (!elenco) return null;
    const oggi = oggiTAM();
    const dopo = elenco.filter(function(o) { return o.data_pianificata !== oggi; });
    const primo = dopo[0];
    return {
      n: dopo.length,
      nota: primo ? 'prossimo: ' + new Date(primo.data_pianificata + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' }) + ', ' + orarioTecnicoTAM(primo) : ''
    };
  }
});

registraFonteToccaAMe({
  id: 'tecnico-arretrati', ruoli: ['tecnico'], icona: '⏰',
  titolo: 'Interventi dei giorni scorsi non ancora chiusi', livello: 'urgente',
  vai: { pagina: 'calendario-tec' },
  conta: function() {
    return numeroTAM(contaTAM('ordini_lavoro').is('eliminato_il', null).eq('tecnico_id', ME.id)
      .eq('stato', 'pianificato').lt('data_pianificata', oggiTAM()), 'interventi passati');
  }
});

registraFonteToccaAMe({
  id: 'tecnico-cantieri', ruoli: ['tecnico'], icona: '🏗️',
  titolo: 'Giorni di cantiere (oggi e prossimi 6)',
  vai: { box: 'tec-miei-cantieri' },
  conta: async function() {
    if (!funzioneEsiste('leggiMieiGiorniCantiere')) return null;
    const oggi = oggiTAM();
    const r = await leggiMieiGiorniCantiere(oggi, giorniDopoTAM(oggi, 6));
    if (!r || r.errore) return null;
    const diOggi = r.giorni.filter(function(g) { return g.data === oggi; }).length;
    return { n: r.giorni.length, nota: diOggi ? 'oggi sei in cantiere' : '' };
  }
});

registraFonteToccaAMe({
  id: 'tecnico-documenti', ruoli: ['tecnico'], icona: '🪪',
  titolo: 'I miei documenti scaduti o in scadenza',
  vai: { box: 'tec-miei-documenti' },
  conta: async function() {
    if (!funzioneEsiste('verificaTeamSubappaltiDisponibili') || !(await verificaTeamSubappaltiDisponibili())) return null;
    const limite = giorniDopoTAM(oggiTAM(), funzioneEsiste('giorniPreavvisoDocumenti') ? giorniPreavvisoDocumenti() : 30);
    return numeroTAM(contaTAM('documenti_team_subappalti').eq('utente_id', ME.id).is('sostituito_da', null)
      .not('data_scadenza', 'is', null).lte('data_scadenza', limite), 'i miei documenti');
  }
});

// ── Titolare: dati da sapere (in fondo al riquadro, non "da fare") ──
registraFonteToccaAMe({
  id: 'commesse-per-stato', ruoli: ['titolare'], icona: '📁', tipo: 'info',
  titolo: 'Commesse aperte',
  vai: { pagina: 'commesse' },
  conta: async function(giro) {
    const elenco = await commesseAperteTAM(giro);
    if (!elenco) return null;
    const perStato = {};
    elenco.forEach(function(c) { perStato[c.stato] = (perStato[c.stato] || 0) + 1; });
    const ordine = typeof ORDINE_STATI_COMMESSA !== 'undefined' ? ORDINE_STATI_COMMESSA : Object.keys(perStato);
    const nota = ordine.filter(function(s) { return perStato[s]; }).map(function(s) {
      return perStato[s] + ' ' + ((typeof ETICHETTE_STATO_COMMESSA !== 'undefined' && ETICHETTE_STATO_COMMESSA[s]) || s).toLowerCase();
    }).join(' · ');
    return { n: elenco.length, nota: nota };
  }
});

registraFonteToccaAMe({
  id: 'fatturato-mese', ruoli: ['titolare'], icona: '📈', tipo: 'info',
  titolo: 'Fatturato del mese',
  vai: { box: 'tit-fatturato', pagina: 'fatture' },
  conta: async function(giro) {
    const k = await datiFatturatoTAM(giro);
    if (!k || !funzioneEsiste('euroBuono')) return null;
    return { testo: euroBuono(k.mese) };
  }
});
