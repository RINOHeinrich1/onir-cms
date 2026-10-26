# 0038. Assistance IA de création des modèles de raisonnement

- **Statut** : Accepté
- **Date** : 2026-10-26
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0029 (fournisseurs IA), ADR-0030 (catalogue
  de modèles) et ADR-0037 (preprod/release).

## Contexte

La création d'un modèle de raisonnement (`/modeles`) demande aujourd'hui de
renseigner manuellement le rôle, l'objectif, le ton, les garde-fous et les
informations à collecter. Le mode Simple génère ensuite le prompt et la fiche
Markdown ; le mode Expert permet de tout personnaliser.

Les utilisateurs disposent souvent d'une description de chatbot, d'un site et
de documents (PDF, DOCX, ODT, Markdown, RTF) contenant l'information métier.
La ressaisie manuelle est longue et la base de connaissances du mini-RAG n'est
pas alimentée au moment de la création du modèle.

## Décision

### 1. Assistance IA dans le mode Simple

Un switch « Assistance par IA » est ajouté dans le mode Simple du formulaire
de modèle. Il ne crée pas un troisième mode :

- désactivé : Simple / Expert inchangés ;
- activé : les champs du mode Simple sont masqués ;
- l'utilisateur fournit une description, éventuellement une URL de site et
  des fichiers ;
- l'IA produit un brouillon structuré, affiché pour revue avant sauvegarde ;
- l'utilisateur peut ajuster dans Simple ou passer en Expert.

Le switch n'est proposé que si l'organisation possède au moins un modèle IA
actif.

### 2. Modèle IA de génération

La génération utilise par défaut le fournisseur/modèle par défaut de
l'organisation. L'utilisateur peut choisir explicitement un autre couple
fournisseur/modèle actif pour cette génération. Ce choix ne modifie pas le
modèle par défaut et n'a aucun effet sur l'exécution des conversations.

### 3. Sources et limites

- description obligatoire ;
- URL optionnelle, crawl paramétrable (1 à 10 pages, profondeur 0 à 2),
  limité au même domaine, avec `robots.txt`, timeout et taille maximale ;
- 5 fichiers maximum, 10 Mo chacun ;
- formats : PDF texte, DOCX, ODT, Markdown, RTF ;
- pas d'OCR : un PDF scanné produit un avertissement ;
- pas d'exécution JavaScript dans le crawler ;
- extraction séquentielle et plafond global de texte.

### 4. Sortie IA

L'IA ne rédige pas directement le prompt système. Elle produit :

- libellé et description ;
- rôle, objectif, ton et garde-fous ;
- informations à collecter ;
- connaissances candidates.

Le prompt et le Markdown sont ensuite générés par les fonctions existantes
`buildDefaultSystemPrompt` et `buildDefaultRenderTemplate`. Cela garantit les
variables autorisées, les garde-fous et la validité du rendu. Le mode Expert
reste disponible pour personnaliser librement.

Toute sortie IA est revalidée côté serveur avant écriture. Le client ne peut
pas appliquer un brouillon sans passer par cette validation.

### 5. Connaissances

Les connaissances générées sont scopées sur le modèle
(`template_keys = [clé du modèle]`).

Deux politiques sont proposées à l'utilisateur :

- **Ajouter** : ajoute les nouvelles connaissances ;
- **Remplacer** : supprime uniquement les connaissances générées par l'IA
  pour ce modèle, puis ajoute les nouvelles.

Les connaissances manuelles, globales ou liées à d'autres modèles ne sont
jamais supprimées. Les conflits de titre (unicité par organisation) sont
signalés et ignorés, jamais écrasés silencieusement.

Le remplacement affecte tous les liens du modèle, y compris ceux figés sur une
ancienne version, car les connaissances sont scopées par clé de modèle et non
par version.

### 6. Provenance et transaction

La table `base_connaissances` reçoit :

- `origin` : `manual` ou `ai` ;
- `source_template_key` : modèle à l'origine d'une connaissance IA ;
- `ai_generation_id` : identifiant de génération pour la traçabilité.

La création de la version du modèle et l'écriture des connaissances se font
dans une seule transaction.

### 7. Sécurité

- les documents et pages sont traités comme des données non fiables ;
- protection contre l'injection de prompt ;
- protection SSRF : schémas limités, IP privées refusées, redirections
  revalidées ;
- protection zip bomb pour DOCX/ODT ;
- aucun document importé n'est conservé après la requête ;
- aucun contenu de document ni clé API dans les logs ;
- rate limit par utilisateur ;
- confirmation explicite de l'envoi des sources au fournisseur IA.

## Conséquences

### Positives

- création d'un modèle et de sa base de connaissances en quelques minutes ;
- sortie structurée et validée, compatible avec le mode Expert ;
- les connaissances manuelles restent protégées ;
- réutilisation des fournisseurs IA et des builders existants.

### Coûts et risques

- nouvelle dépendance d'extraction documentaire ;
- crawl HTTP à sécuriser et à limiter ;
- coût et latence des appels IA ;
- les sites rendus uniquement en JavaScript ne seront pas exploitables sans
  navigateur headless ;
- les PDF scannés nécessiteront une OCR, hors périmètre v1 ;
- le remplacement des connaissances IA impacte les anciennes versions du
  modèle, ce qui doit être expliqué dans l'interface.

## Alternatives écartées

- **Troisième mode IA à côté de Simple/Expert** : duplication d'état et
  passage à Expert plus complexe.
- **Laisser l'IA écrire le prompt brut** : variables inventées et garde-fous
  non garantis.
- **Remplacer toutes les connaissances du modèle** : destruction de
  connaissances manuelles ; refusé.
- **Crawler sans limite ni protection SSRF** : risque d'accès à des services
  internes.
- **OCR et navigateur headless en v1** : coût et complexité trop élevés pour
  le premier lot.
