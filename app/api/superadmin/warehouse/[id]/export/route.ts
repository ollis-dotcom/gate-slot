import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSuperAdmin, toCsv, BOOKING_CSV_COLUMNS, BOOKING_STATUS_LABELS } from "@/lib/helpers";

// GET /api/superadmin/warehouse/:id/export — CSV со всеми бронями одного склада (для владельца сервиса)
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: warehouse } = await admin.from("warehouses").select("slug").eq("id", params.id).single();
  if (!warehouse) return NextResponse.json({ error: "Склад не найден" }, { status: 404 });

  const { data: bookings, error } = await admin
    .from("bookings")
    .select("*")
    .eq("warehouse_id", params.id)
    .order("date", { ascending: true })
    .order("time", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (bookings || []).map((b) => ({ ...b, status: BOOKING_STATUS_LABELS[b.status] || b.status }));
  const csv = toCsv(rows, BOOKING_CSV_COLUMNS);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${warehouse.slug}-bookings.csv"`,
    },
  });
}
