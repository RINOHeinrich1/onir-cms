# 0096. Conservation des limites de messages et de stockage dans les profils

- **Statut** : Accepté
- **Date** : 2026-11-18
- **Décideurs** : équipe projet
- **Référence** : ADR-0065, ADR-0066, ADR-0089.

## Contexte

Le backoffice commercial permet de modifier un profil de limites ONIR-CMS. Il
envoie notamment :

```json
{
  "maxChatbots": 1,
  "maxTokens": 20000,
  "maxMessages": 100,
  "messageLimitPolicy": "block",
  "maxStorageMb": 50
}
```

L'API plateforme validait ce payload avec `parseInvitationProvisioning`.
Cette fonction ne connaissait que `maxChatbots`, `maxTokens`, les allocations
IA et la réinitialisation des tokens.

Les champs `maxMessages`, `messageLimitPolicy` et `maxStorageMb` étaient donc
supprimés silencieusement par la validation. La mise à jour remplaçait ensuite
tout le JSON `limit_profiles.provisioning` par l'objet tronqué.

Conséquences observées :

- un profil configuré à 100 messages passait à `null` ;
- l'interface affichait « illimité » ;
- une nouvelle modification répétait la perte, donnant l'impression que le
  formulaire ne pouvait plus corriger la valeur.

## Décision

### 1. Contrat de provisioning complet

`OrganizationProvisioning` porte désormais :

```text
maxChatbots
maxTokens
maxMessages
messageLimitPolicy  block | recycle
maxStorageMb
tokenResetMode
tokenResetDays
allocations
defaults
```

`parseInvitationProvisioning` valide et conserve ces champs.

### 2. Synchronisation vers les organisations

L'application d'un profil met à jour :

- `organizations.max_chatbots` ;
- `organizations.max_storage_bytes` (conversion Mo → octets) ;
- `organization_ai_budgets.max_tokens` ;
- `organization_ai_budgets.max_messages` ;
- `organization_ai_budgets.message_limit_policy` ;
- la périodicité de réinitialisation.

La création d'une organisation par invitation applique le même snapshot.

### 3. Application du quota de messages

Avant l'envoi d'un message visiteur :

- le budget de l'organisation est verrouillé ;
- le compteur `messages_used` est vérifié ;
- si la limite est atteinte :
  - politique `block` : le message est refusé avec `AiQuotaExceededError` ;
  - politique `recycle` : les 20 messages les plus anciens de la conversation
    sont purgés, puis le message est accepté si au moins un message visiteur a
    été libéré.

Le compteur est réinitialisé avec `tokens_used` lors du renouvellement de
période ou d'une remise à zéro manuelle.

### 4. Interface plateforme

Le gestionnaire de profils ONIR expose à nouveau :

- messages inclus par mois ;
- politique en cas d'épuisement ;
- stockage inclus en Mo.

### 5. Prévention de régression

Un test vérifie que les trois champs sont conservés et qu'une valeur non
entière est refusée. Aucune migration n'est nécessaire : les colonnes
`max_messages`, `messages_used`, `message_limit_policy` et
`max_storage_bytes` existent déjà.

## Conséquences

- Une modification de profil ne perd plus les quotas de messages et de
  stockage.
- Les profils déjà tronqués doivent être **reconfigurés une fois** avec leurs
  valeurs souhaitées.
- Un champ inconnu reste ignoré : tout nouveau champ de provisioning devra
  être ajouté au type et au parseur, avec un test dédié.
