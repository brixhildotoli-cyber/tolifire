# Toli Fire — Gestionale Antincendio

## Cos'è
Gestionale per azienda di antincendio. Frontend HTML/CSS/JS vanilla, non più
file unico: `index.html` (markup) + `style.css` + moduli `js/00-…25-*.js`
caricati in ordine 00–18, poi 20–25, infine `19-init.js` (dettagli in
README.md). Backend: Supabase (Postgres + Auth + API + Storage).
Librerie CDN: supabase-js v2, xlsx 0.18.5, jspdf 2.5.1, jspdf-autotable 3.8.2.
La struttura aziendale costa 1000 €/giorno lavorativo: le KPI del titolare
sono critiche.

Branch: `sviluppo` = lavoro; `gestionale_new` = branch pubblicato su GitHub
Pages (il sito usato dai dipendenti: solo merge provati). `main` locale e
remoto divergono: non toccarli.
Cartella `sql/`: repository git SEPARATO e PRIVATO
(brixhildotoli-cyber/tolifire-sql), escluso dal repo pubblico via
.gitignore. Contiene lo schema esportato dalla produzione (`sql/schema/`:
tabelle, vincoli, trigger, policy RLS, storage, permessi, 45 funzioni),
le query di estrazione (nell'editor Supabase girano solo dentro funzioni
`pg_temp`), gli export in `sql/output/` e `sql/BACKUP.md` (procedura di
backup OBBLIGATORIA prima di ogni modifica allo schema).
Persone: al terminale lavora Erika (programmatrice); le conferme spettano
a Toli (titolare).

## Tabelle Supabase
Fonte: export produzione `sql/output/00-schema.csv` e
`sql/output/01-conteggio-2026-10-22.csv` (57 tabelle in `public`) +
ricerca di `.from('...')` in `js/` e `index.html` (38 tabelle usate dal
frontend). Aggiornare questo elenco a ogni nuova tabella.

Usate dal frontend — anagrafiche e manutenzione:
clienti, sedi_cliente, impianti, ordini_lavoro, schede_lavoro, schede_foto,
schede_presidi, schede_manichette, sopralluoghi, relazioni_tecniche,
richieste_modifica_odl, ticket_clienti, ticket_allegati, documenti_cliente,
ddt, ddt_righe, prodotti_catalogo, cicli_pianificati, clienti_periodicita,
calendario_personale, impostazioni, utenti

Usate dal frontend — area commerciale (preventivi, progetti, fornitori, CRM):
- preventivi, preventivi_voci, preventivi_certificati
- progetti_tecnici, progetti_tecnici_allegati, progetti_tecnici_fornitori,
  progetti_tecnici_schede, progetti_tecnici_storico
- fornitori, fornitore_tipologie, preventivi_fornitori (offerte/richieste
  ai fornitori), preventivi_fornitori_allegati
- pipeline_crm (trattative), lead_sito, appuntamenti_commerciali

Usate dal frontend — fatturazione:
fatture (solo lista in lettura, js/06-fatture-workflow.js `loadFatture`;
il modulo Fatture è in costruzione, vedi sotto)

Presenti nel DB ma NON usate dal frontend (19, al 22/10/2026):
ads_crm_nuovi_contatti, ads_crm_qualificazioni, calendario_slot, contratti,
fatture_righe, fatture_scadenze, indirizzi_cliente, listini, notifiche,
periodicita_presidi, portale_clienti, preventivi_righe,
preventivi_schede_tecniche, riba_presentazioni, riba_righe, ruoli,
solleciti, verbali, verifiche_presidi.
Nota: le tabelle del modulo Fatture (fatture_righe, fatture_scadenze,
riba_presentazioni, riba_righe, solleciti) esistono già in produzione
(0 righe): prima di eseguire la Fase 1 del modulo, confrontare lo schema
reale in `sql/schema/` con l'SQL preparato. Non cancellare le tabelle non
usate senza conferma di Toli.

Bucket Storage usati dal frontend: documenti-clienti, foto-interventi,
preventivi-documenti, progetti-tecnici, ticket-allegati,
certificati-preventivi.

RPC chiamate dal frontend (`db.rpc`): marca_ritardi_pendenti,
confirm_user_email, impegni_tecnici_dashboard,
marca_preventivo_letto_rappresentante, marca_preventivo_letto_titolare,
salva_esito_verifica, salva_bozza_verifica, elimina_scheda_storico,
nuovo_intervento_manichetta, salva_riporto_presidio.
Dopo sql/18 (F2.3, da eseguire): marca_certificato_letto_ingegnere.
Client pubblico `dbPublic` (portale clienti, js/02-portale-navigazione.js).
Sono gli accessi che le policy RLS per il portale dovranno permettere
(F1.1), sempre filtrati sul cliente del portale (`cliente_id`):
- LETTURE (select): clienti, sedi_cliente, documenti_cliente
  (solo `visibile_cliente=true`), ddt, schede_lavoro, ticket_clienti
  (con join in lettura su ordini_lavoro: data_pianificata, stato,
  fascia_oraria).
- SCRITTURE (insert): documenti_cliente, ticket_clienti, ticket_allegati.
- STORAGE: bucket documenti-clienti (upload e createSignedUrl),
  bucket ticket-allegati (upload).

## Mappa ruoli: organigramma → gestionale
Da "Roadmap gestionale TOLI Fire" (gestione-task/ROADMAP.md). Si tengono i
codici attuali di `utenti.ruolo`; se ne aggiunge uno solo (capo_operativo).
Esiste anche `informatico` (Erika Pistolesi): accesso completo come il
titolare (decisione di Erika del 23/10, da confermare da Toli in F1.4).
Cambiano solo le etichette in interfaccia (Fase 3), mai il codice.

| Figura (organigramma) | Ruolo nel gestionale | Cosa fa già | Da fare |
|---|---|---|---|
| Direzione | titolare | Vede tutto | — |
| Commerciale verso il cliente (cliente, approvazione, ordini) | rappresentante | Trattative, progetti, riceve il PDF del preventivo | Accettazione, anticipo, ordini (Fasi 4–6) |
| Ingegnere | ingegnere | Verifiche tecniche, schede rilievo, certificati | Aggiungerlo al form nuovo utente (Fase 2) |
| Acquisti | commerciale (la parte acquisti) | Richieste ai fornitori, scelta fornitore, preventivo | Consumabili e noli dal cantiere (Fase 6) |
| Reparto Tecnico e squadre | tecnico | Esegue gli interventi, scheda di lavoro | Giornale di cantiere (Fase 8), audit presidi (Fase 10) |
| Capo Operativo | manca | — | Nuovo ruolo capo_operativo (Fase 3) |
| Responsabile Service | capo_tecnico | Pianifica gli interventi | Contratti e appuntamenti (Fase 10) |
| Segreteria | segreteria | Interventi da pianificare, documenti | Anticipi, faldone, appuntamenti, chiusura |
| Programmazione e controllo | titolare (accesso completo) | — | — |
| Contabile (esterno all'organigramma) | contabile | Fatturazione | — |
| Informatico (esterno all'organigramma) | informatico | Accesso completo come il titolare | — |
| Subappaltatori | non sono utenti | — | Anagrafica con documenti (Fase 7) |

Decisione D1 (chiusa da Erika il 23/10, da confermare da Toli in F1.4):
il "commerciale" verso il cliente è il ruolo rappresentante (anche per gli
agenti esterni); il ruolo commerciale è la parte acquisti. Non si
sovrappongono e non serve un ruolo nuovo. La Fase 4 usa rappresentante.

Pagine consentite oggi per ruolo (`PAGINE_RUOLO`,
js/02-portale-navigazione.js; controllo in `canAccessPage`):
- titolare: dashboard, calendario, piano-mensile, trattative,
  preventivi-titolare, preventivo-detail, progetti-da-preventivare, presidi,
  workflow, interventi, clienti, documenti, fatture, catalogo, impostazioni,
  cliente-detail, progetto-detail, fornitore-detail, tecnico, sopralluogo
- capo_tecnico: dashboard, calendario, calendario-team, piano-mensile,
  presidi, interventi, tecnico, clienti, documenti, cliente-detail
- segreteria: dashboard, calendario, workflow, presidi, interventi, tecnico,
  clienti, documenti, fatture, catalogo, cliente-detail, fornitore-detail
- contabile: dashboard, workflow, fatture, documenti, catalogo
- tecnico: dashboard, calendario-tec, tecnico, documenti
- commerciale: dashboard, progetti-da-preventivare, preventivi, fornitori,
  fornitore-detail, preventivo-detail, clienti, documenti, progetto-detail,
  fatture, catalogo, cliente-detail, info
- rappresentante: dashboard, dashboard-rapp, calendario-appuntamenti,
  clienti, progetti, presidi, trattative, preventivi-rapp, cliente-detail,
  progetto-detail, catalogo, info
- ingegnere: dashboard, calendario-ingegnere, verifiche-tecniche,
  documenti, certificati-ingegnere, progetto-detail, cliente-detail, info,
  + clienti (aggiunta subito dopo la definizione, sola consultazione)
- informatico: come titolare (in js/01-core.js `boot` ROLE diventa
  'titolare', etichetta "Informatico"; lato DB `ruolo_corrente()` in
  sql/07 restituisce 'titolare')
- capo_operativo: da creare (Fase 3)

## Ruoli e cosa fa ciascuno (campo `ruolo` in `utenti`)

RAPPRESENTANTE
- Raccoglie dal cliente i dettagli tecnici: compartimentazione, estintori,
  impianti — cosa e perché. Si relaziona col cliente.
- Inserisce note sul cliente (visibili alla segreteria) e note/precisazioni
  sul lavoro.
- Se il lavoro è accettato: inserisce dati cliente, fatturazione, pagamento,
  e se la commessa è pagata in anticipo o no.
- Vede gli insoluti comunicati dalla segreteria: per quale commessa e
  quale materiale.
- Vede la disponibilità nel calendario.
- Preventivi limitati a 3.000 € (sopra tale soglia passa al commerciale).

COMMERCIALE
- È la parte acquisti (decisione D1): il commerciale verso il cliente è il
  rappresentante.
- Preventiva i lavori sopra i 3.000 €.
- Segue i fornitori, richiede preventivi ai fornitori.
- Aggiorna il catalogo prezzi.

SEGRETERIA
- Accesso ampio, attenzione particolare a fatturazione, pagamenti, RIBA.
- Comunica gli insoluti.
- Inserisce interventi da pianificare.

CAPO_TECNICO
- Pianifica gli interventi "da pianificare" inseriti da titolare,
  segreteria o rappresentante.

TECNICO
- Esegue e conferma l'esecuzione. Solo esecuzione, niente gestione.
- Redige il buono di lavoro: estintore controllato sì/no, anomalie,
  cosa va aggiornato, stato porte, ecc.
- Vede panoramica della propria settimana e dettaglio del giorno: dove
  andare e cosa fare.
- Aprendo l'intervento vede il parco presidi del cliente (se cliente con
  manutenzione ricorrente, non una tantum).
- Va dato ogni strumento per eseguire bene sul campo.

TITOLARE
- Vede tutto. KPI complete e affidabili (la struttura costa 1000 €/giorno).

CONTABILE
- Dashboard, workflow, fatture, documenti, catalogo (come da
  `PAGINE_RUOLO.contabile`).

INGEGNERE
- Verifiche tecniche sui progetti, schede rilievo, certificati.
- Consulta clienti e schede cliente senza modificarli.
- Selezionabile nel form nuovo utente (F2.3, sviluppo 085ce7d).

CAPO_OPERATIVO (da creare, Fase 3)
- Capo Operativo dei cantieri: vede le commesse dalla Fase 5 in poi.

## Convenzioni di codice (rispettare SEMPRE)
- HTML/CSS/JS vanilla. Nessun framework o build tool senza chiederlo.
- Riutilizzare le helper esistenti: `ge`, `v`, `toast`, `fd`, `openM`,
  `closeM`. Riutilizzare le funzionalità già presenti nel file.
- Nomi in italiano, coerenti con l'esistente.
- Terminologia antincendio corretta (estintori, presidi, compartimentazione,
  porte REI, manutenzione ordinaria/straordinaria).
- UI a prova di errore: semplice, chiara, facile da usare.

## SICUREZZA
I permessi vivono SOLO nel frontend (`canAccessPage`, `PAGINE_RUOLO`,
`if(ROLE===...)`): aggirabili da console. La protezione vera = Row Level
Security su Supabase. Stato RLS: dall'export del 22/10/2026
(`sql/schema/04-rls-policy.sql`) risulta ATTIVA su tutte le 57 tabelle,
ma con policy larghe (verifica in `sql/REPORT-RLS.md`, F1.1).
Eseguiti in produzione il 23/10: 03 e 04 (tappi anon: niente letture
senza login, RPC chiuse ad anon, compreso `confirm_user_email`), 04b,
16, 18.
Stato al 26/10/2026: RLS ATTIVA in produzione (F1.4, confermata da
Toli, eseguita seguendo `sql/F1.4-ATTIVAZIONE.md`): policy per ruolo
(07-12), controllo del ruolo nelle RPC (11), portale con link segreto
(13), regole dei file per cartella (14), trigger Piano mensile (17).
Schema aggiornato in `sql/schema/` (export del 26/10). Ogni nuova
tabella o funzione deve nascere con le sue policy e il suo rollback.

## Autonomia di Claude Code
PUÒ fare da solo: refactoring, CSS, bug fix, nuove funzioni UI, riordino
del codice in moduli, scrivere policy RLS (proporle).
RICHIEDE conferma: cancellare funzioni/dati ("levare il superfluo"),
modifiche allo schema DB, attivare RLS in produzione.

## Metodo
Un modulo alla volta: scritto, provato dall'utente, corretto, poi il
prossimo. Ordine: sicurezza, funzioni, estetica (salvo diversa indicazione).

## MODULI DA COSTRUIRE (work in corso)
Annotare qui i moduli identificati ma rinviati, per non perderli tra
una sessione e l'altra.

1. **Listini prezzi per cliente** — prezzi personalizzati, soprattutto
   per i controlli semestrali. Oggi `prodotti_catalogo.prezzo_cliente`
   è un campo unico per tutti i clienti, e nei DDT i prezzi vanno
   corretti a mano riga per riga. Serve una tabella `listini_cliente`
   (o equivalente sconto-per-cliente) con storico applicabile in
   automatico al momento della creazione del DDT/fattura.

2. **Modulo Fatture / RIBA / Solleciti** — IN COSTRUZIONE (12 fasi).
   Decisioni di progetto approvate:
   - Manodopera: `impostazioni.tariffa_oraria_standard` ×
     `schede_lavoro.ore_lavorate`.
   - Niente fatturazione elettronica SDI in questo modulo (Modulo 2 futuro).
   - Una sola aliquota IVA per fattura.
   - Snapshot dati fiscali cliente al momento dell'emissione.
   - Rate multiple per fattura (tabella `fatture_scadenze`).
   - Ogni fattura nasce da almeno una scheda di lavoro (vincolo UI).
   - Annullamento solo via nota di credito (`riferimento_fattura_id`).
   - Rappresentante vede insoluti solo per `clienti.rappresentante_id=ME`.
   - Solleciti sempre manuali (segreteria).
   - Numerazione separata per fatture e note di credito.

   Fasi:
   - [ ] Fase 1 — Schema DB (tabelle, RLS, trigger). SQL pronto.
   - [ ] Fase 2 — Lista fatture read-only (pagina pg-fatture).
   - [ ] Fase 3 — Creazione bozza fattura (modal m-fattura).
   - [ ] Fase 4 — Auto-popolamento righe da scheda/DDT/manodopera.
   - [ ] Fase 5 — Emissione fattura (assegna numero, scadenze).
   - [ ] Fase 6 — Vista scadenze + KPI dashboard.
   - [ ] Fase 7 — Registrazione pagamenti.
   - [ ] Fase 8 — RIBA: presentazioni e righe.
   - [ ] Fase 9 — Esiti RIBA (accreditato/insoluto).
   - [ ] Fase 10 — Solleciti.
   - [ ] Fase 11 — Aggiornamento dashboard ruoli.
   - [ ] Fase 12 — Export PDF fattura.
   Dipendenza esterna: `clienti.rappresentante_id` da aggiungere
   prima della Fase 11 (per filtro insoluti rappresentante).

   **Stati canonici (decisi e da rispettare ovunque)**:
   - `fatture.stato`: `bozza → emessa → annullata`
   - `fatture.stato_pagamento`: `da_pagare → in_riba | pagata | parzialmente_pagata | insoluta → sollecitata`
   - `fatture_scadenze.stato`: `aperta → in_riba | pagata | insoluta → sollecitata`
   - `riba_presentazioni.stato`: `preparata → inviata → accreditata | parzialmente_accreditata | chiusa`
   - `riba_righe.esito`: `NULL → accreditato | insoluto`
   - `solleciti.esito`: `inviato → risposto | ignorato`
   Default applicati con ALTER post-Fase 1: `fatture.stato='bozza'`
   (era 'da_emettere' pre-esistente, allineato dopo decisione).

3. **Generazione automatica relazioni tecniche** — da verificare se
   funziona davvero. Il frontend non inserisce mai righe in
   `relazioni_tecniche`; va controllato se esiste un trigger Postgres
   o una Edge Function Supabase che le crea automaticamente al passaggio
   di una scheda firmata. Se non esiste, va costruita.

4. **Stato intervento 'da riprogrammare'** — FATTO in F2.2 (sviluppo
   6692e3b, 5773535): il non completato torna `da_pianificare` senza data,
   motivo visibile al capo tecnico, scheda in `bozza` fuori dalla
   segreteria. Descrizione originale: quando un tecnico non
   riesce a completare o svolgere un intervento pianificato (imprevisto,
   lavoro non finito, cliente assente), deve poterlo segnalare e
   l'intervento torna automaticamente in coda "da pianificare" per
   essere ripianificato. Oggi questo stato non esiste: il ciclo è solo
   lineare `da_pianificare → pianificato → completato`. Va aggiunto lo
   stato (o un meccanismo equivalente, es. trigger che riporta a
   `da_pianificare` quando il tecnico segna "non completato" sulla
   scheda di lavoro).

5. **Da F2.4 (risposte di Erika del 26/10)** — lavori nuovi emersi
   dall'analisi del codice non usato (CODICE-MORTO.md §8):
   - D3: far funzionare il riquadro "Impegni del team tecnico" nella
     dashboard del rappresentante (oggi id duplicato, resta su
     "Caricamento..."; `loadImpegniTeamAnonimi` in js/13 mai chiamata).
   - D4: pulsante "Elimina attività" nel calendario dell'ingegnere
     (`eliminaAttivitaIngegnere` esiste ma non è collegata).
   - D5: i preventivi passano dall'approvazione del titolare prima
     dell'invio (`inviaPreventivoPerApprovazione`, stato
     `in_attesa_approvazione`, oggi non collegata).
   - D7: costruire le schede di manutenzione ordinaria del tecnico
     (`apriManutenzioneOrdinaria`/`salvaManutenzioneOrdinaria` chiamate da
     index.html ma mai scritte: oggi il bottone non fa nulla).
   - D6: `ricordaPosizionePagina` è solo nella copia morta di renderPC
     (js/07): rimetterla nella versione usata (js/09).
