import { summarizeProbeResults } from "./installed-plugin-probe-reporting.mjs";

export function exerciseInstalledProbeLatencySupport({ check }) {
  const summary = summarizeProbeResults([
    {
      ok: true,
      pluginId: "neutral:latency-tail",
      pluginLatencySamples: 128,
      transportLatencySamples: 32,
      reportedLatencySamples: 160,
      tailSamples: 4096,
      infiniteTail: false
    },
    {
      ok: true,
      pluginId: "neutral:latency-partial",
      pluginLatencySamples: 64,
      transportLatencySamples: 0,
      reportedLatencySamples: 64
    },
    {
      ok: false,
      pluginId: "neutral:latency-failed",
      phases: [{ name: "getTailTime", ok: false, error: { code: "bad_tail_time" } }]
    }
  ]);
  check(
    summary.coverage.latencyTail["latency-tail"] === 1 &&
      summary.coverage.latencyTail.partial === 1 &&
      summary.coverage.latencyTail.failed === 1 &&
      summary.matrix[0].latencyTail === "latency-tail" &&
      summary.matrix[0].featureStatus.latencyTail === "passed" &&
      summary.matrix[1].latencyTail === "partial" &&
      summary.matrix[1].featureStatus.latencyTail === "partial" &&
      summary.matrix[2].latencyTail === "failed" &&
      summary.matrix[2].featureStatus.latencyTail === "failed",
    "installed plugin probe reports status-only latency/tail results"
  );
}
