import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSuperAdmin, superAdminEmails } from "@/lib/helpers";

// GET /api/superadmin/warehouse/:id — все брони и журнал уведомлений одного склада (только для просмотра).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const admin = supabaseAdmin();

  const { data: warehouse, error: whError } = await admin
    .from("warehouses")
    .select("id, slug, name, city, address, gates, slot_minutes, start_hour, end_hour, owner_id, created_at")
    .eq("id", params.id)
    .single();
  if (whError || !warehouse) return NextResponse.json({ error: "Склад не найден" }, { status: 404 });

  const { data: ownerUser } = await admin.auth.admin.getUserById(warehouse.owner_id);

  const { data: bookings } = await admin
    .from("bookings")
    .select("*")
    .eq("warehouse_id", params.id)
    .order("date", { ascending: false })
    .order("time", { ascending: false })
    .limit(500);

  const { data: notifications } = await admin
    .from("notifications")
    .select("*")
    .eq("warehouse_id", params.id)
    .order("sent_at", { ascending: false })
    .limit(200);

  return NextResponse.json({
    warehouse: { ...warehouse, ownerEmail: ownerUser?.user?.email || null },
    bookings: bookings || [],
    notifications: notifications || [],
  });
}

// DELETE /api/superadmin/warehouse/:id — безвозвратно удаляет склад.
// Брони и уведомления склада удаляются автоматически через ON DELETE CASCADE в схеме БД.
// Аккаунт (логин/пароль) диспетчера при этом НЕ удаляется — только сам склад и его данные;
// после входа диспетчер увидит предложение создать новый склад.
// С параметром ?withUser=1 удаляется и аккаунт диспетчера.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const admin = supabaseAdmin();

  const { data: warehouse } = await admin.from("warehouses").select("id, owner_id").eq("id", params.id).single();
  if (!warehouse) return NextResponse.json({ error: "Склад не найден" }, { status: 404 });

  const { error } = await admin.from("warehouses").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withUser = new URL(req.url).searchParams.get("withUser") === "1";
  if (withUser && warehouse.owner_id !== user.id) {
    const { data: target } = await admin.auth.admin.getUserById(warehouse.owner_id);
    const email = target?.user?.email?.toLowerCase();
    if (!email || !superAdminEmails().includes(email)) {
      const { error: userError } = await admin.auth.admin.deleteUser(warehouse.owner_id);
      if (userError) return NextResponse.json({ error: "Склад удалён, но аккаунт удалить не удалось: " + userError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
