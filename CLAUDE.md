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

Dopo sql/69 (F14.14 assenze del personale, ESEGUITO il 05/11 con il -VINCOLO, backup pre69, richiede 07, 35, 47,
63; 67 facoltativo; poi il file -VINCOLO dall'editor): nessuna tabella
nuova. calendario_personale ha i tipi nuovi 'assenza' e 'assenza_tolta'
(vincolo calendario_personale_tipo_check cambiato da
69-assenze-personale-VINCOLO.sql), indice unico
calendario_personale_assenza_unica (una assenza per persona e giorno) e la
policy RESTRITTIVA calendario_personale_assenze_solo_rpc (for all: nessun
utente legge, scrive o toglie righe di assenza direttamente, nemmeno le
proprie; solo dalle RPC di sql/69). Le altre righe come prima.

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

Usate dal frontend — regole e soglie (F14.2, sql/62 ESEGUITO il 04/11, backup pre256, richiede 07,
20, 32, 58): regole (53 regole con valore predefinito; lettura per tutti
gli utenti attivi, scrittura solo con la RPC salva_regola del titolare;
4 righe "di catalogo" leggono le colonne di impostazioni che restano dove
sono: soglia_lavoro_grande, giorni_preavviso_rinnovo,
giorni_preavviso_documenti, tariffa_oraria_standard), regole_storico
(registro delle modifiche, sola lettura del titolare; lo scrivono
salva_regola e il trigger trg_impostazioni_registro_regole, che registra
anche i cambi fatti da "Soglie e tariffe"). La soglia 3.000 € del
rappresentante NON è una regola (D14).

Usate dal frontend — festività e controllo orario (F14.3, sql/63 ESEGUITO il 05/11, backup pre63, pg_cron attivo,
richiede 07 e 58, non 62): festivita (giorni non lavorativi oltre a sabato e
domenica: 24 date 2026-2027 con San Ranieri 17/6, tipo nazionale/patrono/
chiusura; lettura per tutti gli utenti attivi, scrittura solo con le RPC
del titolare), controllo_orario_esecuzioni (registro del controllo orario,
sola lettura del titolare, 90 giorni). Non usata dal sito:
controllo_orario_chiave (impronta della chiave dedicata di n8n, nessun
permesso).

Usate dal frontend — motore unico delle scadenze (F14.4, sql/64 ESEGUITO il 05/11, backup pre64,
richiede 07, 58, 62, 63, tutti in produzione): regole_scadenze (20 righe:
evento, oggetto, tempo da una regola di sql/62 o scritto nella riga,
destinatario per ruolo, risalita a chi e dopo quanto dalla scadenza o
dall'inizio, urgente, attiva, fonte; lettura per tutti gli utenti attivi,
scrittura solo con salva_regola_scadenza del titolare),
regole_scadenze_storico (registro, sola lettura del titolare), scadenze
(aperte e chiuse, mai cancellate; lettura del titolare e del destinatario;
le scrivono solo le funzioni di sql/64).
Dopo sql/65 (F14.5, ESEGUITO il 05/11, backup pre65, richiede 64): avvisi (avvisi persistenti;
sola lettura: titolare tutti, gli altri i propri, quelli del proprio ruolo
e quelli risaliti a loro come responsabili; li scrive solo il database,
js/58-avvisi.js).
Dopo sql/66 (F14.6, ESEGUITO il 05/11, backup pre66, richiede 65; configurazione esterna da fare): push_subscriptions
(dispositivi iscritti alle notifiche; lettura dei propri e del titolare
SENZA endpoint e chiavi, permessi per colonna; si scrive solo con
registra_dispositivo_push / togli_dispositivo_push), avvisi_invii
(registro degli invii: lettura titolare e propri; lo scrivono database e
Edge Function), avvisi_invio_impostazioni (una riga, lettura titolare;
imposta_invio_avvisi). js/59-notifiche-push.js, sw.js.
Dopo sql/67 (F14.11, ESEGUITO il 05/11, backup pre67 e -REGISTRO-CANCELLAZIONI dall'editor, richiede 07 e 58; poi il file
-REGISTRO-CANCELLAZIONI dall'editor): registro_azioni (registro generico
delle azioni, NON usata dal sito per ora; sola lettura del titolare e
dell'informatico; la scrive solo il trigger registra_azione; nessuno la
modifica o la cancella, nemmeno service_role e il proprietario).
Dopo sql/68 (F14.12, ESEGUITO il 05/11, backup pre68, e -REGISTRO-CANCELLAZIONI dall'editor, richiede 07, 47, 64, 65; 67 facoltativo;
poi il file -REGISTRO-CANCELLAZIONI dall'editor, che richiede 67):
motore_oggetti, motore_stati, motore_transizioni (configurazione del
motore unico di stati e azioni: lettura per tutti i ruoli, si scrivono
solo da un file sql/NN), motore_azioni_storico (registro delle azioni del
motore: lettura del titolare e di chi legge l'oggetto, lo scrive solo
esegui_azione), motore_oggetti_prova (oggetto di prova a 3 stati: lettura
per tutti i ruoli, nasce con crea_oggetto_prova_motore, cambia stato solo
con esegui_azione). js/61-motore-azioni.js.
Dopo sql/70 (F14.15, ESEGUITO il 05/11 con il -REGISTRO-CANCELLAZIONI, backup pre70, richiede 07, 47, 62, 63, 64, 65, 67; poi
il file -REGISTRO-CANCELLAZIONI dall'editor): domande (domande tra colleghi
su progetto tecnico, preventivo, commessa o richiesta al fornitore: da, a
persona o ruolo, testo, allegati jsonb, scadenza, risposta, chiusa;
lettura titolare tutte, gli altri quelle fatte da loro, a loro o al loro
ruolo; nasce SOLO con fai_domanda: chi chiede deve leggere il record
(RLS), l'insert diretto lo rifiuta il trigger, il resto lo scrive il
database; risposta, chiusura e allegati solo con le RPC, js/62). Bucket NUOVO domande-allegati (privato,
20 MB, <id domanda>/<file>; lo apre chi legge la domanda, caricano chi
chiede e chi deve rispondere finché non è chiusa).
Dopo sql/72 (F14.19 "Annulla" e richiesta di correzione, ESEGUITO il 06/11 con il -REGISTRO-CANCELLAZIONI, backup pre72, richiede 07, 47,
62-65, 67, 68, 71; poi il file -REGISTRO-CANCELLAZIONI dall'editor):
annullabili (oggetti con "Annulla"/"Chiedi correzione": funzione_info,
funzione_annulla, funzione_passo, responsabile_ruolo; lettura per tutti i
ruoli, si scrive solo da un file sql/NN; gli oggetti del motore valgono
anche senza riga), annullamenti (registro degli annullamenti e delle
richieste di correzione aperta → applicata | corretta | rifiutata |
ritirata; lettura titolare tutti, gli altri i propri e le correzioni al
loro ruolo responsabile; lo scrivono solo le RPC di sql/72; cancellazione
bloccata dal trigger del -REGISTRO-CANCELLAZIONI). js/64.
Dopo sql/73 (F14.20 deleghe del titolare, ESEGUITO il 06/11 con il -REGISTRO-CANCELLAZIONI, backup pre73 (provato il 06/11 sul
backup pre72, con e senza sql/72), richiede 07, 28, 33, 39, 63, 65, 67, 71; poi il
file -REGISTRO-CANCELLAZIONI dall'editor): deleghe_titolare (tipo, delegato
con nome e ruolo copiati, tetto in €, valida dal/fino al, nota, revoca; una
non revocata per tipo; lettura titolare tutte, il delegato le proprie),
assenze_titolare (dal, al, nota, tolta; lettura titolare e delegato generale
valido oggi), deleghe_registro (usi delle deleghe: decisione assegnata,
passata, chiusa, tornata, sblocco usato, oltre il tetto; lettura titolare
tutto, il delegato le proprie righe; cancellazione bloccata dal
-REGISTRO-CANCELLAZIONI); nessuna scrittura diretta, solo RPC; colonne nuove
avvisi.decisione_importo e avvisi.delega_id (le scrive solo il database).
js/65.
Dopo sql/74 (F14.21 riassegnazione delle pratiche, ESEGUITO il 06/11 con il -REGISTRO-CANCELLAZIONI, backup pre74 (provato il
06/11 sul backup pre73 + sql/73), richiede 07, 47, 67, 71; poi il file
-REGISTRO-CANCELLAZIONI dall'editor): riassegnazioni_pratiche (da chi, a
chi con nomi e ruoli copiati, tipi, motivo, conteggi, totale, rimaste, chi
e quando) e riassegnazioni_pratiche_righe (una riga per pratica spostata:
tipo, tabella, id, colonna, descrizione); sola lettura del titolare, le
scrive solo riassegna_pratiche, cancellazione bloccata dal
-REGISTRO-CANCELLAZIONI. js/10 (nessun file js nuovo).
Dopo sql/75 (F15.1 catalogo lavorazioni, ESEGUITO il 06/11 con il -REGISTRO-CANCELLAZIONI, backup pre75 (provato il 06/11 sul
backup pre74 + sql/74), richiede 07, 67, 71; poi il file
-REGISTRO-CANCELLAZIONI dall'editor): lavorazioni (codice = famiglia delle
schede, nome, famiglia, documento finale, descrizione, attiva, versione),
lavorazioni_campi (codice, etichetta, tipo numero/menu/si_no/testo/foto,
unità, valori ammessi, min/max plausibili, livello base/ingegnere,
normativo, obbligatorio, per posizione, uso a valle obbligatorio, ordine,
attivo), lavorazioni_documenti (foto, documenti, video obbligatori e
quanti), lavorazioni_checklist (punti di posa, foto di posa): lettura per
tutti gli utenti attivi, inserimento e modifica DIRETTI dal sito solo
titolare (informatico) e ingegnere, nessuna cancellazione (Togli = attivo
false), "attiva" la cambia solo il titolare (trigger); lavorazioni_registro
(chi, quando, prima/dopo; lettura titolare e ingegnere, lo scrive solo il
database, non si modifica né si cancella). js/55-catalogo-lavorazioni.js.
Dopo sql/76 (F15.2 tabella posizioni, ESEGUITO il 06/11 con il -REGISTRO-CANCELLAZIONI, backup pre76 (preparato e provato il
06/11 sul backup pre75 + sql/75), richiede 07, 48, 67, 71; poi il file
-REGISTRO-CANCELLAZIONI dall'editor): progetti_tecnici_posizioni (posizioni
P-xx dentro una scheda di rilievo: id fisso, progetto copiato dalla scheda,
scheda_id, numero e codice P-xx dati dal database per PROGETTO e mai
riusati, ubicazione, quantita, dati jsonb, foto jsonb = allegati del
progetto, duplicata_da, tolta con chi/quando, chi/quando; progetto, scheda,
numero e origine fissi). Lettura titolare e ingegnere tutte, rappresentante
e commerciale come la scheda (sottoquery sotto le RLS delle schede);
inserimento e modifica DIRETTI titolare, ingegnere e rappresentante sui
suoi progetti in bozza o da integrare; nessuna cancellazione (Togli =
tolta true); con il -REGISTRO-CANCELLAZIONI le posizioni seguono a cascata
la scheda (elimina_scheda_rilievo) e il progetto. js/66-posizioni.js.
Dopo sql/77 (F15.3 motore delle schede, 1a, ESEGUITO il 09/11 insieme al 78, backup pre77, richiede 07, 48,
71, 75; preparato e provato il 06/11 sul backup pre76 + sql/76): nessuna
tabella nuova. progetti_tecnici_schede: due policy NUOVE
progetti_tecnici_schede_inserimento_rappresentante e _modifica_rappresentante
(il rappresentante inserisce e modifica le schede dei SUOI progetti in bozza
o da integrare; le policy di prima non cambiano; nessuna cancellazione).
lavorazioni_campi: 9 campi della porte REI (stessi codici della scheda di
js/18) e obbligatori i 6 dati del prezzo (D2). js/56-motore-schede.js.
Dopo sql/78 (F15.4 motore delle schede, 1b, ESEGUITO il 09/11 subito dopo il 77, backup pre77,
richiede 07, 71, 75, 76, 77; provato il 09/11 sul backup pre76 + 76 + 77):
nessuna tabella nuova. lavorazioni_campi: colonna NUOVA serve_al_prezzo
(D2: solo questi obbligatori; vincolo lavorazioni_campi_prezzo_check
obbligatorio = serve_al_prezzo, trigger trg_lavorazioni_campi_prezzo li tiene
uguali). Trigger NUOVI trg_progetti_tecnici_schede_motore e
trg_progetti_tecnici_posizioni_motore (solo per il ruolo rappresentante, anche
"Entra come"): campi di livello ingegnere, copia del commerciale,
progetto/tipo/numero fissi, plausibilità.
Dopo sql/79 (F15.5 motore delle schede, parte 2: fonti, ESEGUITO il 09/11 (backup pre79, dal server MCP), richiede
07, 71, 75, 77, 78; provato il 09/11 sul backup pre77 + 77 + 78): nessuna
tabella nuova. progetti_tecnici: colonna NUOVA fonte_rilievo (vuota,
sopralluogo_toli, documenti_cliente, misure_dichiarate; vincolo
progetti_tecnici_fonte_rilievo_check; la scrivono rappresentante, ingegnere,
titolare) e trigger NUOVO trg_progetti_tecnici_fonti (chi scrive la fonte;
blocco dell'invio da bozza/da integrare). progetti_tecnici_schede: trigger
NUOVO trg_progetti_tecnici_schede_fonti (voci di dati.fonti_normative).
Registro delle azioni: quello di sql/67, già sulle due tabelle.
Dopo sql/80 (F15.6 migrazione schede: porte REI, estintori, rilevazione
incendi, ESEGUITO il 09/11 (backup pre80, dal server MCP), richiede 07, 71, 75, 77, 78; provato il 09/11 sul
backup pre79 + 79 + 80): nessuna tabella nuova, nessuna policy nuova.
lavorazioni_campi (dati): 8 campi nuovi degli estintori e 31 della
rilevazione incendi con codice = chiave di progetti_tecnici_schede.dati
(porte REI già completa con 75 + 77); ordine dei menu di sql/75 come la
scheda di js/18; obbligatori (serve_al_prezzo) estintori 4, rilevazione 4.
RPC NUOVA schede_migrate_motore() (elenco delle lavorazioni migrate; F15.7
la ridefinisce).
Dopo sql/81 (F15.7 migrazione schede: compartimentazione con le pareti in
cartongesso, vernice intumescente, coppelle, impianti di spegnimento, ESEGUITO
il 09/11 dall'editor SQL dopo la pubblicazione del sito (backup pre81), richiede 07, 71, 75,
77, 78, 80; provato il 09/11 sul backup pre80 + 80 + 81): nessuna tabella
nuova, nessuna policy nuova. lavorazioni_campi: vincolo
lavorazioni_campi_tipo_check rifatto con il tipo NUOVO 'elenco' (righe
ripetibili), ammesso SOLO per il codice pareti_cartongesso (che è sempre
elenco, mai per posizione); dati: 49 campi nuovi (compartimentazione 11,
vernice 13, coppelle 10, spegnimento 15) con codice = chiave di dati,
obbligatori 3/3/4/4. schede_migrate_motore() RIDEFINITA: le 7 lavorazioni.
Dopo sql/82 (F15.8 blocco comune e controlli di invio, ESEGUITO il 09/11 (backup pre82, dal server MCP, controllo in regola): backup,
anteprima, file (senza parole di cancellazione, server MCP), controllo; nessun
-REGISTRO-CANCELLAZIONI; richiede 07, 26, 34, 71, 75-79, tutti in produzione):
nessuna tabella nuova, nessuna policy nuova. lavorazioni (dati): 'comune'
ACCESA con 7 campi facoltativi (chi_decide, motivo_lavoro menu, motivo_documento,
entro_il data AAAA-MM-GG, entro_motivo menu, accessi, orari); la scheda comune
è una riga di progetti_tecnici_schede famiglia 'comune' numero 1. Trigger NUOVI
trg_progetti_tecnici_invio_completo (progetti_tecnici) e
trg_commesse_rilievo_comune (commesse, BEFORE INSERT).

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
Dopo sql/256 (a Google Ads solo i lead del sito, decisione della titolare
del 04/11, ESEGUITO il 04/11, backup pre256, richiede 61; chiesto come "sql/62", numero già
usato da F14.2): nessuna RPC del sito. ads_crm_export_v2: primo ramo
(ads_crm_nuovi_contatti, contatti dei rappresentanti) idoneo = false,
ramo lead_sito invariato; ads_crm_export_nuovi: "and false" (zero righe);
trigger ads_crm_registra_nuovo_contatto: procedura_consenso =
'nessuna_procedura_definita' (prima 'cartaceo_dichiarato_dal_titolare_v1',
procedura mai esistita). Righe esistenti non toccate. Provato sul backup
pre255: export nuovi 17 -> 2 (solo sito-), non sito 15 -> 0, qualificati
1 -> 0, export vecchio 13 -> 0; rollback identico.
Dopo sql/62 (F14.2 regole e soglie, ESEGUITO il 04/11, backup pre256, richiede 07, 20, 32, 58):
salva_regola (solo titolare/informatico: minimo, massimo, intero, vuoto;
registro), leggi_regola (valore per chiave, anche per trigger e RPC;
chiave sconosciuta = errore), regola_superata (la regola scatta? sopra o
sotto la soglia). Nel sito (js/01) la funzione unica leggiRegola('chiave')
(cache 5 minuti, caricata al login; leggiRegolaSubito dalla cache;
regolaSuperata gemella di regola_superata; REGOLE_PREDEFINITE = stessi
valori del file SQL: chi aggiunge una regola la mette nel suo sql/NN e lì).
Impostazioni > "📏 Regole: soglie e tempi" (js/10 mostraRegoleImpostazioni,
salvaRegoleImpostazioni, apriRegistroRegole, finestra m-registro-regole),
guida titolare info-tit-10. sogliaLavoroGrande (js/17) legge
leggiRegolaSubito('soglia_lavoro_grande') (smistamento T2). Prova:
sql/62-impostazioni-regole-soglie-PROVA.sql (solo database di prova, finisce
con rollback). Senza sql/62: predefiniti, riquadro in sola lettura "non
ancora attiva", nessun errore.
Dopo sql/63 (F14.3 festività, giorni lavorativi e controllo orario, ESEGUITO il 05/11 dall'editor (contiene delete), backup pre63, pg_cron attivo,
richiede 07 e 58; preparato e provato sul backup pre256 + sql/62 il 04/11):
salva_festivita, togli_festivita (solo titolare/informatico),
esegui_controllo_orario (dal sito solo il titolare, "▶️ Esegui ora");
giorno_lavorativo, giorni_lavorativi_tra(dal, al) (giorni lavorativi dopo
"dal" fino ad "al" compreso, negativo all'indietro), aggiungi_gg_lav(data,
n) (venerdì 4/12/2026 + 2 = mercoledì 9/12): STABLE e non immutable perché
leggono la tabella che il titolare cambia; per trigger e RPC dei moduli.
genera_avvisi_scadenza() = AGGANCIO (oggi restituisce 0), la ridefiniscono
F14.4 e F14.5. pg_cron (attivato dal file se disponibile: in produzione
oggi non c'è, su Supabase sì in tutti i piani) lancia ogni ora al minuto 0
esegui_controllo_orario('pg_cron') (lavoro toli_controllo_orario; esito in
controllo_orario_esecuzioni). Riserva se pg_cron non si attiva:
controllo_orario_n8n(chiave) per un workflow n8n orario con la chiave
pubblica (anon) + chiave dedicata (impronta sha256 impostata dall'editor
con imposta_chiave_controllo_orario; max una esecuzione ogni 10 minuti).
Nel sito (js/01) le gemelle giornoLavorativo, giorniLavorativiTra,
aggiungiGgLav (FESTIVITA_PREDEFINITE = stesse date del file SQL; tabella
letta al login con caricaFestivita, verificaFestivitaDisponibili;
confrontate con le funzioni SQL su 14.193 casi, nessuna differenza).
Impostazioni > "📅 Festività e giorni lavorativi" (js/56-festivita-giorni-
lavorativi.js: elenco per anno, aggiungi/correggi, togli, prova del
calcolo, ultime 5 esecuzioni del controllo orario), guida titolare
info-tit-11. Senza sql/63: festività predefinite, riquadro in sola lettura
"non ancora attivo", nessun errore.
Dopo sql/64 (F14.4 motore unico delle scadenze, ESEGUITO il 05/11, backup pre64,
richiede 07, 58, 62, 63; provato sul backup pre63 + sql/63 il 05/11):
salva_regola_scadenza (solo titolare/informatico; tempo e risalita
collegati a una regola passano da salva_regola, registro in
regole_scadenze_storico; le scadenze aperte si ricalcolano subito),
aggiorna_scadenze (rilegge le fonti e ricalcola, senza avvisi),
crea_scadenza_prova e chiudi_scadenza_prova (promemoria di prova, va a chi
lo crea), calcola_scadenza(inizio, valore, unità) (minuti, ore, giorni di
calendario; giorni_lav = stessa ora dopo n giorni lavorativi, virgola per
eccesso; ore_lav = dalle 08:00 alle 17:00 dei giorni lavorativi: scelta da
confermare). Interne (nessun permesso ai ruoli del sito): apri_scadenza e
chiudi_scadenza (per le RPC e i trigger dei moduli che passano al motore:
"ogni task aggiunge le sue scadenze come righe"), sincronizza_scadenze,
date_scadenza, tempi_regola_scadenza. genera_avvisi_scadenza RIDEFINITA:
apre/chiude dalle fonti, ricalcola, segna promemoria (scade_il passata) e
risalite (risale_il passata) e chiama crea_avviso_da_scadenza(id, tipo) se
esiste (aggancio per F14.5, tabella avvisi); restituisce quanti ne ha
segnati (lo vede il registro del controllo orario). Fonte collegata oggi:
solo "Integrazione chiesta al venditore" (progetti in da_integrare,
destinatario il rappresentante del progetto, risalita al titolare dopo
integrazione_avviso_titolare_gg dall'inizio); le altre 19 righe (proposta
di destinatari e risalite) sono "in attesa del modulo". Le fonti di js/46
restano come conteggio finché ogni modulo non passa al motore. Al primo
controllo i progetti già da integrare da tempo hanno subito promemoria e
risalita segnati. Nel sito Impostazioni > "⏳ Scadenze: chi avvisare e
quando" (js/57-motore-scadenze.js: righe con 💾 Salva per riga, registro
m-registro-scadenze, scadenze aperte, ↻ Ricalcola, ▶️ Esegui controllo ora,
🧪 promemoria di prova), guida titolare info-tit-12. Prova:
sql/64-motore-unico-scadenze-PROVA.sql (solo database di prova, finisce con
rollback). File senza parole di cancellazione (eseguibile dal server MCP);
il rollback contiene drop. Senza sql/64: riquadro "non ancora attivo",
nessun errore.
Dopo sql/65 (F14.5 avvisi e "Cosa tocca a me", ESEGUITO il 05/11, backup pre65, 17 avvisi arretrati creati,
richiede 64 (si ferma senza); provato sul backup pre63 + sql/63 + 64 il
05/11): tabella avvisi (tipo, destinatario utente o ruolo, rif_tabella e
rif_id, testo, scadenza, stato aperto/fatto/annullato, esito obbligatorio
per alcuni tipi, chiuso_da/_nome/_ruolo/_il, urgente, regola_propria,
scadenza_id, responsabile_ruolo e risalite; mai cancellati). RPC del sito:
miei_avvisi(p_tutti, p_chiusi) (security invoker, con il "perché": tuo,
ruolo, risalito_responsabile, risalito_titolare), segna_avviso_fatto(id,
esito), annulla_avviso(id, motivo) (solo titolare), crea_avviso_prova
(solo titolare: persona o ruolo, preventivo/commessa/progetto/cliente/
fornitore/fattura/intervento, scadenza entro un anno anche passata,
responsabile scelto, esito obbligatorio; max 20 aperte). Interne:
crea_avviso (unica strada, niente doppioni), crea_avviso_da_scadenza
(aggancio del motore: promemoria al destinatario, risalita al ruolo della
riga; regola propria = niente risalita generale), risali_avvisi,
responsabile_avviso (cantiere e Service = capo_tecnico; acquisti,
preventivi e progetti = commerciale; tecnico senza area = capo_tecnico;
altrimenti direttamente il titolare: SCELTA da confermare). Risalita
generale (solo senza regola propria, con scadenza): responsabile dopo 1 gg
lav., titolare dopo un altro. genera_avvisi_scadenza RIDEFINITA (corpo di
64 + risali_avvisi; rollback = versione di 64). Trigger nuovi:
trg_scadenze_chiudi_avvisi (scadenza chiusa → avvisi "fatto" da soli),
trg_commesse_avvisi_passo (nascita e cambio di stato della commessa →
chiude l'avviso del passo di prima e lo apre per chi fa il passo dopo:
rappresentante del cliente, capo_tecnico, segreteria; senza scadenza; un
errore resta WARNING, non blocca lo stato). SCADENZE ARRETRATE: alla fine
del file, una volta sola, avvisi per le scadenze aperte già segnate
(promemoria_il/risalita_il) dal controllo orario prima del 65 (indice
unico per scadenza e tipo). Nel sito (js/58): campanella 🔔 col numero in
#nav .nr (anche sul telefono; rossa con scaduti), finestra m-avvisi
(Apri il record con la rotta F14.1, azioni rapide AZIONI_RAPIDE_AVVISO:
passo commessa → "Stato e storico" di js/18, ✓ Fatto con esito
m-avviso-chiudi, ✖ Annulla del titolare, filtri tutti/chiusi, 🧪 Avviso
di prova m-avviso-prova con link e 📋 Copia), link #/avviso/<id> (wrapper
di apriRottaScheda: apre la scheda del record e la barra in fondo con ✓
Fatto), riga "🔔 Avvisi aperti" in "Cosa tocca a me" per tutti i ruoli
(js/46, priorità 1), avviaAvvisi chiamata da boot (js/01). Guide: info-
tit-13, seg-17, con-9, ct-19, tec-16, com-14, rap-19, ing-12. File senza
parole di cancellazione (eseguibile dal server MCP); il rollback contiene
drop. Senza sql/65: niente campanella né riga, link #/avviso "non ancora
attivi", nessun errore.
Dopo sql/66 (F14.6 avvisi urgenti immediati, ESEGUITO il 05/11 (backup pre66, pg_net attivo); mancano Edge Function, segreti e imposta_configurazione_push. DECISIONE DI ERIKA del 05/11: SOLO notifiche, niente email (niente Brevo): email_urgenti_attiva e riepilogo_attivo a false; configurazione con gestione-task/configura-notifiche.sh (fuori da git)
e backup, richiede 65 (si ferma senza), 07, 58, 63; provato sul backup
pre65 + sql/65 il 05/11): un avviso con avvisi.urgente = true arriva entro
un minuto come NOTIFICA (Web Push) e per EMAIL (Brevo); gli altri restano
nella campanella e nel RIEPILOGO per email delle 8:00 (giorni lavorativi).
Catena: trigger trg_avvisi_invio_urgente (after insert or update of
urgente; mai bloccante) → chiama_funzione_avvisi (pg_net, estensione
attivata dal file se può) → Edge Function supabase/functions/avvisi-
urgenti (Deno, npm:web-push; deploy --no-verify-jwt, header
x-toli-segreto) → dati_invio_avviso_urgente (destinatario o persone del
ruolo, per il ruolo titolare anche l'informatico, + titolare se
"urgenti anche al titolare") → registra_invio_avviso (esito in
avvisi_invii; dispositivo 404/410 o 5 errori → spento). Riepilogo: pg_cron
toli_riepilogo_avvisi ogni ora → avvia_riepilogo_avvisi (ora italiana =
ora_riepilogo, giorno_lavorativo, una volta al giorno) →
dati_riepilogo_avvisi (avvisi aperti come miei_avvisi). SEGRETI: indirizzo
della funzione e chiave condivisa SOLO nel Vault (toli_push_url,
toli_push_segreto: imposta_configurazione_push dall'editor SQL); chiavi
VAPID private, Brevo e SITO_URL nei segreti della funzione; la chiave
PUBBLICA VAPID in avvisi_invio_impostazioni. Istruzioni e costi (0 €):
supabase/functions/avvisi-urgenti/LEGGIMI.md. RPC del sito:
configurazione_push (attivo + chiave pubblica; al titolare impostazioni e
diagnostica, mai i segreti), registra_dispositivo_push,
togli_dispositivo_push, stato_dispositivo_push, imposta_invio_avvisi,
crea_avviso_prova_urgente, prova_riepilogo_avvisi (titolare). Solo
service_role: dati_invio_avviso_urgente, dati_riepilogo_avvisi,
registra_invio_avviso. Interne: segreto_invio_avvisi,
imposta_configurazione_push, chiama_funzione_avvisi,
avvia_riepilogo_avvisi. Nel sito (js/59): senza sql/66 o senza
configurazione NULLA (niente service worker, niente permesso); con:
service worker sw.js (solo push e notificationclick, nessuna cache;
registraServiceWorker in js/01), invito al primo accesso (iPhone senza
app: "Installa l'app"; altri: "Attiva le notifiche" / "Non ora" 7
giorni), riquadro "📱 Notifiche" in cima alla finestra Avvisi (Attiva /
Spegni; titolare: ⚙️ Impostazioni degli invii, 🚨 Avviso urgente di prova
a me, ✉️ Riepilogo di prova a me), spunta "🚨 Urgente" nell'avviso di
prova (js/58 creaAvvisoProva), "Esci" scollega il dispositivo (doLogout
js/01), rientrando si ricollega da solo per chi l'aveva attivato. Guide:
info-tit-14, seg-18, con-10, ct-20, tec-17, com-15, rap-20, ing-13.
Provato: SQL e rollback sul backup pre65; Edge Function in Deno con
Supabase, Brevo e servizio push simulati; catena completa con FCM vero
(Chrome headless: notifica mostrata ~1 s dopo l'avviso). File senza parole
di cancellazione; il rollback contiene drop.
Dopo sql/67 (F14.11 funzioni ruolo e registro azioni, ESEGUITO il 05/11, backup pre67, richiede
07 e 58; provato sul backup pre66 + sql/66): nessuna RPC chiamata dal sito.
Funzioni nuove (execute per authenticated, pronte per "Entra come" di
F14.17-18; con sql/71 ridefinite, vedi "Entra come" parte 2): ruolo_reale() (= ruolo_corrente(), nessuna copia della regola),
agito_come_intestazione() (intestazione HTTP x-agito-come da
current_setting('request.headers')), ruolo_effettivo() (senza intestazione =
ruolo reale; con l'intestazione, SOLO se il ruolo reale è titolare, il
ruolo impersonato: codice di utenti.ruolo oppure id di un utente attivo;
per gli altri errore 42501 "Solo il titolare può agire come un altro
ruolo"), agito_come_utente(). Le ~60 policy usano ANCORA ruolo_corrente()
(passaggio a ruolo_effettivo in F14.18). Tabella registro_azioni (tabella,
record_id = id della riga come testo, azione inserimento/modifica/
cancellazione, campo, prima, dopo jsonb, utente_reale con nome e ruolo
copiati, agito_come_ruolo, agito_come_utente, quando; nessuna chiave verso
utenti). Trigger generico trg_registro_azioni (AFTER, funzione
registra_azione(), argomenti = colonne in più da non registrare;
aggiornato_il e updated_at mai) su progetti_tecnici,
progetti_tecnici_schede, preventivi, preventivi_voci, preventivi_fornitori,
impostazioni, utenti: una modifica = una riga per campo cambiato, nessuna
riga se non cambia niente; con x-agito-come di un non titolare il
salvataggio si ferma. Non cancellabile: nessun permesso di scrittura per
anon, authenticated, service_role (DELETE dal sito = "permission denied"),
trigger trg_registro_azioni_immutabile su update. LIMITE (server MCP): il
file principale registra solo inserimenti e modifiche; le CANCELLAZIONI
(trigger anche "after delete" sulle 7 tabelle, blocco delle cancellazioni
e del truncate sul registro anche per il proprietario) sono in
sql/67-funzioni-ruolo-registro-azioni-REGISTRO-CANCELLAZIONI.sql, che
Erika esegue dall'editor SQL subito dopo il 67. Nessuna pagina del sito
legge il registro (guida titolare info-tit-16: lo legge Erika dal
database). Provato su Postgres locale e con PostgREST (curl con
x-agito-come: tecnico rifiutato, titolare come segreteria registrato),
rollback identico allo schema di prima, smoke test con 67 eseguito.
test/locale/avvia-db-locale.sh esegue NN-nome.sql prima dei suoi
NN-nome-SUFFISSO.sql.
Dopo sql/68 (F14.12 motore unico di stati e azioni, ESEGUITO il 05/11, backup pre68, richiede
07, 47, 64, 65, si ferma senza; sql/67 facoltativo; provato sul backup
pre66 + 66 + 67 e senza 67): SOLO PER GLI OGGETTI NUOVI (POS, documenti
finali, eventi di sicurezza, fermi...); le RPC di stato esistenti
(cambia_stato_commessa, preventivi, ordini, richieste, fatture, RIBA,
contratti, appuntamenti) NON si toccano e non cambiano comportamento.
Tabella delle transizioni motore_transizioni: oggetto (= tabella in
public con colonna id), azione ed etichetta del pulsante, stato_da (vuoto =
nascita) → stato_a, ruoli_ammessi (il titolare solo se scritto), controlli
(funzioni controllo_azione_*(oggetto, id, dati) → testo = blocco),
motivo_obbligatorio, avvisi (jsonb: "ruolo:<codice>" o "campo:<colonna
uuid>" con ruolo di riserva, testo con {oggetto} {azione} {da} {a}
{motivo} {chi}, tipo azione_*, entro_valore/entro_unita = scadenza
dell'avviso con la risalita generale di sql/65, esito_obbligatorio,
urgente), chiudi_avvisi (gli avvisi azione_* aperti del record si chiudono
"fatto" a ogni passaggio), scadenze_apri/scadenze_chiudi (righe di
regole_scadenze, apri_/chiudi_scadenza di sql/64), funzione_dopo
(azione_dopo_*), conferma, attiva; controlli di coerenza nei trigger
trg_motore_oggetti_valida e trg_motore_transizioni_valida. RPC del sito:
esegui_azione(p_oggetto, p_id, p_azione, p_motivo, p_dati) (riga bloccata,
transizione per stato attuale, ruolo con motore_ruolo_attuale() =
ruolo_effettivo() di sql/67 se c'è altrimenti ruolo_corrente(), accesso
con la funzione_accesso dell'oggetto, motivo, dati, controlli; cambia lo
stato; chiude gli avvisi del passo di prima, crea gli avvisi con
crea_avviso, apre e chiude le scadenze; scrive motore_azioni_storico con
ruolo vero, ruolo usato e utente impersonato; tutto o niente; errori 42501
ruolo, 22023 stato/motivo/controllo, P0002 sconosciuto),
azioni_disponibili(p_oggetto, p_id) (security invoker: stato e azioni del
ruolo), crea_oggetto_prova_motore(p_titolo, p_descrizione) (solo
titolare, max 20 non approvati), motore_ruolo_attuale(),
motore_record_leggibile(oggetto, id) (usata dalla policy del registro).
Interne: motore_nascita (per le RPC di creazione dei moduli, dopo
l'insert), motore_applica, motore_controlla, motore_leggi_riga,
motore_testo_avviso, controllo_azione_descrizione_compilata. Trigger
generico motore_blocca_stato_diretto('<colonna>') (BEFORE UPDATE: lo stato
cambia solo dentro esegui_azione, anche per il proprietario). Con sql/67
già eseguito il file aggancia trg_registro_azioni alle 4 tabelle con id
(motore_oggetti, motore_stati, motore_transizioni, motore_oggetti_prova);
il file -REGISTRO-CANCELLAZIONI (editor SQL, richiede 67, anche se il 67
arriva dopo il 68) li rifà con le cancellazioni e blocca le cancellazioni
di motore_azioni_storico. OGGETTO DI PROVA (3 stati): Bozza → In verifica
→ Approvato; crea titolare (avviso alla segreteria), "📤 Invia in
verifica" titolare e segreteria (avviso al capo tecnico entro 1 gg lav.),
"✅ Approva" titolare e capo tecnico (controllo descrizione compilata,
avviso a chi l'ha creato), "↩️ Chiedi una correzione" titolare e capo
tecnico con motivo (torna in Bozza, avviso alla segreteria), "🔓 Riapri"
solo titolare con motivo; avvisi con prova = true. Nel sito (js/61):
azioniDisponibili(oggetto, ruolo, stato) dalla stessa tabella,
htmlPulsantiAzioni (solo i pulsanti del ruolo), apriAzioneMotore
(finestra m-azione-motore, id azm-: motivo obbligatorio o conferma),
eseguiAzioneMotore (RPC), registraDopoAzioneMotore(oggetto, fn),
apriOggettoMotore (finestra m-oggetto-motore, id ogm-: stato, percorso
degli stati, pulsanti, chi fa le altre azioni, registro); azione rapida
"⚙️ Apri e agisci" degli avvisi azione_* (registraAzioneRapidaAvviso di
js/58); Impostazioni > "⚙️ Stati e azioni" (si-motore-card, solo
titolare, chiamata da loadImp di js/10): tabella delle transizioni in
sola lettura e "🧪 Oggetti di prova" (mop-). Guide: info-tit-17, seg-19,
con-11, ct-21, tec-18, com-16, rap-21, ing-14. Prova:
sql/68-motore-unico-stati-azioni-PROVA.sql (solo database di prova,
rollback). File senza parole di cancellazione (eseguibile dal server
MCP); rollback (drop, chiude gli avvisi e le scadenze aperte degli
oggetti del motore) identico allo schema di prima. Senza sql/68: riquadro
"non ancora attivo", nessun pulsante, nessun errore (smoke test TUTTO OK
con e senza 68). Un modulo nuovo: righe di motore_oggetti, motore_stati,
motore_transizioni nel suo sql/NN, trigger motore_blocca_stato_diretto
sulla sua tabella, RPC di creazione che chiama motore_nascita,
htmlPulsantiAzioni nella sua scheda.
Dopo sql/69 (F14.14 assenze del personale, ESEGUITO il 05/11 con il -VINCOLO, backup pre69, richiede 07, 35, 47,
63, si ferma senza; sql/67 facoltativo; provato sul backup pre68 + sql/68 e
il suo -REGISTRO-CANCELLAZIONI). Decisione di Toli D13: NIENTE sostituti
per ruolo. ORDINE: backup, 69-assenze-personale.sql (senza parole di
cancellazione, eseguibile dal server MCP), poi
69-assenze-personale-VINCOLO.sql dall'EDITOR SQL (toglie e rimette il
vincolo del tipo con 'assenza' e 'assenza_tolta': contiene drop), poi il
controllo in fondo al 69. RPC del sito: assenze_personale_attive() (vero
solo con il vincolo nuovo: senza, il sito non mostra nulla),
segna_assenza_personale(utente, dal, al, ora_inizio, ora_fine, nota,
solo_lavorativi) e togli_assenza_personale(utente, dal, al) (SOLO titolare
e capo_tecnico, per tecnici e capi tecnici attivi, max 93 giorni, giorni
passati solo il titolare, giorni lavorativi con giorno_lavorativo di
sql/63; togliere = la riga diventa 'assenza_tolta' con "tolta da", niente
cancellazioni), assenze_personale(dal, al) (titolare, capo_tecnico,
segreteria; nota e "segnata da" solo ai primi due),
interventi_tecnici_assenti(dal, al) (titolare, capo_tecnico, segreteria:
interventi non completati né annullati di un tecnico assente quel giorno,
con cliente, referente, telefono, mail, sede, ora dell'appuntamento
fissato; con un'assenza di poche ore conta se l'ora non è nota o cade
dentro). Ridefinite (stessa firma e permessi, rollback = sql/35 e sql/11):
impegni_squadra_periodo (tipo 'assenza', testo "Assente (tutto il
giorno)" o "Assente 08:00-12:00"; le altre righe "Impegno personale" come
prima) e impegni_tecnici_dashboard (per il rappresentante anche le
assenze come fascia "Assente ..."). Registro delle azioni: trigger
trg_registro_azioni su calendario_personale SOLO per le righe di assenza
(when), se c'è sql/67. Nel sito (js/05, nessun file js nuovo): finestra
m-assenza-personale (id asz-: persona, dal, al, solo giorni lavorativi,
tutto il giorno o dalle/alle, nota senza dati sanitari; "Togli
l'assenza"), bottone "🚫 Segna assenza" e riquadro rosso "🚫 Assente" nel
Calendari team (capo tecnico; corrette nello stesso giro le date del
calendario team, che con toISOString finivano sul giorno prima), box
"🚫 Assenze e interventi da riassegnare" (ct-assenze, tit-assenze: chi
manca oggi e nei 6 giorni dopo, "Riassegna" = openEditOdl) e "📞 Clienti
da avvisare: tecnico assente" (seg-assenze: testo fisso, Chiama, Mail,
Copia il testo, "✓ Avvisato" in localStorage come js/50),
caricaAssenzePersonaleDashboard chiamata da js/03; js/33 mostra
l'assenza in rosso nella squadra del giorno. "Cosa tocca a me" (js/46):
capo tecnico e titolare "Interventi di oggi del tecnico assente" (rossa,
"da riassegnare entro le 9:00"), segreteria "Clienti da avvisare: tecnico
assente oggi". Guide: info-ct-22, info-tit-18, info-seg-20. Senza sql/69
(o senza il -VINCOLO) nessun box, bottone o riga, nessun errore (smoke
test TUTTO OK con sql/69). Rollback: toglie funzioni, policy, indice,
trigger, le righe di assenza e rimette il vincolo di prima (schema
identico a prima, provato).
Dopo sql/70 (F14.15 domande nel gestionale, ESEGUITO il 05/11 con il -REGISTRO-CANCELLAZIONI, backup pre70, richiede 07, 47,
62, 63, 64, 65, 67, si ferma senza; poi
70-domande-nel-gestionale-REGISTRO-CANCELLAZIONI.sql dall'editor; provato
sul backup pre69 + sql/69 e -VINCOLO il 05/11): tabella domande (vedi
"Tabelle Supabase"). RPC del sito: fai_domanda(p_rif_tabella, p_rif_id,
p_testo, p_a_id, p_a_ruolo) (SECURITY INVOKER: insert sotto RLS, policy
domande_inserimento con domanda_record_leggibile(tabella, id), invoker;
mette il segno di transazione toli.fai_domanda, senza il quale
trg_domande_prima rifiuta l'insert: niente insert diretto dal sito),
rispondi_domanda(id, risposta) (la persona scelta, chiunque del ruolo se
è al ruolo, il titolare; mai chi ha chiesto), chiudi_domanda(id, nota)
(chi ha chiesto o il titolare; da aperta = ritirata),
aggiungi_allegato_domanda(id, nome, percorso). Interne: trg_domande_prima
(chi, nomi, ruolo, regola, scadenza), trg_domande_dopo (apri_scadenza con
oggetto 'domande' e promemoria già segnato + avviso 'domanda' al
destinatario con regola propria), trg_avvisi_rif_domanda (BEFORE INSERT su
avvisi: rif 'domande' → progetto/preventivo/commessa della domanda, così
"Apri" funziona anche per la risalita del motore), testo_domanda,
chiudi_avviso_domanda, puo_rispondere_domanda. SCADENZA dalle righe del
motore (sql/64): commerciale → ingegnere risposta_ingegnere_acquisti (1 g
lav.), capo_tecnico → rappresentante domande_capo_tecnico (1), altri →
rappresentante domanda_integrazione_venditore (NUOVA, regola
integrazione_venditore_gg, 2), le altre domanda_generica (NUOVA, 1 g lav.
nella riga; destinatario "titolare" solo perché obbligatorio); domande al
o del titolare: scadenza indicativa, nessuna risalita. SCELTA da
confermare: risalita al titolare APPENA SCADE (0 giorni lav. dalla
scadenza) nelle 4 righe; le due di sql/64 (prima 1 giorno dopo) le cambia
il file solo se ancora com'erano, con riga in regole_scadenze_storico.
Con la risposta la scadenza si chiude (i suoi avvisi, risalita compresa,
si chiudono da soli) e chi ha chiesto riceve l'avviso 'domanda_risposta';
chiudendo la domanda si chiudono tutti i suoi avvisi. Nel sito (js/62):
riquadro "❓ Domande" in progetto-detail (pd-domande, js/17), preventivo-
detail (pvd-domande, js/18), commessa-detail (cmd-domande, js/26) con
"❓ Fai una domanda" (finestra m-domanda, id dmn-: a chi persona o
"Chiunque" di un ruolo, proposto per ruolo e record, tempo di risposta
dalle Regole, allegati max 20 MB), "💬 Rispondi" (m-domanda-risposta,
dmr-), "✓ Chiudi" / "↩️ Ritira la domanda"; finestra "❓ Domande per me"
(m-domande-elenco, dme-: da rispondere, per il titolare le scadute di
altri, risposte alle mie); riga "❓ Domande per me" in "Cosa tocca a me"
per tutti i ruoli (js/46, priorità 2, rossa con scadute); tipi di avviso
❓ domanda e 💬 domanda_risposta con l'azione rapida che apre l'elenco
(js/58). Guide: info-tit-19, seg-21, con-12, ct-23, tec-19, com-17,
rap-22, ing-15. Corretto dopo il controllo: puo_rispondere_domanda,
rispondi_domanda, chiudi_domanda e aggiungi_allegato_domanda con coalesce
(con a_id vuoto il confronto dava NULL e chiunque rispondeva a una domanda
fatta a un ruolo). Prova: sql/70-domande-nel-gestionale-PROVA.sql (solo
database di prova, rollback: ruolo diverso e chi non legge la domanda
rifiutati, insert e update diretti rifiutati, risalita al titolare,
persona scelta contro un altro dello stesso ruolo, titolare). Matrice: 10 righe di domande (sql/matrice-permessi.sh
TUTTO OK). File principale senza parole di cancellazione (server MCP);
rollback (dall'editor: domande, funzioni, trigger, regole dei file e
bucket se vuoto; avvisi delle domande chiusi "annullato", non tolti;
scadenze e righe nuove del motore tolte; le due righe di sql/64 tornano a
1 giorno) provato: schema identico a prima. Senza sql/70 nessun riquadro,
nessuna riga, nessun errore (smoke test TUTTO OK con e senza sql/70).
Dopo sql/71 (F14.18 "Entra come" parte 2, ESEGUITO il 06/11, backup pre71, richiede 07, 47,
67): nessuna tabella nuova; nessuna RPC nuova (il banner chiama ruolo_corrente);
funzioni nuove utente_effettivo, agito_come_risolto; ridefinite
ruolo_corrente, ruolo_reale, ruolo_effettivo, agito_come_utente,
agito_come_intestazione, get_mio_utente_id, registra_azione, motore_applica
e, con auth.uid() → utente_effettivo(), 121 funzioni e 69 policy (dettagli
in "Entra come", parte 2, più sotto).
Dopo sql/72 (F14.19 "Annulla" e richiesta di correzione per tutti, ESEGUITO il 06/11
con il -REGISTRO-CANCELLAZIONI, backup pre72, controllo in regola, richiede 07, 47, 62,
63, 64, 65, 67, 68, 71 (si ferma senza); poi
72-annulla-richiesta-correzione-tutti-REGISTRO-CANCELLAZIONI.sql dall'editor;
provato sul backup pre71 + sql/71 il 06/11). Chi ha fatto un'azione la
ANNULLA da solo finché il passo successivo non è partito e comunque entro
annulla_entro_ore (regola NUOVA, 24 ore); dopo, "Chiedi correzione" al
responsabile con motivo (avviso 'correzione_richiesta' al ruolo, scadenza
correzione_risposta_gg = regola NUOVA, 1 g lav., poi risale al titolare
con la risalita generale di sql/65). RPC del sito:
annullamenti_possibili(oggetto, ids[]) (modo annulla con "entro" /
correzione con il perché / in_attesa, solo sulle azioni di chi chiama),
annulla_azione(oggetto, id, motivo facoltativo), chiedi_correzione(oggetto,
id, motivo), rispondi_correzione(id, 'applica'|'corretta'|'rifiutata',
esito) (ruolo responsabile, non chi ha chiesto, o titolare; l'autore riceve
'correzione_esito'), ritira_correzione(id, nota). Interne: annullabile_config,
responsabile_correzione (quello dell'oggetto, se no responsabile_avviso;
stesso ruolo o nessuno = titolare), annulla_leggi_riga, annullamento_stato,
adattatori annullabile_avvisi / annulla_azione_avvisi (avviso segnato fatto
A MANO: torna aperto; passo successivo = scadenza collegata chiusa o avviso
nuovo uguale aperto; chiusi da soli = nessun pulsante), annullabile_motore /
annulla_azione_motore (TUTTI gli oggetti del motore di sql/68: l'ultima
azione, stato di prima con il segno toli.motore_azione, avvisi mandati
annullati, chiusi riaperti, scadenze invertite, riga "↩️ Annulla «...»" in
motore_azioni_storico; la nascita non si annulla, passo successivo =
un'altra azione), annullabile_esito_presidio (schede_presidi,
schede_manichette) e annullabile_giornale (commesse_giornale): SOLO
correzione al capo tecnico (annullarli sarebbe una cancellazione).
SCELTE DA CONFERMARE: il titolare annulla le sue azioni anche dopo 24 h
(mai col passo partito) e non chiede correzioni; le RPC e gli
annullamenti di prima (pagamento, RIBA, sollecito, ordine, richieste,
lavori extra, documento team) e i loro stati NON si toccano; le domande
hanno già "Ritira la domanda". Persona = utente_effettivo() (con "Entra
come" la persona impersonata, utente_reale = il titolare). Ogni task
successivo che crea un'azione: oggetto del motore = niente da fare; se no
una riga in annullabili con annullabile_* e annulla_azione_* (e
passo_successivo_* se il passo dopo è altrove) nel suo sql/NN. Nel sito
(js/64-annulla-correzione.js): segnapostoAnnulla(oggetto, id) +
riempiPulsantiAnnulla(contenitore) (una RPC per oggetto), finestra
m-annulla (anl-: motivo facoltativo per Annulla, obbligatorio per la
correzione, a chi va), m-correzione (crz-: ↩️ Annulla l'azione per lui,
✓ Corretta a mano, ✖ Non serve, Ritira), registraDopoAnnulla; tipi di
avviso ✏️ correzione_richiesta (senza "✓ Fatto": si chiude dalla
richiesta) e ↩️ correzione_esito con azioni rapide (anche sui chiusi:
anche_chiuso). Pulsanti in: finestra 🔔 Avvisi con "Anche i chiusi" (js/58),
finestra dell'oggetto del motore e oggetti di prova (js/61), scheda comune
per gli oggetti del motore (js/63), scheda del presidio "Ultimo esito
registrato da te" (js/07, msp-annulla). REGOLE_PREDEFINITE di js/01 con le
2 regole nuove. LIMITI (controllo del 06/11): annullando un'azione del
motore quello che ha fatto la sua funzione_dopo (azione_dopo_*) NON si
disfa: un modulo con funzione_dopo deve prevedere da sé come tornare
indietro; giornale di cantiere: solo la parte del database
(annullabile_giornale), nessun pulsante in js/35 (lo scrivono capo
tecnico e titolare, che lo correggono da soli); sull'avviso
correzione_richiesta il titolare non ha "✖ Annulla" (si chiude dalla
finestra della correzione). Guide: info-tit-22, seg-23, con-14, ct-25, tec-21, com-19,
rap-24, ing-17. Prove: sql/72-annulla-richiesta-correzione-tutti-PROVA.sql
(solo database di prova, rollback: tecnico annulla entro 24 h, altro
tecnico no, dopo 25 h correzione al capo tecnico con scadenza 1 g lav.,
applica, ritira, passo partito, chiusi da soli, motore con avvisi e
storico, Entra come, esito presidio corretto a mano, niente scritture né
cancellazioni dirette); test/annulla-correzione.spec.js (Chrome headless,
tecnico a 390 px: Annulla → Chiedi correzione → il capo tecnico annulla
per lui); matrice dei permessi TUTTO OK (anche MATRICE_AGITO_COME=1, 20
righe nuove); smoke test TUTTO OK con e senza sql/72; rollback provato
(schema identico; avvisi delle richieste chiusi "annullato"; regole tolte
solo se mai cambiate). File principale senza parole di cancellazione
(server MCP). Senza sql/72 nessun pulsante, nessun errore.
Dopo sql/73 (F14.20 deleghe del titolare, ESEGUITO il 06/11 (backup pre73, controllo in regola): backup, poi
73-deleghe-titolare.sql (senza parole di cancellazione, server MCP), poi
73-deleghe-titolare-REGISTRO-CANCELLAZIONI.sql dall'editor, poi il controllo
in fondo al 73; richiede 07, 28, 33, 39, 63, 65, 67, 71, tutti in
produzione; 66 facoltativo per la notifica dell'urgente; 72 non serve).
Tipi delegabili = funzione tipi_delega_titolare() (catalogo, non tabella;
un modulo che aggiunge un tipo la ridefinisce nel suo sql/NN): generale
(delegato per le assenze), decisioni con importo sblocco_margine,
ratifica_spesa, anticipo_parziale, voce_fuori_modello,
commessa_senza_preventivo, urgenza (a segreteria, capo_tecnico,
commerciale, rappresentante, contabile, ingegnere), sblocchi senza importo
consegna_forzata_faldone e chiusura_forzata_commessa (solo segreteria: le
RPC ammettono titolare e segreteria), riporto_indietro_commessa (segreteria,
capo_tecnico). RPC del sito: salva_delega_titolare(tipo, delegato, tetto,
fino_al, nota) (solo titolare; persona attiva del ruolo ammesso, tetto solo
per i tipi con importo, fino al obbligatorio max 366 giorni; sostituisce la
precedente), revoca_delega_titolare(id, motivo) (le decisioni ancora
aperte tornano al titolare), segna_assenza_titolare(dal, al, nota) (max 93
giorni, niente sovrapposizioni; passa subito le decisioni ferme),
togli_assenza_titolare(id), controlla_deleghe_ora(),
crea_decisione_prova_delega(tipo, importo, testo, ferma_da_1_giorno)
(titolare; max 20 prove aperte), mie_deleghe_titolare() (tutti: deleghe
valide ora, modo delega o assenza), tipi_delega_titolare(). Interne (per i
moduli): apri_decisione_titolare(tipo, testo, importo, rif, scadenza,
urgente, prova) = UNICA STRADA per chiedere una decisione al titolare
(avviso con esito obbligatorio al delegato del tipo se l'importo è entro il
tetto e chi chiede non è il delegato, altrimenti al titolare; i moduli
F16.1, F18.12... la usano al posto di crea_avviso), delega_sblocco(tipo,
importo, rif) (vero per titolare, delegato del tipo entro il tetto, e con
il titolare assente per il delegato generale entro il suo tetto se il suo
ruolo è tra quelli del tipo; scrive il registro: le RPC di approvazione dei
moduli la usano al posto di "ruolo = titolare"), passa_decisioni_al_delegato
(titolare assente: decisioni al titolare ferme da 1 g lav. o con la
scadenza superata → al delegato generale entro il tetto, testo "Passata a
te (titolare assente): "; oltre il tetto, importo sconosciuto con un tetto
o chieste dal delegato stesso: restano al titolare e diventano urgenti, una
volta; pg_cron toli_deleghe_assenze al minuto 7 di ogni ora se pg_cron
c'è), titolare_assente, delega_valida_per, delega_attiva_tipo,
ho_delega_generale (policy), avviso_e_decisione, registra_uso_delega,
chi_sblocca_testo, trigger trg_avvisi_deleghe_chiusura (decisione delegata
chiusa → registro con l'esito). AGGANCIO SUL POSTO (pg_get_functiondef +
replace, il file si ferma se il testo non c'è una volta sola; rollback =
replace al contrario): consegna_faldone_commessa (sql/33),
chiudi_commessa (sql/39) e cambia_stato_commessa (sql/28, solo il ramo
"indietro") hanno "v_ruolo <> 'titolare' and not delega_sblocco(...)" e
nello storico "da <nome> (delega del titolare)"; annullare e riattivare
restano solo del titolare. SCELTE DA CONFERMARE DA TOLI: delega a una
persona con scadenza obbligatoria; importo sconosciuto con tetto = fuori
delega; chi chiede non decide da delegato; il delegato generale in assenza
fa anche gli sblocchi senza importo del suo ruolo; senza delegato generale
l'assenza non cambia nulla; le decisioni passate restano al delegato anche
al rientro. Nel sito (js/65): Impostazioni > "🤝 Deleghe del titolare"
(si-deleghe-card, da loadImp di js/10; id dlg-, dla-, dlp-: assenze con
"🏖️ Segna assenza" e "▶️ Controlla ora", una riga per tipo con A chi, Fino
a €, Fino al, Nota, 💾 Delega/Cambia, ✖ Revoca, "🧪 Decisione di prova con
importo", "📒 Registro delle deleghe" ultime 40 righe); caricaMieDeleghe()
al login (boot di js/01) e haDelegaTitolare(tipo)/testoMiaDelega(tipo):
"Consegna comunque" (js/31), "Chiudi comunque" (js/38, js/36) e "←
Indietro a ..." in "Stato e storico" (js/18) anche al delegato; js/60
puoDecidereAvviso: "⚖️ Decidi" (campanella, barra del link #/avviso) e la
finestra m-decisione anche per il delegato destinatario dell'avviso
(chiude con segna_avviso_fatto). Guida titolare info-tit-23. Prove:
sql/73-deleghe-titolare-PROVA.sql (solo database di prova, rollback: spese
fino a 150 € al commerciale → 120 € al commerciale, 200 € al titolare;
chi chiede non decide; ruolo cambiato = delega non vale; delegato generale
5.000 € e ferie: 3.000 € fermo da 1 giorno passa, 8.000 € urgente al
titolare, appena arrivata aspetta; consegna e chiusura forzata della
segreteria rifiutate senza delega e riuscite con; riporto indietro del
capo tecnico solo in assenza; revoca; rifiuti di segreteria, tecnico,
titolare "come" segreteria, insert diretto, funzioni interne);
test/deleghe-titolare.spec.js (Chrome headless: titolare delega da
Impostazioni, commerciale e capo tecnico decidono da "⚖️ Decidi" a 390 px);
matrice dei permessi TUTTO OK (30 righe nuove); smoke test TUTTO OK con e
senza sql/73; rollback provato (schema identico). Senza sql/73: riquadro
"non ancora attive", nessun bottone in più, nessun errore (la chiamata
mie_deleghe_titolare al login risponde 404 senza conseguenze).
Dopo sql/74 (F14.21 riassegnazione delle pratiche, ESEGUITO il 06/11 (backup pre74, controllo in regola): backup, poi
74-riassegnazione-pratiche.sql (senza parole di cancellazione, server MCP),
poi 74-riassegnazione-pratiche-REGISTRO-CANCELLAZIONI.sql dall'editor, poi
il controllo in fondo al 74; richiede 07, 47, 67, 71, tutti in produzione).
Tipi = funzione tipi_riassegnazione_pratiche() (catalogo): clienti
(clienti.rappresentante_id e commerciale_id, non eliminati), trattative
(pipeline_crm.rappresentante_id, fase non vinto/perso), progetti
(progetti_tecnici.rappresentante_id, stato non approvato/archiviato),
preventivi (rappresentante_id e commerciale_id, stati aperti: bozza, in
attesa di approvazione, approvato, inviato, inviato al rappresentante, in
attesa anticipo), commesse (non chiuse né annullate: si sposta il
rappresentante del loro preventivo accettato, la commessa non ha una
colonna persona). Le pratiche chiuse restano a chi le ha seguite. RPC del
sito, SOLO titolare (informatico compreso; "Entra come" un altro ruolo =
rifiuto 42501): riassegna_pratiche(p_da, p_a, p_tipi, p_motivo) (p_tipi
vuoto = tutti; persona attiva diversa; colonne del venditore a un
rappresentante o al titolare, degli acquisti a un commerciale o al
titolare, le altre restano e si contano in "rimaste"; motivo 3-300
caratteri; max 5000; tutto o niente; registro; search_path public, pg_temp
per il trigger dei 3.000 € con get_user_role() senza schema),
pratiche_aperte_utente(id), pratiche_aperte_utenti() (per l'elenco Team),
stato_uscita_utente(id) ('attivo', 'uscita_da_completare' = non attivo con
pratiche aperte, 'uscita_completata'). Interne: pratiche_aperte_di(id),
uscita_completata(id) (per l'iter di uscita F19.17). Il registro delle
azioni di sql/67 registra da solo il campo cambiato su preventivi e
progetti_tecnici. SCELTE DA CONFERMARE DA TOLI: "⏸️ Disattiva" resta
immediato (l'accesso si toglie subito, caso T7): è l'USCITA che resta "da
completare" finché ci sono pratiche aperte; solo pratiche aperte; motivo
obbligatorio; avvisi, domande, interventi, lead_sito.assegnato_a e
appuntamenti_commerciali NON si spostano qui (F19.17 e assenze di sql/69).
Nel sito (js/10): Impostazioni > Team, per il titolare sotto lo stato
"N pratiche aperte", per chi è disattivato "Uscita da completare" (rossa)
o "✓ Uscita completata", bottone "🔀 Riassegna"; "⏸️ Disattiva" di chi ha
pratiche avvisa, disattiva e apre la riassegnazione; finestra
m-riassegna-pratiche (id rpr-: quali pratiche con i conteggi, a chi
(rappresentanti, commerciali, titolare attivi), motivo, anteprima di cosa
si sposta e cosa resta, "📒 Ultime riassegnazioni" con "▸ Cosa è stato
spostato"). Guida titolare info-tit-24. Prove:
sql/74-riassegnazione-pratiche-PROVA.sql (solo database di prova,
rollback: 20 pratiche di prova spostate in una operazione con 20 righe di
registro e 8 righe nel registro delle azioni, uscita da completare →
completata, chiuse non spostate, rifiuti di segreteria, rappresentante,
commerciale, tecnico, titolare "come" segreteria, funzioni interne, insert
e update diretti, cancellazione del registro anche dal proprietario;
venditore + acquisti a un rappresentante = rimaste);
test/riassegnazione-pratiche.spec.js (Chrome headless a 390 px: Team,
Disattiva, riassegnazione, registro; rifiuti via PostgREST); matrice dei
permessi TUTTO OK (20 righe nuove); smoke test TUTTO OK con e senza
sql/74; rollback provato (schema identico; le pratiche spostate restano
spostate). Senza sql/74: elenco Team come prima, nessun bottone, nessun
errore.
Dopo sql/75 (F15.1 catalogo lavorazioni in tabella, ESEGUITO il 06/11 (backup pre75, controllo in regola): backup, poi
75-catalogo-lavorazioni-tabella.sql (senza parole di cancellazione, server
MCP), poi 75-catalogo-lavorazioni-tabella-REGISTRO-CANCELLAZIONI.sql
dall'editor, poi il controllo in fondo al 75; richiede 07, 67, 71, tutti in
produzione). Nessuna RPC: il sito scrive con insert/update diretti sotto
RLS. Funzioni interne: lavorazioni_chi(), trg_lavorazioni_prima (ruolo:
solo titolare e ingegnere anche dentro il database; "attiva" solo titolare,
anche "Entra come" ingegnere = rifiuto 42501; codici della lavorazione e del
campo e lavorazione di una riga fissi; valori del menu
[{"valore","etichetta"}] senza doppioni; uso a valle obbligatorio; chi e
quando; versione +1 per salvataggio), trg_lavorazioni_dopo (registro con
prima/dopo per colonna, azioni creata, modificata, attivata, disattivata,
tolta, rimessa; versione della lavorazione quando cambia una sua riga),
lavorazioni_registro_immutabile. Fuori dal sito (editor, nessun utente) i
limiti di ruolo non valgono. Dati di partenza: le 11 voci di
etichettaFamigliaTecnica (7 schede attive; comune, manutenzione porte REI,
progettazione, formazione spente) e i 48 menu delle 7 schede di js/18 con
gli stessi valori (uso a valle generico "da precisare dall'ingegnere"); gli
altri campi arrivano con F15.10 (import) e F15.6-F15.7. Nel sito
(js/55-catalogo-lavorazioni.js; stesso numero 55 di
js/55-storico-esegui-intervento.js, nome dato dalla task): etichettaFamigliaTecnica
(js/18) legge prima nomeLavorazioneCatalogo poi l'elenco fisso;
selectPreventivo (js/18) chiede adattaMenuSchedaCatalogo (id = prefisso
della scheda pr, es, ri, cp, vi, co, is + codice del campo con "-": etichetta
e valori dal catalogo, il valore salvato e tolto resta "(non più in
elenco)"); il catalogo si rilegge prima di aprire una scheda
(leggiSchedaRilievo avvolta, 60 s). Pagina: finestra m-catalogo-lavorazioni
(id cl-: lavorazione, ✅ Attiva / ⏸ Disattiva solo titolare, dati, campi,
foto e documenti, checklist, registro) e m-campo-lavorazione (id clc-:
valori del menu con ➕ Aggiungi al menu, ↑, ✖), aperta da Impostazioni >
"📚 Catalogo lavorazioni" (si-catalogo-lav-card, loadImp di js/10) e dal
bottone vt-catalogo-btn nella pagina Verifiche tecniche (titolare e
ingegnere; loadVerificheTecniche avvolta). SCELTE DA CONFERMARE DA TOLI:
documento finale e famiglia delle 11 lavorazioni; il menu "tipo servizio"
delle sigillature è il menu "Intervento" della Compartimentazione (non c'è
una scheda Sigillature a sé); lettura del catalogo per tutti gli utenti
attivi; le formule dei prezzi non sono nel catalogo. Guide info-tit-25,
info-ing-18. Prove: sql/75-catalogo-lavorazioni-tabella-PROVA.sql (solo
database di prova, rollback: titolare aggiunge un valore al menu,
ingegnere modifica campi ma non attiva, nemmeno creando, titolare "come"
ingegnere rifiutato, commerciale e rappresentante rifiutati o zero righe,
cancellazioni e scrittura del registro rifiutate, codici fissi, controlli
dei valori); test/catalogo-lavorazioni.spec.js (Chrome headless: titolare
aggiunge "Sigillatura di canaline" e lo vede nella scheda, nome dalla
tabella, spegni/riaccendi; ingegnere a 390 px aggiunge "EI 240" alle
Coppelle e la console gli rifiuta l'attivazione; console del commerciale
rifiutata); matrice dei permessi TUTTO OK (50 righe nuove); smoke test
TUTTO OK con e senza sql/75; rollback provato (schema identico). Senza
sql/75: elenco fisso e menu di js/18, riquadro "non ancora attivo",
nessun bottone in Verifiche, nessun errore (una lettura 404 della tabella).
Dopo sql/76 (F15.2 posizioni P-xx nelle schede di rilievo, ESEGUITO il 06/11 (backup pre76, controllo in regola):
backup, poi 76-tabella-posizioni.sql (senza parole di cancellazione, server
MCP), poi 76-tabella-posizioni-REGISTRO-CANCELLAZIONI.sql dall'editor
(registro con le cancellazioni + chiavi esterne "a cascata" verso scheda e
progetto: prima di questo file una scheda o un progetto CON posizioni non
si eliminano, errore di chiave esterna), poi il controllo in fondo al 76;
richiede 07, 48, 67, 71, tutti in produzione; non richiede 75). RPC
duplica_posizione(p_posizione_id, p_copie 1-50) (SECURITY INVOKER: le copie
nascono sotto le RLS di chi duplica; ubicazione, quantità e dati uguali,
foto no; posizione tolta = rifiuto). Funzione interna
trg_progetti_tecnici_posizioni_prima (progetto dalla scheda, numero = il più
alto del progetto + 1 sotto pg_advisory_xact_lock per progetto, max 999,
campi fissi, tolta con chi/quando, chi/quando con utente_effettivo()).
Nel sito (js/66-posizioni.js): riquadro "📍 Posizioni" rsm-posizioni nella
scheda di rilievo aperta (js/18 htmlBarraSchedeRilievo, solo con sql/48 e
una scheda già salvata: prima "Salva la scheda per aggiungere le
posizioni") e pd-posizioni-<id scheda> in ogni scheda del tab "📝 Rilievi
tecnici" della scheda progetto (js/17 renderSchedeProgettoCommerciale,
disegnaPosizioniProgetto); righe P-xx con ubicazione, quantità, misure,
foto, campi del catalogo; "+ Aggiungi posizione", "✏️ Modifica", "⧉ Duplica"
(finestra m-posizione-duplica, id posd-), "🗑️ Togli la posizione" /
"↩️ Rimetti" (sotto "Tolte"), chi non scrive "👁 Apri". Finestra m-posizione
(id pos-): ubicazione, quantità (con la virgola), larghezza e altezza in cm
(dati.larghezza/dati.altezza, numeri), note (dati.note), i campi del
catalogo segnati "per posizione" (sql/75, in dati.<codice>), foto con il
metro (bucket progetti-tecnici <utente>/<progetto>/posizioni/, riga in
progetti_tecnici_allegati, poi posizione.foto). Le posizioni si salvano
subito, una per una (non con "Salva" della scheda). SCELTE DA CONFERMARE DA
TOLI: numerazione P-xx per progetto (non per scheda); il rappresentante
scrive solo con il progetto in bozza o da integrare, il commerciale mai;
duplicando non si copiano le foto. Guide info-rap-25, info-ing-19,
info-com-20, info-tit-26. Prove: sql/76-tabella-posizioni-PROVA.sql (solo
database di prova, rollback: P-01 + 9 copie, misura della P-07, letture per
ruolo, commerciale/tecnico/rappresentante fuori stato e titolare "come"
commerciale rifiutati, rappresentante sul progetto da integrare e "Entra
come", codice/scheda fissi, togli/rimetti, numero mai riusato, scheda
eliminata a cascata); test/posizioni.spec.js (Chrome headless a 390 px:
ingegnere P-01..P-10 con "⧉ Duplica" e P-07 a 120 cm; rappresentante in
sola lettura e console rifiutata, poi con il progetto da integrare duplica;
commerciale in sola lettura e console rifiutata; tecnico nessuna riga;
POSIZIONI_SENZA_SQL=1 dopo il rollback); matrice dei permessi TUTTO OK
anche con MATRICE_AGITO_COME=1 (10 righe nuove); smoke test TUTTO OK con e
senza sql/76; rollback provato (schema identico). Senza sql/76: nessun
riquadro, nessun errore (una lettura 404 della tabella).
Dopo sql/77 (F15.3 motore delle schede, parte 1a: disegno e salvataggio,
ESEGUITO il 09/11 (backup pre77, controllo in regola): backup, poi 77-motore-schede.sql (senza parole di
cancellazione, server MCP), poi il controllo in fondo; nessun file
-REGISTRO-CANCELLAZIONI (nessuna tabella nuova); richiede 07, 48, 71, 75,
tutti in produzione; non richiede 76). RPC motore_schede_attivo() (true:
il sito sa che il 77 c'è; execute solo authenticated). Policy nuove su
progetti_tecnici_schede: il rappresentante inserisce e modifica le schede
dei suoi progetti (rappresentante_id = utente_effettivo()) in bozza o da
integrare (ruolo_corrente(), valgono con "Entra come"); gli altri ruoli
come prima (tecnico, segreteria, commerciale in inserimento, altro
rappresentante, progetto inviato all'ingegnere: rifiutati dal database).
Catalogo (dati): porte_rei + quantita (pz, 1-500), larghezza e altezza (cm,
60-300), colore, spessore_parete (mm), note_vano, piano, logistica,
note_tecniche (livello ingegnere); obbligatori tipo_intervento, rei,
tipologia, quantita, larghezza, altezza (D2). NIENTE controlli nel database
su livello ingegnere, plausibilità e obbligatori: sono F15.4 (1b). Nel sito
(js/56-motore-schede.js, caricato dopo js/66 e prima di js/19): riquadro
"📝 Compila una scheda di rilievo" (msm-apri, in cima al tab "📝 Rilievi
tecnici" della scheda progetto, avvolgendo renderSchedeProgettoCommerciale;
rappresentante sui suoi progetti in bozza/da integrare, ingegnere e
titolare sempre): scelta della lavorazione (attive con campi), "📝 Compila
la scheda" (apriSchedaMotore) disegna nella finestra m-rilievo-tecnico
(#msm-motore, id msm-c-<codice>) dai lavorazioni_campi attivi, non "per
posizione", non foto: menu CHIUSI (valori del catalogo, valore salvato
fuori elenco = "non più in elenco"), numeri con la virgola e unità accanto,
Sì/No, testi; "Tipo di richiesta" Definitiva/Indicativa (dati.tipo_richiesta):
"❓ Non noto" (valore 'non_noto') SOLO nell'indicativa (opzione nei menu,
casella per numeri e testi brevi); campi livello ingegnere disabilitati per
il rappresentante (il valore salvato resta); * sugli obbligatori (non
bloccano: dopo il salvataggio "Per il preventivo mancano: ..."); "Luogo dei
lavori e referente" precompilati (sede principale o unica del cliente, se
no indirizzo del cliente; referente e telefono dall'anagrafica):
dati.sede_id (non elencato), indirizzo_lavori, referente_lavori,
telefono_referente. Tab, nome, bozze in memoria, "+ Nuova scheda",
conferma alla chiusura e posizioni = quelle di js/18 (avvolte
datiFormSchedaRilievo e apriFamigliaSchedaRilievo solo con #msm-motore
nella finestra). js/18: etichettaCampoTecnico (nomi delle chiavi del
motore e, per le chiavi non in elenco, il nome del catalogo se unico:
etichettaCampoCatalogo), valoreSchedaTecnica ('non_noto' = "Non noto (da
chiedere al cliente)", numeri con la virgola), campoSchedaDaElencare (non
sede_id), conservaDatiFuoriModulo in salvaRigaSchedaRilievo: salvando
(anche le 7 schede scritte a mano) le chiavi dei dati salvati che il
modulo non ha restano (nessuna scheda cancella i dati dell'altra; il nome
della scheda escluso). Guide info-rap-26, info-ing-20. SCELTE DA
CONFERMARE DA TOLI: rappresentante solo in bozza/da integrare; quali campi
porte REI obbligatori e di livello ingegnere; policy senza limite di
colonne (dati_commerciali scrivibile da console dal rappresentante sui
suoi progetti in bozza: F15.4). Prove: sql/77-motore-schede-PROVA.sql
(solo database di prova, rollback); test/motore-schede.spec.js (Chrome
headless a 390 px: rappresentante compila porte REI, scheda 2 con i tab,
salva, riapre con gli stessi dati, scheda progetto, console del
rappresentante e del tecnico rifiutata, ingegnere con la scheda di js/18
che conserva i dati del motore; MOTORE_SENZA_SQL=1 dopo il rollback);
matrice dei permessi TUTTO OK (nota nella riga del rappresentante); smoke
test TUTTO OK con e senza sql/77; rollback provato (schema identico; i 9
campi diventano "tolti", gli obbligatori tornano come prima). Senza sql/77:
nessun riquadro, nessun errore (una chiamata RPC 404).
Dopo sql/78 (F15.4 motore delle schede, parte 1b: protezioni, plausibilità
e campi del prezzo, ESEGUITO il 09/11 (backup pre77, controllo in regola): backup, 77-motore-schede.sql e il suo
controllo, poi 78-motore-schede.sql (senza parole di cancellazione, server
MCP), poi il controllo in fondo al 78; nessun file -REGISTRO-CANCELLAZIONI
(nessuna tabella nuova); richiede 07, 71, 75, 76, 77, si ferma senza). Nessuna
RPC del sito. Funzioni nuove: campi_ingegnere_lavorazione(famiglia) (campi
livello ingegnere del catalogo, anche tolti, + note_tecniche e note_calcolo di
tutte le schede), motore_valore_vuoto, motore_numero (numero JSON o testo con
la virgola), motore_stesso_valore, motore_testo_numero, motore_in_metri (mm, cm, m; senza unità cm),
interna motore_controlla_dati_rappresentante(famiglia, nuovi, vecchi,
quantità, quantità di prima), trigger trg_progetti_tecnici_schede_motore e
trg_progetti_tecnici_posizioni_motore, trg_lavorazioni_campi_prezzo. REGOLE
(solo ruolo_corrente() = rappresentante con utente_effettivo(); editor SQL,
titolare, ingegnere, commerciale come prima): (a) i campi dell'ingegnere non
si scrivono né cambiano (42501 "«...» lo compila l'ingegnere"); (b) schede:
dati_commerciali e ultima_modifica_commerciale_* mai, progetto, famiglia e
numero fissi, scheda nuova solo di una lavorazione ATTIVA, nasce bozza e
compilata da lui, lo stato resta quello dell'ingegnere; l'upsert del sito
(insert on conflict) si controlla nel ramo update con i dati di prima;
(c) PLAUSIBILITÀ solo sui valori CAMBIATI (22023 con campo e motivo;
"cambiato" con motore_stesso_valore: vuoti uguali, "350" testo della scheda
di js/18 = 350 numero del motore, così un portone salvato dall'ingegnere non
blocca il rappresentante che cambia altro; js/56 rimanda il valore salvato
com'era se è lo stesso numero): numeri
veri (anche "92,5") dentro min/max del catalogo (porte REI larghezza e
altezza 60-300 cm, quantità 1-500 pz), menu chiusi, Sì/No, "non_noto"
sempre ammesso; m² = un campo numerico del catalogo in m²/m2/mq deve tornare
con larghezza × altezza (unità del catalogo, se no cm) di un pezzo o della
quantità (della scheda o della colonna quantita della posizione), 10% di
tolleranza, minimo 0,05 m². Posizioni copiate (duplicata_da, "⧉ Duplica"):
confronto con l'originale. Nel sito (js/56): serveAlPrezzoMotore (* e "Per il
preventivo mancano" dai serve_al_prezzo, senza sql/78 da obbligatorio),
problemiPlausibilitaDati (gemella della funzione SQL),
controlloSchedeRilievoPrimaDelSalvataggio chiamata da salvaRigaSchedaRilievo
di js/18 per TUTTE le schede (motore e le 7 di js/18, tutte le tab
modificate): rappresentante bloccato con il motivo, ingegnere e titolare
conferma "Controlla questi dati... Sono giusti?"; testoErroreSchedaMotore
(i testi del database si mostrano così come sono). js/66: campi 🎓 per
posizione in sola lettura per il rappresentante (non si mandano), stesso
controllo prima di salvare una posizione, errori di sql/78 col loro testo.
js/55 e index.html: "Serve a calcolare il preventivo (obbligatorio)". Guide
info-rap-27, info-ing-21. SCELTE DA CONFERMARE DA TOLI: blocco solo per il
rappresentante (ingegnere e titolare con conferma, portoni oltre 3 m);
note_tecniche e note_calcolo dell'ingegnere in tutte le lavorazioni;
tolleranza dei m² 10%; "non_noto" non controllato contro il tipo di
richiesta (F15.8); il commerciale (policy "commerciale aggiorna rilievi
tecnici" di prima di ottobre) da console può ancora cambiare anche i dati
dell'ingegnere: non toccato. Prove: sql/78-motore-schede-PROVA.sql (solo
database di prova, rollback: 1000 cm, testo, 40 cm, quantità 0, menu fuori
elenco, titolare "come" rappresentante, note dell'ingegnere e note interne,
copia del commerciale, lavorazione spenta o inventata, upsert, stato, numero,
tipo, posizioni e Duplica, m² su scheda e posizione, campi del prezzo e
vincolo; ingegnere, titolare e commerciale come prima);
test/motore-schede-protezioni.spec.js (Chrome headless: rappresentante a
390 px, 1000 cm fermato dal sito e dalla console, note 🎓 intatte, posizione
1000 cm rifiutata; ingegnere salva 400 cm dopo la conferma; tecnico
rifiutato; commerciale scrive la sua copia; MOTORE_PROTEZIONI_SENZA_SQL=1
dopo il rollback); test/motore-schede.spec.js, posizioni.spec.js,
catalogo-lavorazioni.spec.js TUTTO OK con sql/78; sql/77 e 76 -PROVA OK
con sql/78 (75 -PROVA conta i dati di partenza: valida solo prima del 77);
matrice dei permessi TUTTO OK (anche MATRICE_AGITO_COME=1; note nelle righe
del rappresentante); smoke test TUTTO OK con e senza sql/78; rollback
provato (schema identico al backup pre76 + 76 + 77; le righe del registro
del catalogo restano). Senza sql/78: sito come con il 77 (controlli solo
nel sito), nessun errore.
Dopo sql/79 (F15.5 motore delle schede, parte 2: fonte del rilievo e fonte
dei dati normativi, ESEGUITO il 09/11 (backup pre79, dal server MCP, controllo in regola): backup, anteprima in fondo al file,
79-motore-schede.sql (senza parole di cancellazione, server MCP), poi il
controllo in fondo; nessun file -REGISTRO-CANCELLAZIONI (nessuna tabella
nuova); richiede 07, 71, 75, 77, 78, tutti in produzione, si ferma senza).
RPC del sito: fonti_dati_attive() (true: il sito sa che il 79 c'è),
fonti_mancanti_progetto(p_progetto) (SECURITY INVOKER: cosa manca per inviare,
righe scheda_id, scheda, campo, etichetta, motivo; vuota = si invia).
Funzioni nuove: campi_normativi_lavorazione(famiglia) (catalogo: normativo,
attivo, non per posizione, non foto; oggi 7: rei, atex, classe, minuti,
classe_r, classe_resistenza, reazione_fuoco), etichetta_fonte_dato, trigger
trg_progetti_tecnici_schede_fonti e trg_progetti_tecnici_fonti. DATI: colonna
progetti_tecnici.fonte_rilievo (sopralluogo_toli, documenti_cliente,
misure_dichiarate); nella scheda dati.fonti_normative.<codice> = { valore,
fonte (documento_cliente | come_esistente | dichiarato_cliente |
ingegnere_toli), allegato_id (riga di progetti_tecnici_allegati DELLO STESSO
progetto), allegato_nome, allegato_percorso, da, da_nome, da_ruolo, il }:
valore, nome e percorso del file, chi e quando li scrive il trigger (da =
utente_effettivo(), da_nome = nome_utente_corrente(), chi agisce davvero).
REGOLE (utenti del sito; editor SQL senza limiti): fonte del rilievo e voci
delle fonti le cambiano solo rappresentante, ingegnere, titolare (42501;
Acquisti dalla policy "commerciale aggiorna rilievi tecnici" rifiutato);
voce solo per un campo normativo della lavorazione, fonte valida, file
obbligatorio per documento/come esistente/dichiarato (22023);
ingegnere_toli solo ingegnere e titolare (42501, anche titolare "come"
rappresentante); le voci non cambiate non si ricontrollano; upsert del sito
controllato nel ramo update. BLOCCO DELL'INVIO: da bozza o da integrare
verso in_verifica_tecnica, inviato_a_commerciale o pronto_per_preventivo
(e un progetto creato già "inviato" dal rappresentante) senza fonte del
rilievo o con un dato normativo compilato (non vuoto, non "non_noto") senza
fonte valida (senza fonte, fonte data per un valore diverso, file tolto) =
22023 "Invio bloccato...", per ogni utente del sito. I passaggi dopo
(ingegnere → pronto, Acquisti, Rimanda indietro, preventivi) non si fermano.
Nel sito: js/56 (in fondo, F15.5): "📐 Fonte del rilievo del progetto" in cima
alla scheda del motore (si salva subito), "📜 Fonte del dato" sotto ogni
campo normativo (id msm-fonte-<codice>, msm-f-, msm-fa-: scelta della fonte,
file del progetto o "📎 Carica"/"📎 Foto" (bucket progetti-tecnici
<utente>/<progetto>/fonti/, riga in progetti_tecnici_allegati), "👁 Apri",
"📄 Modulo da far firmare" (PDF jsPDF con i dati dichiarati,
generaModuloDichiarazioneMotore), stato ✓ / ⚠️ "il dato è cambiato dopo la
fonte" con "✓ Vale per il dato nuovo"); salvataggio con "Senza fonte (il
progetto non si invia): ..."; htmlFonteDatoScheda (fonte sotto il dato nella
scheda progetto di js/17 e nel preventivo di js/18); controllaFontiPrimaDellInvio
(RPC, alert con l'elenco) chiamata da inviaProgettoAUfficioTecnico e
inviaProgettoAlCommerciale (solo da bozza/da integrare) di js/17;
fotoObbligatorieProgetto(progetto) (false con misure dichiarate, per F15.9).
js/17: campo "Fonte del rilievo *" nella finestra del progetto
(mp-fonte-rilievo-box, mostraFonteRilievoProgetto, anche in
apriProgettoDaElenco; disattivato per gli altri ruoli), riga "Fonte del
rilievo" in progetto-detail. js/18: campoSchedaDaElencare esclude
fonti_normative (preventivo, copia di Acquisti, PDF fornitore, scheda
cantiere: i dati si leggono come prima); generaPreventivoClientePDF legge
progetti_tecnici.fonte_rilievo del progetto del preventivo e con
misure_dichiarate stampa la sezione "Misure: Misure fornite dal committente,
da verificare prima dell'ordine." (senza sql/79 la lettura fallisce in
silenzio). Guide info-rap-28, info-ing-22. SCELTE DA CONFERMARE DA TOLI:
blocco solo all'invio del rappresentante (le 7 schede di js/18 non hanno
ancora la fonte: F15.6-F15.7); progetti aperti non migrati (al prossimo
invio chiedono le fonti); "ingegnere TOLI" solo per ruolo, la progettazione
non è verificata; testo del modulo di dichiarazione; file obbligatorio anche
per "dichiarato" (modulo firmato o mail); dati normativi per posizione non
controllati (F15.8); passo "verifica misure" della commessa NON fatto.
Prove: sql/79-motore-schede-PROVA.sql (solo database di prova, rollback, 50
controlli: invio senza fonte del rilievo e senza fonte del dato rifiutato
anche al titolare "come" rappresentante; Acquisti, segreteria, titolare "come"
Acquisti non scrivono la fonte del rilievo; file di un altro progetto, campo
non normativo, fonte inventata, "ingegnere TOLI" del rappresentante e
Acquisti sulle schede rifiutati; come esistente con foto → valore/chi/file dal
database, si invia; dato cambiato dopo e file tolto → bloccato; non noto
passa; ingegnere TOLI con nome e data; passaggio dell'ingegnere non bloccato;
editor libero); test/motore-schede-fonti.spec.js (Chrome headless,
rappresentante a 390 px: porta REI 60 senza fonte salvata ma non inviata,
console rifiutata, fonte del rilievo e foto della targhetta → inviata;
console di rappresentante "ingegnere TOLI", Acquisti e tecnico rifiutati;
ingegnere TOLI con nome; PDF con e senza la frase; FONTI_SENZA_SQL=1 dopo il
rollback); smoke test TUTTO OK con e senza sql/79 (smoke.spec.js sceglie la
fonte del rilievo se il campo c'è); motore-schede, motore-schede-protezioni,
posizioni TUTTO OK con sql/79; matrice dei permessi TUTTO OK (anche
MATRICE_AGITO_COME=1; corrette 7 caselle di lettura di commesse e
commesse_storico, che dal backup pre77 hanno una riga vera); rollback
provato (schema identico). Senza sql/79: nessuna fonte, nessun blocco,
nessun errore (una chiamata RPC 404).
Dopo sql/80 (F15.6 migrazione nel catalogo delle schede scritte a mano di
porte REI, estintori e rilevazione incendi, ESEGUITO il 09/11 (backup pre80, dal server MCP, controllo in regola): backup, anteprima in
fondo al file (chiavi_senza_campo atteso vuoto), 80-migrazione-schede.sql
(senza parole di cancellazione, server MCP), poi il controllo in fondo;
nessun file -REGISTRO-CANCELLAZIONI (nessuna tabella nuova); richiede 07, 71,
75, 77, 78, tutti in produzione, si ferma senza; 79 facoltativo). Le altre 4
schede (compartimentazione, vernice, spegnimento, coppelle): F15.7. RPC del
sito: schede_migrate_motore() (text[]: porte_rei, estintori,
rilevazione_incendi; execute solo authenticated). DATI (lavorazioni_campi,
solo righe che mancano, registrate da lavorazioni_registro e registro_azioni):
un campo per ogni chiave che le schede di js/18 salvano, CODICE = CHIAVE di
dati (i progetti esistenti si leggono senza trasformarli, nessuna riga delle
schede si tocca): estintori numero_esistenti, numero_installare (pz 0-5000),
classe_spegnimento, posizionamento, supporti, registro, foto_postazioni,
note_tecniche (livello ingegnere); rilevazione marca, loop (0-99), indirizzi_loop,
margine_espansione (%), accessori_centrale, comandi_terzi, interfacce, 12
quantità di dispositivi (pz/ml/m, minimi 0), altezza (testo), superficie (m²),
locali, struttura, ambienti_gravosi, cavo_schermato, cavo_resistente,
sigillature, note_posa, collaudo, manutenzione, note_calcolo (livello
ingegnere); ordine come la scheda di js/18 (i menu di sql/75 cambiano solo
l'ordine, se mai cambiato); obbligatori (D2) estintori tipo_intervento,
tipologia, capacita, numero_installare, rilevazione tipo_intervento,
sorveglianza, centrale_tipo, superficie. Il codice non si cambia (trigger di
sql/75, anche il titolare); rinominare solo titolare e ingegnere (Acquisti,
rappresentante, segreteria, tecnico, titolare "come" Acquisti: zero righe o
rifiuto). Nel sito (js/56, in fondo, F15.6): verificaMigrazioneSchedeDisponibile
(RPC, dopo verificaMotoreSchedeDisponibile), famigliaMigrataMotore(famiglia);
apriSchedaPorteReiIngegnere, apriSchedaEstintoriIngegnere,
apriSchedaRilevazioneIngegnere (bottoni della Verifica tecnica) avvolte:
aprono apriSchedaMotore; le schede di js/18 di queste 3 lavorazioni restano IN
SOLA LETTURA (schedaVecchiaInSolaLettura chiamata da apriSchedaPorteRei,
apriSchedaEstintori, apriSchedaRilevazioneIncendi dal progetto: campi spenti,
niente Salva/+ Nuova/Elimina, avviso msm-sola-lettura con "📝 Compila nel
motore"; salvataggioSchedaVecchiaBloccato in salvaScheda*); nel motore
"👁 Modulo di prima (sola lettura)" (msm-modulo-prima, vediModuloDiPrimaMotore)
e l'avviso "Da ricompilare" (msm-da-ricompilare) sulle schede salvate dal
modulo di prima (senza tipo_richiesta e con dati); CAMPI_TESTO_LUNGO_MOTORE
(aree di testo come in js/18); numeri salvati come testo ("12.5") mostrati con
la virgola e rimandati com'erano se uguali. js/18: etichettaCampoTecnico(campo,
famiglia) e valoreSchedaTecnica(valore, campo, famiglia): con la famiglia di
una lavorazione migrata etichetta (con l'unità) e valori dei menu dal catalogo
(anche rinominati: "Estintori da posare (pz): 9" nel PDF per il fornitore);
la famiglia la passano renderSchedePreventivo e generaRichiestaQuotazionePDF
(js/18), la scheda progetto e la copia di Acquisti (js/17), la scheda
cantiere (js/32); preparaSchedeMigrate (catalogo e verifiche pronti) avvolge
renderSchedePreventivo, generaRichiestaQuotazionePDF, caricaSchedaCantiere,
renderSchedeProgettoCommerciale, leggiSchedaRilievo. Guide info-ing-23,
info-tit-27 (e info-ing-22 aggiornata). SCELTE DA CONFERMARE DA TOLI:
obbligatori proposti; livello ingegnere solo le note interne; minimi e
massimi larghi; "classe di spegnimento" non normativa (sql/79 non chiede la
fonte); le posizioni P-xx restano modificabili anche nel modulo di prima.
Prove: sql/80-migrazione-schede-PROVA.sql (solo database di prova, rollback:
chiavi delle schede esistenti tutte con un campo, rinomina del titolare e
dell'ingegnere con codice fisso e dato letto con il codice, cambio del codice
rifiutato, Acquisti/rappresentante/segreteria/tecnico/titolare "come"
Acquisti zero righe o rifiuto, rappresentante: -3 estintori, 1000 loop, note
dell'ingegnere rifiutati); test/migrazione-schede.spec.js (Chrome headless:
le 3 schede esistenti del backup e 3 schede "di prima" con tutte le chiavi si
aprono nel motore con gli stessi valori, modulo di prima in sola lettura,
salvataggio dal motore senza perdite, rinomina del titolare letta da scheda
progetto e PDF per il fornitore, console di Acquisti, rappresentante, tecnico;
MIGRAZIONE_SENZA_SQL=1 dopo il rollback); motore-schede.spec.js e
posizioni.spec.js aggiornati (con sql/80 il bottone apre il motore);
motore-schede, -protezioni, -fonti, posizioni, catalogo-lavorazioni, smoke
TUTTO OK con e senza sql/80 (i 5 test ignorano il 404 voluto di
schede_migrate_motore); matrice dei permessi TUTTO OK con sql/80 (nessuna
tabella nuova); rollback provato (schema identico; i 39 campi
diventano "tolti", obbligatori e ordine tornano come prima; rieseguito il
file: catalogo identico). Senza sql/80: schede di js/18 come prima, nessun
errore (una chiamata RPC 404).
Dopo sql/81 (F15.7 migrazione nel catalogo delle altre 4 schede scritte a
mano: compartimentazione con le pareti in cartongesso del 02/11, vernice
intumescente, coppelle, impianti di spegnimento; ESEGUITO il 09/11 (backup pre81, controllo in regola). ORDINE: PRIMA si
pubblica il sito (il sito di prima non conosce il tipo 'elenco' e nel motore
mostrerebbe le pareti come testo, salvando sopra l'elenco), poi backup,
anteprima in fondo al file (atteso: campi 7/6/9/3, pareti_a_mano 0, schede
coppelle 11 e vernice 2 nel backup pre80, chiavi_senza_campo vuoto),
81-migrazione-schede.sql dall'EDITOR SQL (contiene "drop constraint" del
vincolo del tipo: il server MCP non lo esegue), poi il controllo in fondo
(Claude); nessun file -REGISTRO-CANCELLAZIONI; richiede 07, 71, 75, 77, 78,
80, tutti in produzione, si ferma senza; 79 facoltativo). Nessuna RPC nuova:
schede_migrate_motore() ridefinita con le 7 lavorazioni (rollback = versione
di sql/80). VINCOLO lavorazioni_campi_tipo_check: tipi numero, menu, si_no,
testo, foto + 'elenco'; (tipo = 'elenco') = (codice = 'pareti_cartongesso') e
mai per posizione (anche il titolare: le pareti non diventano testo, nessun
altro elenco). DATI (solo righe che mancano): compartimentazione
numero_attraversamenti (n. 0-10000), dimensioni_foro, spessore_supporto (mm
0-3000), posizione, sistemi_presenti, riempimento_cavi,
certificazione_sistema, pareti_cartongesso (elenco: unita, larghezza,
altezza, angolo, misura_angolo, quantita_angoli come js/18), accessibilita,
foto, note_tecniche; vernice profilo, numero_elementi (pz), sviluppo_lineare
(m), superficie (m²), fattore_sezione, note_supporto, accessibilita, ciclo,
colore, requisito_estetico, foto, certificazione, note_tecniche; coppelle
diametro e spessore (TESTO: nel backup "2\"", "CANALINA MM 50X50"),
lunghezza (m), numero_tratti, numero_attraversamenti_coppelle, ostacoli,
accessibilita, foto, certificazione, note_tecniche; spegnimento area_protetta,
normativa, impianto_esistente, pressione, portata, riserva (testi),
componenti, rete_esistente, percorsi_tubazioni, compartimentazione,
collegamenti, accessibilita, collaudi, foto, note_tecniche. note_tecniche
livello ingegnere; ordine come js/18 (i menu di sql/75 cambiano ordine se mai
cambiato); obbligatori (D2) compartimentazione tipo_intervento, classe,
minuti; vernice elemento, classe_r, superficie; coppelle tipo_intervento,
classe_resistenza, diametro, lunghezza; spegnimento tipo_impianto,
tipo_intervento, area_protetta, componenti. Nel sito: js/56 (in fondo, F15.7)
SCHEDE_VECCHIE_MOTORE, bottoni della verifica tecnica
(apriSchedaCompartimentazioneIngegnere, apriSchedaVerniceIntumescenteIngegnere,
apriSchedaCoppelleIngegnere, apriSchedaImpiantiSpegnimentoIngegnere) e
CAMPI_TESTO_LUNGO_MOTORE con le 4 lavorazioni; tipo 'elenco' in
htmlCampoMotore/datiFormSchedaMotore (htmlElencoMotore, leggiElencoMotore,
elencoPareteMotore: righe di js/18 htmlRighePareteCartongesso con
"+ Aggiungi parete" msm-aggiungi-parete; un valore che non è un elenco resta
com'è); schedaVecchiaInSolaLettura nasconde anche "+ Aggiungi parete" e
"🗑️ Togli". js/18: schedaVecchiaInSolaLettura e salvataggioSchedaVecchiaBloccato
nelle 4 schede; aggiungiPareteCartongesso/togliPareteCartongesso segnano il
tab modificato (pallino). js/55: tipo "Righe ripetibili (pareti)" mostrato,
non scelto né cambiato (select e "per posizione" spenti). Preventivo, copia di
Acquisti, scheda cantiere e PDF per il fornitore: come prima ("Parete 1: 4,5 ×
2,7 m (m²) · angolo interno ed esterno: 2,7 m, n. 2"). Guide info-ing-24,
info-tit-28 (info-ing-23 e info-tit-27 aggiornate). SCELTE DA CONFERMARE DA
TOLI: obbligatori proposti; nessun campo nuovo normativo (normativa dello
spegnimento compresa); nessuna plausibilità sulle righe delle pareti; tipo
'elenco' solo per le pareti; testi lunghi e minimi/massimi larghi. Prove:
sql/81-migrazione-schede-PROVA.sql (solo database di prova, rollback: catalogo
18/19/19/18, chiavi delle 13 schede del backup tutte con un campo, RPC con le
7, rinomina del titolare e dell'ingegnere con codice fisso, pareti che non
diventano testo né per posizione né un altro elenco, ruoli non ammessi zero
righe, rappresentante: -5 m, 99999 mm e note dell'ingegnere rifiutati, due
pareti salvate); test/migrazione-schede-2.spec.js (Chrome headless, anche a
390 px: le 11 coppelle e 2 vernici del backup e 4 schede "di prima" con tutte
le chiavi nel motore, pareti nelle righe, modulo di prima in sola lettura,
parete aggiunta e salvata senza perdite, scheda progetto e PDF per il
fornitore con le pareti e l'etichetta rinominata, tipo delle pareti fisso,
console di Acquisti, rappresentante, tecnico; MIGRAZIONE_SENZA_SQL=1 dopo il
rollback: scheda di js/18 modificabile, stessa riga nel PDF);
catalogo-lavorazioni.spec.js aggiornato (con sql/81 i menu si leggono nel
motore); migrazione-schede, catalogo-lavorazioni, motore-schede, -protezioni,
-fonti, posizioni, smoke TUTTO OK con sql/81 (e migrazione-schede-2,
migrazione-schede, catalogo-lavorazioni, smoke senza); 80 -PROVA accetta le 7
lavorazioni; matrice dei permessi TUTTO OK; rollback provato (schema identico
al backup pre80 + 80; i 49 campi "tolti", le pareti testo "tolto";
rieseguito il file: catalogo identico). Senza sql/81: le 4 schede di js/18
come prima, nessun errore.
Dopo sql/82 (F15.8 blocco comune e controlli di invio, ESEGUITO il 09/11 (backup pre82, dal server MCP, controllo in regola): backup,
anteprima in fondo al file, 82-blocco-comune-controlli-invio.sql (senza parole
di cancellazione, server MCP), controllo in fondo; nessun file
-REGISTRO-CANCELLAZIONI (nessuna tabella nuova); richiede 07, 26, 34, 71, 75,
76, 77, 78, 79, tutti in produzione, si ferma senza; il sito si pubblica prima o
dopo; provato il 09/11 sul backup pre81 + 81 + 82). D2: CONTROLLI DI INVIO SOLO
sui campi "serve al prezzo" del catalogo. RPC del sito:
controlli_invio_progetto(p_progetto) (SECURITY INVOKER: righe scheda_id,
scheda, campo, etichetta, motivo; vuota = si invia). Funzioni nuove
testo_vietato_rilievo(testo) ("da verificare", "da definire", "?", "xx"; null =
va bene), problema_valore_invio(valore, tipo, valori, indicativa); trigger
trg_progetti_tecnici_invio_completo (security definer, BEFORE UPDATE OF stato:
da bozza o da integrare verso in_verifica_tecnica, inviato_a_commerciale o
pronto_per_preventivo, per ogni utente del sito anche "Entra come", 22023
"Invio bloccato, dati per il preventivo da completare: ..."; editor libero; i
passaggi dopo non si fermano) e trg_commesse_rilievo_comune (alla nascita della
commessa referente_lavori, telefono_referente (solo se valido per il vincolo di
sql/34), accessi e orari della scheda comune nelle colonne cantiere_* vuote,
"chi" = "Blocco comune del rilievo"; un errore resta WARNING). REGOLE: un campo
serve al prezzo (anche per posizione) ferma l'invio se vuoto, "non_noto" in una
richiesta definitiva (nella indicativa è ammesso), o con un testo vietato (nei
menu anche il valore scelto o la sua etichetta: "Classe superiore / da
definire" delle porte REI, "Altro / da definire" della vernice e delle
coppelle); vuoto nella scheda ma compilato in TUTTE le posizioni attive = va
bene; facoltativi mai; schede di lavorazioni non nel catalogo non controllate;
blocco comune con campi "serve al prezzo" (oggi nessuno) e senza scheda comune
= fermo. Nel sito: js/56 (in fondo, F15.8) testoVietatoRilievo e
problemaValoreInvio (gemelle delle funzioni SQL), controlliInvioProgetto (RPC,
senza sql/82 controlliInvioProgettoSito con le stesse regole: il blocco nel
sito vale da subito), controllaDatiPrimaDellInvio (alert con l'elenco),
chiamata da inviaProgettoAUfficioTecnico e inviaProgettoAlCommerciale (solo da
bozza/da integrare) di js/17 dopo le fonti; "Per il preventivo mancano o sono
da precisare" dopo il salvataggio della scheda (obbligatoriMancantiMotore con
le stesse regole). Blocco comune (con sql/82, bloccoComuneAttivo): riquadro
"📋 Blocco comune: le 6 domande del primo contatto" (msm-comune,
htmlRiquadroBloccoComune: domande compilate con ✓, "📋 Compila il blocco
comune" / "✏️ Modifica il blocco comune (N su 6)") in cima al tab Rilievi
tecnici; apre il motore con famiglia 'comune' numero 1 (niente tab "+ Nuova
scheda", niente tipo di richiesta, luogo dei lavori e referente in cantiere,
fonte del rilievo, poi i 7 campi; "Entro quando" con input date,
CAMPI_DATA_MOTORE); 'comune' non è tra le lavorazioni del menu
(lavorazioniMotore); etichette, menu e data in italiano nelle schede salvate
(campoCatalogoMigrato vale anche per 'comune'). js/18: il PDF della richiesta
al fornitore (generaRichiestaQuotazionePDF) NON legge la scheda comune
(contatti del cliente). SCELTE DA CONFERMARE DA TOLI: le "6 domande" = referente
e telefono, chi decide, perché, entro quando, accessi, orari; tutti facoltativi;
"non noto" ammesso nell'indicativa; voci dei menu "perché" ed "entro quando";
menu "da definire" bloccanti solo se il campo serve al prezzo. Guida
info-rap-29. Prove: sql/82-blocco-comune-controlli-invio-PROVA.sql (solo
database di prova, rollback: testi vietati, quantità vuota rifiutata anche al
titolare "come" rappresentante, "xx", "non noto" definitiva e indicativa,
"Classe superiore / da definire", facoltativi "da verificare", posizioni,
ingegnere non bloccato, editor libero, blocco comune del rappresentante,
commessa con referente/telefono/accessi/orari, campo comune "serve al prezzo"
senza scheda); 79 -PROVA aggiornato (il rei "non noto" nella richiesta
indicativa); test/blocco-comune.spec.js (Chrome headless, rappresentante a 390
px; BLOCCO_COMUNE_SENZA_SQL=1 dopo il rollback); smoke TUTTO OK con e senza
sql/82; rollback provato (schema identico; campi comune "tolti", lavorazione
spenta; rieseguito il file: campi di nuovo attivi). Senza sql/82: nessun
riquadro, controlli di invio solo nel sito, nessun errore (una chiamata RPC
404).
Scheda oggetto comune (F14.16, js/63-scheda-oggetto.js, NESSUN SQL: legge
solo tabelle che il ruolo già legge). In cima a preventivo-detail
(pvd-scheda-oggetto, js/18), commessa-detail (cmd-scheda-oggetto, js/26),
progetto-detail (pd-scheda-oggetto, js/17) e cliente-detail
(cd-scheda-oggetto, js/09) la funzione unica
caricaSchedaOggetto(oggetto, record, contenitore) disegna: intestazione
(stato se il titolo non lo mostra già; scadenza: preventivo "Valido fino
al", commessa "Fine lavori prevista", in rosso se passata), "Cosa puoi
fare" = azioniScheda(oggetto, record, ruolo) (funzione di oggetto, ruolo e
stato, MAI della pagina di provenienza; oggetti del motore = azioniDisponibili
di js/61; oggetti di prima = righe AZIONI_SCHEDA con registraAzioneScheda,
che richiamano le finestre già esistenti: esito del cliente, rimanda
indietro, rimanda al commerciale, voci e PDF, anticipo, stato della
commessa, sede, cantiere, ❓ domanda; pulsanti con data-azione-scheda),
riquadro "🔗 Collegati" (registro delle fonti registraFonteCollegati:
cliente, sede/sedi, progetto, preventivi e revisioni = gli altri dello
stesso progetto e gli integrativi, commessa, cantiere, ordini ai
fornitori, POS = voce "POS..." del faldone, documenti finali = cartella
chiusura, fatture, richieste dal portale; ogni riga apre con
apriRottaScheda di js/47 se il ruolo ha la pagina, altrimenti è solo
testo; letture che falliscono per RLS o SQL mancante = riga assente) e
"🕘 Storico" a richiesta (titolare: registro_azioni di preventivi e
progetti_tecnici raggruppato per modifica; tutti: commesse_storico e
motore_azioni_storico). Domande: restano i riquadri di js/62 (il cliente
non ha domande: sql/70 accetta solo progetti, preventivi, commesse). Nella
commessa i vecchi bottoni "Scheda cliente / Preventivo / Progetto
tecnico" del riepilogo sono sostituiti dai Collegati (tornano se js/63
manca). Test test/scheda-oggetto.spec.js (database locale): lo stesso
preventivo aperto da dashboard, Collegati del cliente, "🔍 Cerca" della
pagina Preventivi e avviso (apriRecordAvviso) deve avere gli stessi
data-azione-scheda e gli stessi bottoni visibili (titolare e commerciale,
fino a 3 stati), più commessa, progetto e cliente senza errori per 5
ruoli. Guide: info-tit-20, seg-22, con-13, ct-24, tec-20, com-18, rap-23,
ing-16. NON FATTO, in attesa di conferma di Toli (cambia il lavoro di 3
ruoli): una sola lista dei preventivi con filtri per ruolo al posto di
pg-preventivi, pg-preventivi-titolare, pg-preventivi-rapp, e
preventivo-detail al rappresentante (oggi non in PAGINE_RUOLO: le sue
schede hanno tab con costi e fornitori da nascondere prima).
REGOLA (piano del titolare): ogni oggetto nuovo usa questa scheda comune
(contenitore + caricaSchedaOggetto, le sue azioni dal motore o da
registraAzioneScheda, le sue fonti con registraFonteCollegati, il suo
Storico) e ha la sua rotta (una riga in SCHEDE_CON_INDIRIZZO di js/47).
"Entra come", parte 1 (F14.17, js/01 + js/10 + js/58, index.html, style.css,
NESSUN SQL; decisione D13): boot(ud, utenteForzato) salva ME_REALE e
ROLE_REALE (chi ha fatto il login) e, se il ruolo reale è titolare (anche
l'informatico), mette in ME e ROLE la persona scelta (ENTRA_COME; utente
attivo, non sé stessi, non titolare/informatico: RUOLI_ENTRA_COME). Scelta in
Impostazioni > Team, riquadro "👁️ Entra come" (si-entra-come-card, ec-ruolo
propone per primo l'utente di prova del ruolo = nome, cognome o email con
prova/test/smoke, ec-utente) e bottone "👁️ Entra come" su ogni riga del Team
(loadTeam chiama mostraSelettoreEntraCome). entraCome(id) salva l'id in
sessionStorage (toli_entra_come: solo quella scheda del browser, resta
ricaricando) e ricarica la pagina dalla dashboard: js/19 → boot → di nuovo
"come"; banner fisso in fondo "👁️ Stai lavorando come …" (entra-come-banner,
anche a 390 px) con "↩️ Esci" (esciDaEntraCome: toglie la chiave e rifà boot
con il titolare); doLogout toglie la chiave. Ricaricare invece di rifare
boot in memoria: nessun dato letto come titolare resta nelle cache dei
moduli. Mentre si è "come" campanella, avvisi in "Cosa tocca a me"
(leggiMieiAvvisi restituisce null) e notifiche sono spenti. LIMITE fino a
F14.18 (intestazione x-agito-come con global.fetch, ruolo_corrente
ridefinita): il database risponde ancora al titolare. Test
test/entra-come.spec.js (database locale): login diretto contro "Entra
come" per 7 ruoli, menu e pagine permesse uguali; testo delle pagine del
menu uguale per commerciale, capo tecnico, ingegnere, contabile; differenze
solo dove filtra il database (rappresentante: trattative, progetti, impegni
del team; segreteria: conteggi dei presidi; tecnico: un nome nel
calendario). Guida titolare info-tit-21.
"Entra come", parte 2 (F14.18, js/01 + style.css + index.html;
sql/71-entra-come ESEGUITO il 06/11 (backup pre71, controllo in regola), richiede
07, 47, 67; 68 facoltativo; provato sul backup pre70 + sql/70 e il suo
-REGISTRO-CANCELLAZIONI il 06/11). Sito: il client db di js/01 ha
global.fetch = fetchConAgitoCome: mentre si è "come" OGNI richiesta
(PostgREST, RPC, storage, funzioni) porta x-agito-come = id della persona
(solo l'id, non "ruolo|id": sql/67 in produzione accetta id o ruolo, così
prima di sql/71 nulla si ferma); dbPublic mai. Banner: "il database applica
i limiti del ruolo" o "solo il sito: il database risponde ancora a te"
(verificaEntraComeDatabase: rpc ruolo_corrente con l'intestazione = ruolo
della persona). Campanella e notifiche
restano spente mentre si è "come". Database (sql/71): ruolo_corrente() (UN
punto per tutte le policy, get_user_role, is_titolare, verifica_ruolo)
restituisce il ruolo impersonato; ruolo_reale() legge ora utenti (regola di
sql/07); agito_come_risolto() interna (formati "<id>", "<ruolo>|<id>",
"<ruolo>"; solo se il ruolo VERO è titolare, utente attivo, ruolo
coerente; altrimenti 42501 "Solo il titolare può agire come un altro
ruolo", anche per anon); ruolo_effettivo e agito_come_utente di sql/67 la
usano; agito_come_intestazione con lettura veloce (niente JSON senza
intestazione); funzione NUOVA utente_effettivo() (persona impersonata,
altrimenti auth.uid()) messa al posto di auth.uid() in TUTTE le policy di
public (69 nel backup pre70) e in tutte le funzioni di public che leggono
auth.uid() (121: RPC, trigger, cliente_visibile...; riscritte da
pg_get_functiondef, stessa firma, permessi e commenti), TRANNE: registra_azione
(autore vero: utente_reale, nome e ruolo_reale = titolare; agito_come_ruolo
e agito_come_utente = la persona; registra_azione legge ora ruolo_reale),
utenti_blocca_escalation, nome_utente_corrente, appuntamento_nome_utente,
utente_corrente_nome_ruolo (i NOMI negli storici restano di chi agisce:
"Brixhildo Toli" con il ruolo commerciale), registra_/togli_/
stato_dispositivo_push, motore_applica (solo ruolo_reale nello storico del
motore). get_mio_utente_id() = persona impersonata. Campi proprietà: quelli scritti dal sito (ME.id) e dal database
(creato_da, chiuso_da, da_id...) sono della persona. LIMITE: le policy di
storage.objects non si toccano (ruolo della persona se lo storage passa le
intestazioni, persona = titolare). REGOLA: policy e funzioni NUOVE usano
public.utente_effettivo() al posto di auth.uid(); una funzione ridefinita
copiando un file vecchio torna ad auth.uid() (vale il titolare: più
stretto, mai più largo). Report del venerdì (F24.2): le azioni "come" sono
le righe di registro_azioni con agito_come_ruolo non vuoto. Prove:
sql/71-entra-come-PROVA.sql (solo database di prova, rollback: senza
intestazione tutto uguale, 700 letture tabella x ruolo uguali tra persona e
titolare "come", come commerciale salva_regola del margine minimo rifiutata
42501, invio di un preventivo "come" con registro "Brixhildo Toli come
commerciale", tecnico, segreteria e anon con l'intestazione rifiutati,
formati); matrice dei permessi TUTTO OK senza intestazione e con
MATRICE_AGITO_COME=1 (sql/matrice-permessi.sh: ogni ruolo provato come
titolare + x-agito-come; senza sql/71 la stessa prova dà 1.112 caselle
DIVERSO); PostgREST con curl (tecnico 403 42501, salva_regola 403);
test/entra-come.spec.js per 7 ruoli con sql/71: x-agito-come su ogni
richiesta, pagine UGUALI a quelle della persona (prima di sql/71 restano le
differenze di F14.17); smoke test TUTTO OK con e senza sql/71. Rollback
(drop function: editor SQL) riporta policy e funzioni al testo di prima
(confrontato: identico) e si può rieseguire il 71 dopo. Guida titolare
info-tit-21.
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
Dopo sql/255 (storico presidi da Esegui intervento, ESEGUITO il 04/11, backup pre255; policy con alter policy, nessun
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
Nomi visibili nel gestionale (decisione di Erika del 09/11, supera
quella del 26/10): il ruolo commerciale nel gestionale si chiama
"Acquisti" ovunque si veda (etichetta dei ruoli, select, guide, testi);
solo l'etichetta: il codice resta commerciale (utenti.ruolo, ROLE,
PAGINE_RUOLO, id guida-commerciale e info-com-N, valori nel database).
"Rappresentante" resta così; le etichette servono solo a non mostrare
codici grezzi (es. "Capo tecnico"). Soglia 3.000 € del rappresentante: resta fissa nel
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
  ore-cantiere, info, decisioni (F14.7, voce "⚖️ Decisioni" nel menu, js/60); da F13.3 anche fornitori, progetti,
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
inserimento, modifica, cancellazione: 10 righe, una per ruolo più anon,
valori si/no, nota facoltativa; F14.13, vedi "Matrice dei permessi" qui
sotto) e (3) il trigger del registro delle azioni (chi, quando,
cosa è cambiato; F14.11, sql/67): nel file sql/NN
`create trigger trg_registro_azioni after insert or update on
public.<tabella> for each row execute function public.registra_azione();`
(la tabella deve avere la colonna id; colonne da non registrare come
argomenti) e la versione "or delete" (create or replace trigger) nel suo
file -REGISTRO-CANCELLAZIONI, da eseguire dall'editor. Finché sql/67 non
è in produzione il trigger va nel file -REGISTRO-CANCELLAZIONI o si
scrive nel file che va aggiunto. Più il rollback e la riga nell'elenco
"Tabelle Supabase" qui sopra. Una tabella senza queste tre cose non si
esegue in produzione.
Matrice dei permessi (F14.13, nel repository sql/): `sql/matrice_permessi.csv`
(tabella;ruolo;lettura;inserimento;modifica;cancellazione;nota, separatore
";", niente ";" nelle note) con le 93 tabelle del backup pre66 + sql/66 e
le 6 di sql/67-68 (registro_azioni, motore_*: segnalate "non ancora nel
database" finché non si eseguono). Controllo: `zsh sql/matrice-permessi.sh`
sul database di PROVA (predefinito il Postgres locale dello smoke test,
container toli-smoke-db, `MATRICE_CONTAINER=<nome>` per un altro; dopo
F14.8 `MATRICE_DB_URL=<progetto di prova>` e `MATRICE_UTENTI=ruolo=email,...`
per i 9 utenti di prova; la produzione è rifiutata), circa 20 secondi.
Per ogni ruolo entra come un utente vero (authenticated/anon con
request.jwt.claims) e prova select, update set chiave = chiave, delete,
insert (copia di una riga, poi con le colonne verso utenti = chi prova,
poi default values) dentro una transazione annullata; un trigger che
ferma la prova = rifatta con i trigger spenti (la matrice controlla
grant e policy, il messaggio va in nota); tabella vuota = policy valutate
su una riga vuota (si solo per le regole per ruolo). Esito: righe
"DIVERSO: <tabella> | <ruolo> | <operazione> | atteso .. | trovato ..",
"MANCA NELLA MATRICE: <tabella>" (tabella nuova senza righe), ultima riga
"ESITO: TUTTO OK" (uscita 0), "INCOMPLETO" (un ruolo senza utente) o
"ERRORI in N caselle (tabelle: ...)" (uscita 1). Righe nuove: eseguire il
sql/NN sul database di prova, `zsh sql/matrice-permessi.sh --genera`
(scrive la matrice trovata, le note restano), rileggere con git diff che
sia quella VOLUTA, poi commit nel repository sql. Logica in
sql/matrice-permessi-controllo.sql (solo con lo script: usa \copy).
Provato il 05/11 sul backup pre66 + sql/66 (e + 67, 68 e i loro
-REGISTRO-CANCELLAZIONI, poi i rollback): TUTTO OK; policy sbagliate di
proposito (lettura di preventivi per tutti, cancellazione di ordini_lavoro
al tecnico, lettura di fatture_pagamenti, vuota, all'ingegnere) segnalate
DIVERSO con il nome della tabella.
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
   database: sql/255-storico-presidi-esegui-intervento (ESEGUITO il 04/11, backup pre255, con
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

