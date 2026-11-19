# 0101. Contrat de payload des webhooks automatiques — champs garantis et garde d'exécution

- **Statut** : Accepté
- **Date** : 2026-11-19
- **Référence** : ADR-0061, ADR-0100.
- **Complète** : ADR-0100 (déclencheurs automatiques).

## Contexte

Un webhook peut déclarer des mappings `required=true`. Aujourd'hui, le builder
lève une erreur au moment de l'envoi si une valeur requise est absente. Pour un
webhook automatique, cela peut produire une livraison tardive en échec, ou une
requête HTTP avec un paramètre manquant si la garde n'est pas appliquée.

Le risque est réel lorsque le déclencheur ne garantit pas les champs mappés :

```text
déclencheur : required_fields_filled
mapping requis : téléphone (champ facultatif de la fiche)
```

Le déclencheur peut être atteint alors que `téléphone` est vide.

## Décision

### 1. Champs garantis par déclencheur

Chaque déclencheur définit un ensemble de champs garantis :

| Déclencheur | Champs garantis |
| --- | --- |
| `fiche.draft.all_fields_filled` | tous les champs, facultatifs inclus |
| `fiche.draft.required_fields_filled` | champs obligatoires de la fiche |
| `fiche.draft.field_filled` | uniquement le champ configuré |
| `fiche.draft.fields_filled` | tous les champs du groupe configuré |
| `fiche.validated` | champs obligatoires de la fiche finale |

Les métadonnées ont leurs propres garanties :

| Métadonnée | Garantie |
| --- | --- |
| `conversation.id` | toujours |
| `event.type`, `event.occurredAt` | toujours |
| `fiche.key`, `fiche.status` | toujours |
| `fiche.instanceId` | événements de brouillon |
| `fiche.id` | uniquement `fiche.validated` |
| `prospect.*` | seulement si un prospect est associé |
| pièces jointes | seulement si le champ fichier est rempli |

### 2. Validation à la configuration

À l'enregistrement d'un endpoint automatique :

```text
pour chaque trigger sélectionné :
  guaranteed = champs garantis par ce trigger
  pour chaque mapping.required = true :
    si le champ source n'est pas dans guaranteed :
      refuser la configuration
```

Règles :

- chaque trigger est évalué **individuellement** ; un trigger ne peut pas
  dépendre d'un autre événement pour compléter son payload ;
- un `field_filled(X)` ne peut pas avoir un autre champ requis que X ;
- un `fields_filled([X, Y, …])` garantit uniquement les champs du groupe ;
- `required_fields_filled` et `validated` ne garantissent pas les champs
  facultatifs ;
- `validated` est le seul événement qui garantit `fiche.id` ;
- une pièce jointe requise doit être garantie par le trigger ou le mapping doit
  être facultatif.

Message d'erreur type :

> Le déclencheur « champs obligatoires remplis » ne garantit pas le champ
> « Téléphone », marqué requis dans ce webhook. Choisissez « tous les champs
> remplis » ou rendez ce mapping facultatif.

### 3. Garde runtime

Avant de créer une livraison automatique, le dispatcher vérifie que tous les
mappings requis sont disponibles dans le payload snapshoté.

Si un champ requis manque :

- aucun appel HTTP n'est effectué ;
- l'événement est marqué `payload_incomplete` ;
- l'incident est visible pour l'admin ;
- aucune tentative HTTP n'est programmée ;
- aucune donnée incomplète n'est envoyée au partenaire.

Cette garde est une défense en profondeur : elle protège les configurations
anciennes, les changements de définition de fiche et les pièces jointes
supprimées.

### 4. Mappings facultatifs

Un mapping `required=false` peut être absent. Le builder continue de l'omettre.
Le contrat ne bloque que les valeurs explicitement requises par le webhook.

### 5. Compatibilité

- les endpoints manuels existants ne sont pas concernés ;
- la validation du contrat s'applique à l'activation d'un trigger automatique ;
- un endpoint sans trigger reste manuel ;
- l'ajout d'un trigger à un endpoint existant déclenche la validation.

## Conséquences

### Positives

- aucun webhook automatique ne part avec un champ requis manquant ;
- l'erreur est détectée à la configuration, pas en production ;
- la garde runtime protège les configurations anciennes ;
- le comportement manuel reste inchangé.

### Coûts

- validation plus stricte dans l'éditeur de webhook ;
- message d'aide nécessaire pour expliquer les champs garantis ;
- gestion d'un statut d'événement `payload_incomplete`.

## Points ouverts

- autoriser un mode « attendre que les mappings requis soient remplis » avec
  reprise sur un événement ultérieur ;
- définir une notion de trigger composé `événement ET champs`.
