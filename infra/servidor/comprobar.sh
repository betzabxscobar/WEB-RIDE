#!/usr/bin/env bash
# Dice en que punto esta el montaje y cual es el siguiente paso.
#
# Se ejecuta EN EL SERVIDOR y solo lee, asi que no necesita sudo. Esta aqui para
# no repetir a mano la ronda de comprobaciones cada vez que se retoma el tema
# del dominio:
#
#   bash /var/www/WEB-RIDE/infra/servidor/comprobar.sh
#
# Lo que importa esta al final, en «Siguiente paso».

set -uo pipefail

DOMINIO="${DOMINIO:-rideviajes.com.ec}"
REPO="${REPO:-/var/www/WEB-RIDE}"
LAN="${LAN:-192.168.0.254}"

ok()    { printf '  \033[32mok\033[0m    %s\n' "$1"; }
mal()   { printf '  \033[31mmal\033[0m   %s\n' "$1"; }
aviso() { printf '  \033[33m.\033[0m     %s\n' "$1"; }
titulo() { printf '\n== %s\n' "$1"; }

# Solo se guarda el primer fallo: los pasos dependen unos de otros, y una lista
# de cinco cosas rotas cuando en realidad es una sola no ayuda a nadie.
FALTA=""
pendiente() { [ -z "$FALTA" ] && FALTA="$1"; }

# ---------------------------------------------------------------------------
titulo "La web, aqui dentro"

if systemctl is-active --quiet nginx; then
  ok "nginx en marcha"
else
  mal "nginx parado:  sudo systemctl start nginx"
  pendiente "Arranca nginx."
fi

if [ -L /etc/nginx/sites-enabled/ride ] && [ -e /etc/nginx/sites-enabled/ride ]; then
  ok "sitio 'ride' dado de alta"
elif [ -L /etc/nginx/sites-enabled/ride ]; then
  # Paso en su dia: se creo el enlace antes de copiar el archivo. `nginx -t`
  # falla, y tras un reinicio nginx ya no arranca.
  mal "el enlace de sites-enabled apunta a un archivo que no existe"
  pendiente "Copia ride.nginx.conf a /etc/nginx/sites-available/ride y recarga."
else
  mal "el sitio 'ride' no esta en sites-enabled"
  pendiente "Da de alta el sitio: ver README.md, «Preparar el servidor»."
fi

if [ -f /etc/nginx/sites-enabled/default ] || [ -f /etc/nginx/sites-enabled/web-ride ]; then
  aviso "hay otro sitio activo; con server_name exacto no molesta, pero es uno mas que mantener"
fi

CODIGO="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://$LAN" || echo 000)"
if [ "$CODIGO" = "200" ]; then
  ok "http://$LAN responde 200"
else
  mal "http://$LAN responde $CODIGO"
  pendiente "La web no se sirve ni en la red local; mira /var/log/nginx/ride-error.log."
fi

if curl -s -I --max-time 5 "http://$LAN" | grep -qi '^content-security-policy'; then
  ok "cabeceras de seguridad presentes"
else
  mal "sin Content-Security-Policy: se esta sirviendo otra configuracion"
  pendiente "Comprueba que el sitio activo es el de ride.nginx.conf."
fi

# ---------------------------------------------------------------------------
titulo "El despliegue automatico"

# Lo que hace falta para que el despliegue pueda compilar. Son las tres cosas que
# un servidor recien instalado no trae, y sin ellas el temporizador falla en
# silencio: la web se queda en la version de antes, o sin ninguna.
if ! id ride >/dev/null 2>&1; then
  mal "no existe el usuario 'ride', que es quien despliega"
  pendiente "sudo adduser --system --group --home /home/ride --shell /usr/sbin/nologin ride"
fi

NODE_V="$(node -v 2>/dev/null | sed 's/^v//')"
NODE_MAYOR="${NODE_V%%.*}"
NODE_MENOR="$(echo "$NODE_V" | cut -d. -f2)"
if [ -z "$NODE_V" ]; then
  mal "no esta instalado Node.js"
  pendiente "Instala Node 22: ver README.md, «Preparar el servidor», paso 1."
elif [ "$NODE_MAYOR" -lt 20 ] || { [ "$NODE_MAYOR" -eq 20 ] && [ "$NODE_MENOR" -lt 19 ]; } \
     || { [ "$NODE_MAYOR" -eq 21 ]; } || { [ "$NODE_MAYOR" -eq 22 ] && [ "$NODE_MENOR" -lt 12 ]; }; then
  mal "Node $NODE_V es viejo: Vite pide 20.19 o 22.12 como minimo"
  pendiente "Instala Node 22 de NodeSource: ver README.md, «Preparar el servidor», paso 1."
else
  ok "Node $NODE_V"
fi

if [ -d "$REPO/.git" ]; then
  DUENO="$(stat -c '%U' "$REPO" 2>/dev/null)"
  if [ "$DUENO" = "ride" ]; then
    ok "el repositorio es de 'ride'"
  else
    mal "el repositorio es de '$DUENO', no de 'ride': el despliegue no podra actualizarlo"
    pendiente "sudo chown -R ride:ride $REPO"
  fi
else
  mal "no hay repositorio en $REPO"
  pendiente "sudo git clone https://github.com/betzabxscobar/WEB-RIDE.git $REPO && sudo chown -R ride:ride $REPO"
fi

if systemctl is-enabled --quiet ride-desplegar.timer 2>/dev/null; then
  ok "temporizador activado"
  systemctl list-timers ride-desplegar --no-pager 2>/dev/null | sed -n '2p' | sed 's/^/        /'
else
  mal "el temporizador no esta activado"
  pendiente "sudo systemctl enable --now ride-desplegar.timer"
fi

RAMA_SERVICIO="$(systemctl show ride-desplegar.service -p Environment --value 2>/dev/null | tr ' ' '\n' | sed -n 's/^RAMA=//p')"
RAMA_SERVICIO="${RAMA_SERVICIO:-main}"
RAMA_REPO="$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
echo "        el servicio sigue la rama: $RAMA_SERVICIO"
echo "        el repositorio esta en:    $RAMA_REPO"
if [ "$RAMA_SERVICIO" != "$RAMA_REPO" ]; then
  # No es un fallo: el script hace `reset --hard` a la rama que le digan, asi
  # que en la proxima vuelta se lleva el repositorio a la suya. Pero conviene
  # verlo, porque es lo que explica un «subi un cambio y no aparece».
  aviso "no coinciden: en la proxima vuelta el repositorio pasara a $RAMA_SERVICIO"
  aviso "para cambiarlo:  sudo systemctl edit ride-desplegar.service   ->  [Service] Environment=RAMA=..."
fi

echo "        sirviendo ahora: $(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo '?')"
if git -C "$REPO" fetch --quiet origin "$RAMA_SERVICIO" 2>/dev/null; then
  ATRAS="$(git -C "$REPO" rev-list --count "HEAD..origin/$RAMA_SERVICIO" 2>/dev/null || echo '?')"
  if [ "$ATRAS" = "0" ]; then
    ok "al dia con GitHub"
  else
    aviso "$ATRAS cambios sin desplegar; el temporizador los coge en 2 minutos"
  fi
else
  mal "no se pudo hablar con GitHub"
  pendiente "El servidor no llega a GitHub; sin eso no se actualiza solo."
fi

if [ -d "$REPO/dist" ]; then
  ok "dist presente ($(du -sh "$REPO/dist" 2>/dev/null | cut -f1))"
else
  mal "no hay dist: la ultima compilacion no llego a terminar"
  pendiente "sudo systemctl start ride-desplegar.service  y mira el registro."
fi

# El build llego a 1,1 GB de pico. En un servidor de 2 GB sin swap el kernel
# mata al compilador a mitad: la web no se cae —se queda la version anterior—
# pero deja de actualizarse y nadie se entera.
MEM="$(free -m | awk '/^Mem:/{print $2}')"
SWAP="$(free -m | awk '/^Swap:/{print $2}')"
echo "        memoria: ${MEM} MB    swap: ${SWAP} MB"
if [ "$MEM" -lt 2048 ] && [ "$SWAP" -lt 1024 ]; then
  aviso "poca memoria y sin swap: el build (1,1 GB de pico) puede morir a mitad"
  aviso "arreglo:  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile"
  aviso "para que sobreviva al reinicio, anadir /swapfile a /etc/fstab"
fi

# ---------------------------------------------------------------------------
titulo "Salir a internet"

PUBLICA="$(curl -s --max-time 8 https://api.ipify.org || echo '')"
if [ -z "$PUBLICA" ]; then
  mal "no se pudo averiguar la IP publica"
  pendiente "El servidor no tiene salida a internet."
else
  echo "        IP publica vista desde fuera: $PUBLICA"
  # Una IP privada aqui significa que el proveedor comparte la direccion entre
  # varios clientes. Ahi no hay redireccion de puertos posible: no es tuya.
  if echo "$PUBLICA" | grep -qE '^(10\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)'; then
    mal "esa IP es privada: hay CGNAT"
    pendiente "Con CGNAT no hay puertos que abrir. Pide IP publica al proveedor, o pon la web en un servidor con IP propia."
  else
    ok "es una IP publica de verdad"
    aviso "falta confirmar que sea TUYA: en el router de 192.168.8.1, su IP WAN debe ser $PUBLICA"
    aviso "si alli aparece otra (10.x o 100.64.x), es CGNAT y no hay nada que configurar"
  fi
fi

RESUELVE="$(getent hosts "$DOMINIO" 2>/dev/null | awk '{print $1; exit}')"
if [ -z "$RESUELVE" ]; then
  mal "$DOMINIO no resuelve todavia"
  pendiente "Crea en NIC.ec dos registros A —$DOMINIO y www— apuntando a ${PUBLICA:-tu IP publica}. Puede tardar horas."
else
  echo "        $DOMINIO resuelve a: $RESUELVE"
  if [ "$RESUELVE" = "$PUBLICA" ]; then
    ok "el DNS apunta a esta conexion"
  else
    mal "el DNS apunta a $RESUELVE, no a $PUBLICA"
    pendiente "Corrige los registros A en NIC.ec: deben apuntar a $PUBLICA."
  fi
fi

# ---------------------------------------------------------------------------
titulo "Los puertos, desde fuera"

# Desde el propio servidor esta prueba no vale: muchos routers no saben
# devolver hacia dentro una peticion a su propia IP publica (no hay hairpin
# NAT) y dan un fallo que no significa nada. La unica prueba buena es de fuera.
echo "        No se puede comprobar desde aqui. Con el movil en datos moviles"
echo "        y el wifi apagado, abre:"
echo "            http://${PUBLICA:-<tu IP publica>}"
echo "        Si carga la web, los puertos llegan. Si no, faltan las dos"
echo "        redirecciones: 80 y 443 hacia 192.168.8.215 en el router de"
echo "        arriba, y hacia $LAN en el TP-Link."

# ---------------------------------------------------------------------------
titulo "HTTPS"

if [ -d "/etc/letsencrypt/live/$DOMINIO" ]; then
  ok "certificado emitido"
  openssl x509 -in "/etc/letsencrypt/live/$DOMINIO/cert.pem" -noout -issuer -enddate 2>/dev/null | sed 's/^/        /'
  if systemctl list-timers 'certbot*' --no-pager 2>/dev/null | grep -q certbot; then
    ok "renovacion automatica programada"
  else
    aviso "no se ve el temporizador de renovacion:  sudo certbot renew --dry-run"
  fi
else
  aviso "sin certificado todavia"
  # Lanzar certbot antes de que el dominio llegue hasta aqui gasta intentos:
  # Let's Encrypt limita los fallos y deja fuera un buen rato.
  aviso "NO lo lances hasta que la web cargue desde el movil por IP y el DNS resuelva"
  aviso "cuando eso este:  sudo certbot --nginx -d $DOMINIO -d www.$DOMINIO"
fi

# ---------------------------------------------------------------------------
printf '\n== Siguiente paso\n'
if [ -n "$FALTA" ]; then
  printf '  %s\n\n' "$FALTA"
  exit 1
fi
if [ ! -d "/etc/letsencrypt/live/$DOMINIO" ]; then
  printf '  Comprueba desde el movil que http://%s carga; despues, certbot.\n\n' "${PUBLICA:-<IP publica>}"
  exit 0
fi
printf '  Nada pendiente: https://%s deberia estar sirviendo.\n\n' "$DOMINIO"
