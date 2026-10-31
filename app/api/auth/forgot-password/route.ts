import { t } from "@/lib/i18n";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { appUrl, sendEmail } from "@/lib/helpers";

// POST /api/auth/forgot-password  body: { email }
// Генерирует ссылку восстановления через Supabase Admin API и отправляет письмо
// со своего домена (через Resend, адрес отправителя — EMAIL_FROM).
// Ссылка ведёт прямо на /reset-password, поэтому не зависит от настроек Redirect URLs в Supabase.
export async function POST(req: NextRequest) {
  const { email: rawEmail } = await req.json().catch(() => ({}));
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: t("Укажите email") }, { status: 400 });

  // Без Resend отправить своё письмо не можем — пусть страница воспользуется стандартным письмом Supabase.
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ fallback: true });

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });

  // Если такого пользователя нет — отвечаем так же, как при успехе,
  // чтобы по этой форме нельзя было проверять, какие email зарегистрированы.
  if (error || !data?.properties?.hashed_token) return NextResponse.json({ ok: true });

  const link = `${appUrl(req)}/reset-password?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`;
  const sent = await sendEmail({
    to: email,
    subject: t("Восстановление пароля"),
    body:
      t("Здравствуйте!\n\nМы получили запрос на смену пароля для входа в кабинет склада.\n\n") +
      t("Чтобы задать новый пароль, откройте ссылку:\n{0}\n\n", { 0: link }) +
      t("Ссылка одноразовая и действует ограниченное время. Если вы не запрашивали смену пароля — просто проигнорируйте это письмо."),
  });

  if (!sent) return NextResponse.json({ error: t("Не удалось отправить письмо. Попробуйте позже.") }, { status: 500 });
  return NextResponse.json({ ok: true });
}
