export const REDACTED_LOCAL_PATH = "[local-path]";

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
