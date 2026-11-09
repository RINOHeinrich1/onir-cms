# 0083. Composition générique de fiches — relations 1..1 et 1..n

- **Statut** : Proposé
- **Date** : 2026-11-09
- **Décideurs** : équipe projet
- **Référence** : ADR-0049, ADR-0059, ADR-0082.
- **Complète** : ADR-0049, ADR-0082.
- **Remplace** : la rédaction précédente de l'ADR-0083 fondée sur un type
  `lines` inline.

## Contexte

Les fiches de collecte sont des définitions réutilisables, indépendantes des
chatbots. Aujourd'hui, elles servent de fiches racine dans une conversation et
le multi-fiches permet plusieurs fiches racine.

Le besoin est de pouvoir **composer** une fiche à partir d'autres fiches, pour
représenter des documents ou opérations comportant plusieurs sous-éléments :

```text
fiche racine
- champ simple
- champ fiche            → 1..1
- champ tableau de fiches → 1..n
```

Une commande avec plusieurs produits n'est qu'un exemple. Le modèle doit être
générique et ne doit contenir aucune règle métier liée aux commandes, produits,
factures, réservations ou autres noms concrets.

Le choix retenu est :

- toutes les fiches de collecte sont réutilisables comme modèles ;
- il n'y a pas de séparation entre « fiche type » et « fiche collectable » ;
- une fiche peut être utilisée comme fiche racine ou comme sous-fiche ;
- une sous-fiche utilisée en composition est une **donnée imbriquée**, pas une
  instance active séparée ;
- la composition est une copie de données, pas une référence vivante à une
  autre instance.

## Décision

### 1. Un seul concept de fiche réutilisable

Toute `FicheDefinition` peut être :

- sélectionnée comme fiche racine dans un chatbot ;
- référencée par un champ `fiche` d'une autre fiche ;
- référencée par un champ `tableau_de_fiches` d'une autre fiche ;
- utilisée dans plusieurs fiches différentes.

Le rôle « racine » ou « sous-fiche » est un contexte d'utilisation, pas un type
de fiche distinct.

### 2. Deux types de champs

Ajouter deux types de champs génériques :

```ts
type: "fiche";
ficheKey: string;
```

```ts
type: "tableau_de_fiches";
ficheKey: string;
```

- `fiche` porte une relation **1..1** ;
- `tableau_de_fiches` porte une relation **1..n** ;
- `ficheKey` référence une fiche de collecte existante ;
- le libellé métier reste libre (`produit`, `participant`, `ligne`, etc.) ;
- aucun nom métier ne doit être codé dans le moteur.

Les libellés d'interface peuvent être :

- « Fiche liée (1..1) » ;
- « Tableau de fiches (1..n) ».

### 3. Composition, pas instance enfant

Une sous-fiche utilisée avec `fiche` ou `tableau_de_fiches` :

- ne crée pas de `conversation_fiche_instances` séparée ;
- ne devient pas une fiche active ;
- ne produit pas de fiche finale séparée ;
- vit dans `instance.data` de la fiche racine.

Exemple générique :

```json
{
  "champ_simple": "valeur",
  "champ_fiche": {
    "champ_enfant_1": "valeur",
    "champ_enfant_2": 2
  },
  "champ_tableau": [
    { "champ_enfant_1": "a", "champ_enfant_2": 5 },
    { "champ_enfant_1": "b", "champ_enfant_2": 2 }
  ]
}
```

La fiche finale est une seule fiche racine contenant ses données imbriquées.

### 4. Schéma et graphe de fiches

Ajouter une validation de graphe :

- la fiche référencée par `ficheKey` doit exister ;
- les références orphelines sont refusées ;
- les cycles sont interdits ;
- l'auto-référence est interdite ;
- la profondeur maximale d'imbrication est limitée ;
- une fiche utilisée par une autre ne peut pas être supprimée sans contrôle ;
- les champs d'une sous-fiche sont validés récursivement ;
- les tableaux imbriqués sont interdits ou limités explicitement selon la
  profondeur retenue.

La première version doit rester simple : une profondeur limitée et pas de
tableau dans un tableau.

### 5. Snapshot des sous-fiches

Lorsqu'une fiche est importée dans une configuration de chatbot, le snapshot
doit contenir les schémas des sous-fiches référencées, ou une résolution
versionnée équivalente.

Il ne faut pas dépendre d'une fiche mutable au moment de l'extraction.

Conséquences :

- une modification ultérieure d'une sous-fiche ne casse pas une configuration
  existante ;
- les versions restent immuables ;
- le prompt et la validation runtime disposent du schéma enfant.

Le stockage reste en JSONB :

- `fiche_collectes.fields` ;
- `fiche_collecte_versions.fields` ;
- `chatbot_configs.fiche_definitions` ;
- `conversation_fiche_instances.data`.

Aucune table SQL dédiée aux lignes ou sous-fiches n'est créée dans ce lot.

### 6. Extraction IA générique

L'extraction actuelle est plate :

- `buildFicheDetectionPrompt()` liste les fiches sans arbre ;
- `parseDetectedInstances()` accepte un `data` plat ;
- `normalizeFicheData()` convertit les valeurs en texte et ne préserve pas les
  tableaux ;
- `detectFicheInstances()` ne reçoit pas l'état actuel ;
- une sous-fiche pourrait être interprétée à tort comme une instance racine.

L'extraction doit devenir récursive et état-aware.

#### Prompt

Le prompt doit :

- résoudre récursivement les champs `fiche` et `tableau_de_fiches` ;
- inclure les champs des sous-fiches ;
- fournir l'état actuel de la fiche racine et de ses tableaux ;
- indiquer qu'une sous-fiche utilisée en composition n'est pas une instance
  racine ;
- demander une sortie imbriquée ;
- demander une clarification en cas d'ambiguïté ;
- ne jamais inventer de valeur ;
- ne jamais supprimer automatiquement une ligne.

Sortie attendue :

```json
{
  "instances": [
    {
      "ficheKey": "fiche_racine",
      "status": "active",
      "data": {
        "champ_simple": "valeur",
        "champ_fiche": { "champ_enfant": "valeur" },
        "champ_tableau": [
          { "champ_enfant_1": "a", "champ_enfant_2": 5 },
          { "champ_enfant_1": "b", "champ_enfant_2": 2 }
        ]
      },
      "missingFields": []
    }
  ]
}
```

#### Parseur

`parseDetectedInstances()` doit :

- accepter les objets et tableaux imbriqués ;
- conserver les nombres ;
- refuser les tableaux mal formés ;
- ne pas créer d'instance racine pour une sous-fiche ;
- ignorer les champs inconnus ;
- refuser les données non conformes au schéma enfant.

#### Normalisation

`normalizeFicheData()` doit être récursif :

- `text` → texte ;
- `number` → nombre ;
- `file` → ignoré dans la fiche ;
- `fiche` → objet enfant normalisé ;
- `tableau_de_fiches` → tableau d'objets enfants normalisés.

#### Fusion et état

L'IA doit recevoir l'état existant pour éviter de perdre des lignes sur une
conversation longue.

La stratégie initiale est :

- l'IA renvoie une mise à jour structurée du tableau ;
- le serveur valide et fusionne ;
- une clé de ligne peut être définie dans la sous-fiche pour distinguer les
  lignes ;
- les quantités sont des valeurs absolues, jamais des totaux calculés par
  l'IA ;
- les totaux sont recalculés côté serveur ;
- une suppression de ligne n'est possible que sur action explicite et en
  brouillon.

#### Clarification

Si une ligne est ambiguë ou incomplète :

```json
{
  "status": "needs_clarification",
  "question": "Question ciblée à poser au visiteur",
  "pending": {}
}
```

Aucune écriture en base n'est effectuée tant que la clarification n'est pas
résolue, ou seule une donnée temporaire explicitement prévue est conservée.

### 7. Formulaire semi-heuristique

Le formulaire doit accepter :

- un champ `fiche` rendu comme un sous-formulaire ;
- un champ `tableau_de_fiches` rendu comme un tableau ;
- l'ajout d'une ligne ;
- la modification d'une ligne ;
- la suppression d'une ligne en brouillon ;
- la validation par ligne ;
- l'envoi d'un tableau JSON.

Le formulaire ne doit pas contenir de composant spécifique à un métier.

### 8. Contrat template et rendu

Le contrat template et le SDK doivent transporter :

- le type `fiche` ;
- le type `tableau_de_fiches` ;
- la référence `ficheKey` ;
- le schéma enfant ou une ressource résolue.

Le rendu final doit savoir afficher :

- un objet imbriqué ;
- un tableau de fiches ;
- un tableau ou une liste selon le template.

Un `{{champ_tableau}}` ne doit jamais produire `[object Object]`.

### 9. Limites et garde-fous

- profondeur maximale d'imbrication ;
- nombre maximal de lignes ;
- pas de cycle ;
- pas d'auto-référence ;
- pas de suppression automatique par l'IA ;
- pas d'outils CRUD IA dans ce lot ;
- validation serveur obligatoire ;
- pas de totaux calculés par l'IA ;
- les fiches existantes sans composition restent valides ;
- les chatbots existants ne sont pas impactés.

## Modifications par niveau

| Niveau | Fichiers principaux | Modification |
|---|---|---|
| Domaine schéma | `src/domain/entities/chat-template.ts` | Types `fiche` / `tableau_de_fiches`, `ficheKey` |
| Domaine validation | `src/domain/template-schema.ts` | Validation récursive et références |
| Domaine fiches | `src/domain/entities/fiche-collecte.ts` | Validation de graphe, cycles, profondeur |
| Application fiches | `src/application/use-cases/fiches-collecte/manage-fiche-collectes.ts` | Contrôle des références et suppression |
| Snapshot config | `src/components/links/chatbot-config-draft.ts` | Embarquer ou résoudre les sous-schémas |
| Runtime données | `src/application/use-cases/chat/chatbot-config-runtime.ts` | `normalizeFicheData()` récursif, guides de champs |
| Extraction | `src/application/use-cases/chat/fiche-instances.ts` | Prompt arborescent, état, parseur, fusion |
| Validation données | `src/domain/validate-template-data.ts` | Validation récursive objets/tableaux |
| Formulaire/API | `src/application/use-cases/chat/submit-chat-collection.ts`, `src/app/api/chat/fields/route.ts` | Valeurs imbriquées et tableaux |
| Contrat template | `src/domain/template-contract.ts`, `packages/template-sdk/src/types.ts` | Champs `fiche` / `tableau_de_fiches` |
| Runtime template | `src/application/use-cases/visual-templates/link-template.ts`, `src/components/templates/TemplateHost.tsx` | Sous-formulaires et tableaux |
| Starter | `template-kit/template/src/widget.js`, `template-kit/template/src/index.js` | Rendu et édition génériques |
| Rendu final | `src/domain/template-variables.ts`, `src/application/use-cases/chat/finish-conversation.ts` | Objets/tableaux imbriqués, une fiche racine |
| Back-office | `src/components/fiches-collecte/FicheCollecteForm.tsx` | Paramétrage déjà ajouté ; édition imbriquée à compléter |
| Base de données | Aucune nouvelle table | JSONB existant |

## État actuel

Le paramétrage UI a été ajouté :

- types `fiche` et `tableau_de_fiches` ;
- sélection d'une fiche modèle ;
- stockage de `ficheKey` dans les champs.

L'extraction, la collecte, le formulaire runtime, le rendu et la génération
finale ne sont **pas encore** adaptés à la composition.

## Tests génériques

Les tests ne doivent pas dépendre du cas commande/produit. Utiliser plusieurs
couples indépendants :

- `conteneur` + `élément` ;
- `dossier` + `participant` ;
- `facture` + `ligne` ;
- `réservation` + `voyageur` ;
- `projet` + `tâche`.

Cas à couvrir :

- une fiche racine avec un champ `fiche` 1..1 ;
- une fiche racine avec un `tableau_de_fiches` 1..n ;
- une sous-fiche réutilisée dans deux fiches ;
- des données imbriquées valides ;
- un tableau invalide ;
- une référence orpheline ;
- un cycle ;
- une sous-fiche qui ne doit pas devenir une instance racine ;
- une extraction IA avec plusieurs lignes ;
- une clarification ;
- un formulaire avec ajout/suppression de lignes ;
- un rendu final avec tableau ;
- une fiche plate existante non impactée.

## Alternatives écartées

- **Type `lines` avec `itemFields` inline** : duplique les schémas et ne permet
  pas la réutilisation ; remplacé par la composition de fiches.
- **Créer une instance active par sous-fiche** : lifecycle et statuts inutiles
  pour une composition ; écarté.
- **Référence vivante vers une fiche mutable** : risque de rupture des
  configurations ; snapshot privilégié.
- **Outils CRUD IA** : complexité, idempotence et audit prématurés ; écarté.
- **Suppression automatique par l'IA** : risque métier ; écarté.

## Critères d'acceptation

- une fiche peut être racine et sous-fiche ;
- un champ `fiche` produit un objet imbriqué ;
- un champ `tableau_de_fiches` produit un tableau d'objets ;
- aucune instance enfant n'est créée ;
- les cycles et références orphelines sont refusés ;
- l'extraction reçoit l'état actuel ;
- les tableaux sont conservés par la normalisation ;
- les tableaux sont validés côté serveur ;
- le formulaire peut ajouter et supprimer des lignes en brouillon ;
- le rendu final affiche les données imbriquées ;
- les tests génériques passent ;
- aucun nom métier spécifique n'est codé dans le moteur.
