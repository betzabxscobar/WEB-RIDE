import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }))

import {
  getMySubscription,
  hasExpired,
  hasUnfinishedPayment,
  isCourtesy,
  isExpiringSoon,
  openSubscriptionCheckout,
  UNPAID,
  type DriverSubscription,
} from './subscription'

beforeEach(() => { mocks.rpc.mockReset(); mocks.invoke.mockReset() })

const fila = (extra: Record<string, unknown> = {}) => ({
  estado: 'activa',
  vigente: true,
  dias_restantes: 20,
  monto: 15,
  moneda: 'USD',
  proveedor: 'paypal',
  vigente_hasta: new Date(Date.now() + 20 * 86400000).toISOString(),
  referencia_externa: null,
  pago_sin_terminar: null,
  ...extra,
})

const cuota = (extra: Partial<DriverSubscription> = {}): DriverSubscription => ({ ...UNPAID, active: true, daysLeft: 20, ...extra })

describe('cuota mensual del chofer', () => {
  it('lee la fila que devuelve la función de la base', async () => {
    mocks.rpc.mockResolvedValue({ data: [fila({ proveedor: 'cortesia', monto: 0 })], error: null })
    const result = await getMySubscription()
    expect(mocks.rpc).toHaveBeenCalledWith('mi_suscripcion')
    expect(result.active).toBe(true)
    expect(result.provider).toBe('cortesia')
    expect(result.amount).toBe(0)
  })

  it('sin respuesta se asume que no pagó, nunca al revés', async () => {
    // Si la red falla, lo barato es enseñar el panel de cobro de más. Darlo por
    // pagado sería regalar viajes a quien no pagó.
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'sin red' } })
    await expect(getMySubscription()).resolves.toEqual(UNPAID)

    mocks.rpc.mockResolvedValue({ data: [], error: null })
    await expect(getMySubscription()).resolves.toEqual(UNPAID)
  })

  it('un pago abierto y sin aprobar no cuenta como pagado', async () => {
    // El caso que se vio en el teléfono: se abría el pago, se cerraba PayPal
    // sin pagar, y la pantalla decía «Al día» porque el chofer todavía tenía
    // el mes de cortesía por otro lado.
    mocks.rpc.mockResolvedValue({ data: [fila({ proveedor: 'cortesia', pago_sin_terminar: 'I-K9U1828ES000' })], error: null })
    const result = await getMySubscription()
    expect(isCourtesy(result)).toBe(true)
    expect(hasUnfinishedPayment(result)).toBe(true)
  })

  it('una suscripción ya aprobada no se confunde con un pago a medias', () => {
    // La referencia que manda y la pendiente son la misma: se aprobó, y no hay
    // nada que terminar.
    expect(hasUnfinishedPayment(cuota({ reference: 'I-YA', unfinishedPayment: 'I-YA' }))).toBe(false)
    expect(hasUnfinishedPayment(cuota())).toBe(false)
  })

  it('avisa cuando quedan pocos días, no cuando ya se venció', () => {
    expect(isExpiringSoon(cuota({ daysLeft: 3 }))).toBe(true)
    expect(isExpiringSoon(cuota({ daysLeft: 5 }))).toBe(true)
    expect(isExpiringSoon(cuota({ daysLeft: 6 }))).toBe(false)
    // Vencida no es «por vencer»: ahí el aviso ya no sirve, toca renovar.
    expect(isExpiringSoon(cuota({ active: false, daysLeft: 0 }))).toBe(false)
  })

  it('distingue al que se le venció del que no pagó nunca', () => {
    // Al que ya pagó se le habla de renovar, no de empezar.
    expect(hasExpired(cuota({ active: false, validUntil: '2026-08-01T00:00:00Z' }))).toBe(true)
    expect(hasExpired(UNPAID)).toBe(false)
  })

  it('abre el pago y devuelve dónde se aprueba', async () => {
    mocks.invoke.mockResolvedValue({ data: { suscripcion_id: 'I-1', aprobar_en: 'https://paypal.com/x' }, error: null })
    await expect(openSubscriptionCheckout()).resolves.toBe('https://paypal.com/x')
    // Manda a donde volver: sin eso PayPal devuelve al chofer a `ride://`,
    // que el navegador no sabe abrir.
    expect(mocks.invoke).toHaveBeenCalledWith('suscripcion-paypal', {
      body: { vuelta: expect.stringMatching(/^https?:\/\/[^/]+\/$/) },
    })
  })

  it('sin credenciales configuradas lo dice, en vez de un error genérico', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: { status: 503 } } })
    await expect(openSubscriptionCheckout()).rejects.toThrow('todavía no está configurado')
  })

  it('un pasajero no abre suscripciones', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: { status: 403 } } })
    await expect(openSubscriptionCheckout()).rejects.toThrow('Solo un chofer')
  })

  it('no inventa un enlace si PayPal no lo devuelve', async () => {
    // Abrir `undefined` en una pestaña deja al chofer mirando una página en
    // blanco sin saber que su pago no se abrió.
    mocks.invoke.mockResolvedValue({ data: { suscripcion_id: 'I-1' }, error: null })
    await expect(openSubscriptionCheckout()).rejects.toThrow('algo que no entendemos')
  })
})
