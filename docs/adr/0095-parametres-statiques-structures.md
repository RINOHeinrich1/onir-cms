# 0095. Paramètres statiques structurés des templates — objets et tableaux

- **Statut** : Accepté
- **Date** : 2026-11-17
- **Décideurs** : équipe projet
- **Référence** : ADR-0019, ADR-0023, ADR-0026, ADR-0080, ADR-0081.
- **Complète** : ADR-0023.
- **Remplace** : aucune.

## Contexte

ADR-0023 limite les paramètres statiques des templates à des scalaires :

```text
string, text, number, boolean, color, url, image, select
```

Certains templates ont besoin de configuration structurée :

- une liste de cartes `{ titre, texte, couleur, icône }` ;
- une liste d'axes ou d'étapes `{ label, valeur, description }` ;
- un objet de réglages `{ entete: {...}, pied: {...} }`.

Les contrats de données (ADR-0026) savent déjà décrire objets et tableaux,
mais ils servent aux **données runtime**. Les paramètres statiques restent de la
**configuration/design**, éditée par l'administrateur du lien, stockée dans
`chat_links.visual_template_params` et injectée dans `ctx.params`.

Il faut donc étendre les paramètres statiques sans :

- autoriser du JSON arbitraire sans schéma ;
- confondre paramètres statiques et contrats de données ;
- casser les paramètres scalaires existants ;
- exposer le runtime à des structures non bornées.

## Décision

### 1. Schéma récursif typé

`TemplateParamType` ajoute `object` et `array`.

```ts
type TemplateParamScalar = string | number | boolean;
type TemplateParamValue =
  | TemplateParamScalar
  | TemplateParamValue[]
  | { [key: string]: TemplateParamValue };

type TemplateParamNode = {
  type: TemplateParamType;
  default: TemplateParamValue;
  description: string;
  // scalaires
  maxLength?: number;
  min?: number;
  max?: number;
  options?: TemplateParamOption[];
  // objet
  properties?: TemplateParamSchema[];
  // tableau
  items?: TemplateParamNode;
  minItems?: number;
  maxItems?: number;
};

type TemplateParamSchema = TemplateParamNode & {
  key: string;
  label: string;
};
```

Un objet est composé de propriétés déclarées. Les clés arbitraires ne sont pas
acceptées : `additionalProperties` est interdit pour les paramètres statiques.

Un tableau peut contenir :

- des scalaires ;
- des objets ;
- des tableaux imbriqués, dans la limite de profondeur.

### 2. Valeurs par défaut obligatoires

Chaque nœud conserve un `default`. Pour un objet ou un tableau, le défaut doit
être valide et sérialisable.

Les objets partiels sont normalisés à l'import : chaque propriété absente prend
son propre défaut.

### 3. Limites et sécurité

Les paramètres statiques réutilisent les principes d'ADR-0026 :

- profondeur maximale : `8` ;
- nœuds de schéma maximaux : `300` ;
- propriétés maximales par objet : `50` ;
- éléments maximaux par tableau : `100` ;
- taille JSON sérialisée : `64 Ko` ;
- chaînes : limite existante de `2 000` caractères ;
- types JSON uniquement, jamais de fonction ;
- clés `__proto__`, `constructor`, `prototype` interdites ;
- objets construits avec un prototype nul ;
- aucune clé non déclarée dans un objet de paramètre.

### 4. Stockage

Aucune migration : `visual_template_params` est déjà un `jsonb`.

`normalizeTemplateParamValues` devient récursif et conserve les structures
JSON valides au lieu de supprimer tout ce qui n'est pas scalaire.

### 5. Validation, résolution et fusion

Les fonctions suivantes deviennent récursives :

- `validateTemplateParamSchema` ;
- `isValidParamValue` ;
- `resolveTemplateParams` ;
- `mergeTemplateParams` ;
- `orphanParamKeys`.

Règles :

- **écriture du lien** : validation stricte ;
- **chargement public** : résolution tolérante, avec retour au défaut au niveau
  du nœud invalide ;
- **changement de version** : conservation des valeurs compatibles, ajout des
  nouvelles propriétés avec leur défaut, suppression des propriétés retirées ;
- un changement de type remet le nœud concerné à son défaut.

### 6. UI

`TemplateParamsFields` devient récursif :

- `object` → groupe de champs, rendu comme une carte ;
- `array` → liste répétable avec « Ajouter un élément » et « Supprimer » ;
- `array of object` → cartes répétables avec champs imbriqués ;
- boutons « Réinitialiser » à chaque niveau ;
- erreurs avec chemin : `cards[0].title` ;
- bornes `minItems` / `maxItems` respectées dans l'UI.

Aucun éditeur JSON brut n'est l'interface principale. Un mode avancé pourra être
ajouté plus tard, sans changer le contrat.

### 7. Runtime et SDK

`TemplateContextPayload.params` devient `Record<string, TemplateParamValue>`.

- les templates scalaires existants ne changent pas ;
- les objets sont accessibles directement : `ctx.params.cards[0].title` ;
- le freeze devient profond pour empêcher la mutation d'un objet imbriqué ;
- le SDK expose un type générique compatible avec les valeurs récursives ;
- le transport iframe reste inchangé : `postMessage` accepte déjà les structures
  JSON.

### 8. Génération IA

L'IA peut générer des objets et tableaux si le schéma le permet.

- le prompt reçoit le schéma récursif complet ;
- la sortie doit être un JSON valide ;
- `url` et `image` restent exclus de la génération automatique ;
- toute valeur invalide retombe sur le défaut, propriété par propriété ;
- les limites de taille et de profondeur s'appliquent aussi à la réponse IA.

## Alternatives écartées

### Type `json` libre

Trop permissif : pas d'UI générée, validation faible, risque de données
inutilisables ou volumineuses.

### Réutiliser directement les contrats de données

Les contrats de données décrivent des données runtime et sont liés aux sources
de données. Les paramètres statiques ont besoin de valeurs par défaut, de
libellés et d'une UI d'édition.

### Autoriser `additionalProperties`

Un objet de paramètre doit rester un contrat fermé et prévisible.

## Conséquences

### Positives

- templates de configuration riches sans code serveur ;
- pas de migration de base ;
- compatibilité totale avec les paramètres scalaires ;
- mêmes garde-fous de sécurité que les contrats de données ;
- génération UI et IA pilotée par le schéma.

### Négatives

- validation et fusion plus complexes ;
- UI récursive plus lourde ;
- risque de manifestes trop volumineux, borné par les limites ;
- documentation et SDK à mettre à jour.

## Vérifications attendues

- paramètre objet valide avec défaut complet et partiel ;
- tableau de scalaires et tableau d'objets ;
- refus d'une profondeur, taille ou nombre d'éléments excessif ;
- refus des clés de prototype ;
- résolution imbriquée avec défauts ;
- fusion de schéma : ajout, suppression et changement de type ;
- UI : ajout/suppression d'éléments, réinitialisation, erreurs de chemin ;
- compatibilité des templates scalaires existants ;
- test runtime `ctx.params` avec objet et tableau ;
- test de génération IA avec sortie invalide.
