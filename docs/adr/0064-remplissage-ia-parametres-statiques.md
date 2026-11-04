# 0064. Remplissage assisté des paramètres statiques de template

- **Statut** : Proposé
- **Date** : 2026-11-04
- **Décideurs** : équipe projet
- **Référence** : ADR-0023, ADR-0060, ADR-0063 (remplacé).

## Contexte

Les templates visuels exposent déjà un schéma de paramètres statiques
(`template.params`) avec `key`, `label`, `description`, `type`, `default`,
`maxLength`, `min`/`max` et `options`. Exemples : « Titre du chatbot », « Titre
de bienvenue », « Message de bienvenue », « Couleur principale ».

L’assistance IA de création de chatbot génère déjà la fiche de collecte et le
comportement. Aujourd’hui, elle sélectionne le template widget compatible mais
applique `defaultsForSchema()` : les paramètres statiques restent aux valeurs
par défaut du template.

Ces paramètres sont distincts des sources de données dynamiques
(`dataContracts`, bindings) et ne doivent jamais être confondus avec elles.

ADR-0063 proposait un contrat de rôles couleur et une extraction headless. Ce
contrat est rejeté : les templates exposent déjà des libellés et descriptions
compréhensibles, et la couleur est déjà un simple `type` de paramètre.

## Décision

### 1. Contrat existant, aucun rôle ajouté

Le remplissage utilise le schéma `template.params` existant. Aucun champ
`colorRole` ou équivalent n’est ajouté aux templates. Le libellé, la description
et le type du paramètre suffisent au modèle IA pour comprendre sa fonction.

### 2. Périmètre

- Uniquement le **template widget sélectionné automatiquement** après la
  génération du chatbot.
- Uniquement les **paramètres statiques** de ce template.
- Aucun remplissage des `dataContracts`, des bindings ou des sources de données.
- Types exclus du remplissage automatique : `url` et champs fichiers.
- Types éligibles : `string`, `text`, `color`, `select`, `number`, `boolean`.
- Toute valeur incertaine ou invalide conserve le `default` du template.

### 3. Extraction des couleurs du site

Si le lien du site existe, une extraction **heuristique sans navigateur headless**
est exécutée sur les pages déjà crawlées :

- lecture du HTML, des styles inline et des CSS accessibles (sans exécution JS) ;
- collecte de `theme-color`, des variables CSS et des déclarations de couleur
  (`color`, `background-color`, `background` solide, `border-color`) ;
- pondération par fréquence, type de sélecteur (body/header/button/lien/carte),
  page et contexte d’usage ;
- regroupement des couleurs proches pour produire une palette avec un **taux
  d’utilisation** et des indices de contexte ;
- aucune promesse de rendu CSS complet : les limites CORS, les styles calculés
  et les CSS non accessibles sont des cas de repli.

La palette extraite est fournie à l’IA comme contexte. L’IA associe les
paramètres couleur aux candidats à partir de leurs libellés/descriptions, sans
rôle de template. Si aucun site n’est fourni ou si la palette est jugée
insuffisante, l’IA propose des couleurs à partir de la description et des
connaissances, puis les valeurs sont validées ; sinon le défaut est conservé.

Aucun navigateur headless n’est introduit.

### Politique commune d'appel IA

Les deux appels (chatbot puis paramètres de template) utilisent le même helper
`callStructuredAi` :

- `structured: true` est envoyé **dès la première tentative**, pour tous les
  modèles ; certains fournisseurs l'utilisent comme mode JSON natif, d'autres
  le traduisent seulement par le prompt ;
- budgets successifs : **4 000 → 8 000 → 12 000 tokens** ;
- le premier appel est arrêté dès qu'un JSON valide est obtenu ;
- retry uniquement sur réponse vide, contenu non JSON ou contenu tronqué ;
- pas de retry sur erreur d'authentification, de quota ou de fournisseur
  indisponible ;
- si un modèle refuse 12 000 tokens, l'erreur finale est remontée proprement ;
- aucun comportement spécifique à DeepSeek : la politique est générique.

Conséquences :

- **appel n°1** : après les trois budgets sans JSON, la création IA échoue avec
  un message explicite « budget de raisonnement insuffisant » ;
- **appel n°2** : après les trois budgets sans JSON, les paramètres du template
  conservent leurs valeurs par défaut et un avertissement non bloquant est
  affiché ; le chatbot reste créé.

### 4. Déroulé

1. L’IA génère la fiche de collecte, le comportement et les connaissances.
2. Un template widget compatible est sélectionné automatiquement.
3. Un second appel IA reçoit :
   - le schéma des paramètres statiques du template sélectionné ;
   - la description du chatbot ;
   - la fiche générée ;
   - les connaissances générées ;
   - la palette heuristique du site si disponible.
4. L’IA renvoie uniquement des valeurs pour des clés connues.
5. Les valeurs sont validées par type, options, bornes et longueur.
6. L’utilisateur visualise les valeurs proposées et peut les corriger avant
   enregistrement, comme pour les autres champs générés par IA.
7. Les valeurs sont stockées dans les paramètres du canal widget sélectionné.

### 5. Sécurité et robustesse

- Aucune exécution de JavaScript du site cible.
- Aucune écriture dans les sources de données dynamiques.
- Aucune création de clé de paramètre.
- Aucune valeur hors `options` pour un `select`.
- Couleur limitée au format hexadécimal supporté (`#rrggbb`).
- Repli systématique sur le défaut en cas de doute.

## Alternatives considérées

1. **Contrat de rôles couleur (ADR-0063)** : rejeté. Redondant avec les libellés
   et descriptions déjà exposés, et trop intrusif pour les templates.
2. **Extraction headless** : rejetée pour ce lot. Coût d’image, mémoire,
   isolation réseau et passage à l’échelle.
3. **Remplissage manuel uniquement** : conservé comme filet de sécurité, mais ne
   répond pas à l’objectif d’assistance.
4. **Remplir aussi les données dynamiques** : rejeté. Risque d’invention de
   sources et de mappings.

## Conséquences

### Positives

- Aucun changement de schéma ni de migration.
- Les auteurs de templates gardent leurs libellés métier.
- Les couleurs sont traitées comme n’importe quel paramètre statique.
- Extraction légère, compatible avec le crawl existant.

### Négatives / limites

- L’extraction heuristique est moins fidèle qu’un rendu navigateur.
- Les CSS externes non accessibles ou les couleurs calculées peuvent manquer.
- Le modèle doit être guidé par des libellés de qualité ; sinon défaut.
- Un second appel IA ajoute latence et consommation de tokens sur les créations
  assistées.

## Étapes d’implémentation envisagées

1. Ajouter l’extraction heuristique de palette (HTML/CSS, taux d’usage).
2. Ajouter le prompt et le schéma de réponse pour les paramètres statiques.
3. Brancher le second appel après sélection du template widget.
4. Valider, prévisualiser et fusionner les valeurs avec les défauts.
5. Ajouter les tests de validation et de repli.

## Annexe A — algorithme de référence

Cette annexe est la spécification de référence pour l’implémentation. Les
points marqués « à confirmer » sont les seuls choix encore ouverts.

### A.1 Vue d’ensemble

```text
description + site + documents
        │
        ▼
analyse du site (HTML/CSS, sans headless)
        │
        ▼
appel IA n°1 — fiche + comportement + connaissances
        │
        ▼
sélection déterministe du template widget
        │
        ├── aucun template widget → widget désactivé, pas d'appel n°2
        │
        ▼
appel IA n°2 — paramètres statiques du template
        │
        ▼
validation → fusion avec les défauts → prévisualisation → enregistrement
```

Aucune source de données dynamique (`dataContracts`, bindings) n’est lue,
envoyée ou modifiée.

### A.2 Contexte d’entrée

- Description du chatbot : 4 000 caractères maximum.
- URL du site : optionnelle.
- Documents : texte extrait existant, borné.
- Pages du site : limite et timeout existants du crawler.
- Aucun secret, aucune donnée privée d’une autre organisation.

### A.3 Extraction heuristique de palette

Pour chaque page crawlée :

- `meta[name="theme-color"]` ;
- attributs `style` et blocs `<style>` ;
- feuilles CSS liées accessibles, dédupliquées et bornées ;
- variables CSS (`--primary`, `--brand`, …) ;
- déclarations `color`, `background-color`, `background` solide,
  `border-color`, arrêts de gradient.

Normalisation :

- hex, `rgb()`, `hsl()` et noms CSS → `#rrggbb` ;
- alpha < 0,5 ignoré ;
- résolution simple des `var(--…)` définis dans `:root` ;
- regroupement des couleurs proches (distance RGB/ΔE).

Pondération :

```text
score =
  poids_propriété
  × poids_sélecteur
  × nombre_de_pages
  × fréquence_dans_les_CSS
```

| Contexte | Poids |
|---|---:|
| `background-color` sur `body`, `html`, `main` | 1,0 |
| `color` sur `body`, `p`, `h1..h6` | 0,9 |
| `background-color` sur bouton, `.btn`, CTA | 1,0 |
| `color` sur bouton/lien/nav | 0,8 |
| `background-color` sur carte/panneau | 0,7 |
| `border-color` | 0,2 |
| Arrêt de gradient | 0,5 |
| Variable CSS au nom évocateur (`--primary`, `--brand`) | +0,3 |
| `theme-color` | 0,8 |

Sortie :

```json
{
  "candidates": [
    { "hex": "#0b3b66", "usageRate": 0.42, "contexts": ["background", "actions"] },
    { "hex": "#f4f7fb", "usageRate": 0.27, "contexts": ["background", "surfaces"] }
  ],
  "confidence": "high"
}
```

`contexts` est une indication destinée à l’IA, **pas un rôle stocké dans le
template**. Si le site est absent ou la palette insuffisante, l’IA peut proposer
des couleurs depuis la description et les connaissances. Le défaut du template
reste le filet de sécurité.

### A.4 Politique commune d’appel IA

Les deux appels utilisent le même helper :

```text
callStructuredAi(prompt):
  for maxTokens in [4000, 8000, 12000]:
    raw = complete({ prompt, structured: true, maxTokens })
    if raw contient un JSON objet exploitable:
      return JSON
    si réponse vide, non JSON ou tronquée:
      continuer
  échouer avec « budget de raisonnement insuffisant »
```

`structured: true` est envoyé dès la première tentative. Le retry est générique,
sans comportement spécifique à DeepSeek. Pas de retry sur erreur
d’authentification, de quota ou de fournisseur indisponible.

### A.5 Appel IA n°1 — chatbot

Entrées :

- description ;
- texte du site et/ou documents ;
- contexte éventuel.

Sortie JSON : libellé, description, rôle, objectif, ton, guardrails, champs de
fiche, template de rendu, prompt, connaissances, fallback.

Validation existante : schéma du brouillon, types de champs, limites,
connaissances et fallback.

En cas d’échec après les trois budgets : la création IA échoue avec un message
explicite.

### A.6 Sélection du template widget

- parcours déterministe de `visualTemplates` ;
- première version avec `widget !== null` ;
- aucun choix par l’IA ;
- aucun template widget → widget désactivé et appel n°2 ignoré ;
- template sans paramètres → appel n°2 ignoré.

### A.7 Appel IA n°2 — paramètres statiques

Entrées :

- schéma `template.params` du template sélectionné, avec `key`, `label`,
  `description`, `type`, `default`, `maxLength`, `min`, `max`, `options` ;
- fiche et comportement générés ;
- connaissances générées, résumées ;
- palette heuristique du site si disponible.

Consigne :

```text
Remplis uniquement les clés fournies.
Utilise le libellé et la description de chaque paramètre.
Respecte strictement type, options, bornes et longueur.
Pour les couleurs, utilise la palette du site si elle est fournie.
Si aucune couleur fiable n'existe, propose une couleur cohérente avec la
description et les connaissances.
En cas de doute, renvoie la valeur par défaut.
N'invente aucune clé.
Ne renvoie ni URL ni fichier.
Réponds uniquement en JSON.
```

Sortie :

```json
{
  "params": {
    "welcome_title": "Bienvenue chez Atelier Moringa",
    "primary_color": "#0b3b66"
  }
}
```

Types autorisés : `string`, `text`, `color`, `select`, `number`, `boolean`.
Types exclus : `url`, fichiers. Aucun `dataContract` ou binding.

### A.8 Validation

- clé absente du schéma → ignorée ;
- clé inconnue → ignorée ;
- `string` / `text` → chaîne, limite `maxLength` respectée ;
- `color` → `#rrggbb` valide ;
- `number` → nombre fini dans `min`/`max` ;
- `boolean` → booléen strict ;
- `select` → valeur exacte d’une `options[].value` ;
- valeur invalide ou incertaine → `default` du template.

À confirmer : texte trop long → troncature au mot + avertissement, ou défaut.
Proposition actuelle : troncature au mot + avertissement dans l’aperçu.

### A.9 Fusion et stockage

```text
valeurs_finales = {
  ...defaults_du_template,
  ...valeurs_IA_validées
}
```

Les valeurs sont stockées dans `channels.widget.params` du lien. Aucun
changement de table. L’utilisateur voit les valeurs, peut les modifier, et
l’aperçu est actualisé. Une édition utilisateur ultérieure n’est jamais écrasée
silencieusement.

### A.10 Échecs et repli

- appel n°1 échoué → erreur existante, création interrompue ;
- aucun template widget → widget désactivé ;
- appel n°2 échoué → défauts du template + avertissement non bloquant ;
- paramètre invalide → défaut de ce paramètre uniquement ;
- palette faible ou absente → couleurs proposées par l’IA depuis la
  description/connaissances, puis validation ;
- le chatbot reste créable même si l’appel n°2 échoue.

### A.11 Tests

- template avec paramètres texte et couleur ;
- site avec palette exploitable ;
- site absent → couleurs proposées par l’IA ;
- palette faible → défauts ou propositions IA ;
- `select` avec option invalide ;
- couleur invalide ;
- clé inconnue ;
- `maxLength` dépassé ;
- aucun template widget ;
- template sans paramètres ;
- échec du second appel IA ;
- aucun `dataContract` modifié ;
- vérification que `structured: true` et les budgets 4k/8k/12k sont utilisés.

### A.12 Points à confirmer

- Seuil de confiance de la palette (quand considérer l’extraction comme
  exploitable).
- Politique de troncature des textes trop longs.
- Faut-il autoriser l’IA à proposer des couleurs depuis la description même
  lorsqu’une URL de site existe mais que la palette est faible ?
