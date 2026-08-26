# Base de datos RIDE — registro de migraciones

Proyecto Supabase: `jnnesfafbrlbycfkruph` (región us-east-1, Postgres 17).
Una sola base para los dos clientes: **WEB-RIDE** (React) y **APPRIDE** (Flutter).

Todas las migraciones de esta carpeta ya están **aplicadas** en ese proyecto
(2026-08-26) y quedaron registradas en `supabase_migrations.schema_migrations`.
Se pueden ver con `list_migrations` o en el dashboard.

## Orden de ejecución

| # | Archivo | Sección del informe | Qué crea |
|---|---|---|---|
| 01 | `01_perfiles_campos_documento.sql` | 2.2 | Campos `phone`, `foto_url`, `activo` en `profiles` |
| 02 | `02_enum_estado_viaje.sql` | 2.4 | Tipo `enum_estado_viaje` (9 estados) |
| 03 | `03_pasajeros_conductores.sql` | 2.1-A, 2.2 | `pasajeros`, `conductores` |
| 04 | `04_vehiculos_documentos_conductor.sql` | 2.1-B, 2.2 | `vehiculos`, `documentos_conductor` |
| 05 | `05_tarifas.sql` | 2.2 | `tarifas` + 3 tarifas iniciales |
| 06 | `06_viajes_ubicaciones.sql` | 2.2 | `viajes`, `ubicaciones` |
| 07 | `07_metodos_pago_pagos.sql` | 2.1-C, 2.2 | `metodos_pago`, `pagos` |
| 08 | `08_calificaciones_notificaciones.sql` | 2.2 | `calificaciones`, `notificaciones` |
| 09 | `09_triggers_reglas_negocio.sql` | 2.5 | Máquina de estados y validaciones |
| 10 | `10_rls_politicas.sql` | 2.5 | RLS en las 11 tablas nuevas |
| 11 | `11_endurecer_funciones.sql` | — | Cierra avisos del linter de seguridad |
| 12 | `12_corregir_validar_transicion_viaje.sql` | — | Corrección de un cast en 09 |
| 13 | `13_handle_new_user_guarda_telefono.sql` | 2.2 | Guarda el teléfono al registrarse y crea la extensión 1:1 del rol |
| 14 | `14_lugares.sql` | — | Catálogo de destinos con coordenadas |
| 15 | `15_distancia_y_cotizacion.sql` | 1.5 | Distancia Haversine y cálculo de tarifa |
| 16 | `16_solicitar_y_aceptar_viaje.sql` | 1.5 | `solicitar_viaje()` y `aceptar_viaje()` |
| 17 | `17_avanzar_cancelar_finalizar.sql` | 1.5, 2.4 | Avance de estados, cierre, cancelación y GPS |
| 18 | `18_realtime_y_vista_viajes.sql` | 1.1 | Realtime y vista `viajes_detalle` |
| 19 | `19_corregir_permisos_cotizacion.sql` | — | Cierra un permiso público que dejó la 15 |
| 20 | `20_cerrar_permisos_publicos_heredados.sql` | — | Mismo defecto en funciones anteriores |
| 21 | `21_politicas_profiles_solo_autenticados.sql` | — | Acota las políticas de `profiles` a `authenticated` |

Son idempotentes: se pueden volver a ejecutar en orden sin romper nada.

## Decisión de diseño: `usuarios` del informe = `public.profiles`

El informe (sección 2.2) describe una tabla `usuarios`. **No se creó.** En su lugar
se extendió `public.profiles`, que ya existía y ya está cableada en el login de
las dos apps. Crear una segunda tabla de usuarios habría partido la identidad en
dos. El mapeo es:

| Informe | Implementación | Nota |
|---|---|---|
| `id` | `profiles.id` | FK a `auth.users.id` |
| `nombre` + `apellido` | `profiles.full_name` | Un solo campo, ya en uso |
| `email` | `profiles.email` | Único |
| `telefono` | `profiles.phone` | Único cuando no es nulo |
| `foto_url` | `profiles.foto_url` | Agregado en 01 |
| `es_admin` | `profiles.role` | Enum `user_role` de 4 valores, más expresivo que un booleano: distingue `admin` de `superadmin` |
| `activo` | `profiles.activo` | Agregado en 01 |
| `created_at` | `profiles.created_at` | |

## Reglas de negocio (sección 2.5) y dónde viven

| Regla | Implementación | Por qué |
|---|---|---|
| Un solo vehículo activo por conductor | Índice parcial único `vehiculos_un_activo_por_conductor` | El motor lo garantiza siempre; un trigger tiene carreras |
| `EN_CURSO` exige conductor y vehículo | CHECK `viajes_en_curso_requiere_asignacion` | Declarativo |
| `tarifa_final` solo al finalizar | CHECK `viajes_tarifa_final_solo_finalizado` | Declarativo |
| Solo se califica viaje propio y finalizado | Trigger `validar_calificacion()` + RLS | Necesita mirar otra tabla |
| Aislamiento por usuario | RLS en las 11 tablas | Sección 2.5 |

Extras no pedidos explícitamente pero implícitos en el informe:

- **Máquina de estados**: `validar_transicion_viaje()` solo permite las transiciones
  del diagrama 2.4. Bloquea saltos como `SOLICITADO → FINALIZADO`.
- **Vehículo coherente**: FK compuesta `(vehiculo_id, conductor_id)` — no se puede
  asignar a un viaje el vehículo de otro conductor.
- **Promedio automático**: `recalcular_calificacion_promedio()` mantiene
  `calificacion_promedio` en `pasajeros` y `conductores`.
- **Aprobación coherente**: un conductor no puede estar `disponible` sin estar
  `aprobado`; al perder la aprobación se le baja la disponibilidad.

## Módulo de viajes

Todo lo que decide algo vive en funciones de Postgres, no en las apps. El
cliente se puede manipular, así que no puede fijar el precio ni resolver quién
se queda con una solicitud.

| Función | Qué garantiza |
|---|---|
| `cotizar_viaje()` | El precio sale del tarifario y la distancia, en el servidor |
| `solicitar_viaje()` | Crea viaje y ubicaciones en una transacción; un viaje abierto por pasajero |
| `aceptar_viaje()` | `UPDATE` condicional: dos choferes no pueden tomar el mismo viaje |
| `avanzar_viaje()` | Solo el chofer asignado mueve el estado |
| `finalizar_viaje()` | Liquida la tarifa y deja el pago registrado |
| `cancelar_viaje()` | Pasajero o chofer, solo antes de arrancar |
| `reportar_posicion()` | Solo durante un viaje activo propio |

**Sin mapa ni geocodificación.** Convertir una dirección en coordenadas exigiría
un proveedor externo, descartado por decisión del proyecto. En su lugar el
destino se elige del catálogo `lugares` y el origen puede venir del GPS del
dispositivo. `distancia_km()` calcula la línea recta con Haversine y
`factor_trayecto_urbano()` (1.35) la ajusta a una trama de calles; ese factor es
el único punto a tocar si más adelante hay rutas reales.

## Verificación ejecutada

Ambas pruebas corrieron en una transacción revertida, sin dejar datos:

Bloqueos confirmados:
- Segundo vehículo activo del mismo conductor → rechazado
- `EN_CURSO` sin conductor/vehículo → rechazado
- Salto `SOLICITADO → FINALIZADO` → rechazado
- `tarifa_final` antes de finalizar → rechazado
- Calificar un viaje no finalizado → rechazado
- Segunda calificación del mismo evaluador → rechazada

Ciclo de viaje confirmado (transacción revertida, sin dejar datos):
- Cotización: 4.00 km → 10 min → $4.50
- Solicitud, con segunda solicitud simultánea rechazada
- **Dos choferes compitiendo por el mismo viaje: solo uno lo obtuvo**
- Avance por los tres estados y registro de posición GPS
- Un tercero no pudo avanzar un viaje ajeno
- Cierre con cobro registrado y vista `viajes_detalle` completa

Seguridad del módulo, con la clave publishable y sin sesión:
- No se leen `lugares` ni `viajes_detalle`
- No se ejecutan `solicitar_viaje`, `aceptar_viaje` ni `cotizar_viaje`
- Realtime conecta correctamente en `viajes`

Camino feliz confirmado:
- Ciclo completo de los 7 estados de la ruta feliz
- Origen + destino + pago + 2 calificaciones bidireccionales
- Promedio del conductor recalculado a 5.0
- Ruta alternativa `CANCELADO`

## Pendientes

1. **Storage**: faltan los buckets para `foto_url` y `documentos_conductor.url_archivo`.
2. **Protección de contraseñas filtradas** desactivada en Auth (aviso del linter).
3. **Expiración de solicitudes**: ningún proceso pasa un viaje a `SIN_CONDUCTOR`
   si nadie lo toma. El estado existe y la máquina lo permite, pero hace falta
   una tarea programada que lo aplique.

Ya resueltos: Realtime está habilitado en `viajes` y `ubicaciones` (migración 18).

Ya resueltos: los roles administrativos quedaron corregidos y las dos apps están
conectadas a Supabase. Ver [`../../docs/CONEXION_SUPABASE.md`](../../docs/CONEXION_SUPABASE.md).
