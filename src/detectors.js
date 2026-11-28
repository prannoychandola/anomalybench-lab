"use strict";

const clamp = (x, low = 0, high = 1) => Math.max(low, Math.min(high, x));
const median = values => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const anomalyProbability = z => clamp(1 - Math.exp(-Math.max(0, z) / 5));

function validateValues(values) {
  if (!Array.isArray(values) || values.some(value => !Number.isFinite(value))) {
    throw new TypeError("Detector input must be an array of finite numeric values.");
  }
}
function validatePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer.`);
}

function robustScale(values, center) {
  const deviations = values.map(x => Math.abs(x - center));
  const mad = median(deviations);
  const floor = Math.max(1e-8, Math.abs(center) * 1e-8);
  if (mad > floor) return 1.4826 * mad;

  // Flat or quantized histories often have zero MAD. Avoid an RMS fallback,
  // which an isolated extreme value can inflate and thereby hide later outliers.
  const nonzero = deviations.filter(value => value > floor);
  if (nonzero.length >= 3) return Math.max(floor, 1.4826 * median(nonzero));
  return floor;
}

function rollingMad(values, options = {}) {
  validateValues(values);
  const { window = 48, minHistory = 12 } = options;
  validatePositiveInteger(window, "window");
  validatePositiveInteger(minHistory, "minHistory");
  return values.map((value, i) => {
    const history = values.slice(Math.max(0, i - window), i);
    if (history.length < minHistory) return 0;
    const center = median(history);
    const scale = robustScale(history, center);
    return anomalyProbability(Math.abs(value - center) / scale);
  });
}

function adaptiveEwma(values, options = {}) {
  validateValues(values);
  const { alpha = 0.08, warmup = 24 } = options;
  if (!(alpha > 0 && alpha <= 1)) throw new RangeError("alpha must be in (0, 1].");
  validatePositiveInteger(warmup, "warmup");
  const scores = Array(values.length).fill(0);
  if (values.length <= warmup) return scores;
  let mean = values.slice(0, warmup).reduce((a, b) => a + b, 0) / warmup;
  let variance = values.slice(0, warmup).reduce((sum, x) => sum + (x - mean) ** 2, 0) / warmup;
  for (let i = warmup; i < values.length; i++) {
    const scale = Math.max(Math.sqrt(variance), Math.abs(mean) * 1e-8, 1e-8);
    const error = values[i] - mean;
    scores[i] = anomalyProbability(Math.abs(error) / scale);
    mean += alpha * error;
    variance = (1 - alpha) * (variance + alpha * error * error);
  }
  return scores;
}

function seasonalResidual(values, options = {}) {
  validateValues(values);
  const { period = 48, residualWindow = 48, minHistory = 12 } = options;
  validatePositiveInteger(period, "period");
  validatePositiveInteger(residualWindow, "residualWindow");
  validatePositiveInteger(minHistory, "minHistory");
  const scores = Array(values.length).fill(0);
  const residuals = [];
  for (let i = period; i < values.length; i++) {
    const residual = values[i] - values[i - period];
    const history = residuals.slice(-residualWindow);
    if (history.length >= minHistory) {
      const center = median(history);
      const scale = robustScale(history, center);
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

module.exports = { DETECTORS, rollingMad, adaptiveEwma, seasonalResidual, anomalyProbability, robustScale };
