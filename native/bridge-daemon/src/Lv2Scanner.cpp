#include "SoundBridge/Lv2Scanner.h"

#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <optional>

namespace soundbridge {

namespace {

std::filesystem::path repositoryExampleLv2Path() {
#ifdef SOUNDBRIDGE_SOURCE_DIR
  return std::filesystem::path(SOUNDBRIDGE_SOURCE_DIR) / "native" / "example-plugins" / "LV2";
#else
  return {};
#endif
}

std::filesystem::path homeLibraryLv2Path() {
  const char* home = std::getenv("HOME");
  if (home == nullptr || std::string(home).empty()) {
    return {};
  }
  return std::filesystem::path(home) / "Library" / "Audio" / "Plug-Ins" / "LV2";
}

std::filesystem::path homeDotLv2Path() {
  const char* home = std::getenv("HOME");
  if (home == nullptr || std::string(home).empty()) {
    return {};
  }
  return std::filesystem::path(home) / ".lv2";
}

std::string lv2NameFromPath(const std::filesystem::path& path) {
  auto name = path.stem().string();
  return name.empty() ? path.filename().string() : name;
}

std::string readTextFile(const std::filesystem::path& path) {
  std::ifstream input(path);
  if (!input) {
    return {};
  }
  return std::string(std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>());
}

std::optional<std::string> manifestStringValue(const std::string& manifest, const std::string& key) {
  const auto keyPosition = manifest.find("\"" + key + "\"");
  if (keyPosition == std::string::npos) {
    return std::nullopt;
  }
  const auto colonPosition = manifest.find(':', keyPosition);
  if (colonPosition == std::string::npos) {
    return std::nullopt;
  }
  const auto quoteStart = manifest.find('"', colonPosition + 1);
  if (quoteStart == std::string::npos) {
    return std::nullopt;
  }
  const auto quoteEnd = manifest.find('"', quoteStart + 1);
  if (quoteEnd == std::string::npos) {
    return std::nullopt;
  }
  return manifest.substr(quoteStart + 1, quoteEnd - quoteStart - 1);
}

std::optional<std::uint32_t> manifestIntValue(const std::string& manifest, const std::string& key) {
  const auto keyPosition = manifest.find("\"" + key + "\"");
  if (keyPosition == std::string::npos) {
    return std::nullopt;
  }
  const auto colonPosition = manifest.find(':', keyPosition);
  if (colonPosition == std::string::npos) {
    return std::nullopt;
  }
  const auto valueStart = manifest.find_first_of("0123456789", colonPosition + 1);
  if (valueStart == std::string::npos) {
    return std::nullopt;
  }
  const auto valueEnd = manifest.find_first_not_of("0123456789", valueStart);
  return static_cast<std::uint32_t>(std::stoul(manifest.substr(valueStart, valueEnd - valueStart)));
}

bool hasSharedLibrary(const std::filesystem::path& bundlePath) {
  std::error_code error;
  for (const auto& entry : std::filesystem::directory_iterator(bundlePath, error)) {
    if (error) {
      return false;
    }
    if (!entry.is_regular_file(error) || error) {
      continue;
    }
    const auto extension = entry.path().extension().string();
    if (extension == ".dylib" || extension == ".so") {
      return true;
    }
  }
  return false;
}

bool manifestDeclaresPlugin(const std::filesystem::path& bundlePath) {
  const auto content = readTextFile(bundlePath / "manifest.ttl");
  return content.find("lv2:Plugin") != std::string::npos;
}

std::filesystem::path canonicalPathOrInput(const std::filesystem::path& path) {
  std::error_code error;
  const auto canonical = std::filesystem::weakly_canonical(path, error);
  if (error) {
    return path;
  }
  return canonical;
}

std::filesystem::path exampleExecutablePath(
    const std::filesystem::path& bundlePath,
    const std::string& manifest) {
  const auto executableName = manifestStringValue(manifest, "executable");
  if (!executableName || executableName->empty()) {
    return {};
  }

  const auto executablePath = bundlePath / *executableName;
  std::error_code error;
  if (!std::filesystem::is_regular_file(executablePath, error) || error) {
    return {};
  }
  return canonicalPathOrInput(executablePath);
}

void applySoundBridgeManifest(NativePluginInfo& info, const std::filesystem::path& bundlePath) {
  const auto manifest = readTextFile(bundlePath / "SoundBridgePlugin.json");
  if (manifest.empty()) {
    return;
  }

  if (auto value = manifestStringValue(manifest, "pluginId")) {
    info.pluginId = *value;
  }
  if (auto value = manifestStringValue(manifest, "name")) {
    info.name = *value;
  }
  if (auto value = manifestStringValue(manifest, "vendor")) {
    info.vendor = *value;
  }
  if (auto value = manifestStringValue(manifest, "category")) {
    info.category = *value;
  }
  if (auto value = manifestStringValue(manifest, "kind")) {
    info.kind = *value;
  }
  if (auto value = manifestStringValue(manifest, "source")) {
    info.source = *value;
  }
  if (auto value = manifestIntValue(manifest, "inputs")) {
    info.inputs = *value;
  }
  if (auto value = manifestIntValue(manifest, "outputs")) {
    info.outputs = *value;
  }

  info.isExample = info.source == "example-bundle";
  info.hasManifest = true;

  if (const auto executablePath = exampleExecutablePath(bundlePath, manifest); !executablePath.empty()) {
    info.executablePath = executablePath.string();
    info.hasExecutable = true;
  }
}

} // namespace

Lv2Scanner::Lv2Scanner()
    : paths_{
          repositoryExampleLv2Path(),
          std::filesystem::path("/Library/Audio/Plug-Ins/LV2"),
          homeLibraryLv2Path(),
          homeDotLv2Path(),
          std::filesystem::path("/opt/homebrew/lib/lv2"),
          std::filesystem::path("/usr/local/lib/lv2"),
          std::filesystem::path("/usr/lib/lv2"),
      } {}

std::vector<std::filesystem::path> Lv2Scanner::searchPaths() const {
  std::vector<std::filesystem::path> paths;
  for (const auto& path : paths_) {
    if (!path.empty()) {
      paths.push_back(path);
    }
  }
  return paths;
}

std::vector<NativePluginInfo> Lv2Scanner::scan() const {
  std::vector<NativePluginInfo> plugins;

  for (const auto& root : searchPaths()) {
    std::error_code error;
    if (!std::filesystem::is_directory(root, error)) {
      continue;
    }

    for (const auto& entry : std::filesystem::directory_iterator(root, error)) {
      if (error) {
        break;
      }

      const auto path = entry.path();
      if (path.extension() != ".lv2") {
        continue;
      }

      const bool isBundle = entry.is_directory(error);
      if (error || !isBundle) {
        continue;
      }

      const bool hasManifest = std::filesystem::is_regular_file(path / "manifest.ttl", error) && !error;
      if (!hasManifest || !manifestDeclaresPlugin(path)) {
        continue;
      }

      NativePluginInfo info;
      info.pluginId = "lv2:" + path.filename().string();
      info.format = PluginFormat::Lv2;
      info.name = lv2NameFromPath(path);
      info.vendor = "Unknown";
      info.category = "LV2";
      info.kind = "unknown";
      info.bundlePath = canonicalPathOrInput(path).string();
      info.hasContents = true;
      info.hasManifest = hasManifest;
      info.hasExecutable = hasSharedLibrary(path);
      applySoundBridgeManifest(info, path);
      plugins.push_back(std::move(info));
    }
  }

  return plugins;
}

} // namespace soundbridge
