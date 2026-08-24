import { useMemo, useState } from 'react'
import './App.css'

type View = 'Resumen' | 'Viajes' | 'Conductores' | 'Pasajeros' | 'Tarifas' | 'Soporte'

const menu: { label: View; icon: string }[] = [
  { label: 'Resumen', icon: '⌘' }, { label: 'Viajes', icon: '◆' },
  { label: 'Conductores', icon: '◉' }, { label: 'Pasajeros', icon: '◎' },
  { label: 'Tarifas', icon: '$' }, { label: 'Soporte', icon: '?' },
]

const initialDrivers = [
  { name: 'Daniela Paredes', vehicle: 'Kia Soluto · PBC-4821', date: 'Hoy, 09:42', status: 'Documentos completos' },
  { name: 'Mateo Salazar', vehicle: 'Chevrolet Onix · PDX-1904', date: 'Hoy, 08:15', status: 'Revisar licencia' },
  { name: 'Valentina Ruiz', vehicle: 'Hyundai Accent · PBA-7732', date: 'Ayer, 18:30', status: 'Documentos completos' },
]

const trips = [
  { passenger: 'Andrea M.', driver: 'Carlos A.', route: 'La Carolina → Cumbayá', price: '$8.40', state: 'En camino', tone: 'blue' },
  { passenger: 'Luis P.', driver: 'María S.', route: 'El Condado → Centro', price: '$6.20', state: 'En viaje', tone: 'green' },
  { passenger: 'Sofía R.', driver: 'Jorge V.', route: 'La Floresta → Tumbaco', price: '$11.80', state: 'En viaje', tone: 'green' },
  { passenger: 'Daniel C.', driver: 'Elena T.', route: 'Iñaquito → Aeropuerto', price: '$14.50', state: 'Recogiendo', tone: 'violet' },
]

function App() {
  const [view, setView] = useState<View>('Resumen')
  const [drivers, setDrivers] = useState(initialDrivers)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const filteredTrips = useMemo(() => {
    const term = search.toLowerCase().trim()
    return term ? trips.filter((trip) => Object.values(trip).some((value) => value.toLowerCase().includes(term))) : trips
  }, [search])

  const resolveDriver = (name: string, approved: boolean) => {
    setDrivers((current) => current.filter((driver) => driver.name !== name))
    setNotice(`${name}: solicitud ${approved ? 'aprobada' : 'rechazada'}.`)
    window.setTimeout(() => setNotice(''), 2800)
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">R</div><span>Ride</span><small>Control</small></div>
      <nav aria-label="Navegación principal">{menu.map((item) => <button className={view === item.label ? 'active' : ''} onClick={() => setView(item.label)} key={item.label}><span className="nav-icon">{item.icon}</span>{item.label}{item.label === 'Soporte' && <b>3</b>}</button>)}</nav>
      <div className="service-status"><i /> Sistema operativo<small>Todos los servicios activos</small></div>
      <div className="admin-card"><span>BA</span><div><strong>Betzabe</strong><small>Administradora</small></div><button aria-label="Abrir perfil">•••</button></div>
    </aside>

    <main>
      <header className="topbar"><div><p>Centro de operaciones</p><h1>{view}</h1></div><label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar viaje, conductor o pasajero" /></label><button className="icon-button" aria-label="Notificaciones">♧<b>4</b></button><div className="live"><i /> En vivo</div></header>
      {view === 'Resumen' ? <div className="dashboard">
        <section className="welcome"><div><span>Lunes, 24 de agosto</span><h2>Buenos días, Betzabe</h2><p>La operación se mantiene estable. Hay 3 conductores esperando aprobación.</p></div><button onClick={() => setView('Conductores')}>Revisar solicitudes <span>→</span></button></section>
        <section className="metrics">
          <article><div className="metric-icon blue">◆</div><p>Viajes activos</p><strong>24</strong><small className="up">↑ 12% <em>vs. ayer</em></small></article>
          <article><div className="metric-icon mint">◉</div><p>Conductores en línea</p><strong>86</strong><small className="up">↑ 8% <em>vs. ayer</em></small></article>
          <article><div className="metric-icon violet">$</div><p>Ingresos de hoy</p><strong>$1,842.60</strong><small className="up">↑ 15% <em>vs. ayer</em></small></article>
          <article><div className="metric-icon coral">!</div><p>Alertas abiertas</p><strong>3</strong><small className="warning">2 requieren atención</small></article>
        </section>
        <section className="operations-grid">
          <article className="map-card card"><div className="card-head"><div><h3>Operación en tiempo real</h3><p>Quito y valles</p></div><button>Ver mapa completo</button></div><div className="map"><div className="road road-a"/><div className="road road-b"/><div className="road road-c"/><div className="route-line"/><span className="zone z1">La Carolina</span><span className="zone z2">Iñaquito</span><span className="zone z3">La Floresta</span><span className="zone z4">Cumbayá</span>{['p1','p2','p3','p4','p5','p6'].map((cls) => <i className={`car ${cls}`} key={cls}>🚙</i>)}<div className="map-legend"><span><i className="dot blue-dot"/> 24 activos</span><span><i className="dot mint-dot"/> 86 disponibles</span></div></div></article>
          <article className="active-trips card"><div className="card-head"><div><h3>Viajes activos</h3><p>Actualización automática</p></div><button onClick={() => setView('Viajes')}>Ver todos</button></div><div className="trip-list">{filteredTrips.map((trip) => <div className="trip" key={trip.passenger}><span className={`status-line ${trip.tone}`}/><div className="avatar">{trip.passenger[0]}</div><div><strong>{trip.passenger}</strong><small>{trip.route}</small><em>Con {trip.driver}</em></div><aside><b>{trip.price}</b><span className={trip.tone}>{trip.state}</span></aside></div>)}</div></article>
        </section>
        <section className="bottom-grid">
          <article className="driver-review card"><div className="card-head"><div><h3>Conductores por verificar</h3><p>Revisa los documentos antes de activar la cuenta</p></div><span className="count">{drivers.length} pendientes</span></div>{drivers.length ? drivers.map((driver) => <div className="driver-row" key={driver.name}><div className="avatar driver-avatar">{driver.name.split(' ').map((n) => n[0]).join('')}</div><div><strong>{driver.name}</strong><small>{driver.vehicle}</small></div><div className="date"><span>{driver.date}</span><small>{driver.status}</small></div><button className="ghost" onClick={() => resolveDriver(driver.name, false)}>Rechazar</button><button className="primary" onClick={() => resolveDriver(driver.name, true)}>Aprobar</button></div>) : <div className="empty">No quedan solicitudes pendientes.</div>}</article>
          <article className="activity card"><div className="card-head"><div><h3>Actividad de hoy</h3><p>Viajes completados por hora</p></div><strong>184 viajes</strong></div><div className="chart"><div className="chart-line"/><i className="chart-point"/><span className="chart-label">14:00<br/><b>31 viajes</b></span></div><div className="chart-hours"><span>06:00</span><span>10:00</span><span>14:00</span><span>18:00</span><span>22:00</span></div></article>
        </section>
      </div> : <section className="placeholder card"><div className="placeholder-icon">{menu.find((item) => item.label === view)?.icon}</div><h2>{view}</h2><p>Este módulo ya está preparado en la navegación. Se conectará al backend en la siguiente etapa.</p><button onClick={() => setView('Resumen')}>Volver al resumen</button></section>}
      {notice && <div className="toast">✓ {notice}</div>}
    </main>
  </div>
}

export default App
