# La web en un servidor propio

Cómo dejar `rideviajes.com.ec` sirviendo la web desde el Ubuntu Server de la red
(`192.168.0.254`), con HTTPS.

El servidor ya trae **nginx** instalado y ocupando el puerto 80, así que se usa
ese y no se instala nada más. La configuración está en
[`ride.nginx.conf`](ride.nginx.conf).

Y ya había un sitio sirviendo la web, `web-ride`, con `server_name _` y raíz en
`/var/www/WEB-RIDE/dist`, pero **sin ninguna cabecera de seguridad**. Se retiró
—solo el enlace de `sites-enabled`, el archivo sigue ahí— y esta configuración
ocupa su lugar sobre la misma carpeta. Dos sitios sirviendo la misma web son dos
sitios que mantener y uno que se queda atrás.

## Antes de nada: la dirección que diste es privada

`192.168.0.254` está en el rango `192.168.x.x`, que **no existe en internet**.
Ningún equipo de fuera puede llegar a ella, y eso incluye a Let's Encrypt, que
necesita alcanzar el servidor para comprobar que el dominio es tuyo antes de
darte el certificado.

### Y hay dos routers, no uno

Comprobado en el panel del TP-Link: su **WAN es `192.168.8.215`**, que también es
privada, con puerta de enlace `192.168.8.1`. O sea que no está conectado a
internet directamente, sino colgando de otro router:

```
Internet  (186.4.226.54)
    ↓
Router del proveedor      192.168.8.1
    ↓
TP-Link    WAN 192.168.8.215  ·  LAN 192.168.0.1
    ↓
Ubuntu Server             192.168.0.254
```

Eso es **doble NAT**: los puertos hay que abrirlos en los dos, no en uno.

| Qué | Dónde se hace |
|---|---|
| **El dominio registrado** | NIC.ec — `rideviajes.com.ec`, ya registrado |
| **Que la IP de arriba sea pública** | Si el router de `192.168.8.1` tiene WAN `10.x` o `100.64.x`, es CGNAT y no hay nada que hacer sin hablar con el proveedor |
| **Puertos 80 y 443 en el router de arriba** | Hacia `192.168.8.215` |
| **Puertos 80 y 443 en el TP-Link** | Hacia `192.168.0.254` |

El rango `192.168.8.x` es el típico de un router 4G/LTE. Si el internet entra
por ahí, es muy probable que haya CGNAT y que la redirección no sirva de nada:
compruébalo antes de configurar nada.

Y en el DNS del dominio, dos registros `A` apuntando a **la IP pública** (no a
la privada):

```
rideviajes.com.ec.       A    <tu IP pública>
www.rideviajes.com.ec.   A    <tu IP pública>
```

> Con una conexión doméstica normal esto puede no ser viable: muchos proveedores
> en Ecuador dan IP detrás de CGNAT, y ahí no hay redirección de puertos que
> valga porque la IP no es realmente tuya. Compruébalo antes de pelearte con la
> configuración: si la IP que ves en `curl ifconfig.me` no coincide con la que
> muestra el router como IP WAN, estás detrás de CGNAT.
>
> Si es el caso, las salidas son: pedir IP pública al proveedor (suele ser un
> extra), poner el sitio en un servidor con IP propia, o dejarlo en la red
> local y resolver el dominio con un DNS interno.

## Cómo se despliega

El repositorio está clonado en el propio servidor, en `/var/www/WEB-RIDE`, y se
compila allí. **Un temporizador de systemd lo hace solo cada dos minutos**: mira
si hay algo nuevo en git y, si lo hay, recompila. No se sube nada por SFTP y no
hay que entrar al servidor para publicar.

Si hace falta lanzarlo a mano:

```bash
sudo systemctl start ride-desplegar.service
journalctl -u ride-desplegar.service -n 30 --no-pager
```

### Por qué así y no con un runner de GitHub

GitHub ofrece instalar un *runner* auto-alojado, y para un repositorio privado
sería la opción cómoda: despliegue inmediato al hacer push. **Este repositorio es
público**, y ahí GitHub lo desaconseja expresamente: cualquiera puede abrir un
pull request que modifique el workflow y, al ejecutarse, correría sus comandos
dentro de este servidor, que está en una red doméstica.

El temporizador no tiene ese problema: es el servidor el que sale hacia GitHub.
Nadie entra, no hay que abrir puertos —cosa nada menor con el doble NAT— y el
precio es un retraso de hasta dos minutos.

### Lo que hace el script

[`desplegar.sh`](desplegar.sh), y merece la pena saber tres cosas:

- **Compila a `dist.nuevo` y solo entonces la cambia por la buena.** `vite build`
  vacía el destino antes de escribir: compilando directo sobre `dist`, un fallo
  a mitad dejaría la web caída hasta el siguiente intento. Si la compilación
  falla, se queda sirviendo la versión anterior y lo dice en el registro.
- **Usa `git reset --hard`, no `git pull`.** Si alguien editó un archivo a mano
  en el servidor, un `pull` se queda en un conflicto y el despliegue no vuelve a
  funcionar hasta que alguien entra a arreglarlo. Lo que manda es git.
- **Se protege con `flock`.** Dos despliegues a la vez dejarían el `dist` a
  medias.

### Instalarlo

```bash
sudo cp /var/www/WEB-RIDE/infra/servidor/ride-desplegar.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ride-desplegar.timer
systemctl list-timers ride-desplegar --no-pager
```

Sigue la rama `main`. Para que siga otra —por ejemplo mientras se prueba—, se
cambia en el servicio:

```bash
sudo systemctl edit ride-desplegar.service
```

y se añade:

```
[Service]
Environment=RAMA=Diego
```

> **Ojo con compilar esto desde un flujo de GitHub Actions.** `vite.config.ts`
> pone `base: '/WEB-RIDE/'` cuando detecta ese entorno, porque es lo que
> necesita GitHub Pages. Ese mismo `dist` servido aquí carga una página en
> blanco: busca los archivos en `/WEB-RIDE/assets/…`, que en este servidor no
> existe. Compilando a mano en el servidor no pasa, porque `GITHUB_ACTIONS` no
> está definida.

## Preparar el servidor

Una sola vez, en este orden. Cada paso depende del anterior: la configuración de
nginx lee un archivo del repositorio, así que el repositorio tiene que estar
antes, y el servicio corre como el usuario `ride`, así que el usuario también.

**1. Node.js 22 y git.** Vite 8 exige Node 20.19 o 22.12 como mínimo. El
`nodejs` de `apt` en Ubuntu es más viejo, y con él la compilación falla. El de
NodeSource sí vale:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
node -v    # tiene que decir v22.x
```

**2. El usuario que despliega.** Con carpeta de inicio: `npm ci` guarda su
caché ahí, y sin ella falla con `EACCES`.

```bash
sudo adduser --system --group --home /home/ride --shell /usr/sbin/nologin ride
```

**3. El repositorio, de ese usuario.** Si se clona con `sudo` y se queda de
root, `ride` no puede actualizarlo y git se niega con «dubious ownership».

```bash
sudo git clone https://github.com/betzabxscobar/WEB-RIDE.git /var/www/WEB-RIDE
sudo chown -R ride:ride /var/www/WEB-RIDE
```

**4. Memoria.** La compilación llega a 1,1 GB. Con 2 GB de RAM o menos, y sin
swap, el kernel la mata a mitad:

```bash
free -m
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

(Solo si `free -m` da poca memoria y ninguna swap.)

**5. La primera compilación**, a mano y como `ride`, para ver si algo falla:

```bash
sudo -u ride bash /var/www/WEB-RIDE/infra/servidor/desplegar.sh
ls /var/www/WEB-RIDE/dist/index.html
```

**6. El sitio en nginx:**

```bash
sudo cp /var/www/WEB-RIDE/infra/servidor/ride.nginx.conf /etc/nginx/sites-available/ride
sudo ln -sf /etc/nginx/sites-available/ride /etc/nginx/sites-enabled/ride
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` antes de recargar: si el archivo tiene un error, lo dice **sin tirar
el sitio que ya estaba sirviendo**. Si `nginx -t` falla, no recargues; arregla
primero.

**7. El cortafuegos**, si `ufw` está activo (`sudo ufw status`):

```bash
sudo ufw allow 'Nginx Full'
```

**8. El despliegue automático:** ver «Instalarlo», más arriba.

**9. Comprobar:** `bash /var/www/WEB-RIDE/infra/servidor/comprobar.sh` dice qué
falta. Desde otro equipo de la red, `http://192.168.0.254` tiene que cargar la
web.

### Lo que no funciona por http, y es normal

Hasta que haya certificado, entrando por `http://192.168.0.254`:

- **La ubicación no funciona.** El navegador solo la da en páginas https (o en
  `localhost`). «Usar mi ubicación», el punto azul y el chofer compartiendo su
  posición desde la web fallan. La búsqueda de direcciones y el mapa, sí van.
- **Los enlaces de los correos** (confirmar cuenta, recuperar contraseña) vuelven
  a la Site URL de Supabase, no a la IP. Eso se configura en *Authentication →
  URL Configuration* cuando haya dominio.

Iniciar sesión, pedir un viaje escribiendo la dirección y el panel de
administración funcionan igual.

## Si algún día hay que subir una versión a mano

Con el repositorio en el servidor no hace falta, pero si alguna vez se compila
en otro equipo: **Bitvise** (gratis en Windows) tiene ventana SFTP para arrastrar
el contenido de `dist` a `/tmp/ride-nuevo`, y consola para colocarlo:

```bash
sudo rm -rf /var/www/WEB-RIDE/dist/*
sudo cp -r /tmp/ride-nuevo/* /var/www/WEB-RIDE/dist/
rm -rf /tmp/ride-nuevo
```

Se borra el destino antes de copiar a propósito: los archivos de `assets/` llevan
un hash en el nombre, no se sobreescriben nunca y se acumularían para siempre.

> Ese `rm -rf` apunta a `/var/www/WEB-RIDE/dist/*`. Escrito con prisa, ese
> comando se lleva por delante lo que le eches.

`rsync` sería más cómodo, pero no viene con Git Bash en Windows.

## El certificado HTTPS

**Solo cuando el dominio resuelva desde internet y los puertos lleguen hasta
aquí.** Antes de eso fallará, porque Let's Encrypt necesita alcanzar el servidor
para comprobar que el dominio es tuyo.

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d rideviajes.com.ec -d www.rideviajes.com.ec
```

Certbot edita el archivo del sitio para añadir el `listen 443 ssl`, la
redirección desde HTTP y la renovación automática.

Lo único a mano, y solo cuando `https://rideviajes.com.ec` ya cargue: quitar el
`#` de la línea `Strict-Transport-Security` en `ride-cabeceras.conf`, subirlo y
recargar nginx. Certbot no la añade, y es la que impide que alguien vuelva a
entrar por http. Sin `preload` al principio: si algo sale mal, se puede retirar
sin esperar a los navegadores.

Comprobar que renovará solo:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

## Comprobar en qué punto está

Sin acordarse de nada. En el servidor:

```bash
bash /var/www/WEB-RIDE/infra/servidor/comprobar.sh
```

Solo lee, así que no hace falta `sudo`. Repasa en orden nginx, el sitio dado de
alta, las cabeceras, el temporizador, **qué rama está siguiendo** —que no tiene
por qué ser la del repositorio—, la memoria disponible, la IP pública, el DNS y
el certificado. Termina con una sola línea: **Siguiente paso**.

Lo que no puede comprobar por sí solo, y lo dice: **si los puertos llegan desde
internet**. Desde el propio servidor esa prueba no vale, porque muchos routers
no saben devolver hacia dentro una petición a su propia IP pública y fallan sin
que eso signifique nada. Se prueba con el móvil en datos móviles, wifi apagado,
entrando a la IP pública.

A mano, si se quiere:

```bash
curl -I http://192.168.0.254
curl -I https://rideviajes.com.ec
echo | openssl s_client -connect rideviajes.com.ec:443 -servername rideviajes.com.ec 2>/dev/null | openssl x509 -noout -issuer -dates
```

Tiene que dar `200` y el emisor debe ser Let's Encrypt.

## Lo que queda, en orden

Ninguno de estos pasos se hace en el servidor ni en el código: son el router, el
registrador del dominio y el proveedor de internet.

1. **Confirmar que la IP pública es tuya.** Entra a `192.168.8.1` y mira su IP
   WAN. Si coincide con la que da `comprobar.sh`, se puede seguir. Si es `10.x` o
   `100.64.x`–`100.127.x`, hay CGNAT y no hay redirección que valga.
2. **Abrir 80 y 443 en los dos routers.** En el de arriba, hacia
   `192.168.8.215`. En el TP-Link, hacia `192.168.0.254`.
3. **Comprobar desde el móvil** que `http://<IP pública>` carga la web.
4. **Apuntar el DNS en NIC.ec**: dos registros `A`, el dominio y `www`, a esa IP.
   Puede tardar horas en propagarse.
5. **Solo entonces, certbot.** Antes falla y gasta intentos: Let's Encrypt limita
   los fallos y deja fuera un rato.

Si el paso 1 sale mal, los demás no sirven de nada, y las salidas son otras: IP
pública contratada al proveedor, un servidor con IP propia, o dejar la web en la
red local con un DNS interno.

## Las cabeceras de seguridad

Están en dos sitios, porque ninguno entiende el formato del otro:
`public/_headers`, que leen Netlify y Cloudflare Pages, y
[`ride-cabeceras.conf`](ride-cabeceras.conf), que lee este servidor.

`ride.nginx.conf` incluye `ride-cabeceras.conf` en el `server` **y en cada
`location` que declare un `add_header` propio**. En nginx, `add_header` no se
hereda: en cuanto un bloque declara uno, pierde todos los de arriba. Así se
estuvo sirviendo el `index.html` sin CSP ni `X-Frame-Options`: el bloque del
index repetía solo `nosniff`.

`npm run check:quality` comprueba las dos cosas: que las dos listas coincidan, y
que ningún bloque `location` con `add_header` se salte el include. Si añades una
cabecera, va en los dos archivos.

El include apunta al archivo del repositorio (`/var/www/WEB-RIDE/infra/...`),
así que llega solo con cada despliegue. Pero nginx lo lee **al recargar**: si un
cambio toca las cabeceras, hay que hacer `sudo nginx -t && sudo systemctl reload
nginx`. El despliegue automático no puede, porque corre sin `sudo`.

La CSP no lleva `upgrade-insecure-requests`. Mientras no haya certificado, esa
directiva hacía que el navegador pidiera los assets por https al entrar por
`http://IP`, y la página salía en blanco justo en la prueba desde el móvil. Con
HTTPS, lo que obliga a usarlo es HSTS.

## Lo que este montaje no cubre

- **La base de datos sigue en Supabase.** Este servidor solo sirve archivos: no
  guarda datos, no valida sesiones y no toca los pagos. Si Supabase cae, la web
  carga pero no hace nada.
- **El servidor de rutas.** La app y la web siguen usando el OSRM público de
  demostración. Montarlo aquí es otro trabajo, y está preparado en el repositorio
  de la aplicación (`infra/osrm`).
- **Copias de seguridad.** No hay nada que respaldar en `/var/www/WEB-RIDE`: es
  un clon de git y `dist` se regenera compilando. Lo que sí hay que respaldar es
  Supabase.
