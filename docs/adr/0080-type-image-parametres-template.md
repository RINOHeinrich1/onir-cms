# 0080. Type image générique pour les paramètres de template

- **Statut** : Proposé
- **Date** : 2026-11-09
- **Décideurs** : équipe projet
- **Référence** : ADR-0019, ADR-0023, ADR-0024.
- **Complète** : ADR-0023.
- **Remplace** : aucune.

## Contexte

Le Starter utilise actuellement un petit `IA` dans les avatars de l’assistant
et de la bulle de saisie.

Le contrat de template expose déjà :

```ts
brand: { name: string; logoUrl: string | null }
```

mais ce champ est toujours `null` dans `link-template.ts` et n’est pas
paramétrable par chatbot. Le moteur de paramètres de template ne connaît pas
non plus le type `image` :

```text
string, text, number, boolean, color, url, select
```

Le besoin est :

- un logo **propre à chaque chatbot/lien** ;
- importé depuis un fichier, pas saisi comme URL ;
- utilisable par le Starter pour remplacer `IA` ;
- sans coupler le cœur au mot « logo » ni au Starter.

## Décision

### 1. Ajouter un type générique `image`

`TEMPLATE_PARAM_TYPES` reçoit `image`.

La valeur reste scalaire :

```ts
type TemplateParamValue = string | number | boolean;
```

Une image est représentée par une **URL d’asset stable**, ou une chaîne vide
si aucune image n’est fournie.

Le contrat générique ne connaît pas la notion de logo : il ne connaît que des
paramètres de type `image`.

### 2. Stockage séparé des assets

Le binaire n’est jamais stocké dans :

- le manifeste ;
- `visualTemplateParams` ;
- la base JSON.

Il est stocké dans SeaweedFS/S3 via `MediaStorage`.

Une table dédiée est ajoutée :

```text
template_param_assets
  id uuid
  organization_id uuid
  chat_link_id uuid null
  param_key text
  storage_key text
  mime text
  size_bytes integer
  created_by uuid null
  created_at timestamptz
```

Le paramètre du lien contient une URL stable :

```text
/api/template-param-assets/{assetId}
```

### 3. Upload

Une route d’upload authentifiée est ajoutée :

```text
POST /api/template-param-assets
```

Contrôles :

- authentification et permission d’édition des liens ;
- organisation de l’acteur ;
- type de paramètre `image` vérifié côté template ;
- taille maximale ;
- MIME réel par magic bytes ;
- formats autorisés : PNG, JPEG, WebP ;
- SVG refusé tant qu’il n’existe pas de sanitisation dédiée ;
- stockage S3/SeaweedFS ;
- insertion de l’asset ;
- retour d’une URL stable.

Une route publique non devinable sert l’asset :

```text
GET /api/template-param-assets/{assetId}
```

### 4. UI générique

`TemplateParamsFields` reçoit un contrôle `image` :

- bouton de sélection de fichier ;
- aperçu ;
- remplacement ;
- suppression ;
- état d’upload ;
- gestion d’erreur ;
- fallback si la valeur est vide.

Aucun libellé « logo » n’est codé dans le moteur.

### 5. Starter

Le manifeste Starter déclare :

```json
{
  "key": "assistant_logo",
  "label": "Logo de l’assistant",
  "description": "Logo affiché dans les avatars de l’assistant.",
  "type": "image",
  "default": ""
}
```

Le Starter utilise ce paramètre :

- avatar des messages assistant ;
- avatar de la bulle « en train d’écrire ».

Ordre de fallback :

```text
assistant_logo
  → brand.logoUrl
  → « IA »
```

CSS :

- `object-fit: contain` ;
- fond adapté aux logos transparents ;
- taille cohérente avec l’avatar ;
- fallback si l’image casse.

### 6. Versionnement

Le Starter passe de `1.5.6` à **`1.6.0`** :

- nouveau manifeste ;
- nouvelle intégrité ;
- import de la nouvelle version ;
- les liens existants restent sur 1.5.6 ;
- une action explicite ou une migration devra permettre de passer les liens
  existants en 1.6.0.

### 7. Cache

- l’URL de l’asset est immuable ;
- un remplacement crée une nouvelle URL ;
- le cache du template/lien est invalidé après modification ;
- aucun binaire n’est stocké dans Valkey.

## Conséquences

### Positives

- type image générique et réutilisable ;
- aucun couplage au Starter ni au mot « logo » ;
- logo importé depuis un fichier ;
- valeur propre à chaque chatbot ;
- assets séparés de la base ;
- fallback propre vers `IA`.

### Négatives

- nouveau type de contrat ;
- upload et stockage à maintenir ;
- gestion des assets orphelins ;
- nouvelle version du Starter ;
- migration des liens existants à prévoir ;
- validation MIME et taille à maintenir.

## Alternatives écartées

- `brand.logoUrl` seul : non paramétrable par chatbot.
- Saisie d’URL libre : moins fiable et moins contrôlable.
- Stockage du binaire dans les paramètres JSON : taille et sécurité.
- Type spécifique `logo` dans le moteur : couplage.
- SVG non sanitisé : risque XSS.

## Critères d’acceptation

- `image` est un type de paramètre valide ;
- une image vide est acceptée ;
- une URL invalide est refusée ;
- un fichier est uploadé et servi via une URL stable ;
- l’upload est isolé par organisation ;
- un fichier trop gros ou de mauvais type est refusé ;
- le Starter 1.6.0 affiche le logo dans les avatars assistant ;
- sans logo, le fallback `IA` reste affiché ;
- les liens 1.5.6 restent inchangés ;
- aucun binaire dans PostgreSQL ou Valkey.
