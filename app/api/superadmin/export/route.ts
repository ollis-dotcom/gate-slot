import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSuperAdmin, toCsv, BOOKING_CSV_COLUMNS, BOOKING_STATUS_LABELS } from "@/lib/helpers";

const ALL_COLUMNS = [{ key: "warehouse_name", label: "Склад" }, ...BOOKING_CSV_COLUMNS];

// GET /api/superadmin/export — CSV со всеми бронями всех складов сразу (для статистики по всему сервису)
export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: warehouses } = await admin.from("warehouses").select("id, name");
  const nameById = new Map((warehouses || []).map((w) => [w.id, w.name]));

  const { data: bookings, error } = await admin
    .from("bookings")
    .select("*")
    .order("date", { ascending: true })
    .order("time", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (bookings || []).map((b) => ({
    ...b,
    warehouse_name: nameById.get(b.warehouse_id) || b.warehouse_id,
    status: BOOKING_STATUS_LABELS[b.status] || b.status,
  }));
  const csv = toCsv(rows, ALL_COLUMNS);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="all-warehouses-bookings.csv"`,
    },
  });
}
