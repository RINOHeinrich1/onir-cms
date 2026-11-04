# 0066. Profils de limites vivants

- **Statut** : Accepté
- **Date** : 2026-11-04
- **Décideurs** : équipe projet
- **Remplace partiellement** : ADR-0065 (la partie « offre = snapshot »).

## Contexte

L'ADR-0065 a introduit des « offres » copiées sous forme de snapshot dans
l'invitation, puis dans l'organisation à l'acceptation.

Ce fonctionnement est volontairement immutable, mais il ne correspond pas au
besoin métier : lorsqu'un super-admin modifie une offre, les organisations déjà
créées ne reçoivent pas la modification. Une baisse de `maxChatbots` de 3 à 2
laisse donc les organisations existantes à 3.

Le vocabulaire « offre » est par ailleurs trop commercial. Le concept est un
**profil de limites** assigné à une organisation.

## Décision

### 1. Remplacer les offres par des profils de limites

Le vocabulaire produit devient :

```text
Profil de limites
Profils de limites
Assigner un profil
```

Un profil de limites contient :

- le nombre maximal de chatbots ;
- le plafond global de tokens ;
- le mode et la durée de réinitialisation ;
- les quotas par fournisseur/modèle ;
- les quotas par cluster ;
- les modèles/clusters autorisés ;
- les défauts d'usage IA.

Les anciennes offres sont migrées en profils. Aucun compteur de consommation
n'est réinitialisé.

### 2. Le profil est vivant

Une organisation porte une référence `limit_profile_id`.

Les limites effectives viennent du profil assigné. Une modification du profil
est propagée de façon synchrone aux organisations liées :

- `maxChatbots` : immédiatement appliqué au prochain contrôle de création ;
- plafond global et quotas modèle/cluster : nouvelles valeurs appliquées ;
- ressources autorisées : grants mis à jour ;
- défauts d'usage : mis à jour.

Les compteurs `tokens_used` existants sont conservés :

- une baisse de plafond bloque au prochain appel ;
- une hausse libère immédiatement du budget ;
- aucun reset n'est provoqué par une modification de profil ;
- les événements d'usage restent intacts.

La propagation est effectuée dans une transaction : le profil et les
organisations liées ne doivent pas rester dans un état partiellement appliqué.

### 3. Invitations

Une invitation sans organisation choisit désormais **un profil de limites**,
et ne définit plus de configuration directe.

```text
Invitation → profil de limites → création de l'organisation liée
```

La configuration directe par invitation est supprimée du nouveau flux. Les
invitations historiques déjà acceptées conservent leurs snapshots ; elles
peuvent être rattachées à un profil par une action super-admin.

Le formulaire d'invitation ne propose plus :

- budget global ;
- quotas par modèle/cluster ;
- allocations personnalisées ;
- nombre de chatbots personnalisé.

Il propose uniquement :

- l'organisation ;
- le rôle ;
- le profil de limites.

### 4. Assignation aux organisations existantes

Le super-admin peut assigner un profil à une organisation existante. Cette
assignation applique immédiatement le profil et conserve les compteurs.

Pour les anciennes organisations issues d'une offre, une migration ou une
action d'assignation doit permettre de les rattacher à leur profil. Aucun
rattachement approximatif ne doit être fait sans traçabilité.

### 5. Gestion des ressources et des défauts

Les grants et quotas issus du profil sont identifiés comme gérés par le profil
(`managed_by_profile_id`).

Lors d'une modification de profil :

- les nouvelles ressources sont ajoutées ;
- les ressources retirées sont révoquées pour les organisations liées ;
- les compteurs des allocations retirées ne sont pas réutilisés ;
- les défauts d'usage sont remplacés par ceux du profil ;
- un défaut doit cibler une allocation autorisée par le profil.

Les grants manuels hors profil peuvent rester, mais ils ne font pas partie du
profil et ne sont pas supprimés par sa mise à jour.

## Conséquences

### Positives

- Le changement d'un profil est réellement appliqué aux organisations liées.
- Les plans SaaS sont pilotables sans réinvitation.
- Le vocabulaire « offre » disparaît.
- Les compteurs de consommation ne sont pas remis à zéro par une modification
  de limite.

### Négatives / limites

- Une baisse de quota peut bloquer immédiatement plusieurs organisations.
- La synchronisation doit être transactionnelle et auditée.
- Les organisations existantes doivent être rattachées explicitement.
- Les liens ou défauts pointant vers une ressource retirée du profil peuvent
  devenir invalides ; le profil doit rester cohérent et l'interface doit
  signaler les impacts avant enregistrement.

## Migration

- renommer les offres en profils ;
- renommer les références d'invitation ;
- ajouter `organizations.limit_profile_id` ;
- ajouter le marquage des grants gérés par profil ;
- ne jamais modifier les compteurs `tokens_used` ni les événements d'usage ;
- ne pas rattacher automatiquement une organisation à un profil sans preuve
  fiable de son offre d'origine.

## Tests attendus

- baisse de `maxChatbots` sur un profil : les organisations liées bloquent au
  prochain ajout sans supprimer les chatbots existants ;
- hausse/baisse de quota token : compteurs conservés, blocage au prochain appel ;
- ajout/retrait de modèle ou cluster : accès mis à jour ;
- mise à jour des défauts d'usage ;
- assignation d'un profil à une organisation existante ;
- mise à jour transactionnelle de plusieurs organisations ;
- invitation avec profil uniquement ;
- absence de reset de compteurs.
