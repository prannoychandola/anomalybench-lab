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


test("rolling MAD flags an extreme spike after a flat baseline",()=>{
  const scores=require("../src/detectors").rollingMad(Array(60).fill(5).map((x,i)=>i===59?1000:x));
  assert.ok(scores[59]>.99);
});

test("detectors reject malformed values and invalid configuration",()=>{
  const {rollingMad,adaptiveEwma,seasonalResidual}=require("../src/detectors");
  assert.throws(()=>rollingMad([1,NaN,2]),/finite numeric/);
  assert.throws(()=>rollingMad([1,2],{window:0}),/positive integer/);
  assert.throws(()=>adaptiveEwma([1,2],{alpha:0}),/alpha/);
  assert.throws(()=>seasonalResidual([1,2],{period:-1}),/positive integer/);
});
