-- Tile: GTM > Revenue split (program vs workshop; within program, trial vs full)
select case when stream = 'workshop' then 'workshop' else 'program' end           as line,
       stream,
       sum(amount)                                                                  as revenue,
       sum(payments)                                                                as payments,
       round(100.0 * sum(amount) / nullif(sum(sum(amount)) over (), 0), 1)          as pct_of_total,
       round(100.0 * sum(amount) / nullif(sum(sum(amount)) over (
               partition by case when stream = 'workshop' then 'workshop' else 'program' end), 0), 1)
                                                                                    as pct_of_line
from v_revenue_daily
where date between :'start_date'::date and :'end_date'::date
group by stream
order by line, stream;
