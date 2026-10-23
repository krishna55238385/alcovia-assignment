# sql/

Supabase (Postgres 15+) is the single system of record. n8n writes the tables and dashboards only read views and metric queries.

**Load:** `psql "$SUPABASE_DB_URL" -f schema.sql -f views.sql`. Both are plain DDL, so you can also paste them into the Supabase SQL editor in that order. RLS is on for every table and `anon`/`authenticated` have no grants, so nothing is exposed over the public API by default.

**Run a tile:** `psql "$SUPABASE_DB_URL" -v start_date=2026-10-01 -v end_date=2026-10-31 -f metrics/gtm_funnel.sql`. Dates are inclusive IST days (`ist_date()`). Snapshot tiles (unpaid invoices, trial renewals, alerts) treat `end_date` as "as of".

| Layer | What lives there |
|---|---|
| `schema.sql` | SPEC tables, plus `app_events` (raw telemetry), `ingest_log` (one row per n8n run) and `alert_log` (alert de-duplication). Source IDs (ClickUp, Meta, Razorpay, app event id) are `UNIQUE` so every write is an idempotent upsert. |
| `views.sql` | `v_lead_funnel`, `v_revenue_daily`, `v_creative_daily`, `v_student_daily`, `v_chapter_readiness`, and `v_targets_daily` (monthly targets spread across days so pro-rating is a `SUM`). Two functions: `creative_health(start, end)` and `student_alerts(as_of)`. |
| `metrics/*.sql` | One file per dashboard tile. The first line names the tile: `gtm_*` for the GTM dashboard, `student_*` / `app_adoption` for the Students dashboard. |

**Principle: every dashboard number is one query you can audit.** Every number on a tile comes from one file in `metrics/`. That file reads only from the views and functions above, so a disputed number can be traced from the tile to the file, then to the view, then to the raw rows. Flag and alert rules live in SQL functions, not in n8n or the BI layer. The Campaign health tile and the 07:00 Meta workflow both call `creative_health()`, and the Alerts tile and the nightly student workflow both call `student_alerts()`, so a dashboard and the alert built on the same rule can never disagree.

Additions beyond SPEC: `leads.parent_phone` and `leads.discovery_call_at` (voice reminders and payment matching), `students.parent_phone` and `students.parent_wa_opt_in` (WhatsApp consent), `advisors.clickup_user_id` (task assignee), and `source_event_id` on `app_sessions` / `focus_sessions` (rollup idempotency).
