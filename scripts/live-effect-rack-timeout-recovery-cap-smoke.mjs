import {
  createLiveEffectRackChain,
  createLiveEffectRackFrameBatchProcessor,
  createLivePerformanceFrameBatchProcessorOptions,
  createLivePerformanceRackChainOptions
} from "../packages/web-client/dist/plugrelay-client.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let chainNow = 0;
let chainDurationMs = 3;
const stage = {
  health: { healthy: true },
  async processBlock(request) {
    chainNow += chainDurationMs;
    return {
      blockId: request.blockId,
      channels: request.channels,
      latencySamples: 0,
      tailSamples: 0,
      infiniteTail: false,
      renderEngine: "timeout-cap-stage",
      bypassed: false,
      healthy: true
    };
  }
};

const chain = createLiveEffectRackChain({
  stages: [stage],
  outputChannels: 1,
  maxBlockSize: 128,
  processTimeoutMs: 2,
  processTimeoutRecoveryBlocks: 1,
  maxProcessTimeoutRecoveries: 1,
  nowMs: () => chainNow
});
let chainRecovered = 0;
let chainExhausted = 0;
chain.addEventListener("chain-process-timeout-recovered", () => {
  chainRecovered += 1;
});
chain.addEventListener("chain-process-timeout-recovery-exhausted", (event) => {
  chainExhausted += 1;
  assert(event.detail.health.processTimeoutRecoveryExhausted === true, "chain exhaustion event includes exhausted health");
});

await chain.processBlock({ blockId: 1, channels: [[1]], sampleRate: 48000 });
assert(chain.health.processTimeoutTripped === true && chain.health.recoveryDryBlocksRemaining === 1, "chain reports recoverable timeout cooldown");
chainDurationMs = 0;
await chain.processBlock({ blockId: 2, channels: [[0]], sampleRate: 48000 });
assert(chainRecovered === 1 && chain.health.processTimeoutRecoveryAttempts === 1, "chain recovers once after dry timeout cooldown");
chainDurationMs = 3;
await chain.processBlock({ blockId: 3, channels: [[1]], sampleRate: 48000 });
assert(chainExhausted === 1 && chain.health.processTimeoutRecoveryExhausted === true, "chain exhausts automatic timeout recovery at the cap");
await chain.processBlock({ blockId: 4, channels: [[0]], sampleRate: 48000 });
assert(chainExhausted === 1 && chain.health.recoveryDryBlocksRemaining === 0, "chain keeps exhausted timeout recovery dry without repeating events");
assert(chain.retry() === true && chain.health.processTimeoutRecoveryAttempts === 0, "chain manual retry clears exhausted timeout recovery state");

const chainPerformanceOptions = createLivePerformanceRackChainOptions({
  stages: [stage],
  sampleRate: 48000,
  maxBlockSize: 128
});
assert(chainPerformanceOptions.maxProcessTimeoutRecoveries === 1, "live chain preset caps automatic timeout recovery attempts");

let batchBlockId = 0;
const scheduler = {
  captureFrame() {
    return { blockId: ++batchBlockId, samplePosition: batchBlockId * 128, timestamp: 0, stale: false, deadlinePressure: { pressure: false, reasons: [], responseJitterBlocks: 0, responseDeadlineMisses: 0, responseDeadlineMissesSinceLastUpdate: 0, transportLatencySamples: 0, transportLatencyBlocks: 0 } };
  },
  scheduleFromFrame(frame, channels) {
    return { blockId: frame.blockId, stale: false, request: { blockId: frame.blockId, channels, sampleRate: 48000 } };
  }
};
const hangingTarget = {
  health: { healthy: true },
  async processScheduledBlock() {
    return new Promise(() => undefined);
  }
};
const batch = createLiveEffectRackFrameBatchProcessor({
  scheduler,
  processTimeoutMs: 1,
  processTimeoutRecoveryBlocks: 1,
  maxProcessTimeoutRecoveries: 1
});
let batchRecovered = 0;
let batchExhausted = 0;
batch.addEventListener("frame-batch-process-timeout-recovered", () => {
  batchRecovered += 1;
});
batch.addEventListener("frame-batch-process-timeout-recovery-exhausted", (event) => {
  batchExhausted += 1;
  assert(event.detail.health.processTimeoutRecoveryExhausted === true, "frame batch exhaustion event includes exhausted health");
});

await batch.process([{ id: "deck-a", target: hangingTarget, channels: [[1, 0]] }]);
assert(batch.health.processTimeoutTripped === true && batch.health.recoveryDryBlocksRemaining === 1, "frame batch reports recoverable timeout cooldown");
await batch.process([{ id: "deck-a", target: hangingTarget, channels: [[0, 1]] }]);
assert(batchRecovered === 1 && batch.health.processTimeoutRecoveryAttempts === 1, "frame batch recovers once after dry timeout cooldown");
await batch.process([{ id: "deck-a", target: hangingTarget, channels: [[1, 0]] }]);
assert(batchExhausted === 1 && batch.health.processTimeoutRecoveryExhausted === true, "frame batch exhausts automatic timeout recovery at the cap");
await batch.process([{ id: "deck-a", target: hangingTarget, channels: [[0, 1]] }]);
assert(batchExhausted === 1 && batch.health.recoveryDryBlocksRemaining === 0, "frame batch keeps exhausted timeout recovery dry without repeating events");
assert(batch.retry() === true && batch.health.processTimeoutRecoveryAttempts === 0, "frame batch manual retry clears exhausted timeout recovery state");

const batchPerformanceOptions = createLivePerformanceFrameBatchProcessorOptions({
  scheduler,
  sampleRate: 48000,
  maxBlockSize: 128
});
assert(batchPerformanceOptions.maxProcessTimeoutRecoveries === 1, "live frame batch preset caps automatic timeout recovery attempts");

console.log("Live effect rack timeout recovery cap smoke checks passed.");
