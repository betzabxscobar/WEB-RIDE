#!/usr/bin/env bash
# Trae los cambios de git y recompila la web, si hay algo nuevo.
#
# Lo lanza un temporizador de systemd cada pocos minutos. No hace falta ningun
# runner ni abrir puertos: es el servidor el que sale hacia GitHub, nadie entra.
# Con el repositorio publico eso importa — un runner auto-alojado ahi deja que
# cualquiera ejecute comandos aqui dentro mediante un pull request.
#
# Instalacion y detalles en README.md.

set -euo pipefail

REPO="${REPO:-/var/www/WEB-RIDE}"
RAMA="${RAMA:-main}"

cd "$REPO"

# Dos ejecuciones a la vez dejarian el `dist` a medias. Si ya hay una en marcha
# esta se va sin hacer nada: dentro de unos minutos vuelve a tocar.
exec 9>/tmp/ride-desplegar.lock
if ! flock -n 9; then
  echo "Ya hay un despliegue en marcha; se omite."
  exit 0
fi

git fetch --quiet origin "$RAMA"

ANTES="$(git rev-parse HEAD)"
DESPUES="$(git rev-parse "origin/$RAMA")"

# Sin cambios no hay nada que hacer... salvo que nunca se haya compilado. En un
# clon recien hecho HEAD ya es origin/main, y si solo se miraran los cambios el
# primer `dist` no llegaria hasta el siguiente commit: nginx sin nada que servir.
if [ "$ANTES" = "$DESPUES" ] && [ -f dist/index.html ]; then
  exit 0
fi

if [ "$ANTES" = "$DESPUES" ]; then
  echo "== No hay dist: primera compilacion de ${DESPUES:0:8}"
else
  echo "== Cambios detectados: ${ANTES:0:8} -> ${DESPUES:0:8}"
  git log --oneline "$ANTES..$DESPUES" | sed 's/^/   /'
fi

# `reset --hard` y no `pull`: si alguien edito un archivo a mano en el servidor,
# un `pull` se queda a medias con un conflicto y el despliegue no vuelve a
# funcionar hasta que alguien entra a arreglarlo. Lo que manda es git.
git reset --hard --quiet "origin/$RAMA"

echo "== Instalando dependencias"
npm ci --silent

# Se compila a una carpeta aparte y solo se cambia por la buena si sale bien.
# `vite build` vacia el destino antes de escribir: compilando directo sobre
# `dist`, un fallo a mitad dejaria la web caida hasta el siguiente intento.
echo "== Compilando"
rm -rf dist.nuevo
if ! npm run build -- --outDir dist.nuevo; then
  echo "!! La compilacion fallo. Se deja la version anterior sirviendo."
  rm -rf dist.nuevo
  exit 1
fi

rm -rf dist.anterior
[ -d dist ] && mv dist dist.anterior
mv dist.nuevo dist

echo "== Listo: sirviendo ${DESPUES:0:8}"
# nginx sirve archivos del disco, asi que no hay que recargarlo.
