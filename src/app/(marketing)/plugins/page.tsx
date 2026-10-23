import type { Metadata } from "next";
import Link from "next/link";
import { PluginIcon } from "@/components/marketing/PluginIcon";

export const metadata: Metadata = {
  title: { absolute: "Plugins gratuits · ONIR CMS" },
  description:
    "Téléchargez les templates visuels Immersive et Starter pour ONIR CMS. Gratuits, prêts à importer.",
};

const PLUGINS = [
  {
    id: "immersive",
    name: "Immersive",
    version: "4.44.0",
    description:
      "Une scène 3D complète : maison d’entrée, salle, avatar, album et discussion guidée.",
    details:
      "Template officiel avec assets CC0 inclus. Scène 3D, avatar TalkingHead, album, connaissances, médias et paramètres de lien.",
    tags: ["Scène 3D", "Avatar", "Album"],
    size: "3,8 Mo",
    sha: "c0e8a9b6b64e77652f3dd1de3b666b8b2d744132232274a6ff7510a14b1e166e",
    file: "immersive-4.44.0.onirtech-template",
  },
  {
    id: "starter",
    name: "Starter",
    version: "1.0.1",
    description: "Le template de référence : formulaire d’identification, conversation et médias.",
    details:
      "Le point de départ minimal pour comprendre le contrat hôte et créer votre propre template visuel.",
    tags: ["Formulaire", "Chat", "Médias"],
    size: "2,8 Ko",
    sha: "e164c1b15562822bd30cb64b5d1cdd0b1807dbaacdd8364fa3e935d75e2dfdcb",
    file: "starter-1.0.1.onirtech-template",
  },
] as const;

export default function PluginsPage() {
  return (
    <main id="contenu" className="site-main">
      <section className="site-wrap site-page-head">
        <p className="site-kicker">
          <span className="site-kicker-dot" />
          Marketplace
        </p>
        <h1>Plugins gratuits.</h1>
        <p className="site-lead">
          Des templates visuels prêts à importer dans ONIR CMS. Téléchargement libre, sans paiement.
        </p>
        <p className="site-free-note">Tous les plugins actuels sont gratuits.</p>
      </section>

      <section className="site-wrap" aria-label="Plugins disponibles">
        <div className="plugin-grid">
          {PLUGINS.map((plugin) => (
            <article key={plugin.id} className={`plugin-card plugin-card-${plugin.id}`}>
              <div className={`plugin-visual plugin-visual-${plugin.id}`} aria-hidden>
                <PluginIcon kind={plugin.id} />
              </div>

              <div className="plugin-body">
                <div className="plugin-top">
                  <span className="site-pill site-pill-free">Gratuit</span>
                  <span className="plugin-version">v{plugin.version}</span>
                </div>

                <h2>{plugin.name}</h2>
                <p>{plugin.description}</p>

                <ul className="plugin-meta" aria-label="Caractéristiques">
                  {plugin.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                  <li>{plugin.size}</li>
                </ul>

                <div className="plugin-actions">
                  <a
                    className="site-button"
                    href={`/plugins/${plugin.file}`}
                    download={plugin.file}
                  >
                    Télécharger
                  </a>
                  <Link
                    className="site-button site-button-ghost"
                    href="/documentation/templates-visuels"
                  >
                    Guide d’import
                  </Link>
                </div>

                <details className="plugin-details">
                  <summary>Détails techniques</summary>
                  <p>{plugin.details}</p>
                  <code>sha256:{plugin.sha}</code>
                </details>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="site-wrap site-install">
        <div className="site-section-head">
          <p className="site-kicker">Installation</p>
          <h2>Trois étapes.</h2>
        </div>
        <ol className="site-steps">
          <li>
            <span className="site-number">01</span>
            <strong>Téléchargez</strong>
            <p>Récupérez l’archive du plugin.</p>
          </li>
          <li>
            <span className="site-number">02</span>
            <strong>Importez</strong>
            <p>Dashboard → Templates visuels → Importer.</p>
          </li>
          <li>
            <span className="site-number">03</span>
            <strong>Rattachez</strong>
            <p>Associez le template à un lien de chat.</p>
          </li>
        </ol>
        <p className="site-install-link">
          Besoin du détail ?{" "}
          <Link href="/documentation/templates-visuels">Lire la documentation des templates</Link>.
        </p>
      </section>
    </main>
  );
}
