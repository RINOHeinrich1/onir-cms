# ADR — ONIR CMS

Index des décisions d'architecture d'ONIR CMS.
Les ADR sont immuables une fois acceptées ; toute évolution passe par une nouvelle
ADR qui remplace la précédente.

| ID | Titre | Statut |
|---|---|---|
| [0001](0001-socle-nextjs-16-app-router.md) | Socle Next.js 16 App Router + TypeScript strict | Accepté |
| [0002](0002-architecture-couches.md) | Architecture en couches (domain / application / infrastructure) | Accepté |
| [0003](0003-postgres-pg-sql.md) | PostgreSQL dédié via `pg` et SQL brut | Accepté |
| [0004](0004-auth-sessions-cookie.md) | Authentification par session cookie + hachage scrypt | Accepté |
| [0005](0005-rbac-matrice-roles.md) | Matrice de rôles centralisée `can(role, action)` | Accepté |
| [0006](0006-ia-infomaniak-openai-compat.md) | IA Infomaniak OpenAI-compatible (chat) | Accepté |
| [0007](0007-liens-chat-specifique-standard.md) | Liens de chat spécifique / standard | Accepté |
| [0008](0008-fiche-projet-markdown.md) | Fiche projet Markdown téléchargeable | Accepté |
| [0011](0011-modeles-raisonnement-db.md) | Modèles de raisonnement pilotés par la base | Accepté |
| [0012](0012-base-connaissances-mini-rag.md) | Base de connaissances — mini-RAG par sélection de titres | Accepté |
| [0013](0013-medias-phototheque-liens.md) | Médias — photothèque et liens proposés par l'IA | Accepté |
| [0016](0016-suivi-conversations.md) | Suivi des conversations (statut, reprise, fiche a posteriori) | Accepté |
| [0017](0017-fiches-multiples-archivage-conversations.md) | Fiches multiples par conversation & archivage des conversations | Accepté |
| [0018](0018-confidentialite-consentement.md) | Politiques de confidentialité & consentement du visiteur | Accepté |
| [0019](0019-templates-visuels-package-ui.md) | Templates visuels — packages UI-only (norme et contrat hôte v1) | Proposé |
| [0020](0020-capacites-coeur-etat-visiteur-connaissances.md) | Capacités du cœur exposées aux templates — état du visiteur & connaissances | Accepté |
| [0021](0021-retex-template-immersif-3d.md) | RETEX template immersif — règles de développement d'un site 3D (performance, tactile, assets async) | Accepté |
| [0022](./0022-contrat-asset-avatar-3d.md) | Contrat d'asset 3D (avatar) et validation automatique en CI | Accepté |
| [0023](./0023-variables-parametrables-templates.md) | Variables paramétrables des templates visuels | Accepté |
| [0024](./0024-sdk-javascript-templates.md) | SDK JavaScript des templates visuels (`@onirtech/template-sdk`) | Proposé |
| [0025](./0025-multitenancy-organisations.md) | Multitenancy par organisation | Accepté |
| [0026](./0026-ressources-de-donnees-templates.md) | Ressources de données des templates visuels — contrats déclarés et fournisseurs SQL | Accepté |
| [0027](./0027-categories-et-cles-de-rattachement.md) | Catégories partagées et clés de rattachement scalaires | Accepté |
| [0028](./0028-contrat-album-template-immersif.md) | Contrat `album` distinct du contrat `library` (template immersif) | Accepté |
| [0029](./0029-fournisseurs-ia-openai-compatible.md) | Fournisseurs IA OpenAI-compatible et modèle par lien | Accepté |
| [0030](./0030-catalogue-modeles-fournisseur.md) | Catalogue de modèles par fournisseur | Accepté |
| [0032](./0032-chat-test-modeles-ia.md) | Chat de test des modèles IA | Accepté |
| [0033](./0033-modes-identification-visiteurs.md) | Modes d’identification des visiteurs — contact, anonyme, OTP, interne | Accepté |
| [0034](./0034-champs-fichier-pieces-jointes-prospection.md) | Champs fichier et pièces jointes de prospection | Accepté |
| [0035](./0035-webhooks-sortants-modeles-raisonnement.md) | Webhooks sortants configurables par modèle de raisonnement | Accepté |
| [0036](./0036-configuration-secrets-applicatifs.md) | Configuration des secrets applicatifs depuis le panneau | Accepté |
| [0037](./0037-environnements-preprod-release.md) | Environnements de préproduction, runners et cadence de release | Accepté |
| [0038](./0038-assistance-ia-modeles-raisonnement.md) | Assistance IA de création des modèles de raisonnement | Accepté |
| [0039](./0039-reglages-libres-mode-simple.md) | Réglages libres du mode Simple (langue, ton, garde-fous, champs) | Accepté |
| [0040](./0040-surface-widget-liens-chat.md) | Surface widget des liens de chat et intégration externe | Accepté |
| [0041](./0041-canaux-diffusion-multiples-liens-chat.md) | Canaux de diffusion multiples des liens de chat | Accepté |
| [0042](./0042-api-publique-v1.md) | API publique v1 — contrat OpenAPI, scopes et architecture | Accepté |
| [0043](./0043-intervention-humaine-operateur-chat.md) | Intervention humaine dans les conversations et rôle « Opérateur chat » | Accepté |
| [0044](./0044-notifications-tableau-de-bord.md) | Notifications du tableau de bord — cloche, compteur non lu et historique | Accepté |
| [0045](./0045-champs-conversation-collectes.md) | Champs de conversation collectés et édition humaine | Accepté |
| [0046](./0046-incidents-conversation-alertes.md) | Incidents de conversation et alertes d’intervention | Accepté |
