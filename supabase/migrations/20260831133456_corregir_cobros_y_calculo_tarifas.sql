-- Corrige tres inconsistencias relacionadas:
-- 1. Un viaje finalizado siempre debe tener conductor, vehiculo e inicio real.
-- 2. El panel administrativo distingue una tarifa estimada de dinero cobrado.
-- 3. La cotizacion usa la tarifa vigente decidida por el servidor y no cobra
--    todos los minutos de circulacion como si fueran minutos de espera.

-- Los datos actuales cumplen esta regla. La restriccion evita que una carga
-- manual o una futura RPC vuelva a fabricar viajes finalizados sin chofer.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'viajes_finalizado_exige_asignacion_completa'
      and conrelid = 'public.viajes'::regclass
  ) then
    alter table public.viajes
      add constraint viajes_finalizado_exige_asignacion_completa check (
        estado <> 'FINALIZADO'
        or (
          conductor_id is not null
          and vehiculo_id is not null
          and fecha_inicio is not null
          and fecha_fin is not null
          and tarifa_final is not null
        )
      );
  end if;
end
$$;

-- La vista expone el cobro neto confirmado. Una tarifa_final no es dinero
-- recibido: efectivo sin confirmar y pagos pendientes valen cero hasta que la
-- fila de pagos pase a completado.
create or replace view public.viajes_detalle
with (security_invoker = true)
as
select
  v.id,
  v.estado,
  v.pasajero_id,
  v.conductor_id,
  v.vehiculo_id,
  v.tarifa_estimada,
  v.tarifa_final,
  v.fecha_solicitud,
  v.fecha_inicio,
  v.fecha_fin,
  t.nombre as tarifa_nombre,
  pp.full_name as pasajero_nombre,
  pp.phone as pasajero_telefono,
  case
    when v.conductor_id is null then null
    else coalesce(nullif(trim(pc.full_name), ''), pc.email, 'Conductor asignado')
  end as conductor_nombre,
  pc.phone as conductor_telefono,
  c.calificacion_promedio as conductor_calificacion,
  ve.placa as vehiculo_placa,
  ve.marca as vehiculo_marca,
  ve.modelo as vehiculo_modelo,
  ve.color as vehiculo_color,
  o.latitud as origen_lat,
  o.longitud as origen_lng,
  o.direccion_texto as origen_texto,
  d.latitud as destino_lat,
  d.longitud as destino_lng,
  d.direccion_texto as destino_texto,
  coalesce(cobro.monto_cobrado, 0::numeric) as monto_cobrado,
  cobro.estado as pago_estado
from public.viajes v
join public.tarifas t on t.id = v.tarifa_id
join public.profiles pp on pp.id = v.pasajero_id
left join public.profiles pc on pc.id = v.conductor_id
left join public.conductores c on c.id = v.conductor_id
left join public.vehiculos ve on ve.id = v.vehiculo_id
left join public.ubicaciones o on o.viaje_id = v.id and o.tipo = 'origen'
left join public.ubicaciones d on d.viaje_id = v.id and d.tipo = 'destino'
left join lateral (
  select
    sum(
      case
        when p.estado = 'completado' and p.tipo in ('pago', 'reintento') then p.monto
        when p.estado = 'completado' and p.tipo = 'reembolso' then -p.monto
        else 0
      end
    ) as monto_cobrado,
    case
      when bool_or(p.estado = 'completado' and p.tipo in ('pago', 'reintento')) then 'completado'
      when bool_or(p.estado = 'pendiente') then 'pendiente'
      when count(*) > 0 then 'fallido'
      else null
    end as estado
  from public.pagos p
  where p.viaje_id = v.id
) cobro on true;

comment on column public.viajes_detalle.monto_cobrado is
  'Pagos completados menos reembolsos completados. No incluye tarifas estimadas ni pagos pendientes.';

grant select on public.viajes_detalle to authenticated;
revoke all on public.viajes_detalle from anon;

-- `p_tarifa_id` se conserva para no romper clientes instalados, pero ya no se
-- confia en el valor: la franja horaria la decide siempre Postgres.
create or replace function public.cotizar_viaje(
  p_origen_lat float8,
  p_origen_lng float8,
  p_destino_lat float8,
  p_destino_lng float8,
  p_distancia_km numeric default null,
  p_tarifa_id uuid default null
)
returns table (
  tarifa_id uuid,
  tarifa_nombre text,
  distancia_km numeric,
  minutos_estimados int,
  total numeric,
  gana_conductor numeric,
  comision_app numeric,
  aplico_minima boolean
)
language sql
stable
set search_path = ''
as $$
  with elegida as (
    select coalesce(
      public.tarifa_vigente(),
      (select id
       from public.tarifas
       where activo and hora_desde is null
       order by tarifa_base
       limit 1)
    ) as id
  ),
  t as (
    select tar.*
    from public.tarifas tar, elegida
    where tar.id = elegida.id and tar.activo
  ),
  recta as (
    select public.distancia_km(
      p_origen_lat, p_origen_lng, p_destino_lat, p_destino_lng
    ) as km
  ),
  d as (
    select case
      when p_distancia_km is not null
       and recta.km > 0
       and p_distancia_km >= recta.km::numeric
       and p_distancia_km <= (recta.km * 2.5)::numeric
      then p_distancia_km
      else (recta.km * public.factor_trayecto_urbano())::numeric
    end as km
    from recta
  ),
  calculo as (
    select
      t.id,
      t.nombre,
      d.km,
      greatest(1, ceil(d.km / public.velocidad_media_kmh() * 60))::int as mins,
      t.carrera_minima,
      t.porcentaje_conductor,
      -- costo_por_minuto representa espera. La cotizacion no conoce minutos
      -- detenido y por eso no puede cobrar todo el tiempo de circulacion.
      round((t.tarifa_base + t.costo_por_km * d.km)::numeric, 2) as bruto
    from t, d
  ),
  final as (
    select c.*, greatest(c.bruto, c.carrera_minima) as cobro
    from calculo c
  )
  select
    f.id,
    f.nombre,
    round(f.km::numeric, 2),
    f.mins,
    f.cobro,
    round(f.cobro * f.porcentaje_conductor, 2),
    f.cobro - round(f.cobro * f.porcentaje_conductor, 2),
    f.cobro > f.bruto
  from final f;
$$;

-- Al crear el viaje se vuelve a cotizar con la tarifa vigente. El id y el
-- total reenviados por un navegador o APK nunca fijan el precio definitivo.
create or replace function public.solicitar_viaje(
  p_origen_lat float8,
  p_origen_lng float8,
  p_origen_texto text,
  p_destino_lat float8,
  p_destino_lng float8,
  p_destino_texto text,
  p_tarifa_id uuid default null,
  p_origen_celda_h3_7 text default null,
  p_celdas_difusion text[] default null,
  p_distancia_km numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tarifa uuid;
  v_total numeric;
  v_viaje uuid;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesion' using errcode = '28000';
  end if;

  insert into public.pasajeros (id) values (v_uid) on conflict do nothing;

  if exists (
    select 1
    from public.viajes
    where pasajero_id = v_uid
      and estado not in ('FINALIZADO', 'CANCELADO', 'SIN_CONDUCTOR')
  ) then
    raise exception 'Ya tienes un viaje en curso' using errcode = 'check_violation';
  end if;

  v_tarifa := coalesce(
    public.tarifa_vigente(),
    (select id
     from public.tarifas
     where activo and hora_desde is null
     order by tarifa_base
     limit 1)
  );

  if v_tarifa is null then
    raise exception 'No hay tarifas disponibles' using errcode = 'check_violation';
  end if;

  select c.total
  into v_total
  from public.cotizar_viaje(
    p_origen_lat,
    p_origen_lng,
    p_destino_lat,
    p_destino_lng,
    p_distancia_km,
    null
  ) c;

  if v_total is null then
    raise exception 'No se pudo cotizar el viaje' using errcode = 'check_violation';
  end if;

  insert into public.viajes (
    pasajero_id,
    tarifa_id,
    estado,
    tarifa_estimada,
    origen_celda_h3_7,
    celdas_difusion
  ) values (
    v_uid,
    v_tarifa,
    'SOLICITADO',
    v_total,
    p_origen_celda_h3_7,
    p_celdas_difusion
  )
  returning id into v_viaje;

  insert into public.ubicaciones (
    viaje_id, tipo, latitud, longitud, direccion_texto
  ) values
    (v_viaje, 'origen', p_origen_lat, p_origen_lng, p_origen_texto),
    (v_viaje, 'destino', p_destino_lat, p_destino_lng, p_destino_texto);

  update public.viajes
  set estado = 'BUSCANDO_CONDUCTOR'
  where id = v_viaje;

  return v_viaje;
end;
$$;

revoke execute on function public.cotizar_viaje(float8,float8,float8,float8,numeric,uuid) from public, anon;
grant execute on function public.cotizar_viaje(float8,float8,float8,float8,numeric,uuid) to authenticated;

revoke execute on function public.solicitar_viaje(float8,float8,text,float8,float8,text,uuid,text,text[],numeric) from public, anon;
grant execute on function public.solicitar_viaje(float8,float8,text,float8,float8,text,uuid,text,text[],numeric) to authenticated;
