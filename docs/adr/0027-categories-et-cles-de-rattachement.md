# 0027. Catégories partagées et clés de rattachement scalaires

- **Statut** : Accepté
- **Date** : 2026-10-21
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0025 (multitenancy) et ADR-0026 (ressources de
  données des templates).

## Contexte

Les contenus créés manuellement dans le cœur (médias, connaissances, liens)
doivent pouvoir être **classés par catégories**, et un même contenu peut
appartenir à **plusieurs catégories** (ex. une image dans « Produits » et
« Promotion »).

Les templates consomment ces contenus via des **contrats de données** et des
vues `template_read` (ADR-0026). Une collection liée exige une **clé de
rattachement scalaire** : le chargeur exécute la requête enfant avec les
identifiants parents dans `$1`, puis regroupe les lignes par cette clé.

Deux mauvaises solutions ont été écartées :

1. **Un tableau comme clé de rattachement** (`text[]`, `uuid[]`) : ambigu
   (liste de parents, d'enfants, d'étiquettes ?), incompatible avec
   `fk = ANY($1)` (PostgreSQL refuse `text[] = text/uuid`) et avec le
   regroupement par clé scalaire ; il autorise aussi des doublons silencieux.
2. **Une table polymorphe** `assignments(category_id, content_type, content_id)` :
   aucune clé étrangère possible sur `content_id`, orphelins et incohérences de
   type à la charge de l'application.

La question « `category_id` ou `label` comme clé » est tranchée : la clé est
`category_id` (stable, indexée, sans ambiguïté). Le libellé est une **colonne
d'affichage**, jamais une clé (renommages, doublons, casse, accents,
traductions).

## Décision

### 1. Table `categories` partagée

Une seule taxonomie par organisation :

```sql
categories(
  id uuid PK,
  organization_id uuid NOT NULL,
  label text NOT NULL,
  slug text NOT NULL,
  description text,
  actif boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE (organization_id, slug)
)
```

Le libellé est unique par organisation (insensible à la casse) ; `slug` sert
aux intégrations et aux URLs. Une catégorie inactive reste consultable mais
n'est plus proposée par défaut.

### 2. Une table d'association par type de contenu

```sql
media_categories(media_id, category_id, created_at, PK(media_id, category_id))
connaissance_categories(connaissance_id, category_id, created_at, PK(...))
link_categories(link_id, category_id, created_at, PK(...))
```

Chaque colonne est scalaire et porte une **vraie clé étrangère** avec
`ON DELETE CASCADE`. Un index sur `category_id` est ajouté pour le sens
« contenus d'une catégorie ». Le contenu n'est jamais dupliqué : seules les
lignes d'association le sont.

### 3. Vues d'exposition pour les templates

`template_read` expose :

- `v_categories(id, organization_id, label, slug, description, actif, position, …)`
- `v_media_categories(media_id, category_id, category_label, category_slug, position, category_actif)`
- `v_connaissance_categories(connaissance_id, category_id, category_label, …)`
- `v_link_categories(link_id, category_id, category_label, …)`

Toutes les vues sont org-scopées et `security_barrier`. Les associations ne
sont visibles que si le contenu **et** la catégorie appartiennent à
l'organisation courante.

### 4. Clés scalaires uniquement

- identité : `id` scalaire (`rootKey`) ;
- relation : clé étrangère **scalaire** (`media_id`, `connaissance_id`,
  `link_id`, `category_id`) ;
- libellé : colonne d'affichage (`category_label`) ;
- les tableaux restent des listes/portées (ex. `template_keys`), jamais des
  clés de rattachement.

### 5. Sens de la relation

Une même vue d'association sert les deux sens :

- parent = média → enfant = `v_media_categories`, FK = `media_id` ;
- parent = catégorie → enfant = `v_media_categories`, FK = `category_id`.

Idem pour les connaissances et les liens. Aucun tableau n'est nécessaire.

### 6. Priorité UX des clés de rattachement

Dans le composeur de sources, les colonnes de type clé (`*_id`, et en
particulier `category_id` lorsque la vue d'association est utilisée) sont
proposées **en premier** comme clés de rattachement. Les colonnes tableau sont
signalées et ne peuvent pas être choisies comme clé.

## Conséquences

- Nouvelles tables (une taxonomie + trois associations), nouvelles vues et
  descriptions de schéma.
- Administration des catégories et affectation multi-catégories dans les
  écrans médias, connaissances et liens.
- Les contrats de templates peuvent exposer `categories` comme collection
  liée sans modification du moteur : la clé reste scalaire.
- Suppression d'une catégorie : les associations suivent en cascade ; les
  contenus restent intacts.
- Coût : jointures supplémentaires et une table d'association par type. En
  contrepartie : intégrité référentielle, pas de doublons de contenu, requêtes
  simples et indexables.

## Alternatives rejetées

- **Tableau comme clé de rattachement** : SQL et regroupement incompatibles,
  sémantique ambiguë, pas d'intégrité référentielle.
- **Table polymorphe `content_type/content_id`** : pas de FK, orphelins,
  incohérences de type.
- **Une table de catégories par type** : duplication des libellés, renommages
  incohérents, impossibilité de interroger une taxonomie unifiée.
- **`label` comme clé** : instable (renommage, casse, accents, doublons).
