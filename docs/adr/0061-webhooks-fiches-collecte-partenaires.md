# 0061. Webhooks sur fiches de collecte et microservice partenaires

- **Statut** : Proposé
- **Date** : 2026-11-03
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0035 (webhooks sortants) ; s'appuie sur
  ADR-0049 (configuration chatbot et fiches de collecte), ADR-0050 (fiches de
  collecte réutilisables), ADR-0055 (fiches indépendantes du modèle de
  raisonnement), ADR-0056 (création manuelle depuis une fiche de collecte),
  ADR-0042 (API publique v1), ADR-0005 (RBAC), ADR-0025 (multitenancy) et
  ADR-0002 (architecture en couches).

## Contexte

ADR-0035 a livré un connecteur HTTP sortant configurable, déclenché
manuellement depuis une fiche. Ce connecteur est **rattaché au modèle de
raisonnement** (`webhook_endpoints.template_key`) et construit son payload à
partir de `chat_templates`.

Or le modèle de raisonnement est **déprécié et abandonné** (ADR-0049, ADR-0055,
ADR-0056). La **fiche de collecte** est désormais la source normale : une fiche
générée par une configuration chatbot porte `config_id`, `fiche_key` et
`conversation_fiche_instance_id`, avec **`template_key = null`**, et un snapshot
`definition` JSONB.

Conséquence directe : sur une fiche de collecte, le webhook manuel est
**inopérant** aujourd'hui :

- `listWebhookEndpointsForFiche` renvoie `[]` dès que `fiche.templateKey` est
  nul, donc le bouton « Envoyer via webhook » n'apparaît pas ;
- `triggerWebhook` / `previewWebhook` exigent un `template_key` et chargent la
  version du modèle de raisonnement ;
- `buildWebhookRequest` refuse une fiche sans `template_key` et compare
  `endpoint.template_key` à `fiche.template_key` ;
- `webhook_deliveries.template_key` et `template_version` sont `NOT NULL` ;
- le formulaire d'endpoint ne propose que les modèles de raisonnement.

Le besoin métier qui motive cette évolution : publier sur la carte de la page
`/participer/` de la landing les **partenaires** issus du chatbot de
partenariat, après vérification humaine de leur fiche. La gestion des
partenaires est un besoin **spécifique** : elle ne doit pas être couplée à
ONIR-CMS. ONIR-CMS reste la source de vérité générique et émet un webhook ;
un **microservice partenaires** dédié porte le domaine partenaire et son API
publique.

Contraintes structurantes :

- publication **directe** au déclenchement manuel (la vérification dans
  ONIR-CMS *est* la modération) ;
- le **POST d'ingestion n'est pas public** : seul le worker webhook
  d'ONIR-CMS écrit dans le microservice ; le sponsor n'écrit jamais
  directement ;
- **même VPS**, stockage **SQLite** (une centaine de partenaires) ;
- **push uniquement**, manuel, depuis ONIR-CMS ; pas de pull ni de
  synchronisation automatique ;
- champs partenaire : `nom`, `prénom`, `nature` (particulier | entreprise),
  `type de partenariat` (multiple), `lien de site`, `lien de chatbot` ;
- le microservice vit dans un **dépôt git dédié**, distinct de `onir-cms` et
  de `onir-cms-landing`.

## Décision

### 1. Étendre les webhooks aux fiches de collecte (générique)

Le webhook sortant reste un mécanisme **générique** ; il est simplement rendu
applicable aux fiches de collecte. Aucune notion « partenaire » n'entre dans
ONIR-CMS.

- **Scope d'endpoint** : `chat_link_id` (chatbot, obligatoire) + `fiche_key`
  (fiche de collecte, optionnel). Le chatbot est **stable entre les versions
  de configuration** (`config_id` change à chaque version) : c'est donc la
  bonne clé de rattachement. Le legacy `template_key` devient **nullable** et
  reste supporté pour les endpoints existants.
- **Éligibilité** : `listWebhookEndpointsForFiche` matche le scope
  `fiche.chat_link_ids` / `fiche.fiche_key` (et, pour le legacy,
  `fiche.template_key`).
- **Payload** : construction depuis le **snapshot `fiche.definition`** et
  `fiche.data`, plus les sources existantes `meta`, `prospect` et
  `attachment`. Le moteur de mapping ne change pas ; il reçoit simplement la
  définition de la fiche de collecte.
- **Livraisons** : `webhook_deliveries.template_key` / `template_version`
  deviennent nullables et sont complétés par `chat_link_id` / `fiche_key`,
  pour l'audit et la relance.
- **UI** : le sélecteur « modèle de raisonnement » devient « chatbot / fiche
  de collecte » ; le catalogue de champs mappables vient de la fiche de
  collecte.
- **Test** : l'échantillon de test est construit depuis la fiche de collecte,
  sans modèle de raisonnement.
- **API** : filtre `chatLinkId` / `ficheKey` sur la liste des endpoints.

Ce point est un **prérequis bloquant** de la publication des partenaires. Il
reste générique et profite à toute fiche de collecte.

### 2. Microservice partenaires dédié

Le microservice est un petit service autonome (Node/TypeScript, SQLite),
déployé sur le même VPS, avec son dépôt git et son pipeline propres. Il ne
partage aucun code avec `onir-cms`.

Endpoints :

- `POST /internal/partenaires` — **privé** (réseau interne / `127.0.0.1`,
  jamais exposé par le reverse proxy), authentifié par **HMAC**
  (`X-Onir-Signature`) ou, à défaut, par un bearer token. **Idempotent par
  `fiche_id`** (upsert). Publication directe : `published = 1`.
- `GET /partenaires` — **public**, lecture seule, CORS limité aux origines de
  la landing, cache (`Cache-Control`, `ETag`).
- `GET /health` — interne.
- (option) `POST /internal/partenaires/:id/unpublish` — retrait.

Modèle de données (SQLite) :

```sql
CREATE TABLE partners (
  id TEXT PRIMARY KEY,
  fiche_id TEXT NOT NULL UNIQUE,                 -- idempotence
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL DEFAULT '',
  nature TEXT NOT NULL CHECK (nature IN ('particulier','entreprise')),
  types_partenariat TEXT NOT NULL DEFAULT '[]',  -- JSON array
  site_url TEXT NOT NULL DEFAULT '',
  chatbot_url TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_partners_published ON partners(published, nature);
```

`types_partenariat` reste un tableau JSON (volume faible) ; une table de
jointure n'est ajoutée que si un filtrage par type devient nécessaire.

### 3. Flux de bout en bout

1. Le sponsor discute sur `/l/<token>` ; à la fin, une **fiche de collecte**
   est créée (`template_key = null`, `config_id`, `fiche_key`).
2. L'administrateur vérifie la fiche dans ONIR-CMS.
3. Il clique « Envoyer via webhook », choisit l'endpoint « Partenaires »,
   consulte l'aperçu puis envoie.
4. Le worker webhook d'ONIR-CMS construit la requête et la POSTe, signée HMAC,
   vers `http://127.0.0.1:<port>/internal/partenaires`.
5. Le microservice vérifie la signature, fait un upsert par `fiche_id` et pose
   `published = 1`.
6. La landing appelle `GET /partenaires` (cache), l'adaptateur mappe le
   partenaire vers le modèle « sponsor » de la carte.

Le sponsor ne poste jamais dans le microservice : le seul écrivain est le
worker webhook d'ONIR-CMS.

### 4. Contrats

**Ingestion** (construite par le `bodyTemplate` du webhook) :

```json
{
  "ficheId": "…",
  "nom": "…",
  "prenom": "…",
  "nature": "particulier|entreprise",
  "typesPartenariat": ["…"],
  "siteUrl": "…",
  "chatbotUrl": "…"
}
```

**Lecture publique** `GET /partenaires` :

```json
{
  "version": 1,
  "partenaires": [
    {
      "id": "slug",
      "nom": "…",
      "prenom": "…",
      "nature": "particulier|entreprise",
      "typesPartenariat": ["…"],
      "siteUrl": "…",
      "chatbotUrl": "…"
    }
  ]
}
```

Le public n'expose ni `ficheId`, ni email, ni téléphone. Les coordonnées de la
carte (`x`, `y`, `building`, `size`) ne sortent jamais du microservice : elles
sont calculées côté landing.

### 5. Sécurité

- **Ingestion non publique** : le reverse proxy n'expose que
  `GET /partenaires` ; `/internal/*` est bloqué en externe (`allow 127.0.0.1;
  deny all;` ou non routé). Défense en profondeur : signature HMAC en plus de
  la restriction réseau.
- **HMAC** : signature vérifiée à temps constant ; rejet si absente ou
  invalide ; taille de corps bornée ; rate-limit. Le secret HMAC est saisi
  dans l'auth du webhook ONIR-CMS (chiffré) et stocké côté microservice.
- **SSRF** : le garde SSRF d'ONIR-CMS interdit par défaut le loopback et le
  réseau privé. L'endpoint « Partenaires » doit donc activer explicitement
  `allow_private_network` (option administrateur, auditée) pour joindre
  `127.0.0.1`.
- **Idempotence** : upsert par `fiche_id` ; re-déclencher le webhook ne crée
  pas de doublon.
- **Lecture publique** : CORS restreint, cache, aucune donnée personnelle
  au-delà des champs publics.
- **Rétention** : les livraisons ONIR-CMS restent soumises à la rétention
  ADR-0035 (30 jours) ; les partenaires publiés persistent dans SQLite jusqu'à
  retrait.

### 6. Landing

- Un adaptateur `GET /partenaires` → modèle « sponsor » :
  - `nom` (+ `prenom` si particulier) → nom affiché ;
  - `nature` → `kind` (`person` / `organization`) et libellé ;
  - `typesPartenariat` → étiquettes de parrainage ;
  - `siteUrl` / `chatbotUrl` → actions « Site » / « Discuter » ;
  - `x`, `y`, `building`, `size`, `couleur` calculés côté landing.
- **Fallback** : si le microservice est indisponible, la landing réutilise les
  données statiques `sponsors.js` (maquette) ; la carte ne casse jamais.
- **Capacité** : la ville SVG actuelle n'a qu'une douzaine d'emplacements.
  Avec ~100 partenaires, il faut trancher entre un sous-ensemble « mis en
  avant » + une liste complète, ou une adaptation du rendu (grille paginée,
  zoom, 3D). C'est une décision UX, hors du périmètre de cet ADR.

## Conséquences

### Positives

- ONIR-CMS reste générique : il gagne les webhooks sur fiches de collecte sans
  connaître le domaine partenaire.
- Le besoin partenaire est isolé dans un service et un dépôt dédiés.
- Publication directe et auditée via les livraisons de webhook.
- Exploitation simple : SQLite et un seul petit conteneur sur le VPS.
- La landing ne dépend que du contrat public du microservice.
- Idempotence par `fiche_id` : pas de doublons en cas de re-déclenchement.

### Négatives / risques

- Un service supplémentaire à opérer (surveillance, sauvegarde SQLite,
  rotation du secret HMAC).
- L'exception `allow_private_network` doit être limitée à cet endpoint et
  auditée.
- SQLite convient à ~100 partenaires ; une montée en charge imposerait un
  autre stockage.
- La capacité visuelle de la carte reste un point ouvert.
- Les données publiées sont définitives tant qu'aucun mécanisme de retrait
  n'est utilisé.

## Alternatives écartées

- **Endpoint public de lecture dans ONIR-CMS** : couple ONIR-CMS au besoin
  partenaire et expose le domaine. Rejeté.
- **Lecture directe de la base ONIR-CMS par la landing** : couplage fort et
  fuite de données privées. Rejeté.
- **Déclenchement automatique à la création de la fiche** : supprime la
  vérification humaine et publie des fiches non relues. Rejeté.
- **Pull via l'API publique v1 / clé d'API** : le besoin est un push manuel
  après vérification. Rejeté pour la V1.
- **Stocker les partenaires dans ONIR-CMS** : mélange des domaines. Rejeté.
- **PostgreSQL dédié pour le microservice** : disproportionné à cette
  échelle. Rejeté.

## Plan de mise en œuvre

1. Validation de cet ADR et mise à jour de l'index.
2. ONIR-CMS : migration (scope `chat_link_id` / `fiche_key`, colonnes nullables),
   domaine et repository, trigger/preview/test, payload depuis
   `fiche.definition`, UI de configuration. RBAC inchangé.
3. Nouveau dépôt `onir-partenaires-service` : squelette, schéma SQLite,
   ingestion privée HMAC, `GET /partenaires`, tests.
4. Configuration de l'endpoint webhook « Partenaires » (scope fiche de
   collecte, `allow_private_network`, HMAC, `bodyTemplate`, mappings).
5. Landing : adaptateur, fallback `sponsors.js`, décision de rendu de la carte.
6. Test de bout en bout : déclenchement → ingestion → lecture publique →
   affichage.
7. Déploiement sur le même VPS (reverse proxy : seul `GET /partenaires` est
   exposé).

## Points ouverts

- Clés et valeurs exactes des champs de la fiche de collecte (`nom`,
  `prenom`, `nature`, `typesPartenariat`, `siteUrl`, `chatbotUrl`).
- `prenom` obligatoire pour un particulier ?
- Liste fermée des types de partenariat.
- Rendu de la carte avec ~100 partenaires.
- URL publique et origines CORS du `GET /partenaires`.
- Choix HMAC vs bearer (HMAC recommandé) et procédure de rotation.

## Liens

- ADR-0002 (architecture en couches)
- ADR-0005 (matrice de rôles)
- ADR-0025 (multitenancy)
- ADR-0035 (webhooks sortants — complété pour les fiches de collecte)
- ADR-0042 (API publique v1)
- ADR-0049 (configuration chatbot et fiches de collecte)
- ADR-0050 (fiches de collecte réutilisables et versionnées)
- ADR-0055 (fiches indépendantes du modèle de raisonnement)
- ADR-0056 (création manuelle depuis une fiche de collecte)
