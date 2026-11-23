"use strict";

const PROFILES = {
  standard: { tpWeight: 1, fpWeight: 0.11, fnWeight: 1 },
  reward_low_FP_rate: { tpWeight: 1, fpWeight: 0.22, fnWeight: 1 },
  reward_low_FN_rate: { tpWeight: 1, fpWeight: 0.11, fnWeight: 2 },
};

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function scaledSigmoid(position) {
  if (position > 3) return -1;
  return 2 * sigmoid(-5 * position) - 1;
}
const MAX_TP = scaledSigmoid(-1);

function locateWindows(records, rawWindows) {
  const indexByTime = new Map();
  records.forEach((r, i) => { if (!indexByTime.has(r.time)) indexByTime.set(r.time, i); });
  const nearestIndex = target => {
    let best = 0, distance = Infinity;
    for (let i = 0; i < records.length; i++) {
      const next = Math.abs(records[i].time - target);
      if (next < distance) { best = i; distance = next; }
    }
    return best;
  };
  const windows = [];
  for (const [rawStart, rawEnd] of rawWindows || []) {
    const startTime = Date.parse(rawStart), endTime = Date.parse(rawEnd);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) continue;
    let start = indexByTime.get(startTime), end = indexByTime.get(endTime);
    if (start === undefined) start = nearestIndex(startTime);
    if (end === undefined) end = nearestIndex(endTime);
    if (end < start) [start, end] = [end, start];
    windows.push({ start, end, rawStart, rawEnd });
  }
  windows.sort((a, b) => a.start - b.start);
  return windows;
}

function maskWindows(length, windows) {
  const mask = Array(length).fill(false);
  for (const { start, end } of windows) for (let i = start; i <= end; i++) mask[i] = true;
  return mask;
}

function episodes(indices) {
  if (!indices.length) return [];
  const out = [];
  let start = indices[0], prev = indices[0];
  for (const i of indices.slice(1)) {
    if (i > prev + 1) { out.push([start, prev]); start = i; }
    prev = i;
  }
  out.push([start, prev]);
  return out;
}

function scoreNabProfile(records, scores, windows, profile, threshold = 0.5, probationaryPercent = 0.15) {
  const { tpWeight, fpWeight, fnWeight } = profile;
  const probation = Math.min(Math.floor(probationaryPercent * records.length), probationaryPercent * 5000);
  const activeWindows = windows.filter(w => w.end >= probation);
  const predictions = scores.map((score, i) => i >= probation && score >= threshold);
  const perWindowMax = new Array(activeWindows.length).fill(-fnWeight);
  let falsePositiveScore = 0;
  let previousWindow = null;
  const labels = Array(records.length).fill(-1);

  for (let k = 0; k < activeWindows.length; k++) {
    const w = activeWindows[k];
    const width = w.end - w.start + 1;
    for (let i = Math.max(w.start, probation); i <= w.end; i++) labels[i] = k;
    if (predictions.slice(Math.max(w.start, probation), w.end + 1).some(Boolean)) {
      for (let i = Math.max(w.start, probation); i <= w.end; i++) {
        if (predictions[i]) perWindowMax[k] = Math.max(perWindowMax[k], scaledSigmoid(-(w.end - i + 1) / width) * tpWeight / MAX_TP);
      }
    }
  }

  for (let i = probation; i < records.length; i++) {
    for (const w of activeWindows) if (w.end < i && (!previousWindow || w.end > previousWindow.end)) previousWindow = w;
    if (!predictions[i] || labels[i] >= 0) continue;
    if (!previousWindow) {
      falsePositiveScore += -fpWeight;
    } else {
      const width = previousWindow.end - previousWindow.start + 1;
      const relativePosition = Math.abs(previousWindow.end - i) / Math.max(width - 1, 1);
      falsePositiveScore += scaledSigmoid(relativePosition) * fpWeight;
    }
  }

  return { raw: perWindowMax.reduce((a, b) => a + b, 0) + falsePositiveScore, predictions, probation, activeWindows, labels };
}

function evaluateSeries(records, scoreSeries, rawWindows, threshold = 0.5) {
  const windows = locateWindows(records, rawWindows);
  const truth = maskWindows(records.length, windows);
  const prediction = scoreSeries.map(score => score >= threshold);
  const standard = scoreNabProfile(records, scoreSeries, windows, PROFILES.standard, threshold);
  const validRows = records.map((_, i) => i >= standard.probation);
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < records.length; i++) {
    if (!validRows[i]) continue;
    if (truth[i] && prediction[i]) tp++;
    else if (truth[i]) fn++;
    else if (prediction[i]) fp++;
    else tn++;
  }
  const precision = tp / (tp + fp) || 0, recall = tp / (tp + fn) || 0;
  const f1 = 2 * precision * recall / (precision + recall) || 0;
  const detected = windows.map(w => {
    for (let i = Math.max(w.start, standard.probation); i <= w.end; i++) if (prediction[i]) return i;
    return null;
  });
  const delays = detected.flatMap((i, k) => i === null ? [] : [i - Math.max(windows[k].start, standard.probation)]);
  const alerts = episodes(prediction.map((p, i) => p && validRows[i] ? i : -1).filter(i => i >= 0));
  const matchedAlerts = alerts.filter(([a, b]) => windows.some(w => a <= w.end && b >= w.start));
  const unmatchedAlerts = alerts.length - matchedAlerts.length;
  const cleanRows = tn + fp;
  const profileScores = {};
  for (const [name, profile] of Object.entries(PROFILES)) {
    profileScores[name] = scoreNabProfile(records, scoreSeries, windows, profile, threshold).raw;
  }
  return {
    threshold, probationRows: standard.probation, windowCount: standard.activeWindows.length,
    rawNabScores: profileScores, tp, fp, fn, tn, precision, recall, f1,
    eventRecall: standard.activeWindows.length ? detected.filter(x => x !== null).length / standard.activeWindows.length : null,
    detectedEvents: detected.filter(x => x !== null).length,
    meanDetectionDelayPoints: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null,
    alertEpisodes: alerts.length,
    matchedAlertEpisodes: matchedAlerts.length,
    falseAlertEpisodes: unmatchedAlerts,
    alertPrecision: alerts.length ? matchedAlerts.length / alerts.length : null,
    falseAlertEpisodesPer1000CleanPoints: unmatchedAlerts / Math.max(cleanRows, 1) * 1000,
    prediction,
    windows: standard.activeWindows,
  };
}

function aggregateNab(seriesResults, profileName) {
  const profile = PROFILES[profileName];
  const raw = seriesResults.reduce((sum, x) => sum + x.rawNabScores[profileName], 0);
  const windows = seriesResults.reduce((sum, x) => sum + x.windowCount, 0);
  const nullScore = -profile.fnWeight * windows;
  const perfectScore = profile.tpWeight * windows;
  const normalized = perfectScore === nullScore ? null : 100 * (raw - nullScore) / (perfectScore - nullScore);
  return { raw, normalized, nullScore, perfectScore, windowCount: windows };
}

module.exports = { PROFILES, locateWindows, evaluateSeries, scoreNabProfile, aggregateNab, scaledSigmoid };

