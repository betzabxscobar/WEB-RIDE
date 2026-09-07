import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }))

import { advanceTrip, cancelTrip, confirmPaymentReceived } from './trips'
import { saveBankAccount, saveWorkZones } from './driver-account'

beforeEach(() => mocks.rpc.mockReset())

describe('funciones compartidas con la app', () => {
  it('envía el código de seis dígitos al iniciar el viaje', async () => {
    mocks.rpc.mockResolvedValue({ data: 'EN_CURSO', error: null })
    await expect(advanceTrip('viaje-1', '123456')).resolves.toBe('EN_CURSO')
    expect(mocks.rpc).toHaveBeenCalledWith('avanzar_viaje', { p_viaje_id: 'viaje-1', p_codigo: '123456' })
  })

  it('registra el motivo al cancelar', async () => {
    mocks.rpc.mockResolvedValue({ error: null })
    await cancelTrip('viaje-2', 'El pasajero no se presentó')
    expect(mocks.rpc).toHaveBeenCalledWith('cancelar_viaje', { p_viaje_id: 'viaje-2', p_motivo: 'El pasajero no se presentó' })
  })

  it('confirma el dinero recibido mediante la operación protegida', async () => {
    mocks.rpc.mockResolvedValue({ error: null })
    await confirmPaymentReceived('viaje-3')
    expect(mocks.rpc).toHaveBeenCalledWith('confirmar_pago_recibido', { p_viaje_id: 'viaje-3' })
  })

  it('guarda zonas y cuentas bancarias mediante RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: 'cuenta-1', error: null })
    await saveWorkZones(['quito_norte', 'quito_centro'])
    expect(mocks.rpc).toHaveBeenCalledWith('elegir_mis_zonas', { p_zonas: ['quito_norte', 'quito_centro'] })
    await saveBankAccount({ bank: 'pichincha', type: 'ahorros', number: '1234567890', holder: 'Alexandra Pérez', preferred: true })
    expect(mocks.rpc).toHaveBeenLastCalledWith('registrar_cuenta_bancaria', expect.objectContaining({ p_banco: 'pichincha', p_tipo: 'ahorros', p_numero: '1234567890' }))
  })
})
