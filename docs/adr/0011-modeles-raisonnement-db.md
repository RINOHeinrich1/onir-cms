# 0011. Modèles de raisonnement pilotés par la base

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Décideurs** : équipe projet

## Contexte

Le comportement du chat (prompt système, extraction des champs, validation,
rendu du livrable) était figé en code (`system-prompt.ts`, `EXTRACTION_GUIDE`,
`validateFiche`, `renderFicheMarkdown`, `fiche-pdf.ts`) : chaque nouveau
comportement de prospection (recherche d'investisseurs, présentation
d'Onirtech, …) exigeait un développement + une CI/CD. Les marketeurs doivent
pouvoir créer leurs propres comportements sans toucher au code.

## Décision

- Un **modèle de raisonnement** = une fiche `chat_templates` (clé, libellé,
  description) + **snapshots immuables** `chat_template_versions`
  (définition JSON : prompt, champs, rendu). Les liens et fiches référencent
  `key` + `version` → reproductibilité même après modification du modèle.
- **Schéma déclaratif** : champs `text|textarea|select|multi|url|email`,
  `required`, `options`, **une** règle `requiredIf` — validé côté serveur.
- **Moteur sans exécution de code** : `{{champ}}` + `{{#if champ}}` (pas
  d'imbrication) ; variables serveur documentées ; PDF généré **depuis le
  Markdown** (un seul chemin PDF).
- Le comportement historique devient le modèle par défaut **`fiche-projet`**
  (v1), prompt et Markdown **identiques** (vérifiés byte à byte) — la
  terminologie métier affichée devient « fiche de prospection ».
- UI marketeur `/modeles` (CRUD + prévisualisation données fictives) ;
  RBAC `templates:*` (marketeur CRUD, admin tout, lecteur lecture).

## Conséquences

### Positives

- Nouveau comportement = nouveau modèle en base, sans déploiement.
- Snapshots : auditabilité (on sait quel prompt a produit quel livrable).

### Négatives / Risques

- Le PDF n'est plus pixel-identique à l'ancien rendu ad hoc (contenu
  identique) — écart assumé, constaté en revue.
- `fiches.statut` nullable (modèles sans statut) ; colonnes historiques
  dérivées pour `fiche-projet` uniquement.
- Renommer une clé orphelinerait les liens/fiches : clé immuable, suppression
  refusée si référencée.

## Alternatives envisagées

- Prompts en code par comportement : rejeté, exige un développement par besoin.
- Moteur de templates complet (boucles, filtres) : rejeté, surface
  d'attaque et complexité inutiles (pas d'exécution de code).
- Éditeur visuel drag-and-drop, approbation, A/B testing : hors périmètre.

## Liens

- Révise partiellement l'ADR-0008 (export PDF : évolution actée ici).
- RM-TEMPLATE-001, RM-TEMPLATE-002 ; US-TEMPLATE-001, US-CHAT-003.
