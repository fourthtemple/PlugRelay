import type { HostTransportState } from "../../protocol/src/messages";
import { boundedLiveEffectInteger, boundedLiveEffectNumber } from "./live-effect-rack-metrics";

const MAX_TRANSPORT_SAMPLE_POSITION = 9_007_199_254_740_991;
const MAX_TRANSPORT_MUSIC = 1_000_000_000;
const DENOMINATORS = [1, 2, 4, 8, 16, 32, 64] as const;

export interface LiveTransportBlockOptions {
  sampleRate: number;
  maxBlockSize: number;
  blockId?: number;
  samplePosition?: number;
  reportedLatencySamples?: number;
  compensateOutputLatency?: boolean;
  playing?: boolean;
  recording?: boolean;
  loopActive?: boolean;
  tempo?: number;
  timeSignatureNumerator?: number;
  timeSignatureDenominator?: number;
  projectTimeMusic?: number;
  projectTimeMusicAtSampleZero?: number;
  barPositionMusic?: number;
  cycleStartMusic?: number;
  cycleEndMusic?: number;
}

export function liveTransportForBlock(options: LiveTransportBlockOptions): HostTransportState {
  const sampleRate = boundedLiveEffectInteger(options.sampleRate, 48000, 1, 384000);
  const maxBlockSize = boundedLiveEffectInteger(options.maxBlockSize, 128, 1, 8192);
  const maxBlockId = Math.floor(MAX_TRANSPORT_SAMPLE_POSITION / maxBlockSize);
  const blockId = boundedLiveEffectInteger(options.blockId, 0, 0, maxBlockId);
  const baseSamplePosition = options.samplePosition === undefined ? blockId * maxBlockSize : boundedLiveEffectInteger(options.samplePosition, 0, 0, MAX_TRANSPORT_SAMPLE_POSITION);
  const latencySamples = options.compensateOutputLatency === true ? boundedLiveEffectInteger(options.reportedLatencySamples, 0, 0, MAX_TRANSPORT_SAMPLE_POSITION) : 0;
  const samplePosition = Math.min(MAX_TRANSPORT_SAMPLE_POSITION, baseSamplePosition + latencySamples);
  const transport: HostTransportState = { playing: options.playing !== false, samplePosition };
  if (typeof options.recording === "boolean") transport.recording = options.recording;

  const tempo = optionalBoundedNumber(options.tempo, 1, 960);
  if (tempo !== undefined) transport.tempo = tempo;

  const hasMeter = tempo !== undefined || options.timeSignatureNumerator !== undefined || options.timeSignatureDenominator !== undefined;
  const numerator = boundedLiveEffectInteger(options.timeSignatureNumerator, 4, 1, 64);
  const denominator = boundedDenominator(options.timeSignatureDenominator, 4);
  if (hasMeter) {
    transport.timeSignatureNumerator = numerator;
    transport.timeSignatureDenominator = denominator;
  }

  const projectTimeMusic = transportPositionMusic(options.projectTimeMusic, samplePosition, sampleRate, tempo, options.projectTimeMusicAtSampleZero);
  if (projectTimeMusic !== undefined) {
    transport.projectTimeMusic = projectTimeMusic;
    transport.barPositionMusic = optionalBoundedNumber(options.barPositionMusic, 0, MAX_TRANSPORT_MUSIC) ?? barPositionMusic(projectTimeMusic, numerator, denominator);
  } else if (options.barPositionMusic !== undefined) {
    transport.barPositionMusic = optionalBoundedNumber(options.barPositionMusic, 0, MAX_TRANSPORT_MUSIC);
  }

  const hasCycle = options.cycleStartMusic !== undefined || options.cycleEndMusic !== undefined;
  if (hasCycle) {
    const start = optionalBoundedNumber(options.cycleStartMusic ?? options.cycleEndMusic, 0, MAX_TRANSPORT_MUSIC) ?? 0;
    const end = optionalBoundedNumber(options.cycleEndMusic ?? options.cycleStartMusic, 0, MAX_TRANSPORT_MUSIC) ?? start;
    transport.cycleStartMusic = start;
    transport.cycleEndMusic = Math.max(start, end);
  }
  if (typeof options.loopActive === "boolean" || hasCycle) transport.loopActive = options.loopActive ?? hasCycle;
  return transport;
}

function optionalBoundedNumber(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  return roundedMusic(boundedLiveEffectNumber(value, min, min, max));
}

function boundedDenominator(value: unknown, fallback: number): 1 | 2 | 4 | 8 | 16 | 32 | 64 {
  const requested = boundedLiveEffectInteger(value, fallback, 1, 64);
  return DENOMINATORS.find((denominator) => denominator >= requested) ?? 64;
}

function transportPositionMusic(projectTimeMusic: unknown, samplePosition: number, sampleRate: number, tempo: number | undefined, offset: unknown): number | undefined {
  const explicit = optionalBoundedNumber(projectTimeMusic, 0, MAX_TRANSPORT_MUSIC);
  if (explicit !== undefined) return explicit;
  if (tempo === undefined) return undefined;
  const base = optionalBoundedNumber(offset, 0, MAX_TRANSPORT_MUSIC) ?? 0;
  return optionalBoundedNumber(base + (samplePosition / sampleRate) * (tempo / 60), 0, MAX_TRANSPORT_MUSIC);
}

function barPositionMusic(projectTimeMusic: number, numerator: number, denominator: number): number {
  const barLength = numerator * (4 / denominator);
  return barLength > 0 ? roundedMusic(Math.floor(projectTimeMusic / barLength) * barLength) : 0;
}

function roundedMusic(value: number): number {
  return Number(value.toFixed(6));
}
