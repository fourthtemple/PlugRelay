export const DEFAULT_MAX_WORKER_STDOUT_LINE_BYTES = 16 * 1024 * 1024;
export const DEFAULT_MAX_WORKER_COMMAND_BYTES = 16 * 1024 * 1024;
export const DEFAULT_MAX_WORKER_PENDING_COMMAND_BYTES = 64 * 1024 * 1024;
export const DEFAULT_MAX_WORKER_STDERR_LINE_BYTES = 1024 * 1024;
export const DEFAULT_MAX_WORKER_STDERR_BYTES = 4 * 1024 * 1024;
export const DEFAULT_MAX_WORKER_PENDING_COMMANDS = 64;
export const DEFAULT_WORKER_READY_TIMEOUT_MS = 5000;
export const DEFAULT_WORKER_TERMINATION_GRACE_MS = 250;
export const DEFAULT_EXAMPLE_WORKER_COMMAND_TIMEOUT_MS = 1500;
export const DEFAULT_NATIVE_WORKER_COMMAND_TIMEOUT_MS = 5000;
export const DEFAULT_MAX_WORKER_DIAGNOSTIC_LOG_CHARS = 4096;

export function encodeAudioChannels(channels, frames) {
  if (!Array.isArray(channels) || channels.length === 0) {
    return "-";
  }

  return channels
    .map((channel) => {
      const samples = Array.from({ length: frames }, (_, frame) => {
        const value = Number(Array.isArray(channel) ? channel[frame] : 0);
        return Number.isFinite(value) ? String(Math.max(-1, Math.min(1, value))) : "0";
      });
      return samples.join(",");
    })
    .join("|");
}

export function encodeWorkerText(value) {
  const text = String(value ?? "");
  return text ? Buffer.from(text, "utf8").toString("base64") : "-";
}

export function normalizeWorkerFileGrantResult(parsed) {
  return {
    applied: parsed?.applied === true,
    status: boundedWorkerText(parsed?.status, 64)
  };
}

export function normalizeWorkerStdoutLineLimit(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_MAX_WORKER_STDOUT_LINE_BYTES;
  }
  return number;
}

export function normalizeWorkerCommandLimit(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_MAX_WORKER_COMMAND_BYTES;
  }
  return number;
}

export function normalizeWorkerPendingCommandByteLimit(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_MAX_WORKER_PENDING_COMMAND_BYTES;
  }
  return number;
}

export function normalizeWorkerStderrLineLimit(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_MAX_WORKER_STDERR_LINE_BYTES;
  }
  return number;
}

export function normalizeWorkerStderrBudget(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_MAX_WORKER_STDERR_BYTES;
  }
  return number;
}

export function normalizeWorkerPendingCommandLimit(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_MAX_WORKER_PENDING_COMMANDS;
  }
  return number;
}

export function normalizeWorkerReadyTimeout(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_WORKER_READY_TIMEOUT_MS;
  }
  return number;
}

export function normalizeWorkerTerminationGrace(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 0) {
    return DEFAULT_WORKER_TERMINATION_GRACE_MS;
  }
  return number;
}

export function normalizeWorkerCommandTimeout(value, fallback) {
  const fallbackNumber = Math.floor(Number(fallback));
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    return Number.isFinite(fallbackNumber) && fallbackNumber > 0
      ? fallbackNumber
      : DEFAULT_NATIVE_WORKER_COMMAND_TIMEOUT_MS;
  }
  return number;
}

export function normalizeWorkerDiagnosticLogLimit(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_MAX_WORKER_DIAGNOSTIC_LOG_CHARS;
  }
  return number;
}

export function workerLineTooLarge(line, maxBytes) {
  return Buffer.byteLength(line, "utf8") > maxBytes;
}

export function workerCommandBytes(command) {
  return Buffer.byteLength(`${command}\n`, "utf8");
}

export function handleWorkerStderr(worker, chunk, label) {
  worker.stderrBuffer += chunk;
  while (true) {
    const newline = worker.stderrBuffer.indexOf("\n");
    if (newline < 0) {
      if (workerLineTooLarge(worker.stderrBuffer, worker.maxStderrLineBytes)) {
        worker.abortWorker(workerStderrLineError(worker.maxStderrLineBytes));
      }
      return;
    }

    const rawLine = worker.stderrBuffer.slice(0, newline);
    worker.stderrBuffer = worker.stderrBuffer.slice(newline + 1);
    if (workerLineTooLarge(rawLine, worker.maxStderrLineBytes)) {
      worker.abortWorker(workerStderrLineError(worker.maxStderrLineBytes));
      return;
    }
    if (!accountWorkerStderr(worker, `${rawLine}\n`)) {
      return;
    }

    const message = sanitizeWorkerDiagnosticMessage(rawLine.trim(), worker.maxDiagnosticLogChars);
    if (message) {
      console.warn(`${label} stderr: ${message}`);
    }
  }
}

export function workerStdoutLineError(maxBytes) {
  return new Error(`worker_stdout_too_large: worker stdout line exceeded ${maxBytes} bytes`);
}

export function workerCommandTooLargeError(maxBytes) {
  return new Error(`worker_command_too_large: worker command exceeded ${maxBytes} bytes`);
}

export function workerStdoutParseError(error) {
  return new Error(`worker_stdout_malformed: worker stdout was not valid JSON (${String(error?.message ?? error)})`);
}

export function workerUnexpectedStdoutError() {
  return new Error("worker_stdout_unexpected: worker emitted stdout without a pending command");
}

export function workerReadyTimeoutError(timeoutMs) {
  return new Error(`worker_ready_timeout: worker did not report ready within ${timeoutMs}ms`);
}

export function workerReadyHandshakeError(message) {
  return new Error(`worker_ready_invalid: ${message}`);
}

export function workerPendingCommandsError(maxCommands) {
  return new Error(`worker_pending_commands_exceeded: worker has ${maxCommands} pending commands`);
}

export function workerPendingCommandBytesError(maxBytes) {
  return new Error(`worker_pending_command_bytes_exceeded: worker pending commands exceeded ${maxBytes} bytes`);
}

export function workerCommandTimeoutError(timeoutMs) {
  return new Error(`worker_command_timeout: worker command timed out after ${timeoutMs}ms`);
}

export function terminateWorkerProcess(process, graceMs) {
  if (!process || workerProcessExited(process)) {
    return;
  }
  try {
    process.kill();
  } catch {
    return;
  }
  setTimeout(() => {
    if (!workerProcessExited(process)) {
      try {
        process.kill("SIGKILL");
      } catch {}
    }
  }, graceMs).unref?.();
}

export function encodeTransportState(transport) {
  if (!transport || typeof transport !== "object") {
    return "-";
  }
  const parts = [];
  const addBoolean = (encodedName, property) => {
    if (Object.hasOwn(transport, property)) {
      parts.push(`${encodedName}=${transport[property] ? "1" : "0"}`);
    }
  };
  const addNumber = (encodedName, property) => {
    if (Object.hasOwn(transport, property)) {
      parts.push(`${encodedName}=${Number(transport[property])}`);
    }
  };

  addBoolean("playing", "playing");
  addBoolean("recording", "recording");
  addBoolean("loop", "loopActive");
  addNumber("tempo", "tempo");
  addNumber("num", "timeSignatureNumerator");
  addNumber("den", "timeSignatureDenominator");
  addNumber("ppq", "projectTimeMusic");
  addNumber("bar", "barPositionMusic");
  addNumber("cycleStart", "cycleStartMusic");
  addNumber("cycleEnd", "cycleEndMusic");
  addNumber("sample", "samplePosition");
  return parts.length > 0 ? parts.join(",") : "-";
}

export function nativeHostWorkerArgs(nativeHost, instance) {
  const common = [
    String(instance.sampleRate),
    String(instance.maxBlockSize),
    String(instance.inputChannels),
    String(instance.outputChannels),
    String(instance.kind ?? "unknown")
  ];

  if (nativeHost.format === "au") {
    return [
      "--host-au-worker",
      nativeHost.componentType,
      nativeHost.componentSubType,
      nativeHost.componentManufacturer,
      ...common
    ];
  }

  if (nativeHost.format === "vst3") {
    return [
      "--host-vst3-worker",
      nativeHost.bundlePath,
      ...common
    ];
  }

  if (nativeHost.format === "lv2") {
    return [
      "--host-lv2-worker",
      nativeHost.bundlePath,
      ...common
    ];
  }

  throw new Error(`Unsupported native host format: ${nativeHost.format}`);
}

export function formatNativeHostName(format) {
  switch (format) {
    case "au":
      return "Audio Unit";
    case "vst3":
      return "VST3";
    case "lv2":
      return "LV2";
    default:
      return String(format ?? "native");
  }
}

function boundedWorkerText(value, maxBytes) {
  const text = String(value ?? "");
  let output = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      continue;
    }
    if (Buffer.byteLength(output + char, "utf8") > maxBytes) {
      break;
    }
    output += char;
  }
  return output;
}

function accountWorkerStderr(worker, rawText) {
  worker.stderrBytes += Buffer.byteLength(rawText, "utf8");
  if (worker.stderrBytes > worker.maxStderrBytes) {
    worker.abortWorker(workerStderrBudgetError(worker.maxStderrBytes));
    return false;
  }
  return true;
}

function sanitizeWorkerDiagnosticMessage(value, maxChars) {
  const limit = normalizeWorkerDiagnosticLogLimit(maxChars);
  let sanitized = "";
  for (const char of String(value)) {
    const codePoint = char.codePointAt(0);
    if ((codePoint >= 0 && codePoint < 0x20) || codePoint === 0x7f) {
      sanitized += `\\u${codePoint.toString(16).padStart(4, "0")}`;
    } else {
      sanitized += char;
    }
    if (sanitized.length > limit) {
      return `${sanitized.slice(0, limit)}...`;
    }
  }
  return sanitized;
}

function workerStderrLineError(maxBytes) {
  return new Error(`worker_stderr_too_large: worker stderr line exceeded ${maxBytes} bytes`);
}

function workerStderrBudgetError(maxBytes) {
  return new Error(`worker_stderr_budget_exceeded: worker stderr exceeded ${maxBytes} bytes`);
}

function workerProcessExited(process) {
  return process.exitCode !== null || process.signalCode !== null;
}
