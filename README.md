<p align="center">
  <img src="assets/og.png" alt="MOUAD ADDOU — freelance digital marketer" width="100%">
</p>

<h1 align="center">MOUAD ADDOU</h1>

<p align="center">
  <strong>Freelance digital marketer · paid media, funnels &amp; reporting</strong><br>
  Casablanca, Morocco — working remotely with brands and agencies across MENA and Europe
</p>

<p align="center">
  <a href="https://{{USERNAME}}.github.io/mouad-analytics/"><img alt="Portfolio" src="https://img.shields.io/badge/portfolio-live-2ee6a8?style=flat-square&labelColor=0d0b17"></a>
  <a href="https://{{USERNAME}}.github.io/mouad-analytics/dashboard.html"><img alt="Dashboard demo" src="https://img.shields.io/badge/demo-campaign_dashboard-fc0a7e?style=flat-square&labelColor=0d0b17"></a>
  <a href="mailto:{{EMAIL}}"><img alt="Email" src="https://img.shields.io/badge/email-say_hello-7c5cff?style=flat-square&labelColor=0d0b17"></a>
</p>

---

## What this repository is

My personal portfolio site — a hand-written static site, no framework and no build step.
It doubles as the home of **MOUAD**, the campaign analytics dashboard I build and use.

- **`index.html`** — the portfolio: services, selected work, process and contact
- **`dashboard.html`** — the live demo: drop a campaign CSV, read the KPIs
- **`docs/data-format.html`** — what the dashboard expects from a CSV

Live: **https://{{USERNAME}}.github.io/mouad-analytics/**

## Services

| | |
|---|---|
| **Paid media** | Campaign structure, budget pacing to a target cost per result, creative and audience testing on Meta, Google, TikTok and LinkedIn |
| **Audits & tracking** | Account audits, pixel and conversion-event verification, UTM and naming conventions |
| **Funnels** | Landing page structure, form and lead-flow friction, message match with the ad |
| **Reporting** | Weekly one-screen reads, Looker Studio or spreadsheet builds, and the MOUAD dashboard for CSV exports |

## The dashboard (MOUAD)

Drop a CSV exported from Meta, Google, TikTok or LinkedIn and get the five numbers that matter —
spend, conversions, CTR, CPC, conversion rate — plus a spend-vs-CTR trend and the campaigns
worth scaling. Everything is computed in the browser; the file never leaves the machine.

With the bundled 24-row sample dataset the KPIs read exactly:

| Spend | Conversions | CTR | CPC | Conv. rate |
| --- | --- | --- | --- | --- |
| **$1,827.00** | **342** | **1.85%** | **$0.30** | **5.58%** |

## Structure

```
/
├── index.html               portfolio (services, work, process, contact)
├── dashboard.html           campaign analytics demo
├── css/styles.css           design system
├── css/portfolio.css        portfolio layer
├── js/app.js                CSV parsing, KPIs, chart, winners
├── js/sample-data.js        embedded sample CSV (works offline / file://)
├── js/vendor/chart.umd.js   Chart.js 4.4.1 (MIT), vendored — no CDN at runtime
├── fonts/                   Gothic A1 woff2 (SIL OFL 1.1)
├── assets/                  portrait, screenshots, social card, video
└── docs/data-format.html    column reference + formulas
```

## Local preview

```bash
python3 -m http.server 8000   # → http://localhost:8000
```

The dashboard also works straight from `file://` — the sample CSV has an embedded fallback.

## Notes

- No analytics script, no cookie banner, no tracking pixels on this site.
- Numbers shown in the demo come from the bundled sample dataset and are labelled as such in the UI.
- Chart.js is MIT; Gothic A1 is licensed under the SIL Open Font License 1.1.

## License

MIT — see [LICENSE](LICENSE).
