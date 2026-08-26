-- Seccion 2.5 - Aislamiento por RLS.
-- Cada usuario ve solo lo suyo; la cuenta administrativa tiene lectura global.
-- Se reutiliza public.current_user_role(), que ya existia en el proyecto.

create or replace function public.es_administrativo()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_user_role() in ('admin','superadmin');
$$;

-- Participacion del usuario actual en un viaje, en una sola consulta reutilizable.
create or replace function public.participa_en_viaje(p_viaje_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.viajes v
    where v.id = p_viaje_id
      and (select auth.uid()) in (v.pasajero_id, v.conductor_id)
  );
$$;

grant execute on function public.es_administrativo() to authenticated;
grant execute on function public.participa_en_viaje(uuid) to authenticated;

alter table public.pasajeros            enable row level security;
alter table public.conductores          enable row level security;
alter table public.vehiculos            enable row level security;
alter table public.documentos_conductor enable row level security;
alter table public.tarifas              enable row level security;
alter table public.viajes               enable row level security;
alter table public.ubicaciones          enable row level security;
alter table public.metodos_pago         enable row level security;
alter table public.pagos                enable row level security;
alter table public.calificaciones       enable row level security;
alter table public.notificaciones       enable row level security;

-- --------------------------- pasajeros / conductores -----------------------
drop policy if exists pasajeros_propio on public.pasajeros;
create policy pasajeros_propio on public.pasajeros for all to authenticated
  using ((select auth.uid()) = id or public.es_administrativo())
  with check ((select auth.uid()) = id);

drop policy if exists conductores_propio on public.conductores;
create policy conductores_propio on public.conductores for all to authenticated
  using ((select auth.uid()) = id or public.es_administrativo())
  with check ((select auth.uid()) = id);

-- El pasajero necesita ver al conductor que le fue asignado.
drop policy if exists conductores_visible_en_viaje on public.conductores;
create policy conductores_visible_en_viaje on public.conductores for select to authenticated
  using (exists (
    select 1 from public.viajes v
    where v.conductor_id = conductores.id
      and v.pasajero_id = (select auth.uid())
  ));

-- --------------------------- vehiculos / documentos ------------------------
drop policy if exists vehiculos_del_conductor on public.vehiculos;
create policy vehiculos_del_conductor on public.vehiculos for all to authenticated
  using ((select auth.uid()) = conductor_id or public.es_administrativo())
  with check ((select auth.uid()) = conductor_id);

drop policy if exists vehiculos_visible_en_viaje on public.vehiculos;
create policy vehiculos_visible_en_viaje on public.vehiculos for select to authenticated
  using (exists (
    select 1 from public.viajes v
    where v.vehiculo_id = vehiculos.id
      and v.pasajero_id = (select auth.uid())
  ));

-- La documentacion legal es privada: solo su dueno y la administracion.
drop policy if exists documentos_del_conductor on public.documentos_conductor;
create policy documentos_del_conductor on public.documentos_conductor for all to authenticated
  using ((select auth.uid()) = conductor_id or public.es_administrativo())
  with check ((select auth.uid()) = conductor_id);

-- --------------------------- tarifas ---------------------------------------
drop policy if exists tarifas_lectura on public.tarifas;
create policy tarifas_lectura on public.tarifas for select to authenticated
  using (activo or public.es_administrativo());

drop policy if exists tarifas_admin on public.tarifas;
create policy tarifas_admin on public.tarifas for all to authenticated
  using (public.es_administrativo())
  with check (public.es_administrativo());

-- --------------------------- viajes ----------------------------------------
drop policy if exists viajes_participante on public.viajes;
create policy viajes_participante on public.viajes for select to authenticated
  using (
    (select auth.uid()) in (pasajero_id, conductor_id)
    or public.es_administrativo()
  );

-- Difusion del paso 5 del flujo 1.5: los conductores aprobados y disponibles
-- ven las solicitudes abiertas para poder aceptarlas.
drop policy if exists viajes_difusion_conductores on public.viajes;
create policy viajes_difusion_conductores on public.viajes for select to authenticated
  using (
    estado = 'BUSCANDO_CONDUCTOR'
    and conductor_id is null
    and exists (
      select 1 from public.conductores c
      where c.id = (select auth.uid())
        and c.disponible
        and c.estado_aprobacion = 'aprobado'
    )
  );

drop policy if exists viajes_pasajero_crea on public.viajes;
create policy viajes_pasajero_crea on public.viajes for insert to authenticated
  with check ((select auth.uid()) = pasajero_id);

drop policy if exists viajes_participante_actualiza on public.viajes;
create policy viajes_participante_actualiza on public.viajes for update to authenticated
  using ((select auth.uid()) in (pasajero_id, conductor_id) or public.es_administrativo())
  with check ((select auth.uid()) in (pasajero_id, conductor_id) or public.es_administrativo());

-- --------------------------- ubicaciones -----------------------------------
drop policy if exists ubicaciones_del_viaje on public.ubicaciones;
create policy ubicaciones_del_viaje on public.ubicaciones for all to authenticated
  using (public.participa_en_viaje(viaje_id) or public.es_administrativo())
  with check (public.participa_en_viaje(viaje_id));

-- --------------------------- metodos_pago / pagos --------------------------
drop policy if exists metodos_pago_propios on public.metodos_pago;
create policy metodos_pago_propios on public.metodos_pago for all to authenticated
  using ((select auth.uid()) = pasajero_id)
  with check ((select auth.uid()) = pasajero_id);

drop policy if exists pagos_del_viaje on public.pagos;
create policy pagos_del_viaje on public.pagos for select to authenticated
  using (public.participa_en_viaje(viaje_id) or public.es_administrativo());

-- --------------------------- calificaciones --------------------------------
drop policy if exists calificaciones_lectura on public.calificaciones;
create policy calificaciones_lectura on public.calificaciones for select to authenticated
  using (
    (select auth.uid()) in (calificador_id, calificado_id)
    or public.es_administrativo()
  );

drop policy if exists calificaciones_propia on public.calificaciones;
create policy calificaciones_propia on public.calificaciones for insert to authenticated
  with check ((select auth.uid()) = calificador_id);

-- --------------------------- notificaciones --------------------------------
drop policy if exists notificaciones_propias on public.notificaciones;
create policy notificaciones_propias on public.notificaciones for select to authenticated
  using ((select auth.uid()) = usuario_id or public.es_administrativo());

drop policy if exists notificaciones_marcar_leida on public.notificaciones;
create policy notificaciones_marcar_leida on public.notificaciones for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);
