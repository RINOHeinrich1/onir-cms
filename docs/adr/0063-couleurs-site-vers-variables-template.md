# 0063. Extraction et mapping des couleurs du site vers les variables de template

- **Statut** : Proposé
- **Date** : 2026-11-03
- **Décideurs** : équipe projet
- **Référence** : ADR-0019, ADR-0023, ADR-0060, ADR-0062.

## Contexte

L’assistance IA de création de chatbot peut proposer une fiche de collecte et
sélectionner un template widget. Certains templates déclarent des variables
`type: "color"` dans `params` (ADR-0023), mais leur fonction varie d’un template
à l’autre : `primary`, `hero_background`, `card_surface`, `button_text`, etc.
Une même couleur de site ne peut donc pas être associée automatiquement à une
variable par son simple nom ou sa valeur.

Aujourd’hui, l’assistant applique les valeurs `default` du template et n’extrait
aucune couleur du site cible. Le site fourni sert uniquement à l’analyse de
contenu textuel.

Un navigateur headless donnerait une extraction fiable des styles calculés, mais
représente un coût d’exploitation important (image, mémoire, isolation réseau,
file d’attente). Cette ADR décrit la cible et laisse la décision d’implémentation
ouverte.

## Décision proposée

### 1. Contrat de rôles sémantiques

Étendre le schéma des paramètres de template avec un rôle optionnel pour les
variables `color` :

```ts
type TemplateColorRole =
  | "brand"
  | "action"
  | "accent"
  | "background"
  | "surface"
  | "text"
  | "textMuted"
  | "border"
  | "onAction"
  | "manual";
```

- Le **template** déclare le rôle de chaque variable couleur. Il reste seul
  responsable de la fonction visuelle de sa variable.
- `manual` signifie : ne jamais remplir automatiquement, conserver le défaut.
- Les états dérivés (`hover`, `disabled`, `border`) sont calculés à partir d’un
  rôle de base, pas extraits séparément.
- Un paramètre couleur sans rôle explicite n’est pas rempli automatiquement.
  Une migration progressive des manifests est possible ; les templates non
  migrés conservent leurs valeurs par défaut.

### 2. Extraction d’une palette de site

À partir de l’URL fournie à l’assistant, produire une palette de **rôles
candidats**, pas une simple liste de couleurs :

- `meta[name="theme-color"]`, manifest `theme_color` / `background_color` ;
- variables CSS personnalisées (`--primary`, `--brand`, etc.) ;
- styles effectifs des éléments représentatifs : `body`, `header`, `nav`,
  bouton principal, lien, surface/carte, bordure ;
- normalisation en hexadécimal et regroupement des couleurs proches ;
- score par rôle : zone d’usage, surface couverte, nom de variable, confiance.

Une passe headless est nécessaire pour obtenir les styles calculés lorsque les
feuilles de style sont externes ou complexes. Sans headless, l’extraction se
limite aux métadonnées, au CSS inline et aux variables accessibles, avec
davantage de valeurs par défaut.

L’extraction ne doit jamais exécuter de script du site cible. Un worker isolé,
avec liste d’URL autorisées, limites de taille, timeout et cache, est requis si
l’option headless est retenue.

### 3. Classification et mapping

- L’IA peut **classer** les couleurs déjà extraites dans les rôles du site, avec
  un score de confiance. Elle ne génère pas de couleur.
- Le mapping final est déterministe : rôle du template → rôle de site.
- En cas de conflit ou de confiance faible : valeur par défaut du template.
- Contrôle de contraste pour `text` / `background` et `onAction` / `action` ;
  correction par noir/blanc ou demande de validation.
- L’aperçu de l’assistant affiche la palette détectée et permet de corriger
  avant application.

### 4. Portée

- S’applique à la création assistée par IA et, si le même écran le permet, à
  l’édition d’un lien.
- Aucune modification des couleurs du site cible.
- Aucune couleur inventée ; aucune exécution de code du site.

## Alternatives considérées

1. **Correspondance par nom/valeur de couleur** : rejetée. La fonction des
   variables varie selon les templates et les palettes n’ont pas de vocabulaire
   commun.
2. **L’IA génère directement les couleurs** : rejetée. Risque d’invention et de
   contraste insuffisant.
3. **Mapping uniquement manuel** : acceptable à court terme, mais ne répond pas
   à l’objectif de préremplissage.
4. **Headless dans le processus web** : rejeté. Coût mémoire, surface d’attaque
   et couplage trop importants.

## Conséquences

### Positives

- Mapping explicite, prévisible et indépendant du nom des variables.
- Les templates gardent la maîtrise de leur sémantique.
- Fallback sûr : défauts du template en cas d’incertitude.
- Base compatible avec une extraction légère puis une extraction headless.

### Négatives / coûts

- Modification du schéma des paramètres et migration des manifests.
- Ajout éventuel d’un worker headless (image, mémoire, réseau, cache).
- Nécessité de tests multi-templates et de validation visuelle.
- L’extraction de couleurs reste imparfaite sans navigateur.

## Décisions ouvertes

- Rôles exacts à retenir et leur documentation pour les auteurs de templates.
- Extraction headless ou version légère (meta/CSS + IA) en première étape.
- Politique de cache et de sécurité du worker si headless.
- Priorité en cas de plusieurs couleurs pour un même rôle.
- Gestion des templates existants sans `colorRole`.

## Étapes d’implémentation envisagées

1. Ajouter `colorRole` au schéma et aux manifests ; valider les rôles.
2. Ajouter l’extraction légère (métadonnées, CSS inline, variables) et le
   mapping déterministe.
3. Ajouter la classification IA des couleurs extraites, avec confiance.
4. Décider et, si validé, ajouter le worker headless.
5. Prévisualisation et tests de contraste.
