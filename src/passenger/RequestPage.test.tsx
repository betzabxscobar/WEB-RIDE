import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Place } from '../lib/trips'
import { QuickPlaces } from './RequestPage'
import { recommendedPlaces } from './recommendations'

const places: Place[] = [
  { id: 'gye', nombre: 'Malecón 2000', direccion: 'Guayaquil, Guayas', lat: -2.19, lng: -79.88, source: 'recommended' },
  { id: 'cue', nombre: 'Parque Calderón', direccion: 'Cuenca, Azuay', lat: -2.90, lng: -79.00, source: 'recommended' },
  { id: 'recent', nombre: 'Casa', direccion: 'Loja', lat: -4.00, lng: -79.20, source: 'recent' },
]

describe('sugerencias nacionales del pasajero', () => {
  it('incluye lugares recomendados de distintas ciudades y excluye recientes', () => {
    expect(recommendedPlaces(places).map(({ place }) => place.id)).toEqual(['gye', 'cue'])
  })

  it('ordena por cercanía cuando existe ubicación de origen', () => {
    expect(recommendedPlaces(places, { lat: -2.89, lng: -79.01, label: 'Cuenca' })[0].place.id).toBe('cue')
  })

  it('permite seleccionar una sugerencia mediante el panel', async () => {
    const onSelect = vi.fn()
    render(<QuickPlaces title="Sugerencias en Ecuador" items={recommendedPlaces(places)} onSelect={onSelect}/>)
    await userEvent.click(screen.getByRole('button', { name: /Malecón 2000/i }))
    expect(onSelect).toHaveBeenCalledWith(places[0])
  })
})
