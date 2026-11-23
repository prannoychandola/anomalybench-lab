"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { parseSeriesCsv } = require("./src/csv");
const { DETECTORS } = require("./src/detectors");
const { evaluateSeries, locateWindows } = require("./src/metrics");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data", "nab");
const REPORT_PATH = path.join(ROOT, "results", "nab-v1.1-report.json");
const STATIC = {
  "/": ["web/index.html", "text/html; charset=utf-8"],
  "/index.html": ["web/index.html", "text/html; charset=utf-8"],
  "/app.js": ["web/app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["web/style.css", "text/css; charset=utf-8"],
};

function loadReport() {
  try { return JSON.parse(fs.readFileSync(REPORT_PATH, "utf8")); }
  catch { return null; }
}

function send(res, status, type, body) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": data.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    "Referrer-Policy": "no-referrer",
  });
  res.end(data);
}

function json(res, status, body) { send(res, status, "application/json; charset=utf-8", JSON.stringify(body)); }

const server = http.createServer((req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "Only GET requests are supported." });
  const url = new URL(req.url, "http://127.0.0.1");
  const report = loadReport();

  if (url.pathname === "/api/report") {
    if (!report) return json(res, 503, { error: "Benchmark report is missing. Run node scripts/run_benchmark.js first." });
    return json(res, 200, {
      dataset: report.dataset, methodology: report.methodology,
      development: report.development, test: report.test,
      testCategories: report.testCategories, detectors: report.detectors,
      series: report.series.map(({file,category,split,rows,scorableWindows})=>({file,category,split,rows,scorableWindows})),
    });
  }

  if (url.pathname === "/api/series") {
    if (!report) return json(res, 503, { error: "Benchmark report is missing. Run node scripts/run_benchmark.js first." });
    const file = url.searchParams.get("file");
    const entry = report.series.find(x => x.file === file);
    if (!entry || !file || file.includes("..") || path.isAbsolute(file)) return json(res, 404, { error: "Unknown benchmark series." });
    try {
      const records = parseSeriesCsv(fs.readFileSync(path.join(DATA,file),"utf8"));
      const rawWindows = JSON.parse(fs.readFileSync(path.join(DATA,"combined_windows.json"),"utf8"))[file] || [];
      const models = {};
      for (const [name,detect] of Object.entries(DETECTORS)) {
        const scores = detect(records.map(r=>r.value));
        const threshold = report.detectors[name].threshold;
        const metrics = evaluateSeries(records,scores,rawWindows,threshold);
        models[name] = { threshold, scores, predictions:metrics.prediction, metrics:{nab:metrics.rawNabScores.standard,precision:metrics.precision,recall:metrics.recall,f1:metrics.f1,eventRecall:metrics.eventRecall,detectedEvents:metrics.detectedEvents,windowCount:metrics.windowCount,meanDetectionDelayPoints:metrics.meanDetectionDelayPoints,falseAlertEpisodes:metrics.falseAlertEpisodes,alertEpisodes:metrics.alertEpisodes,alertPrecision:metrics.alertPrecision} };
      }
      const windows = locateWindows(records,rawWindows).map(({start,end})=>[start,end]);
      return json(res,200,{file,category:entry.category,split:entry.split,records:records.map(r=>({timestamp:r.timestamp,time:r.time,value:r.value})),windows,models});
    } catch (error) { return json(res,500,{error:`Could not load series: ${error.message}`}); }
  }

  const asset = STATIC[url.pathname];
  if (!asset) return send(res,404,"text/plain; charset=utf-8","Not found");
  fs.readFile(path.join(ROOT,asset[0]),(error,data)=>{
    if (error) return send(res,500,"text/plain; charset=utf-8","Could not read project file.");
    send(res,200,asset[1],data);
  });
});

const port = Number(process.env.PORT || 8000);
server.listen(port,"127.0.0.1",()=>console.log(`AnomalyBench Lab running at http://127.0.0.1:${port}`));
