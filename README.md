# Gestionale Toli Fire

Applicazione web interna per gestire clienti, impianti, interventi, documenti e ruoli aziendali.

Il frontend è composto da HTML, CSS e JavaScript; dati, autenticazione e permessi sono gestiti da Supabase.

## Per i dipendenti: come accedere dal telefono

Non serve scaricare file, clonare GitHub o installare programmi.

1. Ricevi dall'amministratore il link del gestionale pubblicato (ad esempio `https://brixhildotoli-cyber.github.io/tolifire/`).
2. Aprilo con Chrome su Android oppure Safari su iPhone.
3. Accedi con email e password aziendali.
4. Facoltativo: aggiungilo alla schermata Home.
   - **iPhone/iPad:** Safari > Condividi > **Aggiungi a Home**.
   - **Android:** Chrome > menu con tre puntini > **Installa app** oppure **Aggiungi a schermata Home**.

L'icona nella schermata Home apre comunque il gestionale via Internet. La connessione è necessaria per leggere e aggiornare i dati Supabase.

## Pubblicare il gestionale con GitHub Pages

Questa procedura la esegue chi amministra il repository GitHub.

1. Verifica di aver salvato e inviato (`push`) sul branch da pubblicare i file `index.html`, `style.css`, `manifest.webmanifest`, la cartella `assets/` e tutti i moduli della cartella `js/` (da `00-librerie.js` a `36-lavori-extra.js`).
2. Apri il repository GitHub `brixhildotoli-cyber/tolifire`.
3. Vai in **Settings** > **Pages**.
4. In **Build and deployment**, seleziona **Deploy from a branch**.
5. Scegli il branch da pubblicare, ad esempio `gestionale_new`, e la cartella **/(root)**.
6. Premi **Save** e attendi il completamento della pubblicazione.
7. GitHub mostrerà l'indirizzo pubblico del sito: è il link da inviare ai dipendenti.

Ogni nuovo `push` sul branch scelto aggiorna automaticamente il sito pubblicato.

> Attenzione: GitHub Pages espone il frontend pubblicamente. Non caricare mai nel repository password, chiavi `service_role` di Supabase, esportazioni di dati, documenti aziendali o file `.env` riservati. La chiave `anon`/publishable di Supabase nel frontend è prevista per essere pubblica: la protezione dei dati deve stare nelle policy RLS di Supabase.

## Configurazione Supabase dopo la pubblicazione

Prima di testare da telefono, in Supabase vai su **Authentication** > **URL Configuration**:

1. In **Site URL**, inserisci l'URL pubblico effettivo di GitHub Pages, con `https://` e slash finale.
2. In **Redirect URLs**, aggiungi lo stesso URL.
3. Mantieni anche l'indirizzo locale usato per sviluppo, ad esempio `http://localhost:8080/`, se continui a testare dal Mac.

Questa configurazione è particolarmente importante per inviti, recupero password e conferme via email.

## Sviluppo locale sul Mac

Aprire direttamente `index.html` come file può creare limiti del browser. Dalla cartella del progetto usa invece:

```bash
python3 -m http.server 8080
```

Poi apri [http://localhost:8080](http://localhost:8080).

## Ruoli e sicurezza

- Il ruolo applicativo viene letto dalla tabella `public.utenti`, campo `ruolo`.
- L'utente Auth di Supabase e il record in `public.utenti` devono avere lo stesso `id`.
- I controlli JavaScript migliorano l'interfaccia, ma non proteggono il database: ogni tabella deve avere Row Level Security (RLS) e policy coerenti con i ruoli.
- Prima di assegnare un dipendente, verifica che abbia un utente Auth attivo, un profilo in `public.utenti` e il ruolo corretto.

## Struttura essenziale

```text
index.html             interfaccia e modali; carica i moduli js/ in ordine
style.css              grafica e responsive
manifest.webmanifest   installazione come app (Aggiungi a Home)
assets/                immagini e icone
js/00-*.js … js/36-*.js  logica frontend e chiamate Supabase, divisa in moduli
```

I moduli in `js/` sono caricati da `index.html` con `defer`, nell'ordine numerico da `00-librerie.js` a `18-preventivi.js`, poi le estensioni da `20-storico-presidi.js` a `36-lavori-extra.js` e per ultimo `19-init.js` (avvio). Le estensioni 20–36 possono ridefinire funzioni dei moduli precedenti: l'ordine di caricamento va rispettato.

## Stato del progetto

Il gestionale è in evoluzione. Le modifiche vanno testate prima in locale e poi pubblicate sul branch destinato a GitHub Pages.

## Cartella `sql/` (repository privato)

`sql/` contiene lo schema del database, le policy RLS, le funzioni RPC e la
procedura di backup (`sql/BACKUP.md`). È un **repository git separato e privato**
ed è esclusa da questo repository tramite `.gitignore`, perché questo viene
pubblicato con GitHub Pages. Per lavorarci: `cd sql` e usare git normalmente.
I backup con dati dei clienti non vanno in nessuno dei due repository.
