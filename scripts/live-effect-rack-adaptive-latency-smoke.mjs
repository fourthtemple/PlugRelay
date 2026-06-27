import { createLiveEffectRackAdaptiveLatencyController } from "../packages/web-client/dist/soundbridge-client.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

class FakeRack {
  constructor() {
    this.health = { transportLatencySamples: 256 };
    this.refreshes = [];
  }

  async refreshLatency(transportLatencySamples) {
    this.refreshes.push(transportLatencySamples);
    this.health = { ...this.health, transportLatencySamples };
    return this.health;
  }
}

const rack = new FakeRack();
const controller = createLiveEffectRackAdaptiveLatencyController({
  rack,
  sampleRate: 48000,
  maxBlockSize: 128,
  transportLatencySamples: 256,
  processBudgetMs: 8,
  processTimeoutMs: 12,
  minSamples: 2,
  cooldownBlocks: 2,
  maxLatencyIncreaseBlocks: 2,
  safetyMarginBlocks: 1
});

const ready = await controller.record({
  ...rack.health,
  lastProcessDurationMs: 0.5,
  lastRenderDurationMs: 0.4,
  responseJitterBlocks: 0.25,
  lastResponseDeadlineLeadBlocks: 1
});
assert(ready.applied === false, "adaptive rack latency waits for enough health samples");
assert(ready.currentTransportLatencySamples === 256, "adaptive rack latency reports current transport latency");
assert(ready.targetTransportLatencySamples === 256, "adaptive rack latency keeps in-budget latency unchanged");

const firstRaise = await controller.record({
  ...rack.health,
  lastProcessDurationMs: 0.6,
  lastRenderDurationMs: 0.4,
  responseJitterBlocks: 4,
  lastResponseDeadlineLeadBlocks: -1
});
assert(firstRaise.applied === true, "adaptive rack latency applies upward recommendations under jitter pressure");
assert(firstRaise.targetTransportLatencySamples === 512, "adaptive rack latency caps one increase to the configured step");
assert(firstRaise.cooldownBlocksRemaining === 2, "adaptive rack latency starts a bounded cooldown after applying");
assert(rack.refreshes.length === 1 && rack.refreshes[0] === 512, "adaptive rack latency refreshes the rack with the capped target");
assert(firstRaise.refreshResult.transportLatencySamples === 512, "adaptive rack latency returns the refresh result");

const cooldown = await controller.record({
  ...rack.health,
  lastProcessDurationMs: 0.6,
  lastRenderDurationMs: 0.4,
  responseJitterBlocks: 4,
  lastResponseDeadlineLeadBlocks: -1
});
assert(cooldown.applied === false, "adaptive rack latency observes cooldown between increases");
assert(cooldown.cooldownBlocksRemaining === 1, "adaptive rack latency counts cooldown in recorded blocks");
assert(rack.refreshes.length === 1, "adaptive rack latency does not refresh while cooling down");

const secondRaise = await controller.record({
  ...rack.health,
  lastProcessDurationMs: 0.6,
  lastRenderDurationMs: 0.4,
  responseJitterBlocks: 4,
  lastResponseDeadlineLeadBlocks: -1
});
assert(secondRaise.applied === true, "adaptive rack latency can apply again after cooldown");
assert(secondRaise.targetTransportLatencySamples === 768, "adaptive rack latency advances by one bounded step after cooldown");
assert(rack.refreshes.length === 2 && rack.refreshes[1] === 768, "adaptive rack latency refreshes with the next bounded target");

controller.reset();
const afterReset = await controller.record({
  ...rack.health,
  lastProcessDurationMs: 0.6,
  lastRenderDurationMs: 0.4,
  responseJitterBlocks: 4,
  lastResponseDeadlineLeadBlocks: -1
});
assert(afterReset.applied === false, "adaptive rack latency reset clears sample and cooldown state");

console.log("Live effect rack adaptive latency smoke checks passed.");
