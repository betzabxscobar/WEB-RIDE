-- Correccion aplicada en caliente el 2026-08-26.
-- El cast del CASE completo fallaba porque cada rama se infiere text[]:
--   ERROR 42846: CASE/WHEN could not convert type text[] to public.enum_estado_viaje[]
-- Hay que tipar cada rama por separado.
--
-- El archivo 09 ya incorpora esta correccion, asi que en una reproduccion
-- desde cero esta migracion es idempotente y no cambia nada.
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

revoke execute on function public.validar_transicion_viaje() from public, anon, authenticated;
