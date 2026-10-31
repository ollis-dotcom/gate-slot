import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess, sendAndLogEmail, bookingEmail, appUrl } from "@/lib/helpers";

// POST /api/bookings/swap  body: { warehouseId, idA, idB }
export async function POST(req: NextRequest) {
  const { warehouseId, idA, idB } = await req.json();
  const owner = await requireAccess(warehouseId);
  if (!owner) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: a } = await admin.from("bookings").select("*").eq("id", idA).single();
  const { data: b } = await admin.from("bookings").select("*").eq("id", idB).single();
  if (!a || !b) return NextResponse.json({ error: t("Заявка не найдена") }, { status: 404 });
  if (a.warehouse_id !== warehouseId || b.warehouse_id !== warehouseId) {
    return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });
  }

  const { data: updatedA } = await admin.from("bookings").update({ gate: b.gate, time: b.time }).eq("id", a.id).select().single();
  const { data: updatedB } = await admin.from("bookings").update({ gate: a.gate, time: a.time }).eq("id", b.id).select().single();

  const { data: wh } = await admin.from("warehouses").select("*").eq("id", warehouseId).single();
  const base = appUrl(req);

  for (const updated of [updatedA, updatedB]) {
    if (!updated || !wh) continue;
    const mail = bookingEmail("update", updated, wh, base);
    await sendAndLogEmail({ warehouseId, to: updated.email, type: "update", ...mail });
  }

  return NextResponse.json({ ok: true });
}
