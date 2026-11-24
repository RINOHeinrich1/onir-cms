# 0107. Build standalone téléchargeable pour hébergement autonome

- **Statut** : Proposé
- **Date** : 2026-11-24
- **Référence** : ADR-0106.

## Contexte

Certains utilisateurs souhaitent héberger eux-mêmes le front standalone de leur
chatbot sur leur propre serveur web.

Le build statique est déjà composé de fichiers autonomes. Il manque :

- une archive téléchargeable ;
- une route de téléchargement protégée ;
- des instructions de déploiement ;
- un exemple de proxy API.

## Décision

Chaque build `ready` ou `active` produit une archive :

```text
standalone-builds/<chatLinkId>/<buildId>/site.zip
```

Contenu :

```text
index.html
runtime.js
runtime.css
config.json
build.json
template/
README-DEPLOY.md
nginx.example.conf
```

### Téléchargement

Route protégée :

```text
GET /api/links/[id]/standalone/builds/[buildId]/download
```

Contrôles :

- permission `links:update` ;
- build appartenant au chatbot et à l'organisation ;
- statut `ready` ou `active` ;
- lecture de l'archive dans l'object storage ;
- réponse `application/zip` avec `Content-Disposition`.

### API du site auto-hébergé

Le build utilise `/api/chat` en same-origin. L'utilisateur doit proxyfier cette
route vers ONIR-CMS sur son serveur web. Le ZIP contient un exemple Nginx.

Sans proxy API, le front s'affiche mais le chat ne fonctionne pas.

### Sécurité

- aucun secret dans l'archive ;
- aucune credential base/storage ;
- accès au téléchargement authentifié ;
- vérification stricte de l'appartenance du build ;
- archive immuable liée au build.

### Hors périmètre

- gestion du DNS/TLS du serveur de l'utilisateur ;
- mise à jour automatique d'un site auto-hébergé ;
- déploiement FTP/SSH chez l'utilisateur ;
- signature de l'archive.

## Conséquences

### Positives

- sortie autonome du front ;
- pas de dépendance à l'edge ONIR pour servir les fichiers ;
- solution simple pour les clients qui veulent héberger eux-mêmes ;
- l'API de chat reste ONIR-CMS.

### Négatives

- l'utilisateur gère son serveur, son DNS et son TLS ;
- l'utilisateur doit configurer le proxy `/api/chat` ;
- les mises à jour nécessitent un nouveau téléchargement ;
- le support doit documenter clairement la séparation front/API.
