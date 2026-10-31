import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { genId, requireAccess, sendAndLogEmail, bookingEmail, appUrl, checkBookingHorizon, checkSlotExists, checkCompanyWindow, companyByEmail } from "@/lib/helpers";

// GET /api/bookings?warehouseId=xxx&date=yyyy-mm-dd
// Публично отдаёт занятость слотов (без личных данных).
// Если запрос от авторизованного владельца склада — отдаёт полные данные (для кабинета).
export async function GET(req: NextRequest) {
  const warehouseId = req.nextUrl.searchParams.get("warehouseId");
  const date = req.nextUrl.searchParams.get("date");
  if (!warehouseId) return NextResponse.json({ error: "warehouseId required" }, { status: 400 });

  const admin = supabaseAdmin();
  const owner = await requireAccess(warehouseId);

  let query = admin.from("bookings").select("*").eq("warehouse_id", warehouseId);
  if (date) query = query.eq("date", date);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (owner) {
    // владелец видит всё
    return NextResponse.json({ bookings: data });
  }

  // публично — только занятость, без email/телефона/номера машины и без ID брони
  // (ID + email дают право изменить/отменить бронь, поэтому ID наружу не отдаём)
  const limited = (data || []).map((b) => ({ date: b.date, gate: b.gate, time: b.time, status: b.status }));
  return NextResponse.json({ bookings: limited });
}

// POST /api/bookings — создание новой брони перевозчиком (публично) или диспетчером из кабинета
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { warehouseId, date, gate, time, email, carrier, phone, plate, cargo } = body;
  let company: string = body.company;

  if (!warehouseId || !date || !gate || !time || !email || !carrier || !plate) {
    return NextResponse.json({ error: t("Заполните все обязательные поля") }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: wh } = await admin.from("warehouses").select("*").eq("id", warehouseId).maybeSingle();
  if (!wh) return NextResponse.json({ error: t("Склад не найден") }, { status: 404 });

  // Диспетчер (владелец или доп. диспетчер склада) может ставить брони без ограничений по горизонту;
  // перевозчик — только в пределах «N дней вперёд» из настроек склада.
  const owner = await requireAccess(warehouseId);
  if (!owner) {
    if (!phone) return NextResponse.json({ error: t("Заполните все обязательные поля") }, { status: 400 });
    const horizonError = checkBookingHorizon(date, wh.booking_horizon_days);
    if (horizonError) return NextResponse.json({ error: horizonError }, { status: 400 });
  }
  const slotError = checkSlotExists(wh, Number(gate), time);
  if (slotError) return NextResponse.json({ error: slotError }, { status: 400 });

  // Компания из списка склада определяется по email брони (если email внесён в список склада).
  // Диспетчер может явно выбрать компанию из списка (companyId).
  let companyRow: { id: string; name: string } | null = null;
  if (owner && body.companyId) {
    const { data } = await admin.from("booking_companies").select("id, name").eq("warehouse_id", warehouseId).eq("id", body.companyId).maybeSingle();
    companyRow = data || null;
  }
  if (!companyRow) companyRow = await companyByEmail(warehouseId, email).catch(() => null);
  if (companyRow) company = companyRow.name;
  if (!company) return NextResponse.json({ error: t("Заполните все обязательные поля") }, { status: 400 });

  // Окна, зарезервированные для компаний: перевозчик с email не из списка окна их забронировать не может.
  // Диспетчер может поставить в окно любую бронь (например, по звонку).
  if (!owner) {
    const windowError = checkCompanyWindow(wh, date, Number(gate), time, companyRow?.id);
    if (windowError) return NextResponse.json({ error: windowError }, { status: 403 });
  }

  // проверка занятости слота
  const { data: existing } = await admin
    .from("bookings")
    .select("id")
    .eq("warehouse_id", warehouseId)
    .eq("date", date)
    .eq("gate", gate)
    .eq("time", time)
    .not("status", "in", "(no_show,cancelled)")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: t("Этот слот уже занят") }, { status: 409 });
  }

  const id = genId();
  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      id, warehouse_id: warehouseId, date, gate: Number(gate), time,
      email: String(email).trim().toLowerCase(), company, carrier, phone: phone || "", plate, cargo, status: "confirmed",
      ...(companyRow ? { company_id: companyRow.id } : {}),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mail = bookingEmail("confirmation", booking, wh, appUrl(req));
  await sendAndLogEmail({ warehouseId, to: booking.email, type: "confirmation", ...mail });

  return NextResponse.json({ booking });
}
