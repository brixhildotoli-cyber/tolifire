# Moduli da costruire

Spostato da CLAUDE.md il 18/11/2026 (riordino della documentazione), testo invariato.

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
   DATI DEL CLIENTE (19/11, Erika: li inserisce la segreteria quando parte
   la commessa; solo sito): in cima alla finestra (#mef-cliente,
   disegnaClienteEmissione) i dati che la fattura copierà (ragione sociale
   fattura, P.IVA/CF, indirizzo, SDI, PEC) con "✏️ Modifica dati del
   cliente" (modificaClienteDaEmissione → apriClienteSegreteria(id, true) di
   js/05: la finestra del cliente di sempre sopra la fattura, sulla parte
   Fatturazione; chiusa, il riquadro si rilegge e importo/nota restano).
   Senza P.IVA e CF non si emette (come prima); senza indirizzo, CAP, città
   o SDI/PEC avviso giallo e si emette. Segreteria: riga rossa "🚀 Commesse
   che partono: dati di fatturazione del cliente da completare" in Cosa
   tocca a me e quei clienti in cima a seg-anag-lista
   (clientiCommessaPartonoDaCompletare di js/03: preventivo in attesa di
   anticipo o accettato, non sostituito). "✏️ Completa" (apriClienteSegreteria)
   fino al 19/11 compilava i campi SPOSTATI (referente nella P.IVA, P.IVA
   nel telefono...) e non caricava le sedi: ora usa editCli. Prova
   test/fatturazione-segreteria.spec.js.
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
     17/11 (segnalazione di Erika, telefono): tornando indietro le
     sezioni aperte (<details>, cartelle dei presidi con data-cartella)
     si richiudevano e la pagina ripartiva dall'alto. Ora js/47 ricorda
     anche le sezioni aperte (sezioniPagine: id del riquadro + titolo
     senza numeri, o data-cartella) e le riapre man mano che la pagina
     si ridisegna; si ferma solo con le letture finite (FILA_DB) e la
     pagina ferma da 400 ms (MutationObserver), massimo 15 s; la freccia
     del browser vale come "indietro" anche di più passi;
     history.scrollRestoration = 'manual'. Anche al ritorno dal PDF.
     Test: test/indietro-sezioni.spec.js (Presidi a 390 px).
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


Esecuzioni dall'editor (Erika, 17/11, dopo il backup pre-blocco): 159-VINCOLO
(vincoli intestatario e percorso con "impresa": 2 su 2), sql/93 (catalogo
prodotti: indice codice normalizzato, vincolo codice non vuoto, unico, trigger
trg_prodotti_catalogo_niente_cancellazione, registro delle azioni: tutto
presente; sql/93 ESEGUITO), i -REGISTRO-CANCELLAZIONI di 151, 153, 155, 156, 158,
170, 178, 181 e 272 (12 trigger trg_registro_azioni anche sulle cancellazioni,
controllati).

14. **Mail del cliente agganciate al progetto (richiesta di Erika del
   19/11/2026)** — PASSO 1 FATTO (solo sito, js/104-mail-progetto.js): il
   rappresentante del cliente (o il titolare) allega al progetto la mail
   della richiesta trascinata da Outlook (.eml letto: mittente, oggetto,
   data; .msg con i campi a mano), sezione "✉️ Mail del cliente" nella
   scheda del progetto (#pd-mail), file in <utente>/<progetto>/mail/ tipo
   application/octet-stream; non vale come allegato per l'invio (js/17,
   js/67 allegatiSenzaMail). Guida info-rap-41, prova test/mail-progetto.spec.js.
   PASSO 2 DA FARE (serve il via di Toli e chi amministra Microsoft 365: la
   posta di toli-fire.com è su Microsoft 365, MX
   tolifire-com01b.mail.protection.outlook.com). Decisioni di Erika: le
   richieste arrivano nelle CASELLE DEI RAPPRESENTANTI; aggancia IL
   RAPPRESENTANTE DEL CLIENTE. Proposta: (a) app registrata in Microsoft
   Entra ID del tenant TOLI, permessi DELEGATI Mail.Read + offline_access
   (ogni rappresentante preme "Collega Outlook" e acconsente per la sua
   sola casella; niente lettura di altre caselle), redirect sul sito;
   (b) Edge Function "outlook" (come avvisi-urgenti): scambio del codice,
   refresh token in una tabella leggibile solo da service_role, ogni 10
   minuti lettura delle mail nuove della Posta in arrivo (delta query di
   Graph) dei rappresentanti collegati; (c) tabella email_ricevute (casella,
   mittente, oggetto, data, anteprima corta, nomi degli allegati, webLink
   "Apri in Outlook", cliente proposto dal mittente: email del referente,
   PEC, dominio; progetto agganciato; RLS: ogni rappresentante solo le sue,
   titolare tutte) con file sql/NN, rollback, matrice dei permessi e
   registro delle azioni; (d) nel sito: "Mail da agganciare" in Cosa tocca
   a me del rappresentante, "Aggancia al progetto" / "Crea progetto da
   questa mail", e le mail agganciate nella stessa sezione #pd-mail (e in
   una sezione della scheda cliente). Da decidere con Toli: quali mail
   salvare (solo quelle dei clienti conosciuti o tutte), per quanto
   tempo, e se copiare gli allegati della mail nel progetto.
