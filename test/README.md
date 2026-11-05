# Smoke test per ruolo (F14.9)

Prova automatica del sito con Chrome headless, da lanciare **prima di ogni
merge** del branch `sviluppo` sul branch pubblicato. Dura circa 2 minuti
(limite: 10 minuti, oltre si ferma come fallito).

Per ognuno dei 9 ruoli (titolare, informatico, segreteria, capo tecnico,
contabile, tecnico, rappresentante, commerciale, ingegnere):

1. login dal modulo del sito (email e password);
2. `PAGINE_RUOLO` del sito confrontato con l'elenco `ATTESE` in
   `smoke.spec.js`: una pagina tolta (o aggiunta) senza aggiornare
   l'elenco **fa fallire il test**;
3. apertura di ogni pagina del ruolo (le schede di dettaglio con il primo
   dato visibile al ruolo): fallisce con errori JavaScript, pagina che non
   si apre, messaggio o riquadro di errore, errori 5xx del database o
   colonne/funzioni inesistenti. Gli altri rifiuti del database (4xx, es.
   permessi per ruolo) sono solo "avviso";
4. un salvataggio di prova per pagina principale, con le stesse funzioni dei
   bottoni: **cliente** (segreteria e rappresentante), **intervento** (capo
   tecnico, sul cliente della segreteria), **progetto tecnico** con allegato
   e invio al commerciale (rappresentante), **preventivo** con una voce
   (commerciale, sul progetto del rappresentante). I dati si chiamano
   `SMOKE TEST <data ora>`.

Esito: `TUTTO OK` (uscita 0) oppure `FALLITO: <ruoli>` (uscita 1) con le
righe `FALLITO` da correggere. Risultato completo e schermate dei ruoli
falliti in `$TMPDIR/toli-smoke/` (oppure `SMOKE_RISULTATI=<cartella>`);
anche i file scaricati dal sito finiscono lì, non nei Download.

**Mai contro la produzione.** Le richieste del sito verso Supabase non
escono dal browser: lo script le intercetta e le manda al database di prova;
quelle verso altri progetti Supabase sono bloccate. Nel repository nessuna
credenziale: impostazioni e password stanno in file esclusi da git
(`test/.smoke-*.env`, `test/utenti-prova.json`).

## Oggi: database locale in Docker (finché non c'è F14.8)

Una volta sola: `cd ~/Desktop/GESTIONALE/test && npm install`
(scarica `puppeteer-core`, usa il Chrome già installato).

```zsh
cd ~/Desktop/GESTIONALE/test
zsh locale/avvia-db-locale.sh     # 1. database di prova (circa 30 secondi)
npm run smoke                     # 2. smoke test
zsh locale/ferma-db-locale.sh     # 3. alla fine, spegne e cancella il database di prova
```

`avvia-db-locale.sh` ripristina in Docker il backup più recente di
`~/Backup-ToliFire` (Metodo B di `sql/BACKUP.md`; un'altra cartella come
primo argomento), esegue i file `sql/NN-*.sql` arrivati dopo il backup
(backup `preNN`: dal NN in poi, senza `-ROLLBACK` e `-PROVA`; oppure i file
indicati dopo la cartella), prepara il locale (`locale/prepara-locale.sql`:
`auth.uid()` come su Supabase, un utente "Prova Smoke" per i ruoli che nel
backup non hanno utenti, oggi il contabile) e avvia PostgREST: le policy RLS
sono quelle vere. Il login è simulato (token firmati con un segreto locale
generato a ogni avvio), i file caricati nello Storage non si salvano.
Esempio con un file SQL da provare prima di eseguirlo in produzione:

```zsh
zsh locale/avvia-db-locale.sh ~/Backup-ToliFire/2026-11-05-pre66 66-avvisi-urgenti-immediati.sql 67-nuovo.sql
```

## Dopo F14.8: progetto Supabase di prova

Cambiano solo indirizzo e chiave: copiare `smoke-progetto.env.esempio` in
`test/.smoke-progetto.env`, scrivere indirizzo e chiave anon del progetto di
PROVA, e mettere email e password dei 9 utenti di prova in
`test/utenti-prova.json` (formato nel modello). Poi:

```zsh
cd ~/Desktop/GESTIONALE/test && SMOKE_BACKEND=progetto npm run smoke
```

Lo script si ferma da solo se l'indirizzo o la chiave sono quelli della
produzione. Sul progetto di prova login, Storage e dati sono veri: i dati
`SMOKE TEST ...` restano (si riconoscono dal nome).

## Opzioni (variabili d'ambiente)

- `SMOKE_SOLO_RUOLI=segreteria,tecnico`: solo alcuni ruoli (i salvataggi
  del capo tecnico e del commerciale usano i dati creati da segreteria e
  rappresentante: provarli insieme).
- `SMOKE_LARGHEZZA=390`: finestra come un telefono (predefinito 1280).
- `SMOKE_AVVISI=no`: non stampa gli avvisi.
- `SMOKE_SITO_DIR=<cartella>`: prova una copia del sito invece del
  repository.
- `SMOKE_CHROME=<percorso>`: Chrome in un'altra posizione.

## Quando si cambia il sito

- Pagina nuova o tolta in `PAGINE_RUOLO` (js/02): aggiornare `ATTESE` in
  `smoke.spec.js` nello stesso commit, altrimenti il test fallisce.
- Pagina di dettaglio nuova (si apre con un id): aggiungerla a `DETTAGLI`.
- Campo obbligatorio nuovo in cliente, intervento, progetto o preventivo:
  aggiornare il salvataggio in `SALVATAGGI`.

## Matrice dei permessi (F14.13)

Con il database di prova acceso (stesso `avvia-db-locale.sh`):

```zsh
zsh ~/Desktop/GESTIONALE/sql/matrice-permessi.sh
```

Controlla `sql/matrice_permessi.csv` (per ogni tabella e ruolo: lettura,
inserimento, modifica, cancellazione attesi) entrando come un utente vero
di ogni ruolo, in una transazione annullata. Ultima riga `ESITO: TUTTO OK`
(uscita 0) oppure le righe `DIVERSO: <tabella> | <ruolo> | ...` (uscita 1).
Dopo F14.8: `MATRICE_DB_URL=<progetto di prova>` e
`MATRICE_UTENTI="titolare=...,tecnico=..."`. Dettagli in testa a
`sql/matrice-permessi.sh` e `sql/matrice-permessi-controllo.sql`.
