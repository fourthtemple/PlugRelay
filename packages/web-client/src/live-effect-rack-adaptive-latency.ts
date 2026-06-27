import { boundedLatencySamples, boundedLiveEffectInteger } from "./live-effect-rack-metrics";
import { LiveEffectRackCalibrationWindow } from "./live-effect-rack-calibration";
import type {
  LiveEffectRackCalibrationHealthSample,
  LiveEffectRackCalibrationWindowOptions,
  LiveEffectRackCalibrationWindowSnapshot,
  LiveEffectRackLatencyRefresher
} from "./live-effect-rack-calibration";

const LIVE_EFFECT_ADAPTIVE_LATENCY_MIN_SAMPLES = 8;
const LIVE_EFFECT_ADAPTIVE_LATENCY_COOLDOWN_BLOCKS = 64;
const LIVE_EFFECT_ADAPTIVE_LATENCY_MAX_STEP_BLOCKS = 4;

export interface LiveEffectRackAdaptiveLatencyTarget<T = unknown> extends LiveEffectRackLatencyRefresher<T> {
  readonly health: LiveEffectRackCalibrationHealthSample & { transportLatencySamples?: number };
}

export interface LiveEffectRackAdaptiveLatencyOptions<T = unknown> extends LiveEffectRackCalibrationWindowOptions {
  rack: LiveEffectRackAdaptiveLatencyTarget<T>;
  minSamples?: number;
  cooldownBlocks?: number;
  maxLatencyIncreaseBlocks?: number;
}

export interface LiveEffectRackAdaptiveLatencySnapshot<T = unknown> extends LiveEffectRackCalibrationWindowSnapshot {
  applied: boolean;
  currentTransportLatencySamples: number;
  targetTransportLatencySamples: number;
  cooldownBlocksRemaining: number;
  refreshResult?: T;
}

export class LiveEffectRackAdaptiveLatencyController<T = unknown> {
  readonly rack: LiveEffectRackAdaptiveLatencyTarget<T>;
  readonly minSamples: number;
  readonly cooldownBlocks: number;
  readonly maxLatencyIncreaseBlocks: number;
  private readonly window: LiveEffectRackCalibrationWindow;
  private cooldownBlocksRemaining = 0;

  constructor(options: LiveEffectRackAdaptiveLatencyOptions<T>) {
    const { rack, minSamples, cooldownBlocks, maxLatencyIncreaseBlocks, ...windowOptions } = options;
    this.rack = rack;
    this.window = new LiveEffectRackCalibrationWindow(windowOptions);
    this.minSamples = boundedLiveEffectInteger(minSamples, LIVE_EFFECT_ADAPTIVE_LATENCY_MIN_SAMPLES, 1, 256);
    this.cooldownBlocks = boundedLiveEffectInteger(cooldownBlocks, LIVE_EFFECT_ADAPTIVE_LATENCY_COOLDOWN_BLOCKS, 0, 4096);
    this.maxLatencyIncreaseBlocks = boundedLiveEffectInteger(maxLatencyIncreaseBlocks, LIVE_EFFECT_ADAPTIVE_LATENCY_MAX_STEP_BLOCKS, 1, 128);
  }

  async record(health: LiveEffectRackCalibrationHealthSample = this.rack.health): Promise<LiveEffectRackAdaptiveLatencySnapshot<T>> {
    if (this.cooldownBlocksRemaining > 0) {
      this.cooldownBlocksRemaining -= 1;
    }
    const snapshot = this.window.record(health);
    const currentTransportLatencySamples = boundedLatencySamples(
      this.rack.health.transportLatencySamples,
      snapshot.calibration.policy.transportLatencySamples
    );
    const maxStepSamples = this.maxLatencyIncreaseBlocks * snapshot.calibration.policy.maxBlockSize;
    const recommendedTransportLatencySamples = snapshot.calibration.recommendedTransportLatencySamples;
    const targetTransportLatencySamples = Math.min(
      recommendedTransportLatencySamples,
      currentTransportLatencySamples + maxStepSamples
    );
    let refreshResult: T | undefined;
    let applied = false;
    if (this.shouldApply(snapshot, targetTransportLatencySamples, currentTransportLatencySamples)) {
      refreshResult = await this.rack.refreshLatency(targetTransportLatencySamples);
      applied = true;
      this.cooldownBlocksRemaining = this.cooldownBlocks;
    }
    return {
      ...snapshot,
      applied,
      currentTransportLatencySamples,
      targetTransportLatencySamples,
      cooldownBlocksRemaining: this.cooldownBlocksRemaining,
      refreshResult
    };
  }

  reset(): void {
    this.window.reset();
    this.cooldownBlocksRemaining = 0;
  }

  private shouldApply(
    snapshot: LiveEffectRackCalibrationWindowSnapshot,
    targetTransportLatencySamples: number,
    currentTransportLatencySamples: number
  ): boolean {
    return (
      snapshot.samples >= this.minSamples &&
      this.cooldownBlocksRemaining === 0 &&
      targetTransportLatencySamples > currentTransportLatencySamples &&
      snapshot.calibration.warnings.includes("increase-transport-latency")
    );
  }
}

export function createLiveEffectRackAdaptiveLatencyController<T>(
  options: LiveEffectRackAdaptiveLatencyOptions<T>
): LiveEffectRackAdaptiveLatencyController<T> {
  return new LiveEffectRackAdaptiveLatencyController(options);
}
