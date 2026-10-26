# Codice morto — moduli `js/00-25` e `index.html`

> **Stato al 26/10/2026 (F2.4, branch `sviluppo`).** Toli ha confermato
> (riferito da Erika il 26/10) i lotti **L1, L2a, L2b, L2c, L3, L4** e la
> D2: sono stati **rimossi**, un commit per lotto (vedi §7). Le sezioni 1
> e 2 restano come registro di ciò che è stato tolto: i numeri di riga
> valgono per il commit 9a52c93 (prima della pulizia), non per il codice
> attuale. **Non** confermati e quindi ancora nel codice: L5 (§3, domande
> D3-D5) e L6 (§4, domanda D7), annotati come lavori nuovi in CLAUDE.md.
> Il database non è stato toccato.

## Metodo

1. Estratte tutte le definizioni di funzione (558) dai 26 moduli:
   `function nome(`, `nome = function`, `nome = async function`,
   `const nome = (...) =>`.
2. Per ogni nome contate le occorrenze come parola intera in tutti i
   moduli e in `index.html` (quindi anche `onclick=`/`onchange=` inline,
   template string, stringhe), escludendo la riga di definizione e i
   commenti `//`.
3. Cercati i richiami dinamici: `window[...]`, `eval`, `new Function`,
   `this[...]`, `typeof X === 'function'`: **nessuno** nel codice.
   L'unica `window.X = function` è `chiudiModal` (01-core.js:188), usata.
4. Seguita la catena delle ridefinizioni (ordine di caricamento reale:
   00…18, 20…25, 19). Gli script non sono moduli ES né `use strict`:
   una `function` dichiarata in uno script successivo sostituisce quella
   precedente; un'assegnazione `nome = ...` la sostituisce al caricamento.
   Le estensioni che salvano prima la versione precedente
   (`const xPrima… = x;`) e la richiamano **non** rendono morta la
   precedente: sono state seguite una per una.
5. Fine esatta di ogni funzione trovata col parser di Node (non a occhio).
6. Duplicati confrontati con `diff`.
7. Controllo inverso: funzioni richiamate da `onclick` ma **inesistenti**.

Livelli di confidenza:
- **ALTA**: nessun richiamo eseguibile, verificato a mano; togliere non
  cambia nulla di ciò che l'utente vede.
- **MEDIA**: nessun richiamo, ma la funzione fa qualcosa di utile che
  forse andava collegata (serve una decisione, non solo un sì).
- **NON TOCCARE**: sembra duplicata ma è viva (catena di estensioni).

---

## 1. ALTA — Copie sovrascritte (la prima definizione non viene mai eseguita) — RIMOSSE (L1, L2a, L2b, L2c)

| # | Funzione | Copia morta | Copia viva | Esito `diff` / motivo |
|---|---|---|---|---|
| 1.1 | `toggleNavMobile` | js/01-core.js:94-105 | js/02-portale-navigazione.js:369-379 | identiche (diff: solo una riga vuota con spazi) |
| 1.2 | `chiudiNavMobile` | js/01-core.js:107-117 | js/02-portale-navigazione.js:381-391 | identiche |
| 1.3 | `etichettaCicloStorico` | js/20-storico-presidi.js:29-34 | `nomeCicloScheda` js/20-storico-presidi.js:22-27 | corpo identico (diff vuoto), mai chiamata: è un doppione con altro nome |
| 1.4 | `renderPC` (cartelle presidi) | js/07-presidi.js:92-401 | js/09-clienti-sedi.js:425-907 (poi estesa da 23 e 25) | **diverse**: la 09 è più recente (periodo, agente estintore, filtro note). La 07 ha in più solo `ricordaPosizionePagina()` in testa (vedi §8, domanda D6) |
| 1.5 | `renderPS` (scadenze) | js/07-presidi.js:408-414 | js/24-scadenze-presidi.js:138-219 (poi estesa da 25) | la 24 la sostituisce senza richiamarla |
| 1.6 | `leggiFileImportPresidi` | js/07-presidi.js:1101-1140 | js/21-sedi-import.js:73-87 (poi estesa da 22) | la 21 la sostituisce senza richiamarla |
| 1.7 | `preparaImportPresidi` | js/07-presidi.js:1142-1403 | js/21-sedi-import.js:88 `preparaImportPresidi = preparaImportPresidiPerSede` (poi estesa 3 volte da 22) | la 07 è richiamata solo dalla versione 20 (riga 1.8), che a sua volta è scavalcata dalla 21 |
| 1.8 | `preparaImportPresidi` (estensione) | js/20-storico-presidi.js:351-363 (commento + `const preparaImportPresidiPrecedente` + nuova versione) | come sopra | la 21 riassegna il nome senza salvarla: mai eseguita |
| 1.9 | `confermaImportPresidi` | js/07-presidi.js:1450-1525 | js/20-storico-presidi.js:294-349 (poi estesa 2 volte da 22) | la 20 la sostituisce senza richiamarla |

Attenzione per il lotto 2: 1.7 e 1.8 vanno tolte **insieme**. Se si
togliesse solo la 07, la riga 20:352 (`const … = preparaImportPresidi;`)
darebbe errore al caricamento e bloccherebbe tutto il modulo 20.

## 2. ALTA — Funzioni mai chiamate (nessun richiamo, nemmeno da HTML) — RIMOSSE (L3, L4)

| # | Funzione | Posizione | Motivo / cosa la sostituisce |
|---|---|---|---|
| 2.1 | `bc` (badge stato cliente) | js/01-core.js:220 | nessuna occorrenza fuori dalla definizione |
| 2.2 | `loadAddrTec` | js/11-esecuzione-interventi.js:33 | corpo vuoto (esce sempre). Più il commento superato js/09-clienti-sedi.js:1418-1420 che la cita |
| 2.3 | `renderPresidiPerSede` | js/11-esecuzione-interventi.js:57-105 | la scheda cliente scrive `cd-presidi-content` da js/09-clienti-sedi.js:189 |
| 2.4 | `openEditCli` | js/09-clienti-sedi.js:1057-1072 | sostituita da `editCliById` (09:367) / `editCli` (09:1097) |
| 2.5 | `salvaAssegnazioneLeadSito` | js/18-preventivi.js:6519-6542 | sostituita da `assegnaEInviaLeadSito` (18:6753) |
| 2.6 | `toggleLeadAssegnateRapp` | js/18-preventivi.js:6725-6732 | l'elemento `rap-lead-assegnate-dettaglio` non esiste più in nessun punto |
| 2.7 | `leadAvvisoEsc` | js/18-preventivi.js:6734-6742 | doppione di `esc`, mai usato |
| 2.8 | `leadAvvisoData` | js/18-preventivi.js:6744-6751 | mai usata |
| 2.9 | `apriNuovoPreventivo` | js/17-progetti.js:1595-1638 | nessuno la apre (il preventivo oggi parte dal flusso F2.3) |
| 2.10 | `salvaNuovoPreventivo` | js/17-progetti.js:1640-1728 | chiamata solo dal bottone della modale `m-nuovo-preventivo`, che apre solo 2.9 |
| 2.11 | modale `m-nuovo-preventivo` | index.html:2760-2825 (commento + div) | aperta solo da 2.9; gli id `pv-*` non sono usati altrove; nessuna regola in style.css |

Controllo transitivo: nessuna altra funzione è richiamata **solo** da
quelle delle sezioni 1 e 2 (verificato: togliendole non resta nessun
"orfano" nuovo).

## 3. MEDIA — Mai chiamate, ma serve una decisione (domande D3-D5)

| # | Funzione | Posizione | Perché non è "da togliere e basta" |
|---|---|---|---|
| 3.1 | `loadImpegniTeamAnonimi` | js/13-rappresentante-crm.js:228-296 | doveva riempire il riquadro "Impegni del team tecnico — prossimi 14 giorni" della dashboard rappresentante (index.html:958-970). Quel riquadro esiste ancora e ha lo **stesso id** `rap-impegni-team-lista` del riquadro sopra (index.html:954): oggi il secondo resta fermo su "Caricamento..." per sempre. La RPC `impegni_tecnici_dashboard` resta usata da 13:82 |
| 3.2 | `eliminaAttivitaIngegnere` | js/05-calendari-richieste.js:488-509 | cancella un'attività dal calendario dell'ingegnere (`calendario_personale`), ma nessun bottone la richiama: oggi un'attività creata per errore non si può eliminare |
| 3.3 | `inviaPreventivoPerApprovazione` | js/18-preventivi.js:5598-5657 | unico punto che mette un preventivo in stato `in_attesa_approvazione`; la pagina del titolare mostra ancora quello stato (js/17-progetti.js:1439, 1519). Senza un bottone, il passaggio "approvazione del titolare" non è raggiungibile dall'interfaccia |

## 4. Bug trovato durante il controllo (non è codice morto, è il contrario)

| # | Cosa | Dove | Effetto |
|---|---|---|---|
| 4.1 | Bottone "🧯 Apri schede manutenzione ordinaria" richiama `apriManutenzioneOrdinaria()`, **che non esiste** | index.html:1909-1920 (bottone e suggerimento; pagina tecnico, passo 1 della scheda) | al clic: errore in console, non succede nulla |
| 4.2 | Modale `m-manutenzione-ordinaria` con bottone `salvaManutenzioneOrdinaria()`, **che non esiste** | index.html:2997-3035 | mai apribile (nessuno la apre) |

Dalla storia git (commit 329c4b3 del 05/10) le due funzioni non sono mai
state scritte: il markup è arrivato da solo. Domanda D7.

## 5. NON TOCCARE — Sembrano duplicati, ma sono vivi

Catene di estensione volute (ogni versione salva la precedente e la
richiama), tutte da lasciare:

- `periodoScheda` 20:35 → 24:25 (`periodoPrimaScadenze`)
- `mostraStoricoPresidio` 20:122 → 24:33
- `apriEditorSchedaPresidio` 20:201 → 24:56; `salvaSchedaPresidio`
  20:238 → 24:82; `registraSchedaGiaCaricata` 20:366 → 24:96
- `caricaStoricoPresidio` 20:96 → 24:223; `filterP` 07:81 → 24:221
- `apriSchedaPresidio` 07:475 → 20:86 → 22:143
- `apriImportPresidi` 07:1074 → 21:12
- `resetPF` 07:439, `editP` 07:727, `saveP` 07:791 → 22 (62, 69, 83)
- `confermaImportPresidi` 20:294 → 22:177 → 22:265
- `leggiFileImportPresidi` 21:73 → 22:157
- `preparaImportPresidi` 21:88 → 22:118 → 22:225 → 22:353
- `renderPC` 09:425 → 23:5 → 25:107; `renderPS` 24:138 → 25:94
- `openM` 01:165 → 14:20 (`_origOpenM`)
- Nomi ripetuti ma **locali** dentro altre funzioni (non sono doppioni):
  `Q` e `num` in js/03-dashboard.js, `card`, `datoNota`, `scheda`, `righe`.

Stato delle voci del vecchio CODICE-MORTO.md (`app.js`): i doppioni di
`toggleImpossibilitato`, `mostraRelazioneBox`, `mostraInfoSede`,
`saveDdt`, `stampaDDT` sono già stati tolti col passaggio ai moduli (oggi
una sola copia: js/11 righe 7, 13, 20; js/14 righe 296, 393).
`loadAddrTec` e `renderPresidiPerSede` restano (voci 2.2 e 2.3).

## 6. Tabelle del DB non usate dal frontend — SOLO ELENCO, MAI CANCELLARE

Verificato che nessun `.from('…')` del frontend le usa. Righe da
`sql/output/01-conteggio-2026-10-26.csv`. Nessuna proposta di
cancellazione: alcune servono a moduli futuri o a funzioni del DB.

| Tabella | Righe al 26/10 | Note |
|---|---|---|
| ads_crm_nuovi_contatti | **6** | usata dalle funzioni DB `ads_crm_registra_nuovo_contatto`, `ads_crm_export_nuovi`, `ads_crm_export_v2` (integrazione esterna) |
| ads_crm_qualificazioni | **2** | come sopra, dati presenti |
| calendario_slot | 0 | |
| contratti | 0 | ha trigger `trg_contratti`; servirà alla Fase 10 (contratti) |
| fatture_righe | 0 | modulo Fatture (Fase 1), ha trigger |
| fatture_scadenze | 0 | modulo Fatture, ha trigger |
| indirizzi_cliente | **311** | dati presenti: probabilmente vecchie sedi prima di `sedi_cliente` (370). Da non toccare |
| listini | 0 | possibile base per "Listini prezzi per cliente" |
| notifiche | 0 | |
| periodicita_presidi | 0 | |
| portale_clienti | 0 | |
| preventivi_righe | 0 | il frontend usa `preventivi_voci` |
| preventivi_schede_tecniche | 0 | |
| riba_presentazioni | 0 | modulo Fatture |
| riba_righe | 0 | modulo Fatture |
| ruoli | **11** | dati presenti |
| solleciti | 0 | modulo Fatture |
| verbali | 0 | |
| verifiche_presidi | 0 | |

Nessun SQL preparato: F2.4 non tocca il database.

---

## 7. Proposta di rimozione in lotti (un lotto = un commit `[F2.4]`)

Ogni lotto si annulla da solo con `git revert <hash>`. Dopo ogni lotto:
`node --check` sui file toccati, ricerca con `grep -rnw` dei nomi tolti
(deve dare zero risultati) e la prova indicata, in locale
(`python3 -m http.server 8080`), con la console del browser aperta: non
devono comparire errori rossi al caricamento.

| Lotto | Contenuto | Righe circa | Prova (ruolo) |
|---|---|---|---|
| **L1** doppioni identici — RIMOSSO `98eff12` | 1.1, 1.2 (01-core.js:93-117, compreso il commento `// NAV MOBILE` se non serve più), 1.3 | 30 | da telefono o finestra stretta: aprire e chiudere il menu, cambiare pagina (qualsiasi ruolo). Titolare: Presidi → scheda → storico, etichette "Gennaio – Giugno" corrette |
| **L2a** scadenze — RIMOSSO `5a0b707` | 1.5 (07:408-414) | 7 | titolare: Presidi → scheda Scadenze, cartelle e date visibili |
| **L2b** cartelle presidi — RIMOSSO `82062a4` | 1.4 (07:92-401) | 310 | titolare e capo tecnico: Presidi → cartelle per cliente, filtri, "Elimina tutto" della sottosezione, + Aggiungi |
| **L2c** importazione CSV — RIMOSSO `af6cc34` | 1.6, 1.7, 1.8, 1.9 (07:1101-1140, 07:1142-1403, 07:1450-1525, 20:351-363) — insieme | 405 | titolare: Presidi → Importa CSV, scelta cliente/sede/gruppo/tipologia, anteprima, conferma su un cliente di prova (estintori, poi manichette e naspi) |
| **L3** funzioni orfane — RIMOSSO `5ef744d` | 2.1-2.8 | 150 | titolare: scheda cliente (tab Presidi), modifica cliente; Lead dal sito: assegna e invia a un rappresentante. Rappresentante: dashboard |
| **L4** vecchio "nuovo preventivo" — RIMOSSO `1e9149f` | 2.9, 2.10, 2.11 | 200 | titolare: avvio preventivo da progetto (flusso F2.3); commerciale: Da preventivare → crea bozza |
| **L5** solo dopo le risposte D3-D5 — NON confermato, nel codice (CLAUDE.md D3-D5) | 3.1 (+ riquadro index.html:958-970), 3.2, 3.3: togliere **oppure** collegare | — | dipende dalla decisione |
| **L6** solo dopo D7 — NON confermato, nel codice (CLAUDE.md D7) | 4.1/4.2: togliere bottone e modale **oppure** scrivere le funzioni | — | tecnico: scheda intervento, passo 1 |

Totale L1-L4: circa 1.100 righe in meno, nessun cambiamento visibile.
L'ordine consigliato è L1 → L2a → L2b → L2c → L3 → L4, un lotto per
volta, ognuno provato prima di passare al successivo, e pubblicazione
su `gestionale_new` solo dopo la prova di tutti.

### Esito della rimozione (26/10/2026)

Per ogni lotto, dopo il commit: `node --check` sui file toccati;
`grep -rnw` dei nomi tolti in `js/` e `index.html` con zero risultati
(per i doppioni di §1 resta, come previsto, la sola copia viva:
`toggleNavMobile`/`chiudiNavMobile` in js/02, `renderPS` in js/24,
`renderPC` in js/09, `leggiFileImportPresidi`/`preparaImportPresidi` in
js/21, `confermaImportPresidi` in js/20, con le estensioni di §5 intatte);
simulazione di caricamento dei 26 moduli nell'ordine reale con DOM e
Supabase finti: zero errori di sintassi e di caricamento, nessun nuovo
`onclick` senza funzione, nessun nuovo id mancante, perse solo le
globali previste. Funzioni mai chiamate rimaste: solo le tre di §3.
Ogni lotto si annulla con `git revert <hash>`. Restano da fare le prove
in browser indicate nella colonna "Prova" prima della pubblicazione su
`gestionale_new`.

## 8. Domande per Toli

- **D1.** (RISPOSTA: confermati L1-L4, 26/10) Confermi la rimozione dei lotti **L1, L2a, L2b, L2c, L3, L4**
  (sezioni 1 e 2: copie mai eseguite e funzioni mai chiamate, nessun
  effetto visibile)? Basta rispondere "CONFERMATO DA TOLI: L1-L4", oppure
  indicare solo i lotti che vanno bene.
- **D2.** (RISPOSTA: sì, superato; rimosso in L4) Il vecchio modo di creare un preventivo (modale "Nuovo
  preventivo" con tipo, validità, sconto, IVA, note — voci 2.9-2.11) è
  definitivamente superato dall'avvio F2.3? Se sì va in L4, se no va
  ricollegato.
- **D3.** Dashboard rappresentante: il riquadro "Impegni del team tecnico
  — prossimi 14 giorni" (oggi bloccato su "Caricamento...") va **tolto**
  (resta "Tecnici impegnati nel mese") o **rimesso in funzione**?
- **D4.** Calendario ingegnere: serve un bottone "Elimina attività"?
  Se sì la funzione 3.2 si collega, se no si toglie.
- **D5.** I preventivi sopra soglia devono passare dall'approvazione del
  titolare (stato "In attesa del titolare")? Se sì, la funzione 3.3 va
  ricollegata a un bottone del commerciale; se no si toglie, insieme alla
  voce "In attesa del titolare" nella pagina del titolare.
- **D6.** (per Erika, non è una rimozione) Il 13/10 il ricordo della
  posizione di scorrimento (`ricordaPosizionePagina`) è stato aggiunto
  alla copia morta di `renderPC` in js/07: sulla versione viva (09) non
  c'è. Verificare a parte se nella pagina Presidi lo scorrimento torna al
  punto giusto; se no, è un piccolo bug da sistemare in una task a parte.
- **D7.** Pagina tecnico: il bottone "Apri schede manutenzione ordinaria"
  non funziona (funzione mai scritta). Va **tolto** (con la sua modale)
  oppure va **costruita** la funzione? Finché si decide, al clic non
  succede nulla.
- **D8.** Tabelle non usate (sezione 6): nessuna proposta di
  cancellazione. Confermi che restano tutte, in particolare quelle con
  dati (`indirizzi_cliente` 311 righe, `ruoli` 11, `ads_crm_*` 8)?
