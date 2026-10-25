/* ============================================================
   MOUAD — dashboard logic
   Vanilla JS. Parses a campaign CSV in the browser, computes
   KPIs, draws a spend-vs-CTR trend and flags winners.
   No network calls except fetching the bundled sample CSV.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- config ---------------- */

  var WINNER_CTR_MULTIPLIER = 1.5;   // CTR must beat 1.5x the account average
  var WINNER_MIN_CLICKS = 100;       // ...and have enough clicks to be credible

  var COLUMN_ALIASES = {
    campaign: ['campaign', 'campaign name', 'campaign_name', 'campaignname', 'name', 'ad set', 'adset', 'ad group', 'adgroup'],
    channel: ['channel', 'network', 'platform', 'source', 'publisher'],
    week: ['week', 'date', 'day', 'period', 'month', 'week starting', 'week_start', 'start date'],
    impressions: ['impressions', 'impression', 'impr', 'impr.', 'views'],
    clicks: ['clicks', 'click', 'link clicks', 'link_clicks'],
    spend: ['spend', 'cost', 'amount spent', 'amount_spent', 'budget', 'spend (usd)', 'cost (usd)'],
    conversions: ['conversions', 'conversion', 'conv', 'results', 'purchases', 'leads', 'orders', 'signups']
  };

  /* ---------------- tiny helpers ---------------- */

  function $(id) { return document.getElementById(id); }

  function normalizeHeader(h) {
    return String(h || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[_\-.]+/g, ' ')
      .replace(/\s+/g, ' ');
  }

  /** Parse a possibly messy numeric cell: "$1,204.50", "12.5%", "(300)", "1 024". */
  function parseNumber(raw) {
    if (raw === null || raw === undefined) return NaN;
    var s = String(raw).trim();
    if (!s) return NaN;
    var negative = /^\(.*\)$/.test(s);
    s = s.replace(/[()]/g, '');
    var isPercent = s.indexOf('%') !== -1;
    s = s.replace(/[^0-9.,\-]/g, '');
    // 1.234,56 (european) → 1234.56
    if (/,\d{1,2}$/.test(s) && s.indexOf('.') > -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
    if (s === '' || s === '-' || s === '.') return NaN;
    var n = parseFloat(s);
    if (isNaN(n)) return NaN;
    if (isPercent) n = n / 100;
    return negative ? -n : n;
  }

  /** RFC4180-ish CSV parser (quotes, escaped quotes, CRLF, BOM). */
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    while (i < text.length) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(field); field = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') {
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = []; i++; continue;
      }
      field += ch; i++;
    }
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }

  function fmtMoney(n, decimals) {
    if (!isFinite(n)) return '—';
    var d = decimals === undefined ? 2 : decimals;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtInt(n) {
    if (!isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n, d) {
    if (!isFinite(n)) return '—';
    var dec = d === undefined ? 2 : d;
    return n.toFixed(dec) + '%';
  }
  function pct(n) { return isFinite(n) ? n * 100 : NaN; }

  /* ---------------- parsing a dataset ---------------- */

  function mapColumns(headerCells) {
    var map = {};
    var normalized = headerCells.map(normalizeHeader);
    Object.keys(COLUMN_ALIASES).forEach(function (key) {
      var aliases = COLUMN_ALIASES[key];
      for (var a = 0; a < aliases.length; a++) {
        var idx = normalized.indexOf(aliases[a]);
        if (idx !== -1) { map[key] = idx; return; }
      }
      // loose pass: header contains the alias
      for (var b = 0; b < aliases.length; b++) {
        for (var c = 0; c < normalized.length; c++) {
          if (normalized[c] && normalized[c].indexOf(aliases[b]) !== -1) { map[key] = c; return; }
        }
      }
    });
    return map;
  }

  function datasetFromCSV(text, sourceLabel) {
    var raw = parseCSV(text);
    if (!raw.length) throw new Error('The file looks empty.');
    var map = mapColumns(raw[0]);

    var missing = ['impressions', 'clicks', 'spend', 'conversions'].filter(function (k) {
      return map[k] === undefined;
    });
    if (missing.length) {
      throw new Error('Missing required column' + (missing.length > 1 ? 's' : '') + ': ' +
        missing.join(', ') + '. Found: ' + raw[0].join(', '));
    }

    var rows = [];
    var skipped = 0;
    for (var r = 1; r < raw.length; r++) {
      var cells = raw[r];
      if (!cells || cells.every(function (c) { return String(c).trim() === ''; })) continue;
      var impressions = parseNumber(cells[map.impressions]);
      var clicks = parseNumber(cells[map.clicks]);
      var spend = parseNumber(cells[map.spend]);
      var conversions = parseNumber(cells[map.conversions]);
      if (isNaN(impressions) && isNaN(clicks) && isNaN(spend) && isNaN(conversions)) { skipped++; continue; }
      rows.push({
        campaign: map.campaign !== undefined ? String(cells[map.campaign] || '').trim() || 'Untitled campaign' : 'Untitled campaign',
        channel: map.channel !== undefined ? String(cells[map.channel] || '').trim() : '',
        week: map.week !== undefined ? String(cells[map.week] || '').trim() : '',
        impressions: isNaN(impressions) ? 0 : impressions,
        clicks: isNaN(clicks) ? 0 : clicks,
        spend: isNaN(spend) ? 0 : spend,
        conversions: isNaN(conversions) ? 0 : conversions
      });
    }

    if (!rows.length) throw new Error('No data rows could be read. Check the delimiter and the header row.');
    return { rows: rows, source: sourceLabel || 'CSV', skipped: skipped };
  }

  /* ---------------- aggregation ---------------- */

  function totalsOf(rows) {
    var t = { impressions: 0, clicks: 0, spend: 0, conversions: 0, rows: rows.length };
    rows.forEach(function (r) {
      t.impressions += r.impressions;
      t.clicks += r.clicks;
      t.spend += r.spend;
      t.conversions += r.conversions;
    });
    t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : NaN;
    t.cpc = t.clicks > 0 ? t.spend / t.clicks : NaN;
    t.cvr = t.clicks > 0 ? (t.conversions / t.clicks) * 100 : NaN;
    return t;
  }

  function groupBy(rows, keyFn) {
    var out = {};
    var order = [];
    rows.forEach(function (r) {
      var k = keyFn(r);
      if (!out[k]) { out[k] = []; order.push(k); }
      out[k].push(r);
    });
    return order.map(function (k) {
      return { key: k, rows: out[k], totals: totalsOf(out[k]) };
    });
  }

  function campaignSummaries(rows, accountCtr) {
    return groupBy(rows, function (r) { return r.campaign; }).map(function (g) {
      var t = g.totals;
      var ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
      var winner = accountCtr > 0 &&
        ctr >= accountCtr * WINNER_CTR_MULTIPLIER &&
        t.clicks >= WINNER_MIN_CLICKS;
      return {
        name: g.key,
        channel: g.rows.length ? g.rows[0].channel : '',
        impressions: t.impressions,
        clicks: t.clicks,
        spend: t.spend,
        conversions: t.conversions,
        ctr: ctr,
        cpc: t.clicks > 0 ? t.spend / t.clicks : NaN,
        cvr: t.clicks > 0 ? (t.conversions / t.clicks) * 100 : NaN,
        winner: winner
      };
    }).sort(function (a, b) { return b.spend - a.spend; });
  }

  function weeklySeries(rows) {
    var groups = groupBy(rows, function (r) { return r.week || 'All'; });
    groups.sort(function (a, b) {
      if (a.key === 'All') return 1;
      if (b.key === 'All') return -1;
      var da = Date.parse(a.key), db = Date.parse(b.key);
      if (!isNaN(da) && !isNaN(db)) return da - db;
      return a.key.localeCompare(b.key);
    });
    return groups.map(function (g) {
      return {
        label: g.key,
        spend: Math.round(g.totals.spend * 100) / 100,
        ctr: g.totals.impressions > 0 ? (g.totals.clicks / g.totals.impressions) * 100 : 0
      };
    });
  }

  /* ---------------- chart ---------------- */

  var chart = null;

  function drawChart(series) {
    var canvas = $('trend-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    var ctx = canvas.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 320);
    grad.addColorStop(0, 'rgba(252,10,126,0.95)');
    grad.addColorStop(1, 'rgba(96,43,182,0.35)');

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      data: {
        labels: series.map(function (s) { return s.label; }),
        datasets: [
          {
            type: 'bar',
            label: 'Spend',
            data: series.map(function (s) { return s.spend; }),
            backgroundColor: grad,
            borderColor: 'rgba(252,10,126,0.9)',
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 46,
            order: 2,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'CTR',
            data: series.map(function (s) { return Math.round(s.ctr * 100) / 100; }),
            borderColor: '#2ee6a8',
            backgroundColor: '#2ee6a8',
            borderWidth: 2.5,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#0d0b17',
            pointBorderColor: '#2ee6a8',
            pointBorderWidth: 2,
            order: 1,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 550 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#16132a',
            borderColor: 'rgba(255,255,255,0.14)',
            borderWidth: 1,
            titleColor: '#f4f2ff',
            bodyColor: '#a49fc4',
            padding: 12,
            cornerRadius: 10,
            displayColors: true,
            callbacks: {
              label: function (item) {
                return item.dataset.label === 'Spend'
                  ? ' Spend: ' + fmtMoney(item.parsed.y)
                  : ' CTR: ' + item.parsed.y.toFixed(2) + '%';
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: 'rgba(255,255,255,0.09)' },
            ticks: { color: '#6f6a91', font: { family: 'Gothic A1', size: 11 } }
          },
          y: {
            position: 'left',
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.055)' },
            border: { display: false },
            ticks: {
              color: '#6f6a91',
              font: { family: 'Gothic A1', size: 11 },
              callback: function (v) { return '$' + v; }
            }
          },
          y1: {
            position: 'right',
            beginAtZero: true,
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: '#2ee6a8',
              font: { family: 'Gothic A1', size: 11 },
              callback: function (v) { return v + '%'; }
            }
          }
        }
      }
    });
  }

  /* ---------------- rendering ---------------- */

  var state = { data: null };

  function setNotice(kind, message) {
    var el = $('notice-' + kind);
    if (!el) return;
    if (message) { el.textContent = message; el.classList.add('show'); }
    else { el.textContent = ''; el.classList.remove('show'); }
  }

  function clearNotices() { setNotice('error', ''); setNotice('ok', ''); }

  function setValue(id, text, empty) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-empty', !!empty);
  }

  function render(data) {
    state.data = data;
    var rows = data.rows;
    var t = totalsOf(rows);
    var summaries = campaignSummaries(rows, t.ctr);
    var series = weeklySeries(rows);
    var winners = summaries.filter(function (s) { return s.winner; });

    // KPIs — the five headline numbers
    setValue('kpi-spend', fmtMoney(t.spend));
    setValue('kpi-conversions', fmtInt(t.conversions));
    setValue('kpi-ctr', fmtPct(t.ctr));
    setValue('kpi-cpc', isFinite(t.cpc) ? '$' + t.cpc.toFixed(2) : '—');
    setValue('kpi-cvr', fmtPct(t.cvr));

    $('kpi-spend-foot').textContent = fmtInt(t.clicks) + ' clicks · ' + fmtMoney(t.cpc) + ' avg CPC';
    $('kpi-conversions-foot').textContent = fmtMoney(t.spend > 0 ? t.spend / Math.max(1, t.conversions) : NaN, 2) + ' cost per conversion';
    $('kpi-ctr-foot').textContent = fmtInt(t.clicks) + ' clicks ÷ ' + fmtInt(t.impressions) + ' impressions';
    $('kpi-cpc-foot').textContent = 'budget ÷ clicks';
    $('kpi-cvr-foot').textContent = fmtInt(t.conversions) + ' of ' + fmtInt(t.clicks) + ' clicks';

    // stats strip
    $('strip').hidden = false;
    $('stat-impressions').textContent = fmtInt(t.impressions);
    $('stat-clicks').textContent = fmtInt(t.clicks);
    $('stat-campaigns').textContent = fmtInt(summaries.length);
    $('stat-weeks').textContent = fmtInt(series.length);
    $('stat-rows').textContent = fmtInt(rows.length);
    $('stat-source').textContent = 'source: ' + data.source + (data.skipped ? ' · ' + data.skipped + ' unreadable row(s) skipped' : '');

    // expose for tests / debugging
    document.body.dataset.rows = String(rows.length);
    document.body.dataset.kpiSpend = fmtMoney(t.spend);
    document.body.dataset.kpiCtr = fmtPct(t.ctr);
    document.body.dataset.kpiCpc = isFinite(t.cpc) ? '$' + t.cpc.toFixed(2) : '—';
    document.body.dataset.kpiCvr = fmtPct(t.cvr);
    document.body.dataset.kpiConversions = fmtInt(t.conversions);

    // chart
    $('chart-panel').hidden = false;
    drawChart(series);

    // winners
    $('winners-panel').hidden = false;
    $('winners-count').textContent = winners.length + (winners.length === 1 ? ' winner' : ' winners');
    var list = $('winners-list');
    list.innerHTML = '';
    winners.forEach(function (w) {
      var card = document.createElement('article');
      card.className = 'winner';
      var name = document.createElement('div');
      name.className = 'wname';
      name.innerHTML = '<span class="badge badge-win">Scale</span>' + escapeHtml(w.name);
      var stats = document.createElement('div');
      stats.className = 'wstats';
      stats.textContent = fmtPct(w.ctr) + ' CTR · ' + fmtInt(w.clicks) + ' clicks · ' +
        fmtMoney(w.spend) + ' spend · ' + fmtInt(w.conversions) + ' conv.';
      card.appendChild(name);
      card.appendChild(stats);
      list.appendChild(card);
    });
    $('winners-empty').hidden = winners.length > 0;

    // table
    $('table-panel').hidden = false;
    var tbody = $('table-body');
    tbody.innerHTML = '';
    summaries.forEach(function (s) {
      var tr = document.createElement('tr');
      if (s.winner) tr.className = 'is-winner';
      tr.innerHTML =
        '<td><span class="ch-name">' + escapeHtml(s.name) + '</span>' +
          (s.channel ? '<div class="ch-sub">' + escapeHtml(s.channel) + '</div>' : '') + '</td>' +
        '<td>' + fmtInt(s.impressions) + '</td>' +
        '<td>' + fmtInt(s.clicks) + '</td>' +
        '<td>' + fmtMoney(s.spend) + '</td>' +
        '<td>' + fmtPct(s.ctr) + '</td>' +
        '<td>' + (isFinite(s.cpc) ? '$' + s.cpc.toFixed(2) : '—') + '</td>' +
        '<td>' + fmtInt(s.conversions) + '</td>' +
        '<td>' + fmtPct(s.cvr) + '</td>' +
        '<td>' + (s.winner
          ? '<span class="badge badge-win">Winner</span>'
          : '<span class="badge badge-flat">Watch</span>') + '</td>';
      tbody.appendChild(tr);
    });

    // raw rows view — the unaggregated dataset, exactly as parsed
    var rawBody = $('raw-body');
    rawBody.innerHTML = '';
    var rawRows = rows.slice().sort(function (a, b) {
      if (a.week && b.week && a.week !== b.week) return a.week < b.week ? -1 : 1;
      return a.campaign.localeCompare(b.campaign);
    });
    rawRows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span class="ch-name">' + escapeHtml(r.campaign) + '</span></td>' +
        '<td style="text-align:left;color:var(--dim)">' + escapeHtml(r.channel || '—') + '</td>' +
        '<td style="text-align:left;color:var(--dim)">' + escapeHtml(r.week || '—') + '</td>' +
        '<td>' + fmtInt(r.impressions) + '</td>' +
        '<td>' + fmtInt(r.clicks) + '</td>' +
        '<td>' + fmtMoney(r.spend) + '</td>' +
        '<td>' + fmtInt(r.conversions) + '</td>';
      rawBody.appendChild(tr);
    });
    $('table-sub').textContent = fmtInt(rows.length) + ' rows parsed · ' +
      fmtInt(summaries.length) + ' campaign' + (summaries.length === 1 ? '' : 's') + ' · sorted by spend.';

    $('empty-state').hidden = true;
    $('btn-export').disabled = false;
    $('btn-reset').disabled = false;
    var dz = $('dropzone');
    if (dz) dz.classList.add('compact');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function reset() {
    state.data = null;
    clearNotices();
    ['spend', 'conversions', 'ctr', 'cpc', 'cvr'].forEach(function (k) {
      setValue('kpi-' + k, '—', true);
    });
    $('strip').hidden = true;
    $('chart-panel').hidden = true;
    $('winners-panel').hidden = true;
    $('table-panel').hidden = true;
    $('empty-state').hidden = false;
    $('btn-export').disabled = true;
    $('btn-reset').disabled = true;
    document.body.dataset.rows = '0';
    var dz = $('dropzone');
    if (dz) dz.classList.remove('compact');
    if (chart) { chart.destroy(); chart = null; }
    $('file-input').value = '';
  }

  /* ---------------- loading ---------------- */

  function loadText(text, label) {
    try {
      var data = datasetFromCSV(text, label);
      clearNotices();
      render(data);
      setNotice('ok', 'Loaded ' + data.rows.length + ' rows from ' + label + '.');
      return true;
    } catch (err) {
      setNotice('error', err.message || 'Could not read that file.');
      return false;
    }
  }

  function loadFile(file) {
    if (!file) return;
    if (!/\.csv$|^text\//i.test(file.name) && file.type && file.type.indexOf('csv') === -1) {
      // still try — many exports arrive with odd mime types
    }
    var reader = new FileReader();
    reader.onload = function () {
      loadText(String(reader.result), file.name);
    };
    reader.onerror = function () { setNotice('error', 'The browser could not read that file.'); };
    reader.readAsText(file);
  }

  function loadSample() {
    function useEmbedded(reason) {
      if (window.MOUAD_SAMPLE_CSV) {
        loadText(window.MOUAD_SAMPLE_CSV, 'sample-campaigns.csv');
      } else {
        setNotice('error', 'Sample data could not be loaded' + (reason ? ' (' + reason + ')' : '') + '.');
      }
    }
    if (location.protocol === 'file:' && window.MOUAD_SAMPLE_CSV) {
      // fetch() is blocked for local files — use the bundled copy
      useEmbedded('local file');
      return;
    }
    if (typeof fetch !== 'function') { useEmbedded('no fetch'); return; }
    fetch('sample-campaigns.csv', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (text) { loadText(text, 'sample-campaigns.csv'); })
      .catch(function (e) { useEmbedded(e && e.message); });
  }

  function exportSummary() {
    if (!state.data) return;
    var rows = state.data.rows;
    var t = totalsOf(rows);
    var summaries = campaignSummaries(rows, t.ctr);
    var lines = ['campaign,channel,impressions,clicks,spend,conversions,ctr_pct,cpc,cvr_pct,winner'];
    summaries.forEach(function (s) {
      lines.push([
        '"' + s.name.replace(/"/g, '""') + '"',
        '"' + (s.channel || '').replace(/"/g, '""') + '"',
        Math.round(s.impressions),
        Math.round(s.clicks),
        s.spend.toFixed(2),
        Math.round(s.conversions),
        s.ctr.toFixed(2),
        isFinite(s.cpc) ? s.cpc.toFixed(2) : '',
        isFinite(s.cvr) ? s.cvr.toFixed(2) : '',
        s.winner ? 'yes' : 'no'
      ].join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'mouad-summary.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------- wiring ---------------- */

  function init() {
    var dz = $('dropzone');
    var input = $('file-input');

    input.addEventListener('change', function () {
      if (input.files && input.files[0]) loadFile(input.files[0]);
    });

    ['dragenter', 'dragover'].forEach(function (evt) {
      dz.addEventListener(evt, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
    });
    ['dragleave', 'dragend'].forEach(function (evt) {
      dz.addEventListener(evt, function () { dz.classList.remove('is-over'); });
    });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('is-over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });

    $('btn-sample').addEventListener('click', loadSample);
    $('btn-export').addEventListener('click', exportSummary);
    $('btn-reset').addEventListener('click', reset);

    // table view switch
    var tabAgg = $('tab-agg'), tabRaw = $('tab-raw');
    function showView(which) {
      var agg = which === 'agg';
      $('view-agg').hidden = !agg;
      $('view-raw').hidden = agg;
      tabAgg.classList.toggle('is-active', agg);
      tabRaw.classList.toggle('is-active', !agg);
      tabAgg.setAttribute('aria-selected', String(agg));
      tabRaw.setAttribute('aria-selected', String(!agg));
    }
    tabAgg.addEventListener('click', function () { showView('agg'); });
    tabRaw.addEventListener('click', function () { showView('raw'); });

    if (location.hash === '#sample') loadSample();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // small public surface, handy for testing
  window.MOUAD = { parseCSV: parseCSV, datasetFromCSV: datasetFromCSV, totalsOf: totalsOf, loadSample: loadSample };
})();
