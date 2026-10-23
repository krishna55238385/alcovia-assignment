/*
 * Alcovia Ops — deterministic dummy data.
 * Row-level tables follow the shared data model (SPEC.md). Everything is generated
 * from seeded mulberry32 streams, so every reload produces identical numbers.
 * In production these tables live in Supabase, fed by n8n from ClickUp, Razorpay,
 * Meta Ads, the Alcovia app and wearables.
 */
(function (root) {
  'use strict';

  // ---------- seeded RNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeR(seed) {
    var r = mulberry32(seed);
    var R = {
      u: r,
      int: function (a, b) { return a + Math.floor(r() * (b - a + 1)); },
      chance: function (p) { return r() < p; },
      pick: function (arr) { return arr[Math.floor(r() * arr.length)]; },
      wpick: function (items, w) {
        var tot = 0, i; for (i = 0; i < w.length; i++) tot += w[i];
        var x = r() * tot;
        for (i = 0; i < items.length; i++) { x -= w[i]; if (x < 0) return items[i]; }
        return items[items.length - 1];
      },
      norm: function (m, s) {
        var u = 1 - r(), v = r();
        return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
      poisson: function (l) {
        if (l <= 0) return 0;
        var L = Math.exp(-l), k = 0, p = 1;
        do { k++; p *= r(); } while (p > L);
        return k - 1;
      },
      shuffle: function (arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
      }
    };
    return R;
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }

  // ---------- dates (UTC day numbers) ----------
  var MS = 864e5;
  function dn(iso) { return Math.round(Date.parse(iso + 'T00:00:00Z') / MS); }
  function ds(n) { return new Date(n * MS).toISOString().slice(0, 10); }
  function dow(n) { return new Date(n * MS).getUTCDay(); } // 0 = Sun
  function dom(n) { return new Date(n * MS).getUTCDate(); }
  function monthIdx(n) { return new Date(n * MS).getUTCMonth(); } // 0 = Jan

  var START = dn('2026-04-01'), TODAY = dn('2026-10-23'), END = dn('2026-10-31');
  var AI_CALLS_LIVE = dn('2026-08-15');   // Smallest.ai reminder calls switched on
  var APP_UPLIFT = dn('2026-10-01');      // Realm season 2 + streaks shipped

  var g = makeR(11);   // GTM stream
  var s = makeR(29);   // student stream

  // =====================================================================
  // GTM
  // =====================================================================
  var monthly_targets = [
    { month: '2026-04-01', revenue_target: 1000000, new_students_target: 6, workshop_seats_target: 40 },
    { month: '2026-05-01', revenue_target: 1100000, new_students_target: 7, workshop_seats_target: 45 },
    { month: '2026-06-01', revenue_target: 1200000, new_students_target: 7, workshop_seats_target: 45 },
    { month: '2026-07-01', revenue_target: 1300000, new_students_target: 8, workshop_seats_target: 50 },
    { month: '2026-08-01', revenue_target: 1450000, new_students_target: 9, workshop_seats_target: 50 },
    { month: '2026-09-01', revenue_target: 1600000, new_students_target: 10, workshop_seats_target: 55 },
    { month: '2026-10-01', revenue_target: 1800000, new_students_target: 11, workshop_seats_target: 60 }
  ];

  var campaigns = [
    { id: 'C1', name: 'Program · Parents 35–50 · Metros', objective: 'program', status: 'active' },
    { id: 'C2', name: 'Program · Retargeting · Site + IG engagers', objective: 'program', status: 'active' },
    { id: 'C3', name: 'Workshops · Fortnightly seats', objective: 'workshop', status: 'active' },
    { id: 'C4', name: 'Program · Lookalike 1% enrolled parents', objective: 'program', status: 'active' }
  ];

  var landing_pages = [
    { id: 'LP1', name: 'Apply — short form', url: 'alcovia.life/apply', objective: 'program', _load: 1650, _cvr: 0.040, _sts: 0.62, _bounce: 0.41 },
    { id: 'LP2', name: 'The Alcovian Way — long-form story', url: 'alcovia.life/the-alcovian-way', objective: 'program', _load: 2350, _cvr: 0.034, _sts: 0.56, _bounce: 0.47,
      _slowFrom: '2026-09-02', _slowLoad: 4650, _slowCvr: 0.016, _slowSts: 0.44, _slowBounce: 0.66 },
    { id: 'LP3', name: 'FAQ + apply (retargeting)', url: 'alcovia.life/faq-apply', objective: 'program', _load: 1900, _cvr: 0.056, _sts: 0.66, _bounce: 0.37 },
    { id: 'LP4', name: 'Workshops — seat booking', url: 'alcovia.life/workshops', objective: 'workshop', _load: 2150, _cvr: 0.048, _sts: 0.70, _bounce: 0.40 }
  ];
  var LPM = {}; landing_pages.forEach(function (l) { LPM[l.id] = l; });

  // _b daily budget, _ctr %, _cpm, frequency start/growth/days-to-peak, CTR decay at peak, lead quality, closing multiplier
  var ad_creatives = [
    { id: 'A1', campaign_id: 'C1', name: 'Parent testimonial v1', format: 'video', landing_page_id: 'LP1', _s: '2026-02-15', _e: '2026-07-14', _b: 950, _ctr: 1.30, _cpm: 175, _f0: 1.30, _fg: 1.10, _fd: 105, _dec: 0.20, _q: 0.30, _cv: 1.0 },
    { id: 'A2', campaign_id: 'C1', name: 'Parent testimonial v2', format: 'video', landing_page_id: 'LP1', _s: '2026-07-15', _e: null, _b: 1050, _ctr: 1.60, _cpm: 175, _f0: 1.35, _fg: 2.10, _fd: 100, _dec: 0.40, _q: 0.31, _cv: 1.05 },
    { id: 'A3', campaign_id: 'C1', name: 'Founder explainer (90s)', format: 'video', landing_page_id: 'LP2', _s: '2026-02-15', _e: null, _b: 520, _ctr: 0.95, _cpm: 165, _f0: 1.20, _fg: 0.60, _fd: 200, _dec: 0.10, _q: 0.33, _cv: 1.0 },
    { id: 'A4', campaign_id: 'C1', name: 'A day in the life of an Alcovian', format: 'carousel', landing_page_id: 'LP1', _s: '2026-05-10', _e: null, _b: 720, _ctr: 1.65, _cpm: 170, _f0: 1.15, _fg: 0.70, _fd: 160, _dec: 0.08, _q: 0.37, _cv: 1.40 },
    { id: 'A5', campaign_id: 'C1', name: 'Report-card anxiety hook', format: 'static', landing_page_id: 'LP2', _s: '2026-06-01', _e: null, _b: 430, _ctr: 0.80, _cpm: 160, _f0: 1.20, _fg: 0.50, _fd: 140, _dec: 0.15, _q: 0.22, _cv: 0.70 },
    { id: 'A6', campaign_id: 'C2', name: 'Retargeting — outcomes carousel', format: 'carousel', landing_page_id: 'LP3', _s: '2026-04-15', _e: null, _b: 360, _ctr: 2.20, _cpm: 210, _f0: 2.00, _fg: 0.60, _fd: 190, _dec: 0.10, _q: 0.42, _cv: 1.30 },
    { id: 'A7', campaign_id: 'C2', name: 'Retargeting — parent FAQ', format: 'static', landing_page_id: 'LP3', _s: '2026-06-15', _e: null, _b: 260, _ctr: 1.40, _cpm: 205, _f0: 1.80, _fg: 0.50, _fd: 130, _dec: 0.10, _q: 0.38, _cv: 1.0 },
    { id: 'A8', campaign_id: 'C3', name: 'Workshop — public speaking teaser', format: 'video', landing_page_id: 'LP4', _s: '2026-02-15', _e: null, _b: 420, _ctr: 1.70, _cpm: 150, _f0: 1.30, _fg: 0.70, _fd: 200, _dec: 0.10, _q: 0.18, _cv: 1.0 },
    { id: 'A9', campaign_id: 'C3', name: 'Workshop — seats filling fast', format: 'static', landing_page_id: 'LP4', _s: '2026-02-15', _e: null, _b: 300, _ctr: 1.20, _cpm: 150, _f0: 1.30, _fg: 0.70, _fd: 200, _dec: 0.15, _q: 0.15, _cv: 1.0 },
    { id: 'A10', campaign_id: 'C4', name: 'Lookalike — Alcovian outcomes reel', format: 'video', landing_page_id: 'LP1', _s: '2026-08-01', _e: null, _b: 700, _ctr: 1.45, _cpm: 185, _f0: 1.10, _fg: 0.60, _fd: 120, _dec: 0.05, _q: 0.34, _cv: 1.30 },
    { id: 'A11', campaign_id: 'C4', name: 'Lookalike — IIT mentor hook', format: 'static', landing_page_id: 'LP2', _s: '2026-10-03', _e: null, _b: 780, _ctr: 2.05, _cpm: 185, _f0: 1.05, _fg: 0.20, _fd: 30, _dec: 0.0, _q: 0.0, _cv: 0 }
  ];

  var MONTH_SPEND = { 1: 1.1, 2: 1.15, 3: 1.25, 4: 1.1, 5: 1.0, 6: 1.0, 7: 0.95, 8: 0.95, 9: 0.95 };

  var ad_daily = [], lp_daily = [], leads = [];
  var leadSeq = 0;

  var DROP = {
    unq: ['Not ICP — grade/geo', 'Student enquiry, not parent', 'Only wants tuition', 'Budget well below program'],
    noset: ['Unresponsive after 3 follow-ups', 'Asked to reconnect next term'],
    noshow: ['No-show on discovery call (2 tries)'],
    amb: ['Teen not keen on commitment', 'Parent wants marks-only coaching', 'Ambition unclear — revisit later'],
    arch: ['Schedule clash with coaching', 'Price — wants instalments'],
    close: ['Price', 'Chose another program', 'Timing — board exams']
  };

  function newLead(c, source, campaign_id, ad_id) {
    leadSeq++;
    var L = {
      id: 'L' + pad(leadSeq, 5), created_at: ds(c), source: source, campaign_id: campaign_id || null, ad_id: ad_id || null,
      clickup_task_id: 'CU-' + (86000 + leadSeq), teen_grade: g.wpick([8, 9, 10, 11, 12], [14, 24, 26, 20, 16]),
      qualified_at: null, discovery_set_at: null, discovery_showed_at: null, ambition_interview_at: null,
      architect_session_at: null, outcome: 'open', closed_at: null, drop_reason: null
    };
    leads.push(L);
    return L;
  }

  // Walk a lead through ClickUp stages; stops at TODAY (stays open) or drops with a reason.
  function progress(L, q, setP, cv, fullP) {
    var c = dn(L.created_at), t;
    function drop(list, last) {
      var cl = last + g.int(2, 10);
      if (cl <= TODAY) { L.outcome = 'dropped'; L.closed_at = ds(cl); L.drop_reason = g.pick(list); }
    }
    if (!g.chance(q)) { drop(DROP.unq, c - 1); return; }
    t = c + g.int(0, 2); if (t > TODAY) return; L.qualified_at = ds(t);
    if (!g.chance(setP)) { drop(DROP.noset, t + 4); return; }
    t += g.int(1, 4); if (t > TODAY) return; L.discovery_set_at = ds(t);
    t += g.int(2, 6); if (t > TODAY) return;
    var showP = t >= AI_CALLS_LIVE ? 0.71 : 0.57;
    if (!g.chance(showP)) { drop(DROP.noshow, t); return; }
    L.discovery_showed_at = ds(t);
    if (!g.chance(0.55)) { drop(DROP.amb, t); return; }
    t += g.int(3, 8); if (t > TODAY) return; L.ambition_interview_at = ds(t);
    if (!g.chance(0.72)) { drop(DROP.arch, t); return; }
    t += g.int(3, 7); if (t > TODAY) return; L.architect_session_at = ds(t);
    if (!g.chance(clamp(0.6 * cv, 0, 0.92))) { drop(DROP.close, t); return; }
    t += g.int(1, 6); if (t > TODAY) return;
    L.closed_at = ds(t); L.outcome = g.chance(fullP) ? 'full' : 'trial';
  }

  var lpAgg = {}; // date|lp -> agg
  for (var d = START - 45; d <= TODAY; d++) {
    var mf = MONTH_SPEND[monthIdx(d)] || 1;
    for (var ai = 0; ai < ad_creatives.length; ai++) {
      var ad = ad_creatives[ai];
      var st = dn(ad._s), en = ad._e ? dn(ad._e) : TODAY;
      if (d < st || d > en) continue;
      var age = d - st, pk = Math.min(1, age / ad._fd);
      var spend = Math.round(ad._b * mf * clamp(g.norm(1, 0.1), 0.7, 1.3));
      var cpm = ad._cpm * clamp(g.norm(1, 0.07), 0.8, 1.2) * (1 + age / 700);
      var imp = Math.round(spend / cpm * 1000);
      var freq = Math.round((ad._f0 + ad._fg * pk + g.norm(0, 0.04)) * 100) / 100;
      var ctr = ad._ctr / 100 * (1 - ad._dec * pk) * clamp(g.norm(1, 0.08), 0.75, 1.25);
      var clicks = Math.round(imp * ctr);
      var lp = LPM[ad.landing_page_id];
      var slow = lp._slowFrom && d >= dn(lp._slowFrom);
      var sessions = Math.round(clicks * 0.88);
      var nLeads = g.poisson(sessions * (slow ? lp._slowCvr : lp._cvr));
      ad_daily.push({ date: ds(d), ad_id: ad.id, spend: spend, impressions: imp, reach: Math.round(imp / freq), clicks: clicks, leads: nLeads, frequency: freq });
      var k = ds(d) + '|' + lp.id;
      var a = lpAgg[k] || (lpAgg[k] = { date: ds(d), landing_page_id: lp.id, sessions: 0, form_submits: 0 });
      a.sessions += sessions; a.form_submits += nLeads;
      var camp = ad.campaign_id;
      for (var li = 0; li < nLeads; li++) {
        var L = newLead(d, 'meta', camp, ad.id);
        progress(L, ad._q, camp === 'C2' ? 0.5 : 0.42, ad._cv, 0.36);
      }
    }
    // organic + referral inbound (website, Instagram DMs, WhatsApp community, parent referrals)
    var grow = 1 + (d - START) / 400;
    var no = g.poisson(1.15 * grow), nr = g.poisson(0.32 * grow);
    for (var oi = 0; oi < no; oi++) progress(newLead(d, 'organic'), 0.45, 0.5, 1.05, 0.4);
    for (var ri = 0; ri < nr; ri++) progress(newLead(d, 'referral'), 0.72, 0.72, 1.25, 0.55);
  }
  Object.keys(lpAgg).sort().forEach(function (k) {
    var a = lpAgg[k], lp = LPM[a.landing_page_id];
    var slow = lp._slowFrom && dn(a.date) >= dn(lp._slowFrom);
    var sts = slow ? lp._slowSts : lp._sts, bn = slow ? lp._slowBounce : lp._bounce;
    lp_daily.push({
      date: a.date, landing_page_id: a.landing_page_id, sessions: a.sessions,
      bounces: Math.round(a.sessions * clamp(g.norm(bn, 0.03), 0.2, 0.85)),
      form_starts: Math.max(a.form_submits, Math.round(a.form_submits / clamp(g.norm(sts, 0.04), 0.3, 0.9))),
      form_submits: a.form_submits,
      avg_load_ms: Math.round((slow ? lp._slowLoad : lp._load) * clamp(g.norm(1, 0.06), 0.85, 1.2))
    });
  });

  // ---------- workshops + bookings (Razorpay, ₹3,999/seat) ----------
  var WS_TITLES = ['Public speaking for teens', 'Exam strategy masterclass', 'Build your first portfolio', 'Money basics for teens',
    'Personal branding 101', 'Deep focus & time management', 'Debate & critical thinking', 'Design thinking sprint'];
  var workshops = [], workshop_bookings = [];
  var c3ByDay = {};
  leads.forEach(function (L) { if (L.campaign_id === 'C3') (c3ByDay[L.created_at] = c3ByDay[L.created_at] || []).push(L); });
  var wi = 0, bkSeq = 0;
  for (var wd = dn('2026-04-04'); wd <= END; wd += 14, wi++) {
    var W = { id: 'W' + pad(wi + 1, 2), date: ds(wd), title: WS_TITLES[wi % WS_TITLES.length], seats_capacity: 30 };
    workshops.push(W);
    var seats = clamp(Math.round(15 + wi * 0.75 + g.norm(0, 2.5)), 15, 30);
    for (var b = 0; b < seats; b++) {
      var bd = wd - g.wpick([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], [10, 11, 10, 9, 8, 8, 7, 7, 6, 6, 6, 6, 6]);
      if (bd > TODAY) continue;
      var lead = null;
      if (g.chance(0.45)) {
        for (var back = 0; back < 14 && !lead; back++) {
          var pool = c3ByDay[ds(bd - back)];
          if (pool) for (var pi = 0; pi < pool.length; pi++) if (!pool[pi]._booked) { lead = pool[pi]; break; }
        }
      }
      if (!lead) { lead = newLead(bd, 'workshop', null, null); progress(lead, 0.36, 0.5, 1.0, 0.35); }
      lead._booked = true;
      bkSeq++;
      workshop_bookings.push({ id: 'B' + pad(bkSeq, 4), workshop_id: W.id, lead_id: lead.id, razorpay_payment_id: 'pay_' + (0x4F2A91 + bkSeq * 7919).toString(36).toUpperCase(), amount: 3999, paid_at: ds(bd) });
    }
  }
  leads.sort(function (a, b) { return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0; });
  leads.forEach(function (L) { delete L._booked; });

  // ---------- enrollments + invoices ----------
  var FIRST = ['Aditi', 'Rahul', 'Pranav', 'Sneha', 'Ira', 'Dhruv', 'Riya', 'Yash', 'Nikhil', 'Pooja', 'Zara', 'Om', 'Lavanya', 'Siddharth', 'Aarohi', 'Tanvi',
    'Neel', 'Avni', 'Kunal', 'Jiya', 'Parth', 'Mira', 'Ritvik', 'Sara', 'Dev', 'Anaya', 'Shaurya', 'Kavya', 'Rudra', 'Prisha'];
  var LAST = ['Jain', 'Desai', 'Mishra', 'Saxena', 'Bose', 'Khanna', 'Patil', 'Thakur', 'Dutta', 'Mukherjee', 'Rastogi', 'Goyal', 'Hegde', 'Naidu', 'Arora', 'Ahuja'];
  var COHORT_NAMES = ['Ishita Reddy', 'Diya Sharma', 'Vihaan Kapoor', 'Arjun Nair', 'Saanvi Gupta', 'Myra Joshi', 'Reyansh Iyer', 'Anika Menon', 'Advait Kulkarni', 'Kiara Singh',
    'Aarav Malhotra', 'Vivaan Chopra', 'Aadhya Rao', 'Rohan Verma', 'Tara Banerjee', 'Ayaan Shetty', 'Meher Sethi', 'Krish Agarwal', 'Navya Pillai', 'Kabir Bhatia'];

  var enrollments = [], invoices = [];
  var enSeq = 0, invSeq = 0, xSeq = 0;
  function addEnrollment(student_id, name, lead_id, plan, startDay, amount, renewal_of) {
    enSeq++;
    var E = { id: 'E' + pad(enSeq, 3), student_id: student_id, student_name: name, lead_id: lead_id, plan: plan,
      start_date: ds(startDay), end_date: ds(startDay + (plan === 'trial_3m' ? 90 : 365)), amount: amount, status: 'active', renewal_of: renewal_of || null };
    enrollments.push(E);
    var parts = (plan === 'trial_3m' || g.chance(0.5)) ? [[0, amount]] : [[0, Math.round(amount / 2)], [60, amount - Math.round(amount / 2)]];
    parts.forEach(function (p, i) {
      var iss = startDay + p[0];
      if (iss > TODAY) return;
      var delay = g.wpick([0, 1, 2, 3, 4, 5, 6, 8, 10, 13], [18, 16, 14, 12, 10, 8, 7, 6, 5, 4]);
      var paid = iss + delay;
      invSeq++;
      invoices.push({ id: 'INV-' + pad(invSeq, 4), enrollment_id: E.id, instalment: i + 1, issued_at: ds(iss), due_at: ds(iss + 7), amount: p[1],
        paid_at: paid <= TODAY ? ds(paid) : null, status: 'paid', razorpay_invoice_id: 'inv_' + (0x1A2B3C + invSeq * 104729).toString(36) });
    });
    return E;
  }

  // Founding cohort (Jan–Mar 2026, before the tracked window; their 2nd instalments land in Apr–May)
  var FOUNDER_STARTS = ['2026-01-19', '2026-01-28', '2026-02-04', '2026-02-11', '2026-02-18', '2026-02-25', '2026-03-04', '2026-03-11', '2026-03-18', '2026-03-25'];
  FOUNDER_STARTS.forEach(function (sd, i) {
    addEnrollment('S' + pad(i + 1, 2), COHORT_NAMES[i], null, 'full_program', dn(sd), 180000);
  });

  leads.forEach(function (L) {
    if (L.outcome !== 'trial' && L.outcome !== 'full') return;
    xSeq++;
    var nm = FIRST[(xSeq * 7) % FIRST.length] + ' ' + LAST[(xSeq * 5) % LAST.length];
    var full = L.outcome === 'full';
    var E = addEnrollment('X' + pad(xSeq, 3), nm, L.id, full ? 'full_program' : 'trial_3m', dn(L.closed_at),
      full ? g.wpick([160000, 180000, 195000], [25, 55, 20]) : 45000);
    if (!full && dn(E.end_date) <= TODAY) {
      if (g.chance(0.52)) {
        E.status = 'renewed';
        addEnrollment(E.student_id, E.student_name, L.id, 'full_program', dn(E.end_date), 135000, E.id);
      } else E.status = 'churned';
    }
  });

  // Story: two overdue 2nd instalments (oldest ~5 weeks)
  function forceOverdue(target) {
    var best = null, bd = 1e9;
    invoices.forEach(function (iv) {
      if (iv.instalment !== 2 || iv._forced) return;
      var dd = Math.abs(dn(iv.due_at) - dn(target));
      if (dd < bd) { bd = dd; best = iv; }
    });
    if (best) { best.paid_at = null; best._forced = true; }
  }
  forceOverdue('2026-09-17'); forceOverdue('2026-10-02');
  invoices.forEach(function (iv) {
    delete iv._forced;
    iv.status = iv.paid_at ? 'paid' : (dn(iv.due_at) < TODAY ? 'overdue' : 'unpaid');
  });

  // =====================================================================
  // STUDENTS (20 Alcovians on the app)
  // =====================================================================
  var advisors = [{ id: 'AD1', name: 'Ritika Sen' }, { id: 'AD2', name: 'Aditya Varma' }, { id: 'AD3', name: 'Neha Bhargava' }];
  var pods = [{ id: 'P1', name: 'Orion' }, { id: 'P2', name: 'Vega' }, { id: 'P3', name: 'Lyra' }, { id: 'P4', name: 'Nova' }];

  // pick 10 in-window enrollments: trials renewing in the next 30 days first, then earliest active full-program sign-ups
  var trialsDue = enrollments.filter(function (e) {
    return e.plan === 'trial_3m' && e.status === 'active' && dn(e.end_date) > TODAY && dn(e.end_date) <= TODAY + 30;
  }).slice(0, 4);
  var fullsActive = enrollments.filter(function (e) { return e.plan === 'full_program' && e.status === 'active' && e.student_id[0] === 'X' && !e.renewal_of; });
  var renewedActive = enrollments.filter(function (e) { return e.plan === 'full_program' && e.status === 'active' && e.renewal_of; });
  var picks = trialsDue.slice();
  var others = fullsActive.slice(0, 4).concat(renewedActive.slice(0, 2)).concat(fullsActive.slice(4));
  for (var oi2 = 0; picks.length < 10 && oi2 < others.length; oi2++) picks.push(others[oi2]);
  picks.forEach(function (E, k) {
    var oldId = E.student_id, newId = 'S' + pad(11 + k, 2), nm = COHORT_NAMES[10 + k];
    enrollments.forEach(function (x) { if (x.student_id === oldId) { x.student_id = newId; x.student_name = nm; } });
  });

  var students = [];
  var GRADES = [9, 11, 10, 12, 9, 10, 11, 9, 10, 12, 10, 11, 9, 10, 12, 11, 9, 10, 11, 10];
  for (var si = 0; si < 20; si++) {
    var sid = 'S' + pad(si + 1, 2);
    var ens = enrollments.filter(function (e) { return e.student_id === sid; });
    if (!ens.length) continue;
    var first = ens.reduce(function (m, e) { return e.start_date < m ? e.start_date : m; }, '9999');
    var cur = ens[ens.length - 1];
    students.push({ id: sid, name: COHORT_NAMES[si], grade: GRADES[si], pod_id: pods[si % 4].id, advisor_id: advisors[(si + Math.floor(si / 4)) % 3].id,
      joined_at: first, plan: cur.plan, enrollment_id: cur.id });
  }

  // personas
  var FOCUS_REG = { S01: 1, S04: 1, S06: 1, S13: 1, S16: 1 };
  var NO_WEAR = { S05: 1, S08: 1, S10: 1, S14: 1, S17: 1, S19: 1 };
  var WEAR_SRC = ['apple', 'samsung', 'whoop', 'garmin'];
  var slideA = students.filter(function (x) { return x.plan === 'trial_3m'; })[0];
  students.forEach(function (st, i) {
    st._e = clamp(s.norm(1, 0.18), 0.65, 1.35);
    st._ab = clamp(s.norm(0.70, 0.08), 0.52, 0.88);
    st._adh = clamp(s.norm(0.78, 0.07), 0.6, 0.92);
    st._task = clamp(s.norm(0.88, 0.05), 0.75, 0.97);
    st._ontime = clamp(s.norm(0.82, 0.07), 0.65, 0.95);
    st._pace = clamp(s.norm(1.0, 0.12), 0.8, 1.25);
    st._sleep = clamp(s.norm(7.4, 0.3), 6.9, 8.1);
    st._act = clamp(s.norm(55, 12), 30, 85);
    st._att = clamp(s.norm(0.92, 0.04), 0.82, 0.99);
    st._rate = s.norm(0, 0.2);
    st._skills = [0, 1, 2, 3, 4, 5].map(function () { return clamp(s.norm(3.0, 0.35), 2.2, 3.8); });
    st._focusReg = !!FOCUS_REG[st.id];
    st._tuition = s.chance(0.7);
    st.wearable_source = NO_WEAR[st.id] ? null : WEAR_SRC[i % 4];
    st._slide = null;
    if (FOCUS_REG[st.id]) { st._e = Math.max(st._e, 1.1); st._ab = Math.max(st._ab, 0.74); }
  });
  if (slideA) slideA._slide = 'A';
  var SB = students.filter(function (x) { return x.id === 'S02'; })[0]; if (SB) SB._slide = 'B';
  var SC = students.filter(function (x) { return x.id === 'S03'; })[0]; if (SC) { SC._slide = 'C'; SC._ab = 0.74; }

  function mods(st, d) {
    var m = { app: 1, focus: 1, quiz: 0, sleep: 0, adh: 1, task: 1, ontime: 1, att: 1, quizP: 1 };
    if (st._slide === 'A') {
      if (d >= dn('2026-10-12')) { m.app = 0; m.focus = 0; m.quizP = 0; m.adh = 0.55; m.att = 0.6; }
      else if (d >= dn('2026-09-26')) { m.app = 0.45; m.focus = 0.4; m.quizP = 0.5; m.adh = 0.8; m.att = 0.85; }
    }
    if (st._slide === 'B' && d >= dn('2026-09-01')) { m.task = 0.62; m.ontime = 0.45; m.adh = 0.62; }
    if (st._slide === 'C' && d >= dn('2026-09-20')) {
      var k = Math.min(1, (d - dn('2026-09-20')) / 20);
      m.sleep = -1.6 * k; m.quiz = -0.24 * k; m.att = 1 - 0.3 * k; m.adh = 1 - 0.2 * k;
    }
    return m;
  }

  var app_sessions = [], focus_sessions = [], quizzes = [], quiz_attempts = [], timetable_blocks = [], wearable_daily = [];
  var FEAT = ['realm', 'syllabus', 'planner', 'tasks', 'goals', 'wellness', 'other'];
  var FW = [52, 12, 10, 10, 6, 5, 5];
  var FDUR = { home: [40, 110], realm: [60, 210], syllabus: [50, 160], planner: [30, 110], tasks: [25, 80], goals: [25, 80], wellness: [20, 60], other: [15, 50], focus: [20, 55], quiz: [45, 110] };
  var QUIZ_TOPICS = ['Algebra sprint', 'Physics concepts', 'Grammar & usage', 'History dates', 'Chemistry basics', 'Mental maths', 'Reading comprehension', 'Geography map quiz', 'Logical reasoning', 'Biology diagrams'];

  var quizHeld = {};
  for (var qd = START; qd <= TODAY; qd++) {
    var held = !((dow(qd) === 0 && s.chance(0.6)) || s.chance(0.03));
    if (held) { quizHeld[qd] = 'Q' + pad(quizzes.length + 1, 3); quizzes.push({ id: quizHeld[qd], quiz_date: ds(qd), topic: QUIZ_TOPICS[(qd - START) % QUIZ_TOPICS.length] }); }
  }
  var asSeq = 0, fsSeq = 0;
  function appVisit(st, d, f, mult) {
    asSeq++;
    var r = FDUR[f];
    app_sessions.push({ id: asSeq, student_id: st.id, started_at: ds(d), duration_s: Math.round(s.int(r[0], r[1]) * (mult || 1)), feature: f });
  }

  students.forEach(function (st) {
    var from = Math.max(dn(st.joined_at), START);
    for (var d = from; d <= TODAY; d++) {
      var m = mods(st, d);
      var upl = d >= APP_UPLIFT ? 1.22 : 1;
      var we = dow(d) === 0 || dow(d) === 6;
      // app browsing (Home + Realm dominate)
      if (s.chance(clamp(0.33 * st._e * upl * m.app * (we ? 1.1 : 1), 0, 0.95))) {
        var ns = 1 + (s.chance(0.32) ? 1 : 0) + (s.chance(0.07) ? 1 : 0);
        var dm = d >= APP_UPLIFT ? 1.12 : 1;
        for (var k = 0; k < ns; k++) {
          appVisit(st, d, 'home', dm);
          var nv = 1 + (s.chance(0.45) ? 1 : 0) + (s.chance(0.15) ? 1 : 0);
          for (var v = 0; v < nv; v++) appVisit(st, d, s.wpick(FEAT, FW), dm);
        }
      }
      // focus timer (5 regulars)
      var fp = (st._focusReg ? 0.72 : 0.035) * m.focus;
      if (s.chance(fp)) {
        var nf = st._focusReg ? s.wpick([1, 2, 3], [45, 40, 15]) : 1;
        appVisit(st, d, 'focus');
        for (var f = 0; f < nf; f++) {
          var planned = s.wpick([25, 45, 50], [40, 35, 25]);
          var actual = Math.round(planned * clamp(s.norm(0.88, 0.12), 0.35, 1.0));
          fsSeq++;
          focus_sessions.push({ id: fsSeq, student_id: st.id, started_at: ds(d), planned_min: planned, actual_min: actual, completed: actual >= planned * 0.9 });
        }
      }
      // daily quiz (in-app)
      if (quizHeld[d] && s.chance(clamp((st._focusReg ? 0.65 : 0.36) * st._e * m.quizP, 0, 0.95))) {
        var acc = clamp(s.norm(st._ab + m.quiz, 0.12), 0.1, 1);
        quiz_attempts.push({ quiz_id: quizHeld[d], student_id: st.id, score: Math.round(acc * 10), total: 10, submitted_at: ds(d) });
        appVisit(st, d, 'quiz');
      }
      // timetable adherence
      var plannedSS = we ? 150 : 90;
      timetable_blocks.push({ id: timetable_blocks.length + 1, student_id: st.id, date: ds(d), kind: 'self_study', planned_min: plannedSS,
        done_min: Math.round(plannedSS * clamp(s.norm(st._adh * m.adh, 0.12), 0, 1.05)) });
      if (st._tuition && !we) timetable_blocks.push({ id: timetable_blocks.length + 1, student_id: st.id, date: ds(d), kind: 'tuition', planned_min: 60, done_min: s.chance(0.93 * Math.min(1, m.adh + 0.2)) ? 60 : 0 });
      // wearables
      if (st.wearable_source) {
        var examDip = (d >= dn('2026-09-14') && d <= dn('2026-09-30')) ? -0.35 : 0;
        var sl = clamp(s.norm(st._sleep + m.sleep + examDip + (we ? 0.4 : 0), 0.5), 4, 10);
        var act = Math.round(clamp(s.norm(st._act * (we ? 1.2 : 1), 14), 5, 180));
        wearable_daily.push({ student_id: st.id, date: ds(d), source: st.wearable_source, active_min: act,
          strain: Math.round(clamp(s.norm(7 + act / 18, 1.8), 2, 20) * 10) / 10,
          sleep_hours: Math.round(sl * 10) / 10, recovery_pct: Math.round(clamp(30 + (sl - 5) * 15 + s.norm(0, 7), 5, 99)) });
      }
    }
  });

  // ---------- activities + attendance ----------
  var activities = [], activity_attendance = [];
  var ADV = {}; advisors.forEach(function (a) { ADV[a.id] = a.name; });
  var CONDUCT = { academic_session: 0.97, workshop: 1, pod_session: 0.95, peer_session: 0.88, mentor_call: 0.93, branding_shoot: 0.8,
    podcast: 0.85, competition_prep: 0.9, parent_child: 0.86, out_of_city: 1 };
  var ATT = { academic_session: 0.93, workshop: 0.78, pod_session: 0.92, peer_session: 0.85, mentor_call: 0.97, branding_shoot: 0.95,
    podcast: 0.95, competition_prep: 0.82, parent_child: 0.8, out_of_city: 0.9 };
  var RATE = { academic_session: 4.0, workshop: 4.4, pod_session: 4.3, peer_session: 3.9, mentor_call: 4.5, branding_shoot: 4.6,
    podcast: 4.5, competition_prep: 3.9, parent_child: 4.1, out_of_city: 4.8 };
  var SUBJ_ROT = ['Maths deep-dive', 'Science lab concepts', 'English writing clinic', 'Exam technique'];
  var acSeq = 0;
  function joinedBy(d, filter) { return students.filter(function (st) { return dn(st.joined_at) <= d && (!filter || filter(st)); }); }
  function addActivity(type, title, d, host, pod_id, parts, extra) {
    if (d < START || d > TODAY || !parts.length) return;
    acSeq++;
    var p = CONDUCT[type];
    if (type === 'mentor_call' && host === 'Aditya Varma' && d >= dn('2026-09-01')) p = 0.6;
    if (type === 'academic_session' && d >= dn('2026-09-14') && d <= dn('2026-09-27')) p = 0.85; // exam fortnight reschedules
    var done = s.chance(p);
    var A = { id: 'AC' + pad(acSeq, 4), type: type, title: title, scheduled_at: ds(d), conducted_at: done ? ds(d) : null, host: host, pod_id: pod_id || null,
      participants: parts.map(function (x) { return x.id; }) };
    if (extra) for (var k in extra) A[k] = extra[k];
    activities.push(A);
    if (!done) return;
    parts.forEach(function (st) {
      var m = mods(st, d);
      var att = s.chance(clamp(ATT[type] * st._att * m.att, 0, 0.995));
      var row = { activity_id: A.id, student_id: st.id, date: A.scheduled_at, type: type, attended: att, rating: null, would_recommend: null, soft_skills: null };
      if (att) {
        row.rating = Math.round(clamp(s.norm(RATE[type] + st._rate, 0.55), 1, 5));
        row.would_recommend = row.rating >= 4 ? s.chance(0.93) : s.chance(0.3);
        if (type === 'workshop') {
          var gr = (d - START) / 205 * 0.55;
          row.soft_skills = {
            communication: Math.round(clamp(s.norm(st._skills[0] + gr, 0.3), 1, 5) * 10) / 10,
            confidence: Math.round(clamp(s.norm(st._skills[1] + gr * 1.2, 0.3), 1, 5) * 10) / 10,
            teamwork: Math.round(clamp(s.norm(st._skills[2] + gr * 0.8, 0.3), 1, 5) * 10) / 10,
            critical_thinking: Math.round(clamp(s.norm(st._skills[3] + gr * 0.7, 0.3), 1, 5) * 10) / 10,
            creativity: Math.round(clamp(s.norm(st._skills[4] + gr * 0.9, 0.3), 1, 5) * 10) / 10,
            leadership: Math.round(clamp(s.norm(st._skills[5] + gr * 0.6, 0.3), 1, 5) * 10) / 10
          };
        }
      }
      activity_attendance.push(row);
    });
  }
  var podAdvisorHost = { P1: 'Ritika Sen', P2: 'Aditya Varma', P3: 'Neha Bhargava', P4: 'Ritika Sen' };
  for (var wk = dn('2026-03-30'), wn = 0; wk <= TODAY; wk += 7, wn++) {
    pods.forEach(function (P) {
      var inPod = function (st) { return st.pod_id === P.id; };
      addActivity('academic_session', SUBJ_ROT[wn % 4] + ' · ' + P.name, wk + 1, 'Subject mentor', P.id, joinedBy(wk + 1, inPod));
      addActivity('pod_session', 'Pod ' + P.name + ' weekly circle', wk + 5, podAdvisorHost[P.id], P.id, joinedBy(wk + 5, inPod));
      if (wn % 2 === 0) addActivity('peer_session', 'Peer study hour · ' + P.name, wk + 3, 'Peer lead', P.id, joinedBy(wk + 3, inPod));
      if (dom(wk + 6) <= 7) addActivity('parent_child', 'Parent–child goal review · ' + P.name, wk + 6, podAdvisorHost[P.id], P.id, joinedBy(wk + 6, inPod));
    });
    if (wn % 2 === 1) {
      var cpParts = s.shuffle(joinedBy(wk + 2)).slice(0, s.int(6, 9));
      addActivity('competition_prep', 'Competition prep · ' + s.pick(['Model UN', 'Olympiad', 'Hackathon', 'Debate league']), wk + 2, 'Program team', null, cpParts);
    }
    if (dom(wk + 5) >= 8 && dom(wk + 5) <= 14) addActivity('branding_shoot', 'Personal-brand shoot', wk + 5, 'Brand studio', null, s.shuffle(joinedBy(wk + 5)).slice(0, 3));
    if (dom(wk + 6) >= 15 && dom(wk + 6) <= 21) addActivity('podcast', 'Alcovian Voices podcast', wk + 6, 'Program team', null, s.shuffle(joinedBy(wk + 6)).slice(0, 2));
  }
  workshops.forEach(function (W) { addActivity('workshop', W.title, dn(W.date), 'Guest facilitator', null, joinedBy(dn(W.date)), { workshop_id: W.id }); });
  addActivity('out_of_city', 'Pune immersion — startup & campus visits', dn('2026-06-20'), 'Program team', null, joinedBy(dn('2026-06-20')));
  addActivity('out_of_city', 'Bengaluru immersion — science & design', dn('2026-09-26'), 'Program team', null, joinedBy(dn('2026-09-26')));
  students.forEach(function (st, i) {
    for (var md = Math.max(dn(st.joined_at), START) + 3 + (i % 9); md <= TODAY; md += 28) {
      addActivity('mentor_call', '1:1 mentor call · ' + st.name.split(' ')[0], md, ADV[st.advisor_id], null, [st], { student_id: st.id });
    }
  });
  activities.sort(function (a, b) { return a.scheduled_at < b.scheduled_at ? -1 : a.scheduled_at > b.scheduled_at ? 1 : 0; });

  // ---------- chapters (stage history) ----------
  var SUBJ_LO = [['Maths', 14], ['Science', 13], ['English', 10], ['Social Sci', 12]];
  var SUBJ_HI = [['Maths', 13], ['Physics', 14], ['Chemistry', 12], ['English', 8]];
  var chapters = [];
  students.forEach(function (st) {
    var subs = st.grade >= 11 ? SUBJ_HI : SUBJ_LO;
    subs.forEach(function (sb) {
      var N = sb[1];
      for (var c = 0; c < N; c++) {
        var taught = START - 6 + Math.round(c * (290 / N)) + s.int(-3, 3);
        var p = st._pace * (st._slide === 'B' ? (taught >= dn('2026-07-01') ? 2.8 : 1.5) : 1);
        var t1 = taught + s.int(0, 4);
        var t2 = t1 + Math.round(s.int(2, 8) * p);
        var t3 = t2 + Math.round(s.int(4, 12) * p);
        var t4 = t3 + Math.round(s.int(5, 14) * p);
        var t5 = t4 + Math.round(s.int(4, 12) * p);
        var stall = s.chance(0.08 + (0.8 - st._ab) * 0.4);
        var sd = [t1, t2, t3, t4, stall ? 99999 : t5].map(function (x) { return x <= TODAY ? ds(x) : null; });
        for (var z = 1; z < 5; z++) if (!sd[z - 1]) sd[z] = null;
        var stage = sd.filter(Boolean).length;
        chapters.push({ id: st.id + '-' + sb[0].slice(0, 3).toUpperCase() + pad(c + 1, 2), student_id: st.id, subject: sb[0], chapter: 'Ch ' + (c + 1), stage: stage,
          stage_dates: sd, practice_accuracy: stage >= 3 ? Math.round(clamp(s.norm(st._ab * 100 + 5, 7), 55, 99)) : null,
          timed_pyq_accuracy: stage >= 4 ? Math.round(clamp(s.norm(st._ab * 100 + (stage >= 5 ? 10 : -2), 7), 45, 99)) : null,
          updated_at: sd.filter(Boolean).pop() || null });
      }
    });
  });

  // ---------- exams ----------
  var exam_targets = [], exam_results = [];
  var EXAMS = [['formative', '2026-05-29'], ['unit_test', '2026-06-26'], ['formative', '2026-07-31'], ['unit_test', '2026-08-21'],
    ['mid_term', '2026-09-22'], ['formative', '2026-10-16']];
  students.forEach(function (st) {
    var subs = (st.grade >= 11 ? SUBJ_HI : SUBJ_LO).map(function (x) { return x[0]; });
    var tg = {};
    subs.forEach(function (sb) {
      ['formative', 'unit_test', 'mid_term', 'final'].forEach(function (et) {
        var t = Math.round(clamp(s.norm(82, 4) - (et === 'mid_term' ? 3 : 0), 70, 92));
        tg[sb + et] = t;
        exam_targets.push({ student_id: st.id, subject: sb, exam_type: et, target_pct: t });
      });
    });
    EXAMS.forEach(function (ex) {
      var d0 = dn(ex[1]);
      if (d0 < dn(st.joined_at)) return;
      subs.forEach(function (sb, k) {
        var d = d0 + (ex[0] === 'mid_term' ? k : 0);
        if (d > TODAY) return;
        var m = mods(st, d);
        var sc = clamp(s.norm(tg[sb + ex[0]] + (st._ab - 0.78) * 55 + m.quiz * 60, 6), 25, 100);
        exam_results.push({ student_id: st.id, subject: sb, exam_type: ex[0], exam_date: ds(d), score_pct: Math.round(sc) });
      });
    });
  });

  // ---------- tasks ----------
  var tasks = [];
  var TASK_T = ['Revise notes', 'PYQ set', 'Practice worksheet', 'Read chapter', 'Flashcards', 'Mock test', 'Essay draft', 'Error log review', 'Lab record', 'Formula sheet'];
  students.forEach(function (st) {
    var subs = (st.grade >= 11 ? SUBJ_HI : SUBJ_LO).map(function (x) { return x[0]; });
    for (var d = Math.max(dn(st.joined_at), START) + 1; d <= TODAY + 7; d++) {
      var n = s.poisson(0.85);
      for (var k = 0; k < n; k++) {
        var m = mods(st, Math.min(d, TODAY));
        var est = s.pick([20, 30, 30, 45, 45, 60, 90]);
        var src = s.chance(0.42) ? 'advisor' : 'self';
        var comp = null, actual = null;
        if (d <= TODAY) {
          if (s.chance(st._task * m.task)) {
            var off = s.chance(st._ontime * m.ontime) ? -s.int(0, 2) : s.int(1, 4);
            if (d + off <= TODAY) { comp = ds(d + off); actual = Math.round(est * clamp(s.norm(1.12, 0.3), 0.4, 2.5)); }
          }
        } else if (s.chance(0.18)) { comp = ds(TODAY - s.int(0, 2)); actual = Math.round(est * clamp(s.norm(1.0, 0.25), 0.4, 2)); }
        tasks.push({ id: 'T' + pad(tasks.length + 1, 5), student_id: st.id, title: s.pick(TASK_T) + ' — ' + s.pick(subs), source: src,
          due_at: ds(d), est_min: est, actual_min: actual, completed_at: comp });
      }
    }
  });

  // ---------- roadmap milestones ----------
  var RM = {
    career: ['Career-interest inventory', 'Informational interview with an alum', 'Shadow a professional for a day', '1-page portfolio site live', 'Summer-internship pitch drafted', 'Join an Olympiad / domain club'],
    personal: ['30-day reading streak', 'Lead one pod session', 'Weekly journal for 4 weeks', 'Fitness goal: 5K run', 'Volunteer 6 hours', 'Digital-detox weekend'],
    academic: ['Two chapters to Ready', '≥80% in a formative', 'PYQ set for Unit 1 done', 'Close backlog chapters', 'Timed mock under exam conditions', 'Fix top-3 weak topics from quiz log']
  };
  var roadmap_milestones = [];
  students.forEach(function (st, i) {
    var j0 = new Date(Math.max(dn(st.joined_at), START) * MS);
    for (var mo = j0.getUTCMonth(); mo <= 9; mo++) {
      var ms = Date.UTC(2026, mo, 1) / MS;
      ['career', 'personal', 'academic'].forEach(function (tr, ti) {
        var n = tr === 'academic' ? 2 : 1;
        for (var k = 0; k < n; k++) {
          var cur = mo === 9;
          var m = mods(st, Math.min(ms + 20, TODAY));
          var pDone = (cur ? 0.42 : 0.8) * (st._slide && mo >= 8 ? 0.55 : 1) * (m.app === 0 ? 0.3 : 1);
          var done = s.chance(pDone) ? Math.min(ms + s.int(4, 27), TODAY) : null;
          roadmap_milestones.push({ id: 'M' + pad(roadmap_milestones.length + 1, 4), student_id: st.id, track: tr, month: ds(ms),
            title: RM[tr][(mo + i + k * 3 + ti) % RM[tr].length], done_at: done ? ds(done) : null });
        }
      });
    }
  });

  // strip private persona fields from exported rows
  var personas = {};
  students.forEach(function (st) {
    personas[st.id] = { slide: st._slide, focusRegular: st._focusReg };
    Object.keys(st).forEach(function (k) { if (k[0] === '_') delete st[k]; });
  });

  root.ALDATA = {
    today: ds(TODAY), start: ds(START), end: ds(END),
    milestones: { ai_calls_live: ds(AI_CALLS_LIVE), app_uplift: ds(APP_UPLIFT), lp2_slow_from: '2026-09-02' },
    monthly_targets: monthly_targets, campaigns: campaigns, ad_creatives: ad_creatives, ad_daily: ad_daily,
    landing_pages: landing_pages, lp_daily: lp_daily, leads: leads, enrollments: enrollments, invoices: invoices,
    workshops: workshops, workshop_bookings: workshop_bookings,
    advisors: advisors, pods: pods, students: students, app_sessions: app_sessions, focus_sessions: focus_sessions,
    quizzes: quizzes, quiz_attempts: quiz_attempts, timetable_blocks: timetable_blocks, wearable_daily: wearable_daily,
    activities: activities, activity_attendance: activity_attendance, chapters: chapters, exam_targets: exam_targets,
    exam_results: exam_results, tasks: tasks, roadmap_milestones: roadmap_milestones, _personas: personas
  };
})(typeof window !== 'undefined' ? window : globalThis);
