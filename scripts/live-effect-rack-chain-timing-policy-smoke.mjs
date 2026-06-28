import { createLiveEffectRackChain } from "../packages/web-client/dist/soundbridge-client.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let now = 0;
const stage = {
  async processBlock(request) {
    now += 3;
    return {
      blockId: request.blockId,
      channels: request.channels,
      latencySamples: 0,
      tailSamples: 0,
      infiniteTail: false,
      renderEngine: "chain-timing-policy",
      bypassed: false,
      healthy: true
    };
  }
};

const chain = createLiveEffectRackChain({
  stages: [stage],
  sampleRate: 48000,
  maxBlockSize: 128,
  processBudgetMs: 2,
  processTimeoutMs: 4,
  transitionFadeSamples: 16,
  nowMs: () => now
});

let timingEvents = 0;
let healthEvents = 0;
let lastTimingEvent;
chain.addEventListener("timingpolicychange", (event) => {
  timingEvents += 1;
  lastTimingEvent = event.detail;
});
chain.addEventListener("healthchange", () => {
  healthEvents += 1;
});

const unchanged = chain.setTimingPolicy({ processBudgetMs: 2, processTimeoutMs: 4, transitionFadeSamples: 16 });
assert(unchanged.processBudgetMs === 2 && timingEvents === 0 && healthEvents === 0, "live chain timing policy ignores unchanged values");

const updated = chain.setTimingPolicy({ processBudgetMs: 6, processTimeoutMs: 12, transitionFadeSamples: 32 });
assert(updated.processBudgetMs === 6 && updated.processTimeoutMs === 12, "live chain timing policy updates budget and timeout health");
assert(updated.transitionFadeSamples === 32, "live chain timing policy updates transition fade health");
assert(timingEvents === 1 && healthEvents === 1, "live chain timing policy emits bounded host-visible events");
assert(lastTimingEvent.previous.processTimeoutMs === 4 && lastTimingEvent.health.processTimeoutMs === 12, "live chain timing policy event includes previous and current health");
assert(chain.timing.processBudgetMs === 6 && chain.timing.processTimeoutMs === 12, "live chain timing policy updates timing snapshots");

const response = await chain.processBlock({ blockId: 1, channels: [[0.1, 0.2]], sampleRate: 48000 });
assert(response.chainProcessBudgetMs === 6, "live chain timing policy applies refreshed process budget to future responses");
assert(response.chainProcessTimeoutMs === 12, "live chain timing policy applies refreshed timeout to future responses");
assert(chain.health.lastProcessBudgetMs === 6 && chain.health.processBudgetExceeded === false, "live chain timing policy applies refreshed process budget to future health");

const bounded = chain.setTimingPolicy({ processBudgetMs: -1, processTimeoutMs: 100000, transitionFadeSamples: 100000 });
assert(bounded.processBudgetMs === 0, "live chain timing policy clamps negative process budgets");
assert(bounded.processTimeoutMs === 60000, "live chain timing policy clamps process timeouts");
assert(bounded.transitionFadeSamples === 4096, "live chain timing policy clamps fade samples");

console.log("Live effect rack chain timing policy smoke checks passed.");
