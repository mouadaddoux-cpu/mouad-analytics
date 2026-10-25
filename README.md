<p align="center">
  <img src="assets/social-preview.png" alt="MOUAD — campaign analytics in the browser" width="100%">
</p>

<h1 align="center">MOUAD</h1>

<p align="center">
  <strong>Drop a CSV, get KPIs, spend-vs-CTR trends and flagged winners.</strong><br>
  Vanilla JS · Chart.js · no backend · nothing leaves your browser
</p>

<p align="center">
  <a href="https://mouadaddoux-cpu.github.io/mouad-analytics/"><img alt="Live demo" src="https://img.shields.io/badge/live_demo-open-2ee6a8?style=flat-square&labelColor=0d0b17"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-7c5cff?style=flat-square&labelColor=0d0b17"></a>
  <img alt="No backend" src="https://img.shields.io/badge/backend-none-fc0a7e?style=flat-square&labelColor=0d0b17">
</p>

---

## What it does

Point the dashboard at a campaign export and it answers one question fast: **where is the money working?**

- **Five headline KPIs** — spend, conversions, CTR, CPC and conversion rate, each recomputed from the raw totals.
- **Spend vs CTR trend** — weekly budget in bars against click-through rate on a second axis, so you can see whether traffic quality followed the spend.
- **Flagged winners** — a campaign is flagged when its CTR beats 1.5× the account average *and* it has at least 100 clicks. No manual sorting.
- **Raw row view** — the parsed rows, unchanged, one click away when you need to sanity-check a number.

Nothing is uploaded. The CSV is read with `FileReader`, parsed in the tab and discarded when you close it. There is no account, no analytics script and no cookie banner.

## Quick start

```bash
git clone https://github.com/mouadaddoux-cpu/mouad-analytics.git
cd mouad-analytics
python3 -m http.server 8000     # or: npx serve .
# open http://localhost:8000
```

Opening `index.html` straight from disk works too — the sample data has an embedded copy,
so `file://` gets the full experience.

Then hit **Open the dashboard → Load sample data**. With the bundled 24-row dataset you should read:

| KPI | Value |
| --- | --- |
| Spend | **$1,827.00** |
| Conversions | **342** |
| CTR | **1.85%** |
| CPC | **$0.30** |
| Conversion rate | **5.58%** |

Impressions 331,297 · clicks 6,129 · 6 campaigns · 4 weeks · 24 rows.

## CSV format

The first row must be a header row; the delimiter is a comma. Column names are matched loosely
(`spend`, `cost`, `amount spent`; `clicks`, `link clicks`; `conversions`, `purchases`, `leads`…).

```csv
campaign,channel,week,impressions,clicks,spend,conversions
Retargeting — Hot Leads,Meta,2026-09-28,3417,127,30.05,12
Search — Brand Core,Google,2026-09-28,5808,260,67.12,22
Creator Spark,TikTok,2026-09-28,20500,286,58.45,6
```

`campaign`, `impressions`, `clicks`, `spend` and `conversions` are required; `channel` and `week` are optional.
Cells like `$1,204.50`, `12.5%`, `(300)` and `1.234,56` are all parsed. Full reference: **[docs/data-format.html](docs/data-format.html)**.

## Project layout

```
mouad-analytics/
├── index.html               landing page
├── dashboard.html           the app
├── css/styles.css           design system + dashboard styles
├── js/app.js                CSV parsing, KPIs, chart, winners
├── js/sample-data.js        embedded copy of the sample CSV (offline fallback)
├── js/vendor/chart.umd.js   Chart.js 4.4.1 (MIT), vendored — no CDN call at runtime
├── fonts/                   Gothic A1 woff2 subsets (SIL OFL 1.1)
├── assets/                  favicon, screenshot, social preview, video/mouad-intro.mp4
├── docs/data-format.html    column reference + formulas
├── sample-campaigns.csv     24 sample rows
└── LICENSE                  MIT
```

## How the KPIs are computed

Rates are recomputed from the summed totals, never averaged across rows:

| KPI | Formula |
| --- | --- |
| CTR | Σ clicks ÷ Σ impressions × 100 |
| CPC | Σ spend ÷ Σ clicks |
| Conversion rate | Σ conversions ÷ Σ clicks × 100 |

Thresholds for a winner live at the top of `js/app.js` (`WINNER_CTR_MULTIPLIER`, `WINNER_MIN_CLICKS`).

## Tech notes

- **No build step.** No bundler, no transpiler, no `node_modules` to install.
- **One dependency.** Chart.js is vendored so the page never calls a CDN.
- **Fonts are self-hosted.** Gothic A1 in woff2, subset to Latin — no Google Fonts request.
- **Deploy = copy.** GitHub Pages serves it as-is from the repository root.

## License

MIT — see [LICENSE](LICENSE). Chart.js is MIT; Gothic A1 is licensed under the SIL Open Font License 1.1.
