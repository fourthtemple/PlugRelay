#pragma once

#include "PlugRelay/NativePlugin.h"

#include <filesystem>
#include <vector>

namespace plugrelay {

class AudioUnitScanner {
public:
  AudioUnitScanner();

  std::vector<std::filesystem::path> searchPaths() const;
  std::vector<NativePluginInfo> scan() const;

private:
  std::vector<std::filesystem::path> paths_;
};

} // namespace plugrelay
