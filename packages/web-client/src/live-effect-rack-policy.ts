import {
  boundedLatencySamples,
  boundedLiveEffectInteger,
  boundedLiveEffectNumber,
  combinedLatencySamples,
  liveEffectBlockDurationMs,
  liveEffectBlockFrames,
  liveEffectLatencyMilliseconds
} from "./live-effect-rack-metrics";

const LIVE_PERFORMANCE_INPUT_AGE_BLOCKS = 4;
const LIVE_PERFORMANCE_PROCESS_BUDGET_BLOCKS = 1;
const LIVE_PERFORMANCE_PROCESS_BUDGET_MISSES = 3;
const LIVE_PERFORMANCE_PROCESS_TIMEOUT_BLOCKS = 4;
const LIVE_PERFORMANCE_TRANSITION_FADE_BLOCKS = 0.5;
const LIVE_PERFORMANCE_RECOVERY_BLOCKS = 16;
const LIVE_PERFORMANCE_PROCESS_TIMEOUT_RECOVERIES = 1;

export interface LiveEffectRackPolicyOptions {
  sampleRate: number;
  maxBlockSize: number;
  maxInputAgeMs?: number;
  maxInputAgeBlocks?: number;
  maxInFlightBlocks?: number;
  processBudgetMs?: number;
  processBudgetBlocks?: number;
  processTimeoutMs?: number;
  processTimeoutBlocks?: number;
  transitionFadeSamples?: number;
  transitionFadeBlocks?: number;
  maxConsecutiveProcessBudgetMisses?: number;
  maxConsecutiveRenderBudgetMisses?: number;
  processBudgetRecoveryBlocks?: number;
  renderBudgetRecoveryBlocks?: number;
  processTimeoutRecoveryBlocks?: number;
  maxProcessTimeoutRecoveries?: number;
  pluginLatencySamples?: number;
  transportLatencySamples?: number;
}

export interface LiveEffectRackPolicy {
  sampleRate: number;
  maxBlockSize: number;
  blockDurationMs: number;
  maxInputAgeMs: number;
  maxInputAgeBlocks: number;
  maxInFlightBlocks: number;
  processBudgetMs: number;
  processBudgetBlocks: number;
  processTimeoutMs: number;
  processTimeoutBlocks: number;
  transitionFadeSamples: number;
  transitionFadeBlocks: number;
  maxConsecutiveProcessBudgetMisses: number;
  maxConsecutiveRenderBudgetMisses: number;
  processBudgetRecoveryBlocks: number;
  renderBudgetRecoveryBlocks: number;
  processTimeoutRecoveryBlocks: number;
  maxProcessTimeoutRecoveries: number;
  pluginLatencySamples: number;
  transportLatencySamples: number;
  reportedLatencySamples: number;
  reportedLatencyMs: number;
}

export function createLiveEffectRackPolicy(options: LiveEffectRackPolicyOptions): LiveEffectRackPolicy {
  const sampleRate = boundedLiveEffectInteger(options.sampleRate, 48000, 1, 384000);
  const maxBlockSize = liveEffectBlockFrames(options.maxBlockSize);
  const blockDurationMs = liveEffectBlockDurationMs(sampleRate, maxBlockSize);
  const maxInputAgeBlocks = boundedLiveEffectNumber(options.maxInputAgeBlocks, LIVE_PERFORMANCE_INPUT_AGE_BLOCKS, 0, 128);
  const processBudgetBlocks = boundedLiveEffectNumber(options.processBudgetBlocks, LIVE_PERFORMANCE_PROCESS_BUDGET_BLOCKS, 0, 128);
  const processTimeoutBlocks = boundedLiveEffectNumber(options.processTimeoutBlocks, LIVE_PERFORMANCE_PROCESS_TIMEOUT_BLOCKS, 0, 128);
  const transitionFadeBlocks = boundedLiveEffectNumber(options.transitionFadeBlocks, LIVE_PERFORMANCE_TRANSITION_FADE_BLOCKS, 0, 8);
  const maxInputAgeMs = boundedLiveEffectNumber(options.maxInputAgeMs, blockDurationMs * maxInputAgeBlocks, 0, 60000);
  const processBudgetMs = boundedLiveEffectNumber(options.processBudgetMs, blockDurationMs * processBudgetBlocks, 0, 60000);
  const processTimeoutMs = boundedLiveEffectNumber(options.processTimeoutMs, blockDurationMs * processTimeoutBlocks, 0, 60000);
  const transitionFadeSamples = boundedLiveEffectInteger(options.transitionFadeSamples, Math.ceil(maxBlockSize * transitionFadeBlocks), 0, 4096);
  const pluginLatencySamples = boundedLatencySamples(options.pluginLatencySamples, 0);
  const transportLatencySamples = boundedLatencySamples(options.transportLatencySamples, 0);
  const reportedLatencySamples = combinedLatencySamples(pluginLatencySamples, transportLatencySamples);
  return {
    sampleRate,
    maxBlockSize,
    blockDurationMs: Number(blockDurationMs.toFixed(3)),
    maxInputAgeMs,
    maxInputAgeBlocks: liveEffectPolicyBlockUnits(maxInputAgeMs, blockDurationMs),
    maxInFlightBlocks: boundedLiveEffectInteger(options.maxInFlightBlocks, 1, 1, 32),
    processBudgetMs,
    processBudgetBlocks: liveEffectPolicyBlockUnits(processBudgetMs, blockDurationMs),
    processTimeoutMs,
    processTimeoutBlocks: liveEffectPolicyBlockUnits(processTimeoutMs, blockDurationMs),
    transitionFadeSamples,
    transitionFadeBlocks: liveEffectPolicyBlockUnits(transitionFadeSamples, maxBlockSize),
    maxConsecutiveProcessBudgetMisses: boundedLiveEffectInteger(options.maxConsecutiveProcessBudgetMisses, LIVE_PERFORMANCE_PROCESS_BUDGET_MISSES, 0, 1024),
    maxConsecutiveRenderBudgetMisses: boundedLiveEffectInteger(options.maxConsecutiveRenderBudgetMisses, 2, 0, 1024),
    processBudgetRecoveryBlocks: boundedLiveEffectInteger(options.processBudgetRecoveryBlocks, LIVE_PERFORMANCE_RECOVERY_BLOCKS, 0, 4096),
    renderBudgetRecoveryBlocks: boundedLiveEffectInteger(options.renderBudgetRecoveryBlocks, LIVE_PERFORMANCE_RECOVERY_BLOCKS, 0, 4096),
    processTimeoutRecoveryBlocks: boundedLiveEffectInteger(options.processTimeoutRecoveryBlocks, LIVE_PERFORMANCE_RECOVERY_BLOCKS, 0, 4096),
    maxProcessTimeoutRecoveries: boundedLiveEffectInteger(options.maxProcessTimeoutRecoveries, LIVE_PERFORMANCE_PROCESS_TIMEOUT_RECOVERIES, 0, 32),
    pluginLatencySamples,
    transportLatencySamples,
    reportedLatencySamples,
    reportedLatencyMs: liveEffectLatencyMilliseconds(reportedLatencySamples, sampleRate)
  };
}

function liveEffectPolicyBlockUnits(value: number, blockValue: number): number {
  return blockValue > 0 ? Number((value / blockValue).toFixed(3)) : 0;
}
