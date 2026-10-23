# 0020. Capacités du cœur exposées aux templates — état du visiteur & connaissances utilisées

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0019 (contrat hôte v1). Amende explicitement
  ADR-0019 §4 (« les connaissances ne sont PAS exposées »).

## Contexte

La scène « discussion » du template immersif (salle qui pivote à droite, personnage
2D, tableau images/connaissances/liens, dialogue texte) a besoin de **deux données
produites par le cœur** :

1. **L'état émotionnel du visiteur déduit de son message** — le personnage reflète
   `neutre` / `content` / `triste` selon que le visiteur formule une demande, exprime
   une déception, ou remercie / salue. Aujourd'hui le cœur ne produit pas cette
   information.
2. **Les connaissances réellement utilisées** pour construire la réponse — le tableau
   doit les afficher. Aujourd'hui elles sont injectées dans le prompt
   (`send-message.ts`, mini-RAG ADR-0012) puis **jetées** : ADR-0019 §4 a décidé de
   ne pas les exposer.

Contraintes structurantes :
- **Pas de couplage fort template ↔ cœur.** Le contrat hôte (ADR-0019) est le **seul**
  point de contact : le template **n'appelle jamais l'API**, il émet des actions et
  reçoit un contexte ; l'hôte exécute les appels.
- La détection d'état est une **capacité générique du cœur**, réutilisable par
  n'importe quel template (ou par le chat par défaut), **activable ou non au niveau
  du lien de chat**.
- L'extension du contrat doit être **additive** : un template qui ne déclare pas la
  capacité n'est pas impacté, un lien sans l'option n'appelle rien.

## Décision

### 1. Capacité cœur « état du visiteur » (générique)

- États : **`neutral` | `content` | `triste`** (définis dans le domaine, `user-state.ts`).
- Détection à partir du **message visiteur** (et de l'historique récent borné),
  via le port **`AiClient`** existant (ADR-0006), **sortie JSON stricte**.
- **Fail-open** : toute erreur / réponse non conforme → `neutral`. La détection ne
  bloque **jamais** le chat.
- Use-case `detect-user-state` (application), port inchangé, pas de nouvelle
  dépendance d'infrastructure.
- **Route d'API générique** `POST /api/chat/state` → `{ state, confidence }`
  (rate-limitée comme les autres routes chat, contexte lien/conversation).
  Elle est **le** point d'entrée réutilisable (dashboard, chat par défaut, autres
  clients), au-delà du template immersif.

### 2. Activation par lien de chat

- Colonne `chat_links.user_state_enabled boolean NOT NULL default false`
  (migration `0019_user_state.sql`).
- Exposée dans l'entité `ChatLink`, le repository, l'API lien et l'UI de création /
  édition du lien (toggle « Détecter l'état du visiteur »).

### 3. Extension additive du contrat hôte (ADR-0019)

- Nouvelle **capacité** déclarable au manifeste : **`userState`**
  (ajoutée à `TEMPLATE_CAPABILITIES` ; addition au contrat logique v1, la version du
  protocole n'est pas cassée).
- Nouveau champ **optionnel** `TemplateMessage.userState?: { label; confidence }`
  (porté par le message **utilisateur**). Absent si la capacité n'est pas déclarée
  **ou** si le flag lien est inactif.

### 4. Exposition des connaissances utilisées (amende ADR-0019 §4)

- Nouvelle **capacité** : **`knowledge`**.
- Nouveau champ **optionnel** `TemplateMessage.knowledge?: { ref; titre }[]`
  (porté par le message **assistant**), gaté par `link.sources.connaissances`.
- Le cœur remonte **uniquement** les métadonnées des connaissances réellement
  sélectionnées par le mini-RAG (référence + titre) ; **jamais** les blocs de contenu
  internes, jamais le prompt système.

### 5. Principe de découplage (invariant)

Le contact se fait **exclusivement** par le contrat, sous **double garde** :

```
template fournit  →  l'hôte fournit la donnée SEULEMENT SI
(manifeste déclare la capacité)  ET  (flag/option du lien est actif)
```

- Template → aucune connaissance du cœur, **aucun appel API**.
- Cœur → aucune connaissance d'un template (pas d'import croisé, pas de logique
  spécifique au template immersif).
- Sans la capacité ou sans le flag : **champ absent** ⇒ dégradation gracieuse
  (personnage neutre, tableau vide).

## Conséquences

### Positives
- La détection d'état et l'exposition des connaissances sont des **capacités du
  cœur**, pas des fonctionnalités d'un template : réutilisables (chat par défaut,
  futurs templates) et testables isolément via la route.
- **Zéro couplage** : le contrat est le seul point de contact, sous double garde
  (déclaration + flag) ; extension additive → aucun template existant cassé.
- Coût IA de la détection **maîtrisé** : activé au niveau du lien, fail-open,
  jamais bloquant pour la réponse.

### Négatives / Risques
- Un appel IA supplémentaire par message quand la capacité est active (coût/latence)
  → atténué par le flag lien, le fail-open et un prompt de classification court.
- Élargissement de la surface du contrat (deux capacités, deux champs optionnels)
  → cadré par la version logique du protocole et la validation de manifeste.
- Amendement d'une décision ADR-0019 §4 (connaissances non exposées) → tracé ici,
  porté uniquement par les métadonnées (ref/titre), pas le contenu interne.

## Alternatives écartées
- **Le template appelle directement `/api/chat/state`** : viole l'invariant
  ADR-0019 (« le template n'accède jamais à l'API »), duplique la gestion du
  token/session et crée un couplage fort. Rejeté.
- **Détection d'état côté client (mots-clés dans le template)** : non réutilisable,
  non activable par lien, résultat hétérogène selon les templates. Rejeté.
- **Injecter l'état dans `sendMessage` sans route dédiée** : couple le chat à la
  détection et ne fournit pas la capacité générique demandée. Gardé seulement comme
  **optimisation interne** optionnelle (même use-case), la route restant la source.
- **Exposer les blocs de connaissances complets** : fuite du contexte interne
  (prompt, contenu propriétaire). Rejeté au profit des métadonnées ref/titre.

## Plan de mise en œuvre (phases)
1. **ADR + norme** (cette ADR ; note d'extension de `docs/templates-visuels/norme-v1.md`).
2. **Cœur — état du visiteur** : domaine, use-case, route générique, flag lien
   (migration + entité + repo + API + UI), tests.
3. **Cœur — exposition connaissances** : métadonnées ref/titre remontées sur le
   message assistant, gatées par `sources.connaissances`.
4. **Contrat** : capacités `userState` / `knowledge` + champs optionnels
   `TemplateMessage`, filtrage dans `buildTemplateContext`, hôte.
5. **Template immersif — scène discussion** : rotation de salle, personnage 2D
   (3 visages + badine), tableau (images/connaissances/liens), composer, réactions.
6. **Intégration** : vérifs de dépendance (`oniria-arch`/`react-arch`), tests,
   import template + release.

## Liens
- US-CORE-STATE-001, US-CORE-KNOWLEDGE-001, US-TEMPLATE-DISCUSSION-001 (à créer).
- Complète ADR-0019 ; s'appuie sur ADR-0006 (IA), ADR-0012 (connaissances),
  ADR-0013 (médias), ADR-0002 (architecture en couches).
