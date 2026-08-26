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

## Verificación ejecutada

Ambas pruebas corrieron en una transacción revertida, sin dejar datos:

Bloqueos confirmados:
- Segundo vehículo activo del mismo conductor → rechazado
- `EN_CURSO` sin conductor/vehículo → rechazado
- Salto `SOLICITADO → FINALIZADO` → rechazado
- `tarifa_final` antes de finalizar → rechazado
- Calificar un viaje no finalizado → rechazado
- Segunda calificación del mismo evaluador → rechazada

Camino feliz confirmado:
- Ciclo completo de los 7 estados de la ruta feliz
- Origen + destino + pago + 2 calificaciones bidireccionales
- Promedio del conductor recalculado a 5.0
- Ruta alternativa `CANCELADO`

## Pendientes

1. **Tres cuentas administrativas tienen el rol equivocado.** En `profiles`,
   `alexyanez1119@gmail.com`, `mayuriremache0@gmail.com` y
   `javierconforme18@gmail.com` figuran como `passenger`; según
   `docs/CONEXION_SUPABASE.md` deben ser `admin`. Corregir antes de probar el panel.
2. **Ninguna app está conectada todavía.** No existe `.env`, `server.mjs` sigue
   sirviendo auth en memoria y `AuthService` de Flutter también. Esa es la
   siguiente etapa.
3. **Storage**: faltan los buckets para `foto_url` y `documentos_conductor.url_archivo`.
4. **Realtime**: falta habilitar la publicación en `viajes` y `ubicaciones` para
   el seguimiento GPS en vivo.
5. **Protección de contraseñas filtradas** desactivada en Auth (aviso del linter).
