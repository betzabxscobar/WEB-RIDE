import {
  BadgeDollarSign, BellRing, CarFront, CircleUserRound, MapPin,
  Navigation, Route, ShieldCheck, Sparkles, WalletCards,
} from 'lucide-react'

type Props = { kind: 'passenger' | 'driver' | 'admin' }

/**
 * Señales decorativas del producto. Son SVG, no imágenes pesadas, y quedan
 * fuera del árbol accesible porque el contenido real ya explica cada panel.
 */
export function PanelAtmosphere({ kind }: Props) {
  const icons = kind === 'passenger'
    ? [<MapPin />, <Navigation />, <CarFront />, <WalletCards />, <Sparkles />]
    : kind === 'driver'
      ? [<CarFront />, <Navigation />, <BadgeDollarSign />, <Route />, <BellRing />]
      : [<ShieldCheck />, <Navigation />, <BadgeDollarSign />, <CircleUserRound />, <Sparkles />]

  return <div className={`panel-atmosphere ${kind}`} aria-hidden="true">
    <svg className="atmosphere-route" viewBox="0 0 620 180" preserveAspectRatio="none">
      <path d="M8 145C118 28 204 178 318 88S487 22 612 44" />
      <circle cx="10" cy="144" r="5" />
      <circle cx="612" cy="44" r="5" />
    </svg>
    {icons.map((icon, index) => <span className={`atmosphere-icon icon-${index + 1}`} key={index}>{icon}</span>)}
  </div>
}
