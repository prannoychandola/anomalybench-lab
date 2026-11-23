"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {assignDevelopmentFiles}=require("../src/split");

test("file split is deterministic, category-stratified, and independent of input order",()=>{
  const original=Array.from({length:10},(_,i)=>({file:`groupA/item-${i}.csv`,category:"groupA"})).concat(Array.from({length:5},(_,i)=>({file:`groupB/item-${i}.csv`,category:"groupB"})));
  const first=assignDevelopmentFiles(original.map(x=>({...x}))).map(x=>[x.file,x.split]).sort();
  const reversed=assignDevelopmentFiles(original.slice().reverse().map(x=>({...x}))).map(x=>[x.file,x.split]).sort();
  assert.deepEqual(first,reversed);
  for(const category of ["groupA","groupB"]){
    const group=original.filter(x=>x.category===category).map(x=>first.find(([file])=>file===x.file)[1]);
    assert.ok(group.includes("development"));
    assert.ok(group.includes("test"));
  }
  assert.throws(()=>assignDevelopmentFiles([],1),/between 0 and 1/);
});

