import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAccess, requireOwner } from "@/lib/helpers";
import { parseEmails, validateCompany } from "@/lib/companies";

export const dynamic = "force-dynamic";

const MIGRATION_HINT = "Выполните SQL из supabase/migrations/2026-10-04_company_emails.sql в Supabase → SQL Editor.";

// GET /api/companies?warehouseId=xxx — компании склада с их email (для любого сотрудника склада)
export async function GET(req: NextRequest) {
  const warehouseId = req.nextUrl.searchParams.get("warehouseId") || "";
  if (!(await requireAccess(warehouseId))) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("booking_companies").select("id, name, created_at").eq("warehouse_id", warehouseId).order("name");
  if (error) {
    if (/booking_companies/.test(error.message)) return NextResponse.json({ companies: [], needsMigration: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data: emails, error: emailsError } = await admin.from("booking_company_emails").select("company_id, email").eq("warehouse_id", warehouseId).order("created_at");
  const byCompany = new Map<string, string[]>();
  for (const e of emails || []) {
    if (!byCompany.has(e.company_id)) byCompany.set(e.company_id, []);
    byCompany.get(e.company_id)!.push(e.email);
  }
  return NextResponse.json({
    companies: (data || []).map((c) => ({ ...c, emails: byCompany.get(c.id) || [] })),
    needsMigration: !!emailsError,
  });
}

// POST /api/companies  body: { warehouseId, name, emails } — добавить компанию (только владелец)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { warehouseId } = body;
  if (!(await requireOwner(warehouseId))) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const name = String(body.name || "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: t("Укажите название компании") }, { status: 400 });
  const parsed = parseEmails(body.emails);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const emails = parsed.emails!;
  if (!emails.length) return NextResponse.json({ error: t("Укажите хотя бы один email компании") }, { status: 400 });

  const invalid = await validateCompany(warehouseId, name, emails);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 409 });

  const admin = supabaseAdmin();
  const { data: company, error } = await admin.from("booking_companies").insert({ warehouse_id: warehouseId, name }).select("id, name, created_at").single();
  if (error) {
    // уникальный индекс в базе ловит одновременное двойное нажатие «Добавить»
    if (/uq_companies_name|duplicate|unique/i.test(error.message)) return NextResponse.json({ error: t("Компания «{0}» уже есть в списке", { 0: name }) }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { error: emailError } = await admin.from("booking_company_emails").insert(emails.map((email) => ({ warehouse_id: warehouseId, company_id: company.id, email })));
  if (emailError) {
    await admin.from("booking_companies").delete().eq("id", company.id);
    if (/booking_company_emails/.test(emailError.message) && !/duplicate|unique/i.test(emailError.message)) {
      return NextResponse.json({ error: t("Таблица email компаний ещё не создана. ") + t(MIGRATION_HINT) }, { status: 500 });
    }
    if (/duplicate|unique/i.test(emailError.message)) return NextResponse.json({ error: t("Один из email уже привязан к другой компании") }, { status: 409 });
    return NextResponse.json({ error: emailError.message }, { status: 500 });
  }
  return NextResponse.json({ company: { ...company, emails } });
}
