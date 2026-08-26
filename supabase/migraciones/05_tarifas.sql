-- Seccion 2.2 - Esquemas tarifarios usados para cotizar (paso 3 del flujo 1.5).

create table if not exists public.tarifas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tarifa_base numeric(10,2) not null check (tarifa_base >= 0),
  costo_por_km numeric(10,2) not null check (costo_por_km >= 0),
  costo_por_minuto numeric(10,2) not null check (costo_por_minuto >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists tarifas_activas_idx on public.tarifas (activo) where activo;

-- Tarifas iniciales del documento. Idempotente por el unique en nombre.
insert into public.tarifas (nombre, tarifa_base, costo_por_km, costo_por_minuto, activo)
values
  ('Tarifa Estandar', 1.50, 0.45, 0.12, true),
  ('Tarifa Nocturna', 2.00, 0.60, 0.15, true),
  ('Tarifa Hora Pico', 2.25, 0.70, 0.18, true)
on conflict (nombre) do nothing;
