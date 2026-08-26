-- Realtime: las apps se suscriben a los cambios en vez de preguntar cada
-- pocos segundos. RLS sigue mandando — Supabase solo emite a quien tendria
-- permiso de leer esa fila.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'viajes'
  ) then
    alter publication supabase_realtime add table public.viajes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ubicaciones'
  ) then
    alter publication supabase_realtime add table public.ubicaciones;
  end if;
end $$;

-- Para que el UPDATE de Realtime traiga la fila anterior y el cliente pueda
-- comparar estados sin volver a consultar.
alter table public.viajes replica identity full;

-- ---------------------------------------------------------------------------
-- Vista con todo lo que una pantalla de viaje necesita
--
-- Evita que cada app arme el mismo JOIN de seis tablas. Hereda la seguridad de
-- las tablas base: `security_invoker` hace que RLS se evalue con el usuario que
-- consulta, no con el dueno de la vista.
-- ---------------------------------------------------------------------------
create or replace view public.viajes_detalle
with (security_invoker = true) as
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
  t.nombre                as tarifa_nombre,
  pp.full_name            as pasajero_nombre,
  pp.phone                as pasajero_telefono,
  pc.full_name            as conductor_nombre,
  pc.phone                as conductor_telefono,
  c.calificacion_promedio as conductor_calificacion,
  ve.placa                as vehiculo_placa,
  ve.marca                as vehiculo_marca,
  ve.modelo               as vehiculo_modelo,
  ve.color                as vehiculo_color,
  o.latitud               as origen_lat,
  o.longitud              as origen_lng,
  o.direccion_texto       as origen_texto,
  d.latitud               as destino_lat,
  d.longitud              as destino_lng,
  d.direccion_texto       as destino_texto
from public.viajes v
join public.tarifas t         on t.id = v.tarifa_id
join public.profiles pp       on pp.id = v.pasajero_id
left join public.profiles pc  on pc.id = v.conductor_id
left join public.conductores c on c.id = v.conductor_id
left join public.vehiculos ve on ve.id = v.vehiculo_id
left join public.ubicaciones o on o.viaje_id = v.id and o.tipo = 'origen'
left join public.ubicaciones d on d.viaje_id = v.id and d.tipo = 'destino';

grant select on public.viajes_detalle to authenticated;
revoke all on public.viajes_detalle from anon;

comment on view public.viajes_detalle is
  'Datos de un viaje ya combinados. RLS se evalua con el usuario que consulta.';
