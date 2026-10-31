import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { findUserWarehouse, superAdminEmails } from "@/lib/helpers";

export const dynamic = "force-dynamic";

// GET /api/me — кто вошёл: email, супер-админ ли, какой склад ему доступен и с какой ролью
// (owner — владелец склада, dispatcher — дополнительный диспетчер, добавленный владельцем).
export async function GET() {
  const supa = supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  const access = await findUserWarehouse(user.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    superAdmin: !!user.email && superAdminEmails().includes(user.email.toLowerCase()),
    hasWarehouse: !!access,
    warehouse: access?.warehouse || null,
    role: access?.role || null,
  });
}
