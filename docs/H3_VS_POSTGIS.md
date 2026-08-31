# H3 frente a PostGIS: medición

Comparación de las dos vías para «choferes cerca de este punto», medida contra
la base real. Las dos están implementadas y conviven.

## Qué resuelve cada una

Conviene fijarlo antes: **H3 no sustituye al geocodificador**. H3 no sabe qué
calles existen; convierte coordenadas en celdas hexagonales. Compite con
PostGIS en la búsqueda por cercanía, no con Photon.

## Resultados

Flota de 40 choferes alrededor del aeropuerto de Guayaquil, radio de 5 km,
posiciones a distancias conocidas.

| | Devuelve | De más | De menos | Envía | Tiempo |
|---|---|---|---|---|---|
| Verdad (Haversine ≤ 5 km) | 24 | — | — | — | — |
| **PostGIS** `ST_DWithin` | **24** | **0** | **0** | 0 bytes | 1,186 ms |
| **H3** por celda | 36 | **12** | 0 | 975 bytes | **0,512 ms** |

### H3 es más rápido dentro de la base

2,3× más rápido. Comparar cadenas con índice B-tree gana a la búsqueda espacial
con GIST a este tamaño.

Una medición previa en JavaScript daba lo contrario; era engañosa, porque ahí
H3 tenía que calcular las celdas y PostGIS no participaba. **Vale la medición
en la base, que es donde corre la consulta.**

Dicho eso: 0,67 ms de diferencia no los percibe nadie.

### H3 trae de más, y subir la resolución no lo arregla

| Resolución | Arista | Anillos | Celdas a enviar | De más |
|---|---|---|---|---|
| 6 | 3,72 km | 2 | 19 | 15 |
| **7** | **1,41 km** | **4** | **61** | **12** |
| 8 | 0,53 km | 10 | 331 | 12 |
| 9 | 0,20 km | 25 | **1.951** | 12 |

De res 7 a res 9 las celdas se multiplican por 32 y la precisión no mejora. Los
hexágonos son de tamaño fijo: el disco de anillos siempre cubre más área que el
círculo pedido.

En la práctica, 12 de cada 36 choferes reciben un viaje fuera de su zona.
Confirmado en el flujo completo:

```
OK  chofer a 0.5 km  ve 1 solicitudes
OK  chofer a 15 km   ve 0 solicitudes
!!  chofer a 5.2 km (fuera del radio) ve 1 solicitudes
```

### H3 no da distancia

`gridDistance` responde en número de celdas, no en kilómetros. Ordenar la lista
por cercanía exige calcular Haversine igual, que es lo que PostGIS ya hacía.

## El problema que no se mide

**H3 no está entre las 78 extensiones de Supabase.** La celda la calcula el
dispositivo del chofer y llega ya resuelta; Postgres comprueba el formato pero
no puede confirmar que corresponda a las coordenadas enviadas.

Con PostGIS esa verificación ocurre dentro de la base y un cliente modificado no
puede saltársela.

## Dónde H3 sí gana

Agrupando por zonas. Los mismos 40 choferes cayeron en **20 celdas distintas**,
cada una con identificador estable (`878f2b985ffffff`) y su hexágono listo para
dibujar.

Con PostGIS habría que definir polígonos a mano. Con H3 basta un `GROUP BY`.
**Para tarifa por sector y mapas de calor, H3 es la herramienta correcta.**

## Cómo quedó montado

Las dos vías conviven. La política acepta cualquiera:

```sql
public.viaje_en_mi_celda(id)                                  -- H3
or (celdas_difusion is null and viaje_esta_cerca_de_mi(id))   -- PostGIS
```

Si el cliente manda celdas se usa H3; si no, PostGIS. Nada queda a medias.

### Disponibilidad por plataforma

`h3_dart` elige implementación según dónde corra:

| Plataforma | Implementación | Necesita |
|---|---|---|
| **Web** | `h3_web` (JavaScript) | Script `h3-js` en `web/index.html` |
| **Móvil / escritorio** | FFI sobre la librería C | Compilarla por plataforma — **no integrado** |

Por eso `H3Service` comprueba `kIsWeb`: en web calcula celdas, en móvil devuelve
`null` y la app cae a PostGIS sin enterarse.

Verificado en el build web: `latLngToCell(-2.1574, -79.8836, 7)` devuelve
`878f2b985ffffff`, la misma celda usada en las pruebas de la base.

## Recomendación

**PostGIS para buscar choferes** — es exacto, la validación ocurre en el
servidor y funciona en todas las plataformas. La ventaja de velocidad de H3 es
real pero imperceptible, y su coste (un tercio de avisos fuera de zona) sí se
nota.

**H3 para el tarifario por zona**, cuando toque. Ahí gana sin discusión.

## Reproducir la medición

- `WEB-RIDE/src/lib/h3-comparacion.ts` — banco de pruebas en el navegador:
  `comparar()`, `medirTiempos()`, `agruparPorZona()`, `sqlDeLaFlota()`.
- Migraciones 29 y 30 — la implementación H3 en la base.

Si se descarta H3, se puede borrar ese archivo junto con la dependencia
`h3-js`, y las columnas `celda_h3_*` quedarían sin uso.
