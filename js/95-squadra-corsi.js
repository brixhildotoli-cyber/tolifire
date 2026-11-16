// ── F19.9 — CORSI RICHIESTI E RUOLI MINIMI NELLA SQUADRA DEL GIORNO ──────
// Decisioni di Erika del 16/11: SOLO AVVISO (niente blocco né sblocchi del
// titolare, anche per i corsi di legge della D9) + ruoli minimi come avviso.
// NESSUN SQL nuovo: usa il catalogo dei corsi (sql/152, con parole e
// lavorazioni del preventivo di sql/156), le voci e le schede della commessa
// (scheda_cantiere_commessa di sql/34) e i documenti in vigore già letti dalla
// squadra (js/33).
//   - Corsi richiesti dalla commessa: i corsi attivi le cui parole (parola
//     intera) sono nelle voci o le cui lavorazioni sono tra le schede.
//   - Nella finestra della squadra, accanto a ogni persona: "manca il corso X
//     richiesto dalla commessa" (rosso se obbligatorio per legge, giallo
//     altrimenti), anche se scade nei giorni scelti. Per un subappaltatore
//     basta che una sua persona abbia il corso.
//   - Ruoli minimi tra i dipendenti scelti: almeno un preposto, un addetto
//     primo soccorso, un addetto antincendio (avviso giallo nel riepilogo).
// Si salva sempre, come oggi. Senza sql/152 o sql/156 nessun corso richiesto.

const SQUADRA_CORSI = { commessaId: null, richiesti: [] };
const RUOLI_MINIMI_SQUADRA = [
  { codice: 'preposto', nome: 'un preposto' },
  { codice: 'primo_soccorso', nome: 'un addetto primo soccorso' },
  { codice: 'formazione_antincendio', nome: 'un addetto antincendio' }
];

function regexParolaCorso(parola) {
  const p = String(parola || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^\\p{L}\\p{N}])' + p + '(?=$|[^\\p{L}\\p{N}])', 'iu');
}

async function calcolaCorsiRichiestiCommessa(commessa) {
  SQUADRA_CORSI.commessaId = commessa.id;
  SQUADRA_CORSI.richiesti = [];
  if (typeof caricaCatalogoCorsi !== 'function' || !(await caricaCatalogoCorsi())) return;
  const corsi = (CATALOGO_CORSI.righe || []).filter(function(c) {
    return c.attivo && ((c.parole_preventivo || []).length || (c.lavorazioni_preventivo || []).length);
  });
  if (!corsi.length) return;
  const { data, error } = await db.rpc('scheda_cantiere_commessa', { p_commessa_id: commessa.id });
  if (error || !data || SQUADRA_CORSI.commessaId !== commessa.id) return;
  const testi = (data.lavorazioni || []).map(function(v) { return String(v.descrizione || ''); });
  const famiglie = (data.schede_rilievo || []).map(function(s) { return s.famiglia; });
  SQUADRA_CORSI.richiesti = corsi.filter(function(c) {
    return (c.parole_preventivo || []).some(function(w) { const r = regexParolaCorso(w); return testi.some(function(t) { return r.test(t); }); }) ||
      (c.lavorazioni_preventivo || []).some(function(l) { return famiglie.includes(l); });
  }).map(function(c) { return { codice: c.codice, nome: c.nome, legge: !!c.obbligo_legge }; });
}

// Il documento del corso vale per tutti i giorni scelti?
function corsoValidoSquadra(documenti, chiave, id, codice, giorni) {
  const ultimo = giorni[giorni.length - 1];
  return (documenti || []).some(function(d) {
    return d[chiave] === id && d.tipo === codice && (!d.data_scadenza || d.data_scadenza >= ultimo);
  });
}

if (typeof avvisiDocumentiSquadra === 'function') {
  const avvisiDocumentiSquadraSenzaCorsi = avvisiDocumentiSquadra;
  // eslint-disable-next-line no-global-assign
  avvisiDocumentiSquadra = function(tipo, id, giorni, documenti, commessa) {
    const avvisi = avvisiDocumentiSquadraSenzaCorsi.apply(this, arguments);
    try {
      if (!giorni.length || !documenti || !commessa || SQUADRA_CORSI.commessaId !== commessa.id) return avvisi;
      const chiave = tipo === 'utente' ? 'utente_id' : 'subappaltatore_id';
      SQUADRA_CORSI.richiesti.forEach(function(c) {
        if (corsoValidoSquadra(documenti, chiave, id, c.codice, giorni)) return;
        avvisi.push({ grave: c.legge, corso: c.codice, testo: 'manca ' + c.nome + ' richiesto dalla commessa' + (c.legge ? ' (per legge)' : '') });
      });
    } catch (e) { console.warn('Corsi della squadra:', e); }
    return avvisi;
  };
}

if (typeof caricaSquadraCantiere === 'function') {
  const caricaSquadraCantiereSenzaCorsi = caricaSquadraCantiere;
  // eslint-disable-next-line no-global-assign
  caricaSquadraCantiere = async function(commessa) {
    try { if (commessa) await calcolaCorsiRichiestiCommessa(commessa); } catch (e) { SQUADRA_CORSI.richiesti = []; }
    return caricaSquadraCantiereSenzaCorsi.apply(this, arguments);
  };
}

// Riepilogo della finestra: corsi richiesti e ruoli minimi
if (typeof aggiornaRiepilogoAvvisiSquadra === 'function') {
  const aggiornaRiepilogoSenzaCorsi = aggiornaRiepilogoAvvisiSquadra;
  // eslint-disable-next-line no-global-assign
  aggiornaRiepilogoAvvisiSquadra = function() {
    const esito = aggiornaRiepilogoSenzaCorsi.apply(this, arguments);
    try {
      const s = squadraAperta;
      const riepilogo = ge('sqg-avvisi');
      if (!s || !squadraModulo || !riepilogo || !s.documenti) return esito;
      const giorni = squadraModulo.giorni || giorniTraDateSquadra(v('sqg-dal'), v('sqg-al'), ge('sqg-salta-weekend').checked);
      if (!giorni.length) return esito;
      const parti = [];
      if (SQUADRA_CORSI.commessaId === s.commessa.id && SQUADRA_CORSI.richiesti.length) {
        parti.push('<div class="al2 i" style="margin:0 0 8px" data-corsi-richiesti>🎓 Corsi richiesti da questa commessa: <b>' +
          esc(SQUADRA_CORSI.richiesti.map(function(c) { return c.nome + (c.legge ? ' ⚖️' : ''); }).join(', ')) + '</b>.</div>');
      }
      const scelti = sceltiSquadra();
      if (scelti.utenti.length) {
        const mancano = RUOLI_MINIMI_SQUADRA.filter(function(r) {
          return !scelti.utenti.some(function(id) { return corsoValidoSquadra(s.documenti, 'utente_id', id, r.codice, giorni); });
        });
        if (mancano.length) parti.push('<div class="al2 w" style="margin:0 0 8px" data-ruoli-minimi>👥 Nella squadra manca ' +
          esc(mancano.map(function(r) { return r.nome; }).join(', ')) + ' (con il corso valido). Puoi salvare lo stesso.</div>');
      }
      if (parti.length) riepilogo.insertAdjacentHTML('beforeend', parti.join(''));
    } catch (e) { console.warn('Corsi della squadra:', e); }
    return esito;
  };
}
