import { PlugRelayLiveEffectRack } from "../packages/web-client/dist/plugrelay-client.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const plugin = {
  pluginId: "mock.live-rack-deadline-event",
  format: "mock",
  inputs: 1,
  outputs: 1
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const client = {
  delayMs: 0,
  async createInstance() {
    return { instanceId: "inst-deadline-event", latencySamples: 0 };
  },
  async destroyInstance() {},
  async processAudioBlockBinary(request) {
    if (this.delayMs > 0) {
      await sleep(this.delayMs);
    }
    return {
      blockId: request.blockId,
      channels: request.channels,
      latencySamples: 0,
      tailSamples: 0,
      infiniteTail: false,
      renderEngine: "deadline-event",
      bypassed: false,
      healthy: true
    };
  }
};

const rack = await PlugRelayLiveEffectRack.create({
  client,
  plugin,
  sampleRate: 48000,
  maxBlockSize: 128,
  processBudgetMs: 1,
  maxConsecutiveProcessBudgetMisses: 0
});
let deadlineEvents = 0;
let deadlineDetail;
rack.addEventListener("response-deadline-missed", (event) => {
  deadlineEvents += 1;
  deadlineDetail = event.detail;
});
client.delayMs = 5;
const response = await rack.processBlock({ blockId: 1, channels: [[0.5]] });
assert(response.bypassed === false && rack.health.healthy === true, "deadline miss observation does not fail dry by itself");
assert(deadlineEvents === 1, "live rack emits one response deadline miss event");
assert(deadlineDetail.durationMs > deadlineDetail.budgetMs, "deadline miss event includes measured duration and budget");
assert(deadlineDetail.leadMs < 0 && deadlineDetail.leadBlocks < 0, "deadline miss event reports negative deadline lead");
assert(deadlineDetail.health.responseDeadlineMisses === 1, "deadline miss event includes updated health counters");
assert(rack.health.responseDeadlineMisses === 1, "live rack health keeps the deadline miss counter");
await rack.destroy();

console.log("Live effect rack deadline event smoke checks passed.");
