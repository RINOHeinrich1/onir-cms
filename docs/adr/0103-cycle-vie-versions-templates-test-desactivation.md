# 0103. Cycle de vie des versions de templates — test, erreur, désactivation et retour arrière

- **Statut** : Proposé
- **Date** : 2026-11-21
- **Décideurs** : équipe projet
- **Référence** : ADR-0019, ADR-0023, ADR-0024, ADR-0091.
- **Complète** : ADR-0091 (installation et désinstallation des templates).
- **Remplace** : aucune.

## Contexte

Une version de template visuel est figée : son manifeste, son entrée et ses
assets ne sont pas modifiés après import (ADR-0019, ADR-0024). Un lien référence
explicitement un couple `(template_id, version)`.

Aujourd'hui :

- la désinstallation agit sur le **template entier** (ADR-0091) ;
- la liste des versions est en lecture seule : aucune version ne peut être
  testée, désactivée ou retirée individuellement ;
- un import peut réussir les contrôles statiques puis échouer à l'exécution
  (entrée non chargée, erreur JavaScript, élément personnalisé absent, asset
  manquant, intégrité incohérente, timeout) ;
- l'hôte affiche alors un message générique du type « Template indisponible »,
  sans version, cause ni action corrective ;
- l'administrateur ne peut ni empêcher la sélection d'une version cassée, ni
  revenir proprement à une version précédente sans toucher au template entier.

Supprimer physiquement une version n'est pas une bonne réponse par défaut :
cela casse les liens qui l'utilisent et efface l'historique nécessaire au
diagnostic et au retour arrière.

Il faut donc un cycle de vie de version explicite, distinct du contenu figé de
la version.

## Décision

### 1. Métadonnées de version, sans réécrire la version

`visual_template_versions` porte des métadonnées de cycle de vie :

```text
health_status      unknown | ok | error
last_checked_at    timestamptz | null
last_error_code    text | null
last_error_message text | null
last_error_detail  jsonb | null
disabled_at        timestamptz | null
disabled_by        uuid | null
disabled_reason    text | null
```

Le manifeste, les assets, l'entrée et l'intégrité restent immuables. Ces champs
décrivent l'état observé et la disponibilité catalogue, pas le contenu.

Une version est **désactivée** lorsque `disabled_at` est non nul. Elle est
**en erreur** lorsque `health_status = 'error'`. Les deux états sont
indépendants : une version désactivée peut être saine, une version en erreur
peut rester activée tant que l'administrateur n'a pas décidé de la retirer.

### 2. Test conduit par l'hôte

L'hôte fournit une action **« Tester cette version »** depuis la fiche du
template. Le test :

- charge l'entrée réelle et les assets servis par l'hôte ;
- vérifie la réponse HTTP, l'intégrité SRI, l'enregistrement de l'élément
  personnalisé et le premier rendu ;
- capture les exceptions, les erreurs console et les timeouts ;
- utilise un contexte simulé et n'effectue aucun appel à l'IA, à la base ou à un
  service externe ;
- est borné dans le temps et ne peut pas être déclaré réussi par le template
  lui-même.

Le résultat est enregistré par l'hôte. Un test réussi passe `health_status` à
`ok` ; un test échoué le passe à `error` et renseigne un code d'erreur. Le test
manuel n'est jamais bloquant pour l'import : il conditionne l'état de santé,
pas la création de la version.

Un test automatique post-import peut être ajouté avec le même contrat. Il reste
asynchrone et ne doit pas retarder la réponse d'import.

### 3. Codes d'erreur exploitables

Les échecs sont normalisés :

```text
entry_unreachable
sri_mismatch
asset_missing
element_missing
runtime_exception
timeout
protocol_incompatible
```

`last_error_message` est un message court et non sensible.
`last_error_detail` contient les détails techniques bornés (fichier, ligne,
code HTTP, type d'exception), jamais de secret ni de donnée visiteur.

L'UI affiche la version concernée, la date du dernier test, le code et un
accès au détail. Le message générique « Template indisponible » est conservé
comme repli visiteur, mais ne doit plus être la seule information disponible
pour l'administrateur.

### 4. Désactivation et réactivation

Une version peut être désactivée par un rôle autorisé à gérer les templates de
l'organisation, avec un motif.

La désactivation est **catalogue**, pas runtime :

- la version disparaît des choix pour les nouveaux liens et les changements de
  version ;
- les liens existants qui l'utilisent continuent de la résoudre ;
- la fiche du template et la fiche du lien signalent qu'une version désactivée
  ou en erreur est utilisée ;
- la réactivation remet la version dans les choix, sans modifier son état de
  santé.

La désactivation n'est pas bloquée par l'usage existant. C'est le retour arrière
qui traite les liens concernés.

### 5. Sélection et retour arrière

Pour une nouvelle affectation ou un changement de version, l'hôte propose en
priorité :

1. la dernière version `ok` non désactivée ;
2. sinon la dernière version `unknown` non désactivée ;
3. jamais une version `error` ou désactivée sans confirmation explicite.

Un lien reste épinglé à sa version. En cas d'erreur, l'interface du lien propose
**« Revenir à la version précédente »**, qui réutilise la version précédente
connue comme saine, ou laisse choisir une version parmi les versions saines.

Le retour arrière ne supprime aucune version et ne réécrit aucune donnée de
template.

### 6. Import atomique

L'import d'une version est atomique du point de vue des données :

- si la création du template, de la version ou d'un asset échoue, aucune
  version partielle ni aucun asset orphelin n'est conservé ;
- les écritures de stockage sont compensées en cas d'échec de la transaction ;
- l'échec est tracé dans l'audit avec la version et la cause ;
- une tentative échouée peut être relancée sans laisser de résidu.

Un template existant ne doit pas être désinstallé parce qu'une nouvelle version
a échoué à s'importer.

### 7. Audit

Les événements suivants sont ajoutés à l'audit des templates :

```text
version_test_ok
version_test_error
version_disabled
version_enabled
version_rollback
```

Ils portent `template_id`, `version`, l'acteur et, pour les erreurs, le code
normalisé. Les événements existants d'installation et de désinstallation du
template restent inchangés.

### 8. Suppression physique exclue de cette décision

Cette ADR ne crée pas d'action de suppression physique d'une version. Une
suppression définitive soulève des questions distinctes : conservation de
l'historique, liens épinglés, audit et rétention des assets. Elle fera l'objet
d'une décision ultérieure si le besoin est confirmé.

## Alternatives écartées

### Supprimer physiquement la version en erreur

Refusé comme première réponse : un lien peut encore la référencer, et la
suppression empêche le diagnostic et le retour arrière.

### Désinstaller le template entier

Trop grossier : une seule version cassée ne doit pas retirer toutes les
versions saines ni bloquer les liens des autres versions.

### Se contenter de la validation statique à l'import

Insuffisant : le manifeste, l'intégrité et la présence des assets ne prouvent
pas que le bundle s'exécute, s'enregistre et rend son premier écran.

### Désactivation automatique sur la première erreur visiteur

Risqué : une erreur isolée ou transitoire ne doit pas retirer automatiquement
une version à tous les liens. L'erreur est signalée ; l'administrateur teste et
décide.

### Masquer les versions en erreur

Refusé : l'administrateur doit voir la version, la cause et les liens concernés
pour pouvoir agir.

## Conséquences

### Positives

- Diagnostic exploitable en cas de version cassée ;
- aucune suppression destructive nécessaire pour retirer une version des choix ;
- les liens existants ne sont pas cassés par une désactivation catalogue ;
- retour arrière explicite et traçable ;
- import échoué sans résidu ;
- compatibilité avec les versions et manifestes existants.

### Négatives

- nouvelles colonnes et migration sur les versions ;
- surface de test runtime à maintenir (timeout, capture d'erreurs, rendu isolé) ;
- règles de sélection à expliquer dans l'UI ;
- la suppression physique reste absente et devra être traitée séparément ;
- les tests runtime peuvent être plus lents qu'une validation statique.

## Migration

- ajout des colonnes nullables sur `visual_template_versions` ;
- valeur initiale `health_status = 'unknown'` pour les versions existantes ;
- `disabled_at = null` pour toutes les versions existantes ;
- aucun changement de manifeste, d'asset ni de référence de lien ;
- index partiel sur les versions sélectionnables (`health_status`, `disabled_at`) ;
- les liens existants continuent de résoudre leur version épinglée.

## Vérifications attendues

- import réussi : version créée avec `health_status = 'unknown'` ;
- import échoué : aucune version partielle, aucun asset orphelin, audit d'échec ;
- test réussi : `health_status = 'ok'` et date de vérification ;
- test échoué : `health_status = 'error'` et code normalisé ;
- version en erreur absente des choix par défaut ;
- version désactivée absente des choix, mais toujours résolue par un lien
  existant ;
- réactivation sans changement de santé ;
- retour arrière d'un lien vers une version saine ;
- audit de chaque test, désactivation, réactivation et retour arrière ;
- isolation du test : aucun accès IA, base ou réseau externe ;
- utilisateur non autorisé : aucune action de test ou de désactivation.
