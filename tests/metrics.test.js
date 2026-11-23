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

