# Ruoli

Spostato da CLAUDE.md il 18/11/2026 (riordino della documentazione), testo invariato.

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
- tecnico: dashboard, calendario-tec, tecnico, presidi (consultazione, js/68;
  tutti i clienti con sql/257, richiesta di Erika del 10/11), documenti, info
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
- dal 13/11 (sql/268, js/74) anche 'richieste-acquisto' (voce "🛒 Richieste di
  acquisto") per titolare, capo_tecnico, segreteria (sola lettura) e commerciale
- dal 13/11 (sql/113, js/77) anche 'gare' (voce "🏛️ Gare") per titolare,
  segreteria e commerciale
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
