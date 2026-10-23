-- Tile: Students > Quality (did Alcovians like it: attendance %, avg rating, % would recommend by type)
-- Denominators: attendance over invited rows; rating and recommend over attendees who answered.
select coalesce(a.type, 'all')                                                          as activity_type,
       count(distinct a.id)                                                             as activities,
       count(*)                                                                         as invited,
       round(100.0 * count(*) filter (where aa.attended) / nullif(count(*), 0), 1)      as attendance_pct,
       round(avg(aa.rating) filter (where aa.attended), 2)                              as avg_rating,
       round(100.0 * count(*) filter (where aa.attended and aa.would_recommend)
             / nullif(count(aa.would_recommend) filter (where aa.attended), 0), 1)      as pct_would_recommend
from activities a
join activity_attendance aa on aa.activity_id = a.id
where a.conducted_at is not null
  and ist_date(a.conducted_at) between :'start_date'::date and :'end_date'::date
group by rollup (a.type)
order by grouping(a.type), a.type;
