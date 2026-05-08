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
