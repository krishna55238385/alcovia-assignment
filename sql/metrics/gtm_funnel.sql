-- Tile: GTM > Lead funnel (cohort = leads created in period; stage flags are cumulative, see v_lead_funnel)
-- Show-up rate = step_conversion_pct on 'discovery_showed'; ambition drop-off = step_dropoff_pct on 'ambition_interview'.
with cohort as (
  select * from v_lead_funnel
  where created_date between :'start_date'::date and :'end_date'::date
),
counts as (
  select count(*)                                            as leads,
         count(*) filter (where reached_qualified)           as qualified,
         count(*) filter (where reached_discovery_set)       as discovery_set,
         count(*) filter (where reached_discovery_showed)    as discovery_showed,
         count(*) filter (where reached_ambition_interview)  as ambition_interview,
         count(*) filter (where reached_architect_session)   as architect_session,
         count(*) filter (where is_signed)                   as signed
  from cohort
),
stages as (
  select s.ord, s.stage, s.n
  from counts c
  cross join lateral (values (1, 'lead',               c.leads),
                             (2, 'qualified',          c.qualified),
                             (3, 'discovery_set',      c.discovery_set),
                             (4, 'discovery_showed',   c.discovery_showed),
                             (5, 'ambition_interview', c.ambition_interview),
                             (6, 'architect_session',  c.architect_session),
                             (7, 'signed',             c.signed)) s(ord, stage, n)
)
select ord, stage, n,
       round(100.0 * n / nullif(lag(n) over (order by ord), 0), 1)         as step_conversion_pct,
       round(100 - 100.0 * n / nullif(lag(n) over (order by ord), 0), 1)   as step_dropoff_pct,
       round(100.0 * n / nullif(first_value(n) over (order by ord), 0), 1) as pct_of_leads
from stages
order by ord;
