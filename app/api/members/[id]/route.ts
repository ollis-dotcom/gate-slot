import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwner } from "@/lib/helpers";

async function loadMember(id: string) {
  const admin = supabaseAdmin();
  const { data } = await admin.from("warehouse_members").select("*").eq("id", id).maybeSingle();
  return data;
}

// PATCH /api/members/:id  body: { password?, name? } — владелец задаёт диспетчеру новый пароль или имя
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const member = await loadMember(params.id);
  if (!member) return NextResponse.json({ error: t("Диспетчер не найден") }, { status: 404 });
  if (!(await requireOwner(member.warehouse_id))) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const body = await req.json();
  const admin = supabaseAdmin();
  if ("password" in body) {
    if (String(body.password || "").length < 6) return NextResponse.json({ error: t("Пароль должен быть не короче 6 символов") }, { status: 400 });
    const { error } = await admin.auth.admin.updateUserById(member.user_id, { password: String(body.password) });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if ("name" in body) {
    await admin.from("warehouse_members").update({ name: String(body.name || "").trim().slice(0, 120) || null }).eq("id", member.id);
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/members/:id — убрать диспетчера со склада. Его логин удаляется,
// если он больше нигде не используется (нет своего склада и других складов).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const member = await loadMember(params.id);
  if (!member) return NextResponse.json({ error: t("Диспетчер не найден") }, { status: 404 });
  if (!(await requireOwner(member.warehouse_id))) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("warehouse_members").delete().eq("id", member.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: own } = await admin.from("warehouses").select("id").eq("owner_id", member.user_id).limit(1);
  const { data: other } = await admin.from("warehouse_members").select("id").eq("user_id", member.user_id).limit(1);
  if (!(own || []).length && !(other || []).length) {
    await admin.auth.admin.deleteUser(member.user_id);
  }
  return NextResponse.json({ ok: true });
}
