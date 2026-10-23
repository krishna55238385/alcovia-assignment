/* Student tracker: Quantity / Quality / Performance lenses, app adoption, cohort table + drill-down. */
(function () {
  'use strict';
  var D = window.ALDATA, AL = window.AL, C = AL.C;
  var podF = 'all', advF = 'all', gran = 'week', R, openId = null, lastFocus = null;

  var STU = {}, ADV = {}, POD = {}, ENR = {};
  D.students.forEach(function (s) { STU[s.id] = s; });
  D.advisors.forEach(function (a) { ADV[a.id] = a.name; });
  D.pods.forEach(function (p) { POD[p.id] = p.name; });
  D.enrollments.forEach(function (e) { ENR[e.id] = e; });

  var TYPES = [['academic_session', 'Academic sessions'], ['workshop', 'Workshops'], ['pod_session', 'Pod sessions'], ['peer_session', 'Peer sessions'],
    ['mentor_call', '1:1 mentor calls'], ['branding_shoot', 'Branding shoots'], ['podcast', 'Podcast'], ['competition_prep', 'Competition prep'],
    ['parent_child', 'Parent–child sessions'], ['out_of_city', 'Out-of-city trips']];
  var TL = {}; TYPES.forEach(function (t) { TL[t[0]] = t[1]; });
  var SKILLS = [['communication', 'Communication'], ['confidence', 'Confidence'], ['teamwork', 'Teamwork'], ['critical_thinking', 'Critical thinking'], ['creativity', 'Creativity'], ['leadership', 'Leadership']];
  var FEAT_L = { home: 'Home', realm: 'Realm', focus: 'Focus', syllabus: 'Syllabus', planner: 'Planner', tasks: 'Tasks', goals: 'Goals', wellness: 'Wellness', quiz: 'Daily quiz', other: 'Other' };

  // ---------- per-student indexes ----------
  function idx(arr, key) {
    var m = {}; D.students.forEach(function (s) { m[s.id] = []; });
    arr.forEach(function (r) { if (m[r[key]]) m[r[key]].push(r); });
    return m;
  }
  var I = {
    app: idx(D.app_sessions, 'student_id'), focus: idx(D.focus_sessions, 'student_id'), quiz: idx(D.quiz_attempts, 'student_id'),
    tt: idx(D.timetable_blocks, 'student_id'), wear: idx(D.wearable_daily, 'student_id'), task: idx(D.tasks, 'student_id'),
    ch: idx(D.chapters, 'student_id'), ex: idx(D.exam_results, 'student_id'), ms: idx(D.roadmap_milestones, 'student_id'),
    att: idx(D.activity_attendance, 'student_id')
  };
  var TARGET = {}; D.exam_targets.forEach(function (t) { TARGET[t.student_id + '|' + t.subject + '|' + t.exam_type] = t.target_pct; });
  var APPDAY = {};
  D.app_sessions.forEach(function (a) { var m = APPDAY[a.started_at] || (APPDAY[a.started_at] = {}); m[a.student_id] = (m[a.student_id] || 0) + a.duration_s; });

  function ids() {
    return D.students.filter(function (s) { return (podF === 'all' || s.pod_id === podF) && (advF === 'all' || s.advisor_id === advF); }).map(function (s) { return s.id; });
  }
  function sdays(id, f, t) { var from = AL.maxD(f, STU[id].joined_at); return from > t ? 0 : AL.days(from, t); }
  function stageAt(c, x) { var n = 0; for (var i = 0; i < 5; i++) { if (c.stage_dates[i] && c.stage_dates[i] <= x) n++; else break; } return n; }
  function pace(x) { return Math.min(1, Math.max(0, (AL.dn(x) - AL.dn('2026-04-01') + 1) / 30.4375 / 12)); }
  function lastOpen(id, t) { var l = null; I.app[id].forEach(function (a) { if (a.started_at <= t && (!l || a.started_at > l)) l = a.started_at; }); return l; }

  // ---------- metrics ----------
  function perf(list, f, t) {
    var o = { sd: 0, app: 0, focus: 0, qs: 0, qt: 0, ttp: 0, ttd: 0, due: 0, done: 0, ontime: 0, acc: 0, accN: 0, wn: 0, act: 0, sleep: 0, rec: 0, gap: 0, gapN: 0, chN: 0, chS: 0, ch5: 0 };
    list.forEach(function (id) {
      o.sd += sdays(id, f, t);
      I.app[id].forEach(function (a) { if (AL.inR(a.started_at, f, t)) o.app += a.duration_s; });
      I.focus[id].forEach(function (x) { if (AL.inR(x.started_at, f, t)) o.focus += x.actual_min; });
      I.quiz[id].forEach(function (q) { if (AL.inR(q.submitted_at, f, t)) { o.qs += q.score; o.qt += q.total; } });
      I.tt[id].forEach(function (b) { if (AL.inR(b.date, f, t)) { o.ttp += b.planned_min; o.ttd += b.done_min; } });
      I.task[id].forEach(function (k) {
        if (!AL.inR(k.due_at, f, t)) return;
        o.due++;
        if (k.completed_at && k.completed_at <= t) {
          o.done++;
          if (k.completed_at <= k.due_at) o.ontime++;
          if (k.actual_min != null && k.est_min) { o.acc += Math.max(0, 1 - Math.abs(k.actual_min - k.est_min) / k.est_min); o.accN++; }
        }
      });
      I.wear[id].forEach(function (w) { if (AL.inR(w.date, f, t)) { o.wn++; o.act += w.active_min; o.sleep += w.sleep_hours; o.rec += w.recovery_pct; } });
      I.ex[id].forEach(function (e) {
        if (!AL.inR(e.exam_date, f, t)) return;
        var tg = TARGET[id + '|' + e.subject + '|' + e.exam_type];
        if (tg != null) { o.gap += e.score_pct - tg; o.gapN++; }
      });
      if (STU[id].joined_at <= t) I.ch[id].forEach(function (c) { var s = stageAt(c, t); o.chN++; o.chS += s; if (s >= 5) o.ch5++; });
    });
    return {
      appMin: AL.div(o.app / 60, o.sd), focusMin: AL.div(o.focus, o.sd), quiz: AL.div(o.qs, o.qt), tt: AL.div(o.ttd, o.ttp),
      taskComp: AL.div(o.done, o.due), deadline: AL.div(o.ontime, o.done), estAcc: AL.div(o.acc, o.accN),
      active: AL.div(o.act, o.wn), sleep: AL.div(o.sleep, o.wn), rec: AL.div(o.rec, o.wn), examGap: AL.div(o.gap, o.gapN), examN: o.gapN,
      readiness: AL.div(o.chS, o.chN * 5), ready: AL.div(o.ch5, o.chN), pace: pace(t), sd: o.sd, wn: o.wn, due: o.due
    };
  }
  function setOf(list) { var s = {}; list.forEach(function (id) { s[id] = 1; }); return s; }
  function relevantActs(list, f, t) {
    var s = setOf(list);
    return D.activities.filter(function (a) { return AL.inR(a.scheduled_at, f, t) && a.participants.some(function (p) { return s[p]; }); });
  }
  function quantity(list, f, t) {
    var acts = relevantActs(list, f, t), by = {};
    TYPES.forEach(function (x) { by[x[0]] = { sch: 0, con: 0 }; });
    acts.forEach(function (a) { by[a.type].sch++; if (a.conducted_at) by[a.type].con++; });
    var sch = acts.length, con = acts.filter(function (a) { return a.conducted_at; }).length;
    var qh = D.quizzes.filter(function (q) { return AL.inR(q.quiz_date, f, t); }).length;
    return { acts: acts, by: by, sch: sch, con: con, rate: AL.div(con, sch), quizHeld: qh, quizDays: AL.days(f, t), quizRate: AL.div(qh, AL.days(f, t)) };
  }
  function quality(list, f, t) {
    var s = setOf(list), by = {}, tot = { n: 0, att: 0, rs: 0, rn: 0, ry: 0, rc: 0 }, sk = {}, skN = 0;
    TYPES.forEach(function (x) { by[x[0]] = { n: 0, att: 0, rs: 0, rn: 0, ry: 0, rc: 0 }; });
    SKILLS.forEach(function (k) { sk[k[0]] = 0; });
    D.activity_attendance.forEach(function (r) {
      if (!s[r.student_id] || !AL.inR(r.date, f, t)) return;
      [by[r.type], tot].forEach(function (b) {
        b.n++; if (r.attended) b.att++;
        if (r.rating != null) { b.rs += r.rating; b.rn++; }
        if (r.would_recommend != null) { b.rc++; if (r.would_recommend) b.ry++; }
      });
      if (r.soft_skills) { skN++; SKILLS.forEach(function (k) { sk[k[0]] += r.soft_skills[k[0]]; }); }
    });
    function fin(b) { b.attP = AL.div(b.att, b.n); b.rating = AL.div(b.rs, b.rn); b.rec = AL.div(b.ry, b.rc); return b; }
    TYPES.forEach(function (x) { fin(by[x[0]]); });
    var skills = skN ? SKILLS.map(function (k) { return sk[k[0]] / skN; }) : null;
    return { by: by, tot: fin(tot), skills: skills, skN: skN };
  }
  function readyAt(id, x) {
    var n = 0, r = 0;
    I.ch[id].forEach(function (c) { n++; if (stageAt(c, x) >= 5) r++; });
    return AL.div(r, n);
  }
  function alertsFor(id, Rg) {
    var t = Rg.to, st = STU[id], out = [];
    if (st.joined_at > t) return out;
    var lo = lastOpen(id, t), ago = lo ? AL.dn(t) - AL.dn(lo) : null;
    if (ago == null || ago > 7) out.push({ lvl: 'r', txt: ago == null ? 'Has never opened the app' : 'No app open in ' + ago + ' days (last ' + AL.fmtDate(lo) + ')' });
    var rd = readyAt(id, t), pc = pace(t);
    if (rd != null && rd - pc < -0.10) out.push({ lvl: 'r', txt: 'Readiness below pace: ' + AL.pct(rd) + ' of chapters Ready vs ' + AL.pct(pc) + ' pace' });
    else if (rd != null && rd - pc < -0.05) out.push({ lvl: 'a', txt: 'Readiness slipping: ' + AL.pct(rd) + ' Ready vs ' + AL.pct(pc) + ' pace' });
    var f14 = AL.add(t, -13), missed = 0;
    I.task[id].forEach(function (k) { if (AL.inR(k.due_at, f14, t) && k.due_at < t && (!k.completed_at || k.completed_at > k.due_at)) missed++; });
    if (missed >= 4) out.push({ lvl: 'r', txt: missed + ' missed or late deadlines in the last 14 days' });
    else if (missed === 3) out.push({ lvl: 'a', txt: '3 missed or late deadlines in the last 14 days' });
    var w7 = I.wear[id].filter(function (w) { return AL.inR(w.date, AL.add(t, -6), t); });
    if (w7.length >= 4) {
      var sl = AL.sum(w7, function (w) { return w.sleep_hours; }) / w7.length;
      if (sl < 6.3) out.push({ lvl: 'r', txt: 'Sleep averaging ' + sl.toFixed(1) + ' h over the last 7 days' });
    }
    if (Rg.prev) {
      var qc = perf([id], Rg.from, Rg.to).quiz, qp = perf([id], Rg.prev.from, Rg.prev.to).quiz;
      if (qc != null && qp != null && qp - qc >= 0.12) out.push({ lvl: 'a', txt: 'Quiz average down ' + Math.round((qp - qc) * 100) + ' pp vs previous period (' + AL.pct(qc) + ')' });
    }
    var en = ENR[st.enrollment_id];
    if (en && en.plan === 'trial_3m' && en.end_date > t && AL.dn(en.end_date) - AL.dn(t) <= 30) out.push({ lvl: 'a', txt: 'Trial ends in ' + (AL.dn(en.end_date) - AL.dn(t)) + ' days (' + AL.fmtDate(en.end_date) + '), renewal conversation due' });
    var lastMc = null;
    D.activities.forEach(function (a) { if (a.type === 'mentor_call' && a.student_id === id && a.conducted_at && a.conducted_at <= t && (!lastMc || a.conducted_at > lastMc)) lastMc = a.conducted_at; });
    var since = lastMc ? AL.dn(t) - AL.dn(lastMc) : AL.dn(t) - AL.dn(AL.maxD(st.joined_at, AL.MIN));
    if (since > 35) out.push({ lvl: 'a', txt: 'No 1:1 mentor call conducted in ' + since + ' days' });
    var q = quality([id], Rg.from, Rg.to).tot;
    if (q.n >= 4 && q.attP < 0.7) out.push({ lvl: 'a', txt: 'Attendance ' + AL.pct(q.attP) + ' this period' });
    return out;
  }

  // ---------- helpers ----------
  function emptyNote(canvasId, msg) {
    var box = document.getElementById(canvasId).parentNode, n = box.querySelector('.empty-note');
    if (!msg) { if (n) n.remove(); return false; }
    AL.chart(canvasId, { type: 'bar', data: { labels: [], datasets: [] }, options: { plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } } });
    if (!n) { n = document.createElement('div'); n.className = 'empty-note'; box.appendChild(n); }
    n.textContent = msg;
    return true;
  }
  function ragTile(v, g, a, lower) { var r = AL.rag(v, g, a, lower); return r === 'na' ? '' : ' ' + AL.chip(r, { g: 'On track', a: 'Watch', r: 'Off track' }[r]); }
  var dayN = function (v, dp) { return AL.isNum(v) ? v.toFixed(dp == null ? 1 : dp) : '—'; };

  // ---------- render: attention ----------
  var rowsCache = [];
  function renderAttention() {
    var withA = rowsCache.filter(function (r) { return r.alerts.length; }).sort(function (a, b) { return b.attn - a.attn; });
    document.getElementById('attn-sub').textContent = withA.length + ' of ' + rowsCache.length + ' Alcovians in this filter have at least one alert as of ' + AL.fmtDate(R.to, true) + '.';
    var top = withA.slice(0, 3);
    var el = document.getElementById('attn');
    el.innerHTML = top.length ? top.map(function (r) {
      var red = r.alerts.some(function (a) { return a.lvl === 'r'; });
      return '<button type="button" class="' + (red ? '' : 'a') + '" data-id="' + r.id + '"><span class="n">' + AL.esc(r.name) + ' <span class="muted" style="font-weight:400">· ' + POD[r.st.pod_id] + ' · ' + AL.esc(ADV[r.st.advisor_id]) + '</span></span>' +
        r.alerts.slice(0, 2).map(function (a) { return '<span class="r">' + (a.lvl === 'r' ? '● ' : '○ ') + AL.esc(a.txt) + '</span>'; }).join('') + '</button>';
    }).join('') : '<p class="note">No alerts for this filter. Everyone is on track.</p>';
    el.querySelectorAll('button[data-id]').forEach(function (b) { b.addEventListener('click', function () { openDrawer(b.getAttribute('data-id'), b); }); });
  }

  // ---------- render: quantity ----------
  function renderQuantity(list) {
    var q = quantity(list, R.from, R.to), qp = R.prev ? quantity(list, R.prev.from, R.prev.to) : null;
    var mc = q.by.mentor_call, mcP = qp ? qp.by.mentor_call : null, wsH = q.by.workshop.con, wsP = qp ? qp.by.workshop.con : null;
    document.getElementById('q-kpis').innerHTML = [
      AL.tile({ label: 'Sessions delivered', value: AL.pct(q.rate) + ' <small>' + q.con + ' of ' + q.sch + '</small>', badge: ragTile(q.rate, 0.95, 0.85), delta: AL.delta(q.rate, qp && qp.rate, { mode: 'pp' }) }),
      AL.tile({ label: '1:1 mentor calls conducted', value: mc.con + ' <small>of ' + mc.sch + '</small>', badge: ragTile(AL.div(mc.con, mc.sch), 0.95, 0.85), delta: AL.delta(AL.div(mc.con, mc.sch), mcP && AL.div(mcP.con, mcP.sch), { mode: 'pp' }) }),
      AL.tile({ label: 'Workshops held', value: String(wsH), delta: AL.delta(wsH, wsP), sub: 'fortnightly, cohort-wide' }),
      AL.tile({ label: 'Daily quiz held', value: AL.pct(q.quizRate) + ' <small>' + q.quizHeld + ' of ' + q.quizDays + ' days</small>', badge: ragTile(q.quizRate, 0.95, 0.85), delta: AL.delta(q.quizRate, qp && qp.quizRate, { mode: 'pp' }) })
    ].join('');

    var types = TYPES.filter(function (x) { return q.by[x[0]].sch > 0; });
    if (!emptyNote('ch-q-type', types.length ? null : 'No sessions scheduled for this filter and period.')) {
      AL.chart('ch-q-type', {
        type: 'bar',
        data: { labels: types.map(function (x) { return x[1]; }), datasets: [
          { label: 'Scheduled', data: types.map(function (x) { return q.by[x[0]].sch; }), backgroundColor: C.slate2, borderRadius: 3, barPercentage: 0.9, categoryPercentage: 0.75 },
          { label: 'Conducted', data: types.map(function (x) { return q.by[x[0]].con; }), backgroundColor: C.accent, borderRadius: 3, barPercentage: 0.9, categoryPercentage: 0.75 }] },
        options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } },
          plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { afterBody: function (it) { var b = q.by[types[it[0].dataIndex][0]]; return 'Delivery ' + AL.pct(AL.div(b.con, b.sch)); } } } } }
      });
    }
    var rows = TYPES.map(function (x) {
      var b = q.by[x[0]], bp = qp ? qp.by[x[0]] : null;
      return { type: x[1], sch: b.sch, con: b.con, missed: b.sch - b.con, rate: AL.div(b.con, b.sch), prev: bp ? AL.div(bp.con, bp.sch) : null };
    }).filter(function (r) { return r.sch > 0; });
    AL.table(document.getElementById('tbl-q'), [
      { key: 'type', label: 'Activity', head: true },
      { key: 'sch', label: 'Sched.', num: true },
      { key: 'con', label: 'Done', num: true },
      { key: 'missed', label: 'Missed', num: true, fmt: function (r) { return '<span class="' + (r.missed ? 'amber' : '') + '">' + r.missed + '</span>'; } },
      { key: 'rate', label: 'Delivery', num: true, fmt: function (r) { return AL.chip(AL.rag(r.rate, 0.95, 0.85), AL.pct(r.rate)); } },
      { key: 'prev', label: 'Prev', num: true, fmt: function (r) { return AL.pct(r.prev); } }
    ], rows, { sortKey: 'rate', sortDir: 'asc', empty: 'No sessions scheduled for this filter and period.' });

    var B = AL.buckets(R.from, R.to, gran);
    var con = B.map(function () { return 0; }), mis = con.slice();
    q.acts.forEach(function (a) { var i = B.index(a.scheduled_at); if (i >= 0) { if (a.conducted_at) con[i]++; else mis[i]++; } });
    var rate = B.map(function (b, i) { var v = AL.div(con[i], con[i] + mis[i]); return v == null ? null : +(v * 100).toFixed(1); });
    AL.chart('ch-q-trend', {
      data: { labels: B.map(function (b) { return b.label; }), datasets: [
        { type: 'bar', label: 'Conducted', data: con, backgroundColor: C.accent, stack: 's', yAxisID: 'y', order: 2 },
        { type: 'bar', label: 'Not conducted', data: mis, backgroundColor: '#f2a7a7', stack: 's', yAxisID: 'y', order: 2 },
        { type: 'line', label: 'Delivery %', data: rate, borderColor: C.ink, backgroundColor: C.ink, yAxisID: 'y2', pointRadius: B.length > 40 ? 0 : 2, tension: 0.2, spanGaps: true, order: 1 }] },
      options: { interaction: { mode: 'index', intersect: false },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Sessions' } },
          y2: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { callback: function (v) { return v + '%'; } } } },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: {
          title: function (it) { var b = B[it[0].dataIndex]; return b.from === b.to ? AL.fmtDate(b.from, true) : AL.fmtRange(b.from, b.to); },
          label: function (ctx) { return ' ' + ctx.dataset.label + ': ' + (ctx.dataset.yAxisID === 'y2' ? (ctx.parsed.y == null ? '—' : ctx.parsed.y + '%') : ctx.parsed.y); } } } } }
    });
  }

  // ---------- render: quality ----------
  function renderQuality(list) {
    var q = quality(list, R.from, R.to), qp = R.prev ? quality(list, R.prev.from, R.prev.to) : null;
    document.getElementById('l-kpis').innerHTML = [
      AL.tile({ label: 'Attendance', value: AL.pct(q.tot.attP), badge: ragTile(q.tot.attP, 0.85, 0.7), delta: AL.delta(q.tot.attP, qp && qp.tot.attP, { mode: 'pp' }), sub: q.tot.att + ' of ' + q.tot.n + ' seats' }),
      AL.tile({ label: 'Average rating', value: (AL.isNum(q.tot.rating) ? q.tot.rating.toFixed(2) : '—') + ' <small>/ 5</small>', badge: ragTile(q.tot.rating, 4.2, 3.8), delta: AL.delta(q.tot.rating, qp && qp.tot.rating, { mode: 'abs', dp: 2 }) }),
      AL.tile({ label: 'Would recommend', value: AL.pct(q.tot.rec), badge: ragTile(q.tot.rec, 0.85, 0.7), delta: AL.delta(q.tot.rec, qp && qp.tot.rec, { mode: 'pp' }) }),
      AL.tile({ label: 'Ratings collected', value: AL.num(q.tot.rn), delta: AL.delta(q.tot.rn, qp && qp.tot.rn), sub: 'response rate ' + AL.pct(AL.div(q.tot.rn, q.tot.att)) })
    ].join('');
    var rows = TYPES.map(function (x) {
      var b = q.by[x[0]];
      return { type: x[1], n: b.n, att: b.attP, rating: b.rating, rec: b.rec };
    }).filter(function (r) { return r.n > 0; });
    AL.table(document.getElementById('tbl-l'), [
      { key: 'type', label: 'Activity', head: true },
      { key: 'att', label: 'Attendance', num: true, fmt: function (r) { return AL.chip(AL.rag(r.att, 0.85, 0.7), AL.pct(r.att)); } },
      { key: 'rating', label: 'Avg rating', num: true, fmt: function (r) {
        return '<span class="bar-cell"><span class="mini" aria-hidden="true"><span style="width:' + ((r.rating || 0) / 5 * 100) + '%"></span></span>' + (AL.isNum(r.rating) ? r.rating.toFixed(2) : '—') + '</span>'; } },
      { key: 'rec', label: 'Recommend', num: true, fmt: function (r) { return AL.chip(AL.rag(r.rec, 0.85, 0.7), AL.pct(r.rec)); } },
      { key: 'n', label: 'Seats', num: true }
    ], rows, { sortKey: 'rating', sortDir: 'asc', empty: 'No sessions conducted in this period.' });
    if (!emptyNote('ch-radar', q.skills ? null : 'No workshops in this period, so no soft-skill scores.')) {
      var ds = [{ label: 'This period (' + q.skN + ' scores)', data: q.skills.map(function (v) { return +v.toFixed(2); }), borderColor: C.accent, backgroundColor: 'rgba(55,48,163,.15)', pointBackgroundColor: C.accent, borderWidth: 2 }];
      if (qp && qp.skills) ds.push({ label: 'Previous period', data: qp.skills.map(function (v) { return +v.toFixed(2); }), borderColor: C.slate, backgroundColor: 'rgba(148,163,184,.08)', borderDash: [5, 4], pointRadius: 2, borderWidth: 1.5 });
      AL.chart('ch-radar', {
        type: 'radar',
        data: { labels: SKILLS.map(function (s) { return s[1]; }), datasets: ds },
        options: { scales: { r: { min: 1, max: 5, ticks: { stepSize: 1, backdropColor: 'transparent' }, pointLabels: { font: { size: 11 } } } },
          plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (ctx) { return ' ' + ctx.dataset.label + ': ' + ctx.parsed.r.toFixed(2); } } } } }
      });
    }
  }

  // ---------- render: performance ----------
  function renderPerformance(list) {
    var p = perf(list, R.from, R.to), pp = R.prev ? perf(list, R.prev.from, R.prev.to) : null;
    var paceGap = AL.isNum(p.ready) ? p.ready - p.pace : null, paceGapP = pp && AL.isNum(pp.ready) ? pp.ready - pp.pace : null;
    var T = function (o) { return AL.tile(o); };
    document.getElementById('p-kpis').innerHTML = [
      T({ label: 'Focus min / day', value: dayN(p.focusMin, 1), badge: ragTile(p.focusMin, 30, 10), delta: AL.delta(p.focusMin, pp && pp.focusMin), sub: 'focus timer' }),
      T({ label: 'Quiz average', value: AL.pct(p.quiz), badge: ragTile(p.quiz, 0.7, 0.55), delta: AL.delta(p.quiz, pp && pp.quiz, { mode: 'pp' }) }),
      T({ label: 'Timetable adherence', value: AL.pct(p.tt), badge: ragTile(p.tt, 0.8, 0.65), delta: AL.delta(p.tt, pp && pp.tt, { mode: 'pp' }), sub: 'done ÷ planned min' }),
      T({ label: 'Task completion', value: AL.pct(p.taskComp), badge: ragTile(p.taskComp, 0.85, 0.7), delta: AL.delta(p.taskComp, pp && pp.taskComp, { mode: 'pp' }), sub: p.due + ' tasks due' }),
      T({ label: 'Deadline adherence', value: AL.pct(p.deadline), badge: ragTile(p.deadline, 0.8, 0.65), delta: AL.delta(p.deadline, pp && pp.deadline, { mode: 'pp' }), sub: 'done on/before due' }),
      T({ label: 'Time-estimate accuracy', value: AL.pct(p.estAcc), badge: ragTile(p.estAcc, 0.75, 0.6), delta: AL.delta(p.estAcc, pp && pp.estAcc, { mode: 'pp' }), help: '1 − |actual − estimate| ÷ estimate, floored at 0' }),
      T({ label: 'Chapter readiness score', value: AL.isNum(p.readiness) ? Math.round(p.readiness * 100) + ' <small>/ 100</small>' : '—', badge: ragTile(p.readiness, 0.7, 0.55), delta: AL.delta(p.readiness, pp && pp.readiness, { mode: 'pp' }), sub: 'avg stage ÷ 5, at period end', help: 'Stages: 0 not started, 1 read, 2 notes, 3 practice ≥70%, 4 timed PYQ, 5 ready ≥80%' }),
      T({ label: 'Syllabus Ready vs pace', value: AL.pct(p.ready) + ' <small>vs ' + AL.pct(p.pace) + '</small>', badge: ragTile(paceGap, 0, -0.1), delta: AL.delta(paceGap, paceGapP, { mode: 'pp' }), sub: 'pace = 25% per quarter' }),
      T({ label: 'Exam vs target', value: AL.isNum(p.examGap) ? (p.examGap >= 0 ? '+' : '−') + Math.abs(p.examGap).toFixed(1) + ' <small>pts</small>' : '—', badge: ragTile(p.examGap, 0, -5), delta: AL.delta(p.examGap, pp && pp.examGap, { mode: 'abs', dp: 1 }), sub: p.examN ? p.examN + ' results in period' : 'no exams in period' }),
      T({ label: 'Active min / day', value: dayN(p.active, 0), badge: ragTile(p.active, 60, 40), delta: AL.delta(p.active, pp && pp.active), sub: 'wearables' }),
      T({ label: 'Sleep', value: dayN(p.sleep, 1) + ' <small>h</small>', badge: ragTile(p.sleep, 7.3, 6.5), delta: AL.delta(p.sleep, pp && pp.sleep, { mode: 'abs', dp: 2 }), sub: 'per night' }),
      T({ label: 'Recovery', value: AL.isNum(p.rec) ? Math.round(p.rec) + '<small>%</small>' : '—', badge: ragTile(p.rec, 65, 50), delta: AL.delta(p.rec, pp && pp.rec), sub: AL.num(p.wn) + ' wearable days' })
    ].join('');

    // syllabus vs pace
    var B = AL.buckets(R.from, R.to, 'auto');
    var pts = B.map(function (b) { return b.to; });
    var ready = pts.map(function (x) {
      var n = 0, r = 0;
      list.forEach(function (id) { if (STU[id].joined_at > x) return; I.ch[id].forEach(function (c) { n++; if (stageAt(c, x) >= 5) r++; }); });
      return n ? +(r / n * 100).toFixed(1) : null;
    });
    AL.chart('ch-syl', {
      type: 'line',
      data: { labels: pts.map(function (x) { return AL.fmtDate(x); }), datasets: [
        { label: 'Chapters Ready %', data: ready, borderColor: C.accent, backgroundColor: 'rgba(55,48,163,.08)', fill: true, tension: 0.25, pointRadius: pts.length > 30 ? 0 : 2 },
        { label: 'Pace (25% / quarter)', data: pts.map(function (x) { return +(pace(x) * 100).toFixed(1); }), borderColor: C.bad, borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 }] },
      options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, suggestedMax: 70, ticks: { callback: function (v) { return v + '%'; } } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } } },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (ctx) { return ' ' + ctx.dataset.label + ': ' + (ctx.parsed.y == null ? '—' : ctx.parsed.y + '%'); } } } } }
    });

    // exam vs target by subject
    var sub = {};
    list.forEach(function (id) {
      I.ex[id].forEach(function (e) {
        if (!AL.inR(e.exam_date, R.from, R.to)) return;
        var tg = TARGET[id + '|' + e.subject + '|' + e.exam_type];
        var s = sub[e.subject] || (sub[e.subject] = { sc: 0, tg: 0, n: 0, types: {} });
        s.sc += e.score_pct; s.tg += tg; s.n++; s.types[e.exam_type] = 1;
      });
    });
    var subs = Object.keys(sub).sort();
    var types = {}; subs.forEach(function (k) { Object.keys(sub[k].types).forEach(function (t) { types[t] = 1; }); });
    document.getElementById('exam-note').textContent = subs.length ? 'Includes ' + Object.keys(types).map(function (t) { return t.replace('_', '-'); }).join(', ') + ' results in the period.' : 'Exam calendar: formatives end-May/Jul/Oct, unit tests late Jun/Aug, mid-terms 22–25 Sep.';
    if (!emptyNote('ch-exam', subs.length ? null : 'No exam results in this period.')) {
      AL.chart('ch-exam', {
        type: 'bar',
        data: { labels: subs, datasets: [
          { label: 'Avg score', data: subs.map(function (k) { return +(sub[k].sc / sub[k].n).toFixed(1); }), backgroundColor: C.accent, borderRadius: 3 },
          { label: 'Avg target', data: subs.map(function (k) { return +(sub[k].tg / sub[k].n).toFixed(1); }), backgroundColor: C.slate2, borderRadius: 3 }] },
        options: { scales: { y: { min: 0, max: 100, ticks: { callback: function (v) { return v + '%'; } } }, x: { grid: { display: false } } },
          plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (ctx) { return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y + '%'; }, afterBody: function (it) { return sub[subs[it[0].dataIndex]].n + ' results'; } } } } }
      });
    }

    // milestones by track
    var mFrom = AL.monthStart(R.from), mTo = AL.monthStart(R.to), tr = { career: [0, 0], personal: [0, 0], academic: [0, 0] };
    list.forEach(function (id) { I.ms[id].forEach(function (m) { if (m.month >= mFrom && m.month <= mTo) { tr[m.track][1]++; if (m.done_at && m.done_at <= R.to) tr[m.track][0]++; } }); });
    var tk = ['career', 'personal', 'academic'];
    var totDone = AL.sum(tk, function (k) { return tr[k][0]; }), tot = AL.sum(tk, function (k) { return tr[k][1]; });
    document.getElementById('ms-note').textContent = tot ? totDone + ' of ' + tot + ' milestones done (' + AL.pct(AL.div(totDone, tot)) + ') for months ' + AL.fmtDate(mFrom).replace(/^1 /, '') + (mFrom !== mTo ? '–' + AL.fmtDate(mTo).replace(/^1 /, '') : '') + '.' : '';
    if (!emptyNote('ch-ms', tot ? null : 'No milestones planned in these months.')) {
      AL.chart('ch-ms', {
        type: 'bar',
        data: { labels: ['Career', 'Personal', 'Academic'], datasets: [
          { label: 'Done', data: tk.map(function (k) { return tr[k][0]; }), backgroundColor: C.accent, stack: 'm', borderRadius: 3 },
          { label: 'Open', data: tk.map(function (k) { return tr[k][1] - tr[k][0]; }), backgroundColor: C.slate2, stack: 'm', borderRadius: 3 }] },
        options: { indexAxis: 'y', scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } },
          plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { afterBody: function (it) { var k = tk[it[0].dataIndex]; return AL.pct(AL.div(tr[k][0], tr[k][1])) + ' done'; } } } } }
      });
    }
  }

  // ---------- render: app adoption ----------
  function appSeries(list, f, t) {
    var s = setOf(list), B = AL.buckets(f, t, 'auto');
    var out = B.map(function (b) {
      var sec = 0, sd = 0, dauSum = 0, days = 0;
      for (var n = AL.dn(b.from); n <= AL.dn(b.to); n++) {
        var iso = AL.ds(n), m = APPDAY[iso] || {}, act = 0;
        list.forEach(function (id) { if (STU[id].joined_at <= iso) { sd++; if (m[id]) { sec += m[id]; act++; } } });
        dauSum += act; days++;
      }
      return { label: b.label, min: AL.div(sec / 60, sd), dau: AL.div(dauSum, days), wau: wauAt(s, b.to) };
    });
    out.B = B;
    return out;
  }
  function wauAt(s, iso) {
    var seen = {};
    for (var k = 0; k < 7; k++) { var m = APPDAY[AL.add(iso, -k)]; if (m) for (var id in m) if (s[id]) seen[id] = 1; }
    return Object.keys(seen).length;
  }
  function appTotals(list, f, t) {
    var s = setOf(list), sec = 0, sd = 0, dau = 0, wau = 0, days = 0, feat = {}, focusUsers = {};
    for (var n = AL.dn(f); n <= AL.dn(t); n++) {
      var iso = AL.ds(n), m = APPDAY[iso] || {}, act = 0;
      list.forEach(function (id) { if (STU[id].joined_at <= iso) { sd++; if (m[id]) { sec += m[id]; act++; } } });
      dau += act; wau += wauAt(s, iso); days++;
    }
    list.forEach(function (id) {
      I.app[id].forEach(function (a) { if (AL.inR(a.started_at, f, t)) feat[a.feature] = (feat[a.feature] || 0) + a.duration_s; });
      I.focus[id].forEach(function (x) { if (AL.inR(x.started_at, f, t)) focusUsers[id] = (focusUsers[id] || 0) + 1; });
    });
    var regulars = Object.keys(focusUsers).filter(function (id) { return focusUsers[id] >= Math.max(3, AL.days(f, t) * 0.25); }).length;
    return { min: AL.div(sec / 60, sd), dau: AL.div(dau, days), wauEnd: wauAt(s, t), stick: AL.div(dau, wau), feat: feat, totalSec: sec, focusUsers: Object.keys(focusUsers).length, regulars: regulars,
      enrolled: list.filter(function (id) { return STU[id].joined_at <= t; }).length };
  }
  function renderApp(list) {
    var a = appTotals(list, R.from, R.to), ap = R.prev ? appTotals(list, R.prev.from, R.prev.to) : null;
    document.getElementById('a-kpis').innerHTML = [
      AL.tile({ label: 'App min / student / day', value: dayN(a.min, 1) + ' <small>vs 30 target</small>', badge: ragTile(a.min, 30, 10), delta: AL.delta(a.min, ap && ap.min), sub: AL.pct(AL.div(a.min, 30)) + ' of target' }),
      AL.tile({ label: 'Avg daily active', value: dayN(a.dau, 1) + ' <small>of ' + a.enrolled + '</small>', delta: AL.delta(a.dau, ap && ap.dau), sub: 'DAU/WAU stickiness ' + AL.pct(a.stick) }),
      AL.tile({ label: 'Weekly active at period end', value: a.wauEnd + ' <small>of ' + a.enrolled + '</small>', delta: AL.delta(a.wauEnd, ap && ap.wauEnd, { mode: 'abs', dp: 0 }), sub: '7 days to ' + AL.fmtDate(R.to) }),
      AL.tile({ label: 'Focus timer users', value: a.focusUsers + ' <small>' + a.regulars + ' regulars</small>', delta: AL.delta(a.focusUsers, ap && ap.focusUsers, { mode: 'abs', dp: 0 }), sub: 'regular = used on ≥25% of days' })
    ].join('');
    document.getElementById('app-sub').textContent = 'Average minutes per student per day against the 30-minute target. Home and Realm take most of the time; a small group of regulars use Focus. Realm season 2 + streaks shipped on 1 Oct.';
    var S = appSeries(list, R.from, R.to);
    AL.chart('ch-app', {
      type: 'line',
      data: { labels: S.map(function (x) { return x.label; }), datasets: [
        { label: 'Avg min / student / day', data: S.map(function (x) { return x.min == null ? null : +x.min.toFixed(2); }), borderColor: C.accent, backgroundColor: 'rgba(55,48,163,.1)', fill: true, tension: 0.25, pointRadius: S.length > 30 ? 0 : 2 },
        { label: '30-min target', data: S.map(function () { return 30; }), borderColor: C.bad, borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 }] },
      options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, max: 32, ticks: { callback: function (v) { return v + 'm'; } } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } } },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (ctx) { return ' ' + ctx.dataset.label + ': ' + (ctx.parsed.y == null ? '—' : ctx.parsed.y + ' min'); } } } } }
    });
    AL.chart('ch-dau', {
      type: 'line',
      data: { labels: S.map(function (x) { return x.label; }), datasets: [
        { label: 'Avg DAU', data: S.map(function (x) { return x.dau == null ? null : +x.dau.toFixed(1); }), borderColor: C.accent, backgroundColor: C.accent, tension: 0.25, pointRadius: S.length > 30 ? 0 : 2 },
        { label: 'WAU (period end)', data: S.map(function (x) { return x.wau; }), borderColor: C.accent3, backgroundColor: C.accent3, tension: 0.25, pointRadius: S.length > 30 ? 0 : 2 }] },
      options: { interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, suggestedMax: a.enrolled || 20, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } } },
        plugins: { legend: { position: 'bottom' } } }
    });
    var fk = Object.keys(a.feat).sort(function (x, y) { return a.feat[y] - a.feat[x]; });
    if (!emptyNote('ch-feat', fk.length ? null : 'No app usage in this period.')) {
      AL.chart('ch-feat', {
        type: 'bar',
        data: { labels: fk.map(function (k) { return FEAT_L[k] || k; }), datasets: [{ label: 'Share of minutes', data: fk.map(function (k) { return +(a.feat[k] / a.totalSec * 100).toFixed(1); }),
          backgroundColor: fk.map(function (k) { return k === 'home' || k === 'realm' ? C.accent : k === 'focus' ? C.accent2 : C.accent3; }), borderRadius: 3 }] },
        options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { callback: function (v) { return v + '%'; } } }, y: { grid: { display: false } } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { var k = fk[ctx.dataIndex]; return ' ' + ctx.parsed.x + '% · ' + AL.num(a.feat[k] / 60) + ' min total'; } } } } }
      });
    }
  }

  // ---------- render: cohort ----------
  function buildRows(list) {
    return list.map(function (id) {
      var st = STU[id], p = perf([id], R.from, R.to), q = quality([id], R.from, R.to).tot, al = alertsFor(id, R);
      var lo = lastOpen(id, R.to), ago = lo ? AL.dn(R.to) - AL.dn(lo) : null;
      var en = ENR[st.enrollment_id];
      var r = { id: id, st: st, name: st.name, advisor: ADV[st.advisor_id], pod: POD[st.pod_id], plan: st.plan, en: en, p: p, att: q.attP, ago: ago, alerts: al,
        paceGap: AL.isNum(p.ready) ? p.ready - p.pace : null, joinedLater: st.joined_at > R.to };
      var chips = [AL.rag(p.appMin, 5, 2.5), AL.rag(p.focusMin, 30, 10), AL.rag(p.quiz, 0.7, 0.55), AL.rag(p.tt, 0.8, 0.65), AL.rag(p.taskComp, 0.85, 0.7),
        AL.rag(r.paceGap, 0, -0.1), AL.rag(q.attP, 0.85, 0.7), AL.rag(p.sleep, 7.3, 6.5)];
      var redA = al.filter(function (a) { return a.lvl === 'r'; }).length, ambA = al.length - redA;
      r.attn = redA * 3 + ambA * 1.5 + chips.filter(function (c) { return c === 'r'; }).length + chips.filter(function (c) { return c === 'a'; }).length * 0.4;
      return r;
    });
  }
  function c(v, g, a, txt, lower) { return AL.rag(v, g, a, lower) === 'na' ? '<span class="muted">—</span>' : AL.chip(AL.rag(v, g, a, lower), txt); }
  function renderCohort() {
    var rows = rowsCache;
    AL.table(document.getElementById('tbl-cohort'), [
      { key: 'name', label: 'Alcovian', head: true, fmt: function (r) { return AL.esc(r.name) + '<span class="sub">Gr ' + r.st.grade + ' · ' + r.pod + (r.joinedLater ? ' · joins ' + AL.fmtDate(r.st.joined_at) : '') + '</span>'; } },
      { key: 'advisor', label: 'Advisor' },
      { key: 'plan', label: 'Plan', fmt: function (r) {
        if (r.plan !== 'trial_3m') return '<span class="chip n">Full</span>';
        var left = AL.dn(r.en.end_date) - AL.dn(R.to);
        return AL.chip(left <= 30 && left > 0 ? 'a' : 'n', 'Trial') + '<span class="sub">ends ' + AL.fmtDate(r.en.end_date) + '</span>'; } },
      { key: 'app', label: 'App min/d', num: true, val: function (r) { return r.p.appMin; }, fmt: function (r) { return c(r.p.appMin, 5, 2.5, dayN(r.p.appMin, 1)); } },
      { key: 'focus', label: 'Focus min/d', num: true, val: function (r) { return r.p.focusMin; }, fmt: function (r) { return c(r.p.focusMin, 30, 10, dayN(r.p.focusMin, 0)); } },
      { key: 'quiz', label: 'Quiz', num: true, val: function (r) { return r.p.quiz; }, fmt: function (r) { return c(r.p.quiz, 0.7, 0.55, AL.pct(r.p.quiz)); } },
      { key: 'tt', label: 'Timetable', num: true, val: function (r) { return r.p.tt; }, fmt: function (r) { return c(r.p.tt, 0.8, 0.65, AL.pct(r.p.tt)); } },
      { key: 'task', label: 'Tasks', num: true, val: function (r) { return r.p.taskComp; }, fmt: function (r) { return c(r.p.taskComp, 0.85, 0.7, AL.pct(r.p.taskComp)); } },
      { key: 'ready', label: 'Ready vs pace', num: true, val: function (r) { return r.paceGap; }, title: 'Chapters at stage 5 vs the 25%-per-quarter pace (pp)', fmt: function (r) {
        return AL.isNum(r.paceGap) ? AL.chip(AL.rag(r.paceGap, 0, -0.1), (r.paceGap >= 0 ? '+' : '−') + Math.abs(r.paceGap * 100).toFixed(0) + ' pp') + '<span class="sub">' + AL.pct(r.p.ready) + ' ready</span>' : '<span class="muted">—</span>'; } },
      { key: 'att', label: 'Attendance', num: true, fmt: function (r) { return c(r.att, 0.85, 0.7, AL.pct(r.att)); } },
      { key: 'sleep', label: 'Sleep', num: true, val: function (r) { return r.p.sleep; }, fmt: function (r) { return r.p.sleep == null ? '<span class="muted" title="No wearable connected">n/a</span>' : c(r.p.sleep, 7.3, 6.5, dayN(r.p.sleep, 1) + 'h'); } },
      { key: 'ago', label: 'Last open', num: true, fmt: function (r) { return r.ago == null ? '<span class="red">never</span>' : '<span class="' + (r.ago > 7 ? 'red' : r.ago > 3 ? 'amber' : '') + '">' + (r.ago === 0 ? 'today' : r.ago + 'd ago') + '</span>'; } },
      { key: 'attn', label: 'Alerts', num: true, title: 'Sorted by attention score (red alerts weigh most)', fmt: function (r) {
        if (!r.alerts.length) return AL.chip('g', 'OK');
        var red = r.alerts.some(function (a) { return a.lvl === 'r'; });
        return '<span title="' + AL.esc(r.alerts.map(function (a) { return a.txt; }).join(' · ')) + '">' + AL.chip(red ? 'r' : 'a', r.alerts.length + ' alert' + (r.alerts.length > 1 ? 's' : '')) + '</span>'; } }
    ], rows, {
      sortKey: 'attn', sortDir: 'desc', empty: 'No Alcovians match this pod / advisor filter.',
      rowAttrs: function (r) { return 'class="clickable" tabindex="0" data-id="' + r.id + '" aria-label="Open details for ' + AL.esc(r.name) + '"'; },
      after: function (el) {
        el.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
          tr.addEventListener('click', function () { openDrawer(tr.getAttribute('data-id'), tr); });
          tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(tr.getAttribute('data-id'), tr); } });
        });
      }
    });
  }

  // ---------- drill-down drawer ----------
  var drawer = document.getElementById('drawer'), scrim = document.getElementById('scrim');
  function openDrawer(id, from) {
    openId = id; lastFocus = from || document.activeElement;
    drawer.hidden = false; scrim.hidden = false;
    renderDrawer();
    requestAnimationFrame(function () { drawer.classList.add('open'); scrim.classList.add('open'); });
    document.getElementById('dr-close').focus();
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    if (!openId) return;
    openId = null;
    drawer.classList.remove('open'); scrim.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function () { if (!openId) { drawer.hidden = true; scrim.hidden = true; } }, 220);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  document.getElementById('dr-close').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (!openId) return;
    if (e.key === 'Escape') closeDrawer();
    if (e.key === 'Tab') { // keep focus inside the dialog
      var f = drawer.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function renderDrawer() {
    var id = openId, st = STU[id]; if (!st) return;
    var en = ENR[st.enrollment_id], p = perf([id], R.from, R.to), al = alertsFor(id, R), q = quality([id], R.from, R.to).tot;
    document.getElementById('dr-name').textContent = st.name;
    document.getElementById('dr-meta').textContent = 'Grade ' + st.grade + ' · Pod ' + POD[st.pod_id] + ' · Advisor ' + ADV[st.advisor_id] + ' · ' +
      (st.plan === 'trial_3m' ? '3-month trial (ends ' + AL.fmtDate(en.end_date, true) + ')' : 'Full program') + ' · joined ' + AL.fmtDate(st.joined_at, true) +
      (st.wearable_source ? ' · wearable: ' + { apple: 'Apple Health', samsung: 'Health Connect (Samsung)', whoop: 'WHOOP', garmin: 'Garmin' }[st.wearable_source] : ' · no wearable');
    var h = '';
    h += '<section class="card"><h3 class="subh">Alerts as of ' + AL.fmtDate(R.to, true) + '</h3><ul class="alerts">' +
      (al.length ? al.map(function (a) { return '<li class="' + (a.lvl === 'r' ? '' : 'a') + '"><span aria-hidden="true">' + (a.lvl === 'r' ? '●' : '○') + '</span>' + AL.esc(a.txt) + '</li>'; }).join('') : '<li class="ok">No alerts. On track.</li>') + '</ul></section>';
    var mk = [['App min/day', dayN(p.appMin, 1)], ['Focus min/day', dayN(p.focusMin, 0)], ['Quiz avg', AL.pct(p.quiz)], ['Timetable', AL.pct(p.tt)],
      ['Tasks done', AL.pct(p.taskComp)], ['On-time', AL.pct(p.deadline)], ['Ready vs pace', AL.pct(p.ready) + ' / ' + AL.pct(p.pace)], ['Attendance', AL.pct(q.attP)]];
    h += '<div class="mini-kpis">' + mk.map(function (k) { return '<div><div class="l">' + k[0] + '</div><div class="v">' + k[1] + '</div></div>'; }).join('') + '</div>';
    h += '<section class="card"><h3 class="subh">Trends · ' + AL.fmtRange(R.from, R.to) + '</h3><div class="chart-box short"><canvas id="ch-dr-trend" role="img" aria-label="Focus, app minutes and quiz trend"></canvas></div></section>';
    // heatmap
    var subs = [], bySub = {};
    I.ch[id].forEach(function (cpt) { if (!bySub[cpt.subject]) { bySub[cpt.subject] = [0, 0, 0, 0, 0, 0]; subs.push(cpt.subject); } bySub[cpt.subject][stageAt(cpt, R.to)]++; });
    var maxCell = 1; subs.forEach(function (s) { bySub[s].forEach(function (v) { if (v > maxCell) maxCell = v; }); });
    var STG = ['0 Not started', '1 Read', '2 Notes', '3 Practice ≥70%', '4 Timed PYQ', '5 Ready'];
    h += '<section class="card"><h3 class="subh">Chapter readiness heatmap (as of ' + AL.fmtDate(R.to) + ')</h3><div class="table-wrap" style="border:0"><table class="heat"><thead><tr><th></th>' +
      STG.map(function (s) { return '<th scope="col" title="' + s + '">' + s.split(' ')[0] + '<br><span style="font-weight:400">' + s.split(' ').slice(1).join(' ') + '</span></th>'; }).join('') + '<th scope="col">Score</th></tr></thead><tbody>' +
      subs.map(function (s) {
        var row = bySub[s], n = AL.sum(row), score = AL.div(AL.sum(row.map(function (v, i) { return v * i; })), n * 5);
        return '<tr><th scope="row" class="rowh">' + s + '</th>' + row.map(function (v, i) {
          var a = v / maxCell, bg = i === 5 ? 'rgba(21,128,61,' + (0.1 + a * 0.75).toFixed(2) + ')' : i <= 1 ? 'rgba(185,28,28,' + (0.06 + a * 0.5).toFixed(2) + ')' : 'rgba(55,48,163,' + (0.06 + a * 0.6).toFixed(2) + ')';
          return '<td style="background:' + (v ? bg : '#f4f5f7') + ';color:' + (a > 0.55 ? '#fff' : C.ink) + '" title="' + s + ', stage ' + STG[i] + ': ' + v + ' chapters">' + v + '</td>';
        }).join('') + '<td style="font-weight:700">' + Math.round((score || 0) * 100) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="note">Cells = number of chapters at each stage. Score = avg stage ÷ 5 × 100.</p></section>';
    h += '<section class="card"><h3 class="subh">Exams vs target</h3><div class="chart-box short" id="box-dr-exam"><canvas id="ch-dr-exam" role="img" aria-label="Exam scores versus targets"></canvas></div><p class="note" id="dr-exam-note"></p></section>';
    // milestones
    var mFrom = AL.monthStart(R.from), mTo = AL.monthStart(R.to), ms = I.ms[id].filter(function (m) { return m.month >= mFrom && m.month <= mTo; });
    h += '<section class="card"><h3 class="subh">Roadmap milestones (' + AL.fmtDate(mFrom).replace(/^1 /, '') + (mFrom !== mTo ? '–' + AL.fmtDate(mTo).replace(/^1 /, '') : '') + ')</h3>' +
      (ms.length ? '<ul class="ms-list">' + ['career', 'personal', 'academic'].map(function (tk) {
        var it = ms.filter(function (m) { return m.track === tk; });
        var d = it.filter(function (m) { return m.done_at && m.done_at <= R.to; }).length;
        return '<li><h4>' + tk + ' · ' + d + '/' + it.length + '</h4><ul>' + it.map(function (m) {
          var done = m.done_at && m.done_at <= R.to;
          return '<li><span class="' + (done ? 'ms-done' : 'ms-open') + '" aria-label="' + (done ? 'done' : 'open') + '">' + (done ? '✓' : '○') + '</span><span>' + AL.esc(m.title) + ' <span class="muted">· ' + AL.fmtDate(m.month).replace(/^1 /, '') + '</span></span></li>';
        }).join('') + '</ul></li>';
      }).join('') + '</ul>' : '<p class="note">No milestones in these months.</p>') + '</section>';
    h += '<p class="src"><span><b>Data source:</b> app events, focus timer, in-app quiz, ClickUp advisor forms, wearables. Nothing on this panel is typed in by hand.</span></p>';
    document.getElementById('dr-body').innerHTML = h;

    // trend chart
    var B = AL.buckets(R.from, R.to, 'auto');
    var sd = B.map(function () { return 0; }), app = sd.slice(), foc = sd.slice(), qs = sd.slice(), qt = sd.slice();
    B.forEach(function (b, i) { sd[i] = sdays(id, b.from, b.to); });
    I.app[id].forEach(function (a) { var i = B.index(a.started_at); if (i >= 0) app[i] += a.duration_s / 60; });
    I.focus[id].forEach(function (x) { var i = B.index(x.started_at); if (i >= 0) foc[i] += x.actual_min; });
    I.quiz[id].forEach(function (x) { var i = B.index(x.submitted_at); if (i >= 0) { qs[i] += x.score; qt[i] += x.total; } });
    var r1 = function (v) { return v == null ? null : +v.toFixed(1); };
    AL.chart('ch-dr-trend', {
      data: { labels: B.map(function (b) { return b.label; }), datasets: [
        { type: 'bar', label: 'Focus min/day', data: B.map(function (b, i) { return r1(AL.div(foc[i], sd[i])); }), backgroundColor: C.accent3, yAxisID: 'y', order: 3 },
        { type: 'line', label: 'App min/day', data: B.map(function (b, i) { return r1(AL.div(app[i], sd[i])); }), borderColor: C.accent, backgroundColor: C.accent, yAxisID: 'y', tension: 0.25, pointRadius: 2, order: 1 },
        { type: 'line', label: 'Quiz %', data: B.map(function (b, i) { var v = AL.div(qs[i], qt[i]); return v == null ? null : Math.round(v * 100); }), borderColor: C.warn, backgroundColor: C.warn, yAxisID: 'y2', tension: 0.25, pointRadius: 2, spanGaps: true, order: 2 }] },
      options: { interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, title: { display: true, text: 'min / day' } },
          y2: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { callback: function (v) { return v + '%'; } } } },
        plugins: { legend: { position: 'bottom' } } }
    });
    // exams: in period, else the latest sitting
    var ex = I.ex[id].filter(function (e) { return AL.inR(e.exam_date, R.from, R.to); }), note;
    if (ex.length) note = ex.length + ' results in the period.';
    else {
      var past = I.ex[id].filter(function (e) { return e.exam_date <= R.to; });
      var lastDate = past.reduce(function (m, e) { return e.exam_date > m ? e.exam_date : m; }, '');
      var lastType = past.filter(function (e) { return e.exam_date === lastDate; }).map(function (e) { return e.exam_type; })[0];
      ex = past.filter(function (e) { return e.exam_type === lastType && AL.dn(lastDate) - AL.dn(e.exam_date) <= 7; });
      note = ex.length ? 'No exams in the period, so this shows the latest sitting (' + lastType.replace('_', '-') + ', ' + AL.fmtDate(lastDate, true) + ').' : '';
    }
    document.getElementById('dr-exam-note').textContent = note;
    var exSubs = [], agg = {};
    ex.forEach(function (e) { var k = e.subject; if (!agg[k]) { agg[k] = { s: 0, t: 0, n: 0 }; exSubs.push(k); } agg[k].s += e.score_pct; agg[k].t += TARGET[id + '|' + e.subject + '|' + e.exam_type]; agg[k].n++; });
    if (!emptyNote('ch-dr-exam', exSubs.length ? null : 'No exam results yet.')) {
      AL.chart('ch-dr-exam', {
        type: 'bar',
        data: { labels: exSubs, datasets: [
          { label: 'Score', data: exSubs.map(function (k) { return Math.round(agg[k].s / agg[k].n); }), backgroundColor: exSubs.map(function (k) { return agg[k].s >= agg[k].t ? C.good : C.accent; }), borderRadius: 3 },
          { label: 'Target', data: exSubs.map(function (k) { return Math.round(agg[k].t / agg[k].n); }), backgroundColor: C.slate2, borderRadius: 3 }] },
        options: { scales: { y: { min: 0, max: 100, ticks: { callback: function (v) { return v + '%'; } } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom' } } }
      });
    }
  }

  // ---------- wiring ----------
  function renderAll() {
    var list = ids();
    document.getElementById('page-sub').textContent = list.length + ' of ' + D.students.length + ' Alcovians on the app' +
      (podF !== 'all' ? ' · Pod ' + POD[podF] : '') + (advF !== 'all' ? ' · ' + ADV[advF] : '');
    rowsCache = buildRows(list);
    renderAttention();
    renderQuantity(list);
    renderQuality(list);
    renderPerformance(list);
    renderApp(list);
    renderCohort();
    if (openId) renderDrawer();
  }

  var host = document.getElementById('timeline');
  R = AL.mountTimeline(host, function (r) { R = r; renderAll(); });
  var tl = host.querySelector('.tl');
  var extra = document.createElement('span');
  extra.className = 'tl';
  extra.innerHTML = '<label class="fl"><span>Pod</span><select id="f-pod"><option value="all">All pods</option>' + D.pods.map(function (p) { return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('') + '</select></label>' +
    '<label class="fl"><span>Advisor</span><select id="f-adv"><option value="all">All advisors</option>' + D.advisors.map(function (a) { return '<option value="' + a.id + '">' + a.name + '</option>'; }).join('') + '</select></label>';
  tl.insertBefore(extra, tl.firstChild);
  document.getElementById('f-pod').addEventListener('change', function (e) { podF = e.target.value; renderAll(); });
  document.getElementById('f-adv').addEventListener('change', function (e) { advF = e.target.value; renderAll(); });
  AL.segmented(document.getElementById('gran-chips'), [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter']], gran,
    function (v) { gran = v; renderQuantity(ids()); }, 'Time granularity');
  renderAll();
})();
