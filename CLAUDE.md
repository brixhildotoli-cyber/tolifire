# Toli Fire — Gestionale Antincendio

## Cos'è
Gestionale per azienda di antincendio. Frontend HTML/CSS/JS vanilla, non più
file unico: `index.html` (markup) + `style.css` + moduli `js/00-…36-*.js`
caricati in ordine 00–18, poi 20–36, infine `19-init.js` (dettagli in
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

Usate dal frontend — commesse (F5.1, sql/26-commesse eseguito il 27/10):
commesse (sola lettura dal sito; la crea il database, js/18)
Dopo sql/28 (F5.2, eseguito il 27/10): commesse_storico (sola lettura; lo
scrive il database)
Dopo sql/29 (F5.3, eseguito il 27/10): commesse_documenti (sola lettura; si
scrive solo con le RPC registra_documento_commessa ed
elimina_documento_commessa, js/26)
Dopo sql/30 (F6.1, eseguito il 27/10): ordini_fornitori, ordini_fornitori_voci
(sola lettura; si scrivono solo con le RPC crea_ordine_fornitore e
cambia_stato_ordine_fornitore, js/27)
Dopo sql/31 (F6.2, eseguito il 27/10, non richiede 28-30):
commesse_richieste_integrazione (sola lettura; si scrive solo con le RPC
apri_richiesta_integrazione, evadi_richiesta_integrazione e
cambia_stato_richiesta_integrazione, js/28)

Usate dal frontend — team e subappalti (F7.1, sql/32 eseguito il 27/10, richiede
solo sql/07): subappaltatori (lettura titolare, segreteria, capo_tecnico;
inserimento e modifica diretti di titolare e segreteria, niente
cancellazione: attivo=false), documenti_team_subappalti (sola lettura; si
scrive solo con le RPC registra_, correggi_ ed
elimina_documento_team_subappalti, js/30); colonna nuova
impostazioni.giorni_preavviso_documenti (default 30).
Dopo sql/33 (F7.2, eseguito il 28/10, richiede 26, 28 e 32): colonne nuove
commesse.data_inizio, data_fine_prevista, date_fissate_da,
date_fissate_il (sola lettura; le scrive imposta_date_commessa);
commesse_faldone, commesse_faldone_persone, commesse_faldone_voci (sola
lettura per titolare, segreteria, capo_tecnico; si scrivono solo con le
RPC del faldone, js/31).
Dopo sql/35 (F8.2, da eseguire, richiede 07, 26 e 32): mezzi_attrezzature
(lettura, inserimento e modifica diretti di titolare, segreteria,
capo_tecnico; niente cancellazione: attivo=false),
commesse_squadra_giorni, commesse_squadra_persone,
commesse_squadra_mezzi (sola lettura per titolare, segreteria,
capo_tecnico; si scrivono solo con le RPC della squadra, js/33).
Dopo sql/36 (F8.3, da eseguire, richiede 07 e 26): commesse_fasi
(sola lettura per chi legge la commessa; si scrive solo con le RPC del
cronoprogramma, js/34).
Dopo sql/37 (F8.4, da eseguire, richiede 07, 26 e 32): commesse_lavorazioni
(lettura per chi legge la commessa), commesse_giornale (lettura titolare,
segreteria, capo_tecnico), commesse_giornale_ore (lettura SOLO titolare e
capo_tecnico: ore per persona); si scrivono solo con le RPC del giornale,
js/35.
Dopo sql/38 (F8.5, da eseguire, richiede 07, 22 e 26): commesse_lavori_extra
(sola lettura per chi legge la commessa; si scrive solo con
registra_lavoro_extra e annulla_lavoro_extra e dal trigger sui
preventivi, js/36).

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
certificati-preventivi; dopo sql/29 (F5.3) commesse-documenti; dopo
sql/32 (F7.1) documenti-team-subappalti.

RPC chiamate dal frontend (`db.rpc`): marca_ritardi_pendenti,
confirm_user_email, impegni_tecnici_dashboard,
marca_preventivo_letto_rappresentante, marca_preventivo_letto_titolare,
salva_esito_verifica, salva_bozza_verifica, elimina_scheda_storico,
nuovo_intervento_manichetta, salva_riporto_presidio.
Dopo sql/18 (F2.3, da eseguire): marca_certificato_letto_ingegnere.
Dopo sql/26 (F5.1, eseguito il 27/10): imposta_sede_commessa.
Dopo sql/28 (F5.2, eseguito il 27/10): cambia_stato_commessa.
Dopo sql/29 (F5.3, eseguito il 27/10): registra_documento_commessa,
elimina_documento_commessa.
Dopo sql/30 (F6.1, eseguito il 27/10): offerte_ordinabili_commessa,
crea_ordine_fornitore, cambia_stato_ordine_fornitore.
Dopo sql/31 (F6.2, eseguito il 27/10): apri_richiesta_integrazione,
evadi_richiesta_integrazione, cambia_stato_richiesta_integrazione.
Dopo sql/32 (F7.1, eseguito il 27/10): registra_documento_team_subappalti,
correggi_documento_team_subappalti, elimina_documento_team_subappalti.
Dopo sql/33 (F7.2, eseguito il 28/10): imposta_date_commessa,
controllo_faldone_commessa, aggiungi_persona_faldone,
togli_persona_faldone, imposta_documenti_richiesti_faldone,
aggiungi_voce_faldone, imposta_stato_voce_faldone, togli_voce_faldone,
consegna_faldone_commessa.
Dopo sql/25 (F4.3, da eseguire): registra_fattura_anticipo,
registra_accredito_anticipo, rifiuta_per_anticipo_non_versato.
Dopo sql/22 (F4.1, da eseguire): accetta_preventivo, rifiuta_preventivo.
Dopo sql/34 (F8.1, eseguito il 28/10): scheda_cantiere_commessa,
imposta_dati_cantiere_commessa.
Dopo sql/35 (F8.2, da eseguire): salva_squadra_cantiere,
togli_giorno_squadra, impegni_squadra_periodo, miei_giorni_cantiere.
Dopo sql/36 (F8.3, da eseguire): salva_fase_commessa,
aggiungi_fasi_commessa, sposta_fase_commessa, togli_fase_commessa.
Dopo sql/37 (F8.4, da eseguire): salva_lavorazioni_commessa,
salva_giornale_cantiere, togli_giornale_cantiere,
presenti_giornale_commessa, mie_ore_cantiere.
Dopo sql/38 (F8.5, da eseguire): registra_lavoro_extra,
annulla_lavoro_extra, voci_lavori_extra_commessa.
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
codici attuali di `utenti.ruolo`. Il ruolo capo_operativo NON si crea
(decisione del 26/10).
Esiste anche `informatico` (Erika Pistolesi): accesso completo come il
titolare (decisione di Erika del 23/10, da confermare da Toli in F1.4).
Cambiano solo le etichette in interfaccia (Fase 3), mai il codice.
Nomi visibili nel gestionale (decisione 26/10): "Rappresentante" e
"Commerciale" restano così (NON "Commerciale"/"Acquisti" del flusso
appeso in ufficio); le etichette servono solo a non mostrare codici grezzi
(es. "Capo tecnico"). Soglia 3.000 € del rappresentante: resta fissa nel
DB (trigger e policy di sql/10), non configurabile. Vale per CREARE o
ALZARE l'importo: l'esito del cliente (accettato/rifiutato) lo registra
il rappresentante anche sopra 3.000 € (decisione 26/10, sql/23).

| Figura (organigramma) | Ruolo nel gestionale | Cosa fa già | Da fare |
|---|---|---|---|
| Direzione | titolare | Vede tutto | — |
| Commerciale verso il cliente (cliente, approvazione, ordini) | rappresentante | Trattative, progetti, riceve il PDF del preventivo | Accettazione, anticipo, ordini (Fasi 4–6) |
| Ingegnere | ingegnere | Verifiche tecniche, schede rilievo, certificati | Aggiungerlo al form nuovo utente (Fase 2) |
| Acquisti | commerciale (la parte acquisti) | Richieste ai fornitori, scelta fornitore, preventivo | Consumabili e noli dal cantiere (Fase 6) |
| Reparto Tecnico e squadre | tecnico | Esegue gli interventi, scheda di lavoro; vede i suoi cantieri (F8.2) e le sue ore in cantiere (F8.4) | Audit presidi (Fase 10) |
| Capo Operativo | capo_tecnico (nessun ruolo nuovo, decisione 26/10) | Pianifica gli interventi | Passi 8 e 11 del flusso commessa (documenti, consumabili e noli, cantiere); in sua assenza lo sostituisce un tecnico (modalità da definire) |
| Responsabile Service | capo_tecnico | Pianifica gli interventi | Contratti e appuntamenti (Fase 10) |
| Segreteria | segreteria | Interventi da pianificare, documenti | Anticipi, faldone, appuntamenti, chiusura |
| Programmazione e controllo | titolare (accesso completo) | — | — |
| Contabile (esterno all'organigramma) | contabile | Fatturazione | — |
| Informatico (esterno all'organigramma) | informatico | Accesso completo come il titolare | — |
| Subappaltatori | non sono utenti | Anagrafica con referente e documenti con scadenza (F7.1, sql/32); checklist faldone sulla commessa (F7.2, sql/33) | — |

Decisione D1 (chiusa da Erika il 23/10, da confermare da Toli in F1.4):
il "commerciale" verso il cliente è il ruolo rappresentante (anche per gli
agenti esterni); il ruolo commerciale è la parte acquisti. Non si
sovrappongono e non serve un ruolo nuovo. La Fase 4 usa rappresentante.

Pagine consentite oggi per ruolo (`PAGINE_RUOLO`,
js/02-portale-navigazione.js; controllo in `canAccessPage`):
- titolare: dashboard, calendario, piano-mensile, trattative,
  preventivi-titolare, preventivo-detail, progetti-da-preventivare, presidi,
  workflow, interventi, clienti, documenti, fatture, catalogo, impostazioni,
  cliente-detail, progetto-detail, fornitore-detail, tecnico, sopralluogo,
  commesse, commessa-detail, team-subappalti, scheda-documenti
- capo_tecnico: dashboard, calendario, calendario-team, piano-mensile,
  presidi, interventi, tecnico, clienti, documenti, cliente-detail,
  commesse, commessa-detail, team-subappalti, scheda-documenti
- segreteria: dashboard, calendario, workflow, presidi, interventi, tecnico,
  clienti, documenti, fatture, catalogo, cliente-detail, fornitore-detail,
  commesse, commessa-detail, team-subappalti, scheda-documenti
- contabile: dashboard, workflow, fatture, documenti, catalogo
- tecnico: dashboard, calendario-tec, tecnico, documenti
- commerciale: dashboard, progetti-da-preventivare, preventivi, fornitori,
  fornitore-detail, preventivo-detail, clienti, documenti, progetto-detail,
  fatture, catalogo, cliente-detail, info, commesse, commessa-detail
- rappresentante: dashboard, dashboard-rapp, calendario-appuntamenti,
  clienti, progetti, presidi, trattative, preventivi-rapp, cliente-detail,
  progetto-detail, catalogo, info, commesse, commessa-detail (solo le sue,
  per RLS)
- ingegnere: dashboard, calendario-ingegnere, verifiche-tecniche,
  documenti, certificati-ingegnere, progetto-detail, cliente-detail, info,
  + clienti (aggiunta subito dopo la definizione, sola consultazione)
- informatico: come titolare (in js/01-core.js `boot` ROLE diventa
  'titolare', etichetta "Informatico"; lato DB `ruolo_corrente()` in
  sql/07 restituisce 'titolare')

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

CAPO_OPERATIVO: non è un ruolo a sé (decisione del 26/10). Il Capo
Operativo del flusso commessa è il CAPO_TECNICO (passi 8 e 11); in sua
assenza lo sostituisce uno dei tecnici sotto di lui. La commessa NON la
apre il capo tecnico: nasce dall'approvazione del preventivo (passo 5).

## Flusso della commessa (documento interno TOLI, 12 passaggi)
Nomi del documento → ruolo nel gestionale: Commerciale = rappresentante,
Acquisti = commerciale, Ingegnere = ingegnere, Segreteria = segreteria,
Capo Operativo = capo_tecnico.
Il titolare non compare nel flusso: può intervenire in qualunque passo
(ha le funzioni di tutti), ma non è mai un passaggio obbligato
(decisione del 26/10).

| # | Chi (ruolo) | Cosa fa | Passa a |
|---|---|---|---|
| 1 | rappresentante | Riceve la chiamata del cliente e raccoglie i dati della richiesta | ingegnere (lavori grandi) o commerciale |
| 2 | ingegnere | Solo lavori grandi: dà i dati esatti per il preventivo o li integra | commerciale |
| 3 | commerciale | Prepara il pacchetto per i fornitori. Dubbi → reparto tecnico, che con il rappresentante sente il cliente | fornitori |
| 4 | commerciale | Sceglie il fornitore e redige il preventivo con i tempi di consegna | rappresentante |
| 5 | rappresentante | Contratta e fa approvare il preventivo; tempi sentiti fornitori e capo tecnico. **Qui nasce la commessa** | segreteria (se anticipo) |
| 6 | segreteria | Se c'è anticipo: emette la fattura e verifica l'accredito; il rappresentante lo ricorda nei giorni seguenti. **Senza accredito il preventivo non è approvato: la commessa si ferma** | rappresentante (via libera) |
| 7 | rappresentante | Ordina tutto, comunica le date di arrivo e gira tutta la documentazione | capo_tecnico |
| 8 | capo_tecnico | Esamina i documenti e chiede consumabili e noli mancanti | commerciale |
| 9 | commerciale | Procura consumabili e noli e comunica le date di arrivo | capo_tecnico |
| 10 | segreteria | Chiama il cliente e detta le date di inizio lavori; documenti dipendenti e subappalti; prepara il faldone | capo_tecnico (faldone) |
| 11 | capo_tecnico | Esegue il cantiere: report fotografici, cronoprogramma, % avanzamento, performance operai | segreteria |
| 12 | segreteria | Corretta messa in opera, fatture, chiusura della commessa | cliente |

Passo 1, soglia lavoro grande (F3.3, decisione di Erika del 26/10): il
passaggio all'ingegnere lo decide il rappresentante, nessun blocco. Il
progetto ha un "Importo stimato" (€, imponibile; colonna
`progetti_tecnici.importo_stimato`, sql/21-importo-stimato-progetti da
eseguire dopo sql/20). Sopra `impostazioni.soglia_lavoro_grande` compare
solo un avviso giallo ("valuta l'invio all'ingegnere"); "Invia al
commerciale" resta sempre possibile. Importo o soglia vuoti: nessun
avviso (js/17).

Rimanda indietro un preventivo avviato (richiesta di Erika del 28/10,
js/18 `apriRimandaPreventivoAvviato`, finestra m-rimanda-preventivo-avviato;
nessun SQL): nel riepilogo di un preventivo in BOZZA con progetto tecnico,
commerciale o titolare lo rimandano indietro. Il preventivo resta in bozza
con le voci; cambia solo lo stato del progetto: "Da preventivare"
(inviato_a_commerciale, nota facoltativa), al rappresentante (da_integrare)
o all'ingegnere (in_verifica_tecnica), con nota obbligatoria in
nota_integrazione come "Richiedi integrazione". In "Da preventivare" (js/17)
il progetto tornato con un preventivo in bozza compare con "Preventivo n. X
in bozza" e "🧾 Riprendi preventivo", che apre la bozza.

Passo 5, esito del cliente (F4.1, sql/22-esito-preventivo da eseguire):
il rappresentante (o il titolare) segna il preventivo "Accettato dal
cliente" (allegato obbligatorio: preventivo firmato o mail di
approvazione, bucket preventivi-documenti, cartella
`<id preventivo>/accettazione/`) o "Rifiutato dal cliente" (motivo
obbligatorio). Il database lo impone (trigger trg_preventivi_esito, RPC
accetta_preventivo / rifiuta_preventivo, che restituiscono il nuovo
stato: aggancio per F4.2, 'in_attesa_anticipo'). Il trigger della soglia
3.000 € blocca anche il solo cambio di stato fatto da un rappresentante:
sopra 3.000 € l'esito lo registra il titolare finché Toli non decide su
sql/23-soglia-3k-solo-importo (proposta). Pagina I miei preventivi
(js/13) e scheda preventivo (js/18, `cardEsitoPreventivo`).

Passi 5-6, anticipo (F4.2, sql/24-anticipo-preventivo da eseguire dopo
22 e 23): colonne `preventivi.anticipo_richiesto` (sì/no, vuoto = non
indicato), `anticipo_tipo` ('percentuale' del totale imponibile o
'importo' in € IVA esclusa), `anticipo_valore`. Il commerciale può
indicarlo nell'editor del preventivo (sotto "Modalità di pagamento", che
resta il testo del PDF); il rappresentante lo conferma o corregge nella
finestra "Accettato dal cliente" (scelta sì/no obbligatoria). Con
anticipo `accetta_preventivo` (nuova versione a 6 dati; quella a 3 usa
i dati salvati) porta il preventivo in `in_attesa_anticipo` (nuovo stato
nel vincolo preventivi_stato_check): da lì nessuno dal sito cambia
stato finché F4.3 non registra fattura d'anticipo e accredito
(segreteria e titolare; aggancio nel trigger trg_preventivi_esito). Dopo
l'esito i dati dell'anticipo non si cambiano. Lista "Anticipi da
fatturare" nella dashboard della segreteria (js/18
`loadAnticipiDaFatturare`, chiamata da js/03). Senza sql/24 nulla di
questo compare.

Passo 6, fattura d'anticipo e accredito (F4.3, sql/25-fattura-anticipo-
accredito da eseguire dopo 24): la segreteria (o il titolare) registra
la fattura d'anticipo emessa (numero, data, importo IVA esclusa;
correggibile finché manca l'accredito) e poi l'accredito verificato
(data; chi = utente collegato). Con l'accredito il preventivo diventa
`accettato` (via libera al rappresentante). RPC registra_fattura_anticipo
e registra_accredito_anticipo; il trigger trg_preventivi_esito impone le
stesse regole anche agli update diretti (aggancio F4.3 di sql/24). Scelta:
la fattura d'anticipo NON va nella tabella fatture (modulo Fatture in
costruzione): sul preventivo restano i riferimenti `anticipo_fattura_*` e
`anticipo_accredito_*`, da collegare alla fattura vera quando il modulo
emetterà gli anticipi. Bottoni nella lista "Anticipi da fatturare"
(dashboard segreteria) e nella scheda preventivo (titolare); il
riepilogo lo vedono tutti (js/18 `htmlFatturaAnticipoPreventivo`,
finestra m-anticipo-segreteria). Da 'in_attesa_anticipo' si esce solo
verso 'accettato' con l'accredito, oppure verso 'rifiutato' se il
cliente non versa l'anticipo (decisione 2 qui sotto).
Decisioni di Erika del 26/10 (F4.3):
1. CONFERMATO il blocco dopo l'esito: in in_attesa_anticipo, accettato
   e rifiutato voci, totale, sconto, IVA e stato restano fissi, tranne
   che per il titolare (trigger trg_preventivi_voci_blocco +
   trg_preventivi_esito, sql/25); nel sito l'editor delle voci è in sola
   lettura (resta "Genera PDF cliente"). Il blocco nel sito vale già
   senza sql/25.
2. Cliente che non versa l'anticipo: un preventivo in
   'in_attesa_anticipo' può essere portato a 'rifiutato' dalla
   SEGRETERIA o dal TITOLARE, con un motivo obbligatorio (es. "Anticipo
   non versato"). Il rappresentante no, il commerciale no. RPC
   rifiuta_per_anticipo_non_versato; il trigger trg_preventivi_esito lo
   impone anche agli update diretti e scrive lui chi/quando dell'esito;
   la fattura d'anticipo eventualmente registrata resta salvata. Bottone
   "Rifiuta: anticipo non versato" nella lista degli anticipi
   (dashboard segreteria) e nella scheda preventivo (titolare), finestra
   m-rifiuto-anticipo (motivo precompilato e modificabile, conferma).
I bottoni di fattura, accredito e rifiuto compaiono solo con sql/25.

Passo 6, promemoria al rappresentante (F4.4, nessun SQL): nella sua
dashboard (pg-dashboard-rapp, box `rap-promemoria-anticipi`, js/13
`caricaPromemoriaAnticipiRappresentante`) il rappresentante vede i suoi
preventivi in 'in_attesa_anticipo' (suoi o dei suoi clienti, come la
policy preventivi_lettura di sql/10): importo dell'anticipo IVA inclusa,
fattura d'anticipo emessa o in preparazione, giorni di attesa. Sparisce
da solo con l'accredito (stato 'accettato') o con il rifiuto per
anticipo non versato.

Passo 5, nasce la commessa (F5.1, sql/26-commesse da eseguire dopo 25):
tabella `commesse` (codice leggibile ANNO-NUMERO, es. 2026-001, numero
che riparte ogni anno; collegata a cliente, sede, preventivo, progetto
tecnico; una per preventivo). La crea il DATABASE (trigger
trg_preventivi_crea_commessa) quando il preventivo entra in 'accettato':
accettato diretto senza anticipo, oppure accredito verificato dopo
'in_attesa_anticipo'. In attesa dell'anticipo la commessa non esiste.
Nessuno la apre a mano (né capo tecnico né titolare). Distinzione
straordinario/manutenzione: nasce solo dai preventivi con
`progetto_tecnico_id` (ogni lavoro di cantiere passa dal progetto
tecnico; la manutenzione periodica vive in clienti_periodicita,
cicli_pianificati, ordini_lavoro). Sede: messa in automatico se il
cliente ha una sola sede principale (o una sola sede), altrimenti la
indicano rappresentante, segreteria o titolare (RPC
imposta_sede_commessa). Stato iniziale 'approvata'; i passaggi
successivi arrivano con F5.2. Lettura: titolare, segreteria,
commerciale, capo_tecnico, rappresentante (suoi clienti/preventivi).
Nessuna scrittura diretta dal sito. Un preventivo con commessa non si
cancella. Nel sito: codice nel riepilogo dell'esito (scheda preventivo,
Esiti registrati del rappresentante) e nel messaggio dopo accettazione o
accredito (js/18 `htmlCommessaPreventivo`). Preventivi accettati prima
di sql/26: commessa solo con sql/27-commesse-preventivi-gia-accettati
(facoltativo; il 27/10 l'anteprima era vuota: non serve).

Stati della commessa e storico (F5.2, sql/28-commesse-stati-storico
eseguito il 27/10 dopo 26): approvata → materiali_ordinati → in_preparazione →
pronta → in_corso → fine_lavori → chiusa, SOLO IN ORDINE e uno alla
volta (RPC cambia_stato_commessa; nessuna scrittura diretta). Chi segna
il passaggio: materiali ordinati = rappresentante del cliente (passo 7);
in preparazione = capo_tecnico (passo 8; il passo 9 degli acquisti non
cambia stato); pronta = segreteria (passo 10, faldone consegnato); in
corso e fine lavori = capo_tecnico (passo 11); chiusa = segreteria
(passo 12). Il titolare può fare ogni passaggio, mai obbligato; SOLO il
titolare riporta indietro (nota obbligatoria), annulla (nuovo stato
'annullata', motivo obbligatorio) e riattiva (torna allo stato di prima,
solo con preventivo accettato). 'in attesa anticipo' resta stato del
preventivo, non della commessa (che non esiste ancora). Caso aperto da
F5.1, deciso così: se il titolare riporta indietro un preventivo
accettato la commessa diventa da sola 'annullata' (nota con il nuovo
stato e l'eventuale motivo del rifiuto), non si cancella (codice e
storico restano); se il preventivo torna accettato la stessa commessa
si riattiva da sola nello stato di prima. Storico in `commesse_storico`
(da/a stato, tipo nascita/avanti/indietro/annullamento/riattivazione,
nota, chi con nome e ruolo copiati, quando), letto da chi legge la
commessa. Nel sito (js/18): nel riepilogo della commessa "Prossimo
passo" e bottone "Stato e storico" (finestra m-stato-commessa); nelle
dashboard di rappresentante, capo tecnico e segreteria il box
"Commesse: tocca a te" (`caricaCommesseToccaAMe`). Senza sql/28 nulla
di questo compare. Pagina Commesse completa: F5.3.

Pagina Commesse e cartella documenti (F5.3, js/26-commesse.js; cartella
con sql/29-commesse-documenti eseguito il 27/10, non richiede 28):
voce "📁 Commesse" nel menu di titolare, segreteria, commerciale,
capo_tecnico e rappresentante (gli stessi ruoli che leggono le commesse
per RLS; contabile, ingegnere e tecnico no). Pagina `commesse`: ricerca
(codice, cliente, lavoro, sede) e filtro per stato (predefinito
"Aperte"); in alto "Tocca a te" con le commesse che aspettano chi
guarda: sede da indicare (segreteria, rappresentante), prossimo stato
del suo ruolo (solo con sql/28), per il commerciale le commesse in
preparazione (passo 9, consumabili e noli; non cambia stato). Il
titolare non ha mai commesse "in attesa di lui". Scheda
`commessa-detail`: dati, sede del cantiere (imposta_sede_commessa:
anche la segreteria, che non vede preventivo-detail), collegamenti a
cliente/preventivo/progetto secondo le pagine del ruolo, stato e
storico (funzioni di js/18, solo con sql/28), cartella documenti. La
commessa si ritrova da: pagina Commesse, scheda cliente (tab
"📁 Commesse"), preventivo (riepilogo dell'esito, "Apri commessa e
documenti"), box "Commesse: tocca a te" delle dashboard ("Apri").
Cartella documenti, scelta dichiarata: bucket NUOVO commesse-documenti
(privato, 50 MB per file, qualsiasi tipo), NON documenti-clienti, perché
quello lo leggono anche contabile, ingegnere, tecnico e il portale
clienti, e il faldone contiene documenti di dipendenti e subappaltatori.
Percorso `<id commessa>/<cartella>/<file>`, cartelle fisse: ordini (passi
7 e 9), ddt, faldone (passo 10), cantiere (passo 11: foto, report,
cronoprogramma), certificati, chiusura (passo 12: corretta messa in
opera, collaudi), altro. Il preventivo firmato non si copia: resta in
preventivi-documenti `<preventivo>/accettazione/` e la cartella lo mostra
come collegamento (aperto da titolare, segreteria, commerciale,
rappresentante, regole di sql/22). Regole: chi vede la commessa vede
righe e file; caricano gli stessi 5 ruoli su commessa non chiusa e non
annullata (sempre il titolare); tolgono titolare e segreteria ogni
documento, gli altri solo i propri, su commessa aperta (sempre il
titolare). Nessuna sovrascrittura; il file si cancella solo dopo aver
tolto il suo rigo. Senza sql/29 la scheda mostra "La cartella documenti
della commessa non è ancora attiva".

Passo 7, ordini ai fornitori (F6.1, js/27-ordini-fornitori.js;
sql/30-ordini-fornitori eseguito il 27/10, richiede 26, non 28 né 29): nella
scheda della commessa il box "🛒 Ordini ai fornitori". Gli ordini
nascono SOLO dalle offerte 'selezionato' del preventivo della commessa
(preventivi_fornitori, scelte dal commerciale): un ordine non annullato
per offerta. L'ordine copia i dati del fornitore e ha voci (precompilate
dalle preventivi_voci collegate all'offerta con il costo_unitario, o una
voce "Fornitura ... come da Vostra offerta" con prezzo_offerto;
modificabili), importo IVA esclusa (somma delle voci, lo calcola il
database), data dell'ordine, arrivo previsto (obbligatorio), luogo di
consegna (precompilato con la sede del cantiere) e note. Codice
`<codice commessa>/<n>` (es. 2026-001/1). Stati ordinato → confermato
(data di arrivo confermata, nota) → arrivato (data di arrivo, non
futura); annullato da ordinato o confermato con motivo (non si
cancella, si rifà dalla stessa offerta). PDF dell'ordine (jsPDF +
autotable: intestazione TOLI FIRE, fornitore, commessa come riferimento
senza il nome del cliente, voci, totale IVA esclusa, note, chi ordina);
alla creazione si scarica e, con sql/29, si salva anche nella cartella
"ordini" della commessa (casella spuntata; bottone "Nella cartella" per
rifarlo). Scelta dichiarata dei ruoli: leggono gli ordini i 5 ruoli che
leggono la commessa; vedono le offerte (RPC offerte_ordinabili_commessa:
le tabelle dei fornitori restano chiuse al rappresentante), creano,
confermano e annullano rappresentante (sue commesse), commerciale e
titolare; segnano "arrivato" anche capo_tecnico e segreteria. Su
commessa chiusa o annullata solo il titolare. Lo stato "materiali
ordinati" resta del rappresentante (sql/28): quando tutte le offerte
hanno l'ordine il box lo suggerisce ("Segna Materiali ordinati"). Senza
sql/30 il box mostra "Gli ordini ai fornitori non sono ancora attivi".

Passi 8-9, consumabili e noli (F6.2, js/28-richieste-integrazione.js;
sql/31-richieste-integrazione eseguito il 27/10, richiede 26, non 28, 29 né
30): nella scheda della commessa il box "🧰 Consumabili e noli". Il
capo_tecnico (o il titolare) apre una richiesta per ogni cosa che manca:
consumabile o nolo, descrizione, quantità e unità (predefinite pz o
giorni), "serve dal" e per i noli "fino al" (facoltative), note per gli
acquisti ("Invia e chiedi altro" tiene aperta la finestra). Numero che
riparte per commessa (n. 1, 2...). Stati aperta → evasa (il commerciale
o il titolare indica l'arrivo previsto, obbligatorio, e se vuole
fornitore, dall'anagrafica o scritto a mano, costo IVA esclusa e nota;
finché non è arrivata la data si corregge con "Cambia data") → arrivata
(data effettiva, non futura: capo tecnico, commerciale, segreteria,
titolare); annullata da aperta o evasa con motivo (capo tecnico,
commerciale, titolare; non si cancella e non si riattiva). Leggono i 5
ruoli che leggono la commessa. Su commessa chiusa o annullata solo il
titolare. Segnali: "in ritardo" (arrivo previsto passato e non
arrivata), "arriva dopo il giorno in cui serve". Scelta dichiarata: la
richiesta evasa NON crea un ordine al fornitore (sql/30), basta la data
con fornitore e costo facoltativi. Gli stati della commessa non cambiano
da soli. "Tocca a te" (pagina Commesse, scheda, stellina nella scheda
cliente): al commerciale le commesse con richieste aperte (con sql/31
sostituisce il vecchio avviso generico "Passo 9" sulle commesse in
preparazione), al capo tecnico quelle con arrivi previsti entro oggi da
segnare. Dashboard: commerciale "Consumabili e noli da procurare" (box
com-richieste-integrazione, bottone Evadi), capo tecnico "Consumabili e
noli richiesti agli acquisti" (ct-richieste-integrazione, aperte ed
evase con le date, bottone Arrivata). Sostituto del capo tecnico
(un tecnico): NON gestito, modalità da decidere (oggi il tecnico non
vede le commesse). Senza sql/31 il box mostra "Le richieste di
consumabili e noli non sono ancora attive".

Elenco materiali e ritardi (F6.3, js/29-materiali-commessa.js; nessun
SQL nuovo: legge le tabelle di sql/30 e sql/31 con le loro policy, che
già aprono la lettura ai 5 ruoli della commessa): nella scheda della
commessa, sopra "Ordini ai fornitori", il box "📦 Materiali" con UN
elenco di tutto quello che deve arrivare in cantiere: ogni voce degli
ordini ai fornitori non annullati (descrizione, quantità, fornitore,
codice ordine) e ogni consumabile o nolo non annullato (fornitore se
indicato dagli acquisti), con arrivo previsto o data di arrivo e stato.
Ordine: prima i ritardi, poi gli arrivi per data, poi quello senza data
(da evadere, da ordinare); gli arrivati chiusi in "Arrivati (n)".
Segnale "in ritardo" (riga rossa) quando l'arrivo previsto è passato e
non è arrivato (oggi in ora italiana); resta "arriva dopo il giorno in
cui serve" di F6.2. Rappresentante, commerciale e titolare vedono anche
le offerte selezionate ancora "Da ordinare" (dati letti da js/27 con
offerte_ordinabili_commessa; capo tecnico e segreteria non vedono le
offerte). Elenco in sola lettura: le azioni restano nei box di js/27 e
js/28, che non cambiano. "Materiali ordinati" NON è automatico
(decisione F5.2, lo segna il rappresentante con cambia_stato_commessa):
il box dice solo se tutte le offerte sono ordinate ("Segna ... dal box
Ordini", bottone solo lì) o, per capo tecnico e segreteria, che il
rappresentante non l'ha ancora segnato. Dashboard del capo tecnico: box
"⚠️ Materiali in ritardo" (ct-materiali-ritardo, ordini e
consumabili/noli in ritardo sulle commesse aperte, solo "Apri
commessa"; compare solo se ce ne sono). Funziona con nessuna, una o
entrambe le fonti (senza 30 e 31 il box non compare; con una sola dice
quale parte manca).

Team e subappalti (F7.1, js/30-team-subappalti.js; sql/32-team-subappalti-
documenti eseguito il 27/10, richiede solo sql/07, non 26-31): prepara il passo
10 (documenti dei dipendenti e dei subappalti per il faldone; date di
inizio e checklist del faldone sulla commessa = F7.2, vedi sotto). Voce
"🦺 Team e subappalti" nel menu di titolare, segreteria e capo_tecnico
(pagine team-subappalti e scheda-documenti). Pagina con tab Scadenze
(documenti in vigore scaduti o entro il preavviso), Dipendenti (utenti
attivi con riepilogo) e Subappaltatori (ricerca, "anche non attivi").
Subappaltatore = anagrafica, NON utente: ragione sociale, partita IVA
(una volta sola), lavorazioni, contatti, referente (nome obbligatorio nel
sito, ruolo, telefono cliccabile, mail), note; "Non attivo" al posto
della cancellazione (esce da elenco e avvisi, i documenti restano).
Documento = di UN dipendente (utenti) o di UN subappaltatore: tipo, data
di rilascio (non futura), scadenza (vuota = senza scadenza, con
conferma), persona (solo subappaltatori, es. operaio col patentino),
nota, file facoltativo (bucket NUOVO privato documenti-team-subappalti,
50 MB, percorso `dipendenti/<utente>/<file>` o
`subappaltatori/<id>/<file>`; NON documenti-clienti, che legge anche il
portale). Tipi (scelta): elenco predefinito nel sito
(`TIPI_DOCUMENTO_TEAM_SUBAPPALTI`, js/30; per aggiungerne uno basta una
riga, il DB controlla solo la forma del codice) + "altro" con descrizione
obbligatoria. Impresa: DURC, visura camerale, POS, assicurazione RCT/RCO,
DVR, idoneità tecnico-professionale (All. XVII). Persona: formazione
lavoratori, addetto antincendio, primo soccorso, preposto, patentino
PLE, lavori in quota e DPI III cat., carrelli elevatori, idoneità
sanitaria. Con la data di rilascio il sito PROPONE la scadenza
(validità indicativa per tipo, es. DURC 120 giorni, antincendio 5 anni,
primo soccorso 3, preposto 2; modificabile, "verifica sul documento").
Rinnovo: "Rinnova o sostituisci" registra il nuovo documento e il
vecchio resta nello storico come sostituito (sostituito_da); avvisi e
controlli guardano solo i documenti in vigore. "Correggi" (✏️) cambia
tipo, date, persona e nota senza toccare il file; 🗑️ solo per gli
inserimenti sbagliati (cancella anche il file; se aveva sostituito un
documento, quello torna in vigore). Permessi (sql/32): titolare e
segreteria gestiscono tutto; capo_tecnico legge tutto in sola lettura;
ogni utente legge i propri documenti (il tecnico nel box "🪪 I miei
documenti" della sua dashboard, con il file). Dati sulla salute:
l'idoneità sanitaria è "riservato" (lo decide il DB): il capo tecnico
vede tipo e scadenza ma non apre il file (lo aprono titolare,
segreteria e il dipendente); il sito avvisa di caricare solo il giudizio
di idoneità, non la cartella sanitaria. Commerciale, rappresentante,
contabile, ingegnere: solo i propri (nessuna pagina). Avviso: box
"🪪 Documenti team e subappalti" nelle dashboard di segreteria
(seg-documenti-scadenza) e capo tecnico (ct-documenti-scadenza): scaduti
e in scadenza entro `impostazioni.giorni_preavviso_documenti` (default
30, 0-365, lo cambia il titolare in Impostazioni > Soglie e tariffe),
solo intestatari attivi; compare solo se c'è qualcosa. In Impostazioni >
Team bottone "🪪 Documenti" per ogni utente. Per F7.2:
`statoDocumentoTeamSubappalti(doc, allaData)` valuta un documento a una
data (es. inizio lavori). Un utente con documenti non si può eliminare
(vincolo del DB): va disattivato. Senza sql/32 la pagina mostra "non
ancora attivi", i box non compaiono e il preavviso in Impostazioni resta
disattivato.

Date dei lavori e faldone (F7.2, js/31-faldone-commessa.js;
sql/33-faldone-commessa eseguito il 28/10, richiede 26, 28 e 32, non 29-31):
passo 10. Box "🗂️ Date dei lavori e faldone" (cmd-faldone) nella scheda
della commessa. Date: la segreteria (o il titolare) fissa inizio lavori
(obbligatoria) e fine prevista (facoltativa, non prima dell'inizio);
colonne sulla commessa, le vede chi vede la commessa (rappresentante e
commerciale vedono solo le date). Faldone (lo leggono titolare,
segreteria, capo_tecnico, come i documenti di sql/32): nasce da solo con
la commessa (trigger; per quelle esistenti lo crea sql/33) con 4 voci
predefinite (POS della commessa, PSC o DUVRI del committente, elenco
personale e mezzi comunicato al cliente, autorizzazioni di accesso);
personale in cantiere = dipendenti (utenti attivi) e subappaltatori
(sql/32); documenti richiesti = fissi + "in più per questa commessa"
(codici di js/30, es. PLE, lavori in quota; per il subappaltatore anche
POS o DVR); altre voci (Da fare / Fatto / Non necessario; le
predefinite non si tolgono). Documenti richiesti fissi (proposta, da
confermare da Toli; nel DB `faldone_tipi_obbligatori`): dipendenti
formazione_lavoratori e idoneita_sanitaria; subappaltatori durc,
visura_camerale, assicurazione_rc. Controllo UNICO nel database
(`stato_faldone_commessa`, dal sito `controllo_faldone_commessa`):
documenti IN VIGORE (non sostituiti) validi alla data di inizio (o a
oggi, se l'inizio è passato). BLOCCANO 'pronta': data di inizio
mancante, nessuna persona, persona non attiva, documento mancante o
scaduto, voce "da fare". Solo AVVISO: fine prevista mancante, documento
che scade prima della fine prevista. "✅ Faldone consegnato al capo
tecnico" (consegna_faldone_commessa, segreteria e titolare, solo con la
commessa 'in preparazione'): se in regola segna la consegna e porta a
'pronta' (storico "Faldone consegnato al capo tecnico"); se non in
regola la segreteria non può, il titolare sì ma SOLO scrivendo il motivo
(consegna "forzata", motivo e problemi nello storico; proposta, da
confermare da Toli). Blocco nel DATABASE con un trigger su commesse
(trg_commesse_controllo_pronta, scelta: cambia_stato_commessa di sql/28
NON si ridefinisce): 'in preparazione' → 'pronta' passa solo dopo la
consegna e con il controllo in regola (o forzata), per qualunque strada
e anche per il titolare. Con sql/33 "Stato e storico" (js/18) non offre
più "→ Pronta" e rimanda alla scheda della commessa. Se il titolare
riporta la commessa prima di 'pronta' la consegna si azzera (va
rifatta). Modifiche: segreteria e titolare fino alla consegna, poi solo
il titolare; le date la segreteria le cambia finché la commessa non è
chiusa o annullata. Tornando dalla scheda documenti (js/30) la commessa
si ricarica. Senza sql/33 il box dice "non ancora attive" e 'pronta' si
segna come prima.

Scheda cantiere (F8.1, js/32-scheda-cantiere.js; sql/34-scheda-cantiere
eseguito il 28/10, richiede solo 07 e 26): passo 11. Nella scheda della
commessa due schede: "🏗️ Cantiere" (cmd-cantiere; si apre per prima per
il capo_tecnico, gli altri ruoli partono da "📁 Commessa e documenti";
ricaricando la stessa commessa resta la scheda scelta). Una schermata per
il telefono (390 px): Dove si va (indirizzo della sede, bottone "Apri la
mappa" Google Maps, note della sede; con sql/34 piano e zona, orari e
istruzioni di accesso), Con chi si parla (referente in cantiere, se
vuoto quello del cliente in anagrafica, e referente di RISERVA DEL
CLIENTE, con bottone "Chiama" tel:; personale del faldone se chi guarda
lo legge), Note di sicurezza (rischi, DPI, regole del cliente), Cosa si
fa (voci del preventivo con quantità e unità, SENZA prezzi, + descrizione
tecnica del progetto), Con cosa (materiali di js/29 riusati, ritardi,
"Chiedi consumabili o noli" di js/28), Allegati tecnici (file del
progetto, certificati del preventivo, cartella "certificati" della
commessa, schede di rilievo senza "note interne per il calcolo"). Dati
del cantiere = 10 colonne cantiere_* sulla commessa + chi/quando,
scritte SOLO con la RPC imposta_dati_cantiere_commessa: capo_tecnico,
segreteria, rappresentante (sue commesse), titolare; su commessa chiusa
o annullata solo il titolare; telefono solo cifre, spazi e + ( ) . / -.
Lettura senza prezzi con la RPC scheda_cantiere_commessa (stessi lettori
della commessa: capo tecnico e segreteria non leggono preventivi,
voci e progetti per RLS); nuova regola storage
commesse_file_tecnici_lettura (funzione file_tecnico_commessa_leggibile):
chi legge la commessa apre i file del progetto (progetti-tecnici) e i
certificati del preventivo (certificati-preventivi) di quella commessa.
Il sostituto del capo tecnico NON è implementato (domanda aperta).
Squadra del giorno, mezzi e calendario dei tecnici: F8.2, sotto. Senza
sql/34 la scheda mostra indirizzo, referente del cliente, materiali e
certificati della commessa e dice che il resto "non è ancora attivo".

Squadra e mezzi del giorno (F8.2, js/33-squadra-cantiere.js;
sql/35-squadra-cantiere da eseguire, richiede 07, 26 e 32, NON 28-31,
33, 34): passo 11. Box "👷 Squadra e mezzi del giorno" (cmd-squadra) in
fondo alla scheda "🏗️ Cantiere" della commessa: lo vedono titolare,
segreteria e capo_tecnico; scrivono capo_tecnico e titolare (RPC
salva_squadra_cantiere e togli_giorno_squadra; su commessa chiusa o
annullata solo il titolare; giorni prima di oggi, ora italiana, solo il
titolare). Finestra m-squadra-giorno: giorno, "stessa squadra fino al"
(facoltativo, max 63 giorni, "salta sabato e domenica"; i giorni già
organizzati si sostituiscono), orario o ritrovo, dipendenti (utenti
attivi tecnico e capo_tecnico), subappaltatori attivi (sql/32), mezzi e
attrezzature da spuntare, altri mezzi (testo libero), note; propone la
squadra dell'ultimo giorno organizzato. AVVISI (non bloccano, conferma
prima di salvare): già impegnato quel giorno (interventi assegnati,
calendario personale di tecnici e capi tecnici, altri cantieri; RPC
impegni_squadra_periodo, perché il capo tecnico non legge il calendario
personale altrui), mezzo già su un altro cantiere, documenti in vigore
scaduti al primo giorno o in scadenza entro l'ultimo (js/30
statoDocumentoTeamSubappalti), e solo se il faldone è attivo e ha
persone: "non è nel faldone" e documenti mancanti del faldone. Mezzi e
attrezzature, scelta dichiarata: piccola anagrafica
`mezzi_attrezzature` (nome, mezzo/attrezzatura, targa o matricola, note,
attivo; niente cancellazione), gestita da titolare, segreteria e capo
tecnico con la finestra "Elenco mezzi e attrezzature"
(m-mezzi-attrezzature, scrittura diretta per RLS), più il testo libero
"altri mezzi" per noli e attrezzi occasionali. Tabelle
commesse_squadra_giorni, commesse_squadra_persone (dipendente OPPURE
subappaltatore), commesse_squadra_mezzi: sola lettura per titolare,
segreteria e capo_tecnico, si scrivono solo con le RPC. Il TECNICO non
legge commesse né queste tabelle: la RPC miei_giorni_cantiere(dal, al)
restituisce SOLO i giorni in cui chi chiede è in squadra (commessa non
annullata), senza prezzi: codice e titolo, cliente e referente,
indirizzo e note della sede, orario e note del giorno, colleghi con
telefono, subappaltatori con referente, mezzi; con sql/33 e 34 anche
date dei lavori, piano e zona, orari e istruzioni di accesso, referenti
in cantiere, note di sicurezza (letti come chiavi della riga: senza 33
e 34 restano vuoti). Nel sito: riquadro "🏗️ I miei cantieri del mese"
in pg-calendario-tec (cal-tec-cantieri, chiamato alla fine di
loadCalendarioTecnico, js/05) e "🏗️ I miei cantieri" (oggi e 6 giorni)
nella dashboard del tecnico (tec-miei-cantieri, da js/03), con "Apri la
mappa" e "Chiama". Non toccati: lista degli interventi del calendario
del tecnico, calendario-team del capo tecnico (i cantieri non ci
compaiono ancora), calendario del capo tecnico se è lui in squadra. Il
sostituto del capo tecnico NON è implementato (domanda aperta). Senza
sql/35 il box dice "non sono ancora attivi", il calendario e la
dashboard del tecnico sono come prima.

Cronoprogramma e % di avanzamento (F8.3, js/34-cronoprogramma-
commessa.js; sql/36-cronoprogramma-commessa da eseguire, richiede 07 e
26, NON 28-35): passo 11. Box "📅 Cronoprogramma e avanzamento"
(cmd-cronoprogramma) nella scheda "🏗️ Cantiere", dopo la scheda
cantiere e prima della squadra; riquadro compatto della % in cima alla
scheda Cantiere (cmd-avanzamento-cantiere, solo se ci sono fasi) e sotto
il riepilogo in "Commessa e documenti" (cmd-avanzamento, con "Apri il
cronoprogramma"); colonna "Avanzamento" nella pagina Commesse (th
commesse-th-avanzamento, nascosta senza sql/36; sul telefono la % anche
sotto il codice). Tabella `commesse_fasi`: nome, ordine, peso (1-100,
predefinito 1), inizio/fine previsti, inizio/fine effettivi (mai dopo
oggi, ora italiana), percentuale 0-100, note, chi/quando. Regole (DB):
100% se e solo se c'è la fine effettiva (100% senza data = finita oggi;
fine effettiva con meno del 100% = errore); oltre lo 0% serve l'inizio
effettivo (se manca = oggi); max 60 fasi. % DELLA COMMESSA = somma(peso
x %) / somma(peso), arrotondata, calcolata dal sito
(`calcolaAvanzamentoFasi`, stessa formula in scheda e pagina Commesse);
senza fasi "Cronoprogramma da preparare". Scelta: peso a mano
(predefinito 1 = tutte uguali), NON in giorni (la durata non dice
quanto lavoro c'è). Fase IN RITARDO: fine prevista prima di oggi e non
al 100% (non si salva). Avvisi senza blocco: fasi fuori dalle date dei
lavori (sql/33), fine lavori prevista passata con % sotto 100, commessa
in fine lavori o chiusa con % sotto 100. Mini cronoprogramma a barre
solo CSS (previsto riempito con la %, effettivo sotto, linea di oggi).
SCRIVONO capo_tecnico e titolare (RPC salva_fase_commessa,
aggiungi_fasi_commessa, sposta_fase_commessa, togli_fase_commessa; su
commessa chiusa o annullata solo il titolare); LEGGONO tutti quelli
che leggono la commessa (rappresentante solo le sue). Finestra
m-fase-cronoprogramma (cursore e bottoni 0/25/50/75/100%, date, peso,
note, "Togli la fase"); "Proponi le fasi dal preventivo"
(m-proposta-fasi): voci del preventivo senza prezzi da
scheda_cantiere_commessa (sql/34; senza, solo le fasi tipiche),
spuntate quelle di manodopera e servizi (se non ce ne sono, i
materiali), noli e trasporti no, più 3 fasi tipiche non spuntate
(allestimento, prove e collaudo, smobilizzo). Lo stato della commessa
NON cambia da solo: con tutte le fasi al 100% e la commessa "in corso"
capo tecnico e titolare vedono "Segna Fine lavori" (apre "Stato e
storico" di js/18, solo con sql/28). Giornale di cantiere, foto, ore e
performance: F8.4. Senza sql/36 il box dice "non sono ancora attivi"
e la colonna non compare.

Giornale di cantiere e performance operai (F8.4, js/35-giornale-
cantiere.js; sql/37-giornale-cantiere da eseguire, richiede 07, 26 e 32,
tutti in produzione; NON richiede 28, 33-36): passo 11. Nella scheda
"🏗️ Cantiere", dopo la squadra: box "📓 Giornale di cantiere"
(cmd-giornale; titolare, segreteria, capo_tecnico) e "⏱️ Ore stimate e
ore effettive" (cmd-ore; SOLO titolare e capo_tecnico), più il riquadro
compatto delle ore in "Commessa e documenti" (cmd-ore-compatto). Un
giorno per commessa (commesse_giornale): presenti con le ore, lavori
fatti, problemi e note, foto. Ore (commesse_giornale_ore): dipendente
(tecnico o capo tecnico) OPPURE subappaltatore con il numero di persone,
lavorazione (vuota = "Altro, non in elenco"), ore a testa da 0,25 a 24 a
quarti d'ora; ore effettive = ore x persone; un dipendente max 24 ore al
giorno sommando tutti i cantieri. Finestra m-giornale-cantiere (pensata
per il telefono): propone la squadra organizzata per quel giorno (js/33,
se sql/35 c'è) con 8 ore a testa, se no i presenti dell'ultimo giorno
compilato; "➕ altra lavorazione" divide le ore della stessa persona.
SCRIVONO capo_tecnico e titolare (RPC salva_giornale_cantiere, che
sostituisce le ore del giorno, e togli_giornale_cantiere): giorni futuri
mai; giorni passati senza limite (decisione 28/10);
commessa chiusa o annullata solo il titolare. Decisioni di Erika del
28/10: i tecnici NON segnano da soli le proprie ore (solo capo tecnico e
titolare); nessun limite di giorni per il capo tecnico (tolto il limite
dei 7 giorni: corregge qualunque giorno passato della commessa aperta);
la segreteria non vede le ore per persona; riepilogo ore su tutte le
commesse: task a parte (Moduli da costruire, punto 6). LAVORAZIONI E ORE STIMATE,
scelta dichiarata: tabella commesse_lavorazioni (nome, ore_stimate
facoltative a quarti d'ora, unità e quantità copiate dal preventivo, max
60) salvata tutta insieme con salva_lavorazioni_commessa (finestra
m-lavorazioni-ore); il preventivo non ha una colonna ore e non si tocca:
il sito PROPONE le voci del preventivo (scheda_cantiere_commessa di
sql/34, senza prezzi; spuntate manodopera, servizi e voci in ore) e le
voci con unità in ore (h, ora, ore, ore uomo...) danno la quantità come
ore stimate; propone anche le fasi del cronoprogramma (js/34, se sql/36
c'è), senza ore. Una lavorazione con ore nel giornale non si toglie.
FOTO, scelta dichiarata: nessuna tabella nuova, riuso della cartella
documenti della commessa (sql/29, bucket privato commesse-documenti,
cartella "cantiere", registra_documento_commessa); il file si chiama
`giornale_<AAAA-MM-GG>_...` e il giornale ritrova così le foto del
giorno (anteprime con link firmati); foto oltre 1,2 MB rimpicciolite nel
browser (lato max 1920 px, JPEG); bottone "📷 Foto di oggi" e 📷 sul
giorno per caricarle con un tocco; togliere una foto = regole della
cartella (js/26). Togliendo un giorno le foto restano nella cartella.
CONFRONTO ORE: per lavorazione (effettive su stimate, barra, "+N h oltre
la stima" o "restano N h", chi ci ha lavorato), totale della commessa
(più le ore su lavorazioni senza stima), con sql/36 la stima "a questo
ritmo per finire servono circa N h" (ore effettive / % avanzamento);
per persona (giorni, ore, media al giorno, ore per lavorazione e % delle
stimate) e per squadra (squadra = le stesse persone presenti nello
stesso giorno: giorni insieme, ore, media al giorno, ore per
lavorazione). PERMESSI (dato sensibile): le ore per persona le vedono
solo titolare e capo tecnico; la segreteria vede il giornale e i
presenti senza ore (RPC presenti_giornale_commessa); il tecnico vede
solo le sue ore nel calendario (riquadro "⏱️ Le mie ore in cantiere del
mese", cal-tec-ore, RPC mie_ore_cantiere, chiamata da js/05);
commerciale, rappresentante, contabile, ingegnere: niente. I tecnici NON
segnano da soli le proprie ore (domanda aperta per Toli). Senza sql/37 i
box dicono "non ancora attivo" e il calendario del tecnico è come prima.

Lavori extra e fine lavori (F8.5, js/36-lavori-extra.js; sql/38-lavori-
extra da eseguire, richiede 07, 22 e 26, tutti in produzione; NON
richiede 28-37): passi 11-12. NOMI: "Commerciale" del documento del flusso
= rappresentante (fa approvare), "Acquisti" = commerciale (prepara il
preventivo dal progetto tecnico). Scelta dichiarata (da confermare da
Toli): il lavoro extra arriva al COMMERCIALE (prepara il preventivo
integrativo, come ogni preventivo dal progetto tecnico: nel sito il
rappresentante non crea preventivi) e al RAPPRESENTANTE del cliente (lo
fa approvare, soglia 3.000 € invariata). Registrano capo_tecnico e
titolare (box "➕ Lavori extra", cmd-lavori-extra, nella scheda Cantiere;
finestra m-lavoro-extra: cosa chiede il cliente, dettagli, chi lo chiede).
COLLEGAMENTO, scelta dichiarata: NESSUNA colonna nuova su preventivi.
registra_lavoro_extra crea un progetto tecnico NUOVO (stesso cliente,
rappresentante della commessa, tipologia del progetto principale, titolo
"Lavoro extra n. N – commessa 2026-001: ...", descrizione con sede, chi e
"non si esegue prima dell'accettazione") in stato
'inviato_a_commerciale': compare da solo nella lista "Da preventivare"
del commerciale e "Avvia preventivo" (js/17 avviaPreventivo, nessuna
modifica) crea il preventivo integrativo. Tabella commesse_lavori_extra
(commessa, numero per commessa, descrizione, dettagli, chi lo chiede,
progetto_tecnico_id UNICO, stato, preventivo_id/numero/stato copiati,
esito, annullamento). Lo STATO lo calcola il trigger nuovo
trg_preventivi_lavori_extra sui preventivi del suo progetto: richiesto
(nessun preventivo) → in_preventivo (bozza, al rappresentante, in attesa
anticipo) → accettato (con anticipo: dopo l'accredito) | rifiutato
(rifiutato o scaduto); annullato a mano (annulla_lavoro_extra, motivo
obbligatorio, SOLO da richiesto o rifiutato: con il preventivo in corso
si registra il rifiuto sul preventivo; capo tecnico, commerciale,
rappresentante sue commesse, titolare; il progetto va in 'archiviato').
NIENTE COMMESSA NUOVA: trigger nuovo trg_commesse_niente_lavori_extra
(BEFORE INSERT su commesse) salta la nascita se il progetto è di un
lavoro extra; trg_preventivi_crea_commessa e crea_commessa_per_preventivo
di sql/26 NON sono ridefiniti (vale anche per sql/27). NON ESEGUIBILI
PRIMA DELL'ACCETTAZIONE: in cima alla scheda Cantiere avviso rosso
(cmd-lavori-extra-avviso) "NON eseguirli"; ogni lavoro richiesto o in
preventivo ha "⛔ Non eseguire"; l'accettato mostra le voci del preventivo
integrativo SENZA prezzi (RPC voci_lavori_extra_commessa: il capo tecnico
non legge i preventivi) e solo allora le sue voci sono proposte come
lavorazioni del giornale (js/35 "Extra n. N: ..."). Riquadro in
"Commessa e documenti" (cmd-lavori-extra-compatto). AVVISI: dashboard
commerciale "Lavori extra da preventivare" (com-lavori-extra, bottone
"Prepara il preventivo integrativo" = avviaPreventivo), rappresentante
(rap-lavori-extra), capo tecnico (ct-lavori-extra, anche gli accettati
finché non è fine lavori); "Tocca a te" della pagina Commesse: al
commerciale richiesti e bozze, al rappresentante quelli inviati a lui
da far approvare. "Rimanda indietro" (js/18) e "Richiedi integrazione":
se il progetto del lavoro extra è dal rappresentante (da_integrare,
bozza) o dall'ingegnere (in_verifica_tecnica) il lavoro mostra
"rimandato al rappresentante" / "rimandato all'ingegnere (verifica
tecnica)", senza "Prepara/Riprendi il preventivo" e senza "Tocca a te"
per il commerciale; tornato in inviato_a_commerciale, pronto_per_
preventivo o in_preventivazione riappare "Riprendi il preventivo"
(stato letto con progetti_tecnici(stato)). Il rappresentante vede "I
miei preventivi" solo con il preventivo inviato a lui o al cliente.
Nel riepilogo dell'esito del preventivo integrativo
accettato (js/18) "Preventivo integrativo: lavoro extra n. N della
commessa ..." al posto di "Nessuna commessa collegata". L'importo della
commessa NON cambia (gli extra sono nei loro preventivi). FINE LAVORI →
SEGRETERIA: il box "Commesse: tocca a te" della segreteria c'era già
(js/18, fine_lavori → chiusa); nuovo box "🏁 Fine lavori: ora tocca alla
segreteria" (cmd-chiusura, in "Commessa e documenti", solo con la
commessa in fine lavori e sql/28; funziona anche senza sql/38): chi e
quando ha segnato la fine (storico), nota, % del cronoprogramma (js/34),
lavori extra accettati da fatturare e ancora in attesa, consumabili e
noli non arrivati (js/28), cartella "chiusura" vuota o no; bottone
"Chiudi la commessa" (segreteria, titolare: apre "Stato e storico").
Nella finestra "Stato e storico" passando a Fine lavori o Chiusa avviso
giallo se ci sono lavori extra ancora in attesa (non blocca). Senza
sql/38 il box dice "non ancora attivi", nessun avviso né box in
dashboard.

Dichiarazione di corretta messa in opera (F9.1, js/37-dichiarazione-
messa-in-opera.js; NESSUN SQL nuovo): passo 12. Box "📄 Dichiarazione
di corretta messa in opera" (cmd-dichiarazione, in "Commessa e
documenti" sotto cmd-chiusura) per segreteria e titolare, con la
commessa in fine_lavori o chiusa (serve sql/28). Finestra
m-dichiarazione-posa (id con prefisso dmo-): dati PRECOMPILATI e non
modificabili (committente con P.IVA/C.F. e sede legale; luogo dei lavori
= sede della commessa + piano e zona di sql/34; commessa, preventivo,
lavoro e tipologia; periodo dei lavori = data_inizio del faldone, sql/33,
→ data della "fine lavori" nello storico, sql/28). Elenchi con spunta,
SENZA prezzi: voci del preventivo da scheda_cantiere_commessa (sql/34;
senza 34 lettura diretta di preventivi_voci, che la segreteria non vede
per RLS: avviso); categoria materiale → "Prodotti e materiali posati in
opera", le altre → "Lavorazioni eseguite"; noli, trasporti e voci tipo
"dichiarazione/certificazione/pratica" NON spuntati. Facoltativi: voci
dei lavori extra accettati (voci_lavori_extra_commessa, sql/38) e voci
degli ordini ai fornitori (sql/30, non spuntate: ripetono i materiali,
servono per il fornitore). Classi lette dalle descrizioni
(classificazioniDaDescrizione: REI/EI/E…, euroclassi di reazione al
fuoco, classe 0/1/2, capacità estinguente 34A 233B C, norme UNI/EN,
omologato, marcatura CE): nessun campo nuovo. Certificati:
preventivi_certificati (sql/34) + cartella "certificati" della commessa
(solo nomi dei file). Modificabili: testo della dichiarazione e
riferimenti normativi (predefiniti DA CONFERMARE DA TOLI: D.M. 3/8/2015,
D.M. 7/8/2012, D.M. 16/2/2007, D.M. 21/6/2004, Reg. UE 305/2011, D.M.
1/9/2021, D.M. 2/9/2021; "Ripristina i testi predefiniti"), note,
nome del responsabile tecnico (vuoto = a mano). PDF jsPDF con
intestazione TOLI FIRE come l'ordine (js/27): luogo, data, "Il
responsabile tecnico", riquadro timbro e firma. "Genera e salva in
Chiusura": bucket commesse-documenti `<id>/chiusura/`, RPC
registra_documento_commessa (sql/29; su commessa chiusa solo il
titolare, gli altri "Solo scarica"); nome file
Dichiarazione_messa_in_opera_<codice>_<cliente>.pdf, il box conta quelle
salvate. Domande aperte per Toli: il capo tecnico può generarla
(RUOLI_DICHIARAZIONE_POSA)? testo e riferimenti normativi; nome fisso del
responsabile tecnico; per la SCIA ai VV.F. serve comunque la modulistica ufficiale (es. DICH.PROD, PIN 2.3): questo PDF è la dichiarazione dell'impresa da allegare.

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
   - D5: CHIUSA (26/10) — nessuna approvazione obbligatoria del
     titolare. Il titolare può fare tutto quello che fanno gli altri
     ruoli e intervenire quando vuole, ma non è mai un passaggio
     obbligato del flusso. `inviaPreventivoPerApprovazione` resta non
     collegata (candidata a rimozione con conferma di Toli).
   - D7: costruire le schede di manutenzione ordinaria del tecnico
     (`apriManutenzioneOrdinaria`/`salvaManutenzioneOrdinaria` chiamate da
     index.html ma mai scritte: oggi il bottone non fa nulla).
   - D6: `ricordaPosizionePagina` è solo nella copia morta di renderPC
     (js/07): rimetterla nella versione usata (js/09).

6. **Riepilogo ore degli operai su tutte le commesse** — chiesto da Erika
   il 28/10 (risposta alla domanda 4 di F8.4). Pagina per il titolare
   (e capo tecnico?) con le ore di ogni dipendente e subappaltatore in
   cantiere, per periodo, sommate su tutte le commesse, con il confronto
   ore stimate/effettive per lavorazione. Dati da sql/37 (giornale di
   cantiere). Da pianificare come task a parte dopo F8.5.
