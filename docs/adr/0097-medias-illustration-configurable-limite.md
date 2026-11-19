# 0097. Illustration des réponses par la photothèque — réglage UI, conservation et limite non bloquante

- **Statut** : Accepté
- **Date** : 2026-11-18
- **Décideurs** : équipe projet
- **Référence** : ADR-0049, ADR-0068, ADR-0073, ADR-0095.
- **Complète** : ADR-0073.

## Contexte

La source Médias d'un chatbot porte deux réglages runtime :

```ts
{
  access: "on_demand" | "illustration";
  maxResults: 1..5;
}
```

Ils étaient utilisés par l'API mais absents du wizard de création/modification.
Pire, `chatbot-config-draft.ts` reconstruisait `informationSources.medias` à
partir des valeurs par défaut à chaque sauvegarde. Un lien réglé en
`illustration`, 5 photos, repassait donc en `on_demand`, 3 photos après une
simple édition du chatbot.

Deux conséquences observées :

- aucune photo n'était attachée aux réponses (le mode `on_demand` ne déclenche
  pas `mediaPending`) ;
- une limite de 3 photos pouvait donner l'impression qu'aucune photo n'était
  envoyée au lieu des 3 premières.

## Décision

### 1. Réglage dans le wizard

L'étape **Alimentation → Photos** expose :

- une case **« Illustrer automatiquement les réponses avec la photothèque »**
  → `access: "illustration"` ; décochée → `on_demand` ;
- un champ **Nombre maximum de photos par réponse** borné à **1..5** →
  `maxResults`.

Le réglage n'est actif que si la source Photos est activée. La galerie reste
disponible dans tous les cas via `ctx.resources.media`.

### 2. Conservation dans le brouillon

`ChatbotConfigDraft` porte `mediaAccess` et `mediaMaxResults`. Ils sont :

- initialisés à `on_demand` / `3` pour un nouveau chatbot ;
- relus depuis `informationSources.medias` en édition ;
- réinjectés tels quels dans `informationSources.medias` au payload ;
- inclus dans la signature du brouillon pour l'autosave.

Une sauvegarde du wizard ne peut plus écraser ces valeurs.

### 3. Limite non bloquante

Le runtime applique `maxResults` comme un **plafond de sortie**, jamais comme
un filtre tout-ou-rien :

1. les médias choisis par l'IA sont filtrés puis tronqués aux `N` premiers ;
2. si l'IA ne choisit rien mais que la question demande explicitement des
   photos/images/produits/catalogue, les `N` premiers médias servent de repli ;
3. si la photothèque contient 5 photos et `maxResults = 3`, les 3 premières
   sont envoyées ; on ne renvoie jamais une liste vide à cause du plafond.

Le plafond global reste 5. Le scope `chat_link_ids` et les sources activées
restent les gardes d'accès (ADR-0073).

## Conséquences

- Le réglage est visible et modifiable sans API.
- Les liens existants conservent leur configuration ; les nouveaux démarrent en
  galerie seule (`on_demand`, 3).
- Un template reçoit les photos dans `message.medias` uniquement en
  `illustration`, ou via la galerie `ctx.resources.media`.
- Tests ajoutés : conservation du brouillon, troncature aux 3 premières photos,
  repli visuel et non-régression de la sélection IA.

## Fichiers

- `src/components/links/ChatbotDataSelection.tsx`
- `src/components/links/ChatbotDataStep.tsx`
- `src/components/links/ChatbotCreateForm.tsx`
- `src/components/links/ChatbotEditForm.tsx`
- `src/components/links/chatbot-config-draft.ts`
- `src/components/links/chatbot-draft-state.ts`
- `src/application/use-cases/medias/select-chat-media.ts`
