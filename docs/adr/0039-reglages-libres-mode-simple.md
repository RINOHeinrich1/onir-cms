# 0039. Réglages libres du mode Simple

- **Statut** : Accepté
- **Date** : 2026-10-27
- **Décideurs** : équipe projet
- **Référence** : complète et corrige ADR-0038 (assistance IA des modèles).

## Contexte

ADR-0038 a introduit l'assistance IA et le mode Simple, mais le prompt généré
contenait encore des comportements statiques :

- langue française imposée ;
- ton choisi dans une liste fermée ;
- garde-fous fermés et activés par défaut ;
- valeurs de repli statiques pour le rôle et l'objectif ;
- réglages simples non persistés, donc réinitialisés à l'édition ;
- au moins un champ obligatoire.

Ces choix empêchent un modèle de s'adapter à la langue du visiteur, notamment
le malgache, et réintroduisent des restrictions après chaque sauvegarde.

## Décision

### 1. Réglages persistés

Le snapshot de définition peut contenir un bloc `simple` :

```ts
type TemplateSimpleSettings = {
  role: string;
  objective: string;
  language: { mode: "auto" } | { mode: "fixed"; value: string };
  tone: string;
  guardrails: string[];
  extraInstructions: string;
};
```

Les anciennes versions sans ce bloc restent lisibles. Aucun prompt historique
n'est réécrit.

### 2. Langue

Le mode Simple propose :

- **Automatique** : répondre dans la langue du visiteur et s'adapter aux
  changements de langue ;
- **Langue fixe** : champ libre avec suggestions.

Le prompt ne contient plus de français imposé. Un rappel de langue est ajouté
après les enrichissements runtime (pièces jointes, RAG), afin qu'un contexte
interne en français ne réancre pas la conversation.

### 3. Ton et garde-fous libres

- Le ton est un texte libre avec suggestions ; il peut être vide.
- Les garde-fous sont des instructions libres avec suggestions.
- Aucun garde-fou n'est activé par défaut.
- Un champ « Instructions supplémentaires » couvre les besoins non prévus.

### 4. Suppression des replis statiques

- le rôle n'est plus remplacé par « assistant de prospection » ;
- l'objectif n'est plus remplacé par un objectif de qualification ;
- le ton vide n'est plus remplacé par « professionnel et chaleureux » ;
- une liste de garde-fous vide reste vide.

Le rôle est obligatoire en mode Simple ; l'objectif est optionnel.

### 5. Aucun champ obligatoire

Un modèle peut avoir `fields: []` : il est alors purement conversationnel.
La fiche générée reste une fiche minimale (titre et date) si l'utilisateur
termine la conversation.

### 6. Mode Expert inchangé

Le mode Expert reste la voie libre pour rédiger le prompt et le Markdown. Les
nouveaux réglages ne s'appliquent qu'au mode Simple et à l'assistance IA.

### 7. Libellés et fiche

Les libellés de champs ne sont pas pré-traduits. Le modèle traduit dans la
conversation s'il en est capable. La structure standard de la fiche
(`Date`, sections, ordre des champs) reste inchangée en mode Simple.

## Conséquences

- Les nouveaux modèles peuvent réellement répondre en malgache ou dans une
  autre langue.
- Les réglages Simple sont rechargés à l'édition.
- Les anciens modèles conservent leur prompt français jusqu'à régénération ou
  édition manuelle.
- Les modèles sans champ sont autorisés ; la fiche peut être minimale.
- Le mode Expert reste inchangé.
