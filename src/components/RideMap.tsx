import { Component, lazy, Suspense } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import type { RoadRoute } from '../lib/routing'
import type { Coordinates, Place, TripPosition } from '../lib/trips'

const RideMapImpl = lazy(() => import('./RideMapImpl'))

class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('No se pudo abrir el mapa; el formulario sigue disponible.', error, info)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <div className="ride-map ride-map-unavailable" role="status"><span aria-hidden>⌖</span><strong>Mapa temporalmente no disponible</strong><small>Busca y selecciona el origen y el destino en los campos superiores.</small></div>
  }
}

type Props = {
  origin?: Coordinates | null
  destination?: Place | null
  driver?: TripPosition | null
  /**
   * Dónde está quien mira el mapa. Se pinta como punto, no como alfiler.
   *
   * Pide solo las coordenadas —no `Coordinates`— porque quien la tiene es
   * `TripPosition`, que no lleva etiqueta, y aquí no se rotula nada.
   */
  me?: { lat: number; lng: number } | null
  route?: RoadRoute | null
  onPick?: (lat: number, lng: number) => void
  className?: string
}

export default function RideMap(props: Props) {
  return <MapErrorBoundary><Suspense fallback={<div className={`ride-map ride-map-loading ${props.className ?? ''}`} role="status"><span>Cargando mapa…</span></div>}>
    <RideMapImpl {...props} />
  </Suspense></MapErrorBoundary>
}
