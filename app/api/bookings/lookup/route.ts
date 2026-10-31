import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/bookings/lookup?id=DK-XXXXX&email=foo@bar.com
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim().toUpperCase();
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!id || !email) return NextResponse.json({ error: t("Укажите ID и email") }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: booking } = await admin.from("bookings").select("*").eq("id", id).maybeSingle();

  if (!booking || booking.email.toLowerCase() !== email) {
    return NextResponse.json({ error: t("Бронь не найдена — проверьте email и ID") }, { status: 404 });
  }

  // Окна для компаний, в которые эту бронь можно перенести (если email брони есть в списке компании)
  let allowedWindows: string[] = [];
  if (booking.company_id) {
    const { data: wh } = await admin.from("warehouses").select("company_windows").eq("id", booking.warehouse_id).maybeSingle();
    allowedWindows = ((wh?.company_windows || []) as any[]).filter((w) => (w.company_ids || []).includes(booking.company_id)).map((w) => w.id);
  }

  return NextResponse.json({ booking, allowedWindows });
}
