# 0025. Multitenancy par organisation

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0005 (RBAC), ADR-0004 (sessions), ADR-0019
  (templates visuels) et ADR-0023 (paramètres de templates).

## Contexte

Le dashboard est aujourd'hui **mono-tenant** :

- `users.role` porte un rôle global (`admin`, `marketeur`, `lecteur`) ;
- aucune table métier ne porte d'organisation ;
- les dépôts font des lectures/écritures non filtrées ;
- les liens publics sont globaux ;
- les mêmes données sont visibles par tous les comptes.

Le besoin est de permettre à un **super-admin plateforme** de créer des
organisations, d'y rattacher des utilisateurs avec des rôles différents, et de
garantir qu'un utilisateur ne voit que les organisations auxquelles il appartient.

## Décision

### 1. Schéma partagé, isolation par `organization_id`

Un schéma PostgreSQL unique, avec `organization_id` sur les données métier.
Pas de schéma SQL par organisation, pas de base par organisation.

### 2. Deux niveaux d'administration

- **Super-admin plateforme** : `users.is_super_admin = true`. Crée/suspend les
  organisations, voit toutes les organisations, peut basculer sur n'importe
  laquelle et rattacher un utilisateur existant.
- **Admin d'organisation** : rôle `admin` dans `organization_members`. Gère les
  utilisateurs et les données de sa seule organisation. Ne crée pas
  d'organisation et ne rattache pas un utilisateur existant d'une autre
  organisation.

### 3. Memberships et rôle effectif

```text
organization_members
  organization_id
  user_id
  role            -- admin | marketeur | lecteur
  created_by
  created_at
  updated_at
  PK (organization_id, user_id)
```

Un utilisateur peut appartenir à plusieurs organisations avec un rôle différent
par organisation. Le rôle d'autorisation est **celui de la membership active**.
`users.role` devient une colonne legacy, non utilisée pour autoriser.

### 4. Organisation active

`sessions.active_organization_id` porte l'organisation active de la session.

- Au login, le serveur choisit la dernière organisation utilisée, sinon la
  première membership.
- Si l'utilisateur n'a aucune organisation, il est dirigé vers un état
  « aucune organisation ».
- Le changement d'organisation passe par un endpoint serveur qui vérifie la
  membership avant de mettre à jour la session.
- **Aucun `organizationId` n'est accepté depuis le body, la query ou un cookie
  client.** Il est toujours résolu depuis la session authentifiée.

### 5. Isolation des données

Sont tenant-scopées :

- `prospects`
- `chat_links`
- `conversations`
- `fiches`
- `chat_templates`
- `base_connaissances`
- `medias`
- `confidentialites`

Les tables filles (`chat_messages`, `chat_template_versions`,
`visual_template_versions`, `visual_template_assets`) héritent de leur parent.
Les requêtes applicatives les lisent toujours via un parent scoped.

Règles :

- toutes les listes sont filtrées par `organization_id` ;
- tout `findById`, `update`, `delete` inclut `organization_id` ;
- un identifiant appartenant à une autre organisation renvoie **404** ;
- les clés étrangères composites `(organization_id, id)` sont ajoutées sur les
  relations critiques pour empêcher physiquement un croisement.

### 6. Templates visuels : catalogue global + assignation par organisation

Les templates visuels restent un **catalogue plateforme** partagé :

```text
organization_visual_templates
  organization_id
  template_id
  created_at
  PK (organization_id, template_id)
```

- à la création d'une organisation, **tous les templates du catalogue sont
  assignés** ;
- à l'import d'un nouveau template, il est assigné à **toutes les
  organisations** ;
- le super-admin peut retirer un template d'une organisation ;
- une organisation ne voit et ne sélectionne que ses templates assignés ;
- retirer un template ne casse pas les liens existants : il n'est simplement
  plus proposé pour les nouveaux liens.

Les **modèles de raisonnement** (`chat_templates`) restent tenant-scopés.

### 7. Provisioning d'une organisation vide

Une organisation nouvellement créée ne contient **aucune donnée métier**
(prospect, lien, conversation, fiche, connaissance, média).

Si le super-admin ne fournit pas de paramétrage explicite, le système applique
automatiquement :

- les modèles de raisonnement par défaut (clonés) ;
- la politique de confidentialité par défaut (clonée) ;
- l'assignation de tous les templates visuels.

Le nom de l'organisation est prérempli avec le nom de l'utilisateur créateur
(ou la partie locale de son email), et reste éditable.

### 8. Migration des données existantes

- Création de l'organisation legacy **`Onirtech`**.
- Toutes les données actuelles y sont rattachées.
- Seul le super-admin possède une membership sur `Onirtech`.
- Création d'une organisation personnelle **vide** nommée d'après
  l'utilisateur.
- Les autres utilisateurs existants n'obtiennent **aucune membership** par
  défaut : le super-admin doit les rattacher explicitement à une organisation.
- L'admin actuel devient super-admin.
- `users.role` est conservé mais marqué legacy.

La migration suit un modèle **expand / backfill / contract** pour rester
compatible avec l'ancien process pendant le déploiement CI :

1. créer les organisations, memberships, `is_super_admin`, session active ;
2. ajouter les `organization_id` avec une valeur par défaut legacy, backfiller ;
3. ajouter les contraintes, index et unicités par organisation ;
4. retirer les unicités globales devenues incorrectes.

### 9. Unicités par organisation

Les contraintes globales suivantes deviennent locales :

- `base_connaissances (organization_id, lower(titre))` ;
- `medias (organization_id, type, lower(libelle))` ;
- `confidentialites (organization_id, lower(titre))` ;
- `chat_templates (organization_id, lower(key))`.

Le token des liens publics reste unique globalement, mais le lien porte son
`organization_id`.

### 10. Liens publics

Le token résout le lien et son organisation. Tous les accès du parcours public
(prospect, conversation, messages, médias, connaissances, confidentialité,
template visuel) utilisent l'organisation du lien. Aucun paramètre client ne
peut changer cette organisation.

## Conséquences

- Toutes les couches (`domain`, `application`, `infrastructure`, `app`) portent
  explicitement l'organisation ; le contexte tenant n'est jamais implicite.
- Les tests d'isolation croisée deviennent obligatoires.
- Les pages et API existantes changent de contrat : le rôle courant vient du
  contexte d'organisation, plus de `users.role`.
- Le super-admin est un point de rupture de l'isolation : ses actions doivent
  être tracées.
- Les données ONIRTECH ne sont pas partagées : elles restent dans `Onirtech`,
  accessible uniquement au super-admin.

## Alternatives écartées

- **Schéma ou base par organisation** : migrations, sauvegardes et pool de
  connexions trop lourds pour le volume actuel.
- **RLS PostgreSQL seule** : insuffisante sans contexte applicatif explicite et
  difficile à introduire sans réécrire les dépôts. RLS sera ajoutée en
  durcissement.
- **Rôle global conservé** : ne permet pas des rôles différents par
  organisation ni l'isolation demandée.
