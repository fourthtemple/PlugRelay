import type {
  LiveEffectRackCalibrationHealthSample,
  LiveEffectRackCalibrationWindowOptions,
  LiveEffectRackCalibrationWindowSnapshot,
  LiveEffectRackChainCalibrationHealthSample,
  LiveEffectRackFrameBatchCalibrationHealthSample,
  LiveEffectRackLatencyRefresher
} from "./live-effect-rack-calibration";
import type { LiveEffectRackDeadlinePressure, LiveEffectRackDeadlinePressureHealth } from "./live-effect-rack-scheduler";

export type LiveEffectRackAdaptiveLatencyDirection = "none" | "increase" | "decrease";

export interface LiveEffectRackAdaptiveLatencyTarget<T = unknown> extends LiveEffectRackLatencyRefresher<T> {
  readonly health: LiveEffectRackCalibrationHealthSample & { transportLatencySamples?: number };
}

export interface LiveEffectRackAdaptiveLatencyOptions<T = unknown> extends LiveEffectRackCalibrationWindowOptions {
  rack: LiveEffectRackAdaptiveLatencyTarget<T>;
  minSamples?: number;
  cooldownBlocks?: number;
  maxLatencyIncreaseBlocks?: number;
  latencyRecoveryBlocks?: number;
  maxLatencyDecreaseBlocks?: number;
  minTransportLatencySamples?: number;
  minTransportLatencyBlocks?: number;
}

export interface LiveEffectRackSchedulerAdaptiveLatencyScheduler {
  updateLatency(transportLatencySamples: unknown): number;
  updateDeadlinePressureFromHealth(
    health: LiveEffectRackDeadlinePressureHealth,
    calibration?: { warnings: string[] }
  ): unknown;
  snapshot(): { transportLatencySamples: number; deadlinePressure?: LiveEffectRackDeadlinePressure };
}

export interface LiveEffectRackChainSchedulerAdaptiveLatencyScheduler extends LiveEffectRackSchedulerAdaptiveLatencyScheduler {}

export interface LiveEffectRackFrameBatchSchedulerAdaptiveLatencyScheduler extends LiveEffectRackSchedulerAdaptiveLatencyScheduler {}

export interface LiveEffectRackSchedulerAdaptiveLatencyOptions extends LiveEffectRackCalibrationWindowOptions {
  scheduler: LiveEffectRackSchedulerAdaptiveLatencyScheduler;
  minSamples?: number;
  cooldownBlocks?: number;
  maxLatencyIncreaseBlocks?: number;
  latencyRecoveryBlocks?: number;
  maxLatencyDecreaseBlocks?: number;
  minTransportLatencySamples?: number;
  minTransportLatencyBlocks?: number;
}

export interface LiveEffectRackChainSchedulerAdaptiveLatencyOptions extends LiveEffectRackCalibrationWindowOptions {
  scheduler: LiveEffectRackChainSchedulerAdaptiveLatencyScheduler;
  minSamples?: number;
  cooldownBlocks?: number;
  maxLatencyIncreaseBlocks?: number;
  latencyRecoveryBlocks?: number;
  maxLatencyDecreaseBlocks?: number;
  minTransportLatencySamples?: number;
  minTransportLatencyBlocks?: number;
}

export interface LiveEffectRackFrameBatchSchedulerAdaptiveLatencyOptions extends LiveEffectRackCalibrationWindowOptions {
  scheduler: LiveEffectRackFrameBatchSchedulerAdaptiveLatencyScheduler;
  minSamples?: number;
  cooldownBlocks?: number;
  maxLatencyIncreaseBlocks?: number;
  latencyRecoveryBlocks?: number;
  maxLatencyDecreaseBlocks?: number;
  minTransportLatencySamples?: number;
  minTransportLatencyBlocks?: number;
}

export interface LiveEffectRackAdaptiveLatencySnapshot<T = unknown> extends LiveEffectRackCalibrationWindowSnapshot {
  applied: boolean;
  appliedDirection: LiveEffectRackAdaptiveLatencyDirection;
  currentTransportLatencySamples: number;
  targetTransportLatencySamples: number;
  cooldownBlocksRemaining: number;
  stableBlocks: number;
  recoveryBlocksRemaining: number;
  refreshResult?: T;
}

export interface LiveEffectRackSchedulerAdaptiveLatencySnapshot extends LiveEffectRackCalibrationWindowSnapshot {
  applied: boolean;
  appliedDirection: LiveEffectRackAdaptiveLatencyDirection;
  currentTransportLatencySamples: number;
  targetTransportLatencySamples: number;
  cooldownBlocksRemaining: number;
  stableBlocks: number;
  recoveryBlocksRemaining: number;
  deadlinePressure?: LiveEffectRackDeadlinePressure;
}

export interface LiveEffectRackChainSchedulerAdaptiveLatencySnapshot extends LiveEffectRackCalibrationWindowSnapshot {
  applied: boolean;
  appliedDirection: LiveEffectRackAdaptiveLatencyDirection;
  chainLatencySamples: number;
  currentTransportLatencySamples: number;
  targetTransportLatencySamples: number;
  cooldownBlocksRemaining: number;
  stableBlocks: number;
  recoveryBlocksRemaining: number;
  deadlinePressure?: LiveEffectRackDeadlinePressure;
}

export interface LiveEffectRackFrameBatchSchedulerAdaptiveLatencySnapshot extends LiveEffectRackCalibrationWindowSnapshot {
  applied: boolean;
  appliedDirection: LiveEffectRackAdaptiveLatencyDirection;
  batchLatencySamples: number;
  currentTransportLatencySamples: number;
  targetTransportLatencySamples: number;
  cooldownBlocksRemaining: number;
  stableBlocks: number;
  recoveryBlocksRemaining: number;
  deadlinePressure?: LiveEffectRackDeadlinePressure;
}
