# Mapas y direcciones de todo el mundo

Búsqueda de cualquier calle del planeta y mapa visual, sustituyendo al catálogo
de 15 lugares de Guayaquil.

## Por qué no cabe en Supabase

La pregunta natural es por qué no guardar las calles en la base. Los números:

| Qué | Tamaño |
|---|---|
| Base de Ride hoy | 20 MB |
| Límite del plan | 500 MB |
| OpenStreetMap del planeta, comprimido | ~80 GB |
| Ese mismo dato en Postgres con índices | ~1 TB |

Son unas 2.000 veces el límite del plan. **No es cuestión de configuración ni de
pagar el plan siguiente: Supabase no es el producto para eso.** Ni siquiera
Ecuador solo cabría cómodamente.

Ninguna app de transporte guarda ese dato: todas consultan un geocodificador,
que es quien mantiene las calles y nomenclaturas al día.

## Qué se usa

| Pieza | Servicio | Clave |
|---|---|---|
| Buscar direcciones | [Photon](https://photon.komoot.io) | No necesita |
| Coordenadas → dirección | Photon (reverse) | No necesita |
| Teselas del mapa | OpenStreetMap | No necesita |

Ambos se apoyan en datos de OpenStreetMap, licencia ODbL. La atribución
«© OpenStreetMap» del mapa no es decorativa: la licencia obliga a acreditarla.

### Límite de uso

Los servidores de Photon los dona Komoot, y los de teselas la fundación
OpenStreetMap. **Ambos piden identificar la aplicación y no abusar.** Para
desarrollo y demos alcanza; con usuarios reales hay que auto-hospedar Photon o
pasar a Mapbox (100.000 búsquedas al mes gratis).

El cambio afecta a un solo lugar en cada caso: `GeocodingService._base` y
`RideMap._urlTeselas`.

## Dos detalles que costaron encontrar

**`lang=es` devuelve error 400.** Photon solo admite `en`, `de`, `fr` e `it`. Con
el parámetro puesto, *toda* búsqueda de la app habría fallado. Sin él los
nombres llegan igual en el idioma local, que es justo lo que se quiere:
«Avenida Amazonas», no «Amazonas Avenue».

**El sesgo por ubicación no es opcional.** Buscar «Avenida Amazonas» sin pasar
`lat`/`lon` devuelve la de Perú; con la posición del pasajero, la de Ecuador.

## Cobertura verificada

Probado contra el servicio real:

| Consulta | Resultado |
|---|---|
| «Av. Victor Emilio Estrada» desde Guayaquil | Urdesa Central, Av Víctor E. Estrada 511 · Ecuador |
| «Avenida Amazonas» desde Quito | Avenida Amazonas · Quito, Ecuador |
| «Calle Serrano 21» desde Madrid | Calle de Serrano 21 · Madrid, España |
| «5th Avenue» desde Nueva York | 5th Avenue · New York, United States |
| «Shibuya» desde Tokio | 渋谷区 · 東京都, 日本 |
| «Rua Augusta» desde São Paulo | Rua Augusta · São Paulo, Brasil |
| Reverse en el aeropuerto de Guayaquil | Aeropuerto Internacional José Joaquín de Olmedo |

Calles con número, barrios, negocios y nombres en alfabetos no latinos.

## Cómo queda el flujo

**Elegir destino** — `PlacePickerScreen` ofrece tres caminos:

1. **Buscar** cualquier dirección del mundo, con espera de 350 ms para no
   disparar una petición por tecla.
2. **Tocar el mapa**, que pregunta qué dirección es ese punto. Si el
   geocodificador no lo reconoce, se usa igual con sus coordenadas: un viaje
   puede salir de un descampado sin nombre.
3. **Atajos**: las direcciones propias primero, luego el catálogo de la ciudad.

**Seguir el viaje** — `TripTrackingScreen` muestra origen, destino y el chofer
moviéndose, refrescado por Realtime.

## El catálogo no desaparece

`public.lugares` sigue existiendo como sugerencia rápida de puntos conocidos.
Lo que cambia es su papel: era la única fuente y ahora es un atajo.

La novedad es `public.direcciones_guardadas`: lo que cada persona ya usó. La
mayoría de los viajes van a los mismos tres o cuatro sitios, así que tenerlos a
mano ahorra escribir y evita salir a la red.

Se llenan solas al pedir un viaje (`recordar_direccion()`), y una etiqueta como
«Casa» las convierte en favoritas.

## Dónde vive cada cosa

- `lib/services/geocoding_service.dart` — Photon
- `lib/services/places_service.dart` — direcciones propias y catálogo
- `lib/widgets/ride_map.dart` — mapa reutilizable
- `lib/screens/trips/place_picker_screen.dart` — buscar o tocar el mapa

## Pendientes

1. **Ruta por calles.** La línea del mapa une origen y destino en recto. Una
   ruta real exige un motor de rutas (OSRM, Valhalla); `factor_trayecto_urbano()`
   compensa la distancia mientras tanto.
2. **Mapa en el panel web.** El monitoreo es una tabla; falta verlos ubicados.
3. **Auto-hospedar Photon** antes de tener usuarios reales.
4. **Mapa sin conexión.** Las teselas se piden cada vez; no hay caché en disco.
