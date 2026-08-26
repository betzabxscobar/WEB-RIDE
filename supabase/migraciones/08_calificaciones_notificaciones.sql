-- Seccion 2.2 - Reputacion bidireccional y centro de avisos.

create table if not exists public.calificaciones (
  id uuid primary key default gen_random_uuid(),
  viaje_id uuid not null references public.viajes(id) on delete cascade,
  calificador_id uuid not null references public.profiles(id) on delete cascade,
  calificado_id uuid not null references public.profiles(id) on delete cascade,
  puntuacion int not null check (puntuacion between 1 and 5),
  comentario text,
  fecha timestamptz not null default now(),

  constraint calificaciones_no_autocalificacion
    check (calificador_id <> calificado_id)
);

-- Documento 2.3: un viaje admite hasta 2 calificaciones, una por evaluador.
create unique index if not exists calificaciones_una_por_evaluador
  on public.calificaciones (viaje_id, calificador_id);

create index if not exists calificaciones_calificado_idx
  on public.calificaciones (calificado_id);

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  mensaje text not null,
  leida boolean not null default false,
  fecha timestamptz not null default now()
);

create index if not exists notificaciones_usuario_idx
  on public.notificaciones (usuario_id, fecha desc);

create index if not exists notificaciones_no_leidas_idx
  on public.notificaciones (usuario_id)
  where not leida;
