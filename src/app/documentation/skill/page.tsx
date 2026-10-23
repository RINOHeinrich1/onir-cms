import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocCode } from "@/components/documentation/DocCode";

export const metadata: Metadata = {
  title: "Skill pour agents IA — ONIR CMS",
};

const SKILL_PATH = "docs/skills/onirtech-template-sdk/SKILL.md";
const SKILL_MD = readFileSync(join(process.cwd(), SKILL_PATH), "utf8");

const INSTALL = `# Skill global (opencode)
mkdir -p ~/.config/opencode/skills/onirtech-template-sdk
cp docs/skills/onirtech-template-sdk/SKILL.md \\
  ~/.config/opencode/skills/onirtech-template-sdk/SKILL.md

# Ou dans le projet
mkdir -p .opencode/skills/onirtech-template-sdk
cp docs/skills/onirtech-template-sdk/SKILL.md \\
  .opencode/skills/onirtech-template-sdk/SKILL.md`;

const PROMPT = `Crée un template React nommé "album" avec :
- un paramètre "titre" (défaut « Album souvenirs ») ;
- la couleur d'accent "#023777" ;
- un formulaire d'identité puis un chat ;
- des tests, un build, une validation et un pack.
Utilise le skill onirtech-template-sdk et vérifie chaque étape.`;

function Doc({ children }: { children: ReactNode }) {
  return <section className="doc">{children}</section>;
}

/** Documentation du skill agent (fichier SKILL.md + mode d'emploi). */
export default function SkillDocsPage() {
  return (
    <Doc>
      <div className="page-head">
        <div>
          <span className="eyebrow">Pour les agents IA</span>
          <h1 className="text-title">Skill : utiliser le SDK ONIR CMS</h1>
          <p className="hint">
            Un fichier de compétences autonome pour qu&apos;un agent crée, teste et empaquette un
            template sans inventer d&apos;API.
          </p>
        </div>
      </div>

      <p>
        Le skill <code>onirtech-template-sdk</code> décrit le contrat hôte, les capacités, les
        paramètres, les actions, le harness, le build, les vérifications et les pièges connus. Il
        est conçu pour être chargé par un agent (opencode, Claude Code, Cursor…) au moment où la
        tâche concerne un template visuel Onirtech.
      </p>

      <h2 id="pourquoi">1. Pourquoi un skill ?</h2>
      <ul>
        <li>
          <strong>Pas d&apos;API inventée</strong> : seules les fonctions réellement exportées sont
          autorisées.
        </li>
        <li>
          <strong>Règles de sécurité</strong> : pas de réseau dans le template, pas de secret dans
          les paramètres, token masqué.
        </li>
        <li>
          <strong>Vérifications imposées</strong> : tests, build, validate, pack et contrôle
          navigateur avant de déclarer un succès.
        </li>
        <li>
          <strong>Pièges connus</strong> : <code>process is not defined</code>, SRI, styles non
          inlinés, double React, etc.
        </li>
      </ul>

      <h2 id="installation">2. Installer le skill</h2>
      <Code>{INSTALL}</Code>
      <p>
        Le fichier source est <code>{SKILL_PATH}</code>. Le frontmatter (<code>name</code> et{" "}
        <code>description</code>) déclenche le chargement automatique quand la demande parle de
        template Onirtech, de SDK, de React/Vue/vanilla, de build ou de packaging.
      </p>
      <p className="hint">
        Pour un autre agent, placez le fichier dans son dossier de skills/instructions ; le contenu
        est portable (aucun chemin privé requis).
      </p>

      <h2 id="contenu">3. Ce que le skill couvre</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Contenu</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Modèle mental</td>
              <td>template = UI, hôte = données et actions</td>
            </tr>
            <tr>
              <td>Démarrage</td>
              <td>
                <code>create-onirtech-template</code>, scripts, ports
              </td>
            </tr>
            <tr>
              <td>Contrat</td>
              <td>contexte, messages, ressources, capacités, double garde</td>
            </tr>
            <tr>
              <td>API</td>
              <td>signatures des 5 sous-chemins et helpers</td>
            </tr>
            <tr>
              <td>Patterns</td>
              <td>React, Vue, vanilla ; manifeste et paramètres</td>
            </tr>
            <tr>
              <td>Actions</td>
              <td>identité, envoi, fin, ressources, garde-fous</td>
            </tr>
            <tr>
              <td>Vérifications</td>
              <td>commandes, résultats attendus, contrôles navigateur</td>
            </tr>
            <tr>
              <td>Échecs fréquents</td>
              <td>symptôme → cause → correctif</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="usage">4. Exemple de demande</h2>
      <Code>{PROMPT}</Code>
      <p>
        L&apos;agent doit alors : lire le skill, générer le projet, coder, lancer les tests, le
        build, la validation et le pack, puis rapporter les commandes et leurs résultats. Il ne doit
        ni publier, ni importer dans le panneau sans demande explicite.
      </p>

      <h2 id="regles">5. Règles clés (rappel)</h2>
      <ol>
        <li>
          Aucune requête réseau dans le template : uniquement <code>actions</code>.
        </li>
        <li>
          <code>ui.element</code> == nom du Custom Element.
        </li>
        <li>Déclarer toute capacité utilisée.</li>
        <li>
          Paramètres publics, avec <code>default</code> obligatoire.
        </li>
        <li>
          Ne jamais éditer <code>onirtech.template.json</code> à la main.
        </li>
        <li>Vanilla sans build ; React/Vue/TS via Vite.</li>
        <li>
          Incrémenter <code>version</code> dans le manifeste pour toute mise à jour.
        </li>
        <li>
          Toujours exécuter <code>npm test</code>, <code>build</code>, <code>validate</code>,{" "}
          <code>pack</code>.
        </li>
      </ol>

      <h2 id="fichier">6. Fichier complet</h2>
      <p>
        Contenu intégral de <code>{SKILL_PATH}</code> — utilisez le bouton <strong>Copier</strong>{" "}
        pour le réutiliser tel quel.
      </p>
      <details className="doc-details">
        <summary>Voir le fichier SKILL.md</summary>
        <DocCode>{SKILL_MD}</DocCode>
      </details>

      <h2 id="references">7. Références</h2>
      <ul>
        <li>
          <a href="/documentation/first-template">Your first package</a> — guide pas à pas.
        </li>
        <li>
          <a href="/documentation/sdk">SDK JavaScript</a> — API complète.
        </li>
        <li>
          <a href="/documentation/actions">Actions</a> et{" "}
          <a href="/documentation/host">Données &amp; hôte</a>.
        </li>
        <li>
          <a href="/documentation/templates-visuels">Contrat des templates</a>.
        </li>
      </ul>
    </Doc>
  );
}

function Code({ children }: { children: string }) {
  return <DocCode>{children}</DocCode>;
}
