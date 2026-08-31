# WEB-RIDE

Aplicación web de Ride desarrollada con React, TypeScript, Vite y Supabase. En
el estado actual concentra la solicitud de viajes para pasajeros, el acceso
por roles y las funciones administrativas de consulta, revisión de conductores
y monitoreo.

## Casos de uso implementados

Los siguientes flujos describen únicamente lo que está conectado en la versión
actual de `main`.

### CU-W01. Registrar una cuenta

**Actor:** pasajero o conductor.

1. El usuario selecciona **Crear cuenta**.
2. Elige si quiere viajar o conducir e ingresa nombre, teléfono, correo y contraseña.
3. El sistema crea la cuenta y solicita confirmar el correo cuando corresponde.
4. Una vez confirmada, el usuario puede iniciar sesión con el rol elegido.

**Resultado:** la cuenta y su perfil quedan registrados en Supabase. No se
permite crear cuentas administrativas desde el formulario público.

### CU-W02. Iniciar y cerrar sesión

**Actor:** usuario registrado.

1. El usuario ingresa su correo y contraseña.
2. El sistema valida las credenciales y carga el perfil asociado.
3. El sistema abre el panel permitido por el rol y conserva la sesión al recargar.
4. El usuario puede cerrar la sesión desde su panel.

**Resultado:** cada usuario accede solo a las vistas autorizadas para su rol.

### CU-W03. Recuperar la contraseña

**Actor:** usuario registrado.

1. El usuario selecciona **¿Olvidaste tu contraseña?** e ingresa su correo.
2. El sistema envía un enlace sin revelar si el correo existe.
3. El usuario abre el enlace y define una contraseña nueva.
4. El sistema actualiza la contraseña y permite continuar o volver al inicio de sesión.

**Resultado:** el usuario recupera el acceso sin intervención administrativa.

### CU-W04. Completar el primer acceso administrativo

**Actor:** administrador o superadministrador con contraseña temporal.

1. El usuario inicia sesión con las credenciales entregadas por el equipo.
2. El sistema bloquea el panel hasta que se cambie la contraseña temporal.
3. El usuario registra y confirma una contraseña personal.
4. El sistema habilita el panel administrativo.

**Resultado:** la cuenta administrativa deja de usar la contraseña inicial.

### CU-W05. Cambiar entre paneles autorizados

**Actor:** conductor, administrador o superadministrador.

1. El usuario abre el selector de panel.
2. El sistema muestra únicamente las vistas permitidas para su rol.
3. El usuario selecciona una vista y puede regresar a su panel original.

**Resultado:** cambia la interfaz mostrada, pero el rol y los permisos reales de
la cuenta no se modifican.

### CU-W06. Consultar usuarios registrados

**Actor:** administrador o superadministrador.

1. El usuario entra en **Resumen** o **Usuarios**.
2. El sistema consulta los perfiles visibles para su rol.
3. Muestra nombre, correo, rol, fecha de registro y métricas por tipo de cuenta.

**Resultado:** el administrador consulta usuarios; un administrador común no
recibe perfiles de superadministradores.

### CU-W07. Revisar y aprobar conductores

**Actor:** administrador o superadministrador.

1. El usuario entra en **Conductores** y abre una solicitud.
2. Revisa licencia, SOAT, matrícula y vehículos registrados.
3. Aprueba o rechaza cada documento.
4. El sistema solo habilita la aprobación del conductor cuando los tres
   documentos están aprobados y existe un vehículo registrado.

**Resultado:** el conductor queda aprobado o rechazado con las reglas validadas
por la base de datos.

### CU-W08. Monitorear viajes

**Actor:** administrador o superadministrador.

1. El usuario entra en **Viajes**.
2. El sistema muestra totales, viajes activos, finalizados y monto facturado.
3. El listado presenta ruta, participantes, vehículo, tarifa y estado.
4. Los datos se recargan cuando Supabase Realtime informa un cambio.

**Resultado:** el equipo administrativo puede supervisar el ciclo de viajes.

### CU-W09. Solicitar y seguir un viaje

**Actor:** pasajero autenticado.

1. El usuario entra en **Pedir viaje** y define el origen con la ubicación del
   navegador o una dirección guardada.
2. Selecciona un destino disponible y el sistema calcula distancia, tiempo y
   tarifa vigente en Supabase.
3. El usuario confirma el precio y el sistema crea una única solicitud activa.
4. El panel muestra el estado, la ruta, el conductor y el vehículo cuando son
   asignados, y se actualiza mediante Realtime.
5. Mientras el viaje no haya iniciado, el usuario puede cancelarlo.

**Resultado:** la solicitud comparte el mismo ciclo y las mismas reglas que
APPRIDE; el navegador nunca fija el precio ni altera el estado directamente.

### CU-W10. Consultar y calificar viajes propios

**Actor:** pasajero autenticado.

1. El usuario entra en **Mis viajes**.
2. El sistema consulta únicamente los viajes del pasajero y muestra ruta,
   fecha, estado y valor.
3. Si un viaje terminó y tuvo conductor, el usuario puede asignar de una a
   cinco estrellas y escribir un comentario.
4. Supabase impide calificar dos veces el mismo viaje.

**Resultado:** el historial y las calificaciones quedan compartidos entre la
web y la aplicación móvil.

### CU-W11. Seguir un viaje y recibir avisos

**Actor:** pasajero autenticado con un viaje activo.

1. El usuario abre **Ver seguimiento**.
2. La web muestra el estado, el recorrido, el conductor y el vehículo.
3. Si el conductor reporta su posición, el pasajero puede abrirla en el mapa.
4. Cada cambio de estado genera un aviso y actualiza la campana en tiempo real.
5. Al finalizar, la web ofrece calificar al conductor.

**Resultado:** el pasajero recibe en la web los mismos cambios reales que se
guardan para APPRIDE, sin inventar una posición cuando el conductor no la envía.

### CU-W12. Administrar direcciones propias

**Actor:** pasajero autenticado.

1. El usuario entra en **Direcciones** y permite usar su ubicación actual.
2. Escribe un nombre y una referencia comprensible para reconocer el lugar.
3. Puede marcar la dirección como favorita o eliminarla.
4. La dirección aparece como opción al definir el próximo viaje.

**Resultado:** las direcciones quedan asociadas a la cuenta y están protegidas
para que cada usuario solo pueda consultar o modificar las suyas.

### CU-W13. Consultar pagos

**Actor:** pasajero autenticado.

1. El usuario entra en **Pagos**.
2. Puede registrar efectivo y elegir su forma de pago principal.
3. Consulta los cobros y reembolsos registrados en sus propios viajes.
4. La web no permite escribir números de tarjeta; esa opción requiere una
   pasarela que entregue un token seguro.

**Resultado:** la gestión disponible es real y no expone datos bancarios ni
presenta una tarjeta simulada.

### CU-W14. Completar el perfil del conductor

**Actor:** conductor autenticado.

1. El conductor registra o edita sus vehículos y deja uno activo.
2. Sube licencia, SOAT y matrícula en imagen o PDF.
3. Consulta el estado de cada documento y puede reemplazar uno rechazado.
4. Los archivos se guardan en un bucket privado y se abren mediante enlaces temporales.

**Resultado:** la administración recibe la información necesaria para revisar
y aprobar al conductor sin exponer públicamente sus documentos.

### CU-W15. Ponerse disponible y recibir solicitudes

**Actor:** conductor aprobado con vehículo activo.

1. El conductor activa su jornada desde **Inicio**.
2. La web obtiene su ubicación y la reporta al ponerse en línea y cada minuto.
3. El sistema muestra solicitudes abiertas cercanas y las actualiza mediante Realtime.
4. El conductor acepta una solicitud; la base evita que dos conductores tomen el mismo viaje.

**Resultado:** el viaje queda asignado al conductor y desaparece de las demás ofertas.

### CU-W16. Ejecutar un viaje como conductor

**Actor:** conductor con un viaje asignado.

1. La web dibuja en el mapa la ruta por calles y muestra los datos del pasajero.
2. El conductor avanza por los estados **En camino**, **En el origen** y **En curso**.
3. Puede cancelar antes de iniciar o finalizar cuando termina el recorrido.
4. Al finalizar, el servidor liquida la tarifa y permite calificar al pasajero una sola vez.

**Resultado:** el ciclo completo queda registrado y se refleja en tiempo real para
el pasajero, la app móvil y la administración.

## Alcance actual

- El panel de pasajero permite cotizar, solicitar, seguir, cancelar, consultar
  y calificar viajes con datos reales. También administra avisos, direcciones
  guardadas, efectivo e historial de cobros.
- El origen y el destino pueden buscarse, elegirse en el mapa, tomarse del GPS
  o recuperarse de las direcciones guardadas y del catálogo activo.
- El panel de conductor permite gestionar vehículos y documentos, activar la
  disponibilidad, reportar la ubicación, aceptar solicitudes, completar el
  ciclo del viaje y calificar al pasajero.
- El panel administrativo muestra únicamente **Resumen**, **Usuarios**,
  **Conductores** y **Viajes**; los módulos que todavía no funcionan no se
  exponen en la navegación.
- Los mapas usan OpenStreetMap y las rutas por calles se obtienen con OSRM. El
  servidor público configurado por defecto es apropiado para desarrollo, no
  para una puesta en producción.
- La configuración de Supabase y el orden de sus migraciones están documentados
  en [`docs/CONEXION_SUPABASE.md`](docs/CONEXION_SUPABASE.md).

## Ejecución local

Requisitos: Node.js 20 o posterior y npm.

```sh
npm install
npm run dev
```

La aplicación usa por defecto el proyecto público de Ride. Para apuntar a otro
proyecto, copia `.env.example` como `.env` y cambia
`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.

También puede definirse `VITE_OSRM_URL` para usar un servidor de rutas propio:

```env
VITE_OSRM_URL=https://rutas.ejemplo.com
```

## Comandos disponibles

```sh
npm run dev       # servidor de desarrollo
npm run build     # comprobación de TypeScript y compilación de producción
npm run lint      # análisis estático
npm run preview   # vista previa de la compilación
```

Los scripts administrativos requieren variables de servidor y nunca deben usar
una clave `service_role` dentro de variables `VITE_*`. Consulta
[`docs/CONEXION_SUPABASE.md`](docs/CONEXION_SUPABASE.md) antes de provisionar
cuentas o aplicar migraciones.
