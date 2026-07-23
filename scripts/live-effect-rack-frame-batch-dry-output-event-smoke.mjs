import {
  createLiveEffectRackBlockScheduler,
  createLiveEffectRackFrameBatchProcessor
} from "../packages/web-client/dist/plugrelay-client.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let nowMs = 0;

function target(renderEngine, bypassed = false) {
  return {
    health: { healthy: true },
    async processScheduledBlock(scheduled) {
      return {
        blockId: scheduled.blockId,
        channels: scheduled.request.channels,
        latencySamples: bypassed ? 0 : 32,
        tailSamples: 0,
        infiniteTail: false,
        renderEngine,
        bypassed,
        healthy: true
      };
    }
  };
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
  nowMs: () => nowMs
});
const dryEvents = [];
processor.addEventListener("frame-batch-dry-output", (event) => {
  dryEvents.push(event.detail);
});

const mixed = await processor.process([
  { id: "deck-a", target: target("wet-deck"), channels: [[0.5]] },
  { id: "send-a", target: target("dry-bypass", true), channels: [[0.25]] }
]);
assert(mixed.dryTargets === 1 && mixed.bypassedTargets === 1 && mixed.healthy === true, "frame batch records intentional dry targets");
assert(dryEvents.length === 1 && dryEvents[0].result === mixed, "frame batch emits a dry-output event for dry target frames");
assert(dryEvents[0].health.dryTargets === 1 && dryEvents[0].health.bypassedTargets === 1, "frame batch dry-output events include aggregate health");
assert(dryEvents[0].reason === "frame-batch-bypass", "frame batch dry-output events classify intentional bypass");

await processor.process([{ id: "deck-b", target: target("wet-deck-b"), channels: [[0.75]] }]);
assert(dryEvents.length === 1, "frame batch does not emit dry-output events for fully wet frames");

scheduler.updateDeadlinePressureFromHealth({ lastResponseDeadlineLeadBlocks: -1, responseDeadlineMisses: 1, responseJitterBlocks: 0 });
const skipped = await processor.process(
  [{ id: "deck-c", target: target("should-not-run"), channels: [[0.1]] }],
  { skipOnDeadlinePressure: true, skipOnDeadlinePressureReasons: ["deadline-miss"] }
);
assert(skipped.skippedTargets === 1 && skipped.dryTargets === 1, "frame batch records scheduler dry skips");
assert(dryEvents.length === 2, "frame batch emits dry-output for scheduler dry skips");
assert(
  dryEvents[1].result === skipped &&
    dryEvents[1].reason === "frame-batch-deadline-pressure" &&
    dryEvents[1].deadlinePressure?.reasons.includes("deadline-miss") &&
    dryEvents[1].health.skippedTargets === 1,
  "frame batch dry-output events include scheduler pressure details"
);

console.log("Live effect rack frame-batch dry-output event smoke checks passed.");
