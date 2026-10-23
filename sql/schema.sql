-- Alcovia system of record (Supabase / Postgres 15+).
-- Load order: schema.sql -> views.sql. Re-runnable only on an empty database.
-- Conventions: timestamps are timestamptz (UTC on disk); reporting days are IST via ist_date().
-- Source-system IDs (ClickUp, Meta, Razorpay) are UNIQUE so every n8n write is an idempotent upsert.

create or replace function ist_date(ts timestamptz) returns date
language sql immutable parallel safe
as $$ select (ts at time zone 'Asia/Kolkata')::date $$;

-- ---------------------------------------------------------------- GTM

create table monthly_targets (
  month                 date primary key check (month = date_trunc('month', month)::date),
  revenue_target        numeric(12,2) not null check (revenue_target >= 0),
  new_students_target   int not null default 0 check (new_students_target >= 0),
  workshop_seats_target int not null default 0 check (workshop_seats_target >= 0),
  created_at            timestamptz not null default now()
);

create table campaigns (
  id         text primary key,                       -- Meta campaign id
  name       text not null,
  objective  text not null check (objective in ('program','workshop')),
  status     text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now()
);

create table landing_pages (
  id         text primary key,                       -- slug, e.g. 'lp-program-v3'
  name       text not null,
  url        text not null unique,
  objective  text not null check (objective in ('program','workshop')),
  created_at timestamptz not null default now()
);

create table ad_creatives (
  id              text primary key,                  -- Meta ad id
  campaign_id     text not null references campaigns(id),
  name            text not null,
  format          text check (format in ('video','static','carousel')),
  landing_page_id text references landing_pages(id),
  created_at      timestamptz not null default now()
);
create index on ad_creatives (campaign_id);
create index on ad_creatives (landing_page_id);

create table ad_daily (
  date        date not null,
  ad_id       text not null references ad_creatives(id),
  spend       numeric(12,2) not null default 0 check (spend >= 0),
  impressions int not null default 0 check (impressions >= 0),
  reach       int not null default 0 check (reach >= 0),
  clicks      int not null default 0 check (clicks >= 0),
  leads       int not null default 0 check (leads >= 0),   -- Meta-reported; CRM truth lives in leads
  frequency   numeric(6,3),
  created_at  timestamptz not null default now(),
  primary key (date, ad_id)
);
create index on ad_daily (ad_id, date);

create table lp_daily (
  date            date not null,
  landing_page_id text not null references landing_pages(id),
  sessions        int not null default 0 check (sessions >= 0),
  bounces         int not null default 0 check (bounces >= 0),
  form_starts     int not null default 0 check (form_starts >= 0),
  form_submits    int not null default 0 check (form_submits >= 0),
  avg_load_ms     int check (avg_load_ms >= 0),
  created_at      timestamptz not null default now(),
  primary key (date, landing_page_id)
);

create table leads (
  id                    bigint generated always as identity primary key,
  created_at            timestamptz not null default now(),  -- ClickUp task date_created
  source                text not null check (source in ('meta','organic','referral','workshop')),
  campaign_id           text references campaigns(id),
  ad_id                 text references ad_creatives(id),
  clickup_task_id       text unique,
  parent_name           text,
  parent_phone          text,                                -- E.164; used for voice reminders + payment matching
  teen_grade            smallint check (teen_grade between 6 and 12),
  qualified_at          timestamptz,
  discovery_set_at      timestamptz,
  discovery_call_at     timestamptz,                         -- scheduled time of the discovery call
  discovery_showed_at   timestamptz,
  ambition_interview_at timestamptz,
  architect_session_at  timestamptz,
  outcome               text not null default 'open' check (outcome in ('open','trial','full','dropped')),
  closed_at             timestamptz,
  drop_reason           text,
  updated_at            timestamptz not null default now()
);
create index on leads (created_at);
create index on leads (campaign_id);
create index on leads (ad_id);
create index on leads (parent_phone);
create index on leads (outcome) where outcome <> 'open';

-- ---------------------------------------------------------------- Students

create table advisors (
  id              bigint generated always as identity primary key,
  name            text not null,
  clickup_user_id text unique,                               -- assignee for alert/digest tasks
  created_at      timestamptz not null default now()
);

create table pods (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  created_at timestamptz not null default now()
);

create table students (
  id               bigint generated always as identity primary key,
  name             text not null,
  grade            smallint check (grade between 6 and 12),
  pod_id           bigint references pods(id),
  advisor_id       bigint references advisors(id),
  joined_at        date not null,
  plan             text not null check (plan in ('trial_3m','full_program')),
  parent_phone     text,
  parent_wa_opt_in boolean not null default false,          -- WhatsApp template consent
  created_at       timestamptz not null default now()
);
create index on students (advisor_id);
create index on students (pod_id);

create table enrollments (
  id         bigint generated always as identity primary key,
  student_id bigint not null references students(id),
  lead_id    bigint references leads(id),
  plan       text not null check (plan in ('trial_3m','full_program')),
  start_date date not null,
  end_date   date not null,
  amount     numeric(12,2) not null check (amount >= 0),
  status     text not null default 'active' check (status in ('active','renewed','churned','completed')),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on enrollments (student_id);
create index on enrollments (lead_id);
create index on enrollments (end_date) where status = 'active';

create table invoices (
  id                  bigint generated always as identity primary key,
  enrollment_id       bigint not null references enrollments(id),
  issued_at           timestamptz not null default now(),
  due_at              timestamptz not null,
  amount              numeric(12,2) not null check (amount > 0),
  paid_at             timestamptz,
  status              text not null default 'unpaid' check (status in ('paid','unpaid','overdue')),
  razorpay_invoice_id text unique,
  created_at          timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null))
);
create index on invoices (enrollment_id);
create index on invoices (paid_at);
create index on invoices (due_at) where paid_at is null;

create table workshops (
  id             bigint generated always as identity primary key,
  date           date not null,
  title          text not null,
  seats_capacity int not null check (seats_capacity > 0),
  created_at     timestamptz not null default now()
);
create index on workshops (date);

create table workshop_bookings (
  id                  bigint generated always as identity primary key,
  workshop_id         bigint references workshops(id),
  lead_id             bigint references leads(id),
  razorpay_payment_id text not null unique,
  amount              numeric(12,2) not null default 3999 check (amount >= 0),
  paid_at             timestamptz not null,
  created_at          timestamptz not null default now()
);
create index on workshop_bookings (workshop_id);
create index on workshop_bookings (lead_id);
create index on workshop_bookings (paid_at);

-- Raw app telemetry. The app writes here directly; the nightly n8n rollup derives
-- app_sessions / focus_sessions / quiz_attempts from it (keyed on source_event_id).
create table app_events (
  id          bigint generated always as identity primary key,
  event_id    uuid unique,                                   -- client-generated, dedupes retries
  student_id  bigint not null references students(id),
  event_name  text not null,                                 -- session_end | focus_end | quiz_submit | ...
  feature     text,
  occurred_at timestamptz not null,
  props       jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
create index on app_events (occurred_at);
create index on app_events (student_id, occurred_at);
create index on app_events (event_name, occurred_at);

create table app_sessions (
  id              bigint generated always as identity primary key,
  student_id      bigint not null references students(id),
  started_at      timestamptz not null,
  duration_s      int not null check (duration_s >= 0),
  feature         text not null check (feature in
                    ('home','realm','focus','syllabus','planner','tasks','goals','wellness','quiz','other')),
  source_event_id bigint unique references app_events(id),
  created_at      timestamptz not null default now()
);
create index on app_sessions (student_id, started_at);
create index on app_sessions (started_at);

create table focus_sessions (
  id              bigint generated always as identity primary key,
  student_id      bigint not null references students(id),
  started_at      timestamptz not null,
  planned_min     int not null check (planned_min > 0),
  actual_min      int not null default 0 check (actual_min >= 0),
  completed       boolean not null default false,
  source_event_id bigint unique references app_events(id),
  created_at      timestamptz not null default now()
);
create index on focus_sessions (student_id, started_at);

create table quizzes (
  id         bigint generated always as identity primary key,
  quiz_date  date not null,                                  -- the 8 pm daily quiz
  topic      text not null,
  created_at timestamptz not null default now()
);
create index on quizzes (quiz_date);

create table quiz_attempts (
  quiz_id      bigint not null references quizzes(id),
  student_id   bigint not null references students(id),
  score        numeric(6,2) not null check (score >= 0),
  total        numeric(6,2) not null check (total > 0),
  submitted_at timestamptz not null,
  created_at   timestamptz not null default now(),
  primary key (quiz_id, student_id),
  check (score <= total)
);
create index on quiz_attempts (student_id);

create table timetable_blocks (
  id          bigint generated always as identity primary key,
  student_id  bigint not null references students(id),
  date        date not null,
  kind        text not null check (kind in ('self_study','tuition','extracurricular','free')),
  planned_min int not null check (planned_min >= 0),
  done_min    int not null default 0 check (done_min >= 0),
  created_at  timestamptz not null default now()
);
create index on timetable_blocks (student_id, date);

create table wearable_daily (
  student_id   bigint not null references students(id),
  date         date not null,
  source       text not null check (source in ('apple','samsung','whoop','garmin')),
  active_min   int check (active_min >= 0),
  strain       numeric(5,2),
  sleep_hours  numeric(4,2) check (sleep_hours between 0 and 24),
  recovery_pct numeric(5,2) check (recovery_pct between 0 and 100),
  created_at   timestamptz not null default now(),
  primary key (student_id, date, source)
);
create index on wearable_daily (date);

create table activities (
  id           bigint generated always as identity primary key,
  type         text not null check (type in ('academic_session','workshop','pod_session','peer_session',
                 'mentor_call','branding_shoot','podcast','competition_prep','parent_child','out_of_city')),
  title        text not null,
  scheduled_at timestamptz not null,
  conducted_at timestamptz,                                  -- null = not (yet) conducted
  host         text,
  pod_id       bigint references pods(id),
  created_at   timestamptz not null default now()
);
create index on activities (scheduled_at);
create index on activities (pod_id);

-- One row per invited student; attended=false for no-shows (denominator for attendance %).
create table activity_attendance (
  activity_id     bigint not null references activities(id),
  student_id      bigint not null references students(id),
  attended        boolean not null default false,
  rating          smallint check (rating between 1 and 5),
  would_recommend boolean,
  soft_skills     jsonb,
  created_at      timestamptz not null default now(),
  primary key (activity_id, student_id)
);
create index on activity_attendance (student_id);

create table chapters (
  id                 bigint generated always as identity primary key,
  student_id         bigint not null references students(id),
  subject            text not null,
  chapter            text not null,
  stage              smallint not null default 0 check (stage between 0 and 5),
  practice_accuracy  numeric(5,2) check (practice_accuracy between 0 and 100),
  timed_pyq_accuracy numeric(5,2) check (timed_pyq_accuracy between 0 and 100),
  updated_at         timestamptz not null default now(),
  unique (student_id, subject, chapter)
);

create table exam_targets (
  student_id bigint not null references students(id),
  subject    text not null,
  exam_type  text not null check (exam_type in ('formative','unit_test','mid_term','final')),
  target_pct numeric(5,2) not null check (target_pct between 0 and 100),
  created_at timestamptz not null default now(),
  primary key (student_id, subject, exam_type)
);

create table exam_results (
  student_id bigint not null references students(id),
  subject    text not null,
  exam_type  text not null check (exam_type in ('formative','unit_test','mid_term','final')),
  exam_date  date not null,
  score_pct  numeric(5,2) not null check (score_pct between 0 and 100),
  created_at timestamptz not null default now(),
  primary key (student_id, subject, exam_type, exam_date)
);
create index on exam_results (exam_date);

create table tasks (
  id           bigint generated always as identity primary key,
  student_id   bigint not null references students(id),
  title        text not null,
  source       text not null check (source in ('advisor','self')),
  due_at       timestamptz not null,
  est_min      int check (est_min > 0),
  actual_min   int check (actual_min >= 0),
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index on tasks (student_id, due_at);
create index on tasks (due_at) where completed_at is null;

create table roadmap_milestones (
  id         bigint generated always as identity primary key,
  student_id bigint not null references students(id),
  track      text not null check (track in ('career','personal','academic')),
  month      date not null,
  title      text not null,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on roadmap_milestones (student_id, month);

-- ---------------------------------------------------------------- Ops

-- One row per n8n run (success or failure). Dashboards show "data fresh as of".
create table ingest_log (
  id           bigint generated always as identity primary key,
  workflow     text not null,
  run_at       timestamptz not null default now(),
  rows         int not null default 0,
  status       text not null check (status in ('ok','partial','error','skipped')),
  error        text,
  execution_id text
);
create index on ingest_log (workflow, run_at desc);

-- Alerts already raised; the nightly workflow inserts with ON CONFLICT DO NOTHING
-- so an advisor/parent is pinged once per alert_key, not every night.
create table alert_log (
  alert_key  text primary key,
  student_id bigint not null references students(id),
  alert_type text not null,
  detail     text,
  as_of      date not null,
  created_at timestamptz not null default now()
);
create index on alert_log (student_id, created_at desc);

-- Supabase exposes the public schema over PostgREST: deny by default.
-- n8n connects as the database owner (bypasses RLS); views.sql revokes anon/authenticated grants.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
