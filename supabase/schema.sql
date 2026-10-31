-- ============================================================
-- Gate-Slot — схема базы данных
-- Выполните этот файл целиком в Supabase → SQL Editor → New query
-- ============================================================

-- Склады
create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text unique not null,
  name text not null,
  city text not null,
  address text,
  gates int not null default 3,
  slot_minutes int not null default 30,
  start_hour int not null default 6,
  end_hour int not null default 14,
  booking_horizon_days int,            -- бронирование не дальше чем на N дней вперёд (null = без ограничений)
  cancel_limit_hours int default 24,   -- перевозчик не может отменить/перенести бронь позже чем за N часов (null = без ограничений)
  booking_mode text not null default 'basic', -- basic (А) | zones (Б) | companies (В)
  zone_schedule jsonb,                 -- график каждой зоны (режимы Б и В)
  company_windows jsonb,               -- окна, зарезервированные для компаний (режим В)
  created_at timestamptz not null default now()
);

-- Заявки на бронирование
create table if not exists bookings (
  id text primary key, -- например DK-A1B2C
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  date date not null,
  gate int not null,   -- номер зоны приёмки (исторически называлось «ворота»)
  time text not null, -- "HH:MM"
  email text not null,
  company text not null,
  carrier text not null,
  phone text not null,
  plate text not null,
  cargo text,
  company_id uuid,     -- компания из списка склада (режим В), определяется по email брони
  status text not null default 'confirmed', -- confirmed | arrived | departed | no_show | cancelled
  arrived_at timestamptz,
  departed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_bookings_warehouse_date on bookings(warehouse_id, date);

-- Дополнительные диспетчеры склада (входят в тот же кабинет по своему логину)
create table if not exists warehouse_members (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'dispatcher',
  created_at timestamptz not null default now(),
  unique (warehouse_id, user_id)
);
create index if not exists idx_members_user on warehouse_members(user_id);

-- Компании склада с кодами доступа (режим В)
create table if not exists booking_companies (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  name text not null,
  code text,            -- устарело (раньше: код доступа), не используется
  contact text,
  created_at timestamptz not null default now(),
  unique (warehouse_id, code)
);
create unique index if not exists uq_companies_name on booking_companies (warehouse_id, lower(trim(name)));

-- Email-адреса компаний: бронь с этого email открывает окна компании
create table if not exists booking_company_emails (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  company_id uuid not null references booking_companies(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (warehouse_id, email)
);
create index if not exists idx_company_emails_company on booking_company_emails(company_id);

alter table bookings add constraint bookings_company_fk
  foreign key (company_id) references booking_companies(id) on delete set null;

-- Журнал уведомлений
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  type text not null, -- confirmation | reminder
  to_email text not null,
  subject text not null,
  body text not null,
  sent_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table warehouses enable row level security;
alter table bookings enable row level security;
alter table notifications enable row level security;
alter table warehouse_members enable row level security;  -- доступ только через API (service role)
alter table booking_companies enable row level security;  -- доступ только через API (service role)
alter table booking_company_emails enable row level security;  -- доступ только через API (service role)

-- Склады: владелец видит и редактирует только свой склад
create policy "owner selects own warehouse" on warehouses
  for select using (auth.uid() = owner_id);

create policy "owner updates own warehouse" on warehouses
  for update using (auth.uid() = owner_id);

create policy "owner inserts own warehouse" on warehouses
  for insert with check (auth.uid() = owner_id);

-- Публичный доступ к складу по slug только для чтения (нужно для страницы бронирования)
-- Реализовано через отдельную функцию ниже, а не открытой политикой,
-- чтобы не светить owner_id и другие внутренние поля всем подряд.

create or replace function public.get_warehouse_by_slug(p_slug text)
returns table (id uuid, slug text, name text, city text, gates int, slot_minutes int, start_hour int, end_hour int)
language sql security definer as $$
  select id, slug, name, city, gates, slot_minutes, start_hour, end_hour
  from warehouses where slug = p_slug limit 1;
$$;

-- Заявки: чтение — все могут видеть заявки склада (нужно для сетки доступности),
-- но без email/телефона посторонним лучше не светить — используем ограниченную функцию.
create policy "owner selects all bookings of own warehouse" on bookings
  for select using (
    warehouse_id in (select id from warehouses where owner_id = auth.uid())
  );

-- Публичная функция: только занятость слотов (без персональных данных) — для сетки бронирования
create or replace function public.get_slot_availability(p_warehouse_id uuid, p_date date)
returns table (gate int, time text, status text)
language sql security definer as $$
  select gate, time, status from bookings
  where warehouse_id = p_warehouse_id and date = p_date
    and status not in ('no_show', 'cancelled');
$$;

-- Заявки создаются и управляются только через backend API (service role),
-- поэтому прямых insert/update/delete политик для anon не даём — все операции
-- на запись идут через защищённые API-роуты (app/api/*), которые проверяют
-- email+ID при самостоятельной отмене/правке перевозчиком.

-- Уведомления: доступны только владельцу склада
create policy "owner selects own notifications" on notifications
  for select using (
    warehouse_id in (select id from warehouses where owner_id = auth.uid())
  );
