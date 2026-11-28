"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const crypto = require("node:crypto");
const { parseSeriesCsv } = require("../src/csv");
const { DETECTORS } = require("../src/detectors");
const { PROFILES, locateWindows, evaluateSeries, scoreNabProfile, aggregateNab } = require("../src/metrics");
const { assignDevelopmentFiles } = require("../src/split");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data", "nab");
const OUTPUT = path.join(ROOT, "results", "nab-v1.1-report.json");
const CANDIDATE_THRESHOLDS = [0.5, 0.65, 0.75, 0.85, 0.9, 0.925, 0.95, 0.975, 0.99, 0.995];
const DEVELOPMENT_FRACTION = 0.3;

function listCsv(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listCsv(full, base);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".csv")
      ? [path.relative(base, full).split(path.sep).join("/")] : [];
  }).sort();
}

function chooseThreshold(devFiles, modelName) {
  const curve = CANDIDATE_THRESHOLDS.map(threshold => ({
    threshold,
    raw: devFiles.reduce((sum, item) => sum + scoreNabProfile(item.records, item.scores[modelName], item.locatedWindows, PROFILES.standard, threshold).raw, 0),
  }));
  curve.sort((a, b) => b.raw - a.raw || b.threshold - a.threshold);
  return { threshold:curve[0].threshold, developmentCurve:curve.sort((a,b)=>a.threshold-b.threshold) };
}

function aggregateDetector(items, modelName) {
  const perFile = items.map(x => x.detectors[modelName]);
  const sum = key => perFile.reduce((total, x) => total + (Number.isFinite(x[key]) ? x[key] : 0), 0);
  const tp=sum("tp"), fp=sum("fp"), fn=sum("fn"), tn=sum("tn");
  const precision=tp/(tp+fp)||0, recall=tp/(tp+fn)||0, events=sum("windowCount"), detected=sum("detectedEvents");
  const alertEpisodes=sum("alertEpisodes"), matched=sum("matchedAlertEpisodes"), delayTotal=perFile.reduce((s,x)=>s+(x.meanDetectionDelayPoints==null?0:x.meanDetectionDelayPoints*x.detectedEvents),0);
  const rows=items.reduce((s,x)=>s+x.rows,0), runtime=sum("runtimeMs");
  return {
    nab:Object.fromEntries(Object.keys(PROFILES).map(profile=>[profile,aggregateNab(perFile.map(x=>({rawNabScores:x.rawNabScores,windowCount:x.windowCount})),profile)])),
    point:{precision,recall,f1:2*precision*recall/(precision+recall)||0,tp,fp,fn,tn},
    events:{total:events,detected,recall:events?detected/events:null,meanDelayPoints:detected?delayTotal/detected:null,alertEpisodes,matchedAlertEpisodes:matched,alertPrecision:alertEpisodes?matched/alertEpisodes:null,falseAlertsPer1000CleanPoints:sum("falseAlertEpisodes")/Math.max(tn+fp,1)*1000},
    runtime:{milliseconds:runtime,observations:rows,observationsPerSecond:rows/(runtime/1000||1)},
    files:items.length,
  };
}

function bootstrapIntervals(items, modelName, iterations = 1000) {
  if (items.length < 2) return null;
  const seed = crypto.createHash("sha256").update(`${modelName}|${items.map(x => x.file).sort().join("|")}`).digest().readUInt32LE(0);
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const samples = { nabStandard: [], eventRecall: [], pointF1: [], falseAlertsPer1000CleanPoints: [] };
  for (let replicate = 0; replicate < iterations; replicate++) {
    const resampled = Array.from({length:items.length}, () => items[Math.floor(random() * items.length)]);
    const result = aggregateDetector(resampled, modelName);
    samples.nabStandard.push(result.nab.standard.normalized);
    samples.eventRecall.push(result.events.recall);
    samples.pointF1.push(result.point.f1);
    samples.falseAlertsPer1000CleanPoints.push(result.events.falseAlertsPer1000CleanPoints);
  }
  const intervals = {};
  for (const [metric, values] of Object.entries(samples)) {
    const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
    const at = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    intervals[metric] = sorted.length ? { lower95:at(0.025), upper95:at(0.975) } : null;
  }
  return { method:"series-level percentile bootstrap", replicates:iterations, intervals };
}

function summarize(items, modelNames) {
  const detectorSummary={};
  for (const name of modelNames) {
    detectorSummary[name]=aggregateDetector(items,name);
    detectorSummary[name].confidenceIntervals=bootstrapIntervals(items,name);
  }
  return {
    files:items.length,
    observations:items.reduce((s,x)=>s+x.rows,0),
    windows:items.reduce((s,x)=>s+x.labeledWindows,0),
    detectors:detectorSummary,
  };
}

function run() {
  const labels = JSON.parse(fs.readFileSync(path.join(DATA,"combined_windows.json"),"utf8"));
  const filenames = listCsv(DATA);
  const noLabels=filenames.filter(name=>!(name in labels)), noData=Object.keys(labels).filter(name=>!fs.existsSync(path.join(DATA,name)));
  if(noLabels.length||noData.length) throw new Error(`Dataset/label mismatch. No labels: ${noLabels.join(", ")}; no data: ${noData.join(", ")}`);

  const items=[];
  for(const file of filenames){
    let records; try { records=parseSeriesCsv(fs.readFileSync(path.join(DATA,file),"utf8")); } catch (error) { throw new Error(`Failed to parse ${file}: ${error.message}`); }
    const values=records.map(x=>x.value), category=file.split("/")[0];
    const windows=locateWindows(records,labels[file]||[]);
    const scores={}, runtimeMs={};
    for(const [name,detect] of Object.entries(DETECTORS)){
      const started=performance.now(); scores[name]=detect(values); runtimeMs[name]=performance.now()-started;
    }
    items.push({file,category,rows:records.length,labeledWindows:(labels[file]||[]).length,scorableWindows:windows.length,nonMonotonicTransitions:records.slice(1).filter((r,i)=>Number.isFinite(r.time)&&Number.isFinite(records[i].time)&&r.time<records[i].time).length,records,locatedWindows:windows,scores,runtimeMs});
  }
  assignDevelopmentFiles(items);
  const modelNames=Object.keys(DETECTORS), selections={};
  for(const name of modelNames) selections[name]=chooseThreshold(items.filter(x=>x.split==="development"),name);

  const publicRows=items.map(item=>{
    const detectors={};
    for(const name of modelNames){
      const m=evaluateSeries(item.records,item.scores[name],labels[item.file]||[],selections[name].threshold);
      detectors[name]={threshold:m.threshold,rawNabScores:m.rawNabScores,windowCount:m.windowCount,detectedEvents:m.detectedEvents,meanDetectionDelayPoints:m.meanDetectionDelayPoints,alertEpisodes:m.alertEpisodes,matchedAlertEpisodes:m.matchedAlertEpisodes,falseAlertEpisodes:m.falseAlertEpisodes,tp:m.tp,fp:m.fp,fn:m.fn,tn:m.tn,runtimeMs:item.runtimeMs[name]};
    }
    return {file:item.file,category:item.category,split:item.split,rows:item.rows,labeledWindows:item.labeledWindows,scorableWindows:item.scorableWindows,nonMonotonicTransitions:item.nonMonotonicTransitions,detectors};
  });
  const modelSelections=Object.fromEntries(modelNames.map(name=>[name,{threshold:selections[name].threshold,developmentCurve:selections[name].developmentCurve}]));
  const testRows=publicRows.filter(x=>x.split==="test"), devRows=publicRows.filter(x=>x.split==="development");
  const modelNamesForSummary=modelNames;
  const developmentSummary=summarize(devRows,modelNamesForSummary), testSummary=summarize(testRows,modelNamesForSummary);
  const testCategories={};
  for(const category of [...new Set(testRows.map(x=>x.category))].sort()) testCategories[category]=summarize(testRows.filter(x=>x.category===category),modelNames);
  const commit=fs.readFileSync(path.join(DATA,"SOURCE.txt"),"utf8").match(/revision ([0-9a-f]{40})/i)?.[1]||"unknown";
  const result={
    project:"AnomalyBench Lab",schemaVersion:3,generatedAt:new Date().toISOString(),
    dataset:{name:"Numenta Anomaly Benchmark",version:"v1.1",revision:commit,seriesCount:publicRows.length,observations:publicRows.reduce((s,x)=>s+x.rows,0),labeledWindows:publicRows.reduce((s,x)=>s+x.labeledWindows,0),scorableWindows:publicRows.reduce((s,x)=>s+x.scorableWindows,0),source:"https://github.com/numenta/NAB",license:"MIT; see data/nab/LICENSE.txt"},
    methodology:{split:`Deterministic ${Math.round(DEVELOPMENT_FRACTION*100)}% development / ${Math.round((1-DEVELOPMENT_FRACTION)*100)}% held-out test split, stratified by NAB data category using SHA-256 file ordering.`,thresholdSelection:"One global threshold per detector selected by maximizing the NAB standard-profile score on development files only; applied unchanged to held-out files.",thresholds:modelSelections,thresholdCandidates:CANDIDATE_THRESHOLDS,scoreTransform:"1 - exp(-z / 5)",probationaryFraction:0.15,labelsUsedForFinalTestSelection:false,sourceRowOrderPreserved:true,nonMonotonicTransitions:publicRows.reduce((s,x)=>s+x.nonMonotonicTransitions,0),nabProfiles:Object.keys(PROFILES),confidenceIntervals:"95% percentile cluster bootstrap over held-out series, 1,000 deterministic replicates; intervals summarize between-series variation.",scoreCaveat:"Uses the NAB time-window scoring formulation and corpus-local null/perfect normalization. Scores are not leaderboard results; NAB leaderboard protocols optimize thresholds over their full corpus."},
    development:developmentSummary,test:testSummary,testCategories,
    detectors:Object.fromEntries(modelNames.map(name=>[name,{threshold:selections[name].threshold,test:testSummary.detectors[name]}])),
    series:publicRows,
  };
  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true}); fs.writeFileSync(OUTPUT,JSON.stringify(result,null,2)+"\n");
  console.log(`Wrote ${path.relative(ROOT,OUTPUT)} (${publicRows.length} series; ${result.dataset.observations.toLocaleString()} observations; ${testSummary.files} held out).`);
  for(const name of modelNames){const x=testSummary.detectors[name];console.log(`${name} (threshold ${selections[name].threshold}): NAB standard ${x.nab.standard.normalized.toFixed(2)}, F1 ${x.point.f1.toFixed(3)}, event recall ${(x.events.recall*100).toFixed(1)}%, false alerts ${x.events.falseAlertsPer1000CleanPoints.toFixed(1)}/1k`);}
}

try{run();}catch(error){console.error(error.stack||error);process.exitCode=1;}

