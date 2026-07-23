import { assert, assertPublicPluginMetadata } from "./smoke-test-assertions.mjs";

export async function runPluginDiscoverySmoke({
  exampleFormats,
  expectedExampleSource,
  pair,
  request,
  socket
}) {
  const { plugins } = await request(socket, "listPlugins", {}, true, pair.sessionToken);
  assert(Array.isArray(plugins) && plugins.length >= 3, "listPlugins returned mock and example native-format plugins");
  assert(plugins.some((plugin) => plugin.format === "mock"), "listPlugins returned mock plugin format metadata");
  const mockPlugin = plugins.find((plugin) => plugin.pluginId === "mock.gain");
  assert(Array.isArray(mockPlugin?.presets) && mockPlugin.presets.length >= 2, "listPlugins returned mock preset snapshots");

  for (const scanOnlyPlugin of plugins.filter((plugin) => plugin.source === "scan" && plugin.hostable === false)) {
    assert(scanOnlyPlugin.hostable === false, `${scanOnlyPlugin.pluginId} is marked scan-only/non-hostable`);
    assert(
      typeof scanOnlyPlugin.hostUnavailableReason === "string" && scanOnlyPlugin.hostUnavailableReason.length > 0,
      `${scanOnlyPlugin.pluginId} includes a host-unavailable reason`
    );
    assert(!("executablePath" in scanOnlyPlugin), `${scanOnlyPlugin.pluginId} does not expose an executable path`);
    assert(!("diagnostics" in scanOnlyPlugin), `${scanOnlyPlugin.pluginId} does not expose scanner diagnostics by default`);
  }
  for (const plugin of plugins) {
    assertPublicPluginMetadata(plugin, `${plugin.pluginId} exposes only path-free public metadata`);
  }
  for (const format of exampleFormats) {
    assert(
      plugins.some((plugin) => plugin.format === format && plugin.kind === "instrument" && plugin.source === expectedExampleSource),
      `listPlugins returned ${format.toUpperCase()} example instrument metadata`
    );
    const instrument = plugins.find(
      (plugin) => plugin.format === format && plugin.kind === "instrument" && plugin.source === expectedExampleSource
    );
    assert(
      Array.isArray(instrument?.presets) && instrument.presets.length >= 2,
      `listPlugins returned ${format} example instrument presets`
    );
  }

  const unsupportedRequiredLv2 = plugins.find((plugin) => plugin.pluginId === "lv2:plugrelay-unsupported-required.lv2");
  assert(
    unsupportedRequiredLv2?.hostable === false &&
      unsupportedRequiredLv2.hostUnavailableReason?.includes("unsupported LV2 host features"),
    "listPlugins marks LV2 plugins with unsupported required features as scan-only"
  );

  const vst3Scan = await request(socket, "scanPlugins", { formats: ["vst3"] }, true, pair.sessionToken);
  assert(
    Array.isArray(vst3Scan.plugins) && vst3Scan.plugins.every((plugin) => plugin.format === "vst3"),
    "scanPlugins filters VST3 plugins by format"
  );
  assert(
    vst3Scan.plugins.some((plugin) => plugin.kind === "instrument" && plugin.source === expectedExampleSource),
    "scanPlugins includes the VST3 example instrument"
  );

  const lv2Scan = await request(socket, "scanPlugins", { formats: ["lv2"] }, true, pair.sessionToken);
  assert(
    Array.isArray(lv2Scan.plugins) && lv2Scan.plugins.every((plugin) => plugin.format === "lv2"),
    "scanPlugins filters LV2 plugins by format"
  );
  assert(
    lv2Scan.plugins.some((plugin) => plugin.kind === "instrument" && plugin.source === expectedExampleSource),
    "scanPlugins includes the LV2 example instrument"
  );
  assert(
    lv2Scan.plugins.some((plugin) => plugin.pluginId === "lv2:plugrelay-unsupported-required.lv2" && plugin.hostable === false),
    "scanPlugins preserves unsupported-required LV2 bundles as discovery-only"
  );
  assert(
    lv2Scan.plugins.some((plugin) => plugin.pluginId === "lv2:plugrelay-unsupported-option.lv2" && plugin.hostable === false),
    "scanPlugins preserves unsupported-required-option LV2 bundles as discovery-only"
  );
  assert(
    lv2Scan.plugins.some((plugin) => plugin.pluginId === "lv2:plugrelay-example-gain.lv2" && plugin.hostable === true),
    "scanPlugins treats LV2 bounded-block-length plus options requirements as hostable"
  );

  const lv2GainMetadata = lv2Scan.plugins.find((plugin) => plugin.pluginId === "lv2:plugrelay-example-gain.lv2")?.metadata;
  assert(
    lv2GainMetadata?.lv2UiTypes === "x11" &&
      lv2GainMetadata.lv2UiCount === "1" &&
      lv2GainMetadata.lv2UiBinaryCount === "0",
    "scanPlugins exposes bounded path-free LV2 UI declaration metadata"
  );
  const lv2BlockProfileMetadata = lv2Scan.plugins.find((plugin) => plugin.pluginId === "lv2:plugrelay-block-profile-gain.lv2")?.metadata;
  assert(
    lv2BlockProfileMetadata?.lv2BlockSizeProfile === "fixed-power-of-two",
    "scanPlugins exposes LV2 fixed power-of-two block profile metadata"
  );

  await request(
    socket,
    "createInstance",
    {
      pluginId: "lv2:plugrelay-unsupported-required.lv2",
      format: "lv2",
      sampleRate: 48000,
      maxBlockSize: 128,
      inputChannels: 2,
      outputChannels: 2
    },
    true,
    pair.sessionToken
  ).then(
    () => {
      throw new Error("unsupported-required LV2 plugin unexpectedly created an instance");
    },
    (error) => {
      assert(
        error.message.includes("plugin_not_hostable"),
        "unsupported-required LV2 plugins are rejected before worker launch"
      );
    }
  );

  const firstScanOnly = plugins.find((plugin) => plugin.source === "scan" && plugin.hostable === false);
  if (firstScanOnly) {
    await request(
      socket,
      "createInstance",
      {
        pluginId: firstScanOnly.pluginId,
        format: firstScanOnly.format,
        sampleRate: 48000,
        maxBlockSize: 128,
        inputChannels: 2,
        outputChannels: 2
      },
      true,
      pair.sessionToken
    ).then(
      () => {
        throw new Error("scan-only plugin unexpectedly created an instance");
      },
      (error) => {
        assert(
          error.message.includes("plugin_not_hostable"),
          "scan-only installed plugins are rejected before instance creation"
        );
      }
    );
  }

  return { plugins, mockPlugin };
}
