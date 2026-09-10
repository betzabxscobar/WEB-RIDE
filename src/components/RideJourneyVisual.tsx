import { CarFront, MapPin, Navigation, Route } from 'lucide-react'

/** Ilustración vectorial ligera para que Inicio comunique movilidad de inmediato. */
export function RideJourneyVisual() {
  return <div className="ride-journey-visual" aria-hidden="true">
    <svg viewBox="0 0 260 190" preserveAspectRatio="none">
      <path className="journey-road-shadow" d="M-8 151C42 92 82 169 127 119S190 48 268 72" />
      <path className="journey-road-line" d="M-8 151C42 92 82 169 127 119S190 48 268 72" />
    </svg>
    <span className="journey-point journey-origin"><Navigation size={18}/></span>
    <span className="journey-point journey-destination"><MapPin size={19}/></span>
    <span className="journey-car"><CarFront size={24}/></span>
    <div className="journey-caption"><Route size={17}/><span><strong>Tu próxima ruta</strong><small>Origen, vehículo y destino</small></span></div>
  </div>
}
