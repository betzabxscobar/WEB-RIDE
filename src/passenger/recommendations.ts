import type { Coordinates, Place } from '../lib/trips'

export function placeDistance(a: Pick<Coordinates, 'lat' | 'lng'>, b: Pick<Coordinates, 'lat' | 'lng'>): number {
  const rad = (value: number) => value * Math.PI / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export function recommendedPlaces(places: Place[], origin?: Coordinates | null) {
  return places
    .filter((place) => place.source === 'recommended')
    .map((place) => ({ place, km: origin ? placeDistance(origin, place) : undefined }))
    .sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
    .slice(0, 4)
}
