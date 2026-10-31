import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess, toCsv, BOOKING_CSV_COLUMNS, BOOKING_STATUS_LABELS } from "@/lib/helpers";

// GET /api/bookings/export?warehouseId=xxx — CSV со всеми бронями склада (для диспетчера-владельца)
export async function GET(req: NextRequest) {
  const warehouseId = req.nextUrl.searchParams.get("warehouseId");
  if (!warehouseId) return NextResponse.json({ error: "warehouseId required" }, { status: 400 });

  const owner = await requireAccess(warehouseId);
  if (!owner) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: warehouse } = await admin.from("warehouses").select("slug").eq("id", warehouseId).single();

  const { data: bookings, error } = await admin
    .from("bookings")
    .select("*")
    .eq("warehouse_id", warehouseId)
    .order("date", { ascending: true })
    .order("time", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (bookings || []).map((b) => ({ ...b, status: t(BOOKING_STATUS_LABELS[b.status] || b.status) }));
  const csv = toCsv(rows, BOOKING_CSV_COLUMNS);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${warehouse?.slug || warehouseId}-bookings.csv"`,
    },
  });
}
