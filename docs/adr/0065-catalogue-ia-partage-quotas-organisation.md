# 0065. Catalogue IA partagé, quotas par organisation et provisioning des invitations

- **Statut** : Accepté
- **Date** : 2026-11-04
- **Décideurs** : équipe projet
- **Référence** : ADR-0025, ADR-0029, ADR-0030, ADR-0042, ADR-0048, ADR-0058, ADR-0060.
- **Amende partiellement** : ADR-0025 §7 (FK composites pour les ressources IA partagées), ADR-0029 §2/§7 (portée des fournisseurs), ADR-0058 (clusters partagés).

## Contexte

Aujourd'hui :

- les fournisseurs, modèles et clusters IA sont strictement possédés par une
  organisation ;
- les quotas de tokens sont portés uniquement par `chat_links` (ADR-0048) ;
- `chat_link_ai_usage` ne contient ni fournisseur, ni modèle, ni cluster ;
- plusieurs appels IA ne sont pas tracés : génération de brouillon de chatbot,
  paramètres de template, brouillon de fiche, tests de modèles ;
- une invitation sans organisation crée l'organisation à l'acceptation, sans
  pouvoir transporter de limites ni de ressources autorisées ;
- le super-admin peut basculer sur une organisation, mais il n'existe pas de
  catalogue plateforme partagé ;
- aucune limite ne borne le nombre de chatbots par organisation.

Le super-admin doit pouvoir :

- partager des fournisseurs, modèles et clusters à des organisations ;
- définir un budget global de tokens par organisation ;
- définir des budgets par fournisseur/modèle et par cluster ;
- limiter le nombre de chatbots ;
- paramétrer une invitation sans organisation avec les ressources, les budgets
  et le nombre de chatbots ;
- réutiliser plus tard ces paramètres sous forme d'offres.

## Décision

### 1. Catalogue IA plateforme et partage par grants

Les ressources IA peuvent avoir deux portées :

```text
scope = organization   → ressource privée d'une organisation
scope = platform       → ressource plateforme partagée
```

Les ressources plateforme ont `owner_organization_id = NULL`. Les ressources
privées conservent leur organisation propriétaire.

Le premier lot de mise en œuvre partage des ressources **existantes** via les
grants : le fournisseur, le modèle ou le cluster reste détenu par son
organisation d'origine. La création d'un catalogue plateforme propriétaire
(`owner_organization_id = NULL`) pourra être ajoutée ensuite sans modifier le
modèle d'autorisation : les grants restent la source de vérité de l'accès.

Trois tables de grants portent l'autorisation d'usage :

```text
ai_provider_grants(organization_id, provider_id)
ai_model_grants(organization_id, provider_id, model_id)
ai_cluster_grants(organization_id, cluster_id)
```

Règles :

- seul le super-admin crée, partage et révoque les ressources plateforme et
  les grants ;
- un grant fournisseur autorise ses modèles actifs ;
- un grant modèle permet un accès ciblé sans exposer tout le fournisseur ;
- un grant cluster autorise le cluster et ses membres au runtime, sans accorder
  forcément un accès direct à chaque modèle ;
- une organisation ne voit que ses ressources privées et les ressources
  plateforme qui lui sont accordées ;
- un identifiant non accessible renvoie `404`, jamais `403` ;
- les clés fournisseur restent chiffrées et ne sont jamais exposées à
  l'organisation bénéficiaire ;
- les ressources privées existantes restent privées ; le super-admin peut
  créer des ressources plateforme séparées.

Les FK composites `(organization_id, provider_id)` ne peuvent plus protéger les
références partagées. Elles sont remplacées par des FK simples vers les
ressources. L'isolation est garantie par les grants, les dépôts et les tests
d'isolation croisée. Les données métier (prospects, conversations, fiches,
etc.) restent, elles, strictement scopées par `organization_id`.

La révocation d'un grant utilisé par un lien, un défaut d'usage ou un override
doit être bloquée ou accompagnée d'un impact explicite. Elle ne doit jamais
casser silencieusement une configuration existante.

### 2. Trois niveaux de limites

#### 2.1 Total organisation

Un budget global par organisation couvre **tous les appels IA**, toutes
fonctionnalités confondues :

- réponse de chat ;
- sélection des connaissances ;
- recherche/sélection de médias ;
- détection de l'état du visiteur ;
- extraction de données et de fiches ;
- résumé de conversation ;
- assistant IA interne ;
- génération assistée de chatbot ;
- remplissage IA des paramètres de template ;
- tests de modèles et tests d'extraction.

Le total organisation est prioritaire sur tous les quotas cibles.

#### 2.2 Quotas par fournisseur/modèle

Un quota peut être défini pour un couple fournisseur + modèle. Il s'applique à
tous les appels à ce modèle, qu'ils soient directs ou effectués via un cluster.

#### 2.3 Quotas par cluster

Un quota peut être défini pour un cluster. Il s'applique aux appels routés via
ce cluster.

Sémantique retenue :

```text
appel direct modèle :
  - incrémente le quota du modèle
  - incrémente le total organisation

appel via cluster :
  - incrémente le quota du cluster
  - incrémente le quota du modèle réellement utilisé
  - incrémente le total organisation une seule fois
```

Un appel via cluster ne doit jamais être compté deux fois dans le total
organisation. Le total organisation est la somme des événements d'usage, pas la
somme des quotas cibles.

Le quota cluster plafonne uniquement les appels passés **via ce cluster**. Les
appels directs aux mêmes modèles restent soumis au quota du modèle et au total
organisation, mais pas au quota cluster.

Une cible sans quota explicite est illimitée, sous réserve du total organisation.

#### 2.4 Limite du nombre de chatbots

Ajouter `organizations.max_chatbots` :

```text
NULL = illimité
0    = aucun nouveau chatbot
N    = nombre maximal de chatbots
```

Le contrôle s'applique à toutes les créations :

- dashboard ;
- API publique v1 ;
- provisioning transactionnel ;
- imports et créations futures.

Le nombre est comparé au nombre réel de `chat_links` de l'organisation. Un
abaissement de la limite sous le nombre existant ne supprime aucun chatbot :
seules les nouvelles créations sont bloquées.

Pour éviter une course entre deux créations concurrentes, l'invariant doit être
protégé en base (trigger `BEFORE INSERT` avec verrou sur l'organisation ou
transaction équivalente), pas uniquement par un contrôle applicatif.

### 3. Comptage central de tous les appels IA

Créer un port de comptage unique :

```text
AiUsageRecorder
  assertCanCall(organizationId, providerId, model, clusterId)
  record(event)
```

La factory IA (`AiClientFactory`) enveloppe tous les clients construits,
y compris les fournisseurs privés, plateforme, legacy et les fallbacks. Chaque
appel `complete()` :

1. vérifie l'accès et les quotas ;
2. appelle le fournisseur ;
3. récupère l'usage réel via `onUsage` ;
4. écrit un événement d'usage ;
5. incrémente les compteurs.

Table d'audit append-only :

```text
ai_usage_events
  id
  organization_id
  provider_id nullable
  provider_label
  model
  cluster_id nullable
  usage text
  link_id nullable
  conversation_id nullable
  user_id nullable
  prompt_tokens
  completion_tokens
  total_tokens
  created_at
```

Avantages :

- aucun appel IA futur ne peut être oublié ;
- l'assistant interne, les tests et les générations assistées sont couverts ;
- les agrégats par organisation, fournisseur/modèle et cluster sont possibles ;
- `chat_link_ai_usage` peut rester l'audit du quota chatbot, ou être alimentée
  en parallèle.

Le fournisseur legacy sans `provider_id` incrémente le total organisation et
produit un événement, mais ne peut pas alimenter un quota fournisseur/modèle.

Le contrôle est effectué avant l'appel. Comme pour l'ADR-0048, le quota est un
plafond souple : un appel déjà engagé peut terminer au-dessus, le blocage est
effectif pour l'appel suivant. Une réservation stricte avant appel pourra être
étudiée plus tard.

Si le fournisseur ne renvoie pas l'usage, l'estimation conservative existante
(`caractères / 4`) est utilisée.

### 4. Période et réinitialisation

Les quotas organisation utilisent les mêmes modes que les quotas chatbot :

```text
manual   : réinitialisation explicite
duration : réinitialisation automatique après N jours
```

Règles :

- la réinitialisation manuelle est réservée au super-admin et auditée ;
- elle remet à zéro le total organisation et tous les quotas modèles/clusters ;
- elle ne touche pas `chat_links.tokens_used`, qui reste un quota indépendant ;
- la réinitialisation automatique applique la même remise à zéro à l'échéance ;
- les événements `ai_usage_events` sont conservés (audit), jamais supprimés ;
- une allocation créée en cours de période démarre à 0, sans prorata ;
- modifier un plafond ne remet pas le compteur à zéro ;
- une remise à zéro ne se produit que par une action applicative explicite ou
  l'échéance automatique, jamais par une migration.

### 5. Invitations et provisioning

Une invitation sans organisation peut transporter un **snapshot de
provisioning** :

```text
organization_invitations
  provisioning jsonb
  offer_id uuid nullable (réservé aux offres futures)
```

Contenu :

```json
{
  "maxChatbots": 3,
  "maxTokens": 500000,
  "tokenResetMode": "duration",
  "tokenResetDays": 30,
  "allocations": [
    { "kind": "model", "providerId": "...", "model": "...", "maxTokens": 100000 },
    { "kind": "cluster", "clusterId": "...", "maxTokens": 300000 }
  ],
  "defaults": [
    { "usage": "response", "kind": "model", "providerId": "...", "model": "..." },
    { "usage": "assistant", "kind": "cluster", "clusterId": "..." }
  ]
}
```

À l'acceptation, dans une seule transaction :

1. créer l'organisation ;
2. appliquer le provisioning système existant ;
3. appliquer `max_chatbots` ;
4. créer les grants et les quotas ;
5. poser les défauts d'usage ;
6. créer la membership admin.

Si une ressource a été révoquée entre la création de l'invitation et
l'acceptation, l'acceptation échoue explicitement : aucune organisation
partiellement configurée n'est créée.

Le formulaire `/invitations` n'affiche cette section que si l'acteur est
super-admin et que l'organisation sélectionnée est vide. Pour une organisation
existante, les limites sont modifiées depuis `/organisations`.

Les invitations existantes sans provisioning restent valides et démarrent sans
limite, comme avant.

### 6. Administration et surfaces

Mutations réservées au super-admin :

- création du catalogue plateforme ;
- partage et révocation des fournisseurs, modèles et clusters ;
- limites d'organisation et quotas ;
- provisioning des invitations ;
- réinitialisation manuelle des quotas.

Les routes correspondantes appellent `requireSuperAdmin` / `assertSuperAdmin`.
L'ajout d'une action RBAC ne suffit pas, car le rôle `admin` possède déjà toutes
les actions.

Surfaces :

- `/invitations` : section de provisioning pour une invitation sans organisation ;
- `/organisations` : panneau « Limites & IA » par organisation ;
- nouvelle surface super-admin « Catalogue IA » pour les ressources plateforme
  et les grants ;
- les offres réutilisables viendront dans un lot ultérieur.

Chaque mutation de quota, grant ou provisioning est auditée.

### 7. Offres futures

Les limites personnalisées sont implémentées en premier. Les offres sont
préparées par :

- `organization_invitations.offer_id` nullable ;
- `provisioning` sous forme de snapshot ;
- une future table `platform_offers` + `platform_offer_allocations`.

Une offre sera un modèle de provisioning copié dans l'organisation à
l'acceptation. Modifier une offre ne modifiera pas rétroactivement les
organisations existantes. Une action explicite « appliquer cette offre » pourra
être ajoutée ensuite.

## Annexe A — scénarios de référence

Organisation **Agence A** :

```text
Quota total organisation : 1 000 000 tokens
Quota cluster « Rapide » :   300 000 tokens
Quota modèle Qwen        :   200 000 tokens
Quota modèle Gemma       :   200 000 tokens
Cluster « Rapide »       : Qwen puis Gemma
```

### Appel direct Qwen

```text
1 200 tokens
  total organisation : +1 200
  quota Qwen         : +1 200
  quota cluster      : +0
```

### Appel via cluster Rapide, Qwen disponible

```text
500 tokens
  total organisation : +500
  quota cluster      : +500
  quota Qwen         : +500
```

### Qwen épuisé, fallback Gemma via cluster

```text
800 tokens sur Gemma
  total organisation : +800
  quota cluster      : +800
  quota Qwen         : +0
  quota Gemma        : +800
```

### Cluster épuisé, modèles encore disponibles

```text
appel via cluster Rapide : refusé
appel direct Qwen        : autorisé si quota Qwen et total org OK
appel direct Gemma       : autorisé si quota Gemma et total org OK
```

### Total organisation épuisé

Tous les appels IA sont refusés, y compris l'assistant, les générations
assistées et les tests admin. Le chat public renvoie `423 Locked` avec un
message explicite ; le dashboard affiche une erreur explicite.

### Invitation

Le super-admin invite une organisation sans organisation avec :

```text
max_chatbots = 3
total        = 500 000
Qwen         = 100 000
cluster      = 300 000
défaut       = Qwen
```

À l'acceptation, les compteurs démarrent à 0, l'organisation voit uniquement
les ressources accordées et ne peut pas créer un 4e chatbot.

### Réinitialisation

```text
reset manuel super-admin :
  total organisation = 0
  quotas modèles     = 0
  quotas clusters    = 0
  chat_links.tokens_used : inchangé
  ai_usage_events        : conservés
```

## Annexe B — sécurité des migrations

Règle absolue : **une migration ne doit jamais remettre à zéro une
consommation métier**.

- les nouveaux compteurs sont créés dans de nouvelles tables, avec `DEFAULT 0` ;
- les lignes de budget/allocation ne sont créées qu'à la configuration ;
- aucun backfill depuis `chat_link_ai_usage` ;
- aucun `UPDATE chat_links SET tokens_used = 0` ;
- aucun recalcul de compteur depuis les événements ;
- `ai_usage_events` est append-only ;
- toute remise à zéro passe par une API applicative auditée ou l'échéance
  automatique ;
- les migrations futures restent additives et ne touchent pas les compteurs
  existants.

Conséquences :

- les organisations existantes sans budget restent illimitées ;
- lors de la première configuration d'une limite, la consommation démarre à 0 ;
- l'historique antérieur à l'activation n'est pas imputé ;
- les migrations ne peuvent pas provoquer de reset de production.

## Alternatives considérées

1. **Réutiliser `chat_link_ai_usage` comme unique table d'usage** : rejeté. Elle
   est liée à un chatbot et ne couvre pas l'assistant, les tests et les
   générations sans lien.
2. **Instrumenter chaque cas d'usage avec `withAiUsage`** : rejeté. Trop de
   chemins oublient déjà le comptage ; la factory est le point unique.
3. **Cloner les ressources partagées dans chaque organisation** : rejeté pour
   ce lot. La synchronisation des clés et des modèles deviendrait coûteuse et
   source d'incohérences. Le catalogue plateforme + grants est retenu.
4. **Compteurs sur `organizations` avec backfill** : rejeté. Risque de reset
   accidentel en production et couplage migration/compteurs.
5. **Appliquer les offres en direct** : rejeté. Les offres seront des snapshots
   réutilisables, sans effet rétroactif.

## Conséquences

### Positives

- Gestion centralisée des ressources IA et des limites par le super-admin.
- Tous les appels IA sont mesurés, y compris les futurs.
- Les offres pourront être ajoutées sans refonte du provisioning.
- Les quotas chatbot existants restent compatibles.
- Aucun reset de production par migration.

### Négatives / limites

- Les FK composites historiques doivent être remplacées pour les ressources
  partagées ; les tests d'isolation croisée deviennent critiques.
- Le plafond de tokens reste souple à la frontière d'un appel.
- Les événements d'usage augmentent le volume de données ; une politique de
  rétention/archivage sera nécessaire.
- L'historique par modèle/cluster antérieur à l'activation est absent.

## Étapes d'implémentation

1. **Socle quotas** : `max_chatbots`, budgets, allocations, `ai_usage_events`,
   `AiUsageRecorder`, garde de création de chatbot, tests de tous les appels IA.
2. **Catalogue partagé** : scope/ownership plateforme, grants, adaptation des
   dépôts et des FK, tests d'isolation.
3. **Invitations** : snapshot de provisioning, validation, application
   transactionnelle, UI `/invitations`, panneau `/organisations`.
4. **Offres** : `platform_offers`, allocations, sélection à l'invitation,
   snapshot, application explicite ultérieure.

## Tests attendus

- appel direct : total + modèle, sans cluster ;
- appel via cluster : total + cluster + modèle ;
- fallback modèle épuisé ;
- cluster épuisé : appels directs encore autorisés ;
- total organisation épuisé : tous les appels refusés ;
- reset manuel et duration : compteurs remis à zéro, événements conservés,
  `chat_links.tokens_used` inchangé ;
- aucun appel IA non tracé, y compris assistant, génération, tests et brouillon
  de fiche ;
- création de chatbot bloquée à la limite, y compris API publique et
  provisioning ;
- accès partagé autorisé uniquement avec grant ;
- révocation de grant et ressource utilisée ;
- acceptation d'invitation avec provisioning complet ou échec transactionnel ;
- aucun reset de compteur par migration ;
- opérations de configuration refusées à un admin d'organisation.
