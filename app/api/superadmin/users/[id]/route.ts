import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSuperAdmin, superAdminEmails } from "@/lib/helpers";

// DELETE /api/superadmin/users/:id — безвозвратно удаляет аккаунт (логин/пароль).
// Склад этого пользователя и все его брони и уведомления удаляются вместе с ним
// (в базе стоит ON DELETE CASCADE: пользователь → склад → брони/уведомления).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const me = await requireSuperAdmin();
  if (!me) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (params.id === me.id) return NextResponse.json({ error: "Нельзя удалить собственный аккаунт" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: target } = await admin.auth.admin.getUserById(params.id);
  if (!target?.user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  if (target.user.email && superAdminEmails().includes(target.user.email.toLowerCase())) {
    return NextResponse.json({ error: "Это аккаунт супер-админа. Сначала уберите его email из SUPER_ADMIN_EMAILS в Vercel." }, { status: 400 });
  }

  // Явно удаляем склады (на случай, если каскад в базе не настроен), затем сам аккаунт.
  await admin.from("warehouses").delete().eq("owner_id", params.id);
  const { error } = await admin.auth.admin.deleteUser(params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
