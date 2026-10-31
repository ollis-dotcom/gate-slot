-- ============================================================
-- Обновление от 04.10.2026: компании определяются по email вместо кодов
-- Выполните один раз: Supabase → SQL Editor → New query → вставить → Run
-- Безопасно запускать повторно.
-- ============================================================

-- 1. Email-адреса компаний. Один email — одна компания на складе.
create table if not exists booking_company_emails (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  company_id uuid not null references booking_companies(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (warehouse_id, email)
);
create index if not exists idx_company_emails_company on booking_company_emails(company_id);
alter table booking_company_emails enable row level security;  -- доступ только через API

-- 2. Переносим email из поля «Контакт» уже созданных компаний
insert into booking_company_emails (warehouse_id, company_id, email)
select warehouse_id, id, lower(trim(contact))
from booking_companies
where contact ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
order by created_at
on conflict (warehouse_id, email) do nothing;

-- 3. Коды больше не нужны
alter table booking_companies alter column code drop not null;

-- 4. Одинаковые названия компаний на одном складе запрещены.
--    Уже существующие дубли переименовываем: «Gestamp», «Gestamp (2)», …
with d as (
  select id, row_number() over (partition by warehouse_id, lower(trim(name)) order by created_at) as rn
  from booking_companies
)
update booking_companies c set name = trim(c.name) || ' (' || d.rn || ')'
from d where d.id = c.id and d.rn > 1;

create unique index if not exists uq_companies_name on booking_companies (warehouse_id, lower(trim(name)));
