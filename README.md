# 📈 AnomalyBench Lab

### A reproducible benchmark for streaming anomaly detection

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)
![Dependencies](https://img.shields.io/badge/Dependencies-None-2E7D32)
![Tests](https://img.shields.io/badge/Tests-Node%20Test%20Runner-4B8BBE)
![CI](https://github.com/prannoychandola/anomalybench-lab/actions/workflows/tests.yml/badge.svg)
![License](https://img.shields.io/badge/License-MIT-green)

**Compare online anomaly detectors on the [Numenta Anomaly Benchmark (NAB) v1.1](https://github.com/numenta/NAB), inspect held-out results, and explore individual time series in a local dashboard.**

🌐 **[Open the live dashboard](https://prannoychandola.github.io/anomalybench-lab/)** · **[View the source repository](https://github.com/prannoychandola/anomalybench-lab)**

> **Research note:** This project is a transparent baseline study, not a state-of-the-art claim or a production alerting system. The checked-in scores are specific to the documented split and scoring setup.

---

## 📖 Overview

An anomaly detector needs to do more than flag unusual points. It should detect labeled events while keeping false alarms manageable. AnomalyBench Lab compares three lightweight causal baselines using a reproducible development/test split.

Thresholds are selected using development series, then frozen before evaluation on held-out series. The report and dashboard expose the trade-offs at both benchmark and individual-series level.

## ✨ Features

- 📚 Bundles 58 timestamped NAB v1.1 series, labels, profiles, attribution, and the upstream license.
- 🤖 Compares rolling robust z-score, adaptive EWMA residual, and seasonal residual detectors.
- 🔀 Creates a deterministic, category-stratified development/test split.
- 🎚️ Selects one threshold per detector on development data and applies it unchanged to test data.
- 📊 Reports NAB-style scores, event recall, alert precision, detection delay, point-level precision/recall/F1, and false-alert frequency.
- 🖥️ Provides a local dashboard with benchmark summaries, category comparisons, and series-level signal and alert views.
- 🧪 Includes automated checks using Node.js's built-in test runner.
- 🔒 Runs locally without API keys, external services, or third-party packages.

## 🛠️ Technology Stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js 18+ |
| Language | JavaScript |
| Server | Node.js built-in HTTP module |
| Dashboard | HTML, CSS, and vanilla JavaScript |
| Data | NAB v1.1 time-series CSV files and JSON labels |
| Testing | Node.js built-in test runner |

## 🧭 Benchmark Workflow

```text
NAB time series + labeled windows
              │
              ▼
Category-stratified development / test split
              │
              ├── Development series → choose detector thresholds
              │
              ▼
         Freeze thresholds
              │
              ▼
Held-out test series → metrics and per-series results
              │
              ▼
      JSON report + dashboard
```

The detectors use only current and past observations when generating online predictions. Threshold tuning is kept separate from the held-out test evaluation.

## 📂 Project Structure

```text
AnomalyBench-Lab/
├── data/
│   ├── demo.csv
│   └── nab/                  # NAB series, labels, profiles, license, provenance
├── results/
│   └── nab-v1.1-report.json  # Held-out metrics and bootstrap intervals
├── scripts/
│   └── run_benchmark.js      # Reproduce the evaluation report
├── src/                      # CSV parsing, detectors, split, metrics
├── tests/                    # Automated checks
├── .github/workflows/tests.yml # Node 18/20/22 tests and full report validation
├── web/                      # Interactive dashboard
├── server.js
├── start.bat
├── Synthetic-Demo.html       # Standalone synthetic illustration
└── README.md
```

## 🚀 Run Locally

Install Node.js 18 or newer. The project has no npm dependencies.

**Windows:** double-click `start.bat`. It starts the local server and opens the dashboard at [http://127.0.0.1:8000](http://127.0.0.1:8000). Keep the terminal window open while using the dashboard.

**Any platform:** from the project folder, run:

```bash
node server.js
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000). Stop the server with `Ctrl+C`.

## 🧪 Reproduce and Test

Run the automated checks and regenerate the held-out report:

```bash
npm test
npm run benchmark
```

GitHub Actions runs the test suite on Node.js 18, 20, and 22, regenerates the report, and validates its schema, counts, and confidence intervals.

The benchmark processes the bundled NAB data locally and writes `results/nab-v1.1-report.json`.

## 📊 Held-Out Results

This pinned NAB v1.1 run selects thresholds using 15 development series and evaluates 43 held-out series. It covers 365,558 observations and 116 labeled/scorable windows: 36 development and 80 test windows. Test data is used only for evaluation.

| Detector | Threshold | NAB standard (95% CI) | Event recall (95% CI) | Point F1 (95% CI) | False alert episodes / 1k clean points |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rolling robust z-score | 0.995 | -195.11 (-365.608–-76.812) | 56.3% (43.2–69.6%) | 0.0450 (0.026–0.068) | 9.2 |
| Adaptive EWMA residual | 0.950 | 23.51 (10.139–36.099) | 51.2% (36.0–67.1%) | 0.0046 (0.003–0.006) | 1.6 |
| Seasonal residual (lag 48) | 0.995 | -206.81 (-390.070–-67.799) | 51.2% (37.2–65.0%) | 0.0445 (0.024–0.067) | 6.7 |

Adaptive EWMA has the highest NAB standard score on this held-out split. Point-level F1 is much lower than event recall because one alert can count as detecting a long event window, while point-level recall counts the many remaining labeled observations as missed. Rolling robust z-score and seasonal residual find slightly more events but create many more separate alerts. Alert episodes are matched one-to-one to labeled events; repeated alerts inside one event are not all counted as successful matches.

### Category results — Adaptive EWMA

| NAB category | Held-out series | NAB standard | Event recall | Point F1 | False alert episodes / 1k clean points |
| --- | ---: | ---: | ---: | ---: | ---: |
| artificialNoAnomaly | 4 | — | — | 0.0000 | 2.63 |
| artificialWithAnomaly | 5 | -3.8 | 80.0% | 0.0048 | 5.09 |
| realAWSCloudwatch | 12 | 13.1 | 50.0% | 0.0059 | 2.99 |
| realAdExchange | 5 | 44.4 | 50.0% | 0.0124 | 0.67 |
| realKnownCause | 5 | 11.8 | 16.7% | 0.0008 | 0.15 |
| realTraffic | 5 | 17.6 | 20.0% | 0.0037 | 0.25 |
| realTweets | 7 | 46.7 | 78.3% | 0.0052 | 1.25 |

The table shows between-category variation for one detector; all three detectors' category metrics are in the JSON report. The 95% intervals are deterministic series-level percentile bootstrap intervals (1,000 resamples). Normalized scores use corpus-local null/perfect baselines and are **not directly comparable** with NAB leaderboard results, which use a different threshold protocol. This is a held-out split of NAB v1.1, not new-domain validation or a state-of-the-art claim. Full thresholds, per-series and category outputs, and provenance are in [`results/nab-v1.1-report.json`](results/nab-v1.1-report.json).

## 🔬 Evaluation Notes

- **Split:** Within each NAB category, files are ordered by the SHA-256 hash of their relative paths. The first 30% are used for development; the rest are held out for testing.
- **Thresholds:** Each detector's global threshold is selected from a documented candidate list using development data only, then frozen for testing.
- **Probation:** The first 15% of each series, up to 750 observations, is excluded from scoring.
- **Point metrics:** Observations inside labeled windows count as positive. Broad windows can make point-level F1 tell a different story from event-based metrics.
- **Stream order:** Original row order is preserved for online predictions, including timestamp reversals in the source data.

## ⚠️ Limitations

These are simple statistical baselines, not deep-learning models. The held-out evaluation measures generalization to unseen series from the same benchmark, not transfer to a new domain. NAB labels and scoring windows encode benchmark-specific assumptions. The dashboard is for research and demonstration, not production alerting.

## 📚 Citation and Data License

See [CITATION.md](CITATION.md) and [data/nab/SOURCE.txt](data/nab/SOURCE.txt) for the upstream revision, attribution, and paper citation. The upstream NAB license is preserved in [data/nab/LICENSE.txt](data/nab/LICENSE.txt). Project code is MIT licensed; see [LICENSE](LICENSE).


