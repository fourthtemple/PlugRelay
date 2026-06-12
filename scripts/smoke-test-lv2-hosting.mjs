export async function runLv2HostingSmoke({
  assert,
  assertLatencyReport,
  pair,
  plugins,
  request,
  socket
}) {
  const nativeLv2Effect = plugins.find((plugin) => plugin.pluginId === "lv2:soundbridge-example-gain.lv2" && plugin.hostable === true);
  if (nativeLv2Effect) {
    assert(
      nativeLv2Effect.metadata?.lv2Uri === "urn:soundbridge:example:lv2-gain" &&
        nativeLv2Effect.metadata?.stableId === nativeLv2Effect.metadata.lv2Uri,
      "installed LV2 effect exposes bounded path-free LV2 class metadata"
    );
    const nativeLv2Instance = await request(
      socket,
      "createInstance",
      {
        pluginId: nativeLv2Effect.pluginId,
        format: nativeLv2Effect.format,
        sampleRate: 48000,
        maxBlockSize: 128,
        inputChannels: 2,
        outputChannels: 2
      },
      true,
      pair.sessionToken
    );
    const nativeLv2Gain = nativeLv2Instance.plugin?.parameters?.find((parameter) => parameter.id === "gain");
    assert(nativeLv2Gain?.automatable === true, "installed LV2 effect exposes control ports through the daemon");
    const nativeLv2Mode = nativeLv2Instance.plugin?.parameters?.find((parameter) => parameter.id === "mode");
    assert(
      nativeLv2Mode?.stepCount === 3 &&
        nativeLv2Mode.automatable === true &&
        nativeLv2Mode.readOnly === false &&
        Math.abs(nativeLv2Mode.defaultNormalizedValue) < 0.000001,
      "installed LV2 effect exposes bounded discrete control metadata"
    );
    await request(
      socket,
      "setParameter",
      {
        instanceId: nativeLv2Instance.instanceId,
        parameterId: "gain",
        normalizedValue: 0.8
      },
      true,
      pair.sessionToken
    );
    const nativeLv2ModeSet = await request(
      socket,
      "setParameter",
      {
        instanceId: nativeLv2Instance.instanceId,
        parameterId: "mode",
        normalizedValue: 0.6
      },
      true,
      pair.sessionToken
    );
    assert(
      nativeLv2ModeSet.parameter?.id === "mode" &&
        nativeLv2ModeSet.parameter.stepCount === 3 &&
        nativeLv2ModeSet.parameter.plainValue === 2 &&
        Math.abs(nativeLv2ModeSet.parameter.normalizedValue - 2 / 3) < 0.000001,
      "setParameter rounds installed LV2 discrete controls to bounded steps"
    );
    const nativeLv2SavedState = await request(socket, "getState", { instanceId: nativeLv2Instance.instanceId }, true, pair.sessionToken);
    assert(typeof nativeLv2SavedState.state === "string" && nativeLv2SavedState.state.length > 0, "getState returns installed LV2 native control state");
    await request(
      socket,
      "setParameter",
      {
        instanceId: nativeLv2Instance.instanceId,
        parameterId: "gain",
        normalizedValue: 0.2
      },
      true,
      pair.sessionToken
    );
    await request(
      socket,
      "setParameter",
      {
        instanceId: nativeLv2Instance.instanceId,
        parameterId: "mode",
        normalizedValue: 0
      },
      true,
      pair.sessionToken
    );
    const nativeLv2Restored = await request(
      socket,
      "setState",
      { instanceId: nativeLv2Instance.instanceId, state: nativeLv2SavedState.state },
      true,
      pair.sessionToken
    );
    const restoredLv2Gain = nativeLv2Restored.parameters?.find((parameter) => parameter.id === "gain");
    const restoredLv2Mode = nativeLv2Restored.parameters?.find((parameter) => parameter.id === "mode");
    assert(
      nativeLv2Restored.restored === true &&
        restoredLv2Gain &&
        Math.abs(restoredLv2Gain.normalizedValue - 0.8) < 0.000001 &&
        restoredLv2Mode &&
        restoredLv2Mode.plainValue === 2 &&
        Math.abs(restoredLv2Mode.normalizedValue - 2 / 3) < 0.000001,
      "setState restores installed LV2 native control state"
    );
    await request(
      socket,
      "setParameter",
      {
        instanceId: nativeLv2Instance.instanceId,
        parameterId: "gain",
        normalizedValue: 0.5
      },
      true,
      pair.sessionToken
    );
    const nativeLv2Midi = await request(
      socket,
      "sendMidiEvents",
      {
        instanceId: nativeLv2Instance.instanceId,
        events: [{ type: "controlChange", controller: 7, value: 0.25, channel: 0, time: 0 }]
      },
      true,
      pair.sessionToken
    );
    assert(
      nativeLv2Midi.accepted === true && nativeLv2Midi.eventCount === 1,
      "installed LV2 effect accepts bounded MIDI for atom ports"
    );
    const nativeLv2MidiBlock = await request(
      socket,
      "processAudioBlock",
      {
        instanceId: nativeLv2Instance.instanceId,
        blockId: 12,
        sampleRate: 48000,
        channels: [new Array(4).fill(0.4), new Array(4).fill(0.4)],
        transport: {
          playing: true,
          tempo: 118,
          timeSignatureNumerator: 4,
          timeSignatureDenominator: 4,
          projectTimeMusic: 32,
          barPositionMusic: 32,
          samplePosition: 960000
        }
      },
      true,
      pair.sessionToken
    );
    assert(nativeLv2MidiBlock.renderEngine === "native-lv2", "installed LV2 effect rendered through the native LV2 host worker");
    assert(
      nativeLv2MidiBlock.transport?.playing === true &&
        nativeLv2MidiBlock.transport?.tempo === 118 &&
        nativeLv2MidiBlock.transport?.samplePosition === 960000,
      "installed LV2 render accepts bounded host transport position"
    );
    assert(
      nativeLv2MidiBlock.channels?.[0]?.[0] > 0.06 && nativeLv2MidiBlock.channels[0][0] < 0.16,
      "installed LV2 effect received atom MIDI CC"
    );
    const nativeLv2ExtensionState = await request(socket, "getState", { instanceId: nativeLv2Instance.instanceId }, true, pair.sessionToken);
    await request(
      socket,
      "sendMidiEvents",
      {
        instanceId: nativeLv2Instance.instanceId,
        events: [{ type: "controlChange", controller: 7, value: 1, channel: 0, time: 0 }]
      },
      true,
      pair.sessionToken
    );
    await request(
      socket,
      "processAudioBlock",
      {
        instanceId: nativeLv2Instance.instanceId,
        blockId: 13,
        sampleRate: 48000,
        channels: [new Array(4).fill(0.4), new Array(4).fill(0.4)]
      },
      true,
      pair.sessionToken
    );
    await request(
      socket,
      "setState",
      { instanceId: nativeLv2Instance.instanceId, state: nativeLv2ExtensionState.state },
      true,
      pair.sessionToken
    );
    const nativeLv2RestoredMidiBlock = await request(
      socket,
      "processAudioBlock",
      {
        instanceId: nativeLv2Instance.instanceId,
        blockId: 14,
        sampleRate: 48000,
        channels: [new Array(4).fill(0.4), new Array(4).fill(0.4)]
      },
      true,
      pair.sessionToken
    );
    assert(
      nativeLv2RestoredMidiBlock.channels?.[0]?.[0] > 0.06 && nativeLv2RestoredMidiBlock.channels[0][0] < 0.16,
      "setState restores installed LV2 file-backed extension state"
    );
    const nativeLv2Latency = await request(
      socket,
      "getLatency",
      { instanceId: nativeLv2Instance.instanceId, transportLatencySamples: 32 },
      true,
      pair.sessionToken
    );
    assert(nativeLv2Latency.pluginLatencySamples === 17, "installed LV2 reports bounded plugin latency");
    assertLatencyReport(nativeLv2Latency, 32, "installed LV2 reports bounded plugin and transport latency");
    await request(socket, "destroyInstance", { instanceId: nativeLv2Instance.instanceId }, true, pair.sessionToken);
  }

  const nativeLv2BlockProfile = plugins.find((plugin) => plugin.pluginId === "lv2:soundbridge-block-profile-gain.lv2" && plugin.hostable === true);
  if (nativeLv2BlockProfile) {
    await request(
      socket,
      "createInstance",
      {
        pluginId: nativeLv2BlockProfile.pluginId,
        format: nativeLv2BlockProfile.format,
        sampleRate: 48000,
        maxBlockSize: 96,
        inputChannels: 2,
        outputChannels: 2
      },
      true,
      pair.sessionToken
    ).then(
      () => {
        throw new Error("LV2 block-profile plugin unexpectedly accepted a non-power-of-two maxBlockSize");
      },
      (error) => {
        assert(error.message.includes("invalid_argument"), "LV2 power-of-two block profiles reject invalid maxBlockSize");
      }
    );
    const blockProfileInstance = await request(
      socket,
      "createInstance",
      {
        pluginId: nativeLv2BlockProfile.pluginId,
        format: nativeLv2BlockProfile.format,
        sampleRate: 48000,
        maxBlockSize: 128,
        inputChannels: 2,
        outputChannels: 2
      },
      true,
      pair.sessionToken
    );
    await request(
      socket,
      "setParameterEvents",
      {
        instanceId: blockProfileInstance.instanceId,
        events: [{ parameterId: "gain", normalizedValue: 0.5, time: 4 }]
      },
      true,
      pair.sessionToken
    ).then(
      () => {
        throw new Error("LV2 block-profile plugin unexpectedly accepted mid-block parameter automation");
      },
      (error) => {
        assert(error.message.includes("invalid_argument"), "LV2 restricted block profiles reject mid-block parameter automation");
      }
    );
    const fixedProfileBlock = await request(
      socket,
      "processAudioBlock",
      {
        instanceId: blockProfileInstance.instanceId,
        blockId: 15,
        sampleRate: 48000,
        channels: [new Array(128).fill(0.2), new Array(128).fill(0.2)]
      },
      true,
      pair.sessionToken
    );
    assert(fixedProfileBlock.renderEngine === "native-lv2", "LV2 block-profile plugin renders at its negotiated fixed block size");
    await request(
      socket,
      "processAudioBlock",
      {
        instanceId: blockProfileInstance.instanceId,
        blockId: 16,
        sampleRate: 48000,
        channels: [new Array(64).fill(0.2), new Array(64).fill(0.2)]
      },
      true,
      pair.sessionToken
    ).then(
      () => {
        throw new Error("LV2 block-profile plugin unexpectedly accepted a short render block");
      },
      (error) => {
        assert(error.message.includes("invalid_argument"), "LV2 fixed block profiles reject non-fixed render sizes");
      }
    );
    await request(socket, "destroyInstance", { instanceId: blockProfileInstance.instanceId }, true, pair.sessionToken);
  }
}
