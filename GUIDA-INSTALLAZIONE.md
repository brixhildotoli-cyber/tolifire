# Guida — Configurare Claude Code per Toli Fire

Questo pacchetto contiene tutto il necessario per lavorare sul gestionale
Toli Fire con Claude Code in modo ordinato e con poco bisogno di tuoi
interventi continui.

## Cosa c'è nel pacchetto
- `CLAUDE.md` — il contesto del progetto. Claude Code lo legge da solo
  all'inizio di ogni sessione. È la "memoria" del progetto.
- `.claude/agents/` — quattro sub-agent specializzati:
  - `revisore-sicurezza.md` — controlla permessi e protezione dati
  - `revisore-codice.md` — controlla qualità e coerenza del codice
  - `refactoring-moduli.md` — aiuta a spezzare il file monolitico
  - `collaudatore-flussi.md` — prepara le checklist di collaudo

## Come installare (una volta sola)

1. Installa Node.js (versione 18 o superiore) dal sito ufficiale nodejs.org
2. Installa Claude Code seguendo le istruzioni ufficiali su
   docs.claude.com (cerca "Claude Code install").
3. Crea una cartella per il progetto sul tuo computer, ad esempio
   `toli-fire`, e metti dentro il file `index.html` del gestionale.
4. Copia dentro questa stessa cartella il file `CLAUDE.md` e la cartella
   `.claude` (con dentro `agents/`) di questo pacchetto.
5. Apri il terminale dentro quella cartella e avvia Claude Code.

La struttura finale sarà:
    toli-fire/
      index.html
      CLAUDE.md
      .claude/
        agents/
          revisore-sicurezza.md
          revisore-codice.md
          refactoring-moduli.md
          collaudatore-flussi.md

## Come si usano i sub-agent
Claude Code li richiama da solo quando servono, grazie al campo
"description". Puoi anche chiamarli a mano, ad esempio:
"Usa il sub-agent revisore-sicurezza per controllare le ultime modifiche."

Verifica che siano caricati con il comando `/agents` dentro Claude Code.

## Piano di lavoro consigliato (modulo per modulo)

FASE 0 — Verifica sicurezza (prima di tutto)
Far controllare a Claude Code lo stato delle RLS su Supabase. Se non sono
attive, i dati sono esposti. Decidere con i dati alla mano se sistemarle
subito o pianificarlo.

FASE 1 — Mettere in sicurezza i permessi
Tradurre la matrice dei permessi in policy RLS su Supabase, così la
protezione non vive più solo nel frontend. Qui serve la tua conferma
prima di attivare le policy in produzione.

FASE 2 — Riorganizzare il codice
Con il sub-agent refactoring-moduli, spezzare il file da 5750 righe in
moduli ordinati. Nessun cambiamento di comportamento: solo ordine.

FASE 3 — Pulizia ("levare le cagate")
Individuare funzioni e codice davvero inutilizzati. ATTENZIONE: ogni
rimozione va confermata da te. Una funzione può sembrare inutile e invece
servire a un ruolo o a un flusso non ovvio.

FASE 4 — Migliorare funzioni ed estetica
Modulo per modulo, aggiornare grafica e funzioni. Ogni modulo viene
provato da te prima di passare al successivo.

## Regola d'oro
Claude Code lavora in autonomia su tutto ciò che è tecnico e reversibile.
Ti chiede conferma solo per: cancellazioni, modifiche allo schema del
database, e attivazione delle policy RLS in produzione. Sono pochi punti,
ma sono quelli che proteggono il tuo lavoro.
