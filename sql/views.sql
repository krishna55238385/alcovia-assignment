-- Reusable views + two shared functions. Load after schema.sql.
-- Everything a dashboard tile or n8n alert needs is derived here, never in the BI layer.

-- Monthly targets spread evenly across days, so any date range gets a pro-rated target by SUM().
create or replace view v_targets_daily as
select d::date                                        as date,
       t.revenue_target / n.days                      as revenue_target,
       t.new_students_target::numeric / n.days        as new_students_target,
       t.workshop_seats_target::numeric / n.days      as workshop_seats_target
from monthly_targets t
cross join lateral (select ((t.month + interval '1 month')::date - t.month) as days) n
cross join lateral generate_series(t.month::timestamp, t.month + interval '1 month - 1 day', interval '1 day') d;

-- One row per lead. Stage flags are cumulative: reaching a later stage implies the earlier ones,
-- so a skipped ClickUp status can never produce a >100% step conversion.
create or replace view v_lead_funnel as
select l.id                                                   as lead_id,
       l.clickup_task_id,
       l.source,
       l.campaign_id,
       l.ad_id,
       l.teen_grade,
       l.created_at,
       ist_date(l.created_at)                                 as created_date,
       (l.outcome in ('trial','full') or coalesce(l.architect_session_at, l.ambition_interview_at,
         l.discovery_showed_at, l.discovery_set_at, l.qualified_at) is not null)          as reached_qualified,
       (l.outcome in ('trial','full') or coalesce(l.architect_session_at, l.ambition_interview_at,
         l.discovery_showed_at, l.discovery_set_at) is not null)                          as reached_discovery_set,
       (l.outcome in ('trial','full') or coalesce(l.architect_session_at, l.ambition_interview_at,
         l.discovery_showed_at) is not null)                                              as reached_discovery_showed,
       (l.outcome in ('trial','full') or coalesce(l.architect_session_at,
         l.ambition_interview_at) is not null)                                            as reached_ambition_interview,
       (l.outcome in ('trial','full') or l.architect_session_at is not null)              as reached_architect_session,
       l.outcome in ('trial','full')                          as is_signed,
       l.outcome = 'dropped'                                  as is_dropped,
       l.outcome,
       l.drop_reason,
       l.qualified_at,
       l.closed_at,
       round((extract(epoch from coalesce(l.closed_at, now()) - l.created_at) / 86400)::numeric, 1)
                                                              as days_in_funnel
from leads l;

-- Cash collected per IST day and stream: 'full_program' | 'trial_3m' | 'workshop'.
create or replace view v_revenue_daily as
select ist_date(i.paid_at) as date, e.plan as stream, sum(i.amount) as amount, count(*) as payments
from invoices i
join enrollments e on e.id = i.enrollment_id
where i.paid_at is not null
group by 1, 2
union all
select ist_date(b.paid_at), 'workshop', sum(b.amount), count(*)
from workshop_bookings b
group by 1;

-- Per creative per day: Meta delivery joined to CRM outcomes. CRM events are dated by when they
-- happened (lead created / qualified / signed), so a lead qualified after an ad paused still counts.
create or replace view v_creative_daily as
with lead_events as (
  select ad_id, date, sum(created) as crm_leads, sum(qualified) as qualified_leads, sum(signed) as signed_leads
  from (
    select ad_id, ist_date(created_at) as date, 1 as created, 0 as qualified, 0 as signed
    from leads where ad_id is not null
    union all
    select ad_id, ist_date(qualified_at), 0, 1, 0
    from leads where ad_id is not null and qualified_at is not null
    union all
    select ad_id, ist_date(coalesce(closed_at, created_at)), 0, 0, 1
    from leads where ad_id is not null and outcome in ('trial','full')
  ) e
  group by 1, 2
)
select coalesce(d.date, le.date)          as date,
       cr.id                              as ad_id,
       cr.name                            as creative_name,
       cr.format,
       cr.landing_page_id,
       c.id                               as campaign_id,
       c.name                             as campaign_name,
       c.objective,
       coalesce(d.spend, 0)               as spend,
       coalesce(d.impressions, 0)         as impressions,
       coalesce(d.reach, 0)               as reach,
       coalesce(d.clicks, 0)              as clicks,
       d.frequency,
       coalesce(d.leads, 0)               as meta_leads,
       coalesce(le.crm_leads, 0)          as crm_leads,
       coalesce(le.qualified_leads, 0)    as qualified_leads,
       coalesce(le.signed_leads, 0)       as signed_leads
from ad_daily d
full join lead_events le on le.ad_id = d.ad_id and le.date = d.date
join ad_creatives cr on cr.id = coalesce(d.ad_id, le.ad_id)
join campaigns c on c.id = cr.campaign_id;

-- One row per student per day since joining (zero-filled), so "no app open for 7 days" is a plain SUM.
create or replace view v_student_daily as
with spine as (
  select s.id as student_id, d::date as date
  from students s
  cross join lateral generate_series(s.joined_at::timestamp, ist_date(now())::timestamp, interval '1 day') d
),
app as (
  select student_id, ist_date(started_at) as date, sum(duration_s) / 60.0 as app_minutes
  from app_sessions group by 1, 2
),
focus as (
  select student_id, ist_date(started_at) as date, sum(actual_min) as focus_minutes
  from focus_sessions group by 1, 2
),
quiz as (
  select a.student_id, q.quiz_date as date, 100.0 * sum(a.score) / nullif(sum(a.total), 0) as quiz_pct
  from quiz_attempts a join quizzes q on q.id = a.quiz_id group by 1, 2
),
timetable as (   -- capped at 100% per block; 'free' blocks carry no commitment
  select student_id, date, 100.0 * sum(least(done_min, planned_min)) / nullif(sum(planned_min), 0) as timetable_adherence
  from timetable_blocks where kind <> 'free' group by 1, 2
),
wear as (        -- a student may sync two devices; average them
  select student_id, date, avg(active_min) as active_min, avg(sleep_hours) as sleep_hours, avg(recovery_pct) as recovery_pct
  from wearable_daily group by 1, 2
)
select sp.student_id,
       sp.date,
       round(coalesce(app.app_minutes, 0), 1)     as app_minutes,
       coalesce(focus.focus_minutes, 0)           as focus_minutes,
       round(quiz.quiz_pct, 1)                    as quiz_pct,
       round(timetable.timetable_adherence, 1)    as timetable_adherence,
       round(wear.active_min, 0)                  as active_min,
       round(wear.sleep_hours, 2)                 as sleep_hours,
       round(wear.recovery_pct, 1)                as recovery_pct
from spine sp
left join app       using (student_id, date)
left join focus     using (student_id, date)
left join quiz      using (student_id, date)
left join timetable using (student_id, date)
left join wear      using (student_id, date);

-- Readiness per student x subject. Score = avg(stage)/5*100.
-- Pace target: 25% of chapters at stage 5 per quarter (8.33%/month) counted from joined_at.
create or replace view v_chapter_readiness as
select c.student_id,
       s.name                                                                   as student_name,
       c.subject,
       count(*)                                                                 as chapters_total,
       count(*) filter (where c.stage = 5)                                      as chapters_ready,
       round(avg(c.stage) / 5.0 * 100, 1)                                       as readiness_score,
       round(100.0 * count(*) filter (where c.stage = 5) / count(*), 1)         as pct_ready,
       round(least(100, (ist_date(now()) - s.joined_at) / 30.4375 * 25.0 / 3), 1) as pace_target_pct,
       round(avg(c.practice_accuracy), 1)                                       as avg_practice_accuracy,
       round(avg(c.timed_pyq_accuracy), 1)                                      as avg_timed_pyq_accuracy,
       max(c.updated_at)                                                        as last_updated
from chapters c
join students s on s.id = c.student_id
group by c.student_id, s.name, c.subject, s.joined_at;

-- Creative flags (SPEC rules). Shared by gtm_campaign_health.sql, gtm_rca_actions.sql and the
-- daily Meta workflow so the dashboard and the alert can never disagree.
-- Precedence when several rules match: KILL > REFRESH > SCALE > HOLD.
create or replace function creative_health(p_start date, p_end date)
returns table (
  ad_id text, creative_name text, format text, campaign_id text, campaign_name text, objective text,
  spend numeric, impressions bigint, clicks bigint, ctr_pct numeric, frequency_7d numeric,
  qualified_leads bigint, conversions bigint, cpql numeric, campaign_median_cpql numeric,
  ctr_p25 numeric, flag text, reason text
)
language sql stable
as $$
with win as (
  select d.ad_id, d.creative_name, d.format, d.campaign_id, d.campaign_name, d.objective,
         sum(d.spend) as spend, sum(d.impressions)::bigint as impressions, sum(d.clicks)::bigint as clicks,
         sum(d.qualified_leads)::bigint as qualified_leads, sum(d.signed_leads)::bigint as signed_leads
  from v_creative_daily d
  where d.date between p_start and p_end
  group by 1, 2, 3, 4, 5, 6
),
-- 7-day frequency = impressions / reach over the 7 days ending p_end. Daily reach is not
-- de-duplicated across days, so this is a lower bound on Meta's true 7-day frequency.
freq as (
  select a.ad_id, sum(a.impressions)::numeric / nullif(sum(a.reach), 0) as frequency_7d
  from ad_daily a where a.date between p_end - 6 and p_end group by 1
),
bookings as (
  select l.ad_id, count(*)::bigint as n
  from workshop_bookings b join leads l on l.id = b.lead_id
  where l.ad_id is not null and ist_date(b.paid_at) between p_start and p_end
  group by 1
),
m as (
  select w.*, f.frequency_7d,
         w.signed_leads + coalesce(b.n, 0)                  as conversions,
         100.0 * w.clicks / nullif(w.impressions, 0)        as ctr_pct,
         w.spend / nullif(w.qualified_leads, 0)             as cpql
  from win w
  left join freq f on f.ad_id = w.ad_id
  left join bookings b on b.ad_id = w.ad_id
),
camp as (
  select m.campaign_id, percentile_cont(0.5) within group (order by m.cpql)::numeric as median_cpql
  from m group by 1
),
acct as (
  select percentile_cont(0.5)  within group (order by m.cpql)::numeric    as median_cpql,
         percentile_cont(0.25) within group (order by m.ctr_pct)::numeric as ctr_p25,
         count(m.ctr_pct)                                                  as n_with_ctr
  from m
)
select m.ad_id, m.creative_name, m.format, m.campaign_id, m.campaign_name, m.objective,
       m.spend, m.impressions, m.clicks,
       round(m.ctr_pct, 2), round(m.frequency_7d, 2), m.qualified_leads, m.conversions,
       round(m.cpql, 0), round(coalesce(c.median_cpql, a.median_cpql), 0), round(a.ctr_p25, 2),
       case
         when m.qualified_leads = 0 and m.spend > 2 * coalesce(c.median_cpql, a.median_cpql) then 'KILL'
         when m.frequency_7d >= 3 or (a.n_with_ctr >= 4 and m.ctr_pct <= a.ctr_p25)     then 'REFRESH'
         when m.cpql <= 0.8 * coalesce(c.median_cpql, a.median_cpql) and m.conversions > 0 then 'SCALE'
         else 'HOLD'
       end,
       case
         when m.qualified_leads = 0 and m.spend > 2 * coalesce(c.median_cpql, a.median_cpql)
           then format('Spent %s with 0 qualified leads (> 2x median CPQL %s)', round(m.spend), round(coalesce(c.median_cpql, a.median_cpql)))
         when m.frequency_7d >= 3
           then format('7-day frequency %s >= 3: audience fatigue', round(m.frequency_7d, 1))
         when a.n_with_ctr >= 4 and m.ctr_pct <= a.ctr_p25
           then format('CTR %s%% in bottom quartile (<= %s%%)', round(m.ctr_pct, 2), round(a.ctr_p25, 2))
         when m.cpql <= 0.8 * coalesce(c.median_cpql, a.median_cpql) and m.conversions > 0
           then format('CPQL %s <= 0.8x median %s with %s conversions', round(m.cpql), round(coalesce(c.median_cpql, a.median_cpql)), m.conversions)
         else 'Within normal range'
       end
from m
left join camp c on c.campaign_id = m.campaign_id
cross join acct a;
$$;

-- Student alerts as of a given IST day. One row per alert; alert_key is stable so the nightly
-- workflow can insert into alert_log ON CONFLICT DO NOTHING and only notify on new keys.
create or replace function student_alerts(p_as_of date)
returns table (alert_key text, student_id bigint, alert_type text, severity text, detail text)
language sql stable
as $$
-- 1. Task due in the last 14 days and not completed by end of p_as_of
select 'missed_deadline:' || t.id, t.student_id, 'missed_deadline', 'high',
       format('"%s" was due %s', t.title, to_char(t.due_at at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'))
from tasks t
where ist_date(t.due_at) between p_as_of - 13 and p_as_of
  and (t.completed_at is null or ist_date(t.completed_at) > p_as_of)

union all
-- 2. Subject behind the 8.33%/month syllabus pace (grace: first 30 days); re-raised weekly
select 'readiness_below_pace:' || r.student_id || ':' || r.subject || ':' || to_char(p_as_of, 'IYYY-"W"IW'),
       r.student_id, 'readiness_below_pace', 'high',
       format('%s: %s%% of chapters ready vs %s%% pace target (readiness %s)', r.subject, r.pct_ready, r.pace_target_pct, r.readiness_score)
from v_chapter_readiness r
join students s on s.id = r.student_id
where r.pct_ready < r.pace_target_pct
  and p_as_of - s.joined_at >= 30

union all
-- 3. No app session in the 7 days ending p_as_of
select 'no_app_7d:' || s.id || ':' || coalesce(last_open.d::text, 'never'),
       s.id, 'no_app_7d', 'medium',
       format('No app session since %s', coalesce(to_char(last_open.d, 'DD Mon'), 'joining'))
from students s
cross join lateral (
  select max(ist_date(a.started_at)) as d from app_sessions a
  where a.student_id = s.id and ist_date(a.started_at) <= p_as_of
) last_open
where s.joined_at <= p_as_of - 6
  and (last_open.d is null or last_open.d < p_as_of - 6)

union all
-- 4. Average sleep under 7h over the last 7 nights (needs >= 4 nights of wearable data); re-raised weekly
select 'low_sleep:' || d.student_id || ':' || to_char(p_as_of, 'IYYY-"W"IW'),
       d.student_id, 'low_sleep', 'medium',
       format('Avg sleep %sh over last 7 nights', round(avg(d.sleep_hours), 1))
from v_student_daily d
where d.date between p_as_of - 6 and p_as_of
group by d.student_id
having count(d.sleep_hours) >= 4 and avg(d.sleep_hours) < 7;
$$;

-- Supabase: keep reporting objects off the public API (anon/authenticated) unless a policy is added.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
    execute 'revoke execute on all functions in schema public from anon, authenticated';
  end if;
end $$;
