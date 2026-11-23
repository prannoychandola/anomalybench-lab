"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {DETECTORS}=require("../src/detectors");

test("all detector scores stay finite and in the documented range",()=>{
  const values=Array.from({length:180},(_,i)=>10+Math.sin(i/7)*.4+(i===120?12:0));
  for(const [name,detect] of Object.entries(DETECTORS)){
    const scores=detect(values);
    assert.equal(scores.length,values.length,name);
    assert.ok(scores.every(x=>Number.isFinite(x)&&x>=0&&x<=1),name);
  }
});

test("detectors are causal: future values cannot change earlier scores",()=>{
  const values=Array.from({length:160},(_,i)=>25+Math.sin(i/5));
  const changed=values.slice(); changed[130]=1e5;
  for(const [name,detect] of Object.entries(DETECTORS)){
    assert.deepEqual(detect(values).slice(0,130),detect(changed).slice(0,130),name);
  }
});

