import type { LiveEffectBlockResponse } from "./live-effect-rack-types";
import { boundedLatencySamples, boundedLiveEffectInteger, boundedOptionalNumber, liveEffectNowMs } from "./live-effect-rack-metrics";
import type {
  LiveEffectRackDeadlinePressureSkipOptions,
  LiveEffectRackScheduledBlock,
  LiveEffectRackScheduledFrame,
  LiveEffectRackScheduleOptions
} from "./live-effect-rack-scheduler";

const LIVE_EFFECT_FRAME_BATCH_TARGETS = 16;

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

export interface LiveEffectRackFrameBatchOptions {
  frame?: LiveEffectRackScheduledFrame;
  frameOptions?: LiveEffectRackScheduleOptions;
}

export interface LiveEffectRackFrameBatchProcessorOptions {
  scheduler: LiveEffectRackFrameBatchScheduler;
  maxTargets?: number;
  nowMs?: () => number;
}

export interface LiveEffectRackFrameBatchTargetResult {
  id?: string;
  index: number;
  scheduled: LiveEffectRackScheduledBlock;
  response?: LiveEffectBlockResponse;
  error?: unknown;
  bypassed: boolean;
  dry: boolean;
  healthy: boolean;
  latencySamples: number;
  reportedLatencySamples: number;
  durationMs: number;
}

export interface LiveEffectRackFrameBatchResult {
  frame: LiveEffectRackScheduledFrame;
  results: LiveEffectRackFrameBatchTargetResult[];
  targetCount: number;
  processedTargets: number;
  failedTargets: number;
  dryTargets: number;
  bypassedTargets: number;
  healthy: boolean;
  latencySamples: number;
  reportedLatencySamples: number;
  maxDurationMs: number;
  totalDurationMs: number;
}

export class LiveEffectRackFrameBatchProcessor {
  readonly scheduler: LiveEffectRackFrameBatchScheduler;
  readonly maxTargets: number;
  private readonly nowMs: () => number;

  constructor(options: LiveEffectRackFrameBatchProcessorOptions) {
    this.scheduler = options.scheduler;
    this.maxTargets = boundedLiveEffectInteger(options.maxTargets, LIVE_EFFECT_FRAME_BATCH_TARGETS, 1, 32);
    this.nowMs = typeof options.nowMs === "function" ? options.nowMs : liveEffectNowMs;
  }

  async process(
    targets: ArrayLike<LiveEffectRackFrameBatchTargetRequest>,
    options: LiveEffectRackFrameBatchOptions = {}
  ): Promise<LiveEffectRackFrameBatchResult> {
    const frame = options.frame ?? this.scheduler.captureFrame(options.frameOptions);
    const targetCount = boundedLiveEffectInteger(targets?.length, 0, 0, this.maxTargets);
    const startedAt = this.nowMs();
    const results = await Promise.all(
      Array.from({ length: targetCount }, (_unused, index) => this.processTarget(frame, targets[index], index))
    );
    return this.result(frame, results, this.nowMs() - startedAt);
  }

  private async processTarget(
    frame: LiveEffectRackScheduledFrame,
    targetRequest: LiveEffectRackFrameBatchTargetRequest | undefined,
    index: number
  ): Promise<LiveEffectRackFrameBatchTargetResult> {
    const startedAt = this.nowMs();
    const scheduled = this.scheduler.scheduleFromFrame(
      frame,
      targetRequest?.channels ?? [],
      targetRequest?.scheduleOptions
    );
    if (typeof targetRequest?.target?.processScheduledBlock !== "function") {
      return this.targetResult(targetRequest, index, scheduled, undefined, new Error("invalid_frame_batch_target"), this.nowMs() - startedAt);
    }
    try {
      const response = await targetRequest.target.processScheduledBlock(scheduled, targetRequest.processOptions);
      return this.targetResult(targetRequest, index, scheduled, response, undefined, this.nowMs() - startedAt);
    } catch (error) {
      return this.targetResult(targetRequest, index, scheduled, undefined, error, this.nowMs() - startedAt);
    }
  }

  private targetResult(
    targetRequest: LiveEffectRackFrameBatchTargetRequest | undefined,
    index: number,
    scheduled: LiveEffectRackScheduledBlock,
    response: LiveEffectBlockResponse | undefined,
    error: unknown,
    durationMs: number
  ): LiveEffectRackFrameBatchTargetResult {
    const responseLatencySamples = boundedLatencySamples(response?.latencySamples, 0);
    const health = targetRequest?.target.health;
    const reportedLatencySamples = boundedLatencySamples(
      health?.reportedLatencySamples,
      boundedLatencySamples(health?.latencySamples, responseLatencySamples)
    );
    const bypassed = response?.bypassed === true;
    return {
      id: targetRequest?.id,
      index,
      scheduled,
      response,
      error,
      bypassed,
      dry: bypassed,
      healthy: error === undefined && response?.healthy !== false && health?.healthy !== false,
      latencySamples: responseLatencySamples,
      reportedLatencySamples,
      durationMs: boundedOptionalNumber(durationMs, 0, 60000) ?? 0
    };
  }

  private result(
    frame: LiveEffectRackScheduledFrame,
    results: LiveEffectRackFrameBatchTargetResult[],
    totalDurationMs: number
  ): LiveEffectRackFrameBatchResult {
    const failedTargets = results.filter((result) => result.error !== undefined || result.healthy === false).length;
    const dryTargets = results.filter((result) => result.dry).length;
    const bypassedTargets = results.filter((result) => result.bypassed).length;
    return {
      frame,
      results,
      targetCount: results.length,
      processedTargets: results.filter((result) => result.response !== undefined).length,
      failedTargets,
      dryTargets,
      bypassedTargets,
      healthy: failedTargets === 0,
      latencySamples: maxLatency(results, "latencySamples"),
      reportedLatencySamples: maxLatency(results, "reportedLatencySamples"),
      maxDurationMs: results.reduce((max, result) => Math.max(max, result.durationMs), 0),
      totalDurationMs: boundedOptionalNumber(totalDurationMs, 0, 60000) ?? 0
    };
  }
}

export function createLiveEffectRackFrameBatchProcessor(
  options: LiveEffectRackFrameBatchProcessorOptions
): LiveEffectRackFrameBatchProcessor {
  return new LiveEffectRackFrameBatchProcessor(options);
}

function maxLatency(results: LiveEffectRackFrameBatchTargetResult[], key: "latencySamples" | "reportedLatencySamples"): number {
  return results.reduce((max, result) => Math.max(max, result[key]), 0);
}
