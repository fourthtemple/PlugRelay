export const AUDIO_UNIT_HOST_PROFILES = Object.freeze({
  REALTIME_MAIN_BUS: "realtime-main-bus",
  OFFLINE_RENDER: "offline-render",
  MULTI_SOURCE_FORMAT_CONVERTER: "multi-source-format-converter",
  MULTI_OUTPUT_SPLITTER: "multi-output-splitter"
});

export function classifyAudioUnitHostProfile(plugin) {
  if (plugin?.format !== "au") {
    return {};
  }

  const diagnostics = plugin.diagnostics ?? {};
  const componentType = String(diagnostics.componentType ?? plugin.metadata?.componentType ?? "");
  const componentSubType = String(diagnostics.componentSubType ?? plugin.metadata?.componentSubType ?? "");
  const componentManufacturer = String(diagnostics.componentManufacturer ?? plugin.metadata?.componentManufacturer ?? "");

  if (!componentType || !componentSubType || !componentManufacturer) {
    return {};
  }

  if (componentType === "auol") {
    return {
      profile: AUDIO_UNIT_HOST_PROFILES.OFFLINE_RENDER,
      hostUnavailableReason: "This Audio Unit is an offline effect and requires a future offline-render host profile."
    };
  }

  if (componentManufacturer === "appl" && componentType === "aufc" && componentSubType === "amix") {
    return {
      profile: AUDIO_UNIT_HOST_PROFILES.MULTI_SOURCE_FORMAT_CONVERTER,
      hostUnavailableReason:
        "AUAudioMix requires a multi-source format-converter host profile; the current Audio Unit bridge hosts realtime main-bus units."
    };
  }

  if (componentManufacturer === "appl" && componentType === "aumx" && componentSubType === "mspl") {
    return {
      profile: AUDIO_UNIT_HOST_PROFILES.MULTI_OUTPUT_SPLITTER,
      hostUnavailableReason:
        "AUMultiSplitter requires a multi-output splitter host profile; the current Audio Unit bridge hosts realtime main-bus units."
    };
  }

  return {
    profile: AUDIO_UNIT_HOST_PROFILES.REALTIME_MAIN_BUS
  };
}
