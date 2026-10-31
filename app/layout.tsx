import "./globals.css";
import "@/lib/i18n-server";
import { requestLang } from "@/lib/i18n-server";
import { translate } from "@/lib/i18n";
import LangProvider from "@/components/LangProvider";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const lang = requestLang();
  return {
    title: translate(lang, "Gate-Slot — бронирование слотов на склад"),
    description: translate(lang, "Система бронирования слотов разгрузки/погрузки для складов"),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = requestLang();
  return (
    <html lang={lang}>
      <body>
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
