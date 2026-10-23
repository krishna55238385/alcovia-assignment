-- Tile: GTM > Revenue vs target (cash collected vs monthly target pro-rated by day)
-- psql -v start_date=2026-10-01 -v end_date=2026-10-31 -f gtm_revenue_vs_target.sql
with actual as (
  select coalesce(sum(amount), 0) as revenue
  from v_revenue_daily
  where date between :'start_date'::date and :'end_date'::date
),
target as (
  select sum(revenue_target) as revenue_target
  from v_targets_daily
  where date between :'start_date'::date and :'end_date'::date
)
select a.revenue,
       round(t.revenue_target, 0)                                as revenue_target,
       round(100.0 * a.revenue / nullif(t.revenue_target, 0), 1) as pct_of_target,
       round(a.revenue - coalesce(t.revenue_target, 0), 0)       as gap
from actual a cross join target t;
