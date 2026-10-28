# 0047. Extraction structurée multi-fournisseurs

- **Statut** : Accepté
- **Date** : 2026-10-28
- **Décideurs** : équipe projet
- **Référence** : ADR-0029 (fournisseurs IA), ADR-0045 (champs collectés),
  ADR-0046 (incidents).

## Contexte

Les fournisseurs dits « OpenAI-compatible » partagent le format
`chat/completions`, mais pas les options de raisonnement ni de sortie
structurée.

Exemples observés :

- Infomaniak/vLLM : `chat_template_kwargs.enable_thinking` ;
- OpenAI reasoning : `reasoning_effort` ;
- OpenRouter : objet `reasoning` ;
- DeepSeek/DeepInfra/custom : paramètres variables ou absents.

Le modèle `google/gemma-4-31B-it` d'Infomaniak partait en boucle de
raisonnement sur le prompt d'extraction, consommait tout le budget de tokens
et renvoyait `content: null`. Le message générique « analyse IA momentanément
indisponible » masquait ce comportement.

Il n'existe donc pas de switch universel à exposer à l'admin.

## Décision

### 1. Registre de capacités déclaratif

Le domaine expose `aiCapabilitiesFor(preset, modelId)` :

```ts
type AiCapabilities = {
  reasoningControl:
    | "none"
    | "infomaniak_chat_template"
    | "openai_reasoning_effort"
    | "openrouter_reasoning";
  supportsReasoningToggle: boolean;
  structuredOutput: "json_object" | "prompt";
};
```

Les paramètres fournisseur restent dans l'adaptateur HTTP. Le cœur métier ne
contient aucun `if (model === "gemma")`.

### 2. Intention normalisée

`AiCompletionInput` porte :

```ts
reasoning?: "auto" | "enabled" | "disabled";
structured?: boolean;
```

L'adaptateur traduit :

- Infomaniak : `chat_template_kwargs.enable_thinking` ;
- OpenAI reasoning : `reasoning_effort` ;
- OpenRouter : `reasoning.effort` ;
- fournisseur sans contrôle : aucun champ envoyé.

Le mode `auto` conserve le comportement du fournisseur, sauf pour les modèles
Infomaniak Gemma/Qwen où le raisonnement est désactivé par défaut (protection
contre les boucles connues).

### 3. Réglage par modèle

`ai_provider_models.reasoning_mode` stocke `auto`, `enabled` ou `disabled`.

- Le sélecteur n'est affiché que si `supportsReasoningToggle` est vrai.
- Un fournisseur sans capacité affiche « Non supporté » et aucun champ
  propriétaire n'est envoyé.

### 4. Modèle d'extraction dédié et secours

`organization_ai_settings` porte :

```text
extraction_provider_id, extraction_model,
extraction_fallback_provider_id, extraction_fallback_model
```

La chaîne d'extraction est, dans l'ordre :

1. modèle d'extraction ;
2. modèle de secours ;
3. modèle du lien.

Chaque étape est dédupliquée par couple fournisseur/modèle.

### 5. Extraction robuste

`draftTemplateDataWithClients` :

- force `reasoning: "disabled"` et `structured: true` ;
- utilise un budget de 1 200 tokens, puis 2 000 en correction ;
- tente deux fois par client (réponse directe, puis consigne corrective) ;
- valide le JSON et rejette les tableaux ou contenus vides ;
- passe au client suivant en cas d'échec ;
- remonte une erreur typée si toute la chaîne échoue.

Les champs extraits sont ensuite validés par le domaine avant écriture.

### 6. UI/UX

Dans `/parametres/ia` :

- carte **Moteur d'extraction** avec modèle principal, secours et bouton de
  test JSON ;
- colonne **Raisonnement** dans les modèles (`Auto`, `Activé`, `Désactivé`) ou
  mention `Non supporté` ;
- test d'extraction court, résultat lisible : latence, JSON valide ou erreur ;
- les paramètres bruts (`enable_thinking`, `reasoning_effort`) ne sont jamais
  exposés à l'admin.

### 7. Diagnostic et erreurs

- Une réponse vide est transformée en message explicite
  « contenu final absent (raisonnement bloqué ou limite de tokens) ».
- Les erreurs de fournisseur restent distinctes des erreurs de parsing.
- Les échecs d'extraction continuent d'alimenter les incidents ADR-0046.
- Aucune relance automatique infinie : le panneau garde un retry manuel et
  un délai de sécurité.

## Conséquences

- Le bug Gemma est corrigé sans casser les autres fournisseurs.
- L'admin peut choisir un modèle d'extraction indépendant du chat.
- Un fournisseur sans contrôle du raisonnement reste utilisable : le fallback
  et la validation JSON prennent le relais.
- L'ajout d'un nouveau fournisseur se fait par capacité + adaptateur, sans
  modifier les use cases.
- Limite : si aucun modèle de la chaîne ne produit du JSON valide, l'extraction
  échoue et un humain est notifié ; le système ne devine pas les champs.
