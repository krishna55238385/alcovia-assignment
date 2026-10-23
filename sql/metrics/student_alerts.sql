-- Tile: Students > Alerts (open alerts as of :end_date: missed deadlines, readiness below pace, no app 7 days, sleep < 7h)
-- Rules live in views.sql::student_alerts() so this tile and n8n workflow 04 share one definition.
select al.severity,
       al.alert_type,
       s.name     as student_name,
       adv.name   as advisor_name,
       p.name     as pod,
       al.detail,
       al.alert_key
from student_alerts(:'end_date'::date) al
join students s on s.id = al.student_id
left join advisors adv on adv.id = s.advisor_id
left join pods p on p.id = s.pod_id
order by case al.severity when 'high' then 1 else 2 end, al.alert_type, s.name;
