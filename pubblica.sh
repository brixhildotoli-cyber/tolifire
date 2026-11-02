#!/bin/zsh
# Pubblica il sito (sviluppo → gestionale_new, GitHub Pages).
# Prima mette a tutti i file js e a style.css un numero di versione nuovo
# (index.html: js/xx.js?v=AAAAMMGGHHMM), così dopo la pubblicazione ogni
# browser prende i file nuovi tutti insieme e non resta con un pezzo di
# sito vecchio e uno nuovo (pagine ferme su "Caricamento", errori).
# Uso: zsh ~/Desktop/GESTIONALE/pubblica.sh
set -e
cd ~/Desktop/GESTIONALE

if [[ "$(git branch --show-current)" != "sviluppo" ]]; then
  echo "❌ Non sei sul branch sviluppo: pubblicazione fermata."; exit 1
fi
if ! git diff --quiet -- index.html || ! git diff --cached --quiet -- index.html; then
  echo "❌ index.html ha modifiche non salvate (commit): pubblicazione fermata."; exit 1
fi

git fetch origin
if ! git merge-base --is-ancestor origin/gestionale_new sviluppo; then
  echo "❌ Sul sito pubblicato c'è qualcosa che non è in sviluppo: pubblicazione fermata, chiedi a Claude."; exit 1
fi

V=$(date +%Y%m%d%H%M)
sed -i '' -E \
  -e "s#(src=\"js/[^\"?]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" \
  -e "s#(href=\"style\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#g" \
  index.html
git add index.html
git commit -q -m "Pubblicazione $V: numero di versione dei file"

git push origin sviluppo:gestionale_new
git push origin sviluppo
echo "✅ Pubblicato (versione $V). Tra qualche minuto ricarica il sito."
