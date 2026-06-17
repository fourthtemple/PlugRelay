import { summarizeProbeResults } from "./installed-plugin-probe-reporting.mjs";

export function exerciseInstalledProbeEditorSupport({ check }) {
  const editorSummary = summarizeProbeResults([
    {
      ok: true,
      format: "vst3",
      nativeEditor: { transport: "native-broker" }
    },
    {
      ok: true,
      format: "vst3",
      phases: [
        { name: "openNativeEditor", ok: true },
        { name: "closeNativeEditor", ok: true }
      ]
    },
    {
      ok: true,
      format: "vst3",
      nativeEditor: { transport: "unexpected-transport" }
    },
    {
      ok: false,
      format: "vst3",
      pluginId: "vst3:native-editor-failed",
      phases: [{ name: "openNativeEditor", ok: false, error: { code: "editor_broker_failed" } }]
    }
  ], { nativeEditorBroker: true });
  const notRequestedSummary = summarizeProbeResults([
    {
      ok: true,
      format: "vst3",
      nativeEditor: { transport: "native-broker" }
    }
  ]);

  check(
    editorSummary.coverage.nativeEditor.opened === 2 &&
      editorSummary.coverage.nativeEditor.missing === 1 &&
      editorSummary.coverage.nativeEditor.failed === 1 &&
      editorSummary.matrix[0].nativeEditor === "opened" &&
      editorSummary.matrix[0].featureStatus.editor === "opened" &&
      editorSummary.matrix[1].nativeEditor === "opened" &&
      editorSummary.matrix[2].nativeEditor === "missing" &&
      editorSummary.matrix[2].featureStatus.editor === "missing" &&
      editorSummary.matrix[3].nativeEditor === "failed" &&
      editorSummary.matrix[3].featureStatus.editor === "failed" &&
      notRequestedSummary.matrix[0].nativeEditor === "not-requested" &&
      notRequestedSummary.matrix[0].featureStatus.editor === "not-requested",
    "installed plugin probe reports bounded native editor status results"
  );
}
