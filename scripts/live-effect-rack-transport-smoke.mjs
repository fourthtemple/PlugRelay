import { SoundBridgeLiveEffectRack } from "../packages/web-client/dist/soundbridge-client.js";

const plugin = {
  pluginId: "mock.live-effect.transport",
  format: "mock",
  name: "Live Effect Transport",
  vendor: "SoundBridge",
  kind: "effect",
  inputs: 1,
  outputs: 1,
  parameters: []
};

class FakeClient {
  constructor() {
    this.processed = [];
  }

  async createInstance(request) {
    return { instanceId: "inst-rack-transport", plugin, latencySamples: 12, layout: request };
  }

  async processAudioBlockBinary(request) {
    this.processed.push(request);
    return {
      blockId: request.blockId,
      channels: request.channels,
      latencySamples: 12,
      tailSamples: 0,
      infiniteTail: false,
      renderEngine: "fake-rack-transport"
    };
  }

  async getLatency(_instanceId, transportLatencySamples = 0) {
    return {
      pluginLatencySamples: 12,
      transportLatencySamples,
      reportedLatencySamples: 12 + transportLatencySamples
    };
  }
}

const client = new FakeClient();
const rack = await SoundBridgeLiveEffectRack.create({ client, plugin, sampleRate: 48000, maxBlockSize: 128 });
await rack.refreshLatency(256);
await rack.processBlock({ blockId: 10, channels: [[1, 0]] });

const generated = client.processed.at(-1)?.transport;
assert(generated?.playing === true, "live rack default transport starts in playing state");
assert(generated?.samplePosition === 1536, "live rack default transport compensates host output latency");

await rack.processBlock({ blockId: 11, channels: [[1, 0]], transport: { playing: false, samplePosition: 7 } });
const explicit = client.processed.at(-1)?.transport;
assert(explicit?.playing === false && explicit?.samplePosition === 7, "live rack preserves explicit host transport");

console.log("Live effect rack transport smoke checks passed.");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
