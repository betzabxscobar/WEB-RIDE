-- Las notificaciones las escribe la base, no las apps.
--
-- Si dependieran del cliente, el pasajero no se enteraria de que su viaje fue
-- aceptado mientras tuviera la app cerrada, y cada app tendria que reimplementar
-- las mismas reglas. Aqui salen de un trigger sobre el cambio de estado.

create or replace function public.crear_notificacion(
  p_usuario uuid, p_titulo text, p_mensaje text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notificaciones (usuario_id, titulo, mensaje)
  select p_usuario, p_titulo, p_mensaje
  where p_usuario is not null;
$$;

-- Nadie la llama desde fuera: solo la usan los triggers, que corren como
-- propietario. Dejarla abierta permitiria mandarle avisos falsos a cualquiera.
revoke execute on function public.crear_notificacion(uuid,text,text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Avisos del ciclo de viaje
-- ---------------------------------------------------------------------------
create or replace function public.notificar_cambio_viaje()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_destino text;
  v_conductor text;
begin
  if new.estado = old.estado then
    return new;
  end if;

  select direccion_texto into v_destino
  from public.ubicaciones
  where viaje_id = new.id and tipo = 'destino';
  v_destino := coalesce(v_destino, 'tu destino');

  select p.full_name into v_conductor
  from public.profiles p where p.id = new.conductor_id;
  v_conductor := coalesce(v_conductor, 'Tu chofer');

  case new.estado
    when 'ACEPTADO' then
      perform public.crear_notificacion(new.pasajero_id,
        'Chofer asignado',
        v_conductor || ' tomó tu viaje hacia ' || v_destino || '.');

    when 'CONDUCTOR_EN_CAMINO' then
      perform public.crear_notificacion(new.pasajero_id,
        'Tu chofer va en camino',
        v_conductor || ' se dirige a tu punto de recogida.');

    when 'CONDUCTOR_EN_ORIGEN' then
      perform public.crear_notificacion(new.pasajero_id,
        'Tu chofer llegó',
        v_conductor || ' te espera en el punto de encuentro.');

    when 'EN_CURSO' then
      perform public.crear_notificacion(new.pasajero_id,
        'Viaje iniciado',
        'Vas rumbo a ' || v_destino || '.');

    when 'FINALIZADO' then
      perform public.crear_notificacion(new.pasajero_id,
        'Viaje finalizado',
        'Llegaste a ' || v_destino || '. Total: $' ||
        to_char(coalesce(new.tarifa_final, new.tarifa_estimada), 'FM999990.00') || '.');
      perform public.crear_notificacion(new.conductor_id,
        'Viaje completado',
        'Cerraste el viaje hacia ' || v_destino || '.');

    when 'CANCELADO' then
      -- Avisa a ambas partes: cualquiera pudo cancelar.
      perform public.crear_notificacion(new.pasajero_id,
        'Viaje cancelado', 'Tu viaje hacia ' || v_destino || ' fue cancelado.');
      perform public.crear_notificacion(new.conductor_id,
        'Viaje cancelado', 'El viaje hacia ' || v_destino || ' fue cancelado.');

    when 'SIN_CONDUCTOR' then
      perform public.crear_notificacion(new.pasajero_id,
        'No encontramos chofer',
        'Nadie tomó tu viaje hacia ' || v_destino || '. Puedes volver a intentarlo.');

    else null;
  end case;

  return new;
end;
$$;

drop trigger if exists viajes_notificar on public.viajes;
create trigger viajes_notificar
  after update of estado on public.viajes
  for each row execute function public.notificar_cambio_viaje();

-- ---------------------------------------------------------------------------
-- Avisos de la revision de documentos y de la cuenta de chofer
-- ---------------------------------------------------------------------------
create or replace function public.notificar_revision_documento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = old.estado or new.estado = 'pendiente' then
    return new;
  end if;

  if new.estado = 'aprobado' then
    perform public.crear_notificacion(new.conductor_id,
      'Documento aprobado',
      'Tu ' || new.tipo_documento || ' fue aprobado.');
  else
    perform public.crear_notificacion(new.conductor_id,
      'Documento rechazado',
      'Tu ' || new.tipo_documento || ' fue rechazado. Vuelve a subirlo.');
  end if;

  return new;
end;
$$;

drop trigger if exists documentos_notificar on public.documentos_conductor;
create trigger documentos_notificar
  after update of estado on public.documentos_conductor
  for each row execute function public.notificar_revision_documento();

create or replace function public.notificar_revision_conductor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado_aprobacion = old.estado_aprobacion then
    return new;
  end if;

  if new.estado_aprobacion = 'aprobado' then
    perform public.crear_notificacion(new.id,
      'Cuenta de chofer aprobada',
      'Ya puedes ponerte en línea y recibir viajes.');
  elsif new.estado_aprobacion = 'rechazado' then
    perform public.crear_notificacion(new.id,
      'Cuenta de chofer rechazada',
      'Revisa tus documentos y vuelve a enviarlos.');
  end if;

  return new;
end;
$$;

drop trigger if exists conductores_notificar on public.conductores;
create trigger conductores_notificar
  after update of estado_aprobacion on public.conductores
  for each row execute function public.notificar_revision_conductor();

-- Marcar todo como leido de una vez.
create or replace function public.marcar_notificaciones_leidas()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion' using errcode = '28000';
  end if;
  update public.notificaciones set leida = true
   where usuario_id = v_uid and not leida;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.marcar_notificaciones_leidas() from public, anon;
grant execute on function public.marcar_notificaciones_leidas() to authenticated;

-- Realtime para que la campana se actualice sola.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'notificaciones'
  ) then
    alter publication supabase_realtime add table public.notificaciones;
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.notificar_cambio_viaje()',
    'public.notificar_revision_documento()',
    'public.notificar_revision_conductor()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
