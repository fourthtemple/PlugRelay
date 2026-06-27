import {
  __soundBridgeDecodeBinaryAudioEnvelope as decodeBinaryAudioEnvelope,
  __soundBridgeEncodeBinaryAudioEnvelope as encodeBinaryAudioEnvelope
} from "./soundbridge-client.js";

let socket;
let audioRequestSeq = 0;
const pendingAudioPorts = /* @__PURE__ */ new Map();
const pendingSharedAudio = /* @__PURE__ */ new Map();
const SHARED_AUDIO_HEADER_INTS = 8;
const SHARED_AUDIO_SLOT_INTS = 4;
const SHARED_WRITE_INDEX = 0;
const SHARED_READ_INDEX = 1;
const SHARED_AVAILABLE = 2;
const SHARED_DROPPED = 3;
const SHARED_BLOCK_ID_OFFSET = 0;
const SHARED_BLOCK_FRAMES_OFFSET = 1;
const SHARED_BLOCK_CHANNELS_OFFSET = 2;
const SHARED_AUDIO_WAIT_TIMEOUT_MS = 100;

self.onmessage = (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") {
    return;
  }
  if (message.type === "connect") {
    connect(String(message.url ?? ""));
    return;
  }
  if (message.type === "request") {
    sendRequest(message.envelope, message.binaryAudioChannels);
    return;
  }
  if (message.type === "audio-port" && message.port) {
    connectAudioPort(message.port, {
      instanceId: String(message.instanceId ?? ""),
      sampleRate: Number(message.sampleRate ?? 48000),
      sessionToken: String(message.sessionToken ?? ""),
      audioTransport: message.audioTransport === "json" ? "json" : "binary"
    }, message.sharedAudio);
    return;
  }
  if (message.type === "close") {
    socket?.close();
  }
};

function connect(url) {
  socket?.close();
  socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  socket.addEventListener("open", () => {
    post({ type: "connected" });
  });
  socket.addEventListener("error", () => {
    post({ type: "connect-error", message: `Unable to connect to ${url}` });
  });
  socket.addEventListener("close", () => {
    post({ type: "closed" });
  });
  socket.addEventListener("message", (event) => {
    try {
      const envelope = typeof event.data === "string" ? JSON.parse(event.data) : decodeBinaryAudioEnvelope(event.data);
      if (routeAudioResponse(envelope)) {
        return;
      }
      post({ type: "message", envelope });
    } catch {
      post({ type: "protocol-error", message: "SoundBridge worker transport received an invalid message." });
    }
  });
}

function connectAudioPort(port, config, sharedAudioDescriptor) {
  const sharedAudio = normalizeSharedAudioPort(port, sharedAudioDescriptor);
  port.onmessage = (event) => {
    const message = event.data;
    if (message?.type === "destroy") {
      if (sharedAudio) {
        sharedAudio.closed = true;
      }
      port.close();
      return;
    }
    if (message?.type === "process") {
      sendAudioProcess(port, config, message);
    }
  };
  if (sharedAudio) {
    sharedAudio.wakeMode = sharedAudioWakeMode();
    port.postMessage({ type: "shared-audio-status", wakeMode: sharedAudio.wakeMode });
    pumpSharedAudio(config, sharedAudio);
  }
}

function sendAudioProcess(port, config, message) {
  const channels = Array.isArray(message.channels) ? message.channels : [];
  const frames = boundedFrames(message.frames ?? channels[0]?.length ?? 128);
  const recyclableInput = recyclableInputChannels(channels, frames);
  const blockId = Math.floor(Number(message.blockId ?? 0));
  const samplePosition = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, blockId * frames));
  const binary = config.audioTransport === "binary";
  const payload = {
    instanceId: config.instanceId,
    blockId,
    sampleRate: config.sampleRate,
    ...(binary ? {} : { channels: channels.map((channel) => Array.from(channel)) }),
    transport: { playing: true, samplePosition },
    timestamp: performance.now()
  };
  const envelope = {
    type: "request",
    id: `audio-${++audioRequestSeq}`,
    command: "processAudioBlock",
    sessionToken: config.sessionToken,
    payload
  };
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    recycleAudioInput(port, recyclableInput, frames);
    port.postMessage({ type: "audio-error", blockId, error: "SoundBridge worker transport is not connected." });
    return;
  }
  try {
    pendingAudioPorts.set(envelope.id, port);
    socket.send(binary ? encodeBinaryAudioEnvelope(envelope, channels) : JSON.stringify(envelope));
    recycleAudioInput(port, recyclableInput, frames);
  } catch (error) {
    pendingAudioPorts.delete(envelope.id);
    recycleAudioInput(port, recyclableInput, frames);
    port.postMessage({ type: "audio-error", blockId, error: String(error instanceof Error ? error.message : error) });
  }
}

function recyclableInputChannels(channels, frames) {
  return channels.filter(
    (channel) =>
      channel instanceof Float32Array &&
      channel.length === frames &&
      channel.byteOffset === 0 &&
      channel.buffer instanceof ArrayBuffer &&
      channel.byteLength === channel.buffer.byteLength &&
      channel.buffer.byteLength >= frames * Float32Array.BYTES_PER_ELEMENT
  );
}

function recycleAudioInput(port, channels, frames) {
  if (channels.length === 0) {
    return;
  }
  const transfer = [];
  const recycled = [];
  const seenBuffers = new Set();
  for (const channel of channels) {
    if (seenBuffers.has(channel.buffer)) {
      continue;
    }
    seenBuffers.add(channel.buffer);
    recycled.push(channel);
    transfer.push(channel.buffer);
  }
  try {
    port.postMessage({ type: "recycle-input", frames, channels: recycled }, transfer);
  } catch {
  }
}

function routeAudioResponse(envelope) {
  const shared = envelope.id ? pendingSharedAudio.get(envelope.id) : void 0;
  if (shared) {
    pendingSharedAudio.delete(envelope.id ?? "");
    if (envelope.ok && envelope.payload && typeof envelope.payload === "object") {
      const payload = envelope.payload;
      writeSharedOutputBlock(shared, Math.floor(Number(payload.blockId ?? 0)), Array.isArray(payload.channels) ? payload.channels : []);
      if (typeof payload.renderEngine === "string") {
        shared.port.postMessage({ type: "process-diagnostics", blockId: payload.blockId, renderEngine: payload.renderEngine });
      }
    } else {
      shared.port.postMessage({ type: "audio-error", error: envelope.error });
    }
    return true;
  }
  const port = envelope.id ? pendingAudioPorts.get(envelope.id) : void 0;
  if (!port) {
    return false;
  }
  pendingAudioPorts.delete(envelope.id ?? "");
  if (envelope.ok && envelope.payload && typeof envelope.payload === "object") {
    const payload = envelope.payload;
    const channels = Array.isArray(payload.channels) ? payload.channels : [];
    port.postMessage(
      {
        type: "processed",
        blockId: payload.blockId,
        channels,
        latencySamples: payload.latencySamples,
        renderEngine: payload.renderEngine
      },
      transferableChannelBuffers(channels)
    );
  } else {
    port.postMessage({ type: "audio-error", error: envelope.error });
  }
  return true;
}

function transferableChannelBuffers(channels) {
  const transfer = [];
  const seenBuffers = new Set();
  for (const channel of channels) {
    if (
      channel instanceof Float32Array &&
      channel.byteOffset === 0 &&
      channel.buffer instanceof ArrayBuffer &&
      channel.byteLength === channel.buffer.byteLength &&
      !seenBuffers.has(channel.buffer)
    ) {
      seenBuffers.add(channel.buffer);
      transfer.push(channel.buffer);
    }
  }
  return transfer;
}

function pumpSharedAudio(config, shared) {
  if (shared.closed) {
    return;
  }
  drainSharedAudio(config, shared);
  scheduleSharedAudioPump(config, shared);
}

function scheduleSharedAudioPump(config, shared) {
  if (shared.closed) {
    return;
  }
  if (shared.wakeMode === "atomics" && Atomics.load(shared.inputControl, SHARED_AVAILABLE) === 0) {
    const waitResult = Atomics.waitAsync(shared.inputControl, SHARED_AVAILABLE, 0, SHARED_AUDIO_WAIT_TIMEOUT_MS);
    if (waitResult.async) {
      waitResult.value.then(
        () => pumpSharedAudio(config, shared),
        () => pumpSharedAudio(config, shared)
      );
      return;
    }
  }
  setTimeout(() => pumpSharedAudio(config, shared), Atomics.load(shared.inputControl, SHARED_AVAILABLE) > 0 ? 0 : 1);
}

function drainSharedAudio(config, shared) {
  while (!shared.closed && Atomics.load(shared.inputControl, SHARED_AVAILABLE) > 0) {
    const readIndex = Atomics.load(shared.inputControl, SHARED_READ_INDEX) % shared.slots;
    const block = readSharedInputBlock(shared, readIndex);
    Atomics.store(shared.inputControl, SHARED_READ_INDEX, (readIndex + 1) % shared.slots);
    Atomics.sub(shared.inputControl, SHARED_AVAILABLE, 1);
    sendSharedAudioProcess(config, shared, block);
  }
}

function sendSharedAudioProcess(config, shared, block) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    shared.port.postMessage({ type: "audio-error", blockId: block.blockId, error: "SoundBridge worker transport is not connected." });
    return;
  }
  const samplePosition = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, block.blockId * block.frames));
  const binary = config.audioTransport === "binary";
  const payload = {
    instanceId: config.instanceId,
    blockId: block.blockId,
    sampleRate: config.sampleRate,
    ...(binary ? {} : { channels: block.channels.map((channel) => Array.from(channel)) }),
    transport: { playing: true, samplePosition },
    timestamp: performance.now()
  };
  const envelope = {
    type: "request",
    id: `audio-${++audioRequestSeq}`,
    command: "processAudioBlock",
    sessionToken: config.sessionToken,
    payload
  };
  try {
    pendingSharedAudio.set(envelope.id, shared);
    socket.send(binary ? encodeBinaryAudioEnvelope(envelope, block.channels) : JSON.stringify(envelope));
  } catch (error) {
    pendingSharedAudio.delete(envelope.id);
    shared.port.postMessage({ type: "audio-error", blockId: block.blockId, error: String(error instanceof Error ? error.message : error) });
  }
}

function readSharedInputBlock(shared, slotIndex) {
  const metadataOffset = sharedSlotMetadataOffset(slotIndex);
  const blockId = Atomics.load(shared.inputControl, metadataOffset + SHARED_BLOCK_ID_OFFSET);
  const frames = Math.min(shared.frames, boundedFrames(Atomics.load(shared.inputControl, metadataOffset + SHARED_BLOCK_FRAMES_OFFSET)));
  const channelCount = Math.max(1, Math.min(shared.channels, Atomics.load(shared.inputControl, metadataOffset + SHARED_BLOCK_CHANNELS_OFFSET)));
  const channels = [];
  const base = sharedAudioOffset(shared, slotIndex);
  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const offset = base + channelIndex * shared.frames;
    channels.push(Float32Array.from(shared.inputAudio.subarray(offset, offset + frames)));
  }
  return { blockId, frames, channels };
}

function writeSharedOutputBlock(shared, blockId, channels) {
  const frames = Math.min(shared.frames, boundedFrames(channels[0]?.length ?? shared.frames));
  const channelCount = Math.min(shared.channels, channels.length);
  const available = Atomics.load(shared.outputControl, SHARED_AVAILABLE);
  if (available >= shared.slots) {
    Atomics.add(shared.outputControl, SHARED_DROPPED, 1);
    return;
  }
  const writeIndex = Atomics.load(shared.outputControl, SHARED_WRITE_INDEX) % shared.slots;
  const metadataOffset = sharedSlotMetadataOffset(writeIndex);
  Atomics.store(shared.outputControl, metadataOffset + SHARED_BLOCK_ID_OFFSET, blockId);
  Atomics.store(shared.outputControl, metadataOffset + SHARED_BLOCK_FRAMES_OFFSET, frames);
  Atomics.store(shared.outputControl, metadataOffset + SHARED_BLOCK_CHANNELS_OFFSET, channelCount);
  const base = sharedAudioOffset(shared, writeIndex);
  for (let channelIndex = 0; channelIndex < shared.channels; channelIndex += 1) {
    const offset = base + channelIndex * shared.frames;
    const source = channels[channelIndex] ?? channels[0];
    if (source) {
      for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
        const sample = Number(source[frameIndex] ?? 0);
        shared.outputAudio[offset + frameIndex] = Number.isFinite(sample) ? sample : 0;
      }
      if (frames < shared.frames) {
        shared.outputAudio.fill(0, offset + frames, offset + shared.frames);
      }
    } else {
      shared.outputAudio.fill(0, offset, offset + shared.frames);
    }
  }
  Atomics.store(shared.outputControl, SHARED_WRITE_INDEX, (writeIndex + 1) % shared.slots);
  Atomics.add(shared.outputControl, SHARED_AVAILABLE, 1);
  Atomics.notify(shared.outputControl, SHARED_AVAILABLE, 1);
}

function normalizeSharedAudioPort(port, value) {
  if (!value || typeof value !== "object" || typeof SharedArrayBuffer === "undefined") {
    return void 0;
  }
  const descriptor = value;
  const slots = boundedSharedInteger(descriptor.slots, 0, 2, 64);
  const channels = boundedSharedInteger(descriptor.channels, 0, 1, 32);
  const frames = boundedSharedInteger(descriptor.frames, 0, 1, 8192);
  if (
    descriptor.version !== 1 ||
    !(descriptor.inputControl instanceof SharedArrayBuffer) ||
    !(descriptor.inputAudio instanceof SharedArrayBuffer) ||
    !(descriptor.outputControl instanceof SharedArrayBuffer) ||
    !(descriptor.outputAudio instanceof SharedArrayBuffer)
  ) {
    return void 0;
  }
  return {
    port,
    closed: false,
    wakeMode: "timer",
    slots,
    channels,
    frames,
    inputControl: new Int32Array(descriptor.inputControl),
    inputAudio: new Float32Array(descriptor.inputAudio),
    outputControl: new Int32Array(descriptor.outputControl),
    outputAudio: new Float32Array(descriptor.outputAudio)
  };
}

function sharedAudioWakeMode() {
  return typeof Atomics.waitAsync === "function" ? "atomics" : "timer";
}

function sharedSlotMetadataOffset(slotIndex) {
  return SHARED_AUDIO_HEADER_INTS + slotIndex * SHARED_AUDIO_SLOT_INTS;
}

function sharedAudioOffset(shared, slotIndex) {
  return slotIndex * shared.channels * shared.frames;
}

function boundedSharedInteger(value, fallback, min, max) {
  const integer = Math.floor(Number(value ?? fallback));
  return Number.isFinite(integer) ? Math.max(min, Math.min(max, integer)) : fallback;
}

function boundedFrames(value) {
  const frames = Math.floor(Number(value));
  return Number.isFinite(frames) ? Math.max(1, Math.min(8192, frames)) : 128;
}

function sendRequest(envelope, binaryAudioChannels) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    post({ type: "send-error", id: requestId(envelope), message: "SoundBridge worker transport is not connected." });
    return;
  }
  try {
    socket.send(binaryAudioChannels ? encodeBinaryAudioEnvelope(envelope, binaryAudioChannels) : JSON.stringify(envelope));
  } catch (error) {
    post({ type: "send-error", id: requestId(envelope), message: String(error instanceof Error ? error.message : error) });
  }
}

function requestId(envelope) {
  return envelope && typeof envelope === "object" ? String(envelope.id ?? "") : undefined;
}

function post(message) {
  self.postMessage(message);
}
