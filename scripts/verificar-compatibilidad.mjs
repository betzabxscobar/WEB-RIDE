import { readFile } from 'node:fs/promises'

const envText = await readFile('.env', 'utf8').catch(() => '')
const entries = envText.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const separator = line.indexOf('=')
  return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, '')]
})
const environment = Object.fromEntries(entries)
const clientSource = await readFile('src/lib/supabase.ts', 'utf8')
const url = environment.VITE_SUPABASE_URL || clientSource.match(/https:\/\/[^']+\.supabase\.co/)?.[0]
const key = environment.VITE_SUPABASE_PUBLISHABLE_KEY || clientSource.match(/sb_publishable_[^']+/)?.[0]
if (!url || !key) throw new Error('Falta la configuración local de Supabase.')

for (const [label, path] of [
  ['Categorías', 'categorias_vehiculo?select=id,nombre&limit=1'],
  ['Chat', 'mensajes?select=id&limit=1'],
  ['Soporte', 'tickets_soporte?select=id&limit=1'],
]) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  console.log(`${label}: HTTP ${response.status}`)
  if (!response.ok) console.log((await response.text()).slice(0, 300))
}
