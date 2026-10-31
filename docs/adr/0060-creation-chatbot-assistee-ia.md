# 0060. Création de chatbot assistée par IA — préremplissage supervisé

- **Statut** : Accepté
- **Date** : 2026-10-31
- **Décideurs** : équipe projet
- **Référence** : ADR-0038, ADR-0055, ADR-0059.

## Contexte

La création manuelle d’un chatbot est complète : comportement, fiches, données,
moteurs IA, diffusion, fallback. Le besoin est d’ajouter un mode assisté par IA
où l’utilisateur fournit :

- un prompt décrivant le chatbot ;
- éventuellement un site web ;
- éventuellement des documents (PDF, DOCX, ODT, Markdown, RTF, TXT).

L’IA doit préparer la configuration, mais l’utilisateur doit garder le contrôle.
La création ne doit pas produire un chatbot actif sans revue.

## Décision

### 1. Mode assisté = préremplissage

L’assistant IA produit un **brouillon sans écriture en base**. Le brouillon
préremplit le formulaire existant. L’utilisateur relit, ajuste, puis enregistre
avec le parcours actuel.

Aucun chatbot n’est créé automatiquement.

### 2. Périmètre prérempli

L’IA préremplit :

- le libellé ;
- le mode guidé ;
- le rôle, l’objectif, la langue, le ton ;
- les garde-fous et instructions supplémentaires ;
- la fiche de collecte, si des champs sont pertinents ;
- le fallback heuristique ;
- la sélection de données.

Elle ne préremplit pas :

- la photothèque ;
- les médias liens ;
- le template visuel ;
- les canaux, qui restent choisis par l’utilisateur ;
- les quotas ;
- la politique de confidentialité.

### 3. Fiche conditionnelle

Si l’IA propose au moins un champ de collecte, une fiche est créée dans le
brouillon. Si aucun champ n’est pertinent, le chatbot est un chatbot de
présentation sans fiche.

`fallback.showCollectionForm` est vrai uniquement si la fiche contient des
champs.

### 4. Fallback

Le même appel IA produit les questions/réponses de secours. Elles sont
factuelles, bornées et validées par le parseur ADR-0059. Aucune détection de
mots-clés n’est introduite.

### 5. Sources et connaissances

Les contenus du site et des documents sont transformés en connaissances
candidates. Les fichiers ne sont pas conservés après extraction.

Après validation, les connaissances sont créées avec
`chatLinkIds = [nouveauChatbotId]` : elles sont rattachées au chatbot, pas
globalement. Les doublons de titre sont ignorés et signalés à l’utilisateur.

### 6. Formats et limites

Formats admis : PDF, DOCX, ODT, Markdown, RTF, TXT.

Limites synchrones :

- 5 fichiers maximum ;
- 10 Mo par fichier ;
- 50 Mo au total ;
- 5 pages web par défaut ;
- profondeur 1 par défaut ;
- contexte tronqué avec avertissement.

Le crawler respecte `robots.txt`, reste sur la même origine et ne rend pas le
JavaScript. Un site sans HTML exploitable produit un avertissement, pas un
échec.

### 7. Diffusion par défaut

Lorsqu’un brouillon IA est appliqué :

- page activée, identification `contact` ;
- widget activé, identification `anonyme`.

L’utilisateur peut modifier ces valeurs et doit choisir un template visuel
compatible avec le widget.

### 8. Application et connaissances

Le formulaire envoie les connaissances candidates dans le payload de création
du lien. Le serveur exécute dans une **transaction unique** :

1. création du lien ;
2. création des canaux ;
3. création de la configuration ;
4. création des connaissances avec `chat_link_ids = [nouveauLienId]`.

Si une étape échoue, l’ensemble est annulé : aucun chatbot partiel, aucune
connaissance orpheline.

Les doublons de titre sont détectés avant insertion, ignorés et retournés dans
le bilan de création. L’API `/api/connaissances` reste disponible
indépendamment pour la gestion manuelle.

### 9. Aucun média

Les photos et liens médias ne sont ni générés ni associés automatiquement.

## Conséquences

### Positives

- réutilisation du generator, du crawler, de l’extracteur et du wizard ;
- contrôle utilisateur avant activation ;
- une fiche n’est créée que si la collecte a du sens ;
- connaissances réellement rattachées au chatbot ;
- pas de modification du parcours manuel.

### Négatives

- le brouillon IA n’est pas persisté si l’utilisateur recharge la page ;
- un site rendu uniquement côté client peut fournir peu de contenu ;
- le template visuel et les canaux restent à la charge de l’utilisateur.

## Alternatives écartées

- **Créer le chatbot directement** : trop risqué, aucune revue.
- **Créer les connaissances globalement** : fuite de contexte entre chatbots.
- **Générer aussi les médias** : hors périmètre et risque de données non
  maîtrisées.
- **Rendre le JavaScript des sites** : coût et complexité hors MVP.
- **Détection de mots-clés pour le fallback** : écartée par ADR-0059.
