-- Seccion 2.2 - Entidad central del sistema y su rastro GPS.

-- Necesario para la FK compuesta: el vehiculo asignado debe ser del conductor asignado.
alter table public.vehiculos
  drop constraint if exists vehiculos_id_conductor_key;
alter table public.vehiculos
  add constraint vehiculos_id_conductor_key unique (id, conductor_id);

create table if not exists public.viajes (
  id uuid primary key default gen_random_uuid(),
  pasajero_id uuid not null references public.pasajeros(id) on delete restrict,
  conductor_id uuid references public.conductores(id) on delete restrict,
  vehiculo_id uuid references public.vehiculos(id) on delete restrict,
  tarifa_id uuid not null references public.tarifas(id) on delete restrict,
  estado public.enum_estado_viaje not null default 'SOLICITADO',
  tarifa_estimada numeric(10,2) not null check (tarifa_estimada >= 0),
  tarifa_final numeric(10,2) check (tarifa_final >= 0),
  fecha_solicitud timestamptz not null default now(),
  fecha_inicio timestamptz,
  fecha_fin timestamptz,

  -- El vehiculo asignado pertenece al conductor asignado.
  constraint viajes_vehiculo_del_conductor
    foreign key (vehiculo_id, conductor_id)
    references public.vehiculos (id, conductor_id),

  -- Regla 2.5 #2: de EN_CURSO en adelante exige conductor y vehiculo.
  constraint viajes_en_curso_requiere_asignacion check (
    estado not in ('EN_CURSO','FINALIZADO')
    or (conductor_id is not null and vehiculo_id is not null)
  ),

  -- Regla 2.5 #3: tarifa_final solo se liquida al finalizar.
  constraint viajes_tarifa_final_solo_finalizado check (
    tarifa_final is null or estado = 'FINALIZADO'
  ),
  constraint viajes_finalizado_exige_tarifa_final check (
    estado <> 'FINALIZADO' or tarifa_final is not null
  ),

  -- Coherencia de la linea de tiempo.
  constraint viajes_fechas_coherentes check (
    (fecha_inicio is null or fecha_inicio >= fecha_solicitud)
    and (fecha_fin is null or (fecha_inicio is not null and fecha_fin >= fecha_inicio))
  ),
  constraint viajes_en_curso_exige_fecha_inicio check (
    estado not in ('EN_CURSO','FINALIZADO') or fecha_inicio is not null
  ),
  constraint viajes_finalizado_exige_fecha_fin check (
    estado <> 'FINALIZADO' or fecha_fin is not null
  )
);

create index if not exists viajes_pasajero_idx on public.viajes (pasajero_id, fecha_solicitud desc);
create index if not exists viajes_conductor_idx on public.viajes (conductor_id, fecha_solicitud desc);
create index if not exists viajes_estado_idx on public.viajes (estado);

-- Viajes abiertos: lo que consulta el panel de monitoreo y el motor de asignacion.
create index if not exists viajes_activos_idx
  on public.viajes (estado, fecha_solicitud desc)
  where estado not in ('FINALIZADO','CANCELADO','SIN_CONDUCTOR');

create table if not exists public.ubicaciones (
  id uuid primary key default gen_random_uuid(),
  viaje_id uuid not null references public.viajes(id) on delete cascade,
  tipo text not null check (tipo in ('origen','destino','posicion_actual')),
  latitud float8 not null check (latitud between -90 and 90),
  longitud float8 not null check (longitud between -180 and 180),
  direccion_texto text,
  registrado_en timestamptz not null default now()
);

-- Origen y destino son unicos por viaje; posicion_actual se acumula para el tracking.
create unique index if not exists ubicaciones_origen_destino_unico
  on public.ubicaciones (viaje_id, tipo)
  where tipo in ('origen','destino');

create index if not exists ubicaciones_tracking_idx
  on public.ubicaciones (viaje_id, registrado_en desc)
  where tipo = 'posicion_actual';

comment on table public.viajes is 'Documento 2.2: entidad central. Estados en public.enum_estado_viaje.';
