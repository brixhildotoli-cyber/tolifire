# Flusso della commessa

Spostato da CLAUDE.md il 18/11/2026 (riordino della documentazione), testo invariato.

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
avviso (js/17). SUPERATO da T2 con sql/83 (F15.13, smistamento automatico):
con le regole di smistamento attive decide il gestionale (vedi sql/83).

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

PDF delle schede tecniche dal preventivo (richiesta di Erika dell'11/11,
js/71-pdf-schede-tecniche.js, NESSUN SQL; caricato dopo js/70 e prima di
js/19): nel tab "📝 Rilievi dell’ingegnere" di preventivo-detail (barra
pvd-pdf-schede sopra pvd-schede-content; renderSchedePreventivo AVVOLTA,
js/18 non toccato) "📄 Scarica le schede tecniche (PDF)" per Acquisti e
titolare (informatico compreso); progetto senza schede = "nessuna scheda".
PDF (jsPDF + autotable, intestazione TOLI FIRE come l'ordine di js/27):
cliente, progetto, preventivo n., data; ogni scheda con titoloSchedaRilievo,
dati in tabella con etichettaCampoTecnico/valoreSchedaTecnica (pareti con
testoPareteCartongesso) nell'ordine del catalogo; posizioni P-xx non tolte
(ubicazione, quantità, misure, campi per posizione non di livello ingegnere).
Si scarica e basta: Schede_tecniche_preventivo_<numero>_<cliente>.pdf.
SCELTE: dati dell'INGEGNERE (scheda.dati), non la copia di Acquisti; fuori
dal PDF blocco comune, foto/video e campi foto, note_calcolo, note_tecniche e
ogni campo livello ingegnere del catalogo, fonti_normative, sede_id, note
delle posizioni. Guide info-com-9, info-tit-3. Prova
test/pdf-schede-tecniche.spec.js (database locale: Acquisti e titolare,
porte REI ×2, estintori, compartimentazione con pareti, blocco comune, P-01,
P-02 e una tolta; testo del PDF con etichette e valori, senza note interne,
foto, fonti, blocco comune; regole di smistamento spente e rimesse come
erano); smoke TUTTO OK.

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
F18.1 "solo avviso" (decisione di Erika, fatto il 18/11, nessun SQL; il
resto di F18.1, cioè stato inviato_cliente, scaduto automatico, superato,
tipo commessa, motivo da lista, NON fatto): con preventivi.data_scadenza
(c'è in tutti) un preventivo senza esito (STATI_PREVENTIVO_SENZA_ESITO, non
sostituito) ha "⏳ Scade tra N giorni" negli ultimi 5 giorni e "⏰ Scaduto
il …" dopo (scadenzaPreventivo / bollinoScadenzaPreventivo in js/18): in I
miei preventivi (con "Valido fino al"), nelle liste del titolare (js/13) e
sotto il riepilogo della scheda (#pvd-scadenza). Il rappresentante ha la
riga "Preventivi in scadenza o scaduti" in Cosa tocca a me (js/46,
preventivi-in-scadenza, rossa se ce n'è uno scaduto). Lo stato non cambia.
Guida info-rap-40. Prova test/scadenza-preventivo.spec.js.
F18.3 (versione scelta da Erika il 19/11, sql/132, js/105; NON fatte stima
di massima e "Chiedi conferma scritta"): richiami del preventivo da far
approvare: "📞 Da richiamare" in I miei preventivi e "Preventivi da
richiamare" in Cosa tocca a me 7 giorni dopo inviato_a_rappresentante_il,
di nuovo dopo 15 (se il primo richiamo è prima dei 15 giorni), o alla data
dell'esito "richiamare"; "📞 Registra richiamo" (finestra
m-richiamo-preventivo). Accettazione con condizioni diverse (solo avviso):
spunta in m-esito-preventivo (#mep-box-condizioni), salvata dopo
accetta_preventivo; il titolare ha "Preventivi accettati con condizioni
diverse: dai l'OK" in Cosa tocca a me (elenco m-condizioni-diverse, "✓ OK,
visto"); richiami e condizioni nella scheda del preventivo (#pvd-richiami).
Senza sql/132 nulla compare. Guide info-rap-42, info-tit-71. Prova
test/richiami-preventivo.spec.js (database locale con sql/132).
F18.8 stati della commessa (versione scelta da Erika il 19/11, solo sito,
js/107; NON fatti: sospensione cliente/CSE con verbale, nuovi stati nel
database; la sospensione resta quella di sql/151): "Presa in carico" =
etichetta di in_preparazione (T1) in ETICHETTE_STATO_COMMESSA (js/18i) e
NOMI_STATO_SCHEDA (js/63); gli avvisi scritti dal database dicono ancora
"In preparazione". Suggerimento sotto "Prossimo passo" (#cmd-suggerimento-
passo, caricaSuggerimentoPassoCommessa chiamata da openCommessaDetail):
materiali (leggiFontiMaterialiCommessa/righeMaterialiCommessa di js/29),
faldone consegnato, data_inizio, sospensione aperta; mai un cambio di stato
(D5). "Annullata (non avviata)": badgeStatoCommessa(stato, id) di js/26
mette data-annullata-id, js/107 guarda commesse_storico (mai in_corso,
fine_lavori o chiusa). Guide info-ct-44, info-seg-41, info-rap-43,
info-tit-73. Prova test/stati-commessa.spec.js. F18.6 e F18.7 rimandate a
F20.15 (decisione di Erika del 19/11).

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
