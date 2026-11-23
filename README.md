# 📈 AnomalyBench Lab

### A reproducible benchmark for streaming anomaly detection

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)
![Dependencies](https://img.shields.io/badge/Dependencies-None-2E7D32)
![Tests](https://img.shields.io/badge/Tests-Node%20Test%20Runner-4B8BBE)
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
│   └── nab-v1.1-report.json  # Checked-in benchmark output
├── scripts/
│   └── run_benchmark.js      # Reproduce the evaluation report
├── src/                      # CSV parsing, detectors, split, metrics
├── tests/                    # Automated checks
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

Run the automated checks:

```bash
node --test
```

Regenerate the benchmark report:

```bash
node scripts/run_benchmark.js
```

The benchmark processes the bundled NAB data locally and writes `results/nab-v1.1-report.json`.

## 📊 Held-Out Results

The checked-in run uses 15 development series to select thresholds and evaluates 43 held-out series. The corpus contains 365,558 observations.

| Detector | Test threshold | NAB standard* | Event recall | Point F1 | False alert episodes / 1k clean points |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rolling robust z-score | 0.995 | -182.88 | 56.3% | 0.044 | 8.1 |
| Adaptive EWMA residual | 0.950 | 23.51 | 51.2% | 0.005 | 1.5 |
| Seasonal residual (lag 48) | 0.995 | -199.06 | 51.2% | 0.043 | 5.6 |
| No-alert null baseline | — | 0.00 | 0.0% | 0.000 | 0.0 |

The EWMA baseline achieved the best NAB standard score in this split. The other detectors found a slightly larger share of labeled windows but produced more false alerts. Negative NAB scores mean the weighted false-alarm cost exceeded the reward for detections.

*The project implements NAB-style time-window scoring locally. Its normalized values use null and perfect baselines on this test split and are **not directly comparable** to NAB leaderboard results, which use a different threshold optimization protocol.

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


