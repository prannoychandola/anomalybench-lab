"use strict";
const crypto=require("node:crypto");

function assignDevelopmentFiles(items,fraction=.3){
  if(!(fraction>0&&fraction<1))throw new RangeError("Development fraction must be between 0 and 1.");
  const groups=new Map();
  for(const item of items){const group=groups.get(item.category)||[];group.push(item);groups.set(item.category,group);}
  for(const group of groups.values()){
    group.sort((a,b)=>{
      const ah=crypto.createHash("sha256").update(a.file).digest("hex");
      const bh=crypto.createHash("sha256").update(b.file).digest("hex");
      return ah.localeCompare(bh)||a.file.localeCompare(b.file);
    });
    const developmentCount=Math.max(1,Math.floor(group.length*fraction));
    group.forEach((item,i)=>{item.split=i<developmentCount?"development":"test";});
  }
  return items;
}

module.exports={assignDevelopmentFiles};

