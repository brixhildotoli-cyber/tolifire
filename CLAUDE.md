# Toli Fire — Gestionale Antincendio

## Cos'è
Gestionale per azienda di antincendio. Frontend HTML/CSS/JS vanilla, non più
file unico: `index.html` (markup) + `style.css` + moduli `js/NN-*.js`
caricati nell'ordine scritto in index.html, `19-init.js` per ultimo
(dettagli in README.md). Backend: Supabase (Postgres + Auth + API + Storage).
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

## Documentazione: dove sta cosa
Dal 18/11/2026 questo file contiene solo le regole valide per ogni lavoro;
il resto è in `docs/`, spostato com'era. PRIMA di toccare un'area leggere
il suo file (cercare con grep il numero F.., sql/NN o il nome della funzione):
- `docs/database.md`: tabelle Supabase e ogni "Dopo sql/NN" (cosa fa, se è
  ESEGUITO e quando, cosa richiede), funzioni RPC, bucket, schede comuni
  (es. scheda oggetto, js/63), fila delle richieste FILA_DB (js/01, js/57).
  Ogni tabella o SQL nuovo si aggiunge lì.
- `docs/ruoli.md`: organigramma → ruoli del gestionale, cosa fa ciascuno.
- `docs/commessa.md`: flusso della commessa (12 passaggi), preventivi,
  progetti, acquisti, fatture.
- `docs/service-manutenzioni.md`: manutenzioni ordinarie (Fase 10),
  presidi, audit, appuntamenti.
- `docs/moduli-da-costruire.md`: moduli rinviati e decisioni D1, D2… (i
  commenti nel codice "CLAUDE.md, Moduli" e "CLAUDE.md Dn" rimandano qui).
- `docs/riordino-codice.md`: mappe dei riordini (js/18 diviso, presidi,
  finestre e dashboard): quale funzione chiama quali passi.
- `README.md`: file js e ordine di caricamento; `CODICE-MORTO.md`;
  `GUIDA-INSTALLAZIONE.md`. Cartella `sql/` (repository privato): schema,
  `sql/BACKUP.md`.
Il repository è pubblico come il sito: anche `docs/` (niente chiavi,
password o dati personali in questi file).

## Convenzioni di codice (rispettare SEMPRE)
- HTML/CSS/JS vanilla. Nessun framework o build tool senza chiederlo.
- Riutilizzare le helper esistenti: `ge`, `v`, `toast`, `fd`, `openM`,
  `closeM`. Riutilizzare le funzionalità già presenti nel file.
- Nomi in italiano, coerenti con l'esistente.
- Terminologia antincendio corretta (estintori, presidi, compartimentazione,
  porte REI, manutenzione ordinaria/straordinaria).
- UI a prova di errore: semplice, chiara, facile da usare.
- Dashboard leggere (riordino del 17/11, decisioni di Erika):
  - liste lunghe con `listaCorta(righeHtml[], 5)` di js/01 (prime 5, le
    altre in "▾ Mostra tutti (N)", un <details> che js/47 riapre tornando
    indietro). Usata in Appuntamenti da fissare (js/41), Controlli scaduti
    (js/42), Anagrafiche da completare (js/03), Anticipi da fatturare (js/18, 3);
  - sezioni vuote: js/103 nasconde titolo (tit-section, ct-section-title,
    rap-section) e riquadro seguente se dicono solo "✅/🎉 Nessun…/Tutti …"
    senza bottoni né link; per una sezione nuova basta quella struttura;
  - una parola per cosa: "Richieste dei clienti" (non Ticket), "💶 Registra
    pagamento", "📅 Paga il…" (non Promessa), "📋 Da gestire" (non Workflow);
    niente "(sql/NN)" nei testi per gli utenti;
  - fatto anche: tessere doppie del capo tecnico nascoste (Da pianificare,
    Richieste modifica: data-doppione in index.html), tecnico senza le
    righe oggi/settimana/cantieri in Cosa tocca a me (js/46), rappresentante
    con una sola sezione "👷 Team tecnico: chi è impegnato", riga "Debug"
    tolta (js/05). NON fatto (Erika): le tessere dei numeri del titolare.
  - Il ruolo contabile non c'è in azienda: non serve sistemarne la dashboard.
- Mappe dei riordini (js/18 diviso, presidi, finestre e dashboard): in
  `docs/riordino-codice.md`.
- Funzioni comuni in js/01 (riordino del 17/11): data di oggi SOLO
  `dataLocaleISO()` (tolte oggiFattura, oggiTAM, dataOggiOrdine e altre 5),
  `aggiungiGiorniISO`, `giorniTraISO`, `euro(n, vuoto)` per "1.234,00 €"
  (al posto di euroSconto e formatoEuroSoglia; euroMulta ed euroDelega la
  richiamano). A parte: euroBuono "€ 1.234,00" (fatture, buono: cambiarlo
  cambia quello che si vede, da decidere con Erika) ed euroPreventivo.
- Controlli "SQL già eseguito?" (riordino del 17/11): verificato in
  produzione che ci sono tutti; 51 stati di partenza messi a true (commento
  "riordino 17/11" sulla riga), così le verifica…Disponibil* rispondono
  subito senza leggere il database. NON toccati (controllano anche il
  ruolo o leggono dati): assenze, fermi, FIR, squadra, multe mezzi,
  promesse, eventi sicurezza, migrazione schede, foto/video, annulla,
  deleghe, smistamento, regole, festività. Il database di prova locale va
  tenuto allineato alla produzione (il 17/11 mancavano 226, 263, 264).
  Prove aggiornate il 17/11: catalogo-lavorazioni (conta le lavorazioni
  del database; ingegnere senza bottone del catalogo, decisione del 13/11),
  import-catalogo-lavorazioni (l'import lo fa il titolare da Impostazioni),
  smistamento-famiglie (in produzione le regole sono tutte spente: la prova
  accende le 3 di partenza solo in locale e le rimette); tolta
  voci-quantita-um (colonna "Quantità x UM" tolta dal sito il 12/11).

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
con RLS attiva (l'elenco delle tabelle in docs/database.md è ancora quello del 22/10).
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
"Tabelle Supabase" di docs/database.md. Una tabella senza queste tre cose non si
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
Dal 16/11 il server di `.mcp.json` nell'estensione di VS Code non si collega
più (anche con enabledMcpjsonServers in .claude/settings.local.json): Supabase
è collegato come CONNETTORE DI CLAUDE.AI (strumenti mcp__claude_ai_Supabase__*,
progetto di produzione = quello di SU in js/01). Stesse regole: un file sql/NN
solo dopo backup e "CONFERMATO DA TOLI"; file con drop/delete dall'editor.
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
