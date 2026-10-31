import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwner } from "@/lib/helpers";
import { parseEmails, validateCompany } from "@/lib/companies";

// PATCH /api/companies/:id  body: { name?, emails? } — изменить название и/или список email (только владелец)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = supabaseAdmin();
  const { data: company } = await admin.from("booking_companies").select("id, name, warehouse_id").eq("id", params.id).maybeSingle();
  if (!company) return NextResponse.json({ error: t("Компания не найдена") }, { status: 404 });
  if (!(await requireOwner(company.warehouse_id))) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const body = await req.json();
  const name = "name" in body ? String(body.name || "").trim().slice(0, 120) : company.name;
  if (!name) return NextResponse.json({ error: t("Укажите название компании") }, { status: 400 });

  let emails: string[] | null = null;
  if ("emails" in body) {
    const parsed = parseEmails(body.emails);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    emails = parsed.emails!;
    if (!emails.length) return NextResponse.json({ error: t("Укажите хотя бы один email компании") }, { status: 400 });
  }

  const invalid = await validateCompany(company.warehouse_id, name, emails || [], company.id);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 409 });

  if (name !== company.name) {
    const { error } = await admin.from("booking_companies").update({ name }).eq("id", company.id);
    if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? t("Компания «{0}» уже есть в списке", { 0: name }) : error.message }, { status: 409 });
  }
  if (emails) {
    await admin.from("booking_company_emails").delete().eq("company_id", company.id);
    const { error } = await admin.from("booking_company_emails").insert(emails.map((email) => ({ warehouse_id: company.warehouse_id, company_id: company.id, email })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ company: { id: company.id, name, emails } });
}

// DELETE /api/companies/:id — удалить компанию (только владелец).
// Компания убирается и из всех окон; окна, где не осталось ни одной компании, удаляются.
// Уже сделанные брони этой компании остаются (связь с компанией просто обнуляется).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = supabaseAdmin();
  const { data: company } = await admin.from("booking_companies").select("id, warehouse_id").eq("id", params.id).maybeSingle();
  if (!company) return NextResponse.json({ error: t("Компания не найдена") }, { status: 404 });
  if (!(await requireOwner(company.warehouse_id))) return NextResponse.json({ error: t("Нет доступа") }, { status: 403 });

  const { data: wh } = await admin.from("warehouses").select("company_windows").eq("id", company.warehouse_id).single();
  const windows = ((wh?.company_windows || []) as any[])
    .map((w) => ({ ...w, company_ids: (w.company_ids || []).filter((id: string) => id !== params.id) }))
    .filter((w) => w.company_ids.length > 0);

  const { error } = await admin.from("booking_companies").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: updated } = await admin.from("warehouses").update({ company_windows: windows }).eq("id", company.warehouse_id).select().single();

  return NextResponse.json({ ok: true, warehouse: updated });
}
