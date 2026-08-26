-- Seccion 2.1 decision B + 2.2 - Flota y documentacion legal.

create table if not exists public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.conductores(id) on delete cascade,
  placa text not null unique,
  marca text not null,
  modelo text not null,
  anio int not null check (anio between 1950 and extract(year from now())::int + 1),
  color text,
  activo boolean not null default false,
  created_at timestamptz not null default now()
);

-- Regla de negocio 2.5 #1: un solo vehiculo activo por conductor.
-- Se resuelve con indice parcial unico, no con trigger: lo garantiza el motor.
create unique index if not exists vehiculos_un_activo_por_conductor
  on public.vehiculos (conductor_id)
  where activo;

create index if not exists vehiculos_conductor_idx on public.vehiculos (conductor_id);

create table if not exists public.documentos_conductor (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references public.conductores(id) on delete cascade,
  tipo_documento text not null
    check (tipo_documento in ('licencia','SOAT','matricula')),
  url_archivo text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobado','rechazado')),
  fecha_subida timestamptz not null default now()
);

-- Un solo documento vigente por tipo y conductor: la recarga reemplaza.
create unique index if not exists documentos_conductor_tipo_unico
  on public.documentos_conductor (conductor_id, tipo_documento);

create index if not exists documentos_conductor_pendientes_idx
  on public.documentos_conductor (estado)
  where estado = 'pendiente';

comment on index public.vehiculos_un_activo_por_conductor is
  'Documento 2.5: unicidad de vehiculo en servicio.';
