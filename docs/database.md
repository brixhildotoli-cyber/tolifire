# Database: tabelle, SQL eseguiti, fila delle richieste

Spostato da CLAUDE.md il 18/11/2026 (riordino della documentazione), testo invariato.

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
Dopo sql/82-foto-video (F15.9 foto e video, ESEGUITO il 10/11 con il -VINCOLO dall'editor (backup pre82fv, controllo in regola): prima si PUBBLICA il
sito, poi backup, anteprima, 82-foto-video.sql (senza parole di
cancellazione, server MCP), controllo, 82-foto-video-VINCOLO.sql dall'EDITOR
(drop e add del vincolo del tipo), di nuovo il controllo; richiede 07, 71,
75-79; stesso numero 82 di F15.8, dato due volte dal piano: si cita per nome
intero): nessuna tabella nuova. progetti_tecnici_allegati: colonna NUOVA
impronta (SHA-256 del file originale, 64 esadecimali, indice UNICO
progetti_tecnici_allegati_impronta_unica per progetto, obbligatoria sui file
nuovi del sito, fissa; i file di prima senza) e, con il -VINCOLO,
progetti_tecnici_allegati_mime_type_check con video/mp4 e video/quicktime.
Bucket progetti-tecnici: 50 MB (prima 10) e i due tipi video.
lavorazioni_documenti (dati): 7 righe "Foto d'insieme del luogo dei lavori" (2
foto) e 5 "Video del luogo dei lavori (720p, massimo 2 minuti)" (porte REI,
compartimentazione, vernice, rilevazione, spegnimento). Nella scheda
dati.foto_video.<id riga del catalogo> = { allegati, mancanza }. Trigger NUOVI
trg_progetti_tecnici_allegati_impronta, trg_progetti_tecnici_schede_foto_video,
trg_progetti_tecnici_posizioni_foto, trg_progetti_tecnici_invio_foto_video.
Dopo sql/83 (F15.13 smistamento automatico per famiglia, ESEGUITO l'11/11 con il -REGISTRO-CANCELLAZIONI (backup pre83, controllo in regola): backup,
anteprima, 83-smistamento-automatico-famiglia.sql (server MCP), poi
-REGISTRO-CANCELLAZIONI dall'editor, poi il controllo; richiede 07, 21, 48,
62, 65, 67, 71, 75, 76, 78, 79, 82-blocco, tutti in produzione; conviene
PUBBLICARE IL SITO PRIMA): regole_smistamento (regole: tipo importo_progetto,
fuori_catalogo, famiglia, campo con condizioni jsonb, numero_posizioni;
attiva, ordine; lettura per tutti gli utenti attivi, scrive solo
salva_regola_smistamento del titolare, nessuna cancellazione),
regole_smistamento_storico (registro creata/modificata/disattivata/
riattivata con prima e dopo; sola lettura del titolare, immutabile).
progetti_tecnici_schede: colonne NUOVE stato_smistamento ('acquisti',
'ingegnere', 'verificata'; vuota = mai smistata o blocco comune),
smistamento_motivo, smistamento_il (le scrive solo il database); policy
RESTRITTIVA progetti_tecnici_schede_smistamento_acquisti (Acquisti non legge
né cambia le schede gialle) e permissive progetti_tecnici_schede_lettura_
smistamento e progetti_tecnici_allegati_lettura_smistamento (Acquisti legge
schede verdi, blocco comune e file del progetto ancora in verifica tecnica).
progetti_tecnici.stato: valori invariati. Matrice: 20 righe nuove.
Dopo sql/84 (F15.14 migrazione dei progetti e preventivi aperti, T2, ESEGUITO
l'11/11 dal server MCP (backup pre84, controllo in regola: 1 scheda all'ingegnere, 15 verificate, Da preventivare 3 invariato); era: backup, anteprima in fondo al file con l'elenco a Toli, "CONFERMATO
DA TOLI: sql/84", file (un solo blocco, senza parole di cancellazione, server
MCP), controllo in fondo; richiede 83): nessuna tabella, colonna, funzione o
policy nuova (matrice invariata). Solo dati: progetti_tecnici_schede.
stato_smistamento (con motivo "Inviato prima dello smistamento automatico: ..."
e smistamento_il = aggiornato_il del progetto) sulle schede dei progetti mai
smistati in in_verifica_tecnica (ingegnere), pronto_per_preventivo o passati
dall'ingegnere secondo progetti_tecnici_storico (verificata), altrimenti
inviato_a_commerciale/in_preventivazione (acquisti). progetti_tecnici.stato e
preventivi NON cambiano.
Dopo sql/258 (sconto del rappresentante sul preventivo, decisioni di Erika
del 10/11, fuori piano; ESEGUITO l'11/11 dal server MCP + -REGISTRO-CANCELLAZIONI dall'editor (backup pre258, controllo in regola): pubblicare il sito, backup, anteprima,
258-sconto-rappresentante.sql (senza parole di cancellazione, server MCP),
258-...-REGISTRO-CANCELLAZIONI.sql dall'EDITOR, controllo in fondo al file;
richiede 07, 10, 22, 25, 44, 67, 71; si ferma se annulla_leggi_riga o
motore_leggi_riga sono eseguibili da authenticated/anon, come nel container
di prova: in produzione no): preventivi_sconti (storico degli sconti con
la MOTIVAZIONE: lettura SOLO titolare/informatico e il rappresentante che
l'ha scritta, da_id = utente_effettivo(); Acquisti, segreteria e gli altri
no, nemmeno da console; la scrive solo applica_sconto_preventivo, non si
modifica; con il -REGISTRO-CANCELLAZIONI segue a cascata il preventivo).
preventivi: sconto_perc (c'era, mai usata: ora lo sconto applicato, vincolo
0 <= x < 100) e colonne NUOVE totale_prima_sconto, sconto_da,
sconto_da_nome, sconto_il (lette da chi legge il preventivo; le scrive solo
la RPC, il trigger trg_preventivi_00_sconto rifiuta le scritture dirette).
Dopo sql/87 (F15.17 controllo dei progetti doppi, ESEGUITO l'11/11 dal server MCP insieme a sql/262 (backup pre87, controllo in regola): backup,
anteprima in fondo, 87-controllo-duplicati.sql (senza parole di
cancellazione, server MCP), controllo; richiede 07, 65, 71): nessuna tabella
nuova, nessuna colonna, nessuna policy, matrice invariata. Il motivo di "Crea
comunque" va in progetti_tecnici_storico (tipo_evento 'doppione_confermato',
lo scrive solo la RPC registra_doppione_progetto); avvisi: tipo nuovo
'progetto_doppione' (al titolare).
Dopo sql/226 (F15.22 agenti esterni e venditore interno, decisione E2, approvata
da Erika il 12/11 come SOLA ETICHETTA; ESEGUITO il 12/11 (backup pre88-265, controllo in regola) con "CONFERMATO DA TOLI:
sql/226"): nessuna tabella nuova (matrice invariata). utenti: colonne NUOVE
esterno (boolean not null default false: Agente esterno / Venditore interno) e
partita_iva_venditore (facoltativa, 11 cifre, vincolo
utenti_partita_iva_venditore_check); le scrive SOLO il titolare (trigger
trg_utenti_esterno), lette da tutti come le altre colonne di utenti.
Dopo sql/89 (F15.19 coda dell'ingegnere, VERSIONE RIDOTTA decisa da Erika il
12/11; ESEGUITO il 12/11 (backup pre88-265, controllo in regola) con "CONFERMATO DA TOLI: sql/89"): nessuna tabella nuova,
matrice invariata. progetti_tecnici: colonna NUOVA urgente (boolean, default
false; la cambia SOLO il titolare, trigger trg_progetti_tecnici_urgente).
Dopo sql/263 (campi vernice e porte REI, richiesta di Erika del 12/11; ESEGUITO il 12/11 (backup pre88-265, controllo in regola)
): nessuna tabella, colonna o policy nuova, matrice invariata.
lavorazioni_campi (dati): 6 menu nuovi facoltativi, voci in fondo a elemento e
stato_supporto, etichetta di profilo, superficie non più "serve al prezzo"
(regola "basta uno" in controlli_invio_progetto, vedi "Dopo sql/263").
Dopo sql/91 (F15.21 proposte di nuovi campi, approvata da Erika il 12/11; ESEGUITO il 12/11 (backup pre88-265, controllo in regola)
con "CONFERMATO DA TOLI: sql/91", poi il -REGISTRO-CANCELLAZIONI
dall'editor; richiede 07, 67, 71, 75): lavorazioni_proposte_campi (proposte
dell'ingegnere: lavorazione, etichetta, tipo numero/menu/si_no/testo, unità,
valori del menu, uso a valle, nota, stato in_attesa/approvata/rifiutata, chi
propone e chi decide con nomi copiati, motivo del rifiuto, campo nato e suo
codice; lettura SOLO titolare (informatico) e ingegnere, nessuna scrittura
diretta: solo le RPC di sql/91; cancellazione bloccata dal
-REGISTRO-CANCELLAZIONI). Matrice: 10 righe nuove.
Dopo sql/264 (oggetto e nota del preventivo, richiesta di Erika del 12/11; ESEGUITO il 12/11 (backup pre88-265, controllo in regola)
): nessuna tabella nuova, matrice invariata. preventivi: colonne NUOVE
oggetto (una riga, max 200, vincolo preventivi_oggetto_check) e
nota_introduttiva (max 2000, preventivi_nota_introduttiva_check), facoltative;
le scrive chi oggi scrive il preventivo, dopo l'esito solo il titolare
(trigger trg_preventivi_oggetto_nota); colonne NUOVE computo_path
('<id>/computo/<file>' .xlsx/.xls/.csv/.pdf dello stesso preventivo, vincolo
preventivi_computo_path_check) e computo_nome (max 255,
preventivi_computo_nome_check), facoltative: le scrivono solo titolare e
Acquisti autore, dopo l'esito solo il titolare (stesso trigger). Bucket
preventivi-documenti: cartella NUOVA <id>/computo/ con 4 regole dei file
(lettura, caricamento, eliminazione e la restrittiva _dopo_esito); vedi
"Dopo sql/264".
Dopo sql/265 ("Quantità x UM" delle voci, richiesta di Erika del 12/11; ESEGUITO il 12/11 (backup pre88-265, controllo in regola)
): nessuna tabella nuova, matrice invariata. preventivi_voci: colonna
NUOVA quantita_um (testo libero facoltativo, max 50, una riga, vincolo
preventivi_voci_quantita_um_check; nessun calcolo); la scrive chi oggi scrive
le voci, dopo l'esito solo il titolare (trigger trg_preventivi_voci_quantita_um);
vedi "Dopo sql/265".
Dopo sql/93 (F16.2 catalogo stabile, approvata da Erika il 13/11; DA ESEGUIRE
con "CONFERMATO DA TOLI: sql/93", dall'EDITOR: contiene "before delete"):
nessuna tabella nuova, matrice invariata. prodotti_catalogo: vincolo unico su
codice (c'era già: prodotti_catalogo_codice_key), indice UNICO NUOVO
prodotti_catalogo_codice_normalizzato_unico (upper(btrim(codice))), vincolo
NUOVO prodotti_catalogo_codice_check (codice non vuoto), trigger NUOVO
trg_prodotti_catalogo_niente_cancellazione (un prodotto usato in
ddt_righe.prodotto_id non si cancella dal sito) e trg_registro_azioni; vedi
"Dopo sql/93".
Dopo sql/98 (F16.7 motore unico dei PDF da modello; ESEGUITO il 13/11
(backup pre98, controllo in regola): file principale dal server MCP, poi il
-REGISTRO-CANCELLAZIONI dall'editor): modelli_pdf (modelli dei PDF NUOVI:
codice fisso, nome, descrizione, titolo, blocchi di testo fissi
[{"chiave","etichetta","testo"}], revisione data dal database, attivo, chi e
quando; lettura per tutti gli utenti attivi, nessuna scrittura diretta: solo
salva_testi_modello_pdf del titolare; i modelli nascono da un file sql/NN;
cancellazione bloccata dal -REGISTRO-CANCELLAZIONI); vedi "Dopo sql/98".

Usate dal frontend — richieste di acquisto (sql/268, richiesta di Erika del
13/11; ESEGUITO il 13/11 con il -REGISTRO-CANCELLAZIONI, backup pre100):
richieste_acquisto
(richiesta di materiale del capo tecnico ad Acquisti: anno, numero, codice
RA-AAAA-NNN, oggetto, note, righe jsonb [{descrizione, quantita, unita,
note}] SENZA prezzi né fornitore, stato inviata_acquisti → presa_in_carico →
inviata_fornitore → arrivata | annullata, chi e quando di ogni passo;
lettura titolare, commerciale, capo_tecnico, segreteria; nessuna scrittura
diretta, solo le RPC di sql/268); vedi "Dopo sql/268".

Usate dal frontend — mezzi (sql/129, F17.13, ESEGUITO il 16/11 con il -REGISTRO-CANCELLAZIONI): mezzi_multe
(multe dei mezzi aziendali: mezzo, data, ora, luogo, verbale, importo,
notifica, scadenza per comunicare il conducente = notifica o data + 60 giorni
dal database, conducente con nome copiato, conducente proposto, comunicato il,
pagata il, importo pagato, addebito azienda/conducente SOLO del titolare con
chi e quando, nota, annullata con motivo; lettura, inserimento e modifica
DIRETTI di titolare, segreteria, capo_tecnico, nessuna cancellazione);
colonne nuove mezzi_attrezzature.fermo_dal e fermo_causa; vedi "Dopo sql/129".

Usate dal frontend — resi (sql/147, F18.21, ESEGUITO il 16/11 con il -REGISTRO-CANCELLAZIONI): ordini_fornitori_resi
(reso di materiale sbagliato, danneggiato o mancante di un ordine arrivato:
problema, descrizione, voci jsonb, foto jsonb della cartella "ordini" della
commessa, stato segnalato → reso_inviato → chiuso con esito, riordino
collegato, causale SOLO del titolare con chi e quando; lettura per chi legge
l'ordine, nessuna scrittura diretta: solo le RPC di sql/147); vedi "Dopo sql/147".

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
\#nav .nr (anche sul telefono; rossa con scaduti), finestra m-avvisi
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
service worker sw.js (in F14.6 solo push e notificationclick, nessuna cache; da F15.11 anche cache dell'app, librerie e dati e registrazione per tutti, vedi "App installabile offline";
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
dei dati normativi [NOTA 11/11: con sql/259, ESEGUITO l'11/11, la fonte del
rilievo mancante NON blocca più l'invio: la scrive il database
'sopralluogo_toli'; il rappresentante non vede più il campo, vedi "Dopo
sql/259"; NOTA 11/11: con sql/261, ESEGUITO l'11/11, il blocco dei dati normativi
senza fonte NON vale più per il RAPPRESENTANTE (anche "come"), vedi "Dopo
sql/261"], ESEGUITO il 09/11 (backup pre79, dal server MCP, controllo in regola): backup, anteprima in fondo al file,
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
Dopo sql/82 (F15.8 blocco comune e controlli di invio [NOTA 11/11: con sql/261,
ESEGUITO l'11/11, il blocco dei dati del prezzo NON vale più per il RAPPRESENTANTE,
anche "come"; vedi "Dopo sql/261"], ESEGUITO il 09/11 (backup pre82, dal server MCP, controllo in regola): backup,
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
Dopo sql/82-foto-video (F15.9 foto e video delle schede di rilievo [NOTA 11/11:
con sql/261, ESEGUITO l'11/11, il blocco delle foto e dei video all'invio NON vale
più per il RAPPRESENTANTE, anche "come"; impronta e foto doppie restano; vedi
"Dopo sql/261"], ESEGUITO
il 10/11 con il -VINCOLO dall'editor (backup pre82fv, controllo in regola); numero 82 dato dal piano anche a F15.8: il file si chiama sempre
"sql/82-foto-video"). ORDINE: 1) PUBBLICARE il sito (dopo il file il database
vuole l'impronta su ogni file nuovo dei progetti: il sito vecchio non la manda,
"Manca l'impronta del file: ricarica la pagina"); 2) backup, anteprima in
fondo, 82-foto-video.sql (senza parole di cancellazione, server MCP),
controllo in fondo (video_ammessi false); 3) 82-foto-video-VINCOLO.sql
dall'EDITOR SQL (toglie e rimette progetti_tecnici_allegati_mime_type_check
con video/mp4 e video/quicktime), controllo (video_ammessi true). Nessun
-REGISTRO-CANCELLAZIONI (nessuna tabella nuova), matrice invariata; richiede
07, 71, 75, 76, 77, 78, 79 (si ferma senza), non 80-81 né 82-blocco.
RPC del sito: foto_video_attivi() (esiste = file eseguito; true = i video si
caricano, cioè -VINCOLO eseguito), foto_video_mancanti_progetto(p_progetto)
(SECURITY INVOKER: righe scheda_id, scheda, campo 'documento_<id>', etichetta,
motivo; vuota = si invia; vuota con fonte del rilievo misure_dichiarate; righe
"per posizione" = ogni posizione P-xx non tolta; video non contati senza il
-VINCOLO). Funzioni: mime_adatto_documento(mime, tipo) (foto = image/*, video
= video/*), motivo_foto_mancante(motivo) (etichetta o null: cliente_non_autorizza,
area_riservata, non_raggiungibile, opera_da_realizzare, rilievo_da_documenti,
altro con nota), interne uso_file_progetto (dove è già usato un file: posizione
non tolta o voce di una scheda) e i 4 trigger (security definer, editor
libero): trg_progetti_tecnici_allegati_impronta (impronta minuscola,
obbligatoria per gli utenti del sito sugli insert, fissa, doppione nello stesso
progetto = 23505 "Questo file è già tra i file del progetto («...»): la stessa
foto non vale per due posizioni"), trg_progetti_tecnici_schede_foto_video
(voci di dati.foto_video scritte o cambiate: solo rappresentante, ingegnere,
titolare, 42501 anche per Acquisti con la policy "commerciale aggiorna rilievi
tecnici" e titolare "come" Acquisti; riga del catalogo della lavorazione; file
del progetto, del tipo giusto, non già in un'altra voce, scheda o posizione;
nome/percorso/mime dal database; mancanza con motivo dalla lista, "altro" con
nota, chi e quando dal database (restano se motivo e nota non cambiano); voce
vuota tolta; upsert del sito nel ramo update), trg_progetti_tecnici_posizioni_foto
(foto nuove di una posizione: file del progetto, immagine o video, non già in
un'altra posizione non tolta o in una voce di scheda),
trg_progetti_tecnici_invio_foto_video (BEFORE UPDATE OF stato, da bozza o da
integrare verso in_verifica_tecnica, inviato_a_commerciale,
pronto_per_preventivo: 22023 "Invio bloccato, foto e video mancanti: ...";
scatta dopo trg_progetti_tecnici_invio_completo). Nel sito: js/56 (in fondo,
F15.9) verificaFotoVideoDisponibile, improntaFileProgetto (crypto.subtle,
file ORIGINALE), preparaFileProgetto (foto oltre 1,2 MB rimpicciolite con
ridimensionaFotoGiornale di js/35, video fino a 50 MB, il resto 10 MB),
caricaFileNelProgetto(progetto, utente, file, {cartella, prefisso}) = UNICA
strada per caricare un file del progetto (prima controlla l'impronta:
{doppione}), usata da js/17 salvaProgetto e caricaAllegatiDaVerifica (doppioni
saltati con l'elenco), js/66 caricaFotoPosizione (doppione = rifiuto) e dalle
fonti dei dati (doppione = si usa quel file); preparaInputVideoProgetto (accept
e nota "🎥 Video mp4 o mov fino a 50 MB: registra in 720p, massimo 2 minuti",
.fv-video-nota in index.html, chiamata all'apertura delle finestre del
progetto e della verifica); riquadro "📷 Foto e video" in fondo alla scheda del
motore (msm-foto-video, voci msm-fv-<id>: "x di N", file con 👁 Apri e ✖,
"📷 Scatta o scegli le foto" / "🎥 Registra o scegli il video" con capture,
"🚫 Non fotografabile" / "🚫 Video impossibile" msm-fvm-<id> con la nota
msm-fvn-<id>, "Segnato da ... il ..."; si salva con 💾 Salva scheda,
scriviFotoVideoNeiDatiMotore; un file già del progetto si può riusare con
conferma), avviso dopo il salvataggio "Mancano foto o video",
controllaFotoVideoPrimaDellInvio chiamata dagli invii di js/17 dopo le fonti e
i dati del prezzo; js/17 fileProgettoValido con mp4/mov solo con il
-VINCOLO. SCELTE DA CONFERMARE DA TOLI: 2 foto per scheda e 1 video nelle 5
lavorazioni come valori di partenza (si cambiano dal catalogo); impronta del
file originale (un altro scatto è un file diverso); "stessa foto" vale per
tutto il progetto, anche PDF e documenti (le fonti possono riusare un file già
usato da una foto richiesta); blocco solo all'invio del rappresentante;
progetti aperti con schede: al prossimo invio chiedono foto e video o il
motivo; motivi della lista. Guide info-rap-30, info-ing-25. Prove:
sql/82-foto-video-PROVA.sql (solo database di prova, rollback: file senza
impronta rifiutato, doppione rifiutato, stessa foto su un altro progetto
ammessa, impronta fissa, video mp4 40 MB e mov ammessi, webm rifiutato, invio
senza foto rifiutato anche al titolare "come" rappresentante, immagine come
video, stesso file due volte, file di un altro progetto, voce inventata,
Acquisti e titolare "come" Acquisti rifiutati, tecnico zero righe, stessa foto
su due posizioni e tra posizione e scheda, PDF come foto, invio con foto,
motivo inventato, "altro" senza nota, chi e quando dal database, misure
dichiarate, per posizione, editor libero); 79 e 82-blocco -PROVA spengono le
righe di lavorazioni_documenti nella loro transazione; test/foto-video.spec.js
(Chrome headless: rappresentante a 390 px senza foto fermato da sito e console,
2 foto e video mp4 di 40 MB salvati con l'impronta, stessa foto su P-01 e P-02
rifiutata dal sito e dalla console, inviato; console di Acquisti rifiutata;
ingegnere a 390 px "Video impossibile: Area riservata" con nota;
FOTO_VIDEO_SENZA_SQL=1 dopo il rollback); blocco-comune e motore-schede-fonti
spengono le righe del catalogo durante la prova; rollback provato (schema
identico; righe del catalogo spente; rieseguito il file: righe di nuovo
attive). Senza sql/82-foto-video: niente impronta, niente video, niente
riquadro né blocco, nessun errore (una chiamata RPC 404).
Dopo sql/83 (F15.13 smistamento automatico per famiglia, decisione di Toli
T2, ESEGUITO l'11/11 dal server MCP + -REGISTRO-CANCELLAZIONI dall'editor (backup pre83, controllo in regola); ORDINE: pubblicare il sito, backup, anteprima in fondo al
file, 83-smistamento-automatico-famiglia.sql (senza parole di cancellazione,
server MCP), 83-...-REGISTRO-CANCELLAZIONI.sql dall'EDITOR, controllo in
fondo al file: regole 8, attive 3, funzioni 11, trigger 6, policy 5;
richiede 07, 21, 48, 62, 65, 67, 71, 75, 76, 78, 79, 82-blocco, si ferma
senza). RPC del sito: smistamento_attivo() (almeno una regola attiva),
anteprima_smistamento(p_progetto, p_regola_prova) (SECURITY INVOKER, non
scrive: scheda_id, famiglia, numero, nome_scheda, lavorazione, esito
acquisti/ingegnere, motivi; regola di prova solo titolare; senza schede una
riga "ingegnere"), smista_progetto(p_progetto) (rappresentante del progetto o
titolare, da bozza/da integrare, regole attive: scrive lo stato delle schede
e porta il progetto in inviato_a_commerciale se tutte verdi, altrimenti
in_verifica_tecnica; blocchi di sql/79 e 82 come prima), smistamento_progetto
(p_progetto) (famiglie e stato senza i dati: titolare, ingegnere, Acquisti,
rappresentante del progetto), salva_regola_smistamento(p_id, p_regola, p_nota)
(solo titolare: aggiungi, modifica, attiva false = Disattiva; registro).
Interne: smistamento_condizione_vera, smistamento_controlla_regola,
progetto_smistato_ad_acquisti (per le policy), trigger
trg_progetti_tecnici_smistamento (con regole attive OGNI uscita da bozza, da
integrare o archiviato verso uno stato di lavoro: in_verifica_tecnica,
inviato_a_commerciale, pronto_per_preventivo, in_preventivazione,
in_valutazione, approvato, solo con smista_progetto: 42501 per ogni utente
del sito, anche il titolare; archiviare resta permesso e le schede
'ingegnere' restano nascoste ad Acquisti; con regole attive un progetto
NUOVO di un utente del sito che non è titolare né ingegnere, anche il
titolare "come" uno di loro, nasce solo fuori dagli stati di lavoro (bozza,
da integrare: 22023 "nasce in bozza"), tranne il lavoro extra creato da
registra_lavoro_extra di sql/38; il RAPPRESENTANTE, anche "come", porta il
progetto verso uno stato di lavoro da QUALUNQUE stato solo con
smista_progetto o le RPC che lo fanno già (sql/56
salva_preventivo_extra_rappresentante e lascia_preventivo_extra_al_commerciale,
anche da bozza; sql/57 rinvia_preventivo_al_commerciale_da_rappresentante),
riconosciute dalla pila delle chiamate (PG_CONTEXT): niente update diretto
da in_valutazione o approvato a inviato_a_commerciale (quarto controllo del
10/11); i passaggi di Acquisti (avvia il preventivo, Rimanda indietro),
dell'ingegnere e del titolare restano; editor libero), trg_progetti_tecnici_schede_smistamento (stato della scheda
solo dal database; scheda aggiunta durante la verifica = gialla),
trg_progetti_tecnici_smistamento_dopo (da in_verifica_tecnica a
in_preventivazione/pronto/inviato/in_valutazione/approvato: gialle →
'verificata' e, se c'è il preventivo, avviso 'smistamento_verificato' ad
Acquisti; verso da integrare, bozza, archiviato restano gialle; uscita da
bozza/da integrare/archiviato verso uno stato di lavoro SENZA
smista_progetto, a regole spente o dall'editor: stato,
motivo e data dello smistamento delle schede azzerati, così nessuna scheda
resta "all'ingegnere" nascosta ad Acquisti). Regole di partenza
ATTIVE: Lavoro grande (soglia vuota = leggi_regola('soglia_lavoro_grande'),
se vuota 30.000 €: tutto il progetto all'ingegnere; progetto senza importo
non scatta), fuori catalogo, vernice intumescente; SPENTE: porte REI classe
superiore (non scatterebbe mai: sql/82 ferma prima l'invio con "Classe
superiore / da definire", testo vietato su un campo del prezzo), doppia anta
oltre 180 cm, sostituzione, lana minerale, più di 30 posizioni. Uscita dalla
verifica tecnica (verso qualunque stato tranne da_integrare, bozza e
archiviato) con schede ancora 'ingegnere': solo ingegnere e titolare (42501
per gli altri ruoli del sito, anche titolare "come" Acquisti o
rappresentante; editor libero), così Acquisti, segreteria e rappresentante
non rendono "verificate" le gialle né saltano l'ingegnere da console (terzo
controllo del 10/11: prima si guardavano solo 3 stati di arrivo). LIMITE
NOTO, non corretto qui: i blocchi di invio di sql/79 (trg_progetti_tecnici_
fonti) e sql/82 (trg_progetti_tecnici_invio_completo, _invio_foto_video)
guardano ancora solo i 3 stati di arrivo: con le regole SPENTE da console si
salta in in_preventivazione/in_valutazione/approvato senza fonti, dati del
prezzo e foto (proposta: file a parte sql/83b con la sola lista degli stati,
in attesa di decisione). js/18 e js/63:
"↩ Rimanda indietro" non c'è (spiegazione al suo posto) finché il progetto
del preventivo è in verifica tecnica CON schede ancora all'ingegnere
(progettoConSchedeIngegnere di js/67, RPC smistamento_progetto; senza sql/83
o senza schede gialle come prima); in "Da preventivare" la riga "🟡 Altre
schede sono ancora dall'ingegnere" solo con schede gialle. SCELTE DA CONFERMARE DA TOLI: progetto senza schede
all'ingegnere; solo regole "gialle"; il preventivo nasce con le schede verdi
mentre il progetto resta all'ingegnere (in_verifica_tecnica, il progetto
non passa in preventivazione); l'ingegnere approva tutto il progetto (niente
"passa una famiglia"); file del progetto visibili ad Acquisti appena c'è una
famiglia verde; regole di partenza e valori spenti. Nel sito
(js/67-smistamento-famiglie.js, caricato dopo js/57-coda-offline):
verificaRegoleSmistamentoDisponibili (legge regole_smistamento, cache 60 s;
senza sql/83 una lettura 404), inviaProgettoConSmistamento (controlli di
js/56, allegato, conferma con dove va ogni scheda e perché, RPC),
aggiungiRiquadroSmistamento ("🚦 Smistamento automatico delle schede" in
Rilievi tecnici di js/17, nel preventivo di js/18 e nella Verifica tecnica);
Impostazioni > "🚦 Regole di smistamento" (si-smistamento-card, loadImp di
js/10, solo titolare: ➕ Aggiungi, ✏️ Modifica, ⏸ Disattiva / ▶️ Riattiva,
🧪 Anteprima su un progetto di prova anche con la regola non salvata,
📒 Registro; finestre m-regola-smistamento id rgs-, m-anteprima-smistamento
ans-, m-registro-smistamento rgr-). js/17: con regole attive niente "🔧
Invia a ufficio tecnico" né "📤 Invia ad Acquisti" da bozza/da integrare ma
"📤 Invia il progetto" (inviaProgettoAUfficioTecnico e
inviaProgettoAlCommerciale rimandano lì); avviso della soglia "tutto il
progetto va all'ingegnere" (regola spenta: nessun avviso); "Da preventivare"
anche con i progetti in verifica con schede verdi ("🚦 Per te: ...", senza
"Richiedi integrazione"), in ordine di arrivo; avviaPreventivo non cambia lo
stato di un progetto in verifica tecnica. js/46: "Progetti da preventivare"
con le stesse regole. Guide info-rap-33, info-com-22, info-ing-28,
info-tit-31. Prove: sql/83-...-PROVA.sql (solo database di prova, rollback:
porte + vernice, 35.000 €, senza schede, regole spente, ruoli rifiutati
anche "come", registro immutabile; rappresentante, Acquisti, segreteria e
titolare da bozza/da integrare/archiviato verso in_preventivazione,
in_valutazione, approvato rifiutati; Acquisti, rappresentante e titolare
"come" rappresentante da in verifica verso approvato rifiutati, titolare
ammesso con le gialle verificate; archiviato ammesso con le gialle nascoste
ad Acquisti; 104 controlli); 79, 82-blocco e 82-foto-video -PROVA
spengono le regole nella loro transazione; test/smistamento-famiglie.spec.js
(Chrome headless: rappresentante a 390 px, Acquisti, ingegnere, titolare;
SMISTAMENTO_SENZA_SQL=1 dopo il rollback); matrice TUTTO OK; rollback
provato (schema identico). Senza sql/83 o con tutte le regole spente: sito
come prima, nessun errore.
Dopo sql/84 (F15.14 migrazione dei progetti e preventivi aperti allo
smistamento automatico, decisione di Toli T2, ESEGUITO l'11/11 (backup pre84, controllo in regola); richiede 83, si
ferma senza): nessuna RPC, nessuna tabella, funzione o policy nuova; NESSUN
cambio nel sito (js invariati). ORDINE: backup (sql/BACKUP.md), ANTEPRIMA in
fondo al file (pg_temp.anteprima_84_progetti: un progetto aperto per riga
bozza/in_verifica_tecnica/da_integrare/inviato_a_commerciale/pronto/
in_preventivazione con cliente, rappresentante, importo, schede, "da
ricompilare", cosa_fa_sql84, regole_di_oggi (anteprima_smistamento, solo
informazione), preventivi; anteprima_84_preventivi: preventivi non chiusi con
gia_al_cliente = inviato o inviato_a_rappresentante; anteprima_84_conteggi) =
ELENCO DA MANDARE A TOLI, poi "CONFERMATO DA TOLI: sql/84", file (UN blocco
DO, senza parole di cancellazione: server MCP; da un utente del sito 42501),
CONTROLLO pg_temp.controllo_84. Cosa scrive: SOLO
progetti_tecnici_schede.stato_smistamento/smistamento_motivo/smistamento_il
(segno set_config toli.smistamento di sql/83) sulle schede non comuni dei
progetti in in_verifica_tecnica (→ 'ingegnere'), pronto_per_preventivo (→
'verificata'), inviato_a_commerciale e in_preventivazione (→ 'verificata' se
l'ultima uscita dalla verifica tecnica nello storico è dopo l'ultima uscita da
bozza/da integrare/archiviato, altrimenti 'acquisti'), solo se il progetto non
ha nessuna scheda già smistata; motivo "Inviato prima dello smistamento
automatico: ..." (è il segno del ROLLBACK), smistamento_il = aggiornato_il (o
creato_il) del progetto, così l'ordine di "Da preventivare" non cambia. NON
tocca: progetti_tecnici.stato (inviato_a_commerciale resta: js/17, sql/56,
sql/57), preventivi, bozza, da integrare, in valutazione, approvato,
archiviato, blocco comune; le regole non si riapplicano. CONTROLLI DENTRO IL
FILE (un errore = niente cambiato): nessuno stato fuori dai 9, conteggi per
stato uguali, "Da preventivare" (regole di js/17 e js/46 con lo smistamento
attivo) con gli stessi progetti, nessuna scheda verde in verifica tecnica;
rieseguibile (la seconda volta 0 schede). Effetti: Acquisti legge ora schede e
file dei progetti pronto_per_preventivo (✅, policy di sql/83); le schede in
verifica erano già chiuse per lui e restano chiuse; progetto in verifica con
preventivo in bozza: niente "↩ Rimanda indietro" per Acquisti finché
l'ingegnere non approva (poi ✅ e avviso smistamento_verificato); nelle carte di
"Da preventivare" dei progetti già da Acquisti può comparire "🚦 Per te". SCELTE
DICHIARATE (da confermare da Toli): "flag" dei preventivi già al cliente =
colonna dell'elenco e criterio scritto nel file (nessuna colonna nuova,
vincolo T2), lo stato inviato_cliente della fase 7 li prenderà con lo stesso
criterio; schede "da ricompilare" = avviso già esistente di sql/80-81 e js/56
(obbligatorie solo al prossimo invio, sql/79 e 82); progetti in verifica con
preventivo in bozza → 'ingegnere' (non verdi: "Da preventivare" resta uguale).
ROLLBACK: 84-...-ROLLBACK.sql (un blocco, senza parole di cancellazione):
schede con il motivo di sql/84 di nuovo non smistate (anche quelle diventate ✅
dopo), le altre e gli avvisi restano. Guida info-tit-33. Prove:
sql/84-migrazione-progetti-preventivi-aperti-PROVA.sql (solo database di prova,
transazione annullata: progetti di prova in verifica, verifica con preventivo
in bozza, pronto, preventivazione dopo l'ingegnere, ad Acquisti dalla bozza,
già smistato con sql/83, bozza, in valutazione; anteprima = risultato,
controllo, letture di Acquisti, rifiuti di rappresentante, Acquisti,
ingegnere, segreteria, tecnico, titolare e titolare "come" Acquisti,
riesecuzione senza cambi, approvazione dell'ingegnere con avviso, ROLLBACK);
test/migrazione-progetti-aperti.spec.js (Chrome headless, database locale:
"Da preventivare" di Acquisti e del titolare e "Cosa tocca a me" uguali prima
e dopo, riquadro 🚦 del titolare, console di titolare, Acquisti e ingegnere
rifiutata, ROLLBACK). Senza sql/84: sito come prima.
Dopo sql/262 (richiesta di Erika dell'11/11, ESEGUITO l'11/11 con sql/87, backup
pre87, controllo in regola): il rappresentante crea e modifica progetti tecnici
solo per i SUOI clienti anche da console: with check di progetti_rapp_insert e
progetti_rapp_update con public.cliente_visibile(cliente_id) (alter policy;
rollback 262-...-ROLLBACK.sql). In produzione 78 progetti dei rappresentanti,
0 su clienti non loro.
Dopo sql/87 (F15.17 controllo dei progetti doppi, ESEGUITO l'11/11 (backup pre87); era DA ESEGUIRE con "CONFERMATO
DA TOLI: sql/87": backup, anteprima in fondo al file, 87-controllo-duplicati.sql
(senza parole di cancellazione, server MCP), controllo in fondo; nessun
-REGISTRO-CANCELLAZIONI; richiede 07, 65, 71, tutti in produzione, si ferma
senza; il sito si pubblica prima o dopo). REGOLA DI ERIKA (11/11): SOLO UN
AVVISO, mai un blocco; la finestra del progetto resta com'era (titolo,
tipologia, descrizione, allegati, poi "🔧 Invia a ufficio tecnico" o "📤 Invia
ad Acquisti"); ingegnere e Acquisti invariati. RPC del sito (solo
rappresentante, sui clienti che vede, e titolare, anche "Entra come"; gli
altri 42501): progetti_simili_cliente(p_cliente, p_escludi) (security definer:
progetti non archiviati dello stesso cliente creati negli ultimi 90 giorni,
ANCHE di altri rappresentanti: solo id, titolo, tipologia, stato, data, nome
del rappresentante, mio, apribile = titolare o suo; max 20),
registra_doppione_progetto(p_progetto, p_esistente, p_motivo) (motivo 3-500,
progetto nuovo suo (rappresentante) o qualunque (titolare), progetto che c'era
dello stesso cliente, uno per progetto: riga 'doppione_confermato' nella
cronologia "Creato anche se lo stesso cliente aveva già il progetto «...» del
GG/MM/AAAA (di ...). Motivo: ..."; se chi crea è un rappresentante e il
progetto che c'era è di un ALTRO rappresentante, crea_avviso 'progetto_doppione'
al ruolo titolare, regola propria, rif = progetto nuovo; risponde
{registrato, avviso_titolare}). SCELTA (via più semplice): l'avviso al
titolare è un avviso di sql/65 (campanella e riga "🔔 Avvisi aperti" di Cosa
tocca a me), nessuna fonte nuova in js/46. Nel sito (js/17, nessun file
nuovo): salvaProgetto, SOLO per un progetto NUOVO e solo per rappresentante e
titolare, prima dell'insert chiama controllaProgettoDoppione (finestra
m-progetto-doppione, id pdp-: elenco con "📂 Apri quello che c'è" sui progetti
apribili, spiegazione su quelli di un altro rappresentante, motivo
obbligatorio per "➕ Crea comunque", Annulla = torna alla finestra senza
salvare); "Apri" chiude la finestra e apre quel progetto (il nuovo non si
crea, la bozza locale resta); dopo l'insert registraDoppioneProgetto (un
errore = toast, il progetto resta). Per "Crea comunque" si collega il primo
progetto di un altro rappresentante, se no il più recente. Cronologia del
progetto con ⚠️; TIPI_AVVISO di js/58 con ⚠️ Progetto doppio. SCELTE DA
CONFERMARE DA TOLI: 90 giorni fissi (non una regola); aperto = non archiviato
(anche approvato); la sede non conta (il progetto non ha sede_id, nasce sulla
commessa); avviso solo al titolare, non all'altro rappresentante; il
rappresentante vede titolo, stato e nome dei progetti degli altri
rappresentanti sullo stesso cliente. Guide info-rap-35, info-tit-34. Prove:
sql/87-controllo-duplicati-PROVA.sql (solo database di prova, rollback:
progetto di un altro rappresentante elencato non apribile, vecchio e
archiviato esclusi, motivo corto, altro cliente, altro rappresentante,
secondo motivo, insert diretto nella cronologia rifiutati, avviso al titolare
solo per il progetto di un altro, cliente non suo, ingegnere, Acquisti,
segreteria, titolare "come" Acquisti, anon rifiutati, titolare senza avviso a
se stesso, titolare "come" rappresentante); test/progetto-doppio.spec.js
(Chrome headless, rappresentante a 390 px; DOPPI_SENZA_SQL=1 dopo il
rollback); progetto-rappresentante e smoke TUTTO OK con sql/87 (smoke anche
senza); foto-video, motore-schede-fonti e smoke creano comunque se compare
l'avviso (questi due non rilanciati in F15.17); rollback
provato (schema identico). Senza sql/87: l'avviso elenca solo i progetti che
chi crea già legge (rappresentante: i suoi), nota "il motivo non si salva
ancora", nessun errore (una chiamata RPC 404).
Dopo sql/88 (F15.18 promemoria delle integrazioni, VERSIONE RIDOTTA decisa da
Erika l'11/11: "le funzioni esistenti sono volute, solo miglioramenti, niente
cambi di flusso"; ESEGUITO il 12/11 (backup pre88-265, controllo in regola) con "CONFERMATO DA TOLI: sql/88": backup,
anteprima in fondo al file, 88-integrazioni-motivo-promemoria.sql (senza
parole di cancellazione, server MCP), controllo in fondo; nessun
-REGISTRO-CANCELLAZIONI; richiede 62 e 64, si ferma senza; 65 per gli avvisi;
il sito si pubblica prima o dopo). "Richiedi integrazione" INVARIATO (nota
obbligatoria, niente motivo da lista, niente domande strutturate). C'ERA GIÀ
(sql/64-65): riga "Integrazione chiesta al venditore" con promemoria al
rappresentante dopo integrazione_venditore_gg (2 giorni lavorativi) e
risalita al titolare dall'inizio dopo integrazione_avviso_titolare_gg (7, ma
giorni DI CALENDARIO); si chiudono da sole quando il progetto esce da
da_integrare. IL FILE (solo dati, nessuna tabella, funzione, policy;
matrice invariata): integrazione_avviso_titolare_gg da 'giorni' a
'giorni_lav' (solo se ancora 'giorni'; valore invariato), riga in
regole_storico 'sql/88 (F15.18)...', sincronizza_scadenze() (le aperte non
ancora risalite si spostano). La regola integrazione_promemoria_ore (48 ore)
di sql/62 resta NON usata dal motore (il promemoria segue
integrazione_venditore_gg). Nel sito (js/46, nessun file nuovo):
integrazioniOltreTAM (scadenze aperte superate dei progetti ANCORA da
integrare), tempoRegolaTAM; riga "🔧 Progetti da integrare" del
rappresentante rossa con "di cui N da più di 2 giorni lavorativi"; riga NUOVA
del titolare "⏰ Integrazioni ferme dal rappresentante" (risale_il passata;
un progetto = la sua scheda, se no la pagina Progetti; anche in ⚖️
Decisioni); REGOLE_PREDEFINITE di js/01 con giorni_lav. Guide info-rap-36,
info-tit-35, info-com-24, info-ing-29 (e esempi di info-tit-12, -13). Prove:
sql/88-...-PROVA.sql (solo database di prova, rollback: 4/12 + 2 = 9/12, + 7
= 16/12; orologio di prova +1/+3/+6/+8 gg lav. con genera_avvisi_scadenza:
promemoria dopo 3, nessuna risalita a 6 (oltre 7 di calendario), risalita al
titolare a 8; progetto rimandato = scadenza e avvisi chiusi; rappresentante,
ingegnere, Acquisti, tecnico rifiutati su salva_regola e update di regole e
scadenze); test/integrazioni-promemoria.spec.js (Chrome headless,
rappresentante a 390 px, titolare, ingegnere e Acquisti a 390 px;
INTEGRAZIONI_SENZA_SQL=1 senza il file); 64-PROVA accetta 11/12 o 16/12
secondo l'unità; smoke TUTTO OK senza sql/88. Senza sql/88: avviso al
titolare dopo 7 giorni di calendario come prima, nessun errore.
Dopo sql/226 (F15.22 agenti esterni e venditore interno, decisione di Toli E2;
approvata da Erika il 12/11 come SOLA ETICHETTA: stesso ruolo rappresentante,
stesse pagine, stessi bottoni, stessi clienti; provvigioni uguali, E12). ESEGUITO il 12/11 (backup pre88-265, controllo in regola)
con "CONFERMATO DA TOLI: sql/226": backup, anteprima in fondo al file,
226-agenti-esterni-venditore-interno.sql (senza parole di cancellazione, server
MCP), controllo in fondo; nessun -REGISTRO-CANCELLAZIONI; richiede 07 e 71, si
ferma senza; il sito si pubblica prima o dopo. Nessuna RPC, nessuna policy
nuova o cambiata (PAGINE_RUOLO.rappresentante e policy di sql/08 identiche).
Colonne utenti.esterno (default false = Venditore interno) e
utenti.partita_iva_venditore (null o 11 cifre; il trigger toglie spazi, punti,
trattini e "IT", vuota = null). Trigger trg_utenti_esterno (BEFORE INSERT OR
UPDATE OF esterno, partita_iva_venditore; security definer): solo
ruolo_corrente() = 'titolare' (informatico compreso), 42501 per gli altri ruoli
del sito, compreso il rappresentante sulla propria riga (utenti_update gli
lascia aggiornare sé stesso: telefono come prima) e il titolare "Entra come";
editor libero. Chi e quando: registro delle azioni di sql/67 (già su utenti).
SCELTA DICHIARATA: utenti_select è "true" per authenticated, quindi le due
colonne le leggono tutti gli utenti del sito (come nome, email, telefono).
Nel sito (js/10, nessun file nuovo; js/17 non toccato): nel Team accanto al
ruolo dei Rappresentanti "Venditore interno" / "Agente esterno" e la P.IVA
(htmlVenditoreEsterno), per il titolare "🏷️ Interno/esterno"
(apriVenditoreEsterno, finestra m-venditore-esterno, id vde-, salvaVenditoreEsterno
con update diretto; P.IVA controllata anche nel sito). Senza sql/226 le colonne
non arrivano nella select * del Team: niente etichetta né bottone, nessun
errore. Guide info-rap-37, info-tit-38. Prove:
sql/226-agenti-esterni-venditore-interno-PROVA.sql (solo database di prova,
rollback: titolare e informatico, P.IVA normalizzata e sbagliata 23514,
registro, rappresentante sulla propria riga 42501 e telefono sì, altro
rappresentante 0 righe, segreteria, Acquisti, capo tecnico, tecnico, ingegnere,
contabile 42501, titolare "come" rappresentante e segreteria 42501, insert,
stessi conteggi di clienti/progetti/preventivi/commesse/trattative da interno
e da esterno, solo i clienti visibili); test/venditore-esterno.spec.js
(Chrome headless, rappresentante a 390 px prima e dopo: menu, PAGINE_RUOLO,
conteggi e bottoni uguali; titolare nel Team; console rifiutate;
VENDITORE_SENZA_SQL=1 dopo il rollback); smoke TUTTO OK con e senza sql/226;
matrice invariata; rollback provato (schema identico con pg_dump).
Dopo sql/89 (F15.19 coda dell'ingegnere, tempi e urgenza, VERSIONE RIDOTTA
decisa da Erika il 12/11: "solo informazioni in più, l'ingegnere lavora come
oggi"; NON FATTI il controllo a campione 1 su 10 e la colonna
campione_ingegnere (smistamento spento da sql/260), corsie nuove, cambi a
bottoni o passaggi di ingegnere e Acquisti; ESEGUITO il 12/11 (backup pre88-265, controllo in regola) con "CONFERMATO DA
TOLI: sql/89": backup, anteprima in fondo al file,
89-coda-ingegnere-campione-tempi.sql (senza parole di cancellazione, server
MCP), controllo in fondo; nessun -REGISTRO-CANCELLAZIONI; richiede 07 e 71,
si ferma senza; il sito si pubblica prima o dopo). Colonna
progetti_tecnici.urgente (boolean not null default false); trigger
trg_progetti_tecnici_urgente (BEFORE INSERT OR UPDATE OF urgente, security
definer): 42501 "Solo il titolare segna o toglie l'urgenza di un progetto"
per ogni ruolo del sito che non è titolare (informatico compreso nel
titolare; anche il titolare "Entra come" un altro ruolo e un progetto nuovo
già urgente), editor libero; chi e quando dal registro delle azioni di
sql/67 (campo urgente). RPC del sito urgente_progetti_attivo() (true = il 89
c'è; execute solo authenticated; tra le letture tenute sul telefono di js/57
perché finisce in _attivo). Nel sito (js/16, js/17, js/46, nessun file
nuovo): verificaUrgenzaProgettiDisponibile, ingressiVerificaProgetti (data di
ingresso = ultimo passaggio a in_verifica_tecnica in progetti_tecnici_storico,
riga con stato_successivo in_verifica_tecnica e stato_precedente diverso; se
manca aggiornato_il), giorniAttesaVerifica (giorniLavorativiTra di js/01),
progettiVerificaInAttesa, ATTESA_VERIFICA_LIMITE_GG = 1 (fisso, non una
regola); pagina Verifiche tecniche: "Ricevuto: <data di ingresso> · ⏳ In
attesa da N giorni lavorativi" (rosso oltre 1), ordine urgenti poi arrivo (il
più vecchio in alto), badge "🚨 Urgente", per il titolare "🚨 Segna urgente" /
"Togli urgente" (cambiaUrgenzaProgetto, update diretto); scheda progetto
(js/17, riquadro pd-attesa-urgenza, mostraAttesaUrgenzaProgetto): badge,
attesa se in verifica, bottone del titolare. Cosa tocca a me (js/46): riga
NUOVA del titolare "⏳ Progetti fermi dall'ingegnere" (rossa, in verifica da
più di 1 giorno lavorativo; un progetto = la sua scheda, se no Verifiche
tecniche; anche in ⚖️ Decisioni); riga dell'ingegnere "Verifiche tecniche
aperte" con la sola nota "di cui N da più di 1 giorno lavorativo · 🚨 N
urgenti". SCELTA DICHIARATA: avviso al titolare come riga di Cosa tocca a me
calcolata nel sito (come F15.18), NON una riga del motore delle scadenze
(servirebbe una fonte nuova in sincronizza_scadenze); niente campanella né
notifica. SCELTE DA CONFERMARE DA TOLI: 1 giorno lavorativo fisso; l'urgenza
resta anche quando il progetto esce dalla verifica; un progetto rimandato al
rappresentante e tornato riparte da zero. Guide info-ing-30, info-tit-36.
Prove: sql/89-coda-ingegnere-campione-tempi-PROVA.sql (solo database di
prova, rollback: titolare e informatico segnano e tolgono, registro delle
azioni; ingegnere, Acquisti, segreteria, rappresentante, titolare "come"
ingegnere e "come" Acquisti rifiutati 42501; progetto nuovo urgente del
rappresentante rifiutato, del titolare ammesso; altre modifiche
dell'ingegnere invariate; editor libero; RPC chiusa ad anon);
test/coda-ingegnere-tempi.spec.js (Chrome headless, database locale dal
backup pre88 + sql/88: tre progetti arrivati 5, 2 e 0 giorni lavorativi fa,
ordine e attesa, "🚨 Segna urgente" del titolare, riga ⏳ uguale al calcolo
del database con giorni_lavorativi_tra, ingegnere a 390 px con badge e senza
bottone, console di ingegnere, Acquisti, segreteria e titolare "come"
ingegnere rifiutate; CODA_SENZA_SQL=1 dopo il rollback); smoke TUTTO OK con
e senza sql/89; matrice uguale con e senza; rollback provato (schema
identico con pg_dump). Senza sql/89: attesa, ordine e righe di Cosa tocca a
me ci sono, niente badge né bottone, nessun errore (una chiamata RPC 404).
Dopo sql/258 (sconto del rappresentante, decisioni di Erika del 10/11, ESEGUITO l'11/11 (backup pre258, controllo in regola); era DA
ESEGUIRE; ordine e requisiti nella riga di preventivi_sconti in "Tabelle
Supabase"): RPC del sito sconto_rappresentante_attivo() (true = il 258 c'è),
applica_sconto_preventivo(p_preventivo, p_sconto, p_motivazione) (SOLO con il
preventivo 'inviato_a_rappresentante'; rappresentante del cliente o del
preventivo come accetta_preventivo, titolare anche "Entra come"; percentuale
> 0 e < 100, max 2 decimali, 0 = togli; motivazione OBBLIGATORIA sopra il 2%,
max 1000; rifiuta con il PDF esterno del titolare se non è il titolare e con
l'anticipo in importo oltre il totale scontato; chiama
controllo_sconto_preventivo = AGGANCIO per F16.1 margine 29% e F16.42 sconti
degli agenti, oggi null), dati_pdf_preventivo_cliente(p_preventivo)
(preventivo e voci con il prezzo al cliente, senza costi: il rappresentante
non legge preventivi_voci), registra_pdf_preventivo_cliente(p_preventivo,
p_path, p_nome) (correzione C del controllo dell'11/11: solo
<id>/cliente/<prefisso>....pdf con il prefisso dello sconto attuale,
prefisso_pdf_sconto_preventivo(numero, sconto_il) = "Preventivo_<n>_sconto_
<data e ora UTC dello sconto>_", restituito da dati_pdf_preventivo_cliente
come prefisso_pdf; con lo Storage il file deve esserci e avere created_at >=
sconto_il; generato_il = data del caricamento; senza sconto rifiutato). SCELTA
DICHIARATA: con lo sconto preventivi.totale_imponibile È GIÀ SCONTATO
(totale_prima_sconto = somma delle voci): commessa (sql/26), anticipo
(sql/24, 25, 46), calcolo e fattura finale (sql/39, 46),
importi_extra_commesse (sql/56), dashboard lo usano da soli, nessuna loro
ridefinizione. Trigger trg_preventivi_00_sconto (BEFORE, primo dei
preventivi): fuori dalla RPC le colonne dello sconto non si cambiano (42501,
editor libero); un preventivo nuovo nasce senza sconto; con lo sconto, il
totale delle voci riscritto (js/18, sql/56) diventa il "prima" e lo sconto si
rimette, anche se il nuovo totale delle voci è uguale al totale scontato di
prima (confronto con la somma delle voci salvate: correzione D) e con la
stessa formula della RPC, base arrotondata al centesimo e poi lo sconto
(correzione E). Secondo controllo (punto 1): il rappresentante (anche titolare
"come") non cambia preventivi.stato né commerciale_id con un update diretto
(42501; la policy di sql/10 glielo lasciava fino a 3.000 €: es. bozza di
Acquisti portata a 'inviato_a_rappresentante' per scontarla), solo con le
RPC accetta_/rifiuta_preventivo (sql/22),
rinvia_preventivo_al_commerciale_da_rappresentante (sql/57),
salva_/invia_preventivo_extra_rappresentante (sql/56), riconosciute con
PG_CONTEXT; da console crea solo bozze (22023). Punto 3:
applica_sconto_preventivo vuole almeno una voce e il totale uguale alla
somma delle voci al centesimo ("Il totale non torna con le voci: lo sistema
Acquisti"). Punto 2: senza uno sconto in corso (sconto_perc > 0) il
rappresentante non carica né registra il PDF (tolto lo sconto lo rifà
Acquisti o il titolare). Correzioni A e B: il RAPPRESENTANTE (anche titolare "come")
non cambia totale_imponibile con un update diretto, con o senza sconto
(42501; la policy di sql/10 glielo lasciava fino a 3.000 €), salvo dentro
salva_preventivo_extra_rappresentante di sql/56 (PG_CONTEXT); né collega a
mano il PDF per il cliente (preventivo_cliente_pdf_*: solo
registra_pdf_preventivo_cliente e le RPC di sql/56). Correzione F:
prezzi_contratto_cliente (sql/44) ridefinita: con lo sconto sul preventivo
del contratto prezzo_unitario delle voci scontato per voce (prezzo_listino
= quello delle voci, preventivo.sconto_perc), rollback = versione di sql/44.
js/18: importoScontatoPreventivo (centesimi interi, formula del database),
riga "🏷️ Con lo sconto del X%" (imponibile e margine) nell'editor delle
voci, anticipo controllato sul totale scontato; senza sql/258 (dopo il
rollback) con sconto_perc > 0 rimasto sui preventivi con l'esito scrive il
totale già scontato (nota G del -ROLLBACK). Soglia 3.000 € (D14): aggancio sul posto in
preventivi_blocca_3k_rappresentante (non blocca l'update fatto dentro la RPC,
segno toli.sconto_preventivo); il resto invariato. Regola storage NUOVA
preventivi_documenti_cliente_sconto (il rappresentante carica il PDF rifatto
dei suoi preventivi inviati a lui, senza PDF esterno del titolare, solo con
il nome del prefisso dello sconto attuale, .pdf). Nel sito (js/69-sconto-rappresentante.js,
caricato dopo js/68 e prima di js/19): in "I miei preventivi" (js/13
segnaposto .sconto-rapp + caricaScontiRappresentante) totale, "🏷️ Applica
uno sconto" / "✏️ Cambia lo sconto", la propria motivazione, "⚠️ Il PDF non ha
ancora lo sconto" con "📄 Rifai il PDF"; finestra m-sconto-rappresentante
(id scr-: percentuale con la virgola, anteprima con IVA, motivazione,
"Togli lo sconto", "💾 Applica e rifai il PDF" = RPC + dati_pdf +
generaPreventivoClientePDF(datiEsterni) + upload + registra_pdf); scheda del
preventivo (js/18 segnaposto pvd-sconto + caricaScontoPreventivoDettaglio):
percentuale, totali, chi e quando per chi legge il preventivo, motivazione e
"▸ Tutti i cambi" solo al titolare, che applica lo sconto anche da lì. PDF del
cliente (js/18 generaPreventivoClientePDF, legge sconto_perc che c'è già):
"Totale voci", "Sconto N%", "Imponibile scontato", IVA e totale sullo
scontato; mai la motivazione. SCELTE DA CONFERMARE DA TOLI: sconto solo prima
dell'esito anche per il titolare; lo sconto resta se il preventivo torna in
bozza (Rinvio ad Acquisti) e si rimette sul nuovo totale; con il PDF esterno
del titolare lo sconto lo mette lui; nessun avviso al titolare per gli
sconti; nessun tetto (F16.1, F16.42); il database non blocca l'accettazione
con un PDF vecchio (solo l'avviso nel sito). SCELTE DICHIARATE dopo il secondo controllo: il
CONTENUTO del PDF non è verificato dal database (solo cartella, nome legato
allo sconto, data di caricamento, sconto in corso); preventivo cancellato
(una bozza, dal commerciale autore o dal titolare): lo storico dello sconto
segue a cascata, ma la motivazione resta nel registro delle azioni (riga
"cancellazione" di preventivi_sconti, lettura del titolare): così Acquisti
cancella ancora le sue bozze dopo un rinvio. Guide info-rap-34, info-tit-32,
info-com-23. Prove: sql/258-sconto-rappresentante-PROVA.sql (solo database di
prova, nel Postgres locale con -U supabase_admin per lo Storage finto,
rollback: 1,5% senza motivo, 5% senza motivo rifiutato e con motivo, decimali,
altro rappresentante, Acquisti, segreteria, tecnico, titolare "come"
Acquisti rifiutati; motivazione illeggibile ad Acquisti, segreteria,
contabile, tecnico, altro rappresentante; scritture dirette rifiutate;
voci risalvate; titolare "come" rappresentante; PDF; anon; preventivo nuovo
senza sconto; commessa e fattura finale a 9.600 €; anticipo 30% di 9.000 =
2.700 €; dopo l'esito bloccato; correzioni dell'11/11: A 3.200 → 2.880 e
totale 1.000 da console rifiutato anche "come", B 2.500 senza sconto → 1.200
rifiutato, note, rinvio sql/57 e rifiuto sql/22 ammessi, C PDF con un altro
nome, caricato prima dello sconto o collegato a mano rifiutati e regola dei
file con lo Storage finto, D voci 900 con il 10% → 810, E 3 x 333,335 → 900,01
uguale tra trigger e RPC e dopo l'esito, F prezzi del contratto al 96%,
annulla_leggi_riga e motore_leggi_riga revocate come in produzione e
registro delle azioni senza motivazioni per Acquisti, segreteria, contabile,
altro rappresentante); test/sconto-rappresentante.spec.js (Chrome
headless, rappresentante a 390 px: 1,5% e 5% con PDF rifatto e caricato,
console di Acquisti e segreteria, console del rappresentante con totale e PDF
a mano rifiutati, scheda del titolare e di Acquisti;
SCONTO_SENZA_SQL=1 dopo il rollback); matrice TUTTO OK (anche
MATRICE_AGITO_COME=1; 10 righe nuove); smoke TUTTO OK con e senza sql/258;
rollback provato (schema identico; i preventivi senza esito tornano al totale
delle voci). Senza sql/258: nessun riquadro, nessun errore (una chiamata RPC
404).
Dopo sql/259 (fonte del rilievo automatica, richiesta di Erika dell'11/11,
scelta 1, numero fuori piano; ESEGUITO l'11/11 dal server MCP (backup pre259-261, controllo in regola): backup, anteprima in fondo al file,
259-fonte-rilievo-automatica.sql (senza parole di cancellazione, server MCP),
controllo in fondo; nessun -REGISTRO-CANCELLAZIONI, matrice invariata;
richiede 07, 71, 79, si ferma senza; il sito si pubblica prima o dopo):
ridefinisce SOLO trg_progetti_tecnici_fonti (create or replace, permessi NON
toccati: in produzione la funzione ha i grant di default ad anon e
authenticated, il rollback la rimette identica, testo di produzione senza
commenti preso dal backup). All'invio da bozza o da integrare verso
in_verifica_tecnica, inviato_a_commerciale, pronto_per_preventivo (o progetto
creato già inviato dal rappresentante) una fonte_rilievo vuota diventa
'sopralluogo_toli' (BEFORE, per ogni utente del sito; editor senza fonte
automatica) invece del 22023. Restano: il blocco delle FONTI DEI DATI
NORMATIVI (trg_progetti_tecnici_schede_fonti e il controllo nel trigger,
decisione a parte di Erika), chi scrive la fonte a mano (rappresentante,
ingegnere, titolare; 42501 per gli altri, controllato prima del valore
automatico), fonti_mancanti_progetto (dice ancora "manca la fonte del rilievo":
il sito la ignora per il rappresentante). Ordine dei BEFORE su
progetti_tecnici: _fonti, _invio_completo, _invio_foto_video, _smistamento
(foto_video_mancanti_progetto rilegge la tabella: vuoto e sopralluogo_toli
chiedono le stesse foto); smista_progetto di sql/83 passa dallo stesso
trigger. CHI E QUANDO: nessuna colonna nuova, il registro delle azioni di
sql/67 scrive fonte_rilievo null → sopralluogo_toli con chi invia (con "Entra
come" il titolare reale e agito_come_*), quando = invio. Segno nel codice
v_versione 'sql/259' (i commenti si perdono dal server MCP). SITO (vale con e
senza sql/259; richiesta di Erika dell'11/11 con sql/260, che spegne le
regole di smistamento): per ROLE === 'rappresentante' (anche "Entra come")
il progetto tecnico torna come prima del 06/11: js/17 niente campo "Fonte del
rilievo" nella finestra (mostraFonteRilievoProgetto, non si manda) né riga
"Fonte del rilievo" in progetto-detail (nascosta); js/56 niente "📐 Fonte del
rilievo" nel motore (htmlFonteRilievoMotore), niente "📝 Compila una scheda
di rilievo" (msm-apri) né "📋 Blocco comune" (msm-comune) nel tab Rilievi
tecnici (disegnaApriMotoreProgetto); le schede già salvate restano leggibili
nel tab, le posizioni P-xx delle schede salvate restano modificabili (js/66
invariato), le anteprime delle foto della finestra del progetto restano
(mp-file-selezionati). SCELTA SOLO DEL SITO: le policy di sql/77 sulle schede
del rappresentante restano (apriSchedaMotore funziona ancora da console).
controllaFontiPrimaDellInvio (js/56, chiamata da inviaProgettoAUfficioTecnico,
inviaProgettoAlCommerciale, inviaProgettoConSmistamento) per il rappresentante
ignora la riga fonte_rilievo e, se manca, scrive lei
fonte_rilievo='sopralluogo_toli' (mettiFonteRilievoAutomatica, update del
progetto in bozza/da integrare permesso dalla policy e da sql/79) prima
dell'invio: così l'invio passa anche senza sql/259. Restano i blocchi dei
dati normativi, dati del prezzo e foto delle schede già salvate (un progetto
senza schede chiede solo titolo, tipologia, descrizione e allegati, come prima
del 06/11). Ingegnere e titolare come prima. Guide info-rap-25..33 adattate
(26 schede all'ingegnere, 28 fonte automatica, 29 cosa serve all'invio, 30
foto del progetto, 33 due bottoni), note in info-ing e info-tit (catalogo e
fonti); info-rap-35 (F15.15) non toccata. LIMITE: un dato normativo senza
fonte in una scheda salvata dal rappresentante prima ferma il suo invio e lui
non apre più il motore: deve farlo l'ingegnere o il titolare. Prove:
sql/259-fonte-rilievo-automatica-PROVA.sql (solo database di prova,
rollback: rappresentante e titolare "come" rappresentante inviano senza fonte
→ sopralluogo_toli con il registro, titolare da da_integrare, progetto creato
già inviato, porta REI 60 senza fonte del dato bloccata (fonte resta vuota),
RPC invariata, ingegnere e titolare scrivono la fonte, Acquisti rifiutato,
fonte già indicata invariata, editor senza fonte, smista_progetto con le
regole accese); 79-PROVA aggiornato (con 259 aspetta il blocco dei dati
normativi); test/progetto-rappresentante.spec.js NUOVO (rappresentante a 390
px, regole di smistamento spente come dopo sql/260: titolo, tipologia,
descrizione e foto con l'anteprima, niente fonte né riquadri delle schede,
"🔧 Invia a ufficio tecnico" e "📤 Invia ad Acquisti"); motore-schede-fonti,
smoke, foto-video, smistamento-famiglie, migrazione-progetti-aperti,
motore-schede, motore-schede-protezioni, blocco-comune aggiornati (apriMotore
del rappresentante: riquadro assente, scheda aperta con apriSchedaMotore;
404 voluti di sql/85 e 258 ignorati); smoke TUTTO OK con e senza sql/259;
matrice invariata; rollback provato (schema identico con pg_dump).
Dopo sql/260 (spegni lo smistamento, richiesta di Erika dell'11/11, ESEGUITO
l'11/11 dal server MCP, backup pre260, controllo in regola: regole attive 0,
smistamento_attivo false, 3 righe 'disattivata' nel registro
regole_smistamento_storico): le regole di sql/83 sono SPENTE, il rappresentante
ha di nuovo "🔧 Invia a ufficio tecnico" e "📤 Invia ad Acquisti" (decide lui);
si riaccendono da Impostazioni > 🚦 Regole di smistamento (▶️ Riattiva). Lo
smistamento automatico era la decisione T2 di Toli: spento su richiesta di Erika.
REGOLA DI ERIKA (11/11): le funzioni esistenti sono volute; solo miglioramenti,
mai cambiare flussi, bottoni o obblighi di un ruolo senza chiederle prima.
Dopo sql/261 (invio del rappresentante libero, richiesta di Erika dell'11/11:
flusso come prima del 06/11, commit 449208b; numero fuori piano; ESEGUITO l'11/11 dal server MCP dopo sql/259 (backup pre259-261, controllo in regola):
backup, anteprima in fondo al file, 261-invio-rappresentante-libero.sql (senza
parole di cancellazione, server MCP), controllo in fondo; nessun
-REGISTRO-CANCELLAZIONI, matrice invariata; richiede 07, 71, 79, 82-blocco,
82-foto-video, si ferma senza; ORDINE CON sql/259 QUALUNQUE: 261 dopo 259
aggancia la funzione di 259, 259 dopo 261 rimette da solo l'aggancio di 261
(blocco in fondo a 259 e al suo -ROLLBACK); il sito si pubblica prima o
dopo). SCELTA b (indicazione di Erika dell'11/11): i tre blocchi dell'invio
da bozza o da integrare NON scattano quando ruolo_corrente() = 'rappresentante'
(anche il titolare "Entra come" un rappresentante); per ingegnere, titolare,
Acquisti e gli altri tutto come prima, la parte dell'ingegnere non cambia.
I tre blocchi: dati normativi senza fonte (trg_progetti_tecnici_fonti di sql/79
o 259: AGGANCIO SUL POSTO con pg_get_functiondef + replace, la riga "if tg_op =
'UPDATE' then" diventa "... and v_ruolo is distinct from 'rappresentante'
then"; si ferma se il testo non c'è una volta sola), dati del prezzo
(trg_progetti_tecnici_invio_completo di sql/82) e foto e video
(trg_progetti_tecnici_invio_foto_video di sql/82-foto-video): create or
replace con il testo di produzione + la condizione + v_versione 'sql/261',
commenti delle funzioni aggiornati. La fonte del rilievo la toglie sql/259 (non
duplicata). Restano: chi scrive fonti e fonte del rilievo, "ingegnere TOLI"
solo ingegnere e titolare, impronta dei file, foto doppie, tipi dei file,
controlli dei valori di sql/78, le RPC fonti_mancanti_progetto,
controlli_invio_progetto, foto_video_mancanti_progetto; smista_progetto di
sql/83 (regole spente da sql/260) passa dagli stessi trigger: anche lì il
rappresentante non è fermato. Rollback: le due funzioni con il testo esatto
del backup 2026-11-11-pre260 e i loro commenti, l'aggancio tolto con il
replace al contrario (testo esatto di 79 o 259). SITO (vale con e senza
sql/261): js/56 controllaFontiPrimaDellInvio, controllaDatiPrimaDellInvio,
controllaFotoVideoPrimaDellInvio restituiscono true per ROLE ===
'rappresentante' (nessun elenco, nessun blocco; per ingegnere e titolare come
prima, testi invariati); preparaInvioRappresentante (js/56) scrive la fonte
del rilievo 'sopralluogo_toli' con mettiFonteRilievoAutomatica DOPO la
conferma dell'invio e dopo il controllo dell'allegato (js/17
inviaProgettoAUfficioTecnico e inviaProgettoAlCommerciale; prima la scriveva
prima della conferma); messaggioInvioBloccatoRappresentante (js/56, usata dagli
errori dell'invio di js/17 e da testoErroreSchedaMotore, quindi anche da
js/67): senza sql/261 un 22023 "Invio bloccato..." al rappresentante diventa
"Il progetto non si può ancora inviare: le schede di rilievo non sono
complete. Chiedi all'ingegnere di completare la scheda." (niente rimandi a
"📝 Compila la scheda"). js/67 NON toccato: con le regole accese (l'invio passa da
inviaProgettoConSmistamento) controllaFontiPrimaDellInvio per il
rappresentante scrive la fonte del rilievo come prima (prima della conferma
dello smistamento), così senza sql/259 smista_progetto non si ferma.
Per il rappresentante l'invio chiede solo titolo, tipologia, descrizione
(salvaProgetto) e almeno un allegato, come in 449208b. Guide info-rap-10, 28,
29, 30, 33 (decide lui ingegnere o Acquisti, basta una foto, nessun altro
blocco); guide dell'ingegnere NON toccate. Prove:
sql/261-invio-rappresentante-libero-PROVA.sql (solo database di prova,
rollback: rappresentante e titolare "come" rappresentante da bozza e da
integrare verso ingegnere e Acquisti con una scheda porte REI senza foto, senza
dati del prezzo e REI 60 senza fonte; ingegnere "Richiedi integrazione" e
verso Acquisti con salva_esito_verifica; titolare fermato da ciascuno dei tre
blocchi; "ingegnere TOLI" del rappresentante, foto doppia, file senza impronta
rifiutati; fonte del rilievo vuota con e senza 259; editor; smista_progetto con
le regole accese); 259-PROVA adattato (con 261 il blocco dei dati normativi si
prova con il titolare); 79-, 82-blocco- e 82-foto-video-PROVA valgono SOLO
senza sql/261 (si fermano con il messaggio); controllo in fondo a 259
corretto (con sql/85 c'è trg_progetti_tecnici_appuntamento prima di _fonti: si
controlla solo che _fonti venga prima di _invio_completo, _invio_foto_video e
_smistamento); test/progetto-rappresentante.spec.js esteso (ingegnere compila
senza foto → Richiedi integrazione → il rappresentante rinvia, con e senza
sql/261; con "Annulla" alla conferma la fonte del rilievo resta vuota;
senza allegati il sito lo ferma; barra "🔍 Cerca" della pagina Progetti del
rappresentante: solo le schede con le parole scritte); motore-schede-fonti,
foto-video, blocco-comune (ora con le regole di smistamento spente come dopo
sql/260) adattati: riconoscono da soli se sql/261 c'è; tutti TUTTO OK con e
senza sql/261, smoke TUTTO OK con e senza; matrice uguale con e senza
sql/261; rollback provato in tutti gli ordini con 259 (schema identico con
pg_dump). Nello stesso commit: barra "🔍 Cerca" nella pagina Progetti
(index.html cerca-prev-progetti, js/18 PAGINE_CERCA_PREVENTIVI con 'progetti'
e il testo "N progetti trovati"), richiesta di Erika dell'11/11.
Dopo sql/263 (campi nuovi di vernice intumescente e porte REI, richiesta di
Erika del 12/11, numero fuori piano; ESEGUITO il 12/11 (backup pre88-265, controllo in regola) con "CONFERMATO DA TOLI:
sql/263": backup, anteprima in fondo al file, 263-campi-vernice-porte-rei.sql
(senza parole di cancellazione, server MCP), controllo in fondo; nessun
-REGISTRO-CANCELLAZIONI, matrice invariata; richiede 71, 75, 78, 81,
82-blocco, si ferma senza; il sito si pubblica prima o dopo). Solo dati del
catalogo + una funzione: campi NUOVI (menu, facoltativi, base, non per
posizione) vernice materiale_supporto (5), tipo_protezione (7), rivestimento
(15), porte REI funzionamento (42), dispositivo_sgancio (44),
collegato_rilevazione (46, "Da definire" non ferma: non servono al prezzo);
voci in fondo: elemento + capriata, stato_supporto + legno_grezzo,
legno_trattato, legno_degradato, calcestruzzo_integro,
calcestruzzo_da_ripristinare; profilo solo etichetta "Tipo e dimensione della
sezione (metallo o legno)". QUANTITÀ DELLA VERNICE, "basta uno dei tre":
superficie serve_al_prezzo = false e controlli_invio_progetto (sql/82)
ridefinita (testo di produzione backup pre88 + blocco "sql/263"; il file si
ferma se il corpo in produzione ha un'altra impronta md5) con la regola
"almeno uno tra numero_elementi, sviluppo_lineare, superficie" (stesse regole
di problema_valore_invio; vuoti nella scheda e almeno uno in ogni posizione
attiva = va bene; vale solo se nessuno dei tre serve al prezzo da solo),
riga campo "numero_elementi,sviluppo_lineare,superficie", motivo "Indica
almeno uno tra numero di elementi, sviluppo lineare e superficie".
trg_progetti_tecnici_invio_completo (sql/261) NON toccato: il rappresentante
resta libero, ingegnere e titolare fermati solo senza nessuno dei tre (blocco
più stretto di prima), altre lavorazioni invariate. Nel sito (js/56, vale
anche senza il file: senza sql/263 superficie è ancora obbligatoria e il
gruppo non scatta) GRUPPI_ALMENO_UNO_MOTORE, gruppiAlmenoUnoMotore,
gruppoCompilatoMotore (gemelle): "* (basta uno tra ...)" sui tre campi,
"Per il preventivo mancano: Quantità (...)" in obbligatoriMancantiMotore, riga
in controlliInvioProgettoSito. Guida info-ing-31 (e info-ing-24). Prove:
sql/263-campi-vernice-porte-rei-PROVA.sql (solo database di prova, rollback:
campi e voci, valori vecchi e nuovi del rappresentante e valore inventato
rifiutato, rappresentante e titolare "come" liberi, titolare fermato senza
nessuno dei tre e non con il solo numero, non noto definitiva/indicativa, "da
verificare", posizioni, porte REI con "Da definire" inviata, tutti i progetti
uguali alla versione di sql/82 tranne il gruppo); test/campi-vernice-porte-
rei.spec.js (ingegnere a 390 px: legno, capriata, solo numero degli elementi,
salva e invia; porta REI con sgancio e rilevazione Sì nel preventivo, nella
copia di Acquisti e nel PDF delle schede; CAMPI_SENZA_SQL=1 dopo il
rollback); motore-schede, pdf-schede-tecniche, progetto-rappresentante, smoke
TUTTO OK con e senza; rollback provato (schema identico con pg_dump; i 6 campi
restano "tolti"). NOTA: 81-PROVA conta 3 obbligatori della vernice: dopo
sql/263 sono 2 (vale solo prima). SCELTE DICHIARATE: etichetta del profilo
cambiata solo se è ancora quella di sql/81; il rollback toglie dai menu le 6
voci anche se fossero state aggiunte a mano.
Dopo sql/91 (F15.21 proposte di nuovi campi, approvata da Erika il 12/11 come
"solo un bottone in più per l'ingegnere più una lista per il titolare"; DA
ESEGUIRE: backup, anteprima in fondo al file, 91-proposte-nuovi-campi.sql
(senza parole di cancellazione, server MCP), 91-...-REGISTRO-CANCELLAZIONI.sql
dall'EDITOR, controllo in fondo al 91; richiede 07, 67, 71, 75, si ferma
senza; 78 facoltativo; il sito si pubblica prima o dopo). Tabella
lavorazioni_proposte_campi (vedi "Tabelle Supabase"). RPC del sito:
proposte_campi_attive() (true = il 91 c'è), proponi_campo_lavorazione(
p_lavorazione codice, p_etichetta, p_tipo, p_unita, p_valori, p_uso, p_nota)
(ingegnere e titolare; tipi numero, menu, si_no, testo, NON foto né elenco;
menu [{"valore","etichetta"}] senza doppioni né per valore né per etichetta;
uso a valle 3-500; stessa domanda già in attesa nella lavorazione = rifiuto;
max 30 in attesa per persona), approva_proposta_campo(p_id, p_etichetta,
p_codice, p_tipo, p_unita, p_valori, p_uso, p_livello) (SOLO titolare, anche
"Entra come" un altro ruolo = 42501; il titolare corregge tutto; codice nuovo
nella lavorazione anche tra i tolti, non riservato: stessa lista di
CODICI_RISERVATI_LAV di js/55; inserisce in lavorazioni_campi FACOLTATIVO
(obbligatorio false, quindi serve_al_prezzo false con sql/78: non ferma nessun
invio), livello base o ingegnere a scelta del titolare, non normativo, non per
posizione, attivo, ordine = il più alto della lavorazione + 10 (max 9999);
l'inserimento passa dal trigger di sql/75 e scrive il registro del catalogo),
rifiuta_proposta_campo(p_id, p_motivo) (SOLO titolare, motivo 3-500). Interna
proposta_campo_controlla. Registro delle azioni sulla tabella. REGOLA DI ERIKA:
nessun flusso, bottone, obbligo o blocco di prima cambia ("➕ Aggiungi campo"
del catalogo resta per titolare e ingegnere). Nel sito (js/55 in fondo,
F15.21; index.html): nel catalogo m-catalogo-lavorazioni, sotto "➕ Aggiungi
campo", riquadro cl-proposte (disegnaCatalogoLavorazioni avvolta): ingegnere
"➕ Proponi un campo" (cl-proponi-campo) e le sue proposte con lo stato e il
motivo del rifiuto; titolare le proposte in attesa della lavorazione con
"✅ Approva o rifiuta" e "📝 Tutte le proposte"; nella scheda del motore aperta
dall'INGEGNERE link "➕ Proponi un campo" (msm-proponi-campo, dopo msm-campi;
disegnaSchedaMotore di js/56 avvolta a DOMContentLoaded perché js/56 è caricato
dopo js/55); finestre m-proposte-campi (pce-: Da valutare / Tutte) e
m-proposta-campo (pcl-: modo proponi o decidi: lavorazione, domanda, tipo,
unità, risposte del menu, uso a valle, perché; per il titolare codice, chi lo
compila, motivo, "✖ Rifiuta", "✅ Approva e aggiungi"); Impostazioni > 📚
Catalogo lavorazioni: "📝 N proposte di campi da valutare" (si-proposte-campi,
mostraCatalogoLavorazioniImpostazioni avvolta); Cosa tocca a me del titolare
"📝 Proposte di campi da valutare" (fonte proposte-campi-titolare, apre
l'elenco). NON FATTI (indicazione di Erika): contatore nel report del venerdì
(non esiste ancora); "obbligatorio" proposto dall'ingegnere (il campo entra
sempre facoltativo); avviso all'ingegnere dell'esito (lo legge nel catalogo).
Guide info-ing-32, info-tit-37. Prove: sql/91-proposte-nuovi-campi-PROVA.sql
(solo database di prova, rollback: proposte di ingegnere e titolare, doppione,
foto, elenco, menu ripetuto o vuoto, uso a valle vuoto, lavorazione inventata,
Acquisti, rappresentante, tecnico, titolare "come" Acquisti, anon rifiutati;
letture per ruolo; insert, update e cancellazione diretti rifiutati;
approvazione di ingegnere, Acquisti, titolare "come" ingegnere rifiutata,
codice riservato, già usato, non valido, tipo foto, livello inventato;
approvato con le correzioni: facoltativo, non al prezzo, base, in fondo,
registro; livello ingegnere; rifiuto con motivo; cancellazione bloccata anche
dal proprietario); test/proposte-campi.spec.js (Chrome headless, database
locale: ingegnere a 390 px dal catalogo e dalla scheda del motore, titolare
approva e rifiuta, il campo compare in fondo alla scheda senza *, console di
ingegnere, Acquisti e titolare "come" ingegnere rifiutate;
PROPOSTE_SENZA_SQL=1 dopo il rollback); catalogo-lavorazioni TUTTO OK con
sql/91, smoke TUTTO OK con e senza; matrice TUTTO OK per la tabella nuova (anche
MATRICE_AGITO_COME=1); rollback provato (schema identico con pg_dump; i campi
approvati restano nel catalogo). Senza sql/91: nessun bottone, link o riga,
nessun errore (una chiamata RPC 404 per titolare e ingegnere).
Dopo sql/264 (oggetto e nota prima della tabella dei prezzi, richiesta di Erika
del 12/11, fuori piano, + computo dell'ingegnere, stessa richiesta del 12/11 nello
STESSO file; ESEGUITO il 12/11 (backup pre88-265, controllo in regola) con "CONFERMATO DA TOLI: sql/264": backup,
anteprima in fondo al file, 264-preventivo-oggetto-nota.sql DALL'EDITOR SQL (con
il computo contiene "for delete" nelle regole dei file: il server MCP lo
rifiuta), controllo in fondo (Claude); nessun -REGISTRO-CANCELLAZIONI;
richiede 07, 10, 25, 71, 258, si ferma senza; il sito si pubblica prima o dopo).
preventivi.oggetto e nota_introduttiva (vedi "Tabelle Supabase"). Trigger NUOVO
trg_preventivi_oggetto_nota (BEFORE INSERT OR UPDATE OF le due colonne: spazi
tolti, vuoto = null; dopo l'esito, old.stato in_attesa_anticipo, accettato,
rifiutato, 42501 per ogni utente del sito tranne il titolare, anche "come";
editor libero). Policy, trigger di sql/25, sql/258 (trg_preventivi_00_sconto) e
dei 3.000 € NON toccati: prima dell'esito li scrive chi scrive il preventivo
(Acquisti, titolare, rappresentante sui suoi fino a 3.000 €, come le note). Il
registro delle azioni li registra da solo. dati_pdf_preventivo_cliente (sql/258)
ridefinita = testo di produzione + 'oggetto' e 'nota_introduttiva' (permessi
uguali; rollback = testo esatto, md5 b942ded726b9430606910116963cf4d4). Nel sito
(js/18, nessun file nuovo): verificaOggettoNotaPreventivoDisponibile (legge
una riga con select * e guarda se la colonna c'è: nessuna richiesta in errore,
un 400 "does not exist" faceva fallire smoke e sconto-rappresentante), riquadro "🏷️ Oggetto e nota iniziale" sopra "💳
Modalità di pagamento" nell'editor di Acquisti e del titolare (pvv-oggetto,
pvv-nota-introduttiva, htmlOggettoNotaEditorPreventivo), salvati da "💾 Salva
preventivo" (eseguiSalvataggioVociPreventivo, solo con sql/264); PDF del
cliente (generaPreventivoClientePDF, anche con datiEsterni di js/69):
scriviOggettoNotaPdfPreventivo dopo i dati del cliente e prima della tabella,
"Oggetto: ..." in grassetto e la nota, solo se compilati (vuoti = PDF identico).
La sezione "Note" in fondo NON cambia. NON FATTO (dichiarato): il preventivo
integrativo del rappresentante (js/53, salva_preventivo_extra_rappresentante di
sql/56): servirebbe una firma nuova della RPC o toglierla (drop); il suo PDF resta
come prima. Guide info-com-25 (e info-com-4), info-tit-39. Prove:
sql/264-preventivo-oggetto-nota-PROVA.sql (solo database di prova, rollback:
Acquisti scrive e svuota nella bozza, titolare, insert con i due campi; 201
caratteri, a capo nell'oggetto, 2001 nella nota rifiutati; rappresentante su
cliente non suo zero righe, sopra 3.000 € rifiutato, li legge e li trova in
dati_pdf_preventivo_cliente, altro rappresentante e Acquisti rifiutati; dopo
accettato/rifiutato/in attesa anticipo Acquisti, rappresentante, titolare
"come" Acquisti rifiutati, segreteria zero righe, titolare ammesso; registro
delle azioni); test/preventivo-oggetto-nota.spec.js (Chrome headless, database
locale: Acquisti compila e salva, PDF con cliente → Oggetto in grassetto →
nota → prima voce → Note, PDF con datiEsterni, campi vuoti = PDF uguale a
prima; senza sql/264 nessun campo, PDF uguale, nessuna richiesta in errore);
sconto-rappresentante e smoke TUTTO OK con e senza sql/264; matrice
uguale con e senza; rollback provato (schema identico con pg_dump). Senza
sql/264: nessun campo, nessun errore.
COMPUTO DELL'INGEGNERE (sql/264 esteso, richiesta di Erika del 12/11):
preventivi.computo_path e computo_nome (vedi "Tabelle Supabase"). Trigger
trg_preventivi_oggetto_nota esteso (BEFORE INSERT OR UPDATE OF oggetto,
nota_introduttiva, computo_path, computo_nome): percorso vuoto = null e nome
vuoto; nome vuoto con il percorso = nome del file del percorso; il computo lo
cambiano SOLO il titolare (anche "come") e Acquisti autore (commerciale_id =
utente_effettivo()): 42501 per gli altri, anche il rappresentante che la
policy di sql/10 lascia scrivere fino a 3.000 €; percorso di un altro
preventivo, fuori dalla cartella computo o con un'altra estensione = 22023 (il
vincolo resta per l'editor); con lo Storage il file deve esserci in
storage.objects (execute: senza Storage si salta); dopo l'esito solo il
titolare (42501). dati_pdf_preventivo_cliente con 'computo_path' e
'computo_nome' (l'aggancio di sql/265 sulle voci invariato, in ogni ordine).
REGOLE DEI FILE (solo con lo Storage), cartella <id>/computo/ del bucket
preventivi-documenti: le regole di sql/14 di produzione fanno già leggere
tutta la cartella del preventivo al titolare e ad Acquisti autore, al
rappresentante solo la cartella cliente; il caricamento non comprende
'computo'; l'eliminazione è di titolare e Acquisti autore in ogni stato.
NUOVE: preventivi_documenti_computo_lettura (titolare, Acquisti autore,
rappresentante del cliente, del preventivo o del progetto con il preventivo
inviato_a_rappresentante, inviato, in_attesa_anticipo, accettato, rifiutato,
scaduto; segreteria, tecnico e gli altri no), _caricamento (titolare e
Acquisti autore, prima dell'esito, un file .xlsx/.xls/.csv/.pdf direttamente
nella cartella; niente update: nessuna sovrascrittura), _eliminazione
(stessi, prima dell'esito; titolare sempre) e _dopo_esito (RESTRITTIVA per
delete, la PRIMA restrittiva su storage.objects: vale solo per la cartella
computo del bucket, ogni altro file risponde vero; dopo l'esito il computo lo
toglie solo il titolare). Rollback: toglie le 4 regole (i file caricati
restano nel bucket), le due colonne e rimette il resto come prima. Nel sito
(js/18): verificaOggettoNotaPreventivoDisponibile guarda anche computo_path
dalla stessa riga (verificaComputoPreventivoDisponibile, nessuna richiesta in
errore); nell'editor di Acquisti e del titolare, tra Oggetto e nota, il
riquadro pvv-computo "📐 Computo (facoltativo)" (htmlComputoEditorPreventivo,
input nascosto pvv-computo-file) con "📎 Carica Excel o PDF", poi "🔁
Sostituisci" e "✖ Togli" (caricaComputoPreventivo, togliComputoPreventivo):
SCELTA, il file si carica e si collega SUBITO (upload upsert false in
<id>/computo/<ora>_<nome>, update delle due colonne, se l'update fallisce il
file si toglie; sostituendo o togliendo il file di prima si toglie dallo
Storage), non con "💾 Salva preventivo" (che non manda le due colonne);
bottoni solo a titolare e Acquisti autore, dopo l'esito solo il titolare
(bloccaEditorVociPreventivo li nasconde come gli altri). PDF del cliente
(generaPreventivoClientePDF, anche con datiEsterni di js/69; js/53 non ha
computo): leggiComputoPerPdfPreventivo (download dal bucket) → Excel: primo
foglio con XLSX.utils.sheet_to_json raw false (valori formattati della
libreria: 12.5, non 12,5), righe e celle vuote in fondo tolte, max 300 righe
(oltre: avviso nel sito e riga in corsivo nel PDF), oltre 10 colonne avviso
nel sito ma PDF fatto; scriviComputoExcelPdfPreventivo (titolo "Computo",
autoTable a 178 mm, prima riga = intestazione, carattere da 8 a 4,5 secondo le
colonne, testi puliti con pulisciTestoPDF di js/00) DOPO "Oggetto:" e PRIMA
della nota (scriviOggettoNotaPdfPreventivo con il parametro
traOggettoENota). PDF (dal 12/11, segnalazione di Erika): nello STESSO punto
dell'Excel, ogni pagina disegnata con pdf.js 3.11.174 di cdnjs
(caricaLibreriaPdfJs di js/00, solo quando serve) su un canvas a circa 2x
(max 2000 px), margini bianchi tagliati e inserita con doc.addImage
(immaginiComputoPdfPreventivo, scriviComputoPdfImmaginiPreventivo: larga al
massimo 178 mm, mai oltre la scala 1:1, pagina nuova come le altre se non c'è
posto, rimpicciolita se più alta di una pagina), niente pagine a sé né pdf-lib;
PDF illeggibile o pdf.js non caricato = PDF non generato con il motivo; prova
test/preventivo-computo.spec.js (A4 orizzontale con tabellina 7 x 7).
Il piè di pagina del preventivo ("approvazione specifica delle clausole",
"Documento generato il ...", nessun numero di pagina) resta sulle pagine del
preventivo, non su quelle del computo. Computo che non si scarica o non si
legge (PDF protetto) = PDF NON generato con il motivo. Senza computo il PDF è
identico a prima. Guide info-com-27, info-tit-41, riga in info-rap-34. Prove:
sql/264-preventivo-oggetto-nota-PROVA.sql sezione 6 (con la tabella finta
storage.objects con RLS creata con -U supabase_admin PRIMA di sql/264, come
la PROVA di sql/258; lo schema storage dell'immagine locale NON si tocca, alla
fine si toglie solo la tabella): Acquisti carica e collega, .exe,
sottocartella, rappresentante e segreteria che caricano rifiutati, percorso di
un altro preventivo, fuori cartella, .docx, file non caricato rifiutati,
rappresentante e titolare "come" rappresentante che collegano rifiutati,
titolare "come" Acquisti ammesso, togli, rappresentante legge il file inviato
e lo trova in dati_pdf, altro rappresentante, tecnico e segreteria no, dopo
l'esito Acquisti non cambia, non toglie, non carica, titolare sì, la
restrittiva non tocca un file fornitori; 102 controlli);
test/preventivo-computo.spec.js (Chrome headless, database locale, Storage
finto in memoria: Acquisti carica un Excel generato con xlsx (3 colonne, 5
righe) → PDF con Oggetto → tabella → nota → prima voce, secondo foglio no;
Sostituisci con un PDF di 2 pagine → pagine 2 e 3 del computo, prezzi a
pagina 4, file di prima tolto; Togli → PDF uguale a quello senza computo; il
rappresentante a 390 px applica il 5% e "Rifai il PDF" con il computo; senza
sql/264 nessun riquadro, COMPUTO_SENZA_SQL=1); ordini 264, 264+265, 265 poi
264 e rollback in ogni ordine: schema identico con pg_dump.
Dopo sql/265 ("Quantità x UM" nelle voci del preventivo, richiesta di Erika del
12/11, fuori piano; ESEGUITO il 12/11 (backup pre88-265, controllo in regola) con "CONFERMATO DA TOLI: sql/265": backup,
anteprima in fondo al file, 265-voci-quantita-um.sql (senza parole di
cancellazione, server MCP), controllo in fondo; nessun -REGISTRO-CANCELLAZIONI,
matrice invariata; richiede 07, 25, 71, 258, si ferma senza; ORDINE CON sql/264
QUALUNQUE; il sito si pubblica prima o dopo). preventivi_voci.quantita_um: TESTO
LIBERO facoltativo ("rimangono campi liberi": "2,5", "12 m²", "circa 30"), max
50, una riga (vincolo preventivi_voci_quantita_um_check), NESSUN CALCOLO: il
totale della riga resta quantita × prezzo_unitario, come costo, margine,
totali, sconto, commessa e fatture. Trigger NUOVO trg_preventivi_voci_quantita_um
(BEFORE INSERT OR UPDATE OF quantita_um: spazi tolti, vuoto = null; dopo l'esito
42501 per ogni utente del sito tranne il titolare, anche "come": serve perché
trg_preventivi_voci_blocco di sql/25 confronta solo le sue 8 colonne e non si
tocca). dati_pdf_preventivo_cliente (sql/258 e 264): AGGANCIO SUL POSTO
(pg_get_functiondef + replace di "'quantita', v.quantita," con in più
'quantita_um', si ferma se il pezzo non c'è una volta sola); sql/264 e il suo
-ROLLBACK, se arrivano dopo, rimettono da soli l'aggancio (blocco 4 in fondo);
il -ROLLBACK di 265 fa il replace al contrario. NON toccate: sql/56 (le voci del
preventivo integrativo del rappresentante nascono senza, colonna vuota nel
PDF), scheda_cantiere_commessa, voci_lavori_extra_commessa, prezzi del
contratto, ordini; nessuna funzione copia le voci tra preventivi. Nel sito
(js/18): verificaQuantitaUmVociDisponibile (righe lette con select * o una voce
leggibile: nessuna richiesta in errore senza sql/265), campo "Quantità x UM"
(.pvv-quantita-um, input di testo, niente virgola automatica) accanto a "Unità
di misura" (riga a 3 colonne .fr.fr3, sul telefono una), salvato con "💾 Salva
preventivo" solo con sql/265; "Quantità" diventa "Quantità (pz)"; PDF del
cliente (generaPreventivoClientePDF, anche con datiEsterni di js/53 e js/69)
colonne "Q.tà (pz)" e "Q.tà x UM" (testo così com'è, vuota se manca), larghezze
58/19/14/21/33/33 mm. Nello stesso giro (richiesta di Erika del 12/11, vale
senza SQL): Quantità (pz), Costo unitario interno e Prezzo unitario cliente a 0
o vuoti si vedono VUOTI nei campi (campoNumeroVocePreventivo, anche all'uscita
dal campo); valore salvato, calcoli, totali, margine e PDF come prima (0,00);
la voce nuova propone ancora quantità 1. Guide info-com-26 (e info-com-4),
info-tit-40. Prove: sql/265-voci-quantita-um-PROVA.sql (solo database di prova,
rollback: Acquisti salva '2,5' con spazi tolti, voce nuova, vuoto = null, 50
caratteri sì, 51 e a capo rifiutati, totale 300 invariato, il rappresentante la
trova in dati_pdf_preventivo_cliente e un altro no, dopo accettato/rifiutato/in
attesa anticipo Acquisti e titolare "come" Acquisti rifiutati, riscrittura
uguale ammessa, titolare ammesso, rappresentante zero righe, registro delle
azioni); provati gli ordini solo 265, 264 poi 265, 265 poi 264 e i rollback in
entrambi gli ordini (schema identico con pg_dump); test/voci-quantita-um.spec.js
(Chrome headless, database locale, con e senza sql/265: campi vuoti invece di
0,00 anche dopo l'uscita dal campo, voce nuova 1, m³ 3 pz 100 € "2,5" = 300,
salvate, PDF con le due colonne, voce senza = colonna vuota, dati esterni "12
m²"); preventivo-oggetto-nota, sconto-rappresentante e smoke TUTTO OK con
264+265 e senza. Senza sql/265: nessun campo "Quantità x UM", nessun errore.
Dopo sql/93 (F16.2 catalogo stabile: pulizia e import senza cancellazione,
approvata da Erika il 13/11: "l'import aggiorna i prodotti con lo stesso
codice, aggiunge i nuovi e mette non attivo quelli che mancano, SENZA
cancellarli; i bottoni restano gli stessi"). DA ESEGUIRE con "CONFERMATO DA
TOLI: sql/93": backup, ANTEPRIMA in fondo al file (doppioni "a meno di
maiuscole e spazi" e codici vuoti con le righe di ddt_righe e fatture_righe
che li usano, solo codici e conteggi; atteso nessuna riga: nel backup
pre88-265 1.364 prodotti, 0 doppioni, 0 vuoti), 93-catalogo-stabile-pulizia-
import-senza.sql DALL'EDITOR SQL (contiene "before delete": il server MCP lo
rifiuta), controllo in fondo; nessun -REGISTRO-CANCELLAZIONI (il registro
delle azioni con le cancellazioni è nel file); richiede 07, 71, si ferma
senza; 67 facoltativo; il sito si pubblica prima o dopo. Il file SI FERMA
con l'elenco dei codici doppi o con il numero dei codici vuoti (si decide
prima con Toli quale prodotto tenere; provato nel locale con 2 doppioni in
minuscolo). Nessuna RPC, nessuna policy cambiata (cat_modify: solo titolare,
informatico compreso). Fa: vincolo unico su codice se manca (in produzione
c'è già: prodotti_catalogo_codice_key; se lo crea il 93 il commento lo dice e
il rollback lo toglie), indice unico prodotti_catalogo_codice_normalizzato_unico
su upper(btrim(codice)), vincolo prodotti_catalogo_codice_check (btrim(codice)
<> ''), trigger trg_prodotti_catalogo_niente_cancellazione (BEFORE DELETE,
security definer: per gli utenti del sito, utente_effettivo() non vuoto, un
prodotto usato in ddt_righe.prodotto_id non si cancella, 23503 "... mettilo
non attivo"; editor libero), trg_registro_azioni (sql/67) after insert,
update, delete su prodotti_catalogo, commento della tabella. ddt_righe.
prodotto_id non ha una chiave esterna; fatture_righe NON ha prodotto_id
(arriva al prodotto da ddt_id). NON FATTI (dichiarato: non servono all'import
stabile, prezzi e fasce rimandati con F16.3-F16.5): colonne tipo, um (c'era),
famiglia_lavoro, costo_ultimo(_il), prezzo_riferimento(_il); codici
provvisori di Acquisti (bottoni nuovi). SITO (js/14, vale con e senza sql/93
perché il vincolo unico c'è già): importaExcelCatalogo legge il file e
calcola i prezzi COME PRIMA (sconto, ×1,70/×1,85/×1,25, minimo 3 €), poi
importaCatalogoSenzaCancellare: (1) report dei codici ripetuti nel file (si
tiene la PRIMA riga, come faceva l'insert uno per uno) e delle righe con il
listino ma senza codice (saltate come prima), in un confirm: Annulla = nulla
cambia; (2) lettura id, codice, attivo dei prodotti a pagine da 1000
(leggiCodiciCatalogoEsistenti); un codice uguale a meno di maiuscole e spazi
usa il codice scritto nel database (stesso id); (3) upsert onConflict codice a
blocchi di 50 (attivo = true, aggiornato_il), un blocco in errore si rifà
riga per riga; (4) SOLO se tutto è entrato, i prodotti attivi assenti dal
file diventano attivo = false con update .in('id') a blocchi di 100 (mai
delete); messaggio "N aggiornati, N nuovi, N messi non attivo, N tornati
attivi". Richieste una alla volta (fila di js/01). loadCatalogo legge già
solo gli attivi: i non attivi spariscono da pagina Catalogo e ricerca DDT,
le righe dei DDT restano collegate. Bottoni, finestra e permessi
invariati (import solo titolare). SCELTA DICHIARATA: anche i prodotti
aggiunti a mano con "+ Aggiungi prodotto" e assenti dal file diventano non
attivi (prima venivano cancellati). Guide info-com-28, info-tit-42. Prove:
sql/93-catalogo-stabile-pulizia-import-senza-PROVA.sql (solo database di
prova, rollback, 22 controlli: upsert del titolare con lo stesso id due
volte, codice nuovo, assente non attivo, "prova93-a " in minuscolo 23505,
codice vuoto 23514, Acquisti, rappresentante e titolare "come" Acquisti
rifiutati 42501 o zero righe, prodotto usato in un DDT non cancellabile
23503, non usato sì, editor libero, registro delle azioni);
test/catalogo-stabile.spec.js (Chrome headless, database locale: titolare
importa dal bottone un Excel con tutto il catalogo, 1.367 righe, + prezzo
nuovo, codice ripetuto e riga senza codice: report, stessi id, prodotto tolto
non attivo e non cancellato, riga di DDT collegata; secondo import = id
identici; Annulla = nulla cambia; Acquisti a 390 px da console rifiutato;
con sql/93 cancellazione da console rifiutata; CATALOGO_SENZA_SQL=1 dopo il
rollback); smoke TUTTO OK con e senza sql/93; matrice uguale (errori di
fatture, fatture_righe, fatture_scadenze già presenti prima); rollback
provato (schema identico con pg_dump). Senza sql/93: import senza
cancellazione uguale, nessun errore.
Dopo sql/98 (F16.7 motore unico dei PDF da modello, REGOLA DI ERIKA del
13/11: nessun flusso, bottone, obbligo o PDF di oggi cambia; ESEGUITO il
13/11 con il -REGISTRO-CANCELLAZIONI (backup pre98, controllo in regola): backup, anteprima in fondo al file,
98-motore-unico-pdf-modello.sql (senza parole di cancellazione, server MCP),
98-...-REGISTRO-CANCELLAZIONI.sql dall'EDITOR, controllo in fondo al 98;
richiede 07, 67, 71, si ferma senza; il sito si pubblica prima o dopo).
Tabella modelli_pdf (vedi "Tabelle Supabase") con il modello di prova
'prova' (titolo DOCUMENTO DI PROVA, testi premessa e note_finali, rev. 1).
Trigger trg_modelli_pdf_prima (BEFORE INSERT OR UPDATE, security definer):
blocchi = elenco di oggetti chiave/etichetta/testo (chiave unica
^[a-z][a-z0-9_]{0,39}$, testo max 4.000), codice fisso anche dall'editor;
per gli utenti del sito (utente_effettivo() non vuoto) solo
ruolo_corrente() = 'titolare' (42501, anche "Entra come"), niente insert,
chiavi, etichette, nome, descrizione e attivo fissi; revisione +1, chi e
quando a ogni cambio di titolo o testi (editor = "Editor SQL"), invariata se
non cambia nulla. RPC del sito: modelli_pdf_attivi() (true = il 98 c'è; il
sito oggi legge direttamente la tabella), salva_testi_modello_pdf(p_codice,
p_titolo, p_testi jsonb {chiave: testo}) (SOLO titolare, informatico
compreso; chiave sconosciuta 22023, modello sconosciuto P0002; spazi in
fondo tolti; risponde {revisione, cambiato}). Registro delle azioni di
sql/67 sulla tabella. Matrice: 10 righe nuove (lettura sì per i 9 ruoli,
nessuna scrittura; anon no). NEL SITO: js/00 (in fondo, F16.7) il motore
unico SOLO PER I PDF NUOVI (POS, verbale di consegna, DiCo, moduli: i PDF
di prima non lo usano e restano identici): TOLI_PDF_AZIENDA,
intestazionePdfToli(doc, {dicitura, revisione}) (fascia verde come js/27 e
js/71, restituisce la y), piedePdfToli(doc, {sinistra}) (su ogni pagina:
modello e revisione, "Generato il", "Pagina N di M"), improntaSha256,
scaricaBlobPdf, registraModelloPdf(codice, {nome, titolo, testi
predefiniti, sezioni, leggiDati, nomeFile}) (sezioni: campi, testo =
testo fisso del modello, tabella con colonne e righe dai dati, allegati,
firme; le "tabelle da query" le fa leggiDati), unisciModelloPdf,
disegnaPdfDaModello, generaPdfDaModello(codice, contesto, {scarica}) →
{blob, impronta SHA-256 del file scaricato, revisione, nomeFile, modello}.
js/72-modelli-pdf.js (caricato prima di js/19): leggiModelliPdf (cache 60
s; senza sql/98 una lettura 404, poi più nulla), verificaModelliPdfDisponibili,
leggiModelloPdf (riga attiva per il generatore, null = testi predefiniti del
sito), modello 'prova' (campi, premessa, tabella dei modelli letta dal
database, allegati, note finali, firme; stessi testi del file SQL);
Impostazioni > "🧾 Modelli dei PDF" (si-modelli-pdf-card, loadImp di js/10,
solo titolare): modelli con revisione e chi/quando, "✏️ Cambia i testi"
(finestra m-modello-pdf, id mpdf-: titolo e un'area di testo per testo
fisso, "💾 Salva i testi", "🧪 PDF di prova" con l'impronta mostrata).
modelli_pdf in LETTURE_QUASI_FISSE di js/01. SCELTE DICHIARATE: in tabella
solo titolo e testi fissi (la struttura del documento, tabelle e campi è nel
codice del modulo, come deciso dal piano); nessun modello vero (POS, verbale,
DiCo) creato ora: li aggiunge il modulo che li usa con il suo sql/NN e i suoi
testi da far confermare a Toli; l'impronta è del file generato e la
restituisce il generatore (salvarla è compito del modulo che archivia il
documento: nessuna tabella dei PDF generati qui); lettura per tutti gli
utenti attivi (i testi non sono riservati). Guida info-tit-43. Prove:
sql/98-motore-unico-pdf-modello-PROVA.sql (solo database di prova, rollback:
letture dei 9 ruoli e anon rifiutato, titolare e informatico salvano con
revisione, chi e registro, stessi testi = revisione invariata, chiave e
modello sconosciuti, titolo vuoto, oltre 4.000, Acquisti, rappresentante,
segreteria, tecnico, ingegnere, titolare "come" Acquisti e anon rifiutati,
insert/update/cancellazione diretti rifiutati, codice fisso, editor libero
con "Editor SQL", chiave ripetuta, cancellazione bloccata anche dal
proprietario); test/modelli-pdf.spec.js (Chrome headless, database locale:
titolare in Impostazioni scarica il PDF di prova rev. 1 con impronta uguale
al file, cambia la premessa → rev. 2 e il PDF successivo ha il testo nuovo e
"Modello prova - rev. 2"; Acquisti a 390 px genera lo stesso PDF ma la
console gli rifiuta RPC e update; titolare "come" Acquisti rifiutato;
MODELLI_SENZA_SQL=1 dopo il rollback: "non ancora attivi", PDF con i testi
predefiniti, un solo 404 della tabella); pdf-schede-tecniche TUTTO OK; smoke
TUTTO OK con e senza sql/98 (senza: un 404 di modelli_pdf solo per titolare e
informatico in Impostazioni, come avviso); matrice: nessuna differenza per
modelli_pdf (restano gli errori già noti di fatture*); rollback provato
(schema identico con pg_dump). Senza sql/98: riquadro "non ancora attivo",
PDF di prova con i testi predefiniti, nessun PDF di prima cambia, nessun
errore.
Dopo sql/266 (scheda tecnica Cartellonistica, richiesta di Erika del 13/11,
fuori piano; ESEGUITO il 13/11 dal server MCP, backup 2026-11-13-pre98,
controllo in regola; rollback 266-...-ROLLBACK.sql = campi tolti e
lavorazione spenta): solo dati del catalogo, nessuna tabella o policy,
matrice invariata. Lavorazione 'cartellonistica' (famiglia presidi, ACCESA)
con 18 campi: tipo_intervento (unico serve al prezzo), materiale_cartelli,
formato_cartelli, un numero in pz per cartello della legenda delle
planimetrie (cartello_chiamata_soccorsi, _punto_raccolta, _uscita_emergenza,
_direzione_esodo, _quadro_elettrico, _sgancio_energia, _divieto_fumo,
_divieto_fiamme, _estintore, _estintore_carrellato), planimetria_evacuazione
(al posto di "Voi siete qui") con formato_planimetria e supporto_planimetria,
altri_cartelli, note_tecniche (ingegnere). Estintori: numero_carrellati_
esistenti (ordine 25) e numero_carrellati_installare (35), facoltativi; il
menu "carrellati" resta. Nel sito (js/56, nessun file nuovo):
ICONE_CARTELLI_MOTORE e iconaCartelloMotore (icona del cartello accanto al
campo, per codice); aggiungiBottoniLavorazioniVerifica (apriVerificaTecnica
avvolta): nella Verifica tecnica (contenitore mvt-bottoni-schede di
index.html) un bottone "Compila ..." per ogni lavorazione ATTIVA del catalogo
che non è tra le 7 di SCHEDE_VECCHIE_MOTORE né il blocco comune ("🪧 Compila
cartellonistica"), i 7 bottoni di prima invariati; lavorazioneNuovaCatalogo:
per queste lavorazioni etichette e valori dei menu dal catalogo anche in
preventivo, copia di Acquisti e PDF (campoCatalogoMigrato). Voce
"Solo stampa plastificata" del supporto della planimetria: cambiata da Erika
dal catalogo (sql/267 preparato con lo stesso cambio, NON eseguito, non
serve). DECISIONE DI ERIKA del 13/11: il catalogo lavorazioni lo gestisce il
titolare; il bottone "📚 Catalogo lavorazioni" della pagina Verifiche
tecniche (vt-catalogo-btn, mostraBottoneCatalogoVerifiche di js/55) solo al
titolare, all'ingegnere resta "➕ Proponi un campo" nella scheda; SOLO IL
SITO (le regole di sql/75 lasciano ancora scrivere l'ingegnere da console).
Guide info-ing-18, 26, 32 riscritte.
PDF della richiesta al fornitore per sezione (F16.9, js/73-richiesta-
fornitore-sezioni.js caricato dopo js/72 e prima di js/19 + agganci in js/18
generaRichiestaQuotazionePDF, NESSUN SQL; decisione di Erika del 13/11: si fa
così e si corregge dopo la prova di Acquisti). renderFornitoriPreventivo
avvolta: nel riquadro di ogni fornitore, sopra "Salva dati fornitore",
"📑 Schede da mandare a questo fornitore" (data-rq-sezioni, spunte
data-rq-scheda per scheda di rilievo, blocco comune escluso, tutte spuntate
all'inizio) e "Rispondere entro il" (rq-entro-<id>). PDF: solo le schede
spuntate (tutte spuntate = come prima), titolo con la numerazione di tutte
le schede, tabella delle posizioni P-xx non tolte (regole e testi di js/71),
"Rispondere entro il", riquadro "PREZZO INDICATIVO" se una scheda ha
tipo_richiesta 'indicativa' (e "(prezzo indicativo)" nel suo titolo),
"Condizioni della richiesta" (TESTI_FISSI_RICHIESTA_FORNITORE); niente campi
livello ingegnere né note_tecniche/note_calcolo quando la scheda NON ha la
copia di Acquisti (con la copia vale la copia). SCELTA: spunte e data solo
in memoria (RQ_SEZIONI), non nel database: restano dopo "Salva dati
fornitore", ripartono ricaricando. Nessun bottone né flusso di prima
cambia. F16.8 (dati da chiedere al cliente): NON FARE, decisione di Erika
del 13/11. Guida info-com-29. Prova test/richiesta-fornitore-sezioni.spec.js
(database locale: Acquisti a 390 px e titolare, estintori tolti, data, PDF
con le sole porte, P-01/P-02, entro il, PREZZO INDICATIVO, condizioni, senza
note interne né posizione tolta; spunte dopo Salva; tutte spuntate = anche
gli estintori): TUTTO OK.
Dopo sql/100 (F16.11 stati del fornitore con controlli, VERSIONE RIDOTTA
decisa da Erika il 13/11, senza l'offerta per posizione di F16.10; ESEGUITO
il 13/11 con il -VINCOLO (backup pre100, controllo in regola): backup, anteprima in fondo,
100-stati-fornitore-controlli.sql (senza parole di cancellazione, server
MCP), 100-...-VINCOLO.sql dall'EDITOR (drop e add di
preventivi_fornitori_stato_check), controllo in fondo; richiede 71; nessuna
tabella nuova, matrice invariata; il sito si pubblica prima o dopo).
Trigger trg_preventivi_fornitori_stato (BEFORE INSERT OR UPDATE OF stato,
security definer): quando lo stato DIVENTA 'risposta_ricevuta' servono
prezzo_offerto > 0 e almeno una riga in preventivi_fornitori_allegati (22023
con il testo per l'utente), per ogni utente del sito anche "come"; editor
libero; le righe già in quello stato non si toccano. 'selezionato' e "Usa
nel preventivo cliente" come prima. -VINCOLO: stati NUOVI 'rifiutata' ("Il
fornitore non quota") e 'scaduta' ("Offerta scaduta"): restano nell'elenco
(solo 'scartato' esce), niente "Usa nel preventivo". RPC
stati_fornitore_controlli() -> {controlli, stati_nuovi} (in
RPC_SOLA_LETTURA_DB di js/01). Nel sito (js/18): STATI_FORNITORE,
verificaStatiFornitore, statiOffertaAmmessi (i 2 stati nel menu solo con il
-VINCOLO), mancaPerRispostaRicevuta (stesso controllo nel sito, vale anche
senza sql/100) in salvaDettagliFornitorePreventivo; caricando il PDF
(caricaPreventivoRicevutoFornitore) lo stato diventa 'risposta_ricevuta' da
solo SOLO con il prezzo già salvato, se no "PDF caricato: scrivi il prezzo
offerto...". In produzione al 13/11: 49 da_contattare, 1 risposta_ricevuta
senza prezzo (resta così). Guida info-com-30. Prove:
sql/100-...-PROVA.sql (17 controlli: Acquisti, titolare e titolare "come"
Acquisti senza prezzo/PDF 22023, con prezzo e PDF sì, insert già in
risposta, scelto come prima, stati nuovi, stato inventato 23514, editor
libero, permessi); test/stati-fornitore.spec.js (Acquisti a 390 px, con e
senza sql/100 con STATI_SENZA_SQL=1): TUTTO OK; rollback e riesecuzione
provati (vincolo identico a prima).
Dopo sql/268 (richieste di acquisto del capo tecnico ad Acquisti, richiesta
di Erika del 13/11, fuori piano; ESEGUITO il 13/11 con il
-REGISTRO-CANCELLAZIONI (backup pre100, controllo in regola): backup, anteprima in fondo, 268-richieste-acquisto.sql (senza
parole di cancellazione, server MCP), 268-...-REGISTRO-CANCELLAZIONI.sql
dall'EDITOR, controllo in fondo; richiede 07, 65, 67, 71; matrice: 10 righe
nuove; il sito si pubblica prima o dopo). Tabella richieste_acquisto (vedi
"Tabelle Supabase"). DECISIONI DI ERIKA: niente prezzi, niente fornitore nel
PDF, passi "Inviata al fornitore" e "Arrivato" con avviso al capo tecnico,
titolare fa tutto, segreteria sola lettura. RPC del sito:
richieste_acquisto_attive(), salva_richiesta_acquisto(p_id, p_oggetto,
p_note, p_righe) (nuova: capo_tecnico e titolare, numero per anno sotto
pg_advisory_xact_lock, avviso 'richiesta_acquisto' al ruolo commerciale;
correzione: capo tecnico solo 'inviata_acquisti', commerciale e titolare
fino alla presa in carico compresa; righe 1-100, quantità > 0 anche con la
virgola), prendi_in_carico_richiesta_acquisto (commerciale, titolare; chiude
l'avviso ad Acquisti), segna_richiesta_acquisto_inviata(p_id, p_nota)
(commerciale, titolare; avviso 'richiesta_acquisto_inviata' a chi l'ha
chiesta), segna_richiesta_acquisto_arrivata (commerciale, titolare,
capo_tecnico; avviso 'richiesta_acquisto_arrivata' a chi l'ha chiesta se non
è lui), annulla_richiesta_acquisto(p_id, p_motivo) (capo tecnico solo
'inviata_acquisti', commerciale e titolare prima dell'invio; motivo 3-500;
avviso 'richiesta_acquisto_annullata' al richiedente). Interne
righe_richiesta_acquisto, chiudi_avvisi_richiesta_acquisto. Nel sito
(js/74-richieste-acquisto.js, caricato dopo js/73 e prima di js/19): voce
"🛒 Richieste di acquisto" nel menu di titolare, capo tecnico, segreteria,
Acquisti e 'richieste-acquisto' in PAGINE_RUOLO; pagina pg-richieste-acquisto
(Aperte / Tutte, "➕ Nuova richiesta" a capo tecnico e titolare); finestra
m-richiesta-acquisto (id rqa-: oggetto, note, righe con "+ Aggiungi riga",
storico chi/quando, bottoni secondo ruolo e stato: Invia ad Acquisti, Salva
le modifiche, Prendi in carico, Scarica il PDF, Segna inviata al fornitore
(nota facoltativa), Segna arrivato, Annulla la richiesta (motivo)); PDF con
il motore unico di js/00 (registraModelloPdf('richiesta_acquisto'): campi,
testo "premessa", tabella del materiale, note; nessuna riga in modelli_pdf:
testi predefiniti del sito); avvisi (TIPI_AVVISO, OGGETTO_DA_TABELLA_AVVISO,
SCHEDE_CON_INDIRIZZO 'richiesta_acquisto' = pagina + finestra); Cosa tocca a
me di Acquisti "🛒 Richieste di acquisto da gestire". Guide info-ct-28,
info-com-31, info-seg-25, info-tit-44. Prove: sql/268-...-PROVA.sql (45
controlli) e test/richieste-acquisto.spec.js (capo tecnico a 390 px,
Acquisti, segreteria, tecnico; RICHIESTE_SENZA_SQL=1 dopo il rollback):
TUTTO OK; matrice TUTTO OK per la tabella nuova (restano gli errori noti di
fatture*); rollback e riesecuzione provati.
Dopo sql/269 (cancellare le richieste di acquisto, richiesta di Erika del
13/11; ESEGUITO il 13/11 dall'EDITOR (contiene "delete"; backup pre100,
controllo in regola); richiede 268 e il suo -REGISTRO-CANCELLAZIONI): RPC
elimina_richiesta_acquisto(p_id) (titolare e Acquisti qualunque richiesta in
qualunque stato; capo tecnico solo le sue in 'inviata_acquisti'; altri 42501;
p_id vuoto = niente, serve al sito per sapere se c'è). La riga si cancella e
resta nel registro delle azioni; avvisi aperti chiusi "Richiesta
cancellata"; se cancella un altro, avviso 'richiesta_acquisto_cancellata'
(senza collegamento) a chi l'aveva chiesta. Delete diretto ancora vietato,
matrice invariata. Sito (js/74): "🗑️ Cancella" con conferma
(puoCancellareRichiestaAcquisto, verificaCancellazioneRichiesteAcquisto);
guide ct-28, com-31, tit-44. Prove: sql/269-...-PROVA.sql (15 controlli) e
test/richieste-acquisto.spec.js con e senza sql/269: TUTTO OK.
Margine per categoria (F16.48, js/75-margine-categorie.js caricato dopo
js/74, NESSUN SQL; decisione di Erika del 13/11, E3 = solo avviso): gruppo =
categoria della voce (le voci a gruppi di F16.15 e i modelli non si fanno),
margine prima della provvigione (prezzi rimandati), soglia FISSA
SOGLIA_MARGINE_CATEGORIA = 20 (nelle Regole serve SQL: con i prezzi).
Riquadro "📊 Margine per categoria" sotto i totali dell'editor delle voci
(pvv-margine-gruppi in js/18, aggiornato da aggiornaRiepilogoVociPreventivo),
righe gialle sotto la soglia; generaPreventivoClientePDF avvolta: il PDF
esce e compare l'avviso; titolare: riga di Cosa tocca a me "📊 Preventivi con
una categoria sotto il 20% di margine" sui preventivi di Acquisti da
controllare (preventiviConCategoriaSottoSoglia). F16.12-F16.46 tranne 34, 35,
47, 48: saltate o rimandate (decisione di Erika del 13/11, note nell'Excel).
Guide info-com-32, info-tit-45. Prova test/margine-categorie.spec.js: TUTTO OK.
Dopo sql/112 (F16.34 preventivo a computo del cliente per le gare, versione
decisa da Erika il 13/11: le righe del computo DIVENTANO le voci, nessuna
tabella a parte; ESEGUITO il 13/11 dal server MCP (backup pre112, controllo in regola): backup,
anteprima in fondo, file (senza parole di cancellazione, server MCP),
controllo; richiede 07, 25, 71, 258, 265; matrice invariata): colonna
preventivi_voci.codice_cliente (max 50, una riga; vincolo
preventivi_voci_codice_cliente_check), trigger
trg_preventivi_voci_codice_cliente (spazi tolti; dopo l'esito solo il
titolare, come sql/265), dati_pdf_preventivo_cliente agganciata sul posto
("'quantita_um', v.quantita_um," + 'codice_cliente'; se 265 o 264 si
rieseguono o fanno rollback dopo, rifare l'aggancio). Sito
(js/76-computo-gare.js caricato dopo js/75 + agganci in js/18): "📥 Importa
computo del cliente" nell'editor delle voci (Excel/CSV max 5 MB, primo
foglio, intestazione cercata nelle prime 15 righe: Codice, Descrizione, U.M.,
Quantità con la virgola; righe senza descrizione o quantità saltate e
elencate; conferma con anteprima; voci nuove categoria 'altro', costo e
prezzo vuoti, si salvano con "💾 Salva preventivo"); campo "Cod. ente" sulla
voce solo nei preventivi con almeno un codice
(verificaCodiceClienteVociDisponibile, select *); PDF del cliente colonna
"Cod." se una voce ce l'ha (anche con i dati esterni del rappresentante).
Senza sql/112 il codice va all'inizio della descrizione "[A.01.003] ...".
Guide info-com-33, info-tit-46. Prove: sql/112-...-PROVA.sql (stessa
struttura di 265-PROVA) e test/computo-gara.spec.js (Acquisti a 390 px, 20
righe, con e senza sql/112): TUTTO OK.
Dopo sql/113 (F16.35 scheda gara, pagina "🏛️ Gare" decisa da Erika il 13/11;
ESEGUITO il 13/11 con il -REGISTRO-CANCELLAZIONI (backup pre112, controllo in regola): backup, anteprima in fondo,
113-scheda-gara.sql (senza parole di cancellazione, server MCP),
113-...-REGISTRO-CANCELLAZIONI.sql dall'EDITOR, controllo in fondo; richiede
07, 67, 71; matrice: 10 righe nuove). Tabella gare (codice GA-AAAA-NNN dal
database, ente, oggetto, CIG ^[A-Z0-9]{10}$, scadenza_presentazione,
sopralluogo_obbligatorio e _il, preventivo_id facoltativo, note, checklist
jsonb [{voce, stato da_fare|fatto|non_serve, nota}] max 40, decisione
da_decidere|partecipa|non_partecipa con nota e chi/quando, stato
aperta|presentata|non_presentata|aggiudicata|persa, chi e quando). RLS:
lettura, inserimento e modifica DIRETTI titolare, commerciale, segreteria;
nessuna cancellazione. Trigger trg_gare_prima (per gli utenti del sito,
anche "come"; editor libero): decisione solo titolare (42501); 'presentata'
solo con decisione 'partecipa' e nessun documento 'da_fare' (22023); da
presentata solo aggiudicata o persa (salvo titolare); codice, numero, chi
l'ha creata fissi. RPC gare_attive(). Sito (js/77-gare.js caricato dopo
js/76): voce "🏛️ Gare" nel menu e 'gare' in PAGINE_RUOLO di titolare,
segreteria, commerciale; pagina pg-gare (Aperte/Tutte, scadenza in rosso
entro 5 g lav.), finestra m-gara (id gar-: dati, checklist predefinita
CHECKLIST_GARA_PREDEFINITA, decisione con i bottoni del titolare, Salva,
Segna presentata, Non presentata, Aggiudicata, Persa, preventivo collegato
per numero con "Apri"); Cosa tocca a me "Gare in scadenza entro 5 giorni
lavorativi" (titolare, Acquisti, segreteria; calcolata nel sito con
giorniLavorativiTra, SCELTA come F15.18: niente motore delle scadenze) e
"Gare da decidere" (titolare); SCHEDE_CON_INDIRIZZO 'gara'. Guide
info-com-34, info-seg-26, info-tit-47. Prove: sql/113-...-PROVA.sql (27
controlli), test/gare.spec.js (Acquisti a 390 px, titolare, segreteria,
capo tecnico e rappresentante senza pagina; GARE_SENZA_SQL=1): TUTTO OK;
smoke TUTTO OK (ATTESE con 'gare'); matrice TUTTO OK per la tabella nuova.
Dopo sql/227 (F17.14 solo Acquisti ordina ai fornitori, decisione di Toli E8
approvata da Erika il 13/11; ESEGUITO il 16/11 (backup pre227-147, controllo in regola) con "CONFERMATO DA TOLI: sql/227":
backup, anteprima in fondo, file (senza parole di cancellazione, server MCP),
controllo; richiede 30, 42, 71; matrice invariata): AGGANCIO SUL POSTO
(pg_get_functiondef + replace) di crea_ordine_fornitore (verifica_ruolo
senza 'rappresentante') e cambia_stato_ordine_fornitore (conferma e
annullamento solo titolare e commerciale, messaggi "Acquisti o il
titolare"); rollback = replace al contrario (funzioni identiche, md5
provato). NON cambiano: offerte_ordinabili_commessa (il rappresentante vede
le offerte da ordinare), lettura degli ordini, "Arrivato", passo "Materiali
ordinati" della commessa (cambia_stato_commessa: SCELTA del 13/11, lo segna
ancora il rappresentante; la task proponeva di spostarlo ad Acquisti). Sito:
js/27 RUOLI_CREANO_ORDINI = titolare, commerciale (+ RUOLI_VEDONO_OFFERTE_ORDINI
con il rappresentante per offerte e suggerimento), js/29 vede le offerte con
RUOLI_VEDONO_OFFERTE_ORDINI, js/46 "Commesse da ordinare (passo 7)" anche ad
Acquisti. Guide info-rap-14 riscritta, info-com-35, info-tit-48. Prova
sql/227-...-PROVA.sql: rappresentante e titolare "come" rappresentante
rifiutati (crea, conferma, annulla), Acquisti crea e conferma, titolare
annulla, il rappresentante legge ordine e offerte: OK.
Dopo sql/126 (F17.2 scadenze delle richieste ai fornitori, approvata da
Erika il 13/11 come solo promemoria; ESEGUITO il 16/11 (backup pre227-147, controllo in regola) con "CONFERMATO DA TOLI: sql/126": backup, file (senza parole di cancellazione, server MCP),
controllo; richiede 71; matrice invariata): preventivi_fornitori colonne
risposta_entro, esito_telefonata (max 500), telefonata_il, telefonata_da,
telefonata_da_nome (chi e quando dal trigger
trg_preventivi_fornitori_telefonata); scrive chi oggi scrive le offerte
(policy di prima); RPC fornitori_scadenze_attive(). Sito
(js/78-scadenze-fornitori.js caricato dopo js/77): riquadro "⏰ Risposta del
fornitore" nel riquadro del fornitore (renderFornitoriPreventivo avvolta):
data con "💾 Salva la data", "📞 Ho telefonato" (esito nel prompt, nuova
scadenza a 2 g lav.), rosso oltre la data; segnaRichiestaFornitoreInviata
avvolta: data proposta a 3 g lav. se vuota; Cosa tocca a me: Acquisti "📞
Fornitori da sollecitare", titolare "Richieste ai fornitori ferme da più di 2
giorni lavorativi" (aprono il preventivo sulla scheda Fornitori). Scelte:
giorni fissi (3, 2, 2), niente motore delle scadenze. Guide info-com-36,
info-tit-49. Prove: sql/126-...-PROVA.sql e test/scadenze-fornitori.spec.js
(Acquisti a 390 px, titolare): TUTTO OK.
Dopo sql/245 (F17.11 affidabilità del fornitore, approvata da Erika il 13/11
come SOLA INFORMAZIONE: niente motivo obbligatorio né avviso per i "rossi";
ESEGUITO il 16/11 (backup pre227-147, controllo in regola) con "CONFERMATO DA TOLI: sql/245": backup, file (server MCP),
controllo; richiede 30, 42, 71, 240; nessuna tabella, matrice invariata): RPC
affidabilita_fornitore(p_fornitore) -> jsonb (solo titolare e commerciale,
42501 per gli altri anche "come"; ultimi 12 mesi: puntualità 40 = arrivati
entro arrivo_previsto_iniziale + 3 gg, errori 30 = ordini senza
arrivo_annullato_il, risposte 15 = richieste inviate da più di 5 giorni con
risposta; pesi ridistribuiti; meno di 3 ordini = pochi_dati, 70). Sito
(js/79-affidabilita-fornitori.js, dopo js/78; in RPC_SOLA_LETTURA_DB): badge
nel riquadro del fornitore del preventivo e sotto il nome nella scheda del
fornitore (openFornitoreDetail avvolta), cache 2 minuti. Guide info-com-37,
info-tit-50. Prove: sql/245-...-PROVA.sql (5 ordini = 69, 2 ordini = pochi
dati, data spostata non conta) e test/affidabilita-fornitori.spec.js: TUTTO OK.
Dopo sql/128 (F17.12 ordini liberi senza offerta, destinazione COMMESSA,
decisione di Toli D3 approvata da Erika il 13/11; ESEGUITO il 16/11 (backup pre227-147, controllo in regola) con "CONFERMATO DA TOLI: sql/128": backup, 128-...-VINCOLO.sql dall'EDITOR (drop e add di
ordini_fornitori_stato_check con 'da_approvare'), poi 128-ordini-liberi-senza-
offerta.sql (senza parole di cancellazione, server MCP), controllo in fondo;
richiede 30, 62, 65, 71; matrice invariata): ordini_fornitori colonne origine
('offerta' | 'libero', default 'offerta'), allegato_path, allegato_nome,
approvato_da, approvato_da_nome, approvato_il; regola NUOVA soglia_ordine_libero
(2.000 € IVA esclusa, sopra = approvazione; REGOLE_PREDEFINITE di js/01). RPC
crea_ordine_libero(commessa, fornitore, data, arrivo, voci, luogo, note,
allegato_path, allegato_nome) (solo commerciale e titolare, anche "come"; voci
con prezzo; sopra la soglia stato 'da_approvare' e avviso 'ordine_da_approvare'
al titolare), approva_ordine_libero(id, approva, motivo) (SOLO titolare: sì =
'ordinato' con chi/quando, no = 'annullato' con "Non approvato dal titolare:
..."; avviso 'ordine_libero_esito' a chi l'ha creato), ordini_liberi_attivi().
Sito (js/80-ordini-liberi.js, dopo js/79, + js/27 e index.html mof-libero):
"➕ Ordine libero (senza offerta)" nel box Ordini della commessa (Acquisti e
titolare), stessa finestra m-ordine-fornitore con fornitore dall'anagrafica e
allegato (cartella "ordini" della commessa, registra_documento_commessa);
PDF solo se non è da approvare; badge "Ordine libero", "📎 Preventivo del
fornitore", "✅ Approva" / "✖ Non approvare" del titolare; Cosa tocca a me del
titolare "Ordini liberi da approvare"; avvisi con rotta 'ordine' (apre la
commessa). Il capo tecnico vede gli ordini senza prezzi come prima. NON FATTO:
destinazione magazzino (modulo Magazzino). Guide info-com-38, info-tit-51.
Prove: sql/128-...-PROVA.sql e test/ordini-liberi.spec.js (Acquisti a 390 px
300 € ordinato con PDF, 3.000 € da approvare, titolare approva, capo tecnico e
rappresentante): TUTTO OK; smoke TUTTO OK; rollback e riesecuzione provati.
Dopo sql/129 (F17.13 mezzo fermo e multe, VERSIONE RIDOTTA decisa da Erika il
13/11: niente scadenze di assicurazione/revisione/bollo/tagliando, niente
incidenti, niente pagina nuova; conducente proposto solo dalla squadra del
cantiere. ESEGUITO il 16/11 (backup pre227-147, controllo in regola) con "CONFERMATO DA TOLI: sql/129": backup, file (senza
parole di cancellazione, server MCP), -REGISTRO-CANCELLAZIONI dall'EDITOR,
controllo in fondo; richiede 07, 35, 67, 71; matrice: 10 righe nuove;
il sito si pubblica prima o dopo). mezzi_attrezzature: fermo_dal, fermo_causa
(vincolo mezzi_attrezzature_fermo_check: con la data la causa 3-300), scritte
dai ruoli di sql/35 con update diretto; registro delle azioni ora anche su
mezzi_attrezzature. Tabella mezzi_multe (vedi "Tabelle Supabase"); trigger
trg_mezzi_multe_prima (security definer: ruoli, addebito solo titolare 42501
anche "come", data non futura e notifica non prima 22023, scadenza, nomi, chi
e quando; editor libero). RPC mezzi_multe_attive(). Sito
(js/81-mezzi-fermo-multe.js dopo js/80; js/33 legge i mezzi con select *;
index.html m-mezzo-fermo id mzf-, m-mezzo-multe id mlt-): nel box della
squadra della scheda Cantiere "🚐 Mezzi: fermo e multe" (titolare, segreteria,
capo tecnico; apre l'Elenco mezzi e attrezzature, che prima si apriva solo
dalla squadra del giorno), su ogni mezzo "🛑 Segna fermo" / "🛑 Fermo" e
"🧾 Multe", "🧾 Tutte le multe"; nella squadra del giorno il mezzo fermo resta
sceglibile con l'avviso rosso (solo avviso); la multa propone come conducente
chi era nella squadra di quel giorno con quel mezzo (commesse_squadra_*, letti
dai tre ruoli). Cosa tocca a me: segreteria e titolare "Multe: conducente da
comunicare" (entro 15 giorni o scaduto) e "Multe da pagare", titolare "Multe:
addebito da decidere". NON FATTO: mezzo sugli interventi di manutenzione,
targa nella ricerca globale, allegato del verbale. Guide info-seg-27,
info-ct-29, info-tit-52. Prove: sql/129-...-PROVA.sql (multa del 10/03 →
09/05, notifica, addebito di segreteria, capo tecnico, titolare "come"
segreteria rifiutato, tecnico, Acquisti, "come" rappresentante rifiutati,
cancellazione rifiutata, annullata con motivo, fermo con e senza causa,
registro) e test/multe-mezzi.spec.js (segreteria a 390 px registra la multa
con il tecnico proposto, Cosa tocca a me, titolare addebito, capo tecnico a
390 px fermo e avviso nella squadra, console di tecnico e segreteria
rifiutate): TUTTO OK; smoke TUTTO OK con e senza; rollback e riesecuzione
provati.
Anticipo atteso, promemoria (F18.4, js/82-anticipi-attesa.js dopo js/81 +
js/13, NESSUN SQL; decisione di Toli E7, task scelta da Erika il 16/11):
giorni di calendario dall'accettazione del cliente (esito_registrato_il) dei
preventivi in_attesa_anticipo, fissi nel sito (ANTICIPO_PROMEMORIA_GG di js/13:
7, 15, 30, 60; nelle Regole servirebbe SQL). Cosa tocca a me: rappresentante
"Anticipo non ancora pagato da 7 giorni: richiama il cliente" (7-14) e, rossa,
"... da più di 15 giorni: sollecita il cliente"; titolare "Anticipi non pagati
da più di 30 giorni" (30-59) e, rossa, "... da più di 60 giorni: decidi se
rifiutare il preventivo" (anche nella pagina ⚖️ Decisioni, sezione delle
fonti), che apre apriRifiutoAnticipoNonVersato (js/18) sul più vecchio. Box
"Ricorda l'anticipo" del rappresentante: "· richiama il cliente" / "· sollecita
il cliente" (rossa) sull'etichetta dei giorni. NESSUN annullamento automatico:
il rifiuto resta "Rifiuta: anticipo non versato" di segreteria o titolare.
NON FATTO: anticipo di default dal cliente (dipende da F16.39, rimandata).
Guide info-rap-38, info-tit-53, info-seg-28. Prova test/anticipi-attesa.spec.js
(database locale, preventivo accettato 8/16/31/61 giorni fa; rappresentante a
390 px, titolare con la pagina Decisioni, segreteria): TUTTO OK; smoke TUTTO OK.
Dopo sql/141 (F18.14 noli con restituzione e inventario delle attrezzature,
versione decisa da Erika il 16/11: restituzione e proroga, a chi è assegnata
e dove, stato; NON il "nolo contestato". ESEGUITO il 16/11 (backup pre227-147, controllo in regola) con "CONFERMATO DA TOLI: sql/141": backup, file (senza parole di cancellazione, server MCP), controllo
in fondo; richiede 07, 31, 35, 71, 129 (si ferma senza: va eseguito DOPO
sql/129); nessuna tabella nuova, matrice invariata). mezzi_attrezzature:
stato (in_uso, fuori_uso, rubata, dismessa; vincolo
mezzi_attrezzature_stato_fermo_check: diverso da in uso = fermo_dal e
fermo_causa di sql/129 compilati, i mezzi già fermi diventano fuori_uso),
assegnata_a (utente), dove (max 200): update diretto dei ruoli di sql/35,
chi e quando nel registro delle azioni. commesse_richieste_integrazione
(solo noli): restituito_il, restituito_da/_nome, restituzione_registrata_il,
nota_restituzione, proroghe jsonb [{da, a, motivo, chi, il}]. RPC
segna_nolo_restituito(p_richiesta_id, p_data, p_nota) (titolare, capo
tecnico, Acquisti, segreteria; noli evasi o arrivati; data non futura; anche a
commessa chiusa), proroga_nolo(p_richiesta_id, p_fino_al, p_motivo)
(titolare, capo tecnico, Acquisti; data dopo quella di prima, motivo 3-300),
annulla_restituzione_nolo(p_richiesta_id) (solo titolare),
noli_restituzione_attiva(); interna nome_utente_nolo(). Sito
(js/83-noli-restituzione.js dopo js/82 + js/81, index.html m-nolo id nol-,
m-mezzo-fermo esteso): sulle righe dei noli di js/28 "Da restituire entro il"
(gialla entro 2 giorni, rossa se scaduta), "↩️ Restituito", "📅 Proroga",
"↩️ Restituito il" con "Togli (errore)" del titolare, proroghe nei "Dettagli e
passaggi"; Cosa tocca a me di capo tecnico e Acquisti "Noli da restituire entro
2 giorni" e, rossa, "Noli scaduti da restituire" (calcolate nel sito); js/81:
con sql/141 "📍 Stato e posizione" su mezzi e attrezzature (stato, dal, causa,
assegnata a, dove; dismessa = anche non attiva), nell'elenco stato e
"👤 ... · 📍 ...", nella squadra del giorno fuori uso e rubata con l'avviso
rosso (solo avviso, decisione di Erika). Guide info-ct-30, info-com-39,
info-tit-54. Prove: sql/141-...-PROVA.sql e test/noli-attrezzature.spec.js
(capo tecnico a 390 px proroga e trapano fuori uso, Acquisti restituito,
titolare toglie, console di tecnico e segreteria rifiutate): TUTTO OK;
multe-mezzi aggiornato e TUTTO OK; smoke TUTTO OK con e senza; rollback e
riesecuzione provati.
Dopo sql/147 (F18.21 reso: materiale sbagliato o danneggiato, scelta da Erika
il 16/11; ESEGUITO il 16/11 (backup pre227-147, controllo in regola) con "CONFERMATO DA TOLI: sql/147": backup, file (senza
parole di cancellazione, server MCP), -REGISTRO-CANCELLAZIONI dall'EDITOR,
controllo in fondo; richiede 07, 29, 30, 65, 67, 71; 128 per il riordino;
matrice: 10 righe nuove). Tabella ordini_fornitori_resi (vedi "Tabelle
Supabase"); policy di lettura con la sottoquery su ordini_fornitori (RLS di
sql/30). RPC segnala_reso_ordine(p_ordine_id, p_problema, p_descrizione,
p_voci, p_foto) (titolare, capo tecnico, Acquisti; ordine 'arrivato'; voci con
quantità; foto solo <commessa>/ordini/; avviso 'reso_segnalato' al ruolo
commerciale con rif l'ordine, se non segnala lui), aggiorna_reso_ordine(p_id,
p_azione reso_inviato|riordine|chiudi, p_esito, p_nota, p_riordine_ordine_id)
(titolare, Acquisti; riordino = altro ordine non annullato della stessa
commessa; esito sostituito/rimborsato/tenuto/altro con nota; chiude l'avviso),
imposta_causale_reso(p_id, p_causale, p_nota) (SOLO titolare, anche "come" =
42501: fornitore, rilievo, trasporto, progetto), resi_ordini_attivi(); interne
nome_utente_reso, chiudi_avvisi_reso_ordine, segna_reso_controlla_elenchi.
Sito (js/84-resi-ordini.js dopo js/83; js/27: data-ordine-id sulla riga
dell'ordine; js/80: dopoOrdineLibero(id), aggancio dopo la creazione
dell'ordine libero, azzerato a ogni apertura; index.html m-reso id rso-): sotto
l'ordine arrivato "⚠️ Segnala problema" (problema, descrizione, voci con
quantità, foto rimpicciolite con ridimensionaFotoGiornale di js/35 nella
cartella "ordini" con registra_documento_commessa) e l'elenco dei resi con
stato e causale; "Apri": passaggi e foto, Acquisti e titolare "📦 Reso al
fornitore", "🔁 Riordina (ordine libero)" (finestra di js/80 già compilata con
fornitore, voci, prezzi, nota; il nuovo ordine si collega al reso), "✅ Chiudi
il reso" con l'esito; titolare la causale. Cosa tocca a me: Acquisti "Resi da
gestire", titolare "Resi: causale da decidere"; TIPI_AVVISO reso_segnalato.
NON FATTI: magazzino "fuori standard" (modulo Magazzino), riga nel report del
venerdì (non esiste). Guide info-ct-31, info-com-40, info-tit-55. Prove:
sql/147-...-PROVA.sql e test/resi-ordini.spec.js (capo tecnico a 390 px
segnala, Acquisti reso/riordino/chiusura, titolare causale, console di tecnico
e Acquisti rifiutate): TUTTO OK; caricamento delle foto NON provato in locale
(niente Storage); ordini-liberi e smoke TUTTO OK con e senza; rollback e
riesecuzione provati.
Dopo sql/270 (stato dei pagamenti del cliente per tecnici e capo tecnico,
richiesta di Erika del 16/11, fuori piano; ESEGUITO il 16/11 (backup pre270, controllo in regola) con "CONFERMATO DA TOLI: sql/270": backup, file (senza parole di cancellazione, connettore), controllo in
fondo; richiede 07, 71; nessuna tabella nuova, matrice invariata). DECISIONI DI
ERIKA: il flag lo mettono A MANO segreteria e titolare (le fatture vere si fanno
fuori dal gestionale: in produzione 1 fattura emessa); tre stati; SOLO AVVISO;
tecnici e capo tecnico vedono flag e motivo, mai importi. clienti colonne NUOVE
stato_pagamenti ('regolare' predefinito, 'ritardo' 🟡 si interviene avvisando la
segreteria, 'bloccato' 🔴 non intervenire), stato_pagamenti_nota (motivo
obbligatorio 3-300 se non regolare), stato_pagamenti_da/_da_nome/_il. Trigger
trg_clienti_stato_pagamenti: le colonne si cambiano solo dentro la RPC (segno
toli.stato_pagamenti), 42501 per gli update diretti degli utenti del sito, editor
libero. RPC imposta_stato_pagamenti_cliente(p_cliente_id, p_stato, p_nota) (solo
titolare e segreteria, anche "come"), stato_pagamenti_clienti() (clienti non
regolari con stato, motivo, chi, quando e odl_ids degli interventi da pianificare
o pianificati NON eliminati; titolare, segreteria, capo_tecnico, tecnico,
rappresentante, commerciale, contabile; non ingegnere né anon; in
RPC_SOLA_LETTURA_DB di js/01). Sito (js/85-stato-pagamenti.js dopo js/84,
index.html m-stato-pagamenti id spg-): scheda cliente riquadro cd-pagamenti
("✅ Pagamenti regolari" o il banner) e "💶 Stato dei pagamenti" per segreteria e
titolare; un controllore della pagina (MutationObserver) cerca negli attributi
onclick e data-* l'id di un cliente segnato o di un suo intervento aperto e mette
il badge 🟡/🔴 sulla riga (tr, li, .card, righe con bordo) di ogni pagina aperta
(dashboard, Piano mensile, ripartenza, appuntamenti, calendari, Interventi);
banner sotto mo1 (finestra dell'intervento), tc1 e tc-odl (Esegui intervento);
Cosa tocca a me di capo tecnico e segreteria "Interventi aperti di clienti da non
contattare (pagamenti)"; lettura ogni 5 minuti e dopo ogni cambio. Guide
info-tec-25, info-ct-32, info-seg-29, info-tit-56. Prove:
sql/270-...-PROVA.sql e test/stato-pagamenti.spec.js (segreteria a 390 px,
capo tecnico con Interventi, finestra e Cosa tocca a me, tecnico a 390 px in
Esegui intervento, console di tecnico, ingegnere e capo tecnico): TUTTO OK; smoke
TUTTO OK con e senza (senza: un 404 per utente, solo avviso); rollback e
riesecuzione provati.
Dopo sql/146 (F18.20 materiale fornito dal cliente, scelte di Erika del 20/11;
ESEGUITO il 20/11 (backup 2026-11-20-143226-pre146, controllo in regola:
tabella, policy 1, funzioni 6, registro 1, cancellazioni 1, anon false;
funzioni e vincoli identici al locale) con "CONFERMATO DA TOLI: sql/146",
file dal connettore, -REGISTRO-CANCELLAZIONI dall'editor; provato in locale con 146-...-PROVA.sql: 26
ok; matrice: 10 righe, nessuno scarto): tabella NUOVA
commesse_materiale_cliente (descrizione 3-500, quantita > 0, unita_misura,
arrivo_previsto, stato atteso | arrivato | non_conforme | tolto, data_arrivo,
nota_controllo, dop_documento_id → commesse_documenti cartella certificati,
motivo_tolto, segnato_/controllato_ da/_nome/_il). Lettura = chi legge la
commessa. RPC segna_materiale_cliente, cambia_arrivo_materiale_cliente,
togli_materiale_cliente (titolare, capo tecnico, rappresentante del cliente;
commessa aperta; solo "atteso"), registra_arrivo_materiale_cliente (titolare,
capo tecnico; conforme = DoP obbligatoria, non conforme = nota; non nel
futuro), controlla_materiale_cliente, materiale_cliente_attivo. Registro
delle azioni. Sito: js/109 (vedi docs/commessa.md).
Dopo sql/133 (F18.5 vendita semplice, D8 di Toli; scelte di Erika del 19/11:
fattura di segreteria e titolare, sopra 1.000 € e righe fuori catalogo solo
avviso; ESEGUITO il 20/11 (backup 2026-11-20-100516-pre132, controllo in
regola: funzioni 2, attiva true, emette_vendita true, anon false) con
"CONFERMATO DA TOLI: sql/133", file dal connettore, poi
133-vendita-semplice-VINCOLO.sql dall'EDITOR (drop/add del vincolo
fatture_origine_check con 'vendita'); provato in locale
con 133-...-PROVA.sql: PROVA sql/133 OK, rollback e riesecuzione provati):
nessuna tabella. RPC NUOVE crea_bozza_vendita_da_ddt(p_ddt_id, p_iva_perc)
(DDT senza scheda di lavoro, non eliminato, non già in fattura; bozza con
origine 'vendita', righe origine 'ddt' e fonte 'ddt' copiate dal DDT; usa
toli.fatture_rpc per il trigger trg_fatture_blocco_emesse; restituisce
{id, avvisi[]}) e vendite_semplici_attive() (true se il vincolo ammette
'vendita'); emetti_fattura riscritta uguale a sql/46 con origine in
('scheda','vendita'). Rollback: si ferma se ci sono fatture di vendita.
Dopo sql/132 (F18.3, versione scelta da Erika il 19/11: richiami del
preventivo e accettazione con condizioni diverse; ESEGUITO il 20/11 (backup
2026-11-20-100516-pre132, controllo in regola: tabelle 2, policy 2, funzioni
6, registro 2, cancellazioni 2) con "CONFERMATO DA TOLI: sql/132", file dal
connettore, -REGISTRO-CANCELLAZIONI dall'editor; provato sul database locale con
132-...-PROVA.sql: PROVA sql/132 OK; matrice: 20 righe, nessuno scarto):
tabelle NUOVE preventivi_richiami (preventivo_id, esito ci_pensa |
non_risponde | vuole_modifiche | richiamare (con richiamare_il) | altro,
nota, registrato_da/_nome/_il) e preventivi_condizioni_diverse (una riga
per preventivo: testo, segnalato_da/_nome/_il, visto_da/_nome/_il,
nota_titolare). Lettura titolare, segreteria, commerciale e rappresentante
dei preventivi dei suoi clienti (preventivo_del_mio_cliente); scrittura solo
con le RPC registra_richiamo_preventivo (preventivo inviato_a_rappresentante
non sostituito; rappresentante del cliente o titolare),
segna_condizioni_diverse_preventivo (in_attesa_anticipo o accettato; la
correzione azzera l'OK), vista_condizioni_diverse_preventivo (titolare),
richiami_preventivo_attivi. Registro delle azioni sulle due tabelle. Lo
stato del preventivo non cambia mai. Sito: js/105 (vedi docs/commessa.md).
Dopo sql/273 (il capo tecnico segna "il cliente non paga", richiesta di Erika
del 17/11: presidio scaduto in "Controlli scaduti: da ripianificare" fermo
perché il cliente non paga; ESEGUITO il 17/11 (backup pre273, dal server MCP, controllo OK):
backup, file (senza parole di cancellazione), controllo in fondo; richiede 270,
65, 71; nessuna tabella nuova, matrice invariata). DECISIONI DI ERIKA: segna
anche il capo tecnico; riga grigia a parte; solo avviso. SQL: rifà
imposta_stato_pagamenti_cliente (v_versione sql/273): capo_tecnico ammesso solo
per ritardo/bloccato (42501 su "regolare": il segno lo tolgono segreteria e
titolare), se lo segna il capo tecnico crea_avviso tipo stato_pagamenti_cliente
a segreteria e titolare (rif clienti); capo_tecnico_segna_pagamenti_attivo().
ROLLBACK dall'editor (rimette il corpo di sql/270, identico a produzione: md5
controllato il 17/11). Sito js/102-capo-tecnico-non-paga.js (dopo js/101):
controlliDaRipianificare avvolta (i clienti 🔴 escono da lista, Piano mensile e
conteggio di Cosa tocca a me, tenuti in ris.fermiNonPaga), dashboard del capo
tecnico con "⛔ Non paga" (data-non-paga) accanto ad "Apri cliente" e sezione
chiusa <details data-fermi-non-paga> "⛔ Fermi: il cliente non paga (N)" con
motivo, chi, quando; RUOLI_SEGNANO_PAGAMENTI + capo_tecnico (scheda cliente);
finestra m-stato-pagamenti senza "Regolare" per il capo tecnico (+ nota
spg-nota-ct); dopo il salvataggio la lista si ridisegna. Prove:
sql/273-...-PROVA.sql (OK; prima del file fallisce), rollback e riesecuzione,
test/capo-tecnico-non-paga.spec.js (capo tecnico 390 px, segreteria toglie il
segno, cliente torna): TUTTO OK; stato-pagamenti.spec.js e smoke con e senza
TUTTO OK.
Periodo dei controlli e interventi in ritardo (richiesta di Erika del 16/11,
js/86-periodo-presidi-interventi.js dopo js/85 + index.html m-interventi-ritardo
id mir-, NESSUN SQL, nessun dato cambia). Trovato in produzione: 798 presidi senza
impianti.data_prossimo_controllo (591 calcolabili, 215 già scaduti) e registri
fermi (data_ultimo_controllo 04/03/2025 con lo storico a febbraio 2026). Scheda
del presidio (apriSchedaPresidio legge prima l'ultima scheda dello storico:
schede_presidi anno/mese, schede_manichette data_intervento;
campiSchedaPresidio avvolta): riquadro "📆 Controlli" (periodicita_mesi e mesi
di ciclo_manutenzione, es. "ogni 6 mesi (semestrale) · febbraio e agosto"),
"Ultima verifica" dallo storico se più recente ("· dallo storico"; conta la DATA VERA dati.data_ultimo_controllo della scheda, la casella anno/mese solo se manca: le schede importate il 20/10 sono nel "mese 2" anche con la verifica di settembre, es. ALESSANDRO CERAMICHE 08/09/2026 → prossima febbraio 2027), "Prossima
verifica" se vuota calcolata a video (gruppo di due mesi e 6 mesi = mese del
gruppo del semestre dopo; altrimenti ultimo + periodicità; "— ⚠️ SCADUTO" rosso a
mese finito; "(calcolata)"), estintori senza revisione "non registrata". DECISIONE
DI ERIKA: solo a video, il registro NON si aggiorna (salvarlo = file SQL su 591
presidi). Interventi in ritardo (in_ritardo_il di marca_ritardi_pendenti =
data pianificata passata e non chiuso): "⏰ In ritardo da N giorni: era previsto
il GG/MM/AAAA (manutenzione del N° semestre AAAA)" in cima alla finestra
dell'intervento (openEditOdl avvolta, mo-ritardo), sotto la data nella pagina
Interventi (renderO avvolta) e nel riquadro "⏰ In ritardo" della dashboard del
capo tecnico, ora cliccabile (apriInterventiInRitardo: elenco con tecnico e
"Apri"). Cosa si controlla (richiesta di Erika del 16/11, stesso file): presidiPerInterventi(odls) conta i presidi di impianti del cliente nella sede dell'intervento (presidi senza sede valgono per tutte), "🚪 Porte REI: 2 · ..." sotto il tipo nella pagina Interventi (in sottofondo, con controllo del ridisegno), "Da controllare in questa sede" in cima alla finestra dell'intervento e nell'elenco degli interventi in ritardo. Anteprima dei presidi (pagina Presidi, vista cartelle, renderPC di js/09; richiesta di Erika del 16/11): porte REI, uscite, idranti, naspi, manichette e altri con i riquadri colorati della scheda grande (campiSchedaPresidio + riquadroEvidenzaPresidio di js/07, periodo di js/86) ma SOLO Controlli, Ultima verifica e Prossima verifica (richiesta di Erika: niente classe REI né altre scadenze nell'anteprima, restano nella scheda completa); estintori invariati; storico di tutti i presidi della lista letto in blocchi da 100 (leggiStoricoPeriodoMolti) e ridisegno; titoli dei gruppi "Gruppo gennaio/luglio" / "Gruppo febbraio/agosto" (prima "Gennaio – Giugno" / "Luglio – Dicembre", sbagliato per febbraio/agosto); etichette dei riquadri su una riga. Prova test/anteprima-presidi.spec.js. Bottone "🧯 Apri schede manutenzione ordinaria" di Esegui intervento: apriManutenzioneOrdinaria (js/55, prima mai scritta, D7) porta al passo 4 "Aggiorna presidi" con la manutenzione ordinaria programmata (prova test/apri-manutenzione.spec.js); la finestra m-manutenzione-ordinaria e salvaManutenzioneOrdinaria restano non usate. NON FATTI (Erika ha scelto solo il periodo): elenco di cosa è scaduto e
cosa fare nell'intervento, avviso dei doppioni (in produzione #31, #32, #33 dello
stesso cliente e giorno). Guide info-ct-33, info-tec-26. Prova
test/periodo-presidi.spec.js (capo tecnico a 390 px): TUTTO OK; smoke TUTTO OK.
Ordine sopra l'offerta del fornitore (F18.22, js/87-ordini-sopra-offerta.js dopo
js/86, NESSUN SQL; decisione di Erika del 16/11: SOLO AVVISO, soglia 5% fissa
SOGLIA_ORDINE_SOPRA_OFFERTA, nelle Regole servirebbe un file SQL): ordine nato da
un'offerta scelta (non gli ordini liberi) con totale delle voci oltre il 5% sopra
preventivi_fornitori.prezzo_offerto: avviso giallo mof-sopra-offerta nella finestra
m-ordine-fornitore (renderVociNuovoOrdine e aggiornaVoceNuovoOrdine avvolte), confirm
alla creazione (salvaNuovoOrdineFornitore avvolta: Annulla = nessun ordine), badge
"⚠️ +N% sull'offerta" sulla riga dell'ordine per chi vede i prezzi d'acquisto
(caricaOrdiniCommessa avvolta), Cosa tocca a me del titolare "Ordini ai fornitori
sopra l'offerta (oltre il 5%)" (ordinati e confermati). Guide info-com-41,
info-tit-57. Prova test/ordini-sopra-offerta.spec.js (Acquisti a 390 px, titolare):
TUTTO OK; smoke TUTTO OK.
Dopo sql/131 (F18.2 revisioni del preventivo PRIMA dell'esito, decisioni di
Erika del 16/11; ESEGUITO il 17/11 (backup 2026-11-17-pre-blocco, controllo in regola) con "CONFERMATO DA TOLI: sql/131": backup, file
(senza parole di cancellazione), controllo in fondo; richiede 07, 22, 67, 71;
nessuna tabella nuova, matrice invariata; le varianti dopo l'accettazione sono
F20.15). preventivi colonne NUOVE revisione (0-99), preventivo_padre_id,
sostituito_da, sostituito_il, sostituito_da_nome (scritte solo dalla RPC:
trigger trg_preventivi_revisione, segno toli.revisione_preventivo, 42501 per gli
utenti del sito). RPC nuova_revisione_preventivo(p_preventivo) (Acquisti AUTORE
e titolare, anche "come"; preventivo inviato_a_rappresentante o inviato, non già
sostituito): revisione R+1 in BOZZA con numero nuovo (sequenza), copia cliente,
progetto, venditore, Acquisti, tipo, origine, IVA, note, condizioni di pagamento,
anticipo, oggetto e nota (le colonne che esistono, insert costruito dalle chiavi)
e tutte le voci (colonne lette da information_schema), totale = somma delle voci;
NON sconto, PDF, certificati, computo; le OFFERTE DEI FORNITORI passano alla
revisione (preventivi_fornitori.preventivo_id: servono a offerte_ordinabili e agli
ordini dopo l'accettazione); R0 RESTA COM'È (scelta di Erika: nessuno stato
'superato') con sostituito_da. revisioni_preventivo_attive(). Sito
(js/88-revisioni-preventivo.js dopo js/87): azione "🔁 Nuova revisione" della
scheda comune (registraAzioneScheda di js/63: commerciale autore e titolare,
stati inviato_a_rappresentante e inviato), riquadro pvd-revisione ("Sostituito
dalla revisione R1 (n. ...)" con "Apri la revisione" / "Revisione R1 del
preventivo n. ..." con "Apri R0"), conferma prima dell'esito su un preventivo
sostituito (apriEsitoPreventivo avvolta, solo avviso), etichette "🔁 Sostituito da
R1 (n. ...)" e "R1" negli elenchi dei preventivi (id negli attributi). Guide
info-com-42, info-tit-58, info-rap-39. Prove: sql/131-...-PROVA.sql e
test/revisioni-preventivo.spec.js (Acquisti autore a 390 px, rappresentante):
TUTTO OK; smoke TUTTO OK con e senza; rollback e riesecuzione provati.
Documenti finali della commessa (F18.16, decisioni di Erika del 16/11: versione
calcolata, NESSUN SQL, solo avviso; js/89-documenti-finali.js dopo js/88).
Riquadro cmd-documenti-finali (index.html, sopra cmd-dichiarazione) da
in_corso a chiusa per titolare, segreteria, capo_tecnico e commerciale
(l'ingegnere non apre commessa-detail). Quali documenti: famiglie delle schede di
rilievo da scheda_cantiere_commessa (sql/34, la leggono i 4 ruoli; le tabelle
delle schede e preventivi_certificati no) incrociate con
lavorazioni.documento_finale (sql/75): solo corretta_posa e dico_37_08. Per
ognuno barra "N su 3" e voci con a chi tocca la mancanza: certificati (scheda
.certificati del preventivo o cartella certificati → Acquisti), foto (cartella
cantiere, immagini, anche giornale_ → capo tecnico), dichiarazione salvata in
chiusura (prefisso di js/37 → segreteria) o DiCo (file in chiusura con
/dico|37[\s._-]?08/i nel nome, il gestionale non la genera → segreteria). Si
ricalcola a ogni caricaDocumentiCommessa (avvolta; RPC letta una volta per
commessa, DOC_FINALI); caricaSchedaCommessa avvolta svuota il riquadro. Senza
sql/34 o cartella documenti: niente riquadro. Barra per posizione NON fatta (le
posizioni non esistono, F16.10 saltata). Guide info-com-43, info-ct-34,
info-seg-30, info-tit-59. Prova test/documenti-finali.spec.js (capo tecnico a
390 px, segreteria, Acquisti, rappresentante, commessa approvata): TUTTO OK.
F18.15 (note spese e straordinari) NON FATTA: decisione di Erika del 16/11
(superflua per ora).
Dopo sql/151 (F18.25 sospensione, ordini aperti e anticipo, decisioni di Erika
del 16/11; ESEGUITO il 17/11 (backup 2026-11-17-pre-blocco, controllo in regola) con "CONFERMATO DA TOLI: sql/151": backup, file (senza
parole di cancellazione), -REGISTRO-CANCELLAZIONI dall'editor, controllo in
fondo; richiede 07, 22, 26, 28, 67, 71). SOSPENSIONE = SEGNO sopra lo stato
(commesse.stato NON cambia, nessuno stato nuovo: le 25 funzioni che leggono lo
stato restano come sono): tabella commesse_sospensioni (motivo 3-500,
ripresa_prevista, sospesa_il/da/da_nome/da_ruolo, ripresa_il/da/da_nome/nota;
indice unico parziale: una aperta per commessa; lettura = chi legge la commessa).
RPC sospendi_commessa(p_commessa_id, p_motivo, p_ripresa_prevista) titolare e
capo_tecnico (scelta di Erika), non chiusa/annullata, ripresa da oggi;
riprendi_commessa(p_commessa_id, p_nota) titolare o il capo tecnico che ha
sospeso. Tabella commesse_anticipo_decisioni (una riga per commessa:
trattenuto/rimborsato, nota; lettura titolare, segreteria, contabile): RPC
decidi_anticipo_commessa titolare e segreteria, solo commessa annullata con
preventivi.anticipo_accredito_data (il rimborso con la nota di credito di
sql/46, 54). sospensione_commessa_attiva(). Matrice: 20 righe. Sito
(js/90-sospensione-commessa.js dopo js/89): azioni "⏸ Sospendi" / "▶️
Riprendi" della scheda comune (registraAzioneScheda di js/63; la sospensione si
legge PRIMA di caricaSchedaCommessa, avvolta), finestra m-sospendi-commessa (id
sco-), etichetta "⏸ Sospesa" in cmd-stato e negli elenchi (onclick
openCommessaDetail, MutationObserver), riquadro cmd-sospensione sotto
cmd-scheda-oggetto (motivo, chi, ripresa prevista; ordini ordinato/confermato
di commessa sospesa o annullata ad Acquisti e titolare, data-ordini-aperti;
anticipo della commessa annullata a titolare e segreteria con Trattenuto /
Rimborsato), conferma prima di cambiare lo stato di una commessa sospesa
(salvaStatoCommessa avvolta, solo avviso). Cosa tocca a me:
ordini-commesse-ferme (commerciale), commesse-sospese-ripresa (titolare,
capo_tecnico: ripresa prevista <= oggi), anticipo-commesse-annullate (titolare,
segreteria). Nessun annullamento automatico degli ordini. Guide info-com-44,
info-ct-35, info-seg-31, info-tit-60. Prove: sql/151-...-PROVA.sql (29 ok) e
test/sospensione-commessa.spec.js (capo tecnico a 390 px, Acquisti, titolare,
segreteria, console): TUTTO OK; smoke TUTTO OK con e senza; rollback e
riesecuzione provati.
Dopo sql/152 (F19.1 catalogo dei corsi, decisione di Erika del 16/11: tabella
gestita dal titolare; ESEGUITO il 17/11 (backup 2026-11-17-pre-blocco, controllo in regola) con "CONFERMATO DA TOLI: sql/152": backup,
file (senza parole di cancellazione), controllo in fondo; richiede 07, 32, 67,
71). Tabella corsi_catalogo (id, codice unico = documenti_team_subappalti.tipo,
nome, per impresa/persona/tutti, validita_mesi o validita_giorni, obbligo_legge,
ore_aggiornamento, ente, riservato, attivo, ordine, aggiornato_da/_nome/_il):
lettura chiunque abbia un ruolo, insert e update SOLO titolare (policy), nessuna
cancellazione (attivo = false); trigger trg_corsi_catalogo: codice fisso (42501),
riservato deciso dal database (solo idoneita_sanitaria), chi e quando; registro
delle azioni (sql/67, esclusi aggiornato_da*). 23 righe di partenza: i 15+2 tipi
di js/30 + dirigente, gru_autocarro, ponteggi_pimus, spazi_confinati, pes_pav,
lavori_caldo, fgas, abilitazione_produttore (validità e ore da verificare da
Toli). Matrice: 10 righe. Sito (js/91-catalogo-corsi.js dopo js/90):
caricaCatalogoCorsi riempie IN PLACE TIPI_DOCUMENTO_TEAM_SUBAPPALTI (id, per,
nome, mesi, giorni, riservato, attivo, obbligo_legge, ore, ente; js/30 e js/31
non cambiano), al login e in verificaTeamSubappaltiDisponibili (avvolta, cache 5
min); opzioniTipoDocumentoTS sostituita (stessa resa + senza i corsi spenti
tranne quello scelto, ⚖️ per legge). Impostazioni: riquadro si-corsi-card
(titolare; loadImp avvolta) → finestra m-catalogo-corsi (id ccr-): elenco,
"+ Nuovo corso" (codice dal nome), ✏️ modifica, registro delle modifiche
(registro_azioni tabella corsi_catalogo). Guida info-tit-61. Prove:
sql/152-...-PROVA.sql (15 ok) e test/catalogo-corsi.spec.js (titolare a 390 px,
segreteria, console): TUTTO OK.
Dopo sql/153 (F19.2 esito della visita di idoneità, decisione di Erika del
16/11: SOLO l'esito, niente anagrafica degli operai dei subappaltatori né import;
ESEGUITO il 17/11 (backup 2026-11-17-pre-blocco, controllo in regola) con "CONFERMATO DA TOLI: sql/153": backup, file (senza parole di
cancellazione), -REGISTRO-CANCELLAZIONI dall'editor, controllo in fondo;
richiede 07, 32, 67, 71). Tabella documenti_idoneita (documento_id unico →
documenti_team_subappalti on delete cascade, esito idoneo/con_limitazioni/
non_idoneo, limitazioni obbligatorie con "con limitazioni", aggiornato_da*):
tabella A PARTE perché il capo tecnico legge le righe dei documenti; lettura
titolare, segreteria e la persona (utente_id del documento). RPC
imposta_idoneita_documento (titolare, segreteria; solo tipo idoneita_sanitaria),
idoneita_persone() (titolare, segreteria, capo_tecnico: visite in vigore con SOLO
idoneo sì/no, con limitazioni = sì, e scadenza; D9), idoneita_esito_attivo().
Matrice: 10 righe. Sito (js/92-idoneita.js dopo js/91): htmlDocumentoTS avvolta
(segnaposto data-idoneita-doc nella riga della visita), caricaSchedaDocumenti
avvolta (riempie: titolare/segreteria esito + "🩺 Esito", capo tecnico "Idoneo:
sì/no"), finestra m-idoneita (id ido-), caricaMieiDocumentiTecnico avvolta
(data-mia-idoneita: la persona vede il suo esito). Guide info-tit-62,
info-seg-32, info-ct-36, info-tec-27. Prove: sql/153-...-PROVA.sql (18 ok) e
test/idoneita.spec.js (segreteria, capo tecnico a 390 px, tecnico a 390 px,
console): TUTTO OK; rollback e riesecuzione di 152 e 153 provati.
Dopo sql/155 (F19.4 piano formazione, decisione di Erika del 16/11: preavviso
separato + piano; SENZA l'incrocio con le commesse dei 90 giorni, che serve
F19.3, e senza report del venerdì; ESEGUITO il 17/11 (backup 2026-11-17-pre-blocco,
controllo in regola) con "CONFERMATO DA TOLI: sql/155": backup, file (senza parole di cancellazione), -REGISTRO-CANCELLAZIONI
dall'editor, controllo in fondo; richiede 07, 32, 67, 71). Preavviso dei corsi =
regola GIÀ esistente preavviso_corsi_visite_gg di sql/62 (60, Regole; nessuna
colonna nuova): statoDocumentoTeamSubappalti SOSTITUITA in js/93 (per = 'persona'
nel catalogo → regola dei corsi, impresa → giorni_preavviso_documenti; vale
anche senza sql/155). Tabella iscrizioni_corsi (documento_id unico →
documenti_team_subappalti on delete cascade, data_corso, ente, nota, stato
iscritto/annullato): lettura titolare, segreteria, capo_tecnico e la persona;
RPC iscrivi_corso (upsert; documento in vigore, di persona) e
annulla_iscrizione_corso (titolare, segreteria), piano_formazione_attivo().
Matrice: 10 righe. Sito (js/93-piano-formazione.js dopo js/92): tab "🎓 Piano
formazione" (ts-tab-piano, ts-piano-lista, ts-piano-conta) in Team e subappalti
= documentiDaSegnalareTS filtrati per persona, con l'iscrizione e "📅 Iscrivi /
Cambia" (titolare, segreteria; finestra m-iscrizione-corso, id isc-),
loadTeamSubappalti avvolta (prima caricaRegole); nota della tab Scadenze con i
due preavvisi (renderScadenzeTeamSubappalti avvolta). Cosa tocca a me:
miei-corsi-scadenza (tutti i ruoli: i propri documenti di persona) e
corsi-senza-iscrizione (titolare, segreteria). Guide info-seg-33, info-tit-63,
info-ct-37, info-tec-28. Prove: sql/155-...-PROVA.sql (17 ok) e
test/piano-formazione.spec.js (segreteria, capo tecnico a 390 px, tecnico a 390
px, console): TUTTO OK.
Dopo sql/156 (F19.5 corsi mancanti nel preventivo, decisione di Erika del 16/11:
avviso CON SCELTA OBBLIGATORIA; ESEGUITO il 17/11 (backup 2026-11-17-pre-blocco, controllo in regola) con "CONFERMATO DA TOLI: sql/156"
DOPO sql/152 e DOPO aver pubblicato il sito: backup, file (senza parole di
cancellazione), -REGISTRO-CANCELLAZIONI dall'editor, controllo in fondo; richiede
32, 67, 71, 152). corsi_catalogo colonne NUOVE parole_preventivo e
lavorazioni_preventivo (text[], max 20; righe di partenza: ple ← PLE,
piattaforma, piattaforme; ponteggi_pimus ← ponteggio, ponteggi;
carrelli_elevatori ← muletto, carrello elevatore; gru_autocarro ← gru;
spazi_confinati ← spazio confinato, spazi confinati). corsi_preventivo_calcolo
(interna, non concessa): parole intere (\m \M, ~*) nelle descrizioni delle voci
e famiglie delle schede (progetti_tecnici_schede del progetto e
preventivi_schede_tecniche) contro i corsi attivi; persone_valide = dipendenti
attivi e persone (riferito_a) dei subappaltatori attivi con documento del corso in
vigore e non scaduto (solo il NUMERO). RPC corsi_preventivo(p_preventivo)
(titolare, commerciale AUTORE) e scegli_corso_preventivo (faremo_corso /
subappaltatore + nota; solo in bozza; solo corsi richiesti) → tabella
preventivi_corsi_scelte (unico preventivo+corso; lettura come i preventivi).
BLOCCO: trigger trg_preventivi_corsi_mancanti BEFORE UPDATE OF stato quando
bozza → inviato_a_rappresentante / inviato / in_attesa_approvazione (l'invio
reale oggi è bozza → inviato_a_rappresentante: "approvazione" non si usa) se un
corso senza persone abilitate non ha la scelta (23514); solo utenti del sito.
Matrice: 10 righe. Sito (js/94-corsi-preventivo.js dopo js/93): riquadro
pvd-corsi sopra pvd-scheda-oggetto (openPreventivoDetail avvolta; Acquisti e
titolare) con i corsi richiesti, persone abilitate o "nessuno" + le due scelte
(prompt per la nota); inviaPdfClienteATitolareERappresentante e
caricaEInviaPdfEsternoTitolare avvolte (in bozza, senza scelta: toast e scroll al
riquadro). js/91: campi ccr-parole / ccr-lavorazioni (ccr-preventivo-box,
visibili solo con le colonne) e riga "Serve nel preventivo con". Guide
info-com-45, info-tit-64. Prove: sql/156-...-PROVA.sql (parola intera: "Gruppo"
non fa scattare la gru; invio bloccato e poi passato) e
test/corsi-preventivo.spec.js (Acquisti a 390 px, titolare, rappresentante,
console): TUTTO OK. Smoke TUTTO OK con 151-156 e senza; rollback e riesecuzione
di tutti provati.
Corsi e ruoli minimi nella squadra del giorno (F19.9, decisioni di Erika del
16/11: SOLO AVVISO, anche per i corsi di legge della D9 — niente blocco né
sblocchi del titolare; ruoli minimi come avviso; NESSUN SQL;
js/95-squadra-corsi.js dopo js/94). Corsi richiesti dalla commessa calcolati nel
sito: corsi attivi del catalogo (CATALOGO_CORSI di js/91, servono sql/152 e le
colonne di sql/156) con parole (parola intera, regex Unicode) nelle voci o
lavorazioni tra le schede di scheda_cantiere_commessa (sql/34); calcolati in
caricaSquadraCantiere (avvolta, SQUADRA_CORSI). avvisiDocumentiSquadra avvolta:
"manca <corso> richiesto dalla commessa" (grave = obbligo_legge) se la persona
(o, per un subappaltatore, una sua persona) non ha il documento valido fino
all'ultimo giorno scelto; vale nella finestra e nei giorni già organizzati.
aggiornaRiepilogoAvvisiSquadra avvolta: riquadro data-corsi-richiesti e
data-ruoli-minimi (preposto, primo_soccorso, formazione_antincendio tra i
dipendenti scelti). Si salva sempre. Guide info-ct-38, info-tit-65, info-seg-34.
Prova test/squadra-corsi.spec.js (capo tecnico a 390 px): TUTTO OK.
Dopo sql/159 (F19.8 documenti di TOLI Fire, decisione di Erika del 16/11: SOLO
i documenti dell'impresa, niente fascicolo PDF né "chi rilascia la
dichiarazione"; ESEGUITO il 17/11 (backup 2026-11-17-pre-blocco, controllo in regola) con "CONFERMATO DA TOLI: sql/159": backup, file
(senza parole di cancellazione), -VINCOLO dall'EDITOR subito dopo (drop e add
dei vincoli intestatario e percorso), controllo in fondo; richiede 07, 32).
documenti_team_subappalti colonna NUOVA impresa (terzo intestatario: utente_id
e subappaltatore_id vuoti; vincolo intestatario = uno solo tra i tre; percorso
impresa/toli/<file>). Policy storage documenti_impresa_caricamento (titolare,
segreteria; creata solo se storage.objects esiste: il locale non lo ha). RPC
registra_documento_impresa (titolare, segreteria; nuovo o rinnovo, stessi
controlli di sql/32, niente visita di idoneità); correzione ed eliminazione con
le RPC di sql/32. documenti_impresa_attivi(). Tipi nuovi nel catalogo (se c'è
sql/152): nomina_rspp, nomina_rls, nomina_medico, abilitazione_dm37, white_list
(12 mesi). Matrice invariata. Sito (js/96-documenti-impresa.js dopo js/95):
bottone ts-btn-impresa "🏢 Documenti di TOLI Fire" in Team e subappalti
(titolare, segreteria, capo tecnico; loadTeamSubappalti avvolta) → scheda
documenti tipo 'impresa' id 'toli' (caricaSchedaDocumenti, apriDocumentoTS con
i soli tipi impresa/tutti, salvaDocumentoTS con upload in impresa/toli/ e la RPC
nuova: avvolte); documentiDaSegnalareTS avvolta (documenti senza dipendente né
subappaltatore = impresa, riga "🏢 TOLI Fire" in Scadenze e dashboard);
assicuraTipiImpresa aggiunge i 5 tipi anche senza sql/152 (e dopo
caricaCatalogoCorsi, avvolta). Guide info-tit-66, info-seg-35, info-ct-39. Prove:
sql/159-...-PROVA.sql (14 ok) e test/documenti-impresa.spec.js (segreteria,
capo tecnico a 390 px, console; senza file perché il locale non ha lo Storage):
TUTTO OK; smoke con e senza; rollback e riesecuzione provati.
Dopo sql/158 (F19.7 kit standard, decisione di Erika del 16/11: il kit sta nel
catalogo lavorazioni; ESEGUITO il 17/11 (backup 2026-11-17-pre-blocco, controllo in regola) con "CONFERMATO DA TOLI: sql/158": backup,
file (senza parole di cancellazione), -REGISTRO-CANCELLAZIONI dall'editor,
controllo in fondo; richiede 26, 31, 67, 71, 75). Tabella lavorazioni_kit
(lavorazione_id bigint → lavorazioni, voce, categoria dpi/attrezzatura/
consumabile, nota, ordine, attivo, aggiornato_da*; lettura tutti, insert e update
titolare e ingegnere, niente cancellazioni; trigger trg_lavorazioni_kit chi e
quando, lavorazione fissa; registro delle azioni sql/67, NON lavorazioni_registro
per non toccare il suo vincolo); 34 righe di partenza per porte_rei,
compartimentazione, vernice_intumescente, coppelle, rilevazione_incendi,
impianti_spegnimento (da controllare dall'ingegnere). Tabella
commesse_kit_spunte (commessa+kit unici, presente, richiesto_il; lettura come le
commesse) con RPC spunta_kit_commessa(p_commessa_id, p_kit_id, p_presente,
p_richiesto) (titolare, capo_tecnico; non chiusa/annullata). kit_standard_attivo().
Matrice: 20 righe. Sito (js/97-kit-standard.js dopo js/96): riquadro cl-kit-card
nella finestra del catalogo (disegnaCatalogoLavorazioni avvolta; titolare e
ingegnere aggiungono, correggono, tolgono); riquadro cmd-kit (index.html, sotto
cmd-cantiere; caricaSchedaCantiere avvolta) con le voci attive delle lavorazioni
delle schede (scheda_cantiere_commessa), spunte per capo tecnico e titolare,
segreteria in lettura, "📦 Chiedi i mancanti" = apri_richiesta_integrazione tipo
consumabile "Kit: <voce>" per ogni voce non presente e non chiesta, poi
spunta con p_richiesto. Guide info-ct-40, info-tit-67, info-ing-33. Prove:
sql/158-...-PROVA.sql (15 ok) e test/kit-standard.spec.js (capo tecnico a 390 px,
segreteria, titolare, console): TUTTO OK; smoke con e senza; rollback e
riesecuzione provati.
sql/271 (richiesta di Erika del 17/11): profili di prova "rappr io"
(rappresentante, f257310c-...) e "comm prova" (commerciale, e52777a5-...)
DISATTIVATI (attivo = false: ruolo_reale() di sql/71 non dà ruolo agli utenti
non attivi, quindi niente accesso; spariscono da tutte le tendine, che filtrano
attivo) e le loro 2 bozze (preventivi n. 13 e 16) passate a Laura Panseri.
ESEGUITO il 17/11 (backup 2026-11-17-pre271, controllo in regola: disattivati 2,
bozze_laura 2, restano_a_comm 0). Rollback: 271-...-ROLLBACK.sql.
Dopo sql/272 (promessa di pagamento sulle rate, richiesta di Erika del 17/11:
la fattura emessa resta bloccata ma "entro quando pagano" e una nota di incasso
si cambiano sempre; ESEGUITO il 17/11 (backup 2026-11-17-pre272, controllo in
regola; -REGISTRO-CANCELLAZIONI eseguito da Erika dall'editor il 17/11) con "CONFERMATO DA TOLI: sql/272": backup,
file (senza parole di cancellazione), -REGISTRO-CANCELLAZIONI dall'editor,
controllo in fondo; richiede 46, 67, 71). Tabella fatture_promesse_pagamento
(scadenza_id unica → fatture_scadenze on delete cascade, data_promessa, nota,
aggiornato_da*; lettura titolare, segreteria, contabile) con RPC
imposta_promessa_pagamento(p_scadenza_id, p_data_promessa, p_nota) (titolare,
segreteria; solo fatture emesse; vuote = tolta, la riga resta);
promesse_pagamento_attive(). Matrice: 10 righe. Sito: js/44 data-scadenza-id
sulle righe delle rate (finestra della fattura e "Scadenze e incassi");
js/98-promesse-pagamento.js (dopo js/97): htmlRataDaSollecitare avvolta (stesso
attributo), caricaScadenzeNellaFattura / caricaScadenzeFatture /
caricaSollecitiFatture avvolte (riga data-promessa-rata "🤝 Promesso entro il …
· nota (chi, quando)", rossa se passata; "🤝 Promessa"/"✏️" per segreteria e
titolare), finestra m-promessa-pagamento (id ppg-, Salva/Togli). Guide
info-seg-36, info-tit-68. Prove: sql/272-...-PROVA.sql (13 ok) e
test/promesse-pagamento.spec.js (segreteria a 390 px, contabile, console):
TUTTO OK; smoke con e senza; rollback e riesecuzione provati.
Card "Anticipi da fatturare" semplificata (richiesta di Erika del 17/11, solo
sito): js/18 riepilogo in una riga data-anticipo-riepilogo ("💶 Anticipo X + IVA
(con IVA) · preventivo"), data-anticipo-f43-testo/-bottoni sulle righe F4.3; con
fattura d'anticipo emessa dal gestionale js/44 decoraFattureAnticipo nasconde le
righe F4.3 e fa UNA riga data-anticipo-bottoni: "📅 Paga il…" (promessa sulla
prima rata aperta, apriPromessaPagamento, solo segreteria/titolare e in attesa)
PRIMA di "❌ Rifiuta: anticipo non versato" (stesso bottone spostato), poi
Registra pagamento e Apri fattura; riga "📅 Paga il gg/mm/aaaa · nota (chi)",
rossa se passata. js/98 dopo il salvataggio ridisegna la card. Prova:
test/anticipo-paga-il.spec.js (segreteria 390 px) TUTTO OK; smoke TUTTO OK.
Poi (richiesta di Erika del 17/11) anche sulle rate (finestra della fattura,
Scadenze e incassi, solleciti) js/98 usa lo stesso "📅 Paga il…": bottone
data-paga-il prima di "💶 Pagamento"/"Registra pagamento" (se manca, sotto la
rata, non sulle pagate), riga "📅 Paga il gg/mm/aaaa · nota (chi, quando)";
finestra m-promessa-pagamento con titolo "📅 Paga il…" e campo "Il cliente paga
il". test/promesse-pagamento.spec.js aggiornato: TUTTO OK.
Dopo sql/170 (F20.2 infortuni e quasi-incidenti + F20.3 danni, decisioni di
Erika del 17/11: registrano SOLO capo tecnico, segreteria, titolare; nessuna
scadenza INAIL calcolata; danni con regola fissa; F20.3 dentro sql/170, niente
sql/171; ESEGUITO il 17/11 (backup 2026-11-17-pre-blocco, controllo in regola) con "CONFERMATO DA TOLI: sql/170": backup, file (senza
parole di cancellazione), -REGISTRO-CANCELLAZIONI dall'editor, controllo in
fondo; richiede 26, 62, 65, 67, 71). Regola nuova sinistro_denuncia_gg (3,
preavvisi). Tabella eventi_sicurezza (tipo infortunio/quasi_incidente/danno,
commessa_id, odl_id, accaduto_il, luogo, descrizione, persona_utente_id o
persona_esterna, testimoni, danneggiato, stato aperto/in_gestione/chiuso; danno:
decisione da_decidere/paghiamo_noi/assicurazione/non_dovuto, costo,
denuncia_entro = data evento + regola, denuncia_fatta_il, deciso_da_nome;
lettura titolare, segreteria, capo_tecnico). Tabella eventi_sicurezza_sanitari
(prognosi_giorni, lesioni, denuncia_inail_il, nota; lettura titolare, segreteria
e la persona via evento_sicurezza_mio(), security definer sì/no). RPC
registra_evento_sicurezza (3 ruoli; avviso URGENTE crea_avviso tipo
evento_sicurezza a titolare, segreteria, capo_tecnico), aggiorna_sanitari_
infortunio (titolare, segreteria), decidi_danno (solo titolare),
cambia_stato_evento_sicurezza (titolare, segreteria; chiuso = avvisi chiusi),
eventi_sicurezza_attivi(). Matrice: 20 righe. Niente foto. Sito
(js/99-eventi-sicurezza.js dopo js/98): azione "🚨 Infortunio o danno" della
commessa (js/63), finestra m-evento-sicurezza (id evs-), elenco e dettaglio
m-eventi-sicurezza (id evl-, evd-: sanitari, decisione del danno, stato),
riquadro cmd-eventi (index.html, sotto cmd-documenti-finali; caricaSchedaCommessa
avvolta) con il costo dei danni "paghiamo noi" (consuntivo), azione rapida
dell'avviso "🚨 Apri l'evento" (registraAzioneRapidaAvviso), Cosa tocca a me
eventi-sicurezza-aperti (3 ruoli), danni-da-decidere (titolare), denunce-sinistro
(titolare, segreteria: entro domani). Guide info-ct-41, info-seg-37, info-tit-69.
Prove: sql/170-...-PROVA.sql (25 ok) e test/eventi-sicurezza.spec.js (capo
tecnico a 390 px, segreteria, titolare, console): TUTTO OK; smoke con e senza;
rollback e riesecuzione provati. Nota test: per cancellare avvisi di prova prima
avvisi_invii (chiave esterna).
Dopo sql/178 (F20.10 fermi del cantiere, decisione di Erika del 17/11: versione
completa; ESEGUITO il 17/11 (backup 2026-11-17-pre-blocco, controllo in regola) con "CONFERMATO DA TOLI: sql/178": backup, file (senza
parole di cancellazione), -REGISTRO-CANCELLAZIONI dall'editor, controllo in
fondo; richiede 26, 35, 65, 67, 71). Tabella fermi_cantiere (commessa_id,
giorno, giorno_id → commesse_squadra_giorni, causa cliente_assente/
accesso_negato/area_non_pronta/materiale_mancante/meteo/altro, nota, attesa
dalle/alle, stato da_riprogrammare/riprogrammato/non_serve, nuova_data; addebito
da_decidere/addebitare/non_addebitare solo per le cause del cliente,
importo_addebito; lettura titolare, segreteria, capo_tecnico, commerciale e chi
l'ha registrato). RPC registra_fermo_cantiere(p_causa, p_nota, p_attesa_dalle,
p_attesa_alle, p_giorno_id, p_commessa_id, p_data) (titolare, capo_tecnico; il
TECNICO solo con p_giorno_id di un giorno in cui è nella squadra; avvisi
fermo_cantiere al capo tecnico se tecnico e alla segreteria, fermo_addebito al
titolare per le cause del cliente; rif commesse), riprogramma_fermo (titolare,
segreteria, capo_tecnico; data vuota = non serve), decidi_addebito_fermo (solo
titolare; addebitare richiede l'importo), fermi_cantiere_attivi(). Matrice: 10
righe. Sito (js/100-fermi-cantiere.js dopo js/99): htmlGiornoCantiereTecnico
avvolta (bottone data-fermo-giorno "🛑 Fermo: non si può lavorare" nei giorni
fino a oggi; caricaMieiCantieriDashboard e caricaCantieriCalendarioTecnico
avvolte per la verifica), azione "🛑 Fermo del cantiere" della commessa (titolare,
capo tecnico), finestra m-fermo-cantiere (id frm-), riquadro cmd-fermi (sotto
cmd-eventi; caricaSchedaCommessa avvolta) con totale da addebitare, finestra
m-gestisci-fermo (id gfr-: riprogramma, addebito). Cosa tocca a me
fermi-da-riprogrammare (segreteria, titolare), addebiti-fermi (titolare),
fermi-noli (commerciale: fermi degli ultimi 30 giorni su commesse con noli evasi o
arrivati non restituiti). Niente riga nel giornale. Guide info-ct-42, info-seg-38,
info-tit-70, info-tec-29, info-com-46. Prove: sql/178-...-PROVA.sql (20 ok) e
test/fermi-cantiere.spec.js (tecnico a 390 px, segreteria, titolare, Acquisti,
console): TUTTO OK; smoke con e senza; rollback e riesecuzione provati.
Dopo sql/181 (F20.13 formulari dei rifiuti, decisione di Erika del 17/11 come
MD7: responsabile Acquisti; ESEGUITO il 17/11 (backup 2026-11-17-pre-blocco, controllo in regola) con "CONFERMATO DA TOLI: sql/181":
backup, file (senza parole di cancellazione), -REGISTRO-CANCELLAZIONI
dall'editor, controllo in fondo; richiede 26, 67, 71). Tabella formulari_rifiuti
(commessa_id, numero unico per commessa, data_fir, trasportatore, destinatario,
codice_cer, quantita, nota, quarta_copia_il, nota_quarta_copia; lettura titolare,
segreteria, capo_tecnico, commerciale) con RPC registra_formulario_rifiuti e
segna_quarta_copia_fir (titolare, commerciale), formulari_rifiuti_attivi().
Niente RENTRI, niente file. Matrice: 10 righe. Sito
(js/101-formulari-rifiuti.js dopo js/100): riquadro cmd-rifiuti (sotto cmd-fermi;
caricaSchedaCommessa avvolta) con i FIR e lo stato della quarta copia (90 giorni,
gialla da 80, rossa scaduta), "+ FIR" (m-fir, id fir-) e "📄 Quarta copia
arrivata" (m-quarta-copia, id qfc-) per Acquisti e titolare; Cosa tocca a me
fir-quarta-copia (commerciale: senza quarta copia da 80 giorni). Guide
info-com-47, info-seg-39, info-ct-43. Prove: sql/181-...-PROVA.sql (14 ok) e
test/formulari-rifiuti.spec.js (Acquisti a 390 px, segreteria, console): TUTTO
OK; smoke con e senza; rollback e riesecuzione provati. F19.10 e F19.17 NON
FATTE (decisione di Erika del 17/11: per ora no).
Import del catalogo lavorazioni da foglio (F15.10, js/55 in fondo, NESSUN SQL:
insert diretti sotto le RLS di sql/75, titolare e ingegnere). Nella finestra
m-catalogo-lavorazioni "📥 Importa da foglio" (input cl-import-file: xlsx, xls,
csv, max 5 MB; libreria di js/00 caricaLibreriaExcel) e "⬇️ Scarica il modello"
(scaricaModelloImportLav: fogli "Campi" e "Istruzioni"). Foglio con UNA RIGA
PER CAMPO: codice e/o nome della lavorazione (vuoti = riga sopra), famiglia,
documento finale (valore o etichetta), codice campo (vuoto = dall'etichetta),
etichetta, tipo (numero, menu, sì/no, testo, foto; NON elenco), unità, valori
del menu separati da ";" (valore = codiceDaTestoLav dell'etichetta), minimo e
massimo con la virgola, chi lo compila (base/ingegnere), normativo, serve al
prezzo (= obbligatorio, D2), per posizione, uso a valle (obbligatorio), ordine
(vuoto = di 10 in 10 dopo l'ultimo). importaFoglioLavorazioni →
pianoImportLav (stesse regole dei vincoli e del trigger di sql/75, 78, 81;
codici riservati CODICI_RISERVATI_LAV: nome_scheda, fonti_normative,
foto_video, chiavi proprie del motore, pareti_cartongesso; per posizione anche
larghezza, altezza, note) → ANTEPRIMA m-import-lavorazioni (id ilv-): con un
solo errore (riga e motivo) non si importa nulla. confermaImportLavorazioni:
lavorazione NUOVA = insert con attiva false (la attiva il titolare);
lavorazione esistente = nome/famiglia/documento invariati, solo i campi nuovi;
campo con codice già presente = non toccato; in una lavorazione ATTIVA i campi
nuovi arrivano attivo = false salvo la spunta ilv-visibili. Un insert per
lavorazione (tutto o niente per lavorazione; se si ferma a metà le create
restano spente e reimportando i campi già entrati non si ripetono). SCELTE DA
CONFERMARE DA TOLI: campi nuovi "tolti" nelle lavorazioni attive; foglio solo
per lavorazioni e campi (foto/documenti e checklist restano a mano nel
catalogo). Guide info-tit-29, info-ing-26. Prova
test/import-catalogo-lavorazioni.spec.js (database locale: ingegnere a 390 px
scarica il modello, foglio con 7 errori fermato, foglio di prova 2 lavorazioni
e 30 campi importato spento con 32 righe di registro, reimport senza doppioni,
schede aperte nel motore; titolare attiva, aggiunta "tolta" a una lavorazione
attiva; Acquisti rifiutato dal database); smoke TUTTO OK.
App installabile offline con coda di invio (F15.11, sw.js + js/57-coda-offline.js
+ js/19 + js/01 registraServiceWorker, NESSUN SQL; caricato dopo js/56 e prima
di js/19, stesso numero 57 di js/57-motore-scadenze.js, nome dato dalla task).
SERVICE WORKER (stesso file di F14.6, push e notificationclick invariati):
registrato da js/19 all'avvio per tutti (registraServiceWorkerApp; non nel
portale; su localhost/127.0.0.1 solo con localStorage toli_sw_locale = '1',
così gli smoke test non mandano Supabase alla rete) e da js/59, sempre come
sw.js?v=<versione> (indirizzoServiceWorker: il ?v= di pubblica.sh letto dallo
script js/19-init.js di index.html; pubblica.sh NON cambia). Cache
toli-app-<versione> (index.html, style.css e tutti gli script di index.html
con quella versione, manifest, logo; le toli-app-* vecchie si cancellano
all'attivazione; un file che all'installazione non arriva NON ferma l'installazione: segno "cache-incompleta" con l'elenco, ripreso alla riapertura con la rete o al primo uso, sempre della stessa versione), toli-librerie-1 (supabase-js@2, jsPDF, autotable, pdf-lib,
xlsx: dalla cache, aggiornate in sottofondo), toli-dati (GET di /rest/v1 e RPC
di sola lettura *_attivo/_attivi/_attive e schede_migrate_motore: prima la
rete, la cache solo senza rete; mai auth, storage, scritture, richieste con
x-agito-come o x-portale-token; max 600 righe; DA F15.12 NON PIÙ: il service
worker non tiene i dati e cancella toli-dati all'attivazione, i dati già visti
sono in IndexedDB cifrati, vedi F15.12 qui sotto). index.html sempre prima dalla
rete; gli script con ?v= della versione dalla cache, di un'altra versione
dalla rete: niente file vecchi dopo una pubblicazione. SENZA RETE: boot salva
la riga dell'utente in localStorage toli_offline_utente (svuota toli-dati se
entra un'altra persona); js/19 con la sessione salvata e la rete che non
risponde chiama avvioSenzaRete (boot con l'utente salvato, solo se è lo stesso
della sessione di Supabase Auth); in modalità aereo db.auth.getSession
restituisce la sessione salvata senza rinnovarla, db.auth.getUser l'utente
della sessione, db.rest.retry = false (niente 3 tentativi da 7 s); "Esci"
avvisa se c'è qualcosa da inviare, senza rete esce solo dal telefono
(signOut local), toglie toli_offline_utente e toli-dati. CODA in IndexedDB
(toli-coda-offline, archivio invii; righe dell'utente che le ha salvate, mai
con "Entra come"): file della scheda di rilievo del motore (caricaFileNelProgetto
avvolta, SOLO cartelle foto_video e fonti: id di progetti_tecnici_allegati e
percorso <utente>/<progetto>/<cartella>/<id>_<nome> generati sul telefono,
file rimpicciolito come prima, impronta SHA-256, contenuto ArrayBuffer; la
stessa foto già in coda = doppione come online) e schede di rilievo
(salvaRigaSchedaRilievo avvolta: senza rete o con errore di rete, id della
scheda = quello salvato o crypto.randomUUID per le nuove, chiave "scheda:<id>",
risalvare sostituisce la riga; elenco in memoria aggiornato; leggiSchedaRilievo
avvolta sovrappone le schede in coda e senza rete riparte dalla memoria;
senza sql/48 solo se schedeMultipleDisponibili === false). Invio
(inviaCodaOffline: evento online, ogni 45 s, rientro nell'app, dopo boot,
"📤 Invia ora"; navigator.locks; in ordine, prima i file): file = upload con
upsert false (409 = già caricato) + insert con l'id (23505 con la riga
presente = già arrivato; rifiutato = file tolto dallo storage); scheda = upsert
onConflict id (23505 sul numero = primo numero libero, con avviso). Errore di
rete o di accesso = si riprova dopo; errore del database = riga "⚠️ Non
inviato" con il motivo, ↻ Riprova, 🗑️ Togli. registraTipoCodaOffline(tipo,
{ invia, icona, titolo }) per buono e giornale. INTERFACCIA: 📴/📤 N nel menu
(nav-coda, rosso con errori), barra coda-rete "📴 Senza rete" (e "✅ La rete è
tornata ↻ Aggiorna i dati" dopo un avvio senza rete), finestra m-coda-offline
(cof-: elenco "⏳ Non ancora inviato"), 📤 sui tab rsm-tab-N e riga
coda-scheda-avviso nella scheda di rilievo, file in coda apribili (👁 Apri
dal telefono), avviso "📲 Installa l'app sull'iPhone" ogni 7 giorni (Safari
cancella i dati delle pagine non installate), navigator.storage.persist().
NON in coda (senza rete messaggio "senza rete qui non si carica"): posizioni
P-xx e loro foto (js/66), file della finestra del progetto e della verifica
(js/17), invio del progetto, ogni altra scrittura. SCELTE DA CONFERMARE DA
TOLI: solo scheda di rilievo e sue foto/fonti in questa task; dati già visti
leggibili senza rete sul telefono fino a "Esci"; avviso iPhone ogni 7 giorni.
Guide info-tit-30, seg-24, con-15, ct-26, tec-22, com-21, rap-31, ing-27.
Prove: test/coda-offline.spec.js (Chrome headless, produzione mandata su una
porta chiusa; A0: uno script che risponde 500 all'installazione = service worker attivo con pushManager, cache completata alla riapertura; A: cache della versione con tutti gli script, sito spento = si
apre, jsPDF dalla cache, modalità aereo con l'utente salvato fino alla
dashboard in 0,2 s, nuova versione = cache nuova e vecchia cancellata, pagina
senza rete della versione nuova; B database locale, rappresentante a 390 px:
modalità aereo, 3 foto + scheda porte REI salvate sul telefono e niente nel
database, riaperta con i dati, tornata la rete 1 scheda e 3 file con gli id
del telefono e l'impronta, le stesse 4 righe rimandate = nessun doppione,
stessa foto con un altro id = "⚠️ Non inviato"); foto-video, motore-schede,
posizioni, motore-schede-fonti, smoke (9 utenti) ed entra-come TUTTO OK.
Dati in lettura sul telefono (F15.12, js/57 sezione "F15.12" + js/01
fetchDatabase + js/66 scriviPosizione/posizioneDaCodaOffline + sw.js +
index.html cof-telefono, NESSUN SQL). LETTURE: fetchConAgitoCome (js/01) senza
"Entra come" passa da fetchDatabase, che js/57 avvolge: ogni lettura fatta con
la rete (GET e HEAD di /rest/v1, RPC di sola lettura RPC_LETTURE_TELEFONO:
*_attivo/_attivi/_attive, schede_migrate_motore, scheda_cantiere_commessa,
miei_giorni_cantiere, mie_ore_cantiere, controllo_faldone_commessa,
preventivo_firmato_commessa, voci_lavori_extra_commessa,
presenti_giornale_commessa, impegni_squadra_periodo, importi_extra_commesse,
impegni_tecnici_dashboard, ambito_audit_intervento, prezzi_contratto_cliente)
si tiene in IndexedDB toli-letture-offline (archivi letture, attestati,
aperture, chiavi), CIFRATA AES-GCM (iv casuale, additionalData = chiave della
riga), chiave della riga = SHA-256 di utente + metodo, indirizzo, accept,
prefer, range, corpo (niente indirizzi in chiaro); max 1.500 righe, 3 MB per
lettura. Prima la rete; senza rete (navigator.onLine false) o se la rete non
risponde (fetch che fallisce: toast "La rete non risponde... non sono
aggiornati", una volta al minuto) la risposta dal telefono se letta con la
rete negli ultimi 7 GIORNI (LETTURE_VALIDE_MS); più vecchia = cancellata,
come una pagina mai aperta; pulizia all'avvio. CHIAVE legata alla sessione:
AES-GCM 256 NON esportabile (generateKey extractable false) in IndexedDB, una
per persona e per session_id del token di Supabase Auth (senza session_id
l'utente); nuovo accesso o altra persona = chiave nuova e tutto il vecchio
cancellato; "Esci" e l'altra persona sul telefono (svuotaCacheDatiOffline)
cancellano letture, attestati, registro e chiave; "🗑️ Togli i dati letti dal
telefono" nella finestra. Catalogo lavorazioni (js/55): senza rete e senza
copia non resta "non attivo". ATTESTATI (documenti di team e subappalti, js/30
apriFileDocumentoTS avvolta): aperto con la rete il file si tiene cifrato per
7 giorni (in sottofondo dopo l'apertura); "📥 Tieni sul telefono (7 giorni)"
in fondo a "🪪 I miei documenti" (tec-miei-documenti) e alla scheda documenti
(sdoc-documenti) li prende tutti, 📱 sui pulsanti Apri; senza rete Apri = file
dal telefono (blob) e APERTURA REGISTRATA nel registro sul telefono (cifrato:
chi, ruolo, quale attestato, senza rete; ultime 300; si vede nel riquadro
"📱 Dati sul telefono" della finestra 📤/📴 m-coda-offline, cof-telefono);
dopo 7 giorni "non si apre più: aprilo con la rete". Gli attestati che il
ruolo non apre (idoneità per il capo tecnico) non vanno sul telefono.
POSIZIONI P-xx in coda (tipo 'posizione' di registraTipoCodaOffline): senza
rete (o errore di rete) "💾 Salva" della posizione (js/66 scriviPosizione
avvolta) la tiene sul telefono con l'id generato dal telefono (nuova: insert
con l'id, numero 1 segnaposto, codice P-xx dal database all'arrivo, 23505 con
la riga presente = già arrivata; esistente: update per id, "non trovata o non
più modificabile" se nessuna riga); nell'elenco "📤 Nuova (da inviare)" o il
codice con 📤 (htmlElencoPosizioni avvolta, CODA.posizioni in memoria;
disegnaPosizioniScheda senza rete usa le ultime righe lette); riaperta dalla
coda (apriPosizione legge posizioneDaCodaOffline), ⧉ Duplica, 🗑️ Togli e
foto solo dopo l'arrivo; messaggio "posizione arrivata come P-07". sw.js: tolta
la cache dei dati (niente dati in chiaro), toli-dati cancellata
all'attivazione; push, notificationclick, cache dell'app per versione e
librerie invariati. SCELTE DA CONFERMARE DA TOLI: cache per TUTTI i ruoli e
tutte le letture (non solo i 4 elenchi della task), valida 7 giorni
dall'ultima lettura con la rete; "attestati" = documenti di team e
subappalti con file; registro delle aperture SOLO sul telefono (cancellato
con "Esci"): registrarlo nel database richiede una tabella nuova (sql/NN,
task a parte); la chiave non esportabile protegge da copia dei dati, non da
chi usa il telefono sbloccato con la sessione aperta. Guide info-tec-23,
info-rap-32, info-ct-27 (e righe delle posizioni in info-rap-31, info-tit-30,
info-ing-27). Prove: test/letture-offline.spec.js (Chrome headless, database
locale, richieste abortite in modalità aereo: C rappresentante a 390 px, 71
letture cifrate senza testo in chiaro, chiave non esportabile, modalità aereo
con la memoria del sito svuotata = progetto riaperto dal telefono, "+ Aggiungi
posizione" con il menu del catalogo, salvata in coda, riaperta e risalvata
(una riga), tornata la rete arriva P-01 con l'id del telefono, rimandata =
nessun doppione; D letture di 8 giorni fa = "Errore apertura progetto" e
cancellate; E tecnico: 📥 Tieni sul telefono, senza rete Apri = blob con il
contenuto e apertura registrata, miei_giorni_cantiere uguale, 8 giorni = non
si apre, Esci = 0,0,0,0; F capo tecnico: scheda_cantiere_commessa e
controllo_faldone_commessa senza rete uguali, nuova session_id = letture di
prima cancellate); coda-offline (A0-A5, B1-B5), posizioni, smoke (9 utenti),
entra-come, motore-schede TUTTO OK.
Foto scelte nella finestra del progetto tenute sul telefono (richiesta di
Erika dell'11/11, js/70-foto-bozza-progetto.js caricato dopo js/69 e prima
di js/19 + js/17, NESSUN SQL). Causa trovata: sul telefono le foto scelte in
mp-file / mp-file-extra vivevano solo negli input; si perdevano se la
pagina si ricaricava aprendo la fotocamera (la bozza di testo tornava, le
foto no), con un tocco fuori dalla finestra, e SCEGLIENDO DI NUOVO dallo
stesso campo (l'input sostituiva le foto di prima: una foto alla volta con la
fotocamera = restava solo l'ultima); apriProgettoDaElenco lasciava le
anteprime della finestra di prima; un errore a metà del caricamento faceva
return senza dire cosa era salvato e un progetto NUOVO, ripremendo Salva, si
ricreava. Ora (stesso flusso, stessi campi e bottoni, allegati obbligatori
come prima): i file scelti si SOMMANO (input svuotato dopo la scelta, stessa
foto non ripetuta), ognuno con la ✖ (togliFileSceltoProgetto); restano sul
telefono in IndexedDB toli-foto-bozze CIFRATI AES-GCM (cifraLettura e
decifraLettura di js/57, chiave non esportabile PER PERSONA, non per
sessione: un nuovo accesso dopo la sessione scaduta non le perde; creata una
volta sola anche con più foto scelte insieme, FOTO_BOZZA.inCreazione) sotto
l'impronta SHA-256 della chiave della bozza (chiaveBozzaProgetto: progetto o
"nuovo" del cliente); nome, tipo e campo del file dentro la parte cifrata;
una foto che non si decifra si toglie con un toast;
riaprendo la finestra (apriNuovoProgetto, modificaProgetto,
apriProgettoDaElenco → apriFileSceltiFinestraProgetto) ricompaiono con
l'anteprima e la nota "Ho ripreso N file", e salvaProgetto le conta
(fileSceltiFinestraProgetto). Ogni file arrivato (o già nel progetto) esce
dal telefono; caricamento fermato a metà (caricamentoProgettoFermato):
alert con "Salvati (N)" e "Non salvati (N)" con i nomi (anche se
caricaFileNelProgetto si ferma con un'eccezione), i rimasti restano scelti e
sul telefono, il progetto nuovo resta aperto come "Modifica"; le foto passano
sotto il progetto SUBITO dopo l'insert (se la pagina muore durante il
caricamento tornano riaprendo quel progetto, niente secondo progetto).
Corretto nello stesso giro: con "Entra come" rappresentante il titolare non
creava il progetto (rappresentante_id e caricato_da ora = la persona
impersonata, opz.caricatoDa di caricaFileNelProgetto in js/56; il percorso
nello Storage resta dell'utente vero). "Esci" (con avviso se
ci sono foto) e un'altra persona sul telefono (svuotaCacheDatiOffline
avvolta) cancellano foto e chiave; righe con utente_id; con "Entra come"
solo in memoria; dopo 7 giorni si tolgono. LIMITE: la foto che si sta
scattando quando il telefono ricarica la pagina non arriva mai al sito (va
rifatta); salvate restano tutte quelle scelte prima. Non toccata la finestra
della verifica tecnica (mvt-file). Guida info-rap-30. Prova
test/foto-bozza-progetto.spec.js (database locale, rappresentante a 390 px:
3 foto una alla volta, cifrate; page.reload, riaperto "Nuovo progetto" dello
stesso cliente con le 3 anteprime, Salva = 3 righe, telefono vuoto; ✖; Storage
che rifiuta la 2a foto = messaggio, 1 riga, 2 sul telefono, ricarica, Salva =
3 righe e un solo progetto; Esci = 0 foto e 0 chiavi; browser nuovo con 3
foto scelte in un colpo solo = 3 dopo il ricaricamento; "Entra come"); progetto-doppio,
progetto-rappresentante, smoke TUTTO OK.
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
Dopo sql/257 (storico presidi per tutti i tecnici, richiesta di Erika del
10/11, ESEGUITO l'11/11 dal server MCP (backup pre257, controllo in regola): backup, anteprima in fondo al file,
257-storico-presidi-tutti-tecnici.sql (senza parole di cancellazione, server
MCP), controllo in fondo; richiede 07, 71, 255, tutti in produzione, si ferma
senza; il sito si pubblica prima o dopo): nessuna tabella nuova, nessuna
scrittura nuova, cliente_visibile NON cambia. Policy NUOVE di sola lettura per
ruolo_corrente() = 'tecnico' (anche titolare "come" tecnico):
impianti_lettura_tecnico_tutti (presidi non eliminati dei clienti non
eliminati), sedi_cliente_lettura_tecnico_presidi (sedi dei clienti con
presidi), schede_lettura_tecnico_tutti e manichette_lettura_tecnico_tutti
(storico di quei presidi); funzioni interne cliente_presidi_consultabile e
impianto_presidio_consultabile (security definer, per le policy). clienti:
NESSUNA policy nuova (la riga ha P.IVA, IBAN, banca, PEC, contatti, note
commerciali; i permessi per colonna varrebbero per tutti i ruoli): RPC NUOVA
elenco_clienti_presidi_tecnico() (id, ragione sociale, indirizzo, città,
provincia dei clienti non eliminati con presidi; titolare, capo tecnico,
segreteria, tecnico; 42501 per gli altri). Il riporto (salva_riporto_presidio,
nuovo_intervento_manichetta, registra_scheda_presidio_intervento) e la modifica
dei presidi restano sui clienti visibili (suoi interventi). Nel sito (js/68-
presidi-tecnico.js, caricato prima di js/19): voce 🧯 Presidi nel menu del
tecnico e 'presidi' in PAGINE_RUOLO.tecnico; pagina IN SOLA LETTURA (niente +
Nuovo presidio, Importa, Modifica, Elimina, Sostituito; nota
presidi-tec-nota), nomi dei clienti dalla RPC (hook completaClientiPresidi in
loadPresidi e nomeClientePresidioTecnico in apriSchedaPresidio di js/07),
storico con "👁 Apri" in sola lettura e "Riporta"/"Esegui nuovo controllo"
solo sui clienti visibili (riportaStoricoPresidi, renderPS ed
eseguiNuovoControllo avvolte); RPC tra le letture tenute sul telefono (js/57).
Guida info-tec-24. Prove: sql/257-...-PROVA.sql (solo database di prova,
rollback: tecnico legge presidi, sedi e storico di un cliente senza suoi
interventi, non la riga del cliente né documenti, preventivi, fatture,
contratti, interventi; non scrive presidi né storico; riporto rifiutato;
presidio eliminato escluso; anon niente; titolare "come" tecnico uguale;
rappresentante senza RPC); test/presidi-tecnico.spec.js (Chrome headless,
tecnico a 390 px; PRESIDI_TECNICO_SENZA_SQL=1 dopo il rollback); matrice:
schede_manichette tecnico lettura si; smoke TUTTO OK con e senza sql/257;
rollback provato (schema identico). Senza sql/257: la pagina mostra i clienti
dei suoi interventi con la nota "serve l'aggiornamento", nessun errore (una
chiamata RPC 404).
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

## Richieste al database: fila e memorie brevi (12/11, nessun SQL)
Produzione sul piano Nano di Supabase (0,5 GB, CPU condivisa): molte
richieste insieme da un browser fermano il gestionale per tutti. Nel sito
(js/01, client `db`, global.fetch = fetchSupabaseInFila → fetchConAgitoCome
→ fetchDatabase di js/57): FILA_DB, al massimo 6 richieste in corso per
scheda del browser verso /rest, /storage, /functions (non /auth; senza rete
niente fila); il posto si libera sempre (risposta, errore, interruzione,
o dopo 30 s); letture identiche in corso nello stesso momento (GET/HEAD e
RPC di sola lettura RPC_SOLA_LETTURA_DB con lo stesso corpo) = una sola
richiesta, ognuno la sua copia (Response.clone); memoria di 60 s delle
tabelle quasi fisse (LETTURE_QUASI_FISSE: subappaltatori, utenti, regole,
festività, catalogo lavorazioni, motore, fornitore_tipologie, mezzi...),
annullata da ogni scrittura della stessa scheda (FILA_DB.scritture: ogni
richiesta non GET tranne firme dei file e RPC di sola lettura). dbPublic
(portale) non passa dalla fila. js/63 commesseDelRecord tiene la promessa
(le fonti dei Collegati la chiedevano 5 volte insieme); js/67
leggiSmistamentoProgetto memoria di 30 s per progetto, annullata dalle
scritture. Regola: una lettura nuova di dati che cambiano poco può entrare
in LETTURE_QUASI_FISSE; una RPC nuova di sola lettura va in
RPC_SOLA_LETTURA_DB (se no conta come scrittura: prudente). Prove:
test/fila-richieste.spec.js (fetch finto lento, in errore, appeso,
interrotto); smoke con SMOKE_CONTA_RICHIESTE=1 (richieste per pagina e
quante insieme, in risultato.json) e SMOKE_RITARDO_MS=150 (database lento).
