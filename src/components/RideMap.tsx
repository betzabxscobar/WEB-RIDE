import { useEffect, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Coordinates, Place, TripPosition } from '../lib/trips'
import type { RoadRoute } from '../lib/routing'

const ECUADOR_CENTER: [number, number] = [-78.35, -1.45]
const EMPTY_ROUTE = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } as const

type Props = {
  origin?: Coordinates | null
  destination?: Place | null
  driver?: TripPosition | null
  route?: RoadRoute | null
  onPick?: (lat: number, lng: number) => void
  className?: string
}

function darkTheme(): boolean {
  return document.documentElement.dataset.rideTheme === 'dark'
    || document.body.classList.contains('theme-dark')
    || Boolean(document.querySelector('.theme-dark'))
}

function marker(color: string, label: string): maplibregl.Marker {
  const element = document.createElement('div')
  element.className = 'ride-map-marker'
  element.style.setProperty('--marker-color', color)
  const pin = document.createElement('span')
  const text = document.createElement('b')
  text.textContent = label
  element.append(pin, text)
  return new maplibregl.Marker({ element, anchor: 'bottom' })
}

export default function RideMap({ origin, destination, driver, route, onPick, className = '' }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const onPickRef = useRef(onPick)
  useEffect(() => { onPickRef.current = onPick }, [onPick])

  useEffect(() => {
    if (!container.current) return
    const instance = new maplibregl.Map({
      container: container.current,
      style: darkTheme() ? '/mapa/oscuro.json' : '/mapa/claro.json',
      center: ECUADOR_CENTER, zoom: 6, minZoom: 3, maxZoom: 21,
      attributionControl: false,
    })
    map.current = instance
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    instance.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenMapTiles © OpenStreetMap' }))
    instance.on('click', (event) => onPickRef.current?.(event.lngLat.lat, event.lngLat.lng))
    const resize = new ResizeObserver(() => instance.resize())
    resize.observe(container.current)
    return () => { resize.disconnect(); markers.current.forEach((item) => item.remove()); instance.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const updateTheme = () => {
      const dark = darkTheme()
      const current = instance.getStyle() as StyleSpecification | undefined
      if (!current || !String(current.name ?? '').includes(dark ? 'Ride oscuro' : 'Ride claro')) {
        instance.setStyle(dark ? '/mapa/oscuro.json' : '/mapa/claro.json')
      }
    }
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ride-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const render = () => {
      markers.current.forEach((item) => item.remove())
      const entries: Array<{ point: [number, number]; color: string; label: string }> = []
      if (origin) entries.push({ point: [origin.lng, origin.lat], color: '#0da9d8', label: 'Origen' })
      if (destination) entries.push({ point: [destination.lng, destination.lat], color: '#5b4ae8', label: 'Destino' })
      if (driver) entries.push({ point: [driver.lng, driver.lat], color: '#12a57a', label: 'Conductor' })
      markers.current = entries.map(({ point, color, label }) => marker(color, label).setLngLat(point).addTo(instance))
      const coordinates = route?.points.map(([lat, lng]) => [lng, lat]) ?? []
      const data = coordinates.length > 1
        ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } } as const
        : EMPTY_ROUTE
      const source = instance.getSource('ride-route') as GeoJSONSource | undefined
      if (source) source.setData(data)
      else {
        instance.addSource('ride-route', { type: 'geojson', data })
        instance.addLayer({ id: 'ride-route-shadow', type: 'line', source: 'ride-route', paint: { 'line-color': '#071f2d', 'line-width': 9, 'line-opacity': .28 } })
        instance.addLayer({ id: 'ride-route', type: 'line', source: 'ride-route', paint: { 'line-color': '#11b9ea', 'line-width': 5 } })
      }
      const boundsPoints = coordinates.length > 1 ? coordinates : entries.map((entry) => entry.point)
      if (boundsPoints.length === 1) instance.easeTo({ center: boundsPoints[0] as [number, number], zoom: 15 })
      if (boundsPoints.length > 1) {
        const first = boundsPoints[0] as [number, number]
        const bounds = boundsPoints.reduce((box, point) => box.extend(point as [number, number]), new maplibregl.LngLatBounds(first, first))
        instance.fitBounds(bounds, { padding: 54, maxZoom: 16, duration: 500 })
      }
    }
    if (instance.loaded()) render()
    else instance.once('load', render)
    instance.on('style.load', render)
    return () => { instance.off('style.load', render) }
  }, [destination, driver, origin, route])

  return <div className={`ride-map ${className}`}><div ref={container} className="ride-map-canvas"/></div>
}
