# WEB-RIDE

Aplicación web de Ride desarrollada con React, TypeScript, Vite y Supabase. En
el estado actual concentra el acceso por roles y las funciones administrativas
de consulta, revisión de conductores y monitoreo de viajes.

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

## Alcance actual

- Los paneles de pasajero y conductor muestran la cuenta, pero todavía no
  permiten solicitar o gestionar viajes desde la web.
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

Se requieren `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en el archivo
`.env` local.
