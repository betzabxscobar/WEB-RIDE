import { useEffect } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Coordinates, Place, TripPosition } from '../lib/trips'
import type { RoadRoute } from '../lib/routing'

const ECUADOR_CENTER: LatLngExpression = [-1.45, -78.35]

type Props = {
  origin?: Coordinates | null
  destination?: Place | null
  driver?: TripPosition | null
  route?: RoadRoute | null
  onPick?: (lat: number, lng: number) => void
  className?: string
}

function ClickPicker({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onPick?.(event.latlng.lat, event.latlng.lng) })
  return null
}

function FitContent({ points }: { points: LatLngExpression[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15)
    if (points.length > 1) map.fitBounds(points as [number, number][], { padding: [34, 34], maxZoom: 16 })
  }, [map, points])
  return null
}

export default function RideMap({ origin, destination, driver, route, onPick, className = '' }: Props) {
  const routePoints = route?.points ?? []
  const points: LatLngExpression[] = routePoints.length > 1
    ? routePoints
    : [origin && [origin.lat, origin.lng], destination && [destination.lat, destination.lng], driver && [driver.lat, driver.lng]].filter(Boolean) as LatLngExpression[]

  return <div className={`ride-map ${className}`}>
    <MapContainer center={ECUADOR_CENTER} zoom={7} scrollWheelZoom className="ride-map-canvas">
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
      <ClickPicker onPick={onPick}/>
      <FitContent points={points}/>
      {routePoints.length > 1 && <Polyline positions={routePoints} pathOptions={{ color: '#087da5', weight: 6, opacity: .82 }}/>} 
      {origin && <CircleMarker center={[origin.lat, origin.lng]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#0da9d8', fillOpacity: 1 }}><Tooltip permanent direction="top">Origen</Tooltip></CircleMarker>}
      {destination && <CircleMarker center={[destination.lat, destination.lng]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#0b2634', fillOpacity: 1 }}><Tooltip permanent direction="top">Destino</Tooltip></CircleMarker>}
      {driver && <CircleMarker center={[driver.lat, driver.lng]} radius={10} pathOptions={{ color: '#fff', weight: 3, fillColor: '#12a57a', fillOpacity: 1 }}><Tooltip permanent direction="top">Conductor</Tooltip></CircleMarker>}
    </MapContainer>
  </div>
}

