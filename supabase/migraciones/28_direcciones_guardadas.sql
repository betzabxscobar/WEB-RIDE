-- Direcciones de cada persona: recientes y favoritas.
--
-- Con geocodificacion mundial, public.lugares deja de ser la unica fuente de
-- destinos y pasa a ser un catalogo de sugerencias de la ciudad. Lo que de
-- verdad usa la gente son sus propias direcciones, y esas no caben en un
-- catalogo global: son de cada quien.
--
-- Guardarlas aqui ademas evita volver a consultar el geocodificador para los
-- destinos de siempre, que es la mayor parte de los viajes.

create table if not exists public.direcciones_guardadas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,

  -- Nombre corto que le pone la persona: "Casa", "Trabajo". Nulo en las
  -- recientes, que solo guardan la direccion tal como vino.
  etiqueta text check (etiqueta is null or length(trim(etiqueta)) between 1 and 40),

  direccion text not null,
  latitud float8 not null check (latitud between -90 and 90),
  longitud float8 not null check (longitud between -180 and 180),

  -- Una favorita se fija arriba; el resto es historial reciente.
  favorita boolean not null default false,

  usada_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- La misma direccion no se repite en el historial de una persona: se
-- reutiliza la fila y se actualiza `usada_en`.
create unique index if not exists direcciones_sin_repetir
  on public.direcciones_guardadas (usuario_id, latitud, longitud);

create index if not exists direcciones_recientes_idx
  on public.direcciones_guardadas (usuario_id, favorita desc, usada_en desc);

alter table public.direcciones_guardadas enable row level security;

drop policy if exists direcciones_propias on public.direcciones_guardadas;
create policy direcciones_propias on public.direcciones_guardadas for all to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

-- ---------------------------------------------------------------------------
-- Registrar el uso de una direccion
--
-- Se llama al pedir un viaje. Si ya existia, solo actualiza la fecha; si no, la
-- agrega. Asi el historial se ordena por uso real sin que nadie tenga que
-- guardar nada a mano.
-- ---------------------------------------------------------------------------
create or replace function public.recordar_direccion(
  p_direccion text, p_lat float8, p_lng float8, p_etiqueta text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion' using errcode = '28000';
  end if;
  if coalesce(trim(p_direccion), '') = '' then
    raise exception 'Falta la direccion' using errcode = 'check_violation';
  end if;

  insert into public.direcciones_guardadas
    (usuario_id, direccion, latitud, longitud, etiqueta, favorita)
  values
    (v_uid, trim(p_direccion), p_lat, p_lng,
     nullif(trim(coalesce(p_etiqueta, '')), ''),
     nullif(trim(coalesce(p_etiqueta, '')), '') is not null)
  on conflict (usuario_id, latitud, longitud) do update
    set usada_en = now(),
        direccion = excluded.direccion,
        -- Una etiqueta nueva la convierte en favorita; sin etiqueta se
        -- conserva lo que ya tuviera.
        etiqueta = coalesce(excluded.etiqueta, public.direcciones_guardadas.etiqueta),
        favorita = public.direcciones_guardadas.favorita or excluded.favorita
  returning id into v_id;

  return v_id;
end;
$$;

-- Limpia el historial dejando las favoritas y las ultimas usadas.
create or replace function public.limpiar_direcciones_viejas(p_conservar int default 10)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  delete from public.direcciones_guardadas d
  where d.usuario_id = v_uid
    and not d.favorita
    and d.id not in (
      select id from public.direcciones_guardadas
      where usuario_id = v_uid and not favorita
      order by usada_en desc
      limit p_conservar
    );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.recordar_direccion(text,float8,float8,text)',
    'public.limpiar_direcciones_viejas(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

comment on table public.direcciones_guardadas is
  'Direcciones recientes y favoritas de cada usuario. Complementa a public.lugares, que es el catalogo curado de la ciudad.';
