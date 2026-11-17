// js/18b-fornitori-preventivo.js — fornitori e offerte nel preventivo.
// Riordino del 17/11: era una parte di js/18-preventivi.js (righe 3652-4722),
// spostata così com'era. Si carica subito dopo il pezzo precedente (index.html).

async function renderFornitoriPreventivo() {
  ricordaPosizionePagina();
  const box = ge('pvd-fornitori-content');

  if (!box || !currentPreventivoId) return;

  box.innerHTML = '<div class="load">Caricamento fornitori...</div>';

  const { data, error } = await db
    .from('preventivi_fornitori')
    .select(`
      id,
      tipologia,
      stato,
      prezzo_offerto,
      tempi_consegna_proposti,
      note,
      allegati_progetto_ids,
      richiesta_versione,
      richiesta_pdf_generato_il,
      richiesta_inviata_il,
      fornitori(
        ragione_sociale,
        telefono,
        email
      ),
      fornitore_tipologie(
        pronta_consegna,
        tempi_consegna,
        gestione_ordine,
        varieta_catalogo,
        tempi_preventivo
      )
    `)
    .eq('preventivo_id', currentPreventivoId)
    .neq('stato', 'scartato')
    .order('creato_il');

  if (error) {
    box.innerHTML =
      '<div class="al2 e">Errore caricamento fornitori: ' +
      esc(error.message) +
      '</div>';
    return;
  }

  const fornitori = data || [];

    const idsFornitori = fornitori.map(function(fornitore) {
    return fornitore.id;
  });

  const allegatiPerFornitore = {};

  if (idsFornitori.length) {
    const { data: allegatiRicevuti, error: erroreAllegatiRicevuti } = await db
      .from('preventivi_fornitori_allegati')
      .select('id,preventivo_fornitore_id,nome_file,storage_path,mime_type,dimensione,caricato_il')
      .in('preventivo_fornitore_id', idsFornitori)
      .order('caricato_il', { ascending: false });

    if (!erroreAllegatiRicevuti) {
      (allegatiRicevuti || []).forEach(function(allegato) {
        if (!allegatiPerFornitore[allegato.preventivo_fornitore_id]) {
          allegatiPerFornitore[allegato.preventivo_fornitore_id] = [];
        }

        allegatiPerFornitore[allegato.preventivo_fornitore_id].push(allegato);
      });
    }
  }

    const { data: preventivoAllegati } = await db
    .from('preventivi')
    .select('progetto_tecnico_id')
    .eq('id', currentPreventivoId)
    .single();

  let allegatiProgetto = [];

  if (preventivoAllegati?.progetto_tecnico_id) {
    const { data: fileProgetto, error: erroreFile } = await db
      .from('progetti_tecnici_allegati')
      .select('id,nome_file,mime_type,dimensione')
      .eq('progetto_id', preventivoAllegati.progetto_tecnico_id)
      .order('caricato_il', { ascending: false });

    if (!erroreFile) allegatiProgetto = fileProgetto || [];
  }

  // F16.11 (sql/100): stati "Il fornitore non quota" e "Offerta scaduta"
  await verificaStatiFornitore();

  box.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div>
          <div style="font-size:15px;font-weight:700">
            🏭 Fornitori del preventivo
          </div>

          <div style="font-size:12px;color:var(--m);margin-top:4px">
            Scegli e confronta fino a due fornitori.
          </div>
        </div>

        <span class="bx bblue">${fornitori.length} / 2</span>
      </div>

      <button
        class="btn sm p"
        style="margin-top:14px"
        ${fornitori.length >= 2 ? 'disabled' : ''}
        onclick="apriSelettoreFornitoriPreventivo()"
      >
        🏭 ${fornitori.length ? 'Aggiungi fornitore' : 'Seleziona fornitori'}
      </button>
    </div>

    ${!fornitori.length ? `
      <div class="empty" style="margin-top:12px">
        Nessun fornitore selezionato per questo preventivo.
      </div>
    ` : fornitori.map(function(s) {
      const f = s.fornitori || {};
const t = s.fornitore_tipologie || {};

const preventiviRicevuti = allegatiPerFornitore[s.id] || [];

const bloccoPreventivoRicevuto = `
  <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--b)">
    <div style="font-size:13px;font-weight:700">
      📩 Preventivo ricevuto dal fornitore
    </div>

    <div style="font-size:12px;color:var(--m);margin:4px 0 10px">
      Carica il PDF ricevuto via email e inserisci sopra importo e tempi proposti.
    </div>

    <input
      id="pvf-file-ricevuto-${s.id}"
      type="file"
      accept="application/pdf,.pdf"
      style="font-size:12px;max-width:100%"
    >

    <button
      class="btn sm p"
      style="margin:8px 0 4px"
      onclick="caricaPreventivoRicevutoFornitore('${s.id}')"
    >
      📎 Carica PDF ricevuto
    </button>

    ${
      !preventiviRicevuti.length
        ? `
          <div style="font-size:12px;color:var(--m);margin-top:6px">
            Nessun preventivo del fornitore caricato.
          </div>
        `
        : preventiviRicevuti.map(function(file) {
            return `
              <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px;font-size:12px">
                <span style="overflow-wrap:anywhere">
                  📄 ${esc(file.nome_file)}
                </span>

                <button
                  class="btn sm"
                  onclick="apriAllegatoPreventivoFornitore('${file.storage_path}')"
                >
                  Apri
                </button>
              </div>
            `;
          }).join('')
    }

    <button
  class="btn sm p"
  style="margin-top:12px"
  onclick="salvaAllegatiRichiestaFornitore('${s.id}')"
>
  Salva allegati selezionati
</button>

  </div>
`;

const allegatiSelezionati = Array.isArray(s.allegati_progetto_ids)
  ? s.allegati_progetto_ids
  : [];

const bloccoAllegati = !allegatiProgetto.length
  ? `
      <div style="font-size:12px;color:var(--m);margin-top:14px">
        Nessun allegato presente nel progetto tecnico.
      </div>
    `
  : `
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--b)">
        <div style="font-size:13px;font-weight:700">
          📎 Allegati da inserire nel PDF
        </div>

      <div style="
  display:flex;
  justify-content:space-between;
  gap:10px;
  align-items:center;
  margin:4px 0 10px
">
  <div style="font-size:12px;color:var(--m)">
    Seleziona solo foto e documenti che possono essere inviati al fornitore.
  </div>

  <button
    type="button"
    class="btn sm"
    onclick="selezionaTuttiAllegatiRichiesta('${s.id}')"
  >
    ☑ Seleziona tutti
  </button>
</div>

        ${allegatiProgetto.map(function(file) {
          const selezionato = allegatiSelezionati.includes(file.id);

          return `
            <label style="display:flex;gap:8px;align-items:center;padding:7px 0;font-size:12px">
              <input
                type="checkbox"
                data-allegato-richiesta="${s.id}"
                value="${file.id}"
                ${selezionato ? 'checked' : ''}
              >
              <span>
                📎 ${esc(file.nome_file)}
                <span style="color:var(--m)">
                  · ${esc(file.mime_type || 'File')}
                  · ${esc(dimensioneFileProgetto(file.dimensione))}
                </span>
              </span>
            </label>
          `;
        }).join('')}

          <button
    class="btn sm p"
    onclick="salvaDettagliFornitorePreventivo('${s.id}')"
  >
    Salva dati fornitore
  </button>

  <button
    class="btn sm info"
    onclick="generaRichiestaQuotazionePDF('${s.id}')"
  >
    📄 ${
      s.richiesta_versione > 0
        ? 'Rigenera PDF richiesta'
        : 'Genera PDF richiesta'
    }
  </button>

      </div>
    `;

      return `
        <div class="card" style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <div>
              <div style="font-size:15px;font-weight:700">
                ${esc(f.ragione_sociale || 'Fornitore')}
              </div>

              <div style="font-size:12px;color:var(--m);margin-top:4px">
                ${esc(s.tipologia || 'Tipologia non indicata')}
              </div>
            </div>

            <button
              class="btn sm"
              style="color:var(--r)"
              onclick="rimuoviFornitorePreventivo('${s.id}')"
            >
              Rimuovi
            </button>
          </div>

          <div class="g2" style="margin-top:14px">
            ${ir('Pronta consegna', t.pronta_consegna || '—')}
            ${ir('Tempi abituali', t.tempi_consegna || '—')}
            ${ir('Gestione ordine', t.gestione_ordine || '—')}
            ${ir('Risposta preventivi', t.tempi_preventivo || '—')}
          </div>

          <div class="fr" style="margin-top:14px">
            <div class="f">
              <label>Stato</label>
              <select id="pvf-stato-${s.id}">
                <option value="da_contattare" ${s.stato === 'da_contattare' ? 'selected' : ''}>Da contattare</option>
                <option value="richiesta_inviata" ${s.stato === 'richiesta_inviata' ? 'selected' : ''}>Richiesta inviata</option>
                <option value="risposta_ricevuta" ${s.stato === 'risposta_ricevuta' ? 'selected' : ''}>Risposta ricevuta</option>
                <option value="selezionato" ${s.stato === 'selezionato' ? 'selected' : ''}>Scelto per il preventivo</option>
                <option value="scartato" ${s.stato === 'scartato' ? 'selected' : ''}>Scartato</option>
                ${STATI_FORNITORE.stati_nuovi || s.stato === 'rifiutata' ? `<option value="rifiutata" ${s.stato === 'rifiutata' ? 'selected' : ''}>Il fornitore non quota</option>` : ''}
                ${STATI_FORNITORE.stati_nuovi || s.stato === 'scaduta' ? `<option value="scaduta" ${s.stato === 'scaduta' ? 'selected' : ''}>Offerta scaduta</option>` : ''}
              </select>
            </div>

            <div class="f">
              <label>Prezzo offerto (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                id="pvf-prezzo-${s.id}"
                value="${s.prezzo_offerto ?? ''}"
              >
            </div>
          </div>

          <div class="fr">
            <div class="f">
              <label>Tempi proposti</label>
              <input
                type="text"
                id="pvf-consegna-${s.id}"
                value="${esc(s.tempi_consegna_proposti || '')}"
                placeholder="Es. 10 giorni lavorativi"
              >
            </div>

            <div class="f">
              <label>Note della richiesta / modifiche commerciali</label>
              <input
                type="text"
                id="pvf-note-${s.id}"
                value="${esc(s.note || '')}"
                placeholder="Indicazioni aggiuntive, varianti, quantità o richieste per il fornitore..."
              >
            </div>
          </div>
${bloccoAllegati}
${bloccoPreventivoRicevuto}

         <div
  style="
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    align-items:center;
    margin-top:4px
  "
>
${
  (
    s.stato === 'risposta_ricevuta' ||
    s.stato === 'selezionato'
  ) && Number(s.prezzo_offerto) > 0
    ? `
      <button
        class="btn sm info"
        onclick="usaQuotazioneFornitoreNelPreventivo('${s.id}')"
      >
        📥 Usa nel preventivo cliente
      </button>
    `
    : `
      <span style="font-size:12px;color:var(--m)">
        Salva prima prezzo e stato “Risposta ricevuta”.
      </span>
    `
}


  ${
    s.richiesta_versione > 0 &&
    s.stato !== 'richiesta_inviata'
      ? `
        <button
          class="btn sm"
          onclick="segnaRichiestaFornitoreInviata('${s.id}')"
        >
          📤 Segna come inviata
        </button>
      `
      : ''
  }
</div>

${
  s.richiesta_versione > 0
    ? `
      <div style="font-size:12px;color:var(--m);margin-top:10px">
        📄 Richiesta PDF v${s.richiesta_versione}
        ${
          s.richiesta_pdf_generato_il
            ? ' · generata il ' +
              new Date(s.richiesta_pdf_generato_il).toLocaleString('it-IT')
            : ''
        }
        ${
          s.richiesta_inviata_il
            ? ' · inviata il ' +
              new Date(s.richiesta_inviata_il).toLocaleString('it-IT')
            : ''
        }
      </div>
    `
    : ''
}

          ${(f.telefono || f.email) ? `
            <div style="font-size:12px;color:var(--m);margin-top:12px">
              ${f.telefono ? '☎ ' + esc(f.telefono) : ''}
              ${f.telefono && f.email ? ' · ' : ''}
              ${f.email ? '✉ ' + esc(f.email) : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('')}
  `;
   renderSchedePreventivo();

}

async function apriSelettoreFornitoriPreventivo() {
  ricordaPosizionePagina();
  const box = ge('pvd-fornitori-content');

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:14px">
      <div>
        <div style="font-size:16px;font-weight:700">🏭 Seleziona fornitori</div>
        <div style="font-size:12px;color:var(--m);margin-top:3px">
          Massimo due fornitori per questo preventivo.
        </div>
      </div>

      <button class="btn sm" onclick="renderFornitoriPreventivo()">
        ← Indietro
      </button>
    </div>

    <div class="card">
      <div class="f">
        <label>Cerca per tipologia</label>
        <input
          id="pvf-ricerca"
          type="text"
          placeholder="Es. porte, estintori, rilevazione incendi..."
          oninput="caricaFornitoriCandidatiPreventivo()"
        >
      </div>
    </div>

    <div id="pvf-candidati" style="margin-top:12px">
      <div class="load">Caricamento fornitori...</div>
    </div>
  `;

  await caricaFornitoriCandidatiPreventivo();
   renderSchedePreventivo();

}

async function caricaFornitoriCandidatiPreventivo() {
  const box = ge('pvf-candidati');
  const ricerca = (v('pvf-ricerca') || '').trim();

  if (!box) return;

  const risultati = await Promise.all([
    db
      .from('preventivi_fornitori')
      .select('fornitore_id')
      .eq('preventivo_id', currentPreventivoId)
      .neq('stato', 'scartato'),

    ricerca
      ? db
          .from('fornitore_tipologie')
          .select('*, fornitori(*)')
          .eq('attivo', true)
          .ilike('tipologia', '%' + ricerca + '%')
          .order('tipologia')
      : db
          .from('fornitore_tipologie')
          .select('*, fornitori(*)')
          .eq('attivo', true)
          .order('tipologia')
          .limit(30)
  ]);

  const selezionatiRes = risultati[0];
  const candidatiRes = risultati[1];

  if (selezionatiRes.error || candidatiRes.error) {
    box.innerHTML =
      '<div class="al2 e">Errore caricamento: ' +
      esc(selezionatiRes.error?.message || candidatiRes.error?.message) +
      '</div>';
    return;
  }

  const giaSelezionati = selezionatiRes.data || [];
const candidati = (candidatiRes.data || [])
  .filter(function(t) {
    return t.fornitori && t.fornitori.attivo !== false;
  })
  .sort(function(a, b) {
    return (a.fornitori?.ragione_sociale || '').localeCompare(
      b.fornitori?.ragione_sociale || '',
      'it',
      { sensitivity: 'base' }
    );
  });

  if (!candidati.length) {
    box.innerHTML = `
      <div class="empty">
        ${ricerca
          ? 'Nessun fornitore trovato per questa tipologia.'
          : 'Inserisci una tipologia per restringere la ricerca.'
        }
      </div>
    `;
    return;
  }

  box.innerHTML = candidati.map(function(t) {
    const giaScelto = giaSelezionati.some(function(s) {
      return s.fornitore_id === t.fornitore_id;
    });

    const limiteRaggiunto = giaSelezionati.length >= 2;

    return `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div>
            <div style="font-size:15px;font-weight:700">
              ${esc(t.fornitori.ragione_sociale)}
            </div>

            <div style="font-size:12px;color:var(--m);margin-top:4px">
              ${esc(t.tipologia)}
              ${t.pronta_consegna ? ' · pronta consegna: ' + esc(t.pronta_consegna) : ''}
              ${t.tempi_consegna ? ' · consegna: ' + esc(t.tempi_consegna) : ''}
            </div>
          </div>

          <button
            class="btn sm p"
            ${giaScelto || limiteRaggiunto ? 'disabled' : ''}
            onclick="selezionaFornitorePreventivo('${t.fornitore_id}','${t.id}')"
          >
            ${giaScelto
              ? 'Già selezionato'
              : limiteRaggiunto
                ? 'Limite raggiunto'
                : 'Seleziona'
            }
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function selezionaFornitorePreventivo(fornitoreId, tipologiaId) {
  const { data: selezionati, error: erroreControllo } = await db
    .from('preventivi_fornitori')
    .select('id')
    .eq('preventivo_id', currentPreventivoId)
    .neq('stato', 'scartato');

  if (erroreControllo) {
    toast('Errore controllo fornitori: ' + erroreControllo.message, 'err');
    return;
  }

  if ((selezionati || []).length >= 2) {
    toast('Puoi selezionare al massimo due fornitori', 'err');
    return;
  }

  const { data: tipologia, error: erroreTipologia } = await db
    .from('fornitore_tipologie')
    .select('tipologia')
    .eq('id', tipologiaId)
    .single();

  if (erroreTipologia || !tipologia) {
    toast('Tipologia fornitore non trovata', 'err');
    return;
  }

  const { error } = await db
    .from('preventivi_fornitori')
    .insert({
      preventivo_id: currentPreventivoId,
      fornitore_id: fornitoreId,
      fornitore_tipologia_id: tipologiaId,
      tipologia: tipologia.tipologia,
      stato: 'da_contattare'
    });

  if (error) {
    toast('Errore selezione fornitore: ' + error.message, 'err');
    return;
  }

  toast('Fornitore aggiunto al preventivo', 'ok');

  if ((selezionati || []).length + 1 >= 2) {
    await renderFornitoriPreventivo();
  } else {
    await apriSelettoreFornitoriPreventivo();
  }
}

async function caricaPreventivoRicevutoFornitore(selezioneId) {
  const input = ge('pvf-file-ricevuto-' + selezioneId);
  const file = input?.files?.[0];

  if (!file) {
    toast('Seleziona il PDF ricevuto dal fornitore', 'err');
    return;
  }

  const nome = String(file.name || '').toLowerCase();

  if (
    file.type !== 'application/pdf' &&
    !nome.endsWith('.pdf')
  ) {
    toast('Puoi caricare solo file PDF', 'err');
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    toast('Il PDF supera il limite di 15 MB', 'err');
    return;
  }

  const { data: authData, error: erroreAuth } = await db.auth.getUser();

  if (erroreAuth || !authData?.user) {
    toast('Sessione non valida', 'err');
    return;
  }

  const nomeSicuro = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

  const storagePath =
    currentPreventivoId +
    '/fornitori/' +
    selezioneId +
    '/' +
    Date.now() +
    '_' +
    nomeSicuro;

  const { error: erroreUpload } = await db.storage
    .from('preventivi-documenti')
    .upload(storagePath, file, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (erroreUpload) {
    toast('Errore caricamento PDF: ' + erroreUpload.message, 'err');
    return;
  }

  const { error: erroreInserimento } = await db
    .from('preventivi_fornitori_allegati')
    .insert({
      preventivo_fornitore_id: selezioneId,
      nome_file: file.name,
      storage_path: storagePath,
      mime_type: file.type || 'application/pdf',
      dimensione: file.size,
      caricato_da: authData.user.id
    });

  if (erroreInserimento) {
    await db.storage
      .from('preventivi-documenti')
      .remove([storagePath]);

    toast(
      'PDF caricato ma non registrato: ' + erroreInserimento.message,
      'err'
    );
    return;
  }

  // F16.11: «Risposta ricevuta» da sola solo se il prezzo è già salvato
  const { data: offertaOra } = await db
    .from('preventivi_fornitori')
    .select('prezzo_offerto')
    .eq('id', selezioneId)
    .maybeSingle();

  if (offertaOra && Number(offertaOra.prezzo_offerto) > 0) {
    await db
      .from('preventivi_fornitori')
      .update({
        stato: 'risposta_ricevuta',
        aggiornato_il: new Date().toISOString()
      })
      .eq('id', selezioneId)
      .eq('preventivo_id', currentPreventivoId);

    toast('Preventivo del fornitore caricato', 'ok');
  } else {
    toast('PDF caricato: scrivi il prezzo offerto, scegli «Risposta ricevuta» e salva.', 'ok');
  }
  await renderFornitoriPreventivo();
}

async function apriAllegatoPreventivoFornitore(storagePath) {
  ricordaPosizionePagina();
  const { data, error } = await firmaFile('preventivi-documenti', storagePath, 3600);

  if (error || !data?.signedUrl) {
    toast(
      'Impossibile aprire il PDF: ' +
      (error?.message || 'file non disponibile'),
      'err'
    );
    return;
  }

  // Stessa scheda: la freccia indietro torna al preventivo (js/47).
  if (typeof apriPdfStessaScheda === 'function') apriPdfStessaScheda(data.signedUrl);
  else window.open(data.signedUrl, '_blank', 'noopener');
}

// F13.5: stati ammessi dal vincolo preventivi_fornitori_stato_check
// ('rifiutata' e 'scaduta' con F16.11, sql/100 -VINCOLO: vedi statiOffertaAmmessi).
const STATI_OFFERTA_FORNITORE = [
  'da_contattare',
  'richiesta_inviata',
  'risposta_ricevuta',
  'selezionato',
  'scartato'
];

// F16.11 (sql/100, versione ridotta decisa da Erika il 13/11): «Risposta
// ricevuta» solo con il prezzo offerto e il PDF dell'offerta caricato (lo
// controlla anche il database); stati nuovi "Il fornitore non quota"
// ('rifiutata') e "Offerta scaduta" ('scaduta') solo con il -VINCOLO.
// «Scelto» e "Usa nel preventivo cliente" come prima. Il controllo del sito
// vale anche senza sql/100.
const STATI_FORNITORE = { letto: false, controlli: false, stati_nuovi: false };

async function verificaStatiFornitore() {
  if (STATI_FORNITORE.letto) return STATI_FORNITORE;
  try {
    const { data, error } = await db.rpc('stati_fornitore_controlli');
    if (!error && data) {
      STATI_FORNITORE.controlli = !!data.controlli;
      STATI_FORNITORE.stati_nuovi = !!data.stati_nuovi;
    }
  } catch (e) { /* senza sql/100: stati di prima */ }
  STATI_FORNITORE.letto = true;
  return STATI_FORNITORE;
}

function statiOffertaAmmessi() {
  return STATI_FORNITORE.stati_nuovi
    ? STATI_OFFERTA_FORNITORE.concat(['rifiutata', 'scaduta'])
    : STATI_OFFERTA_FORNITORE;
}

// Messaggio se l'offerta non può diventare «Risposta ricevuta», '' = va bene
async function mancaPerRispostaRicevuta(selezioneId, prezzo) {
  if (!(Number(prezzo) > 0)) return 'Per segnare «Risposta ricevuta» scrivi il prezzo offerto dal fornitore.';
  const { count, error } = await db
    .from('preventivi_fornitori_allegati')
    .select('id', { count: 'exact', head: true })
    .eq('preventivo_fornitore_id', selezioneId);
  if (error) return '';
  return count ? '' : 'Per segnare «Risposta ricevuta» carica il PDF dell’offerta del fornitore (📎 Carica preventivo fornitore).';
}

// F13.5: prima di segnare 'selezionato' controlla se nel preventivo c'è già
// un'altra offerta scelta della stessa tipologia (js/27 proporrebbe un
// ordine per ognuna). Restituisce true se si può procedere.
async function confermaOffertaSceltaUnicaPerTipologia(selezioneId) {
  const { data: offerta, error: erroreOfferta } = await db
    .from('preventivi_fornitori')
    .select('id,stato,tipologia')
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId)
    .single();

  if (erroreOfferta || !offerta) {
    toast('Offerta del fornitore non trovata', 'err');
    return false;
  }

  if (offerta.stato === 'selezionato') return true;

  let q = db
    .from('preventivi_fornitori')
    .select('id,fornitori(ragione_sociale)')
    .eq('preventivo_id', currentPreventivoId)
    .eq('stato', 'selezionato')
    .neq('id', selezioneId);

  q = offerta.tipologia
    ? q.eq('tipologia', offerta.tipologia)
    : q.is('tipologia', null);

  const { data: altre, error: erroreAltre } = await q;

  if (erroreAltre) {
    toast('Errore controllo offerte scelte: ' + erroreAltre.message, 'err');
    return false;
  }

  if (!altre || !altre.length) return true;

  const nomi = altre
    .map(function(a) { return a.fornitori?.ragione_sociale || 'Fornitore'; })
    .join(', ');

  return confirm(
    'Esiste già un\'offerta scelta per questa tipologia (' +
    (offerta.tipologia || 'tipologia non indicata') + ': ' + nomi +
    '): rischio di doppio ordine.\n\n' +
    'Se è un errore, prima riporta l\'altra offerta a "Risposta ricevuta" o "Scartato".\n\n' +
    'Segnare comunque anche questa come scelta?'
  );
}

async function salvaDettagliFornitorePreventivo(selezioneId) {
  const prezzo = v('pvf-prezzo-' + selezioneId);
  const stato = v('pvf-stato-' + selezioneId);

  await verificaStatiFornitore();
  if (!statiOffertaAmmessi().includes(stato)) {
    toast('Scegli uno stato valido per l\'offerta', 'err');
    return;
  }

  // F16.11: «Risposta ricevuta» solo con prezzo e PDF (se lo stato cambia)
  if (stato === 'risposta_ricevuta') {
    const { data: prima } = await db.from('preventivi_fornitori').select('stato').eq('id', selezioneId).maybeSingle();
    if (!prima || prima.stato !== 'risposta_ricevuta') {
      const manca = await mancaPerRispostaRicevuta(selezioneId, prezzo === '' ? 0 : Number(prezzo));
      if (manca) { toast(manca, 'err'); return; }
    }
  }

  if (stato === 'selezionato') {
    const procedi = await confermaOffertaSceltaUnicaPerTipologia(selezioneId);
    if (!procedi) return;
  }

  if (
    stato === 'scartato' &&
    !confirm('Scartare questa offerta? Esce dall\'elenco dei fornitori del preventivo.')
  ) {
    return;
  }

  const { error } = await db
    .from('preventivi_fornitori')
    .update({
      stato: stato,
      prezzo_offerto: prezzo === '' ? null : Number(prezzo),
      tempi_consegna_proposti: v('pvf-consegna-' + selezioneId).trim() || null,
      note: v('pvf-note-' + selezioneId).trim() || null,
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId);

  if (error) {
    toast('Errore salvataggio fornitore: ' + error.message, 'err');
    return;
  }

  toast('Dati fornitore salvati', 'ok');
  await renderFornitoriPreventivo();
}

async function rimuoviFornitorePreventivo(selezioneId) {
  if (!confirm('Rimuovere questo fornitore dal preventivo?')) return;

  const { error } = await db
    .from('preventivi_fornitori')
    .delete()
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId);

  if (error) {
    toast('Errore rimozione fornitore: ' + error.message, 'err');
    return;
  }

  toast('Fornitore rimosso dal preventivo', 'ok');
  await renderFornitoriPreventivo();
}

async function usaQuotazioneFornitoreNelPreventivo(selezioneId) {
  // F4.3: dopo l'esito del cliente le voci non si cambiano (solo il titolare).
  if (vociPreventivoBloccate) {
    toast('Il cliente ha già dato l\'esito: le voci del preventivo non si cambiano più', 'err');
    return;
  }

  const { data: selezione, error: erroreSelezione } = await db
    .from('preventivi_fornitori')
    .select(`
      id,
      prezzo_offerto,
      tipologia,
      fornitori(ragione_sociale)
    `)
    .eq('id', selezioneId)
    .eq('preventivo_id', currentPreventivoId)
    .single();

  if (erroreSelezione || !selezione) {
    toast('Quotazione fornitore non trovata', 'err');
    return;
  }

  const costo = numeroPreventivo(selezione.prezzo_offerto);

  if (costo <= 0) {
    toast('Inserisci prima il prezzo ricevuto dal fornitore', 'err');
    return;
  }

  // F13.5: usare la quotazione la segna 'selezionato': stesso controllo
  // della seconda offerta scelta per la stessa tipologia.
  const procediScelta = await confermaOffertaSceltaUnicaPerTipologia(selezioneId);
  if (!procediScelta) return;

  // Modifiche alle voci non ancora salvate: si salvano prima, altrimenti
  // il ricaricamento qui sotto le perderebbe.
  if (modificheVociNonSalvatePreventivo()) {
    const salvato = await salvaVociPreventivo();
    if (!salvato) {
      toast('Salva prima le voci del preventivo (tab Costi), poi usa la quotazione', 'err');
      return;
    }
  }

  const percentuale = ricaricoFornituraDaCosto(costo);
  const prezzoCliente = Math.round(
    costo * (1 + percentuale / 100) * 100
  ) / 100;

  const nomeFornitore =
    selezione.fornitori?.ragione_sociale || 'Fornitore';

  const descrizione =
    'Fornitura ' +
    (selezione.tipologia || 'tecnica') +
    ' — ' +
    nomeFornitore;

  // Voce già creata da questa quotazione: si aggiorna (niente doppioni).
  // Niente .maybeSingle(): con due righe già presenti dava errore, la voce
  // risultava "non trovata" e se ne inseriva un'altra.
  const { data: vociQuotazione, error: erroreVoceEsistente } = await db
    .from('preventivi_voci')
    .select('id')
    .eq('preventivo_id', currentPreventivoId)
    .eq('preventivo_fornitore_id', selezioneId)
    .order('creato_il')
    .limit(1);

  if (erroreVoceEsistente) {
    toast('Errore controllo voce del fornitore: ' + erroreVoceEsistente.message, 'err');
    return;
  }

  const voceEsistente = (vociQuotazione || [])[0] || null;

  const datiVoce = {
    categoria: 'materiale',
    descrizione: descrizione,
    unita_misura: 'corpo',
    quantita: 1,
    costo_unitario: costo,
    prezzo_unitario: prezzoCliente,
    preventivo_fornitore_id: selezioneId,
    aggiornato_il: new Date().toISOString()
  };

  let risultato;

  if (voceEsistente) {
    risultato = await db
      .from('preventivi_voci')
      .update(datiVoce)
      .eq('id', voceEsistente.id);
  } else {
    // La voce nuova va in fondo, come ultima creata (prima ordinamento 0:
    // finiva in cima o in mezzo alle altre).
    const { data: ultima, error: erroreUltima } = await db
      .from('preventivi_voci')
      .select('ordinamento')
      .eq('preventivo_id', currentPreventivoId)
      .order('ordinamento', { ascending: false })
      .limit(1);

    if (erroreUltima) {
      toast('Errore lettura voci del preventivo: ' + erroreUltima.message, 'err');
      return;
    }

    const ordinamento = ultima && ultima.length
      ? numeroPreventivo(ultima[0].ordinamento) + 1
      : 0;

    risultato = await db
      .from('preventivi_voci')
      .insert({
        ...datiVoce,
        preventivo_id: currentPreventivoId,
        ordinamento: ordinamento
      });
  }

  if (risultato.error) {
    toast(
      'Errore inserimento costo fornitore: ' + risultato.error.message,
      'err'
    );
    return;
  }

  await db
    .from('preventivi_fornitori')
    .update({
      stato: 'selezionato',
      aggiornato_il: new Date().toISOString()
    })
    .eq('id', selezioneId);

  toast(
    'Quotazione inserita: ricarico automatico ' +
    percentuale +
    '%',
    'ok'
  );

  await renderCostiPreventivo();

  const tab = document.querySelector(
    '.tab[onclick*="pvd-costi"]'
  );

  if (tab) stab(tab, 'pvd-costi');
}
