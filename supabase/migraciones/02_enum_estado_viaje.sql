-- Seccion 2.4 - Ciclo de vida del viaje.
-- ENUM nativo en lugar de tabla catalogo: conjunto cerrado y evita JOINs
-- repetitivos en el camino caliente de consulta de viajes.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'enum_estado_viaje' and n.nspname = 'public'
  ) then
    create type public.enum_estado_viaje as enum (
      'SOLICITADO',
      'BUSCANDO_CONDUCTOR',
      'ACEPTADO',
      'CONDUCTOR_EN_CAMINO',
      'CONDUCTOR_EN_ORIGEN',
      'EN_CURSO',
      'FINALIZADO',
      'CANCELADO',
      'SIN_CONDUCTOR'
    );
  end if;
end
$$;

comment on type public.enum_estado_viaje is
  'Documento 2.4: 7 estados de la ruta feliz mas CANCELADO y SIN_CONDUCTOR.';
