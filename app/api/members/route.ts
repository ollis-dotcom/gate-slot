import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwner } from "@/lib/helpers";

export const dynamic = "force-dynamic";

// GET /api/members?warehouseId=xxx — владелец и дополнительные диспетчеры склада (видит только владелец)
export async function GET(req: NextRequest) {
  const warehouseId = req.nextUrl.searchParams.get("warehouseId") || "";
  const me = await requireOwner(warehouseId);
  if (!me) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("warehouse_members")
    .select("id, user_id, email, name, role, created_at")
    .eq("warehouse_id", warehouseId)
    .order("created_at", { ascending: true });
  if (error) {
    if (/warehouse_members/.test(error.message)) return NextResponse.json({ owner: { email: me.email }, members: [], needsMigration: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ owner: { email: me.email }, members: data || [] });
}

// POST /api/members  body: { warehouseId, email, password, name } — создать аккаунт диспетчера (только владелец).
// Аккаунт создаётся сразу подтверждённым: диспетчер может войти на главной странице с этим email и паролем.
export async function POST(req: NextRequest) {
  const { warehouseId, email: rawEmail, password, name } = await req.json();
  const me = await requireOwner(warehouseId);
  if (!me) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const email = String(rawEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: t("Укажите корректный email") }, { status: 400 });
  if (String(password || "").length < 6) return NextResponse.json({ error: t("Пароль должен быть не короче 6 символов") }, { status: 400 });

  const admin = supabaseAdmin();
  // проверяем, что таблица уже есть, до создания аккаунта — чтобы не оставить «висящий» логин
  const { error: tableError } = await admin.from("warehouse_members").select("id").limit(1);
  if (tableError) {
    return NextResponse.json({ error: t("Таблица диспетчеров ещё не создана. Выполните SQL из supabase/migrations/2026-10-03_dispatchers_modes.sql в Supabase → SQL Editor.") }, { status: 500 });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: String(password),
    email_confirm: true,
  });
  if (createError || !created?.user) {
    const msg = createError?.message || "";
    if (/already|registered|exists/i.test(msg)) {
      return NextResponse.json({ error: t("Этот email уже зарегистрирован в Gate-Slot. Укажите другой email для диспетчера.") }, { status: 409 });
    }
    return NextResponse.json({ error: msg || t("Не удалось создать аккаунт") }, { status: 500 });
  }

  const { data: member, error } = await admin
    .from("warehouse_members")
    .insert({ warehouse_id: warehouseId, user_id: created.user.id, email, name: String(name || "").trim().slice(0, 120) || null, role: "dispatcher" })
    .select("id, user_id, email, name, role, created_at")
    .single();
  if (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ member });
}
