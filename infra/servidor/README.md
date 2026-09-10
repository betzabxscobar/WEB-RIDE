# La web en un servidor propio

Cómo dejar `rideviajes.com.ec` sirviendo la web desde el Ubuntu Server de la red
(`192.168.0.254`), con HTTPS.

El servidor ya trae **nginx** instalado y ocupando el puerto 80, así que se usa
ese y no se instala nada más. La configuración está en
[`ride.nginx.conf`](ride.nginx.conf) y **no toca el sitio que ese nginx sirviera
antes**: responde solo a los nombres de `server_name`, y nginx prefiere una
coincidencia exacta de nombre sobre el `default_server`.

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

## Compilar la web

**En tu máquina**, no en el servidor:

```bash
npm ci
npm run build
```

> **No compiles esto dentro de un flujo de GitHub Actions para el servidor.**
> `vite.config.ts` pone `base: '/WEB-RIDE/'` cuando detecta `GITHUB_ACTIONS`,
> porque es lo que necesita GitHub Pages. Ese build servido en `rideviajes.com.ec`
> carga la página en blanco: busca los archivos en `/WEB-RIDE/assets/…`, que
> ahí no existe.

Queda todo en `dist/`.

## Preparar el servidor

Una sola vez. nginx ya está instalado, así que solo hay que crear la carpeta y
darle de alta el sitio:

```bash
sudo mkdir -p /var/www/ride
sudo chown -R www-data:www-data /var/www/ride
```

Sube `ride.nginx.conf` al servidor y colócalo:

```bash
sudo cp ride.nginx.conf /etc/nginx/sites-available/ride
sudo ln -sf /etc/nginx/sites-available/ride /etc/nginx/sites-enabled/ride
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` antes de recargar: si el archivo tiene un error, lo dice **sin tirar
el sitio que ya estaba sirviendo**. Si `nginx -t` falla, no recargues; arregla
primero.

## Subir una versión

Dos formas. Las dos hacen lo mismo; usa la que te resulte más cómoda.

En ninguna hace falta recargar nginx: sirve archivos del disco, así que la
versión nueva entra sola en cuanto se copia.

### Con Bitvise (ventana gráfica, Windows)

[Bitvise SSH Client](https://bitvise.com/ssh-client-download) es gratis para uso
personal y trae las dos cosas que hacen falta: transferencia de archivos y
terminal.

1. Abre Bitvise y en la pestaña **Login** pon:
   - **Host:** `192.168.0.254`
   - **Port:** `22`
   - **Username:** tu usuario del Ubuntu
   - **Initial method:** `password`
2. Pulsa **Log in**. La primera vez te enseña la huella del servidor y te pide
   confirmarla: acéptala solo si es la primera conexión — si aparece otro día
   sin motivo, alguien se está metiendo en medio.
3. Abre **New SFTP window** (botón a la izquierda). Es un explorador de dos
   paneles: tu equipo a la izquierda, el servidor a la derecha.
4. A la derecha entra en `/tmp` y crea la carpeta `ride-nuevo`.
5. A la izquierda ve a la carpeta `dist` del proyecto, selecciona **todo lo de
   dentro** —no la carpeta `dist`, su contenido— y arrástralo a `ride-nuevo`.
6. Abre **New terminal console** (el otro botón) y ejecuta:

   ```bash
   sudo rm -rf /var/www/ride/*
   sudo cp -r /tmp/ride-nuevo/* /var/www/ride/
   sudo chown -R www-data:www-data /var/www/ride
   rm -rf /tmp/ride-nuevo
   ```

El `rm -rf /var/www/ride/*` de la primera línea es a propósito: los archivos de
`assets/` llevan un hash en el nombre, así que los de versiones viejas no se
sobreescriben nunca y se van acumulando para siempre. Se borra todo y se copia
lo nuevo.

> Fíjate en que el `rm` apunta a `/var/www/ride/*` y no a `/var/www/*` ni a `/`.
> Escrito con prisa, ese comando se lleva por delante lo que le eches.

### Con la línea de comandos

Si prefieres no instalar nada, `scp` ya viene con Git Bash:

```bash
scp -r dist/* usuario@192.168.0.254:/tmp/ride-nuevo/
ssh usuario@192.168.0.254 'sudo rm -rf /var/www/ride/* && sudo cp -r /tmp/ride-nuevo/* /var/www/ride/ && sudo chown -R www-data:www-data /var/www/ride && rm -rf /tmp/ride-nuevo'
```

Crea `/tmp/ride-nuevo` en el servidor antes de la primera vez:

```bash
ssh usuario@192.168.0.254 'mkdir -p /tmp/ride-nuevo'
```

> `rsync` sería más cómodo —solo copia lo que cambió y borra lo que sobra con
> `--delete`—, pero no viene con Git Bash. Si lo instalas en el Ubuntu y en tu
> equipo, sustituye los dos comandos por:
>
> ```bash
> rsync -av --delete dist/ usuario@192.168.0.254:/tmp/ride-nuevo/
> ```

## El certificado HTTPS

**Solo cuando el dominio resuelva desde internet y los puertos lleguen hasta
aquí.** Antes de eso fallará, porque Let's Encrypt necesita alcanzar el servidor
para comprobar que el dominio es tuyo.

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d rideviajes.com.ec -d www.rideviajes.com.ec
```

Certbot edita el archivo del sitio para añadir el `listen 443 ssl`, la
redirección desde HTTP y la renovación automática. No hay que tocar nada a mano.

Comprobar que renovará solo:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

## Comprobar que funciona

Desde la red, sin dominio todavía:

```bash
curl -I http://192.168.0.254
```

Y con dominio y certificado:

```bash
curl -I https://rideviajes.com.ec
echo | openssl s_client -connect rideviajes.com.ec:443 -servername rideviajes.com.ec 2>/dev/null | openssl x509 -noout -issuer -dates
```

Tiene que dar `200` y el emisor debe ser Let's Encrypt.

## Las cabeceras están en dos sitios

`public/_headers` lo leen Netlify y Cloudflare Pages; `ride.nginx.conf` lo lee
este servidor. Ninguno de los dos entiende el formato del otro, así que la lista
está repetida.

Dentro del propio archivo de nginx también se repiten: `add_header` **no se
hereda**, y en cuanto un bloque `location` declara uno, pierde todos los de
arriba. Por eso los bloques de `assets/` y del index vuelven a declarar las
suyas; si no, esos archivos se servirían sin ninguna cabecera de seguridad.

`npm run check:quality` compara las dos y falla si se separan. Si añades una
cabecera, va en los dos archivos.

## Lo que este montaje no cubre

- **La base de datos sigue en Supabase.** Este servidor solo sirve archivos: no
  guarda datos, no valida sesiones y no toca los pagos. Si Supabase cae, la web
  carga pero no hace nada.
- **El servidor de rutas.** La app y la web siguen usando el OSRM público de
  demostración. Montarlo aquí es otro trabajo, y está preparado en el repositorio
  de la aplicación (`infra/osrm`).
- **Copias de seguridad.** No hay nada que respaldar en `/var/www/ride`: se
  regenera con `npm run build`. Lo que sí hay que respaldar es Supabase.
