#include "SoundBridge/Vst3Scanner.h"

#ifdef SOUNDBRIDGE_MACOS
#include <CoreFoundation/CoreFoundation.h>
#endif

#ifdef SOUNDBRIDGE_ENABLE_VST3_SDK
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "public.sdk/source/vst/hosting/module.h"
#endif

#include <algorithm>
#include <cctype>
#include <cerrno>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <optional>
#include <sstream>
#include <utility>

namespace soundbridge {

namespace {

constexpr std::size_t kMaxVst3MetadataTextBytes = 256;

std::filesystem::path homeLibraryVst3Path() {
  const char* home = std::getenv("HOME");
  if (home == nullptr || std::string(home).empty()) {
    return {};
  }
  return std::filesystem::path(home) / "Library" / "Audio" / "Plug-Ins" / "VST3";
}

std::filesystem::path repositoryExampleVst3Path() {
#ifdef SOUNDBRIDGE_SOURCE_DIR
  return std::filesystem::path(SOUNDBRIDGE_SOURCE_DIR) / "native" / "example-plugins" / "VST3";
#else
  return {};
#endif
}

std::string bundleNameFromPath(const std::filesystem::path& path) {
  auto name = path.stem().string();
  return name.empty() ? path.filename().string() : name;
}

std::string trim(std::string value) {
  value.erase(
      value.begin(),
      std::find_if(value.begin(), value.end(), [](unsigned char character) {
        return !std::isspace(character);
      }));
  value.erase(
      std::find_if(value.rbegin(), value.rend(), [](unsigned char character) {
        return !std::isspace(character);
      }).base(),
      value.end());
  return value;
}

std::string capText(std::string value, std::size_t maxBytes = kMaxVst3MetadataTextBytes) {
  value = trim(std::move(value));
  if (value.size() <= maxBytes) {
    return value;
  }
  value.resize(maxBytes);
  while (!value.empty() && (static_cast<unsigned char>(value.back()) & 0xC0U) == 0x80U) {
    value.pop_back();
  }
  return value;
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
  const auto text = manifest.substr(valueStart, valueEnd - valueStart);
  char* end = nullptr;
  errno = 0;
  const auto value = std::strtoul(text.c_str(), &end, 10);
  if (end == text.c_str() || *end != '\0' || errno == ERANGE || value > 32) {
    return std::nullopt;
  }
  return static_cast<std::uint32_t>(value);
}

void applySoundBridgeManifest(NativePluginInfo& info, const std::filesystem::path& bundlePath) {
  const auto manifestPath = bundlePath / "Contents" / "Resources" / "SoundBridgePlugin.json";
  const auto manifest = readTextFile(manifestPath);
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
}

std::filesystem::path macBinaryPath(const std::filesystem::path& bundlePath) {
  const auto macosPath = bundlePath / "Contents" / "MacOS";
  std::error_code error;
  if (!std::filesystem::is_directory(macosPath, error)) {
    return {};
  }

  for (const auto& entry : std::filesystem::directory_iterator(macosPath, error)) {
    if (error) {
      return {};
    }
    if (entry.is_regular_file(error) && !error) {
      return entry.path();
    }
  }

  return {};
}

#ifdef SOUNDBRIDGE_MACOS
std::string cfStringToUtf8(CFStringRef value) {
  if (value == nullptr) {
    return {};
  }

  char buffer[1024] = {};
  if (CFStringGetCString(value, buffer, sizeof(buffer), kCFStringEncodingUTF8)) {
    return buffer;
  }

  const auto length = CFStringGetLength(value);
  const auto maxSize = CFStringGetMaximumSizeForEncoding(length, kCFStringEncodingUTF8) + 1;
  std::string output(static_cast<std::size_t>(maxSize), '\0');
  if (!CFStringGetCString(value, output.data(), maxSize, kCFStringEncodingUTF8)) {
    return {};
  }
  output.resize(std::char_traits<char>::length(output.c_str()));
  return output;
}

std::string dictionaryStringValue(CFDictionaryRef dictionary, CFStringRef key) {
  const auto value = CFDictionaryGetValue(dictionary, key);
  if (value == nullptr || CFGetTypeID(value) != CFStringGetTypeID()) {
    return {};
  }
  return cfStringToUtf8(static_cast<CFStringRef>(value));
}

std::string vendorFromCopyright(std::string copyright) {
  copyright = trim(std::move(copyright));
  if (copyright.empty()) {
    return {};
  }

  const auto copyrightPosition = copyright.find("Copyright");
  if (copyrightPosition != std::string::npos) {
    copyright.erase(copyrightPosition, std::string("Copyright").size());
  }
  copyright.erase(
      std::remove_if(
          copyright.begin(),
          copyright.end(),
          [](unsigned char character) {
            return character == 0xC2 || character == 0xA9;
          }),
      copyright.end());
  return trim(copyright);
}

std::string capitalizeVendorToken(std::string value) {
  value = trim(std::move(value));
  if (value.empty()) {
    return {};
  }
  value[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(value[0])));
  return value;
}

std::string vendorFromBundleIdentifier(const std::string& identifier) {
  const std::string prefix = "com.";
  if (identifier.rfind(prefix, 0) != 0) {
    return {};
  }

  const auto vendorStart = prefix.size();
  const auto vendorEnd = identifier.find('.', vendorStart);
  if (vendorEnd == std::string::npos || vendorEnd <= vendorStart) {
    return {};
  }

  return capitalizeVendorToken(identifier.substr(vendorStart, vendorEnd - vendorStart));
}

void applyInfoPlistMetadata(NativePluginInfo& info, const std::filesystem::path& bundlePath) {
  const auto plistPath = bundlePath / "Contents" / "Info.plist";
  const auto plistPathText = plistPath.string();
  CFURLRef url = CFURLCreateFromFileSystemRepresentation(
      kCFAllocatorDefault,
      reinterpret_cast<const UInt8*>(plistPathText.c_str()),
      plistPathText.size(),
      false);
  if (url == nullptr) {
    return;
  }

  CFReadStreamRef stream = CFReadStreamCreateWithFile(kCFAllocatorDefault, url);
  CFRelease(url);
  if (stream == nullptr) {
    return;
  }

  if (!CFReadStreamOpen(stream)) {
    CFRelease(stream);
    return;
  }

  CFPropertyListRef propertyList = CFPropertyListCreateWithStream(
      kCFAllocatorDefault,
      stream,
      0,
      kCFPropertyListImmutable,
      nullptr,
      nullptr);
  CFReadStreamClose(stream);
  CFRelease(stream);
  if (propertyList == nullptr) {
    return;
  }

  if (CFGetTypeID(propertyList) != CFDictionaryGetTypeID()) {
    CFRelease(propertyList);
    return;
  }

  const auto dictionary = static_cast<CFDictionaryRef>(propertyList);
  if (const auto displayName = dictionaryStringValue(dictionary, CFSTR("CFBundleDisplayName")); !displayName.empty()) {
    info.name = displayName;
  } else if (const auto bundleName = dictionaryStringValue(dictionary, CFSTR("CFBundleName")); !bundleName.empty()) {
    info.name = bundleName;
  }

  if (const auto identifier = dictionaryStringValue(dictionary, CFSTR("CFBundleIdentifier")); !identifier.empty()) {
    info.bundleIdentifier = identifier;
  }
  if (const auto version = dictionaryStringValue(dictionary, CFSTR("CFBundleShortVersionString")); !version.empty()) {
    info.version = version;
  } else if (const auto bundleVersion = dictionaryStringValue(dictionary, CFSTR("CFBundleVersion")); !bundleVersion.empty()) {
    info.version = bundleVersion;
  }
  if (const auto vendor = vendorFromCopyright(dictionaryStringValue(dictionary, CFSTR("NSHumanReadableCopyright"))); !vendor.empty()) {
    info.vendor = vendor;
  } else if (info.vendor == "Unknown") {
    if (const auto vendorFromIdentifier = vendorFromBundleIdentifier(info.bundleIdentifier); !vendorFromIdentifier.empty()) {
      info.vendor = vendorFromIdentifier;
    }
  }

  CFRelease(propertyList);
}
#endif

#ifdef SOUNDBRIDGE_ENABLE_VST3_SDK
std::string kindFromVst3SubCategories(const VST3::Hosting::ClassInfo& classInfo) {
  const auto& subCategories = classInfo.subCategories();
  const auto hasPrefix = [&](const std::string& prefix) {
    return std::any_of(subCategories.begin(), subCategories.end(), [&](const std::string& value) {
      return value == prefix || value.rfind(prefix + "|", 0) == 0;
    });
  };

  if (hasPrefix("Instrument")) {
    return "instrument";
  }
  if (hasPrefix("Fx")) {
    return "effect";
  }
  return "unknown";
}

bool applyVst3FactoryMetadata(NativePluginInfo& info) {
  if (!info.hasExecutable || info.bundlePath.empty()) {
    return false;
  }

  std::string loadError;
  auto module = VST3::Hosting::Module::create(info.bundlePath, loadError);
  if (!module) {
    return false;
  }

  const auto classes = module->getFactory().classInfos();
  const auto audioClass = std::find_if(classes.begin(), classes.end(), [](const auto& classInfo) {
    return classInfo.category() == kVstAudioEffectClass;
  });
  if (audioClass == classes.end()) {
    return false;
  }

  if (const auto name = capText(audioClass->name()); !name.empty()) {
    info.name = name;
  }
  if (const auto vendor = capText(audioClass->vendor()); !vendor.empty()) {
    info.vendor = vendor;
  }
  if (const auto version = capText(audioClass->version(), 80); !version.empty()) {
    info.version = version;
  }
  if (const auto category = capText(audioClass->subCategoriesString()); !category.empty()) {
    info.category = category;
  }
  if (const auto kind = kindFromVst3SubCategories(*audioClass); kind != "unknown") {
    info.kind = kind;
  }
  return true;
}
#endif

std::string factoryMetadataErrorToJson(const std::string& code, const std::string& message) {
  std::ostringstream output;
  output << "{";
  output << "\"ok\":false,";
  output << "\"error\":\"" << jsonEscape(code) << "\",";
  output << "\"message\":\"" << jsonEscape(message) << "\"";
  output << "}";
  return output.str();
}

} // namespace

Vst3Scanner::Vst3Scanner()
    : paths_{
          repositoryExampleVst3Path(),
          std::filesystem::path("/Library/Audio/Plug-Ins/VST3"),
          homeLibraryVst3Path(),
      } {}

std::vector<std::filesystem::path> Vst3Scanner::searchPaths() const {
  std::vector<std::filesystem::path> paths;
  for (const auto& path : paths_) {
    if (!path.empty()) {
      paths.push_back(path);
    }
  }
  return paths;
}

std::vector<NativePluginInfo> Vst3Scanner::scan() const {
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
      if (path.extension() != ".vst3") {
        continue;
      }

      const bool isBundle = entry.is_directory(error);
      if (error || !isBundle) {
        continue;
      }

      NativePluginInfo info;
      info.pluginId = "vst3:" + path.filename().string();
      info.format = PluginFormat::Vst3;
      info.name = bundleNameFromPath(path);
      info.vendor = "Unknown";
      info.category = "VST3";
      info.kind = "unknown";
      info.bundlePath = std::filesystem::weakly_canonical(path, error).string();
      if (error) {
        info.bundlePath = path.string();
        error.clear();
      }
      info.hasContents = std::filesystem::is_directory(path / "Contents", error) && !error;
      auto executablePath = macBinaryPath(path);
      info.hasExecutable = !executablePath.empty();
      if (info.hasExecutable) {
        info.executablePath = std::filesystem::weakly_canonical(executablePath, error).string();
        if (error) {
          info.executablePath = executablePath.string();
          error.clear();
        }
      }
#ifdef SOUNDBRIDGE_MACOS
      applyInfoPlistMetadata(info, path);
#endif
      applySoundBridgeManifest(info, path);
      plugins.push_back(std::move(info));
    }
  }

  return plugins;
}

std::string vst3BundleListToJson(const std::vector<NativePluginInfo>& plugins) {
  return nativePluginListToJson(plugins);
}

std::string vst3FactoryMetadataToJson(const std::filesystem::path& bundlePath) {
#ifndef SOUNDBRIDGE_ENABLE_VST3_SDK
  (void)bundlePath;
  return factoryMetadataErrorToJson("vst3_sdk_unavailable", "The VST3 SDK host adapter is not available in this build.");
#else
  std::error_code error;
  if (bundlePath.empty() || bundlePath.extension() != ".vst3" || !std::filesystem::is_directory(bundlePath, error)) {
    return factoryMetadataErrorToJson("invalid_bundle", "Expected a readable .vst3 bundle directory.");
  }
  if (error) {
    return factoryMetadataErrorToJson("invalid_bundle", "Could not inspect the requested .vst3 bundle.");
  }

  NativePluginInfo info;
  info.pluginId = "vst3:" + bundlePath.filename().string();
  info.format = PluginFormat::Vst3;
  info.name = bundleNameFromPath(bundlePath);
  info.vendor = "Unknown";
  info.category = "VST3";
  info.kind = "unknown";
  info.bundlePath = std::filesystem::weakly_canonical(bundlePath, error).string();
  if (error) {
    info.bundlePath = bundlePath.string();
    error.clear();
  }
  const auto executablePath = macBinaryPath(bundlePath);
  info.hasExecutable = !executablePath.empty();
  if (!applyVst3FactoryMetadata(info)) {
    return factoryMetadataErrorToJson("factory_metadata_unavailable", "VST3 factory metadata was not available.");
  }

  std::ostringstream output;
  output << "{";
  output << "\"ok\":true,";
  output << "\"plugin\":{";
  output << "\"name\":\"" << jsonEscape(info.name) << "\",";
  output << "\"vendor\":\"" << jsonEscape(info.vendor) << "\",";
  output << "\"category\":\"" << jsonEscape(info.category) << "\",";
  output << "\"kind\":\"" << jsonEscape(info.kind) << "\",";
  output << "\"metadata\":{";
  if (!info.version.empty()) {
    output << "\"version\":\"" << jsonEscape(info.version) << "\"";
  }
  output << "}";
  output << "}";
  output << "}";
  return output.str();
#endif
}

} // namespace soundbridge
