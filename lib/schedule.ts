import { t } from "@/lib/i18n";
// ============================================================
// Расписание склада: какие слоты существуют у каждой зоны и кто может их бронировать.
// Файл без серверных зависимостей — используется и на страницах (браузер), и в API (сервер),
// чтобы сетка, которую видит перевозчик, и проверки на сервере всегда совпадали.
//
// Режимы работы (уровни):
//   basic     — А. Общие часы работы и длительность слота для всех зон.
//   zones     — Б. У каждой зоны свой график: несколько интервалов в день
//                  (перерыв на обед, пауза посреди дня, вечерняя смена).
//   companies — В. Как Б, плюс «окна» — промежутки времени, которые могут бронировать
//                  только выбранные компании из списка склада.
// ============================================================

export type BookingMode = "basic" | "zones" | "companies";
export const BOOKING_MODES: BookingMode[] = ["basic", "zones", "companies"];

export type Interval = { start: string; end: string }; // "HH:MM"
export type ZoneSchedule = Record<string, Interval[]>; // ключ — номер зоны ("1", "2", …)

export type CompanyWindow = {
  id: string;
  gates: number[] | null;     // null — все зоны
  weekdays: number[] | null;  // 1 = пн … 7 = вс; null — каждый день
  start: string;              // "HH:MM"
  end: string;                // "HH:MM"
  company_ids: string[];      // кто может бронировать в этом окне
};

// Публичный вид окна (без списка компаний): allowed = текущий перевозчик может бронировать в этом окне.
export type PublicWindow = Omit<CompanyWindow, "company_ids"> & { allowed: boolean };

export type ScheduleWarehouse = {
  gates: number;
  slot_minutes: number;
  start_hour: number;
  end_hour: number;
  booking_mode?: string | null;
  zone_schedule?: ZoneSchedule | null;
  company_windows?: (CompanyWindow | PublicWindow)[] | null;
};

export const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

const pad = (n: number) => String(n).padStart(2, "0");

export function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function fromMin(min: number) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
export function isHHMM(v: any) {
  if (typeof v !== "string" || !/^\d{2}:\d{2}$/.test(v)) return false;
  const [h, m] = v.split(":").map(Number);
  return (h < 24 && m < 60) || (h === 24 && m === 0);
}

export function modeOf(wh: ScheduleWarehouse): BookingMode {
  return BOOKING_MODES.includes(wh.booking_mode as BookingMode) ? (wh.booking_mode as BookingMode) : "basic";
}

export function gateList(wh: ScheduleWarehouse) {
  return Array.from({ length: wh.gates }, (_, i) => i + 1);
}

// Общие часы работы (режим А) в виде одного интервала.
export function basicInterval(wh: ScheduleWarehouse): Interval {
  return { start: fromMin(wh.start_hour * 60), end: fromMin(wh.end_hour * 60) };
}

// Интервалы работы зоны. В режиме А — общие часы. В режимах Б/В — график зоны;
// если для зоны график не задан — общие часы; пустой список — зона не работает.
export function zoneIntervals(wh: ScheduleWarehouse, gate: number): Interval[] {
  if (modeOf(wh) === "basic") return [basicInterval(wh)];
  const z = wh.zone_schedule?.[String(gate)];
  if (!Array.isArray(z)) return [basicInterval(wh)];
  return z;
}

// Слоты одной зоны («HH:MM» начала слота).
export function zoneSlots(wh: ScheduleWarehouse, gate: number): string[] {
  const step = Math.max(5, Number(wh.slot_minutes) || 30);
  const out: string[] = [];
  if (modeOf(wh) === "basic") {
    // как было раньше: слоты идут, пока начало слота раньше конца рабочего дня
    for (let tm = wh.start_hour * 60; tm < wh.end_hour * 60; tm += step) out.push(fromMin(tm));
    return out;
  }
  // режимы Б/В: слот должен целиком помещаться в интервал (чтобы не заезжать на перерыв)
  for (const iv of zoneIntervals(wh, gate)) {
    const end = toMin(iv.end);
    for (let tm = toMin(iv.start); tm + step <= end; tm += step) out.push(fromMin(tm));
  }
  return Array.from(new Set(out)).sort();
}

// Все времена, встречающиеся хотя бы в одной зоне — строки сетки бронирования.
export function allSlotTimes(wh: ScheduleWarehouse): string[] {
  const set = new Set<string>();
  for (const g of gateList(wh)) for (const tm of zoneSlots(wh, g)) set.add(tm);
  return Array.from(set).sort();
}

// День недели для даты YYYY-MM-DD: 1 = понедельник … 7 = воскресенье.
export function weekdayOf(date: string) {
  const d = new Date(date + "T00:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}

// Окно для компаний, в которое попадает слот (только режим В). null — слот открыт всем.
export function findWindow<W extends CompanyWindow | PublicWindow>(
  wh: { booking_mode?: string | null; company_windows?: W[] | null },
  date: string, gate: number, time: string
): W | null {
  if (wh.booking_mode !== "companies") return null;
  const wd = weekdayOf(date);
  const tm = toMin(time);
  for (const w of wh.company_windows || []) {
    if (w.gates && w.gates.length && !w.gates.includes(gate)) continue;
    if (w.weekdays && w.weekdays.length && !w.weekdays.includes(wd)) continue;
    if (tm >= toMin(w.start) && tm < toMin(w.end)) return w;
  }
  return null;
}

// ============================================================
// Проверка и нормализация настроек, присланных из кабинета (используется сервером)
// ============================================================

function normIntervals(raw: any, label: string): { value?: Interval[]; error?: string } {
  if (!Array.isArray(raw)) return { error: t("{0}: неверный формат графика", { 0: label }) };
  const list: Interval[] = [];
  for (const iv of raw) {
    if (!isHHMM(iv?.start) || !isHHMM(iv?.end)) return { error: t("{0}: время нужно указать в формате ЧЧ:ММ", { 0: label }) };
    if (toMin(iv.start) >= toMin(iv.end)) return { error: t("{0}: конец интервала {1}–{2} должен быть позже начала", { 0: label, 1: iv.start, 2: iv.end }) };
    list.push({ start: iv.start, end: iv.end });
  }
  list.sort((a, b) => toMin(a.start) - toMin(b.start));
  for (let i = 1; i < list.length; i++) {
    if (toMin(list[i].start) < toMin(list[i - 1].end)) {
      return { error: t("{0}: интервалы {1}–{2} и {3}–{4} пересекаются", { 0: label, 1: list[i - 1].start, 2: list[i - 1].end, 3: list[i].start, 4: list[i].end }) };
    }
  }
  return { value: list };
}

export function normalizeZoneSchedule(raw: any, gates: number): { value?: ZoneSchedule | null; error?: string } {
  if (raw === null || raw === undefined) return { value: null };
  if (typeof raw !== "object") return { error: t("Неверный формат графика зон") };
  const out: ZoneSchedule = {};
  for (let g = 1; g <= gates; g++) {
    if (!(String(g) in raw)) continue;
    const r = normIntervals(raw[String(g)], t("Зона {0}", { 0: g }));
    if (r.error) return { error: r.error };
    out[String(g)] = r.value!;
  }
  return { value: out };
}

export function normalizeWindows(raw: any, gates: number, companyIds: string[]): { value?: CompanyWindow[] | null; error?: string } {
  if (raw === null || raw === undefined) return { value: null };
  if (!Array.isArray(raw)) return { error: t("Неверный формат окон для компаний") };
  const result: CompanyWindow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    const label = t("Окно {0}", { 0: i + 1 });
    if (!isHHMM(w?.start) || !isHHMM(w?.end)) return { error: t("{0}: время нужно указать в формате ЧЧ:ММ", { 0: label }) };
    if (toMin(w.start) >= toMin(w.end)) return { error: t("{0}: конец должен быть позже начала", { 0: label }) };
    const nums = (arr: any, max: number): number[] =>
      Array.isArray(arr) ? Array.from(new Set<number>(arr.map(Number))).filter((n) => Number.isInteger(n) && n >= 1 && n <= max).sort((a, b) => a - b) : [];
    const g = nums(w.gates, gates);
    const wd = nums(w.weekdays, 7);
    const ids: string[] = Array.isArray(w.company_ids) ? Array.from(new Set<string>(w.company_ids.map(String))).filter((id) => companyIds.includes(id)) : [];
    if (!ids.length) return { error: t("{0}: выберите хотя бы одну компанию", { 0: label }) };
    result.push({
      id: typeof w.id === "string" && w.id ? w.id.slice(0, 40) : Math.random().toString(36).slice(2, 10),
      gates: g.length && g.length < gates ? g : null,
      weekdays: wd.length && wd.length < 7 ? wd : null,
      start: w.start,
      end: w.end,
      company_ids: ids,
    });
  }
  return { value: result };
}

// Публичная версия окон: без списка компаний, с отметкой «можно ли этому перевозчику».
export function publicWindows(windows: CompanyWindow[] | null | undefined, companyId: string | null): PublicWindow[] {
  return (windows || []).map(({ company_ids, ...rest }) => ({ ...rest, allowed: !!companyId && company_ids.includes(companyId) }));
}

// Короткое описание окна для подсказок: «пн, ср · 08:00–10:00 · зоны 1, 2»
export function describeWindow(w: { gates: number[] | null; weekdays: number[] | null; start: string; end: string }) {
  const days = w.weekdays && w.weekdays.length ? w.weekdays.map((d) => t(WEEKDAYS[d - 1])).join(", ") : t("ежедневно");
  const zones = w.gates && w.gates.length ? t("зоны {0}", { 0: w.gates.join(", ") }) : t("все зоны");
  return `${days} · ${w.start}–${w.end} · ${zones}`;
}
