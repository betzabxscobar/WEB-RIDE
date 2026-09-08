import { useEffect, useState } from 'react'
import { Calculator, CarFront, Save } from 'lucide-react'
import { listFares, listVehicleCategories, saveFare, saveVehicleFactor, type Fare, type VehicleCategory } from '../lib/fares'

const days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const schedule = (fare: Fare) => fare.fromHour == null || fare.toHour == null ? 'El resto del día' : `${String(fare.fromHour).padStart(2, '0')}:00 – ${String(fare.toHour).padStart(2, '0')}:59${fare.days?.length ? `, ${fare.days.map((day) => days[day - 1]).join(', ')}` : ''}`

export default function AdminFaresPanel() {
  const [fares, setFares] = useState<Fare[]>([])
  const [categories, setCategories] = useState<VehicleCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([listFares(), listVehicleCategories()])
      .then(([fareRows, categoryRows]) => { if (active) { setFares(fareRows); setCategories(categoryRows) } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las tarifas.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const updateFare = (id: string, field: keyof Pick<Fare, 'base' | 'perKm' | 'minimum' | 'driverShare'>, value: number) => setFares((current) => current.map((fare) => fare.id === id ? { ...fare, [field]: value } : fare))
  const storeFare = async (fare: Fare) => {
    setBusy(fare.id); setError(''); setNotice('')
    try { await saveFare(fare); setNotice(`Se actualizó ${fare.name}.`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar.') }
    finally { setBusy('') }
  }
  const storeFactor = async (category: VehicleCategory) => {
    setBusy(category.id); setError(''); setNotice('')
    try { await saveVehicleFactor(category.id, category.factor); setNotice(`Se actualizó ${category.name}.`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar.') }
    finally { setBusy('') }
  }

  return <div className="admin-content admin-tool-page">
    <section className="overview-heading"><small>PRECIOS DE LA PLATAFORMA</small><h2>Tarifas y vehículos</h2><p>Los cambios se guardan en Supabase y se aplican a las cotizaciones nuevas.</p></section>
    {(error || notice) && <div className={`account-feedback ${error ? 'error' : 'success'}`} role="status">{error || notice}</div>}
    {loading && <section className="admin-card"><p className="admin-empty">Cargando precios…</p></section>}
    {!loading && <div className="fare-layout">
      <section className="admin-card fare-section"><div className="admin-card-head"><div><h3>Franjas tarifarias</h3><p>Ejemplo calculado para un trayecto de 8 km.</p></div><Calculator size={21} /></div>
        <div className="fare-grid">{fares.map((fare) => <article className="fare-card" key={fare.id}><header><div><h4>{fare.name}</h4><small>{schedule(fare)}</small></div><strong>${Math.max(fare.minimum, fare.base + fare.perKm * 8).toFixed(2)}</strong></header><div className="fare-fields">
          <label>Arranque ($)<input type="number" min="0" step="0.01" value={fare.base} onChange={(event) => updateFare(fare.id, 'base', event.target.valueAsNumber)} /></label>
          <label>Por km ($)<input type="number" min="0" step="0.01" value={fare.perKm} onChange={(event) => updateFare(fare.id, 'perKm', event.target.valueAsNumber)} /></label>
          <label>Mínima ($)<input type="number" min="0" step="0.01" value={fare.minimum} onChange={(event) => updateFare(fare.id, 'minimum', event.target.valueAsNumber)} /></label>
          <label>Para conductor (%)<input type="number" min="1" max="100" step="1" value={Math.round(fare.driverShare * 100)} onChange={(event) => updateFare(fare.id, 'driverShare', event.target.valueAsNumber / 100)} /></label>
        </div><button className="tool-primary" type="button" disabled={busy === fare.id} onClick={() => void storeFare(fare)}><Save size={15} />{busy === fare.id ? 'Guardando…' : 'Guardar tarifa'}</button></article>)}</div>
      </section>
      <section className="admin-card fare-section"><div className="admin-card-head"><div><h3>Tipos de vehículo</h3><p>El multiplicador modifica la tarifa base elegida.</p></div><CarFront size={21} /></div>
        <div className="category-grid">{categories.map((category) => <article key={category.id}><span><CarFront size={19} /></span><div><h4>{category.name}</h4><p>{category.description || `Hasta ${category.passengers} pasajeros`}</p></div><label>Multiplicador<input type="number" min="0.01" max="5" step="0.01" value={category.factor} onChange={(event) => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, factor: event.target.valueAsNumber } : item))} /></label><button className="tool-primary" type="button" disabled={busy === category.id} onClick={() => void storeFactor(category)}><Save size={15} />Guardar</button></article>)}</div>
      </section>
    </div>}
  </div>
}
