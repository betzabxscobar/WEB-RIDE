import { describe, expect, it } from 'vitest'
import { panelLabel, translateDriverConversionError, viewsAllowed } from './auth'

describe('permisos de navegación por rol', () => {
  it('mantiene al pasajero únicamente en su panel', () => {
    expect(viewsAllowed('passenger')).toEqual(['passenger'])
  })

  it('permite al conductor alternar con la vista de pasajero', () => {
    expect(viewsAllowed('driver')).toEqual(['driver', 'passenger'])
  })

  it('no entrega la vista de superadmin a un administrador', () => {
    expect(viewsAllowed('admin')).toEqual(['admin', 'passenger', 'driver'])
    expect(viewsAllowed('admin')).not.toContain('superadmin')
  })

  it('presenta etiquetas comprensibles para cada panel', () => {
    expect(panelLabel('passenger')).toBe('Vista de usuario')
    expect(panelLabel('driver')).toBe('Vista de chofer')
    expect(panelLabel('admin')).toBe('Panel de administración')
  })

  it('explica por qué un pasajero no puede cambiar a chofer', () => {
    expect(translateDriverConversionError('Termina tu viaje antes de pasarte a chofer')).toMatch(/viaje activo/i)
    expect(translateDriverConversionError('Solo una cuenta de pasajero puede pasarse a chofer')).toMatch(/pasajero/i)
    expect(translateDriverConversionError('Debes iniciar sesion')).toMatch(/sesión expiró/i)
  })
})
