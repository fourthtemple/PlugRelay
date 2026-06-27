import { liveTransportForBlock } from "../packages/web-client/dist/soundbridge-client.js";

const compensated = liveTransportForBlock({
  sampleRate: 48000,
  maxBlockSize: 128,
  blockId: 10,
  reportedLatencySamples: 256,
  compensateOutputLatency: true,
  tempo: 128,
  timeSignatureNumerator: 4,
  timeSignatureDenominator: 4,
  cycleStartMusic: 16,
  cycleEndMusic: 8
});

assert(compensated.playing === true, "live transport defaults to playing for realtime blocks");
assert(compensated.samplePosition === 1536, "live transport derives latency-compensated block sample positions");
assert(compensated.tempo === 128 && compensated.timeSignatureDenominator === 4, "live transport preserves bounded tempo and meter");
assert(compensated.projectTimeMusic === 0.068267, "live transport derives musical position from sample position and tempo");
assert(compensated.barPositionMusic === 0, "live transport derives the current bar start");
assert(compensated.loopActive === true && compensated.cycleStartMusic === 16 && compensated.cycleEndMusic === 16, "live transport emits valid loop ranges");

const clamped = liveTransportForBlock({
  sampleRate: 0,
  maxBlockSize: 999999,
  blockId: 1e20,
  playing: false,
  recording: true,
  tempo: 5000,
  timeSignatureNumerator: 999,
  timeSignatureDenominator: 3,
  projectTimeMusic: -5,
  barPositionMusic: 1e12,
  cycleStartMusic: 12
});

assert(clamped.playing === false && clamped.recording === true, "live transport preserves explicit playback flags");
assert(clamped.samplePosition === 9007199254732800, "live transport clamps block-derived sample positions");
assert(clamped.tempo === 960 && clamped.timeSignatureNumerator === 64 && clamped.timeSignatureDenominator === 4, "live transport clamps tempo and meter");
assert(clamped.projectTimeMusic === 0 && clamped.barPositionMusic === 1000000000, "live transport clamps musical positions");
assert(clamped.loopActive === true && clamped.cycleStartMusic === 12 && clamped.cycleEndMusic === 12, "live transport fills partial loop ranges safely");

const direct = liveTransportForBlock({
  sampleRate: 44100,
  maxBlockSize: 512,
  samplePosition: 2048,
  tempo: 120,
  projectTimeMusicAtSampleZero: 4
});
assert(direct.samplePosition === 2048 && direct.projectTimeMusic === 4.09288, "live transport can derive musical position from explicit sample positions");

console.log("Live transport smoke checks passed.");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
