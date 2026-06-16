const REDACTED_LOCAL_PATH = "[local-path]";
const MAX_ERROR_MESSAGE_BYTES = 1200;

const FILE_URL_KNOWN_FILE_PATH =
  /file:\/\/[^"'`<>\r\n]*?\.(?:vst3|component|lv2|clap|dll|dylib|so|bundle|preset|fxp|fxb|aupreset|wav|aif|aiff|flac|mid|midi|json|plist|key|license|lic|txt|log)(?:\/[^\s"'`<>\r\n]*)*(?=$|[\s"'`<>,;:)\]])/gi;
const GENERIC_FILE_URL = /file:\/\/[^\s"'`<>\r\n]*/gi;
const QUOTED_LOCAL_PATH =
  /(["'])(?:file:\/\/)?(?:\/(?:Users|Volumes|Applications|Library|System|private|tmp|var|opt|usr|etc|home)\/|~\/|[A-Za-z]:\\)[^"'`<>\r\n]*\1/g;
const UNIX_KNOWN_FILE_PATH =
  /(?:\/(?:Users|Volumes|Applications|Library|System|private|tmp|var|opt|usr|etc|home)\/|~\/)[^"'`<>\r\n]*?\.(?:vst3|component|lv2|clap|dll|dylib|so|bundle|preset|fxp|fxb|aupreset|wav|aif|aiff|flac|mid|midi|json|plist|key|license|lic|txt|log)(?:\/[^\s"'`<>\r\n]*)*(?=$|[\s"'`<>,;:)\]])/gi;
const WINDOWS_KNOWN_FILE_PATH =
  /[A-Za-z]:\\[^"'`<>\r\n]*?\.(?:vst3|component|lv2|clap|dll|dylib|so|bundle|preset|fxp|fxb|aupreset|wav|aif|aiff|flac|mid|midi|json|plist|key|license|lic|txt|log)(?:\\[^\s"'`<>\r\n]*)*(?=$|[\s"'`<>,;:)\]])/gi;
const GENERIC_UNIX_PATH = /(?:\/(?:Users|Volumes|Applications|Library|System|private|tmp|var|opt|usr|etc|home)\/|~\/)[^\s"'`<>\r\n]*/g;
const GENERIC_WINDOWS_PATH = /[A-Za-z]:\\[^\s"'`<>\r\n]*/g;

export function installedProbeErrorSummary(error) {
  const rawMessage = error?.message ?? String(error);
  const message = truncateUtf8(redactLocalPaths(rawMessage).replace(/\u0000/g, ""), MAX_ERROR_MESSAGE_BYTES);
  const rawCode = error?.code ?? String(rawMessage).split(":")[0];
  const code = normalizeErrorCode(rawCode);
  return { code, message };
}

export function redactLocalPaths(value) {
  return String(value ?? "")
    .replace(FILE_URL_KNOWN_FILE_PATH, REDACTED_LOCAL_PATH)
    .replace(GENERIC_FILE_URL, REDACTED_LOCAL_PATH)
    .replace(QUOTED_LOCAL_PATH, (match, quote) => `${quote}${REDACTED_LOCAL_PATH}${quote}`)
    .replace(UNIX_KNOWN_FILE_PATH, REDACTED_LOCAL_PATH)
    .replace(WINDOWS_KNOWN_FILE_PATH, REDACTED_LOCAL_PATH)
    .replace(GENERIC_UNIX_PATH, REDACTED_LOCAL_PATH)
    .replace(GENERIC_WINDOWS_PATH, REDACTED_LOCAL_PATH);
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
