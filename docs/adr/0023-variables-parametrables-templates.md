# 0023. Variables paramétrables des templates visuels

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0019 (packages UI-only, contrat hôte v1) et
  ADR-0020 (capacités du cœur). Ajoute un **contrat de données générique** entre
  le template et la plateforme, sans que le cœur connaisse un seul paramètre
  nommé.

## Contexte

Un template visuel est figé par version (ADR-0019) : ses textes et réglages
vivent dans le bundle. Or l'exploitant d'un lien doit pouvoir **personnaliser un
template sans redévelopper ni redéployer**, et sans que le cœur apprenne quoi que
ce soit du template.

Cas fondateur : le template `immersive` affiche un livre. Le développeur veut que
le titre de couverture soit réglable. Aujourd'hui il faudrait modifier le template
puis refaire une release. Demain, le développeur déclare :

```json
{ "key": "titre_de_livre", "label": "Titre du livre",
  "description": "Titre affiché sur la couverture de l'album",
  "type": "string", "default": "album", "maxLength": 60 }
```

et l'exploitant du lien remplace « album » par « Album souvenirs ». Le visiteur
voit le nouveau titre ; **aucune ligne du cœur ne mentionne `titre_de_livre`**.

Le besoin est donc un **mécanisme générique** de variables :

1. le template **déclare** ses variables (clé, libellé, description, type,
   valeur par défaut) dans son manifeste ;
2. l'exploitant les **paramètre par lien** de chat ;
3. le template les **consomme en lecture seule** au chargement.

### Ce qui existe et ne suffit pas

- `chat_links.visual_template_config jsonb` existe déjà mais est **string-only**
  (`parseVisualTemplateConfig` jette nombres et booléens), sans schéma, sans
  défauts, et n'alimente que `ctx.theme` (capacité `theme`). Aucune UI ne le
  renseigne.
- Le contrat `TemplateContextPayload` n'expose ni variables ni paramètres.
- Le manifeste ne possède aucun champ de paramètres.

### Règle d'architecture (non négociable)

> **Le cœur ne connaît aucun paramètre de template.** Les templates consomment
> des données du cœur ; jamais l'inverse.

Conséquences concrètes :

- le cœur manipule un **schéma** (données JSON) et un **vocabulaire de types
  fermé**, jamais une clé métier (`titre_de_livre` n'apparaît pas dans `src/`) ;
- le cœur n'importe aucun code de template ;
- le template reçoit un objet **gelé** et ne peut pas écrire dans les réglages.

## Décision

### 1. Schéma déclaré dans le manifeste — bloc `params`

```json
"params": [
  {
    "key": "titre_de_livre",
    "label": "Titre du livre",
    "description": "Titre affiché sur la couverture de l'album",
    "type": "string",
    "default": "album",
    "maxLength": 60
  }
]
```

Champs d'un paramètre :

| Champ | Règle |
|---|---|
| `key` | obligatoire, unique, `^[a-z][a-z0-9_]{1,40}$` |
| `label` | obligatoire, 1..80 caractères (libellé du champ UI) |
| `description` | 0..200 caractères (aide sous le champ) |
| `type` | `string` \| `text` \| `number` \| `boolean` \| `color` \| `url` \| `select` |
| `default` | **obligatoire** (décision : aucun paramètre sans défaut) |
| `maxLength` | `string`/`text` uniquement, 1..2000 (défaut 200) |
| `min` / `max` | `number` uniquement, finis, `min ≤ max` |
| `options` | `select` uniquement : 1..40 `{ value, label }`, `value` unique, `default` ∈ valeurs |

Bornes globales : **≤ 40 paramètres**, JSON du bloc ≤ 16 Ko.

Règles de défaut par type : `string`/`text` chaîne (vide autorisée) ;
`number` nombre fini ; `boolean` booléen ; `color` `#rrggbb` ; `url` http(s) ;
`select` valeur d'une option.

`params` est **optionnel** : un manifeste sans `params` est valide et reçoit `{}`.

### 2. Stockage — colonne dédiée au lien

```sql
ALTER TABLE chat_links
  ADD COLUMN visual_template_params jsonb NOT NULL DEFAULT '{}';
```

Objet **opaque** pour le cœur (scalaires `string | number | boolean`).
`visual_template_config` est **conservé tel quel** (compatibilité thème) ; il
n'est ni fusionné ni réécrit.

### 3. Résolution — une seule fois, en lecture seule

À l'ouverture de `/l/[token]`, `buildLinkContext` :

1. lit le schéma de la **version épinglée** (déjà chargée par `loadTemplateSpec`,
   donc **zéro requête supplémentaire**) ;
2. fusionne `defaults ← valeurs du lien` ;
3. valide **par type** ; clé inconnue → ignorée ; valeur invalide → **défaut** ;
4. expose `params` **gelé** (`Object.freeze`) dans le contexte.

Deux niveaux volontairement asymétriques :

- **enregistrement du lien** : validation **stricte** → `400` détaillant
  `{ key, message }` (l'exploitant voit son erreur) ;
- **chargement public** : validation **tolérante** → défaut (une page publique ne
  casse jamais).

C'est l'esprit « chargé en constantes » : la résolution est faite une fois côté
serveur, le template lit un objet ordinaire en synchrone, coût nul par message ou
par frame.

### 4. Contrat runtime

`TemplateContextPayload` gagne un champ **optionnel** :

```ts
params: Record<string, string | number | boolean>;
```

Rétrocompatible : `host.protocol` reste `onirtech.template-host.v1` ; un template
sans `params` reçoit `{}`.

### 5. Valeurs « plus utilisées »

Aucune valeur n'est jamais supprimée. Si la version épinglée ne déclare plus une
clé stockée (renommage/retrait), la valeur est **conservée en base**, ignorée au
runtime, et l'UI la présente avec la mention **« n'est plus utilisée par cette
version »** (et un bouton pour la retirer explicitement). Un retour à l'ancienne
version retrouve donc les valeurs.

### 6. Paramétrage par l'exploitant (UI générique)

Dans `LinkForm` (création) et `LinkEditModal` (édition), sous le sélecteur de
template : un composant unique `TemplateParamsFields` rend les champs **depuis le
schéma** de la version choisie :

| Type | Contrôle |
|---|---|
| `string` / `url` | `input` texte (validation au blur) |
| `text` | `textarea` |
| `number` | `input` numérique borné |
| `boolean` | interrupteur |
| `color` | sélecteur de couleur |
| `select` | liste déroulante |

- valeur initiale = valeur du lien, sinon **défaut affiché** ;
- « Réinitialiser » par champ ;
- changement de template → avertissement « les valeurs seront réinitialisées aux
  défauts » ;
- le schéma des versions est ajouté au DTO déjà chargé par `/liens` (pas de
  nouvel endpoint).

### 7. Aperçu avec valeurs non enregistrées

Le modal d'édition propose **« Aperçu avec ces valeurs »** : ouverture de
`/liens/[id]/apercu?params=<base64url(JSON)>`. La page d'aperçu décode, valide en
mode tolérant contre le schéma épinglé, et n'écrit **rien** en base. C'est un
aperçu de travail, pas une sauvegarde.

### 8. Validation au build du package

`onirtech-template validate/pack` contrôle le bloc `params` (clés, types,
défauts, options, bornes) — le développeur est arrêté avant publication.
La documentation `docs/templates-visuels/norme-v1.md` décrit le contrat.

### 9. Sécurité

- Les valeurs sont **publiques** (servies au visiteur) : aucun secret, aucun
  jeton, aucun identifiant interne. Mention explicite dans le manifeste et l'UI.
- Ce sont des **données**, jamais du HTML : les templates les insèrent en texte
  (les textes du livre sont rendus via canvas). Aucune interpolation HTML.
- Bornes de taille (16 Ko, 40 clés, 2000 car.) contre l'abus de stockage.

## Conséquences

### Positives

- Le template devient **personnalisable sans release** ; le cœur reste
  totalement **agnostique** (aucune clé métier, aucun import de template).
- Une seule résolution serveur : **aucune requête supplémentaire** à l'ouverture.
- Contrat additif et rétrocompatible : les templates existants reçoivent `{}`.
- Versionnement naturel : le schéma vit dans la version immuable déjà stockée.
- Traçable : schéma dans le manifeste, valeurs sur le lien, aucune destruction.

### Négatives / Risques

- Le couple cœur↔template s'appuie sur un **vocabulaire de types** qu'il faudra
  faire évoluer avec parcimonie (tout ajout est une décision de contrat).
- La validation tolérante au runtime peut **masquer** une valeur devenue
  invalide : elle est visible dans l'UI d'édition (marquée) mais pas côté visiteur.
- Un changement de version peut **ignorer** des valeurs (conservées, non
  utilisées) : comportement assumé et affiché.
- `visual_template_config` (thème historique) reste en place : deux mécanismes
  coexistent jusqu'à une éventuelle reprise du thème en `params`.
