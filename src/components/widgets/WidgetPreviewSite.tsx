"use client";

import { useEffect } from "react";

/** Site factice pour prévisualiser le widget exactement comme sur un site hôte. */
export function WidgetPreviewSite({
  token,
  position,
  template,
  params,
}: {
  token: string;
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  template?: string | undefined;
  params?: string | undefined;
}) {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/widget/v2.js";
    script.async = true;
    script.dataset.onirToken = token;
    script.dataset.onirPosition = position;
    script.dataset.onirTitle = "Assistant";
    if (template !== undefined && template !== "") {
      script.dataset.onirPreviewTemplate = template;
    }
    if (params !== undefined && params !== "") {
      script.dataset.onirPreviewParams = params;
    }
    document.body.appendChild(script);
    return () => {
      script.remove();
      for (const iframe of document.querySelectorAll<HTMLIFrameElement>(
        "iframe[data-onir-widget-token]",
      )) {
        iframe.remove();
      }
    };
  }, [params, position, template, token]);

  return (
    <main className="widget-preview-site">
      <header className="widget-preview-top">
        <span className="widget-preview-brand">Atelier Moringa</span>
        <nav aria-label="Navigation de démonstration">
          <span>Accueil</span>
          <span>Services</span>
          <span>Contact</span>
        </nav>
      </header>

      <section className="widget-preview-hero">
        <span className="widget-preview-eyebrow">Site de démonstration</span>
        <h1>Un site comme le vôtre, avec le widget ONIR CMS.</h1>
        <p>
          Cette page simule l’intégration réelle. La bulle en bas à droite est le widget du chatbot
          : cliquez dessus pour l’ouvrir exactement comme un visiteur.
        </p>
        <div className="widget-preview-actions">
          <span className="widget-preview-button">Découvrir</span>
          <span className="widget-preview-link">Nous contacter</span>
        </div>
      </section>

      <section className="widget-preview-grid" aria-label="Contenu de démonstration">
        <article>
          <strong>Conseil</strong>
          <p>Un accompagnement clair, du premier échange à la livraison.</p>
        </article>
        <article>
          <strong>Réalisation</strong>
          <p>Des projets pensés pour durer et adaptés à votre activité.</p>
        </article>
        <article>
          <strong>Suivi</strong>
          <p>Une équipe disponible pour répondre à vos questions.</p>
        </article>
      </section>

      <p className="widget-preview-note">
        Aperçu du widget — position {position.replace("-", " ")}.
      </p>
    </main>
  );
}
