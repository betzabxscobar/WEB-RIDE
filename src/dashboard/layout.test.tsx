/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { mkdirSync, writeFileSync } from 'node:fs'
import PassengerDashboard from '../PassengerDashboard'
import DriverDashboard from '../DriverDashboard'
import AdminDashboard from '../AdminDashboard'
import type { Role, User } from '../lib/auth'

vi.mock('../lib/trips', async (original) => ({
  ...await original<object>(),
  listPassengerTrips: async () => [], listDriverTrips: async () => [],
  listTrips: async () => [{ id: 'qa-trip', estado: 'FINALIZADO', montoCobrado: 12.4, tarifaFinal: 12.4, tarifaEstimada: 12.4,
    pasajeroNombre: 'Alexandra Apellido Largo', conductorNombre: 'Conductor de prueba',
    origenTexto: 'Avenida principal y calle de referencia, centro de la ciudad',
    destinoTexto: 'Terminal terrestre, entrada principal', fechaSolicitud: '2026-09-07T12:00:00Z' }],
  listPlaces: async () => [],
  watchTrips: () => () => {},
}))
vi.mock('../lib/notifications', async (original) => ({
  ...await original<object>(), listNotifications: async () => [], watchNotifications: () => () => {}, markAllNotificationsRead: async () => {},
}))
vi.mock('../lib/addresses', async (original) => ({ ...await original<object>(), listSavedAddresses: async () => [] }))
vi.mock('../lib/payments', async (original) => ({
  ...await original<object>(), listPaymentMethods: async () => [], listPaymentsForTrips: async () => [],
}))
vi.mock('../lib/auth', async (original) => ({ ...await original<object>(), listUsers: async () => [
  { id: 'qa-user', name: 'Alexandra Apellido Largo', email: 'nombre.apellido.muy.largo@example.test', phone: '', role: 'passenger', createdAt: '2026-09-07T12:00:00Z' },
] }))
vi.mock('../lib/drivers', async (original) => ({ ...await original<object>(), listDrivers: async () => [] }))
vi.mock('../lib/support', async (original) => ({ ...await original<object>(), listMyTickets: async () => [] }))
vi.mock('../lib/driver-account', async (original) => ({
  ...await original<object>(), prepareSuperadminDriver: async () => {},
  getDriverState: async () => ({ exists: true, approved: false, approvalStatus: 'pendiente', available: false, hasActiveVehicle: false, rating: null }),
  listOwnVehicles: async () => [], listOwnDocuments: async () => [],
  listWorkZones: async () => [], listBanks: async () => [], listOwnBankAccounts: async () => [],
  getDriverEarnings: async () => ({}), getMissingDriverRequirements: async () => [],
  getDriverIdentity: async () => ({ cedula: '', fingerprintCode: '', licenseType: '', licenseExpiresAt: '' }),
}))
vi.mock('../components/RideMap', () => ({ default: () => <div className="ride-map-canvas" aria-label="Mapa de prueba" /> }))

const user = { id: 'layout-fixture', name: 'Alexandra Apellido Largo', email: 'demo@example.test', phone: '', role: 'superadmin' } as User
const views: Role[] = ['superadmin', 'admin', 'passenger', 'driver']

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('scrollTo', vi.fn())
  localStorage.setItem('ride-theme', 'dark')
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

function capture(name: string, container: HTMLElement) {
  if (!process.env.RIDE_LAYOUT_CAPTURE) return
  mkdirSync('.qa', { recursive: true })
  const copy = container.cloneNode(true) as HTMLElement
  container.querySelectorAll('select').forEach((select, index) => {
    copy.querySelectorAll('select')[index].querySelectorAll('option').forEach((option) => {
      option.toggleAttribute('selected', option.value === select.value)
    })
  })
  const styles = ['index', 'App', 'PassengerDashboard', 'DriverDashboard', 'AdminDashboard', 'passenger/RequestPage', 'design-system', 'layout']
    .map((file) => `<link rel="stylesheet" href="/src/${file}.css">`).join('')
  writeFileSync(`.qa/${name}.html`, `<!doctype html><html lang="es" data-ride-theme="${document.documentElement.dataset.rideTheme}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700;800;900&display=swap">${styles}<title>Ride: revisión ${name}</title></head><body>${copy.innerHTML}</body></html>`)
}

describe('panel navigation layout', () => {
  it('does not reserve a preview bar in the native superadmin panel', async () => {
    const { container } = render(<AdminDashboard user={user} views={views} viewAs="superadmin" onSwitchView={vi.fn()} onLogout={vi.fn()} onUserUpdate={vi.fn()} />)
    await waitFor(() => expect(container.textContent).not.toMatch(/Cargando/))
    expect(container.querySelector('.viewing-as')).toBeNull()
    expect(container.querySelector('.admin-main')?.firstElementChild?.tagName).toBe('HEADER')
    capture('superadmin-closed', container)
  })
  for (const role of ['passenger', 'driver', 'admin'] as const) {
    it.each(['dark', 'light'])(`${role}: keeps preview in the workspace and closes the drawer (%s)`, async (theme) => {
      localStorage.setItem('ride-theme', theme)
      const capturePrefix = `${role}${theme === 'light' ? '-light' : ''}`
      const onSwitchView = vi.fn()
      const props = { user, views, onSwitchView, onLogout: vi.fn() }
      const { container } = render(role === 'admin'
        ? <AdminDashboard {...props} viewAs="admin" onUserUpdate={vi.fn()} />
        : role === 'driver' ? <DriverDashboard {...props} activeView="driver" onUserUpdate={vi.fn()} />
          : <PassengerDashboard {...props} activeView="passenger" onUserUpdate={vi.fn()} />)
      await waitFor(() => expect(container.textContent).not.toMatch(/Cargando|Preparando tu panel/))
      const workspace = container.querySelector(role === 'admin' ? '.admin-main' : `.${role}-workspace`)!
      expect(workspace.firstElementChild).toHaveClass('viewing-as')
      expect(container.querySelectorAll('.viewing-as')).toHaveLength(1)
      expect(workspace.querySelector('header button[aria-label="Alternar menú"]')).toBeTruthy()
      const sidebar = container.querySelector('aside')!
      expect(sidebar).toHaveAttribute('inert')
      capture(`${capturePrefix}-closed`, container)
      fireEvent.click(screen.getByRole('button', { name: 'Alternar menú' }))
      expect(sidebar).not.toHaveAttribute('inert')
      capture(`${capturePrefix}-open`, container)
      fireEvent.click(screen.getByRole('button', { name: 'Contraer menú' }))
      expect(sidebar).toHaveAttribute('inert')
      const pages = role === 'passenger'
        ? ['Mis viajes', 'Direcciones', 'Pagos', 'Mi cuenta', 'Configuración', 'Soporte', 'Pedir viaje', 'Avisos']
        : role === 'driver' ? ['Viajes', 'Ganancias', 'Zonas de trabajo', 'Cuentas bancarias', 'Vehículos', 'Documentos', 'Mi cuenta', 'Configuración', 'Soporte']
          : ['Viajes', 'Usuarios', 'Conductores', 'Mi cuenta', 'Configuración']
      for (const [index, label] of pages.entries()) {
        if (sidebar.hasAttribute('inert')) fireEvent.click(screen.getByRole('button', { name: 'Alternar menú' }))
        fireEvent.click(within(sidebar as HTMLElement).getByRole('button', { name: label }))
        await waitFor(() => expect(workspace.textContent).not.toMatch(/Cargando/))
        if (!sidebar.hasAttribute('inert')) fireEvent.click(screen.getByRole('button', { name: 'Contraer menú' }))
        capture(`${capturePrefix}-page-${index}`, container)
      }
      fireEvent.click(screen.getByRole('button', { name: 'Volver a mi panel' }))
      expect(onSwitchView).toHaveBeenCalledWith('superadmin')
    })
  }
})
