# 0059. Fallback heuristique des chatbots — questions/réponses fermées et fiche existante

- **Statut** : Accepté
- **Date** : 2026-10-30
- **Décideurs** : équipe projet
- **Référence** : ADR-0049, ADR-0055, ADR-0058.

## Contexte

Lorsqu’aucun modèle de la chaîne IA ne répond, le runtime renvoie aujourd’hui une
erreur `502` et enregistre un incident `ai_reply_failed`. Le visiteur n’a alors
aucune alternative contrôlée.

Une détection heuristique par mots-clés a été écartée : elle est fragile dès que
le visiteur reformule sa demande et oblige à prédéfinir un nombre infini de
variantes. Le besoin est différent : proposer un **parcours fermé** lorsque l’IA
est indisponible.

Les fiches de collecte existent déjà, avec ou sans fallback. Le fallback ne doit
donc pas redéfinir les champs, les validations ni le rendu d’une fiche.

## Décision

### 1. Contenu du fallback

Le fallback heuristique est une configuration du chatbot, versionnée dans le
snapshot `chatbot_configs` avec la configuration courante :

```json
{
  "enabled": true,
  "intro": "L’assistant est momentanément indisponible. Choisissez une option.",
  "questions": [
    {
      "id": "tarifs",
      "label": "Quels sont vos tarifs ?",
      "answer": "Nos tarifs démarrent à ..."
    }
  ],
  "showCollectionForm": true
}
```

Il contient uniquement :

- des questions/réponses d’information ;
- l’autorisation d’ouvrir la fiche de collecte existante.

Il ne contient ni mots-clés, ni règles de correspondance, ni champs de
formulaire, ni prompt.

### 2. Parcours visiteur

Lorsque l’IA échoue, l’interface propose un menu fermé :

```text
intro
  ├─ question 1 → réponse fixe → retour au menu
  ├─ question 2 → réponse fixe → retour au menu
  └─ remplir la fiche → parcours de collecte existant
```

Le visiteur ne peut choisir que des identifiants publiés. Chaque question
sélectionnée est enregistrée comme message **utilisateur**, puis la réponse fixe
comme message assistant. Aucun texte libre n’est interprété en mode heuristique.

### 3. API publique

Une route dédiée, scopée à une conversation, expose le menu et les réponses :

```text
POST /api/chat/fallback
{ conversationId, action: "menu" }
{ conversationId, action: "select", questionId }
```

La route est publique par possession du `conversationId`, comme
`POST /api/chat/finish`. Elle vérifie le lien, l’organisation et la
configuration courante. Elle ne permet pas de créer une fiche arbitraire et ne
remplace pas les routes de collecte.

Les formulaires continuent d’utiliser le parcours existant
(`POST /api/chat/finish` et la collecte de conversation).

### 4. Administration

Le fallback possède son propre onglet dans la configuration du chatbot. L’admin
peut :

- activer/désactiver le fallback ;
- définir le message d’introduction ;
- ajouter, ordonner et supprimer des questions/réponses ;
- autoriser ou non l’accès à la fiche de collecte existante ;
- prévisualiser le menu et les réponses.

### 5. Template et SDK

Le template visuel ne lit jamais la configuration en base et n’appelle jamais
l’API directement. Une capacité additive `fallback` expose `state.fallback` et
les actions `selectFallback(questionId)` / `openCollectionForm()`.

Si le template ne déclare pas la capacité, le shell hôte conserve le menu
générique actuel. Si le template la déclare, il peut rendre le menu et le
formulaire selon son propre design ; l’hôte valide toujours les IDs et exécute
les appels API.

### 6. Sécurité et limites

- validation stricte des `questionId` contre le snapshot publié ;
- rate limiting sur la route publique ;
- aucune donnée d’une autre organisation ;
- aucun texte libre interprété ;
- les quotas de fiches et de tokens restent applicables ;
- une conversation anonyme ne produit pas de fiche nominative ;
- taille bornée du nombre de questions et de la longueur des réponses.

## Conséquences

### Positives

- comportement déterministe et contrôlé en cas de panne IA ;
- aucune dépendance à une détection de mots-clés ;
- réutilisation des fiches et du parcours de collecte existants ;
- configuration versionnée avec le chatbot ;
- surface publique limitée à une projection du snapshot.

### Négatives

- le menu est volontairement limité : il ne répond pas aux questions hors liste ;
- une conversation en mode heuristique ne redevient pas conversationnelle tant
  que l’IA n’est pas rétablie ou que le parcours n’est pas terminé ;
- l’intégration visuelle du menu doit être faite dans les templates qui
  souhaitent un rendu spécifique.

## Alternatives écartées

- **Détection de mots-clés** : fragile, infinie et imprévisible.
- **Réutiliser `POST /api/fiches` en public** : route dashboard authentifiée,
  surface d’écriture trop large.
- **Créer un second formulaire dans le fallback** : duplication de la fiche et
  des validations.
- **Faire appeler l’API par le template** : rupture du contrat hôte et exposition
  de secrets.
