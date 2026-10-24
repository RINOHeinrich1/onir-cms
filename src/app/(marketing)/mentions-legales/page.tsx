import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales du site ONIR CMS, projet open source édité par Onirtech.",
};

export default function MentionsLegalesPage() {
  return (
    <main id="contenu" className="site-main">
      <section className="site-wrap site-page-head">
        <p className="site-kicker">
          <span className="site-kicker-dot" />
          Informations légales
        </p>
        <h1>Mentions légales.</h1>
        <p className="site-lead">
          {LEGAL.product} est un projet open source édité par {LEGAL.company}.
        </p>
        <p className="site-legal-updated">Dernière mise à jour : {LEGAL.updated}</p>
      </section>

      <section className="site-wrap site-legal">
        <article className="site-legal-card">
          <h2>Éditeur du site</h2>
          <p>
            Le présent site est édité par <strong>{LEGAL.company}</strong>, entreprise informatique
            basée à {LEGAL.address}.
          </p>
          <ul>
            <li>Numéro d’identification fiscale (NIF) : {LEGAL.nif}</li>
            <li>Numéro statistique : {LEGAL.statisticalNumber}</li>
            <li>Siège social : {LEGAL.address}</li>
            <li>
              E-mail : <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
            </li>
            <li>
              Téléphone : <a href={`tel:${LEGAL.phone.replace(/\s/g, "")}`}>{LEGAL.phone}</a>
            </li>
          </ul>

          <h2>Directeur de publication</h2>
          <p>{LEGAL.publicationDirector}.</p>

          <h2>Hébergeur</h2>
          <p>
            Le site est hébergé par {LEGAL.hostName}, dont le siège européen est situé au{" "}
            {LEGAL.hostAddress}.
          </p>

          <h2>Logiciel {LEGAL.product}</h2>
          <p>
            {LEGAL.product} est un logiciel open source distribué sous licence MIT. Le code source
            peut être consulté, modifié et redistribué dans les conditions de cette licence.
          </p>
          <p>
            Les instances {LEGAL.product} auto-hébergées sont exploitées sous la responsabilité de
            leurs opérateurs respectifs. {LEGAL.company} n’est pas responsable des traitements de
            données réalisés par ces instances.
          </p>

          <h2>Propriété intellectuelle</h2>
          <p>
            Les textes, images, graphismes, logos et éléments de marque du site sont la propriété de{" "}
            {LEGAL.company}, sauf mention contraire. Toute reproduction ou représentation du site ou
            de son contenu, par quelque procédé que ce soit, est interdite sans autorisation écrite
            préalable.
          </p>
          <p>
            La licence MIT du logiciel ne confère aucun droit sur les marques, logos ou contenus
            éditoriaux de {LEGAL.company}.
          </p>

          <h2>Données personnelles et cookies</h2>
          <p>
            Les données collectées sur ce site et lors des démonstrations sont décrites dans la{" "}
            <Link href="/confidentialite-site">politique de confidentialité</Link>.
          </p>
          <p>
            Le site n’utilise aucun cookie de suivi ou de mesure d’audience. La préférence de thème
            est conservée localement dans le navigateur et n’est jamais transmise à un serveur.
          </p>

          <h2>Responsabilité</h2>
          <p>
            Les informations publiées sont aussi précises que possible et le site est régulièrement
            mis à jour. Des erreurs ou omissions peuvent toutefois subsister. {LEGAL.company} ne
            saurait être responsable des dommages résultant de l’utilisation du site ou de
            l’impossibilité d’y accéder.
          </p>

          <h2>Droit applicable</h2>
          <p>
            Les présentes mentions légales sont régies par le droit malgache. En cas de litige, les
            tribunaux compétents de Madagascar seront seuls compétents.
          </p>

          <p>
            <Link href="/">← Retour à l’accueil</Link>
          </p>
        </article>
      </section>
    </main>
  );
}
