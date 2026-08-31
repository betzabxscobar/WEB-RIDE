import type { Place } from './trips'

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, unknown>
}

type PhotonResponse = { features?: PhotonFeature[] }

const PHOTON_URL = 'https://photon.komoot.io'
const ECUADOR_BBOX = '-92.2,-5.2,-75.0,1.8'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function fromFeature(feature: PhotonFeature, index: number): Place | null {
  const coordinates = feature.geometry?.coordinates
  if (!coordinates || coordinates.length < 2) return null
  const [lng, lat] = coordinates
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const properties = feature.properties ?? {}
  const street = text(properties.street)
  const number = text(properties.housenumber)
  const rawName = text(properties.name)
  const name = rawName || [street, number].filter(Boolean).join(' ') || 'Punto en el mapa'
  const context = [
    rawName && street && street !== rawName ? [street, number].filter(Boolean).join(' ') : '',
    text(properties.district),
    text(properties.city),
    text(properties.state),
    text(properties.country),
  ].filter(Boolean)

  return {
    id: `geo-${lat}-${lng}-${index}`,
    nombre: name,
    direccion: context.join(', '),
    lat,
    lng,
  }
}

async function photon(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<PhotonResponse> {
  const response = await fetch(`${PHOTON_URL}${path}?${params.toString()}`, { signal })
  if (!response.ok) throw new Error('El buscador de direcciones no respondió.')
  return response.json() as Promise<PhotonResponse>
}

/** Busca direcciones reales dentro de Ecuador usando datos de OpenStreetMap. */
export async function searchPlaces(query: string, center?: { lat: number; lng: number }, signal?: AbortSignal): Promise<Place[]> {
  const value = query.trim()
  if (value.length < 3) return []
  const params = new URLSearchParams({ q: value, limit: '8', bbox: ECUADOR_BBOX })
  if (center) {
    params.set('lat', String(center.lat))
    params.set('lon', String(center.lng))
  }
  const data = await photon('/api/', params, signal)
  return (data.features ?? []).map(fromFeature).filter((place): place is Place => place != null)
}

/** Convierte el punto elegido en el mapa en una dirección legible. */
export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<Place> {
  try {
    const data = await photon('/reverse', new URLSearchParams({ lat: String(lat), lon: String(lng) }), signal)
    const place = data.features?.map(fromFeature).find((item) => item != null)
    if (place) return { ...place, id: `map-${lat}-${lng}`, lat, lng }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
  }
  return { id: `map-${lat}-${lng}`, nombre: 'Punto elegido en el mapa', direccion: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng }
}

