import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2 as CheckIcon, CircleX as RejectIcon, PenLine as ReviewIcon, Radio as OnlineIcon, Search as SearchIcon, SlidersHorizontal as FilterIcon, UserRound as DriverIcon } from 'lucide-react'
import {
  listDrivers,
  reviewDocument,
  reviewDriver,
  documentUrl,
  puedeAprobarse,
  faltantes,
  DOC_LABEL,
  type Driver,
  type DriverDoc,
} from './lib/drivers'

/** Revisión de choferes: documentos, vehículos y aprobación. */
export default function DriversPanel() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')

  const cargar = () => {
    listDrivers()
      .then(setDrivers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar.'))
      .finally(() => setLoading(false))
  }

  useEffect(cargar, [])

  const accion = async (id: string, operacion: () => Promise<void>) => {
    setBusy(id)
    setError('')
    try {
      await operacion()
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setBusy('')
    }
  }

  const verDocumento = async (ruta: string) => {
    try {
      // Se abre en otra pestaña: el enlace firmado caduca en una hora.
      window.open(await documentUrl(ruta), '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el documento.')
    }
  }

  const pedirMotivo = (titulo: string) => {
    const motivo = window.prompt(`${titulo}\nEscribe el motivo para que el conductor sepa qué corregir:`)?.trim()
    return motivo && motivo.length >= 3 ? motivo : null
  }

  const pendientes = drivers.filter((d) => d.estado === 'pendiente')
  const visibleDrivers = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('es-EC')
    return drivers.filter((driver) => {
      const searchable = `${driver.nombre} ${driver.email} ${driver.telefono ?? ''}`.toLocaleLowerCase('es-EC')
      return (!text || searchable.includes(text)) && (!status || driver.estado === status)
    })
  }, [drivers, query, status])

  if (loading) return <p className="admin-error">Cargando conductores…</p>

  return (
    <div className="admin-content">
      <section className="admin-metrics driver-metrics" aria-label="Indicadores de conductores">
        <article><span className="driver-metric-icon review"><ReviewIcon size={18} aria-hidden /></span><div><small>Por revisar</small><strong>{pendientes.length}</strong></div></article>
        <article><span className="driver-metric-icon approved"><CheckIcon size={18} aria-hidden /></span><div><small>Aprobados</small><strong>{drivers.filter((d) => d.estado === 'aprobado').length}</strong></div></article>
        <article><span className="driver-metric-icon online"><OnlineIcon size={18} aria-hidden /></span><div><small>En línea</small><strong>{drivers.filter((d) => d.disponible).length}</strong></div></article>
        <article><span className="driver-metric-icon rejected"><RejectIcon size={18} aria-hidden /></span><div><small>Rechazados</small><strong>{drivers.filter((d) => d.estado === 'rechazado').length}</strong></div></article>
      </section>

      {error && <p className="admin-error">{error}</p>}

      <section className="admin-card drivers-monitoring">
        <div className="admin-card-head">
          <div>
            <h3>Conductores</h3>
            <p>Revisa identidad, licencia y los documentos vigentes de cada vehículo. La base decide si la cuenta está completa.</p>
          </div>
        </div>

        <div className="driver-toolbar"><span className="driver-result-count">{visibleDrivers.length} {visibleDrivers.length === 1 ? 'conductor' : 'conductores'}</span><div className="driver-filters" aria-label="Filtros de conductores"><label className="driver-search"><SearchIcon size={16} aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conductor" aria-label="Buscar conductor" /></label><label><FilterIcon size={15} aria-hidden /><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar por estado"><option value="">Todos los estados</option><option value="pendiente">Pendientes</option><option value="aprobado">Aprobados</option><option value="rechazado">Rechazados</option></select></label></div></div>
        {drivers.length === 0 && <p className="admin-error">Todavía no se ha registrado ningún conductor.</p>}
        {drivers.length > 0 && visibleDrivers.length === 0 && <p className="admin-empty">No se encontraron conductores con estos filtros.</p>}

        {visibleDrivers.map((driver) => {
          const expandido = abierto === driver.id
          const listo = puedeAprobarse(driver)
          const pendiente = faltantes(driver)

          return (
            <div className="driver-row" key={driver.id}>
              <div className="driver-head" onClick={() => setAbierto(expandido ? null : driver.id)}>
                <em className={`driver-state ${driver.estado}`}>{driver.estado}</em>
                <span className="driver-avatar"><DriverIcon size={17} aria-hidden /></span><div className="driver-id">
                  <strong>{driver.nombre}</strong>
                  <small>{driver.email}{driver.telefono ? ` · ${driver.telefono}` : ''}</small>
                </div>
                <span className="driver-count">
                  {driver.documentos.filter((d) => d.estado === 'aprobado').length}/{driver.documentos.length} docs
                  {' · '}
                  {driver.vehiculos.length} {driver.vehiculos.length === 1 ? 'auto' : 'autos'}
                </span>
                <button className="driver-toggle">{expandido ? 'Cerrar' : 'Revisar'}</button>
              </div>

              {expandido && (
                <div className="driver-detail">
                  <section className="driver-identity-review"><strong>Identidad y licencia</strong><span>Cédula: {driver.cedula || 'sin registrar'}</span><span>Dactilar: {driver.codigoDactilar || 'sin registrar'}</span><span>Licencia: {driver.licenciaTipo ? `${driver.licenciaTipo} · vence ${driver.licenciaCaducaEl || 'sin fecha'}` : 'sin registrar'}</span></section>
                  <div className="driver-docs">{driver.documentos.filter((doc) => !doc.vehiculoId).map((doc) => <DriverDocumentRow key={doc.id} doc={doc} busy={busy === driver.id} onOpen={verDocumento} onApprove={() => accion(driver.id, () => reviewDocument(doc.id, true))} onReject={() => { const motivo = pedirMotivo(`Rechazar ${DOC_LABEL[doc.tipo]}`); if (motivo) void accion(driver.id, () => reviewDocument(doc.id, false, motivo)) }}/>)}</div>

                  {driver.vehiculos.length > 0 && (
                    <div className="driver-cars">
                      {driver.vehiculos.map((v) => <section className="driver-vehicle-review" key={v.id}><span className={`car-chip ${v.activo ? 'activo' : ''}`}>{v.marca} {v.modelo} · {v.placa} · {v.categoria}{v.activo ? ' · en servicio' : ''}</span><div className="driver-docs">{driver.documentos.filter((doc) => doc.vehiculoId === v.id).map((doc) => <DriverDocumentRow key={doc.id} doc={doc} busy={busy === driver.id} onOpen={verDocumento} onApprove={() => accion(driver.id, () => reviewDocument(doc.id, true))} onReject={() => { const motivo = pedirMotivo(`Rechazar ${DOC_LABEL[doc.tipo]}`); if (motivo) void accion(driver.id, () => reviewDocument(doc.id, false, motivo)) }}/>)}</div></section>)}
                    </div>
                  )}

                  {!listo && (
                    <p className="driver-blocked">
                      Falta: {pendiente.join(' · ')}
                    </p>
                  )}

                  <div className="driver-actions">
                    {driver.estado !== 'aprobado' && (
                      <button
                        className="driver-approve"
                        disabled={!listo || busy === driver.id}
                        title={listo ? '' : 'Faltan requisitos'}
                        onClick={() => accion(driver.id, () => reviewDriver(driver.id, true))}
                      >Aprobar conductor</button>
                    )}
                    {driver.estado !== 'rechazado' && (
                      <button
                        className="driver-reject"
                        disabled={busy === driver.id}
                        onClick={() => { const motivo = pedirMotivo('Rechazar conductor'); if (motivo) void accion(driver.id, () => reviewDriver(driver.id, false, motivo)) }}
                      >Rechazar</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

function DriverDocumentRow({ doc, busy, onOpen, onApprove, onReject }: { doc: DriverDoc; busy: boolean; onOpen: (path: string) => void; onApprove: () => void; onReject: () => void }) {
  const expired = doc.caducaEl ? new Date(doc.caducaEl) < new Date() : false
  return <div className="doc-item"><span className={`doc-state ${doc.estado}`}>{DOC_LABEL[doc.tipo]}</span><small>{doc.numero ? `N.º ${doc.numero}` : ''}{doc.caducaEl ? ` · vence ${doc.caducaEl}` : ''}{expired ? ' · CADUCADO' : ''}{doc.motivoRechazo ? ` · ${doc.motivoRechazo}` : ''}</small><button className="link-button" onClick={() => onOpen(doc.ruta)}>Ver archivo</button>{doc.estado !== 'aprobado' && <button className="doc-ok" disabled={busy} onClick={onApprove}>Aprobar</button>}{doc.estado !== 'rechazado' && <button className="doc-no" disabled={busy} onClick={onReject}>Rechazar</button>}</div>
}
