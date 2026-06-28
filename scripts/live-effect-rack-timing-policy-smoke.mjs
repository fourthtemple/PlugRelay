import { SoundBridgeLiveEffectRack } from "../packages/web-client/dist/soundbridge-client.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const plugin = {
  pluginId: "mock.live-effect-timing-policy",
  format: "mock",
  name: "Live Timing Policy",
  kind: "effect",
  inputs: 2,
  outputs: 2,
  parameters: []
};

class FakeTimingPolicyClient {
  timeouts = [];
  processed = [];

  async createInstance(request) {
    return {
      instanceId: "inst-live-timing-policy",
      plugin,
      layout: {
        requestedInputChannels: request.inputChannels,
        requestedOutputChannels: request.outputChannels,
        inputChannels: request.inputChannels,
        outputChannels: request.outputChannels,
        inputBuses: 1,
        outputBuses: 1,
        inputBusLayouts: [],
        outputBusLayouts: [],
        sampleRate: request.sampleRate,
        maxBlockSize: request.maxBlockSize
      },
      latencySamples: 0,
      tailSamples: 0,
      infiniteTail: false
    };
  }

  async processAudioBlockBinary(request, timeoutMs) {
    this.processed.push(request);
    this.timeouts.push(timeoutMs);
    return {
      blockId: request.blockId,
      channels: request.channels,
      latencySamples: 0,
      tailSamples: 0,
      infiniteTail: false,
      renderDurationMs: 0.25,
      renderBudgetMs: 1,
      renderBudgetExceeded: false,
      renderEngine: "timing-policy"
    };
  }

  async destroyInstance() {
    return { destroyed: true };
  }
}

const client = new FakeTimingPolicyClient();
const rack = await SoundBridgeLiveEffectRack.create({
  client,
  plugin,
  sampleRate: 48000,
  maxBlockSize: 128,
  processBudgetMs: 2,
  processTimeoutMs: 4,
  maxInputAgeMs: 8,
  transitionFadeSamples: 16
});

let timingEvents = 0;
let lastTimingEvent;
let healthEvents = 0;
rack.addEventListener("timingpolicychange", (event) => {
  timingEvents += 1;
  lastTimingEvent = event.detail;
});
rack.addEventListener("healthchange", () => {
  healthEvents += 1;
});

const unchanged = rack.setTimingPolicy({ processBudgetMs: 2, processTimeoutMs: 4, maxInputAgeMs: 8, transitionFadeSamples: 16 });
assert(unchanged.processBudgetMs === 2 && timingEvents === 0 && healthEvents === 0, "live rack timing policy ignores unchanged values");

const updated = rack.setTimingPolicy({ processBudgetMs: 6, processTimeoutMs: 12, maxInputAgeMs: 16, transitionFadeSamples: 32 });
assert(updated.processBudgetMs === 6 && updated.processTimeoutMs === 12, "live rack timing policy updates budget and timeout health");
assert(updated.maxInputAgeMs === 16 && updated.transitionFadeSamples === 32, "live rack timing policy updates freshness and fade health");
assert(timingEvents === 1 && healthEvents === 1, "live rack timing policy emits bounded host-visible events");
assert(lastTimingEvent.previous.processTimeoutMs === 4 && lastTimingEvent.health.processTimeoutMs === 12, "live rack timing policy event includes previous and current health");
assert(rack.timing.processBudgetMs === 6 && rack.timing.processTimeoutMs === 12, "live rack timing policy updates timing snapshots");

await rack.processBlock({ blockId: 1, channels: [[0.1, 0.2], [0.3, 0.4]], sampleRate: 48000 });
assert(client.timeouts.at(-1) === 12, "live rack timing policy applies refreshed request timeout to future blocks");
assert(client.processed.at(-1).renderTimeoutMs === 12, "live rack timing policy applies refreshed render deadline to future blocks");
assert(rack.health.lastProcessBudgetMs === 6, "live rack timing policy applies refreshed process budget to future measurements");

const bounded = rack.setTimingPolicy({ processBudgetMs: -1, processTimeoutMs: 100000, maxInputAgeMs: 100000, transitionFadeSamples: 100000 });
assert(bounded.processBudgetMs === 0, "live rack timing policy clamps negative process budgets");
assert(bounded.processTimeoutMs === 60000 && bounded.maxInputAgeMs === 60000, "live rack timing policy clamps timing values");
assert(bounded.transitionFadeSamples === 4096, "live rack timing policy clamps fade samples");

await rack.destroy();

console.log("Live effect rack timing policy smoke checks passed.");
