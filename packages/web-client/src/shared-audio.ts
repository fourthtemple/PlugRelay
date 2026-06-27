export interface SharedAudioTransportOptions {
  audioTransferMode?: "auto" | "message" | "shared";
  channels?: number;
  maxBlockFrames?: number;
  sharedBufferBlocks?: number;
}

export interface SharedAudioTransportDescriptor {
  version: 1;
  slots: number;
  channels: number;
  frames: number;
  inputControl: SharedArrayBuffer;
  inputAudio: SharedArrayBuffer;
  outputControl: SharedArrayBuffer;
  outputAudio: SharedArrayBuffer;
}

const SHARED_AUDIO_VERSION = 1;
const SHARED_AUDIO_HEADER_INTS = 8;
const SHARED_AUDIO_SLOT_INTS = 4;
const MAX_SHARED_CHANNELS = 32;
const MAX_SHARED_FRAMES = 8192;

export function createSharedAudioTransport(options: SharedAudioTransportOptions): SharedAudioTransportDescriptor | undefined {
  const mode = options.audioTransferMode ?? "auto";
  if (mode === "message" || typeof SharedArrayBuffer === "undefined" || globalThis.crossOriginIsolated !== true) {
    return undefined;
  }
  const slots = boundedSharedInteger(options.sharedBufferBlocks, 8, 2, 64);
  const channels = boundedSharedInteger(options.channels, 2, 1, MAX_SHARED_CHANNELS);
  const frames = boundedSharedInteger(options.maxBlockFrames, 128, 1, MAX_SHARED_FRAMES);
  const controlBytes = Int32Array.BYTES_PER_ELEMENT * (SHARED_AUDIO_HEADER_INTS + slots * SHARED_AUDIO_SLOT_INTS);
  const audioBytes = Float32Array.BYTES_PER_ELEMENT * slots * channels * frames;
  return {
    version: SHARED_AUDIO_VERSION,
    slots,
    channels,
    frames,
    inputControl: initializedSharedControl(slots, channels, frames, controlBytes),
    inputAudio: new SharedArrayBuffer(audioBytes),
    outputControl: initializedSharedControl(slots, channels, frames, controlBytes),
    outputAudio: new SharedArrayBuffer(audioBytes)
  };
}

function initializedSharedControl(slots: number, channels: number, frames: number, bytes: number): SharedArrayBuffer {
  const buffer = new SharedArrayBuffer(bytes);
  new Int32Array(buffer).set([0, 0, 0, 0, slots, channels, frames, SHARED_AUDIO_VERSION]);
  return buffer;
}

function boundedSharedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const integer = Math.floor(Number(value ?? fallback));
  return Number.isFinite(integer) ? Math.max(min, Math.min(max, integer)) : fallback;
}
