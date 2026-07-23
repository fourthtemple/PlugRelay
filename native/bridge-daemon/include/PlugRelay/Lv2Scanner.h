#pragma once

#include "PlugRelay/NativePlugin.h"

#include <filesystem>
#include <vector>

namespace plugrelay {

class Lv2Scanner {
public:
  Lv2Scanner();

  std::vector<std::filesystem::path> searchPaths() const;
  std::vector<NativePluginInfo> scan() const;

private:
  std::vector<std::filesystem::path> paths_;
};

} // namespace plugrelay
