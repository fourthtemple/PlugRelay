import { PlugRelayLiveEffectRack } from "../packages/web-client/dist/plugrelay-client.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const plugin = {
  pluginId: "mock.live-rack-recreate-events",
  format: "mock",
  inputs: 1,
  outputs: 1
};

function createClient() {
  let created = 0;
  return {
    failCreate: false,
    destroyed: [],
    async createInstance() {
      created += 1;
      if (this.failCreate) {
        throw new Error("create failed");
      }
      return { instanceId: `inst-${created}`, latencySamples: created * 8 };
    },
    async destroyInstance(instanceId) {
      this.destroyed.push(instanceId);
    },
    async processAudioBlockBinary(request) {
      return {
        blockId: request.blockId,
        channels: request.channels,
        latencySamples: 0,
        tailSamples: 0,
        infiniteTail: false,
        renderEngine: "recreate-events",
        bypassed: false,
        healthy: true
      };
    }
  };
}

const client = createClient();
const rack = await PlugRelayLiveEffectRack.create({
  client,
  plugin,
  sampleRate: 48000,
  maxBlockSize: 128
});
let started = 0;
let recreated = 0;
let failed = 0;
let startedDetail;
let recreatedDetail;
rack.addEventListener("recreate-started", (event) => {
  started += 1;
  startedDetail = event.detail;
});
rack.addEventListener("recreated", (event) => {
  recreated += 1;
  recreatedDetail = event.detail;
});
rack.addEventListener("recreate-failed", () => {
  failed += 1;
});
const recreateHealth = await rack.recreate();
assert(recreateHealth.instanceId === "inst-2" && rack.instanceId === "inst-2", "recreate returns the replacement health");
assert(started === 1 && recreated === 1 && failed === 0, "recreate emits started and recreated events");
assert(startedDetail.previousInstanceId === "inst-1", "recreate-started reports the retired instance");
assert(startedDetail.health.instanceId === "inst-1", "recreate-started includes previous health");
assert(recreatedDetail.previousInstanceId === "inst-1", "recreated reports the retired instance");
assert(recreatedDetail.health.instanceId === "inst-2", "recreated includes replacement health");
assert(client.destroyed.includes("inst-1"), "recreate destroys the retired instance");
await rack.destroy();

const failingClient = createClient();
const failingRack = await PlugRelayLiveEffectRack.create({
  client: failingClient,
  plugin,
  sampleRate: 48000,
  maxBlockSize: 128
});
let failedStarted = 0;
let failedRecreated = 0;
let failedEvents = 0;
let effectErrors = 0;
let failedDetail;
failingRack.addEventListener("recreate-started", () => {
  failedStarted += 1;
});
failingRack.addEventListener("recreated", () => {
  failedRecreated += 1;
});
failingRack.addEventListener("recreate-failed", (event) => {
  failedEvents += 1;
  failedDetail = event.detail;
});
failingRack.addEventListener("effect-error", () => {
  effectErrors += 1;
});
failingClient.failCreate = true;
let recreateRejected = false;
try {
  await failingRack.recreate();
} catch (error) {
  recreateRejected = /create failed/.test(String(error?.message));
}
assert(recreateRejected === true, "failed recreate rejects with the create error");
assert(failedStarted === 1 && failedRecreated === 0 && failedEvents === 1, "failed recreate emits started and failed events");
assert(effectErrors === 1, "failed recreate still emits the generic effect-error event");
assert(failedDetail.previousInstanceId === "inst-1", "failed recreate reports the retired instance");
assert(failedDetail.health.healthy === false, "failed recreate event includes failed health");
assert(failingRack.health.unhealthyReason === "processing-error", "failed recreate marks the rack unhealthy");

console.log("Live effect rack recreate event smoke checks passed.");
