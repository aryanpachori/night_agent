'use strict';

// ─── Layer 1: EWMA Volatility ─────────────────────────────────────────────────
// Adapts to changing volatility in real-time (better than fixed Bollinger Bands)
// σ²_t = λ·σ²_{t-1} + (1-λ)·(r²/Δt)   — RiskMetrics decay factor λ=0.94

function ewmaVolatility(history, lambda = 0.94) {
  if (!history || history.length < 3) return null;
  let variance = 0;
  let initialized = false;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    if (!prev.yesPrice || !curr.yesPrice || prev.yesPrice <= 0 || curr.yesPrice <= 0) continue;
    const r  = Math.log(curr.yesPrice / prev.yesPrice);
    const dt = Math.max((curr.timestamp - prev.timestamp) / 1000, 0.001); // seconds
    const r2PerSec = (r * r) / dt;
    if (!initialized) { variance = r2PerSec; initialized = true; }
    else              { variance = lambda * variance + (1 - lambda) * r2PerSec; }
  }
  return initialized ? Math.sqrt(variance) : null; // σ per second
}

// ─── Layer 2: Black-Scholes binary probability ────────────────────────────────
// P(YES price > 0.5 at expiry) = N(d₂)  [risk-neutral binary call]

function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x) / Math.sqrt(2));
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1.0 + sign * y);
}

function binaryCallProbability(currentPrice, strikePrice, volatilityPerSec, timeRemainingSeconds) {
  if (timeRemainingSeconds <= 0) return currentPrice > strikePrice ? 1.0 : 0.0;
  if (!volatilityPerSec || volatilityPerSec <= 0) return 0.5;
  const sigma = volatilityPerSec * Math.sqrt(timeRemainingSeconds); // total vol over period
  const d2 = (Math.log(currentPrice / strikePrice) - (sigma * sigma / 2)) / sigma;
  return normalCDF(d2);
}

// ─── Layer 3: Momentum ROC ────────────────────────────────────────────────────
// ROC_combined = 0.5×ROC_10s + 0.3×ROC_30s + 0.2×ROC_60s

function rateOfChange(history, windowSeconds) {
  if (!history || history.length < 2) return 0;
  const now    = history[history.length - 1];
  const cutoff = now.timestamp - windowSeconds * 1000;
  // Walk backwards to find oldest point within window
  const old    = [...history].reverse().find(p => p.timestamp <= cutoff);
  if (!old || !old.yesPrice || old.yesPrice === 0) return 0;
  return (now.yesPrice - old.yesPrice) / old.yesPrice;
}

function combinedMomentum(history) {
  return (
    0.5 * rateOfChange(history, 10) +
    0.3 * rateOfChange(history, 30) +
    0.2 * rateOfChange(history, 60)
  );
}

// ─── Layer 4: Mean Reversion Signal ──────────────────────────────────────────
// Detects when YES price deviates > 0.3% from 2-min SMA

function meanReversionSignal(history) {
  if (!history || history.length < 3) return 0;
  const windowMs = 120_000; // 2 minutes
  const now      = history[history.length - 1];
  const inWindow = history.filter(p => p.timestamp >= now.timestamp - windowMs);
  if (inWindow.length === 0) return 0;
  const sma = inWindow.reduce((sum, p) => sum + p.yesPrice, 0) / inWindow.length;
  if (!sma || sma === 0) return 0;
  const deviation = (now.yesPrice - sma) / sma;
  return Math.abs(deviation) > 0.003 ? -deviation : 0; // push back toward mean
}

// ─── Layer 5: Logit-Space Fusion ─────────────────────────────────────────────
// Combine signals in log-odds space so probability stays in (0, 1)
// p_adj = σ(logit(p_base) + w1·f1 + w2·f2)

function logit(p) {
  const safe = Math.max(1e-7, Math.min(1 - 1e-7, p));
  return Math.log(safe / (1 - safe));
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function fuseProbability(baseProb, momentumFactor, reversionFactor) {
  const logitAdj = logit(baseProb)
    + 2.0 * momentumFactor    // momentum weight
    + 1.5 * reversionFactor;  // reversion weight
  return Math.max(0.01, Math.min(0.99, sigmoid(logitAdj)));
}

// ─── Volume analysis ──────────────────────────────────────────────────────────
function volumeAnalysis(volumes) {
  if (!volumes || volumes.length < 3) return null;
  const current = volumes[volumes.length - 1];
  const avg     = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
  const ratio   = avg > 0 ? current / avg : 1;
  return { current, avg, ratio, spike: ratio >= 2.0, thin: current < 500 };
}

// ─── Main: analyzeMarket ──────────────────────────────────────────────────────
/**
 * Run the full pro math stack on a market's YES price history.
 *
 * @param {Array<{timestamp, yesPrice, noPrice, volume}>} history - full snapshot objects
 * @param {number} timeRemainingSeconds - seconds until market closes
 * @returns {{ interesting, mathProbability, signals, summary, values } | null}
 */
function analyzeMarket(history, timeRemainingSeconds = 86_400) {
  if (!history || history.length < 3) return null;

  const current = history[history.length - 1].yesPrice;
  const volumes = history.map(p => p.volume);

  // Layer 1: EWMA volatility
  const sigma = ewmaVolatility(history);

  // Layer 2: Black-Scholes base probability
  // Models: P(YES price ends above 50¢ at expiry)
  const baseProb = (sigma !== null)
    ? binaryCallProbability(current, 0.5, sigma, timeRemainingSeconds)
    : current; // fallback to current market price if insufficient history

  // Layer 3: Momentum
  const momentum  = combinedMomentum(history);

  // Layer 4: Mean reversion
  const reversion = meanReversionSignal(history);

  // Layer 5: Fuse in logit space
  const mathProbability = fuseProbability(baseProb, momentum, reversion);

  // Volume
  const vol = volumeAnalysis(volumes);

  // ── Signal classification ────────────────────────────────────────────────
  const signals = {
    highVolatility:  sigma !== null && sigma > 0.0005,
    strongMomentum:  Math.abs(momentum) > 0.02,               // >2% recent move
    meanReverting:   Math.abs(reversion) > 0.003,             // price far from 2-min SMA
    bsMispriced:     Math.abs(mathProbability - current) > 0.08, // math vs market >8% gap
    volumeSpike:     vol?.spike ?? false,
    volumeThin:      vol?.thin ?? false,
  };

  const interesting =
    signals.highVolatility ||
    signals.strongMomentum ||
    signals.meanReverting  ||
    signals.bsMispriced    ||
    signals.volumeSpike;

  // ── Human-readable summary for LLM ──────────────────────────────────────
  const lines = [`PREDICTION MARKET TECHNICALS (pro math stack):`];
  lines.push(`  Current YES price:  ${(current * 100).toFixed(1)}¢`);
  if (sigma !== null) {
    lines.push(`  EWMA Volatility:    σ=${(sigma * 1e4).toFixed(3)}e-4/s (RiskMetrics λ=0.94)`);
  }
  lines.push(`  B-S base prob:      ${(baseProb * 100).toFixed(1)}% (prob YES price > 50¢ at expiry)`);
  lines.push(`  Momentum (ROC):     ${(momentum * 100).toFixed(3)}% (weighted 10/30/60s)`);
  lines.push(`  Mean reversion:     ${(reversion * 100).toFixed(3)}% (2-min SMA deviation)`);
  lines.push(`  Math probability:   ${(mathProbability * 100).toFixed(1)}% (logit-fused)`);
  if (vol) {
    lines.push(`  Volume:             $${vol.current.toFixed(0)} (${vol.ratio.toFixed(1)}x avg${vol.spike ? ' — SPIKE ⚠️' : ''})`);
  }
  const gap = mathProbability - current;
  if (signals.bsMispriced) {
    lines.push(`  ⚠️  Math says ${gap > 0 ? 'UNDERVALUED' : 'OVERVALUED'} vs crowd (gap: ${gap > 0 ? '+' : ''}${(gap * 100).toFixed(1)}%)`);
  }
  if (signals.strongMomentum) {
    lines.push(`  ⚠️  ${momentum > 0 ? 'Bullish' : 'Bearish'} momentum: ${(momentum * 100).toFixed(2)}%`);
  }
  if (signals.meanReverting) {
    lines.push(`  ⚠️  Mean reversion: price ${reversion < 0 ? 'above' : 'below'} 2-min average`);
  }

  return {
    interesting,
    mathProbability,
    signals,
    summary: lines.join('\n'),
    values: { sigma, baseProb, momentum, reversion, vol, current },
  };
}

module.exports = {
  analyzeMarket,
  ewmaVolatility,
  binaryCallProbability,
  normalCDF,
  combinedMomentum,
  meanReversionSignal,
  fuseProbability,
  logit,
  sigmoid,
  volumeAnalysis,
};
