const SIGNAL_EPSILON = 0.000001;

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

function* renderSamples(rendered) {
  yield* channelSamples(rendered?.channels);
  if (Array.isArray(rendered?.outputBuses)) {
    for (const bus of rendered.outputBuses) {
      yield* channelSamples(bus?.channels);
    }
  }
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
