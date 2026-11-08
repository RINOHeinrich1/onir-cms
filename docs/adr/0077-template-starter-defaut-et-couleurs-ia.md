# 0077. Template Starter par défaut et génération IA des couleurs

- **Statut** : Proposé
- **Date** : 2026-11-08
- **Décideurs** : équipe projet
- **Référence** : ADR-0019, ADR-0023, ADR-0025, ADR-0040, ADR-0049.
- **Complète** : ADR-0023, ADR-0049.
- **Remplace** : aucune.

## Contexte

Deux comportements existent aujourd’hui.

### Création manuelle

Le wizard de création part de `defaultChatbotDraftState()` avec :

```ts
channels: {
  page: { visualTemplate: "", params: {} },
  widget: { visualTemplate: "", params: {} }
}
```

Le sélecteur propose « — Défaut — ». Si aucun template n’est choisi, le canal
reste sans `visualTemplateId` / `visualTemplateVersion`, et le runtime retombe
sur l’interface par défaut.

### Création par IA

Le builder IA part également de `defaultChatbotDraftState()` via
`builderGenerationToDraftState()`. Il ne sélectionne aucun template visuel et
ne génère aucun paramètre de thème.

Le mécanisme historique de génération des paramètres de template existe encore :

- `src/application/use-cases/chatbots/generate-chatbot-template-params.ts`
- `src/application/use-cases/chatbots/chatbot-template-params-prompt.ts`
- `src/app/api/chatbots/ai/template-params/route.ts`

Il reçoit :

- le template et sa version ;
- le schéma `manifest.params` ;
- une `SitePalette` déjà calculée ;
- `chatbot.description` et des connaissances.

Il remplit les paramètres non-URL du template. Son prompt demande d’utiliser la
palette du site si elle est fiable, sinon de proposer des couleurs à partir de
la description et des connaissances.

Ce mécanisme n’est plus appelé par le builder IA actuel.

Par ailleurs, `generateChatbotAiDraft()` lit déjà le site **une seule fois**
pendant la génération du brouillon et retourne `sitePalette`. Un second appel
de génération de couleurs ne doit pas relancer ce crawl.

## Décision

### 1. Template par défaut : dernière version installée de Starter

Pour toute **nouvelle création de chatbot**, manuelle ou générée par IA :

1. rechercher le template visuel de clé `starter` ;
2. vérifier qu’il est **assigné à l’organisation** ;
3. vérifier qu’il possède au moins une version ;
4. sélectionner la **dernière version installée** ;
5. préremplir les paramètres du canal avec les valeurs par défaut de cette
   version.

Le template s’applique par défaut au canal **page**. Le canal widget utilise le
même Starter s’il est activé et si cette version supporte le widget ; sinon il
reste sur le comportement actuel.

### 2. Définition de « dernière version »

La dernière version n’est pas choisie par ordre alphabétique.

Ordre de sélection :

1. comparaison **sémantique** des versions (`1.10.0` > `1.9.0`) ;
2. si une version n’est pas semver, fallback sur `created_at` ;
3. si plusieurs versions restent à égalité, la plus récemment créée gagne.

La sélection doit être centralisée dans un helper d’application, pas dupliquée
dans les composants UI.

### 3. Si Starter n’est pas installé

« Installé » signifie :

- template présent dans le catalogue ;
- assigné à l’organisation ;
- au moins une version disponible.

Si l’une de ces conditions manque :

- **création manuelle** : rester sur « — Défaut — » ;
- **création IA** : ne pas sélectionner de template et utiliser le rendu par
  défaut ;
- ne jamais bloquer la création ;
- ajouter un avertissement non bloquant dans la revue IA.

Aucun template ne doit être forcé s’il n’est pas réellement installé.

### 4. Création manuelle

Le formulaire manuel préselectionne la dernière version installée de Starter.

- L’utilisateur peut toujours choisir un autre template.
- L’option « — Défaut — » reste disponible.
- Si l’utilisateur choisit explicitement « — Défaut — », ce choix est respecté.
- Les paramètres sont initialisés avec les defaults du Starter sélectionné.
- Aucune génération IA de couleurs n’est déclenchée automatiquement en manuel.

### 5. Création par IA : deux appels IA, un seul crawl

Flux retenu :

```text
Conversation du builder
  ↓
Appel IA 1 : brouillon du chatbot
  ↓
Résolution de starter@latest installé
  ↓
Appel IA 2 : paramètres couleur du template
  ↓
Revue : brouillon + template + couleurs
  ↓
Création du lien
```

#### Appel IA 1 — configuration du chatbot

`generateChatbotAiDraft()` reste responsable de :

- lire le site si une URL est fournie ;
- calculer `sitePalette` ;
- générer le brouillon ;
- retourner `sitePalette` avec le brouillon.

Le builder résout ensuite Starter et retourne les métadonnées du template dans
`ChatbotBuilderGeneration.visualTemplate`.

#### Appel IA 2 — thème et couleurs

`generateChatbotTemplateParams()` est réutilisé, mais avec une nouvelle entrée :

- conversation du builder ;
- `sitePalette` déjà calculée à l’appel 1 ;
- schéma des paramètres du Starter ;
- uniquement les paramètres de type `color`.

Il ne reçoit plus :

- `chatbot.description` comme source de couleurs ;
- les connaissances comme source de couleurs ;
- l’URL du site ;
- aucun lecteur de site.

**Aucun second crawl n’est autorisé.**

Si le premier appel n’a pas lu de site, `sitePalette` est vide et la
conversation devient la seule source de couleurs.

### 6. Priorité des couleurs

Ordre strict :

1. **palette du site déjà obtenue** si sa confiance est `high` ou `medium` ;
2. **conversation du builder** si la palette est absente, `low` ou `none` ;
3. **valeurs par défaut du manifest** si l’IA ne fournit rien de fiable.

La description n’est plus une source de couleurs.
Les connaissances ne sont plus une source de couleurs.

### 7. Paramètres concernés

Pour le flux IA, seuls les paramètres `manifest.params[].type === "color"` sont
générés par l’IA.

Les autres paramètres statiques du template conservent leurs valeurs par
défaut. Cela évite que l’IA invente des rayons, tailles, textes ou options sans
demande explicite.

Le prompt doit :

- recevoir uniquement ces paramètres couleur ;
- respecter le format `#RRGGBB` ;
- respecter les defaults ;
- ignorer toute clé inconnue ;
- ne jamais inventer d’URL ou de source de données.

### 8. Contrat du builder IA

`ChatbotBuilderGeneration` est étendu avec :

```ts
visualTemplate: {
  templateId: string;
  version: string;
  params: TemplateParamValues;
  warnings: string[];
} | null;
```

Le champ `sitePalette` existant est conservé et transmis au second appel.

`builderGenerationToDraftState()` doit renseigner :

```text
channels.page.visualTemplate = "starter@<version>"
channels.page.params = valeurs générées ou defaults
```

La création finale envoie donc :

- `visualTemplateId` ;
- `visualTemplateVersion` ;
- `visualTemplateParams`.

### 9. Revue avant création

L’écran de validation affiche :

- le nom et la version du template ;
- les couleurs retenues ;
- un avertissement si Starter est absent ;
- un avertissement si les couleurs par défaut ont été conservées.

### 10. Loader de génération IA

Le loader concerné est `BuilderGenerating`, affiché dans
`ChatbotBuilderDialog` après le clic sur « Générer le chatbot ».

Il doit afficher les phases réelles, sans simulation :

```text
● Configuration du chatbot
  L’IA analyse le brief et prépare la fiche de collecte.

○ Thème et couleurs
  En attente.
```

Pendant l’appel IA 1 :

- phase 1 active ;
- phase 2 en attente.

Pendant l’appel IA 2 :

- phase 1 terminée ;
- phase 2 active.

À la fin :

- phase 1 terminée ;
- phase 2 terminée ;
- passage à la revue.

Les phases doivent correspondre aux appels réseau réels. Pour cela,
l’orchestration est faite côté client :

1. appel du endpoint de génération du brouillon ;
2. appel du endpoint de génération des paramètres couleur ;
3. fusion locale ;
4. affichage de la revue.

Cela évite de simuler une progression ou d’ajouter un flux SSE complexe.

### 11. Erreurs et annulation

- Échec de l’appel 1 : erreur bloquante, retour au composer, brief conservé.
- Échec de l’appel 2 : avertissement non bloquant, defaults conservés, revue
  accessible.
- Starter absent : pas d’appel 2, defaults conservés.
- Aucun paramètre couleur : pas d’appel 2.
- Annulation pendant l’appel 1 : `AbortController`, retour au composer.
- Annulation pendant l’appel 2 : brouillon conservé, thème par défaut ou
  possibilité de relancer.
- Le bouton de fermeture de la modale reste désactivé pendant la génération.
- `aria-live="polite"` sur les changements de phase.
- Animations désactivées avec `prefers-reduced-motion`.

## Conséquences

### Positives

- comportement cohérent entre création manuelle et création IA ;
- Starter réellement installé utilisé par défaut ;
- aucun template forcé si Starter est absent ;
- aucune régression pour les organisations sans Starter ;
- aucune duplication du crawl du site ;
- couleurs issues de la palette réelle ou de la conversation ;
- loader compréhensible et fidèle aux appels réels ;
- échec du thème non bloquant.

### Négatives

- un second appel IA est ajouté ;
- la génération est un peu plus longue ;
- deux endpoints à orchestrer côté client ;
- nécessité de définir et tester la comparaison de versions ;
- la palette du site reste prioritaire sur la conversation lorsqu’elle est
  fiable.

## Alternatives écartées

- **Garder le template par défaut actuel** : ne répond pas au besoin.
- **Forcer Starter même non installé** : casse les organisations sans Starter.
- **Recrawler le site pour les couleurs** : coût et latence inutiles.
- **Utiliser la description comme fallback** : la description n’est plus la
  source de contexte fiable.
- **Utiliser les connaissances comme fallback couleur** : trop indirect.
- **Générer tous les paramètres du template par IA** : risque d’inventer des
  valeurs non demandées.
- **Fusionner les deux appels IA immédiatement** : possible plus tard, mais
  moins isolé et plus difficile à tester dans un premier temps.
- **Simuler les phases du loader** : trompeur pour l’utilisateur.

## Points ouverts

- faut-il exposer un réglage d’organisation pour désactiver Starter par défaut ?
- faut-il permettre de choisir une version Starter différente en manuel ?
- faut-il proposer un aperçu visuel des couleurs dans la revue ?
- faut-il fusionner les deux appels IA si la latence devient gênante ?
- faut-il conserver la palette du site en priorité ou toujours privilégier la
  conversation ?
- politique de fallback si la dernière version Starter casse le widget.

## Tests d’acceptation

- La création manuelle présélectionne la dernière version installée de Starter.
- « — Défaut — » reste sélectionnable et respecté.
- La création IA utilise la dernière version installée de Starter.
- Si Starter est absent/non assigné, manuel et IA restent sur défaut.
- Le site n’est lu qu’une seule fois.
- Le second appel IA ne fait aucun crawl.
- Les couleurs viennent de la palette si fiable, sinon de la conversation.
- La description et les connaissances ne sont pas utilisées pour les couleurs.
- Seuls les paramètres `color` sont générés.
- Les defaults sont conservés en cas d’échec.
- Le loader affiche la phase « Configuration du chatbot » puis « Thème et
  couleurs ».
- Les phases correspondent aux appels réels.
- L’annulation fonctionne pendant les deux phases.
- Le lien final contient `visualTemplateId`, `visualTemplateVersion` et
  `visualTemplateParams`.
