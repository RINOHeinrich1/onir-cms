import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-wrap site-foot-inner">
        <div className="site-foot-brand">
          <Link href="/" className="brand brand-logo site-brand" aria-label="ONIR CMS — accueil">
            <BrandLogo />
          </Link>
          <p>Conversations, qualification et suivi. Chez vous.</p>
        </div>

        <nav className="site-foot-nav" aria-label="Liens de pied de page">
          <Link href="/plugins">Plugins</Link>
          <Link href="/documentation">Documentation</Link>
          <Link href="/documentation/installation">Installation</Link>
          <a href="https://github.com/RINOHeinrich1/onir-cms" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <Link href="/login">Se connecter</Link>
          <Link href="/mentions-legales">Mentions légales</Link>
          <Link href="/confidentialite-site">Confidentialité</Link>
        </nav>

        <p className="site-foot-meta">Open source · MIT · Auto-hébergé · Édité par ONIRTECH</p>
      </div>
    </footer>
  );
}
