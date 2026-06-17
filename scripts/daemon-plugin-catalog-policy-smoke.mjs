import { FILE_GRANT_OPERATION_NAMES } from "./daemon-file-grant-operations.mjs";
import {
  editorKindsForHostableNativeHost,
  fileGrantOperationsForNativeHost,
  normalizeEditorKinds,
  normalizeFileGrantOperations
} from "./daemon-plugin-catalog-policy.mjs";

const IMPLEMENTED_NATIVE_FILE_GRANT_OPERATIONS = ["loadPreset", "restoreState", "saveStateDirectory"];
const FUTURE_NATIVE_FILE_GRANT_OPERATIONS = ["loadSample", "openCacheDirectory", "loadLicense", "other"];

for (const format of ["vst3", "au", "lv2"]) {
  const operations = fileGrantOperationsForNativeHost({ format });
  assertArrayEquals(
    operations,
    IMPLEMENTED_NATIVE_FILE_GRANT_OPERATIONS,
    `${format} native hosts advertise implemented file-grant operations only`
  );
  for (const operation of FUTURE_NATIVE_FILE_GRANT_OPERATIONS) {
    assert(!operations.includes(operation), `${format} native hosts do not advertise future ${operation} grants`);
  }
}

assert(fileGrantOperationsForNativeHost({ format: "mock" }) === undefined, "mock hosts do not advertise native file grants");
assert(fileGrantOperationsForNativeHost(undefined) === undefined, "missing native host does not advertise native file grants");

assertArrayEquals(
  normalizeFileGrantOperations([
    "loadSample",
    "unknown",
    "loadSample",
    "openCacheDirectory",
    "loadLicense",
    "other",
    "restoreState",
    "saveStateDirectory",
    "loadPreset",
    "unexpected"
  ]),
  ["loadSample", "openCacheDirectory", "loadLicense", "other", "restoreState", "saveStateDirectory", "loadPreset"],
  "file-grant operation normalization keeps unique known operations"
);
assertArrayEquals(
  normalizeFileGrantOperations([...FILE_GRANT_OPERATION_NAMES, "not-a-real-operation"]),
  FILE_GRANT_OPERATION_NAMES,
  "file-grant operation normalization is capped to known operation count"
);

assertArrayEquals(
  editorKindsForHostableNativeHost(true, { format: "vst3" }),
  ["generic-parameters", "native-window"],
  "hostable native hosts advertise generic and native editor kinds"
);
assert(editorKindsForHostableNativeHost(false, { format: "vst3" }) === undefined, "discovery-only native hosts advertise no editor kinds");
assertArrayEquals(
  editorKindsForHostableNativeHost(true, { format: "mock" }),
  ["generic-parameters"],
  "non-native hostable plugins advertise generic editors only"
);
assertArrayEquals(
  normalizeEditorKinds(["native-window", "unknown", "generic-parameters", "native-window"]),
  ["native-window", "generic-parameters"],
  "editor kind normalization keeps unique known editor kinds"
);

console.log("Daemon plugin catalog policy smoke checks passed.");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertArrayEquals(actual, expected, message) {
  assert(Array.isArray(actual), `${message}: actual value is an array`);
  assert(
    actual.length === expected.length && actual.every((value, index) => value === expected[index]),
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}
