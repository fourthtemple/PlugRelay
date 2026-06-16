import { REDACTED_LOCAL_PATH, redactLocalPaths } from "./local-path-redaction.mjs";

const MAX_ERROR_MESSAGE_BYTES = 1200;

export function installedProbeErrorSummary(error) {
  const rawMessage = error?.message ?? String(error);
  const message = truncateUtf8(redactLocalPaths(rawMessage).replace(/\u0000/g, ""), MAX_ERROR_MESSAGE_BYTES);
  const rawCode = error?.code ?? String(rawMessage).split(":")[0];
  const code = normalizeErrorCode(rawCode);
  return { code, message };
}

function normalizeErrorCode(value) {
  const redacted = redactLocalPaths(value).trim();
  if (!redacted || redacted.includes(REDACTED_LOCAL_PATH)) {
    return "unknown_error";
  }
  const normalized = redacted
    .replace(/\u0000/g, "")
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return normalized || "unknown_error";
}

function truncateUtf8(value, maxBytes) {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }
  return `${Buffer.from(value, "utf8").subarray(0, maxBytes).toString("utf8").replace(/\uFFFD+$/g, "")}...`;
}
