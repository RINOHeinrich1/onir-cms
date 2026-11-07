# 0072. Import de connaissances assisté par IA

- **Statut** : Accepté
- **Date** : 2026-11-06
- **Décideurs** : équipe projet
- **Référence** : ADR-0049, ADR-0060, ADR-0069, ADR-0070.
- **Complète** : ADR-0060, ADR-0070.
- **Remplace** : aucune.

## Contexte

Le widget d’assistance proposait une option « Remplir des connaissances » qui
n’était qu’une simulation. Les utilisateurs doivent pouvoir alimenter la base de
connaissances depuis des documents ou plusieurs pages web, avec un scope de
chatbots, sans passer par la création d’un chatbot.

## Décision

### 1. Parcours

L’option « Remplir des connaissances » du widget d’assistance ouvre une modale
dédiée avec :

1. documents (multi-fichiers) ;
2. liens de sites (plusieurs URLs) ;
3. scope de chatbots en tag input ;
4. analyse IA ;
5. aperçu éditable des connaissances ;
6. import.

Le scope vide signifie **global**. Un scope non vide limite les connaissances
aux chatbots sélectionnés via `chat_link_ids`.

### 2. Extraction

Les documents et pages sont lus par les extracteurs existants. Un appel IA
dédié produit `{ titre, contenu }` avec :

- titres uniques et courts ;
- contenus factuels ;
- recopie exacte des téléphones, emails, URL, adresses et noms ;
- aucune invention ;
- déduplication par titre normalisé.

L’aperçu permet de corriger le titre, corriger le contenu ou retirer une
connaissance avant import.

### 3. Doublons

Avant import, les titres sont comparés aux connaissances existantes avec la
même procédure que la création de chatbot (`POST /api/connaissances/conflicts`) :

- **Mettre à jour** : contenu remplacé ;
- **Garder les anciennes** : connaissance ignorée.

Le scope d’une connaissance existante suit les règles suivantes :

- globale : reste globale ;
- scopée et nouveaux chatbots sélectionnés : les nouveaux IDs sont ajoutés ;
- scopée sans nouveau chatbot : le scope existant est conservé.

### 4. Création

- nouvelle connaissance : `chatLinkIds = scope` (vide = global) ;
- mise à jour : contenu remplacé, scope conservé/étendu ;
- « garder » : aucun ajout ;
- résultat détaillé : créées, mises à jour, ignorées, échecs.

Aucune notification automatique n’est créée en V1.

### 5. Sécurité et limites

- permission `connaissances:create` + `ai:read` ;
- rate limit dédié ;
- mêmes limites de documents que la génération de chatbot ;
- maximum 5 URLs ;
- les fichiers ne sont pas stockés : leur texte est extrait ;
- validation serveur de chaque connaissance avant écriture.

## Conséquences

- alimentation de la base sans créer de chatbot ;
- contrôle explicite du scope ;
- revue humaine avant écriture ;
- réutilisation du flux de conflits existant ;
- pas de stockage binaire de documents dans la base de connaissances.
