# 0099. Identification visiteur par email OTP — transport email multi-tenant et portail hôte

- **Statut** : Accepté
- **Date** : 2026-11-18
- **Référence** : ADR-0018, ADR-0020, ADR-0033, ADR-0041, ADR-0090, ADR-0013.
- **Complète** : ADR-0033 (modes d'identification).

## Contexte

ADR-0033 réserve déjà le mode `otp` dans `chat_links.identification_mode`, mais
l'exclut volontairement de `ACTIVE_LINK_IDENTIFICATION_MODES`. Le modèle de
données et la résolution du mode sont donc prêts pour une activation additive ;
il manque le transport email, le cycle de vie du code OTP et l'interface hôte.

ONIR-CMS n'a aujourd'hui aucun transport email applicatif. Le backoffice
commercial possède un SMTP mono-tenant, mais son modèle ne peut pas être copié
tel quel : ONIR-CMS est multi-organisations. Une configuration globale unique
mélangerait les marques, la délivrabilité et les responsabilités.

Le mode OTP doit rester une décision du **cœur/host**. Un template ne doit jamais
envoyer un code, vérifier un code ou créer une session d'identification
lui-même.

## Décision

### 1. Activation du mode `otp`

- `otp` devient un mode actif pour les liens `standard`.
- Le mode reste ignoré pour un lien `specifique`, comme les autres modes
  d'identification.
- Phase 1 : surface **page**. Le widget reste sur son comportement actuel
  (`anonymous` par défaut) et pourra être étendu après validation E2E.
- Le mode effectif est toujours résolu depuis le canal du lien, jamais depuis
  une valeur fournie par le client.

### 2. Transport email : organisation puis défaut plateforme

Deux niveaux de configuration :

```text
organization_email_settings   (une ligne par organisation)
platform_email_settings       (une ligne singleton)
```

Ordre de résolution `resolveEmailTransport(organizationId)` :

1. si l'organisation possède une configuration **active et complète**, l'utiliser ;
2. si elle ne possède **aucune ligne**, utiliser la configuration plateforme
   active ;
3. si elle possède une ligne désactivée/incomplète, **échouer explicitement** :
   ne pas basculer silencieusement vers le SMTP plateforme ;
4. si aucun des deux niveaux n'est configuré, désactiver l'option OTP avec un
   message explicite.

Le fallback plateforme ne s'applique donc qu'en cas d'**absence** de
configuration d'organisation, jamais en cas de panne ou de désactivation
volontaire.

Chaque configuration contient :

- hôte, port, TLS/STARTTLS, utilisateur ;
- mot de passe chiffré AES-256-GCM (aucune valeur renvoyée par l'API) ;
- expéditeur `fromEmail`, nom `fromName`, `replyTo` ;
- statut `active|disabled`, date de dernier test et résultat.

Le mot de passe est chiffré avec une AAD liée à l'organisation (et au singleton
plateforme), jamais réutilisé en clair. Seul un admin d'organisation peut
modifier la configuration de son organisation ; seul un super-admin peut
modifier le défaut plateforme.

Un endpoint de test envoie un email uniquement à l'utilisateur authentifié qui
déclenche le test.

### 3. Challenges OTP

Table `chat_otp_challenges` :

```text
id, link_id, channel, surface, email_normalized, code_hash,
expires_at, attempts, max_attempts, consumed_at, ip, user_agent, created_at
```

Règles :

- code à **6 chiffres**, généré cryptographiquement ;
- stockage du **hash** uniquement ;
- durée de vie **10 minutes** ;
- **5 tentatives** maximum ;
- code à usage unique ;
- invalidation à la consommation ou à l'expiration ;
- renvoi limité (60 s puis 3 renvois / 15 min) ;
- rate limiting par email, par IP et par lien ;
- purge des challenges expirés ;
- aucun code, email complet ou secret dans les logs.

Les réponses de demande sont **neutres** : ne jamais révéler si l'email existe
déjà, si un prospect existe ou si un code est encore valide.

### 4. Parcours et session

1. `POST /api/chat/otp/request` : email + consentement + token de lien ;
2. envoi du code par le transport résolu ;
3. `POST /api/chat/otp/verify` : challenge + code ;
4. en cas de succès :
   - email marqué comme vérifié ;
   - prospect créé ou retrouvé par email dans l'organisation ;
   - reprise d'une conversation ouverte possible, sous réserve des règles de
     reprise existantes ;
   - démarrage de la conversation via le même service de session que
     `contact`, sans duplication de la logique.

L'email vérifié est la seule identité minimale. Le nom reste optionnel ; à
défaut, l'interface peut utiliser la partie locale de l'email sans la présenter
comme un nom civil.

La conversation porte une trace de vérification (`visitor_email_verified_at`
ou équivalent) pour le backoffice.

### 5. Portail d'identification hôte

Le host fournit un portail OTP générique, sur le modèle de `ContactGate` :

- étape email + consentement ;
- étape code ;
- renvoi, changement d'email, expiration, erreurs ;
- accessibilité clavier et libellés localisés FR/EN/MG.

Le template ne reçoit pas les routes OTP comme actions sensibles et ne peut pas
créer une session à partir de son propre code. Il peut seulement déclarer qu'il
accepte le mode et styliser l'interface fournie par le host.

Le manifeste expose une capability additive :

```json
"identificationModes": ["contact", "anonymous", "otp"]
```

Une absence de déclaration conserve le comportement par défaut
(`contact`/`anonymous`). Un template qui ne déclare pas `otp` ne peut pas être
sélectionné pour ce mode.

### 6. Interface backoffice

- **Paramètres organisation → Email** : configuration SMTP, expéditeur, test.
- **Paramètres plateforme → Email par défaut** : réservé au super-admin.
- Le lien standard affiche **« Code par email (OTP) »** dans le sélecteur
  d'identification.
- L'option est désactivée avec un lien vers les réglages si aucun transport
  n'est disponible.
- Le mode affiche clairement la source du transport : organisation ou défaut
  plateforme.

### 7. Sécurité et conformité

- Rate limiting et anti-énumération sur les deux routes OTP.
- Time-trap et limitation de débit réutilisés du parcours visiteur.
- Session OTP à durée limitée, liée au challenge consommé.
- Aucun code en clair en base, en log ou dans une réponse.
- Consentement et politique de confidentialité restent indépendants de
  l'identification (ADR-0018).
- Conservation des emails et challenges bornée ; purge planifiée.
- Audit des changements de configuration email et des tentatives échouées.
- SPF/DKIM/DMARC à documenter pour chaque domaine expéditeur.

### 8. Hors périmètre

- OTP par SMS ;
- magic link ;
- mot de passe visiteur ;
- authentification interne (mode `internal`, ADR-0033) ;
- OTP sur widget avant validation de la phase page.

## Conséquences

- Aucune migration de rupture sur `identification_mode` : `otp` existe déjà.
- Les organisations sans SMTP peuvent utiliser le défaut plateforme.
- Une organisation qui désactive explicitement son SMTP ne fuit pas vers le
  défaut plateforme.
- Les templates existants restent compatibles ; l'OTP est opt-in par capability.
- Les coûts principaux sont le transport email, la délivrabilité et la
  protection anti-spam, pas le schéma de conversation.

## Alternatives écartées

- **SMTP global unique** : rejeté pour l'isolation multi-tenant et la
  délivrabilité.
- **OTP implémenté dans chaque template** : rejeté pour la sécurité et la
  duplication.
- **Lien magique** : reporté ; le code à 6 chiffres est plus simple à saisir et
  à tester sur mobile.
- **Fallback automatique en cas d'échec SMTP organisation** : rejeté ; il
  masquerait une panne et changerait silencieusement l'expéditeur.
