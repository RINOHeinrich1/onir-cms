# 0017. Fiches multiples par conversation & archivage des conversations

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Décideurs** : équipe projet

## Contexte

Le suivi des conversations (ADR-0016) introduisait la génération d'une fiche a
posteriori, mais **idempotente** (une fiche au plus par conversation) et sans
moyen d'écarter les conversations traitées. Deux besoins :
1. générer une fiche **depuis la liste** (bouton sur la ligne), **même en cours**,
   avec la possibilité d'en produire **plusieurs** ;
2. **archiver** les conversations (masquées par défaut).

## Décision

### 1. Plusieurs fiches par conversation

- `generateFicheFromConversation` **crée une nouvelle fiche à chaque appel**
  (plus d'idempotence) : une conversation porte **0..N fiches**.
- Le **statut de la conversation n'est pas modifié** par la génération : seule la
  fin de discussion par le visiteur (« Terminer ») passe la conversation en
  `finalisee`. L'équipe peut donc générer des fiches pendant l'échange.
- La relation fiche→conversation reste portée par `fiches.conversation_id`
  (`listByConversation`). La **création manuelle** de fiche est conservée : la
  colonne reste `nullable`, seules les fiches générées depuis une conversation
  sont liées.
- UI : bouton **« Générer la fiche »** sur chaque ligne de `/conversations` (et sur
  la page de détail, qui **liste** désormais les fiches rattachées).

### 2. Archivage des conversations (migration `0016`)

- `conversations.archivee boolean NOT NULL DEFAULT false` (+ index).
- **Filtre serveur** : `en_cours` | `finalisees` | `toutes` | **`archivees`** ;
  les filtres non « archivees » excluent les conversations archivées (défaut :
  `en_cours`, archivées masquées).
- Action **Archiver / Désarchiver** sur la ligne (`PATCH /api/conversations/[id]`).
- RBAC : nouvelle action `conversations:update` (admin + marketeur ; lecteur exclu).

## Conséquences

### Positives

- L'équipe produit les fiches au fil de l'eau, sans attendre la fin de discussion,
  et peut en générer plusieurs versions.
- Le statut reste le reflet fidèle de la fin de conversation.
- Les conversations traitées sont écartées sans suppression (réversibles).

### Négatives / Risques

- Générer plusieurs fois **duplique** les fiches (choix assumé) ; un doublon
  éventuel se supprime depuis `/fiches`.
- `fiches.conversation_id` reste nullable (création manuelle) : la règle « toute
  fiche est liée à une conversation » n'est pas garantie au niveau base.

## Alternatives envisagées

- Rendre la génération idempotente : écarté (le besoin est explicitement
  multi-fiches).
- `conversation_id NOT NULL` + suppression de la création manuelle : écarté
  (la création manuelle de fiche est conservée).

## Liens

- US-CONVERS-002, US-CONVERS-003 ; étend l'ADR-0016.
