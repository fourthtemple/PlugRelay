import {
  assert,
  assertOutputBuses,
  blockHasSignal
} from "./smoke-test-assertions.mjs";

export async function runExampleInstrumentSmoke({
  exampleFormats,
  nativeExampleRendererAvailable,
  pair,
  plugins,
  request,
  socket,
  startingBlockId = 2
}) {
  let instrumentBlockId = startingBlockId;
  for (const format of exampleFormats) {
    const instrument = plugins.find((plugin) => plugin.format === format && plugin.kind === "instrument");
    assert(instrument, `${format} instrument metadata exists`);
    const instrumentInstance = await request(
      socket,
      "createInstance",
      {
        pluginId: instrument.pluginId,
        format: instrument.format,
        sampleRate: 48000,
        maxBlockSize: 128,
        inputChannels: 0,
        outputChannels: 2
      },
      true,
      pair.sessionToken
    );
    const preset = instrument.presets.at(-1);
    const appliedPreset = await request(
      socket,
      "setPreset",
      {
        instanceId: instrumentInstance.instanceId,
        presetId: preset.id
      },
      true,
      pair.sessionToken
    );
    assert(
      appliedPreset.applied === true &&
        appliedPreset.parameterCount >= 2 &&
        appliedPreset.parameters.some((parameter) => parameter.id === "gain"),
      `${format} instrument applies a bounded listed preset snapshot`
    );
    await request(
      socket,
      "sendMidiEvents",
      {
        instanceId: instrumentInstance.instanceId,
        events: [{ type: "noteOn", note: 60, velocity: 0.8 }]
      },
      true,
      pair.sessionToken
    );
    const synthBlock = await request(
      socket,
      "processAudioBlock",
      {
        instanceId: instrumentInstance.instanceId,
        blockId: instrumentBlockId++,
        sampleRate: 48000,
        channels: [new Array(128).fill(0), new Array(128).fill(0)]
      },
      true,
      pair.sessionToken
    );
    assert(blockHasSignal(synthBlock.channels), `${format} instrument produced audio after noteOn`);
    assertOutputBuses(synthBlock, instrumentInstance.layout, `${format} instrument reports bounded output buses`);
    if (nativeExampleRendererAvailable) {
      const expectedRenderEngine = instrument.source === "example-bundle" ? "bundle-worker" : "native-example";
      assert(synthBlock.renderEngine === expectedRenderEngine, `${format} instrument used ${expectedRenderEngine}`);
    }
    const continuedBlock = await request(
      socket,
      "processAudioBlock",
      {
        instanceId: instrumentInstance.instanceId,
        blockId: instrumentBlockId++,
        sampleRate: 48000,
        channels: [new Array(128).fill(0), new Array(128).fill(0)]
      },
      true,
      pair.sessionToken
    );
    assert(blockHasSignal(continuedBlock.channels), `${format} instrument kept producing audio without resending note state`);
    if (synthBlock.renderEngine === "bundle-worker") {
      assert(
        Math.abs(continuedBlock.channels?.[0]?.[0] ?? 0) > 0.0001,
        `${format} bundle worker preserved oscillator phase across render calls`
      );
    }
    await request(
      socket,
      "sendMidiEvents",
      {
        instanceId: instrumentInstance.instanceId,
        events: [{ type: "noteOff", note: 60, velocity: 0 }]
      },
      true,
      pair.sessionToken
    );
    const releasedBlock = await request(
      socket,
      "processAudioBlock",
      {
        instanceId: instrumentInstance.instanceId,
        blockId: instrumentBlockId++,
        sampleRate: 48000,
        channels: [new Array(128).fill(0), new Array(128).fill(0)]
      },
      true,
      pair.sessionToken
    );
    assert(!blockHasSignal(releasedBlock.channels), `${format} instrument stopped producing audio after noteOff`);
    await request(socket, "destroyInstance", { instanceId: instrumentInstance.instanceId }, true, pair.sessionToken);
  }
}
