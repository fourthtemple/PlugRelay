import type { HostTransportState } from "../../protocol/src/messages";
import type { LiveEffectBlockRequest, LiveEffectRackHealth } from "./live-effect-rack";
import {
  boundedLatencySamples,
  boundedLiveEffectInteger,
  boundedLiveEffectNumber,
  liveEffectNowMs
} from "./live-effect-rack-metrics";
import { liveTransportForBlock } from "./live-transport";
import type { LiveTransportBlockOptions } from "./live-transport";

const LIVE_EFFECT_SCHEDULER_MAX_BLOCK_ID = 9_007_199_254_740_991;
const LIVE_EFFECT_SCHEDULER_MAX_SAMPLE_POSITION = 9_007_199_254_740_991;

export interface LiveEffectRackBlockSchedulerOptions {
  sampleRate: number;
  maxBlockSize: number;
  startBlockId?: number;
  startSamplePosition?: number;
  transportLatencySamples?: number;
  maxInputAgeMs?: number;
  compensateOutputLatency?: boolean;
  nowMs?: () => number;
  transport?: Partial<LiveTransportBlockOptions>;
}

export interface LiveEffectRackScheduledBlock {
  request: LiveEffectBlockRequest;
  blockId: number;
  samplePosition?: number;
  timestamp: number;
  captureAgeMs: number;
  stale: boolean;
  transport: HostTransportState;
}

export interface LiveEffectRackScheduleOptions extends Omit<Partial<LiveEffectBlockRequest>, "channels"> {
  transportLatencySamples?: number;
  samplePosition?: number;
  transportOptions?: Partial<LiveTransportBlockOptions>;
}

export class LiveEffectRackBlockScheduler {
  readonly sampleRate: number;
  readonly maxBlockSize: number;
  readonly maxInputAgeMs: number;
  readonly compensateOutputLatency: boolean;
  private readonly nowMs: () => number;
  private readonly baseTransport: Partial<LiveTransportBlockOptions>;
  private nextBlockId: number;
  private nextSamplePosition?: number;
  private transportLatencySamples: number;

  constructor(options: LiveEffectRackBlockSchedulerOptions) {
    this.sampleRate = boundedLiveEffectInteger(options.sampleRate, 48000, 1, 384000);
    this.maxBlockSize = boundedLiveEffectInteger(options.maxBlockSize, 128, 1, 8192);
    this.nextBlockId = boundedLiveEffectInteger(options.startBlockId, 0, 0, LIVE_EFFECT_SCHEDULER_MAX_BLOCK_ID);
    this.nextSamplePosition = optionalSchedulerInteger(options.startSamplePosition, 0, LIVE_EFFECT_SCHEDULER_MAX_SAMPLE_POSITION);
    this.transportLatencySamples = boundedLatencySamples(options.transportLatencySamples, 0);
    this.maxInputAgeMs = boundedLiveEffectNumber(options.maxInputAgeMs, 0, 0, 60000);
    this.compensateOutputLatency = options.compensateOutputLatency !== false;
    this.nowMs = typeof options.nowMs === "function" ? options.nowMs : liveEffectNowMs;
    this.baseTransport = { ...options.transport };
  }

  schedule(channels: ArrayLike<number>[], options: LiveEffectRackScheduleOptions = {}): LiveEffectRackScheduledBlock {
    const now = this.nowMs();
    const blockId = boundedLiveEffectInteger(options.blockId, this.nextBlockId, 0, LIVE_EFFECT_SCHEDULER_MAX_BLOCK_ID);
    const samplePosition = optionalSchedulerInteger(
      options.samplePosition ?? this.nextSamplePosition,
      0,
      LIVE_EFFECT_SCHEDULER_MAX_SAMPLE_POSITION
    );
    const timestamp = finiteSchedulerNumber(options.timestamp, now);
    const transportLatencySamples = boundedLatencySamples(options.transportLatencySamples, this.transportLatencySamples);
    const transport = options.transport ?? liveTransportForBlock({
      ...this.baseTransport,
      ...options.transportOptions,
      sampleRate: options.sampleRate ?? this.sampleRate,
      maxBlockSize: this.maxBlockSize,
      blockId,
      samplePosition,
      reportedLatencySamples: transportLatencySamples,
      compensateOutputLatency: this.compensateOutputLatency
    });
    this.advance(blockId, samplePosition);
    const request: LiveEffectBlockRequest = {
      blockId,
      channels,
      inputBuses: options.inputBuses,
      sampleRate: options.sampleRate ?? this.sampleRate,
      transport,
      timestamp,
      wetMix: options.wetMix
    };
    const captureAgeMs = Math.max(0, now - timestamp);
    return {
      request,
      blockId,
      samplePosition,
      timestamp,
      captureAgeMs,
      stale: this.maxInputAgeMs > 0 && captureAgeMs > this.maxInputAgeMs,
      transport
    };
  }

  updateLatency(transportLatencySamples: unknown): number {
    this.transportLatencySamples = boundedLatencySamples(transportLatencySamples, this.transportLatencySamples);
    return this.transportLatencySamples;
  }

  updateFromRackHealth(health: Pick<LiveEffectRackHealth, "transportLatencySamples">): number {
    return this.updateLatency(health.transportLatencySamples);
  }

  reset(options: { nextBlockId?: number; nextSamplePosition?: number } = {}): void {
    this.nextBlockId = boundedLiveEffectInteger(options.nextBlockId, 0, 0, LIVE_EFFECT_SCHEDULER_MAX_BLOCK_ID);
    this.nextSamplePosition = optionalSchedulerInteger(options.nextSamplePosition, 0, LIVE_EFFECT_SCHEDULER_MAX_SAMPLE_POSITION);
  }

  snapshot(): {
    nextBlockId: number;
    nextSamplePosition?: number;
    transportLatencySamples: number;
    maxInputAgeMs: number;
  } {
    return {
      nextBlockId: this.nextBlockId,
      nextSamplePosition: this.nextSamplePosition,
      transportLatencySamples: this.transportLatencySamples,
      maxInputAgeMs: this.maxInputAgeMs
    };
  }

  private advance(blockId: number, samplePosition?: number): void {
    this.nextBlockId = Math.min(LIVE_EFFECT_SCHEDULER_MAX_BLOCK_ID, blockId + 1);
    if (samplePosition !== undefined) {
      this.nextSamplePosition = Math.min(LIVE_EFFECT_SCHEDULER_MAX_SAMPLE_POSITION, samplePosition + this.maxBlockSize);
    }
  }
}

export function createLiveEffectRackBlockScheduler(options: LiveEffectRackBlockSchedulerOptions): LiveEffectRackBlockScheduler {
  return new LiveEffectRackBlockScheduler(options);
}

function optionalSchedulerInteger(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  return boundedLiveEffectInteger(value, 0, min, max);
}

function finiteSchedulerNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
