import { useEffect } from 'react'
import { divIcon, latLngBounds } from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Coordinates, Place, TripPosition } from '../lib/trips'
import type { RoadRoute } from '../lib/routing'

const ECUADOR_CENTER: [number, number] = [-1.45, -78.35]
type Props = { origin?: Coordinates | null; destination?: Place | null; driver?: TripPosition | null; route?: RoadRoute | null; onPick?: (lat:number,lng:number)=>void; className?:string }

function pin(label:string,color:string){return divIcon({className:'ride-leaflet-marker',html:`<span style="--pin:${color}"></span><b>${label}</b>`,iconSize:[78,42],iconAnchor:[15,36]})}
function MapInteraction({onPick}:{onPick?:Props['onPick']}){useMapEvents({click:({latlng})=>onPick?.(latlng.lat,latlng.lng)});return null}
function Viewport({origin,destination,driver,route}:Omit<Props,'className'|'onPick'>){
  const map=useMap()
  useEffect(()=>{
    const points:[number,number][]=route?.points?.length?route.points:[origin&&[origin.lat,origin.lng],destination&&[destination.lat,destination.lng],driver&&[driver.lat,driver.lng]].filter(Boolean) as [number,number][]
    if(points.length>1)map.fitBounds(latLngBounds(points),{padding:[46,46],maxZoom:16})
    else if(points.length===1)map.flyTo(points[0],15,{duration:.6})
    window.setTimeout(()=>map.invalidateSize(),80)
  },[destination,driver,map,origin,route])
  return null
}

export default function RideMap({origin,destination,driver,route,onPick,className=''}:Props){
  const dark=document.documentElement.dataset.rideTheme==='dark'
  const points=route?.points??[]
  return <div className={`ride-map ${className}`}><MapContainer center={ECUADOR_CENTER} zoom={6} minZoom={3} maxZoom={19} scrollWheelZoom className="ride-map-canvas">
    <TileLayer attribution="&copy; OpenStreetMap contributors" url={dark?'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png':'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}/>
    <MapInteraction onPick={onPick}/><Viewport origin={origin} destination={destination} driver={driver} route={route}/>
    {points.length>1&&<><Polyline positions={points} pathOptions={{color:'#062b3b',weight:9,opacity:.25}}/><Polyline positions={points} pathOptions={{color:'#20bfdf',weight:5,opacity:.95}}/></>}
    {origin&&<Marker position={[origin.lat,origin.lng]} icon={pin('Origen','#10addf')}/>} {destination&&<Marker position={[destination.lat,destination.lng]} icon={pin('Destino','#6c5ce7')}/>} {driver&&<Marker position={[driver.lat,driver.lng]} icon={pin('Conductor','#13a57a')}/>} 
  </MapContainer></div>
}
