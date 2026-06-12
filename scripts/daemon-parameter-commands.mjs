export function createDaemonParameterCommands({
  assertParameterAutomatable,
  assertParameterWritable,
  collectAutomationLaneEvents,
  getInstance,
  getPlugin,
  limits,
  makeNativeUpdatedParameter,
  makeProtocolError,
  makeUpdatedParameter,
  normalizeAutomationLanePoints,
  normalizeParameterCurve,
  normalizeParameterEvents,
  normalizePresetSnapshot,
  normalizedValueFromDisplayValue,
  requireNumberInRange,
  requireParameterDisplayValue,
  requireParameterId,
  requirePresetId,
  validateParameterSampleOffsetForBlockProfile
}) {
  const {
    maxAutomationLanesPerInstance,
    maxPluginPresets
  } = limits;

  async function setParameter(instanceId, parameterId, normalizedValue, session) {
    const instance = getInstance(instanceId, session);
    const safeParameterId = requireParameterId(parameterId, "parameterId");
    const parameterIndex = instance.parameters.findIndex((parameter) => parameter.id === safeParameterId);
    if (parameterIndex < 0) {
      throw makeProtocolError("parameter_not_found", `Unknown parameter: ${safeParameterId}`);
    }
    assertParameterWritable(instance.parameters[parameterIndex]);

    const value = requireNumberInRange(normalizedValue, 0, 1, "normalizedValue");
    await applyParameterValue(instance, parameterIndex, value, 0);

    return {
      parameter: { ...instance.parameters[parameterIndex] }
    };
  }

  async function setParameterDisplayValue(instanceId, parameterId, displayValue, session) {
    const instance = getInstance(instanceId, session);
    const safeParameterId = requireParameterId(parameterId, "parameterId");
    const parameterIndex = instance.parameters.findIndex((parameter) => parameter.id === safeParameterId);
    if (parameterIndex < 0) {
      throw makeProtocolError("parameter_not_found", `Unknown parameter: ${safeParameterId}`);
    }
    assertParameterWritable(instance.parameters[parameterIndex]);

    const safeDisplayValue = requireParameterDisplayValue(displayValue, "displayValue");
    await applyParameterDisplayValue(instance, parameterIndex, safeDisplayValue);

    return {
      parameter: { ...instance.parameters[parameterIndex] }
    };
  }

  async function setPreset(instanceId, presetId, session) {
    const instance = getInstance(instanceId, session);
    const safePresetId = requirePresetId(presetId, "presetId");
    const plugin = getPlugin(instance.pluginId);
    const preset = (plugin?.presets ?? [])
      .slice(0, maxPluginPresets)
      .map((candidate, index) => normalizePresetSnapshot(candidate, index))
      .filter(Boolean)
      .find((candidate) => candidate.id === safePresetId);

    if (!preset) {
      throw makeProtocolError("preset_not_found", `Unknown preset: ${safePresetId}`);
    }

    const updatedParameterIndexes = new Set();
    for (const [parameterId, normalizedValue] of Object.entries(preset.parameters)) {
      const parameterIndex = instance.parameters.findIndex((parameter) => parameter.id === parameterId);
      if (parameterIndex < 0) {
        continue;
      }
      if (instance.parameters[parameterIndex].readOnly) {
        continue;
      }
      await applyParameterValue(instance, parameterIndex, normalizedValue, 0);
      updatedParameterIndexes.add(parameterIndex);
    }

    const parameters = [...updatedParameterIndexes].map((index) => ({ ...instance.parameters[index] }));
    return {
      applied: parameters.length > 0,
      presetId: preset.id,
      parameterCount: parameters.length,
      parameters
    };
  }

  async function setParameterEvents(instanceId, events, session) {
    const instance = getInstance(instanceId, session);
    const acceptedEvents = normalizeParameterEvents(events, instance.maxBlockSize);
    const updatedParameterIndexes = new Set();

    for (const event of acceptedEvents) {
      const parameterIndex = instance.parameters.findIndex((parameter) => parameter.id === event.parameterId);
      if (parameterIndex < 0) {
        throw makeProtocolError("parameter_not_found", `Unknown parameter: ${event.parameterId}`);
      }
      assertParameterAutomatable(instance.parameters[parameterIndex]);
      await applyParameterValue(instance, parameterIndex, event.normalizedValue, event.time);
      updatedParameterIndexes.add(parameterIndex);
    }

    return {
      accepted: true,
      eventCount: acceptedEvents.length,
      parameters: [...updatedParameterIndexes].map((index) => ({ ...instance.parameters[index] }))
    };
  }

  async function setParameterCurve(instanceId, parameterId, points, interpolation, session) {
    const instance = getInstance(instanceId, session);
    const safeParameterId = requireParameterId(parameterId, "parameterId");
    const parameterIndex = instance.parameters.findIndex((parameter) => parameter.id === safeParameterId);
    if (parameterIndex < 0) {
      throw makeProtocolError("parameter_not_found", `Unknown parameter: ${safeParameterId}`);
    }
    assertParameterAutomatable(instance.parameters[parameterIndex]);

    const events = normalizeParameterCurve(safeParameterId, points, interpolation, instance.maxBlockSize);
    for (const event of events) {
      await applyParameterValue(instance, parameterIndex, event.normalizedValue, event.time);
    }

    return {
      accepted: true,
      eventCount: events.length,
      parameter: { ...instance.parameters[parameterIndex] }
    };
  }

  function setAutomationLane(instanceId, parameterId, points, session) {
    const instance = getInstance(instanceId, session);
    const safeParameterId = requireParameterId(parameterId, "parameterId");
    const parameterIndex = instance.parameters.findIndex((parameter) => parameter.id === safeParameterId);
    if (parameterIndex < 0) {
      throw makeProtocolError("parameter_not_found", `Unknown parameter: ${safeParameterId}`);
    }
    assertParameterAutomatable(instance.parameters[parameterIndex]);

    const normalizedPoints = normalizeAutomationLanePoints(points);
    if (!instance.automationLanes.has(safeParameterId) && instance.automationLanes.size >= maxAutomationLanesPerInstance) {
      throw makeProtocolError("quota_exceeded", "This plugin instance has reached its automation lane limit.", {
        maxAutomationLanesPerInstance
      });
    }
    instance.automationLanes.set(safeParameterId, normalizedPoints);

    return {
      accepted: true,
      parameterId: safeParameterId,
      pointCount: normalizedPoints.length,
      laneCount: instance.automationLanes.size,
      parameter: { ...instance.parameters[parameterIndex] }
    };
  }

  function clearAutomationLane(instanceId, parameterId, session) {
    const instance = getInstance(instanceId, session);
    const safeParameterId = parameterId == null ? undefined : requireParameterId(parameterId, "parameterId");
    if (safeParameterId) {
      if (!instance.parameters.some((parameter) => parameter.id === safeParameterId)) {
        throw makeProtocolError("parameter_not_found", `Unknown parameter: ${safeParameterId}`);
      }
      instance.automationLanes.delete(safeParameterId);
    } else {
      instance.automationLanes.clear();
    }

    return {
      cleared: true,
      parameterId: safeParameterId,
      laneCount: instance.automationLanes.size
    };
  }

  async function applyAutomationLanesForBlock(instance, transport, frames) {
    const laneEvents = collectAutomationLaneEvents(instance, transport, frames);
    const preparedEvents = laneEvents.map((event) => {
      const parameterIndex = instance.parameters.findIndex((parameter) => parameter.id === event.parameterId);
      if (parameterIndex < 0) {
        throw makeProtocolError("parameter_not_found", `Unknown parameter: ${event.parameterId}`);
      }
      assertParameterAutomatable(instance.parameters[parameterIndex]);
      return { ...event, parameterIndex };
    });
    for (const event of preparedEvents) {
      await applyParameterValue(instance, event.parameterIndex, event.normalizedValue, event.time);
    }
    return laneEvents.length;
  }

  async function applyParameterValue(instance, parameterIndex, normalizedValue, sampleOffset = 0) {
    const parameter = instance.parameters[parameterIndex];
    validateParameterSampleOffsetForBlockProfile(instance, sampleOffset);
    if (
      instance.nativeParameterIds.has(parameter.id) &&
      instance.worker &&
      typeof instance.worker.setParameter === "function"
    ) {
      const nativeParameter = await instance.worker.setParameter(parameter.id, normalizedValue, sampleOffset);
      if (nativeParameter) {
        instance.parameters[parameterIndex] = makeNativeUpdatedParameter(nativeParameter, normalizedValue);
        return;
      }
    }

    instance.parameters[parameterIndex] = makeUpdatedParameter(parameter, normalizedValue);
  }

  async function applyParameterDisplayValue(instance, parameterIndex, displayValue) {
    const parameter = instance.parameters[parameterIndex];
    if (
      instance.nativeParameterIds.has(parameter.id) &&
      instance.worker &&
      typeof instance.worker.setParameterDisplayValue === "function"
    ) {
      const nativeParameter = await instance.worker.setParameterDisplayValue(parameter.id, displayValue);
      if (nativeParameter) {
        instance.parameters[parameterIndex] = makeNativeUpdatedParameter(nativeParameter, nativeParameter.normalizedValue);
        return;
      }
    }

    const normalizedValue = normalizedValueFromDisplayValue(parameter, displayValue);
    if (!Number.isFinite(normalizedValue)) {
      throw makeProtocolError("invalid_argument", "displayValue could not be parsed for this parameter.");
    }
    await applyParameterValue(instance, parameterIndex, requireNumberInRange(normalizedValue, 0, 1, "displayValue"));
  }

  return {
    applyAutomationLanesForBlock,
    applyParameterValue,
    clearAutomationLane,
    setAutomationLane,
    setParameter,
    setParameterCurve,
    setParameterDisplayValue,
    setParameterEvents,
    setPreset
  };
}
