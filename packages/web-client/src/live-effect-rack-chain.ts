import type { LiveEffectBlockRequest, LiveEffectBlockResponse, LiveEffectRackHealth } from "./live-effect-rack";
import { boundedLiveEffectChannels, dryChannels } from "./live-effect-rack-audio";
import { boundedLatencySamples, boundedLiveEffectInteger } from "./live-effect-rack-metrics";
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
  error?: unknown;
}

export interface LiveEffectRackChainResponse extends LiveEffectBlockResponse {
  stageCount: number;
  processedStages: number;
  failedStageIndex?: number;
  stageResults: LiveEffectRackChainStageResult[];
}

export class LiveEffectRackChain {
  readonly stages: LiveEffectRackChainStage[];
  readonly maxBlockSize: number;
  private readonly outputChannels?: number;

  constructor(options: LiveEffectRackChainOptions) {
    const maxStages = boundedLiveEffectInteger(options.maxStages, LIVE_EFFECT_CHAIN_MAX_STAGES, 0, LIVE_EFFECT_CHAIN_MAX_STAGES);
    const stages = Array.from({ length: boundedLiveEffectInteger(options.stages?.length, 0, 0, maxStages) }, (_unused, index) => options.stages[index])
      .filter((stage): stage is LiveEffectRackChainStage => typeof stage?.processBlock === "function");
    this.stages = stages.slice(0, maxStages);
    this.maxBlockSize = boundedLiveEffectInteger(options.maxBlockSize, 128, 1, 8192);
    this.outputChannels = options.outputChannels === undefined
      ? undefined
      : boundedLiveEffectInteger(options.outputChannels, 2, 1, 32);
  }

  async processBlock(
    request: LiveEffectBlockRequest,
    options: LiveEffectRackChainProcessOptions = {}
  ): Promise<LiveEffectRackChainResponse> {
    const outputChannels = this.chainOutputChannels(request.channels);
    if (this.stages.length === 0) {
      return this.chainDryResponse(request, "chain-empty", outputChannels);
    }
    let channels = boundedLiveEffectChannels(request.channels, outputChannels, this.maxBlockSize);
    let latencySamples = 0;
    let tailSamples = 0;
    let infiniteTail = false;
    const stageResults: LiveEffectRackChainStageResult[] = [];
    for (let index = 0; index < this.stages.length; index += 1) {
      const stage = this.stages[index];
      try {
        const response = await stage.processBlock({
          ...request,
          channels,
          wetMix: stageWetMix(options.stageWetMixes, index, request.wetMix)
        });
        channels = boundedLiveEffectChannels(response.channels, outputChannels, this.maxBlockSize);
        latencySamples = boundedLatencySamples(latencySamples + boundedLatencySamples(response.latencySamples, 0), latencySamples);
        tailSamples = boundedLatencySamples(tailSamples + boundedLatencySamples(response.tailSamples, 0), tailSamples);
        infiniteTail = infiniteTail || response.infiniteTail === true;
        stageResults.push(stageResult(index, stage, response));
      } catch (error) {
        stageResults.push(stageErrorResult(index, stage, error));
        return {
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
        };
      }
    }
    return {
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
    };
  }

  processScheduledBlock(
    scheduled: LiveEffectRackScheduledBlock,
    options: LiveEffectRackChainProcessOptions = {}
  ): Promise<LiveEffectRackChainResponse> {
    if (scheduled.stale) {
      return Promise.resolve(this.chainDryResponse(scheduled.request, "chain-stale-input", this.chainOutputChannels(scheduled.request.channels)));
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
      stageResults: []
    };
  }

  private chainOutputChannels(channels: ArrayLike<number>[]): number {
    return this.outputChannels ?? boundedLiveEffectInteger(channels.length, 2, 1, 32);
  }
}

export function createLiveEffectRackChain(options: LiveEffectRackChainOptions): LiveEffectRackChain {
  return new LiveEffectRackChain(options);
}

function stageWetMix(stageWetMixes: ArrayLike<number> | undefined, index: number, fallback: number | undefined): number | undefined {
  return stageWetMixes && index < stageWetMixes.length ? Number(stageWetMixes[index]) : fallback;
}

function stageResult(index: number, stage: LiveEffectRackChainStage, response: LiveEffectBlockResponse): LiveEffectRackChainStageResult {
  return {
    index,
    bypassed: response.bypassed === true,
    healthy: response.healthy !== false,
    instanceId: stage.health?.instanceId,
    renderEngine: typeof response.renderEngine === "string" ? response.renderEngine : undefined,
    lastDryReason: typeof stage.health?.lastDryReason === "string" ? stage.health.lastDryReason : undefined,
    error: response.error
  };
}

function stageErrorResult(index: number, stage: LiveEffectRackChainStage, error: unknown): LiveEffectRackChainStageResult {
  return {
    index,
    bypassed: true,
    healthy: false,
    instanceId: stage.health?.instanceId,
    lastDryReason: typeof stage.health?.lastDryReason === "string" ? stage.health.lastDryReason : undefined,
    error
  };
}
