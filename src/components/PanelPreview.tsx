import { Eye } from 'lucide-react'
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
  return <button type="button" className="sidebar-dismiss" onClick={onClose} aria-label="Cerrar menú">×</button>
}

export function SidebarBackdrop({ onClose }: { onClose: () => void }) {
  return <button type="button" className="sidebar-backdrop" onClick={onClose} aria-label="Cerrar menú lateral" />
}
