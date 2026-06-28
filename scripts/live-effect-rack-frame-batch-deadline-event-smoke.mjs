import {
  createLiveEffectRackBlockScheduler,
  createLiveEffectRackFrameBatchProcessor
} from "../packages/web-client/dist/soundbridge-client.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let nowMs = 0;

class TimedTarget {
  constructor(durationMs) {
    this.durationMs = durationMs;
    this.health = { healthy: true };
  }

  async processScheduledBlock(scheduled) {
    nowMs += this.durationMs;
    return {
      blockId: scheduled.blockId,
      channels: scheduled.request.channels,
      latencySamples: 0,
      tailSamples: 0,
      infiniteTail: false,
      renderEngine: "frame-batch-deadline-event-target",
      bypassed: false,
      healthy: true
    };
  }
}

const scheduler = createLiveEffectRackBlockScheduler({
  sampleRate: 48000,
  maxBlockSize: 128,
  nowMs: () => nowMs
});
const processor = createLiveEffectRackFrameBatchProcessor({
  scheduler,
  sampleRate: 48000,
  maxBlockSize: 128,
  processBudgetMs: 2,
  maxConsecutiveProcessBudgetMisses: 0,
  nowMs: () => nowMs
});
const target = new TimedTarget(3);
let deadlineEvents = 0;
let deadlineDetail;
processor.addEventListener("frame-batch-response-deadline-missed", (event) => {
  deadlineEvents += 1;
  deadlineDetail = event.detail;
});
const missed = await processor.process([{ id: "deck-a", target, channels: [[0.5]] }]);
assert(missed.healthy === true && missed.processBudgetTripped === false, "frame-batch deadline observation does not trip by itself");
assert(deadlineEvents === 1, "live frame batch emits one deadline miss event");
assert(deadlineDetail.durationMs === 3 && deadlineDetail.budgetMs === 2, "frame-batch deadline event includes aggregate duration and budget");
assert(deadlineDetail.leadMs === -1 && deadlineDetail.leadBlocks < 0, "frame-batch deadline event reports negative deadline lead");
assert(deadlineDetail.health.responseDeadlineMisses === 1, "frame-batch deadline event includes updated health counters");

target.durationMs = 1;
const recovered = await processor.process([{ id: "deck-a", target, channels: [[0.25]] }]);
assert(recovered.healthy === true, "frame batch keeps processing after an observed deadline miss");
assert(deadlineEvents === 1, "frame batch does not emit deadline events for in-budget frames");
assert(processor.health.responseDeadlineMisses === 1, "frame-batch deadline miss counter is retained for scheduler calibration");

console.log("Live effect rack frame-batch deadline event smoke checks passed.");

await import("./live-effect-rack-frame-batch-dry-output-event-smoke.mjs");
