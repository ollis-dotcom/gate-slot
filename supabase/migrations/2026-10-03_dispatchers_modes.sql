-- ============================================================
-- Обновление от 03.10.2026: дополнительные диспетчеры, режимы работы (А/Б/В), компании
-- Выполните один раз: Supabase → SQL Editor → New query → вставить → Run
-- Безопасно запускать повторно.
-- ============================================================

-- 1. Дополнительные аккаунты диспетчеров склада
--    (владелец склада по-прежнему хранится в warehouses.owner_id;
--     здесь — остальные сотрудники, которые входят в тот же кабинет по своему логину и паролю)
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
-- Доступ только через серверные API (service role) — политик для браузера не даём.
alter table warehouse_members enable row level security;

-- 2. Режим работы склада:
--    basic     — А: общие часы работы для всех зон (как раньше)
--    zones     — Б: свой график для каждой зоны, перерывы и окна посреди дня
--    companies — В: как Б + окна, зарезервированные для определённых компаний
alter table warehouses add column if not exists booking_mode text not null default 'basic';
-- График зон: {"1": [{"start":"08:00","end":"12:00"},{"start":"13:00","end":"17:00"}], "2": [...]}
alter table warehouses add column if not exists zone_schedule jsonb;
-- Окна для компаний: [{"id":"...","gates":[1,2]|null,"weekdays":[1..7]|null,"start":"08:00","end":"10:00","company_ids":["uuid",...]}]
alter table warehouses add column if not exists company_windows jsonb;

-- 3. Список компаний склада (для режима В). У каждой компании свой код доступа —
--    по нему (или по персональной ссылке) перевозчик бронирует зарезервированные окна.
create table if not exists booking_companies (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  name text not null,
  code text not null,
  contact text,
  created_at timestamptz not null default now(),
  unique (warehouse_id, code)
);
alter table booking_companies enable row level security;

-- 4. Бронь запоминает, от какой компании из списка она сделана (если по коду)
alter table bookings add column if not exists company_id uuid references booking_companies(id) on delete set null;
