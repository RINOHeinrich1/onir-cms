# 0013. Médias — photothèque et liens proposés par l'IA

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Décideurs** : équipe projet

## Contexte

Le chat de prospection s'appuie déjà sur le mini-RAG des connaissances : pour
chaque message, le LLM sélectionne les informations internes utiles et leur
contenu est injecté au prompt. On veut désormais que l'IA puisse **aussi
proposer des médias** (images et liens) au visiteur, sans nuire à la latence de
la réponse ni multiplier les appels IA inutiles.

Contraintes :
- deux natures de médias : **photo** (fichier importé) et **lien** (URL) ;
- même principe que les connaissances : libellé unique référencé par l'IA,
  portée globale ou par modèle, actif/inactif, CRUD ;
- un lien de chat choisit, via des cases à cocher, **quelles sources sont
  recherchées** (connaissances / photothèque / liens) ;
- l'expérience de réponse est **asynchrone** : le texte arrive d'abord, les
  médias (images surtout) s'affichent ensuite ;
- la recherche de médias ne doit **pas** être déclenchée quand elle est inutile.

## Décision

### 1. Modèle de données (migration `0013_medias.sql`)

```sql
CREATE TABLE medias (
  id uuid PK,
  type text CHECK (type IN ('photo','lien')),
  libelle text NOT NULL,          -- référencé tel quel par l'IA
  template_key text,              -- NULL = globale, sinon portée au modèle
  actif boolean NOT NULL DEFAULT true,
  fichier text, mime text,        -- photo : clé de stockage + MIME
  url text,                       -- lien  : URL externe
  created_by uuid, created_at, updated_at,
  CHECK ((type='photo' AND fichier IS NOT NULL) OR (type='lien' AND url IS NOT NULL))
);
UNIQUE INDEX medias (type, lower(libelle));

ALTER TABLE chat_links   ADD sources jsonb NOT NULL DEFAULT '{"connaissances":true,"phototheque":true,"lien":true}';
ALTER TABLE chat_messages ADD medias jsonb;   -- NULL = non calculé ; '[]' = calculé (rien) ; liste sinon
```

- **Portée** identique aux connaissances : `template_key` NULL = toutes les
  conversations, sinon réservé à un modèle de raisonnement.
- **Unicité** du libellé au sein d'une nature (les libellés photos et liens sont
  deux espaces de noms distincts, l'IA sélectionne par nature).
- `chat_messages.medias` est **nullable** : `NULL` distingue « pas encore
  calculé » de `'[]'` « calculé, rien de pertinent » → **marqueur d'idempotence**.

### 2. Domain (pur, sans framework)

- `domain/entities/media.ts` : `Media`, `TypeMedia`, `validateMediaMeta`,
  `validateMediaLien` (URL http/https), whitelist MIME + taille photo.
- `domain/entities/chat.ts` : `ChatLinkSources` + `parseLinkSources` (défaut
  toutes activées), `ChatLink.sources`, `ChatMessageMedia`, `ChatMessage.medias`
  + `ChatMessage.mediasComputed`.

### 3. Ports & adapters (hexagonal)

| Port | Adapter | Rôle |
|---|---|---|
| `MediaRepository` | `db/media-repository.ts` | CRUD + `listActivesByType(type, templateKey)` |
| `MediaStorage` | `storage/disk-media-storage.ts` | `save/read/remove` d'un fichier, **swappable** (S3…) |
| `ChatLinkRepository` | `db/chat-link-repository.ts` | + `sources` |
| `ConversationRepository` | `db/conversation-repository.ts` | + `findMessage`, `setMessageMedias` |

**Stockage** : le fichier photo est écrit **hors base et hors `public/`**
(répertoire `MEDIA_DIR`, défaut `var/media`), via le port `MediaStorage`. Le port
permet de migrer vers un stockage objet sans toucher au métier (scalabilité).

**Accès public** : `GET /api/medias/[id]/file` sert le fichier par **UUID non
énumérable** (le visiteur du chat est anonyme). Clé validée par motif
(UUID.ext) côté adapter → anti-traversée.

### 4. Cas d'usage

- `medias/manage-medias.ts` : `listMedias`, `createMediaLien`,
  `createMediaPhoto` (métadonnées + MIME + taille ; nettoyage du fichier si la
  persistance échoue), `updateMedia`, `deleteMedia` (retire le fichier).
- `medias/select-chat-media.ts` : mini-RAG médias. Charge les photos/liens
  actifs **selon `link.sources`** et la portée, catalogue leurs libellés, l'IA en
  choisit (JSON), résout (**≤ 3**), persiste. **Échec silencieux** → `[]` ;
  seuls les libellés connus sont retenus.

### 5. Flux asynchrone — gate serveur + idempotence

Le texte ne doit jamais attendre la recherche d'image, et cette recherche ne
doit tourner que sur les liens qui ont réellement des médias.

1. `sendMessage` calcule un **gate serveur sans IA** :
   `mediaEligible = (sources.phototheque||sources.lien) ET (média actif en portée)`.
   Le prompt de réponse reste **strictement inchangé** (aucune consigne média) :
   la latence du texte est identique à avant. `mediaPending = mediaEligible`.
2. Le client affiche le texte, puis **seulement si `mediaPending`** appelle
   `POST /api/chat/media { conversationId, messageId }` (fire & forget) et
   attache les médias reçus à ce message.
3. `/api/chat/media` est **idempotent par `messageId`** :
   `chat_messages.medias IS NOT NULL` ⇒ renvoie le cache (**0 appel IA**) ;
   sinon sélection IA (catalogue de libellés photos/liens) → résolution →
   persistance → réponse. La sélection renvoie `[]` quand aucune ressource n'aide
   (aucun média affiché) : la décision « média utile ? » est prise dans ce même
   appel, borné à 150 tokens (~0,4 s) et **hors du chemin texte**.

> Variante écartée après test de bout en bout : demander au modèle de préfixer sa
> réponse par une **sentinelle** `[[MEDIA:oui|non]]` pour décider dans l'appel
> principal (0 appel IA supplémentaire). En isolation la sentinelle est obéie,
> mais le **persona long du modèle de raisonnement l'écrase** (testé en tête de
> prompt, en dernier message `system` et dans le tour visiteur). On privilégie
> donc un point de décision **fiable** (l'endpoint asynchrone), quitte à un petit
> appel supplémentaire **uniquement** sur les liens ayant des médias.

### 6. Options de lien (`data:`)

Trois cases à cocher dans le formulaire de création et la modale d'édition :
**connaissances / photothèque / liens**, **toutes cochées par défaut** (opt-out).
`sendMessage` n'interroge les connaissances que si la case est cochée ; le même
principe s'applique aux médias.

### 7. RBAC

`medias:list/read/create/update/delete` — admin et marketeur : tout ;
**lecteur** : `list` + `read`. Aligné sur les connaissances.

## Conséquences

### Positives

- Texte jamais ralenti par la sélection média (2ᵉ requête, post-réponse).
- Aucun coût média sur les liens sans média (gate) ; résultat vide mémorisé.
- Idempotence naturelle par `messageId` (cache persistant).
- Zéro impact sur les liens sans média (prompt strictement identique).
- Stockage découplé (port `MediaStorage`) → migrable vers un objet-store.

### Négatives / Risques

- Un petit appel IA de sélection par réponse sur les liens ayant des médias
  (~0,4 s, 150 tokens max), hors du chemin texte et mis en cache par message.
- L'accès public par UUID repose sur la non-devinabilité de l'identifiant (déjà
  le modèle du chat public) ; les photos sont destinées à être montrées.
- Deux appels IA possibles par message (réponse + sélection média) **uniquement
  si** un média est utile.

## Alternatives envisagées

- **SSE / streaming** (texte + événement média) : rejeté — l'app est en JSON
  simple ; la latence perçue est déjà bonne avec 2 requêtes.
- **Sentinelle dans l'appel de réponse** : écartée — non fiable face au persona
  du modèle (cf. §5).
- **Décision par heuristique mots-clés** : rejeté — faux négatifs.
- **Fichiers en base (bytea)** : rejeté — alourdit base et sauvegardes.

## Liens

- US-MEDIA-001, US-CHAT-004 (connaissances), ADR-0012 (mini-RAG connaissances).
