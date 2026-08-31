import type { Coordinates, Place } from './trips'

export type RoadRoute = {
  points: [number, number][]
  meters: number
  seconds: number
}

type OsrmRoute = {
  distance: number
  duration: number
  geometry: { coordinates: [number, number][] }
}

type OsrmResponse = { code?: string; routes?: OsrmRoute[] }

const configured = String(import.meta.env.VITE_OSRM_URL ?? '').trim().replace(/\/+$/, '')
const OSRM_URL = configured || 'https://router.project-osrm.org'

/** Traza la ruta real por calles. El precio sigue calculándose en Postgres. */
export async function routeBetween(origin: Coordinates, destination: Place, signal?: AbortSignal): Promise<RoadRoute | null> {
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`
  const url = `${OSRM_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&alternatives=3`
  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return null
    const data = await response.json() as OsrmResponse
    if (data.code !== 'Ok' || !data.routes?.length) return null

    const fastest = Math.min(...data.routes.map((route) => route.duration))
    const reasonable = data.routes.filter((route) => route.duration <= fastest * 1.1)
    const best = reasonable.sort((a, b) => a.distance - b.distance)[0]
    return {
      points: best.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      meters: best.distance,
      seconds: best.duration,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return null
  }
}

