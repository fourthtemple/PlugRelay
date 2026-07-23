#pragma once

#include "PlugRelay/Lv2HostWorkerSupport.h"

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace plugrelay::lv2_worker {

struct Lv2AudioBusGroup {
  std::uint32_t index = 0;
  std::string name;
  std::vector<std::size_t> portIndexes;
};

std::vector<Lv2AudioBusGroup> groupedLv2AudioBuses(
    const std::vector<Lv2Port>& ports,
    const std::vector<std::size_t>& portIndexes,
    const std::string& mainGroupUri,
    const char* mainName,
    const char* fallbackPortName);

std::string lv2BusLayoutsToJson(const std::vector<Lv2AudioBusGroup>& groups, const char* direction);

std::string lv2LayoutToJson(
    std::uint32_t requestedInputChannels,
    std::uint32_t requestedOutputChannels,
    std::uint32_t inputChannels,
    std::uint32_t outputChannels,
    const std::vector<Lv2AudioBusGroup>& inputBusGroups,
    const std::vector<Lv2AudioBusGroup>& outputBusGroups,
    double sampleRate,
    std::uint32_t maxBlockSize);

std::string lv2RenderedAudioToJson(
    const std::vector<std::vector<float>>& channels,
    const std::vector<Lv2AudioBusGroup>& outputBusGroups,
    const std::vector<std::size_t>& outputPortIndexes);

} // namespace plugrelay::lv2_worker
