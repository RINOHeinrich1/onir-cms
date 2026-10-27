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
              selon le mode du lien, votre <strong>nom</strong> et votre{" "}
              <strong>adresse email</strong> ;
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
              l&apos;horodatage de votre <strong>consentement</strong>, lorsque celui-ci est requis,
              et de vos messages.
            </li>
          </ul>
          <p>
            Un widget intégré sur un site tiers peut fonctionner sans formulaire de contact. Dans ce
            cas, aucun nom ni email n&apos;est demandé à l&apos;entrée ; si vous les communiquez
            dans la conversation, ils peuvent être enregistrés pour permettre à l&apos;équipe de
            vous recontacter.
          </p>

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

          <h2>Responsabilité de l&apos;instance et intégration widget</h2>
          <p>
            ONIR CMS est un logiciel <strong>open source distribué sous licence MIT</strong>. Chaque
            instance est installée et exploitée de manière autonome par son propriétaire. Le
            propriétaire ou l&apos;exploitant de cette instance est responsable des traitements
            réalisés, des finalités, des durées de conservation et de la conformité de son
            installation. L&apos;éditeur du logiciel ne collecte pas les données des instances.
          </p>
          <p>
            Lorsqu&apos;un widget ONIR CMS est copié et intégré sur un site tiers, l&apos;exploitant
            de ce site est responsable de cette intégration, notamment de l&apos;information des
            visiteurs et du respect de ses propres obligations en matière de confidentialité et de
            protection des données.
          </p>

          <h2>Vos droits</h2>
          <p>
            Vous pouvez demander l&apos;accès, la rectification ou la suppression de vos données
            auprès du propriétaire de cette instance, responsable du traitement.
          </p>

          <p className="hint">
            Modèle à adapter par l&apos;exploitant (responsable de traitement, durée exacte,
            hébergement, base légale, coordonnées de contact).
          </p>

          <p>
            <Link href="/">← Retour</Link>
          </p>
        </div>
      </article>
    </main>
  );
}
