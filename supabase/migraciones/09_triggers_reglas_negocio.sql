-- Seccion 2.5 - Reglas que no se pueden expresar como CHECK.
-- Las reglas #1 (vehiculo activo), #2 (asignacion en EN_CURSO) y #3 (tarifa_final)
-- ya quedaron garantizadas por indice parcial unico y constraints en 04 y 06.
--
-- NOTA: la version aplicada en Supabase el 2026-08-26 traia un cast invalido en
-- validar_transicion_viaje(); se corrigio en 12. Este archivo ya incluye la
-- correccion para que una reproduccion desde cero quede correcta.

-- ---------------------------------------------------------------------------
-- Maquina de estados del viaje (documento 2.4)
-- ---------------------------------------------------------------------------
create or replace function public.validar_transicion_viaje()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_permitidos public.enum_estado_viaje[];
begin
  if new.estado = old.estado then
    return new;
  end if;

  v_permitidos := case old.estado
    when 'SOLICITADO'          then array['BUSCANDO_CONDUCTOR','CANCELADO']::public.enum_estado_viaje[]
    when 'BUSCANDO_CONDUCTOR'  then array['ACEPTADO','SIN_CONDUCTOR','CANCELADO']::public.enum_estado_viaje[]
    when 'ACEPTADO'            then array['CONDUCTOR_EN_CAMINO','CANCELADO']::public.enum_estado_viaje[]
    when 'CONDUCTOR_EN_CAMINO' then array['CONDUCTOR_EN_ORIGEN','CANCELADO']::public.enum_estado_viaje[]
    when 'CONDUCTOR_EN_ORIGEN' then array['EN_CURSO','CANCELADO']::public.enum_estado_viaje[]
    when 'EN_CURSO'            then array['FINALIZADO']::public.enum_estado_viaje[]
    else array[]::public.enum_estado_viaje[]
  end;

  if not (new.estado = any (v_permitidos)) then
    raise exception 'Transicion de viaje no permitida: % -> %', old.estado, new.estado
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists viajes_validar_transicion on public.viajes;
create trigger viajes_validar_transicion
  before update of estado on public.viajes
  for each row execute function public.validar_transicion_viaje();

-- ---------------------------------------------------------------------------
-- Regla 2.5 #4 - Solo se califica un viaje propio y finalizado
-- ---------------------------------------------------------------------------
create or replace function public.validar_calificacion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_viaje record;
begin
  select v.estado, p.id as pasajero_uid, c.id as conductor_uid
    into v_viaje
  from public.viajes v
  join public.pasajeros p on p.id = v.pasajero_id
  left join public.conductores c on c.id = v.conductor_id
  where v.id = new.viaje_id;

  if v_viaje.estado <> 'FINALIZADO' then
    raise exception 'Solo se califican viajes en estado FINALIZADO'
      using errcode = 'check_violation';
  end if;

  -- El evaluador y el evaluado deben ser las dos partes de ese viaje.
  if not (
       (new.calificador_id = v_viaje.pasajero_uid  and new.calificado_id = v_viaje.conductor_uid)
    or (new.calificador_id = v_viaje.conductor_uid and new.calificado_id = v_viaje.pasajero_uid)
  ) then
    raise exception 'La calificacion no corresponde a los participantes del viaje'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists calificaciones_validar on public.calificaciones;
create trigger calificaciones_validar
  before insert or update on public.calificaciones
  for each row execute function public.validar_calificacion();

-- ---------------------------------------------------------------------------
-- Promedio de reputacion recalculado en cada evaluacion
-- ---------------------------------------------------------------------------
create or replace function public.recalcular_calificacion_promedio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_objetivo uuid := coalesce(new.calificado_id, old.calificado_id);
  v_promedio numeric(2,1);
begin
  select round(avg(puntuacion)::numeric, 1)
    into v_promedio
  from public.calificaciones
  where calificado_id = v_objetivo;

  update public.pasajeros   set calificacion_promedio = v_promedio where id = v_objetivo;
  update public.conductores set calificacion_promedio = v_promedio where id = v_objetivo;

  return null;
end;
$$;

drop trigger if exists calificaciones_recalcular_promedio on public.calificaciones;
create trigger calificaciones_recalcular_promedio
  after insert or update or delete on public.calificaciones
  for each row execute function public.recalcular_calificacion_promedio();

-- ---------------------------------------------------------------------------
-- Sello automatico de la fecha de aprobacion del conductor
-- ---------------------------------------------------------------------------
create or replace function public.sellar_aprobacion_conductor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado_aprobacion = 'aprobado' and new.fecha_aprobacion is null then
    new.fecha_aprobacion := now();
  elsif new.estado_aprobacion <> 'aprobado' then
    new.fecha_aprobacion := null;
    new.disponible := false;
  end if;
  return new;
end;
$$;

drop trigger if exists conductores_sellar_aprobacion on public.conductores;
create trigger conductores_sellar_aprobacion
  before insert or update of estado_aprobacion on public.conductores
  for each row execute function public.sellar_aprobacion_conductor();

revoke execute on function public.validar_transicion_viaje() from public, anon, authenticated;
revoke execute on function public.validar_calificacion() from public, anon, authenticated;
revoke execute on function public.recalcular_calificacion_promedio() from public, anon, authenticated;
revoke execute on function public.sellar_aprobacion_conductor() from public, anon, authenticated;
