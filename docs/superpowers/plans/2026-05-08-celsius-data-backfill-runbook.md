# Celsius Data Backfill — Runbook

**Date:** 2026-05-08
**Status:** Operational guide
**Companion to:** [2026-05-06-celsius-storage-migration.md](2026-05-06-celsius-storage-migration.md) (Task 14 alternative path)

## When to use this runbook

Use this when you need to apply the Celsius storage migration to a database that already has real `CycleDay` rows you do **not** want to lose. The original plan's Task 14 says "drop and recreate" — that only fits the no-users-yet scenario the spec was written under. This runbook replaces that step with a one-time data-preserving backfill.

## What it does

Converts every existing `CycleDay.bbt` value from Fahrenheit to Celsius using `(F − 32) × 5/9`. After the backfill, the database holds canonical Celsius values that line up with the new code (which now reads `bbt` as °C directly). NULL `bbt` rows are skipped.

The display unit you're set to (Celsius or Fahrenheit) does not matter — every row was stored as Fahrenheit regardless of display preference, so the same conversion applies uniformly.

## What it does NOT do

- Change the column type. `bbt Float?` stays `Float?` — only the values change.
- Change row counts. No rows are added, deleted, or NULLed.
- Affect any column other than `bbt`.

## Pre-conditions

- The branch implementing the Celsius storage migration (`feat/celsius-storage-migration`) is checked out in the worktree where you'll run `wasp db migrate-dev`.
- Tasks 1–13 of the implementation plan are committed (255 tests passing).
- The dev Postgres container (`wasp-dev-db-CyclePath-…`) is running.
- You have `pg_dump` access via `docker exec` to that container.

## Local Postgres handle (for `psql` / `pg_dump` via docker)

```bash
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep '^wasp-dev-db-CyclePath-')
DB_NAME=$(docker inspect "$DB_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^POSTGRES_DB=' | cut -d= -f2)
DB_USER=$(docker inspect "$DB_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^POSTGRES_USER=' | cut -d= -f2)
```

You can then run `docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c '<sql>'` for any of the queries below.

## Step 0: Pre-flight sanity check

Confirm every existing `bbt` value is in the Fahrenheit range. If any are already in the Celsius range, **stop** — running the backfill on those rows would corrupt them. They need to be handled separately before proceeding.

```sql
SELECT
  (CASE
     WHEN bbt < 35 THEN 'A: <35 (impossible)'
     WHEN bbt BETWEEN 35 AND 40 THEN 'B: 35-40 (Celsius range — STOP)'
     WHEN bbt BETWEEN 95 AND 102 THEN 'C: 95-102 (Fahrenheit range — expected)'
     ELSE 'D: other (unexpected — STOP)'
   END) AS bucket,
  COUNT(*)
FROM "CycleDay"
WHERE bbt IS NOT NULL
GROUP BY bucket
ORDER BY bucket;
```

**Pass criterion:** every row sits in bucket C.

Also note your row counts — you'll re-check these after the migration:

```sql
SELECT
  COUNT(*)        AS total_rows,
  COUNT(bbt)      AS rows_with_bbt,
  MIN(bbt)        AS min_bbt,
  MAX(bbt)        AS max_bbt,
  AVG(bbt)::numeric(10,4) AS avg_bbt
FROM "CycleDay";
```

Save the output — Step 5 will reference it.

## Step 1: Take a permanent snapshot table BEFORE migrating

This snapshot is the ground truth for the verification in Step 4. It captures, for every row, the stored value plus what the chart/form would render in both °C and °F under the *current* (pre-migration) interpretation.

```sql
DROP TABLE IF EXISTS _bbt_migration_snapshot;
CREATE TABLE _bbt_migration_snapshot AS
SELECT
  id,
  bbt                                            AS stored_before,
  ROUND(bbt::numeric, 2)                         AS display_f_before,
  ROUND(((bbt - 32) * 5.0 / 9.0)::numeric, 2)    AS display_c_before
FROM "CycleDay"
WHERE bbt IS NOT NULL;
```

**Pass criterion:** the snapshot table holds 131 rows (or whatever your row count was in Step 0).

```sql
SELECT COUNT(*) FROM _bbt_migration_snapshot;
```

## Step 2: pg_dump backup (belt & suspenders)

The snapshot in Step 1 is enough for verification, but a full dump lets you reset the DB to its exact pre-migration state if anything catastrophic happens.

```bash
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  > /tmp/cycle-path-pre-celsius-backup.sql
```

To restore (only if needed): `docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < /tmp/cycle-path-pre-celsius-backup.sql`.

## Step 3: Create and apply the migration

The branch's only schema change is a triple-slash comment on the `bbt` field — Prisma doesn't auto-generate a migration for that, so you create one by hand containing just the data backfill.

```bash
cd app
TS=$(date -u +%Y%m%d%H%M%S)
mkdir -p "migrations/${TS}_backfill_bbt_to_celsius"
cat > "migrations/${TS}_backfill_bbt_to_celsius/migration.sql" <<'EOF'
-- Backfill: convert all stored CycleDay.bbt values from Fahrenheit to Celsius.
--
-- Before this branch (feat/celsius-storage-migration), bbt was stored as
-- Fahrenheit; the engine converted F → C on read. After this branch, bbt is
-- stored as canonical Celsius and the engine reads it directly. Existing rows
-- must be converted in place exactly once.
--
-- Reverse (only if you need to roll back to the pre-migration code):
--   UPDATE "CycleDay" SET bbt = bbt * 9.0 / 5.0 + 32 WHERE bbt IS NOT NULL;

UPDATE "CycleDay" SET bbt = (bbt - 32) * 5.0 / 9.0 WHERE bbt IS NOT NULL;
EOF
```

Apply via Wasp's standard migration flow:

```bash
cd app
wasp db migrate-dev
```

Prisma sees the new pending migration, runs it, and records it in `_prisma_migrations`. Output should show one applied migration. Because Prisma tracks it, the SQL cannot accidentally run twice in normal flow — running again is a no-op.

> **Why a hand-written migration:** the spec/plan changed the *interpretation* of `bbt`, not its column type. Prisma compares schema-to-DB structure, so it correctly sees no structural change. Adding the migration directory by hand registers the data-only change in Prisma's migration history.

## Step 4: Verification — the diff that proves UI-visible equivalence

This compares the snapshot from Step 1 against the new state row-by-row. For each row, it reconstructs the display values from the new storage and asks "does this match what the UI was showing before?"

```sql
SELECT
  COUNT(*)                                                     AS total_rows,
  COUNT(*) FILTER (
    WHERE s.display_f_before
        = ROUND((c.bbt * 9.0 / 5.0 + 32)::numeric, 2)
      AND s.display_c_before
        = ROUND(c.bbt::numeric, 2)
  )                                                            AS rows_with_matching_display,
  COUNT(*) FILTER (
    WHERE s.display_f_before
        != ROUND((c.bbt * 9.0 / 5.0 + 32)::numeric, 2)
       OR s.display_c_before
        != ROUND(c.bbt::numeric, 2)
  )                                                            AS rows_with_mismatched_display
FROM _bbt_migration_snapshot s
JOIN "CycleDay" c USING (id);
```

**Pass criterion:** `total_rows = rows_with_matching_display = 131` and `rows_with_mismatched_display = 0`.

If any row mismatches, drill in:

```sql
SELECT
  s.id,
  s.stored_before,
  c.bbt                                          AS stored_after,
  s.display_f_before,
  ROUND((c.bbt * 9.0 / 5.0 + 32)::numeric, 2)    AS display_f_after,
  s.display_c_before,
  ROUND(c.bbt::numeric, 2)                       AS display_c_after
FROM _bbt_migration_snapshot s
JOIN "CycleDay" c USING (id)
WHERE s.display_f_before != ROUND((c.bbt * 9.0 / 5.0 + 32)::numeric, 2)
   OR s.display_c_before != ROUND(c.bbt::numeric, 2);
```

## Step 5: Sanity counts

Confirm row counts haven't changed and the new value range is sensible.

```sql
SELECT
  COUNT(*)                                        AS total_rows_after,
  COUNT(bbt)                                      AS non_null_bbt_after,
  MIN(bbt)                                        AS min_bbt_after,
  MAX(bbt)                                        AS max_bbt_after,
  AVG(bbt)::numeric(10,4)                         AS avg_bbt_after,
  (SELECT COUNT(*) FROM _bbt_migration_snapshot)  AS snapshot_count
FROM "CycleDay";
```

**Pass criterion:**

- `total_rows_after` matches the pre-migration `total_rows` from Step 0.
- `non_null_bbt_after` matches `snapshot_count` (= 131).
- `min/max/avg` are now in the `36 – 38 °C` range (you can confirm by converting the Step 0 values: `36.13 / 37.20 / 36.72 °C` for `97.034 / 98.96 / 98.09 °F`).

## Step 6: Spot check (optional eyeball confirmation)

Pull 5 random rows in before/after form and read across:

```sql
SELECT
  s.id,
  s.stored_before                                AS f_stored_before,
  c.bbt                                          AS c_stored_after,
  s.display_f_before                             AS would_show_F,
  ROUND((c.bbt * 9.0 / 5.0 + 32)::numeric, 2)    AS now_shows_F,
  s.display_c_before                             AS would_show_C,
  ROUND(c.bbt::numeric, 2)                       AS now_shows_C
FROM _bbt_migration_snapshot s
JOIN "CycleDay" c USING (id)
ORDER BY random()
LIMIT 5;
```

You read the four `would_show / now_shows` columns and confirm they match pairwise. Step 4 already proved this for all rows; this is just a human-readable confirmation.

## Step 7: Application smoke test

With the migration applied, start the app and open a cycle's chart:

```bash
cd app
wasp start
```

Confirm:

- The chart Y-axis is in °C (your display preference) and the points sit where they always did.
- The cover line, if any, is in the same place as before — labeled in °C.
- Editing an existing day shows the same BBT value in the input as it always did.
- Switching settings to Fahrenheit and reloading the chart shows everything in °F at consistent positions.

If anything looks off, the snapshot table is still in the DB — you can compare specific rows side-by-side in Prisma Studio against the chart's rendering.

## Step 8: Cleanup

Once Steps 4–7 all pass, drop the snapshot table:

```sql
DROP TABLE _bbt_migration_snapshot;
```

Keep `/tmp/cycle-path-pre-celsius-backup.sql` for at least one day in case any oddity surfaces post-deployment.

## What to do if something goes wrong

| Symptom | Likely cause | Action |
|---|---|---|
| Step 0 shows rows in bucket B (Celsius range) | Some path already wrote Celsius — possibly a partial earlier run, or test data | **STOP**. Investigate which rows. Do not run Step 3. Possibly handle those rows individually. |
| Step 4 reports `rows_with_mismatched_display > 0` | The migration math diverged from the application's display math on some specific value | **STOP**. Run the drill-in query and inspect. Most likely culprit: a stored value with very unusual precision artefacts. Restore from `pg_dump` and consult before retrying. |
| Step 5 row count differs | The migration also touched rows it shouldn't have, or another writer ran during the migration | **STOP**. Restore from `pg_dump`. Confirm no concurrent writes (`wasp start` was not running). Retry. |
| App shows wrong values after Step 7 | The migration ran twice somehow (Prisma history corruption), or the worktree's branch isn't at HEAD of `feat/celsius-storage-migration` | Check `_prisma_migrations` — should have exactly one row matching `…_backfill_bbt_to_celsius`. If two, restore from `pg_dump`. |

### Restoring from `pg_dump`

```bash
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  < /tmp/cycle-path-pre-celsius-backup.sql
```

This wipes the current state and replaces it with the pre-migration dump — safe rollback. After restoring, also delete the migration file you created in Step 3 and remove the corresponding row from `_prisma_migrations` so Prisma doesn't think it's already applied:

```sql
DELETE FROM _prisma_migrations WHERE migration_name LIKE '%backfill_bbt_to_celsius%';
```

## Why this approach is safe

- **One-shot, deterministic.** The same input row always produces the same output row. No timestamps, no random IDs, no external state.
- **NULL-safe.** The `WHERE bbt IS NOT NULL` clause skips NULL rows; the column's nullability is preserved.
- **Prisma-tracked.** Recorded in `_prisma_migrations`, so it cannot run twice in normal flow.
- **Verification proves UI equivalence.** Step 4 mathematically demonstrates that what the user sees on the chart and form is identical before and after, for every row. Not a spot check — every row.
- **Reversible at the SQL level.** The reverse SQL is a one-liner (`bbt = bbt * 9.0 / 5.0 + 32`), and `pg_dump` provides a deeper safety net.

## Why "engine internal floats" don't break

The engine works at full float precision (`THRESHOLD_C = 0.2`). Round-tripping `97.7 °F → 36.5 °C → 97.7 °F` introduces ~1e-13 °C of float drift. That's `0.0000000000001 °C` — millions of times smaller than the engine's `0.2 °C` threshold and trillions of times smaller than thermometer resolution. So engine outputs (cover line, thermal-shift verdicts, fingerprint) for any realistic input are identical before and after.
