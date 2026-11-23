# AnomalyBench Lab

**A reproducible, held-out comparison of online anomaly detectors on the Numenta Anomaly Benchmark (NAB) v1.1.** Inspect 58 timestamped series, three causal baselines, threshold selection, NAB-style timing scores, and per-series alert behavior in a local dashboard.

## Why this project

Anomaly detection is not only about finding unusual points. A useful detector should catch labeled events early without overwhelming an operator with false alarms. This project makes those tradeoffs visible and keeps threshold selection separate from final evaluation.

## Current held-out result

The checked-in report evaluates 43 held-out series (365,558 observations total in the full NAB corpus; 15 development series used for threshold selection). Each detector gets one threshold selected on development files, then that threshold is frozen for test files.

| Detector | Test threshold | NAB standard* | Event recall | Point F1 | False alert episodes / 1k clean points |
|---|---:|---:|---:|---:|---:|
| Rolling robust z-score | 0.995 | -182.88 | 56.3% | 0.044 | 8.1 |
| Adaptive EWMA residual | 0.950 | 23.51 | 51.2% | 0.005 | 1.5 |
| Seasonal residual (lag 48) | 0.995 | -199.06 | 51.2% | 0.043 | 5.6 |
| No-alert null baseline | — | 0.00 | 0.0% | 0.000 | 0.0 |

The EWMA baseline had the best NAB standard score on this split, while the other baselines detected a slightly larger share of labeled windows at a much higher false-alert rate. Negative NAB scores mean the weighted false-alarm cost exceeded the reward for detections. These results are a transparent baseline study, not a claim of state-of-the-art performance.

`results/nab-v1.1-report.json` contains per-series results, category breakdowns, development threshold curves, run metadata, and exact data provenance.

## Features

- Full NAB v1.1 time-series corpus and combined anomaly windows, pinned to an upstream commit and accompanied by its license and source notes.
- Three causal baselines: rolling robust z-score, adaptive EWMA residual, and seasonal residual.
- Deterministic category-stratified development/test split using SHA-256 file ordering.
- One global detector threshold selected on development files only and applied unchanged to held-out files.
- NAB standard, low-false-positive, and low-false-negative profiles; event recall; alert precision; detection delay; point-level precision/recall/F1; and false-alert frequency.
- Local interactive dashboard with benchmark summary, category comparison, and series-level signal/alert visualization.
- Dependency-free Node.js implementation and automated checks using Node's built-in test runner.

## Run it

Install Node.js 18 or newer. No npm packages are needed.

**Windows:** double-click `start.bat`. It opens the dashboard at `http://127.0.0.1:8000` and starts the local server. Keep the terminal window open while using the dashboard; close it to stop the server.

**Terminal:** from this folder, run:

```bash
node scripts/run_benchmark.js
node server.js
```

Then open `http://127.0.0.1:8000`. `Synthetic-Demo.html` is a separate offline illustration only; use the dashboard for NAB results.

## Reproduce and check

```bash
node --test
node scripts/run_benchmark.js
```

The benchmark command regenerates `results/nab-v1.1-report.json`. It processes the bundled NAB corpus locally and needs no downloads or external services.

## Evaluation details

- **Split:** files are grouped by NAB category, ordered by SHA-256 of their relative path, and the first 30% in each group are used for development. The remaining files form the held-out test set.
- **Threshold selection:** each model's single global threshold is chosen from the documented candidate list by maximizing its NAB standard-profile score on development files only. The threshold is then frozen for the test set.
- **NAB-style scoring:** the project implements the NAB time-window reward/penalty formulation and profile weights in JavaScript. It does not vendor or call NAB's Python scorer. Normalization uses null and perfect baselines on this test split. These values are not directly comparable to NAB scoreboard entries, which use a different threshold optimization protocol.
- **Probation:** the first 15% of each series, capped at the benchmark's 750-observation limit, is excluded from scoring.
- **Point-level metrics:** observations within NAB's labeled windows count as positive. Because these windows can be broad, point F1 may tell a different story from NAB's time-aware score.
- **Stream order:** source row order is preserved for online predictions, including source timestamp reversals. This is recorded in the result report.

## Limitations

These are simple statistical baselines, not deep-learning models. Threshold selection uses labeled development files, so the result measures generalization to held-out series from the same benchmark rather than transfer to a new domain. NAB's labels and its scoring windows encode benchmark-specific assumptions. The dashboard is for research and demonstration, not production alerting.

## Citation and data license

See [CITATION.md](CITATION.md) and [data/nab/SOURCE.txt](data/nab/SOURCE.txt) for the pinned source revision, attribution, and citation. The upstream NAB license is preserved at [data/nab/LICENSE.txt](data/nab/LICENSE.txt). The project code is MIT licensed; see [LICENSE](LICENSE).

## Project layout

```text
AnomalyBench-Lab/
├── data/
│   ├── demo.csv
│   └── nab/                 # NAB v1.1 data, labels, profiles, source license
├── results/
│   └── nab-v1.1-report.json # Reproducible held-out report
├── scripts/run_benchmark.js
├── src/                     # CSV parsing, causal detectors, metrics
├── tests/
├── web/                     # Dashboard
├── server.js
├── start.bat
└── README.md
```

