#!/bin/zsh
# F14.9 - Ferma e cancella il database di prova locale dello smoke test
# (solo i container toli-smoke-*: nessun dato vero, è una copia del backup).
export PATH="$PATH:$HOME/.docker/bin"
docker rm -f toli-smoke-rest toli-smoke-db >/dev/null 2>&1 || true
docker network rm toli-smoke-net >/dev/null 2>&1 || true
rm -f ${0:A:h:h}/.smoke-locale.env
echo "Database di prova locale fermato."
