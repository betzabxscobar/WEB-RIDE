import { readdir, readFile, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { join, relative } from 'node:path'

const root = process.cwd()
const failures = []

async function filesUnder(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await filesUnder(path))
    else result.push(path)
  }
  return result
}

function requireCondition(condition, message) {
  if (!condition) failures.push(message)
}

const sourceFiles = (await filesUnder(join(root, 'src')))
  .filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file))

const forbidden = [
  [/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'],
  [/\.innerHTML\s*=/, 'asignacion directa a innerHTML'],
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\s*\(/, 'new Function()'],
  [/VITE_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET)/, 'secreto expuesto mediante VITE_*'],
  [/SUPABASE_SERVICE_ROLE_KEY/, 'service role dentro del cliente'],
]

for (const file of sourceFiles) {
  const content = await readFile(file, 'utf8')
  for (const [pattern, label] of forbidden) {
    if (pattern.test(content)) failures.push(`${relative(root, file)} contiene ${label}`)
  }
}

const headers = await readFile(join(root, 'public', '_headers'), 'utf8')
for (const header of ['Content-Security-Policy', 'Referrer-Policy', 'X-Content-Type-Options', 'Permissions-Policy']) {
  requireCondition(headers.includes(`${header}:`), `Falta el encabezado ${header}`)
}

// Las mismas cabeceras estan escritas dos veces: `public/_headers` lo leen
// Netlify y Cloudflare Pages, y la configuracion de nginx la lee el servidor
// propio. Ninguno entiende el formato del otro. Se comparan aqui para que nadie
// cambie una y deje la otra atras, que es justo el fallo que no se ve hasta que
// alguien mira las cabeceras del sitio en produccion.
const nginxConf = await readFile(join(root, 'infra', 'servidor', 'ride.nginx.conf'), 'utf8')
const cabecerasNginx = await readFile(join(root, 'infra', 'servidor', 'ride-cabeceras.conf'), 'utf8')
// `\\s` y no `\s`: dentro de un template literal, `\s` se queda en `s` y el
// patron deja de buscar espacios. El `\r?` es para cuando el archivo llega con
// finales de linea de Windows.
const valorEnHeaders = (nombre) => headers.match(new RegExp(`^[ \\t]*${nombre}:[ \\t]*(.+?)\\r?$`, 'm'))?.[1]?.trim()
// Las de nginx viven en `ride-cabeceras.conf`, que se incluye en cada bloque.
const valorEnNginx = (nombre) => cabecerasNginx.match(new RegExp(`^[ \\t]*add_header[ \\t]+${nombre}[ \\t]+"(.+?)"[ \\t]*(?:always)?[ \\t]*;`, 'm'))?.[1]?.trim()

for (const header of ['Content-Security-Policy', 'Referrer-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'Permissions-Policy', 'Cross-Origin-Opener-Policy']) {
  const esperado = valorEnHeaders(header)
  const enNginx = valorEnNginx(header)
  requireCondition(enNginx != null, `La configuracion de nginx no declara ${header}`)
  requireCondition(
    esperado == null || enNginx === esperado,
    `${header} no coincide entre public/_headers y infra/servidor/ride-cabeceras.conf`,
  )
}

// `add_header` no se hereda: un `location` que declare uno propio pierde las de
// seguridad del `server` salvo que vuelva a incluir el archivo. Asi se sirvio el
// index.html sin CSP ni X-Frame-Options, y esta comprobacion no lo vio porque
// solo miraba la primera aparicion de cada cabecera.
const incluye = (texto) => /include\s+\S*ride-cabeceras\.conf\s*;/.test(texto)
for (const [, ruta, cuerpo] of nginxConf.matchAll(/location\s+([^{]+)\{([^}]*)\}/g)) {
  requireCondition(!/add_header/.test(cuerpo) || incluye(cuerpo),
    `nginx: location ${ruta.trim()} declara add_header y no incluye ride-cabeceras.conf`)
}
requireCondition(incluye(nginxConf.replace(/location\s+[^{]+\{[^}]*\}/g, '')),
  'nginx: el server no incluye ride-cabeceras.conf')

const html = await readFile(join(root, 'dist', 'index.html'), 'utf8')
requireCondition(/<html\s+lang="es"/.test(html), 'La salida no declara lang="es"')
requireCondition(/name="viewport"/.test(html), 'La salida no incluye viewport responsivo')
requireCondition(/name="description"/.test(html), 'La salida no incluye descripcion')

const distFiles = await filesUnder(join(root, 'dist'))
requireCondition(!distFiles.some((file) => file.endsWith('.map')), 'Produccion contiene source maps')

const localAsset = (url) => url.replace(/^\/WEB-RIDE\//, '').replace(/^\//, '')
const scriptMatch = html.match(/<script[^>]+src="([^"]+)"/)
if (scriptMatch) {
  const bytes = (await stat(join(root, 'dist', localAsset(scriptMatch[1])))).size
  requireCondition(bytes <= 500 * 1024, `JavaScript inicial demasiado grande: ${(bytes / 1024).toFixed(1)} KB`)
  console.log(`JavaScript inicial: ${(bytes / 1024).toFixed(1)} KB`)
} else failures.push('No se encontro el JavaScript inicial')

const initialCss = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
// Se mide lo que viaja por la red: comprimido, que es como lo sirven nginx y
// GitHub Pages. El tope en bruto (160 KB) lo rompieron los estilos del acceso
// del 2026-09-11 con 213 KB que comprimidos son 37 KB: gzip deja casi en nada
// las reglas que se repiten, y en bruto se castigaba justo eso.
let cssBytes = 0
let cssGzip = 0
for (const match of initialCss) {
  const contenido = await readFile(join(root, 'dist', localAsset(match[1])))
  cssBytes += contenido.length
  cssGzip += gzipSync(contenido).length
}
requireCondition(cssGzip <= 45 * 1024, `CSS inicial demasiado grande: ${(cssGzip / 1024).toFixed(1)} KB comprimido`)
console.log(`CSS inicial: ${(cssBytes / 1024).toFixed(1)} KB (${(cssGzip / 1024).toFixed(1)} KB comprimido)`)

if (failures.length) {
  console.error('\nControl de calidad fallido:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Seguridad estatica, metadatos y presupuestos de carga: correctos.')
