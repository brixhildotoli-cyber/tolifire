// Dopo gli altri script dei presidi, prima di 19-init.js.
const renderPCPrimaEliminaTutto = renderPC;
let eliminazioneSottosezione = false;

renderPC = function(data) {
  renderPCPrimaEliminaTutto(data);
  if (!['titolare','capo_tecnico'].includes(ROLE)) return;
  const perId = new Map(data.map(p => [String(p.id),p]));
  document.querySelectorAll('#pcards details[data-cartella]').forEach(cartella => {
    const livello = cartella.dataset.cartella.split('|')[0];
       if (!['tipo','ubicazione'].includes(livello)) return;
    const summary = [...cartella.children].find(el => el.tagName === 'SUMMARY');
    if (!summary) return;
    const nome = summary.textContent.replace(/\s+/g,' ').trim();
    const ids = new Set();
    cartella.querySelectorAll('button[onclick]').forEach(el => {
      const match = (el.getAttribute('onclick') || '').match(/^\s*apriSchedaPresidio\('([^']+)'\)\s*;?\s*$/);
      if (match && perId.has(match[1])) ids.add(match[1]);
    });
    if (!ids.size) return;
    const presidi = [...ids].map(id => perId.get(id));
    const btn = document.createElement('button');
    btn.type = 'button';btn.className = 'btn sm';btn.style.color = 'var(--r)';
    btn.textContent = `🗑 Elimina tutto (${presidi.length})`;
    btn.addEventListener('click',e => {
      e.preventDefault();e.stopPropagation();
      eliminaPresidiSottosezione(btn,presidi,nome);
    });
      btn.style.display = cartella.open ? 'inline-flex' : 'none';

    cartella.addEventListener('toggle', () => {
      btn.style.display = cartella.open ? 'inline-flex' : 'none';
    });

    summary.appendChild(btn);
  });
};

async function eliminaPresidiSottosezione(btn,presidi,nome) {
  if (!['titolare','capo_tecnico'].includes(ROLE)) {toast('Non hai i permessi.','err');return;}
  if (eliminazioneSottosezione) return;
  const ids = [...new Set(presidi.map(p => String(p.id)))];
  if (!ids.length) return;
  const elenco = presidi.slice(0,15).map(p =>
    `${p.clienti?.ragione_sociale || 'Cliente'} · ${p.sede_label || p.sede_id || 'Sede non specificata'} · ${p.tipo} · matricola ${p.matricola || '—'} · progressivo ${p.numero_progressivo || '—'}`
  ).join('\n');
  const resto = presidi.length > 15 ? `\n… e altri ${presidi.length-15}.` : '';
  if (!confirm(`Eliminare i ${ids.length} presidi visualizzati nella sottosezione “${nome}”?\n\n${elenco}${resto}\n\nVerranno rimossi dall’elenco tramite eliminazione recuperabile. Lo storico non viene cancellato. Con filtri attivi vengono eliminati solo i presidi mostrati.`)) return;
  eliminazioneSottosezione = true;btn.disabled = true;
  const aperte = [...document.querySelectorAll('#pcards details[open][data-cartella]')].map(el => el.dataset.cartella);
  let eliminati = 0;let errore = null;
  try {
    for (let i=0;i<ids.length;i+=100) {
      const {data,error} = await softDel('impianti').in('id',ids.slice(i,i+100)).is('eliminato_il',null).select('id');
      if (error) {errore=error.message;break;}
      eliminati += data?.length || 0;
    }
    await loadPresidi();
    document.querySelectorAll('#pcards details[data-cartella]').forEach(el => {
      if (aperte.includes(el.dataset.cartella)) el.open=true;
    });
    if (errore) toast(`Eliminati ${eliminati} di ${ids.length}. Errore: ${errore}`,'err');
    else if (eliminati !== ids.length) toast(`Eliminati ${eliminati} di ${ids.length}: alcuni erano già eliminati o non modificabili.`,'err');
    else toast(`Eliminati ${eliminati} presidi dalla sottosezione.`);
  } catch(e) {toast(`Eliminati ${eliminati} di ${ids.length}. Errore: ${e.message}`,'err');}
  finally {eliminazioneSottosezione=false;if(btn.isConnected)btn.disabled=false;}
}
