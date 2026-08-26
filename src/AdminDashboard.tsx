import { useEffect, useMemo, useState } from 'react'
import './AdminDashboard.css'
import { listUsers, panelLabel, type Role, type User } from './lib/auth'

type Props = {
  user: { name: string; email: string; role: string }
  /** Panel que se muestra: `admin` o `superadmin`. */
  viewAs: Role
  views: Role[]
  onSwitchView: (view: Role) => void
  onLogout: () => void
}

const sections = [
  ['Resumen', '⌂'],
  ['Usuarios', '♙'],
  ['Conductores', '◉'],
  ['Viajes', '↗'],
  ['Tarifas', '$'],
  ['Soporte', '?'],
] as const

function roleLabel(role: string) {
  if (role === 'superadmin') return 'Superadmin'
  if (role === 'admin') return 'Admin'
  if (role === 'driver') return 'Conductor'
  return 'Pasajero'
}

function roleClass(role: string) {
  if (role === 'admin') return 'superadmin'
  return role
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function formatDate(value: string) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

export default function AdminDashboard({ user, viewAs, views, onSwitchView, onLogout }: Props) {
  const [activeSection, setActiveSection] = useState('Resumen')
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Manda la vista, no el rol: si un superadmin abrió el panel como admin, la
  // pantalla se comporta como la de un admin.
  const isSuperadmin = viewAs === 'superadmin'
  const viewingOtherPanel = viewAs !== user.role
  const accessName = isSuperadmin ? 'SUPERADMINISTRACIÓN' : 'ADMINISTRACIÓN'
  const profileName = isSuperadmin ? 'Superadministrador' : 'Administrador'

  // Las politicas RLS deciden que filas llegan: un admin no ve superadmins.
  useEffect(() => {
    let active = true
    listUsers()
      .then((rows) => { if (active) setUsers(rows) })
      .catch((requestError) => {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los usuarios.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // Al mirar el panel *como admin*, RLS sigue enviando a los superadmin porque
  // el rol real de la cuenta no cambió. Se ocultan aquí para que la
  // previsualización sea fiel. Es filtrado de presentación, no de seguridad:
  // la barrera real son las políticas RLS, que sí aplican a un admin auténtico.
  const visibleUsers = useMemo(
    () => (isSuperadmin ? users : users.filter((item) => item.role !== 'superadmin')),
    [users, isSuperadmin],
  )

  const metrics = useMemo(() => ({
    users: visibleUsers.filter((item) => item.role === 'passenger').length,
    drivers: visibleUsers.filter((item) => item.role === 'driver').length,
    administrators: visibleUsers.filter((item) => item.role === 'admin' || item.role === 'superadmin').length,
  }), [visibleUsers])

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><div>R</div><span>Ride</span><small>{accessName}</small></div>
        <nav aria-label="Panel administrativo">
          {sections.map(([label, icon]) => (
            <button key={label} className={activeSection === label ? 'active' : ''} onClick={() => setActiveSection(label)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="system-ok"><i />Sistema operativo<small>Acceso protegido</small></div>
        {views.length > 1 && (
          <label className="panel-switcher sidebar">
            <span className="sr-only">Cambiar de panel</span>
            <select value={viewAs} onChange={(event) => onSwitchView(event.target.value as Role)}>
              {views.map((view) => <option key={view} value={view}>{panelLabel(view)}</option>)}
            </select>
          </label>
        )}
        <button className="admin-logout" onClick={onLogout}>↪ Cerrar sesión</button>
      </aside>

      <section className="admin-main">
        {viewingOtherPanel && (
          <div className="viewing-as">
            <span>◉ Vista previa: así ve el panel una cuenta de administrador</span>
            <button onClick={() => onSwitchView(user.role as Role)}>Volver a mi panel</button>
          </div>
        )}
        <header>
          <div><small>{accessName}</small><h1>{activeSection}</h1></div>
          <div className="admin-profile"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{profileName}</small></div></div>
        </header>

        {activeSection === 'Resumen' ? (
          <div className="admin-content">
            <section className="admin-welcome">
              <div><small>PANEL DE CONTROL</small><h2>Hola, {user.name.split(' ')[0]}</h2><p>Revisa el estado real de las cuentas registradas en Ride.</p></div>
              <span className="secure-badge">◇ Sesión administrativa segura</span>
            </section>

            <section className="admin-metrics">
              <article><span className="metric-symbol blue">P</span><div><small>Pasajeros</small><strong>{metrics.users}</strong></div></article>
              <article><span className="metric-symbol mint">C</span><div><small>Conductores</small><strong>{metrics.drivers}</strong></div></article>
              <article><span className="metric-symbol violet">A</span><div><small>Equipo administrativo</small><strong>{metrics.administrators}</strong></div></article>
              <article><span className="metric-symbol coral">V</span><div><small>Viajes registrados</small><strong>0</strong></div></article>
            </section>

            <div className="admin-grid">
              <section className="admin-card user-table">
                <div className="admin-card-head"><div><h3>Usuarios registrados</h3><p>Información obtenida desde Supabase.</p></div><button onClick={() => setActiveSection('Usuarios')}>Ver todos</button></div>
                {error && <p className="admin-error">{error}</p>}
                {loading && <p className="admin-error">Cargando usuarios…</p>}
                {!loading && !error && visibleUsers.length === 0 && <p className="admin-error">Todavía no hay cuentas registradas.</p>}
                {!loading && visibleUsers.slice(0, 6).map((account) => (
                  <div className="user-row" key={account.id}>
                    <span>{initials(account.name)}</span>
                    <div><strong>{account.name}</strong><small>{account.email}</small></div>
                    <em className={roleClass(account.role)}>{roleLabel(account.role)}</em>
                    <time>{formatDate(account.createdAt)}</time>
                  </div>
                ))}
              </section>

              <section className="admin-card next-steps">
                <div className="admin-card-head"><div><h3>Estado de implementación</h3><p>Avance funcional del proyecto.</p></div></div>
                <ul>
                  <li className="done"><span>✓</span><div><b>Acceso por roles</b><small>Admin y superadmin diferenciados</small></div></li>
                  <li className="done"><span>✓</span><div><b>Primer acceso seguro</b><small>Cambio de contraseña administrativa</small></div></li>
                  <li className="done"><span>✓</span><div><b>Conexión con Supabase</b><small>Auth y perfiles en la nube</small></div></li>
                  <li><span>4</span><div><b>Gestión de viajes</b><small>Tablas listas, falta la interfaz</small></div></li>
                </ul>
              </section>
            </div>
          </div>
        ) : (
          <section className="admin-placeholder">
            <span>{sections.find(([label]) => label === activeSection)?.[1]}</span>
            <h2>{activeSection}</h2>
            <p>Este módulo se construirá en una siguiente etapa.</p>
            <button onClick={() => setActiveSection('Resumen')}>Volver al resumen</button>
          </section>
        )}
      </section>
    </main>
  )
}
