#pragma once

#include "SoundBridge/NativePlugin.h"

#include <vector>

namespace soundbridge {

class PluginCatalog {
public:
  std::vector<NativePluginInfo> scanAll(bool includeExamples = true) const;
  std::vector<NativePluginInfo> scanExamples() const;
  std::vector<NativePluginInfo> scanFormat(PluginFormat format) const;
};

} // namespace soundbridge
