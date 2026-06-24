-- ============================================================
-- RANCHO APARTE · Esquema de base de datos (Supabase / Postgres)
-- ------------------------------------------------------------
-- Cómo usar:
--   1. Entrá a tu proyecto en supabase.com
--   2. Menú izquierdo → SQL Editor → New query
--   3. Pegá TODO este archivo y apretá "Run"
-- Es idempotente: lo podés correr más de una vez sin romper nada.
-- ============================================================

-- ---------- RESERVAS (fuente de verdad: web pública + CRM) ----------
create table if not exists public.reservas (
  id              text primary key default gen_random_uuid()::text,
  nombre          text not null,
  telefono        text,
  court_id        text not null,                       -- c5a · c5b · c5c · c7 · c8 (la 8 ocupa las tres de F5)
  fecha           date not null,
  hora            text not null,                       -- 'HH:MM'
  duracion        numeric not null default 1,          -- horas
  precio          integer not null default 0,
  sena            integer not null default 0,          -- seña efectivamente acreditada
  estado          text not null default 'Pendiente',   -- Confirmada · Pendiente · Cancelada · Finalizada
  origen          text not null default 'admin',       -- admin (carga manual) · web (autogestión del cliente)
  pago_estado     text not null default 'pendiente',   -- pendiente · comprobante · confirmado
  comprobante_url text,                                -- captura del pago subida por el cliente
  hold_expira     timestamptz,                         -- reserva web provisoria: se libera si no se paga a tiempo
  created_at      timestamptz not null default now()
);
create index if not exists idx_reservas_fecha on public.reservas (fecha);

-- ---------- CLIENTES ----------
create table if not exists public.clientes (
  id         text primary key default gen_random_uuid()::text,
  nombre     text not null,
  telefono   text,
  email      text,
  notas      text,
  created_at timestamptz not null default now()
);

-- ---------- EVENTOS / CUMPLEAÑOS ----------
create table if not exists public.eventos (
  id         text primary key default gen_random_uuid()::text,
  cliente    text,
  telefono   text,
  tipo       text,
  fecha      date,
  hora       text,
  notas      text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- SEGURIDAD (Row Level Security)
-- ------------------------------------------------------------
-- Idea: el PÚBLICO (anon key, visible en la web) solo puede:
--   · pedir un turno nuevo (insert acotado), y
--   · ver qué horarios están ocupados (sin ver datos de clientes).
-- El DUEÑO entra al CRM con su usuario (auth) y ahí tiene todo.
-- ============================================================
alter table public.reservas enable row level security;
alter table public.clientes enable row level security;
alter table public.eventos  enable row level security;

-- --- Acceso TOTAL para el dueño logueado (rol authenticated) ---
drop policy if exists "owner all reservas" on public.reservas;
create policy "owner all reservas" on public.reservas
  for all to authenticated using (true) with check (true);

drop policy if exists "owner all clientes" on public.clientes;
create policy "owner all clientes" on public.clientes
  for all to authenticated using (true) with check (true);

drop policy if exists "owner all eventos" on public.eventos;
create policy "owner all eventos" on public.eventos
  for all to authenticated using (true) with check (true);

-- --- El público (anon) SOLO puede crear una reserva web provisoria ---
-- No puede leer, editar ni borrar reservas directamente.
drop policy if exists "public crea reserva web" on public.reservas;
create policy "public crea reserva web" on public.reservas
  for insert to anon
  with check (
    origen = 'web'
    and estado = 'Pendiente'
    and pago_estado in ('pendiente', 'comprobante')
    and fecha >= current_date
  );

-- ============================================================
-- DISPONIBILIDAD para la web pública
-- ------------------------------------------------------------
-- Función que devuelve SOLO los huecos ocupados de un día
-- (cancha + hora + duración), sin exponer nombres ni teléfonos.
-- La web la llama con: supabase.rpc('slots_ocupados', { dia: '2026-06-25' })
-- ============================================================
create or replace function public.slots_ocupados(dia date)
returns table (court_id text, hora text, duracion numeric)
language sql
security definer
set search_path = public
as $$
  select court_id, hora, duracion
  from public.reservas
  where fecha = dia
    and estado <> 'Cancelada'
    -- cuenta como ocupado si está confirmada, o si es una provisoria todavía vigente
    and (estado <> 'Pendiente' or hold_expira is null or hold_expira > now());
$$;

grant execute on function public.slots_ocupados(date) to anon, authenticated;

-- ============================================================
-- STORAGE: bucket para los comprobantes de seña
-- ------------------------------------------------------------
-- Público en lectura (para que el dueño abra la imagen fácil).
-- El cliente (anon) puede SUBIR; no puede borrar ni sobreescribir.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', true)
on conflict (id) do nothing;

drop policy if exists "public sube comprobante" on storage.objects;
create policy "public sube comprobante" on storage.objects
  for insert to anon
  with check (bucket_id = 'comprobantes');

drop policy if exists "lectura comprobantes" on storage.objects;
create policy "lectura comprobantes" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'comprobantes');
