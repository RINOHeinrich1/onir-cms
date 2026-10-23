# Contrat différé — migration `0026_contract.sql`

ADR-0025 §8 et hypothèse **H7** : le retrait des `DEFAULT` legacy sur
`organization_id` est **différé** à une release ultérieure. Le déploiement CI
exécute `db:migrate` **avant** `build` et `pm2 restart` : l'ancien process écrit
encore pendant le build et doit continuer à insérer sans `organization_id`.

## SQL prévu (NE PAS exécuter dans cette release)

```sql
-- 0026_contract.sql
ALTER TABLE prospects          ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE chat_links         ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE conversations      ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE fiches             ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE chat_templates     ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE base_connaissances ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE medias             ALTER COLUMN organization_id DROP DEFAULT;
ALTER TABLE confidentialites   ALTER COLUMN organization_id DROP DEFAULT;
```

## Critères go / no-go

1. La version applicative qui écrit **toujours** `organization_id` explicitement
   est déployée et stable (au moins une release).
2. `npm run db:verify-tenant` renvoie `0` (aucune ligne orpheline, aucun `NULL`).
3. Aucune session ne peut créer de donnée sans organisation active
   (état « aucune organisation » couvert).
4. Fenêtre de maintenance ou trafic faible : le `DROP DEFAULT` est instantané
   (métadonnée) mais toute écriture legacy échouerait ensuite.
5. Rollback : ré-appliquer les `DEFAULT` legacy si un ancien process doit être
   redémarré.

## Après le contrat

- Les `DEFAULT` legacy disparaissent : un insert sans `organization_id` échoue
  (protection contre les oublis).
- RLS PostgreSQL peut être introduite en durcissement (ADR-0025 §1/§10).
