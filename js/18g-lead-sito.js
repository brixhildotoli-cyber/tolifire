// js/18g-lead-sito.js — lead del sito, coda di Acquisti e collegamenti della dashboard del titolare.
// Riordino del 17/11: era una parte di js/18-preventivi.js (righe 8597-9330),
// spostata così com'era. Si carica subito dopo il pezzo precedente (index.html).

let leadSitoCache = [];

function leadSitoEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function leadSitoData(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function nomeUtenteLeadSito(id) {
  if (!id) return "Non assegnata";

  const utente = (UTENTI || []).find((u) => u.id === id);

  return utente
    ? (utente.nome || utente.email || "Utente")
    : "Utente non disponibile";
}

function montaLeadSitoTitolare() {
  ricordaPosizionePagina();
  if (ROLE !== "titolare") return;

  const tabs = document.querySelector("#pg-trattative .tabs");

  if (!tabs || document.getElementById("tab-lead-sito")) return;

  tabs.insertAdjacentHTML(
    "beforeend",
    `
      <button
        class="tab"
        id="tab-lead-sito"
        onclick="stab(this,'tr-sito'); loadLeadSito()"
      >
        📥 Lead dal sito
      </button>
    `,
  );

  tabs.insertAdjacentHTML(
    "afterend",
    `
      <div class="tc" id="tr-sito">
        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:12px;
            margin:12px 0;
          "
        >
          <div>
            <b>Richieste ricevute dal sito</b>
            <div class="muted">
              Google Ads, form delle pagine servizio, UTM e GCLID.
            </div>
          </div>

          <button class="btn" onclick="loadLeadSito()">↻ Aggiorna</button>
        </div>

        <div id="lead-sito-lista">Apri questa tab per caricare le lead.</div>
      </div>
    `,
  );
}

async function loadLeadSito() {
  if (ROLE !== "titolare") return;

  const contenitore = document.getElementById("lead-sito-lista");

  if (!contenitore) return;

  contenitore.innerHTML = "Caricamento lead dal sito...";

  const { data, error } = await db
    .from("lead_sito")
    .select("*")
    .order("creato_il", { ascending: false });

  if (error) {
    contenitore.innerHTML = `
      <div class="alert err">
        Errore caricamento lead sito: ${leadSitoEsc(error.message)}
      </div>
    `;
    return;
  }

  leadSitoCache = data || [];

  if (!leadSitoCache.length) {
    contenitore.innerHTML = `
      <div class="empty">
        Nessuna lead ricevuta dal sito.
      </div>
    `;
    return;
  }

  // Il titolare vero (dall'elenco utenti, mai l'informatico/programmatrice) e
  // i rappresentanti attivi. Se l'elenco non ha il titolare e chi è collegato
  // è il titolare, resta lui.
  const titolariLead = (UTENTI || []).filter((u) => u.ruolo === "titolare" && u.attivo !== false);
  if (!titolariLead.length && ME && ME.ruolo === "titolare") titolariLead.push(ME);
  const assegnatari = [
    ...titolariLead,
    ...(UTENTI || []).filter(
      (u) => u.ruolo === "rappresentante" && u.attivo !== false && !titolariLead.some((t) => t.id === u.id),
    ),
  ];

  contenitore.innerHTML = leadSitoCache.map((lead) => {
    const assegnata = Boolean(lead.assegnato_a);
    const convertita = lead.stato_commerciale === "convertito";
    const nonQualificata = lead.stato_commerciale === "non_qualificato";

    const opzioniAssegnatario = assegnatari.map((utente) => `
      <option
        value="${utente.id}"
        ${lead.assegnato_a === utente.id ? "selected" : ""}
      >
        ${leadSitoEsc(
          utente.ruolo === "titolare"
            ? `${utente.nome || utente.email} (titolare)`
            : utente.nome || utente.email,
        )}
      </option>
    `).join("");

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;gap:12px">
          <div>
            <b>${leadSitoEsc(lead.azienda || lead.nome || "Lead sito")}</b>
            <div class="muted">
              ${leadSitoEsc(lead.codice)} · ${leadSitoData(lead.creato_il)}
            </div>
          </div>

          <span class="badge ${
            convertita ? "ok" : nonQualificata ? "err" : "info"
          }">
            ${leadSitoEsc(lead.stato_commerciale || "da_qualificare")}
          </span>
        </div>

        <div style="margin-top:10px">
          <div><b>Referente:</b> ${leadSitoEsc(lead.nome || "—")}</div>
          <div><b>Email:</b> ${leadSitoEsc(lead.email || "—")}</div>
          <div><b>Telefono:</b> ${leadSitoEsc(lead.telefono || "—")}</div>
          <div><b>Servizio:</b> ${leadSitoEsc(lead.servizio_richiesto || "—")}</div>
          <div><b>Pagina:</b> ${leadSitoEsc(lead.pagina_provenienza || "—")}</div>
          <div><b>Fonte rilevata:</b> ${leadSitoEsc(lead.fonte_rilevata || "sconosciuta")}</div>
          <div><b>GCLID:</b> ${leadSitoEsc(lead.gclid || "non disponibile")}</div>
          <div><b>Messaggio:</b> ${leadSitoEsc(lead.messaggio || "—")}</div>
        </div>

        <div style="margin-top:12px">
          <label>Assegna a</label>
          <select id="assegna-lead-${lead.id}" ${convertita || nonQualificata ? "disabled" : ""}>
            <option value="">— scegli assegnatario —</option>
            ${opzioniAssegnatario}
          </select>
        </div>

        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          ${
            !convertita && !nonQualificata
              ? `
              <button
  class="btn p"
  onclick="assegnaEInviaLeadSito('${lead.id}')"
>
  📨 Assegna e invia
</button>

                <button
                  class="btn p"
                  onclick="convertiLeadSito('${lead.id}')"
                  ${assegnata ? "" : "disabled"}
                >
                  ✓ Converti in prospect
                </button>

                <button
                  class="btn danger"
                  onclick="nonQualificareLeadSito('${lead.id}')"
                >
                  ✕ Non qualificata
                </button>
              `
              : ""
          }
        </div>

        ${
          assegnata
            ? `
              <div class="muted" style="margin-top:8px">
                Assegnata a: ${leadSitoEsc(nomeUtenteLeadSito(lead.assegnato_a))}
              </div>
            `
            : ""
        }
      </div>
    `;
  }).join("");
}

async function convertiLeadSito(leadId) {
  const lead = leadSitoCache.find((item) => item.id === leadId);

  if (!lead) {
    alert("Lead non trovata. Aggiorna la pagina.");
    return;
  }

  if (!lead.assegnato_a) {
    alert("Prima assegna la lead al titolare o a un rappresentante.");
    return;
  }

  if (!confirm(
    "Convertire questa lead in prospect? Verranno creati cliente e trattativa CRM.",
  )) {
    return;
  }

  const ragioneSociale = lead.azienda?.trim()
    || lead.nome?.trim()
    || `Lead sito ${lead.codice}`;

  const nota = [
    `Lead sito: ${lead.codice}`,
    `Pagina: ${lead.pagina_provenienza || "—"}`,
    `Fonte rilevata: ${lead.fonte_rilevata || "sconosciuta"}`,
    `Fonte dichiarata: ${lead.fonte_dichiarata || "—"}`,
    `GCLID: ${lead.gclid || "—"}`,
    lead.messaggio ? `Messaggio: ${lead.messaggio}` : "",
  ].filter(Boolean).join("\n");

  const { data: cliente, error: erroreCliente } = await db
    .from("clienti")
    .insert({
      ragione_sociale: ragioneSociale,
      referente_nome: lead.nome || null,
      referente_email: lead.email || null,
      referente_telefono: lead.telefono || null,
      stato: "prospect",
      rappresentante_id: lead.assegnato_a,
      note_commerciali: nota,
    })
    .select()
    .single();

  if (erroreCliente) {
    alert(`Errore creazione prospect: ${erroreCliente.message}`);
    return;
  }

  const { data: pipeline, error: errorePipeline } = await db
    .from("pipeline_crm")
    .insert({
      cliente_id: cliente.id,
      rappresentante_id: lead.assegnato_a,
      fase: "primo_contatto",
      fonte_lead: "sito_web",
      dettaglio_fonte: `Lead sito ${lead.codice} · ${lead.pagina_provenienza || "pagina non disponibile"}`,
      servizio_richiesto: lead.servizio_richiesto || null,
      note_trattativa: nota,
    })
    .select()
    .single();

  if (errorePipeline) {
    alert(
      `Il prospect è stato creato, ma manca la trattativa: ${errorePipeline.message}`,
    );
    return;
  }

  const { error: erroreLead } = await db
    .from("lead_sito")
    .update({
      stato_commerciale: "convertito",
      cliente_id: cliente.id,
      pipeline_id: pipeline.id,
      qualificato_il: new Date().toISOString(),
      qualificato_da: ME.id,
    })
    .eq("id", lead.id);

  if (erroreLead) {
    alert(
      `Prospect e trattativa creati, ma stato lead non aggiornato: ${erroreLead.message}`,
    );
    return;
  }

  alert("Lead convertita in prospect e assegnata correttamente.");
  await loadLeadSito();
}

async function nonQualificareLeadSito(leadId) {
  if (!confirm("Segnare questa lead come non qualificata?")) return;

  const { error } = await db
    .from("lead_sito")
    .update({
      stato_commerciale: "non_qualificato",
      qualificato_il: new Date().toISOString(),
      qualificato_da: ME.id,
    })
    .eq("id", leadId);

  if (error) {
    alert(`Errore aggiornamento lead: ${error.message}`);
    return;
  }

  await loadLeadSito();
}

async function caricaAvvisiLeadAssegnate() {
  ricordaPosizionePagina();
  if (ROLE !== "rappresentante") return;

  let box = ge("rap-lead-assegnate");

  // Crea il punto sotto “Nuovo sopralluogo” se non esiste già.
  if (!box) {
    const pulsanteSopralluogo = document.querySelector(
      "#pg-dashboard-rapp .rap-primary",
    );

    if (!pulsanteSopralluogo) return;

    pulsanteSopralluogo.insertAdjacentHTML(
      "afterend",
      `<div id="rap-lead-assegnate"></div>`,
    );

    box = ge("rap-lead-assegnate");
  }

  const { data: lead, error } = await db
    .from("pipeline_crm")
    .select(`
      id,
      servizio_richiesto,
      fase,
      aggiornato_il,
      clienti(ragione_sociale)
    `)
    .eq("rappresentante_id", ME.id)
    .eq("fonte_lead", "sito_web")
    .eq("fase", "primo_contatto")
    .is("letto_rappresentante_il", null)
    .order("aggiornato_il", { ascending: false });

  if (error || !lead?.length) {
    box.innerHTML = "";
    return;
  }

  const numero = lead.length;
  const testo = numero === 1
    ? "Hai 1 nuova lead da contattare"
    : `Hai ${numero} nuove lead da contattare`;

  box.innerHTML = `
    <button
      class="rap-primary"
      style="background:#b91c1c;margin-top:14px"
      onclick="apriLeadAssegnateDaDashboardRapp()"
    >
      <span class="ico">🔴</span>

      <span class="body">
        <span class="title">${testo}</span>
        <span class="sub">
          Lead assegnate dal titolare. Apri Lead e trattative per gestirle.
        </span>
      </span>

      <span class="chev">›</span>
    </button>
  `;
}

async function assegnaEInviaLeadSito(leadId) {
  const select = document.getElementById(`assegna-lead-${leadId}`);
  const assegnatoA = select?.value;

  if (!assegnatoA) {
    alert("Scegli prima il rappresentante a cui inviare la lead.");
    return;
  }

  const lead = leadSitoCache.find((item) => item.id === leadId);

  if (!lead) {
    alert("Lead non trovata. Aggiorna la pagina.");
    return;
  }

  if (!confirm(
    "Assegnare la lead e crearla subito nelle Lead e trattative del rappresentante?",
  )) {
    return;
  }

  const { error } = await db
    .from("lead_sito")
    .update({
      assegnato_a: assegnatoA,
      assegnato_il: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    alert(`Errore assegnazione: ${error.message}`);
    return;
  }

  lead.assegnato_a = assegnatoA;

  await convertiLeadSito(leadId);
}


async function caricaAvvisoLeadSitoTitolare() {
  ricordaPosizionePagina();
  if (ROLE !== "titolare") return;

  let box = ge("tit-avviso-lead-sito");

  if (!box) {
    const saluto = document.querySelector("#dash-titolare .tit-greet");

    if (!saluto) return;

    saluto.insertAdjacentHTML(
      "afterend",
      `<div id="tit-avviso-lead-sito"></div>`,
    );

    box = ge("tit-avviso-lead-sito");
  }

 const { count, error } = await db
  .from("lead_sito")
  .select("id", { count: "exact", head: true })
  .in("stato_commerciale", ["da_qualificare", "contattato"])
  .is("letto_titolare_il", null);

  if (error || !count) {
    box.innerHTML = "";
    return;
  }

  const testo = count === 1
    ? "Hai 1 nuova lead dal sito"
    : `Hai ${count} nuove lead dal sito`;

  box.innerHTML = `
    <button
      class="rap-primary"
      style="background:#b91c1c;margin:14px 0"
      onclick="apriLeadSitoDaDashboardTitolare()"
    >
      <span class="ico">🔴</span>

      <span class="body">
        <span class="title">${testo}</span>
        <span class="sub">
          Richieste ricevute da moduli sito, Google Ads e pagine servizio.
        </span>
      </span>

      <span class="chev">›</span>
    </button>
  `;
}

async function apriLeadSitoDaDashboardTitolare() {
  ricordaPosizionePagina();
  const box = ge("tit-avviso-lead-sito");

  // La nasconde subito graficamente.
  if (box) box.innerHTML = "";

  // Segna come lette tutte le lead sito ancora da lavorare.
  const { error } = await db
    .from("lead_sito")
    .update({
      letto_titolare_il: new Date().toISOString(),
    })
    .in("stato_commerciale", ["da_qualificare", "contattato"])
    .is("letto_titolare_il", null);

  if (error) {
    console.error("Errore lettura notifiche lead sito:", error.message);
  }

  gotoPage("trattative");

  setTimeout(function () {
    montaLeadSitoTitolare();

    const tab = ge("tab-lead-sito");

    if (tab) {
      stab(tab, "tr-sito");
      loadLeadSito();
    }
  }, 150);
}

async function eliminaFornitore(fornitoreId) {
  if (ROLE !== 'commerciale') {
    toast('Non hai i permessi per eliminare fornitori', 'err');
    return;
  }

  const fornitore = fornitoriDati.find(function(f) {
    return f.id === fornitoreId;
  });

  const nome = fornitore?.ragione_sociale || 'questo fornitore';

  const conferma = confirm(
    `Vuoi davvero eliminare "${nome}"?\n\n` +
    'Il fornitore non comparirà più nelle selezioni future. ' +
    'I collegamenti ai preventivi già creati saranno mantenuti.'
  );

  if (!conferma) return;

  const { error } = await db
    .from('fornitori')
    .update({ attivo: false })
    .eq('id', fornitoreId);

  if (error) {
    toast(`Errore eliminazione fornitore: ${error.message}`, 'err');
    return;
  }

  toast('Fornitore eliminato correttamente', 'ok');
  await loadFornitori();
}

function tornaDaSchedaCliente() {
  const destinazione =
    paginaPrecedenteCliente &&
    canAccessPage(paginaPrecedenteCliente)
      ? paginaPrecedenteCliente
      : 'clienti';

  gotoPage(destinazione);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({
        top: scrollPrimaSchedaCliente,
        left: 0,
        behavior: 'auto'
      });
    });
  });
}

async function caricaCodaCommercialeTitolare() {
  ricordaPosizionePagina();
  if (ROLE !== 'titolare') return;

  let sezione = ge('tit-coda-commerciale');

  if (!sezione) {
    const barraPeriodo = document.querySelector(
      '#dash-titolare .tit-period-bar'
    );

    if (!barraPeriodo) return;

    barraPeriodo.insertAdjacentHTML(
      'afterend',
      `<div id="tit-coda-commerciale"></div>`
    );

    sezione = ge('tit-coda-commerciale');
  }

  sezione.innerHTML = `
    <div class="tit-section" style="margin-top:22px">
      🎯 Lead e sviluppo commerciale
    </div>

    <div class="kpi-grid">
      <div class="kpi-card clickable info" onclick="gotoPage('trattative')">
        <div class="kpi-icon">🎯</div>
        <div class="kpi-num" id="tit-k-lead-nuovi">—</div>
        <div class="kpi-label">Nuovi lead</div>
      </div>

      <div
        class="kpi-card clickable attention"
        onclick="apriLeadSitoDaDashboardTitolare()"
      >
        <div class="kpi-icon">📥</div>
        <div class="kpi-num" id="tit-k-lead-sito">—</div>
        <div class="kpi-label">Lead dal sito</div>
      </div>

      <div
        class="kpi-card clickable warn"
        onclick="apriSopralluoghiDaDashboardTitolare()"
      >
        <div class="kpi-icon">🔎</div>
        <div class="kpi-num" id="tit-k-sopralluoghi">—</div>
        <div class="kpi-label">Sopralluoghi aperti</div>
      </div>

      <div class="kpi-card clickable success" onclick="gotoPage('trattative')">
        <div class="kpi-icon">👥</div>
        <div class="kpi-num" id="tit-k-prospect">—</div>
        <div class="kpi-label">Clienti prospect</div>
      </div>
    </div>
  `;

  const [
    leadNuoviRes,
    leadSitoRes,
    sopralluoghiRes,
    prospectRes
  ] = await Promise.all([
    db
      .from('pipeline_crm')
      .select('id', { count: 'exact', head: true })
      .eq('fase', 'primo_contatto'),

    db
      .from('lead_sito')
      .select('id', { count: 'exact', head: true })
      .in('stato_commerciale', ['da_qualificare', 'contattato']),

    db
      .from('sopralluoghi')
      .select('id', { count: 'exact', head: true })
      .is('odl_creato_id', null),

    db
      .from('clienti')
      .select('id', { count: 'exact', head: true })
      .eq('stato', 'prospect')
      .is('eliminato_il', null)
  ]);

  ge('tit-k-lead-nuovi').textContent =
    leadNuoviRes.error ? '—' : (leadNuoviRes.count || 0);

  ge('tit-k-lead-sito').textContent =
    leadSitoRes.error ? '—' : (leadSitoRes.count || 0);

  ge('tit-k-sopralluoghi').textContent =
    sopralluoghiRes.error ? '—' : (sopralluoghiRes.count || 0);

  ge('tit-k-prospect').textContent =
    prospectRes.error ? '—' : (prospectRes.count || 0);
}

function apriSopralluoghiDaDashboardTitolare() {
  ricordaPosizionePagina();
  gotoPage('trattative');

  setTimeout(function() {
    const tabSopralluoghi = document.querySelector(
      '#pg-trattative .tabs .tab:nth-child(2)'
    );

    if (tabSopralluoghi) {
      stab(tabSopralluoghi, 'tr-s');
      loadSopralluoghiList();
    }
  }, 150);
}

async function apriLeadAssegnateDaDashboardRapp() {
  ricordaPosizionePagina();
  const box = ge("rap-lead-assegnate");

  // Sparisce subito dalla dashboard.
  if (box) box.innerHTML = "";

  // Segna come letti gli avvisi del solo rappresentante connesso.
  const { error } = await db
    .from("pipeline_crm")
    .update({
      letto_rappresentante_il: new Date().toISOString(),
    })
    .eq("rappresentante_id", ME.id)
    .eq("fonte_lead", "sito_web")
    .eq("fase", "primo_contatto")
    .is("letto_rappresentante_il", null);

  if (error) {
    console.error(
      "Errore lettura notifiche lead assegnate:",
      error.message
    );
  }

  gotoPage("trattative");
}
