# Módulo de viajes

Ciclo completo pasajero ↔ chofer, más el monitoreo en el panel web.

## Sin mapa: qué se puede y qué no

Un Uber real necesita tres cosas que Supabase no ofrece y que exigirían un
proveedor externo, descartado por decisión del proyecto:

| Falta | Por qué | Qué se hace en su lugar |
|---|---|---|
| Mapa visual | Los tiles vienen de Google, Mapbox u OpenStreetMap | Origen y destino en texto, con coordenadas reales detrás |
| Geocodificación | Convertir «Av. 9 de Octubre» en coordenadas es un servicio | Catálogo `public.lugares` con puntos conocidos |
| Ruta por calles | Requiere un motor de rutas | Distancia en línea recta × factor urbano |

Lo que **sí** se hace con Supabase: calcular distancias (Postgres), cotizar por
tarifa vigente, transmitir el estado en vivo (Realtime) y todo el ciclo de
estados, pagos y calificaciones. El GPS del teléfono es del dispositivo, no un
servicio externo, así que el origen puede ser la ubicación real.

## Reparto de responsabilidades

**Todo lo que decide algo está en Postgres.** El cliente se puede manipular:
no puede fijar el precio, ni resolver quién se queda con una solicitud, ni
saltarse un estado.

Las apps solo llaman a las funciones y muestran el resultado.

| Función | Qué garantiza |
|---|---|
| `cotizar_viaje()` | El monto sale del tarifario y la distancia, calculado en el servidor |
| `solicitar_viaje()` | Viaje y ubicaciones en una transacción; un solo viaje abierto por pasajero |
| `aceptar_viaje()` | `UPDATE` condicional sobre `estado='BUSCANDO_CONDUCTOR' AND conductor_id IS NULL` |
| `avanzar_viaje()` | Solo el chofer asignado mueve el estado |
| `finalizar_viaje()` | Liquida la tarifa y registra el pago |
| `cancelar_viaje()` | Pasajero o chofer, solo antes de arrancar |
| `reportar_posicion()` | Solo durante un viaje activo propio |

### La carrera entre dos choferes

Es el punto delicado del módulo. Si dos choferes tocan «Aceptar» a la vez, un
`SELECT` seguido de `UPDATE` dejaría que ambos se quedaran con el viaje. Por eso
`aceptar_viaje()` hace un único `UPDATE` condicional: gana quien encuentre la
fila todavía libre, y al otro le devuelve *«Ese viaje ya fue tomado»*.

Probado con dos sesiones compitiendo: solo una lo obtuvo.

## Flujo

**Pasajero** — `RequestTripScreen` → GPS u origen del catálogo, destino del
catálogo, cotización → confirmar → `TripTrackingScreen`, que se actualiza sola
con Realtime y ofrece calificar al terminar.

**Chofer** — `DriverTripsScreen` → interruptor de disponibilidad (contra
`public.conductores`, no una bandera local) → solicitudes abiertas → aceptar →
avanzar estados → finalizar → calificar al pasajero.

**Panel web** — sección *Viajes*: métricas y monitoreo en vivo de todos los
viajes. RLS da lectura global a las cuentas administrativas.

## Dónde vive cada cosa

**APPRIDE (Flutter)**
- `lib/models/trip.dart` — `TripStatus` (los nueve estados), `Trip`, `Place`, `Quote`
- `lib/services/ride_service.dart` — RPC y Realtime
- `lib/services/location_service.dart` — GPS con manejo de permisos
- `lib/screens/trips/` — solicitud, seguimiento, chofer y calificación

**WEB-RIDE (React)**
- `src/lib/trips.ts` — consulta y suscripción
- `src/AdminDashboard.tsx` — sección *Viajes*

## Un defecto que apareció al probar

`cotizar_viaje()` se podía ejecutar **sin iniciar sesión**. En la migración 15
se escribió `revoke execute ... from anon`, que no basta: Postgres concede
`EXECUTE` a `PUBLIC` por defecto en cada función nueva, y `anon` hereda de ahí.

Al revisar si había más casos apareció uno peor, anterior a este módulo:
`is_bootstrap_admin_email()` dejaba a cualquiera comprobar si un correo estaba
en la lista blanca de administradores.

Corregido en las migraciones 19, 20 y 21. **Al escribir un `revoke` sobre una
función, incluir siempre `public`, no solo `anon`.**

## Los avisos del linter de Supabase

El panel muestra 9 avisos
`authenticated_security_definer_function_executable`, uno por cada RPC del
módulo más los tres helpers de rol. **Son falsos positivos y no hay que
tocarlos.**

El linter ve el patrón «función `SECURITY DEFINER` invocable con sesión» pero no
puede leer lo que hace por dentro: ve la puerta abierta, no al guardia detrás.

El diseño es deliberado:

- **Deben ser invocables.** Si se les quita el permiso a `authenticated`, la app
  deja de funcionar: son las operaciones del módulo.
- **Deben ser `SECURITY DEFINER`.** `aceptar_viaje` necesita el `UPDATE`
  condicional atómico que evita la carrera entre dos choferes, y
  `solicitar_viaje` escribe en tres tablas en una transacción. Con
  `SECURITY INVOKER` RLS lo bloquearía a medias.
- **Cada una valida `auth.uid()` antes de tocar nada.**

### Verificado, no supuesto

Con dos usuarios autenticados, uno intentando manipular el viaje del otro:

| Intento del atacante | Resultado |
|---|---|
| `cancelar_viaje` de un viaje ajeno | Rechazado |
| `avanzar_viaje` de un viaje ajeno | Rechazado |
| `finalizar_viaje` de un viaje ajeno | Rechazado |
| `reportar_posicion` en un viaje ajeno | Rechazado |
| `aceptar_viaje` sin ser chofer aprobado | Rechazado |
| `participa_en_viaje` de un viaje ajeno | `false` |

El viaje de la víctima quedó intacto en `BUSCANDO_CONDUCTOR`.

`current_user_role`, `current_user_must_change_password` y `participa_en_viaje`
no cortan con excepción porque solo responden sobre quien pregunta: sin sesión
devuelven vacío. Además se evalúan dentro de políticas RLS, así que
**revocarles `EXECUTE` rompería el acceso** — ya pasó una vez y el síntoma fue
`permission denied for function current_user_role` en consultas anónimas.

### El aviso que sí hay que atender

`auth_leaked_password_protection`. Es un interruptor en **Authentication →
Providers → Email** que hace que Supabase rechace contraseñas que aparecen en
filtraciones conocidas (comprueba contra HaveIBeenPwned sin enviar la
contraseña completa). Conviene activarlo antes de rotar las credenciales del
equipo.

## Pendientes

1. **Expiración de solicitudes.** Ningún proceso pasa un viaje a
   `SIN_CONDUCTOR` si nadie lo toma. El estado existe y la máquina lo permite,
   pero falta la tarea programada que lo aplique.
2. **Tarifa final = cotización.** `finalizar_viaje()` cobra lo cotizado. Con
   seguimiento GPS continuo se podría recalcular sobre la distancia recorrida.
3. **Métodos de pago.** La tabla existe y `finalizar_viaje()` la usa si hay uno
   predeterminado, pero no hay pantalla para darlos de alta: hoy todo cobro
   queda como `pendiente`.
4. **Búsqueda por cercanía.** Todos los choferes disponibles ven todas las
   solicitudes. `distancia_km()` ya permitiría filtrar por radio.
5. **Deep links.** Sin ellos, el chofer no recibe avisos con la app cerrada.
