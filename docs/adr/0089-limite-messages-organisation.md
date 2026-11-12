# 0088. Limite de messages par organisation

- **Statut** : Accepté
- **Date** : 2026-11-11
- **Décideurs** : équipe projet
- **Référence** : ADR-0048, ADR-0065, ADR-0066.

## Contexte

Les profils de limites protègent aujourd'hui le coût IA et le nombre de
chatbots. Ils ne limitent pas le volume de messages échangés, alors que
`chat_messages` peut devenir une des tables les plus volumineuses.

Un plafond de messages complète le plafond de tokens :

- les tokens protègent le coût fournisseur ;
- les messages protègent la base, le support et les abus.

## Décision

### 1. Champ de profil

Le provisioning d'un profil de limites accepte :

```text
maxMessages: number | null
```

- `null` ou champ vide : aucune limite ;
- `0` : aucun message autorisé ;
- valeur positive : nombre maximal de messages utilisateur par période ;
- `messageLimitPolicy` : `block` ou `recycle`.

Lorsque le plafond est atteint :

- `block` : le nouveau message est refusé ;
- `recycle` : les plus anciens messages de la conversation courante sont
  supprimés pour libérer de la place, puis le nouveau message est accepté.

Le recyclage est limité à la conversation courante et ne supprime jamais les
messages d'autres conversations.

Le champ est exposé dans la gestion des profils de limites de l'application.

### 2. Stockage du compteur

Le compteur est porté par `organization_ai_budgets` :

```text
max_messages     bigint NULL
messages_used    bigint NOT NULL DEFAULT 0
```

Il suit la même période que le budget de tokens. Le reset du budget remet
`messages_used` à zéro en même temps que `tokens_used`.

### 3. Unité comptée

Un message est compté lorsqu'un **message utilisateur** est accepté dans une
conversation.

Ne sont pas comptés :

- les réponses de l'assistant ;
- les messages d'un opérateur ;
- les messages système ;
- les événements d'outil ou de collecte.

Ainsi, une limite de 1 000 messages correspond à environ 1 000 tours
utilisateur, et non au nombre brut de lignes dans `chat_messages`.

### 4. Application

Le contrôle est effectué dans le cas d'usage d'envoi d'un message, après
résolution de l'organisation et de la conversation, avant l'écriture du message
utilisateur.

La consommation est atomique :

- lecture du budget avec verrou ;
- reset de période si nécessaire ;
- refus si `messages_used >= max_messages` ;
- incrément de `messages_used` sinon.

Un refus retourne une erreur de quota et n'écrit pas le message.

### 5. Absence de limite

L'absence de ligne de budget ou `max_messages = NULL` signifie illimité.

Le champ vide du profil est normalisé en `NULL`.

### 6. Portée

La limite est globale à l'organisation. Elle ne remplace pas les quotas
token par modèle/cluster.

## Alternatives écartées

### Compter les lignes de `chat_messages`

Rejeté : compterait aussi les réponses assistant, les messages opérateur et
les messages système, avec un coût difficile à expliquer au client.

### Limite par chatbot uniquement

Rejetée pour cette version : le profil de limites est porté par
l'organisation. Les quotas par chatbot restent un garde-fou séparé.

### Supprimer les anciens messages pour rester sous la limite

Rejeté : la limite est une limite d'usage, pas une politique de rétention.
La rétention et l'archivage restent des sujets distincts.

## Conséquences

### Positives

- Protection contre les volumes de messages et les abus.
- Plafond compréhensible pour les offres commerciales.
- Reset aligné avec la période des tokens.
- Aucun impact sur les profils existants sans `maxMessages`.

### Négatives

- Deux plafonds à surveiller : tokens et messages.
- Les clients doivent comprendre que les réponses assistant ne consomment pas
  ce compteur.
- Le compteur doit être intégré aux dashboards de consommation.

## Tests attendus

- champ vide : aucun refus ;
- `maxMessages = 0` : refus dès le premier message ;
- deux messages autorisés, troisième refusé ;
- une réponse assistant ne consomme pas le compteur ;
- reset de période : `messages_used` repart à zéro ;
- profil synchronisé : `max_messages` mis à jour sans remise à zéro du compteur ;
- invitation/provisioning : `maxMessages` transmis.
