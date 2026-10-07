// ── PRESIDI ───────────────────────────────────────────────────
async function loadPresidi() {
  const { data, error } = await db
    .from('impianti')
    .select('*, clienti(ragione_sociale)')
    .is('eliminato_il', null)
    .order('tipo')
    .order('creato_il', { ascending: false });

  if (error) {
    console.error('Errore caricamento presidi:', error.message);
    toast('Errore caricamento presidi: ' + error.message, 'err');
    return;
  }

  const presidi = data || [];

  const sediIds = [
    ...new Set(
      presidi
        .map(function(presidio) {
          return presidio.sede_id;
        })
        .filter(Boolean)
    )
  ];

  let sediPerId = {};

  if (sediIds.length) {
    const { data: sedi } = await db
      .from('sedi_cliente')
      .select('id,tipo,nome,via,civico,citta')
      .in('id', sediIds);

    (sedi || []).forEach(function(sede) {
      const indirizzo = [sede.via, sede.civico]
        .filter(Boolean)
        .join(' ');

      sediPerId[sede.id] = [
        sede.nome,
        indirizzo,
        sede.citta
      ].filter(Boolean).join(' · ') || sede.tipo || 'Sede';
    });
  }

  PA = presidi.map(function(presidio) {
    return {
      ...presidio,
      sede_label: presidio.sede_id
        ? (sediPerId[presidio.sede_id] || 'Sede non disponibile')
        : 'Sede principale / non specificata'
    };
  });

  PF = PA;

  renderPC(PA);
  renderPT(PA);
  renderPS(PA);

  const names = [
    ...new Set(
      PA.map(function(p) {
        return p.clienti?.ragione_sociale;
      }).filter(Boolean)
    )
  ].sort();

  const cur = v('pcli');

  ge('pcli').innerHTML =
    '<option value="">Tutti i clienti</option>' +
    names.map(function(nome) {
      return `<option value="${nome}"${nome === cur ? ' selected' : ''}>${nome}</option>`;
    }).join('');
}

function filterP(){
  const q=v('psearch').toLowerCase(),t=v('ptipo'),s=v('pstato'),c=v('pcli');
  PF=PA.filter(p=>(!q ||
  (p.matricola || '').toLowerCase().includes(q) ||
  (p.clienti?.ragione_sociale || '').toLowerCase().includes(q) ||
  (p.ubicazione || '').toLowerCase().includes(q) ||
  (p.sede_label || '').toLowerCase().includes(q)
)&&(!t||p.tipo===t)&&(!s||p.stato===s)&&(!c||(p.clienti?.ragione_sociale||'')===c));
  renderPC(PF);renderPT(PF);
}

function renderPC(data) {
  const w = ge('pcards');

  if (!data.length) {
    w.innerHTML = `
      <div style="grid-column:1/-1">
        <div class="empty">
          Nessun presidio.<br>
          <button
            class="btn p sm"
            style="margin-top:12px"
            onclick="resetPF();openM('m-presidio')"
          >
            + Aggiungi
          </button>
        </div>
      </div>
    `;
    return;
  }

  const scheda = function(p) {
    return `
      <div class="pc">
        <div style="position:absolute;top:12px;right:12px">
          ${si2(p.stato)}
        </div>

        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--m);margin-bottom:4px">
          ${tpl(p.tipo)}
        </div>

      <div style="font-size:14px;font-weight:600;margin-bottom:2px">
  ${esc(p.matricola || '—')}
</div>

<div style="font-size:11px;color:var(--m);margin-bottom:4px">
  Numero progressivo:
  <b style="color:var(--t)">
    ${esc(p.numero_progressivo || '—')}
  </b>
</div>

        <div style="font-size:12px;color:var(--m);margin-bottom:10px">
          ${esc(p.clienti?.ragione_sociale || '—')}
        </div>

        <div style="font-size:12px;display:flex;flex-direction:column;gap:4px">
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--m)">Ubicazione</span>
            <span>
              ${esc(p.ubicazione || '—')}
              ${esc(p.piano ? ' (' + p.piano + ')' : '')}
            </span>
          </div>

          ${p.tipo === 'estintore' ? `
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--m)">Agente</span>
              <span>${al2(p.modello) || '—'} ${p.marca || ''}</span>
            </div>
          ` : ''}

          ${p.tipo === 'porta_rei' ? `
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--m)">Classe</span>
              <span>${esc(p.modello || '—')}</span>
            </div>
          ` : ''}

          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--m)">Ultima verifica</span>
            <span>${fd(p.data_ultimo_controllo)}</span>
          </div>

          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--m)">Prossima verifica</span>
            <span class="${sc(p.data_prossimo_controllo)}">
              ${fd(p.data_prossimo_controllo)}
              (${dd2(p.data_prossimo_controllo)})
            </span>
          </div>
        </div>

        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button class="btn sm" onclick="apriSchedaPresidio('${p.id}')">
            Visualizza scheda
          </button>

          <button class="btn sm" onclick="editP('${p.id}')">
            Modifica
          </button>

          ${ROLE === 'titolare' || ROLE === 'capo_tecnico' ? `
            <button
              class="btn sm"
              style="color:var(--r)"
              onclick="eliminaPresidio('${p.id}')"
            >
              🗑️ Elimina
            </button>
          ` : ''}
        </div>
      </div>
    `;
  };

  const gruppiCliente = {};

  data.forEach(function(p) {
    const cliente = p.clienti?.ragione_sociale || 'Cliente non assegnato';
    const sede = p.sede_label || 'Sede principale / non specificata';

    if (!gruppiCliente[cliente]) {
      gruppiCliente[cliente] = {};
    }

    if (!gruppiCliente[cliente][sede]) {
      gruppiCliente[cliente][sede] = {};
    }

    if (!gruppiCliente[cliente][sede][p.tipo]) {
      gruppiCliente[cliente][sede][p.tipo] = [];
    }

    gruppiCliente[cliente][sede][p.tipo].push(p);
  });

  const filtroAttivo = data.length < PA.length;
  const clienti = Object.keys(gruppiCliente)
    .sort(function(a, b) {
      return a.localeCompare(b, 'it');
    });

  w.innerHTML = clienti.map(function(cliente) {
    const sedi = gruppiCliente[cliente];
    const tutti = Object.values(sedi).flatMap(function(tipi) {
      return Object.values(tipi).flat();
    });

    const anomalie = tutti.filter(function(p) {
      return p.stato !== 'ok';
    }).length;

    return `
      <details
       data-cartella="cliente|${encodeURIComponent(cliente)}"
        class="card"
        style="grid-column:1/-1;padding:0;overflow:hidden"
        ${clienti.length === 1 || filtroAttivo ? 'open' : ''}
      >
        <summary
          style="cursor:pointer;padding:15px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px"
        >
          <div>
            <div style="font-size:15px;font-weight:700">
              🗂️ ${esc(cliente)}
            </div>
            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${tutti.length} ${tutti.length === 1 ? 'presidio' : 'presidi'}
            </div>
          </div>

          ${anomalie ? `
            <span class="bx berr">
              ${anomalie} da verificare
            </span>
          ` : '<span class="bx bok">Tutto OK</span>'}
        </summary>

        <div style="padding:0 16px 16px">
          ${Object.keys(sedi).sort(function(a, b) {
            return a.localeCompare(b, 'it');
          }).map(function(sede) {
            const tipi = sedi[sede];

            return `
              <details
               data-cartella="sede|${encodeURIComponent(cliente)}|${encodeURIComponent(sede)}"
                style="margin-top:10px;border:1px solid var(--bl);border-radius:8px;padding:0 12px"
                ${Object.keys(sedi).length === 1 && filtroAttivo ? 'open' : ''}
              >
                <summary
                  style="cursor:pointer;padding:11px 0;font-size:13px;font-weight:700"
                >
                  📍 ${esc(sede)}
                </summary>

                <div style="padding:0 0 12px">
                  ${Object.keys(tipi).sort(function(a, b) {
                    return tpl(a).localeCompare(tpl(b), 'it');
                 }).map(function(tipo) {
  const presidi = tipi[tipo];

  // Dentro ogni tipologia raggruppa ulteriormente per ubicazione.
  const ubicazioni = {};

  presidi.forEach(function(p) {
    const ubicazione = String(
      p.ubicazione || 'Ubicazione non specificata'
    ).trim() || 'Ubicazione non specificata';

    if (!ubicazioni[ubicazione]) {
      ubicazioni[ubicazione] = [];
    }

    ubicazioni[ubicazione].push(p);
  });

  const daGestire = presidi.filter(function(p) {
    return p.stato !== 'ok';
  }).length;

  return `
    <details
      data-cartella="tipo|${encodeURIComponent(cliente)}|${encodeURIComponent(sede)}|${encodeURIComponent(tipo)}"
      style="margin-top:8px;background:var(--bg);border-radius:7px;padding:0 10px"
      ${filtroAttivo ? 'open' : ''}
    >
      <summary
        style="cursor:pointer;padding:10px 0;display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:700"
      >
        <span>${tpl(tipo)}</span>
        <span style="color:var(--m)">
          ${presidi.length} ·
          ${daGestire ? `${daGestire} attenzione` : 'OK'}
        </span>
      </summary>

      <div style="padding:0 0 10px">
        ${Object.keys(ubicazioni).sort(function(a, b) {
          return a.localeCompare(b, 'it');
        }).map(function(ubicazione) {
          const presidiUbicazione = ubicazioni[ubicazione].sort(function(a, b) {
            return String(a.matricola || '').localeCompare(
              String(b.matricola || ''),
              'it',
              { numeric: true }
            );
          });

          const anomalieUbicazione = presidiUbicazione.filter(function(p) {
            return p.stato !== 'ok';
          }).length;

          return `
            <details
              data-cartella="ubicazione|${encodeURIComponent(cliente)}|${encodeURIComponent(sede)}|${encodeURIComponent(tipo)}|${encodeURIComponent(ubicazione)}"
              style="margin-top:8px;border:1px solid var(--bl);border-radius:7px;padding:0 10px;background:#fff"
              ${filtroAttivo ? 'open' : ''}
            >
              <summary
                style="cursor:pointer;padding:9px 0;display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:700"
              >
                <span>📌 ${esc(ubicazione)}</span>
                <span style="color:var(--m)">
                  ${presidiUbicazione.length} ·
                  ${anomalieUbicazione ? `${anomalieUbicazione} attenzione` : 'OK'}
                </span>
              </summary>

              <div
                style="display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:12px;padding:6px 0 12px"
              >
                ${presidiUbicazione.map(scheda).join('')}
              </div>
            </details>
          `;
        }).join('')}
      </div>
    </details>
  `;
}).join('')}
                </div>
              </details>
            `;
          }).join('')}
        </div>
      </details>
    `;
  }).join('');
}

function renderPT(data){
  const tb=ge('ptbody');if(!data.length){tb.innerHTML='<tr><td colspan="9"><div class="empty">Nessun presidio</div></td></tr>';return;}
  tb.innerHTML=data.map(p=>`<tr><td>${tpl(p.tipo)}</td><td>${esc(p.clienti?.ragione_sociale||'—')}</td><td style="font-family:monospace;font-size:12px">${esc(p.matricola||'—')}</td><td>${esc(p.ubicazione||'—')}${esc(p.piano?' ('+p.piano+')':'')}</td><td>${fd(p.data_ultimo_controllo)}</td><td class="${sc(p.data_prossimo_controllo)}">${fd(p.data_prossimo_controllo)} (${dd2(p.data_prossimo_controllo)})</td><td>${p.periodicita_mesi?p.periodicita_mesi+' mesi':'—'}</td><td>${si2(p.stato)} ${p.stato}</td><td>${(ROLE==='titolare'||ROLE==='capo_tecnico'||ROLE==='segreteria')?`<button class="btn sm" onclick="editP('${p.id}')">✏️</button>`:''}${(ROLE==='titolare'||ROLE==='capo_tecnico')?`<button class="btn sm" style="color:var(--r)" onclick="eliminaPresidio('${p.id}')">🗑️</button>`:''}</td></tr>`).join('');
}

function renderPS(data){
  const in30=new Date(Date.now()+30*86400000),in90=new Date(Date.now()+90*86400000);
  const u=data.filter(p=>p.data_prossimo_controllo&&new Date(p.data_prossimo_controllo+'T00:00:00')<=in30);
  const pr=data.filter(p=>p.data_prossimo_controllo&&new Date(p.data_prossimo_controllo+'T00:00:00')>in30&&new Date(p.data_prossimo_controllo+'T00:00:00')<=in90);
  const rl=(items,el)=>{if(!items.length){ge(el).innerHTML='<div class="empty" style="padding:20px">Nessuno ✅</div>';return;}ge(el).innerHTML=items.map(p=>`<div style="padding:10px;background:var(--bg);border-radius:var(--rs);margin-bottom:6px"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-weight:500;font-size:13px">${esc(p.clienti?.ragione_sociale||'—')}</div><div style="font-size:12px;color:var(--m)">${tpl(p.tipo)} ${p.matricola?'— #'+esc(p.matricola):''}</div><div style="font-size:12px;color:var(--m)">${esc(p.ubicazione||'')}</div></div><div style="text-align:right"><div class="${sc(p.data_prossimo_controllo)}">${fd(p.data_prossimo_controllo)}</div><div style="font-size:11px;color:var(--m)">${dd2(p.data_prossimo_controllo)}</div>${p.periodicita_mesi?`<div style="font-size:10px;color:var(--m)">ogni ${p.periodicita_mesi} mesi</div>`:''}</div></div></div>`).join('');};
  rl(u,'su');rl(pr,'sp2');
}

function switchPF() {
  const tipo = v('mptp');

  const fe = ge('fe');
  const fp = ge('fp');
  const fm = ge('fm');

  if (fe) fe.style.display = 'none';
  if (fp) fp.style.display = 'none';
  if (fm) fm.style.display = 'none';

 if (tipo === 'porta_rei' || tipo === 'uscita_emergenza') {
    if (fp) fp.style.display = 'block';
    return;
  }

  if (tipo === 'manichetta') {
    if (fm) fm.style.display = 'block';
    return;
  }

  if (fe) fe.style.display = 'block';
}
function resetPF() {
  ge('mpt').textContent = 'Nuovo presidio';
  ge('mpeid').value = '';
  ge('mptp').value = 'estintore';

  [
    'me1', 'me2', 'me5', 'me6', 'me7', 'me14',
    'mp1', 'mp3', 'mp4', 'mp6', 'mp15',
    'mm1', 'mm3', 'mm4', 'mm5', 'mm10'
  ].forEach(function(id) {
    const el = ge(id);
    if (el) el.value = '';
  });

  [
    'me8', 'me9', 'me10', 'me11',
    'mp7', 'mp8', 'mp9',
    'mm6', 'mm7', 'mm8'
  ].forEach(function(id) {
    const el = ge(id);
    if (el) el.value = '';
  });

  if (ge('me3')) ge('me3').value = 'polvere_abc';
  if (ge('me4')) ge('me4').value = '6kg';
  if (ge('me13')) ge('me13').value = 'ok';

  if (ge('mp2')) ge('mp2').value = 'REI 60';
  if (ge('mp14')) ge('mp14').value = 'ok';

  if (ge('mm2')) ge('mm2').value = 'uni_45';
  if (ge('mm9')) ge('mm9').value = 'ok';

  switchPF();
}

async function apriSchedaPresidio(id) {
  openM('m-scheda-presidio');

  ge('msp-titolo').textContent = 'Scheda presidio';
  ge('msp-contenuto').innerHTML = '<div class="load">Caricamento...</div>';

  const { data: p, error } = await db
    .from('impianti')
    .select('*, clienti(ragione_sociale)')
    .eq('id', id)
    .is('eliminato_il', null)
    .single();

  if (error || !p) {
    ge('msp-contenuto').innerHTML =
      '<div class="empty">Impossibile caricare la scheda del presidio.</div>';
    return;
  }

  const campo = (etichetta, valore) => `
    <div style="padding:10px 0;border-bottom:1px solid var(--bl)">
      <div class="muted" style="font-size:12px">${esc(etichetta)}</div>
      <div style="font-weight:600;margin-top:3px">
        ${valore !== null && valore !== undefined && valore !== ''
          ? esc(String(valore))
          : '—'}
      </div>
    </div>
  `;

  const stato = {
    ok: '✅ OK',
    anomalia: '⚠️ Anomalia',
    fuori_servizio: '🔴 Fuori servizio',
    scaduto: '❌ Scaduto'
  }[p.stato] || p.stato || '—';


   const vociSi = Array.isArray(p.voci_x_si) ? p.voci_x_si : [];
const vociNo = Array.isArray(p.voci_x_no) ? p.voci_x_no : [];
const vociVuote = Array.isArray(p.voci_x_vuote)
  ? p.voci_x_vuote
  : [];

const rigaVuota = function(voce) {
  return `
    <div style="padding:8px 0;border-bottom:1px solid var(--bl);display:flex;gap:10px">
      <b style="color:var(--m);min-width:42px">☐</b>
      <span>${esc(voce)}</span>
    </div>
  `;
};

  const rigaControllo = function(voce, esito) {
    const positivo = esito === 'SI';

    return `
      <div style="padding:8px 0;border-bottom:1px solid var(--bl);display:flex;gap:10px">
        <b style="color:${positivo ? 'var(--g)' : 'var(--r)'};min-width:42px">
          ☒ ${esito}
        </b>
        <span>${esc(voce)}</span>
      </div>
    `;
  };

  ge('msp-titolo').textContent =
    `Scheda presidio · ${p.matricola || 'senza matricola'}`;

  ge('msp-contenuto').innerHTML = `
    <div class="card" style="margin:0">
      <div class="grid2">
        ${campo('Cliente', p.clienti?.ragione_sociale)}
        ${campo('Tipologia', tpl(p.tipo))}
        ${campo('Matricola', p.matricola)}
        ${campo('Numero progressivo', p.numero_progressivo)}
        ${campo('Stato', stato)}
        ${campo('Marca', p.marca)}
        ${campo('Modello / descrizione', p.modello)}
        ${campo('Ubicazione', p.ubicazione)}
        ${campo('Piano', p.piano)}
        ${campo('Locale / area', p.locale)}
        ${campo('Periodicità', p.periodicita_mesi ? `${p.periodicita_mesi} mesi` : '')}
        ${campo('Ultima verifica', p.data_ultimo_controllo ? fd(p.data_ultimo_controllo) : '')}
        ${campo('Prossima verifica', p.data_prossimo_controllo ? fd(p.data_prossimo_controllo) : '')}
        ${campo('Scadenza collaudo', p.data_scadenza_collaudo ? fd(p.data_scadenza_collaudo) : '')}
      </div>

          ${(vociSi.length || vociNo.length || vociVuote.length || p.esito_verifica) ? `
        <div style="margin-top:18px;border-top:1px solid var(--bl);padding-top:14px">
          <div style="font-weight:700;margin-bottom:8px">
            Controlli della verifica
          </div>

          ${p.esito_verifica ? `
            <div class="al2 i" style="margin-bottom:10px">
              <b>Esito:</b> ${esc(p.esito_verifica)}
            </div>
          ` : ''}

          ${vociSi.length ? `
            <div style="font-size:12px;color:var(--m);margin:10px 0 4px">
              Voci contrassegnate SI
            </div>
            ${vociSi.map(function(voce) {
              return rigaControllo(voce, 'SI');
            }).join('')}
          ` : ''}

          ${vociNo.length ? `
            <div style="font-size:12px;color:var(--m);margin:14px 0 4px">
              Voci contrassegnate NO
            </div>
            ${vociNo.map(function(voce) {
              return rigaControllo(voce, 'NO');
            }).join('')}
          ` : ''}

          ${vociVuote.length ? `
  <div style="font-size:12px;color:var(--m);margin:14px 0 4px">
    Voci senza esito indicato
  </div>

  ${vociVuote.map(function(voce) {
    return rigaVuota(voce);
  }).join('')}
` : ''}

          ${p.fonte_pdf ? `
            <div style="font-size:11px;color:var(--m);margin-top:12px">
              Fonte: ${esc(p.fonte_pdf)}
              ${p.pagina_pdf ? ` · pagina ${esc(String(p.pagina_pdf))}` : ''}
            </div>
          ` : ''}

<div
  style="
    margin-top:14px;
    padding:10px 12px;
    border-radius:8px;
    background:#f8fafc;
    border:1px solid var(--bl);
    font-size:12px;
    line-height:1.65
  "
>
  <b>Legenda</b><br>

  <span style="font-weight:700;color:#166534">☒ SI</span>
  = controllo verificato con esito positivo.<br>

  <span style="font-weight:700;color:var(--r)">☒ NO</span>
  = controllo non superato o anomalia da gestire.<br>

  <span style="font-weight:700;color:var(--m)">☐</span>
  = operazione presente nel modulo, ma senza una X:
  deve essere verificata o compilata.<br><br>
x
</div>
        </div>
      ` : ''}

      <div style="margin-top:16px">
        <div class="muted" style="font-size:12px">Note / anomalie</div>
        <div style="margin-top:5px;white-space:pre-wrap">
          ${p.note ? esc(p.note) : 'Nessuna nota registrata.'}
        </div>
      </div>
    </div>
  `;
}

function editP(id) {
  const p = PA.find(function(item) {
    return item.id === id;
  });

  if (!p) {
    toast('Presidio non trovato', 'err');
    return;
  }

  resetPF();

  ge('mpt').textContent = 'Modifica presidio';
  ge('mpeid').value = id;
  ge('mptp').value = p.tipo;
  ge('mpcl').value = p.cliente_id || '';

  if (p.cliente_id) {
    loadSediPresidio(p.cliente_id, p.sede_id);
  }

  switchPF();

  if (p.tipo === 'manichetta') {
    ge('mm1').value = p.matricola || '';
    ge('mm2').value = p.modello || 'uni_45';
    ge('mm3').value = p.ubicazione || '';
    ge('mm4').value = p.piano || '';
    ge('mm5').value = p.locale || '';
    ge('mm6').value = p.data_ultimo_controllo || '';
    ge('mm7').value = p.data_prossimo_controllo || '';
    ge('mm8').value = p.data_scadenza_collaudo || '';
    ge('mm9').value = p.stato || 'ok';
    ge('mm10').value = p.note || '';
  } else if (p.tipo === 'porta_rei') {
    ge('mp1').value = p.matricola || '';
    ge('mp2').value = p.modello || 'REI 60';
    ge('mp3').value = p.ubicazione || '';
    ge('mp4').value = p.piano || '';
    ge('mp6').value = p.marca || '';
    ge('mp7').value = p.data_installazione || '';
    ge('mp8').value = p.data_ultimo_controllo || '';
    ge('mp9').value = p.data_prossimo_controllo || '';
    ge('mp14').value = p.stato || 'ok';
    ge('mp15').value = p.note || '';
  } else {
    ge('me1').value = p.matricola || '';
    ge('me2').value = p.marca || '';
    ge('me3').value = p.modello || 'polvere_abc';
    ge('me4').value = p.marca || '6kg';
    ge('me5').value = p.ubicazione || '';
    ge('me6').value = p.piano || '';
    ge('me7').value = p.locale || '';
    ge('me8').value = p.data_installazione || '';
    ge('me9').value = p.data_ultimo_controllo || '';
    ge('me10').value = p.data_prossimo_controllo || '';
    ge('me11').value = p.data_scadenza_collaudo || '';
    ge('me13').value = p.stato || 'ok';
    ge('me14').value = p.note || '';
  }

  openM('m-presidio');
}

async function saveP() {
  const tipo = v('mptp');
  const cid = v('mpcl');

  if (!cid) {
    toast('Seleziona un cliente', 'err');
    return;
  }

  const eid = v('mpeid');
  let payload = {
    cliente_id: cid,
    tipo: tipo
  };

  if (tipo === 'manichetta') {
    const numero = v('mm1').trim();

    if (!numero) {
      toast('Inserisci il numero o ID della manichetta', 'err');
      return;
    }

    if (!v('mm3').trim()) {
      toast('Inserisci l’ubicazione della manichetta', 'err');
      return;
    }

    payload = {
      ...payload,
      matricola: numero,
      modello: v('mm2'),
      marca: null,
      ubicazione: v('mm3') || null,
      piano: v('mm4') || null,
      locale: v('mm5') || null,
      data_ultimo_controllo: v('mm6') || null,
      data_prossimo_controllo: v('mm7') || null,
      data_scadenza_collaudo: v('mm8') || null,
      stato: v('mm9'),
      note: v('mm10') || null,
      sede_id: v('mpsede') || null
    };
  } else if (tipo === 'porta_rei' || tipo === 'uscita_emergenza') {
    const mat = v('mp1').trim();

    if (!mat) {
      toast('Inserisci l’ID porta', 'err');
      return;
    }

    payload = {
      ...payload,
      matricola: mat,
      modello: v('mp2'),
      marca: v('mp6') || null,
      ubicazione: v('mp3') || null,
      piano: v('mp4') || null,
      data_installazione: v('mp7') || null,
      data_ultimo_controllo: v('mp8') || null,
      data_prossimo_controllo: v('mp9') || null,
      stato: v('mp14'),
      note: v('mp15') || null,
      sede_id: v('mpsede') || null
    };
  } else {
    const mat = v('me1').trim();

    if (!mat) {
      toast('Inserisci la matricola', 'err');
      return;
    }

    payload = {
      ...payload,
      matricola: mat,
      marca: v('me4'),
      modello: v('me3'),
      ubicazione: v('me5') || null,
      piano: v('me6') || null,
      locale: v('me7') || null,
      data_installazione: v('me8') || null,
      data_ultimo_controllo: v('me9') || null,
      data_prossimo_controllo: v('me10') || null,
      data_scadenza_collaudo: v('me11') || null,
      stato: v('me13'),
      note: v('me14') || null,
      sede_id: v('mpsede') || null
    };
  }

  let error;

  if (eid) {
    ({ error } = await db
      .from('impianti')
      .update(payload)
      .eq('id', eid));
  } else {
    ({ error } = await db
      .from('impianti')
      .insert(payload));
  }

  if (error) {
    toast('Errore: ' + error.message, 'err');
    return;
  }

  closeM('m-presidio');
  toast(eid ? 'Presidio aggiornato ✓' : 'Presidio salvato ✓', 'ok');
  loadPresidi();
  loadDash();
}

  let righeImportPresidi = [];

function pulisciImportPresidi(valore) {
  return String(valore || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function pulisciPivaImport(valore) {
  return String(valore || '').replace(/\D/g, '');
}

function leggiCsvImportPresidi(testo) {
  const primaRiga = testo.split(/\r?\n/)[0] || '';
  const separatore = primaRiga.includes(';') ? ';' : ',';

  const righe = [];
  let riga = [];
  let valore = '';
  let traVirgolette = false;

  for (let i = 0; i < testo.length; i++) {
    const carattere = testo[i];
    const successivo = testo[i + 1];

    if (carattere === '"') {
      if (traVirgolette && successivo === '"') {
        valore += '"';
        i++;
      } else {
        traVirgolette = !traVirgolette;
      }

      continue;
    }

    if (!traVirgolette && carattere === separatore) {
      riga.push(valore.trim());
      valore = '';
      continue;
    }

    if (!traVirgolette && (carattere === '\n' || carattere === '\r')) {
      if (carattere === '\r' && successivo === '\n') i++;

      riga.push(valore.trim());

      if (riga.some(function(cella) { return cella !== ''; })) {
        righe.push(riga);
      }

      riga = [];
      valore = '';
      continue;
    }

    valore += carattere;
  }

  riga.push(valore.trim());

  if (riga.some(function(cella) { return cella !== ''; })) {
    righe.push(riga);
  }

  return righe;
}

function dataImportPresidi(valore) {
  const data = String(valore || '').trim();

  if (!data) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return data;
  }

  const match = data.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);

  if (!match) return null;

  return [
    match[3],
    String(match[2]).padStart(2, '0'),
    String(match[1]).padStart(2, '0')
  ].join('-');
}

function tipoImportPresidio(valore) {
  const tipo = pulisciImportPresidi(valore);

  const mappa = {
    estintore: 'estintore',
    estintori: 'estintore',

    porta_rei: 'porta_rei',
    porte_rei: 'porta_rei',
    porta_tagliafuoco: 'porta_rei',
    porte_tagliafuoco: 'porta_rei',

    uscita_emergenza: 'uscita_emergenza',
    uscite_emergenza: 'uscita_emergenza',

    manichetta: 'manichetta',
    manichette: 'manichetta',

    idrante: 'idrante',
    idranti: 'idrante',

    naspo: 'naspo',
    naspi: 'naspo',

    luce_emergenza: 'luce_emergenza',
    luci_emergenza: 'luce_emergenza',

    pompa_antincendio: 'pompa_antincendio',
    centrale_rivelazione: 'centrale_rivelazione',
    sprinkler: 'sprinkler'
  };

  return mappa[tipo] || '';
}

function elencoVociCsv(valore) {
  return String(valore || '')
    .split('|')
    .map(function(voce) {
      return voce.trim();
    })
    .filter(Boolean);
}

function statoDaEsitoCsv(esito) {
  const valore = pulisciImportPresidi(esito || '');

  if (!valore) return 'ok';

  if (['ok', 'anomalia', 'scaduto', 'fuori_servizio'].includes(valore)) {
    return valore;
  }

  if (
    valore.includes('non riallineabile') ||
    valore.includes('fuori servizio')
  ) {
    return 'fuori_servizio';
  }

  if (
    valore.includes('non conforme') ||
    valore.includes('non manutenzionata')
  ) {
    return 'anomalia';
  }

  return 'ok';
}

function apriImportPresidi() {
  if (!['titolare', 'capo_tecnico', 'tecnico'].includes(ROLE)) {
    toast('Solo titolare e capo tecnico possono importare presidi', 'err');
    return;
  }

  righeImportPresidi = [];

  ge('import-presidi-file').value = '';
  ge('import-presidi-conferma').disabled = true;

  ge('import-presidi-riepilogo').textContent =
    'Nessun file selezionato.';

  ge('import-presidi-righe').innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty">Carica un file per vedere l’anteprima.</div>
      </td>
    </tr>
  `;
  ge('import-presidi-anno').value = new Date().getFullYear();

  openM('m-import-presidi');
}

function leggiFileImportPresidi(input) {
  const file = input.files?.[0];

  if (!file) return;

  const cicloManutenzione = v('import-presidi-ciclo');

  const annoManutenzione = Number.parseInt(
    v('import-presidi-anno'),
    10
  );

  if (!cicloManutenzione) {
    input.value = '';
    toast('Seleziona prima il periodo di manutenzione', 'err');
    return;
  }

  if (
    !Number.isInteger(annoManutenzione) ||
    annoManutenzione < 2020 ||
    annoManutenzione > 2100
  ) {
    input.value = '';
    toast('Inserisci un anno di manutenzione valido', 'err');
    return;
  }

  const lettore = new FileReader();

  lettore.onload = async function(evento) {
    await preparaImportPresidi(evento.target.result);
  };

  lettore.onerror = function() {
    toast('Non riesco a leggere il file selezionato', 'err');
  };

  lettore.readAsText(file, 'utf-8');
}

async function preparaImportPresidi(testo) {

    const annoManutenzione = Number.parseInt(
    v('import-presidi-anno'),
    10
  );

  const cicloManutenzione = v('import-presidi-ciclo');
  const righeCsv = leggiCsvImportPresidi(testo);

  if (righeCsv.length < 2) {
    toast('Il file deve contenere intestazione e almeno una riga', 'err');
    return;
  }

  const intestazioni = righeCsv[0].map(pulisciImportPresidi);

  const obbligatorie = ['cliente', 'tipo', 'matricola'];
  const mancanti = obbligatorie.filter(function(nome) {
    return !intestazioni.includes(nome);
  });

  if (mancanti.length) {
    toast(
      'Colonne mancanti nel CSV: ' + mancanti.join(', '),
      'err'
    );
    return;
  }

  const datiCsv = righeCsv
    .slice(1)
    .map(function(celle, indice) {
      const riga = { numeroRiga: indice + 2 };

      intestazioni.forEach(function(intestazione, posizione) {
        riga[intestazione] = (celle[posizione] || '').trim();
      });

      return riga;
    })
    .filter(function(riga) {
      return Object.keys(riga).some(function(chiave) {
        return chiave !== 'numeroRiga' && riga[chiave];
      });
    });

  ge('import-presidi-riepilogo').textContent =
    'Controllo ' + datiCsv.length + ' righe...';

  const { data: clienti, error: erroreClienti } = await db
    .from('clienti')
    .select('id,ragione_sociale,piva')
    .is('eliminato_il', null);

  if (erroreClienti) {
    toast('Errore caricamento clienti: ' + erroreClienti.message, 'err');
    return;
  }

  const { data: esistenti, error: errorePresidi } = await db
    .from('impianti')
    .select('id,cliente_id,tipo,matricola,ubicazione')
    .is('eliminato_il', null);

  if (errorePresidi) {
    toast('Errore controllo presidi esistenti: ' + errorePresidi.message, 'err');
    return;
  }

  const presidiPerChiave = {};

  (esistenti || []).forEach(function(presidio) {
    const chiave = [
    presidio.cliente_id,
    presidio.tipo,
    pulisciImportPresidi(presidio.matricola),
    pulisciImportPresidi(presidio.ubicazione)
    ].join('|');

    if (!presidiPerChiave[chiave]) {
      presidiPerChiave[chiave] = [];
    }

    presidiPerChiave[chiave].push(presidio);
  });

  const righeViste = new Set();

  righeImportPresidi = datiCsv.map(function(riga) {
    const clienteDaCercare = pulisciImportPresidi(riga.cliente);
    const pivaDaCercare = pulisciPivaImport(riga.piva_cliente);
    const tipo = tipoImportPresidio(riga.tipo);
    const matricola = String(riga.matricola || '').trim();
    const ubicazione = String(riga.ubicazione || '').trim();

    const risultato = {
      ...riga,
      tipoNormale: tipo,
      matricolaNormale: matricola,
      valido: false,
      azione: '',
      messaggio: '',
      clienteId: null,
      presidioEsistenteId: null,
      payload: null
    };

    if (!clienteDaCercare || !tipo || !matricola) {
      risultato.messaggio =
        'Cliente, tipo e matricola sono obbligatori';
      return risultato;
    }

  let clientiCompatibili = (clienti || []).filter(function(cliente) {
  return pulisciImportPresidi(cliente.ragione_sociale) === clienteDaCercare;
});

/*
  Se nel CSV trovi "GT AUTO" e nel gestionale c'è
  "GT AUTO S.R.L." oppure "GT AUTO PISA", prova un match parziale.
  Se trova più clienti, lo lascia comunque bloccato come ambiguo.
*/
if (!clientiCompatibili.length) {
  clientiCompatibili = (clienti || []).filter(function(cliente) {
    const nomeDatabase = pulisciImportPresidi(cliente.ragione_sociale);

    return (
      nomeDatabase.includes(clienteDaCercare) ||
      clienteDaCercare.includes(nomeDatabase)
    );
  });
}

if (pivaDaCercare) {
  clientiCompatibili = clientiCompatibili.filter(function(cliente) {
    return pulisciPivaImport(cliente.piva) === pivaDaCercare;
  });
}

    if (clientiCompatibili.length === 0) {
      risultato.messaggio = 'Cliente non trovato';
      return risultato;
    }

    if (clientiCompatibili.length > 1) {
      risultato.messaggio =
        'Cliente ambiguo: aggiungi piva_cliente nel CSV';
      return risultato;
    }

    const cliente = clientiCompatibili[0];

    const chiaveImport = [
      cliente.id,
      tipo,
      pulisciImportPresidi(matricola),
      pulisciImportPresidi(ubicazione)
    ].join('|');

    if (righeViste.has(chiaveImport)) {
      risultato.messaggio =
        'Duplicato nel file: stessa matricola, cliente, tipologia e ubicazione';
      return risultato;
    }

    righeViste.add(chiaveImport);

    const trovati = presidiPerChiave[chiaveImport] || [];

    if (trovati.length > 1) {
      risultato.messaggio =
        'Esistono già più presidi uguali: non aggiorno automaticamente';
      return risultato;
    }

    const stato = statoDaEsitoCsv(
  riga.stato || riga.esito_verifica
);

const esitoVerifica = String(
  riga.esito_verifica || ''
).trim() || null;

const vociSi = elencoVociCsv(riga.voci_x_si);
const vociNo = elencoVociCsv(riga.voci_x_no);
const vociVuote = [
  ...elencoVociCsv(riga.voci_senza_x),
  ...elencoVociCsv(riga.voci_da_verificare),
  ...elencoVociCsv(riga.voci_x_vuote)
];

const paginaPdf = Number.parseInt(riga.pagina_pdf, 10);
    const statiValidi = ['ok', 'anomalia', 'scaduto', 'fuori_servizio'];

    if (!statiValidi.includes(stato)) {
      risultato.messaggio = 'Stato non valido';
      return risultato;
    }

    const ultimaVerifica = dataImportPresidi(
  riga.ultima_verifica || riga.data_verifica
);
    const prossimaVerifica = dataImportPresidi(riga.prossima_verifica);
    const scadenzaCollaudo = dataImportPresidi(riga.scadenza_collaudo);

    if (
      ultimaVerifica === null ||
      prossimaVerifica === null ||
      scadenzaCollaudo === null
    ) {
      risultato.messaggio =
        'Data non valida: usa gg/mm/aaaa oppure aaaa-mm-gg';
      return risultato;
    }

    const periodicita = Number.parseInt(riga.periodicita_mesi, 10);

    const payloadBase = {
      cliente_id: cliente.id,
      tipo: tipo,
      matricola: matricola,
      numero_progressivo: String(riga.numero_progressivo || '').trim() || null,
      anno_manutenzione: annoManutenzione,
      ciclo_manutenzione: cicloManutenzione,
      marca: riga.marca || null,
      modello: riga.modello || null,
      ubicazione: riga.ubicazione || null,
      piano: riga.piano || null,
      locale: riga.locale || null,
      data_ultimo_controllo: ultimaVerifica || null,
      data_prossimo_controllo: prossimaVerifica || null,
      data_scadenza_collaudo: scadenzaCollaudo || null,
      stato: stato,
      periodicita_mesi: Number.isFinite(periodicita) ? periodicita : 6,
      esito_verifica: esitoVerifica,
      voci_x_si: vociSi,
      voci_x_no: vociNo,
      voci_x_vuote: vociVuote,
      fonte_pdf: riga.fonte_pdf || null,
      pagina_pdf: Number.isInteger(paginaPdf) ? paginaPdf : null,
      note: riga.note || null
    };

    risultato.clienteId = cliente.id;
    risultato.payload = payloadBase;
    risultato.valido = true;

    if (trovati.length === 1) {
      risultato.azione = 'Aggiorna';
      risultato.presidioEsistenteId = trovati[0].id;
      risultato.messaggio = 'Presidio già presente';
    } else {
      risultato.azione = 'Crea';
      risultato.messaggio = 'Nuovo presidio';
    }

    return risultato;
  });

  renderAnteprimaImportPresidi();
}

function renderAnteprimaImportPresidi() {
  const valide = righeImportPresidi.filter(function(riga) {
    return riga.valido;
  });

  const errori = righeImportPresidi.filter(function(riga) {
    return !riga.valido;
  });

  const nuove = valide.filter(function(riga) {
    return riga.azione === 'Crea';
  });

  const aggiornamenti = valide.filter(function(riga) {
    return riga.azione === 'Aggiorna';
  });

  ge('import-presidi-riepilogo').innerHTML = `
    <b>${valide.length}</b> righe pronte:
    ${nuove.length} nuove,
    ${aggiornamenti.length} aggiornamenti,
    ${errori.length} con errore.
  `;

  ge('import-presidi-conferma').disabled = valide.length === 0;

  ge('import-presidi-righe').innerHTML = righeImportPresidi
    .slice(0, 100)
    .map(function(riga) {
      return `
        <tr>
          <td>${riga.numeroRiga}</td>
          <td>${esc(riga.cliente || '—')}</td>
          <td>${esc(riga.tipoNormale || riga.tipo || '—')}</td>
          <td>${esc(riga.matricolaNormale || riga.matricola || '—')}</td>
          <td>${esc(riga.azione || '—')}</td>
          <td style="color:${riga.valido ? 'var(--g)' : 'var(--r)'}">
            ${esc(riga.messaggio)}
          </td>
        </tr>
      `;
    })
    .join('');
}

async function confermaImportPresidi() {
  const valide = righeImportPresidi.filter(function(riga) {
    return riga.valido;
  });

  if (!valide.length) {
    toast('Non ci sono righe valide da importare', 'err');
    return;
  }

  if (!confirm(
    `Importare ${valide.length} presidi? I duplicati segnalati non verranno creati.`
  )) {
    return;
  }

  const bottone = ge('import-presidi-conferma');
  bottone.disabled = true;
  bottone.textContent = 'Importazione in corso...';

  let creati = 0;
  let aggiornati = 0;
  const errori = [];

  for (const riga of valide) {
    let error;

    if (riga.azione === 'Aggiorna') {
      ({ error } = await db
        .from('impianti')
        .update(riga.payload)
        .eq('id', riga.presidioEsistenteId));

      if (!error) aggiornati++;
    } else {
      ({ error } = await db
        .from('impianti')
        .insert(riga.payload));

      if (!error) creati++;
    }

    if (error) {
      errori.push(
        `Riga ${riga.numeroRiga}: ${error.message}`
      );
    }
  }

  bottone.textContent = '✓ Conferma importazione';

  if (errori.length) {
    bottone.disabled = false;

    ge('import-presidi-riepilogo').innerHTML = `
      Importati: ${creati} nuovi, ${aggiornati} aggiornati.<br>
      <span style="color:var(--r)">
        Errori: ${esc(errori.join(' · '))}
      </span>
    `;

    toast('Importazione completata con alcuni errori', 'err');
    await loadPresidi();
    return;
  }

  closeM('m-import-presidi');

  toast(
    `Importazione completata: ${creati} nuovi, ${aggiornati} aggiornati`,
    'ok'
  );

  await loadPresidi();
  await loadDash();
}


