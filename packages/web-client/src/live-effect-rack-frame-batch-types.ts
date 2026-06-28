import type { LiveEffectBlockResponse } from "./live-effect-rack-types";
import type {
  LiveEffectRackDeadlinePressure,
  LiveEffectRackDeadlinePressureSkipOptions,
  LiveEffectRackScheduledBlock,
  LiveEffectRackScheduledFrame,
  LiveEffectRackScheduleOptions
} from "./live-effect-rack-scheduler";

export interface LiveEffectRackFrameBatchScheduler {
  captureFrame(options?: LiveEffectRackScheduleOptions): LiveEffectRackScheduledFrame;
  scheduleFromFrame(
    frame: LiveEffectRackScheduledFrame,
    channels: ArrayLike<number>[],
    options?: LiveEffectRackScheduleOptions
  ): LiveEffectRackScheduledBlock;
}

export interface LiveEffectRackFrameBatchTargetHealth {
  healthy?: boolean;
  latencySamples?: unknown;
  reportedLatencySamples?: unknown;
}

export interface LiveEffectRackFrameBatchProcessOptions extends LiveEffectRackDeadlinePressureSkipOptions {
  wetMix?: number;
  stageWetMixes?: ArrayLike<number>;
}

export interface LiveEffectRackFrameBatchTarget {
  readonly health?: LiveEffectRackFrameBatchTargetHealth;
  processScheduledBlock(
    scheduled: LiveEffectRackScheduledBlock,
    options?: LiveEffectRackFrameBatchProcessOptions
  ): Promise<LiveEffectBlockResponse>;
}

export interface LiveEffectRackFrameBatchTargetRequest {
  id?: string;
  target: LiveEffectRackFrameBatchTarget;
  channels: ArrayLike<number>[];
  scheduleOptions?: LiveEffectRackScheduleOptions;
  processOptions?: LiveEffectRackFrameBatchProcessOptions;
}

export interface LiveEffectRackFrameBatchOptions extends LiveEffectRackDeadlinePressureSkipOptions {
  frame?: LiveEffectRackScheduledFrame;
  frameOptions?: LiveEffectRackScheduleOptions;
}

export interface LiveEffectRackFrameBatchProcessorOptions {
  scheduler: LiveEffectRackFrameBatchScheduler;
  sampleRate?: number;
  maxBlockSize?: number;
  maxTargets?: number;
  processBudgetMs?: number;
  processTimeoutMs?: number;
  maxConsecutiveProcessBudgetMisses?: number;
  processBudgetRecoveryBlocks?: number;
  processTimeoutRecoveryBlocks?: number;
  maxProcessTimeoutRecoveries?: number;
  nowMs?: () => number;
}

export interface LivePerformanceFrameBatchProcessorOptions extends LiveEffectRackFrameBatchProcessorOptions {
  sampleRate: number;
  maxBlockSize: number;
  processBudgetBlocks?: number;
  processTimeoutBlocks?: number;
}

export interface LiveEffectRackFrameBatchTargetResult {
  id?: string;
  index: number;
  scheduled: LiveEffectRackScheduledBlock;
  response?: LiveEffectBlockResponse;
  error?: unknown;
  bypassed: boolean;
  dry: boolean;
  skipped: boolean;
  healthy: boolean;
  latencySamples: number;
  reportedLatencySamples: number;
  durationMs: number;
}

export interface LiveEffectRackFrameBatchResult {
  frame: LiveEffectRackScheduledFrame;
  deadlinePressure?: LiveEffectRackDeadlinePressure;
  results: LiveEffectRackFrameBatchTargetResult[];
  targetCount: number;
  processedTargets: number;
  skippedTargets: number;
  failedTargets: number;
  dryTargets: number;
  bypassedTargets: number;
  healthy: boolean;
  latencySamples: number;
  reportedLatencySamples: number;
  maxDurationMs: number;
  totalDurationMs: number;
  lastResponseDeadlineLeadMs?: number;
  lastResponseDeadlineLeadBlocks?: number;
  responseJitterBlocks: number;
  responseDeadlineMisses: number;
  processBudgetMs?: number;
  processTimeoutMs?: number;
  processBudgetExceeded: boolean;
  processTimedOut: boolean;
  processBudgetMisses: number;
  processBudgetTripped: boolean;
  processTimeouts: number;
  processTimeoutTripped: boolean;
  recoveryDryBlocks: number;
  timeoutRecoveryDryBlocks: number;
  recoveryDryBlocksRemaining: number;
  processTimeoutRecoveryAttempts: number;
  processTimeoutRecoveryExhausted: boolean;
  maxProcessTimeoutRecoveries: number;
  error?: unknown;
}

export interface LiveEffectRackFrameBatchHealth {
  healthy: boolean;
  targetCount: number;
  processedTargets: number;
  skippedTargets: number;
  failedTargets: number;
  dryTargets: number;
  bypassedTargets: number;
  latencySamples: number;
  reportedLatencySamples: number;
  maxDurationMs: number;
  totalDurationMs: number;
  lastResponseDeadlineLeadMs?: number;
  lastResponseDeadlineLeadBlocks?: number;
  responseJitterBlocks: number;
  responseDeadlineMisses: number;
  processBudgetMs?: number;
  processTimeoutMs?: number;
  processBudgetExceeded: boolean;
  processTimedOut: boolean;
  processBudgetMisses: number;
  processBudgetTripped: boolean;
  processTimeouts: number;
  processTimeoutTripped: boolean;
  recoveryDryBlocks: number;
  timeoutRecoveryDryBlocks: number;
  recoveryDryBlocksRemaining: number;
  processTimeoutRecoveryAttempts: number;
  processTimeoutRecoveryExhausted: boolean;
  maxProcessTimeoutRecoveries: number;
  lastError?: unknown;
}
