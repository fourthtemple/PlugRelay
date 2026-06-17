export function summarizeProbeBusLayout(plugin, layout) {
  const sourceInputBuses = busLayouts(layout?.inputBusLayouts);
  const sourceOutputBuses = busLayouts(layout?.outputBusLayouts);
  const inputBuses = boundedBusLayouts(sourceInputBuses);
  const outputBuses = boundedBusLayouts(sourceOutputBuses);
  const inputBusMetadataAtLimit = sourceInputBuses.length >= 32;
  const outputBusMetadataAtLimit = sourceOutputBuses.length >= 32;
  const inputBusCount = clampInt(layout?.inputBuses, 0, 32, inputBuses.length);
  const outputBusCount = clampInt(layout?.outputBuses, 1, 32, outputBuses.length || 1);
  const inputChannels = clampInt(layout?.inputChannels, 0, 32, 0);
  const outputChannels = clampInt(layout?.outputChannels, 1, 32, 1);
  const kind = knownKind(plugin?.kind);
  const activeInputs = inputBuses.filter(activeAudioBus);
  const activeOutputs = outputBuses.filter(activeAudioBus);
  const inactiveInputs = inputBuses.filter(inactiveAudioBus);
  const inactiveOutputs = outputBuses.filter(inactiveAudioBus);
  const nonsequentialInputBuses = countNonSequentialIndexes(inputBuses);
  const nonsequentialOutputBuses = countNonSequentialIndexes(outputBuses);
  const duplicateInputBusIndexes = countDuplicateIndexes(inputBuses);
  const duplicateOutputBusIndexes = countDuplicateIndexes(outputBuses);
  const inputBusLayoutCount = uniqueBusIndexCount(inputBuses);
  const outputBusLayoutCount = uniqueBusIndexCount(outputBuses);
  const inputBusCountMismatch = inputBusLayoutCount > 0 && inputBusCount !== inputBusLayoutCount;
  const outputBusCountMismatch = outputBusLayoutCount > 0 && outputBusCount !== outputBusLayoutCount;
  const activeEmptyInputBuses = activeInputs.filter((bus) => bus.channels === 0).length;
  const activeEmptyOutputBuses = activeOutputs.filter((bus) => bus.channels === 0).length;
  const unknownInputBusTypes = inputBuses.filter((bus) => bus.type === "unknown").length;
  const unknownOutputBusTypes = outputBuses.filter((bus) => bus.type === "unknown").length;
  const sidechain = activeInputs.some((bus) => bus.index > 0 || bus.type === "aux");
  const multiOutput = outputBusCount > 1 || activeOutputs.some((bus) => bus.index > 0);
  const flags = [];

  if (sidechain) {
    flags.push("sidechain-input");
  }
  if (inputBusCount > (inputChannels > 0 ? 1 : 0)) {
    flags.push("multi-input");
  }
  if (multiOutput) {
    flags.push("multi-output");
  }
  if (kind === "instrument" && multiOutput) {
    flags.push("multi-output-instrument");
  }
  if (nonsequentialInputBuses > 0 || nonsequentialOutputBuses > 0) {
    flags.push("nonsequential-bus-indexes");
  }
  if (duplicateInputBusIndexes > 0 || duplicateOutputBusIndexes > 0) {
    flags.push("duplicate-bus-indexes");
  }
  if (inputBusCountMismatch || outputBusCountMismatch) {
    flags.push("bus-count-mismatch");
  }
  if (activeEmptyInputBuses > 0 || activeEmptyOutputBuses > 0) {
    flags.push("active-empty-bus");
  }
  if (inactiveInputs.length > 0) {
    flags.push("inactive-input-bus");
  }
  if (inactiveOutputs.length > 0) {
    flags.push("inactive-output-bus");
  }
  if (unknownInputBusTypes > 0 || unknownOutputBusTypes > 0) {
    flags.push("unknown-bus-type");
  }
  if (inputBusMetadataAtLimit) {
    flags.push("input-bus-metadata-at-limit");
  }
  if (outputBusMetadataAtLimit) {
    flags.push("output-bus-metadata-at-limit");
  }
  if (flags.length === 0) {
    flags.push("main-bus");
  }

  return {
    category: busProfileCategory({ kind, multiOutput, sidechain }),
    flags,
    inputChannels,
    outputChannels,
    inputBuses: inputBusCount,
    outputBuses: outputBusCount,
    activeInputBuses: activeInputs.length,
    activeOutputBuses: activeOutputs.length,
    inputBusLayoutCount,
    outputBusLayoutCount,
    inputBusCountMismatch,
    outputBusCountMismatch,
    inactiveInputBuses: inactiveInputs.length,
    inactiveOutputBuses: inactiveOutputs.length,
    activeInputBusIndexes: boundedBusIndexes(activeInputs),
    activeOutputBusIndexes: boundedBusIndexes(activeOutputs),
    inactiveInputBusIndexes: boundedBusIndexes(inactiveInputs),
    inactiveOutputBusIndexes: boundedBusIndexes(inactiveOutputs),
    nonsequentialInputBuses,
    nonsequentialOutputBuses,
    duplicateInputBusIndexes,
    duplicateOutputBusIndexes,
    activeEmptyInputBuses,
    activeEmptyOutputBuses,
    unknownInputBusTypes,
    unknownOutputBusTypes,
    inputBusMetadataAtLimit,
    outputBusMetadataAtLimit
  };
}

function busLayouts(value) {
  return Array.isArray(value) ? value : [];
}

function boundedBusLayouts(value) {
  return value.slice(0, 32).map((bus, fallbackIndex) => ({
    index: clampInt(bus?.index, 0, 31, fallbackIndex),
    channels: clampInt(bus?.channels, 0, 32, 0),
    active: bus?.active === true,
    type: bus?.type === "main" || bus?.type === "aux" || bus?.type === "unknown" ? bus.type : "unknown"
  }));
}

function activeAudioBus(bus) {
  return bus.active === true && bus.channels >= 0;
}

function inactiveAudioBus(bus) {
  return bus.active === false && bus.channels >= 0;
}

function busProfileCategory({ kind, multiOutput, sidechain }) {
  if (kind === "instrument" && multiOutput) {
    return "multi-output-instrument";
  }
  if (sidechain) {
    return "sidechain";
  }
  if (multiOutput) {
    return "multi-output";
  }
  if (kind === "instrument") {
    return "instrument-main";
  }
  if (kind === "effect") {
    return "effect-main";
  }
  return "other-main";
}

function countNonSequentialIndexes(buses) {
  return buses.filter((bus, index) => bus.index !== index).length;
}

function countDuplicateIndexes(buses) {
  const seen = new Set();
  const duplicates = new Set();
  for (const bus of buses) {
    if (seen.has(bus.index)) {
      duplicates.add(bus.index);
    } else {
      seen.add(bus.index);
    }
  }
  return duplicates.size;
}

function uniqueBusIndexCount(buses) {
  return new Set(buses.map((bus) => bus.index)).size;
}

function boundedBusIndexes(buses) {
  return [...new Set(buses.map((bus) => bus.index))].sort((left, right) => left - right);
}

function knownKind(value) {
  const kind = String(value ?? "");
  return kind === "instrument" || kind === "effect" ? kind : "other";
}

function clampInt(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    return fallback;
  }
  return numeric;
}
