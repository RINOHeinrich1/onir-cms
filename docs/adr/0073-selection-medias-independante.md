# 0073. Sélection média indépendante et portée explicite

- **Statut** : Accepté
- **Date** : 2026-11-06
- **Décideurs** : équipe projet
- **Référence** : ADR-0013, ADR-0068.
- **Complète** : ADR-0068.
- **Remplace** : aucune.

## Contexte

Le mode « Toute la bibliothèque » était trompeur : il ne signifie pas toutes
les données de l’organisation, mais les données globales + celles déjà
rattachées au chatbot courant. Les données des autres chatbots restent
inaccessibles.

De plus, la sélection média était dérivée de `dataSelection`, partagée avec les
connaissances. Une source média pouvait donc être activée avec une sélection
vide, sans aucun avertissement.

## Décision

### 1. Libellé

Le mode `all` est libellé selon la source :

- **« Toutes les connaissances accessibles »** ;
- **« Tous les médias accessibles »**.

L’aide précise : « Inclut les données globales et celles déjà rattachées à ce
chatbot. Les données des autres chatbots ne sont jamais incluses. »

En création, avant que le chatbot ait un identifiant : seules les données
globales sont disponibles ; les données propres au chatbot seront ajoutées
après sa création.

### 2. Sélection média indépendante

`ChatbotConfigDraft.mediaSelection` porte le mode et les IDs média.
`informationSources.medias.selection` est construit à partir de cette sélection,
pas de `dataSelection`.

La sélection des connaissances reste portée par `dataSelection`.

### 3. Avertissement

Si Photos/Liens est activé et que la sélection média est `selected` avec zéro
média, l’interface affiche un avertissement et propose
**« Tous les médias accessibles »**. Le runtime n’est pas modifié.

### 4. Garde-fou création IA

Les chatbots créés par IA restent en :

- `dataSelection = selected` avec IDs vides ;
- `mediaSelection = selected` avec IDs vides ;
- source média désactivée par défaut.

Ils ne doivent jamais hériter du mode `all` implicitement.

## Conséquences

- libellé conforme à la portée réelle ;
- séparation connaissances/médias sans changement de schéma ;
- risque d’activation média sans contenu rendu visible ;
- aucune régression sur la génération IA ;
- runtime média inchangé.
