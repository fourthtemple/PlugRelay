import { envInteger } from "./daemon-security-helpers.mjs";
import {
  DEFAULT_MAX_WORKER_DIAGNOSTIC_LOG_CHARS,
  createNativeWorkerProcesses
} from "./native-worker-processes.mjs";

export function createDaemonWorkerSecurity({ nativeRenderer, normalizers }) {
  const securityLimits = {
    maxWorkerStdoutLineBytes: envInteger("PLUGRELAY_MAX_WORKER_STDOUT_LINE_BYTES", 16 * 1024 * 1024),
    maxWorkerCommandBytes: envInteger("PLUGRELAY_MAX_WORKER_COMMAND_BYTES", 16 * 1024 * 1024),
    maxWorkerPendingCommandBytes: envInteger("PLUGRELAY_MAX_WORKER_PENDING_COMMAND_BYTES", 64 * 1024 * 1024),
    maxWorkerStderrLineBytes: envInteger("PLUGRELAY_MAX_WORKER_STDERR_LINE_BYTES", 1024 * 1024),
    maxWorkerStderrBytes: envInteger("PLUGRELAY_MAX_WORKER_STDERR_BYTES", 4 * 1024 * 1024),
    maxWorkerDiagnosticLogChars: envInteger(
      "PLUGRELAY_MAX_WORKER_DIAGNOSTIC_LOG_CHARS",
      DEFAULT_MAX_WORKER_DIAGNOSTIC_LOG_CHARS
    ),
    maxWorkerPendingCommands: envInteger("PLUGRELAY_MAX_WORKER_PENDING_COMMANDS", 64),
    workerReadyTimeoutMs: envInteger("PLUGRELAY_WORKER_READY_TIMEOUT_MS", 5000),
    workerTerminationGraceMs: envInteger("PLUGRELAY_WORKER_TERMINATION_GRACE_MS", 250),
    exampleWorkerCommandTimeoutMs: envInteger("PLUGRELAY_EXAMPLE_WORKER_COMMAND_TIMEOUT_MS", 1500),
    nativeWorkerCommandTimeoutMs: envInteger("PLUGRELAY_NATIVE_WORKER_COMMAND_TIMEOUT_MS", 5000)
  };

  return {
    ...createNativeWorkerProcesses({
      nativeRenderer,
      normalizers,
      ...securityLimits
    }),
    securityLimits
  };
}
