# 0068. Missions du chatbot, analyse d'intention et sources d'information

- **Statut** : Proposé
- **Date** : 2026-11-05
- **Décideurs** : équipe projet
- **Référence** : ADR-0012, ADR-0013, ADR-0049, ADR-0052, ADR-0055, ADR-0060, ADR-0067.
- **Complète** : ADR-0049 (fiches de collecte), ADR-0052 (sélection des données globales), ADR-0067 (outils internes sur les fiches).
- **Remplace** : aucune.

## Contexte

Le retour d'expérience du chatbot « Concierge Hôtel » a révélé un conflit de
mission. La configuration active (`a4c07842…`, version 3) possède une fiche de
collecte et un prompt dont l'objectif est de collecter des informations, tandis
que `searchTool.enabled = false` et `searchTool.ficheTypes = []`.

La conversation n'a donc jamais appelé `search_fiches` :

- aucune session dans `chat_search_sessions` ;
- aucun bloc `tool_search_result` ;
- l'assistant a immédiatement demandé le nom de l'établissement.

La version 2 de la même configuration avait pourtant `enabled = true` et
`ficheTypes = ["concierge-hotel"]`. La version 3 a remis l'outil à zéro. Par
ailleurs, la génération assistée par IA produit aujourd'hui **toujours** un
chatbot avec fiche de collecte et ne génère aucune source de recherche. Le
provisioning applique `defaultSearchToolConfig()`, donc l'outil est désactivé
par défaut.

Le problème est structurel :

- la présence d'une fiche de collecte pousse le chatbot à collecter ;
- `search` ne décrit qu'une seule des sources possibles ;
- les connaissances et les médias ont leurs propres mécanismes de consommation ;
- le modal d'édition ne permet pas de modifier toutes les sources ;
- l'IA génère un formulaire de collecte sans mission explicite ;
- le choix des sources est laissé au modèle dans une boucle d'outils, sans
  analyse d'intention explicite ;
- une demande mixte (« le contact de MandamPro et des hôtels à Madagascar »)
  doit lancer plusieurs sources, si possible en parallèle.

De plus, le sélecteur de connaissances actuel ne voit que le `titre` des
entrées. La décision retenue est de conserver ce fonctionnement : les titres
doivent être uniques, courts et représentatifs du contenu. Aucun champ
`description` n'est ajouté par entrée. En revanche, les sources doivent être
**labellisables** et **décrivables** au niveau de la configuration, car
l'analyse d'intention a besoin de savoir quand utiliser A, B ou C.

## Décision

### 0. Vue d'ensemble

La configuration décrit trois niveaux :

```text
1. Mission stable
   collect | inform | hybrid

2. Capacités disponibles
   collection.fiches
   information.fiches
   information.connaissances
   information.medias

3. Décision par tour
   inform | collect | clarify
   + plan de sources pour inform
```

Le processus de réponse est :

```text
message
  → plan runtime spécialisé
  → analyse d'intention (seulement si nécessaire)
  → exécution parallèle des sources retenues
  → construction d'un bundle de contexte
  → une complétion de réponse
  → persistance
```

### 1. Vocabulaire

Une **fiche de collecte** est un modèle de formulaire (`concierge-hotel`,
`fournisseur`). Une **instance de fiche** est un enregistrement réel
(`fiches.data`).

Une **source d'information** est une capacité de lecture accessible au chatbot.
Elle ne crée et ne modifie aucune donnée.

La **mission** est l'enveloppe stable autorisée par la configuration. L'**intention
d'exécution** est la décision prise pour un tour de conversation.

### 2. Missions et intention d'exécution

#### 2.1 Mission

```text
collect   → collecter une nouvelle fiche
inform    → informer à partir des sources d'information
hybrid    → autoriser informer et collecter
```

#### 2.2 Intention d'exécution

Une intention par tour est choisie parmi :

```text
inform    → répondre à partir des sources
collect   → poursuivre ou démarrer une collecte
clarify   → demander une précision
```

`hybrid` n'est pas une intention exécutable par tour : c'est l'enveloppe qui
autorise `inform` et `collect`. Une demande mixte est traitée en `inform`
d'abord, puis la collecte peut être proposée au tour suivant.

#### 2.3 Règles par mission

| Mission | Intentions autorisées | Sources |
|---|---|---|
| `collect` | `collect`, `clarify` | aucune |
| `inform` | `inform`, `clarify` | au moins une source active |
| `hybrid` | `inform`, `collect`, `clarify` | au moins une source active |

Règles de sûreté :

- en `inform`, `collect` est interdit ;
- en `collect`, aucune source n'est exposée ;
- en `hybrid`, `collect` n'est choisi que si la demande de création est
  explicite et la confiance suffisante ;
- en cas d'ambiguïté, `clarify` est préféré à `collect` ;
- une demande mixte commence par `inform` ;
- aucune liste de mots-clés n'est utilisée pour décider.

### 3. Sources d'information

Les sources sont sélectionnables indépendamment :

```text
A. fiches          → fiches existantes
B. connaissances   → base de connaissances
C. medias          → photos et liens accessibles au chatbot
```

Chaque source porte dans la configuration :

- `label` : nom affiché et compris par l'analyseur ;
- `usageHint` : phrase décrivant **quand** l'utiliser.

Ces deux champs sont utilisés par l'analyse d'intention. Si une opération est
exposée plus tard comme outil, sa description sera également construite depuis
`usageHint`. Ce ne sont pas de simples libellés d'interface.

#### A. Fiches

La source A conserve le contrat de l'ADR-0067 :

- `ficheTypes` : clés de fiches de collecte interrogées ;
- toutes les instances de l'organisation pour ces clés ;
- `statusMode`, `fixedStatusKeys`, `sortMode` ;
- `matchMode` pour la qualité de recherche ;
- opérations de lecture `search_fiches`, `continue_search`, `get_fiche`,
  `list_fiche_types`, `count_fiches` ;
- lecture seule.

Ces opérations sont exécutées par un adaptateur de source. Elles ne sont pas
nécessairement exposées comme outils au modèle : l'orchestrateur les appelle
directement avec le plan produit par l'analyse d'intention.

`usageHint` peut par exemple valoir :

```text
Rechercher des hôtels partenaires par localisation, services ou budget.
```

#### B. Connaissances

La source B conserve le mini-RAG actuel :

- les entrées candidates sont présentées uniquement par leur `titre` ;
- les titres doivent être uniques, explicites et représentatifs du contenu ;
- aucun champ `description` n'est requis par entrée ;
- l'UI et la documentation demandent à l'utilisateur d'écrire des titres clairs ;
- le sélecteur reçoit le `usageHint` de la source ;
- le sélecteur ne voit jamais le contenu complet avant d'avoir choisi les
  entrées.

La sélection conserve :

- connaissances rattachées au chatbot ;
- connaissances globales en mode `all` ou `selected` ;
- plafond de 40 entrées candidates ;
- injection du contenu retenu dans le prompt.

#### C. Médias

La source C devient une vraie source accessible, pas seulement un affichage
post-réponse.

Deux modes de consommation sont admis :

```text
on_demand     → recherche de métadonnées par l'adaptateur de source
illustration  → sélection après la réponse, comportement historique
```

Pour `inform` et `hybrid`, le mode par défaut est `on_demand`.

Le modèle ne voit pas le contenu binaire de l'image. Il voit :

- `mediaId` ;
- `type` (`photo` ou `lien`) ;
- `libelle` ;
- `description`.

L'analyse visuelle réelle nécessiterait un modèle vision ou des descriptions
générées à l'upload. Ce n'est pas dans ce périmètre.

Le serveur attache les médias retenus à la réponse et génère les URLs signées.
Le modèle ne reçoit jamais d'URL signée.

Un média de type `lien` n'est pas lu comme une page web : seuls son libellé,
sa description et son URL sont disponibles. Le contenu de la page cible n'est
pas extrait.

Le mode `illustration` conserve `selectChatMedia` après la réponse. Il est
réservé à la compatibilité.

### 4. Configuration versionnée

La configuration porte la mission, l'intention possible et toutes les sources :

```json
{
  "mission": "hybrid",
  "collection": {
    "fiches": []
  },
  "information": {
    "fiches": {
      "enabled": true,
      "label": "Hôtels partenaires",
      "usageHint": "Rechercher des hôtels par localisation, services ou budget.",
      "ficheTypes": ["concierge-hotel"],
      "statusMode": "hidden_fixed",
      "fixedStatusKeys": [],
      "sortMode": "fair_rotation",
      "matchMode": "normalized"
    },
    "connaissances": {
      "enabled": true,
      "label": "Informations MandamPro",
      "usageHint": "Utiliser pour le contact, les services et les informations générales.",
      "selection": {
        "mode": "selected",
        "ids": []
      },
      "maxEntries": 40
    },
    "medias": {
      "enabled": true,
      "label": "Photos et liens",
      "usageHint": "Utiliser pour illustrer les hôtels, les chambres et les services.",
      "types": ["photo", "lien"],
      "selection": {
        "mode": "all",
        "ids": []
      },
      "access": "on_demand",
      "maxResults": 3
    }
  }
}
```

Règles :

- `mission` est obligatoire ;
- `collect` exige `collection.fiches.length >= 1` et aucune source active ;
- `inform` exige au moins une source active et aucune fiche de collecte ;
- `hybrid` exige `collection.fiches.length >= 1` et au moins une source active ;
- une configuration qui contient une capacité inutilisable est refusée :
  `collect` avec sources, `inform` avec collection ;
- si la source A est active, `information.fiches.ficheTypes` doit contenir au
  moins une clé de fiche de collecte ;
- les sources restent versionnées avec la configuration du chatbot ;
- `link.sources` n'est plus la source de vérité : c'est une projection de
  compatibilité pour les templates visuels et les anciennes configurations.

### 5. Algorithme runtime

#### 5.0 Spécialisation pilotée par la configuration

Le runtime ne doit jamais exécuter une étape dont la configuration rend le
résultat déterministe. C'est le principe de **spécialisation pilotée par la
configuration** (*configuration-driven specialization*), avec :

- **short-circuit** : sauter une décision déjà connue ;
- **lazy evaluation** : ne charger que les capacités actives ;
- **direct dispatch** : appeler directement l'unique source active ;
- **routed dispatch** : router seulement entre plusieurs sources actives.

Le plan runtime est construit avant toute exécution :

```text
mission = collect
  → aucun analyseur d'intention
  → aucune source
  → aucune opération de recherche
  → une seule complétion de collecte

mission = inform, 1 source active
  → aucun analyseur d'intention
  → dispatch direct vers cette source
  → une complétion de réponse

mission = inform, 2..3 sources actives
  → analyseur d'intention limité aux sources actives
  → exécution parallèle des sources retenues
  → une complétion de réponse

mission = hybrid
  → analyseur d'intention, car collect et inform sont tous deux possibles
  → si collect : aucune source exécutée
  → si inform : sources actives exécutées
```

Règles de spécialisation :

- une source désactivée n'apparaît ni dans le prompt, ni dans les opérations,
  ni dans l'analyseur, ni dans les appels réseau ;
- une source active unique ne participe à aucun choix de source ;
- si B est la seule source, le sélecteur de connaissances reste nécessaire
  lorsqu'il y a plusieurs entrées, mais il n'y a aucun choix entre A/B/C ;
- si A ou C est la seule source, l'appel est direct, sans analyseur ;
- si une source n'a qu'un seul candidat, le sélecteur de cette source est
  contourné ;
- en `collect`, aucune opération de recherche, aucun sélecteur de connaissances
  et aucune recherche média ne sont exécutés ;
- en `hybrid`, l'analyseur ne voit que les sources actives ;
- une configuration impossible (`hybrid` sans collecte ou sans source,
  `inform` sans source, `collect` avec source, source A sans `ficheTypes`) est
  refusée à la validation : le runtime n'a pas à porter ces cas.

Ce principe évite que le système paie une décision, un prompt ou un appel API
pour une capacité qui n'existe pas dans la configuration.

#### 5.1 Résolution

1. Charger la conversation, le lien et la configuration courante.
2. Vérifier le lien, l'organisation et la configuration.
3. Résoudre la mission.
4. Valider les sources actives.
5. Construire le plan runtime spécialisé (section 5.0).
6. Construire le contexte minimal :
   - fiche active éventuelle ;
   - état de collecte ;
   - historique borné ;
   - sources disponibles avec `label` et `usageHint`.

#### 5.2 Analyse d'intention

L'analyse d'intention n'est exécutée que si le plan runtime l'exige :

- jamais en `collect` ;
- jamais en `inform` avec une seule source active ;
- toujours en `hybrid` ;
- en `inform` avec 2 ou 3 sources actives.

Elle ne voit que les sources actives.

Entrées de l'analyseur :

- message utilisateur ;
- 6 à 10 derniers messages ;
- mission ;
- sources actives avec `label`, `usageHint`, nombre d'éléments et types ;
- état de collecte ;
- éventuel dernier résultat de recherche.

Sortie stricte :

```json
{
  "intent": "inform",
  "confidence": 0.94,
  "needsSources": true,
  "sources": [
    {
      "source": "connaissances",
      "query": "contact MandamPro"
    },
    {
      "source": "fiches",
      "query": "hôtels à Madagascar",
      "limit": 5
    }
  ]
}
```

Règles de validation :

- `intent` ∈ `inform`, `collect`, `clarify` ;
- `needsSources` est obligatoire ;
- si `needsSources = false`, `sources` doit être vide ;
- une demande de politesse peut être `inform` avec `needsSources = false` ;
- une demande informationnelle sans source est `clarify` ;
- `collect` refusé si la mission est `inform` ;
- `collect` refusé si `collection.fiches` est vide ;
- `sources` doit être un sous-ensemble des sources actives ;
- une source inconnue ou désactivée est retirée ;
- `sources` vide avec `needsSources = true` déclenche `clarify` ;
- `sources` vide avec `needsSources = false` autorise une réponse
  conversationnelle sans source ;
- `confidence < 0.60` en `hybrid` privilégie `inform` ou `clarify` ;
- `collect` exige une demande de création explicite et
  `confidence >= 0.75` ;
- si une collecte est active et que le message répond à la dernière question
  de collecte, `collect` est prioritaire ;
- l'analyseur ne répond jamais à la question : il ne fait que router ;
- l'analyseur ne peut pas inventer une source ;
- l'analyseur ne peut pas changer la mission ;
- l'analyseur ne peut pas créer de fiche.

Exemple pour la demande mixte :

```text
« Donne-moi le contact de MandamPro et propose-moi quelques hôtels à Mada. »
```

```json
{
  "intent": "inform",
  "confidence": 0.95,
  "needsSources": true,
  "sources": [
    { "source": "connaissances", "query": "contact MandamPro" },
    { "source": "fiches", "query": "hôtels à Madagascar", "limit": 5 }
  ]
}
```

#### 5.3 Exécution parallèle des sources

Les sources retenues sont exécutées en **parallèle**, pas séquentiellement.

```text
A. fiches          → recherche structurée
B. connaissances   → sélection RAG
C. medias          → recherche de métadonnées
```

Chaque source a son propre adaptateur et sa propre requête. Les appels sont
lancés avec `Promise.allSettled` pour qu'un échec de source ne bloque pas les
autres.

Règles :

- une source au maximum par tour ;
- trois sources au maximum ;
- les résultats sont fusionnés dans un **bundle de contexte** ;
- une source en échec est ignorée et tracée ;
- si toutes les sources échouent, le chatbot répond sans contexte ou demande
  une clarification ;
- aucune source ne peut lire ou écrire hors de son périmètre.

Le bundle contient :

```text
- fiches : items + champs typés + métadonnées de pagination
- connaissances : titres + contenus retenus
- médias : mediaId + type + libellé + description
```

#### 5.4 Construction de la réponse

Une seule complétion de réponse est faite après l'exécution des sources.

Ordre du prompt :

1. prompt de base (guidé ou expert) ;
2. mission et intention retenues ;
3. description des sources utilisées ;
4. bundle de résultats ;
5. contexte de collecte **uniquement si `intent = collect`** ;
6. politique de priorité.

Politique de priorité :

```text
fiches > connaissances > médias
```

- les fiches structurées priment pour les données métier ;
- les connaissances complètent le contexte ;
- les médias illustrent ;
- le modèle ne doit jamais inventer le contenu d'une image ;
- aucune question de collecte ne doit être posée en `inform`.

En `inform`, le guide des champs et l'état de collecte ne sont **jamais**
injectés.

En `collect`, le guide des champs et l'état de collecte sont injectés. Les
sources restent disponibles pour répondre à une question incidente, mais elles
ne remplacent pas la question de collecte.

#### 5.5 Réponse et persistance

1. Persister le message assistant avec ses blocs typés.
2. Retourner les connaissances réellement injectées.
3. Attacher les médias retenus.
4. Retourner `mediaPending` uniquement en mode `illustration`.
5. Tracer les sources réellement consommées : fiches, connaissances, médias.
6. Tracer l'intention, la confiance et les sources planifiées.

#### 5.6 Suivi et pagination

- « montre-moi les autres » est une nouvelle intention `inform` avec source A
  et continuation de la session de recherche ;
- `continue_search` reste borné ;
- `get_fiche` reste une lecture ponctuelle ;
- aucune pagination n'est reconstruite par le modèle à partir de zéro.

### 5.7 Sources, opérations et outils

Une **source** est une capacité métier. Un **adaptateur de source** exécute
cette capacité. Un **outil** n'est qu'une modalité d'exposition au modèle.

Dans ce périmètre :

- l'analyseur produit un plan de sources ;
- l'orchestrateur exécute les adaptateurs ;
- le modèle de réponse reçoit les résultats, pas les outils ;
- `search_fiches`, `continue_search`, `get_fiche`, `list_fiche_types`,
  `count_fiches` et `search_medias` sont des opérations internes ;
- `label` et `usageHint` décrivent la source à l'analyseur ;
- si un mode expert expose plus tard ces opérations comme outils, leurs
  descriptions seront générées depuis `usageHint`.

Cette séparation évite de confondre « source configurée » et « outil exposé au
modèle ».

### 5.8 Parcours concrets

#### `collect` seul

```text
Configuration :
  mission = collect
  collection.fiches = [concierge-hotel]
  information.* = désactivées

Message : "Je veux inscrire mon hôtel."
Traitement :
  → pas d'analyse d'intention
  → pas de source
  → une complétion de collecte
  → question suivante du formulaire
```

#### `inform` avec B uniquement

```text
Configuration :
  mission = inform
  B. connaissances = active
  A. fiches = désactivée
  C. médias = désactivée

Message : "Quel est le contact de MandamPro ?"
Traitement :
  → pas d'analyse d'intention (une seule source)
  → sélection des connaissances par titre
  → une complétion de réponse
```

Le sélecteur de connaissances reste nécessaire s'il y a plusieurs entrées.
C'est une décision interne à B, pas une décision entre sources.

#### `inform` avec B + C

```text
Configuration :
  mission = inform
  B. connaissances = active
  C. médias = active
  A. fiches = désactivée

Message : "Donne-moi le contact et une photo de l'hôtel."
Traitement :
  → analyse d'intention limitée à B et C
  → deux sources en parallèle
  → une complétion de réponse
```

#### `hybrid`

```text
Configuration :
  mission = hybrid
  collection.fiches = [concierge-hotel]
  A. fiches = active
  B. connaissances = active
  C. médias = désactivée

Message : "Je cherche un hôtel à Anosibe."
Traitement :
  → analyse d'intention
  → intent = inform
  → sources A et B en parallèle
  → une complétion de réponse
  → aucune question de collecte

Message : "Je veux inscrire mon hôtel."
Traitement :
  → analyse d'intention
  → intent = collect
  → aucune source exécutée
  → une complétion de collecte
```

#### Demande mixte

```text
Message : "Donne-moi le contact de MandamPro et quelques hôtels à Mada."
Traitement :
  → intent = inform
  → sources B et A en parallèle
  → une seule réponse qui traite les deux demandes
  → aucune collecte
```

### 6. Consommation et coût

Coût selon le plan spécialisé :

```text
collect
  → 1 complétion

inform + 1 source A
  → 1 recherche fiches + 1 complétion

inform + 1 source B
  → 1 sélection connaissances + 1 complétion

inform + 1 source C
  → 1 recherche médias + 1 complétion

inform + B + C
  → 1 analyse d'intention
  + 1 sélection connaissances
  + 1 recherche médias
  + 1 complétion

inform + A + B + C
  → 1 analyse d'intention
  + 1 sélection connaissances
  + 1 recherche fiches
  + 1 recherche médias
  + 1 complétion
```

Les recherches A/C sont parallèles. Le coût en tokens reste borné par :

- 40 connaissances candidates ;
- 60 médias candidats ;
- 3 médias affichés ;
- 5 résultats de fiches par recherche, 20 maximum.

Un tour `hybrid` en `collect` n'exécute pas les sources d'information et ne paie
donc pas leur coût.

L'analyse d'intention doit utiliser un usage IA dédié (`intent`) et un modèle
rapide, distinct du modèle de réponse si nécessaire.

### 7. UI

Le modal de création et le modal d'édition doivent exposer les mêmes étapes :

1. **Mission** : collecter, informer, collecter et informer.
2. **Fiches de collecte** : si `collect` ou `hybrid`.
3. **Sources d'information** : si `inform` ou `hybrid`.
   - Fiches existantes : libellé, description d'usage, portée, statut, tri,
     matching.
   - Connaissances : libellé et description d'usage de la source, tout ou
     sélection. Les entrées sont choisies par leur titre ; l'UI rappelle que les
     titres doivent être clairs et uniques.
   - Médias : libellé, description d'usage, photos/liens, tout ou sélection,
     accès au chatbot ou illustration.
4. **Avertissements** :
   - aucune source active en `inform` ou `hybrid` ;
   - médias seuls sans description ;
   - fiche de recherche avec zéro instance ;
   - doublons de fiches de collecte ;
   - source désactivée mais données encore présentes ;
   - source active mais aucun élément accessible.

`SourcesField` est remplacé par la section des sources. La sélection des
connaissances et des médias devient éditable dans le modal de modification.

### 8. Génération assistée par IA

Le prompt de génération doit produire une mission explicite.

- `collect` : génère une fiche de collecte et ses champs.
- `inform` : ne génère pas de champs ; la portée A et les sélections B/C sont
  choisies par l'utilisateur dans l'UI. Les titres de connaissances proposés
  doivent être courts, uniques et explicites.
- `hybrid` : génère les champs de collecte et demande une ou plusieurs sources.

L'IA ne choisit jamais seule les clés `ficheTypes` : elles appartiennent à
l'organisation et doivent être sélectionnées explicitement.

Une régénération IA ne doit pas écraser silencieusement une configuration de
sources existante. Elle doit soit préserver les sources, soit demander
confirmation.

### 9. Migration

La migration doit préserver le comportement actuel :

- `searchTool` → `information.fiches` ;
- `dataSelection` → `information.connaissances` et `information.medias` ;
- `link.sources` → projection vers `information.*` ;
- `sources.connaissances` → source B ;
- `sources.phototheque` et `sources.lien` → types de la source C ;
- `searchTool.enabled = true` → source A active ;
- collecte seule sans source → `mission = "collect"` ;
- collecte + sources → `mission = "hybrid"` ;
- sources sans collecte → `mission = "inform"`.

`link.sources` reste alimenté pour les templates visuels qui utilisent
`knowledgeEnabled`, mais il n'est plus la source de vérité.

### 10. Recherche de fiches

La recherche de fiches conserve les opérateurs de l'ADR-0067.

`matchMode` est ajouté pour la qualité de recherche :

```text
strict       → comparaison actuelle
normalized   → casse + accents (unaccent)
fuzzy        → trigrammes (pg_trgm), optionnel
```

Le mode `relevance` reste non exécutable tant qu'un score de pertinence n'est
pas implémenté. Il ne doit pas être présenté comme disponible.

## Conséquences

### Positives

- Une analyse d'intention explicite remplace un comportement implicite.
- Le coût décisionnel est proportionnel à la configuration active, pas à
  l'ensemble des capacités théoriques.
- Les chatbots `collect` et mono-source `inform` restent légers.
- Les sources A/B/C sont labellisables et décrivables.
- Les titres de connaissances doivent être clairs et uniques ; aucun champ
  description n'est ajouté par entrée. La qualité du routage des connaissances
  dépend donc de la qualité éditoriale des titres.
- Une demande mixte lance les sources en parallèle.
- `inform` ne peut pas collecter.
- `hybrid` ne collecte pas par accident.
- Les médias deviennent accessibles au modèle, pas seulement affichés.
- Les sources sont versionnées et éditables au même endroit.
- La génération IA ne produit plus systématiquement un chatbot collect-only.

### Négatives

- Un appel IA d'analyse d'intention est ajouté **seulement quand le plan
  runtime l'exige** (hybrid ou inform multi-source).
- Migration de configuration et de données nécessaire.
- Le mode `hybrid` doit gérer une intention par tour.
- Les médias restent limités aux métadonnées, pas à l'analyse visuelle.
- Le coût augmente si plusieurs sources sont activées.
- Les templates visuels doivent continuer à lire `link.sources` ou être migrés.

## Alternatives écartées

### Conserver `search` comme mission

`search` ne décrit qu'une source. Il ne permet pas de représenter les
connaissances et les médias comme sources d'information.

### Déduire la mission de la présence d'une fiche de collecte

C'est la cause du biais actuel. Une fiche de collecte ne signifie pas que
l'utilisateur veut collecter.

### Déclencher la recherche par des mots-clés

Trop fragile, multilingue et dépendant des fautes. L'analyse d'intention
structurée est préférée.

### Laisser le modèle appeler les sources séquentiellement dans une boucle

Une demande mixte doit lancer les sources en parallèle. Un orchestrateur de
sources est plus fiable et plus rapide qu'une boucle d'outils séquentielle.

### Utiliser un outil `start_collection`

Un outil dédié ne résout pas les demandes mixtes et ne remplace pas une analyse
d'intention. L'intention `collect` est décidée avant la réponse.

### Faire des médias un simple affichage post-réponse

Le média ne serait pas une source accessible. Le mode `on_demand` est retenu
pour `inform` et `hybrid`.

## Suivi

- Évaluer la précision de l'analyse d'intention sur un jeu de messages mixtes.
- Mesurer le taux d'appel de chaque source et le coût réel.
- Vérifier qu'aucune conversation `inform` ne crée de fiche.
- Vérifier que `hybrid` ne collecte pas sans intention explicite.
- Vérifier que les sources parallèles ne se bloquent pas mutuellement.
- Nettoyer les fiches de collecte dupliquées (`concierge-hotel-2`, `-3`) et
  avertir lorsqu'une portée de recherche cible une fiche sans instance.
