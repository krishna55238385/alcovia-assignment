-- Tile: GTM > New students (first enrollment starting in period, by plan, vs pro-rated target)
with first_enrollment as (
  select distinct on (student_id) student_id, plan, start_date
  from enrollments
  order by student_id, start_date, id
),
target as (
  select sum(new_students_target) as new_students_target
  from v_targets_daily
  where date between :'start_date'::date and :'end_date'::date
)
select count(f.student_id)                                                as new_students,
       count(f.student_id) filter (where f.plan = 'trial_3m')             as new_trial,
       count(f.student_id) filter (where f.plan = 'full_program')         as new_full,
       round(t.new_students_target, 1)                                    as new_students_target,
       round(100.0 * count(f.student_id) / nullif(t.new_students_target, 0), 1) as pct_of_target
from target t
left join first_enrollment f on f.start_date between :'start_date'::date and :'end_date'::date
group by t.new_students_target;
