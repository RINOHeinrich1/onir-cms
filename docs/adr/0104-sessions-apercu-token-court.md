# 0104. Sessions d’aperçu éphémères — token court à la place des paramètres dans l’URL

- **Statut** : Proposé
- **Date** : 2026-11-21
- **Décideurs** : équipe projet
- **Référence** : ADR-0023, ADR-0040, ADR-0103.
- **Complète** : ADR-0023 (paramètres de template) et ADR-0040 (surface widget).
- **Remplace** : aucune.

## Contexte

Le studio d’affichage envoie l’état complet de l’aperçu dans l’URL de
l’iframe (`template`, puis `params` encodés en base64url). Cet état contient
tous les paramètres du template, y compris les valeurs par défaut des objets et
tableaux.

Avec Nutriva 1.4.1, l’URL générée au changement de version atteint environ
**12,7 Ko**. Nginx coupe la connexion quand la ligne de requête/les entêtes
dépassent ses buffers (environ 10 Ko dans l’environnement actuel). Le navigateur
affiche alors « la connexion a été interrompue de manière inattendue », alors
que l’application n’a jamais reçu la requête.

Le problème est aggravé par le fait que l’état enregistré/rechargé peut être
plus court que l’état fusionné produit par un changement de version, ce qui
explique pourquoi le même template fonctionne après rechargement mais pas après
un switch dans le studio.

Remonter l’iframe ne corrige pas le problème : la requête est trop longue avant
d’atteindre l’application.

## Décision

### 1. Un token d’aperçu court dans l’URL

Le studio crée une **session d’aperçu éphémère** côté serveur. L’iframe ne
reçoit qu’un token opaque :

```text
/liens/{linkId}/apercu?embed=1&surface=page&preview=pv_xxx&v=12
```

```text
/embed/{linkToken}/preview?preview=pv_xxx&position=bottom-right&v=12
```

Le token ne contient aucune donnée de template. Il est stocké **haché**
(SHA-256) en base ; le clair n’est retourné qu’au studio.

### 2. Session serveur courte

Une table `preview_sessions` porte l’état :

```text
token_hash, user_id, organization_id, link_id, surface,
template_id, template_version, params jsonb,
expires_at, created_at, updated_at
```

- TTL : **15 minutes**, prolongé à chaque mise à jour ;
- une session est liée à l’utilisateur, l’organisation, le lien et la surface ;
- les sessions expirées sont nettoyées à la création d’une nouvelle session ;
- `params` est borné et normalisé par les règles existantes des paramètres.

Le studio utilise un `POST` idempotent :

1. sans token : création ;
2. avec token valide : mise à jour de la même session ;
3. avec token expiré/invalide : création d’une nouvelle session.

### 3. Mise à jour de l’aperçu

Le studio envoie l’état au serveur avec un debounce (240 ms). Après réponse, il
met à jour la révision `v` dans l’URL de l’iframe. Le token reste stable.

- changement de template/version : nouvelle valeur dans la session ;
- modification de paramètre : mise à jour de la session ;
- l’iframe recharge la même URL courte avec `v` incrémenté ;
- aucun paramètre de template n’est remis dans l’URL.

### 4. Widget

`/widget/v2.js` accepte une session preview :

```text
data-onir-preview-token="pv_xxx"
data-onir-preview-revision="12"
```

Il construit alors :

```text
/embed/{linkToken}?preview=pv_xxx&v=12
```

Le mode legacy `preview=1&template=...&params=...` reste accepté pour les liens
déjà ouverts, mais n’est plus produit par le studio.

### 5. Chatbot public et temps réel

Le chatbot public continue d’utiliser son URL courte existante :

```text
/embed/{linkToken}
```

Les paramètres du template sont lus depuis le lien en base. Les messages et
actions temps réel passent par SSE (`/stream?conversationId=...`), les POST
d’actions et `postMessage`. Les paramètres de template ne sont pas nécessaires
au temps réel et ne doivent pas revenir dans l’URL.

## Alternatives écartées

### Augmenter les buffers Nginx

Solution de secours acceptable temporairement, mais elle ne règle pas le fond :
l’URL reste énorme, les paramètres restent dans les logs et une nouvelle
croissance des paramètres recréera la panne.

### Compresser les paramètres dans l’URL

Réduit la taille mais ne garantit pas de rester sous la limite et conserve
l’exposition des paramètres. Refusé comme solution cible.

### Remonter l’iframe

Ne change pas la taille de la requête. Le navigateur peut toujours fermer la
connexion avant l’application. Insuffisant.

### SessionStorage/postMessage uniquement

Fonctionne dans certains parcours, mais complique l’ouverture dans un nouvel
onglet, le rechargement et les aperçus widget. Le token serveur est plus
déterministe.

### Transmettre les paramètres en temps réel

Inutile : les paramètres sont de la configuration statique. Le temps réel
concerne les messages et actions, pas le schéma du template.

## Conséquences

### Positives

- URL d’aperçu courte, indépendante de la taille des paramètres ;
- plus de coupure Nginx liée aux paramètres ;
- paramètres absents des logs et de l’historique navigateur ;
- aperçu multi-nœuds fiable via PostgreSQL ;
- le chatbot public et le temps réel restent inchangés.

### Négatives

- une lecture supplémentaire par ouverture d’iframe ;
- une écriture débouncée par modification d’aperçu ;
- nouvelle table et nettoyage des sessions expirées ;
- le token doit être protégé et lié à l’utilisateur, l’organisation, le lien et
  la surface ;
- le mode legacy doit rester quelque temps pour les onglets déjà ouverts.

## Migration

- création de `preview_sessions` et de ses index ;
- aucun changement des tables de templates, liens ou conversations ;
- le studio produit progressivement les nouvelles URL ;
- le mode legacy `template`/`params` reste lu jusqu’à suppression explicite.

## Vérifications attendues

- switch 1.3.3 → 1.4.1 : URL courte, réponse 200, template 1.4.1 rendu ;
- modification de paramètre : session mise à jour, iframe rechargée avec `v` ;
- token expiré : nouvelle session, aperçu toujours fonctionnel ;
- token d’un autre utilisateur/lien/surface : refusé ;
- aperçu page et widget ;
- chatbot public `/embed/{linkToken}` sans `params` dans l’URL ;
- temps réel SSE inchangé ;
- aucune régression sur les liens legacy.
