-- Tile: Students > Quantity (did Alcovia conduct it: scheduled vs conducted by activity type)
select coalesce(a.type, 'all')                                                     as activity_type,
       count(*)                                                                    as scheduled,
       count(*) filter (where a.conducted_at is not null)                          as conducted,
       count(*) filter (where a.conducted_at is null and a.scheduled_at < now())   as missed,
       round(100.0 * count(*) filter (where a.conducted_at is not null) / nullif(count(*), 0), 1)
                                                                                   as conducted_pct
from activities a
where ist_date(a.scheduled_at) between :'start_date'::date and :'end_date'::date
group by rollup (a.type)
order by grouping(a.type), a.type;
