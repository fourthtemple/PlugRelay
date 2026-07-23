import { isKnownAudioUnitHostProfile } from "./daemon-au-host-profiles.mjs";
import { FILE_GRANT_OPERATION_NAMES, isKnownFileGrantOperation } from "./daemon-file-grant-operations.mjs";

// Keep this list aligned with operations implemented by the native host workers.
const NATIVE_FILE_GRANT_OPERATIONS = Object.freeze(["loadPreset", "restoreState", "saveStateDirectory"]);
const PLUGIN_EDITOR_KINDS = Object.freeze(["generic-parameters", "native-window"]);

export function deduplicatePluginCatalog(plugins) {
  const unique = [];
  const indexByPluginId = new Map();

  for (const plugin of plugins) {
    const existingIndex = indexByPluginId.get(plugin.pluginId);
    if (existingIndex === undefined) {
      indexByPluginId.set(plugin.pluginId, unique.length);
      unique.push(plugin);
      continue;
    }

    if (pluginRecordScore(plugin) > pluginRecordScore(unique[existingIndex])) {
      unique[existingIndex] = plugin;
    }
  }

  return unique;
}

function pluginRecordScore(plugin) {
  let score = 0;
  if (plugin.hostable === true) score += 16;
  if (plugin.nativeHost) score += 8;
  if (plugin.metadata?.stableId) score += 4;
  if (plugin.vendor && plugin.vendor !== "Unknown") score += 2;
  if (plugin.kind && plugin.kind !== "unknown") score += 1;
  return score;
}

export function formatCategory(format) {
  switch (format) {
    case "vst3":
      return "VST3";
    case "au":
      return "AudioUnit";
    case "lv2":
      return "LV2";
    default:
      return "Unknown";
  }
}

export function fileGrantOperationsForNativeHost(nativeHost) {
  return nativeHost && ["au", "vst3", "lv2"].includes(nativeHost.format)
    ? [...NATIVE_FILE_GRANT_OPERATIONS]
    : undefined;
}

export function editorKindsForHostableNativeHost(hostable, nativeHost) {
  if (!hostable) {
    return undefined;
  }
  return nativeHost && ["au", "vst3", "lv2"].includes(nativeHost.format)
    ? ["generic-parameters", "native-window"]
    : ["generic-parameters"];
}

export function normalizeFileGrantOperations(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const operations = [];
  for (const rawOperation of value) {
    const operation = String(rawOperation ?? "");
    if (isKnownFileGrantOperation(operation) && !operations.includes(operation)) {
      operations.push(operation);
    }
    if (operations.length >= FILE_GRANT_OPERATION_NAMES.length) {
      break;
    }
  }
  return operations;
}

export function normalizeEditorKinds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const kinds = [];
  for (const rawKind of value) {
    const kind = String(rawKind ?? "");
    if (PLUGIN_EDITOR_KINDS.includes(kind) && !kinds.includes(kind)) {
      kinds.push(kind);
    }
    if (kinds.length >= PLUGIN_EDITOR_KINDS.length) {
      break;
    }
  }
  return kinds;
}

export function clonePluginClassMetadata(metadata, context) {
  const normalized = normalizePluginClassMetadata(metadata, context);
  return normalized ? { ...normalized } : undefined;
}

export function normalizePluginClassMetadata(value, { maxPluginMetadataTextBytes, truncateText }) {
  const source = value && typeof value === "object" ? value : {};
  const metadata = {};
  const add = (key, maxBytes = maxPluginMetadataTextBytes) => {
    const text = truncateText(source[key], maxBytes);
    if (text) {
      metadata[key] = text;
    }
  };

  add("stableId");
  add("bundleIdentifier");
  add("version", 80);
  add("vst3ClassId", 64);
  add("vst3SdkVersion", 80);
  add("componentType", 16);
  add("componentSubType", 16);
  add("componentManufacturer", 16);
  const audioUnitHostProfile = truncateText(source.audioUnitHostProfile, 64);
  if (isKnownAudioUnitHostProfile(audioUnitHostProfile)) {
    metadata.audioUnitHostProfile = audioUnitHostProfile;
  }
  add("lv2Uri");
  add("lv2BlockSizeProfile", 32);
  add("lv2UiTypes");
  add("lv2UiCount", 16);
  add("lv2UiBinaryCount", 16);

  if (!metadata.stableId) {
    if (metadata.vst3ClassId) {
      metadata.stableId = `vst3:${metadata.vst3ClassId}`;
    } else if (metadata.componentManufacturer && metadata.componentType && metadata.componentSubType) {
      metadata.stableId = `${metadata.componentManufacturer}:${metadata.componentType}:${metadata.componentSubType}`;
    } else if (metadata.lv2Uri) {
      metadata.stableId = metadata.lv2Uri;
    } else if (metadata.bundleIdentifier) {
      metadata.stableId = metadata.bundleIdentifier;
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
