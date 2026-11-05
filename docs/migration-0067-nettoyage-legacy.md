# Runbook — migration destructive 0082 (nettoyage legacy des fiches)

- **ADR** : [ADR-0067](adr/0067-outils-internes-fiches-statuts-qualification.md) §3
- **Migration** : `src/infrastructure/db/migrations/0082_drop_legacy_fiche_columns.sql`
- **Portée** : suppression des 8 colonnes legacy de `fiches`
  (`plateformes`, `description`, `budget`, `duree`, `contact`, `statut`,
  `contraintes_techno`, `lien_doc_spec`), après backfill de `fiches.data` et
  retrait du champ historique `statut` (`initier` / `reprendre`) des données et
  des snapshots de définition.
- **Nature** : **destructive et irréversible**. La seule protection est le dump
  PostgreSQL réalisé et vérifié avant l'exécution.
- **Base concernée** : uniquement une base cible explicitement désignée
  (`DATABASE_URL`). Ne jamais exécuter sur une base de développement partagée,
  de préproduction ou de production sans respecter cette procédure.

> ⚠️ **Interdiction** : ne jamais lancer `npm run db:migrate` sur la base de
> production / préproduction sans sauvegarde vérifiée, sans fenêtre de
> déploiement et sans avoir livré la release 2 (code sans lecture des colonnes).

---

## 0. Pré-requis

1. La **release 1** (P1 → P5) est déployée : migrations additives 0079 / 0080 /
   0081 appliquées, nouveaux types, statuts et outils en production, ancien code
   legacy encore toléré.
2. La **release 2** (P6, code sans lecture des colonnes) est prête à être
   déployée. Cette version fonctionne **avec ou sans** les colonnes encore
   présentes.
3. `pg_dump` et `pg_restore` sont disponibles dans l'image de maintenance.
4. `BACKUP_DIR` pointe vers un volume disposant de l'espace nécessaire
   (au moins la taille de la base + marge).
5. L'accès à la base cible est confirmé et tracé (environnement, nom de base,
   fenêtre horaire).

```bash
# Contrôle du contexte (ne jamais afficher le mot de passe en clair)
node -e 'const u=new URL(process.env.DATABASE_URL); console.log(u.host, u.pathname)'
```

---

## 1. Sauvegarde obligatoire et vérification du dump

```bash
# Dump custom complet, propriétaires retirés
BACKUP_DIR=/backups npm run db:backup

# Le CLI affiche : « Sauvegarde créée : /backups/onir-cms-<timestamp>.dump »
```

Vérifications **obligatoires** avant de continuer :

```bash
DUMP=/backups/onir-cms-<timestamp>.dump

# 1. Le fichier existe et n'est pas vide (> 0 octet)
test -s "$DUMP" && echo "dump non vide"

# 2. Sommaire lisible par pg_restore (le dump n'est pas corrompu)
pg_restore --list "$DUMP" | head

# 3. La table `fiches` est bien présente dans le dump
pg_restore --list "$DUMP" | grep -F 'TABLE public fiches'
```

**Porte de sortie** : si l'une de ces commandes échoue, **arrêter**. Ne pas
exécuter la migration. Conserver le dump dans un emplacement sauvegardé hors de
la machine cible (copie objet / stockage externe).

---

## 2. Ordre de déploiement en deux releases

| Étape | Contenu | Effet sur le schéma |
|---|---|---|
| **Release 1** | P1 (types), P2 (statuts), P3 (outils), P4 (blocs), P5 (UI/E2E) | Additif : 0079 / 0080 / 0081 ; aucune colonne supprimée |
| **Release 2** | P6 : code sans lecture/écriture des colonnes legacy (F005 → F018) | Aucun ; tolère les colonnes présentes **ou** absentes |
| **Migration 0082** | backfill → nettoyage JSONB → drop des 8 colonnes | **Destructif** |

La release 2 doit être **entièrement déployée** (toutes les instances de
l'ancien code arrêtées) avant la migration 0082. Sinon une ancienne instance
lirait des colonnes devenues absentes.

---

## 3. Exécution de la migration 0082

```bash
# Vérifier d'abord que la base n'est pas déjà marquée comme migrée
psql "$DATABASE_URL" -c "SELECT name FROM schema_migrations WHERE name = '0082_drop_legacy_fiche_columns.sql'"

# Exécuter (transaction unique par migration dans le runner)
npm run db:migrate
```

Le runner (`src/infrastructure/db/migrate.ts`) :

- applique les fichiers `.sql` dans l'ordre ;
- entoure **chaque migration** d'un `BEGIN` / `COMMIT` ;
- n'enregistre `schema_migrations` qu'en cas de succès ;
- effectue un `ROLLBACK` complet en cas d'erreur.

En cas d'échec : la transaction est annulée, **aucune** colonne n'est perdue.
Corriger la cause, puis relancer. Ne jamais relancer sur une base
partiellement migrée sans vérifier `schema_migrations`.

---

## 4. Requêtes de contrôle après migration

```bash
# 4.1 Aucune des 8 colonnes legacy ne subsiste
psql "$DATABASE_URL" -c "
  SELECT column_name
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'fiches'
     AND column_name IN ('plateformes','description','budget','duree','contact',
                         'statut','contraintes_techno','lien_doc_spec')
   ORDER BY column_name"
# Attendu : 0 ligne

# 4.2 Aucun résidu `statut` dans les données des fiches
psql "$DATABASE_URL" -c "
  SELECT count(*) FROM fiches
   WHERE jsonb_typeof(data) = 'object' AND data ? 'statut'"
# Attendu : 0

# 4.3 Aucun champ `statut` / `requiredIf` vers `statut` dans les snapshots
psql "$DATABASE_URL" -c "
  SELECT count(*) FROM fiches f
   WHERE jsonb_typeof(f.definition->'fields') = 'array'
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(f.definition->'fields') AS field
        WHERE field->>'name' = 'statut'
           OR field->'requiredIf'->>'field' = 'statut')"
# Attendu : 0

# 4.4 Idem pour les configurations de chatbot et les fiches de collecte
psql "$DATABASE_URL" -c "
  SELECT
    (SELECT count(*) FROM chatbot_configs c
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(c.fiche_definitions) AS def
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(def->'fields')='array' THEN def->'fields' ELSE '[]'::jsonb END
        ) AS field
         WHERE field->>'name' = 'statut' OR field->'requiredIf'->>'field' = 'statut')) AS chatbot_configs,
    (SELECT count(*) FROM fiche_collectes
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(fields) AS field
         WHERE field->>'name' = 'statut' OR field->'requiredIf'->>'field' = 'statut')) AS fiche_collectes,
    (SELECT count(*) FROM fiche_collecte_versions
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(fields) AS field
         WHERE field->>'name' = 'statut' OR field->'requiredIf'->>'field' = 'statut')) AS fiche_collecte_versions"
# Attendu : 0 | 0 | 0

# 4.5 Comptage des fiches inchangé (comparer au comptage pré-migration)
psql "$DATABASE_URL" -c "SELECT count(*) FROM fiches"

# 4.6 Les colonnes de qualification et le modèle générique sont intacts
psql "$DATABASE_URL" -c "
  SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='fiches'
     AND column_name IN ('data','definition','qualification_status_key',
                         'qualification_status_updated_at','qualification_status_updated_by')
   ORDER BY column_name"
# Attendu : les 5 lignes
```

Contrôles fonctionnels :

- ouvrir la liste des fiches (backoffice) : libellé de définition + date ;
- ouvrir une fiche : champs issus de `definition.fields` et de `data` ;
- les fiches existantes ont `qualification_status_key = NULL` (aucun backfill) ;
- la création manuelle de fiche fonctionne avec des champs `number` / `date` /
  `image`.

---

## 5. Restauration en cas d'incident

```bash
# 5.1 Arrêter l'application (aucune écriture concurrente pendant la restauration)
#     selon le mécanisme d'exploitation du déploiement.

# 5.2 Restaurer le dump custom (recrée les objets, propriétaires retirés)
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" "$DUMP"

# 5.3 Si la migration a été partiellement tracée, corriger `schema_migrations`
#     UNIQUEMENT après restauration complète :
psql "$DATABASE_URL" -c "DELETE FROM schema_migrations WHERE name = '0082_drop_legacy_fiche_columns.sql'"

# 5.4 Redémarrer l'application, puis rejouer les contrôles du §4.
```

Le dump étant un `pg_dump --format=custom --no-owner`, `pg_restore` restaure
données **et** schéma. Toujours vérifier le code de sortie de `pg_restore` et
les erreurs éventuelles (les `--clean` peuvent produire des avertissements sur
des objets absents ; ils ne sont pas bloquants).

---

## 6. Points de vigilance

- **Irréversibilité** : après le `COMMIT`, les colonnes et le statut historique
  sont définitivement supprimés. Seul le dump permet un retour arrière.
- **Fenêtre** : la migration 0082 ne doit pas s'exécuter tant qu'une instance de
  l'ancien code (release 1) lit encore les colonnes.
- **Backfill** : seules les clés absentes ou `null` de `fiches.data` sont
  recopiées. Une valeur déjà présente dans `data` est prioritaire. Aucune
  conversion texte → `number` / `date`.
- **`description`** : il s'agit bien de `fiches.description` (colonne legacy),
  pas de `TemplateDefinition.description` (libellé de fiche) ; la migration ne
  touche qu'à la colonne SQL.
- **`contraintesTechno`** : reste un champ optionnel s'il est défini dans une
  fiche de collecte ; seul son `requiredIf` vers `statut` est retiré.
- **Statut de qualification** : aucun backfill vers `qualification_status_key`
  (les fiches existantes restent `NULL` / « Non qualifiée »).
- **Ne jamais** appliquer 0082 sur une base de test jetable partagée par
  d'autres suites : utiliser une base dédiée (nom contenant `test`) et la
  supprimer après usage.
