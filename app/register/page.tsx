"use client";
import { t } from "@/lib/i18n";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/Logo";
import { supabaseBrowser } from "@/lib/supabaseClient";

function slugify(name: string) {
  const base = name.toLowerCase().trim().replace(/[^a-zа-я0-9\s-]/gi, "").replace(/\s+/g, "-").slice(0, 24);
  return (base || "sklad") + "-" + Math.random().toString(36).slice(2, 6);
}

export default function RegisterPage() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", city: "", address: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!f.name.trim()) return setError(t("Укажите название склада"));
    if (!f.city.trim()) return setError(t("Укажите город"));
    if (!f.email.trim()) return setError(t("Укажите email"));
    if (f.password.length < 6) return setError(t("Пароль должен быть не короче 6 символов (требование Supabase)"));
    setError("");
    setLoading(true);

    const supabase = supabaseBrowser();
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: f.email.trim().toLowerCase(),
      password: f.password,
    });

    if (signUpError) {
      setLoading(false);
      if (/already|registered|exists/i.test(signUpError.message)) {
        setError(t("Этот email уже зарегистрирован. Войдите под ним — если склада нет, в кабинете можно будет создать новый."));
      } else {
        setError(signUpError.message);
      }
      return;
    }
    if (!signUpData.user) { setLoading(false); setError(t("Не удалось создать пользователя")); return; }

    const slug = slugify(f.name);
    const { error: insertError } = await supabase.from("warehouses").insert({
      owner_id: signUpData.user.id,
      slug,
      name: f.name.trim(),
      city: f.city.trim(),
      address: f.address.trim() || null,
    });

    setLoading(false);
    if (insertError) { setError(insertError.message); return; }

    // Если в проекте Supabase включено подтверждение email — сессии ещё нет,
    // и signInWithPassword ниже не сработает, пока письмо не подтверждено.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
    if (signInError) {
      alert(t("Склад создан. Проверьте почту и подтвердите email, затем войдите."));
      router.push("/");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <>
    <SiteHeader />
    <div className="max-w-sm mx-auto px-4 py-8">
      <a href="/" className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-ink mb-5"><ArrowLeft size={14} />  {t("Назад ко входу")}</a>
      <div className="flex items-center gap-2 mb-5">
        <h1 className="text-xl font-bold text-link">{t("Регистрация склада")}</h1>
      </div>
      <div className="bg-white border border-gray-300 p-4 space-y-4">
        {["name", "city", "address", "email"].map((key) => (
          <label key={key} className="block">
            <div className="text-xs font-medium text-gray-600 mb-1.5">
              {key === "name" ? t("Название склада *") : key === "city" ? t("Город *") : key === "address" ? t("Адрес (улица, дом)") : t("Email (логин) *")}
            </div>
            <input
              value={(f as any)[key]}
              onChange={(e) => setF({ ...f, [key]: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none "
            />
          </label>
        ))}
        <label className="block">
          <div className="text-xs font-medium text-gray-600 mb-1.5">{t("Пароль (мин. 6 симв.) *")}</div>
          <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none " />
        </label>
        {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}
        <button onClick={handleSave} disabled={loading} className="w-full py-2.5 bg-ink text-amber rounded-md font-semibold text-sm disabled:opacity-50">
          {loading ? t("Создаём…") : t("Создать склад")}
        </button>
      </div>
    </div>
    </>
  );
}
