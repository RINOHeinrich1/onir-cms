# 0036. Configuration des secrets applicatifs depuis le panneau

- **Statut** : Accepté
- **Date** : 2026-10-26
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0005 (RBAC), ADR-0025 (organisations),
  ADR-0026 (compte de lecture), ADR-0029 (fournisseurs IA), ADR-0035
  (webhooks).

## Contexte

Les secrets applicatifs sont aujourd'hui répartis dans plusieurs variables
d'environnement :

- `SESSION_SECRET`
- `LINK_TOKEN_KEY`
- `AI_PROVIDER_KEY`
- `WEBHOOK_SECRET_KEY`

Ils doivent être générés, changés et vérifiés depuis `/configuration`, réservé
au super-administrateur. La configuration multi-niveaux actuelle est source
d'erreurs : une clé absente ou invalide bloque une fonctionnalité sans que
l'interface ne l'explique.

La page ne doit pas devenir un moyen de modifier la configuration
d'infrastructure : `DATABASE_URL`, `POSTGRES_PASSWORD`, `APP_URL`, les ports et
les chemins de volumes restent des réglages de déploiement. De même, une clé
racine reste nécessaire pour chiffrer les secrets stockés en base.

## Décision

### 1. Un seul secret d'amorçage

La configuration conserve **une seule variable technique** :

```text
CONFIG_MASTER_KEY
```

- 64 caractères hexadécimaux (32 octets).
- Chiffre AES-256-GCM les valeurs de la table `app_secrets`.
- N'est jamais stockée en base, ni affichée par l'application.
- Doit être sauvegardée avec la base : sans elle, les secrets gérés sont
  illisibles.

Tous les autres secrets applicatifs sont gérés dans `/configuration` :

- `SESSION_SECRET` — signatures des URLs médias/pièces jointes et chiffrement
  `secret-box` ;
- `LINK_TOKEN_KEY` — chiffrement des jetons de liens et d'invitations ;
- `AI_PROVIDER_KEY` — chiffrement des clés de fournisseurs IA ;
- `WEBHOOK_SECRET_KEY` — chiffrement des secrets de webhooks.

### 2. Stockage

```text
app_secrets
  key text PRIMARY KEY
  value_enc text NOT NULL
  fingerprint text NOT NULL
  version integer NOT NULL DEFAULT 1
  updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL
  updated_at timestamptz NOT NULL DEFAULT now()

app_secret_audit
  id bigserial PRIMARY KEY
  key text NOT NULL
  action text NOT NULL -- import | generate | replace
  fingerprint_before text NULL
  fingerprint_after text NOT NULL
  actor_id uuid NULL REFERENCES users(id) ON DELETE SET NULL
  created_at timestamptz NOT NULL DEFAULT now()
```

- Table globale, sans `organization_id` : les secrets sont ceux de la
  plateforme.
- `value_enc` contient `v1:<iv>:<tag>:<ciphertext>` (base64url), avec
  `CONFIG_MASTER_KEY` et l'AAD `onir:app-secret:<key>:v1`.
- `fingerprint` est un SHA-256 tronqué : il permet de comparer deux versions
  sans exposer le secret.
- Aucun `GET` ne renvoie `value_enc` ni la valeur en clair.

### 3. Amorçage et migration

Au démarrage :

1. `CONFIG_MASTER_KEY` est lu et validé.
2. Les secrets présents en base sont déchiffrés et chargés en cache.
3. Pour chaque clé absente :
   - la valeur d'environnement existante est importée si elle est valide ;
   - sinon une valeur aléatoire de 64 hexadécimaux est générée.
4. La base devient la source de vérité.

Si `CONFIG_MASTER_KEY` est absente, le mode historique reste actif : les
variables d'environnement sont utilisées et la gestion depuis l'interface est
désactivée. Une fois les valeurs importées et validées, les quatre anciennes
variables peuvent être retirées de `.env.release`.

### 4. Génération et remplacement

- **Générer** : le serveur produit `randomBytes(32).toString("hex")`.
- **Remplacer** : l'administrateur saisit une valeur de 64 caractères
  hexadécimaux.
- La valeur générée est affichée **une seule fois**, avec un bouton copier.
- Une valeur existante n'est jamais réaffichée. Pour la changer, on la
  remplace.
- Validation stricte : `^[0-9a-f]{64}$` pour les quatre clés gérées depuis
  l'interface.

### 5. Rotation avec ré-chiffrement

Une rotation ne consiste pas à changer uniquement la valeur : les données
chiffrées avec l'ancienne clé doivent être migrées dans la même transaction.

| Clé | Données ré-chiffrées |
|---|---|
| `SESSION_SECRET` | `template_reader_credentials` (secret `secret-box`) |
| `LINK_TOKEN_KEY` | `chat_links.token_enc`, `organization_invitations.token_enc` |
| `AI_PROVIDER_KEY` | `ai_providers` (`api_key_ciphertext`, `api_key_iv`, `api_key_tag`) |
| `WEBHOOK_SECRET_KEY` | `webhook_endpoints` (`auth_config_enc`, secrets de `headers` et `query_params`) |

Règles :

- transaction PostgreSQL unique : ré-chiffrement puis mise à jour de
  `app_secrets` ;
- rollback complet en cas d'erreur ;
- audit avant/après par empreinte ;
- URLs signées médias/pièces jointes : les anciennes expirent sous 1 h ;
- un cache mémoire est rafraîchi immédiatement après la rotation ;
- en multi-instance, un rafraîchissement périodique évite de conserver
  indéfiniment l'ancienne valeur.

### 6. Interface et permissions

La page `/configuration` reste accessible uniquement si
`actor.isSuperAdmin === true`. Les routes API utilisent `requireSuperAdmin`.

Section **Secrets applicatifs** :

- nom, usage, source (`base` / `environnement` / `absente`) ;
- empreinte et date de dernière modification ;
- impact de la rotation (nombre de liens, invitations, fournisseurs,
  webhooks, identifiants scellés) ;
- boutons **Générer** et **Remplacer** ;
- confirmation explicite avant rotation ;
- valeur générée affichée une seule fois.

Aucun secret n'est exposé dans le HTML initial, les logs, les erreurs ou les
outils de diagnostic.

### 7. Architecture

- **Domaine / application** : définitions des quatre clés, validation,
  descriptions et règles de rotation.
- **Infrastructure** : chiffrement avec `CONFIG_MASTER_KEY`, repository
  `app_secrets`, cache runtime, ré-chiffrement transactionnel.
- **Adapters entrants** : routes `/api/admin/app-secrets` et composant client
  de `/configuration`.
- Les fonctions de chiffrement existantes (`link-crypto`, `ai-crypto`,
  `webhook-crypto`, `secret-box`) reçoivent leur clé via le cache applicatif.
  Les codecs acceptent une clé explicite pour permettre la rotation.

### 8. Hors périmètre

- `CONFIG_MASTER_KEY` reste dans l'environnement ; sa rotation est une
  opération de maintenance documentée.
- `DATABASE_URL`, `POSTGRES_PASSWORD`, `TEMPLATE_DATABASE_URL` restent des
  réglages d'infrastructure.
- `APP_URL`, ports, volumes, images et versions restent des réglages de
  déploiement.
- Pas de gestion de secrets par organisation : ces clés sont globales.
- Pas de fournisseur de secrets externe (Vault, KMS) en V1 ; l'architecture
  laisse la porte ouverte.

## Conséquences

### Positives

- Une seule variable technique en production : `CONFIG_MASTER_KEY`.
- Génération et rotation sans édition manuelle de `.env.release`.
- Valeurs masquées, auditables et jamais réaffichées.
- Rotation atomique des données dépendantes.
- Page déjà réservée au super-admin, cohérente avec l'administration
  plateforme.

### Négatives / risques

- Perte de `CONFIG_MASTER_KEY` = perte de tous les secrets gérés en base.
- La base et la clé racine doivent être sauvegardées ensemble.
- Les rotations manipulent des données sensibles : tests et sauvegarde
  préalable recommandés.
- Un cache multi-instance peut retarder la prise en compte d'une rotation.
- La valeur d'une clé existante n'est pas consultable : il faut la remplacer
  en cas de perte.

## Alternatives écartées

- **Tout mettre en clair en base** : fuite de tous les secrets avec la base.
- **Supprimer toute variable d'environnement** : impossible sans réduire
  fortement la sécurité ; il faut une racine de confiance.
- **Écrire `.env.release` depuis l'application** : couplage dangereux au
  déploiement, droits fichiers et redémarrage nécessaires.
- **Modifier `POSTGRES_PASSWORD` depuis l'interface** : risque de verrouillage
  de la connexion et opération d'infrastructure.
- **Rotation sans ré-chiffrement** : casse immédiatement les liens, les
  fournisseurs IA et les webhooks existants.

## Plan de mise en œuvre

1. Migration `0045_app_secrets.sql`.
2. Chiffrement `CONFIG_MASTER_KEY`, repository et cache runtime.
3. Import automatique depuis l'environnement / génération initiale.
4. Refactorisation des codecs de chiffrement avec clé explicite.
5. Rotations transactionnelles et audit.
6. API `requireSuperAdmin` et panneau `/configuration`.
7. Tests : validation, génération, fallback env, rotation, ré-chiffrement,
   permissions, absence de fuite.
8. Documentation `.env`, sauvegarde de `CONFIG_MASTER_KEY`, déploiement.
