# 0018. Politiques de confidentialité & consentement du visiteur

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Décideurs** : équipe projet

## Contexte

Le chat de prospection collecte et **enregistre** des données personnelles
(nom, email, contacts, échanges, fiches) — contrairement au site vitrine dont
les mentions légales indiquent l'absence de cookie/conservation. Il faut donc un
**consentement explicite** avant la discussion, **paramétrable** (texte + lien),
et une **preuve** d'acceptation.

## Décision

### 1. Modèle (migration `0017_confidentialites.sql`)

- Table `confidentialites` : `titre` (unique), `texte` (consentement affiché),
  `lien` (URL de la politique, vide possible), `actif`, audit. **Plusieurs
  politiques** configurables.
- **Politique par défaut** semée (id fixe), `lien = /confidentialite`.
- `chat_links.confidentialite_id` : un lien de chat est rattaché à **une**
  politique (nullable). Les liens existants adoptent la politique par défaut.
- `conversations.consentement_at` (date du consentement) + `confidentialite_id`
  (politique acceptée).

### 2. Consentement

- À l'identification (lien `standard`), le portail affiche le **texte** de la
  politique du lien + une **case à cocher obligatoire** + un lien vers la
  politique complète.
- `startConversation` **refuse** (400) si le lien a une politique et que le
  consentement n'est pas donné ; sinon il **horodate** `consentement_at` et
  enregistre la politique sur la conversation.
- Nouveaux liens : politique par défaut (sélectionnable dans le formulaire).

### 3. Interface

- Nouvel **onglet Confidentialité** (`/confidentialites`) : CRUD des politiques
  (titre, texte, lien, actif). RBAC `confidentialites:*` (admin/marketeur ;
  lecteur en lecture).
- **`/confidentialite`** : page **publique** (sans authentification) = cible par
  défaut, décrivant honnêtement ce que le dashboard enregistre.
- Le formulaire/édition de lien propose la politique à rattacher.

## Conséquences

### Positives

- Consentement explicite et **traçable** (date + politique) par conversation.
- Textes et liens de politique **modifiables sans code** (plusieurs politiques).
- Aucune dépendance à un fournisseur externe de consentement.

### Négatives / Risques

- Lien `specifique` (prospect connu) : pas d'écran d'identification, donc **pas
  de case de consentement** (à traiter ultérieurement si requis).
- La page `/confidentialite` est un **modèle** à adapter par l'équipe (responsable
  de traitement, durées, hébergement).

## Alternatives envisagées

- Consentement figé dans le code : écarté (non paramétrable).
- CMP externe (Axeptio, Tarteaucitron…) : écarté (sur-dimensionné ici).

## Liens

- US-CONFID-001 ; complète US-LIENS-001 et US-CONVERS-001.
