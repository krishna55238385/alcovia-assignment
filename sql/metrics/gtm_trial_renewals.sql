-- Tile: GTM > Trial renewals (3-month trials ending within 30 days of :end_date + 14-day engagement signal)
with ending as (
  select e.id as enrollment_id, e.student_id, s.name as student_name, a.name as advisor_name,
         e.end_date,
         e.end_date - :'end_date'::date as days_left,
         exists (select 1 from enrollments n
                 where n.student_id = e.student_id and n.plan = 'full_program'
                   and n.start_date >= e.start_date and n.id <> e.id) as already_upgraded
  from enrollments e
  join students s on s.id = e.student_id
  left join advisors a on a.id = s.advisor_id
  where e.plan = 'trial_3m'
    and e.status = 'active'
    and e.end_date between :'end_date'::date and :'end_date'::date + 30
),
engagement as (
  select d.student_id,
         count(*) filter (where d.app_minutes > 0) as active_days_14d,
         round(avg(d.app_minutes), 1)               as avg_app_min,
         round(avg(d.focus_minutes), 1)             as avg_focus_min,
         round(avg(d.quiz_pct), 1)                  as avg_quiz_pct,
         round(avg(d.timetable_adherence), 1)       as avg_timetable_adherence
  from v_student_daily d
  where d.date between :'end_date'::date - 13 and :'end_date'::date
  group by d.student_id
)
select en.*, g.active_days_14d, g.avg_app_min, g.avg_focus_min, g.avg_quiz_pct, g.avg_timetable_adherence,
       case when en.already_upgraded                                          then 'upgraded'
            when g.active_days_14d >= 10 and coalesce(g.avg_quiz_pct, 0) >= 60 then 'high'
            when g.active_days_14d >= 5                                       then 'medium'
            else 'low' end                                                    as renewal_signal
from ending en
left join engagement g using (student_id)
order by en.days_left;
