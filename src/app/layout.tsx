import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/ToastProvider";
import "./globals.css";

const montserrat = localFont({
  src: [
    { path: "./fonts/montserrat-latin-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/montserrat-latin-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-montserrat",
  display: "swap",
  fallback: ["Segoe UI", "Arial", "sans-serif"],
});

/**
 * Applique le thème avant l'hydratation — aucun flash blanc/noir.
 * Priorité : choix mémorisé (toggle de la charte), sinon préférence système.
 */
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;

export const metadata: Metadata = {
  title: {
    default: "ONIR CMS",
    template: "%s · ONIR CMS",
  },
  description: "ONIR CMS — prospection et conversations assistées par IA, open source.",
};

/**
 * Le clavier virtuel redimensionne le contenu (`resizes-content`) : la zone
 * de chat s'ajuste et le champ de saisie reste visible sur mobile.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fr"
      data-theme="light"
      className={`${montserrat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script anti-flash sans donnée dynamique */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
