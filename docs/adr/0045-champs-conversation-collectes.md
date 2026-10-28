# 0045. Champs de conversation collectés et édition humaine

- **Statut** : Accepté
- **Date** : 2026-10-28
- **Décideurs** : équipe projet
- **Référence** : ADR-0016 (suivi des conversations), ADR-0017 (fiches),
  ADR-0034 (pièces jointes), ADR-0043 (opérateur chat).

## Contexte

Le backoffice doit afficher les informations à collecter, ce qui est déjà connu et
ce qui manque, avec les champs obligatoires mis en évidence. L’opérateur doit
pouvoir corriger ou compléter ces informations sans attendre la génération de la
fiche.

Aujourd’hui, l’extraction IA n’est faite qu’au moment de la génération d’une fiche.
Il n’existe donc aucun état live à afficher ni à éditer.

## Décision

### 1. État persistant par conversation et par champ

Nouvelle table `conversation_field_values` :

```text
conversation_id, organization_id, field_name, value jsonb,
source ('ai' | 'manual' | 'visitor' | 'system'),
updated_by, updated_at
```

Le schéma des champs (libellé, type, options, obligatoire, `requiredIf`) reste
porté par la **version figée du modèle de raisonnement du lien**. Aucune
duplication du schéma dans la conversation.

Une table `conversation_field_analyses` porte le dernier état d’extraction
(`last_analyzed_message_at`, `last_analyzed_at`, `status`, `error`).

### 2. Priorité des valeurs

- Une valeur `manual` **n’est jamais écrasée** par une extraction IA ultérieure.
- Une valeur IA peut être remplacée par une valeur manuelle.
- Un effacement manuel reste un effacement explicite (valeur vide), et ne sera
  pas re-rempli automatiquement.
- Les champs fichier ne sont pas stockés en valeur : leur état vient du nombre
  de pièces jointes de la conversation.

### 3. Calcul de l’état

- `requiredNow` tient compte de `required` et de `requiredIf`.
- `missing` est vrai si le champ est vide, ou si un champ fichier n’a aucune
  pièce jointe.
- Le panneau expose `requiredTotal`, `requiredCollected`, `requiredMissing`,
  `collectedTotal`, `total`, `stale`.
- `stale` compare le dernier message de la conversation à
  `last_analyzed_message_at`.

### 4. API

```text
GET   /api/conversations/[id]/fields
PATCH /api/conversations/[id]/fields       { values: { ... } }
POST  /api/conversations/[id]/fields/refresh
```

- `GET` ne déclenche jamais d’appel IA.
- `PATCH` valide uniquement les champs fournis, normalise les valeurs vides et
  écrit la source `manual`.
- `refresh` lance l’extraction IA, fusionne les valeurs non manuelles, puis met
  à jour l’état d’analyse.
- Le client ouvre le panneau, déclenche `refresh` si `stale`, puis poll l’état
  toutes les 3 s. Une analyse en échec n’est pas relancée avant 15 s.

### 5. Droits

Nouvelle action `conversations:update_fields` accordée à admin, marketeur et
opérateur. Le lecteur garde un panneau en lecture seule. Le périmètre opérateur
reste limité à ses liens.

### 6. Génération de fiche

`buildFicheFromConversation` fusionne les valeurs persistées (manuel, IA,
visiteur) avec le pré-remplissage IA avant validation. Les corrections de
l’opérateur sont donc prises en compte dans la fiche.

## Conséquences

- Le panneau peut afficher un état live et être édité sans attendre la fiche.
- Une extraction IA peut être relancée à la demande ; elle est automatique à
  l’ouverture du panneau si la conversation a évolué.
- Les valeurs manuelles sont prioritaires et auditées par `updated_by`.
- La génération de fiche reste bloquée si des obligatoires manquent, mais
  l’opérateur sait immédiatement lesquels.
