# 0092. Suggestion de réponse IA en prise en main humaine

- **Statut** : Accepté
- **Date** : 2026-11-17
- **Décideurs** : équipe projet
- **Référence** : ADR-0029, ADR-0043, ADR-0048, ADR-0058.
- **Complète** : ADR-0043.
- **Remplace** : aucune.

## Contexte

Lorsqu'un opérateur prend la main sur une conversation, il doit rédiger sa
réponse dans le composeur. Le client demande une aide à la rédaction : un bouton
qui génère une proposition avec l'IA, sans envoyer le message au visiteur.

La proposition doit rester un **brouillon** : l'opérateur la relit, la modifie
éventuellement, puis décide lui-même de l'envoyer. Le flux existant d'envoi
opérateur (`appendOperatorMessage`) reste donc le seul point d'écriture.

## Décision

### UI

- Ajouter un bouton **« Suggestion IA »** dans les actions du composeur,
  uniquement lorsque la conversation est en mode `human`.
- Au clic, le bouton passe en état de chargement et est désactivé avec les
  autres actions pendant l'appel.
- La suggestion **remplace directement** le contenu actuel du champ de saisie,
  même si l'opérateur avait déjà commencé à rédiger. Aucune confirmation n'est
  demandée.
- Aucun envoi automatique : l'opérateur doit cliquer sur « Envoyer ».
- Les actions du composeur s'empilent en pleine largeur sur mobile ; le libellé
  du bouton ne se coupe pas.

### API

- Nouvelle route `POST /api/conversations/[id]/suggest-reply`.
- RBAC : `conversations:intervene`, avec le même périmètre de liens que les
  autres actions opérateur.
- La route refuse une conversation finalisée, une conversation en mode `ai`,
  une conversation vide ou un budget de tokens épuisé.
- Aucun message n'est créé, modifié ou publié sur le flux SSE.

### Génération

- Réutiliser l'affectation IA du lien, avec l'usage `response` : même
  fournisseur, même modèle et même chaîne de secours que la génération de
  réponse existante.
- Construire le prompt à partir de la configuration chatbot courante, de la
  fiche active lorsqu'elle existe, et d'un historique borné de la conversation.
- Ajouter une consigne dédiée : produire uniquement le texte destiné au
  visiteur, sans préambule, sans signature et sans mention d'IA.
- Enregistrer la consommation avec l'opération `reply_suggestion` pour que le
  quota du chatbot reste exact.
- La suggestion n'est pas persistée : ni en base, ni dans l'audit métier. Seul
  l'usage tokens est journalisé.

## Alternatives écartées

### Envoyer directement la réponse générée

Le client veut explicitement conserver une validation humaine. L'envoi
automatique exposerait le visiteur à une réponse non relue.

### Ajouter la suggestion à la suite du brouillon existant

Le remplacement direct est la règle retenue par le client. Cela évite les
doublons et garde un seul texte de travail.

### Créer un endpoint public ou un nouveau moteur IA

Inutile : le bouton est réservé aux opérateurs autorisés et la cible IA existe
déjà par lien. Un second moteur créerait une divergence de modèle et de quota.

### Persister chaque suggestion

Aucun besoin métier identifié. Persister les suggestions ajouterait de la
donnée potentiellement sensible sans valeur de suivi.

## Conséquences

- l'opérateur garde la maîtrise complète de l'envoi ;
- la suggestion consomme des tokens du chatbot, comme une réponse ;
- une suggestion peut être perdue si l'opérateur quitte la page sans envoyer ;
- le bouton n'apparaît pas en mode IA : dans ce mode, l'IA répond déjà
  directement au visiteur ;
- aucune migration de base de données.

## Vérifications attendues

- bouton visible et utilisable uniquement en prise en main humaine ;
- clic avec champ vide : la suggestion remplit le champ ;
- clic avec champ déjà rempli : la suggestion remplace le contenu ;
- aucun message envoyé tant que l'opérateur ne clique pas sur « Envoyer » ;
- erreur IA ou budget épuisé : message d'erreur, brouillon existant conservé ;
- bouton et actions lisibles sur desktop et mobile ;
- tests unitaires de la génération et de ses refus, typecheck, lint et build.
