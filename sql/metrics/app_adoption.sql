-- Tile: Students > App adoption (avg minutes/student/day, DAU/WAU stickiness, minutes by feature; 'all' row = totals)
-- DAU/WAU uses the last 7 days of the period: avg daily actives / distinct actives in those 7 days.
with sess as (
  select student_id, feature, ist_date(started_at) as day, duration_s
  from app_sessions
  where ist_date(started_at) between :'start_date'::date and :'end_date'::date
),
student_days as (   -- enrolled student-days in period (denominator for minutes/student/day)
  select count(*) as n
  from v_student_daily
  where date between :'start_date'::date and :'end_date'::date
),
agg as (
  select coalesce(feature, 'all')                                                     as feature,
         grouping(feature)                                                            as is_total,
         sum(duration_s) / 60.0                                                       as minutes,
         count(distinct (student_id, day)) filter (where day > :'end_date'::date - 7) / 7.0 as dau_7d,
         count(distinct student_id)        filter (where day > :'end_date'::date - 7) as wau
  from sess
  group by rollup (feature)
)
select a.feature,
       round(a.minutes, 0)                                                          as total_minutes,
       round(100.0 * a.minutes / nullif(sum(a.minutes) filter (where a.is_total = 0) over (), 0), 1)
                                                                                    as pct_of_minutes,
       round(a.minutes / nullif(sd.n, 0), 1)                                        as avg_min_per_student_day,
       round(a.dau_7d, 1)                                                           as dau,
       a.wau,
       round(100.0 * a.dau_7d / nullif(a.wau, 0), 1)                                as dau_wau_pct
from agg a
cross join student_days sd
order by a.is_total desc, a.minutes desc;
