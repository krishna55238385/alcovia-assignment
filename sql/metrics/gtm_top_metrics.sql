-- Tile: GTM > Top metrics (CPQL, program conversion %, organic leads, avg journey days signed vs dropped)
with spend as (
  select coalesce(sum(spend), 0) as meta_spend
  from ad_daily
  where date between :'start_date'::date and :'end_date'::date
),
qualified as (   -- Meta-sourced leads qualified in period (CPQL denominator)
  select count(*) as meta_qualified
  from leads
  where source = 'meta'
    and ist_date(qualified_at) between :'start_date'::date and :'end_date'::date
),
cohort as (      -- leads created in period (conversion + organic)
  select count(*)                                            as leads,
         count(*) filter (where outcome in ('trial','full')) as signed,
         count(*) filter (where source = 'organic')          as organic_leads,
         count(*) filter (where source = 'referral')         as referral_leads
  from leads
  where ist_date(created_at) between :'start_date'::date and :'end_date'::date
),
journey as (     -- leads closed in period
  select round(avg(days_in_funnel) filter (where is_signed), 1)  as avg_days_signed,
         round(avg(days_in_funnel) filter (where is_dropped), 1) as avg_days_dropped
  from v_lead_funnel
  where ist_date(closed_at) between :'start_date'::date and :'end_date'::date
)
select s.meta_spend,
       q.meta_qualified,
       round(s.meta_spend / nullif(q.meta_qualified, 0), 0) as cpql,
       c.leads,
       c.signed,
       round(100.0 * c.signed / nullif(c.leads, 0), 1)      as program_conversion_pct,
       c.organic_leads,
       c.referral_leads,
       j.avg_days_signed,
       j.avg_days_dropped
from spend s, qualified q, cohort c, journey j;
