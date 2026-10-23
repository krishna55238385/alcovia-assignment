-- Tile: GTM > Landing pages (drop-off, load speed, qualified leads and CPQL per page)
with traffic as (
  select landing_page_id,
         sum(sessions)     as sessions,
         sum(bounces)      as bounces,
         sum(form_starts)  as form_starts,
         sum(form_submits) as form_submits,
         round(sum(avg_load_ms::numeric * sessions) / nullif(sum(sessions), 0)) as avg_load_ms  -- session-weighted
  from lp_daily
  where date between :'start_date'::date and :'end_date'::date
  group by 1
),
crm as (
  select landing_page_id,
         sum(crm_leads)       as crm_leads,
         sum(qualified_leads) as qualified_leads,
         sum(spend)           as spend
  from v_creative_daily
  where date between :'start_date'::date and :'end_date'::date
  group by 1
)
select lp.name, lp.url, lp.objective,
       t.sessions,
       round(100.0 * t.bounces / nullif(t.sessions, 0), 1)            as bounce_rate_pct,
       round(100.0 * t.form_starts / nullif(t.sessions, 0), 1)        as form_start_rate_pct,
       round(100.0 * t.form_submits / nullif(t.form_starts, 0), 1)    as form_completion_pct,
       round(100 - 100.0 * t.form_submits / nullif(t.sessions, 0), 1) as dropoff_pct,
       t.avg_load_ms,
       t.avg_load_ms > 3000                                           as is_slow,
       coalesce(c.crm_leads, 0)                                       as crm_leads,
       coalesce(c.qualified_leads, 0)                                 as qualified_leads,
       round(c.spend / nullif(c.qualified_leads, 0), 0)               as cpql
from landing_pages lp
left join traffic t on t.landing_page_id = lp.id
left join crm c on c.landing_page_id = lp.id
order by t.sessions desc nulls last;
