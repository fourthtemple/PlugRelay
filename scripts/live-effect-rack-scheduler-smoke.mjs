import { createLiveEffectRackBlockScheduler } from "../packages/web-client/dist/soundbridge-client.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

let now = 1000;
const scheduler = createLiveEffectRackBlockScheduler({
  sampleRate: 48000,
  maxBlockSize: 128,
  startBlockId: 10,
  startSamplePosition: 1280,
  transportLatencySamples: 256,
  maxInputAgeMs: 6,
  transport: {
    tempo: 128,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4
  },
  nowMs: () => now
});

const first = scheduler.schedule([[1, 0]]);
assert(first.request.blockId === 10, "live rack scheduler starts from the configured block id");
assert(first.samplePosition === 1280, "live rack scheduler starts from the configured sample position");
assert(first.request.timestamp === 1000 && first.captureAgeMs === 0, "live rack scheduler stamps fresh captures");
assert(first.transport.samplePosition === 1536, "live rack scheduler compensates transport latency");
assert(first.transport.tempo === 128, "live rack scheduler carries base transport metadata");
assert(first.stale === false, "live rack scheduler marks fresh captures as live");

now = 1002;
const second = scheduler.schedule([[0.5]], {
  wetMix: 0.25,
  transportOptions: { playing: false, tempo: 96 }
});
assert(second.request.blockId === 11, "live rack scheduler advances block ids");
assert(second.samplePosition === 1408, "live rack scheduler advances sample positions");
assert(second.request.wetMix === 0.25, "live rack scheduler preserves per-block wet mix");
assert(second.transport.playing === false && second.transport.tempo === 96, "live rack scheduler applies per-block transport overrides");
assert(second.transport.samplePosition === 1664, "live rack scheduler keeps latency compensation after advancing");

scheduler.updateFromRackHealth({ transportLatencySamples: 512 });
now = 1010;
const stale = scheduler.schedule([[0.25]], { timestamp: 1000 });
assert(stale.stale === true && stale.captureAgeMs === 10, "live rack scheduler detects stale captured audio");
assert(stale.transport.samplePosition === 2048, "live rack scheduler uses updated rack transport latency");

const explicitTransport = { playing: false, samplePosition: 7 };
const explicit = scheduler.schedule([[0.1]], { transport: explicitTransport, timestamp: now });
assert(explicit.transport === explicitTransport, "live rack scheduler preserves explicit host transport");
assert(explicit.request.transport === explicitTransport, "live rack scheduler passes explicit transport into the request");

scheduler.reset({ nextBlockId: 4, nextSamplePosition: 512 });
const reset = scheduler.schedule([[0.2]]);
assert(reset.blockId === 4 && reset.samplePosition === 512, "live rack scheduler reset sets the next block position");
assert(scheduler.snapshot().nextBlockId === 5, "live rack scheduler snapshot reports the next block id");
assert(scheduler.snapshot().transportLatencySamples === 512, "live rack scheduler snapshot reports current latency compensation");

console.log("Live effect rack scheduler smoke checks passed.");
