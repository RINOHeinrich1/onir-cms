import type { ReactNode } from "react";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <a className="site-skip" href="#contenu">
        Aller au contenu
      </a>
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
