import crypto from "node:crypto";
import { applyNativeParameterSnapshot } from "./daemon-parameter-snapshots.mjs";

export function createDaemonInstanceFactory({
  clonePluginLayout,
  clonePluginMetadata,
  formatNativeHostName,
  instanceMap,
  limits,
  makeProtocolError,
  normalizePluginLayout,
  requireIntInRange,
  requireSampleRate,
  resolvePlugin,
  validateNativeHostBlockSizeProfile,
  workerConstructors
}) {
  const {
    maxAudioChannels,
    maxBlockSize,
    maxInstancesPerSession,
    maxPluginParameters,
    maxTotalInstances
  } = limits;

  return async function createInstance(payload, session) {
    enforceInstanceQuotas({ instanceMap, maxInstancesPerSession, maxTotalInstances, session, makeProtocolError });

    const plugin = resolveHostablePlugin(payload.pluginId, resolvePlugin, makeProtocolError);
    const sampleRate = requireSampleRate(payload.sampleRate ?? 48000);
    const maxBlockSizeForInstance = requireIntInRange(payload.maxBlockSize ?? 128, 1, maxBlockSize, "maxBlockSize");
    const inputChannels = requireIntInRange(payload.inputChannels ?? plugin.inputs ?? 2, 0, maxAudioChannels, "inputChannels");
    const outputChannels = requireIntInRange(payload.outputChannels ?? plugin.outputs ?? 2, 1, maxAudioChannels, "outputChannels");
    validateNativeHostBlockSizeProfile(plugin.nativeHost, maxBlockSizeForInstance);

    const instanceId = `inst-${crypto.randomUUID()}`;
    const instance = {
      instanceId,
      ownerSessionToken: session.sessionToken,
      ownerOrigin: session.origin,
      pluginId: plugin.pluginId,
      format: plugin.format,
      kind: plugin.kind,
      source: plugin.source ?? "unknown",
      executablePath: plugin.executablePath,
      engine: plugin.engine ?? "effect",
      sampleRate,
      maxBlockSize: maxBlockSizeForInstance,
      inputChannels,
      outputChannels,
      layout: normalizePluginLayout(undefined, {
        requestedInputChannels: inputChannels,
        requestedOutputChannels: outputChannels,
        inputChannels,
        outputChannels,
        inputBuses: inputChannels > 0 ? 1 : 0,
        outputBuses: 1,
        sampleRate,
        maxBlockSize: maxBlockSizeForInstance
      }),
      parameters: plugin.parameters.map((parameter) => ({ ...parameter })),
      fileGrantOperations: Array.isArray(plugin.fileGrantOperations) ? [...plugin.fileGrantOperations] : [],
      vst3ProgramLists: plugin.vst3ProgramLists ?? [],
      vst3NoteExpressions: plugin.vst3NoteExpressions ?? [],
      nativeParameterIds: new Set(),
      fileGrantAttachments: new Map(),
      pluginLatencySamples: 0,
      pluginTailSamples: 0,
      pluginInfiniteTail: false,
      automationLanes: new Map(),
      voices: new Map(),
      renderEngine: undefined,
      worker: undefined
    };

    await attachInstanceWorker({ instance, plugin, maxPluginParameters, workerConstructors, formatNativeHostName, makeProtocolError });
    instanceMap.set(instanceId, instance);
    session.instances.add(instanceId);

    return {
      instanceId,
      plugin: clonePluginMetadata({
        ...plugin,
        inputs: instance.inputChannels,
        outputs: instance.outputChannels,
        parameters: instance.parameters,
        vst3ProgramLists: instance.vst3ProgramLists,
        vst3NoteExpressions: instance.vst3NoteExpressions
      }),
      layout: clonePluginLayout(instance.layout),
      latencySamples: instance.pluginLatencySamples,
      tailSamples: instance.pluginTailSamples,
      infiniteTail: instance.pluginInfiniteTail
    };
  };
}

function enforceInstanceQuotas({ instanceMap, maxInstancesPerSession, maxTotalInstances, session, makeProtocolError }) {
  if (session.instances.size >= maxInstancesPerSession) {
    throw makeProtocolError("quota_exceeded", "This browser session has reached its plugin instance limit.", {
      maxInstancesPerSession
    });
  }
  if (instanceMap.size >= maxTotalInstances) {
    throw makeProtocolError("quota_exceeded", "The local PlugRelay daemon has reached its total plugin instance limit.", {
      maxTotalInstances
    });
  }
}

function resolveHostablePlugin(pluginId, resolvePlugin, makeProtocolError) {
  const plugin = resolvePlugin(pluginId);
  if (!plugin) {
    throw makeProtocolError("plugin_not_found", `Unknown plugin: ${pluginId}`);
  }
  if (plugin.hostable === false) {
    throw makeProtocolError("plugin_not_hostable", `${plugin.name} was discovered by the native scanner but cannot be hosted yet.`, {
      pluginId: plugin.pluginId,
      format: plugin.format,
      source: plugin.source,
      reason: plugin.hostUnavailableReason
    });
  }
  return plugin;
}

async function attachInstanceWorker({ instance, plugin, maxPluginParameters, workerConstructors, formatNativeHostName, makeProtocolError }) {
  if (plugin.nativeHost) {
    await attachNativeWorker({ instance, plugin, maxPluginParameters, NativeHostWorker: workerConstructors.NativeHostWorker, formatNativeHostName, makeProtocolError });
  } else if (instance.executablePath && instance.kind === "instrument") {
    instance.worker = new workerConstructors.ExampleInstrumentWorker(instance.executablePath);
    instance.renderEngine = instance.worker.renderEngine;
  }
}

async function attachNativeWorker({ instance, plugin, maxPluginParameters, NativeHostWorker, formatNativeHostName, makeProtocolError }) {
  instance.nativeHost = plugin.nativeHost;
  instance.worker = new NativeHostWorker(plugin.nativeHost, instance);
  instance.renderEngine = instance.worker.renderEngine;
  try {
    await instance.worker.ready;
    applyNativeParameterSnapshot(instance, await instance.worker.getParameters(), maxPluginParameters);
    if (plugin.nativeHost.format === "vst3") {
      instance.vst3ProgramLists = await instance.worker.getVst3ProgramLists();
      instance.vst3NoteExpressions = await instance.worker.getVst3NoteExpressions();
    }
    const nativeLayout = await instance.worker.getLayout();
    instance.layout = nativeLayout;
    instance.inputChannels = nativeLayout.inputChannels;
    instance.outputChannels = nativeLayout.outputChannels;
    instance.pluginLatencySamples = await instance.worker.getLatency();
    const tail = await instance.worker.getTailTime();
    instance.pluginTailSamples = tail.tailSamples;
    instance.pluginInfiniteTail = tail.infiniteTail;
  } catch (error) {
    instance.worker.destroy();
    throw makeProtocolError("plugin_host_failed", `${formatNativeHostName(plugin.nativeHost.format)} host worker failed for ${plugin.name}.`, {
      pluginId: plugin.pluginId,
      reason: error.message
    });
  }
}
