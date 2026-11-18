# Riordino del codice: mappe

Spostato da CLAUDE.md il 18/11/2026 (riordino della documentazione), testo invariato.

Regola dei riordini: prima una prova "a fotografia" scattata con il codice di prima, poi piccoli passi; dopo ogni passo fotografia uguale, prove e smoke. Una funzione è scritta una volta sola e chiama passi con nomi chiari (niente `const prima = f; f = function(){...}`).

- Presidi, riordino dal 18/11: rete di sicurezza test/presidi-fotografia.spec.js
  (prova "a fotografia": import estintori/manichette/naspi/porte, reimport,
  viste cartelle/tabella/scadenze, schede, modifica e salvataggio, nuovo
  controllo, tecnico; data del browser fissa 18/11/2026; confronta con
  test/fotografie/presidi.json). Dopo ogni passo del riordino deve dire
  "uguale alla fotografia"; si rifà (FOTOGRAFIA=nuova) SOLO per un
  cambiamento voluto. Bug trovati e corretti il 18/11 (js/07): la modifica
  di un estintore senza capacità metteva la marca nel campo capacità
  (errore impianti_capacita_check, salvataggio impossibile); il modello
  fuori elenco (P6, C5, S6: 100 estintori su 101 in produzione) si
  cancellava salvando (impostaValoreFuoriElenco).
  Passo 1: in js/22 un solo ritocco di prepara/confermaImportPresidi.
  Passo 2: tutto l'import in js/21-presidi-import.js (prima in 07, 20, 21,
  22), ogni funzione scritta una volta: apriImportPresidi (+
  apriImportPresidiFinestra), leggiFileImportPresidi (+ ...Semestre),
  preparaImportPresidi (= preparaImportPresidiPerSede + sistema*ImportPresidi
  per manichette/naspi/estintori), confermaImportPresidi (naspi non
  assegnati → manichette → confermaImportPresidiNormale). js/68 avvolge
  ancora apriImportPresidi per il tecnico.
  Passo 3: apriSchedaPresidio in js/07 senza ritocchi: leggiStoricoPeriodo
  (js/86) → disegnaSchedaPresidio (js/07) → aggiungiStoricoSchedaPresidio
  (js/20, se non è partita un'altra apertura) → aggiungiDatiManichetta-
  SchedaPresidio (js/22).
  Passo 4: renderPC in js/09 senza ritocchi: disegnaCartelleConStorico
  (js/25: storico → elenco per periodo → disegnaCartelleEElimina =
  disegnaCartellePresidi js/09 + aggiungiEliminaTuttoCartelle js/23) e
  rileggiPeriodoCartelle (js/86: periodicità, poi un secondo disegno).
  Passo 5: resetPF/editP/saveP in js/07 senza ritocchi (js/68 avvolge
  ancora editP per il tecnico): azzeraFormPresidio/compilaFormPresidio/
  salvaPresidio (js/07), azzera/compilaCampiManichettaPresidio e
  salvaManichettaPresidio (js/22), azzera/compilaCampoAnnataPresidio e
  prepara/dopoSalvataggioPassoPresidi (js/40). La fotografia ha anche lo
  scenario "Esegui intervento" (passo Presidi, lavoro in corso, ritorno).
  Passo 6: renderPS (tab Scadenze) dichiarata in js/24 = disegnaScadenzePresidi
  + aggiungiNuovoControlloScadenze (js/25); le funzioni dello storico di js/20
  senza ritocchi di js/24: periodoScheda → periodoSchedaManichetta,
  mostraStoricoPresidio → raggruppaStoricoManichetta, apriEditorScheda-
  Presidio → completaEditorSchedaPresidio, salvaSchedaPresidio (porte +6 mesi,
  manichette con periodo) → scriviSchedaPresidio, registraSchedaGiaCaricata
  → registraSchedaManichettaSemestre, caricaStoricoPresidio = leggiStorico-
  Presidio + renderPS; filterP (js/07) chiama renderPS. js/68 avvolge ancora
  mostraStoricoPresidio, apriEditorSchedaPresidio, renderPS (tecnico).
  Passo 7a: loadPC (passo Presidi di Esegui intervento) in js/11 senza
  ritocchi: azzeraStoricoEseguiSeCambiaCliente (js/55) → verificaSostituzione-
  PresidiDisponibile (js/51) → renderPresidiAudit (js/40, con l'audit) o
  disegnaPassoPresidi (js/11) → decoraSostituzionePassoPresidi (js/51) →
  aggiornaControlliAperti e caricaStoricoPassoPresidi (js/55).
  Passo 7b (prima la fotografia con lo scenario 9: chiusura senza intervento
  assegnato e con audit): salvaInt in js/11 = raccogliStoricoDaSalvare (js/55)
  → salvaInterventoConAudit (js/40, con l'audit) o salvaInterventoNormale
  (js/11, il corpo di prima) → dopoSalvataggioStoricoIntervento (js/55);
  tnext chiama auditPassoPresidiCompleto e buildRiep aggiungiAuditRiepilogo
  (js/40); togglePresidioDetail (js/11) e cambiaEsitoAudit (js/40) chiamano
  assicuraControlliPresidio, rimettiLavoroPassoPresidi chiama aggiornaControlli-
  Aperti (js/55); in js/12 loadOdlTecnico = disegnaTendinaInterventiTecnico +
  segnaAuditTendinaInterventi (js/40) e preloadFromOdl = azzeraAuditSeCambia-
  Intervento → precaricaInterventoAssegnato → caricaAuditInterventoScelto
  (js/40); loadPresidi (js/07) chiama verificaSostituzionePresidiDisponibile
  all'inizio.
- Riordino di finestre e dashboard (18/11, fotografia test/finestre-dashboard-
  fotografia.spec.js: dashboard dei 9 ruoli a righe ordinate, finestra di un
  intervento esistente con audit/appuntamento/ritardo, Nuovo intervento, DDT):
  A) openM in js/01 = dimenticaCicliDaCollegare (js/42) e, sul nuovo
  intervento, nascondiBoxAppuntamentoOdl/nascondiBoxAuditOdl (js/41, js/40) →
  mostraFinestra (il corpo di prima; js/14 la usa per riaprire un DDT già
  compilato) → initDDTModal (js/14) per 'm-ddt'. B) openEditOdl in js/15 =
  nascondi riquadri → compilaFinestraIntervento → caricaBoxAuditOdl →
  caricaBoxAppuntamentoOdl → aggiungiRitardoFinestraIntervento (js/86).
  C) loadDash in js/03 = verificaSostituzionePresidiDisponibile (js/51, senza
  aspettare) → iniziaDashboardToccaAMe (js/46) → disegnaDashboard →
  caricaKpiIncassi (js/44) → caricaDashboardFattureRiba (js/45) →
  finisciDashboardToccaAMe; loadDashRappresentante in js/13 = iniziaDashboard-
  ToccaAMe → disegnaDashboardRappresentante → caricaInsolutiRappresentante
  (js/45) → finisciDashboardToccaAMe. Dopo il riordino (decisione di
  Erika del 18/11): sul Nuovo intervento openM toglie anche il riquadro
  "⏰ In ritardo" (togliRitardoFinestraIntervento, js/86), che prima restava
  quello dell'intervento aperto prima. Nella fotografia l'intervento di
  prova con audit nasce con toli.audit_presidi e toli.appuntamento = 'si' (i
  trigger altrimenti tolgono l'audit e lo nascondono al tecnico finché la
  segreteria non fissa l'appuntamento).
- js/18 diviso (riordino del 17/11, codice spostato così com'era, stesso
  ordine di caricamento): 18-preventivi (scheda del preventivo, Rimanda
  indietro, campi delle schede tecniche), 18a-schede-rilievo, 18b-fornitori-
  preventivo, 18c-voci-preventivo, 18d-certificati, 18e-salvataggio-pdf-
  cliente (costi, salvataggio voci, PDF cliente ed esterno), 18f-richiesta-
  fornitore, 18g-lead-sito (lead, coda di Acquisti, link dashboard),
  18h-esito-anticipo (esito, oggetto/nota, computo, anticipo, fattura
  d'anticipo), 18i-commesse (commesse dal preventivo, stati, ricerca). Nel
  resto di questo file "js/18" vuol dire uno di questi. Regola per i tagli:
  il codice eseguito al caricamento di un pezzo non usa nomi dichiarati in
  un pezzo successivo (controllato con acorn).
