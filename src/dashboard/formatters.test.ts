import { describe, expect, it } from 'vitest'
import { initials, money, shortDate } from './formatters'

describe('formatters del panel', () => {
  it('muestra iniciales sin depender de la cantidad de nombres', () => {
    expect(initials('Betzabe Escobar Zambrano')).toBe('BE')
    expect(initials('Ride')).toBe('R')
  })

  it('usa dólares y fechas ecuatorianas', () => {
    expect(money(12.5)).toContain('12,50')
    expect(shortDate('2026-09-06T12:00:00Z')).not.toBe('Sin fecha')
    expect(shortDate('')).toBe('Sin fecha')
  })
})
