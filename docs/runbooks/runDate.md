# runDate Standard (KST)

## Definition

- `runDate` is always a **KST (UTC+9)** day key string in the form `YYYY-MM-DD`.
- This is the canonical day partition key for:
  - pipeline runs
  - taskRuns filters
  - costDaily aggregation keys

## Why

Ops users may open the dashboard from non-KST timezones (e.g. US). If the UI defaults to local date, it can show 0 rows / 0 cost even though KST day activity exists.

## Implementation Notes

- Use `packages/shared/kstDayKey.ts` in both Functions and Web.
- In Web (`/ops`), default date must be `kstDayKey(new Date())` and UI should label that `runDate` is KST-based.

