const LIVE_EFFECT_MAX_LATENCY_SAMPLES = 1048576;

export function boundedChannelCount(value: number): number {
  const channels = Math.floor(Number(value));
  return Number.isFinite(channels) ? Math.max(1, Math.min(32, channels)) : 2;
}

export function boundedLiveEffectInteger(value: unknown, fallback: number, min: number, max: number): number {
  const integer = Math.floor(Number(value ?? fallback));
  return Number.isFinite(integer) ? Math.max(min, Math.min(max, integer)) : fallback;
}

export function boundedLiveEffectNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function liveEffectBlockDurationMs(sampleRate: number, maxBlockSize: number): number {
  const rate = Number(sampleRate);
  const frames = Number(maxBlockSize);
  return Number.isFinite(rate) && rate > 0 && Number.isFinite(frames) && frames > 0 ? (frames / rate) * 1000 : 0;
}

export function liveEffectBlockFrames(maxBlockSize: number): number {
  const frames = Math.floor(Number(maxBlockSize));
  return Number.isFinite(frames) && frames > 0 ? Math.min(frames, 8192) : 0;
}

export function boundedOptionalNumber(value: unknown, min: number, max: number): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : undefined;
}

export function boundedLatencySamples(value: unknown, fallback: number): number {
  const bounded = boundedOptionalNumber(value, 0, LIVE_EFFECT_MAX_LATENCY_SAMPLES);
  if (bounded !== undefined) {
    return Math.floor(bounded);
  }
  return Math.floor(boundedOptionalNumber(fallback, 0, LIVE_EFFECT_MAX_LATENCY_SAMPLES) ?? 0);
}

export function combinedLatencySamples(pluginLatencySamples: number, transportLatencySamples: number): number {
  return Math.min(LIVE_EFFECT_MAX_LATENCY_SAMPLES, pluginLatencySamples + transportLatencySamples);
}

export function liveEffectLatencyMilliseconds(samples: number, sampleRate: number): number {
  const boundedSamples = boundedLatencySamples(samples, 0);
  const boundedSampleRate = boundedLiveEffectInteger(sampleRate, 48000, 1, 384000);
  return Number(((boundedSamples / boundedSampleRate) * 1000).toFixed(3));
}
