import type { Metadata } from "next";
import { DocCode } from "@/components/documentation/DocCode";

export const metadata: Metadata = {
  title: "Documentation — Dashboard et templates",
};

const QUICKSTART = `npx @onirtech/create-onirtech-template mon-premier-template --stack react
cd mon-premier-template
npm install
npm run dev`;

function Doc({ children }: { children: React.ReactNode }) {
  return <section className="doc">{children}</section>;
}

/** Index de la documentation : introduction et entrées par public. */
export default function DocumentationIndexPage() {
  return (
    <Doc>
      <div className="page-head">
        <div>
          <span className="eyebrow">Documentation</span>
          <h1 className="text-title">Documentation ONIR CMS</h1>
          <p className="hint">
            Installer ONIR CMS, puis créer et intégrer un template visuel : guide, API, actions et
            contrat hôte.
          </p>
        </div>
      </div>

      <p>
        Cette documentation s&apos;adresse aux développeurs du dashboard et de templates. Elle
        couvre l&apos;installation locale avec Docker, puis trois stacks (<strong>React</strong>,{" "}
        <strong>Vue</strong>, <strong>HTML/CSS/JS</strong>) et deux environnements : le{" "}
        <strong>mock</strong> (harness local, hors-ligne) et la <strong>production</strong>{" "}
        (dashboard, API, LLM, médiathèque).
      </p>

      <h2 id="environnement">Lancer le dashboard en local</h2>
      <p>
        Vous souhaitez d&apos;abord faire tourner le dashboard sur votre machine ? Le guide Docker
        couvre Windows, Linux et macOS, sans installation locale de Node ou PostgreSQL.
      </p>
      <div className="doc-cards">
        <a className="doc-card" href="/documentation/installation">
          <strong>Préparer l&apos;environnement</strong>
          <p>
            Docker Desktop ou Docker Engine, build local ou images GHCR, génération des secrets,
            premier démarrage, tests et dépannage.
          </p>
          <span>Suivre le guide →</span>
        </a>
      </div>

      <CodeBlock />

      <h2 id="parcours">Par où commencer ?</h2>
      <div className="doc-cards">
        <a className="doc-card" href="/documentation/first-template">
          <strong>Votre premier template</strong>
          <p>
            Guide pas à pas : création, code, tests, build, import. Chaque commande est vérifiée.
          </p>
          <span>Commencer →</span>
        </a>
        <a className="doc-card" href="/documentation/sdk">
          <strong>SDK JavaScript</strong>
          <p>
            API complète : <code>defineTemplate</code>, hooks React/Vue, helpers, build Vite.
          </p>
          <span>Lire l&apos;API →</span>
        </a>
        <a className="doc-card" href="/documentation/actions">
          <strong>Actions</strong>
          <p>
            Identité, envoi de message, fin : ce que l&apos;hôte exécute et ce que le template
            reçoit.
          </p>
          <span>Comprendre le flux →</span>
        </a>
        <a className="doc-card" href="/documentation/host">
          <strong>Données &amp; hôte</strong>
          <p>
            Photothèque, liens, connaissances, conversations : qui crée quoi, en mock et en
            production.
          </p>
          <span>Voir l&apos;intégration →</span>
        </a>
        <a className="doc-card" href="/documentation/templates-visuels">
          <strong>Contrat des templates</strong>
          <p>Manifeste, capacités, paramètres, contexte : la référence normative du protocole.</p>
          <span>Consulter le contrat →</span>
        </a>
        <a className="doc-card" href="/documentation/api">
          <strong>API fiches</strong>
          <p>
            Rechercher les fiches par organisation, modèle, date et texte, avec clés API
            server-to-server et pagination.
          </p>
          <span>Lire la référence →</span>
        </a>
        <a className="doc-card" href="/documentation/skill">
          <strong>Skill pour agents IA</strong>
          <p>
            Un fichier de compétences pour créer, tester et vérifier un template sans inventer
            d&apos;API.
          </p>
          <span>Voir le skill →</span>
        </a>
      </div>

      <h2 id="ordre">Ordre de lecture conseillé</h2>
      <ol>
        <li>
          <strong>Installation</strong> — lancez le dashboard et PostgreSQL avec Docker.
        </li>
        <li>
          <strong>Guide</strong> — créez un template et voyez-le tourner en local.
        </li>
        <li>
          <strong>SDK</strong> — apprenez l&apos;API au fur et à mesure de vos besoins.
        </li>
        <li>
          <strong>Actions</strong> — comprenez ce qui se passe quand un message est envoyé.
        </li>
        <li>
          <strong>Données &amp; hôte</strong> — branchez la médiathèque, les connaissances et les
          vraies conversations.
        </li>
        <li>
          <strong>Contrat</strong> — pour les cas avancés (transport, capacités, validation).
        </li>
      </ol>

      <h2 id="prerequis">Prérequis</h2>
      <ul>
        <li>
          <strong>Node.js 20.19+</strong> (recommandé : 22 ou 24) et npm.
        </li>
        <li>Un éditeur (VS Code) et un terminal.</li>
        <li>Un accès au panneau pour importer un template et le rattacher à un lien.</li>
      </ul>

      <h2 id="aide">Besoin d&apos;aide ?</h2>
      <ul>
        <li>
          <a href="/documentation/actions#faq">FAQ des actions</a> et{" "}
          <a href="/documentation/host#faq">FAQ de l&apos;hôte</a>.
        </li>
        <li>
          <a href="/documentation/first-template#depannage">Dépannage du guide</a> (build, process,
          styles, hooks).
        </li>
        <li>
          <a href="/documentation/templates-visuels">Contrat complet</a> pour les détails du
          protocole.
        </li>
      </ul>
    </Doc>
  );
}

function CodeBlock() {
  return (
    <>
      <h3>Démarrer en quatre commandes</h3>
      <DocCode>{QUICKSTART}</DocCode>
    </>
  );
}
