# Ressources de données des templates — guide v1 (ADR-0026)

Ce document décrit la mise en place côté plateforme et les règles d'écriture des
requêtes. Le contrat côté template est décrit dans
[`norme-v1.md` §13](./norme-v1.md#13-ressources-de-données-adr-0026).

## 1. Chaîne complète

1. Le template **déclare** des contrats (`data.contracts`) dans son manifeste.
2. L'exploitant **crée un binding** : contrat ↔ requête SQL + assemblage + TTL.
3. Le template **demande** la ressource (`ctx.data.load`) au moment voulu.
4. Le cœur **exécute** la requête en lecture seule, **valide** le résultat contre
   le contrat, **met en cache** et le renvoie.

Aucune donnée n'est écrite, aucun SQL ne transite vers le navigateur.

## 2. Ce qui est disponible en v1

| Élément | État |
| --- | --- |
| Contrats (validation, manifeste, types SDK) | livré |
| Tables de bindings, surcharge par lien, audit | livré (migration `0029`) |
| Schéma de lecture `template_read` + vues org-scopées | livré |
| Exécuteur SQL READ ONLY (timeouts, plafonds, rôle dédié) | livré |
| Runtime `ctx.data.load` (web-component) + eager | livré |
| Cache mémoire serveur (TTL + `revision`) | livré |
| API publique `POST /api/chat/data` | livré |
| Panneau de configuration des bindings | livré (`/templates-visuels/[id]/donnees`) |
| Variantes de source + choix par lien | livré |
| Autres sources (HTTP, import) | hors v1 |

## 3. Provisionnement

### 3.0 Compte de lecture (panneau super-admin)

Par défaut, le compte PostgreSQL de lecture se gère **depuis le panneau** :
**Configuration → Base de données** (super-admin) → **Compte de lecture** →
*Générer un mot de passe*. Le serveur crée les rôles, applique le mot de passe, stocke le secret
chiffré (AES-256-GCM) et reconstruit la connexion à la prochaine lecture
(révision). Aucun SSH ni redémarrage. `TEMPLATE_DATABASE_URL` reste une surcharge
optionnelle prioritaire.

Prérequis : le compte applicatif doit avoir `CREATEROLE` (ou être superutilisateur).

### 3.1 Migration

`npm run db:migrate` applique `0029_template_data_bindings.sql` (+ `0030`
bindings par défaut, `0031` compte de lecture) :

- `template_data_bindings`, `chat_link_data_bindings`, `template_data_audit` ;
- schéma `template_read` + vues `v_connaissances`, `v_medias` ;
- rôle `template_reader` **NOLOGIN** (si le rôle de migration en a le droit).

Si la migration ne peut pas créer le rôle (privilèges insuffisants), elle
poursuit avec un `NOTICE` : provisionnez-le explicitement (§3.2).

### 3.2 Rôle de connexion dédié (repli CLI)

Si le panneau ne peut pas créer les rôles, le script `scripts/provision-template-reader.sql`
reste disponible (exécuter `psql` **dans le conteneur** si l'hôte n'en a pas).
L'exécuteur utilise un rôle membre de `template_reader` et pose
`SET LOCAL ROLE template_reader` dans chaque transaction.

### 3.3 Variables d'environnement (surcharge)

```bash
# Optionnel : rôle externe. Prioritaire sur le compte du panneau.
TEMPLATE_DATABASE_URL=postgres://template_reader_login:...@127.0.0.1:5433/onir_cms
```

Sans compte configuré (panneau ou variable), le runtime renvoie
`DATA_PROVIDER_ERROR` et le panneau l'indique.

### 3.4 Vues disponibles

| Vue | Colonnes |
| --- | --- |
| `template_read.v_connaissances` | `id, organization_id, titre, contenu, template_keys, actif, created_at, updated_at` |
| `template_read.v_medias` | `id, organization_id, type, libelle, template_keys, actif, mime, url, created_at, updated_at` |

- Chaque vue est filtrée par
  `organization_id = current_setting('app.organization_id', true)::uuid`.
  Sans organisation posée → **aucune ligne** (fail-closed).
- `security_barrier = true` : pas de contournement par prédicat.
- Aucune colonne sensible (tokens, hash, chemins de stockage, emails).
- Les **photos** ne sont pas exposées : `url` est `NULL` pour une photo, et
  l'accès au fichier reste signé côté application. En v1, exposez des **liens**
  (`type = 'lien'`) ou ajoutez une vue dédiée si nécessaire.
- D'autres vues (prospects, conversations…) s'ajoutent **au cas par cas**, avec
  revue des colonnes et des index. Ne créez pas de vue « SELECT * ».

## 4. Écrire un binding

| Champ | Règle |
| --- | --- |
| `contract_key` | clé du contrat déclaré, `^[a-z][a-z0-9_]{1,40}$` |
| `name` | nom lisible de la source (unique par contrat, 1–60 caractères) |
| `is_default` | un seul binding par défaut par `(organisation, version, contrat)` ; les autres sont des variantes référençables par un lien |
| `provider` | `sql` (seule valeur v1) |
| `query_text` | requête racine : `SELECT`/`WITH`, ≤ 8 Ko, **sans `;`**, sans commentaires (`--`, `/* */`) |
| `root_path` | propriété tableau du contrat qui reçoit les lignes racine (ex. `books`) |
| `root_key` | clé d'identification des lignes racine (défaut `id`) |
| `children` | `[{ path, query_text, foreign_key }]` (≤ 3) — chargés en batch avec `ANY($1)` |
| `query_inputs` | `[{ index, from }]` ; `from` ∈ `input:<clé>` \| `link:<param>` \| `system:locale` |
| `invalidate_on` | `none` (défaut), `medias`, `connaissances`, `prospects` |
| `cache_ttl_seconds` | 0–3 600 (défaut 300) |
| `max_rows` | 1–1 000 (défaut 200) |
| `enabled` | `false` à la création ; activé après aperçu validé |

**Assemblage** : les lignes racine sont placées dans `root_path` ; chaque enfant
est rattaché aux lignes racine par `foreign_key = root_key`. Les requêtes enfants
reçoivent **toujours** le tableau des identifiants racine en `$1`. La colonne
`foreign_key` est retirée avant validation (clé technique d'assemblage).

Plusieurs bindings peuvent viser le même contrat : un seul est `is_default`
(résolution par défaut), les autres servent de **variantes** référencées par
`chat_link_data_bindings` (surcharge de lien). Les variantes sont réutilisables
par plusieurs liens ; le contrat doit être le même (même forme de données).

### Exemple — contrat `library` (template `immersive`)

Le template `immersive` déclare le contrat `library` (livres + pages) : l'album
3D affiche le premier livre renvoyé, avec repli sur la médiathèque si la ressource
n'est pas liée (ou en cas d'erreur). En développement, le harness injecte
`harness-data.json` (`{"library":{"books":[…]}}`).

```sql
-- query_text (racine)
SELECT id, titre AS title
FROM template_read.v_connaissances
WHERE actif
ORDER BY titre
```

```json
"root_path": "books",
"root_key": "id",
"children": [
  {
    "path": "pages",
    "query_text": "SELECT id AS book_id, 0 AS index, contenu AS text FROM template_read.v_connaissances WHERE id = ANY($1)",
    "foreign_key": "book_id"
  }
]
```

## 5. Sécurité

- **Rôle lecture seule** + `BEGIN READ ONLY` + `GRANT` sur les vues : DDL/DML
  impossibles, même en cas d'erreur d'écriture du binding.
- `search_path` figé (`template_read, pg_catalog`) : pas de détournement de
  table/fonction.
- `SET LOCAL ROLE template_reader` : même si le rôle de connexion possède
  d'autres droits, la transaction les perd.
- Paramètres : `inputs` déclarés, paramètres du lien et locale ; **jamais** de
  paramètre fourni par le visiteur.
- `statement_timeout` et `idle_in_transaction_session_timeout` = 2 s par défaut.
- Une seule instruction : point-virgule et commentaires refusés ; le protocole
  étendu interdit nativement les multi-statements.
- Audit `template_data_audit` : organisation, lien, binding, durée, lignes,
  octets, cache, code — **jamais** le SQL ni les données.
- Champs `format: "uri"` : `https` uniquement (contrôle à la validation).

## 6. Limites et erreurs

| Limite | Valeur |
| --- | --- |
| Requête | 8 Ko |
| Résultat | 1 Mo (2 Mo dur) |
| Lignes | 200 par défaut, 1 000 max |
| Timeout SQL | 2 s (max 10 s) |
| Chargement runtime | 8 s |
| Débit | 60 chargements/min/lien, 10 en parallèle/instance |

| Code | Sens |
| --- | --- |
| `DATA_UNBOUND` | aucun binding actif pour ce contrat |
| `DATA_DISABLED` | binding désactivé |
| `DATA_INPUT_INVALID` | entrée inconnue ou invalide |
| `DATA_TIMEOUT` | timeout SQL |
| `DATA_LIMIT` | lignes/volume au-delà des plafonds |
| `DATA_UNAUTHORIZED` | table hors schéma, privilège refusé, écriture |
| `DATA_CONTRACT_INVALID` | sortie non conforme au contrat |
| `DATA_PROVIDER_ERROR` | échec générique (requête invalide, configuration) |

## 7. Runtime

Le template (mode **web-component** uniquement) appelle :

```ts
const res = await ctx.data.load<{ books: Book[] }>("library", {
  inputs: { book_id: selectedId },
});
```

Côté hôte, `TemplateHost` relaie à `POST /api/chat/data` avec le jeton du lien ;
l'API résout le template, le binding effectif et exécute le fournisseur. Aucun
SQL ni paramètre de requête ne vient du visiteur.

- `loading: "eager"` : l'instantané est calculé au chargement et exposé dans
  `ctx.resources.data[contrat]`. Un contrat eager non lié est simplement absent.
- Erreurs renvoyées au template : `DATA_UNBOUND`, `DATA_DISABLED`,
  `DATA_INPUT_INVALID`, `DATA_TIMEOUT`, `DATA_LIMIT`, `DATA_UNAUTHORIZED`,
  `DATA_CONTRACT_INVALID`, `DATA_PROVIDER_ERROR`.
- API : `POST /api/chat/data` `{ token, contract, inputs? }` → `DataResult`.
  Limite : 60 requêtes/min par IP + lien (`TEMPLATE_DATA_LIMIT`).

## 8. Catégories (ADR-0027)

Les catégories sont une taxonomie partagée par organisation. Un contenu peut
appartenir à plusieurs catégories ; le lien est porté par une table
d'association, jamais par un tableau.

Vues exposées :

- `template_read.v_categories` (id, label, slug, description, actif, position) ;
- `template_read.v_media_categories` (media_id, category_id, category_label…) ;
- `template_read.v_connaissance_categories` (connaissance_id, category_id…) ;
- `template_read.v_link_categories` (link_id, category_id…).

Règles :

- la clé de rattachement est **scalaire** : `media_id`, `connaissance_id`,
  `link_id` ou `category_id` selon le sens ;
- `category_id` est la **clé stable** ; `category_label` est une colonne
  d'affichage (jamais une clé) ;
- pour « les catégories d'un média » : parent média, enfant
  `v_media_categories`, FK `media_id` ;
- pour « les médias d'une catégorie » : parent catégorie, enfant
  `v_media_categories`, FK `category_id` ;
- le composeur propose les colonnes `*_id` en priorité et signale les tableaux
  comme non éligibles à une clé de rattachement ;
- chaque collection liée peut définir ses propres **filtres** (ex.
  `media_url IS NOT NULL`), en plus de la condition `$1` sur la clé.

## 9. Interface d'exploitation

- **Panneau** : `/templates-visuels` → cliquer une version (badge) →
  `/templates-visuels/[id]/donnees?version=…`.
- Vue **maître-détail** : liste compacte des contrats (statut *non lié / actif /
  désactivé*, révision) à gauche, éditeur du contrat sélectionné à droite ; le
  contrat courant est mémorisé dans l'URL (`?version=…&contrat=…`). Sur mobile,
  la liste devient un sélecteur.
- Dans un contrat : **liste des sources** d'abord (nom, défaut/variante,
  actif/désactivé, révision) ; un clic ouvre l'éditeur de la source avec un
  bouton **← Retour aux sources**. La source ouverte est mémorisée dans l'URL
  (`?version=…&contrat=…&source=…`).
- Filtre **Tous / Actifs / Inactifs** ; par défaut, **seules les sources actives**
  sont affichées.
- Chaque source peut être **supprimée** (liste ou éditeur). Une source utilisée
  par un lien est protégée ; supprimer le défaut promeut automatiquement une
  autre source s'il en existe une.
- **Dupliquer** une source existante crée une variante préremplie : c'est le
  moyen de réutiliser un modèle de requête (SQL, collections liées, paramètres)
  puis de l'adapter.
- Dans l'éditeur : **Dupliquer**, **Nouvelle variante**, **Définir par défaut**,
  **Supprimer** (refusé pour le défaut ou une variante utilisée par un lien).
- Pour chaque contrat : requête racine, chemin/clé racine, TTL, plafond de
  lignes, activation, **aperçu** et schéma attendu.
- **Paramètres** : les `$1..$n` du SQL sont détectés automatiquement ; chaque
  ligne choisit la source (entrée du template déclarée, paramètre du lien ou
  locale). Plus de JSON à écrire.
- **Collections imbriquées** : le bloc n'apparaît que si le contrat contient un
  tableau imbriqué ; répéteur *tableau / requête enfant (`$1` = ids parents) /
  clé étrangère*, ≤ 3.
- **Invalidation par domaine retirée de l'UI** (non implémentée en v1) : le cache
  est purgé à chaque enregistrement (révision) et par le TTL.
- Workflow recommandé : **Enregistrer** (désactivé) → **Aperçu** (exécute et
  valide contre le contrat) → **Activer**.
- Droits : `visualtemplates:read` pour consulter, `visualtemplates:create` pour
  modifier (admin/marketeur ; super-admin toujours).
- Les bindings sont **par organisation** : chacun configure ses sources.
- **Surcharge par lien** : la table `chat_link_data_bindings` et le trigger de
  cohérence sont en place ; la sélection dans le formulaire de lien reste à
  exposer dans l'UI (les variantes `is_default = false` peuvent être créées en
  SQL et référencées par un lien).

### API

| Méthode | Route | Rôle |
| --- | --- | --- |
| `GET` | `/api/visual-templates/[id]/data-bindings?version=` | contrats + bindings par défaut |
| `PUT` | `/api/visual-templates/[id]/data-bindings` | créer/mettre à jour le binding (révision +1) |
| `POST` | `/api/visual-templates/[id]/data-bindings/preview` | aperçu du binding enregistré (sans cache ni activation) |
| `POST` | `/api/visual-templates/[id]/data-bindings` | créer une variante (vide ou dupliquée) |
| `PUT` | `/api/visual-templates/[id]/data-bindings/[bindingId]` | modifier une source (défaut ou variante) |
| `DELETE` | `/api/visual-templates/[id]/data-bindings/[bindingId]` | supprimer une variante non utilisée |
| `POST` | `/api/visual-templates/[id]/data-bindings/[bindingId]/default` | définir comme défaut |
| `GET` | `/api/links/[id]/data-bindings` | surcharges de sources du lien |
| `POST` | `/api/chat/data` | chargement public (`ctx.data.load`) |

### Choix de la source par lien

Le formulaire de lien (création et édition) expose, pour chaque contrat du
template choisi, une liste **Défaut / variante**. L'API enregistre
`dataBindings: { [contractKey]: bindingId | null }` ; `null` (ou absence)
revient au défaut de la version. La validation vérifie que la source appartient
à la **même organisation et à la même version** (et le trigger PostgreSQL le
garantit). Un changement de template réinitialise les surcharges.

Le runtime résout : **surcharge du lien > défaut**. Deux liens peuvent donc
utiliser deux SQL différents pour le même contrat, sans dupliquer le template.

### Cache

- Cache **mémoire** par `(organisation, binding, revision, contrat, inputs)`,
  TTL par binding (défaut 300 s, 0 = désactivé).
- `revision` incrémentée à chaque sauvegarde → les anciennes entrées ne sont plus
  lues (purge logique).
- `invalidate_on` : prévu pour la purge ciblée par domaine (phase ultérieure) ;
  en v1, la purge est portée par le TTL et la révision.
- Le cache est local au processus (redémarrage = cache vide).

## 10. Vérifications

- Tests unitaires : `npm run test` (garde SQL, contrats).
- Tests d'intégration : `npm run test:integration` (isolation, écriture refusée,
  timeout, troncature, paramètres).
- CI : `validate-core` exécute les deux suites ; le déploiement applique la
  migration.
