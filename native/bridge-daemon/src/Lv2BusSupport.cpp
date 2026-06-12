#include "SoundBridge/Lv2BusSupport.h"

#include "SoundBridge/NativePlugin.h"

#include <algorithm>
#include <optional>
#include <sstream>
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

std::optional<std::size_t> outputChannelOffsetForPort(
    const std::vector<std::size_t>& outputPortIndexes,
    std::size_t portIndex) {
  const auto position = std::find(outputPortIndexes.begin(), outputPortIndexes.end(), portIndex);
  if (position == outputPortIndexes.end()) {
    return std::nullopt;
  }
  return static_cast<std::size_t>(std::distance(outputPortIndexes.begin(), position));
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

std::string lv2BusLayoutsToJson(const std::vector<Lv2AudioBusGroup>& groups, const char* direction) {
  std::ostringstream output;
  output << "[";
  for (std::size_t index = 0; index < groups.size(); ++index) {
    const auto& group = groups[index];
    if (index > 0) {
      output << ",";
    }
    output << "{\"index\":" << group.index
           << ",\"direction\":\"" << direction << "\""
           << ",\"mediaType\":\"audio\""
           << ",\"name\":\"" << jsonEscape(group.name) << "\""
           << ",\"type\":\"" << (group.index == 0 ? "main" : "aux") << "\""
           << ",\"channels\":" << std::min<std::size_t>(group.portIndexes.size(), kMaxWorkerAudioPorts)
           << ",\"active\":true}";
  }
  output << "]";
  return output.str();
}

std::string lv2LayoutToJson(
    std::uint32_t requestedInputChannels,
    std::uint32_t requestedOutputChannels,
    std::uint32_t inputChannels,
    std::uint32_t outputChannels,
    const std::vector<Lv2AudioBusGroup>& inputBusGroups,
    const std::vector<Lv2AudioBusGroup>& outputBusGroups,
    double sampleRate,
    std::uint32_t maxBlockSize) {
  std::ostringstream output;
  output << "{\"requestedInputChannels\":" << requestedInputChannels
         << ",\"requestedOutputChannels\":" << requestedOutputChannels
         << ",\"inputChannels\":" << inputChannels
         << ",\"outputChannels\":" << outputChannels
         << ",\"inputBuses\":" << std::min<std::size_t>(inputBusGroups.size(), kMaxWorkerAudioPorts)
         << ",\"outputBuses\":" << std::min<std::size_t>(outputBusGroups.size(), kMaxWorkerAudioPorts)
         << ",\"inputBusLayouts\":" << lv2BusLayoutsToJson(inputBusGroups, "input")
         << ",\"outputBusLayouts\":" << lv2BusLayoutsToJson(outputBusGroups, "output")
         << ",\"sampleRate\":" << sampleRate
         << ",\"maxBlockSize\":" << maxBlockSize
         << "}";
  return output.str();
}

std::string lv2RenderedAudioToJson(
    const std::vector<std::vector<float>>& channels,
    const std::vector<Lv2AudioBusGroup>& outputBusGroups,
    const std::vector<std::size_t>& outputPortIndexes) {
  const auto channelsJson = audioChannelsToJson(channels);
  std::ostringstream output;
  output << "{\"channels\":" << channelsJson << ",\"outputBuses\":[";
  for (std::size_t busIndex = 0; busIndex < outputBusGroups.size(); ++busIndex) {
    const auto& bus = outputBusGroups[busIndex];
    if (busIndex > 0) {
      output << ",";
    }
    std::vector<std::vector<float>> busChannels;
    for (const auto portIndex : bus.portIndexes) {
      const auto channelOffset = outputChannelOffsetForPort(outputPortIndexes, portIndex);
      if (channelOffset && *channelOffset < channels.size()) {
        busChannels.push_back(channels[*channelOffset]);
      }
    }
    output << "{\"index\":" << bus.index << ",\"channels\":" << audioChannelsToJson(busChannels) << "}";
  }
  output << "]}";
  return output.str();
}

} // namespace soundbridge::lv2_worker
