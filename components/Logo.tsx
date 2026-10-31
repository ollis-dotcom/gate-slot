"use client";

import { getLang } from "@/lib/i18n";
import { LangSwitcher } from "./LangProvider";
// Логотип Gate-Slot (вариант 3 «Анфас»): грузовик смотрит из проёма ворот склада.
// color — цвет значка, bg — цвет фона под ним (им «вырезаются» стекло и фары).

export function LogoMark({ size = 28, color = "currentColor", bg = "#4A76A8" }: { size?: number; color?: string; bg?: string }) {
  return (
    <svg width={size * 32 / 28} height={size} viewBox="0 0 32 28" aria-hidden="true" className="shrink-0">
      {/* рама ворот и поднятая дверь */}
      <path d="M2 27V3h28v24" fill="none" stroke={color} strokeWidth="2.4" />
      <rect x="4.6" y="5.4" width="22.8" height="2" fill={color} />
      {/* кабина анфас */}
      <rect x="8" y="10.5" width="16" height="13" rx="1.5" fill={color} />
      <rect x="9.8" y="12.3" width="12.4" height="4.6" fill={bg} />
      <rect x="5.8" y="12.6" width="1.6" height="3.4" fill={color} />
      <rect x="24.6" y="12.6" width="1.6" height="3.4" fill={color} />
      <circle cx="11" cy="20.4" r="1.2" fill={bg} />
      <circle cx="21" cy="20.4" r="1.2" fill={bg} />
      <rect x="9" y="23.5" width="3.4" height="3" fill={color} />
      <rect x="19.6" y="23.5" width="3.4" height="3" fill={color} />
    </svg>
  );
}

// Логотип для синей шапки: белый значок + надпись.
export default function Logo({ subtitle, size = 26, href }: { subtitle?: React.ReactNode; size?: number; href?: string }) {
  const body = (
    <span className="flex items-center gap-2 text-white">
      <LogoMark size={size} color="#FFFFFF" bg="#4A76A8" />
      <span className="flex flex-col">
        <span className="font-bold text-lg leading-none">Gate-Slot</span>
        {subtitle && <span className="text-[12px] text-white/90 mt-0.5">{subtitle}</span>}
      </span>
    </span>
  );
  return href ? <a href={href} className="flex items-center no-underline">{body}</a> : body;
}

// Синяя шапка сайта в стиле 2010: логотип слева, всё остальное (children) справа.
export function SiteHeader({ subtitle, href = "/", children, wide = false }: { subtitle?: React.ReactNode; href?: string; children?: React.ReactNode; wide?: boolean }) {
  return (
    <div className="bg-ink border-b-2 border-inkdark sticky top-0 z-40">
      <div className={`${wide ? "max-w-6xl" : "max-w-5xl"} mx-auto px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-white text-[13px]`}>
        <Logo href={href} subtitle={subtitle} />
        <div className="flex items-center gap-2 flex-wrap">
          {children}
          {children && <span className="text-white/60">|</span>}
          <LangSwitcher current={getLang()} />
        </div>
      </div>
    </div>
  );
}
