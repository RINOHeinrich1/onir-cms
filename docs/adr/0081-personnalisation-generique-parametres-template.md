# 0081. Personnalisation générique des paramètres de template par l’IA

- **Statut** : Proposé
- **Date** : 2026-11-09
- **Décideurs** : équipe projet
- **Référence** : ADR-0019, ADR-0023, ADR-0077, ADR-0080.
- **Complète** : ADR-0077, ADR-0080.
- **Remplace** : aucune.

## Contexte

La génération IA d’un chatbot utilise deux appels LLM :

1. génération du brouillon du chatbot ;
2. personnalisation du template visuel.

Le second appel était limité aux paramètres de type `color`. Résultat :

- les couleurs du Starter sont générées ;
- `chat_title`, `welcome_title` et `welcome_message` restent aux defaults ;
- les autres templates ne peuvent pas être personnalisés selon leur propre
  contrat.

Le moteur de paramètres est déjà générique et lit `version.manifest.params`.
Le filtre `types: ["color"]` du builder est la cause de cette limitation.

## Décision

### 1. Le contrat du template est la source de vérité

Le deuxième appel LLM reçoit le schéma réel de la version sélectionnée :

```text
key, label, description, type, default, options, min, max, maxLength
```

Le code ne doit jamais connaître `starter`, `chat_title` ou un autre nom
spécifique. Il parcourt le manifeste.

### 2. Types générables

Générés par l’IA :

```text
string
text
color
select
number
boolean
```

Exclus :

```text
image  → upload manuel uniquement
url    → jamais inventée par l’IA
```

Une clé absente du contrat est ignorée. Une valeur invalide retombe sur le
default du paramètre.

### 3. Deuxième appel LLM

Le deuxième appel devient un appel de **personnalisation du template**, et non
plus seulement un appel de couleurs :

```text
brouillon + conversation + palette + schéma
  → valeurs de tous les paramètres sûrs
  → validation
  → fusion avec les defaults
```

Il reste un seul second appel LLM ; aucun appel supplémentaire n’est ajouté.

### 4. Entrées du prompt

- conversation du builder ;
- brouillon généré : libellé, rôle, objectif, ton ;
- palette du site déjà calculée au premier appel ;
- schéma des paramètres de la version du template ;
- defaults.

Aucun nouvel accès réseau au site n’est effectué.

### 5. Validation et fallback

Pour chaque paramètre :

- `string` / `text` : chaîne, longueur maximale ;
- `color` : `#RRGGBB` ;
- `select` : une option autorisée ;
- `number` : min/max ;
- `boolean` : booléen ;
- clé inconnue : ignorée ;
- image/url : exclues ;
- paramètre absent ou invalide : default du manifeste.

### 6. Résultat

`ChatbotBuilderGeneration.visualTemplate.params` contient :

- les valeurs générées valides ;
- les defaults pour les autres paramètres.

La revue affiche les valeurs réellement retenues.

### 7. UX

La phase du loader devient :

```text
Personnalisation du template
```

au lieu de :

```text
Thème et couleurs
```

Le nombre de phases reste inchangé : configuration du chatbot, puis
personnalisation du template.

## Conséquences

### Positives

- tous les paramètres du contrat sont pris en compte ;
- Starter reçoit ses titres et messages ;
- les autres templates sont supportés sans code spécifique ;
- un seul second appel LLM ;
- validation et fallback explicites ;
- aucune image ou URL inventée.

### Négatives

- le prompt du second appel est plus riche ;
- il faut maintenir la validation par type ;
- les valeurs textuelles doivent être vérifiées en revue ;
- les templates avec beaucoup de paramètres produisent une réponse plus
  volumineuse.

## Alternatives écartées

- garder uniquement les couleurs : ne répond pas au besoin ;
- coder les clés du Starter dans le moteur : couplage ;
- générer `image` : upload manuel obligatoire ;
- générer `url` : risque d’URL inventée ;
- ajouter un troisième appel LLM : inutile.

## Critères d’acceptation

- Starter génère `chat_title`, `welcome_title`, `welcome_message` et les couleurs ;
- un template avec d’autres clés fonctionne sans modification du code ;
- `image` et `url` ne sont jamais générées ;
- une clé inconnue est ignorée ;
- une valeur invalide retombe sur le default ;
- le loader affiche « Personnalisation du template » ;
- aucun appel réseau supplémentaire au site ;
- le second appel reste unique.
