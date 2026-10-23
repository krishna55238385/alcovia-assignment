/* GTM tracker: every aggregate is recomputed from row-level data for the selected range. */
(function () {
  'use strict';
  var D = window.ALDATA, AL = window.AL, C = AL.C;
  var srcFilter = 'all', objFilter = 'all';

  // ---------- indexes ----------
  var ENR = {}, AD = {}, CAMP = {}, LPN = {}, STU = {}, ADV = {}, TGT = {};
  D.enrollments.forEach(function (e) { ENR[e.id] = e; });
  D.ad_creatives.forEach(function (a) { AD[a.id] = a; });
  D.campaigns.forEach(function (c) { CAMP[c.id] = c; });
  D.landing_pages.forEach(function (l) { LPN[l.id] = l; });
  D.students.forEach(function (s) { STU[s.id] = s; });
  D.advisors.forEach(function (a) { ADV[a.id] = a.name; });
  D.monthly_targets.forEach(function (m) { TGT[m.month.slice(0, 7)] = m; });
  var LEAD = {}; D.leads.forEach(function (l) { LEAD[l.id] = l; });
  function signed(l) { return l.outcome === 'trial' || l.outcome === 'full'; }
  function short(s, n) { n = n || 26; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // ---------- metric functions ----------
  function revenue(f, t) {
    var r = { full: 0, trial: 0, workshop: 0, seats: 0 };
    D.invoices.forEach(function (iv) {
      if (!AL.inR(iv.paid_at, f, t)) return;
      r[ENR[iv.enrollment_id].plan === 'trial_3m' ? 'trial' : 'full'] += iv.amount;
    });
    D.workshop_bookings.forEach(function (b) { if (AL.inR(b.paid_at, f, t)) { r.workshop += b.amount; r.seats++; } });
    r.program = r.full + r.trial; r.total = r.program + r.workshop;
    return r;
  }
  function dailyTarget(iso) {
    var m = TGT[iso.slice(0, 7)];
    return m ? m.revenue_target / AL.days(AL.monthStart(iso), AL.monthEnd(iso)) : 0;
  }
  function target(f, t) { var s = 0; for (var n = AL.dn(f); n <= AL.dn(t); n++) s += dailyTarget(AL.ds(n)); return s; }
  function newStudents(f, t) {
    var r = { full: 0, trial: 0, upgrades: 0 };
    D.enrollments.forEach(function (e) {
      if (!AL.inR(e.start_date, f, t)) return;
      if (e.renewal_of) r.upgrades++;
      else if (e.lead_id) r[e.plan === 'trial_3m' ? 'trial' : 'full']++;
    });
    r.total = r.full + r.trial;
    return r;
  }
  function unpaid(asOf) {
    var rows = D.invoices.filter(function (iv) { return iv.issued_at <= asOf && (!iv.paid_at || iv.paid_at > asOf); });
    return { rows: rows, amount: AL.sum(rows, function (r) { return r.amount; }), n: rows.length,
      overdue: rows.filter(function (r) { return r.due_at < asOf; }).length };
  }
  function renewalsDue(asOf) {
    var lim = AL.add(asOf, 30);
    return D.enrollments.filter(function (e) { return e.plan === 'trial_3m' && e.start_date <= asOf && e.end_date > asOf && e.end_date <= lim; });
  }
  function metaSpend(f, t) { return AL.sum(D.ad_daily.filter(function (r) { return AL.inR(r.date, f, t); }), function (r) { return r.spend; }); }
  function cpql(f, t) {
    var q = D.leads.filter(function (l) { return l.source === 'meta' && AL.inR(l.qualified_at, f, t); }).length;
    return AL.div(metaSpend(f, t), q);
  }
  function cohort(f, t, src) {
    return D.leads.filter(function (l) { return AL.inR(l.created_at, f, t) && (!src || src === 'all' || l.source === src); });
  }
  function progConv(f, t, src) { var c = cohort(f, t, src); return AL.div(c.filter(signed).length, c.length); }
  function journey(f, t, src) {
    var s = [], d = [];
    D.leads.forEach(function (l) {
      if (!AL.inR(l.closed_at, f, t) || (src && src !== 'all' && l.source !== src)) return;
      var days = AL.dn(l.closed_at) - AL.dn(l.created_at);
      (signed(l) ? s : d).push(days);
    });
    return { signed: s.length ? AL.sum(s) / s.length : null, dropped: d.length ? AL.sum(d) / d.length : null, ns: s.length, nd: d.length };
  }

  // engagement signal for a student as of a date (app minutes, last open, attendance)
  var APP_BY_STU = {};
  D.app_sessions.forEach(function (a) { (APP_BY_STU[a.student_id] = APP_BY_STU[a.student_id] || []).push(a); });
  function engagement(studentId, asOf) {
    var st = STU[studentId];
    if (!st) return null;
    var from = AL.add(asOf, -13), sec = 0, last = null;
    (APP_BY_STU[studentId] || []).forEach(function (a) {
      if (a.started_at <= asOf && (!last || a.started_at > last)) last = a.started_at;
      if (AL.inR(a.started_at, from, asOf)) sec += a.duration_s;
    });
    var effFrom = AL.maxD(from, st.joined_at);
    var days = Math.max(1, AL.days(effFrom, asOf));
    var minPerDay = sec / 60 / days;
    var lastAgo = last ? AL.dn(asOf) - AL.dn(last) : null;
    var att = D.activity_attendance.filter(function (r) { return r.student_id === studentId && AL.inR(r.date, AL.add(asOf, -29), asOf); });
    var attPct = AL.div(att.filter(function (r) { return r.attended; }).length, att.length);
    var level = (minPerDay < 1.5 || lastAgo == null || lastAgo > 7 || (attPct != null && attPct < 0.7)) ? 'r' : minPerDay < 2.5 ? 'a' : 'g';
    return { min: minPerDay, lastAgo: lastAgo, att: attPct, level: level, advisor: ADV[st.advisor_id] };
  }

  // ---------- creatives ----------
  function creativeStats(f, t) {
    var S = {};
    D.ad_creatives.forEach(function (a) {
      S[a.id] = { id: a.id, ad: a, name: a.name, campaign: CAMP[a.campaign_id], objective: CAMP[a.campaign_id].objective, lp: LPN[a.landing_page_id],
        spend: 0, imp: 0, clicks: 0, leads: 0, q: 0, signed: 0, seats: 0, days: [] };
    });
    D.ad_daily.forEach(function (r) {
      if (!AL.inR(r.date, f, t)) return;
      var s = S[r.ad_id]; s.spend += r.spend; s.imp += r.impressions; s.clicks += r.clicks; s.leads += r.leads; s.days.push(r);
    });
    D.leads.forEach(function (l) {
      if (!l.ad_id) return;
      var s = S[l.ad_id];
      if (AL.inR(l.qualified_at, f, t)) s.q++;
      if (signed(l) && AL.inR(l.closed_at, f, t)) s.signed++;
    });
    D.workshop_bookings.forEach(function (b) {
      var l = LEAD[b.lead_id];
      if (l && l.ad_id && AL.inR(b.paid_at, f, t)) S[l.ad_id].seats++;
    });
    var rows = Object.keys(S).map(function (k) { return S[k]; }).filter(function (s) { return s.spend > 0; });
    // launch CTR = first 14 days of the creative's life (all data)
    var launch = {};
    D.ad_daily.forEach(function (r) {
      var a = AD[r.ad_id];
      if (AL.dn(r.date) - AL.dn(a._s) < 14) { var x = launch[r.ad_id] || (launch[r.ad_id] = { c: 0, i: 0 }); x.c += r.clicks; x.i += r.impressions; }
    });
    rows.forEach(function (s) {
      s.ctr = AL.div(s.clicks, s.imp);
      s.cpql = AL.div(s.spend, s.q);
      s.conv = AL.div(s.signed, s.leads);
      var last7 = s.days.slice(-7);
      s.freq7 = last7.length ? AL.sum(last7, function (r) { return r.frequency; }) / last7.length : null;
      s.ctrNow = AL.div(AL.sum(last7, function (r) { return r.clicks; }), AL.sum(last7, function (r) { return r.impressions; }));
      s.ctrLaunch = launch[s.id] ? AL.div(launch[s.id].c, launch[s.id].i) : null;
      s.ctrChange = (s.ctrNow != null && s.ctrLaunch) ? s.ctrNow / s.ctrLaunch - 1 : null;
    });
    // flags (SPEC rules)
    var p25 = AL.quantile(rows.map(function (r) { return r.ctr; }), 0.25);
    var withQ = rows.filter(function (r) { return r.q > 0; });
    var allMed = AL.median(withQ.map(function (r) { return r.cpql; }));
    var campMed = {};
    D.campaigns.forEach(function (c) {
      var xs = withQ.filter(function (r) { return r.ad.campaign_id === c.id; }).map(function (r) { return r.cpql; });
      campMed[c.id] = xs.length >= 2 ? AL.median(xs) : allMed;
    });
    rows.forEach(function (r) {
      var med = campMed[r.ad.campaign_id];
      r.med = med;
      if (r.q === 0 && allMed != null && r.spend > 2 * allMed) { r.flag = 'KILL'; r.why = AL.inr(r.spend) + ' spent, ' + r.leads + ' leads, 0 qualified'; }
      else if (r.freq7 != null && r.freq7 >= 3) { r.flag = 'REFRESH'; r.why = '7-day frequency ' + r.freq7.toFixed(1); }
      else if (rows.length >= 4 && r.ctr != null && p25 != null && r.ctr < p25) { r.flag = 'REFRESH'; r.why = 'CTR ' + AL.pct(r.ctr, 2) + ' is in the bottom quartile'; }
      else if (r.cpql != null && med != null && r.signed > 0 && r.cpql <= 0.8 * med) { r.flag = 'SCALE'; r.why = 'CPQL ' + AL.inr(r.cpql) + ' vs campaign median ' + AL.inr(med) + ', ' + r.signed + ' signed'; }
      else { r.flag = 'HOLD'; r.why = 'Within normal ranges'; }
    });
    rows.allMed = allMed; rows.p25 = p25;
    return rows;
  }

  function lpStats(f, t) {
    var S = {};
    D.landing_pages.forEach(function (l) { S[l.id] = { lp: l, sessions: 0, bounces: 0, starts: 0, submits: 0, loadW: 0 }; });
    D.lp_daily.forEach(function (r) {
      if (!AL.inR(r.date, f, t)) return;
      var s = S[r.landing_page_id];
      s.sessions += r.sessions; s.bounces += r.bounces; s.starts += r.form_starts; s.submits += r.form_submits; s.loadW += r.avg_load_ms * r.sessions;
    });
    return D.landing_pages.map(function (l) {
      var s = S[l.id];
      s.load = AL.div(s.loadW, s.sessions);
      s.dropoff = s.sessions ? 1 - s.submits / s.sessions : null;
      s.cvr = AL.div(s.submits, s.sessions);
      s.sts = AL.div(s.submits, s.starts);
      s.bounce = AL.div(s.bounces, s.sessions);
      return s;
    });
  }

  // ---------- rendering ----------
  function renderKPIs(R) {
    var f = R.from, t = R.to, P = R.prev;
    var rev = revenue(f, t), tg = target(f, t), prevRev = P ? revenue(P.from, P.to) : null, prevTg = P ? target(P.from, P.to) : null;
    var ach = AL.div(rev.total, tg);
    var achPrev = P ? AL.div(prevRev.total, prevTg) : null;
    var ns = newStudents(f, t), nsP = P ? newStudents(P.from, P.to) : null;
    var up = unpaid(t), upP = P ? unpaid(P.to) : null;
    var rn = renewalsDue(t), rnP = P ? renewalsDue(P.to) : null;
    var lowEng = rn.filter(function (e) { var g = engagement(e.student_id, t); return g && g.level === 'r'; }).length;
    var cq = cpql(f, t), cqP = P ? cpql(P.from, P.to) : null;
    var pc = progConv(f, t), pcP = P ? progConv(P.from, P.to) : null;
    var ld = cohort(f, t), ldP = P ? cohort(P.from, P.to) : null;
    var achCls = ach == null ? '' : ach >= 1 ? 'g' : ach >= 0.85 ? 'a' : 'r';
    var monthsTxt = R.days > 31 ? 'pro-rated across ' + R.days + ' days' : 'pro-rated for ' + R.days + ' day' + (R.days > 1 ? 's' : '');

    var html = '';
    html += AL.tile({ cls: 'hero', label: 'Revenue vs target', help: 'Paid amounts (Razorpay) in period ÷ monthly target pro-rated by day.',
      value: AL.inr(rev.total) + ' <small>of ' + AL.inr(tg) + ' target</small>',
      extra: '<div class="progress ' + achCls + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round((ach || 0) * 100) + '" aria-label="Percent of target achieved"><span style="width:' + Math.min(100, (ach || 0) * 100).toFixed(1) + '%"></span></div>' +
        '<div class="kpi-f"><span class="chip ' + (achCls || 'n') + '">' + AL.pct(ach) + ' achieved</span><span class="kpi-s">' + monthsTxt + '</span></div>',
      delta: AL.delta(rev.total, prevRev && prevRev.total) + (achPrev != null ? '<span class="kpi-s">prev ' + AL.pct(achPrev) + ' of target</span>' : '') });
    html += AL.tile({ label: 'Program revenue', value: AL.inr(rev.program), delta: AL.delta(rev.program, prevRev && prevRev.program),
      sub: 'Full ' + AL.inr(rev.full) + ' · Trial ' + AL.inr(rev.trial), help: 'Full-program instalments + trial fees + trial→full upgrades paid in period.' });
    html += AL.tile({ label: 'Workshop revenue', value: AL.inr(rev.workshop), delta: AL.delta(rev.workshop, prevRev && prevRev.workshop),
      sub: rev.seats + ' seats × ₹3,999' });
    html += AL.tile({ label: 'New students', value: ns.total + ' <small>' + ns.full + ' full · ' + ns.trial + ' trial</small>', delta: AL.delta(ns.total, nsP && nsP.total),
      sub: ns.upgrades ? '+' + ns.upgrades + ' trial→full upgrade' + (ns.upgrades > 1 ? 's' : '') : '', help: 'Enrollments starting in period (excludes trial→full upgrades, shown separately).' });
    html += AL.tile({ label: 'Unpaid invoices', value: AL.inr(up.amount) + ' <small>' + up.n + ' invoice' + (up.n === 1 ? '' : 's') + '</small>',
      badge: up.overdue ? ' <span class="chip r">' + up.overdue + ' overdue</span>' : '', delta: AL.delta(up.amount, upP && upP.amount, { goodUp: false }),
      sub: 'as of ' + AL.fmtDate(t), help: 'Invoices issued on/before the period end and not paid by then.' });
    html += AL.tile({ label: 'Renewals due · next 30 days', value: String(rn.length), badge: lowEng ? ' <span class="chip r">' + lowEng + ' low engagement</span>' : '',
      delta: AL.delta(rn.length, rnP && rnP.length, { mode: 'abs', dp: 0, neutral: true }), sub: 'trials ending ' + AL.fmtDate(AL.add(t, 1)) + ' – ' + AL.fmtDate(AL.add(t, 30)) });
    html += AL.tile({ label: 'CPQL (Meta)', value: AL.inr(cq), delta: AL.delta(cq, cqP, { goodUp: false }), sub: 'spend ÷ qualified Meta leads',
      help: 'Meta spend in period ÷ Meta leads qualified in period.' });
    html += AL.tile({ label: 'Program conversion', value: AL.pct(pc, 1), delta: AL.delta(pc, pcP, { mode: 'pp' }),
      sub: 'cohort of ' + AL.num(ld.length) + ' leads', help: 'Leads created in period that became trial or full ÷ leads created in period. Recent cohorts are still maturing.' });
    html += AL.tile({ label: 'Total leads', value: AL.num(ld.length), delta: AL.delta(ld.length, ldP && ldP.length),
      sub: ld.filter(function (l) { return l.source === 'meta'; }).length + ' Meta · ' + ld.filter(function (l) { return l.source !== 'meta'; }).length + ' other' });
    document.getElementById('kpis').innerHTML = html;
    return { rev: rev, tg: tg, ach: ach, up: up, rn: rn, lowEng: lowEng };
  }

  function renderRevenue(R) {
    var B = AL.buckets(R.from, R.to, 'auto');
    var full = B.map(function () { return 0; }), trial = full.slice(), ws = full.slice(), tgt = full.slice();
    D.invoices.forEach(function (iv) {
      if (!AL.inR(iv.paid_at, R.from, R.to)) return;
      var i = B.index(iv.paid_at); if (i < 0) return;
      if (ENR[iv.enrollment_id].plan === 'trial_3m') trial[i] += iv.amount; else full[i] += iv.amount;
    });
    D.workshop_bookings.forEach(function (b) { if (AL.inR(b.paid_at, R.from, R.to)) { var i = B.index(b.paid_at); if (i >= 0) ws[i] += b.amount; } });
    B.forEach(function (b, i) { tgt[i] = target(b.from, b.to); });
    var cumR = [], cumT = [], a = 0, c = 0;
    B.forEach(function (b, i) { a += full[i] + trial[i] + ws[i]; c += tgt[i]; cumR.push(a); cumT.push(c); });
    document.getElementById('rev-sub').textContent = 'By ' + B.gran + ' · bars = revenue per ' + B.gran + ' (left axis) · lines = running total vs pro-rated target (right axis)';
    AL.chart('ch-rev', {
      data: {
        labels: B.map(function (b) { return b.label; }),
        datasets: [
          { type: 'bar', label: 'Full program', data: full, backgroundColor: C.accent, stack: 'r', yAxisID: 'y', order: 3, borderRadius: 2 },
          { type: 'bar', label: '3-month trial', data: trial, backgroundColor: C.accent3, stack: 'r', yAxisID: 'y', order: 3, borderRadius: 2 },
          { type: 'bar', label: 'Workshops', data: ws, backgroundColor: C.slate, stack: 'r', yAxisID: 'y', order: 3, borderRadius: 2 },
          { type: 'line', label: 'Cumulative revenue', data: cumR, borderColor: C.ink, backgroundColor: C.ink, yAxisID: 'y2', tension: 0.2, pointRadius: 2, borderWidth: 2, order: 1 },
          { type: 'line', label: 'Cumulative target', data: cumT, borderColor: C.bad, backgroundColor: C.bad, borderDash: [6, 4], yAxisID: 'y2', pointRadius: 0, borderWidth: 2, order: 2 }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
          y: { stacked: true, beginAtZero: true, ticks: { callback: AL.inrAxis }, title: { display: true, text: 'Per ' + B.gran } },
          y2: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { callback: AL.inrAxis }, title: { display: true, text: 'Cumulative' } }
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              title: function (items) { var b = B[items[0].dataIndex]; return b.from === b.to ? AL.fmtDate(b.from, true) : AL.fmtRange(b.from, b.to); },
              label: function (ctx) { return ' ' + ctx.dataset.label + ': ' + AL.inr(ctx.parsed.y); },
              footer: function (items) {
                var i = items[0].dataIndex, tot = full[i] + trial[i] + ws[i];
                return 'Period total ' + AL.inr(tot) + ' · target ' + AL.inr(tgt[i]) + ' (' + (AL.pct(AL.div(tot, tgt[i]))) + ')';
              }
            }
          }
        }
      }
    });
  }

  function renderMix(R, k) {
    var rev = k.rev;
    var vals = [rev.full, rev.trial, rev.workshop];
    AL.chart('ch-mix', {
      type: 'doughnut',
      data: { labels: ['Full program', '3-month trial', 'Workshops'], datasets: [{ data: vals, backgroundColor: [C.accent, C.accent3, C.slate], borderColor: '#fff', borderWidth: 2 }] },
      options: {
        cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { generateLabels: function (ch) {
            var base = window.Chart.overrides.doughnut.plugins.legend.labels.generateLabels(ch);
            base.forEach(function (l, i) { l.text = l.text + '  ' + AL.pct(AL.div(vals[i], rev.total)); });
            return base;
          } } },
          tooltip: { callbacks: { label: function (ctx) { return ' ' + ctx.label + ': ' + AL.inr(ctx.parsed) + ' (' + AL.pct(AL.div(ctx.parsed, rev.total), 1) + ')'; } } }
        }
      },
      plugins: [{
        id: 'center',
        afterDraw: function (ch) {
          var m = ch.getDatasetMeta(0); if (!m.data[0]) return;
          var x = m.data[0].x, y = m.data[0].y, cx = ch.ctx;
          cx.save(); cx.textAlign = 'center'; cx.fillStyle = C.ink; cx.font = '700 15px Inter, sans-serif';
          cx.fillText(AL.inr(rev.total), x, y + 2); cx.font = '500 11px Inter, sans-serif'; cx.fillStyle = C.muted;
          cx.fillText('Program ' + AL.pct(AL.div(rev.program, rev.total)), x, y + 18); cx.restore();
        }
      }]
    });
    var ns = newStudents(R.from, R.to), tot = Math.max(1, ns.total);
    var el = document.getElementById('signups');
    el.innerHTML = ns.total === 0 ? '<p class="note">No new sign-ups in this period.</p>' :
      '<div class="split-bar" role="img" aria-label="' + ns.full + ' full program and ' + ns.trial + ' trial sign-ups">' +
      (ns.full ? '<span style="width:' + (ns.full / tot * 100) + '%;background:' + C.accent + '">' + ns.full + ' full</span>' : '') +
      (ns.trial ? '<span style="width:' + (ns.trial / tot * 100) + '%;background:' + C.accent3 + ';color:#1e1b4b">' + ns.trial + ' trial</span>' : '') + '</div>' +
      '<p class="note">' + AL.pct(AL.div(ns.full, ns.total)) + ' chose the full program up front' + (ns.upgrades ? ' · ' + ns.upgrades + ' trial→full upgrade' + (ns.upgrades > 1 ? 's' : '') + ' in period' : '') + '.</p>';
  }

  var STAGES = [
    ['Total leads', null, 'All sources in filter'],
    ['Qualified', 'qualified_at', 'ICP fit (parent, grade 8–12, budget)'],
    ['Discovery call set', 'discovery_set_at', 'Booked via ClickUp / Calendly'],
    ['Showed up', 'discovery_showed_at', 'Show-up rate'],
    ['Ambition interview', 'ambition_interview_at', 'Teen + parent'],
    ['Architect session', 'architect_session_at', 'Plan designed'],
    ['Signed (trial + full)', '_signed', 'Paid via Razorpay']
  ];
  function funnelCounts(f, t, src) {
    var c = cohort(f, t, src);
    var counts = STAGES.map(function (s) {
      if (!s[1]) return c.length;
      if (s[1] === '_signed') return c.filter(signed).length;
      return c.filter(function (l) { return l[s[1]]; }).length;
    });
    counts.open = c.filter(function (l) { return l.outcome === 'open'; }).length;
    counts.total = c.length;
    return counts;
  }
  function renderFunnel(R) {
    var cur = funnelCounts(R.from, R.to, srcFilter), prev = R.prev ? funnelCounts(R.prev.from, R.prev.to, srcFilter) : null;
    var max = Math.max(1, cur[0]);
    var html = '';
    STAGES.forEach(function (s, i) {
      var n = cur[i], w = n / max * 100;
      var step = i ? AL.div(n, cur[i - 1]) : null, stepP = (i && prev) ? AL.div(prev[i], prev[i - 1]) : null;
      var rowCls = '', conv = '';
      if (i === 3) {
        rowCls = 'hl';
        conv = '<span class="chip ' + AL.rag(step, 0.7, 0.6) + '">Show-up ' + AL.pct(step) + '</span>' + (prev ? AL.delta(step, stepP, { mode: 'pp' }) : '');
      } else if (i === 4) {
        var dropoff = step == null ? null : 1 - step, dropP = stepP == null ? null : 1 - stepP;
        rowCls = 'hl-bad';
        conv = '<span class="chip ' + AL.rag(dropoff, 0.3, 0.4, true) + '">Drop-off ' + AL.pct(dropoff) + '</span>' + (prev ? AL.delta(dropoff, dropP, { mode: 'pp', goodUp: false }) : '');
      } else if (i > 0) {
        conv = '<span><b>' + AL.pct(step) + '</b> of previous step</span>';
      } else {
        conv = '<span class="muted">' + cur.open + ' still open</span>';
      }
      var inside = w >= 18;
      html += '<div class="f-row ' + rowCls + '">' +
        '<div class="f-label">' + s[0] + '<small>' + s[2] + '</small></div>' +
        '<div class="f-track" title="' + AL.esc(s[0] + ': ' + n + ' (' + AL.pct(AL.div(n, cur[0]), 1) + ' of leads)') + '">' +
        '<div class="f-bar-in" style="width:' + Math.max(w, 0.6).toFixed(2) + '%;' + (i === STAGES.length - 1 ? 'background:' + C.good : i >= 3 ? 'background:' + C.accent2 : '') + '"></div>' +
        '<span class="f-num' + (inside ? '' : ' dark') + '" style="' + (inside ? '' : 'left:calc(' + w.toFixed(2) + '% + 8px)') + '">' + AL.num(n) + ' <span style="font-weight:500;opacity:.85">· ' + AL.pct(AL.div(n, cur[0]), 1) + '</span></span>' +
        '</div><div class="f-conv">' + conv + '</div></div>';
    });
    document.getElementById('funnel').innerHTML = html;
    var srcName = { all: 'all sources', meta: 'Meta', organic: 'organic', referral: 'referral', workshop: 'workshop' }[srcFilter];
    document.getElementById('funnel-sub').textContent = 'Cohort view: ' + AL.num(cur.total) + ' leads (' + srcName + ') created ' + AL.fmtRange(R.from, R.to) +
      ', and how far each one has got. ' + cur.open + ' are still in progress, so the newest cohorts look lower until they close.';

    // top metrics strip
    var P = R.prev;
    var cq = cpql(R.from, R.to), cqP = P ? cpql(P.from, P.to) : null;
    var pc = progConv(R.from, R.to, srcFilter), pcP = P ? progConv(P.from, P.to, srcFilter) : null;
    var org = cohort(R.from, R.to, 'organic').length, orgP = P ? cohort(P.from, P.to, 'organic').length : null;
    var j = journey(R.from, R.to, srcFilter), jP = P ? journey(P.from, P.to, srcFilter) : null;
    var dayFmt = function (v) { return AL.isNum(v) ? v.toFixed(1) + ' d' : '—'; };
    var items = [
      ['CPQL (Meta)', AL.inr(cq), AL.delta(cq, cqP, { goodUp: false })],
      ['Program conversion', AL.pct(pc, 1), AL.delta(pc, pcP, { mode: 'pp' })],
      ['Organic leads', AL.num(org), AL.delta(org, orgP)],
      ['Avg days in funnel: signed', dayFmt(j.signed), j.ns ? AL.delta(j.signed, jP && jP.signed, { mode: 'abs', goodUp: false, fmt: function (v) { return v.toFixed(1) + ' d'; } }) : '<span class="delta na">none closed</span>'],
      ['Avg days in funnel: dropped', dayFmt(j.dropped), j.nd ? '<span class="delta na">' + j.nd + ' closed-lost</span>' : '<span class="delta na">none closed</span>']
    ];
    document.getElementById('strip').innerHTML = items.map(function (it) {
      return '<div><div class="l">' + it[0] + '</div><div class="v">' + it[1] + '</div><div class="d">' + it[2] + '</div></div>';
    }).join('');
  }

  function flagHtml(r) { return '<span class="flag ' + r.flag + '" title="' + AL.esc(r.why) + '">' + r.flag + '</span>'; }

  function renderCampaigns(rows) {
    var shown = rows.filter(function (r) { return objFilter === 'all' || r.objective === objFilter; });
    var cols = [
      { key: 'name', label: 'Creative', head: true, cls: 'wrap-cell', fmt: function (r) { return AL.esc(r.name) + '<span class="sub">' + r.ad.format + ' → ' + AL.esc(r.lp.name) + '</span>'; } },
      { key: 'campaign', label: 'Campaign', val: function (r) { return r.campaign.name; }, fmt: function (r) { return '<span title="' + AL.esc(r.campaign.name) + '">' + AL.esc(short(r.campaign.name, 30)) + '</span>'; } },
      { key: 'objective', label: 'Objective', fmt: function (r) { return '<span class="chip n">' + r.objective + '</span>'; } },
      { key: 'spend', label: 'Spend', num: true, fmt: function (r) { return AL.inr(r.spend); } },
      { key: 'imp', label: 'Impr.', num: true, fmt: function (r) { return AL.num(r.imp); } },
      { key: 'ctr', label: 'CTR', num: true, fmt: function (r) {
        var cls = r.ctr != null && rows.p25 != null && r.ctr < rows.p25 ? 'amber' : '';
        return '<span class="' + cls + '" title="Launch CTR ' + AL.pct(r.ctrLaunch, 2) + ' · last 7 days ' + AL.pct(r.ctrNow, 2) + '">' + AL.pct(r.ctr, 2) + '</span>'; } },
      { key: 'freq7', label: 'Freq (7d)', num: true, fmt: function (r) { return '<span class="' + (r.freq7 >= 3 ? 'red' : r.freq7 >= 2.5 ? 'amber' : '') + '">' + (AL.isNum(r.freq7) ? r.freq7.toFixed(2) : '—') + '</span>'; } },
      { key: 'leads', label: 'Leads', num: true },
      { key: 'q', label: 'Qualified', num: true },
      { key: 'cpql', label: 'CPQL', num: true, fmt: function (r) { return r.cpql == null ? '<span class="red">no QL</span>' : AL.inr(r.cpql); } },
      { key: 'signed', label: 'Signed', num: true },
      { key: 'seats', label: 'Seats', num: true, title: 'Workshop seats booked by leads from this creative' },
      { key: 'flag', label: 'Flag', val: function (r) { return { KILL: 0, REFRESH: 1, SCALE: 2, HOLD: 3 }[r.flag]; }, fmt: flagHtml }
    ];
    AL.table(document.getElementById('tbl-camp'), cols, shown, { sortKey: 'spend', sortDir: 'desc', empty: 'No creatives with spend in this period.' });
  }

  var FLAG_COL = { SCALE: '#15803d', HOLD: '#64748b', REFRESH: '#d97706', KILL: '#b91c1c' };
  function renderBubble(rows) {
    var act = rows.filter(function (r) { return r.spend > 0; });
    var maxSpend = Math.max.apply(null, act.map(function (r) { return r.spend; }).concat([1]));
    var maxC = Math.max.apply(null, act.map(function (r) { return r.cpql || 0; }).concat([1]));
    var noQLx = maxC * 1.18;
    var pts = act.map(function (r) {
      return { x: r.cpql != null ? r.cpql : noQLx, y: (r.conv || 0) * 100, r: 5 + Math.sqrt(r.spend / maxSpend) * 17, row: r };
    });
    var xMed = rows.allMed, yMed = AL.median(act.map(function (r) { return (r.conv || 0) * 100; }));
    var quad = {
      id: 'quad',
      beforeDatasetsDraw: function (ch) {
        var a = ch.chartArea, x = ch.scales.x, y = ch.scales.y, cx = ch.ctx;
        if (xMed == null || yMed == null) return;
        var px = x.getPixelForValue(xMed), py = y.getPixelForValue(yMed);
        cx.save();
        cx.strokeStyle = '#c7cdd6'; cx.setLineDash([4, 4]); cx.lineWidth = 1;
        if (px > a.left && px < a.right) { cx.beginPath(); cx.moveTo(px, a.top); cx.lineTo(px, a.bottom); cx.stroke(); }
        if (py > a.top && py < a.bottom) { cx.beginPath(); cx.moveTo(a.left, py); cx.lineTo(a.right, py); cx.stroke(); }
        cx.setLineDash([]);
        cx.font = '700 11px Inter, sans-serif'; cx.globalAlpha = 0.75;
        cx.fillStyle = C.good; cx.textAlign = 'left'; cx.fillText('SCALE', a.left + 6, a.top + 14);
        cx.fillStyle = '#b45309'; cx.textAlign = 'right'; cx.fillText('REFRESH CREATIVE', a.right - 6, a.top + 14);
        cx.fillStyle = C.accent; cx.textAlign = 'left'; cx.fillText('FIX THE FUNNEL', a.left + 6, a.bottom - 8);
        cx.fillStyle = C.bad; cx.textAlign = 'right'; cx.fillText('KILL', a.right - 6, a.bottom - 8);
        cx.restore();
      },
      afterDatasetsDraw: function (ch) {
        var cx = ch.ctx, meta = ch.getDatasetMeta(0), a = ch.chartArea;
        if (ch.width < 420) return;
        cx.save(); cx.font = '500 10.5px Inter, sans-serif'; cx.fillStyle = C.ink;
        meta.data.forEach(function (el, i) {
          var p = pts[i], label = short(p.row.name, 24), w = cx.measureText(label).width;
          var rr = el.options.radius || p.r;
          var lx = el.x + rr + 4, align = 'left';
          if (lx + w > a.right) { lx = el.x - rr - 4; align = 'right'; }
          cx.textAlign = align; cx.fillText(label, lx, el.y + 3);
        });
        cx.restore();
      }
    };
    AL.chart('ch-bubble', {
      type: 'bubble',
      data: { datasets: [{ label: 'Creatives', data: pts,
        backgroundColor: pts.map(function (p) { return FLAG_COL[p.row.flag] + '55'; }),
        borderColor: pts.map(function (p) { return FLAG_COL[p.row.flag]; }), borderWidth: 1.5 }] },
      options: {
        layout: { padding: { top: 6, right: 8 } },
        scales: {
          x: { beginAtZero: true, suggestedMax: noQLx * 1.05, title: { display: true, text: 'CPQL (₹ per qualified lead)' }, ticks: { callback: function (v) { return v >= noQLx * 0.995 ? 'no QL' : AL.inrAxis(v); } } },
          y: { beginAtZero: true, suggestedMax: Math.max(4, (Math.max.apply(null, pts.map(function (p) { return p.y; }).concat([0])) * 1.25)), title: { display: true, text: 'Lead → signed %' }, ticks: { callback: function (v) { return v + '%'; } } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: function (it) { return it[0].raw.row.name; },
            label: function (ctx) {
              var r = ctx.raw.row;
              return [' ' + r.flag + ' · ' + r.why, ' Spend ' + AL.inr(r.spend) + ' · CPQL ' + (r.cpql == null ? 'no qualified leads' : AL.inr(r.cpql)),
                ' ' + r.leads + ' leads → ' + r.q + ' qualified → ' + r.signed + ' signed (' + AL.pct(r.conv, 1) + ')'];
            }
          } }
        }
      },
      plugins: [quad]
    });
    document.getElementById('bubble-legend').innerHTML = ['SCALE', 'HOLD', 'REFRESH', 'KILL'].map(function (k) {
      return '<span><span class="sw" style="background:' + FLAG_COL[k] + '"></span>' + k.charAt(0) + k.slice(1).toLowerCase() + '</span>';
    }).join('') + '<span>Dashed lines = median CPQL / median conversion</span>';
  }

  function renderLP(R) {
    var cur = lpStats(R.from, R.to), prev = R.prev ? lpStats(R.prev.from, R.prev.to) : null;
    var rows = cur.map(function (s, i) { s.prevCvr = prev ? prev[i].cvr : null; s.prevLoad = prev ? prev[i].load : null; return s; }).filter(function (s) { return s.sessions > 0; });
    AL.table(document.getElementById('tbl-lp'), [
      { key: 'name', label: 'Landing page', head: true, val: function (s) { return s.lp.name; }, fmt: function (s) { return AL.esc(s.lp.name) + '<span class="sub">' + AL.esc(s.lp.url) + '</span>'; } },
      { key: 'sessions', label: 'Sessions', num: true, fmt: function (s) { return AL.num(s.sessions); } },
      { key: 'bounce', label: 'Bounce', num: true, fmt: function (s) { return AL.pct(s.bounce); } },
      { key: 'dropoff', label: 'Drop-off', num: true, title: '1 − form submits ÷ sessions', fmt: function (s) { return AL.pct(s.dropoff, 1); } },
      { key: 'cvr', label: 'Submit rate', num: true, fmt: function (s) { return AL.pct(s.cvr, 1) + ' ' + (prev ? AL.delta(s.cvr, s.prevCvr, { mode: 'pp' }).replace(' <span class="vs">vs prev</span>', '') : ''); } },
      { key: 'sts', label: 'Form start → submit', num: true, fmt: function (s) { return AL.pct(s.sts); } },
      { key: 'load', label: 'Avg load', num: true, fmt: function (s) {
        return '<span class="' + (s.load > 3000 ? 'red' : '') + '">' + (AL.isNum(s.load) ? (s.load / 1000).toFixed(1) + 's' : '—') + '</span>' +
          (prev && s.prevLoad && s.load > 3000 && s.prevLoad <= 3000 ? '<span class="sub">was ' + (s.prevLoad / 1000).toFixed(1) + 's</span>' : ''); } },
      { key: 'status', label: 'Status', val: function (s) { return s.load > 3000 ? 0 : 1; }, fmt: function (s) { return s.load > 3000 ? AL.chip('r', 'Slow') : AL.chip('g', 'OK'); } }
    ], rows, { sortKey: 'sessions', sortDir: 'desc' });
  }

  function renderInvoices(R) {
    var asOf = R.to, up = unpaid(asOf);
    var rows = up.rows.map(function (iv) {
      var e = ENR[iv.enrollment_id];
      var age = AL.dn(asOf) - AL.dn(iv.issued_at), overdueBy = AL.dn(asOf) - AL.dn(iv.due_at);
      return { iv: iv, e: e, student: e.student_name, plan: e.plan, amount: iv.amount, issued: iv.issued_at, due: iv.due_at, age: age, overdueBy: overdueBy,
        bucket: age > 30 ? '30+' : age > 15 ? '16–30' : '0–15' };
    });
    var B = { '0–15': [0, 0], '16–30': [0, 0], '30+': [0, 0] };
    rows.forEach(function (r) { B[r.bucket][0] += r.amount; B[r.bucket][1]++; });
    document.getElementById('ageing').innerHTML = [['0–15', ''], ['16–30', 'a'], ['30+', 'r']].map(function (b) {
      var x = B[b[0]];
      return '<div class="' + (x[1] ? b[1] : '') + '"><div class="l">' + b[0] + ' days</div><div class="v">' + AL.inr(x[0]) + '</div><div class="c">' + x[1] + ' invoice' + (x[1] === 1 ? '' : 's') + '</div></div>';
    }).join('');
    document.getElementById('inv-sub').textContent = 'Outstanding as of ' + AL.fmtDate(asOf, true) + ', aged by days since the invoice was issued';
    AL.table(document.getElementById('tbl-inv'), [
      { key: 'student', label: 'Student', head: true, fmt: function (r) { return AL.esc(r.student) + '<span class="sub">' + r.iv.id + ' · instalment ' + r.iv.instalment + '</span>'; } },
      { key: 'plan', label: 'Plan', fmt: function (r) { return r.plan === 'trial_3m' ? 'Trial' : (r.e.renewal_of ? 'Upgrade' : 'Full'); } },
      { key: 'amount', label: 'Amount', num: true, fmt: function (r) { return AL.inr(r.amount); } },
      { key: 'due', label: 'Due', fmt: function (r) { return AL.fmtDate(r.due); } },
      { key: 'age', label: 'Age', num: true, fmt: function (r) { return r.age + ' d ' + AL.chip(r.bucket === '30+' ? 'r' : r.bucket === '16–30' ? 'a' : 'n', r.bucket); } },
      { key: 'overdueBy', label: 'Status', num: true, fmt: function (r) { return r.overdueBy > 0 ? AL.chip('r', 'Overdue ' + r.overdueBy + 'd') : AL.chip('n', r.overdueBy === 0 ? 'Due today' : 'Due in ' + (-r.overdueBy) + 'd'); } }
    ], rows, { sortKey: 'age', sortDir: 'desc', empty: 'Nothing outstanding as of this date.' });
    return rows;
  }

  function renderRenewals(R) {
    var asOf = R.to, list = renewalsDue(asOf);
    var rows = list.map(function (e) {
      var g = engagement(e.student_id, asOf);
      return { e: e, student: e.student_name, start: e.start_date, end: e.end_date, left: AL.dn(e.end_date) - AL.dn(asOf), g: g,
        eng: g ? { r: 0, a: 1, g: 2 }[g.level] : -1, outcome: AL.TODAY >= e.end_date ? e.status : 'pending' };
    });
    document.getElementById('ren-sub').textContent = 'Trials ending ' + AL.fmtDate(AL.add(asOf, 1)) + ' – ' + AL.fmtDate(AL.add(asOf, 30), true) + '. Low engagement means a likely churn, so book an advisor call first.';
    AL.table(document.getElementById('tbl-ren'), [
      { key: 'student', label: 'Student', head: true, fmt: function (r) { return AL.esc(r.student) + '<span class="sub">' + (r.g ? 'Advisor: ' + AL.esc(r.g.advisor) : 'Not on app cohort') + '</span>'; } },
      { key: 'end', label: 'Trial ends', fmt: function (r) { return AL.fmtDate(r.end); } },
      { key: 'left', label: 'Days left', num: true, fmt: function (r) { return '<span class="' + (r.left <= 7 ? 'red' : '') + '">' + r.left + '</span>'; } },
      { key: 'eng', label: 'Engagement signal', num: false, val: function (r) { return r.eng; }, fmt: function (r) {
        if (!r.g) return AL.chip('n', 'No app data');
        var lbl = { r: 'Low', a: 'Medium', g: 'High' }[r.g.level];
        return AL.chip(r.g.level, lbl) + '<span class="sub">' + r.g.min.toFixed(1) + ' app min/day · ' + (r.g.lastAgo == null ? 'never opened' : 'last open ' + (r.g.lastAgo === 0 ? 'today' : r.g.lastAgo + 'd ago')) +
          (r.g.att != null ? ' · attendance ' + AL.pct(r.g.att) : '') + '</span>'; } },
      { key: 'outcome', label: 'Outcome', fmt: function (r) { return r.outcome === 'renewed' ? AL.chip('g', 'Renewed') : r.outcome === 'churned' ? AL.chip('r', 'Churned') : AL.chip('n', 'Pending'); } }
    ], rows, { sortKey: 'left', sortDir: 'asc', empty: 'No trial renewals due in the 30 days after this period.' });
    return rows;
  }

  function renderCalls(R, k, rows, invRows, renRows) {
    var calls = [];
    var monthEnd = AL.monthEnd(R.to), inMonth = R.to === AL.TODAY && R.to < monthEnd;
    // revenue pacing
    if (k.ach != null) {
      if (k.ach < 0.95) {
        var gap = k.tg - k.rev.total, extra = '';
        if (inMonth) {
          var mt = target(AL.monthStart(R.to), monthEnd), mr = revenue(AL.monthStart(R.to), R.to).total, left = AL.days(AL.add(R.to, 1), monthEnd);
          extra = ' To close ' + AL.fmtDate(monthEnd) + ' on target, the rest of the month needs ' + AL.inr(Math.max(0, (mt - mr) / left)) + '/day.';
        }
        calls.push({ pri: 72, tag: ['r', 'Pace'], t: 'Revenue is at ' + AL.pct(k.ach) + ' of pro-rated target (' + AL.inr(gap) + ' short)', w: 'Pull forward instalments due soon and push renewals.' + extra });
      } else {
        calls.push({ pri: 20, tag: ['g', 'Pace'], t: 'Revenue ahead of pro-rated target (' + AL.pct(k.ach) + ')', w: 'Put the surplus into scaling the creatives that are working, not into new tests.' });
      }
    }
    rows.filter(function (r) { return r.flag === 'KILL'; }).forEach(function (r) {
      var best = rows.filter(function (x) { return x.flag === 'SCALE'; })[0];
      calls.push({ pri: 100, tag: ['r', 'Kill'], t: 'Kill “' + r.name + '”: ' + AL.inr(r.spend) + ' spent, ' + r.leads + ' leads, 0 qualified',
        w: 'High CTR (' + AL.pct(r.ctr, 1) + ') but it pulls students, not parents.' + (best ? ' Move the budget to “' + best.name + '”.' : '') });
    });
    rows.filter(function (r) { return r.flag === 'REFRESH' && r.freq7 >= 3; }).forEach(function (r) {
      calls.push({ pri: 92, tag: ['a', 'Refresh'], t: 'Refresh “' + r.name + '”: frequency ' + r.freq7.toFixed(1) + (r.ctrChange != null ? ', CTR ' + (r.ctrChange < 0 ? 'down ' : 'up ') + Math.abs(Math.round(r.ctrChange * 100)) + '% vs launch' : ''),
        w: 'The same parents have seen it 3+ times in 7 days. Brief a new cut, cap frequency at 2.5 and widen the audience.' });
    });
    rows.filter(function (r) { return r.flag === 'REFRESH' && !(r.freq7 >= 3); }).slice(0, 1).forEach(function (r) {
      calls.push({ pri: 55, tag: ['a', 'Refresh'], t: 'Rework the hook on “' + r.name + '”: CTR ' + AL.pct(r.ctr, 2) + ', bottom quartile',
        w: 'Lead quality is fine once people click; the first 3 seconds aren\'t stopping the scroll.' });
    });
    var lps = lpStats(R.from, R.to).filter(function (s) { return s.sessions > 0; });
    var bestLp = lps.slice().sort(function (a, b) { return (b.cvr || 0) - (a.cvr || 0); })[0];
    lps.filter(function (s) { return s.load > 3000; }).forEach(function (s) {
      var feeders = D.ad_creatives.filter(function (a) { return a.landing_page_id === s.lp.id && rows.some(function (r) { return r.id === a.id; }); }).map(function (a) { return '“' + short(a.name, 22) + '”'; });
      calls.push({ pri: 88, tag: ['r', 'Fix'], t: 'Speed up “' + s.lp.name + '”: avg load ' + (s.load / 1000).toFixed(1) + 's',
        w: 'Submit rate ' + AL.pct(s.cvr, 1) + ' vs ' + AL.pct(bestLp.cvr, 1) + ' on “' + bestLp.lp.name + '”. Lazy-load the hero video and compress images. Feeds ' + (feeders.join(', ') || 'no live creatives') + '.' });
    });
    var sc = rows.filter(function (r) { return r.flag === 'SCALE'; }).sort(function (a, b) { return a.cpql - b.cpql; })[0];
    if (sc) calls.push({ pri: 70, tag: ['g', 'Scale'], t: 'Scale “' + sc.name + '”: CPQL ' + AL.inr(sc.cpql) + ' vs ' + AL.inr(sc.med) + ' campaign median',
      w: sc.signed + ' signed this period. Raise the daily budget about 20% and watch 7-day frequency (now ' + (AL.isNum(sc.freq7) ? sc.freq7.toFixed(1) : '—') + ').' });
    var fc = funnelCounts(R.from, R.to, 'all');
    var showUp = AL.div(fc[3], fc[2]), amb = AL.div(fc[4], fc[3]);
    if (amb != null && fc[3] >= 5 && 1 - amb >= 0.35) calls.push({ pri: 66, tag: ['a', 'Funnel'], t: 'Ambition-interview drop-off is ' + AL.pct(1 - amb) + ', the biggest leak after the discovery call',
      w: (fc[3] - fc[4]) + ' of ' + fc[3] + ' parents who showed up did not move to the ambition interview. Send a 2-min teen-facing video and book the interview on the call itself.' });
    if (showUp != null && fc[2] >= 5 && showUp < 0.65) calls.push({ pri: 64, tag: ['a', 'Funnel'], t: 'Discovery show-up is ' + AL.pct(showUp), w: 'Extend Smallest.ai reminder calls to T-24h and T-2h for every booked call, and add a WhatsApp confirm.' });
    var od = invRows.filter(function (r) { return r.overdueBy > 0; });
    if (od.length) {
      var oldest = od.reduce(function (m, r) { return r.age > m.age ? r : m; }, od[0]);
      calls.push({ pri: 84, tag: ['r', 'Chase'], t: 'Chase ' + od.length + ' overdue invoice' + (od.length > 1 ? 's' : '') + ' worth ' + AL.inr(AL.sum(od, function (r) { return r.amount; })),
        w: 'Oldest: ' + oldest.student + ', ' + AL.inr(oldest.amount) + ', ' + oldest.age + ' days since issue. Advisor call plus Razorpay payment link today.' });
    }
    if (renRows.length) {
      var low = renRows.filter(function (r) { return r.g && r.g.level === 'r'; });
      calls.push({ pri: low.length ? 82 : 50, tag: [low.length ? 'r' : 'g', 'Renew'], t: renRows.length + ' trial renewal' + (renRows.length > 1 ? 's' : '') + ' due in 30 days' + (low.length ? ', ' + low.length + ' at risk' : ''),
        w: low.length ? 'Low engagement: ' + low.map(function (r) { return r.student + ' (' + (r.g.lastAgo == null ? 'never opened app' : 'no app open for ' + r.g.lastAgo + 'd') + ')'; }).join(', ') + '. Book parent + advisor review before the trial ends.'
          : 'All are engaged. Send the progress report and upgrade offer 10 days before the trial ends.' });
    }
    calls.sort(function (a, b) { return b.pri - a.pri; });
    var top = calls.slice(0, 6);
    document.getElementById('calls').innerHTML = top.length ? top.map(function (c) {
      return '<li><div><div class="t">' + AL.chip(c.tag[0], c.tag[1]) + ' ' + AL.esc(c.t) + '</div><div class="w">' + AL.esc(c.w) + '</div></div></li>';
    }).join('') : '<li><div class="t">Nothing urgent this period.</div></li>';
  }

  // ---------- wiring ----------
  var R;
  function renderAll() {
    var k = renderKPIs(R);
    renderRevenue(R);
    renderMix(R, k);
    renderFunnel(R);
    var rows = creativeStats(R.from, R.to);
    renderCampaigns(rows);
    renderBubble(rows);
    renderLP(R);
    var inv = renderInvoices(R);
    var ren = renderRenewals(R);
    renderCalls(R, k, rows, inv, ren);
  }
  AL.segmented(document.getElementById('src-chips'), [['all', 'All'], ['meta', 'Meta'], ['organic', 'Organic'], ['referral', 'Referral'], ['workshop', 'Workshop']], srcFilter,
    function (v) { srcFilter = v; renderFunnel(R); }, 'Lead source');
  AL.segmented(document.getElementById('obj-chips'), [['all', 'All'], ['program', 'Program'], ['workshop', 'Workshop']], objFilter,
    function (v) { objFilter = v; renderCampaigns(creativeStats(R.from, R.to)); }, 'Campaign objective');
  R = AL.mountTimeline(document.getElementById('timeline'), function (r) { R = r; renderAll(); });
  renderAll();
})();
