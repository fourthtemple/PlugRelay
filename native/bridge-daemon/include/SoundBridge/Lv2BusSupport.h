#pragma once

#include "SoundBridge/Lv2HostWorkerSupport.h"

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace soundbridge::lv2_worker {

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

} // namespace soundbridge::lv2_worker
