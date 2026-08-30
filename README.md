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
2. Selecciona un destino verificado y el sistema calcula distancia, tiempo y
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

## Alcance actual

- El panel de pasajero permite cotizar, solicitar, seguir, cancelar, consultar
  y calificar viajes con datos reales. Los puntos disponibles provienen de las
  direcciones guardadas del usuario y del catálogo activo administrado.
- El panel de conductor todavía no permite aceptar ni gestionar viajes desde
  la web; esas operaciones siguen disponibles en APPRIDE.
- El panel administrativo muestra únicamente **Resumen**, **Usuarios**,
  **Conductores** y **Viajes**; los módulos que todavía no funcionan no se
  exponen en la navegación.
- La configuración de Supabase y el orden de sus migraciones están documentados
  en [`docs/CONEXION_SUPABASE.md`](docs/CONEXION_SUPABASE.md).

## Ejecución local

```sh
npm install
npm run dev
```

La aplicación usa por defecto el proyecto público de Ride. Para apuntar a otro
proyecto, copia `.env.example` como `.env` y cambia
`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
