export function createDaemonRuntimePayloads({
  limits,
  makeProtocolError,
  normalizers,
  validators
}) {
  const {
    maxAudioChannels,
    maxPluginBuses,
    maxPluginStateEnvelopeBytes,
    maxTransportPositionMusic,
    maxTransportSamplePosition,
    maxTransportTempoBpm
  } = limits;
  const {
    isBase64Text,
    normalizeInt
  } = normalizers;
  const {
    isPowerOfTwo,
    requireBoolean,
    requireIntegerInRange,
    requireNumberInRange
  } = validators;

  async function getNativeState(instance) {
    if (!instance.worker || typeof instance.worker.getState !== "function") {
      return undefined;
    }
    return instance.worker.getState();
  }

  function encodeStateEnvelope(envelope) {
    const json = JSON.stringify(envelope);
    const encoded = Buffer.from(json, "utf8").toString("base64");
    if (Buffer.byteLength(encoded, "utf8") > maxPluginStateEnvelopeBytes) {
      throw makeProtocolError("state_too_large", "Plugin state exceeded the configured state envelope limit.", {
        maxStateEnvelopeBytes: maxPluginStateEnvelopeBytes
      });
    }
    return encoded;
  }

  function decodeStateEnvelope(state) {
    const text = String(state ?? "");
    if (
      text.length === 0 ||
      Buffer.byteLength(text, "utf8") > maxPluginStateEnvelopeBytes ||
      !isBase64Text(text)
    ) {
      throw makeProtocolError("bad_state", "State was not valid PlugRelay state.");
    }

    try {
      const decoded = Buffer.from(text, "base64");
      return JSON.parse(decoded.toString("utf8"));
    } catch (error) {
      if (error?.code) {
        throw error;
      }
      throw makeProtocolError("bad_state", "State was not valid PlugRelay state.");
    }
  }

  function firstAudioFrameCount(payload, fallback) {
    if (payload.frames != null) {
      return payload.frames;
    }
    if (Array.isArray(payload.channels) && audioChannelSource(payload.channels[0])) {
      return payload.channels[0].length;
    }
    if (Array.isArray(payload.inputBuses)) {
      for (const bus of payload.inputBuses) {
        if (Array.isArray(bus?.channels) && audioChannelSource(bus.channels[0])) {
          return bus.channels[0].length;
        }
      }
    }
    return fallback;
  }

  function normalizeAudioChannels(channels, maxChannels, frames) {
    if (!Array.isArray(channels) || maxChannels <= 0) {
      return [];
    }
    const channelLimit = Math.min(maxAudioChannels, maxChannels, channels.length);
    const channelCount = Number.isFinite(channelLimit) && channelLimit > 0 ? Math.floor(channelLimit) : 0;
    const normalized = new Array(channelCount);
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      normalized[channelIndex] = normalizeAudioChannel(channels[channelIndex], frames);
    }
    return normalized;
  }

  function normalizeAudioChannel(channel, frames) {
    if (reuseTypedAudioChannel(channel, frames)) {
      return channel;
    }
    const source = audioChannelSource(channel) ? channel : undefined;
    const samples = ArrayBuffer.isView(source) ? new Float32Array(frames) : new Array(frames);
    for (let frame = 0; frame < frames; frame += 1) {
      samples[frame] = boundedAudioSample(source?.[frame]);
    }
    return samples;
  }

  function reuseTypedAudioChannel(channel, frames) {
    if (!(ArrayBuffer.isView(channel) && typeof channel.length === "number") || channel.length !== frames) {
      return false;
    }
    for (let frame = 0; frame < frames; frame += 1) {
      const value = Number(channel[frame]);
      if (!Number.isFinite(value) || value < -1 || value > 1) {
        return false;
      }
    }
    return true;
  }

  function boundedAudioSample(value) {
    const sample = Number(value ?? 0);
    return Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample)) : 0;
  }

  function audioChannelSource(channel) {
    return Array.isArray(channel) || (ArrayBuffer.isView(channel) && typeof channel.length === "number");
  }

  function normalizeAudioBusBlocks(value, mainChannels, busLayouts = [], frames, options = {}) {
    const mainBus = Array.isArray(mainChannels) && mainChannels.length > 0
      ? { index: 0, channels: mainChannels }
      : undefined;
    if (value == null || (Array.isArray(value) && value.length === 0)) {
      return mainBus ? [mainBus] : [];
    }
    if (value != null && !Array.isArray(value)) {
      if (options.strictRequest) {
        throw makeProtocolError("invalid_argument", `${options.label ?? "audioBuses"} must be an array.`);
      }
      return mainBus ? [mainBus] : [];
    }
    const byIndex = new Map();
    if (mainBus) {
      byIndex.set(0, mainBus);
    }
    if (Array.isArray(value)) {
      if (options.strictRequest && value.length > maxPluginBuses) {
        throw makeProtocolError("invalid_argument", `${options.label ?? "audioBuses"} must contain at most ${maxPluginBuses} bus blocks.`, {
          maxPluginBuses
        });
      }
      const seenExplicitIndexes = new Set();
      const busCount = Math.min(value.length, maxPluginBuses);
      for (let position = 0; position < busCount; position += 1) {
        const bus = value[position];
        if ((!bus || typeof bus !== "object" || Array.isArray(bus)) && options.strictRequest) {
          throw makeProtocolError("invalid_argument", `${options.label ?? "audioBuses"}[${position}] must be an object.`);
        }
        const index = options.strictRequest
          ? requireIntegerInRange(bus?.index, 0, maxPluginBuses - 1, `${options.label ?? "audioBuses"}[${position}].index`)
          : normalizeInt(bus?.index, 0, maxPluginBuses - 1, 0);
        if (options.strictRequest && seenExplicitIndexes.has(index)) {
          throw makeProtocolError("invalid_argument", `${options.label ?? "audioBuses"} must not contain duplicate bus index ${index}.`, {
            index
          });
        }
        seenExplicitIndexes.add(index);
        if (options.mainBusAuthoritative && index === 0) {
          continue;
        }
        const layoutChannels = busLayouts.find((layout) => layout.index === index)?.channels ?? maxAudioChannels;
        byIndex.set(index, {
          index,
          channels: normalizeAudioChannels(bus?.channels, layoutChannels, frames)
        });
      }
    }
    return Array.from(byIndex.values()).sort((left, right) => left.index - right.index);
  }

  function normalizeOutputBusBlocks(value, mainChannels, layout, frames, options = {}) {
    const outputLayouts = layout?.outputBusLayouts ?? [];
    const normalizedMainChannels = options.normalizedMain === true
      ? mainChannels
      : normalizeAudioChannels(mainChannels, layout?.outputChannels ?? maxAudioChannels, frames);
    const buses = normalizeAudioBusBlocks(
      value,
      normalizedMainChannels,
      outputLayouts,
      frames,
      { mainBusAuthoritative: true }
    );
    if (buses.length > 0) {
      return buses;
    }
    return [{
      index: 0,
      channels: normalizedMainChannels
    }];
  }

  function normalizeTransportState(value) {
    if (value == null) {
      return undefined;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw makeProtocolError("invalid_argument", "transport must be an object.");
    }

    const allowedFields = new Set([
      "playing",
      "recording",
      "loopActive",
      "tempo",
      "timeSignatureNumerator",
      "timeSignatureDenominator",
      "projectTimeMusic",
      "barPositionMusic",
      "cycleStartMusic",
      "cycleEndMusic",
      "samplePosition"
    ]);
    for (const key of Object.keys(value)) {
      if (!allowedFields.has(key)) {
        throw makeProtocolError("invalid_argument", `Unknown transport field: ${key}.`);
      }
    }

    const transport = {};
    const assignBoolean = (property) => {
      if (Object.hasOwn(value, property)) {
        transport[property] = requireBoolean(value[property], `transport.${property}`);
      }
    };
    const assignNumber = (property, min, max) => {
      if (Object.hasOwn(value, property)) {
        transport[property] = requireNumberInRange(value[property], min, max, `transport.${property}`);
      }
    };
    const assignInteger = (property, min, max) => {
      if (Object.hasOwn(value, property)) {
        transport[property] = requireIntegerInRange(value[property], min, max, `transport.${property}`);
      }
    };

    assignBoolean("playing");
    assignBoolean("recording");
    assignBoolean("loopActive");
    assignNumber("tempo", 1, maxTransportTempoBpm);
    assignInteger("timeSignatureNumerator", 1, 64);
    assignInteger("timeSignatureDenominator", 1, 64);
    assignNumber("projectTimeMusic", 0, maxTransportPositionMusic);
    assignNumber("barPositionMusic", 0, maxTransportPositionMusic);
    assignNumber("cycleStartMusic", 0, maxTransportPositionMusic);
    assignNumber("cycleEndMusic", 0, maxTransportPositionMusic);
    assignInteger("samplePosition", 0, maxTransportSamplePosition);

    if (
      Object.hasOwn(transport, "timeSignatureNumerator") !==
      Object.hasOwn(transport, "timeSignatureDenominator")
    ) {
      throw makeProtocolError("invalid_argument", "transport time signature numerator and denominator must be supplied together.");
    }
    if (
      Object.hasOwn(transport, "timeSignatureDenominator") &&
      !isPowerOfTwo(transport.timeSignatureDenominator)
    ) {
      throw makeProtocolError("invalid_argument", "transport.timeSignatureDenominator must be a power of two in 1..64.", {
        value: value.timeSignatureDenominator
      });
    }
    if (Object.hasOwn(transport, "cycleStartMusic") !== Object.hasOwn(transport, "cycleEndMusic")) {
      throw makeProtocolError("invalid_argument", "transport cycle start and end must be supplied together.");
    }
    if (
      Object.hasOwn(transport, "cycleStartMusic") &&
      Object.hasOwn(transport, "cycleEndMusic") &&
      transport.cycleEndMusic < transport.cycleStartMusic
    ) {
      throw makeProtocolError("invalid_argument", "transport.cycleEndMusic must be greater than or equal to transport.cycleStartMusic.", {
        cycleStartMusic: transport.cycleStartMusic,
        cycleEndMusic: transport.cycleEndMusic
      });
    }

    return transport;
  }

  return {
    decodeStateEnvelope,
    encodeStateEnvelope,
    firstAudioFrameCount,
    getNativeState,
    normalizeAudioBusBlocks,
    normalizeAudioChannels,
    normalizeOutputBusBlocks,
    normalizeTransportState
  };
}
