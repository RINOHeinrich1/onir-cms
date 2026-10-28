# 0049. Configuration du chatbot, fiches de collecte et conversations 0..N fiches

- **Statut** : Accepté
- **Date** : 2026-10-28
- **Décideurs** : équipe projet
- **Référence** : ADR-0011 (modèles DB), ADR-0017 (fiches multiples),
  ADR-0038 (assistance IA), ADR-0039 (mode simple), ADR-0045 (champs de
  conversation), ADR-0048 (quotas).

## Contexte

Le parcours actuel expose la décomposition interne du produit. Pour créer un
chatbot réellement utilisable, l’utilisateur doit :

1. créer un « modèle de raisonnement » ;
2. créer des connaissances et les scoper sur une clé de modèle ;
3. créer des médias et les scoper sur une clé de modèle ;
4. créer le lien de chat, qui sélectionne une version figée du modèle.

Cette séparation impose un parcours en quatre modules et un vocabulaire
technique (« modèle de raisonnement », « portée », « clé ») éloigné du besoin
métier.

Deux erreurs de conception ont été identifiées :

1. **Le modèle de raisonnement ne devrait pas être un objet utilisateur.**
   Le comportement conversationnel appartient au chatbot. Le prompt, le rôle,
   l’objectif, la langue, le ton et les garde-fous doivent être portés par la
   configuration du chatbot.

2. **Les informations à collecter ne sont pas uniques par chatbot.**
   Un même chatbot peut devoir collecter plusieurs types d’informations selon
   l’intention du visiteur. Exemple : un chatbot destiné aux propriétaires
   d’hôtels, de voitures et de terrains, avec un prompt commun et une fiche de
   collecte différente par type de propriétaire.

L’immuabilité reste indispensable pour le **schéma de collecte** : une fiche
générée doit rester lisible et validable même si le chatbot évolue. En revanche,
les médias et les connaissances sont des contenus mutables : ils ne portent pas
la structure de la fiche.

Les données actuelles de fiches, prospects, conversations, chatbots, modèles et
contenus sont des données de test en préprod et en production. Elles peuvent
être supprimées afin de basculer sur le nouveau modèle sans migration de données
complexe. Cette suppression est une **commande explicite**, jamais une migration
automatique.

## Décision

### 1. Le chatbot est l’objet central

`chat_links` représente le chatbot. Il porte :

- son identité ;
- son type (spécifique ou standard) ;
- son prospect éventuel ;
- ses canaux de diffusion ;
- ses quotas ;
- sa configuration courante.

Le concept « modèle de raisonnement » disparaît comme objet utilisateur. Il est
remplacé par une **configuration versionnée du chatbot**.

### 2. Configuration versionnée

Chaque chatbot possède 1..N versions de configuration. Une version est
immuable et contient :

```text
system_prompt
simple_settings
  - role
  - objective
  - language
  - tone
  - guardrails
fiche_definitions[]
```

Les réglages simples sont stockés dans un document JSONB unique. Ils ne
justifient pas une relation 1:1 ni une table dédiée.

Les fiches de collecte sont stockées dans le même document de configuration,
sous forme de tableau. Chaque fiche de collecte porte :

```text
key
label
description
intent
fields[]
render_template
instructions
```

Modifier le prompt, les réglages ou une fiche de collecte crée une nouvelle
version de configuration. Les conversations et fiches existantes conservent la
version qu’elles ont utilisée.

### 3. Une conversation peut produire 0..N fiches

La relation est :

```text
conversation 1 ─── 0..N instances de fiches de collecte
conversation 1 ─── 0..N fiches générées
instance de fiche de collecte 1 ─── 0..1 fiche générée
```

Une conversation peut donc :

- ne produire aucune fiche ;
- produire une fiche ;
- produire plusieurs fiches, une par instance de fiche de collecte complétée.

Une fiche générée stocke :

```text
conversation_id
config_id
fiche_key
fiche_instance_key
data
```

La colonne `conversation_id` reste nullable pour les fiches manuelles ou
importées. Les fiches générées depuis un chatbot sont toujours liées à une
conversation et à une instance de collecte.

### 4. Registre de collecte

Une conversation possède un registre persistant d’instances de fiches de
collecte. Chaque instance a un statut :

```text
detected → active → paused → active
active → complete
active | paused → abandoned
```

Règles :

- plusieurs instances peuvent être ouvertes ;
- une seule instance est `active` pour les questions ;
- les écritures sont autorisées sur les instances en pause ;
- une instance complète ne peut pas être réactivée sans réouverture explicite ;
- une instance ne peut être abandonnée que sur décision explicite ;
- la clôture est refusée tant qu’une instance détectée est en attente.

### 5. Contrôle serveur de la clôture

Le modèle ne décide jamais seul de clôturer une conversation.

Avant clôture, le serveur vérifie le registre :

- si une instance est `detected`, `active` ou `paused`, la clôture est refusée ;
- l’utilisateur peut choisir de continuer ou d’arrêter ;
- en cas d’arrêt, les instances en attente passent en `abandoned` avec une
  raison ;
- les instances complètes génèrent leurs fiches ;
- une conversation peut être clôturée avec `outcome = sans_fiche` si aucune
  fiche n’est complète et qu’aucune instance n’est en attente.

### 6. Immuabilité et mutabilité

- **Configuration du chatbot** : immuable par version.
- **Fiche de collecte** : immuable au sein d’une version de configuration.
- **Fiche générée** : immuable après création.
- **Média** : mutable. Le message qui l’a affiché conserve un snapshot
  (identifiant, libellé, URL, type) ; les fichiers référencés ne doivent pas
  être supprimés physiquement sans conservation de l’historique.
- **Connaissance** : mutable. Aucun schéma de fiche n’en dépend.
- **Template visuel** : conserve son versionnement propre.

### 7. Portée des contenus

Les connaissances et médias ne sont plus scopés par clé de modèle.

Ils peuvent être :

- globaux ;
- scopés à un ou plusieurs chatbots ;
- éventuellement scopés à une ou plusieurs fiches de collecte.

La portée par défaut d’un contenu créé depuis un chatbot est ce chatbot. Une
portée globale doit être un choix explicite.

### 8. Quotas

Les quotas restent portés par le chatbot.

- `max_fiches` et `fiches_generated` comptent les fiches générées.
- Une conversation produisant N fiches consomme N unités.
- Une conversation produisant 0 fiche ne consomme aucune unité.
- Le quota est réservé avant la génération des N fiches.

### 9. Suppression des données de test

Aucune migration de données de fiches, prospects, conversations, chatbots,
modèles ou contenus n’est nécessaire.

Une commande explicite permet de réinitialiser ces données :

```bash
RESET_CHATBOT_TEST_DATA=yes npm run db:reset-chatbot-test-data -- --execute
```

Cette commande :

- n’est pas une migration ;
- n’est pas exécutée par `db:migrate` ;
- exige une confirmation explicite ;
- affiche les tables et les volumes avant suppression ;
- s’exécute dans une transaction ;
- ne supprime pas les organisations, utilisateurs, fournisseurs IA ni templates
  visuels.

Les anciennes tables peuvent rester en lecture pendant la transition, puis être
supprimées par une commande dédiée après validation.

## Conséquences

### Positives

- Le parcours de création ne passe plus par quatre modules.
- Le prompt et les réglages appartiennent au chatbot.
- Un chatbot peut couvrir plusieurs besoins avec un seul prompt.
- Une conversation peut produire plusieurs fiches sans mélange de schémas.
- Les anciennes fiches restent compatibles grâce au versionnement.
- La portée des contenus devient compréhensible pour l’utilisateur.

### Négatives / risques

- Le prompt d’un chatbot multi-fiches est plus complexe.
- Le registre de collecte et la clôture ajoutent de l’état à gérer.
- Les fiches multiples complexifient les quotas, les pièces jointes et les
  exports.
- La suppression des données de test est irréversible.
- Les configurations ne sont plus partagées entre chatbots : la duplication
  devient le mécanisme de réutilisation.

## Migration

1. Créer le nouveau schéma de manière additive.
2. Basculer le runtime et l’UI sur la configuration du chatbot.
3. Réinitialiser les données de test avec la commande explicite.
4. Vérifier les parcours de création, collecte, clôture et fiches.
5. Retirer les anciennes tables et le parcours « modèle de raisonnement ».

## Hors périmètre

- routage entre plusieurs modèles de raisonnement ;
- assistance IA de création des fiches de collecte ;
- versionnement des médias et connaissances ;
- répartition des configurations entre chatbots.
