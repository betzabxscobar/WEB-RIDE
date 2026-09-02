import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Coordinates, Place, TripPosition } from '../lib/trips'
import type { RoadRoute } from '../lib/routing'

const ECUADOR_CENTER: LatLngExpression = [-1.45, -78.35]
const MAX_ZOOM = 19

type Props = {
  origin?: Coordinates | null
  destination?: Place | null
  driver?: TripPosition | null
  route?: RoadRoute | null
  onPick?: (lat: number, lng: number) => void
  className?: string
  dark?: boolean
  labels?: boolean
  locateTo?: Coordinates | null
}

const TILES = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    labelsUrl: '',
  },
  dark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    labelsUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  },
}

function ClickPicker({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onPick?.(event.latlng.lat, event.latlng.lng) })
  return null
}

function FitContent({ points }: { points: LatLngExpression[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15)
    if (points.length > 1) map.fitBounds(points as [number, number][], { padding: [34, 34], maxZoom: MAX_ZOOM })
  }, [map, points])
  return null
}

function ZoomToPoint({ point, trigger }: { point: Coordinates | null; trigger: number }) {
  const map = useMap()
  useEffect(() => {
    if (trigger > 0 && point) map.flyTo([point.lat, point.lng], MAX_ZOOM, { duration: .8 })
  }, [map, point, trigger])
  return null
}

export default function RideMap({ origin, destination, driver, route, onPick, className = '', dark = false, labels = true, locateTo }: Props) {
  const [zoomTrigger, setZoomTrigger] = useState(0)
  const routePoints = route?.points ?? []
  const points: LatLngExpression[] = routePoints.length > 1
    ? routePoints
    : [origin && [origin.lat, origin.lng], destination && [destination.lat, destination.lng], driver && [driver.lat, driver.lng]].filter(Boolean) as LatLngExpression[]
  const tiles = dark ? TILES.dark : TILES.light

  return <div className={`ride-map ${className}`}>
    <MapContainer center={ECUADOR_CENTER} zoom={7} zoomControl={false} scrollWheelZoom maxZoom={MAX_ZOOM} className="ride-map-canvas">
      <TileLayer attribution={tiles.attribution} url={tiles.url} maxNativeZoom={16} maxZoom={MAX_ZOOM}/>
      {tiles.labelsUrl && <TileLayer url={tiles.labelsUrl} maxNativeZoom={16} maxZoom={MAX_ZOOM}/>}
      <ClickPicker onPick={onPick}/>
      <FitContent points={points}/>
      <ZoomToPoint point={locateTo ?? null} trigger={zoomTrigger}/>
      {routePoints.length > 1 && <Polyline positions={routePoints} pathOptions={{ color: '#087da5', weight: 6, opacity: .82 }}/>} 
      {origin && <CircleMarker center={[origin.lat, origin.lng]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#0da9d8', fillOpacity: 1 }}>{labels && <Tooltip permanent direction="top">Origen</Tooltip>}</CircleMarker>}
      {destination && <CircleMarker center={[destination.lat, destination.lng]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#0b2634', fillOpacity: 1 }}>{labels && <Tooltip permanent direction="top">Destino</Tooltip>}</CircleMarker>}
      {driver && <CircleMarker center={[driver.lat, driver.lng]} radius={10} pathOptions={{ color: '#fff', weight: 3, fillColor: '#12a57a', fillOpacity: 1 }}>{labels && <Tooltip permanent direction="top">Conductor</Tooltip>}</CircleMarker>}
    </MapContainer>
    {locateTo && <button className="map-locate-button" onClick={() => setZoomTrigger((value) => value + 1)} aria-label="Centrar en mi ubicación"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5"/></svg></button>}
  </div>
}

