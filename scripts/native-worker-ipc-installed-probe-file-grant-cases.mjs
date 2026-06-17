import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  probeFileGrantCacheDirectoryOpen,
  probeFileGrantLicenseLoad,
  probeFileGrantOtherPresetLoad,
  probeFileGrantSampleLoad
} from "./installed-plugin-probe-file-grants.mjs";

export async function exerciseInstalledProbeFileGrantSupport({ check }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "soundbridge-probe-file-grants-"));
  try {
    const result = {};
    let requestCount = 0;
    const args = {
      assertProbe,
      fileGrantRoot: tempDir,
      instanceId: "inst-file-grants",
      phase: recordPhase,
      plugin: {
        format: "vst3",
        pluginId: "vst3:file-grant-fixture",
        fileGrantOperations: ["loadPreset", "restoreState", "saveStateDirectory"]
      },
      request: async () => {
        requestCount += 1;
        throw new Error("unadvertised grant path should not reach the daemon");
      },
      result,
      session: "session",
      socket: {}
    };

    await probeFileGrantSampleLoad(args);
    await probeFileGrantCacheDirectoryOpen(args);
    await probeFileGrantLicenseLoad(args);
    await probeFileGrantOtherPresetLoad(args);

    check(
      result.fileGrantSampleLoad === "skipped-unadvertised" &&
        result.fileGrantCacheDirectoryOpen === "skipped-unadvertised" &&
        result.fileGrantLicenseLoad === "skipped-unadvertised" &&
        result.fileGrantOtherPresetLoad === "skipped-unadvertised" &&
        requestCount === 0 &&
        fs.readdirSync(tempDir).length === 0,
      "installed plugin probe skips unadvertised advanced file-grant workflows before path use"
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

function assertProbe(ok, code, message) {
  if (ok) {
    return;
  }
  const error = new Error(message);
  error.code = code;
  throw error;
}

async function recordPhase(_result, _name, operation) {
  return operation();
}
