# 0008. Fiche projet Markdown téléchargeable

- **Statut** : Accepté
- **Date** : 2026-10-14
- **Décideurs** : équipe projet

## Contexte

La discussion IA doit aboutir à un livrable : la fiche projet (US-FICHE-001,
RM-FICHE-001/002) — plateformes (multi), budget, durée, contact, statut
(initier/reprendre), contraintes techno si reprise, lien doc spécifications.

## Décision

- Validation métier stricte : ≥1 plateforme, budget, durée, contact, statut ;
  statut `reprendre` ⇒ `contraintes_techno` obligatoires.
- Rendu **Markdown déterministe** (`renderFicheMarkdown`, fonction pure testée) ;
  téléchargement via `GET /api/fiche/[id]/download` (`Content-Disposition:
  attachment`).
- Pré-remplissage assisté : l'IA extrait une proposition JSON depuis
  l'historique (`draftFicheFromConversation`) ; validation humaine avant
  enregistrement.
- Export PDF : évolution future, non retenue (dépendance native évitée).

## Conséquences

- Document stable et diffusable sans outil ; génération reproductible.
- La qualité du pré-remplissage dépend du cadrage de la discussion (prompt).

## Liens

- RM-FICHE-001, RM-FICHE-002 ; US-FICHE-001, US-CHAT-001.
