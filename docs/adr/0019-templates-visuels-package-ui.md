# 0019. Templates visuels — packages UI-only (norme et contrat hôte v1)

- **Statut** : Proposé (à valider en cadrage)
- **Date** : 2026-10-16
- **Décideurs** : équipe projet
- **Référence** : s'inspire de la norme **ONIRIA V3** (ADR-001 architecture extensible ;
  `guide-manifeste-package-oniria.md`, `guide-vues-web-components-oniria.md`),
  **réduite au strict nécessaire frontend**.

## Contexte

On veut pouvoir **personnaliser l'interface publique** du chat et du formulaire de
prospection (`/l/<token>`) par des **templates visuels** développés indépendamment,
installables et appliqués aux **liens de chat**.

Contraintes :
- le template est du **code tiers** exécuté chez le **visiteur** (page publique) → la
  **sécurité prime** (pas d'accès aux cookies/session/DOM de l'hôte, pas d'exfiltration) ;
- le développeur est **libre du design/UX** (framework de son choix), mais doit suivre
  une **norme** pour interagir avec le dashboard ;
- le développeur peut exploiter, **selon la norme**, des **ressources** du dashboard :
  messages, **média** (photos/liens), **modèle** de raisonnement, tokens de thème ;
- le dashboard doit rester **maintenable et scalable**.

ONIRIA V3 résout le même problème (code tiers hot-plug, contexte gelé injecté,
intégrité SRI, cycles de vie immuables, **trust levels**). On en reprend les concepts
**utiles**, sans les parties serveur inutiles ici (intentions, ressources,
migrations, P22…).

## Décision

### 1. Un template visuel = package **UI-only**

- Unité installable et versionnée : **un manifeste** (`onirtech.template.json`) +
  des **assets** (bundle ESM/CSS/fonts…), empaquetés dans une **archive**
  (`.onirtech-template`, ZIP) avec **SHA-256** et un `release.json`.
- **Aucune** contribution serveur (pas d'intentions, pas de tables, pas de
  migrations). Le template **n'accède jamais** à la base ni à l'API directement.

### 2. Norme (nomenclature alignée ONIRIA V3, allégée)

- `schemaVersion`, `kind: "template"`, `id` **kebab-case** (namespace), `version`
  **SemVer immuable**.
- `publisher.trustLevel` ∈ `official` | `verified` | `community`.
- `compatibility.hostProtocol: "onirtech.template-host.v1"`.
- `ui` : `mode` (`web-component` | `iframe`), `entry`, `element` (kebab-case), `integrity`
  (SRI `sha256-…`), `shadowDom`.
- `capabilities` : `messages`, `media`, `modelForm`, `theme` (sous-ensemble
  optionnel déclaré).
- `network` : liste **vide par défaut** (autorisation explicite requise).
- Champs ONIRIA **non repris pour l'instant** : `views`, `navigation`, `intentions`,
  `resources`, `migrations`, `serviceDependencies`, `sdkVersion`, `basePath`.

### 3. Exécution **trust-gated** (contrat logique identique)

- **`official` / `verified`** → **Web Component** monté dans la page : l'hôte injecte
  un **contexte gelé** (`element.onirtechContext = ctx`), comme ONIRIA.
- **`community`** → **iframe sandboxée** (origine **opaque**, pas d'`allow-same-origin`)
  + **pont `postMessage` v1**.
- Le **contrat logique est le même** dans les deux transports (le développeur écrit
  une fois) ; seul le transport diffère.

### 4. Contrat hôte v1 (résumé ; détail dans la norme)

- **Contexte gelé** injecté : `host`, `link`, `locale`, `brand`, `theme`,
  `capabilities`, `state` (messages + statut), `resources` (média scopé au lien,
  champs du modèle), `actions`.
- **Actions** (template → hôte) : `submitIdentity` (nom/email/contacts/**consentement**),
  `sendMessage`, `finish`, `request(capability)`, `openMedia(url)`, `resize(height)`.
- Le **template n'exécute rien côté plateforme** : il **émet des actions**, l'hôte
  fait les appels (session, chat, IA, média, fiche).
- **Ressources exposées** : messages, **média**, **modèle**. Les **connaissances ne
  sont PAS exposées** (elles façonnent la réponse IA côté serveur).
- **Réseau externe interdit par défaut** (déclaré dans `network`, autorisé par l'admin).

### 5. Distribution, validation, installation

- Import via le panneau : **archive + manifeste + intégrité**, **validation**
  (schéma, `hostProtocol` supporté, intégrité SRI, capabilities/n`network` en allowlist,
  anti-zip-bomb, types MIME) puis **installation** (version enregistrée).
- **Version publiée = immuable** (anti-doublon), comme ONIRIA.
- Assets **content-addressed** et servis **en lecture seule**, stockés via le **port
  `MediaStorage`** existant.

### 6. Application aux chatbots

- **1 lien de chat → 1 template visuel (version figée)** + `visual_template_config`
  (tokens de thème). Pattern identique au **modèle de raisonnement**
  (`chat_links.template_key` + `template_version`).
- Template **`default`** semé = **l'UI actuelle** → aucune régression (les liens
  existants restent sur `default`).

### 7. Modèle de données

- `visual_templates` (id, `key` unique, name, author, description…)
- `visual_template_versions` (template_id, `version`, `host_protocol`,
  `manifest jsonb`, `entry`, `integrity`, `trust_level`, created_at/by) — **immuables**.
- `visual_template_assets` (version_id, path, `sha256`, `storage_key`, size, mime).
- `chat_links.visual_template_id` + `visual_template_version` + `visual_template_config jsonb`.

### 8. Expérience développeur

- **Starter-kit** (`create-onirtech-template`) : génère le manifeste + un squelette.
- **Harness de dev** : émule le **côté hôte** du contrat (données mock, live-reload),
  dans **les deux transports**.
- CLI `onirtech-template pack|validate|inspect` → archive + SHA-256 + release.json.
- Template `default` **open source** comme exemple de référence.

## Conséquences

### Positives
- Le développeur est **libre du rendu** ; l'hôte **maîtrise les données et les appels**.
- **Isolation** : le code tiers ne touche jamais la session/l'API (iframe opaque pour
  `community`, WC pour la confiance).
- **Cohérence écosystème** : même vocabulaire mental qu'ONIRIA V3 (manifeste, trust,
  intégrité, versions immuables), sans hériter des parties inutiles.
- **Évolutif** : assets content-addressed + versions figées → cache/CDN, zéro couplage
  au framework du dev.

### Négatives / Risques
- **Deux transports** à supporter (WC + iframe) — coût de maintenance, atténué par un
  **contrat unique**.
- **Surface d'attaque** d'exécuter du code tiers → mitigée par le sandbox, l'intégrité,
  les capabilities et l'allowlist réseau.
- Gestion de la **hauteur/focus** de l'iframe (community).

## Alternatives écartées
- **Web Components obligatoires sans isolation** : dangereux pour du tiers non fiable
  (ONIRIA lui-même réserve le WC privilégié aux packages de confiance).
- **DSL déclaratif sans JS** (slots + tokens) : sûr mais bride le développeur.
- **Rendu serveur du template** : équivaut à exécuter du code tiers côté serveur.

## Plan de mise en œuvre (phases)
1. **ADR + guides** (cette ADR + `docs/templates-visuels/norme-v1.md`).
2. Socle backend : schéma de manifeste + validation + stockage (MediaStorage) + tables
   + import/installation + serving des assets.
3. Shell hôte (contexte + actions) + **extraction du template `default`** de l'existant.
4. Onglet **« Templates visuels »** + application au lien.
5. Starter-kit + harness + transport **iframe** (community).
6. Transport **Web Component** (official/verified).

## Liens
- US-TEMPLATE-001 (à créer) ; s'appuie sur ADR-0011 (modèles de raisonnement, pattern
  de version figée) et ADR-0013 (medias/MediaStorage).
