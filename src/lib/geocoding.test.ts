import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchPlaces } from './geocoding'

afterEach(() => vi.restoreAllMocks())

describe('búsqueda geográfica en Ecuador', () => {
  it('no da prioridad artificial a Quito cuando falta la ubicación', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [
        { geometry: { coordinates: [-78.4678, -0.1807] }, properties: { name: 'Centro histórico', city: 'Quito', state: 'Pichincha' } },
        { geometry: { coordinates: [-79.0045, -2.9001] }, properties: { name: 'Parque Calderón', city: 'Cuenca', state: 'Azuay' } },
      ] }),
    }))

    const result = await searchPlaces('centro')
    expect(result[0].direccion).toContain('Cuenca')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('bbox=-92.2%2C-5.2%2C-75.0%2C1.8'), expect.anything())
  })

  it('descarta resultados que estén fuera del territorio configurado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [
        { geometry: { coordinates: [-74.08, 4.61] }, properties: { name: 'Bogotá', country: 'Colombia' } },
        { geometry: { coordinates: [-79.9, -2.2] }, properties: { name: 'Guayaquil', country: 'Ecuador' } },
      ] }),
    }))
    expect((await searchPlaces('ciudad')).map((place) => place.nombre)).toEqual(['Guayaquil'])
  })
})
