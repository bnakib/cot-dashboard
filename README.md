# COT Dashboard

A personal, open-source dashboard for official CFTC **Legacy Futures Only** positioning, starting January 2023. Hosted entirely on GitHub Pages and updated by GitHub Actions. No Azure account, price subscription, API key, database server, or paid frontend dependency is required.

**Dashboard:** https://bnakib.github.io/cot-dashboard/

## First-time publishing

1. Open **Settings → Pages** in this repository: https://github.com/bnakib/cot-dashboard/settings/pages
2. Under **Build and deployment → Source**, select **GitHub Actions**. There is no need to choose a template or create another workflow.
3. Open **Actions → Update COT data and deploy → Run workflow**, leaving branch `main` selected.
4. Wait for the `update` and `deploy` jobs to finish. The first run downloads the complete history from 2023; later runs detect changes and corrections.
5. Open the dashboard link above.

The first code push also starts a download automatically. If its deployment fails because Pages is not enabled yet, complete steps 1–3. The data download is saved independently before deployment.

If a write step is rejected by repository policy, verify **Settings → Actions → General → Workflow permissions** permits this workflow's requested `contents: write`. The workflow declares its permissions explicitly. No personal access token is required.

## What you can do

- Search and select any available CFTC contract market; filter by sector.
- See net positioning for large speculators, small speculators, and commercials.
- Compare changes in net positions, longs, and shorts between reports.
- Toggle charts between contracts and percentage of open interest.
- Explore 3-month, 6-month, 1-year, or all available history since 2023.
- Select a historical report, hover charts for values, or click a chart date.
- Download a market's complete history as CSV.
- Include older/inactive markets by disabling **Latest-report markets only**.

The remembered market selection is stored only in your browser. There are no logins, analytics, external chart scripts, cookies, or price feeds. The site and repository are public.

## Data source and methodology

Primary source: [CFTC Legacy Futures Only public reporting dataset](https://publicreporting.cftc.gov/d/6dca-aqww), dataset ID `6dca-aqww`, using its public SODA endpoint. If retrieval or validation fails, the importer tries the official [annual Legacy Futures Only archives](https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm).

Only position dates on or after **2023-01-01** are included. A new market may have a later start date. Every update reconciles the complete bounded history to capture historical corrections. Raw CFTC counts are retained in per-market JSON; net and prior-report changes are derived from those counts. No futures/options-combined or Disaggregated data are mixed into this report.

| Dashboard label | Official Legacy category |
| --- | --- |
| Large speculators | Non-commercial |
| Small speculators | Non-reportable |
| Commercials | Commercial |

These conventional labels are approximations. Non-reportable positions are not an exact retail-trader classification, and commercial positions are not necessarily a simple directional forecast. Sector labels are convenience classifications inferred from market names. Market identities use CFTC contract-market codes, preserving leading zeroes; different exchanges/contracts are not combined.

- **Net position:** long minus short, in contracts.
- **Net change:** this report's net minus the previous available report's net.
- **Net % of open interest:** net / current open interest × 100.
- **Chart change in percentage mode:** this report's net % minus the previous report's net %, measured in **percentage points**. This incorporates changing open interest; it is not contract change / current open interest.
- **Long/short breakdown:** always raw contracts, regardless of chart unit selection.
- **Spreading:** non-commercial balanced spreading exposure, kept separately. It contributes to both long and short open-interest reconciliation, but cancels out of net exposure.

Dates on charts are **position dates**, usually Tuesday. CFTC reports are normally published Friday at 3:30 p.m. Eastern, with holiday exceptions and occasional delays. The dashboard does not invent publication timestamps or imply positions were known on Tuesday. It is not a point-in-time backtesting dataset: historical values can reflect later revisions.

Changes compare consecutive available observations. When the interval is not seven days, the interface explicitly reports the gap. Charts leave missing observation weeks disconnected; no observations are interpolated into the source data. The first observation has no weekly change. Net exposure percentage is unavailable if open interest is zero.

## Updates and reliability

The `Update COT data and deploy` workflow runs:

- Friday at **3:47 p.m. and 5:47 p.m. America/New_York**.
- Every day at **8:17 p.m. America/New_York** to catch holiday releases or corrections.
- On pushes to `main` and on manual runs.

Timezone-aware schedules handle daylight saving changes. GitHub schedules are best effort and can be delayed. Public-repository schedules can be disabled after 60 days without repository activity; inspect the Actions tab if updates stop. Changed weekly data generate commits, but an extended publication pause could still require re-enabling the schedule.

The importer validates integer counts, duplicate identities, net balance, and long/short reconciliation to open interest. Ordinary markets must reconcile exactly. For consolidated market codes ending in `+`, it allows at most **3 contracts** in each long-total/open-interest difference, short-total/open-interest difference, and net balance. This fixed bound never grows with open interest; larger discrepancies are rejected. Official open interest, spreading, long, and short counts are preserved, and net positions remain long minus short. Accepted nonzero discrepancies are flagged as signed `roundingDifferences` in each JSON observation, counted in the index's `roundingRecordCount` and import log, shown for the selected report on the dashboard, and included in CSV exports. Differences mean long/short total (including spreading) minus open interest, and summed category net positions.

A materially shrinking history or regressing latest report is rejected. Requests use bounded retries and pauses between pages. Failed retrieval/validation stops deployment and preserves the last published site. Unchanged data do not create redundant commits.

The status indicator flags the overall latest position date when older than ten days. This is an age indicator, not a holiday-aware assertion that a report was missed. Each market also shows if its latest observation is older than the dataset's newest report. `Data updated` means the last changed dataset, not the time of the last unchanged source check.

## Run locally

Requires Python 3.12+; Node 24 is used for JavaScript tests. There are **no Python packages or npm packages to install**.

```bash
python scripts/update_data.py
python -m unittest discover -s tests -v
node --test tests/chart.test.mjs
python -m http.server 8000 --directory site
```

Then visit http://localhost:8000. A server is needed because browsers restrict JSON loading from `file://` URLs.

To exercise ingestion offline with your own API-shaped fixture:

```bash
python scripts/update_data.py --input /path/to/fixture.json --output /tmp/cot-data
```

Synthetic test fixtures are used only in tests and are never published as real positions. Until the first successful CFTC import, the site shows setup instructions rather than sample charts.

## Project layout

- `site/`: buildless HTML, CSS, JavaScript, SVG favicon, and market JSON.
- `scripts/update_data.py`: standard-library ingestion, validation, and static publishing.
- `tests/`: Python pipeline tests and Node chart/CSV calculation tests.
- `.github/workflows/update-and-deploy.yml`: download, validate, commit changed data, and deploy.
- `.github/workflows/tests.yml`: checks for pull requests without external source calls.

No cloud storage or persistent runtime is used. Data files are versioned in Git. The website loads only the selected market's history.

## License

The source code is licensed under [MIT](LICENSE). COT data are sourced from the CFTC; the code license does not purport to relicense government data. This is an independent project, not affiliated with or endorsed by the CFTC.
