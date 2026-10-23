-- Tile: Students > Performance (per-student KPI table: focus, quiz, timetable, tasks, readiness, pace, exams, wearables)
with daily as (
  select student_id,
         sum(focus_minutes)                  as focus_min,
         round(avg(focus_minutes), 1)        as focus_min_per_day,
         round(avg(timetable_adherence), 1)  as timetable_adherence_pct,
         round(avg(sleep_hours), 1)          as avg_sleep_h,
         round(avg(active_min), 0)           as avg_active_min
  from v_student_daily
  where date between :'start_date'::date and :'end_date'::date
  group by 1
),
quiz as (        -- weighted by marks, not an average of daily percentages
  select a.student_id, round(100.0 * sum(a.score) / nullif(sum(a.total), 0), 1) as quiz_pct, count(*) as quizzes_taken
  from quiz_attempts a
  join quizzes q on q.id = a.quiz_id
  where q.quiz_date between :'start_date'::date and :'end_date'::date
  group by 1
),
task as (        -- tasks due in period
  select student_id,
         count(*)                                              as tasks_due,
         count(*) filter (where completed_at is not null)      as tasks_completed,
         count(*) filter (where completed_at <= due_at)        as tasks_on_time,
         avg(greatest(0, 1 - abs(actual_min - est_min)::numeric / est_min))
           filter (where completed_at is not null and actual_min is not null and est_min > 0)
                                                               as est_accuracy
  from tasks
  where ist_date(due_at) between :'start_date'::date and :'end_date'::date
  group by 1
),
ready as (
  select student_id,
         round(avg(readiness_score), 1)                                         as readiness_score,
         round(100.0 * sum(chapters_ready) / nullif(sum(chapters_total), 0), 1) as pct_chapters_ready,
         max(pace_target_pct)                                                   as pace_target_pct
  from v_chapter_readiness
  group by 1
),
exam as (        -- exams sat in period vs that student's target for the subject + exam type
  select r.student_id,
         count(*)                                               as exams,
         round(avg(r.score_pct - t.target_pct), 1)              as exam_vs_target_pp,
         count(*) filter (where r.score_pct < t.target_pct)     as exams_below_target
  from exam_results r
  join exam_targets t using (student_id, subject, exam_type)
  where r.exam_date between :'start_date'::date and :'end_date'::date
  group by 1
)
select s.id                                                                   as student_id,
       s.name                                                                 as student_name,
       adv.name                                                               as advisor_name,
       d.focus_min,
       d.focus_min_per_day,
       q.quiz_pct,
       q.quizzes_taken,
       d.timetable_adherence_pct,
       round(100.0 * t.tasks_completed / nullif(t.tasks_due, 0), 1)           as task_completion_pct,
       round(100.0 * t.tasks_on_time / nullif(t.tasks_completed, 0), 1)       as deadline_adherence_pct,
       round(100 * t.est_accuracy, 1)                                         as time_estimate_accuracy_pct,
       r.readiness_score,
       r.pct_chapters_ready,
       r.pace_target_pct,
       case when r.pct_chapters_ready is null              then 'no data'
            when r.pct_chapters_ready >= r.pace_target_pct then 'on pace'
            else 'behind' end                                                 as syllabus_pace,
       e.exam_vs_target_pp,
       e.exams_below_target,
       d.avg_sleep_h,
       d.avg_active_min
from students s
left join advisors adv on adv.id = s.advisor_id
left join daily d on d.student_id = s.id
left join quiz  q on q.student_id = s.id
left join task  t on t.student_id = s.id
left join ready r on r.student_id = s.id
left join exam  e on e.student_id = s.id
where s.joined_at <= :'end_date'::date
order by s.name;
