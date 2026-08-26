-- Seccion 2.1 decision C + 2.2 - Un viaje admite varios registros financieros.

create table if not exists public.metodos_pago (
  id uuid primary key default gen_random_uuid(),
  pasajero_id uuid not null references public.pasajeros(id) on delete cascade,
  tipo text not null check (tipo in ('tarjeta','efectivo')),
  detalle_tokenizado text,
  predeterminado boolean not null default false,
  created_at timestamptz not null default now(),

  -- Nunca se guarda el PAN: la tarjeta exige token de la pasarela, el efectivo no lleva.
  constraint metodos_pago_token_segun_tipo check (
    (tipo = 'tarjeta' and detalle_tokenizado is not null)
    or (tipo = 'efectivo' and detalle_tokenizado is null)
  )
);

-- Un solo metodo predeterminado por pasajero.
create unique index if not exists metodos_pago_un_predeterminado
  on public.metodos_pago (pasajero_id)
  where predeterminado;

create index if not exists metodos_pago_pasajero_idx on public.metodos_pago (pasajero_id);

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  viaje_id uuid not null references public.viajes(id) on delete restrict,
  metodo_pago_id uuid references public.metodos_pago(id) on delete set null,
  monto numeric(10,2) not null check (monto > 0),
  tipo text not null check (tipo in ('pago','reembolso','reintento')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente','completado','fallido')),
  fecha timestamptz not null default now()
);

create index if not exists pagos_viaje_idx on public.pagos (viaje_id, fecha desc);
create index if not exists pagos_metodo_idx on public.pagos (metodo_pago_id);
create index if not exists pagos_pendientes_idx on public.pagos (estado) where estado = 'pendiente';

comment on column public.pagos.metodo_pago_id is
  'Documento 2.2: nullable en cobros en efectivo.';
comment on column public.metodos_pago.detalle_tokenizado is
  'Token de la pasarela. Nunca el numero real de tarjeta.';
