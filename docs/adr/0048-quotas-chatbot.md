# 0048. Quotas par chatbot — fiches à vie et budget de tokens

- **Statut** : Accepté
- **Date** : 2026-10-28
- **Décideurs** : équipe projet
- **Référence** : ADR-0029 (fournisseurs IA), ADR-0043 (conversations),
  ADR-0046 (incidents), ADR-0047 (extraction).

## Contexte

Un chatbot peut générer un volume non borné de fiches et consommer un budget
IA important. L’exploitant veut pouvoir fixer, **par chatbot** :

1. un nombre maximal de fiches, à vie ;
2. un budget maximal de tokens, réinitialisable manuellement ou
   automatiquement après une durée paramétrée.

La production doit rester lisible dans le dashboard, tandis que la surface
publique doit s’arrêter proprement lorsqu’un quota est atteint.

## Décision

### 1. Les quotas sont portés par `chat_links`

Le chatbot est le lien de chat (`chat_links`). Chaque lien porte :

```text
max_fiches                 integer NULL   -- NULL = illimité, 0 = bloqué
max_tokens                 bigint NULL    -- NULL = illimité, 0 = bloqué
token_reset_mode           manual | duration
token_reset_days           integer NULL   -- requis en mode duration
tokens_used                bigint         -- période courante
token_period_started_at    timestamptz    -- début de la période
fiches_generated           integer        -- compteur atomique à vie
```

Les contraintes SQL interdisent les valeurs négatives, une durée hors
`1..3650` et un mode `duration` sans durée. `max_fiches` et `max_tokens`
acceptent `0` : le chatbot est alors bloqué dès le départ.

La migration `0058_chatbot_quotas.sql` backfill `fiches_generated` depuis les
fiches existantes, via leur conversation.

### 2. Fiches : quota à vie, compteur atomique

Chaque création de fiche réserve atomiquement une unité :

```sql
UPDATE chat_links
   SET fiches_generated = fiches_generated + 1
 WHERE id = $1
   AND (max_fiches IS NULL OR fiches_generated < max_fiches)
```

La réservation est faite juste avant `fiches.create`, puis libérée si la
création échoue. Deux créations concurrentes ne peuvent donc pas dépasser la
limite.

Le quota s’applique à toutes les créations de fiche du chatbot, y compris la
génération manuelle depuis le dashboard. Les fiches archivées restent comptées :
le quota est à vie.

### 3. Tokens : budget par période, toutes opérations IA

Le budget couvre **toutes les opérations IA du chatbot** :

- réponse de chat ;
- sélection des connaissances (mini-RAG) ;
- sélection des médias ;
- détection de l’état du visiteur ;
- extraction des champs ;
- extraction de fiche, y compris les tentatives de secours.

Le client OpenAI-compatible remonte `prompt_tokens`, `completion_tokens` et
`total_tokens` via `onUsage`. Si le fournisseur ne les renvoie pas, une
estimation conservative est utilisée (`caractères / 4`). Chaque appel est
tracé dans `chat_link_ai_usage` (audit) et incrémente `tokens_used`.

Le contrôle est effectué avant chaque nouvelle opération IA. La requête déjà
engagée peut terminer au-dessus du plafond ; le blocage est effectif pour
l’opération suivante. Ce choix évite de couper une réponse en cours de
génération.

### 4. Réinitialisation

- `manual` : un administrateur clique sur « Réinitialiser les tokens » ;
- `duration` : à chaque lecture/enregistrement, une période échue est remise à
  zéro automatiquement.

Un reset tokens remet `tokens_used = 0` et `token_period_started_at = now()`.
Il ne touche jamais `fiches_generated`.

### 5. Blocage public

Lorsqu’un quota est atteint :

- `/l/[token]` et `/embed/[token]` affichent une page dédiée ;
- `/api/chat/session` et `/api/chat` répondent `423 Locked` ;
- `/api/chat/finish` et la génération manuelle de fiche sont refusés ;
- les conversations et fiches existantes restent accessibles dans le dashboard.

La page indique la raison (limite de fiches ou budget de tokens), sans exposer
de données internes. Le widget reçoit le signal `ready` pour ne pas rester sur
un loader.

### 6. Administration

Le formulaire de création/édition expose les limites, le mode de reset et la
durée. La liste des chatbots affiche la consommation et l’état `bloqué`.
L’édition affiche le compteur courant et permet le reset manuel des tokens.

## Conséquences

- Une écriture `chat_links` supplémentaire par lecture pour appliquer le reset
  automatique échu ;
- une écriture d’audit par appel IA ;
- un quota de tokens est un plafond souple à la frontière d’une requête ;
- les quotas ne créent pas d’alerte e-mail : le blocage est visible dans
  l’administration et sur la page publique.

## Hors périmètre

- quota par conversation ou par visiteur ;
- facturation en devise ;
- alerte e-mail/SMS à l’atteinte du quota ;
- report automatique du budget non consommé.
