import { publicPluginIsPathFree } from "./security-smoke-session-cases.mjs";

export function createSecurityInstanceCases({ check, request }) {
  async function checkInstanceSetupAndState({ main, session }) {
    const huge = await request(main, "createInstance", { pluginId: "mock.gain", outputChannels: 1e9 }, true, session).then(
      () => ({ ok: true }),
      (error) => ({ code: error.code })
    );
    check(huge.code === "invalid_argument", "createInstance outputChannels=1e9 -> invalid_argument (no OOM)");
    for (const [field, payload] of [
      ["maxBlockSize", { pluginId: "mock.gain", maxBlockSize: 5e8 }],
      ["sampleRate", { pluginId: "mock.gain", sampleRate: -1 }],
      ["inputChannels", { pluginId: "mock.gain", inputChannels: 1e7 }]
    ]) {
      const res = await request(main, "createInstance", payload, true, session).then(
        () => ({ ok: true }),
        (error) => ({ code: error.code })
      );
      check(res.code === "invalid_argument", `createInstance rejects out-of-range ${field}`);
    }

    const created = await request(
      main,
      "createInstance",
      { pluginId: "mock.gain", sampleRate: 48000, maxBlockSize: 128, inputChannels: 2, outputChannels: 2 },
      true,
      session
    );
    check(typeof created.instanceId === "string", "valid createInstance returns an instanceId");
    check(publicPluginIsPathFree(created.plugin), "createInstance returns a path-free public plugin snapshot");
    check(/^inst-[0-9a-f-]{36}$/.test(created.instanceId), "instanceId is a random UUID (not a guessable counter)");
    check(
      created.layout?.inputChannels === 2 &&
        created.layout?.outputChannels === 2 &&
        created.layout?.inputBuses <= 32 &&
        created.layout?.outputBuses <= 32 &&
        Array.isArray(created.layout?.inputBusLayouts) &&
        Array.isArray(created.layout?.outputBusLayouts) &&
        created.layout.inputBusLayouts.length === created.layout.inputBuses &&
        created.layout.outputBusLayouts.length === created.layout.outputBuses,
      "createInstance reports bounded negotiated layout"
    );

    const mockProgram = created.plugin?.parameters?.find((parameter) => parameter.id === "program");
    check(
      mockProgram?.programChange === true &&
        mockProgram.programList?.programs?.length === 4 &&
        mockProgram.programList.programs.every((program) => typeof program.name === "string" && program.name.length <= 160) &&
        mockProgram.vst3Unit?.id === 1 &&
        mockProgram.vst3Unit?.programListId === mockProgram.programList.id &&
        created.plugin?.vst3ProgramLists?.[0]?.id === mockProgram.programList.id &&
        created.plugin.vst3ProgramLists[0].unitId === mockProgram.vst3Unit.id &&
        typeof mockProgram.vst3Unit?.name === "string" &&
        mockProgram.vst3Unit.name.length <= 160,
      "createInstance exposes bounded VST3 unit and program-list metadata"
    );

    const unsupportedProgramData = await request(
      main,
      "getVst3ProgramData",
      { instanceId: created.instanceId, programListId: mockProgram?.programList?.id ?? 0, programIndex: 0 },
      true,
      session
    ).then(
      () => ({ ok: true }),
      (error) => ({ code: error.code })
    );
    check(unsupportedProgramData.code === "program_data_not_supported", "getVst3ProgramData rejects non-VST3 instances");

    const unsupportedProgramDataRestore = await request(
      main,
      "setVst3ProgramData",
      { instanceId: created.instanceId, programData: "YWI=" },
      true,
      session
    ).then(
      () => ({ ok: true }),
      (error) => ({ code: error.code })
    );
    check(unsupportedProgramDataRestore.code === "program_data_not_supported", "setVst3ProgramData rejects non-VST3 instances");

    const selectedProgram = await request(
      main,
      "setParameter",
      { instanceId: created.instanceId, parameterId: "program", normalizedValue: 2 / 3 },
      true,
      session
    );
    check(
      selectedProgram.parameter?.programChange === true &&
        Math.abs(selectedProgram.parameter.normalizedValue - 2 / 3) < 0.000001 &&
        selectedProgram.parameter.displayValue === "Bright",
      "setParameter selects a bounded program-list value with display text"
    );

    const displayGain = await request(
      main,
      "setParameter",
      { instanceId: created.instanceId, parameterId: "gain", normalizedValue: 0.75 },
      true,
      session
    );
    check(
      typeof displayGain.parameter?.displayValue === "string" &&
        Buffer.byteLength(displayGain.parameter.displayValue, "utf8") <= 160 &&
        displayGain.parameter.displayValue.includes("dB"),
      "setParameter returns bounded display text for generic editor values"
    );

    const textGain = await request(
      main,
      "setParameterDisplayValue",
      { instanceId: created.instanceId, parameterId: "gain", displayValue: "0.0 dB" },
      true,
      session
    );
    check(
      Math.abs(textGain.parameter?.normalizedValue - 0.5) < 0.000001 &&
        textGain.parameter.displayValue === "0.0 dB",
      "setParameterDisplayValue accepts bounded plugin display text"
    );

    const textProgram = await request(
      main,
      "setParameterDisplayValue",
      { instanceId: created.instanceId, parameterId: "program", displayValue: "Warm" },
      true,
      session
    );
    check(
      textProgram.parameter?.displayValue === "Warm" &&
        Math.abs(textProgram.parameter.normalizedValue - 1 / 3) < 0.000001,
      "setParameterDisplayValue accepts bounded program display text"
    );

    const oversizedDisplay = await request(
      main,
      "setParameterDisplayValue",
      { instanceId: created.instanceId, parameterId: "gain", displayValue: "x".repeat(161) },
      true,
      session
    ).then(
      () => ({ ok: true }),
      (error) => ({ code: error.code })
    );
    check(oversizedDisplay.code === "invalid_argument", "setParameterDisplayValue rejects oversized display text");

    const nulDisplay = await request(
      main,
      "setParameterDisplayValue",
      { instanceId: created.instanceId, parameterId: "gain", displayValue: "0\u0000dB" },
      true,
      session
    ).then(
      () => ({ ok: true }),
      (error) => ({ code: error.code })
    );
    check(nulDisplay.code === "invalid_argument", "setParameterDisplayValue rejects NUL display text");

    const readOnlyParameter = created.plugin?.parameters?.find((parameter) => parameter.id === "output-level");
    check(
      readOnlyParameter?.readOnly === true && readOnlyParameter.automatable === false,
      "createInstance exposes bounded read-only parameter metadata"
    );

    const readOnlyWrite = await request(
      main,
      "setParameter",
      { instanceId: created.instanceId, parameterId: "output-level", normalizedValue: 1 },
      true,
      session
    ).then(
      () => ({ ok: true }),
      (error) => ({ code: error.code })
    );
    check(readOnlyWrite.code === "parameter_read_only", "setParameter rejects read-only parameters before worker dispatch");

    const readOnlyTextWrite = await request(
      main,
      "setParameterDisplayValue",
      { instanceId: created.instanceId, parameterId: "output-level", displayValue: "100 %" },
      true,
      session
    ).then(
      () => ({ ok: true }),
      (error) => ({ code: error.code })
    );
    check(readOnlyTextWrite.code === "parameter_read_only", "setParameterDisplayValue rejects read-only parameters before worker dispatch");

    check(
      Array.isArray(created.plugin?.presets) &&
        created.plugin.presets.length >= 2 &&
        created.plugin.presets.every((preset) => typeof preset.id === "string" && preset.id.length <= 64),
      "createInstance exposes bounded preset snapshot metadata"
    );

    const presetApplied = await request(
      main,
      "setPreset",
      { instanceId: created.instanceId, presetId: "gain-bright" },
      true,
      session
    );
    check(
      presetApplied.applied === true &&
        presetApplied.parameterCount === 2 &&
        presetApplied.parameters?.some((parameter) => parameter.id === "gain" && Math.abs(parameter.normalizedValue - 0.75) < 0.000001) &&
        presetApplied.parameters?.some((parameter) => parameter.id === "program" && Math.abs(parameter.normalizedValue - 2 / 3) < 0.000001) &&
        !presetApplied.parameters?.some((parameter) => parameter.id === "output-level"),
      "setPreset applies only writable entries from a daemon-listed bounded preset snapshot"
    );

    const savedState = await request(main, "getState", { instanceId: created.instanceId }, true, session);
    const tamperedState = JSON.parse(Buffer.from(savedState.state, "base64").toString("utf8"));
    tamperedState.parameters["output-level"] = 1;
    const restoredTamperedState = await request(
      main,
      "setState",
      { instanceId: created.instanceId, state: Buffer.from(JSON.stringify(tamperedState), "utf8").toString("base64") },
      true,
      session
    );
    check(
      restoredTamperedState.parameters?.some((parameter) => parameter.id === "output-level" && parameter.normalizedValue === 0),
      "setState ignores read-only parameter values in opaque state envelopes"
    );

    const missingPreset = await request(
      main,
      "setPreset",
      { instanceId: created.instanceId, presetId: "does-not-exist" },
      true,
      session
    ).then(
      () => ({ ok: true }),
      (error) => ({ code: error.code })
    );
    check(missingPreset.code === "preset_not_found", "setPreset rejects unknown preset ids");

    const oversizedPresetId = await request(
      main,
      "setPreset",
      { instanceId: created.instanceId, presetId: "x".repeat(65) },
      true,
      session
    ).then(
      () => ({ ok: true }),
      (error) => ({ code: error.code })
    );
    check(oversizedPresetId.code === "invalid_argument", "setPreset rejects oversized preset ids");

    return created;
  }

  return {
    checkInstanceSetupAndState
  };
}
