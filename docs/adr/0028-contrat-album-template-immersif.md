# 0028. Contrat `album` distinct du contrat `library` (template immersif)

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0023 (variables paramétrables), ADR-0026
  (ressources de données des templates) et ADR-0027 (catégories et clés de
  rattachement).

## Contexte

Le template `immersive` possède déjà un contrat `library` : il décrit les
**livres du meuble bibliothèque** et leurs pages. L'**album posé sur le pupitre**
est un autre contenu : il est ouvert directement au clic sur le livre et ne
partage ni la même structure ni le même cycle d'ouverture.

Aujourd'hui l'album est alimenté par `ctx.resources.media.photos` (la médiathèque
du lien). Il ne peut donc pas être configuré indépendamment du meuble : un
exploitant ne peut pas choisir une source dédiée à l'album sans passer par les
médias du lien.

Le besoin est de donner à l'album son **propre contrat de données**, sa propre
liaison SQL et son propre paramétrage, sans modifier le contrat `library` ni
introduire de vocabulaire métier dans le cœur.

## Décision

### 1. Un contrat `album` séparé

Le manifeste du template déclare un contrat `album`, distinct de `library` :

- `library` = livres + pages du **meuble** ;
- `album` = pages du **livre du pupitre**.

Les deux contrats ont leurs propres bindings et peuvent pointer vers des
sources différentes. Aucun mélange de données entre les deux.

### 2. Schéma du contrat

```json
{
  "key": "album",
  "label": "Album",
  "description": "Pages du livre posé sur le pupitre",
  "version": 1,
  "loading": "lazy",
  "inputs": [],
  "schema": {
    "type": "object",
    "required": ["pages"],
    "properties": {
      "title": { "type": "string", "maxLength": 120 },
      "pages": {
        "type": "array",
        "maxItems": 100,
        "items": {
          "type": "object",
          "required": ["id"],
          "properties": {
            "id": { "type": "string", "maxLength": 64 },
            "media_id": { "type": "string", "maxLength": 64 },
            "image": { "type": "string", "format": "uri", "maxLength": 2000 },
            "title": { "type": "string", "maxLength": 120 },
            "caption": { "type": "string", "maxLength": 300 },
            "text": { "type": "string", "maxLength": 2000 }
          }
        }
      }
    }
  }
}
```

Sémantique :

- `pages` est la seule collection obligatoire ; l'ordre du binding est l'ordre
  d'affichage.
- `id` identifie la page pour la navigation et la pagination.
- `media_id` référence un média de la médiathèque ; l'URL signée est résolue par
  l'hôte.
- `image` est une URL directe de secours si `media_id` est absent ou non résolu.
- `caption` est la légende sous l'image.
- `title` devient le titre de la première page de texte.
- `text` est le corps paginé automatiquement.
- Une page sans image ni texte est ignorée.
- `title` à la racine est optionnel.

Le plafond de 2 000 caractères pour `text` et `image` respecte la limite globale
des schémas de contrats (ADR-0026) ; `pages` est plafonné à 100.

### 3. Précédence et repli

- Si un binding `album` existe et renvoie un résultat **valide** (même vide),
  l'album est la **seule source** des pages. Aucune fusion avec la médiathèque.
- Si `album` est absent, non lié, en erreur ou renvoie une structure invalide,
  le template conserve le comportement actuel : `resources.media.photos`.
- Le titre de l'album suit la même règle :
  - `album.title` non vide s'il est fourni ;
  - sinon `titre_de_livre` (ou le nom de marque).
- Le chargement de l'album est `lazy` : il est déclenché à l'entrée dans la
  salle et préchargé pendant le déplacement vers le pupitre, sans peser sur le
  boot.

### 4. Paramètre `categorie` en texte

La catégorie de l'album est un **paramètre du lien**, pas une entrée du contrat :

```json
{
  "key": "categorie",
  "label": "Catégorie de l'album",
  "type": "string",
  "default": ""
}
```

Le binding mappe `$1` sur la source **Paramètre du lien** / clé `categorie`.
La requête cible le **libellé** de catégorie, pas son identifiant :

```sql
SELECT media_id AS id,
       media_id,
       media_libelle AS caption
FROM v_media_categories
WHERE lower(category_label) = lower($1)
  AND media_type = 'photo'
ORDER BY media_libelle;
```

`category_label` reste une colonne de présentation, conformément à ADR-0027 :
la clé de rattachement en base demeure `category_id`. Le texte de catégorie est
uniquement le critère de sélection configuré sur le lien, ce qui évite d'exposer
un UUID dans l'interface d'exploitation.

## Conséquences

- Le panneau affiche deux contrats distincts pour le template immersif :
  `library` et `album`.
- Les liens existants sans binding `album` continuent d'utiliser la médiathèque.
- Un binding `album` configuré devient la source de vérité de l'album, même s'il
  renvoie une liste vide.
- L'ajout du paramètre `categorie` est rétrocompatible : sa valeur par défaut
  est vide et les liens existants ne sont pas modifiés.
- La résolution des images reste de la responsabilité de l'hôte (URLs signées) ;
  le template ne reçoit jamais d'accès direct à la base.
- Le cœur ne connaît toujours ni « album », ni « livre », ni « catégorie
  d'album » : ces notions restent dans le manifeste et le binding du template.
