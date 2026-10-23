import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocCode } from "@/components/documentation/DocCode";

export const metadata: Metadata = {
  title: "Template ↔ hôte — données, actions et mode mock",
};

const CONTEXT = `// Ce que le template reçoit (sans les actions, ajoutées par l'hôte)
{
  host: { protocol: "onirtech.template-host.v1", version: 1 },
  link: { type: "standard", label: "…", userStateEnabled: false },
  locale: "fr",
  brand: { name: "ONIRTECH", logoUrl: null },
  theme: { … },                 // couleurs du lien
  capabilities: ["messages", "media", "theme"],
  params: { titre: "…" },       // défauts ⊕ valeurs du lien (gelé)
  consent: { texte: "…", lien: "…" } | null,
  state: { phase: "identity", status: "en_cours", messages: [], typing: false },
  resources: {
    media: { photos: [ { id, libelle, url } ], liens: [ … ] },
    modelForm: [ { name, label, type, required } ] | null
  }
}`;

const USAGE = `// Côté template : on lit le contexte, on appelle les actions.
const { state, resources, params, actions } = useTemplate();

if (state.typing) afficherIndicateur();
for (const photo of resources.media.photos) afficherPhoto(photo);

actions.sendMessage("Bonjour");
actions.finish();`;

function Doc({ children }: { children: ReactNode }) {
  return <section className="doc">{children}</section>;
}

function Code({ children }: { children: string }) {
  return <DocCode>{children}</DocCode>;
}

/** Documentation de l'intégration template ↔ hôte (données, actions, mock/prod). */
export default function HostDocsPage() {
  return (
    <Doc>
      <div className="page-head">
        <div>
          <span className="eyebrow">Documentation</span>
          <h1 className="text-title">Template ↔ hôte : données, actions et mode mock</h1>
          <p className="hint">
            Qui fournit la photothèque, les liens, les connaissances et le traitement des messages —
            et ce que votre template doit (ou ne doit pas) faire.
          </p>
        </div>
      </div>

      <h2 id="principe">1. Le principe</h2>
      <p>
        Un template est une <strong>interface pure</strong>. Il ne lit jamais la base de données, la
        médiathèque, la base de connaissances ni le LLM. L&apos;
        <strong>hôte</strong> (le harness en développement, le dashboard en production) construit un{" "}
        <strong>contexte</strong>, l&apos;injecte dans l&apos;élément, puis exécute les{" "}
        <strong>actions</strong> que le template demande.
      </p>
      <Code>{`Template (UI)  ──actions.sendMessage()──▶  Hôte (harness | dashboard)
      ▲                                          │
      └──── contexte (state, resources, params) ◀┘
                                                 │ HTTP
                                                 ▼
                          API / PostgreSQL / LLM / médiathèque / connaissances`}</Code>
      <p>
        Conséquence : le template fonctionne <strong>à l&apos;identique</strong> en mock et en
        production. Seul l&apos;hôte change.
      </p>

      <div className="doc-callout">
        <strong>Les actions ont leur propre documentation.</strong>
        <p>
          <a href="/documentation/actions">Les actions d&apos;un template</a> détaillent chaque
          appel (identité, envoi, fin, ressources) et son traitement côté hôte.
        </p>
      </div>

      <h2 id="contexte">2. Ce que le template reçoit</h2>
      <Code>{CONTEXT}</Code>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Champ</th>
              <th>Contenu</th>
              <th>Qui le produit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>state</code>
              </td>
              <td>
                phase (<code>identity</code>/<code>chat</code>), statut, messages,{" "}
                <code>typing</code>
              </td>
              <td>l&apos;hôte (serveur + conversation)</td>
            </tr>
            <tr>
              <td>
                <code>resources.media</code>
              </td>
              <td>photos et liens actifs</td>
              <td>médiathèque (dashboard)</td>
            </tr>
            <tr>
              <td>
                <code>resources.modelForm</code>
              </td>
              <td>champs de la fiche modèle</td>
              <td>version du modèle du template</td>
            </tr>
            <tr>
              <td>
                <code>theme</code>
              </td>
              <td>couleurs du lien</td>
              <td>configuration du lien</td>
            </tr>
            <tr>
              <td>
                <code>params</code>
              </td>
              <td>variables déclarées (défauts ⊕ lien), gelées</td>
              <td>manifeste + lien</td>
            </tr>
            <tr>
              <td>
                <code>consent</code>
              </td>
              <td>texte et lien de la politique de confidentialité</td>
              <td>politique rattachée au lien</td>
            </tr>
            <tr>
              <td>
                <code>capabilities</code>
              </td>
              <td>ce que l&apos;hôte est autorisé à exposer</td>
              <td>manifeste du template</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        Les <strong>actions</strong> ne font pas partie du contexte sérialisé : l&apos;hôte les
        ajoute à l&apos;exécution (un template ne peut donc jamais être “rejoué” avec des actions
        forgées côté serveur).
      </p>

      <h2 id="actions">3. Ce que le template peut faire</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Effet côté hôte</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>submitIdentity(data)</code>
              </td>
              <td>
                crée la conversation/prospect via <code>POST /api/chat/session</code>, applique le
                consentement, renvoie les premiers messages
              </td>
            </tr>
            <tr>
              <td>
                <code>sendMessage(texte)</code>
              </td>
              <td>
                ajoute le message, passe en <code>typing</code>, appelle <code>POST /api/chat</code>{" "}
                (LLM + RAG + persistance), ajoute la réponse
              </td>
            </tr>
            <tr>
              <td>
                <code>finish()</code>
              </td>
              <td>
                clôt la conversation via <code>POST /api/chat/finish</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>request(capability)</code>
              </td>
              <td>renvoie une ressource à la demande (média, fiche, thème…)</td>
            </tr>
            <tr>
              <td>
                <code>openMedia(url)</code>
              </td>
              <td>ouvre un média dans un nouvel onglet</td>
            </tr>
            <tr>
              <td>
                <code>resize(height)</code>
              </td>
              <td>ajuste la hauteur du cadre hôte</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Vous pouvez aussi vous abonner à{" "}
        <code>on(&quot;state&quot; | &quot;resources&quot; | &quot;error&quot;, cb)</code> pour
        réagir aux mises à jour poussées par l&apos;hôte.
      </p>
      <Code>{USAGE}</Code>

      <h2 id="capacites">4. Les capacités filtrent tout</h2>
      <p>
        Une ressource n&apos;est fournie que si le manifeste déclare la capacité correspondante.
        C&apos;est le premier niveau de défense : sans déclaration, la donnée est absente ou vide.
      </p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Capacité</th>
              <th>Donnée exposée</th>
              <th>Si absente</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>messages</code>
              </td>
              <td>
                <code>state.messages</code>
              </td>
              <td>liste vide</td>
            </tr>
            <tr>
              <td>
                <code>media</code>
              </td>
              <td>
                <code>resources.media</code>
              </td>
              <td>
                <code>{`{ photos: [], liens: [] }`}</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>modelForm</code>
              </td>
              <td>
                <code>resources.modelForm</code>
              </td>
              <td>
                <code>null</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>theme</code>
              </td>
              <td>
                <code>theme</code>
              </td>
              <td>objet vide</td>
            </tr>
            <tr>
              <td>
                <code>userState</code>
              </td>
              <td>
                <code>message.userState</code> (messages utilisateur)
              </td>
              <td>
                champ absent <em>+ double garde lien</em>
              </td>
            </tr>
            <tr>
              <td>
                <code>knowledge</code>
              </td>
              <td>
                <code>message.knowledge</code> (messages assistant)
              </td>
              <td>
                champ absent <em>+ double garde source</em>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        <code>userState</code> et <code>knowledge</code> sont soumis à une{" "}
        <strong>double garde</strong> (ADR-0020) : capacité déclarée <em>et</em> option active sur
        le lien (<code>link.userStateEnabled</code> / <code>sources.connaissances</code>).
      </p>

      <h2 id="mock">5. En mode mock (harness)</h2>
      <p>
        <code>npm run dev</code> lance <code>harness/host.mjs</code>, qui fabrique un contexte
        factice et implémente les actions <strong>localement</strong>, sans réseau :
      </p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Élément</th>
              <th>Comportement mock</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>resources.media</code>
              </td>
              <td>2 photos et 1 lien fictifs</td>
            </tr>
            <tr>
              <td>
                <code>resources.modelForm</code>
              </td>
              <td>champs fictifs</td>
            </tr>
            <tr>
              <td>
                <code>params</code>
              </td>
              <td>
                défauts du manifeste, surchargés par la query string (<code>?titre=…</code>)
              </td>
            </tr>
            <tr>
              <td>
                <code>submitIdentity</code>
              </td>
              <td>passe en phase chat + message d&apos;accueil</td>
            </tr>
            <tr>
              <td>
                <code>sendMessage</code>
              </td>
              <td>
                message utilisateur, <code>typing</code>, réponse mock avec une photo
              </td>
            </tr>
            <tr>
              <td>
                <code>finish</code>
              </td>
              <td>
                statut <code>finalisee</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul>
        <li>
          <code>?phase=chat</code> saute le sas d&apos;identité.
        </li>
        <li>
          <code>?consent=0</code> retire la politique de confidentialité.
        </li>
        <li>
          <code>?titre=Mon%20titre</code> surcharge un paramètre.
        </li>
        <li>
          Recharger la page <strong>réinitialise</strong> tout : rien n&apos;est persisté.
        </li>
      </ul>
      <p>
        Le mock ne teste <strong>pas</strong> : le LLM, le RAG, la persistance, les droits
        d&apos;accès aux médias ni le consentement réel. Pour cela, utilisez l&apos;aperçu ou le
        lien public.
      </p>
      <p className="hint">
        Pour des fixtures plus riches, modifiez le contexte mock dans <code>harness/host.mjs</code>{" "}
        (il est copié dans votre projet, il n&apos;est pas publié).
      </p>

      <h2 id="production">6. En production (dashboard)</h2>
      <p>
        La page <code>/l/[token]</code> charge le lien, le template et le consentement, puis
        construit le contexte avec <code>buildLinkContext</code> :
      </p>
      <ul>
        <li>
          <strong>Médias</strong> :{" "}
          <code>listActivesByType(&quot;photo&quot;|&quot;lien&quot;, link.templateKey)</code>.
          Seuls les médias <strong>actifs</strong> du <code>templateKey</code> du lien sont exposés.
          Les photos passent par <code>/api/medias/:id/file</code> (proxy autorisé), jamais par une
          URL directe.
        </li>
        <li>
          <strong>Fiche modèle</strong> : champs de la version du modèle du template.
        </li>
        <li>
          <strong>Thème / paramètres</strong> : configuration du lien + défauts du manifeste
          (valeurs invalides → défaut).
        </li>
        <li>
          <strong>Messages</strong> : vides en lien standard (phase identité), issus de la
          conversation en lien spécifique.
        </li>
      </ul>
      <p>
        <code>TemplateHost</code> injecte ensuite les actions réelles et réassigne{" "}
        <code>element.onirtechContext</code> à chaque changement d&apos;état (nouveau message,
        <code>typing</code>, phase, statut).
      </p>

      <h2 id="message">7. Cycle d&apos;un message</h2>
      <ol>
        <li>
          Le template appelle <code>actions.sendMessage(texte)</code>.
        </li>
        <li>
          L&apos;hôte ajoute le message utilisateur et passe <code>typing = true</code>.
        </li>
        <li>
          <code>POST /api/chat</code> : validation (≤ 4000 caractères), persistance, historique
          borné (20 tours), prompt système, puis <strong>mini-RAG</strong> sur les connaissances si
          la source est active, puis appel LLM.
        </li>
        <li>
          La réponse contient le message assistant, les <strong>références</strong> de connaissances
          réellement utilisées et <code>mediaPending</code>.
        </li>
        <li>
          Si <code>mediaPending</code>, l&apos;hôte appelle <code>/api/chat/media</code> pour
          attacher photos/liens à la réponse — sans retarder le texte.
        </li>
        <li>
          L&apos;hôte met à jour <code>state.messages</code> et réassigne le contexte : votre
          composant se re-rend.
        </li>
      </ol>
      <p>
        L&apos;identité suit le même principe : <code>submitIdentity</code> →{" "}
        <code>POST /api/chat/session</code> → création de la conversation/prospect, des messages
        d&apos;accueil, puis passage en phase chat.
      </p>

      <h2 id="creation">8. Qui crée quoi</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Objet</th>
              <th>Créé par</th>
              <th>Consommé via</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Photo / lien</td>
              <td>l&apos;exploitant (dashboard → médiathèque)</td>
              <td>
                <code>resources.media</code>
              </td>
            </tr>
            <tr>
              <td>Connaissance</td>
              <td>l&apos;exploitant (source du lien)</td>
              <td>
                <code>message.knowledge</code>
              </td>
            </tr>
            <tr>
              <td>Paramètre</td>
              <td>l&apos;exploitant (formulaire du lien)</td>
              <td>
                <code>params</code>
              </td>
            </tr>
            <tr>
              <td>Conversation / prospect / messages</td>
              <td>le serveur</td>
              <td>
                <code>state.messages</code>
              </td>
            </tr>
            <tr>
              <td>Réponse LLM</td>
              <td>le serveur</td>
              <td>
                <code>state.messages</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="securite">9. Sécurité</h2>
      <ul>
        <li>
          Le <strong>token du lien</strong> reste dans les fermetures de l&apos;hôte : il
          n&apos;apparaît jamais dans le contexte. Un template ne peut pas appeler l&apos;API
          directement.
        </li>
        <li>
          Les actions sont <strong>validées</strong> côté hôte (contenu non vide, ≤ 4000 caractères,
          identité conforme) — l&apos;hôte ne fait jamais confiance au template.
        </li>
        <li>
          Les médias sont servis par un <strong>proxy autorisé</strong> ; les URL directes ne sont
          pas exposées.
        </li>
        <li>
          Les valeurs du contexte sont insérées en <strong>texte</strong>, jamais en HTML.
        </li>
        <li>
          Les paramètres sont <strong>publics</strong> : n&apos;y mettez jamais de secret.
        </li>
      </ul>

      <h2 id="tester">10. Tester avec de vraies données</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Environnement</th>
              <th>Contexte</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Harness (<code>npm run dev</code>)
              </td>
              <td>mock</td>
              <td>simulées localement</td>
            </tr>
            <tr>
              <td>Aperçu du lien</td>
              <td>réel (médias, params, consentement)</td>
              <td>simulées (aucun appel API)</td>
            </tr>
            <tr>
              <td>Lien public</td>
              <td>réel</td>
              <td>réelles (LLM, RAG, persistance)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        L&apos;aperçu est le meilleur compromis pour valider l&apos;affichage avec vos vraies photos
        et connaissances sans créer de conversation.
      </p>

      <h2 id="faq">11. Questions fréquentes</h2>
      <dl className="doc-faq">
        <dt>
          <code>resources.media</code> est vide.
        </dt>
        <dd>
          La capacité <code>media</code> n&apos;est pas déclarée, ou aucun média actif ne porte le{" "}
          <code>templateKey</code> du lien.
        </dd>
        <dt>Les connaissances n&apos;apparaissent pas dans le contexte.</dt>
        <dd>
          C&apos;est normal : elles ne sont pas dans <code>resources</code>, mais dans{" "}
          <code>message.knowledge</code> des réponses assistant, et seulement si la capacité{" "}
          <code>knowledge</code> est déclarée et la source active sur le lien.
        </dd>
        <dt>Le mock ne renvoie pas mes vraies photos.</dt>
        <dd>
          Le harness est hors-ligne. Utilisez l&apos;aperçu du lien pour le contexte réel, ou
          modifiez les fixtures du harness.
        </dd>
        <dt>Puis-je appeler l&apos;API depuis mon template ?</dt>
        <dd>
          Non : le contrat l&apos;interdit (pas de token, pas d&apos;URL d&apos;API). Passez
          toujours par <code>actions</code>.
        </dd>
        <dt>Le message est envoyé mais rien ne revient.</dt>
        <dd>
          Vérifiez la console réseau de l&apos;hôte (lien public), le statut de la conversation et
          la configuration du lien (sources, modèle).
        </dd>
      </dl>

      <h2 id="references">12. Références</h2>
      <ul>
        <li>
          <a href="/documentation/templates-visuels">Contrat des templates visuels</a> — manifeste,
          capacités, paramètres.
        </li>
        <li>
          <a href="/documentation/sdk">SDK JavaScript</a> et{" "}
          <a href="/documentation/first-template">Your first package</a>.
        </li>
        <li>ADR-0019 (packages UI-only), ADR-0020 (capacités cœur), ADR-0023 (paramètres).</li>
        <li>
          Code : <code>src/domain/template-contract.ts</code>,{" "}
          <code>src/application/use-cases/visual-templates/link-template.ts</code>,{" "}
          <code>src/components/templates/TemplateHost.tsx</code>.
        </li>
      </ul>
    </Doc>
  );
}
