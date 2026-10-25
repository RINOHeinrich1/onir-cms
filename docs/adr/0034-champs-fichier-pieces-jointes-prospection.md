# 0034. Champs fichier et pièces jointes de prospection

- **Statut** : Accepté
- **Date** : 2026-10-25
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0011 (modèles de raisonnement), ADR-0013
  (médias), ADR-0018 (confidentialité), ADR-0019 (templates visuels),
  ADR-0020 (capacités cœur), ADR-0024 (SDK) et ADR-0033 (identification).

## Contexte

Le prospect doit pouvoir fournir des **pièces justificatives** pendant une
discussion de prospection : carte d'identité, carte d'identité fiscale, extrait
de registre, etc.

Le créateur du lien définit les informations à collecter dans le **modèle de
raisonnement**. Certaines de ces informations ne sont pas des textes mais des
**fichiers**. Le lien hérite du modèle et de sa version figée.

Contraintes structurantes :

- **Aucune extraction, aucun OCR et aucune analyse IA en v1** : le fichier est
  seulement stocké et référencé.
- Le template visuel est du **code tiers** ; il ne doit jamais accéder au
  stockage, à la base ou à l'API directement.
- Éviter tout couplage fort **template ↔ cœur / backoffice** : le contrat hôte
  reste le seul point de contact.
- Les pièces peuvent contenir des **données personnelles sensibles** : stockage
  privé, accès contrôlé, pas d'URL publique devinable.
- L'extension du contrat et du modèle doit être **additive** : les modèles,
  liens et templates existants continuent de fonctionner.

## Décision

### 1. Un type de champ générique `file`

Le type `file` remplace les catégories `image` / `document`. Un champ fichier
porte ses contraintes :

```text
{
  name,
  label,
  type: "file",
  required,
  requiredIf?,
  file: {
    accept: string[],   // types MIME autorisés
    maxFiles: number,   // 1..5
    maxBytes: number    // 1..10 Mio par fichier
  }
}
```

- `accept` est une **allowlist MIME**, pas une allowlist d'extensions.
- L'extension est déduite du MIME détecté et ne sert qu'à l'affichage/au nom du
  fichier stocké.
- Les préréglages d'interface (`Image`, `Document`, `Personnalisé`) ne créent
  pas de types différents : ils remplissent seulement `accept`.
- Un champ fichier est **ignoré par l'IA** : il n'entre ni dans le guide
  d'extraction, ni dans les données proposées par le modèle.

### 2. Entité `Attachment` séparée de `Media`

Une pièce jointe de prospection n'est **pas** un média de la médiathèque :

- `Media` = photo/lien proposé par l'assistant, catalogue éditorial ;
- `Attachment` = fichier fourni par un prospect pour un champ de collecte.

Une table dédiée porte les métadonnées :

```text
conversation_attachments
  id, organization_id, conversation_id, message_id nullable,
  field_name, field_label, original_name, mime, size_bytes,
  storage_key, sha256, created_at
```

- `field_name` est une **référence souple** au champ du modèle ; aucune clé
  étrangère vers le template.
- `field_label` est un **instantané** du libellé pour que la fiche reste lisible
  si le modèle évolue.
- `message_id` reste nul tant que la pièce n'a pas été envoyée avec un message.
- Le fichier est stocké **hors `public/`**, sous
  `ATTACHMENTS_DIR` (défaut : `MEDIA_DIR/attachments`), avec un nom généré.

### 3. Upload médié par l'hôte, jamais par le template

Deux points d'entrée utilisent le **même cas d'usage** et le **même endpoint** :

- chat par défaut : input fichier natif ;
- template visuel : action hôte `requestAttachment(fieldName)`.

Le template :

- reçoit les champs fichier via `resources.modelForm` ;
- demande à l'hôte d'ouvrir le sélecteur de fichiers ;
- ne reçoit jamais de clé de stockage ni d'accès direct ;
- affiche les pièces en attente depuis le contexte hôte.

L'hôte :

- ouvre le sélecteur avec `accept` et `multiple` selon les contraintes ;
- valide, stocke et rattache au message ;
- expose des **références opaques** et des URL signées de courte durée.

La capacité `attachments` est **additive** : un template qui ne la déclare pas
ignore simplement les pièces.

### 4. Aucun traitement IA en v1

- Les fichiers ne sont pas envoyés au fournisseur IA.
- Les réponses du chat ne dépendent pas du contenu des fichiers.
- Un message composé uniquement de fichiers est accepté, mais **ne déclenche
  pas** d'appel IA : le message utilisateur est enregistré avec ses pièces.
- Un message avec texte et fichiers suit le flux IA normal ; seul le texte est
  transmis au modèle.
- Le pré-remplissage IA de la fiche **saute les champs fichier**.
- OCR, extraction de texte, vision et résumé feront l'objet d'une ADR dédiée.

### 5. Référencement dans la fiche

- Une table de liaison `fiche_attachments` associe une fiche à ses pièces
  (`fiche_id`, `attachment_id`, `field_name`).
- À la génération de la fiche, les pièces de la conversation sont rattachées à
  la fiche.
- Un champ fichier obligatoire est validé par la **présence d'au moins une
  pièce** pour ce champ.
- Le Markdown et le PDF affichent des **liens cliquables** vers les pièces sous
  le champ correspondant. Les liens passent par une route protégée par la
  session backoffice ; ils ne sont jamais publics.
- La fiche ne stocke pas les octets : elle référence les pièces.

### 6. Sécurité et validation

Le serveur applique systématiquement :

- une allowlist MIME et une **détection de signature** (JPEG, PNG, WebP, PDF,
  DOCX, texte) ;
- une taille maximale par fichier et un nombre maximal par champ ;
- le refus des formats actifs (HTML, SVG, JavaScript) et des fichiers vides ;
- un nom de stockage généré (UUID + extension sûre) ;
- un contrôle d'appartenance à la conversation et à l'organisation ;
- un accès fichier par session dashboard **ou** URL HMAC courte durée ;
- `X-Content-Type-Options: nosniff` et `Content-Disposition` adapté.

Le contenu n'est pas exécuté, n'est pas rendu inline pour les formats non
raster, et n'est pas journalisé.

### 7. Découplage

- Le cœur ne connaît que `Attachment`, ses contraintes et ses ports.
- Le template ne connaît que le contrat hôte (`modelForm`, `attachments`,
  actions).
- Le backoffice lit les pièces par les repositories/API génériques.
- Aucun import du domaine template dans le domaine attachment.
- `field_name` / `field_label` sont des données, pas des dépendances de code.

## Conséquences

### Positives

- Un seul type `file` couvre CIN, carte fiscale, PDF, DOCX et évolutions
  futures sans nouveau type métier.
- Les templates restent isolés : aucune implémentation de stockage côté tiers.
- Aucun coût ni risque IA tant que l'extraction n'est pas décidée.
- La fiche reste lisible et les pièces sont traçables.
- Les modèles et templates existants ne sont pas cassés.

### Négatives / risques

- Les pièces peuvent contenir des données personnelles : la politique de
  conservation et de purge devra être précisée.
- Les templates existants doivent être adaptés pour afficher les champs fichier
  et appeler `requestAttachment`.
- Les liens de téléchargement publics sont signés et expirent ; le PDF ne
  contient que les noms, pas les octets.
- Le stockage disque doit être sauvegardé avec la base et protégé.

## Alternatives écartées

- **Types `image` et `document`** : figent le cœur sur des catégories et
  multiplient les cas lors de l'ajout d'un format.
- **Allowlist d'extensions seule** : contournable par renommage ; insuffisante
  pour des pièces sensibles.
- **Réutiliser `medias`** : mélange catalogue éditorial et preuves de
  prospection, et expose les fichiers par le parcours média.
- **Upload direct depuis le template** : viole l'isolation ADR-0019 et duplique
  l'authentification/stockage.
- **OCR/vision en v1** : hors périmètre, coût et risques de données non
  nécessaires.
- **Envoyer les fichiers à l'IA** : fuite de données et comportement non
  demandé.

## Plan de mise en œuvre

1. ADR + index.
2. Domaine : `Attachment`, contraintes `file`, validation MIME/taille.
3. Migration `conversation_attachments` + `fiche_attachments`.
4. Ports/repositories et stockage privé.
5. API upload / suppression / téléchargement signé.
6. Intégration chat : message avec pièces, fichier seul sans IA.
7. Intégration fiche : validation, liaison, rendu Markdown/PDF.
8. UI chat par défaut et transcript.
9. Contrat hôte, SDK, TemplateHost et documentation.
10. UI admin du modèle (type fichier, préréglages, contraintes).
11. Tests, lint, typecheck, build.

## Liens

- ADR-0011 (modèles de raisonnement)
- ADR-0013 (médias)
- ADR-0018 (confidentialité)
- ADR-0019 (templates visuels)
- ADR-0020 (capacités cœur)
- ADR-0024 (SDK)
- ADR-0033 (identification)
