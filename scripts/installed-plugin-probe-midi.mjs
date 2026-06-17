export function midiEventsForBlock(format, frames = 64, maxBlockSize = 64) {
  const frameLimit = clampInt(maxBlockSize, 1, 8192, 64);
  const boundedFrames = clampInt(frames, 1, frameLimit, frameLimit);
  const offset = (fraction) => Math.min(boundedFrames - 1, Math.max(0, Math.floor(boundedFrames * fraction)));
  const isVst3 = String(format ?? "").toLowerCase() === "vst3";
  const noteId = 77;
  const events = [
    { type: "noteOn", note: 60, velocity: 0.7, channel: 0, time: 0, ...(isVst3 ? { noteId } : {}) },
    { type: "polyPressure", note: 60, pressure: 0.35, channel: 0, time: offset(0.125), ...(isVst3 ? { noteId } : {}) },
    { type: "controlChange", controller: 1, value: 0.4, channel: 0, time: offset(0.25) },
    { type: "pitchBend", value: 0.1, channel: 0, time: offset(0.375) },
    { type: "channelPressure", pressure: 0.3, channel: 0, time: offset(0.5) }
  ];
  if (isVst3) {
    const busNoteId = 78;
    events.splice(
      2,
      0,
      { type: "noteExpression", typeId: 0, value: 0.5, noteId, channel: 0, time: offset(0.1875) },
      { type: "noteExpressionText", typeId: 6, text: "probe", noteId, channel: 0, time: offset(0.21875) }
    );
    events.push({ type: "noteOn", note: 62, velocity: 0.6, channel: 1, time: offset(0.5625), noteId: busNoteId, busIndex: 1 });
    events.push({ type: "noteExpression", typeId: 0, value: 0.4, noteId: busNoteId, channel: 1, time: offset(0.59375), busIndex: 1 });
    events.push({ type: "noteExpressionText", typeId: 6, text: "bus", noteId: busNoteId, channel: 1, time: offset(0.609375), busIndex: 1 });
    events.push({ type: "controlChange", controller: 74, value: 0.25, channel: 2, time: offset(0.625), busIndex: 1 });
    events.push({ type: "pitchBend", value: -0.2, channel: 2, time: offset(0.75), busIndex: 1 });
    events.push({ type: "channelPressure", pressure: 0.6, channel: 2, time: offset(0.875), busIndex: 1 });
    events.push({ type: "programChange", program: 2, channel: 0, time: offset(0.90625) });
    events.push({ type: "programChange", program: 7, channel: 2, time: offset(0.921875), busIndex: 1 });
    events.push({ type: "noteOff", note: 62, velocity: 0, channel: 1, time: offset(0.9375), noteId: busNoteId, busIndex: 1 });
  }
  return events;
}

export function midiControllerEventCount(events) {
  return summarizeProbeMidiControllerEvents(events).eventCount;
}

export function summarizeProbeMidiControllerEvents(events) {
  if (!Array.isArray(events)) {
    return emptyMidiControllerProfile();
  }
  const controllerEvents = events.filter((event) =>
    event?.type === "controlChange" ||
      event?.type === "pitchBend" ||
      event?.type === "channelPressure"
  );
  const types = knownControllerEventTypes(controllerEvents);
  const invalidControllerNumberCount = controllerEvents.filter(invalidControllerNumber).length;
  const invalidControllerRouteCount = controllerEvents.filter(invalidEventRoute).length;
  return {
    eventCount: controllerEvents.length,
    controllerFamilyCount: types.length,
    invalidControllerNumberCount,
    invalidControllerRouteCount,
    flags: midiControllerFlags(controllerEvents, types, { invalidControllerNumberCount, invalidControllerRouteCount }),
    types,
    controllers: uniqueSortedIntegers(controllerEvents.map((event) => event.controller), 0, 127),
    channels: uniqueSortedIntegers(controllerEvents.map((event) => event.channel ?? 0), 0, 15),
    eventBuses: uniqueSortedIntegers(controllerEvents.map((event) => event.busIndex ?? 0), 0, 31)
  };
}

export function summarizeProbeMidiProgramChangeEvents(events) {
  if (!Array.isArray(events)) {
    return emptyMidiProgramChangeProfile();
  }
  const programEvents = events.filter((event) => event?.type === "programChange");
  if (programEvents.length === 0) {
    return emptyMidiProgramChangeProfile();
  }
  const invalidProgramNumberCount = programEvents.filter(invalidProgramNumber).length;
  const invalidProgramRouteCount = programEvents.filter(invalidEventRoute).length;
  return {
    eventCount: programEvents.length,
    invalidProgramNumberCount,
    invalidProgramRouteCount,
    flags: midiProgramChangeFlags(programEvents, { invalidProgramNumberCount, invalidProgramRouteCount }),
    programs: uniqueSortedIntegers(programEvents.map((event) => event.program), 0, 127),
    channels: uniqueSortedIntegers(programEvents.map((event) => event.channel ?? 0), 0, 15),
    eventBuses: uniqueSortedIntegers(programEvents.map((event) => event.busIndex ?? 0), 0, 31)
  };
}

function emptyMidiControllerProfile() {
  return {
    eventCount: 0,
    controllerFamilyCount: 0,
    invalidControllerNumberCount: 0,
    invalidControllerRouteCount: 0,
    flags: ["no-controller-events"],
    types: [],
    controllers: [],
    channels: [],
    eventBuses: []
  };
}

function emptyMidiProgramChangeProfile() {
  return {
    eventCount: 0,
    invalidProgramNumberCount: 0,
    invalidProgramRouteCount: 0,
    flags: ["no-program-change-events"],
    programs: [],
    channels: [],
    eventBuses: []
  };
}

function knownControllerEventTypes(events) {
  const present = new Set(events.map((event) => event.type));
  return ["controlChange", "pitchBend", "channelPressure"].filter((type) => present.has(type));
}

function midiControllerFlags(
  events,
  types = knownControllerEventTypes(events),
  { invalidControllerNumberCount = 0, invalidControllerRouteCount = 0 } = {}
) {
  if (events.length === 0) {
    return ["no-controller-events"];
  }
  const flags = ["controller-events"];
  for (const type of types) {
    flags.push(`type:${type}`);
  }
  if (types.length > 1) {
    flags.push("multi-controller-family");
  }
  if (events.some((event) => boundedInt(event.busIndex, 0, 31) > 0)) {
    flags.push("non-main-event-bus");
  }
  if (events.some((event) => boundedInt(event.channel, 0, 15) > 0)) {
    flags.push("non-main-channel");
  }
  if (invalidControllerNumberCount > 0) {
    flags.push("invalid-controller-number");
  }
  if (invalidControllerRouteCount > 0) {
    flags.push("invalid-controller-route");
  }
  return flags;
}

function midiProgramChangeFlags(events, { invalidProgramNumberCount = 0, invalidProgramRouteCount = 0 } = {}) {
  const flags = ["program-change-events"];
  if (events.some((event) => boundedInt(event.busIndex, 0, 31) > 0)) {
    flags.push("non-main-event-bus");
  }
  if (events.some((event) => boundedInt(event.channel, 0, 15) > 0)) {
    flags.push("non-main-channel");
  }
  if (invalidProgramNumberCount > 0) {
    flags.push("invalid-program-number");
  }
  if (invalidProgramRouteCount > 0) {
    flags.push("invalid-program-route");
  }
  return flags;
}

function invalidControllerNumber(event) {
  return event?.type === "controlChange" && boundedInt(event.controller, 0, 127) === undefined;
}

function invalidProgramNumber(event) {
  return boundedInt(event?.program, 0, 127) === undefined;
}

function invalidEventRoute(event) {
  return (hasOwn(event, "channel") && boundedInt(event.channel, 0, 15) === undefined) ||
    (hasOwn(event, "busIndex") && boundedInt(event.busIndex, 0, 31) === undefined);
}

function boundedInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function uniqueSortedIntegers(values, min, max) {
  return [...new Set(values.filter((value) =>
    Number.isInteger(value) && value >= min && value <= max
  ))].sort((left, right) => left - right);
}

function clampInt(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    return fallback;
  }
  return numeric;
}
