import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/i18n/I18nProvider";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trios",
  description: "Le jeu de chiffres où chaque ligne de trois fait 15. The number game where every line of three adds up to 15.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9f0f7" },
    { media: "(prefers-color-scheme: dark)", color: "#071827" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <I18nProvider>
          <Header />
          <main className="page">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
