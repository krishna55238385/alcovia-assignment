# n8n/

These are importable workflow exports (**Workflows → Import from file**). Every workflow is imported with `active: false`. After importing, attach the credentials below, set `00 Error alert` as the **Error workflow** in each workflow's settings, then activate. The workflow timezone is `Asia/Kolkata`.

| # | Workflow | Trigger | Reads from | Writes to | Alerts / actions |
|---|---|---|---|---|---|
| 00 | `00_error_alert.json` | Any workflow fails | n8n error payload | `ingest_log` (status `error`) | ClickUp task for the ops owner |
| 01 | `01_clickup_lead_stage_sync.json` | ClickUp status change in the Leads list | ClickUp task + custom fields | `leads` (upsert on `clickup_task_id`; first stage timestamp wins), `ingest_log` | On **Discovery set**: Smallest.ai reminder calls at T-24h and T-1h |
| 02 | `02_razorpay_payments.json` | Razorpay webhook: `payment.captured`, `invoice.paid`, `invoice.expired` | Signed webhook body | `workshop_bookings` (plus a `workshop` lead for first-time buyers), `invoices`, `enrollments` (trial → `renewed`), `ingest_log` | Returns 401 on a bad signature, 200 once stored |
| 03 | `03_meta_ads_daily_pull.json` | Daily 07:00 | Meta Graph API ad-level insights for yesterday | `campaigns`, `ad_creatives`, `ad_daily` (upsert on `date, ad_id`), `ingest_log` | Any creative flagged REFRESH or KILL by `creative_health()` → ClickUp task for the marketing owner |
| 04 | `04_student_daily_rollup_and_alerts.json` | Nightly 22:30 | `app_events` (sessions, focus, 8 pm quiz), wearable aggregator API | `app_sessions`, `focus_sessions`, `quiz_attempts`, `wearable_daily`, `alert_log`, `ingest_log` | Each new `student_alerts()` row → ClickUp task for the advisor. Parent WhatsApp template only for a missed deadline or readiness below pace, and only if the parent opted in |
| 05 | `05_weekly_advisor_digest.json` | Sunday 18:00 | `v_student_daily`, `student_alerts()`, `chapters`, `roadmap_milestones` | `ingest_log` | One ClickUp task per advisor, due Monday 10:00: students sorted by needs-attention, top 3 wins, top 3 risks |

**Credentials** (names only; no secrets are stored in the exports): `Supabase Postgres (n8n)` · `ClickUp API` · `Meta Marketing API` (facebookGraphApi, `ads_read`) · `Smallest.ai API key` (header auth) · `WhatsApp Cloud API token` (header auth, `Authorization: Bearer …`) · `Wearable aggregator API key` (header auth).

**Environment variables:** `RAZORPAY_WEBHOOK_SECRET`, `META_AD_ACCOUNT_ID`, `SMALLEST_API_BASE`, `SMALLEST_REMINDER_AGENT_ID`, `WA_PHONE_NUMBER_ID`, `WA_TEMPLATE_PARENT_ALERT`, `WEARABLE_API_BASE`, `CLICKUP_TEAM_ID`, `CLICKUP_SPACE_ID`, `CLICKUP_LEADS_LIST_ID`, `CLICKUP_ADVISOR_LIST_ID`, `CLICKUP_MARKETING_LIST_ID`, `CLICKUP_MARKETING_OWNER_ID`, `CLICKUP_OPS_LIST_ID`, `CLICKUP_OPS_OWNER_ID`. n8n itself also needs `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (for the Razorpay HMAC) and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.

**Reliability rules**
1. **Idempotent writes keyed on source IDs.** Each write uses `ON CONFLICT` on `clickup_task_id`, `razorpay_payment_id`, `razorpay_invoice_id`, `(date, ad_id)`, `(student_id, date, source)` or `source_event_id`. Re-runs, back-fills and webhook retries therefore never double-count.
2. **`ingest_log` on every run.** Successful runs log a row count, and failed runs are logged by `00 Error alert`. The dashboard shows "data as of" from this table.
3. **Error workflow → alert.** Any failure creates a ClickUp ops task the same day. Because a failed Razorpay run never returns 200, Razorpay re-delivers the event.
4. **Retries on external calls.** HTTP and ClickUp nodes retry 3 times with 5 s waits. Meta pagination is capped at 20 pages.
5. **One definition per rule.** Workflows call `creative_health()` and `student_alerts()` in SQL instead of re-implementing the logic in Code nodes. `alert_log` makes sure each alert reaches an advisor or parent once.
6. **Signed inputs only.** Razorpay payloads are checked with HMAC-SHA256 over the raw body using a constant-time compare.

Placeholders to confirm before going live: the Smallest.ai scheduling endpoint and payload, the wearable aggregator's response shape (`reference_id` = `students.id`), the WhatsApp template name and its three body variables, and the ClickUp status names in `Map status to funnel stage`.
