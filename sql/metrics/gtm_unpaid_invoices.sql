-- Tile: GTM > Unpaid invoices (open as of :end_date, ageing buckets on days past due)
with open_invoices as (
  select i.id as invoice_id, i.razorpay_invoice_id, s.name as student_name, e.plan, i.amount,
         ist_date(i.issued_at)                    as issued_on,
         ist_date(i.due_at)                       as due_on,
         :'end_date'::date - ist_date(i.due_at)   as days_past_due
  from invoices i
  join enrollments e on e.id = i.enrollment_id
  join students s on s.id = e.student_id
  where ist_date(i.issued_at) <= :'end_date'::date
    and (i.paid_at is null or ist_date(i.paid_at) > :'end_date'::date)
),
bucketed as (
  select o.*,
         case when days_past_due <= 0  then '0 not due'
              when days_past_due <= 15 then '1-15 days'
              when days_past_due <= 30 then '16-30 days'
              when days_past_due <= 60 then '31-60 days'
              else '60+ days' end as ageing_bucket
  from open_invoices o
)
select b.*,
       sum(amount) over (partition by ageing_bucket) as bucket_total,
       sum(amount) over ()                           as total_outstanding
from bucketed b
order by days_past_due desc, amount desc;
