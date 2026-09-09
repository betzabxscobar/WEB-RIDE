import { readdir, readFile, stat } from 'node:fs/promises'
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
let cssBytes = 0
for (const match of initialCss) cssBytes += (await stat(join(root, 'dist', localAsset(match[1])))).size
requireCondition(cssBytes <= 160 * 1024, `CSS inicial demasiado grande: ${(cssBytes / 1024).toFixed(1)} KB`)
console.log(`CSS inicial: ${(cssBytes / 1024).toFixed(1)} KB`)

if (failures.length) {
  console.error('\nControl de calidad fallido:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Seguridad estatica, metadatos y presupuestos de carga: correctos.')
