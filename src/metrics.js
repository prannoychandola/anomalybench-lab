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

function validateEvaluation(records, scores, threshold, probationaryPercent) {
  if (!Array.isArray(records) || !Array.isArray(scores) || records.length !== scores.length) {
    throw new TypeError("Records and score arrays must have the same length.");
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError("Threshold must be between 0 and 1.");
  }
  if (!Number.isFinite(probationaryPercent) || probationaryPercent < 0 || probationaryPercent >= 1) {
    throw new RangeError("Probationary percentage must be in [0, 1).");
  }
  if (scores.some(score => !Number.isFinite(score) || score < 0 || score > 1)) {
    throw new RangeError("Scores must be finite values between 0 and 1.");
  }
}

function nearestIndex(records, target) {
  let best = -1, distance = Infinity;
  for (let i = 0; i < records.length; i++) {
    if (!Number.isFinite(records[i].time)) continue;
    const next = Math.abs(records[i].time - target);
    if (next < distance) { best = i; distance = next; }
  }
  return best;
}

function locateWindows(records, rawWindows) {
  const windows = [];
  for (const pair of rawWindows || []) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const [rawStart, rawEnd] = pair;
    const startTime = Date.parse(rawStart), endTime = Date.parse(rawEnd);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) continue;

    const indices = [];
    for (let i = 0; i < records.length; i++) {
      const time = records[i].time;
      if (Number.isFinite(time) && time >= startTime && time <= endTime) indices.push(i);
    }
    if (indices.length) {
      windows.push({ start: Math.min(...indices), end: Math.max(...indices), rawStart, rawEnd });
      continue;
    }

    // A sparse or irregular series may have no sample inside a labeled time window.
    const nearest = nearestIndex(records, (startTime + endTime) / 2);
    if (nearest >= 0) windows.push({ start: nearest, end: nearest, rawStart, rawEnd, snapped: true });
  }
  windows.sort((a, b) => a.start - b.start || a.end - b.end);
  return windows;
}

function maskWindows(length, windows) {
  const mask = Array(length).fill(false);
  for (const { start, end } of windows) {
    for (let i = start; i <= end && i < length; i++) if (i >= 0) mask[i] = true;
  }
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
  validateEvaluation(records, scores, threshold, probationaryPercent);
  const { tpWeight, fpWeight, fnWeight } = profile;
  const probation = Math.min(Math.floor(probationaryPercent * records.length), probationaryPercent * 5000);
  const activeWindows = windows.filter(w => w.end >= probation);
  const predictions = scores.map((score, i) =>
    i >= probation && Number.isFinite(records[i].time) && score >= threshold);
  const perWindowMax = new Array(activeWindows.length).fill(-fnWeight);
  const labels = Array(records.length).fill(-1);

  for (let k = 0; k < activeWindows.length; k++) {
    const w = activeWindows[k];
    const width = w.end - w.start + 1;
    const first = Math.max(w.start, probation);
    for (let i = first; i <= w.end; i++) labels[i] = k;
    for (let i = first; i <= w.end; i++) {
      if (predictions[i]) {
        perWindowMax[k] = Math.max(
          perWindowMax[k],
          scaledSigmoid(-(w.end - i + 1) / width) * tpWeight / MAX_TP,
        );
      }
    }
  }

  let falsePositiveScore = 0, previousWindow = null;
  let windowCursor = 0;
  for (let i = probation; i < records.length; i++) {
    while (windowCursor < activeWindows.length && activeWindows[windowCursor].end < i) {
      previousWindow = activeWindows[windowCursor];
      windowCursor++;
    }
    if (!predictions[i] || labels[i] >= 0) continue;
    if (!previousWindow) {
      falsePositiveScore -= fpWeight;
    } else {
      const width = previousWindow.end - previousWindow.start + 1;
      const relativePosition = Math.abs(previousWindow.end - i) / Math.max(width - 1, 1);
      falsePositiveScore += scaledSigmoid(relativePosition) * fpWeight;
    }
  }

  return { raw: perWindowMax.reduce((a, b) => a + b, 0) + falsePositiveScore, predictions, probation, activeWindows, labels };
}

function matchAlertsToWindows(alerts, windows) {
  const matchedWindows = new Set(), matchedAlerts = new Set();
  for (let alertIndex = 0; alertIndex < alerts.length; alertIndex++) {
    const [start, end] = alerts[alertIndex];
    let bestWindow = -1, bestOverlap = 0;
    for (let windowIndex = 0; windowIndex < windows.length; windowIndex++) {
      if (matchedWindows.has(windowIndex)) continue;
      const window = windows[windowIndex];
      const overlap = Math.min(end, window.end) - Math.max(start, window.start) + 1;
      if (overlap > bestOverlap) { bestOverlap = overlap; bestWindow = windowIndex; }
    }
    if (bestWindow >= 0) {
      matchedWindows.add(bestWindow);
      matchedAlerts.add(alertIndex);
    }
  }
  return { matchedWindows, matchedAlerts };
}

function evaluateSeries(records, scoreSeries, rawWindows, threshold = 0.5) {
  validateEvaluation(records, scoreSeries, threshold, 0.15);
  const windows = locateWindows(records, rawWindows);
  const truth = maskWindows(records.length, windows);
  const standard = scoreNabProfile(records, scoreSeries, windows, PROFILES.standard, threshold);
  const prediction = standard.predictions;
  const validRows = records.map((r, i) => i >= standard.probation && Number.isFinite(r.time));
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
  const activeWindows = standard.activeWindows;
  const detected = activeWindows.map(w => {
    for (let i = Math.max(w.start, standard.probation); i <= w.end; i++) {
      if (prediction[i]) return i;
    }
    return null;
  });
  const delays = detected.flatMap((i, k) =>
    i === null ? [] : [i - Math.max(activeWindows[k].start, standard.probation)]);
  const alerts = episodes(prediction.map((p, i) => p && validRows[i] ? i : -1).filter(i => i >= 0));
  const { matchedAlerts } = matchAlertsToWindows(alerts, activeWindows);
  const unmatchedAlerts = alerts.length - matchedAlerts.size;
  const cleanRows = tn + fp;
  const profileScores = {};
  for (const [name, profile] of Object.entries(PROFILES)) {
    profileScores[name] = scoreNabProfile(records, scoreSeries, windows, profile, threshold).raw;
  }
  return {
    threshold, probationRows: standard.probation, windowCount: activeWindows.length,
    rawNabScores: profileScores, tp, fp, fn, tn, precision, recall, f1,
    eventRecall: activeWindows.length ? detected.filter(x => x !== null).length / activeWindows.length : null,
    detectedEvents: detected.filter(x => x !== null).length,
    meanDetectionDelayPoints: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null,
    alertEpisodes: alerts.length,
    matchedAlertEpisodes: matchedAlerts.size,
    falseAlertEpisodes: unmatchedAlerts,
    alertPrecision: alerts.length ? matchedAlerts.size / alerts.length : null,
    falseAlertEpisodesPer1000CleanPoints: unmatchedAlerts / Math.max(cleanRows, 1) * 1000,
    prediction,
    windows: activeWindows,
  };
}

function aggregateNab(seriesResults, profileName) {
  const profile = PROFILES[profileName];
  if (!profile) throw new RangeError(`Unknown NAB profile: ${profileName}`);
  const raw = seriesResults.reduce((sum, x) => sum + x.rawNabScores[profileName], 0);
  const windows = seriesResults.reduce((sum, x) => sum + x.windowCount, 0);
  const nullScore = -profile.fnWeight * windows;
  const perfectScore = profile.tpWeight * windows;
  const normalized = perfectScore === nullScore ? null : 100 * (raw - nullScore) / (perfectScore - nullScore);
  return { raw, normalized, nullScore, perfectScore, windowCount: windows };
}

module.exports = { PROFILES, locateWindows, evaluateSeries, scoreNabProfile, aggregateNab, scaledSigmoid, episodes, matchAlertsToWindows };
