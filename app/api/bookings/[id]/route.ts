import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  requireAccess, sendAndLogEmail, bookingEmail, appUrl,
  checkBookingHorizon, checkCancelLimit, checkSlotExists, checkCompanyWindow, companyByEmail,
} from "@/lib/helpers";

// Поля, изменение которых считается "изменением брони" и требует письма перевозчику.
// Операционные статусы (arrived/departed/no_show), которые проставляет диспетчер
// при физическом приезде машины, сюда не входят — по ним письма не шлём.
const NOTIFIABLE_FIELDS = ["date", "gate", "time", "company", "carrier", "phone", "plate", "cargo", "email"] as const;

// Что может менять перевозчик сам (по email + коду брони).
const SELF_FIELDS = ["date", "gate", "time", "carrier", "phone", "plate", "cargo"] as const;
// Что может менять диспетчер.
const ADMIN_FIELDS = ["date", "gate", "time", "company", "carrier", "phone", "plate", "cargo", "email", "status"] as const;
const STATUSES = ["confirmed", "arrived", "departed", "no_show", "cancelled"];

function pick(obj: any, keys: readonly string[]) {
  const out: Record<string, any> = {};
  for (const k of keys) if (obj && k in obj) out[k] = obj[k];
  return out;
}

// PATCH /api/bookings/:id
// body: { mode: "self", email, patch } — перевозчик меняет/отменяет свою бронь (проверка по email)
// body: { mode: "admin", patch } — диспетчер меняет любую бронь своего склада
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = supabaseAdmin();
  const body = await req.json();
  const { mode } = body;

  const { data: booking } = await admin.from("bookings").select("*").eq("id", params.id).single();
  if (!booking) return NextResponse.json({ error: t("Заявка не найдена") }, { status: 404 });

  const { data: wh } = await admin.from("warehouses").select("*").eq("id", booking.warehouse_id).single();
  if (!wh) return NextResponse.json({ error: t("Склад не найден") }, { status: 404 });

  let patch: Record<string, any>;

  if (mode === "self") {
    if (!body.email || String(body.email).trim().toLowerCase() !== booking.email.toLowerCase()) {
      return NextResponse.json({ error: t("Email не совпадает с указанным при бронировании") }, { status: 403 });
    }
    if (booking.status !== "confirmed") {
      return NextResponse.json({ error: t("Эту бронь уже нельзя изменить") }, { status: 409 });
    }
    patch = pick(body.patch, SELF_FIELDS);
    if (body.patch?.status === "cancelled") patch.status = "cancelled";

    const movesSlot =
      ("date" in patch && patch.date !== booking.date) ||
      ("gate" in patch && Number(patch.gate) !== booking.gate) ||
      ("time" in patch && patch.time !== booking.time);

    // Ограничение «не позднее чем за N часов до слота» — для отмены и переноса перевозчиком.
    if (patch.status === "cancelled" || movesSlot) {
      const limitError = checkCancelLimit(booking.date, booking.time, wh.cancel_limit_hours);
      if (limitError) return NextResponse.json({ error: limitError }, { status: 403 });
    }
    // Новая дата должна укладываться в «бронирование не дальше чем на N дней».
    if ("date" in patch && patch.date !== booking.date) {
      const horizonError = checkBookingHorizon(patch.date, wh.booking_horizon_days);
      if (horizonError) return NextResponse.json({ error: horizonError }, { status: 400 });
    }
  } else if (mode === "admin") {
    const owner = await requireAccess(booking.warehouse_id);
    if (!owner) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });
    patch = pick(body.patch, ADMIN_FIELDS);
    if ("status" in patch && !STATUSES.includes(patch.status)) {
      return NextResponse.json({ error: t("Неверный статус") }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: t("Неверный режим запроса") }, { status: 400 });
  }

  if ("gate" in patch) patch.gate = Number(patch.gate);
  if ("email" in patch) patch.email = String(patch.email).trim().toLowerCase();
  // диспетчер сменил email брони — заново определяем компанию из списка склада
  if ("email" in patch && patch.email !== booking.email) {
    const c = await companyByEmail(booking.warehouse_id, patch.email).catch(() => null);
    patch.company_id = c?.id || null;
  }

  // если меняется слот — проверяем, что он существует и свободен
  if ("date" in patch || "gate" in patch || "time" in patch) {
    const date = patch.date || booking.date;
    const gate = patch.gate ?? booking.gate;
    const time = patch.time || booking.time;
    const slotError = checkSlotExists(wh, gate, time);
    if (slotError && (gate !== booking.gate || time !== booking.time)) {
      return NextResponse.json({ error: slotError }, { status: 400 });
    }
    const { data: conflict } = await admin
      .from("bookings")
      .select("id")
      .eq("warehouse_id", booking.warehouse_id)
      .eq("date", date)
      .eq("gate", gate)
      .eq("time", time)
      .neq("id", booking.id)
      .not("status", "in", "(no_show,cancelled)")
      .maybeSingle();
    if (conflict) return NextResponse.json({ error: t("Этот слот уже занят") }, { status: 409 });

    // Перевозчик не может перенести бронь в окно, зарезервированное для других компаний.
    const slotChanged = date !== booking.date || gate !== booking.gate || time !== booking.time;
    if (mode === "self" && slotChanged) {
      const windowError = checkCompanyWindow(wh, date, gate, time, booking.company_id);
      if (windowError) return NextResponse.json({ error: windowError }, { status: 403 });
    }
  }

  if (patch.status === "arrived") patch.arrived_at = new Date().toISOString();
  if (patch.status === "departed") patch.departed_at = new Date().toISOString();

  // определяем, что реально меняется, до применения patch — сравниваем с текущими значениями
  const changedFields = NOTIFIABLE_FIELDS.filter(
    (k) => k in patch && String(patch[k] ?? "") !== String((booking as any)[k] ?? "")
  );
  const isCancellation = patch.status === "cancelled" && booking.status !== "cancelled";

  if (Object.keys(patch).length === 0) return NextResponse.json({ booking });

  const { data: updated, error } = await admin.from("bookings").update(patch).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isCancellation || changedFields.length > 0) {
    const kind = isCancellation ? "cancellation" : "update";
    const mail = bookingEmail(kind, updated, wh, appUrl(req));
    await sendAndLogEmail({ warehouseId: booking.warehouse_id, to: updated.email, type: kind, ...mail });
  }

  return NextResponse.json({ booking: updated });
}

// DELETE /api/bookings/:id — только диспетчер (полное удаление заявки)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = supabaseAdmin();
  const { data: booking } = await admin.from("bookings").select("warehouse_id").eq("id", params.id).single();
  if (!booking) return NextResponse.json({ error: t("Заявка не найдена") }, { status: 404 });

  const owner = await requireAccess(booking.warehouse_id);
  if (!owner) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const { error } = await admin.from("bookings").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
