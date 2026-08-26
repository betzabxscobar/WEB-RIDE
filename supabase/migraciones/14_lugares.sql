-- Catalogo de puntos conocidos de la ciudad.
--
-- Sustituye a la geocodificacion: sin un servicio externo no se puede
-- convertir "Av. 9 de Octubre" en coordenadas, asi que el destino se elige de
-- esta lista. El origen puede venir del GPS del dispositivo, que no es un
-- servicio externo.

create table if not exists public.lugares (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text not null,
  latitud float8 not null check (latitud between -90 and 90),
  longitud float8 not null check (longitud between -180 and 180),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists lugares_nombre_key on public.lugares (lower(nombre));
create index if not exists lugares_activos_idx on public.lugares (activo) where activo;

alter table public.lugares enable row level security;

-- Cualquiera con sesion puede consultarlos: son datos publicos de la ciudad.
drop policy if exists lugares_lectura on public.lugares;
create policy lugares_lectura on public.lugares for select to authenticated
  using (activo or public.es_administrativo());

-- Solo la administracion los mantiene.
drop policy if exists lugares_admin on public.lugares;
create policy lugares_admin on public.lugares for all to authenticated
  using (public.es_administrativo())
  with check (public.es_administrativo());

-- Semilla con puntos de Guayaquil. Las coordenadas son aproximadas, pensadas
-- para cotizar por distancia; no son levantamientos topograficos.
insert into public.lugares (nombre, direccion, latitud, longitud) values
  ('Aeropuerto Jose Joaquin de Olmedo', 'Av. de las Americas, Guayaquil', -2.1574, -79.8836),
  ('Terminal Terrestre', 'Av. Benjamin Rosales, Guayaquil', -2.1489, -79.8878),
  ('Malecon 2000', 'Malecon Simon Bolivar, Guayaquil', -2.1900, -79.8794),
  ('Urdesa Central', 'Av. Victor Emilio Estrada, Guayaquil', -2.1622, -79.9098),
  ('Mall del Sol', 'Av. Joaquin Orrantia, Guayaquil', -2.1631, -79.8901),
  ('San Marino Shopping', 'Av. Francisco de Orellana, Guayaquil', -2.1745, -79.8996),
  ('Universidad de Guayaquil', 'Av. Delta y Av. Kennedy, Guayaquil', -2.1846, -79.9002),
  ('ESPOL Campus Gustavo Galindo', 'Via Perimetral km 30.5, Guayaquil', -2.1456, -79.9668),
  ('Parque Samanes', 'Av. Francisco de Orellana, Guayaquil', -2.1094, -79.8931),
  ('Puerto Santa Ana', 'Barrio Las Penas, Guayaquil', -2.1885, -79.8720),
  ('Ciudadela Kennedy', 'Av. San Jorge, Guayaquil', -2.1667, -79.8992),
  ('La Alborada', 'Av. Rodolfo Baquerizo Nazur, Guayaquil', -2.1249, -79.8969),
  ('Sauces 6', 'Av. Isidro Ayora, Guayaquil', -2.1350, -79.8930),
  ('Duran Centro', 'Av. Nicolas Lapenti, Duran', -2.1667, -79.8333),
  ('Riocentro Ceibos', 'Av. del Bombero, Guayaquil', -2.1636, -79.9433)
on conflict do nothing;

comment on table public.lugares is
  'Catalogo de destinos. Reemplaza la geocodificacion, que exigiria un servicio externo.';
