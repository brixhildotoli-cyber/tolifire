# Codice potenzialmente morto in `app.js`

> **Solo analisi.** Niente è stato rimosso. La rimozione di ogni voce
> richiede tua conferma esplicita — in un monolite con tanti `onclick=`
> inline e nomi richiamati come stringhe, "definita ma mai chiamata" è
> un'euristica, non una certezza.
>
> Metodo: estratte tutte le `function name(...)` (200 funzioni totali) e
> contate le occorrenze del nome nel codice (`app.js` + `index.html`),
> escludendo la riga di definizione. Inoltre cercate funzioni definite più
> volte (in JS l'ultima definizione vince → la prima è dead) e stub vuoti.

## 1. ALTA CONFIDENZA — Funzioni duplicate (la prima definizione è morta)

In JavaScript, dichiarare due volte `function nome(){}` fa vincere
l'ultima per via dell'hoisting. La prima definizione viene completamente
sovrascritta e non viene mai eseguita.

| Funzione | Definizione morta | Definizione viva | Note |
|---|---|---|---|
| `toggleImpossibilitato` | `app.js:2691-2695` | `app.js:2837-2841` | corpi identici |
| `mostraRelazioneBox` | `app.js:2697-2701` | `app.js:2843-2847` | corpi identici |
| `mostraInfoSede` | `app.js:2704-2715` | `app.js:2850-2861` | corpi identici |
| `loadAddrTec` | `app.js:2717` | `app.js:2863` | entrambe quasi vuote (vedi §3) |
| `saveDdt` | `app.js:3431-≈3582` | `app.js:4019-...` | ~150 righe duplicate |
| `stampaDDT` | `app.js:3455-...` | `app.js:4062-...` | duplicato |

**Cosa fare**: rimuovere il primo blocco di ogni coppia. Prima rimozione,
confrontare i corpi byte per byte con `diff` per essere sicuri che siano
davvero identici (potrebbero esserci piccole differenze che indicano un
fix dimenticato in uno dei due posti).

## 2. ALTA CONFIDENZA — Funzione mai chiamata

| Funzione | Posizione | Note |
|---|---|---|
| `renderPresidiPerSede` | `app.js:2887` | nessuna occorrenza fuori dalla definizione |

## 3. MEDIA CONFIDENZA — Stub vuoti / no-op

| Funzione | Posizione | Corpo | Cosa fa |
|---|---|---|---|
| `loadAddrTec` (entrambe) | 2717 e 2863 | `{}` e `{const cid=v('tc1');if(!cid)return;}` | la prima è vuota, la seconda esce subito sempre |

La funzione è anche chiamata da `app.js:2717` (auto-riferimento nel commento `// kept for compat`). Una volta verificata l'assenza d'uso reale, può andare via insieme alla sua chiamata.

## 4. INFORMATIVA — Funzioni chiamate da un solo punto

102 funzioni sono definite e chiamate **esattamente una volta**. Non sono
codice morto, ma sono candidate a **inlining** se vuoi snellire il file:
ogni una è un livello di indirezione che potrebbe essere sostituito con
il corpo della funzione nel punto di chiamata.

Non le elenco qui (lista lunga e cambia spesso). Se ti serve la lista
completa per decidere caso per caso, lo script che l'ha generata è in
`/tmp/dead_code2.py` e si può rilanciare in 2 secondi.

Esempio dei candidati più ovvi (chiamati da `onclick=` o da una sola
funzione "padre"):
- `addProdottoCatalogo`, `aggiungiRigaManuale`, `annullaUpload` — bottoni
  unici chiamati da `onclick=` in `index.html`
- `calNext`, `calPrev`, `calTeamNext`, `calTeamPrev`, `calTecNext`,
  `calTecPrev` — navigazione calendari, ognuna usata da un solo bottone
- `copiaLinkCliente`, `eliminaUtente`, `importaExcelCatalogo` — azioni
  one-shot da bottoni

Inlinarle ridurrebbe `app.js` di circa 300-500 righe ma rende meno
leggibile il punto in cui sono usate. Decisione di gusto, non di
correttezza.

## 5. BASSA CONFIDENZA — Funzioni viventi (≥2 chiamate)

62 funzioni sono chiamate da 2+ punti. **Non toccare** senza analisi
dedicata.

## Caveat metodologici (leggere prima di rimuovere)

1. **Riferimenti dinamici non rilevati**: se da qualche parte hai
   `window['nomeFunzione']()` o `eval(...)`, il mio grep non li vede.
2. **`onclick=` con escape**: ho cercato `nomeFunzione` come parola
   isolata; pattern come `"' + 'nomeFunz' + 'ione()'"` sfuggono.
3. **Riferimenti in commenti**: contano come "usate" anche se non lo
   sono. Per ogni candidata alla rimozione, verifica che la chiamata
   identificata sia codice eseguito, non testo dentro un commento.
4. **HTML futuro**: se aggiungi un bottone domani che chiama una funzione
   di questa lista, riscriverla è più rumore del beneficio della
   rimozione.

## Procedura consigliata per la pulizia

1. **Inizia dai duplicati** (§1): rimozione meccanica, rischio bassissimo
   dopo `diff` di verifica. Risparmio: ~300-500 righe.
2. **`renderPresidiPerSede`** (§2): conferma con `grep -r renderPresidiPerSede`
   in tutto il repo + Supabase functions (RPC).
3. **`loadAddrTec`** (§3): rimuovi insieme alla sua unica chiamata.
4. **Lascia stare il §4 per ora**: gli inline-candidates valgono il
   tempo solo dopo che il refactor in moduli multipli sarà fatto.

Tutto rimovibile in §1+§2+§3 = circa 6 funzioni + 1 chiamata, ~310 righe.
