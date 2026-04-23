## Plan

1) Extend data model (`app/schema.prisma`) with `MenstrualFlow` enum (Spotting/Light/Medium/Heavy/VeryHeavy) and optional `menstrualFlow` on `CycleDay`; create migration.
2) Backend: update `app/src/cycle-tracking/operations.ts` `createOrUpdateCycleDay` args and create/update paths to handle optional menstrualFlow.
3) UI: add “Menstrual Flow” section before “Cervical Fluid” on `app/src/cycle-tracking/AddCycleDayPage.tsx` using existing single-select checkbox chips; add Spotting tooltip with constrained rectangular popover; wire state/prefill/reset and submit payload.
4) Regression: ensure save/edit works with/without flow value; run lint/tests if available.
