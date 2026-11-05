# 0067. Outils internes sur les fiches et statuts de qualification

- **Statut** : Accepté
- **Date** : 2026-11-04
- **Décideurs** : équipe projet
- **Référence** : ADR-0033, ADR-0035, ADR-0042, ADR-0049, ADR-0055, ADR-0059.
- **Complète** : ADR-0049 (fiches de collecte), ADR-0055 (fiches liées aux chatbots).

## Contexte

Le projet MandamPro devait initialement s'appuyer sur un microservice externe
dédié à la recherche, à la sauvegarde des conversations et aux messages métier.
Cette approche a été écartée pour la première implémentation : elle crée trop de
couplage, de contrats et de tâches émergentes.

Le périmètre retenu est désormais :

```text
Template Mandam-Pro (UI-only)
        ↓
ONIR-CMS (hôte, conversation, IA, fiches, outils internes)
```

ONIR-CMS ne doit pas connaître le domaine MandamPro. Il doit fournir des
capacités génériques :

- rechercher des fiches internes ;
- filtrer ces fiches sur des champs et sur un statut de qualification ;
- exposer le résultat au modèle et au template ;
- laisser le template décider du rendu visuel.

Le lien de chat est public. Les fiches exposées sont celles définies dans la
fiche de collecte et rattachées au chatbot. Les champs sensibles doivent être
déclarés optionnels ou ne pas être définis ; il n'y a pas de liste blanche
technique de champs dans cette première implémentation.

Il n'y a donc ni microservice Mandam, ni MCP, ni UTCP dans cette première
implémentation. Les webhooks existants restent manuels : le bouton
« Envoyer vers … » est déclenché par un humain après vérification de la fiche.
Aucun statut `validated` / `rejected` n'est ajouté.

## Décision

### 1. Périmètre fonctionnel

Les outils sont **internes à ONIR-CMS** et **en lecture seule** dans le MVP :

```text
search_fiches
continue_search
get_fiche
list_fiche_types
count_fiches
```

Ils ne peuvent pas :

- créer, modifier ou supprimer une fiche ;
- modifier un statut de qualification ;
- exécuter du SQL libre ;
- appeler un service externe ;
- sortir du périmètre d'une organisation et d'un chatbot.

La recherche porte sur **toutes les fiches rattachées au chatbot**, via
`fiche_chat_links`, et non uniquement sur la fiche active de la conversation.

`list_fiche_statuses` n'est pas un outil public. En mode public `hidden_fixed`,
les statuts sont totalement internes et ne sont jamais transmis au modèle. Les
modes backoffice sont explicitement opt-in et interdits sur un lien public.

### 2. Statuts de qualification

#### 2.1 Nature

Le statut de qualification est une **métadonnée de fiche**, pas un champ de
collecte.

Il ne doit jamais être :

- ajouté à `FicheDefinition.fields` ;
- stocké dans `fiches.data` ;
- rendu par `renderTemplate` comme un champ ;
- exposé dans les cartes ou le template visiteur ;
- transmis au modèle.

#### 2.2 Définition

Un statut est défini au niveau d'une **fiche de collecte** :

```ts
type FicheStatusDefinition = {
  key: string;                 // clé stable, ex. "a_qualifier"
  label: string;               // libellé, ex. "À qualifier"
  order: number;               // ordre d'affichage
  color?: string;              // couleur facultative
  isDefault: boolean;          // statut attribué aux nouvelles fiches
  archivedAt: string | null;   // archivage, jamais de suppression physique
  updatedAt: string;           // dernière mise à jour
};
```

Ces définitions sont ajoutées à `FicheDefinition.statuses` et versionnées avec
le snapshot de configuration du chatbot.

La version du statut est portée par la version du snapshot de la fiche de
collecte. Il n'y a pas de table indépendante de statuts dans cette première
implémentation.

#### 2.3 Règles

- `key` est immuable.
- `label`, `order`, `color` sont modifiables ; une modification crée une
  nouvelle version de configuration.
- Un statut ne peut pas être supprimé physiquement s'il est utilisé. Il est
  archivé.
- Une fiche conserve son snapshot de définition et sa clé de statut.
- Le libellé est résolu depuis le snapshot de la fiche ; un renommage ne
  réécrit pas l'historique des fiches existantes.
- Une fiche sans statut reste `null` / « Non qualifiée ».
- Aucun backfill automatique n'est effectué sur les fiches existantes.

#### 2.4 Stockage

La fiche porte uniquement la clé :

```text
fiches.qualification_status_key
fiches.qualification_status_updated_at
fiches.qualification_status_updated_by
```

Le libellé, la couleur et l'ordre ne sont pas dupliqués dans chaque fiche.

#### 2.5 Statuts internes en mode public

En mode public `hidden_fixed`, utilisé par MandamPro, les statuts sont :

- visibles dans le backoffice ;
- configurables dans l'outil du chatbot ;
- **jamais transmis au modèle** ;
- **jamais affichés** dans les cartes ou le template visiteur.

Les modes backoffice `internal_filter` et `all` sont décrits en 2.6. Ils ne
doivent jamais être activés sur un lien public.

Lors de la configuration de l'outil `search_fiches` dans le chatbot, l'admin
choisit un filtre de statut fixe :

```json
{
  "tool": "search_fiches",
  "ficheTypes": ["fournisseur"],
  "fixedStatusKeys": ["publie"]
}
```

Ce filtre est appliqué automatiquement par ONIR avant toute recherche. Il est
versionné avec la configuration du chatbot.

Le modèle ne reçoit :

- ni `statusKeys` ;
- ni libellé de statut ;
- ni statut dans le résultat ;
- ni d'outil permettant de lister les statuts.

Si un statut référencé est archivé ou retiré, la configuration de l'outil devient
invalide et doit être corrigée dans le backoffice.

#### 2.6 Politique de statut configurable

Le mode `hidden_fixed` est le mode par défaut et le seul utilisé par MandamPro :

```text
statusMode: "hidden_fixed"
fixedStatusKeys: ["publie"]
```

Modes prévus pour les usages futurs :

```text
hidden_fixed    → statut imposé, jamais transmis au modèle (public)
internal_filter → statut visible par le modèle, réservé au backoffice
all             → aucun filtre de statut, réservé au backoffice
```

`internal_filter` et `all` ne doivent jamais être activés sur un lien public.
Le mode est stocké dans la configuration versionnée de l'outil.

### 3. Suppression des colonnes legacy des fiches

Le modèle générique actuel est :

```text
fiches.data        → valeurs des champs de la fiche de collecte
fiches.definition  → snapshot de la définition
```

Les colonnes statiques suivantes sont des colonnes legacy de l'ancienne fiche
de prospection. Elles sont supprimées :

```text
plateformes
description
budget
duree
contact
statut
contraintes_techno
lien_doc_spec
```

Cela inclut notamment `budget` et `contact`. Si `budget` ou `contact` sont
définis comme champs dans une fiche de collecte, leurs valeurs restent dans
`fiches.data` ; seule la colonne statique redondante est supprimée.

Le champ historique `statut` (`initier` / `reprendre`) est supprimé. Il ne doit
pas être confondu avec le nouveau statut de qualification.

Sont retirés :

- `STATUTS_FICHE` ;
- le champ `statut` de `Fiche` ;
- le champ `statut` de `MANUAL_FICHE_DEFINITION` ;
- les colonnes legacy de lecture de `fiches.statut` ;
- les références à `statut` dans les formulaires, DTO, filtres et templates ;
- la dépendance `requiredIf` de `contraintesTechno` envers `statut`.

`contraintesTechno` reste un champ optionnel s'il est conservé.

#### Migration destructive confirmée

La suppression est assumée comme destructive :

1. backfiller `fiches.data` depuis les colonnes legacy si une valeur manque ;
2. retirer `statut` de `fiches.data` ;
3. retirer le champ des snapshots `fiches.definition` ;
4. supprimer toutes les colonnes legacy listées ci-dessus ;
5. supprimer les références de code et de tests ;
6. ne pas restaurer les valeurs historiques dans le nouveau statut de
   qualification.

Une sauvegarde préalable est obligatoire avant la migration.

Les fiches existantes conservent `qualification_status_key = NULL`.

### 4. Contrat des outils internes

#### 4.1 `search_fiches`

Contexte implicite fourni par l'hôte, jamais par le modèle :

```text
organizationId
chatLinkId
conversationId
statusMode
fixedStatusKeys
sortMode
scope
```

Entrées :

```json
{
  "query": "maison Antananarivo",
  "ficheTypes": ["maison"],
  "conditions": [
    { "field": "ville", "operator": "eq", "value": "Antananarivo" },
    { "field": "loyer", "operator": "lt", "value": 5 }
  ],
  "createdFrom": "2026-11-01",
  "createdTo": "2026-11-30",
  "limit": 10
}
```

Toutes les conditions sont combinées en `AND`. Les groupes `OR` sont hors
périmètre.

Résultat :

```json
{
  "items": [ ... 10 fiches ... ],
  "total": 30,
  "hasMore": true,
  "page": { "limit": 10, "offset": 0 }
}
```

Règles :

- seules les fiches rattachées au chatbot sont accessibles ;
- seuls les champs déclarés par la fiche de collecte sont interrogeables ;
- les champs de type fichier sont exclus du rendu et du résultat public ;
- le filtre `fixedStatusKeys` est appliqué automatiquement et n'est jamais
  exposé au modèle lorsque `statusMode = hidden_fixed` ;
- `sortMode` et `scope` sont lus depuis la configuration de l'outil ;
- `ficheTypes` est optionnel ; s'il est absent, tous les types rattachés sont
  interrogés ;
- `limit` est borné à 20 par défaut au maximum ;
- les fiches archivées sont exclues par défaut ;
- chaque recherche crée une session de pagination côté serveur ;
- le moteur ne demande jamais au modèle de reconstruire les conditions pour
  afficher la page suivante.

#### 4.2 `get_fiche`

Même périmètre que `search_fiches`, y compris `fixedStatusKeys` et
`ficheTypes`. Retourne une fiche par son identifiant. Les mêmes règles
d'exclusion s'appliquent.

#### 4.3 `list_fiche_types`

Retourne les types de fiches disponibles pour le chatbot :

```json
[
  { "key": "fournisseur", "label": "Fournisseur" },
  { "key": "partenaire", "label": "Partenaire" }
]
```

Cet outil ne retourne jamais de statut de qualification.

#### 4.4 `count_fiches`

Mêmes filtres que `search_fiches`, y compris `fixedStatusKeys`, mais retourne
uniquement le nombre de fiches.

#### 4.5 `continue_search`

Après une recherche, l'utilisateur peut demander « montre-moi les autres ».
Le modèle appelle `continue_search` avec la limite souhaitée :

```json
{
  "limit": 10
}
```

La session active la plus récente de la conversation est reprise
automatiquement.

Résultat :

```json
{
  "items": [ ... 10 fiches ... ],
  "total": 30,
  "hasMore": true,
  "page": { "limit": 10, "offset": 10 }
}
```

`continue_search` ne permet jamais de modifier les conditions, les types de
fiches ou le statut fixe. Si l'utilisateur change une condition, le modèle doit
créer une nouvelle recherche avec `search_fiches`.

#### 4.6 Filtres standard

Les filtres sont typés. Le modèle ne fournit jamais d'opérateur SQL : il fournit
un opérateur sémantique, validé contre le type du champ.

Types de champs requis pour le MVP :

```text
text, textarea, url, email, select, multi, number, date, image, file
```

Les types `number` et `date` sont ajoutés pour couvrir les filtres du type
« inférieur à 5 euros » ou « après le 1er novembre ». Les champs existants de
type texte ne sont pas convertis automatiquement : une fiche qui doit être
filtrée sur un prix doit définir un champ `number`.

Matrice des opérateurs :

| Type de champ | Opérateurs autorisés |
|---|---|
| `text`, `textarea`, `url`, `email` | `eq`, `neq`, `contains`, `starts_with`, `ends_with`, `in`, `exists`, `is_empty` |
| `select` | `eq`, `neq`, `in`, `not_in`, `exists`, `is_empty` |
| `multi` | `contains_any`, `contains_all`, `contains_none`, `exists`, `is_empty` |
| `number` | `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `between`, `in`, `exists` |
| `date` | `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `between`, `exists` |
| `image` | `exists`, `is_empty` |
| `file` | aucun filtre |

Sémantique :

- `lt` : strictement inférieur ;
- `lte` : inférieur ou égal ;
- `gt` : strictement supérieur ;
- `gte` : supérieur ou égal ;
- `between` : bornes incluses ;
- `in` / `not_in` : liste de valeurs ;
- `contains` : sous-chaîne, insensible à la casse ;
- `starts_with` / `ends_with` : préfixe / suffixe, insensible à la casse ;
- `contains_any` / `contains_all` / `contains_none` : sur les champs `multi` ;
- `exists` : champ présent et non vide ;
- `is_empty` : champ absent, nul ou vide.

Règles :

- un opérateur incompatible avec le type du champ produit une erreur d'outil ;
- une valeur numérique doit être un nombre JSON valide ;
- un champ `number` peut porter une unité d'affichage (`€`, `Ar`) sans conversion
  automatique ;
- une date doit être une date ISO `YYYY-MM-DD` ;
- une valeur de `select` doit appartenir aux options du champ ;
- une valeur de `multi` est une liste de chaînes ;
- les conditions sont limitées en nombre ;
- si un champ conditionné n'existe pas dans l'un des types de fiches
  sélectionnés, ces fiches sont exclues du résultat ;
- si le champ n'existe dans aucun type sélectionné, l'outil renvoie une erreur ;
- les accents ne sont pas normalisés dans le MVP ;
- aucun opérateur `OR`, regex ou SQL brut n'est accepté.

#### 4.7 Tri équitable

Le tri par `created_at` seul est injuste : les nouveaux entrants restent
toujours en fin de liste. Le MVP utilise une rotation déterministe.

Base :

```sql
row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
count(*) OVER () AS total
```

Rotation :

```text
offset = hash(conversationId) % total
position = (rn - 1 + offset) % total
ORDER BY position
```

Conséquences :

- chaque conversation voit un ordre différent ;
- l'ordre reste stable pendant une conversation ;
- un nouvel entrant n'est pas condamné à rester dernier ;
- aucun `random()` imprévisible n'est utilisé ;
- l'ordre est calculé une seule fois à la création de la session ;
- la pagination lit une liste ordonnée stable ;
- les nouveaux résultats ajoutés après la création de la session n'apparaissent
  pas dans cette session ;
- une nouvelle recherche crée une nouvelle session et un nouvel ordre.

Le tri s'applique uniquement aux résultats filtrés. Les compteurs ne sont pas
affectés.

#### 4.8 Sessions de recherche

Chaque `search_fiches` crée une session serveur :

```text
chat_search_sessions
- id
- organization_id
- chat_link_id
- conversation_id
- criteria_json
- ordered_fiche_ids
- total
- offset
- created_at
- expires_at
```

La session contient :

- les critères normalisés ;
- le filtre de statut fixe ;
- les types de fiches ;
- l'ordre de rotation calculé ;
- la liste ordonnée des identifiants ;
- la position courante.

`continue_search` reprend la session active la plus récente de la conversation.
Il ne peut pas modifier les critères.

Si une fiche de la liste a été supprimée ou archivée entre deux pages, elle est
ignorée. Si elle a été modifiée, la version courante est affichée. Le total
reste celui de la session.

La session expire après une durée bornée, par exemple 30 minutes, ou à la fin
de la conversation. Après expiration, l'utilisateur doit relancer une recherche.

Le nombre de résultats mémorisés est borné. Au-delà d'un seuil, la recherche
demande à l'utilisateur d'affiner ses critères plutôt que de mémoriser une
liste illimitée.

Une nouvelle recherche remplace la session active précédente pour la
conversation. Les sessions expirées sont nettoyées.

#### 4.9 Politiques configurables de l'outil

Pour rester générique et réutilisable, les politiques suivantes sont
configurables dans la configuration versionnée du chatbot, et non codées en dur
dans le service de recherche.

##### `enabled`

L'outil est **désactivé par défaut** (`enabled = false`). Il doit être activé
manuellement pour chaque chatbot. Tant qu'il est désactivé, le comportement
historique est conservé : aucune boucle d'outil n'est exécutée.

Une fois activé, `ficheTypes` vide signifie « tous les types rattachés au
chatbot ».

##### `statusMode`

```text
hidden_fixed    (défaut, public)
internal_filter (backoffice)
all             (backoffice)
```

MandamPro utilise `hidden_fixed`. Un autre client ou un usage backoffice peut
choisir un autre mode sans modifier le code du service.

##### `sortMode`

```text
fair_rotation  (défaut)
created_at
relevance      (non implémenté dans le MVP)
```

`fair_rotation` reste le comportement par défaut. `created_at` permet un tri
classique pour un usage administratif. `relevance` est réservé à une évolution
future et ne doit pas être annoncé comme disponible.

##### `scope`

```text
chat_link     (défaut ; fiches rattachées au chatbot)
organization  (backoffice uniquement)
```

`scope = organization` est interdit sur un lien public. Le MVP n'implémente que
`chat_link` ; la valeur `organization` est une extension contrôlée.

##### `fieldExposure`

Il n'y a pas de liste blanche de champs dans le MVP. Les champs exposés sont
ceux définis et renseignés dans la fiche de collecte. Les champs sensibles
doivent être optionnels ou non définis.

### 5. Contrat `MessageBlock`

Le cœur ne transmet pas une structure de carte propre à un type de fiche. Il
transmet des **champs typés**. Le template sait rendre un texte, un lien, une
image, un nombre, une date, etc. ; il n'a pas besoin d'un renderer conditionné
par `ficheKey`.

```ts
type ToolFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "url"
  | "email"
  | "image"
  | "select"
  | "multi";

type ToolField = {
  key: string;
  label: string;
  type: ToolFieldType;
  value: string | number | string[] | null;
  unit?: string; // nombre : "€", "Ar", etc.
};

type ToolSearchResultItem = {
  fields: ToolField[];
};

type MessageBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      url: string;
      alt?: string;
    }
  | {
      type: "tool_search_result";
      contractVersion: 1;
      tool: string;
      layout?: "card" | "list";
      items: ToolSearchResultItem[];
      meta?: {
        total?: number;
        hasMore?: boolean;
      };
    };
```

Un message contient un tableau ordonné de blocs :

```ts
type ChatMessage = {
  // ...
  content: string;
  blocks: MessageBlock[];
};
```

Règles :

- `content` reste le texte de secours et la valeur indexable ;
- `blocks` est la représentation riche préférée ;
- un message peut contenir texte, images et résultats d'outil simultanément ;
- le cœur transforme les champs de la fiche en `ToolField[]` ;
- l'ordre des champs suit celui de la définition de la fiche ;
- `label` vient de la définition de la fiche ;
- `type` vient de la définition de la fiche ;
- les champs fichier sont exclus ;
- les champs vides sont omis ;
- les valeurs sont typées : texte, nombre, date, liste, URL, image ;
- le template rend chaque champ selon son `type` ;
- le template peut utiliser `layout` comme indication générique de présentation ;
- le template ne doit jamais avoir besoin de `ficheKey` pour rendre un champ ;
- `contractVersion` permet de faire évoluer le contrat de champ ;
- un type de champ inconnu est rendu comme texte de secours ;
- aucun HTML brut n'est accepté ;
- les valeurs sont échappées par le template ;
- la taille et le nombre d'items sont bornés.

Un résultat peut produire plusieurs blocs `tool_search_result`, par exemple un
bloc par page ou par groupe de résultats, mais chaque item reste composé de
champs typés.

### 6. Séparation modèle / template

Le résultat d'outil possède deux projections :

1. **Projection modèle** : champs de fiche nécessaires au raisonnement, sans
   statut, sans métadonnées et sans champs fichier.
2. **Projection template** : champs typés (`ToolField[]`), avec libellé, type,
   valeur et unité éventuelle, sans métadonnées.

En mode `hidden_fixed`, les statuts de qualification ne sont jamais transmis au
modèle. Ils servent uniquement de filtre fixe configuré dans l'outil. Les modes
backoffice `internal_filter` et `all` sont explicitement opt-in.

Les champs de type fichier sont exclus des deux projections de rendu. Aucun lien
signé n'est généré dans les cartes.

### 7. Appel des outils par l'IA

Le fournisseur IA peut être n'importe quel fournisseur compatible OpenAI. Tous
ne supportent pas le tool calling natif.

Deux chemins sont prévus :

#### 7.1 Tool calling natif

Si le modèle expose le tool calling, ONIR utilise le mécanisme standard :

1. le modèle choisit un outil ;
2. ONIR valide les arguments ;
3. ONIR exécute l'outil ;
4. le résultat est renvoyé au modèle ;
5. le modèle produit la réponse finale.

#### 7.2 Planner JSON de secours

Si le modèle ne supporte pas le tool calling natif, ONIR utilise un plan
structuré :

```json
{
  "action": "search_fiches",
  "arguments": {
    "ficheTypes": ["fournisseur"],
    "conditions": []
  }
}
```

ou :

```json
{
  "action": "final",
  "text": "..."
}
```

Le planner est validé avant exécution. En cas de JSON invalide, ONIR retente une
fois, puis répond sans outil.

La boucle est limitée à **deux appels d'outil maximum** par message. Les outils
sont en lecture seule.

### 8. Template Mandam-Pro

Le template est un package visuel **UI-only** :

- design inspiré de ChatGPT ;
- logo, titre et couleurs via `params` / `theme` ;
- rendu des blocs `text`, `image`, `tool_search_result` ;
- aucune logique de recherche ;
- aucun accès direct à la base ou à l'API ;
- aucune authentification spécifique dans un premier temps.

L'authentification OTP email et TOTP est **reportée**. Le premier lot ne
nécessite pas de nouveau mode d'identification.

Le template doit pouvoir ignorer les blocs qu'il ne connaît pas et afficher
`content`. Il doit aussi prévoir un renderer de secours par `contractVersion` :
si le template ne connaît pas une version ou un type de champ, il affiche une
représentation texte du champ au lieu d'échouer.

Le template rend les champs selon leur type :

```text
text / textarea  → texte
number           → nombre formaté + unité éventuelle
date             → date lisible
url              → lien
email            → lien mailto
image            → image
select           → libellé / badge
multi            → liste ou badges
```

Il n'y a pas de renderer conditionné par `ficheKey`. Un nouveau type de fiche
n'exige pas un nouveau renderer si ses champs utilisent les types standards.

Le rendu de secours ne doit jamais exposer les métadonnées, les statuts ou les
champs fichier.

### 9. Webhooks

Les webhooks existants restent inchangés :

- déclenchement manuel par un humain ;
- bouton « Envoyer vers … » ;
- aucun déclenchement automatique ;
- aucun statut `validated` / `rejected` ;
- aucune dépendance à Mandam.

Le journal des livraisons reste disponible via l'API existante. L'ajout d'un
résumé visuel « nombre d'envois / dernier statut » sur la fiche est une
amélioration UI séparée, hors périmètre de cette ADR.

### 10. Sécurité et limites

- Toute recherche est scopée à l'organisation et au chatbot.
- Aucune fiche non rattachée au chatbot n'est accessible.
- Aucun SQL libre, aucune expression arbitraire.
- Les champs interrogeables sont limités à la définition de la fiche.
- Il n'y a pas de liste blanche de champs : la confidentialité repose sur les
  champs définis et renseignés dans la fiche de collecte. Les champs sensibles
  doivent être optionnels ou non définis.
- Les champs fichier sont exclus du rendu ; aucun lien signé.
- En mode public `hidden_fixed`, les statuts, métadonnées et champs fichier ne
  sont jamais transmis au modèle.
- Les modes `internal_filter` et `all` sont interdits sur un lien public.
- `scope = organization` est interdit sur un lien public.
- Les résultats sont bornés en nombre et en taille.
- Les opérateurs sont validés contre le type réel du champ.
- Les valeurs numériques et dates sont typées, jamais interprétées comme SQL.
- Les sessions de recherche sont scopées à une conversation et expirent.
- Une session ne peut pas être réutilisée par une autre organisation ou un autre
  chatbot.
- Les appels d'outils sont bornés et journalisés.
- Le template ne reçoit jamais de secret ni d'accès base.
- Les webhooks restent manuels et ne sont pas utilisés comme outil interne.

## Migration

- Ajouter `statuses` dans les définitions de fiches de collecte.
- Ajouter les types de champs `number` et `date` aux définitions de fiches.
- Ajouter les colonnes de qualification sur `fiches`.
- Ajouter `blocks` sur `chat_messages`.
- Ajouter la table `chat_search_sessions`.
- Ajouter `statusMode`, `sortMode` et `scope` dans la configuration versionnée
  de l'outil.
- Ajouter un index sur
  `(organization_id, qualification_status_key)`.
- Ajouter un index de session sur
  `(organization_id, chat_link_id, conversation_id, created_at DESC)`.
- Backfiller `fiches.data` depuis les colonnes legacy si nécessaire.
- Retirer `statut` des définitions, DTO, formulaires, filtres, templates et
  tests.
- Retirer `statut` de `fiches.data` et des snapshots de définition.
- Supprimer les colonnes legacy :
  `plateformes`, `description`, `budget`, `duree`, `contact`, `statut`,
  `contraintes_techno`, `lien_doc_spec`.
- Ne pas backfiller le statut de qualification des fiches existantes.
- Ne pas convertir automatiquement les anciens champs texte en `number` ou
  `date`.
- Sauvegarde obligatoire avant la migration destructive.

## Tests attendus

- création, modification, ordre et archivage d'un statut de qualification ;
- clé immuable et libellé modifiable ;
- nouvelle version de configuration avec snapshot de statuts ;
- fiche existante sans statut ;
- filtre de statut fixe appliqué automatiquement ;
- statut absent du prompt et du résultat public ;
- recherche par type de fiche ;
- recherche par conditions de champs ;
- opérateurs `lt`, `lte`, `gt`, `gte`, `between` sur un champ `number` ;
- opérateurs de date sur un champ `date` ;
- rejet d'un opérateur incompatible avec le type du champ ;
- rejet d'un champ texte utilisé comme nombre ;
- recherche limitée aux fiches rattachées au chatbot ;
- pagination de 30 résultats en 3 pages de 10 ;
- `total`, `hasMore` et absence de doublons entre les pages ;
- `continue_search` conserve les conditions et le statut fixe ;
- `statusMode = hidden_fixed` ne transmet aucun statut au modèle ;
- `statusMode = internal_filter` est refusé sur un lien public ;
- `scope = organization` est refusé sur un lien public ;
- `sortMode = created_at` stable ;
- `sortMode = fair_rotation` stable dans une conversation ;
- `contractVersion` inconnu traité par le renderer de secours ;
- nouvelle condition = nouvelle recherche ;
- session expirée = nouvelle recherche obligatoire ;
- rotation stable dans une conversation et différente entre conversations ;
- absence de fuite inter-organisations ;
- exclusion des champs fichier et des métadonnées ;
- `blocks` avec texte, image et `tool_search_result` ;
- `ToolField` avec label, type, valeur et unité ;
- ordre des champs identique à la définition de fiche ;
- rendu générique par type : texte, lien, email, image, nombre, date, select,
  multi ;
- template sans renderer par `ficheKey` ;
- type de champ inconnu retombant sur un rendu texte ;
- template inconnu retombant sur `content` ;
- tool calling natif ;
- planner JSON de secours ;
- limite de deux appels d'outil ;
- suppression complète de toutes les colonnes legacy.

## Alternatives écartées

- **Microservice Mandam** : couplage et contrats externes prématurés.
- **MCP / UTCP** : inutiles pour des outils internes et coûteux à sécuriser.
- **Définir les cartes dans le cœur** : structure variable selon la fiche,
  couplage inutile.
- **Statut comme champ de collecte** : mélange métadonnées et données métier.
- **Statut `validated` / `rejected`** : le webhook manuel suffit.
- **Webhook automatique** : non nécessaire et non souhaité.
- **Liste blanche de champs** : les champs sensibles sont optionnels ou non
  définis dans la fiche de collecte.
- **Tri `created_at` seul** : condamne les nouveaux entrants à rester derniers.
- **`random()` par requête** : non déterministe et incompatible avec une
  pagination fiable.
- **Pagination laissée au modèle** : le modèle peut perdre les conditions ou
  sauter des résultats ; la session serveur est la source de vérité.
- **Comparer les nombres dans un champ texte** : ordre lexicographique faux et
  validation impossible.
- **Statuts exposés au modèle en mode public** : contraire au caractère interne
  des statuts.
- **Politiques de statut, tri et portée codées en dur** : rend l'outil spécifique
  à un seul usage.
- **Renderer conditionné par `ficheKey`** : recrée un couplage par type de fiche
  et oblige à modifier le template à chaque nouvelle fiche.
- **Renderer unique supposé tout connaître** : fragile dès qu'un type de champ
  ou une version de contrat évolue.
- **Outils d'écriture** : reportés.
- **OTP / TOTP** : reportés.
- **Lien signé pour les champs fichier** : exclu.

## Conséquences

### Positives

- Aucun couplage à MandamPro dans le cœur.
- Aucun service externe à maintenir.
- Les statuts sont versionnés avec la fiche de collecte.
- Les statuts restent totalement internes en mode public `hidden_fixed`.
- Le template garde la maîtrise du rendu des cartes.
- Les fournisseurs IA sans tool calling restent utilisables.
- Le tri par rotation évite de pénaliser systématiquement les nouveaux entrants.
- Les politiques `statusMode`, `sortMode` et `scope` sont configurables.
- Le `contractVersion` permet de faire évoluer le rendu sans casser les
  templates.
- Les filtres numériques et dates sont explicitement typés.
- La pagination conversationnelle conserve les conditions et évite les doublons.

### Négatives / limites

- Le template doit connaître les types de champs de `tool_search_result`.
- Un nouveau type de champ peut nécessiter une mise à jour du template.
- Chaque template doit maintenir un renderer de secours par type de champ.
- Les modes backoffice de statut et de portée doivent être protégés pour ne
  jamais être exposés sur un lien public.
- La suppression des colonnes legacy est destructive et irréversible.
- Les outils sont en lecture seule.
- L'authentification visiteur spécifique n'est pas disponible dans ce lot.
- La confidentialité des fiches publiques repose sur la définition des champs.
- Les anciens champs texte ne deviennent pas filtrables numériquement sans
  redéfinition en champ `number`.
- Les sessions de recherche doivent être stockées et nettoyées.
- Les performances de recherche sur `data` devront être surveillées.

## Amendement — 2026-11-05 : portée par fiches de collecte

La notion de `scope` (`chat_link` / `organization`) est supprimée.

La portée de l'outil est désormais définie par une liste de **fiches de
collecte** sélectionnées dans l'organisation (`ficheTypes` dans le contrat
actuel, à comprendre comme des clés de fiches de collecte).

- Une fiche de collecte sélectionnée rend interrogeables **toutes ses instances
  de l'organisation**, qu'elles soient ou non rattachées au chatbot.
- Une fiche de collecte non sélectionnée est exclue.
- Aucune sélection d'instance individuelle n'est possible.
- Le chatbot ne peut pas modifier cette portée : elle est fixée dans la
  configuration versionnée de l'outil.
- Le filtre `fiche_chat_links` est retiré de la recherche.
- L'UI utilise un tag-input searchable alimenté par les fiches de collecte de
  l'organisation, avec sélection multiple et suppression par tag.
- L'outil doit être activé manuellement (`enabled = true`) et au moins une fiche
  de collecte doit être sélectionnée.
- Les anciennes configurations `scope` sont ignorées et `ficheTypes` est
  conservé comme liste de clés de fiches de collecte.
