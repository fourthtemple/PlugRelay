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

    const advertisedResult = {};
    const observedRequests = [];
    const advertisedArgs = {
      ...args,
      plugin: {
        format: "vst3",
        pluginId: "vst3:file-grant-fixture",
        fileGrantOperations: ["loadSample", "openCacheDirectory", "loadLicense", "other"]
      },
      request: createPathFreeGrantRequest(observedRequests),
      result: advertisedResult
    };

    await probeFileGrantSampleLoad(advertisedArgs);
    await probeFileGrantCacheDirectoryOpen(advertisedArgs);
    await probeFileGrantLicenseLoad(advertisedArgs);
    await probeFileGrantOtherPresetLoad(advertisedArgs);

    const createRequests = observedRequests.filter((request) => request.method === "createFileGrant");
    const useRequests = observedRequests.filter((request) => request.method === "useFileGrant");
    check(
      advertisedResult.fileGrantSampleLoad === "applied" &&
        advertisedResult.fileGrantCacheDirectoryOpen === "applied" &&
        advertisedResult.fileGrantLicenseLoad === "applied" &&
        advertisedResult.fileGrantOtherPresetLoad === "applied" &&
        JSON.stringify(createRequests.map((request) => grantShape(request.payload))) === JSON.stringify([
          { purpose: "sample", access: "read", kind: "file" },
          { purpose: "cache", access: "readWrite", kind: "directory" },
          { purpose: "license", access: "read", kind: "file" },
          { purpose: "preset", access: "read", kind: "file" }
        ]) &&
        JSON.stringify(useRequests.map((request) => useGrantShape(request.payload))) === JSON.stringify([
          { operation: "loadSample" },
          { operation: "openCacheDirectory" },
          { operation: "loadLicense" },
          { operation: "other", purpose: "preset", access: "read", kind: "file" }
        ]) &&
        fs.readdirSync(tempDir).length === 0,
      "installed plugin probe applies advertised advanced file-grant workflows with bounded grant shapes"
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

function createPathFreeGrantRequest(observedRequests) {
  return async (_socket, method, payload) => {
    observedRequests.push({ method, payload });
    if (method === "createFileGrant") {
      return { grantId: `grant-${observedRequests.length}` };
    }
    if (method === "useFileGrant") {
      return { applied: true, operation: payload.operation };
    }
    return { ok: true };
  };
}

function grantShape(payload) {
  return {
    purpose: payload.purpose,
    access: payload.access,
    kind: payload.kind
  };
}

function useGrantShape(payload) {
  return {
    operation: payload.operation,
    ...(payload.purpose ? { purpose: payload.purpose } : {}),
    ...(payload.access ? { access: payload.access } : {}),
    ...(payload.kind ? { kind: payload.kind } : {})
  };
}
