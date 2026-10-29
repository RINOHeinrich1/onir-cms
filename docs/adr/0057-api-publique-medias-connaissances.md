# 0057. API publique — médias et connaissances

- **Statut** : Accepté
- **Date** : 2026-10-29
- **Décideurs** : équipe projet
- **Référence** : ADR-0012, ADR-0013, ADR-0043.

## Contexte

L’API v1 exposait les fiches, prospects, conversations, chatbots, modèles,
statistiques et webhooks, mais pas les médias ni la base de connaissances.
Les intégrations externes ne pouvaient donc pas alimenter la photothèque, les
liens proposés par l’IA ou le mini-RAG.

## Décision

### Scopes

Deux paires de scopes sont ajoutées :

```text
medias:read
medias:write
connaissances:read
connaissances:write
```

Une clé API existante conserve ses scopes ; une nouvelle clé est nécessaire pour
obtenir ces droits.

### Médias

```text
GET    /api/v1/medias
GET    /api/v1/medias/{id}
GET    /api/v1/medias/{id}/file
POST   /api/v1/medias
PATCH  /api/v1/medias/{id}
DELETE /api/v1/medias/{id}
```

- liste paginée, filtres `type=photo|lien`, `active`, `chatbotId`, `q` ;
- création JSON pour un lien ;
- création `multipart/form-data` pour une photo (`fichier`, `libelle`,
  `description`, `chatLinkIds`, `actif`) ;
- `fileUrl` pointe vers la route authentifiée par la clé API ; aucune clé de
  stockage interne n’est exposée ;
- les médias restent scopés à l’organisation de la clé.

### Connaissances

```text
GET    /api/v1/connaissances
GET    /api/v1/connaissances/{id}
POST   /api/v1/connaissances
PATCH  /api/v1/connaissances/{id}
DELETE /api/v1/connaissances/{id}
```

- liste paginée, filtres `active`, `chatbotId`, `q` ;
- le contenu est exposé uniquement aux clés disposant de `connaissances:read` ;
- l’unicité du titre et les règles de validation restent celles du domaine.

### Documentation

Les routes, schémas, scopes et réponses d’erreur sont ajoutés à OpenAPI 3.1 et
donc visibles dans Swagger `/api/v1/docs`.

## Conséquences

- Les intégrations peuvent gérer la photothèque, les liens et le mini-RAG.
- Les clés existantes ne gagnent pas automatiquement les nouveaux scopes.
- Les photos importées via l’API utilisent le même stockage que le backoffice.
- La suppression d’un média photo supprime aussi son fichier via le use case
  existant.

## Hors périmètre

- upload direct vers un stockage objet externe ;
- recherche vectorielle des connaissances ;
- gestion des catégories via API ;
- API publique des secrets ou des fournisseurs IA.
