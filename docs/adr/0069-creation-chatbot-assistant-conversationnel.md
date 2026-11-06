# 0069. Création de chatbot par assistant conversationnel — intake, génération et revue

- **Statut** : Accepté
- **Date** : 2026-11-06
- **Décideurs** : équipe projet
- **Référence** : ADR-0038, ADR-0039, ADR-0049, ADR-0052, ADR-0055, ADR-0059, ADR-0060, ADR-0065, ADR-0067, ADR-0068.
- **Complète** : ADR-0060 (création assistée), ADR-0068 (missions et sources).
- **Remplace** : aucune.

## Contexte

La création assistée actuelle est **mono-tour** : l'utilisateur ouvre
`/liens/nouveau`, renseigne une description, éventuellement un site et des
documents, puis l'IA produit un brouillon complet en un appel. Ce brouillon est
ensuite appliqué au wizard existant.

Cette expérience est fiable pour préremplir un formulaire, mais elle ne permet
pas :

- d'ouvrir l'assistant IA indépendamment de la création manuelle d'un chatbot ;
- de conduire un échange naturel pour recueillir les informations manquantes ;
- de distinguer clairement les informations obligatoires, optionnelles et les
  valeurs par défaut ;
- de confirmer la mission (`collect`, `inform`, `hybrid`) avant de générer ;
- de préserver les choix de sources et de sélection de données lors d'une
  régénération.

L'objectif est de reproduire la **grammaire d'interaction d'une collecte de
données** — questions, réponses, pièces jointes, progression — mais pour
produire un **chatbot complet** au lieu d'une fiche.

`behaviorMode` n'est pas un champ métier du chatbot : c'est un mode d'édition de
la configuration de comportement (`guided` / expert). Il ne fait pas partie du
brief conversationnel et ne doit pas être demandé par l'assistant.

## Décision

### 0. Vue d'ensemble

La conversation et la génération sont deux étapes distinctes :

```text
Conversation d'intake
  → ChatbotBuildBrief (état validé)
  → RequirementResolver (prérequis déterministes)
  → génération IA du brouillon
  → validation serveur
  → revue utilisateur
  → création via le parcours existant
```

Le runtime des chatbots clients n'est pas modifié. Le builder est un module
applicatif interne, sans lien avec une conversation publique.

### 1. Architecture cible

```text
UI — ChatbotBuilderDialog
   ↓
API — /api/chatbots/ai/builder/*
   ↓
Application — chatbot-builder
   ├─ Intake IA (questions / extraction)
   ├─ RequirementResolver (règles déterministes)
   ├─ generateChatbotAiDraft (existant, enrichi)
   └─ mapping vers ChatbotConfigDraft (existant)
   ↓
Domain — ChatbotBuildBrief / ChatbotBuildSession
   ↓
Persistance — port ChatbotBuildSessionRepository
   ↓
Briques existantes : chatbot_drafts, génération IA, parseur,
création de lien, quotas IA, extraction site/documents
```

Nouveaux éléments :

- domaine `ChatbotBuildBrief`, `ChatbotBuildSession`, `RequirementResolver` ;
- use cases `start-build-session`, `continue-build-session`,
  `generate-chatbot-from-brief`, `finalize-build-session` ;
- port `ChatbotBuildSessionRepository` ;
- routes API dédiées ;
- UI `ChatbotBuilderDialog` et panneau de synthèse.

Aucune couche existante n'est remplacée. Le générateur actuel reste la seule
voie de production du brouillon.

### 2. `ChatbotBuildBrief`

Le brief est le contrat entre la conversation et la génération. Il ne contient
que des choix validés côté serveur.

```ts
type ChatbotBuildBrief = {
  description: string | null;
  mission: "collect" | "inform" | "hybrid" | null;

  identity: {
    label: string | null;
    role: string | null;
    objective: string | null;
  };

  sources: {
    websiteUrl: string | null;
    documents: Array<{ name: string; size: number }>;
    intent: {
      fiches: boolean;
      connaissances: boolean;
      medias: boolean;
    };
    ficheTypes: string[];
    mediaTypes: Array<"photo" | "lien">;
  };

  collectionGoal: string | null;

  behavior: {
    language: { mode: "auto" } | { mode: "fixed"; value: string };
    tone: string;
    guardrails: string[];
    extraInstructions: string;
  };

  publication: {
    page: boolean;
    widget: boolean;
    templateId: string | null;
    templateVersion: string | null;
  };

  limits: {
    replyMaxTokens: number;
    maxFiches: number | null;
    maxTokens: number | null;
    expiresAt: string | null;
  };

  overrides: {
    aiProviderId: string | null;
    aiModel: string | null;
    aiUsage: Record<string, unknown>;
  };
};
```

### 3. `ChatbotBuildSession`

La session conserve la conversation et l'état courant. Les messages ne sont
jamais exécutés : ils sont traités comme des données non fiables.

```ts
type ChatbotBuildSession = {
  id: string;
  organizationId: string;
  createdBy: string;
  status: "collecting" | "ready" | "generating" | "review" | "done" | "abandoned";
  messages: Array<{ role: "assistant" | "user"; content: string }>;
  brief: ChatbotBuildBrief;
  missingMandatory: RequirementKey[];
  draft: ChatbotAiDraft | null;
  generationId: string | null;
  warnings: string[];
  version: number;
};
```

### 4. Prérequis et champs

Le `RequirementResolver` est déterministe et fait autorité. L'IA peut proposer,
mais elle ne décide pas seule qu'un prérequis est satisfait.

| Élément | Statut | Décision |
|---|---|---|
| Description / besoin | **Obligatoire** | Utilisateur ; l'IA demande si absent |
| Mission | **Obligatoire** | IA propose, utilisateur confirme ; demande si ambiguë |
| Nom du chatbot | **Obligatoire dans la config** | IA propose ; utilisateur peut corriger |
| Source d'information | **Obligatoire si `inform` ou `hybrid`** | Utilisateur : site, documents, fiches existantes ou médias |
| Objectif de collecte | **Obligatoire si `collect` ou `hybrid`** | Utilisateur ; l’IA propose ensuite les champs, qui sont validés à la génération |
| `ficheTypes` | **Obligatoire si source A active** | **Utilisateur uniquement** — jamais l'IA |
| Prospect | **Obligatoire si lien spécifique** | Utilisateur ; défaut standard |
| Template visuel | **Obligatoire si widget actif** | Utilisateur ; défaut premier template compatible |
| Canal | **Au moins un** | Utilisateur ; défaut page activée |
| Rôle / objectif | Optionnel | IA propose ; défaut ou personnalisation |
| Langue | Optionnel | IA propose ; défaut `auto` |
| Ton / garde-fous | Optionnel | IA propose ; défaut ou personnalisation |
| Fallback | Optionnel | IA propose ; défaut désactivé |
| `dataSelection` | Optionnel | Défaut `selected`, jamais `all` sur une génération IA |
| Quotas | Optionnel | Utilisateur ; défaut illimité |
| Expiration | Optionnel | Utilisateur ; défaut aucune |
| `replyMaxTokens` | Optionnel | Utilisateur ; défaut 400 |
| Affectation IA / overrides | Optionnel | Utilisateur ; défaut organisation |
| Confidentialité | Optionnel | Utilisateur ; défaut première active |
| `behaviorMode` | **Pas un champ du brief** | UI uniquement ; `guided` par défaut |

Les champs optionnels ne sont **pas demandés spontanément**. L'IA les
personnalise seulement si l'utilisateur le demande explicitement ; sinon les
valeurs par défaut sont affichées et modifiables dans le panneau de synthèse.

### 5. Conversation d'intake

L'assistant pose **une seule question obligatoire à la fois**. Il peut proposer
des réponses rapides, mais l'utilisateur peut toujours répondre librement.

Ordre préférentiel :

1. besoin métier ;
2. mission ;
3. identité (nom proposé, description) ;
4. sources ;
5. objectif de collecte (si applicable), puis champs proposés à la génération ;
6. comportement (valeurs par défaut) ;
7. revue avant génération.

Chaque tour renvoie :

```ts
type BuildTurnResult = {
  reply: string;
  brief: ChatbotBuildBrief;
  missingMandatory: RequirementKey[];
  ready: boolean;
  suggestions: string[];
  warnings: string[];
};
```

Le client envoie uniquement le message utilisateur. Le serveur recalcule le
brief, les prérequis et l'état. Aucun patch client n'est accepté sans
validation serveur.

### 6. Génération

Lorsque `missingMandatory` est vide :

1. le brief est figé dans la version courante ;
2. le site et les documents sont traités par les lecteurs existants ;
3. `generateChatbotAiDraft` est appelé avec le brief enrichi et les messages
   utilisateur du brief (`briefMessages`), afin de ne pas perdre les faits
   fournis dans la conversation ;
4. la sortie est validée par `parseChatbotAiDraft` ;
5. le brouillon est converti en `ChatbotConfigDraft` ;
6. l'utilisateur passe en revue, puis crée le chatbot via le parcours existant.

Le générateur doit désormais produire explicitement :

```json
{
  "mission": "collect | inform | hybrid",
  "sourceIntent": {
    "fiches": true,
    "connaissances": true,
    "medias": false
  }
}
```

`sourceIntent` exprime une intention. Les `ficheTypes` restent choisies par
l'utilisateur dans la bibliothèque.

### 7. Compatibilité avec les sources existantes

#### 7.1 Récupération des connaissances

La récupération des connaissances depuis un site ou des documents reste
inchangée :

- lecture du site via le crawler existant ;
- extraction des documents via l'extracteur existant ;
- création de connaissances candidates déterministes à partir des pages et
  documents exploitables ;
- fusion avec les connaissances proposées par l'IA ;
- déduplication par titre ;
- limites et avertissements existants conservés.

La conversation ne remplace donc pas l'extraction : elle prépare le brief, puis
la génération utilise les mêmes briques qu'aujourd'hui.

#### 7.2 Génération de fiche depuis un site ou des documents

La génération de fiche reste possible :

- le contenu du site et des documents est toujours fourni au générateur ;
- l'IA peut proposer des champs de collecte à partir de ces sources ;
- la fiche de collecte est créée si la mission l'autorise et si des champs sont
  proposés ;
- le rendu et le prompt sont construits par les fonctions existantes.

En revanche, la mission filtre la sortie :

- `collect` : fiche de collecte autorisée ; aucune source d'information active ;
- `inform` : aucune fiche de collecte, aucun champ de collecte ; les sources
  d'information sont actives ;
- `hybrid` : fiche de collecte et source(s) d'information.

Une source site/document utilisée pour générer les champs d'un chatbot
`collect` ne devient pas une source runtime : les connaissances extraites ne
sont pas rattachées au chatbot dans cette mission. Elles peuvent rester dans le
brief pour une éventuelle bascule vers `hybrid`, mais elles ne sont pas créées
comme connaissances actives si la mission finale est `collect`.

#### 7.3 Fiches existantes

La source A « fiches existantes » est une source de **lecture**. Elle ne
concerne jamais la fiche de collecte :

- en `inform`, elle est optionnelle ; si elle est activée, l'utilisateur doit
  sélectionner les `ficheTypes` ;
- en `hybrid`, elle est optionnelle et suit les mêmes règles ;
- en `collect`, elle est interdite.

L'IA peut exprimer l'intention « utiliser les fiches existantes », mais elle ne
choisit jamais les clés.

### 8. Règles métier par mission

Ces règles sont bloquantes côté serveur et côté UI.

| Mission | Fiche de collecte | Sources d'information | Recherche de fiches | Connaissances |
|---|---|---|---|---|
| `collect` | **Au moins une fiche / un champ** | **Aucune** | **Interdite** | **Non rattachées** |
| `inform` | **Aucune** | **Au moins une** | Optionnelle, avec `ficheTypes` choisis | Autorisées |
| `hybrid` | **Au moins une fiche / un champ** | **Au moins une** | Optionnelle, avec `ficheTypes` choisis | Autorisées |

Règles complémentaires :

- `mission` est obligatoire ;
- une configuration `collect` avec une source active est refusée ;
- une configuration `inform` avec une fiche de collecte est refusée ;
- une configuration `hybrid` sans fiche de collecte ou sans source active est
  refusée ;
- source A active ⇒ `searchTool.enabled = true` et `ficheTypes.length >= 1` ;
- source A absente ⇒ `searchTool` désactivé et `ficheTypes = []` ;
- en `inform`, aucune question de collecte n'est générée ni posée au runtime ;
- en `inform`, la source A « fiches existantes » est **désactivée par défaut** ;
  elle n'est proposée qu'à la demande explicite de l'utilisateur, avec
  sélection manuelle des `ficheTypes` ;
- si l'IA propose des champs pour une mission `inform`, ces champs sont ignorés
  avec un avertissement et aucune fiche n'est créée ;
- si l'IA propose une source pour une mission `collect`, cette intention est
  ignorée avec un avertissement et aucune source active n'est créée ;
- en `hybrid`, une intention `inform` n'exécute pas de collecte et une intention
  `collect` n'exécute pas de source d'information ;
- les médias ne sont jamais créés automatiquement ; une source média doit être
  choisie explicitement ;
- une fiche de collecte n'est pas une connaissance et ne peut pas être utilisée
  comme source d'information.

### 9. Sélection de données et transaction

Pour un chatbot généré :

- `dataSelection.mode = "selected"` ;
- les connaissances issues du site/documents sont créées avec
  `chat_link_ids = [nouveauLienId]` ;
- les IDs créés sont ajoutés à `dataSelection.connaissanceIds` ;
- `dataSelection.mode = "all"` est interdit par défaut pour une génération IA ;
- la création du lien, de la configuration et des connaissances se fait dans la
  même transaction ;
- un échec annule l'ensemble : aucun chatbot partiel, aucune connaissance
  orpheline.

Si l'utilisateur choisit explicitement des connaissances globales, elles sont
ajoutées à la sélection ; elles ne sont jamais activées par défaut.

### 10. Persistance et reprise

En V1, la session est persistée dans `chatbot_drafts.state.builder` derrière un
port `ChatbotBuildSessionRepository`. Cela permet :

- la reprise après fermeture de la modale ;
- la réutilisation du nettoyage et de la liste des brouillons ;
- l'absence de migration supplémentaire ;
- un remplacement ultérieur par une table dédiée sans changer l'UI.

Les **fichiers binaires** ne sont pas persistés en V1. Le brief conserve leurs
métadonnées ; après un rechargement, l'utilisateur doit les rattacher à nouveau
avant la génération. Le site, les textes et l'état de la conversation sont
persistés.

### 11. UI / UX

#### 11.1 Entrée indépendante

Le builder ne dépend plus de `/liens/nouveau`. Il est accessible :

- depuis `/liens` avec un bouton **« Créer avec l'IA »** ;
- depuis une action rapide du dashboard ;
- depuis l'option « Créer un chatbot avec IA » du widget d'assistance flottant.

Il ouvre une **modale indépendante**. Le wizard manuel reste disponible.

#### 11.2 Desktop

Modale large en deux colonnes :

- conversation à gauche : messages, pièces jointes, réponses rapides,
  indicateur de saisie ;
- synthèse à droite : sections « Besoin », « Mission », « Sources »,
  « Collecte », « Comportement », « Publication » ;
- badges **Requis**, **Optionnel**, **Valeur par défaut** ;
- CTA **« Générer le chatbot »** désactivé tant qu'un prérequis manque, avec
  affichage du motif.

#### 11.3 Mobile

- modale plein écran ;
- conversation en pleine hauteur ;
- synthèse en bottom sheet ;
- composer et CTA sticky ;
- reprise avec bandeau « Reprendre la création ».

#### 11.4 Revue après génération

L'utilisateur voit :

- le résumé structuré du chatbot : identité, mission, sources, collecte,
  comportement, publication, limites et connaissances générées ;
- les avertissements de crawl/extraction ;
- les valeurs par défaut appliquées ;
- les actions **Créer le chatbot**, **Le garder en brouillon**, **Régénérer**
  et **Annuler**.

La génération ne crée ni brouillon ni chatbot automatiquement. Le résultat reste
en mémoire jusqu'au choix explicite :
- **Créer le chatbot** crée directement le lien avec la configuration générée ;
- **Le garder en brouillon** enregistre un brouillon visible sans créer de
  chatbot ;
- **Régénérer** revient à la conversation sans persister le résultat ;
- **Annuler** ferme et abandonne le résultat généré.

### 12. API

```text
POST /api/chatbots/ai/builder/sessions
POST /api/chatbots/ai/builder/sessions/:id/messages
POST /api/chatbots/ai/builder/sessions/:id/generate
DELETE /api/chatbots/ai/builder/sessions/:id
```

Le tour de conversation renvoie le brief validé, les prérequis manquants et
l'état `ready`. La génération accepte les fichiers éventuels et retourne le
brouillon validé, les sources traitées et les avertissements.

### 13. Sécurité et limites

- messages, description, site et documents sont des données non fiables ;
- aucun outil n'est exécuté à partir d'un message ;
- validation serveur de chaque patch de brief ;
- rate limit par utilisateur ;
- consentement explicite avant envoi des sources au fournisseur IA ;
- limites existantes conservées : 5 fichiers, 10 Mo/fichier, 50 Mo au total,
  5 pages par défaut, profondeur 1, pas de JavaScript, mêmes formats ;
- aucun document ni clé API dans les logs ;
- usage IA tracé en `assistant` et quotas appliqués par la factory existante.

## Conséquences

### Positives

- création de chatbot accessible sans passer par le wizard manuel ;
- expérience naturelle, progressive et explicite sur les prérequis ;
- distinction nette entre obligatoire, optionnel et valeurs par défaut ;
- mission et sources alignées avec ADR-0068 ;
- réutilisation complète des extracteurs, du générateur, du parseur et de la
  création transactionnelle ;
- sélection de connaissances plus sûre (`selected` au lieu de `all`) ;
- reprise possible de la conversation.

### Négatives

- ajout d'un orchestrateur conversationnel et d'un prompt d'intake ;
- coût d'un appel IA par tour de conversation ;
- les documents doivent être rattachés à nouveau après un rechargement en V1 ;
- le builder ne génère pas encore plusieurs fiches de collecte : une fiche au
  maximum, comme le générateur actuel ;
- les sources A/C restent des choix utilisateur, ce qui demande une étape de
  sélection explicite.

## Alternatives écartées

- **Garder uniquement la génération mono-tour** : ne permet pas de recueillir
  les prérequis manquants ni de confirmer la mission.
- **Créer directement le chatbot après le premier message** : risque de
  configuration incomplète ou incorrecte.
- **Laisser l'IA choisir les `ficheTypes`** : contraire à l'ADR-0068.
- **Réutiliser le runtime de conversation publique** : mélange des
  responsabilités et complexité inutile.
- **Créer les connaissances globalement** : fuite de contexte entre chatbots.
- **Forcer `dataSelection.mode = "all"`** : trop permissif et non conforme à
  l'ADR-0060.
- **Générer automatiquement des médias** : hors périmètre et risque de données
  non maîtrisées.
