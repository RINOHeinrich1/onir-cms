import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function SiteHeader() {
  return (
    <header className="site-head">
      <div className="site-wrap site-head-inner">
        <Link href="/" className="brand brand-logo site-brand" aria-label="ONIR CMS — accueil">
          <BrandLogo priority />
        </Link>

        <nav className="site-nav" aria-label="Navigation principale">
          <Link href="/plugins">Plugins</Link>
          <Link href="/documentation">Documentation</Link>
          <a href="https://github.com/RINOHeinrich1/onir-cms" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>

        <div className="site-actions">
          <ThemeToggle />
          <Link href="/login" className="site-button site-button-sm">
            Se connecter
          </Link>
        </div>
      </div>
    </header>
  );
}
