import { useEffect } from 'react'
import { divIcon, latLngBounds, type Map as LeafletMap } from 'leaflet'
import { MapContainer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Coordinates, Place, TripPosition } from '../lib/trips'
import type { RoadRoute } from '../lib/routing'

const ECUADOR_CENTER: [number, number] = [-1.45, -78.35]
type Props = { origin?: Coordinates | null; destination?: Place | null; driver?: TripPosition | null; route?: RoadRoute | null; onPick?: (lat:number,lng:number)=>void; className?:string }

function pin(label:string,color:string){return divIcon({className:'ride-leaflet-marker',html:`<span style="--pin:${color}"></span><b>${label}</b>`,iconSize:[78,42],iconAnchor:[15,36]})}
function MapInteraction({onPick}:{onPick?:Props['onPick']}){useMapEvents({click:({latlng})=>onPick?.(latlng.lat,latlng.lng)});return null}

/**
 * Las mismas teselas y el mismo estilo que la app.
 *
 * Antes esto era un `TileLayer` de Carto (`basemaps.cartocdn.com/dark_all`),
 * que pasó a exigir clave: el mapa salía con «API KEY REQUIRED» estampado por
 * encima. Y aunque no la exigiera, no se parecía en nada al de la app.
 *
 * Ahora se pintan las teselas **vectoriales** de OpenFreeMap con los estilos
 * de `public/mapa/`, que son copia literal de los que usa la app
 * (`assets/mapa/` en el repositorio de la aplicación). Sin claves y sin cuota.
 * Si allí se regeneran, hay que volver a copiarlos aquí.
 *
 * Se carga con `import()` dentro del efecto y no arriba: MapLibre pesa lo suyo
 * y este componente ya entra por `lazy()`, así que no tiene por qué estar en el
 * paquete inicial.
 */
function VectorTiles({ dark }: { dark: boolean }) {
  const map = useMap()
  useEffect(() => {
    let capa: { remove: () => void } | null = null
    let cancelado = false

    void (async () => {
      try {
        const [{ default: maplibregl }] = await Promise.all([
          import('maplibre-gl'),
          import('@maplibre/maplibre-gl-leaflet'),
        ])
        if (cancelado) return
        // `maplibreGL` lo añade el plugin al espacio de nombres de Leaflet, así
        // que no viene tipado: de ahí el acceso por índice.
        const L = (await import('leaflet')) as unknown as Record<string, (options: unknown) => { addTo: (map: LeafletMap) => { remove: () => void } }>
        capa = L.maplibreGL({
          style: dark ? '/mapa/oscuro.json' : '/mapa/claro.json',
          maplibreOptions: { maplibregl, attributionControl: false },
        }).addTo(map)
      } catch (error) {
        // Sin mapa base se siguen viendo los alfileres y la ruta sobre el
        // fondo. Es peor quedarse sin la pantalla entera.
        console.error('No se pudieron cargar las teselas del mapa.', error)
      }
    })()

    return () => { cancelado = true; capa?.remove() }
  }, [dark, map])
  return null
}

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
  return <div className={`ride-map ${className}`}><MapContainer center={ECUADOR_CENTER} zoom={6} minZoom={3} maxZoom={19} scrollWheelZoom className="ride-map-canvas" attributionControl={false}>
    <VectorTiles dark={dark}/>
    <MapInteraction onPick={onPick}/><Viewport origin={origin} destination={destination} driver={driver} route={route}/>
    {points.length>1&&<><Polyline positions={points} pathOptions={{color:'#062b3b',weight:9,opacity:.25}}/><Polyline positions={points} pathOptions={{color:'#20bfdf',weight:5,opacity:.95}}/></>}
    {origin&&<Marker position={[origin.lat,origin.lng]} icon={pin('Origen','#10addf')}/>} {destination&&<Marker position={[destination.lat,destination.lng]} icon={pin('Destino','#6c5ce7')}/>} {driver&&<Marker position={[driver.lat,driver.lng]} icon={pin('Conductor','#13a57a')}/>}
  </MapContainer>
  <small className="ride-map-credit">© OpenStreetMap · OpenFreeMap</small>
  </div>
}
