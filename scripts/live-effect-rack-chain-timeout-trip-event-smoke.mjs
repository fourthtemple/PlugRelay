import { createLiveEffectRackChain } from "../packages/web-client/dist/plugrelay-client.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let nowMs = 0;

const passthroughStage = {
  health: { healthy: true, instanceId: "inst-pass" },
  async processBlock(request) {
    return {
      blockId: request.blockId,
      channels: request.channels,
      latencySamples: 0,
      tailSamples: 0,
      infiniteTail: false,
      renderEngine: "chain-timeout-passthrough",
      bypassed: false,
      healthy: true
    };
  }
};
const hangingStage = {
  health: { healthy: true, instanceId: "inst-hang" },
  async processBlock() {
    return new Promise(() => undefined);
  }
};

const chain = createLiveEffectRackChain({
  stages: [passthroughStage, hangingStage],
  outputChannels: 1,
  maxBlockSize: 128,
  processTimeoutMs: 1,
  nowMs: () => nowMs
});
let timeoutEvents = 0;
let timeoutTripEvents = 0;
let timeoutDetail;
let timeoutTripDetail;
let dryOutputDetail;
chain.addEventListener("chain-process-timeout", (event) => {
  timeoutEvents += 1;
  timeoutDetail = event.detail;
});
chain.addEventListener("chain-process-timeout-tripped", (event) => {
  timeoutTripEvents += 1;
  timeoutTripDetail = event.detail;
});
chain.addEventListener("dry-output", (event) => {
  dryOutputDetail = event.detail;
});

const timedOut = await chain.processBlock({ blockId: 1, channels: [[0.5]], sampleRate: 48000 });
assert(timedOut.bypassed === true && timedOut.renderEngine === "chain-process-timeout", "chain returns dry output on aggregate timeout");
assert(timedOut.chainProcessTimedOut === true && timedOut.chainUnhealthyReason === "process-timeout", "chain response records timeout trip state");
assert(timedOut.failedStageIndex === 1 && timedOut.stageResults.length === 2, "chain timeout response identifies the timed-out stage slot");
assert(timedOut.stageResults[0].instanceId === "inst-pass" && timedOut.stageResults[0].healthy === true, "chain timeout response preserves completed stage results");
assert(timedOut.stageResults[1].instanceId === "inst-hang" && timedOut.stageResults[1].healthy === false, "chain timeout response marks the timed-out stage unhealthy");
assert(chain.health.processTimeoutTripped === true && chain.health.healthy === false, "chain health records timeout trip state");
assert(chain.health.failedStageIndex === 1 && chain.health.stageResults[1]?.instanceId === "inst-hang", "chain health records timeout stage attribution");
assert(timeoutEvents === 1 && timeoutTripEvents === 1, "chain emits timeout and timeout-trip events");
assert(timeoutDetail.response === timedOut && timeoutDetail.health.processTimeoutTripped === true, "chain timeout event includes tripped health");
assert(timeoutDetail.response.failedStageIndex === 1, "chain timeout event includes timeout stage attribution");
assert(timeoutTripDetail.response === timedOut, "chain timeout trip event includes timeout response");
assert(timeoutTripDetail.health.processTimeoutTripped === true, "chain timeout trip event includes tripped health");
assert(dryOutputDetail.health.failedStageIndex === 1 && dryOutputDetail.response.failedStageIndex === 1, "chain dry-output event includes timeout stage attribution");
assert(chain.retry() === true && chain.health.failedStageIndex === undefined && chain.health.stageHealthy === true, "chain retry clears timeout stage attribution");

let recoveryNowMs = 0;
let recoveryDurationMs = 3;
const recoveryStage = {
  health: { healthy: true },
  async processBlock(request) {
    recoveryNowMs += recoveryDurationMs;
    return { blockId: request.blockId, channels: request.channels, latencySamples: 0, tailSamples: 0, infiniteTail: false, renderEngine: "chain-timeout-recovery", bypassed: false, healthy: true };
  }
};
const recoveryChain = createLiveEffectRackChain({
  stages: [recoveryStage],
  outputChannels: 1,
  maxBlockSize: 128,
  processTimeoutMs: 2,
  processTimeoutRecoveryBlocks: 2,
  nowMs: () => recoveryNowMs
});
const recoveryTrip = await recoveryChain.processBlock({ blockId: 2, channels: [[0.5]], sampleRate: 48000 });
assert(recoveryTrip.bypassed === true && recoveryChain.health.recoveryDryBlocksRemaining === 2, "chain timeout recovery reports full dry cooldown after trip");
recoveryDurationMs = 0;
await recoveryChain.processBlock({ blockId: 3, channels: [[0.25]], sampleRate: 48000 });
assert(recoveryChain.health.timeoutRecoveryDryBlocks === 1 && recoveryChain.health.recoveryDryBlocksRemaining === 1, "chain timeout recovery reports remaining dry cooldown");
await recoveryChain.processBlock({ blockId: 4, channels: [[0.25]], sampleRate: 48000 });
assert(recoveryChain.health.processTimeoutTripped === false && recoveryChain.health.recoveryDryBlocksRemaining === 0, "chain timeout recovery clears remaining dry cooldown");
assert(recoveryChain.health.failedStageIndex === undefined && recoveryChain.health.stageHealthy === true, "chain timeout recovery clears timeout stage attribution");

console.log("Live effect rack chain timeout trip event smoke checks passed.");
