# 0007. Liens de chat spécifique / standard

- **Statut** : Accepté
- **Date** : 2026-10-14
- **Décideurs** : équipe projet

## Contexte

La prospection part d'un lien partageable (US-LIENS-001). Deux cas : le lien
connaît déjà le prospect (RM-LIEN-SPEC) ou le visiteur est inconnu (RM-LIEN-STD).

## Décision

- Lien **spécifique** : rattaché à un prospect obligatoire et existant ; ses
  contacts et informations sont injectés en contexte du prompt système ; aucune
  identification visiteur.
- Lien **standard** : aucun prospect ; le visiteur fournit nom + email valides
  avant toute discussion (`ContactGate` + `POST /api/chat/session`).
- Le jeton en clair (24 octets base64url) n'est communiqué qu'une fois, à la
  création ; seul son hash SHA-256 est persisté (`chat_links.token_hash` unique).
- Révocation = désactivation (`actif = false`), conversations conservées ;
  expiration optionnelle (`expires_at`).
- Portails publics `/l/[token]` non indexés (`robots noindex`), honeypot
  `societe_web` et rate limiting (5 sessions / 10 min par IP, 20 messages /
  5 min par conversation).

## Conséquences

- Un jeton fuité ne révèle rien d'autre que l'accès au chat ; révocation
  immédiate possible depuis `/liens`.
- Les conversations survivent à la révocation (traçabilité commerciale).

## Liens

- RM-LIEN-SPEC, RM-LIEN-STD ; US-LIENS-001, US-CHAT-001.
