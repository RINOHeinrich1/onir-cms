# 0016. Suivi des conversations (statut, reprise, fiche a posteriori)

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Décideurs** : équipe projet

## Contexte

Les conversations sont déjà persistées (`conversations`, `chat_messages`) dès
l'identification, mais rien ne permettait de **suivre** leur sort :
- aucun **statut** (finalisée ou non) ;
- aucune **vue** : seules les conversations d'un prospect existant étaient
  visibles (modale Prospect 360) ;
- le **prospect n'était créé qu'à la finalisation** (`finishConversation`) : une
  discussion abandonnée sur un lien standard restait **sans prospect**, donc
  invisible ;
- **chaque ouverture du lien créait une nouvelle conversation** (pas de reprise),
  fragmentant un même visiteur en plusieurs fils.

## Décision

### 1. Modèle (migration `0015_conversations_suivi.sql`)

- `conversations.statut` : `en_cours` (défaut) | `finalisee`.
- `conversations.prospect_id` : prospect rattaché, **dès l'identification**.
- `conversations.last_message_at` : horodatage du dernier message (colonne
  distincte → **durée d'inactivité** calculée à l'affichage).
- `conversations.updated_at`.
- **Backfill** : `finalisee` là où une fiche existe ; `prospect_id` depuis le
  lien (spécifique) ou la fiche (standard) ; `last_message_at` depuis les messages.

### 2. Flux

- **Démarrage** (`startConversation`) :
  - lien `specifique` → prospect = celui du lien ;
  - lien `standard` → **find-or-create du prospect par email** (`origine =
    libre`), puis `conversations.prospect_id`. *Le prospect/contact est donc
    enregistré même sans finalisation.*
  - **Reprise** : si une conversation `en_cours` existe pour **le même lien et le
    même prospect**, elle est réutilisée (historique conservé) au lieu d'en créer
    une nouvelle. Périmètre volontairement **restreint au même lien** (campagne).
- **Finalisation** (`finishConversation`), partagée via
  `buildFicheFromConversation` : construit la fiche (IA + validation métier) et
  passe la conversation à `finalisee`.
- **Génération opérateur** (`generateFicheFromConversation`) : un admin/marketeur
  peut générer la fiche d'une conversation **a posteriori**, même sans clic
  « Terminer ». **Idempotent** : si une fiche existe déjà pour la conversation,
  elle est renvoyée (aucun appel IA).

### 3. Interface

- `/conversations` : liste (visiteur, lien, statut, messages, **inactivité**,
  date) + **filtre serveur** `en_cours|finalisees|toutes`. Lecture pour tous les
  rôles connectés.
- `/conversations/[id]` : **transcript** en lecture (bulles + médias, visionneuse
  plein écran), contexte (visiteur, lien, prospect) et bouton **Générer la fiche**
  (admin/marketeur). La modale Prospect 360 renvoie vers ce transcript.

### 4. RBAC

`conversations:list` / `conversations:read` (admin, marketeur, lecteur) ;
la génération de fiche reste sous `project:write`.

## Conséquences

### Positives

- Toute discussion est **traçable** (statut, prospect, transcript), finalisée ou non.
- Le module Prospects voit désormais les visiteurs identifiés dès l'ouverture.
- Plus de fragmentation : un même visiteur (email) sur un même lien **reprend sa
  conversation** et son historique s'affiche.
- Les fiches peuvent être générées par l'équipe sans dépendre du clic visiteur.

### Négatives / Risques

- `startConversation` écrit désormais (prospect + conversation) à l'ouverture ;
  testé contre l'abus via le time-trap et les limiteurs existants.
- La reprise est limitée au même lien (choix assumé) : un prospect qui revient par
  un **autre** lien démarre un nouveau fil.
- Une conversation finalisée ne se reprend pas (nouveau fil si le visiteur revient).

## Alternatives envisagées

- Statut `abandonnee` manuel / alerte d'inactivité stockée : écarté — l'inactivité
  est **dérivée** de `last_message_at` (colonne dédiée) plutôt que stockée.
- Reprise « par prospect tous liens confondus » ou « même finalisée » : écarté
  (fragmentation des campagnes / réouverture de fils clos).
- Prospect créé seulement à la finalisation (statu quo) : écarté — laisse des
  conversations orphelines.

## Liens

- US-CONVERS-001, US-CONVERS-002 ; complète US-CHAT-001 et US-FICHE-001.
