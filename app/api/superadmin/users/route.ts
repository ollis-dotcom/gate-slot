import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSuperAdmin, superAdminEmails } from "@/lib/helpers";

export const dynamic = "force-dynamic";

// GET /api/superadmin/users — все аккаунты сервиса и их склады (в т.ч. аккаунты без склада).
export async function GET() {
  const me = await requireSuperAdmin();
  if (!me) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: usersPage, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: warehouses } = await admin.from("warehouses").select("id, name, slug, owner_id");
  const byOwner = new Map<string, { id: string; name: string; slug: string }[]>();
  for (const w of warehouses || []) {
    if (!byOwner.has(w.owner_id)) byOwner.set(w.owner_id, []);
    byOwner.get(w.owner_id)!.push({ id: w.id, name: w.name, slug: w.slug });
  }
  const { data: memberRows } = await admin.from("warehouse_members").select("user_id, warehouse_id");
  const whById = new Map((warehouses || []).map((w) => [w.id, w]));
  const byMember = new Map<string, { id: string; name: string; slug: string }[]>();
  for (const m of memberRows || []) {
    const w = whById.get(m.warehouse_id);
    if (!w) continue;
    if (!byMember.has(m.user_id)) byMember.set(m.user_id, []);
    byMember.get(m.user_id)!.push({ id: w.id, name: w.name, slug: w.slug });
  }
  const supers = superAdminEmails();

  const users = (usersPage?.users || [])
    .map((u) => ({
      id: u.id,
      email: u.email || "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at || null,
      warehouses: byOwner.get(u.id) || [],
      dispatcherOf: byMember.get(u.id) || [],
      isSuperAdmin: !!u.email && supers.includes(u.email.toLowerCase()),
      isMe: u.id === me.id,
    }))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  return NextResponse.json({ users });
}
