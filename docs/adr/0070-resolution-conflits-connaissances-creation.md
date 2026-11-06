# 0070. Résolution des conflits de connaissances à la création d’un chatbot

- **Statut** : Accepté
- **Date** : 2026-11-06
- **Décideurs** : équipe projet
- **Référence** : ADR-0049, ADR-0060, ADR-0068, ADR-0069.
- **Complète** : ADR-0060 (création assistée et connaissances).
- **Remplace** : aucune.

## Contexte

Lors de la création d’un chatbot, les connaissances du brouillon sont ajoutées
après la création du lien. Si un titre existe déjà dans l’organisation, l’API
renvoie `Titre déjà utilisé` et le chatbot est créé avec des ajouts en échec.
Le problème survient avec ou sans IA, car les deux parcours utilisent le même
brouillon de données.

## Décision

### 1. Détection avant création

Avant de créer le chatbot, les titres des connaissances du brouillon sont
comparés aux connaissances de l’organisation. Si des conflits existent, le
chatbot n’est pas créé tant que l’utilisateur n’a pas choisi.

### 2. Choix proposé

Une modale affiche les connaissances en conflit et, pour chacune, les chatbots
qui consomment déjà la connaissance existante. L’utilisateur choisit :

- **Mettre à jour les connaissances** : le contenu des connaissances existantes
  est remplacé. Les chatbots listés sont impactés. Le nouveau chatbot est
  rattaché à la connaissance mise à jour et, si le contenu est global, l’ID est
  ajouté à sa sélection.
- **Garder les anciennes** : aucun contenu n’est modifié et les doublons ne sont
  pas ajoutés. Le nouveau chatbot n’utilise pas ces connaissances en conflit.

Le choix est global pour l’ensemble des conflits détectés.

### 3. Détermination des chatbots impactés

Un chatbot est impacté si la connaissance est :

- globale et consommée par `informationSources.connaissances` en mode `all` ;
- globale et présente dans `informationSources.connaissances.selection.ids` ;
- scopée au chatbot via `base_connaissances.chat_link_ids`.

Pour les configurations legacy, `link.sources.connaissances` et
`dataSelection` sont utilisés comme fallback.

### 4. Pas de notification en V1

L’avertissement est porté par la modale de résolution. Aucun email ni
notification générique n’est ajouté dans cette version. Les utilisateurs voient
la liste des chatbots impactés avant de confirmer une mise à jour.

### 5. Mise à jour d’une connaissance existante

Lors d’une mise à jour :

- le titre reste inchangé ;
- le contenu est remplacé ;
- si la connaissance était scopée à un ou plusieurs chatbots, le nouveau
  chatbot est ajouté à sa portée ;
- si la connaissance était globale, elle le reste ;
- l’opération est appliquée après la création du lien, avec le choix mémorisé
  par l’utilisateur.

## Conséquences

### Positives

- plus de création partielle « chatbot créé mais N ajouts échoués » pour les
  conflits de titres ;
- l’utilisateur sait quels chatbots risquent d’être impactés ;
- le choix « garder » est non destructif ;
- le parcours IA et le parcours manuel partagent le même comportement.

### Négatives

- la mise à jour d’une connaissance partagée peut modifier les réponses de
  plusieurs chatbots ;
- le choix est global, pas connaissance par connaissance ;
- aucune notification différée n’est envoyée aux créateurs concernés en V1.

## Alternatives écartées

- **Laisser l’erreur 409 apparente** : création partielle et expérience confuse.
- **Ajouter automatiquement les doublons avec un titre suffixé** : pollution de
  la base et titres non maîtrisés.
- **Notifier par email les créateurs** : aucune infrastructure email générique
  disponible, hors périmètre V1.
