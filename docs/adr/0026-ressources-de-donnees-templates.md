# 0026. Ressources de données des templates visuels — contrats déclarés et fournisseurs SQL

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0019 (contrat hôte v1), ADR-0020 (capacités du
  cœur), ADR-0023 (variables paramétrables) et ADR-0025 (multitenancy).

## Contexte

Un template visuel sait aujourd'hui afficher des **paramètres scalaires**
(ADR-0023 : `titre_de_livre`, couleur, sélection…) mais **pas des données
structurées variables** : une bibliothèque dont le nombre de livres, les titres,
les pages, les images changent selon l'organisation et le lien.

Cas fondateur : le template `immersive` affiche un livre. Demain il doit pouvoir
afficher **une bibliothèque de N livres**, chaque livre ayant des **pages**
(texte + image), sans que le cœur apprenne ce qu'est un livre, une page ou une
bibliothèque.

Le besoin réel est un **contrat de données** entre le template et la plateforme :

1. le template **déclare** les ressources dont il a besoin et leur **forme**
   (schéma, types, bornes) ;
2. l'exploitant **lie** chaque ressource à une **source** (aujourd'hui une requête
   SQL sur le cœur : médias, connaissances, prospects, conversations…) ;
3. au moment voulu, le template **demande** la ressource au SDK ;
4. le cœur **exécute** la source dans un bac à sable, **valide** la sortie contre
   le contrat déclaré, **met en cache** et **sert** les données.

### Ce qui existe et ne suffit pas

- `manifest.params` (ADR-0023) : scalaires uniquement, résolus une fois, gelés.
- `capabilities` (ADR-0019/0020) : `messages`, `media`, `theme`, `userState`,
  `knowledge` — aucune capacité de **données arbitraires**.
- `TemplateContextPayload.resources` : `media` et `modelForm`, figés côté cœur.
- Isolation tenant **applicative** (`tenant-transaction.ts` :
  `set_config('app.organization_id', …, true)`), **sans RLS** aujourd'hui.
- Aucun rôle PostgreSQL lecture seule, aucune vue org-scopée dédiée.

### Invariant d'architecture (non négociable)

> **Le cœur ne connaît aucun nom métier de template.** Il manipule des schémas,
> un vocabulaire de types fermé, des requêtes et des résultats. `library`,
> `book`, `page` n'apparaissent jamais dans `src/` : ils vivent dans le manifeste
> du template et dans la configuration de l'exploitant.

Corollaires :

- le template ne voit **jamais** SQL, base, ni credentials ;
- le template ne peut **jamais** écrire de données ;
- le visiteur ne fournit **jamais** de paramètre de requête ;
- une ressource non liée est une **erreur typée**, jamais une requête implicite.

## Décision

### 1. Vocabulaire

| Terme | Sens |
|---|---|
| **Contrat** (`data.contracts[]`) | Schéma d'une ressource déclaré par le template (clé, version, schéma, entrées, chargement). |
| **Binding** | Liaison « contrat ↔ source » configurée par l'organisation (requête SQL, enfants, chemin racine, TTL). |
| **Fournisseur** (`provider`) | Implémentation d'exécution (`sql` en v1 ; API/import plus tard). |
| **Instantané** (`snapshot`) | Résultat validé + normalisé, mis en cache et servi au template. |
| **Entrée** (`inputs`) | Valeur scalaire déclarée par le contrat, fournie par le template au `load()` (ex. `book_id`). |

### 2. Contrats déclarés dans le manifeste

Nouvelle capacité **`data`**, opt-in : un template sans `data` est inchangé.

```json
"capabilities": ["messages", "theme", "data"],
"data": {
  "contracts": [
    {
      "key": "library",
      "label": "Bibliothèque",
      "description": "Livres et pages affichés par le template",
      "version": 1,
      "loading": "lazy",
      "inputs": [{ "key": "book_id", "type": "string", "required": false }],
      "schema": {
        "type": "object",
        "required": ["books"],
        "properties": {
          "books": {
            "type": "array",
            "maxItems": 50,
            "items": {
              "type": "object",
              "required": ["id", "title", "pages"],
              "properties": {
                "id": { "type": "string", "maxLength": 64 },
                "title": { "type": "string", "maxLength": 120 },
                "image": { "type": "string", "format": "uri" },
                "pages": {
                  "type": "array",
                  "maxItems": 40,
                  "items": {
                    "type": "object",
                    "required": ["index", "text"],
                    "properties": {
                      "index": { "type": "integer", "minimum": 0 },
                      "text": { "type": "string", "maxLength": 2000 },
                      "image": { "type": "string", "format": "uri" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

**Format de schéma** : sous-ensemble **strict de JSON Schema (Draft 2020-12)**.

- Mots-clés autorisés : `type`, `properties`, `required`, `items`, `enum`,
  `const`, `format` (`uri`, `date`, `date-time`, `email`), `maxLength`,
  `minLength`, `minimum`, `maximum`, `minItems`, `maxItems`, `additionalProperties`.
- **Interdits** : `$ref` (même local), `$dynamicRef`, `patternProperties`,
  `oneOf`, `anyOf`, `not`, `if/then/else`, `pattern` — surface et coût de
  validation maîtrisés.
- `additionalProperties: false` par défaut sur les objets (sauf mention
  explicite) : le contrat est un **contrat fermé**, pas un sac.
- Évolution **additive uniquement** : nouveau champ optionnel = version +1 ;
  renommage/suppression = nouvelle clé de contrat.
- Validation : **stricte à l'import** (auteur), **stricte à l'exécution** (une
  sortie non conforme est une erreur, pas une réparation silencieuse).

**Chargement** : `"lazy"` (défaut) ou `"eager"`.

- `lazy` : rien n'est calculé tant que le template n'appelle pas `load()`.
- `eager` : snapshot inclus dans `ctx.resources.data[key]` à l'ouverture du lien
  (petits volumes uniquement : plafond 64 Ko par contrat eager).

### 3. Liaison : défaut par version, surcharge par lien

- **Binding par défaut** : `(organization_id, template_version_id, contract_key)`
  → une configuration réutilisée par tous les liens de l'organisation.
- **Surcharge par lien** : un lien peut désigner **un autre binding** de la même
  version et de la même organisation (pas de SQL ad hoc dans le lien).
- Cohérence de la surcharge contrôlée **applicativement** (même organisation,
  même `template_version_id`) et par un **trigger** de vérification en base.
- **Précédence** : lien > version. Contrat requis sans binding → `DATA_UNBOUND`.
- Les bindings sont **mutables** (contrairement aux versions de template
  immuables) : chaque modification incrémente `revision`, purge le cache et est
  auditée.

### 4. Fournisseur SQL : vues org-scopées, rôle lecture seule

**Périmètre autorisé : uniquement un schéma de vues dédié `template_read`.**

- Une vue par domaine exposable (`v_medias`, `v_connaissances`, `v_prospects`,
  `v_conversations`…), filtrée par
  `organization_id = current_setting('app.organization_id')::uuid`.
- Vues créées `WITH (security_barrier = true)` ; aucune colonne sensible
  (tokens, hash, secrets, emails d'administration).
- Filtre écrit `organization_id = current_setting('app.organization_id', true)::uuid` :
  si le réglage est absent (connexion hors transaction tenant), la vue ne renvoie
  **aucune ligne** (fail-closed).
- Rôle PostgreSQL **`template_reader`** : `NOLOGIN`, `USAGE` sur le schéma
  `template_read` et `SELECT` sur ses vues uniquement, aucun accès aux tables et
  schémas internes.
- Exécution par une **connexion dédiée** (`TEMPLATE_DATABASE_URL`, pool séparé)
  avec ce rôle ; à défaut de configuration, le fournisseur refuse de démarrer
  (fail-closed).
- Le filtrage tenant **ne repose pas** sur la requête écrite par l'exploitant :
  il est porté par la vue et par `app.organization_id` posé côté serveur.

**Garde-fous d'exécution** (tous obligatoires) :

| Garde-fou | Valeur |
|---|---|
| Transaction | `BEGIN … READ ONLY` |
| Instruction | une seule, `SELECT` / `WITH` uniquement (protocole étendu paramétré) |
| `statement_timeout` | 2 000 ms |
| `idle_in_transaction_session_timeout` | 2 000 ms |
| `search_path` | `template_read, pg_catalog` |
| Lignes | `max_rows` (défaut 200, plafond 1 000) ; `LIMIT max_rows + 1` pour détecter la troncature |
| Volume | 1 Mo par contrat (2 Mo dur) |
| Concurrence | 10 chargements simultanés par instance (4 requêtes SQL actives par lien), file d'attente bornée |

**Contrôles à l'enregistrement du binding** (en plus du `GRANT`) :

1. requête non vide, ≤ 8 Ko, un seul `SELECT`/`WITH` (analyse + essai en
   transaction lecture seule) ;
2. `EXPLAIN (FORMAT JSON)` exécutable sous le rôle lecture seule ;
3. placeholders `$1..$n` strictement égaux aux entrées déclarées dans
   `query_inputs` ;
4. relations référencées présentes dans `template_read` ;
5. aperçu exécuté et **validé contre le contrat** avant activation.

Sources autorisées pour `query_inputs[].from` :

- `input:<key>` : valeur fournie par le template, **déclarée** dans les `inputs`
  du contrat ;
- `link:<param>` : paramètre du lien (ADR-0023) ;
- `system:locale`.

L'organisation n'est **jamais** un paramètre de requête : elle est portée par
`app.organization_id`, donc par les vues. Les requêtes enfants reçoivent
toujours le tableau des identifiants racine en `$1` ; `query_inputs` ne concerne
que la requête racine.

RLS (ADR-0025) est un **renfort ultérieur**, pas le mécanisme principal : les
vues restent la frontière de sécurité et de stabilité.

### 5. Assemblage : lignes + mapping déclaratif

Une requête ne renvoie pas un document imbriqué : elle renvoie des **lignes**,
et le binding déclare comment les assembler.

```json
"root_path": "books",
"root_key": "id",
"children": [
  {
    "path": "pages",
    "query_text": "SELECT book_id, page_index, texte, image_url FROM template_read.v_pages WHERE book_id = ANY($1) ORDER BY page_index",
    "foreign_key": "book_id"
  }
]
```

- La racine est la requête du binding (`query_text`) ; ses lignes sont placées
  dans `root_path` (propriété tableau déclarée par le contrat, ex. `books`).
- Jusqu'à **3 enfants**, chacun avec sa propre `query_text` et un `path`
  **relatif** à chaque élément racine (ex. `pages`).
- Les enfants sont chargés **en batch** : le tableau des identifiants racine est
  toujours passé en `$1` (`WHERE foreign_key = ANY($1)`) → **2 requêtes au
  total** pour un enfant, aucun N+1.
- Un parent sans enfant reçoit `[]` ; un enfant orphelin est ignoré et compté
  dans les métriques.
- Cette forme garde le SQL relationnel (indexable, paginable), évite de coupler
  la requête au contrat, et permet la validation sur données normalisées.
- Échappatoire assumée plus tard (hors v1) : fournisseur `json` pour les cas où
  l'assemblage SQL est réellement préférable.

### 6. Protocole runtime (additif au contrat hôte v1)

- **Capacité** : `data`, déclarée dans `capabilities`.
- **Contexte** : `resources.data` ne contient que les contrats `eager`
  (`{ [contractKey]: snapshot }`) ; absent si aucun contrat eager.
- **Injection** : l'hôte ajoute `data.load()` à côté de `actions` (même
  mécanisme, `ctx.data` n'est pas dans le payload sérialisé).
- **Chargement paresseux** : `ctx.data.load(key, { inputs })` → `Promise`.
  - `web-component` : fonction injectée par l'hôte (pas de postMessage).
  - `iframe` : requête `{ action: "loadData", payload: { requestId, contract, inputs } }`
    et réponse `{ action: "dataResult", payload: { requestId, status, data, meta } }`.
- **Contrat eager non lié** : clé absente du contexte + avertissement côté
  panneau ; la page publique n'échoue jamais (même tolérance qu'ADR-0023).
- **Réponse** :

```ts
type DataResult =
  | { status: "ok"; data: unknown; meta: { cached: boolean; generatedAt: string;
      revision: number; truncated: boolean } }
  | { status: "error"; code: DataErrorCode; message: string;
      fieldErrors?: { path: string; message: string }[] };
```

- **Codes** : `DATA_UNBOUND`, `DATA_DISABLED`, `DATA_INPUT_INVALID`,
  `DATA_TIMEOUT`, `DATA_LIMIT`, `DATA_PROVIDER_ERROR`, `DATA_CONTRACT_INVALID`,
  `DATA_UNAUTHORIZED`.
- **Timeout côté template** : 8 s ; annulation de la requête serveur à
  l'expiration.
- **Rétrocompatibilité** : `host.protocol` reste `onirtech.template-host.v1` ;
  ajout purement additif, templates existants inchangés.

### 7. Résolution, validation, erreurs

1. **Import** : contrats validés (clés uniques, ≤ 20 contrats, ≤ 64 Ko de bloc,
   schéma subset, entrées ≤ 10) ; manifeste refusé sinon.
2. **Binding** : contrôles §4 ; aperçu obligatoire avant activation.
3. **Exécution** : entrées validées par type (refus si inconnues/non déclarées) →
   requête → normalisation (lignes → `root_path` + enfants, **sans coercition de
   valeur**) → validation du snapshot → cache → réponse.
   Au-delà de `max_rows`, la réponse est tronquée à la limite et
   `meta.truncated = true`.
4. **Échec de validation runtime** : `DATA_CONTRACT_INVALID`, journalisé avec le
   chemin fautif ; **aucune donnée partielle** n'est servie.
5. Les erreurs ne contiennent **jamais** de SQL, de nom de table ou de détail
   interne côté visiteur.

### 8. Cache et performance

- **Deux niveaux** : mémo par instance de template (clé contrat + entrées) et
  cache serveur partagé par `(organization_id, binding_id, revision, inputs)`.
- **TTL** : 300 s par défaut, réglable 0–3 600 s par binding.
- **Stale-while-revalidate** : 60 s (sert l'ancien snapshot, rafraîchit en tâche
  de fond).
- **Invalidation** : incrément de `revision` à chaque sauvegarde de binding ;
  `purge` manuel ; en phase 2, compteur de domaine (`invalidate_on:
  "medias" | "connaissances" | "prospects" | "none"`) incrémenté par les
  use-cases d'écriture.
- **ETag** faible `W/"<binding_revision>-<hash(inputs)>"` + `If-None-Match` :
  réouverture instantanée d'un livre inchangé.
- **Métriques par binding** : durée, lignes, octets, taux de cache, erreurs,
  troncatures.

### 9. Sécurité

- Le SQL est écrit par un **administrateur d'organisation** (bindings de son
  organisation) ou un **super administrateur** (modèles globaux) — jamais par un
  visiteur.
- Paramètres : uniquement `inputs` déclarés, `organization_id` et `locale` issus
  du serveur ; **aucun** paramètre de requête venant du client.
- Rôle lecture seule + `READ ONLY` + `GRANT` sur vues : DDL/DML impossibles,
  même en cas d'erreur d'écriture du binding.
- `search_path` figé : pas de détournement de fonction ou de table.
- Audit `template_data_audit` : organisation, lien, binding, contrat, durée,
  lignes, octets, cache, code d'erreur — **jamais** le contenu des données ;
  rétention 30 jours.
- Limitation de débit : 60 chargements/min par lien, 10 en parallèle par instance.
- Champs `format: "uri"` : **https uniquement**, hôtes autorisés, `data:` interdit
  (pas d'exfiltration ni de contenu arbitraire dans les images).
- Journaux applicatifs : ni SQL complet, ni valeurs d'entrées.

### 10. Modèle de données

```sql
-- Bindings par version de template (par organisation)
CREATE TABLE template_data_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_version_id uuid NOT NULL REFERENCES visual_template_versions(id) ON DELETE CASCADE,
  contract_key text NOT NULL,
  provider text NOT NULL DEFAULT 'sql' CHECK (provider IN ('sql')),
  query_text text NOT NULL,
  root_path text NOT NULL,
  root_key text NOT NULL DEFAULT 'id',
  children jsonb NOT NULL DEFAULT '[]',       -- [{ path, query_text, foreign_key }]
  query_inputs jsonb NOT NULL DEFAULT '[]',   -- [{ "index": 1, "from": "input:book_id" }]
  invalidate_on text NOT NULL DEFAULT 'none'
    CHECK (invalidate_on IN ('none','medias','connaissances','prospects')),
  cache_ttl_seconds integer NOT NULL DEFAULT 300 CHECK (cache_ttl_seconds BETWEEN 0 AND 3600),
  max_rows integer NOT NULL DEFAULT 200 CHECK (max_rows BETWEEN 1 AND 1000),
  enabled boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, template_version_id, contract_key)
);

-- Surcharge par lien (pointe un binding de la même organisation/version)
CREATE TABLE chat_link_data_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_link_id uuid NOT NULL REFERENCES chat_links(id) ON DELETE CASCADE,
  contract_key text NOT NULL,
  binding_id uuid NOT NULL REFERENCES template_data_bindings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_link_id, contract_key)
);

-- Audit (aucune donnée métier)
CREATE TABLE template_data_audit (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL,
  chat_link_id uuid,
  template_version_id uuid,
  contract_key text NOT NULL,
  binding_id uuid,
  cache_hit boolean NOT NULL DEFAULT false,
  duration_ms integer NOT NULL,
  row_count integer,
  byte_count integer,
  outcome text NOT NULL CHECK (outcome IN ('ok','error','timeout','invalid')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX template_data_audit_org_created_idx
  ON template_data_audit (organization_id, created_at DESC);
```

Le schéma des contrats n'est **pas** stocké : il vit dans la version immuable du
template (manifeste), comme `params` (ADR-0023).

### 11. Interface d'exploitation

- **Panneau template** (super admin) : liste des contrats par version, état de
  liaison, métriques agrégées.
- **Panneau organisation** (admin d'organisation) : éditeur de binding par
  contrat — SQL, `root_path`, enfants, entrées, `max_rows`, TTL, invalidation — avec
  **aperçu**, validation du schéma et `EXPLAIN`, bouton activer/désactiver et
  purger le cache.
- **Formulaire de lien** : pour chaque contrat, choix du binding (défaut =
  binding de la version) et « Aperçu avec ces valeurs » ; aucun SQL éditable ici.
- Les valeurs d'`inputs` ne sont **jamais** saisies par le visiteur : elles
  proviennent du lien (paramètres ADR-0023) ou du serveur.

### 12. SDK, kit et harness

- `packages/template-sdk` : `defineDataContracts()` dans le manifeste,
  génération de **types TypeScript** depuis le JSON Schema, `ctx.data.load()`
  typé, classes d'erreur, `MockDataProvider` pour les tests.
- `template-kit` : validation des contrats dans `validate`/`pack`, harness avec
  fournisseur mocké et **fixtures** (aucune base requise pour développer un
  template), documentation `docs/templates-visuels/norme-v1.md`.
- Exemple de référence : contrat `library` du template `immersive` (livres +
  pages), branché sur un binding de démonstration dans le harness.

### 13. Limites et quotas

| Objet | Limite |
|---|---|
| Contrats par template | 20 |
| Bloc `data` du manifeste | 64 Ko |
| Entrées par contrat | 10 |
| Enfants par contrat | 3 |
| Requête | 8 Ko, une instruction |
| Résultat | 1 Mo (2 Mo dur) |
| TTL | 0–3 600 s |
| `max_rows` | 1–1 000 |
| Chargements | 60/min/lien, 10 parallèles/instance |
| Timeout SQL / chargement | 2 s / 8 s |

### 14. Hors périmètre v1

- Fournisseurs autres que SQL (HTTP, import de fichier, agrégats IA).
- Requêtes d'écriture, fonctions à effet de bord, procédures stockées.
- Paramètres de requête fournis par le visiteur.
- `json_agg`/documents libres non validés par un contrat.
- Streaming, pagination par curseur, temps réel (notifications de mise à jour).
- Exécution de SQL depuis le navigateur (jamais).

### Amendement de mise en œuvre (2026-10-20)

- **Plusieurs bindings par contrat** : la contrainte d'unicité
  `(organization_id, template_version_id, contract_key)` est remplacée par un
  index partiel sur `is_default` (migration `0030`). Un seul binding est le
  **défaut** ; les autres sont des **variantes** référençables par
  `chat_link_data_bindings` (surcharge de lien). Sans cela, une surcharge de lien
  ne pouvait viser un autre binding.
- **Capacité `data` limitée au mode `web-component`** : l'injection de
  `ctx.data.load` passe par le Custom Element (les iframes sandboxées n'ont pas
  d'appel hôte asynchrone dédié en v1).
- **Variantes nommées + choix par lien** : `name` et `is_default` sur les
  bindings ; chaque lien choisit, contrat par contrat, le défaut ou une variante
  (`chat_link_data_bindings`). Une variante est réutilisable par plusieurs liens,
  à version/contrat identiques. UI dans l'éditeur de sources et le formulaire de
  lien.
- **Cache v1** : mémoire par processus, clé `(organisation, binding, revision,
  contrat, inputs)`, TTL par binding ; `invalidate_on` reste préparé pour une
  purge ciblée ultérieure.
- **Rôle** : `template_reader` est créé `NOLOGIN` par la migration ; le rôle de
  connexion `template_reader_login` (membre) est provisionné par
  `scripts/provision-template-reader.sql` **ou, par défaut, depuis le panneau
  super-admin** (**Configuration → Base de données**, `template_reader_credentials`,
  mot de passe chiffré AES-256-GCM, rotation immédiate sans redémarrage). `TEMPLATE_DATABASE_URL` devient une
  surcharge optionnelle prioritaire.

## Conséquences

### Positives

- **Découplage total** : le cœur ignore les concepts métier des templates ; un
  nouveau template peut exposer une bibliothèque, une galerie, un plan… sans
  ligne de code dans `src/`.
- **Réutilisation** : les mêmes vues org-scopées alimentent plusieurs templates
  et plusieurs liens ; un binding sert N liens.
- **Sécurité par construction** : rôle lecture seule, vues filtrées, paramètres
  serveur, audit, quotas — une requête mal écrite ne peut ni écrire ni franchir
  l'organisation.
- **Performance maîtrisée** : chargement paresseux, cache partagé, 1 requête
  racine + 1 par enfant (≤ 4), plafonds et timeouts.
- **DX** : schéma standard, types générés, harness hors-ligne, aperçu et
  validation avant activation.

### Négatives / Risques

- **Surface puissante** : le SQL reste écrit par un humain privilégié ; la
  sécurité repose sur le rôle, les vues et la revue (pas sur la requête).
- **Vues à maintenir** : chaque nouveau domaine exposable demande une vue, ses
  index et une revue de colonnes sensibles.
- **Sous-ensemble JSON Schema** : maintenance d'un validateur restreint et
  discipline d'évolution des contrats.
- **Fraîcheur** : un TTL de 300 s peut servir une donnée périmée ; l'invalidation
  par domaine arrive en phase 2.
- **Exploitation** : création du rôle `template_reader`, des vues et de
  `TEMPLATE_DATABASE_URL` (prérequis de déploiement, fail-closed si absent).
- **Coût de requête** non plafonné en v1 au-delà du timeout : une requête
  coûteuse mais rapide reste possible (surveillance via l'audit).

## Alternatives écartées

| Alternative | Pourquoi écartée |
|---|---|
| **Tout en snapshot (push) dans le contexte** | Contexte lourd même si la ressource n'est pas utilisée ; rechargement complet à chaque changement ; pas de cache partagé. |
| **JSON libre sans contrat** | Validation tardive, erreurs côté visiteur, pas de types générés, pas de garantie d'évolution. |
| **Accès direct aux tables avec filtre org écrit par l'exploitant** | Une requête oubliée = fuite inter-organisations ; couplage au schéma interne ; colonnes sensibles exposées. |
| **RLS seule** | Aucune politique aujourd'hui ; couvre l'isolation mais pas le moindre privilège (DDL/DML) ni la stabilité du schéma. |
| **DSL de schéma maison** | Réinvente l'outillage (types, validation, éditeurs) sans bénéfice. |
| **Bindings uniquement par lien** | Duplication de SQL, dérive entre liens, maintenance ingérable. |
| **SQL assemblé en `json_agg` imposé** | Couple la requête au contrat, complique pagination et réutilisation. |

## Plan de mise en œuvre (phases)

1. **Contrats (sans runtime)** : entité/validateur (domaine), extension du
   manifeste + capacité `data` (`TEMPLATE_CAPABILITIES`), `validate`/`pack`,
   types SDK, tests de schéma.
2. **Fournisseur SQL** : migration (tables + audit), rôle et vues `template_read`,
   exécuteur (READ ONLY, timeouts, plafonds), tests de sécurité et d'isolation.
3. **Runtime** : capacité `data`, `ctx.data.load`, eager/lazy, cache + ETag,
   erreurs typées, harness mocké.
4. **Exploitation** : panneau bindings (aperçu, EXPLAIN, activation, purge),
   surcharge par lien, audit et métriques.
5. **Référence** : contrat `library` du template `immersive`, fixtures, docs,
   e2e de bout en bout, budgets de performance.

## Liens

- [ADR-0019](./0019-templates-visuels-package-ui.md) — contrat hôte v1.
- [ADR-0020](./0020-capacites-coeur-etat-visiteur-connaissances.md) — capacités du cœur.
- [ADR-0023](./0023-variables-parametrables-templates.md) — paramètres scalaires.
- [ADR-0024](./0024-sdk-javascript-templates.md) — SDK des templates.
- [ADR-0025](./0025-multitenancy-organisations.md) — organisation et isolation.
- `docs/templates-visuels/norme-v1.md` — norme du manifeste.
