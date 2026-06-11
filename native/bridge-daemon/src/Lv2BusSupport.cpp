#include "SoundBridge/Lv2BusSupport.h"

#include <algorithm>
#include <string>
#include <utility>

namespace soundbridge::lv2_worker {
namespace {

std::string groupNameFromUri(const std::string& uri, const std::string& fallback) {
  if (uri.empty()) {
    return fallback;
  }
  const auto separator = uri.find_last_of("#/");
  auto name = separator == std::string::npos ? uri : uri.substr(separator + 1);
  if (name.empty()) {
    name = fallback;
  }
  for (auto& character : name) {
    if (character == '_' || character == '-') {
      character = ' ';
    }
  }
  return cappedString(name);
}

} // namespace

std::vector<Lv2AudioBusGroup> groupedLv2AudioBuses(
    const std::vector<Lv2Port>& ports,
    const std::vector<std::size_t>& portIndexes,
    const std::string& mainGroupUri,
    const char* mainName,
    const char* fallbackPortName) {
  std::vector<Lv2AudioBusGroup> groups;
  if (portIndexes.empty()) {
    return groups;
  }

  const bool hasDeclaredGroups = std::any_of(portIndexes.begin(), portIndexes.end(), [&](std::size_t portIndex) {
    return !ports[portIndex].groupUri.empty();
  });
  if (!hasDeclaredGroups) {
    groups.push_back(Lv2AudioBusGroup{0, mainName, portIndexes});
    for (std::size_t offset = 0; offset < portIndexes.size() && groups.size() < kMaxWorkerAudioPorts; ++offset) {
      const auto portIndex = portIndexes[offset];
      const auto fallback = std::string(fallbackPortName) + " " + std::to_string(offset + 1);
      groups.push_back(Lv2AudioBusGroup{
          static_cast<std::uint32_t>(groups.size()),
          ports[portIndex].name.empty() ? fallback : ports[portIndex].name,
          {portIndex}});
    }
    return groups;
  }

  std::vector<std::string> orderedGroupUris;
  for (const auto portIndex : portIndexes) {
    const auto& uri = ports[portIndex].groupUri;
    if (!uri.empty() && std::find(orderedGroupUris.begin(), orderedGroupUris.end(), uri) == orderedGroupUris.end()) {
      orderedGroupUris.push_back(uri);
    }
  }

  std::string effectiveMainUri = mainGroupUri;
  if (effectiveMainUri.empty() ||
      std::find(orderedGroupUris.begin(), orderedGroupUris.end(), effectiveMainUri) == orderedGroupUris.end()) {
    effectiveMainUri = orderedGroupUris.empty() ? std::string {} : orderedGroupUris.front();
  }

  auto appendGroup = [&](const std::string& uri, const std::string& name) {
    if (groups.size() >= kMaxWorkerAudioPorts) {
      return;
    }
    std::vector<std::size_t> members;
    for (const auto portIndex : portIndexes) {
      if (ports[portIndex].groupUri == uri) {
        members.push_back(portIndex);
      }
    }
    if (!members.empty()) {
      groups.push_back(Lv2AudioBusGroup{static_cast<std::uint32_t>(groups.size()), name, std::move(members)});
    }
  };

  appendGroup(effectiveMainUri, mainName);
  for (const auto& uri : orderedGroupUris) {
    if (uri != effectiveMainUri) {
      appendGroup(uri, groupNameFromUri(uri, std::string(fallbackPortName) + " Group"));
    }
  }
  for (const auto portIndex : portIndexes) {
    if (!ports[portIndex].groupUri.empty() || groups.size() >= kMaxWorkerAudioPorts) {
      continue;
    }
    groups.push_back(Lv2AudioBusGroup{
        static_cast<std::uint32_t>(groups.size()),
        ports[portIndex].name.empty() ? std::string(fallbackPortName) : ports[portIndex].name,
        {portIndex}});
  }
  return groups;
}

} // namespace soundbridge::lv2_worker
