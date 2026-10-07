// ── SCHEDA CLIENTE ────────────────────────────────────────────
async function openClienteDetail(id) {
const paginaAttuale = document
  .querySelector('.page.on')
  ?.id
  ?.replace('pg-', '');

if (paginaAttuale && paginaAttuale !== 'cliente-detail') {
  paginaPrecedenteCliente = paginaAttuale;
}

  const schedaSolaLettura = ROLE === 'commerciale';
  const puoModificare = puoModificareClienti();

  const btnNuovoPresidio = ge('cli-det-add-presidio');
  const btnCaricaFile = ge('btn-carica-file');
  const btnLinkCliente = ge('cli-det-link');
  const btnNuovoProgetto = ge('btn-nuovo-progetto');

  if (btnNuovoPresidio) {
    btnNuovoPresidio.style.display =
      schedaSolaLettura
        ? 'none'
        : (
            ROLE === 'titolare' ||
            ROLE === 'capo_tecnico' ||
            ROLE === 'segreteria'
          )
          ? ''
          : 'none';
  }

  if (btnCaricaFile) {
    btnCaricaFile.style.display =
      schedaSolaLettura
        ? 'none'
        : (
            ROLE === 'titolare' ||
            ROLE === 'segreteria'
          )
          ? ''
          : 'none';
  }

  if (btnLinkCliente) {
    btnLinkCliente.style.display =
      schedaSolaLettura
        ? 'none'
        : (
            ROLE === 'titolare' ||
            ROLE === 'segreteria'
          )
          ? ''
          : 'none';
  }

  if (btnNuovoProgetto) {
    btnNuovoProgetto.style.display =
      schedaSolaLettura ? 'none' : '';
  }

  currentCliId = id;

/* Invalida qualsiasi caricamento progetti del cliente precedente. */
richiestaProgettiCliente += 1;
progettiClienteDati = [];

const listaProgettiCliente = ge('cd-progetti-lista');

if (listaProgettiCliente) {
  listaProgettiCliente.innerHTML =
    '<div class="load">Caricamento progetti...</div>';
}

let cli = CLIS.find(function(c) {
  return c.id === id;
});

// Ricarica il cliente dal database: necessario dopo conversione di una lead.
const { data: clienteAggiornato, error: erroreClienteAggiornato } = await db
  .from('clienti')
  .select('*')
  .eq('id', id)
  .single();

if (!erroreClienteAggiornato && clienteAggiornato) {
  cli = clienteAggiornato;

  const indice = CLIS.findIndex(function(cliente) {
    return cliente.id === id;
  });

  if (indice >= 0) {
    CLIS[indice] = clienteAggiornato;
  } else {
    CLIS.push(clienteAggiornato);
  }
}

  ge('cd-nome').textContent =
    cli?.ragione_sociale || 'Cliente';

  ge('mpcl').value = id;

  gotoPage('cliente-detail');
  loadProgettiCliente(id);

  document.querySelectorAll('.nb').forEach(function(nav) {
    nav.classList.remove('on');
  });

  const sediHtml = await loadSediDetail(id);

  ge('cd-info-content').innerHTML = `
    <div class="g2" style="margin-bottom:16px">
      ${ir('Ragione sociale', cli?.ragione_sociale)}
      ${ir('P.IVA', cli?.piva)}
      ${ir('Cod. fiscale', cli?.codice_fiscale)}
      ${ir('Referente', cli?.referente_nome)}
      ${ir('Telefono', cli?.referente_telefono)}
      ${ir('Email', cli?.referente_email)}
      ${ir('Città', cli?.citta)}
      ${ir('Tipo attività', cli?.tipo_attivita)}
      ${ir('Stato', cli?.stato)}
    </div>

    ${
      cli?.note_commerciali
        ? `<div style="padding:12px;background:var(--bg);border-radius:var(--rs);font-size:13px;margin-bottom:16px">
             ${esc(cli.note_commerciali)}
           </div>`
        : ''
    }

    <div style="font-size:13px;font-weight:600;margin-bottom:10px">
      Sedi
    </div>

    ${sediHtml}

    <div style="font-size:13px;font-weight:600;margin:16px 0 10px">
      Dati fatturazione
    </div>

    <div class="g2">
      ${ir('Rag. soc. fattura', cli?.ragione_sociale_fattura || cli?.ragione_sociale)}
      ${ir('Indirizzo fattura', cli?.indirizzo_fattura)}
      ${ir('CAP / Città', cli?.cap_fattura ? cli.cap_fattura + ' ' + cli.citta_fattura : cli?.citta_fattura)}
      ${ir('Codice SDI', cli?.codice_sdi)}
      ${ir('PEC', cli?.pec)}
      ${ir('Modalità pagamento', cli?.modalita_pagamento)}
      ${ir('Giorni pagamento', (cli?.giorni_pagamento || 30) + 'gg')}
      ${ir('IBAN', cli?.iban)}
    </div>

    ${
      cli?.note_fatturazione
        ? `<div style="padding:12px;background:var(--bg);border-radius:var(--rs);font-size:13px;margin-top:10px">
             ${esc(cli.note_fatturazione)}
           </div>`
        : ''
    }

    ${
      puoModificare
        ? `<div style="margin-top:14px;display:flex;gap:8px">
             <button class="btn p sm" onclick="editCliById('${id}')">
               Modifica cliente
             </button>
           </div>`
        : ''
    }
  `;

  const { data: presidi } = await db
    .from('impianti')
    .select('*, sedi_cliente(id,tipo,indirizzo,citta)')
    .eq('cliente_id', id)
    .order('tipo')
    .order('matricola');

  ge('cd-presidi-content').innerHTML = !presidi?.length
    ? `
      <div class="empty">
        Nessun presidio censito.
        ${
          schedaSolaLettura
            ? ''
            : `<br>
               <button
                 class="btn p sm"
                 style="margin-top:10px"
                 onclick="openM('m-presidio')"
               >
                 + Aggiungi presidio
               </button>`
        }
      </div>
    `
    : `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
        ${presidi.map(function(p) {
          return `
            <div class="pc">
              <div style="position:absolute;top:12px;right:12px">
                ${si2(p.stato)}
              </div>

              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--m);margin-bottom:4px">
                ${tpl(p.tipo)}
              </div>

              <div style="font-size:14px;font-weight:600;margin-bottom:2px">
                ${esc(p.matricola || '—')}
              </div>

              ${
                p.sedi_cliente
                  ? `<div style="font-size:11px;color:var(--b);margin-bottom:4px">
                       📍 ${p.sedi_cliente.tipo || ''} ${esc(p.sedi_cliente.indirizzo || '')}
                     </div>`
                  : ''
              }

              <div style="font-size:12px;display:flex;flex-direction:column;gap:4px">
                <div style="display:flex;justify-content:space-between">
                  <span style="color:var(--m)">Ubicazione</span>
                  <span>${esc(p.ubicazione || '—')}</span>
                </div>

                <div style="display:flex;justify-content:space-between">
                  <span style="color:var(--m)">Ultima verifica</span>
                  <span>${fd(p.data_ultimo_controllo)}</span>
                </div>

                <div style="display:flex;justify-content:space-between">
                  <span style="color:var(--m)">Prossima</span>
                  <span class="${sc(p.data_prossimo_controllo)}">
                    ${fd(p.data_prossimo_controllo)}
                  </span>
                </div>
              </div>

              ${
                schedaSolaLettura
                  ? ''
                  : `<div style="display:flex;gap:6px;margin-top:10px">
                       ${
                         ROLE === 'titolare' ||
                         ROLE === 'capo_tecnico' ||
                         ROLE === 'segreteria'
                           ? `<button class="btn sm" onclick="editP('${p.id}')">✏️</button>`
                           : ''
                       }

                       ${
                         ROLE === 'titolare' || ROLE === 'capo_tecnico'
                           ? `<button class="btn sm" style="color:var(--r)" onclick="eliminaPresidio('${p.id}')">🗑️</button>`
                           : ''
                       }
                     </div>`
              }
            </div>
          `;
        }).join('')}
      </div>
    `;

  const { data: interventi } = await db
    .from('ordini_lavoro')
    .select('*, utenti!ordini_lavoro_tecnico_id_fkey(nome,cognome)')
    .eq('cliente_id', id)
    .order('data_pianificata', { ascending: false })
    .limit(20);

  ge('cd-interventi-content').innerHTML = !interventi?.length
    ? '<div class="empty">Nessun intervento</div>'
    : `
      <div class="tw">
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Tipo</th>
              <th>Tecnico</th>
              <th>Data</th>
              <th>Stato</th>
            </tr>
          </thead>

          <tbody>
            ${interventi.map(function(o) {
              return `
                <tr>
                  <td>#${o.numero || '—'}</td>
                  <td>${tl(o.tipo)}</td>
                  <td>${esc(o.utenti ? o.utenti.nome + ' ' + o.utenti.cognome : '—')}</td>
                  <td>${fd(o.data_pianificata)}</td>
                  <td>${bs(o.stato)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

  const { data: schede } = await db
    .from('schede_lavoro')
    .select('*, utenti!schede_lavoro_tecnico_id_fkey(nome,cognome)')
    .eq('cliente_id', id)
    .order('creato_il', { ascending: false })
    .limit(20);

  ge('cd-documenti-content').innerHTML = !schede?.length
    ? '<div class="empty">Nessun documento</div>'
    : `
      <div class="tw">
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Tecnico</th>
              <th>Data</th>
              <th>Esito</th>
              <th>Stato</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            ${schede.map(function(s) {
              return `
                <tr>
                  <td>#${s.numero || '—'}</td>
                  <td>${esc(s.utenti ? s.utenti.nome + ' ' + s.utenti.cognome : '—')}</td>
                  <td>${fd(s.data_intervento)}</td>
                  <td>${s.esito ? be(s.esito) : '—'}</td>
                  <td>${bs(s.stato)}</td>
                  <td>
                    <button class="btn sm" onclick="openScheda('${s.id}')">
                      Vedi
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

  loadPeriodicitaCliente(id);
}

async function editCliById(id, contestoLead = null) {
  if (!puoModificareClienti()) {
    toast('I clienti sono in sola lettura per il tuo ruolo', 'err');
    return;
  }

  contestoCompletamentoLead = contestoLead;

  const { data: cliente, error } = await db
    .from('clienti')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !cliente) {
    toast('Cliente non trovato: ' + (error?.message || ''), 'err');
    return;
  }

  await editCli(cliente);
}

// ── CLIENTI ───────────────────────────────────────────────────

function puoModificareClienti() {
  return ['titolare', 'rappresentante', 'segreteria'].includes(ROLE);
}

async function loadCli() {
  const btnNuovoCliente = ge('btn-nuovo-cliente');

if (btnNuovoCliente) {
  btnNuovoCliente.style.display = puoModificareClienti() ? '' : 'none';
}
  let query = db
    .from('clienti')
    .select('*')
    .is('eliminato_il', null)
    .order('ragione_sociale');

  // Ogni rappresentante vede solo i clienti assegnati a lui.
  if (ROLE === 'rappresentante') {
    query = query.eq('rappresentante_id', ME.id);
  }

  const { data, error } = await query;

  if (error) {
    ge('ctbody').innerHTML =
      `<tr><td colspan="5"><div class="al2 e">Errore: ${error.message}</div></td></tr>`;
    return;
  }

  CLIS = data || [];
  ge('cli-count').textContent = `(${CLIS.length} totali)`;
  renderC(CLIS);
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

  const filtroAttivo = data.length < PA.length;

  const etichettaPeriodo = function(anno, ciclo) {
    const cicloLabel = {
      gennaio_luglio: 'Gennaio – Luglio',
      febbraio_agosto: 'Febbraio – Agosto'
    }[ciclo] || 'Periodo non assegnato';

    return anno ? `${cicloLabel} ${anno}` : cicloLabel;
  };

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

  const renderGriglia = function(presidi) {
    const ordinati = [...presidi].sort(function(a, b) {
      return String(a.matricola || '').localeCompare(
        String(b.matricola || ''),
        'it',
        { numeric: true }
      );
    });

    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:12px;padding:6px 0 12px">
        ${ordinati.map(scheda).join('')}
      </div>
    `;
  };

  const renderTipologie = function(presidi, chiavePeriodo, cliente) {
    const tipi = {};

    presidi.forEach(function(p) {
      if (!tipi[p.tipo]) tipi[p.tipo] = [];
      tipi[p.tipo].push(p);
    });

    return Object.keys(tipi).sort(function(a, b) {
      return tpl(a).localeCompare(tpl(b), 'it');
    }).map(function(tipo) {
      const elementi = tipi[tipo];

      const ubicazioni = {};

      elementi.forEach(function(p) {
        const ubicazione = String(p.ubicazione || '').trim();

        if (!ubicazioni[ubicazione]) {
          ubicazioni[ubicazione] = [];
        }

        ubicazioni[ubicazione].push(p);
      });

      const chiaviUbicazioni = Object.keys(ubicazioni);
      const mostraCartelleUbicazione =
        chiaviUbicazioni.length > 1 &&
        !(chiaviUbicazioni.length === 1 && !chiaviUbicazioni[0]);

      const daGestire = elementi.filter(function(p) {
        return p.stato !== 'ok';
      }).length;

      return `
        <details
          data-cartella="tipo|${encodeURIComponent(chiavePeriodo)}|${encodeURIComponent(cliente)}|${encodeURIComponent(tipo)}"
          style="margin-top:8px;background:var(--bg);border-radius:7px;padding:0 10px"
          ${filtroAttivo ? 'open' : ''}
        >
          <summary
            style="cursor:pointer;padding:10px 0;display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:700"
          >
            <span>${tpl(tipo)}</span>
            <span style="color:var(--m)">
              ${elementi.length} ·
              ${daGestire ? `${daGestire} attenzione` : 'OK'}
            </span>
          </summary>

          <div style="padding:0 0 10px">
            ${mostraCartelleUbicazione
              ? chiaviUbicazioni.sort(function(a, b) {
                  return (a || 'Ubicazione non specificata')
                    .localeCompare(b || 'Ubicazione non specificata', 'it');
                }).map(function(ubicazione) {
                  const etichetta = ubicazione || 'Ubicazione non specificata';
                  const elementiUbicazione = ubicazioni[ubicazione];

                  return `
                    <details
                      data-cartella="ubicazione|${encodeURIComponent(chiavePeriodo)}|${encodeURIComponent(cliente)}|${encodeURIComponent(tipo)}|${encodeURIComponent(ubicazione)}"
                      style="margin-top:8px;border:1px solid var(--bl);border-radius:7px;padding:0 10px;background:#fff"
                      ${filtroAttivo ? 'open' : ''}
                    >
                      <summary
                        style="cursor:pointer;padding:9px 0;font-size:12px;font-weight:700"
                      >
                        📍 ${esc(etichetta)}
                        <span style="color:var(--m);font-weight:400">
                          (${elementiUbicazione.length})
                        </span>
                      </summary>

                      ${renderGriglia(elementiUbicazione)}
                    </details>
                  `;
                }).join('')
              : renderGriglia(elementi)
            }
          </div>
        </details>
      `;
    }).join('');
  };

  // Primo livello: anno + semestre.
  const periodi = {};

  data.forEach(function(p) {
    const anno = p.anno_manutenzione || '';
    const ciclo = p.ciclo_manutenzione || '';
    const chiavePeriodo = `${anno}|${ciclo}`;

    if (!periodi[chiavePeriodo]) {
      periodi[chiavePeriodo] = {
        anno: anno,
        ciclo: ciclo,
        presidi: []
      };
    }

    periodi[chiavePeriodo].presidi.push(p);
  });

  const ordineCicli = {
    gennaio_luglio: 1,
    febbraio_agosto: 2
  };

  const chiaviPeriodi = Object.keys(periodi).sort(function(a, b) {
    const A = periodi[a];
    const B = periodi[b];

    return (
      Number(B.anno || 0) - Number(A.anno || 0) ||
      (ordineCicli[A.ciclo] || 99) - (ordineCicli[B.ciclo] || 99)
    );
  });

  w.innerHTML = chiaviPeriodi.map(function(chiavePeriodo) {
    const periodo = periodi[chiavePeriodo];
    const presidiPeriodo = periodo.presidi;

    const clienti = {};

    presidiPeriodo.forEach(function(p) {
      const cliente = p.clienti?.ragione_sociale || 'Cliente non assegnato';

      if (!clienti[cliente]) clienti[cliente] = [];
      clienti[cliente].push(p);
    });

    const anomaliePeriodo = presidiPeriodo.filter(function(p) {
      return p.stato !== 'ok';
    }).length;

    return `
      <details
        data-cartella="periodo|${encodeURIComponent(chiavePeriodo)}"
        class="card"
        style="grid-column:1/-1;padding:0;overflow:hidden"
        ${chiaviPeriodi.length === 1 || filtroAttivo ? 'open' : ''}
      >
        <summary
          style="cursor:pointer;padding:16px;display:flex;justify-content:space-between;align-items:center;gap:12px"
        >
          <div>
            <div style="font-size:16px;font-weight:700">
              📅 ${esc(etichettaPeriodo(periodo.anno, periodo.ciclo))}
            </div>
            <div style="font-size:12px;color:var(--m);margin-top:3px">
              ${presidiPeriodo.length} presìdi
            </div>
          </div>

          ${anomaliePeriodo
            ? `<span class="bx berr">${anomaliePeriodo} da verificare</span>`
            : '<span class="bx bok">Tutto OK</span>'
          }
        </summary>

        <div style="padding:0 16px 16px">
          ${Object.keys(clienti).sort(function(a, b) {
            return a.localeCompare(b, 'it');
          }).map(function(cliente) {
            const presidiCliente = clienti[cliente];

            const anomalieCliente = presidiCliente.filter(function(p) {
              return p.stato !== 'ok';
            }).length;

            return `
              <details
                data-cartella="cliente|${encodeURIComponent(chiavePeriodo)}|${encodeURIComponent(cliente)}"
                style="margin-top:10px;border:1px solid var(--bl);border-radius:8px;padding:0 12px"
                ${Object.keys(clienti).length === 1 && filtroAttivo ? 'open' : ''}
              >
                <summary
                  style="cursor:pointer;padding:11px 0;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;font-weight:700"
                >
                  <span>🗂️ ${esc(cliente)}</span>

                  <span style="color:var(--m);font-size:12px">
                    ${presidiCliente.length} ·
                    ${anomalieCliente ? `${anomalieCliente} attenzione` : 'OK'}
                  </span>
                </summary>

                <div style="padding:0 0 12px">
                  ${renderTipologie(
                    presidiCliente,
                    chiavePeriodo,
                    cliente
                  )}
                </div>
              </details>
            `;
          }).join('')}
        </div>
      </details>
    `;
  }).join('');
}

function renderC(clienti) {
  const corpo = ge('ctbody');
  if (!corpo) return;

  if (!clienti?.length) {
    corpo.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty">Nessun cliente trovato.</div>
        </td>
      </tr>
    `;
    return;
  }

  const puoModificare = puoModificareClienti();
  const puoEliminare = ['titolare', 'rappresentante'].includes(ROLE);

  corpo.innerHTML = clienti.map(function(cliente) {
    const nome = cliente.ragione_sociale || 'Cliente senza nome';
    const telefono = cliente.referente_telefono || '—';
    const email = cliente.referente_email || '—';
    const citta = [
      cliente.indirizzo,
      cliente.citta
    ].filter(Boolean).join(', ') || '—';

    const stato = cliente.stato === 'prospect'
      ? '<span class="bx bgray">Prospect</span>'
      : '<span class="bx bok">Attivo</span>';

    return `
      <tr>
        <td>
          <strong>${esc(nome)}</strong>
          ${cliente.piva ? `
            <br>
            <span style="font-size:11px;color:var(--m)">
              P.IVA: ${esc(cliente.piva)}
            </span>
          ` : ''}
        </td>

        <td>
          <div>${esc(email)}</div>
          <div style="font-size:12px;color:var(--m);margin-top:3px">
            ${esc(telefono)}
          </div>
        </td>

        <td>${esc(citta)}</td>

        <td>${stato}</td>

        <td style="white-space:nowrap">
          <button
            class="btn sm"
            onclick="openClienteDetail('${cliente.id}')"
          >
            Apri
          </button>

          ${puoModificare ? `
            <button
              class="btn sm"
              onclick="editCliById('${cliente.id}')"
            >
              Modifica
            </button>
          ` : ''}

          ${puoEliminare ? `
            <button
              class="btn sm"
              style="color:var(--r)"
              onclick="eliminaCliente('${cliente.id}')"
            >
              🗑️
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

function filterC() {
  const posizionePagina = window.scrollY;
  const paginaClienti = ge('pg-clienti');
  const posizioneSezione = paginaClienti ? paginaClienti.scrollTop : 0;

  const q = v('csearch').toLowerCase().trim();
  const s = v('cfilt');

  const risultati = CLIS.filter(function(c) {
    const nome = (c.ragione_sociale || '').toLowerCase();
    const email = (c.referente_email || '').toLowerCase();
    const piva = (c.piva || '').toLowerCase();
    const citta = (c.citta || '').toLowerCase();

    return (
      (
        !q ||
       nome.startsWith(q) ||
email.startsWith(q) ||
piva.startsWith(q) ||
citta.startsWith(q)
      ) &&
      (!s || c.stato === s)
    );
  });

  // Prima il nome che inizia con la ricerca, poi gli altri risultati.
  if (q) {
    risultati.sort(function(a, b) {
      const nomeA = (a.ragione_sociale || '').toLowerCase();
      const nomeB = (b.ragione_sociale || '').toLowerCase();

      const priorita = function(nome) {
        if (nome === q) return 0;
        if (nome.startsWith(q)) return 1;

        const parolaCheInizia = nome
          .split(/[\s.,/-]+/)
          .some(function(parola) {
            return parola.startsWith(q);
          });

        return parolaCheInizia ? 2 : 3;
      };

      const confronto = priorita(nomeA) - priorita(nomeB);

      return confronto || nomeA.localeCompare(nomeB, 'it');
    });
  }

  renderC(risultati);

  requestAnimationFrame(function() {
    window.scrollTo(0, posizionePagina);

    if (paginaClienti) {
      paginaClienti.scrollTop = posizioneSezione;
    }
  });
}

function openEditCli(id) {
  // Carica dati e apri modal cliente in modifica
  var cli = CLIS.find(function(c) { return c.id === id; });
  if(!cli) { toast('Cliente non trovato', 'err'); return; }
  ge('mcli-title').textContent = 'Modifica cliente';
  ge('mc-edit-id').value = id;
  // Precompila campi base
  var fields = {mc1:'ragione_sociale',mc2:'referente_nome',mc2b:'referente_cognome',mc3:'referente_telefono',mc4:'referente_email',mc5:'piva',mc6:'codice_fiscale',mc9:'note_commerciali'};
  Object.keys(fields).forEach(function(elId) {
    var el = ge(elId); if(el) el.value = cli[fields[elId]]||'';
  });
  if(ge('mc7')) ge('mc7').value = esc(cli.tipo_attivita)||'ufficio';
  if(ge('mc8')) ge('mc8').value = cli.stato||'attivo';
  openM('m-cli');
}

function openNewCli(){

  if (!puoModificareClienti()) {
  toast('I clienti sono in sola lettura per il tuo ruolo', 'err');
  return;
}

  ge('mcli-title').textContent='Nuovo cliente';
  ge('mc-edit-id').value='';
  ['mc1','mc2','mc2b','mc3','mc4','mc5','mc6','mc9','mf1','mf2','mf3','mf4','mf5','mf6','mf7','mf9','mf10','mf11'].forEach(
    id=>{
    const el=ge(id);if(el)el.value='';
  });
  ge('mc7').value='ufficio';
  ge('mc8').value='attivo';
  if(ge('mf9'))ge('mf9').value='30';
  pendingSedi=[];
  existingSediIds=[];
  renderSediList()
  ;openM('m-cli');
}


async function editCli(c){
  if(typeof c==='string'){
    try{c=JSON.parse(atob(c));}catch(e){try{c=JSON.parse(c);}catch(e2){}}
  }
  if(!c||typeof c!=='object'){toast('Errore caricamento cliente','err');return;}
  ge('mcli-title').textContent='Modifica cliente';ge('mc-edit-id').value=c.id;
  ge('mc1').value=esc(c.ragione_sociale)||'';ge('mc2').value=esc(c.piva)||'';ge('mc2b').value=esc(c.codice_fiscale)||'';
  ge('mc3').value=esc(c.citta)||'';ge('mc4').value=esc(c.referente_nome)||'';ge('mc5').value=esc(c.referente_telefono)||'';
  ge('mc6').value=esc(c.referente_email)||'';ge('mc7').value=esc(c.tipo_attivita)||'ufficio';ge('mc8').value=c.stato||'attivo';ge('mc9').value=esc(c.note_commerciali)||'';
  // Fatturazione
  if(ge('mf1'))ge('mf1').value=esc(c.ragione_sociale_fattura)||'';
  if(ge('mf2'))ge('mf2').value=esc(c.indirizzo_fattura)||'';
  if(ge('mf3'))ge('mf3').value=c.cap_fattura||'';
  if(ge('mf4'))ge('mf4').value=esc(c.citta_fattura)||'';
  if(ge('mf5'))ge('mf5').value=c.provincia_fattura||'';
  if(ge('mf6'))ge('mf6').value=esc(c.codice_sdi)||'';
  if(ge('mf7'))ge('mf7').value=esc(c.pec)||'';
  if(ge('mf8'))ge('mf8').value=c.modalita_pagamento||'';
  if(ge('mf9'))ge('mf9').value=c.giorni_pagamento||30;
  if(ge('mf10'))ge('mf10').value=esc(c.iban)||'';
  if(ge('mf11'))ge('mf11').value=esc(c.note_fatturazione)||'';
  // Carica sedi
  await loadSediForCliente(c.id);
  openM('m-cli');
}

// ── SEDI ────────────────────────────────────────────────────
let pendingSedi = [];
let existingSediIds = [];

function renderSediList(){
  const el=ge('sedi-list');
  const cnt=ge('sedi-count');
  if(cnt)cnt.textContent=pendingSedi.length||'';
  if(!pendingSedi.length){if(el)el.innerHTML='<div style="font-size:13px;color:var(--m);padding:8px">Nessuna sede aggiunta</div>';return;}
  if(el)el.innerHTML=pendingSedi.map((s,i)=>`<div class="sede-card">
    <div style="flex:1">
      <div class="sede-tipo ${s.tipo}">${s.tipo.toUpperCase()}${s.nome?' — '+esc(s.nome):''}</div>
      <div style="font-size:13px;font-weight:500">${[esc(s.via),esc(s.civico)].filter(Boolean).join(' ')}${s.via||s.civico?' — ':''}${esc(s.citta||'')}${s.cap?' '+esc(s.cap):''}</div>
      ${s.zona?`<div style="font-size:12px;color:var(--m)">${s.zona}</div>`:''}
    </div>
    <button class="btn sm" onclick="removeSede(${i})" style="color:var(--r);flex-shrink:0">✕</button>
  </div>`).join('');
}

function addSede(){
  const cit=v('ns-cit').trim();if(!cit){toast('Inserisci almeno la città','err');return;}
  pendingSedi.push({tipo:v('ns-tipo'),nome:v('ns-nome')||null,via:v('ns-via')||null,civico:v('ns-civ')||null,cap:v('ns-cap')||null,citta:cit,provincia:v('ns-prov')||null,zona:v('ns-zona')||null});
  ['ns-nome','ns-via','ns-civ','ns-cap','ns-cit','ns-prov','ns-zona'].forEach(id=>{const el=ge(id);if(el)el.value='';});
  renderSediList();toast('Sede aggiunta','ok');
}

function removeSede(i){pendingSedi.splice(i,1);renderSediList();}

async function loadSediForOdl(){
  const cid=v('mo1');const sel=ge('mo-sede');
  if(!cid){sel.innerHTML='<option value="">Sede principale / da definire</option>';return;}
  const {data}=await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').eq('cliente_id',cid).order('tipo');
  sel.innerHTML='<option value="">Sede principale (indirizzo cliente)</option>'+(data||[]).map(s=>`<option value="${s.id}">${(s.tipo||'sede').toUpperCase()}${s.nome?' — '+esc(s.nome):''}: ${esc(s.via||'')} ${esc(s.civico||'')} ${s.citta?'('+esc(s.citta)+')':''}</option>`).join('');
}

async function loadSediTec(){
  const cid=v('tc1');const sel=ge('tc1-sede');
  if(!cid){sel.innerHTML='<option value="">Sede principale / da definire</option>';return;}
  const {data}=await db.from('sedi_cliente').select('id,tipo,nome,via,civico,citta').eq('cliente_id',cid).order('tipo');
  sel.innerHTML='<option value="">Sede principale (indirizzo cliente)</option>'+(data||[]).map(s=>`<option value="${s.id}">${(s.tipo||'sede').toUpperCase()}${s.nome?' — '+esc(s.nome):''}: ${esc(s.via||'')} ${esc(s.civico||'')} ${s.citta?'('+esc(s.citta)+')':''}</option>`).join('');
}

async function loadSediForCliente(cliId){
  const {data}=await db.from('sedi_cliente').select('*').eq('cliente_id',cliId).order('tipo');
  pendingSedi=(data||[]).map(s=>({...s,_existing:true}));
  existingSediIds=(data||[]).map(s=>s.id);
  renderSediList();
}

async function saveCliSedi(cliId){

  if (!puoModificareClienti()) {
  toast('I clienti sono in sola lettura per il tuo ruolo', 'err');
  return;
}
  // Elimina tutte le sedi esistenti e reinserisci
  if(existingSediIds.length){
    await db.from('sedi_cliente').delete().in('id',existingSediIds);
  }
  if(pendingSedi.length){
    const payload=pendingSedi.map(s=>{const {_existing,id,...rest}=s;return {...rest,cliente_id:cliId};});
    await db.from('sedi_cliente').insert(payload);
  }
}

async function loadSediDetail(cliId){
  const {data}=await db.from('sedi_cliente').select('*').eq('cliente_id',cliId).order('tipo');
  if(!data?.length)return'<div class="empty">Nessuna sede. Modifica il cliente per aggiungerne.</div>';
  return data.map(s=>`<div class="sede-card" style="margin-bottom:8px">
    <div style="flex:1">
      <div class="sede-tipo ${s.tipo}">${s.tipo.toUpperCase()}${s.nome?' — '+esc(s.nome):''}</div>
      <div style="font-size:13px;font-weight:500">${[esc(s.via),esc(s.civico)].filter(Boolean).join(' ')}${(s.via||s.civico)?` — ${esc(s.citta||'')}`:esc(s.citta||'')}</div>
      ${s.cap||s.provincia?`<div style="font-size:12px;color:var(--m)">${esc(s.cap||'')} ${s.provincia||''}</div>`:''}
      ${s.zona?`<div style="font-size:12px;color:var(--m)">${s.zona}</div>`:''}
    </div>
  </div>`).join('');
}


// ── TECNICO: impossibilitato + relazione tecnica ──────────────
// (toggleImpossibilitato / mostraRelazioneBox / mostraInfoSede / loadAddrTec
//  definite piu' in basso — questa prima copia era dead code)

async function saveCli(){
  const rag=v('mc1').trim();if(!rag){toast('Inserisci la ragione sociale','err');return;}
  const eid=v('mc-edit-id');
    const completamentoLead = contestoCompletamentoLead;
  const payload={
    ragione_sociale:rag,piva:v('mc2')||null,codice_fiscale:v('mc2b')||null,
    citta:v('mc3')||null,referente_nome:v('mc4')||null,referente_telefono:v('mc5')||null,
    referente_email:v('mc6')||null,tipo_attivita:v('mc7'),stato:v('mc8'),note_commerciali:v('mc9')||null,
    ragione_sociale_fattura:v('mf1')||null,indirizzo_fattura:v('mf2')||null,
    cap_fattura:v('mf3')||null,citta_fattura:v('mf4')||null,provincia_fattura:v('mf5')||null,
    codice_sdi:v('mf6')||null,pec:v('mf7')||null,modalita_pagamento:v('mf8')||null,
    giorni_pagamento:parseInt(v('mf9'))||30,iban:v('mf10')||null,note_fatturazione:v('mf11')||null,
  };

    if (completamentoLead) {
    const mancanti = [];

    if (!payload.piva) mancanti.push('P.IVA');
    if (!payload.referente_nome) mancanti.push('referente');
    if (!payload.referente_telefono) mancanti.push('telefono');
    if (!payload.indirizzo_fattura) mancanti.push('indirizzo');
    if (!payload.cap_fattura) mancanti.push('CAP');
    if (!payload.citta_fattura) mancanti.push('città');

    if (mancanti.length) {
      toast(
        'Per confermare il contatto completa: ' + mancanti.join(', '),
        'err'
      );
      return;
    }
  }
  // Il cliente creato dal rappresentante viene assegnato a lui.
if (!eid && ROLE === 'rappresentante') {
  payload.rappresentante_id = ME.id;
}
  let cliId=eid;
  let error;
  if(eid){({error}=await db.from('clienti').update(payload).eq('id',eid));}
  else{
    const {data:nd,error:ne}=await db.from('clienti').insert(payload).select().single();
    error=ne;if(nd)cliId=nd.id;
  }
  if(error){toast('Errore: '+error.message,'err');return;}
  if(cliId)await saveCliSedi(cliId);
    if (completamentoLead) {
    const { error: erroreFase } = await db
      .from('pipeline_crm')
      .update({
        fase: 'qualificato',
        aggiornato_il: new Date().toISOString()
      })
      .eq('id', completamentoLead.pipelineId)
      .eq('rappresentante_id', ME.id);

    if (erroreFase) {
      toast(
        'Anagrafica salvata, ma errore aggiornamento lead: ' +
        erroreFase.message,
        'err'
      );
      return;
    }

    contestoCompletamentoLead = null;
  }
closeM('m-cli');

toast(
  completamentoLead
    ? 'Contatto confermato e anagrafica completata ✓'
    : (eid ? 'Cliente aggiornato ✓' : 'Cliente creato ✓'),
  'ok'
);
  if(ROLE==='segreteria') { await loadCS(); await loadDashSegreteria(); }
  pendingSedi=[];existingSediIds=[];
  await loadCS();loadCli();loadDash();

    if (completamentoLead) {
    await loadTrattative();
  }
}

