"use client";
import { t, locale } from "@/lib/i18n";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Search, Edit3, Mail, X } from "lucide-react";
import { SiteHeader } from "@/components/Logo";
import { zoneSlots, allSlotTimes, findWindow, gateList, type PublicWindow } from "@/lib/schedule";

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function dateLabel(dStr: string) { const d = new Date(dStr + "T00:00:00"); return d.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" }); }

function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}

export default function BookPage({ params, searchParams }: { params: { slug: string }; searchParams: { id?: string; email?: string } }) {
  const [warehouse, setWarehouse] = useState<any>(null);
  const [today, setToday] = useState<string>(fmtDate(new Date()));
  // Ссылка из письма (…/book/склад?id=DK-XXXXX&email=…) сразу открывает управление бронью.
  const linkId = searchParams?.id || "";
  const linkEmail = searchParams?.email || "";
  const [mode, setMode] = useState<"new" | "manage">(linkId && linkEmail ? "manage" : "new");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Email перевозчика (режим В): если он в списке компаний склада — открываются окна этой компании.
  // Запоминаем на этом устройстве, чтобы не вводить каждый раз.
  const [email, setEmail] = useState("");
  const [emailChecked, setEmailChecked] = useState(false);
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    try { const saved = localStorage.getItem("gs_email"); if (saved) setEmail(saved); } catch {}
  }, []);

  useEffect(() => {
    fetch(`/api/warehouses?slug=${params.slug}${email ? `&email=${encodeURIComponent(email)}` : ""}`).then(async (r) => {
      if (!r.ok) { setNotFound(true); setLoading(false); return; }
      const j = await r.json();
      setWarehouse(j.warehouse);
      setCompany(j.company || null);
      setEmailChecked(!!email);
      if (j.today) setToday(j.today);
      setLoading(false);
    });
  }, [params.slug, email]);

  function applyEmail(v: string) {
    const e = v.trim().toLowerCase();
    try { if (e) localStorage.setItem("gs_email", e); else localStorage.removeItem("gs_email"); } catch {}
    setEmail(e);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm font-mono">{t("ЗАГРУЗКА…")}</div>;
  if (notFound || !warehouse) return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">{t("Склад не найден. Проверьте ссылку у склада.")}</div>;

  return (
    <div className="min-h-screen">
      <SiteHeader href={`/book/${warehouse.slug}`} subtitle={[warehouse.city, warehouse.address].filter(Boolean).join(", ")}>
        <span className="font-bold">{warehouse.name}</span>
      </SiteHeader>

      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="text-xs text-gray-500 mb-3">{t("Главная »")} {warehouse.name} » {mode === "new" ? t("Бронирование") : t("Моя бронь")}</div>
        <div className="flex gap-[3px] mb-0">
          <button onClick={() => setMode("new")} className={`tab ${mode === "new" ? "tab-on" : ""}`}>{t("Новая бронь")}</button>
          <button onClick={() => setMode("manage")} className={`tab ${mode === "manage" ? "tab-on" : ""}`}>{t("Отменить / изменить бронь")}</button>
        </div>
        <div className="bg-white border border-gray-300 p-3 sm:p-4 mb-4">
        {warehouse.booking_mode === "companies" && mode === "new" && (
          <CompanyEmailBox company={company} email={email} checked={emailChecked} onApply={applyEmail} />
        )}
        {mode === "new"
          ? <NewBooking key={(company?.id || "public") + email} warehouse={warehouse} today={today} company={company} email={warehouse.booking_mode === "companies" ? email : ""} />
          : <ManageBooking warehouse={warehouse} today={today} initialId={linkId} initialEmail={linkEmail} />}
        </div>
        <div className="text-xs text-gray-500 flex justify-between border-t border-gray-300 pt-2"><span>© Gate-Slot</span><a href="https://gate-slot.com">gate-slot.com</a></div>
      </div>
    </div>
  );
}

function CompanyEmailBox({ company, email, checked, onApply }: any) {
  const [value, setValue] = useState(email || "");
  const [editing, setEditing] = useState(!email);
  useEffect(() => { setValue(email || ""); setEditing(!email); }, [email]);

  if (email && !editing) {
    return (
      <div className={`mb-6 max-w-xl text-sm rounded-md px-4 py-3 flex items-center gap-3 flex-wrap border ${company ? "bg-[#DFF0D8] border-[#A9CC8E]" : "bg-[#F4F6F8] border-gray-300"}`}>
        <Mail size={15} className={company ? "text-[#2F5E17]" : "text-gray-500"} />
        <div className="flex-1 min-w-[200px]">
          {company
            ? <>{t("Вы бронируете как компания")} <b>{company.name}</b> ({email}{t(") — вам доступно время, зарезервированное для неё складом.")}</>
            : checked ? <>Email <b>{email}</b>{t(". Для него у склада нет зарезервированного времени — доступны все свободные слоты.")}</> : <>Email <b>{email}</b></>}
        </div>
        <button onClick={() => setEditing(true)} className="text-xs underline text-gray-600">{t("Изменить")}</button>
        <button onClick={() => onApply("")} className="text-xs underline text-gray-600 flex items-center gap-1"><X size={12} />  {t("Сбросить")}</button>
      </div>
    );
  }
  return (
    <div className="mb-6 max-w-xl bg-white border border-gray-300 rounded-md p-3">
      <div className="text-xs text-gray-600 mb-2">{t("Укажите ваш email. Если склад зарезервировал время для вашей компании, оно откроется для бронирования.")}</div>
      <div className="flex gap-2">
        <input type="email" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onApply(value)}
          placeholder="name@company.ru" className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm" />
        <button onClick={() => onApply(value)} className="px-4 py-2 bg-ink text-amber rounded-md text-sm font-semibold">{t("Продолжить")}</button>
      </div>
    </div>
  );
}

function NewBooking({ warehouse, today, company, email }: any) {
  const [dateOffset, setDateOffset] = useState(0);
  const [selected, setSelected] = useState<{ gate: number; time: string } | null>(null);
  const [form, setForm] = useState({ email: email || "", company: company?.name || "", carrier: "", phone: "", plate: "", cargo: "" });
  const [taken, setTaken] = useState<any[]>([]);
  const [confirmed, setConfirmed] = useState<any>(null);
  const [error, setError] = useState("");

  const date = useMemo(() => addDays(today, dateOffset), [today, dateOffset]);
  // строки сетки — все времена, когда работает хотя бы одна зона; у каждой зоны — свой набор слотов
  const slots = useMemo(() => allSlotTimes(warehouse), [warehouse]);
  const gates = gateList(warehouse);
  const zoneSets = useMemo(() => Object.fromEntries(gates.map((g) => [g, new Set(zoneSlots(warehouse, g))])), [warehouse]);
  const hasClosed = warehouse.booking_mode !== "basic" && gates.some((g) => slots.some((tm) => !zoneSets[g].has(tm)));
  // «Бронирование не дальше чем на N дней»: дальше этой даты листать нельзя.
  const horizon: number | null = warehouse.booking_horizon_days || null;
  const atHorizon = horizon !== null && dateOffset >= horizon;

  // при смене дня сбрасываем выбранный слот
  useEffect(() => { setSelected(null); }, [date]);

  useEffect(() => {
    fetch(`/api/bookings?warehouseId=${warehouse.id}&date=${date}`).then((r) => r.json()).then((j) => setTaken(j.bookings || []));
  }, [date, warehouse.id]);

  function isTaken(gate: number, time: string) {
    return taken.some((b) => b.gate === gate && b.time === time && !["no_show", "cancelled"].includes(b.status));
  }
  // окно для компаний (режим В): reserved — занято под другие компании, mine — окно для компании этого перевозчика
  function windowState(gate: number, time: string): "none" | "reserved" | "mine" {
    const w = findWindow<PublicWindow>(warehouse, date, gate, time);
    if (!w) return "none";
    return w.allowed ? "mine" : "reserved";
  }
  const hasReserved = warehouse.booking_mode === "companies" && gates.some((g) => slots.some((tm) => windowState(g, tm) === "reserved"));
  const hasMine = warehouse.booking_mode === "companies" && gates.some((g) => slots.some((tm) => windowState(g, tm) === "mine"));

  async function submit() {
    if (!selected) return;
    if (!form.email || !form.company || !form.carrier || !form.phone || !form.plate) { setError(t("Заполните обязательные поля")); return; }
    const res = await fetch("/api/bookings", {
      method: "POST",
      body: JSON.stringify({ warehouseId: warehouse.id, warehouseName: warehouse.name, date, gate: selected.gate, time: selected.time, ...form }),
    });
    const j = await res.json();
    if (!res.ok) { setError(j.error || t("Ошибка")); return; }
    setConfirmed(j.booking);
  }

  if (confirmed) {
    return (
      <div className="max-w-md mx-auto py-8 text-center">
        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5"><Check size={28} color="#2B6B4F" strokeWidth={3} /></div>
        <h1 className="text-2xl font-bold font-display mb-2">{t("Бронь подтверждена")}</h1>
        <p className="text-gray-600 text-sm mb-6">{t("Покажите QR-код на въезде — по нему отметят прибытие и убытие")}</p>
        <div className="bg-white border border-gray-300 p-6 mb-6">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(confirmed.id)}`} alt="QR" className="w-[150px] h-[150px] mx-auto mb-4 rounded-md" />
          <div className="font-mono text-2xl font-bold text-link tracking-widest">{confirmed.id}</div>
        </div>
        <div className="bg-white border border-gray-300 rounded-lg p-5 text-left space-y-2 mb-4 text-sm">
          <Row label={t("Дата")} value={dateLabel(confirmed.date)} />
          <Row label={t("Время")} value={confirmed.time} />
          <Row label={t("Зона")} value={`№ ${confirmed.gate}`} />
          <Row label={t("Компания")} value={confirmed.company} />
        </div>
        <p className="text-[11px] text-gray-500 mb-6">{t("Подтверждение со ссылкой для изменения или отмены брони отправлено на")} {confirmed.email}{t(". Также можно открыть вкладку «Отменить / изменить бронь» и ввести email и код")} {confirmed.id}.</p>
        <button onClick={() => { setConfirmed(null); setSelected(null); }} className="text-sm text-gray-600 hover:text-ink underline">{t("Забронировать ещё один слот")}</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setDateOffset((d) => Math.max(0, d - 1))} disabled={dateOffset === 0} className="w-9 h-9 rounded-md border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
        <div className="font-display text-lg font-semibold min-w-[180px] text-center capitalize bg-white border border-gray-300 rounded-md py-2 px-4">{dateLabel(date)}</div>
        <button onClick={() => setDateOffset((d) => (horizon !== null ? Math.min(horizon, d + 1) : d + 1))} disabled={atHorizon} className="w-9 h-9 rounded-md border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
      </div>
      {(horizon !== null || warehouse.cancel_limit_hours) && (
        <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded-md px-3 py-2 mb-6 space-y-0.5 max-w-xl">
          {horizon !== null && <div>{t("Бронирование открыто на")} {horizon}  {t("дн. вперёд — до")} {dateLabel(addDays(today, horizon))}  {t("включительно.")}</div>}
          {!!warehouse.cancel_limit_hours && <div>{t("Отменить или перенести бронь самостоятельно можно не позднее чем за")} {warehouse.cancel_limit_hours}  {t("ч до начала слота.")}</div>}
        </div>
      )}

      <div className="bg-white border border-inkdark overflow-hidden mb-8">
        <div className="grid" style={{ gridTemplateColumns: `90px repeat(${gates.length}, 1fr)` }}>
          <div className="bg-ink p-3" />
          {gates.map((g) => (
            <div key={g} className="bg-ink p-2 text-center border-l border-inkdark">
              <div className="text-[10px] text-white/80 uppercase tracking-widest">{t("Зона")}</div>
              <div className="text-lg font-bold text-white">{g}</div>
            </div>
          ))}
        </div>
        {slots.map((time) => (
          <div key={time} className="grid border-t border-gray-100" style={{ gridTemplateColumns: `90px repeat(${gates.length}, 1fr)` }}>
            <div className="text-xs text-gray-600 flex items-center justify-center border-r border-gray-100 py-2 font-medium font-mono">{time}</div>
            {gates.map((g) => {
              if (!zoneSets[g].has(time)) {
                return <div key={g} title={t("Зона в это время не работает")} className="border-l border-gray-100 py-2.5 text-xs text-center text-gray-300 bg-[repeating-linear-gradient(135deg,#ECEFF2_0,#ECEFF2_4px,#fff_4px,#fff_8px)]">—</div>;
              }
              const isTk = isTaken(g, time);
              const win = windowState(g, time);
              const blocked = isTk || win === "reserved";
              const isSel = selected?.gate === g && selected?.time === time;
              return (
                <button key={g} disabled={blocked} onClick={() => setSelected({ gate: g, time })}
                  title={win === "reserved" ? t("Время зарезервировано складом для определённых компаний") : undefined}
                  className={`border-l border-gray-100 py-2.5 text-xs font-semibold ${isTk ? "bg-[#EEEEEE] text-[#666] font-normal cursor-not-allowed" : win === "reserved" ? "bg-[#FFF3CD] text-[#6B5200] font-normal cursor-not-allowed" : isSel ? "bg-ink text-white" : win === "mine" ? "bg-[#DFF0D8] text-[#2F5E17] hover:bg-[#CDE8C2]" : "bg-white text-link underline font-normal hover:bg-[#EEF4FB]"}`}>
                  {isTk ? t("занято") : win === "reserved" ? t("резерв") : isSel ? t("выбрано") : win === "mine" ? t("для вас") : t("свободно")}
                </button>
              );
            })}
          </div>
        ))}
        {!slots.length && <div className="p-6 text-center text-sm text-gray-500">{t("В этот день склад не принимает брони.")}</div>}
      </div>
      {(hasClosed || hasReserved || hasMine) && (
        <div className="-mt-6 mb-8 flex gap-4 flex-wrap text-[11px] text-gray-500">
          {hasClosed && <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 border border-gray-200 bg-[repeating-linear-gradient(135deg,#ECEFF2_0,#ECEFF2_3px,#fff_3px,#fff_6px)]" />  {t("зона не работает (перерыв)")}</span>}
          {hasReserved && <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 bg-[#FFF3CD] border border-[#E5CF7C]" />  {t("резерв — время для определённых компаний")}</span>}
          {hasMine && <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 bg-[#DFF0D8] border border-[#A9CC8E]" />  {t("окно вашей компании")}</span>}
        </div>
      )}

      {selected && (
        <div className="bg-white border border-gray-300 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-xl font-bold font-display">{t("Данные для брони")}</h2>
            <span className="text-xs bg-[#FFF3CD] text-[#6B5200] px-2 py-0.5 rounded font-mono">{t("Зона")} {selected.gate} · {selected.time}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              ["email", "Email *"], ["company", t("Компания *")], ["carrier", t("Перевозчик *")],
              ["phone", t("Телефон *")], ["plate", t("Номер машины *")], ["cargo", t("Тип груза")],
            ].map(([key, label]) => (
              <label key={key} className="block">
                <div className="text-xs font-medium text-gray-600 mb-1.5">{label}</div>
                <input value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()}
                  readOnly={(key === "company" && !!company) || (key === "email" && !!email)}
                  className={`w-full border border-gray-300 rounded-md px-3 py-2 text-sm ${(key === "company" && company) || (key === "email" && email) ? "bg-gray-50 text-gray-600" : ""}`} />
              </label>
            ))}
            {error && <div className="sm:col-span-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}
            <div className="sm:col-span-2 pt-2">
              <button onClick={submit} className="w-full sm:w-auto px-6 py-3 bg-ink text-amber font-semibold rounded-md flex items-center justify-center gap-2"><Check size={16} />  {t("Подтвердить бронь")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ManageBooking({ warehouse, today, initialId = "", initialEmail = "" }: any) {
  const [email, setEmail] = useState(initialEmail);
  const [id, setId] = useState(initialId);
  const [found, setFound] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [dayBookings, setDayBookings] = useState<any[]>([]);
  const [allowedWindows, setAllowedWindows] = useState<string[]>([]);
  const gates = gateList(warehouse);
  const slots = useMemo(() => {
    if (!edit) return [];
    const list = zoneSlots(warehouse, edit.gate);
    if (found && edit.gate === found.gate && !list.includes(found.time)) return [...list, found.time].sort();
    return list;
  }, [warehouse, edit?.gate, found]);
  // окно, зарезервированное для других компаний, — туда перенести бронь нельзя
  function reserved(g: number, tm: string) {
    if (!found) return false;
    const w = findWindow<PublicWindow>(warehouse, found.date, g, tm);
    return !!w && !allowedWindows.includes(w.id) && !(g === found.gate && tm === found.time);
  }

  // подгружаем брони на дату найденной заявки, чтобы показать занятые слоты
  useEffect(() => {
    if (!found) { setDayBookings([]); return; }
    fetch(`/api/bookings?warehouseId=${warehouse.id}&date=${found.date}`)
      .then((r) => r.json())
      .then((j) => setDayBookings(j.bookings || []));
  }, [found, warehouse.id]);

  function taken(g: number, tm: string) {
    // свой собственный слот не считаем занятым (ID других броней публично не приходят)
    return dayBookings.some((b: any) => !(b.gate === found.gate && b.time === found.time) && b.gate === g && b.time === tm && !["no_show", "cancelled"].includes(b.status));
  }
  const conflict = edit ? taken(edit.gate, edit.time) : false;

  // открыто по ссылке из письма — сразу ищем бронь
  useEffect(() => { if (initialId && initialEmail) search(); }, []);

  // До слота осталось меньше, чем разрешает склад, — отмена/перенос только через склад.
  // (Точную проверку делает сервер; здесь — подсказка, чтобы кнопки не обманывали.)
  const limitHours: number = warehouse.cancel_limit_hours || 0;
  const locked = useMemo(() => {
    if (!found || !limitHours) return false;
    const start = new Date(`${found.date}T${found.time}:00`).getTime();
    return (start - Date.now()) / 3_600_000 < limitHours;
  }, [found, limitHours]);

  useEffect(() => {
    if (!notice) return;
    const tm = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(tm);
  }, [notice]);

  async function search() {
    setNotice("");
    const res = await fetch(`/api/bookings/lookup?id=${encodeURIComponent(id.trim())}&email=${encodeURIComponent(email.trim())}`);
    const j = await res.json();
    if (!res.ok) { setError(j.error); setFound(null); return; }
    setError("");
    setFound(j.booking);
    setAllowedWindows(j.allowedWindows || []);
    setEdit({ carrier: j.booking.carrier, phone: j.booking.phone, plate: j.booking.plate, cargo: j.booking.cargo || "", date: j.booking.date, gate: j.booking.gate, time: j.booking.time });
  }

  async function saveEdit() {
    setError("");
    setNotice("");
    setSaving(true);
    const res = await fetch(`/api/bookings/${found.id}`, { method: "PATCH", body: JSON.stringify({ mode: "self", email, patch: edit }) });
    const j = await res.json();
    setSaving(false);
    if (!res.ok) { setError(j.error || t("Не удалось сохранить изменения")); return; }
    setFound(j.booking);
    setNotice(t("Изменения сохранены"));
  }

  async function cancel() {
    setError("");
    setCancelling(true);
    const res = await fetch(`/api/bookings/${found.id}`, { method: "PATCH", body: JSON.stringify({ mode: "self", email, patch: { status: "cancelled" } }) });
    const j = await res.json();
    setCancelling(false);
    if (!res.ok) { setError(j.error || t("Не удалось отменить бронь")); return; }
    setFound(null); setEdit(null); setEmail(""); setId("");
    setNotice(t("Бронь отменена"));
  }

  return (
    <div className="max-w-md">
      <div className="bg-white border border-gray-300 rounded-lg p-6 space-y-4 mb-6">
        <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Email, указанный при бронировании")}</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></label>
        <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("ID резерва (напр. DK-A7K3M9QP)")}</div>
          <input value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></label>
        {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}
        {notice && <div className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-md flex items-center gap-1.5"><Check size={13} /> {notice}</div>}
        <button onClick={search} className="w-full py-2.5 bg-ink text-amber rounded-md font-semibold text-sm flex items-center justify-center gap-2"><Search size={14} />  {t("Найти бронь")}</button>
      </div>

      {found && found.status !== "confirmed" && (
        <div className="bg-white border border-gray-300 rounded-lg p-6 text-sm text-gray-700">
          
          {t("Бронь")} <b className="font-mono">{found.id}</b>: {found.status === "cancelled" ? t("отменена.") : t("уже обработана складом, изменить её нельзя.")}
        </div>
      )}

      {found && found.status === "confirmed" && (
        <div className="bg-white border border-gray-300 rounded-lg p-6 space-y-4">
          <div className="font-display font-bold">{found.id}</div>
          <div className="text-sm text-gray-600">{dateLabel(found.date)} · {found.time}  {t("· зона")} {found.gate}</div>
          {locked && (
            <div className="text-xs text-[#6B5200] bg-[#FFF3CD] border border-[#E5CF7C] px-3 py-2 rounded-md">
              
              {t("До начала слота меньше")} {limitHours}  {t("ч — отменить или перенести бронь самостоятельно уже нельзя. Для изменений свяжитесь со складом. Данные машины и водителя изменить можно.")}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Зона")}</div>
              <select disabled={locked} value={edit.gate} onChange={(e) => {
                const gate = Number(e.target.value);
                const list = zoneSlots(warehouse, gate);
                setEdit({ ...edit, gate, time: list.includes(edit.time) ? edit.time : (list.find((tm) => !taken(gate, tm) && !reserved(gate, tm)) || list[0] || "") });
              }} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm disabled:bg-gray-50">
                {gates.map((g) => <option key={g} value={g}>{t("Зона")} {g}</option>)}
              </select></label>
            <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Время")}</div>
              <select disabled={locked} value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm disabled:bg-gray-50">
                {!slots.length && <option value="">{t("зона не работает")}</option>}
                {slots.map((tm) => {
                  const busy = taken(edit.gate, tm);
                  const res = reserved(edit.gate, tm);
                  return <option key={tm} value={tm} disabled={busy || res}>{tm}{busy ? t(" (занято)") : res ? t(" (резерв)") : ""}</option>;
                })}
              </select></label>
          </div>
          {conflict && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md">{t("Этот слот уже занят другой заявкой")}</div>}
          {["carrier", "phone", "plate", "cargo"].map((k) => (
            <label key={k} className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{({ carrier: t("Перевозчик"), phone: t("Телефон"), plate: t("Номер машины"), cargo: t("Тип груза") } as any)[k]}</div>
              <input value={(edit as any)[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></label>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={saveEdit} disabled={saving || conflict || !edit.time} className="flex-1 py-2.5 bg-ink text-amber rounded-md font-semibold text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"><Edit3 size={13} /> {saving ? t("Сохранение…") : t("Сохранить")}</button>
            <button onClick={cancel} disabled={cancelling || locked} title={locked ? t("Слишком поздно для самостоятельной отмены") : ""} className="flex-1 py-2.5 border border-red-200 text-red-600 rounded-md font-semibold text-sm disabled:opacity-40">{cancelling ? t("Отмена…") : t("Отменить бронь")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: any) {
  return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-semibold">{value}</span></div>;
}
