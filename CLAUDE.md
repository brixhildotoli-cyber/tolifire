# Toli Fire — Gestionale Antincendio

## Cos'è
Gestionale per azienda di antincendio. Frontend HTML/CSS/JS vanilla, non più
file unico: `index.html` (markup) + `style.css` + moduli `js/00-…46-*.js`
caricati in ordine 00–18, poi 20–55, infine `19-init.js` (dettagli in
README.md). Backend: Supabase (Postgres + Auth + API + Storage).
Librerie CDN: supabase-js v2, xlsx 0.18.5, jspdf 2.5.1, jspdf-autotable 3.8.2.
La struttura aziendale costa 1000 €/giorno lavorativo: le KPI del titolare
sono critiche.

Branch: `sviluppo` = lavoro; `gestionale_new` = branch pubblicato su GitHub
Pages (il sito usato dai dipendenti: solo merge provati). Si pubblica con
`zsh ~/Desktop/GESTIONALE/pubblica.sh` (dal 02/11: numero di versione
`?v=` agli script e a style.css in index.html, poi push; vedi README). `main` locale e
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
Dopo sql/35 (F8.2, eseguito il 28/10, richiede 07, 26 e 32): mezzi_attrezzature
(lettura, inserimento e modifica diretti di titolare, segreteria,
capo_tecnico; niente cancellazione: attivo=false),
commesse_squadra_giorni, commesse_squadra_persone,
commesse_squadra_mezzi (sola lettura per titolare, segreteria,
capo_tecnico; si scrivono solo con le RPC della squadra, js/33).
Dopo sql/36 (F8.3, eseguito il 28/10, richiede 07 e 26): commesse_fasi
(sola lettura per chi legge la commessa; si scrive solo con le RPC del
cronoprogramma, js/34).
Dopo sql/37 (F8.4, eseguito il 28/10, richiede 07, 26 e 32): commesse_lavorazioni
(lettura per chi legge la commessa), commesse_giornale (lettura titolare,
segreteria, capo_tecnico), commesse_giornale_ore (lettura SOLO titolare e
capo_tecnico: ore per persona); si scrivono solo con le RPC del giornale,
js/35.
Dopo sql/38 (F8.5, eseguito il 28/10, richiede 07, 22 e 26): commesse_lavori_extra
(sola lettura per chi legge la commessa; si scrive solo con
registra_lavoro_extra e annulla_lavoro_extra e dal trigger sui
preventivi, js/36).
Dopo sql/39 (F9.2, eseguito il 28/10, richiede 25, 26, 28 e 29): colonne nuove
commesse.fattura_finale_* (numero, data, importo, calcolato, con_extra,
dettaglio, nota, registrata_da, registrata_da_nome, registrata_il) e
chiusura_forzata, chiusura_motivo_forzatura, chiusura_problemi (sola
lettura per chi legge la commessa; le scrivono solo le RPC di js/38).
Dopo sql/40 (F10.1, eseguito il 29/10, richiede solo 07): colonne nuove
clienti_periodicita.presidi_contratto (jsonb), preventivo_id,
contratto_stato (lo cambia solo registra_rinnovo_contratto) ed
evacuatore_fumi (se manca); tabella clienti_periodicita_rinnovi (sola
lettura, la scrive solo registra_rinnovo_contratto, js/39).
Dopo sql/41 (F10.2, eseguito il 29/10, richiede solo 07; legge sql/40 se c'è):
colonne nuove impianti.annata (anno di fabbricazione) e
ordini_lavoro.audit_presidi, audit_presidi_da, audit_presidi_il,
audit_presidi_nota (le cambia solo il database o
imposta_audit_presidi_intervento); tabella audit_presidi (sola lettura,
la scrivono solo le RPC dell'audit, js/40).
Dopo sql/43 (F10.3, ESEGUITO il 30/10, richiede solo 07; non richiede 40 né 41):
colonne nuove ordini_lavoro.appuntamento_richiesto, appuntamento_giorno,
_ora, _contatto, _contattato_il, _nota, _fissato_da, _fissato_da_nome,
_fissato_il, _motivo, _motivo_il (le cambiano solo il database e le RPC
dell'appuntamento) e appuntamento_fissato (calcolata dal database);
tabella ordini_lavoro_appuntamenti (storico, sola lettura per titolare,
capo_tecnico, segreteria; la scrivono solo funzioni e trigger di sql/43,
js/41); policy RESTRITTIVE ordini_lavoro_tecnico_appuntamento e
_modifica (il tecnico non vede gli interventi senza appuntamento fissato).
Dopo sql/42 (decisioni del 29/10, eseguito il 29/10, richiede 07, 22, 26, 30,
33 e 36, tutti in produzione; NON 40 né 41): colonne nuove
ordini_fornitori.arrivo_annullato_il, _da, _da_nome, _motivo, _data
(ultimo ritorno da arrivato a confermato; le scrive solo
cambia_stato_ordine_fornitore) e commesse_fasi.ore_previste (le scrive
solo salva_fase_commessa_ore, js/34).

Usate dal frontend — fatturazione:
fatture (lista, js/06-fatture-workflow.js `loadFatture`; il modulo Fatture
è in costruzione, vedi sotto). Dopo sql/45 (F11.1, eseguito il 30/10):
fatture_righe (lettura; bozze scritte solo con le RPC salva_bozza_fattura
ed elimina_bozza_fattura, js/43-fatture-bozze.js). Dopo sql/46 (F11.2,
eseguito il 30/10): fatture_scadenze (lettura; le scrivono solo le RPC
di emissione e pagamento) e fatture_pagamenti (tabella nuova, sola
lettura; RPC registra_pagamento_fattura e annulla_pagamento_fattura,
js/44-fatture-emissione.js). Dopo sql/47 (F11.3, eseguito il 30/10):
riba_presentazioni, riba_righe (lettura per titolare, segreteria,
contabile; le scrivono solo le RPC delle distinte RIBA), solleciti
(lettura; anche il rappresentante per i suoi clienti; li scrivono solo
le RPC dei solleciti), js/45-fatture-riba-solleciti.js; colonne nuove
clienti.banca_appoggio/abi_appoggio/cab_appoggio e
impostazioni.banca_azienda/iban_azienda (scritte dal sito).

Presenti nel DB ma NON usate dal frontend (19, al 22/10/2026; con sql/45
fatture_righe passa tra le usate, con sql/46 fatture_scadenze, con sql/47
riba_presentazioni, riba_righe e solleciti):
ads_crm_nuovi_contatti, ads_crm_qualificazioni, calendario_slot, contratti,
fatture_righe, fatture_scadenze, indirizzi_cliente, listini, notifiche,
periodicita_presidi, portale_clienti, preventivi_righe,
preventivi_schede_tecniche, riba_presentazioni, riba_righe, ruoli,
solleciti, verbali, verifiche_presidi.
Nota: le tabelle del modulo Fatture (fatture_righe, fatture_scadenze,
riba_presentazioni, riba_righe, solleciti) esistono già in produzione
(0 righe): prima di eseguire la Fase 1 del modulo, confrontare lo schema
reale in `sql/schema/` con l'SQL preparato. Non cancellare le tabelle non
usate senza conferma di Toli. Confronto FATTO in F11.1 (29/10): la Fase 1
era già stata eseguita a maggio (tabelle, 6 trigger, policy di sql/10),
ma senza vincoli sugli stati; nel repository non c'era un "SQL pronto"
da rieseguire. sql/45 aggiunge con ALTER solo quello che manca.

Bucket Storage usati dal frontend: documenti-clienti, foto-interventi,
preventivi-documenti, progetti-tecnici, ticket-allegati,
certificati-preventivi; dopo sql/29 (F5.3) commesse-documenti; dopo
sql/32 (F7.1) documenti-team-subappalti; dopo sql/47 (F11.3) fatture-pdf
(copie PDF delle fatture emesse: <id fattura>/<file>.pdf; legge chi
legge la fattura, caricano titolare, segreteria, contabile; niente
sovrascrittura né cancellazione dal sito). Con sql/42 il capo tecnico apre
in preventivi-documenti SOLO l'allegato di accettazione dei preventivi
delle commesse (regola commesse_preventivo_firmato_lettura).

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
Dopo sql/35 (F8.2, eseguito il 28/10): salva_squadra_cantiere,
togli_giorno_squadra, impegni_squadra_periodo, miei_giorni_cantiere.
Dopo sql/36 (F8.3, eseguito il 28/10): salva_fase_commessa,
aggiungi_fasi_commessa, sposta_fase_commessa, togli_fase_commessa.
Dopo sql/37 (F8.4, eseguito il 28/10): salva_lavorazioni_commessa,
salva_giornale_cantiere, togli_giornale_cantiere,
presenti_giornale_commessa, mie_ore_cantiere.
Dopo sql/38 (F8.5, eseguito il 28/10): registra_lavoro_extra,
annulla_lavoro_extra, voci_lavori_extra_commessa.
Dopo sql/39 (F9.2, eseguito il 28/10): controllo_chiusura_commessa,
registra_fattura_finale_commessa, chiudi_commessa.
Dopo sql/40 (F10.1, eseguito il 29/10): registra_rinnovo_contratto.
Dopo sql/41 (F10.2, eseguito il 29/10): registra_audit_presidi,
imposta_audit_presidi_intervento, audit_presidi_da_esaminare,
segna_audit_presidi_esaminato.
Dopo sql/43 (F10.3, eseguito il 30/10): fissa_appuntamento_intervento,
rimanda_appuntamento_segreteria, imposta_appuntamento_richiesto;
portale_ticket ridefinita (in più l'ora dell'appuntamento fissato;
rollback = versione di sql/13).
Dopo sql/44 (F10.4, ESEGUITO il 30/10, richiede 07 e 40): prezzi_contratto_cliente
(sola lettura: preventivo del contratto e prezzi di vendita delle voci).
Dopo sql/45 (F11.1, ESEGUITO il 30/10, richiede 07 e 26): salva_bozza_fattura,
elimina_bozza_fattura.
Dopo sql/46 (F11.2, ESEGUITO il 30/10, richiede 25, 26, 39):
emetti_fattura, emetti_fattura_anticipo, emetti_fattura_finale_commessa,
registra_pagamento_fattura, annulla_pagamento_fattura, emetti_nota_credito.
Dopo sql/49 (file CBI RiBa, ESEGUITO il 30/10, richiede 47): nessuna RPC
nuova; colonna impostazioni.codice_sia (letta da tutti, scritta dal
titolare), js/48-riba-cbi.js.
Dopo sql/47 (F11.3, ESEGUITO il 30/10): salva_presentazione_riba,
elimina_presentazione_riba, segna_presentazione_riba_inviata,
registra_esito_riba, annulla_esito_riba, registra_sollecito,
esito_sollecito, elimina_sollecito.
Dopo sql/42 (decisioni del 29/10, eseguito il 29/10): preventivo_firmato_commessa,
salva_fase_commessa_ore; cambia_stato_ordine_fornitore ridefinita (in
più: 'confermato' da 'arrivato', solo titolare, con motivo).
Dopo sql/48 (schede di rilievo multiple, ESEGUITO il 30/10, richiede 07 e 34;
prima si pubblica il sito): elimina_scheda_rilievo; scheda_cantiere_commessa
ridefinita (in più numero e nome della scheda; rollback = versione di sql/34).
Dopo sql/61 (telefoni italiani per Google Ads, ESEGUITO il 03/11, backup pre61, nessun
prerequisito oltre le funzioni Ads): nessuna RPC del sito. Funzione nuova
ads_crm_normalizza_telefono (immutable: +39 ai numeri italiani senza
prefisso, cellulare ^3[0-9]{8,9}$ o fisso ^0[0-9]{5,10}$; gli altri senza
"+" scartati), usata da ads_crm_hash_telefono e dal trigger
ads_crm_registra_nuovo_contatto (tolta la loro copia della regola). Non
toccati: ads_crm_hash_email, ads_crm_export_v2, trigger, procedura_consenso,
sito. Provato sul backup pre59: telefoni dei clienti riconosciuti da 10 a
288 su 309, lead da 1 a 15 su 15, export "nuovi" con telefono da 1 a 16.
Dopo sql/60 (spese insoluti RIBA e solleciti del contabile, ESEGUITO il 04/11, backup pre60,
richiede 47): registra_spese_insoluto_riba; registra_sollecito,
esito_sollecito ed elimina_sollecito ridefinite (anche contabile);
colonne nuove riba_righe.spese_insoluto*.
Dopo sql/255 (storico presidi da Esegui intervento, DA ESEGUIRE, nessun
prerequisito oltre lo schema del 04/11): registra_scheda_presidio_intervento
(nuova, js/55); salva_riporto_presidio e nuovo_intervento_manichetta
ridefinite (anche il tecnico sui clienti visibili; periodo dalla data della
verifica); funzione semestre_scheda_presidio; policy schede_lettura e
manichette_lettura: il tecnico legge lo storico dei clienti visibili.
Dopo sql/240 (F13.6, ESEGUITO il 04/11, backup pre240, richiede 07 e 30):
nessuna RPC nuova. Policy preventivi_fornitori_allegati_gestione al posto
di "commerciale gestisce allegati fornitore" (titolare/informatico +
commerciale autore con get_mio_utente_id). Colonna
ordini_fornitori.arrivo_previsto_iniziale (la scrive il trigger
trg_ordini_fornitori_arrivo_iniziale alla nascita,
trg_ordini_fornitori_arrivo_iniziale_fisso la rende immutabile; riempita
solo per gli ordini 'ordinato'; vuota = dato non disponibile), js/27.
Dopo sql/59 (IVA N1 e split payment, ESEGUITO il 03/11, richiede 45, 46, 54):
salva_bozza_fattura ridefinita (+ p_split_payment), emetti_nota_credito,
emetti_nota_credito_parziale ed emissione_fattura_interna ridefinite;
colonne nuove fatture_righe.natura_iva, fatture.totale_esente,
fatture.split_payment, clienti.split_payment (scritta dal sito).
Dopo sql/58 (decisioni di Toli del 03/11, ESEGUITO il 03/11, richiede 40, 46, 47):
riporta_presentazione_riba_preparata, imposta_presidi_contratto,
chiudi_recupero_contratto, assegna_rappresentante_cliente (js/45, js/54);
colonne nuove riba_presentazioni.riportata_preparata_* e
clienti_periodicita.recupero_* (le scrivono solo RPC e trigger).
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
codici attuali di `utenti.ruolo`. capo_operativo non è un ruolo: NON
si crea (decisione del 26/10, confermata da Toli il 03/11, T1).
Esiste anche `informatico` (Erika Pistolesi): accesso completo come il
titolare (decisione di Erika del 23/10, da confermare da Toli in F1.4).
Cambiano solo le etichette in interfaccia (Fase 3), mai il codice.
Nomi visibili nel gestionale (decisione 26/10): "Rappresentante" e
"Commerciale" restano così (NON "Commerciale"/"Acquisti" del flusso
appeso in ufficio); le etichette servono solo a non mostrare codici grezzi
(es. "Capo tecnico"). Soglia 3.000 € del rappresentante: resta fissa nel
DB (trigger e policy di sql/10), non configurabile (confermato da Toli il
03/11, D14). Vale per CREARE o
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
  commesse, commessa-detail, team-subappalti, scheda-documenti,
  ore-cantiere, info; da F13.3 anche fornitori, progetti,
  verifiche-tecniche, preventivi (aggiunte dopo la definizione, NON nel
  menu: si aprono dai collegamenti e dalla guida Info, info-tit-8)
- capo_tecnico: dashboard, calendario, calendario-team, piano-mensile,
  presidi, interventi, tecnico, clienti, documenti, cliente-detail,
  commesse, commessa-detail, team-subappalti, scheda-documenti,
  ore-cantiere, info
- segreteria: dashboard, calendario, workflow, presidi, interventi, tecnico,
  clienti, documenti, fatture, catalogo, cliente-detail, fornitore-detail,
  commesse, commessa-detail, team-subappalti, scheda-documenti, info
- contabile: dashboard, workflow, fatture, documenti, catalogo, info
- tecnico: dashboard, calendario-tec, tecnico, documenti, info
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

Pagina Info (guida pratica, `#pg-info` in index.html): una guida per ogni
ruolo (`guida-<ruolo>`: titolare, segreteria, contabile, capo_tecnico,
tecnico, commerciale, rappresentante, ingegnere; l'informatico vede quella
del titolare). Voce "ℹ️ Info" ("ⓘ Info" per il rappresentante) nel menu
di tutti i ruoli. Modello: la guida del rappresentante scritta da Erika
(h3 con emoji, sezioni `<h4 id="info-<sigla>-N">N. …</h4>` scritte come
situazioni, nomi di bottoni e pagine in `<b>` come nel sito, esempi
`.info-esempio`, avvisi `.al2 i` / `.al2 w`, Regole pratiche e
Checklist). L'indice in cima (`.guida-indice`) lo costruisce `loadInfo`
(js/02) dagli `h4[id]`; sigle degli id: tit, seg, con, ct, tec, com, rap,
ing. Quando un modulo nuovo cambia bottoni o passaggi di un ruolo,
aggiornare anche la sua guida.

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

Scheda tecnica "Coppelle" (richiesta di Erika del 28/10, js/18
`apriSchedaCoppelleIngegnere`, bottone "🔥 Compila coppelle" nella verifica
tecnica; nessun SQL): settima scheda dell'ingegnere, famiglia 'coppelle' in
progetti_tecnici_schede. Tubazioni (intervento, materiale, uso, diametro,
lunghezza, tratti, spessore), classe di resistenza EI e reazione al fuoco,
attraversamenti, finitura, ambiente, altezza/PLE, ostacoli, foto,
certificazione, note. Nessun campo obbligatorio. Compare come le altre nel
preventivo, nella copia del commerciale e nel PDF per il fornitore.

Pareti in cartongesso nella scheda Compartimentazione (richiesta di Erika
del 02/11, js/18, nessun SQL): sezione "5. Pareti in cartongesso" con righe
ripetibili ("+ Aggiungi parete", "🗑️ Togli"): unità di misura (m², ml, pz),
larghezza e altezza in m, angolo (nessuno, interno, esterno, interno ed
esterno), misura dell'angolo e quantità di angoli; numeri con la virgola.
Salvate in dati.pareti_cartongesso (elenco; vuoto = null). In preventivo,
scheda progetto, copia commerciale, PDF per il fornitore e scheda cantiere
si leggono come "Parete 1: 4,5 × 2,7 m (m²) · angolo interno ed esterno:
2,7 m, n. 2" (valoreSchedaTecnica / testoPareteCartongesso); nella copia
commerciale diventano testo modificabile. Nessun campo obbligatorio.

Schede di rilievo multiple (richiesta di Erika del 29/10, js/18;
sql/48-schede-tecniche-multiple ESEGUITO il 30/10, richiede 07 e 34; ORDINE:
prima si pubblica il sito, poi si esegue il 48, perché il sito vecchio
salva per il vincolo che il 48 toglie): ognuna delle 7 schede
dell'ingegnere (rilevazione incendi, porte REI, estintori,
compartimentazione, vernice intumescente, impianti di spegnimento,
coppelle) può avere più schede nello stesso progetto, es. una per piano.
Colonna `progetti_tecnici_schede.numero` (1-99, le schede esistenti
diventano la 1), vincolo UNIQUE (progetto_tecnico_id, famiglia, numero) al
posto di (progetto_tecnico_id, famiglia); policy RLS invariate. In cima
alla scheda la barra "Scheda 1 | Scheda 2 | … | + Nuova scheda" (nuova =
stesse voci, vuota, numero = massimo + 1, nasce con "Salva") e il campo
facoltativo "Nome / riferimento" salvato in `dati.nome_scheda` (non una
colonna). Funziona come le tab di un file Excel (decisione di Erika del
29/10): si passa da un tab all'altro senza conferma e senza perdere quello
che si è scritto (le modifiche restano in memoria, pallino arancione sul
tab non salvato); "Salva" salva TUTTE le schede del tipo modificate,
comprese le nuove, e la scheda resta aperta; chiudere (Annulla, Indietro,
✕, clic fuori) con modifiche non salvate chiede conferma. Eliminare:
qualsiasi scheda, anche la 1, in qualsiasi momento, solo ingegnere,
titolare e informatico, con conferma (RPC elimina_scheda_rilievo: sulla
tabella non c'è policy di cancellazione); se era l'unica, quel tipo resta
senza schede. Una scheda nuova mai salvata si toglie solo dalla memoria.
Senza sql/48 salvataggio e chiusura come prima (nessuna conferma). Titolo "Porte e portoni REI – scheda 2 (Piano terra)"
nel preventivo (renderSchedePreventivo), nella scheda progetto (js/17),
nella copia commerciale (apriModificaSchedaCommerciale per id della
scheda), nel PDF della richiesta al fornitore e nella scheda cantiere
(js/32; scheda_cantiere_commessa ridefinita con numero e nome_scheda). Nella
finestra Verifica tecnica il riepilogo "Schede salvate" per tipo. La
rilevazione incendi "dal preventivo" (preventivi_schede_tecniche) resta una
per tipo: nel sito non si apre mai. Senza sql/48 tutto come prima (una
scheda per tipo, nessuna barra; controllo
`verificaSchedeMultipleDisponibili`). Nessun campo obbligatorio.

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
Decisioni del 29/10 (js/27 + sql/42): PREZZI D'ACQUISTO nascosti al
capo tecnico (la segreteria li vede: ha le fatture): niente importo
dell'ordine, colonne prezzo e totale delle voci, bottoni "📄 PDF" e
"💾 Nella cartella" (il PDF ha i prezzi; `vedePrezziAcquisto`,
RUOLI_VEDONO_PREZZI_ACQUISTO = titolare, segreteria, commerciale,
rappresentante), niente costo dei consumabili e noli (js/28); nella
cartella documenti (js/26) i PDF "Ordine_..." della cartella Ordini per
lui restano in elenco senza "Apri". LIMITE DICHIARATO: lo nasconde solo
il sito; nel database ordini_fornitori.importo,
ordini_fornitori_voci.prezzo_unitario, commesse_richieste_integrazione.costo
e i file della cartella "ordini" restano leggibili dal capo tecnico
(per chiuderli servirebbero permessi per colonna su tre tabelle, con
lettura dei prezzi via RPC per gli altri 4 ruoli e la riscrittura delle
letture di js/27, js/28 e del PDF, più una regola sulla cartella ordini:
da fare a parte se Toli lo chiede). RITORNO DA "ARRIVATO": il titolare
(solo lui) con "↩️ Non è arrivato" riporta a "Confermato dal fornitore"
un ordine segnato arrivato per errore (finestra m-stato-ordine-fornitore,
motivo obbligatorio, nuovo arrivo previsto facoltativo); la data di
arrivo si toglie e restano chi, quando, motivo e data tolta (colonne
arrivo_annullato_*, solo l'ultimo ritorno; nei passaggi dell'ordine).
Senza sql/42 il bottone non compare.

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
commessa"; compare solo se ce ne sono). Decisione del 29/10: lo stesso
box anche nella dashboard del RAPPRESENTANTE (rap-materiali-ritardo,
js/13; solo le commesse dei suoi clienti, per RLS; testo: senti
fornitore o acquisti e avvisa il cliente). Nessun prezzo nel box né
nell'elenco Materiali. Funziona con nessuna, una o
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
visura_camerale, assicurazione_rc e, dalle decisioni del 29/10 (sql/42,
nuova versione di faldone_tipi_obbligatori; stato_faldone_commessa NON
ridefinita), pos (POS del subappaltatore). Con sql/42 una commessa in
preparazione con un subappaltatore senza POS in vigore non passa a
'pronta'; js/31 mostra tra "in più per questa commessa" solo quelli non
già fissi (un 'pos' rimasto tra gli extra non si ripete). Controllo UNICO nel database
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
Decisione del 29/10 (sql/42 + js/26, js/32): il capo tecnico apre
l'ORIGINALE del preventivo firmato (o mail di approvazione) delle
commesse: RPC preventivo_firmato_commessa (percorso e nome, per chi legge
la commessa; il capo tecnico non legge preventivi) e regola storage
commesse_preventivo_firmato_lettura (funzione
preventivo_firmato_commessa_leggibile: solo il file
allegato_accettazione_path del preventivo di una commessa, solo
apertura). Collegamento "✍️ Preventivo firmato" nella cartella documenti
(js/26 `leggiPreventivoFirmatoCommessa`) e prima riga degli "Allegati
tecnici" della scheda Cantiere (js/32). Senza sql/42 il capo tecnico non
vede il collegamento (come prima).
Squadra del giorno, mezzi e calendario dei tecnici: F8.2, sotto. Senza
sql/34 la scheda mostra indirizzo, referente del cliente, materiali e
certificati della commessa e dice che il resto "non è ancora attivo".

Squadra e mezzi del giorno (F8.2, js/33-squadra-cantiere.js;
sql/35-squadra-cantiere eseguito il 28/10, richiede 07, 26 e 32, NON 28-31,
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
commessa.js; sql/36-cronoprogramma-commessa eseguito il 28/10, richiede 07 e
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
Decisione del 29/10 (sql/42 + js/34): il peso delle fasi sono le ORE
PREVISTE. SCELTA meno invasiva: colonna NUOVA commesse_fasi.ore_previste
(facoltativa, da 0,25 a 20.000 a quarti d'ora, vincolo
commesse_fasi_ore_previste_check); peso e suo vincolo 1-100 di sql/36
NON cambiano (nessuna ridefinizione di salva_fase_commessa). Si scrive
con la RPC NUOVA salva_fase_commessa_ore (stessi parametri con
p_ore_previste al posto di p_peso; chiama salva_fase_commessa con il peso
della fase, quindi stessi controlli e ruoli: capo tecnico e titolare).
% DELLA COMMESSA (`calcolaAvanzamentoFasi`, scheda, riquadri e pagina
Commesse, lettura a pagine invariata) = somma(ore x %) / somma(ore); le
fasi senza ore contano come la media delle ore indicate (avviso sotto
la barra: "N fasi senza ore contano come la media delle altre"); se
nessuna fase ha le ore, somma(peso x %) / somma(peso) come prima. 100%
solo con tutte le fasi finite (invariato). Finestra m-fase-cronoprogramma:
con sql/42 "Ore previste (facoltative)" (crf-ore) al posto del peso
(crf-peso-riga nascosto); badge "N h previste" sulla fase. Senza sql/42
la finestra chiede il peso come prima.

Giornale di cantiere e performance operai (F8.4, js/35-giornale-
cantiere.js; sql/37-giornale-cantiere eseguito il 28/10, richiede 07, 26 e 32,
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
commessa NON cambia (gli extra sono nei loro preventivi); con sql/56
(decisione di Toli del 02/11, punto 9.n) il sito mostra "Preventivo +
lavori extra accettati = Totale" e sotto i 3.000 € il preventivo
integrativo lo può preparare anche il rappresentante (js/53). FINE LAVORI →
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

Fattura finale e chiusura della commessa (F9.2, js/38-fattura-finale-
commessa.js; sql/39-fattura-finale-chiusura eseguito il 28/10, richiede 25, 26,
28 e 29, tutti in produzione; 38 facoltativo, letto con to_regclass +
EXECUTE): passo 12. Box "💶 Fattura finale" (cmd-fattura-finale, in
"Commessa e documenti" sotto cmd-dichiarazione) con la commessa in fine
lavori o chiusa. IMPORTO PROPOSTO (calcolo nel DB,
calcolo_fattura_finale_commessa): totale imponibile del preventivo
accettato + preventivi integrativi dei lavori extra accettati (sql/38;
spunta "Comprende i lavori extra accettati", toglibile se si fatturano a
parte) − fatture d'anticipo registrate (preventivi.anticipo_fattura_
importo, sql/25) del preventivo e degli integrativi compresi; IVA solo
informativa. Avvisi: anticipo previsto ma non registrato, integrativo con
IVA diversa, lavori extra ancora in attesa (non nel calcolo), niente da
fatturare. SCELTA (come F4.3): la fattura finale NON va nella tabella
fatture (modulo Fatture in costruzione, Fase 11): sulla commessa
numero, data, imponibile IVA esclusa, importo calcolato, con/senza extra,
calcolo copiato (jsonb), nota, chi e quando; da collegare alla fattura
vera quando il modulo emetterà le fatture finali. Registra (finestra
m-fattura-finale, id ffc-; RPC registra_fattura_finale_commessa):
segreteria e titolare con la commessa in fine lavori; su commessa chiusa
corregge solo il titolare; data non futura (ora italiana) e non prima
della nascita della commessa; imponibile > 0; se diverso dal calcolato
nota obbligatoria. Se il calcolo cambia dopo la registrazione (es. extra
accettato dopo) avviso "calcolo cambiato". CHIUSURA: 'chiusa' SOLO con
(a) una dichiarazione di corretta messa in opera nella cartella
"chiusura" (sql/29) = file il cui nome inizia con "Dichiarazione" e
contiene "messa in opera" (spazi, _ e - non contano: il PDF di F9.1 e la
copia firmata con nome dello stesso tipo; scelta dichiarata, nessuna
colonna nuova sui documenti) e (b) la fattura finale registrata. Blocco
nel DATABASE con il trigger trg_commesse_controllo_chiusa (BEFORE UPDATE
OF stato, fine_lavori → chiusa, come trg_commesse_controllo_pronta di
sql/33; cambia_stato_commessa di sql/28 NON ridefinita): vale per ogni
strada, anche per il titolare. "Chiudi la commessa" (finestra
m-chiusura-commessa, id chc-; RPC chiudi_commessa, segreteria e
titolare): checklist nel box cmd-chiusura di js/36 (❌ dichiarazione,
❌ fattura finale con "Vai" al box; ⚠️ calcolo cambiato, ordini ai
fornitori non arrivati, consumabili e noli non arrivati, lavori extra in
attesa, cronoprogramma sotto il 100%: avvisi che NON bloccano); per la
segreteria il bottone si attiva solo con (a) e (b). Il TITOLARE può
chiudere lo stesso scrivendo il motivo ("Chiudi comunque (con motivo)",
proposta come la consegna forzata del faldone di F7.2, da confermare da
Toli): chiusura_forzata, motivo e problemi sulla commessa e nello storico.
Se il titolare riporta indietro una commessa chiusa la forzatura si
azzera (trigger trg_commesse_chiusura_riapri); la fattura finale resta.
In "Stato e storico" (js/18) con sql/39 non c'è più "→ Chiusa": rimanda
alla scheda della commessa ("Apri la commessa"). Gli altri ruoli che
leggono la commessa vedono solo la fattura finale registrata (numero,
data, imponibile). Senza sql/39 tutto come prima (box assente, "Chiudi la
commessa" apre "Stato e storico"). Domande per Toli: chiusura forzata del
titolare; regola del nome della dichiarazione (basta il PDF generato o
serve la copia firmata?); extra compresi o fatturati a parte come
predefinito; il contabile deve registrare la fattura finale (oggi non
legge le commesse)?

## Service: manutenzioni ordinarie (Fase 10)
Contratto di manutenzione e rinnovo (F10.1, js/39-contratto-
manutenzione.js; sql/40-contratto-manutenzione-rinnovo eseguito il 29/10,
richiede solo 07). Il contratto resta in clienti_periodicita (scheda
cliente, tab Periodicità, card "Contratto di manutenzione"); la tabella
`contratti` (mai usata) NON si usa e non si tocca. Con sql/40:
- PRESIDI PREVISTI PER TIPO: campo "N. previsti dal contratto" sotto la
  frequenza di ogni tipo (perio-n-<tipo>), colonna presidi_contratto
  jsonb ({"estintore": 25, ...}, interi 0-100000, vincolo nel DB). Si
  salvano con "Salva periodicità" (titolare, segreteria, capo tecnico:
  la policy clienti_periodicita_gestione di sql/08). Serviranno a 10.2.
- PREVENTIVO DEL CONTRATTO: select perio-preventivo (preventivi del
  cliente) solo per titolare e segreteria (leggono i preventivi e
  scrivono il contratto); il capo tecnico non legge i preventivi: vede
  "collegato (non visibile per il tuo ruolo)" e salvando non lo tocca.
  Il trigger trg_clienti_periodicita_contratto impone lo stesso cliente.
- PROMEMORIA: un contratto 'attivo' con fine entro
  impostazioni.giorni_preavviso_rinnovo giorni (sql/20, già in
  produzione e già in Impostazioni; vuoto = 60) o già scaduto compare
  nel box "📄 Contratti in scadenza" (caricaContrattiInScadenzaDashboard)
  della dashboard del RAPPRESENTANTE (rap-contratti-scadenza, solo i suoi
  clienti) e del TITOLARE (tit-contratti-scadenza, tutti, con il nome del
  rappresentante o "Cliente senza rappresentante"). Decisione del 29/10:
  il promemoria va SOLO al rappresentante del cliente: tolti il box
  ct-contratti-scadenza (index.html), la chiamata nella dashboard del
  capo tecnico (js/03) e la voce capo_tecnico di BOX_CONTRATTI_SCADENZA
  (js/39); il capo tecnico registra ancora l'esito dalla scheda cliente.
  Bottoni "Apri contratto"
  (scheda cliente sul tab Periodicità), "✅ Rinnovato", "❌ Non
  rinnovato". Con l'esito il contratto esce dalla lista. Nella scheda il
  riquadro perio-rinnovo-box mostra fine e giorni mancanti, i bottoni
  (solo se in scadenza, scaduto o non rinnovato) e lo storico.
- ESITO DEL RINNOVO (finestra m-rinnovo-contratto, id rnc-; RPC
  registra_rinnovo_contratto; titolare, segreteria, capo tecnico,
  rappresentante solo per i suoi clienti): "Rinnovato" = nuovo inizio
  (predefinito il giorno dopo la fine), durata (annuale/quinquennale),
  nuova fine (calcolata, modificabile; max 10 anni), preventivo del
  rinnovo facoltativo; il contratto si aggiorna e resta 'attivo'.
  "Non rinnovato" = motivo obbligatorio, contratto 'non_rinnovato'; se il
  cliente ci ripensa si registra "Rinnovato". contratto_stato non si
  cambia con update diretti (trigger). Storico in
  clienti_periodicita_rinnovi (date prima/dopo, motivo, preventivo,
  nota, chi con nome e ruolo copiati, quando), letto come il contratto.
- PIANO INTERVENTI: NON si rigenera da solo. Dopo un rinnovo la scheda
  avvisa ("generato prima del rinnovo") e il titolare o il capo tecnico
  usano "Rigenera piano interventi". generaPianificazione (js/08): se il
  periodo attuale nasce da un rinnovo registrato (riga 'rinnovato' in
  clienti_periodicita_rinnovi con nuovo_inizio = inizio del contratto,
  js/39 fineperiodoPrecedenteRinnovo) cancella solo i cicli 'pianificato'
  dopo la fine precedente (quelli ancora da fare del periodo precedente
  restano); in tutti gli altri casi, e sempre senza sql/40, cancella tutti
  i 'pianificato' come prima. Date scritte in ora locale (prima
  toISOString le spostava di un giorno; stessa correzione in
  calcolaFineContratto). Il preventivo collegato si manda al salvataggio
  solo se cambiato (non si scollega se non è nell'elenco).
- EVACUATORI DI FUMO: la griglia chiede la frequenza di evacuatore_fumi
  (TIPI_PRESIDI) ma la colonna in clienti_periodicita non esiste: "Salva
  periodicità" oggi in produzione si ferma con "Could not find the
  'evacuatore_fumi' column". Corretto: senza la colonna il campo è
  disattivato con la nota "non ancora salvabile" e il sito non lo manda
  (completaPayloadContratto); sql/40 aggiunge la colonna.
Senza sql/40: nella card "Presidi previsti, preventivo del contratto e
rinnovo: non ancora attivi", nessun box nelle dashboard, nessun errore.
SCELTA DICHIARATA, da confermare da Toli: il "Commerciale" della roadmap
10.1 è il ruolo rappresentante (D1), il promemoria va al rappresentante
del cliente (clienti.rappresentante_id); i clienti senza rappresentante
li vede il titolare. Domande per Toli: anche il ruolo commerciale
(acquisti) deve vedere i contratti in scadenza? Il rappresentante deve
poter modificare presidi previsti e preventivo del contratto (oggi solo
nel rinnovo)? La segreteria deve avere il box in dashboard? Va bene
"Non rinnovato" anche prima della scadenza (disdetta anticipata)?

Audit dei presidi alla prima manutenzione (F10.2, js/40-audit-presidi.js;
sql/41-audit-presidi eseguito il 29/10, richiede solo 07, NON richiede 40).
Con sql/41:
- ANNATA: impianti.annata (anno di fabbricazione, 1900-2100, nel sito
  fino all'anno prossimo). Campo "Annata" nella finestra del presidio
  (mp-annata, tutti i tipi; salvato da saveP di js/07 e js/22 con
  datiAnnataPresidio). L'import CSV non cambia.
- QUALE INTERVENTO HA L'AUDIT (scelta dichiarata): lo decide il DATABASE
  quando l'intervento nasce (trigger trg_ordini_lavoro_audit_presidi):
  manutenzione ordinaria programmata, da pianificare o pianificata, di un
  cliente con contratto (riga in clienti_periodicita) che non ha MAI
  avuto una manutenzione programmata completata né un altro intervento
  con audit. Gli interventi già esistenti quando si esegue sql/41 non si
  toccano. Titolare e capo tecnico lo mettono o lo tolgono (motivo
  obbligatorio) dalla finestra dell'intervento (box mo-audit-presidi,
  RPC imposta_audit_presidi_intervento), solo se non è chiuso. Nessun
  update diretto lo cambia. Il rinnovo del contratto NON rimette
  l'audit (si mette a mano se serve).
- TECNICO ("Esegui intervento"): l'intervento con audit ha "🔎 AUDIT"
  nella tendina e un avviso; al passo Presidi (loadPC → renderPresidiAudit)
  ogni presidio non eliminato del cliente (tutte le sedi) va segnato
  "Trovato" (matricola e annata obbligatorie, stato, note) o "Non
  trovato"; quelli in più si aggiungono con "+ Aggiungi" (policy nuova
  impianti_inserimento_audit: il tecnico inserisce presidi solo durante
  un suo audit aperto). "Avanti" e "Salva e chiudi" si fermano sul primo
  presidio incompleto. Alla chiusura il sito salva matricola e annata,
  registra l'audit (registra_audit_presidi: trovati per tipo, non
  trovati, contratto di quel momento) e poi chiama la salvaInt di
  sempre. Il database rifiuta la chiusura ('completato') di un
  intervento con audit senza audit registrato o con presidi senza
  matricola o annata. "Non ho potuto completare" non è bloccato
  (l'intervento torna da pianificare e tiene l'audit). Le schede SENZA
  audit sono identiche a prima (provato in locale dall'inizio alla
  chiusura).
- DIFFERENZE: box "🔎 Audit presidi: differenze con il contratto"
  (caricaAuditPresidiDashboard, RPC audit_presidi_da_esaminare) nelle
  dashboard del capo tecnico (ct-audit-presidi, Responsabile Service),
  del rappresentante (rap-audit-presidi, solo i suoi clienti) e del
  titolare (tit-audit-presidi). Confronto per tipo con il contratto
  ATTUALE (presidi_contratto di sql/40): quando i numeri coincidono e
  non ci sono presidi non trovati la riga sparisce da sola; altrimenti
  "✓ Esaminato" (nota facoltativa, segna_audit_presidi_esaminato).
  Senza sql/40: "Confronto con il contratto non ancora attivo" con i
  trovati per tipo. Non c'è in "Tocca a te" (è delle commesse).
Senza sql/41: nessun campo annata, nessun audit, nessun box, la scheda
del tecnico si chiude come prima (nessun errore). Corretti anche, perché
servono all'audit: ✏️ sul presidio dal passo Presidi (editP cercava in
PA, vuoto per il tecnico) e "+ Aggiungi" carica le sedi del cliente.
Dopo il salvataggio di un presidio dal passo Presidi l'elenco si
ricarica tenendo spunte, stato e note già scritti (anche senza audit e
senza sql/41). Corretti nello stesso giro: la spunta del presidio al
passo Presidi apre di nuovo il pannello stato/note (js/11, prima
togglePresidioDetail riceveva l'id e il pannello restava chiuso);
estintori (js/07): saveP scriveva nella marca la capacità (me4) e la
marca vera (me2) si perdeva; ora la marca è il campo Marca e la
capacità, che non ha una colonna nel database, non si salva (da
decidere con Toli se aggiungerla).
Domande per Toli: va bene il criterio automatico (primo intervento di
manutenzione programmata di un cliente con contratto e senza
manutenzioni completate)? L'audit copre tutte le sedi del cliente in un
solo intervento: va bene o serve un audit per sede? Il rappresentante
deve poter correggere da solo i presidi previsti del contratto (oggi
segreteria, capo tecnico, titolare)? Dopo un rinnovo serve un nuovo
audit? I presidi "non trovati" il capo tecnico li elimina a mano dal
registro (oggi sì): va bene?

Appuntamento fissato dalla Segreteria (F10.3, js/41-appuntamenti-
segreteria.js; sql/43-appuntamento-segreteria ESEGUITO il 30/10, richiede solo
07). Con sql/43:
- QUALI INTERVENTI (scelta dichiarata, transizione sicura): l'obbligo
  dell'appuntamento (ordini_lavoro.appuntamento_richiesto) lo mette il
  DATABASE quando nasce l'intervento (trigger
  trg_ordini_lavoro_appuntamento): sì per la manutenzione ordinaria
  programmata ('ordinario_programmato'), da pianificare o pianificata,
  creata da titolare, capo tecnico, segreteria o rappresentante; no per
  su chiamata, straordinari, corsi, interventi creati da un tecnico e
  interventi nati già completati. Gli interventi che esistono quando si
  esegue sql/43 NON si toccano: il tecnico li vede come oggi. Titolare,
  capo tecnico e segreteria mettono o tolgono l'obbligo su un intervento
  aperto dalla finestra dell'intervento (box mo-appuntamento, "Serve
  l'appuntamento" / "Non serve l'appuntamento" con motivo; RPC
  imposta_appuntamento_richiesto).
- FLUSSO: il capo tecnico pianifica come oggi (data indicativa e
  tecnico: dashboard, Piano mensile, finestra intervento); l'intervento
  compare nella lista "📞 Appuntamenti da fissare"
  (caricaAppuntamentiDaFissare) della dashboard della SEGRETERIA
  (seg-appuntamenti), del CAPO TECNICO come "⏳ Da confermare"
  (ct-appuntamenti, con "📞 Fissa appuntamento" e "Apri intervento") e
  del TITOLARE
  (tit-appuntamenti). Nella lista: cliente, data indicativa (rossa se
  passata), tecnico, sede, referente con telefono cliccabile, motivo del
  ritorno. "📞 Fissa appuntamento" (segreteria, capo tecnico e titolare;
  il capo tecnico per decisione di Erika del 29/10, anche dalla finestra
  dell'intervento; finestra
  m-fissa-appuntamento, id fap-): giorno e ora esatti, con chi ha parlato
  (precompilato col referente), quando (data e ora della telefonata,
  predefinita adesso), note per il tecnico; chi = utente collegato. Avvisi
  se il giorno è diverso dalla data indicativa (l'intervento si sposta a
  quel giorno e resta allo stesso tecnico) e se il tecnico ha altri
  interventi quel giorno. RPC fissa_appuntamento_intervento: mette anche
  data_pianificata = giorno fissato (lo stato non cambia).
- IL TECNICO (regola nel DATABASE, policy restrittive di sql/43; le
  policy di sql/09 non si toccano): un intervento che chiede
  l'appuntamento, da pianificare o pianificato, con una data, ma senza
  appuntamento fissato per QUELLA data, per il tecnico non esiste
  (dashboard, calendario, tendina e scheda di "Esegui intervento"); non
  può nemmeno modificarlo. Con l'appuntamento lo vede con l'ora esatta
  ("ore 09:30" in dashboard, "📞 ore 09:30 (appuntamento con il cliente)"
  nel calendario, nella tendina, e la card "📞 Appuntamento con il
  cliente" nella scheda). Completati, annullati e interventi senza data
  (tornati in coda) restano come oggi; chiusura e "Non ho potuto
  completare" funzionano come prima (provati in locale).
- DI NUOVO ALLA SEGRETERIA: appuntamento_fissato è vera solo se il giorno
  fissato è uguale alla data dell'intervento. SCELTA DICHIARATA (va bene
  per il controllo): se la data torna al giorno fissato l'appuntamento
  torna valido da solo, con l'ora fissata allora (stesso giorno
  concordato con il cliente); per far richiamare il cliente si usa
  "Rimanda alla segreteria". Se il capo tecnico sposta
  la data (da qualunque pagina; trascinando nel calendario settimanale e
  salvando la finestra intervento il sito chiede prima conferma, nella
  finestra del calendario c'è l'avviso) l'appuntamento non vale più e
  torna nella lista con il motivo
  ("Data cambiata ... Richiamare il cliente"). Richiesta di modifica del
  tecnico di data, orario o rinvio APPROVATA dal capo tecnico o dal
  titolare (trigger trg_richieste_modifica_odl_appuntamento): torna alla
  segreteria con il testo della richiesta. "↩️ Rimanda alla segreteria"
  (titolare, capo tecnico, segreteria; motivo obbligatorio; RPC
  rimanda_appuntamento_segreteria), per esempio quando il cliente chiama
  o scrive dal portale per spostare: la segreteria può anche usare
  direttamente "Cambia appuntamento". Il tecnico non può spostare da solo
  un appuntamento fissato (messaggio: usa "Richiedi modifica"). Il
  "non completato" lo rimette in coda senza data con il motivo.
- STORICO: ordini_lavoro_appuntamenti (fissato, rimandato, data cambiata,
  richiesta approvata, obbligo messo/tolto; chi con nome e ruolo copiati,
  quando), in fondo al box della finestra intervento.
- Etichette per chi pianifica: "📞 09:30" / "⏳ Da confermare" sugli
  interventi del calendario settimanale e della lista "Da pianificare"
  (dashboard capo tecnico), del calendario team e del Piano mensile; riga
  nella finestra del calendario (m-cal-edit).
- PORTALE CLIENTI (decisione di Erika del 29/10): portale_ticket
  (sql/13) ridefinita in sql/43 con appuntamento_ora ("09:30") per
  l'intervento collegato alla richiesta, SOLO se l'appuntamento è fissato
  per quella data; in "Le mie richieste" (js/02 portaleCaricaTicket) si
  legge "📅 venerdì 30 ottobre 2026 · ore 09:30" al posto della fascia.
  Data cambiata o appuntamento non fissato: data e fascia come prima. Il
  rollback rimette esattamente la funzione di sql/13 (permessi
  invariati, anche anon).
Senza sql/43: nessuna lista, nessun box, il tecnico vede tutto come prima
(provato in locale anche dopo il rollback, che riporta lo schema identico).
Corretto nello stesso giro (anche senza sql/43): la dashboard del tecnico
calcolava "oggi" con toISOString (UTC) e in Italia la sezione "Oggi"
restava vuota (gli interventi di oggi finivano nella settimana); il
calendario del tecnico perdeva l'ultimo giorno del mese; nel calendario
settimanale del capo tecnico ogni colonna portava la data del giorno
prima (trascinando su martedì si pianificava lunedì). Ora date in ora
locale (dataLocaleISO). Restano con toISOString, da controllare in una
task a parte: calendario team (js/05 loadCalendarioTeam), calendario
generale (js/12 loadCalendario), dashboard segreteria e titolare.
Domande per Toli: va bene che l'appuntamento valga solo per la
manutenzione ordinaria programmata nata dopo sql/43 (gli interventi già
pianificati restano visibili al tecnico senza appuntamento)? Va
segnato d'ufficio anche qualche intervento già esistente (es. le
manutenzioni programmate ancora da pianificare)? (Risposte di Erika del
29/10 nel punto 8 dei Moduli da costruire: capo tecnico che fissa e ora
nel portale FATTI; promemoria al cliente da costruire a parte.)

Buono di lavoro, fattura e ripartenza del ciclo (F10.4, js/42-buono-
lavoro.js; sql/44-prezzi-contratto ESEGUITO il 30/10, richiede 07 e 40; non
richiede 41 né 43, li usa se ci sono). Comprende anche la 10.5 della
roadmap (scadenze e ripartenza).
- BUONO DI LAVORO = la scheda di lavoro del tecnico (schede_lavoro, js/11,
  nessun campo nuovo) + i DDT dell'intervento (ddt.odl_id o
  ddt.scheda_lavoro_id). Box "🧾 Buono di lavoro" nella finestra della
  scheda (m-scheda, ms-buono: workflow, Documenti, per tutti i ruoli che
  la aprono) e sezioni nuove nel PDF "📋 Rapporto" (js/04 chiama
  sezioniBuonoLavoroPDF): contratto (periodo, in vigore/scaduto/non
  rinnovato), DIFFERENZE PRESIDI per tipo (previsti dal contratto,
  presidi_contratto di sql/40, contro i trovati dell'audit di
  quell'intervento se c'è, sql/41, altrimenti il registro presidi
  attuale; presidi "non trovati" dell'audit), LAVORI FUORI CONTRATTO,
  MATERIALE dei DDT con l'origine dei prezzi, FATTURAZIONE (stato del
  workflow; "Crea DDT" non compare su una scheda fatturata). Il PDF che
  va al cliente riporta SOLO i fatti tecnici: differenze dei presidi con
  il contratto (se il cliente ha un contratto) e "Presidi da sostituire,
  ricaricare o riparare"; niente diciture commerciali (senza contratto,
  fuori periodo, prezzo del catalogo...), niente DDT né prezzi, così esce
  uguale chiunque lo stampi (correzione del controllo). Il PDF ora
  esclude i presidi eliminati e stampa sempre il riquadro dello
  straordinario (prima spariva se la pagina era piena).
- REGOLA "FUORI CONTRATTO" (scelta dichiarata, nessun dato nuovo):
  a) cliente senza contratto (nessuna riga in clienti_periodicita);
  b) intervento fuori dal periodo del contratto (prima dell'inizio, dopo
  la fine, non rinnovato); c) tipo diverso da manutenzione ordinaria
  programmata (su chiamata, straordinario, corso); d) presidi in più
  rispetto al contratto, per tipo; e) presidi controllati in
  quell'intervento (data ultimo controllo = data della scheda) rimasti in
  anomalia, scaduti o fuori servizio (sostituzione, ricarica, riparazione
  da preventivare); f) straordinario richiesto dal tecnico (campo già
  esistente); g) righe dei DDT senza voce nel preventivo del contratto
  (solo per chi vede i prezzi e se il preventivo è collegato). I presidi
  in meno sono solo "differenze" (adeguamento del contratto).
- PREZZI DAL PREVENTIVO DEL CONTRATTO (nel DDT, m-ddt, box
  ddt-contratto-box; solo ruoli che vedono i prezzi, RUOLI_PREZZI di
  js/14): preventivi_voci NON ha un collegamento a prodotti_catalogo,
  quindi la voce corrisponde a una riga se la descrizione è uguale
  (senza maiuscole, accenti, punteggiatura) oppure se la descrizione
  della voce contiene il codice del prodotto (almeno 3 caratteri). Una
  riga presa dal catalogo con voce corrispondente prende il prezzo della
  voce; senza, resta il prezzo del catalogo come oggi. In più "Aggiungi
  una voce del contratto" e "Applica i prezzi del contratto"; accanto a
  ogni riga "📄 prezzo del contratto" / "⚠️ nel contratto € X" / "fuori
  contratto". Il prezzo resta modificabile a mano. Nessun dato salvato
  in più (l'origine si ricalcola). Le voci le dà la RPC
  prezzi_contratto_cliente (sql/44: titolare, segreteria, contabile,
  commerciale, rappresentante solo i suoi clienti; prezzo di vendita,
  MAI il costo): oggi le voci le leggono solo il titolare e il
  commerciale autore. Senza sql/44: il titolare vede i prezzi del
  contratto (lettura diretta), la segreteria legge "voci non ancora
  leggibili per il tuo ruolo", prezzi dal catalogo come prima. Primo
  passo del modulo "Listini per cliente" (punto 1 dei Moduli): per un
  cliente con contratto il listino è il preventivo del contratto.
  "📦 Crea DDT per l'intervento" dal buono (titolare, segreteria, capo
  tecnico): DDT con cliente, intervento e causale già messi.
- FATTURA: il modulo Fatture non c'è. Scelta dichiarata: buono e DDT
  arrivano pronti e segnati "da fatturare" con il workflow che esiste
  (firmata → approvata → inviata → da fatturare → fatturata). Nelle card
  del workflow (decoraWorkflowBuoni) DDT collegati con importo e avvisi
  rapidi di fuori contratto; in Documenti accanto a ogni DDT lo stato del
  buono collegato ("Buono: Da fatturare/Fatturata"; js/10 aggiunge gli
  attributi data-ddt-*). Il vincolo "senza buono non si emette fattura"
  sarà del modulo Fatture (decisione già presa, Fase 3 del modulo).
  Da F11.1 (con sql/45): la bozza di fattura nasce solo da una scheda di
  lavoro e ne riprende le righe (vedi Moduli da costruire, punto 2); nel
  box Fatturazione del buono la riga ms-buono-fattura mostra la bozza o
  "Crea bozza fattura".
- RIPARTENZA DEL CICLO: box "🔁 Controlli scaduti: da ripianificare"
  nella dashboard del capo tecnico (ct-ripartenza, prima di "Interventi
  periodici del mese") e in testa al Piano mensile del mese corrente
  (titolare e capo tecnico; id rip-d-/rip-t-<cliente>). Ci finisce un
  cliente con: controlli del piano (cicli_pianificati 'pianificato'
  senza intervento) degli ULTIMI 12 MESI prima del mese corrente, non
  seguiti da una manutenzione programmata completata; oppure presidi con
  prossimo controllo scaduto o entro 30 giorni (fisso, come la dashboard
  standard), se il cliente non ha già controlli nel piano del mese
  corrente. Escluso chi ha già una manutenzione ordinaria programmata
  aperta (da pianificare o pianificata). Schedulando ("+ Schedula
  intervento" della dashboard, che apre la finestra intervento, o
  "✅ Schedula" del Piano mensile) si collegano all'intervento i controlli
  del piano del cliente con le stesse regole del box: ultimi 12 mesi,
  solo i mesi DOPO l'ultima manutenzione programmata completata, fino al
  mese dell'intervento (quelli più vecchi o già coperti restano
  com'erano, non diventano "eseguito"). Alla chiusura
  diventano "eseguito" (trigger sql/17) e con sql/43 l'intervento va alla
  segreteria per l'appuntamento (F10.3). Corretto nello stesso giro:
  "+ Schedula intervento" del box "Interventi periodici del mese"
  (creaOdlDaCiclo) non collegava i controlli all'intervento, che
  restavano "da schedulare" anche dopo la chiusura; ora collega SOLO
  quelli di quel mese, come "Schedula" del Piano mensile (schedulaOdl).
  In Documenti lo stato del buono accanto ai DDT si legge a blocchi di
  100 id.
Provato in locale (dump + 28-43 + 44 e senza 44, rollback identico allo
schema di prima) con i ruoli veri: capo tecnico schedula dalla dashboard
e dal Piano mensile → segreteria fissa l'appuntamento → tecnico chiude
con audit e senza → segreteria apre il buono, crea il DDT con i prezzi
del contratto, approva e passa a fatturazione → contabile vede "Da
fatturare" e segna "Fatturata" → alla scadenza dei presidi il cliente
torna nel box del capo tecnico.
Domande per Toli: va bene la regola "fuori contratto" (in particolare:
"su chiamata" è sempre fuori contratto? un cliente senza contratto è
tutto a consuntivo?); la corrispondenza voce-prodotto per descrizione
basta o serve un collegamento vero voce↔prodotto (colonna nuova su
preventivi_voci, con il modulo Listini)?; il PDF del buono che va al
cliente deve mostrare i prezzi?; 30 giorni di preavviso fissi o in
Impostazioni?; i controlli del piano rimasti indietro di più di 12 mesi
vanno segnati "saltato"?; serve il box della ripartenza anche nella
dashboard del titolare?

"Cosa tocca a me" in cima alle dashboard (F12.1, js/46-cosa-tocca-a-me.js,
nessun SQL): sotto il saluto di ogni dashboard (titolare/informatico,
segreteria, capo_tecnico, commerciale, rappresentante, tecnico,
ingegnere, contabile; contenitori `tam-<ruolo>` in index.html) un
riquadro compatto con il CONTEGGIO di ogni cosa da fare del ruolo, righe
a zero nascoste, "Niente da fare 🎉" se non c'è nulla, prime 6 righe e
"Mostra altre". Ogni riga porta al box della dashboard (scorre e lo
evidenzia; se il box è vuoto apre la pagina) o alla pagina giusta; con
una sola commessa apre direttamente la commessa. Scelta: REGISTRO DELLE
FONTI. Ogni cosa da fare è una fonte `registraFonteToccaAMe({ id, ruoli,
icona, titolo, conta, vai, livello, priorita, tipo })`; `conta` usa le
verifiche dei moduli (verifica*Disponibili) e le stesse regole dei box,
con richieste count/head dove si può, e restituisce null se la fonte non
è attiva (SQL non eseguito, errore): la riga si salta senza errori. Chi
aggiunge un modulo con una cosa da fare aggiunge una fonte (dal suo file
caricato dopo js/46). Al massimo 4 fonti lette insieme, righe disegnate
man mano. Si aggiorna con ↻, tornando alla Dashboard dal menu e da solo
dopo un'azione che ricarica uno dei box riassunti (non con il refresh
automatico dei ticket ogni 60 s). Contenuto per ruolo (roadmap Fase 12):
titolare = preventivi da controllare, lead dal sito, anticipi non
accreditati, interventi e materiali in ritardo, contratti in scadenza,
audit, appuntamenti da fissare, schede da approvare, bozze di fattura,
insoluti, documenti team; in fondo come dati "commesse aperte per stato"
e "fatturato del mese" (performance squadre: resta nella commessa, non è
una cosa da fare). Rappresentante = preventivi da far approvare, anticipi
da ricordare, commesse da ordinare (passo 7), lead, progetti da
integrare, sede del cantiere, lavori extra, contratti da rinnovare,
materiali in ritardo, audit, insoluti. Commerciale (acquisti) = progetti
da preventivare, consumabili e noli da procurare, richieste ai fornitori
in attesa, ordini in ritardo, lavori extra. Capo tecnico (Capo Operativo
e Responsabile Service) = da pianificare (di cui da riprogrammare), in
ritardo, richieste di modifica, commesse da esaminare (passo 8),
cantieri da avviare e in corso, giornale da compilare (giorni di
squadra degli ultimi 7 giorni senza giornale; servono sql/35 e 37),
materiali in ritardo e in arrivo (7 giorni), lavori extra, audit,
controlli da ripianificare, periodici del mese, ticket, documenti team.
Segreteria = anticipi, sede del cantiere, faldoni (passo 10), commesse da
chiudere (passo 12), appuntamenti, ticket, schede da approvare, buoni da
fatturare, bozze di fattura, anagrafiche da completare, RIBA, insoluti e
scadute da sollecitare, documenti team. Tecnico = interventi di oggi (con
l'ora del primo: appuntamento fissato o fascia), prossimi 6 giorni,
interventi passati non chiusi, giorni di cantiere, i suoi documenti.
Ingegnere = verifiche tecniche, certificati nuovi, scadenze 7 giorni.
Contabile = buoni da fatturare, bozze, rate scadute, RIBA. L'avviso
"lead dal sito" del titolare ora ha il suo posto fisso sotto il
riquadro (prima si creava sotto il saluto). "Interventi in ritardo" del
capo tecnico apre la pagina Interventi (la sua dashboard non ha
l'elenco dei ritardi; il titolare va al suo box). "Preventivi da far
approvare" conta solo quelli con il PDF per il cliente (come js/13) e
"Progetti da preventivare" segue le regole della lista di js/17. Provato in locale (dump +
28-42 e poi + 43-48) con tutti i ruoli, a 390 px e a 1280 px.

Ore cantiere: riepilogo ore su tutte le commesse (Moduli da costruire
punto 6, js/49-ore-cantiere.js, NESSUN SQL: legge i dati di sql/37 e 32
già in produzione). Pagina `ore-cantiere` (pg-ore-cantiere), voce
"⏱️ Ore cantiere" nel menu di titolare (e informatico) e capo_tecnico,
dopo Commesse. Capo tecnico: SÌ, scelta dichiarata (organizza le
squadre e per RLS legge già le ore per persona, policy
commesse_giornale_ore_lettura di sql/37); segreteria, tecnico,
commerciale, rappresentante, contabile, ingegnere: NO (non leggono le
ore per persona). Nessuna RPC, niente costi né prezzi (le commesse si
leggono senza importo). Letture a pagine da 1000 (`leggiTutteLeRigheOre`)
di commesse_giornale_ore, commesse_lavorazioni, commesse, utenti,
subappaltatori; dati tenuti 2 minuti (tornando dalla scheda commessa non
si rilegge; "↻ Aggiorna" rilegge). Filtri: periodo (Questo mese, Mese
scorso, Ultimi 3 mesi = questo mese e i 2 precedenti, Quest'anno, Date
libere dal/al; date invertite si scambiano), commessa, persona
(dipendenti e subappaltatori). In cima: ore nel periodo, dipendenti,
subappaltatori, commesse e giorni di cantiere. Tab: PERSONE (dipendenti
poi subappaltatori: ore, giorni di presenza, media al giorno, "▸ N
commesse" espande le ore per commessa); COMMESSE (ore nel periodo con i
filtri; ore TOTALI = tutto il giornale e tutte le persone, ore stimate =
somma delle ore_stimate delle lavorazioni, scostamento in ore e in %,
stesse regole e stessi numeri del box "⏱️ Ore stimate e ore effettive"
di js/35; commesse oltre la stima in rosso e per prime; riquadro in cima
"Commesse APERTE oltre la stima", qualunque sia il filtro, con "Apri");
LAVORAZIONI (scelta: lavorazioni con lo stesso nome, maiuscole e spazi a
parte, sommate tra le commesse della vista Commesse; lo scostamento usa
solo le commesse che hanno la stima; "Altro (non in elenco)" in fondo).
Subappaltatori: ore × persone (oreRigaGiornale di js/35). Export "⬇️ CSV
per persona" (Excel italiano: `;`, virgola decimale, BOM UTF-8; righe per
persona più dettaglio persona × commessa; i nomi che cominciano con = + -
@ prendono un apostrofo). Sul telefono le tabelle diventano schede.
"Cosa tocca a me" del titolare (js/46): dato informativo (tipo 'info')
"⏱️ Commesse oltre la stima delle ore: N", solo commesse aperte, nascosto
se 0; porta alla pagina sul tab Commesse. Guide Info: titolare
(info-tit-7) e capo tecnico (info-ct-16). Senza sql/37 la pagina dice
"non è ancora attivo". Provato in locale (dump-26 + sql/28-48, 1476
righe di ore su 5 commesse) con titolare, informatico e capo tecnico a
390 e 1280 px; segreteria, tecnico e rappresentante non hanno la pagina;
totali uguali ai box della scheda commessa e a una somma SQL.

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
Lettura del 04/11/2026 (MCP): in produzione 81 tabelle in `public`, tutte
con RLS attiva (l'elenco delle tabelle sopra è ancora quello del 22/10).
REGOLA DELLE TABELLE NUOVE (piano del titolare, F13.1): ogni tabella
nuova nasce, nello stesso file sql/NN, con (1) RLS attiva e le sue policy
per ruolo (niente policy "per tutti gli autenticati"), (2) la sua riga
per ruolo nella matrice dei permessi `sql/matrice_permessi.csv` (lettura,
inserimento, modifica, cancellazione; il file e lo script di controllo
arrivano con F14.13: finché non c'è, la riga si prepara nel commento del
file sql/NN) e (3) il trigger del registro delle azioni (chi, quando,
cosa è cambiato; arriva con F14.11: finché non c'è, si scrive nel file
che il trigger va aggiunto). Più il rollback e la riga nell'elenco
"Tabelle Supabase" qui sopra. Una tabella senza queste tre cose non si
esegue in produzione.
Accesso di Claude Code a Supabase (decisione di Toli del 04/11): server
MCP ufficiale in `.mcp.json` (escluso da git, login OAuth), in
lettura e scrittura. Claude esegue in produzione SOLO un file sql/NN
già provato, dopo il backup fatto da Erika (sql/BACKUP.md) e la frase
"CONFERMATO DA TOLI: sql/NN"; poi lancia la query di controllo del
file. Nessuna scrittura di dati fuori da un file confermato. Il
collegamento non rispetta le RLS: leggere solo i dati che servono.
Il server MCP rifiuta da solo i comandi distruttivi (drop, delete...):
la conferma che chiede non arriva in VS Code. File con drop: li esegue
Erika nell'editor SQL, Claude lancia solo il controllo (es. sql/240).

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
   Primo passo FATTO in F10.4 (js/42, sql/44): per i clienti con
   contratto di manutenzione il DDT prende i prezzi dal preventivo del
   contratto (corrispondenza per descrizione o codice); per gli altri
   resta il catalogo.

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
   - [x] Fase 1 — Schema DB (tabelle, RLS, trigger). Tabelle, trigger e
     policy già in produzione da maggio; completata da sql/45 (F11.1, da
     eseguire): stati canonici imposti, righe solo nella bozza, origine
     delle righe.
   - [x] Fase 2 — Lista fatture read-only (pagina pg-fatture, maggio;
     con sql/45 le righe si aprono).
   - [x] Fase 3 — Creazione bozza fattura (modal m-fattura, F11.1).
   - [x] Fase 4 — Auto-popolamento righe da scheda/DDT/manodopera (F11.1).
   - [x] Fase 5 — Emissione fattura (assegna numero, scadenze) (F11.2).
   - [x] Fase 6 — Vista scadenze + KPI dashboard (F11.2).
   - [x] Fase 7 — Registrazione pagamenti (F11.2).
   - [x] Fase 8 — RIBA: presentazioni e righe (F11.3).
   - [x] Fase 9 — Esiti RIBA (accreditato/insoluto) (F11.3).
   - [x] Fase 10 — Solleciti (F11.3).
   - [x] Fase 11 — Aggiornamento dashboard ruoli (F11.3).
   - [x] Fase 12 — Export PDF fattura (F11.3).
   Dipendenza esterna: `clienti.rappresentante_id` da aggiungere
   prima della Fase 11 (per filtro insoluti rappresentante). Verificato in
   F11.1: la colonna ESISTE già (export del 26/10, usata dalle policy di
   sql/08 e da cliente_visibile); la policy fatture_lettura di sql/10 fa
   già vedere al rappresentante le fatture dei suoi clienti (tutte, non
   solo gli insoluti: il filtro sugli insoluti è della Fase 11).
   Da F10.4: il buono di lavoro (scheda + DDT dell'intervento, box
   ms-buono di js/42) arriva "da fatturare" con i lavori fuori contratto
   e l'origine dei prezzi: la Fase 4 (righe da scheda/DDT) parte da lì
   (fatto in F11.1).

   **Stati canonici (decisi e da rispettare ovunque)**:
   - `fatture.stato`: `bozza → emessa → annullata`
   - `fatture.stato_pagamento`: `da_pagare → in_riba | pagata | parzialmente_pagata | insoluta → sollecitata`
   - `fatture_scadenze.stato`: `aperta → in_riba | pagata | insoluta → sollecitata`
   - `riba_presentazioni.stato`: `preparata → inviata → accreditata | parzialmente_accreditata | chiusa`
   - `riba_righe.esito`: `NULL → accreditato | insoluto`
   - `solleciti.esito`: `inviato → risposto | ignorato`
   Default applicati con ALTER post-Fase 1: `fatture.stato='bozza'`
   (era 'da_emettere' pre-esistente, allineato dopo decisione).
   Con sql/45 (F11.1) questi stati sono VINCOLI del database (CHECK), e
   stato, tipo, stato del pagamento, stato delle scadenze e delle
   presentazioni RIBA, esito dei solleciti non possono essere vuoti.

   **Bozza di fattura dalla scheda di lavoro (F11.1, js/43-fatture-
   bozze.js; sql/45-fatture-bozze ESEGUITO il 30/10, richiede 07 e 26)**.
   Chi: titolare, segreteria, contabile (scrivono le fatture per sql/10);
   il commerciale vede lista e fatture in sola lettura; il rappresentante
   per ora non ha la pagina (Fase 11 del piano). Dove: pagina Fatture
   (riquadro "Schede da fatturare senza bozza", fat-schede-box; ogni riga
   della lista apre la fattura), workflow (bottone "🧾 Crea bozza
   fattura" / "🧾 Apri bozza" sulle schede approvate, inviate, da
   fatturare), finestra della scheda (riga ms-buono-fattura nel box
   Fatturazione del buono di lavoro, js/42). Finestra m-fattura (id
   mfat-). Si fattura una scheda approvata, inviata al cliente o da
   fatturare, completata, non eliminata, non già in una fattura attiva
   (indice uq_fatture_scheda_attiva: una scheda, una fattura). Righe
   proposte dal buono di lavoro di F10.4 (datiBuonoLavoro): descrizione
   dell'intervento (prezzo 0, da completare o lasciare descrittiva),
   righe dei DDT dell'intervento con il loro prezzo (per i clienti con
   contratto già quello del preventivo del contratto) e "(DDT n. X del
   ...)" nella descrizione (fattura differita), manodopera = ore_lavorate
   × impostazioni.tariffa_oraria_standard. SCELTA: per la manutenzione
   ordinaria programmata con contratto in vigore la manodopera è proposta
   ma NON spuntata (di solito compresa nel contratto). In più: righe
   libere, "+ Manodopera", voci del preventivo del contratto
   (prezzi_contratto_cliente di sql/44; senza sql/44 solo il titolare).
   Ogni riga ha origine (scheda, ddt, manodopera, contratto, manuale) e
   origine del prezzo (contratto, ddt, tariffa_oraria, manuale = cambiato
   a mano). Un DDT già in un'altra fattura attiva è proposto bloccato e il
   database lo rifiuta. Una sola aliquota IVA (22, 10, 5, 4, 0). Totali
   calcolati dal database (trigger esistenti, arrotondamento a 2
   decimali). La bozza NON ha numero né data di emissione: li assegna
   l'emissione (F11.2, trigger esistente trg_fatture_genera_numero,
   numerazione già separata per fatture e note di credito: anno + tipo +
   progressivo, "NC/"). SCELTA: creando la bozza la scheda approvata o
   inviata passa "da fatturare"; diventa "fatturata" solo all'emissione
   (F11.2); il bottone "✅ Fatturata" del contabile resta per le fatture
   emesse fuori dal gestionale. "Elimina bozza" (soft) rende di nuovo
   fatturabile la scheda. Le righe di una fattura emessa, annullata o
   eliminata non si toccano più (trigger trg_fatture_righe_solo_bozza).
   Colonne previste e NON ancora usate: fatture.commessa_id e
   fatture.preventivo_id, per collegare la fattura d'anticipo (oggi
   preventivi.anticipo_fattura_*, F4.3) e la fattura finale (oggi
   commesse.fattura_finale_*, F9.2) quando il modulo le emetterà.
   Corretto in sql/45: fatture_proteggi_emessa (trigger di maggio) chiamava
   get_user_role() senza schema e senza search_path: le si fissa il
   search_path, altrimenti il ricalcolo dei totali fallisce dentro le RPC.
   Senza sql/45 la pagina Fatture resta la lista in sola lettura e nulla
   compare. Da F11.2 in poi: emissione via RPC (data in ora italiana,
   numero senza corse tra due utenti, scadenze), blocco della modifica
   diretta di una fattura emessa e del soft-delete delle emesse.

   **Emissione, scadenze, pagamenti, anticipo e finale vere (F11.2,
   js/44-fatture-emissione.js; sql/46-fatture-emissione-pagamenti
   ESEGUITO il 30/10)**.
   EMISSIONE: "📤 Emetti fattura" nella bozza (salva la bozza, poi
   finestra m-emetti-fattura, id mef-): data (giorno italiano, mai nel
   futuro, mai prima dell'ultima fattura dello stesso anno e tipo),
   modalità di pagamento, rate (numero, giorni, importi modificabili;
   somma = totale IVA compresa; predefinito una rata a giorni_pagamento
   del cliente, 30). RPC emetti_fattura (titolare, segreteria,
   contabile): numero dal trigger esistente trg_fatture_genera_numero
   sotto pg_advisory_xact_lock per anno e tipo (niente doppioni con due
   utenti insieme; il numero nasce nella stessa transazione, niente
   buchi), dati fiscali copiati dal trigger esistente (si ferma senza
   ragione sociale e P.IVA o codice fiscale), scadenze in
   fatture_scadenze, scheda (e schede delle righe) "fatturata".
   BLOCCHI (trigger trg_fatture_blocco_emesse e
   trg_fatture_scadenze_solo_rpc): una fattura nasce solo in bozza; si
   emette solo dalle RPC; emessa o annullata non si modifica (tranne
   pdf_url; lo stato del pagamento lo calcolano le RPC) e non si cancella né soft-delete, NEMMENO
   il titolare (il vecchio "riportare in bozza" di fatture_proteggi_emessa
   non si fa più dal sito): si annulla solo con la NOTA DI CREDITO. Le
   scadenze si scrivono solo dalle RPC. Editor SQL libero.
   NOTA DI CREDITO (RPC emetti_nota_credito, finestra m-nota-credito, id
   mnc-): storno TOTALE, numerazione NC/ separata, nessuna scadenza, la
   fattura diventa 'annullata'; solo senza pagamenti registrati e senza
   rate in RIBA; motivo obbligatorio. La scheda torna "da fatturare";
   anticipo: il preventivo torna senza fattura d'anticipo; finale: la
   commessa torna senza fattura finale (non se chiusa). Nota di credito
   parziale: con sql/54 (decisione di Toli del 02/11, vedi punto 9.b dei
   Moduli da costruire); con note parziali già emesse lo storno totale non
   si fa più.
   PAGAMENTI (tabella fatture_pagamenti, RPC registra_pagamento_fattura e
   annulla_pagamento_fattura; finestre m-pagamento-fattura, id mpg-, e
   m-annulla-pagamento, id map-): titolare, segreteria, contabile; per
   rata; data non futura e non prima della fattura, importo non oltre il residuo (predefinito il
   residuo), modalità (bonifico, contanti, assegno, carta, riba,
   compensazione, altro), nota, chi/quando dal database. Pagamento
   parziale: la rata resta aperta (nessuno stato "parziale" per la rata)
   e la fattura diventa parzialmente_pagata (fatture_aggiorna_stato_
   pagamento ridefinita: conta anche gli importi pagati). Rata in_riba:
   niente pagamento a mano (fasi 8-9). Un pagamento sbagliato si
   annulla con motivo (resta nello storico), non si cancella.
   SCADENZE E KPI (fase 6): riquadro "💶 Scadenze e incassi"
   (fat-scadenze-box) nella pagina Fatture con filtri (scadute e prossimi
   30 giorni, solo scadute, tutte da incassare, pagate 90 giorni) e
   "Pagamento" per riga; KPI "Incassi" (da incassare, scaduto, in
   scadenza nei 30 gg, incassato nel mese) nelle dashboard di titolare
   (tit-incassi), segreteria (seg-incassi) e contabile (dash-incassi),
   cliccabili verso la pagina Fatture. Il vecchio riquadro "Scadenze
   pagamenti / solleciti" della dashboard segreteria è stato sostituito
   in F11.3 (riquadro "RIBA, insoluti e solleciti").
   ANTICIPO VERO (passo 6, scelta dichiarata): RPC emetti_fattura_anticipo
   (segreteria, titolare; preventivo in_attesa_anticipo senza fattura
   d'anticipo): crea ed emette la fattura (origine 'anticipo',
   preventivo_id, una riga con l'importo dell'anticipo, IVA del
   preventivo, scadenze) e scrive i riferimenti di F4.3 sul preventivo.
   Quando i pagamenti coprono tutta la fattura, registra_pagamento_fattura
   porta il preventivo ad 'accettato' con anticipo_accredito_data = data
   dell'ultimo pagamento (stessi controlli di trg_preventivi_esito) e
   nasce la commessa (sql/26), che si collega alla fattura (commessa_id,
   trigger trg_commesse_collega_fatture). Il pagamento dell'anticipo lo
   registra solo segreteria o titolare (è la verifica dell'accredito).
   registra_fattura_anticipo e registra_accredito_anticipo (F4.3) restano
   per la fattura emessa FUORI dal gestionale; con la fattura vera sono
   bloccate (trigger trg_preventivi_anticipo_fattura_vera) e nel sito i
   loro bottoni spariscono; con una fattura esterna registrata non se ne
   emette una vera. Nel sito: "🧾 Emetti fattura d'anticipo" e
   "💶 Registra pagamento (accredito)" nella lista Anticipi della
   dashboard segreteria e nella scheda preventivo (titolare). Rifiuto per
   anticipo non versato: resta come F4.3; la fattura d'anticipo emessa
   resta e si annulla con la nota di credito.
   FINALE VERA (passo 12, facoltativa): RPC emetti_fattura_finale_commessa
   (segreteria, titolare, commessa in fine lavori, senza fattura finale
   registrata): righe dal calcolo di sql/39 (preventivo, lavori extra se
   compresi, anticipi in negativo, rettifica con la nota se l'imponibile
   è diverso), una sola IVA (si ferma se un preventivo integrativo ha
   un'altra aliquota), scadenze; poi registra_fattura_finale_commessa di
   sql/39 (sblocca la chiusura). Con la fattura vera i fattura_finale_*
   della commessa si cambiano solo da qui (trigger
   trg_commesse_fattura_finale_vera). La registrazione a mano di F9.2
   resta per la fattura emessa fuori. Bottone "🧾 Emetti fattura finale"
   nel box della commessa.
   Colonna nuova fatture.origine (scheda, anticipo, finale); righe con
   origine anche anticipo, preventivo, lavoro_extra e prezzo
   'preventivo'. Le RPC che toccano i preventivi hanno search_path
   'public, pg_temp' (come sql/25: trigger dei 3.000 € con
   get_user_role() senza schema). Senza sql/46 il sito resta come con il
   45.

   **RIBA, solleciti, dashboard, PDF (F11.3, js/45-fatture-riba-
   solleciti.js; sql/47-fatture-riba-solleciti ESEGUITO il 30/10)**.
   RIBA (fasi 8-9; titolare, segreteria, contabile): riquadro
   fat-riba-box nella pagina Fatture. DISTINTA (riba_presentazioni,
   numero AAAA/NNN dal database sotto blocco per anno): banca e IBAN di
   accredito (predefiniti dalle Impostazioni), rate scelte tra quelle
   aperte (anche insolute o sollecitate, per ripresentarle; filtro "solo
   fatture con pagamento RIBA" = modalità che contiene "riba"). Ogni riga
   copia i dati del debitore dalla fattura emessa e ABI/CAB della sua
   banca (clienti.abi_appoggio/cab_appoggio, altrimenti dall'IBAN
   italiano del cliente): senza ABI e CAB la rata non entra. Le rate
   messe in distinta diventano 'in_riba'. Stati: preparata (si cambia,
   salva_presentazione_riba, o si elimina, elimina_presentazione_riba:
   resta con il numero, le rate tornano com'erano) → inviata
   (segna_presentazione_riba_inviata, data non futura) → esiti per riga
   (registra_esito_riba): ACCREDITATO = pagamento registrato con
   registra_pagamento_fattura di sql/46 (modalità riba, rata pagata;
   l'anticipo pagato sblocca il preventivo come in F11.2); INSOLUTO = rata
   e fattura 'insoluta'. SCELTA DICHIARATA: lo stato finale lo calcola il
   database quando tutte le righe hanno l'esito: tutte accreditate =
   accreditata, miste = parzialmente_accreditata, tutte insolute = chiusa;
   prima resta inviata. Esito sbagliato: annulla_esito_riba (titolare e
   segreteria, motivo, storico nella riga): il pagamento si annulla con
   annulla_pagamento_fattura e la rata torna in RIBA; un insoluto si
   annulla solo se dopo non ci sono solleciti, pagamenti o un'altra
   distinta. Il pagamento nato da una RIBA non si annulla dalla fattura
   (trigger trg_fatture_pagamenti_blocco_riba). FILE PER LA BANCA:
   distinta in PDF e CSV, e file CBI RiBa (vedi sotto).
   FILE CBI RiBa (js/48-riba-cbi.js; codice SIA con sql/49-codice-sia,
   ESEGUITO il 30/10, richiede 47): "🏦 Scarica file CBI" nel dettaglio della
   distinta (titolare, segreteria, contabile), accanto a CSV e PDF.
   Tracciato standard CBI "Ri.Ba.": record da 120 caratteri con CR LF,
   ASCII maiuscolo senza accenti; IB (testa), per ogni ricevuta 14, 20,
   30, 40, 50, 51, 70, EF (coda: numero ricevute, totale in centesimi,
   numero record). Dati: creditore da Impostazioni (altrimenti i dati
   dell'intestazione dei PDF), codice SIA impostazioni.codice_sia (5
   caratteri A-Z 0-9, CHECK; lo scrive il titolare in Impostazioni >
   Dati aziendali, campo si10), ABI/CAB/conto della banca assuntrice
   dall'IBAN della distinta o dell'azienda, debitore dalla riga della
   distinta (snapshot della fattura, ABI/CAB del cliente), provincia
   dalla scheda cliente. Se manca un dato obbligatorio (SIA, IBAN
   italiano, ABI/CAB, P.IVA o C.F. del cliente) il file non si genera e
   la finestra elenca cosa manca. Senza sql/49 il bottone dice
   "Inserisci il codice SIA in Impostazioni (serve aggiornare il
   database)". IL FILE È DA VERIFICARE CON LA BANCA AL PRIMO INVIO: le
   varianti delle banche (tipo flusso e qualificatore nel record IB,
   codice azienda nel record 14, causale, estensione .txt/.cbi) sono
   nella costante CBI_RIBA_VARIANTI in cima a js/48; le posizioni di
   ogni campo sono commentate nel codice.
   SOLLECITI (fase 10; solo segreteria e titolare, il contabile vede):
   registra_sollecito su rata insoluta, sollecitata o aperta e scaduta
   (data, mezzo telefono/email/PEC/lettera/raccomandata/altro, a chi,
   nota; livello 1, 2, 3...): rata e fattura 'sollecitata'.
   esito_sollecito (inviato → risposto | ignorato, nota); elimina_sollecito
   (solo l'ultimo della rata, motivo, resta come eliminato; la rata torna
   com'era). Riquadro fat-solleciti-box (filtri: insoluti, scadute non
   sollecitate, solleciti senza risposta) e box "RIBA e solleciti" nella
   fattura. Stato della rata non pagata ricavato dalla sua storia
   (stato_aperto_scadenza_fattura: in RIBA, poi l'ultimo tra insoluto e
   sollecito, altrimenti aperta), usato anche quando si annulla un
   pagamento (ricalcola_scadenza_fattura ridefinita);
   fatture_aggiorna_stato_pagamento ridefinita: pagata > insoluta >
   sollecitata > parzialmente pagata > in RIBA > da pagare.
   DASHBOARD (fase 11): titolare "📈 Fatturato e insoluti" (tit-fatturato:
   fatturato del mese e dell'anno, imponibile con le note di credito
   tolte; incassato dell'anno; insoluti); segreteria
   (seg-riba-solleciti, al posto del vecchio riquadro) e contabile
   (dash-riba-solleciti): RIBA da presentare entro 60 giorni, distinte da
   portare in banca, esiti da registrare, insoluti da sollecitare,
   scadute non sollecitate, solleciti senza risposta, primi insoluti con
   "📞 Sollecito"; rappresentante (rap-insoluti-box): insoluti e rate
   sollecitate dei clienti con clienti.rappresentante_id = lui (RLS di
   sql/10 + filtro nel sito), con commessa, righe della fattura e ultimo
   sollecito.
   PDF (fase 12): "📄 Scarica PDF" nella fattura emessa, annullata o
   nota di credito (chi vede la fattura), intestazione TOLI FIRE come gli
   altri PDF, dati dallo snapshot, righe, IVA, totali, scadenze,
   pagamento (RIBA: ABI/CAB d'appoggio; altrimenti IBAN dell'azienda dalle
   Impostazioni), dicitura "Copia di cortesia. Non sostituisce la
   fattura elettronica trasmessa tramite il Sistema di Interscambio
   (SDI)" (domanda per Toli). "💾 Salva copia" (titolare, segreteria,
   contabile) nel bucket fatture-pdf e in fatture.pdf_url; "📂 Copia
   salvata". DATI BANCARI: banca d'appoggio, ABI, CAB nella finestra
   cliente (scheda Fatturazione) e nella scheda cliente per titolare e
   segreteria (js/09 saveCli li aggiunge solo con sql/47); modalità di
   pagamento del cliente con "RIBA 30/60/90gg"; banca e IBAN
   dell'azienda nelle Impostazioni. Senza sql/47 il sito resta come con
   il 46.

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
   - D3: FATTO (30/10, nessun SQL) — riquadro "Impegni del team tecnico"
     nella dashboard del rappresentante: il riquadro dei 14 giorni ha
     ora l'id `rap-impegni-team-14gg` (l'elenco del mese resta
     `rap-impegni-team-lista`) e `loadImpegniTeamAnonimi` (js/13) è
     chiamata da `loadDashRappresentante`. Dati anonimi dalla RPC
     impegni_tecnici_dashboard (data, fascia, tecnico; nessun cliente),
     date in ora locale.
   - D4: FATTO (30/10, nessun SQL) — bottone "🗑️ Elimina attività"
     nella finestra m-attivita-ingegnere (`mai-elimina`, visibile solo
     aprendo un'attività già salvata): conferma, chiude la finestra e
     ricarica il calendario (js/05 `eliminaAttivitaIngegnere`). RLS: la
     policy calendario_personale_delete_proprio (utente_id = auth.uid())
     permette già all'ingegnere di togliere le proprie attività; se il
     database non cancella nulla compare un avviso.
   - D5: CHIUSA (26/10) — nessuna approvazione obbligatoria del
     titolare. Il titolare può fare tutto quello che fanno gli altri
     ruoli e intervenire quando vuole, ma non è mai un passaggio
     obbligato del flusso. `inviaPreventivoPerApprovazione` resta non
     collegata (candidata a rimozione con conferma di Toli).
   - D6: CHIUSA (30/10), superata — la posizione delle pagine la gestisce
     ora js/47-posizione-pagine.js per tutte le pagine (ricorda la
     posizione a ogni cambio di pagina e la rimette tornando indietro);
     `ricordaPosizionePagina`/`ripristinaPosizionePagina` di js/01 sono
     rese vuote da js/47, quindi non c'è più nulla da rimettere in
     renderPC (js/09).
   - D7: costruire le schede di manutenzione ordinaria del tecnico
     (`apriManutenzioneOrdinaria`/`salvaManutenzioneOrdinaria` chiamate da
     index.html ma mai scritte: oggi il bottone non fa nulla). Decisione
     di Erika del 30/10: farlo funzionare, non toglierlo. Contenuti della
     scheda da definire (si aspettano le specifiche di Erika).

6. **Riepilogo ore degli operai su tutte le commesse** — FATTO il 30/10
   (js/49-ore-cantiere.js, nessun SQL; vedi "Ore cantiere" sotto F12.1):
   pagina "⏱️ Ore cantiere" per titolare (e informatico) e capo tecnico.
   Chiesto da Erika il 28/10 (risposta alla domanda 4 di F8.4).

7. **Risposte di Erika alle domande aperte (29/10/2026)** — applicate
   con la task "Decisioni del 29/10" (commit [Decisioni 29/10],
   sql/42-decisioni-29-10 ESEGUITO il 29/10, richiede 07, 22, 26, 30, 33, 36) o
   già in linea con il sito:
   - Decisioni del 23/10 CONFERMATE (informatico come titolare, cliente di
     chi lo crea, exwide a Giulio Pistolesi, intervento non completato in
     coda), TRANNE il tecnico che intesta un intervento a un collega: "da
     vedere" (resta com'è finché Toli non decide).
   - Sostituto del capo tecnico: da decidere più avanti. Account di prova:
     si tengono per ora.
   - FATTO (sql/42 + js/26, js/32; vedi F8.1): il capo tecnico vede
     l'ORIGINALE del preventivo firmato (preventivi-documenti
     `<preventivo>/accettazione/`) delle commesse che legge (policy
     storage commesse_preventivo_firmato_lettura, RPC
     preventivo_firmato_commessa).
   - FATTO SOLO NEL SITO (js/27, js/28, js/26; vedi F6.1, limite
     dichiarato): prezzi d'acquisto (ordini fornitori, consumabili e
     noli, PDF dell'ordine): il capo tecnico NON li vede; la segreteria
     sì (ha le fatture). Nel database restano leggibili.
   - FATTO (sql/42 + js/27; vedi F6.1): il titolare riporta a
     "confermato" un ordine segnato "arrivato" per errore, con motivo
     (cambia_stato_ordine_fornitore ridefinita, rollback = versione di
     sql/30).
   - Noli: il rappresentante non li chiede (già così); va bene chiederli
     anche a cantiere in corso (già così). Nolo evaso come ordine: da
     decidere.
   - FATTO (js/29, js/13, index.html; vedi F6.3): l'avviso dei
     materiali in ritardo arriva anche al rappresentante del cliente
     (rap-materiali-ritardo).
   - Faldone: idoneità visibile al capo tecnico senza file (già così);
     consegna forzata del titolare con motivo (già così); documento che
     scade durante i lavori = solo avviso (già così). FATTO (sql/42 +
     js/31; vedi F7.2): il POS del subappaltatore è documento sempre
     richiesto (faldone_tipi_obbligatori ridefinita, rollback = versione
     di sql/33).
   - Cantiere: chi scrive accessi/referenti/sicurezza va bene (già così);
     il capo tecnico può vedere importo commessa e nomi dei fornitori (già
     così); squadra solo capo tecnico e titolare (già così); documento
     scaduto in squadra = solo avviso (già così).
   - FATTO (sql/42 + js/34, index.html; vedi F8.3): cronoprogramma, il
     peso delle fasi sono le ORE previste (colonna ore_previste, RPC
     salva_fase_commessa_ore; senza ore resta il peso).
   - Chiusura: il titolare può chiudere con motivo (già così); basta la
     dichiarazione del gestionale (per ora); i lavori extra vanno di norma
     nella fattura finale, ma se escono dopo si integra o si rifà la
     fattura (oggi la spunta "comprende gli extra" e la correzione del
     titolare dopo la chiusura lo permettono).
   - FATTO (js/39, js/03, index.html; vedi F10.1, nessun SQL): il
     promemoria dei rinnovi va SOLO al rappresentante del cliente (tolto
     il box dalla dashboard del capo tecnico; il titolare lo tiene).
   - In sospeso: testo e decreti della dichiarazione (Erika controlla),
     disdetta anticipata del contratto, lavori extra sotto 3.000 € e
     importo degli extra nella commessa.

8. **Risposte di Erika su F10.3 (29/10/2026)** — appuntamenti:
   - Obbligo di appuntamento solo per le manutenzioni programmate nuove o
     anche per quelle esistenti: NON DECISO (resta solo le nuove).
   - FATTO (sql/43 + js/41): anche il CAPO TECNICO fissa l'appuntamento
     (fissa_appuntamento_intervento; bottone nella sua dashboard e nella
     finestra dell'intervento).
   - La segreteria può togliere l'obbligo con motivo: CONFERMATO (già così).
   - FATTO (sql/43 + js/02): il portale clienti mostra l'ORA
     dell'appuntamento (portale_ticket ridefinita, solo se fissato per
     quella data; rollback = versione di sql/13).
   - DA COSTRUIRE (modulo a parte): promemoria al cliente il giorno prima
     dell'appuntamento. Serve un canale di invio (email o SMS, es. Edge
     Function Supabase + servizio di posta) e il consenso/recapito del
     cliente: oggi il gestionale non invia messaggi.

9. **Risposte di Toli alle 28 domande (mail del 02/11/2026)** — DECISIONI
   DI TOLI (valgono come conferma). "Assunta" = la segreteria.
   GIÀ COSÌ NEL SITO (nessun lavoro):
   - Copia PDF "di cortesia, non sostituisce la fattura SDI": va bene (2).
   - Fattura emessa si corregge solo con nota di credito, anche il
     titolare (3). P.IVA o C.F. obbligatori (5).
   - Ogni fattura nasce da un "input" (6): scheda finita dell'operativo →
     la segreteria emette; anticipo con preventivo approvato → la
     segreteria emette la fattura d'anticipo. Anticipo e finale senza
     scheda di lavoro: va bene.
   - Contratto (8): la manutenzione ordinaria con contratto NON prevede
     manodopera; i controlli trimestrali, semestrali, annuali sono
     compresi e si addebita solo il costo del contratto; se si fanno
     altre azioni si addebitano anche le ore (= manodopera proposta non
     spuntata, come oggi).
   - "Su chiamata" sempre fuori contratto; senza contratto tutto a
     consuntivo (11). Buono al cliente SENZA prezzi (12). Preavviso 30
     giorni FISSO (13).
   - Nessun audit nuovo dopo il rinnovo (17, parte).
   - Il tecnico NON intesta interventi a un collega: si segue l'organigramma
     (21). Sostituto del capo tecnico: NESSUNA funzione, Toli cambia il
     ruolo all'utente quando serve (22).
   - Ore cantiere: il capo tecnico vede le ore di tutti (25). Fino a 13
     righe in "Cosa tocca a me" del capo tecnico vanno bene (26).
   - Guida titolare: "la struttura costa circa 1.000 € al giorno" resta
     (27). Il commerciale (acquisti) può sempre girare il progetto
     all'ingegnere (28: già con "Rimanda indietro" / verifica tecnica).
   DA FARE (lavori nuovi):
   a) (1) Fattura elettronica con ARUBA: allineare numerazione e, in
      futuro, export verso Aruba (Modulo 2 SDI).
   b) (4) NOTA DI CREDITO PARZIALE. PRONTO: sql/54-nota-credito-parziale
      (ESEGUITO il 02/11, richiede 46 e 47; controllo in fondo) +
      js/52-nota-credito-parziale.js. RPC nuova emetti_nota_credito_parziale
      (titolare, segreteria, contabile; anticipo e finale solo segreteria e
      titolare): righe della fattura (quantità e prezzo non oltre i
      fatturati, sconto di riga uguale) e/o righe libere, IVA della
      fattura, motivo obbligatorio, NC/ come oggi. SCELTE DICHIARATE: totale
      (IVA compresa) > 0 e non oltre il residuo stornabile (totale fattura
      meno note emesse) e SOLO SUL NON INCASSATO (rate non pagate e non in
      RIBA; l'incassato non si storna da qui, rimborso fuori da questo
      lavoro); le rate si riducono dall'ULTIMA scadenza; una rata a zero
      senza pagamenti, RIBA o solleciti si toglie, altrimenti resta con
      importo = pagato; nella rata e nella nota resta scritto di quanto è
      stata ridotta (nessuna tabella nuova). La fattura resta emessa; se con
      le note è stornata tutta diventa annullata con i controlli e gli
      effetti dello storno totale (scheda, anticipo, fattura finale); le
      note parziali non toccano scheda, anticipo né finale. Una nota emessa
      non si annulla. emetti_nota_credito ridefinita: rifiuta lo storno
      totale se ci sono già note parziali. Finestra m-nota-credito con
      "Storno totale" / "Storno parziale" (righe spuntabili, + Riga libera,
      totale in anteprima con le stesse regole dei trigger); nella fattura
      l'elenco delle note parziali e "Resta da stornare"; PDF della nota
      "Storno parziale della fattura n. ..." (js/45). Fatturato del
      titolare: toglie già l'imponibile di ogni nota (verificato). Senza
      sql/54 solo storno totale come prima. Provato in locale (backup pre53,
      Assunta segreteria e Giulio rappresentante).
   c) (7) IVA: oltre al 22%, natura N1 (confermato da Toli il 03/11:
      "N1", escluse art. 15) e SPLIT PAYMENT. PRONTO: sql/59-iva-n1-split-
      payment (ESEGUITO il 03/11, backup 2026-11-03-pre59, richiede 45, 46, 54) + js/43, 44, 45, 52.
      SCELTE DI ERIKA del 03/11: righe N1 nella STESSA fattura delle righe
      all'aliquota della fattura (supera "una sola aliquota per fattura":
      resta una sola aliquota, più le righe N1); split payment = spunta sul
      cliente (clienti.split_payment, scheda Fatturazione, titolare e
      segreteria), copiata nella fattura nuova e cambiabile nella bozza.
      DB: fatture_righe.natura_iva (vuota o 'N1'), fatture.totale_esente,
      fatture.split_payment (trigger trg_fatture_split_payment: dal cliente
      alla nascita, dalla fattura nella nota di credito, fisso dopo la
      bozza). fatture_aggrega_totali ridefinita: imponibile = righe
      soggette, IVA su quelle, esente = righe N1, totale = imponibile +
      esente + IVA (senza IVA con lo split): rate, pagamenti, RIBA e
      solleciti usano "totale" come prima, quindi con lo split valgono
      senza IVA. Ridefinite salva_bozza_fattura (natura per riga e
      p_split_payment facoltativo; la versione a 5 dati si toglie, il sito
      vecchio chiama la nuova), emetti_nota_credito ed
      emetti_nota_credito_parziale (la nota copia la natura delle righe;
      riga libera anche N1), emissione_fattura_interna (solo il controllo
      del totale: conta anche le righe N1, così si emette anche una nota
      di credito solo N1, es. un bollo). Sito: spunta "Esclusa dall'IVA
      (N1, art. 15)" su ogni riga della bozza e sulle righe libere della
      nota parziale, spunta "Split payment" sotto l'aliquota, totali con
      "Totale documento" e "Netto a pagare"; emissione d'anticipo e finale
      con rate senza IVA per i clienti in split; PDF con "(N1 - esclusa
      art. 15 DPR 633/72)" sulla riga, riepilogo e diciture art. 17-ter e
      art. 15. Senza sql/59 tutto come prima. Provato su Postgres (backup
      pre58 + 58 + 59: bozza con N1 e split del cliente, natura non valida,
      emissione con rata 202 su 246 di documento, split fisso sull'emessa,
      nota parziale solo N1, storno totale con N1, pagamento → pagata;
      rollback e riesecuzione) e nel browser di prova (bozza, totali,
      salvataggio, PDF).
   d) (9) RIBA: registrare le spese bancarie degli insoluti; il
      contabile registra anche i solleciti. PRONTO: sql/60-riba-spese-
      insoluti-solleciti-contabile (ESEGUITO il 04/11, backup pre60, richiede 47) + js/45.
      Colonne riba_righe.spese_insoluto (> 0, max 1.000 €), _nota, _da,
      _da_nome, _il; RPC registra_spese_insoluto_riba (titolare,
      segreteria, contabile; solo riga insoluta; 0 o vuoto = togli).
      SCELTA DICHIARATA: le spese si registrano e basta, il riaddebito al
      cliente si fa a mano (riga in fattura o nel sollecito). Sito: campo
      "Spese bancarie dell'insoluto" nella finestra Esito (scelto
      Insoluta; salvato dopo l'esito), bottone "💶 Spese" sulla riga
      insoluta della distinta (finestra m-riba-spese, id mrs-), spese
      mostrate nella distinta e nel box "RIBA e solleciti" della fattura.
      registra_sollecito, esito_sollecito, elimina_sollecito ridefinite
      con il solo controllo del ruolo + contabile (rollback = sql/47);
      puoSolleciti() vale per il contabile solo con sql/60. Guide
      segreteria e contabile aggiornate. Provato su Postgres (backup pre59
      + 59 + 60, rollback e riesecuzione) e nel browser di prova.
   e) (10) Toli non ha capito il codice SIA/file CBI: spiegazione scritta
      il 03/11 (mail preparata in Mail per Erika, con la richiesta del codice
      SIA alla banca e la conferma di sql/60). In attesa del codice.
   f) (14) Controlli del piano rimasti indietro più di 12 mesi: si
      segnano "saltato". FATTO (02/11, js/42, nessun SQL: lo stato
      'saltato' c'era già): in testa al Piano mensile del mese corrente,
      per titolare e capo tecnico, avviso "🗂️ N controlli del piano più
      vecchi di 12 mesi" (pianificato, senza intervento, mese prima di
      meseMinimoArretrati) e bottone "Segna come saltati" con conferma
      (segnaControlliVecchiSaltati). Guida capo tecnico aggiornata.
   g) (15) Appuntamento con il cliente per TUTTI gli interventi (non solo
      la manutenzione programmata nuova). PRONTO: sql/50-appuntamento-
      tutti-interventi (ESEGUITO il 02/11, richiede 43; anteprima e controllo in
      fondo al file): ridefinisce solo ordini_lavoro_appuntamento (alla
      nascita obbligo per ogni tipo, da pianificare o pianificato; senza
      obbligo restano gli interventi creati da un tecnico e quelli nati
      completati) e segna "serve l'appuntamento" sugli interventi aperti
      senza data o con data da oggi in poi (quelli con la data passata non
      si toccano, il tecnico li deve chiudere); storico con la nota
      "Appuntamento richiesto per tutti gli interventi (decisione di Toli
      del 02/11)". Rollback: funzione di sql/43 e obbligo tolto a quelli
      segnati dal 50 ancora senza appuntamento fissato. Guide di tecnico,
      capo tecnico e segreteria aggiornate. Provato in locale sul backup
      pre49.
   h) (16) Portale clienti: nascondere la data indicativa finché
      l'appuntamento non è fissato. PRONTO: sql/51-portale-data-dopo-
      appuntamento (ESEGUITO il 02/11, richiede 43): portale_ticket ridefinita,
      per l'intervento che aspetta l'appuntamento (richiesto, non fissato,
      da pianificare o pianificato) niente data né fascia e il segno
      in_attesa_appuntamento; js/02 portaleCaricaTicket scrive "📞
      Intervento in programmazione: vi chiameremo per fissare insieme
      giorno e ora". Senza sql/51 il portale è come prima. Rollback =
      versione di sql/43. Provato in locale.
   i) (17) Audit presidi PER SEDE (non per cliente); in manutenzione si
      sostituisce qualcosa (manichetta, estintore): gestire la
      sostituzione del presidio nel registro. PRONTO: sql/53-audit-per-
      sede-sostituzione-presidi (ESEGUITO il 02/11, richiede 41; legge 40 e 52;
      anteprima e controllo in fondo) + js/51-sostituzione-presidi.js.
      AUDIT PER SEDE: ordini_lavoro_audit_presidi ridefinita (primo
      intervento di manutenzione programmata della SEDE; sede di
      riferimento = audit_sede_riferimento: la sede dell'intervento, se
      manca l'unica principale, se no l'unica sede); registra_audit_presidi
      ridefinita (salva audit_presidi.sede_id, controlla solo i presidi
      della sede: audit_presidi_mancanti_sede; con più sedi niente
      differenze nel messaggio, "confronto_parziale"); chiusura bloccata
      solo per i presidi della sede. Gli audit già fatti hanno
      audit_presidi.tutte_le_sedi = true e valgono per tutte le sedi (il
      cliente non rifà l'audit). audit_presidi_da_esaminare ridefinita:
      trovati = somma dell'ultimo audit di ogni sede
      (audit_presidi_totali_cliente; le sedi contate sono quelle con
      presidi nel registro o già controllate; per le sedi coperte solo da
      un audit "tutte le sedi" più vecchio si conta il registro di oggi;
      cliente con solo audit vecchi = confronto identico a prima), campi
      nuovi sede_nome, sedi_con_audit, sedi_totali ("audit fatto in N
      sedi su M" nella dashboard, js/40). RPC nuova ambito_audit_intervento
      (presidi dell'audit dell'intervento: elenco del tecnico in js/40
      renderPresidiAudit, con "Solo i presidi di questa sede: ...").
      SOSTITUZIONE: colonne impianti.sostituito_da (fk impianti,
      impianti_sostituito_da_fkey), sostituito_il, sostituito_odl_id,
      sostituito_motivo; RPC sostituisci_presidio (tecnico solo su un suo
      intervento aperto di quel cliente, titolare/capo tecnico/segreteria
      sempre; matricola, annata e motivo obbligatori; il vecchio va in
      eliminato_il, il nuovo eredita tipo/cliente/sede/ubicazione/piano/
      locale/agente/periodicità/numero progressivo, controllo e
      installazione di oggi in ora italiana, prossimo = oggi + periodicità,
      capacità solo estintori con sql/52). Sito: "🔁 Sostituito" al passo
      Presidi (elenco normale e audit; il nuovo risulta già "trovato"),
      nella pagina Presidi (tabella e schede) e nella scheda cliente per
      titolare, capo tecnico, segreteria (bottoneSostituisciPresidio);
      finestra m-sostituzione-presidio (id sost-). Buono di lavoro (js/42):
      "Presidi sostituiti nell'intervento" nel box (da mettere nel DDT o in
      fattura) e "PRESIDI SOSTITUITI" nel PDF; con un audit di una sola
      sede il confronto del buono si fa sul registro del cliente. Corretto
      nello stesso giro: passo Presidi (js/11) e scheda cliente (js/09)
      mostravano anche i presidi eliminati. SCELTE DICHIARATE: le colonne
      sostituito_* non sono protette da trigger (l'ufficio le potrebbe
      scrivere con update diretto); gli interventi con audit ancora aperti
      controllano solo la loro sede. Rollback: funzioni di sql/41,
      colonne tolte, dati di lavoro restano. Provato in locale sul backup
      pre52 + sql/52 con i ruoli veri (non nel browser).
   j) (18) Estintori: campo CAPACITÀ (6 kg, 9 kg...). PRONTO:
      sql/52-capacita-estintori (ESEGUITO il 02/11, nessun prerequisito oltre lo
      schema base; anteprima e controllo in fondo): colonna
      impianti.capacita (numero + kg o lt, vincolo
      impianti_capacita_check) e spostamento nella capacità delle marche
      che erano capacità (bug del sito fino al 29/10: es. marca "6kg"; nel
      backup del 02/11 sono 2). js/07: select me4 con "Non indicata" e più
      misure (1-50 kg, 2-50 lt; un valore fuori elenco si aggiunge al
      select), salvata da saveP solo per gli estintori e solo se la
      colonna c'è (capacitaEstintoriDisponibile), letta da editP
      (impostaCapacitaEstintore; senza colonna dalla marca come prima).
      Provato in locale (file, controllo, rollback, file di nuovo).
   k) (19) "Non rinnovato" prima della scadenza: risposta del 03/11 al
      punto 10 qui sotto (contratto da richiamare).
   l) (20) Promemoria al cliente prima dell'appuntamento: EMAIL e
      CHIAMATA della segreteria. FATTO (02/11, js/50-promemoria-
      appuntamenti.js, NESSUN SQL): box "🔔 Promemoria ai clienti" nelle
      dashboard di segreteria (seg-promemoria) e titolare (tit-promemoria)
      con gli appuntamenti fissati del prossimo giorno lavorativo (domani;
      venerdì → sabato, domenica, lunedì), "📞 Chiama", "✉️ Mail
      promemoria" (mailto già scritto al referente_email, altrimenti
      email_portale; il gestionale non invia mail da solo) e "✓ Avvisato".
      SCELTA DICHIARATA: "Avvisato" in localStorage del browser (per
      giorno e ora dell'appuntamento), non condiviso tra computer: se serve
      condividerlo, colonna nuova. Riga "Clienti da avvisare" in "Cosa
      tocca a me" della segreteria. Si carica avvolgendo
      caricaAppuntamentiDaFissare (js/41). Guida segreteria (info-seg-6).
   m) (23) Ordini ai fornitori anche SENZA offerta scelta, ma con un
      preventivo chiaro approvato, le cifre di spesa e la destinazione:
      un cantiere (commessa) oppure il MAGAZZINO. RINVIATO: decisione di
      Erika del 02/11 "non farli per ora" (gli ordini restano solo dalle
      offerte scelte della commessa). Proposta pronta se si riprende:
      "Ordine libero" con preventivo del fornitore allegato, voci con
      prezzi, destinazione commessa o magazzino, approvazione del titolare
      sopra una soglia in Impostazioni.
   n) (24) Lavori extra sotto 3.000 €: il preventivo integrativo lo
      prepara anche il rappresentante; l'importo degli extra si SOMMA
      alla commessa. PRONTO: sql/56-lavori-extra-rappresentante (ESEGUITO
      il 03/11, richiede 38 e 22; controllo in fondo) +
      js/53-lavori-extra-rappresentante.js. A) RPC (search_path 'public,
      pg_temp', solo il RAPPRESENTANTE del cliente della commessa:
      clienti.rappresentante_id = lui, commessa aperta):
      preventivo_extra_rappresentante (può/motivo, bozza e voci senza
      costi), salva_preventivo_extra_rappresentante (voci con prezzo
      cliente, costo 0, IVA 22/10/5/4/0, note, condizioni; totale calcolato,
      SOPRA 3.000 € errore "lo prepara il commerciale"; crea il preventivo
      con origine 'lavoro_extra_rappresentante', commerciale vuoto,
      rappresentante = lui, collegato al progetto del lavoro extra, progetto
      → 'in_valutazione' così esce da "Da preventivare"; corretto dopo
      l'invio torna in bozza e il PDF va rifatto),
      invia_preventivo_extra_rappresentante (PDF in <id>/cliente/ →
      'inviato_a_rappresentante', in "I miei preventivi", il titolare lo vede
      tra i preventivi da controllare), lascia_preventivo_extra_al_commerciale
      (cancella la bozza, progetto → inviato_a_commerciale). Non può se c'è
      già un preventivo del commerciale su quel progetto. Colonna
      commesse_lavori_extra.preparato_da_rappresentante; regola storage
      preventivi_documenti_cliente_rappresentante (carica il PDF solo dei
      suoi preventivi integrativi in bozza). Sito: "🧾 Prepara io il
      preventivo (fino a 3.000 €)" / "Riprendi il mio preventivo" nel box
      della commessa e in rap-lavori-extra; finestra m-preventivo-extra-rapp
      (id per-; numeri con la virgola; anteprima del totale, sopra 3.000 €
      bottoni spenti); PDF con generaPreventivoClientePDF(datiEsterni) di
      js/18 (stesso modello, senza salvataggio: lo carica js/53); in "I miei
      preventivi" (js/13) "preparato da te" e "✏️ Correggi il preventivo" al
      posto di "Rinvio al commerciale". Il commerciale non ha "Prepara/
      Riprendi" né "🧾 Preventivo n." su questi lavori ("preparato dal
      rappresentante"). B) RPC importi_extra_commesse (titolare, segreteria,
      commerciale, capo tecnico, rappresentante sue commesse): numero e
      totale imponibile dei preventivi integrativi accettati (regola di
      calcolo_fattura_finale_commessa); js/26 mostra "Preventivo X + lavori
      extra accettati (n) Y = Totale Z" nel riepilogo e nel tab Commesse del
      cliente e il totale (con il dettaglio sotto) nella pagina Commesse.
      commesse.importo_imponibile NON cambia. Senza sql/56 tutto come prima.
      Provato in locale (backup pre54-55 + commessa di prova; Giulio
      rappresentante, Laura commerciale, Luca capo tecnico; Chrome headless a
      390 px: editor, oltre 3.000 bloccato, PDF scaricato e caricato, "I miei
      preventivi", Correggi, importi; rollback e riesecuzione).
   o) (25) Ore cantiere: export per giorno. FATTO (03/11, js/49, nessun
      SQL): "⬇️ CSV per giorno" (scaricaCsvOreCantierePerGiorno) con gli
      stessi filtri della pagina: una riga per giorno, persona, commessa e
      lavorazione (ore a testa, persone, ore) e in fondo il totale per
      giorno (ore, persone presenti, commesse). Excel italiano come il CSV
      per persona.
   p) (26) Dashboard titolare: dato sulle ore delle squadre. FATTO (03/11,
      js/49, nessun SQL): riquadro "⏱️ Ore delle squadre in cantiere"
      (tit-ore-cantiere, caricaOreSquadreTitolare avvolgendo
      loadDashTitolare): ore del mese, persone, giorni di cantiere, media a
      persona al giorno (ore / presenze persona-giorno, subappaltatori x
      persone), confronto con il mese scorso fino allo stesso giorno, 3
      commesse con più ore, "Apri Ore cantiere". Niente costi. Nascosto
      senza ore o senza sql/37. Guide titolare e capo tecnico aggiornate.
   r) Trovato il 02/11 (non è una domanda di Toli): l'avviso "Nuove lead
      dal sito" del titolare (js/18 e js/46) usa lead_sito.letto_titolare_il,
      che nel database NON esiste: l'avviso non compare mai. PRONTO:
      sql/55-lead-sito-letto-titolare (ESEGUITO il 02/11): aggiunge solo la
      colonna; policy invariate (il titolare legge e aggiorna).
   t) Errore trovato il 02/11: "Rinvia al commerciale" del rappresentante
      (js/13) dava sempre "violates check constraint preventivi_stato_check":
      la RPC rinvia_preventivo_al_commerciale_da_rappresentante (di prima di
      ottobre) metteva lo stato 'rinviato_al_titolare', non permesso. PRONTO:
      sql/57-rinvio-preventivo-rappresentante (ESEGUITO il 02/11): la RPC (ora con
      p_nota facoltativa) riporta il preventivo in BOZZA, toglie i dati
      dell'invio al rappresentante e rimette il progetto in "Da
      preventivare" (inviato_a_commerciale) con la nota "Rinviato dal
      rappresentante: ..." in nota_integrazione. js/13 chiede la nota
      (prompt) e, senza sql/57, richiama la funzione vecchia. Provato su un
      Postgres di prova (errore riprodotto con la vecchia, nuova, chiamata
      a un parametro, altro rappresentante rifiutato, rollback).
   u) Segnalazione di Erika del 03/11: nei PDF "a volte cambia il font e
      taglia le parole". Causa (provata): con i font di base di jsPDF una
      riga con un carattere fuori da WinAnsi (≥, trattino di Word U+2011,
      spazio stretto U+202F di Excel/PDF, emoji...) viene scritta tutta in
      UTF-16: lettere distanziate, altro aspetto, larghezze sbagliate.
      FATTO in js/00 (proteggiTestoPDF, chiamata da caricaLibreriePDF):
      pulisciTestoPDF sostituisce i caratteri noti (≥ → >=, trattini → -,
      spazi strani → spazio, ✓ → v, lettere accentate di altre lingue →
      senza accento) e toglie gli altri, in text, splitTextToSize e nelle
      misure dei testi (dal 03/11 anche lo spazio fisso di Word U+00A0,
      che faceva spezzare le parole a metà nelle tabelle, il tab di Excel,
      che spostava il testo fuori colonna, e gli a capo \r di Windows), su
      jsPDF.API (autoTable) e su ogni documento nuovo
      (jsPDF avvolto). Vale per tutti i PDF del sito. Provato in Chrome
      headless (testo, tabella, a capo).
   s) Richiesta di Erika del 02/11: la freccia indietro del browser e del
      telefono usciva dal gestionale (dai Preventivi e dal PDF si finiva
      sulla dashboard). FATTO in js/47 (nessun SQL): ogni cambio di pagina
      scrive #pagina nella cronologia del browser (history.pushState); la
      freccia indietro torna alla pagina di prima nel punto in cui si era,
      e se c'è una finestra aperta chiude solo la finestra; ricaricando il
      sito (es. tornando dal PDF) boot riapre la pagina dell'indirizzo, e
      per le schede di dettaglio il loro elenco (ELENCO_DELLA_SCHEDA). Una
      pagina non permessa al ruolo resta sulla dashboard. Provato in Chrome
      headless (rappresentante e titolare).
      Dal 03/11 (richiesta di Erika: "dal PDF aperto la freccia deve tornare
      a Preventivi") i PDF dei preventivi si aprono nella STESSA scheda
      (js/47 apriPdfStessaScheda: PDF del rappresentante in js/13, allegato
      del fornitore e certificati in js/18; il certificato si segna letto
      dall'ingegnere prima di aprirlo): la freccia indietro torna alla
      pagina e al punto di prima (posizione in sessionStorage se il sito si
      ricarica; se il browser rimette la pagina, l'elenco del rappresentante
      si aggiorna). I PDF generati ("Genera PDF") si scaricano come prima.
      Dal 04/11 (F14.1, js/47 + doLogout di js/01, nessun SQL): ogni scheda
      ha l'indirizzo #/<oggetto>/<id> (SCHEDE_CON_INDIRIZZO: preventivo,
      commessa, cantiere = commessa sulla scheda Cantiere, cliente,
      progetto, fornitore, persona e subappaltatore = scheda documenti;
      fattura e intervento solo d'ingresso: aprono pagina e finestra). Le
      open*Detail e openSchedaDocumenti, avvolte, scrivono l'indirizzo; la
      freccia indietro torna alla scheda di prima, ricaricando si resta lì.
      Link aperto da non collegati: login, poi boot apre la scheda (sopra la
      dashboard, così indietro torna alla dashboard). Pagina non permessa o
      scheda non leggibile: toast "Non hai accesso" e dashboard. Il
      rappresentante (senza preventivo-detail) va in I miei preventivi con la
      ricerca sul numero. Frammenti di Supabase Auth (#access_token=, #error=,
      type=recovery...) ignorati e lasciati nell'indirizzo; portale su
      ?portale= invariato. "Esci" azzera l'indirizzo. Oggetti senza scheda
      (ordine, documento, pos, spesa, ticket, mezzo, sede, avviso): una riga
      in SCHEDE_CON_INDIRIZZO quando avranno la loro funzione di apertura.
      Guide Info: info-tit-9, seg-16, con-8, ct-17, tec-14, com-13, rap-18,
      ing-11.
   v) Richiesta di Erika del 04/11: campo "🔍 Cerca" nelle pagine
      Preventivi del titolare (preventivi-titolare), del commerciale
      (preventivi) e del rappresentante (preventivi-rapp). FATTO (js/18
      filtraPreventiviPagina, index.html cerca-prev-<pagina>, nessun SQL):
      filtra nel browser le schede (.card) già caricate, tutte le parole
      scritte, senza maiuscole né accenti, con "N preventivi trovati";
      quando un elenco si ricarica il filtro si riapplica (MutationObserver).
   q0) vedi anche il punto 10 (risposte di Toli del 03/11).
   q) (28) Soglia "lavoro grande" = 30.000 € (la imposta il titolare in
      Impostazioni > Soglie e tariffe; esempio della guida aggiornato).
      Creare il più possibile SCHEDE per il RAPPRESENTANTE, per ogni tipo
      di lavoro, così compila da solo i dati che servono.

10. **Risposte di Toli ai 9 dubbi (03/11/2026)** — DECISIONI DI TOLI.
   - (1) IVA: la natura che serve è N1 (vedi 9.c, da fare con lo split
     payment).
   - (2) Contratto disdetto prima della fine o non rinnovato: "bisogna
     assegnarlo a un venditore che lo chiama per richiuderlo". PRONTO:
     sql/58 + js/54-recupero-contratti.js. "❌ Disdetta anticipata" nella
     scheda (registra_rinnovo_contratto 'non_rinnovato' anche fuori dal
     preavviso; la RPC lo permetteva già). Trigger
     trg_clienti_periodicita_recupero: non rinnovato → recupero_stato
     'da_richiamare'; di nuovo attivo ("Rinnovato") → 'recuperato'; update
     diretti delle colonne recupero_* rifiutati. Box "📞 Contratti da
     richiamare" (rap-, tit-, seg-contratti-recupero): Chiama, Apri
     contratto, ✅ Rinnovato, ✖ Perso (chiudi_recupero_contratto, nota
     obbligatoria; titolare, segreteria, rappresentante dei suoi clienti).
     CONFERMATO da Toli (03/11): il venditore è il rappresentante del
     cliente; un cliente senza rappresentante lo riceve da titolare o
     segreteria con "👤 Assegna venditore" (assegna_rappresentante_cliente:
     diventa clienti.rappresentante_id, solo se vuoto). Righe in "Cosa tocca
     a me": rappresentante "Contratti disdetti da richiamare", titolare e
     segreteria "Contratti disdetti senza venditore". Il piano dei
     controlli NON cambia da solo. I contratti già non rinnovati diventano
     da richiamare quando si esegue il 58.
   - (3) Distinta RIBA segnata inviata per errore: si riporta in
     "preparata", ma la banca va avvisata per mail ("molto più difficile
     levarli"). PRONTO: sql/58 (riporta_presentazione_riba_preparata,
     titolare e segreteria, motivo obbligatorio, solo senza esiti; colonne
     riportata_preparata_*) + js/45 (bottone "↩️ Non è stata inviata",
     finestra m-riba-riporta con la spunta "la banca non ha la distinta,
     oppure le ho scritto per ritirarla").
   - (4) Fattura con la data dell'anno precedente: NO. PRONTO: js/44
     (data minima 1° gennaio nell'emissione e nella nota di credito,
     primoGiornoAnnoFattura) + sql/58 (trigger trg_fatture_data_anno_corrente
     su ogni emissione).
   - (5) Prezzi: la manutenzione ordinaria ha il prezzo del preventivo di
     QUEL cliente; le FORNITURE costano uguale a tutti. FATTO (js/42,
     nessun SQL): le righe del DDT prese dal catalogo (prodotto_id; il
     catalogo ha solo forniture) restano al prezzo del listino, non
     prendono più il prezzo del contratto ("🛒 fornitura: prezzo del
     listino"; nel buono "Forniture nel DDT n. ..."); il prezzo del
     contratto vale per le voci aggiunte con "Aggiungi una voce del
     contratto" e per le righe a mano. Nessun listino per cliente.
   - (6) Box "Controlli scaduti da ripianificare" nella dashboard del
     titolare: NO (già così). (7) Lavorazioni con nomi simili in Ore
     cantiere: restano separate (già così). (8) Noli: oltre al capo
     tecnico non li chiede NESSUNO (già così).
   - (9) Il rappresentante corregge i presidi previsti del contratto: SÌ.
     PRONTO: sql/58 (imposta_presidi_contratto, solo presidi_contratto di un
     contratto esistente; titolare, segreteria, capo tecnico, rappresentante
     dei suoi clienti) + js/54 (per il rappresentante nella scheda
     Periodicità solo i campi "N. previsti" sono attivi, bottone "💾 Salva
     presidi previsti"; prima salvava senza errore ma il database non
     scriveva nulla).
   sql/58 ESEGUITO in produzione il 03/11 (CONFERMATO DA TOLI, backup
   2026-11-03-pre58; controllo in regola). Provato su un Postgres di prova (backup pre57 + sql/57 + 58: emissione
   con data 2025 rifiutata e con oggi numerata, RIBA indietro con e senza
   motivo e contabile rifiutato, presidi di Giulio sì e di Debora e del
   commerciale no, disdetta → da richiamare → perso → rinnovato →
   recuperato, update diretto rifiutato, assegnazione venditore; rollback e
   riesecuzione) e nel browser di prova con risposte finte (box
   rappresentante e titolare a 390 px, Assegna venditore, Periodicità del
   rappresentante, bottone e finestra della distinta RIBA).

11. **Decisioni di Toli del 03/11/2026 (17:08, 17:13, 17:36-17:43 e prezzi delle 20:34)** — DECISIONI DI
   TOLI (valgono come conferma della SCELTA, non come "CONFERMATO DA
   TOLI" per eseguire SQL in produzione). Fonte:
   gestione-task/LEGGIMI-ERIKA.md; le task del pacchetto F13-F27 le
   applicano dove servono. Le decisioni delle 17:36-17:43 (E1-E12) e
   quelle delle 20:34 sui prezzi (G1-G2) sono in fondo a questo punto;
   le altre delle 20:34 (MD, C, O) nel punto 12.d e i default U1-U10 nel
   punto 12.f (F13.7).
   Ore 17:08:
   - T1 (n.1): Capo Operativo = ruolo capo_tecnico; capo_operativo non è
     un ruolo e non si crea (conferma la decisione del 26/10).
   - T2 (n.2): smistamento AUTOMATICO verso l'ingegnere con i blocchi del
     piano; supera "decide il rappresentante, solo avviso giallo" di F3.3
     e del punto 9.q (domanda 28).
   - T3 (n.3): le tre fasce di prezzo (grandi quantità / cliente con
     contratto / non cliente) valgono SOLO sui prodotti più venduti (voci
     ricorrenti delle fatture 2026: estintori per tipo, piantane,
     cartelli, registro, manichette, maniglioni...) e sulle vendite di
     sola fornitura. Lavori e manutenzioni seguono il preventivo o il
     contratto del cliente (come il punto 10, risposta 5).
   Ore 17:13:
   - D1 (n.1): contratti = si estende clienti_periodicita; nessuna
     tabella nuova, la tabella `contratti` non si usa.
   - D2 (n.2): schede: obbligatori SOLO i dati che servono a calcolare il
     preventivo; tutto il resto facoltativo.
   - D3 (n.3): ordini liberi e magazzino SI FANNO (supera il rinvio del
     punto 9.m); il magazzino è un modulo a parte (numeri sql riservati).
   - D4 (n.4): ordini ai subappaltatori, insieme agli ordini liberi.
   - D5 (n.5): stati della commessa: il gestionale SUGGERISCE il
     passaggio, una persona lo conferma (nessun cambio automatico).
   - D6 (n.6): commessa senza preventivo (urgenze, lavori già aperti):
     ammessa SOLO con sblocco del titolare (commesse.preventivo_id oggi è
     NOT NULL UNIQUE: va cambiato, modifica di schema).
   - D7 (n.7): la commessa nasce con l'anticipo pagato, come oggi
     (nessuna commessa "in attesa anticipo").
   - D8 (n.8): vendita senza scheda di lavoro: SÌ, solo per la sola
     fornitura.
   - D9 (n.9): corsi e documenti scaduti: BLOCCO per i corsi di legge
     (PLE/piattaforme, lavori in quota, spazi confinati, preposto) e per
     l'idoneità sanitaria; per il resto solo avviso.
   - D10 (n.10): solleciti: il gestionale prepara l'elenco, la segreteria
     conferma l'invio (niente invio automatico).
   - D11 (n.11): le fatture restano emesse dal gestionale, con export
     verso Aruba (vedi 9.a).
   - D12 (n.12): appuntamento prenotato dal portale: per ora NO (il
     cliente chiede, la segreteria fissa).
   - D13 (n.13): sostituti per ruolo: nessuno; il titolare cambia il
     ruolo all'utente e ha "Entra come" (conferma il punto 9, risposta
     22).
   - D14 (n.14): soglia 3.000 € del rappresentante: RESTA, fissa nel DB
     (trigger e policy di sql/10), non configurabile.
   - D15 (n.15): giornale di cantiere: lo compila il caposquadra dal
     telefono, il capo_tecnico conferma (supera "solo capo tecnico e
     titolare" di F8.4 quando la task relativa sarà fatta).
   - D16 (n.16): piano dei controlli dopo una disdetta: si ferma da solo
     alla data di fine del contratto (supera "il piano NON cambia da
     solo" del punto 10, risposta 2, quando la task relativa sarà fatta).
   Regola nuova del piano: ogni tabella nuova nasce con RLS, riga nella
   matrice dei permessi e trigger del registro (sezione SICUREZZA).
   Ore 17:36, con le correzioni delle 17:40 e 17:43 (DECISE, F13.7):
   - E1: documenti finali: il capo_tecnico controlla la completezza,
     l'ingegnere firma digitalmente (anche prima), la segreteria li
     CONSEGNA al cliente SOLO DOPO L'ULTIMO PAGAMENTO (saldo), salvo
     "accordo diverso" messo dal titolare con nota sul preventivo o sulla
     commessa. Ordine: raccolta → controllo → firma → fattura finale →
     saldo incassato → invio (F21.5-F21.9).
   - E2: agenti esterni = stesso ruolo rappresentante, vedono solo i
     loro clienti (nessun potere ridotto; conferma D1).
   - E3: margine di un gruppo di voci sotto il 20%: solo avviso giallo;
     il blocco è solo sul 29% del totale.
   - E4: ricarico sul COSTO TOTALE del preventivo o della commessa
     (merce + manodopera + trasporti + noli + tutto), a scaglioni
     progressivi a tranche (G1); pavimento: margine 29% DOPO la
     provvigione; sotto il pavimento e ogni eccezione solo con sblocco
     del titolare. Scaglioni in Impostazioni, li cambia solo il titolare.
     Il preventivo mostra costo totale, ricarico applicato e margine.
     Sostituisce il ricarico per riga di ricaricoFornituraDaCosto (F16.1).
   - E5: reverse charge (natura N6.x) da aggiungere alle fatture.
   - E6: varianti in cantiere = nuova revisione del preventivo da far
     firmare al cliente.
   - E7: anticipo non pagato: promemoria al rappresentante a 7 e 15
     giorni, avviso al titolare a 30 (e di nuovo a 60) giorni, nessun
     annullamento automatico.
   - E8: ordina ai fornitori SOLO Acquisti (ruolo commerciale): tolto al
     rappresentante (oggi js/27 e sql/30 glielo permettono); il titolare
     può sempre.
   - E9: contratto scaduto: interventi bloccati dopo 30 giorni di
     tolleranza, salvo sblocco del titolare.
   - E10: mandato agenti: nessuna esclusiva all'avvio, esclusiva dopo un
     anno nella zona con più fatturato, provvigione mensile maturata
     all'incasso.
   - E11: costo operaio 150 € per persona al giorno, costo azienda.
   - E12: provvigioni uguali per venditore interno (a partita IVA, ruolo
     rappresentante) ed esterno: 5% su straordinari e forniture, 10% sui
     contratti di manutenzione ordinaria; il 2,5% non esiste più. Il
     pavimento del 29% resta DOPO la provvigione.
   Ore 20:34, prezzi (DECISE, già gestite dal piano prezzi F16.1 e dal
   budget della squadra di F18.12):
   - G1: scaglioni PROGRESSIVI a tranche (come l'IRPEF) sul costo
     totale: 70% sui primi 2.000 €, 55% sulla parte 2.000-10.000, 45% su
     10.000-50.000, 41% oltre; il prezzo cresce sempre con il costo;
     pavimento 29% dopo la provvigione (5%/10%); eccezioni solo con
     sblocco del titolare.
   - G2: riserva imprevisti del 3% nel costo del preventivo, invisibile
     al cliente: è il budget consumabili e piccole spese della squadra
     (soglie di spesa dinamiche, C2 del punto 12.d).

12. **Magazzino e corse: domande aperte (F13.4, 04/11/2026)** — solo
   testo, nessun SQL. Prima del modulo Magazzino (fase 26) e delle corse
   al negozio (F18.12, fase 27) servono risposte scritte che il
   gestionale non può decidere. Fonti: gestione-task/LEGGIMI-ERIKA.md
   (decisioni delle 20:34 e "Ancora da verificare"),
   gestione-task/riferimenti/magazzino/corse-negozio.md e
   pagina-titolare.md, gestione-task/riferimenti/ultimi/proposta.md
   (magazzino/proposta-v2.md e giudizio*.md NON sono nel pacchetto).
   LE RISPOSTE, QUANDO ARRIVANO, SI SCRIVONO QUI sotto ogni domanda
   ("Risposta del GG/MM, da chi: ..."). Le leggono F20.13 (rifiuti:
   formulari e registro), F26.15 (elenco usati ritirati ed export) e
   F26.17 (valore del magazzino e fine anno). SENZA RISPOSTE quelle task
   NON si bloccano: usano i default prudenti qui sotto (MD7, MD8) e lo
   scrivono nel sito ("regola provvisoria, da verificare con ...").
   a) COMMERCIALISTA (rimanenze di fine anno). Default fino alla
      risposta: il gestionale calcola comunque (MD8, U7).
      - Rimanenze: il gestionale le calcola a quantità e valore. Va bene
        dividerle in 4 parti: MAGAZZINO (capannone, furgoni,
        laboratorio); LAVORI IN CORSO = materiale già nei cantieri delle
        commesse aperte e non ancora fatturato (al costo o a una
        percentuale di avanzamento?); BENI DI TERZI (materiale del
        cliente o in conto deposito: fuori dalle rimanenze, solo
        elenco?); NOLEGGI (estintori e attrezzature date a noleggio o di
        cortesia: beni durevoli da ammortizzare, non rimanenze?).
      - Formato dell'export di fine anno: Excel/CSV con articolo, codice,
        ubicazione, quantità, costo unitario e valore? Separato per le 4
        parti? Data e ora di taglio 31/12 alle 23:59 (inventario senza
        fermare il lavoro): va bene?
      - Metodo: COSTO MEDIO PONDERATO (decisione di Toli U7), fisso negli
        anni; l'anzianità si legge dagli strati di carico FIFO. Confermi
        il metodo e che va scritto nella nota integrativa?
      - Articoli fermi da più di 365 giorni: il gestionale li segnala
        "da valutare per svalutazione" con il valore; la decisione è del
        commercialista. Serve un'altra regola?
      Risposta: (in attesa)
   b) CONSULENTE AMBIENTALE (rifiuti). Default fino alla risposta (MD7):
      ritiro ogni 2 mesi o oltre 120 estintori (più prudente del limite
      di 3 mesi), avvisi a 50 e 70 giorni, responsabile Acquisti; nel
      sito la nota fissa "non sostituisce il registro di carico e scarico
      né i formulari RENTRI".
      - Chi è il PRODUTTORE del rifiuto della manutenzione fatta PRESSO
        IL CLIENTE (estintori, manichette sostituiti dal cliente): noi (art. 266 c. 4 D.Lgs.
        152/2006, rifiuto prodotto dall'attività di manutenzione) o il
        cliente?
      - RENTRI: siamo obbligati all'iscrizione? Da quando? Il FIR
        digitale sostituisce il formulario cartaceo e la 4ª copia?
      - ALBO GESTORI AMBIENTALI: per trasportare i nostri rifiuti sui
        furgoni dal cliente al capannone serve l'iscrizione (categoria 2-bis)?
      - DEPOSITO TEMPORANEO in capannone (art. 185-bis): frequenza e
        quantità massime, come va segnalata l'area, registro.
        Domanda precisa (F13.8): quale criterio scegliamo e scriviamo?
        Dalla lettura dell'art. 185-bis D.Lgs. 152/2006 (DA CONFERMARE):
        avvio a recupero o smaltimento almeno ogni 3 mesi qualunque sia
        la quantità, OPPURE al raggiungimento di 30 m³ (di cui al massimo
        10 m³ di pericolosi), e in ogni caso mai oltre UN ANNO. Con i
        nostri numeri (circa 36 estintori al mese, meno di 1 m³) il
        limite che conta è il tempo: va bene il trimestrale? Il default
        del gestionale (ogni 2 mesi o oltre 120 estintori, MD7) resta
        dentro? La scelta va scritta da qualche parte (registro, DVR)?
      - CODICI CER per: estintori a polvere, a CO2, a schiuma/acqua,
        manichette; e per i RIFIUTI DI CANTIERE: porte (anche REI),
        coppelle, cartongesso (che non passano dal capannone: ritiro
        diretto, F20.13). Pericolosi o no, e serve l'analisi?
      - ESTINTORI USATI ANCORA IN PRESSIONE: vanno svuotati prima del
        deposito? Area separata "in pressione"? Chi può farlo? (il
        gestionale chiede la spunta allo scarico).
      - Riepilogo delle domande nuove di F13.8 (decisioni di Toli delle
        20:34, MD7): frequenza del deposito temporaneo scelta (trimestrale
        o 30 m³, limite di un anno); produttore del rifiuto della
        manutenzione fatta PRESSO IL CLIENTE; estintori ancora in
        pressione; Albo per il trasporto sui furgoni; RENTRI; codici CER
        di estintori a polvere, CO2, schiuma e dei rifiuti di cantiere
        (porte, coppelle, cartongesso). Sono le domande qui sopra.
      Risposta: (in attesa)
      NOTA PER IL TITOLARE: I 345 ESTINTORI RITIRATI NEL 2026 (F13.8,
      verifica fuori dal gestionale, Acquisti + titolare, circa 30
      minuti, da fare subito). Fonte: gestione-task/riferimenti/ultimi/
      proposta.md (analisi di fatture.json: 1.520 documenti dal 02/01 al
      20/10/2026, 799 fatture di ACQUISTO e 721 di vendita). Nelle 799
      fatture di acquisto NON c'è nessuna fattura di uno smaltitore,
      mentre ai clienti sono state fatturate 76 righe "RITIRO" per 345
      estintori (3.572 €). Quindi i 345 estintori o sono ancora in
      capannone (oltre i limiti del deposito temporaneo, se il limite è
      di 3 mesi o di un anno) o li ha ritirati qualcuno senza fattura
      (per esempio il fornitore in cambio merce) e senza un formulario
      che conosciamo. Controllato anche nel backup del 04/11 (pre240,
      solo conteggi): tra i 36 fornitori in anagrafica nessuno è uno
      smaltitore; nessun DDT è intestato a uno smaltitore (i soli due DDT
      che parlano di ritiro, n. 26 del 16/10 "ritiro estintori" e n. 25
      del 29/09 "ritiro cassa" nelle note, sono intestati a un cliente); il registro presidi ha 67 estintori (4
      eliminati nel 2026, nessuno "sostituito"): il gestionale oggi NON
      traccia gli estintori ritirati, per questo la verifica è fuori.
      Da scoprire: 1) DOVE sono oggi (contarli in capannone e sui
      furgoni); 2) CHI li ha ritirati, quando e quanti per volta; 3) con
      QUALE FORMULARIO (FIR, 4ª copia tornata?) e con quale fattura o
      accordo (cambio merce?). Se sono ancora in capannone: ritiro
      straordinario con uno smaltitore autorizzato e domanda al
      consulente ambientale. Regola già decisa (MD3): gli estintori
      ritirati per smaltimento non tornano MAI in circolo (cortesia e
      noleggio solo da stock nostro).
      Risposta del __/__, da chi (Acquisti / titolare):
        - Dove sono: (in attesa)
        - Chi li ha ritirati: (in attesa)
        - Formulario / fattura: (in attesa)
        - Cosa si fa adesso: (in attesa)
      Letta dal titolare: (in attesa: data e "letta" qui o nel registro
      decisioni di gestione-task/LEGGIMI-ERIKA.md)
   c) RSPP (materiali pericolosi e capannone).
      - Il capannone (deposito di estintori, bombole CO2, schiume,
        vernici intumescenti) è attività soggetta ai controlli dei VV.F.
        (DPR 151/2011, allegato I: quali punti, es. 12 liquidi
        infiammabili, 70 depositi)? Serve la SCIA antincendio?
      - Cisternette IBC e fusti (schiumogeni, liquidi): servono bacini
        di contenimento? Dove e quanti?
      - Trasporto sui furgoni di estintori CARICHI (nuovi o di cortesia)
        e di estintori USATI: limiti di quantità (esenzioni ADR 1.1.3.6),
        dotazioni del furgone, formazione degli autisti.
      Risposta: (in attesa)
   d) DECISIONI DI TOLI DEL 03/11 ALLE 20:34 (DECISE, valgono come
      conferma della SCELTA, non come "CONFERMATO DA TOLI" per l'SQL in
      produzione; testo completo in gestione-task/LEGGIMI-ERIKA.md). Le
      altre delle 20:34 sono nel punto 11 (G1 scaglioni progressivi a
      tranche, G2 riserva imprevisti 3%: già gestiti dal piano prezzi) e
      i default U1-U10 nel punto f) qui sotto. Riepilogo (F13.7):
      MD2-MD5 e MD9 ok come scritti; C1, C2, C4, C5 ok come scritti;
      O5 e O6 superati (lettura AI nel primo rilascio, valori di stima
      come default nelle Regole).
      - MD1: nessuna assunzione.
        Part-time di capannone: non si usa. Referente del capannone =
        un tecnico di manutenzione di zona (7:45-8:05, 20 minuti ogni mattina) +
        Acquisti per i dati; il gestionale misura le ore di magazzino e
        avvisa il titolare oltre 12 h/settimana per 8 settimane di fila
        (solo informativo nelle prime 12 settimane dall'avvio; default
        U9). Il referente NON è un ruolo: è il responsabile scritto
        sull'ubicazione.
      - MD2: prezzi d'acquisto chiusi DAVVERO al capo tecnico (permessi
        del database, non solo il sito: supera il limite dichiarato di
        F6.1).
      - MD3: estintori ritirati per smaltimento MAI di nuovo in circolo;
        cortesia e noleggio solo da stock nostro.
      - MD4: rettifiche di giacenza: capannone fino a 50 € per articolo
        e 300 € al mese il capo tecnico; furgoni fino a 20 € per
        conteggio il capo tecnico; oltre, matricole, furti e smarrimenti
        il titolare.
      - MD5: minuteria (viti, siliconi, nastro) non a magazzino: a costo
        sulla commessa.
      - MD6: magazzino APERTO a tutti.
        Scaffali in area chiusa: non si usa. Cassone obbligatorio: non
        si usa. Ogni prelievo registrato
        ("📤 Prendo" dal telefono, sempre possibile, oppure cassone
        preparato dal referente + "Ritirato"), conteggi più frequenti
        sugli articoli A e a matricola, giacenza negativa e differenze
        per persona e ubicazione (default U9).
      - MD7: rifiuti e smaltimenti: responsabile Acquisti (commerciale),
        il referente prepara; ritiro ogni 2 mesi o oltre 120 estintori,
        avvisi a 50 e 70 giorni (default U6), costi collegati alle
        fatture dello smaltitore. Limiti da verificare col consulente
        ambientale (b).
      - MD8: rimanenze di fine anno calcolate dal gestionale (quantità e
        valore, costo medio ponderato, default U7) + cruscotto "soldi
        fermi" (valore immobilizzato, anzianità, rotazione, articoli
        fermi; avvisi default U8).
      - MD9: ordini di scorta oltre 2.000 € approvati dal titolare prima
        dell'invio.
      - MD10: porte di pronta consegna: 1 per misura 80/90/100/120 x 215
        RAL 9010; prenotazione sul preventivo per 15 giorni; le inserisce
        SOLO Acquisti con l'ordine di pronta consegna, chi riceve conferma
        l'arrivo (matricola e foto della targhetta) (default U10).
      - C1: carta aziendale per furgone di squadra: 200 € a corsa, 400 €
        a settimana (sopra 200 € tessera professionale su P.IVA o paga
        Acquisti); bloccata dopo 2 corse non autorizzate in un mese;
        niente rimborsi senza corsa registrata.
      - C2: soglie di spesa dinamiche: 0,5% dell'imponibile (min 50, max
        400 €), margine minimo 29% dopo la provvigione, tetto 1.500 €,
        manutenzione 15% (20-150 €), attesa minima 1 h; budget della
        squadra = riserva imprevisti 3% (G2) + consumabili del kit.
      - C3: ordine settimanale chiuso il lunedì alle 12:00, ma non sempre
        si ordina: scorte minime e punto di riordino per articolo (classi
        A/B/C, proposta d'ordine del lunedì, ricalcolo trimestrale;
        parametri default U5).
      - C4: corsa per causa del cliente: il costo va nella variante o nel
        lavoro extra e si paga solo se il cliente lo accetta.
      - C5: acquisti del weekend su P.IVA ammessi solo con la corsa
        registrata (anche del titolare).
      - C6 (deciso da Claude come chiesto da Toli): chi fa la corsa, in
        quest'ordine: consegna del fornitore → referente al mattino
        (richieste entro le 7:45) → tecnico in giro con deviazione sotto
        20 minuti → una sola persona della squadra, mai tutta
        (part-time per le corse: non si usa; default U10).
      - O1: Acquisti NON decide la conformità; scelta: conformità → data
        del cliente → costo completo → fornitore unico entro il minore
        tra 3% e 150 € → spareggio entro il minore tra 1% e 50 €; Acquisti
        conferma solo i numeri letti.
      - O2: il gestionale confronta DA SOLO le offerte: libreria articoli
        (marca + codice produttore), distinta di riferimento degli
        impianti (es. cavi mancanti stimati), controlli fissi dei numeri;
        classe superiore verde se stessa norma, posa e documento valido.
        O1 e O2 insieme: confronto e conformità AUTOMATICI (libreria +
        distinta), una persona conferma solo i numeri letti.
      - O3: ingegnere: 1 giorno lavorativo (4 ore se urgente), solo righe
        incerte, codici nuovi che vincono, varianti che convengono,
        prezzi sospetti.
      - O4: prezzo sospetto: 30% sotto la mediana delle altre offerte
        verdi (almeno 2) o dello storico di 12 mesi (almeno 3 dati).
      - O5: valori di stima predefiniti (materie prime +3%, trasporto =
        media del fornitore o 90 €, validità 30 giorni, scarico interno
        37,50 €, 30 € per ogni fornitore in più, tolleranza in fattura 1%
        o 20 €), modificabili nelle Regole.
      - O6: lettura automatica del PDF con AI nel PRIMO rilascio (serve
        per O1); ogni numero ricontrollato dal database; costo reale del
        servizio da verificare all'attivazione.
   e) VERIFICHE DI ACQUISTI (commerciale, circa 1 ora, prima delle task
      delle corse):
      - Würth: le 15 fatture con "Servizio espresso S24 Pisa" e
        "affrancatura" sono ritiri al banco o consegne?
      - Tecnomat Pisa (in fattura BRICOMAN ITALIA S.R.L.): c'è la tessera
        professionale su P.IVA con fattura mensile e un codice per
        persona? Si può ritirare un ordine fatto online?
      - Prezzo al banco e prezzo del fornitore su 5 articoli: schiuma
        EI240, Silcoflex, dischi 115, FFP2, viti per cartongesso.
      - Dichiarazioni di posa 2026 in cui è stata usata la schiuma
        comprata al banco: il prodotto ha la stessa certificazione (EI)
        di quello dichiarato? Se no, la dichiarazione va controllata.
      Risposta: (in attesa)
   f) DEFAULT U1-U10 (fonte: gestione-task/riferimenti/ultimi/proposta.md,
      sezione H; decisi da Toli alle 20:34 come default). Tutti "default,
      modificabili nelle Regole": le task li usano finché il titolare non
      li cambia nelle Regole.
      - U1 (default, modificabile nelle Regole): soglia di confidenza
        della lettura AI 0,85; oltre il 30% di righe incerte l'offerta
        torna ad Acquisti con "chiedi il modulo Excel".
      - U2 (default, modificabile nelle Regole): codici nuovi:
        l'ingegnere conferma con 1 clic solo quelli che vincono, prima
        dell'ordine; dopo 2 conferme non tornano più.
      - U3 (default, modificabile nelle Regole): offerta "incompleta":
        con stime oltre il 15% del costo completo non vince in
        automatico.
      - U4 (default, modificabile nelle Regole): tetto del costo AI 50 €
        al mese (oltre si inserisce a mano).
      - U5 (default, modificabile nelle Regole): scorte: classi 80/15/5;
        livello di servizio 95% (A) e 90% (B); costo di un ordine 25 €;
        costo di tenuta 20%/anno; lotto A al massimo 8 settimane, B 12;
        richieste oltre il 50% del trimestre "su commessa"; ricalcolo
        trimestrale (C3).
      - U6 (default, modificabile nelle Regole): rifiuti: responsabile
        Acquisti; ritiro ogni 2 mesi o oltre 120 estintori; avvisi a 50 e
        70 giorni (da confermare col consulente ambientale, b) (MD7).
      - U7 (default, modificabile nelle Regole): metodo delle rimanenze:
        costo medio ponderato, fisso negli anni, anzianità con gli strati
        di carico FIFO (MD8; da confermare col commercialista, a).
      - U8 (default, modificabile nelle Regole): avvisi "soldi fermi":
        articolo fermo da oltre 180 giorni con valore > 3.000 €; totale
        immobilizzato > 25.000 € o +20% in un mese.
      - U9 (default, modificabile nelle Regole): MD6 e MD1: magazzino
        aperto con "📤 Prendo"; referente = tecnico di zona 7:45-8:05;
        avviso al titolare oltre 12 h/settimana per 8 settimane
        (informativo nelle prime 12 settimane).
      - U10 (default, modificabile nelle Regole): C6 e MD10: ordine delle
        corse di C6; porte di pronta consegna inserite da Acquisti,
        arrivo confermato da chi riceve.

13. **Presidi: storico semestrale da Esegui intervento (richiesta di Erika
   del 04/11)** — FATTO nel sito (js/55-storico-esegui-intervento.js,
   js/07, js/20, js/25, guide info-tec-6, info-tec-15, info-ct-18);
   database: sql/255-storico-presidi-esegui-intervento (DA ESEGUIRE, con
   rollback e controllo; provato su Postgres con il backup pre240).
   Grafica delle schede (tutti i tipi sul modello degli estintori) e
   passo Presidi del tecnico: APPROVATI da Erika il 04/11 sulle immagini
   di prova.
   Decisioni di Erika:
   1. "Esegui intervento", passo Presidi: spuntando un presidio si aprono
      TUTTE le voci del controllo (ultima scheda dello storico, se no le
      voci del registro impianti.voci_x_*, se no CKL_PRESIDIO del tipo;
      manichette senza scheda: 5 voci proposte in VOCI_MANICHETTA_STORICO,
      da confermare da Toli), già impostate come l'ultima volta e
      cliccabili SI / NO / — ("✓ Tutti SI"); restano stato e note. Vale
      anche con l'audit (js/40, presidi "trovati") e dopo ✏️, + Aggiungi e
      🔁 Sostituito (le scelte restano in memoria). Alla chiusura
      (salvaInt, anche dopo l'audit) per ogni presidio spuntato nasce la
      scheda (schede_presidi; manichette in schede_manichette) nel SEMESTRE
      DELLA DATA DELL'INTERVENTO: 1° gennaio-giugno, 2° luglio-dicembre,
      mese 1/7 o 2/8 secondo il gruppo dell'ultima scheda, se no
      impianti.ciclo_manutenzione, se no gennaio_luglio (scelta
      dichiarata). La scheda copia i dati dell'ultima scheda e del
      registro, con data, prossima verifica, stato, note, voci e odl_id.
      Anche impianti.voci_x_* prende le voci dell'ultimo controllo. "Non ho
      potuto completare": nessuna scheda. Intervento senza presidi: come
      prima.
   2. Semestre già occupato (con qualunque gruppo): SI TIENE LA PRIMA; il
      messaggio finale dice quante schede sono nate e quante erano già
      presenti.
   3. Riporto dallo storico ("Riporta in una nuova verifica" in js/20, al
      posto di "Porta a ...", ed "Esegui nuovo controllo" di js/25):
      tecnico, capo tecnico, titolare (informatico = titolare); periodo =
      semestre della DATA DELLA VERIFICA (periodoDaDataVerifica, mostrato
      mentre si scrive la data; non più "successivo alla scheda di
      origine": un semestre vuoto si può riempire); data mai nel futuro.
      Tecnico: solo i presidi dei clienti che legge (cliente_visibile).
      Nomi dei gruppi: "Gruppo gennaio/luglio", "Gruppo febbraio/agosto"
      (prima "Gennaio – Giugno" e "Luglio – Dicembre", che si confondevano
      con i semestri).
   4. Grafica: apriSchedaPresidio (js/07) uguale per tutti i tipi, sul
      modello degli estintori: riquadri colorati in evidenza (estintore:
      mese manutenzione, prossima revisione, scadenza collaudo, ultima
      verifica; porte e uscite: ultima e prossima verifica, classe REI;
      manichetta: scadenza, ultima e prossima; idranti e naspi: più
      scadenza collaudo; altri: ultima e prossima), campi del tipo,
      controlli voce per voce (☒ SI / ☒ NO / ☐, con le voci standard se
      non c'è una verifica registrata), legenda e note.
   Senza sql/255: titolare e capo tecnico scrivono le schede direttamente
   (come oggi); il tecnico vede i controlli ma alla chiusura legge "Storico
   presidi non aggiornato ... sql/255" (oggi il tecnico non legge né
   scrive lo storico: le schede hanno tecnico_id vuoto). Con sql/255 la
   scheda nuova del tecnico è intestata a lui.
   Limite: in produzione ci sono schede vecchie messe nel "mese 2" con la
   verifica di settembre (regola di prima): restano dove sono; per quel
   semestre la nuova regola le trova come "1° semestre".
   Provato: SQL su Postgres (ruoli veri: tecnico Roberto, capo tecnico
   Luca, segreteria, informatico, anon; rollback identico e riesecuzione);
   sito in Chrome headless con risposte simulate (tecnico a 390 px con e
   senza sql/255 e con audit, capo tecnico a 1280 px senza sql/255,
   schede presidio e riporto).

