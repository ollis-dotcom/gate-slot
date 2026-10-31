"use client";
import { t } from "@/lib/i18n";

import { SiteHeader } from "@/components/Logo";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    const clean = email.trim().toLowerCase();
    // Письмо отправляет наш сервер — с адреса вашего домена (EMAIL_FROM).
    const res = await fetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: clean }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setLoading(false); setError(j.error || t("Не удалось отправить письмо")); return; }
    if (j.fallback) {
      // Резервный вариант, если почта (Resend) не настроена: стандартное письмо Supabase.
      const supabase = supabaseBrowser();
      await supabase.auth.resetPasswordForEmail(clean, { redirectTo: `${window.location.origin}/reset-password` });
    }
    setLoading(false);
    // Показываем один и тот же результат независимо от того, найден ли email —
    // чтобы нельзя было проверять по этой форме, какие email зарегистрированы.
    setSent(true);
  }

  return (
    <>
    <SiteHeader />
    <div className="max-w-sm mx-auto px-4 py-8">
      <a href="/" className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-ink mb-5"><ArrowLeft size={14} />  {t("Назад ко входу")}</a>

      <div className="text-center mb-6">
                <h1 className="text-xl font-bold text-link">{t("Восстановление пароля")}</h1>
        <p className="text-xs text-gray-500 mt-1">{t("Укажите email, которым регистрировали склад — пришлём ссылку для сброса пароля.")}</p>
      </div>

      {sent ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center space-y-3">
          <div className="text-sm text-gray-700">{t("Если такой email зарегистрирован — на него отправлена ссылка для сброса пароля. Проверьте почту (и папку «Спам»).")}</div>
          <a href="/" className="inline-block text-sm text-gray-600 hover:text-ink underline">{t("Вернуться ко входу")}</a>
        </div>
      ) : (
        <form onSubmit={submit} className="bg-white border border-gray-300 p-4 space-y-4">
          <label className="block">
            <div className="text-xs font-medium text-gray-600 mb-1.5">Email</div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none " />
          </label>
          {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}
          <button disabled={loading} type="submit" className="w-full py-2.5 bg-ink text-amber rounded-md font-semibold text-sm disabled:opacity-50">
            {loading ? t("Отправляем…") : t("Отправить ссылку")}
          </button>
        </form>
      )}
    </div>
    </>
  );
}
