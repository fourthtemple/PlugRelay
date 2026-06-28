import { SoundBridgeLiveEffectRack } from "../packages/web-client/dist/soundbridge-client.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const plugin = {
  pluginId: "mock.live-rack-budget-trip-events",
  format: "mock",
  inputs: 1,
  outputs: 1
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createResponse(request, extra = {}) {
  return {
    blockId: request.blockId,
    channels: request.channels,
    latencySamples: 0,
    tailSamples: 0,
    infiniteTail: false,
    renderEngine: "budget-trip-events",
    bypassed: false,
    healthy: true,
    ...extra
  };
}

function createClient(processAudioBlockBinary) {
  let created = 0;
  return {
    async createInstance() {
      created += 1;
      return { instanceId: `inst-${created}`, latencySamples: 0 };
    },
    async destroyInstance() {},
    processAudioBlockBinary
  };
}

const processBudgetClient = createClient(async (request) => {
  await sleep(5);
  return createResponse(request);
});
const processBudgetRack = await SoundBridgeLiveEffectRack.create({
  client: processBudgetClient,
  plugin,
  sampleRate: 48000,
  maxBlockSize: 128,
  processBudgetMs: 1,
  maxConsecutiveProcessBudgetMisses: 1
});
let processTripEvents = 0;
let renderTripEventsDuringProcess = 0;
let processEffectErrors = 0;
let processTripDetail;
processBudgetRack.addEventListener("process-budget-tripped", (event) => {
  processTripEvents += 1;
  processTripDetail = event.detail;
});
processBudgetRack.addEventListener("render-budget-tripped", () => {
  renderTripEventsDuringProcess += 1;
});
processBudgetRack.addEventListener("effect-error", () => {
  processEffectErrors += 1;
});
const processDry = await processBudgetRack.processBlock({ blockId: 1, channels: [[0.5]] });
assert(processDry.bypassed === true && processDry.healthy === false, "process-budget trip fails dry");
assert(processBudgetRack.health.unhealthyReason === "process-budget-exceeded", "process-budget trip records unhealthy reason");
assert(processTripEvents === 1 && processEffectErrors === 1, "process-budget trip emits dedicated and generic events");
assert(renderTripEventsDuringProcess === 0, "process-budget trip does not emit render-budget trip event");
assert(
  processTripDetail.error?.message === "process_budget_exceeded" &&
    processTripDetail.health.unhealthyReason === "process-budget-exceeded",
  "process-budget trip event carries error and health"
);
await processBudgetRack.destroy();

const renderBudgetClient = createClient(async (request) =>
  createResponse(request, {
    renderDurationMs: 9,
    renderBudgetMs: 2,
    renderBudgetExceeded: true
  })
);
const renderBudgetRack = await SoundBridgeLiveEffectRack.create({
  client: renderBudgetClient,
  plugin,
  sampleRate: 48000,
  maxBlockSize: 128,
  maxConsecutiveRenderBudgetMisses: 1
});
let renderTripEvents = 0;
let processTripEventsDuringRender = 0;
let renderEffectErrors = 0;
let renderTripDetail;
renderBudgetRack.addEventListener("render-budget-tripped", (event) => {
  renderTripEvents += 1;
  renderTripDetail = event.detail;
});
renderBudgetRack.addEventListener("process-budget-tripped", () => {
  processTripEventsDuringRender += 1;
});
renderBudgetRack.addEventListener("effect-error", () => {
  renderEffectErrors += 1;
});
const renderDry = await renderBudgetRack.processBlock({ blockId: 2, channels: [[0.25]] });
assert(renderDry.bypassed === true && renderDry.healthy === false, "render-budget trip fails dry");
assert(renderBudgetRack.health.unhealthyReason === "render-budget-exceeded", "render-budget trip records unhealthy reason");
assert(renderTripEvents === 1 && renderEffectErrors === 1, "render-budget trip emits dedicated and generic events");
assert(processTripEventsDuringRender === 0, "render-budget trip does not emit process-budget trip event");
assert(
  renderTripDetail.error?.message === "render_budget_exceeded" &&
    renderTripDetail.health.unhealthyReason === "render-budget-exceeded",
  "render-budget trip event carries error and health"
);
await renderBudgetRack.destroy();

console.log("Live effect rack budget trip event smoke checks passed.");
