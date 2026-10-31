import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess, sendAndLogEmail, bookingEmail, appUrl } from "@/lib/helpers";

// GET /api/notifications?warehouseId=xxx — журнал уведомлений склада (последние 50)
export async function GET(req: NextRequest) {
  const warehouseId = req.nextUrl.searchParams.get("warehouseId") || "";
  if (!(await requireAccess(warehouseId))) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("notifications").select("*").eq("warehouse_id", warehouseId)
    .order("sent_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data || [] });
}

// POST /api/notifications
// body: { warehouseId, bookingId, type: "reminder" } — напоминание по брони (текст и ссылки собирает сервер)
// body: { warehouseId, type, to, subject, body } — произвольное письмо от склада
export async function POST(req: NextRequest) {
  const payload = await req.json();
  const { warehouseId } = payload;
  const owner = await requireAccess(warehouseId);
  if (!owner) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  try {
    if (payload.bookingId) {
      const admin = supabaseAdmin();
      const { data: b } = await admin.from("bookings").select("*").eq("id", payload.bookingId).eq("warehouse_id", warehouseId).maybeSingle();
      const { data: wh } = await admin.from("warehouses").select("*").eq("id", warehouseId).single();
      if (!b || !wh) return NextResponse.json({ error: t("Заявка не найдена") }, { status: 404 });
      const mail = bookingEmail("reminder", b, wh, appUrl(req));
      await sendAndLogEmail({ warehouseId, to: b.email, type: "reminder", ...mail });
    } else {
      const { type, to, subject, body } = payload;
      await sendAndLogEmail({ warehouseId, to, subject, body, type });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || t("Не удалось отправить") }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
