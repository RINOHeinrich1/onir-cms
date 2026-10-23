# ADR-0004 — Authentification par session cookie + hachage scrypt

- **Statut** : Accepté
- **Date** : 2026-10-14
- **Contexte** : US-AUTH-001 exige une authentification email + mot de passe avec
  compte admin par défaut et **rotation forcée**. Aucun fournisseur d'identité
  externe n'est requis (application auto-hébergée, PM2 + nginx).

## Décision

1. **Hachage des mots de passe** via `node:crypto` **scrypt**, sans dépendance
   native. Format stocké `scrypt$<saltHex>$<hashHex>` ; comparaison en temps
   constant (`timingSafeEqual`). Le mot de passe n'est **jamais** stocké en clair.
2. **Session** : jeton opaque aléatoire (32 octets, base64url) transmis dans un
   cookie **httpOnly**, `sameSite=lax`, `secure` en production. Seule l'empreinte
   **SHA-256** du jeton est persistée (`sessions.token_hash`), rendant les
   sessions révocables (`logout`, suppression utilisateur).
3. **Rotation forcée** : le compte admin par défaut est créé avec
   `must_change_password = true`. Le layout `(dashboard)` redirige vers
   `/change-password` tant que la rotation n'a pas eu lieu.
4. **Anti-bruteforce** : limiteur à fenêtre glissante en mémoire sur `/api/auth/login`
   + champ **honeypot**.

## Conséquences

- Les sessions expirent (7 jours) et sont supprimables individuellement.
- Le middleware Edge ne vérifie que la **présence** du cookie ; la validation
  réelle (base, expiration, compte actif) est faite côté serveur Node.
