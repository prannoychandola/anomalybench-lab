"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {PROFILES,locateWindows,evaluateSeries,scoreNabProfile,aggregateNab}=require("../src/metrics");

function records(n=100){return Array.from({length:n},(_,i)=>{const time=Date.UTC(2020,0,1,0,i);return{time,timestamp:new Date(time).toISOString(),value:0};});}
const rawWindow=[["2020-01-01T00:30:00.000Z","2020-01-01T00:39:00.000Z"]];

test("NAB windows align by timestamps and retain inclusive endpoints",()=>{
  const windows=locateWindows(records(),rawWindow);
  assert.deepEqual(windows.map(({start,end})=>[start,end]),[[30,39]]);
});

test("fixed-threshold scores distinguish null, timely, and missed detections",()=>{
  const rows=records(),scores=Array(rows.length).fill(0);
  const missed=evaluateSeries(rows,scores,rawWindow,.5);
  assert.equal(missed.eventRecall,0);
  assert.equal(missed.rawNabScores.standard,-1);
  scores[30]=.99;
  const timely=evaluateSeries(rows,scores,rawWindow,.5);
  assert.equal(timely.eventRecall,1);
  assert.equal(timely.meanDetectionDelayPoints,0);
  assert.ok(timely.rawNabScores.standard>0);
});

test("NAB normalization maps null to zero and perfect to one hundred",()=>{
  const nullScore=aggregateNab([{rawNabScores:{standard:-1},windowCount:1}],"standard");
  const perfectScore=aggregateNab([{rawNabScores:{standard:1},windowCount:1}],"standard");
  assert.equal(nullScore.normalized,0);
  assert.equal(perfectScore.normalized,100);
  assert.equal(PROFILES.standard.fpWeight,.11);
});

test("probation excludes early points from threshold scoring",()=>{
  const rows=records(),scores=Array(rows.length).fill(0); scores[0]=1;
  const sweep=scoreNabProfile(rows,scores,[],PROFILES.standard,.5);
  assert.equal(sweep.predictions[0],false);
});


test("multiple alert episodes inside one event match only one event alert",()=>{
  const rows=records(),scores=Array(rows.length).fill(0);
  scores[31]=.99;scores[36]=.99;
  const result=evaluateSeries(rows,scores,rawWindow,.5);
  assert.equal(result.eventRecall,1);
  assert.equal(result.alertEpisodes,2);
  assert.equal(result.matchedAlertEpisodes,1);
  assert.equal(result.falseAlertEpisodes,1);
  assert.equal(result.alertPrecision,.5);
});

test("irregular observations map label windows by timestamp",()=>{
  const rows=records().filter((_,i)=>i%3===0);
  const window=[["2020-01-01T00:30:00.000Z","2020-01-01T00:39:00.000Z"]];
  assert.deepEqual(locateWindows(rows,window).map(({start,end})=>[start,end]),[[10,13]]);
});

test("missing timestamps are excluded from point and alert metrics",()=>{
  const rows=records();rows[50].time=null;rows[50].timestamp=null;
  const scores=Array(rows.length).fill(0);scores[50]=1;
  const result=evaluateSeries(rows,scores,[],.5);
  assert.equal(result.fp,0);
  assert.equal(result.alertEpisodes,0);
});

test("windows entirely within probation are not counted as test detections",()=>{
  const rows=records(),scores=Array(rows.length).fill(0);scores[5]=1;
  const early=[["2020-01-01T00:05:00.000Z","2020-01-01T00:08:00.000Z"]];
  const result=evaluateSeries(rows,scores,early,.5);
  assert.equal(result.windowCount,0);
  assert.equal(result.eventRecall,null);
  assert.equal(result.detectedEvents,0);
});

test("malformed scores and thresholds fail clearly",()=>{
  const rows=records();
  assert.throws(()=>evaluateSeries(rows,[1],rawWindow,.5),/same length/);
  assert.throws(()=>evaluateSeries(rows,Array(rows.length).fill(NaN),rawWindow,.5),/finite values/);
  assert.throws(()=>evaluateSeries(rows,Array(rows.length).fill(0),rawWindow,2),/between 0 and 1/);
});
