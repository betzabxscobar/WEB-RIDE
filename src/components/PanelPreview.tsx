import { CarFront, Eye, MapPin, Navigation, PanelRightClose } from 'lucide-react'
import { panelLabel, type Role } from '../lib/auth'

/** Lives inside each workspace so the sidebar cannot cover the message. */
export function PanelPreview({ role, activeView, onSwitchView }: {
  role: Role
  activeView: Role
  onSwitchView: (view: Role) => void
}) {
  if (role === activeView) return null
  return <div className="viewing-as" role="note">
    <span><Eye size={16} aria-hidden />Vista previa: {panelLabel(activeView)}</span>
    <button type="button" onClick={() => onSwitchView(role)}>Volver a mi panel</button>
  </div>
}

export function SidebarDismiss({ onClose }: { onClose: () => void }) {
  return <button type="button" className="sidebar-dismiss" onClick={onClose} aria-label="Contraer menú"><PanelRightClose size={18} aria-hidden /></button>
}

export function SidebarBackdrop({ onClose }: { onClose: () => void }) {
  return <button type="button" className="sidebar-backdrop" onClick={onClose} aria-label="Cerrar menú lateral" />
}

export function SidebarJourney({ kind }: { kind: 'passenger' | 'driver' | 'admin' }) {
  const copy = kind === 'passenger'
    ? ['Tu ruta, a un toque', 'Viaja con claridad y confianza.']
    : kind === 'driver'
      ? ['La ciudad te espera', 'Organiza tu jornada y avanza.']
      : ['Todo Ride, en movimiento', 'Control claro de cada operación.']

  return <section className={`sidebar-journey sidebar-journey-${kind}`} aria-label={copy[0]}>
    <div className="sidebar-journey-art" aria-hidden="true">
      <svg viewBox="0 0 210 64" preserveAspectRatio="none"><path d="M4 52C42 8 74 60 110 31S166 5 206 18" /></svg>
      <span className="journey-pin"><MapPin size={13} /></span>
      <span className="journey-car-mini"><CarFront size={15} /></span>
    </div>
    <div className="sidebar-journey-copy"><Navigation size={15} aria-hidden /><span><strong>{copy[0]}</strong><small>{copy[1]}</small></span></div>
  </section>
}
