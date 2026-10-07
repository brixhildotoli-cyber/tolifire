// Estensione caricata dopo 18-preventivi.js e prima di 19-init.js.
const storicoPresidi = { impianto: null, schede: [], utenti: [], anagrafica: null, richiesta: 0 };
const mesiSchede = {1:'Gennaio',2:'Febbraio',7:'Luglio',8:'Agosto'};
function gestisceStoricoPresidi() { return ['titolare','capo_tecnico'].includes(ROLE); }
function nomeCicloScheda(ciclo) {
  return {gennaio_luglio:'Gennaio–Luglio',febbraio_agosto:'Febbraio–Agosto'}[ciclo] || 'Gruppo non assegnato';
}
function periodoScheda(s) {
  return `${nomeCicloScheda(s.ciclo)} · ${Number(s.mese) < 7 ? '1°' : '2°'} semestre ${s.anno}`;
}
function periodoSuccessivo(s) {
  return { ciclo: s.ciclo, anno: Number(s.anno) + (Number(s.mese) >= 7 ? 1 : 0),
           mese: Number(s.mese) < 7 ? Number(s.mese) + 6 : Number(s.mese) - 6 };
}
function listaControlliScheda(testo) {
  return String(testo || '').split('\n').map(x => x.trim()).filter(Boolean);
}

const apriSchedaPresidioPrecedente = apriSchedaPresidio;
apriSchedaPresidio = async function(id) {
  const richiesta = ++storicoPresidi.richiesta;
  await apriSchedaPresidioPrecedente(id);
  if (richiesta !== storicoPresidi.richiesta) return;
  if (!gestisceStoricoPresidi() && ROLE !== 'tecnico') return;
  const contenuto = ge('msp-contenuto');
  contenuto.insertAdjacentHTML('beforeend', '<div id="storico-presidio" style="margin-top:24px"></div>');
  await caricaStoricoPresidio(id);
};

async function caricaStoricoPresidio(id) {
  const richiesta = ++storicoPresidi.richiesta;
  const box = ge('storico-presidio');
  if (!box) return;
  box.textContent = 'Caricamento schede semestrali...';
  const [{data, error}, utenti, anagrafica] = await Promise.all([
    db.from('schede_presidi').select('*').eq('impianto_id',id)
      .order('anno',{ascending:false}).order('mese',{ascending:false}),
    gestisceStoricoPresidi()
      ? db.from('utenti').select('id,nome,cognome').in('ruolo',['tecnico','capo_tecnico']).eq('attivo',true)
      : Promise.resolve({data:[]}),
    db.from('impianti').select('*').eq('id',id).is('eliminato_il',null).single()
  ]);
  if (richiesta !== storicoPresidi.richiesta || ge('storico-presidio') !== box) return;
  if (error) { box.textContent = 'Errore storico: ' + error.message; return; }
  storicoPresidi.anagrafica = anagrafica.data || null;
  storicoPresidi.impianto = id;
  storicoPresidi.schede = data || [];
  storicoPresidi.utenti = utenti.data || [];
  mostraStoricoPresidio();
}

function mostraStoricoPresidio() {
  const box = ge('storico-presidio');
  if (!box) return;
  box.innerHTML = '<h3>Schede semestrali</h3><p>Il gruppo resta fisso. La data effettiva della verifica è indipendente dal semestre di riferimento.</p>' +
    (gestisceStoricoPresidi() ? '<button class="btn sm" onclick="registraSchedaGiaCaricata()">Registra nello storico la scheda già caricata</button>' : '') +
    (storicoPresidi.schede.length ? '' : '<p>Nessuna scheda storica. Importa il CSV scegliendo esplicitamente il periodo.</p>') +
    storicoPresidi.schede.map((s,i) => {
      const d = s.dati || {};
      const tecnico = storicoPresidi.utenti.find(u => u.id === s.tecnico_id);
      return `<div class="card" style="margin-top:12px">
        <b>${esc(periodoScheda(s))}</b>
        <div>Stato: ${esc(d.stato || '—')} · Verifica: ${esc(d.data_ultimo_controllo || '—')}</div>
        <div style="white-space:pre-wrap">${esc(d.note || '')}</div>
        ${gestisceStoricoPresidi() ? `<div>Operatore: ${esc(tecnico ? `${tecnico.nome || ''} ${tecnico.cognome || ''}` : 'Non assegnato')}</div>` : ''}
        <button class="btn sm" onclick="apriEditorSchedaPresidio(${i},false)">Apri / modifica ${esc(periodoScheda(s))}</button>
        <button class="btn sm p" onclick="apriEditorSchedaPresidio(${i},true)">Porta a ${esc(periodoScheda(periodoSuccessivo(s)))}</button>
      </div>`;
    }).join('');
}

function apriEditorSchedaPresidio(indice, riporta) {
  const origine = storicoPresidi.schede[indice];
  if (!origine) return;
  const target = riporta ? periodoSuccessivo(origine) : origine;
  const esistente = riporta && storicoPresidi.schede.find(s => Number(s.anno) === target.anno && Number(s.mese) === target.mese);
  if (esistente) {
    toast('Questo periodo esiste già: apro la scheda salvata.');
    return apriEditorSchedaPresidio(storicoPresidi.schede.indexOf(esistente),false);
  }
  const d = origine.dati || {};
  const textarea = (id,label,val) => `<div class="f"><label>${label}</label><textarea id="${id}">${esc(val || '')}</textarea></div>`;
  const righe = a => Array.isArray(a) ? a.join('\n') : '';
  ge('storico-presidio').innerHTML = `<div class="card">
    <h3>${riporta ? 'Nuova scheda' : 'Modifica scheda'}: ${esc(periodoScheda(target))}</h3>
    <p>${riporta ? 'La scheda precedente resta intatta. Conferma i controlli e indica la data della nuova verifica.' : 'Stai modificando questo periodo, non creando il successivo.'}</p>
    <div class="f"><label>Data della verifica</label><input id="sp-data" type="date" value="${esc(riporta ? '' : d.data_ultimo_controllo || '')}"></div>
    <div class="f"><label>Prossima verifica</label><input id="sp-prossima" type="date" value="${esc(riporta ? '' : d.data_prossimo_controllo || '')}"></div>
    <div class="f"><label>Stato</label><select id="sp-stato">${['ok','anomalia','scaduto','fuori_servizio'].map(st => `<option value="${st}" ${st === d.stato ? 'selected' : ''}>${st}</option>`).join('')}</select></div>
    ${textarea('sp-esito','Esito della verifica',d.esito_verifica)}
    ${textarea('sp-si','Controlli SI — una voce per riga',righe(d.voci_x_si))}
    ${textarea('sp-no','Controlli NO — una voce per riga',righe(d.voci_x_no))}
    ${textarea('sp-vuote','Controlli senza esito — una voce per riga',righe(d.voci_x_vuote))}
    ${textarea('sp-note','Note / anomalie',d.note)}
    ${gestisceStoricoPresidi() ? `<div class="f"><label>Operatore che può vedere e modificare questa scheda</label><select id="sp-tecnico"><option value="">Non assegnato</option>${storicoPresidi.utenti.map(u => `<option value="${esc(u.id)}" ${u.id === origine.tecnico_id ? 'selected' : ''}>${esc(`${u.nome || ''} ${u.cognome || ''}`)}</option>`).join('')}</select></div>` : ''}
    ${riporta ? '<div class="f"><label><input id="sp-conferma" type="checkbox"> Ho verificato i controlli riportati dalla scheda precedente.</label></div>' : ''}
    <button class="btn" onclick="mostraStoricoPresidio()">Annulla</button>
    <button id="sp-salva" class="btn p" onclick="salvaSchedaPresidio(${indice},${riporta})">Salva ${esc(periodoScheda(target))}</button>
  </div>`;
}

async function salvaSchedaPresidio(indice, riporta) {
  const origine = storicoPresidi.schede[indice];
  if (!origine) return;
  const target = riporta ? periodoSuccessivo(origine) : origine;
  const impianto = storicoPresidi.impianto;
  const data = v('sp-data');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    toast('Indica la data effettiva della verifica.','err'); return;
  }
  if (riporta && !ge('sp-conferma')?.checked) { toast('Conferma i controlli prima di salvare.','err'); return; }
  const bottone = ge('sp-salva');
  if (!bottone || bottone.disabled) return;
  const tecnico = gestisceStoricoPresidi() ? v('sp-tecnico') || null : origine.tecnico_id;
  // Durante il riporto il responsabile si eredita: si può cambiarlo nella scheda già salvata.
  if (riporta && tecnico !== origine.tecnico_id) {
    toast('Salva il riporto con lo stesso operatore; potrai cambiarlo riaprendo la nuova scheda.','err'); return;
  }
  const dati = {...origine.dati, data_ultimo_controllo:data,
    data_prossimo_controllo:v('sp-prossima') || null, stato:v('sp-stato'),
    esito_verifica:v('sp-esito').trim() || null, note:v('sp-note').trim() || null,
    voci_x_si:listaControlliScheda(v('sp-si')), voci_x_no:listaControlliScheda(v('sp-no')),
    voci_x_vuote:listaControlliScheda(v('sp-vuote')),
    anno_manutenzione:Number(target.anno), ciclo_manutenzione:origine.ciclo};
  if (riporta) { dati.fonte_pdf = null; dati.pagina_pdf = null; }
  bottone.disabled = true;
  try {
    if (riporta) {
      const {error} = await db.rpc('riporta_scheda_presidio',{p_origine:origine.id,p_dati:dati});
      if (error) throw error;
      toast('Periodo pronto. Se esisteva già, i dati salvati sono stati conservati.');
    } else {
      const {data:salvate,error} = await db.from('schede_presidi').update({dati,tecnico_id:tecnico})
        .eq('id',origine.id).eq('aggiornato_il',origine.aggiornato_il).select('id');
      if (error) throw error;
      if (!salvate?.length) throw new Error('Scheda modificata da un altro utente: riaprila prima di salvare.');
      toast('Scheda salvata.');
    }
    if (storicoPresidi.impianto === impianto) await caricaStoricoPresidio(impianto);
  } catch (e) { toast('Errore: ' + e.message,'err'); }
  finally { if (bottone.isConnected) bottone.disabled = false; }
}

// Sostituisce la conferma CSV: gli impianti esistenti NON vengono aggiornati.
confermaImportPresidi = async function() {
  if (!gestisceStoricoPresidi()) { toast('Importazione riservata a titolare e capo tecnico.','err'); return; }
  const valide = righeImportPresidi.filter(r => r.valido);
  if (!valide.length) { toast('Nessuna riga valida.','err'); return; }
  const ciclo = valide[0].payload.ciclo_manutenzione;
  if (!['gennaio_luglio','febbraio_agosto'].includes(ciclo)) { toast('Ciclo non valido.','err'); return; }
  const mesi = ciclo === 'gennaio_luglio' ? [1,7] : [2,8];
  const suggerito = '1';
  const risposta = prompt(`Gruppo ${nomeCicloScheda(ciclo)}. Semestre di riferimento delle schede: 1 oppure 2. La data della verifica resta quella del CSV.`,suggerito);
  if (risposta === null) return;
  const semestre = Number(risposta);
  if (![1,2].includes(semestre)) { toast('Scegli semestre 1 oppure 2.','err'); return; }
  const mese = mesi[semestre - 1];
  if (!confirm(`Importare ${valide.length} schede nel ${semestre}° semestre, gruppo ${nomeCicloScheda(ciclo)}? I periodi già presenti verranno saltati, senza sovrascriverli.`)) return;
  const bottone = ge('import-presidi-conferma');
  if (bottone.disabled) return;
  bottone.disabled = true;
  let inserite = 0, saltate = 0;
  const errori = [];
  const creati = new Map();
  try {
    for (const r of valide) {
      try {
        let id = r.presidioEsistenteId;
        const chiave = JSON.stringify([r.payload.cliente_id,r.payload.tipo,
          pulisciImportPresidi(r.payload.matricola),pulisciImportPresidi(r.payload.ubicazione)]);
        if (!id) id = creati.get(chiave);
        if (!id) {
          const {data,error} = await db.from('impianti').insert(r.payload).select('id').single();
          if (error) throw error;
          id = data.id; creati.set(chiave,id);
          // Consente di riprovare questa anteprima senza ricreare il presidio.
          r.presidioEsistenteId = id;
        }
        const {error} = await db.from('schede_presidi').insert({
          impianto_id:id, anno:Number(r.payload.anno_manutenzione), mese,
          ciclo:r.payload.ciclo_manutenzione, dati:r.payload
        });
        if (error?.code === '23505') { saltate++; continue; }
        if (error) throw error;
        inserite++;
      } catch (e) { errori.push(`Riga ${r.numeroRiga}: ${e.message}`); }
    }
    ge('import-presidi-riepilogo').textContent = `Schede inserite: ${inserite}. Periodi già presenti: ${saltate}. ${errori.join(' · ')}`;
    toast(errori.length ? 'Importazione con errori: leggi il riepilogo.' : 'Importazione completata.',errori.length ? 'err' : 'ok');
    await loadPresidi();
  } finally { bottone.disabled = false; }
};

// L'anteprima descrive il nuovo comportamento: non viene più aggiornato lo storico.
const preparaImportPresidiPrecedente = preparaImportPresidi;
preparaImportPresidi = async function(testo) {
  await preparaImportPresidiPrecedente(testo);
  righeImportPresidi.forEach(r => {
    if (!r.valido) return;
    r.azione = 'Scheda semestre';
    r.messaggio = r.presidioEsistenteId
      ? 'Presidio esistente: aggiungo la scheda, senza sovrascrivere periodi già presenti'
      : 'Nuovo presidio e relativa scheda semestrale';
  });
  renderAnteprimaImportPresidi();
};


async function registraSchedaGiaCaricata() {
  if (!gestisceStoricoPresidi() || !storicoPresidi.anagrafica) return;
  const p = storicoPresidi.anagrafica;
  const gruppo = ['gennaio_luglio','febbraio_agosto'].includes(p.ciclo_manutenzione)
    ? p.ciclo_manutenzione : null;
  if (!gruppo) { toast('La scheda non ha un gruppo assegnato: usa l’importazione CSV scegliendo il gruppo.','err'); return; }
  const annoTesto = prompt('Anno di riferimento della scheda già caricata (non dedotto dalla data della visita):',String(p.anno_manutenzione || new Date().getFullYear()));
  if (annoTesto === null) return;
  const anno = Number(annoTesto);
  if (!Number.isInteger(anno) || anno < 2020 || anno > 2100) { toast('Anno non valido.','err'); return; }
  const risposta = prompt(`Gruppo ${nomeCicloScheda(gruppo)}: semestre di riferimento 1 oppure 2.`, '1');
  if (risposta === null) return;
  const semestre = Number(risposta);
  if (![1,2].includes(semestre)) { toast('Semestre non valido.','err'); return; }
  const mese = (gruppo === 'gennaio_luglio' ? [1,7] : [2,8])[semestre-1];
  if (!confirm(`Conservare i dati già caricati nello storico ${anno}, ${semestre}° semestre, gruppo ${nomeCicloScheda(gruppo)}? L’anagrafica resta intatta.`)) return;
  const {error} = await db.from('schede_presidi').insert({
    impianto_id:p.id, anno, mese, ciclo:gruppo,
    dati:{...p,anno_manutenzione:anno,ciclo_manutenzione:gruppo}
  });
  if (error && error.code !== '23505') { toast('Errore: '+error.message,'err'); return; }
  toast(error ? 'Periodo già presente: i dati salvati sono conservati.' : 'Scheda registrata nello storico.');
  if (storicoPresidi.impianto === p.id) await caricaStoricoPresidio(p.id);
}
