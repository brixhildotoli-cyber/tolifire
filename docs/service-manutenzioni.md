# Service: manutenzioni ordinarie

Spostato da CLAUDE.md il 18/11/2026 (riordino della documentazione), testo invariato.

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
