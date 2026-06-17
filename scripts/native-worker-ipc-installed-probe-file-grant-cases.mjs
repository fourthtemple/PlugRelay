import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  probeFileGrantCacheDirectoryOpen,
  probeFileGrantLicenseLoad,
  probeFileGrantOtherPresetLoad,
  probeFileGrantPresetLoad,
  probeFileGrantSampleLoad,
  probeFileGrantStateRestore,
  probeFileGrantStateSave
} from "./installed-plugin-probe-file-grants.mjs";
import { summarizeProbeResults } from "./installed-plugin-probe-reporting.mjs";

export async function exerciseInstalledProbeFileGrantSupport({ check }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "soundbridge-probe-file-grants-"));
  try {
    const result = {};
    let requestCount = 0;
    const state = { state: nativeStateEnvelope({ format: "vst3", component: "Yw==", controller: "Yw==" }) };
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
      socket: {},
      state
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

    const unadvertisedCoreResult = {};
    const unadvertisedCoreArgs = {
      ...args,
      plugin: { format: "vst3", pluginId: "vst3:file-grant-fixture", fileGrantOperations: [] },
      result: unadvertisedCoreResult
    };
    await probeFileGrantPresetLoad(unadvertisedCoreArgs);
    await probeFileGrantStateRestore(unadvertisedCoreArgs);
    await probeFileGrantStateSave(unadvertisedCoreArgs);
    check(
      unadvertisedCoreResult.fileGrantPresetLoad === "skipped-unadvertised" &&
        unadvertisedCoreResult.fileGrantStateRestore === "skipped-unadvertised" &&
        unadvertisedCoreResult.fileGrantStateSave === "skipped-unadvertised" &&
        unadvertisedCoreResult.fileGrantSavedStateRestore === "skipped-unadvertised" &&
        requestCount === 0 &&
        fs.readdirSync(tempDir).length === 0,
      "installed plugin probe skips unadvertised preset/state file-grant workflows before path use"
    );

    const stateResult = {};
    const observedStateRequests = [];
    const stateArgs = {
      ...args,
      plugin: {
        format: "vst3",
        pluginId: "vst3:file-grant-fixture",
        fileGrantOperations: ["loadPreset", "restoreState", "saveStateDirectory"]
      },
      request: createStateGrantRequest(observedStateRequests),
      result: stateResult
    };
    await probeFileGrantPresetLoad(stateArgs);
    await probeFileGrantStateRestore(stateArgs);
    await probeFileGrantStateSave(stateArgs);
    const stateCreateRequests = observedStateRequests.filter((request) => request.method === "createFileGrant");
    const stateUseRequests = observedStateRequests.filter((request) => request.method === "useFileGrant");
    check(
      stateResult.fileGrantPresetLoad === "applied" &&
        stateResult.fileGrantStateRestore === "applied" &&
        stateResult.fileGrantStateSave === "applied" &&
        stateResult.fileGrantSavedStateRestore === "applied" &&
        JSON.stringify(stateCreateRequests.map((request) => grantShape(request.payload))) === JSON.stringify([
          { purpose: "preset", access: "read", kind: "file" },
          { purpose: "state", access: "read", kind: "file" },
          { purpose: "state", access: "readWrite", kind: "directory" },
          { purpose: "state", access: "read", kind: "file" }
        ]) &&
        JSON.stringify(stateUseRequests.map((request) => useGrantShape(request.payload))) === JSON.stringify([
          { operation: "loadPreset" },
          { operation: "restoreState" },
          { operation: "saveStateDirectory" },
          { operation: "restoreState" }
        ]) &&
        fs.readdirSync(tempDir).length === 0,
      "installed plugin probe applies advertised preset/state file-grant workflows with bounded grant shapes"
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

    const leakingRequests = [];
    let leakCode = "";
    try {
      await probeFileGrantSampleLoad({
        ...advertisedArgs,
        request: createLeakingGrantRequest(leakingRequests),
        result: {}
      });
    } catch (error) {
      leakCode = error.code;
    }
    check(
      leakCode === "native_editor_launch_data_leak" &&
        JSON.stringify(leakingRequests.map((request) => request.method)) ===
          JSON.stringify(["createFileGrant", "attachFileGrant", "useFileGrant", "detachFileGrant", "revokeFileGrant"]) &&
        fs.readdirSync(tempDir).length === 0,
      "installed plugin probe cleans up advertised file grants when responses leak paths"
    );

    const failingRequests = [];
    let failureCode = "";
    try {
      await probeFileGrantCacheDirectoryOpen({
        ...advertisedArgs,
        request: createFailingGrantRequest(failingRequests),
        result: {}
      });
    } catch (error) {
      failureCode = error.code;
    }
    check(
      failureCode === "file_grant_operation_failed" &&
        JSON.stringify(failingRequests.map((request) => request.method)) ===
          JSON.stringify(["createFileGrant", "attachFileGrant", "useFileGrant", "detachFileGrant", "revokeFileGrant"]) &&
        fs.readdirSync(tempDir).length === 0,
      "installed plugin probe cleans up advertised file grants when workers fail"
    );

    const failureSummary = summarizeProbeResults([
      {
        ok: true,
        pluginId: "neutral:file-grant-failed",
        fileGrantSampleLoad: "failed",
        fileGrantCacheDirectoryOpen: "failed",
        fileGrantLicenseLoad: "failed",
        fileGrantOtherPresetLoad: "failed",
        fileGrantOperations: ["loadSample", "openCacheDirectory", "loadLicense", "other"]
      }
    ]);
    check(
      failureSummary.coverage.fileGrantSampleLoad.failed === 1 &&
        failureSummary.coverage.fileGrantCacheDirectoryOpen.failed === 1 &&
        failureSummary.coverage.fileGrantLicenseLoad.failed === 1 &&
        failureSummary.coverage.fileGrantOtherPresetLoad.failed === 1 &&
        failureSummary.matrix[0].featureStatus.fileGrants === "failed",
      "installed plugin probe reports advanced file-grant workflow failures"
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

function createStateGrantRequest(observedRequests) {
  const grantPaths = new Map();
  return async (_socket, method, payload) => {
    observedRequests.push({ method, payload });
    if (method === "createFileGrant") {
      const grantId = `grant-${observedRequests.length}`;
      grantPaths.set(grantId, payload.path);
      return { grantId };
    }
    if (method === "useFileGrant") {
      if (payload.operation === "saveStateDirectory") {
        fs.writeFileSync(path.join(grantPaths.get(payload.grantId), "state.fixture"), "saved-state\n", "utf8");
      }
      return { applied: true, operation: payload.operation };
    }
    return { ok: true };
  };
}

function createLeakingGrantRequest(observedRequests) {
  return async (_socket, method, payload) => {
    observedRequests.push({ method, payload });
    if (method === "createFileGrant") {
      return { grantId: "grant-leak" };
    }
    if (method === "useFileGrant") {
      return { applied: true, operation: payload.operation, path: "should-not-leak" };
    }
    return { ok: true };
  };
}

function createFailingGrantRequest(observedRequests) {
  return async (_socket, method, payload) => {
    observedRequests.push({ method, payload });
    if (method === "createFileGrant") {
      return { grantId: "grant-fail" };
    }
    if (method === "useFileGrant") {
      const error = new Error("file grant operation failed");
      error.code = "file_grant_operation_failed";
      throw error;
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

function nativeStateEnvelope(nativeState) {
  return Buffer.from(JSON.stringify({ nativeState }), "utf8").toString("base64");
}
