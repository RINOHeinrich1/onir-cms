# 0098. Limite des paramètres de template portée à 64

- **Statut** : Accepté
- **Date** : 2026-11-18
- **Référence** : ADR-0023, ADR-0081, ADR-0095.
- **Complète** : ADR-0023.

## Contexte

Le contrat des paramètres statiques de template était borné à **40 paramètres**
(ADR-0023). Les templates riches, comme Pop Design, atteignent déjà cette
limite avec leurs visuels, textes, couleurs et options de panneaux.

L'ajout d'un paramètre simple — le nom affiché de l'assistant — aurait dépassé
la borne et bloqué l'import du template, alors que la borne protège surtout
contre les schémas non maîtrisés, pas contre un paramètre supplémentaire
légitime.

## Décision

`MAX_TEMPLATE_PARAMS` passe de **40 à 64**.

Les autres bornes restent inchangées :

- 16 Ko de schéma ;
- 64 Kio de valeurs ;
- profondeur 8 ;
- 300 nœuds ;
- 50 propriétés par objet ;
- 100 éléments par tableau.

## Conséquences

- Pop Design 2.6.4 peut exposer `nom_assistant` sans retirer de paramètre
  existant.
- Les templates existants restent valides.
- Le coût de validation reste borné et les gardes de structure sont conservées.
