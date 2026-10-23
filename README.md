# Alcovia: Product, Systems & Analytics Lead assignment

Krishna Prasad · October 2026

| | Link |
|---|---|
| Executive writeup | [docs/writeup.pdf](docs/writeup.pdf) · [web version](https://alcovia-ops.vercel.app/writeup.html) |
| GTM tracker (live) | https://alcovia-ops.vercel.app/gtm.html |
| Student tracker (live) | https://alcovia-ops.vercel.app/students.html |

All dashboard numbers are dummy data generated in the browser from row-level records, so every timeline, pod and advisor filter recalculates for real.

## What's here

```
docs/        Executive writeup (HTML + PDF)
dashboard/   GTM tracker + student tracker (static HTML/JS, Chart.js), deployed on Vercel
sql/         Postgres / Supabase schema, views, one metric query per dashboard tile
n8n/         Importable n8n workflows that feed the store from ClickUp, Razorpay, Meta Ads and the app
```

## How the system fits together

```
Meta Ads API ─┐
ClickUp (Leads, advisor forms) ─┤
Razorpay webhooks ─┼─ n8n ──> Supabase (Postgres) ──> SQL views ──> Dashboards
App events, Focus, Quiz ─┤                         └─> Alerts: ClickUp tasks, WhatsApp to parents
Apple Health / Health Connect / WHOOP ─┘
```

Principles:
- **One lead ID from ad to payment.** Revenue can be traced back to the campaign that produced it.
- **Nobody types into a dashboard.** Every number comes from a system event or a short structured form.
- **Every number is one query you can audit.** See `sql/metrics/`.
- **Every workflow logs each run and alerts on failure** (`ingest_log`, n8n error workflow).

## Run the dashboards locally

```bash
npx serve dashboard
```
