"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const dataRoot=path.join(__dirname,"..","data","nab");
function csvFiles(dir,base=dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())return csvFiles(full,base);
    return entry.isFile()&&entry.name.endsWith(".csv")?[path.relative(base,full).split(path.sep).join("/")]:[];
  });
}

test("bundled NAB v1.1 series and labels have matching coverage",()=>{
  const files=csvFiles(dataRoot),labels=JSON.parse(fs.readFileSync(path.join(dataRoot,"combined_windows.json"),"utf8"));
  assert.equal(files.length,58);
  assert.equal(files.length,Object.keys(labels).length);
  assert.ok(files.every(name=>Object.hasOwn(labels,name)));
});


test("every bundled series is a parseable CSV with usable observations",()=>{
  const {parseSeriesCsv}=require("../src/csv");
  for(const file of csvFiles(dataRoot)){
    const records=parseSeriesCsv(fs.readFileSync(path.join(dataRoot,file),"utf8"));
    assert.ok(records.length>0,file);
    assert.ok(records.every(row=>Number.isFinite(row.value)),file);
  }
});
