import {
  createLiveEffectRackBlockScheduler,
  createLiveEffectRackChain
} from "../packages/web-client/dist/soundbridge-client.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

class FakeStage {
  constructor(name, gain, latencySamples = 0, tailSamples = 0) {
    this.name = name;
    this.gain = gain;
    this.latencySamples = latencySamples;
    this.tailSamples = tailSamples;
    this.requests = [];
    this.health = { instanceId: `inst-${name}` };
  }

  async processBlock(request) {
    this.requests.push(request);
    return {
      blockId: request.blockId,
      channels: request.channels.map((channel) => Array.from(channel, (sample) => sample * this.gain)),
      latencySamples: this.latencySamples,
      tailSamples: this.tailSamples,
      infiniteTail: false,
      renderEngine: `stage-${this.name}`,
      bypassed: false,
      healthy: true
    };
  }
}

const left = new FakeStage("left", 2, 12, 3);
const right = new FakeStage("right", 0.5, 5, 7);
const chain = createLiveEffectRackChain({
  stages: [left, right],
  outputChannels: 2,
  maxBlockSize: 4
});

const response = await chain.processBlock(
  {
    blockId: 4,
    channels: [[1, 2, 3, 4], [0.5, 1, 1.5, 2]],
    sampleRate: 48000,
    timestamp: 10
  },
  { stageWetMixes: [0.25, 0.75] }
);

assert(response.channels[0][0] === 1 && response.channels[1][3] === 2, "live rack chain pipes stage output into later stages");
assert(response.latencySamples === 17 && response.tailSamples === 10, "live rack chain accumulates bounded latency and tail");
assert(response.stageCount === 2 && response.processedStages === 2, "live rack chain reports processed stages");
assert(response.stageResults[0].instanceId === "inst-left", "live rack chain reports stage instance ids");
assert(left.requests[0].wetMix === 0.25 && right.requests[0].wetMix === 0.75, "live rack chain applies per-stage wet mix overrides");

const scheduler = createLiveEffectRackBlockScheduler({
  sampleRate: 48000,
  maxBlockSize: 4,
  maxInputAgeMs: 1,
  nowMs: () => 20
});
const staleScheduled = scheduler.schedule([[0.2, 0.1]], { timestamp: 10 });
const staleResponse = await chain.processScheduledBlock(staleScheduled);
assert(staleResponse.bypassed === true, "live rack chain bypasses stale scheduled blocks");
assert(staleResponse.processedStages === 0 && left.requests.length === 1, "live rack chain does not process stale scheduled blocks");
assert(staleResponse.renderEngine === "chain-stale-input", "live rack chain labels stale scheduled bypasses");

const throwingStage = {
  health: { instanceId: "inst-throw" },
  async processBlock() {
    throw new Error("stage failed");
  }
};
const failingChain = createLiveEffectRackChain({ stages: [left, throwingStage, right], outputChannels: 2, maxBlockSize: 4 });
const failed = await failingChain.processBlock({ blockId: 9, channels: [[1, 1], [2, 2]], sampleRate: 48000 });
assert(failed.healthy === false && failed.failedStageIndex === 1, "live rack chain reports the failing stage");
assert(failed.processedStages === 2 && failed.stageResults[1].healthy === false, "live rack chain records the failed stage result");
assert(failed.channels[0][0] === 2 && failed.channels[1][0] === 4, "live rack chain fails dry to last known audio");

const empty = await createLiveEffectRackChain({ stages: [], outputChannels: 2, maxBlockSize: 4 })
  .processBlock({ blockId: 1, channels: [[0.4, 0.3]], sampleRate: 48000 });
assert(empty.bypassed === true && empty.renderEngine === "chain-empty", "live rack chain bypasses empty chains");
assert(empty.channels.length === 2, "live rack chain bounds empty-chain output channels");

console.log("Live effect rack chain smoke checks passed.");
