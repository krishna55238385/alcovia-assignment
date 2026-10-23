-- Tile: GTM > Campaign health (per creative: CTR, 7d frequency, CPQL, SCALE/REFRESH/KILL/HOLD flag)
-- Flag rules live in views.sql::creative_health() so this tile and n8n workflow 03 share one definition.
select campaign_name, objective, creative_name, format,
       spend, impressions, clicks, ctr_pct, frequency_7d,
       qualified_leads, conversions, cpql, campaign_median_cpql,
       flag, reason
from creative_health(:'start_date'::date, :'end_date'::date)
order by case flag when 'KILL' then 1 when 'REFRESH' then 2 when 'SCALE' then 3 else 4 end, spend desc;
