-- Tile: GTM > RCA actions (scale / refresh / kill list with reason and next step)
select flag as action,
       campaign_name,
       creative_name,
       reason,
       case flag
         when 'KILL'    then 'Pause today; move budget to SCALE creatives in the same campaign'
         when 'REFRESH' then 'Ship a new hook/thumbnail within 3 days; widen audience if frequency-led'
         when 'SCALE'   then 'Raise daily budget 20% (max once per 3 days); clone to a new audience'
       end  as next_step,
       spend, qualified_leads, cpql, frequency_7d, ctr_pct
from creative_health(:'start_date'::date, :'end_date'::date)
where flag <> 'HOLD'
order by case flag when 'KILL' then 1 when 'REFRESH' then 2 else 3 end, spend desc;
