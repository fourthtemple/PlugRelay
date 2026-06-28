const UNPAIRED_COMMANDS = new Set(["hello", "pair", "heartbeat"]);

export function createDaemonCommandDispatcher({
  assertPaired,
  clonePluginMetadata,
  fileGrantSupport,
  getInstance,
  handlers,
  helloResponse,
  instanceFileGrantSupport,
  maxPluginParameters,
  pair,
  parameterSnapshotResponse,
  plugins,
  protocolError,
  useFileGrant
}) {
  return async function dispatchCommand(envelope, context) {
    const { command, payload } = envelope;
    const session = sessionForCommand({ assertPaired, command, context, sessionToken: envelope.sessionToken });

    switch (command) {
      case "hello":
        return helloResponse(Boolean(session));

      case "pair":
        return pair(payload, context);

      case "scanPlugins":
        return {
          plugins: filterPlugins(payload, plugins).map(clonePluginMetadata),
          scannedAt: Date.now(),
          nativeSearchPaths: []
        };

      case "listPlugins":
        return {
          plugins: filterPlugins(payload, plugins).map(clonePluginMetadata)
        };

      case "createInstance":
        return handlers.createInstance(payload, session);

      case "destroyInstance":
        return handlers.destroyInstance(payload.instanceId, session);

      case "getParameters":
        return parameterSnapshotResponse(getInstance(payload.instanceId, session), maxPluginParameters);

      case "setParameter":
        return handlers.setParameter(payload.instanceId, payload.parameterId, payload.normalizedValue, session);

      case "setParameterDisplayValue":
        return handlers.setParameterDisplayValue(payload.instanceId, payload.parameterId, payload.displayValue, session);

      case "setPreset":
        return handlers.setPreset(payload.instanceId, payload.presetId, session);

      case "getVst3ProgramData":
        return handlers.getVst3ProgramData(payload.instanceId, payload.programListId, payload.programIndex, session);

      case "setVst3ProgramData":
        return handlers.setVst3ProgramData(payload.instanceId, payload.programData, session);

      case "setParameterEvents":
        return handlers.setParameterEvents(payload.instanceId, payload.events, session);

      case "setParameterCurve":
        return handlers.setParameterCurve(payload.instanceId, payload.parameterId, payload.points, payload.interpolation, session);

      case "setAutomationLane":
        return handlers.setAutomationLane(payload.instanceId, payload.parameterId, payload.points, session);

      case "clearAutomationLane":
        return handlers.clearAutomationLane(payload.instanceId, payload.parameterId, session);

      case "getState":
        return handlers.getState(payload.instanceId, session);

      case "setState":
        return handlers.setState(payload.instanceId, payload.state, session);

      case "processAudioBlock":
        return handlers.processAudioBlock(payload, session, { binaryAudioRequest: context?.binaryAudioRequest === true });

      case "sendMidiEvents":
        return handlers.sendMidiEvents(payload.instanceId, payload.events, session);

      case "getLatency":
        return handlers.getLatency(payload, session);

      case "getTailTime":
        return handlers.getTailTime(payload, session);

      case "getLayout":
        return handlers.getLayout(payload, session);

      case "openEditor":
        return handlers.openEditor(payload, session);

      case "closeEditor":
        return handlers.closeEditor(payload.editorId, session);

      case "createFileGrant":
        return fileGrantSupport.createFileGrant(payload, session);

      case "listFileGrants":
        return fileGrantSupport.listFileGrants(payload, session);

      case "revokeFileGrant":
        return fileGrantSupport.revokeFileGrant(payload.grantId, session);

      case "attachFileGrant":
        return instanceFileGrantSupport.attachFileGrant(payload, session, getInstance);

      case "listInstanceFileGrants":
        return instanceFileGrantSupport.listInstanceFileGrants(payload, session, getInstance);

      case "detachFileGrant":
        return instanceFileGrantSupport.detachFileGrant(payload, session, getInstance);

      case "useFileGrant":
        return useFileGrant(payload, session);

      case "heartbeat":
        return {
          now: Date.now(),
          echo: payload.now
        };

      default:
        throw protocolError("unknown_command", `Unknown command: ${command}`);
    }
  };
}

function sessionForCommand({ assertPaired, command, context, sessionToken }) {
  if (command === "hello" && sessionToken) {
    return assertPaired(sessionToken, command, context);
  }
  if (!UNPAIRED_COMMANDS.has(command)) {
    return assertPaired(sessionToken, command, context);
  }
  return undefined;
}

function filterPlugins(payload, plugins) {
  const formats = Array.isArray(payload.formats)
    ? new Set(payload.formats.map((format) => String(format)))
    : undefined;
  if (!formats || formats.size === 0) {
    return plugins;
  }
  return plugins.filter((plugin) => formats.has(plugin.format));
}
