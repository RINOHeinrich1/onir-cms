# 0029. Fournisseurs IA OpenAI-compatible et modèle par lien

- **Statut** : Accepté
- **Complété par** : `0030-catalogue-modeles-fournisseur.md` (modèles persistés par fournisseur)
- **Date** : 2026-10-22
- **Décideurs** : équipe projet
- **Remplace partiellement** : `0006-ia-infomaniak-openai-compat.md` pour la
  configuration globale du fournisseur (les décisions de sécurité et de prompt
  restent valides)

## Contexte

Le dashboard utilise aujourd'hui un unique fournisseur IA configuré par
l'environnement :

- `AI_API_TOKEN` : jeton Infomaniak ;
- `AI_PRODUCT_ID` : produit Infomaniak, intégré à l'URL ;
- `AI_MODEL` : modèle global, avec le défaut codé
  `Qwen/Qwen3.5-122B-A10B-FP8`.

Le client HTTP est un client OpenAI-compatible
(`src/infrastructure/ai/infomaniak-client.ts`) et toutes les opérations IA
(chat, classification d'état, sélection de médias/connaissances, brouillon de
fiche) partagent ce même modèle global. Les liens de chat ne peuvent donc pas
choisir un fournisseur ni un modèle.

L'objectif est de pouvoir utiliser tout fournisseur exposant une API
OpenAI-compatible : Infomaniak, OpenAI, DeepSeek, OpenRouter, DeepInfra, ou un
fournisseur interne. Une fois un fournisseur et un modèle paramétrés depuis
l'interface, chaque lien de chat doit pouvoir choisir le modèle qu'il utilise.

## Décision

### 1. Trois concepts distincts

- **Fournisseur** (`AiProvider`) : connexion à une API OpenAI-compatible
  (nom, URL de base, clé chiffrée, dialecte, options). Portée organisation.
- **Modèle** : identifiant textuel exposé par le fournisseur. Il est choisi
  explicitement ; aucun « premier modèle disponible » n'est sélectionné
  implicitement.
- **Affectation de lien** (`ChatLink.aiProviderId` + `ChatLink.aiModel`) :
  choix explicite pour un lien, ou héritage du défaut de l'organisation.

`AI_PRODUCT_ID` n'est pas un concept OpenAI générique : il reste un détail du
preset Infomaniak et est intégré à l'URL de base du fournisseur.

### 2. Portée par organisation

Les fournisseurs et le défaut IA sont propres à une organisation. Aucune clé
d'une organisation ne peut être lue ou utilisée par une autre. Les contraintes
d'unicité et les clés étrangères sont composites
(`organization_id`, `id`) pour empêcher tout croisement.

### 3. Ordre de résolution

À chaque appel IA :

1. choix explicite du lien (`aiProviderId` + `aiModel`) ;
2. défaut de l'organisation (`organization_ai_settings`) ;
3. configuration legacy lue dans l'environnement (`AI_API_TOKEN`,
   `AI_PRODUCT_ID`, `AI_MODEL`) ;
4. sinon, erreur explicite « IA non configurée ».

Un lien avec un choix explicite **ne bascule pas silencieusement** vers un
autre modèle si le modèle ou le fournisseur est indisponible. Les liens en mode
hérité suivent le défaut de l'organisation.

### 4. Persistance

Ajouter :

- `ai_providers` : fournisseur, preset, dialecte, URL de base, clé chiffrée,
  indice de clé, modèle par défaut facultatif, état, résultat du dernier test ;
- `organization_ai_settings` : fournisseur et modèle par défaut ;
- deux colonnes sur `chat_links` : `ai_provider_id`, `ai_model`, avec
  contrainte « les deux renseignés ou les deux nuls ».

Le catalogue des modèles n'est pas persisté en v1 : il est lu via
`GET {base_url}/models`, mis en cache mémoire quelques minutes, avec saisie
manuelle de l'identifiant si le fournisseur n'expose pas cette route.

### 5. Adaptateur OpenAI-compatible avec dialectes

Un adaptateur commun gère les requêtes `POST {base_url}/chat/completions`.
Les différences sont isolées dans un champ `dialect` :

- `openai` : requête standard ;
- `infomaniak` : URL produit et `chat_template_kwargs.enable_thinking=false`
  pour les modèles Qwen.

Le paramètre non standard `chat_template_kwargs` ne doit jamais être envoyé aux
autres fournisseurs. Les différences connues (`max_tokens` vs
`max_completion_tokens`, headers OpenRouter) sont traitées par le preset ou une
petite couche de compatibilité, jamais par du code spécifique dispersé dans les
cas d'usage.

### 6. Sécurité

- Chiffrement AES-256-GCM des clés avec une clé dédiée `AI_PROVIDER_KEY`.
  `LINK_TOKEN_KEY` ne doit pas être réutilisé.
- Aucune clé n'est retournée par l'API : seulement un indice `••••1234`.
- Validation SSRF de l'URL de base : HTTPS obligatoire en production, blocage
  des réseaux privés, loopback et métadonnées cloud, sauf activation explicite
  `AI_ALLOW_PRIVATE_NETWORKS=true` pour un fournisseur local.
- Les fournisseurs et modèles ne sont jamais choisis par le navigateur du
  visiteur : la résolution se fait côté serveur depuis le lien.
- Journalisation : fournisseur, modèle, latence, tokens ; jamais la clé ni les
  headers d'autorisation.

### 7. Permissions

Ajouter les actions RBAC :

- `ai:list`, `ai:read` : consulter les fournisseurs et modèles ;
- `ai:manage` : créer, modifier, tester, archiver, changer le défaut ;
- `ai:assign` : affecter un fournisseur/modèle à un lien.

Répartition cible :

- `admin` : toutes les actions ;
- `marketeur` : `ai:list`, `ai:read`, `ai:assign` (pas de gestion des clés) ;
- `lecteur` : aucun accès aux fournisseurs.

### 8. Interface

- Nouvelle page `/parametres/ia`, accessible aux admins d'organisation et au
  super-admin. La page `/configuration` existante reste réservée au super-admin
  et aux réglages globaux.
- Assistant d'ajout : preset, connexion, test, catalogue de modèles, modèle par
  défaut.
- Section « Moteur IA » dans la création et l'édition d'un lien :
  « Hériter du défaut de l'organisation » ou choix explicite fournisseur +
  modèle.
- Import explicite de la configuration legacy de l'environnement vers un
  fournisseur chiffré, sans écriture de secret dans une migration SQL.

### 9. Compatibilité et migration

La configuration legacy reste un fallback pendant la transition. Les liens
existants n'ont aucune affectation et continuent donc de fonctionner comme
aujourd'hui. Une fois le défaut d'organisation défini, les liens en mode hérité
utilisent ce défaut. Aucun changement de comportement n'est imposé aux liens
ayant un choix explicite.

### 10. Hors périmètre v1

- streaming des réponses ;
- modèle auxiliaire distinct pour les tâches de classification ;
- quotas et suivi de coût par fournisseur ;
- chaîne de fallback entre modèles ;
- sélection par conversation ;
- édition des prompts par fournisseur.

Ces sujets pourront faire l'objet d'extensions sans remettre en cause le modèle
Fournisseur → Modèle → Affectation de lien.

## Conséquences

- Le client IA n'est plus instancié globalement : une factory résout le
  fournisseur et le modèle depuis le lien, pour les six points d'appel IA
  existants.
- Les variables `AI_API_TOKEN`, `AI_PRODUCT_ID` et `AI_MODEL` deviennent une
  configuration de transition, puis un fallback legacy explicitement documenté.
- La gestion des clés devient une donnée métier sensible : chiffrement, audit,
  test de connexion et contrôle d'accès sont obligatoires.
- Le choix du modèle par lien est immédiatement visible dans l'administration,
  mais reste invisible pour le visiteur du chat public.
- La suppression d'un fournisseur utilisé est interdite : archivage uniquement,
  avec réaffectation préalable des liens concernés.

## Références

- `docs/adr/0006-ia-infomaniak-openai-compat.md`
- `docs/adr/0025-multitenancy-organisations.md`
- `src/infrastructure/ai/`
- `src/application/use-cases/chat/`
- `src/components/links/LinkForm.tsx`
- `src/components/links/LinkEditModal.tsx`
- `src/domain/rbac.ts`
