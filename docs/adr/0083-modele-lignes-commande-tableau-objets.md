# 0083. Modèle de lignes de commande — fiche unique avec tableau d'objets

- **Statut** : Proposé
- **Date** : 2026-11-09
- **Décideurs** : équipe projet
- **Référence** : ADR-0049, ADR-0059, ADR-0082.
- **Complète** : ADR-0049, ADR-0082.
- **Remplace** : aucune.

## Contexte

Le mode de collecte IA et le mode semi-heuristique savent collecter une fiche
plate, et le multi-fiches sait gérer plusieurs **types** de fiches dans une
conversation.

Cela ne couvre pas correctement un document métier comportant plusieurs
lignes, par exemple une commande :

```text
Commande
- contact
- adresse
- lignes :
  - chips, quantité 5
  - vingt, quantité 2
```

Deux modèles sont possibles.

### Modèle A — plusieurs instances de la même fiche

Chaque ligne de commande est une instance distincte de la même fiche,
identifiée par une clé d'instance (`produit + variante` par exemple).

Avantages :

- réutilise `conversation_fiche_instances.instance_key` ;
- pas de nouveau type de champ ;
- une fiche finale par ligne.

Inconvénients :

- duplication des champs d'en-tête (`contact`, `adresse`, date) ;
- plusieurs fiches au lieu d'un document de commande ;
- moins adapté aux totaux et à l'affichage tabulaire.

### Modèle B — fiche unique avec tableau de lignes

Une fiche `commande` contient un en-tête et un champ structuré `lignes`
contenant un tableau d'objets.

Avantages :

- un seul document métier ;
- en-tête partagé ;
- totaux et rendu tabulaire naturels ;
- réutilisable pour devis, factures, listes de participants, etc.

Inconvénients :

- nouveau type de champ `lines` / tableau d'objets ;
- validation récursive ;
- formulaire et rendu plus complexes ;
- contrat template à faire évoluer.

## Décision

Le **Modèle B est retenu comme direction cible** pour les documents comportant
plusieurs lignes. Il n'est **pas implémenté** dans le périmètre actuel.

Le Modèle A reste disponible pour le simple besoin de plusieurs instances
d'une même fiche, mais il n'est pas le modèle retenu pour une commande
structurée.

### Type de champ

Ajouter un type générique :

```ts
{
  name: "lignes",
  label: "Lignes de commande",
  type: "lines",
  minRows: 1,
  maxRows: 20,
  rowKeyFields: ["produit", "variante"],
  itemFields: [
    { name: "produit", label: "Produit", type: "text", required: true },
    { name: "variante", label: "Variante", type: "text", required: true },
    { name: "quantite", label: "Quantité", type: "number", required: true }
  ]
}
```

Les données sont stockées dans l'instance sous forme de tableau :

```json
{
  "contact": "034...",
  "adresse": "Analakely",
  "lignes": [
    { "produit": "chips", "variante": "standard", "quantite": 5 },
    { "produit": "vingt", "variante": "1L", "quantite": 2 }
  ]
}
```

Le stockage reste en JSONB dans `fiche_definitions` et
`conversation_fiche_instances.data`. Aucune table SQL dédiée n'est créée dans
un premier temps.

### Règles de structure

- `itemFields` décrit les champs d'une ligne ;
- `rowKeyFields` est optionnel et sert à identifier une ligne pour la mise à
  jour et la déduplication ;
- `minRows` / `maxRows` bornent le tableau ;
- les champs obligatoires sont validés ligne par ligne ;
- les champs d'en-tête et les lignes sont validés dans la même transaction ;
- les totaux sont calculés côté serveur, pas par l'IA.

### Extraction IA

L'IA reçoit :

- le schéma de la fiche ;
- le schéma des lignes ;
- les lignes déjà présentes ;
- les règles de fusion.

Elle répond avec une structure imbriquée :

```json
{
  "contact": "034...",
  "lignes": [
    { "produit": "chips", "variante": "standard", "quantite": 5 },
    { "produit": "vingt", "variante": "1L", "quantite": 2 }
  ]
}
```

L'IA ne fournit pas d'identifiant technique de ligne. Le serveur normalise et
valide les `rowKeyFields`.

### Formulaire semi-heuristique

Le formulaire affiche un tableau dynamique :

- ajouter une ligne ;
- modifier une ligne ;
- supprimer une ligne en brouillon ;
- valider chaque ligne ;
- envoyer un tableau JSON.

L'IA n'intervient pas dans la saisie des lignes.

### Génération finale

Une seule fiche `commande` est générée, avec ses lignes. Le rendu doit savoir
afficher un tableau ou une liste, et non plus seulement des placeholders
scalaires.

## Conséquences

### Positives

- modèle métier correct pour les commandes, devis et factures ;
- un seul document avec en-tête partagé ;
- totaux et rendu tabulaire plus simples ;
- réutilisable au-delà de la commande ;
- compatible avec le stockage JSONB existant.

### Négatives

- nouveau type de champ et nouveau contrat template ;
- validation récursive ;
- formulaire Starter plus complexe ;
- extraction IA et prompt à adapter ;
- rendu final à adapter ;
- risque de complexité si le besoin réel est seulement « plusieurs fiches
  simples ».

## Alternatives écartées

- **Forcer les lignes dans un `textarea`** : perte de structure et de
  quantités ; écarté.
- **Utiliser `multi` comme liste de produits** : ne porte pas les quantités
  par ligne ; écarté.
- **Créer immédiatement des outils CRUD IA** : complexité, idempotence et
  audit prématurés ; écarté à ce stade.
- **Modèle A comme modèle principal** : duplication de l'en-tête et document
  métier éclaté ; conservé seulement pour le besoin simple de plusieurs
  instances.

## Hors périmètre

- implémentation du type `lines` ;
- modification du formulaire et du template Starter ;
- extraction IA des lignes ;
- migration de données ;
- outils IA de création, modification ou suppression de lignes.

Le Modèle B est donc une direction documentée, à implémenter après validation
du besoin métier.
