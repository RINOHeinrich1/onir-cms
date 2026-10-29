# 0056. Création manuelle d'une fiche depuis une fiche de collecte

- **Statut** : Accepté
- **Date** : 2026-10-29
- **Décideurs** : équipe projet
- **Référence** : ADR-0050, ADR-0055.

## Contexte

L’ADR-0055 a rendu les fiches indépendantes du modèle de raisonnement. La
première version de la création manuelle utilisait encore une définition
statique locale.

Or une fiche de prospection doit pouvoir adopter plusieurs structures selon la
fiche de collecte choisie. Une définition statique ne permet ni de choisir les
champs, ni d’utiliser les fiches de collecte réutilisables de l’organisation.

## Décision

Lors de la création manuelle d’une fiche :

1. l’utilisateur choisit une **fiche de collecte** existante ;
2. le formulaire est généré dynamiquement depuis les champs de cette fiche ;
3. le serveur résout la fiche et sa version, puis valide les valeurs ;
4. la fiche créée conserve un snapshot `definition` avec `sourceFicheId` et
   `sourceVersion` ;
5. aucune dépendance à `chat_templates` n’est créée ;
6. la fiche peut être associée à 0..N chatbots, indépendamment de la fiche de
   collecte.

La fiche de collecte n’est pas obligatoire pour le chatbot : elle est
obligatoire uniquement pour créer une fiche manuelle structurée.

## Conséquences

- Le formulaire manuel n’est plus figé.
- Une fiche de collecte peut servir à plusieurs fiches et à plusieurs chatbots.
- Le snapshot garantit la reproductibilité du rendu.
- Les champs `file` ne sont pas encore déposables depuis la création manuelle ;
  ce point reste à traiter.
