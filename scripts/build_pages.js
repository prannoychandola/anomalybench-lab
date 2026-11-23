"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseSeriesCsv } = require("../src/csv");
const { DETECTORS } = require("../src/detectors");
const { evaluateSeries, locateWindows } = require("../src/metrics");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data", "nab");
const OUTPUT = path.join(ROOT, "_site");
const REPORT = JSON.parse(fs.readFileSync(path.join(ROOT, "results", "nab-v1.1-report.json"), "utf8"));
const LABELS = JSON.parse(fs.readFileSync(path.join(DATA, "combined_windows.json"), "utf8"));

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function buildSeries(entry) {
  let records;
  try {
    records = parseSeriesCsv(fs.readFileSync(path.join(DATA, entry.file), "utf8"));
  } catch (error) {
    throw new Error(`${entry.file}: ${error.message}`);
  }
  const rawWindows = LABELS[entry.file] || [];
  const models = {};
  for (const [name, detect] of Object.entries(DETECTORS)) {
    const scores = detect(records.map(row => row.value));
    const threshold = REPORT.detectors[name].threshold;
    const metrics = evaluateSeries(records, scores, rawWindows, threshold);
    models[name] = {
      threshold,
      scores,
      predictions: metrics.prediction,
      metrics: {
        nab: metrics.rawNabScores.standard,
        precision: metrics.precision,
        recall: metrics.recall,
        f1: metrics.f1,
        eventRecall: metrics.eventRecall,
        detectedEvents: metrics.detectedEvents,
        windowCount: metrics.windowCount,
        meanDetectionDelayPoints: metrics.meanDetectionDelayPoints,
        falseAlertEpisodes: metrics.falseAlertEpisodes,
        alertEpisodes: metrics.alertEpisodes,
        alertPrecision: metrics.alertPrecision,
      },
    };
  }
  return {
    file: entry.file,
    category: entry.category,
    split: entry.split,
    records: records.map(row => ({ timestamp: row.timestamp, time: row.time, value: row.value })),
    windows: locateWindows(records, rawWindows).map(({ start, end }) => [start, end]),
    models,
  };
}

function run() {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, "web"), OUTPUT, { recursive: true });
  const dataDir = path.join(OUTPUT, "data");
  const publicReport = {
    dataset: {
      name: REPORT.dataset.name,
      version: REPORT.dataset.version,
      seriesCount: REPORT.dataset.seriesCount,
      observations: REPORT.dataset.observations,
      scorableWindows: REPORT.dataset.scorableWindows,
    },
    methodology: REPORT.methodology,
    development: REPORT.development,
    test: REPORT.test,
    testCategories: REPORT.testCategories,
    detectors: REPORT.detectors,
    series: REPORT.series.map(({ file, category, split, rows, scorableWindows }) => ({ file, category, split, rows, scorableWindows })),
  };
  writeJson(path.join(dataDir, "report.json"), publicReport);
  const testSeries = REPORT.series.filter(item => item.split === "test");
  for (const entry of testSeries) {
    writeJson(path.join(dataDir, "series", `${entry.file}.json`), buildSeries(entry));
  }
  console.log(`Built ${path.relative(ROOT, OUTPUT)} with the dashboard, report, and ${testSeries.length} held-out series.`);
}

try { run(); }
catch (error) { console.error(error.stack || error); process.exitCode = 1; }

