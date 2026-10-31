import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireOwner, todayInTz, companyByEmail, normEmail } from "@/lib/helpers";
import { BOOKING_MODES, normalizeZoneSchedule, normalizeWindows, publicWindows } from "@/lib/schedule";

// GET /api/warehouses?slug=xxx[&email=...] — публичные данные склада для страницы бронирования.
// email — если он внесён в список компаний склада (режим В), открываются окна этой компании.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("warehouses").select("*").eq("slug", slug).maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: t("Склад не найден") }, { status: 404 });

  // Email перевозчика — проверяем только в режиме В
  const email = normEmail(req.nextUrl.searchParams.get("email"));
  let company: { id: string; name: string } | null = null;
  if (email && data.booking_mode === "companies") company = await companyByEmail(data.id, email).catch(() => null);

  // наружу отдаём только то, что нужно странице бронирования (без owner_id, списков компаний и т.п.)
  const { id, name, city, address, gates, slot_minutes, start_hour, end_hour, booking_horizon_days, cancel_limit_hours } = data;
  return NextResponse.json({
    warehouse: {
      id, slug: data.slug, name, city, address, gates, slot_minutes, start_hour, end_hour,
      booking_horizon_days: booking_horizon_days ?? null,
      cancel_limit_hours: cancel_limit_hours ?? null,
      booking_mode: data.booking_mode || "basic",
      zone_schedule: data.zone_schedule ?? null,
      company_windows: data.booking_mode === "companies" ? publicWindows(data.company_windows, company?.id || null) : [],
    },
    company,
    today: todayInTz(),
  });
}

function slugify(name: string) {
  const base = name.toLowerCase().trim().replace(/[^a-zа-я0-9\s-]/gi, "").replace(/\s+/g, "-").slice(0, 24);
  return (base || "sklad") + "-" + Math.random().toString(36).slice(2, 6);
}

// POST /api/warehouses  body: { name, city, address } — создать склад для уже зарегистрированного пользователя
// (например, если его прежний склад был удалён). Один пользователь — один склад.
export async function POST(req: NextRequest) {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: t("Войдите в аккаунт") }, { status: 401 });

  const { name, city, address } = await req.json();
  if (!String(name || "").trim()) return NextResponse.json({ error: t("Укажите название склада") }, { status: 400 });
  if (!String(city || "").trim()) return NextResponse.json({ error: t("Укажите город") }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("warehouses").select("id").eq("owner_id", user.id).limit(1);
  if ((existing || []).length > 0) return NextResponse.json({ error: t("У этого аккаунта уже есть склад") }, { status: 409 });
  const { data: membership } = await admin.from("warehouse_members").select("id").eq("user_id", user.id).limit(1);
  if ((membership || []).length > 0) return NextResponse.json({ error: t("Этот аккаунт — диспетчер другого склада") }, { status: 409 });

  const { data, error } = await admin
    .from("warehouses")
    .insert({ owner_id: user.id, slug: slugify(String(name)), name: String(name).trim(), city: String(city).trim(), address: String(address || "").trim() || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ warehouse: data });
}

// Поля, которые владелец может менять в настройках, и их допустимые границы.
const LIMITS: Record<string, [number, number]> = {
  gates: [1, 50],
  slot_minutes: [5, 480],
  start_hour: [0, 23],
  end_hour: [1, 24],
  booking_horizon_days: [0, 365],
  cancel_limit_hours: [0, 168],
};
const LABELS: Record<string, string> = {
  gates: "Количество зон",
  slot_minutes: "Длительность слота",
  start_hour: "Начало работы",
  end_hour: "Конец работы",
  booking_horizon_days: "Горизонт бронирования",
  cancel_limit_hours: "Запрет отмены",
};

// PATCH /api/warehouses  body: { warehouseId, gates, slot_minutes, start_hour, end_hour, address,
//   booking_horizon_days, cancel_limit_hours, booking_mode, zone_schedule, company_windows } — только владелец
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { warehouseId } = body;
  const owner = await requireOwner(warehouseId);
  if (!owner) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const patch: Record<string, any> = {};
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (!(key in body)) continue;
    const raw = body[key];
    // пустое поле у ограничений = «без ограничения»
    if ((key === "booking_horizon_days" || key === "cancel_limit_hours") && (raw === "" || raw === null)) { patch[key] = null; continue; }
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < min || n > max) {
      return NextResponse.json({ error: t("{0}: введите целое число от {1} до {2}", { 0: t(LABELS[key]), 1: min, 2: max }) }, { status: 400 });
    }
    patch[key] = (key === "booking_horizon_days" || key === "cancel_limit_hours") && n === 0 ? null : n;
  }
  if ("address" in body) patch.address = String(body.address || "").trim() || null;

  const admin = supabaseAdmin();
  const { data: current } = await admin.from("warehouses").select("*").eq("id", warehouseId).single();
  const start = patch.start_hour ?? current?.start_hour;
  const end = patch.end_hour ?? current?.end_hour;
  if (start >= end) return NextResponse.json({ error: t("Конец работы должен быть позже начала") }, { status: 400 });

  // Режим работы и расписание зон/окон
  const gates = patch.gates ?? current?.gates;
  if ("booking_mode" in body) {
    if (!BOOKING_MODES.includes(body.booking_mode)) return NextResponse.json({ error: t("Неизвестный режим работы") }, { status: 400 });
    patch.booking_mode = body.booking_mode;
  }
  if ("zone_schedule" in body) {
    const r = normalizeZoneSchedule(body.zone_schedule, gates);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.zone_schedule = r.value;
  }
  if ("company_windows" in body) {
    const { data: companies } = await admin.from("booking_companies").select("id").eq("warehouse_id", warehouseId);
    const r = normalizeWindows(body.company_windows, gates, (companies || []).map((c) => c.id));
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.company_windows = r.value;
  }

  const { data, error } = await admin.from("warehouses").update(patch).eq("id", warehouseId).select().single();
  if (error) {
    if (/booking_mode|zone_schedule|company_windows/.test(error.message)) {
      return NextResponse.json({ error: t("Новые поля ещё не добавлены в базу. Выполните SQL из supabase/migrations/2026-10-03_dispatchers_modes.sql в Supabase → SQL Editor.") }, { status: 500 });
    }
    if (/booking_horizon_days|cancel_limit_hours/.test(error.message)) {
      return NextResponse.json({ error: t("Новые поля ещё не добавлены в базу. Выполните SQL из supabase/migrations/2026-10-01_limits.sql в Supabase → SQL Editor.") }, { status: 500 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ warehouse: data });
}
