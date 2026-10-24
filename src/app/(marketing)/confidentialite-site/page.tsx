import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Données collectées sur le site ONIR CMS et lors des démonstrations : finalités, destinataires, conservation et droits.",
};

export default function ConfidentialiteSitePage() {
  return (
    <main id="contenu" className="site-main">
      <section className="site-wrap site-page-head">
        <p className="site-kicker">
          <span className="site-kicker-dot" />
          Données personnelles
        </p>
        <h1>Politique de confidentialité.</h1>
        <p className="site-lead">
          Cette politique couvre le site {LEGAL.product} et ses démonstrations. Elle ne couvre pas
          les instances {LEGAL.product} auto-hébergées par des tiers.
        </p>
        <p className="site-legal-updated">Dernière mise à jour : {LEGAL.updated}</p>
      </section>

      <section className="site-wrap site-legal">
        <article className="site-legal-card">
          <h2>Responsable de traitement</h2>
          <p>
            Le responsable de traitement du site et des démonstrations est{" "}
            <strong>{LEGAL.company}</strong>, joignable à{" "}
            <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
          </p>

          <h2>Données traitées</h2>
          <ul>
            <li>
              <strong>Navigation et sécurité</strong> : données techniques de connexion (adresse IP,
              navigateur, page demandée, horodatage, journaux serveur) nécessaires au fonctionnement
              et à la sécurité du site.
            </li>
            <li>
              <strong>Contact et estimation</strong> : nom, adresse e-mail, contenu du message et,
              le cas échéant, téléphone et informations sur le projet.
            </li>
            <li>
              <strong>Démonstration</strong> : nom, adresse e-mail, coordonnées complémentaires
              facultatives, messages échangés avec l’assistant, fiches générées et horodatage du
              consentement.
            </li>
            <li>
              <strong>Préférences locales</strong> : thème clair ou sombre, conservé dans le
              navigateur et non transmis à un serveur.
            </li>
          </ul>

          <h2>Finalités</h2>
          <ul>
            <li>Répondre aux demandes de contact et préparer une estimation.</li>
            <li>Faire fonctionner les démonstrations et restituer les échanges.</li>
            <li>Qualifier une demande et permettre à l’équipe de recontacter le visiteur.</li>
            <li>Assurer la sécurité, prévenir les abus et maintenir le service.</li>
          </ul>

          <h2>Bases légales</h2>
          <p>
            Selon les cas, le traitement repose sur le consentement du visiteur (notamment pour la
            démonstration), sur l’exécution d’une demande précontractuelle ou sur l’intérêt légitime
            de {LEGAL.company} à assurer la sécurité et le bon fonctionnement du site, dans le
            respect de la réglementation applicable.
          </p>

          <h2>Destinataires et sous-traitants</h2>
          <p>
            Les données sont accessibles aux personnes habilitées de {LEGAL.company} et peuvent être
            traitées par ses prestataires techniques :
          </p>
          <ul>
            <li>{LEGAL.hostName}, pour l’hébergement du site et de la base de données.</li>
            <li>
              Infomaniak, pour l’exécution des réponses générées par l’intelligence artificielle.
            </li>
          </ul>
          <p>
            Les données ne sont ni vendues ni cédées à des tiers à des fins commerciales. Les
            prestataires peuvent être situés hors de Madagascar ; dans ce cas, les garanties
            appropriées sont mises en place lorsque la réglementation l’exige.
          </p>

          <h2>Durées de conservation</h2>
          <ul>
            <li>
              Données de contact et d’estimation : 24 mois à compter du dernier échange, sauf
              obligation légale contraire.
            </li>
            <li>
              Données de démonstration : 12 mois à compter du dernier échange, sauf demande de
              suppression.
            </li>
            <li>
              Journaux techniques : durée nécessaire à la sécurité et au diagnostic, généralement
              limitée à 12 mois.
            </li>
          </ul>

          <h2>Vos droits</h2>
          <p>
            Vous pouvez demander l’accès à vos données, leur rectification, leur effacement, la
            limitation de leur traitement ou vous opposer à leur traitement, dans les conditions
            prévues par la réglementation applicable. Pour exercer ces droits, écrivez à{" "}
            <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
          </p>
          <p>
            Vous pouvez également introduire une réclamation auprès de l’autorité compétente en
            matière de protection des données.
          </p>

          <h2>Cookies et stockage local</h2>
          <p>
            Le site n’utilise aucun cookie de suivi ou de mesure d’audience. Le choix du thème et
            certains états de la démonstration peuvent être conservés localement dans votre
            navigateur ; ces informations ne sont pas transmises à un serveur.
          </p>

          <h2>Instances auto-hébergées</h2>
          <p>
            Lorsqu’une organisation installe {LEGAL.product} sur sa propre infrastructure, elle
            devient responsable des données traitées dans son instance. {LEGAL.company} n’intervient
            pas dans ces traitements et invite chaque exploitant à publier sa propre politique de
            confidentialité.
          </p>

          <h2>Modification de cette politique</h2>
          <p>
            Cette politique peut être mise à jour pour tenir compte de l’évolution du site ou de la
            réglementation. La date de dernière mise à jour figure en haut de cette page.
          </p>

          <p>
            <Link href="/">← Retour à l’accueil</Link>
          </p>
        </article>
      </section>
    </main>
  );
}
