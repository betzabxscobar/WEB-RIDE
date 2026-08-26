-- Seccion 2.1 decision A + 2.2 - Extensiones 1:1 OPCIONALES de profiles.
-- No son roles excluyentes: una misma persona puede tener fila en ambas.

create table if not exists public.pasajeros (
  id uuid primary key references public.profiles(id) on delete cascade,
  calificacion_promedio numeric(2,1)
    check (calificacion_promedio is null
           or (calificacion_promedio >= 1.0 and calificacion_promedio <= 5.0)),
  created_at timestamptz not null default now()
);

create table if not exists public.conductores (
  id uuid primary key references public.profiles(id) on delete cascade,
  estado_aprobacion text not null default 'pendiente'
    check (estado_aprobacion in ('pendiente','aprobado','rechazado')),
  disponible boolean not null default false,
  calificacion_promedio numeric(2,1)
    check (calificacion_promedio is null
           or (calificacion_promedio >= 1.0 and calificacion_promedio <= 5.0)),
  fecha_aprobacion timestamptz,
  created_at timestamptz not null default now()
);

-- Un conductor solo puede estar disponible si la administracion ya lo aprobo.
alter table public.conductores
  drop constraint if exists conductores_disponible_requiere_aprobacion;
alter table public.conductores
  add constraint conductores_disponible_requiere_aprobacion
  check (disponible = false or estado_aprobacion = 'aprobado');

-- La fecha de aprobacion y el estado no pueden contradecirse.
alter table public.conductores
  drop constraint if exists conductores_fecha_aprobacion_coherente;
alter table public.conductores
  add constraint conductores_fecha_aprobacion_coherente
  check ((estado_aprobacion = 'aprobado') = (fecha_aprobacion is not null));

-- Indice para la busqueda de conductores del motor de viajes (paso 5 del flujo 1.5).
create index if not exists conductores_disponibles_idx
  on public.conductores (disponible)
  where disponible and estado_aprobacion = 'aprobado';

create index if not exists conductores_estado_aprobacion_idx
  on public.conductores (estado_aprobacion);

comment on table public.pasajeros is 'Documento 2.2: extension 1:1 opcional de profiles (usuarios).';
comment on table public.conductores is 'Documento 2.2: extension 1:1 opcional de profiles (usuarios).';
