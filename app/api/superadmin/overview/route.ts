import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSuperAdmin } from "@/lib/helpers";

// GET /api/superadmin/overview — список всех складов сервиса с адресами, владельцами и счётчиками броней.
// Доступно только email из SUPER_ADMIN_EMAILS.
export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const admin = supabaseAdmin();

  const { data: warehouses, error } = await admin
    .from("warehouses")
    .select("id, slug, name, city, address, gates, slot_minutes, start_hour, end_hour, owner_id, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: bookingRows } = await admin.from("bookings").select("warehouse_id, date, status");
  const today = new Date().toISOString().slice(0, 10);
  const stats: Record<string, { total: number; today: number }> = {};
  for (const b of bookingRows || []) {
    if (!stats[b.warehouse_id]) stats[b.warehouse_id] = { total: 0, today: 0 };
    if (b.status !== "cancelled") stats[b.warehouse_id].total += 1;
    if (b.date === today && b.status !== "cancelled") stats[b.warehouse_id].today += 1;
  }

  // email владельцев складов — таблица auth.users не отдаётся через обычный PostgREST-запрос,
  // поэтому берём её через Auth Admin API (доступен только service role ключу).
  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((usersPage?.users || []).map((u) => [u.id, u.email]));

  const result = (warehouses || []).map((w) => ({
    ...w,
    ownerEmail: emailById.get(w.owner_id) || null,
    totalBookings: stats[w.id]?.total || 0,
    todayBookings: stats[w.id]?.today || 0,
  }));

  return NextResponse.json({
    warehouses: result,
    totals: {
      warehouses: result.length,
      bookings: result.reduce((s, w) => s + w.totalBookings, 0),
      bookingsToday: result.reduce((s, w) => s + w.todayBookings, 0),
    },
  });
}
