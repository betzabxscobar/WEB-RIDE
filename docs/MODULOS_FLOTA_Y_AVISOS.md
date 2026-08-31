# Flota, geolocalización, notificaciones y pagos

Cuatro módulos del informe, construidos sobre el motor de viajes.

## Por qué PostGIS y no H3

Se evaluó H3, la rejilla hexagonal de Uber. **No es una API** —es una librería
Apache 2.0, sin claves ni cuotas— pero **no está entre las 78 extensiones
disponibles en Supabase**. Usarla obligaría a correrla en el cliente y repartir
la lógica de vecindad entre Flutter y React.

PostGIS sí está disponible y resuelve la búsqueda por radio dentro de la base,
que es donde viven el resto de las decisiones del proyecto.

H3 sigue teniendo sentido más adelante para **agrupar por zonas** (tarifa por
sector, mapas de calor de demanda). Son problemas distintos y no se estorban.

## Geolocalización

| Pieza | Qué hace |
|---|---|
| `conductores.ultima_posicion` | Punto geográfico con índice GIST |
| `reportar_posicion()` | Actualiza la posición y, si hay viaje, deja el rastro |
| `conductores_cercanos()` | Choferes libres dentro de un radio, por distancia |
| `viaje_esta_cerca_de_mi()` | Filtra qué solicitudes ve cada chofer |

La posición se guarda **desnormalizada** en `conductores` en vez de deducirse de
`ubicaciones`: la búsqueda corre en cada solicitud y no puede recorrer el
historial GPS completo.

**Una posición caduca a los 10 minutos.** Un chofer que dejó de reportar
probablemente cerró la app, y no tiene sentido ofrecerle viajes. Por eso la app
móvil reporta cada minuto mientras está en línea: sin ese latido, se pondría
«en línea» y no le llegaría nada.

El radio por defecto es 5 km (`radio_busqueda_km()`).

Probado con un chofer en el aeropuerto de Guayaquil y otro en Quito: el de Quito
ve 0 solicitudes, y **tampoco puede aceptar aunque conozca el id del viaje** —
la política filtra lo que se ve, pero `aceptar_viaje()` además lo valida.

## Conductores y vehículos

Antes un conductor solo existía si alguien lo insertaba a mano en la base.

| Función | Regla que impone |
|---|---|
| `registrar_vehiculo()` | Placa única; el primer auto queda en servicio solo |
| `activar_vehiculo()` | Uno solo en servicio; no se cambia con viaje en curso |
| `registrar_documento()` | Cada carga vuelve el documento a «pendiente» |
| `revisar_documento()` | Solo administración |
| `revisar_conductor()` | Solo administración, y exige 3 documentos aprobados + 1 vehículo |

**Dos candados sobre la aprobación**: el chofer no puede auto-aprobarse, y el
admin no puede aprobarlo sin los requisitos. Aprobar sin eso dejaría circular a
alguien sin licencia ni matrícula.

Que cada carga devuelva el documento a «pendiente» tampoco es un detalle: si se
pudiera reemplazar el archivo conservando el sello de aprobado, la revisión no
serviría de nada.

## Notificaciones

**Las escribe la base, no las apps.** Triggers sobre `viajes`,
`documentos_conductor` y `conductores`.

Si dependieran del cliente, el pasajero no se enteraría de que su viaje fue
aceptado mientras tuviera la app cerrada, y cada app tendría que reimplementar
las mismas reglas.

`crear_notificacion()` está revocada para todos: solo la usan los triggers, que
corren como propietario. Dejarla abierta permitiría mandarle avisos falsos a
cualquiera.

## Pagos y tarifario

`registrar_metodo_pago()` acepta efectivo o tarjeta. Para tarjeta guarda el
**token de la pasarela**, nunca el número — y **rechaza explícitamente cualquier
valor con forma de PAN** (13-19 dígitos seguidos). La app móvil ni siquiera
tiene formulario donde escribirlo.

`tarifa_vigente()` elige la tarifa por franja horaria **en hora de Guayaquil, no
en UTC**: con la hora del servidor, la tarifa nocturna caería a media tarde.

| Tarifa | Franja |
|---|---|
| Hora Pico | 06:00 – 09:00 |
| Nocturna | 22:00 – 05:00 |
| Estándar | El resto |

## Storage

Dos buckets con criterios distintos:

- **`documentos`** — privado, 5 MB. Licencias y matrículas son datos personales.
  Se leen con URL firmada que caduca en una hora.
- **`avatares`** — público, 2 MB. Si fueran privadas habría que firmar una URL
  en cada render.

La ruta siempre empieza por el id del usuario (`<uid>/licencia.jpg`), y la
política compara ese primer segmento con `auth.uid()`. Es lo que impide escribir
en la carpeta de otro.

## Pantallas

**Flutter**
- `screens/driver/` — vehículo y documentos, con cámara o galería
- `screens/notifications/` — lista y campana con contador
- `screens/payments/` — métodos de pago

**React**
- `DriversPanel.tsx` — revisión de documentos y aprobación
- `PassengerDashboard.tsx` — campana, lista de avisos, direcciones y pagos
- `lib/notifications.ts` — lectura y suscripción Realtime
- `lib/addresses.ts` — direcciones propias protegidas por RLS
- `lib/payments.ts` — efectivo, método principal e historial

El botón de aprobar no solo se deshabilita: **dice qué falta** («Licencia sin
aprobar · Sin vehículo registrado»).

## Pendientes

1. **Expiración de solicitudes** a `SIN_CONDUCTOR`. `pg_cron` está disponible.
2. **Tarifa por zona.** Hoy solo varía por horario. Aquí entraría H3.
3. **Foto de perfil.** El bucket `avatares` existe pero ninguna pantalla lo usa.
4. **Deep links.** Sin ellos el chofer no recibe avisos con la app cerrada.
5. **Pasarela de pagos.** Sin ella todo cobro con tarjeta queda `pendiente`.
