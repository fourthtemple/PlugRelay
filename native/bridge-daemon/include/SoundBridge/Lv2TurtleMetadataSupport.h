#pragma once

#include "SoundBridge/NativePlugin.h"

#include <filesystem>
#include <optional>
#include <string>

namespace soundbridge {

std::string stripLv2TurtleComments(const std::string& input);
std::optional<std::string> firstLv2PluginUri(const std::string& text);
std::filesystem::path canonicalPathOrInput(const std::filesystem::path& path);
std::filesystem::path lv2BundleLocalRegularFile(
    const std::filesystem::path& bundlePath,
    const std::string& relativeText);
std::filesystem::path lv2BinaryPath(const std::filesystem::path& bundlePath, const std::string& manifest);
void applyLv2TurtleMetadata(
    NativePluginInfo& info,
    const std::filesystem::path& bundlePath,
    const std::string& manifest);

} // namespace soundbridge
