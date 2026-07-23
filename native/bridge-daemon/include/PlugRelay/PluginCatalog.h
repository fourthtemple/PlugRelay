#pragma once

#include "PlugRelay/NativePlugin.h"

#include <vector>

namespace plugrelay {

class PluginCatalog {
public:
  std::vector<NativePluginInfo> scanAll(bool includeExamples = true) const;
  std::vector<NativePluginInfo> scanExamples() const;
  std::vector<NativePluginInfo> scanFormat(PluginFormat format) const;
};

} // namespace plugrelay
