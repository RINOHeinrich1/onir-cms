import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/ToastProvider";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
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
