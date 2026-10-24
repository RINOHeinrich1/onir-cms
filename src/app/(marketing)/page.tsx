import type { Metadata } from "next";
import Link from "next/link";
import { DemoLauncher } from "@/components/marketing/DemoLauncher";

export const metadata: Metadata = {
  title: { absolute: "ONIR CMS — Des conversations qui deviennent des prospects" },
  description:
    "ONIR CMS est un CMS open source pour créer des parcours de chat, qualifier avec l’IA et suivre vos prospects dans un seul cockpit.",
};

export default function HomePage() {
  return (
    <main id="contenu" className="site-main">
      <section className="site-wrap site-hero">
        <div className="site-hero-copy">
          <p className="site-kicker">
            <span className="site-kicker-dot" />
            Open source · MIT
          </p>
          <h1>Des conversations qui deviennent des prospects.</h1>
          <p className="site-lead">
            Créez un parcours de chat, laissez l’IA qualifier et retrouvez chaque prospect dans un
            cockpit unique. Chez vous, sans dépendre d’une plateforme tierce.
          </p>
          <div className="site-cta-row">
            <DemoLauncher />
            <Link href="/documentation" className="site-button site-button-ghost">
              Documentation
            </Link>
          </div>
          <p className="site-note">Démo · Plugins gratuits · Auto-hébergé · Sans lock-in</p>
        </div>

        <div className="site-hero-visual" aria-hidden>
          <div className="site-chat-card">
            <div className="site-chat-top">
              <span className="site-kicker-dot" />
              ONIR CMS
              <span className="site-chat-status">en ligne</span>
            </div>
            <p className="site-bubble site-bubble-user">
              Je cherche une solution pour qualifier mes demandes.
            </p>
            <p className="site-bubble site-bubble-ai">
              Très bien. Quel volume traitez-vous chaque mois ?
            </p>
            <div className="site-chat-field">Répondre…</div>
          </div>
          <div className="site-lead-card">
            <span className="site-lead-eyebrow">Fiche prospect</span>
            <strong>Besoin · budget · contact</strong>
            <span className="site-pill">Qualifié</span>
          </div>
        </div>
      </section>

      <section className="site-wrap site-section">
        <div className="site-section-head">
          <p className="site-kicker">L’essentiel</p>
          <h2>Un seul flux, du premier message au suivi.</h2>
        </div>
        <div className="site-grid">
          <article className="site-card">
            <span className="site-number">01</span>
            <h3>Parcours de chat</h3>
            <p>Un lien public, un template visuel et un consentement clair.</p>
          </article>
          <article className="site-card">
            <span className="site-number">02</span>
            <h3>Qualification IA</h3>
            <p>L’IA conduit l’échange avec vos connaissances et votre modèle.</p>
          </article>
          <article className="site-card">
            <span className="site-number">03</span>
            <h3>Suivi centralisé</h3>
            <p>Prospects, conversations et fiches dans le même cockpit.</p>
          </article>
        </div>
      </section>

      <section className="site-band">
        <div className="site-wrap site-band-inner">
          <div>
            <p className="site-kicker site-kicker-light">Marketplace</p>
            <h2>Deux plugins gratuits pour démarrer.</h2>
            <p>Immersive et Starter, prêts à importer dans votre dashboard.</p>
          </div>
          <Link href="/plugins" className="site-button site-button-light">
            Voir les plugins
          </Link>
        </div>
      </section>
    </main>
  );
}
