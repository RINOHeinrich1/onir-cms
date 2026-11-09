# 0078. Accès privés aux services de données via WireGuard

- **Statut** : Proposé
- **Date** : 2026-11-08
- **Décideurs** : équipe projet
- **Référence** : ADR-0074, ADR-0075.
- **Complète** : ADR-0075.
- **Remplace** : aucune.

## Contexte

La production repose sur plusieurs machines :

- `51.38.83.166` : HAProxy et landing ;
- `141.94.213.19` : ancien nœud Next.js ;
- `167.114.66.243` : Next.js, PostgreSQL, Valkey et SeaweedFS.

Les ports `5432` (PostgreSQL), `6379` (Valkey) et `8333` (SeaweedFS) sont
publiés par Docker sur `0.0.0.0` et protégés aujourd’hui par des règles
`DOCKER-USER` :

- `51` ne peut joindre que `3000` ;
- `141` peut joindre `3000`, `5432`, `6379` et `8333` ;
- les autres sources sont supprimées.

Cette protection est correcte **à un instant donné**, mais elle présente trois
limites :

1. les règles `DOCKER-USER` ne sont pas persistées après reboot ;
2. Valkey n’a pas de mot de passe et `protected-mode` est désactivé ;
3. les flux PostgreSQL/Valkey/S3 ne sont pas chiffrés sur le réseau public.

Un reboot de `167` peut donc réexposer les services de données, et un accès
réseau non autorisé à `141` donnerait accès aux services sans chiffrement.

## Contrainte de continuité de l’orchestrateur

`141.94.213.19` héberge aussi l’orchestrateur et la session de travail. Il est
donc interdit de :

- redémarrer ou arrêter l’hôte `141` ;
- redémarrer le réseau de `141` ;
- modifier la route par défaut de `141` ;
- mettre `0.0.0.0/0` dans les `AllowedIPs` WireGuard de `141` ;
- utiliser une route par défaut ou un `DNS=` dans la configuration WireGuard de `141` ;
- couper la session SSH de management de `141`.

Sur `141`, `AllowedIPs` doit être limité à `10.88.0.1/32` ; sur `167`, le pair
est `10.88.0.2/32`. Aucune route `0.0.0.0/0` n’est ajoutée.

Seul le conteneur `onir-cms-app-node1` peut être redémarré. Le tunnel WireGuard
de `141` doit être appliqué avec un `AllowedIPs` limité à `10.88.0.1/32` et,
si possible, via `wg syncconf` pour ne pas interrompre les connexions
existantes.

Le reboot de `167` est possible, mais il doit être planifié séparément : il
coupe temporairement SSH vers `167`, pas l’orchestrateur de `141`.

## Décision

### 1. Tunnel WireGuard entre `141` et `167`

Mettre en place un tunnel WireGuard dédié aux flux de données :

```text
167 (serveur WireGuard)
  wg0 : 10.88.0.1/24
  écoute UDP 51820

141 (pair)
  wg0 : 10.88.0.2/32
  persistent-keepalive 25
```

Le pair `141` est le seul autorisé à se connecter au port WireGuard.
`51` continue d’accéder à l’application via le port `3000` ; il n’a pas besoin
d’être pair WireGuard dans un premier temps.

### 2. Les flux de données passent par `10.88.0.1`

Ancien nœud `141` :

```text
DATABASE_URL=postgres://...@10.88.0.1:5432/onir_cms
VALKEY_URL=redis://...@10.88.0.1:6379
S3_ENDPOINT=http://10.88.0.1:8333
```

Nouveau nœud `167` : aucun changement, il continue d’utiliser ses noms de
services Docker internes (`db`, `valkey`, `seaweedfs`).

### 3. Le port public des services de données est fermé

Une fois le tunnel validé :

- `141` n’est plus autorisé sur `5432`, `6379` et `8333` via son IP publique ;
- seules les sources WireGuard `10.88.0.2` sont autorisées sur ces ports ;
- `3000` reste accessible à `51` et `141` pour HAProxy et les tests ;
- les règles `DROP` restent en place pour toutes les autres sources.

Le serveur peut continuer à publier techniquement les ports sur `0.0.0.0` dans
un premier temps, car le filtrage WireGuard bloque l’accès public. Le passage à
un bind sur `10.88.0.1` est une amélioration ultérieure.

### 4. Persistance du firewall

Les règles `DOCKER-USER` doivent survivre au redémarrage.

Mise en œuvre :

- service systemd dédié ou mécanisme `iptables-persistent` ;
- application après le démarrage de Docker ;
- règles IPv4 et IPv6 ;
- test de reboot avant validation.

Sans cette étape, WireGuard ne suffit pas : un reboot peut rouvrir les ports.

### 5. Authentification Valkey

Ajouter un mot de passe Valkey et activer `protected-mode`.

- `requirepass` généré et stocké hors du dépôt ;
- `VALKEY_URL` mis à jour sur les deux nœuds ;
- redémarrage séquencé de Valkey et des applications ;
- vérification des SSE et du bus temps réel.

WireGuard assure le chiffrement ; le mot de passe assure la défense en
profondeur.

### 6. PostgreSQL

Conserver l’authentification SCRAM existante.

WireGuard assure le chiffrement du transport. L’activation de TLS PostgreSQL
peut être ajoutée plus tard, mais elle n’est pas nécessaire dans un premier
temps si le tunnel est correctement limité et persisté.

### 7. SeaweedFS

Le trafic S3 passe par WireGuard.

Aucun changement HTTPS n’est nécessaire dans un premier temps. Les identifiants
S3 restent inchangés et les ports publics sont bloqués.

## Plan d’action

### Phase 0 — Préparation

- sauvegarder `iptables-save` et les fichiers compose ;
- sauvegarder les env des deux nœuds ;
- vérifier la disponibilité de la console OVH en cas de perte d’accès ;
- vérifier que le module WireGuard est disponible sur les deux machines ;
- planifier une fenêtre courte pour les redémarrages.

### Phase 1 — WireGuard

- générer les clés privées/publiques ;
- créer `wg0` sur `167` et `141` ;
- autoriser UDP `51820` uniquement depuis `141` ;
- sur `141`, `AllowedIPs` strictement limité à `10.88.0.1/32` ;
- sur `141`, ne jamais toucher à la route par défaut ni redémarrer le réseau ;
- privilégier `wg syncconf` pour une mise à jour sans coupure ;
- tester :

```bash
wg show
ping 10.88.0.1
nc -vz 10.88.0.1 5432
nc -vz 10.88.0.1 6379
nc -vz 10.88.0.1 8333
```

### Phase 2 — Ancien nœud

- modifier uniquement les variables d’environnement de `141` ;
- redémarrer **uniquement le conteneur** `onir-cms-app-node1` ;
- ne jamais redémarrer l’hôte `141` ni couper SSH ;
- vérifier que l’orchestrateur reste joignable pendant l’opération ;
- vérifier login, lecture DB, upload S3 et SSE ;
- HAProxy doit continuer à servir via le nœud `167` pendant l’opération.

### Phase 3 — Fermeture des accès publics

- supprimer les autorisations publiques `141` sur `5432`, `6379`, `8333` ;
- autoriser `10.88.0.2` sur ces ports ;
- conserver `DROP` pour le reste ;
- vérifier depuis `51` que les trois ports sont bloqués ;
- vérifier depuis `141` que les trois ports passent par WireGuard.

### Phase 4 — Persistance et reboot

- persister les règles ;
- tester un reboot contrôlé de `167`, jamais de `141` ;
- accepter une coupure temporaire du SSH vers `167` pendant ce test ;
- vérifier que l’orchestrateur de `141` reste joignable ;
- vérifier que les ports publics restent fermés après redémarrage.

### Phase 5 — Valkey

- activer `requirepass` ;
- mettre à jour `VALKEY_URL` sur les deux nœuds ;
- redémarrer Valkey puis les applications ;
- vérifier les capabilities SSE (`mode=valkey`, `distributed=true`).

## Impacts et continuité

### Ce qui ne change pas

- aucun code applicatif ;
- aucune migration de base ;
- aucun changement de logique métier ;
- aucun changement HAProxy ;
- aucun changement DNS ;
- aucune modification des données.

### Ce qui peut être interrompu brièvement

- redémarrage de l’ancien nœud Next.js lors du changement d’env ;
- redémarrage de Valkey pour activer le mot de passe ;
- reconnexion des clients SSE ;
- reconnexion des pools PostgreSQL.

Avec les deux nœuds et HAProxy, l’objectif est de ne pas couper le service
global : on redémarre un nœud à la fois et on vérifie le health avant de
continuer.

## Rollback

Conserver :

- les fichiers compose et env actuels ;
- les règles firewall actuelles ;
- les anciennes URLs publiques ;
- les clés WireGuard et la configuration `wg0`.

En cas d’échec :

1. remettre les env publics sur `141` ;
2. redémarrer l’ancien nœud ;
3. restaurer les règles firewall précédentes ;
4. arrêter WireGuard si nécessaire.

Aucune donnée n’est modifiée par le rollback.

## Conséquences

### Positives

- services de données retirés de l’exposition publique ;
- chiffrement de tous les flux 141 ↔ 167 ;
- latence supplémentaire faible ;
- coût CPU faible avec WireGuard noyau ;
- défense en profondeur avec mot de passe Valkey ;
- firewall persistant après reboot.

### Négatives

- complexité d’exploitation supplémentaire ;
- gestion des clés WireGuard ;
- dépendance à la disponibilité du tunnel ;
- redémarrages courts ;
- nécessité de tester le reboot et la persistance.

## Alternatives écartées

- **Rester uniquement sur `DOCKER-USER`** : pas persistant après reboot.
- **Ouvrir PostgreSQL/Valkey en TLS uniquement** : ne protège pas S3 et
  n’empêche pas l’exposition des ports.
- **SSH tunnels** : moins stables et plus difficiles à superviser.
- **Tailscale/userspace** : plus simple mais plus lourd et moins prévisible en
  débit que WireGuard noyau.
- **Bind `10.88.0.1` immédiatement** : souhaitable à terme, mais impose des
  redémarrages supplémentaires ; le filtrage peut être fait d’abord.

## Points ouverts

- faut-il inclure `51` dans WireGuard pour le trafic HAProxy → Next.js ?
- faut-il activer TLS PostgreSQL en plus de WireGuard ?
- faut-il migrer SeaweedFS vers HTTPS ?
- politique de rotation des clés WireGuard et du mot de passe Valkey ;
- supervision de `wg0` et alerte si le tunnel tombe.

## Critères d’acceptation

- l’orchestrateur de `141` reste joignable pendant toute l’opération ;
- aucun reboot ni restart réseau de l’hôte `141` n’est effectué ;
- `141` joint `10.88.0.1` sur `5432`, `6379` et `8333`.
- `51` ne joint plus `5432`, `6379` ni `8333`.
- une source non autorisée ne joint aucun des trois ports.
- les règles survivent à un reboot de `167`.
- l’ancien nœud fonctionne avec les URLs WireGuard.
- Valkey exige un mot de passe.
- les SSE fonctionnent après redémarrage.
- aucun changement de code ni de données.
