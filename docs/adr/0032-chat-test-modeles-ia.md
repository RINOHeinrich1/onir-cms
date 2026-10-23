# 0032. Chat de test des modèles IA

- **Statut** : Accepté
- **Date** : 2026-10-23
- **Décideurs** : équipe projet
- **Complète** : `0029-fournisseurs-ia-openai-compatible.md` et
  `0030-catalogue-modeles-fournisseur.md`

## Contexte

L'ADR-0029 a introduit les fournisseurs IA, les clés chiffrées et la permission
`ai:manage` incluant l'action de tester. L'ADR-0030 a introduit le catalogue de
modèles par fournisseur, avec modèles `catalog` et `manual`.

Deux vérifications différentes sont nécessaires :

1. **Tester un fournisseur** : vérifier que l'URL de base, la clé et la route
   `GET /models` répondent. Ce test persiste son résultat sur le fournisseur.
2. **Tester un modèle** : vérifier qu'un modèle précis produit réellement une
   complétion via `POST /chat/completions`, notamment un modèle ajouté
   manuellement ou un modèle dont le rendu ou la latence doivent être vérifiés.

Le second test ne doit pas dépendre d'un lien, d'un visiteur, d'une
conversation ou d'une fiche. Il ne doit pas modifier la configuration ni créer
de données métier.

## Décision

### 1. Deux tests distincts

- **Test fournisseur** : `GET {base_url}/models`, persisté comme dernier test
  du fournisseur (ADR-0029).
- **Test modèle** : `POST /api/ai/providers/[id]/models/[modelRowId]/test`,
  qui exécute un vrai appel `chat/completions` avec le fournisseur et le modèle
  sélectionnés.

Le test modèle est une vérification technique réelle, pas un test de la
configuration d'un lien. Il ne prouve pas que le modèle est correctement
affecté à un lien public ; ce contrôle se fait dans le chat réel du lien.

### 2. Périmètre et permissions

- Route et page réservées à `ai:manage`.
- Le fournisseur et le modèle sont résolus dans l'organisation de l'acteur.
  Aucun accès inter-organisation n'est possible.
- Le test utilise la clé chiffrée du fournisseur côté serveur. Aucune clé ni
  aucun header d'autorisation n'est envoyé au navigateur.
- Le test peut porter sur un modèle existant du fournisseur, sans modifier son
  état actif ou inactif.

### 3. Contrat de la requête

Le corps accepte :

- `messages` : 1 à 20 messages `user` ou `assistant`, contenu non vide limité à
  4 000 caractères par message ;
- ou `message` : message court, limité à 4 000 caractères, pour un test rapide ;
- `maxTokens` : entier borné entre 8 et 800, défaut `80` pour un test rapide.

Sans message fourni, le test envoie « Réponds uniquement par OK. ». Le prompt
système est un prompt technique court (« assistant de test du dashboard
Onirtech, réponds de façon concise »). Il n'utilise ni le prompt métier d'un
lien, ni la base de connaissances, ni les médias, ni la logique de fiche.

La réponse est :

```json
{
  "ok": true,
  "response": "…",
  "latencyMs": 1234,
  "error": ""
}
```

En cas d'échec du fournisseur, `ok` vaut `false`, `response` est vide et
`error` contient un message lisible. L'erreur est retournée à l'administrateur
sans exposer la clé.

### 4. Absence de persistance

Le test modèle est **éphémère** :

- aucun message n'est enregistré dans `chat_messages` ;
- aucune conversation, aucun lien, aucun prospect et aucune fiche ne sont
  créés ;
- le résultat n'est pas persisté sur le fournisseur ni sur le modèle ;
- aucun défaut d'organisation ou de fournisseur n'est modifié.

Chaque envoi consomme néanmoins des tokens chez le fournisseur. Le test n'est
pas un outil de production et ne doit pas être utilisé comme un chat public.

### 5. Page de test

La page `/parametres/ia/test` :

- est accessible uniquement avec `ai:manage` ;
- reçoit `provider` et `model` en query string pour ouvrir directement un
  modèle depuis le panneau Modèles ;
- charge uniquement les modèles actifs du fournisseur dans le sélecteur ;
- affiche la latence de la dernière réponse et les erreurs ;
- rend les réponses en Markdown (GFM) et permet de copier le Markdown brut ;
- conserve la conversation uniquement en mémoire du navigateur ;
- utilise une hauteur pleine sous le header du dashboard, un journal
  scrollable et un composeur ancré ;
- propose un mode plein écran, quittable avec `Échap` ;
- envoie avec `Entrée` et insère une nouvelle ligne avec `Maj+Entrée`.

La page ne remplace pas le test de connexion du fournisseur : elle est le point
d'entrée du test réel par modèle.

## Conséquences

- Un administrateur peut valider un modèle sans créer de lien ni de
  conversation.
- Le test fonctionne aussi pour un modèle `manual` qui n'apparaît pas dans
  `GET /models`.
- Le test ne laisse aucune trace métier, ce qui limite les fuites de données
  et les conversations fantômes.
- L'appel consomme des tokens et peut être lent ; les tests doivent rester
  courts.
- Le panneau Modèles peut proposer un lien direct « Tester sur la page » pour
  chaque modèle.

## Hors périmètre

- streaming des réponses ;
- persistance ou reprise d'une conversation de test ;
- historique partagé entre administrateurs ;
- benchmark automatisé, notation ou comparaison de modèles ;
- quotas ou plafonds de coût par test ;
- tools, vision, reasoning ou paramètres avancés par modèle ;
- test d'un lien public depuis cette page.

## Références

- `docs/adr/0029-fournisseurs-ia-openai-compatible.md`
- `docs/adr/0030-catalogue-modeles-fournisseur.md`
- `src/app/api/ai/providers/[id]/models/[modelId]/test/route.ts`
- `src/application/use-cases/ai/manage-ai-models.ts`
- `src/application/use-cases/ai/ai-provider-connectivity.ts`
- `src/app/(dashboard)/parametres/ia/test/page.tsx`
- `src/components/ai/AiTestConsole.tsx`
- `src/components/ai/AiModelsPanel.tsx`
- `src/styles/chat.css`
