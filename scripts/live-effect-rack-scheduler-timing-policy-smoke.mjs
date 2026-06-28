import { createLiveEffectRackBlockScheduler } from "../packages/web-client/dist/soundbridge-client.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let now = 1100;
const scheduler = createLiveEffectRackBlockScheduler({
  sampleRate: 48000,
  maxBlockSize: 128,
  maxInputAgeMs: 2,
  deadlineLeadTargetBlocks: 2,
  responseJitterThresholdBlocks: 0,
  nowMs: () => now
});

scheduler.updateDeadlinePressureFromHealth({
  lastResponseDeadlineLeadBlocks: 1,
  responseJitterBlocks: 1,
  responseDeadlineMisses: 0
});
assert(scheduler.snapshot().deadlinePressure.pressure === true, "live rack scheduler reports pressure against initial timing policy");

const relaxed = scheduler.setTimingPolicy({
  maxInputAgeMs: 12,
  deadlineLeadTargetBlocks: 0.5,
  responseJitterThresholdBlocks: 2
});
assert(
  relaxed.maxInputAgeMs === 12 &&
    relaxed.deadlineLeadTargetBlocks === 0.5 &&
    relaxed.responseJitterThresholdBlocks === 2 &&
    relaxed.deadlinePressure.pressure === false,
  "live rack scheduler applies relaxed timing policy without recreation"
);

const freshBlock = scheduler.schedule([[0.1]], { timestamp: now - 10 });
assert(freshBlock.stale === false && freshBlock.captureAgeMs === 10, "live rack scheduler uses refreshed stale-input timing on future blocks");

const bounded = scheduler.setTimingPolicy({
  maxInputAgeMs: 100000,
  deadlineLeadTargetBlocks: -1,
  responseJitterThresholdBlocks: 100000
});
assert(
  bounded.maxInputAgeMs === 60000 &&
    bounded.deadlineLeadTargetBlocks === 0 &&
    bounded.responseJitterThresholdBlocks === 64,
  "live rack scheduler clamps refreshed timing policy"
);

const unchanged = scheduler.setTimingPolicy({});
assert(
  unchanged.maxInputAgeMs === 60000 &&
    unchanged.deadlineLeadTargetBlocks === 0 &&
    unchanged.responseJitterThresholdBlocks === 64,
  "live rack scheduler keeps timing policy values when no updates are provided"
);

console.log("Live effect rack scheduler timing policy smoke checks passed.");
