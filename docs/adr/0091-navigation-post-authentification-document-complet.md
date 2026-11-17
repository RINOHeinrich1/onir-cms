# 0091. Navigation post-authentification — rechargement document complet

- **Statut** : Accepté
- **Date** : 2026-11-17
- **Décideurs** : équipe projet
- **Référence** : ADR-0025.
- **Complète** : ADR-0025 §4.
- **Remplace** : aucune.

## Contexte

Un bug intermittent est observé après connexion :

- l'utilisateur reste sur `/login` ;
- l'écran est noir ;
- un rechargement manuel affiche correctement le dashboard ;
- la console montre un `401` sur `/api/notifications?limit=6` et parfois un `404`.

Le formulaire de connexion exécutait :

```ts
router.replace(target);
router.refresh();
```

Les deux appels sont asynchrones et déclenchés immédiatement l'un après l'autre.
`router.refresh()` peut rafraîchir la route courante `/login` pendant que
`router.replace()` tente d'aller vers `/dashboard`. Avec le nouveau cookie de
session, `/login` redirige à son tour vers `/dashboard` : les deux navigations
se chevauchent et le routeur client peut rester bloqué sur une coquille vide.

Les erreurs `401` sur les notifications sont un **symptôme** de cet état
intermédiaire : le `NotificationBell` appartient au layout dashboard et peut
être monté/préchargé alors que la session n'est pas encore exploitable côté
client. Une erreur de notification seule ne peut pas provoquer l'écran noir.

## Décision

Pour toute transition qui franchit une frontière d'authentification ou de
contexte serveur, utiliser une **navigation document complète** :

```ts
window.location.replace(target);
```

et supprimer le couple `router.replace()` + `router.refresh()`.

Flux concernés :

1. connexion réussie (`LoginForm`) ;
2. changement de mot de passe forcé (`ChangePasswordForm`) ;
3. acceptation d'invitation (`AcceptInvitationForm`) ;
4. bascule d'organisation (`OrganizationSwitcher`).

Le rechargement complet garantit :

- que le cookie de session est présent dès la première requête serveur ;
- que le cache du routeur client ne réutilise pas un shell dashboard antérieur ;
- que le layout dashboard n'est pas monté dans un état intermédiaire ;
- que les notifications ne partent pas avant l'établissement de la session.

## Alternatives écartées

### `router.replace(target)` seul

Écarte le `refresh` concurrent, mais peut encore réutiliser un cache de route
ou un prefetch produit avant la transition. Le rechargement complet est plus
déterministe pour une frontière d'authentification.

### `router.refresh()` après un délai

Réduit la probabilité de course mais ne la supprime pas. Un délai arbitraire
n'est pas une garantie.

### Attendre la fin de la navigation avant `refresh`

Complexifie inutilement le formulaire et reste dépendant du comportement interne
du routeur Next.js.

## Conséquences

- légère perte de navigation SPA sur ces transitions ;
- rechargement complet du dashboard après login, changement de mot de passe,
  invitation ou bascule d'organisation ;
- suppression du risque de shell dashboard sans session valide ;
- le toast de succès d'une invitation peut ne pas être visible avant le
  rechargement, sans impact fonctionnel ;
- aucune modification de l'API, du cookie de session ou des règles métier.

## Vérifications attendues

- connexions répétées : URL `/dashboard`, pas d'écran noir ;
- mauvais identifiants : reste sur `/login` avec message d'erreur ;
- `mustChangePassword` : redirection vers `/change-password` ;
- acceptation d'invitation : dashboard chargé avec session valide ;
- bascule d'organisation : dashboard rechargé sur la nouvelle organisation ;
- aucun `401 /api/notifications` au premier rendu dashboard ;
- tests `auth`, `invitations`, `organizations` et build conservés.
