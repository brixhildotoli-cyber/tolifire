# Edge Function `avvisi-urgenti` (F14.6, sql/66)

Manda subito (entro un minuto) gli avvisi **urgenti** come notifica sul
telefono (Web Push) e per email (Brevo), e ogni giorno lavorativo alle 8:00
il riepilogo per email degli avvisi aperti. La chiama SOLO il database
(sql/66: trigger `trg_avvisi_invio_urgente` e pg_cron `toli_riepilogo_avvisi`,
con pg_net). Nessuna chiave in questo repository: tutte nei segreti della
funzione o nel Vault di Supabase.

## Costi

- Web Push (Apple, Google, Mozilla, Microsoft): gratis.
- Supabase Edge Functions: comprese nel piano (Free 500.000 chiamate al
  mese, Pro 2 milioni). Qui sono poche decine al giorno.
- pg_net e pg_cron: estensioni di Supabase, gratis.
- Email con Brevo: piano gratuito 300 email al giorno (bastano: urgenti +
  un riepilogo al giorno per persona). Oltre: piano Starter da circa 9 €
  al mese.

Totale previsto: **0 €** al mese.

## Una volta sola (Erika, dal Terminale del Mac)

1. Chiavi VAPID (la coppia del server per le notifiche):

       npx web-push generate-vapid-keys

   Tieni la **Public Key** (va anche nel database, non è segreta) e la
   **Private Key** (SOLO nei segreti della funzione, mai altrove).

2. Chiave condivisa tra database e funzione:

       openssl rand -hex 32

3. Brevo: Impostazioni > SMTP e API > crea una chiave API; in Mittenti
   verifica l'indirizzo che manda le email (es. gestionale@toli-fire.com).

4. Pubblica la funzione e i segreti (dalla cartella del gestionale, con il
   progetto Supabase collegato: `supabase link --project-ref <progetto>`):

       supabase functions deploy avvisi-urgenti --no-verify-jwt
       supabase secrets set \
         VAPID_PUBLIC_KEY='<Public Key>' \
         VAPID_PRIVATE_KEY='<Private Key>' \
         VAPID_SUBJECT='mailto:amministrazione@toli-fire.com' \
         TOLI_PUSH_SEGRETO='<chiave del punto 2>' \
         SITO_URL='https://<indirizzo del sito pubblicato>/' \
         BREVO_API_KEY='<chiave Brevo>' \
         EMAIL_MITTENTE='gestionale@toli-fire.com'

   `--no-verify-jwt`: la funzione la chiama pg_net, che non ha un login;
   il controllo lo fa la chiave condivisa (header `x-toli-segreto`), senza
   la quale risponde 401. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` li
   mette Supabase da solo.

5. Dopo `sql/66` (con "CONFERMATO DA TOLI: sql/66"), nell'editor SQL di
   Supabase (NON in un file del repository):

       select public.imposta_configurazione_push(
         'https://<progetto>.supabase.co/functions/v1/avvisi-urgenti',
         '<chiave del punto 2>',
         '<Public Key del punto 1>');

   L'indirizzo e la chiave condivisa finiscono cifrati nel Vault; la Public
   Key nella tabella `avvisi_invio_impostazioni`.

6. Prova (titolare): ricarica il sito, 🔔 > **🔔 Attiva le notifiche** sul
   telefono (iPhone: prima Safari > Condividi > Aggiungi alla schermata
   Home, poi apri l'app dall'icona), poi **⚙️ Impostazioni degli invii** >
   **🚨 Avviso urgente di prova a me**. Esito di ogni invio nella tabella
   `avvisi_invii` (canale push / email, esito, errore) e in "ultimo invio".

## Cambiare le chiavi

- VAPID nuove: `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...`
  e di nuovo `imposta_configurazione_push(...)` con la nuova Public Key: i
  telefoni si riiscrivono da soli al prossimo accesso.
- Chiave condivisa nuova: `supabase secrets set TOLI_PUSH_SEGRETO=...` e
  `imposta_configurazione_push(...)` con la stessa chiave.

## Spegnere

Dal sito (titolare): **⚙️ Impostazioni degli invii**. Del tutto:
`sql/66-avvisi-urgenti-immediati-ROLLBACK.sql` e
`supabase functions delete avvisi-urgenti`.
