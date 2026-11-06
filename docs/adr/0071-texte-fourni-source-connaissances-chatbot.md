# 0071. Texte fourni comme source de connaissances du chatbot

- **Statut** : Accepté
- **Date** : 2026-11-06
- **Décideurs** : équipe projet
- **Référence** : ADR-0060, ADR-0068, ADR-0069.
- **Complète** : ADR-0069.
- **Remplace** : aucune.

## Contexte

Le builder conversationnel exige au moins une source d’information pour une
mission `inform` ou `hybrid`. Cette règle est correcte, mais elle ne
reconnaissait que les sites, documents, fiches existantes et médias. Un
utilisateur qui fournissait toutes les informations utiles dans le texte de la
conversation était donc bloqué : l’assistant lui redemandait indéfiniment un
site ou un document.

## Décision

Le texte fourni dans la conversation devient une source de connaissances
valide.

### 1. Représentation

Le brief porte `sources.useDescriptionAsSource`.

Quand il vaut `true` :

- `hasSource()` considère la source comme présente ;
- `sourceIntent.connaissances` vaut `true` ;
- le prérequis `source` disparaît ;
- l’assistant arrête de demander un site ou des documents.

La source texte n’est valide que si le brief contient un contenu utilisateur.
Le résumé `description` reste utilisé pour l’identité, mais la génération
s’appuie sur l’ensemble des messages utilisateur du brief.

### 2. Activation

La source texte est activée automatiquement lorsqu’aucune source externe
(site, documents, fiches existantes ou médias) n’est fournie et que le brief
contient un contenu utilisateur. Aucune case à cocher n’est nécessaire.

### 3. Génération

Lors de la génération :

- les **messages utilisateur du brief** (`briefMessages`) sont transmis au
  générateur, pas seulement la description résumée ;
- l’IA extrait les faits utiles (services, contacts, adresses, horaires,
  offres) dans `knowledge` ;
- les téléphones, emails, URL et adresses sont recopiés exactement ;
- si aucune connaissance n’est produite, une connaissance de secours
  `Informations fournies` est créée avec le texte source du brief ;
- `sourceIntent.connaissances = true` ;
- le brouillon final active la source connaissances et sélectionne ces
  connaissances.

### 4. Règles métier

La règle « au moins une source » reste applicable.

| Mission | Source texte |
|---|---|
| `inform` | Autorisée comme source unique |
| `hybrid` | Autorisée en complément ou comme source unique |
| `collect` | Non active : le texte reste un contexte de génération, sans source runtime |

La source texte ne remplace pas :

- la sélection manuelle des `ficheTypes` pour la source A ;
- la sélection explicite des médias ;
- les règles de portée des connaissances.

## Conséquences

### Positives

- plus de boucle site/document quand l’utilisateur a déjà fourni les
  informations ;
- les coordonnées, services et offres peuvent devenir une base de connaissances ;
- la règle métier de source minimale est conservée.

### Négatives

- la qualité dépend de la précision du texte fourni ;
- une connaissance de secours peut être plus longue et moins structurée que des
  connaissances extraites de documents ;
- l’utilisateur doit vérifier les connaissances générées dans l’éditeur.
