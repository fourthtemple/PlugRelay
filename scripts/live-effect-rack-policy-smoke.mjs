import {
  createLiveEffectRackPolicy,
  createLivePerformanceRackOptions
} from "../packages/web-client/dist/soundbridge-client.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function near(actual, expected) {
  return Math.abs(actual - expected) < 0.000001;
}

const policy = createLiveEffectRackPolicy({
  sampleRate: 48000,
  maxBlockSize: 128,
  pluginLatencySamples: 17,
  transportLatencySamples: 256
});
assert(policy.blockDurationMs === 2.667, "live effect policy exposes block duration");
assert(near(policy.processBudgetMs, (128 / 48000) * 1000), "live effect policy budgets one block by default");
assert(policy.maxInputAgeBlocks === 4 && near(policy.maxInputAgeMs, (128 / 48000) * 1000 * 4), "live effect policy exposes stale-input window");
assert(policy.processTimeoutBlocks === 4 && near(policy.processTimeoutMs, (128 / 48000) * 1000 * 4), "live effect policy exposes render timeout window");
assert(policy.transitionFadeSamples === 64 && policy.transitionFadeBlocks === 0.5, "live effect policy exposes wet/dry fade window");
assert(policy.maxInFlightBlocks === 1, "live effect policy bounds rack in-flight work");
assert(policy.maxConsecutiveProcessBudgetMisses === 3, "live effect policy exposes process budget threshold");
assert(policy.maxConsecutiveRenderBudgetMisses === 2, "live effect policy exposes render budget threshold");
assert(policy.processBudgetRecoveryBlocks === 16 && policy.renderBudgetRecoveryBlocks === 16, "live effect policy exposes pressure recovery windows");
assert(policy.reportedLatencySamples === 273 && policy.reportedLatencyMs === 5.688, "live effect policy combines plugin and transport latency");

const overridden = createLiveEffectRackPolicy({
  sampleRate: 96000,
  maxBlockSize: 64,
  maxInputAgeMs: 2,
  processBudgetMs: 1,
  processTimeoutBlocks: 6,
  transitionFadeSamples: 12,
  maxInFlightBlocks: 99,
  maxConsecutiveProcessBudgetMisses: 5,
  maxConsecutiveRenderBudgetMisses: 7,
  processBudgetRecoveryBlocks: 9,
  renderBudgetRecoveryBlocks: 11,
  processTimeoutRecoveryBlocks: 13,
  maxProcessTimeoutRecoveries: 3
});
assert(overridden.maxInFlightBlocks === 32, "live effect policy clamps in-flight overrides");
assert(overridden.maxInputAgeMs === 2 && overridden.maxInputAgeBlocks === 3, "live effect policy preserves explicit freshness milliseconds");
assert(overridden.processBudgetMs === 1 && overridden.processBudgetBlocks === 1.5, "live effect policy preserves explicit budget milliseconds");
assert(overridden.processTimeoutBlocks === 6, "live effect policy preserves timeout block overrides");
assert(overridden.transitionFadeSamples === 12 && overridden.transitionFadeBlocks === 0.188, "live effect policy preserves explicit fade samples");
assert(overridden.maxConsecutiveProcessBudgetMisses === 5 && overridden.maxConsecutiveRenderBudgetMisses === 7, "live effect policy preserves failure thresholds");
assert(overridden.processBudgetRecoveryBlocks === 9 && overridden.renderBudgetRecoveryBlocks === 11, "live effect policy preserves recovery thresholds");
assert(overridden.processTimeoutRecoveryBlocks === 13 && overridden.maxProcessTimeoutRecoveries === 3, "live effect policy preserves timeout recovery policy");

const rackOptions = createLivePerformanceRackOptions({
  client: {},
  plugin: { pluginId: "demo", format: "vst3", inputs: 2, outputs: 2 },
  sampleRate: 48000,
  maxBlockSize: 128,
  maxInputAgeBlocks: 2,
  processBudgetBlocks: 2,
  processTimeoutBlocks: 3,
  transitionFadeBlocks: 1,
  maxInFlightBlocks: 3
});
assert(rackOptions.audioTransport === "binary", "live rack preset stays binary by default");
assert(rackOptions.maxInFlightBlocks === 3, "live rack preset uses policy in-flight settings");
assert(near(rackOptions.maxInputAgeMs, (128 / 48000) * 1000 * 2), "live rack preset uses policy freshness timing");
assert(near(rackOptions.processBudgetMs, (128 / 48000) * 1000 * 2), "live rack preset uses policy budget timing");
assert(near(rackOptions.processTimeoutMs, (128 / 48000) * 1000 * 3), "live rack preset uses policy timeout timing");
assert(rackOptions.transitionFadeSamples === 128, "live rack preset uses policy fade timing");

console.log("Live effect rack policy smoke checks passed.");
