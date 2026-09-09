import { lazy, Suspense } from 'react'
import type { RoadRoute } from '../lib/routing'
import type { Coordinates, Place, TripPosition } from '../lib/trips'

const RideMapImpl = lazy(() => import('./RideMapImpl'))

type Props = {
  origin?: Coordinates | null
  destination?: Place | null
  driver?: TripPosition | null
  route?: RoadRoute | null
  onPick?: (lat: number, lng: number) => void
  className?: string
}

export default function RideMap(props: Props) {
  return <Suspense fallback={<div className={`ride-map ride-map-loading ${props.className ?? ''}`} role="status"><span>Cargando mapa…</span></div>}>
    <RideMapImpl {...props} />
  </Suspense>
}
