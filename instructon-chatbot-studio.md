## Mission : Concevoir et développer un Template Builder pour ONIR-CMS

Agis comme un **Senior Frontend Engineer, Software Architect et expert en conception orientée objet (POO avancée) avec Next.js**.

Je souhaite concevoir et développer un **Template Builder visuel pour ONIR-CMS**, inspiré de l'expérience de création de Canva Studio, mais entièrement dédié à la personnalisation de l'apparence et de l'expérience utilisateur des chatbots.

### 1. Analyse de l'existant

Avant de commencer le développement :

- Explore le projet ONIR-CMS et son architecture actuelle.
- Identifie les templates déjà existants.
- Analyse le SDK actuel, ses composants, ses interfaces, ses contrats et ses mécanismes d'intégration.
- Sélectionne un template existant comme cas pratique.
- Fais fonctionner ce template et réalise des tests pour comprendre son cycle de vie, son rendu et son intégration avec le SDK.

**Important :** le SDK existant constitue la norme technique de référence. Le Template Builder doit s'y conformer sans casser les fonctionnalités ni les mécanismes d'intégration déjà en place.

### 2. Objectif du Template Builder

Développer un éditeur visuel accessible aux utilisateurs non techniques, leur permettant de créer, personnaliser, modifier et sauvegarder leurs propres templates de chatbot, sans avoir à écrire du code.

L'expérience doit se rapprocher de Canva Studio :

- Partir d'un template existant.
- Adapter un template prédéfini.
- Créer un design entièrement vierge.
- Personnaliser chaque élément visuel.
- Ajouter, supprimer, déplacer et redimensionner les composants.
- Modifier les couleurs, typographies, espacements, bordures, dimensions, animations et comportements.
- Prévisualiser le résultat en temps réel.

### 3. Architecture technique et POO avancée

Conçois une architecture générique, évolutive et orientée objet.

Chaque élément visuel doit être considéré comme un objet configurable, disposant de ses propres propriétés, attributs, comportements et règles de validation.

Le système doit notamment prendre en charge :

- Un modèle de composants réutilisables.
- Un système de propriétés dynamiques.
- Une gestion hiérarchique des éléments.
- Un moteur de rendu indépendant de l'interface d'édition.
- Un système de sérialisation et de désérialisation des templates.
- Une gestion des versions.
- Un système de validation et de compatibilité avec le SDK.
- Une architecture extensible permettant d'ajouter de nouveaux composants sans reconstruire le moteur.

### 4. Fonctionnement par Web Service

Le Template Builder doit fonctionner comme un service indépendant de création et de gestion des templates.

Il doit communiquer avec ONIR-CMS à travers des API/Web Services afin de :

- Charger les templates disponibles.
- Récupérer leurs configurations.
- Créer et modifier des templates.
- Enregistrer les personnalisations.
- Publier les templates validés.
- Transmettre les configurations au SDK pour leur intégration dans les chatbots.

### 5. Méthode de développement obligatoire

Ne commence pas directement à coder le Builder.

Procède dans cet ordre :

1. Auditer l'architecture existante d'ONIR-CMS.
2. Identifier et analyser les templates existants.
3. Sélectionner un template réel comme référence.
4. Tester son fonctionnement avec le SDK.
5. Identifier les possibilités et les limites de personnalisation.
6. Définir l'architecture cible du Template Builder.
7. Définir les classes, objets, interfaces, contrats et relations entre composants.
8. Développer progressivement le moteur de création visuelle.
9. Connecter le Builder aux Web Services.
10. Tester la compatibilité avec le SDK et le rendu final du chatbot.

### Règle fondamentale

Ne crée pas un simple éditeur de couleurs ou un formulaire de personnalisation. Je veux un véritable **Studio de création visuelle de templates de chatbot**, avec une logique comparable à Canva : un utilisateur doit pouvoir construire librement son interface à partir d'objets visuels configurables.

Conserve l'architecture existante d'ONIR-CMS, respecte les normes du SDK et privilégie une conception professionnelle, modulaire, générique, maintenable et évolutive.

Commence par l'audit technique et l'analyse d'un template existant avant toute implémentation.