# 0082. Collecte semi-heuristique — formulaire assisté et ciblage des instances de fiche

- **Statut** : Proposé
- **Date** : 2026-11-09
- **Décideurs** : équipe projet
- **Référence** : ADR-0019, ADR-0049, ADR-0059, ADR-0068.
- **Complète** : ADR-0049, ADR-0059, ADR-0068.
- **Remplace** : aucune.

## Contexte

Les chatbots disposent aujourd'hui de :

- `behaviorMode` : `guided` ou `expert`, qui définit la source du prompt ;
- `mission` : `collect`, `inform` ou `hybrid` ;
- un fallback heuristique utilisé lorsque l'IA est indisponible ;
- des fiches de collecte mono ou multi ;
- un remplissage progressif des instances en multi-fiches.

Le formulaire de collecte existe déjà dans le template Starter, mais il n'est
accessible que dans le fallback heuristique. Il ne permet pas de couvrir le cas
où l'IA est disponible et où l'on souhaite malgré tout que le visiteur remplisse
un formulaire structuré.

Le besoin exprimé est un mode **semi-heuristique** :

- l'IA reste disponible ;
- le bouton d'ouverture du formulaire reste disponible ;
- l'IA ne collecte pas les champs un par un ;
- l'IA invite le visiteur à ouvrir le formulaire et explique les champs à la
  demande ;
- le formulaire remplit la bonne instance de fiche, y compris en multi-fiches.

Les contraintes sont :

- ne pas modifier les modes `guided` et `expert` ;
- ne pas modifier le fallback heuristique existant ;
- supporter le multi-fiches dès le départ ;
- ne pas ouvrir automatiquement le formulaire ;
- conserver le bouton « Terminer » comme seul déclencheur de la fiche finale ;
- ne jamais collecter les données du visiteur par extraction de texte en
  semi-heuristique.

## Décision

### 1. Une stratégie de collecte orthogonale aux modes de comportement

Ajouter :

```ts
type ChatbotCollectionMode = "ai" | "semi_heuristic";
```

- `ai` est la valeur par défaut et conserve le comportement actuel ;
- `semi_heuristic` active le formulaire assisté ;
- `collectionMode` n'est pas un `behaviorMode` : `guided` et `expert`
  continuent de définir uniquement la construction du prompt ;
- `semi_heuristic` n'est valide que pour `mission = collect | hybrid` et avec
  au moins une fiche ;
- `semi_heuristic` est refusé pour `mission = inform` ou sans fiche ;
- les configurations existantes restent en `ai` sans migration de données.

Le choix est conservé dans le snapshot versionné de la configuration. Le
stockage est une colonne additive `collection_mode` avec la valeur par défaut
`ai` ; aucune colonne existante n'est modifiée.

### 2. Bouton dans le chat, jamais ouvert automatiquement

En `semi_heuristic` :

- le bouton « Remplir le formulaire » est affiché dans l'environnement du chat
  dès son ouverture ;
- il n'est jamais affiché en dehors du chat ;
- il n'ouvre jamais le formulaire automatiquement ;
- il n'ouvre le formulaire que sur action explicite du visiteur.

L'identification est gérée en amont de l'accès au chat. Si le lien exige une
identification, le visiteur ne voit le chat qu'après celle-ci : aucun état
spécifique « bouton désactivé avant identification » n'est nécessaire.

Si le lien est anonyme, l'hôte crée la session au premier clic si elle n'existe
pas encore. Aucune session n'est créée au seul affichage du bouton.

Le bouton est disponible dès le début du chat, même avant le premier message.

### 3. Multi-fiches : le formulaire cible une instance précise

Le formulaire ne dépend plus de `config.fiches[0]`.

- l'instance active est présélectionnée ;
- le visiteur peut choisir une autre fiche avant d'ouvrir le formulaire ;
- la fiche choisie devient l'instance cible ;
- l'instance cible devient active ;
- les autres instances conservent leurs données ;
- aucune donnée n'est mélangée entre deux fiches ;
- la soumission transporte explicitement l'identifiant de l'instance cible.

Si plusieurs fiches existent et qu'aucune instance active ne peut être résolue,
le formulaire demande explicitement une fiche. Il ne devine pas et ne prend pas
silencieusement la première.

Chaque instance conserve son `ficheKey`, son `status`, son `data` et son
`missingFields`.

### 4. Comportement de l'IA en semi-heuristique

L'IA reçoit une instruction de collecte semi-heuristique, ajoutée après le
prompt de base :

- présenter brièvement le formulaire ;
- inviter à cliquer sur « Remplir le formulaire » ;
- expliquer les champs, leurs options et leur utilité à la demande ;
- ne pas poser les questions de collecte une par une ;
- ne pas demander les valeurs des champs dans le fil ;
- ne pas afficher les clés techniques ;
- ne pas prétendre que la fiche est complète tant que le formulaire n'est pas
  rempli ;
- si le visiteur fournit des informations en texte : refuser poliment et lui
  demander de remplir le formulaire ;
- en `hybrid`, continuer à informer normalement, tout en rappelant que le
  formulaire est disponible pour la collecte.

L'instruction semi-heuristique est opérationnelle et prime sur le prompt pour
la partie collecte. Elle s'applique aussi bien en `guided` qu'en `expert`.

Elle ne réécrit pas le prompt stocké : `buildGuidedChatbotPrompt()` et le
`system_prompt` enregistré restent inchangés. Le bloc semi-heuristique est
ajouté au moment de construire le prompt effectif de la fiche. L'aperçu du
prompt doit donc afficher le prompt effectif, bloc semi-heuristique inclus.

### 5. Aucune collecte par extraction de texte en semi-heuristique

En `semi_heuristic` :

- `sendMessage()` ne doit pas appeler la détection/extraction qui remplit
  automatiquement les instances à partir du texte ;
- le texte du visiteur ne doit jamais écrire dans `instance.data` ;
- la génération finale ne doit pas utiliser l'extraction IA du texte pour
  compléter les champs ;
- seules la soumission du formulaire et les pièces jointes alimentent la fiche.

Le texte reste disponible pour l'information, la compréhension et l'explication
des champs, mais pas pour la collecte.

### 6. Le formulaire écrit dans l'instance active

La soumission du formulaire ne doit pas seulement écrire dans
`conversation_field_values`. Elle doit mettre à jour
`conversation_fiche_instances`.

Le flux est :

1. vérifier la conversation et le lien ;
2. résoudre la fiche cible :
   - instance explicitement fournie ;
   - sinon instance active ;
3. valider les valeurs contre les champs de cette fiche ;
4. fusionner les valeurs dans `instance.data` ;
5. recalculer `missingFields` ;
6. recopier éventuellement les valeurs dans `conversation_field_values` avec
   `fiche_instance_id` pour l'historique et l'affichage ;
7. refuser toute soumission sur une conversation finalisée.

L'API publique existante `/api/chat/fields` évolue vers une soumission de
collecte ciblée. Elle accepte un `ficheInstanceId` optionnel ; en mono-fiche,
l'instance active peut être résolue par défaut. En multi-fiches, l'absence
d'instance cible exploitable produit une erreur explicite.

Les valeurs restent validées par le moteur de champs existant. Les champs
fichier restent gérés par les pièces jointes existantes ; aucun binaire n'est
écrit dans l'instance.

Le panneau « Informations » et la génération finale lisent la même instance.

### 7. Contrat template et hôte

Le contrat template reçoit un état optionnel :

```ts
state.collectionForm?: {
  available: boolean;
  activeInstanceId: string | null;
  forms: {
    ficheKey: string;
    label: string;
    instanceId: string | null;
    status: string;
    fields: TemplateField[];
  }[];
}
```

Les actions évoluent de façon additive :

```ts
openCollectionForm({ ficheInstanceId?: string; ficheKey?: string })
submitCollection({ ficheInstanceId: string; values: Record<string, string> })
```

L'hôte :

- fournit le formulaire même quand l'IA est disponible ;
- ne crée pas de session au montage ;
- crée ou reprend la session au clic si nécessaire ;
- transmet la fiche cible ;
- rafraîchit l'état après soumission ;
- évite un doublon de bouton lorsque le fallback est actif.

Les templates qui ne déclarent pas le support du formulaire ne peuvent pas
activer le mode semi-heuristique. Les anciens templates continuent de
fonctionner avec `collectionMode = "ai"`.

Le template Starter est mis à jour et versionné en `1.6.6`.

### 8. Fallback heuristique conservé

Le fallback existant reste inchangé pour l'indisponibilité de l'IA :

- menu de questions/réponses fermées ;
- accès au formulaire ;
- aucun mot-clé interprété.

En semi-heuristique, le formulaire reste disponible lorsque le fallback est
actif. Le bouton du fallback et celui du mode semi-heuristique doivent être
fusionnés en un seul point d'entrée visuel.

### 9. Back-office

Le choix est ajouté dans l'étape « Collecte », et non dans « Comportement » :

```text
Guidée par l'IA
Semi-heuristique (formulaire)
```

Le choix est :

- visible uniquement pour `collect` et `hybrid` ;
- masqué ou désactivé pour `inform` ;
- désactivé pour un chatbot sans fiche ;
- désactivé pour un template sans support du formulaire ;
- par défaut à `ai` pour les brouillons et les configurations existantes.

Le libellé d'aide précise que l'IA ne collecte plus les champs en texte et que
le formulaire est la seule source de collecte.

### 10. Génération finale

Le formulaire ne crée pas la fiche finale. Le clic « Terminer » reste le seul
déclencheur.

En semi-heuristique, la génération finale utilise :

- `instance.data` de l'instance cible ;
- les pièces jointes de la conversation ;
- les données serveur habituelles.

Elle n'utilise pas l'extraction IA du texte pour compléter les champs.

Si des champs obligatoires manquent, la génération échoue avec une erreur
explicite et le formulaire reste disponible.

## Conséquences

### Positives

- le mode semi-heuristique est explicite et indépendant de `guided`/`expert` ;
- le formulaire est disponible même quand l'IA fonctionne ;
- le multi-fiches est supporté sans mélange de données ;
- l'IA ne collecte plus les champs en texte, ce qui évite les contradictions ;
- la source de vérité de la fiche est claire : l'instance ;
- le fallback existant reste compatible ;
- aucune régression pour les configurations en `ai`.

### Négatives

- ajout d'une colonne et d'une migration additive ;
- complexité supplémentaire dans le contrat template et l'hôte ;
- le formulaire doit gérer le choix de fiche en multi-fiches ;
- le template Starter doit être mis à jour ;
- la génération finale doit ignorer l'extraction IA en semi-heuristique ;
- les tests doivent couvrir le mono, le multi, le fallback et le bouton dès le
  début du chat.

## Alternatives écartées

- **Ajouter un troisième `behaviorMode`** : mélange la construction du prompt et
  la stratégie de collecte ; écarté.
- **Réutiliser le fallback heuristique** : sémantique et interface différentes ;
  le fallback doit rester réservé aux pannes IA ; écarté.
- **Limiter le mode à la mono-fiche** : ne répond pas au besoin ; écarté.
- **Continuer à extraire les champs du texte en semi-heuristique** : contredit
  le refus poli et la demande de formulaire ; écarté.
- **Écrire uniquement dans `conversation_field_values`** : la génération finale
  peut ignorer les valeurs ; écarté.
- **Ouvrir automatiquement le formulaire** : non demandé et intrusif ; écarté.
- **Nettoyer les sorties par sanitizer** : rustinage des variantes de texte ;
  la correction doit être structurelle ; écarté.

## Critères d'acceptation

- une configuration sans `collectionMode` reste en `ai` ;
- `semi_heuristic` est refusé pour `inform` et pour un chatbot sans fiche ;
- le bouton est affiché dans le chat dès son ouverture, sans ouverture
  automatique ;
- aucun formulaire ne s'ouvre avant identification ;
- en multi-fiches, l'instance active est présélectionnée et une autre fiche
  peut être choisie ;
- le formulaire écrit dans la bonne instance et ne mélange pas les fiches ;
- le panneau « Informations » reflète les valeurs du formulaire ;
- l'IA explique les champs à la demande et ne les collecte pas un par un ;
- les informations données en texte ne remplissent pas l'instance ;
- la génération finale n'extrait pas les champs du texte en semi-heuristique ;
- « Terminer » reste le seul déclencheur de la fiche finale ;
- le fallback heuristique reste fonctionnel ;
- les tests et la validation préprod passent ;
- la production n'est mise à jour qu'après validation explicite.
