const SIGNAL_EPSILON = 0.000001;

export function assertProbeRenderMatchesLayout(rendered, layout, frames) {
  const expectedOutputChannels = clampInt(layout?.outputChannels, 1, 32, 1);
  if (!Array.isArray(rendered?.channels) || rendered.channels.length !== expectedOutputChannels) {
    throwRenderLayoutError(`rendered ${rendered?.channels?.length ?? 0} channel(s), expected ${expectedOutputChannels}`);
  }
  assertChannelFrames(rendered.channels, frames, "legacy output channels");

  if (!Array.isArray(rendered.outputBuses)) {
    throwRenderLayoutError("render response did not include outputBuses");
  }
  const outputBuses = indexedOutputBuses(rendered.outputBuses);
  const mainBus = outputBuses.get(0);
  if (!mainBus || !Array.isArray(mainBus.channels) || mainBus.channels.length !== expectedOutputChannels) {
    throwRenderLayoutError("render response main output bus did not match the negotiated layout");
  }
  if (JSON.stringify(mainBus.channels) !== JSON.stringify(rendered.channels)) {
    throwRenderLayoutError("render response main output bus did not mirror legacy channels");
  }

  for (const [index, bus] of outputBuses.entries()) {
    if (!Array.isArray(bus.channels) || bus.channels.length > 32) {
      throwRenderLayoutError(`render response output bus ${index} did not return bounded channel arrays`);
    }
    assertChannelFrames(bus.channels, frames, `output bus ${index}`);
  }

  for (const layoutBus of activeOutputLayouts(layout)) {
    const bus = outputBuses.get(layoutBus.index);
    if (!bus) {
      throwRenderLayoutError(`render response did not include negotiated output bus ${layoutBus.index}`);
    }
    if (!Array.isArray(bus.channels) || bus.channels.length !== layoutBus.channels) {
      throwRenderLayoutError(`render response output bus ${layoutBus.index} did not match the negotiated channel count`);
    }
  }
}

export function summarizeProbeRenderSignal(rendered) {
  let sawSample = false;
  for (const sample of renderSamples(rendered)) {
    sawSample = true;
    if (Math.abs(sample) > SIGNAL_EPSILON) {
      return "signal";
    }
  }
  return sawSample ? "silent" : "missing";
}

function indexedOutputBuses(outputBuses) {
  const byIndex = new Map();
  for (const [position, bus] of outputBuses.entries()) {
    if (!bus || typeof bus !== "object" || Array.isArray(bus)) {
      throwRenderLayoutError(`render response outputBuses[${position}] was not an object`);
    }
    const index = bus.index;
    if (!Number.isInteger(index) || index < 0 || index > 31) {
      throwRenderLayoutError(`render response outputBuses[${position}] had an invalid index`);
    }
    if (byIndex.has(index)) {
      throwRenderLayoutError(`render response included duplicate output bus ${index}`);
    }
    byIndex.set(index, bus);
  }
  return byIndex;
}

function activeOutputLayouts(layout) {
  const layouts = Array.isArray(layout?.outputBusLayouts) ? layout.outputBusLayouts : [];
  if (layouts.length === 0) {
    return [{ index: 0, channels: clampInt(layout?.outputChannels, 1, 32, 1) }];
  }
  return layouts
    .map((bus) => ({
      index: clampInt(bus?.index, 0, 31, 0),
      channels: clampInt(bus?.channels, 0, 32, 0),
      active: bus?.active !== false
    }))
    .filter((bus) => bus.active && bus.channels > 0);
}

function assertChannelFrames(channels, frames, context) {
  const expectedFrames = clampInt(frames, 1, 8192, 1);
  for (const [index, channel] of channels.entries()) {
    if (!Array.isArray(channel) || channel.length !== expectedFrames) {
      throwRenderLayoutError(`render response ${context} channel ${index} did not match the requested frame count`);
    }
  }
}

function throwRenderLayoutError(message) {
  const error = new Error(message);
  error.code = "bad_render_layout";
  throw error;
}

function* renderSamples(rendered) {
  yield* channelSamples(rendered?.channels);
  if (Array.isArray(rendered?.outputBuses)) {
    for (const bus of rendered.outputBuses) {
      yield* channelSamples(bus?.channels);
    }
  }
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function* channelSamples(channels) {
  if (!Array.isArray(channels)) {
    return;
  }
  for (const channel of channels) {
    if (!Array.isArray(channel)) {
      continue;
    }
    for (const sample of channel) {
      const value = Number(sample);
      if (Number.isFinite(value)) {
        yield value;
      }
    }
  }
}
