import * as h3 from 'h3-js'

/**
 * Banco de pruebas: H3 frente a PostGIS para «choferes cerca de este punto».
 *
 * No es código de producción. Está aquí para decidir con números en vez de con
 * opiniones, y para poder repetir la medición si mañana se replantea.
 *
 * Se puede borrar junto con la dependencia `h3-js` si se descarta H3.
 */

const CENTRO_LAT = -2.1574 // Aeropuerto de Guayaquil
const CENTRO_LNG = -79.8836
const RADIO_KM = 5

/** Haversine, la misma fórmula que `public.distancia_km()` en Postgres. */
function distanciaKm(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371
  const rad = (g: number) => (g * Math.PI) / 180
  const dLa = rad(la2 - la1)
  const dLo = rad(lo2 - lo1)
  const a =
    Math.sin(dLa / 2) ** 2 +
    Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

type Chofer = { id: string; lat: number; lng: number; km: number }

/** Choferes repartidos en cuatro rumbos, a distancias conocidas del centro. */
function flotaSimulada(): Chofer[] {
  const flota: Chofer[] = []
  let n = 0
  for (const km of [0.5, 1, 2, 3, 4, 4.8, 5.2, 6, 8, 15]) {
    for (const rumbo of [0, 90, 180, 270]) {
      const lat = CENTRO_LAT + (km / 111) * Math.cos((rumbo * Math.PI) / 180)
      const lng =
        CENTRO_LNG +
        (km / (111 * Math.cos((CENTRO_LAT * Math.PI) / 180))) *
          Math.sin((rumbo * Math.PI) / 180)
      flota.push({
        id: `c${n++}`,
        lat,
        lng,
        km: distanciaKm(CENTRO_LAT, CENTRO_LNG, lat, lng),
      })
    }
  }
  return flota
}

export function comparar() {
  const flota = flotaSimulada()
  const dentroReal = flota.filter((c) => c.km <= RADIO_KM)

  const h3Resultados = [6, 7, 8, 9].map((res) => {
    const arista = h3.getHexagonEdgeLengthAvg(res, 'km')
    // Cuántos anillos hacen falta para alcanzar el radio pedido.
    const k = Math.ceil(RADIO_KM / arista)
    const vecindad = new Set(
      h3.gridDisk(h3.latLngToCell(CENTRO_LAT, CENTRO_LNG, res), k),
    )
    const hallados = flota.filter((c) =>
      vecindad.has(h3.latLngToCell(c.lat, c.lng, res)),
    )
    return {
      res,
      arista_km: +arista.toFixed(2),
      anillos: k,
      celdas_en_la_consulta: vecindad.size,
      encuentra: hallados.length,
      sobran: hallados.filter((c) => c.km > RADIO_KM).length,
      faltan: dentroReal.filter((c) => !hallados.some((h) => h.id === c.id)).length,
    }
  })

  return {
    flota_total: flota.length,
    dentro_de_5km_real: dentroReal.length,
    h3: h3Resultados,
    postgis: {
      celdas_en_la_consulta: 0,
      encuentra: dentroReal.length,
      sobran: 0,
      faltan: 0,
    },
  }
}

/** Cuánto tarda cada enfoque en clasificar la flota, en el cliente. */
export function medirTiempos(repeticiones = 200) {
  const flota = flotaSimulada()
  const res = 8
  const arista = h3.getHexagonEdgeLengthAvg(res, 'km')
  const k = Math.ceil(RADIO_KM / arista)

  const t0 = performance.now()
  for (let i = 0; i < repeticiones; i++) {
    const vecindad = new Set(
      h3.gridDisk(h3.latLngToCell(CENTRO_LAT, CENTRO_LNG, res), k),
    )
    flota.filter((c) => vecindad.has(h3.latLngToCell(c.lat, c.lng, res)))
  }
  const msH3 = (performance.now() - t0) / repeticiones

  const t1 = performance.now()
  for (let i = 0; i < repeticiones; i++) {
    flota.filter((c) => distanciaKm(CENTRO_LAT, CENTRO_LNG, c.lat, c.lng) <= RADIO_KM)
  }
  const msHaversine = (performance.now() - t1) / repeticiones

  return {
    h3_ms_por_consulta: +msH3.toFixed(3),
    haversine_ms_por_consulta: +msHaversine.toFixed(3),
    celdas_que_viajarian_al_servidor: new Set(
      h3.gridDisk(h3.latLngToCell(CENTRO_LAT, CENTRO_LNG, res), k),
    ).size,
  }
}

/**
 * Donde H3 sí aporta: agrupar por zonas.
 *
 * Con PostGIS habría que definir polígonos a mano; con H3 el índice de celda ya
 * es el identificador de la zona, así que un GROUP BY basta. Es lo que sirve
 * para tarifa por sector y mapas de calor de demanda.
 */
export function agruparPorZona() {
  const flota = flotaSimulada()
  const res = 7 // ~1.4 km de arista: tamaño razonable para un sector urbano

  const porCelda = new Map<string, number>()
  for (const c of flota) {
    const celda = h3.latLngToCell(c.lat, c.lng, res)
    porCelda.set(celda, (porCelda.get(celda) ?? 0) + 1)
  }

  const zonas = [...porCelda.entries()]
    .map(([celda, choferes]) => {
      const [lat, lng] = h3.cellToLatLng(celda)
      return {
        celda,
        choferes,
        centro: [+lat.toFixed(4), +lng.toFixed(4)] as [number, number],
        // El polígono para pintarla en el mapa sale de la propia celda.
        vertices: h3.cellToBoundary(celda).length,
      }
    })
    .sort((a, b) => b.choferes - a.choferes)

  return {
    resolucion: res,
    zonas_distintas: zonas.length,
    zona_mas_cargada: zonas[0],
    // La celda es una cadena estable: sirve como clave en una tabla sin
    // necesidad de geometrías.
    ejemplo_de_clave: zonas[0]?.celda,
  }
}

/**
 * Genera el SQL para cargar en la base las celdas de la flota de prueba.
 *
 * Existe porque Postgres no puede calcular celdas H3: cada una tiene que
 * viajar ya resuelta desde un cliente que tenga la librería.
 */
export function sqlDeLaFlota() {
  const RES = 7
  const filas: string[] = []
  let i = 0
  for (const km of [0.5, 1, 2, 3, 4, 4.8, 5.2, 6, 8, 15]) {
    for (const rumbo of [0, 90, 180, 270]) {
      const lat = CENTRO_LAT + (km / 111) * Math.cos((rumbo * Math.PI) / 180)
      const lng =
        CENTRO_LNG +
        (km / (111 * Math.cos((CENTRO_LAT * Math.PI) / 180))) *
          Math.sin((rumbo * Math.PI) / 180)
      filas.push(
        `update public.conductores set celda_h3_7='${h3.latLngToCell(lat, lng, RES)}', ` +
          `celda_h3_9='${h3.latLngToCell(lat, lng, 9)}' ` +
          `where id=(select id from auth.users where email='h3prueba${i}@t.dev');`,
      )
      i++
    }
  }

  const arista = h3.getHexagonEdgeLengthAvg(RES, 'km')
  const k = Math.ceil(RADIO_KM / arista)
  const disco = h3.gridDisk(h3.latLngToCell(CENTRO_LAT, CENTRO_LNG, RES), k)

  return {
    resolucion: RES,
    anillos: k,
    celdas_en_el_disco: disco.length,
    bytes_que_viajan: disco.join(',').length,
    updates: filas.join('\n'),
    disco_sql: `array[${disco.map((c) => `'${c}'`).join(',')}]`,
  }
}
