-- ============================================================
-- Обновление от 01.10.2026: ограничения бронирования
-- Выполните один раз: Supabase → SQL Editor → New query → вставить → Run
-- Безопасно запускать повторно.
-- ============================================================

-- На сколько календарных дней вперёд перевозчик может бронировать (пусто = без ограничений)
alter table warehouses add column if not exists booking_horizon_days int;

-- За сколько часов до слота перевозчику запрещено отменять/переносить бронь (пусто = без ограничений)
alter table warehouses add column if not exists cancel_limit_hours int default 24;

-- Включаем запрет «за 24 часа» для уже существующих складов
update warehouses set cancel_limit_hours = 24 where cancel_limit_hours is null;
