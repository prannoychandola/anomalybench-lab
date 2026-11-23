"use strict";
const $ = id => document.getElementById(id);
let report = null;
let currentSeries = null;
const pagesData = location.hostname.endsWith("github.io") ? "./data" : null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function pct(value, digits=0) { return value == null ? "—" : `${(100*value).toFixed(digits)}%`; }
function fixed(value,digits=2) { return value == null || !Number.isFinite(value) ? "—" : Number(value).toFixed(digits); }
function setError(message) { $("datasetStatus").textContent="Benchmark unavailable"; $("datasetMeta").textContent=message; $("modelCards").innerHTML=`<div class="error-card">${escapeHtml(message)}</div>`; }

async function loadReport() {
  const response=await fetch(pagesData ? `${pagesData}/report.json` : "/api/report"); const data=await response.json();
  if(!response.ok) throw new Error(data.error||"Could not read benchmark report.");
  report=data;
  $("datasetStatus").textContent=`${data.dataset.seriesCount} NAB series · ${data.dataset.observations.toLocaleString()} observations`;
  $("datasetMeta").textContent=`NAB ${data.dataset.version} · ${data.dataset.scorableWindows} labeled windows · ${data.test.files} held-out files`;
  renderModelCards(); populateSelectors(); renderCategories();
  const defaultItem=data.series.find(x=>x.split==="test"&&x.scorableWindows>0) || data.series.find(x=>x.split==="test");
  if(defaultItem) { $("seriesSelect").value=defaultItem.file; await loadSeries(defaultItem.file); }
}

function renderModelCards() {
  const models=Object.entries(report.detectors);
  $("modelCards").innerHTML=models.map(([name,item])=>{
    const s=item.test, standard=s.nab.standard.normalized, lowFp=s.nab.reward_low_FP_rate.normalized, lowFn=s.nab.reward_low_FN_rate.normalized;
    const clipped=Math.max(-100,Math.min(100,standard)),left=clipped<0?50+clipped/2:50,width=Math.abs(clipped)/2;
    return `<article class="model-card"><div class="model-card-head"><div><span class="eyebrow">FIXED DEV THRESHOLD</span><h3>${escapeHtml(name)}</h3></div><span class="threshold">${Number(item.threshold).toFixed(3)}</span></div><div class="score-line"><span>NAB standard</span><strong>${fixed(standard,1)}</strong><small>/ 100</small></div><div class="score-meter"><i style="left:${left}%;width:${width}%"></i><b></b></div><div class="card-stats"><div><label>Event recall</label><strong>${pct(s.events.recall)}</strong></div><div><label>Point F1</label><strong>${fixed(s.point.f1,3)}</strong></div><div><label>False alert episodes</label><strong>${fixed(s.events.falseAlertsPer1000CleanPoints,1)}<small> / 1k</small></strong></div></div><div class="profile-strip"><span>Low FP&nbsp; ${fixed(lowFp,1)}</span><span>Low FN&nbsp; ${fixed(lowFn,1)}</span></div></article>`;
  }).join("");
}

function populateSelectors() {
  const series=report.series.filter(x=>x.split==="test").sort((a,b)=>a.file.localeCompare(b.file));
  $("seriesSelect").innerHTML=series.map(x=>`<option value="${escapeHtml(x.file)}">${escapeHtml(x.file)} · ${x.scorableWindows} windows</option>`).join("");
  const modelOptions=Object.keys(report.detectors).map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  $("modelSelect").innerHTML=modelOptions;
  $("categoryModelSelect").innerHTML=modelOptions;
  $("seriesSelect").disabled=false; $("modelSelect").disabled=false; $("categoryModelSelect").disabled=false;
  $("seriesSelect").addEventListener("change",e=>loadSeries(e.target.value));
  $("modelSelect").addEventListener("change",()=>renderSeries());
  $("categoryModelSelect").addEventListener("change",renderCategories);
}

function renderCategories() {
  if(!report)return;
  const model=$("categoryModelSelect").value||Object.keys(report.detectors)[0];
  const cats=Object.entries(report.testCategories);
  $("categoryRows").innerHTML=cats.map(([name,data])=>{
    const s=data.detectors[model], score=s.nab.standard.normalized;
    return `<div class="category-row"><span>${escapeHtml(name.replace(/([a-z])([A-Z])/g,"$1 $2"))}</span><span class="category-files">${data.files} files</span><span class="category-meter"><i style="width:${Math.max(0,Math.min(100,score))}%"></i></span><strong>${fixed(score,1)}</strong><span class="category-recall">${pct(s.events.recall)} event recall</span></div>`;
  }).join("");
}

async function loadSeries(file) {
  $("chart").innerHTML='<div class="loading">Loading source series…</div>';
  try {
    const seriesUrl=pagesData
      ? `${pagesData}/series/${file.split("/").map(encodeURIComponent).join("/")}.json`
      : `/api/series?file=${encodeURIComponent(file)}`;
    const response=await fetch(seriesUrl),data=await response.json();
    if(!response.ok)throw new Error(data.error||"Could not load this series.");
    currentSeries=data; renderSeries();
  } catch(error) { $("chart").innerHTML=`<div class="error-card">${escapeHtml(error.message)}</div>`; }
}

function renderSeries() {
  if(!currentSeries)return;
  const model=$("modelSelect").value||Object.keys(currentSeries.models)[0];
  const result=currentSeries.models[model], metrics=result.metrics;
  $("seriesName").textContent=currentSeries.file;
  $("seriesDescription").textContent=`${currentSeries.category} · selected on development data, measured on held-out test data`;
  $("seriesBadge").textContent=`${currentSeries.split.toUpperCase()} · THRESHOLD ${result.threshold.toFixed(3)}`;
  $("observationCount").textContent=`${currentSeries.records.length.toLocaleString()} observations`;
  drawSignal(currentSeries,result);
  const normalized=metrics.windowCount?100*(metrics.nab+metrics.windowCount)/(2*metrics.windowCount):null;
  $("seriesMetrics").innerHTML=`<div class="series-metric"><label>NAB score<small>series normalized</small></label><strong>${fixed(normalized,1)}</strong></div><div class="series-metric"><label>Events detected</label><strong>${metrics.detectedEvents} <small>/ ${metrics.windowCount}</small></strong></div><div class="series-metric"><label>Event recall</label><strong>${pct(metrics.eventRecall)}</strong></div><div class="series-metric"><label>Mean delay</label><strong>${fixed(metrics.meanDetectionDelayPoints,1)} <small>points</small></strong></div><div class="series-metric"><label>Alert precision</label><strong>${pct(metrics.alertPrecision)}</strong></div><div class="series-metric"><label>False alert episodes</label><strong>${metrics.falseAlertEpisodes}</strong></div>`;
}

function drawSignal(data,model) {
  const box=$("chart"),width=Math.max(box.clientWidth,360),height=310,pad={left:12,right:12,top:16,bottom:18};
  const rows=data.records,n=rows.length,step=Math.max(1,Math.ceil(n/1500));
  const indices=[]; for(let i=0;i<n;i+=step)indices.push(i); if(indices[indices.length-1]!==n-1)indices.push(n-1);
  const vals=rows.map(r=>r.value),min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;
  const x=i=>pad.left+(i/(Math.max(n-1,1)))*(width-pad.left-pad.right);
  const y=v=>height-pad.bottom-((v-min)/span)*(height-pad.top-pad.bottom);
  const line=indices.map((i,j)=>`${j?"L":"M"}${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(" ");
  const bands=data.windows.map(([a,b])=>`<rect x="${x(a)}" y="${pad.top}" width="${Math.max(1,x(b)-x(a))}" height="${height-pad.top-pad.bottom}" fill="#e77d57" opacity=".14"/>`).join("");
  const dots=indices.filter(i=>model.predictions[i]).map(i=>`<circle cx="${x(i).toFixed(1)}" cy="${y(vals[i]).toFixed(1)}" r="3" fill="#668747" stroke="#fbfcfa" stroke-width="1.2"/>`).join("");
  box.innerHTML=`<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Time series with labeled anomaly windows and detector alerts"><line x1="0" y1="${height*.25}" x2="${width}" y2="${height*.25}" stroke="#edf0eb"/><line x1="0" y1="${height*.5}" x2="${width}" y2="${height*.5}" stroke="#edf0eb"/><line x1="0" y1="${height*.75}" x2="${width}" y2="${height*.75}" stroke="#edf0eb"/>${bands}<path d="${line}" fill="none" stroke="#30473a" stroke-width="1.5" vector-effect="non-scaling-stroke"/>${dots}</svg>`;
}

loadReport().catch(error=>setError(error.message));

