import { t } from "@/lib/i18n";
import { supabaseAdmin } from "./supabaseAdmin";
import { normEmail, isEmail } from "./helpers";

// Список email из массива или строки «a@b.ru, c@d.ru» (через запятую, точку с запятой, пробел или перенос строки).
export function parseEmails(raw: any): { emails?: string[]; error?: string } {
  const list = (Array.isArray(raw) ? raw : String(raw || "").split(/[\s,;]+/)).map(normEmail).filter(Boolean);
  const bad = list.find((e) => !isEmail(e));
  if (bad) return { error: t("Некорректный email: {0}", { 0: bad }) };
  return { emails: Array.from(new Set(list)) };
}

// Проверки компании перед сохранением: уникальное название и email, не занятые другой компанией склада.
export async function validateCompany(warehouseId: string, name: string, emails: string[], selfId?: string) {
  const admin = supabaseAdmin();
  const { data: all } = await admin.from("booking_companies").select("id, name").eq("warehouse_id", warehouseId);
  const dup = (all || []).find((c) => c.id !== selfId && c.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (dup) return t("Компания «{0}» уже есть в списке", { 0: dup.name });
  if (emails.length) {
    const { data: taken } = await admin
      .from("booking_company_emails")
      .select("email, company_id")
      .eq("warehouse_id", warehouseId)
      .in("email", emails);
    const other = (taken || []).find((t) => t.company_id !== selfId);
    if (other) {
      const owner = (all || []).find((c) => c.id === other.company_id);
      return t("Email {0} уже привязан к компании «{1}»", { 0: other.email, 1: owner?.name || t("другая компания") });
    }
  }
  return null;
}
