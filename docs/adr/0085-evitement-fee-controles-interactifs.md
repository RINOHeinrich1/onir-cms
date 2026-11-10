# 0085. Évitement automatique de la fée ONIR sur les contrôles interactifs

- **Statut** : Proposé
- **Date** : 2026-11-10
- **Décideurs** : équipe projet
- **Référence** : ADR-0037.
- **Complète** : aucune.
- **Remplace** : aucune.

## Contexte

Le compagnon flottant de l’assistant, la « fée ONIR », est un bouton fixe
`AssistantWidget` présent dans le dashboard et dans les écrans plein écran.
Sa position est déplaçable et mémorisée dans `localStorage`. Il est rendu au
moyen d’une animation Lottie.

Le bouton peut recouvrir un contrôle interactif : bouton, lien, onglet, champ
ou contrôle audio/vidéo. Comme le launcher capte les événements pointeur,
l’utilisateur ne peut alors ni voir correctement ni activer le contrôle caché.

Le besoin UX est : lorsque la fée recouvre un contrôle interactif visible, elle
se déplace automatiquement vers une position libre. Le comportement doit rester
prévisible et ne pas provoquer de déplacement continu ou d’oscillation.

## Décision

### 1. Évitement événementiel, pas simulation physique

La fée ne subit pas de force de répulsion calculée à chaque frame. Un contrôle
n’est vérifié qu’à la demande :

- après le chargement de la position ;
- après un `scroll` ou un `resize` ;
- après un changement de focus ou un clic ;
- après la fermeture d’un dialogue.

La vérification est différée de 100 ms puis exécutée dans une frame
`requestAnimationFrame`. Cela évite de parcourir le DOM à 60 fps pendant un
défilement continu.

### 2. Détection par points de collision

La position est considérée occupée si l’un des 9 points de la boîte de la fée
(trois colonnes × trois lignes) touche un élément interactif visible. La
détection utilise `document.elementsFromPoint`, ce qui tient compte de
l’empilement réel et des overlays.

Sélecteurs pris en compte :

```text
a[href], button, input, select, textarea, summary, label,
audio[controls], video[controls],
[role=button], [role=link], [role=tab], [role=menuitem],
[role=switch], [role=checkbox], [role=radio],
[tabindex]:not([tabindex='-1']), [data-fairy-avoid]
```

Le launcher et la bulle de conseil sont exclus de la détection. Un élément
désactivé, masqué, `inert` ou `aria-hidden` n’est pas considéré comme
interactif. Le contrôle qui a le focus clavier est aussi évité même s’il n’est
pas sous le curseur.

### 3. Positions candidates et repli

Les positions candidates sont testées dans cet ordre :

1. position courante ;
2. haut, gauche, droite, bas ;
3. les quatre diagonales ;
4. les coins et les bords de la fenêtre comme ancrages de sécurité.

La première position sans collision est retenue. Si aucune position n’est
libre, la fée reste sur place : elle ne tente pas de mouvement supplémentaire
et attend un nouvel événement ou une action de l’utilisateur.

Cela garantit l’absence de boucle : le choix est déterministe, borné, et ne
dépend pas d’une position qui vient d’être créée par le déplacement.

### 4. Stabilité et contrôle utilisateur

- Pas de retour automatique à la position mémorisée tant que la position
  courante reste libre.
- Pas de déplacement pendant le drag, pendant un dialogue ou pendant l’édition
  du chatbot.
- La position mémorisée n’est pas écrasée par un déplacement automatique.
- Le drag manuel reste prioritaire et persiste la position choisie.
- `[data-fairy-avoid]` permet de protéger explicitement un contrôle
  personnalisé, notamment un lecteur audio ou un bouton dont le libellé ne
  contient pas de sémantique interactive.
- `prefers-reduced-motion` conserve l’évitement mais supprime les transitions.

### 5. Performance

- Aucun nouveau composant ni aucune nouvelle dépendance.
- Une seule vérification différée par rafale d’événements.
- Neuf points par position candidate, avec arrêt au premier point occupé.
- Les déplacements utilisent `left`/`top` avec transition CSS ; l’animation
  Lottie existante n’est pas modifiée.
- Le coût est négligeable devant le rendu Lottie et reste limité aux moments où
  la page bouge ou change de focus.

## Conséquences

### Positives

- Les contrôles cachés redeviennent accessibles.
- Le comportement est stable, borné et sans oscillation.
- Aucun impact sur le bundle et faible risque de régression.
- Le mécanisme est réutilisable pour d’autres éléments flottants.

### Négatives

- La détection est heuristique : un contrôle très fin peut être manqué entre
  deux points de test.
- Les contrôles fortement personnalisés doivent ajouter `data-fairy-avoid`.
- La fée peut se déplacer après un scroll si un contrôle arrive sous elle.
- La position automatique n’est pas persistée, ce qui est volontaire pour
  préserver le choix de l’utilisateur.

## Mise en œuvre

- `src/components/assistant/assistant-avoidance.ts` : géométrie pure et choix
  des candidats.
- `src/components/assistant/AssistantWidget.tsx` : détection DOM, événements
  et intégration au launcher.
- `src/styles/assistant.css` : transition de position.
- `tests/assistant-avoidance.test.ts` : tests de clamping, candidats et choix.
- Validation initiale sur `rapid-preprod`, puis production après validation
  fonctionnelle.
