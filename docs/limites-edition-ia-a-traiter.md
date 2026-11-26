# Limites de l’édition assistée par IA à traiter

- **Statut** : ouvert
- **Date** : 2026-11-26
- **Périmètre** : édition assistée des templates visuels ONIR-CMS (ADR-0108, ADR-0109)
- **Principe** : ne pas corriger ces limites par du prompt spécifique. Le prompt de base reste générique ; les skills de template porteront la sémantique métier (ADR-0110).

## 1. Preuve issue de l’audit réel

Session observée : `323feade-5ac5-4117-a3d6-acc2f8afc82e`.

Demandes :

- « branche service à une nouvelle page de service contenant la liste de notre service » ;
- « change le couleur du bouton “Nous contacter” en marron » ;
- « non ce n'est pas encore appliqué, je viens de sélectionner le bouton ».

Constats :

- la cible reste `hero_main` alors que le texte parle du bouton ;
- la proposition de style crée un `style_profile`, puis réécrit `style_id` avec un ID fourni par l’IA ;
- `proposal_applied` change bien le hash des paramètres ;
- le rendu ne change pas, car `style_id` pointe vers un ID inexistant ;
- un `user_message` n’a pas d’événement terminal ;
- un message utilisateur est dupliqué ;
- l’erreur de génération est désormais auditée, mais sans réponse brute de l’IA.

## 2. P0 — Intégrité référentielle

### Problème

Une proposition peut être structurellement valide mais laisser une référence cassée.

Dans l’audit :

```text
insert style_profile          → vrai ID généré par l’hôte
bindTo hero_main.style_id     → pointe vers le vrai ID
set hero_main.style_id        → écrase avec "hero_main_btn_style"
```

`"hero_main_btn_style"` n’existe pas dans `style_profiles`.

### Preuves code

- `src/domain/template-structure-operations.ts:81-82` : `addCollectionItem` ignore l’`id` fourni et génère un nouvel ID.
- `src/domain/template-edit-proposal.ts:372-399` : `insert` accepte `values` puis `bindTo`, mais n’interdit pas un `set` ultérieur vers un ID inventé.
- `src/domain/template-editor.ts:1138-1181` : validation des IDs de collections et doublons uniquement.
- `src/domain/template-editor.ts:1184+` : validation des placements, pas des références métier.

### À faire

- Valider toutes les références déclarées après application :
  - `style_id`, `action_id`, `parent_id`, références polymorphes, etc.
- Rejeter les références vers un ID absent.
- Interdire les IDs fournis par l’IA dans les opérations d’insertion, ou les ignorer formellement et interdire leur réutilisation.
- Ajouter un test de non-régression sur le scénario `style_profile` + `bindTo` + `set`.

## 3. P0 — Corrélation des tours et idempotence

### Problème

Un `user_message` peut rester sans `proposal_created`, `error` ou `not_found`.  
Un même message peut être enregistré deux fois.

### Preuves audit

- `user_message` à `13:51:44` sans événement terminal ;
- même message à `13:53:22` ;
- un seul `error` à `13:53:29`.

### À faire

- Ajouter un `turnId` commun à tous les événements d’un même tour.
- Ajouter un `clientMessageId` pour l’idempotence.
- Garantir un événement terminal par tour :
  - `proposal_created` ;
  - `error` ;
  - `not_found` ;
  - `ambiguous`.
- Marquer explicitement les messages appliqués (`appliedAt`, `appliedBy`).

## 4. P1 — Sélection persistante vs intention textuelle

### Problème

La sélection d’inspection reste envoyée à chaque tour et peut rester la cible implicite alors que l’utilisateur nomme autre chose.

### Preuves code

- `src/components/assistant/DisplayEditAssistantDrawer.tsx:90-91` : envoi systématique de `context.selectedRegion`.
- `src/domain/template-edit-resolver.ts:434-448` : la sélection est injectée comme candidate à score 1.
- `src/application/use-cases/visual-templates/rank-template-edit-candidates.ts:116-123` : l’IA peut encore choisir cette sélection.

### À faire

- Distinguer :
  - « ce bouton », « ici », « cet élément » → sélection prioritaire ;
  - cible nommée explicitement → le texte prime ;
  - aucune cible → demander une désambiguïsation.
- Ne pas conserver une sélection comme cible implicite après un changement d’intention.
- Tester le scénario « sélection hero_main + demande bouton Nous contacter ».

## 5. P1 — Observabilité des erreurs IA

### Problème

L’audit contient l’erreur applicative, mais pas de quoi reproduire précisément le refus.

### Preuves code

- `src/application/use-cases/visual-templates/generate-template-edit-proposal.ts:113-131` : erreurs génériques.
- L’événement `error` contient le message, pas la réponse brute ni le JSON refusé.

### À faire

- Stocker dans l’audit :
  - réponse brute de l’IA ;
  - JSON proposé ;
  - résultat de validation ;
  - provider/modèle ;
  - `errorName` utile.
- Ne jamais exposer ces données au client sans contrôle.

## 6. P1 — Skills de template

### Problème

Le prompt de base doit deviner des compositions que le template connaît.

Exemples observés :

- création d’une page + menu item + liaison ;
- choix du bon bouton enfant ;
- signification de « fond » et des couleurs ;
- création d’une copie locale de style.

### À faire

- Faire porter ces connaissances par le template via des skills installés avec la version.
- Garder le core générique : validation, références, audit et exécution.
- Voir ADR-0110.

## 7. P1 — Couplage structurel du core

### Problème

Le core utilise encore des heuristiques de nommage :

- `src/domain/template-edit-structure.ts:54` : `collection.replace(/s$/, "")` pour retrouver `page`, `block`, `region`.

Cela fonctionne pour Puzzle, mais reste une convention implicite.

### À faire

- Faire porter les correspondances par le manifeste ou par des métadonnées explicites.
- Éviter que `pages`, `blocks`, `regions`, `style_profiles` deviennent des noms obligatoires du core.

## 8. P2 — Opérations composites

### Problème

Le core sait faire `insert`, `insertChild`, `set`, etc., mais pas exprimer :

- « créer une page et l’ajouter au menu » ;
- « créer un style local et l’appliquer au bouton ».

### À faire

- Laisser les skills décrire les compositions attendues ;
- faire produire au core des opérations unitaires validées ;
- ne jamais exécuter de code de template.

## 9. P2 — Historique de conversation

### Problème

- `src/domain/template-edit-session.ts:71` : historique borné à 60 messages.
- Les événements d’audit ne sont pas rétro-générés pour les sessions antérieures.

### À faire

- Décider de la conservation légale/fonctionnelle ;
- archiver ou exporter les sessions anciennes ;
- ne pas confondre audit append-only et historique de chat tronqué.

## 10. Priorités de traitement

| Priorité | Sujet | État |
|---|---|---|
| P0 | Intégrité référentielle | À faire |
| P0 | `turnId`, idempotence, événement terminal | À faire |
| P1 | Sélection vs intention | À faire |
| P1 | Skills de template | Cadrage ADR-0110 |
| P1 | Observabilité brute des erreurs IA | À faire |
| P1 | Découplage des conventions de structure | À faire |
| P2 | Opérations composites via skills | À faire après skills |
| P2 | Conservation/export des sessions | À définir |

## 11. Règle de conception

Le prompt de base ne doit pas être enrichi avec des règles spécifiques à Puzzle.  
Le core doit rester le garant de :

- la validation du manifeste ;
- l’intégrité des références ;
- la sécurité des opérations ;
- l’audit ;
- l’exécution atomique.

Le template doit porter :

- ses intentions ;
- ses exemples ;
- ses compositions ;
- sa sémantique de style ;
- ses contraintes métier.
