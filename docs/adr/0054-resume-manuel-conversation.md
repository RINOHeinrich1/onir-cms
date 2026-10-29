# 0054. Résumé manuel de conversation, indépendant des fiches

- **Statut** : Accepté
- **Date** : 2026-10-29
- **Décideurs** : équipe projet
- **Référence** : ADR-0043 (intervention humaine), ADR-0048 (quotas),
  ADR-0049 (configuration chatbot et fiches 0..N), ADR-0053 (sauvegarde).

## Contexte

Le wizard de création de chatbot avait hérité d’une « fiche principale »
fabriquée côté client lorsque la configuration ne contenait aucune fiche. Ce
comportement masquait le cas légitime « 0 fiche » et faisait croire à une fiche
de collecte inexistante.

Les opérateurs ont néanmoins besoin d’un résumé de conversation pour ne pas se
perdre dans un échange long. Ce résumé ne doit pas être une fiche de collecte :
il ne collecte aucun champ, il ne doit pas être compté dans `max_fiches`, et il
doit pouvoir exister même sans fiche.

Le résumé ne doit pas être généré automatiquement à chaque clôture : son coût
IA et son intérêt dépendent du contexte. Il doit rester une action manuelle,
disponible avant et après la finalisation.

## Décision

### 1. Objet séparé des fiches

Une conversation peut avoir :

- `0..N` fiches de collecte ;
- `0..1` résumé courant.

Le résumé est stocké dans `conversation_summaries`, jamais dans
`chatbot_configs.fiches` et jamais dans `fiches`.

Une configuration avec `0` fiche est valide. Aucun résumé automatique n’est
créé à la clôture.

### 2. Une seule ligne par conversation, écrasement

La table porte une contrainte d’unicité sur `conversation_id`.

Une régénération écrase le résumé existant :

```text
content
provider
model
tokens_used
source_message_count
source_last_message_at
generated_while_finalized
generated_by
generated_at
updated_at
```

Aucun historique de versions n’est conservé. L’écrasement est explicite et
réservé aux utilisateurs autorisés.

### 3. Génération manuelle avant et après finalisation

- Le résumé peut être généré sur une conversation en cours.
- Il peut aussi être généré après finalisation.
- Si un résumé existe déjà après finalisation, il est servi directement.
- Aucune régénération automatique n’a lieu.
- Une régénération reste possible manuellement si le résumé est insuffisant ou
  pour essayer un autre modèle.

Un résumé généré avant la clôture est marqué comme partiel/antérieur à la
clôture. Après clôture, l’interface le signale sans le remplacer.

### 4. Modèle IA

Par défaut, le résumé utilise le fournisseur et le modèle du chatbot.

Un utilisateur disposant du droit d’assignation IA peut choisir un autre
fournisseur/modèle au moment de la génération. Le fournisseur et le modèle
effectivement utilisés sont stockés avec le résumé.

### 5. Consommation des tokens

Le résumé consomme le budget de tokens du chatbot comme les fiches.

- L’appel est tracé dans `chat_link_ai_usage` avec l’opération
  `conversation_summary`.
- Le compteur `tokens_used` du chatbot est incrémenté.
- Le quota `max_fiches` et le compteur `fiches_generated` ne sont pas touchés.
- Si le budget de tokens est épuisé, la génération est refusée.

### 6. Droits

Nouvelle action RBAC :

```text
conversations:summarize
```

- accordée aux rôles admin, marketeur et opérateur chat ;
- refusée au rôle lecteur ;
- la lecture du résumé reste couverte par `conversations:read`.

Le lecteur voit donc le résumé existant, mais ne peut ni le générer ni le
régénérer. L’API applique le contrôle, pas seulement l’interface.

### 7. Interface et API

- Un panneau « Résumé de la conversation » affiche le résumé courant.
- Le bouton « Résumer » ouvre une confirmation et, pour les utilisateurs
  autorisés, un choix de modèle.
- Le bouton « Régénérer » est secondaire et précise que le résumé sera écrasé.
- Le lecteur ne voit aucun bouton de génération.
- `GET /api/conversations/[id]/summary` lit le résumé.
- `POST /api/conversations/[id]/summary` génère ou écrase le résumé.

### 8. Migration

La migration `0063_conversation_summaries.sql` est additive. Elle ne modifie
aucune fiche, configuration ou conversation existante.

## Conséquences

### Positives

- Le résumé est disponible indépendamment du nombre de fiches.
- Aucun résumé automatique coûteux n’est généré.
- Le cas `0 fiche` devient explicite et valide.
- Les opérateurs peuvent résumer avant la fin de l’échange.
- Le lecteur conserve l’accès en lecture.

### Négatives / risques

- Un résumé généré avant la clôture peut être partiel.
- L’écrasement ne conserve pas l’ancien résumé.
- Un résumé peut consommer des tokens sans produire de fiche.
- Une conversation très longue doit être bornée avant l’appel IA.

## Hors périmètre

- résumé automatique à la clôture ;
- historique des versions de résumé ;
- résumé partagé entre conversations ;
- résumé par fiche ou par prospect ;
- export PDF/Markdown du résumé.
