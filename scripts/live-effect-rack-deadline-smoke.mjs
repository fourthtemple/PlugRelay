import {
  SoundBridgeLiveEffectRack,
  calibrateLiveEffectRackPolicy
} from "../packages/web-client/dist/soundbridge-client.js";

const plugin = {
  pluginId: "mock.live-deadline",
  format: "mock",
  name: "Live Deadline",
  kind: "effect",
  inputs: 2,
  outputs: 2,
  parameters: []
};

class FakeDeadlineClient {
  delayMs = 0;
  created = 0;

  async createInstance(request) {
    this.created += 1;
    return {
      instanceId: `inst-deadline-${this.created}`,
      plugin,
      layout: { inputChannels: request.inputChannels, outputChannels: request.outputChannels },
      latencySamples: 0,
      tailSamples: 0,
      infiniteTail: false
    };
  }

  async destroyInstance() {
    return { destroyed: true };
  }

  async processAudioBlock(request) {
    if (this.delayMs > 0) {
      await delay(this.delayMs);
    }
    return {
      blockId: request.blockId,
      channels: request.channels.map((channel) => Array.from(channel)),
      latencySamples: 0,
      tailSamples: 0,
      infiniteTail: false,
      renderDurationMs: this.delayMs,
      renderBudgetMs: 10,
      renderBudgetExceeded: this.delayMs > 10,
      renderEngine: "deadline-fixture"
    };
  }

  async processAudioBlockBinary(request) {
    return this.processAudioBlock(request);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const client = new FakeDeadlineClient();
const rack = await SoundBridgeLiveEffectRack.create({
  client,
  plugin,
  sampleRate: 48000,
  maxBlockSize: 128,
  inputChannels: 2,
  outputChannels: 2,
  processBudgetMs: 10
});

assert(rack.health.responseDeadlineMisses === 0, "live rack starts without response deadline misses");
assert(rack.health.responseJitterBlocks === 0, "live rack starts without measured response jitter");

const channels = [Array(128).fill(0.25), Array(128).fill(-0.25)];
await rack.processBlock({ blockId: 1, channels });
const fast = rack.health;
assert(fast.lastResponseDeadlineLeadMs > 0, "live rack records positive deadline lead for in-budget blocks");
assert(fast.lastResponseDeadlineLeadBlocks > 0, "live rack exposes deadline lead in block units");
assert(fast.responseDeadlineMisses === 0, "in-budget blocks do not count as deadline misses");

client.delayMs = 25;
await rack.processBlock({ blockId: 2, channels });
const slow = rack.health;
assert(slow.processBudgetExceeded === true, "slow live rack block still reports process budget pressure");
assert(slow.lastResponseDeadlineLeadMs < 0, "slow live rack block records negative deadline lead");
assert(slow.lastResponseDeadlineLeadBlocks < 0, "slow live rack block exposes missed deadline in block units");
assert(slow.responseDeadlineMisses === 1, "slow live rack block increments deadline misses");
assert(slow.responseJitterBlocks > 0, "live rack derives response jitter from deadline lead range");

const calibration = calibrateLiveEffectRackPolicy({
  sampleRate: 48000,
  maxBlockSize: 128,
  processDurationsMs: [fast.lastProcessDurationMs, slow.lastProcessDurationMs],
  responseJitterBlocks: [slow.responseJitterBlocks],
  deadlineLeadBlocks: [slow.lastResponseDeadlineLeadBlocks],
  safetyMarginBlocks: 0
});
assert(calibration.realtimeReady === false, "live rack deadline telemetry feeds calibration readiness");
assert(calibration.warnings.includes("deadline-miss"), "live rack deadline telemetry feeds deadline warnings");
assert(calibration.warnings.includes("increase-transport-latency"), "live rack jitter telemetry feeds latency recommendations");

await rack.recreate();
assert(rack.health.responseDeadlineMisses === 0, "live rack resets deadline misses after recreate");
assert(rack.health.responseJitterBlocks === 0, "live rack resets response jitter after recreate");
assert(rack.health.lastResponseDeadlineLeadMs === undefined, "live rack clears last deadline lead after recreate");

console.log("Live effect rack deadline smoke checks passed.");
