import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess } from "@/lib/helpers";

// POST /api/scan  body: { warehouseId, code }
// 1-е сканирование заявки: confirmed -> arrived (+arrived_at)
// 2-е сканирование: arrived -> departed (+departed_at)
export async function POST(req: NextRequest) {
  const { warehouseId, code } = await req.json();
  const owner = await requireAccess(warehouseId);
  if (!owner) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const admin = supabaseAdmin();
  const id = (code || "").trim().toUpperCase();
  const { data: booking } = await admin.from("bookings").select("*").eq("id", id).eq("warehouse_id", warehouseId).maybeSingle();

  if (!booking) return NextResponse.json({ error: t("Заявка с таким кодом не найдена") }, { status: 404 });

  if (booking.status === "confirmed") {
    const { data } = await admin.from("bookings").update({ status: "arrived", arrived_at: new Date().toISOString() }).eq("id", id).select().single();
    return NextResponse.json({ booking: data, action: "arrived" });
  }
  if (booking.status === "arrived") {
    const { data } = await admin.from("bookings").update({ status: "departed", departed_at: new Date().toISOString() }).eq("id", id).select().single();
    return NextResponse.json({ booking: data, action: "departed" });
  }

  return NextResponse.json({ error: t("Заявка уже обработана (статус: {0})", { 0: booking.status }) }, { status: 409 });
}
