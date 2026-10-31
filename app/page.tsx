"use client";
import { t } from "@/lib/i18n";

import { SiteHeader } from "@/components/Logo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) { setLoading(false); setError(t("Неверный email или пароль")); return; }
    // Супер-админ без своего склада попадает сразу в супер-админку.
    const me = await fetch("/api/me").then((r) => r.json()).catch(() => null);
    setLoading(false);
    if (me?.superAdmin && !me?.hasWarehouse) { router.push("/superadmin"); return; }
    router.push("/dashboard");
  }

  return (
    <>
    <SiteHeader />
    <div className="max-w-sm mx-auto px-4 py-8">
      <div className="text-center mb-6">
                <h1 className="text-xl font-bold text-link">{t("Вход в кабинет склада")}</h1>
        <p className="text-xs text-gray-500 mt-1">{t("Доступ по логину и паролю. Сотрудники склада входят здесь же — под логином, который им выдал владелец кабинета (вкладка «Пользователи»).")}</p>
      </div>

      <form onSubmit={submit} className="bg-white border border-gray-300 p-4 space-y-4">
        <label className="block">
          <div className="text-xs font-medium text-gray-600 mb-1.5">Email</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none " />
        </label>
        <label className="block">
          <div className="text-xs font-medium text-gray-600 mb-1.5">{t("Пароль")}</div>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none " />
        </label>
        {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}
        <button disabled={loading} type="submit" className="w-full py-2.5 bg-ink text-amber rounded-md font-semibold text-sm disabled:opacity-50">
          {loading ? t("Входим…") : t("Войти")}
        </button>
        <a href="/forgot-password" className="block text-center text-xs text-gray-500 hover:text-ink underline">
          
          {t("Забыли пароль?")}
        </a>
      </form>

      <a href="/register" className="block text-center text-sm text-gray-600 hover:text-ink underline mt-5">
        
        {t("Нет аккаунта? Зарегистрировать склад")}
      </a>
      <p className="text-[10px] text-gray-400 text-center mt-6 leading-relaxed">
        
        {t("Если у вас есть ссылка на бронирование от склада (вида .../book/название-склада) — просто откройте её, вход не требуется.")}
      </p>
    </div>
    </>
  );
}
