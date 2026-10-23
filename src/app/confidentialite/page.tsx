import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politique de confidentialité — ONIR CMS",
  description:
    "Comment cette instance ONIR CMS collecte, utilise et conserve les données transmises lors d'une discussion via le chat de prospection.",
};

/**
 * Page publique par défaut de la politique de confidentialité (cible du lien
 * par défaut des politiques paramétrables). Accessible sans authentification.
 */
export default function ConfidentialitePage() {
  return (
    <main className="legal-page">
      <article className="report-doc">
        <div className="md">
          <h1>Politique de confidentialité</h1>
          <p>
            La présente politique explique quelles données sont collectées lorsque vous utilisez le
            chat de prospection de cette instance ONIR CMS, pourquoi elles le sont et combien de
            temps elles sont conservées.
          </p>

          <h2>Données collectées</h2>
          <ul>
            <li>
              Votre <strong>nom</strong> et votre <strong>adresse email</strong> (obligatoires) ;
            </li>
            <li>
              vos <strong>coordonnées complémentaires</strong> facultatives (téléphone, WhatsApp,
              site web) ;
            </li>
            <li>
              le <strong>contenu de vos échanges</strong> avec l&apos;assistant et les pièces
              produites (fiches de prospection) ;
            </li>
            <li>
              l&apos;horodatage de votre <strong>consentement</strong> et de vos messages.
            </li>
          </ul>

          <h2>Finalité</h2>
          <p>
            Ces données servent uniquement à qualifier votre demande et à permettre à l&apos;équipe
            de vous recontacter. Elles ne sont ni vendues ni cédées à des tiers.
          </p>

          <h2>Conservation</h2>
          <p>
            Les conversations sont <strong>enregistrées dans notre système</strong> afin
            d&apos;assurer le suivi de votre demande. Elles sont conservées le temps nécessaire à la
            relation commerciale et peuvent être supprimées sur simple demande.
          </p>

          <h2>Vos droits</h2>
          <p>
            Vous pouvez demander l&apos;accès, la rectification ou la suppression de vos données en
            écrivant à <a href="mailto:contact@example.com">contact@example.com</a>.
          </p>

          <p className="hint">
            Modèle à adapter par l&apos;exploitant (responsable de traitement, durée exacte,
            hébergement, base légale).
          </p>

          <p>
            <Link href="/">← Retour</Link>
          </p>
        </div>
      </article>
    </main>
  );
}
