import { useEffect, useState } from 'react'
import RideMap from '../components/RideMap'
import { reverseGeocode, searchPlaces } from '../lib/geocoding'
import type { RoadRoute } from '../lib/routing'
import type { Coordinates, Place, Quote, Trip, VehicleCategoryQuote } from '../lib/trips'
import { recommendedPlaces } from './recommendations'
import './RequestPage.css'

type Props = {
  places: Place[]
  origin: Coordinates | null
  destination: Place | null
  originPlaceId: string
  destinationId: string
  quote: Quote | null
  categoryQuotes: VehicleCategoryQuote[]
  selectedCategory: string
  pickupReference: string
  route: RoadRoute | null
  quoting: boolean
  locating: boolean
  busy: boolean
  activeTrip: Trip | null
  onUseLocation: () => void
  onOriginPoint: (place: Place) => void
  onDestinationPoint: (place: Place) => void
  onCategory: (category: string) => void
  onReference: (value: string) => void
  onConfirm: () => void
  onActive: () => void
}

const money = (value: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(value)

export function QuickPlaces({ title, items, onSelect }: { title: string; items: { place: Place; km?: number }[]; onSelect: (place: Place) => void }) {
  return <section className="quick-places"><span>{title}</span><div>{items.map(({ place, km }) => <button type="button" key={`${title}-${place.id}`} onClick={() => onSelect(place)}><b>⌖</b><span><strong>{place.nombre}</strong><small>{km != null ? `${km.toFixed(1)} km · ` : ''}{place.direccion}</small></span></button>)}</div></section>
}

export function PlaceSearch({ label, value, center, saved, onFocus, onSelect }: { label: string; value: string; center: Coordinates | null; saved: Place[]; onFocus: () => void; onSelect: (place: Place) => void }) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      if (query.trim().length < 3 || query === value) { setResults([]); return }
      setSearching(true)
      void searchPlaces(query, center ?? undefined, controller.signal)
        .then(setResults)
        .catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setResults([]) })
        .finally(() => setSearching(false))
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [center, query, value])

  const choose = (place: Place) => {
    setQuery([place.nombre, place.direccion].filter(Boolean).join(', '))
    setResults([])
    onSelect(place)
  }
  const suggestions = results.length ? results : query.trim().length >= 3
    ? saved.filter((place) => `${place.nombre} ${place.direccion}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : []

  return <label className="place-search" onFocus={onFocus}><span>{label}</span><div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={label === 'Destino' ? '¿A dónde quieres ir?' : 'Busca calle, sitio o ciudad'} autoComplete="off"/>{searching && <i/>}</div>{suggestions.length > 0 && <ul>{suggestions.map((place) => <li key={place.id}><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(place)}><strong>{place.nombre}</strong><small>{place.direccion}</small></button></li>)}</ul>}</label>
}

export default function RequestPage(props: Props) {
  const { places, origin, destination, originPlaceId, destinationId, quote, categoryQuotes, selectedCategory, pickupReference, route, quoting, locating, busy, activeTrip, onUseLocation, onOriginPoint, onDestinationPoint, onCategory, onReference, onConfirm, onActive } = props
  const [picking, setPicking] = useState<'origin' | 'destination'>('destination')

  const pickMap = async (lat: number, lng: number) => {
    const place = await reverseGeocode(lat, lng)
    if (picking === 'origin') onOriginPoint(place); else onDestinationPoint(place)
  }
  if (activeTrip) return <section className="passenger-empty"><span>↗</span><h3>Ya tienes un viaje en curso</h3><p>Primero termina o cancela el viaje hacia {activeTrip.destinoTexto}.</p><button onClick={onActive}>Ver mi viaje</button></section>

  const recent = places.filter((place) => place.source === 'recent').slice(0, 4)
  const suggestions = recommendedPlaces(places, origin)
  const fallbackSuggestions = recommendedPlaces(places)

  return <div className="passenger-page request-page"><div className="request-layout"><section className="request-form"><span className="passenger-kicker">DEFINE TU RECORRIDO</span><h2>Origen y destino</h2><p>Busca cualquier dirección de Ecuador o elige un punto directamente en el mapa.</p><PlaceSearch key={`origin-${originPlaceId}-${origin?.lat}`} label="Punto de partida" value={origin?.label ?? ''} center={origin} saved={places} onFocus={() => setPicking('origin')} onSelect={onOriginPoint}/>{fallbackSuggestions.length > 0 ? <QuickPlaces title="Sugerencias en Ecuador" items={fallbackSuggestions} onSelect={(place) => { setPicking('origin'); onOriginPoint(place) }}/> : recent.length > 0 && <QuickPlaces title="Ubicaciones recientes" items={recent.map((place) => ({ place }))} onSelect={(place) => { setPicking('origin'); onOriginPoint(place) }}/>}<button className="location-button" disabled={locating} onClick={onUseLocation}>{locating ? 'Obteniendo ubicación…' : '◎ Usar mi ubicación actual'}</button><label className="pickup-reference"><span>Referencia para encontrarte <small>opcional</small></span><input maxLength={160} value={pickupReference} onChange={(event) => onReference(event.target.value)} placeholder="Ej. entrada norte, junto a la farmacia"/></label><PlaceSearch key={`destination-${destinationId}-${destination?.lat}`} label="Destino" value={destination ? [destination.nombre, destination.direccion].filter(Boolean).join(', ') : ''} center={origin} saved={places} onFocus={() => setPicking('destination')} onSelect={onDestinationPoint}/>{origin && suggestions.length > 0 ? <QuickPlaces title="Recomendados cerca de tu zona" items={suggestions} onSelect={(place) => { setPicking('destination'); onDestinationPoint(place) }}/> : fallbackSuggestions.length > 0 ? <QuickPlaces title="Destinos recomendados en Ecuador" items={fallbackSuggestions} onSelect={(place) => { setPicking('destination'); onDestinationPoint(place) }}/> : recent.length > 0 && <QuickPlaces title="Destinos recientes" items={recent.map((place) => ({ place }))} onSelect={(place) => { setPicking('destination'); onDestinationPoint(place) }}/>}<small className="map-pick-hint">Al tocar el mapa cambiarás el {picking === 'origin' ? 'origen' : 'destino'}.</small></section><aside className="quote-card"><span className="passenger-kicker">RESUMEN</span><h3>Tu cotización</h3>{categoryQuotes.length > 0 && <div className="vehicle-categories">{categoryQuotes.map((item) => <button key={item.categoria} type="button" className={selectedCategory === item.categoria ? 'selected' : ''} onClick={() => onCategory(item.categoria)}><span>{item.icono === 'moto' ? '♞' : item.icono === 'van' ? '▰' : '◆'}</span><div><strong>{item.categoriaNombre}</strong><small>{item.pasajeros === 1 ? '1 pasajero' : `Hasta ${item.pasajeros} pasajeros`}</small></div><b>{money(item.total)}</b></button>)}</div>}{quoting && !quote ? <div className="quote-loading"><i/>Calculando la mejor tarifa…</div> : quote ? <><div className="quote-price"><span>Precio estimado</span><strong>{money(quote.total)}</strong></div><dl><div><dt>Distancia estimada</dt><dd>{quote.km.toFixed(2)} km</dd></div><div><dt>Tiempo estimado</dt><dd>{quote.minutos} min</dd></div><div><dt>Ruta</dt><dd>{route ? 'Por calles' : 'Estimación inicial'}</dd></div><div><dt>Tarifa</dt><dd>{quote.tarifaNombre}</dd></div></dl><button disabled={busy || quoting} onClick={onConfirm}>{busy ? 'Solicitando…' : quoting ? 'Ajustando ruta…' : `Confirmar por ${money(quote.total)}`}<b>→</b></button><small>El precio y la categoría se validan en el servidor.</small></> : <div className="quote-empty"><span>↗</span><p>Completa el origen y el destino para conocer el precio antes de confirmar.</p></div>}</aside></div><RideMap origin={origin} destination={destination} route={route} onPick={(lat, lng) => void pickMap(lat, lng)} className="request-map"/></div>
}
