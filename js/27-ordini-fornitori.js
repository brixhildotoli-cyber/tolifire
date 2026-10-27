// =====================================================================
// F6.1 — ORDINI AI FORNITORI della commessa (passo 7).
// Nella scheda della commessa (pg-commessa-detail, box cmd-ordini):
// dalle offerte 'selezionato' del preventivo (scelte dal commerciale)
// nasce un ordine per fornitore: voci, importo IVA esclusa, data
// dell'ordine, arrivo previsto, luogo di consegna, note. PDF dell'ordine
// (jsPDF + autotable), che si può salvare nella cartella "ordini" della
// commessa (sql/29). Stati: ordinato → confermato → arrivato (più
// annullato, con motivo).
// Chi (sql/30): leggono gli ordini i 5 ruoli che leggono la commessa;
// vedono le offerte, creano, confermano e annullano rappresentante (le
// sue commesse), commerciale e titolare; segnano "arrivato" anche capo
// tecnico e segreteria. Lo stato "materiali ordinati" della commessa
// resta del rappresentante (sql/28): qui viene solo suggerito.
// Senza sql/30 la scheda mostra "non ancora attivi".
// =====================================================================

const ETICHETTE_STATO_ORDINE_FORNITORE = {
  ordinato: 'Ordinato',
  confermato: 'Confermato dal fornitore',
  arrivato: 'Arrivato',
  annullato: 'Annullato'
};

const RUOLI_CREANO_ORDINI = ['titolare', 'commerciale', 'rappresentante'];
const RUOLI_ARRIVO_ORDINI = ['titolare', 'commerciale', 'rappresentante', 'capo_tecnico', 'segreteria'];

let ordiniFornitoriDisponibili = null;
let commessaOrdiniAperta = null;
let ordiniCommessaAperta = [];
let offerteCommessaAperta = [];
let offerteCommessaLette = false; // false se la lettura delle offerte è fallita (js/29)
let vociNuovoOrdine = [];
let offertaNuovoOrdine = null;
let ordineStatoInModifica = null;

// ── Disponibilità di sql/30 ─────────────────────────────────────────
async function verificaOrdiniFornitoriDisponibili() {
  if (ordiniFornitoriDisponibili !== null) return ordiniFornitoriDisponibili;
  if (!(await verificaCommesseDisponibili())) return false;

  const { error } = await db
    .from('ordini_fornitori')
    .select('id')
    .limit(1);

  if (!error) {
    ordiniFornitoriDisponibili = true;
  } else if (error.code === 'PGRST205' || error.code === '42P01' || /ordini_fornitori/i.test(error.message || '')) {
    ordiniFornitoriDisponibili = false;
  } else {
    return false;
  }

  return ordiniFornitoriDisponibili;
}

// ── Chi può fare cosa (le stesse regole le impone il database) ──────
function puoCreareOrdiniFornitori(commessa) {
  return RUOLI_CREANO_ORDINI.includes(ROLE) && (ROLE === 'titolare' || commessaAperta(commessa));
}

function puoConfermareOrdineFornitore(commessa, ordine) {
  return ordine.stato === 'ordinato' && puoCreareOrdiniFornitori(commessa);
}

function puoSegnareArrivoOrdineFornitore(commessa, ordine) {
  return ordine.stato === 'confermato' &&
    RUOLI_ARRIVO_ORDINI.includes(ROLE) &&
    (ROLE === 'titolare' || commessaAperta(commessa));
}

function puoAnnullareOrdineFornitore(commessa, ordine) {
  return ['ordinato', 'confermato'].includes(ordine.stato) && puoCreareOrdiniFornitori(commessa);
}

// ── Piccoli aiuti ───────────────────────────────────────────────────
function dataOggiOrdine() {
  const oggi = new Date();
  return new Date(oggi.getTime() - oggi.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function quantitaLeggibileOrdine(valore) {
  return numeroPreventivo(valore).toLocaleString('it-IT', { maximumFractionDigits: 3 });
}

function tipologiaLeggibileOrdine(tipologia) {
  return String(tipologia || '').replace(/_/g, ' ').trim();
}

function classeStatoOrdineFornitore(stato) {
  if (stato === 'arrivato') return 'bok';
  if (stato === 'annullato') return 'berr';
  if (stato === 'confermato') return 'bblue';
  return 'bwarn';
}

function badgeStatoOrdineFornitore(stato) {
  return `<span class="bx ${classeStatoOrdineFornitore(stato)}">${esc(ETICHETTE_STATO_ORDINE_FORNITORE[stato] || stato || '—')}</span>`;
}

function totaleVociOrdine(voci) {
  return (voci || []).reduce(function(totale, voce) {
    return totale + Math.round(numeroPreventivo(voce.quantita) * numeroPreventivo(voce.prezzo_unitario) * 100) / 100;
  }, 0);
}

// ── Box nella scheda della commessa (chiamata da js/26) ─────────────
async function caricaOrdiniCommessa(commessa) {
  const box = ge('cmd-ordini');
  if (!box || !commessa) return;

  commessaOrdiniAperta = commessa;
  ordiniCommessaAperta = [];
  offerteCommessaAperta = [];
  offerteCommessaLette = false;

  // La cartella documenti (sql/29) serve per salvare il PDF: verifica in cache.
  await verificaDocumentiCommessaDisponibili();

  if (!(await verificaOrdiniFornitoriDisponibili())) {
    box.innerHTML = `
      <div class="card">
        <div style="font-size:14px;font-weight:700;margin-bottom:8px">🛒 Ordini ai fornitori</div>
        <div class="al2 i" style="margin:0">Gli ordini ai fornitori non sono ancora attivi.</div>
      </div>
    `;
    return;
  }

  box.innerHTML = '<div class="card"><div class="load">Caricamento ordini...</div></div>';

  const richieste = [
    db
      .from('ordini_fornitori')
      .select('*, ordini_fornitori_voci(id, posizione, descrizione, unita_misura, quantita, prezzo_unitario)')
      .eq('commessa_id', commessa.id)
      .order('numero', { ascending: true })
  ];
  const vedeOfferte = RUOLI_CREANO_ORDINI.includes(ROLE);
  if (vedeOfferte) {
    richieste.push(db.rpc('offerte_ordinabili_commessa', { p_commessa_id: commessa.id }));
  }

  const [ordiniRes, offerteRes] = await Promise.all(richieste);

  if (commessaApertaId && commessaApertaId !== commessa.id) return; // aperta un'altra commessa

  if (ordiniRes.error) {
    box.innerHTML = `<div class="card"><div class="al2 e">Errore caricamento ordini: ${esc(ordiniRes.error.message)}</div></div>`;
    return;
  }

  ordiniCommessaAperta = (ordiniRes.data || []).map(function(o) {
    o.ordini_fornitori_voci = (o.ordini_fornitori_voci || []).sort(function(a, b) { return a.posizione - b.posizione; });
    return o;
  });

  let erroreOfferte = '';
  if (offerteRes) {
    if (offerteRes.error) erroreOfferte = offerteRes.error.message || 'errore sconosciuto';
    else {
      offerteCommessaAperta = Array.isArray(offerteRes.data) ? offerteRes.data : [];
      offerteCommessaLette = true;
    }
  }

  box.innerHTML = `
    <div class="card">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">🛒 Ordini ai fornitori (${ordiniCommessaAperta.filter(function(o) { return o.stato !== 'annullato'; }).length})</div>
      <div style="font-size:12px;color:var(--m);margin-bottom:10px">
        Passo 7: si ordina dalle offerte dei fornitori scelte nel preventivo, con la data di arrivo prevista.
      </div>
      ${vedeOfferte ? htmlOfferteDaOrdinare(commessa, erroreOfferte) : ''}
      ${htmlElencoOrdiniCommessa(commessa)}
    </div>
  `;
}

function htmlOfferteDaOrdinare(commessa, erroreOfferte) {
  if (erroreOfferte) {
    return `<div class="al2 e">Errore caricamento offerte: ${esc(erroreOfferte)}</div>`;
  }

  if (!offerteCommessaAperta.length) {
    return `
      <div class="al2 i">
        Nel preventivo non ci sono offerte di fornitori selezionate: gli ordini nascono
        dalle offerte scelte dal commerciale nella scheda del preventivo (tab Fornitori).
      </div>
    `;
  }

  const daOrdinare = offerteCommessaAperta.filter(function(o) { return !o.ordine; });
  const puoCreare = puoCreareOrdiniFornitori(commessa);

  let suggerimento = '';
  if (!daOrdinare.length && commessa.stato === 'approvata' && statiCommessaDisponibili === true &&
      (ROLE === 'rappresentante' || ROLE === 'titolare')) {
    suggerimento = `
      <div class="al2 ok" style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
        <span>Tutte le offerte selezionate sono ordinate. Quando hai comunicato le date di arrivo e girato la
        documentazione al capo tecnico, segna la commessa <b>Materiali ordinati</b>.</span>
        <button class="btn sm p" onclick="apriStatoCommessa('${esc(commessa.id)}', '${esc(commessa.preventivo_id || '')}')">Segna Materiali ordinati</button>
      </div>
    `;
  }

  return `
    ${suggerimento}
    <div style="font-size:13px;font-weight:700;margin:6px 0 4px">Offerte selezionate nel preventivo</div>
    ${offerteCommessaAperta.map(function(o) {
      const tipologia = tipologiaLeggibileOrdine(o.tipologia);
      const dettagli = [
        tipologia,
        o.prezzo_offerto != null ? 'offerta ' + euroPreventivo(o.prezzo_offerto) + ' IVA esclusa' : '',
        o.tempi_consegna_proposti ? 'consegna proposta: ' + o.tempi_consegna_proposti : ''
      ].filter(Boolean).join(' · ');
      const allegati = (o.allegati || []).map(function(a) {
        return ['titolare', 'commerciale'].includes(ROLE)
          ? `<button class="btn sm" style="margin:4px 4px 0 0" data-path="${esc(a.storage_path)}" onclick="apriAllegatoPreventivoFornitore(this.dataset.path)">📎 ${esc(a.nome_file)}</button>`
          : `<span style="font-size:11px;color:var(--m);margin-right:6px">📎 ${esc(a.nome_file)}</span>`;
      }).join('');

      return `
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bo)">
          <div style="min-width:0;flex:1">
            <div style="font-weight:700">🏭 ${esc(o.ragione_sociale || 'Fornitore')}</div>
            ${dettagli ? `<div style="font-size:12px;color:var(--m)">${esc(dettagli)}</div>` : ''}
            ${allegati ? `<div>${allegati}</div>` : ''}
          </div>
          <div>
            ${o.ordine
              ? `<span style="font-size:12px">Ordine <b>${esc(o.ordine.codice)}</b> ${badgeStatoOrdineFornitore(o.ordine.stato)}</span>`
              : (puoCreare
                ? `<button class="btn sm p" onclick="apriNuovoOrdineFornitore('${esc(o.id)}')">🛒 Crea ordine</button>`
                : '<span style="font-size:12px;color:var(--a)">da ordinare</span>')}
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function htmlElencoOrdiniCommessa(commessa) {
  if (!ordiniCommessaAperta.length) {
    return '<div class="empty" style="margin-top:10px">Nessun ordine ai fornitori per questa commessa.</div>';
  }

  const salvaInCartella = documentiCommessaDisponibili === true && puoCaricareDocumentiCommessa(commessa);
  const oggi = dataOggiOrdine();

  return `
    <div style="font-size:13px;font-weight:700;margin:12px 0 4px">Ordini</div>
    ${ordiniCommessaAperta.map(function(o) {
      const inRitardo = ['ordinato', 'confermato'].includes(o.stato) && o.arrivo_previsto && o.arrivo_previsto < oggi;
      const arrivo = o.stato === 'arrivato'
        ? 'arrivato il ' + fd(o.data_arrivo)
        : 'arrivo previsto ' + fd(o.arrivo_previsto);
      const bottoni = [
        `<button class="btn sm" onclick="scaricaPdfOrdineFornitore('${esc(o.id)}')">📄 PDF</button>`
      ];
      if (salvaInCartella && o.stato !== 'annullato') {
        bottoni.push(`<button class="btn sm" title="Salva il PDF nella cartella Ordini della commessa" onclick="salvaPdfOrdineInCartella('${esc(o.id)}', this)">💾 Nella cartella</button>`);
      }
      if (puoConfermareOrdineFornitore(commessa, o)) {
        bottoni.push(`<button class="btn sm p" onclick="apriStatoOrdineFornitore('${esc(o.id)}', 'confermato')">✔️ Confermato dal fornitore</button>`);
      }
      if (puoSegnareArrivoOrdineFornitore(commessa, o)) {
        bottoni.push(`<button class="btn sm p" onclick="apriStatoOrdineFornitore('${esc(o.id)}', 'arrivato')">📦 Arrivato</button>`);
      }
      if (puoAnnullareOrdineFornitore(commessa, o)) {
        bottoni.push(`<button class="btn sm" style="color:var(--r)" onclick="apriStatoOrdineFornitore('${esc(o.id)}', 'annullato')">Annulla</button>`);
      }

      return `
        <div style="padding:8px 0;border-bottom:1px solid var(--bo)${o.stato === 'annullato' ? ';opacity:.65' : ''}">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
            <div style="min-width:0;flex:1">
              <div style="font-weight:700">${esc(o.codice)} · ${esc(o.fornitore_ragione_sociale)} ${badgeStatoOrdineFornitore(o.stato)}</div>
              <div style="font-size:12px;color:var(--m)">
                ${esc(euroPreventivo(o.importo))} IVA esclusa · ordinato il ${esc(fd(o.data_ordine))} ·
                <span style="${inRitardo ? 'color:var(--r);font-weight:700' : ''}">${esc(arrivo)}${inRitardo ? ' (in ritardo)' : ''}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${bottoni.join('')}</div>
          </div>
          <details style="margin-top:4px">
            <summary style="font-size:12px;cursor:pointer;color:var(--m)">Voci (${o.ordini_fornitori_voci.length}) e passaggi</summary>
            ${htmlDettaglioOrdineFornitore(o)}
          </details>
        </div>
      `;
    }).join('')}
  `;
}

function htmlDettaglioOrdineFornitore(o) {
  const passaggi = [];
  passaggi.push('Ordinato il ' + fd(o.data_ordine) + (o.creato_da_nome ? ' da ' + o.creato_da_nome + (o.creato_da_ruolo ? ' (' + etichettaRuolo(o.creato_da_ruolo) + ')' : '') : ''));
  if (o.confermato_il) {
    passaggi.push('Confermato dal fornitore (registrato il ' + dataOraEsitoPreventivo(o.confermato_il) +
      (o.confermato_da_nome ? ' da ' + o.confermato_da_nome : '') + ')' + (o.nota_conferma ? ': ' + o.nota_conferma : ''));
  }
  if (o.data_arrivo) {
    passaggi.push('Arrivato il ' + fd(o.data_arrivo) + (o.arrivo_registrato_da_nome ? ' (segnato da ' + o.arrivo_registrato_da_nome + ')' : '') +
      (o.nota_arrivo ? ': ' + o.nota_arrivo : ''));
  }
  if (o.annullato_il) {
    passaggi.push('Annullato il ' + dataOraEsitoPreventivo(o.annullato_il) + (o.annullato_da_nome ? ' da ' + o.annullato_da_nome : '') +
      ': ' + (o.motivo_annullamento || ''));
  }

  return `
    <div class="tw" style="margin:6px 0">
      <table>
        <thead><tr><th>Descrizione</th><th>Q.tà</th><th>U.M.</th><th>Prezzo unit.</th><th>Totale</th></tr></thead>
        <tbody>
          ${o.ordini_fornitori_voci.map(function(voce) {
            return `
              <tr>
                <td>${esc(voce.descrizione)}</td>
                <td style="text-align:right">${esc(quantitaLeggibileOrdine(voce.quantita))}</td>
                <td>${esc(voce.unita_misura)}</td>
                <td style="text-align:right;white-space:nowrap">${esc(euroPreventivo(voce.prezzo_unitario))}</td>
                <td style="text-align:right;white-space:nowrap">${esc(euroPreventivo(numeroPreventivo(voce.quantita) * numeroPreventivo(voce.prezzo_unitario)))}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${o.luogo_consegna ? `<div style="font-size:12px">Consegna presso: <b>${esc(o.luogo_consegna)}</b></div>` : ''}
    ${o.note ? `<div style="font-size:12px">Note per il fornitore: ${esc(o.note)}</div>` : ''}
    <div style="font-size:12px;color:var(--m);margin-top:4px">
      ${passaggi.map(function(p) { return '<div>• ' + esc(p) + '</div>'; }).join('')}
    </div>
  `;
}

// ── Nuovo ordine da un'offerta ──────────────────────────────────────
function apriNuovoOrdineFornitore(offertaId) {
  const offerta = offerteCommessaAperta.find(function(o) { return o.id === offertaId; });
  const commessa = commessaOrdiniAperta;

  if (!offerta || !commessa) {
    toast('Offerta non trovata: ricarica la pagina', 'err');
    return;
  }
  if (offerta.ordine) {
    toast('Per questa offerta c\'è già l\'ordine ' + offerta.ordine.codice, 'err');
    return;
  }

  offertaNuovoOrdine = offerta;

  vociNuovoOrdine = (offerta.voci || []).map(function(voce) {
    return {
      descrizione: voce.descrizione || '',
      unita_misura: voce.unita_misura || 'pz',
      quantita: numeroPreventivo(voce.quantita) || 1,
      prezzo_unitario: numeroPreventivo(voce.costo_unitario),
      preventivo_voce_id: voce.id || null
    };
  });

  if (!vociNuovoOrdine.length) {
    const tipologia = tipologiaLeggibileOrdine(offerta.tipologia);
    vociNuovoOrdine.push({
      descrizione: 'Fornitura' + (tipologia ? ' ' + tipologia : '') + ' come da Vostra offerta',
      unita_misura: 'corpo',
      quantita: 1,
      prezzo_unitario: numeroPreventivo(offerta.prezzo_offerto),
      preventivo_voce_id: null
    });
  }

  ge('mof-titolo').textContent = '🛒 Ordine a ' + (offerta.ragione_sociale || 'fornitore');
  ge('mof-sottotitolo').textContent = 'Commessa ' + commessa.codice + (commessa.titolo ? ' · ' + commessa.titolo : '');
  ge('mof-fornitore').innerHTML = [
    offerta.referente ? 'Referente: <b>' + esc(offerta.referente) + '</b>' : '',
    offerta.email ? 'Email: ' + esc(offerta.email) : '',
    offerta.telefono ? 'Tel.: ' + esc(offerta.telefono) : '',
    offerta.prezzo_offerto != null ? 'Offerta: <b>' + esc(euroPreventivo(offerta.prezzo_offerto)) + '</b> IVA esclusa' : '',
    offerta.tempi_consegna_proposti ? 'Consegna proposta: ' + esc(offerta.tempi_consegna_proposti) : ''
  ].filter(Boolean).join(' · ') || 'Nessun recapito del fornitore in anagrafica.';

  ge('mof-data-ordine').value = dataOggiOrdine();
  ge('mof-arrivo').value = '';
  ge('mof-arrivo').min = dataOggiOrdine();
  ge('mof-luogo').value = testoSedeCommessa(commessa.sedi_cliente) ? 'Cantiere: ' + testoSedeCommessa(commessa.sedi_cliente) : '';
  ge('mof-note').value = 'Riferimento da indicare su conferma d\'ordine, DDT e fattura: commessa ' + commessa.codice + '.';

  const salva = ge('mof-salva-cartella-riga');
  const puoSalvare = documentiCommessaDisponibili === true && puoCaricareDocumentiCommessa(commessa);
  if (salva) salva.style.display = puoSalvare ? '' : 'none';
  if (ge('mof-salva-cartella')) ge('mof-salva-cartella').checked = puoSalvare;

  const bottone = ge('mof-conferma');
  if (bottone) { bottone.disabled = false; bottone.textContent = '🛒 Crea ordine e PDF'; }

  renderVociNuovoOrdine();
  openM('m-ordine-fornitore');
}

function renderVociNuovoOrdine() {
  const box = ge('mof-voci');
  if (!box) return;

  box.innerHTML = `
    <div class="tw">
      <table>
        <thead><tr><th>Descrizione *</th><th style="width:70px">U.M.</th><th style="width:80px">Q.tà *</th><th style="width:100px">Prezzo unit. €</th><th style="width:90px">Totale</th><th style="width:36px"></th></tr></thead>
        <tbody>
          ${vociNuovoOrdine.map(function(voce, i) {
            return `
              <tr>
                <td><input type="text" value="${esc(voce.descrizione)}" oninput="aggiornaVoceNuovoOrdine(${i}, 'descrizione', this.value)"></td>
                <td><input type="text" value="${esc(voce.unita_misura)}" oninput="aggiornaVoceNuovoOrdine(${i}, 'unita_misura', this.value)"></td>
                <td><input type="number" min="0" step="any" value="${esc(voce.quantita)}" oninput="aggiornaVoceNuovoOrdine(${i}, 'quantita', this.value)"></td>
                <td><input type="number" min="0" step="0.01" value="${esc(voce.prezzo_unitario)}" oninput="aggiornaVoceNuovoOrdine(${i}, 'prezzo_unitario', this.value)"></td>
                <td style="text-align:right;white-space:nowrap" id="mof-voce-totale-${i}">${esc(euroPreventivo(numeroPreventivo(voce.quantita) * numeroPreventivo(voce.prezzo_unitario)))}</td>
                <td><button class="btn sm" title="Togli la voce" onclick="togliVoceNuovoOrdine(${i})">✕</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">
      <button class="btn sm" onclick="aggiungiVoceNuovoOrdine()">+ Aggiungi voce</button>
      <div style="font-size:14px">Totale ordine (IVA esclusa): <b id="mof-totale">${esc(euroPreventivo(totaleVociOrdine(vociNuovoOrdine)))}</b></div>
    </div>
  `;
}

function aggiornaVoceNuovoOrdine(indice, campo, valore) {
  const voce = vociNuovoOrdine[indice];
  if (!voce) return;
  voce[campo] = valore;

  const cella = ge('mof-voce-totale-' + indice);
  if (cella) cella.textContent = euroPreventivo(numeroPreventivo(voce.quantita) * numeroPreventivo(voce.prezzo_unitario));
  const totale = ge('mof-totale');
  if (totale) totale.textContent = euroPreventivo(totaleVociOrdine(vociNuovoOrdine));
}

function aggiungiVoceNuovoOrdine() {
  vociNuovoOrdine.push({ descrizione: '', unita_misura: 'pz', quantita: 1, prezzo_unitario: 0, preventivo_voce_id: null });
  renderVociNuovoOrdine();
}

function togliVoceNuovoOrdine(indice) {
  if (vociNuovoOrdine.length <= 1) {
    toast('L\'ordine deve avere almeno una voce', 'err');
    return;
  }
  vociNuovoOrdine.splice(indice, 1);
  renderVociNuovoOrdine();
}

async function salvaNuovoOrdineFornitore() {
  const commessa = commessaOrdiniAperta;
  const offerta = offertaNuovoOrdine;
  if (!commessa || !offerta) return;

  const dataOrdine = v('mof-data-ordine');
  const arrivo = v('mof-arrivo');

  if (!dataOrdine) { toast('Indica la data dell\'ordine', 'err'); return; }
  if (!arrivo) { toast('Indica la data di arrivo prevista', 'err'); return; }
  if (arrivo < dataOrdine) { toast('L\'arrivo previsto non può essere prima della data dell\'ordine', 'err'); return; }

  const voci = [];
  for (let i = 0; i < vociNuovoOrdine.length; i++) {
    const voce = vociNuovoOrdine[i];
    const descrizione = String(voce.descrizione || '').trim();
    const quantita = Number(voce.quantita);
    const prezzo = Number(voce.prezzo_unitario === '' ? NaN : voce.prezzo_unitario);

    if (!descrizione) { toast('Voce ' + (i + 1) + ': manca la descrizione', 'err'); return; }
    if (!Number.isFinite(quantita) || quantita <= 0) { toast('Voce ' + (i + 1) + ': la quantità deve essere maggiore di zero', 'err'); return; }
    if (!Number.isFinite(prezzo) || prezzo < 0) { toast('Voce ' + (i + 1) + ': prezzo unitario non valido', 'err'); return; }

    voci.push({
      descrizione: descrizione,
      unita_misura: String(voce.unita_misura || '').trim() || 'pz',
      quantita: Math.round(quantita * 1000) / 1000,
      prezzo_unitario: Math.round(prezzo * 100) / 100,
      preventivo_voce_id: voce.preventivo_voce_id || null
    });
  }

  if (!voci.length) { toast('L\'ordine deve avere almeno una voce', 'err'); return; }

  const bottone = ge('mof-conferma');
  if (bottone) { bottone.disabled = true; bottone.textContent = '⏳ Creazione...'; }

  const { data: ordineId, error } = await db.rpc('crea_ordine_fornitore', {
    p_commessa_id: commessa.id,
    p_preventivo_fornitore_id: offerta.id,
    p_data_ordine: dataOrdine,
    p_arrivo_previsto: arrivo,
    p_voci: voci,
    p_luogo_consegna: v('mof-luogo').trim() || null,
    p_note: v('mof-note').trim() || null
  });

  if (error || !ordineId) {
    if (bottone) { bottone.disabled = false; bottone.textContent = '🛒 Crea ordine e PDF'; }
    toast('Ordine non creato: ' + (error?.message || 'errore sconosciuto'), 'err');
    return;
  }

  const salvaInCartella = !!ge('mof-salva-cartella')?.checked &&
    documentiCommessaDisponibili === true && puoCaricareDocumentiCommessa(commessa);

  closeM('m-ordine-fornitore');

  const pdf = await creaPdfOrdineFornitore(ordineId);
  if (!pdf) {
    toast('Ordine creato, ma il PDF non è stato generato: usa il bottone 📄 PDF dell\'ordine', 'err');
  } else {
    pdf.doc.save(pdf.nomeFile);
    if (!salvaInCartella) {
      toast('Ordine creato: PDF scaricato', 'ok');
    } else if (await registraPdfOrdineInCartella(commessa.id, pdf)) {
      toast('Ordine creato: PDF scaricato e salvato nella cartella Ordini', 'ok');
    }
    // se il salvataggio non riesce il messaggio d'errore lo mostra registraPdfOrdineInCartella
  }

  if (commessaApertaId === commessa.id) await caricaSchedaCommessa(commessa.id);
}

// ── Cambio di stato dell'ordine ─────────────────────────────────────
function apriStatoOrdineFornitore(ordineId, stato) {
  const ordine = ordiniCommessaAperta.find(function(o) { return o.id === ordineId; });
  if (!ordine) {
    toast('Ordine non trovato: ricarica la pagina', 'err');
    return;
  }

  ordineStatoInModifica = { id: ordineId, stato: stato };

  const testi = {
    confermato: {
      titolo: '✔️ Conferma del fornitore',
      data: 'Arrivo confermato dal fornitore (lascia la data se non cambia)',
      nota: 'Nota (facoltativa, es. numero della conferma d\'ordine)',
      bottone: '✔️ Segna confermato'
    },
    arrivato: {
      titolo: '📦 Materiale arrivato',
      data: 'Data di arrivo *',
      nota: 'Nota (facoltativa, es. numero del DDT, mancanze)',
      bottone: '📦 Segna arrivato'
    },
    annullato: {
      titolo: 'Annulla l\'ordine',
      data: '',
      nota: 'Motivo dell\'annullamento *',
      bottone: 'Annulla l\'ordine'
    }
  }[stato];

  if (!testi) return;

  ge('mso-titolo').textContent = testi.titolo;
  ge('mso-sottotitolo').textContent = ordine.codice + ' · ' + ordine.fornitore_ragione_sociale + ' · ' + euroPreventivo(ordine.importo) + ' IVA esclusa';
  ge('mso-data-riga').style.display = testi.data ? '' : 'none';
  ge('mso-data-etichetta').textContent = testi.data;
  ge('mso-data').min = ordine.data_ordine || '';
  ge('mso-data').max = stato === 'arrivato' ? dataOggiOrdine() : '';
  ge('mso-data').value = stato === 'arrivato' ? dataOggiOrdine() : (ordine.arrivo_previsto || '');
  ge('mso-nota-etichetta').textContent = testi.nota;
  ge('mso-nota').value = '';
  ge('mso-avviso').innerHTML = stato === 'annullato'
    ? '<div class="al2 w">L\'ordine resta nell\'elenco come annullato e non si può riattivare. Se serve, si rifà un ordine nuovo dalla stessa offerta. Avvisa il fornitore.</div>'
    : '';

  const bottone = ge('mso-conferma');
  bottone.textContent = testi.bottone;
  bottone.disabled = false;

  openM('m-stato-ordine-fornitore');
}

async function salvaStatoOrdineFornitore() {
  const modifica = ordineStatoInModifica;
  if (!modifica) return;

  const nota = v('mso-nota').trim();
  const data = v('mso-data');

  if (modifica.stato === 'annullato' && !nota) { toast('Scrivi il motivo dell\'annullamento', 'err'); return; }
  if (modifica.stato === 'arrivato' && !data) { toast('Indica la data di arrivo', 'err'); return; }

  const bottone = ge('mso-conferma');
  bottone.disabled = true;

  const { error } = await db.rpc('cambia_stato_ordine_fornitore', {
    p_ordine_id: modifica.id,
    p_stato: modifica.stato,
    p_data: modifica.stato === 'annullato' ? null : (data || null),
    p_nota: nota || null
  });

  if (error) {
    bottone.disabled = false;
    toast('Stato non salvato: ' + (error.message || 'errore sconosciuto'), 'err');
    return;
  }

  closeM('m-stato-ordine-fornitore');
  ordineStatoInModifica = null;
  toast('Ordine: ' + ETICHETTE_STATO_ORDINE_FORNITORE[modifica.stato], 'ok');
  if (commessaApertaId) await caricaSchedaCommessa(commessaApertaId);
}

// ── PDF dell'ordine ─────────────────────────────────────────────────
// Rilegge ordine e commessa dal database e restituisce { doc, nomeFile,
// ordine } (null se qualcosa non va: il messaggio lo mostra lei).
async function creaPdfOrdineFornitore(ordineId) {
  if (!(await preparaPDF())) return null;

  const { data: ordine, error } = await db
    .from('ordini_fornitori')
    .select('*, ordini_fornitori_voci(posizione, descrizione, unita_misura, quantita, prezzo_unitario), commesse(codice)')
    .eq('id', ordineId)
    .maybeSingle();

  if (error || !ordine) {
    toast('Ordine non trovato per il PDF' + (error ? ': ' + error.message : ''), 'err');
    return null;
  }

  const voci = (ordine.ordini_fornitori_voci || []).sort(function(a, b) { return a.posizione - b.posizione; });

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margine = 16;
  const larghezza = 210;
  const destra = larghezza - margine;

  // Intestazione (come richiesta di quotazione e preventivo)
  doc.setFillColor(8, 80, 65);
  doc.rect(0, 0, larghezza, 34, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('TOLI FIRE', margine, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Via Bellatalla 62, Ospedaletto — 56121 Pisa', margine, 23);
  doc.text('P.IVA: 02490980501 — amministrazione@toli-fire.com', margine, 28);
  doc.setFontSize(10);
  doc.text('Ordine di acquisto', destra, 16, { align: 'right' });

  let y = 46;
  doc.setTextColor(25, 25, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('ORDINE N. ' + ordine.codice, margine, y);
  doc.setFontSize(10);
  doc.text('Data: ' + fd(ordine.data_ordine), destra, y, { align: 'right' });

  if (ordine.stato === 'annullato') {
    doc.setTextColor(200, 30, 30);
    doc.setFontSize(13);
    doc.text('ORDINE ANNULLATO', destra, y + 7, { align: 'right' });
    doc.setTextColor(25, 25, 25);
  }

  // Fornitore (sinistra) e riferimenti (destra)
  y += 12;
  const colonnaDestra = 118;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Spett.le fornitore', margine, y);
  doc.text('Riferimenti', colonnaDestra, y);

  doc.setFont('helvetica', 'normal');
  const righeFornitore = [
    ordine.fornitore_ragione_sociale,
    ordine.fornitore_indirizzo,
    ordine.fornitore_referente ? 'Alla c.a. ' + ordine.fornitore_referente : '',
    ordine.fornitore_email ? 'Email: ' + ordine.fornitore_email : '',
    ordine.fornitore_telefono ? 'Tel.: ' + ordine.fornitore_telefono : ''
  ].filter(Boolean);
  const righeRiferimenti = [
    'Commessa: ' + (ordine.commesse?.codice || ''),
    ordine.tipologia ? 'Vs. offerta: ' + tipologiaLeggibileOrdine(ordine.tipologia) : 'Come da Vs. offerta',
    'Consegna richiesta entro: ' + fd(ordine.arrivo_previsto)
  ];

  let yS = y + 6;
  righeFornitore.forEach(function(riga) {
    const pezzi = doc.splitTextToSize(String(riga), colonnaDestra - margine - 6);
    doc.text(pezzi, margine, yS);
    yS += pezzi.length * 5;
  });
  let yD = y + 6;
  righeRiferimenti.forEach(function(riga) {
    const pezzi = doc.splitTextToSize(String(riga), destra - colonnaDestra);
    doc.text(pezzi, colonnaDestra, yD);
    yD += pezzi.length * 5;
  });
  y = Math.max(yS, yD) + 3;

  if (ordine.luogo_consegna) {
    doc.setFont('helvetica', 'bold');
    doc.text('Luogo di consegna:', margine, y);
    doc.setFont('helvetica', 'normal');
    const pezzi = doc.splitTextToSize(ordine.luogo_consegna, destra - margine - 36);
    doc.text(pezzi, margine + 36, y);
    y += pezzi.length * 5 + 2;
  }

  doc.autoTable({
    startY: y + 2,
    margin: { top: 18, right: margine, bottom: 30, left: margine },
    head: [['Descrizione', 'Q.tà', 'U.M.', 'Prezzo unit.', 'Totale']],
    body: voci.map(function(voce) {
      const quantita = numeroPreventivo(voce.quantita);
      const prezzo = numeroPreventivo(voce.prezzo_unitario);
      return [
        voce.descrizione || '—',
        quantitaLeggibileOrdine(quantita),
        voce.unita_misura || 'pz',
        euroPreventivo(prezzo),
        euroPreventivo(quantita * prezzo)
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: [8, 80, 65], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 82 },
      1: { halign: 'right', cellWidth: 18 },
      2: { cellWidth: 16 },
      3: { halign: 'right', cellWidth: 31 },
      4: { halign: 'right', cellWidth: 31 }
    }
  });

  y = doc.lastAutoTable.finalY + 10;
  if (y > 250) { doc.addPage(); y = 20; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Totale ordine (IVA esclusa): ' + euroPreventivo(ordine.importo), destra, y, { align: 'right' });
  y += 10;

  doc.setFontSize(9);
  if (ordine.note) {
    doc.setFont('helvetica', 'bold');
    doc.text('Note', margine, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const pezzi = doc.splitTextToSize(ordine.note, destra - margine);
    if (y + pezzi.length * 4.5 > 275) { doc.addPage(); y = 20; }
    doc.text(pezzi, margine, y);
    y += pezzi.length * 4.5 + 4;
  }

  const chiusura = doc.splitTextToSize(
    'Vi preghiamo di confermare l\'ordine e la data di consegna rispondendo a questa comunicazione, ' +
    'indicando il numero d\'ordine ' + ordine.codice + ' sulla conferma, sui documenti di trasporto e sulla fattura.',
    destra - margine
  );
  if (y + chiusura.length * 4.5 + 16 > 280) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'normal');
  doc.text(chiusura, margine, y);
  y += chiusura.length * 4.5 + 8;

  doc.text('Per TOLI FIRE' + (ordine.creato_da_nome ? ': ' + ordine.creato_da_nome : ''), margine, y);

  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Ordine ' + ordine.codice + ' — pagina ' + p + ' di ' + pagine, destra, 290, { align: 'right' });
  }

  const nomeFile = 'Ordine_' + String(ordine.codice).replace(/[^0-9A-Za-z]+/g, '-') + '_' +
    nomeFileSicuroCommessa(ordine.fornitore_ragione_sociale).slice(0, 40) + '.pdf';

  return { doc: doc, nomeFile: nomeFile, ordine: ordine };
}

async function scaricaPdfOrdineFornitore(ordineId) {
  const pdf = await creaPdfOrdineFornitore(ordineId);
  if (pdf) pdf.doc.save(pdf.nomeFile);
}

// Carica il PDF nella cartella "ordini" (bucket commesse-documenti) e lo
// registra con la funzione di sql/29. true se tutto è andato bene.
async function registraPdfOrdineInCartella(commessaId, pdf) {
  const path = commessaId + '/ordini/' + Date.now() + '_' + pdf.nomeFile;
  const blob = pdf.doc.output('blob');

  const caricamento = await db.storage
    .from('commesse-documenti')
    .upload(path, blob, { upsert: false, contentType: 'application/pdf' });

  if (caricamento.error) {
    toast('PDF non salvato nella cartella: ' + caricamento.error.message, 'err');
    return false;
  }

  const { error } = await db.rpc('registra_documento_commessa', {
    p_commessa_id: commessaId,
    p_cartella: 'ordini',
    p_storage_path: path,
    p_nome_file: pdf.nomeFile,
    p_nota: 'Ordine ' + pdf.ordine.codice + ' a ' + pdf.ordine.fornitore_ragione_sociale
  });

  if (error) {
    await db.storage.from('commesse-documenti').remove([path]);
    toast('PDF non salvato nella cartella: ' + error.message, 'err');
    return false;
  }

  return true;
}

async function salvaPdfOrdineInCartella(ordineId, bottone) {
  const commessa = commessaOrdiniAperta;
  if (!commessa) return;

  if (bottone) bottone.disabled = true;
  const pdf = await creaPdfOrdineFornitore(ordineId);
  if (!pdf) { if (bottone) bottone.disabled = false; return; }

  const salvato = await registraPdfOrdineInCartella(commessa.id, pdf);
  if (bottone) bottone.disabled = false;
  if (!salvato) return;

  toast('PDF salvato nella cartella Ordini della commessa', 'ok');
  if (commessaApertaId === commessa.id) await caricaSchedaCommessa(commessa.id);
}
