"use strict";

const clamp = (x, low = 0, high = 1) => Math.max(low, Math.min(high, x));
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const anomalyProbability = z => clamp(1 - Math.exp(-Math.max(0, z) / 5));

function fallbackScale(values, center) {
  const variance = values.reduce((sum, x) => sum + (x - center) ** 2, 0) / values.length;
  const rms = Math.sqrt(variance);
  return Math.max(rms, Math.abs(center) * 1e-6, 1e-6);
}

function rollingMad(values, options = {}) {
  const { window = 48, minHistory = 12, thresholdZ = 3.5 } = options;
  return values.map((value, i) => {
    const history = values.slice(Math.max(0, i - window), i);
    if (history.length < minHistory) return 0;
    const center = median(history);
    const mad = median(history.map(x => Math.abs(x - center)));
    const scale = mad > 1e-9 ? 1.4826 * mad : fallbackScale(history, center);
    return anomalyProbability(Math.abs(value - center) / scale);
  });
}

function adaptiveEwma(values, options = {}) {
  const { alpha = 0.08, warmup = 24, thresholdZ = 3.5 } = options;
  const scores = Array(values.length).fill(0);
  if (values.length <= warmup) return scores;
  let mean = values.slice(0, warmup).reduce((a, b) => a + b, 0) / warmup;
  let variance = values.slice(0, warmup).reduce((sum, x) => sum + (x - mean) ** 2, 0) / warmup;
  for (let i = warmup; i < values.length; i++) {
    const scale = Math.max(Math.sqrt(variance), Math.abs(mean) * 1e-6, 1e-6);
    const error = values[i] - mean;
    scores[i] = anomalyProbability(Math.abs(error) / scale);
    mean += alpha * error;
    variance = (1 - alpha) * (variance + alpha * error * error);
  }
  return scores;
}

function seasonalResidual(values, options = {}) {
  const { period = 48, residualWindow = 48, minHistory = 12 } = options;
  const scores = Array(values.length).fill(0);
  const residuals = [];
  for (let i = period; i < values.length; i++) {
    const residual = values[i] - values[i - period];
    const history = residuals.slice(-residualWindow);
    if (history.length >= minHistory) {
      const center = median(history);
      const mad = median(history.map(x => Math.abs(x - center)));
      const scale = mad > 1e-9 ? 1.4826 * mad : fallbackScale(history, center);
      scores[i] = anomalyProbability(Math.abs(residual - center) / scale);
    }
    residuals.push(residual);
  }
  return scores;
}

const DETECTORS = {
  "Rolling robust z-score": values => rollingMad(values),
  "Adaptive EWMA residual": values => adaptiveEwma(values),
  "Seasonal residual (lag 48)": values => seasonalResidual(values),
};

module.exports = { DETECTORS, rollingMad, adaptiveEwma, seasonalResidual, anomalyProbability };

