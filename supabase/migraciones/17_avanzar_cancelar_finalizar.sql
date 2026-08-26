-- Resto del ciclo de vida. Cada funcion comprueba quien llama: el trigger
-- validar_transicion_viaje() ya impide saltos invalidos, pero no sabe si quien
-- pide el cambio es el conductor asignado o un desconocido.

-- ---------------------------------------------------------------------------
-- Avanzar al siguiente estado (solo el conductor asignado)
-- ---------------------------------------------------------------------------
create or replace function public.avanzar_viaje(p_viaje_id uuid)
returns public.enum_estado_viaje
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_actual public.enum_estado_viaje;
  v_siguiente public.enum_estado_viaje;
begin
  select estado into v_actual
  from public.viajes
  where id = p_viaje_id and conductor_id = v_uid;

  if v_actual is null then
    raise exception 'Ese viaje no es tuyo' using errcode = '42501';
  end if;

  v_siguiente := case v_actual
    when 'ACEPTADO'            then 'CONDUCTOR_EN_CAMINO'
    when 'CONDUCTOR_EN_CAMINO' then 'CONDUCTOR_EN_ORIGEN'
    when 'CONDUCTOR_EN_ORIGEN' then 'EN_CURSO'
    else null
  end::public.enum_estado_viaje;

  if v_siguiente is null then
    raise exception 'El viaje no puede avanzar desde %', v_actual
      using errcode = 'check_violation';
  end if;

  -- EN_CURSO exige fecha de inicio: lo pide el CHECK de la tabla.
  if v_siguiente = 'EN_CURSO' then
    update public.viajes set estado = v_siguiente, fecha_inicio = now()
    where id = p_viaje_id;
  else
    update public.viajes set estado = v_siguiente where id = p_viaje_id;
  end if;

  return v_siguiente;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finalizar: liquida la tarifa y deja el cobro registrado
-- ---------------------------------------------------------------------------
create or replace function public.finalizar_viaje(p_viaje_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_estimada numeric;
  v_metodo uuid;
  v_pasajero uuid;
begin
  select tarifa_estimada, pasajero_id into v_estimada, v_pasajero
  from public.viajes
  where id = p_viaje_id and conductor_id = v_uid and estado = 'EN_CURSO';

  if v_estimada is null then
    raise exception 'Solo el conductor puede cerrar un viaje en curso'
      using errcode = '42501';
  end if;

  -- Sin medicion real del recorrido, el cierre toma la cotizacion. Cuando haya
  -- seguimiento GPS continuo se puede recalcular sobre la distancia recorrida.
  update public.viajes
  set estado = 'FINALIZADO', fecha_fin = now(), tarifa_final = v_estimada
  where id = p_viaje_id;

  select id into v_metodo
  from public.metodos_pago
  where pasajero_id = v_pasajero and predeterminado
  limit 1;

  insert into public.pagos (viaje_id, metodo_pago_id, monto, tipo, estado)
  values (p_viaje_id, v_metodo, v_estimada, 'pago',
          case when v_metodo is null then 'pendiente' else 'completado' end);

  return v_estimada;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar: pasajero o conductor, mientras no haya arrancado
-- ---------------------------------------------------------------------------
create or replace function public.cancelar_viaje(p_viaje_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_actual public.enum_estado_viaje;
begin
  select estado into v_actual
  from public.viajes
  where id = p_viaje_id and v_uid in (pasajero_id, conductor_id);

  if v_actual is null then
    raise exception 'Ese viaje no es tuyo' using errcode = '42501';
  end if;

  if v_actual in ('EN_CURSO', 'FINALIZADO', 'CANCELADO', 'SIN_CONDUCTOR') then
    raise exception 'Este viaje ya no se puede cancelar'
      using errcode = 'check_violation';
  end if;

  update public.viajes set estado = 'CANCELADO' where id = p_viaje_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Posicion del conductor durante el trayecto
-- ---------------------------------------------------------------------------
create or replace function public.reportar_posicion(
  p_viaje_id uuid, p_lat float8, p_lng float8
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if not exists (
    select 1 from public.viajes
    where id = p_viaje_id
      and conductor_id = v_uid
      and estado in ('ACEPTADO','CONDUCTOR_EN_CAMINO','CONDUCTOR_EN_ORIGEN','EN_CURSO')
  ) then
    raise exception 'Ese viaje no esta activo para ti' using errcode = '42501';
  end if;

  insert into public.ubicaciones (viaje_id, tipo, latitud, longitud)
  values (p_viaje_id, 'posicion_actual', p_lat, p_lng);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.avanzar_viaje(uuid)',
    'public.finalizar_viaje(uuid)',
    'public.cancelar_viaje(uuid)',
    'public.reportar_posicion(uuid,float8,float8)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
