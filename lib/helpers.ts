import { t } from "@/lib/i18n";
import "./i18n-server";
import { supabaseServer } from "./supabaseServer";
import { supabaseAdmin } from "./supabaseAdmin";
import { Resend } from "resend";
import { zoneSlots, findWindow, type ScheduleWarehouse, type CompanyWindow } from "./schedule";
export { zoneSlots, allSlotTimes } from "./schedule";

// ID брони — криптостойкий, 8 символов без похожих (0/O, 1/I/L), ~10^12 вариантов.
// Старые 5-символьные ID продолжают работать: в базе это просто текст.
const ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function genId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return "DK-" + s;
}

export type WarehouseRole = "owner" | "dispatcher";

// Кто вошёл и какая у него роль на складе warehouseId: владелец (создал склад)
// или дополнительный диспетчер (добавлен владельцем). null — нет доступа.
export async function getAccess(warehouseId: string): Promise<{ user: any; role: WarehouseRole } | null> {
  if (!warehouseId) return null;
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return null;

  const admin = supabaseAdmin();
  const { data: warehouse } = await admin.from("warehouses").select("id, owner_id").eq("id", warehouseId).maybeSingle();
  if (!warehouse) return null;
  if (warehouse.owner_id === user.id) return { user, role: "owner" };

  const { data: member } = await admin
    .from("warehouse_members").select("id").eq("warehouse_id", warehouseId).eq("user_id", user.id).maybeSingle();
  if (member) return { user, role: "dispatcher" };
  return null;
}

// Любой сотрудник склада (владелец или диспетчер): работа с бронями, сканер, уведомления.
export async function requireAccess(warehouseId: string) {
  const a = await getAccess(warehouseId);
  return a ? a.user : null;
}

// Только владелец склада: настройки, компании, управление аккаунтами диспетчеров.
export async function requireOwner(warehouseId: string) {
  const a = await getAccess(warehouseId);
  return a && a.role === "owner" ? a.user : null;
}

// Склад, к которому у пользователя есть доступ: сначала собственный, затем тот, куда его добавили диспетчером.
export async function findUserWarehouse(userId: string): Promise<{ warehouse: any; role: WarehouseRole } | null> {
  const admin = supabaseAdmin();
  const { data: own } = await admin.from("warehouses").select("*").eq("owner_id", userId)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (own) return { warehouse: own, role: "owner" };
  const { data: m } = await admin.from("warehouse_members").select("warehouse_id")
    .eq("user_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!m) return null;
  const { data: wh } = await admin.from("warehouses").select("*").eq("id", m.warehouse_id).maybeSingle();
  return wh ? { warehouse: wh, role: "dispatcher" } : null;
}

// Возвращает user, если он залогинен и его email в списке SUPER_ADMIN_EMAILS. Иначе null.
export async function requireSuperAdmin() {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user || !user.email) return null;

  const allowList = superAdminEmails();
  if (!allowList.includes(user.email.toLowerCase())) return null;
  return user;
}

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  confirmed: "Подтверждено",
  arrived: "На месте",
  departed: "Убыл",
  no_show: "Не явился",
  cancelled: "Отменено",
};

export const BOOKING_CSV_COLUMNS = [
  { key: "id", label: "ID брони" },
  { key: "date", label: "Дата" },
  { key: "time", label: "Время" },
  { key: "gate", label: "Зона" },
  { key: "status", label: "Статус" },
  { key: "company", label: "Компания" },
  { key: "carrier", label: "Перевозчик" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "plate", label: "Номер машины" },
  { key: "cargo", label: "Груз" },
  { key: "created_at", label: "Создано" },
  { key: "arrived_at", label: "Прибыл" },
  { key: "departed_at", label: "Убыл (время)" },
];

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Собирает CSV-строку (с BOM для корректной кириллицы в Excel) из массива объектов и списка колонок.
export function toCsv(rows: Record<string, any>[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => csvEscape(t(c.label))).join(",");
  const lines = rows.map((r) => columns.map((c) => csvEscape(r[c.key])).join(","));
  return "\uFEFF" + [header, ...lines].join("\r\n");
}

// ============================================================
// Время и правила бронирования
// ============================================================

// Часовой пояс, в котором работают склады (для расчёта «сегодня» и «за 24 часа до слота»).
// Можно переопределить переменной окружения APP_TIMEZONE в Vercel.
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Europe/Moscow";

function tzParts(ms: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (tm: string) => Number(parts.find((p) => p.type === tm)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

// Сегодняшняя дата (YYYY-MM-DD) в часовом поясе складов.
export function todayInTz(tz = APP_TIMEZONE, now = Date.now()) {
  const p = tzParts(now, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

// Прибавляет дни к дате вида YYYY-MM-DD.
export function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Момент начала слота (дата + "HH:MM" по времени склада) в миллисекундах UTC.
export function slotStartMs(date: string, time: string, tz = APP_TIMEZONE) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = tzParts(guess, tz);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - guess;
  return guess - offset;
}

// Проверка «бронирование не дальше чем на N дней вперёд». Возвращает текст ошибки или null.
export function checkBookingHorizon(date: string, horizonDays: number | null | undefined) {
  if (date < todayInTz()) return t("Нельзя забронировать слот на прошедшую дату");
  if (!horizonDays || horizonDays <= 0) return null;
  const maxDate = addDays(todayInTz(), horizonDays);
  if (date > maxDate) return t("Бронирование открыто только на {0} дн. вперёд (до {1} включительно)", { 0: horizonDays, 1: maxDate });
  return null;
}

// Проверка «нельзя отменять/переносить меньше чем за N часов до слота». Возвращает текст ошибки или null.
export function checkCancelLimit(date: string, time: string, limitHours: number | null | undefined) {
  if (!limitHours || limitHours <= 0) return null;
  const hoursLeft = (slotStartMs(date, time) - Date.now()) / 3_600_000;
  if (hoursLeft < limitHours) {
    return t("Отменить или перенести бронь можно не позднее чем за {0} ч до начала слота. Для изменений свяжитесь со складом.", { 0: limitHours });
  }
  return null;
}

// Проверяет, что зона и время существуют в расписании склада (с учётом режима А/Б/В).
export function checkSlotExists(wh: ScheduleWarehouse, gate: number, time: string) {
  if (!Number.isInteger(Number(gate)) || Number(gate) < 1 || Number(gate) > wh.gates) return t("Такой зоны на складе нет");
  if (!zoneSlots(wh, Number(gate)).includes(time)) return t("В это время зона не работает — выберите другой слот");
  return null;
}

// Проверка окон для компаний (режим В): если слот в окне, бронировать его может только компания из списка окна.
export function checkCompanyWindow(wh: any, date: string, gate: number, time: string, companyId: string | null | undefined) {
  const w = findWindow<CompanyWindow>(wh, date, Number(gate), time);
  if (!w) return null;
  if (companyId && w.company_ids.includes(companyId)) return null;
  return t("Слот {0} зарезервирован складом для определённых компаний ({1}–{2}). Если ваша компания есть в списке склада — укажите email, который склад внёс в список, либо выберите другое время.", { 0: time, 1: w.start, 2: w.end });
}

export function normEmail(v: any) {
  return String(v || "").trim().toLowerCase();
}
export function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Компания склада, к которой привязан email (режим В). null — email не в списке.
export async function companyByEmail(warehouseId: string, email: string): Promise<{ id: string; name: string } | null> {
  const e = normEmail(email);
  if (!e) return null;
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("booking_company_emails")
    .select("company_id, booking_companies(id, name)")
    .eq("warehouse_id", warehouseId)
    .eq("email", e)
    .maybeSingle();
  const c: any = (data as any)?.booking_companies;
  if (!c) return null;
  return Array.isArray(c) ? (c[0] || null) : c;
}

// ============================================================
// Ссылки в письмах
// ============================================================

// Базовый адрес сайта: переменная APP_URL (например https://gate-slot.com), иначе — адрес, на который пришёл запрос.
export function appUrl(req: Request) {
  const fromEnv = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return new URL(req.url).origin;
}

export function bookingLinks(base: string, slug: string, id?: string, email?: string) {
  const newLink = `${base}/book/${slug}`;
  const manageLink = id && email
    ? `${base}/book/${slug}?id=${encodeURIComponent(id)}&email=${encodeURIComponent(email)}`
    : newLink;
  return { newLink, manageLink };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Простой HTML из текста письма: переносы строк и кликабельные ссылки.
function textToHtml(text: string) {
  const html = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>");
  return `<div style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${html}</div>`;
}

// Отправка письма без записи в журнал склада (например, сброс пароля). Возвращает true, если письмо ушло.
export async function sendEmail(opts: { to: string; subject: string; body: string }) {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      to: opts.to,
      subject: opts.subject,
      text: opts.body,
      html: textToHtml(opts.body),
    });
    if (error) { console.error("Email send failed", error); return false; }
    return true;
  } catch (e) {
    console.error("Email send failed", e);
    return false;
  }
}

export async function sendAndLogEmail(opts: {
  warehouseId: string;
  to: string;
  subject: string;
  body: string;
  type: "confirmation" | "reminder" | "update" | "cancellation";
}) {
  const admin = supabaseAdmin();

  // Реальная отправка через Resend, если настроен ключ; иначе просто логируем.
  await sendEmail({ to: opts.to, subject: opts.subject, body: opts.body });

  await admin.from("notifications").insert({
    warehouse_id: opts.warehouseId,
    type: opts.type,
    to_email: opts.to,
    subject: opts.subject,
    body: opts.body,
  });
}

// ============================================================
// Тексты писем по броням (единый формат для всех мест, где шлём письма)
// ============================================================

type BookingLike = { id: string; date: string; time: string; gate: number; email: string; company?: string; carrier?: string; phone?: string; plate?: string; cargo?: string | null };
type WarehouseLike = { name: string; slug: string; address?: string | null; city?: string | null };

export function bookingEmail(
  kind: "confirmation" | "update" | "cancellation" | "reminder",
  b: BookingLike,
  wh: WarehouseLike,
  base: string
) {
  const { newLink, manageLink } = bookingLinks(base, wh.slug, b.id, b.email);
  const where = [wh.city, wh.address].filter(Boolean).join(", ");
  const slot = t("{0} в {1}, зона {2}", { 0: b.date, 1: b.time, 2: b.gate });
  const details = [
    t("Склад: {0}{1}", { 0: wh.name, 1: where ? ` (${where})` : "" }),
    t("Дата и время: {0}, {1}", { 0: b.date, 1: b.time }),
    t("Зона: {0}", { 0: b.gate }),
    b.company ? t("Компания: {0}", { 0: b.company }) : "",
    b.carrier ? t("Перевозчик: {0}", { 0: b.carrier }) : "",
    b.phone ? t("Телефон: {0}", { 0: b.phone }) : "",
    b.plate ? t("Машина: {0}", { 0: b.plate }) : "",
    b.cargo ? t("Груз: {0}", { 0: b.cargo }) : "",
    t("Код брони: {0}", { 0: b.id }),
  ].filter(Boolean).join("\n");

  if (kind === "confirmation") {
    return {
      subject: t("Бронь подтверждена — {0}", { 0: wh.name }),
      body: t("Здравствуйте!\n\nБронь {0} на {1} подтверждена.\n\n{2}\n\nИзменить или отменить бронь:\n{3}\n\nЗабронировать ещё один слот:\n{4}", { 0: b.id, 1: slot, 2: details, 3: manageLink, 4: newLink }),
    };
  }
  if (kind === "update") {
    return {
      subject: t("Бронь изменена — {0}", { 0: wh.name }),
      body: t("Здравствуйте!\n\nВ бронь {0} внесены изменения. Актуальные данные:\n\n{1}\n\nПосмотреть, изменить или отменить бронь:\n{2}", { 0: b.id, 1: details, 2: manageLink }),
    };
  }
  if (kind === "reminder") {
    return {
      subject: t("Напоминание: слот {0} в {1} — {2}", { 0: b.date, 1: b.time, 2: wh.name }),
      body: t("Здравствуйте{0}!\n\nНапоминаем о брони {1}: {2}.\n\n{3}\n\nИзменить или отменить бронь:\n{4}", { 0: b.carrier ? `, ${b.carrier}` : "", 1: b.id, 2: slot, 3: details, 4: manageLink }),
    };
  }
  return {
    subject: t("Бронь отменена — {0}", { 0: wh.name }),
    body: t("Здравствуйте!\n\nБронь {0} на {1} отменена.\n\nЗабронировать новый слот:\n{2}", { 0: b.id, 1: slot, 2: newLink }),
  };
}

// Список email супер-админов из переменной SUPER_ADMIN_EMAILS.
export function superAdminEmails() {
  return (process.env.SUPER_ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
