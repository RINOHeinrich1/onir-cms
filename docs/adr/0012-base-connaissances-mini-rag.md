# 0012. Base de connaissances — mini-RAG par sélection de titres

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Décideurs** : équipe projet

## Contexte

Les modèles de raisonnement couvrent le cas « l'équipe interroge le client ».
Le client peut aussi poser des questions (contact de l'entreprise, horaires,
tarifs…). Sans contexte, l'IA répond de mémoire ou invente. Une recherche
sémantique (embeddings, base vectorielle) serait sur-dimensionnée ici.

## Décision

- Table `base_connaissances` : `titre` (unique, insensible à la casse),
  `contenu`, `template_key` (null = globale, sinon portée à un modèle),
  `actif`, audit.
- **Routage par le LLM, sans indexation** : à chaque message visiteur, un
  premier appel (≤ 40 titres, `max_tokens: 150`) demande **uniquement** les
  titres utiles en JSON ; le contenu des titres retenus est injecté dans le
  prompt système sous « Informations internes… » ; le second appel produit la
  réponse.
- **Échec silencieux** : base vide → pas d'appel de sélection (comportement
  historique inchangé) ; erreur/JSON invalide/titre inconnu → réponse sans
  contexte. Les titres acceptés sont filtrés sur la liste connue (aucune
  injection possible via le choix du LLM).
- CRUD marketeur `/connaissances` ; RBAC `connaissances:*` (marketeur CRUD,
  admin tout, lecteur lecture).

## Conséquences

### Positives

- Aucune infrastructure de recherche : zéro embedding, zéro base vectorielle.
- Le marketeur enrichit la connaissance du chat sans code ni CI.

### Négatives / Risques

- 2 appels IA par message quand la base est non vide (+ ~0,5 s mesuré pour la
  sélection) ; coût borné par le plafond de titres et de tokens.
- La pertinence dépend de titres explicites ; un titre ambigu peut ne pas être
  choisi. Pas de re-ranking.

## Alternatives envisagées

- Embeddings + recherche vectorielle : rejeté (complexité, aucune valeur
  ajoutée à cette échelle).
- Injection systématique de toute la base : rejeté (coût, bruit, dérive).
- Petit modèle dédié à la sélection (`AI_MODEL_SELECTION`) : envisagé,
  hors périmètre.

## Liens

- RM-CONNAISS-001 ; US-CONNAISS-001, US-CHAT-004. Complète l'ADR-0011.
