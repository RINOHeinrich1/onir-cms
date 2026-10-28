# 0046. Incidents de conversation et alertes d’intervention

- **Statut** : Accepté
- **Date** : 2026-10-28
- **Décideurs** : équipe projet
- **Référence** : ADR-0043 (opérateur chat), ADR-0044 (notifications),
  ADR-0045 (champs de conversation).

## Contexte

Une erreur de génération de réponse IA ou de fiche ne doit pas rester un simple
toast temporaire. Un humain doit être alerté, retrouver la conversation et
clôturer l’incident après traitement.

## Décision

### 1. Table d’incidents

`conversation_incidents` porte :

- `kind` : `ai_reply_failed`, `fiche_generation_failed`, `field_extraction_failed` ;
- `severity`, `title`, `detail` ;
- `status` : `open` / `resolved` ;
- `occurrences`, `first_seen_at`, `last_seen_at` ;
- `resolved_at`, `resolved_by`.

Un index unique partiel garantit **un seul incident ouvert par conversation et
par type**. Une nouvelle occurrence incrémente `occurrences` et met à jour
`last_seen_at`, sans créer de doublon.

### 2. Capture

- Les erreurs IA de réponse sont enregistrées dans la route `/api/chat` lorsqu’une
  erreur de fournisseur est renvoyée.
- Les erreurs de génération de fiche sont enregistrées dans les routes de
  génération et de fin de conversation.
- L’enregistrement est **fail-safe** : une erreur d’enregistrement ne masque
  jamais l’erreur d’origine.

### 3. Notifications

Le flux de notifications expose deux collections :

```text
items  : activité (conversations, leads) — filigrane de lecture
alerts : incidents ouverts — persistants jusqu’à résolution
```

- Le badge de la cloche additionne les activités non lues et les incidents ouverts.
- Ouvrir le panneau marque l’activité comme lue, mais **ne résout pas** les
  incidents.
- Les incidents restent comptés et visibles dans la section « À traiter » jusqu’à
  `resolved`.
- Le lien d’une alerte ouvre `/conversations/{id}?alert={incidentId}`.

### 4. Expérience dans la conversation

Une bannière persistante affiche les incidents ouverts :

- réponse IA : `Prendre la main` et `Marquer résolu` ;
- fiche : `Voir les informations` (ouvre le panneau ADR-0045) et `Marquer résolu`.

La résolution est réservée aux rôles disposant de `conversations:intervene` et
respecte le périmètre de liens de l’opérateur.

## Conséquences

- Aucune erreur opérationnelle ne disparaît avec un toast.
- Les incidents sont dédupliqués et comptés par occurrence.
- La notification reste actionnable tant que l’humain ne l’a pas clôturée.
