import path from "node:path";

export async function exerciseNativeWorkerProcessErrorSupport({
  check,
  createTestWorkers,
  nativeWorkerInstance,
  tempDir
}) {
  const missingWorkerPath = path.join(tempDir, "missing-private-renderer.vst3");
  const workers = createTestWorkers(missingWorkerPath);

  const missingExampleWorker = new workers.ExampleInstrumentWorker(missingWorkerPath);
  await expectRejectedWithRedactedPath(
    () => missingExampleWorker.render({ frames: 1, sampleRate: 48000, gain: 0.5, tone: 0.5, detune: 0.5 }),
    missingWorkerPath,
    check,
    "example instrument worker spawn errors redact local paths"
  );
  missingExampleWorker.destroy();

  const missingNativeWorker = new workers.NativeHostWorker(
    { format: "vst3", bundlePath: tempDir, renderEngine: "native-vst3" },
    nativeWorkerInstance()
  );
  await expectRejectedWithRedactedPath(
    () => missingNativeWorker.ready,
    missingWorkerPath,
    check,
    "native host worker spawn errors redact local paths"
  );
  missingNativeWorker.destroy();
}

async function expectRejectedWithRedactedPath(operation, forbiddenPath, check, message) {
  try {
    await operation();
    check(false, message);
  } catch (error) {
    const errorText = String(error?.message ?? error);
    check(
      errorText.includes("spawn") &&
        errorText.includes("[local-path]") &&
        !errorText.includes(forbiddenPath),
      message
    );
  }
}
