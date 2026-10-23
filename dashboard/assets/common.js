/* Shared helpers: dates, timeline selector, formatting, deltas, charts, sortable tables. */
(function () {
  'use strict';
  var D = window.ALDATA;
  var AL = window.AL = {};
  var MS = 864e5;

  AL.TODAY = D.today;
  AL.MIN = D.start;
  AL.dn = function (iso) { return Math.round(Date.parse(iso + 'T00:00:00Z') / MS); };
  AL.ds = function (n) { return new Date(n * MS).toISOString().slice(0, 10); };
  AL.add = function (iso, k) { return AL.ds(AL.dn(iso) + k); };
  AL.days = function (f, t) { return AL.dn(t) - AL.dn(f) + 1; };
  AL.inR = function (x, f, t) { return x != null && x >= f && x <= t; };
  AL.monthStart = function (iso) { return iso.slice(0, 8) + '01'; };
  AL.monthEnd = function (iso) { var d = new Date(Date.parse(iso + 'T00:00:00Z')); return AL.ds(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / MS); };
  AL.addMonths = function (iso, k) { var d = new Date(Date.parse(iso + 'T00:00:00Z')); return AL.ds(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1) / MS); };
  AL.maxD = function (a, b) { return a > b ? a : b; };
  AL.minD = function (a, b) { return a < b ? a : b; };

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  AL.fmtDate = function (iso, withYear) {
    if (!iso) return '—';
    var p = iso.split('-');
    return +p[2] + ' ' + MON[+p[1] - 1] + (withYear ? ' ' + p[0] : '');
  };
  AL.fmtRange = function (f, t) {
    if (!f) return '';
    return AL.fmtDate(f) + ' – ' + AL.fmtDate(t, true);
  };

  // ---------- numbers ----------
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  AL.isNum = isNum;
  AL.div = function (a, b) { return (isNum(a) && isNum(b) && b !== 0) ? a / b : null; };
  function trimNum(v, dp) { return String(+v.toFixed(dp)); }
  AL.inr = function (v) {
    if (!isNum(v)) return '—';
    var a = Math.abs(v), sg = v < 0 ? '−' : '';
    if (a >= 1e7) return sg + '₹' + trimNum(a / 1e7, 2) + 'Cr';
    if (a >= 1e5) return sg + '₹' + trimNum(a / 1e5, a >= 1e6 ? 1 : 2) + 'L';
    return sg + '₹' + Math.round(a).toLocaleString('en-IN');
  };
  AL.inrAxis = function (v) {
    var a = Math.abs(v);
    if (a >= 1e5) return '₹' + trimNum(v / 1e5, 1) + 'L';
    if (a >= 1e3) return '₹' + trimNum(v / 1e3, 0) + 'k';
    return '₹' + v;
  };
  AL.num = function (v, dp) { return isNum(v) ? (+v.toFixed(dp || 0)).toLocaleString('en-IN') : '—'; };
  AL.pct = function (v, dp) { return isNum(v) ? (v * 100).toFixed(dp == null ? 0 : dp) + '%' : '—'; };
  AL.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  AL.sum = function (arr, fn) { var s = 0; for (var i = 0; i < arr.length; i++) s += fn ? fn(arr[i]) : arr[i]; return s; };
  AL.median = function (arr) {
    var a = arr.filter(isNum).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  AL.quantile = function (arr, q) {
    var a = arr.filter(isNum).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return a[lo] + (a[hi] - a[lo]) * (pos - lo);
  };

  /*
   * Delta chip vs previous period.
   * mode: 'rel' (% change, for counts/currency) | 'pp' (percentage-point change, for rates given as fractions) | 'abs' (raw diff)
   */
  AL.delta = function (cur, prev, opts) {
    opts = opts || {};
    var mode = opts.mode || 'rel', goodUp = opts.goodUp !== false;
    if (!AL.range || !AL.range.prev) return '<span class="delta na" title="No comparable previous period in the data window">no prior period</span>';
    if (!isNum(cur) || !isNum(prev)) return '<span class="delta na">vs prev: —</span>';
    var diff = cur - prev, txt;
    if (mode === 'rel') {
      if (prev === 0) return cur === 0 ? '<span class="delta flat">flat vs prev</span>' : '<span class="delta na">new vs prev</span>';
      var r = diff / Math.abs(prev);
      txt = (r >= 0 ? '+' : '−') + Math.abs(r * 100).toFixed(Math.abs(r) < 0.1 ? 1 : 0) + '%';
    } else if (mode === 'pp') {
      txt = (diff >= 0 ? '+' : '−') + Math.abs(diff * 100).toFixed(1) + ' pp';
    } else {
      var dp = opts.dp == null ? 1 : opts.dp;
      txt = (diff >= 0 ? '+' : '−') + (opts.fmt ? opts.fmt(Math.abs(diff)) : Math.abs(diff).toFixed(dp));
    }
    var eps = mode === 'pp' ? 0.0005 : Math.max(1e-9, Math.abs(prev) * 0.005);
    if (Math.abs(diff) <= eps) return '<span class="delta flat" title="vs ' + AL.esc(AL.fmtRange(AL.range.prev.from, AL.range.prev.to)) + '">± 0 vs prev</span>';
    var up = diff > 0, good = up === goodUp;
    if (opts.neutral) good = null;
    var cls = good == null ? 'neutral' : (good ? 'good' : 'bad');
    return '<span class="delta ' + cls + '" title="Previous period ' + AL.esc(AL.fmtRange(AL.range.prev.from, AL.range.prev.to)) + '">' +
      '<span aria-hidden="true">' + (up ? '▲' : '▼') + '</span> ' + txt + ' <span class="vs">vs prev</span></span>';
  };

  // ---------- RAG ----------
  AL.rag = function (v, g, a, lowerIsBetter) {
    if (!isNum(v)) return 'na';
    if (lowerIsBetter) return v <= g ? 'g' : v <= a ? 'a' : 'r';
    return v >= g ? 'g' : v >= a ? 'a' : 'r';
  };
  AL.chip = function (cls, text, title) {
    return '<span class="chip ' + cls + '"' + (title ? ' title="' + AL.esc(title) + '"' : '') + '>' + text + '</span>';
  };

  // ---------- timeline ----------
  var PRESETS = [
    ['this_month', 'This month'], ['last_month', 'Last month'], ['last_30', 'Last 30 days'], ['last_90', 'Last 90 days'],
    ['qtd', 'Quarter to date'], ['last_quarter', 'Last quarter'], ['all', 'All data (Apr → today)'], ['custom', 'Custom…']
  ];
  function quarterStart(iso) { // calendar quarters (Q3 = Oct–Dec matches Indian FY Q3)
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1;
    var qm = m - (m % 3);
    return AL.ds(Date.UTC(y, qm, 1) / MS);
  }
  AL.resolveRange = function (st) {
    var T = AL.TODAY, f, t, pf, pt, p = st.preset;
    if (p === 'this_month') { f = AL.monthStart(T); t = T; pf = AL.addMonths(f, -1); pt = AL.minD(AL.add(pf, AL.days(f, t) - 1), AL.monthEnd(pf)); }
    else if (p === 'last_month') { f = AL.addMonths(AL.monthStart(T), -1); t = AL.monthEnd(f); pf = AL.addMonths(f, -1); pt = AL.monthEnd(pf); }
    else if (p === 'last_30') { t = T; f = AL.add(T, -29); pt = AL.add(f, -1); pf = AL.add(pt, -29); }
    else if (p === 'last_90') { t = T; f = AL.add(T, -89); pt = AL.add(f, -1); pf = AL.add(pt, -89); }
    else if (p === 'qtd') { f = quarterStart(T); t = T; pf = AL.addMonths(f, -3); pt = AL.add(pf, AL.days(f, t) - 1); }
    else if (p === 'last_quarter') { t = AL.add(quarterStart(T), -1); f = quarterStart(t); pt = AL.add(f, -1); pf = quarterStart(pt); }
    else if (p === 'all') { f = AL.MIN; t = T; pf = null; pt = null; }
    else {
      f = st.from || AL.add(T, -29); t = st.to || T;
      if (f > t) { var x = f; f = t; t = x; }
      f = AL.maxD(AL.minD(f, T), AL.MIN); t = AL.maxD(AL.minD(t, T), AL.MIN);
      var len = AL.days(f, t); pt = AL.add(f, -1); pf = AL.add(pt, -(len - 1));
      p = 'custom';
    }
    var prev = (pf && pf >= AL.MIN) ? { from: pf, to: pt } : null;
    var label = (PRESETS.filter(function (x) { return x[0] === p; })[0] || ['', 'Custom'])[1];
    return { preset: p, from: f, to: t, days: AL.days(f, t), prev: prev, label: label };
  };

  function readState() {
    var st = null;
    try {
      var h = (location.hash || '').replace(/^#/, '');
      var m = /(?:^|&)t=([^&]+)/.exec(h);
      if (m) {
        var v = decodeURIComponent(m[1]).split(':');
        st = { preset: v[0], from: v[1], to: v[2] };
      }
    } catch (e) { st = null; }
    if (!st) {
      try { var raw = window.localStorage.getItem('alcovia.timeline'); if (raw) st = JSON.parse(raw); } catch (e2) { st = null; }
    }
    var valid = PRESETS.some(function (x) { return st && x[0] === st.preset; });
    if (!valid) st = { preset: 'this_month' };
    var iso = /^\d{4}-\d{2}-\d{2}$/;
    if (st.preset === 'custom' && !(iso.test(st.from || '') && iso.test(st.to || ''))) st = { preset: 'custom', from: AL.add(AL.TODAY, -29), to: AL.TODAY };
    return st;
  }
  function writeState(st) {
    var tok = st.preset === 'custom' ? 'custom:' + st.from + ':' + st.to : st.preset;
    try { window.localStorage.setItem('alcovia.timeline', JSON.stringify(st)); } catch (e) { /* storage unavailable */ }
    try { history.replaceState(null, '', '#t=' + tok); } catch (e2) { /* ignore */ }
    document.querySelectorAll('a[data-keep-range]').forEach(function (a) {
      a.setAttribute('href', a.getAttribute('href').split('#')[0] + '#t=' + tok);
    });
  }

  AL.mountTimeline = function (host, onChange) {
    var st = readState();
    host.innerHTML =
      '<div class="tl">' +
      '<label class="fl"><span>Timeline</span><select id="tl-preset" aria-label="Timeline">' +
      PRESETS.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('') + '</select></label>' +
      '<span class="tl-custom" id="tl-custom" hidden>' +
      '<label class="fl"><span>From</span><input type="date" id="tl-from" min="' + AL.MIN + '" max="' + AL.TODAY + '"></label>' +
      '<label class="fl"><span>To</span><input type="date" id="tl-to" min="' + AL.MIN + '" max="' + AL.TODAY + '"></label></span>' +
      '</div><div class="tl-label" id="tl-label" aria-live="polite"></div>';
    var sel = host.querySelector('#tl-preset'), cw = host.querySelector('#tl-custom'),
      fi = host.querySelector('#tl-from'), ti = host.querySelector('#tl-to'), lab = host.querySelector('#tl-label');
    function apply(fire) {
      AL.range = AL.resolveRange(st);
      if (st.preset === 'custom') { st.from = AL.range.from; st.to = AL.range.to; }
      sel.value = AL.range.preset;
      cw.hidden = AL.range.preset !== 'custom';
      fi.value = AL.range.from; ti.value = AL.range.to;
      lab.innerHTML = '<strong>' + AL.fmtRange(AL.range.from, AL.range.to) + '</strong> · ' + AL.range.days + ' days' +
        (AL.range.prev ? ' <span class="muted">· compared with ' + AL.fmtRange(AL.range.prev.from, AL.range.prev.to) + '</span>' : ' <span class="muted">· no earlier period to compare</span>');
      writeState(st);
      if (fire) onChange(AL.range);
    }
    sel.addEventListener('change', function () {
      st = sel.value === 'custom' ? { preset: 'custom', from: AL.range.from, to: AL.range.to } : { preset: sel.value };
      apply(true);
    });
    function onDate() { if (fi.value && ti.value) { st = { preset: 'custom', from: fi.value, to: ti.value }; apply(true); } }
    fi.addEventListener('change', onDate); ti.addEventListener('change', onDate);
    window.addEventListener('hashchange', function () {
      var ns = readState();
      if (JSON.stringify(ns) !== JSON.stringify(st)) { st = ns; apply(true); }
    });
    apply(false);
    return AL.range;
  };

  // ---------- buckets ----------
  AL.autoGran = function (days) { return days <= 14 ? 'day' : days <= 92 ? 'week' : 'month'; };
  AL.buckets = function (f, t, gran) {
    gran = gran === 'auto' || !gran ? AL.autoGran(AL.days(f, t)) : gran;
    var out = [], d = f;
    while (d <= t) {
      var bEnd, lab;
      if (gran === 'day') { bEnd = d; lab = AL.fmtDate(d); }
      else if (gran === 'week') {
        var wd = new Date(Date.parse(d + 'T00:00:00Z')).getUTCDay(); // 0 Sun
        bEnd = AL.add(d, (7 - wd) % 7); // through Sunday
        lab = AL.fmtDate(d);
      } else if (gran === 'month') { bEnd = AL.monthEnd(d); lab = MON[+d.slice(5, 7) - 1] + ' ’' + d.slice(2, 4); }
      else { // quarter (Indian FY labels)
        var qs = quarterStart(d); bEnd = AL.add(AL.addMonths(qs, 3), -1);
        var mi = +qs.slice(5, 7); var fy = mi >= 4 ? +qs.slice(2, 4) + 1 : +qs.slice(2, 4);
        var qn = mi >= 4 ? (mi - 4) / 3 + 1 : 4;
        lab = 'Q' + qn + ' FY' + fy;
      }
      bEnd = AL.minD(bEnd, t);
      out.push({ from: d, to: bEnd, label: lab, days: AL.days(d, bEnd) });
      d = AL.add(bEnd, 1);
    }
    out.gran = gran;
    out.index = function (iso) {
      for (var i = 0; i < out.length; i++) if (iso >= out[i].from && iso <= out[i].to) return i;
      return -1;
    };
    return out;
  };

  // ---------- charts ----------
  AL.C = {
    ink: '#0f172a', muted: '#475569', grid: '#e9edf2',
    accent: '#3730a3', accent2: '#6366f1', accent3: '#a5b4fc', accent4: '#e0e7ff',
    slate: '#94a3b8', slate2: '#cbd5e1',
    good: '#15803d', warn: '#b45309', bad: '#b91c1c', goodBg: '#dcfce7', warnBg: '#fef3c7', badBg: '#fee2e2'
  };
  var charts = {};
  AL.chart = function (id, cfg) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    var el = document.getElementById(id);
    if (!el || !window.Chart) return null;
    charts[id] = new window.Chart(el, cfg);
    return charts[id];
  };
  if (window.Chart) {
    var Ch = window.Chart;
    Ch.defaults.font.family = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    Ch.defaults.font.size = 12;
    Ch.defaults.color = AL.C.muted;
    Ch.defaults.borderColor = AL.C.grid;
    Ch.defaults.maintainAspectRatio = false;
    Ch.defaults.animation = { duration: 250 };
    Ch.defaults.plugins.legend.labels.boxWidth = 10;
    Ch.defaults.plugins.legend.labels.boxHeight = 10;
    Ch.defaults.plugins.tooltip.backgroundColor = '#0f172a';
    Ch.defaults.plugins.tooltip.padding = 10;
    Ch.defaults.plugins.tooltip.cornerRadius = 6;
    Ch.defaults.plugins.tooltip.titleFont = { weight: '600' };
  }

  // ---------- sortable table ----------
  /*
   * cols: [{key, label, num, fmt(row) -> html, val(row) -> sortable value, title, cls}]
   * opts: {sortKey, sortDir, rowAttrs(row) -> string, empty}
   */
  AL.table = function (el, cols, rows, opts) {
    opts = opts || {};
    var state = el._sort || { key: opts.sortKey, dir: opts.sortDir || 'desc' };
    if (!cols.some(function (c) { return c.key === state.key; })) state = { key: opts.sortKey, dir: opts.sortDir || 'desc' };
    el._sort = state;
    function render() {
      var col = cols.filter(function (c) { return c.key === state.key; })[0];
      var data = rows.slice();
      if (col) {
        var vf = col.val || function (r) { return r[col.key]; };
        data.sort(function (a, b) {
          var x = vf(a), y = vf(b);
          var xn = x == null || (typeof x === 'number' && !isFinite(x)), yn = y == null || (typeof y === 'number' && !isFinite(y));
          if (xn && yn) return 0; if (xn) return 1; if (yn) return -1;
          var c = typeof x === 'string' ? x.localeCompare(y) : x - y;
          return state.dir === 'asc' ? c : -c;
        });
      }
      var h = '<thead><tr>' + cols.map(function (c) {
        var active = c.key === state.key;
        var aria = active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none';
        return '<th scope="col" class="' + (c.num ? 'num ' : '') + (c.cls || '') + '" aria-sort="' + aria + '"' + (c.title ? ' title="' + AL.esc(c.title) + '"' : '') + '>' +
          (c.nosort ? AL.esc(c.label) : '<button type="button" data-k="' + c.key + '">' + AL.esc(c.label) + '<span class="sort-ind" aria-hidden="true">' + (active ? (state.dir === 'asc' ? '▲' : '▼') : '↕') + '</span></button>') + '</th>';
      }).join('') + '</tr></thead><tbody>';
      if (!data.length) h += '<tr><td colspan="' + cols.length + '" class="empty">' + (opts.empty || 'No rows for this period.') + '</td></tr>';
      data.forEach(function (r) {
        h += '<tr' + (opts.rowAttrs ? ' ' + opts.rowAttrs(r) : '') + '>' + cols.map(function (c) {
          var v = c.fmt ? c.fmt(r) : AL.esc(r[c.key]);
          return (c.head ? '<th scope="row"' : '<td') + ' class="' + (c.num ? 'num ' : '') + (c.cls || '') + '">' + v + (c.head ? '</th>' : '</td>');
        }).join('') + '</tr>';
      });
      el.innerHTML = h + '</tbody>';
      el.querySelectorAll('thead button').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-k');
          if (state.key === k) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
          else { state.key = k; var cc = cols.filter(function (c) { return c.key === k; })[0]; state.dir = cc && cc.num ? 'desc' : 'asc'; }
          render();
          if (opts.onSort) opts.onSort(state);
        });
      });
      if (opts.after) opts.after(el);
    }
    render();
  };

  // ---------- segmented chips ----------
  AL.segmented = function (host, items, value, onChange, label) {
    host.setAttribute('role', 'radiogroup');
    if (label) host.setAttribute('aria-label', label);
    function draw() {
      host.innerHTML = items.map(function (it) {
        var on = it[0] === value;
        return '<button type="button" role="radio" aria-checked="' + on + '" class="seg' + (on ? ' on' : '') + '" data-v="' + it[0] + '">' + AL.esc(it[1]) + '</button>';
      }).join('');
      host.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () { value = b.getAttribute('data-v'); draw(); onChange(value); });
      });
    }
    draw();
  };

  // ---------- KPI tile ----------
  AL.tile = function (o) {
    return '<article class="kpi' + (o.cls ? ' ' + o.cls : '') + '">' +
      '<h3 class="kpi-l">' + o.label + (o.help ? ' <span class="help" tabindex="0" title="' + AL.esc(o.help) + '" aria-label="' + AL.esc(o.help) + '">?</span>' : '') + '</h3>' +
      '<div class="kpi-v">' + o.value + (o.badge || '') + '</div>' +
      (o.extra || '') +
      '<div class="kpi-f">' + (o.delta || '') + (o.sub ? '<span class="kpi-s">' + o.sub + '</span>' : '') + '</div>' +
      '</article>';
  };
})();
