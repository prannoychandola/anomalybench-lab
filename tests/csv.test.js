"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {parseCsvLine,parseSeriesCsv}=require("../src/csv");

test("CSV parser handles quoted fields and escaped quotes",()=>{
  assert.deepEqual(parseCsvLine('"2024-01-01 00:00:00","3.5","note: ""ok"""'),["2024-01-01 00:00:00","3.5",'note: "ok"']);
});

test("series parser preserves source order for online evaluation",()=>{
  const rows=parseSeriesCsv("timestamp,value\n2024-01-02 00:00:00,2\n2024-01-01 00:00:00,1\n");
  assert.deepEqual(rows.map(x=>x.value),[2,1]);
  assert.equal(rows[0].time>rows[1].time,true);
});

test("series parser rejects non-numeric values and missing headers",()=>{
  assert.throws(()=>parseSeriesCsv("timestamp,value\n2024-01-01 00:00:00,nope\n"),/numeric value/);
  assert.throws(()=>parseSeriesCsv("time,reading\n2024-01-01 00:00:00,1\n"),/timestamp and value/);
});


test("missing timestamps are retained but cannot be used for label alignment",()=>{
  const rows=parseSeriesCsv("timestamp,value\\n2024-01-01 00:00:00,2\\n,3\\n2024-01-03 00:00:00,4\\n");
  assert.equal(rows.length,3);
  assert.equal(rows[1].timestamp,null);
  assert.equal(rows[1].time,null);
  assert.deepEqual(rows.map(x=>x.value),[2,3,4]);
});

test("CSV parser rejects unterminated quotes",()=>{
  assert.throws(()=>parseSeriesCsv('timestamp,value\\n"2024-01-01 00:00:00,1\\n'),/unterminated quoted field/);
});
