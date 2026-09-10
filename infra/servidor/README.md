# La web en un servidor propio

Cómo dejar `ride.com.ec` sirviendo la web desde el Ubuntu Server de la red
(`192.168.0.254`), con HTTPS.

## Antes de nada: la dirección que diste es privada

`192.168.0.254` está en el rango `192.168.x.x`, que **no existe en internet**.
Ningún equipo de fuera puede llegar a ella, y eso incluye a Let's Encrypt, que
necesita alcanzar el servidor para comprobar que el dominio es tuyo antes de
darte el certificado.

Así que para que `ride.com.ec` funcione desde fuera hacen falta tres cosas que
no se arreglan con ningún archivo de este repositorio:

| Qué | Dónde se hace |
|---|---|
| **El dominio registrado** | NIC.ec — un `.com.ec` no se puede usar sin registrar |
| **Una IP pública** | Tu proveedor de internet. Si es dinámica, hace falta DNS dinámico |
| **Los puertos 80 y 443 hacia el servidor** | El router: redirección de puertos a `192.168.0.254` |

Y en el DNS del dominio, dos registros `A` apuntando a **la IP pública** (no a
la privada):

```
ride.com.ec.       A    <tu IP pública>
www.ride.com.ec.   A    <tu IP pública>
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
> porque es lo que necesita GitHub Pages. Ese build servido en `ride.com.ec`
> carga la página en blanco: busca los archivos en `/WEB-RIDE/assets/…`, que
> ahí no existe.

Queda todo en `dist/`.

## Preparar el servidor

Una sola vez:

```bash
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo mkdir -p /var/www/ride
sudo chown -R caddy:caddy /var/www/ride
```

Copia el `Caddyfile` de esta carpeta:

```bash
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

`caddy validate` antes de recargar: si el archivo tiene un error, lo dice sin
tirar el sitio que ya estaba sirviendo.

## Subir una versión

Desde tu máquina, con `dist/` recién compilado:

```bash
rsync -av --delete dist/ usuario@192.168.0.254:/tmp/ride-nuevo/
ssh usuario@192.168.0.254 'sudo rsync -a --delete /tmp/ride-nuevo/ /var/www/ride/ && sudo chown -R caddy:caddy /var/www/ride'
```

El `--delete` quita del servidor lo que ya no está en `dist`. Sin él se van
acumulando archivos de versiones viejas, y como llevan hash en el nombre nadie
los borra nunca.

No hace falta recargar Caddy: sirve archivos del disco, así que la versión
nueva entra sola.

## Comprobar que funciona

```bash
curl -I https://ride.com.ec
```

Tiene que dar `HTTP/2 200` y las cabeceras de seguridad. Y el certificado:

```bash
echo | openssl s_client -connect ride.com.ec:443 -servername ride.com.ec 2>/dev/null | openssl x509 -noout -issuer -dates
```

El emisor debe ser Let's Encrypt. Si sale un certificado con nombre `Caddy
Local Authority`, es que Caddy no pudo validar el dominio contra internet y se
puso uno interno: repasa la tabla del principio.

## Las cabeceras están en dos sitios

`public/_headers` lo leen Netlify y Cloudflare Pages; el `Caddyfile` lo lee este
servidor. Ninguno de los dos entiende el formato del otro, así que la lista está
repetida.

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
