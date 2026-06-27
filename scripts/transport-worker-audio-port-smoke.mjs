import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const workerPath = resolve("packages/web-client/dist/soundbridge-transport-worker.js");
const workerSource = readFileSync(workerPath, "utf8").replace(
  /import \{[\s\S]*?\} from "\.\/soundbridge-client\.js";/,
  `
const decodeBinaryAudioEnvelope = globalThis.decodeBinaryAudioEnvelope;
const encodeBinaryAudioEnvelope = globalThis.encodeBinaryAudioEnvelope;
`
);
const postedMessages = [];

class FakeSocket {
  static OPEN = 1;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.OPEN;
    this.sent = [];
    this.listeners = new Map();
    FakeSocket.instances.push(this);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.emit("close", {});
  }

  emit(type, event) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }
}

class TestPort {
  onmessage = undefined;
  messages = [];
  transfers = [];
  closed = false;

  postMessage(message, transfer = []) {
    this.messages.push(message);
    this.transfers.push(transfer);
  }

  close() {
    this.closed = true;
  }
}

const self = {
  onmessage: undefined,
  postMessage(message) {
    postedMessages.push(message);
  }
};
const context = {
  Array,
  ArrayBuffer,
  Float32Array,
  JSON,
  Map,
  Math,
  Number,
  Set,
  String,
  WebSocket: FakeSocket,
  console,
  decodeBinaryAudioEnvelope() {
    throw new Error("binary response decoding is not used by this smoke test");
  },
  encodeBinaryAudioEnvelope() {
    return new ArrayBuffer(8);
  },
  performance: {
    now() {
      return 123;
    }
  },
  self
};
context.globalThis = context;

vm.runInNewContext(workerSource, context, { filename: workerPath });

self.onmessage({ data: { type: "connect", url: "ws://127.0.0.1:47370/bridge" } });
const socket = FakeSocket.instances[0];
assert(socket, "transport worker creates a WebSocket");
socket.emit("open", {});
assert(postedMessages.some((message) => message.type === "connected"), "transport worker reports connection open");

const audioPort = new TestPort();
self.onmessage({
  data: {
    type: "audio-port",
    port: audioPort,
    instanceId: "inst-1",
    sampleRate: 48000,
    sessionToken: "session-1",
    audioTransport: "binary"
  }
});
assert(typeof audioPort.onmessage === "function", "transport worker attaches an audio port handler");

const input = Float32Array.from([0.25, 0.5]);
audioPort.onmessage({
  data: {
    type: "process",
    blockId: 7,
    frames: 2,
    channels: [input]
  }
});
assert(socket.sent.length === 1, "transport worker sends the audio process frame");
assert(audioPort.messages[0]?.type === "recycle-input", "transport worker recycles worklet input after send");
assert(audioPort.messages[0]?.channels?.[0] === input, "transport worker returns the original input channel");
assert(audioPort.transfers[0]?.[0] === input.buffer, "transport worker transfers the recycled input buffer");

socket.emit("message", {
  data: JSON.stringify({
    type: "response",
    id: "audio-1",
    ok: true,
    payload: {
      blockId: 7,
      channels: [[0.75, 1]],
      latencySamples: 0,
      renderEngine: "json-compat"
    }
  })
});
const processed = audioPort.messages.find((message) => message.type === "processed");
assert(processed?.channels?.[0]?.[0] === 0.75, "transport worker routes JSON-compatible processed responses");
assert(
  audioPort.transfers.at(-1).length === 0,
  "transport worker does not try to transfer plain JSON channel arrays"
);

console.log("Transport worker audio port smoke checks passed.");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
