import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/helpers";

// GET /api/superadmin/check — используется, чтобы показать/скрыть ссылку на супер-админку в кабинете
export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ ok: false }, { status: 403 });
  return NextResponse.json({ ok: true });
}
