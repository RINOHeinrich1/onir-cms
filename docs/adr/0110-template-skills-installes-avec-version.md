# 0110. Skills de template installés avec la version du template

- **Statut** : Proposé
- **Date** : 2026-11-26
- **Référence** : ADR-0023, ADR-0105, ADR-0108, ADR-0109.
- **Complète** : ADR-0109 (édition assistée par IA).
- **Remplace** : aucune.

## Contexte

L’ADR-0108 a séparé les données du template (`params`) de son modèle
d’édition (`editor`). L’ADR-0109 a ajouté la résolution de cible et les
sessions d’édition assistée.

Le prompt de base reste volontairement générique. Il ne doit pas apprendre les
spécificités de Puzzle : créer une page et son entrée de menu, choisir le bon
bouton enfant, interpréter « fond », créer une copie locale d’un style, etc.

Ces connaissances appartiennent au template. Elles doivent être :

- déclaratives ;
- versionnées avec le template ;
- installées atomiquement avec la version ;
- chargées uniquement lorsque cette version est utilisée ;
- impossibles à fournir depuis une source externe non contrôlée.

Le présent ADR définit les **skills de template** comme des artefacts installés
avec l’archive `.onirtech-template`.

## Décision

### 1. Un skill est un artefact du template

Un skill n’est pas :

- un prompt global ONIR-CMS ;
- un fichier hébergé sur un CDN externe ;
- une configuration partagée entre templates ;
- du code exécutable.

Un skill appartient à une **version de template**. Il est installé, versionné,
audité, désinstallé et restauré avec cette version.

### 2. Les skills sont des fichiers de l’archive

L’archive d’installation contient un dossier :

```text
skills/
  puzzle-page-menu.skill.json
  puzzle-style-button.skill.json
```

Le manifeste `onirtech.template.json` les déclare :

```json
{
  "aiSkills": [
    {
      "id": "puzzle-page-menu",
      "format": "onirtech.ai-skill.v1",
      "path": "skills/puzzle-page-menu.skill.json",
      "integrity": "sha256-..."
    }
  ]
}
```

Le contenu du skill est stocké comme les autres assets de la version
(`visual_template_assets`). Aucune nouvelle table de skills n’est nécessaire
en v1.

### 3. Les skills sont installés atomiquement

L’import d’un template doit :

1. valider le manifeste ;
2. vérifier que chaque `aiSkills.path` est présent dans l’archive ;
3. vérifier le chemin sûr ;
4. vérifier la taille maximale ;
5. vérifier la signature SRI `integrity` ;
6. valider le schéma du skill ;
7. enregistrer le skill comme asset de la version ;
8. échouer intégralement si un skill référencé est absent ou invalide.

Aucune installation partielle de skills n’est autorisée.

Une version publiée est immuable : modifier un skill impose une nouvelle
version du template.

### 4. Format d’un skill

```json
{
  "schemaVersion": 1,
  "format": "onirtech.ai-skill.v1",
  "id": "puzzle-page-menu",
  "title": "Créer une page et son entrée de menu",
  "description": "Compose une page de contenu et son entrée de menu.",
  "version": "1.0.0",
  "priority": 20,
  "always": false,
  "intents": [
    {
      "id": "create-page-menu",
      "description": "Créer une page et l’ajouter au menu",
      "keywords": ["page", "menu", "section", "services"],
      "examples": [
        "branche service à une nouvelle page de service",
        "ajoute une page services au menu"
      ]
    }
  ],
  "instructions": [
    "Créer d’abord la page dans la collection pages.",
    "Créer ensuite un menu_item sous le menu approprié.",
    "Relier l’action du menu item à la page créée.",
    "Ne jamais inventer d’identifiant : utiliser les ids générés par l’hôte."
  ],
  "context": {
    "include": ["structure", "references", "scopes", "insertion"],
    "maxCandidates": 8
  },
  "operations": {
    "allowed": ["insert", "insertChild", "set"],
    "constraints": [
      "une page doit avoir un titre",
      "un menu_item doit avoir une action valide",
      "aucune référence ne doit être inventée"
    ]
  },
  "examples": [
    {
      "request": "branche service à une nouvelle page de service",
      "notes": "Créer pages + menu_item + action, puis relier."
    }
  ]
}
```

### 5. Le core garde le monopole de l’exécution

Un skill peut :

- décrire des intentions ;
- fournir des exemples ;
- ajouter des instructions ;
- préciser des contraintes ;
- demander un sous-ensemble de contexte ;
- nommer des opérations autorisées.

Un skill ne peut pas :

- exécuter du JavaScript ;
- ajouter une nouvelle opération au core ;
- contourner le schéma des paramètres ;
- contourner la validation des références ;
- fournir un identifiant ;
- accéder à un autre template ;
- appeler un service externe ;
- modifier l’audit ;
- élargir les permissions de l’utilisateur.

Le core reste responsable de :

- la validation du manifeste ;
- la résolution de cible ;
- la validation d’intégrité référentielle ;
- l’application atomique ;
- l’audit ;
- les quotas et permissions.

### 6. Sélection des skills

Le core sélectionne les skills, pas le modèle.

Pour une demande :

1. le core indexe les `intents`, `keywords` et `examples` des skills installés ;
2. il fait un rapprochement lexical puis sémantique ;
3. il retient au maximum 2 ou 3 skills ;
4. il ajoute leurs instructions au prompt générique ;
5. il transmet au modèle uniquement les skills retenus.

Un skill `always: true` peut être ajouté systématiquement, par exemple pour les
règles de style du template.

Si aucun skill ne correspond, le prompt générique reste utilisé.

### 7. Injection dans le prompt

Le prompt générique reste la base :

```text
règles de sécurité
+ schéma des paramètres
+ cible résolue
+ contexte de la cible
+ skills retenus
+ demande utilisateur
```

Les skills ne remplacent pas le prompt générique. Ils sont des **extensions
bornées** :

- taille maximale ;
- nombre maximal ;
- ordre déterministe ;
- priorité inférieure aux règles de sécurité et de validation.

### 8. Traçabilité

La session et l’audit enregistrent :

- `skillIds` ;
- `skillVersions` ;
- `skillDigests` ;
- `skillSelectionReason` ;
- `promptVersion` du core.

Ainsi, une proposition peut être reliée à la version exacte :

```text
templateVersion + skillVersion + promptVersion
```

Sans cette traçabilité, une proposition IA n’est pas reproductible.

### 9. Cycle de vie

- Installation : skills installés avec la version.
- Désactivation : les skills de la version désactivée ne sont plus chargés.
- Retour arrière : les skills de la version précédente sont restaurés.
- Désinstallation : les assets de skills suivent la version.
- Modification : nouvelle version de template obligatoire.
- Template privé d’organisation : mêmes règles, skills stockés avec la version.

### 10. Limites et validation

Valeurs initiales proposées :

- 16 skills maximum par version ;
- 64 Ko maximum par skill ;
- 256 Ko maximum pour l’ensemble des skills ;
- 8 intentions maximum par skill ;
- 8 exemples maximum par intention ;
- instructions texte uniquement, sans HTML ;
- timeout de chargement borné.

Le manifeste et les skills sont validés avant installation. Un skill invalide
fait échouer l’import.

### 11. Que doit porter chaque niveau ?

#### ONIR-CMS

- schéma `aiSkills` du manifeste ;
- extraction et validation de l’archive ;
- stockage des skills comme assets ;
- loader et cache par version ;
- sélection des skills ;
- injection bornée dans le prompt ;
- validation des opérations et des références ;
- audit ;
- quotas et permissions.

#### Template

- intentions ;
- exemples ;
- instructions de composition ;
- vocabulaire fonctionnel ;
- sémantique des styles et couleurs ;
- contraintes métier ;
- recettes de composition.

#### Puzzle

Exemples de skills attendus :

- créer une page + entrée de menu + liaison ;
- modifier le texte d’un élément ciblé ;
- interpréter « fond », « couleur », « bouton principal » ;
- créer une copie locale d’un style partagé ;
- gérer les sections et leur ordre.

## Conséquences

### Positives

- Le prompt de base reste générique.
- Le template porte sa connaissance métier.
- Les skills sont versionnés, immuables et auditables.
- Aucun couplage du core à Puzzle.
- Les compositions métier deviennent déclaratives.
- Le comportement IA devient reproductible.

### Négatives

- Nouveau schéma à valider et à documenter.
- Nouveau loader à maintenir.
- Les auteurs de templates doivent écrire et versionner des skills.
- Le risque de skills trop volumineux ou contradictoires doit être maîtrisé.
- La sélection de skills doit être testée pour éviter les faux positifs.

## Alternatives écartées

### Skills externes

Refusé : non versionnés avec le template, non atomiques, non reproductibles.

### Skills dans un prompt global ONIR-CMS

Refusé : couplage au core et conflits entre templates.

### Skills exécutables

Refusé : surface d’attaque et perte du contrôle de validation.

### Laisser le modèle choisir librement ses skills

Refusé : sélection non déterministe et non auditable.

## Plan d’implémentation

| Lot | Contenu |
|---|---|
| A | Schéma `aiSkills` + validation du manifeste |
| B | Validation des fichiers de skills dans l’import |
| C | Stockage des skills comme assets de version |
| D | Loader + cache par version |
| E | Sélection des skills et injection dans le prompt |
| F | Enregistrement `skillIds` / `skillVersions` dans session + audit |
| G | Skills Puzzle initiaux |
| H | Tests de sécurité, de versionnement et de non-régression |

## Critères d’acceptation

- Un template sans skill fonctionne comme aujourd’hui.
- Un skill absent ou invalide bloque l’installation.
- Un skill ne peut pas fournir d’ID ni contourner le manifeste.
- Les skills sont chargés depuis la version installée, jamais depuis une URL externe.
- Une session enregistre les skills utilisés.
- Une proposition est reproductible à partir de `templateVersion + skillVersion + promptVersion`.
- La désactivation ou le rollback d’une version change les skills chargés.
- Les tests de sécurité vérifient l’absence d’exécution de code et d’accès réseau.

## Questions à trancher

1. Skills inline dans le manifeste ou fichiers `skills/*.json` ?  
   **Recommandation : fichiers séparés**, plus lisibles et versionnables.
2. Version du skill indépendante ou alignée sur la version du template ?  
   **Recommandation : version indépendante mais immuable dans la version du template.**
3. Sélection lexicale seule ou lexicale + sémantique ?  
   **Recommandation : lexicale d’abord, sémantique en second, plafonnée.**
4. Fallback si un skill est indisponible au runtime ?  
   **Recommandation : erreur auditée + prompt générique, jamais de silence.**
