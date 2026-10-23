import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocCode } from "@/components/documentation/DocCode";

export const metadata: Metadata = {
  title: "Actions d'un template — envoi, identité, fin",
};

const IDENTITY = `// Identité : démarre la conversation.
async function submit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  actions.submitIdentity({
    nom: String(data.get("nom") ?? "").trim(),
    email: String(data.get("email") ?? "").trim(),
    consentement: data.get("consentement") === "on",
  });
}`;

const SEND = `// Message : l'hôte ajoute, affiche "typing", appelle l'API, puis répond.
function send() {
  const texte = draft.trim();
  if (texte === "" || typing) return; // garde anti double-envoi
  actions.sendMessage(texte);
  setDraft("");
}`;

const FINISH = `// Fin : clôture (et génération éventuelle côté serveur).
actions.finish();`;

const REQUEST = `// Ressource à la demande (facultatif : déjà dans le contexte au chargement).
const media = await actions.request("media");

// Ouvrir un média (nouvel onglet, URL http(s) uniquement).
actions.openMedia(photo.url);

// Ajuster la hauteur (utile en transport iframe).
actions.resize(720);`;

const CATALOG = `actions.submitIdentity({ nom, email, contacts?, consentement? })
actions.sendMessage("Bonjour")
actions.finish()
actions.request("media" | "modelForm" | "theme" | "messages")
actions.openMedia(url)
actions.resize(hauteur)`;

function Doc({ children }: { children: ReactNode }) {
  return <section className="doc">{children}</section>;
}

function Code({ children }: { children: string }) {
  return <DocCode>{children}</DocCode>;
}

/** Documentation dédiée aux actions template → hôte. */
export default function ActionsDocsPage() {
  return (
    <Doc>
      <div className="page-head">
        <div>
          <span className="eyebrow">Documentation</span>
          <h1 className="text-title">Les actions d&apos;un template</h1>
          <p className="hint">
            Le seul canal du template vers l&apos;hôte : identité, envoi de message, fin,
            ressources. Ce qui se passe côté serveur, en mock et en production.
          </p>
        </div>
      </div>

      <p>
        Un template ne fait <strong>jamais</strong> de requête réseau. Il appelle une{" "}
        <strong>action</strong> ; l&apos;hôte l&apos;exécute (API, base, LLM, médiathèque) puis met
        à jour le contexte.
      </p>
      <Code>{`Template ──action──▶ Hôte ──HTTP──▶ API / PostgreSQL / LLM / médiathèque
   ▲                    │
   └── nouveau contexte ◀┘`}</Code>

      <h2 id="transport">1. Transport et validation</h2>
      <ul>
        <li>
          <strong>Web Component</strong> (transport officiel) : <code>ctx.actions</code> est une
          fonction locale fournie par l&apos;hôte. L&apos;appel est direct, sans{" "}
          <code>postMessage</code>.
        </li>
        <li>
          <strong>Iframe</strong> (community, hors SDK v1) : le template envoie{" "}
          <code>{`{ action, payload }`}</code> en <code>postMessage</code>. L&apos;hôte valide
          chaque action avec <code>parseTemplateAction</code> et rejette tout ce qui n&apos;est pas
          conforme.
        </li>
      </ul>
      <p>
        Les actions sont donc <strong>validées côté hôte</strong> : nom requis, email valide,
        contenu non vide et ≤ 4000 caractères, URL http(s), hauteur numérique. Une action invalide
        est ignorée (iframe) ou n&apos;a aucun effet.
      </p>

      <h2 id="catalogue">2. Catalogue</h2>
      <Code>{CATALOG}</Code>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Rôle</th>
              <th>Change le contexte</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>submitIdentity</code>
              </td>
              <td>démarre la conversation</td>
              <td>
                <code>phase</code>, <code>messages</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>sendMessage</code>
              </td>
              <td>envoie un message et récupère la réponse</td>
              <td>
                <code>messages</code>, <code>typing</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>finish</code>
              </td>
              <td>clôt la conversation</td>
              <td>
                <code>status</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>request</code>
              </td>
              <td>ressource à la demande</td>
              <td>
                événement <code>resources</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>openMedia</code>
              </td>
              <td>ouvre une URL</td>
              <td>aucun</td>
            </tr>
            <tr>
              <td>
                <code>resize</code>
              </td>
              <td>hauteur du cadre</td>
              <td>aucun</td>
            </tr>
            <tr>
              <td>
                <code>ready</code>
              </td>
              <td>signal de montage (iframe)</td>
              <td>aucun</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="identite">3. submitIdentity — démarrer</h2>
      <Code>{IDENTITY}</Code>
      <p>
        <strong>Payload</strong> : <code>{`{ nom, email, contacts?, consentement? }`}</code>.
        L&apos;hôte normalise (<code>nom</code> et <code>email</code> trimmés, email en minuscules)
        et valide (nom non vide, email conforme).
      </p>
      <p>
        <strong>Côté hôte</strong> : <code>POST /api/chat/session</code> avec le token du lien,
        l&apos;identité, le consentement et <code>loadedAt</code> (anti-bot). Le serveur crée ou
        retrouve le prospect, crée la conversation, applique la politique de confidentialité et
        renvoie <code>{`{ conversationId, messages }`}</code>.
      </p>
      <ul>
        <li>
          <strong>Réussite</strong> : <code>phase = &quot;chat&quot;</code>, messages d&apos;accueil
          remplacés, <code>typing = false</code>.
        </li>
        <li>
          <strong>Erreur</strong> : la phase ne change pas ; l&apos;hôte affiche un bandeau («
          Démarrage impossible » ou « Erreur réseau »).
        </li>
        <li>
          <strong>Mock</strong> : passage en chat et message d&apos;accueil local, sans réseau.
        </li>
      </ul>
      <p className="hint">
        Désactivez le bouton pendant l&apos;appel : l&apos;hôte ne déduplique pas deux soumissions
        simultanées.
      </p>

      <h2 id="message">4. sendMessage — envoyer et traiter</h2>
      <Code>{SEND}</Code>
      <p>
        <strong>Payload</strong> : <code>{`{ content }`}</code>, trimmé, non vide, ≤ 4000
        caractères.
      </p>
      <p>
        <strong>Côté hôte, dans l&apos;ordre</strong> :
      </p>
      <ol>
        <li>
          Ajout optimiste du message utilisateur, <code>typing = true</code>.
        </li>
        <li>
          Si la capacité <code>userState</code> et le flag du lien sont actifs :{" "}
          <code>POST /api/chat/state</code> en parallèle pour attacher{" "}
          <code>message.userState</code> (échec sans impact).
        </li>
        <li>
          <code>POST /api/chat</code> avec <code>{`{ conversationId, content }`}</code>.
        </li>
        <li>
          Le serveur persiste le message, borne l&apos;historique à 20 tours, construit le prompt,
          sélectionne les connaissances (mini-RAG, si la source est active), appelle le LLM,
          persiste la réponse.
        </li>
        <li>
          Réponse : <code>{`{ message, connaissances, mediaPending }`}</code>. Les{" "}
          <code>connaissances</code> ne sont que des références (titre + identifiant), jamais le
          contenu interne.
        </li>
        <li>
          Si <code>mediaPending</code> : <code>POST /api/chat/media</code> avec{" "}
          <code>{`{ conversationId, messageId }`}</code> pour attacher photos/liens — le texte
          n&apos;attend pas cette recherche.
        </li>
        <li>
          L&apos;hôte ajoute la réponse, <code>typing = false</code>, puis réassigne le contexte.
        </li>
      </ol>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Situation</th>
              <th>Résultat</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Message vide ou &gt; 4000 caractères</td>
              <td>ignoré / 400 côté serveur</td>
            </tr>
            <tr>
              <td>Réseau ou LLM en échec</td>
              <td>
                message utilisateur conservé, pas de réponse, bandeau d&apos;erreur ; vous pouvez
                réessayer
              </td>
            </tr>
            <tr>
              <td>
                <code>mediaPending</code>
              </td>
              <td>médias attachés après coup à la réponse</td>
            </tr>
            <tr>
              <td>Mock</td>
              <td>réponse locale après 500 ms, avec une photo fictive</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        Garde-fou : <code>if (typing) return</code> ou bouton désactivé pendant l&apos;attente.
      </p>

      <h2 id="fin">5. finish — clôturer</h2>
      <Code>{FINISH}</Code>
      <p>
        <strong>Côté hôte</strong> : <code>POST /api/chat/finish</code> avec{" "}
        <code>{`{ conversationId }`}</code>. Le serveur clôt la conversation (et génère la sortie
        prévue). Le contexte passe à <code>status = &quot;finalisee&quot;</code>.
      </p>
      <ul>
        <li>
          <strong>Erreur</strong> : bandeau « Génération impossible pour le moment » ; le statut ne
          change pas.
        </li>
        <li>
          <strong>Mock</strong> : <code>status = &quot;finalisee&quot;</code> immédiatement.
        </li>
        <li>
          N&apos;appelez <code>finish</code> qu&apos;une fois : masquez le bouton après succès.
        </li>
      </ul>

      <h2 id="autres">6. request, openMedia, resize, ready</h2>
      <Code>{REQUEST}</Code>
      <ul>
        <li>
          <code>request(capability)</code> : renvoie <code>media</code>, <code>modelForm</code>,{" "}
          <code>theme</code> ou <code>messages</code>, et émet l&apos;événement{" "}
          <code>resources</code>. Utile pour un chargement paresseux ; les données sont déjà dans le
          contexte initial.
        </li>
        <li>
          <code>openMedia(url)</code> : ouvre un nouvel onglet (<code>noopener</code>) ; seules les
          URL <strong>http(s)</strong> sont acceptées.
        </li>
        <li>
          <code>resize(height)</code> : ajuste la hauteur du cadre (0..20000, borné à 200 min par
          l&apos;hôte). Surtout utile en iframe.
        </li>
        <li>
          <code>ready()</code> : signal de montage, sans effet en Web Component.
        </li>
      </ul>

      <h2 id="evenements">7. Événements de l&apos;hôte</h2>
      <Code>{`const offState = on("state", (state) => { … });      // à chaque contexte
const offRes = on("resources", (value) => { … });     // après request()
offState(); offRes(); // désabonnement`}</Code>
      <p>
        <code>state</code> est émis à chaque mise à jour (message, typing, phase, statut).{" "}
        <code>resources</code> après un <code>request</code>. Les erreurs sont affichées par
        l&apos;hôte dans son bandeau : prévoyez un état de reprise côté UI (bouton Réessayer).
      </p>

      <h2 id="machine">8. Machine à états</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>État</th>
              <th>Action</th>
              <th>État suivant</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>identity</code>
              </td>
              <td>
                <code>submitIdentity</code> (succès)
              </td>
              <td>
                <code>chat</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>chat</code>
              </td>
              <td>
                <code>sendMessage</code>
              </td>
              <td>
                <code>chat</code> + messages + <code>typing</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>chat</code>
              </td>
              <td>
                <code>finish</code> (succès)
              </td>
              <td>
                <code>finalisee</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="mock-reel">9. Mock, aperçu, production</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Environnement</th>
              <th>Actions</th>
              <th>Ce qui est réellement exécuté</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Harness</td>
              <td>simulées localement</td>
              <td>rien hors navigateur</td>
            </tr>
            <tr>
              <td>Aperçu du lien</td>
              <td>simulées</td>
              <td>le contexte (médias, params, consentement)</td>
            </tr>
            <tr>
              <td>Lien public</td>
              <td>réelles</td>
              <td>API, LLM, RAG, persistance</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Pour observer une action réelle : ouvrez le lien public, DevTools → Réseau, filtrez{" "}
        <code>/api/chat</code>. Vous verrez <code>session</code>, <code>chat</code>,{" "}
        <code>media</code>, <code>finish</code> et leurs réponses.
      </p>

      <h2 id="faq">10. Questions fréquentes</h2>
      <dl className="doc-faq">
        <dt>Le message n&apos;est pas envoyé.</dt>
        <dd>
          Vérifiez <code>conversationId</code> (identité d&apos;abord), le contenu non vide et le
          statut du lien. Une erreur réseau est affichée par l&apos;hôte.
        </dd>
        <dt>Deux messages partent pour un seul clic.</dt>
        <dd>
          Désactivez l&apos;envoi pendant <code>typing</code> : l&apos;hôte ne déduplique pas.
        </dd>
        <dt>La réponse arrive sans photo.</dt>
        <dd>
          Vérifiez les sources du lien (<code>photothèque</code>/<code>lien</code>) et les médias
          actifs du <code>templateKey</code>. <code>mediaPending</code> n&apos;est vrai que si des
          médias éligibles existent.
        </dd>
        <dt>Les connaissances ne sont pas visibles.</dt>
        <dd>
          Elles arrivent dans <code>message.knowledge</code> uniquement si la capacité{" "}
          <code>knowledge</code> est déclarée et la source active sur le lien. Le mock n&apos;en
          fournit pas.
        </dd>
        <dt>Puis-je appeler l&apos;API directement ?</dt>
        <dd>
          Non : le token reste dans l&apos;hôte. Toute action passe par <code>actions</code>.
        </dd>
      </dl>

      <h2 id="references">11. Références</h2>
      <ul>
        <li>
          <a href="/documentation/host">Template ↔ hôte</a> — contexte, ressources, création des
          objets.
        </li>
        <li>
          <a href="/documentation/templates-visuels">Contrat des templates visuels</a> — actions et
          validation.
        </li>
        <li>
          Code : <code>src/components/templates/TemplateHost.tsx</code>,{" "}
          <code>src/domain/template-contract.ts</code>,{" "}
          <code>src/application/use-cases/chat/send-message.ts</code>.
        </li>
      </ul>
    </Doc>
  );
}
