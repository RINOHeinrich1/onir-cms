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
| [0019](0019-templates-visuels-package-ui.md) | Templates visuels — packages UI-only (norme et contrat hôte v1) | Accepté |
| [0020](0020-capacites-coeur-etat-visiteur-connaissances.md) | Capacités du cœur exposées aux templates — état du visiteur & connaissances | Accepté |
| [0021](0021-retex-template-immersif-3d.md) | RETEX template immersif — règles de développement d'un site 3D (performance, tactile, assets async) | Accepté |
| [0022](./0022-contrat-asset-avatar-3d.md) | Contrat d'asset 3D (avatar) et validation automatique en CI | Accepté |
| [0023](./0023-variables-parametrables-templates.md) | Variables paramétrables des templates visuels | Accepté |
| [0024](./0024-sdk-javascript-templates.md) | SDK JavaScript des templates visuels (`@onirtech/template-sdk`) | Accepté |
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
| [0047](./0047-extraction-structuree-multi-fournisseurs.md) | Extraction structurée multi-fournisseurs — capacités, raisonnement et fallback | Accepté |
| [0048](./0048-quotas-chatbot.md) | Quotas par chatbot — fiches à vie et budget de tokens | Accepté |
| [0049](./0049-configuration-chatbot-fiches-collecte.md) | Configuration du chatbot, fiches de collecte et conversations 0..N fiches | Accepté |
| [0050](./0050-fiches-collecte-reutilisables-versionnees.md) | Fiches de collecte réutilisables et versionnées | Accepté |
| [0051](./0051-brouillons-persistants-creation-chatbot.md) | Brouillons persistants de création de chatbot | Accepté |
| [0052](./0052-selection-donnees-globales-chatbot.md) | Sélection des données globales par configuration chatbot | Accepté |
| [0053](./0053-sauvegarde-obligatoire-nettoyage-controle.md) | Sauvegarde obligatoire et nettoyage contrôlé des données | Accepté |
| [0054](./0054-resume-manuel-conversation.md) | Résumé manuel de conversation, indépendant des fiches | Accepté |
| [0055](./0055-fiches-independantes-modele-raisonnement.md) | Fiches indépendantes du modèle de raisonnement et liées à 0..N chatbots | Accepté |
| [0056](./0056-creation-manuelle-depuis-fiche-collecte.md) | Création manuelle d’une fiche depuis une fiche de collecte | Accepté |
| [0057](./0057-api-publique-medias-connaissances.md) | API publique des médias et des connaissances | Accepté |
| [0058](./0058-ia-usages-clusters.md) | IA par usage, clusters et overrides par chatbot | Accepté |
| [0059](./0059-fallback-heuristique-chatbot.md) | Fallback heuristique des chatbots — questions/réponses fermées et fiche existante | Accepté |
| [0060](./0060-creation-chatbot-assistee-ia.md) | Création de chatbot assistée par IA — préremplissage supervisé | Accepté |
| [0062](./0062-suppression-legacy-modeles-raisonnement.md) | Suppression du stack legacy « modèles de raisonnement » | Accepté |
| [0063](./0063-couleurs-site-vers-variables-template.md) | Extraction et mapping des couleurs du site vers les variables de template | Remplacé |
| [0064](./0064-remplissage-ia-parametres-statiques.md) | Remplissage assisté des paramètres statiques de template | Accepté |
| [0065](./0065-catalogue-ia-partage-quotas-organisation.md) | Catalogue IA partagé, quotas par organisation et provisioning des invitations | Accepté |
| [0066](./0066-profils-de-limites-vivants.md) | Profils de limites vivants | Accepté |
| [0067](./0067-outils-internes-fiches-statuts-qualification.md) | Outils internes sur les fiches et statuts de qualification | Accepté |
| [0068](./0068-missions-chatbot-sources-information.md) | Missions du chatbot et sources d'information | Accepté |
| [0069](./0069-creation-chatbot-assistant-conversationnel.md) | Création de chatbot par assistant conversationnel — intake, génération et revue | Accepté |
| [0070](./0070-resolution-conflits-connaissances-creation.md) | Résolution des conflits de connaissances à la création d’un chatbot | Accepté |
| [0071](./0071-texte-fourni-source-connaissances-chatbot.md) | Texte fourni comme source de connaissances du chatbot | Accepté |
| [0072](./0072-import-connaissances-ia.md) | Import de connaissances assisté par IA | Accepté |
| [0073](./0073-selection-medias-independante.md) | Sélection média indépendante et portée explicite | Accepté |
| [0074](./0074-temps-reel-multi-instance.md) | Temps réel multi-instance — bus local, Valkey et repli polling | Accepté |
| [0075](./0075-modes-deploiement-mono-multi.md) | Modes de déploiement mono-instance et multi-instance | Accepté |
| [0076](./0076-strategie-cache-valkey.md) | Cache runtime local par nœud Next.js | Accepté — v1 |
| [0077](./0077-template-starter-defaut-et-couleurs-ia.md) | Template Starter par défaut et génération IA des couleurs | Accepté |
| [0078](./0078-acces-prive-wireguard-services-donnees.md) | Accès privés aux services de données via WireGuard | Accepté |
| [0079](./0079-rate-limit-ia-bottleneck-multinode.md) | Rate limiting IA avec Bottleneck en mono et multi-instance | Accepté |
| [0080](./0080-type-image-parametres-template.md) | Type image générique pour les paramètres de template | Accepté |
| [0081](./0081-personnalisation-generique-parametres-template.md) | Personnalisation générique des paramètres de template par l’IA | Accepté |
| [0082](./0082-collecte-semi-heuristique-formulaire-multifiche.md) | Collecte semi-heuristique — formulaire assisté et ciblage des instances de fiche | Accepté |
| [0083](./0083-composition-generique-fiches.md) | Composition générique de fiches — relations 1..1 et 1..n | Accepté |
| [0085](./0085-evitement-fee-controles-interactifs.md) | Évitement automatique de la fée ONIR sur les contrôles interactifs | Accepté |
| [0088](./0088-api-plateforme-service-a-service.md) | API plateforme — authentification service-à-service | Accepté |
| [0089](./0089-limite-messages-organisation.md) | Limite de messages par organisation | Accepté |
| [0090](./0090-quota-stockage-organisation.md) | Quota global de stockage par organisation | Accepté |
| [0091](./0091-templates-organisation-upload-installation.md) | Templates visuels gérés par organisation — upload, installation et désinstallation | Accepté |
| [0092](./0092-navigation-post-authentification-document-complet.md) | Navigation post-authentification — rechargement document complet | Accepté |
| [0093](./0093-suggestion-reponse-ia-prise-en-main-humaine.md) | Suggestion de réponse IA en prise en main humaine | Accepté |
| [0094](./0094-cache-chaud-chatbots-hot-set-lru.md) | Cache chaud des chatbots — hot set LRU borné par nœud | Accepté |
| [0095](./0095-parametres-statiques-structures.md) | Paramètres statiques structurés des templates — objets et tableaux | Accepté |
| [0096](./0096-conservation-limites-messages-stockage.md) | Conservation des limites de messages et de stockage dans les profils | Accepté |
| [0097](./0097-medias-illustration-configurable-limite.md) | Illustration des réponses par la photothèque — réglage UI, conservation et limite non bloquante | Accepté |
| [0098](./0098-limite-parametres-templates-64.md) | Limite des paramètres de template portée à 64 | Accepté |
| [0099](./0099-identification-email-otp-multitenant.md) | Identification visiteur par email OTP — transport multi-tenant et portail hôte | Accepté |
| [0100](./0100-webhooks-evenementiels-cycle-vie-fiches.md) | Webhooks événementiels sur le cycle de vie des fiches — outbox et déclenchement par transition | Accepté |
| [0101](./0101-contrat-payload-webhooks-automatiques.md) | Contrat de payload des webhooks automatiques — champs garantis et garde d'exécution | Accepté |
| [0102](./0102-contexte-runtime-erreurs-fiche-webhooks-ia.md) | Contexte runtime des erreurs de fiche et webhooks pour les réponses IA | Accepté |
| [0103](./0103-cycle-vie-versions-templates-test-desactivation.md) | Cycle de vie des versions de templates — test, erreur, désactivation, désinstallation sécurisée et retour arrière | Proposé |
| [0104](./0104-sessions-apercu-token-court.md) | Sessions d’aperçu éphémères — token court à la place des paramètres dans l’URL | Proposé |
| [0105](./0105-mode-edition-rapide-templates.md) | Mode d’édition rapide des templates visuels — curseur d’inspection et variables contextuelles | Proposé |
| [0106](./0106-build-standalone-domaine-personnalise-chatbot.md) | Build standalone et domaine personnalisé par chatbot | Proposé |
| [0107](./0107-build-standalone-telechargeable.md) | Build standalone téléchargeable pour hébergement autonome | Proposé |
| [0108](./0108-structured-template-editor-v2.md) | Structured Template Editor V2 — séparer les données du modèle d’édition | Proposé |
| [0109](./0109-edition-template-assistee-ia-resolution-cible.md) | Édition assistée des templates par IA — résolution de cible sans curseur | Proposé |
| [0110](./0110-template-skills-installes-avec-version.md) | Skills de template installés avec la version du template | Proposé |
| [0111](./0111-planner-edition-ia-references-retry.md) | Planner d’édition IA, références symboliques et retry borné | Proposé |
| [0112](./0112-plan-dsl-et-compilateur-operations.md) | Plan DSL et compilateur d’opérations pour l’édition IA | Proposé |
| [0113](./0113-boucle-agentique-fidele.md) | Boucle agentique fidèle pour l’édition IA de l’interface de template | Proposé |
| [0114](./0114-human-in-loop-workflow-agentique.md) | Human-in-loop dans la boucle agentique d’édition de template | Proposé |
| [0115](./0115-unset-references-optionnelles.md) | Sémantique `unset` pour les références optionnelles | Proposé |
| [0116](./0116-coherence-transactionnelle-apercu-candidat.md) | Cohérence transactionnelle de l’aperçu candidat | Proposé |
| [0117](./0117-contexte-conversationnel-planner.md) | Contexte conversationnel transmis au planner agentique | Proposé |
| [0118](./0118-skills-composition-et-routage-contextuel.md) | Skills de composition et routage contextuel générique | Proposé |
