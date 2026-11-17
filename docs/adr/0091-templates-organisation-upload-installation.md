# 0091. Templates visuels gérés par organisation — upload, installation et désinstallation

- **Statut** : Accepté
- **Date** : 2026-11-17
- **Décideurs** : équipe projet
- **Référence** : ADR-0019, ADR-0025, ADR-0026.
- **Complète** : ADR-0025 §6.
- **Remplace** : aucune.

## Contexte

ADR-0025 §6 définit les templates visuels comme un **catalogue plateforme** :

- `visual_templates` est global ;
- `organization_visual_templates` contient les templates assignés à une
  organisation ;
- l'import est réservé au super-admin ;
- un nouvel import assigne le template à toutes les organisations ;
- une organisation voit les templates assignés mais ne peut pas les gérer.

Le besoin exprimé par les clients est différent :

- l'admin d'une organisation doit pouvoir **téléverser son propre template**
  (archive `.onirtech-template`) ;
- ce template doit être **privé à son organisation** ;
- l'admin d'organisation doit pouvoir **installer et désinstaller** des
  templates dans son organisation ;
- l'admin plateforme peut continuer à fournir des templates par défaut ;
- une désinstallation ne doit pas impacter les autres organisations ;
- les liens existants ne doivent pas être cassés silencieusement.

Décision produit complémentaire : les templates uploadés par une organisation
ne font l'objet d'**aucune revue humaine préalable**. L'organisation est
responsable de son template. La plateforme conserve néanmoins les garde-fous
techniques et un moyen de désactivation d'urgence.

## Décision

### 1. Deux origines de templates

`visual_templates` porte désormais une origine :

```text
owner_organization_id IS NULL       → template plateforme
owner_organization_id = <org id>    → template privé de l'organisation
```

- un template plateforme est visible par toutes les organisations ;
- un template d'organisation n'est visible que par son organisation ;
- les templates actuels restent des templates plateforme
  (`owner_organization_id = NULL`).

### 2. Visibilité des templates plateforme

Pour la V1, **tous les templates plateforme sont visibles par toutes les
organisations**. Il n'y a pas de table de disponibilité par organisation.

Chaque organisation peut :

- installer un template plateforme ;
- le désinstaller si aucun chatbot ne l'utilise ;
- le réinstaller ensuite.

L'admin plateforme peut préinstaller ou retirer un template plateforme dans une
organisation donnée.

Si le besoin de réserver certains templates à certains contrats apparaît, une
table de disponibilité par organisation pourra être ajoutée dans une ADR
ultérieure. Ce n'est pas nécessaire en V1.

### 3. Upload d'un template d'organisation

L'upload est réservé à l'**admin d'organisation**.

```text
POST /api/organization/visual-templates/import
```

- multipart, champ `fichier` ;
- archive `.onirtech-template` (ZIP) ;
- l'organisation vient de la session, jamais du body ;
- le template est créé avec `owner_organization_id = organisation active` ;
- il est automatiquement installé dans cette organisation ;
- il n'est jamais assigné aux autres organisations.

Un admin d'organisation peut posséder au maximum **10 templates propriétaires**.
Les versions d'un même template ne comptent pas dans cette limite. Les templates
plateforme ne comptent pas non plus.

La limite est vérifiée dans le use case d'import, dans une transaction avec
verrou par organisation pour éviter deux uploads concurrents. Le dépassement
renvoie `409 TEMPLATE_LIMIT_REACHED`.

Les organisations qui dépassent déjà la limite conservent leurs templates
existants ; seuls les nouveaux uploads sont bloqués.

Le flux super-admin existant `/api/visual-templates/import` reste réservé aux
templates plateforme.

### 4. Installation

`organization_visual_templates` reste la source de vérité des templates
**installés**.

Ajout de la traçabilité :

```sql
ALTER TABLE organization_visual_templates
  ADD COLUMN installed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN installed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN source text NOT NULL DEFAULT 'legacy';
```

Valeurs de `source` :

```text
legacy              → assignation historique
platform_default    → provisioning d'une nouvelle organisation
platform_admin      → préinstallation par l'admin plateforme
organization_upload → upload par l'admin de l'organisation
organization_admin  → installation par l'admin de l'organisation
```

Règles :

- installer est idempotent ;
- un template d'org ne peut être installé que par son organisation ;
- un template plateforme peut être installé par toute organisation ;
- la désinstallation ne supprime que la ligne d'installation ;
- le template, ses versions, ses assets et les bindings restent en base ;
- un template désinstallé reste réinstallable.

En V1, il n'existe **aucune action distincte « Supprimer le template »**.
Désinstaller retire le template de la sélection, sans destruction. Une
suppression définitive pourra être étudiée dans une ADR ultérieure.

### 5. Provisioning et import

#### Nouvelle organisation

Le provisioning conserve le comportement actuel :

- tous les templates plateforme sont installés par défaut ;
- aucun template d'une autre organisation n'est copié ni installé.

#### Nouvel import plateforme

Un nouveau template plateforme est :

- visible par toutes les organisations ;
- installé par défaut dans toutes les organisations.

L'admin plateforme peut ensuite le retirer d'une organisation.

#### Nouvelle version d'un template

L'import d'une **nouvelle version** ne doit **jamais** réinstaller le template
dans les organisations qui l'avaient désinstallé.

Il faut supprimer le comportement actuel :

```ts
await deps.templates.assignToAllOrganizations(template.id);
```

L'ajout d'une version au catalogue ne modifie pas les installations existantes.
Les liens restent épinglés à leur version.

#### Upload d'une nouvelle version par une organisation

L'admin d'organisation peut importer une nouvelle version de son template :

- la version est ajoutée au template possédé par l'organisation ;
- elle n'affecte aucune autre organisation ;
- les liens existants restent épinglés à leur version ;
- l'installation existante est conservée.

### 6. Désinstallation bloquée si le template est utilisé

En V1, on **interdit** la désinstallation d'un template encore utilisé par un
ou plusieurs chatbots.

Les usages à compter sont :

- `chat_links.visual_template_id` ;
- `chat_link_channels.visual_template_id` pour le canal `page` ;
- `chat_link_channels.visual_template_id` pour le canal `widget`.

Si le nombre d'usages est supérieur à zéro :

- l'API renvoie `409` avec le code `TEMPLATE_IN_USE` ;
- aucun retrait n'est effectué ;
- un **toast flottant** est affiché via le `ToastProvider` existant.

Message attendu :

```text
Impossible de désinstaller « <nom du template> » : <n> chatbot(s)
l’utilisent encore. Modifiez leur template avant de réessayer.
```

La vérification doit être atomique côté serveur, par exemple avec un
`DELETE ... WHERE NOT EXISTS (...)` ou une transaction verrouillant les usages,
afin d'éviter une course avec la création/modification d'un lien.

Évolution future possible : autoriser la désinstallation avec avertissement.
Ce n'est pas le comportement V1.

### 7. RBAC

Nouvelles actions :

```text
visualtemplates:upload
visualtemplates:install
visualtemplates:uninstall
visualtemplates:disable
```

Matrice :

| Action | admin org | marketeur | lecteur | operateur | super-admin |
|---|---:|---:|---:|---:|---:|
| `visualtemplates:list` | oui | oui | oui | non | oui |
| `visualtemplates:read` | oui | oui | oui | non | oui |
| `visualtemplates:upload` | oui | non | non | non | oui |
| `visualtemplates:install` | oui | non | non | non | oui |
| `visualtemplates:uninstall` | oui | non | non | non | oui |
| `visualtemplates:create` | non | non | non | non | oui |
| `visualtemplates:delete` | non | non | non | non | oui |
| `visualtemplates:disable` | non | non | non | non | oui |

`visualtemplates:create` et `visualtemplates:delete` restent réservés à la
curation plateforme. L'incohérence actuelle de la matrice, qui donne
`create/delete` au rôle `marketeur` alors que l'API est super-admin, doit être
corrigée.

### 8. Modèle de données

```sql
ALTER TABLE visual_templates
  ADD COLUMN owner_organization_id uuid
    REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN uploaded_by uuid
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN disabled_at timestamptz,
  ADD COLUMN disabled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN disabled_reason text;

DROP INDEX IF EXISTS visual_templates_key_idx;

CREATE UNIQUE INDEX visual_templates_platform_key_idx
  ON visual_templates (lower(key))
  WHERE owner_organization_id IS NULL;

CREATE UNIQUE INDEX visual_templates_org_key_idx
  ON visual_templates (owner_organization_id, lower(key))
  WHERE owner_organization_id IS NOT NULL;
```

Les clés des templates plateforme restent uniques globalement. Les clés des
templates d'organisation sont uniques dans l'organisation.

Les clés plateforme réservées, notamment `starter`, ne peuvent pas être
réutilisées par un template d'organisation. `starter` porte le comportement du
template par défaut des nouveaux chatbots (ADR-0077) : la réserver évite qu'un
template d'organisation détourne ou masque ce comportement.

### 9. Résolution tenant-aware

Le rendu public d'un lien doit résoudre le template en vérifiant son
propriétaire :

- `owner_organization_id IS NULL` ;
- ou `owner_organization_id = link.organization_id`.

Le code actuel de `loadTemplateSpec` utilise `findById` sans contrôle
d'organisation. Il doit passer à une résolution explicite, par exemple :

```ts
findByIdForOrganization(organizationId, templateId)
```

Les listes et lectures applicatives doivent également être scopées :

```ts
findByIdForOrganization(organizationId, templateId)
findByKeyForOrganization(organizationId, key)
listOwnedByOrganization(organizationId)
```

Un accès direct à un template d'une autre organisation renvoie `404`.

### 10. API

#### Organisation

```text
GET    /api/organization/visual-templates?view=installed|available
POST   /api/organization/visual-templates/import
PUT    /api/organization/visual-templates/[templateId]
DELETE /api/organization/visual-templates/[templateId]
```

- `view=installed` : templates installés (plateforme + org) ;
- `view=available` : templates plateforme non installés + templates org non
  installés ;
- `PUT` : installer (idempotent) ;
- `DELETE` : désinstaller, avec contrôle d'usage ;
- import au-delà de 10 templates propriétaires : `409 TEMPLATE_LIMIT_REACHED`.

#### Administration plateforme

```text
PUT    /api/platform/organizations/[id]/visual-templates/[templateId]
DELETE /api/platform/organizations/[id]/visual-templates/[templateId]
PATCH  /api/platform/visual-templates/[id]
```

- `PUT` : préinstaller un template plateforme dans une organisation ;
- `DELETE` : retirer l'installation d'une organisation ;
- `PATCH` : désactiver un template en urgence.

Toutes les routes organisation utilisent `organizationOf(actor)`. Aucun
`organizationId` client n'est accepté.

### 11. Interface

#### `/templates-visuels` — organisation

Trois ensembles :

1. **Installés** : templates actifs pour l'organisation ;
2. **Catalogue plateforme** : templates plateforme non installés ;
3. **Mes templates** : templates uploadés par l'organisation.

Actions visibles uniquement pour l'admin d'organisation :

- `Importer un template` ;
- `Installer` ;
- `Désinstaller`.

Le `marketeur` et le `lecteur` voient les templates mais n'ont aucun bouton
d'action.

Le compteur `Mes templates` affiche `n / 10`. Le bouton d'import est désactivé
au-delà de 10 templates propriétaires.

#### Import

Modale avec :

- fichier `.onirtech-template` ;
- rappel : « Vous êtes responsable du template importé. Il sera exécuté dans
  une iframe isolée. » ;
- validation et toast de succès ;
- toast d'erreur si la limite de 10 est atteinte.

#### Désinstallation

- bouton `Désinstaller` ;
- si utilisé : toast flottant avec le nombre de chatbots ;
- si inutilisé : confirmation puis toast de succès.

#### Administration plateforme

Sur la fiche organisation ou la fiche template :

- liste des templates plateforme ;
- action `Installer` / `Retirer` pour une organisation ;
- action `Désactiver` en cas d'abus.

### 12. Sécurité des templates d'organisation

L'absence de revue humaine ne dispense pas des contrôles techniques.

À l'import d'un template d'organisation :

- validation ZIP et manifeste ;
- vérification SRI ;
- chemins relatifs sûrs ;
- limite de taille, de nombre de fichiers et de taille décompressée ;
- type MIME et assets contrôlés ;
- `trustLevel` forcé à `community` ;
- `ui.mode` forcé à `iframe` ;
- exécution en iframe `sandbox="allow-scripts allow-forms"` sans
  `allow-same-origin` ;
- allowlist réseau appliquée ;
- stockage des assets sous `orgs/<organizationId>/...` ;
- audit de l'upload, de l'installation, de la désinstallation et de la
  désactivation ;
- possibilité pour le super-admin de désactiver immédiatement un template.

La capability `data` (contrats de données et SQL) est **autorisée en V1** pour
les templates d'organisation. Les contrats restent soumis aux règles
ADR-0026 :

- contrats déclarés dans le manifeste et validés ;
- requêtes SQL contrôlées par le fournisseur de données ;
- bindings scopés par organisation et par version ;
- exécution avec le périmètre de l'organisation du lien ;
- aucun accès aux données d'une autre organisation.

Le transport iframe doit exposer un pont `loadData` / `dataResult` pour les
contrats de données. ADR-0026 est amendée en conséquence : la règle
« `data` exige le mode `web-component` » ne s'applique pas aux templates
d'organisation, qui restent exécutés en iframe sandboxée.

Les assets d'un template d'organisation ne doivent pas être listables par une
autre organisation. Le rendu public reste possible via l'identifiant opaque du
template utilisé par un lien.

### 13. Compatibilité avec l'existant

- les templates existants deviennent des templates plateforme ;
- les assignations existantes restent des installations ;
- les liens existants restent épinglés à leur version ;
- la résolution d'un lien existant continue de fonctionner ;
- un template utilisé ne peut plus être désinstallé, ce qui évite de casser un
  lien ;
- le template `starter` reste un template plateforme ;
- les bindings de données restent scopés par organisation ;
- le provisioning d'une nouvelle organisation conserve l'installation de tous
  les templates plateforme.

### 14. Migration

Migration additive, sans downtime :

1. ajouter `owner_organization_id`, `uploaded_by`, `disabled_*` ;
2. backfiller `owner_organization_id = NULL` pour les templates existants ;
3. remplacer l'index unique global par les deux index partiels ;
4. ajouter `installed_by`, `installed_at`, `source` ;
5. backfiller `source = 'legacy'` sur les installations existantes ;
6. adapter l'import, le provisioning et les lectures ;
7. livrer les routes et l'UI ;
8. activer les nouvelles actions RBAC.

Aucun template, asset, lien ou binding n'est supprimé.

### 15. Tests

- upload org A → template visible uniquement par A ;
- org B ne peut ni lister, ni lire, ni installer le template de A ;
- installation org A → aucune ligne dans org B ;
- désinstallation org A → org B inchangée ;
- désinstallation d'un template utilisé → `409 TEMPLATE_IN_USE` + toast ;
- désinstallation d'un template non utilisé → OK ;
- réinstallation → OK ;
- template plateforme désinstallé par A → reste installé chez B ;
- import d'une nouvelle version → aucune réinstallation forcée ;
- nouveau template plateforme → installé par défaut, retirable par org ;
- nouvelle organisation → templates plateforme installés par défaut ;
- marketeur/lecteur → actions API refusées et boutons absents ;
- ZIP invalide, SRI invalide, chemin dangereux → refus ;
- template d'org avec capability `data` → accepté, mais données strictement
  scopées à l'organisation du lien ;
- 11e upload propriétaire → `409 TEMPLATE_LIMIT_REACHED` ;
- uploads concurrents au 10e template → limite respectée ;
- clé `starter` utilisée par un template d'org → refus ;
- rendu d'un lien existant avec template d'org → autorisé uniquement dans son
  organisation ;
- désactivation plateforme → template retiré et rendu refusé.

### 16. Hors périmètre V1

- revue humaine des templates d'organisation ;
- place de marché publique ou partage inter-organisations ;
- table de disponibilité par organisation pour les templates plateforme ;
- action distincte « Supprimer le template » (destructive) ;
- quotas de stockage global ou de taille cumulée au-delà des limites
  techniques d'upload et des 10 templates propriétaires.

## Conséquences

- Les clients peuvent gérer leurs templates sans intervention plateforme.
- L'isolation inter-organisations devient explicite jusque dans la résolution
  d'un template.
- La désinstallation est sûre : elle est bloquée tant qu'un chatbot utilise le
  template.
- Les templates d'organisation peuvent utiliser les contrats de données et SQL,
  strictement dans le périmètre de leur organisation.
- La limite de 10 templates propriétaires contient l'exposition et évite un
  catalogue d'organisation incontrôlé.
- L'admin plateforme conserve la main sur les templates par défaut et peut
  désactiver un template dangereux.
- Le modèle reste compatible avec l'existant et ne nécessite aucune
  reconstruction du système de templates.
