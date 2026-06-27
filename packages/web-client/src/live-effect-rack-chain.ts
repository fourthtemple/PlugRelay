import type { LiveEffectBlockRequest, LiveEffectBlockResponse, LiveEffectRackHealth } from "./live-effect-rack";
import { boundedLiveEffectChannels, dryChannels } from "./live-effect-rack-audio";
import { boundedLatencySamples, boundedLiveEffectInteger, boundedLiveEffectNumber, boundedOptionalNumber, liveEffectNowMs } from "./live-effect-rack-metrics";
import type { LiveEffectRackScheduledBlock } from "./live-effect-rack-scheduler";

const LIVE_EFFECT_CHAIN_MAX_STAGES = 16;

export interface LiveEffectRackChainStage {
  readonly health?: Partial<LiveEffectRackHealth>;
  processBlock(request: LiveEffectBlockRequest): Promise<LiveEffectBlockResponse>;
}

export interface LiveEffectRackChainOptions {
  stages: ArrayLike<LiveEffectRackChainStage>;
  maxStages?: number;
  outputChannels?: number;
  maxBlockSize?: number;
  processBudgetMs?: number;
  maxConsecutiveProcessBudgetMisses?: number;
  nowMs?: () => number;
}

export interface LiveEffectRackChainProcessOptions {
  stageWetMixes?: ArrayLike<number>;
}

export interface LiveEffectRackChainStageResult {
  index: number;
  bypassed: boolean;
  healthy: boolean;
  instanceId?: string;
  renderEngine?: string;
  lastDryReason?: string;
  durationMs?: number;
  error?: unknown;
}

export interface LiveEffectRackChainResponse extends LiveEffectBlockResponse {
  stageCount: number;
  processedStages: number;
  failedStageIndex?: number;
  stageResults: LiveEffectRackChainStageResult[];
  chainProcessDurationMs?: number;
  chainProcessBudgetMs?: number;
  chainProcessBudgetExceeded: boolean;
  chainProcessBudgetMisses: number;
  chainProcessBudgetTripped: boolean;
}

export class LiveEffectRackChain {
  readonly stages: LiveEffectRackChainStage[];
  readonly maxBlockSize: number;
  readonly processBudgetMs: number;
  readonly maxConsecutiveProcessBudgetMisses: number;
  private readonly outputChannels?: number;
  private readonly nowMs: () => number;
  private processBudgetMisses = 0;

  constructor(options: LiveEffectRackChainOptions) {
    const maxStages = boundedLiveEffectInteger(options.maxStages, LIVE_EFFECT_CHAIN_MAX_STAGES, 0, LIVE_EFFECT_CHAIN_MAX_STAGES);
    const stages = Array.from({ length: boundedLiveEffectInteger(options.stages?.length, 0, 0, maxStages) }, (_unused, index) => options.stages[index])
      .filter((stage): stage is LiveEffectRackChainStage => typeof stage?.processBlock === "function");
    this.stages = stages.slice(0, maxStages);
    this.maxBlockSize = boundedLiveEffectInteger(options.maxBlockSize, 128, 1, 8192);
    this.processBudgetMs = boundedLiveEffectNumber(options.processBudgetMs, 0, 0, 60000);
    this.maxConsecutiveProcessBudgetMisses = boundedLiveEffectInteger(options.maxConsecutiveProcessBudgetMisses, 0, 0, 1024);
    this.outputChannels = options.outputChannels === undefined
      ? undefined
      : boundedLiveEffectInteger(options.outputChannels, 2, 1, 32);
    this.nowMs = typeof options.nowMs === "function" ? options.nowMs : liveEffectNowMs;
  }

  async processBlock(
    request: LiveEffectBlockRequest,
    options: LiveEffectRackChainProcessOptions = {}
  ): Promise<LiveEffectRackChainResponse> {
    const processStartedAt = this.nowMs();
    const outputChannels = this.chainOutputChannels(request.channels);
    if (this.stages.length === 0) {
      return this.finishChainResponse(this.chainDryResponse(request, "chain-empty", outputChannels), processStartedAt);
    }
    let channels = boundedLiveEffectChannels(request.channels, outputChannels, this.maxBlockSize);
    let latencySamples = 0;
    let tailSamples = 0;
    let infiniteTail = false;
    const stageResults: LiveEffectRackChainStageResult[] = [];
    for (let index = 0; index < this.stages.length; index += 1) {
      const stage = this.stages[index];
      const stageStartedAt = this.nowMs();
      try {
        const response = await stage.processBlock({
          ...request,
          channels,
          wetMix: stageWetMix(options.stageWetMixes, index, request.wetMix)
        });
        const stageDurationMs = this.nowMs() - stageStartedAt;
        channels = boundedLiveEffectChannels(response.channels, outputChannels, this.maxBlockSize);
        latencySamples = boundedLatencySamples(latencySamples + boundedLatencySamples(response.latencySamples, 0), latencySamples);
        tailSamples = boundedLatencySamples(tailSamples + boundedLatencySamples(response.tailSamples, 0), tailSamples);
        infiniteTail = infiniteTail || response.infiniteTail === true;
        stageResults.push(stageResult(index, stage, response, stageDurationMs));
      } catch (error) {
        stageResults.push(stageErrorResult(index, stage, error, this.nowMs() - stageStartedAt));
        return this.finishChainResponse({
          blockId: request.blockId,
          channels,
          latencySamples,
          tailSamples,
          infiniteTail,
          renderEngine: "chain-stage-error",
          bypassed: stageResults.every((stage) => stage.bypassed),
          healthy: false,
          error,
          stageCount: this.stages.length,
          processedStages: stageResults.length,
          failedStageIndex: index,
          stageResults
        }, processStartedAt);
      }
    }
    return this.finishChainResponse({
      blockId: request.blockId,
      channels,
      latencySamples,
      tailSamples,
      infiniteTail,
      renderEngine: "live-effect-rack-chain",
      bypassed: stageResults.length === 0 || stageResults.every((stage) => stage.bypassed),
      healthy: stageResults.every((stage) => stage.healthy),
      stageCount: this.stages.length,
      processedStages: stageResults.length,
      stageResults
    }, processStartedAt);
  }

  processScheduledBlock(
    scheduled: LiveEffectRackScheduledBlock,
    options: LiveEffectRackChainProcessOptions = {}
  ): Promise<LiveEffectRackChainResponse> {
    if (scheduled.stale) {
      return Promise.resolve(this.finishChainResponse(
        this.chainDryResponse(scheduled.request, "chain-stale-input", this.chainOutputChannels(scheduled.request.channels)),
        this.nowMs()
      ));
    }
    return this.processBlock(scheduled.request, options);
  }

  private chainDryResponse(
    request: LiveEffectBlockRequest,
    renderEngine: string,
    outputChannels: number
  ): LiveEffectRackChainResponse {
    return {
      blockId: request.blockId,
      channels: dryChannels(request.channels, outputChannels, this.maxBlockSize),
      latencySamples: 0,
      tailSamples: 0,
      infiniteTail: false,
      renderEngine,
      bypassed: true,
      healthy: true,
      stageCount: this.stages.length,
      processedStages: 0,
      stageResults: [],
      chainProcessBudgetExceeded: false,
      chainProcessBudgetMisses: this.processBudgetMisses,
      chainProcessBudgetTripped: false
    };
  }

  private chainOutputChannels(channels: ArrayLike<number>[]): number {
    return this.outputChannels ?? boundedLiveEffectInteger(channels.length, 2, 1, 32);
  }

  private finishChainResponse(response: LiveEffectRackChainResponse, processStartedAt: number): LiveEffectRackChainResponse {
    const durationMs = boundedOptionalNumber(this.nowMs() - processStartedAt, 0, 60000);
    const chainProcessBudgetExceeded = this.processBudgetMs > 0 && (durationMs ?? 0) > this.processBudgetMs;
    this.processBudgetMisses = chainProcessBudgetExceeded ? Math.min(1024, this.processBudgetMisses + 1) : 0;
    const chainProcessBudgetTripped = this.maxConsecutiveProcessBudgetMisses > 0 &&
      this.processBudgetMisses >= this.maxConsecutiveProcessBudgetMisses;
    return {
      ...response,
      healthy: response.healthy !== false && !chainProcessBudgetTripped,
      error: chainProcessBudgetTripped ? response.error ?? new Error("chain_process_budget_exceeded") : response.error,
      chainProcessDurationMs: durationMs,
      chainProcessBudgetMs: this.processBudgetMs > 0 ? this.processBudgetMs : undefined,
      chainProcessBudgetExceeded,
      chainProcessBudgetMisses: this.processBudgetMisses,
      chainProcessBudgetTripped
    };
  }
}

export function createLiveEffectRackChain(options: LiveEffectRackChainOptions): LiveEffectRackChain {
  return new LiveEffectRackChain(options);
}

function stageWetMix(stageWetMixes: ArrayLike<number> | undefined, index: number, fallback: number | undefined): number | undefined {
  return stageWetMixes && index < stageWetMixes.length ? Number(stageWetMixes[index]) : fallback;
}

function stageResult(index: number, stage: LiveEffectRackChainStage, response: LiveEffectBlockResponse, durationMs: number): LiveEffectRackChainStageResult {
  return {
    index,
    bypassed: response.bypassed === true,
    healthy: response.healthy !== false,
    instanceId: stage.health?.instanceId,
    renderEngine: typeof response.renderEngine === "string" ? response.renderEngine : undefined,
    lastDryReason: typeof stage.health?.lastDryReason === "string" ? stage.health.lastDryReason : undefined,
    durationMs: boundedOptionalNumber(durationMs, 0, 60000),
    error: response.error
  };
}

function stageErrorResult(index: number, stage: LiveEffectRackChainStage, error: unknown, durationMs: number): LiveEffectRackChainStageResult {
  return {
    index,
    bypassed: true,
    healthy: false,
    instanceId: stage.health?.instanceId,
    lastDryReason: typeof stage.health?.lastDryReason === "string" ? stage.health.lastDryReason : undefined,
    durationMs: boundedOptionalNumber(durationMs, 0, 60000),
    error
  };
}
